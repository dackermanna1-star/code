// Weapons: firearms, melee, shove/stomp, throwables (projectiles), reloads.
import * as THREE from 'three';
import { getItemDef, createItem } from '../items/items.js';
import { raycast } from '../world/raycast.js';
import { BLOCKS, B, SOLID } from '../world/blocks.js';
import { clamp } from '../core/rng.js';
import { createEntityMaterial, setEntityLight } from '../render/materials.js';

const FISTS = 'fists';
const v1 = new THREE.Vector3(), v2 = new THREE.Vector3(), v3 = new THREE.Vector3();

function bulletFilter(id, d) { return (d.solid || d.opaque) && d.render !== 'cross'; }

export class Combat {
  constructor(game) {
    this.game = game;
    this.cooldown = 0;
    this.pendingHits = [];
    this.reload = null; // {kind, t, dur, stack, def, phase, inserts}
    this.shoveT = 0;
    this.heldKey = null;
    this.triggerHeld = false;
    this.burst = 0;
    this.recoilAccum = 0;
    this.projectiles = [];
    this.flares = [];
    this.smokes = [];
    this.lastShotT = 0;
    this.aimT = 0;
  }

  get stack() { return this.game.player.inv.selectedStack; }
  get def() { const s = this.stack; return s ? getItemDef(s.id) : getItemDef(FISTS); }

  /** Called when the held item may have changed. */
  syncHeld() {
    const s = this.stack;
    const key = s ? s.id + ':' + (s.uid || '') : 'none';
    if (key !== this.heldKey || s !== this.heldStack) {
      this.heldKey = key;
      this.heldStack = s;
      this.cancelReload();
      this.pendingHits.length = 0;
      this.game.viewmodel?.setItem(s || null);
      this.cooldown = Math.max(this.cooldown, 0.35);
      const def = this.def;
      if (s) this.game.audio.play('equip', { volume: 0.5 });
      this.game.hud.heldName = s ? def.name : null;
    }
  }

  cancelReload() {
    if (this.reload) { this.reload = null; this.game.viewmodel?.cancel(); this.game.hud.progress = null; }
  }

  update(dt, input) {
    const g = this.game, p = g.player;
    this.syncHeld();
    this.cooldown -= dt;
    this.shoveT -= dt;
    const def = this.def, stack = this.stack;
    const busy = g.actionBusy;

    // aim (RMB) for firearms; shove for melee
    const fa = def.firearm;
    p.aiming = !!(fa && input.aim && !p.sprinting && !this.reload && !busy);
    this.aimT = clamp(this.aimT + (p.aiming ? dt : -dt) * 5, 0, 1);
    p.scopeActive = !!(fa && fa.scope && this.aimT > 0.85);
    p.fovKick = p.aiming ? -(75 - (fa.aimFov || 55)) * this.aimT : 0;

    // pending melee impacts
    for (let i = this.pendingHits.length - 1; i >= 0; i--) {
      const h = this.pendingHits[i];
      h.t -= dt;
      if (h.t <= 0) { this.pendingHits.splice(i, 1); this.resolveMelee(h); }
    }

    // reload progress
    if (this.reload) this.updateReload(dt);

    if (busy || p.dead) { this.triggerHeld = false; this.updateProjectiles(dt); return; }

    // shove
    if (input.shovePressed || (input.aimPressed && !fa && !def.throwable)) this.doShove();

    // fire mode toggle
    if (input.modePressed && fa && fa.modes && fa.modes.length > 1 && stack) {
      const i = fa.modes.indexOf(stack.mode || fa.modes[0]);
      stack.mode = fa.modes[(i + 1) % fa.modes.length];
      g.audio.play('cock', { volume: 0.4 });
      g.ui?.toast('Fire mode: ' + stack.mode.toUpperCase());
    }

    if (input.reloadPressed && fa && stack) this.startReload(stack, def);

    // attack
    const attack = input.attack;
    const pressed = input.attackPressed;
    if (fa && stack) {
      const mode = stack.mode || (fa.modes ? fa.modes[0] : 'semi');
      const wants = mode === 'auto' ? attack : pressed;
      if (wants && this.reload && (this.reload.kind === 'shell' || this.reload.kind === 'single') && stack.ammo > 0) this.cancelReload();
      if (wants && !this.reload && this.cooldown <= 0 && !p.sprinting) this.fireGun(stack, def);
    } else if (def.throwable && stack) {
      if (pressed && this.cooldown <= 0) this.throwItem(stack, def);
    } else if (pressed || (attack && this.cooldown <= 0 && def.melee)) {
      if (this.cooldown <= 0) {
        if (p.pitch < -0.75 && this.findStompTarget()) this.doStomp();
        else this.swing(stack, def.melee ? def : getItemDef(FISTS), input.heavy);
      }
    }
    if (input.throwPressed) {
      // G: throw the first throwable found in the hotbar
      const idx = p.inv.hotbar.findIndex((s) => s && getItemDef(s.id).throwable);
      if (idx >= 0 && this.cooldown <= 0) this.throwItem(p.inv.hotbar[idx], getItemDef(p.inv.hotbar[idx].id));
    }
    this.updateProjectiles(dt);

    // HUD
    if (fa && stack) {
      const reserve = p.inv.count((s) => fa.ammo.includes(s.id));
      g.hud.ammo = { loaded: stack.ammo || 0, reserve, mode: stack.mode || 'semi', name: def.name, jammed: !!stack.jammed };
    } else g.hud.ammo = null;
    g.hud.durability = stack && def.durability ? clamp((stack.dur ?? def.durability) / def.durability, 0, 1) : null;
  }

  // ------------------------------------------------------------------ firearms
  spreadFor(def) {
    const p = this.game.player, fa = def.firearm;
    let s = p.aiming ? (fa.adsSpread ?? fa.spread * 0.3) : fa.spread;
    s *= 1 + p.moving01 * (p.aiming ? 0.6 : 1.2);
    if (p.crouching) s *= 0.75;
    if (!p.onGround) s *= 2;
    s *= 1 - p.skillLevel('aiming') * 0.045;
    s *= 1 + p.panic / 110 + p.pain / 160 + p.drunk / 70;
    s += this.recoilAccum * 0.01;
    return s;
  }

  fireGun(stack, def) {
    const g = this.game, p = g.player, fa = def.firearm;
    if (stack.jammed) { g.audio.play('dry_fire'); this.cooldown = 0.3; g.ui?.toast('Weapon jammed! Press R to clear.', 'warn'); return; }
    if (!stack.ammo) {
      g.audio.play('dry_fire');
      this.cooldown = 0.25;
      if (p.inv.has((s) => fa.ammo.includes(s.id))) this.startReload(stack, def);
      return;
    }
    if (def.durability && stack.dur <= 0) { g.audio.play('dry_fire'); g.ui?.toast('This gun is too damaged to fire.', 'warn'); this.cooldown = 0.4; return; }
    stack.ammo--;
    const mode = stack.mode || (fa.modes ? fa.modes[0] : 'semi');
    this.cooldown = 1 / (fa.fireRate || 3);
    // durability & jams
    if (def.durability) {
      stack.dur = Math.max(0, stack.dur - (fa.durabilityLoss ?? 0.35) * (1 - p.skillLevel('maintenance') * 0.05));
      const cond = stack.dur / def.durability;
      const jam = (fa.jam || 0.002) * (1 + (1 - cond) * 6) + (cond < 0.4 ? (0.4 - cond) * 0.1 : 0);
      if (Math.random() < jam) stack.jammed = true;
    }
    const round = stack.ammoType ? getItemDef(stack.ammoType).round : null;
    const pellets = round?.pellets ?? fa.pellets ?? 1;
    const dmg = round?.damage ?? fa.damage;
    const cam = g.renderer.camera;
    const origin = v1.copy(cam.position);
    const fwd = p.forward(v2);
    const spread = this.spreadFor(def) * (round?.spreadMult ?? 1);
    const supDef = stack.data?.suppressor ? getItemDef(stack.data.suppressor) : null;
    const noiseMult = fa.suppressed ? 0.25 : supDef ? supDef.attachment?.noiseMult ?? 0.3 : 1;
    const suppressed = noiseMult < 0.6;
    for (let i = 0; i < pellets; i++) {
      const dir = v3.copy(fwd);
      const a = Math.random() * Math.PI * 2, r = Math.sqrt(Math.random()) * spread * (pellets > 1 && !p.aiming ? 1.25 : 1) + (pellets > 1 ? 0.035 : 0);
      const right = new THREE.Vector3(Math.cos(p.yaw), 0, -Math.sin(p.yaw));
      const up = new THREE.Vector3().crossVectors(right, dir).normalize();
      dir.addScaledVector(right, Math.cos(a) * r).addScaledVector(up, Math.sin(a) * r).normalize();
      this.shootRay(origin.clone(), dir.clone(), (round?.range || fa.range || 60) * 1.8, dmg, def, { pellet: pellets > 1, pierce: (fa.penetration || (dmg > 60 && pellets === 1 ? 1 : 0)), recover: fa.recover ? stack.ammoType : null, recoverChance: fa.recover });
    }
    // recoil
    const rec = (fa.recoil || 2) * (Math.PI / 180) * (1 - p.skillLevel('aiming') * 0.04) * (p.crouching ? 0.8 : 1) * (p.aiming ? 0.8 : 1);
    p.addPunch(rec * 9, (Math.random() - 0.5) * rec * 5);
    p.pitch = clamp(p.pitch + rec * 0.45, -1.55, 1.55);
    p.yaw += (Math.random() - 0.5) * rec * 0.3;
    this.recoilAccum = Math.min(8, this.recoilAccum + (fa.recoil || 2) * 0.6);
    g.viewmodel?.fire(1);
    // sound, flash, noise
    const sound = suppressed ? 'gun_suppressed' : fa.sound || 'gun_pistol';
    g.audio.play(sound, { volume: 1 });
    const muzzle = g.viewmodel?.getMuzzleWorldPosition ? g.viewmodel.getMuzzleWorldPosition(cam, new THREE.Vector3()) : origin.clone().addScaledVector(fwd, 0.8);
    if (!suppressed) g.addFlashLight(muzzle, 0xffc070, 3.2, 14, 0.06);
    // the view model draws its own flash; only a faint wisp of world smoke well in front of the barrel
    g.fx?.dust?.(muzzle.clone().addScaledVector(fwd, 1.4), [0.6, 0.6, 0.6], 0.35);
    if (fa.reload !== 'break' && fa.reload !== 'shell' || def.id.includes('shotgun_pump')) {
      // casings
      if (!def.id.includes('revolver') && !def.id.includes('double') && !def.id.includes('sawed') && !def.id.includes('bow')) {
        const right = new THREE.Vector3(Math.cos(p.yaw), 0, -Math.sin(p.yaw));
        const delay = mode === 'pump' || mode === 'bolt' ? 0.35 : 0;
        setTimeout(() => g.fx?.shell(muzzle.clone().addScaledVector(fwd, -0.3), right.clone().add(new THREE.Vector3(0, 0.6, 0)), def.id.includes('shotgun') ? 'shotgun' : fa.damage > 45 ? 'rifle' : 'pistol'), delay * 1000);
      }
    }
    const noise = (fa.noise || 50) * noiseMult;
    g.noise(p.x, p.y + 1.5, p.z, noise, 'gunshot', true);
    if (noise > 40) g.audio.setAmbience?.({ tinnitus: 0 });
    if (mode === 'pump') { setTimeout(() => { g.viewmodel?.pump(); g.audio.play('pump', { volume: 0.8 }); }, 180); }
    if (mode === 'bolt') { setTimeout(() => { g.viewmodel?.bolt(); g.audio.play('bolt', { volume: 0.8 }); }, 200); }
    if (supDef && supDef.attachment?.uses) {
      stack.data.suppressorUses = (stack.data.suppressorUses ?? supDef.attachment.uses) - 1;
      if (stack.data.suppressorUses <= 0) { delete stack.data.suppressor; delete stack.data.suppressorUses; g.ui?.toast(`The ${supDef.name} fell apart.`, 'warn'); }
    }
    p.addXP('aiming', 1.2);
    this.lastShotT = g.clock;
    g.player.inv.changed();
  }

  /** One bullet / pellet */
  shootRay(origin, dir, maxDist, dmg, def, o = {}) {
    const g = this.game, w = g.world;
    let pierce = o.pierce || 0;
    let travelled = 0;
    const hitZombies = new Set();
    for (let seg = 0; seg < 4; seg++) {
      const bh = raycast(w, origin.x, origin.y, origin.z, dir.x, dir.y, dir.z, maxDist - travelled, bulletFilter);
      const blockDist = bh ? bh.dist : maxDist - travelled;
      // zombies
      let best = null;
      for (const z of g.zombies.zombies) {
        if (z.dead || hitZombies.has(z)) continue;
        const dx = z.x - origin.x, dz = z.z - origin.z, dy = z.y + 1 - origin.y;
        const along = dx * dir.x + dy * dir.y + dz * dir.z;
        if (along < 0 || along > blockDist + 1) continue;
        const perp2 = dx * dx + dy * dy + dz * dz - along * along;
        if (perp2 > 2.2) continue;
        const h = z.visual.raycast(origin, dir, blockDist);
        if (h && (!best || h.distance < best.h.distance)) best = { z, h };
      }
      const vh = g.raycastVehicles(origin, dir, blockDist);
      if (best && (!vh || best.h.distance < vh.dist)) {
        const { z, h } = best;
        hitZombies.add(z);
        const dist = travelled + h.distance;
        const fall = dist > (def.firearm?.range || 60) ? clamp(1 - (dist - def.firearm.range) / (def.firearm.range * 1.5), 0.25, 1) : 1;
        this.damageZombie(z, dmg * fall, h.part, h.point, dir, def, { bullet: true, pellet: o.pellet });
        if (o.recover && Math.random() < (o.recoverChance || 0.5)) g.groundItems.add(createItem(o.recover), z.x, z.y + 0.5, z.z);
        if (pierce-- > 0) { origin = h.point.clone().addScaledVector(dir, 0.3); travelled = dist; continue; }
        return;
      }
      if (vh) {
        g.fx?.impact(vh.point, dir.clone().negate(), 'metal', { decal: false });
        g.audio.play('bullet_impact_metal', { pos: vh.point });
        g.vehicles?.onShot(vh.v);
        return;
      }
      if (!bh) return;
      const d = BLOCKS[bh.id];
      const pos = new THREE.Vector3(bh.px, bh.py, bh.pz);
      const n = new THREE.Vector3(bh.nx, bh.ny, bh.nz);
      if (d.mat === 'glass') {
        g.damageBlock(bh.x, bh.y, bh.z, 50, { tool: 'bullet' });
        origin = pos.addScaledVector(dir, 0.05);
        travelled += bh.dist;
        continue;
      }
      g.fx?.impact(pos, n, d.mat);
      if (o.recover && Math.random() < (o.recoverChance || 0.5)) g.groundItems.add(createItem(o.recover), pos.x + n.x * 0.2, pos.y + n.y * 0.2, pos.z + n.z * 0.2);
      if (Math.random() < 0.35) g.audio.play(d.mat === 'metal' ? 'bullet_impact_metal' : 'bullet_impact', { pos, volume: 0.6 });
      if (d.hp || d.door) g.damageBlock(bh.x, bh.y, bh.z, dmg * 0.35, { tool: 'bullet' });
      return;
    }
  }

  damageZombie(z, dmg, part, point, dir, def, o = {}) {
    const g = this.game, p = g.player;
    const isHead = part === 'head';
    const melee = def.melee;
    const res = z.takeDamage(dmg, {
      part, point, dir: dir.clone().setY(0).normalize(),
      headMult: melee ? melee.headMult ?? (melee.type === 'stab' ? 3 : 2.4) : 3.5,
      knockback: melee ? (melee.knockback ?? 0.5) * (1 + p.skillLevel('strength') * 0.05) * (o.heavy ? 1.4 : 1) : (dmg > 60 ? 0.7 : dmg > 30 ? 0.25 : 0.1),
      knockdown: melee ? (melee.knockdown || 0) * (o.heavy ? 1.6 : 1) : dmg > 80 ? 0.35 : 0,
      gib: isHead && (dmg >= 70 || (def.melee && def.melee.type === 'heavy')),
      force: o.bullet ? dmg / 30 : 0,
      pierceArmor: !melee && dmg > 70,
    });
    // blood
    const bp = point || new THREE.Vector3(z.x, z.y + 1.2, z.z);
    g.fx?.blood(bp, dir, isHead ? 1.6 : o.pellet ? 0.5 : 1);
    if (o.bullet) {
      // splatter on the wall behind
      const bh = raycast(g.world, bp.x, bp.y, bp.z, dir.x, dir.y, dir.z, 3.5, bulletFilter);
      if (bh) g.fx?.bloodSplat(new THREE.Vector3(bh.px, bh.py, bh.pz), new THREE.Vector3(bh.nx, bh.ny, bh.nz), isHead ? 1.4 : 0.9);
    }
    if (melee) {
      g.audio.play(isHead && res.killed ? 'headshot' : melee.type === 'blade' || melee.type === 'stab' ? 'hit_blade' : 'hit_blunt', { pos: bp, volume: 0.9 });
      g.audio.play(dmg > 35 ? 'hit_flesh_heavy' : 'hit_flesh', { pos: bp, volume: 0.8 });
      g.player.shake = Math.max(g.player.shake, 0.18);
    } else {
      g.audio.play(isHead ? 'headshot' : 'hit_flesh', { pos: bp, volume: o.pellet ? 0.45 : 0.9 });
    }
    g.ui?.hitMarker(res.killed ? (isHead ? 'headshot' : 'kill') : 'hit');
    if (res.killed) {
      if (isHead) p.headshots = (p.headshots || 0) + 1;
      p.addXP(melee ? 'melee' : 'aiming', 6);
    }
    return res;
  }

  startReload(stack, def) {
    const g = this.game, p = g.player, fa = def.firearm;
    if (this.reload) return;
    if (stack.jammed) {
      this.reload = { kind: 'unjam', t: 0, dur: 0.9, stack, def };
      g.viewmodel?.reloadStart('unjam', 0.9);
      g.audio.play('gun_jam', { volume: 0.7 });
      return;
    }
    if ((stack.ammo || 0) >= fa.magSize) return;
    // pick ammo type
    let type = stack.ammoType && p.inv.has(stack.ammoType) ? stack.ammoType : fa.ammo.find((a) => p.inv.has(a));
    if (!type) { g.ui?.toast('No ammo for ' + def.name, 'warn'); g.audio.play('dry_fire'); return; }
    if (stack.ammo > 0 && stack.ammoType && type !== stack.ammoType && fa.reload === 'mag') type = stack.ammoType;
    const speed = 1 - p.skillLevel('aiming') * 0.04;
    const kind = fa.reload || 'mag';
    if (kind === 'mag') {
      const dur = (fa.reloadTime || 2) * speed;
      this.reload = { kind, t: 0, dur, stack, def, type };
      g.viewmodel?.reloadStart('mag', dur);
      g.audio.play('reload_mag_out', { volume: 0.8 });
      setTimeout(() => this.reload && this.reload.stack === stack && g.audio.play('reload_mag_in', { volume: 0.8 }), dur * 600);
    } else if (kind === 'break') {
      const dur = (fa.reloadTime || 2.2) * speed;
      this.reload = { kind, t: 0, dur, stack, def, type };
      g.viewmodel?.reloadStart('break', dur);
      g.audio.play('break_open', { volume: 0.8 });
    } else {
      const shell = (fa.shellTime || 0.55) * speed;
      this.reload = { kind, t: 0, dur: 0.35, stack, def, type, shell, phase: 'start' };
      g.viewmodel?.reloadStart(kind, shell * (fa.magSize - (stack.ammo || 0)) + 0.6);
    }
  }

  updateReload(dt) {
    const g = this.game, p = g.player;
    const r = this.reload;
    if (r.stack !== this.stack) { this.cancelReload(); return; }
    r.t += dt;
    const fa = r.def.firearm;
    g.hud.progress = r.kind === 'shell' || r.kind === 'single' ? null : { label: r.kind === 'unjam' ? 'Clearing jam' : 'Reloading', t: clamp(r.t / r.dur, 0, 1) };
    if (r.kind === 'unjam') {
      if (r.t >= r.dur) { r.stack.jammed = false; g.audio.play('cock'); this.reload = null; g.hud.progress = null; g.viewmodel?.reloadEnd(); }
      return;
    }
    if (r.kind === 'mag' || r.kind === 'break') {
      if (r.t >= r.dur) {
        const need = fa.magSize - (r.stack.ammo || 0);
        const got = p.inv.remove(r.type, need);
        r.stack.ammo = (r.stack.ammo || 0) + got;
        r.stack.ammoType = r.type;
        if (r.kind === 'break') g.audio.play('break_close', { volume: 0.8 });
        else g.audio.play('cock', { volume: 0.6 });
        g.viewmodel?.reloadEnd();
        this.reload = null;
        g.hud.progress = null;
        p.addXP('aiming', 0.5);
        p.inv.changed();
      }
      return;
    }
    // shell by shell
    if (r.t >= r.dur) {
      if ((r.stack.ammo || 0) >= fa.magSize || !p.inv.has(r.type)) {
        g.viewmodel?.reloadEnd();
        if (fa.modes?.includes('pump')) { g.audio.play('pump'); g.viewmodel?.pump?.(); }
        if (fa.modes?.includes('bolt')) { g.audio.play('bolt'); }
        this.reload = null;
        return;
      }
      if (r.stack.ammoType && r.stack.ammoType !== r.type && r.stack.ammo > 0) {
        // mixing shell types is fine; the next shot fires whatever was loaded last
      }
      p.inv.remove(r.type, 1);
      r.stack.ammo = (r.stack.ammo || 0) + 1;
      r.stack.ammoType = r.type;
      g.viewmodel?.reloadInsert();
      g.audio.play('reload_shell', { volume: 0.7 });
      r.t = 0;
      r.dur = r.shell;
      p.inv.changed();
    }
  }

  // ------------------------------------------------------------------ melee
  swing(stack, def, heavy = false) {
    const g = this.game, p = g.player;
    const m = def.melee;
    const skill = p.skillLevel('melee');
    const cost = (m.stamina || 6) * (heavy ? 1.5 : 1) * (1 - p.skillLevel('fitness') * 0.03);
    const tired = p.stamina < cost;
    p.stamina = Math.max(0, p.stamina - cost);
    const rate = (m.speed || 1.5) * (1 + skill * 0.03) * (tired ? 0.6 : 1) * (heavy ? 0.7 : 1);
    this.cooldown = 1 / rate;
    const hitDelay = g.viewmodel?.swing ? g.viewmodel.swing(heavy) : 0.18;
    g.audio.play(m.type === 'heavy' || m.twoHanded || heavy ? 'swing_heavy' : 'swing_light', { volume: 0.7 });
    this.pendingHits.push({ t: Math.min(hitDelay ?? 0.18, this.cooldown * 0.8), stack, def, heavy, tired });
  }

  resolveMelee(h) {
    const g = this.game, p = g.player, def = h.def, m = def.melee;
    if (p.inv.selectedStack !== h.stack && h.stack) return;
    const cam = g.renderer.camera;
    const origin = cam.position.clone();
    const fwd = p.forward(new THREE.Vector3());
    const range = (m.range || 2) + 0.2;
    // candidate zombies
    const cands = [];
    for (const z of g.zombies.zombies) {
      if (z.dead) continue;
      const dx = z.x - p.x, dz = z.z - p.z;
      const d = Math.hypot(dx, dz);
      if (d > range + 0.8 || Math.abs(z.y - p.y) > 2.2) continue;
      const hd = Math.hypot(fwd.x, fwd.z) || 1;
      const dot = d > 0.01 ? (dx * fwd.x + dz * fwd.z) / (d * hd) : 1;
      if (dot < 0.55 && d > 0.9) continue;
      const ray = z.visual.raycast(origin, fwd, range + 0.4);
      cands.push({ z, d, ray, dot });
    }
    cands.sort((a, b) => (a.ray ? a.ray.distance : a.d + 0.5) - (b.ray ? b.ray.distance : b.d + 0.5));
    const sweep = m.sweep || 1;
    let hits = 0;
    const blockHit = raycast(g.world, origin.x, origin.y, origin.z, fwd.x, fwd.y, fwd.z, range, bulletFilter);
    for (const c of cands) {
      if (hits >= sweep) break;
      if (blockHit && c.ray && blockHit.dist < c.ray.distance - 0.1) continue;
      if (!c.ray && c.d > range) continue;
      let part = c.ray ? c.ray.part : (p.pitch < -0.5 ? 'legL' : 'torso');
      const z = c.z;
      if ((z.state === 'down' || z.crippled) && !c.ray) part = 'head';
      const skill = p.skillLevel('melee');
      let dmg = m.damage * (1 + skill * 0.06) * (1 + p.skillLevel('strength') * 0.03) * (h.heavy ? 1.5 : 1) * (h.tired ? 0.55 : 1);
      if ((def.tags || []).includes('chop') && p.bonus?.axeDamage) dmg *= p.bonus.axeDamage;
      const crit = Math.random() < (m.crit || 0.08) + skill * 0.012;
      if (crit) dmg *= 2;
      if (hits > 0) dmg *= 0.65;
      const point = c.ray ? c.ray.point : new THREE.Vector3(z.x, z.y + 1.2, z.z);
      const dir = new THREE.Vector3(z.x - p.x, 0, z.z - p.z).normalize();
      this.damageZombie(z, dmg, part, point, dir, def, { heavy: h.heavy || crit });
      hits++;
    }
    if (hits) {
      p.addXP('melee', 1.5 * hits);
      p.addXP('strength', 0.5);
      this.wear(h.stack, def, hits);
      g.noise(p.x, p.y + 1, p.z, m.noise || 5, 'melee', true);
      return;
    }
    if (blockHit) {
      const d = BLOCKS[blockHit.id];
      const pos = new THREE.Vector3(blockHit.px, blockHit.py, blockHit.pz);
      g.fx?.impact(pos, new THREE.Vector3(blockHit.nx, blockHit.ny, blockHit.nz), d.mat);
      const snd = d.mat === 'wood' ? 'hit_wood' : d.mat === 'metal' ? 'hit_metal' : d.mat === 'glass' ? 'hit_glass' : 'hit_stone';
      g.audio.play(snd, { pos, volume: 0.8 });
      const tags = def.tags || [];
      const tool = tags.includes('chop') ? 'chop' : tags.includes('heavy') ? 'heavy' : tags.includes('pry') ? 'pry' : tags.includes('dig') ? 'dig' : m.type === 'blade' ? 'blade' : 'blunt';
      const broke = g.damageBlock(blockHit.x, blockHit.y, blockHit.z, m.damage * (h.heavy ? 1.5 : 1), { tool, tags });
      if (d.hp || d.door) this.wear(h.stack, def, 1);
      g.noise(pos.x, pos.y, pos.z, d.mat === 'metal' ? 10 : 6, 'melee', true);
      if (broke) p.addXP('strength', 0.5);
    }
  }

  wear(stack, def, n) {
    if (!stack || !def.durability) return;
    const g = this.game, p = g.player;
    stack.dur -= (def.melee?.durabilityLoss ?? 1) * n * (1 - p.skillLevel('maintenance') * 0.06) * (Math.random() < 0.5 ? 1 : 0.5);
    if (stack.dur <= 0) {
      p.inv.removeStack(stack);
      g.audio.play('hit_metal', { volume: 1 });
      g.ui?.toast(`Your ${def.name} broke!`, 'danger');
      this.syncHeld();
    }
    p.inv.changed();
  }

  doShove() {
    const g = this.game, p = g.player;
    if (this.shoveT > 0 || p.stamina < 4) return;
    this.shoveT = 0.75;
    this.cooldown = Math.max(this.cooldown, 0.35);
    p.stamina -= 7;
    g.viewmodel?.shove();
    g.audio.play('shove', { volume: 0.7 });
    const fwd = p.forward(new THREE.Vector3());
    let any = false;
    for (const z of g.zombies.zombies) {
      if (z.dead) continue;
      const dx = z.x - p.x, dz = z.z - p.z, d = Math.hypot(dx, dz);
      if (d > 1.9 || Math.abs(z.y - p.y) > 1.5) continue;
      const dot = (dx * fwd.x + dz * fwd.z) / (d * (Math.hypot(fwd.x, fwd.z) || 1));
      if (dot < 0.4) continue;
      const dir = new THREE.Vector3(dx, 0, dz).normalize();
      const str = p.skillLevel('strength');
      z.takeDamage(2, { part: 'torso', dir, knockback: 1.3 + str * 0.06, stagger: 0.95, knockdown: 0.16 + str * 0.03, wound: false });
      any = true;
    }
    if (any) { g.audio.play('hit_flesh', { volume: 0.5 }); p.addXP('strength', 0.8); }
  }

  findStompTarget() {
    const p = this.game.player;
    for (const z of this.game.zombies.zombies) {
      if (z.dead) continue;
      if (!(z.state === 'down' || z.crippled)) continue;
      const d = Math.hypot(z.x - p.x, z.z - p.z);
      if (d < 1.8 && Math.abs(z.y - p.y) < 1) return z;
    }
    return null;
  }

  doStomp() {
    const g = this.game, p = g.player;
    const z = this.findStompTarget();
    this.cooldown = 0.8;
    p.stamina = Math.max(0, p.stamina - 8);
    g.viewmodel?.shove();
    g.audio.play('stomp', { volume: 0.9 });
    if (!z) return;
    const dir = new THREE.Vector3(z.x - p.x, 0, z.z - p.z).normalize();
    const pt = z.visual.getPartPosition ? z.visual.getPartPosition('head', new THREE.Vector3()) : new THREE.Vector3(z.x, z.y + 0.3, z.z);
    this.damageZombie(z, 30 + p.skillLevel('strength') * 4, 'head', pt, dir, { melee: { type: 'blunt', headMult: 1.3, knockback: 0 }, id: 'stomp' });
    g.player.shake = 0.3;
  }

  // ------------------------------------------------------------------ throwables
  throwItem(stack, def) {
    const g = this.game, p = g.player;
    const th = def.throwable;
    this.cooldown = 0.9;
    if (th.kind === 'molotov' && !p.inv.has((s) => (getItemDef(s.id).tags || []).includes('fire_starter'))) {
      g.ui?.toast('You need a lighter or matches to light it.', 'warn');
      return;
    }
    g.viewmodel?.throwItem?.();
    g.audio.play('throw', { volume: 0.7 });
    if (th.kind === 'molotov') g.audio.play('lighter', { volume: 0.6 });
    const one = { ...stack, count: 1 };
    stack.count--;
    if (stack.count <= 0) p.inv.removeStack(stack);
    p.inv.changed();
    const cam = g.renderer.camera;
    const fwd = p.forward(new THREE.Vector3());
    const pos = cam.position.clone().addScaledVector(fwd, 0.5);
    const vel = fwd.clone().multiplyScalar(14 + p.skillLevel('strength') * 0.6).add(new THREE.Vector3(p.vx, p.vy * 0.3 + 2.5, p.vz));
    const color = th.kind === 'molotov' ? 0x7a5a30 : th.kind === 'flare' ? 0xd02020 : th.kind === 'pipebomb' ? 0x555a60 : th.kind === 'grenade' ? 0x3a4a2a : th.kind === 'smoke' ? 0x667766 : 0x88aa88;
    const mesh = new THREE.Mesh(new THREE.BoxGeometry(0.12, 0.22, 0.12), createEntityMaterial({ color }));
    mesh.position.copy(pos);
    g.renderer.scene.add(mesh);
    this.projectiles.push({ mesh, pos, vel, def, kind: th.kind, fuse: th.kind === 'pipebomb' || th.kind === 'grenade' ? (th.fuse || 3.5) : -1, t: 0, landed: false, stack: one, spin: new THREE.Vector3(Math.random() * 10, Math.random() * 10, 0) });
    this.syncHeld();
  }

  updateProjectiles(dt) {
    const g = this.game, w = g.world;
    for (let i = this.projectiles.length - 1; i >= 0; i--) {
      const pr = this.projectiles[i];
      pr.t += dt;
      if (!pr.landed) {
        pr.vel.y -= 20 * dt;
        const step = pr.vel.clone().multiplyScalar(dt);
        const len = step.length();
        const dir = step.clone().normalize();
        const hit = raycast(w, pr.pos.x, pr.pos.y, pr.pos.z, dir.x, dir.y, dir.z, len + 0.05, bulletFilter);
        // zombie contact
        let zhit = null;
        for (const z of g.zombies.zombies) {
          if (z.dead) continue;
          if (Math.hypot(z.x - pr.pos.x, z.z - pr.pos.z) < 0.5 && pr.pos.y > z.y && pr.pos.y < z.y + z.h) { zhit = z; break; }
        }
        if (hit || zhit) {
          const at = hit ? new THREE.Vector3(hit.px, hit.py, hit.pz).addScaledVector(new THREE.Vector3(hit.nx, hit.ny, hit.nz), 0.1) : pr.pos.clone();
          if (pr.kind === 'molotov' || pr.kind === 'noise' && pr.def.id === 'glass_bottle') { this.detonate(pr, at); this.removeProjectile(i); continue; }
          if (hit && BLOCKS[hit.id].mat === 'glass' && pr.vel.length() > 6) g.damageBlock(hit.x, hit.y, hit.z, 50, { tool: 'blunt' });
          // bounce
          if (hit) {
            const n = new THREE.Vector3(hit.nx, hit.ny, hit.nz);
            pr.pos.copy(at);
            pr.vel.reflect(n).multiplyScalar(0.35);
            if (hit.ny > 0 && pr.vel.length() < 2) { pr.landed = true; pr.vel.set(0, 0, 0); this.onLand(pr); }
            else g.audio.play('hit_metal', { pos: at, volume: 0.3 });
          } else { pr.vel.multiplyScalar(-0.2); pr.landed = true; this.onLand(pr); }
        } else pr.pos.add(step);
        pr.mesh.rotation.x += pr.spin.x * dt; pr.mesh.rotation.y += pr.spin.y * dt;
        pr.mesh.position.copy(pr.pos);
      }
      const sky = w.skyAt(Math.floor(pr.pos.x), Math.floor(pr.pos.y), Math.floor(pr.pos.z)) / 15;
      setEntityLight(pr.mesh.material, sky, pr.kind === 'flare' && pr.landed ? 1 : 0);
      if (pr.fuse > 0 && pr.t >= pr.fuse) { this.detonate(pr, pr.pos.clone()); this.removeProjectile(i); continue; }
      if (pr.landed && pr.kind === 'flare') {
        pr.life = (pr.life ?? (pr.def.throwable.duration || 60)) - dt;
        pr.noiseT = (pr.noiseT ?? 0) - dt;
        g.addFlashLight(pr.pos.clone().add(new THREE.Vector3(0, 0.4, 0)), 0xff3020, 3.5 + Math.random() * 0.6, 18, 0);
        if (pr.noiseT <= 0) { pr.noiseT = 3; g.noise(pr.pos.x, pr.pos.y, pr.pos.z, 45, 'flare'); }
        if (pr.life <= 0) { pr.sound?.stop(); pr.smoke?.stop(); this.removeProjectile(i); }
      }
      if (pr.landed && pr.kind === 'noise') {
        pr.life = (pr.life ?? (pr.def.id === 'noise_maker' ? (pr.def.throwable.duration || 20) : 0.1)) - dt;
        pr.noiseT = (pr.noiseT ?? 0) - dt;
        if (pr.noiseT <= 0) {
          pr.noiseT = 1.5;
          g.noise(pr.pos.x, pr.pos.y, pr.pos.z, pr.def.throwable.noise || 30, 'lure');
          if (pr.def.id === 'noise_maker') g.audio.play('alarm_beep', { pos: pr.pos, volume: 1.2 });
        }
        if (pr.life <= 0) {
          if (pr.def.id !== 'noise_maker') { this.removeProjectile(i); continue; }
          if (pr.life < -0.5) { this.removeProjectile(i); }
        }
      }
      if (pr.landed && pr.kind === 'smoke' && !pr.smoke) {
        pr.smoke = g.fx?.smoke?.(pr.pos.clone(), { color: 0xb0b8b0, duration: 28, radius: 4 });
        g.combat.smokes.push({ x: pr.pos.x, y: pr.pos.y, z: pr.pos.z, r: 5, t: 28 });
        pr.life = 28;
      }
      if (pr.landed && pr.kind === 'smoke') { pr.life -= dt; if (pr.life <= 0) this.removeProjectile(i); }
      if (pr.t > 90) this.removeProjectile(i);
    }
    for (let i = this.smokes.length - 1; i >= 0; i--) { this.smokes[i].t -= dt; if (this.smokes[i].t <= 0) this.smokes.splice(i, 1); }
    this.recoilAccum = Math.max(0, this.recoilAccum - dt * 12);
  }

  onLand(pr) {
    const g = this.game;
    if (pr.kind === 'flare' && !pr.sound) {
      pr.sound = g.audio.loop('flare_loop', { pos: pr.pos, volume: 0.6 });
      pr.smoke = g.fx?.smoke?.(pr.pos.clone(), { color: 0xd04030, duration: 60, radius: 1 });
    }
    if (pr.kind === 'noise' && pr.def.id !== 'noise_maker') {
      g.audio.play(pr.def.id === 'glass_bottle' ? 'glass_break' : 'hit_metal', { pos: pr.pos, volume: 1 });
      g.noise(pr.pos.x, pr.pos.y, pr.pos.z, pr.def.throwable.noise || 18, 'lure');
    }
  }

  removeProjectile(i) {
    const pr = this.projectiles[i];
    this.game.renderer.scene.remove(pr.mesh);
    pr.mesh.geometry.dispose();
    pr.mesh.material.dispose();
    this.projectiles.splice(i, 1);
  }

  detonate(pr, at) {
    const g = this.game;
    const th = pr.def.throwable;
    if (pr.kind === 'molotov') {
      g.audio.play('molotov_break', { pos: at, volume: 1.2 });
      g.startFire(at, Math.min(th.radius || 2.6, 3.2), th.duration || 15);
      g.noise(at.x, at.y, at.z, 30, 'fire');
      return;
    }
    if (pr.kind === 'noise' && pr.def.id === 'glass_bottle') {
      g.audio.play('glass_break', { pos: at, volume: 1 });
      g.fx?.glass(at);
      g.noise(at.x, at.y, at.z, th.noise || 18, 'lure');
      return;
    }
    g.explode(at, th.radius || 5, th.damage || 150);
  }
}
