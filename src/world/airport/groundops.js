// =============================================================================
// Ground operations.
//   * DepartureOps: everything around our aircraft at the departure gate –
//     belt loaders (fwd / aft cargo doors) with bags riding the belts, baggage
//     train, catering hi-loaders at R1 / R2, hydrant dispenser under the right
//     wing, GPU + cable, cones, ramp crew.  When the doors close the vehicles
//     retract and drive off one by one; a towbarless tug drives in, clamps the
//     nose gear (pose computed from app.flight.state every frame) during
//     pushback, disconnects and drives away; headset operator + wing walker.
//   * ArrivalOps: marshaller with lit wands, VDGS (B738 + closing distance),
//     GSE waiting at the head of stand that drives in after we park.
//   * Static GSE at the other stands, a few crew there, service traffic on the
//     head-of-stand service road.
// =============================================================================
import * as THREE from 'three';
import { AIRCRAFT, DOORS } from '../../core/constants.js';
import { GATE_STAND_Z, TERMINAL_FACADE_Z, buildPath, samplePath } from '../layout.js';
import { Vehicle, Mover, createVehicleKit, staticMeshes, LIVERY } from './vehicles.js';
import { Crowd } from './people.js';
import { GeoBuilder, PRIM, mat, mulberry, clamp01, makeCanvas } from './util.js';
import { SERVICE_ROAD_Z } from './pavement.js';
import { LC, CAT, MODE } from './lights.js';

const H = AIRCRAFT.groundHeight;
const NOSE_GEAR_Z = AIRCRAFT.gear.noseZ;
const BELT_PIVOT = new THREE.Vector3(0, 0.78, 3.3);
const BELT_LEN = 8.2;
const LANE_E = SERVICE_ROAD_Z + 1.75, LANE_W = SERVICE_ROAD_Z - 1.75;

const _m = new THREE.Matrix4(), _q = new THREE.Quaternion(), _v = new THREE.Vector3(), _v2 = new THREE.Vector3();
const _e = new THREE.Euler();

/** Aircraft-local point -> airport-local, for an aircraft parked at gate x heading 0. */
const at = (gx, ax, az) => [gx + ax, GATE_STAND_Z + az];

/** belt loader positioned so the belt's top end reaches (doorX, doorY) – facing west (towards -x) */
function beltPlacement(doorX, doorY) {
  const rise = doorY - BELT_PIVOT.y;
  const pitch = Math.asin(Math.max(-0.5, Math.min(0.5, rise / BELT_LEN)));
  const reach = BELT_LEN * Math.cos(pitch);
  const cx = doorX + 0.1 + reach - BELT_PIVOT.z;   // chassis faces west: local +z = +x world
  return { cx, pitch };
}

class Svc {
  // one vehicle (+ optional trailers / parts) with a service pose and a leave route
  constructor(ops, veh, pose, opts = {}) {
    this.ops = ops; this.veh = veh; this.pose = pose;
    this.trailers = opts.trailers || [];
    this.spacing = opts.spacing || 3.7;
    this.leaveLegs = opts.leave || null;
    this.arriveLegs = opts.arrive || null;
    this.onUpdate = opts.onUpdate || null;
    this.mover = null; this.state = 'service';
    this.hideWhenDone = opts.hideWhenDone !== false;
    this.parkPose = opts.park || null;
    this.place(pose);
    ops.group.add(veh.group);
    for (const t of this.trailers) ops.group.add(t.group);
  }
  place(p) {
    this.veh.setPose(p.x, p.z, p.yaw);
    // trailers in a straight line behind
    this.trailers.forEach((t, i) => {
      const d = (i + 1) * this.spacing;
      t.setPose(p.x + Math.sin(p.yaw) * d, p.z + Math.cos(p.yaw) * d, p.yaw);
    });
  }
  setVisible(v) { this.veh.group.visible = v; for (const t of this.trailers) t.group.visible = v; }
  service() { this.mover = null; this.state = 'service'; this.place(this.pose); this.setVisible(true); }
  gone() {
    this.mover = null; this.state = 'gone';
    if (this.parkPose) { this.place(this.parkPose); this.setVisible(true); } else this.setVisible(false);
  }
  leave(delay = 0) {
    if (this.state !== 'service' || !this.leaveLegs) return;
    this.state = 'leaving';
    this.mover = new Mover(this.leaveLegs, { accel: 0.9, decel: 1.2 });
    this.mover.pause = delay;
  }
  arrive(delay = 0) {
    if (!this.arriveLegs) { this.service(); return; }
    this.state = 'arriving';
    this.setVisible(true);
    this.mover = new Mover(this.arriveLegs, { accel: 0.9, decel: 1.1 });
    this.mover.pause = delay;
    const p = this.mover.pose(0);
    this.place(p);
  }
  update(dt) {
    if (this.mover) {
      if (this.mover.pause > 0) { this.mover.update(dt); return; }
      this.mover.update(dt);
      const p = this.mover.pose(0);
      this.veh.setPose(p.x, p.z, p.yaw);
      this.trailers.forEach((t, i) => { const q = this.mover.pose((i + 1) * this.spacing); t.setPose(q.x, q.z, q.yaw); });
      if (this.mover.done) {
        if (this.state === 'leaving') this.gone();
        else { this.state = 'service'; this.mover = null; }
      }
    }
    if (this.onUpdate) this.onUpdate(dt, this);
  }
}

/** Leave route: back out `back` m (reverse), then forward to the service road and away east/west. */
function leaveRoute(p, back, { dir = 1, roadZ = LANE_E, far = 160 } = {}) {
  const fx = -Math.sin(p.yaw), fz = -Math.cos(p.yaw);        // forward unit vector
  const b = [p.x - fx * back, p.z - fz * back];
  const legs = [];
  if (back > 0) legs.push({ points: [[p.x, p.z], b], reverse: true, vmax: 1.6, radius: 2 });
  const start = back > 0 ? b : [p.x, p.z];
  // forward: first along the current heading a little, then join the road
  const a1 = [start[0] + fx * 4, start[1] + fz * 4];
  const pts = [start, a1, [a1[0] + dir * 14, roadZ], [a1[0] + dir * (far), roadZ]];
  legs.push({ points: pts, vmax: 5.5, radius: 6 });
  return legs;
}

// =========================================================================== departure gate
export class DepartureOps {
  constructor(app, airport, kit, crowd, dynLights) {
    this.app = app;
    this.airport = airport;
    this.kit = kit;
    this.crowd = crowd;
    this.dyn = dynLights;
    this.group = new THREE.Group();
    this.group.name = 'departure-ops';
    const gx = airport.ownGate.x;
    this.gx = gx;
    this.items = {};
    this.timers = [];
    this.state = 'boarding';
    const I = this.items;

    // ---- belt loaders (right side cargo doors)
    const fwd = beltPlacement(gx + 1.3, 1.78), aft = beltPlacement(gx + 1.3, 1.72);
    const mkLoader = (az, pl) => {
      const v = new Vehicle(kit, 'beltLoader');
      const belt = v.addPart(kit, 'belt', BELT_PIVOT.clone());
      belt.rotation.x = pl.pitch;
      const pose = { x: pl.cx, z: GATE_STAND_Z + az, yaw: Math.PI / 2 };
      return new Svc(this, v, pose, { leave: leaveRoute(pose, 7, { dir: 1, roadZ: LANE_E, far: 170 }) });
    };
    I.beltFwd = mkLoader(-9.5, fwd);
    I.beltAft = mkLoader(8.6, aft);
    // ---- baggage train (tractor + 4 carts) parallel to the fuselage
    {
      const v = new Vehicle(kit, 'tractor');
      const carts = [0, 1, 2, 3].map((k) => new Vehicle(kit, 'cart', { seed: k }));
      const pose = { x: gx + 12.5, z: GATE_STAND_Z - 6, yaw: 0 };
      const legs = [{ points: [[pose.x, pose.z], [pose.x, pose.z - 14], [pose.x + 10, LANE_E], [pose.x + 190, LANE_E]], vmax: 4.5, radius: 7 }];
      I.train = new Svc(this, v, pose, { trailers: carts, spacing: 3.75, leave: legs });
    }
    // ---- catering hi-loaders at R2 (aft) and R1 (forward)
    const mkCatering = (door) => {
      const v = new Vehicle(kit, 'catering');
      const box = v.addPart(kit, 'cateringBox', new THREE.Vector3(0, H - 0.08, -0.3));
      const sc = v.addPart(kit, 'scissor', new THREE.Vector3(0, 1.0, -0.3));
      sc.scale.y = H - 1.1;
      const pose = { x: gx + 1.95 + 4.35, z: GATE_STAND_Z + door.z, yaw: Math.PI / 2 };
      const svc = new Svc(this, v, pose, { leave: leaveRoute(pose, 6, { dir: 1, roadZ: LANE_E, far: 180 }) });
      svc.box = box; svc.scissor = sc; svc.lift = 1;
      svc.onUpdate = (dt, s) => {
        // lower the box before driving off
        const want = s.state === 'service' ? 1 : 0;
        s.lift += Math.sign(want - s.lift) * Math.min(Math.abs(want - s.lift), dt / 9);
        s.box.position.y = 1.05 + (H - 0.08 - 1.05) * s.lift;
        s.scissor.scale.y = Math.max(0.05, s.box.position.y - 1.05);
        if (s.mover && s.mover.pause <= 0 && s.lift > 0.02 && s.state === 'leaving') s.mover.pause = 0.1;
      };
      return svc;
    };
    I.cateringAft = mkCatering(DOORS.R2);
    I.cateringFwd = mkCatering(DOORS.R1);
    // ---- hydrant dispenser under the right wing
    {
      const v = new Vehicle(kit, 'dispenser');
      const pose = { x: gx + 10.6, z: GATE_STAND_Z - 1.2, yaw: 0 };
      I.fuel = new Svc(this, v, pose, { leave: [{ points: [[pose.x, pose.z], [pose.x, pose.z - 12], [pose.x + 12, LANE_E], [pose.x + 200, LANE_E]], vmax: 4.5, radius: 7 }] });
    }
    // ---- GPU at the nose (right side) + cable
    {
      const v = new Vehicle(kit, 'gpu');
      const pose = { x: gx + 3.2, z: GATE_STAND_Z + NOSE_GEAR_Z - 2.2, yaw: 0 };
      I.gpu = new Svc(this, v, pose, { park: { x: gx + 15.5, z: TERMINAL_FACADE_Z + 18.5, yaw: Math.PI / 2 } });
      const cg = new GeoBuilder();
      const a = new THREE.Vector3(gx + 3.4, 1.1, pose.z + 0.5), b = new THREE.Vector3(gx + 0.9, 1.75, GATE_STAND_Z - 16.6);
      const n = 10;
      for (let i = 0; i < n; i++) {
        const t0 = i / n, t1 = (i + 1) / n;
        const p0 = a.clone().lerp(b, t0), p1 = a.clone().lerp(b, t1);
        p0.y = Math.min(a.y, b.y) - Math.sin(Math.PI * t0) * 0.9 + (b.y - a.y) * t0 + (a.y < b.y ? 0 : 0); p1.y = Math.min(a.y, b.y) - Math.sin(Math.PI * t1) * 0.9 + (b.y - a.y) * t1;
        p0.y = Math.max(0.05, p0.y); p1.y = Math.max(0.05, p1.y);
        const mid = p0.clone().add(p1).multiplyScalar(0.5), len = p0.distanceTo(p1);
        const dir = p1.clone().sub(p0).normalize();
        const q = new THREE.Quaternion().setFromUnitVectors(new THREE.Vector3(0, 1, 0), dir);
        cg.add(PRIM.cyl8, new THREE.Matrix4().compose(mid, q, new THREE.Vector3(0.06, len, 0.06)), 0x151515);
      }
      this.cable = new THREE.Mesh(cg.build(), kit.mats.dark);
      this.group.add(this.cable);
    }
    // ---- tug (waits at the head of stand, connects before pushback)
    {
      const v = new Vehicle(kit, 'tug');
      this.tugPark = { x: gx + 16, z: TERMINAL_FACADE_Z + 13.5, yaw: Math.PI / 2 };
      I.tug = new Svc(this, v, this.tugPark, {});
      this.tugMode = 'parked';
    }
    // ---- cones
    const coneSpots = [[0, -22.0], [-AIRCRAFT.engine.x, -9.3], [AIRCRAFT.engine.x, -9.3], [-18.4, 4.6], [18.4, 4.6], [0, 21.0]];
    this.cones = new THREE.InstancedMesh(coneGeometry(), new THREE.MeshStandardMaterial({ vertexColors: true, roughness: 0.6 }), coneSpots.length);
    coneSpots.forEach(([ax, az], i) => this.cones.setMatrixAt(i, _m.makeTranslation(...[gx + ax, 0, GATE_STAND_Z + az])));
    this.cones.castShadow = true;
    this.group.add(this.cones);
    // ---- bags on the belts
    this.bags = new THREE.InstancedMesh(new THREE.BoxGeometry(0.55, 0.3, 0.75), new THREE.MeshStandardMaterial({ color: 0x2a2d33, roughness: 0.8 }), 12);
    this.bags.instanceColor = new THREE.InstancedBufferAttribute(new Float32Array(36), 3);
    const bc = [0x262a30, 0x5b1f1f, 0x1f3f5b, 0x3d3d3d, 0x6b5a3a, 0x7a2f4f];
    for (let i = 0; i < 12; i++) this.bags.setColorAt(i, new THREE.Color(bc[i % bc.length]).multiplyScalar(2.2));
    this.bags.castShadow = true;
    this.group.add(this.bags);
    // ---- crew
    const C = crowd;
    this.crew = {
      fwd: C.add({ ...xz(at(gx, 7.0, -10.6)), yaw: Math.PI / 2, mode: 'work' }),
      aft: C.add({ ...xz(at(gx, 7.1, 9.6)), yaw: Math.PI / 2, mode: 'work' }),
      fueller: C.add({ ...xz(at(gx, 9.4, -3.6)), yaw: Math.PI * 0.8, mode: 'idle' }),
      agent: C.add({ ...xz(at(gx, 4.0, -19.5)), yaw: -0.4, mode: 'idle' }),
      loader: C.add({ ...xz(at(gx, 10.5, 3.0)), yaw: 0.6, mode: 'idle' }),
      headset: C.add({ ...xz(at(gx, 2.5, -24)), yaw: Math.PI, mode: 'idle' }),
      wing: C.add({ ...xz(at(gx, 14, -26)), yaw: Math.PI, mode: 'idle' }),
    };
    this.crew.headset.visible = false;
    this.crew.wing.visible = false;
    this.agentLoop = [at(gx, 4.0, -19.5), at(gx, 4.5, 6), at(gx, 0, 22), at(gx, -4.5, 6), at(gx, -4.0, -19.5)].map(([x, z]) => [x, z]);
    this.agentIdx = 0;
    this.t = 0;
    this.tugConnectT = null;
    this._snapState('boarding');
  }

  // ---------------------------------------------------------------- state control
  _snapState(s) {
    const I = this.items;
    this.timers.length = 0;
    this.state = s;
    const present = s === 'boarding';
    for (const k of ['beltFwd', 'beltAft', 'train', 'cateringAft', 'cateringFwd', 'fuel', 'gpu']) {
      if (present) I[k].service(); else I[k].gone();
    }
    if (I.cateringFwd && present && this.app.flight?.state?.phaseTime > 150) I.cateringFwd.gone();
    this.cable.visible = present;
    this.cones.visible = present;
    for (const k of ['fwd', 'aft', 'fueller', 'agent', 'loader']) this.crew[k].visible = present;
    this.crew.headset.visible = s === 'tugReady' || s === 'pushing';
    this.crew.wing.visible = s === 'pushing';
    this.tugMode = (s === 'tugReady' || s === 'pushing') ? 'attached' : 'parked';
    if (this.tugMode === 'parked') I.tug.place(this.tugPark);
    I.tug.mover = null;
    I.tug.setVisible(true);
  }

  /** director events */
  onDoors(closed) {
    if (!closed || this.state !== 'boarding') return;
    this.state = 'closing';
    const I = this.items;
    I.fuel.leave(0);
    I.cateringFwd.leave(1); I.cateringAft.leave(3);
    I.beltFwd.leave(8); I.beltAft.leave(13);
    I.train.leave(22);
    this.crew.fueller.visible = false;
    this.crowd.walk(this.crew.fwd, [at(this.gx, 9, -14), at(this.gx, 14, -27)], 1.35, 'idle');
    this.crowd.walk(this.crew.aft, [at(this.gx, 12, 6), at(this.gx, 17, -24)], 1.35, 'idle');
    this.timers.push({ t: 20, fn: () => this.startTug() });
    this.timers.push({ t: 32, fn: () => { this.cones.visible = false; } });
  }
  onBridge(connected) {
    if (connected) return;
    // GPU disconnected when the bridge retracts (if not yet)
    this.timers.push({ t: 8, fn: () => { this.cable.visible = false; this.items.gpu.gone(); } });
    if (this.state === 'boarding') this.onDoors(true);
  }
  startTug() {
    const I = this.items, gx = this.gx;
    if (this.tugMode !== 'parked') return;
    this.cable.visible = false; I.gpu.gone();
    const nzw = GATE_STAND_Z + NOSE_GEAR_Z;
    const target = { x: gx, z: nzw - 2.3 };
    const p0 = this.tugPark;
    I.tug.mover = new Mover([
      { points: [[p0.x, p0.z], [p0.x - 8, p0.z], [gx + 2, p0.z + 1], [gx, target.z - 4.5], [target.x, target.z]], vmax: 2.6, radius: 4.5 },
    ], { accel: 0.6, decel: 0.5 });
    I.tug.state = 'arriving';
    this.tugMode = 'driving';
    this.crowd.walk(this.crew.headset, [at(gx, -2.6, -19.5)], 1.2, 'headset');
    this.crew.headset.visible = true;
    this.crew.headset.x = gx + 6; this.crew.headset.z = TERMINAL_FACADE_Z + 12;
  }
  onPushback(st) {
    const I = this.items;
    if (st === 'start') {
      if (this.tugMode !== 'attached') { this._snapState('pushing'); }
      this.state = 'pushing';
      this.tugMode = 'attached';
      this.crew.wing.visible = true;
      this.crew.wing.mode = 'wingwalk';
      this.crew.headset.visible = true;
      this.crew.headset.mode = 'headset';
      I.tug.mover = null;
    } else if (st === 'end') {
      this.state = 'released';
      this.timers.push({ t: 14, fn: () => this.tugLeave() });
      this.timers.push({ t: 6, fn: () => { this.crew.wing.mode = 'idle'; } });
    }
  }
  tugLeave() {
    const I = this.items;
    if (this.tugMode !== 'attached') return;
    this.tugMode = 'leaving';
    const p = { x: I.tug.veh.x, z: I.tug.veh.z, yaw: I.tug.veh.yaw };
    const fx = -Math.sin(p.yaw), fz = -Math.cos(p.yaw);           // forward (towards the aircraft)
    const lx = -Math.cos(p.yaw), lz = Math.sin(p.yaw);            // left
    const b = [p.x - fx * 6, p.z - fz * 6];
    const c = [b[0] + lx * 14, b[1] + lz * 14];
    I.tug.mover = new Mover([
      { points: [[p.x, p.z], b], reverse: true, vmax: 1.5, radius: 2 },
      { points: [b, [b[0] + fx * 3, b[1] + fz * 3], c, [this.tugPark.x - 12, this.tugPark.z + 4], [this.tugPark.x, this.tugPark.z]], vmax: 4.5, radius: 6 },
    ], { accel: 0.7, decel: 0.8 });
    I.tug.state = 'arriving';
    const hs = this.crew.headset;
    this.crowd.walk(hs, [[b[0] + lx * 4, b[1] + lz * 4], at(this.gx, 6, -26)], 1.35, 'idle');
    this.crowd.walk(this.crew.wing, [at(this.gx, 10, -25)], 1.35, 'idle');
  }
  onPhase(phase, instant) {
    if (!instant) {
      if (phase === 'taxi_out' && this.tugMode === 'attached') this.tugLeave();
      return;
    }
    if (phase === 'gate') this._snapState('boarding');
    else if (phase === 'pushback') this._snapState('tugReady');
    else this._snapState('done');
  }

  // ---------------------------------------------------------------- per frame
  update(dt) {
    const st = this.app.flight?.state;
    this.t += dt;
    for (let i = this.timers.length - 1; i >= 0; i--) {
      const tm = this.timers[i];
      tm.t -= dt;
      if (tm.t <= 0) { this.timers.splice(i, 1); tm.fn(); }
    }
    for (const k in this.items) this.items[k].update(dt);
    const I = this.items;
    // tug: driving in -> attached when arrived
    if (this.tugMode === 'driving' && !I.tug.mover) this.tugMode = 'attached';
    if (this.tugMode === 'leaving' && !I.tug.mover) this.tugMode = 'parked';
    if (this.tugMode === 'attached' && st) this.attachTug(st);
    // ramp agent walk-around loop while boarding
    const ag = this.crew.agent;
    if (this.state === 'boarding' && ag.visible && !ag.walker) {
      ag.idleT = (ag.idleT || 0) + dt;
      if (ag.idleT > 7) {
        ag.idleT = 0;
        this.agentIdx = (this.agentIdx + 1) % this.agentLoop.length;
        this.crowd.walk(ag, [this.agentLoop[this.agentIdx]], 1.2, 'idle');
      }
    }
    // pushback crew follow the aircraft
    if (st && (this.state === 'pushing' || this.state === 'released') && this.tugMode === 'attached') {
      const ws = this.crew.wing;
      if (!ws.walker) { acToAirport(st, this.airport, -19.0, 2.5, _v); ws.x = _v.x; ws.z = _v.z; ws.yaw = yawFromState(st, this.airport) + (st.groundSpeed > 0.2 ? Math.PI : 0); ws.mode = st.groundSpeed > 0.2 ? 'walk' : 'wingwalk'; }
      const hs = this.crew.headset;
      if (!hs.walker) { acToAirport(st, this.airport, -2.4, -17.8, _v); hs.x = _v.x; hs.z = _v.z; hs.yaw = yawFromState(st, this.airport) + Math.PI / 2; hs.mode = st.groundSpeed > 0.2 ? 'walk' : 'headset'; }
    }
    // bags riding up the belts
    let nb = 0;
    if (this.state === 'boarding') {
      for (const key of ['beltFwd', 'beltAft']) {
        const s = I[key];
        if (s.state !== 'service') continue;
        const belt = s.veh.group.children[s.veh.group.children.length - 1];
        for (let k = 0; k < 3; k++) {
          const f = ((this.t * 0.11 + k / 3 + (key === 'beltAft' ? 0.17 : 0)) % 1);
          _v.set(0, 0.32, -f * BELT_LEN).applyEuler(_e.set(belt.rotation.x, 0, 0)).add(belt.position);
          s.veh.group.updateMatrix();
          _v.applyMatrix4(s.veh.group.matrix);
          _q.setFromEuler(_e.set(belt.rotation.x, s.veh.yaw, 0, 'YXZ'));
          this.bags.setMatrixAt(nb++, _m.compose(_v, _q, _v2.set(1, 1, 1)));
        }
      }
    }
    this.bags.count = nb;
    this.bags.instanceMatrix.needsUpdate = true;
    // beacons on moving vehicles
    this.dyn.clear();
    for (const k in I) {
      const s = I[k];
      if (!s.veh.group.visible) continue;
      if (s.mover || k === 'tug') this.dyn.beacon(s.veh, k === 'tug' ? [-0.95, 2.6, 3.2] : [0, 2.5, 0]);
    }
  }

  attachTug(st) {
    // nose wheel position in airport-local frame; tug faces the aircraft, cradle on the nose wheel
    acToAirport(st, this.airport, 0, NOSE_GEAR_Z, _v);
    const yawAc = yawFromState(st, this.airport);
    const steer = st.nosewheelSteer || 0;
    const yaw = yawAc + Math.PI + steer;
    const fx = -Math.sin(yaw), fz = -Math.cos(yaw);
    this.items.tug.veh.setPose(_v.x - fx * 2.3, _v.z - fz * 2.3, yaw);
  }
}

function xz([x, z]) { return { x, z }; }

/** Aircraft-local (ax, az) on the ground -> airport-local xz using the flight state pose. */
function acToAirport(st, airport, ax, az, out) {
  out.set(ax, -H, az).applyQuaternion(st.quaternion).add(st.position).sub(airport.group.position);
  return out;
}
function yawFromState(st) {
  // aircraft forward (-z local) in world -> yaw of a -z-forward object
  _v2.set(0, 0, -1).applyQuaternion(st.quaternion);
  return Math.atan2(-_v2.x, -_v2.z);
}

function coneGeometry() {
  const b = new GeoBuilder();
  b.add(new THREE.CylinderGeometry(0.04, 0.17, 0.7, 10), mat(0, 0.37, 0), 0xff4a0a);
  b.add(new THREE.CylinderGeometry(0.105, 0.125, 0.12, 10), mat(0, 0.36, 0), 0xe8e8e8);
  b.add(PRIM.box, mat(0, 0.02, 0, 0, 0, 0, 0.42, 0.04, 0.42), 0xff4a0a);
  return b.build();
}

// =========================================================================== arrival gate
export class ArrivalOps {
  constructor(app, airport, kit, crowd, dynLights, lightsList) {
    this.app = app; this.airport = airport; this.kit = kit; this.crowd = crowd; this.dyn = dynLights;
    this.group = new THREE.Group();
    this.group.name = 'arrival-ops';
    const gx = airport.ownGate.x;
    this.gx = gx;
    this.stopZ = GATE_STAND_Z + NOSE_GEAR_Z;
    // marshaller in front of the stop position
    this.marshaller = crowd.add({ x: gx + 0.3, z: this.stopZ - 9.5, yaw: Math.PI, mode: 'idle', vest: 0xff7c14 });
    this.marshaller.wands = false;
    this.marshalState = 'wait';
    // VDGS on the facade, centred on the lead-in line
    this.vdgs = new VDGS(gx, kit);
    this.group.add(this.vdgs.group);
    // GSE waiting at the head of stand (drive in after we park)
    const I = this.items = {};
    const fwd = beltPlacement(gx + 1.3, 1.78);
    {
      const v = new Vehicle(kit, 'beltLoader');
      const belt = v.addPart(kit, 'belt', BELT_PIVOT.clone());
      belt.rotation.x = fwd.pitch;
      const pose = { x: fwd.cx, z: GATE_STAND_Z - 9.5, yaw: Math.PI / 2 };
      const start = { x: gx + 32, z: LANE_W };
      I.belt = new Svc(this, v, pose, {
        arrive: [{ points: [[start.x, start.z], [gx + 18, LANE_W], [pose.x + 9, pose.z - 4], [pose.x + 4, pose.z], [pose.x, pose.z]], vmax: 4, radius: 5 }],
      });
      I.belt.waitPose = { x: start.x, z: start.z, yaw: Math.PI / 2 };
    }
    {
      const v = new Vehicle(kit, 'tractor');
      const carts = [0, 1, 2].map((k) => new Vehicle(kit, 'cart', { seed: k + 4 }));
      const pose = { x: gx + 12.5, z: GATE_STAND_Z - 4, yaw: Math.PI };
      const start = { x: gx + 45, z: LANE_W };
      I.train = new Svc(this, v, pose, {
        trailers: carts, spacing: 3.75,
        arrive: [{ points: [[start.x, start.z], [gx + 22, LANE_W], [pose.x, pose.z - 16], [pose.x, pose.z]], vmax: 3.5, radius: 7 }],
      });
      I.train.waitPose = { x: start.x, z: start.z, yaw: Math.PI / 2 };
    }
    {
      const v = new Vehicle(kit, 'gpu');
      const pose = { x: gx + 3.2, z: GATE_STAND_Z + NOSE_GEAR_Z - 2.2, yaw: 0 };
      I.gpu = new Svc(this, v, pose, {});
      I.gpu.waitPose = { x: gx + 15.5, z: TERMINAL_FACADE_Z + 18.5, yaw: Math.PI / 2 };
    }
    this.crew = {
      a: crowd.add({ x: gx + 14, z: TERMINAL_FACADE_Z + 16, yaw: Math.PI, mode: 'idle' }),
      b: crowd.add({ x: gx + 18, z: TERMINAL_FACADE_Z + 15, yaw: Math.PI * 0.9, mode: 'idle' }),
    };
    this.cones = new THREE.InstancedMesh(coneGeometry(), new THREE.MeshStandardMaterial({ vertexColors: true, roughness: 0.6 }), 4);
    [[0, -22.0], [-18.4, 4.6], [18.4, 4.6], [0, 21.0]].forEach(([ax, az], i) => this.cones.setMatrixAt(i, _m.makeTranslation(gx + ax, 0, GATE_STAND_Z + az)));
    this.cones.castShadow = true;
    this.group.add(this.cones);
    this.reset();
    void lightsList;
  }
  reset() {
    for (const s of Object.values(this.items)) { s.mover = null; s.state = 'wait'; s.place(s.waitPose); s.setVisible(true); }
    this.cones.visible = false;
    this.parkedT = null;
    this.marshalState = 'wait';
    Object.assign(this.marshaller, { x: this.gx + 0.3, z: this.stopZ - 9.5, yaw: Math.PI, mode: 'idle', walker: null, wands: false });
    this.crew.a.x = this.gx + 14; this.crew.a.z = TERMINAL_FACADE_Z + 16; this.crew.a.walker = null; this.crew.a.mode = 'idle';
  }
  serviceNow() {
    for (const s of Object.values(this.items)) s.service();
    this.cones.visible = true;
    this.marshalState = 'done';
    Object.assign(this.marshaller, { x: this.gx + 9, z: TERMINAL_FACADE_Z + 15, mode: 'idle', wands: false, walker: null });
  }
  onPhase(phase, instant) {
    if (!instant) return;
    if (phase === 'arrived') this.serviceNow();
    else this.reset();
  }
  update(dt) {
    const st = this.app.flight?.state;
    for (const s of Object.values(this.items)) s.update(dt);
    if (!st) return;
    // our nose wheel relative to the stop line
    acToAirport(st, this.airport, 0, NOSE_GEAR_Z, _v);
    const dist = _v.z - this.stopZ, lat = _v.x - this.gx;
    const near = st.region === 'arrival' && (st.phase === 'taxi_in' || st.phase === 'arrived') && Math.abs(lat) < 40 && dist > -2 && dist < 260;
    const stopped = st.groundSpeed < 0.05;
    const m = this.marshaller;
    if (this.marshalState === 'wait' && near && st.phase === 'taxi_in') { this.marshalState = 'guide'; m.mode = 'marshal'; m.wands = true; }
    if (this.marshalState === 'guide' && stopped && dist < 1.5) {
      this.marshalState = 'stop'; m.mode = 'stop'; this.stopT = 0;
    }
    if (this.marshalState === 'stop') {
      this.stopT += dt;
      if (this.stopT > 5) {
        this.marshalState = 'done'; m.wands = false;
        this.crowd.walk(m, [[this.gx + 4, this.stopZ - 11], [this.gx + 10, TERMINAL_FACADE_Z + 14]], 1.3, 'idle');
        this.parkedT = 0;
        this.crowd.walk(this.crew.a, [[this.gx + 1.5, this.stopZ - 4]], 1.3, 'work');
      }
    }
    if (this.parkedT !== null) {
      this.parkedT += dt;
      const I = this.items;
      if (this.parkedT > 12 && I.gpu.state === 'wait') { I.gpu.service(); }
      if (this.parkedT > 20 && !this.cones.visible) this.cones.visible = true;
      if (this.parkedT > 30 && I.belt.state === 'wait') I.belt.arrive(0);
      if (this.parkedT > 42 && I.train.state === 'wait') I.train.arrive(0);
    }
    this.vdgs.update(near, dist, lat, this.marshalState);
    // wand light sprites
    this.dyn.clear();
    const tips = this.crowd.wandTips;
    for (let i = 0; i < tips.length; i += 3) this.dyn.add(tips[i], tips[i + 1], tips[i + 2], [1.0, 0.35, 0.05], 0.28);
    for (const s of Object.values(this.items)) if (s.mover) this.dyn.beacon(s.veh, [0, 2.4, 0]);
  }
}

/** Visual docking guidance system: housing on the facade with a canvas display. */
class VDGS {
  constructor(gx, kit) {
    this.group = new THREE.Group();
    const y = 7.2, z = TERMINAL_FACADE_Z + 0.9;
    const b = new GeoBuilder();
    b.add(PRIM.box, mat(gx, y, z - 0.35, 0, 0, 0, 1.6, 2.5, 0.7), 0x2b2e31);
    b.add(PRIM.box, mat(gx, y + 1.3, z, 0, 0, 0, 1.75, 0.12, 0.9), 0x3b3e41);
    b.add(PRIM.box, mat(gx, y - 1.6, z - 0.6, 0, 0, 0, 0.25, 0.8, 0.25), 0x5b5e61);
    const housing = new THREE.Mesh(b.build(), kit.mats.paint);
    housing.castShadow = true;
    [this.canvas, this.ctx] = makeCanvas(160, 256);
    this.tex = new THREE.CanvasTexture(this.canvas);
    this.tex.colorSpace = THREE.SRGBColorSpace;
    const screen = new THREE.Mesh(new THREE.PlaneGeometry(1.3, 2.08), new THREE.MeshStandardMaterial({ color: 0x000000, emissive: 0xffffff, emissiveMap: this.tex, emissiveIntensity: 2.2, roughness: 0.25 }));
    screen.position.set(gx, y, z + 0.005);
    this.group.add(housing, screen);
    this.last = '';
    this.draw('idle', 0, 0);
  }
  draw(mode, dist, lat) {
    const c = this.ctx, W = 160, Hh = 256;
    c.fillStyle = '#000'; c.fillRect(0, 0, W, Hh);
    c.textAlign = 'center'; c.textBaseline = 'middle';
    const amber = '#ffb21a', red = '#ff2a1a', green = '#3aff6a';
    c.font = 'bold 34px Arial, sans-serif';
    if (mode === 'stop') {
      c.fillStyle = red; c.font = 'bold 44px Arial, sans-serif'; c.fillText('STOP', W / 2, 70);
      c.fillStyle = red; c.fillRect(20, 120, 120, 16); c.fillRect(20, 150, 120, 16);
      return;
    }
    if (mode === 'ok') {
      c.fillStyle = green; c.fillText('B738', W / 2, 40);
      c.font = 'bold 44px Arial, sans-serif'; c.fillText('OK', W / 2, 120);
      c.font = 'bold 22px Arial, sans-serif'; c.fillText('CHOCKS ON', W / 2, 190);
      return;
    }
    c.fillStyle = amber; c.fillText('B738', W / 2, 32);
    if (mode === 'idle') { c.font = 'bold 30px Arial, sans-serif'; c.fillText('C10', W / 2, 110); c.font = 'bold 20px Arial, sans-serif'; c.fillText('WAIT', W / 2, 170); return; }
    // azimuth guidance
    const arrow = Math.abs(lat) > 0.5 ? (lat > 0 ? '<' : '>') : '';
    c.fillStyle = '#ffe14a';
    c.fillRect(W / 2 - 4, 60, 8, 120);
    if (arrow) {
      c.fillStyle = red;
      const ax = arrow === '<' ? 30 : W - 30;
      c.beginPath();
      if (arrow === '<') { c.moveTo(ax - 18, 120); c.lineTo(ax + 14, 100); c.lineTo(ax + 14, 140); } else { c.moveTo(ax + 18, 120); c.lineTo(ax - 14, 100); c.lineTo(ax - 14, 140); }
      c.fill();
    }
    // closing-rate bar + distance
    if (dist < 20) {
      const f = Math.max(0, Math.min(1, dist / 20));
      c.fillStyle = amber;
      c.fillRect(W / 2 - 34, 60 + (1 - f) * 120, 24, f * 120);
      c.fillRect(W / 2 + 10, 60 + (1 - f) * 120, 24, f * 120);
    }
    c.fillStyle = amber; c.font = 'bold 34px Arial, sans-serif';
    c.fillText(dist < 20 ? `${dist.toFixed(dist < 10 ? 1 : 0)} m` : '↑', W / 2, 220);
  }
  update(near, dist, lat, mstate) {
    let mode = 'idle';
    if (mstate === 'stop') mode = 'stop';
    else if (mstate === 'done') mode = 'ok';
    else if (near) mode = 'track';
    const key = mode === 'track' ? `t${Math.max(0, dist).toFixed(dist < 10 ? 1 : 0)}|${Math.abs(lat) > 0.5 ? Math.sign(lat) : 0}` : mode;
    if (key !== this.last) { this.last = key; this.draw(mode, Math.max(0, dist), lat); this.tex.needsUpdate = true; }
  }
}

// =========================================================================== other stands + service traffic
export function buildStaticGSE(def, kit, parked, ownGateId, crowd) {
  const B = { paint: new GeoBuilder(), dark: new GeoBuilder(), metal: new GeoBuilder(), glass: new GeoBuilder(), lamp: new GeoBuilder() };
  const rnd = mulberry(def.seed + 77);
  const occ = new Set(parked.map((p) => p.gate.id));
  for (const g of def.gates) {
    if (g.id === ownGateId) continue;
    const gx = g.x;
    // head-of-stand GSE box: a few parked units
    kit.addStatic(B, rnd() < 0.5 ? 'gpu' : 'tractor', mat(gx + 10 + rnd() * 3, 0, TERMINAL_FACADE_Z + 17.5, 0, Math.PI / 2, 0));
    if (occ.has(g.id)) {
      // turnaround in progress: belt loader at the fwd hold, baggage carts, GPU at the nose, cones
      const fwd = beltPlacement(gx + 1.3, 1.78);
      const m = mat(fwd.cx, 0, GATE_STAND_Z - 9.5, 0, Math.PI / 2, 0);
      kit.addStatic(B, 'beltLoader', m);
      const belt = new THREE.Matrix4().multiplyMatrices(m, new THREE.Matrix4().compose(BELT_PIVOT, new THREE.Quaternion().setFromEuler(new THREE.Euler(fwd.pitch, 0, 0)), new THREE.Vector3(1, 1, 1)));
      kit.addStatic(B, 'belt', belt);
      for (let k = 0; k < 2 + Math.floor(rnd() * 2); k++) kit.addStatic(B, 'cart', mat(gx + 11.5, 0, GATE_STAND_Z - 8 + k * 3.8, 0, 0, 0), k + Math.floor(rnd() * 4));
      kit.addStatic(B, 'tractor', mat(gx + 11.5, 0, GATE_STAND_Z - 12, 0, 0, 0));
      if (rnd() < 0.6) kit.addStatic(B, 'gpu', mat(gx + 3.2, 0, GATE_STAND_Z + NOSE_GEAR_Z - 2.2, 0, 0, 0));
      if (rnd() < 0.4) {
        const pl = beltPlacement(gx + 1.3, 1.72);
        const m2 = mat(pl.cx, 0, GATE_STAND_Z + 8.6, 0, Math.PI / 2, 0);
        kit.addStatic(B, 'beltLoader', m2);
        kit.addStatic(B, 'belt', new THREE.Matrix4().multiplyMatrices(m2, new THREE.Matrix4().compose(BELT_PIVOT, new THREE.Quaternion().setFromEuler(new THREE.Euler(pl.pitch, 0, 0)), new THREE.Vector3(1, 1, 1))));
      }
      if (crowd && rnd() < 0.8) crowd.add({ x: gx + 7.2, z: GATE_STAND_Z - 10.6, yaw: Math.PI / 2, mode: 'work' });
      if (crowd && rnd() < 0.5) crowd.add({ x: gx + 3 + rnd() * 6, z: GATE_STAND_Z - 18 + rnd() * 8, yaw: rnd() * 6, mode: 'idle' });
    } else {
      kit.addStatic(B, rnd() < 0.5 ? 'stairs' : 'tug', mat(gx - 2 + rnd() * 4, 0, GATE_STAND_Z + 6 + rnd() * 6, 0, Math.PI / 2 * (rnd() < 0.5 ? 1 : -1), 0));
      for (let k = 0; k < 3; k++) kit.addStatic(B, 'cart', mat(gx + 14, 0, GATE_STAND_Z - 22 + k * 3.8, 0, 0, 0), k);
    }
  }
  const group = new THREE.Group();
  group.name = 'gse-static';
  staticMeshes(B, kit, group);
  return group;
}

/** Vehicles circulating on the head-of-stand service road (closed loop). */
export class ServiceTraffic {
  constructor(def, kit, n = 4) {
    this.group = new THREE.Group();
    this.group.name = 'service-traffic';
    const ap = def.apron;
    const x0 = ap.xMin + 30, x1 = ap.xMax - 30;
    const pts = [[x0, LANE_E], [x1, LANE_E], [x1 + 4, SERVICE_ROAD_Z], [x1, LANE_W], [x0, LANE_W], [x0 - 4, SERVICE_ROAD_Z], [x0, LANE_E]];
    this.path = buildPath(pts, 3.2, { step: 0.5 });
    const types = ['van', 'followme', 'tractor', 'van', 'catering'];
    this.cars = [];
    for (let i = 0; i < n; i++) {
      const type = types[i % types.length];
      const v = new Vehicle(kit, type);
      const trailers = type === 'tractor' ? [0, 1, 2].map((k) => new Vehicle(kit, 'cart', { seed: k + i })) : [];
      if (type === 'catering') { v.addPart(kit, 'cateringBox', new THREE.Vector3(0, 1.05, -0.3)); }
      this.group.add(v.group); for (const t of trailers) this.group.add(t.group);
      this.cars.push({ v, trailers, s: (i / n) * this.path.length, speed: 6 + i * 0.7, pause: 0 });
    }
  }
  update(dt, avoid) {
    const L = this.path.length;
    for (const c of this.cars) {
      // simple yield: slow down near the avoid point (our aircraft / tug at the stand head)
      let v = c.speed;
      if (avoid) {
        const p = samplePath(this.path, c.s);
        const d = Math.hypot(p.x - avoid.x, p.z - avoid.z);
        if (d < 30) v *= Math.max(0.3, d / 30);
      }
      c.s = (c.s + v * dt) % L;
      const p = samplePath(this.path, c.s);
      c.v.setPose(p.x, p.z, -p.heading * Math.PI / 180);
      c.trailers.forEach((t, i) => {
        const q = samplePath(this.path, (c.s - (i + 1) * 3.75 + L) % L);
        t.setPose(q.x, q.z, -q.heading * Math.PI / 180);
      });
    }
  }
}

/** Dynamic light sprites (vehicle beacons, wand tips): a small LightList rebuilt each frame. */
export class DynLights {
  constructor(lightMeshFactory, max = 48) {
    this.max = max;
    this.mesh = lightMeshFactory(max);
    this.n = 0;
    this.t = 0;
  }
  clear() { this.n = 0; }
  add(x, y, z, col, size = 0.25) {
    if (this.n >= this.max) return;
    const g = this.mesh.geometry, i = this.n++;
    g.attributes.iPos.setXYZ(i, x, y, z);
    g.attributes.iColA.setXYZ(i, col[0], col[1], col[2]);
    g.attributes.iPar.setX(i, size);
  }
  beacon(veh, off) {
    this.t = performance.now() * 0.001;
    const ph = (veh.x * 0.37 + veh.z * 0.11) % 1;
    const f = Math.pow(Math.max(0, Math.sin((this.t * 1.4 + ph) * Math.PI * 2)), 6);
    if (f < 0.02) return;
    _v.set(off[0], off[1], off[2]).applyAxisAngle(_up, veh.yaw).add(veh.group.position);
    this.add(_v.x, _v.y, _v.z, [1.0 * f, 0.55 * f, 0.08 * f], 0.22);
  }
  commit() {
    const g = this.mesh.geometry;
    g.instanceCount = this.n;
    for (const k of ['iPos', 'iColA', 'iPar']) g.attributes[k].needsUpdate = true;
  }
}
const _up = new THREE.Vector3(0, 1, 0);

export { createVehicleKit, LIVERY, LC, CAT, MODE, samplePath };
