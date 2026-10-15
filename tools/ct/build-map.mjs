#!/usr/bin/env node
// Builds the CHINATWN map lumps (build/ct/lumps/map/) from the layout data in
// tools/ct/layout/:
//   raster.json  walkable space of the three map layers (street, subway,
//                sewer) on an 8-unit grid: floor/ceiling heights and surface
//                classes, measured from the NMRiH reference by
//                extract-layout.py (one-off; not needed to run this script)
//   ref.json     points measured from the reference: vehicles, props,
//                signs, lights, zombie spawn boxes, item spawners, heli path
//   edits.mjs    hand-authored map design: zones and styles, doors, specials,
//                tags, objective lines, extra geometry, things
// The grid is turned into sectors (connected cells with identical
// properties) and linedefs (cell edges merged into maximal runs, split at
// every junction so lines never cross or T-join). Nodes come from
// tools/ct/lib/bsp.mjs; BLOCKMAP and REJECT are written empty (the engine
// builds them).
//
// Usage: node tools/ct/build-map.mjs [--no-preview] [--dump]
//   --dump also writes build/ct/map-grid.{json,bin} (cell grid, lines, things)
//   for debugging tools; previews go to build/ct/previews/map/.

import fs from 'node:fs';
import path from 'node:path';
import zlib from 'node:zlib';
import { buildNodes, encodeNodeLumps } from './lib/bsp.mjs';
import * as design from './layout/edits.mjs';

const HERE = path.dirname(new URL(import.meta.url).pathname);
const ROOT = path.resolve(HERE, '../..');
const OUT = path.join(ROOT, 'build/ct/lumps/map');
const PREV = path.join(ROOT, 'build/ct/previews/map');
const NOPREVIEW = process.argv.includes('--no-preview');

// CT_LAYOUT overrides the folder holding raster.json/ref.json (experiments)
const LAYOUT = process.env.CT_LAYOUT || path.join(HERE, 'layout');
const raster = JSON.parse(fs.readFileSync(path.join(LAYOUT, 'raster.json'), 'utf8'));
const ref = JSON.parse(fs.readFileSync(path.join(LAYOUT, 'ref.json'), 'utf8'));
const C = raster.cell;

// ---------------------------------------------------------------------------
// Global grid. Layers are placed with their x offsets (SPEC section 2).
export const OFFSET = { street: 0, subway: -5000, sewer: 6000 };
const LAYER_ID = { street: 1, subway: 2, sewer: 3 };
const LAYER_NAME = [null, 'street', 'subway', 'sewer'];
const GX0 = -8384, GY0 = -7040, GX1 = 5504, GY1 = 4352;
const W = (GX1 - GX0) / C, H = (GY1 - GY0) / C, N = W * H;
const SKY = 32767;

const KIND = new Uint8Array(N); // 0 void, 1 walkable, 2 non-walkable sector fenced off (blocking edge), 3 non-walkable open (water)
const LAY = new Uint8Array(N);
const FZ = new Int16Array(N);
const CZ = new Int16Array(N);
const FCLS = new Uint8Array(N); // raster floor class
const CCLS = new Uint8Array(N);
const WCLS = new Uint8Array(N); // raster wall class (void cells)
const VFL = new Uint8Array(N); // raster void flags: 1 glass 2 grate 4 blocked
const NAV = new Uint8Array(N); // 1 = came from the raster (walkable in NMRiH)
const NAVP = new Uint8Array(N); // 1 = inside an NMRiH nav area (a valid player centre there)
const HALO = new Uint8Array(N); // 1 = within a player hull (16 units) of a nav-area cell at about this height
const FFLAT = new Uint8Array(N); // flat index (0 = auto)
const CFLAT = new Uint8Array(N);
const LIGHT = new Uint8Array(N); // 0 = auto
const SPEC = new Uint8Array(N);
const TAG = new Uint16Array(N);
const GROUP = new Uint16Array(N); // forces sector separation
const WTEX = new Uint8Array(N); // forced wall texture of void cells (0 = auto)
const STEPTEX = new Uint8Array(N); // forced lower texture for edges facing this (higher) cell
const UPTEX = new Uint8Array(N); // forced upper texture for edges facing this (lower-ceiling) cell
const BLOCK = new Uint16Array(N); // impassable footprint id (vehicles, objects)
const CLIPBLOCK = 65534; // BLOCK id of cells under NMRiH player clips (invisible walls there too)
const NOFIX = new Uint8Array(N); // cells whose heights edits set exactly (skip auto fixes)
const WSURF = new Int16Array(N).fill(-32768); // open water surface height over void cells (bay)
const TOPZ = new Int16Array(N).fill(-32768); // top of the solid column on void cells (NMRiH brushes)
const WTOP = new Int16Array(N).fill(-32768); // top of the reference wall faces on void cells (building heights)

const idx = (i, j) => j * W + i;
const inGrid = (i, j) => i >= 0 && j >= 0 && i < W && j < H;
const cellX = (i) => GX0 + i * C; // left edge
const cellY = (j) => GY0 + j * C;

// Name tables
const TEX = ['-'];
const TEXI = new Map([['-', 0]]);
const texId = (n) => { if (!TEXI.has(n)) { TEXI.set(n, TEX.length); TEX.push(n); } return TEXI.get(n); };
const FLAT = ['-'];
const FLATI = new Map([['-', 0]]);
const flatId = (n) => { if (!FLATI.has(n)) { FLATI.set(n, FLAT.length); FLAT.push(n); } return FLATI.get(n); };

// ---------------------------------------------------------------------------
// Load raster layers.
function decode(b64, T) {
  const b = zlib.inflateSync(Buffer.from(b64, 'base64'));
  const ab = b.buffer.slice(b.byteOffset, b.byteOffset + b.length);
  return new T(ab);
}
const RC = { wall: raster.wallClasses, floor: raster.floorClasses, ceil: raster.ceilClasses };
const BARRIER_EDGES = [];
for (const [name, L] of Object.entries(raster.layers)) {
  const floor = decode(L.floor, Int16Array), ceil = decode(L.ceil, Int16Array);
  const fcls = decode(L.fcls, Uint8Array), ccls = decode(L.ccls, Uint8Array), wcls = decode(L.wcls, Uint8Array), flags = decode(L.flags, Uint8Array);
  const water = decode(L.water, Int16Array);
  const hbar = decode(L.hbar, Uint8Array), vbar = decode(L.vbar, Uint8Array);
  const top = L.top ? decode(L.top, Int16Array) : null;
  const wtop = L.wtop ? decode(L.wtop, Int16Array) : null;
  const gi0 = (L.x0 + OFFSET[name] - GX0) / C, gj0 = (L.y0 - GY0) / C;
  if (!Number.isInteger(gi0) || !Number.isInteger(gj0)) throw new Error('layer not grid aligned: ' + name);
  for (let lj = 0; lj < L.h; lj++) {
    for (let li = 0; li < L.w; li++) {
      const s = lj * L.w + li;
      const k = idx(gi0 + li, gj0 + lj);
      if (floor[s] !== -32768) {
        KIND[k] = 1; NAV[k] = 1; LAY[k] = LAYER_ID[name];
        FZ[k] = floor[s]; CZ[k] = ceil[s] >= SKY ? SKY : ceil[s];
        FCLS[k] = fcls[s]; CCLS[k] = ccls[s];
        if (flags[s] & 8) BLOCK[k] = flags[s] & 32 ? CLIPBLOCK : 65535; // barrier: prop obstacle / player clip in NMRiH
        if (flags[s] & 16) NAVP[k] = 1;
      } else {
        LAY[k] = LAYER_ID[name];
        WCLS[k] = wcls[s]; VFL[k] = flags[s]; WSURF[k] = water[s]; if (top) TOPZ[k] = top[s]; if (wtop) WTOP[k] = wtop[s];
      }
    }
  }
  for (let lj = 0; lj <= L.h; lj++) for (let li = 0; li < L.w; li++) if (hbar[lj * L.w + li]) BARRIER_EDGES.push(['h', gi0 + li, gj0 + lj]);
  for (let lj = 0; lj < L.h; lj++) for (let li = 0; li <= L.w; li++) if (vbar[lj * (L.w + 1) + li]) BARRIER_EDGES.push(['v', gi0 + li, gj0 + lj]);
}

// The extractor's 'no height' sentinel once leaked into floors (int16 wrap to
// 31072, sky-high columns): refuse such data outright.
{
  let bad = 0;
  for (let k = 0; k < N; k++) if (KIND[k] === 1 && (FZ[k] < -1024 || FZ[k] > 1024)) bad++;
  if (bad) throw new Error(`raster: ${bad} walkable cells with floor heights outside -1024..1024`);
}
// Nav halo: cells a player standing on an NMRiH nav sample would overlap
// (2 cells each way, similar floor). Obstacle footprints never take these.
for (let k = 0; k < N; k++) {
  if (!NAVP[k]) continue;
  const i = k % W, j = (k / W) | 0;
  for (let dj = -2; dj <= 2; dj++) for (let di = -2; di <= 2; di++) {
    if (!inGrid(i + di, j + dj)) continue;
    const q = idx(i + di, j + dj);
    if (KIND[q] === 1 && LAY[q] === LAY[k] && Math.abs(FZ[q] - FZ[k]) <= 24) HALO[q] = 1;
  }
}

// ---------------------------------------------------------------------------
// Edit API (real Source coordinates per layer; snapped to the 8-unit grid).
const things = [];
const hFeat = new Map(); // horizontal edge at grid line j between cells (i,j-1),(i,j): key j*(W+1)+i
const vFeat = new Map(); // vertical edge at grid line i between cells (i-1,j),(i,j): key j*(W+1)+i
const ekey = (i, j) => j * (W + 1) + i;
let featSeq = 1;
const log = [];

function gridX(layer, x) { return Math.round((x + OFFSET[layer] - GX0) / C); }
function gridY(y) { return Math.round((y - GY0) / C); }
function cellsOf(layer, r) {
  const i0 = gridX(layer, Math.min(r[0], r[2])), i1 = gridX(layer, Math.max(r[0], r[2]));
  const j0 = gridY(Math.min(r[1], r[3])), j1 = gridY(Math.max(r[1], r[3]));
  const out = [];
  for (let j = j0; j < j1; j++) for (let i = i0; i < i1; i++) if (inGrid(i, j)) out.push(idx(i, j));
  return out;
}
function applyProps(k, p, layer) {
  if (p.kind !== undefined) KIND[k] = p.kind;
  if (layer) LAY[k] = LAYER_ID[layer];
  if (p.floor !== undefined) { FZ[k] = p.floor; NOFIX[k] = 1; }
  if (p.ceil !== undefined) { CZ[k] = p.ceil === 'sky' ? SKY : p.ceil; NOFIX[k] = 1; }
  if (p.raise !== undefined) FZ[k] += p.raise;
  if (p.fflat) FFLAT[k] = flatId(p.fflat);
  if (p.cflat) CFLAT[k] = flatId(p.cflat);
  if (p.fcls) FCLS[k] = RC.floor.indexOf(p.fcls);
  if (p.light !== undefined) LIGHT[k] = p.light;
  if (p.special !== undefined) SPEC[k] = p.special;
  if (p.tag !== undefined) TAG[k] = p.tag;
  if (p.group !== undefined) GROUP[k] = p.group;
  if (p.wtex) WTEX[k] = texId(p.wtex);
  if (p.steptex) STEPTEX[k] = texId(p.steptex);
  if (p.uptex) UPTEX[k] = texId(p.uptex);
  if (p.block !== undefined) BLOCK[k] = p.block;
}
let groupSeq = 1;
let BOXREG = null;
function boxRegions() {
  // lattice point (I,J) = grid vertex; box = cells I-2..I+1 x J-2..J+1
  const free = new Uint8Array(N);
  for (let k = 0; k < N; k++) free[k] = KIND[k] === 1 && !BLOCK[k] && SPEC[k] !== 65 ? 1 : 0;
  const edgeBlocked = (f) => f && f.special !== 903 && ((f.flags & 1) || f.special === 906);
  const LW = W + 1, LH = H + 1;
  // prefix sums: non-free cells, blocked vertical edges, blocked horizontal edges
  const P = new Int32Array((W + 1) * (H + 1)), PV = new Int32Array((W + 2) * (H + 1)), PH = new Int32Array((W + 1) * (H + 2));
  for (let j = 0; j < H; j++) for (let i = 0; i < W; i++) P[(j + 1) * (W + 1) + i + 1] = P[j * (W + 1) + i + 1] + P[(j + 1) * (W + 1) + i] - P[j * (W + 1) + i] + (free[idx(i, j)] ? 0 : 1);
  for (let j = 0; j < H; j++) for (let i = 0; i <= W; i++) PV[(j + 1) * (W + 2) + i + 1] = PV[j * (W + 2) + i + 1] + PV[(j + 1) * (W + 2) + i] - PV[j * (W + 2) + i] + (edgeBlocked(vFeat.get(ekey(i, j))) ? 1 : 0);
  for (let j = 0; j <= H; j++) for (let i = 0; i < W; i++) PH[(j + 1) * (W + 1) + i + 1] = PH[j * (W + 1) + i + 1] + PH[(j + 1) * (W + 1) + i] - PH[j * (W + 1) + i] + (edgeBlocked(hFeat.get(ekey(i, j))) ? 1 : 0);
  const rect = (A, w, i0, j0, i1, j1) => A[j1 * w + i1] - A[j0 * w + i1] - A[j1 * w + i0] + A[j0 * w + i0]; // sum over [i0,i1) x [j0,j1)
  const ok = new Uint8Array(LW * LH), fz = new Int16Array(LW * LH);
  for (let J = 2; J < LH - 2; J++) for (let I = 2; I < LW - 2; I++) {
    if (rect(P, W + 1, I - 2, J - 2, I + 2, J + 2)) continue;
    if (rect(PV, W + 2, I - 1, J - 2, I + 2, J + 2)) continue; // vertical edges x = I-1..I+1
    if (rect(PH, W + 1, I - 2, J - 1, I + 2, J + 2)) continue; // horizontal edges y = J-1..J+1
    const k = J * LW + I;
    ok[k] = 1;
    fz[k] = Math.max(FZ[idx(I - 1, J - 1)], FZ[idx(I, J - 1)], FZ[idx(I - 1, J)], FZ[idx(I, J)]);
  }
  const lab = new Int32Array(LW * LH).fill(-1), size = [];
  for (let k0 = 0; k0 < ok.length; k0++) {
    if (!ok[k0] || lab[k0] >= 0) continue;
    const id = size.length, st = [k0]; lab[k0] = id; let n = 0;
    while (st.length) {
      const k = st.pop(); n++;
      for (const q of [k + 1, k - 1, k + LW, k - LW]) if (ok[q] && lab[q] < 0 && Math.abs(fz[q] - fz[k]) <= 24) { lab[q] = id; st.push(q); }
    }
    size.push(n);
  }
  return { lab, size };
}
const api = {
  C, OFFSET, SKY, KIND, FZ, CZ, BLOCK, LIGHT, SPEC, TAG, GROUP, WSURF, LAY, NAV, NAVP, HALO, WCLS, WTEX, NOFIX, FFLAT, CFLAT, FCLS, idx, W, H, gridX, gridY, cellX, cellY, inGrid, cellsOf,
  flatId: (n) => flatId(n), texId: (n) => texId(n), floorClass: (n) => RC.floor.indexOf(n),
  newGroup: () => groupSeq++,
  // Make cells sector cells with the given properties (walkable unless kind given).
  carve(layer, r, p = {}) {
    for (const k of cellsOf(layer, r)) {
      if (p.onlyVoid && KIND[k]) continue;
      if (p.onlyKind && KIND[k] !== p.onlyKind) continue;
      if (!KIND[k]) { KIND[k] = 1; FZ[k] = 0; CZ[k] = SKY; }
      if (p.block === undefined) BLOCK[k] = 0;
      applyProps(k, p, layer);
    }
  },
  cell(layer, x, y) {
    const i = gridX(layer, x - C / 2), j = gridY(y - C / 2);
    if (!inGrid(i, j)) return null;
    const k = idx(i, j);
    return { kind: KIND[k], floor: FZ[k], ceil: CZ[k], block: BLOCK[k], light: LIGHT[k], special: SPEC[k], tag: TAG[k] };
  },
  // From (x,y) step in direction (dx,dy) (unit axis) until a void cell; returns the boundary coordinate.
  findWall(layer, x, y, dx, dy, max = 512) {
    let i = gridX(layer, x - C / 2), j = gridY(y - C / 2);
    for (let n = 0; n < max / C; n++) {
      const ni = i + dx, nj = j + dy;
      if (!inGrid(ni, nj) || !KIND[idx(ni, nj)]) {
        if (dx > 0) return cellX(ni) - OFFSET[layer];
        if (dx < 0) return cellX(i) - OFFSET[layer];
        if (dy > 0) return cellY(nj);
        return cellY(j);
      }
      i = ni; j = nj;
    }
    return null;
  },
  // Change properties of existing sector cells only.
  set(layer, r, p = {}, filter) {
    for (const k of cellsOf(layer, r)) if (KIND[k] && (!filter || filter(k))) applyProps(k, p);
  },
  // Make cells solid (outside the map); optional wall texture.
  solid(layer, r, wtex) {
    for (const k of cellsOf(layer, r)) { KIND[k] = 0; BLOCK[k] = 0; LAY[k] = LAYER_ID[layer]; if (wtex) WTEX[k] = texId(wtex); }
  },
  wallTex(layer, r, wtex) { for (const k of cellsOf(layer, r)) if (!KIND[k]) WTEX[k] = texId(wtex); },
  floorAt(layer, x, y) { const k = idx(gridX(layer, x - C / 2), gridY(y - C / 2)); return KIND[k] ? FZ[k] : null; },
  ceilAt(layer, x, y) { const k = idx(gridX(layer, x - C / 2), gridY(y - C / 2)); return KIND[k] ? CZ[k] : null; },
  kindAt(layer, x, y) { const k = idx(gridX(layer, x - C / 2), gridY(y - C / 2)); return KIND[k]; },
  // Feature line along a grid-aligned segment. p: {special, tag, flags, mid, top, bottom, front:'n'|'s'|'e'|'w', xoff, yoff, dontpeg}
  line(layer, seg, p = {}) {
    const [x0, y0, x1, y1] = seg;
    const f = { ...p, id: featSeq++ };
    let n = 0;
    const want = (ka, kb) => {
      const sa = ka >= 0 && KIND[ka], sb = kb >= 0 && KIND[kb];
      if (p.onWall) return (sa && !sb) || (!sa && sb);
      if (p.any) return sa || sb;
      return sa && sb;
    };
    if (y0 === y1) {
      const j = gridY(y0);
      const a = gridX(layer, Math.min(x0, x1)), b = gridX(layer, Math.max(x0, x1));
      for (let i = a; i < b; i++) if (want(j < H ? idx(i, j) : -1, j > 0 ? idx(i, j - 1) : -1)) { hFeat.set(ekey(i, j), f); n++; }
    } else if (x0 === x1) {
      const i = gridX(layer, x0);
      const a = gridY(Math.min(y0, y1)), b = gridY(Math.max(y0, y1));
      for (let j = a; j < b; j++) if (want(i < W ? idx(i, j) : -1, i > 0 ? idx(i - 1, j) : -1)) { vFeat.set(ekey(i, j), f); n++; }
    } else throw new Error('feature line must be axis aligned: ' + seg);
    if (!n && !p.optional) log.push(`feature line ${JSON.stringify(seg)} (${layer}) ${p.special || ''}/${p.tag || ''} applied to no edge`);
    f.n = n;
    return f;
  },
  thing(layer, x, y, type, angle = 0, flags = 7) {
    things.push({ x: Math.round(x + OFFSET[layer]), y: Math.round(y), type, angle: Math.round(angle), flags, layer });
  },
  // Cells of a rotated rectangle (centre x,y; yaw degrees; len along yaw).
  rectCells(layer, x, y, yaw, len, wid) {
    const c = Math.cos(yaw * Math.PI / 180), s = Math.sin(yaw * Math.PI / 180);
    const hx = len / 2, hy = wid / 2;
    const ext = Math.abs(hx * c) + Math.abs(hy * s) + 8, eyt = Math.abs(hx * s) + Math.abs(hy * c) + 8;
    const out = [];
    for (const k of cellsOf(layer, [x - ext, y - eyt, x + ext, y + eyt])) {
      const i = k % W, j = (k / W) | 0;
      const px = cellX(i) + C / 2 - OFFSET[layer] - x, py = cellY(j) + C / 2 - y;
      const u = px * c + py * s, v = -px * s + py * c;
      if (Math.abs(u) <= hx && Math.abs(v) <= hy && LAY[k] === LAYER_ID[layer]) out.push(k);
    }
    return out;
  },
  // Rotated-rectangle impassable footprint (vehicles) in a layer; returns the
  // number of cells. Cells a nav-area player hull overlaps (HALO) stay free.
  // o.carve = {floor, ceil}: solid cells under the footprint become floor
  // first (vehicles the reference clipped into the building line), except
  // where that would open onto a different space (indoors/other height).
  footprint(layer, x, y, yaw, len, wid, id, o = {}) {
    const cells = api.rectCells(layer, x, y, yaw, len, wid);
    const inRect = new Set(cells);
    let n = 0;
    if (o.carve) {
      const sky = o.carve.ceil === 'sky';
      for (const k of cells) {
        if (KIND[k] || WTEX[k]) continue;
        let ok = true;
        for (const q of [k + 1, k - 1, k + W, k - W]) {
          if (inRect.has(q) || KIND[q] !== 1) continue;
          if (Math.abs(FZ[q] - o.carve.floor) > 24 || (CZ[q] === SKY) !== sky) ok = false;
        }
        if (!ok) continue;
        KIND[k] = 1; FZ[k] = o.carve.floor; CZ[k] = sky ? SKY : o.carve.ceil; FCLS[k] = RC.floor.indexOf('road');
        CCLS[k] = 0; NOFIX[k] = 1; BLOCK[k] = id; n++;
      }
    }
    n = 0;
    for (const k of cells) if (KIND[k] === 1 && (!HALO[k] || BLOCK[k])) { BLOCK[k] = id; n++; }
    return n;
  },
  // Size (lattice points) of the region a 32x32 player box at (x,y) can roam
  // with doors open and breakables broken (0 = the box does not fit there).
  // Computed once, on first use (after the geometry and barrier lines).
  boxRegion(layer, x, y) {
    if (!BOXREG) BOXREG = boxRegions();
    const I = Math.round((x + OFFSET[layer] - GX0) / C), J = Math.round((y - GY0) / C);
    if (I < 0 || J < 0 || I > W || J > H) return 0;
    const lab = BOXREG.lab[J * (W + 1) + I];
    return lab < 0 ? 0 : BOXREG.size[lab];
  },
  // Copy cells (geometry, flats, light; void stays void) of rectangle r from
  // layer `src` into layer `dst` at the same real coordinates: what a portal
  // seam shows beyond itself. o.kind forces the kind of copied sector cells
  // (2 = not walkable), o.only = ['light'] copies just the light.
  copyFrom(dst, src, r, o = {}) {
    const a = cellsOf(src, r), b = cellsOf(dst, r);
    const g = o.group || groupSeq++;
    if (!o.only) {
      // feature lines of the destination inside the copied block go away
      const inB = new Set(b);
      for (const k of b) {
        const i = k % W, j = (k / W) | 0;
        if (inB.has(k + 1)) vFeat.delete(ekey(i + 1, j));
        if (inB.has(k + W)) hFeat.delete(ekey(i, j + 1));
      }
    }
    for (let n = 0; n < a.length && n < b.length; n++) {
      const ks = a[n], kd = b[n];
      if (o.only) { if (o.only.includes('light') && KIND[ks] && KIND[kd]) LIGHT[kd] = LIGHT[ks]; continue; }
      if (!KIND[ks]) { KIND[kd] = 0; BLOCK[kd] = 0; WTEX[kd] = WTEX[ks] || (o.wtex ? texId(o.wtex) : 0); WCLS[kd] = WCLS[ks]; continue; }
      KIND[kd] = o.kind || KIND[ks]; FZ[kd] = FZ[ks]; CZ[kd] = CZ[ks]; FFLAT[kd] = FFLAT[ks]; CFLAT[kd] = CFLAT[ks]; LIGHT[kd] = LIGHT[ks];
      FCLS[kd] = FCLS[ks]; CCLS[kd] = CCLS[ks]; SPEC[kd] = 0; TAG[kd] = 0; BLOCK[kd] = 0; GROUP[kd] = g; NOFIX[kd] = 1;
      STEPTEX[kd] = STEPTEX[ks]; UPTEX[kd] = UPTEX[ks]; zoneCache[kd] = zoneCache[ks];
    }
  },
  // Can a thing step from cell k to its 4-neighbour q (both walkable and
  // unblocked, no blocking feature line on the shared edge)?
  passable(k, q) {
    if (KIND[k] !== 1 || KIND[q] !== 1 || BLOCK[k] || BLOCK[q] || Math.abs(FZ[k] - FZ[q]) > 24) return false;
    const i = k % W, j = (k / W) | 0;
    const f = q === k + 1 ? vFeat.get(ekey(i + 1, j)) : q === k - 1 ? vFeat.get(ekey(i, j)) : q === k + W ? hFeat.get(ekey(i, j + 1)) : hFeat.get(ekey(i, j));
    return !(f && ((f.flags & 1) || f.special === 906));
  },
  // Is a box of half-size r at (x,y) free for a thing (DOOM rules: every
  // overlapped cell walkable and unblocked, no blocking feature edge inside,
  // floor spread <= 24, room >= o.height)? o.block: allow BLOCK cells.
  boxFree(layer, x, y, r, o = {}) {
    const ax = x - r + OFFSET[layer] - GX0, bx = x + r + OFFSET[layer] - GX0, ay = y - r - GY0, by = y + r - GY0;
    const i0 = Math.floor(ax / C), i1 = Math.ceil(bx / C) - 1, j0 = Math.floor(ay / C), j1 = Math.ceil(by / C) - 1;
    let fmin = Infinity, fmax = -Infinity, cmin = Infinity;
    const L = LAYER_ID[layer];
    for (let j = j0; j <= j1; j++) for (let i = i0; i <= i1; i++) {
      if (!inGrid(i, j)) return false;
      const k = idx(i, j);
      if (KIND[k] !== 1 || LAY[k] !== L || (BLOCK[k] && !o.block) || SPEC[k] === 65 || (TAG[k] && !o.tag)) return false;
      fmin = Math.min(fmin, FZ[k]); fmax = Math.max(fmax, FZ[k]); cmin = Math.min(cmin, CZ[k]);
      // blocking feature edges strictly inside the box
      if (i > i0) { const f = vFeat.get(ekey(i, j)); if (f && ((f.flags & 1) || f.special === 900 || f.special === 906)) return false; }
      if (j > j0) { const f = hFeat.get(ekey(i, j)); if (f && ((f.flags & 1) || f.special === 900 || f.special === 906)) return false; }
    }
    if (fmax - fmin > (o.step === undefined ? 24 : o.step)) return false;
    if (cmin !== SKY && cmin - fmax < (o.height || 56)) return false;
    return true;
  },
  log: (m) => log.push(m),
  ref,
};

// ---------------------------------------------------------------------------
// Design pass 1: zones, styles, geometry edits (doors, stubs, extra areas).
const ZONES = design.ZONES;
function zoneOf(k) {
  const i = k % W, j = (k / W) | 0;
  const L = LAYER_NAME[LAY[k]] || 'street';
  const x = cellX(i) + C / 2 - OFFSET[L], y = cellY(j) + C / 2;
  for (const z of ZONES) {
    if (z.layer !== L) continue;
    if (!z.box || (x >= z.box[0] && x < z.box[2] && y >= z.box[1] && y < z.box[3])) return z;
  }
  return ZONES[ZONES.length - 1];
}
design.geometry(api);

// Nav barriers (thin obstacles between unconnected nav areas): blocking
// two-sided lines with a chain-link fence midtexture.
{
  const bf = { flags: 1, mid: design.BARRIER_TEX || 'CTFENC1', peg: 'bottom', yoff: 0, id: featSeq++, barrier: true };
  let n = 0;
  for (const [o, i, j] of BARRIER_EDGES) {
    if (o === 'h') {
      if (!inGrid(i, j) || !inGrid(i, j - 1)) continue;
      const a = idx(i, j), b = idx(i, j - 1);
      if (KIND[a] !== 1 || KIND[b] !== 1 || BLOCK[a] || BLOCK[b] || GROUP[a] || GROUP[b] || hFeat.has(ekey(i, j))) continue;
      hFeat.set(ekey(i, j), bf); n++;
    } else {
      if (!inGrid(i, j) || !inGrid(i - 1, j)) continue;
      const a = idx(i, j), b = idx(i - 1, j);
      if (KIND[a] !== 1 || KIND[b] !== 1 || BLOCK[a] || BLOCK[b] || GROUP[a] || GROUP[b] || vFeat.has(ekey(i, j))) continue;
      vFeat.set(ekey(i, j), bf); n++;
    }
  }
  log.push(`barrier edges: ${n}`);
}

// Heights sanity: open ceilings to at least 72 above the floor where the
// raster found something lower (beams, signs).
let lowfix = 0;
for (let k = 0; k < N; k++) {
  if (KIND[k] !== 1 || NOFIX[k] || CZ[k] === SKY) continue;
  if (CZ[k] - FZ[k] < 72) { CZ[k] = FZ[k] + 72; lowfix++; }
}

// Fill tiny ceiling islands (signs, beams) with the surrounding ceiling.
function smoothCeilings() {
  let changed = 0;
  const seen = new Uint8Array(N);
  for (let k0 = 0; k0 < N; k0++) {
    if (seen[k0] || KIND[k0] !== 1) continue;
    const cz = CZ[k0];
    const stack = [k0], comp = [];
    seen[k0] = 1;
    while (stack.length) {
      const k = stack.pop(); comp.push(k);
      const i = k % W, j = (k / W) | 0;
      for (const [di, dj] of [[1, 0], [-1, 0], [0, 1], [0, -1]]) {
        if (!inGrid(i + di, j + dj)) continue;
        const q = idx(i + di, j + dj);
        if (!seen[q] && KIND[q] === 1 && CZ[q] === cz) { seen[q] = 1; stack.push(q); }
      }
    }
    if (comp.length >= 10 || comp.some((k) => NOFIX[k])) continue;
    // most common neighbouring ceiling
    const cnt = new Map();
    for (const k of comp) {
      const i = k % W, j = (k / W) | 0;
      for (const [di, dj] of [[1, 0], [-1, 0], [0, 1], [0, -1]]) {
        const q = idx(i + di, j + dj);
        if (KIND[q] === 1 && CZ[q] !== cz) cnt.set(CZ[q], (cnt.get(CZ[q]) || 0) + 1);
      }
    }
    let best = null, bn = 0;
    for (const [c, n] of cnt) if (n > bn) { bn = n; best = c; }
    if (best !== null) { for (const k of comp) CZ[k] = Math.max(best === SKY ? SKY : best, best); changed += comp.length; }
  }
  return changed;
}
const smoothed = smoothCeilings();

// Remove small islands of floor class / floor height / ceiling height (noise
// from brush details) so sectors stay few and meaningful.
function cleanIslands(arr, maxSize, ok, accept) {
  let changed = 0;
  const seen = new Uint8Array(N);
  for (let k0 = 0; k0 < N; k0++) {
    if (seen[k0] || KIND[k0] !== 1) continue;
    const v = arr[k0];
    const stack = [k0], comp = [];
    seen[k0] = 1;
    while (stack.length) {
      const k = stack.pop(); comp.push(k);
      if (comp.length > maxSize + 1) { while (stack.length) { const q = stack.pop(); comp.push(q); } }
      const i = k % W, j = (k / W) | 0;
      for (const q of [k + 1, k - 1, k + W, k - W]) {
        if (q < 0 || q >= N || (q === k + 1 && i === W - 1) || (q === k - 1 && i === 0)) continue;
        if (!seen[q] && KIND[q] === 1 && arr[q] === v) { seen[q] = 1; stack.push(q); }
      }
    }
    if (comp.length > maxSize || comp.some((k) => NOFIX[k] || (ok && !ok(k)))) continue;
    const cnt = new Map();
    for (const k of comp) {
      for (const q of [k + 1, k - 1, k + W, k - W]) {
        if (q >= 0 && q < N && KIND[q] === 1 && arr[q] !== v) cnt.set(arr[q], (cnt.get(arr[q]) || 0) + 1);
      }
    }
    let best = null, bn = 0;
    for (const [c, n] of cnt) if (n > bn) { bn = n; best = c; }
    if (best === null || (accept && !accept(v, best))) continue;
    for (const k of comp) arr[k] = best;
    changed += comp.length;
  }
  return changed;
}
const cleaned = {
  fcls: cleanIslands(FCLS, 48),
  floor: cleanIslands(FZ, 6, null, (a, b) => Math.abs(a - b) <= 24),
  ceil: cleanIslands(CZ, 4, null, (a, b) => a !== SKY && b !== SKY),
  skyHoles: cleanIslands(CZ, 24, null, (a, b) => a === SKY && b !== SKY),
};
// Sloped ceilings (ramps) in coarser steps
for (let k = 0; k < N; k++) if (KIND[k] === 1 && CZ[k] !== SKY && !NOFIX[k]) CZ[k] = Math.round(CZ[k] / 8) * 8;

// ---------------------------------------------------------------------------
// Styles: sky heights, flats, light.
const zoneCache = new Array(N);
const isOutdoor = (k) => KIND[k] && FLAT[CFLAT[k]] === 'F_SKY1';
function style() {
  for (let k = 0; k < N; k++) {
    if (!KIND[k]) continue;
    if (!zoneCache[k]) zoneCache[k] = zoneOf(k);
    const z = zoneCache[k];
    if (CZ[k] === SKY) { CZ[k] = z.sky; if (!CFLAT[k]) CFLAT[k] = flatId('F_SKY1'); }
    const out = FLAT[CFLAT[k]] === 'F_SKY1';
    if (!FFLAT[k]) FFLAT[k] = flatId(design.floorFlat(RC.floor[FCLS[k]], z, out, k));
    if (!CFLAT[k]) CFLAT[k] = flatId(design.ceilFlat(RC.ceil[CCLS[k]], z, k));
    if (!LIGHT[k]) LIGHT[k] = out ? z.light : z.lightIn;
  }
}
style();

// Low solids (counters, low walls, containers, kiosks) become raised sectors
// instead of full-height walls, so they read as objects, not buildings.
let lowBlocks = 0;
if (design.LOWBLOCK) {
  const { maxHeight, maxCells } = design.LOWBLOCK;
  const seen = new Uint8Array(N);
  for (let k0 = 0; k0 < N; k0++) {
    if (KIND[k0] || seen[k0] || TOPZ[k0] === -32768) continue;
    const comp = [k0]; seen[k0] = 1;
    let tall = false;
    for (let n = 0; n < comp.length; n++) {
      const k = comp[n];
      if (TOPZ[k] === -32768 || WTEX[k]) tall = true;
      if (comp.length > maxCells) { tall = true; break; }
      const i = k % W;
      for (const q of [k + 1, k - 1, k + W, k - W]) {
        if (q < 0 || q >= N || (q === k + 1 && i === W - 1) || (q === k - 1 && i === 0)) continue;
        if (!KIND[q] && !seen[q]) { seen[q] = 1; comp.push(q); }
      }
    }
    if (tall) continue;
    // adjacent sector cells
    let ref = Infinity, top = -Infinity; const ceils = new Map(); let adj = null;
    for (const k of comp) {
      top = Math.max(top, TOPZ[k]);
      for (const q of [k + 1, k - 1, k + W, k - W]) {
        if (q >= 0 && q < N && KIND[q] === 1) { ref = Math.min(ref, FZ[q]); ceils.set(CZ[q], (ceils.get(CZ[q]) || 0) + 1); adj = q; }
      }
    }
    if (adj === null || top - ref > maxHeight || top - ref < 24) continue;
    let cz = null, cn = 0; for (const [c, n] of ceils) if (n > cn) { cn = n; cz = c; }
    if (cz - top < 8) continue;
    const z = Math.round(top / 8) * 8;
    // most common wall class of the block
    const cc = new Map(); for (const k of comp) if (WCLS[k]) cc.set(WCLS[k], (cc.get(WCLS[k]) || 0) + 1);
    let wc = 0, wn = 0; for (const [c, n] of cc) if (n > wn) { wn = n; wc = c; }
    const tex = design.wallTex(RC.wall[wc] || null, zoneCache[adj], isOutdoor(adj), { block: k0, layer: LAYER_NAME[LAY[adj]], floor: FZ[adj] });
    for (const k of comp) {
      KIND[k] = 2; FZ[k] = z; CZ[k] = cz; STEPTEX[k] = texId(tex);
      FFLAT[k] = flatId(design.lowBlockFlat ? design.lowBlockFlat(tex) : 'CFROOF1');
      CFLAT[k] = CFLAT[adj]; LIGHT[k] = LIGHT[adj]; zoneCache[k] = zoneCache[adj];
    }
    lowBlocks++;
  }
}

// Pass 2: lights, things, objective lines (needs final heights/zones).
design.decorate(api, { zoneOfXY: (layer, x, y) => zoneCache[idx(gridX(layer, x - 4), gridY(y - 4))], isOutdoorXY: (layer, x, y) => isOutdoor(idx(gridX(layer, x - 4), gridY(y - 4))) });

// Obstacles: blocked cells (props the nav mesh went round, player clips,
// vehicle footprints) must never be invisible walls in open space. A group
// holding a vehicle keeps its invisible outline (the sprite shows it); solid
// prop things block with their own radius, so their cells are freed; what is
// left becomes a visible raised block styled after the reference prop there.
const obstStats = { groups: 0, vehicle: 0, freed: 0, raised: 0, raisedCells: 0, fenced: 0 };
{
  const R = design.PROP_RADIUS || {};
  const thingAt = new Map();
  for (const t of things) {
    const solidProp = R[t.type];
    if (!(t.type >= 9100 && t.type <= 9110) && t.type !== 9123 && !solidProp) continue;
    const i = Math.floor((t.x - GX0) / C), j = Math.floor((t.y - GY0) / C);
    if (inGrid(i, j)) { const k = idx(i, j); (thingAt.get(k) || thingAt.set(k, []).get(k)).push(t); }
  }
  const fenceEdge = (k) => {
    const i = k % W, j = (k / W) | 0;
    for (const f of [vFeat.get(ekey(i, j)), vFeat.get(ekey(i + 1, j)), hFeat.get(ekey(i, j)), hFeat.get(ekey(i, j + 1))]) if (f && f.mid && (f.flags & 1)) return true;
    return false;
  };
  const comps = (pred) => {
    const seen = new Uint8Array(N), out = [];
    for (let k0 = 0; k0 < N; k0++) {
      if (seen[k0] || !pred(k0)) continue;
      const comp = [k0]; seen[k0] = 1;
      for (let n = 0; n < comp.length; n++) {
        const k = comp[n], i = k % W;
        for (const q of [k + 1, k - 1, k + W, k - W]) {
          if (q < 0 || q >= N || (q === k + 1 && i === W - 1) || (q === k - 1 && i === 0)) continue;
          if (!seen[q] && pred(q)) { seen[q] = 1; comp.push(q); }
        }
      }
      out.push(comp);
    }
    return out;
  };
  const isBlk = (k) => KIND[k] === 1 && BLOCK[k] !== 0;
  for (const comp of comps(isBlk)) {
    obstStats.groups++;
    const ts = comp.flatMap((k) => thingAt.get(k) || []);
    if (ts.some((t) => (t.type >= 9100 && t.type <= 9110) || t.type === 9123)) { obstStats.vehicle++; continue; }
    if (comp.some(fenceEdge)) { obstStats.fenced++; continue; }
    // solid prop things near the group block with their radius: free the
    // cells they explain (their hull plus a little)
    let x0 = Infinity, y0 = Infinity, x1 = -Infinity, y1 = -Infinity;
    for (const k of comp) { const x = cellX(k % W), y = cellY((k / W) | 0); x0 = Math.min(x0, x); y0 = Math.min(y0, y); x1 = Math.max(x1, x + C); y1 = Math.max(y1, y + C); }
    const near = [];
    for (let j = gridY(y0 - 40); j <= gridY(y1 + 40); j++) for (let i = Math.floor((x0 - 40 - GX0) / C); i <= Math.floor((x1 + 40 - GX0) / C); i++) if (inGrid(i, j)) for (const t of thingAt.get(idx(i, j)) || []) if (R[t.type]) near.push(t);
    for (const t of near) {
      const r = R[t.type] + 12;
      for (const k of comp) {
        const cx = cellX(k % W) + C / 2, cy = cellY((k / W) | 0) + C / 2;
        if (BLOCK[k] && BLOCK[k] !== CLIPBLOCK && Math.abs(cx - t.x) <= r && Math.abs(cy - t.y) <= r) { BLOCK[k] = 0; obstStats.freed++; }
      }
    }
  }
  // what is left with no vehicle or fence: small bits are dropped, the rest
  // become raised blocks
  for (const comp of comps(isBlk)) {
    const ts = comp.flatMap((k) => thingAt.get(k) || []);
    if (ts.some((t) => (t.type >= 9100 && t.type <= 9110) || t.type === 9123) || comp.some(fenceEdge)) continue;
    const clip = comp.filter((k) => BLOCK[k] === CLIPBLOCK).length;
    if (clip * 2 > comp.length && clip > 6) { obstStats.clip = (obstStats.clip || 0) + 1; obstStats.clipCells = (obstStats.clipCells || 0) + comp.length; continue; }
    if (comp.length <= 6 && !clip) { for (const k of comp) BLOCK[k] = 0; obstStats.freed += comp.length; continue; }
    let x0 = Infinity, y0 = Infinity, x1 = -Infinity, y1 = -Infinity, fmax = -Infinity, cmin = Infinity;
    for (const k of comp) {
      const x = cellX(k % W) + C / 2, y = cellY((k / W) | 0) + C / 2;
      x0 = Math.min(x0, x); y0 = Math.min(y0, y); x1 = Math.max(x1, x); y1 = Math.max(y1, y);
      fmax = Math.max(fmax, FZ[k]); cmin = Math.min(cmin, CZ[k]);
    }
    const L = LAYER_NAME[LAY[comp[0]]];
    const off = OFFSET[L];
    let best = null, bd = Infinity;
    for (const o of ref.obst || []) {
      const ox = o.x + off;
      if (ox < x0 - 32 || ox > x1 + 32 || o.y < y0 - 32 || o.y > y1 + 32) continue;
      const d = Math.hypot(ox - (x0 + x1) / 2, o.y - (y0 + y1) / 2);
      if (d < bd) { bd = d; best = o; }
    }
    const st = design.obstacleStyle(best ? best.c : null, zoneCache[comp[0]], isOutdoor(comp[0]), comp.length);
    const h = Math.max(16, Math.min(st.h, cmin - fmax - 24));
    for (const k of comp) {
      KIND[k] = 2; BLOCK[k] = 0; FZ[k] = Math.round((fmax + h) / 8) * 8; STEPTEX[k] = texId(st.tex); FFLAT[k] = flatId(st.flat);
    }
    obstStats.raised++; obstStats.raisedCells += comp.length;
  }
  log.push(`obstacles: ${JSON.stringify(obstStats)}`);
}
style();

// Facades: street-facing faces of thick building blocks get a 1-cell strip
// sector whose floor is the top of a ground-floor shop band (lower texture,
// shopfronts/shutters) and whose sky ceiling is the building's height (taken
// from the reference brushes), so blocks read as shops below apartments and
// the skyline varies.
const FAC = new Uint8Array(N);
let facadeCells = 0;
const facadeTops = {};
if (design.FACADE) {
  const F = design.FACADE;
  const street = (q) => KIND[q] === 1 && isOutdoor(q) && !GROUP[q] && !TAG[q] && LAY[q] === 1;
  const cand = [];
  for (let k = 0; k < N; k++) {
    if (KIND[k] || WTEX[k] || LAY[k] !== 1) continue;
    const i = k % W, j = (k / W) | 0;
    if (i < 3 || j < 3 || i >= W - 3 || j >= H - 3) continue;
    let ok = true, n = 0, maxF = -Infinity;
    for (const [di, dj] of [[1, 0], [-1, 0], [0, 1], [0, -1]]) {
      const q = idx(i + di, j + dj);
      if (!KIND[q]) continue;
      if (!street(q)) { ok = false; break; }
      // block must continue behind this face
      if (KIND[idx(i - di, j - dj)] || KIND[idx(i - 2 * di, j - 2 * dj)]) { ok = false; break; }
      n++; maxF = Math.max(maxF, FZ[q]);
    }
    if (!ok || !n) continue;
    for (let dj = -2; dj <= 2 && ok; dj++) for (let di = -2; di <= 2; di++) {
      const q = idx(i + di, j + dj);
      if (KIND[q] && !street(q)) { ok = false; break; }
    }
    if (!ok) continue;
    const zone = zoneOf(k);
    if (!F.zones.includes(zone.name)) continue;
    cand.push([k, maxF, zone]);
  }
  // void block sizes (small blocks are not buildings: no 832 fallback)
  const vsize = new Map();
  {
    const seen = new Uint8Array(N);
    for (const [k0] of cand) {
      if (seen[k0]) continue;
      const comp = [k0]; seen[k0] = 1;
      for (let n = 0; n < comp.length && comp.length <= F.bigBlock; n++) {
        const k = comp[n], i = k % W;
        for (const q of [k + 1, k - 1, k + W, k - W]) {
          if (q < 0 || q >= N || (q === k + 1 && i === W - 1) || (q === k - 1 && i === 0)) continue;
          if (!KIND[q] && !seen[q]) { seen[q] = 1; comp.push(q); }
        }
      }
      for (const k of comp) vsize.set(k, comp.length);
    }
  }
  for (const [k, maxF, zone] of cand) {
    const fl = Math.ceil((maxF + F.band - 16) / 128) * 128;
    // building height: the higher of the stacked-brush top and the reference
    // wall faces' top; unknown tops of real (big) blocks use maxTop
    let top = Math.max(TOPZ[k], WTOP[k]);
    if (top < fl + 48) top = (vsize.get(k) || 0) > F.bigBlock ? F.maxTop : fl + 48;
    const cz = Math.max(fl + 48, Math.min(F.maxTop, Math.round(top / 64) * 64));
    KIND[k] = 2; FZ[k] = fl; CZ[k] = cz; NOFIX[k] = 1; FAC[k] = 1;
    CFLAT[k] = flatId('F_SKY1'); FFLAT[k] = flatId('CFROOF1');
    LIGHT[k] = zone.light; zoneCache[k] = zone;
    STEPTEX[k] = texId(design.facadeLower(RC.wall[WCLS[k]] || null, zone, k));
    facadeCells++;
    facadeTops[cz] = (facadeTops[cz] || 0) + 1;
  }
}

// ---------------------------------------------------------------------------
// Sectors: connected cells with identical properties.
const SEC = new Int32Array(N).fill(-1);
const sectors = [];
{
  const keyOf = (k) => `${KIND[k]},${FZ[k]},${CZ[k]},${FFLAT[k]},${CFLAT[k]},${LIGHT[k]},${SPEC[k]},${TAG[k]},${GROUP[k]}`;
  for (let k0 = 0; k0 < N; k0++) {
    if (!KIND[k0] || SEC[k0] >= 0) continue;
    const key = keyOf(k0);
    const id = sectors.length;
    const stack = [k0];
    SEC[k0] = id;
    let n = 0;
    while (stack.length) {
      const k = stack.pop(); n++;
      const i = k % W, j = (k / W) | 0;
      if (i + 1 < W) { const q = k + 1; if (SEC[q] < 0 && KIND[q] && keyOf(q) === key) { SEC[q] = id; stack.push(q); } }
      if (i > 0) { const q = k - 1; if (SEC[q] < 0 && KIND[q] && keyOf(q) === key) { SEC[q] = id; stack.push(q); } }
      if (j + 1 < H) { const q = k + W; if (SEC[q] < 0 && KIND[q] && keyOf(q) === key) { SEC[q] = id; stack.push(q); } }
      if (j > 0) { const q = k - W; if (SEC[q] < 0 && KIND[q] && keyOf(q) === key) { SEC[q] = id; stack.push(q); } }
    }
    sectors.push({ floor: FZ[k0], ceil: CZ[k0], fflat: FLAT[FFLAT[k0]], cflat: FLAT[CFLAT[k0]], light: LIGHT[k0], special: SPEC[k0], tag: TAG[k0], kind: KIND[k0], cells: n, k0, layer: LAY[k0] });
  }
}
if (sectors.length > 32767) throw new Error('too many sectors: ' + sectors.length);
// The subway and sewers are underground: no sky ceilings there.
{
  const bad = sectors.filter((S) => (S.layer === 2 || S.layer === 3) && S.cflat === 'F_SKY1');
  if (bad.length) throw new Error(`${bad.length} subway/sewer sectors with sky ceilings, e.g. ${bad.slice(0, 3).map((S) => `(${cellX(S.k0 % W)},${cellY((S.k0 / W) | 0)})`).join(' ')}`);
  const inv = sectors.filter((S) => S.kind !== 3 && S.ceil < S.floor);
  if (inv.length) throw new Error(`${inv.length} sectors with ceiling below floor`);
}

// ---------------------------------------------------------------------------
// Wall texture context: nearest void cell's texture for every sector cell
// (used for upper/lower wall pieces), via a multi-source BFS from void cells.
const NEARW = new Int32Array(N).fill(-1);
{
  let frontier = [];
  for (let k = 0; k < N; k++) {
    if (KIND[k]) continue;
    const i = k % W, j = (k / W) | 0;
    let edge = false;
    for (const [di, dj] of [[1, 0], [-1, 0], [0, 1], [0, -1]]) { if (inGrid(i + di, j + dj) && KIND[idx(i + di, j + dj)]) edge = true; }
    if (edge) { NEARW[k] = k; frontier.push(k); }
  }
  for (let step = 0; step < 24 && frontier.length; step++) {
    const next = [];
    for (const k of frontier) {
      const i = k % W, j = (k / W) | 0;
      for (const [di, dj] of [[1, 0], [-1, 0], [0, 1], [0, -1]]) {
        if (!inGrid(i + di, j + dj)) continue;
        const q = idx(i + di, j + dj);
        if (NEARW[q] < 0) { NEARW[q] = NEARW[k]; next.push(q); }
      }
    }
    frontier = next;
  }
}
// Void blocks (connected solid regions) give each building one facade style.
const VBLOCK = new Int32Array(N).fill(-1);
{
  let id = 0;
  for (let k0 = 0; k0 < N; k0++) {
    if (KIND[k0] || VBLOCK[k0] >= 0) continue;
    const stack = [k0]; VBLOCK[k0] = id;
    while (stack.length) {
      const k = stack.pop();
      const i = k % W, j = (k / W) | 0;
      for (const [di, dj] of [[1, 0], [-1, 0], [0, 1], [0, -1]]) {
        if (!inGrid(i + di, j + dj)) continue;
        const q = idx(i + di, j + dj);
        if (!KIND[q] && VBLOCK[q] < 0) { VBLOCK[q] = id; stack.push(q); }
      }
    }
    id++;
  }
}

function wallTexFor(vk, sk) {
  // vk: void cell, sk: sector cell in front of it
  if (WTEX[vk]) return TEX[WTEX[vk]];
  if (FAC[sk]) return design.facadeUpper(RC.wall[WCLS[vk]] || null, zoneCache[sk], VBLOCK[vk]);
  return design.wallTex(RC.wall[WCLS[vk]] || null, zoneCache[sk], isOutdoor(sk), { vflags: VFL[vk], block: VBLOCK[vk], x: cellX(vk % W), y: cellY((vk / W) | 0), floor: FZ[sk], layer: LAYER_NAME[LAY[sk]] });
}
function contextTex(k, other) {
  // texture for an upper/lower piece on sector cell k's side
  const v = NEARW[k] >= 0 ? NEARW[k] : NEARW[other];
  if (v >= 0) return wallTexFor(v, k);
  return design.wallTex(null, zoneCache[k], isOutdoor(k), { layer: LAYER_NAME[LAY[k]], floor: FZ[k] });
}

// ---------------------------------------------------------------------------
// Edges -> line descriptors.
const ML_BLOCKING = 1, ML_BLOCKMONSTERS = 2, ML_TWOSIDED = 4, ML_DONTPEGTOP = 8, ML_DONTPEGBOTTOM = 16, ML_SECRET = 32, ML_DONTDRAW = 128;
const MASKED = new Set(design.MASKED_TEX || []);
const descs = []; const descIdx = new Map();
function descId(d) {
  const key = JSON.stringify(d);
  let id = descIdx.get(key);
  if (id === undefined) { id = descs.length; descs.push(d); descIdx.set(key, id); }
  return id;
}
// Describe the edge between cells a (front candidate) and b. dirA: which side a is ('n','s','e','w').
function describe(a, b, feat) {
  const sa = a >= 0 ? SEC[a] : -1, sb = b >= 0 ? SEC[b] : -1;
  const blkA = a >= 0 ? BLOCK[a] : 0, blkB = b >= 0 ? BLOCK[b] : 0;
  if (sa < 0 && sb < 0) return -1;
  if (sa === sb && !feat && blkA === blkB) return -1;
  // one-sided
  if (sa < 0 || sb < 0) {
    const s = sa < 0 ? b : a, v = sa < 0 ? a : b;
    let tex = wallTexFor(v, s);
    let flags = ML_BLOCKING;
    if (MASKED.has(tex)) tex = design.opaqueFor(tex, 'wall'); // no holes on one-sided walls
    if (feat && feat.mid) tex = feat.mid;
    if (feat && feat.flags) flags |= feat.flags;
    return descId({ one: 1, front: SEC[s], fk: s === a ? 'a' : 'b', mid: tex, flags, special: feat ? feat.special || 0 : 0, tag: feat ? feat.tag || 0 : 0, fid: feat ? feat.id : 0, yoff: feat && feat.yoff, xoff: feat && feat.xoff, peg: feat && feat.peg });
  }
  // two-sided: choose front
  let fk;
  // walkable -> open water (bay): lethal fall line, front = walkable side
  const water = !feat && ((KIND[a] === 1 && KIND[b] === 3) || (KIND[a] === 3 && KIND[b] === 1)) && design.LETHAL_WATER;
  if (water) feat = { special: 906, id: 0, frontCell: KIND[a] === 1 ? a : b };
  if (feat && feat.frontCell !== undefined) fk = feat.frontCell === a ? 'a' : 'b';
  else fk = sa <= sb ? 'a' : 'b';
  const f = fk === 'a' ? a : b, bk = fk === 'a' ? b : a;
  const F = sectors[SEC[f]], B = sectors[SEC[bk]];
  let flags = ML_TWOSIDED;
  if ((KIND[f] === 1 && KIND[bk] === 2) || (KIND[f] === 2 && KIND[bk] === 1)) flags |= ML_BLOCKING;
  if (blkA !== blkB) flags |= ML_BLOCKING;
  if (feat && feat.flags) flags |= feat.flags;
  const tex = { ftop: '-', fbot: '-', fmid: '-', btop: '-', bbot: '-', bmid: '-' };
  // lower pieces
  if (F.floor < B.floor) tex.fbot = STEPTEX[bk] ? TEX[STEPTEX[bk]] : design.lowerTex(B.floor - F.floor, zoneCache[bk], contextTex(f, bk), KIND[bk]);
  if (B.floor < F.floor) tex.bbot = STEPTEX[f] ? TEX[STEPTEX[f]] : design.lowerTex(F.floor - B.floor, zoneCache[f], contextTex(bk, f), KIND[f]);
  const fsky = F.cflat === 'F_SKY1', bsky = B.cflat === 'F_SKY1';
  if (!(fsky && bsky)) {
    if (F.ceil > B.ceil) tex.ftop = UPTEX[bk] ? TEX[UPTEX[bk]] : contextTex(f, bk);
    if (B.ceil > F.ceil) tex.btop = UPTEX[f] ? TEX[UPTEX[f]] : contextTex(bk, f);
  }
  if (feat) {
    // masked midtextures (fences, gates, boards, glass) show from both sides
    if (feat.mid) { if (feat.midSide === 'back') tex.bmid = feat.mid; else if (feat.midSide === 'front') tex.fmid = feat.mid; else { tex.fmid = feat.mid; tex.bmid = feat.mid; } }
    if (feat.top) { tex.ftop = feat.top; tex.btop = feat.top; }
    if (feat.bottom) { if (tex.fbot !== '-') tex.fbot = feat.bottom; if (tex.bbot !== '-') tex.bbot = feat.bottom; }
  }
  // the engine draws holes in masked textures only as midtextures
  for (const kk of ['ftop', 'fbot', 'btop', 'bbot']) if (MASKED.has(tex[kk]) && !(feat && feat.keepMasked)) tex[kk] = design.opaqueFor(tex[kk]);
  return descId({ one: 0, front: SEC[f], back: SEC[bk], fk, flags, special: feat ? feat.special || 0 : 0, tag: feat ? feat.tag || 0 : 0, fid: feat ? feat.id : 0, ...tex, peg: feat && feat.peg, yoff: feat && feat.yoff, xoff: feat && feat.xoff });
}

// hE[j*(W)+i] : edge at grid y=j spanning x i..i+1, between cell below (i,j-1) and above (i,j); value desc id or -1
const hE = new Int32Array((H + 1) * W).fill(-1);
const vE = new Int32Array(H * (W + 1)).fill(-1);
for (let j = 0; j <= H; j++) {
  for (let i = 0; i < W; i++) {
    const below = j > 0 ? idx(i, j - 1) : -1, above = j < H ? idx(i, j) : -1;
    const feat = hFeat.get(ekey(i, j));
    let f2 = feat;
    if (feat && feat.front) f2 = { ...feat, frontCell: feat.front === 'n' ? above : below };
    // a = above, b = below
    const d = describe(above, below, f2);
    hE[j * W + i] = d;
  }
}
for (let j = 0; j < H; j++) {
  for (let i = 0; i <= W; i++) {
    const left = i > 0 ? idx(i - 1, j) : -1, right = i < W ? idx(i, j) : -1;
    const feat = vFeat.get(ekey(i, j));
    let f2 = feat;
    if (feat && feat.front) f2 = { ...feat, frontCell: feat.front === 'e' ? right : left };
    vE[j * (W + 1) + i] = describe(right, left, f2);
  }
}

// Merge runs into linedefs.
const verts = []; const vmap = new Map();
const vtx = (x, y) => { const key = x * 65536 + y; let v = vmap.get(key); if (v === undefined) { v = verts.length; verts.push([x, y]); vmap.set(key, v); } return v; };
const linedefs = [];
const hAt = (i, j) => (i >= 0 && i < W && j >= 0 && j <= H) ? hE[j * W + i] : -1;
const vAt = (i, j) => (i >= 0 && i <= W && j >= 0 && j < H) ? vE[j * (W + 1) + i] : -1;
// horizontal runs
for (let j = 0; j <= H; j++) {
  let i = 0;
  while (i < W) {
    const d = hAt(i, j);
    if (d < 0) { i++; continue; }
    let e = i + 1;
    while (e < W && hAt(e, j) === d && vAt(e, j - 1) < 0 && vAt(e, j) < 0) e++;
    // run i..e at y=j; a = above
    const D = descs[d];
    const x0 = GX0 + i * C, x1 = GX0 + e * C, y = GY0 + j * C;
    // front 'a' (above, north) -> direction west
    const [v1, v2] = D.fk === 'a' ? [vtx(x1, y), vtx(x0, y)] : [vtx(x0, y), vtx(x1, y)];
    linedefs.push({ v1, v2, d });
    i = e;
  }
}
for (let i = 0; i <= W; i++) {
  let j = 0;
  while (j < H) {
    const d = vAt(i, j);
    if (d < 0) { j++; continue; }
    let e = j + 1;
    while (e < H && vAt(i, e) === d && hAt(i - 1, e) < 0 && hAt(i, e) < 0) e++;
    const D = descs[d];
    const x = GX0 + i * C, y0 = GY0 + j * C, y1 = GY0 + e * C;
    // a = right (east) -> direction north
    const [v1, v2] = D.fk === 'a' ? [vtx(x, y0), vtx(x, y1)] : [vtx(x, y1), vtx(x, y0)];
    linedefs.push({ v1, v2, d });
    j = e;
  }
}

// Sidedefs with world-aligned texture offsets.
const sides = [];
function texW(name) { return design.texWidth(name); }
function texH(name) { return design.texHeight(name); }
const mod = (a, m) => ((a % m) + m) % m;
function alignX(v1, v2, name) {
  const [x1, y1] = verts[v1], [x2, y2] = verts[v2];
  const w = texW(name);
  if (y1 === y2) return mod(x2 > x1 ? x1 : -x1, w);
  return mod(y2 > y1 ? y1 : -y1, w);
}
const Z0 = 1024;
for (const L of linedefs) {
  const D = descs[L.d];
  L.flags = D.flags; L.special = D.special; L.tag = D.tag;
  if (D.one) {
    const sec = sectors[D.front];
    const h = texH(D.mid);
    const yoff = D.yoff !== undefined && D.yoff !== null ? D.yoff : mod(Z0 - sec.ceil, h);
    if (D.peg === 'bottom') L.flags |= ML_DONTPEGBOTTOM;
    L.f = sides.length; sides.push({ x: D.xoff !== undefined && D.xoff !== null ? D.xoff : alignX(L.v1, L.v2, D.mid), y: D.peg === 'bottom' ? (D.yoff || 0) : yoff, top: '-', bot: '-', mid: D.mid, s: D.front });
    L.b = 0xffff;
  } else {
    const F = sectors[D.front], B = sectors[D.back];
    const pick = (top, bot, mid) => (mid !== '-' ? mid : top !== '-' ? top : bot);
    // y offsets: world aligned for upper/lower pieces (default pegging)
    const fy = D.fbot !== '-' ? mod(Z0 - B.floor, texH(D.fbot)) : D.ftop !== '-' ? mod(Z0 - B.ceil, texH(D.ftop)) : 0;
    const by = D.bbot !== '-' ? mod(Z0 - F.floor, texH(D.bbot)) : D.btop !== '-' ? mod(Z0 - F.ceil, texH(D.btop)) : 0;
    if (D.peg === 'bottom') L.flags |= ML_DONTPEGBOTTOM;
    if (D.peg === 'top') L.flags |= ML_DONTPEGTOP;
    const ft = pick(D.ftop, D.fbot, D.fmid), bt = pick(D.btop, D.bbot, D.bmid);
    L.f = sides.length; sides.push({ x: D.xoff !== undefined && D.xoff !== null ? D.xoff : ft !== '-' ? alignX(L.v1, L.v2, ft) : 0, y: D.fmid !== '-' || D.peg ? (D.yoff || 0) : fy, top: D.ftop, bot: D.fbot, mid: D.fmid, s: D.front });
    L.b = sides.length; sides.push({ x: bt !== '-' ? alignX(L.v2, L.v1, bt) : 0, y: D.bmid !== '-' || D.peg ? (D.yoff || 0) : by, top: D.btop, bot: D.bbot, mid: D.bmid, s: D.back });
  }
}

// ---------------------------------------------------------------------------
// Things: design pass placed them via api.thing; sanity (inside a sector).
const thingSector = (t) => {
  const i = Math.floor((t.x - GX0) / C), j = Math.floor((t.y - GY0) / C);
  return inGrid(i, j) ? SEC[idx(i, j)] : -1;
};
let outside = 0;
for (const t of things) {
  t.sector = thingSector(t);
  if (t.sector < 0 && t.type !== 9062) { outside++; if (outside < 10) log.push(`thing ${t.type} at (${t.x},${t.y}) outside the map`); }
}

// ---------------------------------------------------------------------------
// Nodes and lumps.
console.log(`grid ${W}x${H}, sectors ${sectors.length}, linedefs ${linedefs.length}, sidedefs ${sides.length}, vertexes ${verts.length}, things ${things.length}`);
if (linedefs.length > 65535 || sides.length > 65535 || verts.length > 65535) throw new Error('map too large for vanilla lumps');
const t0 = Date.now();
const nodes = buildNodes({ verts, lines: linedefs.map((L) => ({ v1: L.v1, v2: L.v2, f: L.f, b: L.b })), sides: sides.map((s) => ({ s: s.s })) });
console.log(`nodes: ${nodes.nodes.length} nodes, ${nodes.ssectors.length} subsectors, ${nodes.segs.length} segs, depth ${nodes.depth} (${Date.now() - t0} ms)`);
if (nodes.segs.length > 65535 || nodes.verts.length > 65535 || nodes.ssectors.length > 32767 || nodes.nodes.length > 32767) throw new Error('node lumps exceed vanilla limits');
const lumps = encodeNodeLumps(nodes);

const name8 = (s, buf, o) => { const b = Buffer.alloc(8); b.write(String(s).toUpperCase().slice(0, 8), 'ascii'); b.copy(buf, o); };
const THINGS = Buffer.alloc(things.length * 10);
things.forEach((t, n) => { const o = n * 10; THINGS.writeInt16LE(t.x, o); THINGS.writeInt16LE(t.y, o + 2); THINGS.writeInt16LE(t.angle, o + 4); THINGS.writeInt16LE(t.type, o + 6); THINGS.writeInt16LE(t.flags, o + 8); });
const LINEDEFS = Buffer.alloc(linedefs.length * 14);
linedefs.forEach((L, n) => { const o = n * 14; LINEDEFS.writeUInt16LE(L.v1, o); LINEDEFS.writeUInt16LE(L.v2, o + 2); LINEDEFS.writeUInt16LE(L.flags, o + 4); LINEDEFS.writeUInt16LE(L.special, o + 6); LINEDEFS.writeUInt16LE(L.tag, o + 8); LINEDEFS.writeUInt16LE(L.f, o + 10); LINEDEFS.writeUInt16LE(L.b, o + 12); });
const SIDEDEFS = Buffer.alloc(sides.length * 30);
sides.forEach((s, n) => { const o = n * 30; SIDEDEFS.writeInt16LE(s.x, o); SIDEDEFS.writeInt16LE(s.y, o + 2); name8(s.top, SIDEDEFS, o + 4); name8(s.bot, SIDEDEFS, o + 12); name8(s.mid, SIDEDEFS, o + 20); SIDEDEFS.writeInt16LE(s.s, o + 28); });
const SECTORS = Buffer.alloc(sectors.length * 26);
sectors.forEach((s, n) => { const o = n * 26; SECTORS.writeInt16LE(s.floor, o); SECTORS.writeInt16LE(s.ceil, o + 2); name8(s.fflat, SECTORS, o + 4); name8(s.cflat, SECTORS, o + 12); SECTORS.writeInt16LE(s.light, o + 20); SECTORS.writeInt16LE(s.special, o + 22); SECTORS.writeInt16LE(s.tag, o + 24); });

fs.mkdirSync(OUT, { recursive: true });
const order = [
  ['CHINATWN', Buffer.alloc(0)], ['THINGS', THINGS], ['LINEDEFS', LINEDEFS], ['SIDEDEFS', SIDEDEFS], ['VERTEXES', lumps.VERTEXES],
  ['SEGS', lumps.SEGS], ['SSECTORS', lumps.SSECTORS], ['NODES', lumps.NODES], ['SECTORS', SECTORS], ['REJECT', Buffer.alloc(0)], ['BLOCKMAP', Buffer.alloc(0)],
];
for (const f of fs.readdirSync(OUT)) if (f.endsWith('.lmp')) fs.unlinkSync(path.join(OUT, f));
for (const [n, b] of order) fs.writeFileSync(path.join(OUT, `${n}.lmp`), b);
fs.writeFileSync(path.join(OUT, 'order.json'), JSON.stringify(order.map(([n]) => ({ name: n })), null, 1) + '\n');

// Debug/analysis dump for check-map.mjs and previews.
const minmax = verts.reduce((a, [x, y]) => [Math.min(a[0], x), Math.min(a[1], y), Math.max(a[2], x), Math.max(a[3], y)], [Infinity, Infinity, -Infinity, -Infinity]);
const stats = {
  sectors: sectors.length, linedefs: linedefs.length, sidedefs: sides.length, vertexes: nodes.verts.length, segs: nodes.segs.length,
  ssectors: nodes.ssectors.length, nodes: nodes.nodes.length, things: things.length,
  zombies: things.filter((t) => t.type >= 9000 && t.type <= 9005).length,
  zombiesBySkill: [1, 2, 4].map((b) => things.filter((t) => t.type >= 9000 && t.type <= 9005 && (t.flags & b)).length),
  bbox: minmax, lowCeilFixes: lowfix, ceilSmoothed: smoothed, cleaned, lowBlocks, facadeCells, facadeTops, obstacles: obstStats, thingsOutside: outside,
  sizeHist: [1, 2, 4, 8, 16, 64, 256, 1e9].map((m, i, a) => sectors.filter((s) => s.cells <= m && (i === 0 || s.cells > a[i - 1])).length),
  textures: [...new Set(sides.flatMap((s) => [s.top, s.bot, s.mid]))].filter((n) => n !== '-').sort(),
  flats: [...new Set(sectors.flatMap((s) => [s.fflat, s.cflat]))].sort(),
};
fs.writeFileSync(path.join(OUT, 'stats.json'), JSON.stringify(stats, null, 1));
for (const m of log.slice(0, 40)) console.log('  note:', m);
console.log(JSON.stringify({ ...stats, textures: stats.textures.length, flats: stats.flats.length, fl: undefined }));

// ---------------------------------------------------------------------------
// Previews (PNG): sectors shaded by floor height, lines by special, things.
function writePNG(file, w, h, rgb) {
  const crcT = new Int32Array(256).map((_, n) => { let c = n; for (let k = 0; k < 8; k++) c = c & 1 ? 0xedb88320 ^ (c >>> 1) : c >>> 1; return c; });
  const crc = (buf) => { let c = -1; for (const b of buf) c = crcT[(c ^ b) & 255] ^ (c >>> 8); return (c ^ -1) >>> 0; };
  const chunk = (type, data) => { const len = Buffer.alloc(4); len.writeUInt32BE(data.length); const td = Buffer.concat([Buffer.from(type), data]); const c = Buffer.alloc(4); c.writeUInt32BE(crc(td)); return Buffer.concat([len, td, c]); };
  const raw = Buffer.alloc((w * 3 + 1) * h);
  for (let y = 0; y < h; y++) { raw[y * (w * 3 + 1)] = 0; rgb.copy(raw, y * (w * 3 + 1) + 1, y * w * 3, (y + 1) * w * 3); }
  const ihdr = Buffer.alloc(13); ihdr.writeUInt32BE(w, 0); ihdr.writeUInt32BE(h, 4); ihdr[8] = 8; ihdr[9] = 2; ihdr[10] = 0; ihdr[11] = 0; ihdr[12] = 0;
  fs.writeFileSync(file, Buffer.concat([Buffer.from([137, 80, 78, 71, 13, 10, 26, 10]), chunk('IHDR', ihdr), chunk('IDAT', zlib.deflateSync(raw)), chunk('IEND', Buffer.alloc(0))]));
}
function preview(name, layer, box, scale) {
  // box in real coords of the layer: [x0,y0,x1,y1]; scale = map units per pixel
  const off = OFFSET[layer];
  const x0 = box[0] + off, y0 = box[1], x1 = box[2] + off, y1 = box[3];
  const w = Math.ceil((x1 - x0) / scale), h = Math.ceil((y1 - y0) / scale);
  const img = Buffer.alloc(w * h * 3);
  const put = (px, py, r, g, b) => { if (px < 0 || py < 0 || px >= w || py >= h) return; const o = (py * w + px) * 3; img[o] = r; img[o + 1] = g; img[o + 2] = b; };
  for (let py = 0; py < h; py++) {
    for (let px = 0; px < w; px++) {
      const x = x0 + (px + 0.5) * scale, y = y1 - (py + 0.5) * scale;
      const i = Math.floor((x - GX0) / C), j = Math.floor((y - GY0) / C);
      if (!inGrid(i, j)) continue;
      const k = idx(i, j);
      if (!KIND[k]) { put(px, py, 18, 18, 22); continue; }
      const S = sectors[SEC[k]];
      const t = Math.max(0, Math.min(1, (S.floor + 600) / 800));
      let r = 40 + 150 * t, g = 70 + 120 * (1 - Math.abs(t - 0.75)), b = 190 - 140 * t;
      const lf = 0.45 + 0.55 * (S.light / 255);
      r *= lf; g *= lf; b *= lf;
      if (S.cflat !== 'F_SKY1') { r *= 0.75; g *= 0.75; b *= 0.9; }
      if (S.special === 64 || S.special === 65) { r = 30; g = 80; b = 200; }
      if (S.special === 66) { r = 220; g = 60; b = 220; }
      if (S.tag) { r = 230; g = 150; b = 40; }
      if (KIND[k] === 2) { r *= 0.5; g *= 0.5; b *= 0.5; }
      if (BLOCK[k]) { r = r * 0.5 + 100; g *= 0.5; b *= 0.5; }
      put(px, py, r, g, b);
    }
  }
  const lineColor = (L) => {
    if (L.special === 900) return [255, 0, 255];
    if (L.special === 902) return [0, 255, 0];
    if (L.special === 903) return [255, 128, 0];
    if (L.special === 904) return [0, 255, 255];
    if (L.special === 905) return [255, 255, 0];
    if (L.special === 906) return [80, 160, 255];
    if (L.special) return [255, 255, 255];
    if (L.b === 0xffff) return [235, 235, 235];
    if (L.flags & ML_BLOCKING) return [200, 40, 40];
    const F = sectors[sides[L.f].s], B = sectors[sides[L.b].s];
    if (F.floor !== B.floor) return [150, 110, 60];
    if (F.ceil !== B.ceil) return [130, 130, 40];
    return null;
  };
  for (const L of linedefs) {
    const c = lineColor(L); if (!c) continue;
    const [ax, ay] = verts[L.v1], [bx, by] = verts[L.v2];
    const n = Math.ceil(Math.hypot(bx - ax, by - ay) / scale * 2) + 1;
    for (let s = 0; s <= n; s++) {
      const x = ax + (bx - ax) * s / n, y = ay + (by - ay) * s / n;
      put(Math.floor((x - x0) / scale), Math.floor((y1 - y) / scale), ...c);
    }
  }
  for (const t of things) {
    let c = [255, 255, 255];
    if (t.type === 1) c = [0, 255, 0];
    else if (t.type >= 9000 && t.type <= 9005) c = t.type === 9004 ? [255, 60, 60] : t.type === 9005 ? [255, 120, 200] : [200, 30, 30];
    else if (t.type === 9010) c = [255, 0, 255];
    else if (t.type >= 9040 && t.type <= 9042) c = [255, 255, 0];
    else if (t.type === 9061 || t.type === 9062) c = [0, 255, 0];
    else if (t.type >= 9100 && t.type <= 9110) c = [120, 120, 255];
    else if (t.type >= 9120) c = [160, 160, 160];
    else c = [0, 220, 120]; // pickups
    const px = Math.floor((t.x - x0) / scale), py = Math.floor((y1 - t.y) / scale);
    const r = t.type >= 9000 && t.type <= 9010 ? 2 : 1;
    for (let dy = -r; dy <= r; dy++) for (let dx = -r; dx <= r; dx++) put(px + dx, py + dy, ...c);
  }
  fs.mkdirSync(PREV, { recursive: true });
  writePNG(path.join(PREV, `${name}.png`), w, h, img);
}
if (!NOPREVIEW) {
  for (const p of design.PREVIEWS) preview(p.name, p.layer, p.box, p.scale);
}

// Grid dump for debugging tools (build/ct/map-grid.json + .bin).
if (process.argv.includes('--dump')) {
  const dir = path.join(ROOT, 'build/ct');
  fs.writeFileSync(path.join(dir, 'map-grid.bin'), Buffer.concat([Buffer.from(KIND.buffer), Buffer.from(LAY.buffer), Buffer.from(FZ.buffer), Buffer.from(CZ.buffer), Buffer.from(SEC.buffer), Buffer.from(BLOCK.buffer)]));
  fs.writeFileSync(path.join(dir, 'map-grid.json'), JSON.stringify({
    GX0, GY0, W, H, C, offset: OFFSET,
    lines: linedefs.map((L) => [...verts[L.v1], ...verts[L.v2], L.special, L.tag, L.flags, L.b === 0xffff ? 1 : 0]),
    things: things.map((t) => [t.x, t.y, t.type, t.angle, t.flags]),
    sectors: sectors.map((s) => [s.floor, s.ceil, s.light, s.special, s.tag, s.fflat, s.cflat]),
  }));
}
