import * as THREE from 'three';
import { mergeGeometries } from 'three/addons/utils/BufferGeometryUtils.js';
import { RAMP_CHAR, toon } from '../render/Toon';
import { Ring, SkinBuilder, WeightFn, headGeometry, limbWeights, rigid, spikeHair, torsoWeights } from './Body';
import { FACE_GOJO, FACE_SUKUNA, FaceSet, FaceStyle } from './Face';
import { CharModel, handMats } from './Model';
import { BoneName, ExtraBone, PROP_GOJO, Proportions, Rig, scaleProps } from './Rig';

const R = (y: number, rx: number, rzF: number, rzB = rzF, pw = 2, cz = 0): Ring => ({ y, rx, rzF, rzB, pw, cz });
const smooth = (a: number, b: number, x: number) => {
  const t = Math.min(1, Math.max(0, (x - a) / (b - a)));
  return t * t * (3 - 2 * t);
};

/** Scales a ring list's heights and radii. */
function scaleRings(rings: Ring[], ky: number, kr: number, dy = 0): Ring[] {
  return rings.map((r) => ({ ...r, y: r.y * ky + dy, rx: r.rx * kr, rzF: r.rzF * kr, rzB: r.rzB * kr, cx: (r.cx ?? 0) * kr }));
}

/** Gojo's frame, used (scaled) for every body. */
const TORSO: Ring[] = [
  R(0.86, 0.135, 0.095, 0.1),
  R(0.93, 0.158, 0.1, 0.112),
  R(1.0, 0.165, 0.102, 0.115),
  R(1.08, 0.152, 0.098, 0.1),
  R(1.17, 0.152, 0.102, 0.098),
  R(1.27, 0.168, 0.112, 0.102),
  R(1.36, 0.182, 0.12, 0.108),
  R(1.43, 0.194, 0.113, 0.104, 2.2),
  R(1.475, 0.19, 0.1, 0.096, 2.3),
  R(1.505, 0.162, 0.086, 0.086, 2.2),
  R(1.53, 0.116, 0.07, 0.072),
  R(1.555, 0.07, 0.058, 0.062),
  R(1.62, 0.052, 0.05, 0.052),
  R(1.69, 0.048, 0.046, 0.048),
];
const ARM: Ring[] = [
  R(1.546, 0.022, 0.024),
  R(1.536, 0.044, 0.046, 0.048),
  R(1.517, 0.057, 0.057, 0.06),
  R(1.488, 0.062, 0.06, 0.062),
  R(1.42, 0.06, 0.058, 0.06),
  R(1.3, 0.054, 0.052, 0.054),
  R(1.2, 0.05, 0.05),
  R(1.1, 0.052, 0.052),
  R(1.0, 0.048, 0.048),
  R(0.945, 0.05, 0.05),
  R(0.93, 0.03, 0.03),
];
const LEG: Ring[] = [
  R(1.0, 0.085, 0.09, 0.095),
  R(0.9, 0.09, 0.095, 0.1),
  R(0.76, 0.084, 0.086, 0.09),
  R(0.62, 0.074, 0.076, 0.078),
  R(0.52, 0.068, 0.07, 0.07),
  R(0.4, 0.07, 0.07, 0.072),
  R(0.26, 0.066, 0.066, 0.066),
  R(0.14, 0.067, 0.068, 0.066),
  R(0.1, 0.067, 0.068, 0.066),
];

function armWeights(side: 'L' | 'R', J: Rig['joints']): WeightFn {
  return limbWeights(('clav' + side) as BoneName, ('uArm' + side) as BoneName, ('fArm' + side) as BoneName, ('hand' + side) as BoneName, J.uArmL.y, J.fArmL.y, J.handL.y);
}
function legWeights(side: 'L' | 'R', J: Rig['joints']): WeightFn {
  return limbWeights('hips', ('thigh' + side) as BoneName, ('shin' + side) as BoneName, ('foot' + side) as BoneName, J.thighL.y, J.shinL.y, J.footL.y, 0.06);
}

/** Coat hems and kimono skirts: the hips carry them, the thighs swing them. */
function skirtWeights(topY: number, depth: number, extra?: (p: THREE.Vector3) => [BoneName, number][] | null): WeightFn {
  return (p) => {
    const d = smooth(topY, topY - depth, p.y);
    const side = p.x >= 0 ? 'L' : 'R';
    const lat = smooth(0.0, 0.1, Math.abs(p.x));
    const front = smooth(-0.05, 0.08, p.z);
    const t = d * (0.25 + 0.35 * lat + 0.25 * front);
    const ex = extra?.(p);
    if (ex) return [['hips', (1 - t) * 0.5], [('thigh' + side) as BoneName, t * 0.5], ...ex.map(([b, v]) => [b, v * 0.5] as [BoneName, number])];
    return [
      ['hips', 1 - t],
      [('thigh' + side) as BoneName, t],
    ];
  };
}

/** Front surface depth of a ring stack at (x, y), for laying bands on the cloth. */
function frontZ(rings: Ring[], x: number, y: number) {
  let a = rings[0];
  let b = rings[rings.length - 1];
  for (let i = 0; i < rings.length - 1; i++) {
    const r0 = rings[i];
    const r1 = rings[i + 1];
    if ((y - r0.y) * (y - r1.y) <= 0) {
      a = r0;
      b = r1;
      break;
    }
  }
  const t = Math.abs(b.y - a.y) < 1e-6 ? 0 : (y - a.y) / (b.y - a.y);
  const rx = a.rx + (b.rx - a.rx) * t;
  const rz = a.rzF + (b.rzF - a.rzF) * t;
  const pw = (a.pw ?? 2) + ((b.pw ?? 2) - (a.pw ?? 2)) * t;
  const u = Math.min(1, Math.abs(x) / rx);
  return { z: rz * Math.pow(Math.max(0, 1 - Math.pow(u, pw)), 1 / pw), rx, rz };
}

/** A flat band laid along a path over the front of a ring stack (kimono collars). */
function ribbon(rings: Ring[], path: [number, number][], width: number, lift: number) {
  const pts = path.map(([x, y]) => {
    const f = frontZ(rings, x, y);
    const n = new THREE.Vector3(x / (f.rx * f.rx), 0, f.z / (f.rz * f.rz)).normalize();
    return { p: new THREE.Vector3(x, y, f.z).addScaledVector(n, lift), n };
  });
  const pos: number[] = [];
  const idx: number[] = [];
  pts.forEach((q, i) => {
    const a = pts[Math.max(0, i - 1)].p;
    const b = pts[Math.min(pts.length - 1, i + 1)].p;
    const tan = b.clone().sub(a).normalize();
    const side = new THREE.Vector3().crossVectors(tan, q.n).normalize().multiplyScalar(width / 2);
    pos.push(q.p.x + side.x, q.p.y + side.y, q.p.z + side.z, q.p.x - side.x, q.p.y - side.y, q.p.z - side.z);
    if (i > 0) {
      const k = i * 2;
      idx.push(k - 2, k - 1, k, k - 1, k + 1, k);
    }
  });
  const g = new THREE.BufferGeometry();
  g.setAttribute('position', new THREE.Float32BufferAttribute(pos, 3));
  g.setIndex(idx);
  return g;
}

function shoeGeo(len: number, w: number, h: number) {
  const g = new THREE.SphereGeometry(1, 16, 10);
  g.scale(w / 2, h / 2, len / 2);
  const p = g.getAttribute('position') as THREE.BufferAttribute;
  // flat sole
  for (let i = 0; i < p.count; i++) if (p.getY(i) < -h * 0.18) p.setY(i, -h * 0.18 - (p.getY(i) + h * 0.18) * 0.1);
  g.computeVertexNormals();
  return g;
}

function earGeo(r: number) {
  const g = new THREE.SphereGeometry(r, 10, 8);
  g.scale(0.45, 1.25, 0.8);
  return g;
}

function headParts(model: CharModel, rig: Rig, style: FaceStyle, hp: { r: number; h: number; d: number; chin: number; jaw: number; flat?: number }, headLift: number) {
  const headAt = rig.joints.head.clone().add(new THREE.Vector3(0, headLift, 0.012));
  const faces = new FaceSet(style, { r: hp.r, h: hp.h, chin: hp.chin });
  model.setHead(headGeometry(hp), faces, headAt);
  const earMat = toon(new THREE.Color(style.skin).getHex(), { rim: 0.25 });
  for (const s of [-1, 1]) model.attach('head', earGeo(hp.r * 0.3), earMat, headAt.clone().add(new THREE.Vector3(s * hp.r * 0.96, -hp.h * 0.08, -hp.d * 0.12)), false);
  return headAt;
}

// ------------------------------------------------------------------ Gojo
const NAVY = 0x1c2031;
const NAVY_D = 0x141725;

export function buildGojo(): CharModel {
  const rig = new Rig(PROP_GOJO);
  const J = rig.joints;
  const model = new CharModel(rig, 2.4);
  const sb = new SkinBuilder(rig);
  const cloth = () => NAVY;
  sb.tube(TORSO, torsoWeights(rig), cloth, { seg: 20, capStart: true, capEnd: true });
  for (const [side, m] of [
    ['L', false],
    ['R', true],
  ] as ['L' | 'R', boolean][]) {
    sb.tube(
      ARM.map((r) => ({ ...r, cx: J.uArmL.x, cz: -0.02 })),
      armWeights(side, J),
      (p) => (p.y < 0.96 ? NAVY_D : NAVY),
      { seg: 14, capStart: true, capEnd: true, mirrorX: m },
    );
    sb.tube(
      LEG.map((r) => ({ ...r, cx: J.thighL.x })),
      legWeights(side, J),
      cloth,
      { seg: 14, capStart: true, capEnd: true, mirrorX: m },
    );
  }
  // high collar
  sb.tube([R(1.47, 0.1, 0.1, 0.1), R(1.52, 0.086, 0.086, 0.088), R(1.6, 0.075, 0.074, 0.077), R(1.665, 0.08, 0.079, 0.082)], (p) => (p.y < 1.53 ? [['chest', 1]] : [['neck', 0.7], ['chest', 0.3]]), () => NAVY_D, { seg: 18 });
  // jacket hem over the hips
  sb.tube([R(1.06, 0.168, 0.11, 0.118), R(0.96, 0.18, 0.118, 0.128), R(0.84, 0.19, 0.126, 0.138)], skirtWeights(1.04, 0.22), cloth, { seg: 22 });
  const bodyMat = toon(0xffffff, { vertexColors: true, rim: 0.55, rimColor: 0x8fb4ff, ramp: RAMP_CHAR, backShade: 0.6 });
  bodyMat.side = THREE.DoubleSide;
  model.setBody(sb.build(), bodyMat);

  // head, ears, hair
  const hp = { r: 0.088, h: 0.112, d: 0.1, chin: 0.036, jaw: 0.42, flat: 0.15 };
  const headAt = headParts(model, rig, FACE_GOJO, hp, 0.115);
  const hairMat = toon(0xf4f6fa, { rim: 0.6, rimColor: 0xbfe0ff });
  const hair = spikeHair({
    rx: 0.099,
    ry: 0.1,
    rz: 0.107,
    cy: 0.034,
    cz: -0.01,
    count: 64,
    len: [0.06, 0.135],
    width: [0.024, 0.04],
    seed: 1207,
    allow: (n) => !(n.z > 0.4 && n.y < 0.6) && n.y > -0.2,
    flow: (n, r) => new THREE.Vector3(n.x * 1.05 + (r() - 0.5) * 0.5, 0.75 + n.y * 0.6, n.z * 0.55 - 0.3 + (r() - 0.5) * 0.35),
  });
  model.attach('head', hair, hairMat, headAt.clone(), true);
  // strands falling over the forehead
  const bangs = spikeHair({
    rx: 0.094,
    ry: 0.096,
    rz: 0.104,
    cy: 0.036,
    cz: -0.004,
    count: 9,
    len: [0.045, 0.085],
    width: [0.016, 0.026],
    seed: 77,
    allow: (n) => n.z > 0.45 && n.y > 0.35 && n.y < 0.8 && Math.abs(n.x) < 0.5,
    flow: (n, r) => new THREE.Vector3(n.x * 0.6 + (r() - 0.5) * 0.3, -0.8, 0.45),
  });
  model.attach('head', bangs, hairMat, headAt.clone(), true);
  // shoes
  const shoeMat = toon(0x15161c, { rim: 0.4 });
  for (const s of [-1, 1]) {
    const f = s > 0 ? 'footL' : 'footR';
    model.attach(f, shoeGeo(0.27, 0.105, 0.1), shoeMat, new THREE.Vector3(s * J.footL.x, 0.05, 0.045));
  }
  model.setHands(handMats(0xf0d6c4, 0xdcb8a4, 0xe9cfc4), 1.06);
  return model;
}

// ------------------------------------------------------------------ Sukuna in Megumi's body
const KIMONO = 0xefebe2;
const OBI = 0x17161c;
const HAKAMA = 0x1e1d24;
const SKIN_M = 0xefd2bd;
const INK = 0x0e0c12;

export const PROP_MEGUMI: Proportions = scaleProps(PROP_GOJO, 0.92);

export function buildSukuna(): CharModel {
  const rig = new Rig(PROP_MEGUMI);
  const J = rig.joints;
  const k = 0.92;
  const model = new CharModel(rig, 2.4);
  const sb = new SkinBuilder(rig);
  const torso = scaleRings(TORSO, k, 0.93);
  // the obi bulges at the waist
  for (const r of torso) {
    if (r.y > 0.9 && r.y < 1.08) {
      r.rx += 0.012;
      r.rzF += 0.012;
      r.rzB += 0.012;
    }
  }
  const vneck = (p: THREE.Vector3) => p.z > 0 && p.y > 1.2 && Math.abs(p.x) < (p.y - 1.2) * 0.27;
  sb.tube(torso, torsoWeights(rig), (p) => (p.y > 0.9 && p.y < 1.06 ? OBI : vneck(p) || p.y > 1.42 ? SKIN_M : KIMONO), { seg: 28, capStart: true, capEnd: true });
  for (const [side, m] of [
    ['L', false],
    ['R', true],
  ] as ['L' | 'R', boolean][]) {
    // upper arm in the kimono, the sleeve belling out toward the wrist, bare wrist with two black bands
    const arm = scaleRings(ARM, k, 0.95).map((r) => ({ ...r, cx: J.uArmL.x, cz: -0.02 }));
    const wy = J.handL.y;
    const ey = J.fArmL.y;
    const bell: Ring[] = [
      arm[0],
      arm[1],
      arm[2],
      arm[3],
      arm[4],
      arm[5],
      { ...arm[6], rx: 0.058, rzF: 0.06, rzB: 0.07 },
      { ...arm[6], y: ey - 0.08, rx: 0.068, rzF: 0.068, rzB: 0.085 },
      { ...arm[6], y: wy + 0.07, rx: 0.08, rzF: 0.078, rzB: 0.11 },
      { ...arm[6], y: wy + 0.05, rx: 0.081, rzF: 0.079, rzB: 0.112 },
    ];
    sb.tube(bell, armWeights(side, J), () => KIMONO, { seg: 16, capStart: true, mirrorX: m });
    // forearm skin under the sleeve
    const fore: Ring[] = [R(ey - 0.02, 0.04, 0.04), R(wy + 0.07, 0.036, 0.036), R(wy + 0.01, 0.031, 0.031), R(wy - 0.01, 0.022, 0.022)].map((r) => ({ ...r, cx: J.uArmL.x, cz: -0.02 }));
    sb.tube(fore, armWeights(side, J), (p) => (Math.abs(p.y - (wy + 0.045)) < 0.008 || Math.abs(p.y - (wy + 0.022)) < 0.007 ? INK : SKIN_M), { seg: 12, capEnd: true, mirrorX: m });
    // wide hakama legs
    const leg = scaleRings(LEG, k, 1.12).map((r) => ({ ...r, cx: J.thighL.x }));
    sb.tube(leg, legWeights(side, J), () => HAKAMA, { seg: 14, capStart: true, capEnd: true, mirrorX: m });
  }
  // kimono skirt to the knee
  sb.tube(
    [R(1.0 * k, 0.165, 0.112, 0.122), R(0.86 * k, 0.185, 0.13, 0.14), R(0.7 * k, 0.205, 0.15, 0.16), R(0.56 * k, 0.215, 0.165, 0.17)],
    skirtWeights(0.98 * k, 0.45),
    (p) => (p.z > 0.1 && Math.abs(p.x) < 0.03 ? 0xd9d4ca : KIMONO),
    { seg: 26 },
  );
  // kimono collar (eri): left panel over right, the top band running on down to the obi
  const bandA: [number, number][] = [[0.06, 1.425], [0.052, 1.4], [0.04, 1.35], [0.024, 1.29], [0.006, 1.235], [-0.016, 1.18], [-0.042, 1.125], [-0.066, 1.075], [-0.08, 1.05]];
  const bandB: [number, number][] = [[-0.06, 1.425], [-0.052, 1.4], [-0.04, 1.35], [-0.024, 1.29], [-0.008, 1.24], [0.004, 1.215]];
  sb.geo(ribbon(torso, bandB, 0.024, 0.004), new THREE.Matrix4(), INK, torsoWeights(rig));
  sb.geo(ribbon(torso, bandA, 0.026, 0.008), new THREE.Matrix4(), INK, torsoWeights(rig));
  // the panel edge under the top band, a fold line down the skirt
  sb.geo(ribbon(torso, [[0.006, 1.21], [-0.03, 1.13], [-0.07, 1.06]], 0.004, 0.009), new THREE.Matrix4(), 0xbdb7ac, torsoWeights(rig));
  // obi knot at the back
  sb.geo(new THREE.BoxGeometry(0.16, 0.09, 0.06), new THREE.Matrix4().makeTranslation(0, 0.93, -0.13), OBI, rigid('hips'));
  const bodyMat = toon(0xffffff, { vertexColors: true, rim: 0.5, rimColor: 0xffd8d0, ramp: RAMP_CHAR, backShade: 0.7 });
  bodyMat.side = THREE.DoubleSide;
  model.setBody(sb.build(), bodyMat);

  const hp = { r: 0.084, h: 0.106, d: 0.096, chin: 0.034, jaw: 0.46, flat: 0.15 };
  const headAt = headParts(model, rig, FACE_SUKUNA, hp, 0.106);
  const hair = spikeHair({
    rx: 0.097,
    ry: 0.1,
    rz: 0.104,
    cy: 0.036,
    cz: -0.012,
    count: 64,
    len: [0.05, 0.13],
    width: [0.02, 0.034],
    seed: 2412,
    allow: (n) => !(n.z > 0.5 && n.y < 0.35) && n.y > -0.3,
    flow: (n, r) => new THREE.Vector3(n.x * 1.1 + (r() - 0.5) * 0.6, 0.55 + n.y * 0.8 + r() * 0.3, n.z * 0.7 - 0.2 + (r() - 0.5) * 0.5),
  });
  model.attach('head', hair, toon(0x1a1822, { rim: 0.7, rimColor: 0x6a7bb0 }), headAt.clone(), true);
  // tabi and zori
  const tabi = toon(0xf0ede6, { rim: 0.3 });
  const zori = toon(0x2a2420);
  for (const s of [-1, 1]) {
    const f = s > 0 ? 'footL' : 'footR';
    model.attach(f, shoeGeo(0.24, 0.09, 0.085), tabi, new THREE.Vector3(s * J.footL.x, 0.05, 0.04));
    model.attach(f, new THREE.BoxGeometry(0.1, 0.022, 0.27), zori, new THREE.Vector3(s * J.footL.x, 0.011, 0.04), false);
  }
  model.setHands(handMats(0xedcbb3, 0xd6ad96, 0x0c0a0b), 1.0);
  return model;
}

// ------------------------------------------------------------------ Mahoraga
const MAHO_SKIN = 0xd9d5cc;
const MAHO_SKIRT = 0x1b1820;
const MAHO_GOLD = 0xb79a52;

export function buildMahoraga(): { model: CharModel; wheel: THREE.Group; sword: THREE.Mesh } {
  const s = 2.55;
  const p = scaleProps(PROP_GOJO, s);
  // heroic build: broader shoulders
  p.shoulderX *= 1.18;
  p.hipX *= 1.1;
  const extras: ExtraBone[] = [{ name: 'wheel', parent: 'head', at: new THREE.Vector3(0, p.head + 0.75, -0.05) }];
  const rig = new Rig(p, extras);
  const J = rig.joints;
  const model = new CharModel(rig, 2.8);
  const sb = new SkinBuilder(rig);
  const torso = scaleRings(TORSO, s, s * 1.12).map((r) => (r.y > 1.25 * s ? { ...r, rx: r.rx * 1.12, rzF: r.rzF * 1.1 } : r));
  sb.tube(torso, torsoWeights(rig), (pp) => (pp.y < 1.06 * s ? MAHO_SKIRT : MAHO_SKIN), { seg: 22, capStart: true, capEnd: true });
  for (const [side, m] of [
    ['L', false],
    ['R', true],
  ] as ['L' | 'R', boolean][]) {
    // bulging biceps and forearms
    const arm = scaleRings(ARM, s, s * 1.35).map((r, i) => ({ ...r, cx: J.uArmL.x, cz: -0.02 * s, rx: r.rx * (i === 4 || i === 7 ? 1.15 : 1) }));
    sb.tube(arm, armWeights(side, J), () => MAHO_SKIN, { seg: 14, capStart: true, capEnd: true, mirrorX: m });
    const leg = scaleRings(LEG, s, s * 1.2).map((r) => ({ ...r, cx: J.thighL.x }));
    sb.tube(leg, legWeights(side, J), (pp) => (pp.y > 0.56 * s ? MAHO_SKIRT : MAHO_SKIN), { seg: 14, capStart: true, capEnd: true, mirrorX: m });
  }
  // the hakama-like skirt and a thick rope belt
  sb.tube(
    [R(1.06 * s, 0.17 * s, 0.115 * s, 0.125 * s), R(0.9 * s, 0.2 * s, 0.14 * s, 0.15 * s), R(0.7 * s, 0.22 * s, 0.16 * s, 0.17 * s), R(0.56 * s, 0.225 * s, 0.17 * s, 0.175 * s)],
    skirtWeights(1.04 * s, 0.5 * s),
    () => MAHO_SKIRT,
    { seg: 24 },
  );
  // a thick twisted rope for a belt, its knot hanging at the front
  const rope = new THREE.TorusGeometry(1, 0.11, 8, 40);
  {
    const pa = rope.getAttribute('position') as THREE.BufferAttribute;
    const v = new THREE.Vector3();
    for (let i = 0; i < pa.count; i++) {
      v.fromBufferAttribute(pa, i);
      const a = Math.atan2(v.y, v.x);
      // the strands twist around the ring
      const tw = 1 + 0.18 * Math.sin(a * 22 + Math.atan2(v.z, Math.hypot(v.x, v.y) - 1) * 2);
      const rr = Math.hypot(v.x, v.y);
      const off = (rr - 1) * tw;
      pa.setXYZ(i, Math.cos(a) * (1 + off), Math.sin(a) * (1 + off), v.z * tw);
    }
    rope.computeVertexNormals();
  }
  const ropeM = new THREE.Matrix4().compose(new THREE.Vector3(0, 1.075 * s, 0.004 * s), new THREE.Quaternion().setFromEuler(new THREE.Euler(Math.PI / 2, 0, 0)), new THREE.Vector3(0.178 * s, 0.135 * s, 0.11 * s));
  sb.geo(rope, ropeM, 0xe9e3d6, rigid('hips'));
  for (const sd of [-1, 1]) {
    const tail = new THREE.CylinderGeometry(0.016 * s, 0.01 * s, 0.26 * s, 8);
    sb.geo(tail, new THREE.Matrix4().compose(new THREE.Vector3(sd * 0.035 * s, 0.95 * s, 0.15 * s), new THREE.Quaternion().setFromEuler(new THREE.Euler(0.12, 0, sd * 0.12)), new THREE.Vector3(1, 1, 1)), 0xe9e3d6, rigid('hips'));
  }
  sb.geo(new THREE.SphereGeometry(0.04 * s, 12, 10), new THREE.Matrix4().makeTranslation(0, 1.07 * s, 0.15 * s), 0xe9e3d6, rigid('hips'));

  // musculature: pecs, abdominals, deltoids, traps, lats, biceps, forearms, calves
  const ell = (a: number, b: number, c: number) => new THREE.SphereGeometry(1, 18, 12).scale(a * s, b * s, c * s);
  const onFront = (x: number, y: number, sink: number) => new THREE.Vector3(x * s, y * s, frontZ(torso, x * s, y * s).z - sink * s);
  const rot = (x: number, y: number, z: number) => new THREE.Quaternion().setFromEuler(new THREE.Euler(x, y, z));
  const at = (p: THREE.Vector3, q = new THREE.Quaternion()) => new THREE.Matrix4().compose(p, q, new THREE.Vector3(1, 1, 1));
  for (const sd of [-1, 1]) {
    const side = sd > 0 ? 'L' : 'R';
    // pectorals: two heavy plates over the ribcage
    sb.geo(ell(0.1, 0.064, 0.03), at(onFront(sd * 0.074, 1.37, 0.016), rot(0.22, sd * 0.3, sd * -0.1)), MAHO_SKIN, rigid('chest'));
    // abdominals, three rows
    for (let r = 0; r < 3; r++) sb.geo(ell(0.032, 0.03, 0.011), at(onFront(sd * 0.032, 1.255 - r * 0.066, 0.006), rot(0.05, sd * 0.2, 0)), MAHO_SKIN, rigid(r === 0 ? 'chest' : 'spine'));
    // obliques
    sb.geo(ell(0.03, 0.08, 0.04), at(onFront(sd * 0.12, 1.16, 0.035), rot(0, sd * 0.5, sd * 0.12)), MAHO_SKIN, rigid('spine'));
    // trapezius: the slope from neck to shoulder
    sb.geo(ell(0.09, 0.05, 0.06), at(new THREE.Vector3(sd * 0.085 * s, 1.5 * s, -0.025 * s), rot(0, 0, sd * -0.42)), MAHO_SKIN, rigid('chest'));
    // lats flaring under the arms
    sb.geo(ell(0.05, 0.13, 0.07), at(new THREE.Vector3(sd * 0.165 * s, 1.3 * s, -0.04 * s), rot(0, 0, sd * 0.18)), MAHO_SKIN, rigid('chest'));
    // deltoid caps
    const sh = J[('uArm' + side) as BoneName];
    sb.geo(ell(0.074, 0.088, 0.076), at(new THREE.Vector3(sh.x + sd * 0.02 * s, sh.y - 0.035 * s, sh.z - 0.004 * s)), MAHO_SKIN, rigid(('uArm' + side) as BoneName));
    // biceps and triceps
    const el = J[('fArm' + side) as BoneName];
    const mid = (sh.y + el.y) / 2;
    sb.geo(ell(0.05, 0.1, 0.052), at(new THREE.Vector3(sh.x, mid, sh.z + 0.032 * s)), MAHO_SKIN, rigid(('uArm' + side) as BoneName));
    sb.geo(ell(0.048, 0.11, 0.05), at(new THREE.Vector3(sh.x + sd * 0.006 * s, mid + 0.02 * s, sh.z - 0.03 * s)), MAHO_SKIN, rigid(('uArm' + side) as BoneName));
    // forearm mass just below the elbow
    const wr = J[('hand' + side) as BoneName];
    sb.geo(ell(0.054, 0.1, 0.05), at(new THREE.Vector3(el.x + sd * 0.008 * s, el.y - (el.y - wr.y) * 0.3, el.z + 0.012 * s)), MAHO_SKIN, rigid(('fArm' + side) as BoneName));
    // calves
    const kn = J[('shin' + side) as BoneName];
    const an = J[('foot' + side) as BoneName];
    sb.geo(ell(0.055, 0.11, 0.06), at(new THREE.Vector3(kn.x, kn.y - (kn.y - an.y) * 0.3, kn.z - 0.03 * s)), MAHO_SKIN, rigid(('shin' + side) as BoneName));
  }
  // thick neck
  sb.tube([R(1.5 * s, 0.075 * s, 0.07 * s, 0.075 * s), R(1.6 * s, 0.07 * s, 0.065 * s, 0.07 * s), R(1.7 * s, 0.062 * s, 0.06 * s, 0.062 * s)], (pp) => (pp.y < 1.56 * s ? [['chest', 1]] : [['neck', 0.8], ['chest', 0.2]]), () => MAHO_SKIN, { seg: 16 });
  const bodyMat = toon(0xffffff, { vertexColors: true, rim: 0.45, ramp: RAMP_CHAR, backShade: 0.6 });
  bodyMat.side = THREE.DoubleSide;
  model.setBody(sb.build(), bodyMat);

  // head: no eyes, two pairs of feathered wings where they'd be
  const hp = { r: 0.078 * s, h: 0.1 * s, d: 0.094 * s, chin: 0.03 * s, jaw: 0.3, flat: 0.12 };
  const style: FaceStyle = { ...FACE_GOJO, skin: '#dcd8cf', skinShade: '#b9b3a8', eyeW: 0.0001, eyeH: 0.0001, glow: 0, lips: '#7a6a62', brow: '#dcd8cf', lash: '#dcd8cf', lashEdge: '#dcd8cf' };
  const headAt = headParts(model, rig, style, hp, 0.1 * s);
  const wingMat = toon(0xefebe3, { rim: 0.55, rimColor: 0xffffff, backShade: 0.5 });
  const wingGeo = (len: number, n: number) => {
    const parts: THREE.BufferGeometry[] = [];
    for (let i = 0; i < n; i++) {
      const L = len * (1 - i * 0.16);
      // a long flat feather, rooted at the origin, pointing along +X
      const f = new THREE.SphereGeometry(1, 14, 8).scale(L / 2, 0.022 * s * (1 - i * 0.1), 0.006 * s);
      f.translate(L / 2, 0, 0);
      f.rotateZ(0.28 - i * 0.2);
      f.translate(0, -i * 0.006 * s, -i * 0.004 * s);
      parts.push(f);
    }
    return mergeGeometries(parts, false)!;
  };
  for (const sd of [-1, 1])
    for (let k2 = 0; k2 < 2; k2++) {
      const g = wingGeo((k2 === 0 ? 0.25 : 0.19) * s, 3);
      if (sd < 0) g.scale(-1, 1, 1);
      const at2 = headAt.clone().add(new THREE.Vector3(sd * hp.r * 0.62, (0.004 - k2 * 0.032) * s, hp.d * 0.62));
      // swept back past the temples, the upper pair higher
      model.attach('head', g, wingMat, at2, true, new THREE.Euler(0, sd * (0.62 + k2 * 0.1), sd * (k2 === 0 ? 0.32 : -0.08)));
    }
  // a short crest of hair-like fins
  const crest = spikeHair({ rx: 0.084 * s, ry: 0.088 * s, rz: 0.094 * s, cy: 0.028 * s, cz: -0.01 * s, count: 9, len: [0.035 * s, 0.07 * s], width: [0.018 * s, 0.026 * s], seed: 99, allow: (n) => n.y > 0.55 && n.z < 0.25, flow: (n) => new THREE.Vector3(n.x * 0.5, 1, -0.7) });
  model.attach('head', crest, toon(0xcfcac0, { rim: 0.4 }), headAt.clone(), true);

  // the Dharma wheel
  const wheel = new THREE.Group();
  const gold = toon(MAHO_GOLD, { rim: 0.6, rimColor: 0xfff0c0, emissive: 0x3a2a08 });
  const R0 = 0.42 * s * 0.5;
  const rim = new THREE.Mesh(new THREE.TorusGeometry(R0, 0.022 * s, 8, 40), gold);
  wheel.add(rim);
  const hub = new THREE.Mesh(new THREE.CylinderGeometry(0.05 * s, 0.05 * s, 0.04 * s, 16).rotateX(Math.PI / 2), gold);
  wheel.add(hub);
  for (let i = 0; i < 8; i++) {
    const a = (i / 8) * Math.PI * 2;
    const spoke = new THREE.Mesh(new THREE.CylinderGeometry(0.009 * s, 0.009 * s, R0 * 2.3, 6), gold);
    spoke.rotation.z = a;
    spoke.position.set(0, 0, 0);
    if (i < 4) wheel.add(spoke);
    const knob = new THREE.Mesh(new THREE.SphereGeometry(0.024 * s, 10, 8), gold);
    knob.position.set(Math.cos(a) * R0 * 1.18, Math.sin(a) * R0 * 1.18, 0);
    wheel.add(knob);
  }
  for (const m of wheel.children) (m as THREE.Mesh).castShadow = true;
  const wb = rig.bones.wheel;
  wb.add(wheel);
  // the Sword of Extermination along the right forearm
  const blade = new THREE.Shape();
  const L = 1.05 * s;
  blade.moveTo(0, -0.02 * s);
  blade.lineTo(L * 0.9, -0.03 * s);
  blade.lineTo(L, 0);
  blade.lineTo(L * 0.9, 0.035 * s);
  blade.lineTo(0, 0.03 * s);
  blade.closePath();
  const bg = new THREE.ExtrudeGeometry(blade, { depth: 0.012 * s, bevelEnabled: true, bevelThickness: 0.006 * s, bevelSize: 0.006 * s, bevelSegments: 1 });
  bg.translate(0, 0, -0.006 * s);
  // along -Y (down the hanging forearm) and out past the hand
  bg.rotateZ(-Math.PI / 2);
  const swordMat = toon(0xd8dde4, { rim: 0.8, rimColor: 0xffffff });
  const sword = model.attach('fArmR', bg, swordMat, new THREE.Vector3(-J.fArmL.x - 0.07 * s, J.fArmL.y - 0.05 * s, -0.03 * s), true);
  model.setHands(handMats(0xd9d5cc, 0xbdb7ad, 0xa8a196), s * 1.05);
  return { model, wheel, sword };
}
