// Shared building blocks for the weapon / item model library:
// - a tiny 128x128 greyscale+decal atlas (one texture, one material for every item)
// - ItemKit: MeshKit with material keys, auto-oriented UVs, better cylinders and z-extrusions
// - assemble(): turns a build function into an Object3D with movable child parts + userData
import * as THREE from 'three';
import { MeshKit } from '../../engine/meshkit.js';
import { createPS1Material } from '../../engine/ps1material.js';
import { mulberry32 } from '../../engine/textures.js';

// ---------------------------------------------------------------- atlas
const AW = 128, AH = 128, CELL = 32;
const LAYOUT = {
  grime: [0, 0], wood: [1, 0], metal: [2, 0], chrome: [3, 0],
  flat: [0, 1], perf: [1, 1], knurl: [2, 1], teeth: [3, 1],
  cross: [0, 2], flame: [1, 2], blast: [2, 2], bolt: [3, 2],
  label: [0, 3], stencil: [1, 3], stars: [2, 3], glass: [3, 3],
};
// regions whose pattern should run along the longest edge of each face
const ROTATING = new Set(['grime', 'wood', 'metal', 'chrome', 'flat', 'perf', 'knurl', 'teeth', 'glass']);

export const REG = {};
for (const k in LAYOUT) {
  const [cx, cy] = LAYOUT[k];
  const x0 = cx * CELL + 0.5, y0 = cy * CELL + 0.5, x1 = (cx + 1) * CELL - 0.5, y1 = (cy + 1) * CELL - 0.5;
  const r = [x0 / AW, 1 - y1 / AH, x1 / AW, 1 - y0 / AH];
  r.rot = ROTATING.has(k);
  r.key = k;
  REG[k] = r;
}

const clamp = (v) => (v < 0 ? 0 : v > 255 ? 255 : v | 0);

function paintCell(ctx, key, rnd) {
  const [cx, cy] = LAYOUT[key];
  const ox = cx * CELL, oy = cy * CELL;
  const img = ctx.createImageData(CELL, CELL);
  const d = img.data;
  const set = (x, y, r, g, b) => { const i = (y * CELL + x) * 4; d[i] = clamp(r); d[i + 1] = clamp(g); d[i + 2] = clamp(b); d[i + 3] = 255; };
  const n = (a) => (rnd() - 0.5) * a;
  const edge = (x, y) => (x === 0 || y === 0 || x === CELL - 1 || y === CELL - 1 ? 0.78 : (x === 1 || y === 1 || x === CELL - 2 || y === CELL - 2) ? 0.9 : 1);
  const blobs = []; for (let i = 0; i < 6; i++) blobs.push([rnd() * CELL, rnd() * CELL, 2 + rnd() * 5]);
  const stain = (x, y) => { let s = 1; for (const [bx, by, br] of blobs) { const q = Math.hypot(x - bx, y - by); if (q < br) s *= 0.86 + 0.14 * (q / br); } return s; };
  const rowN = []; for (let y = 0; y < CELL; y++) rowN.push(rnd() - 0.5);
  for (let y = 0; y < CELL; y++) for (let x = 0; x < CELL; x++) {
    let v;
    switch (key) {
      case 'grime': v = (222 + n(26)) * stain(x, y) * edge(x, y); set(x, y, v, v, v); break;
      case 'wood': {
        const g = Math.sin(y * 0.85 + Math.sin(x * 0.12 + y * 0.25) * 1.8);
        v = 196 + g * 30 + n(14);
        if (((y * 7 + (x >> 3)) % 11) === 0) v -= 40;
        v *= edge(x, y);
        set(x, y, v * 1.02, v, v * 0.96); break;
      }
      case 'metal': v = 206 + rowN[y] * 22 + n(12); if (y < 2) v = 245; if (y > 29) v *= 0.78; if (rnd() < 0.02) v *= 0.6; v *= stain(x, y); set(x, y, v, v, v * 1.03); break;
      case 'chrome': {
        const t = y / (CELL - 1);
        v = 150 + 105 * Math.exp(-(((t - 0.22) / 0.09) ** 2)) - 100 * Math.exp(-(((t - 0.62) / 0.13) ** 2)) + 70 * Math.exp(-(((t - 0.9) / 0.05) ** 2)) + rowN[y] * 10 + n(6);
        set(x, y, v, v, v * 1.04); break;
      }
      case 'flat': v = 242 + n(8); set(x, y, v, v, v); break;
      case 'perf': {
        v = 205 + n(14);
        const j = Math.floor(y / 6), i = Math.floor((x - (j % 2) * 3) / 6);
        const hx = 3 + i * 6 + (j % 2) * 3, hy = 3 + j * 6;
        if (Math.hypot(x - hx, y - hy) < 1.9) v = 30;
        v *= edge(x, y); set(x, y, v, v, v); break;
      }
      case 'knurl': { const a = (x + y) % 8, b = (x - y + 64) % 8; v = (a < 2 || b < 2) ? 150 + n(10) : 232 + n(14); set(x, y, v, v, v); break; }
      case 'teeth': {
        const p = x % 8;
        if (y >= 11 && y <= 20) v = (p === 2 || p === 3) && (y === 15 || y === 16) ? 230 : 95;
        else if ((y >= 3 && y < 11) || (y > 20 && y <= 28)) { const dy = y < 11 ? 11 - y : y - 20; v = p < 5 && dy <= 8 - p ? 235 : 28; }
        else v = 28;
        v += n(10); set(x, y, v, v, v); break;
      }
      case 'glass': v = 172 + 83 * Math.exp(-(((y - 8) / 2.2) ** 2)) + 34 * Math.exp(-(((y - 24) / 1.4) ** 2)) + n(6); set(x, y, v, v, v); break;
      default: set(x, y, 255, 255, 255);
    }
  }
  ctx.putImageData(img, ox, oy);
  if (ROTATING.has(key)) return;
  // ---- coloured decals (drawn with 2D primitives, then lightly noised)
  ctx.save(); ctx.translate(ox, oy); ctx.beginPath(); ctx.rect(0, 0, CELL, CELL); ctx.clip();
  const F = (c) => { ctx.fillStyle = c; };
  if (key === 'cross') {
    F('rgb(236,234,226)'); ctx.fillRect(0, 0, 32, 32);
    F('rgb(196,24,22)'); ctx.fillRect(11, 4, 10, 24); ctx.fillRect(4, 11, 24, 10);
    F('rgb(150,140,130)'); ctx.fillRect(0, 0, 32, 1); ctx.fillRect(0, 31, 32, 1); ctx.fillRect(0, 0, 1, 32); ctx.fillRect(31, 0, 1, 32);
  } else if (key === 'flame') {
    F('rgb(58,50,40)'); ctx.fillRect(0, 0, 32, 32);
    for (let x = 0; x < 32; x++) {
      const h = 12 + 9 * Math.abs(Math.sin(x * 0.42)) + 4 * Math.sin(x * 1.3);
      for (let y = 0; y < h; y++) {
        const t = y / h;
        F(t < 0.45 ? 'rgb(225,55,18)' : t < 0.8 ? 'rgb(250,135,28)' : 'rgb(255,215,80)');
        ctx.fillRect(x, 29 - y, 1, 1);
      }
    }
    F('rgb(230,180,60)'); ctx.fillRect(0, 30, 32, 2);
  } else if (key === 'blast') {
    F('rgb(26,36,50)'); ctx.fillRect(0, 0, 32, 32);
    F('rgb(40,185,215)'); ctx.beginPath();
    for (let i = 0; i < 20; i++) { const a = (i / 20) * Math.PI * 2, r = i % 2 ? 6 : 14.5; ctx.lineTo(16 + Math.cos(a) * r, 16 + Math.sin(a) * r); }
    ctx.fill();
    F('rgb(215,250,255)'); ctx.beginPath(); ctx.arc(16, 16, 4, 0, Math.PI * 2); ctx.fill();
    F('rgb(40,185,215)'); ctx.fillRect(0, 0, 32, 1); ctx.fillRect(0, 31, 32, 1);
  } else if (key === 'bolt') {
    F('rgb(36,36,38)'); ctx.fillRect(0, 0, 32, 32);
    F('rgb(250,205,30)'); ctx.beginPath();
    [[19, 2], [8, 17], [15, 17], [11, 30], [25, 12], [17, 12], [22, 2]].forEach(([x, y]) => ctx.lineTo(x, y)); ctx.fill();
  } else if (key === 'label') {
    F('rgb(186,24,22)'); ctx.fillRect(0, 0, 32, 32);
    F('rgb(240,236,228)');
    for (let x = 0; x < 32; x++) { const yc = 16 + 5 * Math.sin(x * 0.2); ctx.fillRect(x, Math.round(yc - 2), 1, 4); ctx.fillRect(x, Math.round(yc + 5), 1, 1); }
  } else if (key === 'stencil') {
    F('rgb(98,104,60)'); ctx.fillRect(0, 0, 32, 32);
    F('rgb(208,192,92)');
    for (const [row, n0] of [[8, 0], [17, 3]]) { let x = 3; let k = n0; while (x < 28) { const w = (k * 7) % 5 === 0 ? 0 : 3; if (w) ctx.fillRect(x, row, w, 5); x += w ? 4 : 3; k++; } }
    ctx.fillRect(0, 26, 32, 3);
  } else if (key === 'stars') {
    F('rgb(188,34,30)'); ctx.fillRect(0, 0, 32, 32);
    F('rgb(30,60,170)'); ctx.beginPath(); ctx.moveTo(0, 24); ctx.lineTo(32, 10); ctx.lineTo(32, 18); ctx.lineTo(0, 32); ctx.fill();
    const star = (sx, sy, r, c) => { F(c); ctx.beginPath(); for (let i = 0; i < 10; i++) { const a = -Math.PI / 2 + (i / 10) * Math.PI * 2, rr = i % 2 ? r * 0.45 : r; ctx.lineTo(sx + Math.cos(a) * rr, sy + Math.sin(a) * rr); } ctx.fill(); };
    star(9, 9, 7, 'rgb(255,220,40)'); star(24, 6, 4, 'rgb(255,255,240)'); star(23, 25, 5, 'rgb(255,220,40)'); star(6, 25, 3, 'rgb(120,230,90)');
  }
  ctx.restore();
  // noise pass over decal
  const im = ctx.getImageData(ox, oy, CELL, CELL); const dd = im.data;
  for (let i = 0; i < dd.length; i += 4) { const q = (rnd() - 0.5) * 14; dd[i] = clamp(dd[i] + q); dd[i + 1] = clamp(dd[i + 1] + q); dd[i + 2] = clamp(dd[i + 2] + q); }
  ctx.putImageData(im, ox, oy);
}

let _atlas = null;
/** The shared 128x128 items atlas: { canvas, texture, REG }. */
export function itemAtlas() {
  if (_atlas) return _atlas;
  const c = document.createElement('canvas'); c.width = AW; c.height = AH;
  const ctx = c.getContext('2d', { willReadFrequently: true });
  ctx.imageSmoothingEnabled = false;
  const rnd = mulberry32(4242);
  for (const k in LAYOUT) paintCell(ctx, k, rnd);
  const t = new THREE.CanvasTexture(c);
  t.magFilter = THREE.NearestFilter; t.minFilter = THREE.NearestFilter; t.generateMipmaps = false;
  t.wrapS = t.wrapT = THREE.ClampToEdgeWrapping;
  t.colorSpace = THREE.NoColorSpace;
  t.needsUpdate = true;
  _atlas = { canvas: c, texture: t, REG };
  return _atlas;
}

let _mat = null;
/** The ONE shared PS1 material used by every weapon and item (vertex colours = albedo). */
export function itemMaterial() {
  if (!_mat) {
    _mat = createPS1Material({ map: itemAtlas().texture, tint: true });
    _mat.name = 'ps1-items';
  }
  return _mat;
}

// ---------------------------------------------------------------- palette
// Material keys: colour (multiplied with the atlas region) + atlas region.
export const MAT = {
  black: [0x3e3f45, 'grime'], polymer: [0x46484e, 'grime'], rubber: [0x313134, 'grime'],
  blued: [0x4a4f58, 'metal'], gunmetal: [0x666c76, 'metal'], steel: [0x9aa1aa, 'metal'], darksteel: [0x767b82, 'metal'],
  chrome: [0xe6eaf0, 'chrome'], blade: [0xd4d8de, 'chrome'], brass: [0xc8a040, 'metal'], gold: [0xd8b048, 'chrome'],
  wood: [0x9a5a2a, 'wood'], woodDark: [0x6a3a1a, 'wood'], woodLight: [0xe0b878, 'wood'], woodRed: [0x8a3a1c, 'wood'],
  tan: [0xa88e62, 'grime'], olive: [0x5e6838, 'grime'], oliveDark: [0x434a28, 'grime'], khaki: [0x9a8a5a, 'grime'],
  orange: [0xe8701a, 'grime'], red: [0xc02018, 'grime'], redDark: [0x7a1410, 'grime'], yellow: [0xe8b820, 'grime'],
  white: [0xe8e8e2, 'grime'], whiteFlat: [0xf4f4ee, 'flat'], grey: [0x8a8a88, 'grime'], green: [0x2e7a3a, 'grime'],
  blue: [0x2a4a9a, 'grime'], perf: [0x5a5e64, 'perf'], wrap: [0x55555a, 'knurl'], grip: [0x3a3b3f, 'knurl'], chain: [0x9a9ea4, 'teeth'],
  dark: [0x101012, 'flat'], lightRed: [0xff2a20, 'flat'], lightGreen: [0x40ff50, 'flat'], laser: [0xff3030, 'flat'],
  cardboard: [0xa8885a, 'grime'], cloth: [0xd8ccb0, 'grime'],
  glassGreen: [0x3a7a3a, 'glass'], glassBrown: [0x6a3a14, 'glass'], glassClear: [0xb8c8c8, 'glass'], bile: [0x7a9a22, 'glass'], cola: [0x4a1a0e, 'glass'], amber: [0xd8761c, 'glass'],
  // decals (white vertex colour, coloured texture)
  dCross: [0xffffff, 'cross'], dFlame: [0xffffff, 'flame'], dBlast: [0xffffff, 'blast'], dBolt: [0xffffff, 'bolt'],
  dLabel: [0xffffff, 'label'], dStencil: [0xffffff, 'stencil'], dStars: [0xffffff, 'stars'],
};

const _colCache = new Map();
function hexColor(h) {
  let c = _colCache.get(h);
  if (!c) { c = new THREE.Color().setHex(h, THREE.NoColorSpace); _colCache.set(h, c); }
  return c;
}
/** Resolve a material spec: key string | hex number | [hex, region] -> { color, uv } */
export function resolve(m) {
  if (m === undefined || m === null) return { color: hexColor(0xffffff), uv: REG.grime };
  if (typeof m === 'string') { const e = MAT[m]; if (!e) throw new Error('unknown item material ' + m); return { color: hexColor(e[0]), uv: REG[e[1]] }; }
  if (typeof m === 'number') return { color: hexColor(m), uv: REG.grime };
  if (Array.isArray(m)) return { color: hexColor(m[0]), uv: REG[m[1] || 'grime'] };
  if (m.isColor) return { color: m, uv: REG.grime };
  return m;
}

const ZFACE = { top: 'back', bottom: 'front', nose: 'bottom', tail: 'top', left: 'left', right: 'right' };
function mapFaces(o) { if (!o) return o; const r = {}; for (const k in o) r[ZFACE[k] || k] = o[k]; return r; }

// ---------------------------------------------------------------- ItemKit
export class ItemKit extends MeshKit {
  constructor() { super(); this.defaultUV = REG.grime; }

  quad(a, b, c, d, color, uv) {
    const col = color && color.isColor ? color : hexColor(color !== undefined ? color : 0xffffff);
    const r = uv || this.defaultUV;
    let rot = false;
    if (r.rot) {
      const M = this.matrix;
      const A = a.clone().applyMatrix4(M), Bv = b.clone().applyMatrix4(M), D = d.clone().applyMatrix4(M);
      rot = A.distanceTo(D) > A.distanceTo(Bv) * 1.05;
    }
    const t = rot ? [[r[0], r[1]], [r[0], r[3]], [r[2], r[3]], [r[2], r[1]]] : [[r[0], r[1]], [r[2], r[1]], [r[2], r[3]], [r[0], r[3]]];
    const n = b.clone().sub(a).cross(d.clone().sub(a));
    if (n.lengthSq() < 1e-14) n.copy(c.clone().sub(b).cross(a.clone().sub(b)));
    n.normalize();
    this._tri([a, b, c], n, [t[0], t[1], t[2]], col);
    this._tri([a, c, d], n, [t[0], t[2], t[3]], col);
  }
  tri(a, b, c, m) {
    const R = resolve(m); const r = R.uv;
    const n = b.clone().sub(a).cross(c.clone().sub(a)).normalize();
    this._tri([a, b, c], n, [[r[0], r[1]], [r[2], r[1]], [r[2], r[3]]], R.color);
    return this;
  }

  /** Box with a material key. opts.f = { face: matKey } overrides per face (top,bottom,front,back,left,right). */
  box(c, s, m, opts = {}) {
    const R = resolve(m);
    const o = { ...opts, uv: opts.uv || R.uv };
    if (opts.f) {
      o.colors = { ...(opts.colors || {}) }; o.uvs = { ...(opts.uvs || {}) };
      for (const k in opts.f) { const q = resolve(opts.f[k]); o.colors[k] = q.color; o.uvs[k] = q.uv; }
    }
    return super.box(c, s, R.color, o);
  }

  /**
   * Extrusion along Z from z0 (nose, -Z) to z1 (tail, +Z). Nose section w x h centred (x,y);
   * tail section w1 x h1 centred (x+dx, y+dy). Faces: top,bottom,nose,tail,left,right.
   */
  zbox(m, o) {
    const { x = 0, y = 0, z0, z1, w, h } = o;
    const w1 = o.w1 !== undefined ? o.w1 : w, h1 = o.h1 !== undefined ? o.h1 : h;
    const L = z1 - z0;
    this.push([x, y, (z0 + z1) / 2], [Math.PI / 2, 0, 0]);
    this.box([0, 0, 0], [w, L, h], m, { taper: [w1 / w, h1 / h], shift: [o.dx || 0, -(o.dy || 0)], skip: mapFaces(o.skip), f: mapFaces(o.f) });
    this.pop();
    return this;
  }

  /**
   * Cylinder / prism. axis 'x'|'y'|'z'; r at the -axis end, r2 at the +axis end.
   * opts: seg, r2, cap0/cap1 (bool, ends at -axis/+axis), caps:false, capMat0/capMat1, flip (inside), phase
   */
  cyl(c, r, len, m, opts = {}) {
    const R = resolve(m);
    const seg = opts.seg || 6, axis = opts.axis || 'y';
    const r2 = opts.r2 !== undefined ? opts.r2 : r;
    const ph = opts.phase !== undefined ? opts.phase : Math.PI / 2 - Math.PI / seg;
    const rot = axis === 'y' ? [0, 0, 0] : axis === 'x' ? [0, 0, -Math.PI / 2] : [Math.PI / 2, 0, 0];
    this.push(c, rot);
    const V = (x, y, z) => new THREE.Vector3(x, y, z);
    const h = len / 2;
    const ring = (rr, y) => { const a = []; for (let i = 0; i <= seg; i++) { const t = ph + (i / seg) * Math.PI * 2; a.push(V(Math.cos(t) * rr, y, Math.sin(t) * rr)); } return a; };
    const P = ring(r, -h), Q = ring(r2, h);
    for (let i = 0; i < seg; i++) {
      if (opts.flip) this.quad(P[i], P[i + 1], Q[i + 1], Q[i], R.color, R.uv);
      else this.quad(P[i + 1], P[i], Q[i], Q[i + 1], R.color, R.uv);
    }
    const capOn0 = opts.caps === false ? false : opts.cap0 !== undefined ? opts.cap0 : true;
    const capOn1 = opts.caps === false ? false : opts.cap1 !== undefined ? opts.cap1 : true;
    const cap = (pts, y, up, mm, rr) => {
      const Rc = mm !== undefined ? resolve(mm) : R; const u = Rc.uv;
      const uc = (u[0] + u[2]) / 2, vc = (u[1] + u[3]) / 2, du = (u[2] - u[0]) / 2, dv = (u[3] - u[1]) / 2;
      const uvOf = (p) => [uc + (p.x / (rr || 1)) * du * 0.9, vc + (p.z / (rr || 1)) * dv * 0.9];
      const ctr = V(0, y, 0);
      for (let i = 0; i < seg; i++) {
        const a = pts[i], b = pts[i + 1];
        if (up) this._tri([ctr, b, a], V(0, 1, 0), [[uc, vc], uvOf(b), uvOf(a)], Rc.color);
        else this._tri([ctr, a, b], V(0, -1, 0), [[uc, vc], uvOf(a), uvOf(b)], Rc.color);
      }
    };
    if (capOn1 && r2 > 0) cap(Q, h, !opts.flip, opts.capMat1 !== undefined ? opts.capMat1 : opts.capMat, r2);
    if (capOn0 && r > 0) cap(P, -h, !!opts.flip, opts.capMat0 !== undefined ? opts.capMat0 : opts.capMat, r);
    this.pop();
    return this;
  }

  /** Flat annulus at centre c (axis y, facing +y unless down). */
  ring(c, rIn, rOut, m, opts = {}) {
    const R = resolve(m); const seg = opts.seg || 8; const ph = opts.phase !== undefined ? opts.phase : Math.PI / 2 - Math.PI / seg;
    const V = (a, rr) => new THREE.Vector3(c[0] + Math.cos(a) * rr, c[1], c[2] + Math.sin(a) * rr);
    for (let i = 0; i < seg; i++) {
      const a0 = ph + (i / seg) * Math.PI * 2, a1 = ph + ((i + 1) / seg) * Math.PI * 2;
      if (opts.down) this.quad(V(a0, rIn), V(a1, rIn), V(a1, rOut), V(a0, rOut), R.color, R.uv);
      else this.quad(V(a1, rIn), V(a0, rIn), V(a0, rOut), V(a1, rOut), R.color, R.uv);
    }
    return this;
  }

  /** Flat disc facing +Y (or -Y with down) centred at c. */
  disc(c, r, m, opts = {}) {
    const R = resolve(m); const seg = opts.seg || 8; const ph = opts.phase !== undefined ? opts.phase : Math.PI / 2 - Math.PI / seg;
    const u = R.uv, uc = (u[0] + u[2]) / 2, vc = (u[1] + u[3]) / 2, du = (u[2] - u[0]) * 0.45, dv = (u[3] - u[1]) * 0.45;
    const ctr = new THREE.Vector3(c[0], c[1], c[2]);
    const P = (a) => new THREE.Vector3(c[0] + Math.cos(a) * r, c[1], c[2] + Math.sin(a) * r);
    const T = (a) => [uc + Math.cos(a) * du, vc - Math.sin(a) * dv];
    for (let i = 0; i < seg; i++) {
      const a0 = ph + (i / seg) * Math.PI * 2, a1 = ph + ((i + 1) / seg) * Math.PI * 2;
      if (opts.down) this._tri([ctr, P(a0), P(a1)], new THREE.Vector3(0, -1, 0), [[uc, vc], T(a0), T(a1)], R.color);
      else this._tri([ctr, P(a1), P(a0)], new THREE.Vector3(0, 1, 0), [[uc, vc], T(a1), T(a0)], R.color);
    }
    return this;
  }

  /** Pistol-grip style block hanging from (x,y,z), raked by `rake` radians (bottom toward +Z when rake < 0). */
  grip(m, { x = 0, y, z, w, h, d, rake = -0.3, taper = 0.92, f }) {
    this.push([x, y, z], [rake, 0, 0]);
    this.box([0, -h / 2, 0], [w, h, d], m, { taperBottom: [taper, taper], skip: { top: true }, f });
    this.pop();
    return this;
  }

  /** Quad whose winding is chosen so its normal points away from `ref`. */
  oquad(a, b, c, d, m, ref) {
    const R = resolve(m);
    const n = b.clone().sub(a).cross(d.clone().sub(a));
    if (n.lengthSq() < 1e-14) n.copy(c.clone().sub(b).cross(a.clone().sub(b)));
    const mid = a.clone().add(b).add(c).add(d).multiplyScalar(0.25);
    if (n.dot(mid.sub(ref)) < 0) this.quad(a, d, c, b, R.color, R.uv); else this.quad(a, b, c, d, R.color, R.uv);
    return this;
  }

  /**
   * Loft a rectangular tube through sections {c:[x,y,z], u:[..] half-width axis, v:[..] half-height axis}.
   * Side index: 0 = -v, 1 = +u, 2 = +v, 3 = -u. opts.f = {sideIndex: mat}, opts.skip = {sideIndex|'cap0'|'cap1': true}
   */
  loft(m, secs, opts = {}) {
    const V = (a) => new THREE.Vector3(a[0], a[1], a[2]);
    const S = secs.map((s) => {
      const c = V(s.c), u = V(s.u), v = V(s.v);
      return { c, p: [c.clone().sub(u).sub(v), c.clone().add(u).sub(v), c.clone().add(u).add(v), c.clone().sub(u).add(v)] };
    });
    const sk = opts.skip || {};
    const fm = (i) => (opts.f && opts.f[i] !== undefined ? opts.f[i] : m);
    for (let s = 0; s < S.length - 1; s++) {
      const A = S[s], Bs = S[s + 1];
      const mid = A.c.clone().add(Bs.c).multiplyScalar(0.5);
      for (let i = 0; i < 4; i++) {
        if (sk[i]) continue;
        const j = (i + 1) % 4;
        this.oquad(A.p[i], A.p[j], Bs.p[j], Bs.p[i], fm(i), mid);
      }
    }
    const n = S.length;
    if (!sk.cap0) this.oquad(S[0].p[0], S[0].p[1], S[0].p[2], S[0].p[3], opts.capMat0 || m, S[1].c);
    if (!sk.cap1) this.oquad(S[n - 1].p[0], S[n - 1].p[1], S[n - 1].p[2], S[n - 1].p[3], opts.capMat1 || m, S[n - 2].c);
    return this;
  }

  /**
   * Planar arc loft in the YZ plane (e.g. curved magazines, blades). pts: [[y, z, depth, angle, width?]...]
   * Section i has depth along (0,-sin a, cos a) and width along X (default w).
   */
  arc(m, { x = 0, w, pts }, opts) {
    const secs = pts.map(([y, z, d, a, ww]) => ({ c: [x, y, z], u: [(ww || w) / 2, 0, 0], v: [0, -Math.sin(a) * d / 2, Math.cos(a) * d / 2] }));
    return this.loft(m, secs, opts);
  }

  tris() { return this.pos.length / 9; }
}

// ---------------------------------------------------------------- assembly
/**
 * Run build(ctx) and produce a Group containing the static 'body' mesh plus any movable parts.
 * ctx: { vm, k (body ItemKit), seg(tp, vm), part(name, pivot, fn, opts), marker(name, pos, fn, opts) }
 * build returns userData fields (Vector3s / Object3D refs / primitives).
 */
export function assemble(build, opts = {}) {
  const mat = itemMaterial();
  const vm = !!opts.viewmodel;
  const root = new THREE.Group();
  const body = new ItemKit();
  const off = new THREE.Vector3();
  const ctx = {
    vm, k: body,
    /** Declare which authored point becomes the model origin (call before adding geometry). */
    setOrigin(p) { off.set(-p[0], -p[1], -p[2]); body.stack = [new THREE.Matrix4().makeTranslation(off.x, off.y, off.z)]; },
    seg: (a, b) => (vm ? b : a),
    v: (x, y, z) => new THREE.Vector3(x, y, z),
    /** Separate child mesh with its own pivot; geometry is authored in model space. */
    part(name, pivot, fn, o = {}) {
      const k = new ItemKit();
      k.push([-pivot[0], -pivot[1], -pivot[2]]);
      fn(k);
      const mesh = new THREE.Mesh(k.toGeometry(), mat);
      mesh.name = name; mesh.position.set(pivot[0], pivot[1], pivot[2]);
      if (!o.parent) mesh.position.add(off);
      else { const pp = o.parentPivot || o.parent.userData.pivot; if (pp) mesh.position.sub(new THREE.Vector3(...pp)); }
      mesh.userData.pivot = [pivot[0], pivot[1], pivot[2]];
      if (o.hidden) { mesh.visible = false; mesh.userData.noBounds = true; }
      (o.parent || root).add(mesh);
      return mesh;
    },
    /** Empty Object3D marker (e.g. shotgun loading port) with an optional hidden child mesh (e.g. a shell). */
    marker(name, pos, fn, o = {}) {
      const g = new THREE.Object3D(); g.name = name; g.position.set(pos[0], pos[1], pos[2]);
      if (!o.parent) g.position.add(off);
      else if (o.parent.userData.pivot) g.position.sub(new THREE.Vector3(...o.parent.userData.pivot));
      g.userData.pivot = [pos[0], pos[1], pos[2]];
      (o.parent || root).add(g);
      if (fn) { const m = ctx.part(o.childName || name + '_mesh', pos, fn, { parent: g, parentPivot: pos, hidden: o.hidden !== false }); g.userData.child = m.name; }
      return g;
    },
  };
  const ud = build(ctx) || {};
  for (const key in ud) if (ud[key] && ud[key].isVector3) ud[key].add(off);
  if (body.pos.length) {
    const bm = new THREE.Mesh(body.toGeometry(), mat); bm.name = 'body';
    root.add(bm); root.children.unshift(root.children.pop());
  }
  // bounds from visible meshes only
  root.updateMatrixWorld(true);
  const box = new THREE.Box3(); const tmp = new THREE.Box3();
  root.traverse((o) => {
    if (!o.isMesh) return;
    let p = o; while (p) { if (p.userData && p.userData.noBounds) return; p = p.parent; }
    o.geometry.computeBoundingBox();
    tmp.copy(o.geometry.boundingBox).applyMatrix4(o.matrixWorld); box.union(tmp);
  });
  const size = box.getSize(new THREE.Vector3());
  let tris = 0; root.traverse((o) => { if (o.isMesh) tris += o.geometry.getAttribute('position').count / 3; });
  root.userData = { ...ud, size, bounds: box, tris, viewmodel: vm };
  return root;
}

/** Clone a template produced by assemble(): geometry/material shared, userData rebound to the clone. */
export function instantiate(tpl) {
  const saved = tpl.userData;
  tpl.userData = {};
  const inst = tpl.clone(true);
  tpl.userData = saved;
  const ud = {};
  for (const key in saved) {
    const v = saved[key];
    if (v && v.isObject3D) ud[key] = inst.getObjectByName(v.name) || null;
    else if (v && (v.isVector3 || v.isBox3)) ud[key] = v.clone();
    else if (Array.isArray(v)) ud[key] = v.slice();
    else ud[key] = v;
  }
  inst.userData = ud;
  return inst;
}
