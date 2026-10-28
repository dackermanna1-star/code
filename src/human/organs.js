import { Vec3 } from '../physics/math.js';
import { landmark } from './anatomy.js';

/**
 * Internal anatomy for the injury model: organs, major vessels, airway, spinal cord and bones,
 * as ellipsoids and tubes in the physics bind pose (same coordinates as anatomy.js). Each structure
 * belongs to one segment, so a wound channel traced through a posed segment can be tested in that
 * segment's bind frame.
 *
 * Bleeding rates are for a fully open vessel at normal blood pressure (mL/s); `external` is the
 * fraction that leaves the body through the wound (the rest pools internally).
 */

const v = (x, y, z) => new Vec3(x, y, z);

function ell(name, seg, c, r, props) {
  return { name, seg, type: 'ellipsoid', c, r, ...props };
}

function tube(name, seg, a, b, r, props) {
  return { name, seg, type: 'tube', a, b, r, ...props };
}

const mir = (p) => v(-p.x, p.y, p.z);

function mirrorStruct(s) {
  const o = { ...s, name: s.name.replace(/L$/, 'R'), seg: s.seg.replace(/L$/, 'R'), label: (s.label || '').replace(/^left /, 'right ') };
  if (s.c) o.c = mir(s.c);
  if (s.a) o.a = mir(s.a);
  if (s.b) o.b = mir(s.b);
  if (s.side) o.side = 'R';
  return o;
}

export function buildAnatomy() {
  const S = [];
  const add = (s, mirror = false) => {
    S.push(s);
    if (mirror) S.push(mirrorStruct(s));
  };
  // ---------------- head & neck ----------------
  add(ell('brain', 'head', v(0, 1.705, -0.012), v(0.064, 0.058, 0.08), { kind: 'brain', label: 'brain' }));
  add(tube('brainstem', 'head', v(0, 1.668, -0.028), v(0, 1.612, -0.04), 0.016, { kind: 'brainstem', label: 'brain stem' }));
  add(tube('cervical cord (C1-C3)', 'neck', v(0, 1.605, -0.036), v(0, 1.548, -0.046), 0.012, { kind: 'cord', level: 'C1', label: 'upper cervical spinal cord' }));
  add(tube('cervical cord (C4-C7)', 'neck', v(0, 1.548, -0.046), v(0, 1.47, -0.06), 0.012, { kind: 'cord', level: 'C5', label: 'lower cervical spinal cord' }));
  add(tube('cervical vertebrae', 'neck', v(0, 1.6, -0.018), v(0, 1.47, -0.035), 0.017, { kind: 'bone', bone: 'cervical vertebrae', label: 'cervical vertebrae', nearCord: 'C5' }));
  add(tube('carotid artery L', 'neck', v(0.022, 1.47, 0.0), v(0.03, 1.6, 0.0), 0.0055, { kind: 'artery', bleed: 26, external: 0.85, label: 'left carotid artery', side: 'L' }), true);
  add(tube('jugular vein L', 'neck', v(0.036, 1.47, -0.008), v(0.044, 1.6, -0.01), 0.0065, { kind: 'vein', bleed: 11, external: 0.85, label: 'left jugular vein', side: 'L' }), true);
  add(tube('trachea', 'neck', v(0, 1.46, 0.006), v(0, 1.585, 0.008), 0.0105, { kind: 'airway', label: 'trachea' }));
  add(ell('jaw', 'head', v(0, 1.598, 0.04), v(0.05, 0.03, 0.05), { kind: 'bone', bone: 'mandible', label: 'mandible' }));

  // ---------------- chest ----------------
  add(ell('heart', 'chest', v(0.018, 1.29, 0.006), v(0.05, 0.06, 0.045), { kind: 'heart', bleed: 90, external: 0.25, label: 'heart' }));
  add(tube('aortic arch', 'chest', v(0.008, 1.32, 0.0), v(0.0, 1.385, -0.03), 0.014, { kind: 'artery', bleed: 120, external: 0.15, label: 'aortic arch' }));
  add(tube('thoracic aorta', 'chest', v(0.0, 1.385, -0.045), v(0.01, 1.2, -0.06), 0.012, { kind: 'artery', bleed: 110, external: 0.12, label: 'descending aorta' }));
  add(ell('lung L', 'chest', v(0.068, 1.33, -0.035), v(0.058, 0.105, 0.058), { kind: 'lung', bleed: 4.5, external: 0.25, label: 'left lung', side: 'L' }), true);
  add(tube('subclavian artery L', 'chest', v(0.02, 1.43, 0.004), v(0.16, 1.44, -0.022), 0.006, { kind: 'artery', bleed: 22, external: 0.45, label: 'left subclavian artery', side: 'L' }), true);
  add(tube('thoracic cord', 'chest', v(0, 1.47, -0.068), v(0, 1.2, -0.082), 0.012, { kind: 'cord', level: 'T6', label: 'thoracic spinal cord' }));
  add(tube('thoracic vertebrae', 'chest', v(0, 1.47, -0.045), v(0, 1.2, -0.058), 0.018, { kind: 'bone', bone: 'thoracic vertebrae', label: 'thoracic vertebrae', nearCord: 'T6' }));
  add(tube('clavicle L', 'chest', v(0.02, 1.45, 0.014), v(0.165, 1.463, -0.018), 0.008, { kind: 'bone', bone: 'clavicle', label: 'left clavicle', side: 'L' }), true);
  add(tube('scapula L', 'chest', v(0.05, 1.42, -0.1), v(0.12, 1.33, -0.095), 0.02, { kind: 'bone', bone: 'scapula', label: 'left scapula', side: 'L' }), true);

  // ---------------- abdomen ----------------
  add(ell('liver', 'abdomen', v(-0.055, 1.142, 0.0), v(0.085, 0.055, 0.065), { kind: 'organ', bleed: 12, external: 0.2, label: 'liver' }));
  add(ell('spleen', 'abdomen', v(0.078, 1.158, -0.045), v(0.033, 0.045, 0.03), { kind: 'organ', bleed: 9, external: 0.2, label: 'spleen' }));
  add(ell('kidney L', 'abdomen', v(0.056, 1.09, -0.066), v(0.025, 0.05, 0.022), { kind: 'organ', bleed: 6, external: 0.25, label: 'left kidney', side: 'L' }), true);
  add(ell('stomach', 'abdomen', v(0.035, 1.15, 0.022), v(0.05, 0.04, 0.04), { kind: 'gut', bleed: 2, external: 0.3, label: 'stomach' }));
  add(ell('intestines', 'abdomen', v(0, 1.07, 0.022), v(0.1, 0.05, 0.06), { kind: 'gut', bleed: 1.8, external: 0.35, label: 'small intestine' }));
  add(tube('abdominal aorta', 'abdomen', v(0.01, 1.2, -0.055), v(0.006, 1.03, -0.042), 0.011, { kind: 'artery', bleed: 100, external: 0.1, label: 'abdominal aorta' }));
  add(tube('vena cava', 'abdomen', v(-0.018, 1.2, -0.05), v(-0.016, 1.03, -0.04), 0.012, { kind: 'vein', bleed: 45, external: 0.1, label: 'inferior vena cava' }));
  add(tube('lumbar cord', 'abdomen', v(0, 1.2, -0.082), v(0, 1.03, -0.075), 0.013, { kind: 'cord', level: 'L1', label: 'lumbar spinal cord' }));
  add(tube('lumbar vertebrae', 'abdomen', v(0, 1.2, -0.056), v(0, 1.03, -0.05), 0.022, { kind: 'bone', bone: 'lumbar vertebrae', label: 'lumbar vertebrae', nearCord: 'L1' }));

  // ---------------- pelvis ----------------
  add(ell('lower intestine', 'pelvis', v(0, 0.985, 0.025), v(0.095, 0.045, 0.055), { kind: 'gut', bleed: 1.5, external: 0.35, label: 'large intestine' }));
  add(ell('bladder', 'pelvis', v(0, 0.905, 0.04), v(0.034, 0.03, 0.03), { kind: 'gut', bleed: 1.5, external: 0.35, label: 'bladder' }));
  add(tube('iliac artery L', 'pelvis', v(0.008, 1.03, -0.04), v(0.072, 0.93, 0.02), 0.0085, { kind: 'artery', bleed: 35, external: 0.2, label: 'left iliac artery', side: 'L' }), true);
  add(ell('ilium L', 'pelvis', v(0.098, 0.975, -0.025), v(0.042, 0.06, 0.07), { kind: 'bone', bone: 'pelvis', label: 'pelvis (ilium)', side: 'L' }), true);
  add(ell('sacrum', 'pelvis', v(0, 0.95, -0.085), v(0.042, 0.06, 0.022), { kind: 'bone', bone: 'pelvis', label: 'sacrum', nearCord: 'S1' }));

  // ---------------- arm (left) ----------------
  const Sh = landmark('shoulderL'), El = landmark('elbowL'), Wr = landmark('wristL');
  const u = new Vec3().subVectors(El, Sh).normalize();
  const fo = new Vec3().subVectors(Wr, El).normalize();
  add(tube('humerus L', 'upperArmL', Sh.clone().addScaled(u, 0.02), El.clone().addScaled(u, -0.01), 0.012, { kind: 'bone', bone: 'humerus', long: true, label: 'left humerus', side: 'L' }), true);
  add(tube('brachial artery L', 'upperArmL', Sh.clone().addScaled(u, 0.07).add(v(-0.026, 0, 0.012)), El.clone().addScaled(u, -0.02).add(v(-0.016, 0, 0.022)), 0.0045, { kind: 'artery', bleed: 9, external: 0.85, label: 'left brachial artery', side: 'L' }), true);
  add(tube('radius/ulna L', 'forearmL', El.clone().addScaled(fo, 0.015), Wr.clone().addScaled(fo, -0.01), 0.013, { kind: 'bone', bone: 'radius/ulna', long: true, label: 'left forearm bones', side: 'L' }), true);
  add(tube('radial artery L', 'forearmL', El.clone().addScaled(fo, 0.06).add(v(0, 0, 0.018)), Wr.clone().addScaled(fo, -0.01).add(v(-0.006, 0, 0.016)), 0.0032, { kind: 'artery', bleed: 3.5, external: 0.95, label: 'left radial artery', side: 'L' }), true);
  add(tube('ulnar artery L', 'forearmL', El.clone().addScaled(fo, 0.06).add(v(-0.012, 0, -0.006)), Wr.clone().addScaled(fo, -0.01).add(v(-0.008, 0, -0.012)), 0.003, { kind: 'artery', bleed: 3, external: 0.95, label: 'left ulnar artery', side: 'L' }), true);
  add(ell('hand bones L', 'handL', Wr.clone().addScaled(fo, 0.05), v(0.012, 0.04, 0.035), { kind: 'bone', bone: 'hand bones', label: 'left hand bones', side: 'L' }), true);

  // ---------------- leg (left) ----------------
  const Hp = landmark('hipL'), Kn = landmark('kneeL'), An = landmark('ankleL');
  const td = new Vec3().subVectors(Kn, Hp).normalize();
  const sd = new Vec3().subVectors(An, Kn).normalize();
  add(tube('femur L', 'thighL', Hp.clone().addScaled(td, 0.03), Kn.clone().addScaled(td, -0.015), 0.0145, { kind: 'bone', bone: 'femur', long: true, label: 'left femur', side: 'L' }), true);
  add(tube('femoral artery L', 'thighL', v(0.072, 0.9, 0.04), v(0.078, 0.62, 0.006), 0.006, { kind: 'artery', bleed: 20, external: 0.85, label: 'left femoral artery', side: 'L' }), true);
  add(tube('femoral vein L', 'thighL', v(0.058, 0.9, 0.034), v(0.072, 0.62, 0.0), 0.0065, { kind: 'vein', bleed: 9, external: 0.85, label: 'left femoral vein', side: 'L' }), true);
  add(tube('popliteal artery L', 'thighL', v(0.08, 0.62, 0.0), v(0.094, 0.5, -0.03), 0.0055, { kind: 'artery', bleed: 13, external: 0.85, label: 'left popliteal artery', side: 'L' }), true);
  add(tube('tibia L', 'shinL', Kn.clone().addScaled(sd, 0.02).add(v(-0.006, 0, 0.012)), An.clone().addScaled(sd, -0.015).add(v(-0.006, 0, 0.01)), 0.013, { kind: 'bone', bone: 'tibia', long: true, label: 'left tibia', side: 'L' }), true);
  add(tube('tibial arteries L', 'shinL', v(0.1, 0.47, -0.02), v(0.1, 0.12, -0.03), 0.0035, { kind: 'artery', bleed: 3, external: 0.9, label: 'left tibial arteries', side: 'L' }), true);
  add(ell('foot bones L', 'footL', v(0.106, 0.035, 0.04), v(0.03, 0.022, 0.09), { kind: 'bone', bone: 'foot bones', label: 'left foot bones', side: 'L' }), true);
  return S;
}

/** Long-bone axes per segment (bind pose) used for fractures. */
export function boneAxis(segName) {
  const side = segName.slice(-1);
  const map = {
    upperArm: ['shoulder', 'elbow'],
    forearm: ['elbow', 'wrist'],
    thigh: ['hip', 'knee'],
    shin: ['knee', 'ankle'],
  };
  const key = segName.slice(0, -1);
  const m = map[key];
  if (!m) return null;
  return { a: landmark(m[0] + side), b: landmark(m[1] + side) };
}

// ------------------------------------------------------------------------------------------------
// Geometry helpers (segment = path of a wound channel in bind coordinates)

const _d = new Vec3(), _e = new Vec3(), _w = new Vec3();

/** Closest distance between segment [p,q] and segment [a,b]. */
export function segSegDistance(p, q, a, b) {
  _d.subVectors(q, p);
  _e.subVectors(b, a);
  _w.subVectors(p, a);
  const A = _d.dot(_d), B = _d.dot(_e), C = _e.dot(_e), D = _d.dot(_w), E = _e.dot(_w);
  const den = A * C - B * B;
  let s, t;
  if (den < 1e-12) {
    s = 0;
    t = C > 1e-12 ? E / C : 0;
  } else {
    s = (B * E - C * D) / den;
    t = (A * E - B * D) / den;
  }
  s = Math.min(Math.max(s, 0), 1);
  t = C > 1e-12 ? Math.min(Math.max((B * s + E) / C, 0), 1) : 0;
  s = A > 1e-12 ? Math.min(Math.max((B * t - D) / A, 0), 1) : 0;
  const dx = p.x + _d.x * s - (a.x + _e.x * t);
  const dy = p.y + _d.y * s - (a.y + _e.y * t);
  const dz = p.z + _d.z * s - (a.z + _e.z * t);
  return { dist: Math.sqrt(dx * dx + dy * dy + dz * dz), s, t };
}

/** Approximate signed distance of a point to an axis-aligned ellipsoid. */
export function ellipsoidDistance(p, c, r) {
  const ax = (p.x - c.x) / r.x, ay = (p.y - c.y) / r.y, az = (p.z - c.z) / r.z;
  const k0 = Math.sqrt(ax * ax + ay * ay + az * az);
  const bx = ax / r.x, by = ay / r.y, bz = az / r.z;
  const k1 = Math.sqrt(bx * bx + by * by + bz * bz);
  if (k1 < 1e-12) return -Math.min(r.x, r.y, r.z);
  return (k0 * (k0 - 1)) / k1;
}

/**
 * Distance from a path segment to a structure's surface (negative = path passes through it) and
 * the parameter along the path of closest approach.
 */
export function pathToStructure(p, q, s) {
  if (s.type === 'tube') {
    const r = segSegDistance(p, q, s.a, s.b);
    return { dist: r.dist - s.r, at: r.s, along: r.t };
  }
  // ellipsoid: sample the path
  let best = Infinity, at = 0;
  const N = 24;
  const pt = new Vec3();
  for (let i = 0; i <= N; i++) {
    pt.lerpVectors(p, q, i / N);
    const d = ellipsoidDistance(pt, s.c, s.r);
    if (d < best) {
      best = d;
      at = i / N;
    }
  }
  return { dist: best, at, along: 0 };
}
