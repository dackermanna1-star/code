// =============================================================================
// Pavement of one airport: runway (+ shoulders, blast pads), asphalt taxiway
// ribbons that follow the layout network with buildPath fillets, the concrete
// apron, painted line decals (centrelines, edge lines, holding positions,
// stand lead-ins, service road), the periodic stand-marking texture and all
// in-pavement / edge / approach / PAPI lights.
//
// Layers (y): taxiway asphalt 0.020 < apron concrete 0.025 < runway 0.030 <
// paint 0.040.  Distinct heights + reversed float depth = no z-fighting; where
// asphalt ribbons overlap each other they share material and world UVs, so the
// overlap is invisible.
// =============================================================================
import * as THREE from 'three';
import {
  RUNWAY, TAXIWAY_WIDTH, TAXILANE_Z, TAXIWAY_A_Z, HOLD_SHORT_Z, GATE_STAND_Z, TERMINAL_FACADE_Z, buildPath,
} from '../layout.js';
import { AIRCRAFT } from '../../core/constants.js';
import { PointGrid, resample, makeCanvas } from './util.js';
import { LC, CAT, MODE, BEAM } from './lights.js';
import { runwayMaterial, taxiwayMaterial, apronMaterial, decalMaterial, MAX_OPENINGS } from './materials.js';

const HW = TAXIWAY_WIDTH / 2;        // 11.5 m: marked edge
const PHW = HW + 4;                  // paved half width incl. shoulders
const Y_TAXI = 0.02, Y_APRON = 0.025, Y_RWY = 0.03, Y_PAINT = 0.04;
const FILLET_R = 45;
const RWY_EXT = 60;                  // blast pads
export const HOLD_LINE_Z = HOLD_SHORT_Z + 22;   // painted holding position (just ahead of the stopped nose)
const YELLOW = new THREE.Color(0.78, 0.5, 0.05);
const WHITE = new THREE.Color(0.75, 0.76, 0.77);
const STAND_PITCH = 50;
export const SERVICE_ROAD_Z = -456.5;

function arcSamples(path, opts) {
  // keep only the curved part (heading changing) of a filleted 3-point path
  const S = path.samples;
  let i0 = -1, i1 = -1;
  for (let i = 1; i < S.length; i++) {
    let dh = Math.abs(((S[i].heading - S[i - 1].heading + 540) % 360) - 180);
    if (dh > 0.01) { if (i0 < 0) i0 = i - 1; i1 = i; }
  }
  if (i0 < 0) return null;
  const s0 = Math.max(0, S[i0].s - (opts?.extend || 0)), s1 = Math.min(path.length, S[i1].s + (opts?.extend || 0));
  return { s0, s1 };
}

/** Taxiway network for an airport def. */
export function buildNetwork(def) {
  const straights = [];
  const ribbons = [];
  const ap = def.apron;
  const addStraight = (a, b, o = {}) => { const s = { a, b, ...o }; straights.push(s); return s; };
  const rwy = addStraight([RUNWAY.x0, 0], [RUNWAY.x1, 0], { runway: true, id: 'RWY' });
  addStraight([RUNWAY.x0, TAXIWAY_A_Z], [RUNWAY.x1, TAXIWAY_A_Z], { id: 'A' });
  for (const c of def.connectors) addStraight([c.x, c.from], [c.x, c.to], { id: c.id, toRunway: c.to === 0 });
  addStraight([ap.xMin + 8, TAXILANE_Z], [ap.xMax - 8, TAXILANE_Z], { id: 'TL', apron: true });

  // ribbons for the straights
  for (const s of straights) {
    if (s.runway) continue;
    const path = buildPath([s.a, s.b], 0, { step: 2 });
    ribbons.push({ id: s.id, path, pts: resample(path, 2), centre: true, edges: !s.apron, lights: true, asphalt: !s.apron, toRunway: !!s.toRunway, straight: true });
  }
  // junction fillets
  const legsAt = new Map();
  const segInter = (s1, s2) => {
    const [ax, az] = s1.a, [bx, bz] = s1.b, [cx, cz] = s2.a, [dx, dz] = s2.b;
    const r1x = bx - ax, r1z = bz - az, r2x = dx - cx, r2z = dz - cz;
    const den = r1x * r2z - r1z * r2x;
    if (Math.abs(den) < 1e-9) return null;
    const t = ((cx - ax) * r2z - (cz - az) * r2x) / den;
    const u = ((cx - ax) * r1z - (cz - az) * r1x) / den;
    const l1 = Math.hypot(r1x, r1z), l2 = Math.hypot(r2x, r2z);
    if (t < -1 / l1 || t > 1 + 1 / l1 || u < -1 / l2 || u > 1 + 1 / l2) return null;
    return [ax + r1x * t, az + r1z * t];
  };
  for (let i = 0; i < straights.length; i++) for (let j = i + 1; j < straights.length; j++) {
    const s1 = straights[i], s2 = straights[j];
    const P = segInter(s1, s2);
    if (!P) continue;
    const key = `${Math.round(P[0])},${Math.round(P[1])}`;
    let e = legsAt.get(key);
    if (!e) { e = { P, legs: [] }; legsAt.set(key, e); }
    for (const s of [s1, s2]) {
      for (const end of [s.a, s.b]) {
        const dx = end[0] - P[0], dz = end[1] - P[1], len = Math.hypot(dx, dz);
        if (len < 30) continue;
        const d = [dx / len, dz / len];
        if (!e.legs.some((l) => l.s === s && l.d[0] * d[0] + l.d[1] * d[1] > 0.99)) e.legs.push({ s, d, len });
      }
    }
  }
  for (const { P, legs } of legsAt.values()) {
    for (let i = 0; i < legs.length; i++) for (let j = i + 1; j < legs.length; j++) {
      const a = legs[i], b = legs[j];
      if (a.s === b.s) continue;
      const cos = a.d[0] * b.d[0] + a.d[1] * b.d[1];
      if (cos > 0.94 || cos < -0.94) continue;
      const L = Math.min(a.len, b.len, 100);
      const pts = [[P[0] + a.d[0] * L, P[1] + a.d[1] * L], P, [P[0] + b.d[0] * L, P[1] + b.d[1] * L]];
      const path = buildPath(pts, FILLET_R, { step: 1 });
      const arc = arcSamples(path);
      if (!arc) continue;
      const rw = a.s.runway || b.s.runway;
      const apron = a.s.apron || b.s.apron;
      ribbons.push({ id: `F${a.s.id}-${b.s.id}`, path, pts: resample(path, 1.5, arc.s0, arc.s1), centre: !rw, edges: true, lights: !rw, asphalt: true, fillet: true, apron });
    }
  }
  // layout paths that leave the network: line-up lead-on (departure), rapid exit (arrival)
  if (def.lineUp) {
    const path = buildPath(def.lineUp.points, def.lineUp.filletRadius, { step: 1 });
    const arc = arcSamples(path);
    if (arc) ribbons.push({ id: 'LINEUP', path, pts: resample(path, 1.5, arc.s0, arc.s1), centre: true, edges: false, lights: true, asphalt: false, onRunway: true });
  }
  if (def.rollout) {
    const path = buildPath(def.rollout.points, def.rollout.filletRadius, { step: 1 });
    let s0 = 0, s1 = path.length;
    for (const p of path.samples) { if (Math.abs(p.z) > 0.05) { s0 = p.s; break; } }
    for (const p of path.samples) { if (p.s > s0 + 50 && Math.abs(p.z - TAXIWAY_A_Z) < 0.5) { s1 = p.s; break; } }
    ribbons.push({ id: 'RET', path, pts: resample(path, 1.5, s0, s1), centre: true, edges: true, lights: true, asphalt: true, rapidExit: true });
  }
  ribbons.forEach((r, i) => { r.index = i; });
  return { straights, ribbons, runway: rwy };
}

// ----------------------------------------------------------------------------- geometry helpers
function ribbonGeometry(ribbons, y, hw, skirt = 0.32) {
  const P = [], N = [], U = [], I = [];
  for (const r of ribbons) {
    const pts = r.pts;
    const base = P.length / 3;
    for (const p of pts) {
      const nx = -p.tz, nz = p.tx;
      const lx = p.x + nx * hw, lz = p.z + nz * hw, rx = p.x - nx * hw, rz = p.z - nz * hw;
      P.push(lx, y, lz, rx, y, rz, lx, y, lz, rx, y, rz, lx, y - skirt, lz, rx, y - skirt, rz);
      N.push(0, 1, 0, 0, 1, 0, nx, 0, nz, -nx, 0, -nz, nx, 0, nz, -nx, 0, -nz);
      U.push(lx / 4, -lz / 4, rx / 4, -rz / 4, lx / 4, -lz / 4, rx / 4, -rz / 4, lx / 4, -lz / 4 + 0.08, rx / 4, -rz / 4 + 0.08);
    }
    for (let i = 0; i < pts.length - 1; i++) {
      const a = base + i * 6, b = a + 6;
      I.push(a, a + 1, b + 1, a, b + 1, b);                  // top
      I.push(a + 4, a + 2, b + 2, a + 4, b + 2, b + 4);      // left skirt
      I.push(a + 5, a + 3, b + 3, a + 5, b + 3, b + 5);      // right skirt
    }
  }
  return indexed(P, N, U, I);
}

function indexed(P, N, U, I) {
  const g = new THREE.BufferGeometry();
  g.setAttribute('position', new THREE.Float32BufferAttribute(P, 3));
  g.setAttribute('normal', new THREE.Float32BufferAttribute(N, 3));
  g.setAttribute('uv', new THREE.Float32BufferAttribute(U, 2));
  g.setIndex(I);
  fixWinding(g);
  g.computeBoundingSphere();
  return g;
}

// make every triangle face its vertex normal direction (robust against path orientation)
function fixWinding(g) {
  const p = g.attributes.position, n = g.attributes.normal, idx = g.index.array;
  const a = new THREE.Vector3(), b = new THREE.Vector3(), c = new THREE.Vector3(), nn = new THREE.Vector3();
  for (let i = 0; i < idx.length; i += 3) {
    a.fromBufferAttribute(p, idx[i]); b.fromBufferAttribute(p, idx[i + 1]); c.fromBufferAttribute(p, idx[i + 2]);
    b.sub(a); c.sub(a); b.cross(c);
    nn.fromBufferAttribute(n, idx[i]);
    if (b.dot(nn) < 0) { const t = idx[i + 1]; idx[i + 1] = idx[i + 2]; idx[i + 2] = t; }
  }
}

function rectGeometry(x0, x1, z0, z1, y, segX = 1, segZ = 1, skirt = 0.32, uvScale = 4) {
  const P = [], N = [], U = [], I = [];
  for (let j = 0; j <= segZ; j++) for (let i = 0; i <= segX; i++) {
    const x = x0 + (x1 - x0) * i / segX, z = z0 + (z1 - z0) * j / segZ;
    P.push(x, y, z); N.push(0, 1, 0); U.push(x / uvScale, -z / uvScale);
  }
  for (let j = 0; j < segZ; j++) for (let i = 0; i < segX; i++) {
    const a = j * (segX + 1) + i, b = a + 1, c = a + segX + 1, d = c + 1;
    I.push(a, c, d, a, d, b);
  }
  // skirts
  const corners = [[x0, z0, 0, -1], [x1, z0, 1, 0], [x1, z1, 0, 1], [x0, z1, -1, 0]];
  const edges = [[[x0, z0], [x1, z0], [0, -1]], [[x1, z0], [x1, z1], [1, 0]], [[x1, z1], [x0, z1], [0, 1]], [[x0, z1], [x0, z0], [-1, 0]]];
  void corners;
  for (const [a, b, n] of edges) {
    const k = P.length / 3;
    P.push(a[0], y, a[1], b[0], y, b[1], a[0], y - skirt, a[1], b[0], y - skirt, b[1]);
    for (let q = 0; q < 4; q++) N.push(n[0], 0, n[1]);
    U.push(0, 0, 1, 0, 0, 0.1, 1, 0.1);
    I.push(k, k + 2, k + 3, k, k + 3, k + 1);
  }
  return indexed(P, N, U, I);
}

// ----------------------------------------------------------------------------- decals
class DecalBuilder {
  constructor() { this.P = []; this.N = []; this.C = []; this.S = []; this.L = []; this.I = []; }
  /** pts: [{x, z, tx, tz}] polyline; hw = half width of the painted pattern */
  line(pts, { hw = 0.075, type = 0, color = YELLOW, y = Y_PAINT } = {}) {
    if (pts.length < 2) return;
    let v = 0;
    const base = this.P.length / 3;
    for (let i = 0; i < pts.length; i++) {
      const p = pts[i];
      if (i > 0) v += Math.hypot(p.x - pts[i - 1].x, p.z - pts[i - 1].z);
      const sx = -p.tz, sz = p.tx;
      for (const sg of [-1, 1]) {
        this.P.push(p.x, y, p.z); this.N.push(0, 1, 0); this.C.push(color.r, color.g, color.b);
        this.S.push(sx, sz); this.L.push(sg, v, hw, type);
      }
    }
    for (let i = 0; i < pts.length - 1; i++) {
      const a = base + i * 2;
      this.I.push(a, a + 1, a + 3, a, a + 3, a + 2);
    }
  }
  seg(x0, z0, x1, z1, o) {
    const l = Math.hypot(x1 - x0, z1 - z0), tx = (x1 - x0) / l, tz = (z1 - z0) / l;
    this.line([{ x: x0, z: z0, tx, tz }, { x: x1, z: z1, tx, tz }], o);
  }
  build() {
    const g = new THREE.BufferGeometry();
    g.setAttribute('position', new THREE.Float32BufferAttribute(this.P, 3));
    g.setAttribute('normal', new THREE.Float32BufferAttribute(this.N, 3));
    g.setAttribute('color', new THREE.Float32BufferAttribute(this.C, 3));
    g.setAttribute('aSide', new THREE.Float32BufferAttribute(this.S, 2));
    g.setAttribute('aLine', new THREE.Float32BufferAttribute(this.L, 4));
    g.setIndex(this.I);
    g.computeBoundingSphere();
    // the strips widen in the vertex shader – enlarge the bounds a little
    g.boundingSphere.radius += 50;
    return g;
  }
}

/** split a point list into runs where keep(p) is true */
function runs(pts, keep) {
  const out = [];
  let cur = [];
  for (const p of pts) {
    if (keep(p)) cur.push(p);
    else { if (cur.length > 1) out.push(cur); cur = []; }
  }
  if (cur.length > 1) out.push(cur);
  return out;
}

// ----------------------------------------------------------------------------- textures
function runwayDigits() {
  const [c, ctx] = makeCanvas(1024, 512);
  ctx.fillStyle = '#000'; ctx.fillRect(0, 0, 1024, 512);
  ctx.fillStyle = '#fff';
  // each half: 12 m wide x 9 m tall; digits 3.2 m wide with a 2 m gap, centred
  const drawPair = (txt, ox) => {
    const pxm = 512 / 12;           // px per metre horizontally
    const digitW = 3.4 * pxm, gap = 1.6 * pxm;
    const x0 = ox + (512 - (2 * digitW + gap)) / 2;
    for (let k = 0; k < 2; k++) {
      ctx.save();
      ctx.font = 'bold 470px Arial, Helvetica, sans-serif';
      const m = ctx.measureText(txt[k]);
      const sx = digitW / m.width;
      ctx.translate(x0 + k * (digitW + gap), 500);
      ctx.scale(sx, 1.36);
      ctx.fillText(txt[k], 0, 0);
      ctx.restore();
    }
  };
  drawPair('09', 0);
  drawPair('27', 512);
  const t = new THREE.CanvasTexture(c);
  t.colorSpace = THREE.NoColorSpace;
  t.anisotropy = 8;
  return t;
}

/** One periodic stand cell (50 m wide, facade -> taxilane edge) of painted apron markings. */
function standTexture(z0, z1) {
  const W = 1024, H = 2560;
  const [c, ctx] = makeCanvas(W, H);
  const sx = W / STAND_PITCH, sz = H / (z1 - z0);
  const X = (lx) => (lx + STAND_PITCH / 2) * sx;
  const Z = (z) => (z - z0) * sz;
  const line = (x0, za, x1, zb, w, col, dash = null) => {
    ctx.strokeStyle = col; ctx.lineWidth = w * sx; ctx.setLineDash(dash ? dash.map((d) => d * sx) : []);
    ctx.beginPath(); ctx.moveTo(X(x0), Z(za)); ctx.lineTo(X(x1), Z(zb)); ctx.stroke();
  };
  const RED = '#b5121b', WHT = '#e8e8e2', YEL = '#e2a514';
  ctx.lineCap = 'butt';
  // stand safety lines (red) along both sides, wrapping around the cell edges
  for (const lx of [-23, 23]) line(lx, -455, lx, -392, 0.15, RED);
  line(-23, -392, 23, -392, 0.15, RED, [1.0, 1.0]);
  // equipment restraint line at the head of stand
  line(-23, -455, -9, -455, 0.15, RED); line(9, -455, 23, -455, 0.15, RED);
  // jet bridge drive area: red hatched "no parking"
  const hatch = (x0, za, x1, zb, col) => {
    ctx.save();
    ctx.beginPath(); ctx.rect(X(x0), Z(za), X(x1) - X(x0), Z(zb) - Z(za)); ctx.clip();
    ctx.strokeStyle = col; ctx.lineWidth = 0.15 * sx;
    for (let k = -40; k < 40; k += 1.2) { ctx.beginPath(); ctx.moveTo(X(x0 + k), Z(za)); ctx.lineTo(X(x0 + k + (zb - za)), Z(zb)); ctx.stroke(); }
    ctx.restore();
    ctx.strokeStyle = col; ctx.lineWidth = 0.15 * sx; ctx.setLineDash([]);
    ctx.strokeRect(X(x0), Z(za), X(x1) - X(x0), Z(zb) - Z(za));
  };
  hatch(-21, -455, -6.5, -446, RED);
  // GSE staging boxes (white) with stencilled text
  const box = (x0, za, x1, zb, label) => {
    ctx.strokeStyle = WHT; ctx.lineWidth = 0.15 * sx; ctx.setLineDash([]);
    ctx.strokeRect(X(x0), Z(za), X(x1) - X(x0), Z(zb) - Z(za));
    if (label) {
      ctx.save();
      ctx.fillStyle = WHT; ctx.font = `bold ${Math.round(1.1 * sz)}px Arial, sans-serif`;
      ctx.textAlign = 'center'; ctx.textBaseline = 'middle';
      ctx.translate((X(x0) + X(x1)) / 2, (Z(za) + Z(zb)) / 2);
      ctx.scale(sx / sz, 1);
      ctx.fillText(label, 0, 0);
      ctx.restore();
    }
  };
  box(7, -455, 21, -449.5, 'GSE');
  box(9.5, -401, 21.5, -395, 'GSE');
  box(-21.5, -401, -9.5, -395, 'NO PARKING');
  // stop-line labels next to the lead-in line
  ctx.save();
  ctx.fillStyle = YEL; ctx.font = `bold ${Math.round(0.9 * sz)}px Arial, sans-serif`;
  ctx.textBaseline = 'middle';
  for (const [z, t] of [[GATE_STAND_Z + AIRCRAFT.gear.noseZ, '738'], [GATE_STAND_Z + AIRCRAFT.gear.noseZ - 1.32, '739'], [GATE_STAND_Z + AIRCRAFT.gear.noseZ + 1.45, '737']]) {
    ctx.save(); ctx.translate(X(2.6), Z(z)); ctx.scale(sx / sz, 1); ctx.fillText(t, 0, 0); ctx.restore();
  }
  ctx.restore();
  // walkway (zebra) from the terminal door to the stand, east of the nose
  for (let k = 0; k < 7; k++) {
    ctx.fillStyle = WHT;
    ctx.fillRect(X(3.2), Z(-469 + k * 1.0), X(6.2) - X(3.2), 0.5 * sz);
  }
  const t = new THREE.CanvasTexture(c);
  t.colorSpace = THREE.SRGBColorSpace;
  t.wrapS = THREE.RepeatWrapping;
  t.wrapT = THREE.ClampToEdgeWrapping;
  t.anisotropy = 8;
  return t;
}

function standLabels(def, y) {
  const n = def.gates.length;
  const cw = 128, ch = 256;
  const [c, ctx] = makeCanvas(cw * 16, ch);
  const P = [], N = [], U = [], I = [];
  def.gates.forEach((g, i) => {
    const ox = i * cw;
    ctx.fillStyle = '#121212'; ctx.fillRect(ox + 6, 6, cw - 12, ch - 12);
    ctx.save();
    ctx.fillStyle = '#e8b11a';
    ctx.font = 'bold 120px Arial, sans-serif';
    ctx.textAlign = 'center'; ctx.textBaseline = 'middle';
    const m = ctx.measureText(g.id);
    const s = Math.min(1, (cw - 26) / m.width);
    ctx.translate(ox + cw / 2, ch / 2); ctx.scale(s, 1.9);
    ctx.fillText(g.id, 0, 4);
    ctx.restore();
    // quad on the lead-in line near the taxilane, text up = north (-z)
    for (const zc of [TAXILANE_Z - 20]) {
      const w = 3.2, l = 6.4;
      const k = P.length / 3;
      const x0 = g.x - w / 2, x1 = g.x + w / 2, za = zc - l / 2, zb = zc + l / 2;
      P.push(x0, y, zb, x1, y, zb, x1, y, za, x0, y, za);
      N.push(0, 1, 0, 0, 1, 0, 0, 1, 0, 0, 1, 0);
      const u0 = i / 16, u1 = (i + 1) / 16;
      U.push(u0, 0, u1, 0, u1, 1, u0, 1);
      I.push(k, k + 1, k + 2, k, k + 2, k + 3);
    }
  });
  void n;
  const geo = indexed(P, N, U, I);
  const tex = new THREE.CanvasTexture(c);
  tex.colorSpace = THREE.SRGBColorSpace;
  tex.anisotropy = 8;
  return { geo, tex };
}

// ----------------------------------------------------------------------------- main
export function buildPavement(def, ctx, lights) {
  const group = new THREE.Group();
  group.name = `pavement-${def.code}`;
  const net = buildNetwork(def);
  const { ribbons } = net;
  const ap = def.apron;
  const inApron = (x, z, m = 0) => x > ap.xMin - m && x < ap.xMax + m && z > TERMINAL_FACADE_Z - 20 && z < ap.zMax + m;
  const inRunway = (x, z, m = 0) => Math.abs(z) < 30 + m && x > RUNWAY.x0 - RWY_EXT - m && x < RUNWAY.x1 + RWY_EXT + m;

  // spatial index of ribbon centrelines (asphalt + apron taxilane)
  const grid = new PointGrid(16);
  for (const r of ribbons) for (const p of r.pts) grid.add(p.x, p.z, r);
  const insideOther = (x, z, self, radius) => {
    let hit = false;
    grid.near(x, z, radius, (q) => { if (q.data !== self && !q.data.onRunway) { hit = true; return false; } return true; });
    return hit;
  };

  // --- runway shoulder openings where taxiways join
  const openings = [];
  for (const side of [-1, 1]) {
    let start = null;
    for (let x = RUNWAY.x0 - RWY_EXT; x <= RUNWAY.x1 + RWY_EXT; x += 1) {
      let hit = false;
      grid.near(x, side * 26.25, PHW - 0.5, (q) => { if (!q.data.onRunway) { hit = true; return false; } return true; });
      if (hit && start === null) start = x;
      if ((!hit || x + 1 > RUNWAY.x1 + RWY_EXT) && start !== null) { openings.push(new THREE.Vector3(start - 1, x, side)); start = null; }
    }
  }
  while (openings.length < MAX_OPENINGS) openings.push(new THREE.Vector3(0, 0, 0));
  openings.length = MAX_OPENINGS;

  // --- meshes
  const asphaltRibbons = ribbons.filter((r) => r.asphalt);
  const taxiMesh = new THREE.Mesh(ribbonGeometry(asphaltRibbons, Y_TAXI, PHW), taxiwayMaterial(ctx));
  taxiMesh.receiveShadow = true; taxiMesh.name = 'taxiways';
  const digits = runwayDigits();
  const rwyMesh = new THREE.Mesh(rectGeometry(RUNWAY.x0 - RWY_EXT, RUNWAY.x1 + RWY_EXT, -30, 30, Y_RWY, 64, 2), runwayMaterial(ctx, { openings }, digits));
  rwyMesh.receiveShadow = true; rwyMesh.name = 'runway';
  const standX0 = def.gates[0].x - STAND_PITCH / 2, standX1 = def.gates[def.gates.length - 1].x + STAND_PITCH / 2;
  const standZ0 = TERMINAL_FACADE_Z, standZ1 = ap.zMax;
  const standTex = standTexture(standZ0, standZ1);
  const apronGeo = rectGeometry(ap.xMin, ap.xMax, TERMINAL_FACADE_Z - 14, ap.zMax, Y_APRON, 48, 6);
  const apronMesh = new THREE.Mesh(apronGeo, apronMaterial(ctx, { standX0, standX1, standZ0, standZ1, gateZ: GATE_STAND_Z }, standTex));
  apronMesh.receiveShadow = true; apronMesh.name = 'apron';
  group.add(taxiMesh, rwyMesh, apronMesh);

  // --- decals
  const D = new DecalBuilder();
  for (const r of ribbons) {
    if (!r.centre) continue;
    let pts = resample(r.path, 1.0, r.pts[0].s, r.pts[r.pts.length - 1].s);
    if (r.toRunway) pts = pts.filter((p) => p.z < -23);
    if (r.rapidExit) pts = pts.filter((p) => Math.abs(p.z) > 0.12);
    for (const run of runs(pts, (p) => inApron(p.x, p.z))) D.line(run, { hw: 0.075, type: 3 });
    for (const run of runs(pts, (p) => !inApron(p.x, p.z))) D.line(run, { hw: 0.075, type: 0 });
  }
  // edge markings (double yellow) where the edge is a real pavement boundary
  for (const r of ribbons) {
    if (!r.edges) continue;
    for (const sg of [-1, 1]) {
      const pts = resample(r.path, 1.0, r.pts[0].s, r.pts[r.pts.length - 1].s).map((p) => ({ x: p.x - p.tz * HW * sg, z: p.z + p.tx * HW * sg, tx: p.tx, tz: p.tz }));
      const keep = (p) => !inApron(p.x, p.z, 2) && !inRunway(p.x, p.z, 1) && !insideOther(p.x, p.z, r, HW - 0.45);
      for (const run of runs(pts, keep)) D.line(run, { hw: 0.225, type: 1 });
    }
  }
  // runway holding positions (pattern A): two solid + two dashed lines, solid on the holding side
  const holdPoints = [];
  for (const c of def.connectors) {
    if (c.to !== 0) continue;
    const z0 = HOLD_LINE_Z;
    const w = HW + 0.3;
    D.seg(c.x - w, z0, c.x + w, z0, { hw: 0.075, type: 0 });
    D.seg(c.x - w, z0 + 0.3, c.x + w, z0 + 0.3, { hw: 0.075, type: 0 });
    D.seg(c.x - w, z0 + 0.6, c.x + w, z0 + 0.6, { hw: 0.075, type: 2 });
    D.seg(c.x - w, z0 + 0.9, c.x + w, z0 + 0.9, { hw: 0.075, type: 2 });
    holdPoints.push({ id: c.id, x: c.x, z: z0 });
  }
  // stand lead-in lines with both curves from the taxilane, stop lines
  for (const g of def.gates) {
    D.seg(g.x, TAXILANE_Z + 0.5, g.x, GATE_STAND_Z + AIRCRAFT.gear.noseZ - 2.5, { hw: 0.075, type: 3 });
    for (const sg of [-1, 1]) {
      const path = buildPath([[g.x + sg * 60, TAXILANE_Z], [g.x, TAXILANE_Z], [g.x, GATE_STAND_Z]], 30, { step: 0.5 });
      const arc = arcSamples(path);
      if (arc) D.line(resample(path, 0.75, arc.s0, arc.s1), { hw: 0.075, type: 3 });
    }
    const zs = GATE_STAND_Z + AIRCRAFT.gear.noseZ;
    D.seg(g.x - 2.2, zs, g.x + 2.2, zs, { hw: 0.15, type: 3 });
    D.seg(g.x - 1.2, zs - 1.32, g.x + 1.2, zs - 1.32, { hw: 0.1, type: 3 });
    D.seg(g.x - 1.2, zs + 1.45, g.x + 1.2, zs + 1.45, { hw: 0.1, type: 3 });
  }
  // head-of-stand service road
  D.seg(ap.xMin + 2, SERVICE_ROAD_Z + 3.5, ap.xMax - 2, SERVICE_ROAD_Z + 3.5, { hw: 0.075, type: 0, color: WHITE });
  D.seg(ap.xMin + 2, SERVICE_ROAD_Z - 3.5, ap.xMax - 2, SERVICE_ROAD_Z - 3.5, { hw: 0.075, type: 0, color: WHITE });
  D.seg(ap.xMin + 2, SERVICE_ROAD_Z, ap.xMax - 2, SERVICE_ROAD_Z, { hw: 0.075, type: 5, color: WHITE });
  const decalMesh = new THREE.Mesh(D.build(), decalMaterial(ctx));
  decalMesh.renderOrder = 1; decalMesh.receiveShadow = true; decalMesh.name = 'paint';
  group.add(decalMesh);
  // stand number boxes
  const lab = standLabels(def, Y_PAINT + 0.002);
  const labMat = new THREE.MeshStandardMaterial({ map: lab.tex, transparent: true, roughness: 0.7, depthWrite: false });
  const labMesh = new THREE.Mesh(lab.geo, labMat);
  labMesh.renderOrder = 2; labMesh.receiveShadow = true;
  group.add(labMesh);

  // --- lights -----------------------------------------------------------------
  buildRunwayLights(def, lights);
  // taxiway centreline (green; green/yellow between the holding position and the runway) + blue edges
  for (const r of ribbons) {
    if (!r.lights) continue;
    const curved = !r.straight;
    const step = curved ? 7.5 : 15;
    const pts = resample(r.path, step, r.pts[0].s, r.pts[r.pts.length - 1].s);
    pts.forEach((p, k) => {
      if (!r.onRunway && !r.rapidExit && Math.abs(p.z) < 23 && p.x > RUNWAY.x0 - 5 && p.x < RUNWAY.x1 + 5) return;
      if (r.rapidExit && Math.abs(p.z) < 0.5) return;
      const nearRwy = (r.toRunway && p.z > HOLD_LINE_Z) || r.onRunway || (r.rapidExit && Math.abs(p.z) < 60);
      const col = nearRwy && k % 2 === 1 ? LC.yellow : LC.green;
      lights.add([p.x, 0.06, p.z], col, null, { size: 0.16, mode: MODE.INSET, cat: CAT.TAXI, gain: 0.9 });
    });
    if (!r.edges) continue;
    for (const sg of [-1, 1]) {
      const es = curved ? 15 : 50;
      for (const p of resample(r.path, es, r.pts[0].s, r.pts[r.pts.length - 1].s)) {
        const x = p.x - p.tz * (HW + 3) * sg, z = p.z + p.tx * (HW + 3) * sg;
        if (inApron(x, z, 3) || inRunway(x, z, 2) || insideOther(x, z, r, HW + 2.5)) continue;
        lights.add([x, 0.35, z], LC.blue, null, { size: 0.14, cat: CAT.TAXI, gain: 0.55 });
      }
    }
  }
  // stop bars (in-pavement red across the holding position + elevated units)
  for (const h of holdPoints) {
    const own = def.id === 'departure' && h.id === 'A1';
    const cat = own ? CAT.STOPBAR_OWN : CAT.STOPBAR;
    for (let x = -HW + 1; x <= HW - 1 + 1e-6; x += 3) lights.add([h.x + x, 0.06, h.z + 1.2], LC.red, null, { axis: [0, 0, -1], beam: BEAM.UNI, size: 0.17, mode: MODE.INSET, cat });
    for (const sg of [-1, 1]) lights.add([h.x + sg * (HW + 3), 0.55, h.z + 1.2], LC.red, null, { axis: [0, 0, -1], beam: BEAM.UNI, size: 0.18, cat, gain: 0.8 });
  }
  return { group, net, holdPoints, openings, standTex, meshes: { taxiMesh, rwyMesh, apronMesh, decalMesh } };
}

function buildRunwayLights(def, L) {
  const { x0, x1 } = RUNWAY;
  // edge lights every 60 m (yellow in the last 600 m for the direction of travel)
  for (let x = x0; x <= x1 + 1e-6; x += 60) {
    for (const z of [-24, 24]) {
      const for09 = x > x1 - 600 ? LC.yellow : LC.white;    // seen by 09 traffic (viewer west -> -axis side)
      const for27 = x < x0 + 600 ? LC.yellow : LC.white;
      L.add([x, 0.36, z], for27, for09, { axis: [1, 0, 0], beam: BEAM.BIDIR, size: 0.2, cat: CAT.RUNWAY, gain: 0.9 });
    }
  }
  // centreline lights every 15 m (white; red/white alternating last 900 m; red last 300 m)
  let k = 0;
  for (let x = x0 + 7.5; x < x1; x += 15, k++) {
    const c09 = x > x1 - 300 ? LC.red : x > x1 - 900 ? (k % 2 ? LC.red : LC.white) : LC.white;
    const c27 = x < x0 + 300 ? LC.red : x < x0 + 900 ? (k % 2 ? LC.red : LC.white) : LC.white;
    L.add([x, 0.05, 0.6], c27, c09, { axis: [1, 0, 0], beam: BEAM.BIDIR, size: 0.15, mode: MODE.INSET, cat: CAT.RUNWAY, gain: 0.8 });
  }
  // touchdown zone barrettes (both ends), visible to landing traffic only
  for (const end of [0, 1]) {
    const sgn = end === 0 ? 1 : -1;
    const xt = end === 0 ? x0 : x1;
    for (let t = 60; t <= 900; t += 30) {
      for (const side of [-1, 1]) for (const y of [9.4, 10.9, 12.4]) {
        L.add([xt + sgn * t, 0.05, side * y], LC.white, null, { axis: [-sgn, 0, 0], beam: BEAM.UNI, size: 0.13, mode: MODE.INSET, cat: CAT.RUNWAY, gain: 0.7 });
      }
    }
  }
  // threshold / runway end lights (green towards the approach, red towards the runway) + wing bars
  for (const end of [0, 1]) {
    const xt = end === 0 ? x0 - 1 : x1 + 1;
    for (let z = -21; z <= 21 + 1e-6; z += 3) {
      const green = LC.green, red = LC.red;
      // axis +x: colA = viewer east, colB = viewer west
      const colA = end === 0 ? red : green, colB = end === 0 ? green : red;
      L.add([xt, 0.08, z], colA, colB, { axis: [1, 0, 0], beam: BEAM.BIDIR, size: 0.22, mode: MODE.INSET, cat: CAT.RUNWAY, gain: 1.1 });
    }
    for (const side of [-1, 1]) for (let z = 25; z <= 37; z += 3) {
      L.add([xt, 0.4, side * z], LC.green, null, { axis: [end === 0 ? -1 : 1, 0, 0], beam: BEAM.UNI, size: 0.24, cat: CAT.RUNWAY, gain: 1.1 });
    }
  }
  // PAPI left of the 09 touchdown zone (north side), inner unit highest
  const angles = [3.5, 3.1667, 2.8333, 2.5];
  for (let i = 0; i < 4; i++) {
    const z = -(22.5 + 15 + 9 * i);
    for (const dz of [-0.45, 0.45]) {
      L.add([x0 + 300, 0.72, z + dz], LC.white, LC.red, { axis: [-1, 0, 0], beam: BEAM.UNI, size: 0.5, mode: MODE.PAPI, papi: angles[i], cat: CAT.PAPI, gain: 2.6 });
    }
  }
}

/** Approach lighting system west of the 09 threshold. Returns structure geometry info for poles. */
export function buildApproachLights(L, { full = true } = {}) {
  const x0 = RUNWAY.x0;
  const stations = [];
  const len = full ? 720 : 420;
  for (let d = 30; d <= len + 1e-6; d += 30) stations.push(d);
  const groundY = -0.25;
  const poles = [];
  stations.forEach((d) => {
    const x = x0 - d;
    const h = 0.6 + d * 0.004;
    poles.push({ x, z: 0, h, w: 4.6 });
    for (let k = -2; k <= 2; k++) L.add([x, groundY + h + 0.15, k * 1.0], LC.white, null, { axis: [-1, 0, 0], beam: BEAM.UNI, size: 0.24, cat: CAT.APPROACH, gain: 1.0 });
    // crossbars at 150 m and 300 m
    if (full && (d === 150 || d === 300)) {
      for (const side of [-1, 1]) for (let k = 0; k < (d === 300 ? 8 : 4); k++) {
        const z = side * (4.5 + k * 1.5);
        L.add([x, groundY + h + 0.15, z], LC.white, null, { axis: [-1, 0, 0], beam: BEAM.UNI, size: 0.24, cat: CAT.APPROACH, gain: 1.0 });
      }
      poles.push({ x, z: 0, h, w: d === 300 ? 30 : 18 });
    }
    // red side-row barrettes in the inner 300 m
    if (full && d <= 270) {
      for (const side of [-1, 1]) {
        for (let k = 0; k < 3; k++) L.add([x, groundY + h + 0.15, side * (11.5 + k * 1.5)], LC.red, null, { axis: [-1, 0, 0], beam: BEAM.UNI, size: 0.22, cat: CAT.APPROACH, gain: 0.9 });
        poles.push({ x, z: side * 13, h, w: 3.6 });
      }
    }
  });
  // sequenced flashers ("rabbit") from 300 m to the outer end, firing towards the threshold
  const flash = stations.filter((d) => d >= (full ? 300 : 120));
  flash.sort((a, b) => b - a);
  flash.forEach((d, i) => {
    const h = 0.6 + d * 0.004;
    L.add([x0 - d, groundY + h + 0.55, 0], [1, 1, 1], null, { axis: [-1, 0, 0], beam: BEAM.UNI, size: 0.3, mode: MODE.RABBIT, phase: (i / flash.length) * 0.75, cat: CAT.RABBIT, gain: 1.6 });
  });
  return poles;
}
