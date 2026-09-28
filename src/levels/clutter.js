// Clutter & detail scatter system.
//
// scatterClutter(L, box, opts) fills floors (and the bases of walls) inside an
// area with small debris: papers, newspapers, trash, bottles, cans, leaves,
// rubble, glass, casings and blood trails. Everything is visual only (no
// collision, so navigation is untouched) and is merged into a handful of
// chunked meshes that share two materials (an alpha-tested atlas material and
// a soft transparent "decal" material), so a whole chapter of clutter costs a
// few draw calls and never casts shadows.
//
// Placement happens after the collision world and the nav grid exist: items
// are dropped onto real floors with raycasts (never inside walls/furniture or
// on top of cars), `alongWalls` pushes debris against the nearest wall, and
// 3D pieces are kept off the survivor route so the painted guide arrows stay
// readable. Placement is seeded (co-op peers build the same world); density
// scales with QUALITY.clutter.
//
// Other helpers: edgeGrime (soft dirt where floors meet walls), ceilingPipes,
// cables (sagging catenary wires), drips (ceiling water drips emitter).
import * as THREE from 'three';
import { makeRng } from '../core/math.js';
import { F_SOLID } from '../world/collision.js';
import { pipe } from './props.js';

// ---------------------------------------------------------------- atlas --
// 4x4 cells: 0 paper, 1 newspaper, 2 leaf, 3 leaf cluster, 4 glass shards,
// 5 cardboard, 6 can label, 7 wrapper, 8 concrete, 9 brick, 10 plastic bag,
// 11 specks, 12 casing brass, 13 bottle glass, 14 food box, 15 white.
const C = { PAPER: 0, NEWS: 1, LEAF: 2, LEAVES: 3, GLASS: 4, CARD: 5, CAN: 6, WRAP: 7, CONC: 8, BRICK: 9, BAG: 10, SPECK: 11, BRASS: 12, BOTTLE: 13, FOOD: 14, WHITE: 15 };
// Decal atlas (transparent layer): 0 grime edge, 1 blood smear, 2 blood drops,
// 3 blood pool, 4 water stain, 5 oil stain, 6 soot, 7 dust drift.
const D = { GRIME: 0, SMEAR: 1, DROPS: 2, POOL: 3, WATER: 4, OIL: 5, SOOT: 6, DUST: 7 };

let _mats = null;
function materialsFor() {
  if (_mats) return _mats;
  const S = 128, N = 4;
  const rng = makeRng(8181);
  const mk = () => { const c = document.createElement('canvas'); c.width = c.height = S * N; return c; };
  const cv = mk(), g = cv.getContext('2d');
  const cell = (i) => [(i % N) * S, Math.floor(i / N) * S];
  const fill = (i, col) => { const [x, y] = cell(i); g.fillStyle = col; g.fillRect(x + 1, y + 1, S - 2, S - 2); };
  const noise = (i, base, amt, n = 900) => { const [x, y] = cell(i); for (let k = 0; k < n; k++) { const v = (rng() - 0.5) * amt; g.fillStyle = `rgba(${v > 0 ? 255 : 0},${v > 0 ? 255 : 0},${v > 0 ? 255 : 0},${Math.abs(v)})`; g.fillRect(x + rng() * S, y + rng() * S, 1 + rng() * 3, 1 + rng() * 3); } };
  g.clearRect(0, 0, S * N, S * N);
  // paper: off-white with typed lines
  { fill(C.PAPER, '#ebe7dc'); const [x, y] = cell(C.PAPER); g.fillStyle = 'rgba(40,40,50,0.55)'; for (let l = 0; l < 16; l++) { const w = S * (0.5 + rng() * 0.3); g.fillRect(x + 14, y + 16 + l * 6.5, l % 7 === 6 ? w * 0.4 : w, 2); } noise(C.PAPER, 0, 0.08, 300); }
  // newspaper: headline + columns + photo block
  { fill(C.NEWS, '#d8d2c2'); const [x, y] = cell(C.NEWS); g.fillStyle = 'rgba(20,20,20,0.85)'; g.fillRect(x + 8, y + 8, S - 16, 12); g.fillStyle = 'rgba(30,30,30,0.5)'; for (let c = 0; c < 3; c++) for (let l = 0; l < 14; l++) g.fillRect(x + 8 + c * 38, y + 28 + l * 6.5, 32, 2); g.fillStyle = 'rgba(40,40,40,0.6)'; g.fillRect(x + 48, y + 30, 34, 26); }
  // leaves (alpha shapes)
  const leaf = (cx, cy, r, a, col) => { g.save(); g.translate(cx, cy); g.rotate(a); g.fillStyle = col; g.beginPath(); g.moveTo(-r, 0); g.quadraticCurveTo(0, -r * 0.55, r, 0); g.quadraticCurveTo(0, r * 0.55, -r, 0); g.fill(); g.strokeStyle = 'rgba(0,0,0,0.3)'; g.lineWidth = 1; g.beginPath(); g.moveTo(-r, 0); g.lineTo(r, 0); g.stroke(); g.restore(); };
  { const [x, y] = cell(C.LEAF); leaf(x + S / 2, y + S / 2, S * 0.42, 0.3, '#fff'); }
  { const [x, y] = cell(C.LEAVES); for (let k = 0; k < 9; k++) leaf(x + 20 + rng() * (S - 40), y + 20 + rng() * (S - 40), 10 + rng() * 12, rng() * 6, `rgb(${200 + rng() * 55 | 0},${200 + rng() * 55 | 0},${200 + rng() * 55 | 0})`); }
  // glass shards (alpha)
  { const [x, y] = cell(C.GLASS); for (let k = 0; k < 14; k++) { g.fillStyle = `rgba(${210 + rng() * 45 | 0},${225 + rng() * 30 | 0},255,1)`; g.beginPath(); const cx = x + 10 + rng() * (S - 20), cy = y + 10 + rng() * (S - 20), r = 3 + rng() * 11; for (let v = 0; v < 3 + (rng() * 2 | 0); v++) { const a = v * 2.1 + rng(); v ? g.lineTo(cx + Math.cos(a) * r, cy + Math.sin(a) * r) : g.moveTo(cx + Math.cos(a) * r, cy + Math.sin(a) * r); } g.fill(); } }
  // cardboard
  { fill(C.CARD, '#a88a5e'); const [x, y] = cell(C.CARD); g.fillStyle = 'rgba(80,60,30,0.25)'; for (let l = 0; l < S; l += 5) g.fillRect(x + l, y + 1, 2, S - 2); g.fillStyle = 'rgba(30,30,30,0.6)'; g.fillRect(x + 30, y + 50, 60, 8); noise(C.CARD, 0, 0.15, 300); }
  // can label: red with white band
  { fill(C.CAN, '#b8231a'); const [x, y] = cell(C.CAN); g.fillStyle = '#eeeeee'; g.fillRect(x + 1, y + 50, S - 2, 20); g.fillStyle = '#999'; g.fillRect(x + 1, y + 1, S - 2, 10); g.fillRect(x + 1, y + S - 11, S - 2, 10); }
  // wrapper: shiny colour blocks
  { const [x, y] = cell(C.WRAP); for (let k = 0; k < 4; k++) { g.fillStyle = ['#d8b020', '#2a5ab8', '#c83020', '#e8e8e0'][k]; g.fillRect(x + 1, y + 1 + k * 32, S - 2, 32); } noise(C.WRAP, 0, 0.3, 400); }
  // concrete / brick chunks
  { fill(C.CONC, '#8a8680'); noise(C.CONC, 0, 0.35, 1400); }
  { fill(C.BRICK, '#8a4a36'); noise(C.BRICK, 0, 0.35, 1200); }
  // plastic bag: pale crinkles
  { fill(C.BAG, '#dcdcd6'); const [x, y] = cell(C.BAG); g.strokeStyle = 'rgba(0,0,0,0.18)'; for (let k = 0; k < 20; k++) { g.beginPath(); g.moveTo(x + rng() * S, y + rng() * S); g.lineTo(x + rng() * S, y + rng() * S); g.stroke(); } }
  // specks: cigarette butts & grit (alpha)
  { const [x, y] = cell(C.SPECK); for (let k = 0; k < 60; k++) { const w = 2 + rng() * 5; g.fillStyle = rng() < 0.3 ? '#e8e0c8' : `rgba(${60 + rng() * 60 | 0},${55 + rng() * 50 | 0},${50 + rng() * 40 | 0},1)`; g.fillRect(x + rng() * (S - 8), y + rng() * (S - 8), w, rng() < 0.3 ? 2 : w); } }
  fill(C.BRASS, '#c8a050');
  { fill(C.BOTTLE, '#ffffff'); const [x, y] = cell(C.BOTTLE); g.fillStyle = 'rgba(255,255,255,0.0)'; g.fillStyle = '#e8e0c0'; g.fillRect(x + 1, y + 50, S - 2, 34); }
  { fill(C.FOOD, '#e8e4dc'); const [x, y] = cell(C.FOOD); g.fillStyle = '#c83020'; g.fillRect(x + 1, y + 1, S - 2, 30); g.fillStyle = '#e8c020'; g.beginPath(); g.arc(x + S / 2, y + 70, 22, 0, 7); g.fill(); }
  fill(C.WHITE, '#ffffff');
  const tex = new THREE.CanvasTexture(cv);
  tex.colorSpace = THREE.SRGBColorSpace;
  tex.anisotropy = 4;
  const solid = new THREE.MeshStandardMaterial({ map: tex, vertexColors: true, alphaTest: 0.45, side: THREE.DoubleSide, roughness: 0.85, metalness: 0.0 });
  solid.name = 'clutter';
  // soft transparent decal layer
  const dv = mk(), d = dv.getContext('2d');
  d.clearRect(0, 0, S * N, S * N);
  const dcell = (i) => [(i % N) * S, Math.floor(i / N) * S];
  { // grime: gradient from the wall (v=0 at wall, fades toward v=1), soft irregular
    const [x, y] = dcell(D.GRIME);
    for (let py = 0; py < S; py++) { const a = Math.pow(1 - py / S, 1.8) * 0.9; d.fillStyle = `rgba(255,255,255,${a})`; d.fillRect(x, y + py, S, 1); }
    d.globalCompositeOperation = 'destination-out';
    for (let k = 0; k < 90; k++) { d.fillStyle = `rgba(0,0,0,${rng() * 0.35})`; d.beginPath(); d.arc(x + rng() * S, y + rng() * S, 2 + rng() * 10, 0, 7); d.fill(); }
    d.globalCompositeOperation = 'source-over';
  }
  const blob = (i, n, rmin, rmax, alpha, spread = 0.35) => { const [x, y] = dcell(i); for (let k = 0; k < n; k++) { const cx = x + S / 2 + (rng() - 0.5) * S * spread * 2, cy = y + S / 2 + (rng() - 0.5) * S * spread * 2, r = rmin + rng() * (rmax - rmin); const gr = d.createRadialGradient(cx, cy, 0, cx, cy, r); gr.addColorStop(0, `rgba(255,255,255,${alpha})`); gr.addColorStop(0.7, `rgba(255,255,255,${alpha * 0.8})`); gr.addColorStop(1, 'rgba(255,255,255,0)'); d.fillStyle = gr; d.fillRect(cx - r, cy - r, r * 2, r * 2); } };
  { // smear: streaky drag marks along u
    const [x, y] = dcell(D.SMEAR);
    for (let k = 0; k < 16; k++) { const yy = y + S * 0.3 + rng() * S * 0.4; const gr = d.createLinearGradient(x, 0, x + S, 0); gr.addColorStop(0, 'rgba(255,255,255,0)'); gr.addColorStop(0.2 + rng() * 0.2, `rgba(255,255,255,${0.35 + rng() * 0.4})`); gr.addColorStop(0.9, `rgba(255,255,255,${0.1 + rng() * 0.2})`); gr.addColorStop(1, 'rgba(255,255,255,0)'); d.fillStyle = gr; d.fillRect(x, yy, S, 1 + rng() * 5); }
    blob(D.SMEAR, 4, 6, 16, 0.6, 0.2);
  }
  blob(D.DROPS, 14, 2, 8, 0.95, 0.42);
  blob(D.POOL, 10, 16, 40, 0.95, 0.18);
  { const [x, y] = dcell(D.WATER); blob(D.WATER, 8, 18, 44, 0.35, 0.2); d.strokeStyle = 'rgba(255,255,255,0.4)'; d.lineWidth = 2; d.beginPath(); d.ellipse(x + S / 2, y + S / 2, S * 0.4, S * 0.3, 0.3, 0, 7); d.stroke(); }
  blob(D.OIL, 12, 10, 36, 0.8, 0.22);
  blob(D.SOOT, 24, 8, 30, 0.45, 0.35);
  blob(D.DUST, 30, 6, 24, 0.3, 0.4);
  const dtex = new THREE.CanvasTexture(dv);
  dtex.colorSpace = THREE.SRGBColorSpace;
  const decal = new THREE.MeshStandardMaterial({ map: dtex, vertexColors: true, transparent: true, depthWrite: false, roughness: 0.4, metalness: 0, polygonOffset: true, polygonOffsetFactor: -2, polygonOffsetUnits: -2 });
  decal.name = 'clutterDecal';
  _mats = { solid, decal };
  return _mats;
}
const cellRect = (i) => { const u0 = (i % 4) / 4, v1 = 1 - Math.floor(i / 4) / 4; const e = 1.5 / 512; return [u0 + e, v1 - 0.25 + e, u0 + 0.25 - e, v1 - e]; };

// ----------------------------------------------------------- templates --
const TPL = {};
function tpl(name) {
  if (TPL[name]) return TPL[name];
  let g;
  switch (name) {
    case 'plane': g = new THREE.PlaneGeometry(1, 1).rotateX(-Math.PI / 2); break;
    case 'box': g = new THREE.BoxGeometry(1, 1, 1); break;
    case 'cyl': g = new THREE.CylinderGeometry(0.5, 0.5, 1, 8, 1); break;
    case 'cyl5': g = new THREE.CylinderGeometry(0.5, 0.5, 1, 5, 1); break;
    case 'rock': g = new THREE.IcosahedronGeometry(0.5, 0); break;
    case 'blob': g = new THREE.IcosahedronGeometry(0.5, 1); break;
    case 'bottle': g = new THREE.LatheGeometry([[0, -0.5], [0.4, -0.5], [0.42, -0.45], [0.42, 0.08], [0.3, 0.22], [0.13, 0.3], [0.12, 0.5], [0, 0.5]].map(([a, b]) => new THREE.Vector2(a, b)), 7); break;
    case 'wall': g = new THREE.PlaneGeometry(1, 1); break; // vertical, faces +Z
    case 'strip': g = new THREE.PlaneGeometry(1, 1, 4, 1).rotateX(-Math.PI / 2); break;
    case 'wallstrip': g = new THREE.PlaneGeometry(1, 1, 4, 1); break;
  }
  const pos = g.attributes.position, nor = g.attributes.normal, uv = g.attributes.uv;
  const idx = g.index ? Array.from(g.index.array) : Array.from({ length: pos.count }, (_, i) => i);
  // strips fade out at both ends (vertex alpha)
  const fade = name.endsWith('strip') ? Array.from({ length: pos.count }, (_, i) => { const u = uv.getX(i); return Math.min(1, u * 4, (1 - u) * 4); }) : null;
  TPL[name] = { pos: Array.from(pos.array), nor: Array.from(nor.array), uv: Array.from(uv.array), idx, n: pos.count, fade };
  return TPL[name];
}
class Chunk {
  constructor() { this.pos = []; this.nor = []; this.uv = []; this.col = []; this.idx = []; this.n = 0; }
  add(name, m, rect, color, alpha = 1) {
    const t = tpl(name);
    const e = m.elements;
    const base = this.n;
    const [u0, v0, u1, v1] = rect;
    for (let i = 0; i < t.n; i++) {
      const x = t.pos[i * 3], y = t.pos[i * 3 + 1], z = t.pos[i * 3 + 2];
      this.pos.push(e[0] * x + e[4] * y + e[8] * z + e[12], e[1] * x + e[5] * y + e[9] * z + e[13], e[2] * x + e[6] * y + e[10] * z + e[14]);
      const nx = t.nor[i * 3], ny = t.nor[i * 3 + 1], nz = t.nor[i * 3 + 2];
      // (uniform-ish scales; normalise after rotation)
      let ax = e[0] * nx + e[4] * ny + e[8] * nz, ay = e[1] * nx + e[5] * ny + e[9] * nz, az = e[2] * nx + e[6] * ny + e[10] * nz;
      const l = Math.hypot(ax, ay, az) || 1;
      this.nor.push(ax / l, ay / l, az / l);
      this.uv.push(u0 + t.uv[i * 2] * (u1 - u0), v0 + t.uv[i * 2 + 1] * (v1 - v0));
      this.col.push(color[0], color[1], color[2], t.fade ? alpha * t.fade[i] : alpha);
    }
    for (const k of t.idx) this.idx.push(base + k);
    this.n += t.n;
  }
  mesh(mat) {
    const g = new THREE.BufferGeometry();
    g.setAttribute('position', new THREE.Float32BufferAttribute(this.pos, 3));
    g.setAttribute('normal', new THREE.Float32BufferAttribute(this.nor, 3));
    g.setAttribute('uv', new THREE.Float32BufferAttribute(this.uv, 2));
    g.setAttribute('color', new THREE.Float32BufferAttribute(this.col, 4));
    g.setIndex(this.n > 65000 ? new THREE.Uint32BufferAttribute(this.idx, 1) : new THREE.Uint16BufferAttribute(this.idx, 1));
    g.computeBoundingSphere();
    const m = new THREE.Mesh(g, mat);
    m.castShadow = false;
    m.receiveShadow = true;
    m.matrixAutoUpdate = false;
    return m;
  }
}

// ------------------------------------------------------------ per level --
// Each level gets one clutter context: queued jobs are run once the collision
// world + nav exist (from finalize), results merged into chunk meshes.
function ctx(L) {
  if (L._clutter) return L._clutter;
  const c = { jobs: [], built: false, solid: new Map(), decal: new Map(), route: null };
  L._clutter = c;
  L.postBuild = L.postBuild || [];
  L.postBuild.push(() => {
    const willArrows = L.flowStart && L.flowEnd && L.def?.guideArrows !== false;
    if (!willArrows) { runJobs(L, c); return; }
    // run right after the nav grid + route fields exist (before the arrows)
    const orig = L.placeGuideArrows;
    L.placeGuideArrows = function (...a) {
      if (!c.built) { try { runJobs(L, c); } catch (e) { console.error('[clutter]', e); } }
      L.placeGuideArrows = orig;
      return orig.apply(this, a);
    };
  });
  return c;
}
const CH = 32; // chunk size (m)
function chunkOf(map, x, y, z) {
  const k = Math.floor(x / CH) + ',' + Math.floor(y / 9) + ',' + Math.floor(z / CH);
  let ch = map.get(k);
  if (!ch) { ch = new Chunk(); map.set(k, ch); }
  return ch;
}
// Survivor route (flowStart -> flowEnd along the toExit field) as a coarse point list.
function routeOf(L) {
  const nav = L.nav, f = nav?.fields?.toExit;
  if (!nav || !f || !L.flowStart) return null;
  let n = nav.nearestNode(L.flowStart[0], L.flowStart[1], L.flowStart[2], 3);
  if (n < 0 || f[n] >= 1e8) return null;
  const pts = [];
  const grid = new Map();
  for (let i = 0; i < 40000; i++) {
    const x = nav.nodeX(n), y = nav.nodeY[n], z = nav.nodeZ(n);
    const k = Math.floor(x) + ',' + Math.floor(z);
    if (!grid.has(k)) grid.set(k, []);
    grid.get(k).push(y);
    pts.push(x, y, z);
    const m = nav.descend(f, n);
    if (m < 0) break;
    n = m;
  }
  return { grid, pts };
}
// true if (x, y, z) is within r (<= 1.5) of the route
function nearRoute(route, x, y, z, r = 1.0) {
  if (!route) return false;
  const x0 = Math.floor(x - r), x1 = Math.floor(x + r), z0 = Math.floor(z - r), z1 = Math.floor(z + r);
  for (let gx = x0; gx <= x1; gx++) for (let gz = z0; gz <= z1; gz++) {
    const ys = route.grid.get(gx + ',' + gz);
    if (!ys) continue;
    for (const yy of ys) if (Math.abs(yy - y) < 1.2) {
      // cell centre distance (cheap) — cells are 1 m
      const cx = gx + 0.5, cz = gz + 0.5;
      if ((cx - x) ** 2 + (cz - z) ** 2 <= (r + 0.7) ** 2) return true;
    }
  }
  return false;
}
function runJobs(L, c) {
  c.built = true;
  c.route = routeOf(L);
  for (const j of c.jobs) j(c);
  c.jobs.length = 0;
  const { solid, decal } = materialsFor();
  let tris = 0, meshes = 0;
  for (const ch of c.solid.values()) if (ch.n) { const m = ch.mesh(solid); m.name = 'clutter'; m.renderOrder = 0; L.addObject(m); tris += ch.idx.length / 3; meshes++; }
  for (const ch of c.decal.values()) if (ch.n) { const m = ch.mesh(decal); m.name = 'clutterDecal'; m.renderOrder = 1; L.addObject(m); tris += ch.idx.length / 3; meshes++; }
  L.clutterStats = { tris, meshes };
  c.solid.clear(); c.decal.clear();
}

// ------------------------------------------------------------- placement --
const _m = new THREE.Matrix4(), _q = new THREE.Quaternion(), _e = new THREE.Euler(), _p = new THREE.Vector3(), _s = new THREE.Vector3();
function M(x, y, z, rx, ry, rz, sx, sy, sz) { _e.set(rx, ry, rz, 'YXZ'); _q.setFromEuler(_e); return _m.compose(_p.set(x, y, z), _q, _s.set(sx, sy, sz)); }
const hex = (h) => { const c = new THREE.Color(h); return [c.r, c.g, c.b]; };
const mul = (a, k) => [a[0] * k, a[1] * k, a[2] * k];

function floorAt(col, x, yTop, z, y0, tol) {
  const h = col.raycast(x, yTop, z, 0, -1, 0, yTop - y0 + tol + 0.4, F_SOLID);
  if (!h || h.t < 0.02 || h.ny < 0.9) return null;
  if (Math.abs(h.y - y0) > tol) return null;
  return h.y;
}
function nearestWall(col, x, y, z, maxD = 2.2) {
  let best = null;
  for (const [dx, dz] of [[1, 0], [-1, 0], [0, 1], [0, -1]]) {
    const h = col.raycast(x, y, z, dx, 0, dz, maxD, F_SOLID);
    if (h && h.t > 0.05 && (!best || h.t < best.t)) best = { t: h.t, x: h.x, z: h.z, nx: h.nx, nz: h.nz, dx, dz };
  }
  return best;
}

const DEFAULT_KINDS = ['papers', 'trash', 'cans', 'bottles', 'rubble'];
const WEIGHT = { papers: 1.4, newspapers: 0.5, trash: 1.2, bottles: 0.5, cans: 0.8, leaves: 1.6, rubble: 1.0, glass: 0.7, casings: 0.5, bloodtrail: 0.06, grime: 0.3, water: 0.15, oil: 0.1, soot: 0.15 };

// box: [x0, y0, z0, x1, y1, z1] (y0 = floor level, y1 = probe height, default y0 + 1.6)
// or {x0, z0, x1, z1, y}. opts: {density = 1, kinds, seed, alongWalls (bool or 0..1
// fraction), tint (dust colour multiplier), avoid: [[x0,z0,x1,z1], ...], route (keep 3D
// pieces off the survivor route, default true), tol (floor height tolerance)}
export function scatterClutter(L, box, opts = {}) {
  const b = Array.isArray(box) ? box : [box.x0, box.y ?? 0, box.z0, box.x1, (box.y ?? 0) + 1.6, box.z1];
  let [x0, y0, z0, x1, y1, z1] = b;
  if (x0 > x1) [x0, x1] = [x1, x0];
  if (z0 > z1) [z0, z1] = [z1, z0];
  if (y1 == null || y1 <= y0) y1 = y0 + 1.6;
  const q = L.game?.quality?.clutter ?? 1;
  const c = ctx(L);
  const seed = opts.seed ?? Math.floor((x0 * 73856093) ^ (z0 * 19349663) ^ (y0 * 83492791)) >>> 0;
  c.jobs.push(() => {
    const rng = makeRng(seed || 1);
    const col = L.col;
    const kinds = (opts.kinds || DEFAULT_KINDS).filter((k) => WEIGHT[k] != null);
    if (!kinds.length) return;
    const wsum = kinds.reduce((s, k) => s + WEIGHT[k], 0);
    const pickKind = () => { let r = rng() * wsum; for (const k of kinds) { r -= WEIGHT[k]; if (r <= 0) return k; } return kinds[0]; };
    const area = (x1 - x0) * (z1 - z0);
    const n = Math.min(3000, Math.round(area * 0.3 * (opts.density ?? 1) * q));
    const wallFrac = opts.alongWalls === true ? 0.65 : typeof opts.alongWalls === 'number' ? opts.alongWalls : 0;
    const tol = opts.tol ?? 0.35;
    const avoid = opts.avoid || [];
    const useRoute = opts.route !== false;
    const dust = opts.tint ?? 1;
    const S = { L, c, rng, dust };
    for (let i = 0; i < n; i++) {
      let x = x0 + rng() * (x1 - x0), z = z0 + rng() * (z1 - z0);
      let wall = null;
      const kind = pickKind();
      const wallish = kind === 'rubble' || kind === 'leaves' || kind === 'trash' || kind === 'grime' || kind === 'bottles';
      if (wallFrac > 0 && rng() < (wallish ? Math.min(1, wallFrac * 1.3) : wallFrac * 0.6)) {
        wall = nearestWall(col, x, y0 + 0.25, z);
        if (wall) {
          const off = 0.06 + rng() * rng() * 0.6;
          x = wall.x + wall.nx * off + (wall.nx ? 0 : (rng() - 0.5) * 0.3);
          z = wall.z + wall.nz * off + (wall.nz ? 0 : (rng() - 0.5) * 0.3);
          if (x < x0 || x > x1 || z < z0 || z > z1) continue;
        }
      }
      if (avoid.some((a) => x > a[0] && x < a[2] && z > a[1] && z < a[3])) continue;
      const fy = floorAt(col, x, y1, z, y0, tol);
      if (fy == null) continue;
      const on3D = kind !== 'papers' && kind !== 'newspapers' && kind !== 'leaves' && kind !== 'glass' && kind !== 'bloodtrail' && kind !== 'grime' && kind !== 'water' && kind !== 'oil' && kind !== 'soot';
      if (on3D && useRoute && !wall && nearRoute(c.route, x, fy, z, 0.9)) continue;
      ITEM[kind](S, x, fy, z, wall);
    }
  });
}

// --------------------------------------------------------------- items --
const PAPER_T = [0xb8b4a8, 0xa8a498, 0xb0a888, 0x9c988c, 0xc0c0b8, 0x98a0a8, 0x8a8478];
const ITEM = {
  papers(S, x, y, z) {
    const { rng, c } = S;
    const ch = chunkOf(c.solid, x, y, z);
    const t = mul(hex(PAPER_T[Math.floor(rng() * PAPER_T.length)]), (0.55 + rng() * 0.3) * S.dust);
    const n = 1 + Math.floor(rng() * rng() * 4);
    for (let k = 0; k < n; k++) {
      const px = x + (rng() - 0.5) * 0.8, pz = z + (rng() - 0.5) * 0.8, a = rng() * 6.28;
      if (rng() < 0.25) { ch.add('rock', M(px, y + 0.03, pz, rng() * 3, a, rng() * 3, 0.07, 0.06, 0.08), cellRect(C.PAPER), t); continue; } // crumpled
      const curl = (rng() - 0.5) * 0.25;
      ch.add('plane', M(px, y + 0.016 + k * 0.002, pz, curl, a, (rng() - 0.5) * 0.1, 0.21, 1, 0.29), cellRect(C.PAPER), t);
    }
  },
  newspapers(S, x, y, z) {
    const { rng, c } = S;
    const ch = chunkOf(c.solid, x, y, z);
    const t = mul(hex(0xb8b2a2), (0.55 + rng() * 0.25) * S.dust);
    const a = rng() * 6.28;
    if (rng() < 0.5) { // folded open, tented
      ch.add('plane', M(x, y + 0.03, z, 0.25, a, 0, 0.38, 1, 0.3), cellRect(C.NEWS), t);
      ch.add('plane', M(x + Math.sin(a) * 0.28, y + 0.03, z + Math.cos(a) * 0.28, -0.25, a, 0, 0.38, 1, 0.3), cellRect(C.NEWS), t);
    } else for (let k = 0; k < 3; k++) ch.add('plane', M(x + (rng() - 0.5) * 0.9, y + 0.017 + k * 0.002, z + (rng() - 0.5) * 0.9, 0, rng() * 6.28, 0, 0.38, 1, 0.58), cellRect(C.NEWS), t);
  },
  trash(S, x, y, z) {
    const { rng, c } = S;
    const ch = chunkOf(c.solid, x, y, z);
    const r = rng();
    const d = S.dust;
    if (r < 0.25) { // plastic bag blob
      const col = rng() < 0.6 ? [0.02, 0.02, 0.025] : mul(hex(0xdcdcd6), 0.8 * d);
      ch.add('blob', M(x, y + 0.08, z, 0, rng() * 6, 0, 0.3 + rng() * 0.2, 0.16 + rng() * 0.08, 0.3), cellRect(C.BAG), col);
    } else if (r < 0.45) { // flattened cardboard
      const a = rng() * 6.28;
      ch.add('box', M(x, y + 0.02, z, (rng() - 0.5) * 0.1, a, 0, 0.4 + rng() * 0.4, 0.015, 0.3 + rng() * 0.3), cellRect(C.CARD), mul([1, 1, 1], 0.9 * d));
    } else if (r < 0.6) { // food box / cup
      if (rng() < 0.5) ch.add('box', M(x, y + 0.04, z, 0, rng() * 6, rng() < 0.4 ? 1.57 : 0, 0.14, 0.08, 0.12), cellRect(C.FOOD), mul([1, 1, 1], 0.9 * d));
      else ch.add('cyl', M(x, y + 0.04, z, 0, rng() * 6, 1.57, 0.08, 0.12, 0.08), cellRect(C.WHITE), mul([0.9, 0.88, 0.84], d));
    } else if (r < 0.8) { // wrappers
      for (let k = 0; k < 3; k++) ch.add('plane', M(x + (rng() - 0.5) * 0.5, y + 0.018, z + (rng() - 0.5) * 0.5, (rng() - 0.5) * 0.4, rng() * 6, 0, 0.1 + rng() * 0.1, 1, 0.08 + rng() * 0.08), cellRect(C.WRAP), mul([1, 1, 1], 0.85 * d));
    } else { // grit & cigarette butts
      ch.add('plane', M(x, y + 0.015, z, 0, rng() * 6, 0, 0.6, 1, 0.6), cellRect(C.SPECK), mul([1, 1, 1], 0.8 * d));
    }
  },
  bottles(S, x, y, z) {
    const { rng, c } = S;
    const ch = chunkOf(c.solid, x, y, z);
    const col = [[0.1, 0.25, 0.08], [0.25, 0.12, 0.03], [0.55, 0.6, 0.55], [0.08, 0.14, 0.2]][Math.floor(rng() * 4)];
    const n = 1 + (rng() < 0.3 ? 1 + Math.floor(rng() * 2) : 0);
    for (let k = 0; k < n; k++) {
      const px = x + (rng() - 0.5) * 0.5, pz = z + (rng() - 0.5) * 0.5, a = rng() * 6.28;
      if (rng() < 0.7) ch.add('bottle', M(px, y + 0.037, pz, 0, a, 1.57, 0.075, 0.26, 0.075), cellRect(C.BOTTLE), col); // lying
      else ch.add('bottle', M(px, y + 0.13, pz, 0, a, 0, 0.075, 0.26, 0.075), cellRect(C.BOTTLE), col);
    }
    if (rng() < 0.3) for (let k = 0; k < 6; k++) ch.add('plane', M(x + (rng() - 0.5) * 0.4, y + 0.014, z + (rng() - 0.5) * 0.4, 0, rng() * 6, 0, 0.06, 1, 0.05), cellRect(C.GLASS), mul(col, 2.2));
  },
  cans(S, x, y, z) {
    const { rng, c } = S;
    const ch = chunkOf(c.solid, x, y, z);
    const tints = [[1, 1, 1], [0.3, 0.45, 1.2], [0.3, 1.0, 0.35], [1.1, 1.0, 0.3], [0.5, 0.5, 0.5]];
    const n = 1 + (rng() < 0.4 ? 1 + Math.floor(rng() * 3) : 0);
    for (let k = 0; k < n; k++) {
      const t = tints[Math.floor(rng() * tints.length)];
      const px = x + (rng() - 0.5) * 0.6, pz = z + (rng() - 0.5) * 0.6;
      const crushed = rng() < 0.35;
      if (crushed) ch.add('cyl', M(px, y + 0.02, pz, 0, rng() * 6, 0, 0.075, 0.04, 0.07), cellRect(C.CAN), mul(t, S.dust));
      else ch.add('cyl', M(px, y + 0.034, pz, 0, rng() * 6, 1.57, 0.066, 0.122, 0.066), cellRect(C.CAN), mul(t, S.dust));
    }
  },
  leaves(S, x, y, z) {
    const { rng, c } = S;
    const ch = chunkOf(c.solid, x, y, z);
    const n = 3 + Math.floor(rng() * 6);
    for (let k = 0; k < n; k++) {
      const hue = rng();
      const col = hue < 0.4 ? [0.35, 0.22, 0.08] : hue < 0.7 ? [0.45, 0.28, 0.06] : hue < 0.85 ? [0.2, 0.22, 0.08] : [0.25, 0.12, 0.05];
      const cluster = rng() < 0.3;
      const s = cluster ? 0.35 + rng() * 0.3 : 0.08 + rng() * 0.06;
      ch.add('plane', M(x + (rng() - 0.5) * 1.0, y + 0.015 + k * 0.001, z + (rng() - 0.5) * 1.0, (rng() - 0.5) * 0.3, rng() * 6.28, (rng() - 0.5) * 0.3, s, 1, s), cellRect(cluster ? C.LEAVES : C.LEAF), mul(col, S.dust));
    }
  },
  rubble(S, x, y, z, wall) {
    const { rng, c } = S;
    const ch = chunkOf(c.solid, x, y, z);
    const brick = rng() < 0.3;
    const base = brick ? [0.95, 0.9, 0.85] : [0.95, 0.93, 0.9];
    const n = 2 + Math.floor(rng() * (wall ? 7 : 4));
    for (let k = 0; k < n; k++) {
      const s = (rng() < 0.15 ? 0.14 + rng() * 0.18 : 0.03 + rng() * 0.08);
      const px = x + (rng() - 0.5) * 0.7, pz = z + (rng() - 0.5) * 0.7;
      const k2 = 0.75 + rng() * 0.35;
      if (brick && rng() < 0.5) ch.add('box', M(px, y + s * 0.3, pz, rng() * 0.3, rng() * 6, rng() * 0.3, s * 2.1, s * 0.62, s), cellRect(C.BRICK), mul(base, k2 * S.dust));
      else ch.add('rock', M(px, y + s * 0.3, pz, rng() * 3, rng() * 6, rng() * 3, s * (1 + rng()), s * (0.5 + rng() * 0.4), s * (1 + rng() * 0.6)), cellRect(brick ? C.BRICK : C.CONC), mul(base, k2 * S.dust));
    }
    // fine grit + dust drift
    ch.add('plane', M(x, y + 0.013, z, 0, rng() * 6, 0, 0.7, 1, 0.7), cellRect(C.SPECK), mul([0.8, 0.78, 0.75], S.dust));
    const dch = chunkOf(c.decal, x, y, z);
    dch.add('plane', M(x, y + 0.012, z, 0, rng() * 6, 0, 1.0 + rng(), 1, 0.8 + rng()), cellRect(D.DUST), [0.55, 0.53, 0.5], 0.8);
  },
  glass(S, x, y, z) {
    const { rng, c } = S;
    const ch = chunkOf(c.solid, x, y, z);
    const n = 2 + Math.floor(rng() * 4);
    for (let k = 0; k < n; k++) {
      const s = 0.15 + rng() * 0.3;
      ch.add('plane', M(x + (rng() - 0.5) * 0.9, y + 0.014 + k * 0.0008, z + (rng() - 0.5) * 0.9, (rng() - 0.5) * 0.08, rng() * 6.28, (rng() - 0.5) * 0.08, s, 1, s), cellRect(C.GLASS), [0.55, 0.62, 0.66]);
    }
  },
  casings(S, x, y, z) {
    const { rng, c } = S;
    const ch = chunkOf(c.solid, x, y, z);
    const n = 4 + Math.floor(rng() * 10);
    const shotgun = rng() < 0.25;
    for (let k = 0; k < n; k++) {
      const a = rng() * 6.28, d = rng() * 0.8;
      if (shotgun) ch.add('cyl', M(x + Math.cos(a) * d, y + 0.011, z + Math.sin(a) * d, 0, rng() * 6, 1.57, 0.022, 0.065, 0.022), cellRect(C.WHITE), rng() < 0.5 ? [0.55, 0.06, 0.04] : [0.1, 0.18, 0.4]);
      else ch.add('cyl5', M(x + Math.cos(a) * d, y + 0.005, z + Math.sin(a) * d, 0, rng() * 6, 1.57, 0.01, 0.028, 0.01), cellRect(C.BRASS), [1.1, 0.95, 0.7]);
    }
  },
  bloodtrail(S, x, y, z) {
    const { rng, c, L } = S;
    let a = rng() * 6.28;
    const n = 4 + Math.floor(rng() * 9);
    let px = x, pz = z;
    for (let k = 0; k < n; k++) {
      const fy = floorAt(L.col, px, y + 0.5, pz, y, 0.2);
      if (fy == null) break;
      const dch = chunkOf(c.decal, px, fy, pz);
      const dark = 0.55 + rng() * 0.45;
      dch.add('plane', M(px, fy + 0.013 + k * 0.0005, pz, 0, a, 0, 0.55 + rng() * 0.25, 1, 0.28 + rng() * 0.15), cellRect(k === 0 && rng() < 0.5 ? D.POOL : D.SMEAR), [0.16 * dark, 0.012, 0.008], 0.85);
      if (rng() < 0.4) dch.add('plane', M(px + (rng() - 0.5) * 0.4, fy + 0.0135, pz + (rng() - 0.5) * 0.4, 0, rng() * 6, 0, 0.25, 1, 0.25), cellRect(D.DROPS), [0.14, 0.01, 0.007], 0.9);
      a += (rng() - 0.5) * 0.7;
      const nx = px + Math.cos(a) * 0.42, nz = pz - Math.sin(a) * 0.42;
      if (L.col.raycast(px, fy + 0.2, pz, Math.cos(a), 0, -Math.sin(a), 0.5, F_SOLID)) break;
      px = nx; pz = nz;
    }
  },
  grime(S, x, y, z) { stain(S, x, y, z, D.SOOT, [0.05, 0.045, 0.04], 0.7, 1.2); },
  water(S, x, y, z) { stain(S, x, y, z, D.WATER, [0.12, 0.12, 0.11], 0.6, 1.6); },
  oil(S, x, y, z) { stain(S, x, y, z, D.OIL, [0.02, 0.02, 0.025], 0.85, 1.2); },
  soot(S, x, y, z) { stain(S, x, y, z, D.SOOT, [0.02, 0.018, 0.016], 0.8, 2.0); },
};
function stain(S, x, y, z, cellId, col, alpha, size) {
  const { rng, c } = S;
  const dch = chunkOf(c.decal, x, y, z);
  const s = size * (0.6 + rng() * 0.8);
  dch.add('plane', M(x, y + 0.012, z, 0, rng() * 6.28, 0, s, 1, s * (0.6 + rng() * 0.6)), cellRect(cellId), col, alpha);
}

// Soft dirt where the floor meets the walls inside a rectangle: strips on the
// floor and up the wall base, found by raycasting (so doorways stay clean).
// opts: {y (floor), strength 0..1, width (m), height (m on the wall), step, seed}
export function edgeGrime(L, x0, z0, x1, z1, y, opts = {}) {
  const c = ctx(L);
  c.jobs.push(() => {
    const col = L.col;
    const rng = makeRng(opts.seed ?? ((x0 * 131 + z0 * 71 + y * 17) >>> 0) + 3);
    const step = opts.step ?? 0.6, w = opts.width ?? 0.45, h = opts.height ?? 0.35;
    const k = opts.strength ?? 0.7;
    const tint = opts.color ? hex(opts.color) : [0.04, 0.035, 0.03];
    const sides = [
      { from: [x0, z0], to: [x1, z0], dir: [0, -1] }, { from: [x0, z1], to: [x1, z1], dir: [0, 1] },
      { from: [x0, z0], to: [x0, z1], dir: [-1, 0] }, { from: [x1, z0], to: [x1, z1], dir: [1, 0] },
    ];
    for (const sd of sides) {
      const len = Math.hypot(sd.to[0] - sd.from[0], sd.to[1] - sd.from[1]);
      const n = Math.max(1, Math.floor(len / step));
      let run = null;
      const flush = () => {
        if (!run || run.n < 1) { run = null; return; }
        const { ax, az, bx, bz, fx, fz, fy } = run;
        const L2 = Math.hypot(bx - ax, bz - az) + step;
        const cx = (ax + bx) / 2, cz = (az + bz) / 2;
        const dch = chunkOf(c.decal, cx, fy, cz);
        // floor strip: v=0 at the wall
        const nx = -fx, nz = -fz; // into the room
        const ang = Math.atan2(nx, nz);
        dch.add('strip', M(cx + nx * w / 2, fy + 0.011, cz + nz * w / 2, 0, ang, 0, L2, 1, w), cellRect(D.GRIME), tint, k);
        // wall strip (vertical, faces into the room)
        dch.add('wallstrip', M(cx + nx * 0.012, fy + h / 2, cz + nz * 0.012, 0, ang, Math.PI, L2, h, 1), cellRect(D.GRIME), tint, k * 0.85);
        run = null;
      };
      for (let i = 0; i <= n; i++) {
        const t = (i + 0.5) / (n + 1);
        const px = sd.from[0] + (sd.to[0] - sd.from[0]) * t, pz = sd.from[1] + (sd.to[1] - sd.from[1]) * t;
        // start a bit inside and look toward the wall
        const sx = px - sd.dir[0] * 0.9, sz = pz - sd.dir[1] * 0.9;
        const fy = floorAt(col, sx, y + 1.2, sz, y, 0.25);
        const hit = fy != null ? col.raycast(sx, fy + 0.12, sz, sd.dir[0], 0, sd.dir[1], 1.6, F_SOLID) : null;
        if (!hit || hit.t < 0.05) { flush(); continue; }
        const wx = hit.x, wz = hit.z;
        if (run && Math.abs((sd.dir[0] ? wx : wz) - (sd.dir[0] ? run.bx : run.bz)) < 0.06 && Math.abs(fy - run.fy) < 0.05) { run.bx = wx; run.bz = wz; run.n++; }
        else { flush(); run = { ax: wx, az: wz, bx: wx, bz: wz, fx: sd.dir[0], fz: sd.dir[1], fy, n: 1 }; }
        if (rng() < 0.08) flush();
      }
      flush();
    }
  });
}

// Pipes / conduits running along a ceiling from (x0, z0) to (x1, z1) at height y.
// opts: {n (parallel runs), r, mat, spacing, drop (hanger length)}
export function ceilingPipes(L, x0, z0, x1, z1, y, opts = {}) {
  const n = opts.n ?? 3, sp = opts.spacing ?? 0.28;
  const dx = x1 - x0, dz = z1 - z0, len = Math.hypot(dx, dz) || 1;
  const px = -dz / len, pz = dx / len;
  const rng = makeRng(opts.seed ?? (((x0 * 31 + z0 * 17 + y) | 0) >>> 0) + 9);
  const mats = opts.mat ? [opts.mat] : ['metal', 'rust', 'metalDark', 'paintedWhite'];
  for (let i = 0; i < n; i++) {
    const off = (i - (n - 1) / 2) * sp;
    const r = opts.r ?? (0.03 + rng() * 0.06);
    const yy = y - 0.12 - r - (i % 2) * 0.08;
    pipe(L, x0 + px * off, yy, z0 + pz * off, x1 + px * off, yy, z1 + pz * off, r, mats[Math.floor(rng() * mats.length)]);
    // hangers every ~2 m
    for (let t = 1; t < len / 2; t++) {
      const k = t * 2 / len;
      const hx = x0 + dx * k + px * off, hz = z0 + dz * k + pz * off;
      L.box(hx - 0.01, yy, hz - 0.01, hx + 0.01, y, hz + 0.01, 'metalDark', { collide: false });
    }
  }
}
// A sagging cable (catenary approximation) between two points.
export function cables(L, a, b, sag = 0.4, r = 0.012, mat = 'rubber', segs = 8) {
  let prev = a;
  for (let i = 1; i <= segs; i++) {
    const t = i / segs;
    const p = [a[0] + (b[0] - a[0]) * t, a[1] + (b[1] - a[1]) * t - Math.sin(t * Math.PI) * sag, a[2] + (b[2] - a[2]) * t];
    pipe(L, prev[0], prev[1], prev[2], p[0], p[1], p[2], r, mat, 0x1a1a1a);
    prev = p;
  }
}
// Water drips from ceiling points (only emitted near the camera). Points are
// [x, y, z]; with {findCeiling: true} y is a floor height and the drip starts
// at the ceiling above it (found by raycast once the collision world exists).
export function drips(L, points, rate = 0.6, opts = {}) {
  const g = L.game;
  if (opts.findCeiling) {
    const src = points;
    points = [];
    (L.postBuild || (L.postBuild = [])).push(() => {
      for (const [x, y, z] of src) {
        const h = L.col.raycast(x, y + 0.5, z, 0, 1, 0, 8, F_SOLID);
        if (h && h.t > 0.8) points.push([x, h.y, z]);
      }
      st.length = 0;
      for (let i = 0; i < points.length; i++) st.push(r0() * 3);
    });
  }
  const r0 = makeRng(points.length * 7 + 5);
  const st = points.map(() => r0() * 3);
  L.dynamics.push({
    update(dt) {
      const cp = g.camPos;
      for (let i = 0; i < points.length; i++) {
        const [x, y, z] = points[i];
        if ((cp.x - x) ** 2 + (cp.z - z) ** 2 > 900) continue;
        st[i] -= dt * rate;
        if (st[i] <= 0) { st[i] = 0.5 + Math.random() * 2.5; g.fx.drip?.(x + (Math.random() - 0.5) * 0.05, y - 0.02, z + (Math.random() - 0.5) * 0.05); }
      }
    },
  });
}

// Automatic dressing for a whole chapter: samples walkable floor along the
// connected play space (nav grid) and scatters context-appropriate clutter —
// outdoor litter & leaves, indoor papers & debris, wall-base grime — keeping
// 3D pieces off the survivor route. opts: {density = 1, theme: 'city'|'subway'|
// 'sewer'|'hospital'|'office'|'rooftop'|'industrial', seed, avoid: [[x0,z0,x1,z1]],
// yMin, yMax, grime (0..1), box: [x0,z0,x1,z1] limit}
const THEMES = {
  city: { out: ['leaves', 'papers', 'newspapers', 'trash', 'cans', 'bottles', 'glass', 'oil', 'rubble'], in: ['papers', 'trash', 'rubble', 'glass', 'bottles', 'cans', 'bloodtrail', 'water'] },
  subway: { out: ['leaves', 'papers', 'newspapers', 'trash', 'cans', 'bottles'], in: ['papers', 'newspapers', 'trash', 'cans', 'rubble', 'water', 'grime', 'bloodtrail', 'casings'] },
  sewer: { out: ['leaves', 'papers', 'trash', 'cans'], in: ['trash', 'rubble', 'water', 'grime', 'oil', 'cans', 'bottles'] },
  hospital: { out: ['leaves', 'papers', 'trash', 'casings', 'glass'], in: ['papers', 'trash', 'glass', 'bloodtrail', 'casings', 'water', 'rubble'] },
  office: { out: ['leaves', 'papers', 'trash'], in: ['papers', 'papers', 'trash', 'glass', 'rubble', 'bloodtrail', 'casings'] },
  rooftop: { out: ['leaves', 'rubble', 'papers', 'cans', 'grime', 'soot', 'casings'], in: ['papers', 'trash', 'rubble', 'water'] },
  industrial: { out: ['papers', 'trash', 'cans', 'rubble', 'oil', 'leaves'], in: ['rubble', 'oil', 'papers', 'trash', 'cans', 'grime', 'water'] },
};
export function autoClutter(L, opts = {}) {
  const c = ctx(L);
  const q = L.game?.quality?.clutter ?? 1;
  c.jobs.push(() => {
    const nav = L.nav, col = L.col;
    if (!nav || !nav.N) return;
    const f = nav.fields?.toExit;
    const rng = makeRng(opts.seed ?? 777);
    const th = THEMES[opts.theme] || THEMES.city;
    const avoid = opts.avoid || [];
    const lim = opts.box;
    const rate = 0.028 * (opts.density ?? 1) * q; // items per nav node (0.25 m²)
    const n = Math.min(9000, Math.round(nav.N * rate));
    const indoor = new Map();
    const isIndoor = (x, y, z) => {
      const k = Math.floor(x / 3) + ',' + Math.floor(y) + ',' + Math.floor(z / 3);
      let v = indoor.get(k);
      if (v == null) { v = !!col.raycast(x, y + 0.3, z, 0, 1, 0, 30, F_SOLID); indoor.set(k, v); }
      return v;
    };
    const S = { L, c, rng, dust: 1 };
    const grime = opts.grime ?? 0.5;
    const dripPts = [];
    const wantDrips = opts.drips ?? (opts.theme === 'sewer' ? 40 : opts.theme === 'subway' ? 16 : 0);
    for (let i = 0; i < n; i++) {
      const node = Math.floor(rng() * nav.N);
      if (f && opts.connected !== false && f[node] >= 1e8) continue; // not connected to the route
      let x = nav.nodeX(node) + (rng() - 0.5) * 0.5, z = nav.nodeZ(node) + (rng() - 0.5) * 0.5;
      const y0 = nav.nodeY[node];
      if (opts.yMin != null && y0 < opts.yMin) continue;
      if (opts.yMax != null && y0 > opts.yMax) continue;
      if (lim && (x < lim[0] || x > lim[2] || z < lim[1] || z > lim[3])) continue;
      if (avoid.some((a) => x > a[0] && x < a[2] && z > a[1] && z < a[3] && (a[4] == null || (y0 > a[4] && y0 < a[5])))) continue;
      if (L.startSafe && L.inBox(L.startSafe, { x, y: y0, z }, 0.2)) continue;
      if (L.endSafe && L.inBox(L.endSafe, { x, y: y0, z }, 0.2)) continue;
      const inside = isIndoor(x, y0, z);
      const kinds = inside ? th.in : th.out;
      let kind = kinds[Math.floor(rng() * kinds.length)];
      if (kind === 'bloodtrail' && rng() < 0.7) kind = 'papers';
      let wall = null;
      if (rng() < 0.6) {
        wall = nearestWall(col, x, y0 + 0.25, z, 1.6);
        if (wall) { const off = 0.05 + rng() * rng() * 0.5; x = wall.x + wall.nx * off; z = wall.z + wall.nz * off; }
      }
      const fy = floorAt(col, x, y0 + 1.2, z, y0, 0.3);
      if (fy == null) continue;
      if (inside && dripPts.length < wantDrips && rng() < 0.08) {
        const h = col.raycast(x, fy + 0.5, z, 0, 1, 0, 7, F_SOLID);
        if (h && h.t > 1.2) { dripPts.push([x, h.y, z]); stain(S, x, fy, z, D.WATER, [0.1, 0.1, 0.1], 0.7, 0.8); }
      }
      const on3D = kind !== 'papers' && kind !== 'newspapers' && kind !== 'leaves' && kind !== 'glass' && kind !== 'bloodtrail' && kind !== 'grime' && kind !== 'water' && kind !== 'oil' && kind !== 'soot';
      if (on3D && !wall && nearRoute(c.route, x, fy, z, 1.0)) kind = 'papers';
      ITEM[kind](S, x, fy, z, wall);
      // wall-base grime patch
      if (wall && inside && rng() < grime) {
        const dch = chunkOf(c.decal, x, fy, z);
        const ang = Math.atan2(wall.nx, wall.nz);
        const len = 0.8 + rng() * 1.6;
        const wx = wall.x, wz = wall.z;
        dch.add('strip', M(wx + wall.nx * 0.22, fy + 0.011, wz + wall.nz * 0.22, 0, ang, 0, len, 1, 0.44), cellRect(D.GRIME), [0.04, 0.035, 0.03], 0.75);
        dch.add('wallstrip', M(wx + wall.nx * 0.012, fy + 0.17, wz + wall.nz * 0.012, 0, ang, Math.PI, len, 0.34, 1), cellRect(D.GRIME), [0.04, 0.035, 0.03], 0.6);
      }
    }
    if (dripPts.length) drips(L, dripPts, 0.7);
  });
}
