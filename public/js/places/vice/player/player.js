// You: your own ROBLOX avatar, on foot or at the wheel. Walking, running,
// sprinting, jumping, falling, swimming; getting into any vehicle (pulling
// the driver out if there is one) and driving it; taking damage, armour,
// health that creeps back up to half, dying.
//
//   V.player = new Player()        (the Ped contract, with isPlayer = true)
//   pos (feet), vel, heading (forward = (sin h, cos h)), hp/maxHp, armor, money, dead
//   vehicle, seat, swimming, sprinting, grounded
//   place(x, z, heading, y?)  update(dt, input)
//   hit(dmg, part, dir, attacker, info)  knock(vel, from)  die(cause, attacker)
//   enterVehicle(veh, seat)  exitVehicle()
//   model: the drawn CharacterModel; handBone(): the right-hand grip (for guns)
import * as THREE from 'three';
import { V, K } from '../state.js';
import { CharacterModel, DEFAULT_APPEARANCE } from '../../../engine/CharacterModel.js';

const WALK = 7.5, RUN = 14, SPRINT = 21.5, SWIM = 6.5, SWIM_FAST = 10, JUMP = 25;
const _v = new THREE.Vector3(), _m = new THREE.Matrix4(), _q = new THREE.Quaternion(), _s = new THREE.Vector3(), _e = new THREE.Euler();
const key = (inp, code, k) => inp.keys?.has('code:' + code) || (k && inp.keys?.has(k));

export class Player {
  constructor() {
    this.isPlayer = true; this.kind = 'player'; this.team = 'player'; this.name = 'You';
    this.pos = new THREE.Vector3(); this.vel = new THREE.Vector3();
    this.heading = 0;
    this.hp = 100; this.maxHp = 100; this.armor = 0; this.money = 350;
    this.dead = false; this.vehicle = null; this.seat = -1;
    this.grounded = true; this.swimming = false; this.sprinting = false;
    this.walk = 0; this.stride = 0; this.airT = 0; this.fallFrom = null;
    this.stunT = 0; this.lastHitT = 0; this.regenT = 0;
    this.enterT = 0; this.pending = null;
    this.ragdoll = false;
  }

  ready() {
    const app = V.appearance || DEFAULT_APPEARANCE;
    const m = new CharacterModel(app);
    // the engine's rig uses Phong; give it the same lighting as the rest of the city
    m.root.traverse((o) => {
      if (!o.isMesh) return;
      o.castShadow = true; o.receiveShadow = true;
      const mats = Array.isArray(o.material) ? o.material : [o.material];
      const conv = mats.map((x) => {
        if (!x || !x.isMeshPhongMaterial) return x;
        const s = new THREE.MeshStandardMaterial({ color: x.color, map: x.map, transparent: x.transparent, depthWrite: x.depthWrite, side: x.side, roughness: 0.72, metalness: 0 });
        return s;
      });
      o.material = Array.isArray(o.material) ? conv : conv[0];
    });
    this.model = m;
    V.world.scene.add(m.root);
  }

  place(x, z, heading = 0, y = null) {
    if (this.vehicle) this.exitVehicle(true);
    const gy = y ?? V.phys.groundAt(x, 200, z, 0.6, 0);
    this.pos.set(x, Number.isFinite(gy) ? gy : K.GROUND, z);
    this.vel.set(0, 0, 0);
    this.heading = heading;
    this.dead = false; this.stunT = 0;
    if (V.cam) { V.cam.yaw = heading + Math.PI; V.cam.pitch = -0.12; V.cam.first = true; }
    this._pose(0);
  }

  get eyePos() { return _v.set(this.pos.x, this.pos.y + 4.6, this.pos.z); }
  /** The world matrix of the right hand (for a gun). */
  handBone() { return this.model?.rightGrip; }

  update(dt, inp) {
    if (!this.model) return;
    if (dt <= 0) { this._pose(0); return; }
    if (this.dead) { this._deadPose(dt); return; }
    // health creeps back to half
    if (V.world.time - this.lastHitT > 6 && this.hp < this.maxHp * 0.5) this.hp = Math.min(this.maxHp * 0.5, this.hp + dt * 2);
    if (this.vehicle) this._drive(dt, inp); else this._foot(dt, inp);
  }

  // ---- on foot ----
  _foot(dt, inp) {
    const P = V.phys, ground = V.ground;
    const cam = V.cam;
    // what the player wants
    let fwd = (key(inp, 'KeyW', 'w') || key(inp, 'ArrowUp') ? 1 : 0) - (key(inp, 'KeyS', 's') || key(inp, 'ArrowDown') ? 1 : 0);
    let rt = (key(inp, 'KeyD', 'd') || key(inp, 'ArrowRight') ? 1 : 0) - (key(inp, 'KeyA', 'a') || key(inp, 'ArrowLeft') ? 1 : 0);
    if (this.stunT > 0) { this.stunT -= dt; fwd = rt = 0; }
    const cy = cam ? cam.yaw : this.heading + Math.PI;
    // camera forward (flat) and right
    const cfx = -Math.sin(cy), cfz = -Math.cos(cy), crx = Math.cos(cy), crz = -Math.sin(cy);
    let mx = cfx * fwd + crx * rt, mz = cfz * fwd + crz * rt;
    const ml = Math.hypot(mx, mz);
    if (ml > 1) { mx /= ml; mz /= ml; }
    const aiming = !!V.weapons?.aiming;
    this.sprinting = ml > 0.1 && (key(inp, 'ShiftLeft', 'shift') || key(inp, 'ShiftRight')) && !aiming && !this.swimming;
    const walking = key(inp, 'AltLeft') || key(inp, 'CapsLock');
    const speed = this.swimming ? (this.sprinting ? SWIM_FAST : SWIM) : aiming ? WALK : walking ? WALK : this.sprinting ? SPRINT : RUN;
    const want = _v.set(mx * speed, 0, mz * speed);
    // accelerate (slow to turn in the air)
    const acc = this.swimming ? 14 : this.grounded ? 70 : 9;
    const dvx = want.x - this.vel.x, dvz = want.z - this.vel.z, dl = Math.hypot(dvx, dvz), mstep = acc * dt;
    if (dl > mstep) { this.vel.x += (dvx / dl) * mstep; this.vel.z += (dvz / dl) * mstep; } else { this.vel.x = want.x; this.vel.z = want.z; }
    // face where you're going (or where you aim)
    let face = null;
    if (aiming) face = cy + Math.PI;
    else if (ml > 0.1) face = Math.atan2(mx, mz);
    if (face != null) {
      let d = face - this.heading; d = Math.atan2(Math.sin(d), Math.cos(d));
      this.heading += d * Math.min(1, dt * (aiming ? 20 : 11));
    }
    // water: swim when it's deep
    const water = ground.waterAt(this.pos.x, this.pos.z) === 0;
    const surf = water ? (V.water?.waveAt ? V.water.waveAt(this.pos.x, this.pos.z, V.world.time) : 0) : -Infinity;
    if (water && this.pos.y < surf - 3.4 && !this.swimming) { this.swimming = true; this.vel.y *= 0.2; V.fx?.splash?.(this.pos.clone().setY(surf), 1); V.audio?.splash?.(this.pos); }
    if (this.swimming) {
      // float with the head out; leave the water when the ground comes up
      const floatY = surf - 3.7;
      this.vel.y += (floatY - this.pos.y) * 6 * dt - this.vel.y * 4 * dt;
      const g = P.groundAt(this.pos.x, this.pos.y + 2, this.pos.z, 0.6, 1.6);
      if (!water || g > floatY - 0.3) { this.swimming = false; }
      const r = P.moveBody(this.pos, this.vel, dt, { r: 1.2, h: 5.2, step: 2.2, grounded: false, gravity: 0 });
      this.grounded = false;
      if (r.ground != null && this.pos.y < r.ground) this.pos.y = r.ground;
    } else {
      if (this.grounded && key(inp, 'Space', ' ') && this.stunT <= 0) { this.vel.y = JUMP; this.grounded = false; this.jumped = true; }
      const r = P.moveBody(this.pos, this.vel, dt, { r: 1.25, h: 5.2, step: 1.6, grounded: this.grounded, gravity: K.G });
      const wasAir = !this.grounded;
      this.grounded = r.grounded;
      if (!this.grounded) { this.airT += dt; if (this.fallFrom == null) this.fallFrom = this.pos.y; this.fallFrom = Math.max(this.fallFrom, this.pos.y); }
      if (this.grounded && wasAir) {
        const drop = (this.fallFrom ?? this.pos.y) - this.pos.y;
        if (drop > 16) this.hit((drop - 16) * 4.5, 'legL', null, null, { fall: true });
        if (drop > 4) V.audio?.land?.(this.pos, drop);
        this.airT = 0; this.fallFrom = null; this.jumped = false;
      }
    }
    // F: get into the nearest vehicle
    if (inp.pressed?.has('code:KeyF') || inp.pressed?.has('f')) this.tryEnter();
    // don't fall off the world
    if (this.pos.y < -60) this.place(this.pos.x, this.pos.z, this.heading);
    this._pose(dt);
  }

  /** Get into the nearest vehicle, pulling out whoever is driving it. */
  tryEnter() {
    const list = V.vehicles?.near?.(this.pos.x, this.pos.z, 12) || [];
    let best = null, bd = Infinity;
    for (const v of list) {
      if (v.dead || v === this.vehicle) continue;
      const d = Math.hypot(v.pos.x - this.pos.x, v.pos.z - this.pos.z) - (v.size?.l || 10) * 0.35;
      if (d < bd) { bd = d; best = v; }
    }
    if (!best || bd > 6) return false;
    if (best.locked) { V.hud?.notify?.('It\'s locked.'); return false; }
    const d = best.driver;
    if (d && d !== this) {
      // carjack
      d.exitVehicle?.(true);
      d.knock?.(new THREE.Vector3(best.pos.x - this.pos.x, 4, best.pos.z - this.pos.z).normalize().multiplyScalar(-9), this);
      d.flee?.(this);
      V.events.emit('crime', { kind: 'carjack', pos: best.pos.clone(), by: this, victim: d });
    } else if (!best.owner || best.owner !== this) {
      V.events.emit('crime', { kind: 'theft', pos: best.pos.clone(), by: this, victim: null });
    }
    this.enterVehicle(best, 0);
    return true;
  }

  enterVehicle(veh, seat = 0) {
    this.vehicle = veh; this.seat = seat;
    if (veh.enter) veh.enter(this, seat); else if (seat === 0) veh.driver = this;
    this.vel.set(0, 0, 0);
    this.swimming = false;
    V.events.emit('vehicle:enter', { who: this, veh });
  }

  exitVehicle(force = false) {
    const veh = this.vehicle;
    if (!veh) return;
    if (veh.leave) veh.leave(this); else if (veh.driver === this) veh.driver = null;
    veh.ctl && Object.assign(veh.ctl, { throttle: 0, steer: 0, handbrake: veh.kind === 'car' && Math.abs(veh.speed || 0) < 8, brake: 0, up: 0 });
    this.vehicle = null; this.seat = -1;
    // out of the driver's door (or the other side if that's blocked)
    let p = null;
    for (const side of ['left', 'right']) {
      const e = veh.exitPoint?.(side);
      if (!e) continue;
      const g = V.phys.groundAt(e.x, (veh.pos.y || 3) + 6, e.z, 0.6, 2);
      const blocked = V.phys.ray(veh.pos.x, veh.pos.y + 3, veh.pos.z, e.x - veh.pos.x, 0, e.z - veh.pos.z, 1, { skip: (b) => b.vehicle === veh || b.kerb });
      if (!blocked || force) { p = { x: e.x, z: e.z, y: g }; break; }
    }
    if (!p) p = { x: veh.pos.x, z: veh.pos.z, y: veh.pos.y + (veh.size?.h || 6) };
    this.pos.set(p.x, Number.isFinite(p.y) ? p.y : veh.pos.y, p.z);
    this.vel.copy(veh.vel || _v.set(0, 0, 0)).multiplyScalar(0.6);
    this.heading = veh.heading ?? this.heading;
    this.grounded = false;
    // bailing out at speed hurts
    const spd = Math.hypot(this.vel.x, this.vel.z);
    if (spd > 20 && !force) { this.hit(Math.min(40, spd * 0.5), 'torso', null, null, { fall: true }); this.knock(this.vel.clone(), null); }
    if (veh.kind === 'boat' || veh.kind === 'heli' || veh.kind === 'plane') { /* (in the air or water you just drop out) */ }
    V.events.emit('vehicle:exit', { who: this, veh });
  }

  // ---- driving ----
  _drive(dt, inp) {
    const veh = this.vehicle;
    if (veh.dead && !this.bailed) { /* burning wreck: get out */ }
    const c = veh.ctl || (veh.ctl = {});
    const W = key(inp, 'KeyW', 'w') || key(inp, 'ArrowUp'), S = key(inp, 'KeyS', 's') || key(inp, 'ArrowDown');
    const A = key(inp, 'KeyA', 'a') || key(inp, 'ArrowLeft'), D = key(inp, 'KeyD', 'd') || key(inp, 'ArrowRight');
    const up = key(inp, 'ShiftLeft', 'shift') || key(inp, 'ShiftRight'), down = key(inp, 'ControlLeft', 'control') || key(inp, 'ControlRight');
    if (veh.kind === 'heli' || veh.kind === 'plane') {
      c.throttle = (W ? 1 : 0) - (S ? 1 : 0);
      c.steer = (D ? 1 : 0) - (A ? 1 : 0);
      c.up = (up ? 1 : 0) - (down ? 1 : 0);
      c.yaw = (key(inp, 'KeyE', 'e') ? 1 : 0) - (key(inp, 'KeyQ', 'q') ? 1 : 0);
      c.brake = 0; c.handbrake = false;
    } else {
      const fwdSpeed = veh.speed || 0;
      c.throttle = W ? 1 : 0;
      c.brake = 0;
      if (S) { if (fwdSpeed > 2) c.brake = 1; else c.throttle = -1; }
      if (W && fwdSpeed < -2) { c.brake = 1; c.throttle = 0; }
      c.steer = (D ? 1 : 0) - (A ? 1 : 0);
      c.handbrake = key(inp, 'Space', ' ');
    }
    c.horn = key(inp, 'KeyH', 'h');
    if ((inp.pressed?.has('code:KeyH') || inp.pressed?.has('h')) && veh.def?.siren) veh.siren = !veh.siren;
    if (inp.pressed?.has('code:KeyF') || inp.pressed?.has('f')) { this.exitVehicle(); this._pose(dt); return; }
    // follow the vehicle
    this.pos.copy(veh.pos);
    this.heading = veh.heading ?? this.heading;
    this._pose(dt);
  }

  // ---- damage ----
  hit(dmg, part = 'torso', dir = null, attacker = null, info = {}) {
    if (this.dead || V.cheats?.god) return;
    if (part === 'head' && info.bullet) dmg *= 1.6;
    if (this.armor > 0 && !info.fall) { const a = Math.min(this.armor, dmg * 0.8); this.armor -= a; dmg -= a; }
    this.hp -= dmg;
    this.lastHitT = V.world.time;
    this.lastAttacker = attacker;
    V.post?.hit?.(Math.min(1, dmg / 30), info.fire ? 0xff7a20 : 0xb00000);
    V.hud?.damage?.(dir, dmg);
    V.events.emit('player:hurt', { dmg, part, attacker, info });
    if (this.hp <= 0) this.die(info.bullet ? 'shot' : info.vehicle ? 'run over' : info.explosion ? 'blown up' : info.fall ? 'fell' : 'killed', attacker);
  }
  knock(vel, from) {
    if (this.dead || this.vehicle) return;
    this.vel.copy(vel); this.vel.y = Math.max(this.vel.y, 8);
    this.grounded = false; this.stunT = 1.2;
    this.knockT = 1.2;
  }
  die(cause, attacker) {
    if (this.dead) return;
    this.dead = true; this.hp = 0; this.deadT = 0;
    if (this.vehicle) { const v = this.vehicle; this.exitVehicle(true); this.pos.copy(v.pos); }
    V.events.emit('player:wasted', { cause, attacker });
  }
  heal(n) { this.hp = Math.min(this.maxHp, this.hp + n); }

  // ---- drawing ----
  _pose(dt) {
    const m = this.model;
    if (!m) return;
    const veh = this.vehicle;
    const root = m.root;
    if (veh) {
      // sit in the seat
      if (veh.seatWorld) {
        veh.seatWorld(this.seat < 0 ? 0 : this.seat, _m);
        _m.decompose(root.position, root.quaternion, _s);
        root.position.y += 1.6;
        _q.setFromAxisAngle(_v.set(0, 1, 0), Math.PI);
        root.quaternion.multiply(_q);
      } else { root.position.set(veh.pos.x, veh.pos.y + 3.5, veh.pos.z); root.rotation.set(0, (veh.heading || 0) + Math.PI, 0); }
      const bike = veh.kind === 'bike';
      root.visible = veh.kind !== 'car' || !veh.def?.hideDriver;
      m.setAngles(bike ? 1.2 : 1.35, bike ? 1.2 : 1.35, bike ? 1.0 : 1.5, bike ? 1.0 : 1.5);
      m.torso && (m.torso.rotation.x = 0);
      return;
    }
    root.visible = true;
    const hs = Math.hypot(this.vel.x, this.vel.z);
    // the stride follows the speed
    this.stride += ((this.grounded || this.swimming ? Math.min(1, hs / RUN) : 0.15) - this.stride) * Math.min(1, dt * 8);
    this.walk += dt * (this.swimming ? 2.2 : 3.2 + hs * 0.42);
    const sw = Math.sin(this.walk), st = this.stride * (this.sprinting ? 1.25 : 1);
    let rs = sw * 0.95 * st, ls = -sw * 0.95 * st, rh = -sw * 0.85 * st, lh = sw * 0.85 * st;
    let lean = this.sprinting ? 0.22 : hs > 10 ? 0.1 : 0;
    if (!this.grounded && !this.swimming) { rs = -2.6; ls = -2.6; rh = 0.5; lh = -0.2; if (this.vel.y < -10) { rs = ls = -2.9; } }
    if (this.swimming) { rs = Math.sin(this.walk) * 2.4 - 1.2; ls = Math.sin(this.walk + Math.PI) * 2.4 - 1.2; rh = sw * 0.5; lh = -sw * 0.5; lean = 1.3; }
    // aiming and fighting (the weapons system sets the arm pose)
    const W = V.weapons;
    if (W?.armPose) { const a = W.armPose; if (a.rs != null) rs = a.rs; if (a.ls != null) ls = a.ls; if (a.lean != null) lean = a.lean; }
    if (this.knockT > 0) { this.knockT -= dt; lean = -1.2 * Math.min(1, this.knockT * 2); }
    m.setAngles(rs, ls, rh, lh);
    root.position.set(this.pos.x, this.pos.y + 3 + (this.swimming ? 0.6 : 0) + Math.abs(Math.cos(this.walk)) * 0.18 * st, this.pos.z);
    _e.set(lean, this.heading + Math.PI, 0, 'YXZ');
    root.quaternion.setFromEuler(_e);
  }
  _deadPose(dt) {
    const m = this.model;
    this.deadT += dt;
    // until ragdolls exist: topple over
    const t = Math.min(1, this.deadT * 1.8);
    this.vel.x *= 0.9; this.vel.z *= 0.9;
    V.phys.moveBody(this.pos, this.vel, dt, { r: 1.2, h: 2, step: 1, grounded: true, gravity: K.G });
    m.setAngles(-0.4, 0.3, 0.2, -0.1);
    m.root.position.set(this.pos.x, this.pos.y + 3 - t * 2.5, this.pos.z);
    _e.set(-t * Math.PI / 2, this.heading + Math.PI, 0, 'YXZ');
    m.root.quaternion.setFromEuler(_e);
  }
}
