// The building kit for the Olympic park. Materials are painted on canvases
// (marble, sandstone, grass, the running track, maple lanes, pool tiles).
// Static shapes are merged per material for drawing, with UVs measured in
// studs so textures keep one scale everywhere. Colliders are plain static
// cannon bodies (one per brick, so a body tumbling down the stairs feels
// every step).
import * as THREE from 'three';
import * as CANNON from '../../vendor/cannon-es.js';
import { GROUP } from '../../engine/Part.js';

export const V = (x = 0, y = 0, z = 0) => new THREE.Vector3(x, y, z);
export const GRAV = 120; // gravity in the park (studs/s^2): lighter than ROBLOX's 196.2
export const rnd = (a, b) => a + Math.random() * (b - a);
export const pick = (a) => a[Math.floor(Math.random() * a.length)];
export const clamp = (v, a, b) => Math.max(a, Math.min(b, v));
export const lerp = (a, b, k) => a + (b - a) * k;
export function rng(seed) { let s = seed >>> 0; return () => { s = (s + 0x6D2B79F5) >>> 0; let t = s; t = Math.imul(t ^ (t >>> 15), t | 1); t ^= t + Math.imul(t ^ (t >>> 7), t | 61); return ((t ^ (t >>> 14)) >>> 0) / 4294967296; }; }
const DEG = Math.PI / 180;

// --- textures ---------------------------------------------------------------------------------------------------------------------------
export function canvas(w, h, draw) { const c = document.createElement('canvas'); c.width = w; c.height = h; draw(c.getContext('2d'), w, h); return c; }
export function tex(c, o = {}) {
  const t = new THREE.CanvasTexture(c);
  t.colorSpace = o.linear ? THREE.NoColorSpace : THREE.SRGBColorSpace;
  t.wrapS = t.wrapT = o.clamp ? THREE.ClampToEdgeWrapping : THREE.RepeatWrapping;
  t.anisotropy = o.aniso ?? 8;
  if (o.nearest) { t.magFilter = THREE.NearestFilter; }
  return t;
}
function grain(x, w, h, amt, r = Math.random) {
  const img = x.getImageData(0, 0, w, h), d = img.data;
  for (let i = 0; i < d.length; i += 4) { const n = (r() - 0.5) * amt; d[i] += n; d[i + 1] += n; d[i + 2] += n; }
  x.putImageData(img, 0, 0);
}
function blobs(x, w, h, n, col, r0, r1, r = Math.random) {
  // (fade to the same colour, transparent: fading to transparent black leaves a dark ring)
  const clear = col.replace(/,\s*[\d.]+\)$/, ',0)');
  for (let i = 0; i < n; i++) {
    const cx = r() * w, cy = r() * h, rr = r0 + r() * (r1 - r0);
    const g = x.createRadialGradient(cx, cy, 0, cx, cy, rr); g.addColorStop(0, col); g.addColorStop(1, clear);
    x.fillStyle = g; x.fillRect(cx - rr, cy - rr, rr * 2, rr * 2);
  }
}

const TEX = {};
function T(name, make) { return TEX[name] || (TEX[name] = make()); }

const marbleTex = () => T('marble', () => tex(canvas(512, 512, (x, w, h) => {
  const r = rng(11);
  x.fillStyle = '#f0ede6'; x.fillRect(0, 0, w, h);
  blobs(x, w, h, 26, 'rgba(226,222,214,0.3)', 30, 110, r);
  blobs(x, w, h, 16, 'rgba(255,255,252,0.35)', 20, 80, r);
  // veins: wandering grey lines
  for (let v = 0; v < 9; v++) {
    let px = r() * w, py = r() * h, a = r() * Math.PI * 2;
    x.strokeStyle = `rgba(${135 + r() * 40},${135 + r() * 40},${140 + r() * 40},${0.12 + r() * 0.18})`;
    x.lineWidth = 0.5 + r() * 1.2;
    x.beginPath(); x.moveTo(px, py);
    for (let i = 0; i < 70; i++) { a += (r() - 0.5) * 0.7; px += Math.cos(a) * 9; py += Math.sin(a) * 9; x.lineTo(((px % w) + w) % w, ((py % h) + h) % h); if (r() < 0.04) { x.stroke(); x.beginPath(); x.moveTo(((px % w) + w) % w, ((py % h) + h) % h); } }
    x.stroke();
  }
  grain(x, w, h, 10, r);
})));
const stoneTex = () => T('stone', () => tex(canvas(512, 512, (x, w, h) => {
  const r = rng(5);
  x.fillStyle = '#cdbb98'; x.fillRect(0, 0, w, h);
  // ashlar blocks
  const bh = 64;
  for (let row = 0; row < h / bh; row++) {
    const off = row % 2 ? 64 : 0;
    for (let col = -1; col < w / 128 + 1; col++) {
      const bx = col * 128 + off, by = row * bh;
      const l = 190 + r() * 30;
      x.fillStyle = `rgb(${l + 14},${l},${l - 30})`; x.fillRect(bx + 2, by + 2, 124, bh - 4);
    }
  }
  blobs(x, w, h, 60, 'rgba(150,130,100,0.18)', 10, 50, r);
  grain(x, w, h, 18, r);
})));
const grassTex = () => T('grass', () => tex(canvas(512, 512, (x, w, h) => {
  const r = rng(3);
  x.fillStyle = '#5f9a3c'; x.fillRect(0, 0, w, h);
  blobs(x, w, h, 70, 'rgba(120,170,70,0.35)', 20, 80, r);
  blobs(x, w, h, 50, 'rgba(60,110,40,0.35)', 20, 70, r);
  for (let i = 0; i < 5000; i++) { const g = 120 + r() * 80; x.fillStyle = `rgba(${g * 0.55},${g},${g * 0.35},0.5)`; x.fillRect(r() * w, r() * h, 1, 2 + r() * 3); }
  grain(x, w, h, 14, r);
})));
const mownTex = () => T('mown', () => tex(canvas(512, 512, (x, w, h) => {
  const r = rng(8);
  for (let i = 0; i < 8; i++) { x.fillStyle = i % 2 ? '#4f9a36' : '#5eaa40'; x.fillRect(i * 64, 0, 64, h); }
  for (let i = 0; i < 4000; i++) { const g = 120 + r() * 80; x.fillStyle = `rgba(${g * 0.5},${g},${g * 0.3},0.35)`; x.fillRect(r() * w, r() * h, 1, 2 + r() * 2); }
  grain(x, w, h, 10, r);
})));
const trackTex = () => T('track', () => tex(canvas(256, 256, (x, w, h) => {
  const r = rng(4);
  x.fillStyle = '#b8402e'; x.fillRect(0, 0, w, h);
  for (let i = 0; i < 6000; i++) { const g = r(); x.fillStyle = g < 0.5 ? 'rgba(90,20,10,0.35)' : 'rgba(230,120,90,0.3)'; x.fillRect(r() * w, r() * h, 1.5, 1.5); }
})));
const pavingTex = () => T('paving', () => tex(canvas(512, 512, (x, w, h) => {
  const r = rng(9);
  x.fillStyle = '#d9d2c2'; x.fillRect(0, 0, w, h);
  for (let i = 0; i < 8; i++) for (let j = 0; j < 8; j++) {
    const l = 205 + r() * 30; x.fillStyle = `rgb(${l},${l - 6},${l - 18})`; x.fillRect(i * 64 + 2, j * 64 + 2, 60, 60);
  }
  blobs(x, w, h, 40, 'rgba(160,150,130,0.15)', 10, 60, r);
  grain(x, w, h, 14, r);
})));
const woodTex = () => T('lane', () => tex(canvas(512, 512, (x, w, h) => {
  const r = rng(12);
  // maple boards running along the lane (v)
  const n = 16;
  for (let i = 0; i < n; i++) {
    const l = 0.85 + r() * 0.15;
    x.fillStyle = `rgb(${226 * l},${190 * l},${140 * l})`; x.fillRect((i * w) / n, 0, w / n, h);
    for (let k = 0; k < 18; k++) { x.strokeStyle = `rgba(150,100,60,${0.08 + r() * 0.1})`; x.lineWidth = 1; const px = (i * w) / n + r() * (w / n); x.beginPath(); x.moveTo(px, 0); x.bezierCurveTo(px + (r() - 0.5) * 6, h * 0.3, px + (r() - 0.5) * 6, h * 0.7, px, h); x.stroke(); }
    x.fillStyle = 'rgba(80,50,20,0.35)'; x.fillRect((i * w) / n, 0, 1, h);
  }
  grain(x, w, h, 8, r);
})));
const tileTex = () => T('tile', () => tex(canvas(256, 256, (x, w, h) => {
  const r = rng(6);
  x.fillStyle = '#e8f0f2'; x.fillRect(0, 0, w, h);
  for (let i = 0; i < 8; i++) for (let j = 0; j < 8; j++) { const l = r() * 12; x.fillStyle = `rgb(${62 + l},${150 + l},${190 + l})`; x.fillRect(i * 32 + 1.5, j * 32 + 1.5, 29, 29); }
})));
const whiteTileTex = () => T('wtile', () => tex(canvas(256, 256, (x, w, h) => {
  const r = rng(16);
  x.fillStyle = '#b9c0c2'; x.fillRect(0, 0, w, h);
  for (let i = 0; i < 8; i++) for (let j = 0; j < 8; j++) { const l = 236 + r() * 14; x.fillStyle = `rgb(${l},${l},${l - 4})`; x.fillRect(i * 32 + 1.5, j * 32 + 1.5, 29, 29); }
})));
const concreteTex = () => T('concrete', () => tex(canvas(256, 256, (x, w, h) => {
  const r = rng(7);
  x.fillStyle = '#b4b2ad'; x.fillRect(0, 0, w, h);
  blobs(x, w, h, 40, 'rgba(120,118,112,0.2)', 10, 40, r);
  grain(x, w, h, 22, r);
})));
const sandTex = () => T('sand', () => tex(canvas(256, 256, (x, w, h) => {
  const r = rng(13);
  x.fillStyle = '#e2cf9a'; x.fillRect(0, 0, w, h);
  blobs(x, w, h, 30, 'rgba(190,160,100,0.25)', 10, 40, r);
  grain(x, w, h, 26, r);
})));
const hayTex = () => T('hay', () => tex(canvas(256, 256, (x, w, h) => {
  const r = rng(14);
  x.fillStyle = '#d9b75a'; x.fillRect(0, 0, w, h);
  for (let i = 0; i < 1400; i++) { x.strokeStyle = `rgba(${150 + r() * 90},${120 + r() * 70},${40 + r() * 30},0.7)`; x.lineWidth = 1; const px = r() * w, py = r() * h, a = (r() - 0.5) * 0.8; x.beginPath(); x.moveTo(px, py); x.lineTo(px + Math.cos(a) * 14, py + Math.sin(a) * 14); x.stroke(); }
})));
const brickTex = () => T('brick', () => tex(canvas(256, 256, (x, w, h) => {
  const r = rng(17);
  x.fillStyle = '#9a9188'; x.fillRect(0, 0, w, h);
  for (let row = 0; row < 8; row++) for (let col = -1; col < 5; col++) {
    const l = 0.8 + r() * 0.25; const bx = col * 64 + (row % 2 ? 32 : 0);
    x.fillStyle = `rgb(${168 * l},${70 * l},${50 * l})`; x.fillRect(bx + 2, row * 32 + 2, 60, 28);
  }
  grain(x, w, h, 16, r);
})));

// --- materials -------------------------------------------------------------------------------------------------------------------------------
// Each: [texture maker or null, studs per texture repeat, color, roughness, metalness, extra]
const MAT_DEFS = {
  marble: [marbleTex, 24, 0xffffff, 0.32, 0],
  marbleDark: [marbleTex, 24, 0xb9b2a6, 0.36, 0],
  stone: [stoneTex, 20, 0xffffff, 0.85, 0],
  grass: [grassTex, 40, 0xffffff, 0.95, 0],
  mown: [mownTex, 60, 0xffffff, 0.95, 0],
  track: [trackTex, 10, 0xffffff, 0.9, 0],
  paving: [pavingTex, 24, 0xffffff, 0.85, 0],
  lane: [woodTex, 10, 0xffffff, 0.22, 0],
  tile: [tileTex, 8, 0xffffff, 0.25, 0],
  whiteTile: [whiteTileTex, 8, 0xffffff, 0.3, 0],
  concrete: [concreteTex, 16, 0xffffff, 0.9, 0],
  sand: [sandTex, 16, 0xffffff, 1, 0],
  hay: [hayTex, 6, 0xffffff, 1, 0],
  brick: [brickTex, 12, 0xffffff, 0.9, 0],
  white: [null, 1, 0xf4f4f0, 0.6, 0],
  paint: [null, 1, 0xffffff, 0.7, 0],
  black: [null, 1, 0x1e1f22, 0.6, 0.1],
  steel: [null, 1, 0x9aa3ad, 0.35, 0.75],
  darkSteel: [null, 1, 0x3a3f46, 0.45, 0.7],
  gold: [null, 1, 0xf2c14e, 0.28, 0.9],
  silver: [null, 1, 0xd0d4da, 0.25, 0.9],
  bronze: [null, 1, 0xc0773a, 0.32, 0.85],
  wood: [null, 1, 0x8a5a32, 0.8, 0],
  darkWood: [null, 1, 0x5a3a20, 0.8, 0],
  red: [null, 1, 0xd8332a, 0.55, 0],
  blue: [null, 1, 0x1f6fd1, 0.55, 0],
  yellow: [null, 1, 0xf7c51e, 0.55, 0],
  green: [null, 1, 0x2a9a46, 0.55, 0],
  orange: [null, 1, 0xf07c1a, 0.55, 0],
  purple: [null, 1, 0x7a3fc4, 0.55, 0],
  teal: [null, 1, 0x1aa6a6, 0.55, 0],
  pink: [null, 1, 0xf06aa6, 0.55, 0],
  navy: [null, 1, 0x1a2a5a, 0.6, 0],
  cypress: [null, 1, 0x2f5a2a, 0.9, 0],
  olive: [null, 1, 0x6f8a48, 0.9, 0],
  bark: [null, 1, 0x6a4a32, 0.95, 0],
  rubber: [null, 1, 0x2a2a2c, 0.95, 0],
  trampoline: [null, 1, 0x1a1a24, 0.7, 0],
  glass: [null, 1, 0x9fd8ff, 0.1, 0.1, { transparent: true, opacity: 0.35 }],
  neonPink: [null, 1, 0xff4fb0, 0.4, 0, { emissive: 0xff3aa0, emissiveIntensity: 1.2 }],
  neonBlue: [null, 1, 0x4fc8ff, 0.4, 0, { emissive: 0x3ab4ff, emissiveIntensity: 1.2 }],
  neonGold: [null, 1, 0xffd060, 0.4, 0, { emissive: 0xffb020, emissiveIntensity: 1.1 }],
  fire: [null, 1, 0xffa030, 1, 0, { emissive: 0xff7a10, emissiveIntensity: 2.2 }],
  screen: [null, 1, 0x101418, 0.4, 0.2],
};
const MATS = {};
const SCALE = new Map(); // material -> studs per repeat
export function mat(name) {
  if (MATS[name]) return MATS[name];
  const d = MAT_DEFS[name];
  if (!d) throw new Error('no material ' + name);
  const m = new THREE.MeshStandardMaterial({ map: d[0] ? d[0]() : null, color: d[2], roughness: d[3], metalness: d[4], ...(d[5] || {}) });
  MATS[name] = m; SCALE.set(m, d[1]);
  return m;
}
/** A plain coloured material (cached). */
export function colorMat(hex, rough = 0.6, metal = 0, extra = {}) {
  const k = 'c' + hex + ':' + rough + ':' + metal + JSON.stringify(extra);
  if (!MATS[k]) { MATS[k] = new THREE.MeshStandardMaterial({ color: hex, roughness: rough, metalness: metal, ...extra }); SCALE.set(MATS[k], 1); }
  return MATS[k];
}
export function scaleOf(m) { return SCALE.get(m) || 1; }

// --- geometry -----------------------------------------------------------------------------------------------------------------------------------
/** A box with UVs in studs / scale (faces: +x -x +y -y +z -z). */
export function boxGeo(sx, sy, sz, scale = 1) {
  const g = new THREE.BoxGeometry(sx, sy, sz);
  const uv = g.attributes.uv;
  const dims = [[sz, sy], [sz, sy], [sx, sz], [sx, sz], [sx, sy], [sx, sy]];
  for (let f = 0; f < 6; f++) for (let v = 0; v < 4; v++) { const i = f * 4 + v; uv.setXY(i, uv.getX(i) * dims[f][0] / scale, uv.getY(i) * dims[f][1] / scale); }
  return g;
}
/** A wedge: full height at +z, sloping down to -z (like a ROBLOX wedge). */
export function wedgeGeo(sx, sy, sz, scale = 1) {
  const x = sx / 2, y = sy / 2, z = sz / 2, L = Math.hypot(sy, sz) / scale, X = sx / scale, Y = sy / scale, Z = sz / scale;
  const P = [], U = [];
  const quad = (a, b, c, d, ua, ub, uc, ud) => { P.push(...a, ...b, ...c, ...a, ...c, ...d); U.push(...ua, ...ub, ...uc, ...ua, ...uc, ...ud); };
  const tri = (a, b, c, ua, ub, uc) => { P.push(...a, ...b, ...c); U.push(...ua, ...ub, ...uc); };
  quad([-x, -y, z], [x, -y, z], [x, -y, -z], [-x, -y, -z], [0, Z], [X, Z], [X, 0], [0, 0]); // bottom
  quad([-x, -y, z], [-x, y, z], [x, y, z], [x, -y, z], [0, 0], [0, Y], [X, Y], [X, 0]); // back
  quad([-x, -y, -z], [x, -y, -z], [x, y, z], [-x, y, z], [0, 0], [X, 0], [X, L], [0, L]); // slope
  tri([-x, -y, -z], [-x, y, z], [-x, -y, z], [0, 0], [Z, Y], [Z, 0]);
  tri([x, -y, -z], [x, -y, z], [x, y, z], [0, 0], [Z, 0], [Z, Y]);
  const g = new THREE.BufferGeometry();
  g.setAttribute('position', new THREE.Float32BufferAttribute(P, 3));
  g.setAttribute('uv', new THREE.Float32BufferAttribute(U, 2));
  g.computeVertexNormals();
  return g;
}
export function cylGeo(rt, rb, h, seg = 20, scale = 1, open = false) {
  const g = new THREE.CylinderGeometry(rt, rb, h, seg, 1, open);
  const uv = g.attributes.uv;
  const circ = Math.PI * (rt + rb);
  for (let i = 0; i < uv.count; i++) uv.setXY(i, uv.getX(i) * circ / scale, uv.getY(i) * h / scale);
  return g;
}

/** A fluted column shaft (classical), y from -h/2 to h/2. */
export function flutedGeo(rb, rt, h, flutes = 18, scale = 1) {
  const g = cylGeo(rt, rb, h, flutes * 4, scale);
  const p = g.attributes.position;
  for (let i = 0; i < p.count; i++) {
    const x = p.getX(i), z = p.getZ(i), r = Math.hypot(x, z);
    if (r < 0.01) continue;
    const a = Math.atan2(z, x), k = 1 - 0.07 * Math.pow(Math.max(0, Math.cos(a * flutes)), 0.6);
    p.setX(i, x * k); p.setZ(i, z * k);
  }
  g.computeVertexNormals();
  return g;
}

const _m4 = new THREE.Matrix4(), _q = new THREE.Quaternion(), _e = new THREE.Euler(), _s = new THREE.Vector3(1, 1, 1), _p = new THREE.Vector3();
export function quatOf(rot) {
  if (!rot) return _q.identity();
  if (rot.isQuaternion) return _q.copy(rot);
  if (typeof rot === 'number') return _q.setFromAxisAngle(new THREE.Vector3(0, 1, 0), rot);
  return _q.setFromEuler(_e.set(rot[0] * DEG, rot[1] * DEG, rot[2] * DEG, 'YXZ'));
}

// --- the kit ---------------------------------------------------------------------------------------------------------------------------------------------
export class Kit {
  constructor(world) {
    this.world = world;
    this.batches = new Map(); // material -> {geos: [], shadow}
    this.group = new THREE.Group();
    this.group.name = 'static';
    world.scene.add(this.group);
    this.bodies = [];
  }

  /** Add geometry (in its own frame) to the merged drawing at position/rotation. rot: radians about y, [deg x,y,z] or a quaternion. */
  geo(g, material, x, y, z, rot = null, o = {}) {
    const m = typeof material === 'string' ? mat(material) : material;
    _m4.compose(_p.set(x, y, z), quatOf(rot), o.scale ? _s.set(...o.scale) : _s.set(1, 1, 1));
    const gg = g.index ? g.toNonIndexed() : g.clone();
    gg.applyMatrix4(_m4);
    if (!gg.attributes.uv) gg.setAttribute('uv', new THREE.Float32BufferAttribute(new Float32Array(gg.attributes.position.count * 2), 2));
    const key = m.uuid + (o.noShadow ? ':n' : '');
    let b = this.batches.get(key);
    if (!b) { b = { mat: m, geos: [], cast: !o.noShadow }; this.batches.set(key, b); }
    b.geos.push(gg);
    return gg;
  }

  /** A box (centre x,y,z) drawn and, unless o.col === false, solid. */
  box(x, y, z, sx, sy, sz, material, o = {}) {
    const m = typeof material === 'string' ? mat(material) : material;
    if (o.draw !== false) this.geo(boxGeo(sx, sy, sz, o.uv || scaleOf(m)), m, x, y, z, o.rot, o);
    if (o.col !== false) return this.col(x, y, z, sx, sy, sz, o.rot, o);
    return null;
  }
  /** A box from corner to corner (x0..x1, y0..y1, z0..z1). */
  span(x0, y0, z0, x1, y1, z1, material, o = {}) { return this.box((x0 + x1) / 2, (y0 + y1) / 2, (z0 + z1) / 2, Math.abs(x1 - x0), Math.abs(y1 - y0), Math.abs(z1 - z0), material, o); }
  /** A wedge (slope rising towards +z in its own frame). */
  wedge(x, y, z, sx, sy, sz, material, o = {}) {
    const m = typeof material === 'string' ? mat(material) : material;
    this.geo(wedgeGeo(sx, sy, sz, o.uv || scaleOf(m)), m, x, y, z, o.rot, o);
    if (o.col === false) return null;
    const hx = sx / 2, hy = sy / 2, hz = sz / 2, cy = -hy / 3, cz = hz / 3;
    const verts = [[-hx, -hy, -hz], [hx, -hy, -hz], [hx, -hy, hz], [-hx, -hy, hz], [-hx, hy, hz], [hx, hy, hz]].map(([a, b, c]) => new CANNON.Vec3(a, b - cy, c - cz));
    const faces = [[0, 1, 2, 3], [3, 2, 5, 4], [0, 4, 5, 1], [0, 3, 4], [1, 5, 2]];
    const shape = new CANNON.ConvexPolyhedron({ vertices: verts, faces });
    return this._body(shape, x, y, z, o.rot, o, new CANNON.Vec3(0, cy, cz));
  }
  /** An upright cylinder (drawn; solid as a box unless o.col === false or o.round). */
  cyl(x, y, z, r, h, material, o = {}) {
    const m = typeof material === 'string' ? mat(material) : material;
    this.geo(cylGeo(o.rTop ?? r, r, h, o.seg || 20, o.uv || scaleOf(m)), m, x, y, z, o.rot, o);
    if (o.col === false) return null;
    if (o.round) return this._body(new CANNON.Cylinder(o.rTop ?? r, r, h, 12), x, y, z, o.rot, o);
    return this.col(x, y, z, r * 1.8, h, r * 1.8, o.rot, o);
  }
  ball(x, y, z, r, material, o = {}) {
    const m = typeof material === 'string' ? mat(material) : material;
    this.geo(new THREE.SphereGeometry(r, o.seg || 20, Math.max(8, (o.seg || 20) >> 1)), m, x, y, z, o.rot, o);
    if (o.col === false) return null;
    return this._body(new CANNON.Sphere(r), x, y, z, null, o);
  }

  /** A static collider box (invisible). */
  col(x, y, z, sx, sy, sz, rot = null, o = {}) {
    return this._body(new CANNON.Box(new CANNON.Vec3(sx / 2, sy / 2, sz / 2)), x, y, z, rot, o);
  }
  _body(shape, x, y, z, rot, o = {}, offset = null) {
    const b = new CANNON.Body({ mass: 0, type: CANNON.Body.STATIC, material: o.material || this.world.defaultPhysMaterial });
    b.addShape(shape, offset || undefined);
    b.position.set(x, y, z);
    const q = quatOf(rot);
    b.quaternion.set(q.x, q.y, q.z, q.w);
    b.collisionFilterGroup = GROUP.WORLD;
    b.collisionFilterMask = GROUP.WORLD | GROUP.DYNAMIC | GROUP.CHARACTER | GROUP.DEBRIS;
    if (o.tag) b.tag = o.tag;
    if (o.data) Object.assign(b, o.data);
    b.updateAABB();
    this.world.physics.addBody(b);
    this.bodies.push(b);
    return b;
  }

  /** Merge everything added so far into one mesh per material. */
  flush() {
    for (const b of this.batches.values()) {
      if (!b.geos.length) continue;
      let n = 0;
      for (const g of b.geos) n += g.attributes.position.count;
      const pos = new Float32Array(n * 3), nrm = new Float32Array(n * 3), uv = new Float32Array(n * 2);
      let o = 0;
      for (const g of b.geos) {
        if (!g.attributes.normal) g.computeVertexNormals();
        pos.set(g.attributes.position.array, o * 3); nrm.set(g.attributes.normal.array, o * 3); uv.set(g.attributes.uv.array, o * 2);
        o += g.attributes.position.count; g.dispose();
      }
      const geo = new THREE.BufferGeometry();
      geo.setAttribute('position', new THREE.BufferAttribute(pos, 3));
      geo.setAttribute('normal', new THREE.BufferAttribute(nrm, 3));
      geo.setAttribute('uv', new THREE.BufferAttribute(uv, 2));
      geo.computeBoundingSphere();
      const mesh = new THREE.Mesh(geo, b.mat);
      mesh.castShadow = b.cast; mesh.receiveShadow = true;
      mesh.matrixAutoUpdate = false; mesh.updateMatrix();
      this.group.add(mesh);
      b.geos = [];
    }
  }
}

// --- water ------------------------------------------------------------------------------------------------------------------------------------
let _waterN = null;
const WATERS = [];
function waterNormals() {
  if (_waterN) return _waterN;
  const N = 256, h = new Float32Array(N * N), r = rng(41);
  const waves = Array.from({ length: 14 }, () => [Math.floor(r() * 6) + 1, Math.floor(r() * 6) - 3, r() * 6.28, 0.3 + r()]);
  for (let y = 0; y < N; y++) for (let x = 0; x < N; x++) {
    let v = 0;
    for (const [kx, ky, ph, a] of waves) v += Math.sin(((x * kx + y * ky) / N) * Math.PI * 2 + ph) * a / Math.hypot(kx, ky);
    h[y * N + x] = v;
  }
  const c = canvas(N, N, (x) => {
    const img = x.createImageData(N, N);
    for (let y = 0; y < N; y++) for (let xx = 0; xx < N; xx++) {
      const dx = h[y * N + ((xx + 1) % N)] - h[y * N + ((xx + N - 1) % N)], dy = h[((y + 1) % N) * N + xx] - h[((y + N - 1) % N) * N + xx];
      const nx = -dx * 2.2, ny = -dy * 2.2, nz = 1, l = Math.hypot(nx, ny, nz), i = (y * N + xx) * 4;
      img.data[i] = (nx / l * 0.5 + 0.5) * 255; img.data[i + 1] = (ny / l * 0.5 + 0.5) * 255; img.data[i + 2] = (nz / l * 0.5 + 0.5) * 255; img.data[i + 3] = 255;
    }
    x.putImageData(img, 0, 0);
  });
  _waterN = tex(c, { linear: true });
  return _waterN;
}
/** Water (a lake, a pool): sunlit ripples drifting across, see-through. size: studs per ripple tile. */
export function waterMaterial(color = 0x2a9ad0, o = {}) {
  const n = waterNormals().clone(); n.needsUpdate = true;
  n.repeat.set(o.repeat?.[0] ?? 8, o.repeat?.[1] ?? 8);
  const m = new THREE.MeshStandardMaterial({ color, roughness: 0.06, metalness: 0.1, transparent: true, opacity: o.opacity ?? 0.84, normalMap: n, normalScale: new THREE.Vector2(0.45, 0.45), depthWrite: false });
  m.userData.flow = o.flow ?? 1;
  WATERS.push(m);
  return m;
}
export function updateWater(t) { for (const m of WATERS) { const n = m.normalMap; n.offset.set(t * 0.011 * m.userData.flow, t * 0.007 * m.userData.flow); } }

/** Reflections of the sky on the shiny things (metals, water, the polished lanes). */
export function applyEnv(renderer, skyTex) {
  if (!skyTex) return;
  const pm = new THREE.PMREMGenerator(renderer);
  const env = pm.fromEquirectangular(skyTex).texture;
  pm.dispose();
  const shiny = { gold: 1, silver: 1, bronze: 0.9, steel: 0.8, darkSteel: 0.6, lane: 0.55, marble: 0.25, tile: 0.4, whiteTile: 0.3 };
  for (const [k, v] of Object.entries(shiny)) { const m = MATS[k]; if (m) { m.envMap = env; m.envMapIntensity = v; m.needsUpdate = true; } }
  for (const m of Object.values(MATS)) if (m.metalness > 0.5 && !m.envMap) { m.envMap = env; m.envMapIntensity = 0.8; m.needsUpdate = true; }
  for (const m of WATERS) { m.envMap = env; m.envMapIntensity = 1.0; m.needsUpdate = true; }
  return env;
}

// --- signs and banners ----------------------------------------------------------------------------------------------------------------------------
/** Text painted on a canvas (for signs, distance boards, banners). */
export function textTex(lines, o = {}) {
  const w = o.w || 512, h = o.h || 256;
  return tex(canvas(w, h, (x) => {
    x.fillStyle = o.bg || '#ffffff'; x.fillRect(0, 0, w, h);
    if (o.border) { x.strokeStyle = o.border; x.lineWidth = o.bw || 12; x.strokeRect(6, 6, w - 12, h - 12); }
    x.fillStyle = o.fg || '#111'; x.textAlign = 'center'; x.textBaseline = 'middle';
    const L = Array.isArray(lines) ? lines : [lines];
    const size = o.size || Math.floor(h / (L.length + 0.6));
    L.forEach((t, i) => { x.font = `${o.weight || 'bold'} ${i === 0 ? size : size * (o.sub || 0.6)}px ${o.font || 'Arial Black, Arial, sans-serif'}`; x.fillText(t, w / 2, h / 2 + (i - (L.length - 1) / 2) * size * 1.05); });
  }), { aniso: 4 });
}
export function planeMesh(w, h, map, o = {}) {
  const m = new THREE.Mesh(new THREE.PlaneGeometry(w, h), new THREE.MeshStandardMaterial({ map, roughness: o.rough ?? 0.6, side: o.double ? THREE.DoubleSide : THREE.FrontSide, transparent: !!o.transparent, emissive: o.emissive ? 0xffffff : 0x000000, emissiveMap: o.emissive ? map : null, emissiveIntensity: o.emissive || 0 }));
  return m;
}
