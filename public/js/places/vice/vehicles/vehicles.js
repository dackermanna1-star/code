// Every vehicle in Vice City: cars, bikes, boats, helicopters and the plane.
// Vehicles(world) -> V.vehicles. Each Vehicle is a rigid body stepped by
// physics.js, drawn as one body mesh (models.js; wheels and contact shadows
// are instanced for the whole fleet), with damage (smoke, fire, explosion,
// a burnt-out wreck), collisions with the world, other vehicles and people,
// and a phys box that moves with it so people and bullets collide with it.
// Whoever drives (the player, traffic, the police) sets veh.ctl every frame.
// See ARCHITECTURE.md (Vehicles) for the contract.
//
//   V.vehicles.spawn(type, x, z, heading, {y, color, parked, locked, speed, vel, yProbe}) -> Vehicle
//   .remove(v)  .list  .near(x, z, r, out)  .update(dt)  .ready()  .TYPES  .MIX (weights for traffic/parking)
//   .hitTest(origin, dir, max, skip) -> {veh, d, point, normal, part: 'body'|'glass'|'tyre'|'tank'} | null
//   .blast(pos, r, dmg, attacker, skipVeh, impulseOnly)   push (and damage) every vehicle in a blast
//   .freeWater(x, z, r) -> {x, z} | null                   open water near a point (for spawning boats)
// Vehicle:
//   ctl {throttle -1..1, brake 0..1, steer -1..1 (+ = right), handbrake, up -1..1, yaw -1..1, horn, siren}
//     cars/bikes: throttle<0 brakes then reverses; throttle and brake together at a standstill = burnout
//     boats: throttle/steer. helicopters: up = collective, throttle = pitch, steer = yaw + bank, yaw = pure yaw.
//     planes: throttle = engine (<0 = wheel brakes), up = pitch, steer = roll, yaw = rudder.
//   driver (get/set) seats[] passengers[]  enter(who, seat) leave(who) seatOf(who) freeSeat(passengerOnly)
//   seatWorld(i, outMatrix4) (hips, facing +Z)  exitPoint('left'|'right'|seat, outVector3)
//   pos (origin: ground under the wheelbase), quat, heading, vel, angVel, speed (signed), size {w, h, l}
//   rpm 0..1, gear (-1 reverse, 1..n), skid 0..1, wheelSpin, braking, burnout, contacts, airT, alt, inWater, rotor, lean
//   health 1000.., dead, burning, drowned, lights (lightsMode 'auto'|'on'|'off'), siren, locked, engineOn, focus
//   damage(amount, point, dir, attacker, part)  explode(attacker)  eject()  horn()  repair()  setPaint(c)
//   wake()  sleeping  dent(...)  popTyre(point)  shatter(point)
// Events: vehicle:crash {veh, other, pos, speed, kind:'wall'|'vehicle'|'ped'} - vehicle:destroyed {veh, attacker}
//   vehicle:eject {veh, who, vel} - vehicle:tyre {veh, wheel, pos} - vehicle:backfire {veh, pos} - vehicle:drowned {veh}
//   prop:hit {box, veh, vel, pos} - and 'noise' (crash, horn, explosion) and 'crime' (hitPed, assault, explosion).
import * as THREE from 'three';
import { V, K } from '../state.js';
import { TYPES, ALIASES, MIX } from './types.js';
import { visualFor, vehicleMaterial, wheelBank, shadowBank, setBankScene, allBanks } from './models.js';
import { step, collidePair, groundProbe, waterAt, syncPos, syncCom, toWorld, impulse, hit, setWaterTime, footprint, refresh, surfKind } from './physics.js';
import { VehFX } from './effects.js';

export { TYPES, MIX };

const G = K.G;
const _v = new THREE.Vector3(), _w = new THREE.Vector3(), _u = new THREE.Vector3(), _p = new THREE.Vector3(), _n = new THREE.Vector3();
const _m = new THREE.Matrix4(), _m2 = new THREE.Matrix4(), _one = new THREE.Vector3(1, 1, 1), _flat = new THREE.Vector3(1, 0.8, 0.8);
const _q = new THREE.Quaternion(), _q2 = new THREE.Quaternion(), _e = new THREE.Euler(0, 0, 0, 'YXZ');
const _ax = new THREE.Vector3(1, 0, 0), _ay = new THREE.Vector3(0, 1, 0);
const EMPTY = [];
const clamp = (x, a, b) => (x < a ? a : x > b ? b : x);

// ---- the catalogue, completed from the models --------------------------------------------------------------------------------
export function typeId(t) {
  if (TYPES[t]) return t;
  if (ALIASES[t]) return ALIASES[t];
  const k = String(t || '').toLowerCase().replace(/[\s_-]/g, '');
  for (const id of Object.keys(TYPES)) if (id.replace(/[\s_-]/g, '') === k) return id;
  for (const [a, id] of Object.entries(ALIASES)) if (a.replace(/[\s_-]/g, '') === k) return id;
  return null;
}

/** Derive size, hull, wheels, suspension, inertia and engine numbers for a type (once). */
export function prepare(id) {
  const d = TYPES[id];
  if (d._ready) return d;
  d.id = id;
  const vis = visualFor(d);
  const b = vis.bounds, kind = d.kind, m = d.mass;
  d.vis = vis;
  if (vis.seatY) d.seats = d.seats.map((st, i) => (vis.seatY[i] != null ? [st[0], vis.seatY[i] + 0.04, st[2]] : st));
  const y0 = kind === 'car' ? Math.max(b.y0, 0.6) : kind === 'boat' ? b.y0 : kind === 'plane' ? 1.7 : Math.max(0, b.y0);
  d.hull = { x0: b.x0, x1: b.x1, y0, y1: b.y1, z0: b.z0, z1: b.z1, xc: (b.x0 + b.x1) / 2, zc: (b.z0 + b.z1) / 2 };
  d.size = { w: b.x1 - b.x0, h: b.y1, l: b.z1 - b.z0 };
  d.hw = ((b.x1 - b.x0) / 2) * 0.95; d.hl = ((b.z1 - b.z0) / 2) * 0.97;
  if (kind === 'plane') d.hw = 2.6; // the fuselage; the wings fly over most things
  d.cmY = kind === 'car' ? b.y1 * 0.3 : kind === 'bike' ? 1.9 * d.scale : kind === 'boat' ? Math.max(1.2, b.y1 * 0.22) : kind === 'heli' ? 4.2 : 4.4;
  d.cmZ = kind === 'plane' ? 1.4 : kind === 'heli' ? -0.6 : kind === 'car' ? d.size.l * 0.025 : 0; // front-engined
  // inertia of the main box (planes: the fuselage and wings)
  const W = kind === 'plane' ? 20 : d.size.w, H = Math.max(2, b.y1 - y0), L = d.size.l;
  const kI = kind === 'bike' ? 1.4 : kind === 'heli' ? 1.2 : kind === 'car' ? 0.85 : 1;
  const kY = kind === 'car' ? 0.6 : 1; // cars turn on a dime (arcade): less yaw inertia
  d.I = new THREE.Vector3(m * (H * H + L * L) / 12 * kI, m * (W * W + L * L) / 12 * kI * kY, m * (W * W + H * H) / 12 * kI);
  d.invI = new THREE.Vector3(1 / d.I.x, 1 / d.I.y, 1 / d.I.z);
  d.invM = 1 / m;
  d.radius = Math.hypot(d.size.w / 2, b.y1 - d.cmY, d.size.l / 2);
  d.tough = d.tough || 1;
  // engine: constant power (kW -> kg studs^2/s^3), drag sized so the top speed is just reachable
  d.Pw = d.power * 1000 / (K.STUD * K.STUD) * (kind === 'boat' ? 1 : 1.6);
  d.mu = (d.grip || 1) * 0.46;
  d.muX = d.mu * 1.3; // tyres hold more along than across (arcade traction)
  // launch force: just under what the driven tyres can hold (sporty ones can light them up)
  const nWh = vis.wheels.length || 1, nDr = vis.wheels.filter((w) => driven(d, w)).length || nWh;
  // (and never more than the engine's punch: power/mass / 55, at most ~1 g of launch)
  d.Fmax = m * Math.min(G * d.muX * (nDr / nWh) * ((d.drift || 0) > 0.55 ? 1.25 : 0.95), d.Pw / m / 55, 30);
  d.dragK = kind === 'boat' ? d.Pw / (d.top * d.top * d.top * m) : (0.7 * d.Pw) / (d.top * d.top * d.top);
  d.downK = 0.00075 * (d.downforce ?? 0.35);
  d.brakeF = (d.brake || 1) * m * G * d.mu * 1.1;
  d.steerFade = kind === 'bike' ? 70 : 52;
  d.peakF = 0.17; d.peakR = 0.12; // stiffer at the back: stable, a little understeer
  d.slideF = 0.86; d.slideR = 0.84 - (d.drift || 0) * 0.25;
  d.hbGrip = 0.34 + (1 - (d.drift || 0)) * 0.16;
  d.esp = kind === 'bike' ? 10 : 10 - (d.drift || 0) * 6;
  d.tcs = kind === 'bike' || (d.drift || 0) <= 0.55;
  d.rollLift = kind === 'bike' ? 1 : kind === 'plane' ? 0.85 : 0.5;
  d.revTop = Math.min(32, d.top * 0.25);
  d.gearTop = []; for (let i = 1; i <= d.gears; i++) d.gearTop.push(d.top * Math.pow(i / d.gears, 0.78));
  d.bodyMu = 0.55; d.wallMu = 0.3;
  d.stepH = kind === 'car' ? (d.mass > 3000 ? 1.7 : 1.25) : kind === 'bike' ? 0.9 : kind === 'boat' ? 0.4 : 0.5;
  // wheels and their springs (the static load shared front/back by where the centre of mass sits)
  const ws = vis.wheels;
  d.wheels = [];
  if (ws.length) {
    let zf = 0, nf = 0, zr = 0, nr = 0;
    for (const w of ws) if (w.front) { zf += w.z; nf++; } else { zr += w.z; nr++; }
    zf /= nf || 1; zr /= nr || 1;
    d.wheelbase = Math.max(2, zf - zr);
    d.frontArm = zf - d.cmZ;
    const ff = nf && nr ? clamp((d.cmZ - zr) / (zf - zr), 0.1, 0.9) : 0.5;
    const nD = ws.filter((w) => driven(d, w)).length;
    d.nDriven = nD;
    for (const w of ws) {
      const load = (m * G * (w.front ? ff : 1 - ff)) / Math.max(1, w.front ? nf : nr);
      const Lmax = kind === 'plane' ? 1.1 : kind === 'bike' ? w.r * 0.8 : w.r * 0.9;
      const xs = Lmax * (kind === 'car' ? 0.45 : 0.4);
      const k = load / xs;
      const zeta = kind === 'bike' ? 0.6 : 0.42;
      d.wheels.push({
        x: w.x, y: w.y, z: w.z, r: w.r, w: w.w, front: w.front, left: w.left, vis: w,
        steer: kind === 'plane' ? (w.front ? 0.35 : 0) : w.front ? 1 : 0,
        driven: driven(d, w), driveShare: 1 / Math.max(1, nD),
        Lmax, xs, mountY: w.y + (Lmax - xs), staticLoad: load, k, c: 2 * zeta * Math.sqrt(k * (load / G)),
      });
    }
  } else { d.nDriven = 0; d.wheelbase = d.size.l * 0.6; d.frontArm = d.wheelbase / 2; }
  // hull points that touch the ground (roof, sides, skids, wingtips...)
  const h = d.hull, ix = (h.x1 - h.x0) / 2 * 0.92, xc = h.xc, z0 = h.z0 * 0.94, z1 = h.z1 * 0.94;
  if (kind === 'heli') d.corners = [[2.7, 0, -4.2], [-2.7, 0, -4.2], [2.7, 0, 5.2], [-2.7, 0, 5.2], [0, 7.6, 1.5], [3, 5, 1.5], [-3, 5, 1.5], [0, 5.2, -16.5], [0, 2, 6.8]];
  else if (kind === 'plane') d.corners = [[0, 2.3, 10], [0, 2.4, -2], [0, 4.5, -12.5], [18.4, 7.1, 4.6], [-18.4, 7.1, 4.6], [0, 10.2, -12], [0, 7.6, 4.6], [6, 6.9, 4.6], [-6, 6.9, 4.6]];
  else {
    const bx = kind === 'boat' ? ix * 0.6 : ix;
    d.corners = [
      [xc + bx, h.y0, z0], [xc - bx, h.y0, z0], [xc + bx, h.y0, z1], [xc - bx, h.y0, z1],
      [xc + ix * 0.78, h.y1 * 0.97, h.zc + (h.z1 - h.z0) * 0.28], [xc - ix * 0.78, h.y1 * 0.97, h.zc + (h.z1 - h.z0) * 0.28],
      [xc + ix * 0.78, h.y1 * 0.97, h.zc - (h.z1 - h.z0) * 0.28], [xc - ix * 0.78, h.y1 * 0.97, h.zc - (h.z1 - h.z0) * 0.28],
      [xc + ix, (h.y0 + h.y1) * 0.5, h.zc], [xc - ix, (h.y0 + h.y1) * 0.5, h.zc],
    ];
    if (kind === 'bike') { const k = d.scale; d.corners = [[0, 0.5 * k, z0], [0, 0.5 * k, z1], [0.9 * k, 2.6 * k, 0.5 * k], [-0.9 * k, 2.6 * k, 0.5 * k], [0.8 * k, 1.4 * k, -1.5 * k], [-0.8 * k, 1.4 * k, -1.5 * k], [0.9 * k, 3.1 * k, 1.6 * k], [-0.9 * k, 3.1 * k, 1.6 * k]]; }
  }
  // boats: buoyancy points over the hull bottom
  if (kind === 'boat') {
    const bw = ix * 0.7, by = h.y0 + 0.4;
    d.buoy = [];
    for (const z of [h.z0 * 0.85, h.z0 * 0.35, h.z1 * 0.2, h.z1 * 0.65]) for (const s of [1, -1]) d.buoy.push([xc + s * bw * (z > h.z1 * 0.5 ? 0.6 : 1), by, z]);
    d.buoyD = 2.4;
    d.buoyK = (m * G * 2.6) / (d.buoy.length * d.buoyD);
    d.buoyC = 2 * 0.55 * Math.sqrt(d.buoyK * (m / d.buoy.length));
  }
  // planes: aerodynamics (takeoff around 80 studs/s)
  if (kind === 'plane') {
    d.vRot = 70; d.cl0 = 0.3; d.cla = 4.6; d.stall = 0.3;
    d.liftK = G / (78 * 78 * (d.cl0 + d.cla * 0.06));
    d.cd0 = 0.0009; d.cdi = 0.0006; d.thrustA = 34;
  }
  d._ready = true;
  return d;
}
function driven(d, w) {
  if (d.kind === 'plane') return false;
  if (d.kind === 'bike') return !w.front;
  return d.drive === 'awd' ? true : d.drive === 'fwd' ? w.front : !w.front;
}

// ---- a vehicle -----------------------------------------------------------------------------------------------------------------------
let NEXT_ID = 1;

export class Vehicle {
  constructor(sys, def, x, z, heading, o = {}) {
    this.sys = sys;
    this.id = NEXT_ID++;
    this.type = def.id; this.def = def; this.kind = def.kind;
    this.name = def.name;
    this.size = def.size;
    this.pos = new THREE.Vector3(x, 0, z);
    this.quat = new THREE.Quaternion().setFromAxisAngle(_ay, heading);
    this.com = new THREE.Vector3();
    this.vel = new THREE.Vector3();
    this.angVel = new THREE.Vector3();
    this.mat = new THREE.Matrix4();
    this._fw = new THREE.Vector3(Math.sin(heading), 0, Math.cos(heading));
    this.ctl = { throttle: 0, brake: 0, steer: 0, handbrake: false, up: 0, yaw: 0, horn: false, siren: false };
    this.seats = new Array(def.seats.length).fill(null);
    this.passengers = [];
    this.health = 1000; this.dead = false; this.burning = false; this.locked = !!o.locked;
    this.lights = false; this.lightsMode = 'auto'; this._siren = false;
    this.engineOn = !o.parked && o.engine !== false;
    this.parked = !!o.parked;
    this.speed = 0; this.rpm = 0; this.gear = 1; this.shiftT = 0; this.steerAngle = 0;
    this.skid = 0; this.wheelSpin = 0; this.contacts = 0; this.compression = 0; this.braking = false;
    this.rotor = def.kind === 'heli' && !o.parked ? 1 : 0; this.thrust = 0; this.lean = 0;
    this.inWater = 0; this.drowned = false; this.airT = 0; this.alt = 0; this.lowY = 0; this.highY = 0;
    this.sleeping = false; this.sleepT = 0; this.roofT = 0; this.burnT = 0; this.deadT = 0;
    this.lastAttacker = null; this.crashT = 0; this.hornT = 0;
    this._lastGear = 1;
    this.impDv = 0; this.impG = 0; this.impMax = 0; this.impOther = null; this.impKind = ''; this.impP = new THREE.Vector3(); this.impN = new THREE.Vector3();
    this.wheels = def.wheels.map(() => ({ len: 0, contact: false, load: 0, slip: 0, skid: 0, omega: 0, rot: 0, surf: 1 }));
    for (let i = 0; i < this.wheels.length; i++) this.wheels[i].len = def.wheels[i].Lmax - def.wheels[i].xs;
    // paint
    const pal = def.paints;
    this.color = o.color ? new THREE.Color(o.color) : pal ? new THREE.Color(pal[(Math.random() * pal.length) | 0]) : new THREE.Color(1, 1, 1);
    // drawing
    const vis = def.vis;
    this.group = new THREE.Group();
    this.group.name = 'vehicle:' + def.id;
    this.material = vehicleMaterial();
    this.material.userData.u.uPaint.value.copy(this.color);
    this.body = new THREE.Mesh(vis.body, this.material);
    this.body.name = 'body';
    this.group.add(this.body);
    if (vis.rotor) {
      this.rotorMesh = new THREE.Mesh(vis.rotor.geo, this.material);
      this.rotorMesh.position.set(vis.rotor.x, vis.rotor.y, vis.rotor.z);
      this.group.add(this.rotorMesh);
      this.discMesh = new THREE.Mesh(sys.discGeo, sys.discMat);
      this.discMesh.position.copy(this.rotorMesh.position);
      this.discMesh.scale.setScalar(vis.rotor.r);
      this.discMesh.renderOrder = 4;
      this.group.add(this.discMesh);
      this.tailMesh = new THREE.Mesh(vis.tail.geo, this.material);
      this.tailMesh.position.set(vis.tail.x, vis.tail.y, vis.tail.z);
      this.group.add(this.tailMesh);
    }
    if (vis.prop) {
      this.propMesh = new THREE.Mesh(vis.prop.geo, this.material);
      this.propMesh.position.set(vis.prop.x, vis.prop.y, vis.prop.z);
      this.group.add(this.propMesh);
    }
    this.banks = def.wheels.map((w) => wheelBank(w.vis));
    // place it on whatever is under it
    let y = o.y;
    if (y == null) {
      if (def.kind === 'boat') y = Math.max(waterAt(x, z) === -Infinity ? -1e9 : -0.6, V.phys.groundAt(x, 60, z, 1, 0));
      else {
        // the street (or a bridge deck over water), not the expressway overhead
        const gh = V.ground.heightAt(x, z);
        const yp = o.yProbe ?? (gh < 0 ? Math.max(gh, V.phys.deckAt(x, z, 200)) + 1 : gh + 2);
        y = V.phys.groundAt(x, yp, z, 1, 0);
      }
    }
    this.pos.y = y;
    if (def.kind === 'heli' && !o.parked && o.y != null) this.engineOn = true;
    syncCom(this);
    this.surf = 1;
    refresh(this);
    // the box people and bullets collide with
    this.box = V.phys.add(x, y + def.size.h / 2, z, def.hw, def.size.h / 2, def.hl, heading, 'metal', { vehicle: this, shootable: true, cover: def.kind === 'car' });
    this._cells = NaN;
    this.syncBox();
    this.updateMatrix();
    sys.scene.add(this.group);
  }

  get heading() { return Math.atan2(this._fw.x, this._fw.z); }
  /** The light bar and siren: on while ctl.siren is (setting veh.siren sets ctl.siren). */
  get siren() { return this._siren; }
  set siren(on) { this.ctl.siren = !!on; this._siren = !!on && !!this.def.siren && !this.dead; }
  get driver() { return this.seats[0]; }
  set driver(p) { if (p) this.enter(p, 0); else if (this.seats[0]) this.leave(this.seats[0]); }
  get driverIn() { return !!this.seats[0]; }
  get passengerCount() { return this.passengers.length; }

  // ---- occupants ----
  /** Put someone in a seat (0 = driver). Returns false if it's taken. */
  enter(who, seat = 0) {
    if (seat < 0 || seat >= this.seats.length) return false;
    if (this.seats[seat] && this.seats[seat] !== who) return false;
    const i = this.seats.indexOf(who);
    if (i >= 0) this.seats[i] = null;
    this.seats[seat] = who;
    this._occ();
    if (seat === 0 && !this.dead) { this.engineOn = true; this.parked = false; }
    this.wake();
    return true;
  }
  leave(who) {
    const i = this.seats.indexOf(who);
    if (i < 0) return false;
    this.seats[i] = null;
    this._occ();
    if (i === 0) { this.ctl.throttle = 0; this.ctl.brake = 0; this.ctl.handbrake = false; this.ctl.up = 0; this.ctl.steer = 0; this.ctl.horn = false; }
    return true;
  }
  seatOf(who) { return this.seats.indexOf(who); }
  /** The first free seat (the driver's first unless passengerOnly). */
  freeSeat(passengerOnly = false) { for (let i = passengerOnly ? 1 : 0; i < this.seats.length; i++) if (!this.seats[i]) return i; return -1; }
  _occ() { this.passengers.length = 0; for (let i = 1; i < this.seats.length; i++) if (this.seats[i]) this.passengers.push(this.seats[i]); }

  /** World matrix of seat i: the point the rider's hips sit on, facing the vehicle's forward (+Z local). */
  seatWorld(i, out = new THREE.Matrix4()) {
    const s = this.def.seats[Math.min(i, this.def.seats.length - 1)], k = this.def.scale;
    _v.set(s[0] * k, s[1] * k, s[2] * k);
    _m.makeTranslation(_v.x, _v.y, _v.z);
    return out.multiplyMatrices(this.mat, _m);
  }
  /** Where someone getting out on this side ('left' | 'right' | seat index) stands (on the ground). */
  exitPoint(side = 'left', out = new THREE.Vector3()) {
    const d = this.def;
    let sz = 0, left = true;
    if (typeof side === 'number') { const s = d.seats[Math.min(side, d.seats.length - 1)]; sz = s[2] * d.scale; left = s[0] >= 0; }
    else { left = side !== 'right'; sz = d.seats[0][2] * d.scale; }
    const off = d.kind === 'heli' ? 5.5 : d.kind === 'plane' ? 4.5 : d.hw + 2.6;
    toWorld(this, (left ? 1 : -1) * off, 0, sz, out);
    out.y = V.phys.groundAt(out.x, out.y + 4, out.z, 0.6, 4);
    return out;
  }

  // ---- control helpers ----
  horn(on = true) {
    this.ctl.horn = on;
    if (on && this.hornT <= 0) { this.hornT = 0.6; V.events?.emit('noise', { pos: this.pos, r: 60, kind: 'horn', src: this }); }
  }
  setPaint(c) { this.color.set(c); this.material.userData.u.uPaint.value.copy(this.color); }
  /** Good as new (Pay 'n' Spray): health, dents, glass, tyres. */
  repair() {
    this.health = 1000; this.burning = false; this.burnT = 0; this.roofT = 0;
    if (this.dented) { this.body.geometry.dispose(); this.body.geometry = this.def.vis.body; this.dented = false; }
    this.glassBroken = false; this.material.userData.u.uGlassBroken.value = 0;
    for (const w of this.wheels) w.flat = false;
  }
  wake() { this.sleeping = false; this.sleepT = 0; }

  // ---- damage ----
  /** Take damage (collisions, bullets, explosions). part: 'body' | 'glass' | 'tyre' | 'tank' (optional). */
  damage(amount, point = null, dir = null, attacker = null, part = null) {
    if (amount <= 0) return;
    if (attacker) this.lastAttacker = attacker;
    if (this.dead) { this.deadHits = (this.deadHits || 0) + amount; return; }
    if (point && !part && amount < 200) part = this.partAt(point);
    if (part === 'tank') { amount *= 2.5; if (amount > 40 && Math.random() < 0.25 && this.health > 149) this.health = 149; }
    else if (part === 'tyre' && point) this.popTyre(point);
    else if (part === 'glass' && point && !this.glassBroken) this.shatter(point);
    this.health -= amount;
    if (this.health < 150 && !this.burning) { this.burning = true; this.burnT = 4 + Math.random() * 3; }
    // a heavy hit (a rocket, a big blast) sets it off at once
    if (this.health < -250 || (amount >= 700 && this.health <= 0)) this.explode(attacker);
    else if (this.burning && amount > 20) this.burnT -= amount * 0.004;
    if (dir && point && !this.dead && amount > 5) {
      // shots push a little (and wake it up)
      this.wake();
      impulse(this, dir.x * amount * 6, dir.y * amount * 6, dir.z * amount * 6, point.x, point.y, point.z);
    }
  }

  /** Which part a world point is on (for hits that don't say). */
  partAt(p) {
    const d = this.def, h = d.hull;
    _q.copy(this.quat).invert();
    _v.copy(p).sub(this.pos).applyQuaternion(_q);
    for (const w of d.wheels) if (Math.abs(_v.z - w.z) < w.r && _v.y < w.y + w.r && Math.abs(Math.abs(_v.x) - Math.abs(w.x)) < w.w + 0.8) return 'tyre';
    const hh = h.y1 - h.y0;
    if (d.kind !== 'bike' && _v.y > h.y0 + hh * 0.58 && _v.y < h.y1 * 0.95 && Math.abs(_v.x) > (h.x1 - h.x0) * 0.3) return 'glass';
    if (d.kind === 'car' && _v.z < h.z0 + (h.z1 - h.z0) * 0.3 && _v.y < h.y0 + hh * 0.45) return 'tank';
    return 'body';
  }
  /** A shot tyre: down on the rim (it sags, grips less and throws sparks). */
  popTyre(p) {
    _q.copy(this.quat).invert();
    _v.copy(p).sub(this.pos).applyQuaternion(_q);
    let best = -1, bd = Infinity;
    this.def.wheels.forEach((w, i) => { const dd = Math.hypot(_v.x - w.x, _v.z - w.z); if (dd < bd) { bd = dd; best = i; } });
    if (best < 0 || this.wheels[best].flat) return;
    this.wheels[best].flat = true;
    V.events?.emit('vehicle:tyre', { veh: this, wheel: best, pos: p.clone ? p.clone() : p });
  }
  shatter(p) {
    this.glassBroken = true;
    this.material.userData.u.uGlassBroken.value = 1;
    V.fx?.glass?.(p);
  }
  /** Crumple the body in: displace the vertices round a world point along a direction (into the car). */
  dent(px, py, pz, nx, ny, nz, amount) {
    if (amount <= 0.05) return;
    const vis = this.def.vis;
    if (!this.dented) {
      // our own positions (the other attributes stay shared with the type)
      const src = vis.body, g = new THREE.BufferGeometry();
      for (const k of Object.keys(src.attributes)) g.setAttribute(k, k === 'position' ? new THREE.BufferAttribute(src.attributes.position.array.slice(), 3) : src.attributes[k]);
      g.boundingSphere = src.boundingSphere;
      this.body.geometry = g;
      this.dented = true;
    }
    _q.copy(this.quat).invert();
    _v.set(px, py, pz).sub(this.pos).applyQuaternion(_q);
    _w.set(nx, ny, nz).applyQuaternion(_q).normalize();
    const pos = this.body.geometry.attributes.position.array, orig = vis.body.attributes.position.array;
    const R = 2.8 + amount * 1.4, depth = Math.min(2.2, amount * 0.85), R2 = R * R, maxD = 2.6;
    for (let i = 0; i < pos.length; i += 3) {
      const dx = pos[i] - _v.x, dy = pos[i + 1] - _v.y, dz = pos[i + 2] - _v.z, d2 = dx * dx + dy * dy + dz * dz;
      if (d2 > R2) continue;
      const f = 1 - Math.sqrt(d2) / R, k = depth * f * f;
      let x = pos[i] + _w.x * k, y = pos[i + 1] + _w.y * k * 0.5, z = pos[i + 2] + _w.z * k;
      // never more than maxD from where it was built
      const ox = x - orig[i], oy = y - orig[i + 1], oz = z - orig[i + 2], ol = Math.hypot(ox, oy, oz);
      if (ol > maxD) { const s = maxD / ol; x = orig[i] + ox * s; y = orig[i + 1] + oy * s; z = orig[i + 2] + oz * s; }
      pos[i] = x; pos[i + 1] = y; pos[i + 2] = z;
    }
    this.body.geometry.attributes.position.needsUpdate = true;
  }

  /** Blow up: fireball, wreckage, a blast that hurts what's near, then a burnt-out shell. */
  explode(attacker = this.lastAttacker) {
    if (this.dead) return;
    const sys = this.sys, d = this.def;
    this.dead = true; this.burning = false; this.health = 0; this.deadT = 0;
    this.engineOn = false; this.ctl.siren = false; this._siren = false; this.lights = false;
    this.wake();
    syncCom(this);
    _p.copy(this.com);
    const size = clamp(d.mass / 1600, 0.8, 1.6);
    if (V.fx?.explosion) V.fx.explosion(_p, size); else sys.fx.fireball(_p, size);
    // crumpled, the glass gone
    if (d.kind === 'car') for (let i = 0; i < 3; i++) { toWorld(this, (Math.random() - 0.5) * d.size.w, d.hull.y1 * (0.4 + Math.random() * 0.5), (Math.random() - 0.5) * d.size.l, _w); this.dent(_w.x, _w.y, _w.z, 0, -1, 0, 1.5 + Math.random()); }
    this.material.userData.u.uGlassBroken.value = 1;
    // the car jumps and tumbles
    this.vel.y += 22 + Math.random() * 10;
    this.vel.x += (Math.random() - 0.5) * 10; this.vel.z += (Math.random() - 0.5) * 10;
    this.angVel.x += (Math.random() - 0.5) * 2.5; this.angVel.z += (Math.random() - 0.5) * 2.5; this.angVel.y += (Math.random() - 0.5) * 1.5;
    // wreckage
    if (d.kind === 'car' || d.kind === 'bike') {
      const parts = d.kind === 'bike' ? ['debris-tire', 'debris-plate-a'] : ['debris-door', 'debris-bumper', 'debris-tire', 'debris-plate-a', 'debris-plate-b', Math.random() < 0.5 ? 'debris-door-window' : 'debris-spoiler-a'];
      for (const n of parts) {
        const a = Math.random() * 6.283, s = 18 + Math.random() * 26;
        sys.fx.debris(n, _p, Math.cos(a) * s + this.vel.x, 25 + Math.random() * 30, Math.sin(a) * s + this.vel.z, 10);
      }
    }
    // the blast: people (combat) and vehicles (impulse, and damage when combat doesn't do it)
    const r = 26 * size, dmg = 160;
    sys.blast(_p, r, dmg, attacker, this, !!V.combat?.explode);
    V.combat?.explode?.(_p.clone(), r, dmg, attacker, { vehicle: this });
    for (const who of this.seats) if (who && !who.dead) who.hit?.(1000, 'torso', _ay, attacker, { explosion: true, vehicle: this });
    if (!V.combat?.explode) V.events?.emit('noise', { pos: _p.clone(), r: 260, kind: 'explosion', src: this });
    if (attacker?.isPlayer && !V.combat?.explode) V.events?.emit('crime', { kind: 'explosion', pos: _p.clone(), by: attacker, victim: this });
    V.events?.emit('vehicle:destroyed', { veh: this, attacker });
  }

  /** A collision (called per substep): summed over the frame, then applied by impacts(). */
  onImpact(dv, other, p, kind, nx = 0, nz = 0) {
    if (kind === 'ground') { if (dv > this.impG) this.impG = dv; return; } // the hardest corner, not the sum
    if (dv > this.impMax) { this.impMax = dv; this.impOther = other; this.impKind = kind; this.impP.set(p.x, p.y, p.z); this.impN.set(nx, 0, nz); }
    this.impDv += dv;
  }

  /** Once a frame: damage, sound and shake events, bikes throw their rider, aircraft blow up. */
  impacts() {
    const d = this.def, dv = this.impDv, g = this.impG;
    this.impDv = 0; this.impG = 0;
    const other = this.impOther;
    this.impMax = 0; this.impOther = null;
    const air = d.kind === 'heli' || d.kind === 'plane';
    if (g >= 28) {
      this.damage(((g - 28) * (air ? 8 : 2.5)) / d.tough, this.com, null, this.driver);
      if (air && g > 40 && !this.dead) this.explode(this.lastAttacker);
      if (d.kind === 'bike' && g > 45 && this.driver) this.eject(g);
    }
    if (dv < 12) return;
    const otherVeh = other && other.vehicle ? other.vehicle : other instanceof Vehicle ? other : null;
    const attacker = otherVeh?.driver || this.driver || null;
    this.damage(((dv - 12) * (air ? 8 : d.kind === 'bike' ? 2.2 : 4.5)) / d.tough, this.impP, null, attacker);
    if (this.crashT <= 0) {
      this.crashT = 0.18;
      if (dv > 14 && this.impN.lengthSq() > 0.5) {
        this.dent(this.impP.x, this.impP.y, this.impP.z, this.impN.x, 0, this.impN.z, (dv - 10) / 15);
        // a hard one: bits of trim and glass fly, sparks, and the glass goes on a really big one
        if (dv > 28 && (d.kind === 'car' || d.kind === 'bike')) {
          const fx = this.sys.fx, n = dv > 45 ? 2 : 1;
          for (let i = 0; i < n; i++) fx.debris(Math.random() < 0.5 ? 'debris-plate-a' : 'debris-plate-b', this.impP, this.vel.x * 0.5 + this.impN.x * 14 + (Math.random() - 0.5) * 10, 10 + Math.random() * 12, this.vel.z * 0.5 + this.impN.z * 14 + (Math.random() - 0.5) * 10, 12);
          for (let i = 0; i < 6; i++) fx.spark(this.impP.x, this.impP.y, this.impP.z, this.impN.x * 20 + (Math.random() - 0.5) * 24, 6 + Math.random() * 14, this.impN.z * 20 + (Math.random() - 0.5) * 24);
          if (dv > 48 && !this.glassBroken && d.kind === 'car') this.shatter(this.impP);
        }
      }
      V.events?.emit('vehicle:crash', { veh: this, other: otherVeh || other, pos: this.impP.clone(), speed: dv, kind: this.impKind });
      if (dv > 18) V.events?.emit('noise', { pos: this.pos, r: 50 + dv * 2, kind: 'crash', src: this });
      if (this.driver?.isPlayer) V.cam?.shake?.(Math.min(1, dv / 60));
      // the player ramming someone is a crime (the police and the other driver care)
      if (otherVeh && this.driver?.isPlayer && dv > 15) V.events?.emit('crime', { kind: 'assault', pos: this.impP.clone(), by: this.driver, victim: otherVeh.driver || otherVeh });
    }
    // aircraft hitting things hard go up at once; bikes throw the rider
    if (air && dv > 42 && !this.dead) this.explode(attacker);
    if (d.kind === 'bike' && dv > 24 && this.driver) this.eject(dv);
  }

  /** Throw everyone off (bikes, big crashes): they go flying with the vehicle's velocity. */
  eject(dv = 30) {
    for (let i = 0; i < this.seats.length; i++) {
      const who = this.seats[i];
      if (!who) continue;
      this.leave(who);
      const vel = this.vel.clone().multiplyScalar(0.9); vel.y += 10 + dv * 0.25;
      V.events?.emit('vehicle:eject', { veh: this, who, vel });
    }
  }

  // ---- per frame ----
  /** Visual state: matrices, wheels, rotors, lights, damage effects. */
  draw(dt, night, flash) {
    const d = this.def, u = this.material.userData.u;
    this.group.position.copy(this.pos);
    this.group.quaternion.copy(this.quat);
    // lights: auto at night with the engine on; brake lights; the light bar
    if (this.lightsMode === 'auto') this.lights = this.engineOn && !this.dead && night > 0.3;
    else this.lights = this.lightsMode === 'on' && !this.dead;
    const L = u.uLights.value;
    // (the bloom threshold is ~1.6: tail lights stay under it, brake lights and strobes just over, so they
    // read as small crisp glows and never wash out the chase camera)
    L.x = this.lights ? 1.2 : this.engineOn ? 0.18 : 0;
    L.y = (this.lights ? 0.8 : this.engineOn ? 0.22 : 0.05) + (this.braking && this.engineOn ? (this.lights ? 1.05 : 1.45) : 0);
    this._siren = !!d.siren && !!this.ctl.siren && !this.dead;
    if (this._siren) { L.z = flash.r * 3.2; L.w = flash.b * 3.6; } else if (d.kind === 'heli') { L.z = flash.beacon * 2; L.w = 0; } else { L.z = 0; L.w = 0; }
    u.uGlow.value = this.engineOn || d.kind === 'heli' || d.kind === 'plane' ? 1.6 : 0.4;
    u.uDirt.value = clamp((1000 - this.health) / 1000, 0, 1) * 0.8;
    if (this.dead) u.uBurnt.value = Math.min(1, u.uBurnt.value + dt * 1.2);
    else if (u.uBurnt.value) u.uBurnt.value = 0;
    // rotors and prop
    if (this.rotorMesh) {
      this.rotorAng = ((this.rotorAng || 0) + this.rotor * 30 * dt) % (Math.PI * 2);
      this.rotorMesh.rotation.y = this.rotorAng;
      this.tailMesh.rotation.x = (this.rotorAng * 3.1) % (Math.PI * 2);
      this.discMesh.visible = this.rotor > 0.3;
    }
    if (this.propMesh) { this.propAng = ((this.propAng || 0) + this.rpm * 60 * dt) % (Math.PI * 2); this.propMesh.rotation.z = this.propAng; }
  }

  updateMatrix() {
    this.mat.compose(this.pos, this.quat, _one);
    this._fw.set(0, 0, 1).applyQuaternion(this.quat);
  }

  /** Keep the phys box on the vehicle (re-filed in the grid only when it crosses a cell). */
  syncBox() {
    const b = this.box, d = this.def;
    toWorld(this, d.hull.xc, (d.hull.y0 + d.hull.y1) / 2, d.hull.zc, _w);
    const yaw = Math.atan2(this._fw.x, this._fw.z);
    const c = Math.cos(yaw), s = Math.sin(yaw);
    const ex = Math.abs(b.hx * c) + Math.abs(b.hz * s), ez = Math.abs(b.hx * s) + Math.abs(b.hz * c);
    const i0 = Math.floor((_w.x - ex) / 32), i1 = Math.floor((_w.x + ex) / 32), j0 = Math.floor((_w.z - ez) / 32), j1 = Math.floor((_w.z + ez) / 32);
    const key = ((i0 * 8191 + i1) * 8191 + j0) * 8191 + j1;
    if (key !== this._cells) { V.phys.move(b, _w.x, _w.y, _w.z, yaw); this._cells = key; }
    else { b.x = _w.x; b.y = _w.y; b.z = _w.z; b.yaw = yaw; b.c = c; b.s = s; }
  }
}

// ---- the fleet ---------------------------------------------------------------------------------------------------------------------
export class Vehicles {
  constructor(world) {
    this.world = world;
    this.scene = world.scene;
    this.TYPES = TYPES;
    this.MIX = MIX;
    this.list = [];
    this.time = 0;
    setBankScene(this.scene);
    this.fx = new VehFX(this.scene);
    this.discGeo = new THREE.CircleGeometry(1, 28).rotateX(-Math.PI / 2);
    this.discMat = new THREE.MeshBasicMaterial({ color: 0x18191c, transparent: true, opacity: 0.16, depthWrite: false, side: THREE.DoubleSide });
    this.flash = { r: 0, b: 0, beacon: 0 };
    this.debug = null;
    this.stats = { ms: 0, steps: 0, active: 0 };
    this._pairs = [];
  }

  /** Called once the models are loaded: build every type and park the showroom. */
  ready() {
    for (const id of Object.keys(TYPES)) prepare(id);
    shadowBank();
    if (V.cfg?.vehShowroom !== false) this.showroom();
    this.hooks();
  }

  /** Make a vehicle. type: a TYPES id (or an alias like 'truck', 'heli', a Kenney model name). */
  spawn(type, x, z, heading = 0, o = {}) {
    const id = typeId(type);
    if (!id) { console.warn('[vehicles] unknown type', type); return null; }
    const d = prepare(id);
    const v = new Vehicle(this, d, x, z, heading, o);
    if (o.parked) {
      v.sleeping = true;
      // a parked bike leans on its kickstand
      if (d.kind === 'bike') { v.quat.multiply(_q.setFromAxisAngle(_v.set(0, 0, 1), -0.2)); v.pos.y += 0.05; syncCom(v); v.updateMatrix(); }
    }
    if (o.vel) v.vel.copy(o.vel);
    else if (o.speed) v.vel.copy(v._fw).multiplyScalar(o.speed);
    this.list.push(v);
    return v;
  }

  /** Take a vehicle out of the world (whoever is inside should have got out: their seats are cleared). */
  remove(v) {
    const i = this.list.indexOf(v);
    if (i < 0) return;
    this.list.splice(i, 1);
    v.removed = true;
    v.seats.fill(null); v._occ();
    if (v.dented) v.body.geometry.dispose();
    if (v.box) { V.phys.remove(v.box); v.box = null; }
    this.scene.remove(v.group);
    v.material.dispose();
    if (this.debug?.veh === v) this.debug = null;
  }

  /** Vehicles within r of (x, z). */
  near(x, z, r, out = []) {
    out.length = 0;
    const r2 = r * r;
    for (const v of this.list) { const dx = v.pos.x - x, dz = v.pos.z - z; if (dx * dx + dz * dz <= r2) out.push(v); }
    return out;
  }

  /** Push and (unless combat does it) damage every vehicle in a blast. */
  blast(pos, r, dmg, attacker = null, skip = null, impulseOnly = false) {
    for (const v of this.list) {
      if (v === skip) continue;
      const dx = v.com.x - pos.x, dy = v.com.y - pos.y, dz = v.com.z - pos.z, dist = Math.hypot(dx, dy, dz);
      if (dist > r + v.def.radius) continue;
      const f = clamp(1 - Math.max(0, dist - v.def.radius * 0.5) / r, 0, 1);
      if (f <= 0) continue;
      v.wake();
      const L = dist || 1, J = v.def.mass * 30 * f;
      // off-centre so it spins and flips
      impulse(v, (dx / L) * J, J * 0.9, (dz / L) * J, v.com.x - dx * 0.2, v.com.y - 1, v.com.z - dz * 0.2);
      if (!impulseOnly) v.damage(dmg * f * 4, v.com, null, attacker);
    }
  }

  /**
   * Bullets: the first vehicle a ray hits. -> { veh, d, point, normal, part: 'body'|'glass'|'tyre'|'tank' } | null
   */
  hitTest(origin, dir, max = 1000, skip = null) {
    let best = max, res = null;
    for (const v of this.list) {
      if (v === skip) continue;
      const d = v.def;
      // bounding sphere
      const cx = v.com.x - origin.x, cy = v.com.y - origin.y, cz = v.com.z - origin.z;
      const t = cx * dir.x + cy * dir.y + cz * dir.z;
      const r = d.radius + 1;
      if (t < -r || t - r > best) continue;
      const px = cx - dir.x * t, py = cy - dir.y * t, pz = cz - dir.z * t;
      if (px * px + py * py + pz * pz > r * r) continue;
      // into the vehicle's frame
      _q.copy(v.quat).invert();
      _u.copy(origin).sub(v.pos).applyQuaternion(_q);
      _w.copy(dir).applyQuaternion(_q);
      const h = d.hull, y0 = Math.max(h.y0 * 0.6, 0.3);
      let t0 = 0, t1 = best, ax = -1, sg = 1;
      const lo = [h.x0 * 0.96, y0, h.z0], hi = [h.x1 * 0.96, h.y1 * (d.kind === 'heli' ? 0.85 : 0.97), h.z1];
      let ok = true;
      for (let k = 0; k < 3 && ok; k++) {
        const o = k === 0 ? _u.x : k === 1 ? _u.y : _u.z, dd = k === 0 ? _w.x : k === 1 ? _w.y : _w.z;
        if (Math.abs(dd) < 1e-9) { if (o < lo[k] || o > hi[k]) ok = false; continue; }
        let a = (lo[k] - o) / dd, b = (hi[k] - o) / dd, s = -1;
        if (a > b) { const tmp = a; a = b; b = tmp; s = 1; }
        if (a > t0) { t0 = a; ax = k; sg = s; }
        if (b < t1) t1 = b;
        if (t0 > t1) ok = false;
      }
      if (!ok || ax < 0 || t0 >= best) continue;
      // which part
      const lx = _u.x + _w.x * t0, ly = _u.y + _w.y * t0, lz = _u.z + _w.z * t0;
      let part = 'body';
      const hh = h.y1 - y0;
      if (d.kind !== 'bike' && ax !== 1 && ly > y0 + hh * 0.58 && ly < h.y1 * 0.95) part = 'glass';
      for (const w of d.wheels) if (Math.abs(lz - w.z) < w.r && ly < w.y + w.r && Math.abs(Math.abs(lx) - Math.abs(w.x)) < w.w + 0.8 && ax === 0) part = 'tyre';
      if (part === 'body' && d.kind === 'car' && ax === 0 && lz < h.z0 + (h.z1 - h.z0) * 0.3 && ly < y0 + hh * 0.45) part = 'tank';
      best = t0;
      _n.set(ax === 0 ? sg : 0, ax === 1 ? sg : 0, ax === 2 ? sg : 0).applyQuaternion(v.quat);
      res = { veh: v, d: t0, point: new THREE.Vector3().copy(origin).addScaledVector(dir, t0), normal: _n.clone(), part };
    }
    return res;
  }

  // ---- the frame ----
  update(dt) {
    const t0 = performance.now();
    const cam = this.world.camera.position;
    const night = this.night();
    // the light bars: two red flashes, two blue
    const ph = (this.time * 2.3) % 1;
    this.flash.r = (ph < 0.1 || (ph > 0.2 && ph < 0.3)) ? 1 : 0;
    this.flash.b = (ph > 0.5 && ph < 0.6) || (ph > 0.7 && ph < 0.8) ? 1 : 0;
    this.flash.beacon = ((this.time * 1.1) % 1) < 0.08 ? 1 : 0;
    if (this.debug) this.debugControls(dt);
    let steps = 0, active = 0;
    if (dt > 0) {
      this.time += dt;
      setWaterTime(this.time);
      // substeps: about 65 Hz for everyone, twice that for the player's vehicle (and focused ones)
      const N = this.forceN || Math.max(1, Math.min(4, Math.round(dt * 60 + 0.4)));
      const h = dt / N;
      // who moves: awake vehicles; near ones get substeps, far ones one big step
      const act = this._act || (this._act = []), far = this._far || (this._far = []);
      act.length = 0; far.length = 0;
      for (const v of this.list) {
        v.crashT -= dt; v.hornT -= dt;
        if (v.driverIn || v.burning || (v.kind === 'heli' && v.rotor > 0)) v.wake();
        // boats near the camera ride the swell
        else if (v.kind === 'boat' && v.sleeping && !v.dead && Math.abs(v.pos.x - cam.x) < 300 && Math.abs(v.pos.z - cam.z) < 300) v.wake();
        if (v.sleeping) {
          v._near = false;
          if (v.dead && v.deadT < 25) { v.deadT += dt; this.emitters(v, dt, _u.set(0, 1, 0).applyQuaternion(v.quat)); }
          continue;
        }
        const dx = v.pos.x - cam.x, dz = v.pos.z - cam.z;
        if (dx * dx + dz * dz > 420 * 420 && !v.focus && !v.driver?.isPlayer && v !== this.debug?.veh) far.push(v); else act.push(v);
      }
      active = act.length + far.length;
      for (const v of act) { v._near = true; v._hi = !!(v.focus || v.driver?.isPlayer || v === this.debug?.veh); }
      for (const v of far) v._near = false;
      this.findPairs(act, dt);
      this.findPairs(far, dt, true);
      const pr = this._pairs;
      for (let s = 0; s < N; s++) {
        for (const v of act) {
          if (v._hi) { step(v, h / 2); step(v, h / 2); steps += 2; } else { step(v, h); steps++; }
        }
        for (let i = 0; i < pr.length; i += 2) if (pr[i]._near || pr[i + 1]._near) this.pair(pr[i], pr[i + 1], h);
      }
      for (const v of far) { step(v, dt); steps++; }
      for (let i = 0; i < pr.length; i += 2) if (!pr[i]._near && !pr[i + 1]._near) this.pair(pr[i], pr[i + 1], dt);
      for (const v of act) this.afterStep(v, dt);
      for (const v of far) this.afterStep(v, dt);
    }
    // drawing
    this.drawAll(dt, night, cam);
    this.stats.ms = this.stats.ms * 0.9 + (performance.now() - t0) * 0.1;
    this.stats.steps = steps; this.stats.active = active;
  }

  /** Candidate pairs (close enough to touch this frame); sleeping vehicles they might hit are included. */
  findPairs(act, dt, append = false) {
    const pr = this._pairs; if (!append) pr.length = 0;
    const L = this.list;
    for (const a of act) a._pairMark = true;
    for (const a of act) {
      const ra = a.def.radius + a.vel.length() * dt;
      for (const b of L) {
        if (b === a || b.removed) continue;
        if (b._pairMark && b.id < a.id) continue; // each active pair once
        if (append && b._near) continue;          // near-far pairs were found in the first pass
        const dx = b.pos.x - a.pos.x; if (dx > 60 || dx < -60) continue;
        const dz = b.pos.z - a.pos.z; if (dz > 60 || dz < -60) continue;
        const rr = ra + b.def.radius + b.vel.length() * dt;
        if (dx * dx + dz * dz > rr * rr) continue;
        if (Math.abs(b.pos.y - a.pos.y) > a.def.radius + b.def.radius) continue;
        pr.push(a, b);
      }
    }
    for (const a of act) a._pairMark = false;
  }

  pair(a, b, h) {
    const j = collidePair(a, b, h);
    if (j <= 0) return;
    if (b.sleeping) { b.wake(); }
    const dva = j * a.def.invM, dvb = j * b.def.invM;
    _p.set(hit.x, hit.y, hit.z);
    a.onImpact(dva, b, _p, 'vehicle', hit.nx, hit.nz);
    b.onImpact(dvb, a, _p, 'vehicle', -hit.nx, -hit.nz);
  }

  /** After the physics: damage over time, fire, sleep, people, the phys box, effects. */
  afterStep(v, dt) {
    const d = v.def;
    v.updateMatrix();
    v.surf = surfKind(v.pos.x, v.pos.z);
    if (v.impDv || v.impG) v.impacts();
    const up = _u.set(0, 1, 0).applyQuaternion(v.quat);
    v.alt = v.pos.y - groundProbe(v.pos.x, v.pos.y + 1, v.pos.z, 0.5, v.box);
    v.airT = (v.contacts > 0 || v.bodyGround || v.inWater > 0.2) ? 0 : v.airT + dt;
    // on its roof for a while: it catches fire (GTA)
    if (d.kind === 'car' && !v.dead && up.y < -0.2 && v.vel.lengthSq() < 30 && v.bodyGround) {
      v.roofT += dt;
      if (v.roofT > 3.5 && v.health > 140) { v.health = 140; v.burning = true; v.burnT = 5 + Math.random() * 2; }
    } else v.roofT = 0;
    // burning: count down to the explosion
    if (v.burning && !v.dead) {
      v.health -= dt * 20;
      v.burnT -= dt;
      if (v.burnT <= 0) v.explode(v.lastAttacker);
    }
    if (v.dead) v.deadT += dt;
    if (v.ctl.horn && v.hornT <= 0 && !v.dead) { v.hornT = 0.6; V.events?.emit('noise', { pos: v.pos, r: 70, kind: 'horn', src: v }); }
    // drowned vehicles die quietly
    if (v.drowned && v.engineOn && v.inWater > 0.6) { v.engineOn = false; if (v.driver) V.events?.emit('vehicle:drowned', { veh: v }); }
    // sleep when parked and still
    if (!v.driverIn && !v.burning && v.vel.lengthSq() < 0.3 && v.angVel.lengthSq() < 0.02 && (v.contacts > 0 || v.bodyGround) && !(v.kind === 'heli' && v.rotor > 0)) {
      v.sleepT += dt;
      if (v.sleepT > 1.2) { v.sleeping = true; v.vel.set(0, 0, 0); v.angVel.set(0, 0, 0); }
    } else if (v.kind !== 'boat' || v.driverIn || v.vel.lengthSq() > 4) v.sleepT = 0;
    else {
      // an empty boat sleeps only out of sight (near the camera it bobs)
      const far = Math.abs(v.pos.x - this.world.camera.position.x) > 320 || Math.abs(v.pos.z - this.world.camera.position.z) > 320;
      v.sleepT = far ? v.sleepT + dt : 0;
      if (v.sleepT > 1.2 && !v.driverIn) { v.sleeping = true; v.vel.set(0, 0, 0); v.angVel.set(0, 0, 0); }
    }
    // fell out of the world
    if (v.pos.y < -60) { v.dead = true; v.vel.set(0, 0, 0); v.sleeping = true; }
    this.people(v, dt);
    v.syncBox();
    this.emitters(v, dt, up);
  }

  /** Cars against people: knock them flying (ragdoll), or nudge them aside when slow. */
  people(v, dt) {
    const sp2 = v.vel.lengthSq();
    if (sp2 < 4 && v.angVel.lengthSq() < 0.2) return;
    const d = v.def;
    const r = footprint(v);
    const reach = Math.hypot(r.hl, r.hw) + 3;
    const list = V.peds?.near ? V.peds.near(v.pos.x, v.pos.z, reach) : EMPTY;
    const pl = V.player;
    const n = list.length + (pl && !pl.stub && pl.pos && !pl.vehicle ? 1 : 0);
    for (let i = 0; i < n; i++) {
      const p = i < list.length ? list[i] : pl;
      if (!p || !p.pos || p.vehicle || p.dead && p.ragdoll) continue;
      if (i === list.length && list.includes(pl)) continue;
      if (p.pos.y > v.com.y + d.size.h * 0.5 || p.pos.y + 5 < v.pos.y - 0.5) continue;
      const dx = p.pos.x - r.cx, dz = p.pos.z - r.cz;
      const lz = dx * r.ax + dz * r.az, lx = dx * r.bx + dz * r.bz;
      const pr = 1.2;
      const ox = r.hw + pr - Math.abs(lx), oz = r.hl + pr - Math.abs(lz);
      if (ox <= 0 || oz <= 0) continue;
      // the side it's on
      let nx, nz, pen;
      if (ox < oz) { const s = Math.sign(lx) || 1; nx = r.bx * s; nz = r.bz * s; pen = ox; } else { const s = Math.sign(lz) || 1; nx = r.ax * s; nz = r.az * s; pen = oz; }
      // the car's velocity at the person
      const w = v.angVel;
      const rx = p.pos.x - v.com.x, rz = p.pos.z - v.com.z;
      const pvx = v.vel.x + w.y * rz, pvz = v.vel.z - w.y * rx;
      const vn = (pvx - (p.vel?.x || 0)) * nx + (pvz - (p.vel?.z || 0)) * nz;
      if (vn > 8 && !p._vhit || (p._vhit && this.time - p._vhit > 0.6 && vn > 8)) {
        p._vhit = this.time;
        const spd = Math.hypot(pvx, pvz);
        const kv = new THREE.Vector3(pvx * 1.05 + nx * 4, 5 + spd * 0.22, pvz * 1.05 + nz * 4);
        p.knock?.(kv, v);
        const dmg = Math.max(5, (vn - 8) * (p.isPlayer ? 1.1 : 2.2)); // a person dies from a hard hit; the player usually gets up
        p.hit?.(dmg, 'torso', _n.set(nx, 0.3, nz).normalize().clone(), v.driver, { vehicle: v });
        // the car feels it a little
        const k = Math.min(0.12, 90 / d.mass);
        v.vel.x -= nx * vn * k; v.vel.z -= nz * vn * k;
        V.events?.emit('vehicle:crash', { veh: v, other: p, pos: p.pos.clone(), speed: vn, kind: 'ped' });
        if (v.driver?.isPlayer) V.events?.emit('crime', { kind: 'hitPed', pos: p.pos.clone(), by: v.driver, victim: p });
      } else if (!p.ragdoll && !p.dead) {
        // slow: they're pushed aside
        p.pos.x += nx * pen * 0.6; p.pos.z += nz * pen * 0.6;
      }
    }
  }

  /** Smoke from a damaged engine, fire, tyre smoke, spray, rotor wash. */
  emitters(v, dt, up) {
    const d = v.def, fx = this.fx, cam = this.world.camera.position;
    const dx = v.pos.x - cam.x, dz = v.pos.z - cam.z;
    if (dx * dx + dz * dz > 700 * 700) return;
    const r = Math.random;
    // engine: wisps of steam under 650, grey smoke under 400, black smoke and fire when burning or dead (for a while)
    if (v.health < 650 && v.health >= 400 && !v.burning && !v.dead && d.kind !== 'boat' && r() < dt * (3 + (650 - v.health) / 25)) {
      toWorld(v, 0, d.hull.y1 * 0.72, d.kind === 'car' ? d.hull.z1 * 0.62 : 0, _p);
      fx.smoke(_p.x + (r() - 0.5) * 1.5, _p.y, _p.z + (r() - 0.5) * 1.5, v.vel.x * 0.3 + (r() - 0.5) * 2, 4 + r() * 3, v.vel.z * 0.3 + (r() - 0.5) * 2, 1.2 + r() * 0.8, 1.4, 5, 0.95, 0.22);
    }
    if (v.health < 400 || v.burning || (v.dead && v.deadT < 25)) {
      const ez = d.kind === 'car' ? d.hull.z1 * 0.62 : 0;
      toWorld(v, 0, d.hull.y1 * 0.7, ez, _p);
      const bad = v.dead ? 1 : v.burning ? 1 : 1 - v.health / 400;
      if (r() < dt * (8 + bad * 22)) {
        const black = v.burning || v.dead;
        fx.smoke(_p.x + (r() - 0.5) * 2, _p.y, _p.z + (r() - 0.5) * 2, v.vel.x * 0.3 + (r() - 0.5) * 3, 6 + r() * 5, v.vel.z * 0.3 + (r() - 0.5) * 3, 2.2 + r() * 1.5, 2.2, 9 + bad * 6, black ? 0.08 : 0.55 - bad * 0.25, black ? 0.75 : 0.42);
      }
      if ((v.burning || (v.dead && v.deadT < 20)) && r() < dt * 40) {
        fx.flame(_p.x + (r() - 0.5) * d.size.w * 0.5, _p.y - 0.5, _p.z + (r() - 0.5) * 3, v.vel.x * 0.5, 7 + r() * 6, v.vel.z * 0.5, 0.45 + r() * 0.3, 3 + r() * 2.5, 1);
      }
    }
    if (v.dead) return;
    // sports cars backfire on the upshift
    if (v.gear !== v._lastGear) {
      if (v.gear > v._lastGear && v._lastGear > 0 && (d.cls === 'sports' || d.cls === 'super') && v.rpm > 0.7) {
        toWorld(v, d.hull.xc + (d.size.w * 0.18), d.hull.y0 + 0.9, d.hull.z0 + 0.3, _p);
        toWorld(v, 0, 0, -1, _w).sub(v.pos);
        for (let k = 0; k < 4; k++) fx.flame(_p.x, _p.y, _p.z, _w.x * (14 + k * 4) + v.vel.x, 1 + r() * 2, _w.z * (14 + k * 4) + v.vel.z, 0.12 + r() * 0.08, 1.2 + r() * 0.8, 1.3);
        V.events?.emit('vehicle:backfire', { veh: v, pos: _p.clone() });
      }
      v._lastGear = v.gear;
    }
    // tyres: smoke from skids and wheelspin, marks on the road
    if (d.wheels.length && v.contacts) {
      for (let i = 0; i < d.wheels.length; i++) {
        const st = v.wheels[i], w = d.wheels[i];
        if (st.flat && st.contact && Math.abs(v.speed) > 15 && r() < dt * 25) {
          toWorld(v, w.x, 0.2, w.z, _p);
          fx.spark(_p.x, _p.y, _p.z, -v.vel.x * 0.3 + (r() - 0.5) * 10, 6 + r() * 8, -v.vel.z * 0.3 + (r() - 0.5) * 10);
        }
        if (!st.contact || st.skid < 0.3) continue;
        toWorld(v, w.x, 0.3, w.z, _p);
        // (burnouts and handbrake slides smoke properly; a hard stop only puffs a little)
        const big = v.burnout || v.ctl.handbrake || Math.abs(v.angVel.y) > 0.9;
        if (big ? r() < dt * 22 * st.skid : st.skid > 0.55 && r() < dt * 9 * st.skid) fx.smoke(_p.x, _p.y + 0.5, _p.z, v.vel.x * 0.15 + (r() - 0.5) * 3, 1.5 + r() * 2, v.vel.z * 0.15 + (r() - 0.5) * 3, 1.2 + r() * 1.2, 1.8, big ? 9 + st.skid * 5 : 4 + st.skid * 3, big ? 0.9 : 0.75, big ? 0.16 + 0.1 * st.skid : 0.1);
        if (st.skid > 0.45 && V.fx?.skid) V.fx.skid(_p.x, _p.z, v.heading, _p.y, st.skid);
      }
    }
    // boats: spray off the bow and a wake
    if (d.kind === 'boat' && v.inWater > 0.2) {
      const sp = Math.abs(v.speed);
      if (sp > 18) {
        for (const s of [1, -1]) if (r() < dt * sp * 0.25) {
          toWorld(v, s * d.hw * 0.8, d.hull.y0 + 0.6, d.hull.z1 * 0.25, _p);
          toWorld(v, s * 1, 0, 0, _w).sub(v.pos);
          fx.spray(_p.x, _p.y, _p.z, _w.x * (6 + sp * 0.12) + v.vel.x * 0.4, 6 + sp * 0.08, _w.z * (6 + sp * 0.12) + v.vel.z * 0.4, 1.4 + sp * 0.02);
        }
        if (V.fx?.wake && r() < dt * 12) { toWorld(v, 0, 0, d.hull.z0, _p); V.fx.wake(_p, v.heading, sp); }
      }
    }
    // anything hitting the water hard
    if (v.inWater > 0 && !v._splashed && v.vel.y < -12) {
      v._splashed = true;
      if (V.fx?.splash) V.fx.splash(v.com, Math.min(3, -v.vel.y / 15));
      for (let i = 0; i < 30; i++) { const a = r() * 6.283, s = 8 + r() * 18; fx.spray(v.com.x + Math.cos(a) * 3, 0.3, v.com.z + Math.sin(a) * 3, Math.cos(a) * s, 14 + r() * 20, Math.sin(a) * s, 2 + r() * 2); }
    }
    if (v.inWater === 0) v._splashed = false;
    // helicopters: the downwash kicks up dust (or spray) below
    if (d.kind === 'heli' && v.rotor > 0.5 && v.alt < 30) {
      const k = (1 - v.alt / 30) * v.rotor;
      if (r() < dt * 30 * k) {
        const a = r() * 6.283;
        const wx = v.pos.x + Math.cos(a) * 6, wz = v.pos.z + Math.sin(a) * 6;
        const gy = v.pos.y - v.alt;
        if (waterAt(wx, wz) > -1e9) fx.spray(wx, 0.4, wz, Math.cos(a) * 26, 3, Math.sin(a) * 26, 2.2);
        else fx.smoke(wx, gy + 0.6, wz, Math.cos(a) * 28, 1.5, Math.sin(a) * 28, 1.2, 2, 8, 0.75, 0.22 * k);
      }
    }
  }

  drawAll(dt, night, cam) {
    const sb = shadowBank();
    sb.begin();
    const banks = allBanks();
    for (const b of banks.values()) b.begin();
    for (const v of this.list) {
      const dx = v.pos.x - cam.x, dz = v.pos.z - cam.z, d2 = dx * dx + dz * dz;
      const vis = d2 < 1600 * 1600;
      v.group.visible = vis;
      if (!vis) continue;
      v.draw(dt, night, this.flash);
      if (d2 > 900 * 900) continue;
      const d = v.def;
      // wheels
      for (let i = 0; i < d.wheels.length; i++) {
        const w = d.wheels[i], st = v.wheels[i];
        st.rot = (st.rot + (st.omega || 0) * dt) % (Math.PI * 2);
        const wy = st.contact ? w.mountY - st.len : w.y - w.xs * 0.9;
        _q.setFromAxisAngle(_ay, w.steer ? v.steerAngle * w.steer : 0);
        _q2.setFromAxisAngle(_ax, -st.rot);
        _q.multiply(_q2);
        _m.compose(_v.set(w.x, Math.max(w.r * 0.6, wy), w.z), _q, st.flat ? _flat : _one);
        _m2.multiplyMatrices(v.mat, _m);
        v.banks[i].push(_m2, v.dead ? 0.12 : 1);
      }
      // contact shadow
      if (d2 < 500 * 500 && !(d.kind === 'boat' && v.inWater > 0)) {
        const fade = d.kind === 'heli' || d.kind === 'plane' ? 45 : 14;
        const a = clamp(1 - v.alt / fade, 0, 1);
        if (a > 0.02) {
          toWorld(v, d.hull.xc, 0, d.hull.zc, _p);
          const gy = v.pos.y - v.alt;
          const yaw = Math.atan2(v._fw.x, v._fw.z);
          _q.setFromAxisAngle(_ay, yaw);
          const sw = d.kind === 'plane' ? 22 : d.size.w * 1.25, sl = d.kind === 'heli' ? d.size.l * 0.75 : d.size.l * 1.12;
          _m.compose(_v.set(_p.x, gy + 0.09, _p.z), _q, _w.set(sw, 1, sl));
          sb.push(_m, a * (d.kind === 'heli' ? 0.7 : 1));
        }
      }
    }
    sb.end();
    for (const b of banks.values()) b.end();
    // the nearest light bar spills red and blue onto the street (one pre-allocated light)
    let sv = null, sd = 160 * 160;
    for (const v of this.list) if (v.siren && v.group.visible) { const dx = v.pos.x - cam.x, dz = v.pos.z - cam.z, d2 = dx * dx + dz * dz; if (d2 < sd) { sd = d2; sv = v; } }
    if (sv) {
      const s = this._sirenFx || (this._sirenFx = { pos: new THREE.Vector3(), r: 0, b: 0, k: 1 });
      toWorld(sv, 0, sv.def.hull.y1 + 2, sv.def.hull.zc, s.pos);
      s.r = this.flash.r; s.b = this.flash.b; s.k = 0.35 + 0.65 * night;
      this.fx.siren = s;
    } else this.fx.siren = null;
    this.fx.update(dt, this.world.camera, 0.35 + 0.65 * (1 - night));
    // the player's (or the debug car's) headlight beams
    const pv = V.player?.vehicle || this.debug?.veh || null;
    this.fx.headlights(pv, night);
  }

  /** 0 by day .. 1 at night. */
  night() {
    const s = V.sky?.state;
    if (s && typeof s.night === 'number') return s.night;
    const h = V.time?.hour ?? 12;
    return h < 5 || h > 20 ? 1 : h < 7 ? 1 - (h - 5) / 2 : h > 18.5 ? (h - 18.5) / 1.5 : 0;
  }

  // ---- testing ----
  /** A lineup of every type by the start (Flamingo Park), boats at the marina, aircraft at the heliport and the airport. */
  showroom() {
    const cars = Object.keys(TYPES).filter((k) => TYPES[k].kind === 'car' || TYPES[k].kind === 'bike');
    let i = 0;
    for (const id of cars) {
      const row = i < 13 ? 0 : 1, col = row ? i - 13 : i;
      const x = 2330 + col * 18.5, z = row ? 1386 : 1416;
      this.spawn(id, x, z, 0, { parked: true });
      i++;
    }
    const boats = Object.keys(TYPES).filter((k) => TYPES[k].kind === 'boat');
    // in open water just off South Pointe marina (the docks and the moored boats are the props')
    boats.forEach((id, j) => { const p = this.freeWater(1868 - (j % 2) * 38, 2240 + j * 36, 16); if (p) this.spawn(id, p.x, p.z, -Math.PI / 2 + (j % 3 - 1) * 0.25, { parked: true }); });
    this.spawn('policeheli', 1000, -1380, Math.PI / 2, { parked: true });
    this.spawn('newsheli', 1060, -1330, Math.PI / 2, { parked: true });
    // on the threshold of runway 36R, facing north down the runway
    this.spawn('plane', -3670, -1340, Math.PI, { parked: true });
  }

  /** Open water near (x, z): deep enough, nothing solid within r (steps west, out into the bay). */
  freeWater(x, z, r = 16) {
    for (let k = 0; k < 40; k++, x -= 12) {
      if (V.ground.heightAt(x, z) > -3) continue;
      let clear = true;
      V.phys.query(x - r, z - r, x + r, z + r, (b) => { if (b.solid && !b.vehicle && b.y + b.hy > -2) { const [lx, lz] = V.phys.local(b, x, z); if (Math.abs(lx) < b.hx + r && Math.abs(lz) < b.hz + r) { clear = false; return false; } } });
      if (clear && !this.list.some((v) => Math.hypot(v.pos.x - x, v.pos.z - z) < r * 1.6)) return { x, z };
    }
    return null;
  }

  hooks() {
    const vc = window.__vc;
    if (!vc) return;
    const sys = this;
    Object.assign(vc, {
      vehicles: this,
      /** Spawn a vehicle and drive it with the keyboard (WASD, Space, Shift/Ctrl, Q/E), with a chase camera. */
      drive(type = 'sedan', x, z, heading, o = {}) {
        const R = sys._debugRider, dv = sys.debug?.veh;
        if (R && dv && dv.driver === R) dv.leave(R);
        if (type === null) { sys.debug = null; V.freeCam = null; return null; }
        let v = type && typeof type === 'object' ? type : null;
        if (!v) {
          if (x == null) { const c = V.world.camera; x = c.position.x - Math.sin(V.freeCam?.yaw || 0) * 30; z = c.position.z - Math.cos(V.freeCam?.yaw || 0) * 30; }
          v = sys.spawn(type, x, z, heading ?? 0, o);
        }
        if (!v) return null;
        // a stand-in rider, so it's driven (bikes balance, the engine stays on)
        if (!v.driver) v.enter(sys._debugRider || (sys._debugRider = { debug: true, isPlayer: false, name: 'debug' }), 0);
        v.engineOn = true; v.parked = false; v.wake();
        if (v.kind === 'heli' && o.hover) v.rotor = 1;
        sys.debug = { veh: v, ctl: null, cam: null, yaw: v.heading };
        return sys.vstats(v);
      },
      /** Hold controls for the debug vehicle (overrides the keyboard): {throttle, brake, steer, handbrake, up, yaw} or null. */
      ctl(c) { if (sys.debug) sys.debug.ctl = c ? Object.assign({ throttle: 0, brake: 0, steer: 0, handbrake: false, up: 0, yaw: 0 }, c) : null; return !!sys.debug; },
      veh(v) { v = v || sys.debug?.veh || V.player?.vehicle; return v ? sys.vstats(v) : null; },
      vehs() { return sys.list.map((v) => [v.id, v.type, Math.round(v.pos.x), Math.round(v.pos.z), Math.round(v.health), v.sleeping ? 'z' : '']); },
      spawnVeh: (type, x, z, h = 0, o = {}) => { const v = sys.spawn(type, x, z, h, o); return v && v.id; },
      vehById: (id) => sys.list.find((v) => v.id === id),
      vtest: async (name, ...a) => (await import('./tests.js')).runTest(name, ...a),
      vperf: () => ({ ms: +sys.stats.ms.toFixed(3), steps: sys.stats.steps, active: sys.stats.active, total: sys.list.length }),
    });
  }

  vstats(v) {
    const e = _e.setFromQuaternion(v.quat, 'YXZ');
    return {
      id: v.id, type: v.type, name: v.name, kind: v.kind,
      pos: [+v.pos.x.toFixed(1), +v.pos.y.toFixed(2), +v.pos.z.toFixed(1)], heading: +v.heading.toFixed(3),
      pitch: +e.x.toFixed(3), roll: +e.z.toFixed(3),
      speed: +v.speed.toFixed(1), vel: +v.vel.length().toFixed(1), vy: +v.vel.y.toFixed(1), rpm: +v.rpm.toFixed(2), gear: v.gear,
      health: Math.round(v.health), dead: v.dead, burning: v.burning, contacts: v.contacts, skid: +v.skid.toFixed(2), spin: +(v.wheelSpin || 0).toFixed(2),
      yawRate: +v.angVel.y.toFixed(2), alt: +(v.alt || 0).toFixed(1), water: +(v.inWater || 0).toFixed(2), rotor: +(v.rotor || 0).toFixed(2), sleeping: v.sleeping, stall: !!v.stall,
    };
  }

  /** The debug drive: keyboard (or held test controls) into ctl, and a chase camera through V.freeCam. */
  debugControls(dt) {
    const D = this.debug, v = D.veh;
    if (!v || v.removed) { this.debug = null; return; }
    const c = v.ctl;
    if (D.ctl) Object.assign(c, D.ctl);
    else {
      const k = V.input?.keys || new Set();
      const has = (a) => k.has(a);
      c.throttle = (has('w') || has('arrowup') ? 1 : 0) - (has('s') || has('arrowdown') ? 1 : 0);
      c.steer = (has('d') || has('arrowright') ? 1 : 0) - (has('a') || has('arrowleft') ? 1 : 0);
      c.handbrake = has(' ');
      c.brake = 0;
      c.up = (has('shift') ? 1 : 0) - (has('control') ? 1 : 0);
      c.yaw = (has('e') ? 1 : 0) - (has('q') ? 1 : 0);
      if (V.input?.pressed?.has('h')) c.siren = !c.siren;
      c.horn = has('h');
    }
    v.engineOn = !v.dead;
    v.wake();
    // chase camera
    const d = v.def;
    const yawT = Math.atan2(v._fw.x, v._fw.z);
    let dy = yawT - D.yaw; dy = Math.atan2(Math.sin(dy), Math.cos(dy));
    D.yaw += dy * Math.min(1, dt * 3);
    const air = d.kind === 'heli' || d.kind === 'plane';
    const dist = (air ? 2.6 : 1.9) * Math.max(d.size.l, 8) + Math.min(14, Math.abs(v.speed) * 0.08), hgt = (air ? 0.5 : 0.62) * Math.max(d.size.h, 4) + 5;
    _p.set(v.pos.x - Math.sin(D.yaw) * dist, v.pos.y + hgt, v.pos.z - Math.cos(D.yaw) * dist);
    const g = V.ground.heightAt(_p.x, _p.z);
    if (_p.y < g + 2) _p.y = g + 2;
    if (!V.freeCam || !D.cam) { V.freeCam = { pos: _p.clone(), yaw: 0, pitch: 0 }; D.cam = V.freeCam; }
    V.freeCam.pos.lerp(_p, Math.min(1, dt * 6));
    _w.set(v.pos.x, v.pos.y + d.size.h * 0.6, v.pos.z).sub(V.freeCam.pos);
    V.freeCam.yaw = Math.atan2(-_w.x, -_w.z);
    V.freeCam.pitch = Math.atan2(_w.y, Math.hypot(_w.x, _w.z));
  }
}
