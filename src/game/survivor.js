// Survivor entity: shared by the human player and the bots (they differ only in
// the controller that fills in `intent`).
import * as THREE from 'three';
import { SURVIVOR, DIFFICULTY, WEAPONS, MELEE, ITEMS, U } from './config.js';
import { WeaponState, fireWeapon, meleeHit, shove, currentSpread } from './weapons.js';
import { PoseAnimator, B } from './rig.js';
import { buildSurvivorModel } from './characters.js';
import * as A from './anim.js';
import { buildWeaponModel, buildItemModel } from './itemmodels.js';
import { makeGlowMesh } from './glow.js';

const _v = new THREE.Vector3();
const _v2 = new THREE.Vector3();
const _fwd = new THREE.Vector3();
const _right = new THREE.Vector3();
const _mz1 = new THREE.Vector3(), _mz2 = new THREE.Vector3();
const S = SURVIVOR;

export function newIntent() {
  return {
    moveX: 0, moveY: 0, walk: false, crouch: false, jump: false,
    yaw: 0, pitch: 0,
    attack: false, attackPressed: false, attackReleased: false,
    attack2: false, attack2Pressed: false,
    use: false, usePressed: false,
    reload: false, slot: -1, lastWeapon: false, cycle: 0,
    flashlight: false, drop: false,
  };
}

export const SLOT_NAMES = ['primary', 'secondary', 'throwable', 'kit', 'pills'];

export class Survivor {
  constructor(world, def, index) {
    this.world = world; this.def = def; this.index = index; this.name = def.name; this.id = def.id;
    this.isPlayer = false; this.isBot = true; this.controller = null;
    this.body = { pos: new THREE.Vector3(), vel: new THREE.Vector3(), radius: S.radius, height: S.height, grounded: false, groundNormal: new THREE.Vector3(0, 1, 0), hitWall: false };
    this.yaw = 0; this.pitch = 0;
    this.health = 100; this.temp = 0; this.incapCount = 0;
    this.state = 'alive';
    this.incapHealth = 0; this.ledgeHealth = 0; this.ledgePos = null; this.ledgeStartHealth = 100;
    this.pinnedBy = null; this.tongueVictim = false;
    this.inv = { primary: null, secondary: new WeaponState('pistol'), throwable: null, kit: null, pills: null, carry: null };
    this.slot = 1; this.prevSlot = 0;
    this.action = null;
    this.helper = null;
    this.flashlight = false;
    this.biled = 0; this.bileScreen = 0;
    this.adrenaline = 0;
    this.invuln = 0;
    this.hitGrace = 0;
    this.flinch = 0;
    this.shoveCd = 0; this.shoveFatigue = 0; this.shoveT = 0;
    this.meleeCd = 0; this.swingT = 0; this.swingDef = null; this.swingHitDone = true;
    this.deploy = 0;
    this.throwT = -1;
    this.crouching = false; this.crouchAmt = 0;
    this.eyeH = S.eyeHeight;
    this.airTime = 0; this.lastGrounded = new THREE.Vector3(); this.lastGroundedT = 0; this.peakFallSpeed = 0;
    this.stunned = 0;           // knocked down / staggered (tank punch, charger, boomer explosion)
    this.fling = null;
    this.viewPunch = new THREE.Vector2();
    this.recoil = 0; this.reloadAnim = 0;
    this.lastHurt = -99; this.lastFire = -99;
    this.intensity = 0;
    this.deadTime = 0; this.bodyDefibable = true;
    this.chainsawRun = false;
    this.speechCd = {};
    this.stats = { commons: 0, specials: 0, headshots: 0, dmgTaken: 0, ffDealt: 0, ffTaken: 0, incaps: 0, revives: 0, heals: 0, protects: 0, deaths: 0, shots: 0, hits: 0 };
    this.phase = 0;
    this.t = Math.random() * 10;
    this.inSaferoom = false;
    // model
    this.rig = buildSurvivorModel(def);
    this.anim = new PoseAnimator(this.rig);
    this.rig.mesh.userData.entity = this;
    world.scene.add(this.rig.mesh);
    this.glow = makeGlowMesh(this.rig, [0.3, 0.4, 1.0]);
    world.glowScene.add(this.glow);
    this.heldModel = null; this.heldKey = null;
    this.probe = new THREE.Color(0.5, 0.5, 0.5);
  }

  // ------------------------------------------------------------------ queries
  get alive() { return this.state !== 'dead'; }
  get incapped() { return this.state === 'incap'; }
  get hanging() { return this.state === 'ledge'; }
  get upright() { return this.state === 'alive' && !this.pinnedBy; }
  get total() { return this.health + this.temp; }
  get blackAndWhite() { return this.incapCount >= S.maxIncaps && this.state === 'alive'; }
  get needsHelp() { return this.state === 'incap' || this.state === 'ledge' || !!this.pinnedBy; }
  get activeWeapon() {
    if (this.inv.carry) return null;
    if (this.state === 'incap') return this.inv.secondary;
    if (this.slot === 0) return this.inv.primary;
    if (this.slot === 1) return this.inv.secondary;
    return null;
  }
  get activeItem() {
    if (this.inv.carry) return this.inv.carry.type;
    if (this.slot === 2) return this.inv.throwable;
    if (this.slot === 3) return this.inv.kit;
    if (this.slot === 4) return this.inv.pills;
    return null;
  }
  eyePos(out = new THREE.Vector3()) { return out.set(this.body.pos.x, this.body.pos.y + this.eyeH, this.body.pos.z); }
  aimDir(out = new THREE.Vector3()) {
    const cp = Math.cos(this.pitch);
    return out.set(-Math.sin(this.yaw) * cp, Math.sin(this.pitch), -Math.cos(this.yaw) * cp);
  }
  center(out = new THREE.Vector3()) { return out.set(this.body.pos.x, this.body.pos.y + (this.state === 'alive' ? 1.0 : 0.4), this.body.pos.z); }
  get position() { return this.body.pos; }

  // ------------------------------------------------------------------ inventory
  give(type, data = {}) {
    if (WEAPONS[type] || MELEE[type]) {
      const def = WEAPONS[type] || MELEE[type];
      if (def.slot === 0) {
        const old = this.inv.primary;
        this.inv.primary = new WeaponState(type);
        if (data.clip !== undefined) this.inv.primary.clip = data.clip;
        if (data.reserve !== undefined) this.inv.primary.reserve = data.reserve;
        this.switchSlot(0, true);
        return old;
      }
      // secondary slot
      const old = this.inv.secondary;
      if (type === 'pistol' && old && old.id === 'pistol') {
        const ws = new WeaponState('dual_pistols'); ws.clip = Math.min(30, old.clip + 15);
        this.inv.secondary = ws; this.switchSlot(1, true); return null;
      }
      this.inv.secondary = new WeaponState(type);
      if (data.fuel !== undefined) this.inv.secondary.fuel = data.fuel;
      this.switchSlot(1, true);
      return old;
    }
    const it = ITEMS[type];
    if (it) {
      const key = SLOT_NAMES[it.slot];
      const old = this.inv[key];
      this.inv[key] = type;
      return old;
    }
    return null;
  }
  switchSlot(slot, force = false) {
    if (this.inv.carry && !force) return;
    if (slot === this.slot && !force) return;
    const has = slot === 0 ? this.inv.primary : slot === 1 ? this.inv.secondary : slot === 2 ? this.inv.throwable : slot === 3 ? this.inv.kit : this.inv.pills;
    if (!has) return;
    const w = this.activeWeapon; if (w) w.cancelReload();
    if (this.slot !== slot) this.prevSlot = this.slot;
    this.slot = slot;
    this.deploy = this.adrenaline > 0 ? 0.25 : 0.5;
    this.throwT = -1;
    if (this.action && this.action.self) this.cancelAction();
    this.world.events.emit('deploy', this);
  }
  bestSlot() { if (this.inv.primary && (this.inv.primary.clip > 0 || this.inv.primary.reserve > 0)) return 0; return 1; }

  // ------------------------------------------------------------------ damage
  takeDamage(amount, info = {}) {
    if (this.state === 'dead' || amount <= 0) return;
    const w = this.world;
    if (this.inSaferoom && info.type === 'common' && w.saferoomLocked) return;
    if (this.invuln > 0 && info.type !== 'fall' && info.type !== 'bleed') return;
    if (info.type === 'common') {
      if (this.hitGrace > 0) return;
      this.hitGrace = S.hitGrace[w.difficulty] || 0.33;
      if (this.chainsawRun) amount *= 0.5;
    }
    this.lastHurt = w.time;
    this.stats.dmgTaken += amount;
    if (info.attacker && info.attacker.isSurvivor) { this.stats.ffTaken += amount; info.attacker.stats.ffDealt += amount; }
    w.director.onSurvivorHurt(this, amount, info);
    if (info.dir) this.lastHitDir = info.dir.clone();
    this.world.events.emit('hurt', this, amount, info);
    if (this.state === 'incap') {
      this.incapHealth -= amount * (info.type === 'common' ? 1 : 1);
      if (this.incapHealth <= 0) this.die(info);
      return;
    }
    if (this.state === 'ledge') { this.ledgeHealth -= amount; return; }
    // flinch / slow when hit by commons (adrenaline immune)
    if (this.adrenaline <= 0 && info.type !== 'bleed') this.flinch = 0.25;
    if (this.action && info.type !== 'bleed' && info.interrupt !== false && this.action.type !== 'revive' && this.action.type !== 'pour') {
      // heals and pours are interrupted by damage, revives are not
      this.cancelAction();
    }
    let a = amount;
    const permAvail = Math.max(0, this.health - 1);
    const fromPerm = Math.min(a, permAvail); this.health -= fromPerm; a -= fromPerm;
    if (a > 0 && this.temp > 0) { const ft = Math.min(a, this.temp); this.temp -= ft; a -= ft; }
    if (a > 0) {
      this.health -= a;
      if (this.health <= 0) { this.health = 0; this.goDown(info); }
    }
    if (info.type !== 'bleed' && info.type !== 'fire' && info.type !== 'acid') {
      const k = Math.min(1, amount / 20);
      this.viewPunch.x += (Math.random() - 0.5) * 0.08 * k; this.viewPunch.y += 0.05 * k;
    }
  }

  goDown(info = {}) {
    const w = this.world;
    this.inv.carry && w.dropCarry(this, true);
    const hopelessFall = info.type === 'fall' && info.fatal;
    if (this.incapCount >= S.maxIncaps || hopelessFall) { this.die(info); return; }
    this.incapCount++;
    this.stats.incaps++;
    this.state = 'incap';
    this.incapHealth = S.incapHealth;
    this.health = 0; this.temp = 0;
    this.cancelAction();
    this.throwT = -1;
    this.adrenaline = 0;
    if (this.pinnedBy && this.pinnedBy.onVictimIncapped) this.pinnedBy.onVictimIncapped(this);
    // melee swapped for a pistol while incapped
    if (this.inv.secondary.isMelee) { this.incapPistol = new WeaponState('pistol'); }
    w.events.emit('incap', this, info);
    w.message(`${this.name} is down!`, 'warn');
    w.speak(this, 'incap');
    w.director.onIncap(this);
  }

  die(info = {}) {
    if (this.state === 'dead') return;
    const w = this.world;
    if (this.pinnedBy && this.pinnedBy.releaseVictim) this.pinnedBy.releaseVictim(true);
    this.state = 'dead';
    this.deadTime = 0;
    this.stats.deaths++;
    this.health = 0; this.temp = 0;
    this.cancelAction();
    this.bodyDefibable = !info.noDefib;
    // drop everything but the secondary
    const p = this.body.pos;
    if (this.inv.primary) { w.spawnPickup(this.inv.primary.id, p.clone().add(new THREE.Vector3(0.4, 0.1, 0)), { clip: this.inv.primary.clip, reserve: this.inv.primary.reserve }); this.inv.primary = null; }
    for (const k of ['throwable', 'kit', 'pills']) if (this.inv[k]) { w.spawnPickup(this.inv[k], p.clone().add(new THREE.Vector3((Math.random() - 0.5), 0.1, (Math.random() - 0.5)))); this.inv[k] = null; }
    if (this.inv.carry) w.dropCarry(this, true);
    this.slot = 1;
    this.deathDir = Math.random() < 0.5 ? 1 : -1;
    this.deathT = 0;
    w.events.emit('death', this, info);
    w.message(`${this.name} died.`, 'bad');
    w.director.onDeath(this);
  }

  // ------------------------------------------------------------------ healing
  heal(byKit = true) {
    this.temp = 0;
    this.health = Math.min(100, this.health + Math.floor((100 - this.health) * S.medkitPercent));
    this.incapCount = 0;
  }
  revive(helper) {
    this.state = 'alive';
    this.health = 1; this.temp = S.reviveHealth - 1;
    this.invuln = 2;
    this.incapHealth = 0;
    this.stunned = 0;
    this.incapPistol = null;
    if (helper) { helper.stats.revives++; this.world.message(`${helper.name} revived ${this.name}`, 'info'); }
    this.world.events.emit('revived', this, helper);
  }
  pullUpFromLedge(helper) {
    this.state = 'alive';
    const frac = Math.max(0, this.ledgeHealth) / S.ledgeHealth;
    const h = Math.floor(this.ledgeStartHealth * frac);
    if (h <= 1) { this.health = 1; this.temp = 29; } else { this.health = Math.min(100, h); this.temp = 0; }
    this.invuln = 1.5;
    if (this.ledgePos) { this.body.pos.copy(this.ledgePos.top); this.body.vel.set(0, 0, 0); }
    this.ledgePos = null;
    if (helper) helper.stats.revives++;
    this.world.events.emit('revived', this, helper);
  }
  defib(helper) {
    this.state = 'alive';
    this.health = S.defibHealth; this.temp = 0; this.incapCount = 0;
    this.invuln = 2;
    this.slot = 1;
    this.world.message(`${helper ? helper.name : 'Someone'} brought ${this.name} back to life`, 'info');
    this.world.events.emit('revived', this, helper);
  }
  respawnAt(pos, opts = {}) {
    this.state = 'alive'; this.health = opts.health || 50; this.temp = 0; this.incapCount = 0;
    this.body.pos.copy(pos); this.body.vel.set(0, 0, 0);
    this.inv.secondary = new WeaponState('pistol');
    if (opts.primary) this.give(opts.primary);
    this.slot = opts.primary ? 0 : 1;
    this.invuln = 2;
  }
  usePills() {
    const it = this.inv.pills; if (!it) return false;
    if (it === 'pills') {
      if (this.total >= 99) return false;
      this.temp = Math.min(this.temp + S.pillsHealth, 100 - this.health);
      this.world.sound('pills_swallow', this.body.pos);
    } else {
      this.temp = Math.min(this.temp + S.adrenalineHealth, 100 - this.health);
      this.adrenaline = S.adrenalineDuration;
      this.world.sound('adrenaline_inject', this.body.pos);
    }
    this.inv.pills = null;
    this.switchSlot(this.bestSlot(), true);
    return true;
  }

  // ------------------------------------------------------------------ actions (timed, hold-to-use)
  startAction(type, target, dur, opts = {}) {
    this.action = { type, target, t: 0, dur, self: !!opts.self, needAttack: !!opts.needAttack, needAttack2: !!opts.needAttack2, needUse: !!opts.needUse };
    if (target && target.isSurvivor && type !== 'heal_other_give') target.helper = this;
    this.world.events.emit('actionStart', this, this.action);
  }
  cancelAction() {
    if (!this.action) return;
    const t = this.action.target;
    if (t && t.helper === this) t.helper = null;
    if (this.action.type === 'pour' && this.action.target && this.action.target.onPourCancel) this.action.target.onPourCancel(this);
    this.action = null;
  }
  updateAction(dt, intent) {
    const a = this.action; if (!a) return;
    const held = (a.needAttack ? intent.attack : true) && (a.needAttack2 ? intent.attack2 : true) && (a.needUse ? intent.use : true);
    const tgt = a.target;
    let valid = held && this.upright;
    if (valid && tgt && tgt.isSurvivor) {
      const d = tgt.body.pos.distanceTo(this.body.pos);
      if (d > S.useRange + 0.6) valid = false;
      if (a.type === 'revive' && !tgt.incapped) valid = false;
      if (a.type === 'ledge' && !tgt.hanging) valid = false;
      if (a.type === 'defib' && tgt.state !== 'dead') valid = false;
      if ((a.type === 'heal_other') && (!tgt.upright || tgt.pinnedBy)) valid = false;
    }
    if (valid && (a.type === 'heal_self' || a.type === 'heal_other' || a.type === 'defib' || a.type === 'deploy')) {
      if (Math.hypot(this.body.vel.x, this.body.vel.z) > 1.2) valid = false;
    }
    if (valid && a.type === 'pour' && tgt && tgt.canPour && !tgt.canPour(this)) valid = false;
    if (!valid) { this.cancelAction(); return; }
    const speed = this.adrenaline > 0 ? 2 : 1;
    a.t += dt * speed;
    if (a.t >= a.dur) this.completeAction(a);
  }
  completeAction(a) {
    const w = this.world; const t = a.target;
    this.action = null;
    if (t && t.helper === this) t.helper = null;
    switch (a.type) {
      case 'revive': t.revive(this); w.speak(t, 'thanks'); break;
      case 'ledge': t.pullUpFromLedge(this); w.speak(t, 'thanks'); break;
      case 'heal_self': this.heal(); this.inv.kit = null; this.stats.heals++; w.sound('medkit_done', this.body.pos); this.switchSlot(this.bestSlot(), true); break;
      case 'heal_other': t.heal(); this.inv.kit = null; this.stats.heals++; w.sound('medkit_done', t.body.pos); w.message(`${this.name} healed ${t.name}`, 'info'); w.speak(t, 'thanks'); this.switchSlot(this.bestSlot(), true); break;
      case 'defib': t.defib(this); this.inv.kit = null; w.sound('defib_shock', t.body.pos); this.switchSlot(this.bestSlot(), true); break;
      case 'deploy': w.deployUpgrade(this, this.inv.kit); this.inv.kit = null; this.switchSlot(this.bestSlot(), true); break;
      case 'pour': if (t && t.onPoured) t.onPoured(this); break;
      case 'use': if (t && t.onUsed) t.onUsed(this); break;
    }
    w.events.emit('actionDone', this, a);
  }

  // ------------------------------------------------------------------ main update
  update(dt, intent) {
    const w = this.world;
    this.t += dt;
    this.invuln = Math.max(0, this.invuln - dt);
    this.hitGrace = Math.max(0, this.hitGrace - dt);
    this.flinch = Math.max(0, this.flinch - dt);
    this.biled = Math.max(0, this.biled - dt);
    this.bileScreen = Math.max(0, this.bileScreen - dt);
    this.shoveCd = Math.max(0, this.shoveCd - dt);
    this.meleeCd = Math.max(0, this.meleeCd - dt);
    this.deploy = Math.max(0, this.deploy - dt);
    this.stunned = Math.max(0, this.stunned - dt);
    this.recoil = Math.max(0, this.recoil - dt * 6);
    this.shoveT = Math.max(0, this.shoveT - dt * 3);
    this.shoveFatigue = Math.max(0, this.shoveFatigue - dt * (this.shoveFatigue > S.shoveFatigueMin ? 0.8 : 1.6));
    this.viewPunch.multiplyScalar(Math.max(0, 1 - dt * 8));
    if (this.adrenaline > 0) this.adrenaline = Math.max(0, this.adrenaline - dt);
    if (this.temp > 0 && this.state === 'alive') this.temp = Math.max(0, this.temp - S.tempDecay * dt);

    if (this.state === 'dead') { this.deadTime += dt; this.updateModel(dt); return; }

    if (this.state === 'incap') {
      const allDown = w.survivors.every((s) => s.state !== 'alive' || s.pinnedBy);
      const rate = allDown || this.tongueVictim ? S.incapDecayHopeless : S.incapDecay;
      if (!this.helper) this.incapHealth -= rate * dt;
      if (this.incapHealth <= 0) { this.die({ type: 'bleed' }); return; }
    }
    if (this.state === 'ledge') {
      if (!this.helper) this.ledgeHealth -= S.ledgeDecay * dt;
      if (this.ledgeHealth <= 0) {
        // fall to death
        this.state = 'alive'; this.health = 1; this.temp = 0;
        this.body.pos.copy(this.ledgePos.hang); this.body.vel.set(this.ledgePos.out.x * 1.5, 0, this.ledgePos.out.z * 1.5);
        this.ledgePos = null; this.noLedgeGrab = 3;
        w.message(`${this.name} fell!`, 'bad');
      }
      this.updateModel(dt); return;
    }
    if (this.noLedgeGrab) this.noLedgeGrab = Math.max(0, this.noLedgeGrab - dt);

    // look
    if (!this.pinnedBy || this.state === 'incap') { this.yaw = intent.yaw; this.pitch = intent.pitch; }
    if (this.pinnedBy) { this.updatePinned(dt); this.updateModel(dt); return; }

    // movement
    if (this.state === 'alive') this.updateMovement(dt, intent);
    else { this.body.vel.set(0, this.body.vel.y - S.gravity * dt, 0); w.collision.moveCharacter(this.body, dt); }

    // actions & weapons
    if (this.action) this.updateAction(dt, intent);
    if (this.state === 'alive' && !this.action && this.stunned <= 0) this.handleInputs(dt, intent);
    else if (this.state === 'incap') this.handleIncapFire(dt, intent);
    this.updateWeapons(dt, intent);
    this.updateModel(dt);
  }

  updateMovement(dt, intent) {
    const w = this.world, b = this.body;
    // crouch
    const wantCrouch = intent.crouch && b.grounded;
    if (wantCrouch !== this.crouching) {
      if (!wantCrouch) {
        // check head room before standing
        const hit = w.collision.raycast(_v.set(b.pos.x, b.pos.y + 0.5, b.pos.z), _v2.set(0, 1, 0), S.height - 0.4, { move: true });
        if (!hit) this.crouching = false;
      } else this.crouching = true;
    }
    this.crouchAmt += ((this.crouching ? 1 : 0) - this.crouchAmt) * Math.min(1, dt * 10);
    b.height = this.crouching ? S.crouchHeight : S.height;
    const eyeT = this.crouching ? S.crouchEye : S.eyeHeight;
    this.eyeH += (eyeT - this.eyeH) * Math.min(1, dt * 12);

    let maxSpeed = S.runSpeed;
    const tot = this.total;
    if (tot < S.limpHealth) maxSpeed = S.limpSpeed;
    if (this.health <= 1 && this.temp <= 0) maxSpeed = S.critSpeed;
    if (intent.walk) maxSpeed = Math.min(maxSpeed, S.walkSpeed);
    if (this.crouching) maxSpeed = S.crouchSpeed;
    if (this.adrenaline > 0 && !this.crouching) maxSpeed = S.adrenalineSpeed;
    if (this.flinch > 0 && this.adrenaline <= 0) maxSpeed *= 0.75;
    if (this.action && (this.action.type === 'revive' || this.action.type === 'ledge' || this.action.type === 'pour' || this.action.type === 'use')) maxSpeed = 0;
    if (this.stunned > 0) maxSpeed = 0;
    if (this.inv.carry && this.inv.carry.heavy) maxSpeed *= 0.9;
    this.maxSpeed = maxSpeed;

    _fwd.set(-Math.sin(this.yaw), 0, -Math.cos(this.yaw));
    _right.set(Math.cos(this.yaw), 0, -Math.sin(this.yaw));
    const wish = _v.set(0, 0, 0).addScaledVector(_fwd, intent.moveY).addScaledVector(_right, intent.moveX);
    let wishSpeed = wish.length();
    if (wishSpeed > 1) { wish.multiplyScalar(1 / wishSpeed); wishSpeed = 1; } else if (wishSpeed > 0) wish.multiplyScalar(1 / wishSpeed);
    wishSpeed *= maxSpeed;

    if (this.fling) {
      // being thrown (tank punch / charger impact)
      this.fling.t -= dt;
      if (this.fling.t <= 0 && b.grounded) this.fling = null;
    }
    if (b.grounded && !this.fling) {
      // friction
      const sp = Math.hypot(b.vel.x, b.vel.z);
      if (sp > 0.001) {
        const control = Math.max(sp, S.stopSpeed);
        const drop = control * S.friction * dt;
        const ns = Math.max(0, sp - drop) / sp;
        b.vel.x *= ns; b.vel.z *= ns;
      }
      accelerate(b.vel, wish, wishSpeed, S.accelerate, dt);
      if (intent.jump && !this.crouching && this.stunned <= 0 && !(this.action && this.action.type === 'revive')) {
        b.vel.y = S.jumpVel; b.grounded = false;
        this.jumped = true;
      }
    } else if (!this.fling) {
      accelerate(b.vel, wish, Math.min(wishSpeed, 0.76), S.airAccelerate, dt);
    }
    // stay on moving platforms
    if (b.grounded && b.groundDynamic && b.groundDynamic.velocity) b.pos.addScaledVector(b.groundDynamic.velocity, dt);
    b.vel.y -= S.gravity * dt;
    const wasGrounded = b.grounded;
    const vyBefore = b.vel.y;
    if (wasGrounded) { this.lastGrounded.copy(b.pos); this.lastGroundedT = w.time; this.lastGroundYaw = this.yaw; }
    w.collision.moveCharacter(b, dt, { stepDown: this.jumped ? 0 : 0.3 });
    if (!b.grounded) {
      this.airTime += dt;
      this.peakFallSpeed = Math.max(this.peakFallSpeed, -b.vel.y);
      // ledge grab: walked/knocked off a high edge
      if (!this.noLedgeGrab && !this.jumped && this.airTime > 0.05 && this.airTime < 0.4 && b.vel.y < -1 && !w.isLastStanding(this)) {
        const g = w.collision.groundAt(b.pos.x, b.pos.y, b.pos.z, 7);
        if (!g || b.pos.y - g.y > 5.2) this.grabLedge();
      }
    } else {
      if (!wasGrounded) {
        // landing
        const impact = Math.max(this.peakFallSpeed, -vyBefore);
        if (impact > S.fallSafeSpeed) {
          const dmg = (impact - S.fallSafeSpeed) / (S.fallFatalSpeed - S.fallSafeSpeed) * 100;
          w.sound('land_concrete', b.pos, { volume: 1 });
          this.takeDamage(dmg, { type: 'fall', fatal: dmg > 200 });
        } else if (impact > 4) w.footstep(this, 1.4);
      }
      this.airTime = 0; this.peakFallSpeed = 0; this.jumped = false;
    }
    // footsteps
    const hs = Math.hypot(b.vel.x, b.vel.z);
    if (b.grounded && hs > 0.5) {
      const prev = this.phase;
      this.phase += hs * dt * (this.crouching ? 2.4 : 1.65);
      if (Math.floor(prev / Math.PI) !== Math.floor(this.phase / Math.PI) && !intent.walk && !this.crouching) w.footstep(this, hs > 4 ? 1 : 0.6);
    }
  }

  grabLedge() {
    const w = this.world, b = this.body;
    // find the edge: lastGrounded position, move outward until no ground
    const top = this.lastGrounded.clone();
    const out = new THREE.Vector3(b.pos.x - top.x, 0, b.pos.z - top.z);
    if (out.lengthSq() < 1e-4) out.set(-Math.sin(this.yaw), 0, -Math.cos(this.yaw));
    out.normalize();
    const hang = top.clone().addScaledVector(out, 0.55);
    hang.y = top.y;
    this.state = 'ledge';
    this.ledgeHealth = S.ledgeHealth;
    this.ledgeStartHealth = Math.max(1, this.health);
    this.ledgePos = { top, hang, out };
    b.vel.set(0, 0, 0);
    b.pos.copy(hang);
    this.cancelAction();
    if (this.inv.carry) w.dropCarry(this, true);
    w.message(`${this.name} is hanging from a ledge!`, 'warn');
    w.sound('ledge_grab', b.pos);
    w.speak(this, 'ledge');
    w.events.emit('ledge', this);
  }

  updatePinned(dt) {
    // pinner moves us; just apply gravity when the pinner does not control position
    const b = this.body;
    if (!this.pinnedBy.controlsVictim) {
      b.vel.x *= 0.8; b.vel.z *= 0.8; b.vel.y -= S.gravity * dt;
      this.world.collision.moveCharacter(b, dt);
    }
  }

  handleInputs(dt, intent) {
    const w = this.world;
    // slot switching
    if (intent.slot >= 0) this.switchSlot(intent.slot);
    if (intent.lastWeapon) this.switchSlot(this.prevSlot);
    if (intent.cycle) {
      const order = [0, 1, 2, 3, 4];
      let i = order.indexOf(this.slot);
      for (let k = 0; k < 5; k++) {
        i = (i + intent.cycle + 5) % 5;
        const has = [this.inv.primary, this.inv.secondary, this.inv.throwable, this.inv.kit, this.inv.pills][i];
        if (has) { this.switchSlot(i); break; }
      }
    }
    if (intent.flashlight) { this.flashlight = !this.flashlight; w.sound('flashlight_click', this.body.pos, { volume: 0.5 }); }
    // use
    if (intent.usePressed) {
      const t = w.findUseTarget(this);
      if (t) this.useTarget(t);
    }
    if (intent.drop && this.inv.carry) w.dropCarry(this, false);
    // shove (attack2) — except when holding pills/kit, where attack2 means give/heal other
    const item = this.activeItem;
    if (intent.attack2Pressed && (item === 'pills' || item === 'adrenaline')) {
      const t = w.findSurvivorInView(this, S.useRange);
      if (t && !t.inv.pills && t.upright) {
        t.inv.pills = item; this.inv.pills = null; this.switchSlot(this.bestSlot(), true);
        w.message(`${this.name} gave ${item === 'pills' ? 'pain pills' : 'adrenaline'} to ${t.name}`, 'info');
        w.sound('pickup_item', t.body.pos);
        w.speak(t, 'thanks');
      } else this.doShove();
    } else if (intent.attack2Pressed && item === 'medkit') {
      const t = w.findSurvivorInView(this, S.useRange);
      if (t && t.upright && t.total < 100) this.startAction('heal_other', t, S.medkitTime / (this.adrenaline > 0 ? 1 : 1), { needAttack2: true });
      else this.doShove();
    } else if (intent.attack2Pressed) this.doShove();
  }

  doShove() {
    if (this.shoveCd > 0 || this.deploy > 0.3) return;
    const w = this.world;
    const fatigued = this.shoveFatigue > S.shoveFatigueMin && this.adrenaline <= 0;
    this.shoveCd = fatigued ? S.shoveInterval + (this.shoveFatigue - S.shoveFatigueMin) * 0.45 : S.shoveInterval;
    if (this.adrenaline <= 0) this.shoveFatigue = Math.min(S.shoveFatigueMax + 1, this.shoveFatigue + 1);
    this.shoveT = 1;
    const ws = this.activeWeapon; if (ws) ws.cancelReload();
    const hits = shove(w, this, this.eyePos(_v), this.aimDir(_v2));
    w.sound(hits ? 'shove_hit' : 'shove', this.body.pos, { volume: 0.8 });
    w.events.emit('shove', this, hits);
  }

  useTarget(t) {
    const w = this.world;
    switch (t.kind) {
      case 'revive': this.startAction('revive', t.target, S.reviveTime, { needUse: true }); w.speak(this, 'reviving'); break;
      case 'ledge': this.startAction('ledge', t.target, S.reviveTime * 0.8, { needUse: true }); break;
      case 'pickup': w.pickup(this, t.target); break;
      case 'interact': if (t.target.holdTime) this.startAction('use', t.target, t.target.holdTime, { needUse: true }); else t.target.onUsed(this); break;
      case 'pour': this.startAction('pour', t.target, t.target.pourTime || 2.5, { needUse: true }); if (t.target.onPourStart) t.target.onPourStart(this); break;
      case 'carry': w.pickupCarry(this, t.target); break;
    }
  }

  handleIncapFire(dt, intent) {
    const ws = this.inv.secondary.isMelee ? (this.incapPistol || (this.incapPistol = new WeaponState('pistol'))) : this.inv.secondary;
    ws.cooldown = Math.max(0, ws.cooldown - dt);
    if (intent.reload && ws.canReload) ws.startReload(0.8);
    const ev = ws.updateReload(dt, 0.8);
    if (ev === 'done') this.world.sound('reload_mag_in', this.body.pos, { volume: 0.5 });
    if (ws.reloading > 0) return;
    if (intent.attackPressed && ws.cooldown <= 0) {
      if (ws.clip <= 0) { if (ws.canReload) ws.startReload(0.8); else this.world.sound('dry_fire', this.body.pos); return; }
      const eye = this.eyePos(_v);
      fireWeapon(this.world, this, ws, eye, this.aimDir(_v2), this.muzzleWorld());
      if (ws.id !== 'magnum') ws.cooldown = Math.max(ws.cooldown, 0.3);
      this.recoil = 1;
    }
  }

  updateWeapons(dt, intent) {
    if (this.state !== 'alive' || this.pinnedBy) return;
    const w = this.world;
    const ws = this.activeWeapon;
    // throwables
    const item = this.activeItem;
    if (this.inv.carry) {
      if (intent.attackPressed && !this.action) w.throwCarry(this);
      return;
    }
    if (this.action || this.stunned > 0) return;
    if (item && this.deploy <= 0) {
      if (item === 'pipebomb' || item === 'molotov' || item === 'bilejar') {
        if (intent.attackPressed && this.throwT < 0) { this.throwT = 0; if (item === 'pipebomb') w.sound('pipebomb_beep', this.body.pos, { volume: 0.4 }); if (item === 'molotov') w.sound('molotov_ignite', this.body.pos, { volume: 0.5 }); }
        if (this.throwT >= 0) {
          this.throwT += dt;
          if (!intent.attack && this.throwT > 0.25) {
            w.throwItem(this, item);
            this.inv.throwable = null; this.throwT = -1;
            this.switchSlot(this.bestSlot(), true);
          }
        }
      } else if (item === 'medkit') {
        if (intent.attackPressed) { if (this.total < 100 || this.incapCount > 0) this.startAction('heal_self', this, S.medkitTime, { needAttack: true, self: true }); }
      } else if (item === 'defib') {
        if (intent.attackPressed) {
          const body = w.findDeadBody(this);
          if (body) this.startAction('defib', body, S.defibTime, { needAttack: true });
        }
      } else if (item === 'upgrade_incendiary' || item === 'upgrade_explosive') {
        if (intent.attackPressed) this.startAction('deploy', null, 1.9, { needAttack: true, self: true });
      } else if (item === 'pills' || item === 'adrenaline') {
        if (intent.attackPressed) this.usePills();
      }
      return;
    }
    if (!ws) return;
    ws.cooldown = Math.max(0, ws.cooldown - dt);
    // spread recovery
    if (ws.def.spread) ws.spread = Math.max(0, ws.spread - ws.def.spread[4] * dt);
    const speedMul = this.adrenaline > 0 ? 1.5 : 1;
    // reload progress
    const ev = ws.updateReload(dt, speedMul);
    if (ev === 'shell') { w.sound('shotgun_shell_insert', this.body.pos, { volume: 0.6 }); }
    if (ev === 'done') {
      if (ws.def.reloadShell) { w.sound('shotgun_pump', this.body.pos, { volume: 0.7 }); }
      else { w.sound(ws.def.kind === 'rifle' || ws.def.kind === 'sniper' ? 'reload_bolt' : ws.def.kind === 'pistol' ? 'pistol_slide' : 'reload_mag_in', this.body.pos, { volume: 0.7 }); }
    }
    if (this.deploy > 0) return;
    if (intent.reload && ws.canReload && ws.reloading <= 0) { if (ws.startReload(speedMul)) { w.sound('reload_mag_out', this.body.pos, { volume: 0.6 }); w.speak(this, 'reloading', 0.5); } }
    // melee
    if (ws.isMelee) {
      if (ws.def.kind === 'chainsaw') { this.updateChainsaw(dt, intent, ws); return; }
      if (this.swingT > 0) {
        this.swingT += dt / ws.def.refire;
        if (!this.swingHitDone && this.swingT > 0.22) {
          this.swingHitDone = true;
          const hits = meleeHit(w, this, ws.def, this.eyePos(_v), this.aimDir(_v2));
          w.sound(hits ? (ws.def.type === 'slash' ? 'melee_blade_hit' : 'melee_hit_flesh') : 'melee_swing', this.body.pos, { volume: hits ? 0.9 : 0.5 });
          if (!hits) {
            const hit = w.collision.raycast(this.eyePos(_v), this.aimDir(_v2), ws.def.reach, {});
            if (hit) { w.sound('melee_hit_world', hit.point); w.effects.impact(hit.point, hit.normal, hit.surface); }
          }
        }
        if (this.swingT >= 1) this.swingT = 0;
      } else if (intent.attack && this.meleeCd <= 0 && this.shoveT <= 0.3) {
        this.swingT = 0.001; this.swingHitDone = false; this.meleeCd = ws.def.refire;
        w.sound('melee_swing', this.body.pos, { volume: 0.6 });
        this.swingDir = -this.swingDir || 1;
        w.events.emit('melee', this);
      }
      return;
    }
    // firing
    if (ws.reloading > 0) {
      // shotguns can interrupt reload to fire
      if (ws.shellReload && intent.attackPressed && ws.clip > 0) ws.cancelReload();
      else return;
    }
    const d = ws.def;
    if (ws.burstLeft > 0) {
      ws.burstTimer -= dt;
      if (ws.burstTimer <= 0 && ws.clip > 0) {
        this.shoot(ws); ws.burstLeft--; ws.burstTimer = d.cycle;
        if (ws.burstLeft === 0) ws.cooldown = d.burstDelay + d.cycle;
      } else if (ws.clip <= 0) ws.burstLeft = 0;
      return;
    }
    const wantFire = d.semi || d.burst ? intent.attackPressed : intent.attack;
    if (wantFire && ws.cooldown <= 0 && this.shoveT < 0.5) {
      if (ws.clip <= 0) {
        if (ws.canReload) { ws.startReload(speedMul); w.sound('reload_mag_out', this.body.pos, { volume: 0.6 }); w.speak(this, 'reloading', 0.5); }
        else { w.sound('dry_fire', this.body.pos, { volume: 0.6 }); ws.cooldown = 0.3; if (d.noReload) { this.inv.primary = null; this.switchSlot(1, true); } }
        return;
      }
      if (d.burst) { ws.burstLeft = d.burst - 1; ws.burstTimer = d.cycle; }
      this.shoot(ws);
      if (ws.clip === 0 && ws.canReload) { ws.cooldown = Math.max(ws.cooldown, 0.2); }
    }
    // auto reload when empty and trigger released
    if (ws.clip === 0 && !intent.attack && ws.canReload && ws.reloading <= 0 && ws.cooldown <= 0) { ws.startReload(speedMul); w.sound('reload_mag_out', this.body.pos, { volume: 0.6 }); }
  }

  shoot(ws) {
    const w = this.world;
    const eye = this.eyePos(_v);
    const dir = this.aimDir(_v2);
    // apply view punch to aim for recoil feel
    if (fireWeapon(w, this, ws, eye, dir, this.muzzleWorld())) {
      this.recoil = 1;
      this.lastFire = w.time;
      this.stats.shots++;
      const kick = (ws.def.kick || 1) * 0.012;
      this.viewPunch.y += kick * (0.8 + Math.random() * 0.4);
      this.viewPunch.x += (Math.random() - 0.5) * kick * 0.6;
      if (ws.def.pump) { this.pumpT = 0.001; w.sound('shotgun_pump', this.body.pos, { volume: 0.5, delay: 0.35 }); }
    }
  }

  updateChainsaw(dt, intent, ws) {
    const w = this.world;
    this.chainsawRun = intent.attack && ws.fuel > 0;
    if (this.chainsawRun) {
      ws.fuel -= dt;
      ws.cooldown -= dt;
      if (ws.cooldown <= 0) {
        ws.cooldown = ws.def.hitInterval;
        const hits = meleeHit(w, this, { reach: ws.def.reach + 0.6, arc: 0.6, type: 'saw', chainsaw: true, dmg: ws.def.dmg }, this.eyePos(_v), this.aimDir(_v2));
        if (hits) w.effects.blood(this.eyePos(_v).addScaledVector(this.aimDir(_v2), 1.2), this.aimDir(_v2), 0.8);
      }
      w.noise(this.body.pos, 500 * U, this);
      if (ws.fuel <= 0) { this.inv.secondary = new WeaponState('pistol'); this.switchSlot(1, true); }
    }
    w.chainsawSound(this, this.chainsawRun);
  }

  muzzleWorld(out = new THREE.Vector3()) {
    if (this.isPlayer && this.controller && this.controller.muzzleWorld) return this.controller.muzzleWorld(out);
    const eye = this.eyePos(out);
    const d = this.aimDir(_mz1);
    _mz2.set(Math.cos(this.yaw), 0, -Math.sin(this.yaw));
    eye.addScaledVector(d, 0.7).addScaledVector(_mz2, 0.15);
    eye.y -= 0.15;
    return eye;
  }

  // ------------------------------------------------------------------ model / animation
  updateModel(dt) {
    const w = this.world;
    const m = this.rig.mesh;
    const b = this.body;
    m.position.copy(b.pos);
    const showModel = !(this.isPlayer && w.cameraMode === 'fp' && this.state !== 'dead');
    m.visible = showModel;
    this.glow.visible = showModel && !this.isPlayer && this.state !== 'dead';
    if (this.glow.visible) {
      const c = this.needsHelp ? [1.0, 0.4, 0.0] : this.biled > 0 ? [0.95, 0.55, 0.05] : [0.3, 0.4, 1.0];
      this.glow.material.uniforms.uGlow.value.setRGB(c[0], c[1], c[2]);
    }
    if (!showModel && !this.isPlayer) return;
    const a = this.anim;
    const speed = Math.hypot(b.vel.x, b.vel.z);
    let yaw = this.yaw;
    if (this.state === 'dead') {
      this.deathT = Math.min(1, (this.deathT || 0) + dt * 1.6);
      A.poseDeath(a, this.deathDir || 1, this.deathT, this.index % 3);
    } else if (this.state === 'incap') A.poseIncap(a, this.t, this.pitch);
    else if (this.state === 'ledge') { A.poseLedge(a, this.t, 1 - this.ledgeHealth / S.ledgeHealth); if (this.ledgePos) yaw = Math.atan2(this.ledgePos.out.x, this.ledgePos.out.z) + Math.PI; }
    else if (this.pinnedBy) {
      const kind = this.pinnedBy.pinPose;
      if (kind === 'back') A.posePinnedBack(a, this.t);
      else if (kind === 'choke') A.poseChoked(a, this.t, this.pinnedBy.dragging);
      else if (kind === 'ride') { this.phase += speed * dt * 1.65; A.poseRidden(a, this.t, this.phase, speed); }
      else if (kind === 'carried') A.posePinnedBack(a, this.t, 0.5);
      if (this.pinnedBy.victimYaw !== undefined) yaw = this.pinnedBy.victimYaw;
    } else if (this.action && (this.action.type === 'revive' || this.action.type === 'ledge' || this.action.type === 'defib' || this.action.type === 'heal_other' || this.action.type === 'heal_self')) A.poseKneel(a, this.t);
    else {
      const fwdSpeed = (-Math.sin(this.yaw) * b.vel.x - Math.cos(this.yaw) * b.vel.z);
      let kind = 'none';
      const wsA = this.activeWeapon;
      if (this.inv.carry) kind = 'carry';
      else if (this.throwT >= 0) kind = 'throw';
      else if (wsA) kind = wsA.def.kind;
      else if (this.activeItem) kind = 'item';
      A.poseSurvivor(a, {
        t: this.t, phase: this.phase, speed, crouch: this.crouchAmt, airborne: !b.grounded && this.airTime > 0.15, pitch: this.pitch, kind,
        back: fwdSpeed < -0.3, recoil: this.recoil, reload: wsA && wsA.reloading > 0 ? 1 - wsA.reloading / Math.max(0.01, wsA.reloadTotal) : 0,
        swing: this.swingT, shove: this.shoveT, throwT: this.throwT >= 0 ? Math.min(1, this.throwT * 2) : 0,
      });
      if (this.stunned > 0) A.posePinnedBack(a, this.t, 0.3);
    }
    m.rotation.set(0, yaw + Math.PI, 0);
    a.apply(dt);
    // light probe
    if (w.probeAt) { this.probe = w.probeAt(b.pos, this.probe); this.rig.material.uniforms.uAmbient.value.copy(this.probe); }
    this.updateHeldModel();
  }

  updateHeldModel() {
    let key = null;
    const ws = this.state === 'incap' ? (this.inv.secondary.isMelee ? null : this.inv.secondary) : this.activeWeapon;
    if (this.state === 'dead' || this.state === 'ledge' || this.pinnedBy) key = null;
    else if (this.inv.carry) key = 'item:' + this.inv.carry.type;
    else if (ws) key = 'weapon:' + (ws.id === 'dual_pistols' ? 'pistol' : ws.id);
    else if (this.activeItem) key = 'item:' + this.activeItem;
    if (this.state === 'incap' && !key) key = 'weapon:pistol';
    if (key === this.heldKey) return;
    if (this.heldModel) { this.heldModel.parent && this.heldModel.parent.remove(this.heldModel); this.heldModel = null; }
    this.heldKey = key;
    if (!key) return;
    const [kind, id] = key.split(':');
    let model;
    try { model = kind === 'weapon' ? buildWeaponModel(id) : buildItemModel(id); } catch (e) { return; }
    const long = kind === 'weapon' && ['rifle', 'smg', 'shotgun', 'sniper', 'launcher', 'mg'].includes(model.userData.kind);
    if (long) {
      // long guns attach to the chest so they track aim pitch; barrel (model -Z) to rig +Z
      const chest = this.rig.bones[B.chest];
      model.position.set(-0.13, 0.12, 0.22);
      model.rotation.set(0, Math.PI, 0);
      chest.add(model);
    } else if (kind === 'item' && (id === 'gascan' || id === 'cola' || id === 'propane' || id === 'oxygen')) {
      const chest = this.rig.bones[B.spine];
      model.position.set(0, -0.25, 0.32);
      chest.add(model);
    } else {
      const hand = this.rig.bones[B.handR];
      model.position.set(0, -0.1, 0.02);
      model.rotation.set(-Math.PI / 2, Math.PI, 0);
      hand.add(model);
    }
    this.heldModel = model;
  }

  dispose() {
    this.world.scene.remove(this.rig.mesh);
    this.world.glowScene.remove(this.glow);
  }
}

Survivor.prototype.isSurvivor = true;

function accelerate(vel, wishDir, wishSpeed, accel, dt) {
  const cur = vel.x * wishDir.x + vel.z * wishDir.z;
  const add = wishSpeed - cur;
  if (add <= 0) return;
  const acc = Math.min(accel * dt * Math.max(wishSpeed, 1) * 1.6, add);
  vel.x += wishDir.x * acc; vel.z += wishDir.z * acc;
}
