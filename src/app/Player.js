// Playing as one soldier. The AI lets go of him and the keyboard and mouse
// take over: WASD to move, Shift to sprint, the mouse to look (the pointer is
// locked to the view), the left button to fire, E (or the right button) to
// aim down the sights, R to reload, C to crouch, Z to go prone, Space to
// stand, G to throw a grenade, F to strike with the rifle butt, Q / 1 / 2 /
// the wheel to change weapons, B to dress a wound, V for an over-the-shoulder
// view, Esc to hand him back to the AI. When he falls, Enter takes over the
// nearest soldier of his side.

import * as THREE from 'three';
import { clamp, damp, approach, angleDiff } from '../core/math.js';
import { VIEW_VARIANTS } from '../render/Viewmodel.js';
import { hash01 } from '../core/rng.js';

const _o = new THREE.Vector3();
const _d = new THREE.Vector3();
const _m = new THREE.Vector3();
const _p = new THREE.Vector3();
const _t = new THREE.Vector3();
const _e = new THREE.Euler(0, 0, 0, 'YXZ');
const _hit = {};

const LOOK = 0.0022; // rad per pixel of mouse movement
const KEY_TURN = 1.9; // rad/s with the arrow keys
const MAX_AIM = 600;

export function variantOf(def) {
  const id = def.id;
  if (id === 'rpg') return 3;
  if (id === 'javelin' || id === 'manpads') return 4;
  if (id === 'pistol') return 5;
  if (id === 'dmr') return 2;
  if (id.startsWith('lmg') || id.startsWith('gpmg')) return 1;
  return 0;
}

export class Player {
  constructor(app) {
    this.app = app;
    this.u = null;
    this.active = false;
    this.damageScale = 0.6;
    this.keys = new Set();
    this.locked = false;
    this.noLock = false;
    this.paused = false;
    this.view = 'first';
    this.reset();
    const canvas = app.canvas;
    canvas.addEventListener('mousedown', (e) => this.mouseDown(e));
    window.addEventListener('mouseup', (e) => this.mouseUp(e));
    document.addEventListener('mousemove', (e) => this.mouseMove(e));
    canvas.addEventListener('wheel', (e) => {
      if (this.active && this.alive) this.cycle(Math.sign(e.deltaY));
    }, { passive: true });
    document.addEventListener('pointerlockchange', () => this.lockChange());
    document.addEventListener('pointerlockerror', () => {
      this.noLock = true;
    });
    window.addEventListener('keyup', (e) => this.keys.delete(e.code));
    window.addEventListener('blur', () => {
      this.keys.clear();
      this.trigger = false;
      this.rmb = false;
    });
  }

  reset() {
    this.yaw = 0;
    this.pitch = 0;
    this.kick = 0;
    this.kickYaw = 0;
    this.trigger = false;
    this.edge = false;
    this.rmb = false;
    this.adsWant = false;
    this.adsT = 0;
    this.sprintT = 0;
    this.slot = 0;
    this.acc = 0;
    this.shotT = 10;
    this.bloom = 0;
    this.bob = 0;
    this.swayX = 0;
    this.swayY = 0;
    this.lookDX = 0;
    this.lookDY = 0;
    this.hurt = 0;
    this.hurtDir = 0;
    this.hitT = 0;
    this.hitHead = false;
    this.killT = 0;
    this.killName = '';
    this.msg = '';
    this.msgT = 0;
    this.lockT = 0;
    this.lockOn = null;
    this.bandageT = 0;
    this.meleeT = 0;
    this.switchT = 0;
    this.eyeY = 1.65;
    this.deathT = 0;
    this.lastHp = 100;
    this.camPos = new THREE.Vector3();
    this.since = 0;
  }

  get alive() {
    return !!this.u && this.u.alive && !this.u.downed;
  }

  get weapons() {
    return this.u ? this.u.weapons.filter((w) => w.def.id !== 'frag') : [];
  }

  get weapon() {
    const ws = this.weapons;
    return ws[Math.min(this.slot, ws.length - 1)] || null;
  }

  // ------------------------------------------------------------ control

  canTake(u) {
    return !!u && u.cat === 'inf' && u.alive && !u.downed && !u.dying && !u.mounted && !u.para && !u.climb && !u.hidden && u.def.role !== 'pilot';
  }

  take(u) {
    if (!this.canTake(u)) return false;
    const app = this.app;
    const w = app.world;
    if (this.u && this.u !== u) this.letGo();
    this.reset();
    this.u = u;
    this.active = true;
    u.player = this;
    u.ctrl = { x: 0, z: 0, mode: 'run' };
    u.stop();
    u.task = null;
    u.target = null;
    u.faceYaw = null;
    u.skill = Math.max(u.skill, 1.15);
    if (u.cover && w.cover) w.cover.release(u);
    u.cover = null;
    this.yaw = u.yaw;
    this.pitch = 0;
    this.lastHp = u.hp;
    this.eyeY = this.eyeHeight();
    this.slot = 0;
    app.paused = false;
    app.timeScaleIdx = 2;
    app.select(null);
    app.camera.setMode('play', w);
    app.renderer.infantry.hide = this.view === 'first' ? u : null;
    app.hud.setPlaying(true);
    this.requestLock();
    this.say(`You are ${u.name}${u.squad && u.squad.callsign ? `, ${u.squad.callsign}` : ''}`, 2.5);
    return true;
  }

  // Hand the soldier back to the AI.
  letGo() {
    const u = this.u;
    if (!u) return;
    u.player = null;
    u.ctrl = null;
    u.nextThink = 0;
    if (u.weapons) for (const w of u.weapons) w.release();
  }

  // Back to spectating (follow the soldier if he lives).
  leave() {
    const app = this.app;
    const u = this.u;
    this.letGo();
    this.active = false;
    this.paused = false;
    this.u = null;
    app.paused = false;
    app.renderer.infantry.hide = null;
    app.renderer.viewmodel.pass.enabled = false;
    app.hud.setPlaying(false);
    if (document.pointerLockElement) document.exitPointerLock();
    if (u && u.alive && !u.removed) {
      app.select(u);
      app.camera.follow(u, 'follow');
    } else app.camera.setMode('free', app.world);
  }

  // Take over the nearest soldier on the same side (squadmates first).
  next() {
    const old = this.u;
    if (!old) return;
    const w = this.app.world;
    const sq = old.squad || (old.downed && old.downed.squad);
    let best = null;
    let bs = Infinity;
    for (const u of w.factions[old.faction].units) {
      if (u === old || !this.canTake(u)) continue;
      const d = Math.hypot(u.pos.x - old.pos.x, u.pos.z - old.pos.z) - (sq && u.squad === sq ? 400 : 0);
      if (d < bs) {
        bs = d;
        best = u;
      }
    }
    if (best) this.take(best);
    else this.say('No one left to take over', 2);
  }

  requestLock() {
    if (this.noLock) return;
    const c = this.app.canvas;
    try {
      const r = c.requestPointerLock && c.requestPointerLock();
      if (r && r.catch) r.catch(() => {
        this.noLock = true;
      });
    } catch (e) {
      this.noLock = true;
    }
  }

  lockChange() {
    const was = this.locked;
    this.locked = document.pointerLockElement === this.app.canvas;
    if (was && !this.locked && this.active && this.alive) {
      // Esc released the mouse: hold the battle until the player clicks back
      // in (or presses Esc again to leave).
      this.paused = true;
      this.app.paused = true;
      this.trigger = false;
    } else if (this.locked) {
      this.paused = false;
      this.app.paused = false;
    }
  }

  mouseDown(e) {
    if (!this.active || !this.alive) return;
    if (this.paused || (!this.locked && !this.noLock)) {
      // First click (re)captures the mouse rather than firing.
      this.paused = false;
      this.app.paused = false;
      this.requestLock();
      return;
    }
    if (e.button === 0) {
      this.trigger = true;
      this.edge = true;
    } else if (e.button === 2) this.rmb = true;
  }

  mouseUp(e) {
    if (e.button === 0) this.trigger = false;
    else if (e.button === 2) this.rmb = false;
  }

  mouseMove(e) {
    if (!this.active || this.paused) return;
    if (!this.locked && !this.noLock) return;
    this.lookDX += e.movementX || 0;
    this.lookDY += e.movementY || 0;
  }

  // Keys while playing; returns true when the key was used.
  keydown(e) {
    if (!this.active) return false;
    const code = e.code;
    this.keys.add(code);
    if (code === 'Escape') {
      if (!this.locked || this.paused || !this.alive) this.leave();
      return true;
    }
    if (code === 'Enter' || code === 'NumpadEnter') {
      if (!this.alive) this.next();
      return true;
    }
    if (code === 'KeyV') {
      this.view = this.view === 'first' ? 'third' : 'first';
      this.app.renderer.infantry.hide = this.view === 'first' ? this.u : null;
      return true;
    }
    if (code === 'KeyH') {
      this.since = 0;
      return true;
    }
    if (!this.alive) return ['KeyW', 'KeyA', 'KeyS', 'KeyD', 'KeyQ', 'KeyE', 'KeyR', 'KeyF', 'KeyG', 'KeyC', 'KeyZ', 'KeyB', 'Space', 'Digit1', 'Digit2', 'Digit3', 'Digit4', 'Digit5', 'Digit6'].includes(code);
    const u = this.u;
    switch (code) {
      case 'KeyE':
        this.adsWant = !this.adsWant;
        return true;
      case 'KeyR': {
        const w = this.weapon;
        if (w && w.mag < (w.def.mag ?? 1) && w.reserve > 0) w.startReload();
        return true;
      }
      case 'KeyC':
        u.stance = u.stance === 1 ? 0 : 1;
        return true;
      case 'KeyZ':
      case 'KeyX':
        u.stance = u.stance === 2 ? 0 : 2;
        return true;
      case 'Space':
        u.stance = 0;
        e.preventDefault();
        return true;
      case 'KeyG':
        this.throwGrenade();
        return true;
      case 'KeyF':
        this.melee();
        return true;
      case 'KeyB':
        if (u.bleed > 0 && this.bandageT <= 0) {
          this.bandageT = 3;
          this.say('Dressing the wound…', 3);
        }
        return true;
      case 'KeyQ':
        this.cycle(1);
        return true;
      case 'Digit1':
      case 'Digit2':
      case 'Digit3':
        this.select(+code.slice(5) - 1);
        return true;
      case 'Digit4':
      case 'Digit5':
      case 'Digit6':
      case 'Tab':
        return code !== 'Tab';
      default:
        return ['KeyW', 'KeyA', 'KeyS', 'KeyD', 'ShiftLeft', 'ShiftRight', 'ArrowUp', 'ArrowDown', 'ArrowLeft', 'ArrowRight'].includes(code);
    }
  }

  select(i) {
    const ws = this.weapons;
    if (i < 0 || i >= ws.length || i === this.slot) return;
    const old = this.weapon;
    if (old) old.release();
    this.slot = i;
    this.switchT = 0.45;
    this.acc = 0;
    this.lockT = 0;
    this.lockOn = null;
  }

  cycle(dir) {
    const n = this.weapons.length;
    if (n > 1) this.select((this.slot + dir + n) % n);
  }

  say(text, t = 1.8) {
    this.msg = text;
    this.msgT = t;
  }

  eyeHeight() {
    const u = this.u;
    const s = u.stanceT;
    // Stand 1.65, crouch 1.1, prone 0.35, blended like the body.
    return s < 1 ? 1.65 - 0.55 * s : 1.1 - 0.75 * (s - 1);
  }

  // ------------------------------------------------------------ per frame

  // Before the simulation step: look, move, shoot.
  beforeSim(dt, simDt) {
    const u = this.u;
    if (!u) return;
    this.since += dt;
    if (u.removed) {
      this.leave();
      return;
    }
    // Look.
    const k = this.keys;
    const zoom = this.app.camera.camera.fov / 70;
    this.yaw -= this.lookDX * LOOK * zoom;
    this.pitch -= this.lookDY * LOOK * zoom;
    this.swayX = clamp(this.swayX + this.lookDX * 0.0004, -0.04, 0.04);
    this.swayY = clamp(this.swayY + this.lookDY * 0.0004, -0.04, 0.04);
    this.lookDX = 0;
    this.lookDY = 0;
    if (k.has('ArrowLeft')) this.yaw += KEY_TURN * zoom * dt;
    if (k.has('ArrowRight')) this.yaw -= KEY_TURN * zoom * dt;
    if (k.has('ArrowUp')) this.pitch += KEY_TURN * 0.6 * zoom * dt;
    if (k.has('ArrowDown')) this.pitch -= KEY_TURN * 0.6 * zoom * dt;
    this.pitch = clamp(this.pitch, -1.45, 1.45);
    this.swayX *= 1 - damp(10, dt);
    this.swayY *= 1 - damp(10, dt);
    // Recoil settles back.
    this.kick *= 1 - damp(7, simDt);
    this.kickYaw *= 1 - damp(7, simDt);
    this.bloom = Math.max(0, this.bloom - simDt * 1.6);
    this.hurt = Math.max(0, this.hurt - dt * 0.8);
    this.hitT = Math.max(0, this.hitT - dt);
    this.killT = Math.max(0, this.killT - dt);
    this.msgT = Math.max(0, this.msgT - dt);
    this.switchT = Math.max(0, this.switchT - dt);
    this.meleeT = Math.max(0, this.meleeT - simDt);
    // Damage taken: flash and point to where it came from.
    if (u.hp < this.lastHp - 0.5) {
      this.hurt = Math.min(1, this.hurt + (this.lastHp - u.hp) / 45);
      const h = u.lastHit;
      if (h) this.hurtDir = Math.atan2(-h.dx, -h.dz);
    }
    this.lastHp = u.hp;
    if (!this.alive) {
      u.ctrl && (u.ctrl.x = u.ctrl.z = 0);
      this.trigger = false;
      this.deathT += dt;
      return;
    }
    // Moving.
    const fx = Math.sin(this.yaw);
    const fz = Math.cos(this.yaw);
    let mf = 0;
    let ms = 0;
    if (k.has('KeyW')) mf += 1;
    if (k.has('KeyS')) mf -= 1;
    if (k.has('KeyA')) ms -= 1;
    if (k.has('KeyD')) ms += 1;
    const w = this.weapon;
    const reloading = !!w && w.reloadT > 0;
    const sprint = (k.has('ShiftLeft') || k.has('ShiftRight')) && mf > 0 && !this.trigger && !this.edge && this.bandageT <= 0 && !u.wounded;
    if (sprint && u.stance !== 0) u.stance = 0;
    const ads = (this.adsWant || this.rmb) && !sprint && !reloading && this.bandageT <= 0 && this.switchT <= 0;
    if (sprint) this.adsWant = false;
    this.adsT = approach(this.adsT, ads ? 1 : 0, dt * 6);
    this.sprintT = approach(this.sprintT, sprint ? 1 : 0, dt * 5);
    const ctrl = u.ctrl;
    // Right of the view is (-cos yaw, sin yaw).
    ctrl.x = fx * mf - fz * ms;
    ctrl.z = fz * mf + fx * ms;
    ctrl.mode = sprint ? 'sprint' : this.adsT > 0.5 || mf < 0 ? 'walk' : 'run';
    u.yaw = this.yaw;
    u.aiming = !sprint;
    u.aimYaw = this.yaw;
    u.aimPitch = clamp(this.pitch + this.kick, -0.8, 1.3);
    u.weapon = w;
    u.faceYaw = null;
    // Dressing a wound.
    if (this.bandageT > 0) {
      this.bandageT -= simDt;
      if (this.bandageT <= 0) {
        u.bleed = 0;
        u.hp = Math.min(u.maxHp, u.hp + 8);
        this.lastHp = u.hp;
        this.say('Bleeding stopped', 1.5);
      }
    }
    this.fire(simDt, sprint);
    this.edge = false;
  }

  spread() {
    const u = this.u;
    const w = this.weapon;
    if (!w) return 0;
    const def = w.def;
    let s = def.spread || 0.003;
    s *= 1 + (1 - this.adsT) * (def.kind === 'bullet' ? 5 : 1.5);
    s *= u.stance === 2 ? 0.6 : u.stance === 1 ? 0.8 : 1;
    s *= 1 + Math.min(u.speed, 6) * 0.35;
    s *= 1 + this.bloom * 2.5;
    s *= 1 + u.suppression * 0.8;
    if (u.wounded) s *= 1.3;
    return s;
  }

  fire(simDt, sprint) {
    const u = this.u;
    const w = this.weapon;
    this.shotT += simDt;
    if (!w || simDt <= 0) return;
    const def = w.def;
    // Missiles need a lock: hold the sight on a vehicle or aircraft.
    if (def.kind === 'missile') this.updateLock(simDt);
    // A click shorter than a frame still fires (edge).
    if (!(this.trigger || this.edge) || sprint || this.bandageT > 0 || this.switchT > 0 || this.meleeT > 0.3) {
      this.acc = 0;
      return;
    }
    if (w.reloadT > 0 || w.disabled) return;
    if (w.mag <= 0) {
      if (this.edge) {
        if (w.reserve > 0) w.startReload();
        else this.say('Out of ammunition', 1.2);
      }
      return;
    }
    const interval = 60 / def.rpm;
    const auto = def.kind === 'bullet' && def.rpm >= 300;
    let n = 0;
    if (auto) {
      if (this.edge && this.shotT >= interval) this.acc = interval;
      else this.acc += simDt;
      n = Math.floor(this.acc / interval);
      this.acc -= n * interval;
    } else if (this.edge && this.shotT >= Math.min(interval, def.kind === 'bullet' ? 0.25 : interval)) n = 1;
    n = Math.min(n, w.mag);
    if (n <= 0) return;
    if (def.kind === 'missile' && !(this.lockOn && this.lockT >= this.lockNeed(def))) {
      if (this.edge) this.say(this.lockOn ? 'Locking…' : 'No lock: hold the sight on a target', 1.4);
      return;
    }
    if (def.minRange && def.kind !== 'bullet' && this.aimDistance() < def.minRange * 0.5) {
      if (this.edge) this.say('Too close', 1);
      return;
    }
    this.shoot(w, n, simDt);
  }

  lockNeed(def) {
    return def.antiAir ? 1.2 : 1.8;
  }

  updateLock(dt) {
    const u = this.u;
    const w = this.weapon;
    const anti = !!w.def.antiAir;
    if (this.adsT < 0.8) {
      this.lockT = 0;
      this.lockOn = null;
      return;
    }
    const cam = this.app.renderer.camera;
    cam.getWorldDirection(_d);
    let best = null;
    let bs = 0.045;
    for (const e of this.app.world.factions[1 - u.faction].units) {
      if (!e.alive || e.hidden || (anti ? e.cat !== 'air' : e.cat !== 'veh')) continue;
      _t.set(e.pos.x - cam.position.x, e.pos.y + (e.cat === 'veh' ? e.spec.height * 0.5 : 0) - cam.position.y, e.pos.z - cam.position.z);
      const d = _t.length();
      if (d > w.def.range || d < (w.def.minRange || 0)) continue;
      const off = Math.acos(clamp(_t.dot(_d) / d, -1, 1));
      if (off < bs) {
        bs = off;
        best = e;
      }
    }
    if (best && best === this.lockOn) this.lockT += dt;
    else {
      this.lockOn = best;
      this.lockT = 0;
    }
  }

  // Distance to whatever is under the crosshair (terrain or a structure).
  aimDistance() {
    const cam = this.app.renderer.camera;
    const w = this.app.world;
    cam.getWorldDirection(_d);
    _o.copy(cam.position);
    const ex = _o.x + _d.x * MAX_AIM;
    const ey = _o.y + _d.y * MAX_AIM;
    const ez = _o.z + _d.z * MAX_AIM;
    let t = w.terrain.segmentHit(_o.x, _o.y, _o.z, ex, ey, ez, 2);
    if (t < 0) t = 1;
    const h = w.structures.segmentHit(_o.x, _o.y, _o.z, ex, ey, ez, _hit);
    if (h && h.t < t) t = h.t;
    return Math.max(2, t * MAX_AIM);
  }

  shoot(w, n, simDt) {
    const u = this.u;
    const def = w.def;
    const world = this.app.world;
    w.mag -= n;
    w.shots += n;
    w.newBurst = true;
    if (w.mag <= 0 && w.reserve > 0) w.startReload();
    // From the muzzle toward the point under the crosshair.
    const D = this.aimDistance();
    const cam = this.app.renderer.camera;
    cam.getWorldDirection(_d);
    _p.copy(cam.position).addScaledVector(_d, D);
    if (this.view === 'first') this.app.renderer.viewmodel.muzzle(_m);
    else u.muzzlePos(_m);
    // Never start a round on the far side of a wall right in front of us.
    if (world.structures.segmentHit(cam.position.x, cam.position.y, cam.position.z, _m.x, _m.y, _m.z, _hit)) _m.copy(cam.position).addScaledVector(_d, 0.2);
    _o.subVectors(_p, _m).normalize();
    // Top-attack missiles leave the tube climbing.
    if (def.topAttack) _o.set(_o.x, _o.y + 0.25, _o.z).normalize();
    const extra = {};
    let target = null;
    if (def.kind === 'missile') {
      target = this.lockOn;
      extra.guided = true;
      this.lockT = 0;
    }
    world.fireRounds(u, w, _m, _o, n, def.kind === 'missile' ? 0 : this.spread(), target, simDt, extra);
    this.shotT = 0;
    // Recoil: the muzzle climbs and wanders, heavier guns kick harder.
    const k = def.kind === 'bullet' ? (def.damage > 90 ? 0.035 : def.mag >= 100 ? 0.011 : 0.014) : 0.05;
    const steady = u.stance === 2 ? 0.55 : u.stance === 1 ? 0.8 : 1;
    for (let i = 0; i < n; i++) {
      this.kick += k * steady * (0.8 + Math.random() * 0.4);
      this.kickYaw += k * steady * (Math.random() - 0.45) * 0.6;
      this.pitch += k * steady * 0.25;
    }
    this.bloom = Math.min(1, this.bloom + 0.12 * n);
  }

  throwGrenade() {
    const u = this.u;
    const w = u.weapons.find((k) => k.def.id === 'frag');
    if (!w || u.grenades <= 0) {
      this.say('No grenades', 1.2);
      return;
    }
    if (w.reloadT > 0 || w.mag <= 0 || this.switchT > 0) return;
    w.mag--;
    w.startReload();
    u.grenades--;
    u.throwT = 0;
    const cam = this.app.renderer.camera;
    cam.getWorldDirection(_d);
    // Lobbed a little above the crosshair.
    const p = Math.atan2(_d.y, Math.hypot(_d.x, _d.z)) + 0.22;
    const h = Math.hypot(_d.x, _d.z) || 1;
    _o.set((_d.x / h) * Math.cos(p), Math.sin(p), (_d.z / h) * Math.cos(p));
    _m.copy(cam.position).addScaledVector(_d, 0.4);
    _m.y -= 0.1;
    const world = this.app.world;
    world.fireRounds(u, w, _m, _o, 1, 0.01, null, 0.016, { speed: 15 + Math.max(0, u.vel.x * _o.x + u.vel.z * _o.z), fuse: 3.2 });
    world.emit({ t: 'grenade_throw', unit: u });
    this.switchT = 0.5;
    this.say(`Grenade out (${u.grenades} left)`, 1.2);
  }

  melee() {
    const u = this.u;
    if (this.meleeT > 0) return;
    this.meleeT = 0.6;
    const world = this.app.world;
    let best = null;
    let bs = 2.4;
    for (const e of world.factions[1 - u.faction].units) {
      if (!e.alive || e.cat !== 'inf' || e.hidden || e.downed || e.mounted) continue;
      const dx = e.pos.x - u.pos.x;
      const dz = e.pos.z - u.pos.z;
      const d = Math.hypot(dx, dz);
      if (d >= bs || Math.abs(e.pos.y - u.pos.y) > 1.5) continue;
      if (Math.abs(angleDiff(this.yaw, Math.atan2(dx, dz))) > 0.9) continue;
      bs = d;
      best = e;
    }
    if (best) {
      world.melee(u, best);
      u.yaw = this.yaw;
    }
  }

  // Simulation events: hits and kills by the player, his own fall.
  handle(events) {
    const u = this.u;
    if (!u) return;
    for (const e of events) {
      if (e.t === 'impact' && e.kind === 'flesh' && e.owner === u && e.victim !== u) {
        this.hitT = 0.22;
        this.hitHead = !!e.head;
      } else if (e.t === 'kill' && e.killer === u && e.victim && e.victim !== u) {
        this.killT = 2;
        this.killName = e.victim.name;
        this.hitT = 0.3;
      } else if ((e.t === 'death' || e.t === 'downed') && e.unit === u) {
        this.deathT = 0;
        this.trigger = false;
        this.adsWant = false;
        this.killer = u.lastAttacker || (u.downed && u.downed.killer) || null;
        this.killerDef = u.lastDef || (u.downed && u.downed.def) || null;
        if (document.pointerLockElement) document.exitPointerLock();
      }
    }
  }

  // Camera (called by the camera controller in play mode, after the step).
  updateCamera(dt) {
    const u = this.u;
    if (!u) return;
    const app = this.app;
    const cam = app.camera.camera;
    const vm = app.renderer.viewmodel;
    const alive = this.alive;
    const eye = this.eyeHeight();
    this.eyeY += (eye - this.eyeY) * damp(12, dt);
    const sp = Math.min(u.speed || 0, 6);
    if (alive) this.bob += (sp * dt * Math.PI * 2) / (sp > 3 ? 2.1 : 1.4);
    const bobA = alive ? Math.min(1, sp / 3.5) * (1 - this.adsT * 0.8) : 0;
    const by = Math.abs(Math.cos(this.bob)) * 0.03 * bobA;
    const bx = Math.sin(this.bob) * 0.02 * bobA;
    const pitch = this.pitch + this.kick;
    const yaw = this.yaw + this.kickYaw;
    const fx = Math.sin(yaw);
    const fz = Math.cos(yaw);
    // Eye position (prone eyes sit forward of the hips).
    const fwd = u.stanceT > 1 ? (u.stanceT - 1) * 0.75 : 0;
    _o.set(u.pos.x + fx * fwd - fz * bx, u.pos.y + this.eyeY + by, u.pos.z + fz * fwd + fx * bx);
    let first = this.view === 'first' && alive;
    if (alive) {
      _e.set(pitch, yaw + Math.PI, 0, 'YXZ');
      cam.quaternion.setFromEuler(_e);
      if (this.view === 'first') cam.position.copy(_o);
      else this.shoulderCam(cam, _o, yaw, pitch);
      app.camera.fov = 70 + (VIEW_VARIANTS[this.variant()].fov - 70) * this.adsT;
      this.camPos.copy(cam.position);
    } else {
      // Fallen: the view drifts back and up to look at the body.
      first = false;
      const rd = u._rd;
      _t.set(rd ? rd.cx : u.pos.x, (rd ? rd.cy : u.pos.y) + 0.3, rd ? rd.cz : u.pos.z);
      const k = Math.min(1, this.deathT / 2.5);
      const a = this.yaw + Math.PI + this.deathT * 0.12;
      _p.set(_t.x + Math.sin(a) * (2.5 + k * 2), _t.y + 1.6 + k * 2, _t.z + Math.cos(a) * (2.5 + k * 2));
      const g = app.world.terrain.heightAt(_p.x, _p.z) + 0.5;
      if (_p.y < g) _p.y = g;
      cam.position.lerpVectors(this.camPos, _p, Math.min(1, this.deathT * 1.5));
      cam.lookAt(_t);
      app.camera.fov = 60;
    }
    // Looking through a scope or a launcher's sight hides the weapon.
    const v = this.variant();
    vm.pass.enabled = first && !((v === 2 || v === 4) && this.adsT > 0.85);
    if (vm.pass.enabled) this.placeViewmodel(dt);
  }

  // Over the right shoulder, pulled in front of walls and above the ground.
  shoulderCam(cam, eye, yaw, pitch) {
    const w = this.app.world;
    const cp = Math.cos(pitch);
    const dx = Math.sin(yaw) * cp;
    const dy = Math.sin(pitch);
    const dz = Math.cos(yaw) * cp;
    const rx = -Math.cos(yaw);
    const rz = Math.sin(yaw);
    const back = 2.8 - this.adsT * 1.2;
    _p.set(eye.x - dx * back + rx * 0.7, eye.y - dy * back + 0.3, eye.z - dz * back + rz * 0.7);
    const h = w.structures.segmentHit(eye.x, eye.y, eye.z, _p.x, _p.y, _p.z, _hit);
    if (h) _p.lerpVectors(eye, _p, Math.max(0.1, h.t - 0.08));
    const g = w.terrain.heightAt(_p.x, _p.z) + 0.25;
    if (_p.y < g) _p.y = g;
    cam.position.copy(_p);
  }

  variant() {
    const w = this.weapon;
    return w ? variantOf(w.def) : 0;
  }

  placeViewmodel(dt) {
    const app = this.app;
    const u = this.u;
    const vm = app.renderer.viewmodel;
    const v = this.variant();
    const V = VIEW_VARIANTS[v];
    vm.set(v, u.faction, hash01(u.id, 7));
    const a = this.adsT;
    const s = this.sprintT;
    const sp = Math.min(u.speed || 0, 6);
    const bobA = Math.min(1, sp / 3.5) * (1 - a * 0.85);
    // Hip / sights, sway with the mouse, bob with the stride.
    _p.set(V.hip[0] + (V.ads[0] - V.hip[0]) * a, V.hip[1] + (V.ads[1] - V.hip[1]) * a, V.hip[2] + (V.ads[2] - V.hip[2]) * a);
    _p.x += -this.swayX * (1 - a * 0.7) + Math.sin(this.bob) * 0.012 * bobA;
    _p.y += this.swayY * (1 - a * 0.7) - Math.abs(Math.cos(this.bob)) * 0.01 * bobA;
    let pitch = 0;
    let yaw = 0;
    let roll = 0;
    // Recoil: back and up.
    _p.z += this.kick * 1.6;
    pitch += this.kick * 2.2;
    // Sprinting: lowered and turned in.
    _p.x += s * 0.03;
    _p.y -= s * 0.04;
    pitch -= s * 0.3;
    yaw += s * 0.5;
    roll += s * 0.25;
    // Reloading, switching, bandaging: dip out of view and back.
    const w = this.weapon;
    let dip = 0;
    if (w && w.reloadT > 0) {
      const f = 1 - w.reloadT / (w.def.reload || 1);
      dip = Math.sin(clamp(f, 0, 1) * Math.PI);
    }
    dip = Math.max(dip, this.switchT / 0.45, this.bandageT > 0 ? 1 : 0);
    _p.y -= dip * 0.22;
    _p.z += dip * 0.06;
    pitch -= dip * 0.2;
    roll -= dip * 0.55;
    // Rifle-butt strike: a jab forward.
    if (this.meleeT > 0) {
      const f = Math.sin((1 - this.meleeT / 0.6) * Math.PI);
      _p.z -= f * 0.22;
      roll += f * 0.6;
      yaw -= f * 0.3;
    }
    vm.update(app.renderer.camera, _p, pitch, yaw, roll, app.renderer.sky);
    void dt;
  }
}
