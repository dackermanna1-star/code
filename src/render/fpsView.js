import * as THREE from 'three';
import { makeRoundCone, roundCone, coneT, ellipsoid, roundBox, smin, smax, meshSDF, makeFrame, toFrame, createMeleeModel, BOOT } from './meleeModels.js';

/**
 * First-person viewmodel: gloved hands, sleeves, the gun (or a melee item / the boot), drawn in
 * their own pass over the world (own scene, camera at the origin looking down -Z, FOV 56) so
 * nothing pokes into walls.
 *
 * Hands: an anatomical signed-distance model (palm with thenar / hypothenar pads, metacarpal
 * heads, three phalanges per finger, the thumb, a tactical glove with a moulded knuckle guard,
 * leather palm and a neoprene cuff), meshed once with surface nets, decimated (~13.5k triangles)
 * and skinned to 17 bones (forearm, hand, 3 per digit). Fingers are closed round each grip by a
 * contact solver (every joint bends until its phalanx touches the grip's shape) and the index
 * is solved onto the trigger. Sleeves follow a two-bone arm IK from fixed shoulders.
 *
 * API
 *  new FpsView(objectMeshesModule, aspect); setEnvironment(env); setAspect(a); setLighting(level, tint)
 *  setWeapon(type)  'pistol' | 'revolver' | 'shotgun' | 'smg' | 'rifle' | 'sniper' | 'knife' | 'bat' | 'fists'
 *  fire(recoil, adsAmount); pump(); muzzleCameraSpace(out); render(renderer); visible
 *  update(dt, s): s = { ads 0..1, sprint, speed, step, onGround, crouch 0..1, look {dx, dy},
 *    landed, state 'idle'|'reload'|'equip'|'holster'|'pump', stateT, reloadTime, perShell,
 *    empty? (magazine empty: slide locked, charging on reload), pitch? (view pitch, rad; places
 *    the boot's physical strike point), melee? null | { move, phase 'windup'|'charge'|'strike'|
 *    'recover', t (s in phase), charge 0..1, hit } }
 *  MELEE_MOVES[move] = { item, windup, strike, recover (s), hitWindow [from, to] (fractions of
 *    the strike), charge? (s to full charge), reach (m, a guide) }
 *  meleeCameraSpace(out, worldFov?) the striking point (knife tip, bat sweet spot, knuckles,
 *    boot sole) in view-camera space; meleeImpact(strength) the strike connected (hit-stop,
 *    recoil, slowed follow-through); scopeAmount() 0..1 eye into the sniper scope (at 1 the
 *    viewmodel is not drawn: the host draws its scope overlay and zoom).
 */

const DEG = Math.PI / 180;
const clamp = (x, a, b) => (x < a ? a : x > b ? b : x);
const lerp = (a, b, t) => a + (b - a) * t;
const smooth01 = (t) => {
  t = clamp(t, 0, 1);
  return t * t * (3 - 2 * t);
};
const smoothstep = (a, b, x) => smooth01((x - a) / (b - a));

// =============================================================================================
// HAND ANATOMY (right hand; the left one is its mirror image)
// Hand frame: origin at the wrist joint, +Z distal (towards the knuckles), +Y dorsal (back of
// the hand), +X radial (thumb side). Metres. A glove adds ~1.5 mm everywhere.
// =============================================================================================
const HAND = {
  fingers: [
    // MCP joint centre, phalanx lengths (MCP-PIP, PIP-DIP, DIP-tip centre), radii at MCP, PIP, DIP, tip
    { mcp: [0.032, 0.0, 0.094], len: [0.044, 0.025, 0.0165], r: [0.0103, 0.0095, 0.0087, 0.0079] },
    { mcp: [0.011, 0.002, 0.099], len: [0.048, 0.029, 0.0175], r: [0.0106, 0.0098, 0.0089, 0.0081] },
    { mcp: [-0.0105, 0.0, 0.094], len: [0.045, 0.027, 0.0165], r: [0.0101, 0.0093, 0.0085, 0.0077] },
    { mcp: [-0.0295, -0.003, 0.084], len: [0.035, 0.0205, 0.0155], r: [0.0091, 0.0084, 0.0077, 0.007] },
  ],
  // thumb: CMC joint, metacarpal rest direction (radial / palmar / distal), the nail side, lengths, radii
  thumb: { cmc: [0.019, -0.009, 0.024], dir: [0.539, -0.342, 0.77], up: [0.72, 0.69, 0.0], len: [0.044, 0.031, 0.0185], r: [0.0135, 0.0118, 0.0106, 0.009] },
};
/**
 * A hand pose is 21 numbers (degrees): per finger (index, middle, ring, little) [MCP flexion,
 * MCP abduction (+ towards the thumb), PIP flexion, DIP flexion]; then the thumb [CMC flexion
 * (across the palm), CMC abduction (away from the palm), CMC roll, MCP flexion, IP flexion].
 */
const POSE_N = 21;
const REST_POSE = [12, 5, 18, 10, 12, 1, 18, 10, 12, -4, 18, 10, 12, -10, 18, 10, 0, 0, 0, 12, 10];

const _fq = new THREE.Quaternion(), _fq2 = new THREE.Quaternion(), _fv = new THREE.Vector3();
const AX = new THREE.Vector3(1, 0, 0), AY = new THREE.Vector3(0, 1, 0), AZ = new THREE.Vector3(0, 0, 1);
const THUMB_Q0 = (() => {
  const z = new THREE.Vector3(...HAND.thumb.dir).normalize();
  const y = new THREE.Vector3(...HAND.thumb.up);
  y.addScaledVector(z, -y.dot(z)).normalize();
  const x = new THREE.Vector3().crossVectors(y, z);
  return new THREE.Quaternion().setFromRotationMatrix(new THREE.Matrix4().makeBasis(x, y, z));
})();

/** Local rotation of digit d's segment k (right hand) for pose p (degrees) into `out`. */
function segmentQuat(p, d, k, out) {
  if (d < 4) {
    const o = d * 4;
    if (k === 0) {
      out.setFromAxisAngle(AY, p[o + 1] * DEG);
      return out.multiply(_fq2.setFromAxisAngle(AX, p[o] * DEG));
    }
    return out.setFromAxisAngle(AX, p[o + 1 + k] * DEG);
  }
  if (k === 0) {
    out.copy(THUMB_Q0);
    out.multiply(_fq2.setFromAxisAngle(AY, p[17] * DEG));
    out.multiply(_fq2.setFromAxisAngle(AX, p[16] * DEG));
    return out.multiply(_fq2.setFromAxisAngle(AZ, p[18] * DEG));
  }
  return out.setFromAxisAngle(AX, p[18 + k] * DEG);
}
function digitBase(d) {
  return d < 4 ? HAND.fingers[d].mcp : HAND.thumb.cmc;
}
function digitLen(d) {
  return d < 4 ? HAND.fingers[d].len : HAND.thumb.len;
}
function digitR(d) {
  return d < 4 ? HAND.fingers[d].r : HAND.thumb.r;
}

/**
 * Forward kinematics in the (right) hand frame: for each digit, 4 joint points (base, 2 joints,
 * tip centre) and 3 segment orientations. out = { pts: Float64Array(5*4*3), q: Quaternion[15] }.
 */
function handFK(p, out) {
  for (let d = 0; d < 5; d++) {
    const base = digitBase(d), len = digitLen(d);
    let x = base[0], y = base[1], z = base[2];
    _fq.identity();
    out.pts[d * 12] = x;
    out.pts[d * 12 + 1] = y;
    out.pts[d * 12 + 2] = z;
    for (let k = 0; k < 3; k++) {
      _fq.multiply(segmentQuat(p, d, k, out.q[d * 3 + k]));
      out.q[d * 3 + k].copy(_fq);
      _fv.set(0, 0, len[k]).applyQuaternion(_fq);
      x += _fv.x;
      y += _fv.y;
      z += _fv.z;
      out.pts[d * 12 + (k + 1) * 3] = x;
      out.pts[d * 12 + (k + 1) * 3 + 1] = y;
      out.pts[d * 12 + (k + 1) * 3 + 2] = z;
    }
  }
  return out;
}
function makeFK() {
  return { pts: new Float64Array(60), q: Array.from({ length: 15 }, () => new THREE.Quaternion()) };
}

// ---------------------------------------------------------------------------------------------
// The glove as a signed distance field (rest pose). Bones: 0 forearm, 1 hand, 2.. digits
// (index 2-4, middle 5-7, ring 8-10, little 11-13, thumb 14-16). Regions: 0 fabric, 1 leather
// (palm / finger fronts / tips), 2 rubber (knuckle guards), 3 neoprene cuff.
// ---------------------------------------------------------------------------------------------
const NB = 17;
const PARENT = [-1, -1, 1, 2, 3, 1, 5, 6, 1, 8, 9, 1, 11, 12, 1, 14, 15];

function buildGloveSDF() {
  const fk = handFK(REST_POSE, makeFK());
  const P = (d, j) => [fk.pts[d * 12 + j * 3], fk.pts[d * 12 + j * 3 + 1], fk.pts[d * 12 + j * 3 + 2]];
  // --- palm (bone 1)
  const metas = [
    makeRoundCone([0.017, 0.001, 0.016], [0.032, 0.0, 0.094], 0.011, 0.0118),
    makeRoundCone([0.005, 0.002, 0.014], [0.011, 0.002, 0.099], 0.011, 0.012),
    makeRoundCone([-0.006, 0.001, 0.016], [-0.0105, 0.0, 0.094], 0.011, 0.0114),
    makeRoundCone([-0.016, 0.0, 0.02], [-0.0295, -0.003, 0.084], 0.011, 0.0104),
  ];
  const slabF = makeFrame([0.002, -0.0015, 0.054], [1, 0, 0.08], [0, 1, 0]);
  const thenar = makeRoundCone([0.017, -0.011, 0.018], [0.036, -0.019, 0.05], 0.0148, 0.0118);
  const hypo = makeRoundCone([-0.019, -0.008, 0.02], [-0.029, -0.008, 0.07], 0.0128, 0.0102);
  const distalPad = makeRoundCone([0.031, -0.0075, 0.091], [-0.027, -0.0095, 0.08], 0.0094, 0.0084);
  const webs = [];
  for (let d = 0; d < 3; d++) {
    const a = P(d, 0), b = P(d + 1, 0), a1 = P(d, 1), b1 = P(d + 1, 1);
    const m0 = [(a[0] + b[0]) / 2, (a[1] + b[1]) / 2 - 0.005, (a[2] + b[2]) / 2 + 0.002];
    const m1 = [(a[0] + b[0]) * 0.36 + (a1[0] + b1[0]) * 0.14, (a[1] + b[1]) * 0.36 + (a1[1] + b1[1]) * 0.14 - 0.005, (a[2] + b[2]) * 0.36 + (a1[2] + b1[2]) * 0.14];
    webs.push(makeRoundCone(m0, m1, 0.0068, 0.0052));
  }
  const thumbWeb = makeRoundCone([0.027, -0.004, 0.06], P(4, 1), 0.0072, 0.0075);
  // --- knuckle guard (rubber): one moulded plate over the MCP heads, a low dome on each knuckle
  const guardBar = makeRoundCone([0.03, 0.0098, 0.084], [-0.026, 0.0068, 0.074], 0.0052, 0.0047);
  const domes = HAND.fingers.map((f, d) => makeFrame([f.mcp[0], f.mcp[1] + 0.0102 - (d === 3 ? 0.001 : 0), f.mcp[2] - 0.0035], [1, 0, 0.05 * (1.5 - d)], [0, 1, 0]));
  const domeR = [[0.0118, 0.0049, 0.0106], [0.012, 0.005, 0.0108], [0.0116, 0.0048, 0.0104], [0.0104, 0.0044, 0.0096]];
  const guardC = [0.0015, 0.009, 0.083], guardRad = 0.05;
  // --- digits
  const segs = [];
  for (let d = 0; d < 5; d++) {
    const r = digitR(d);
    for (let k = 0; k < 3; k++) segs.push(makeRoundCone(P(d, k), P(d, k + 1), r[k], r[k + 1]));
  }
  // pads over the PIP knuckles (on the proximal phalanges) for the four fingers
  const pipPads = [];
  for (let d = 0; d < 4; d++) {
    const a = P(d, 1), b = P(d, 0);
    const q = fk.q[d * 3];
    const up = new THREE.Vector3(0, 1, 0).applyQuaternion(q);
    const ax = new THREE.Vector3(1, 0, 0).applyQuaternion(q);
    const r = digitR(d)[1];
    const c = [lerp(b[0], a[0], 0.72) + up.x * r * 0.86, lerp(b[1], a[1], 0.72) + up.y * r * 0.86, lerp(b[2], a[2], 0.72) + up.z * r * 0.86];
    pipPads.push({ f: makeFrame(c, ax.toArray(), up.toArray()), rr: [r * 0.74, 0.0031, 0.0092] });
  }
  // bounding spheres of each digit (for culling: smin with an operand further than k is a plain min)
  const digitBS = [];
  for (let d = 0; d < 5; d++) {
    const a = P(d, 0), b = P(d, 3);
    const c = [(a[0] + b[0]) / 2, (a[1] + b[1]) / 2, (a[2] + b[2]) / 2];
    let rad = 0;
    for (let j = 0; j < 4; j++) rad = Math.max(rad, Math.hypot(P(d, j)[0] - c[0], P(d, j)[1] - c[1], P(d, j)[2] - c[2]));
    digitBS.push([c[0], c[1], c[2], rad + digitR(d)[0] + 0.004]);
  }
  // --- wrist (scaled round cone: flatter dorso-palmar) and the neoprene cuff
  const wrist = makeRoundCone([0.0, 0.0, 0.03], [0.0, 0.0, -0.03], 0.029, 0.0285);
  const WS = 1.42; // y scale of the wrist section
  const cuffR = 0.0326, cuffS = 1.3, cuffZ0 = -0.084, cuffZ1 = -0.0035;
  const strapF = makeFrame([-0.006, 0.026, -0.03], [1, -0.18, 0], [0.18, 1, 0]);
  const _l = [0, 0, 0];

  const palmD = (x, y, z) => {
    let d = roundCone(metas[0], x, y, z);
    d = smin(d, roundCone(metas[1], x, y, z), 0.016);
    d = smin(d, roundCone(metas[2], x, y, z), 0.016);
    d = smin(d, roundCone(metas[3], x, y, z), 0.016);
    toFrame(slabF, x, y, z, _l);
    d = smin(d, roundBox(_l[0], _l[1], _l[2], 0.026, 0.0088, 0.034, 0.008), 0.012);
    d = smin(d, roundCone(thenar, x, y, z), 0.013);
    d = smin(d, roundCone(hypo, x, y, z), 0.012);
    d = smin(d, roundCone(distalPad, x, y, z), 0.008);
    // palm hollow
    const hx = x - 0.004, hy = y + 0.036, hz = z - 0.056;
    d = smax(d, 0.022 - Math.sqrt(hx * hx + hy * hy + hz * hz), 0.012);
    return d;
  };
  const wristD = (x, y, z) => roundCone(wrist, x, y * WS, z) / WS;
  const cuffD = (x, y, z) => {
    if (z > 0.012) return z - 0.002;
    const rad = Math.sqrt(x * x + y * cuffS * y * cuffS) / cuffS - (cuffR - 0.003) / cuffS;
    const ax = Math.abs(z - (cuffZ0 + cuffZ1) / 2) - ((cuffZ1 - cuffZ0) / 2 - 0.003);
    const dd = Math.min(Math.max(rad, ax), 0) + Math.hypot(Math.max(rad, 0), Math.max(ax, 0)) - 0.003;
    toFrame(strapF, x, y, z, _l);
    const strap = roundBox(_l[0], _l[1], _l[2], 0.0125, 0.0022, 0.019, 0.0016);
    return Math.min(dd, strap);
  };
  const guardD = (x, y, z) => {
    const gx = x - guardC[0], gy = y - guardC[1], gz = z - guardC[2];
    const far = Math.sqrt(gx * gx + gy * gy + gz * gz) - guardRad;
    if (far > 0.004) return far;
    let d = roundCone(guardBar, x, y, z);
    for (let i = 0; i < 4; i++) {
      toFrame(domes[i], x, y, z, _l);
      d = smin(d, ellipsoid(_l[0], _l[1], _l[2], domeR[i][0], domeR[i][1], domeR[i][2]), 0.0065);
    }
    return d;
  };
  const digitD = (d, x, y, z) => {
    const s = segs[d * 3];
    let v = roundCone(s, x, y, z);
    v = smin(v, roundCone(segs[d * 3 + 1], x, y, z), 0.0025);
    v = smin(v, roundCone(segs[d * 3 + 2], x, y, z), 0.0025);
    return v;
  };
  const padD = (i, x, y, z) => {
    toFrame(pipPads[i].f, x, y, z, _l);
    const rr = pipPads[i].rr;
    return ellipsoid(_l[0], _l[1], _l[2], rr[0], rr[1], rr[2]);
  };

  const digitFar = (d, x, y, z) => {
    const s = digitBS[d];
    return Math.sqrt((x - s[0]) ** 2 + (y - s[1]) ** 2 + (z - s[2]) ** 2) - s[3];
  };
  const f = (x, y, z) => {
    let hand = palmD(x, y, z);
    hand = smin(hand, wristD(x, y, z), 0.014);
    for (let i = 0; i < 3; i++) hand = smin(hand, roundCone(webs[i], x, y, z), 0.006);
    for (let d = 0; d < 4; d++) {
      if (digitFar(d, x, y, z) > hand + 0.0065) continue;
      hand = smin(hand, Math.min(digitD(d, x, y, z), padD(d, x, y, z) + 0.0004), 0.0065);
    }
    if (digitFar(4, x, y, z) < hand + 0.011) hand = smin(hand, digitD(4, x, y, z), 0.011);
    hand = smin(hand, roundCone(thumbWeb, x, y, z), 0.01);
    hand = smin(hand, guardD(x, y, z), 0.0025);
    return Math.min(hand, cuffD(x, y, z));
  };

  /** Skinning and material attributes for a surface point (rest pose) with normal n. */
  const bd = new Float64Array(NB), pd = new Float64Array(4);
  const attrs = (x, y, z, nx, ny, nz, outW, outR) => {
    // distance to each bone's own geometry
    for (let d = 0; d < 4; d++) pd[d] = padD(d, x, y, z);
    const cd = cuffD(x, y, z), wd = wristD(x, y, z), gd = guardD(x, y, z);
    bd[0] = Math.min(cd, z < -0.004 ? wd : 1e9);
    bd[1] = Math.min(palmD(x, y, z), gd, z > -0.002 ? wd + Math.max(0, -z) * 0.6 : 1e9);
    for (let d = 0; d < 5; d++) for (let k = 0; k < 3; k++) bd[2 + d * 3 + k] = roundCone(segs[d * 3 + k], x, y, z) - (k === 0 && d < 4 ? 0.0012 : 0);
    for (let d = 0; d < 4; d++) bd[2 + d * 3] = Math.min(bd[2 + d * 3], pd[d]);
    // primary bone and its neighbours in the hierarchy
    let prim = 0;
    for (let b = 1; b < NB; b++) if (bd[b] < bd[prim]) prim = b;
    const sig = prim <= 1 ? 0.0055 : 0.0032;
    let sum = 0;
    for (let b = 0; b < NB; b++) {
      const near = b === prim || PARENT[b] === prim || PARENT[prim] === b || (prim === 1 && b === 0) || (prim === 0 && b === 1);
      // the thumb's thenar mass follows the metacarpal half way
      outW[b] = near ? Math.exp(-Math.max(0, bd[b] - bd[prim]) / sig) : 0;
      sum += outW[b];
    }
    for (let b = 0; b < NB; b++) outW[b] /= sum;
    // regions
    outR[0] = 1;
    outR[1] = outR[2] = outR[3] = 0;
    if (gd < 0.0008 || Math.min(pd[0], pd[1], pd[2], pd[3]) < 0.0009) {
      outR[0] = 0;
      outR[2] = 1;
      return;
    }
    if (z < -0.0015 || cd < 0.0006) {
      outR[0] = 0;
      outR[3] = 1;
      return;
    }
    // leather on the palmar side (by the normal in the owning segment's frame) and the fingertips
    let palmar;
    if (prim >= 2) {
      const d = ((prim - 2) / 3) | 0, k = (prim - 2) % 3;
      _fv.set(nx, ny, nz).applyQuaternion(_fq.copy(fk.q[d * 3 + k]).invert());
      palmar = -_fv.y;
      if (d === 4) palmar = -_fv.y * 0.8 - _fv.x * 0.6; // thumb: inner side faces the index
      const t = coneT(segs[d * 3 + k], x, y, z);
      if (k === 2 && t > 0.42) palmar = Math.max(palmar, smoothstep(0.42, 0.55, t) * 2 - 1);
    } else {
      palmar = -ny * 1.2 - 0.25;
      if (x > 0.02 && z < 0.07) palmar = Math.max(palmar, -nx * 0.4 - ny * 1.1 - 0.15); // thenar wraps
    }
    const lw = smoothstep(-0.12, 0.12, palmar);
    outR[0] = 1 - lw;
    outR[1] = lw;
  };
  return { f, attrs, bounds: { min: [-0.052, -0.07, -0.09], max: [0.084, 0.032, 0.2] } };
}

/** Rest-pose glove geometry (cached) with skin indices / weights and region weights. */
let _gloveGeo = null;
function gloveGeometry() {
  if (_gloveGeo) return _gloveGeo;
  const sdf = buildGloveSDF();
  const m = meshSDF(sdf.f, sdf.bounds, 0.0022, { targetTris: 13500 });
  const nv = m.positions.length / 3;
  const skinIndex = new Uint16Array(nv * 4), skinWeight = new Float32Array(nv * 4), region = new Float32Array(nv * 4);
  const w = new Float64Array(NB), r = [0, 0, 0, 0], top = [0, 0, 0, 0];
  for (let v = 0; v < nv; v++) {
    const x = m.positions[v * 3], y = m.positions[v * 3 + 1], z = m.positions[v * 3 + 2];
    sdf.attrs(x, y, z, m.normals[v * 3], m.normals[v * 3 + 1], m.normals[v * 3 + 2], w, r);
    // four strongest influences
    let s = 0;
    for (let k = 0; k < 4; k++) {
      let best = -1;
      for (let b = 0; b < NB; b++) if (best < 0 || w[b] > w[best]) best = b;
      top[k] = best;
      s += w[best];
      w[best] = -w[best] - 1; // taken (restored below)
    }
    for (let k = 0; k < 4; k++) {
      const wb = -w[top[k]] - 1;
      skinIndex[v * 4 + k] = top[k];
      skinWeight[v * 4 + k] = wb / s;
    }
    top.fill(0);
    region.set(r, v * 4);
  }
  const g = new THREE.BufferGeometry();
  g.setAttribute('position', new THREE.BufferAttribute(m.positions, 3));
  g.setAttribute('normal', new THREE.BufferAttribute(m.normals, 3));
  g.setAttribute('skinIndex', new THREE.BufferAttribute(skinIndex, 4));
  g.setAttribute('skinWeight', new THREE.BufferAttribute(skinWeight, 4));
  g.setAttribute('aRegion', new THREE.BufferAttribute(region, 4));
  g.setIndex(new THREE.BufferAttribute(m.indices, 1));
  g.computeBoundingSphere();
  _gloveGeo = g;
  return g;
}
/** Mirror a geometry across x = 0 (left hand from the right one). */
function mirrorGeometry(src) {
  const g = src.clone();
  const p = g.attributes.position, n = g.attributes.normal;
  for (let i = 0; i < p.count; i++) {
    p.setX(i, -p.getX(i));
    n.setX(i, -n.getX(i));
  }
  const idx = g.index.array;
  for (let i = 0; i < idx.length; i += 3) {
    const t = idx[i + 1];
    idx[i + 1] = idx[i + 2];
    idx[i + 2] = t;
  }
  g.index.needsUpdate = true;
  g.computeBoundingSphere();
  return g;
}

// =============================================================================================
// SLEEVE: a cloth tube from the cuff over the forearm and elbow to the shoulder, skinned to the
// forearm (bone 0, frame at the wrist, +Z towards the hand) and upper arm (bone 1, at the elbow).
// =============================================================================================
const ARM = { fore: 0.27, upper: 0.29 };
/**
 * A cloth tube along -Z from s0 to s1 (bone 0 frame at s = 0, bone 1 at s = joint, a smooth
 * blend across the joint), cross-section radii from prof(s, angle) -> [rx, ry]. The s0 end
 * hugs what goes into it (a glove cuff, a boot); the s1 end is capped.
 */
function tubeGeometry({ s0, s1, joint, prof, band = 0.012, NA = 44, NL = 84 }) {
  const pos = [], nrm = [], si = [], sw = [], idx = [], reg = [];
  const ring = (s) => {
    const out = [];
    for (let i = 0; i < NA; i++) {
      const a = (i / NA) * Math.PI * 2;
      const [rx, ry] = prof(s, a);
      out.push([Math.cos(a) * rx, Math.sin(a) * ry]);
    }
    return out;
  };
  const sAt = (j) => s0 + (s1 - s0) * Math.pow(j / NL, 1.35);
  for (let j = 0; j <= NL; j++) {
    const s = sAt(j), r = ring(s), rP = ring(s - 0.001), rN = ring(s + 0.001);
    const we = smoothstep(joint - 0.035, joint + 0.035, s);
    const cuffBand = 1 - smoothstep(s0 + band * 0.75, s0 + band * 1.1, s);
    for (let i = 0; i < NA; i++) {
      const [x, y] = r[i];
      pos.push(x, y, -s);
      // normal: cross of the tangent around and the tangent along
      const a = r[(i + 1) % NA], b = r[(i + NA - 1) % NA];
      const tx = a[0] - b[0], ty = a[1] - b[1];
      const lx = rN[i][0] - rP[i][0], ly = rN[i][1] - rP[i][1], lz = -0.002;
      let nx = ty * lz, ny = -tx * lz, nz = tx * ly - ty * lx;
      const l = Math.hypot(nx, ny, nz) || 1;
      nx /= l;
      ny /= l;
      nz /= l;
      if (nx * x + ny * y < 0) {
        nx = -nx;
        ny = -ny;
        nz = -nz;
      }
      nrm.push(nx, ny, nz);
      si.push(0, 1, 0, 0);
      sw.push(1 - we, we, 0, 0);
      reg.push(1 - cuffBand, 0, 0, cuffBand);
    }
  }
  for (let j = 0; j < NL; j++) {
    for (let i = 0; i < NA; i++) {
      const a = j * NA + i, b = j * NA + ((i + 1) % NA), c = a + NA, d = b + NA;
      idx.push(a, c, b, b, c, d);
    }
  }
  const capC = pos.length / 3;
  pos.push(0, 0, -s1 - 0.01);
  nrm.push(0, 0, -1);
  si.push(0, 1, 0, 0);
  sw.push(0, 1, 0, 0);
  reg.push(1, 0, 0, 0);
  for (let i = 0; i < NA; i++) idx.push(NL * NA + i, capC, NL * NA + ((i + 1) % NA));
  const g = new THREE.BufferGeometry();
  g.setAttribute('position', new THREE.Float32BufferAttribute(pos, 3));
  g.setAttribute('normal', new THREE.Float32BufferAttribute(nrm, 3));
  g.setAttribute('skinIndex', new THREE.Uint16BufferAttribute(si, 4));
  g.setAttribute('skinWeight', new THREE.Float32BufferAttribute(sw, 4));
  g.setAttribute('aRegion', new THREE.Float32BufferAttribute(reg, 4));
  g.setIndex(idx);
  g.computeBoundingSphere();
  return g;
}
let _sleeveGeo = null;
function sleeveGeometry() {
  if (_sleeveGeo) return _sleeveGeo;
  const s0 = 0.05, s1 = ARM.fore + ARM.upper + 0.03; // along the arm from the wrist
  // radii (x = across the forearm, radio-ulnar; y = dorso-palmar) along s
  const prof = (s, a) => {
    const t = smoothstep(s0, 0.11, s), te = smoothstep(ARM.fore - 0.08, ARM.fore + 0.04, s);
    const rx = lerp(0.0352, 0.0395, t) + 0.0055 * te + 0.004 * smoothstep(ARM.fore, s1, s);
    const ry = lerp(0.0292, 0.0335, t) + 0.009 * te + 0.006 * smoothstep(ARM.fore, s1, s);
    // hem at the cuff end, bunched folds above it, folds at the elbow
    const hem = Math.exp(-(((s - s0 - 0.004) / 0.0045) ** 2)) * 0.0028;
    const bunch = smoothstep(0.06, 0.075, s) * (1 - smoothstep(0.14, 0.2, s));
    const fold = 0.0022 * bunch * Math.sin(s * 150 + 1.3 * Math.sin(a * 2 + s * 40)) * (0.6 + 0.4 * Math.sin(a * 3 + 1));
    const ef = 0.0024 * Math.exp(-(((s - ARM.fore) / 0.05) ** 2)) * Math.sin(s * 120 + a * 2) * (0.5 + 0.5 * Math.cos(a));
    const k = 1 + (hem + fold + ef) / 0.035;
    return [rx * k, ry * k];
  };
  _sleeveGeo = tubeGeometry({ s0, s1, joint: ARM.fore, prof });
  return _sleeveGeo;
}
// =============================================================================================
// MATERIALS: cloth / leather / rubber / neoprene with procedural micro-relief (triplanar on the
// rest-pose position, so it sticks to the skinned surface) faded out before it can alias.
// =============================================================================================
const DETAIL_VERT_PARS = /* glsl */ `
attribute vec4 aRegion;
varying vec4 vRegion;
varying vec3 vRest;
varying vec3 vRestN;
`;
const DETAIL_VERT = /* glsl */ `
vRegion = aRegion;
vRest = position;
vRestN = normal;
`;
const DETAIL_FRAG_PARS = /* glsl */ `
varying vec4 vRegion;
varying vec3 vRest;
varying vec3 vRestN;
uniform vec3 uRegionCol[4];
uniform vec4 uRegionRough;
uniform float uWeave;
float vmHash(vec3 p) { p = fract(p * 0.3183099 + 0.1); p *= 17.0; return fract(p.x * p.y * p.z * (p.x + p.y + p.z)); }
float vmNoise(vec3 x) {
  vec3 i = floor(x); vec3 f = fract(x); f = f * f * (3.0 - 2.0 * f);
  return mix(mix(mix(vmHash(i), vmHash(i + vec3(1,0,0)), f.x), mix(vmHash(i + vec3(0,1,0)), vmHash(i + vec3(1,1,0)), f.x), f.y),
             mix(mix(vmHash(i + vec3(0,0,1)), vmHash(i + vec3(1,0,1)), f.x), mix(vmHash(i + vec3(0,1,1)), vmHash(i + vec3(1,1,1)), f.x), f.y), f.z);
}
float vmWeave(vec2 u, float per) {
  vec2 c = u / per;
  float a = sin(c.x * 6.2832) * 0.5 + 0.5, b = sin(c.y * 6.2832) * 0.5 + 0.5;
  float row = step(0.5, fract(c.y * 0.5));
  return mix(a * (0.6 + 0.4 * b), b * (0.6 + 0.4 * a), row);
}
float vmHeight(vec3 p, vec3 n, vec4 r, float fade) {
  vec3 w = pow(abs(n), vec3(4.0)); w /= (w.x + w.y + w.z);
  float per = uWeave;
  float weave = vmWeave(p.yz, per) * w.x + vmWeave(p.xz, per) * w.y + vmWeave(p.xy, per) * w.z;
  float grain = vmNoise(p * 1400.0);
  float knit = vmWeave((p.xz + p.yz) * 1.0, per * 0.55);
  float macro = vmNoise(p * 160.0);
  float h = r.x * (weave * 0.8 + macro * 0.5) + r.y * (grain * 0.55 + macro * 0.3) + r.z * (grain * 0.12 + macro * 0.12) + r.w * (knit * 0.6 + macro * 0.3);
  return h * fade;
}
vec3 vmPerturb(vec3 surf_pos, vec3 surf_norm, vec2 dHdxy, float faceDirection) {
  vec3 vSigmaX = normalize(dFdx(surf_pos));
  vec3 vSigmaY = normalize(dFdy(surf_pos));
  vec3 R1 = cross(vSigmaY, surf_norm);
  vec3 R2 = cross(surf_norm, vSigmaX);
  float fDet = dot(vSigmaX, R1) * faceDirection;
  vec3 vGrad = sign(fDet) * (dHdxy.x * R1 + dHdxy.y * R2);
  return normalize(abs(fDet) * surf_norm - vGrad);
}
`;
function detailMaterial({ colors, rough, weave = 0.0011, sheen = 0.5, sheenColor = 0xb8b0a0 }) {
  const m = new THREE.MeshPhysicalMaterial({ color: 0xffffff, roughness: 1, metalness: 0, sheen, sheenRoughness: 0.55, sheenColor });
  const uniforms = {
    uRegionCol: { value: colors.map((c) => new THREE.Color(c)) },
    uRegionRough: { value: new THREE.Vector4(...rough) },
    uWeave: { value: weave },
  };
  m.userData.uniforms = uniforms;
  m.onBeforeCompile = (sh) => {
    Object.assign(sh.uniforms, uniforms);
    sh.vertexShader = sh.vertexShader.replace('#include <common>', '#include <common>\n' + DETAIL_VERT_PARS).replace('#include <begin_vertex>', '#include <begin_vertex>\n' + DETAIL_VERT);
    sh.fragmentShader = sh.fragmentShader
      .replace('#include <common>', '#include <common>\n' + DETAIL_FRAG_PARS)
      .replace(
        '#include <color_fragment>',
        `#include <color_fragment>
        vec4 rg = vRegion / max(1e-4, vRegion.x + vRegion.y + vRegion.z + vRegion.w);
        vec3 rcol = uRegionCol[0] * rg.x + uRegionCol[1] * rg.y + uRegionCol[2] * rg.z + uRegionCol[3] * rg.w;
        float tone = 0.9 + 0.2 * vmNoise(vRest * 90.0);
        diffuseColor.rgb *= rcol * tone;`,
      )
      .replace(
        '#include <roughnessmap_fragment>',
        `#include <roughnessmap_fragment>
        roughnessFactor = dot(rg, uRegionRough);`,
      )
      .replace(
        '#include <normal_fragment_maps>',
        `#include <normal_fragment_maps>
        {
          float foot = length(fwidth(vRest));
          float fade = 1.0 - smoothstep(uWeave * 0.25, uWeave * 0.7, foot);
          float hh = vmHeight(vRest, normalize(vRestN), rg, fade);
          vec2 dh = vec2(dFdx(hh), dFdy(hh)) * 0.0011;
          normal = vmPerturb(-vViewPosition, normal, dh, faceDirection);
        }`,
      );
  };
  m.customProgramCacheKey = () => 'vmDetail';
  return m;
}

// =============================================================================================
// ARM RIG: bones, IK, posing
// =============================================================================================
const _m = new THREE.Matrix4(), _m2 = new THREE.Matrix4();
const _a = new THREE.Vector3(), _b = new THREE.Vector3(), _c = new THREE.Vector3(), _d = new THREE.Vector3();
const _x = new THREE.Vector3(), _y = new THREE.Vector3(), _z = new THREE.Vector3();
const _q1 = new THREE.Quaternion(), _q2 = new THREE.Quaternion();

class ArmRig {
  /** side: 1 right, -1 left. */
  constructor(side, gloveMat, sleeveMat) {
    this.side = side;
    this.root = new THREE.Group();
    this.upper = new THREE.Bone();
    this.fore = new THREE.Bone();
    this.hand = new THREE.Bone();
    this.root.add(this.upper, this.fore, this.hand);
    this.digits = [];
    for (let d = 0; d < 5; d++) {
      const chain = [];
      let parent = this.hand;
      for (let k = 0; k < 3; k++) {
        const b = new THREE.Bone();
        if (k === 0) b.position.fromArray(digitBase(d));
        else b.position.set(0, 0, digitLen(d)[k - 1]);
        if (side < 0 && k === 0) b.position.x *= -1;
        parent.add(b);
        chain.push(b);
        parent = b;
      }
      this.digits.push(chain);
    }
    this.pose = new Float32Array(POSE_N);
    this.setFingers(REST_POSE);
    this.root.updateMatrixWorld(true);
    const glove = side > 0 ? gloveGeometry() : (gloveGeometry.left ||= mirrorGeometry(gloveGeometry()));
    this.gloveMesh = new THREE.SkinnedMesh(glove, gloveMat);
    const bones = [this.fore, this.hand];
    for (let d = 0; d < 5; d++) bones.push(...this.digits[d]);
    this.gloveMesh.bind(new THREE.Skeleton(bones), new THREE.Matrix4());
    // the sleeve is bound with the forearm at the wrist and the upper arm at the elbow (straight arm)
    this.upper.position.set(0, 0, -ARM.fore);
    this.root.updateMatrixWorld(true);
    const sleeve = side > 0 ? sleeveGeometry() : (sleeveGeometry.left ||= mirrorGeometry(sleeveGeometry()));
    this.sleeveMesh = new THREE.SkinnedMesh(sleeve, sleeveMat);
    this.sleeveMesh.bind(new THREE.Skeleton([this.fore, this.upper]), new THREE.Matrix4());
    for (const m of [this.gloveMesh, this.sleeveMesh]) {
      m.frustumCulled = false;
      this.root.add(m);
    }
    this.shoulder = new THREE.Vector3(0.17 * side, -0.27, 0.06);
    this.elbowOut = 0.08;
    this.elbowDown = 0.3;
    this.elbowBack = 0.4;
    this.wrist = new THREE.Vector3();
    this.elbow = new THREE.Vector3();
  }

  /** Finger pose (degrees, right-hand convention; mirrored here for the left hand). */
  setFingers(p) {
    for (let i = 0; i < POSE_N; i++) this.pose[i] = p[i];
    for (let d = 0; d < 5; d++) {
      for (let k = 0; k < 3; k++) {
        const q = segmentQuat(this.pose, d, k, this.digits[d][k].quaternion);
        if (this.side < 0) {
          q.y = -q.y;
          q.z = -q.z;
        }
      }
    }
  }

  /**
   * Place the hand (its frame: wrist origin, +Z distal, +Y dorsal; for the left hand +X is
   * ulnar) and solve the arm: elbow on the IK circle nearest to the point that keeps the wrist
   * straight, nudged down and out.
   */
  setHand(handMatrix) {
    const H = this.hand;
    handMatrix.decompose(H.position, H.quaternion, H.scale);
    H.scale.set(1, 1, 1);
    const W = this.wrist.copy(H.position);
    _z.set(0, 0, 1).applyQuaternion(H.quaternion); // hand distal axis
    _y.set(0, 1, 0).applyQuaternion(H.quaternion); // dorsal
    const S = _a.copy(this.shoulder);
    const L1 = ARM.upper, L2 = ARM.fore;
    let dist = S.distanceTo(W);
    if (dist > L1 + L2 - 0.005) {
      // out of reach: the shoulder comes forward
      _b.subVectors(S, W).setLength(L1 + L2 - 0.005);
      S.copy(W).add(_b);
      dist = L1 + L2 - 0.005;
    }
    // circle of possible elbows
    const axis = _b.subVectors(W, S).normalize();
    const a = (L1 * L1 - L2 * L2 + dist * dist) / (2 * dist);
    const rad = Math.sqrt(Math.max(0, L1 * L1 - a * a));
    const C = _c.copy(S).addScaledVector(axis, a);
    // preferred elbow: part way back along the hand (a straight wrist), well down and outwards
    _d.copy(W).addScaledVector(_z, -L2 * this.elbowBack);
    _d.x += this.elbowOut * this.side;
    _d.y -= this.elbowDown;
    _d.z += 0.04;
    _d.sub(C);
    _d.addScaledVector(axis, -_d.dot(axis));
    if (_d.lengthSq() < 1e-10) _d.set(this.side * 0.3, -1, 0).addScaledVector(axis, -axis.y);
    const E = this.elbow.copy(C).addScaledVector(_d.normalize(), rad);
    // forearm bone at the wrist: +Z from the elbow to the wrist, +Y as close to the hand's dorsal axis
    _z.subVectors(W, E).normalize();
    _x.crossVectors(_y, _z);
    if (_x.lengthSq() < 1e-8) _x.set(1, 0, 0);
    _x.normalize();
    _y.crossVectors(_z, _x);
    _m.makeBasis(_x, _y, _z);
    this.fore.quaternion.setFromRotationMatrix(_m);
    this.fore.position.copy(W);
    // upper arm bone at the elbow: +Z from the shoulder to the elbow, minimal twist from the forearm
    _z.subVectors(E, S).normalize();
    _x.crossVectors(_y, _z);
    if (_x.lengthSq() < 1e-8) _x.set(1, 0, 0);
    _x.normalize();
    _y.crossVectors(_z, _x);
    _m.makeBasis(_x, _y, _z);
    this.upper.quaternion.setFromRotationMatrix(_m);
    this.upper.position.copy(E);
  }
}

// =============================================================================================
// BOOT (stomp / kick): drawn like a viewmodel - the boot and the lower trouser leg, the shin
// leaving the frame towards its bottom edge - on view-space keyframes. Where it really strikes
// (for hits) comes from body-space keys instead (see updateBoot).
// =============================================================================================
const SHIN_Q = new THREE.Quaternion().setFromAxisAngle(new THREE.Vector3(1, 0, 0), Math.PI / 2);
class LegRig {
  constructor(clothMat, boot) {
    this.root = new THREE.Group();
    this.foot = new THREE.Group();
    this.foot.add(boot);
    this.shin = new THREE.Mesh(shinGeometry(), clothMat);
    this.shin.frustumCulled = false;
    this.root.add(this.foot, this.shin);
    this.sole = boot.getObjectByName('sole');
  }
  /** Ankle at A; q = the boot's frame (+Y up the shaft, +Z to the toes), view space. */
  set(A, q) {
    this.foot.position.copy(A);
    this.foot.quaternion.copy(q);
    // the trouser leg carries on up the shaft (its -Z along the boot's +Y)
    this.shin.position.copy(A);
    this.shin.quaternion.copy(q).multiply(SHIN_Q);
  }
}
/** The lower trouser leg: from inside the boot shaft, bloused over its top, up past the frame. */
let _shinGeo = null;
function shinGeometry() {
  if (_shinGeo) return _shinGeo;
  const s0 = 0.12, s1 = 0.5;
  const prof = (s, a) => {
    const blouse = smoothstep(0.15, 0.17, s) * (1 - smoothstep(0.2, 0.3, s));
    const base = lerp(0.046, 0.056, smoothstep(0.17, 0.32, s));
    const folds = 0.004 * blouse * (1 + Math.sin(a * 5 + s * 90)) + 0.002 * Math.sin(a * 3 + s * 40) * smoothstep(0.25, 0.4, s);
    const r = base + 0.008 * blouse + folds;
    return [r * 0.96, r * 1.04];
  };
  _shinGeo = tubeGeometry({ s0, s1, joint: 10, prof, band: 0.03, NA: 40, NL: 48 });
  return _shinGeo;
}

// =============================================================================================
// GRIP SHAPES + FINGER CONTACT SOLVER (run once per held object)
// =============================================================================================
/** A union of rounded boxes {box: {c, x, y, h, r}} and capsules {cyl: {a, b, r, r2}} (object space). */
function makeShape(list) {
  const prims = list.map((s) => (s.box ? { f: makeFrame(s.box.c, s.box.x || [1, 0, 0], s.box.y || [0, 1, 0]), h: s.box.h, r: s.box.r ?? 0.004 } : { cone: makeRoundCone(s.cyl.a, s.cyl.b, s.cyl.r, s.cyl.r2 ?? s.cyl.r) }));
  const l = [0, 0, 0];
  return (x, y, z) => {
    let d = 1e9;
    for (const p of prims) {
      if (p.f) {
        toFrame(p.f, x, y, z, l);
        d = Math.min(d, roundBox(l[0], l[1], l[2], p.h[0], p.h[1], p.h[2], p.r));
      } else d = Math.min(d, roundCone(p.cone, x, y, z));
    }
    return d;
  };
}
const _sq = new THREE.Quaternion(), _sq2 = new THREE.Quaternion(), _sv = new THREE.Vector3();
/**
 * Joint points (base, two joints, tip centre) of digit d in object space for pose p, the hand at
 * matrix M (hand frame -> object); side -1 mirrors (left hand). Optionally the distal frame's
 * palmar direction into palm[0..2].
 */
function digitWorld(p, d, side, M, out, palm) {
  const base = digitBase(d), len = digitLen(d);
  let x = base[0], y = base[1], z = base[2];
  _sq.identity();
  const put = (j) => {
    _sv.set(x * side, y, z).applyMatrix4(M);
    out[j * 3] = _sv.x;
    out[j * 3 + 1] = _sv.y;
    out[j * 3 + 2] = _sv.z;
  };
  put(0);
  for (let k = 0; k < 3; k++) {
    _sq.multiply(segmentQuat(p, d, k, _sq2));
    _sv.set(0, 0, len[k]).applyQuaternion(_sq);
    x += _sv.x;
    y += _sv.y;
    z += _sv.z;
    put(k + 1);
  }
  if (palm) {
    _sv.set(0, -1, 0).applyQuaternion(_sq);
    _sv.x *= side;
    _sv.transformDirection(M);
    palm[0] = _sv.x;
    palm[1] = _sv.y;
    palm[2] = _sv.z;
  }
  return out;
}
const FLEX_IDX = [[0, 2, 3], [4, 6, 7], [8, 10, 11], [12, 14, 15], [16, 19, 20]];
const MAX_FLEX = [[100, 110, 85], [100, 110, 85], [100, 110, 85], [100, 110, 85], [55, 70, 80]];

/**
 * Close the given digits round `shape`: each joint, proximal to distal, bends from its preset
 * angle until its phalanx touches (the distal ones still straight, which keeps them outside a
 * convex shape), then bisects for the contact angle.
 */
function solveGrip(side, M, shape, preset, opts = {}) {
  const p = Float32Array.from(preset);
  const pts = new Float64Array(12);
  const gap = opts.gap ?? 0.0007;
  const digits = opts.digits ?? [0, 1, 2, 3, 4];
  const joints = opts.joints || {};
  // clearance of segment k at a few points; contact = any point deeper than where it started
  // (a knuckle already resting on the grip may stay there, but not sink further)
  const TS = [[0.5, 0.78, 1], [0.35, 0.7, 1], [0.35, 0.7, 1]];
  const base = new Float64Array(3);
  const clear = (d, k, out) => {
    digitWorld(p, d, side, M, pts);
    const r = digitR(d), ts = TS[k];
    for (let i = 0; i < 3; i++) {
      const t = ts[i];
      const x = lerp(pts[k * 3], pts[k * 3 + 3], t), y = lerp(pts[k * 3 + 1], pts[k * 3 + 4], t), z = lerp(pts[k * 3 + 2], pts[k * 3 + 5], t);
      out[i] = shape(x, y, z) - lerp(r[k], r[k + 1], t) - gap;
    }
    return out;
  };
  const cur = new Float64Array(3);
  const collide = (d, k) => {
    clear(d, k, cur);
    for (let i = 0; i < 3; i++) if (cur[i] < Math.min(0, base[i]) - 0.0004) return true;
    return false;
  };
  for (const d of digits) {
    for (let k = d === 4 ? 1 : 0; k < 3; k++) {
      if (joints[d] && !joints[d].includes(k)) continue;
      const idx = FLEX_IDX[d][k], hi = MAX_FLEX[d][k];
      clear(d, k, base);
      let prev = p[idx], a = prev, hit = false;
      while (a < hi) {
        a = Math.min(hi, a + 3);
        p[idx] = a;
        if (collide(d, k)) {
          hit = true;
          break;
        }
        prev = a;
      }
      if (!hit) continue;
      let A = prev, B = a;
      for (let i = 0; i < 6; i++) {
        const m = (A + B) / 2;
        p[idx] = m;
        if (collide(d, k)) B = m;
        else A = m;
      }
      p[idx] = A;
    }
  }
  return p;
}

/** Index finger onto a trigger: the distal pad at T, without sinking into `shape` (coordinate descent). */
function solveTrigger(M, T, shape, p) {
  const pts = new Float64Array(12), palm = [0, 0, 0];
  const r = digitR(0);
  const cost = () => {
    p[3] = p[2] * 0.6;
    digitWorld(p, 0, 1, M, pts, palm);
    const px = lerp(pts[6], pts[9], 0.62) + palm[0] * r[3], py = lerp(pts[7], pts[10], 0.62) + palm[1] * r[3], pz = lerp(pts[8], pts[11], 0.62) + palm[2] * r[3];
    let c = (px - T[0]) ** 2 + (py - T[1]) ** 2 + (pz - T[2]) ** 2;
    for (let k = 0; k < 3; k++) {
      for (const t of [0.5, 1]) {
        const x = lerp(pts[k * 3], pts[k * 3 + 3], t), y = lerp(pts[k * 3 + 1], pts[k * 3 + 4], t), z = lerp(pts[k * 3 + 2], pts[k * 3 + 5], t);
        const pen = r[k + 1] + 0.0005 - shape(x, y, z);
        if (pen > 0) c += 4 * pen * pen;
      }
    }
    return c;
  };
  const vars = [0, 1, 2];
  let step = 10, best = cost();
  while (step > 0.25) {
    let improved = false;
    for (const v of vars) {
      for (const s of [step, -step]) {
        const old = p[v];
        p[v] = clamp(old + s, v === 1 ? -25 : -15, v === 1 ? 25 : 100);
        const c = cost();
        if (c < best - 1e-12) {
          best = c;
          improved = true;
        } else p[v] = old;
      }
    }
    if (!improved) step *= 0.5;
  }
  cost();
  return Math.sqrt(best);
}

/**
 * Hand frame from where its middle knuckle goes (K), where the wrist is (W: only the direction
 * W -> K is used, the metacarpals) and which way the index side of the hand points (`index`,
 * from the little finger to the index). rot (deg) turns the hand about its own X, Y, Z axes.
 * Returns a Matrix4 (hand frame -> object space).
 */
function handFrame(side, K, W, index, rot = [0, 0, 0]) {
  const Z = new THREE.Vector3(K[0] - W[0], K[1] - W[1], K[2] - W[2]).normalize();
  const X = new THREE.Vector3(...index).multiplyScalar(side);
  X.addScaledVector(Z, -X.dot(Z)).normalize();
  const Y = new THREE.Vector3().crossVectors(Z, X);
  const q = new THREE.Quaternion().setFromRotationMatrix(new THREE.Matrix4().makeBasis(X, Y, Z));
  q.multiply(new THREE.Quaternion().setFromEuler(new THREE.Euler(rot[0] * DEG, rot[1] * DEG, rot[2] * DEG, 'XYZ')));
  const mcp = HAND.fingers[1].mcp;
  const off = new THREE.Vector3(mcp[0] * side, mcp[1], mcp[2]).applyQuaternion(q);
  const pos = new THREE.Vector3(...K).sub(off);
  return new THREE.Matrix4().compose(pos, q, new THREE.Vector3(1, 1, 1));
}

// =============================================================================================
// WEAPONS: grips, sights, hip poses, actions (model space of objectMeshes' weapons: barrel -Z,
// grip -Y, origin at the centre of the firing grip; metres). Sight lines measured from the
// models: rear / front points that must both sit on the view axis when aimed.
// =============================================================================================
const rake = (deg) => [0, Math.cos(deg * DEG), -Math.sin(deg * DEG)];
/** Forward across a grip (towards its front strap): g x right. */
const fwdOf = (g) => [0, g[2], -g[1]];
/** Point on a grip: centre c + right * a + along the grip axis g * b + forward (perpendicular) * f. */
function gripPoint(G, a, b, f) {
  const fw = fwdOf(G.g);
  return [G.c[0] + a + G.g[0] * b + fw[0] * f, G.c[1] + G.g[1] * b + fw[1] * f, G.c[2] + G.g[2] * b + fw[2] * f];
}

const POWER = [0, 3, 0, 0, 0, 0, 0, 0, 0, -3, 0, 0, 0, -7, 0, 0, 0, 0, 0, 5, 5];
const GUNS = {
  pistol: {
    hip: { p: [0.085, -0.148, -0.42], r: [2, 3, 0] }, // a compressed ready: arms out, gun low and centred
    sight: { rear: [0, 0.0836, 0.0015], front: [0, 0.0834, -0.1497], dist: 0.34 },
    grip: { c: [0, -0.005, -0.0035], g: rake(18), h: [0.0152, 0.046, 0.0285], r: 0.008 },
    frame: [{ box: { c: [0, 0.042, -0.06], h: [0.0125, 0.008, 0.095], r: 0.003 } }, { box: { c: [0, 0.066, -0.075], h: [0.0132, 0.018, 0.088], r: 0.003 } }],
    trigger: [0, 0.0262, -0.0612],
    R: { k: [0.0267, 0.013, 0.03], rot: [0, 14, 0], thumb: [33, 30, -65] },
    L: { cup: true, K: [-0.043, -0.006, -0.058], W: [-0.078, 0.024, 0.03], rot: [0, 0, 0], thumb: [30, 25, -60] },
    mag: { mesh: 'gunPolymer', pick: (b) => b.max[1] < -0.04, axis: rake(18), travel: 0.1, body: [0.0102, 0.04, 0.0152], free: true,
      grab: { K: [-0.003, -0.095, -0.034], W: [-0.07, -0.122, -0.04], index: [0, 1, -0.2] }, shape: [{ box: { c: [0, -0.09, -0.012], y: rake(18), h: [0.0105, 0.04, 0.016], r: 0.003 } }] },
    slideGrab: { K: [0.008, 0.1, 0.006], W: [-0.075, 0.112, 0.03], index: [0, 0, 1] },
    recoil: { back: 0.042, up: 10, roll: 2.5, side: 2 },
    action: 'slide',
    tilt: [16, -6, -22],
    lift: [-0.045, 0.055, 0.04],
  },
  revolver: {
    hip: { p: [0.09, -0.152, -0.43], r: [2, 3, 0] },
    sight: { rear: [0, 0.0805, -0.0265], front: [0, 0.0842, -0.1735], dist: 0.34 },
    grip: { c: [0, -0.009, -0.0006], g: rake(11), h: [0.018, 0.042, 0.023], r: 0.01 },
    frame: [{ box: { c: [0, 0.05, -0.07], h: [0.0125, 0.025, 0.1], r: 0.004 } }],
    trigger: [0, 0.0165, -0.0445],
    R: { k: [0.0295, 0.0, 0.0245], rot: [0, 14, 0], thumb: [33, 30, -65] },
    L: { cup: true, K: [-0.047, -0.012, -0.052], W: [-0.081, 0.018, 0.036], rot: [0, 0, 0], thumb: [30, 25, -60] },
    recoil: { back: 0.05, up: 15, roll: 3, side: 2.5 },
    action: 'revolver',
    crane: [-0.0115, 0.0335],
    cyl: { K: [-0.036, -0.032, -0.05], W: [-0.075, -0.07, 0.03], index: [0, 0.6, -0.8] },
    loader: { at: [-0.027, 0.046, -0.006], K: [-0.027, 0.011, 0.029], W: [-0.047, -0.049, 0.089], index: [1, 0.3, 0] },
    tilt: [28, -10, -30],
  },
  rifle: {
    hip: { p: [0.14, -0.19, -0.34], r: [2, 2.5, -2] }, // shouldered low: the sights well under the eye
    sight: { rear: [0, 0.143, -0.056], front: [0, 0.143, -0.1145], dist: 0.115 },
    grip: { c: [0, 0.0, 0.0011], g: rake(17), h: [0.014, 0.046, 0.0148], r: 0.007 },
    frame: [{ box: { c: [0, 0.068, -0.05], h: [0.012, 0.014, 0.085], r: 0.003 } }],
    trigger: [0, 0.035, -0.0445],
    R: { k: [0.0255, 0.004, 0.0165], rot: [0, 14, 0], thumb: [33, 30, -65] },
    L: { K: [0.034, 0.063, -0.34], W: [-0.052, 0.013, -0.315], index: [0, 0, -1], rot: [0, 0, 0], thumb: [-22, -4, 0], shape: [{ cyl: { a: [0, 0.085, -0.15], b: [0, 0.085, -0.43], r: 0.0236 } }, { box: { c: [0, 0.108, -0.29], h: [0.0106, 0.006, 0.14], r: 0.002 } }] },
    mag: { mesh: 'gunPolymerMag', pick: () => true, axis: [0, 1, 0.08], travel: 0.07,
      grab: { K: [-0.006, -0.075, -0.185], W: [-0.07, -0.12, -0.2], index: [0, 1, 0.2] }, shape: [{ box: { c: [0, -0.06, -0.13], y: [0, 0.97, 0.24], h: [0.0118, 0.075, 0.03], r: 0.004 } }] },
    charge: { K: [-0.03, 0.078, -0.07], W: [-0.105, 0.05, -0.04], index: [0, 0, -1] },
    recoil: { back: 0.03, up: 5, roll: 1.2, side: 1.2 },
    action: 'carrier',
    tilt: [16, -10, -28],
  },
  smg: {
    hip: { p: [0.14, -0.19, -0.34], r: [2, 2.5, -2] },
    sight: { rear: [0, 0.133, 0.036], front: [0, 0.1335, -0.2635], dist: 0.072 },
    grip: { c: [0, -0.021, 0.0035], g: rake(7), h: [0.014, 0.04, 0.0235], r: 0.009 },
    frame: [{ box: { c: [0, 0.088, -0.06], h: [0.0145, 0.022, 0.12], r: 0.004 } }],
    trigger: [0, 0.0375, -0.047],
    R: { k: [0.0255, 0.0, 0.025], rot: [0, 14, 0], thumb: [33, 30, -65] },
    L: { K: [0.033, 0.06, -0.212], W: [-0.053, 0.01, -0.187], index: [0, 0, -1], rot: [0, 0, 0], thumb: [-22, -4, 0], shape: [{ box: { c: [0, 0.0835, -0.207], h: [0.022, 0.0175, 0.055], r: 0.01 } }] },
    mag: { mesh: 'gunPark', pick: (b) => b.min[1] < 0, extra: { mesh: 'gunPolymer', pick: (b) => b.max[1] < -0.09 }, axis: [0, 1, 0], travel: 0.06,
      grab: { K: [-0.006, -0.035, -0.152], W: [-0.07, -0.08, -0.168], index: [0, 1, 0.3] }, shape: [{ box: { c: [0, -0.03, -0.125], y: [0, 0.95, 0.3], h: [0.011, 0.075, 0.019], r: 0.004 } }] },
    charge: { K: [-0.035, 0.125, -0.24], W: [-0.11, 0.09, -0.215], index: [0, 0, -1] },
    drum: true,
    recoil: { back: 0.022, up: 3.5, roll: 1, side: 1.4 },
    action: 'carrier',
    tilt: [16, -10, -28],
  },
  shotgun: {
    hip: { p: [0.14, -0.18, -0.33], r: [2, 2.5, -2] },
    sight: { rear: [0, 0.0462, -0.021], front: [0, 0.0437, -0.688], dist: 0.28 },
    grip: { c: [0, 0.0005, 0.0], g: rake(52), h: [0.019, 0.032, 0.017], r: 0.012 },
    frame: [{ box: { c: [0, 0.02, -0.12], h: [0.0125, 0.025, 0.105], r: 0.003 } }, { box: { c: [0, -0.012, 0.028], h: [0.019, 0.024, 0.02], r: 0.012 } }],
    trigger: [0, -0.0215, -0.0795],
    R: { K: [0.031, -0.026, -0.006], W: [0.034, 0.026, 0.078], index: [0, 0.75, -0.66], rot: [0, 10, 0], thumb: [-30, -20, 0] },
    L: { K: [0.034, -0.018, -0.385], W: [-0.052, -0.068, -0.36], index: [0, 0, -1], rot: [0, 0, 0], thumb: [-22, -4, 0], shape: [{ cyl: { a: [0, 0.0045, -0.28], b: [0, 0.0045, -0.47], r: 0.0226 } }] },
    pump: { travel: 0.085 },
    port: { at: [0, -0.024, -0.172], K: [0.012, -0.047, -0.15], W: [-0.07, -0.077, -0.12], index: [0, 0, -1] },
    recoil: { back: 0.055, up: 11, roll: 2.5, side: 2 },
    action: 'pump',
    tilt: [10, -12, -40],
  },
  sniper: {
    hip: { p: [0.14, -0.18, -0.33], r: [2, 2.5, -2] },
    sight: { rear: [0, 0.131, 0.0135], front: [0, 0.131, -0.3415], dist: 0.07, scope: true },
    grip: { c: [0, -0.0065, 0.0006], g: rake(4), h: [0.022, 0.03, 0.02], r: 0.01 },
    frame: [{ box: { c: [0, 0.035, -0.08], h: [0.02, 0.014, 0.1], r: 0.004 } }],
    trigger: [0, 0.0135, -0.066],
    R: { k: [0.0335, 0.0, 0.0215], rot: [0, 14, 0], thumb: [33, 30, -65] },
    L: { K: [0.034, 0.02, -0.28], W: [-0.052, -0.03, -0.255], index: [0, 0, -1], rot: [0, 0, 0], thumb: [-22, -4, 0], shape: [{ box: { c: [0, 0.0445, -0.27], h: [0.022, 0.0185, 0.12], r: 0.01 } }] },
    mag: { mesh: 'gunPolymer', pick: () => true, axis: [0, 1, 0], travel: 0.05,
      grab: { K: [-0.006, -0.012, -0.178], W: [-0.07, -0.055, -0.192], index: [0, 1, 0.1] }, shape: [{ box: { c: [0, 0.012, -0.135], h: [0.013, 0.021, 0.036], r: 0.003 } }] },
    bolt: { knob: [0.05, 0.052, -0.0215], lift: 62, back: 0.075, K: [0.072, 0.022, -0.0115], W: [0.097, -0.038, 0.0585], index: [0, 0.3, 1] },
    recoil: { back: 0.06, up: 9, roll: 2, side: 1.5 },
    action: 'bolt',
    tilt: [12, -10, -26],
  },
};

// =============================================================================================
// MELEE MOVES. Seconds per phase; hitWindow = the part of the strike phase (fractions) in which
// the striking point can connect; charge = seconds of holding for a full charge (the host keeps
// phase 'charge' while the button is held, with charge 0..1, then goes on to 'strike').
// item: what is held ('boot' moves work with anything in the hands).
// =============================================================================================
export const MELEE_MOVES = {
  slash: { item: 'knife', windup: 0.1, strike: 0.13, recover: 0.27, hitWindow: [0.18, 0.85], reach: 0.62 },
  stab: { item: 'knife', windup: 0.12, strike: 0.1, recover: 0.3, hitWindow: [0.35, 1.0], reach: 0.66 },
  swing: { item: 'bat', windup: 0.34, strike: 0.21, recover: 0.42, hitWindow: [0.22, 0.78], charge: 0.9, reach: 0.95 },
  jab: { item: 'fists', windup: 0.07, strike: 0.11, recover: 0.2, hitWindow: [0.4, 1.0], reach: 0.58 },
  haymaker: { item: 'fists', windup: 0.2, strike: 0.16, recover: 0.36, hitWindow: [0.3, 0.92], charge: 0.7, reach: 0.62 },
  stomp: { item: 'boot', windup: 0.26, strike: 0.13, recover: 0.34, hitWindow: [0.45, 1.0], reach: 0.75 },
  kick: { item: 'boot', windup: 0.2, strike: 0.15, recover: 0.36, hitWindow: [0.35, 0.95], reach: 0.95 },
};

// =============================================================================================
// MODEL PREPARATION: own copies of the shared weapon templates with the magazine split out (so
// it can drop and be replaced), the SMG's rear drum given its aperture, moving parts found.
// =============================================================================================
/** Split a non-indexed mesh geometry into [rest, picked] by connected components (welded positions). */
function splitComponents(geo, pick) {
  const p = geo.attributes.position, n = p.count;
  const ids = new Map(), par = [];
  const vid = new Int32Array(n);
  for (let i = 0; i < n; i++) {
    const k = Math.round(p.getX(i) * 1e5) + ',' + Math.round(p.getY(i) * 1e5) + ',' + Math.round(p.getZ(i) * 1e5);
    let v = ids.get(k);
    if (v === undefined) {
      v = par.length;
      ids.set(k, v);
      par.push(v);
    }
    vid[i] = v;
  }
  const find = (a) => {
    while (par[a] !== a) a = par[a] = par[par[a]];
    return a;
  };
  for (let t = 0; t < n; t += 3) {
    const a = find(vid[t]);
    par[find(vid[t + 1])] = a;
    par[find(vid[t + 2])] = a;
  }
  const box = new Map();
  for (let t = 0; t < n; t++) {
    const r = find(vid[t]);
    let b = box.get(r);
    if (!b) box.set(r, (b = { min: [1e9, 1e9, 1e9], max: [-1e9, -1e9, -1e9] }));
    for (let a = 0; a < 3; a++) {
      const v = p.getComponent(t, a);
      if (v < b.min[a]) b.min[a] = v;
      if (v > b.max[a]) b.max[a] = v;
    }
  }
  const picked = new Set();
  for (const [r, b] of box) if (pick(b)) picked.add(r);
  const take = (want) => {
    const tris = [];
    for (let t = 0; t < n; t += 3) if (picked.has(find(vid[t])) === want) tris.push(t);
    const g = new THREE.BufferGeometry();
    for (const name of Object.keys(geo.attributes)) {
      const src = geo.attributes[name], sz = src.itemSize;
      const arr = new Float32Array(tris.length * 3 * sz);
      let o = 0;
      for (const t of tris) for (let j = 0; j < 3; j++) for (let c = 0; c < sz; c++) arr[o++] = src.array[(t + j) * sz + c];
      g.setAttribute(name, new THREE.BufferAttribute(arr, sz));
    }
    g.computeBoundingSphere();
    return g;
  };
  return picked.size ? [take(false), take(true)] : [geo, null];
}

/** The MP5-style rear drum with its aperture bored through (so the sight picture is real). */
function apertureDrumGeometry() {
  const f = (x, y, z) => {
    // drum: cylinder along X (r 8.5 mm, 18 mm long) centred (0, 0.138, 0.036); hole along Z at y 0.1335
    const dy = y - 0.138, dz = z - 0.036;
    const rad = Math.hypot(dy, dz) - 0.0085, ax = Math.abs(x) - 0.009;
    const drum = Math.min(Math.max(rad, ax), 0) + Math.hypot(Math.max(rad, 0), Math.max(ax, 0));
    const hole = Math.hypot(x, y - 0.1335) - 0.0019;
    return smax(drum - 0.0004, -hole, 0.0008);
  };
  const m = meshSDF(f, { min: [-0.012, 0.126, 0.024], max: [0.012, 0.15, 0.048] }, 0.0005, { targetTris: 1600 });
  const g = new THREE.BufferGeometry();
  g.setAttribute('position', new THREE.BufferAttribute(m.positions, 3));
  g.setAttribute('normal', new THREE.BufferAttribute(m.normals, 3));
  g.setIndex(new THREE.BufferAttribute(m.indices, 1));
  return g;
}

/** A plain pistol magazine body (steel box with a follower and a round on top) for reloads. */
function pistolMagBody(mat, size) {
  const g = new THREE.Group();
  const [hx, hy, hz] = size;
  const body = new THREE.Mesh(new THREE.BoxGeometry(hx * 2, hy * 2, hz * 2), mat);
  body.position.y = -hy;
  g.add(body);
  const round = new THREE.Mesh(new THREE.CylinderGeometry(0.0045, 0.0045, 0.022, 10).rotateX(Math.PI / 2), new THREE.MeshStandardMaterial({ color: 0xc9a14c, metalness: 1, roughness: 0.3 }));
  round.position.set(0, 0.002, -0.004);
  g.add(round);
  return g;
}

// =============================================================================================
// FPS VIEW
// =============================================================================================
class Spring {
  constructor(k, c) {
    this.k = k;
    this.c = c;
    this.x = 0;
    this.v = 0;
  }
  step(dt, target = 0) {
    // semi-implicit, sub-stepped for stiff springs at low frame rates
    const n = Math.max(1, Math.ceil(dt / 0.008));
    const h = dt / n;
    for (let i = 0; i < n; i++) {
      this.v += (-this.k * (this.x - target) - this.c * this.v) * h;
      this.x += this.v * h;
    }
    return this.x;
  }
}

const _P = new THREE.Vector3(), _Q = new THREE.Quaternion(), _E = new THREE.Euler();
const _hp = new THREE.Vector3(), _hq = new THREE.Quaternion(), _hs = new THREE.Vector3();
const _M1 = new THREE.Matrix4(), _M2 = new THREE.Matrix4(), _M3 = new THREE.Matrix4();
const _V1 = new THREE.Vector3(), _V2 = new THREE.Vector3(), _V3 = new THREE.Vector3();
const _Q1 = new THREE.Quaternion(), _Q2 = new THREE.Quaternion();
const ONE = new THREE.Vector3(1, 1, 1);
const eulerQ = (out, pitch, yaw, roll) => out.setFromEuler(_E.set(pitch * DEG, yaw * DEG, roll * DEG, 'YXZ'));
/** Blend two transforms (position / quaternion pairs) into out. */
function mixXf(oP, oQ, aP, aQ, bP, bQ, t) {
  oP.lerpVectors(aP, bP, t);
  oQ.slerpQuaternions(aQ, bQ, t);
}
/** Piecewise curve helper: 0..1 between u0 and u1, eased. */
const seg = (u, u0, u1) => smooth01((u - u0) / (u1 - u0));
/** Exponential approach of cur to tgt at rate r (1/s). */
const approach = (cur, tgt, r, dt) => cur + (tgt - cur) * Math.min(1, dt * r);
const ACTION_SPEED = { pistol: 11, smg: 16, rifle: 14, shotgun: 6, sniper: 6, revolver: 7 };
const BOLT_PINCH = [35, 0, 60, 30, 45, 0, 75, 40, 55, 0, 85, 45, 65, 0, 90, 45, 25, 30, -20, 25, 25];

// =============================================================================================
// MELEE: how the items are held, idle poses and the moves' keyframes (camera space).
// Each pose: p = the item's origin (the right hand's grip) or, for fists, the middle knuckle
// (metres); d = where the blade / barrel / punch points; u = the item's up side (knife: the
// spine, bat: the side the left hand's back faces) or a fist's thumb side.
// =============================================================================================
const MELEE_GRIP = {
  // knife: blade from the thumb side of the fist, the edge on the knuckle side
  knife: {
    R: { K: [0.0225, -0.0174, -0.021], W: [0.0225, 0.0826, -0.021], index: [0, 0, -1] },
    shape: [{ box: { c: [0, -0.001, 0.006], h: [0.011, 0.0158, 0.06], r: 0.009 } }, { box: { c: [0, -0.0035, -0.0575], h: [0.0065, 0.025, 0.0028], r: 0.002 } }],
  },
  // bat: right hand above the left, both indices towards the barrel, backs of the hands opposed
  bat: {
    R: { K: [-0.015, -0.025, 0], W: [0.085, -0.025, 0], index: [0, 0, -1] },
    L: { K: [-0.015, 0.025, 0.085], W: [0.085, 0.025, 0.085], index: [0, 0, -1] },
    shape: [{ cyl: { a: [0, 0, 0.13], b: [0, 0, -0.16], r: 0.0136 } }, { cyl: { a: [0, 0, 0.13], b: [0, 0, 0.15], r: 0.022 } }],
  },
};
const FIST = [84, 2, 100, 62, 88, 0, 102, 60, 90, -2, 102, 58, 92, -5, 100, 56, 38, -8, 58, 32, 26];
const LOOSE_FIST = [62, 3, 78, 40, 66, 0, 82, 40, 70, -3, 84, 40, 72, -6, 84, 38, 20, 4, 30, 20, 20];
const K_ = (p, d, u) => ({ p, d, u });
const MELEE_IDLE = {
  knife: { item: K_([0.13, -0.15, -0.31], [-0.28, 0.72, -0.62], [0.15, 0.55, 0.82]), L: K_([-0.16, -0.18, -0.34], [0.15, 0.5, -0.85], [0.4, 0.9, 0.2]) },
  bat: { item: K_([0.15, -0.135, -0.3], [-0.15, 0.85, 0.5], [-0.95, 0.0, 0.3]) },
  fists: { R: K_([0.115, -0.11, -0.28], [-0.12, 0.42, -0.9], [-0.4, 0.88, 0.2]), L: K_([-0.115, -0.1, -0.295], [0.12, 0.42, -0.9], [0.4, 0.88, 0.2]) },
};
/**
 * Per move and animated part ('item' | 'R' | 'L'): the wind-up's end pose, an optional charge
 * offset (position added at full charge, with a further turn about the camera's Y in degrees),
 * and the strike keys (t = 0..1 through the strike).
 */
const MOVE_KEYS = {
  slash: {
    item: {
      windup: K_([0.25, -0.085, -0.25], [0.35, 0.35, -0.87], [0.95, 0.15, 0.25]),
      strike: [
        { t: 0, ...K_([0.25, -0.085, -0.25], [0.35, 0.35, -0.87], [0.95, 0.15, 0.25]) },
        { t: 0.45, ...K_([0.06, -0.05, -0.42], [-0.45, 0.25, -0.86], [0.75, 0.55, -0.35]) },
        { t: 1, ...K_([-0.2, -0.11, -0.3], [-0.9, 0.05, -0.42], [0.35, 0.45, -0.82]) },
      ],
    },
  },
  stab: {
    item: {
      windup: K_([0.155, -0.135, -0.2], [-0.2, 0.32, -0.93], [0.25, 0.92, 0.3]),
      strike: [
        { t: 0, ...K_([0.155, -0.135, -0.2], [-0.2, 0.32, -0.93], [0.25, 0.92, 0.3]) },
        { t: 1, ...K_([0.04, -0.07, -0.45], [-0.32, 0.28, -0.9], [0.3, 0.92, 0.2]) },
      ],
    },
  },
  swing: {
    item: {
      windup: K_([0.19, -0.06, -0.24], [-0.25, 0.82, 0.52], [0.1, 0.45, -0.88]),
      charge: { p: [0.03, 0.02, 0.04], turn: -12 },
      strike: [
        { t: 0, ...K_([0.19, -0.06, -0.24], [-0.25, 0.82, 0.52], [0.1, 0.45, -0.88]) },
        { t: 0.3, ...K_([0.17, -0.08, -0.31], [0.55, 0.32, -0.77], [-0.8, 0.05, -0.6]) },
        { t: 0.56, ...K_([0.03, -0.11, -0.37], [-0.4, 0.1, -0.91], [-0.9, 0.05, 0.4]) },
        { t: 1, ...K_([-0.15, -0.17, -0.26], [-0.92, -0.2, 0.33], [0.3, 0.05, 0.95]) },
      ],
    },
  },
  jab: {
    L: {
      windup: K_([-0.11, -0.095, -0.28], [0.15, 0.35, -0.92], [0.55, 0.8, 0.2]),
      strike: [
        { t: 0, ...K_([-0.11, -0.095, -0.28], [0.15, 0.35, -0.92], [0.55, 0.8, 0.2]) },
        { t: 1, ...K_([-0.035, -0.055, -0.56], [0.05, 0.08, -1], [1, 0.05, 0.05]) },
      ],
    },
    R: { windup: K_([0.12, -0.135, -0.3], [-0.12, 0.45, -0.88], [-0.4, 0.88, 0.2]), strike: [{ t: 0, ...K_([0.12, -0.135, -0.3], [-0.12, 0.45, -0.88], [-0.4, 0.88, 0.2]) }, { t: 1, ...K_([0.125, -0.13, -0.29], [-0.12, 0.45, -0.88], [-0.4, 0.88, 0.2]) }] },
  },
  haymaker: {
    R: {
      windup: K_([0.2, -0.045, -0.23], [-0.6, 0.2, -0.77], [0.05, 0.25, 0.97]),
      charge: { p: [0.04, 0.012, 0.04], turn: -10 },
      strike: [
        { t: 0, ...K_([0.2, -0.045, -0.23], [-0.6, 0.2, -0.77], [0.05, 0.25, 0.97]) },
        { t: 0.5, ...K_([0.14, -0.04, -0.42], [-0.8, 0.05, -0.6], [0.0, 0.3, 0.95]) },
        { t: 1, ...K_([-0.08, -0.07, -0.47], [-0.95, -0.05, -0.3], [0.25, 0.2, 0.95]) },
      ],
    },
    L: { windup: K_([-0.09, -0.1, -0.28], [0.2, 0.55, -0.8], [0.45, 0.85, 0.25]), strike: [{ t: 0, ...K_([-0.09, -0.1, -0.28], [0.2, 0.55, -0.8], [0.45, 0.85, 0.25]) }, { t: 1, ...K_([-0.1, -0.11, -0.29], [0.2, 0.55, -0.8], [0.45, 0.85, 0.25]) }] },
  },
};
// leg moves: the ankle (body space: x right, y up, z back, from the eye; physical) and the foot's pitch
const LEG_KEYS = {
  stomp: { windup: { p: [-0.08, -1.06, -0.3], pitch: -10 }, strike: { p: [-0.06, -1.531, -0.5], pitch: 2 } },
  kick: { windup: { p: [-0.08, -1.12, -0.14], pitch: -45 }, strike: { p: [-0.05, -0.92, -0.74], pitch: 72 } },
};
/** The boot as drawn (view space): ankle A, the shaft's up side Y and the toes T. */
const BOOT_VIEW = {
  rest: { A: [-0.1, -0.55, -0.25], Y: [0, 0.2, 0.98], T: [0, 0.98, -0.2] },
  stomp: { windup: { A: [-0.085, -0.17, -0.46], Y: [0, 0.04, 1], T: [0, 1, -0.04] }, strike: { A: [-0.06, -0.27, -0.57], Y: [0, 0.2, 0.98], T: [0, 0.98, -0.2] } },
  kick: { windup: { A: [-0.07, -0.4, -0.38], Y: [0, 0.6, 0.8], T: [0, 0.8, -0.6] }, strike: { A: [-0.04, -0.21, -0.62], Y: [0, -0.25, 0.97], T: [0, 0.97, 0.25] } },
};
for (const k of [BOOT_VIEW.rest, BOOT_VIEW.stomp.windup, BOOT_VIEW.stomp.strike, BOOT_VIEW.kick.windup, BOOT_VIEW.kick.strike]) {
  const y = new THREE.Vector3(...k.Y).normalize(), z = new THREE.Vector3(...k.T);
  z.addScaledVector(y, -z.dot(y)).normalize();
  k.q = new THREE.Quaternion().setFromRotationMatrix(new THREE.Matrix4().makeBasis(new THREE.Vector3().crossVectors(y, z), y, z));
  k.A = new THREE.Vector3(...k.A);
}
/** Orientation from a pointing direction and an up side: knife / bat: -Z along d, +Y = u. */
function itemQuat(d, u, out) {
  _V3.set(-d[0], -d[1], -d[2]).normalize();
  const Y = new THREE.Vector3(...u);
  Y.addScaledVector(_V3, -Y.dot(_V3)).normalize();
  const X = new THREE.Vector3().crossVectors(Y, _V3);
  return out.setFromRotationMatrix(new THREE.Matrix4().makeBasis(X, Y, _V3));
}
/** A fist: +Z (wrist to knuckles) along d, the thumb towards u (left hand: +X is ulnar). */
function fistQuat(side, d, u, out) {
  const Z = new THREE.Vector3(...d).normalize();
  const X = new THREE.Vector3(...u).multiplyScalar(side);
  X.addScaledVector(Z, -X.dot(Z)).normalize();
  const Y = new THREE.Vector3().crossVectors(Z, X);
  return out.setFromRotationMatrix(new THREE.Matrix4().makeBasis(X, Y, Z));
}
const _kq = (part, name, k) => (k.q = name === 'item' ? itemQuat(k.d, k.u, new THREE.Quaternion()) : fistQuat(name === 'R' ? 1 : -1, k.d, k.u, new THREE.Quaternion()));
for (const m of Object.values(MOVE_KEYS)) {
  for (const [name, part] of Object.entries(m)) {
    _kq(part, name, part.windup);
    for (const k of part.strike) _kq(part, name, k);
  }
}
for (const v of Object.values(MELEE_IDLE)) for (const [name, part] of Object.entries(v)) _kq(part, name, part);
const RIG_PIVOT = new THREE.Vector3(0.04, -0.2, -0.25);
const _Qc = new THREE.Quaternion();
const MELEE_ITEMS = ['knife', 'bat', 'fists'];

export class FpsView {
  constructor(factory, aspect) {
    this.factory = factory;
    this.scene = new THREE.Scene();
    this.camera = new THREE.PerspectiveCamera(56, aspect, 0.01, 10);
    this.hemi = new THREE.HemisphereLight(0xdfe6ff, 0x302820, 1.1);
    this.scene.add(this.hemi);
    this.key = new THREE.DirectionalLight(0xfff2dd, 1.6);
    this.key.position.set(0.5, 1, 0.35);
    this.scene.add(this.key);
    this.rim = new THREE.DirectionalLight(0xc8d8ff, 0.5);
    this.rim.position.set(-0.6, 0.3, -1);
    this.scene.add(this.rim);
    this.flashLight = new THREE.PointLight(0xffb060, 0, 3, 2);
    this.scene.add(this.flashLight);
    this.gloveMat = detailMaterial({ colors: [0x56462f, 0x322c25, 0x18181a, 0x222224], rough: [0.86, 0.6, 0.48, 0.82], sheen: 0.22, sheenColor: 0x8c7f6a });
    this.sleeveMat = detailMaterial({ colors: [0x4c5340, 0x2e3328, 0x333333, 0x2e3328], rough: [0.92, 0.9, 0.9, 0.9], weave: 0.0014, sheen: 0.6 });
    this.armR = new ArmRig(1, this.gloveMat, this.sleeveMat);
    this.armL = new ArmRig(-1, this.gloveMat, this.sleeveMat);
    this.scene.add(this.armR.root, this.armL.root);
    this.kits = {};
    this.kit = null;
    this.type = null;
    this.current = null;
    // springs (kickZ is poked directly by older hosts: keep its name)
    this.kickZ = new Spring(220, 22);
    this.kickP = new Spring(170, 16);
    this.kickY = new Spring(140, 15);
    this.kickR = new Spring(150, 14);
    this.swayX = new Spring(70, 12);
    this.swayY = new Spring(70, 12);
    this.swayR = new Spring(60, 10);
    this.dip = new Spring(90, 11);
    this.air = 0;
    this.flash = null;
    this.flashT = 0;
    this.debris = []; // falling magazines / casings
    this.casingPool = {};
    this.action = 0;
    this.pumpT = -1;
    this.boltT = -1;
    this.trig = 0;
    this.t = 0;
    this.visible = true;
    this.pose = { ads: 0, sprint: 0, reload: 0, swap: 0, crouch: 0, scope: 0 };
    this.handPR = new THREE.Vector3();
    this.handQR = new THREE.Quaternion();
    this.handPL = new THREE.Vector3();
    this.handQL = new THREE.Quaternion();
    this.fingerR = new Float32Array(POSE_N);
    this.fingerL = new Float32Array(POSE_N);
    this.gunP = new THREE.Vector3();
    this.gunQ = new THREE.Quaternion();
    this.gunM = new THREE.Matrix4();
    this.bp = { hand: 0, lift: 0, back: 0 };
    this.rl = { on: false, w: 0, lastU: 0, shells: 0, dropped: false, fresh: false, seated: true, ejected: false, p: new THREE.Vector3(), q: new THREE.Quaternion(), f: new Float32Array(POSE_N) };
    this.reloadBlend = 0;
    this.cylSwing = 0;
    this.revTip = 0;
    this.slideHold = 0;
    this.shell = null;
    this.loader = null;
    // melee
    this.trouserMat = detailMaterial({ colors: [0x4a4f3d, 0x3a3e30, 0x333333, 0x3a3e30], rough: [0.92, 0.9, 0.9, 0.9], weave: 0.0014, sheen: 0.6 });
    this.leg = null;
    const part = () => ({ p: new THREE.Vector3(), q: new THREE.Quaternion() });
    this.mState = { key: '', charge: 0, lastCharge: 0, from: { item: part(), R: part(), L: part() }, last: { item: part(), R: part(), L: part() } };
    this.bState = { key: '', fromP: new THREE.Vector3(), lastP: new THREE.Vector3(), fromQ: new THREE.Quaternion(), lastQ: new THREE.Quaternion(), physP: new THREE.Vector3(), fromPhys: new THREE.Vector3(), restPhys: new THREE.Vector3(), fromPitch: 0, physPitch: 0, viewPitch: 0 };
    this.mHit = { on: false, s: 0, u: 0, at: 0, wall: 0 };
    this.mRecoil = { x: new Spring(120, 13), y: new Spring(120, 13), z: new Spring(140, 14) };
    this.rigM = new THREE.Matrix4();
    this.strikeU = 0;
    this.lastMelee = null;
    this.lastMeleeT = 0;
    this.motion = { px: 0, py: 0, pz: 0, pitch: 0, yaw: 0, roll: 0 };
    // the boot is meshed from its SDF on first use: do it soon after start-up instead of mid-kick
    if (typeof window !== 'undefined') setTimeout(() => this.legRig(), 1200);
  }

  /** Build everything up front (weapon kits, melee items, the boot), e.g. behind a loading screen. */
  preload(types = [...Object.keys(GUNS), ...MELEE_ITEMS]) {
    for (const t of types) if (!this.kits[t]) this.kits[t] = MELEE_ITEMS.includes(t) ? this.buildMeleeKit(t) : this.buildKit(t);
    this.legRig();
  }

  setEnvironment(env) {
    this.scene.environment = env;
    this.scene.environmentIntensity = 0.55;
  }

  setAspect(a) {
    this.camera.aspect = a;
    this.camera.updateProjectionMatrix();
  }

  /** Light level of the scene around the player (0..1.5) so the hands are not lit like daylight. */
  setLighting(level, tint = 0xffffff) {
    this.hemi.intensity = 0.35 + 0.8 * level;
    this.key.intensity = 0.4 + 1.2 * level;
    this.rim.intensity = 0.15 + 0.4 * level;
    this.key.color.set(tint);
  }

  // ------------------------------------------------------------------------------------------
  /** Build (once) everything a weapon needs: its model, hand frames, solved finger poses. */
  buildKit(type) {
    const spec = GUNS[type];
    const model = this.factory.createWeaponModel(type);
    const kit = { type, spec, model, parts: {} };
    model.traverse((o) => {
      if (o.isMesh) {
        o.castShadow = false;
        o.receiveShadow = false;
      }
    });
    // magazine split-out
    if (spec.mag) {
      const magGroup = new THREE.Group();
      magGroup.name = 'vmMag';
      const take = (rule) => {
        const mesh = model.children.find((c) => c.isMesh && c.name === rule.mesh);
        if (!mesh) return;
        const [rest, picked] = splitComponents(mesh.geometry, rule.pick);
        if (!picked) return;
        mesh.geometry = rest;
        magGroup.add(new THREE.Mesh(picked, mesh.material));
      };
      take(spec.mag);
      if (spec.mag.extra) take(spec.mag.extra);
      if (type === 'pistol') {
        const body = pistolMagBody(model.getObjectByName('slide:gunNitride')?.material || magGroup.children[0]?.material, spec.mag.body);
        // the body hangs from the top of the grip along the grip axis, hidden inside until it moves
        const axis = new THREE.Vector3(...spec.mag.axis).normalize();
        body.quaternion.setFromUnitVectors(new THREE.Vector3(0, 1, 0), axis);
        body.position.set(0, 0.031, -0.0035).addScaledVector(axis, 0.0);
        body.visible = false;
        kit.parts.magBody = body;
        magGroup.add(body);
      }
      model.add(magGroup);
      kit.parts.mag = magGroup;
      // the dropped one: a clone that falls away
      kit.parts.magDrop = magGroup.clone();
      kit.parts.magDrop.visible = false;
      this.scene.add(kit.parts.magDrop);
    }
    if (spec.drum) {
      const park = model.children.find((c) => c.isMesh && c.name === 'gunPark');
      if (park) {
        const [rest, drum] = splitComponents(park.geometry, (b) => Math.abs(b.min[1] - 0.1295) < 0.002 && Math.abs(b.max[2] - 0.0445) < 0.002 && b.max[0] - b.min[0] > 0.015);
        if (drum) {
          park.geometry = rest;
          const ap = new THREE.Mesh((apertureDrumGeometry.g ||= apertureDrumGeometry()), park.material);
          model.add(ap);
        }
      }
    }
    for (const n of ['slide', 'pump', 'cylinder', 'hammer', 'bolt']) {
      const o = model.getObjectByName(n);
      if (o) kit.parts[n] = { o, pos: o.position.clone(), quat: o.quaternion.clone() };
    }
    const carrier = model.children.find((c) => c.isMesh && c.name === 'gunBarrel');
    if (carrier && type !== 'pistol') kit.parts.carrier = { o: carrier, pos: carrier.position.clone() };
    kit.muzzle = model.getObjectByName('muzzle');
    kit.ejector = model.getObjectByName('ejector');
    // ADS: the sight line onto the view axis (pitch only), the rear sight `dist` in front of the eye
    const S = spec.sight;
    const phi = Math.atan2(S.front[1] - S.rear[1], -(S.front[2] - S.rear[2]));
    kit.adsQ = new THREE.Quaternion().setFromAxisAngle(AX, -phi);
    kit.adsP = new THREE.Vector3(...S.rear).applyQuaternion(kit.adsQ).negate().add(new THREE.Vector3(0, 0, -S.dist));
    kit.hipP = new THREE.Vector3(...spec.hip.p);
    kit.hipQ = eulerQ(new THREE.Quaternion(), ...spec.hip.r);
    this.solveHands(kit);
    return kit;
  }

  /** Hand frames on the weapon and the finger poses that hold it. */
  solveHands(kit) {
    const spec = kit.spec, G = spec.grip;
    const gripShape = makeShape([{ box: { c: G.c, x: [1, 0, 0], y: G.g, h: G.h, r: G.r } }, ...(spec.frame || [])]);
    // right hand: power grip on the firing grip, the index on the trigger
    const R = spec.R;
    if (R.k) {
      // knuckles just outside the grip's front corner, metacarpals square to the grip axis
      const K = gripPoint(G, R.k[0], R.k[1], R.k[2]), f = fwdOf(G.g);
      kit.gripR = handFrame(1, K, [K[0], K[1] - f[1] * 0.1, K[2] - f[2] * 0.1], G.g, R.rot);
    } else kit.gripR = handFrame(1, R.K, R.W, R.index || G.g, R.rot);
    const pre = Float32Array.from(POWER);
    pre[16] = R.thumb[0];
    pre[17] = R.thumb[1];
    pre[18] = R.thumb[2];
    const pose = solveGrip(1, kit.gripR, gripShape, pre, { digits: [1, 2, 3, 4] });
    pose[0] = 20;
    pose[1] = -4;
    pose[2] = 40;
    kit.trigErr = solveTrigger(kit.gripR, spec.trigger, gripShape, pose);
    kit.poseR = pose;
    kit.poseRFire = Float32Array.from(pose);
    kit.poseRFire[2] += 9;
    kit.poseRFire[3] += 5;
    kit.poseRFire[0] += 3;
    // support hand
    const L = spec.L;
    let shapeL;
    if (L.cup) {
      // round the firing hand's fingers: the grip box grown by a finger's thickness in front and left
      const fw = fwdOf(G.g);
      const c = [G.c[0] - 0.006, G.c[1] + fw[1] * 0.012, G.c[2] + fw[2] * 0.012];
      shapeL = makeShape([{ box: { c, x: [1, 0, 0], y: G.g, h: [G.h[0] + 0.012, G.h[1], G.h[2] + 0.014], r: 0.016 } }, ...(spec.frame || [])]);
    } else shapeL = makeShape(L.shape);
    kit.gripL = handFrame(-1, L.K, L.W, L.index || G.g, L.rot);
    const preL = Float32Array.from(POWER);
    preL[16] = L.thumb[0];
    preL[17] = L.thumb[1];
    preL[18] = L.thumb[2];
    kit.poseL = solveGrip(-1, kit.gripL, shapeL, preL);
    kit.gripRInv = kit.gripR.clone().invert();
    // reload hands: on the magazine, the slide, the charging handle, a shell, the cylinder
    kit.magAxis = new THREE.Vector3(...(spec.mag ? spec.mag.axis : [0, 1, 0])).normalize();
    kit.poseRelax = Float32Array.from([15, 5, 25, 15, 15, 1, 28, 15, 18, -4, 30, 15, 20, -10, 30, 15, 5, 15, 0, 15, 10]);
    kit.posePinch = Float32Array.from([42, 4, 48, 22, 48, 0, 58, 26, 62, -3, 72, 30, 70, -8, 80, 35, 28, 18, 30, 22, 18]);
    kit.posePush = Float32Array.from([32, 4, 38, 16, 46, 0, 56, 25, 60, -3, 70, 30, 70, -8, 80, 35, 12, 28, 10, 6, 2]);
    kit.poseCharge = kit.posePinch;
    const open = [8, 2, 10, 5, 8, 0, 10, 5, 8, -2, 10, 5, 8, -5, 10, 5, 10, 25, 20, 10, 10];
    const frameOf = (f) => handFrame(-1, f.K, f.W, f.index);
    if (spec.mag) {
      kit.grabL = frameOf(spec.mag.grab);
      kit.grabLInv = kit.grabL.clone().invert();
      kit.poseGrab = solveGrip(-1, kit.grabL, makeShape(spec.mag.shape), open);
    }
    if (spec.slideGrab) {
      kit.slideL = frameOf(spec.slideGrab);
      kit.poseSlide = solveGrip(-1, kit.slideL, makeShape([{ box: { c: [0, 0.066, -0.075], h: [0.0132, 0.018, 0.088], r: 0.003 } }]), open);
    }
    if (spec.charge) kit.chargeL = frameOf(spec.charge);
    if (spec.port) {
      kit.portL = frameOf(spec.port);
      kit.shellInHand = kit.portL.clone().invert().multiply(new THREE.Matrix4().makeTranslation(...spec.port.at));
    }
    if (spec.bolt && kit.parts.bolt) {
      // the hand on the bolt knob rides with the bolt: hand = bolt * (bolt at rest)^-1 * frame
      const B = spec.bolt, rest = new THREE.Matrix4().makeTranslation(kit.parts.bolt.pos.x, kit.parts.bolt.pos.y, kit.parts.bolt.pos.z);
      kit.boltHandM = rest.invert().multiply(handFrame(1, B.K, B.W, B.index));
    }
    if (spec.cyl) {
      kit.cylL = frameOf(spec.cyl);
      kit.loaderL = frameOf(spec.loader);
      kit.loaderInHand = kit.loaderL.clone().invert().multiply(new THREE.Matrix4().makeTranslation(...spec.loader.at));
    }
  }

  /** A gun ('pistol' | 'revolver' | 'shotgun' | 'smg' | 'rifle' | 'sniper') or a melee item ('knife' | 'bat' | 'fists'). */
  setWeapon(type) {
    if (this.type === type) return;
    const melee = MELEE_ITEMS.includes(type);
    if (!GUNS[type] && !melee) return;
    if (this.current) this.scene.remove(this.current);
    if (this.rl && this.rl.on) this.finishReload();
    if (!this.kits[type]) this.kits[type] = melee ? this.buildMeleeKit(type) : this.buildKit(type);
    this.kit = this.kits[type];
    this.type = type;
    this.current = this.kit.model;
    this.scene.add(this.current);
    if (!this.flash && typeof this.factory.createMuzzleFlashMesh === 'function') {
      this.flash = this.factory.createMuzzleFlashMesh();
      this.flash.visible = false;
    }
    if (this.flash) {
      this.flash.visible = false;
      if (this.kit.muzzle) this.kit.muzzle.add(this.flash);
      else if (this.flash.parent) this.flash.parent.remove(this.flash);
    }
    this.mState.key = '';
    this.mHit.on = false;
    this.pumpT = -1;
    this.boltT = -1;
    this.action = 0;
    this.rl.on = false;
    this.rl.w = 0;
    this.reloadBlend = 0;
    this.cylSwing = 0;
    this.revTip = 0;
    this.slideHold = 0;
  }

  fire(recoil = 1, ads = 0) {
    if (!this.kit || this.kit.melee) return;
    const R = this.kit.spec.recoil;
    this.action = 1;
    this.trig = 1;
    const k = (1 - 0.55 * ads) * Math.min(2.2, 0.55 + 0.45 * recoil);
    this.kickZ.v += 1.6 * k * (R.back / 0.04);
    this.kickP.v += 9 * k * (R.up / 8);
    this.kickY.v += (Math.random() - 0.5) * 3 * k * (R.side / 1.5);
    this.kickR.v += (Math.random() - 0.3) * 3 * k * (R.roll / 2);
    if (this.flash) {
      this.flash.visible = true;
      this.flash.rotation.z = Math.random() * Math.PI;
      this.flash.scale.setScalar((0.7 + Math.random() * 0.6) * (0.8 + 0.4 * recoil));
      this.flashT = 0.045;
      if (this.kit.muzzle) {
        this.kit.muzzle.getWorldPosition(this.flashLight.position);
        this.flashLight.intensity = 4;
      }
    }
    const a = this.kit.spec.action;
    if (a === 'bolt') this.boltT = 0;
    else if (a !== 'pump' && a !== 'revolver') this.eject();
  }

  /**
   * A spent case (pooled meshes, no allocation once warm): from the ejection port, or (at, drop)
   * falling out of a revolver's cylinder.
   */
  eject(at = null, drop = false) {
    const ej = this.kit && this.kit.ejector;
    if ((!ej && !at) || typeof this.factory.createCasingMesh !== 'function') return;
    const pool = (this.casingPool[this.type] ||= []);
    let c = null;
    for (const x of pool) if (!x.live) c = x;
    if (!c) {
      if (pool.length >= 10) c = pool.reduce((a, b) => (a.t > b.t ? a : b));
      else {
        c = { m: this.factory.createCasingMesh(this.type), v: new THREE.Vector3(), w: new THREE.Vector3(), t: 0, live: false, life: 0.8 };
        c.m.castShadow = c.m.receiveShadow = false;
        pool.push(c);
        this.scene.add(c.m);
      }
    }
    this.current.updateMatrixWorld(true);
    if (at) c.m.position.copy(at);
    else ej.getWorldPosition(c.m.position);
    c.m.quaternion.copy(this.gunQ);
    if (drop) {
      c.v.set((Math.random() - 0.5) * 0.3, -0.4 - Math.random() * 0.3, 0.15 * Math.random());
      c.w.set(6 * Math.random(), 4 * Math.random(), 3 * Math.random());
    } else {
      // out to the right, up and a little back (in the gun's frame)
      c.v.set(1.4 + Math.random() * 0.6, 1.3 + Math.random() * 0.5, 0.3 + 0.4 * (Math.random() - 0.5)).applyQuaternion(this.gunQ);
      c.w.set(18 * Math.random(), 28, 10 * Math.random());
    }
    c.t = 0;
    c.live = true;
    c.m.visible = true;
    if (!this.debris.includes(c)) this.debris.push(c);
  }

  /** The pump of a shotgun (racks and throws a shell). */
  pump() {
    this.pumpT = 0;
  }

  /** Muzzle in view-camera space (tracers start there, mapped into the world by the caller). */
  muzzleCameraSpace(out) {
    if (!this.kit || !this.kit.muzzle) return out.set(0.15, -0.12, -0.5);
    this.current.updateMatrixWorld(true);
    return this.kit.muzzle.getWorldPosition(out);
  }

  /** 0..1 how far the eye is into a telescopic sight (the host draws the scope overlay and zoom). */
  scopeAmount() {
    return this.pose.scope;
  }

  // ------------------------------------------------------------------------------------------
  /**
   * Per frame. s: { ads (0..1), sprint, speed, step (walk cycle), onGround, crouch (0..1),
   * look: {dx, dy}, landed, state ('idle'|'reload'|'equip'|'holster'|'pump'), stateT,
   * reloadTime, perShell, empty?, melee? }
   */
  update(dt, s) {
    if (!this.kit) return;
    dt = clamp(dt, 0, 0.05);
    this.t += dt;
    const kit = this.kit, spec = kit.spec, P = this.pose;
    const melee = !!kit.melee;
    const reloading = s.state === 'reload' && !melee;
    P.sprint = approach(P.sprint, s.sprint ? 1 : 0, 9, dt);
    P.crouch = approach(P.crouch, s.crouch || 0, 8, dt);
    P.reload = approach(P.reload, reloading ? 1 : 0, 9, dt);
    // holster: down and away; equip: up from below, quick at first then settling
    P.swap = s.state === 'holster' ? smooth01(s.stateT / 0.28) : s.state === 'equip' ? (1 - clamp(s.stateT / 0.42, 0, 1)) ** 2 : 0;
    const adsRaw = melee ? 0 : clamp(s.ads || 0, 0, 1);
    const a = smooth01(adsRaw);
    P.ads = a;
    P.scope = spec.sight.scope ? smoothstep(0.82, 1, adsRaw) : 0;
    const still = 1 - 0.9 * a; // sway / bob scale when aimed
    this.lastMelee = s.melee ? s.melee.move : null;
    this.lastMeleeT = s.melee ? s.melee.t : 0;
    const swinging = melee && s.melee && MELEE_MOVES[s.melee.move] && MELEE_MOVES[s.melee.move].item === kit.type ? 1 : 0;

    // --- motion springs
    const lx = s.look ? s.look.dx : 0, ly = s.look ? s.look.dy : 0;
    const sx = this.swayX.step(dt, clamp(-lx * 2.4, -0.07, 0.07));
    const sy = this.swayY.step(dt, clamp(ly * 2.4, -0.06, 0.06));
    const sr = this.swayR.step(dt, clamp(-lx * 6, -0.2, 0.2));
    const ph = (s.step || 0) * Math.PI * 2;
    const move = Math.min(1, (s.speed || 0) / 3.3) * (s.onGround === false ? 0.15 : 1);
    const bobA = (0.007 + 0.016 * P.sprint) * move * (1 - 0.88 * a);
    const bx = Math.sin(ph) * bobA, by = -Math.abs(Math.cos(ph)) * bobA * 1.3;
    const breathe = Math.sin(this.t * 1.7) * 0.0016 * (1 - a);
    if (s.landed) this.dip.v -= Math.min(0.7, s.landed * 0.09);
    this.air = approach(this.air, s.onGround === false ? 1 : 0, 6, dt);
    const dip = this.dip.step(dt);
    const kz = this.kickZ.step(dt), kp = this.kickP.step(dt), ky = this.kickY.step(dt), kr = this.kickR.step(dt);
    const boot = this.updateBoot(dt, s);

    // --- shared offsets: sprint, crouch, air, switching, sway, bob, the boot's balance
    let px = 0, py = 0, pz = 0, pitch = 0, yaw = 0, roll = 0;
    const sp = P.sprint * (1 - a) * (1 - swinging);
    if (melee) {
      // melee items: pumped low while sprinting
      py += -0.02 * sp;
      pz += 0.02 * sp;
      pitch += -10 * sp;
      roll += 8 * sp;
    } else {
      px += -0.03 * sp;
      py += -0.02 * sp;
      pz += 0.02 * sp;
      yaw += 32 * sp;
      roll += 17 * sp;
      pitch += -6 * sp;
    }
    py -= 0.008 * P.crouch * (1 - a);
    roll += 4 * P.crouch * (1 - a);
    py += 0.012 * this.air * (1 - a);
    pitch += 3 * this.air;
    py -= 0.3 * P.swap;
    pitch -= 55 * P.swap;
    roll -= 20 * P.swap;
    px += sx * still + bx + 0.06 * boot;
    py += sy * still + by + breathe + dip + 0.055 * boot;
    pitch += sy * 25 * still + 10 * boot;
    yaw += sx * 30 * still - 10 * boot;
    roll += sr * 10 * still - 22 * boot;
    if (melee) {
      // kick springs (a host's shove) still nudge the rig
      pz += Math.max(kz, -0.012) * 0.05;
      const mo = this.motion;
      mo.px = px;
      mo.py = py;
      mo.pz = pz;
      mo.pitch = pitch;
      mo.yaw = yaw;
      mo.roll = roll;
      this.updateMelee(dt, s, mo);
      this.autoImpact(s);
      this.updateDebris(dt);
      return;
    }

    // --- guns: hip <-> aimed, reload tilt, recoil
    _P.lerpVectors(kit.hipP, kit.adsP, a);
    _Q.slerpQuaternions(kit.hipQ, kit.adsQ, a);
    const rl = P.reload;
    let u = 0;
    if (reloading) u = clamp(s.stateT / Math.max(0.2, s.reloadTime || 1), 0, 1.15);
    this.reloadU = u;
    const tl = spec.tilt;
    pitch += tl[0] * rl + this.revTip;
    yaw += tl[1] * rl;
    roll += tl[2] * rl;
    const lift = spec.lift || [-0.055, 0.07, 0.025];
    px += lift[0] * rl;
    py += lift[1] * rl;
    pz += lift[2] * rl;
    pz += Math.max(kz, -0.012) * (spec.recoil.back / 0.04) * 0.05;
    pitch += kp * 3.2;
    yaw += ky * 1.6;
    roll += kr * 2;
    // reload action jolts (seat the magazine / rack)
    const jolt = this.reloadJolt(s, u);
    py += jolt;
    pitch += jolt * 160;
    _P.x += px;
    _P.y += py;
    _P.z += pz;
    eulerQ(_Q1, pitch, yaw, roll);
    _Q.premultiply(_Q1);
    this.gunP.copy(_P);
    this.gunQ.copy(_Q);
    this.current.position.copy(_P);
    this.current.quaternion.copy(_Q);
    this.current.updateMatrixWorld(true);
    this.gunM.copy(this.current.matrixWorld);

    // --- moving parts, then hands
    this.animateAction(dt, s);
    this.updateHands(dt, s, u);
    this.updateDebris(dt);
    if (this.flashT > 0) {
      this.flashT -= dt;
      if (this.flashT <= 0 && this.flash) {
        this.flash.visible = false;
        this.flashLight.intensity = 0;
      }
    }
    this.trig = Math.max(0, this.trig - dt * 9);
    this.autoImpact(s);
  }

  /** s.melee.hit set during the strike counts as an impact when the host did not report one. */
  autoImpact(s) {
    const m = s.melee;
    if (m && m.hit && m.phase === 'strike' && !this.mHit.on) this.meleeImpact(1);
  }

  /** Small vertical jolts when a magazine seats / a shell goes in. */
  reloadJolt(s, u) {
    if (s.state !== 'reload') return 0;
    const sp = this.kit.spec;
    if (sp.action === 'pump') return -0.004 * Math.exp(-(((u - 0.62) / 0.05) ** 2));
    return 0.006 * Math.exp(-(((u - 0.66) / 0.035) ** 2)) * (u > 0.62 ? 1 : 0.4);
  }

  /** Slide / bolt carrier / pump / sniper bolt / revolver cylinder. */
  animateAction(dt, s) {
    const kit = this.kit, P = kit.parts, a = this.action;
    const speed = ACTION_SPEED[this.type] || 8;
    this.action = Math.max(0, a - dt * speed);
    const t = 1 - this.action;
    const stroke = this.action > 0 ? (t < 0.3 ? t / 0.3 : Math.max(0, 1 - (t - 0.3) / 0.7)) : 0;
    if (P.slide) {
      // locked back when empty (if the host says so)
      const locked = s.empty && s.state !== 'reload' ? 1 : 0;
      P.slide.o.position.z = P.slide.pos.z + 0.026 * Math.max(stroke, locked, this.slideHold);
    }
    if (P.carrier) P.carrier.o.position.z = P.carrier.pos.z + 0.022 * stroke;
    if (P.hammer) {
      P.hammer.o.quaternion.copy(P.hammer.quat);
      P.hammer.o.rotateX(-0.6 * this.trig);
    }
    // shotgun pump stroke (also drives the bolt seen through the ejection port)
    let pumpStroke = 0;
    if (this.pumpT >= 0) {
      this.pumpT += dt;
      const v = this.pumpT / 0.36;
      pumpStroke = v < 0.42 ? smooth01(v / 0.42) : 1 - smooth01((v - 0.42) / 0.58);
      if (v >= 0.42 && !this.pumpEjected) {
        this.pumpEjected = true;
        this.eject();
      }
      if (v > 1) {
        this.pumpT = -1;
        this.pumpEjected = false;
      }
    } else if (s.state === 'pump') {
      this.pumpT = 0;
    }
    this.pumpStroke = pumpStroke;
    if (P.pump) P.pump.o.position.z = P.pump.pos.z + kit.spec.pump.travel * pumpStroke;
    if (P.carrier && this.type === 'shotgun') P.carrier.o.position.z = P.carrier.pos.z + kit.spec.pump.travel * 0.8 * pumpStroke;
    // sniper bolt cycle after a shot: lift, back, forward, down
    this.boltPhase = null;
    if (this.boltT >= 0) {
      this.boltT += dt;
      const b = this.boltT;
      const B = kit.spec.bolt;
      const lift = seg(b, 0.3, 0.38) * (1 - seg(b, 0.6, 0.68));
      const back = seg(b, 0.38, 0.48) * (1 - seg(b, 0.5, 0.6));
      if (b > 0.47 && !this.boltEjected) {
        this.boltEjected = true;
        this.eject();
      }
      if (P.bolt) {
        P.bolt.o.quaternion.copy(P.bolt.quat);
        P.bolt.o.rotateZ(lift * B.lift * DEG);
        P.bolt.o.position.z = P.bolt.pos.z + back * B.back;
      }
      this.bp.hand = seg(b, 0.14, 0.3) * (1 - seg(b, 0.68, 0.84));
      this.bp.lift = lift;
      this.bp.back = back;
      this.boltPhase = this.bp;
      if (b > 0.86) {
        this.boltT = -1;
        this.boltEjected = false;
      }
    }
    // revolver: the cylinder turns a sixth per shot
    if (P.cylinder && a > 0 && this.action === 0) this.cylTurn = (this.cylTurn || 0) + Math.PI / 3;
    if (P.cylinder) {
      // swung out round the crane (an axis along the bore, low on the left), turning a sixth a shot
      const sw = this.cylSwing * 85 * DEG, cr = kit.spec.crane;
      const rx = P.cylinder.pos.x - cr[0], ry = P.cylinder.pos.y - cr[1], c = Math.cos(sw), sn = Math.sin(sw);
      P.cylinder.o.position.set(cr[0] + rx * c - ry * sn, cr[1] + rx * sn + ry * c, P.cylinder.pos.z);
      P.cylinder.o.quaternion.copy(P.cylinder.quat);
      P.cylinder.o.rotateZ(sw + (this.cylTurn || 0));
    }
  }

  /** Both hands: on the weapon, or wherever a reload / action takes them; then the arms. */
  updateHands(dt, s, u) {
    const kit = this.kit, spec = kit.spec;
    // right hand: on the grip (the sniper's bolt hand goes to the knob)
    _M1.multiplyMatrices(this.gunM, kit.gripR);
    _M1.decompose(this.handPR, this.handQR, _hs);
    this.fingerR.set(this.trig > 0 ? kit.poseRFire : kit.poseR);
    if (this.boltPhase && this.boltPhase.hand > 0) this.boltHand(this.boltPhase);
    // left hand: on the support position
    _M1.multiplyMatrices(this.gunM, kit.gripL);
    _M1.decompose(this.handPL, this.handQL, _hs);
    this.fingerL.set(kit.poseL);
    if (this.pumpStroke > 0 && kit.parts.pump) {
      _V1.set(0, 0, kit.spec.pump.travel * this.pumpStroke).applyQuaternion(this.gunQ);
      this.handPL.add(_V1);
    }
    if (s.state === 'reload' || this.reloadBlend > 0) this.reloadHands(dt, s, u);
    this.armR.setHand(_M1.compose(this.handPR, this.handQR, ONE));
    this.armR.setFingers(this.fingerR);
    this.armL.setHand(_M1.compose(this.handPL, this.handQL, ONE));
    this.armL.setFingers(this.fingerL);
  }

  /** Sniper: the right hand leaves the grip for the bolt knob and works it. */
  boltHand(bp) {
    const kit = this.kit;
    const bolt = kit.parts.bolt.o;
    // the hand rides on the bolt (lifted and drawn back with it)
    bolt.updateMatrixWorld(true);
    _M2.multiplyMatrices(bolt.matrixWorld, kit.boltHandM);
    _M2.decompose(_V2, _Q2, _hs);
    const w = smooth01(bp.hand);
    this.handPR.lerp(_V2, w);
    this.handQR.slerp(_Q2, w);
    for (let i = 0; i < POSE_N; i++) this.fingerR[i] = lerp(this.fingerR[i], BOLT_PINCH[i], w);
  }

  /**
   * Support hand during a reload. Keyframes are hand transforms (camera space): GRIP (on the
   * weapon), GRAB (on the magazine, which may be pulled out by `off` metres along its axis),
   * POUCH (below the view, fetching a new one). The magazine rides in the hand while held.
   */
  reloadHands(dt, s, u) {
    const kit = this.kit, spec = kit.spec, R = this.rl;
    const active = s.state === 'reload';
    if (active) {
      if (s.empty) u /= 1.12;
      // a new reload (or the next shell) when the clock went backwards
      if (u < R.lastU - 0.02 || !R.on) {
        if (!R.on || spec.action !== 'pump') this.resetReload(true);
        R.shells++;
      }
      R.lastU = u;
      R.on = true;
      R.w = Math.min(1, R.w + dt * 12);
      if (spec.action === 'pump') this.shellReload(dt, s, u);
      else if (spec.action === 'revolver') this.revolverReload(dt, s, u);
      else this.magReload(dt, s, u);
    } else {
      if (R.on) this.finishReload();
      R.w = Math.max(0, R.w - dt * 6);
    }
    this.reloadBlend = R.w;
    if (R.w <= 0) return;
    // blend the support hand from its grip to the reload target
    const w = smooth01(R.w);
    this.handPL.lerp(R.p, w);
    this.handQL.slerp(R.q, w);
    for (let i = 0; i < POSE_N; i++) this.fingerL[i] = lerp(this.fingerL[i], R.f[i], w);
  }

  resetReload(full) {
    const R = this.rl, P = this.kit.parts;
    R.dropped = false;
    R.fresh = false;
    R.seated = true;
    R.ejected = false;
    if (full) R.shells = 0;
    if (P.mag) {
      P.mag.matrixAutoUpdate = true;
      P.mag.position.set(0, 0, 0);
      P.mag.quaternion.identity();
      P.mag.visible = true;
      if (P.magBody) P.magBody.visible = false;
    }
  }

  finishReload() {
    const R = this.rl, P = this.kit.parts;
    R.on = false;
    // whatever was in flight is put back where it belongs
    if (P.mag) {
      P.mag.matrixAutoUpdate = true;
      P.mag.position.set(0, 0, 0);
      P.mag.quaternion.identity();
      P.mag.visible = true;
      if (P.magBody) P.magBody.visible = false;
    }
    if (this.shell) this.shell.visible = false;
    if (this.loader) this.loader.visible = false;
    this.cylSwing = 0;
    this.revTip = 0;
    this.slideHold = 0;
  }

  /** Hand transform for a frame `M` (object space) on the gun, optionally moved along the magazine axis. */
  onGun(M, off, outP, outQ) {
    _M2.copy(M);
    if (off) {
      const ax = this.kit.magAxis;
      _M3.makeTranslation(-ax.x * off, -ax.y * off, -ax.z * off);
      _M2.premultiply(_M3);
    }
    _M2.premultiply(this.gunM);
    _M2.decompose(outP, outQ, _hs);
  }

  /** The pouch: down out of view below the support hand's grip, turned palm up. */
  pouch(outP, outQ) {
    _M2.multiplyMatrices(this.gunM, this.kit.gripL);
    _M2.decompose(outP, outQ, _hs);
    outP.x -= 0.06;
    outP.y -= 0.34;
    outP.z += 0.1;
    outQ.premultiply(eulerQ(_Q2, -35, 10, 25));
  }

  /** Keyframe blend: from (aP, aQ) to (bP, bQ) by t, written to the reload target. */
  rlTarget(aP, aQ, bP, bQ, t) {
    const R = this.rl;
    R.p.lerpVectors(aP, bP, t);
    R.q.slerpQuaternions(aQ, bQ, t);
    // a small arc: dip the path down in the middle of a move
    R.p.y -= Math.sin(t * Math.PI) * 0.03;
  }

  /** Magazine reload (pistol, rifle, SMG, sniper). */
  magReload(dt, s, u) {
    const kit = this.kit, spec = kit.spec, R = this.rl, P = kit.parts, M = spec.mag;
    const free = !!M.free; // pistol: the magazine drops out by itself
    const tA = _V1, tB = _V2, qA = _Q1, qB = _Q2;
    const relax = kit.poseRelax;
    let held = false; // the magazine rides in the hand
    let off = 0; // magazine travel out of the well (seated = 0)
    if (free) {
      // the old magazine slides out under its own weight and falls
      if (!R.dropped) {
        const v = seg(u, 0.05, 0.16);
        off = v * v * M.travel;
        if (u >= 0.16) this.dropMag();
      }
      if (u < 0.3) {
        this.onGun(kit.gripL, 0, tA, qA);
        this.pouch(tB, qB);
        this.rlTarget(tA, qA, tB, qB, seg(u, 0.02, 0.3));
        this.mixFingers(kit.poseL, relax, seg(u, 0.02, 0.2));
      } else if (u < 0.56) {
        this.pouch(tA, qA);
        this.onGun(kit.grabL, M.travel * 0.6, tB, qB);
        this.rlTarget(tA, qA, tB, qB, seg(u, 0.4, 0.56));
        this.mixFingers(relax, kit.poseGrab, seg(u, 0.36, 0.46));
        held = u > 0.38;
      } else if (u < 0.66) {
        off = M.travel * 0.6 * (1 - seg(u, 0.56, 0.645));
        this.onGun(kit.grabL, off, R.p, R.q);
        this.mixFingers(kit.poseGrab, kit.poseGrab, 1);
        held = true;
      } else if (s.empty && kit.slideL) {
        // rack the slide: overhand on the slide, pull back, let it fly
        this.onGun(kit.grabL, 0, tA, qA);
        this.onGun(kit.slideL, 0, tB, qB);
        const back = seg(u, 0.78, 0.84) * (1 - seg(u, 0.86, 0.88));
        if (u < 0.78) this.rlTarget(tA, qA, tB, qB, seg(u, 0.66, 0.78));
        else if (u < 0.9) {
          R.p.copy(tB);
          R.q.copy(qB);
          _V3.set(0, 0, 0.026 * back).applyQuaternion(this.gunQ);
          R.p.add(_V3);
        } else {
          this.onGun(kit.gripL, 0, tA, qA);
          this.rlTarget(tB, qB, tA, qA, seg(u, 0.9, 1.0));
        }
        this.slideHold = u >= 0.78 && u < 0.88 ? back : u < 0.78 ? 1 : 0;
        this.mixFingers(kit.poseGrab, kit.poseSlide, seg(u, 0.68, 0.78) * (1 - seg(u, 0.9, 1)));
        if (u >= 0.9) this.mixFingers(kit.poseSlide, kit.poseL, seg(u, 0.9, 1));
      } else {
        this.onGun(kit.grabL, 0, tA, qA);
        this.onGun(kit.gripL, 0, tB, qB);
        this.rlTarget(tA, qA, tB, qB, seg(u, 0.66, 0.84));
        this.mixFingers(kit.poseGrab, kit.poseL, seg(u, 0.66, 0.8));
      }
    } else {
      if (u < 0.1) {
        this.onGun(kit.gripL, 0, tA, qA);
        this.onGun(kit.grabL, 0, tB, qB);
        this.rlTarget(tA, qA, tB, qB, seg(u, 0.0, 0.1));
        this.mixFingers(kit.poseL, kit.poseGrab, seg(u, 0.04, 0.1));
      } else if (u < 0.18) {
        off = M.travel * seg(u, 0.1, 0.18);
        this.onGun(kit.grabL, off, R.p, R.q);
        this.mixFingers(kit.poseGrab, kit.poseGrab, 1);
        held = true;
      } else if (u < 0.46) {
        this.onGun(kit.grabL, M.travel, tA, qA);
        this.pouch(tB, qB);
        this.rlTarget(tA, qA, tB, qB, seg(u, 0.18, 0.32));
        held = !R.dropped;
        if (u >= 0.25 && !R.dropped) {
          this.placeHeldMag(); // where the hand has it now
          this.dropMag();
          held = false;
        }
        this.mixFingers(kit.poseGrab, relax, seg(u, 0.25, 0.32) * (1 - seg(u, 0.38, 0.46)));
        if (u >= 0.38) this.mixFingers(relax, kit.poseGrab, seg(u, 0.38, 0.46));
        if (u > 0.4) held = true; // the new one
      } else if (u < 0.58) {
        this.pouch(tA, qA);
        this.onGun(kit.grabL, M.travel * 1.6, tB, qB);
        this.rlTarget(tA, qA, tB, qB, seg(u, 0.46, 0.58));
        this.mixFingers(kit.poseGrab, kit.poseGrab, 1);
        held = true;
      } else if (u < 0.66) {
        off = M.travel * 1.6 * (1 - seg(u, 0.58, 0.655));
        this.onGun(kit.grabL, off, R.p, R.q);
        this.mixFingers(kit.poseGrab, kit.poseGrab, 1);
        held = true;
      } else if (s.empty && kit.chargeL) {
        // charging handle / bolt catch, then back to the grip
        this.onGun(kit.grabL, 0, tA, qA);
        this.onGun(kit.chargeL, 0, tB, qB);
        if (u < 0.8) this.rlTarget(tA, qA, tB, qB, seg(u, 0.66, 0.78));
        else {
          this.onGun(kit.gripL, 0, tA, qA);
          R.p.copy(tB);
          R.q.copy(qB);
          _V3.set(0, 0, 0.035 * seg(u, 0.8, 0.86) * (1 - seg(u, 0.88, 0.9))).applyQuaternion(this.gunQ);
          R.p.add(_V3);
          if (u > 0.9) this.rlTarget(tB, qB, tA, qA, seg(u, 0.9, 1.0));
        }
        this.mixFingers(kit.poseGrab, kit.poseCharge, seg(u, 0.66, 0.76) * (1 - seg(u, 0.92, 1)));
        if (u >= 0.92) this.mixFingers(kit.poseCharge, kit.poseL, seg(u, 0.92, 1));
      } else {
        this.onGun(kit.grabL, 0, tA, qA);
        this.onGun(kit.gripL, 0, tB, qB);
        this.rlTarget(tA, qA, tB, qB, seg(u, 0.66, 0.82));
        this.mixFingers(kit.poseGrab, kit.poseL, seg(u, 0.66, 0.78));
      }
    }
    // the magazine: seated, sliding along its axis, or riding in the hand
    if (P.mag) {
      if (R.dropped && !held && !(free && u > 0.38)) P.mag.visible = false;
      else if (held) {
        P.mag.visible = true;
        R.fresh = true;
        this.placeHeldMag();
      } else {
        P.mag.visible = true;
        P.mag.matrixAutoUpdate = true;
        P.mag.position.copy(kit.magAxis).multiplyScalar(-off);
        P.mag.quaternion.identity();
      }
      if (P.magBody) P.magBody.visible = held || off > 0.004;
    }
    // sniper: a new round is chambered with the bolt after an empty reload
    if (spec.action === 'bolt' && s.empty && u > 0.8 && this.boltT < 0 && !R.ejected) {
      R.ejected = true;
      this.boltT = 0.1;
      this.boltNoEject = true;
    }
  }

  mixFingers(a, b, t) {
    const f = this.rl.f;
    for (let i = 0; i < POSE_N; i++) f[i] = lerp(a[i], b[i], t);
  }

  /** The held magazine's transform (gun space) from the hand's current reload target. */
  placeHeldMag() {
    const kit = this.kit, P = kit.parts, R = this.rl;
    // mag (gun space) = gun^-1 * hand * grab^-1  (the grab frame is the hand on a seated magazine)
    _M2.compose(R.p, R.q, ONE);
    _M3.copy(this.gunM).invert();
    _M2.premultiply(_M3);
    _M2.multiply(kit.grabLInv);
    P.mag.matrixAutoUpdate = false;
    P.mag.matrix.copy(_M2);
    P.mag.matrixWorldNeedsUpdate = true;
  }

  /** Let go of the old magazine: a copy falls away with gravity and a tumble. */
  dropMag() {
    const kit = this.kit, P = kit.parts, R = this.rl;
    if (R.dropped || !P.magDrop) return;
    R.dropped = true;
    this.current.updateMatrixWorld(true);
    const d = P.magDrop;
    P.mag.updateMatrixWorld(true);
    P.mag.matrixWorld.decompose(d.position, d.quaternion, _hs);
    d.visible = true;
    d.traverse((o) => {
      if (o !== d) o.visible = true;
    });
    let rec = this.debris.find((x) => x.m === d);
    if (!rec) {
      rec = { m: d, v: new THREE.Vector3(), w: new THREE.Vector3(), t: 0, live: false, life: 1.2 };
      this.debris.push(rec);
    }
    rec.v.set(-0.25 + Math.random() * 0.1, -0.6, 0.2).applyQuaternion(this.gunQ);
    rec.w.set(3 + Math.random() * 2, 0.5, 2 * (Math.random() - 0.5));
    rec.t = 0;
    rec.live = true;
    P.mag.visible = false;
  }

  /** Shotgun: one shell per cycle from below into the loading port. */
  shellReload(dt, s, u) {
    const kit = this.kit, R = this.rl;
    const tA = _V1, tB = _V2, qA = _Q1, qB = _Q2;
    const shell = this.shellMesh();
    const first = R.shells <= 1;
    if (u < 0.32) {
      if (first) this.onGun(kit.gripL, 0, tA, qA);
      else this.portHand(0.026, tA, qA);
      this.pouch(tB, qB);
      this.rlTarget(tA, qA, tB, qB, seg(u, 0, 0.32));
      this.mixFingers(first ? kit.poseL : kit.posePinch, kit.posePinch, 1);
    } else if (u < 0.6) {
      this.pouch(tA, qA);
      this.portHand(-0.03, tB, qB);
      this.rlTarget(tA, qA, tB, qB, seg(u, 0.32, 0.6));
      this.mixFingers(kit.posePinch, kit.posePinch, 1);
    } else {
      this.portHand(-0.03 + 0.056 * seg(u, 0.6, 0.76), R.p, R.q);
      this.mixFingers(kit.posePinch, kit.posePush, seg(u, 0.62, 0.74));
      if (u > 0.82) {
        this.pouch(tB, qB);
        tA.copy(R.p);
        qA.copy(R.q);
        this.rlTarget(tA, qA, tB, qB, seg(u, 0.82, 1.0) * 0.5);
      }
    }
    // the shell rides in the fingers until it is pushed home
    shell.visible = u > 0.3 && u < 0.75;
    if (shell.visible) {
      _M2.compose(R.p, R.q, ONE).multiply(kit.shellInHand);
      _M2.decompose(shell.position, shell.quaternion, _hs);
    }
  }

  /** Support hand at the shotgun's loading port, raised by `lift` (pushing the shell in). */
  portHand(lift, p, q) {
    _M2.copy(this.kit.portL);
    _M3.makeTranslation(0, lift, -lift * 0.6);
    _M2.premultiply(_M3).premultiply(this.gunM);
    _M2.decompose(p, q, _hs);
  }

  shellMesh() {
    if (!this.shell) {
      const g = new THREE.Group();
      const hull = new THREE.Mesh(new THREE.CylinderGeometry(0.0101, 0.0101, 0.056, 16).rotateX(Math.PI / 2).translate(0, 0, -0.008), new THREE.MeshStandardMaterial({ color: 0x9c1f1a, roughness: 0.45 }));
      const head = new THREE.Mesh(new THREE.CylinderGeometry(0.0112, 0.0112, 0.013, 16).rotateX(Math.PI / 2).translate(0, 0, 0.0265), new THREE.MeshStandardMaterial({ color: 0xc9a14c, metalness: 1, roughness: 0.3 }));
      const crimp = new THREE.Mesh(new THREE.SphereGeometry(0.0101, 14, 6, 0, Math.PI * 2, 0, Math.PI / 2).rotateX(-Math.PI / 2).scale(1, 1, 0.25).translate(0, 0, -0.036), hull.material);
      g.add(hull, head, crimp);
      g.visible = false;
      this.scene.add(g);
      this.shell = g;
    }
    return this.shell;
  }

  /** Revolver: swing the cylinder out, tip the empties out, a speedloader in, close. */
  revolverReload(dt, s, u) {
    const kit = this.kit, R = this.rl;
    const tA = _V1, tB = _V2, qA = _Q1, qB = _Q2;
    this.cylSwing = seg(u, 0.1, 0.2) * (1 - seg(u, 0.7, 0.8));
    // gun attitude: muzzle up to tip the empties out, then down to load
    this.revTip = seg(u, 0.18, 0.28) * (1 - seg(u, 0.32, 0.42)) * 50 - seg(u, 0.34, 0.44) * (1 - seg(u, 0.74, 0.86)) * 22;
    if (u < 0.12) {
      this.onGun(kit.gripL, 0, tA, qA);
      this.onGun(kit.cylL, 0, tB, qB);
      this.rlTarget(tA, qA, tB, qB, seg(u, 0, 0.12));
      this.mixFingers(kit.poseL, kit.poseRelax, seg(u, 0, 0.12));
    } else if (u < 0.32) {
      this.onGun(kit.cylL, 0, R.p, R.q);
      this.mixFingers(kit.poseRelax, kit.poseRelax, 1);
      if (u > 0.25 && !R.ejected) {
        R.ejected = true;
        this.ejectCylinder();
      }
    } else if (u < 0.48) {
      this.onGun(kit.cylL, 0, tA, qA);
      this.pouch(tB, qB);
      this.rlTarget(tA, qA, tB, qB, seg(u, 0.32, 0.46));
      this.mixFingers(kit.poseRelax, kit.posePinch, seg(u, 0.36, 0.46));
    } else if (u < 0.7) {
      this.pouch(tA, qA);
      this.onGun(kit.loaderL, 0, tB, qB);
      this.rlTarget(tA, qA, tB, qB, seg(u, 0.48, 0.62));
      _V3.set(0, 0, -0.012 * seg(u, 0.62, 0.68)).applyQuaternion(this.gunQ);
      R.p.add(_V3);
      this.mixFingers(kit.posePinch, kit.posePinch, 1);
    } else {
      this.onGun(kit.loaderL, 0, tA, qA);
      this.onGun(kit.cylL, 0, tB, qB);
      if (u < 0.8) this.rlTarget(tA, qA, tB, qB, seg(u, 0.7, 0.76));
      else {
        this.onGun(kit.gripL, 0, tA, qA);
        this.rlTarget(tB, qB, tA, qA, seg(u, 0.8, 0.95));
      }
      this.mixFingers(kit.posePinch, kit.poseL, seg(u, 0.72, 0.9));
    }
    const loader = this.loaderMesh();
    loader.visible = u > 0.44 && u < 0.69;
    if (loader.visible) {
      _M2.compose(R.p, R.q, ONE).multiply(kit.loaderInHand);
      _M2.decompose(loader.position, loader.quaternion, _hs);
    }
  }

  loaderMesh() {
    if (!this.loader) {
      const g = new THREE.Group();
      const brass = new THREE.MeshStandardMaterial({ color: 0xc9a14c, metalness: 1, roughness: 0.3 });
      const body = new THREE.Mesh(new THREE.CylinderGeometry(0.019, 0.019, 0.012, 20).rotateX(Math.PI / 2), new THREE.MeshStandardMaterial({ color: 0x18181a, roughness: 0.5 }));
      body.position.z = 0.006;
      const knob = new THREE.Mesh(new THREE.CylinderGeometry(0.008, 0.009, 0.012, 14).rotateX(Math.PI / 2), body.material);
      knob.position.z = 0.017;
      g.add(body, knob);
      for (let k = 0; k < 6; k++) {
        const a = Math.PI / 2 + (k * Math.PI) / 3;
        const r = new THREE.Mesh(new THREE.CylinderGeometry(0.0045, 0.0045, 0.03, 10).rotateX(Math.PI / 2), brass);
        r.position.set(Math.cos(a) * 0.0129, Math.sin(a) * 0.0129, -0.015);
        g.add(r);
      }
      g.visible = false;
      this.scene.add(g);
      this.loader = g;
    }
    return this.loader;
  }

  /** Six empties out of the swung-out cylinder. */
  ejectCylinder() {
    const P = this.kit.parts;
    if (!P.cylinder || typeof this.factory.createCasingMesh !== 'function') return;
    P.cylinder.o.updateMatrixWorld(true);
    for (let k = 0; k < 6; k++) {
      const a = Math.PI / 2 + (k * Math.PI) / 3;
      _V3.set(Math.cos(a) * 0.0129, Math.sin(a) * 0.0129, 0.012).applyMatrix4(P.cylinder.o.matrixWorld);
      this.eject(_V3, true);
    }
  }

  updateDebris(dt) {
    for (let i = this.debris.length - 1; i >= 0; i--) {
      const c = this.debris[i];
      if (!c.live) continue;
      c.t += dt;
      c.v.y -= 9.81 * dt;
      c.m.position.addScaledVector(c.v, dt);
      c.m.rotation.x += c.w.x * dt;
      c.m.rotation.y += c.w.y * dt;
      c.m.rotation.z += c.w.z * dt;
      if (c.t > c.life) {
        c.live = false;
        c.m.visible = false;
        this.debris.splice(i, 1);
      }
    }
  }

  // ------------------------------------------------------------------------------------------
  // MELEE ITEMS (knife, bat, fists) and the boot
  // ------------------------------------------------------------------------------------------
  /** Knife / bat: the model, the hands' frames on it and their solved finger poses. Fists: no item. */
  buildMeleeKit(type) {
    const kit = { type, melee: true, parts: {}, spec: { recoil: { back: 0.03, up: 4, roll: 1, side: 1 }, sight: {} } };
    const G = MELEE_GRIP[type];
    if (G) {
      kit.model = createMeleeModel(type);
      const shape = makeShape(G.shape);
      const pre = Float32Array.from(POWER);
      pre[16] = 30;
      pre[17] = 25;
      pre[18] = -40;
      kit.gripR = handFrame(1, G.R.K, G.R.W, G.R.index);
      kit.poseR = solveGrip(1, kit.gripR, shape, pre);
      if (G.L) {
        kit.gripL = handFrame(-1, G.L.K, G.L.W, G.L.index);
        kit.poseL = solveGrip(-1, kit.gripL, shape, pre);
      }
      kit.strike = kit.model.getObjectByName(type === 'knife' ? 'tip' : 'sweet');
    } else kit.model = new THREE.Group(); // fists: an empty anchor
    kit.model.traverse((o) => {
      if (o.isMesh) o.castShadow = o.receiveShadow = false;
    });
    return kit;
  }

  /** Pose of one animated part at the current move phase into (outP, outQ); null when idle. */
  meleePart(name, idle, m, M, outP, outQ) {
    const keys = M && m && MOVE_KEYS[m.move] ? MOVE_KEYS[m.move][name] : null;
    if (!keys) {
      outP.fromArray(idle.p);
      outQ.copy(idle.q);
      return;
    }
    const st = this.mState;
    const from = st.from[name];
    if (m.phase === 'windup') {
      const u = smooth01(m.t / Math.max(0.01, M.windup));
      outP.fromArray(keys.windup.p).sub(from.p).multiplyScalar(u).add(from.p);
      outQ.slerpQuaternions(from.q, keys.windup.q, u);
    } else if (m.phase === 'charge') {
      const c = clamp(m.charge ?? 1, 0, 1), C = keys.charge;
      outP.fromArray(keys.windup.p);
      outQ.copy(keys.windup.q);
      if (C) {
        _V3.fromArray(C.p).multiplyScalar(c);
        outP.add(_V3);
        outQ.premultiply(_Qc.setFromAxisAngle(AY, C.turn * c * DEG));
        // the strain of holding it back
        const tr = 0.0016 * c * c;
        outP.x += Math.sin(this.t * 61) * tr;
        outP.y += Math.sin(this.t * 47 + 1) * tr;
      }
    } else if (m.phase === 'strike') {
      const u = this.strikeU;
      const S = keys.strike;
      let i = 0;
      while (i < S.length - 2 && u > S[i + 1].t) i++;
      const a = S[i], b = S[i + 1];
      const w = clamp((u - a.t) / Math.max(1e-4, b.t - a.t), 0, 1);
      // Catmull-Rom through the positions, slerp between the rotations
      const p0 = S[Math.max(0, i - 1)].p, p1 = a.p, p2 = b.p, p3 = S[Math.min(S.length - 1, i + 2)].p;
      const w2 = w * w, w3 = w2 * w;
      for (let k = 0; k < 3; k++) {
        outP.setComponent(k, 0.5 * (2 * p1[k] + (-p0[k] + p2[k]) * w + (2 * p0[k] - 5 * p1[k] + 4 * p2[k] - p3[k]) * w2 + (-p0[k] + 3 * p1[k] - 3 * p2[k] + p3[k]) * w3));
      }
      outQ.slerpQuaternions(a.q, b.q, w);
      // the charge carries into the start of the strike
      if (st.charge > 0 && keys.charge) {
        const c = st.charge * (1 - smooth01(u / 0.3));
        _V3.fromArray(keys.charge.p).multiplyScalar(c);
        outP.add(_V3);
      }
    } else {
      // recover: from wherever the strike ended back to idle
      const u = smooth01(m.t / Math.max(0.01, M.recover));
      outP.fromArray(idle.p).sub(from.p).multiplyScalar(u).add(from.p);
      outQ.slerpQuaternions(from.q, idle.q, u);
    }
  }

  /** A part's pose for this frame, remembered (the next phase starts there), then put on the rig. */
  placePart(name, idlePart, m, M, outP, outQ) {
    const st = this.mState;
    this.meleePart(name, idlePart, m, M, outP, outQ);
    st.last[name].p.copy(outP);
    st.last[name].q.copy(outQ);
    _M2.compose(outP, outQ, ONE).premultiply(this.rigM);
    _M2.decompose(outP, outQ, _hs);
  }

  /** Strike progress, held back by a hit (hit-stop, then a slowed follow-through). */
  strikeProgress(m, M) {
    const u = clamp(m.t / Math.max(0.01, M.strike), 0, 1);
    const h = this.mHit;
    if (!h.on) return u;
    const stop = 0.07 * (0.6 + 0.4 * h.s);
    const after = Math.max(0, m.t - h.at - stop);
    return Math.min(u, h.u + (after / Math.max(0.01, M.strike)) * 0.35);
  }

  /** A fist / free hand frame from a knuckle point and a turn (camera space). */
  fistFrame(side, p, q, outP, outQ) {
    outQ.copy(q);
    const mcp = HAND.fingers[1].mcp;
    _V3.set(mcp[0] * side, mcp[1], mcp[2]).applyQuaternion(outQ);
    outP.copy(p).sub(_V3);
  }

  updateMelee(dt, s, mo) {
    const kit = this.kit, type = kit.type, idle = MELEE_IDLE[type];
    const m = s.melee && MELEE_MOVES[s.melee.move] && MELEE_MOVES[s.melee.move].item === type ? s.melee : null;
    const M = m ? MELEE_MOVES[m.move] : null;
    const st = this.mState;
    // phase changes: remember where each part was (the next phase starts from there)
    const key = m ? m.move + ':' + m.phase : '';
    if (key !== st.key) {
      if (m && m.phase === 'windup') this.mHit.on = false;
      if (m && m.phase === 'strike') st.charge = st.lastCharge;
      for (const n of ['item', 'R', 'L']) {
        st.from[n].p.copy(st.last[n].p);
        st.from[n].q.copy(st.last[n].q);
      }
      st.key = key;
    }
    if (m && m.phase === 'charge') st.lastCharge = clamp(m.charge ?? 1, 0, 1);
    if (m && m.phase === 'windup') st.lastCharge = 0;
    this.strikeU = m && m.phase === 'strike' ? this.strikeProgress(m, M) : 0;
    // the whole rig's motion (sway, bob, sprint, switching, impact recoil) round a pivot
    const rec = this.mRecoil;
    const rz = rec.z.step(dt), ry = rec.y.step(dt), rx = rec.x.step(dt);
    const shake = this.mHit.on ? Math.max(0, 1 - (this.t - this.mHit.wall) / 0.18) : 0;
    _V1.set(mo.px + rx * 0.05 + Math.sin(this.t * 90) * 0.003 * shake, mo.py + ry * 0.04, mo.pz + rz * 0.06);
    eulerQ(_Q1, mo.pitch + ry * 8, mo.yaw - rx * 10, mo.roll);
    _M1.compose(_V1.add(RIG_PIVOT), _Q1, ONE).multiply(_M2.makeTranslation(-RIG_PIVOT.x, -RIG_PIVOT.y, -RIG_PIVOT.z));
    this.rigM.copy(_M1);
    if (type === 'fists') {
      this.placePart('R', idle.R, m, M, _V1, _Q1);
      this.fistFrame(1, _V1, _Q1, this.handPR, this.handQR);
      this.placePart('L', idle.L, m, M, _V2, _Q2);
      this.fistFrame(-1, _V2, _Q2, this.handPL, this.handQL);
      const tight = m && (m.phase === 'strike' || m.phase === 'charge' || m.phase === 'windup') ? 1 : 0.6;
      for (let i = 0; i < POSE_N; i++) {
        this.fingerR[i] = lerp(LOOSE_FIST[i], FIST[i], m && (m.move === 'haymaker') ? 1 : tight);
        this.fingerL[i] = lerp(LOOSE_FIST[i], FIST[i], m && m.move === 'jab' ? 1 : tight);
      }
    } else {
      this.placePart('item', idle.item, m, M, _V1, _Q1);
      this.current.position.copy(_V1);
      this.current.quaternion.copy(_Q1);
      this.current.updateMatrixWorld(true);
      this.gunM.copy(this.current.matrixWorld);
      this.gunP.copy(_V1);
      this.gunQ.copy(_Q1);
      _M1.multiplyMatrices(this.gunM, kit.gripR);
      _M1.decompose(this.handPR, this.handQR, _hs);
      this.fingerR.set(kit.poseR);
      if (kit.gripL) {
        _M1.multiplyMatrices(this.gunM, kit.gripL);
        _M1.decompose(this.handPL, this.handQL, _hs);
        this.fingerL.set(kit.poseL);
      } else {
        // knife: the free hand in a low guard, coming up a little on the strike
        this.placePart('L', idle.L, m, M, _V2, _Q2);
        this.fistFrame(-1, _V2, _Q2, this.handPL, this.handQL);
        this.fingerL.set(LOOSE_FIST);
      }
    }
    this.armR.setHand(_M1.compose(this.handPR, this.handQR, ONE));
    this.armR.setFingers(this.fingerR);
    this.armL.setHand(_M1.compose(this.handPL, this.handQL, ONE));
    this.armL.setFingers(this.fingerL);
  }

  /** The leg rig (built on first use: the boot is meshed from its SDF). */
  legRig() {
    if (!this.leg) {
      this.bootMat = detailMaterial({ colors: [0x2b2622, 0x4f4535, 0x1c1b1a, 0x3a3631], rough: [0.5, 0.85, 0.9, 0.7], weave: 0.0012, sheen: 0.25 });
      this.leg = new LegRig(this.trouserMat, createMeleeModel('boot', this.bootMat));
      this.leg.root.visible = false;
      this.scene.add(this.leg.root);
    }
    return this.leg;
  }

  /** Stomp / kick: the boot swings up into view; returns the envelope (0 = not kicking). */
  updateBoot(dt, s) {
    const m = s.melee && LEG_KEYS[s.melee.move] ? s.melee : null;
    const st = this.bState;
    if (!m) {
      if (this.leg) this.leg.root.visible = false;
      st.key = '';
      return 0;
    }
    const L = this.legRig(), K = LEG_KEYS[m.move], V = BOOT_VIEW[m.move], M = MELEE_MOVES[m.move];
    const key = m.move + ':' + m.phase;
    if (key !== st.key) {
      if (m.phase === 'windup') this.mHit.on = false;
      const fresh = st.key === '' || !st.key.startsWith(m.move);
      st.fromP.copy(fresh ? BOOT_VIEW.rest.A : st.lastP);
      st.fromQ.copy(fresh ? BOOT_VIEW.rest.q : st.lastQ);
      st.fromPhys.copy(fresh ? st.restPhys.set(-0.11, 0, 0.04) : st.physP);
      st.fromPitch = fresh ? 0 : st.physPitch;
      st.key = key;
    }
    // where the boot really is (body space: from the eye, x right, y up, z back)
    const eyeH = lerp(1.63, 1.09, clamp(s.crouch || 0, 0, 1));
    const ground = -eyeH - BOOT.ground; // ankle height with the sole on the ground
    st.restPhys.set(-0.11, ground, 0.04);
    const wind = _V2.fromArray(K.windup.p), hit = _V3.fromArray(K.strike.p);
    if (m.move === 'stomp') hit.y = ground + 0.005;
    let u = 0, phase = 0;
    if (m.phase === 'windup' || m.phase === 'charge') {
      u = m.phase === 'charge' ? 1 : smooth01(m.t / Math.max(0.01, M.windup));
      st.physP.lerpVectors(st.fromPhys, wind, u);
      st.physPitch = lerp(st.fromPitch, K.windup.pitch, u);
    } else if (m.phase === 'strike') {
      const v = this.strikeProgress(m, M);
      this.strikeU = v;
      u = v * v * (3 - 2 * v) * 0.5 + v * 0.5;
      st.physP.lerpVectors(wind, hit, u);
      if (m.move === 'stomp') st.physP.y += Math.sin(u * Math.PI) * 0.06;
      st.physPitch = lerp(K.windup.pitch, K.strike.pitch, u);
      phase = 1;
    } else {
      u = smooth01(m.t / Math.max(0.01, M.recover));
      st.physP.lerpVectors(st.fromPhys, st.restPhys, u);
      st.physPitch = lerp(st.fromPitch, 0, u);
      phase = 2;
    }
    st.viewPitch = s.pitch ?? (m.move === 'stomp' ? -0.75 : 0);
    // what is drawn: the view keyframes
    const A = st.lastP, q = st.lastQ;
    if (phase === 0) {
      A.lerpVectors(st.fromP, V.windup.A, u);
      q.slerpQuaternions(st.fromQ, V.windup.q, u);
    } else if (phase === 1) {
      A.lerpVectors(V.windup.A, V.strike.A, u);
      q.slerpQuaternions(V.windup.q, V.strike.q, u);
    } else {
      A.lerpVectors(st.fromP, BOOT_VIEW.rest.A, u);
      q.slerpQuaternions(st.fromQ, BOOT_VIEW.rest.q, u);
    }
    // a hit: the boot stops dead and is pushed back a little
    if (this.mHit.on) A.z += this.mRecoil.z.x * 0.03;
    L.set(A, q);
    L.root.visible = true;
    return phase === 2 ? 1 - u : 1;
  }

  /**
   * The striking point in view-camera space (metres; map it into the world like the muzzle):
   * the knife's tip, the bat's sweet spot, the knuckles of the punching fist, the boot's sole
   * (stomp / kick: the physical position, without the bias that keeps the boot in sight). With
   * a gun and no boot move, its muzzle. worldFov (deg, optional): re-project the point so it
   * lines up with what is drawn when the world camera's FOV differs from the viewmodel's.
   */
  meleeCameraSpace(out, worldFov = 0) {
    const mv = this.lastMelee;
    if (mv && LEG_KEYS[mv] && this.leg && this.leg.root.visible) {
      this.leg.root.updateMatrixWorld(true);
      // physical sole: the unscaled ankle plus the sole offset turned with the foot, into view space
      const st = this.bState;
      _Q1.setFromAxisAngle(AX, st.physPitch * DEG).multiply(_Q2.setFromAxisAngle(AY, Math.PI));
      out.fromArray(BOOT.sole).applyQuaternion(_Q1).add(st.physP).applyAxisAngle(AX, -st.viewPitch);
    } else if (this.kit && this.kit.melee) {
      if (this.kit.strike) {
        this.current.updateMatrixWorld(true);
        this.kit.strike.getWorldPosition(out);
      } else {
        // fists: in front of the knuckles of the hand that punches
        const left = mv === 'jab';
        const P = left ? this.handPL : this.handPR, Q = left ? this.handQL : this.handQR;
        out.set(left ? -0.004 : 0.004, -0.006, 0.114).applyQuaternion(Q).add(P);
      }
    } else return this.muzzleCameraSpace(out);
    if (worldFov > 0) {
      const k = Math.tan((worldFov * DEG) / 2) / Math.tan((this.camera.fov * DEG) / 2);
      out.x *= k;
      out.y *= k;
    }
    return out;
  }

  /** A strike connected: the swing stops dead for a moment, recoils, then follows through slowly. */
  meleeImpact(strength = 1) {
    const s = clamp(strength, 0, 2);
    const h = this.mHit;
    if (h.on) return;
    h.on = true;
    h.s = s;
    h.u = this.strikeU;
    h.at = this.lastMeleeT;
    h.wall = this.t;
    const mv = this.lastMelee;
    const k = mv === 'swing' || mv === 'haymaker' ? 1.6 : mv === 'stomp' || mv === 'kick' ? 1.2 : 0.9;
    this.mRecoil.z.v += 3.2 * s * k;
    this.mRecoil.y.v += 1.4 * s * k;
    this.mRecoil.x.v += (mv === 'slash' || mv === 'swing' ? 2.5 : -0.6) * s * k;
  }

  render(renderer) {
    if (!this.visible || !this.current) return;
    if (this.pose.scope >= 0.999) return; // the host's scope overlay covers the view
    renderer.clearDepth();
    renderer.render(this.scene, this.camera);
  }
}

export { GUNS, HAND, REST_POSE, POSE_N, handFK, makeFK, ArmRig, gloveGeometry, sleeveGeometry, detailMaterial };
