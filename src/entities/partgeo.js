// Procedural character geometry.
//
// 1) Legacy per-part lathe geometry (buildPartGeometries) - still used for gibs.
// 2) Skinned body builder (buildBody): one continuous character mesh authored
//    part by part in each part's local frame (the same frames partMatrix()
//    produces), moved into a rest pose and skinned to 12 bones (10 body parts
//    + 2 feet) with blended weights around every joint, so elbows, knees,
//    shoulders and hips bend smoothly instead of showing segment seams.
//    Heads are sculpted signed-distance fields (cranium, brow, sockets, nose,
//    cheekbones, lips, jaw, ears) projected onto a face-weighted sphere grid;
//    hands have a palm, four jointed fingers and a thumb; feet are lofted
//    shoes/boots. Clothing layers are offset shells of the body surface, and
//    the crowd variant carries optional accessories (hoods, skirts, coats,
//    caps, hard hats, ties, long hair, backpacks, ear defenders) plus per-vertex
//    morph deltas (female / heavy) so one instanced mesh covers a whole crowd.
//
// Part-local convention: +Y along the segment (0..1 for torso/limbs, metres for
// head and feet), X = body right. For the torso -Z faces forward; for hanging
// limbs +Z faces forward. Right-side limbs are authored and mirrored for the left.
import * as THREE from 'three';
import { J, PROPS, partMatrix, footMatrix, bindPoseBody } from './body.js';

// ======================================================= legacy lathe parts ==
function lathe(profile, segs = 10, sx = 1, sz = 1, extra) {
  const pts = profile.map(([y, r]) => new THREE.Vector2(r, y));
  const g = new THREE.LatheGeometry(pts, segs);
  const pos = g.attributes.position;
  for (let i = 0; i < pos.count; i++) {
    let x = pos.getX(i), y = pos.getY(i), z = pos.getZ(i);
    const kx = typeof sx === 'function' ? sx(y) : sx;
    const kz = typeof sz === 'function' ? sz(y) : sz;
    x *= kx; z *= kz;
    if (extra) [x, y, z] = extra(x, y, z);
    pos.setXYZ(i, x, y, z);
  }
  const uv = g.attributes.uv;
  const y0 = profile[0][0], y1 = profile[profile.length - 1][0];
  for (let i = 0; i < uv.count; i++) {
    const y = profile[Math.min(profile.length - 1, Math.round(uv.getY(i) * (profile.length - 1)))][0];
    uv.setY(i, THREE.MathUtils.clamp((y - Math.max(0, y0)) / Math.max(1e-3, Math.min(1, y1) - Math.max(0, y0)), 0, 1));
  }
  g.computeVertexNormals();
  return g;
}

function merge(geos) {
  let vc = 0, ic = 0;
  for (const g of geos) { vc += g.attributes.position.count; ic += g.index ? g.index.count : g.attributes.position.count; }
  const pos = new Float32Array(vc * 3), nor = new Float32Array(vc * 3), uv = new Float32Array(vc * 2);
  const idx = new Uint32Array(ic);
  let vo = 0, io = 0;
  for (const g of geos) {
    pos.set(g.attributes.position.array, vo * 3);
    nor.set(g.attributes.normal.array, vo * 3);
    uv.set(g.attributes.uv.array, vo * 2);
    if (g.index) { for (let i = 0; i < g.index.count; i++) idx[io++] = g.index.getX(i) + vo; }
    else { for (let i = 0; i < g.attributes.position.count; i++) idx[io++] = i + vo; }
    vo += g.attributes.position.count;
  }
  const out = new THREE.BufferGeometry();
  out.setAttribute('position', new THREE.BufferAttribute(pos, 3));
  out.setAttribute('normal', new THREE.BufferAttribute(nor, 3));
  out.setAttribute('uv', new THREE.BufferAttribute(uv, 2));
  out.setIndex(new THREE.BufferAttribute(idx, 1));
  return out;
}

function boxAt(w, h, d, x, y, z, uvY = 0.95) {
  const g = new THREE.BoxGeometry(w, h, d);
  g.translate(x, y, z);
  const uv = g.attributes.uv;
  for (let i = 0; i < uv.count; i++) uv.setY(i, uvY);
  return g;
}

// Per-part rigid geometries (gibs). opts: fat, bulk, armBulk, legBulk, chest, segs.
export function buildPartGeometries(opts = {}) {
  const fat = opts.fat ?? 1;
  const bulk = opts.bulk ?? 1;
  const armBulk = (opts.armBulk ?? 1) * bulk;
  const legBulk = (opts.legBulk ?? 1) * bulk;
  const chest = opts.chest ?? 1;
  const segs = opts.segs ?? 10;
  const torso = lathe([
    [-0.3, 0.02], [-0.26, 0.12], [-0.12, 0.155], [0.05, 0.15 * (0.9 + 0.1 * fat)], [0.3, 0.14 * fat], [0.5, 0.15 * Math.max(fat, chest * 0.9)], [0.7, 0.165 * Math.max(chest, fat * 0.85)], [0.88, 0.17 * chest], [1.0, 0.155 * chest], [1.08, 0.1 * (0.5 + chest * 0.5)], [1.16, 0.055], [1.24, 0.05],
  ], segs + 2,
  (y) => (y > 0.75 && y < 1.08 ? 1.35 : y < 0 ? 1.2 : 1.18),
  (y) => (y > 0.1 && y < 0.6 ? 0.78 * fat : 0.7));
  const head = (() => {
    const g = new THREE.SphereGeometry(0.108, 14, 12);
    const pos = g.attributes.position;
    for (let i = 0; i < pos.count; i++) {
      let x = pos.getX(i), y = pos.getY(i), z = pos.getZ(i);
      x *= 0.86; y *= 1.12; z *= 1.02;
      if (y < -0.02 && z < 0) { z *= 1.08; x *= 0.92; }
      if (z > 0.05) z *= 1.05;
      pos.setXYZ(i, x, y + 0.05, z);
    }
    g.computeVertexNormals();
    const nose = new THREE.BoxGeometry(0.03, 0.05, 0.04);
    nose.translate(0, 0.05, -0.11);
    const uvn = nose.attributes.uv;
    for (let i = 0; i < uvn.count; i++) { uvn.setX(i, 0.75); uvn.setY(i, 0.5); }
    return merge([g, nose]);
  })();
  const uarm = lathe([[-0.12, 0.03], [-0.08, 0.06 * armBulk], [0.15, 0.063 * armBulk], [0.55, 0.052 * armBulk], [0.95, 0.045 * armBulk], [1.06, 0.035 * armBulk]], segs);
  const farm = lathe([
    [-0.06, 0.03], [-0.02, 0.048 * armBulk], [0.35, 0.045 * armBulk], [0.82, 0.033 * armBulk], [0.88, 0.036 * armBulk], [0.98, 0.045 * armBulk], [1.1, 0.04 * armBulk], [1.2, 0.022 * armBulk], [1.26, 0.008],
  ], segs, 1, (y) => (y > 0.86 ? 0.5 : 1));
  const thigh = lathe([[-0.12, 0.05], [-0.05, 0.09 * legBulk], [0.3, 0.085 * legBulk], [0.75, 0.066 * legBulk], [1.02, 0.056 * legBulk], [1.08, 0.04]], segs);
  const shinL = lathe([[-0.06, 0.04], [-0.02, 0.058 * legBulk], [0.3, 0.06 * legBulk], [0.8, 0.042 * legBulk], [0.95, 0.04], [1.0, 0.035]], segs);
  const foot = boxAt(0.095, 0.08, 0.24, 0, 0, 0, 0.97);
  return { torso, head, uarm, farm, thigh, shin: shinL, foot };
}
export { lathe, merge, boxAt };

// ============================================================ constants ==
// Bone indices: PARTS order, then feet.
export const BONE = { TORSO: 0, HEAD: 1, UARML: 2, FARML: 3, UARMR: 4, FARMR: 5, THIGHL: 6, SHINL: 7, THIGHR: 8, SHINR: 9, FOOTL: 10, FOOTR: 11 };
const MIRROR_BONE = [0, 1, 4, 5, 2, 3, 8, 9, 6, 7, 11, 10];
// Surface regions (shaders / painters branch on these)
export const REG = { TORSO: 0, HEAD: 1, UARM: 2, FARM: 3, HAND: 4, THIGH: 5, SHIN: 6, FOOT: 7, EYE: 8, HAIR: 9, ACC: 10 };
// Crowd accessories (bit index; region = REG.ACC + index)
export const ACC = { HOOD: 0, SKIRT: 1, COAT: 2, CAP: 3, PCAP: 4, HARDHAT: 5, TIE: 6, LONGHAIR: 7, BACKPACK: 8, EARMUFF: 9 };
// Atlas layout shared by every character texture set: [u0, v0, w, h]
export const RECT = {
  head: [0, 0.5, 0.5, 0.5], torso: [0.5, 0.5, 0.5, 0.5],
  uarm: [0, 0.25, 0.25, 0.25], farm: [0.25, 0.25, 0.25, 0.25], thigh: [0.5, 0.25, 0.25, 0.25], shin: [0.75, 0.25, 0.25, 0.25],
  hand: [0, 0.125, 0.125, 0.125], foot: [0.125, 0.125, 0.125, 0.125],
  eye: [0.25, 0.1875, 0.0625, 0.0625], hat: [0.3125, 0.1875, 0.0625, 0.0625],
  collar: [0.25, 0.125, 0.125, 0.0625], tie: [0.375, 0.125, 0.0625, 0.0625], cuff: [0.4375, 0.125, 0.0625, 0.0625],
  ponytail: [0.375, 0.1875, 0.0625, 0.0625], boot: [0.4375, 0.1875, 0.0625, 0.0625],
  acc0: [0, 0, 0.125, 0.125], acc1: [0.125, 0, 0.125, 0.125], acc2: [0.25, 0, 0.125, 0.125], acc3: [0.375, 0, 0.0625, 0.0625],
  acc4: [0.4375, 0, 0.0625, 0.0625], acc5: [0.375, 0.0625, 0.0625, 0.0625], acc6: [0.4375, 0.0625, 0.0625, 0.0625],
  acc7: [0.5, 0, 0.125, 0.125], acc8: [0.625, 0, 0.125, 0.125], acc9: [0.75, 0, 0.0625, 0.0625],
  extra0: [0.5, 0.125, 0.125, 0.125], extra1: [0.625, 0.125, 0.125, 0.125], extra2: [0.75, 0.125, 0.125, 0.125], extra3: [0.875, 0.125, 0.125, 0.125],
};
export const TORSO_LEN = PROPS.chest - PROPS.hip; // 0.43
const FARM_LEN = PROPS.farm, UARM_LEN = PROPS.uarm, THIGH_LEN = PROPS.thigh, SHIN_LEN = PROPS.shin;

const TAU = Math.PI * 2;
const clamp = (v, a, b) => (v < a ? a : v > b ? b : v);
const sstep = (a, b, x) => { const t = clamp((x - a) / (b - a), 0, 1); return t * t * (3 - 2 * t); };
const gauss = (x, w) => Math.exp(-(x * x) / (w * w));
const lerp = (a, b, t) => a + (b - a) * t;
// signed power used by superellipse cross sections
const spow = (v, e) => (v < 0 ? -Math.pow(-v, e) : Math.pow(v, e));
// deterministic hash noise (no Math.random: level builds run under a seeded Math.random)
function hash3(x, y, z) { const s = Math.sin(x * 127.1 + y * 311.7 + z * 74.7) * 43758.5453; return s - Math.floor(s); }

// ================================================================ pieces ==
// A Piece is one surface (part, shell or accessory) under construction in its
// part-local frame; it is later moved into the rest pose and merged.
class Piece {
  constructor(o = {}) {
    this.p = []; this.uv = []; this.loc = []; this.idx = [];
    this.b0 = []; this.b1 = []; this.w = [];
    this.n = null; // explicit normals (optional)
    this.region = o.region ?? 0;
    this.mat = o.mat ?? 0;
    this.bone = o.bone ?? 0;
    this.name = o.name || '';
    this.frame = o.frame ?? this.bone; // bind frame used to place it
  }
  get count() { return this.p.length / 3; }
  vert(x, y, z, u, v, lu, lt) {
    this.p.push(x, y, z); this.uv.push(u, v); this.loc.push(lu, lt);
    this.b0.push(this.bone); this.b1.push(this.bone); this.w.push(1);
    return this.count - 1;
  }
}

// Tube with rings along t and angular samples. fn(t, a, out) writes the local
// point; a = 0 at u = 0.5 of the rect (plus aOff). keep(t, a) can cut holes.
function tube(P, o) {
  const { ts, segs, fn, rect } = o;
  const tA = o.tA ?? ts[0], tB = o.tB ?? ts[ts.length - 1];
  const aOff = o.aOff ?? 0;
  const base = P.count;
  const out = [0, 0, 0];
  for (let i = 0; i < ts.length; i++) {
    const t = ts[i];
    const v = clamp((t - tA) / (tB - tA), 0, 1);
    for (let k = 0; k <= segs; k++) {
      const u = k / segs;
      const a = (u - 0.5) * TAU + aOff;
      fn(t, a, out);
      P.vert(out[0], out[1], out[2], rect[0] + u * rect[2], rect[1] + v * rect[3], u, t);
    }
  }
  const row = segs + 1;
  for (let i = 0; i < ts.length - 1; i++) {
    for (let k = 0; k < segs; k++) {
      if (o.keep) {
        const tm = (ts[i] + ts[i + 1]) * 0.5, am = ((k + 0.5) / segs - 0.5) * TAU + aOff;
        if (!o.keep(tm, am)) continue;
      }
      const A = base + i * row + k, B = A + 1, C = A + row, D = C + 1;
      if (o.flip) { P.idx.push(A, B, C, B, D, C); } else { P.idx.push(A, C, B, B, C, D); }
    }
  }
  return P;
}

// Swept tube along a polyline with parallel-transported frames. u = 0.5 faces
// the initial `up` hint. radii: per point radius or [rx, ry]. cap: close the end.
function sweep(P, pts, radii, segs, rect, o = {}) {
  const n = pts.length;
  const T = [], N = [], Bn = [];
  for (let i = 0; i < n; i++) {
    const a = pts[Math.max(0, i - 1)], b = pts[Math.min(n - 1, i + 1)];
    const t = new THREE.Vector3(b[0] - a[0], b[1] - a[1], b[2] - a[2]).normalize();
    T.push(t);
  }
  const up = new THREE.Vector3(...(o.up || [1, 0, 0]));
  let nrm = up.clone().addScaledVector(T[0], -up.dot(T[0])).normalize();
  if (nrm.lengthSq() < 1e-6) nrm = new THREE.Vector3(0, 0, 1);
  for (let i = 0; i < n; i++) {
    if (i > 0) {
      nrm.addScaledVector(T[i], -nrm.dot(T[i])).normalize();
    }
    N.push(nrm.clone());
    Bn.push(new THREE.Vector3().crossVectors(T[i], nrm).normalize());
  }
  // cumulative length for v
  const L = [0];
  for (let i = 1; i < n; i++) L.push(L[i - 1] + Math.hypot(pts[i][0] - pts[i - 1][0], pts[i][1] - pts[i - 1][1], pts[i][2] - pts[i - 1][2]));
  const total = L[n - 1] || 1;
  const rings = [];
  const addRing = (c, nn, bb, rx, ry, v, tLoc) => {
    const start = P.count;
    for (let k = 0; k <= segs; k++) {
      const u = k / segs;
      const ph = (u - 0.5) * TAU;
      const cx = Math.cos(ph) * rx, cy = Math.sin(ph) * ry;
      P.vert(c[0] + nn.x * cx + bb.x * cy, c[1] + nn.y * cx + bb.y * cy, c[2] + nn.z * cx + bb.z * cy,
        rect[0] + u * rect[2], rect[1] + clamp(v, 0, 1) * rect[3], u, tLoc);
    }
    rings.push(start);
  };
  const rOf = (i) => { const r = radii[i]; return Array.isArray(r) ? r : [r, r]; };
  const vScale = o.vScale ?? 1;
  if (o.capStart) {
    const [rx, ry] = rOf(0);
    for (let s = 3; s >= 1; s--) {
      const k = s / 3, ang = k * Math.PI / 2;
      const c = [pts[0][0] - T[0].x * Math.sin(ang) * rx * 0.9, pts[0][1] - T[0].y * Math.sin(ang) * rx * 0.9, pts[0][2] - T[0].z * Math.sin(ang) * rx * 0.9];
      addRing(c, N[0], Bn[0], Math.max(1e-4, rx * Math.cos(ang)), Math.max(1e-4, ry * Math.cos(ang)), -0.02 * s * vScale, 0);
    }
  }
  for (let i = 0; i < n; i++) { const [rx, ry] = rOf(i); addRing(pts[i], N[i], Bn[i], rx, ry, (L[i] / total) * vScale, L[i] / total); }
  if (o.capEnd) {
    const [rx, ry] = rOf(n - 1);
    const e = pts[n - 1];
    const cr = o.capRings ?? 3;
    for (let s = 1; s <= cr; s++) {
      const k = s / cr, ang = k * Math.PI / 2;
      const c = [e[0] + T[n - 1].x * Math.sin(ang) * rx * 0.9, e[1] + T[n - 1].y * Math.sin(ang) * rx * 0.9, e[2] + T[n - 1].z * Math.sin(ang) * rx * 0.9];
      addRing(c, N[n - 1], Bn[n - 1], Math.max(1e-4, rx * Math.cos(ang)), Math.max(1e-4, ry * Math.cos(ang)), vScale + 0.02 * s, 1);
    }
  }
  const row = segs + 1;
  for (let r = 0; r < rings.length - 1; r++) {
    for (let k = 0; k < segs; k++) {
      const A = rings[r] + k, B = A + 1, C = rings[r + 1] + k, D = C + 1;
      // ring points go counter-clockwise around T when viewed from the tip
      P.idx.push(A, B, C, B, D, C);
    }
  }
  return P;
}

// Ellipsoid / sphere grid (u around Y, v from bottom to top) for caps, hats, eyes.
function ellipsoid(P, c, r, W, H, rect, o = {}) {
  const base = P.count;
  const v0 = o.v0 ?? 0, v1 = o.v1 ?? 1; // latitude range (0 bottom .. 1 top)
  for (let j = 0; j <= H; j++) {
    const v = v0 + (v1 - v0) * (j / H);
    const th = Math.PI * (1 - v); // 0 at top
    for (let i = 0; i <= W; i++) {
      const u = i / W;
      const ph = (u - 0.5) * TAU;
      let x = Math.sin(ph) * Math.sin(th), y = Math.cos(th), z = -Math.cos(ph) * Math.sin(th);
      if (o.shape) { const s = o.shape(x, y, z, u, v); x *= s; y *= s; z *= s; }
      P.vert(c[0] + x * r[0], c[1] + y * r[1], c[2] + z * r[2], rect[0] + u * rect[2], rect[1] + (j / H) * rect[3], u, v);
    }
  }
  const row = W + 1;
  for (let j = 0; j < H; j++) {
    for (let i = 0; i < W; i++) {
      const A = base + j * row + i, B = A + 1, C = A + row, D = C + 1;
      P.idx.push(A, C, B, B, C, D);
    }
  }
  return P;
}

// ========================================================== SDF sculpting ==
function sdEll(px, py, pz, cx, cy, cz, rx, ry, rz) {
  const x = px - cx, y = py - cy, z = pz - cz;
  const k0 = Math.hypot(x / rx, y / ry, z / rz);
  const k1 = Math.hypot(x / (rx * rx), y / (ry * ry), z / (rz * rz));
  return k1 > 1e-9 ? k0 * (k0 - 1) / k1 : -Math.min(rx, ry, rz);
}
function sdCap(px, py, pz, ax, ay, az, bx, by, bz, r) {
  const pax = px - ax, pay = py - ay, paz = pz - az, bax = bx - ax, bay = by - ay, baz = bz - az;
  const h = clamp((pax * bax + pay * bay + paz * baz) / (bax * bax + bay * bay + baz * baz), 0, 1);
  return Math.hypot(pax - bax * h, pay - bay * h, paz - baz * h) - r;
}
function smin(a, b, k) { const h = clamp(0.5 + 0.5 * (b - a) / k, 0, 1); return b + (a - b) * h - k * h * (1 - h); }
function smax(a, b, k) { return -smin(-a, -b, k); }

export const HEAD_DEFAULT = {
  skull: 1, jaw: 1, chin: 1, brow: 1, nose: 1, noseLen: 1, cheek: 1, cheekW: 1, lips: 1, ear: 1, neck: 1,
  socket: 1, gaunt: 0, mouthOpen: 0, jawDrop: 0, female: 0, eyeY: 0, crooked: 0, swell: 0,
};
// Head-local SDF (metres; origin 2cm below the head joint, -Z = face).
export function headSDF(x, y, z, h) {
  const f = h.female;
  const ax = Math.abs(x);
  const sk = h.skull * (1 - f * 0.035);
  // cranium + forehead
  let d = sdEll(x, y, z, 0, 0.066, 0.012, 0.0705 * sk, 0.092 * sk, 0.098 * sk);
  d = smin(d, sdEll(x, y, z, 0, 0.09, -0.035, 0.062 * sk, 0.06, 0.062), 0.02);
  // mid face (cheekbone mass) and cheeks
  const cw = h.cheekW * (1 - f * 0.04);
  d = smin(d, sdEll(x, y, z, 0, 0.02, -0.038, 0.066 * cw, 0.072, 0.061), 0.02);
  d = smin(d, sdEll(ax, y, z, 0.037, 0.022, -0.072, 0.022, 0.018, 0.016), 0.015);
  const full = 1 - clamp(h.gaunt, 0, 1);
  d = smin(d, sdEll(ax, y, z, 0.04 * cw, -0.004, -0.056, 0.025, 0.026, 0.03 * (0.6 + 0.4 * full)), 0.02);
  // jaw, jaw angles, chin
  const jd = h.jawDrop;
  const jw = h.jaw * (1 - f * 0.1);
  d = smin(d, sdEll(x, y + 0.022 + jd, z, 0, 0, -0.03, 0.056 * jw, 0.042, 0.064), 0.024);
  d = smin(d, sdEll(ax, y, z, 0.049 * jw, -0.022 - jd * 0.5, 0.0, 0.017 * jw, 0.026, 0.024), 0.02);
  d = smin(d, sdEll(x, y, z, 0, -0.043 - jd, -0.067, 0.021 * h.chin * (1 - f * 0.15), 0.019, 0.017 * h.chin), 0.016);
  // cheekbones
  d = smin(d, sdEll(ax, y, z, 0.049, 0.036, -0.066, 0.021, 0.012 * h.cheek, 0.018), 0.014);
  // brow ridge
  const br = 0.0105 * h.brow * (1 - f * 0.45);
  d = smin(d, sdCap(x, y, z, -0.032, 0.079, -0.087, 0.032, 0.079, -0.087, br), 0.014);
  // nose: bridge, tip, wings
  const nl = h.noseLen, ns = h.nose * (1 - f * 0.15);
  d = smin(d, sdCap(x, y, z, 0, 0.07, -0.095, h.crooked * 0.004, 0.025, -0.096 - 0.017 * nl, 0.0078 * ns), 0.008);
  d = smin(d, sdEll(x, y, z, h.crooked * 0.004, 0.0145, -0.097 - 0.016 * nl, 0.0112 * ns, 0.0105 * ns, 0.0106 * ns), 0.008);
  d = smin(d, sdEll(ax, y, z, 0.0118 * ns, 0.0105, -0.1 - 0.006 * nl, 0.0082 * ns, 0.0064 * ns, 0.0075 * ns), 0.007);
  // lips
  const lp = h.lips * (1 + f * 0.2);
  d = smin(d, sdEll(x, y, z, 0, -0.0115, -0.0905, 0.0195, 0.0058 * lp, 0.0078 * lp), 0.006);
  d = smin(d, sdEll(x, y, z, 0, -0.0235 - jd * 0.7, -0.0895, 0.0175, 0.0062 * lp, 0.008 * lp), 0.006);
  // mouth slit / open mouth
  d = smax(d, -sdEll(x, y, z, 0, -0.0175 - jd * 0.35, -0.0985, 0.019, 0.0009 + h.mouthOpen, 0.0055 + h.mouthOpen * 2), 0.0012);
  // eye sockets (almond, lids cover part of the eyeball)
  const ey = 0.056 + h.eyeY;
  d = smax(d, -sdEll(ax, y, z, 0.032, ey, -0.093 + 0.002 * (h.socket - 1), 0.0165, 0.0092 + 0.002 * (h.socket - 1), 0.012 * h.socket), 0.008);
  // eyelids: thin shells over the top and bottom of the eyeball -> almond opening
  const ex = ax - 0.0318, eyy = y - ey, ez = z + 0.0795;
  const er0 = Math.hypot(ex, eyy, ez);
  const lidOpen = h.lidOpen ?? 1;
  const up = smax(er0 - 0.0128, 0.003 * lidOpen - eyy + ex * ex * 8, 0.0012);
  const lo = smax(er0 - 0.0124, eyy + 0.0046 * lidOpen + ex * ex * 6, 0.0012);
  d = smin(d, Math.min(up, lo), 0.0035);
  if (h.gaunt) {
    d += h.gaunt * 0.007 * Math.exp(-(((ax - 0.05) / 0.018) ** 2) - (((y - 0.0) / 0.022) ** 2) - (((z + 0.068) / 0.03) ** 2));
    d += h.gaunt * 0.004 * Math.exp(-(((ax - 0.064) / 0.015) ** 2) - (((y - 0.075) / 0.02) ** 2) - (((z + 0.045) / 0.025) ** 2));
  }
  if (h.swell) d -= h.swell * 0.008 * Math.exp(-(((x - 0.045) / 0.035) ** 2) - ((y / 0.04) ** 2) - (((z + 0.05) / 0.05) ** 2));
  // ears: thin flap with a hollow
  const er = h.ear;
  d = smin(d, sdEll(ax, y, z, 0.0725, 0.044, 0.019, 0.0078 * er, 0.029 * er, 0.0165 * er), 0.005);
  d = smax(d, -sdEll(ax, y, z, 0.0795, 0.044, 0.019, 0.0035, 0.016 * er, 0.009 * er), 0.003);
  // neck
  const nk = h.neck * (1 - f * 0.1);
  d = smin(d, sdCap(x, y, z, 0, -0.012, 0.024, 0, -0.165, 0.034, 0.059 * nk), 0.03);
  return d;
}

// Head grid parameterisation: vertices are uniform in (u, v); directions are
// warped so the face (u ~ 0.5, mid v) receives more vertices and texels.
const HEAD_O = [0, 0.042, 0.0];
const HK_U = 0.4, HK_V = 0.35;
export function headDir(u, v, out = [0, 0, 0]) {
  const s = 2 * u - 1;
  const ph = Math.PI * (s * (1 - HK_U) + HK_U * s * s * s);
  const tt = 1 - v;
  const th = Math.PI * (tt + HK_V * Math.sin(TAU * tt) / TAU);
  out[0] = Math.sin(ph) * Math.sin(th); out[1] = Math.cos(th); out[2] = -Math.cos(ph) * Math.sin(th);
  return out;
}
// Inverse (approx, iterative) : direction -> (u, v)
export function headUV(dx, dy, dz, out = [0, 0]) {
  const ph = Math.atan2(dx, -dz);
  const th = Math.acos(clamp(dy / (Math.hypot(dx, dy, dz) || 1), -1, 1));
  // solve s*(1-k) + k s^3 = ph/pi
  let s = ph / Math.PI;
  for (let i = 0; i < 8; i++) { const f = s * (1 - HK_U) + HK_U * s * s * s - ph / Math.PI; s -= f / ((1 - HK_U) + 3 * HK_U * s * s); }
  let tt = th / Math.PI;
  for (let i = 0; i < 8; i++) { const f = tt + HK_V * Math.sin(TAU * tt) / TAU - th / Math.PI; tt -= f / (1 + HK_V * Math.cos(TAU * tt)); }
  out[0] = (s + 1) / 2; out[1] = 1 - tt;
  return out;
}

// Raymarch the head SDF over a (W+1)x(H+1) grid. Returns positions, SDF
// normals and cheap ambient occlusion per grid vertex (reused by painters).
const headCache = new Map();
export function headGrid(hp, W, H) {
  const key = JSON.stringify(hp) + W + 'x' + H;
  if (headCache.has(key)) return headCache.get(key);
  const h = Object.assign({}, HEAD_DEFAULT, hp);
  const n = (W + 1) * (H + 1);
  const pos = new Float32Array(n * 3), nor = new Float32Array(n * 3), ao = new Float32Array(n);
  const d = [0, 0, 0];
  const sdf = (x, y, z) => headSDF(x, y, z, h);
  for (let j = 0; j <= H; j++) {
    for (let i = 0; i <= W; i++) {
      const k = j * (W + 1) + i;
      headDir(i / W, j / H, d);
      let lo = 0.004, hi = 0.3;
      for (let it = 0; it < 19; it++) {
        const m = (lo + hi) * 0.5;
        if (sdf(HEAD_O[0] + d[0] * m, HEAD_O[1] + d[1] * m, HEAD_O[2] + d[2] * m) > 0) hi = m; else lo = m;
      }
      const t = (lo + hi) * 0.5;
      const x = HEAD_O[0] + d[0] * t, y = HEAD_O[1] + d[1] * t, z = HEAD_O[2] + d[2] * t;
      pos[k * 3] = x; pos[k * 3 + 1] = y; pos[k * 3 + 2] = z;
      const e = 0.0008;
      let gx = sdf(x + e, y, z) - sdf(x - e, y, z), gy = sdf(x, y + e, z) - sdf(x, y - e, z), gz = sdf(x, y, z + e) - sdf(x, y, z - e);
      const gl = Math.hypot(gx, gy, gz) || 1;
      gx /= gl; gy /= gl; gz /= gl;
      nor[k * 3] = gx; nor[k * 3 + 1] = gy; nor[k * 3 + 2] = gz;
      let occ = 0;
      for (let s = 1; s <= 4; s++) {
        const dd = s * 0.006;
        occ += (dd - sdf(x + gx * dd, y + gy * dd, z + gz * dd)) / dd * (1 / s);
      }
      ao[k] = clamp(1 - occ * 0.42, 0, 1);
    }
  }
  const out = { W, H, pos, nor, ao, hp: h };
  headCache.set(key, out);
  return out;
}
// Bilinear sample of a head grid at (u, v): writes p, n, returns ao.
export function sampleHead(g, u, v, p, n) {
  const fx = clamp(u, 0, 1) * g.W, fy = clamp(v, 0, 1) * g.H;
  const i0 = Math.min(g.W - 1, Math.floor(fx)), j0 = Math.min(g.H - 1, Math.floor(fy));
  const tx = fx - i0, ty = fy - j0;
  const k00 = j0 * (g.W + 1) + i0, k10 = k00 + 1, k01 = k00 + g.W + 1, k11 = k01 + 1;
  const w00 = (1 - tx) * (1 - ty), w10 = tx * (1 - ty), w01 = (1 - tx) * ty, w11 = tx * ty;
  for (let c = 0; c < 3; c++) {
    p[c] = g.pos[k00 * 3 + c] * w00 + g.pos[k10 * 3 + c] * w10 + g.pos[k01 * 3 + c] * w01 + g.pos[k11 * 3 + c] * w11;
    n[c] = g.nor[k00 * 3 + c] * w00 + g.nor[k10 * 3 + c] * w10 + g.nor[k01 * 3 + c] * w01 + g.nor[k11 * 3 + c] * w11;
  }
  return g.ao[k00] * w00 + g.ao[k10] * w10 + g.ao[k01] * w01 + g.ao[k11] * w11;
}

// Head surface piece (and optional offset shells over masked areas: hair,
// beards, hoods). thick(p, n, u, v) -> offset in metres (<= 0 = not included).
function headPiece(P, grid, rect, o = {}) {
  const { W, H, pos, nor } = grid;
  const base = P.count;
  const th = o.thick ? new Float32Array((W + 1) * (H + 1)) : null;
  const pp = [0, 0, 0], nn = [0, 0, 0];
  P.n = P.n || [];
  for (let j = 0; j <= H; j++) {
    for (let i = 0; i <= W; i++) {
      const k = j * (W + 1) + i;
      let x = pos[k * 3], y = pos[k * 3 + 1], z = pos[k * 3 + 2];
      const nx = nor[k * 3], ny = nor[k * 3 + 1], nz = nor[k * 3 + 2];
      if (th) {
        pp[0] = x; pp[1] = y; pp[2] = z; nn[0] = nx; nn[1] = ny; nn[2] = nz;
        const t = o.thick(pp, nn, i / W, j / H);
        th[k] = t;
        const off = Math.max(t, 0) + (o.minOff ?? 0.0012);
        x += nx * off; y += ny * off; z += nz * off;
        if (o.warp) { pp[0] = x; pp[1] = y; pp[2] = z; o.warp(pp, nn, i / W, j / H, t); x = pp[0]; y = pp[1]; z = pp[2]; }
      }
      P.vert(x, y, z, rect[0] + (i / W) * rect[2], rect[1] + (j / H) * rect[3], i / W, j / H);
      P.n.push(nx, ny, nz);
    }
  }
  const row = W + 1;
  for (let j = 0; j < H; j++) {
    for (let i = 0; i < W; i++) {
      const A = j * row + i, B = A + 1, C = A + row, D = C + 1;
      if (th && !(th[A] > 0 || th[B] > 0 || th[C] > 0 || th[D] > 0)) continue;
      if (th && o.strict && !(th[A] > 0 && th[B] > 0 && th[C] > 0 && th[D] > 0)) continue;
      // u increases towards +X (right) on the face, C is above A
      P.idx.push(base + A, base + C, base + B, base + B, base + C, base + D);
    }
  }
  if (th) { P.n = null; compact(P, base); } // recompute normals for shells
  return P;
}

// Drop vertices (from index `from` on) that no triangle references.
function compact(P, from = 0) {
  const n = P.count;
  const used = new Uint8Array(n);
  for (let i = 0; i < from; i++) used[i] = 1;
  for (const k of P.idx) used[k] = 1;
  const remap = new Int32Array(n);
  let m = 0;
  const keep = (arr, w) => { const out = []; for (let i = 0; i < n; i++) if (used[i]) for (let c = 0; c < w; c++) out.push(arr[i * w + c]); return out; };
  for (let i = 0; i < n; i++) remap[i] = used[i] ? m++ : -1;
  P.p = keep(P.p, 3); P.uv = keep(P.uv, 2); P.loc = keep(P.loc, 2);
  P.b0 = keep(P.b0, 1); P.b1 = keep(P.b1, 1); P.w = keep(P.w, 1);
  if (P.n) P.n = keep(P.n, 3);
  P.idx = P.idx.map((k) => remap[k]);
}

// ==================================================== body part profiles ==
// Torso key sections: [h (m above pelvis), halfWidth, frontDepth, backDepth, squareness]
const TORSO_KEYS = [
  [-0.155, 0.02, 0.016, 0.022, 2.0],
  [-0.14, 0.07, 0.045, 0.058, 2.0],
  [-0.115, 0.118, 0.07, 0.092, 2.1],
  [-0.08, 0.152, 0.083, 0.113, 2.2],
  [-0.04, 0.166, 0.09, 0.118, 2.25],
  [0.0, 0.17, 0.095, 0.11, 2.3],
  [0.06, 0.162, 0.099, 0.097, 2.3],
  [0.13, 0.149, 0.101, 0.091, 2.4],
  [0.21, 0.152, 0.105, 0.095, 2.5],
  [0.29, 0.162, 0.113, 0.1, 2.6],
  [0.35, 0.171, 0.116, 0.1, 2.6],
  [0.385, 0.172, 0.107, 0.097, 2.5],
  [0.415, 0.163, 0.09, 0.089, 2.4],
  [0.44, 0.152, 0.072, 0.08, 2.3],
  [0.462, 0.126, 0.063, 0.074, 2.2],
  [0.482, 0.098, 0.058, 0.068, 2.1],
  [0.5, 0.075, 0.056, 0.063, 2.0],
  [0.53, 0.061, 0.053, 0.056, 2.0],
  [0.57, 0.057, 0.051, 0.054, 2.0],
  [0.6, 0.04, 0.036, 0.04, 2.0],
];
const TORSO_H_HI = [-0.155, -0.145, -0.13, -0.115, -0.095, -0.075, -0.05, -0.025, 0, 0.03, 0.065, 0.1, 0.14, 0.18, 0.22, 0.26, 0.29, 0.32, 0.35, 0.37, 0.39, 0.405, 0.42, 0.435, 0.45, 0.465, 0.48, 0.495, 0.515, 0.54, 0.57, 0.6];
const TORSO_H_LO = [-0.155, -0.13, -0.1, -0.06, -0.02, 0.04, 0.12, 0.2, 0.28, 0.34, 0.385, 0.42, 0.45, 0.48, 0.51, 0.56, 0.6];

function catmull(keys, h, col) {
  if (h <= keys[0][0]) return keys[0][col];
  const n = keys.length;
  if (h >= keys[n - 1][0]) return keys[n - 1][col];
  let i = 0;
  while (i < n - 2 && keys[i + 1][0] < h) i++;
  const k0 = keys[Math.max(0, i - 1)], k1 = keys[i], k2 = keys[i + 1], k3 = keys[Math.min(n - 1, i + 2)];
  const t = (h - k1[0]) / (k2[0] - k1[0]);
  const p0 = k0[col], p1 = k1[col], p2 = k2[col], p3 = k3[col];
  const t2 = t * t, t3 = t2 * t;
  return 0.5 * ((2 * p1) + (-p0 + p2) * t + (2 * p0 - 5 * p1 + 4 * p2 - p3) * t2 + (-p0 + 3 * p1 - 3 * p2 + p3) * t3);
}

// Torso cross-section point for height h (m) and angle a (0 = front, +pi/2 = right).
function torsoPoint(h, a, s, out, off = 0) {
  let W = catmull(TORSO_KEYS, h, 1), F = catmull(TORSO_KEYS, h, 2), Bk = catmull(TORSO_KEYS, h, 3);
  const n = catmull(TORSO_KEYS, h, 4);
  const f = s.female || 0, fat = s.fat || 0, mus = s.muscle || 0, ch = (s.chest ?? 1) - 1;
  // female: narrower waist & shoulders, wider hips
  W *= 1 + f * (0.06 * gauss(h + 0.04, 0.06) - 0.13 * gauss(h - 0.14, 0.07) - 0.09 * gauss(h - 0.38, 0.06) - 0.06 * gauss(h - 0.29, 0.05) - 0.12 * sstep(0.47, 0.52, h));
  Bk *= 1 + f * 0.1 * gauss(h + 0.06, 0.05);
  F *= 1 - f * 0.08 * gauss(h - 0.14, 0.08);
  // body mass
  F += fat * 0.07 * gauss(h - 0.09, 0.13) + fat * 0.02 * gauss(h - 0.3, 0.08);
  W += fat * 0.035 * gauss(h - 0.07, 0.16) + fat * 0.012 * gauss(h - 0.3, 0.1);
  Bk += fat * 0.022 * gauss(h - 0.05, 0.16);
  W += mus * (0.022 * gauss(h - 0.39, 0.06) + 0.02 * gauss(h - 0.46, 0.03)) + ch * 0.03 * gauss(h - 0.33, 0.08);
  F += mus * 0.012 * gauss(h - 0.3, 0.05) + ch * 0.025 * gauss(h - 0.3, 0.07);
  Bk += mus * 0.01 * gauss(h - 0.36, 0.08) + ch * 0.015 * gauss(h - 0.34, 0.08) + (s.hump || 0) * 0.07 * gauss(h - 0.42, 0.09);
  const hw = s.hunchW || 0;
  W += hw * 0.07 * gauss(h - 0.41, 0.08);
  const sa = Math.sin(a), ca = Math.cos(a);
  const e = 2 / n;
  let x = W * spow(sa, e);
  let z = -(ca >= 0 ? F : Bk) * spow(ca, e);
  let r = Math.hypot(x, z) || 1e-6;
  const ux = x / r, uz = z / r;
  const aa = Math.abs(a);
  let bump = 0;
  // pecs / breasts
  bump += (1 - f) * (0.009 + mus * 0.008) * gauss(h - 0.3, 0.045) * gauss(aa - 0.5, 0.32) * sstep(0.21, 0.27, h);
  if (f > 0) bump += f * 0.034 * (s.bust ?? 1) * gauss(h - 0.275, 0.05) * gauss(aa - 0.44, 0.3);
  // shoulder blades, spine groove, buttocks + cleft, collarbones, navel
  bump += 0.007 * gauss(h - 0.33, 0.06) * gauss(aa - 2.55, 0.35);
  bump -= 0.006 * gauss(aa - Math.PI, 0.18) * sstep(0.0, 0.08, h) * (1 - sstep(0.38, 0.45, h));
  bump += (0.02 + f * 0.01) * gauss(h + 0.06, 0.05) * gauss(aa - 2.65, 0.45);
  bump -= 0.014 * gauss(aa - Math.PI, 0.12) * sstep(0.0, -0.05, h);
  bump += 0.004 * gauss(h - 0.43, 0.012) * gauss(aa - 0.55, 0.35);
  bump -= 0.004 * gauss(h - 0.1, 0.012) * gauss(a, 0.08);
  // abdominal / ribcage shaping for thin bodies
  bump -= (s.thin || 0) * 0.02 * gauss(h - 0.16, 0.06) * gauss(a, 0.9);
  bump += (s.bumps ? s.bumps(h, a) : 0);
  r = r + bump + off;
  out[0] = ux * r; out[2] = uz * r;
  return out;
}

// Limb cross-section: radius keys per t, plus muscle bumps. Local a: 0 =
// posterior (-Z), pi = anterior (+Z), +pi/2 = lateral (+X) for the right side.
const UARM_KEYS = [[-0.2, 0.004, 0.004], [-0.16, 0.026, 0.026], [-0.1, 0.046, 0.045], [-0.03, 0.054, 0.052], [0.05, 0.057, 0.055], [0.15, 0.055, 0.054], [0.3, 0.05, 0.05], [0.45, 0.048, 0.05], [0.6, 0.046, 0.047], [0.75, 0.043, 0.043], [0.9, 0.04, 0.041], [1.0, 0.039, 0.04], [1.08, 0.033, 0.034], [1.12, 0.02, 0.02]];
const FARM_KEYS = [[-0.15, 0.004, 0.004], [-0.12, 0.028, 0.03], [-0.06, 0.038, 0.04], [0.0, 0.042, 0.043], [0.1, 0.046, 0.044], [0.22, 0.045, 0.042], [0.38, 0.039, 0.037], [0.55, 0.033, 0.032], [0.72, 0.026, 0.029], [0.88, 0.021, 0.029], [1.0, 0.02, 0.03], [1.04, 0.018, 0.028]];
const THIGH_KEYS = [[-0.24, 0.005, 0.005], [-0.2, 0.055, 0.055], [-0.13, 0.088, 0.088], [-0.06, 0.098, 0.095], [0.04, 0.097, 0.094], [0.16, 0.091, 0.089], [0.3, 0.082, 0.08], [0.45, 0.075, 0.074], [0.6, 0.068, 0.068], [0.74, 0.061, 0.062], [0.86, 0.056, 0.058], [0.95, 0.054, 0.056], [1.03, 0.051, 0.052], [1.1, 0.045, 0.046], [1.15, 0.035, 0.035]];
const SHIN_KEYS = [[-0.13, 0.005, 0.005], [-0.1, 0.042, 0.045], [-0.04, 0.05, 0.052], [0.03, 0.05, 0.052], [0.12, 0.05, 0.054], [0.22, 0.05, 0.058], [0.32, 0.047, 0.056], [0.45, 0.042, 0.048], [0.6, 0.036, 0.04], [0.75, 0.031, 0.034], [0.88, 0.029, 0.031], [0.96, 0.031, 0.032], [1.02, 0.031, 0.033], [1.06, 0.028, 0.03]];

function limbPoint(keys, t, a, kx, kz, bumpFn, out, off = 0) {
  const rx = catmull(keys, t, 1) * kx, rz = catmull(keys, t, 2) * kz;
  const sa = Math.sin(a), ca = Math.cos(a);
  let x = rx * sa, z = -rz * ca;
  let r = Math.hypot(x, z) || 1e-6;
  const ux = x / r, uz = z / r;
  r += (bumpFn ? bumpFn(t, a) : 0) + off;
  out[0] = ux * r; out[2] = uz * r;
  return out;
}
const uarmBump = (bulk) => (t, a) => {
  const lat = gauss(a - Math.PI / 2, 0.9), ant = gauss(Math.abs(a) - Math.PI, 0.7), post = gauss(a, 0.8);
  return bulk * (0.005 * gauss(t - 0.1, 0.14) * (lat + 0.5 * ant) + 0.007 * gauss(t - 0.55, 0.18) * ant + 0.005 * gauss(t - 0.4, 0.22) * post);
};
const farmBump = (bulk) => (t, a) => bulk * (0.006 * gauss(t - 0.15, 0.14) * gauss(a - 2.2, 0.8) + 0.004 * gauss(t - 0.2, 0.15) * gauss(a + 2.0, 0.8) + 0.003 * gauss(t + 0.02, 0.05) * gauss(a, 0.5));
const thighBump = (bulk) => (t, a) => bulk * (0.008 * gauss(t - 0.35, 0.25) * gauss(Math.abs(a) - Math.PI, 0.9) + 0.006 * gauss(t - 0.1, 0.2) * gauss(a - Math.PI / 2, 0.8)) + 0.006 * gauss(t - 1.0, 0.06) * gauss(Math.abs(a) - Math.PI, 0.45);
const shinBump = (bulk) => (t, a) => bulk * 0.011 * gauss(t - 0.26, 0.16) * gauss(a, 1.0) - 0.004 * gauss(Math.abs(a) - Math.PI, 0.4) * sstep(0.1, 0.3, t) + 0.004 * gauss(t - 0.97, 0.03) * gauss(Math.abs(a) - Math.PI / 2, 0.5);

// ============================================================ weighting ==
// Assign [bone0, bone1, weight0] per vertex from part-local coordinates.
function setW(P, i, b0, b1, w0) {
  if (w0 >= 0.999 || b1 === b0) { P.b0[i] = b0; P.b1[i] = b0; P.w[i] = 1; return; }
  P.b0[i] = b0; P.b1[i] = b1; P.w[i] = w0;
}
function weightTorso(P, s) {
  for (let i = 0; i < P.count; i++) {
    const x = P.p[i * 3], h = P.p[i * 3 + 1] * TORSO_LEN;
    const ax = Math.abs(x);
    const wArm = 0.48 * sstep(0.11, 0.2, ax) * sstep(0.29, 0.38, h);
    const wLeg = 0.5 * sstep(0.02, -0.13, h) * sstep(0.0, 0.07, ax);
    const wHead = 0.55 * sstep(0.52, 0.6, h);
    const side = x < 0;
    if (wArm >= wLeg && wArm >= wHead && wArm > 0.001) setW(P, i, BONE.TORSO, side ? BONE.UARML : BONE.UARMR, 1 - wArm);
    else if (wLeg >= wHead && wLeg > 0.001) setW(P, i, BONE.TORSO, side ? BONE.THIGHL : BONE.THIGHR, 1 - wLeg);
    else if (wHead > 0.001) setW(P, i, BONE.TORSO, BONE.HEAD, 1 - wHead);
    else setW(P, i, BONE.TORSO, BONE.TORSO, 1);
  }
}
// Right-side limb weights (mirrored later)
function weightLimb(P, self, parent, child, parentW, childW) {
  for (let i = 0; i < P.count; i++) {
    const t = P.loc[i * 2 + 1];
    const wp = parentW ? parentW(t) : 0, wc = childW ? childW(t) : 0;
    if (wp > wc && wp > 0.001) setW(P, i, self, parent, 1 - wp);
    else if (wc > 0.001) setW(P, i, self, child, 1 - wc);
    else setW(P, i, self, self, 1);
  }
}

// ================================================================ hands ==
// Right hand in hand space (metres): origin at the wrist, +Y toward the
// fingers, palm facing -X (medial), thumb toward +Z, back of hand +X.
// pose: {curl 0..1, spread, claw (nail length), fingerLen}
function buildHand(P, o, lod) {
  const hi = lod !== 'crowd';
  const fsegs = hi ? 10 : 5;
  const curl = o.curl ?? 0.55, spread = o.spread ?? 0.1, flen = o.fingerLen ?? 1, pal = o.palm ?? 1;
  const segs = hi ? 10 : 6;
  const R = RECT.hand;
  const sub = (x0, w) => [R[0] + x0 * R[2], R[1], w * R[2], R[3]];
  // palm (rounded box via superellipse tube along Y)
  const palmTs = hi ? [-0.02, 0.0, 0.015, 0.03, 0.045, 0.06, 0.075, 0.088, 0.096] : [-0.02, 0.01, 0.045, 0.075, 0.094];
  tube(P, {
    ts: palmTs, segs: hi ? 16 : 8, rect: sub(0, 0.45), tA: -0.02, tB: 0.096, aOff: Math.PI / 2,
    fn: (y, a, out) => {
      const k = sstep(-0.02, 0.07, y);
      const hx = lerp(0.019, 0.0135, k) * pal, hz = lerp(0.027, 0.044, k) * pal;
      const e = 2 / 3.2;
      // a = pi/2 -> +X (back of the hand), a = -pi/2 -> palm
      const z0 = -hz * spow(Math.cos(a), e);
      let x = hx * spow(Math.sin(a), e), z = z0;
      // thenar pad (palm side near the thumb), knuckle ridge at the back
      if (x < 0) x -= 0.006 * gauss(z - 0.028, 0.014) * gauss(y - 0.03, 0.03);
      if (x > 0) x += 0.003 * sstep(0.07, 0.09, y) * (0.5 + 0.5 * Math.cos(z * 150));
      out[0] = x; out[1] = y + (y > 0.08 ? -Math.abs(z) * 0.18 : 0); out[2] = z;
    },
  });
  // fingers
  const F = [
    { z: 0.029, len: 0.074, r: 0.0098 },
    { z: 0.0095, len: 0.082, r: 0.0098 },
    { z: -0.0105, len: 0.077, r: 0.0092 },
    { z: -0.0295, len: 0.061, r: 0.0082 },
  ];
  const segN = hi ? 3 : 1;
  F.forEach((f, fi) => {
    const len = f.len * flen;
    const Ls = [len * 0.46, len * 0.3, len * 0.24];
    const ang = [curl * 0.45 + (o.fingerCurl?.[fi] ?? 0), curl * 0.85, curl * 0.5];
    const sp = spread * (fi - 1.5) * 0.35;
    let px = 0.001, py = 0.088 - Math.abs(f.z) * 0.2, pz = f.z;
    let th = 0;
    const pts = [[px, py - 0.012, pz]], rad = [f.r * 1.08];
    pts.push([px, py, pz]); rad.push(f.r * 1.05);
    for (let s = 0; s < 3; s++) {
      th += ang[s];
      const dx = -Math.sin(th), dy = Math.cos(th), dz = sp;
      for (let q = 1; q <= segN; q++) {
        const k = q / segN;
        pts.push([px + dx * Ls[s] * k, py + dy * Ls[s] * k, pz + dz * Ls[s] * k]);
        const rr = f.r * (1 - 0.1 * s - 0.08 * k) * (q === segN && s < 2 ? 1.04 : 1);
        rad.push([rr * 0.92, rr]);
      }
      px += dx * Ls[s]; py += dy * Ls[s]; pz += dz * Ls[s];
    }
    if (o.claw) { // long nails / claws continuing the last direction
      const dx = -Math.sin(th + 0.25), dy = Math.cos(th + 0.25);
      pts.push([px + dx * o.claw * 0.5, py + dy * o.claw * 0.5, pz]); rad.push([f.r * 0.5, f.r * 0.6]);
      pts.push([px + dx * o.claw, py + dy * o.claw, pz]); rad.push([f.r * 0.12, f.r * 0.2]);
    }
    sweep(P, pts, rad, fsegs, sub(0.5 + fi * 0.1, 0.1), { up: [1, 0, 0], capEnd: !o.claw, capRings: hi ? 3 : 1 });
  });
  // thumb
  {
    const tc = o.thumbCurl ?? curl;
    let p = [-0.006, 0.012, 0.024];
    const dirs = [[-0.15, 0.55, 0.82], [-0.4 * tc - 0.1, 0.8, 0.45 - 0.2 * tc], [-0.75 * tc - 0.1, 0.7, 0.15]];
    const lens = [0.038, 0.03, 0.027];
    const pts = [p.slice()], rad = [0.0135];
    for (let s = 0; s < 3; s++) {
      const d = new THREE.Vector3(...dirs[s]).normalize();
      for (let q = 1; q <= segN; q++) {
        const k = q / segN;
        pts.push([p[0] + d.x * lens[s] * k, p[1] + d.y * lens[s] * k, p[2] + d.z * lens[s] * k]);
        rad.push([0.0115 - s * 0.0012, 0.0108 - s * 0.001]);
      }
      p = [p[0] + d.x * lens[s], p[1] + d.y * lens[s], p[2] + d.z * lens[s]];
    }
    if (o.claw) { pts.push([p[0] - 0.004, p[1] + o.claw * 0.7, p[2] + 0.004]); rad.push(0.002); }
    sweep(P, pts, rad, fsegs, sub(0.9, 0.1), { up: [1, 0, 0.3], capEnd: !o.claw, capRings: hi ? 3 : 1 });
  }
  return P;
}

// ================================================================= feet ==
// Loft from heel (+Z) to toe (-Z) in foot space (Y up, ankle at origin).
const FOOT_KEYS = [
  // t, z, halfWidth, centreY, top, bottom
  [0.0, 0.074, 0.012, -0.05, 0.012, 0.012],
  [0.04, 0.066, 0.03, -0.042, 0.036, 0.037],
  [0.12, 0.044, 0.038, -0.028, 0.058, 0.052],
  [0.25, 0.008, 0.041, -0.03, 0.058, 0.05],
  [0.4, -0.034, 0.044, -0.046, 0.038, 0.034],
  [0.55, -0.075, 0.047, -0.055, 0.028, 0.025],
  [0.7, -0.116, 0.048, -0.059, 0.022, 0.021],
  [0.82, -0.149, 0.045, -0.061, 0.019, 0.019],
  [0.92, -0.177, 0.036, -0.063, 0.016, 0.017],
  [0.98, -0.194, 0.021, -0.065, 0.011, 0.013],
  [1.0, -0.199, 0.006, -0.066, 0.004, 0.005],
];
function buildFoot(P, o, lod) {
  const hi = lod !== 'crowd';
  const ts = hi ? [0, 0.02, 0.04, 0.08, 0.12, 0.18, 0.25, 0.32, 0.4, 0.48, 0.55, 0.63, 0.7, 0.76, 0.82, 0.87, 0.92, 0.96, 0.98, 1.0] : [0, 0.04, 0.12, 0.25, 0.4, 0.55, 0.7, 0.82, 0.92, 0.98, 1.0];
  const wk = o.width ?? 1, boot = o.boot ? 1 : 0, bare = o.bare ? 1 : 0, chunky = o.chunky ?? 0;
  tube(P, {
    ts, segs: hi ? 20 : 10, rect: RECT.foot, aOff: 0, flip: true,
    fn: (t, a, out) => {
      const z = catmull(FOOT_KEYS, t, 1), hw = catmull(FOOT_KEYS, t, 2) * wk * (1 - bare * 0.1) * (1 + chunky * 0.08);
      let cy = catmull(FOOT_KEYS, t, 3), top = catmull(FOOT_KEYS, t, 4), bot = catmull(FOOT_KEYS, t, 5);
      if (boot) { const k = sstep(0.45, 0.1, t); top += k * 0.05; cy += k * 0.025; bot += k * 0.025; }
      if (bare) { top -= 0.008 * sstep(0.3, 0.8, t); bot -= 0.003; }
      bot += chunky * 0.006;
      const ca = Math.cos(a), sa = Math.sin(a);
      const nTop = 2 / 2.6, nBot = 2 / 5;
      const y = cy + (ca >= 0 ? top * spow(ca, nTop) : bot * spow(ca, nBot));
      const x = hw * spow(sa, ca >= 0 ? nTop : nBot);
      out[0] = x; out[1] = y; out[2] = z;
    },
  });
  return P;
}

// ============================================================ assembly ==
// Transform piece to rest-pose world space with a column-major matrix.
function applyMat(P, m) {
  const p = P.p;
  for (let i = 0; i < p.length; i += 3) {
    const x = p[i], y = p[i + 1], z = p[i + 2];
    p[i] = m[0] * x + m[4] * y + m[8] * z + m[12];
    p[i + 1] = m[1] * x + m[5] * y + m[9] * z + m[13];
    p[i + 2] = m[2] * x + m[6] * y + m[10] * z + m[14];
  }
  if (P.n) {
    const n = P.n;
    for (let i = 0; i < n.length; i += 3) {
      const x = n[i], y = n[i + 1], z = n[i + 2];
      let a = m[0] * x + m[4] * y + m[8] * z, b = m[1] * x + m[5] * y + m[9] * z, c = m[2] * x + m[6] * y + m[10] * z;
      const l = Math.hypot(a, b, c) || 1;
      n[i] = a / l; n[i + 1] = b / l; n[i + 2] = c / l;
    }
  }
}
function mirrorPiece(P) {
  const Q = new Piece({ region: P.region, mat: P.mat, bone: MIRROR_BONE[P.bone], name: P.name + 'M' });
  Q.frame = MIRROR_BONE[P.frame];
  Q.p = P.p.slice(); Q.uv = P.uv.slice(); Q.loc = P.loc.slice(); Q.w = P.w.slice();
  for (let i = 0; i < Q.p.length; i += 3) Q.p[i] = -Q.p[i];
  if (P.n) { Q.n = P.n.slice(); for (let i = 0; i < Q.n.length; i += 3) Q.n[i] = -Q.n[i]; }
  Q.b0 = P.b0.map((b) => MIRROR_BONE[b]); Q.b1 = P.b1.map((b) => MIRROR_BONE[b]);
  Q.idx = [];
  for (let i = 0; i < P.idx.length; i += 3) Q.idx.push(P.idx[i], P.idx[i + 2], P.idx[i + 1]);
  Q.side = -1;
  return Q;
}
function computeNormals(P) {
  const p = P.p, n = new Float32Array(p.length);
  for (let i = 0; i < P.idx.length; i += 3) {
    const a = P.idx[i] * 3, b = P.idx[i + 1] * 3, c = P.idx[i + 2] * 3;
    const ux = p[b] - p[a], uy = p[b + 1] - p[a + 1], uz = p[b + 2] - p[a + 2];
    const vx = p[c] - p[a], vy = p[c + 1] - p[a + 1], vz = p[c + 2] - p[a + 2];
    const nx = uy * vz - uz * vy, ny = uz * vx - ux * vz, nz = ux * vy - uy * vx;
    for (const k of [a, b, c]) { n[k] += nx; n[k + 1] += ny; n[k + 2] += nz; }
  }
  // weld seam duplicates (same position) so UV seams do not show in shading
  const map = new Map();
  const q = (v) => Math.round(v * 20000);
  for (let i = 0; i < p.length; i += 3) {
    const key = q(p[i]) + ',' + q(p[i + 1]) + ',' + q(p[i + 2]);
    const g = map.get(key);
    if (g) g.push(i); else map.set(key, [i]);
  }
  for (const g of map.values()) {
    if (g.length < 2) continue;
    let x = 0, y = 0, z = 0;
    for (const i of g) { x += n[i]; y += n[i + 1]; z += n[i + 2]; }
    for (const i of g) { n[i] = x; n[i + 1] = y; n[i + 2] = z; }
  }
  for (let i = 0; i < n.length; i += 3) {
    const l = Math.hypot(n[i], n[i + 1], n[i + 2]) || 1;
    n[i] /= l; n[i + 1] /= l; n[i + 2] /= l;
  }
  P.n = Array.from(n);
}

// Give an open (single-layer) surface a back face: an inset copy with reversed
// winding and flipped normals, so it can render with FrontSide materials.
function thicken(P, d) {
  const n = P.count;
  for (let i = 0; i < n; i++) {
    const nx = P.n[i * 3], ny = P.n[i * 3 + 1], nz = P.n[i * 3 + 2];
    P.p.push(P.p[i * 3] - nx * d, P.p[i * 3 + 1] - ny * d, P.p[i * 3 + 2] - nz * d);
    P.n.push(-nx, -ny, -nz);
    P.uv.push(P.uv[i * 2], P.uv[i * 2 + 1]); P.loc.push(P.loc[i * 2], P.loc[i * 2 + 1]);
    P.b0.push(P.b0[i]); P.b1.push(P.b1[i]); P.w.push(P.w[i]);
  }
  const m = P.idx.length;
  for (let i = 0; i < m; i += 3) P.idx.push(P.idx[i] + n, P.idx[i + 2] + n, P.idx[i + 1] + n);
}

let BIND = null;
export function bindMatrices() {
  if (BIND) return BIND;
  const b = bindPoseBody();
  const mats = [];
  for (let i = 0; i < 10; i++) mats.push(partMatrix(b, i, new Float32Array(16)));
  mats.push(footMatrix(b, 0, new Float32Array(16)));
  mats.push(footMatrix(b, 1, new Float32Array(16)));
  const inv = mats.map((m) => new THREE.Matrix4().fromArray(m).invert().toArray(new Float32Array(16)));
  BIND = { mats, inv, body: b };
  return BIND;
}

// =================================================== character building ==
// spec: {
//   lod: 'hi' | 'crowd', female, fat, muscle, chest, thin, hump, hunchW, bust,
//   armBulk, armBulkL, armBulkR, legBulk, neck, head: {...HEAD_DEFAULT},
//   hand: {curl, spread, claw, fingerLen}, foot: {boot, bare, chunky, width},
//   eyes: bool, layers: [...], accessories: bool (crowd), extras: fn(ctx)
// }
function buildPieces(spec) {
  const lod = spec.lod || 'hi';
  const hi = lod !== 'crowd';
  const pieces = [];
  const add = (P) => { pieces.push(P); return P; };
  const segT = hi ? 32 : 16, segL = hi ? 18 : 10;
  const TH = hi ? TORSO_H_HI : TORSO_H_LO;
  const tts = TH.map((h) => h / TORSO_LEN);
  const out3 = [0, 0, 0];
  // ---------------------------------------------------------- torso
  {
    const P = add(new Piece({ region: REG.TORSO, bone: BONE.TORSO, name: 'torso' }));
    tube(P, {
      ts: tts, segs: segT, rect: RECT.torso,
      fn: (t, a, out) => { torsoPoint(t * TORSO_LEN, a, spec, out); out[1] = t; },
    });
    weightTorso(P, spec);
  }
  // ---------------------------------------------------------- head
  const headRes = hi ? [spec.headW || 56, spec.headH || 44] : [26, 20];
  const grid = headGrid(Object.assign({}, spec.head, { female: spec.female || 0 }), headRes[0], headRes[1]);
  {
    const P = add(new Piece({ region: REG.HEAD, bone: BONE.HEAD, name: 'head' }));
    headPiece(P, grid, RECT.head);
    for (let i = 0; i < P.count; i++) {
      const y = P.p[i * 3 + 1];
      const w = 0.62 * sstep(-0.075, -0.155, y);
      setW(P, i, BONE.HEAD, BONE.TORSO, 1 - w);
    }
  }
  if (spec.eyes) {
    const e = spec.eyeOffset || [0, 0, 0];
    for (const sx of [-1, 1]) {
      const P = add(new Piece({ region: REG.EYE, bone: BONE.HEAD, name: 'eye' }));
      const ey = 0.056 + (spec.head?.eyeY || 0);
      ellipsoid(P, [sx * 0.0318 + e[0], ey + e[1], -0.0795 + e[2]], [0.0118, 0.0118, 0.0118], 14, 12, RECT.eye);
    }
  }
  // ---------------------------------------------------------- limbs (right side, mirrored)
  const armBulkR = (spec.armBulkR ?? spec.armBulk ?? 1) * (1 - (spec.female || 0) * 0.14);
  const armBulkL = (spec.armBulkL ?? spec.armBulk ?? 1) * (1 - (spec.female || 0) * 0.14);
  const legBulk = (spec.legBulk ?? 1) * (1 + (spec.female || 0) * 0.04) + (spec.fat || 0) * 0.15;
  const armFat = 1 + (spec.fat || 0) * 0.18;
  const thin = 1 - (spec.thin || 0) * 0.15;
  const uarmTs = hi ? [-0.2, -0.16, -0.12, -0.07, -0.02, 0.04, 0.1, 0.18, 0.28, 0.4, 0.52, 0.64, 0.76, 0.86, 0.94, 1.0, 1.05, 1.09, 1.12] : [-0.2, -0.16, -0.08, 0.02, 0.15, 0.35, 0.55, 0.75, 0.92, 1.04, 1.12];
  const farmTs = hi ? [-0.15, -0.12, -0.08, -0.03, 0.02, 0.08, 0.15, 0.24, 0.34, 0.46, 0.58, 0.7, 0.8, 0.88, 0.95, 1.0, 1.04] : [-0.15, -0.12, -0.04, 0.06, 0.2, 0.4, 0.6, 0.8, 0.94, 1.04];
  const thighTs = hi ? [-0.24, -0.2, -0.16, -0.11, -0.06, 0.0, 0.07, 0.15, 0.25, 0.36, 0.48, 0.6, 0.71, 0.8, 0.88, 0.94, 1.0, 1.05, 1.1, 1.15] : [-0.24, -0.2, -0.12, -0.03, 0.1, 0.3, 0.5, 0.7, 0.86, 0.97, 1.07, 1.15];
  const shinTs = hi ? [-0.13, -0.1, -0.06, -0.02, 0.03, 0.09, 0.16, 0.24, 0.32, 0.41, 0.5, 0.6, 0.7, 0.8, 0.88, 0.94, 0.98, 1.02, 1.06] : [-0.13, -0.1, -0.02, 0.1, 0.25, 0.4, 0.58, 0.76, 0.9, 1.0, 1.06];
  const sides = [['R', armBulkR], ['L', armBulkL]];
  const limbSet = (side, bulkA) => {
    const out = [];
    const mk = (o) => { const P = new Piece(o); out.push(P); return P; };
    const kA = bulkA * armFat * thin, kL = legBulk * thin;
    const ua = mk({ region: REG.UARM, bone: BONE.UARMR, name: 'uarm' });
    tube(ua, { ts: uarmTs, segs: segL, rect: RECT.uarm, aOff: Math.PI / 2, fn: (t, a, o3) => { limbPoint(UARM_KEYS, t, a, kA, kA, uarmBump(bulkA), o3); o3[1] = t; } });
    weightLimb(ua, BONE.UARMR, BONE.TORSO, BONE.FARMR, (t) => 1 - sstep(-0.1, 0.16, t), (t) => sstep(0.86, 1.14, t));
    const fa = mk({ region: REG.FARM, bone: BONE.FARMR, name: 'farm' });
    tube(fa, { ts: farmTs, segs: segL, rect: RECT.farm, aOff: Math.PI / 2, fn: (t, a, o3) => { limbPoint(FARM_KEYS, t, a, kA * 0.96 + 0.04, kA * 0.96 + 0.04, farmBump(bulkA), o3); o3[1] = t; } });
    weightLimb(fa, BONE.FARMR, BONE.UARMR, null, (t) => 1 - sstep(-0.14, 0.14, t), null);
    // hand -> forearm-local: y / forearm length
    const hd = mk({ region: REG.HAND, bone: BONE.FARMR, name: 'hand' });
    buildHand(hd, spec.hand || {}, lod);
    const hs = spec.handScale ?? (1 - (spec.female || 0) * 0.1);
    for (let i = 0; i < hd.count; i++) {
      hd.p[i * 3] *= hs * (spec.handFat ?? 1); hd.p[i * 3 + 2] *= hs;
      hd.p[i * 3 + 1] = 0.985 + hd.p[i * 3 + 1] * hs / FARM_LEN;
    }
    const th = mk({ region: REG.THIGH, bone: BONE.THIGHR, name: 'thigh' });
    tube(th, { ts: thighTs, segs: segL, rect: RECT.thigh, aOff: Math.PI / 2, fn: (t, a, o3) => { limbPoint(THIGH_KEYS, t, a, kL, kL, thighBump(1), o3); o3[1] = t; } });
    weightLimb(th, BONE.THIGHR, BONE.TORSO, BONE.SHINR, (t) => 1 - sstep(-0.16, 0.12, t), (t) => sstep(0.86, 1.14, t));
    const sh = mk({ region: REG.SHIN, bone: BONE.SHINR, name: 'shin' });
    tube(sh, { ts: shinTs, segs: segL, rect: RECT.shin, aOff: Math.PI / 2, fn: (t, a, o3) => { limbPoint(SHIN_KEYS, t, a, kL, kL, shinBump(1), o3); o3[1] = t; } });
    weightLimb(sh, BONE.SHINR, BONE.THIGHR, BONE.FOOTR, (t) => 1 - sstep(-0.13, 0.13, t), (t) => sstep(0.9, 1.08, t) * 0.6);
    const ft = mk({ region: REG.FOOT, bone: BONE.FOOTR, name: 'foot' });
    buildFoot(ft, spec.foot || {}, lod);
    for (let i = 0; i < ft.count; i++) {
      const y = ft.p[i * 3 + 1];
      const w = 0.7 * sstep(-0.015, 0.035, y);
      setW(ft, i, BONE.FOOTR, BONE.SHINR, 1 - w);
    }
    if (side === 'L') return out.map(mirrorPiece);
    return out;
  };
  for (const [side, bulkA] of sides) for (const P of limbSet(side, bulkA)) add(P);
  // ---------------------------------------------------------- layers / shells
  const ctx = { spec, lod, hi, grid, add, Piece, tube, sweep, ellipsoid, headPiece, torsoPoint, limbPoint, weightTorso, weightLimb, setW, mirrorPiece, uarmTs, farmTs, thighTs, shinTs, tts, segT, segL, armBulkR, armBulkL, legBulk, armFat, thin, UARM_KEYS, FARM_KEYS, THIGH_KEYS, SHIN_KEYS };
  for (const L of spec.layers || []) buildLayer(ctx, L);
  if (spec.accessories) buildAccessories(ctx);
  if (spec.extras) spec.extras(ctx);
  return pieces;
}

// Clothing / hair / hat layers.
//  {kind:'torso', mat, off, h0, h1, open (half-angle at front), openFn, keep, bumps, region}
//  {kind:'sleeve', mat, part:'uarm'|'farm', off, t0, t1, bulge}
//  {kind:'leg', part:'thigh'|'shin', off, t0, t1}
//  {kind:'hair', mat, thick(p,n,u,v), warp, region}
//  {kind:'collar', mat, h, height, off, open, flare}
//  {kind:'tie', mat, h0, h1, loose}
//  {kind:'beret'|'ponytail'|'band'|'hood'}
function buildLayer(C, L) {
  const { spec, hi, add } = C;
  const mat = L.mat ?? 1;
  if (L.kind === 'torso') {
    const P = add(new Piece({ region: L.region ?? REG.TORSO, bone: BONE.TORSO, mat, name: 'shell' }));
    const h0 = L.h0 ?? -0.1, h1 = L.h1 ?? 0.5;
    const hs = C.tts.map((t) => t * TORSO_LEN).filter((h) => h > h0 && h < h1);
    hs.unshift(h0); hs.push(h1);
    if (L.extendBelow) { for (let k = 1; k <= L.extendBelow.n; k++) hs.unshift(h0 - (L.extendBelow.len * k) / L.extendBelow.n); }
    const hmin = hs[0];
    tube(P, {
      ts: hs.map((h) => h / TORSO_LEN), segs: C.segT, rect: L.rect || RECT.torso, tA: -0.155 / TORSO_LEN, tB: 0.6 / TORSO_LEN,
      fn: (t, a, out) => {
        const h = t * TORSO_LEN;
        const hh = Math.max(h, L.flareFrom ?? -0.13);
        torsoPoint(hh, a, spec, out, (L.off ?? 0.012) + (L.offFn ? L.offFn(h, a) : 0));
        if (h < hh) { const k = (hh - h) / 0.3; out[0] *= 1 + k * (L.flare ?? 0.25); out[2] *= 1 + k * (L.flare ?? 0.25) * 0.8; }
        out[1] = t;
      },
      keep: (t, a) => {
        const h = t * TORSO_LEN;
        if (L.open != null && Math.abs(a) < (typeof L.open === 'function' ? L.open(h) : L.open)) return false;
        if (L.keep && !L.keep(h, a)) return false;
        return true;
      },
    });
    C.weightTorso(P, spec);
    if (L.skirtWeights) skirtWeights(P);
    P.doubleSided = true;
    return;
  }
  if (L.kind === 'sleeve' || L.kind === 'leg') {
    const part = L.part;
    const keys = { uarm: UARM_KEYS, farm: FARM_KEYS, thigh: THIGH_KEYS, shin: SHIN_KEYS }[part];
    const tsAll = { uarm: C.uarmTs, farm: C.farmTs, thigh: C.thighTs, shin: C.shinTs }[part];
    const bumpF = { uarm: uarmBump, farm: farmBump, thigh: thighBump, shin: shinBump }[part];
    const reg = { uarm: REG.UARM, farm: REG.FARM, thigh: REG.THIGH, shin: REG.SHIN }[part];
    const bone = { uarm: BONE.UARMR, farm: BONE.FARMR, thigh: BONE.THIGHR, shin: BONE.SHINR }[part];
    const t0 = L.t0 ?? tsAll[0], t1 = L.t1 ?? tsAll[tsAll.length - 1];
    const ts = tsAll.filter((t) => t > t0 && t < t1);
    ts.unshift(t0); ts.push(t1);
    if (L.hem) ts.push(t1 + 0.001); // folded-in hem ring
    for (const side of ['R', 'L']) {
      const bulk = part === 'uarm' || part === 'farm' ? (side === 'R' ? C.armBulkR : C.armBulkL) * C.armFat * C.thin : C.legBulk * C.thin;
      const k = part === 'farm' ? bulk * 0.96 + 0.04 : bulk;
      const P = new Piece({ region: reg, bone, mat, name: 'sleeve' });
      const tA = { uarm: C.uarmTs, farm: C.farmTs, thigh: C.thighTs, shin: C.shinTs }[part][0];
      const tB = tsAll[tsAll.length - 1];
      tube(P, {
        ts, segs: C.segL, rect: L.rect || RECT[part], aOff: Math.PI / 2, tA, tB, keep: L.keep,
        fn: (t, a, out) => {
          const tt = Math.min(t, t1);
          const taper = part === 'uarm' && (L.t0 ?? -1) < -0.05 ? sstep(-0.17, -0.02, tt) : 1;
          limbPoint(keys, tt, a, k, k, bumpF(part === 'shin' || part === 'thigh' ? 1 : bulk), out, ((L.off ?? 0.01) + (L.bulge ? L.bulge(tt, a) : 0)) * taper - (t > t1 ? (L.off ?? 0.01) * 0.9 : 0));
          out[1] = tt;
        },
      });
      if (part === 'uarm') weightLimb(P, BONE.UARMR, BONE.TORSO, BONE.FARMR, (t) => 1 - sstep(-0.1, 0.16, t), (t) => sstep(0.86, 1.14, t));
      else if (part === 'farm') weightLimb(P, BONE.FARMR, BONE.UARMR, null, (t) => 1 - sstep(-0.14, 0.14, t), null);
      else if (part === 'thigh') weightLimb(P, BONE.THIGHR, BONE.TORSO, BONE.SHINR, (t) => 1 - sstep(-0.16, 0.12, t), (t) => sstep(0.86, 1.14, t));
      else weightLimb(P, BONE.SHINR, BONE.THIGHR, BONE.FOOTR, (t) => 1 - sstep(-0.13, 0.13, t), (t) => sstep(0.9, 1.08, t) * 0.6);
      P.doubleSided = !!L.doubleSided;
      add(side === 'L' ? mirrorPiece(P) : P);
    }
    return;
  }
  if (L.kind === 'hair' || L.kind === 'hood') {
    const P = add(new Piece({ region: L.region ?? REG.HAIR, bone: BONE.HEAD, mat, name: L.kind }));
    headPiece(P, C.grid, L.rect || RECT.head, { thick: L.thick, warp: L.warp, minOff: L.minOff, strict: L.strict });
    for (let i = 0; i < P.count; i++) {
      const y = P.p[i * 3 + 1];
      const w = (L.neckFollow ?? 0.6) * sstep(-0.06, -0.15, y);
      C.setW(P, i, BONE.HEAD, BONE.TORSO, 1 - w);
    }
    P.doubleSided = L.kind === 'hood' || !!L.doubleSided;
    return;
  }
  if (L.kind === 'collar') {
    const P = add(new Piece({ region: L.region ?? REG.TORSO, bone: BONE.TORSO, mat, name: 'collar' }));
    const h0 = L.h ?? 0.49, hh = L.height ?? 0.045;
    const n = hi ? 5 : 3;
    const ts = []; for (let i = 0; i <= n; i++) ts.push((h0 + hh * i / n) / TORSO_LEN);
    tube(P, {
      ts, segs: C.segT, rect: L.rect || RECT.collar,
      fn: (t, a, out) => {
        const h = t * TORSO_LEN, k = (h - h0) / hh;
        torsoPoint(Math.min(h, 0.53), a, spec, out, (L.off ?? 0.01) + (L.flare ?? 0.012) * k * k + (L.roll ?? 0) * Math.sin(k * Math.PI));
        out[1] = t - (L.drop ?? 0) * k * gauss(a, 0.9) / TORSO_LEN;
      },
      keep: (t, a) => Math.abs(a) > (L.open ?? 0.22),
    });
    C.weightTorso(P, spec);
    P.doubleSided = true;
    return;
  }
  if (L.kind === 'tie') {
    const P = add(new Piece({ region: L.region ?? REG.TORSO, bone: BONE.TORSO, mat, name: 'tie' }));
    const h0 = L.h0 ?? 0.47, h1 = L.h1 ?? 0.13;
    const pts = [], rad = [];
    const n = hi ? 10 : 5;
    for (let i = 0; i <= n; i++) {
      const k = i / n, h = lerp(h0, h1, k);
      torsoPoint(h, 0, spec, C.out3 || (C.out3 = [0, 0, 0]), 0);
      const z = C.out3[2] - 0.006 - (L.loose ? 0.008 * Math.sin(k * Math.PI) : 0) - (i === 0 ? 0.004 : 0);
      pts.push([(L.loose ? 0.01 * Math.sin(k * 2.5) : 0), h / TORSO_LEN, z]);
      const w = i === 0 ? 0.016 : lerp(0.017, 0.042, k) * (k > 0.93 ? 0.5 : 1);
      rad.push([w, 0.0035]);
    }
    // sweep along a path in torso-local where y is normalised: convert to metric, sweep, convert back
    const ptsM = pts.map((p) => [p[0], p[1] * TORSO_LEN, p[2]]);
    const Q = new Piece({ region: P.region, bone: BONE.TORSO, mat });
    sweep(Q, ptsM, rad, hi ? 8 : 4, L.rect || RECT.tie, { up: [1, 0, 0], capEnd: true });
    // knot
    ellipsoid(Q, [ptsM[0][0], ptsM[0][1] + 0.004, ptsM[0][2] - 0.004], [0.017, 0.02, 0.012], hi ? 8 : 5, hi ? 6 : 4, L.rect || RECT.tie);
    for (let i = 0; i < Q.count; i++) Q.p[i * 3 + 1] /= TORSO_LEN;
    Object.assign(P, { p: Q.p, uv: Q.uv, loc: Q.loc, idx: Q.idx, b0: Q.b0, b1: Q.b1, w: Q.w });
    C.weightTorso(P, spec);
    return;
  }
  if (L.custom) { L.custom(C, L); }
}

// Skirt / coat tails: blend lower rows towards the thigh on the same side.
function skirtWeights(P) {
  for (let i = 0; i < P.count; i++) {
    const x = P.p[i * 3], h = P.p[i * 3 + 1] * TORSO_LEN;
    const wl = 0.72 * sstep(-0.02, -0.4, h) * sstep(0.015, 0.11, Math.abs(x));
    if (wl > 0.001) setW(P, i, BONE.TORSO, x < 0 ? BONE.THIGHL : BONE.THIGHR, 1 - wl);
  }
}

// ---------------------------------------------------- crowd accessories --
function buildAccessories(C) {
  const { spec, add } = C;
  const R = (k) => RECT['acc' + k];
  const tmp = [0, 0, 0];
  // 0 hood (down, bunched behind the neck)
  {
    const P = add(new Piece({ region: REG.ACC + ACC.HOOD, bone: BONE.TORSO, name: 'hood' }));
    const pts = [], rad = [];
    for (let i = 0; i <= 10; i++) {
      const a = lerp(-1.25, 1.25, i / 10) + Math.PI;
      const h = 0.49 - 0.035 * Math.cos((i / 10 - 0.5) * Math.PI) ;
      torsoPoint(h, a, spec, tmp, 0.016);
      pts.push([tmp[0], h, tmp[2]]);
      const k = Math.sin((i / 10) * Math.PI);
      rad.push([0.012 + 0.03 * k, 0.012 + 0.022 * k]);
    }
    sweep(P, pts, rad, 8, R(0), { up: [0, 1, 0], capStart: true, capEnd: true });
    for (let i = 0; i < P.count; i++) P.p[i * 3 + 1] /= TORSO_LEN;
    C.weightTorso(P, spec);
  }
  // 1 skirt / dress (waist to knee, A-line)
  {
    const P = add(new Piece({ region: REG.ACC + ACC.SKIRT, bone: BONE.TORSO, name: 'skirt' }));
    const hs = [0.14, 0.08, 0.02, -0.05, -0.13, -0.22, -0.31, -0.4, -0.47];
    tube(P, {
      ts: hs.map((h) => h / TORSO_LEN), segs: 16, rect: R(1), tA: 0.14 / TORSO_LEN, tB: -0.47 / TORSO_LEN, flip: true,
      fn: (t, a, out) => {
        const h = t * TORSO_LEN;
        const hh = Math.max(h, -0.06);
        torsoPoint(hh, a, spec, out, 0.012);
        const k = Math.max(0, (-0.06 - h) / 0.41);
        const fl = 1 + k * 0.42;
        out[0] *= fl; out[2] *= 1 + k * 0.3;
        out[2] += k * 0.01 * Math.cos(a * 5);
        out[1] = t;
      },
    });
    skirtWeights(P);
    P.doubleSided = true;
  }
  // 2 coat (torso shell + tails; front opening; hem length set per instance)
  {
    const P = add(new Piece({ region: REG.ACC + ACC.COAT, bone: BONE.TORSO, name: 'coat' }));
    const hs = [0.5, 0.47, 0.44, 0.41, 0.37, 0.32, 0.26, 0.19, 0.12, 0.05, -0.02, -0.08, -0.16, -0.25, -0.34, -0.43, -0.52];
    tube(P, {
      ts: hs.map((h) => h / TORSO_LEN), segs: 18, rect: R(2), tA: 0.5 / TORSO_LEN, tB: -0.52 / TORSO_LEN, flip: true,
      fn: (t, a, out) => {
        const h = t * TORSO_LEN;
        const hh = Math.max(h, -0.1);
        torsoPoint(hh, a, spec, out, 0.017 + 0.004 * gauss(h - 0.46, 0.03) + 0.006 * (spec.fat || 0));
        const k = Math.max(0, (-0.1 - h) / 0.42);
        out[0] *= 1 + k * 0.3; out[2] *= 1 + k * 0.22;
        out[1] = t;
      },
      keep: (t, a) => {
        const h = t * TORSO_LEN;
        const open = h > 0.2 ? 0.08 + (h - 0.2) * 1.9 : h > 0.02 ? 0.06 : 0.1 + (0.02 - h) * 0.4;
        return Math.abs(a) > open;
      },
    });
    C.weightTorso(P, spec);
    skirtWeights(P);
    P.doubleSided = true;
  }
  // 3 cap (baseball / work cap)
  {
    const P = add(new Piece({ region: REG.ACC + ACC.CAP, bone: BONE.HEAD, name: 'cap' }));
    ellipsoid(P, [0, 0.083, 0.012], [0.081, 0.083, 0.102], 14, 6, [R(3)[0], R(3)[1], R(3)[2], R(3)[3] * 0.7], { v0: 0.48, v1: 1 });
    // brim
    const b0 = P.count;
    const bw = 8;
    const r3 = R(3);
    for (let j = 0; j <= 2; j++) {
      for (let i = 0; i <= bw; i++) {
        const u = i / bw, a = (u - 0.5) * 2.2;
        const rIn = 0.098, rOut = 0.098 + 0.072 * Math.cos((u - 0.5) * 1.6);
        const r = lerp(rIn, rOut, j / 2);
        P.vert(Math.sin(a) * r * 0.86, 0.083 - 0.012 * (j / 2) - 0.004 * Math.abs(Math.sin(a)), -Math.cos(a) * r + 0.004, r3[0] + u * r3[2], r3[1] + r3[3] * (0.75 + 0.25 * j / 2), u, 2 + j / 2);
      }
    }
    for (let j = 0; j < 2; j++) for (let i = 0; i < bw; i++) { const A = b0 + j * (bw + 1) + i, B = A + 1, Cc = A + bw + 1, D = Cc + 1; P.idx.push(A, B, Cc, B, D, Cc); }
    P.doubleSided = true;
  }
  // 4 peaked uniform cap (police / pilot / security)
  {
    const P = add(new Piece({ region: REG.ACC + ACC.PCAP, bone: BONE.HEAD, name: 'pcap' }));
    const r4 = R(4);
    const hs = [0.075, 0.1, 0.125, 0.15, 0.162, 0.166];
    tube(P, {
      ts: hs, segs: 16, rect: r4, tA: 0.075, tB: 0.166,
      fn: (y, a, out) => {
        const k = (y - 0.075) / 0.09;
        const rx = lerp(0.081, 0.1, sstep(0.35, 0.8, k)) * (y >= 0.165 ? 0.2 : 1), rz = lerp(0.1, 0.118, sstep(0.35, 0.8, k)) * (y >= 0.165 ? 0.2 : 1);
        out[0] = Math.sin(a) * rx; out[1] = y + (-Math.cos(a)) * 0.012 * sstep(0.4, 1, k); out[2] = -Math.cos(a) * rz + 0.012;
      },
    });
    // visor
    const b0 = P.count;
    for (let j = 0; j <= 1; j++) for (let i = 0; i <= 8; i++) {
      const u = i / 8, a = (u - 0.5) * 2.0;
      const r = lerp(0.097, 0.097 + 0.05 * Math.cos((u - 0.5) * 1.5), j);
      P.vert(Math.sin(a) * r * 0.85, 0.08 - 0.02 * j, -Math.cos(a) * r + 0.01, r4[0] + u * r4[2], r4[1], u, 2 + j);
    }
    for (let i = 0; i < 8; i++) { const A = b0 + i, B = A + 1, Cc = A + 9, D = Cc + 1; P.idx.push(A, B, Cc, B, D, Cc); }
    P.doubleSided = true;
  }
  // 5 hard hat
  {
    const P = add(new Piece({ region: REG.ACC + ACC.HARDHAT, bone: BONE.HEAD, name: 'hardhat' }));
    const r5 = R(5);
    ellipsoid(P, [0, 0.07, 0.006], [0.093, 0.1, 0.113], 14, 7, r5, {
      v0: 0.46, v1: 1,
      shape: (x, y, z) => 1 + 0.05 * Math.exp(-(x * x) / 0.01) * (y > 0.3 ? 1 : 0),
    });
    const b0 = P.count;
    for (let j = 0; j <= 1; j++) for (let i = 0; i <= 16; i++) {
      const u = i / 16, a = (u - 0.5) * TAU;
      const peak = Math.max(0, -Math.cos(a)) * 0.03;
      const r = j === 0 ? 1 : 1.14 + peak * 4;
      P.vert(Math.sin(a) * 0.093 * r, 0.07 - 0.01 * j - peak * 0.3 * j, -Math.cos(a) * 0.113 * r + 0.006, r5[0] + u * r5[2], r5[1], u, 2 + j);
    }
    for (let i = 0; i < 16; i++) { const A = b0 + i, B = A + 1, Cc = A + 17, D = Cc + 1; P.idx.push(A, B, Cc, B, D, Cc); }
    P.doubleSided = true;
  }
  // 6 tie
  buildLayer(C, { kind: 'tie', mat: 0, region: REG.ACC + ACC.TIE, rect: R(6), h0: 0.475, h1: 0.14 });
  // 7 long hair: scalp shell + drape down the back
  {
    const P = add(new Piece({ region: REG.ACC + ACC.LONGHAIR, bone: BONE.HEAD, name: 'longhair' }));
    const r7 = R(7);
    headPiece(P, C.grid, [r7[0], r7[1] + r7[3] * 0.4, r7[2], r7[3] * 0.6], {
      thick: (p, n, u, v) => {
        const back = -p[2];
        const line = 0.085 - 0.07 * sstep(0.0, 0.07, p[2] + 0.02) - 0.02 * sstep(0.03, 0.07, Math.abs(p[0]));
        return p[1] > line - 0.02 ? 0.006 + 0.008 * sstep(line - 0.02, line + 0.03, p[1]) : -1;
      },
      warp: (p, n, u, v, t) => { if (p[2] > 0.02 && p[1] < 0.07) { p[2] += 0.006; } },
    });
    for (let i = 0; i < P.count; i++) C.setW(P, i, BONE.HEAD, BONE.HEAD, 1);
    // drape
    const Q = new Piece({ region: P.region, bone: BONE.HEAD });
    const pts = [[0, 0.1, 0.07], [0, 0.03, 0.105], [0, -0.05, 0.1], [0, -0.13, 0.085], [0, -0.2, 0.075]];
    const rad = [[0.075, 0.05], [0.083, 0.04], [0.085, 0.032], [0.08, 0.024], [0.07, 0.014]];
    sweep(Q, pts, rad, 12, [r7[0], r7[1], r7[2], r7[3] * 0.4], { up: [1, 0, 0], capEnd: true });
    const base = P.count;
    for (let i = 0; i < Q.count; i++) {
      P.vert(Q.p[i * 3], Q.p[i * 3 + 1], Q.p[i * 3 + 2], Q.uv[i * 2], Q.uv[i * 2 + 1], Q.loc[i * 2], -Q.loc[i * 2 + 1]);
      const y = Q.p[i * 3 + 1];
      const w = 0.7 * sstep(-0.05, -0.18, y);
      C.setW(P, P.count - 1, BONE.HEAD, BONE.TORSO, 1 - w);
    }
    for (const k of Q.idx) P.idx.push(k + base);
  }
  // 8 backpack
  {
    const P = add(new Piece({ region: REG.ACC + ACC.BACKPACK, bone: BONE.TORSO, name: 'backpack' }));
    torsoPoint(0.26, Math.PI, spec, tmp, 0);
    const zc = tmp[2] + 0.075;
    ellipsoid(P, [0, 0.26 / TORSO_LEN, zc], [0.13, 0.19 / TORSO_LEN, 0.075], 12, 8, R(8), {
      shape: (x, y, z) => { const k = Math.pow(Math.abs(x) ** 4 + Math.abs(y) ** 4 + Math.abs(z) ** 4, -0.25); return lerp(1, k, 0.7); },
    });
    for (let i = 0; i < P.count; i++) {
      // flatten the side facing the back
      if (P.p[i * 3 + 2] < zc) P.p[i * 3 + 2] = zc - (zc - P.p[i * 3 + 2]) * 0.55;
    }
    C.weightTorso(P, spec);
  }
  // 9 ear defenders
  {
    const P = add(new Piece({ region: REG.ACC + ACC.EARMUFF, bone: BONE.HEAD, name: 'earmuff' }));
    const r9 = R(9);
    for (const sx of [-1, 1]) ellipsoid(P, [sx * 0.086, 0.046, 0.012], [0.02, 0.036, 0.03], 8, 6, r9);
    const pts = [], rad = [];
    for (let i = 0; i <= 10; i++) { const a = lerp(-1.35, 1.35, i / 10); pts.push([Math.sin(a) * 0.095, 0.075 + Math.cos(a) * 0.1, 0.012]); rad.push([0.007, 0.012]); }
    sweep(P, pts, rad, 6, r9, { up: [0, 0, 1] });
  }
}

// ------------------------------------------------------------ geometry --
// Merge pieces into a BufferGeometry in the rest pose.
//   opts.skinned: add skinIndex / skinWeight (THREE.SkinnedMesh)
//   opts.crowd: add aSkin (b0, b1, w0, region) + aLocal + morph deltas
export function buildBody(spec, opts = {}) {
  const bind = bindMatrices();
  const pieces = buildPieces(spec);
  const finalize = (list) => {
    for (const P of list) {
      if (P.frame === BONE.HEAD && (spec.headScale || spec.headDrop)) {
        const k = spec.headScale ?? 1, dy = spec.headDrop ?? 0;
        for (let i = 0; i < P.p.length; i += 3) { P.p[i] *= k; P.p[i + 1] = -0.12 + (P.p[i + 1] + 0.12) * k - dy; P.p[i + 2] = 0.02 + (P.p[i + 2] - 0.02) * k; }
      }
      applyMat(P, bind.mats[P.frame]);
      if (!P.n) computeNormals(P);
      if (P.doubleSided && opts.thicken !== false) thicken(P, P.thickness ?? 0.0018);
    }
  };
  finalize(pieces);
  let morphs = null;
  if (opts.morphs) {
    morphs = {};
    for (const [name, delta] of Object.entries(opts.morphs)) {
      const alt = buildPieces(Object.assign({}, spec, delta, { head: Object.assign({}, spec.head, delta.head) }));
      finalize(alt);
      morphs[name] = alt;
    }
  }
  // order by material so groups are contiguous
  const order = pieces.map((P, i) => i).sort((a, b) => pieces[a].mat - pieces[b].mat || a - b);
  let vc = 0, ic = 0;
  for (const P of pieces) { vc += P.count; ic += P.idx.length; }
  const pos = new Float32Array(vc * 3), nor = new Float32Array(vc * 3), uv = new Float32Array(vc * 2), loc = new Float32Array(vc * 2);
  const sk = new Float32Array(vc * 4);
  const idx = vc > 65535 ? new Uint32Array(ic) : new Uint16Array(ic);
  const mdel = morphs ? Object.fromEntries(Object.keys(morphs).map((k) => [k, new Float32Array(vc * 3)])) : null;
  const groups = [];
  let vo = 0, io = 0;
  const flags = new Float32Array(vc); // 1 = double sided piece (for materials that care)
  for (const pi of order) {
    const P = pieces[pi];
    const n = P.count;
    pos.set(P.p, vo * 3); nor.set(P.n, vo * 3); uv.set(P.uv, vo * 2); loc.set(P.loc, vo * 2);
    for (let i = 0; i < n; i++) {
      sk[(vo + i) * 4] = P.b0[i]; sk[(vo + i) * 4 + 1] = P.b1[i]; sk[(vo + i) * 4 + 2] = P.w[i]; sk[(vo + i) * 4 + 3] = P.region;
      flags[vo + i] = P.doubleSided ? 1 : 0;
    }
    if (mdel) {
      for (const k in morphs) {
        const Q = morphs[k][pi];
        const d = mdel[k];
        if (!Q || Q.count !== n) continue;
        for (let i = 0; i < n * 3; i++) d[vo * 3 + i] = Q.p[i] - P.p[i];
      }
    }
    const g = groups[groups.length - 1];
    if (!g || g.mat !== P.mat) groups.push({ start: io, count: 0, mat: P.mat });
    for (let i = 0; i < P.idx.length; i++) idx[io + i] = P.idx[i] + vo;
    groups[groups.length - 1].count += P.idx.length;
    vo += n; io += P.idx.length;
  }
  const geo = new THREE.BufferGeometry();
  geo.setAttribute('position', new THREE.BufferAttribute(pos, 3));
  geo.setAttribute('normal', new THREE.BufferAttribute(nor, 3));
  geo.setAttribute('uv', new THREE.BufferAttribute(uv, 2));
  geo.setIndex(new THREE.BufferAttribute(idx, 1));
  if (opts.crowd) {
    geo.setAttribute('aSkin', new THREE.BufferAttribute(sk, 4));
    geo.setAttribute('aLocal', new THREE.BufferAttribute(loc, 2));
    if (mdel) for (const k in mdel) geo.setAttribute('aMorph' + k, new THREE.BufferAttribute(mdel[k], 3));
  }
  if (opts.skinned) {
    const si = new Uint16Array(vc * 4), sw = new Float32Array(vc * 4);
    for (let i = 0; i < vc; i++) {
      si[i * 4] = sk[i * 4]; si[i * 4 + 1] = sk[i * 4 + 1];
      sw[i * 4] = sk[i * 4 + 2]; sw[i * 4 + 1] = 1 - sk[i * 4 + 2];
    }
    geo.setAttribute('skinIndex', new THREE.Uint16BufferAttribute(si, 4));
    geo.setAttribute('skinWeight', new THREE.BufferAttribute(sw, 4));
    geo.setAttribute('aSkin', new THREE.BufferAttribute(sk, 4));
    geo.setAttribute('aLocal', new THREE.BufferAttribute(loc, 2));
  }
  for (const g of groups) geo.addGroup(g.start, g.count, g.mat);
  geo.computeBoundingSphere();
  geo.userData.grid = spec.lod === 'crowd' ? null : null;
  return { geometry: geo, bind, groups };
}

// Plain (unskinned) BufferGeometry from pieces authored in one local frame
// (viewmodel arms). Open surfaces flagged doubleSided get a back face.
export function pieceGeometry(pieces) {
  let vc = 0, ic = 0;
  for (const P of pieces) {
    if (!P.n) computeNormals(P);
    if (P.doubleSided && !P._thick) { thicken(P, P.thickness ?? 0.0015); P._thick = true; }
    vc += P.count; ic += P.idx.length;
  }
  const pos = new Float32Array(vc * 3), nor = new Float32Array(vc * 3), uv = new Float32Array(vc * 2), idx = new Uint32Array(ic);
  let vo = 0, io = 0;
  for (const P of pieces) {
    pos.set(P.p, vo * 3); nor.set(P.n, vo * 3); uv.set(P.uv, vo * 2);
    for (let i = 0; i < P.idx.length; i++) idx[io + i] = P.idx[i] + vo;
    vo += P.count; io += P.idx.length;
  }
  const g = new THREE.BufferGeometry();
  g.setAttribute('position', new THREE.BufferAttribute(pos, 3));
  g.setAttribute('normal', new THREE.BufferAttribute(nor, 3));
  g.setAttribute('uv', new THREE.BufferAttribute(uv, 2));
  g.setIndex(new THREE.BufferAttribute(idx, 1));
  g.computeBoundingSphere();
  return g;
}
export { farmBump };

export { Piece, tube, sweep, ellipsoid, headPiece, torsoPoint, limbPoint, buildHand, computeNormals, applyMat, mirrorPiece, UARM_KEYS, FARM_KEYS, THIGH_KEYS, SHIN_KEYS, catmull, sstep, gauss, hash3 };
