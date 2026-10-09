// Vehicle physics for Vice City: one rigid body per vehicle (position of the
// centre of mass, orientation, linear and angular velocity, a box inertia),
// stepped at a fixed small substep, with
//   cars/bikes  suspension rays per wheel (ground, kerbs, decks), tyres with a
//               slip-angle grip curve and a friction circle (drifts, burnouts,
//               handbrake turns), a constant-power engine with gears, brakes,
//               downforce and drag; bikes keep upright and lean into turns
//   boats       buoyancy points on the waves, keel drag, prop thrust, rudder, planing
//   helicopters arcade hover: collective, attitude hold, yaw, rotor spool
//   planes      thrust, lift with stall, control surfaces, weathervane stability
// and contacts: the hull's corners against the ground, its footprint against
// static boxes (SAT, impulse with friction and spin) and other vehicles.
//
// Everything here works on a Vehicle (vehicles.js) and module temporaries:
// no allocation per step.
import * as THREE from 'three';
import { V, K } from '../state.js';

const G = K.G;
const CELL = 32;
const gkey = (i, j) => (i + 512) * 2048 + (j + 512);

// temporaries
const F = new THREE.Vector3(), T = new THREE.Vector3();
const fw = new THREE.Vector3(), up = new THREE.Vector3(), lf = new THREE.Vector3();
const P = new THREE.Vector3(), R = new THREE.Vector3(), VP = new THREE.Vector3(), N = new THREE.Vector3(), TT = new THREE.Vector3();
const A = new THREE.Vector3(), B = new THREE.Vector3(), C = new THREE.Vector3(), D = new THREE.Vector3();
const WF = new THREE.Vector3(), WS = new THREE.Vector3();
const qi = new THREE.Quaternion(), dq = new THREE.Quaternion();

export const probe = { box: null, deck: false, kind: 0 };

/**
 * The highest surface at (x, z) not above y + step: the land, a box top or a
 * road deck (like VPhys.groundAt, but a point query with no closure). `self`
 * (a box) is ignored.
 */
export function groundProbe(x, y, z, step, self = null) {
  const ph = V.phys;
  let g = V.ground.heightAt(x, z);
  probe.box = null; probe.deck = false;
  const list = ph.grid.get(gkey(Math.floor(x / CELL), Math.floor(z / CELL)));
  if (list) {
    const lim = y + step;
    for (let q = 0; q < list.length; q++) {
      const b = list[q];
      if (!b.solid || b.noStand || b === self) continue;
      const top = b.y + b.hy;
      if (top > lim || top <= g) continue;
      const dx = x - b.x, dz = z - b.z;
      if (Math.abs(dx * b.c - dz * b.s) <= b.hx && Math.abs(dx * b.s + dz * b.c) <= b.hz) { g = top; probe.box = b; }
    }
  }
  const d = ph.deckAt(x, z, y + step);
  if (d > g) { g = d; probe.box = null; probe.deck = true; }
  return g;
}

let waterT = 0;
export function setWaterTime(t) { waterT = t; }
/** The sea surface over (x, z), or -Infinity over land. */
export function waterAt(x, z) {
  if (V.ground.heightAt(x, z) > -0.05) return -Infinity;
  const w = V.water;
  return w && w.waveAt ? w.waveAt(x, z, w.time ?? w.t ?? waterT) : 0;
}

// ---- rigid body helpers ---------------------------------------------------------------------------------------------------
/** world = R(q) * diag(invI) * R(q)^T * v, in place. */
function invInertia(v, out) {
  qi.copy(v.quat).invert();
  out.applyQuaternion(qi);
  out.x *= v.def.invI.x; out.y *= v.def.invI.y; out.z *= v.def.invI.z;
  return out.applyQuaternion(v.quat);
}
/** Velocity of a world point on the body. */
function pointVel(v, px, py, pz, out) {
  const rx = px - v.com.x, ry = py - v.com.y, rz = pz - v.com.z, w = v.angVel;
  return out.set(v.vel.x + w.y * rz - w.z * ry, v.vel.y + w.z * rx - w.x * rz, v.vel.z + w.x * ry - w.y * rx);
}
function addForce(v, fx, fy, fz, px, py, pz) {
  F.x += fx; F.y += fy; F.z += fz;
  const rx = px - v.com.x, ry = py - v.com.y, rz = pz - v.com.z;
  T.x += ry * fz - rz * fy; T.y += rz * fx - rx * fz; T.z += rx * fy - ry * fx;
}
/** Apply an impulse j at a world point. */
export function impulse(v, jx, jy, jz, px, py, pz) {
  const im = v.def.invM;
  v.vel.x += jx * im; v.vel.y += jy * im; v.vel.z += jz * im;
  const rx = px - v.com.x, ry = py - v.com.y, rz = pz - v.com.z;
  D.set(ry * jz - rz * jy, rz * jx - rx * jz, rx * jy - ry * jx);
  invInertia(v, D);
  v.angVel.add(D);
}
/** Effective inverse mass of the body at point p along n: 1/m + n . ((I^-1 (r x n)) x r). */
function invMassAt(v, px, py, pz, nx, ny, nz) {
  const rx = px - v.com.x, ry = py - v.com.y, rz = pz - v.com.z;
  D.set(ry * nz - rz * ny, rz * nx - rx * nz, rx * ny - ry * nx);
  invInertia(v, D);
  // (D x r) . n
  const cx = D.y * rz - D.z * ry, cy = D.z * rx - D.x * rz, cz = D.x * ry - D.y * rx;
  return v.def.invM + cx * nx + cy * ny + cz * nz;
}
/** Local (model) point -> world. */
export function toWorld(v, x, y, z, out) {
  out.set(x, y, z).applyQuaternion(v.quat);
  return out.add(v.pos);
}
function basis(v) {
  fw.set(0, 0, 1).applyQuaternion(v.quat);
  up.set(0, 1, 0).applyQuaternion(v.quat);
  lf.set(1, 0, 0).applyQuaternion(v.quat);
}
/** pos (origin under the wheelbase) from the centre of mass. */
export function syncPos(v) {
  P.set(0, v.def.cmY, v.def.cmZ).applyQuaternion(v.quat);
  v.pos.copy(v.com).sub(P);
}
export function syncCom(v) {
  P.set(0, v.def.cmY, v.def.cmZ).applyQuaternion(v.quat);
  v.com.copy(v.pos).add(P);
}

// ---- the step ----------------------------------------------------------------------------------------------------------------
/** Advance one vehicle by h seconds (one substep). */
export function step(v, h) {
  const d = v.def;
  basis(v);
  F.set(0, -G * d.mass, 0); T.set(0, 0, 0);
  v.inWater = 0;
  switch (d.kind) {
    case 'boat': boatForces(v, h); break;
    case 'heli': heliForces(v, h); break;
    case 'plane': planeForces(v, h); wheelForces(v, h); break;
    default: wheelForces(v, h); if (d.kind === 'bike') bikeBalance(v, h);
  }
  if (d.kind !== 'boat') sinkForces(v, h);
  // integrate velocities
  v.vel.addScaledVector(F, d.invM * h);
  invInertia(v, T);
  v.angVel.addScaledVector(T, h);
  // contacts
  groundContacts(v, h);
  staticContacts(v, h);
  // integrate positions
  v.com.addScaledVector(v.vel, h);
  const w = v.angVel;
  dq.set(w.x * h * 0.5, w.y * h * 0.5, w.z * h * 0.5, 0).multiply(v.quat);
  v.quat.x += dq.x; v.quat.y += dq.y; v.quat.z += dq.z; v.quat.w += dq.w;
  v.quat.normalize();
  syncPos(v);
}

// ---- wheels: suspension, tyres, engine --------------------------------------------------------------------------------------------
function latCurve(a, peak, slide) {
  if (a < peak) return a / peak;
  const t = Math.min(1, (a - peak) / (peak * 2.5));
  return 1 - (1 - slide) * t;
}

function engine(v, h) {
  const d = v.def, c = v.ctl;
  const vF = v.vel.dot(fw);
  v.speed = vF;
  let thr = c.throttle || 0, brk = c.brake || 0, drive = 0;
  if (thr > 0.02) { if (vF < -2) brk = Math.max(brk, thr); else drive = thr; }
  else if (thr < -0.02) { if (vF > 2) brk = Math.max(brk, -thr); else drive = thr; }
  if (!v.engineOn || v.dead || v.drowned) drive = 0;
  v.braking = brk > 0.05;
  // gears (for the rev counter and the sound)
  const n = d.gears, av = Math.abs(vF);
  if (drive < 0 && vF < 1) v.gear = -1;
  else if (v.gear < 1) v.gear = 1;
  if (v.gear >= 1) {
    if (v.gear < n && av > d.gearTop[v.gear - 1] * 0.97) { v.gear++; v.shiftT = 0.22; }
    else if (v.gear > 1 && av < d.gearTop[v.gear - 2] * 0.7) { v.gear--; v.shiftT = 0.12; }
  }
  v.shiftT = Math.max(0, (v.shiftT || 0) - h);
  // constant power, traction-limited by the tyres; a limiter at the top speed
  let force = 0;
  if (drive > 0) {
    force = drive * Math.min(d.Fmax, d.Pw / Math.max(av, 3));
    force *= Math.min(1, Math.max(0, (d.top - vF) / (d.top * 0.03)));
    if (v.shiftT > 0) force *= 0.3;
  } else if (drive < 0) {
    force = drive * Math.min(d.Fmax * 0.6, d.Pw / Math.max(av, 3)) * Math.min(1, Math.max(0, (d.revTop + vF) / 6));
  }
  // rpm: from the wheel speed in this gear, plus the revs of a spinning tyre
  const gt = v.gear > 0 ? d.gearTop[v.gear - 1] : d.revTop;
  const lo = v.gear > 1 ? d.gearTop[v.gear - 2] * 0.55 : 0;
  let rpm = v.engineOn ? 0.14 + 0.86 * Math.min(1, Math.max(0, (av - lo) / Math.max(1, gt - lo))) : 0;
  if (v.engineOn && Math.abs(drive) > 0.1) rpm = Math.max(rpm, 0.3 + (v.wheelSpin || 0) * 0.7);
  v.rpm += (Math.min(1, rpm) - v.rpm) * Math.min(1, h * 10);
  eng.force = force; eng.brk = brk;
}

const eng = { force: 0, brk: 0 };
function wheelForces(v, h) {
  const d = v.def, c = v.ctl, ws = d.wheels, nW = ws.length;
  if (d.kind === 'plane') planeBrakes(v); else engine(v, h);
  // steering: less lock at speed, eased
  const sp = Math.abs(v.speed);
  const lock = d.steer / (1 + sp / d.steerFade);
  const want = -(c.steer || 0) * lock;
  const rate = 3.2 + (d.kind === 'bike' ? 2 : 0);
  v.steerAngle += Math.max(-rate * h, Math.min(rate * h, want - v.steerAngle));
  const hb = !!c.handbrake && d.kind !== 'plane';
  const mu = d.mu * (v.surfGrip || 1);
  let contacts = 0, spinSum = 0, skidSum = 0, comp = 0;
  const mShare = d.mass / nW;
  const upY = up.y;
  // aero: downforce and drag
  const v2 = v.vel.lengthSq();
  if (d.kind !== 'plane') {
    const df = d.downK * v2 * d.mass;
    addForce(v, -up.x * df, -up.y * df, -up.z * df, v.com.x, v.com.y, v.com.z);
    const dk = d.dragK * Math.sqrt(v2);
    F.x -= v.vel.x * dk; F.y -= v.vel.y * dk; F.z -= v.vel.z * dk;
  }
  for (let i = 0; i < nW; i++) {
    const w = ws[i], st = v.wheels[i];
    toWorld(v, w.x, w.mountY, w.z, A);
    st.contact = false;
    if (upY < 0.25) { st.len = w.Lmax; continue; }
    const g = groundProbe(A.x, A.y, A.z, 0.35, v.box);
    st.surf = probe.box ? 1 : probe.deck ? 1 : V.ground.kindAt ? surfKind(A.x, A.z) : 1;
    if (waterAt(A.x, A.z) > g + 0.4) { st.len = w.Lmax; continue; }
    const dist = (A.y - g) / upY;
    const L = dist - w.r;
    if (L >= w.Lmax) { st.len = w.Lmax; continue; }
    st.contact = true; contacts++;
    st.len = Math.max(-0.3, L);
    const x = w.Lmax - L;
    comp += x / w.Lmax;
    // contact point and its velocity
    P.copy(A).addScaledVector(up, -dist);
    pointVel(v, P.x, P.y, P.z, VP);
    const cv = -VP.dot(up);
    let fs = w.k * x + w.c * cv;
    if (x > w.Lmax) fs += w.k * 6 * (x - w.Lmax) + w.c * 2 * Math.max(0, cv);
    fs = Math.max(0, Math.min(fs, w.k * w.Lmax * 5));
    st.load = fs;
    // tyre directions
    if (w.steer) {
      const ca = Math.cos(v.steerAngle * w.steer), sa = Math.sin(v.steerAngle * w.steer);
      WF.copy(fw).multiplyScalar(ca).addScaledVector(lf, sa);
    } else WF.copy(fw);
    WS.crossVectors(up, WF);
    const vf = VP.dot(WF), vs = VP.dot(WS);
    const fz = Math.min(fs, w.staticLoad * 2.5);
    const surf = st.surf === 0 ? 0.62 : st.surf === 0.5 ? 0.85 : 1; // sand, mud and lawn are slippery
    let latMu = mu * surf * latCurve(Math.abs(Math.atan2(vs, Math.abs(vf) + 2)), d.peak, w.front ? d.slideF : d.slideR);
    if (!w.front && hb) latMu *= d.hbGrip;
    let fy = -Math.sign(vs) * latMu * fz;
    const capY = Math.abs(vs) * mShare / h;
    if (Math.abs(fy) > capY) fy = -Math.sign(vs) * capY;
    // longitudinal: drive, brakes, handbrake, rolling
    let fx = 0;
    if (w.driven) fx += eng.force * w.driveShare;
    let brakeF = eng.brk * d.brakeF * (w.front ? 0.6 : 0.4);
    if (w.front && c.throttle > 0.5 && eng.brk > 0.5 && Math.abs(v.speed) < 8) brakeF = d.brakeF * 2; // burnout: fronts held
    if (!w.front && hb) brakeF = Math.max(brakeF, mu * fz * 0.55);
    if (!w.driven || Math.abs(eng.force) < 1) brakeF += mShare * 0.5 + Math.abs(vf) * mShare * 0.008;
    if (!v.driverIn && !w.front && !v.engineOn) brakeF += mShare * 30; // parked: in gear
    const capX = Math.abs(vf) * mShare / h;
    fx -= Math.sign(vf) * Math.min(brakeF, capX);
    // friction ellipse: a spinning or locked tyre loses some of its side grip
    const limX = d.muX * surf * fz, limY = mu * surf * fz;
    const ex = fx / limX, ey = fy / Math.max(1e-6, limY);
    const e2 = ex * ex + ey * ey;
    let spin = 0;
    if (e2 > 1) {
      const over = Math.sqrt(e2);
      spin = Math.min(1, (Math.abs(ex) - 0.9) * 1.5);
      if (spin < 0) spin = 0;
      fx /= over; fy /= over * (1 + spin * 0.6);
    }
    st.slip = spin; spinSum += w.driven ? spin : 0;
    const skid = Math.min(1, Math.max(spin, (Math.abs(vs) - 6) / 25));
    st.skid = skid; skidSum += skid;
    // wheel rotation (for drawing): rolling, or spinning up
    const spinV = w.driven && spin > 0.05 && eng.force > 0 ? Math.max(Math.abs(vf), 30 * spin) : vf;
    st.omega = (!w.front && hb) ? 0 : spinV / w.r;
    // apply: suspension along up at the contact; tyre forces raised toward the centre of mass (less body roll)
    const lift = d.rollLift;
    TT.copy(P).lerp(v.com, lift);
    addForce(v, up.x * fs, up.y * fs, up.z * fs, P.x, P.y, P.z);
    addForce(v, WF.x * fx + WS.x * fy, WF.y * fx + WS.y * fy, WF.z * fx + WS.z * fy, TT.x, TT.y, TT.z);
  }
  // wheels in the air keep spinning down
  for (let i = 0; i < nW; i++) { const st = v.wheels[i]; if (!st.contact) st.omega *= 1 - Math.min(1, h * 0.8); }
  v.contacts = contacts;
  v.wheelSpin = nW ? spinSum / Math.max(1, d.nDriven) : 0;
  v.skid = nW ? skidSum / nW : 0;
  v.compression = contacts ? comp / contacts : 0;
  // arcade help: steady the yaw when not sliding on purpose; air control
  if (contacts >= 2) {
    const yawRate = v.angVel.dot(up);
    if (!hb) { const k = d.yawDamp * Math.min(1, sp / 40) * d.I.y; T.addScaledVector(up, -yawRate * k); }
  } else if (contacts === 0 && d.kind === 'car') {
    // a little control in the air (pitch with throttle, roll with steer)
    T.addScaledVector(lf, (c.throttle || 0) * d.I.x * 1.2);
    T.addScaledVector(fw, (c.steer || 0) * d.I.z * 1.6);
  }
  // flip back: on its side or roof, nearly still, steer to rock it over
  if (upY < 0.5 && v.vel.lengthSq() < 25 && (c.steer || 0) !== 0 && v.driverIn) T.addScaledVector(fw, c.steer * d.I.z * 9);
}

function planeBrakes(v) {
  const c = v.ctl;
  v.speed = v.vel.dot(fw);
  eng.force = 0; eng.brk = Math.max(c.brake || 0, c.throttle < -0.05 ? -c.throttle : 0);
  v.braking = eng.brk > 0.05;
}

function surfKind(x, z) {
  const k = V.ground.kindAt(x, z);
  return k === 1 || k === 2 || k === 4 ? 0 : k === 5 ? 0.5 : 1;
}

// ---- bikes: keep upright, lean into the turn ---------------------------------------------------------------------------------
const RH = new THREE.Vector3();
function bikeBalance(v, h) {
  const d = v.def;
  RH.set(-fw.z, 0, fw.x);
  const l = RH.length();
  if (l < 0.2) return;
  RH.multiplyScalar(1 / l);
  const roll = Math.asin(Math.max(-1, Math.min(1, up.dot(RH))));
  const rollRate = v.angVel.dot(fw);
  const sp = v.speed;
  let target;
  if (v.driverIn && !v.dead) {
    const yawRate = v.angVel.y;
    target = Math.max(-0.85, Math.min(0.85, Math.atan((-sp * yawRate) / G)));
  } else if (Math.abs(sp) < 3 && v.contacts) target = -0.22; // on the kickstand
  else return; // riderless and moving: it falls over
  const k = d.I.z * (v.contacts ? 70 : 25), kd = d.I.z * (v.contacts ? 13 : 6);
  T.addScaledVector(fw, (target - roll) * k - rollRate * kd);
  // and no pitching over (wheelies stay small)
  const pitchRate = v.angVel.dot(lf);
  T.addScaledVector(lf, -pitchRate * d.I.x * 3);
  v.lean = roll;
}

// ---- water: boats float, everything else sinks ----------------------------------------------------------------------------------
function boatForces(v, h) {
  const d = v.def, c = v.ctl;
  const pts = d.buoy, n = pts.length;
  let wet = 0, sternWet = false, bowWet = 0;
  const vF = v.vel.dot(fw);
  v.speed = vF;
  for (let i = 0; i < n; i++) {
    const b = pts[i];
    toWorld(v, b[0], b[1], b[2], A);
    const wy = waterAt(A.x, A.z);
    if (wy === -Infinity) continue;
    const depth = wy - A.y;
    if (depth <= 0) continue;
    wet++;
    if (b[2] < d.hull.z0 * 0.5) sternWet = true; else if (b[2] > 0) bowWet++;
    pointVel(v, A.x, A.y, A.z, VP);
    const f = d.buoyK * Math.min(depth, d.buoyD) - d.buoyC * VP.y;
    addForce(v, 0, Math.max(0, f), 0, A.x, A.y, A.z);
  }
  const wf = wet / n;
  v.inWater = wf;
  v.contacts = wet;
  if (wet) {
    // drag: low along the hull, very high sideways (the keel), behind the centre so it tracks straight
    const vS = v.vel.dot(lf), vU = v.vel.dot(up);
    const planing = Math.min(1, Math.max(0, (Math.abs(vF) - d.top * 0.3) / (d.top * 0.4)));
    const cF = d.dragK * (1 - planing * 0.45);
    P.copy(v.com).addScaledVector(fw, d.hull.z0 * 0.25).addScaledVector(up, -1);
    const fF = -(vF * Math.abs(vF) * cF + vF * 0.25) * d.mass * wf;
    F.addScaledVector(fw, fF);
    const fS = -(vS * Math.abs(vS) * 0.04 + vS * 2.2) * d.mass * wf;
    addForce(v, lf.x * fS, lf.y * fS, lf.z * fS, P.x, P.y, P.z);
    F.addScaledVector(up, -vU * 1.2 * d.mass * wf);
    // the prop: needs the stern in the water
    let thr = v.engineOn && !v.dead && !v.drowned ? (c.throttle || 0) - (c.brake || 0) * (vF > 1 ? 1 : 0) : 0;
    thr = Math.max(-1, Math.min(1, thr));
    if (sternWet) {
      let f = thr > 0 ? thr * Math.min(d.Fmax, d.Pw / Math.max(Math.abs(vF), 6)) : thr * d.Fmax * 0.35;
      if (thr > 0) f *= Math.min(1, Math.max(0, (d.top - vF) / (d.top * 0.05)));
      toWorld(v, 0, d.hull.y0 + 0.4, d.hull.z0 + 1, A);
      addForce(v, fw.x * f, fw.y * f * 0.3, fw.z * f, A.x, A.y, A.z);
      // rudder: bites with speed and with prop wash
      const bite = Math.abs(vF) * 0.9 + Math.abs(thr) * 18;
      const yawT = -(c.steer || 0) * d.steer * bite * d.I.y * 0.045 * Math.sign(vF + 0.5);
      T.addScaledVector(up, yawT);
      // bank into the turn
      T.addScaledVector(fw, (c.steer || 0) * Math.min(1, Math.abs(vF) / 60) * d.I.z * 3.5);
    }
    // planing: the hull rises on its own lift and the bow comes up at mid speed
    const sp = Math.abs(vF) / d.top;
    if (vF > 5) {
      F.addScaledVector(up, d.mass * G * 0.35 * Math.min(1, sp * sp * 2.2) * wf);
      T.addScaledVector(lf, -Math.sin(Math.min(1, sp * 1.4) * Math.PI) * d.I.x * 2.2 * wf);
    }
    const yawRate = v.angVel.dot(up);
    T.addScaledVector(up, -yawRate * d.I.y * 1.6 * wf);
    T.addScaledVector(v.angVel, -d.I.x * 0.8 * wf);
    v.rpm += ((v.engineOn ? 0.15 + 0.85 * Math.min(1, Math.abs(thr) * (sternWet ? 0.4 + 0.6 * Math.abs(vF) / d.top : 1)) : 0) - v.rpm) * Math.min(1, h * 4);
    v.planing = planing;
  } else {
    v.rpm += ((v.engineOn ? 0.15 + Math.abs(c.throttle || 0) * 0.85 : 0) - v.rpm) * Math.min(1, h * 4);
  }
  v.gear = 1;
}

/** Anything that isn't a boat: floats a little, fills up and sinks; the engine drowns. */
function sinkForces(v, h) {
  const d = v.def;
  const wy = waterAt(v.com.x, v.com.z);
  if (wy === -Infinity) return;
  const depth = wy - (v.com.y - d.cmY * 0.5);
  if (depth <= 0) return;
  const f = Math.min(1, depth / Math.max(2, d.size.h));
  v.inWater = f;
  v.waterT = (v.waterT || 0) + h;
  // buoyancy fades as it floods (about 8 s)
  const flood = Math.min(1, v.waterT / 8);
  F.y += d.mass * G * f * (1.25 - flood * 0.9);
  F.addScaledVector(v.vel, -d.mass * 1.6 * f);
  T.addScaledVector(v.angVel, -d.I.x * 1.5 * f);
  if (f > 0.5 && d.kind !== 'heli') v.drowned = true;
}

// ---- helicopters -------------------------------------------------------------------------------------------------------------------
function heliForces(v, h) {
  const d = v.def, c = v.ctl;
  const alive = !v.dead && v.engineOn && !v.drowned;
  v.rotor = Math.max(0, Math.min(1, v.rotor + (alive ? h / 3.2 : -h / 6)));
  const r2 = v.rotor * v.rotor;
  v.rpm = v.rotor;
  v.speed = v.vel.dot(fw);
  // lift along the rotor axis: hover, climb, sink; holds height with no input
  const healthy = v.health > 250 ? 1 : 0.55 + 0.45 * (v.health / 250);
  const coll = c.up || 0;
  const hold = -v.vel.y * 0.9;
  const ground = Math.max(0, 1 - (v.alt ?? 99) / 20) * 0.12; // ground effect
  const lift = alive ? r2 * d.mass * (G * (1 + ground) + (coll * 34 + (coll === 0 ? hold : 0)) * healthy) : 0;
  addForce(v, up.x * lift, up.y * lift, up.z * lift, v.com.x, v.com.y, v.com.z);
  // drag
  const sp = v.vel.length();
  F.addScaledVector(v.vel, -d.mass * (0.28 + sp * 0.0032));
  F.y -= v.vel.y * d.mass * 0.35;
  // attitude: pitch with throttle (nose down = forward), bank with steer, yaw rate with steer (or yaw)
  RH.set(-fw.z, 0, fw.x).normalize();
  const pitch = Math.asin(Math.max(-1, Math.min(1, -fw.y)));
  const roll = Math.asin(Math.max(-1, Math.min(1, up.dot(RH))));
  const auth = r2 * (alive ? 1 : 0.15);
  const tP = (c.throttle || 0) * 0.42, tR = (c.steer || 0) * 0.34 + (c.yaw || 0) * 0.0;
  const wP = v.angVel.dot(lf), wR = v.angVel.dot(fw);
  T.addScaledVector(lf, ((tP - pitch) * 16 - wP * 7) * d.I.x * auth);
  T.addScaledVector(fw, ((tR - roll) * 16 - wR * 7) * d.I.z * auth);
  let yawWant = -((c.steer || 0) * 1.25 + (c.yaw || 0) * 1.25);
  if (v.health < 250 && alive) yawWant += 2.6 * (1 - v.health / 250); // the tail rotor is failing
  T.y += (yawWant * auth - v.angVel.y) * d.I.y * 4 * Math.max(auth, 0.1);
  v.gear = 1;
  v.contacts = 0;
}

// ---- planes --------------------------------------------------------------------------------------------------------------------------
function planeForces(v, h) {
  const d = v.def, c = v.ctl;
  const alive = !v.dead && v.engineOn && !v.drowned;
  const want = alive ? Math.max(0, c.throttle || 0) : 0;
  v.thrust += (want - v.thrust) * Math.min(1, h * 1.2);
  v.rpm = alive ? 0.2 + 0.8 * v.thrust : Math.max(0, v.rpm - h * 0.4);
  v.rotor = v.rpm;
  const m = d.mass;
  // thrust along the nose
  const th = v.thrust * m * d.thrustA * Math.max(0, 1 - Math.max(0, v.vel.dot(fw)) / (d.top * 1.15));
  addForce(v, fw.x * th, fw.y * th, fw.z * th, v.com.x, v.com.y, v.com.z);
  // the air in body axes
  const u = v.vel.dot(fw), w = v.vel.dot(up), s = v.vel.dot(lf);
  const alpha = Math.atan2(-w, Math.max(5, Math.abs(u)));
  const stall = Math.abs(alpha) > d.stall;
  let cl = d.cl0 + d.cla * alpha;
  if (stall) cl *= Math.max(0.15, 1 - (Math.abs(alpha) - d.stall) * 4);
  v.stall = stall && u > 20;
  const q = u * u;
  const lift = d.liftK * m * q * cl;
  // perpendicular to the airflow, in the plane of symmetry
  const vl = Math.hypot(u, w) || 1;
  A.copy(up).multiplyScalar(u / vl).addScaledVector(fw, -w / vl);
  addForce(v, A.x * lift, A.y * lift, A.z * lift, v.com.x, v.com.y, v.com.z);
  // drag (parasitic + induced), side force from the fin
  const dragC = m * (d.cd0 + d.cdi * cl * cl);
  F.addScaledVector(v.vel, -dragC * v.vel.length());
  F.addScaledVector(lf, -s * Math.abs(s) * m * 0.012 - s * m * 0.4);
  // control surfaces bite with airspeed (a little on the ground so it can rotate)
  const qf = Math.min(1.6, q / (d.vRot * d.vRot));
  const I = d.I;
  const wP = v.angVel.dot(lf), wR = v.angVel.dot(fw), wY = v.angVel.dot(up);
  // pitch: elevator (+up = nose up = negative about the left axis), stability from alpha, damping
  T.addScaledVector(lf, (-(c.up || 0) * 2.4 * qf + alpha * 3.2 * qf - wP * (1.2 + 2.5 * qf)) * I.x);
  // roll: ailerons, damping, a little wing-levelling
  RH.set(-fw.z, 0, fw.x).normalize();
  const roll = Math.asin(Math.max(-1, Math.min(1, up.dot(RH))));
  T.addScaledVector(fw, ((c.steer || 0) * 3.2 * qf - wR * (1 + 3 * qf) - roll * 0.25 * qf) * I.z);
  // yaw: rudder (yaw, some steer), weathervane, damping, and the bank turns the nose
  const coord = Math.sin(roll) * Math.min(1, q / 3600) * 0.9;
  T.addScaledVector(up, (-((c.yaw || 0) + (c.steer || 0) * 0.25) * 1.2 * qf - s * 0.02 * qf * 8 - wY * (1 + 2 * qf) - coord) * I.y);
  v.gear = 1;
}

// ---- contacts: the hull against the ground -------------------------------------------------------------------------------------
export const hit = { dv: 0, x: 0, y: 0, z: 0, kind: '', other: null };
function groundContacts(v, h) {
  const d = v.def, cs = d.corners;
  let pen = 0, best = 0;
  v.bodyGround = false;
  // quick reject: corners well above the ground under the centre aren't probed
  const g0 = groundProbe(v.com.x, v.com.y, v.com.z, 0.5, v.box);
  const lim = g0 + 0.7 + Math.max(0, -v.vel.y) * h * 2;
  for (let i = 0; i < cs.length; i++) {
    const c = cs[i];
    if (v.pos.y + c[0] * lf.y + c[1] * up.y + c[2] * fw.y > lim) continue;
    toWorld(v, c[0], c[1], c[2], A);
    const g = groundProbe(A.x, A.y, A.z, 0.9, v.box);
    if (A.y >= g) continue;
    const depth = g - A.y;
    v.bodyGround = true;
    pointVel(v, A.x, A.y, A.z, VP);
    const vn = VP.y;
    if (vn < 0) {
      const k = invMassAt(v, A.x, A.y, A.z, 0, 1, 0);
      const e = vn < -12 ? 0.18 : 0;
      const j = (-(1 + e) * vn) / k;
      impulse(v, 0, j, 0, A.x, A.y, A.z);
      if (-vn > best) best = -vn;
      // friction (scraping along on the roof or the side)
      pointVel(v, A.x, A.y, A.z, VP);
      const tl = Math.hypot(VP.x, VP.z);
      if (tl > 1e-3) {
        const kt = invMassAt(v, A.x, A.y, A.z, VP.x / tl, 0, VP.z / tl);
        const jt = Math.min(d.bodyMu * j, tl / kt);
        impulse(v, (-VP.x / tl) * jt, 0, (-VP.z / tl) * jt, A.x, A.y, A.z);
        if (tl > 12 && V.fx?.sparks && Math.random() < h * 30) V.fx.sparks(A, VP, 6);
      }
    }
    if (depth > pen) pen = depth;
  }
  if (pen > 0) v.com.y += Math.min(pen, 2) * 0.8;
  if (best > 0) v.onImpact(best, null, v.com, 'ground');
}

// ---- contacts: static boxes (buildings, walls, props) -----------------------------------------------------------------------------
const rect = { cx: 0, cz: 0, ax: 0, az: 0, bx: 0, bz: 0, hw: 0, hl: 0 };
/** The vehicle's footprint in the ground plane: centre, forward and left axes, half sizes. */
export function footprint(v, out = rect) {
  const d = v.def;
  let fx = fw.x, fz = fw.z, l = Math.hypot(fx, fz);
  if (l < 0.3) { fx = -up.x; fz = -up.z; l = Math.hypot(fx, fz) || 1; } // nose up or down: use the roof direction
  fx /= l; fz /= l;
  out.ax = fx; out.az = fz; out.bx = fz; out.bz = -fx;
  // hull centre (the box isn't always centred on the wheelbase)
  toWorld(v, d.hull.xc, (d.hull.y0 + d.hull.y1) / 2, d.hull.zc, C);
  out.cx = C.x; out.cz = C.z; out.cy = C.y;
  out.hl = d.hl * Math.max(0.5, l); out.hw = d.hw;
  return out;
}

const sat = { depth: 0, nx: 0, nz: 0, px: 0, pz: 0 };
/** SAT between the footprint r and an oriented rectangle (x, z, axes (c,-s)/(s,c), hx, hz). Fills `sat`, returns overlap. */
function satRect(r, x, z, c, s, hx, hz) {
  const dx = x - r.cx, dz = z - r.cz;
  let best = Infinity, bnx = 0, bnz = 0, own = 0;
  // axes: vehicle forward, vehicle left, box x, box z
  for (let k = 0; k < 4; k++) {
    let axx, axz;
    if (k === 0) { axx = r.ax; axz = r.az; } else if (k === 1) { axx = r.bx; axz = r.bz; } else if (k === 2) { axx = c; axz = -s; } else { axx = s; axz = c; }
    const ra = r.hl * Math.abs(r.ax * axx + r.az * axz) + r.hw * Math.abs(r.bx * axx + r.bz * axz);
    const rb = hx * Math.abs(c * axx - s * axz) + hz * Math.abs(s * axx + c * axz);
    const dist = dx * axx + dz * axz;
    const o = ra + rb - Math.abs(dist);
    if (o <= 0) return 0;
    if (o < best) { best = o; const sg = dist > 0 ? -1 : 1; bnx = axx * sg; bnz = axz * sg; own = k < 2 ? 1 : 0; }
  }
  // the push normal (box -> vehicle) and a contact point
  sat.depth = best; sat.nx = bnx; sat.nz = bnz;
  if (own) {
    // a corner of the box inside the vehicle
    const sx = Math.sign(c * bnx - s * bnz) || 1, sz = Math.sign(s * bnx + c * bnz) || 1;
    // box corner furthest toward the vehicle (along +n): local (sx*hx, sz*hz)
    sat.px = x + sx * hx * c + sz * hz * s; sat.pz = z - sx * hx * s + sz * hz * c;
  } else {
    // a corner of the vehicle inside the box (furthest along -n)
    const sa = -Math.sign(r.ax * bnx + r.az * bnz) || 1, sb = -Math.sign(r.bx * bnx + r.bz * bnz) || 1;
    sat.px = r.cx + r.ax * r.hl * sa + r.bx * r.hw * sb; sat.pz = r.cz + r.az * r.hl * sa + r.bz * r.hw * sb;
  }
  return best;
}

let stamp = 1;
function staticContacts(v, h) {
  const d = v.def, ph = V.phys;
  const r = footprint(v);
  // vertical extent of the hull
  const ext = d.radius;
  const yLo = Math.min(v.pos.y, v.com.y - ext * Math.abs(up.y) * 0.5) + d.stepH, yHi = v.com.y + Math.max(1, ext * 0.5);
  const rr = Math.hypot(r.hl, r.hw) + 0.5;
  const st = ++stamp;
  let best = 0, bestBox = null;
  const i0 = Math.floor((r.cx - rr) / CELL), i1 = Math.floor((r.cx + rr) / CELL), j0 = Math.floor((r.cz - rr) / CELL), j1 = Math.floor((r.cz + rr) / CELL);
  for (let i = i0; i <= i1; i++) for (let j = j0; j <= j1; j++) {
    const list = ph.grid.get(gkey(i, j));
    if (!list) continue;
    for (let q = 0; q < list.length; q++) {
      const b = list[q];
      if (b._vst === st) continue; b._vst = st;
      if (!b.solid || b.vehicle || b === v.box || b.mat === 'foliage' || b.ghost) continue;
      const top = b.y + b.hy, bot = b.y - b.hy;
      if (top <= yLo || bot >= yHi) continue;
      const dx = b.x - r.cx, dz = b.z - r.cz;
      const br = Math.abs(b.hx) + Math.abs(b.hz);
      if (dx * dx + dz * dz > (rr + br) * (rr + br)) continue;
      if (!satRect(r, b.x, b.z, b.c, b.s, b.hx, b.hz)) continue;
      // breakable props: let the world knock them over and drive on
      if (b.breakable) { V.events?.emit('prop:hit', { box: b, veh: v, vel: v.vel }); continue; }
      const dv = resolveStatic(v, b, h);
      if (dv > best) { best = dv; bestBox = b; }
    }
  }
  if (best > 0) v.onImpact(best, bestBox, hit, 'wall');
}

function resolveStatic(v, b, h) {
  const d = v.def;
  const nx = sat.nx, nz = sat.nz;
  // push out (all of it: walls don't move)
  v.com.x += nx * sat.depth; v.com.z += nz * sat.depth;
  const px = sat.px + nx * sat.depth * 0.5, pz = sat.pz + nz * sat.depth * 0.5;
  const py = Math.min(b.y + b.hy - 0.3, Math.max(b.y - b.hy + 0.3, v.com.y));
  pointVel(v, px, py, pz, VP);
  const vn = VP.x * nx + VP.z * nz;
  if (vn >= 0) return 0;
  const k = invMassAt(v, px, py, pz, nx, 0, nz);
  const e = -vn > 15 ? 0.22 : 0.05;
  const j = (-(1 + e) * vn) / k;
  impulse(v, nx * j, 0, nz * j, px, py, pz);
  // friction along the wall
  pointVel(v, px, py, pz, VP);
  const vt = VP.x * -nz + VP.z * nx;
  if (Math.abs(vt) > 1e-3) {
    const tx = -nz * Math.sign(vt), tz = nx * Math.sign(vt);
    const kt = invMassAt(v, px, py, pz, tx, 0, tz);
    const jt = Math.min(d.wallMu * j, Math.abs(vt) / kt);
    impulse(v, -tx * jt, 0, -tz * jt, px, py, pz);
    if (Math.abs(vt) > 14 && V.fx?.sparks && Math.random() < h * 40) { A.set(px, py, pz); B.set(nx, 0.4, nz); V.fx.sparks(A, B, 5); }
  }
  hit.x = px; hit.y = py; hit.z = pz; hit.nx = nx; hit.nz = nz; hit.other = b;
  return j * d.invM;
}

// ---- vehicle against vehicle ------------------------------------------------------------------------------------------------------
const ra = { cx: 0, cz: 0, ax: 0, az: 0, bx: 0, bz: 0, hw: 0, hl: 0 }, rb = { cx: 0, cz: 0, ax: 0, az: 0, bx: 0, bz: 0, hw: 0, hl: 0 };
/** Collide two vehicles (footprints with a height overlap); returns the speed change of the hardest hit, or 0. */
export function collidePair(a, b, h) {
  basis(b); footprint(b, rb); const bUpY = up.y, bcy = rb.cy;
  basis(a); footprint(a, ra);
  // heights
  const aLo = a.com.y - a.def.size.h * 0.5, aHi = a.com.y + a.def.size.h * 0.5;
  const bLo = b.com.y - b.def.size.h * 0.5, bHi = b.com.y + b.def.size.h * 0.5;
  if (aHi < bLo || bHi < aLo) return 0;
  // b's footprint as an oriented rectangle in a's SAT: its "box x" axis is b's left, "box z" its forward
  // rectangle with axes (c, -s) = left, (s, c) = forward  ->  c = left.x, s = forward.x
  const o = satRect(ra, rb.cx, rb.cz, rb.bx, rb.ax, rb.hw, rb.hl);
  if (!o) return 0;
  const nx = sat.nx, nz = sat.nz; // pushes a away from b
  const ia = a.def.invM, ib = b.def.invM, it = ia + ib;
  a.com.x += nx * sat.depth * (ia / it); a.com.z += nz * sat.depth * (ia / it);
  b.com.x -= nx * sat.depth * (ib / it); b.com.z -= nz * sat.depth * (ib / it);
  const px = sat.px, pz = sat.pz, py = (Math.max(aLo, bLo) + Math.min(aHi, bHi)) / 2;
  pointVel(a, px, py, pz, VP); pointVel(b, px, py, pz, C);
  const rvx = VP.x - C.x, rvz = VP.z - C.z;
  const vn = rvx * nx + rvz * nz;
  if (vn >= 0) return 0;
  const k = invMassAt(a, px, py, pz, nx, 0, nz) + invMassAt(b, px, py, pz, nx, 0, nz);
  const e = -vn > 12 ? 0.25 : 0.05;
  const j = (-(1 + e) * vn) / k;
  impulse(a, nx * j, 0, nz * j, px, py, pz);
  impulse(b, -nx * j, 0, -nz * j, px, py, pz);
  // friction: the sideswipe spins them
  pointVel(a, px, py, pz, VP); pointVel(b, px, py, pz, C);
  const tvx = VP.x - C.x, tvz = VP.z - C.z;
  const vt = tvx * -nz + tvz * nx;
  if (Math.abs(vt) > 1e-3) {
    const tx = -nz * Math.sign(vt), tz = nx * Math.sign(vt);
    const kt = invMassAt(a, px, py, pz, tx, 0, tz) + invMassAt(b, px, py, pz, tx, 0, tz);
    const jt = Math.min(0.45 * j, Math.abs(vt) / kt);
    impulse(a, -tx * jt, 0, -tz * jt, px, py, pz);
    impulse(b, tx * jt, 0, tz * jt, px, py, pz);
  }
  hit.x = px; hit.y = py; hit.z = pz; hit.nx = nx; hit.nz = nz;
  void bUpY; void bcy;
  return j;
}
