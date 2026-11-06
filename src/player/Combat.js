// Weapons: firearms, melee, shove/stomp, throwables (projectiles), reloads.
import * as THREE from 'three';
import { getItemDef, createItem } from '../items/items.js';
import { raycast } from '../world/raycast.js';
import { BLOCKS, B, SOLID } from '../world/blocks.js';
import { clamp } from '../core/rng.js';
import { createEntityMaterial, setEntityLight } from '../render/materials.js';

const FISTS = 'fists';
// improvised lures that are not throwables in the item DB: G throws them (shatter = breaks on impact)
const LURES = {
  glass_bottle: { kind: 'noise', noise: 24, shatter: true, color: 0x2f6a36, size: [0.08, 0.24, 0.08] },
  brick: { kind: 'noise', noise: 18, color: 0x9a4a32, size: [0.2, 0.08, 0.1] },
  tin_can: { kind: 'noise', noise: 14, color: 0x9aa0a6, size: [0.08, 0.1, 0.08] },
};
const v1 = new THREE.Vector3(), v2 = new THREE.Vector3(), v3 = new THREE.Vector3();

function bulletFilter(id, d) { return (d.solid || d.opaque) && d.render !== 'cross'; }
const sizeY = (pr) => (pr.th && pr.th.size ? pr.th.size[1] : 0.22) * (pr.kind === 'flare' || pr.kind === 'pipebomb' ? 0.55 : 1);

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
    this.pendingThrows = []; // throws waiting for the release moment of the throw animation
    this._shotHits = null;    // zombies already hit by the current shot (pellet sound / marker throttle)
    this._jamToastT = -9;
  }

  /** true if nothing solid blocks the straight line a -> b (melee / shove through walls) */
  clearLine(a, b) {
    const dx = b.x - a.x, dy = b.y - a.y, dz = b.z - a.z;
    const d = Math.hypot(dx, dy, dz);
    if (d < 0.05) return true;
    const h = raycast(this.game.world, a.x, a.y, a.z, dx / d, dy / d, dz / d, d, bulletFilter);
    return !h || h.dist >= d - 0.05;
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
    const zoom = def.zoomFov;
    p.aiming = !!((fa || zoom) && input.aim && !p.sprinting && !this.reload && !busy);
    this.aimT = clamp(this.aimT + (p.aiming ? dt : -dt) * 5, 0, 1);
    p.scopeActive = !!(fa && fa.scope && this.aimT > 0.85);
    // zoom relative to the player's FOV setting so a scope magnifies the same at any FOV
    p.fovKick = p.aiming ? -Math.max(0, (g.settings?.fov || 75) - ((fa && fa.aimFov) || zoom || 55)) * this.aimT : 0;

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
      // G: throw the held throwable / lure (bottle, brick, can), else the first throwable found in the hotbar
      let idx = stack && this.throwSpec(def) ? p.inv.selected : -1;
      if (idx < 0) idx = p.inv.hotbar.findIndex((s) => s && getItemDef(s.id).throwable);
      if (idx >= 0 && this.cooldown <= 0 && !this.reload) this.throwItem(p.inv.hotbar[idx], getItemDef(p.inv.hotbar[idx].id));
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
    // sustained fire blooms the cone; braced / aimed fire blooms less
    s += this.recoilAccum * (p.aiming ? 0.004 : 0.009) * (p.crouching ? 0.8 : 1);
    return s;
  }

  fireGun(stack, def) {
    const g = this.game, p = g.player, fa = def.firearm;
    if (stack.jammed) {
      g.audio.play('dry_fire');
      this.cooldown = 0.3;
      // one reminder per few seconds, not one per click
      if (g.clock - this._jamToastT > 2.5) { this._jamToastT = g.clock; g.ui?.toast('Weapon jammed! Press R to clear.', 'warn'); }
      return;
    }
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
      // revolvers, bows, break-actions (jam: 0) never jam, whatever their condition
      const base = fa.jam ?? 0.002;
      const jam = base > 0 ? base * (1 + (1 - cond) * 6) + (cond < 0.4 ? (0.4 - cond) * 0.1 : 0) : 0;
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
    this._shotHits = new Set();
    for (let i = 0; i < pellets; i++) {
      const dir = v3.copy(fwd);
      // pellets: the item spread is the hip cone; a tighter core so buckshot is deadly at 5-10 m and fades after
      const a = Math.random() * Math.PI * 2, r = pellets > 1 ? Math.sqrt(Math.random()) * spread * 0.75 + 0.015 : Math.sqrt(Math.random()) * spread;
      const right = new THREE.Vector3(Math.cos(p.yaw), 0, -Math.sin(p.yaw));
      const up = new THREE.Vector3().crossVectors(right, dir).normalize();
      dir.addScaledVector(right, Math.cos(a) * r).addScaledVector(up, Math.sin(a) * r).normalize();
      this.shootRay(origin.clone(), dir.clone(), (round?.range || fa.range || 60) * 1.8, dmg, def, { pellet: pellets > 1, pierce: (fa.penetration || (dmg > 60 && pellets === 1 ? 1 : 0)), recover: fa.recover ? stack.ammoType : null, recoverChance: fa.recover });
    }
    this._shotHits = null;
    // recoil
    const rec = (fa.recoil || 2) * (Math.PI / 180) * (1 - p.skillLevel('aiming') * 0.04) * (p.crouching ? 0.8 : 1) * (p.aiming ? 0.7 : 1);
    p.addPunch(rec * 9, (Math.random() - 0.5) * rec * 5);
    // permanent muzzle climb: a controllable ~0.6 deg per aimed 5.56 round (was ~1.1 deg: full auto walked off a
    // man-sized target after two rounds at 15 m)
    p.pitch = clamp(p.pitch + rec * 0.3, -1.55, 1.55);
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
    // casings: everything with an ejection port (semi-autos, pumps, levers, bolts) — not revolvers,
    // break-actions or bows / crossbows. Pump / lever / bolt guns eject when the action is cycled.
    if (fa.reload !== 'break' && !def.id.includes('revolver') && !def.id.includes('bow')) {
      const at = stack.ammoType || fa.ammo[0] || '';
      const kind = at.includes('12g') ? 'shotgun' : at === 'ammo_22' ? '22' : fa.damage > 44 || at === 'ammo_556' ? 'rifle' : 'pistol';
      const delay = mode === 'pump' ? 0.38 : mode === 'bolt' ? 0.56 : 0; // matches the viewmodel eject moment
      const spawnCase = () => {
        if (p.inv.selectedStack !== stack) return;
        const f = p.forward(new THREE.Vector3());
        const right = new THREE.Vector3(Math.cos(p.yaw), 0, -Math.sin(p.yaw));
        const m = g.viewmodel?.getMuzzleWorldPosition ? g.viewmodel.getMuzzleWorldPosition(cam, new THREE.Vector3()) : cam.position.clone().addScaledVector(f, 0.8);
        // ejection port: a bit behind the muzzle, right of the bore
        const pos = m.addScaledVector(f, kind === 'pistol' || kind === '22' ? -0.12 : -0.35).addScaledVector(right, 0.03);
        g.fx?.shell(pos, right.add(new THREE.Vector3(0, 0.5, 0)).addScaledVector(f, -0.15), kind);
      };
      if (delay) setTimeout(spawnCase, delay * 1000); else spawnCase();
    }
    const noise = (fa.noise || 50) * noiseMult;
    g.noise(p.x, p.y + 1.5, p.z, noise, 'gunshot', true);
    if (noise > 40) g.audio.setAmbience?.({ tinnitus: 0 });
    // cycle the action (only if the same gun is still in hand and not being reloaded / swapped)
    const still = () => p.inv.selectedStack === stack && !this.reload && !p.dead;
    if (mode === 'pump') { setTimeout(() => { if (!still()) return; g.viewmodel?.pump(); g.audio.play('pump', { volume: 0.8 }); }, 180); }
    if (mode === 'bolt') { setTimeout(() => { if (!still()) return; g.viewmodel?.bolt(); g.audio.play('bolt', { volume: 0.8 }); }, 200); }
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
    const wasDown = z.state === 'down';
    // a clean (non-pellet) bullet to the head always drops an ordinary zombie (helmets / brutes still soak it)
    const gunHead = !melee && !o.pellet ? Math.max(3.5, 125 / Math.max(1, dmg)) : 3.5;
    const res = z.takeDamage(dmg, {
      part, point, dir: dir.clone().setY(0).normalize(),
      headMult: melee ? melee.headMult ?? (melee.type === 'stab' ? 3 : 2.4) : gunHead,
      // hitting a zombie on the ground must not "stagger" it back onto its feet
      ...(wasDown ? { stagger: 0 } : null),
      knockback: melee ? (melee.knockback ?? 0.5) * (1 + p.skillLevel('strength') * 0.05) * (o.heavy ? 1.4 : 1) : (dmg > 60 ? 0.7 : dmg > 30 ? 0.25 : 0.1),
      knockdown: melee ? (melee.knockdown || 0) * (o.heavy ? 1.6 : 1) : dmg > 80 ? 0.35 : 0,
      gib: isHead && (dmg >= 70 || (def.melee && def.melee.type === 'heavy')),
      force: o.bullet ? dmg / 30 : 0,
      pierceArmor: !melee && dmg > 70,
    });
    // several pellets of one shell hitting the same zombie: one hit sound / marker, lighter blood each
    const repeat = !!(o.pellet && this._shotHits && this._shotHits.has(z));
    if (o.pellet && this._shotHits) this._shotHits.add(z);
    // blood
    const bp = point || new THREE.Vector3(z.x, z.y + 1.2, z.z);
    g.fx?.blood(bp, dir, isHead ? 1.6 : o.pellet ? (repeat ? 0.35 : 0.6) : 1);
    if (o.bullet && !(repeat && Math.random() < 0.6)) {
      // splatter on the wall behind
      const bh = raycast(g.world, bp.x, bp.y, bp.z, dir.x, dir.y, dir.z, 3.5, bulletFilter);
      if (bh) g.fx?.bloodSplat(new THREE.Vector3(bh.px, bh.py, bh.pz), new THREE.Vector3(bh.nx, bh.ny, bh.nz), isHead ? 1.4 : 0.9);
    }
    if (melee) {
      g.audio.play(isHead && res.killed ? 'headshot' : melee.type === 'blade' || melee.type === 'stab' ? 'hit_blade' : 'hit_blunt', { pos: bp, volume: 0.9 });
      g.audio.play(dmg > 35 ? 'hit_flesh_heavy' : 'hit_flesh', { pos: bp, volume: 0.8 });
      g.player.shake = Math.max(g.player.shake, 0.18);
    } else if (!repeat || res.killed) {
      g.audio.play(isHead && (res.killed || !o.pellet) ? 'headshot' : o.pellet ? 'hit_flesh_heavy' : 'hit_flesh', { pos: bp, volume: o.pellet ? 0.8 : 0.9 });
    }
    if (!repeat || res.killed) g.ui?.hitMarker(res.killed ? (isHead ? 'headshot' : 'kill') : 'hit');
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
      // single-shot weapons (crossbow, bows): the bolt / arrow is only in once the whole crank / nock is done
      const single = fa.magSize <= 1;
      this.reload = { kind, t: 0, dur: single ? shell : 0.35, stack, def, type, shell: single ? 0.2 : shell, phase: 'start', wasEmpty: !(stack.ammo > 0) };
      g.viewmodel?.reloadStart(kind, single ? shell + 0.25 : shell * (fa.magSize - (stack.ammo || 0)) + 0.6);
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
        // chamber a round (only needed when the gun was run dry); the gun can't fire mid-rack
        if (fa.modes?.includes('pump') && r.wasEmpty) { g.audio.play('pump'); g.viewmodel?.pump?.(); this.cooldown = Math.max(this.cooldown, 0.5); }
        if (fa.modes?.includes('bolt')) { g.audio.play('bolt'); this.cooldown = Math.max(this.cooldown, 0.35); }
        this.reload = null;
        p.addXP('aiming', 0.3);
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
    // the swing animation runs exactly one cooldown long, so the impact frame matches the damage moment
    const hitDelay = g.viewmodel?.swing ? g.viewmodel.swing(heavy, rate) : 0.18;
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
    // sweep 0..1 = how well the weapon carries through into more targets (katana 0.4 -> 2 targets)
    const sw = m.sweep || 0;
    const maxTargets = sw >= 1 ? Math.round(sw) : 1 + Math.round(sw * 3);
    let hits = 0;
    const blockHit = raycast(g.world, origin.x, origin.y, origin.z, fwd.x, fwd.y, fwd.z, range, bulletFilter);
    const chest = new THREE.Vector3();
    for (const c of cands) {
      if (hits >= maxTargets) break;
      if (blockHit && c.ray && blockHit.dist < c.ray.distance - 0.1) continue;
      if (!c.ray && c.d > range) continue;
      // auto-aimed hit (crosshair not on the body): never through walls, doors or windows
      if (!c.ray && !this.clearLine(origin, chest.set(c.z.x, c.z.y + Math.min(1.2, c.z.h * 0.6), c.z.z))) continue;
      let part = c.ray ? c.ray.part : (p.pitch < -0.5 ? 'legL' : 'torso');
      const z = c.z;
      if ((z.state === 'down' || z.crippled) && !c.ray) part = 'head';
      const skill = p.skillLevel('melee');
      let dmg = m.damage * (1 + skill * 0.06) * (1 + p.skillLevel('strength') * 0.03) * (h.heavy ? 1.5 : 1) * (h.tired ? 0.55 : 1);
      if ((def.tags || []).includes('chop') && p.bonus?.axeDamage) dmg *= p.bonus.axeDamage;
      const crit = Math.random() < (m.crit || 0.08) + skill * 0.012;
      if (crit) dmg *= 2;
      if (hits > 0) dmg *= 0.5 + Math.min(0.4, sw);
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
      // use whichever of the weapon's tool classes this block can actually be broken with
      // (a fire axe is 'chop' + 'heavy', a pickaxe 'heavy' + 'dig' ...)
      const fallback = tags.includes('chop') ? 'chop' : tags.includes('heavy') ? 'heavy' : tags.includes('pry') ? 'pry' : tags.includes('dig') ? 'dig' : m.type === 'blade' ? 'blade' : 'blunt';
      const bw = d.breakWith;
      const tool = (bw && (bw.find((t) => tags.includes(t)) || (bw.includes(m.type) ? m.type : null))) || fallback;
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
    const eye = g.renderer.camera.position;
    const chest = new THREE.Vector3();
    let any = false;
    for (const z of g.zombies.zombies) {
      if (z.dead) continue;
      const dx = z.x - p.x, dz = z.z - p.z, d = Math.hypot(dx, dz);
      if (d > 1.9 || Math.abs(z.y - p.y) > 1.5) continue;
      const dot = d > 0.01 ? (dx * fwd.x + dz * fwd.z) / (d * (Math.hypot(fwd.x, fwd.z) || 1)) : 1;
      if (dot < 0.4) continue;
      if (!this.clearLine(eye, chest.set(z.x, z.y + Math.min(1.1, z.h * 0.6), z.z))) continue; // not through doors / walls
      const dir = new THREE.Vector3(dx, 0, dz).normalize();
      const str = p.skillLevel('strength');
      const down = z.state === 'down';
      z.takeDamage(2, { part: 'torso', dir, knockback: (down ? 0.4 : 1.3) + str * 0.06, stagger: down ? 0 : 0.95, knockdown: down ? 0 : 0.16 + str * 0.03, wound: false });
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
    // no legs in first person: the whole view drops into the stomp
    if (g.viewmodel?.stomp) g.viewmodel.stomp(); else g.viewmodel?.shove();
    p.landDip = Math.max(p.landDip || 0, 0.12);
    p.addPunch(-0.5, (Math.random() - 0.5) * 0.1);
    g.audio.play('stomp', { volume: 0.9 });
    if (!z) return;
    const dir = new THREE.Vector3(z.x - p.x, 0, z.z - p.z).normalize();
    const pt = z.visual.getPartPosition ? z.visual.getPartPosition('head', new THREE.Vector3()) : new THREE.Vector3(z.x, z.y + 0.3, z.z);
    this.damageZombie(z, 30 + p.skillLevel('strength') * 4, 'head', pt, dir, { melee: { type: 'blunt', headMult: 1.3, knockback: 0 }, id: 'stomp' });
    g.player.shake = 0.3;
  }

  // ------------------------------------------------------------------ throwables
  /** Throwable stats for a def: real throwables, plus improvised lures (bottles, bricks, cans). */
  throwSpec(def) {
    if (!def) return null;
    if (def.throwable) return def.throwable;
    return LURES[def.id] || null;
  }

  throwItem(stack, def) {
    const g = this.game, p = g.player;
    const th = this.throwSpec(def);
    if (!th) return;
    this.cooldown = 0.9;
    if (th.kind === 'molotov' && !p.inv.has((s) => (getItemDef(s.id).tags || []).includes('fire_starter'))) {
      g.ui?.toast('You need a lighter or matches to light it.', 'warn');
      return;
    }
    // the projectile leaves the hand at the release frame of the throw animation (aim follows the camera until then)
    const held = p.inv.selectedStack === stack;
    const rel = g.viewmodel?.throwItem ? g.viewmodel.throwItem(0.8, held ? null : stack) : 0;
    g.audio.play('throw', { volume: 0.7 });
    if (th.kind === 'molotov') g.audio.play('lighter', { volume: 0.6 });
    if (th.kind === 'flare') g.audio.play('match', { volume: 0.6 });
    const one = { ...stack, count: 1 };
    stack.count--;
    if (stack.count <= 0) p.inv.removeStack(stack);
    p.inv.changed();
    this.pendingThrows.push({ t: Math.max(0, rel || 0), def, th, stack: one });
    this.syncHeld();
  }

  _release(pt) {
    const g = this.game, p = g.player, th = pt.th;
    const cam = g.renderer.camera;
    const fwd = p.forward(new THREE.Vector3());
    const right = new THREE.Vector3(Math.cos(p.yaw), 0, -Math.sin(p.yaw));
    // from the right hand, not the eye, and never from inside a wall
    let pos = cam.position.clone().addScaledVector(fwd, 0.45).addScaledVector(right, 0.12);
    if (!this.clearLine(cam.position, pos)) pos = cam.position.clone().addScaledVector(fwd, 0.1);
    const vel = fwd.clone().multiplyScalar(14 + p.skillLevel('strength') * 0.6).add(new THREE.Vector3(p.vx, p.vy * 0.3 + 2.5, p.vz));
    const color = th.color ?? (th.kind === 'molotov' ? 0x7a5a30 : th.kind === 'flare' ? 0xd02020 : th.kind === 'pipebomb' ? 0x555a60 : th.kind === 'grenade' ? 0x3a4a2a : th.kind === 'smoke' ? 0x667766 : 0x88aa88);
    const sz = th.size || [0.12, 0.22, 0.12];
    const mesh = new THREE.Mesh(new THREE.BoxGeometry(sz[0], sz[1], sz[2]), createEntityMaterial({ color }));
    mesh.position.copy(pos);
    g.renderer.scene.add(mesh);
    const fuse = th.kind === 'pipebomb' || th.kind === 'grenade' ? (th.fuse || 3.5) : -1;
    const pr = { mesh, pos, vel, def: pt.def, th, kind: th.kind, fuse, t: 0, landed: false, stack: pt.stack, spin: new THREE.Vector3(4 + Math.random() * 8, Math.random() * 8, 0), hitZ: new Set() };
    if (th.kind === 'flare') {
      pr.flame = g.fx?.fire?.(pos.clone(), { radius: 0.04, intensity: 0.35, smoke: false, light: false });
      // persistent flickering red light (a per-frame addFlashLight with duration 0 is culled before it renders)
      pr.light = g.fx?.light?.(pos, { color: [3.6, 0.62, 0.4], radius: 18, flicker: true }) || null;
    }
    this.projectiles.push(pr);
  }

  updateProjectiles(dt) {
    const g = this.game, w = g.world;
    for (let i = this.pendingThrows.length - 1; i >= 0; i--) {
      const pt = this.pendingThrows[i];
      pt.t -= dt;
      if (pt.t <= 0) { this.pendingThrows.splice(i, 1); this._release(pt); }
    }
    for (let i = this.projectiles.length - 1; i >= 0; i--) {
      const pr = this.projectiles[i];
      pr.t += dt;
      if (!pr.landed) {
        pr.vel.y -= 20 * dt;
        const step = pr.vel.clone().multiplyScalar(dt);
        const len = step.length();
        const dir = step.clone().normalize();
        const hit = len > 1e-5 ? raycast(w, pr.pos.x, pr.pos.y, pr.pos.z, dir.x, dir.y, dir.z, len + 0.05, bulletFilter) : null;
        // zombie contact (each zombie only once per throw)
        let zhit = null;
        for (const z of g.zombies.zombies) {
          if (z.dead || pr.hitZ.has(z)) continue;
          if (Math.hypot(z.x - pr.pos.x, z.z - pr.pos.z) < 0.45 && pr.pos.y > z.y && pr.pos.y < z.y + z.h) { zhit = z; break; }
        }
        if (hit || zhit) {
          const at = hit ? new THREE.Vector3(hit.px, hit.py, hit.pz).addScaledVector(new THREE.Vector3(hit.nx, hit.ny, hit.nz), 0.1) : pr.pos.clone();
          if (pr.kind === 'molotov' || pr.th.shatter) { this.detonate(pr, at, zhit); this.removeProjectile(i); continue; }
          // a fast throw goes straight through a window
          if (hit && !zhit && BLOCKS[hit.id].mat === 'glass' && pr.vel.length() > 6 && g.damageBlock(hit.x, hit.y, hit.z, 50, { tool: 'blunt' })) {
            pr.vel.multiplyScalar(0.8);
            pr.pos.add(step);
          } else if (hit) {
            // bounce off the block
            const n = new THREE.Vector3(hit.nx, hit.ny, hit.nz);
            pr.pos.copy(at);
            pr.vel.reflect(n).multiplyScalar(0.35);
            if (hit.ny > 0 && pr.vel.length() < 2) { pr.landed = true; pr.vel.set(0, 0, 0); pr.pos.y = hit.py + sizeY(pr) * 0.5; this.onLand(pr); }
            else g.audio.play(pr.kind === 'noise' && pr.def.id === 'brick' ? 'hit_stone' : 'hit_metal', { pos: at, volume: 0.3 });
          } else {
            // bonk a zombie: drop off it and keep falling (never hang in the air)
            pr.hitZ.add(zhit);
            pr.vel.set(-pr.vel.x * 0.15, Math.min(pr.vel.y, 0) * 0.3, -pr.vel.z * 0.15);
            g.audio.play('hit_blunt', { pos: at, volume: 0.4 });
            if (pr.kind === 'noise') zhit.hear?.({ x: pr.pos.x, y: pr.pos.y, z: pr.pos.z, radius: 6 });
          }
        } else pr.pos.add(step);
        pr.mesh.rotation.x += pr.spin.x * dt; pr.mesh.rotation.y += pr.spin.y * dt;
        if (pr.landed) pr.mesh.rotation.set(0, pr.mesh.rotation.y, Math.PI / 2 * (pr.kind === 'flare' || pr.kind === 'pipebomb' ? 1 : 0));
        pr.mesh.position.copy(pr.pos);
        if (pr.pos.y < -5) { this.removeProjectile(i); continue; }
      }
      const sky = w.skyAt(Math.floor(pr.pos.x), Math.floor(pr.pos.y), Math.floor(pr.pos.z)) / 15;
      setEntityLight(pr.mesh.material, sky, pr.kind === 'flare' ? 1 : 0);
      if (pr.fuse > 0 && pr.t >= pr.fuse) { this.detonate(pr, pr.pos.clone()); this.removeProjectile(i); continue; }
      if (pr.kind === 'flare') {
        // burns from the moment it is struck: in flight too
        pr.life = (pr.life ?? (pr.th.duration || 60)) - dt;
        pr.noiseT = (pr.noiseT ?? 0) - dt;
        if (pr.light) pr.light.setPos({ x: pr.pos.x, y: pr.pos.y + 0.35, z: pr.pos.z });
        else g.addFlashLight(pr.pos.clone().add(new THREE.Vector3(0, 0.35, 0)), 0xff3020, 3.6 * (0.85 + Math.random() * 0.3), 18, 0.05);
        pr.flame?.setPos?.(pr.pos);
        if (pr.landed && pr.noiseT <= 0) { pr.noiseT = 3; g.noise(pr.pos.x, pr.pos.y, pr.pos.z, 45, 'flare'); }
        if (pr.life <= 0) { this.removeProjectile(i); continue; }
      }
      if (pr.landed && pr.kind === 'noise') {
        const timed = pr.def.id === 'noise_maker' || pr.def.id === 'firecrackers';
        pr.life = (pr.life ?? (timed ? (pr.th.duration || 20) : 0.1)) - dt;
        pr.noiseT = (pr.noiseT ?? 0) - dt;
        if (timed && pr.life > 0 && pr.noiseT <= 0) {
          const crackers = pr.def.id === 'firecrackers';
          pr.noiseT = crackers ? 0.25 + Math.random() * 0.35 : 1.5;
          g.noise(pr.pos.x, pr.pos.y, pr.pos.z, pr.th.noise || 30, 'lure');
          if (!crackers) g.audio.play('alarm_beep', { pos: pr.pos, volume: 1.2 });
          else {
            g.audio.play('gun_22', { pos: pr.pos, volume: 0.6, pitch: 1.3 + Math.random() * 0.4 });
            g.fx?.sparks?.(pr.pos.clone(), new THREE.Vector3(0, 1, 0), 8);
            g.addFlashLight(pr.pos.clone().add(new THREE.Vector3(0, 0.2, 0)), 0xffc070, 2, 5, 0.05);
          }
        }
        if (timed ? pr.life <= -6 : pr.life <= 0) {
          // bricks and cans are still bricks and cans: leave them on the ground to be picked up again
          if (LURES[pr.def.id] && !pr.th.shatter) g.groundItems?.add?.(createItem(pr.def.id), pr.pos.x, pr.pos.y, pr.pos.z);
          this.removeProjectile(i);
          continue;
        }
      }
      if (pr.landed && pr.kind === 'smoke' && !pr.smoke) {
        const dur = pr.th.duration || 30, r = pr.th.radius || 5;
        // low, wide, dense cloud (not a chimney column)
        pr.smoke = g.fx?.smoke?.(pr.pos.clone(), { color: [0.62, 0.65, 0.62], rate: 16, size: r * 0.42, rise: 0.45, spread: r * 0.3, life: 10, alpha: 0.92, duration: dur });
        this.smokes.push({ x: pr.pos.x, y: pr.pos.y, z: pr.pos.z, r: r * 0.85, t: dur + 4 });
        g.audio.play('gun_suppressed', { pos: pr.pos, volume: 0.5, pitch: 0.4 });
        pr.life = dur;
      }
      if (pr.landed && pr.kind === 'smoke') { pr.life -= dt; if (pr.life <= 0) { this.removeProjectile(i); continue; } }
      if (pr.t > 120) { this.removeProjectile(i); continue; }
    }
    for (let i = this.smokes.length - 1; i >= 0; i--) { this.smokes[i].t -= dt; if (this.smokes[i].t <= 0) this.smokes.splice(i, 1); }
    this.recoilAccum = Math.max(0, this.recoilAccum - dt * 12);
  }

  onLand(pr) {
    const g = this.game;
    if (pr.kind === 'flare' && !pr.sound) {
      pr.sound = g.audio.loop('flare_loop', { pos: pr.pos, volume: 0.6 });
      pr.smoke = g.fx?.smoke?.(pr.pos.clone(), { color: [0.75, 0.3, 0.26], rate: 4, size: 0.45, rise: 1.1, spread: 0.2, life: 4, alpha: 0.45, duration: pr.life ?? 60 });
    }
    if (pr.kind === 'noise' && pr.def.id !== 'noise_maker' && pr.def.id !== 'firecrackers') {
      g.audio.play(pr.def.id === 'brick' ? 'hit_stone' : 'hit_metal', { pos: pr.pos, volume: 1 });
      g.noise(pr.pos.x, pr.pos.y, pr.pos.z, pr.th.noise || 18, 'lure');
    }
    if (pr.kind === 'pipebomb' || pr.kind === 'grenade') g.audio.play('hit_metal', { pos: pr.pos, volume: 0.35, pitch: 0.7 });
  }

  /** Remove every projectile and stop their looping sounds / emitters (call when the world is torn down). */
  dispose() {
    for (let i = this.projectiles.length - 1; i >= 0; i--) this.removeProjectile(i);
    this.pendingThrows.length = 0;
    this.pendingHits.length = 0;
    this.smokes.length = 0;
  }

  removeProjectile(i) {
    const pr = this.projectiles[i];
    if (!pr) return;
    pr.sound?.stop?.();
    pr.smoke?.stop?.();
    pr.flame?.stop?.();
    pr.light?.stop?.();
    this.game.renderer.scene.remove(pr.mesh);
    pr.mesh.geometry.dispose();
    pr.mesh.material.dispose();
    this.projectiles.splice(i, 1);
  }

  detonate(pr, at, zhit = null) {
    const g = this.game;
    const th = pr.th || pr.def.throwable;
    if (pr.kind === 'molotov') {
      g.audio.play('molotov_break', { pos: at, volume: 1.2 });
      g.fx?.glass?.(at);
      const radius = Math.min(th.radius || 2.6, 3.2);
      g.startFire(at, radius, th.duration || 15);
      // anyone caught in the splash burns long enough to actually die from it (burn = fire dps in the item DB)
      const burnT = Math.max(8, (th.burn || 9) * 0.9);
      for (const zb of g.zombies.near(at.x, at.y, at.z, radius + 0.8)) zb.burning = Math.max(zb.burning || 0, burnT);
      if (zhit) zhit.burning = Math.max(zhit.burning || 0, burnT + 4);
      g.addFlashLight(at, 0xff8030, 6, 12, 0.4);
      g.noise(at.x, at.y, at.z, 30, 'fire');
      return;
    }
    if (pr.th?.shatter) {
      g.audio.play('glass_break', { pos: at, volume: 1 });
      g.fx?.glass(at);
      if (zhit) zhit.takeDamage?.(4, { part: 'head', dir: pr.vel.clone().setY(0).normalize(), stagger: 0.5, wound: false });
      g.noise(at.x, at.y, at.z, th.noise || 18, 'lure');
      return;
    }
    // explosives: remember who was standing close so the dead ones get gibbed
    const radius = th.radius || 5;
    const close = g.zombies.zombies.filter((z) => !z.dead && Math.hypot(z.x - at.x, z.y + 1 - at.y, z.z - at.z) < radius * 0.6);
    g.explode(at, radius, th.damage || 150);
    for (const z of close) {
      if (!z.dead) continue;
      const dir = new THREE.Vector3(z.x - at.x, 0.6, z.z - at.z).normalize();
      g.fx?.gore?.(new THREE.Vector3(z.x, z.y + 1, z.z), dir, 1.3);
      const extra = ['armR', 'legL'][Math.floor(Math.random() * 2)];
      if (z.visual.hasPart?.(extra)) z.visual.dismember?.(extra);
    }
  }
}
