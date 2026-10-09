// Everything green in Vice City's public spaces: coconut palms (curved ringed
// trunks, drooping fronds, coconuts), royal palms (smooth grey trunks and a
// green crownshaft), wide shade trees, shrubs, bougainvillea, sea oats and
// mangroves - built from code with one drawn foliage atlas.
//
// Near the camera they are real models (one InstancedMesh per species, the
// closest ones casting shadows), swaying in the wind in the vertex shader.
// Further out each tree is a picture of itself (an impostor: a camera-facing
// card plus a flat top view that takes over when you look down from a
// helicopter), rendered once at load. Past FAR, nothing (the haze has them).
//
//   const F = new Flora(world, tex);
//   F.add(sp, x, y, z, scale, yaw, lean, tint) -> item   (sp: index in SPECIES; see SP)
//   F.build()                 after the last add
//   F.update(dt, camera, wind 0..1)
import * as THREE from 'three';
import { TEX_LAYER } from '../textures.js';
import { rnd, hash, TAU } from './kit.js';

export const NEAR = 360, FAR = 2700;
const CELL = 128;

// ---- the foliage atlas (1024 x 512) --------------------------------------------------
// four frond columns (128 x 512, base at the bottom), then four 256 tiles
const UV = {
  frond: [[0, 0, 0.125, 1], [0.125, 0, 0.25, 1], [0.25, 0, 0.375, 1], [0.375, 0, 0.5, 1]],
  leaves: [0.5, 0.5, 0.75, 1], shrub: [0.75, 0.5, 1, 1], flower: [0.5, 0, 0.75, 0.5], grass: [0.75, 0, 1, 0.5],
};
const FROND = {
  coco: { base: '#2c5518', mid: '#4a8424', tip: '#9fb347', rach: '#c8c070', w: 6.2, ang: 0.3, n: 58 },
  olive: { base: '#38591a', mid: '#628a2c', tip: '#b8b355', rach: '#cdbf78', w: 6.0, ang: 0.36, n: 56 },
  royal: { base: '#22471a', mid: '#3a7626', tip: '#78a23a', rach: '#a8b070', w: 4.6, ang: 0.42, n: 70 },
  dead: { base: '#5a4528', mid: '#7d6440', tip: '#a08458', rach: '#8f7a58', w: 4.0, ang: -0.35, n: 40 },
};
function drawFrond(x, X0, p, seed) {
  const W = 128, H = 512, r = rnd(seed), cx = X0 + W / 2;
  for (const side of [-1, 1]) for (let i = 0; i < p.n; i++) {
    if (p === FROND.dead && r() < 0.3) continue;
    const s = 0.035 + ((i + r() * 0.7) / p.n) * 0.95, y0 = H * (1 - s);
    const env = Math.pow(Math.sin(Math.PI * Math.min(1, 0.06 + s * 0.97)), 0.5);
    const len = (W / 2 - 3) * env * (0.86 + r() * 0.14);
    const ang = p.ang + s * 0.3 + (r() - 0.5) * 0.14, rise = Math.tan(ang) * len;
    const ex = cx + side * len, ey = y0 - rise, wb = p.w * (1 - s * 0.45) * (0.85 + r() * 0.3);
    const g = x.createLinearGradient(cx, y0, ex, ey);
    g.addColorStop(0, p.base); g.addColorStop(0.5, p.mid); g.addColorStop(1, p.tip);
    x.fillStyle = g;
    x.beginPath(); x.moveTo(cx, y0 - wb * 0.5);
    x.quadraticCurveTo(cx + side * len * 0.45, y0 - rise * 0.38 - wb * 0.8, ex, ey);
    x.quadraticCurveTo(cx + side * len * 0.5, y0 - rise * 0.5 + wb * 0.5, cx, y0 + wb * 0.5);
    x.closePath(); x.fill();
    // a lighter midrib on some
    if (r() < 0.5) { x.strokeStyle = 'rgba(220,230,150,0.25)'; x.lineWidth = 0.8; x.beginPath(); x.moveTo(cx, y0); x.quadraticCurveTo(cx + side * len * 0.45, y0 - rise * 0.42, ex, ey); x.stroke(); }
  }
  x.strokeStyle = p.rach; x.lineCap = 'round';
  for (let k = 0; k < 24; k++) { const s0 = k / 24, s1 = (k + 1) / 24; x.lineWidth = 6 * (1 - s0 * 0.8); x.beginPath(); x.moveTo(cx, H * (1 - s0) + 1); x.lineTo(cx, H * (1 - s1)); x.stroke(); }
}
function drawLeaves(x, X0, Y0, S, seed, pal, o = {}) {
  const r = rnd(seed), cx = X0 + S / 2, cy = Y0 + S / 2;
  const leaf = (px, py, s, a, col) => {
    x.save(); x.translate(px, py); x.rotate(a); x.fillStyle = col;
    x.beginPath(); x.moveTo(0, -s); x.quadraticCurveTo(s * 0.6, -s * 0.15, 0, s); x.quadraticCurveTo(-s * 0.6, -s * 0.15, 0, -s); x.fill();
    x.restore();
  };
  // twigs
  x.strokeStyle = '#4a3b26'; x.lineWidth = 2.5;
  for (let i = 0; i < 6; i++) { const a = r() * TAU; x.beginPath(); x.moveTo(cx, cy + S * 0.3); x.lineTo(cx + Math.cos(a) * S * 0.36, cy + Math.sin(a) * S * 0.3); x.stroke(); }
  const n = o.n || 900;
  for (let i = 0; i < n; i++) {
    const a = r() * TAU, d = Math.pow(r(), 0.65) * S * 0.46;
    const px = cx + Math.cos(a) * d, py = cy + Math.sin(a) * d * 0.92;
    const shadeK = 1 - d / (S * 0.5) * 0.5 + (r() - 0.5) * 0.4;
    const col = pal[Math.min(pal.length - 1, Math.max(0, Math.floor((1 - shadeK) * pal.length * 0.9 + r() * 1.5)))];
    leaf(px, py, (o.size || 7) * (0.7 + r() * 0.6), r() * TAU, col);
  }
  if (o.flowers) for (let i = 0; i < o.flowers; i++) {
    const a = r() * TAU, d = Math.pow(r(), 0.5) * S * 0.44;
    const px = cx + Math.cos(a) * d, py = cy + Math.sin(a) * d * 0.9;
    x.fillStyle = o.fpal[Math.floor(r() * o.fpal.length)];
    for (let k = 0; k < 3; k++) { x.beginPath(); x.arc(px + (r() - 0.5) * 7, py + (r() - 0.5) * 7, 2.2 + r() * 2.4, 0, TAU); x.fill(); }
  }
}
function drawGrass(x, X0, Y0, S, seed) {
  const r = rnd(seed);
  for (let i = 0; i < 70; i++) {
    const bx = X0 + 20 + r() * (S - 40), h = S * (0.45 + r() * 0.5), lean = (r() - 0.5) * 60;
    const g = x.createLinearGradient(0, Y0 + S, 0, Y0 + S - h);
    g.addColorStop(0, '#6f7a3c'); g.addColorStop(0.6, '#9fa863'); g.addColorStop(1, '#d6cf98');
    x.strokeStyle = g; x.lineWidth = 1.6 + r() * 1.6; x.lineCap = 'round';
    x.beginPath(); x.moveTo(bx, Y0 + S - 1); x.quadraticCurveTo(bx + lean * 0.3, Y0 + S - h * 0.6, bx + lean, Y0 + S - h); x.stroke();
    if (r() < 0.25) { // a sea-oat seed head
      x.fillStyle = '#c9b27a';
      for (let k = 0; k < 7; k++) { x.beginPath(); x.ellipse(bx + lean + (r() - 0.3) * 10, Y0 + S - h + k * 4 + 3, 1.8, 3.2, 0.3, 0, TAU); x.fill(); }
    }
  }
}
let _atlas = null;
export function foliageAtlas() {
  if (_atlas) return _atlas;
  const c = document.createElement('canvas'); c.width = 1024; c.height = 512;
  const x = c.getContext('2d');
  x.clearRect(0, 0, 1024, 512);
  drawFrond(x, 0, FROND.coco, 11); drawFrond(x, 128, FROND.olive, 23); drawFrond(x, 256, FROND.royal, 37); drawFrond(x, 384, FROND.dead, 41);
  const leafPal = ['#5f9a3c', '#4c8530', '#3d7026', '#2f5c1e', '#244a17'];
  drawLeaves(x, 512, 0, 256, 5, leafPal, { n: 1100, size: 7 });
  drawLeaves(x, 768, 0, 256, 7, ['#4f8a34', '#3f7428', '#33621f', '#285218', '#1f4313'], { n: 1300, size: 6 });
  drawLeaves(x, 512, 256, 256, 9, ['#4a8030', '#3a6a24', '#2e581c'], { n: 700, size: 6, flowers: 260, fpal: ['#d6247e', '#e64d9c', '#b8178f', '#f06aa8'] });
  drawGrass(x, 768, 256, 256, 13);
  const t = new THREE.CanvasTexture(c);
  t.colorSpace = THREE.SRGBColorSpace; t.anisotropy = 4;
  t.wrapS = t.wrapT = THREE.ClampToEdgeWrapping;
  _atlas = t;
  return t;
}

// ---- geometry -------------------------------------------------------------------------
// attributes: position, normal, uv, color, kind (0 palm bark, 1 foliage, 2 plain colour, 3 smooth bark), flex (0..1 how much it flutters)
class FG {
  constructor() { this.p = []; this.n = []; this.uv = []; this.c = []; this.k = []; this.f = []; this.idx = []; }
  get count() { return this.p.length / 3; }
  v(x, y, z, nx, ny, nz, u, v, col, kind, flex) { this.p.push(x, y, z); this.n.push(nx, ny, nz); this.uv.push(u, v); this.c.push(col[0], col[1], col[2]); this.k.push(kind); this.f.push(flex); return this.count - 1; }
  t(a, b, c) { this.idx.push(a, b, c); }
  build() {
    const g = new THREE.BufferGeometry();
    g.setAttribute('position', new THREE.Float32BufferAttribute(this.p, 3));
    g.setAttribute('normal', new THREE.Float32BufferAttribute(this.n, 3));
    g.setAttribute('uv', new THREE.Float32BufferAttribute(this.uv, 2));
    g.setAttribute('color', new THREE.Float32BufferAttribute(this.c, 3));
    g.setAttribute('kind', new THREE.Float32BufferAttribute(this.k, 1));
    g.setAttribute('flex', new THREE.Float32BufferAttribute(this.f, 1));
    g.setIndex(this.idx);
    g.computeBoundingBox(); g.computeBoundingSphere();
    return g;
  }
}
const V3 = (x, y, z) => new THREE.Vector3(x, y, z);
const UP = V3(0, 1, 0);

/** A ring-built tube along points c[i] with radii rad[i] (and per-ring colour), bark kind. */
function tube(G, cs, rads, seg, kind, col, vScale = 7, uRep = 2) {
  let arc = 0;
  const base = G.count;
  for (let i = 0; i < cs.length; i++) {
    if (i) arc += cs[i].distanceTo(cs[i - 1]);
    const d = (i < cs.length - 1 ? cs[i + 1].clone().sub(cs[i]) : cs[i].clone().sub(cs[i - 1])).normalize();
    const ax = Math.abs(d.x) > 0.9 ? V3(0, 0, 1) : V3(1, 0, 0);
    const az = new THREE.Vector3().crossVectors(ax, d).normalize(); ax.crossVectors(d, az).normalize();
    const cc = Array.isArray(col[0]) ? col[i] : col;
    for (let j = 0; j <= seg; j++) {
      const a = (j / seg) * TAU, nx = ax.x * Math.cos(a) + az.x * Math.sin(a), ny = ax.y * Math.cos(a) + az.y * Math.sin(a), nz = ax.z * Math.cos(a) + az.z * Math.sin(a);
      G.v(cs[i].x + nx * rads[i], cs[i].y + ny * rads[i], cs[i].z + nz * rads[i], nx, ny, nz, (j / seg) * uRep, arc / vScale, cc, kind, 0);
    }
  }
  for (let i = 0; i < cs.length - 1; i++) for (let j = 0; j < seg; j++) {
    const a = base + i * (seg + 1) + j, b = a + 1, c = a + seg + 1, d = c + 1;
    G.t(a, c, b); G.t(b, c, d);
  }
}
function sphereG(G, cx, cy, cz, r, col, kind = 2) {
  const g = new THREE.IcosahedronGeometry(r, 0), p = g.attributes.position;
  const base = G.count;
  for (let i = 0; i < p.count; i++) { const x = p.getX(i), y = p.getY(i), z = p.getZ(i), l = Math.hypot(x, y, z); G.v(cx + x, cy + y, cz + z, x / l, y / l, z / l, 0, 0, col, kind, 0); }
  for (let i = 0; i < p.count; i += 3) G.t(base + i, base + i + 1, base + i + 2);
}
/** One frond: a folded strip along a drooping arc. */
function frond(G, base, az, elev, L, droop, fold, uv, col, segs = 7) {
  const h = V3(Math.cos(az), 0, Math.sin(az)), dir = h.clone().multiplyScalar(Math.cos(elev)).addScaledVector(UP, Math.sin(elev));
  const ids = [];
  for (let k = 0; k <= segs; k++) {
    const s = k / segs;
    const p = base.clone().addScaledVector(dir, s * L).addScaledVector(UP, -droop * L * s * s);
    const tan = dir.clone().multiplyScalar(L).addScaledVector(UP, -2 * droop * L * s).normalize();
    const side = new THREE.Vector3().crossVectors(tan, UP); if (side.lengthSq() < 1e-4) side.copy(V3(-h.z, 0, h.x)); side.normalize();
    const up = new THREE.Vector3().crossVectors(side, tan).normalize();
    const hw = 3.7 * (0.35 + 0.65 * Math.min(1, s * 3.5)) * (1 - 0.3 * s);
    const fa = fold + 0.3 * s, ca = Math.cos(fa) * hw, sa = Math.sin(fa) * hw;
    const n = up.clone().multiplyScalar(0.7).addScaledVector(h, 0.3).normalize();
    const v = 0.015 + s * 0.97, um = (uv[0] + uv[2]) / 2;
    const l = G.v(p.x + side.x * ca - up.x * sa, p.y + side.y * ca - up.y * sa, p.z + side.z * ca - up.z * sa, n.x, n.y, n.z, uv[0] + 0.004, v, col, 1, s);
    const c = G.v(p.x, p.y, p.z, n.x, n.y, n.z, um, v, col, 1, s);
    const r = G.v(p.x - side.x * ca - up.x * sa, p.y - side.y * ca - up.y * sa, p.z - side.z * ca - up.z * sa, n.x, n.y, n.z, uv[2] - 0.004, v, col, 1, s);
    ids.push([l, c, r]);
  }
  for (let k = 0; k < segs; k++) {
    const [l0, c0, r0] = ids[k], [l1, c1, r1] = ids[k + 1];
    G.t(c0, l0, l1); G.t(c0, l1, c1); G.t(c0, c1, r1); G.t(c0, r1, r0);
  }
}

/** A coconut palm: height H, the trunk leaning `bend` studs towards +z and curving back up. */
function coconutPalm(seed, H, bend, nF, olive = false) {
  const r = rnd(seed), G = new FG();
  const P0 = V3(0, -1.5, 0), P1 = V3(0, H * 0.4, bend * 1.15), P2 = V3(0, H, bend);
  const bez = (t) => P0.clone().multiplyScalar((1 - t) * (1 - t)).addScaledVector(P1, 2 * (1 - t) * t).addScaledVector(P2, t * t);
  const cs = [], rads = [], cols = [];
  const RINGS = 16;
  for (let i = 0; i <= RINGS; i++) {
    const t = i / RINGS;
    cs.push(bez(t));
    rads.push((0.62 + 0.55 * Math.exp(-t * 9)) * (1 - 0.1 * t) * (1 + (r() - 0.5) * 0.06));
    const k = 0.95 - 0.15 * t;
    cols.push([0.74 * k, 0.67 * k, 0.58 * k]);
  }
  tube(G, cs, rads, 8, 0, cols, 6.5, 2);
  const top = bez(1);
  // the boot of old frond stalks under the crown
  tube(G, [top.clone().add(V3(0, -2.4, 0)), top.clone().add(V3(0, -0.8, 0)), top.clone().add(V3(0, 0.8, 0)), top.clone().add(V3(0, 1.5, 0))], [0.66, 1.15, 1.0, 0.35], 8, 0, [0.48, 0.4, 0.28], 3, 3);
  // coconuts
  for (let i = 0; i < 7; i++) {
    const a = r() * TAU, d = 0.95 + r() * 0.3;
    const col = r() < 0.5 ? [0.3, 0.34, 0.08] : [0.36, 0.25, 0.1];
    sphereG(G, top.x + Math.cos(a) * d, top.y - 0.6 - r() * 1.2, top.z + Math.sin(a) * d, 0.62 + r() * 0.12, col);
  }
  // fronds: young ones up in the middle, old ones drooping below, a couple of dead ones hanging
  const fb = top.clone().add(V3(0, 1.0, 0));
  for (let f = 0; f < nF; f++) {
    const age = (f + 0.5) / nF, az = f * 2.39996 + r() * 0.4;
    const elev = 0.85 - age * 1.25 + (r() - 0.5) * 0.16;
    const L = (14 + 6 * Math.sin(Math.PI * Math.min(1, age * 1.15))) * (0.92 + r() * 0.16);
    const k = 0.85 + r() * 0.25;
    frond(G, fb, az, elev, L, 0.2 + age * 0.5, 0.3 + age * 0.3, UV.frond[olive && r() < 0.7 ? 1 : (r() < 0.25 ? 1 : 0)], [k, k, k * 0.95]);
  }
  for (let f = 0; f < 2 + (r() < 0.5 ? 1 : 0); f++) frond(G, top.clone().add(V3(0, -0.4, 0)), r() * TAU, -1.15 - r() * 0.2, 8 + r() * 3, 0.06, 0.9, UV.frond[3], [1, 1, 1], 4);
  return G.build();
}
/** A royal palm: a smooth grey column, a bright green crownshaft, a big round head of fronds. */
function royalPalm(seed, H) {
  const r = rnd(seed), G = new FG();
  const cs = [], rads = [];
  const T = H * 0.8;
  for (let i = 0; i <= 12; i++) {
    const t = i / 12;
    cs.push(V3(0, -1.5 + (T + 1.5) * t, 0));
    rads.push(1.0 + 0.42 * Math.exp(-t * 12) + 0.28 * Math.exp(-((t - 0.5) * (t - 0.5)) / 0.04) - 0.08 * t);
  }
  tube(G, cs, rads, 9, 3, [0.92, 0.9, 0.86], 9, 2);
  // crownshaft
  tube(G, [V3(0, T, 0), V3(0, T + H * 0.07, 0), V3(0, H * 0.95, 0), V3(0, H * 0.97, 0)], [1.05, 1.1, 0.9, 0.5], 9, 2, [0.16, 0.38, 0.1], 8, 2);
  const fb = V3(0, H * 0.96, 0);
  const nF = 17;
  for (let f = 0; f < nF; f++) {
    const age = (f + 0.5) / nF, az = f * 2.39996 + r() * 0.3;
    const elev = 1.0 - age * 1.15 + (r() - 0.5) * 0.12;
    const L = (19 + 5 * Math.sin(Math.PI * age)) * (0.94 + r() * 0.12);
    const k = 0.9 + r() * 0.2;
    frond(G, fb, az, elev, L, 0.32 + age * 0.45, 0.15 + age * 0.2, UV.frond[2], [k, k, k], 8);
  }
  return G.build();
}
/** A card for leaves: centre c, tangent t, up v, half width w, height h; normal away from `centre`. */
function card(G, c, t, v, w, h, centre, uv, col, back = 0, flex = 0.5) {
  const ids = [[-1, 0], [1, 0], [1, 1], [-1, 1]].map(([s, q]) => {
    const p = c.clone().addScaledVector(t, s * w).addScaledVector(v, q * h - back);
    const n = p.clone().sub(centre).normalize(); n.y = n.y * 0.6 + 0.4; n.normalize();
    return G.v(p.x, p.y, p.z, n.x, n.y, n.z, uv[0] + (s * 0.5 + 0.5) * (uv[2] - uv[0]), uv[1] + q * (uv[3] - uv[1]), col, 1, flex * (0.5 + q * 0.5));
  });
  G.t(ids[0], ids[1], ids[2]); G.t(ids[0], ids[2], ids[3]);
}
/** A wide shade tree (live oak / banyan): a short thick trunk, spreading limbs, a flat-topped crown. */
function shadeTree(seed, H) {
  const r = rnd(seed), G = new FG();
  const crownY = H * 0.55, crownR = H * 0.46;
  tube(G, [V3(0, -1, 0), V3(0.3, crownY * 0.5, 0.2), V3(0, crownY * 0.85, 0)], [1.9, 1.4, 1.1], 8, 0, [0.5, 0.46, 0.42], 6, 2);
  for (let i = 0; i < 6; i++) {
    const a = (i / 6) * TAU + r(), y = crownY * (0.55 + r() * 0.3);
    const end = V3(Math.cos(a) * crownR * 0.75, y + crownR * (0.15 + r() * 0.25), Math.sin(a) * crownR * 0.75);
    tube(G, [V3(0, y, 0), V3(Math.cos(a) * crownR * 0.35, y + crownR * 0.12, Math.sin(a) * crownR * 0.35), end], [0.75, 0.5, 0.18], 5, 0, [0.48, 0.44, 0.4], 6, 1);
  }
  const centre = V3(0, crownY + crownR * 0.3, 0);
  for (let i = 0; i < 74; i++) {
    const u = r() * 1.6 - 0.6, a = r() * TAU, s = Math.sqrt(Math.max(0, 1 - u * u)), lump = 0.72 + 0.28 * r();
    const p = V3(s * Math.cos(a) * crownR * lump, u * crownR * 0.5 * lump, s * Math.sin(a) * crownR * lump).add(centre);
    const out = p.clone().sub(centre).normalize();
    const t = V3(-out.z, 0, out.x); if (t.lengthSq() < 0.01) t.set(1, 0, 0); t.normalize();
    const v = new THREE.Vector3().crossVectors(out, t).normalize().multiplyScalar(-1);
    const sz = crownR * 0.52 * (0.8 + r() * 0.4);
    const k = 0.85 + r() * 0.3;
    card(G, p, t, v, sz * 0.55, sz, centre, UV.leaves, [k, k, k], sz * 0.5, 0.6);
  }
  return G.build();
}
/** A shrub: leaf cards heaped into a dome of radius R (tile: 'shrub' | 'flower'). */
function shrub(seed, R, tile) {
  const r = rnd(seed), G = new FG(), centre = V3(0, R * 0.45, 0);
  for (let i = 0; i < 18; i++) {
    const a = r() * TAU, u = r() * 0.9;
    const p = V3(Math.cos(a) * R * 0.6 * (1 - u * 0.5), R * (0.12 + u * 0.62), Math.sin(a) * R * 0.6 * (1 - u * 0.5));
    const out = p.clone().normalize(), t = V3(-out.z, 0, out.x).normalize();
    const k = 0.85 + r() * 0.3;
    card(G, p, t, UP, R * 0.6, R * 0.95, centre, UV[tile], [k, k, k], R * 0.45, 0.3);
  }
  return G.build();
}
/** Sea oats / beach grass: a few crossed cards. */
function tuft(seed) {
  const r = rnd(seed), G = new FG(), centre = V3(0, -3, 0);
  for (let i = 0; i < 4; i++) {
    const a = (i / 4) * Math.PI + r() * 0.4, t = V3(Math.cos(a), 0, Math.sin(a));
    const ids = [[-1, 0], [1, 0], [1, 1], [-1, 1]].map(([s, q]) => {
      const p = V3(t.x * s * 1.7 + (r() - 0.5) * 0.3, q * 3.4, t.z * s * 1.7);
      return G.v(p.x, p.y, p.z, 0, 1, 0, UV.grass[0] + (s * 0.5 + 0.5) * 0.25, UV.grass[1] + q * 0.5 - 0.004, [1, 1, 1], 1, q);
    });
    G.t(ids[0], ids[1], ids[2]); G.t(ids[0], ids[2], ids[3]);
  }
  void centre;
  return G.build();
}
/** A red mangrove clump: a low dark canopy on arching prop roots. */
function mangrove(seed) {
  const r = rnd(seed), G = new FG(), R = 7, lift = 2.6;
  for (let i = 0; i < 12; i++) {
    const a = (i / 12) * TAU + r() * 0.3, r0 = R * 0.35, r1 = R * (0.75 + r() * 0.3);
    tube(G, [V3(Math.cos(a) * r0 * 0.3, lift + 1.5, Math.sin(a) * r0 * 0.3), V3(Math.cos(a) * r0, lift + 1.2, Math.sin(a) * r0), V3(Math.cos(a) * (r0 + r1) * 0.5, lift * 0.7, Math.sin(a) * (r0 + r1) * 0.5), V3(Math.cos(a) * r1, -0.8, Math.sin(a) * r1)], [0.35, 0.3, 0.22, 0.15], 4, 0, [0.42, 0.36, 0.3], 4, 1);
  }
  const centre = V3(0, lift + R * 0.2, 0);
  for (let i = 0; i < 30; i++) {
    const a = r() * TAU, u = r();
    const p = V3(Math.cos(a) * R * 0.75 * (1 - u * 0.5), lift + 0.8 + u * R * 0.5, Math.sin(a) * R * 0.75 * (1 - u * 0.5));
    const out = p.clone().sub(centre).setY(0).normalize(), t = V3(-out.z, 0, out.x).normalize();
    const k = 0.7 + r() * 0.25;
    card(G, p, t, UP, R * 0.55, R * 0.7, centre, UV.shrub, [k * 0.9, k, k * 0.85], R * 0.3, 0.25);
  }
  return G.build();
}

// ---- the species ----------------------------------------------------------------------
// near: draw distance of the model; shadow: within this it casts shadows; trunk: collision half size; imp: has an impostor
export const SPECIES = [
  { id: 'coco1', make: () => coconutPalm(11, 42, 7, 20), near: NEAR, shadow: 190, trunk: 0.8, imp: true },
  { id: 'coco2', make: () => coconutPalm(23, 35, 13, 18, true), near: NEAR, shadow: 190, trunk: 0.8, imp: true },
  { id: 'coco3', make: () => coconutPalm(37, 48, 3, 21), near: NEAR, shadow: 190, trunk: 0.8, imp: true },
  { id: 'royal', make: () => royalPalm(41, 58), near: NEAR, shadow: 190, trunk: 1.3, imp: true },
  { id: 'tree', make: () => shadeTree(53, 30), near: 320, shadow: 170, trunk: 1.7, imp: true },
  { id: 'mangrove', make: () => mangrove(79), near: 300, shadow: 0, trunk: 0, imp: true },
  { id: 'shrub', make: () => shrub(61, 3.6, 'shrub'), near: 230, shadow: 90, trunk: 0, imp: false },
  { id: 'bougain', make: () => shrub(67, 3.2, 'flower'), near: 230, shadow: 90, trunk: 0, imp: false },
  { id: 'grass', make: () => tuft(71), near: 150, shadow: 0, trunk: 0, imp: false },
];
export const SP = Object.fromEntries(SPECIES.map((s, i) => [s.id, i]));

// ---- materials ----------------------------------------------------------------------------
const WIND_GLSL = `
#ifdef USE_INSTANCING
{
  vec3 io = instanceMatrix[3].xyz;
  float ph = io.x * 0.021 + io.z * 0.033, tt = uWind.y;
  float gust = 0.6 + 0.4 * sin(tt * 0.7 + ph) + 0.2 * sin(tt * 1.9 + ph * 2.3);
  float hh = max(position.y, 0.0);
  vec3 wd = vec3(uWind.z, 0.0, uWind.w);
  vec3 w = wd * (hh * hh * 0.00055 * uWind.x * gust);
  float fl = flex * flex;
  w += wd * fl * 1.1 * uWind.x * gust;
  w += normal * fl * sin(tt * 4.3 + ph * 7.0 + position.x * 0.35 + position.z * 0.35) * 0.45 * uWind.x;
  w.y -= fl * 0.35 * uWind.x * gust;
  mat3 im = mat3(instanceMatrix);
  transformed += transpose(im) * w / dot(im[0], im[0]);
}
#endif`;

function floraMaterial(tex, atlas, wind) {
  const mat = new THREE.MeshStandardMaterial({ map: atlas, vertexColors: true, alphaTest: 0.5, side: THREE.DoubleSide, roughness: 0.8, metalness: 0 });
  const uni = { tCol: tex.col, uWind: wind, barkL: { value: new THREE.Vector2(TEX_LAYER.palmBark, TEX_LAYER.concrete) } };
  mat.onBeforeCompile = (sh) => {
    Object.assign(sh.uniforms, uni);
    sh.vertexShader = sh.vertexShader
      .replace('#include <common>', '#include <common>\nattribute float kind; attribute float flex; varying float vKind; uniform vec4 uWind;')
      .replace('#include <begin_vertex>', '#include <begin_vertex>\nvKind = kind;' + WIND_GLSL);
    sh.fragmentShader = sh.fragmentShader
      .replace('#include <common>', '#include <common>\nprecision highp sampler2DArray;\nuniform sampler2DArray tCol; uniform vec2 barkL; varying float vKind;')
      .replace('#include <map_fragment>', `{
  vec4 texel;
  if (vKind < 0.5) texel = vec4(texture(tCol, vec3(vMapUv, barkL.x)).rgb, 1.0);
  else if (vKind > 2.5) texel = vec4(texture(tCol, vec3(vMapUv, barkL.y)).rgb * 1.25, 1.0);
  else if (vKind > 1.5) texel = vec4(1.0);
  else {
    texel = texture2D(map, vMapUv);
    // keep thin leaflets from vanishing in the smaller mip levels
    vec2 dx = dFdx(vMapUv * 1024.0), dy = dFdy(vMapUv * 1024.0);
    float lod = max(0.0, 0.5 * log2(max(dot(dx, dx), dot(dy, dy))));
    texel.a *= 1.0 + lod * 0.32;
  }
  diffuseColor *= texel;
}`)
      .replace('#include <normal_fragment_begin>', THREE.ShaderChunk.normal_fragment_begin.replace('normal *= faceDirection;', 'normal *= (vKind > 0.5 && vKind < 1.5) ? 1.0 : faceDirection;'))
      .replace('#include <roughnessmap_fragment>', 'float roughnessFactor = vKind > 1.5 && vKind < 2.5 ? 0.55 : roughness;');
  };
  mat.customProgramCacheKey = () => 'vc-flora';
  const depth = new THREE.MeshDepthMaterial({ depthPacking: THREE.RGBADepthPacking, map: atlas, alphaTest: 0.5, side: THREE.DoubleSide });
  depth.onBeforeCompile = (sh) => {
    sh.uniforms.uWind = wind;
    sh.vertexShader = sh.vertexShader
      .replace('#include <common>', '#include <common>\nattribute float kind; attribute float flex; varying float vKind; uniform vec4 uWind;')
      .replace('#include <begin_vertex>', '#include <begin_vertex>\nvKind = kind;' + WIND_GLSL);
    sh.fragmentShader = sh.fragmentShader
      .replace('#include <common>', '#include <common>\nvarying float vKind;')
      .replace('#include <alphatest_fragment>', 'if (vKind > 0.5 && vKind < 1.5 && diffuseColor.a < 0.5) discard;');
  };
  depth.customProgramCacheKey = () => 'vc-flora-depth';
  return { mat, depth };
}

// the far pictures: a card that turns to face the camera, and a top view for looking down
function farMaterial(atlas, n) {
  const mat = new THREE.MeshStandardMaterial({ map: atlas, roughness: 0.85, metalness: 0, side: THREE.DoubleSide });
  const uni = { uBox: { value: Array.from({ length: 12 }, () => new THREE.Vector4()) }, uTile: { value: new THREE.Vector4(n, NEAR - 30, NEAR, FAR) }, uCam: { value: new THREE.Vector3() } };
  mat.onBeforeCompile = (sh) => {
    Object.assign(sh.uniforms, uni);
    sh.vertexShader = sh.vertexShader
      .replace('#include <common>', `#include <common>
attribute vec4 iPos; attribute vec2 iSp;
uniform vec4 uBox[12]; uniform vec4 uTile; uniform vec3 uCam;
varying vec2 vAt; varying float vShow;`)
      .replace('#include <beginnormal_vertex>', `
vec4 bx = uBox[int(iSp.x + 0.5)];
vec3 toC = uCam - iPos.xyz; float dist = length(toC.xz);
vec3 fw = vec3(toC.x, 0.0, toC.z) / max(dist, 1e-3);
vec3 objectNormal = position.z > 0.5 ? vec3(0.0, 1.0, 0.0) : normalize(vec3(0.0, 0.75, 0.0) + fw * 0.5);`)
      .replace('#include <begin_vertex>', `
vec3 transformed;
float sc = iPos.w;
if (position.z < 0.5) {
  vec3 right = vec3(fw.z, 0.0, -fw.x);
  // the picture was taken from +x (the lean, towards +z, is on its left): mirror it to lean the right way
  float fl = sign(dot(vec2(sin(iSp.y), cos(iSp.y)), right.xz) + 1e-3);
  transformed = iPos.xyz + right * position.x * bx.x * 2.0 * sc + vec3(0.0, (position.y * bx.x * 2.0 + bx.y) * sc, 0.0);
  vAt = vec2((iSp.x - position.x * fl + 0.5) / uTile.x, 0.5 + (position.y + 0.5) * 0.5);
} else {
  float c = cos(iSp.y), s = sin(iSp.y);
  vec2 q = position.xy * bx.z * 2.0 * sc;
  transformed = iPos.xyz + vec3(q.x * c + q.y * s, bx.w * sc, -q.x * s + q.y * c);
  vAt = vec2((iSp.x + position.x + 0.5) / uTile.x, (0.5 - position.y) * 0.5);
}
float elev = (uCam.y - iPos.y - bx.w * sc) / max(length(toC), 1.0);
vShow = (position.z < 0.5 ? 1.0 - smoothstep(0.62, 0.86, elev) : smoothstep(0.42, 0.72, elev)) * smoothstep(uTile.y, uTile.z, dist) * (1.0 - smoothstep(uTile.w * 0.9, uTile.w, dist));`);
    sh.fragmentShader = sh.fragmentShader
      .replace('#include <common>', '#include <common>\nvarying vec2 vAt; varying float vShow;')
      .replace('#include <map_fragment>', `{
  vec4 texel = texture2D(map, vAt);
  vec2 dx = dFdx(vAt * 2048.0), dy = dFdy(vAt * 512.0);
  texel.a *= 1.0 + max(0.0, 0.5 * log2(max(dot(dx, dx), dot(dy, dy)))) * 0.3;
  float dith = fract(sin(dot(floor(gl_FragCoord.xy), vec2(12.9898, 78.233))) * 43758.5453);
  if (texel.a < 0.5 || dith > vShow) discard;
  diffuseColor.rgb *= texel.rgb;
}`);
  };
  mat.customProgramCacheKey = () => 'vc-flora-far';
  mat.userData.uni = uni;
  return mat;
}

// ---- the system -----------------------------------------------------------------------
const _m = new THREE.Matrix4(), _q = new THREE.Quaternion(), _e = new THREE.Euler(), _p = new THREE.Vector3(), _s = new THREE.Vector3(), _sph = new THREE.Sphere(), _fr = new THREE.Frustum(), _pm = new THREE.Matrix4();

export class Flora {
  constructor(world, tex) {
    this.world = world; this.tex = tex;
    this.items = [];
    this.wind = { value: new THREE.Vector4(0.4, 0, -0.93, 0.36) }; // strength, time, direction (the trade winds blow from the east-southeast)
    this.time = 0;
    this.at = new THREE.Vector3(1e9, 0, 0); this.farAt = new THREE.Vector3(1e9, 0, 0);
  }
  add(sp, x, y, z, s = 1, yaw = 0, lean = 0, tint = 1) {
    const it = { sp, x, y, z, s, yaw, lean, tint, i: this.items.length };
    this.items.push(it);
    return it;
  }

  build() {
    const world = this.world, n = this.items.length;
    this.atlas = foliageAtlas();
    const M = floraMaterial(this.tex, this.atlas, this.wind);
    this.mat = M.mat;
    this.geos = SPECIES.map((s) => s.make());
    this.radius = this.geos.map((g) => g.boundingSphere.radius);
    // per item: its matrix and colour, filed by cell
    this.M = new Float32Array(n * 16); this.C = new Float32Array(n * 3);
    this.cells = new Map();
    this.count = new Array(SPECIES.length).fill(0);
    for (const it of this.items) {
      _e.set(it.lean, it.yaw, 0, 'YXZ'); _q.setFromEuler(_e); _p.set(it.x, it.y, it.z); _s.setScalar(it.s);
      _m.compose(_p, _q, _s); _m.toArray(this.M, it.i * 16);
      const t = it.tint;
      this.C[it.i * 3] = t * 0.98; this.C[it.i * 3 + 1] = t; this.C[it.i * 3 + 2] = t * 0.93;
      const k = Math.floor(it.x / CELL) * 8192 + Math.floor(it.z / CELL);
      let c = this.cells.get(k); if (!c) this.cells.set(k, (c = [])); c.push(it);
      this.count[it.sp]++;
    }
    // near: two meshes per species (the closest cast shadows)
    this.near = SPECIES.map((S, i) => {
      const mk = (shadow) => {
        const cap = Math.max(1, Math.min(this.count[i], shadow ? 900 : 3000));
        const m = new THREE.InstancedMesh(this.geos[i], M.mat, cap);
        m.customDepthMaterial = M.depth;
        m.instanceMatrix.setUsage(THREE.DynamicDrawUsage);
        m.instanceColor = new THREE.InstancedBufferAttribute(new Float32Array(cap * 3).fill(1), 3);
        m.instanceColor.setUsage(THREE.DynamicDrawUsage);
        m.castShadow = shadow; m.receiveShadow = true; m.frustumCulled = false; m.count = 0; m.visible = false;
        m.name = 'flora:' + S.id + (shadow ? ':close' : '');
        world.scene.add(m);
        return { mesh: m, cap, k: 0 };
      };
      return [mk(true), mk(false)];
    });
    this.nearList = [];
    // far: impostors of the species that have them
    this.impSp = SPECIES.map((s, i) => (s.imp ? i : -1)).filter((i) => i >= 0);
    this.impIndex = new Array(SPECIES.length).fill(-1);
    this.impSp.forEach((sp, k) => { this.impIndex[sp] = k; });
    this.farMat = farMaterial(null, this.impSp.length);
    this._impostors();
    this.tex.ready?.then(() => this._impostors());
    const base = new THREE.InstancedBufferGeometry();
    // two quads: the card (z = 0) and the top view (z = 1)
    base.setAttribute('position', new THREE.Float32BufferAttribute([-0.5, -0.5, 0, 0.5, -0.5, 0, 0.5, 0.5, 0, -0.5, 0.5, 0, -0.5, -0.5, 1, 0.5, -0.5, 1, 0.5, 0.5, 1, -0.5, 0.5, 1], 3));
    base.setAttribute('uv', new THREE.Float32BufferAttribute(new Array(16).fill(0), 2));
    base.setAttribute('normal', new THREE.Float32BufferAttribute(new Array(24).fill(0), 3));
    base.setIndex([0, 1, 2, 0, 2, 3, 4, 5, 6, 4, 6, 7]);
    this.maxFar = Math.max(16, Math.min(n, 40000));
    this.iPos = new THREE.InstancedBufferAttribute(new Float32Array(this.maxFar * 4), 4); this.iPos.setUsage(THREE.DynamicDrawUsage);
    this.iSp = new THREE.InstancedBufferAttribute(new Float32Array(this.maxFar * 2), 2); this.iSp.setUsage(THREE.DynamicDrawUsage);
    base.setAttribute('iPos', this.iPos); base.setAttribute('iSp', this.iSp);
    base.instanceCount = 0;
    this.farGeo = base;
    this.far = new THREE.Mesh(base, this.farMat);
    this.far.frustumCulled = false; this.far.name = 'flora:far';
    world.scene.add(this.far);
  }

  /** Render a side view and a top view of each species with an impostor into the atlas (albedo only). */
  _impostors() {
    const renderer = this.world.renderer, S = 256, sp = this.impSp, n = sp.length;
    if (!this.impRT) {
      this.impRT = new THREE.WebGLRenderTarget(S * n, S * 2, { samples: 0, generateMipmaps: true, minFilter: THREE.LinearMipmapLinearFilter, magFilter: THREE.LinearFilter });
      this.farMat.map = this.impRT.texture; this.farMat.needsUpdate = true;
    }
    const scene = new THREE.Scene();
    scene.add(new THREE.AmbientLight(0xffffff, Math.PI));
    const cam = new THREE.OrthographicCamera(-1, 1, 1, -1, 0.1, 500);
    const prev = renderer.getRenderTarget(), prevClear = renderer.getClearColor(new THREE.Color()), prevAlpha = renderer.getClearAlpha();
    // tiles through the target's own viewport/scissor (never the canvas's)
    const rt = this.impRT, W = S * n;
    rt.scissorTest = false; rt.viewport.set(0, 0, W, S * 2); rt.scissor.set(0, 0, W, S * 2);
    renderer.setRenderTarget(rt);
    renderer.setClearColor(0x3f5a2c, 0); renderer.clear();
    const tile = (x, y) => { rt.viewport.set(x, y, S, S); rt.scissor.set(x, y, S, S); rt.scissorTest = true; renderer.setRenderTarget(rt); };
    const boxes = this.farMat.userData.uni.uBox.value;
    for (let k = 0; k < n; k++) {
      const g = this.geos[sp[k]], bb = g.boundingBox;
      const hw = Math.max(-bb.min.x, bb.max.x, -bb.min.z, bb.max.z), hh = (bb.max.y - bb.min.y) / 2;
      const half = Math.max(hw, hh) * 1.02, cy = (bb.min.y + bb.max.y) / 2;
      const m = new THREE.Mesh(g, this.mat); scene.add(m);
      // side (top row of the atlas), seen from +x so the lean (towards +z) shows
      cam.left = -half; cam.right = half; cam.top = half; cam.bottom = -half; cam.near = 0.1; cam.far = 500; cam.updateProjectionMatrix();
      cam.position.set(200, cy, 0); cam.up.set(0, 1, 0); cam.lookAt(0, cy, 0);
      tile(k * S, S);
      renderer.render(scene, cam);
      // top (bottom row)
      const ht = hw * 1.02;
      cam.left = -ht; cam.right = ht; cam.top = ht; cam.bottom = -ht; cam.updateProjectionMatrix();
      cam.position.set(0, bb.max.y + 50, 0); cam.up.set(0, 0, -1); cam.lookAt(0, 0, 0);
      tile(k * S, 0);
      renderer.render(scene, cam);
      scene.remove(m);
      boxes[k].set(half, cy, ht, bb.max.y * 0.82);
    }
    rt.scissorTest = false; rt.viewport.set(0, 0, W, S * 2); rt.scissor.set(0, 0, W, S * 2);
    renderer.setRenderTarget(prev);
    renderer.setClearColor(prevClear, prevAlpha);
  }

  update(dt, camera, windK = 0.4) {
    if (!this.near) return;
    this.time += dt;
    const w = this.wind.value; w.x = 0.2 + windK * 0.9; w.y = this.time;
    const cam = camera.position;
    if (this.at.distanceToSquared(cam) > 100) this._gather(cam);
    if (this.farAt.distanceToSquared(cam) > 1600) this._far(cam);
    this.farMat.userData.uni.uCam.value.copy(cam);
    this._near(camera);
  }

  /** The items near enough to be models. */
  _gather(cam) {
    this.at.copy(cam);
    const list = this.nearList; list.length = 0;
    const R = NEAR + 20, ci = Math.floor(cam.x / CELL), cj = Math.floor(cam.z / CELL), cr = Math.ceil(R / CELL);
    for (let i = ci - cr; i <= ci + cr; i++) for (let j = cj - cr; j <= cj + cr; j++) {
      const c = this.cells.get(i * 8192 + j); if (!c) continue;
      for (const it of c) { const dx = it.x - cam.x, dz = it.z - cam.z, r = SPECIES[it.sp].near + 20; if (dx * dx + dz * dz < r * r) list.push(it); }
    }
  }
  _far(cam) {
    this.farAt.copy(cam);
    const P = this.iPos.array, Q = this.iSp.array, ci = Math.floor(cam.x / CELL), cj = Math.floor(cam.z / CELL), cr = Math.ceil(FAR / CELL);
    let n = 0;
    const r0 = (NEAR - 40) * (NEAR - 40), r1 = FAR * FAR;
    for (let i = ci - cr; i <= ci + cr && n < this.maxFar; i++) for (let j = cj - cr; j <= cj + cr; j++) {
      const c = this.cells.get(i * 8192 + j); if (!c) continue;
      const cx = (i + 0.5) * CELL - cam.x, cz = (j + 0.5) * CELL - cam.z;
      if (cx * cx + cz * cz > (FAR + CELL) * (FAR + CELL)) continue;
      for (const it of c) {
        const k = this.impIndex[it.sp]; if (k < 0) continue;
        const dx = it.x - cam.x, dz = it.z - cam.z, d2 = dx * dx + dz * dz;
        if (d2 < r0 || d2 > r1 || n >= this.maxFar) continue;
        P[n * 4] = it.x; P[n * 4 + 1] = it.y; P[n * 4 + 2] = it.z; P[n * 4 + 3] = it.s;
        Q[n * 2] = k; Q[n * 2 + 1] = it.yaw;
        n++;
      }
    }
    this.farGeo.instanceCount = n;
    this.iPos.needsUpdate = true; this.iSp.needsUpdate = true;
    this.farCount = n;
  }
  _near(camera) {
    _pm.multiplyMatrices(camera.projectionMatrix, camera.matrixWorldInverse);
    _fr.setFromProjectionMatrix(_pm);
    const cam = camera.position;
    for (const pair of this.near) { pair[0].k = 0; pair[1].k = 0; }
    for (const it of this.nearList) {
      const S = SPECIES[it.sp], dx = it.x - cam.x, dz = it.z - cam.z, d2 = dx * dx + dz * dz;
      if (d2 > S.near * S.near) continue;
      const r = this.radius[it.sp] * it.s;
      _sph.center.set(it.x, it.y + r * 0.6, it.z); _sph.radius = r;
      if (d2 > 900 && !_fr.intersectsSphere(_sph)) continue;
      const set = this.near[it.sp][d2 < S.shadow * S.shadow ? 0 : 1];
      if (set.k >= set.cap) continue;
      set.mesh.instanceMatrix.array.set(this.M.subarray(it.i * 16, it.i * 16 + 16), set.k * 16);
      set.mesh.instanceColor.array.set(this.C.subarray(it.i * 3, it.i * 3 + 3), set.k * 3);
      set.k++;
    }
    let drawn = 0;
    for (const pair of this.near) for (const set of pair) {
      set.mesh.count = set.k; set.mesh.visible = set.k > 0; drawn += set.k;
      if (set.k) { set.mesh.instanceMatrix.needsUpdate = true; set.mesh.instanceColor.needsUpdate = true; }
    }
    this.drawn = drawn;
  }
}
void hash;
