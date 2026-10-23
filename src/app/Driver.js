// Driving a vehicle or flying an aircraft for the Player.
//
// Ground vehicles: W/S throttle, A/D steer, the mouse lays the turret on the
// point under the crosshair (it traverses at its own speed, and the ring
// shows where the gun points now), automatic range compensation for drop.
// Helicopters: W/S/A/D move relative to the view, Space/C climb and descend,
// the nose follows the view. Jets: the nose follows the view (mouse aim),
// W/S set the throttle. All: left click fires, Q / 1-4 / wheel switch
// weapons, R changes ammunition, G pops smoke or flares, X unloads troops,
// V switches between the chase view and the gunner's sight or cockpit,
// E zooms. Missiles lock onto a target held near the crosshair; bombs fall on
// the continuously computed impact point.

import * as THREE from 'three';
import { clamp, approach, GRAVITY } from '../core/math.js';

const _o = new THREE.Vector3();
const _d = new THREE.Vector3();
const _p = new THREE.Vector3();
const _t = new THREE.Vector3();
const _e = new THREE.Euler(0, 0, 0, 'YXZ');
const _hit = {};

export const VEHICLE_KEYS = {
  veh: [
    ['Throttle / steer', 'W S / A D'],
    ['Aim the turret', 'Mouse'],
    ['Fire', 'Left click'],
    ['Weapon', 'Q · 1–4 · wheel'],
    ['Ammunition', 'R'],
    ['Smoke screen', 'G'],
    ['Unload troops', 'X'],
    ['Gunner sight / zoom', 'V / E'],
    ['Stop playing', 'Esc'],
  ],
  heli: [
    ['Move', 'W A S D'],
    ['Climb / descend', 'Space / C'],
    ['Fast', 'Shift'],
    ['Look and turn', 'Mouse'],
    ['Fire', 'Left click'],
    ['Weapon', 'Q · 1–4 · wheel'],
    ['Flares', 'G'],
    ['Unload troops (landed)', 'X'],
    ['Cockpit / zoom', 'V / E'],
    ['Stop playing', 'Esc'],
  ],
  jet: [
    ['Steer (fly where you look)', 'Mouse · A D'],
    ['Throttle', 'W / S'],
    ['Fire', 'Left click'],
    ['Weapon', 'Q · 1–4 · wheel'],
    ['Flares', 'G'],
    ['Cockpit / zoom', 'V / E'],
    ['Stop playing', 'Esc'],
  ],
};

export function kindOf(u) {
  return u.cat === 'veh' ? 'veh' : u.aclass === 'jet' ? 'jet' : 'heli';
}

export class Driver {
  constructor(player) {
    this.p = player;
    this.u = null;
    this.kind = 'veh';
    this.view = 'chase';
    this.zoom = false;
    this.thr = 0.6;
    this.aimPt = { x: 0, y: 0, z: 0, loft: 0 };
    this.mark = new THREE.Vector3(); // where the selected weapon would hit
    this.markOn = false;
    this.ccip = null;
    this.hide = null;
    this.burstT = 0;
  }

  start(u) {
    this.u = u;
    this.kind = kindOf(u);
    this.view = 'chase';
    this.zoom = false;
    this.hide = null;
    this.ccip = null;
    const p = this.p;
    p.yaw = u.yaw + (u.cat === 'veh' ? u.turretYaw : 0);
    p.pitch = this.kind === 'jet' ? u.pitch : -0.08;
    if (this.kind === 'veh') {
      u.ctrl = { throttle: 0, steer: 0 };
      u.stop();
      u.faceYaw = null;
    } else if (this.kind === 'heli') {
      u.ctrl = { vx: u.vel.x, vz: u.vel.z, vy: 0, yaw: u.yaw };
      u.faceTarget = null;
    } else {
      const sp = u.def.speed;
      this.thr = clamp((u.speed - sp.attack * 0.7) / (sp.max - sp.attack * 0.7), 0, 1);
      u.ctrl = { dx: 0, dy: 0, dz: 1, speed: u.speed };
      u.attackRun = false;
    }
  }

  stop(u) {
    if (u.cat === 'veh') {
      u.aimTarget = null;
      u.stop();
    } else {
      u.goal.copy(u.pos);
      if (u.aclass === 'jet') u.goal.addScaledVector(u.vel, 10);
    }
  }

  get alive() {
    const u = this.u;
    return u.alive && !u.wreck && !u.crashing && !u.dying;
  }

  keydown(code, e) {
    const p = this.p;
    const u = this.u;
    const w = this.p.app.world;
    switch (code) {
      case 'KeyV':
        this.view = this.view === 'chase' ? 'inside' : 'chase';
        return true;
      case 'KeyE':
        this.zoom = !this.zoom;
        return true;
      case 'KeyQ':
        p.cycle(1);
        return true;
      case 'Digit1':
      case 'Digit2':
      case 'Digit3':
      case 'Digit4':
        p.select(+code.slice(5) - 1);
        return true;
      case 'KeyR': {
        const wp = p.weapon;
        const types = wp && wp.def.ammoTypes ? Object.keys(wp.def.ammoTypes) : null;
        if (types) {
          wp.ammoType = types[(types.indexOf(wp.ammoType) + 1) % types.length];
          // A single-round gun has to unload the round in the breech.
          if ((wp.def.mag ?? 1) === 1) wp.reloadT = Math.max(wp.reloadT, wp.def.reload * 0.5);
          p.say(`Loading ${wp.ammoType.toUpperCase()}`, 1.4);
        } else if (wp && wp.mag < (wp.def.mag ?? 1) && wp.reserve > 0) wp.startReload();
        return true;
      }
      case 'KeyG':
        if (u.cat === 'veh') {
          if (u.smokeCharges > 0) {
            w.popSmoke(u);
            p.say('Smoke out', 1.2);
          } else p.say('No smoke left', 1.2);
        } else if (u.flares > 0) w.popFlares(u);
        else p.say('No flares left', 1.2);
        return true;
      case 'KeyX':
        this.unload();
        return true;
      case 'Space':
        e.preventDefault();
        return true;
      case 'Tab':
        return false;
      default:
        return ['KeyW', 'KeyA', 'KeyS', 'KeyD', 'KeyC', 'KeyF', 'KeyZ', 'KeyB', 'ShiftLeft', 'ShiftRight', 'ControlLeft', 'ArrowUp', 'ArrowDown', 'ArrowLeft', 'ArrowRight', 'Digit5', 'Digit6'].includes(code);
    }
  }

  unload() {
    const u = this.u;
    const p = this.p;
    const w = p.app.world;
    if (!u.passengers || !u.passengers.length) {
      p.say('No troops aboard', 1.2);
      return;
    }
    const agl = u.pos.y - w.terrain.heightAt(u.pos.x, u.pos.z);
    if (Math.abs(u.speed) > 3 || (u.cat === 'air' && agl > 4)) {
      p.say(u.cat === 'air' ? 'Land first' : 'Stop first', 1.2);
      return;
    }
    const n = u.passengers.length;
    w.dismountAll(u);
    const sq = u.carrierOf;
    if (sq) for (const m of sq.members) m.task = { type: 'fight', t: w.time };
    p.say(`${n} troops out`, 1.5);
  }

  beforeSim(dt, simDt) {
    const u = this.u;
    const p = this.p;
    const k = p.keys;
    const f = (k.has('KeyW') ? 1 : 0) - (k.has('KeyS') ? 1 : 0);
    const s = (k.has('KeyD') ? 1 : 0) - (k.has('KeyA') ? 1 : 0);
    const c = u.ctrl;
    if (this.kind === 'veh') {
      c.throttle = f;
      c.steer = s;
      p.pitch = clamp(p.pitch, -0.6, 0.9);
      this.layGun();
    } else if (this.kind === 'heli') {
      p.pitch = clamp(p.pitch, -1.2, 0.8);
      const fx = Math.sin(p.yaw);
      const fz = Math.cos(p.yaw);
      const sp = k.has('ShiftLeft') || k.has('ShiftRight') ? u.def.speed.max : u.def.speed.attack;
      c.vx = (fx * f - fz * s * 0.6) * sp;
      c.vz = (fz * f + fx * s * 0.6) * sp;
      c.vy = ((k.has('Space') ? 1 : 0) - (k.has('KeyC') || k.has('ControlLeft') ? 1 : 0)) * 9;
      c.yaw = p.yaw;
    } else {
      // A/D nudge the view (and so the jet) for keyboard flying.
      p.yaw -= s * 0.9 * dt;
      p.pitch = clamp(p.pitch, -0.6, 0.6);
      this.thr = clamp(this.thr + f * dt * 0.5, 0, 1);
      const sp = u.def.speed;
      c.speed = sp.attack * 0.7 + (sp.max - sp.attack * 0.7) * this.thr;
      const cp = Math.cos(p.pitch);
      c.dx = Math.sin(p.yaw) * cp;
      c.dy = Math.sin(p.pitch);
      c.dz = Math.cos(p.yaw) * cp;
    }
    this.updateMark();
    this.fire(simDt);
  }

  // Turret onto the point under the crosshair; shells get the elevation
  // that makes up for their drop, artillery the launch angle to land there.
  layGun() {
    const u = this.u;
    const p = this.p;
    const w = p.weapon;
    const cam = p.app.renderer.camera;
    const D = p.aimDistance();
    cam.getWorldDirection(_d);
    _p.copy(cam.position).addScaledVector(_d, D);
    const a = this.aimPt;
    a.x = _p.x;
    a.y = _p.y;
    a.z = _p.z;
    a.loft = 0;
    if (w && w.def.indirect) {
      const T = this.flightTime(w, _p);
      u.mountPoint('gun', _o);
      const vy = (_p.y - _o.y + 0.5 * GRAVITY * T * T) / T;
      const hd = Math.hypot(_p.x - _o.x, _p.z - _o.z);
      a.y = u.pos.y + 2;
      a.loft = Math.atan2(vy, hd / T);
    } else if (w && (w.def.kind === 'shell' || w.def.kind === 'bullet')) {
      const ap = w.def.ammoTypes ? w.def.ammoTypes[w.ammoType] : w.def;
      const sp = ap.speed || w.def.speed || 800;
      const tof = D / sp;
      a.loft = Math.atan2(0.5 * GRAVITY * tof * tof, D);
    }
    u.aimTarget = a;
  }

  flightTime(w, at) {
    const u = this.u;
    const d = Math.hypot(at.x - u.pos.x, at.z - u.pos.z);
    const theta = w.def.kind === 'rocket' ? 0.73 : 0.96;
    return Math.max(4, Math.sqrt((2 * d * Math.tan(theta)) / GRAVITY));
  }

  // Where the selected weapon would hit: the gun's line for turrets, the
  // nose line for fixed guns and rockets, the bomb impact point.
  updateMark() {
    const u = this.u;
    const w = this.p.weapon;
    this.markOn = false;
    this.ccip = null;
    if (!w) return;
    const def = w.def;
    const D = Math.max(60, this.p.aimDistance());
    if (u.cat === 'veh') {
      if (def.indirect || (w.mount !== 'gun' && w.mount !== 'coax')) return;
      u.mountPoint('gun', _o);
      u.gunDir(_d);
      this.mark.copy(_o).addScaledVector(_d, D);
      this.markOn = true;
    } else if (def.kind === 'bomb') {
      this.ccip = this.bombImpact();
      if (this.ccip) {
        this.mark.copy(this.ccip);
        this.markOn = true;
      }
    } else if (w.mount === 'gun' || w.mount === 'pods') {
      u.forward3(_d);
      this.mark.copy(u.pos).addScaledVector(_d, Math.max(400, D));
      this.markOn = true;
    }
  }

  // Integrate a released bomb to the ground.
  bombImpact() {
    const u = this.u;
    const terrain = this.p.app.world.terrain;
    let x = u.pos.x;
    let y = u.pos.y - 1;
    let z = u.pos.z;
    let vx = u.vel.x;
    let vy = u.vel.y;
    let vz = u.vel.z;
    const h = 0.1;
    for (let i = 0; i < 400; i++) {
      vy -= GRAVITY * h;
      x += vx * h;
      y += vy * h;
      z += vz * h;
      const g = terrain.heightAt(x, z);
      if (y <= g) return { x, y: g, z, t: (i + 1) * h };
    }
    return null;
  }

  spread() {
    const w = this.p.weapon;
    if (!w) return 0;
    const moving = Math.abs(this.u.speed) > 3 ? 1.6 : 1;
    return (w.def.spread || 0.002) * moving;
  }

  updateLock(dt) {
    const p = this.p;
    const u = this.u;
    const w = p.weapon;
    const anti = !!w.def.antiAir;
    const cam = p.app.renderer.camera;
    cam.getWorldDirection(_d);
    let best = null;
    let bs = 0.06;
    for (const e of p.app.world.factions[1 - u.faction].units) {
      if (!e.alive || e.hidden || e.dying || (anti ? e.cat !== 'air' : e.cat !== 'veh')) continue;
      _t.set(e.pos.x - cam.position.x, e.pos.y + (e.cat === 'veh' ? e.spec.height * 0.5 : 0) - cam.position.y, e.pos.z - cam.position.z);
      const d = _t.length();
      if (d > w.def.range || d < (w.def.minRange || 0) * 0.5) continue;
      const off = Math.acos(clamp(_t.dot(_d) / d, -1, 1));
      if (off < bs) {
        bs = off;
        best = e;
      }
    }
    if (best && best === p.lockOn) p.lockT += dt;
    else {
      p.lockOn = best;
      p.lockT = 0;
    }
  }

  fire(simDt) {
    const p = this.p;
    const u = this.u;
    const w = p.weapon;
    p.shotT += simDt;
    this.burstT -= simDt;
    if (!w || simDt <= 0) return;
    const def = w.def;
    if (def.kind === 'missile') this.updateLock(simDt);
    if (!(p.trigger || p.edge) || w.reloadT > 0 || w.disabled) {
      p.acc = 0;
      return;
    }
    if (u.cat === 'veh' && u.firepowerKill && (w.mount === 'gun' || w.mount === 'coax')) {
      if (p.edge) p.say('Main armament knocked out', 1.4);
      return;
    }
    if (w.mag <= 0) {
      if (p.edge) {
        if (w.reserve > 0) w.startReload();
        else p.say('Out of ammunition', 1.2);
      }
      return;
    }
    const interval = 60 / def.rpm;
    const auto = def.rpm >= 100 && (def.kind === 'bullet' || def.kind === 'rocket');
    let n = 0;
    if (auto) {
      if (p.edge && p.shotT >= interval) p.acc = interval;
      else p.acc += simDt;
      n = Math.floor(p.acc / interval);
      p.acc -= n * interval;
    } else if (p.edge && p.shotT >= Math.min(interval, 1)) n = 1;
    n = Math.min(n, w.mag);
    if (n <= 0) return;
    if (def.kind === 'missile' && !(p.lockOn && p.lockT >= p.lockNeed(def))) {
      if (p.edge) p.say(p.lockOn ? 'Locking…' : 'No lock: hold the crosshair on a target', 1.4);
      return;
    }
    if (def.kind === 'bomb' && !this.ccip) return;
    // One sound per burst for rotary guns, renewed every second of firing.
    if (def.oneSoundPerBurst && (p.edge || this.burstT <= 0)) {
      w.newBurst = true;
      w.burstLeft = Math.round(def.rpm / 60);
      this.burstT = 1;
    } else if (!def.oneSoundPerBurst) w.newBurst = true;
    for (let i = 0; i < n; i++) this.shoot(w, simDt / n);
    p.shotT = 0;
  }

  shoot(w, dt) {
    const p = this.p;
    const u = this.u;
    const world = p.app.world;
    const def = w.def;
    const a = this.aimPt;
    w.mag--;
    w.shots++;
    if (w.mag <= 0 && w.reserve > 0) w.startReload();
    const extra = {};
    let target = null;
    let spread = this.spread();
    const mount = w.mount;
    // Point under the crosshair (for weapons aimed straight at it).
    const cam = p.app.renderer.camera;
    cam.getWorldDirection(_d);
    _p.copy(cam.position).addScaledVector(_d, p.aimDistance());
    if (def.kind === 'missile') {
      target = p.lockOn;
      extra.guided = true;
      if (u.cat === 'air') extra.speed = Math.max(def.speed, u.speed + 60);
      p.lockT = 0;
      spread = 0;
      u.mountPoint(mount, _o);
      _d.set(target.pos.x - _o.x, target.pos.y + 1 - _o.y, target.pos.z - _o.z).normalize();
      if (def.topAttack || def.loft) _d.y += 0.25;
      _d.normalize();
    } else if (def.kind === 'bomb') {
      u.mountPoint('pylon', _o);
      _d.copy(u.vel).normalize();
      const c = this.ccip;
      extra.speed = u.speed;
      extra.targetPoint = { x: c.x, y: c.y, z: c.z };
      extra.whistleAt = Math.max(0.5, c.t - 3);
      spread = 0.002;
    } else if (u.cat === 'veh' && def.indirect) {
      // Artillery: lob the round onto the aimed point.
      const T = this.flightTime(w, a) * (0.98 + Math.random() * 0.04);
      const tx = _p.x;
      const tz = _p.z;
      const ty = world.terrain.heightAt(tx, tz);
      if (def.kind === 'rocket') u.mountPoint('tube', _o, w.shots);
      else u.mountPoint('gun', _o);
      _d.set((tx - _o.x) / T, (ty - _o.y + 0.5 * GRAVITY * T * T) / T, (tz - _o.z) / T);
      const speed = _d.length();
      _d.multiplyScalar(1 / speed);
      Object.assign(extra, { speed, targetPoint: { x: tx, y: ty, z: tz }, whistleAt: Math.max(0.5, T - 2.8), life: T + 4, gravity: 1, noThrust: true });
      spread = def.kind === 'rocket' ? 0.004 : 0.001;
    } else if (u.cat === 'veh' && (mount === 'gun' || mount === 'coax')) {
      u.mountPoint(def.twin ? (w.shots % 2 ? 'gun1' : 'gun2') : mount, _o);
      u.gunDir(_d);
    } else if (u.cat === 'air' && (mount === 'gun' || mount === 'pods')) {
      u.mountPoint(mount, _o);
      u.forward3(_d);
    } else {
      // Free-aiming guns: roof MG, chin gun, door guns.
      u.mountPoint(mount, _o);
      _d.subVectors(_p, _o).normalize();
    }
    world.fireRounds(u, w, _o, _d, 1, spread, target, dt, extra);
    if (u.cat === 'veh' && mount === 'gun' && def.kind === 'shell') p.kick += 0.02;
  }

  // Camera for the chase view or the gunner's sight / cockpit.
  camera(dt, cam) {
    const u = this.u;
    const p = this.p;
    const app = p.app;
    const w = app.world;
    const yaw = p.yaw;
    const pitch = p.pitch + p.kick;
    _e.set(pitch, yaw + Math.PI, 0, 'YXZ');
    cam.quaternion.setFromEuler(_e);
    const cp = Math.cos(pitch);
    _d.set(Math.sin(yaw) * cp, Math.sin(pitch), Math.cos(yaw) * cp);
    this.hide = null;
    let fov;
    if (this.view === 'inside') {
      if (u.cat === 'veh') {
        // The gunner's sight above the gun (the vehicle itself is hidden).
        u.mountPoint('gun', _o, -u.spec.barrelLength + 0.4);
        _o.y += 0.45;
        this.hide = u;
      } else {
        const c = u.spec.cockpit || u.spec.camera || [0, 1, 2];
        _o.set(c[0], c[1] + 0.35, c[2]).applyQuaternion(u.quat).add(u.pos);
      }
      cam.position.copy(_o);
      fov = this.zoom ? 14 : 50;
    } else {
      const big = u.cat === 'veh' ? Math.max(9, u.spec.length * 1.7) : this.kind === 'jet' ? 28 : 18;
      const up = u.cat === 'veh' ? u.spec.height * 0.9 + 1.2 : this.kind === 'jet' ? 5 : 3.5;
      _t.set(u.pos.x, u.pos.y + (u.cat === 'veh' ? u.spec.height * 0.7 : 0), u.pos.z);
      _p.set(_t.x - _d.x * big, _t.y - _d.y * big + up, _t.z - _d.z * big);
      if (u.cat === 'veh') {
        const h = w.structures.segmentHit(_t.x, _t.y, _t.z, _p.x, _p.y, _p.z, _hit);
        if (h) _p.lerpVectors(_t, _p, Math.max(0.15, h.t - 0.05));
      }
      const g = w.terrain.heightAt(_p.x, _p.z) + 1;
      if (_p.y < g) _p.y = g;
      cam.position.copy(_p);
      fov = this.zoom ? 30 : 65;
    }
    app.camera.fov = fov;
    void dt;
  }
}
