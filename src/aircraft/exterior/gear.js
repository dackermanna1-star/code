// =============================================================================
// Landing gear: right main gear (mirrored for the left) and the nose gear.
// Geometry is built around each assembly's own pivot so the retraction is a
// single rotation:
//   main gear: trunnion axis ~ along Z, swings INBOARD into the belly well
//              (the 737 has no main gear doors – the outer wheel's hubcap stays
//              visible in the belly)
//   nose gear: trunnion axis along X, swings FORWARD into the nose well
// =============================================================================
import * as THREE from 'three';
import { AIRCRAFT } from '../../core/constants.js';
import { latheZ, merge, smoothSeams } from './geom.js';
import { orientLathe } from './engine.js';

const G = AIRCRAFT.gear;
export const MAIN_WHEEL_R = 0.565, NOSE_WHEEL_R = 0.343;
export const MAIN_PIVOT = new THREE.Vector3(G.mainX - 0.06, -0.7, G.mainZ);
export const MAIN_AXLE_DOWN = new THREE.Vector3(G.mainX, -AIRCRAFT.groundHeight + MAIN_WHEEL_R, G.mainZ);
export const NOSE_PIVOT = new THREE.Vector3(0, -0.62, G.noseZ - 0.18);
export const NOSE_AXLE_DOWN = new THREE.Vector3(0, -AIRCRAFT.groundHeight + NOSE_WHEEL_R, G.noseZ);
export const MAIN_WHEEL_OFFSET = 0.43;   // half spacing of the twin wheels
export const NOSE_WHEEL_OFFSET = 0.19;

function cyl(r0, r1, a, b, segs = 14) {
  const d = new THREE.Vector3().subVectors(b, a);
  const g = new THREE.CylinderGeometry(r1, r0, d.length(), segs, 1, false);
  g.translate(0, d.length() / 2, 0);
  const q = new THREE.Quaternion().setFromUnitVectors(new THREE.Vector3(0, 1, 0), d.clone().normalize());
  g.applyQuaternion(q);
  g.translate(a.x, a.y, a.z);
  return g;
}
function box(w, h, d, x, y, z, rx = 0, ry = 0, rz = 0) {
  const g = new THREE.BoxGeometry(w, h, d);
  g.rotateX(rx); g.rotateY(ry); g.rotateZ(rz);
  g.translate(x, y, z);
  return g;
}

/** Tyre (axis = X), radius R, width W; returns {tyre, wheel(hub+rim), hubcap} */
function wheelGeometry(R, Wd, rimR, segs, hubcap = true) {
  const hw = Wd / 2;
  // tyre cross-section: rounded rectangle (r, z) around the axle, z = lateral
  const prof2 = [];
  const cr = Math.min(hw * 0.55, (R - rimR) * 0.45);
  prof2.push([rimR + 0.015, -hw * 0.82]);
  prof2.push([R - cr * 1.6, -hw]);
  for (let k = 0; k <= 6; k++) { const a = Math.PI / 2 * (k / 6); prof2.push([R - cr + Math.sin(a) * cr, -hw + cr - Math.cos(a) * cr]); }
  for (let k = 0; k <= 6; k++) { const a = Math.PI / 2 * (k / 6); prof2.push([R - cr + Math.cos(a) * cr, hw - cr + Math.sin(a) * cr]); }
  prof2.push([R - cr * 1.6, hw]);
  prof2.push([rimR + 0.015, hw * 0.82]);
  const tyre = latheZ(prof2, segs, { vRange: [0, 1] });
  orientLathe(tyre, false);
  tyre.rotateY(Math.PI / 2);
  // wheel: rim + recessed hub (both sides)
  const rimProf = [[rimR + 0.02, -hw * 0.82], [rimR, -hw * 0.78], [rimR * 0.92, -hw * 0.55], [rimR * 0.55, -hw * 0.45], [rimR * 0.25, -hw * 0.5], [0.0, -hw * 0.5]];
  const rimA = latheZ(rimProf, segs);
  const rimB = latheZ(rimProf.map(([r, z]) => [r, -z]), segs);
  orientLathe(rimA, false); orientLathe(rimB, false);
  // nudge orientation: faces should look outwards along the axle
  rimA.rotateY(Math.PI / 2); rimB.rotateY(Math.PI / 2);
  const parts = { tyre, wheel: merge([rimA, rimB]) };
  if (hubcap) {
    const hc = latheZ([[0.0, -hw * 0.62], [rimR * 0.35, -hw * 0.6], [rimR * 0.62, -hw * 0.55], [rimR * 0.7, -hw * 0.48]], segs);
    orientLathe(hc, false);
    hc.rotateY(Math.PI / 2);
    parts.hubcap = hc;
  }
  return parts;
}

/**
 * Right main gear. Returns geometries relative to MAIN_PIVOT (pivot at origin):
 * { leg (painted), chrome (piston), dark (brakes, links), tyres, wheels, hubcaps, wheelCentres }
 * The wheels are separate so they can spin: wheels/tyres are built around their
 * own axle centre (origin) and placed by the caller.
 */
export function buildMainGear(detail = 1) {
  const segs = detail >= 2 ? 40 : detail >= 1 ? 30 : detail >= 0 ? 22 : 10;
  const P = new THREE.Vector3(0, 0, 0);
  const axle = MAIN_AXLE_DOWN.clone().sub(MAIN_PIVOT);
  const up = axle.clone().negate().normalize();
  // outer cylinder from the trunnion down to ~45% , piston (chrome) below
  const cylEnd = axle.clone().multiplyScalar(0.62);
  const pistonEnd = axle.clone().add(up.clone().multiplyScalar(0.12));
  const leg = [
    cyl(0.13, 0.12, P.clone().add(up.clone().multiplyScalar(0.12)), cylEnd, 18),
    // trunnion cross-beam
    cyl(0.09, 0.09, new THREE.Vector3(0, 0, -0.42), new THREE.Vector3(0, 0, 0.42), 12),
    // drag brace (forward, to the wing spar)
    cyl(0.05, 0.05, axle.clone().multiplyScalar(0.5).add(new THREE.Vector3(0, 0, -0.08)), new THREE.Vector3(0.05, 0.12, -0.95), 10),
    // side brace (inboard, folding)
    cyl(0.055, 0.055, axle.clone().multiplyScalar(0.45), new THREE.Vector3(-0.95, 0.15, 0.1), 10),
    // axle housing across both wheels
    cyl(0.085, 0.085, axle.clone().add(new THREE.Vector3(-MAIN_WHEEL_OFFSET + 0.12, 0, 0)), axle.clone().add(new THREE.Vector3(MAIN_WHEEL_OFFSET - 0.12, 0, 0)), 12),
    // lower strut fitting (where the piston meets the axle)
    box(0.26, 0.2, 0.22, axle.x, axle.y + 0.08, axle.z),
    // shock-strut door (outboard, flat panel fairing the leg into the wing)
    box(0.03, 1.0, 0.62, 0.17, cylEnd.y * 0.55 - 0.05, 0.06, 0, 0, 0.0),
  ];
  const chrome = [cyl(0.085, 0.085, cylEnd.clone().add(up.clone().multiplyScalar(0.05)), pistonEnd, 16)];
  const dark = [
    // torsion links (scissors) in front of the piston
    box(0.06, 0.28, 0.05, axle.x, cylEnd.y - 0.05, axle.z - 0.16, 0.5),
    box(0.06, 0.28, 0.05, axle.x, axle.y + 0.32, axle.z - 0.16, -0.5),
    // brake units (inside each wheel)
    ...[-1, 1].map((s) => cyl(0.24, 0.24, axle.clone().add(new THREE.Vector3(s * (MAIN_WHEEL_OFFSET - 0.15), 0, 0)), axle.clone().add(new THREE.Vector3(s * (MAIN_WHEEL_OFFSET - 0.02), 0, 0)), 16)),
    // hydraulic lines along the leg
    cyl(0.012, 0.012, new THREE.Vector3(0.11, -0.05, 0.1), axle.clone().add(new THREE.Vector3(0.1, 0.25, 0.12)), 5),
    cyl(0.012, 0.012, new THREE.Vector3(-0.11, -0.05, 0.1), axle.clone().add(new THREE.Vector3(-0.1, 0.25, 0.12)), 5),
  ];
  const w = wheelGeometry(MAIN_WHEEL_R, 0.42, 0.27, segs, true);
  return {
    leg: smoothSeams(merge(leg)), chrome: merge(chrome), dark: merge(dark),
    tyre: smoothSeams(w.tyre), wheel: w.wheel, hubcap: w.hubcap,
    axle,
    wheelCentres: [axle.clone().add(new THREE.Vector3(-MAIN_WHEEL_OFFSET, 0, 0)), axle.clone().add(new THREE.Vector3(MAIN_WHEEL_OFFSET, 0, 0))],
    up,
  };
}

/** Nose gear relative to NOSE_PIVOT. */
export function buildNoseGear(detail = 1) {
  const segs = detail >= 1 ? 26 : detail >= 0 ? 18 : 9;
  const axle = NOSE_AXLE_DOWN.clone().sub(NOSE_PIVOT);
  const up = axle.clone().negate().normalize();
  const cylEnd = axle.clone().multiplyScalar(0.6);
  const leg = [
    cyl(0.09, 0.085, new THREE.Vector3(0, 0, 0), cylEnd, 16),
    cyl(0.06, 0.06, new THREE.Vector3(-0.3, 0, 0), new THREE.Vector3(0.3, 0, 0), 10),
    // drag brace forward
    cyl(0.04, 0.04, axle.clone().multiplyScalar(0.42), new THREE.Vector3(0, 0.1, -1.2), 8),
    box(0.2, 0.16, 0.2, axle.x, axle.y + 0.07, axle.z),
    cyl(0.05, 0.05, axle.clone().add(new THREE.Vector3(-NOSE_WHEEL_OFFSET + 0.06, 0, 0)), axle.clone().add(new THREE.Vector3(NOSE_WHEEL_OFFSET - 0.06, 0, 0)), 10),
    // taxi light bracket
    box(0.16, 0.1, 0.1, 0, cylEnd.y - 0.02, cylEnd.z - 0.12),
  ];
  const chrome = [cyl(0.06, 0.06, cylEnd, axle.clone().add(up.clone().multiplyScalar(0.1)), 14)];
  const dark = [
    box(0.04, 0.22, 0.04, axle.x, cylEnd.y - 0.06, axle.z - 0.12, 0.5),
    box(0.04, 0.22, 0.04, axle.x, axle.y + 0.28, axle.z - 0.12, -0.5),
    // steering actuators collar
    cyl(0.12, 0.12, axle.clone().multiplyScalar(0.18), axle.clone().multiplyScalar(0.26), 14),
  ];
  const w = wheelGeometry(NOSE_WHEEL_R, 0.2, 0.17, segs, false);
  return {
    leg: smoothSeams(merge(leg)), chrome: merge(chrome), dark: merge(dark),
    tyre: smoothSeams(w.tyre), wheel: w.wheel, axle, up,
    wheelCentres: [axle.clone().add(new THREE.Vector3(-NOSE_WHEEL_OFFSET, 0, 0)), axle.clone().add(new THREE.Vector3(NOSE_WHEEL_OFFSET, 0, 0))],
    taxiLight: new THREE.Vector3(0, cylEnd.y - 0.02, cylEnd.z - 0.18),
  };
}
