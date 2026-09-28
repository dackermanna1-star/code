// First-person arms: ONE skinned mesh per arm (forearm + hand, 18 bones).
// The hand is sculpted as a signed-distance field (metacarpals, thenar and
// hypothenar pads, knuckles, tapered elliptical phalanges, finger pads) and
// polygonised with surface nets in a flat bind pose; the forearm and the
// survivor's sleeves are lofted tubes that reuse the painted character atlas
// (skin tone, tattoos, arm hair, sleeves, Louis's watch on his left wrist).
// Weights are rigid along each phalanx and blend over a few millimetres at
// every joint, so a hand pose is just 18 bone rotations (see gripPoses.js).
// The hand's skin is shaded procedurally on top of the survivor's tone: nails
// (lunula, free edge, polish), knuckle wrinkles, joint creases, palm lines,
// pores, tendons and veins, with the characters' wrap-lit "subsurface" model.
import * as THREE from 'three';
import { Piece, tube, limbPoint, farmBump, pieceGeometry, FARM_KEYS, RECT, catmull } from '../entities/partgeo.js';
import { getCharacterAsset, SURV } from '../entities/charlooks.js';
import { characterMaterial } from '../entities/charshade.js';

export const FA_LEN = 0.3; // forearm: elbow -> wrist centre (m)
const Y_CUT = -0.03; // hand mesh starts here (hand space, before hand scale); forearm tube below

// ------------------------------------------------------------------ bones --
// 0 forearm, 1 hand (wrist), 2 cup (ring/pinky metacarpals), then 3 bones per
// chain: thumb (metacarpal, proximal, distal), index, middle, ring, pinky.
export const B = { FOREARM: 0, HAND: 1, CUP: 2, THUMB: 3, INDEX: 6, MIDDLE: 9, RING: 12, PINKY: 15 };
export const NBONES = 18;
export const CHAIN_BONE = [3, 6, 9, 12, 15];
const CHAIN_PARENT = [B.HAND, B.HAND, B.HAND, B.CUP, B.CUP];
// Pose layout (anatomical angles, radians; the same numbers work for either hand):
//   fingers f = 0 index .. 3 pinky: [4f] splay (radial +), [4f+1] MCP flex, [4f+2] PIP flex, [4f+3] DIP flex
//   thumb: [16] CMC flex (across the palm), [17] CMC palmar abduction, [18] CMC axial rotation (opposition), [19] MCP flex, [20] IP flex
//   [21] palm cup (ring/pinky metacarpals roll towards the palm)
export const POSE_LEN = 22;
export const P_T = 16, P_CUP = 21;

// ------------------------------------------------------------- anatomy --
// Right hand, hand space (metres, unscaled): origin at the wrist centre,
// +X dorsal (back of the hand), +Y distal (towards the knuckles), +Z radial
// (thumb side). The left hand is the exact mirror (z -> -z).
const FINGER_DEF = [
  // mcp joint, metacarpal base, bind splay, phalanx lengths, radii at MCP/PIP/DIP/tip, metacarpal radii base/head
  { mcp: [-0.0036, 0.0880, 0.0278], base: [-0.0030, 0.026, 0.0135], sp: 0.16, len: [0.0430, 0.0245, 0.0200], r: [0.0097, 0.0090, 0.0079, 0.0071], mr: [0.0120, 0.0118] },
  { mcp: [-0.0012, 0.0920, 0.0086], base: [-0.0005, 0.027, 0.0042], sp: 0.04, len: [0.0475, 0.0285, 0.0210], r: [0.0100, 0.0093, 0.0081, 0.0073], mr: [0.0122, 0.0120] },
  { mcp: [-0.0022, 0.0885, -0.0105], base: [-0.0010, 0.026, -0.0055], sp: -0.10, len: [0.0445, 0.0275, 0.0205], r: [0.0094, 0.0088, 0.0077, 0.0070], mr: [0.0118, 0.0115] },
  { mcp: [-0.0050, 0.0790, -0.0287], base: [-0.0035, 0.024, -0.0150], sp: -0.24, len: [0.0345, 0.0200, 0.0185], r: [0.0083, 0.0077, 0.0069, 0.0062], mr: [0.0113, 0.0106] },
];
const THUMB_DEF = { cmc: [-0.0085, 0.0235, 0.0195], dir: [-0.24, 0.70, 0.67], dorsal: [0.55, 0.0, 0.84], len: [0.0440, 0.0320, 0.0235], r: [0.0150, 0.0113, 0.0106, 0.0097, 0.0087] };
const CUP_PIVOT = [0.0, 0.024, -0.009];

const v3 = (a) => new THREE.Vector3(a[0], a[1], a[2]);
function frameQ(X, Y) {
  const x = X.clone(), y = Y.clone().normalize();
  x.addScaledVector(y, -x.dot(y)).normalize();
  const z = new THREE.Vector3().crossVectors(x, y);
  return new THREE.Quaternion().setFromRotationMatrix(new THREE.Matrix4().makeBasis(x, y, z));
}

// o: {female 0..1, knuckles (age) 0..1}
export function handAnatomy(o = {}) {
  const fem = o.female || 0;
  const kr = 1 - 0.075 * fem, kl = 1 - 0.02 * fem;
  const chains = [];
  {
    const T = THUMB_DEF;
    const Y = v3(T.dir).normalize();
    const q = frameQ(v3(T.dorsal), Y);
    const X = new THREE.Vector3(1, 0, 0).applyQuaternion(q), Z = new THREE.Vector3(0, 0, 1).applyQuaternion(q);
    const J = [v3(T.cmc)];
    const len = T.len.map((l) => l * kl);
    for (let i = 0; i < 3; i++) J.push(J[i].clone().addScaledVector(Y, len[i]));
    chains.push({ thumb: true, J, len, q, X, Y, Z, r: T.r.map((r) => r * kr), ex: 0.9, sp: 0 });
  }
  for (const F of FINGER_DEF) {
    const Y = new THREE.Vector3(0, Math.cos(F.sp), Math.sin(F.sp));
    const q = frameQ(new THREE.Vector3(1, 0, 0), Y);
    const X = new THREE.Vector3(1, 0, 0).applyQuaternion(q), Z = new THREE.Vector3(0, 0, 1).applyQuaternion(q);
    const J = [v3(F.mcp)];
    const len = F.len.map((l) => l * kl);
    for (let i = 0; i < 3; i++) J.push(J[i].clone().addScaledVector(Y, len[i]));
    chains.push({ J, len, q, X, Y, Z, r: F.r.map((r) => r * kr), ex: 0.87, sp: F.sp, base: v3(F.base), mr: F.mr.map((r) => r * (1 - 0.05 * fem)) });
  }
  return { fem, knuckles: o.knuckles ?? 0.4, chains, cup: v3(CUP_PIVOT) };
}

// ------------------------------------------------------------ pose math --
const _e = new THREE.Euler(), _qa = new THREE.Quaternion(), _qb = new THREE.Quaternion();
const AX = new THREE.Vector3(1, 0, 0), AY = new THREE.Vector3(0, 1, 0), AZ = new THREE.Vector3(0, 0, 1);
// Local pose rotation of bone `i` of chain `c` (anatomical, right-hand frame).
export function chainPoseQuat(A, pose, c, i, out) {
  if (c === 0) {
    const o = P_T;
    if (i === 0) {
      out.setFromAxisAngle(AX, pose[o + 1]);
      out.multiply(_qa.setFromAxisAngle(AZ, pose[o]));
      out.multiply(_qa.setFromAxisAngle(AY, pose[o + 2]));
    } else out.setFromAxisAngle(AZ, pose[o + 2 + i]);
    return out;
  }
  const o = (c - 1) * 4;
  if (i === 0) {
    out.setFromAxisAngle(AX, pose[o] - A.chains[c].sp);
    out.multiply(_qa.setFromAxisAngle(AZ, pose[o + 1]));
  } else out.setFromAxisAngle(AZ, pose[o + 1 + i]);
  return out;
}
export function cupQuat(pose, out) {
  out.setFromAxisAngle(AY, pose[P_CUP]);
  return out.multiply(_qa.setFromAxisAngle(AZ, pose[P_CUP] * 0.35));
}
// mirror a right-hand rotation into the left hand's (mirrored) frame
export const mirrorQ = (q) => q.set(-q.x, -q.y, q.z, q.w);

// ---------------------------------------------------------------- SDF --
const clamp = (v, a, b) => (v < a ? a : v > b ? b : v);
const sstep = (a, b, x) => { const t = clamp((x - a) / (b - a), 0, 1); return t * t * (3 - 2 * t); };
function smin(a, b, k) { const h = Math.max(k - Math.abs(a - b), 0) / k; return Math.min(a, b) - h * h * k * 0.25; }
function farmRadii(y, S, k) { // forearm half-thickness (x) and half-width (z) at hand-space y (unscaled)
  const t = Math.min(1, 1 + (y * S) / FA_LEN);
  return [catmull(FARM_KEYS, t, 1) * k / S, catmull(FARM_KEYS, t, 2) * k / S];
}
function wristTable(S, k) { // sampled farmRadii for y in [-0.06, 0]
  const n = 64, tx = new Float32Array(n + 1), tz = new Float32Array(n + 1);
  for (let i = 0; i <= n; i++) { const r = farmRadii(-0.06 + 0.06 * i / n, S, k); tx[i] = r[0]; tz[i] = r[1]; }
  return (y, o) => { const f = clamp((y + 0.06) / 0.06, 0, 1) * n, i = Math.min(n - 1, Math.floor(f)), t = f - i; o[0] = tx[i] + (tx[i + 1] - tx[i]) * t; o[1] = tz[i] + (tz[i + 1] - tz[i]) * t; };
}

function makeSDF(A, S, k) {
  // phalanx / metacarpal cones as flat records (local basis + radii)
  const mk = (o, X, Y, Z, h, r1, r2, ex, ci, i) => {
    const b = (r1 - r2) / h;
    return { ox: o.x, oy: o.y, oz: o.z, xx: X.x, xy: X.y, xz: X.z, yx: Y.x, yy: Y.y, yz: Y.z, zx: Z.x, zy: Z.y, zz: Z.z, h, r1, r2, ex, b, a: Math.sqrt(1 - b * b), ci, i,
      // bounding sphere for early outs
      cx: o.x + Y.x * h * 0.5, cy: o.y + Y.y * h * 0.5, cz: o.z + Y.z * h * 0.5, br: h * 0.5 + Math.max(r1, r2) };
  };
  const segs = [];
  A.chains.forEach((C, ci) => { for (let i = 0; i < 3; i++) segs.push(mk(C.J[i], C.X, C.Y, C.Z, C.len[i], C.r[i], C.r[i + 1], C.ex, ci, i)); });
  const mc = A.chains.slice(1).map((C) => {
    const d = C.J[0].clone().sub(C.base); const h = d.length(); d.normalize();
    const x = new THREE.Vector3(1, 0, 0); x.addScaledVector(d, -x.dot(d)).normalize();
    const z = new THREE.Vector3().crossVectors(x, d);
    return mk(C.base, x, d, z, h, C.mr[0], C.mr[1], 0.92, -1, 0);
  });
  // finger bounding capsules (MCP -> tip) for skipping whole fingers
  const fb = A.chains.map((C) => ({ a: C.J[0], b: C.J[3], r: C.r[0] + 0.004 }));
  const T = A.chains[0];
  const kn = 0.0055 + 0.0015 * A.knuckles;
  const knk = A.chains.slice(1).map((C) => C.J[0]);
  const wa = T.J[1], wb = A.chains[1].J[0];
  const W0 = [wa.x - 0.002, wa.y - 0.004, wa.z - 0.003], W1 = [wb.x - 0.002 - W0[0], wb.y - 0.02 - W0[1], wb.z - W0[2]];
  const W1l = W1[0] * W1[0] + W1[1] * W1[1] + W1[2] * W1[2];
  let lx = 0, ly = 0, lz = 0;
  const loc = (s, x, y, z) => { const dx = x - s.ox, dy = y - s.oy, dz = z - s.oz; lx = dx * s.xx + dy * s.xy + dz * s.xz; ly = dx * s.yx + dy * s.yy + dz * s.yz; lz = dx * s.zx + dy * s.zy + dz * s.zz; };
  const cone = (s, x, y, z) => {
    loc(s, x, y, z);
    const qx = lx / s.ex, qr = Math.sqrt(qx * qx + lz * lz);
    const kk = -s.b * qr + s.a * ly;
    let d;
    if (kk < 0) d = Math.sqrt(qr * qr + ly * ly) - s.r1;
    else if (kk > s.a * s.h) { const yy = ly - s.h; d = Math.sqrt(qr * qr + yy * yy) - s.r2; } else d = qr * s.a + ly * s.b - s.r1;
    return d * s.ex;
  };
  const ell = (x, y, z, rx, ry, rz) => {
    const ax = x / rx, ay = y / ry, az = z / rz, bx = ax / rx, by = ay / ry, bz = az / rz;
    const k0 = Math.sqrt(ax * ax + ay * ay + az * az), k1 = Math.sqrt(bx * bx + by * by + bz * bz);
    return k1 < 1e-9 ? -Math.min(rx, ry, rz) : k0 * (k0 - 1) / k1;
  };
  const capD = (c, x, y, z) => {
    const ux = c.b.x - c.a.x, uy = c.b.y - c.a.y, uz = c.b.z - c.a.z, px = x - c.a.x, py = y - c.a.y, pz = z - c.a.z;
    const t = clamp((px * ux + py * uy + pz * uz) / (ux * ux + uy * uy + uz * uz), 0, 1);
    const ex = px - ux * t, ey = py - uy * t, ez = pz - uz * t;
    return Math.sqrt(ex * ex + ey * ey + ez * ez) - c.r;
  };
  const pad = (s, x, y, z, kx, ky) => { loc(s, x, y, z); return ell(lx + s.r1 * kx, ly - s.h * ky, lz, s.r1 * 0.64, s.h * 0.55, s.r1 * 0.9); };
  const wrist = wristTable(S, k), wr = [0, 0];
  return (x, y, z) => {
    // wrist: the forearm's elliptical section, capped inside the carpus
    wrist(y, wr);
    const wx = wr[0], wz = wr[1];
    const qe = Math.sqrt((x / wx) * (x / wx) + (z / wz) * (z / wz));
    let d = Math.max((qe - 1) * Math.min(wx, wz), y - 0.006);
    // carpus and metacarpals (palm)
    d = smin(d, ell(x + 0.0005, y - 0.013, z - 0.001, 0.0158, 0.02, 0.0285), 0.012);
    if (y > -0.02) {
      let pm = 1;
      for (const s of mc) pm = smin(pm, cone(s, x, y, z), 0.011);
      d = smin(d, pm, 0.012);
      // hypothenar, central palmar pad
      d = smin(d, ell(x + 0.0105, y - 0.047, z + 0.0245, 0.0095, 0.029, 0.0105), 0.01);
      d = smin(d, ell(x + 0.0115, y - 0.066, z - 0.001, 0.0062, 0.017, 0.026), 0.009);
      // knuckles (metacarpal heads) and the distal palmar pads
      if (y > 0.06) for (const J of knk) {
        const ax = x - J.x - 0.0066, ay = y - J.y + 0.003, az = z - J.z;
        d = smin(d, Math.sqrt(ax * ax + ay * ay + az * az) - kn, 0.006);
        d = smin(d, ell(x - J.x + 0.0082, y - J.y + 0.0045, z - J.z, 0.0058, 0.0085, 0.0082), 0.006);
      }
    }
    // thumb metacarpal + thenar eminence + first web
    if (capD(fb[0], x, y, z) < d + 0.02) {
      let th = cone(segs[0], x, y, z);
      th = smin(th, ell(x + 0.0135, y - 0.040, z - 0.0205, 0.0115, 0.0215, 0.0125), 0.011);
      d = smin(d, th, 0.013);
      const px = x - W0[0], py = y - W0[1], pz = z - W0[2];
      const t = clamp((px * W1[0] + py * W1[1] + pz * W1[2]) / W1l, 0, 1);
      const ex = px - W1[0] * t, ey = py - W1[1] * t, ez = pz - W1[2] * t;
      d = smin(d, Math.sqrt(ex * ex + ey * ey + ez * ez) - 0.0048, 0.009);
      // thumb phalanges
      let tp = cone(segs[1], x, y, z);
      tp = Math.min(tp, smin(cone(segs[2], x, y, z), pad(segs[2], x, y, z, 0.3, 0.6), 0.004));
      d = smin(d, tp, 0.0075);
    }
    // fingers (hard union between fingers, smooth into the palm)
    let fd = 1;
    for (let f = 1; f < 5; f++) {
      if (capD(fb[f], x, y, z) > Math.min(fd, d + 0.0062)) continue;
      for (let i = 0; i < 3; i++) {
        const s = segs[f * 3 + i];
        let c = cone(s, x, y, z);
        if (i === 2) c = smin(c, pad(s, x, y, z, 0.32, 0.62), 0.004);
        if (c < fd) fd = c;
      }
    }
    return smin(d, fd, 0.0062);
  };
}

// ------------------------------------------------------- surface nets --
const EDGES = [[0, 1], [2, 3], [4, 5], [6, 7], [0, 2], [1, 3], [4, 6], [5, 7], [0, 4], [1, 5], [2, 6], [3, 7]];
function surfaceNets(sdf, min, max, h) {
  const nx = Math.ceil((max[0] - min[0]) / h) + 1, ny = Math.ceil((max[1] - min[1]) / h) + 1, nz = Math.ceil((max[2] - min[2]) / h) + 1;
  const N = nx * ny * nz, id = (i, j, k) => i + nx * (j + ny * k);
  const F = new Float32Array(N), done = new Uint8Array(N);
  // coarse pass: only blocks near the surface are sampled finely
  const C = 4, cx = Math.ceil((nx - 1) / C) + 1, cy = Math.ceil((ny - 1) / C) + 1, cz = Math.ceil((nz - 1) / C) + 1;
  const G = new Float32Array(cx * cy * cz), gid = (i, j, k) => i + cx * (j + cy * k);
  for (let k = 0; k < cz; k++) for (let j = 0; j < cy; j++) for (let i = 0; i < cx; i++) G[gid(i, j, k)] = sdf(min[0] + i * C * h, min[1] + j * C * h, min[2] + k * C * h);
  const thr = C * h * 1.9;
  for (let k = 0; k < cz - 1; k++) for (let j = 0; j < cy - 1; j++) for (let i = 0; i < cx - 1; i++) {
    let near = false, s0 = G[gid(i, j, k)] < 0;
    for (let c = 0; c < 8 && !near; c++) { const v = G[gid(i + (c & 1), j + ((c >> 1) & 1), k + ((c >> 2) & 1))]; if (Math.abs(v) < thr || (v < 0) !== s0) near = true; }
    if (!near) continue;
    for (let kk = k * C; kk <= Math.min(k * C + C, nz - 1); kk++) for (let jj = j * C; jj <= Math.min(j * C + C, ny - 1); jj++) for (let ii = i * C; ii <= Math.min(i * C + C, nx - 1); ii++) {
      const q = id(ii, jj, kk);
      if (!done[q]) { F[q] = sdf(min[0] + ii * h, min[1] + jj * h, min[2] + kk * h); done[q] = 1; }
    }
  }
  for (let k = 0; k < nz; k++) for (let j = 0; j < ny; j++) for (let i = 0; i < nx; i++) {
    const q = id(i, j, k);
    if (!done[q]) F[q] = G[gid(Math.min(cx - 1, Math.round(i / C)), Math.min(cy - 1, Math.round(j / C)), Math.min(cz - 1, Math.round(k / C)))];
  }
  // one vertex per sign-changing cell
  const cell = new Int32Array((nx - 1) * (ny - 1) * (nz - 1)).fill(-1), cid = (i, j, k) => i + (nx - 1) * (j + (ny - 1) * k);
  const P = [];
  const cv = new Float32Array(8);
  for (let k = 0; k < nz - 1; k++) for (let j = 0; j < ny - 1; j++) for (let i = 0; i < nx - 1; i++) {
    let m = 0;
    for (let c = 0; c < 8; c++) { cv[c] = F[id(i + (c & 1), j + ((c >> 1) & 1), k + ((c >> 2) & 1))]; if (cv[c] < 0) m |= 1 << c; }
    if (m === 0 || m === 255) continue;
    let sx = 0, sy = 0, sz = 0, n = 0;
    for (const [a, b] of EDGES) {
      if ((cv[a] < 0) === (cv[b] < 0)) continue;
      const t = cv[a] / (cv[a] - cv[b]);
      sx += (a & 1) + ((b & 1) - (a & 1)) * t; sy += ((a >> 1) & 1) + (((b >> 1) & 1) - ((a >> 1) & 1)) * t; sz += ((a >> 2) & 1) + (((b >> 2) & 1) - ((a >> 2) & 1)) * t; n++;
    }
    cell[cid(i, j, k)] = P.length / 3;
    P.push(min[0] + (i + sx / n) * h, min[1] + (j + sy / n) * h, min[2] + (k + sz / n) * h);
  }
  // project onto the surface; normals from the field gradient
  const nv = P.length / 3, Nn = new Float32Array(nv * 3), e = h * 0.2;
  // tetrahedral gradient (4 taps)
  const grad = (x, y, z, o) => {
    const a = sdf(x + e, y - e, z - e), b = sdf(x - e, y - e, z + e), c = sdf(x - e, y + e, z - e), d = sdf(x + e, y + e, z + e);
    o[0] = a - b - c + d; o[1] = -a - b + c + d; o[2] = -a + b - c + d;
    const l = Math.sqrt(o[0] * o[0] + o[1] * o[1] + o[2] * o[2]) || 1; o[0] /= l; o[1] /= l; o[2] /= l;
  };
  const g = [0, 0, 0];
  for (let v = 0; v < nv; v++) {
    let x = P[v * 3], y = P[v * 3 + 1], z = P[v * 3 + 2];
    const x0 = x, y0 = y, z0 = z;
    for (let it = 0; it < 2; it++) {
      const d = sdf(x, y, z);
      if (Math.abs(d) < 1e-6) break;
      grad(x, y, z, g);
      x -= g[0] * d; y -= g[1] * d; z -= g[2] * d;
    }
    const mv = Math.hypot(x - x0, y - y0, z - z0);
    if (mv > h * 0.9) { const s = h * 0.9 / mv; x = x0 + (x - x0) * s; y = y0 + (y - y0) * s; z = z0 + (z - z0) * s; }
    if (y < min[1] + h * 0.5) y = Math.max(y, min[1]); // keep the open wrist rim on the cut
    P[v * 3] = x; P[v * 3 + 1] = y; P[v * 3 + 2] = z;
    grad(x, y, z, g);
    Nn[v * 3] = g[0]; Nn[v * 3 + 1] = g[1]; Nn[v * 3 + 2] = g[2];
  }
  // quads around every sign-changing grid edge
  const I = [];
  const quad = (a, b, c, d, flip) => {
    if (a < 0 || b < 0 || c < 0 || d < 0) return;
    if (flip) { const t = b; b = d; d = t; }
    // split along the shorter diagonal
    const d0 = (P[a * 3] - P[c * 3]) ** 2 + (P[a * 3 + 1] - P[c * 3 + 1]) ** 2 + (P[a * 3 + 2] - P[c * 3 + 2]) ** 2;
    const d1 = (P[b * 3] - P[d * 3]) ** 2 + (P[b * 3 + 1] - P[d * 3 + 1]) ** 2 + (P[b * 3 + 2] - P[d * 3 + 2]) ** 2;
    if (d0 <= d1) I.push(a, b, c, a, c, d); else I.push(a, b, d, b, c, d);
  };
  for (let k = 0; k < nz; k++) for (let j = 0; j < ny; j++) for (let i = 0; i < nx; i++) {
    const v0 = F[id(i, j, k)] < 0;
    if (i < nx - 1 && j > 0 && k > 0 && j < ny - 1 && k < nz - 1 && v0 !== (F[id(i + 1, j, k)] < 0))
      quad(cell[cid(i, j - 1, k - 1)], cell[cid(i, j, k - 1)], cell[cid(i, j, k)], cell[cid(i, j - 1, k)], !v0);
    if (j < ny - 1 && i > 0 && k > 0 && i < nx - 1 && k < nz - 1 && v0 !== (F[id(i, j + 1, k)] < 0))
      quad(cell[cid(i - 1, j, k - 1)], cell[cid(i - 1, j, k)], cell[cid(i, j, k)], cell[cid(i, j, k - 1)], !v0);
    if (k < nz - 1 && i > 0 && j > 0 && i < nx - 1 && j < ny - 1 && v0 !== (F[id(i, j, k + 1)] < 0))
      quad(cell[cid(i - 1, j - 1, k)], cell[cid(i, j - 1, k)], cell[cid(i, j, k)], cell[cid(i - 1, j, k)], !v0);
  }
  // make every triangle agree with the field normal
  for (let t = 0; t < I.length; t += 3) {
    const a = I[t], b = I[t + 1], c = I[t + 2];
    const ux = P[b * 3] - P[a * 3], uy = P[b * 3 + 1] - P[a * 3 + 1], uz = P[b * 3 + 2] - P[a * 3 + 2];
    const wx = P[c * 3] - P[a * 3], wy = P[c * 3 + 1] - P[a * 3 + 1], wz = P[c * 3 + 2] - P[a * 3 + 2];
    const fx = uy * wz - uz * wy, fy = uz * wx - ux * wz, fz = ux * wy - uy * wx;
    const s = fx * (Nn[a * 3] + Nn[b * 3] + Nn[c * 3]) + fy * (Nn[a * 3 + 1] + Nn[b * 3 + 1] + Nn[c * 3 + 1]) + fz * (Nn[a * 3 + 2] + Nn[b * 3 + 2] + Nn[c * 3 + 2]);
    if (s < 0) { I[t + 1] = c; I[t + 2] = b; }
  }
  return { P, N: Nn, I };
}

// ------------------------------------------------------------- weights --
function segDist(p, a, b) {
  const ux = b.x - a.x, uy = b.y - a.y, uz = b.z - a.z;
  const px = p.x - a.x, py = p.y - a.y, pz = p.z - a.z;
  const t = clamp((px * ux + py * uy + pz * uz) / (ux * ux + uy * uy + uz * uz), 0, 1);
  const ex = px - ux * t, ey = py - uy * t, ez = pz - uz * t;
  return Math.sqrt(ex * ex + ey * ey + ez * ez);
}
// returns up to 4 [bone, weight] pairs for a bind-pose hand vertex (unscaled)
function handWeights(A, p, out) {
  const W = new Map();
  const add = (b, w) => { if (w > 1e-4) W.set(b, (W.get(b) || 0) + w); };
  // candidates: palm (metacarpals, carpus) vs. each chain bone
  let best = 1, bestBone = B.HAND, bestC = -1, bestI = -1;
  let dPalm = segDist(p, new THREE.Vector3(0, Y_CUT, 0), new THREE.Vector3(0, 0.02, 0)) - 0.024;
  for (let f = 1; f < 5; f++) {
    const C = A.chains[f];
    dPalm = Math.min(dPalm, segDist(p, C.base, C.J[0]) - C.mr[1]);
  }
  best = dPalm;
  for (let c = 0; c < 5; c++) {
    const C = A.chains[c];
    for (let i = 0; i < 3; i++) {
      const d = segDist(p, C.J[i], C.J[i + 1]) - C.r[i];
      if (d < best) { best = d; bestBone = CHAIN_BONE[c] + i; bestC = c; bestI = i; }
    }
  }
  const tmp = new THREE.Vector3();
  const along = (C, i) => tmp.copy(p).sub(C.J[i]).dot(C.Y);
  const lat = (C, i) => { const s = along(C, i); return tmp.copy(p).sub(C.J[i]).addScaledVector(C.Y, -s).length(); };
  if (bestC >= 0) {
    const C = A.chains[bestC];
    const parent = bestI === 0 ? CHAIN_PARENT[bestC] : CHAIN_BONE[bestC] + bestI - 1;
    const wj = C.r[bestI] * (bestI === 0 ? 0.5 : 0.42);
    const s = along(C, bestI);
    if (bestC === 0 && bestI === 0) {
      // thumb metacarpal: the thenar mass blends into the palm
      const wt = clamp(0.5 + (dPalm - best) / 0.012, 0, 1) * sstep(-0.006, 0.016, s);
      add(bestBone, wt); add(B.HAND, 1 - wt);
    } else if (s < wj) {
      const w = sstep(-wj, wj, s);
      add(bestBone, w); add(parent, 1 - w);
    } else if (bestI < 2) {
      const s2 = along(C, bestI + 1), wj2 = C.r[bestI + 1] * 0.42;
      const w = sstep(-wj2, wj2, s2);
      add(CHAIN_BONE[bestC] + bestI + 1, w); add(bestBone, 1 - w);
    } else add(bestBone, 1);
  } else {
    // palm: finger bases, thenar and the ulnar cup
    let rest = 1;
    for (let f = 1; f < 5; f++) {
      const C = A.chains[f];
      const wj = C.r[0] * 0.5, s = along(C, 0);
      if (s > -wj && lat(C, 0) < C.r[0] * 1.25) { const w = sstep(-wj, wj, s) * rest; add(CHAIN_BONE[f], w); rest -= w; }
    }
    const T = A.chains[0];
    const dT = segDist(p, T.J[0], T.J[1]) - T.r[0];
    const wt = clamp(0.5 + (dPalm - dT) / 0.012, 0, 1) * sstep(-0.006, 0.016, along(T, 0)) * rest;
    add(CHAIN_BONE[0], wt); rest -= wt;
    const wc = sstep(-0.001, -0.017, p.z) * sstep(0.02, 0.045, p.y);
    add(B.CUP, rest * wc); add(B.HAND, rest * (1 - wc));
  }
  const arr = [...W.entries()].sort((a, b) => b[1] - a[1]).slice(0, 4);
  const sum = arr.reduce((s, e) => s + e[1], 0) || 1;
  out.length = 0;
  for (const [b, w] of arr) out.push([b, w / sum]);
  return { bone: bestBone, chain: bestC };
}

// ---------------------------------------------------------- the survivor --
// Per-survivor first-person look (colours come from the painted atlas).
const LOOKS = {
  bill: { age: 1.0, veins: 1.0, dirt: 0.45, polish: 0 },
  zoey: { age: 0.0, veins: 0.25, dirt: 0.15, polish: 1 },
  louis: { age: 0.3, veins: 0.55, dirt: 0.2, polish: 0 },
  francis: { age: 0.55, veins: 0.85, dirt: 0.5, polish: 0 },
};
function atlasAvg(tex, rect, u0, u1, v0, v1, reject) {
  const img = tex.image, S = img.width, d = img.data;
  const px = [];
  for (let y = Math.floor((rect[1] + v0 * rect[3]) * S); y < (rect[1] + v1 * rect[3]) * S; y++)
    for (let x = Math.floor((rect[0] + u0 * rect[2]) * S); x < (rect[0] + u1 * rect[2]) * S; x++) { const i = (y * S + x) * 4; px.push([d[i], d[i + 1], d[i + 2]]); }
  const lum = (c) => c[0] * 0.3 + c[1] * 0.55 + c[2] * 0.15;
  px.sort((a, b) => lum(a) - lum(b));
  // median band (drops tattoo ink, dirt specks, hair)
  const a = Math.floor(px.length * (reject ? 0.3 : 0.1)), b = Math.ceil(px.length * (reject ? 0.8 : 0.9));
  const s = [0, 0, 0];
  for (let i = a; i < b; i++) { s[0] += px[i][0]; s[1] += px[i][1]; s[2] += px[i][2]; }
  const n = Math.max(1, b - a);
  return new THREE.Color().setRGB(s[0] / n / 255, s[1] / n / 255, s[2] / n / 255, THREE.SRGBColorSpace);
}

const lookCache = new Map();
export function armLook(char) {
  const id = char.look || char.id;
  if (lookCache.has(id)) return lookCache.get(id);
  const asset = getCharacterAsset({ id, skin: char.skin, shirt: char.sleeve, pants: char.body?.pants, hair: char.body?.hair });
  const R = SURV[id];
  const spec = R ? R.spec() : {};
  const S = asset.handScale;
  const k = asset.armBulk * 0.96 + 0.04;
  const A = handAnatomy({ female: spec.female || 0, knuckles: (LOOKS[id]?.age ?? 0.4) });
  const L = Object.assign({ age: 0.3, veins: 0.5, dirt: 0.3, polish: 0 }, LOOKS[id]);
  const texA = asset.textures.A.albedo;
  const tone = atlasAvg(texA, RECT.farm, 0.3, 0.7, (0.9 + 0.15) / 1.19, (0.97 + 0.15) / 1.19, true);
  const palm = atlasAvg(texA, RECT.hand, 0.005, 0.03, 0.3, 0.7, false);
  const nail = atlasAvg(texA, RECT.hand, 0.54, 0.56, 0.84, 0.92, false);
  const hasWatch = !!(spec.layers || []).find((l) => l.custom && l.custom.name === 'watch');
  const geo = buildArmGeometry(A, S, k, asset, hasWatch);
  const mat = skinMaterial(asset, A, S, { tone, palm, nail, L });
  const watchMat = new THREE.MeshStandardMaterial({ vertexColors: true, metalness: 0.55, roughness: 0.32, envMapIntensity: 1.2 });
  const look = { id, asset, A, S, k, geo, mats: [mat, asset.materials[1], watchMat], tone, palm, nail };
  lookCache.set(id, look);
  return look;
}

// -------------------------------------------------------------- geometry --
// Returns {R, L}: right- and left-arm skinned geometries.
function buildArmGeometry(A, S, k, asset, hasWatch) {
  const pos = [], nor = [], uv = [], si = [], sw = [], bind = [], skin = [], col = [];
  const groups = [[], [], []]; // index lists per material: skin(+matA sleeves), matB sleeves, watch
  const wtmp = [];
  const wristUV = [RECT.farm[0] + 0.5 * RECT.farm[2], RECT.farm[1] + ((0.97 + 0.15) / 1.19) * RECT.farm[3]];
  // weights along the forearm: elbow bone -> hand across the wrist (y real metres)
  const armW = (y) => sstep(-0.058, -0.004, y);
  const pushV = (x, y, z, nx, ny, nz, u, v, W, bx, by, bz, handK, palmar, c = [1, 1, 1]) => {
    pos.push(x, y, z); nor.push(nx, ny, nz); uv.push(u, v);
    for (let i = 0; i < 4; i++) { si.push(W[i] ? W[i][0] : 0); sw.push(W[i] ? W[i][1] : 0); }
    bind.push(bx, by, bz, handK); skin.push(palmar, 0, 0, 0); col.push(c[0], c[1], c[2]);
    return pos.length / 3 - 1;
  };
  // ---- hand (surface nets)
  const sdf = makeSDF(A, S, k);
  let mn = [1, 1, 1], mx = [-1, -1, -1];
  const grow = (p, r) => { for (let i = 0; i < 3; i++) { mn[i] = Math.min(mn[i], p.getComponent(i) - r); mx[i] = Math.max(mx[i], p.getComponent(i) + r); } };
  for (const C of A.chains) for (let i = 0; i < 4; i++) grow(C.J[i], C.r[Math.min(i, 3)] + 0.006);
  grow(new THREE.Vector3(0, 0.02, 0), 0.034);
  mn[1] = Y_CUT;
  const _t0 = performance.now();
  const net = surfaceNets(sdf, mn, mx, 0.0022);
  const _t1 = performance.now();
  const nv = net.P.length / 3;
  const base = 0;
  const p = new THREE.Vector3(), n = new THREE.Vector3();
  for (let v = 0; v < nv; v++) {
    p.set(net.P[v * 3], net.P[v * 3 + 1], net.P[v * 3 + 2]);
    n.set(net.N[v * 3], net.N[v * 3 + 1], net.N[v * 3 + 2]);
    const info = handWeights(A, p, wtmp);
    const ka = armW(p.y * S);
    const W = wtmp.map(([b, w]) => [b, w * ka]);
    if (ka < 0.999) W.push([B.FOREARM, 1 - ka]);
    W.sort((a, b) => b[1] - a[1]); W.length = Math.min(W.length, 4);
    const ws = W.reduce((s, e) => s + e[1], 0); for (const e of W) e[1] /= ws;
    const X = info.chain >= 0 ? A.chains[info.chain].X : AX;
    const dors = n.dot(X);
    const palmar = sstep(0.25, -0.55, dors);
    pushV(p.x * S, p.y * S, p.z * S, n.x, n.y, n.z, wristUV[0], wristUV[1], W, p.x, p.y, p.z, 1, palmar);
  }
  for (const i of net.I) groups[0].push(base + i);
  if (globalThis.__fphT) globalThis.__fphT.push(['nets', _t1 - _t0], ['weights', performance.now() - _t1]);
  // ---- forearm tube (atlas UVs) up to just past the cut, tucked 0.3 mm inside the hand
  const yCut = Y_CUT * S, tEnd = 1 + (yCut + 0.004) / FA_LEN, tCut = 1 + yCut / FA_LEN;
  const addPiece = (P, gi, o = {}) => {
    const g = pieceGeometry([P]);
    const gp = g.attributes.position.array, gn = g.attributes.normal.array, gu = g.attributes.uv.array, gi2 = g.index.array;
    const off = pos.length / 3;
    for (let v = 0; v < gp.length / 3; v++) {
      const y = gp[v * 3 + 1];
      const ka = armW(y);
      const W = ka > 0.999 ? [[B.HAND, 1]] : ka < 0.001 ? [[B.FOREARM, 1]] : [[B.HAND, ka], [B.FOREARM, 1 - ka]];
      pushV(gp[v * 3], y, gp[v * 3 + 2], gn[v * 3], gn[v * 3 + 1], gn[v * 3 + 2], gu[v * 2], gu[v * 2 + 1], W, gp[v * 3] / S, y / S, gp[v * 3 + 2] / S, 0, 0, o.col);
    }
    for (let i = 0; i < gi2.length; i++) groups[gi].push(off + gi2[i]);
    g.dispose();
  };
  {
    const P = new Piece({});
    const ts = [-0.14, -0.1, -0.05, 0.0];
    for (let t = 0.07; t < tCut - 0.03; t += 0.07) ts.push(t);
    ts.push(tCut - 0.03, tCut - 0.012, tCut, tEnd);
    tube(P, { ts, segs: 32, rect: RECT.farm, aOff: Math.PI / 2, tA: -0.15, tB: 1.04,
      fn: (t, a, o3) => { limbPoint(FARM_KEYS, t, a, k, k, t < tCut - 0.04 ? farmBump(asset.armBulk) : null, o3, t > tCut - 0.012 ? -0.0003 * sstep(tCut - 0.012, tCut, t) : 0); o3[1] = (t - 1) * FA_LEN; } });
    addPiece(P, 0);
  }
  // ---- sleeves (same lofts as the third-person model, real length)
  for (const L of asset.viewSleeves) {
    const P = new Piece({});
    const t0 = L.t0 ?? -0.12, t1 = L.t1 ?? 1.04;
    const ts = [];
    for (let i = 0; i <= 14; i++) ts.push(t0 + (t1 - t0) * (i / 14));
    if (L.hem) ts.push(t1 + 0.001);
    tube(P, { ts, segs: 32, rect: L.rect || RECT.farm, aOff: Math.PI / 2, tA: -0.15, tB: 1.04,
      fn: (t, a, o3) => { const tt = Math.min(t, t1); limbPoint(FARM_KEYS, tt, a, k, k, null, o3, (L.off ?? 0.01) + (L.bulge ? L.bulge(tt, a) : 0) - (t > t1 ? (L.off ?? 0.01) * 0.9 : 0)); o3[1] = (tt - 1) * FA_LEN; } });
    P.doubleSided = true;
    addPiece(P, (L.mat ?? 1) === 1 ? 1 : 0);
  }
  // ---- wristwatch (worn on the left wrist; built for the right, kept only on the left mesh)
  let watchRange = null;
  if (hasWatch) {
    const w0 = groups[2].length;
    const yW = -0.036, tW = 1 + yW / FA_LEN;
    const band = new Piece({});
    tube(band, { ts: [tW - 0.03, tW - 0.027, tW + 0.027, tW + 0.03], segs: 40, rect: [0, 0, 1, 1], aOff: Math.PI / 2,
      fn: (t, a, o3) => { const e = Math.abs(t - tW) > 0.028 ? 0.0012 : 0.0028; limbPoint(FARM_KEYS, tW, a, k, k, null, o3, e); o3[1] = (t - 1) * FA_LEN; } });
    band.doubleSided = true;
    addPiece(band, 2, { col: [0.05, 0.048, 0.045] });
    const [rx] = [catmull(FARM_KEYS, tW, 1) * k];
    const parts = [];
    const caseG = new THREE.CylinderGeometry(0.0152, 0.016, 0.0068, 36); caseG.rotateZ(-Math.PI / 2); caseG.translate(rx + 0.005, yW, 0);
    const bez = new THREE.TorusGeometry(0.014, 0.0014, 8, 36); bez.rotateY(Math.PI / 2); bez.translate(rx + 0.0084, yW, 0);
    const dial = new THREE.CircleGeometry(0.0134, 36); dial.rotateY(Math.PI / 2); dial.translate(rx + 0.0085, yW, 0);
    const h1 = new THREE.BoxGeometry(0.0006, 0.0095, 0.0012); h1.translate(0, 0.004, 0); h1.rotateX(0.8); h1.translate(rx + 0.0088, yW, 0);
    const h2 = new THREE.BoxGeometry(0.0006, 0.0065, 0.0016); h2.translate(0, 0.0028, 0); h2.rotateX(-2.2); h2.translate(rx + 0.0088, yW, 0);
    const crown = new THREE.CylinderGeometry(0.0022, 0.0022, 0.004, 10); crown.rotateX(Math.PI / 2); crown.translate(rx + 0.005, yW, 0.0172);
    parts.push([caseG, [0.62, 0.6, 0.56]], [bez, [0.7, 0.68, 0.64]], [dial, [0.86, 0.84, 0.78]], [h1, [0.03, 0.03, 0.03]], [h2, [0.03, 0.03, 0.03]], [crown, [0.6, 0.58, 0.54]]);
    for (let m = 0; m < 12; m++) {
      const tk = new THREE.BoxGeometry(0.0005, m % 3 ? 0.0012 : 0.0028, 0.0008); tk.translate(0, 0.011, 0); tk.rotateX(m * Math.PI / 6); tk.translate(rx + 0.0088, yW, 0);
      parts.push([tk, [0.05, 0.05, 0.05]]);
    }
    for (const [gg, c] of parts) {
      const g = gg.index ? gg.toNonIndexed() : gg;
      const gp = g.attributes.position.array, gn = g.attributes.normal.array;
      const off = pos.length / 3;
      for (let v = 0; v < gp.length / 3; v++) {
        const y = gp[v * 3 + 1], ka = armW(y);
        pushV(gp[v * 3], y, gp[v * 3 + 2], gn[v * 3], gn[v * 3 + 1], gn[v * 3 + 2], 0, 0, [[B.HAND, ka], [B.FOREARM, 1 - ka]], gp[v * 3] / S, y / S, gp[v * 3 + 2] / S, 0, 0, c);
        groups[2].push(off + v);
      }
      gg.dispose(); if (g !== gg) g.dispose();
    }
    watchRange = [w0, groups[2].length];
  }
  const make = (mirror) => {
    const g = new THREE.BufferGeometry();
    const P2 = Float32Array.from(pos), N2 = Float32Array.from(nor);
    if (mirror) for (let i = 2; i < P2.length; i += 3) { P2[i] = -P2[i]; N2[i] = -N2[i]; }
    g.setAttribute('position', new THREE.BufferAttribute(P2, 3));
    g.setAttribute('normal', new THREE.BufferAttribute(N2, 3));
    g.setAttribute('uv', new THREE.BufferAttribute(Float32Array.from(uv), 2));
    g.setAttribute('skinIndex', new THREE.BufferAttribute(Uint16Array.from(si), 4));
    g.setAttribute('skinWeight', new THREE.BufferAttribute(Float32Array.from(sw), 4));
    g.setAttribute('aBind', new THREE.BufferAttribute(Float32Array.from(bind), 4));
    g.setAttribute('aSkin', new THREE.BufferAttribute(Float32Array.from(skin), 4));
    g.setAttribute('color', new THREE.BufferAttribute(Float32Array.from(col), 3));
    const idx = [];
    const gl = [groups[0], groups[1], mirror ? groups[2] : []];
    let start = 0;
    gl.forEach((list, gi) => {
      if (!list.length) return;
      for (let i = 0; i < list.length; i += 3) { if (mirror) idx.push(list[i], list[i + 2], list[i + 1]); else idx.push(list[i], list[i + 1], list[i + 2]); }
      g.addGroup(start, list.length, gi);
      start += list.length;
    });
    g.setIndex(new THREE.BufferAttribute(pos.length / 3 > 65535 ? Uint32Array.from(idx) : Uint16Array.from(idx), 1));
    g.computeBoundingSphere();
    return g;
  };
  return { R: make(false), L: make(true), handVerts: nv, handTris: net.I.length / 3 };
}

// -------------------------------------------------------------- material --
const FP_GLSL = /* glsl */`
uniform mat4 uJ[15];
uniform vec4 uJP[15];
uniform vec3 uTone, uPalmTone, uNailTone;
uniform vec4 uLook; // dirt, age, polish, veins
uniform float uHS;
varying vec4 vBind;
varying vec4 vSkin;
float fpHash(vec3 p) { p = fract(p * 0.3183099 + 0.1); p *= 17.0; return fract(p.x * p.y * p.z * (p.x + p.y + p.z)); }
float fpNoise(vec3 x) {
  vec3 i = floor(x), f = fract(x); f = f * f * (3.0 - 2.0 * f);
  return mix(mix(mix(fpHash(i), fpHash(i + vec3(1, 0, 0)), f.x), mix(fpHash(i + vec3(0, 1, 0)), fpHash(i + vec3(1, 1, 0)), f.x), f.y),
             mix(mix(fpHash(i + vec3(0, 0, 1)), fpHash(i + vec3(1, 0, 1)), f.x), mix(fpHash(i + vec3(0, 1, 1)), fpHash(i + vec3(1, 1, 1)), f.x), f.y), f.z);
}
float fpSeg(vec2 p, vec2 a, vec2 b) { vec2 pa = p - a, ba = b - a; float h = clamp(dot(pa, ba) / dot(ba, ba), 0.0, 1.0); return length(pa - ba * h); }
float fpG(float x, float w) { return exp(-x * x / (w * w)); }
// procedural hand skin: returns height (m); edits colour, roughness, skin mask
float fpSkin(inout vec3 col, inout float rough, inout float skinK) {
  vec3 p = vBind.xyz;
  float palmar = vSkin.x;
  float h = 0.0, crease = 0.0, red = 0.0, nail = 0.0, lun = 0.0, fre = 0.0, cut = 0.0;
  float age = uLook.y;
  for (int i = 0; i < 15; i++) {
    vec4 P = uJP[i];
    if (P.z > 2.5) continue;
    vec3 q = (uJ[i] * vec4(p, 1.0)).xyz;
    float r = P.x, L = P.y;
    if (q.y < -1.6 * r || q.y > L + 1.2 * r || abs(q.z) > 1.5 * r) continue;
    float on = smoothstep(1.45 * r, 1.1 * r, abs(q.z));
    float dors = smoothstep(0.15 * r, 0.65 * r, q.x) * on;
    float pal = smoothstep(-0.1 * r, -0.6 * r, q.x) * on;
    if (P.z < 0.5) {
      // MCP: finger-base crease on the palm side; knuckle redness and fine skin folds
      crease += pal * fpG(q.y - 0.0135, 0.0005) * 0.8;
      float dk = length(vec2(q.y + 0.003, q.z * 0.8));
      red += dors * fpG(dk, 0.009) * 0.4;
      h -= dors * fpG(dk, 0.008) * smoothstep(0.3, 1.0, sin(q.y * 3400.0 + sin(q.z * 700.0))) * (0.00005 + 0.00006 * age);
    } else {
      float big = P.z < 1.5 ? 1.0 : 0.65;
      // dorsal knuckle wrinkles: arcs around the joint
      float d = length(vec2(q.y * 1.05, q.z * 0.5));
      float env = exp(-d * d / (r * r * (0.3 + 0.15 * big))) * dors;
      float w = sin((q.y + 0.0006 * cos(q.z * 500.0)) * (3600.0 + 600.0 * big) + q.z * q.z * 90000.0);
      h -= env * smoothstep(0.0, 1.0, w) * (0.00008 + 0.0001 * age) * big;
      red += env * 0.45 * big;
      // palmar flexion creases
      crease += pal * (fpG(q.y + 0.0012 * big, 0.00042) + fpG(q.y - 0.0011 * big, 0.00036) * big) * 0.9;
    }
    if (P.z > 1.5) {
      // nail on the distal phalanx
      float w = 0.64 * r;
      float yc = 0.34 * L + 0.24 * r * (q.z / w) * (q.z / w);
      float side = smoothstep(w + 0.00035, w - 0.00035, abs(q.z));
      float top = smoothstep(0.28 * r, 0.46 * r, q.x);
      float nk = smoothstep(yc - 0.0003, yc + 0.0003, q.y) * side * top;
      nail = max(nail, nk);
      lun = max(lun, nk * smoothstep(yc + 0.0028, yc + 0.0014, q.y) * smoothstep(0.75, 0.35, abs(q.z) / w));
      fre = max(fre, nk * smoothstep(L + 0.18 * r, L + 0.4 * r, q.y));
      cut = max(cut, fpG(q.y - yc + 0.0002, 0.00045) * side * top);
      // nail edges and the fold
      h += nk * 0.00012 - fpG(abs(q.z) - w, 0.00035) * top * smoothstep(yc, yc + 0.002, q.y) * 0.00008;
      h -= cut * 0.00006;
      // fingertip redness
      red += smoothstep(0.35 * L, L + 0.5 * r, q.y) * (1.0 - nk) * 0.35;
    }
  }
  // palm lines (unscaled hand space, palm side of the palm only)
  float onPalm = palmar * smoothstep(0.086, 0.078, p.y) * smoothstep(-0.005, 0.006, p.y);
  if (onPalm > 0.01) {
    float heart = p.y - (0.061 + 0.013 * smoothstep(-0.04, 0.015, p.z) + 0.004 * smoothstep(0.004, 0.022, p.z));
    float head = p.y - (0.046 + 0.021 * smoothstep(-0.026, 0.032, p.z));
    float life = length(vec2(p.y - 0.026, p.z - 0.037)) - 0.032;
    float wob = (fpNoise(p * 900.0) - 0.5) * 0.0006;
    float ln = fpG(heart + wob, 0.00055) * smoothstep(-0.041, -0.034, p.z) * smoothstep(0.024, 0.016, p.z);
    ln += fpG(head + wob, 0.00055) * smoothstep(-0.03, -0.02, p.z) * smoothstep(0.036, 0.028, p.z);
    ln += fpG(life + wob, 0.0006) * step(p.z, 0.034) * smoothstep(0.004, 0.014, p.y) * smoothstep(0.07, 0.06, p.y);
    ln += 0.35 * fpG(fpNoise(p * 380.0) - 0.5, 0.03) * smoothstep(0.02, 0.04, p.y);
    crease += ln * onPalm;
  }
  // wrist creases
  crease += palmar * (fpG(p.y + 0.004, 0.0005) + 0.6 * fpG(p.y + 0.0105, 0.0005)) * smoothstep(0.03, 0.022, abs(p.z));
  // back of the hand: extensor tendons and veins
  float back = smoothstep(0.1, 0.6, 1.0 - palmar) * smoothstep(0.004, 0.009, p.x) * smoothstep(0.088, 0.07, p.y);
  if (back > 0.01) {
    vec2 yz = p.yz;
    float td = 0.0;
    td += fpG(fpSeg(yz, vec2(0.004, 0.009), vec2(0.078, 0.027)), 0.0022);
    td += fpG(fpSeg(yz, vec2(0.004, 0.004), vec2(0.082, 0.0085)), 0.0024);
    td += fpG(fpSeg(yz, vec2(0.006, -0.002), vec2(0.078, -0.0105)), 0.0021);
    td += fpG(fpSeg(yz, vec2(0.008, -0.007), vec2(0.07, -0.0285)), 0.0019);
    h += back * td * 0.00022 * smoothstep(0.08, 0.05, p.y);
    float vd = min(min(fpSeg(yz, vec2(-0.01, 0.022), vec2(0.03, 0.015)), fpSeg(yz, vec2(0.03, 0.015), vec2(0.062, 0.019))),
                   min(fpSeg(yz, vec2(-0.01, -0.012), vec2(0.028, -0.006)), fpSeg(yz, vec2(0.028, -0.006), vec2(0.06, -0.001))));
    vd = min(vd, min(fpSeg(yz, vec2(0.052, -0.024), vec2(0.044, -0.004)), fpSeg(yz, vec2(0.044, -0.004), vec2(0.05, 0.018))));
    vd = min(vd, fpSeg(yz, vec2(0.03, 0.015), vec2(0.028, -0.006)));
    float vein = fpG(vd + (fpNoise(p * 600.0) - 0.5) * 0.001, 0.0011) * back * uLook.w;
    h += vein * 0.00032;
    col = mix(col, col * vec3(0.8, 0.86, 1.04), vein * 0.45);
  }
  // pores and micro relief
  float n1 = fpNoise(p * 2600.0), n2 = fpNoise(p * 950.0 + 7.0), n3 = fpNoise(p * 160.0 + 3.0);
  h += ((n1 - 0.5) * 0.000012 + (n2 - 0.5) * 0.00002) * (1.0 - nail);
  h -= crease * (0.00016 + 0.00006 * age);
  // colour: tone, palm, redness, mottling, age spots, dirt
  col = mix(col, uPalmTone, palmar * 0.9);
  col *= mix(vec3(1.0), vec3(1.07, 0.9, 0.88), clamp(red, 0.0, 1.0) * 0.55);
  col *= 0.94 + 0.12 * n3;
  col *= 1.0 - crease * 0.22;
  float spots = smoothstep(0.72, 0.8, fpNoise(p * 420.0 + 11.0)) * age * (1.0 - palmar) * 0.25;
  col = mix(col, col * vec3(0.72, 0.6, 0.5), spots);
  float dirt = uLook.x * (0.35 * crease + 0.5 * smoothstep(0.55, 0.85, fpNoise(p * 300.0 + 5.0)) * (0.4 + 0.6 * smoothstep(0.3, 0.8, n3)));
  col = mix(col, col * vec3(0.55, 0.48, 0.4), clamp(dirt, 0.0, 0.7));
  // nails
  vec3 nc = mix(uNailTone, vec3(0.93, 0.84, 0.8), lun * (1.0 - uLook.z) * 0.6);
  nc = mix(nc, vec3(0.92, 0.9, 0.84), fre * (1.0 - uLook.z) * 0.75);
  nc = mix(nc, nc * vec3(0.35, 0.3, 0.25), uLook.x * fre * 0.8);
  col = mix(col, nc, nail);
  col *= 1.0 - cut * 0.18;
  rough = mix(0.5 + 0.1 * palmar + (n1 - 0.5) * 0.12 + crease * 0.08, mix(0.3, 0.14, uLook.z), nail);
  skinK = 1.0 - nail * 0.85;
  return h;
}
vec3 fpPerturb(vec3 pos, vec3 N, float h) {
  vec3 dpx = dFdx(pos), dpy = dFdy(pos);
  vec3 R1 = cross(dpy, N), R2 = cross(N, dpx);
  float det = dot(dpx, R1);
  vec3 grad = sign(det) * (dFdx(h) * R1 + dFdy(h) * R2);
  return normalize(abs(det) * N - grad);
}
`;
function skinMaterial(asset, A, S, o) {
  const m = characterMaterial(asset.textures.A);
  const baseCompile = m.onBeforeCompile;
  const J = [], JP = [];
  const inv = new THREE.Matrix4();
  A.chains.forEach((C, ci) => {
    for (let i = 0; i < 3; i++) {
      // joint frame: origin at joint i, axes of the (straight) chain
      inv.makeBasis(C.X, C.Y, C.Z).setPosition(C.J[i]).invert();
      J.push(inv.clone());
      const kind = ci === 0 ? (i === 0 ? 3 : i) : i;
      JP.push(new THREE.Vector4(C.r[i], C.len[i], kind, ci));
    }
  });
  const U = {
    uJ: { value: J }, uJP: { value: JP },
    uTone: { value: o.tone.clone() }, uPalmTone: { value: o.palm.clone() }, uNailTone: { value: o.L.polish ? o.nail.clone() : o.tone.clone().lerp(new THREE.Color(0.75, 0.6, 0.58), 0.45) },
    uLook: { value: new THREE.Vector4(o.L.dirt, o.L.age, o.L.polish, o.L.veins) }, uHS: { value: S },
  };
  m.userData.fpUniforms = U;
  m.onBeforeCompile = (sh, r) => {
    baseCompile(sh, r);
    Object.assign(sh.uniforms, U);
    sh.vertexShader = sh.vertexShader
      .replace('#include <common>', '#include <common>\nattribute vec4 aBind;\nattribute vec4 aSkin;\nvarying vec4 vBind;\nvarying vec4 vSkin;')
      .replace('#include <begin_vertex>', '#include <begin_vertex>\nvBind = aBind; vSkin = aSkin;');
    sh.fragmentShader = sh.fragmentShader
      .replace('#include <common>', '#include <common>\n' + FP_GLSL)
      .replace('#include <normal_fragment_maps>', `#include <normal_fragment_maps>
      if (vBind.w > 0.5) {
        vec3 fc = uTone; float fr = roughnessFactor; float fk = 1.0;
        float fh = fpSkin(fc, fr, fk);
        diffuseColor.rgb = fc; roughnessFactor = fr; gSkin = fk;
        normal = fpPerturb(-vViewPosition, normal, fh * uHS);
      } else if (vBind.y > -0.06 && vBind.w > -0.5) {
        // forearm fades into the hand's tone over the last few centimetres
        float k = smoothstep(-0.06, ${(Y_CUT + 0.002).toFixed(4)}, vBind.y);
        diffuseColor.rgb = mix(diffuseColor.rgb, uTone * (0.94 + 0.12 * fpNoise(vBind.xyz * 160.0 + 3.0)), k);
      }`);
  };
  m.customProgramCacheKey = () => 'fphand1';
  return m;
}

// ------------------------------------------------------------------- rig --
const _m = new THREE.Matrix4(), _q = new THREE.Quaternion(), _v = new THREE.Vector3(), _x = new THREE.Vector3(), _y = new THREE.Vector3(), _z = new THREE.Vector3();
export class FPArm {
  // char: survivor definition (CHARACTERS entry); side: 1 right, -1 left
  constructor(char, side) {
    const look = armLook(char);
    this.look = look; this.side = side;
    const A = look.A, S = look.S;
    this.A = A; this.S = S;
    this.root = new THREE.Group();
    this.root.name = side > 0 ? 'fpArmR' : 'fpArmL';
    const bones = [];
    for (let i = 0; i < NBONES; i++) { const b = new THREE.Bone(); b.name = 'b' + i; bones.push(b); }
    this.bones = bones;
    const mz = side < 0 ? -1 : 1;
    bones[B.FOREARM].position.set(0, -FA_LEN, 0);
    this.root.add(bones[B.FOREARM], bones[B.HAND]);
    bones[B.HAND].add(bones[B.CUP]);
    bones[B.CUP].position.set(A.cup.x * S, A.cup.y * S, A.cup.z * S * mz);
    this.bindQ = [];
    A.chains.forEach((C, c) => {
      const b0 = CHAIN_BONE[c], par = bones[CHAIN_PARENT[c]];
      const pOff = CHAIN_PARENT[c] === B.CUP ? A.cup : new THREE.Vector3();
      par.add(bones[b0]);
      bones[b0].position.set((C.J[0].x - pOff.x) * S, (C.J[0].y - pOff.y) * S, (C.J[0].z - pOff.z) * S * mz);
      const q = C.q.clone(); if (side < 0) mirrorQ(q);
      bones[b0].quaternion.copy(q);
      this.bindQ[b0] = q.clone();
      for (let i = 1; i < 3; i++) {
        bones[b0 + i - 1].add(bones[b0 + i]);
        bones[b0 + i].position.set(0, C.len[i - 1] * S, 0);
        this.bindQ[b0 + i] = new THREE.Quaternion();
      }
    });
    this.root.updateMatrixWorld(true);
    const inv = bones.map((b) => b.matrixWorld.clone().invert());
    const mesh = new THREE.SkinnedMesh(side > 0 ? look.geo.R : look.geo.L, look.mats);
    mesh.bind(new THREE.Skeleton(bones, inv), new THREE.Matrix4());
    mesh.frustumCulled = false;
    mesh.castShadow = mesh.receiveShadow = false;
    this.root.add(mesh);
    this.mesh = mesh;
    this.pose = new Float32Array(POSE_LEN);
    this.root.traverse((o) => o.layers.set(1));
  }
  setLayer(l) { this.root.traverse((o) => o.layers.set(l)); }
  // apply an anatomical pose (Float32Array POSE_LEN)
  setPose(pose) {
    this.pose.set(pose);
    const bones = this.bones, A = this.A;
    for (let c = 0; c < 5; c++) for (let i = 0; i < 3; i++) {
      chainPoseQuat(A, pose, c, i, _q);
      if (this.side < 0) mirrorQ(_q);
      const b = CHAIN_BONE[c] + i;
      bones[b].quaternion.copy(this.bindQ[b]).multiply(_q);
    }
    cupQuat(pose, _q);
    if (this.side < 0) mirrorQ(_q);
    bones[B.CUP].quaternion.copy(_q);
  }
  // Place the hand (wrist frame in the arm root's parent space: +X back of the
  // hand, +Y towards the knuckles) and aim the forearm along -fdir from the wrist.
  place(pos, quat, fdir) {
    const hb = this.bones[B.HAND], fb = this.bones[B.FOREARM];
    hb.position.copy(pos); hb.quaternion.copy(quat);
    _y.copy(fdir).normalize();
    fb.position.copy(pos).addScaledVector(_y, -FA_LEN);
    // forearm roll follows the back of the hand
    _x.set(1, 0, 0).applyQuaternion(quat);
    _x.addScaledVector(_y, -_x.dot(_y));
    if (_x.lengthSq() < 1e-6) _x.set(0, 0, 1).applyQuaternion(quat).addScaledVector(_y, -_x.dot(_y));
    _x.normalize();
    _z.crossVectors(_x, _y);
    fb.quaternion.setFromRotationMatrix(_m.makeBasis(_x, _y, _z));
  }
}
