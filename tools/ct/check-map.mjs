#!/usr/bin/env node
// Reachability / sanity checker for the CHINATWN map (tools/ct/SPEC.md section 9).
//
// Loads the built map with the engine's own loader and models the player as
// DOOM does: a 32x32 box (radius 16) that may not overlap a one-sided or
// blocking line, steps up at most 24, needs 56 units of room, and dies in
// lethal water (sector special 65) or crossing a lethal-fall line (906).
// All CHINATWN lines are axis-aligned on the 8-unit grid, so box centres are
// the grid's lattice points and a box is valid when the 4x4 cells round its
// centre lie inside sectors and no blocking line runs strictly inside it.
// The objective chain is walked stage by stage: doors, breakables, ladders
// and portals open at the stage where the map script would open them, and
// every gate is also checked to be closed before its stage (leak check).
//
// Usage: node tools/ct/check-map.mjs [map.wad] [--verbose]
//   (default: build/ct/lumps/map/*.lmp). --verbose prints leak paths and
//   lists every unreachable pickup / lost area. CT_PROBE="x,y;x,y" reports
//   box validity, reach and the path for those spots at the final stage.

import fs from 'node:fs';
import path from 'node:path';
import { Wad, WadStack } from '../../src/wad/wad.js';
import { loadMapData, ML } from '../../src/game/mapdata.js';

const HERE = path.dirname(new URL(import.meta.url).pathname);
const ROOT = path.resolve(HERE, '../..');
const VERBOSE = process.argv.includes('--verbose');
const wadArg = process.argv.slice(2).find((a) => !a.startsWith('--'));

function loadLumps() {
  if (wadArg) {
    const st = new WadStack();
    const b = fs.readFileSync(wadArg);
    st.add(new Wad(b.buffer.slice(b.byteOffset, b.byteOffset + b.length), 'test'));
    return st.mapLumps('CHINATWN');
  }
  const dir = path.join(ROOT, 'build/ct/lumps/map');
  const out = {};
  for (const n of ['THINGS', 'LINEDEFS', 'SIDEDEFS', 'VERTEXES', 'SEGS', 'SSECTORS', 'NODES', 'SECTORS', 'REJECT', 'BLOCKMAP']) {
    const b = fs.readFileSync(path.join(dir, `${n}.lmp`));
    out[n] = new Uint8Array(b.buffer, b.byteOffset, b.length);
  }
  return out;
}

const level = loadMapData(loadLumps(), { flatNum: () => 0, textureNum: () => 0 });
const { lines, sectors, vertices, mapthings } = level;
const results = [];
let failures = 0;
function check(name, ok, detail = '') {
  results.push(`${ok ? 'ok  ' : 'FAIL'} ${name}${detail ? ' — ' + detail : ''}`);
  if (!ok) failures++;
  return ok;
}
const info = (s) => results.push(`info ${s}`);

// --- grid model: cells, edges, sector per cell ----------------------------------
const C = 8;
let minx = Infinity, miny = Infinity, maxx = -Infinity, maxy = -Infinity;
for (const v of vertices) { minx = Math.min(minx, v.x); miny = Math.min(miny, v.y); maxx = Math.max(maxx, v.x); maxy = Math.max(maxy, v.y); }
const X0 = Math.floor(minx / C) * C - 4 * C, Y0 = Math.floor(miny / C) * C - 4 * C;
const NX = Math.ceil((maxx - X0) / C) + 4, NY = Math.ceil((maxy - Y0) / C) + 4; // cells
const VE = new Int32Array((NX + 1) * NY).fill(-1); // vertical edge at x=X0+8i between cells (i-1,j),(i,j)
const HE = new Int32Array(NX * (NY + 1)).fill(-1); // horizontal edge at y=Y0+8j between (i,j-1),(i,j)
const CS = new Int32Array(NX * NY).fill(-2); // sector per cell (-1 void, -2 unknown)
let offGrid = 0, conflicts = 0;
const setCell = (i, j, s) => { const k = i + j * NX; if (CS[k] === -2) CS[k] = s; else if (CS[k] !== s) conflicts++; };
lines.forEach((l, li) => {
  const fs_ = l.frontsector ? l.frontsector.index : -1, bs = l.backsector ? l.backsector.index : -1;
  const i1 = (l.v1.x - X0) / C, j1 = (l.v1.y - Y0) / C, i2 = (l.v2.x - X0) / C, j2 = (l.v2.y - Y0) / C;
  if (![i1, j1, i2, j2].every(Number.isInteger) || (i1 !== i2 && j1 !== j2)) { offGrid++; return; }
  if (i1 === i2) {
    const a = Math.min(j1, j2), b = Math.max(j1, j2), north = j2 > j1; // right of a north-going line is east
    for (let j = a; j < b; j++) { VE[i1 + j * (NX + 1)] = li; const [f, k] = north ? [[i1, j], [i1 - 1, j]] : [[i1 - 1, j], [i1, j]]; setCell(f[0], f[1], fs_); setCell(k[0], k[1], bs); }
  } else {
    const a = Math.min(i1, i2), b = Math.max(i1, i2), east = i2 > i1; // right of an east-going line is south
    for (let i = a; i < b; i++) { HE[i + j1 * NX] = li; const [f, k] = east ? [[i, j1 - 1], [i, j1]] : [[i, j1], [i, j1 - 1]]; setCell(f[0], f[1], fs_); setCell(k[0], k[1], bs); }
  }
});
{
  const st = [];
  for (let k = 0; k < CS.length; k++) if (CS[k] !== -2) st.push(k);
  for (let i = 0; i < NX; i++) for (const j of [0, NY - 1]) { const k = i + j * NX; if (CS[k] === -2) { CS[k] = -1; st.push(k); } }
  for (let j = 0; j < NY; j++) for (const i of [0, NX - 1]) { const k = i + j * NX; if (CS[k] === -2) { CS[k] = -1; st.push(k); } }
  while (st.length) {
    const k = st.pop(), i = k % NX, j = (k / NX) | 0, s = CS[k];
    const nb = [];
    if (i + 1 < NX && VE[i + 1 + j * (NX + 1)] < 0) nb.push(k + 1);
    if (i > 0 && VE[i + j * (NX + 1)] < 0) nb.push(k - 1);
    if (j + 1 < NY && HE[i + (j + 1) * NX] < 0) nb.push(k + NX);
    if (j > 0 && HE[i + j * NX] < 0) nb.push(k - NX);
    for (const q of nb) { if (CS[q] === -2) { CS[q] = s; st.push(q); } else if (CS[q] !== s) conflicts++; }
  }
}
check('map lines are axis-aligned on the 8-unit grid', offGrid === 0, `${offGrid} off-grid lines`);
check('sector sides are consistent (no leaks between sectors)', conflicts === 0, `${conflicts} conflicts`);

// --- world state ----------------------------------------------------------------------
const FL = Float64Array.from(sectors, (s) => s.floorheight);
const CE = Float64Array.from(sectors, (s) => s.ceilingheight);
const CE0 = Float64Array.from(CE);
const lowestNeighbourCeil = (s) => {
  let m = Infinity;
  for (const l of s.lines) { const o = l.frontsector === s ? l.backsector : l.frontsector; if (o && o !== s && CE0[o.index] > FL[o.index]) m = Math.min(m, CE0[o.index]); }
  return m === Infinity ? CE0[s.index] : m;
};
const openSector = (s) => { CE[s.index] = Math.max(CE0[s.index], lowestNeighbourCeil(s) - 4); };
const doorSectors = (tag) => sectors.filter((s) => s.tag === tag);
const st = { broken: new Set(), ladders: new Set([81]) };
// DR doors (special 1) open on use: treat them as open
for (const l of lines) if (l.special === 1 && l.backsector) openSector(l.backsector);
const openDoor = (tag) => { for (const s of doorSectors(tag)) openSector(s); };
const closeDoor = (tag) => { for (const s of doorSectors(tag)) CE[s.index] = FL[s.index]; };
openDoor(8); // the welder garage doorway starts open

// --- box validity per lattice point -----------------------------------------------------
const LX = NX + 1, LY = NY + 1, LN = LX * LY;
const PX = (I) => X0 + C * I, PY = (J) => Y0 + C * J;
const latOf = (x, y) => Math.round((x - X0) / C) + Math.round((y - Y0) / C) * LX;
function blocks(li, monster) {
  const l = lines[li];
  if (!l.backsector) return true;
  if (l.special === 903 && st.broken.has(l.tag)) return false;
  if (l.flags & ML.BLOCKING) return true;
  if (monster && (l.flags & ML.BLOCKMONSTERS)) return true;
  if (!monster && l.special === 906) return true; // crossing it kills the player
  return false;
}
function boxes(r = 16, monster = false) {
  const cr = r / C;
  const valid = new Uint8Array(LN), fz = new Float64Array(LN), cz = new Float64Array(LN);
  const lb = new Uint8Array(lines.length);
  for (let i = 0; i < lines.length; i++) lb[i] = blocks(i, monster) ? 1 : 0;
  for (let J = cr; J < LY - cr; J++) {
    for (let I = cr; I < LX - cr; I++) {
      let ok = 1, f = -Infinity, c = Infinity;
      for (let j = J - cr; j < J + cr && ok; j++) for (let i = I - cr; i < I + cr; i++) {
        const s = CS[i + j * NX];
        if (s < 0) { ok = 0; break; }
        if (FL[s] > f) f = FL[s];
        if (CE[s] < c) c = CE[s];
      }
      if (ok) for (let x = I - cr + 1; x <= I + cr - 1 && ok; x++) for (let j = J - cr; j < J + cr; j++) { const li = VE[x + j * (NX + 1)]; if (li >= 0 && lb[li]) { ok = 0; break; } }
      if (ok) for (let y = J - cr + 1; y <= J + cr - 1 && ok; y++) for (let i = I - cr; i < I + cr; i++) { const li = HE[i + y * NX]; if (li >= 0 && lb[li]) { ok = 0; break; } }
      if (ok && c - f < 56 && !monster) ok = 0;
      if (ok) {
        // lethal water under the centre
        for (const k of [I - 1 + (J - 1) * NX, I + (J - 1) * NX, I - 1 + J * NX, I + J * NX]) if (CS[k] >= 0 && sectors[CS[k]].special === 65) ok = 0;
      }
      const k = I + J * LX;
      valid[k] = ok; fz[k] = f; cz[k] = c;
    }
  }
  return { valid, fz, cz };
}

// --- special line crossings (900 portal, 905 trigger) per lattice move ------------------
// side of a point for an axis-aligned line, as P_PointOnLineSide
function side(l, x, y) {
  if (!l.dx) return x <= l.v1.x ? (l.dy > 0 ? 1 : 0) : (l.dy < 0 ? 1 : 0);
  return y <= l.v1.y ? (l.dx < 0 ? 1 : 0) : (l.dx > 0 ? 1 : 0);
}
const DIRS = [[1, 0], [-1, 0], [0, 1], [0, -1]];
const moveSpecial = new Map(); // P*4+d -> [line]
for (const l of lines) {
  if (l.special !== 900 && l.special !== 905) continue;
  const add = (I, J, d) => { const k = (I + J * LX) * 4 + d; (moveSpecial.get(k) || moveSpecial.set(k, []).get(k)).push(l); };
  const I0 = (Math.min(l.v1.x, l.v2.x) - X0) / C, I1 = (Math.max(l.v1.x, l.v2.x) - X0) / C;
  const J0 = (Math.min(l.v1.y, l.v2.y) - Y0) / C, J1 = (Math.max(l.v1.y, l.v2.y) - Y0) / C;
  if (!l.dx) for (let J = J0; J <= J1; J++) for (const I of [I0 - 1, I0]) { add(I, J, 0); add(I + 1, J, 1); }
  else for (let I = I0; I <= I1; I++) for (const J of [J0 - 1, J0]) { add(I, J, 2); add(I, J + 1, 3); }
}
const portals = new Map();
for (const l of lines) if (l.special === 900) (portals.get(l.tag) || portals.set(l.tag, []).get(l.tag)).push(l);
const partner = (l) => (portals.get(l.tag) || []).find((p) => p !== l) || null;

// --- ladders and landings -------------------------------------------------------------------
const landingLat = (tag) => mapthings.filter((t) => t.type === 9061).filter((t) => { const s = CS[Math.floor((t.x - X0) / C) + Math.floor((t.y - Y0) / C) * NX]; return s >= 0 && sectors[s].tag === tag; }).map((t) => latOf(t.x, t.y));

// --- BFS ------------------------------------------------------------------------------------
let B = null, seen = null, parent = null, crossed = null;
const ladderFrom = new Map(); // lattice -> [tag] (filled lazily per stage)
function bfs(starts) {
  B = boxes(16);
  seen = new Uint8Array(LN); parent = new Int32Array(LN).fill(-1); crossed = new Map();
  const q = new Int32Array(LN); let qh = 0, qt = 0;
  const push = (k, from) => { if (!seen[k] && B.valid[k]) { seen[k] = 1; parent[k] = from; q[qt++] = k; } };
  for (const s of starts) push(s, -1);
  // ladder use spots for enabled ladders
  ladderFrom.clear();
  for (const l of lines) {
    if (l.special !== 902 || !st.ladders.has(l.tag)) continue;
    for (const k of useSpots([l])) (ladderFrom.get(k) || ladderFrom.set(k, []).get(k)).push(l.tag);
  }
  while (qh < qt) {
    const P = q[qh++], I = P % LX, J = (P / LX) | 0, zp = B.fz[P];
    for (let d = 0; d < 4; d++) {
      const I2 = I + DIRS[d][0], J2 = J + DIRS[d][1];
      if (I2 < 0 || J2 < 0 || I2 >= LX || J2 >= LY) continue;
      let Q = I2 + J2 * LX;
      const sp = moveSpecial.get(P * 4 + d);
      const trig = [];
      if (sp) {
        const x0 = PX(I), y0 = PY(J), x1 = PX(I2), y1 = PY(J2);
        let port = null;
        for (const l of sp) {
          if (side(l, x0, y0) === side(l, x1, y1)) continue;
          if (l.special === 905) trig.push(l);
          else port = l;
        }
        if (port) {
          const p = partner(port);
          if (p) Q = I2 + Math.round((p.v1.x - port.v1.x) / C) + (J2 + Math.round((p.v1.y - port.v1.y) / C)) * LX;
        }
      }
      if (!B.valid[Q] || B.fz[Q] - zp > 24 || B.cz[Q] - zp < 56) continue;
      for (const l of trig) if (!crossed.has(l)) crossed.set(l, P);
      if (seen[Q]) continue;
      seen[Q] = 1; parent[Q] = P; q[qt++] = Q;
    }
    const lad = ladderFrom.get(P);
    if (lad) for (const tag of lad) for (const d of landingLat(tag)) push(d, P);
  }
  return qt;
}

// --- use traces (P_UseLines): the first special line along the ray is used ---------------
const lineCells = new Map(); // 64-unit buckets -> lines
for (const l of lines) {
  const bx0 = Math.floor(Math.min(l.v1.x, l.v2.x) / 64), bx1 = Math.floor(Math.max(l.v1.x, l.v2.x) / 64);
  const by0 = Math.floor(Math.min(l.v1.y, l.v2.y) / 64), by1 = Math.floor(Math.max(l.v1.y, l.v2.y) / 64);
  for (let x = bx0; x <= bx1; x++) for (let y = by0; y <= by1; y++) { const k = x * 65536 + y; (lineCells.get(k) || lineCells.set(k, []).get(k)).push(l); }
}
function linesNear(x, y, r) {
  const out = new Set();
  for (let bx = Math.floor((x - r) / 64); bx <= Math.floor((x + r) / 64); bx++) for (let by = Math.floor((y - r) / 64); by <= Math.floor((y + r) / 64); by++) for (const l of lineCells.get(bx * 65536 + by) || []) out.add(l);
  return out;
}
function rayHit(l, x, y, x2, y2) {
  const rdx = x2 - x, rdy = y2 - y, den = rdx * l.dy - rdy * l.dx;
  if (Math.abs(den) < 1e-9) return -1;
  const t = ((l.v1.x - x) * l.dy - (l.v1.y - y) * l.dx) / den, u = ((l.v1.x - x) * rdy - (l.v1.y - y) * rdx) / den;
  return t < 0 || t > 1 || u < 0 || u > 1 ? -1 : t;
}
function useTarget(x, y, a) {
  const x2 = x + 64 * Math.cos(a), y2 = y + 64 * Math.sin(a);
  const hits = [];
  for (const l of linesNear(x, y, 66)) { const t = rayHit(l, x, y, x2, y2); if (t >= 0) hits.push([t, l]); }
  hits.sort((p, q) => p[0] - q[0]);
  for (const [, l] of hits) {
    if (!l.special) {
      if (!l.backsector) return null;
      const top = Math.min(CE[l.frontsector.index], CE[l.backsector.index]), bot = Math.max(FL[l.frontsector.index], FL[l.backsector.index]);
      if (top - bot <= 0) return null;
      continue;
    }
    return l;
  }
  return null;
}
// lattice points (valid boxes) from which a use trace activates one of `ls` from its front
function useSpots(ls) {
  const out = [];
  const want = new Set(ls);
  for (const l of ls) {
    const xa = Math.min(l.v1.x, l.v2.x) - 64, xb = Math.max(l.v1.x, l.v2.x) + 64, ya = Math.min(l.v1.y, l.v2.y) - 64, yb = Math.max(l.v1.y, l.v2.y) + 64;
    for (let y = Math.ceil(ya / C) * C; y <= yb; y += C) for (let x = Math.ceil(xa / C) * C; x <= xb; x += C) {
      const k = latOf(x, y);
      if (!B.valid[k] || side(l, x, y) !== 0) continue;
      for (let f = 0.1; f < 0.95; f += 0.1) {
        const tx = l.v1.x + l.dx * f, ty = l.v1.y + l.dy * f;
        if (Math.hypot(tx - x, ty - y) > 63.5) continue;
        if (want.has(useTarget(x, y, Math.atan2(ty - y, tx - x)))) { out.push(k); break; }
      }
    }
  }
  return out;
}

// --- targets ------------------------------------------------------------------------------
const L = (special, tag) => lines.filter((l) => l.special === special && l.tag === tag);
const useOk = (special, tag) => {
  const ls = L(special, tag);
  if (!ls.length) return [false, 'no such line'];
  const k = useSpots(ls).find((p) => seen[p]);
  return [k !== undefined, k !== undefined ? `from (${PX(k % LX)},${PY((k / LX) | 0)})` : `${ls.length} line(s), no reachable use spot`, k];
};
const distSeg = (l, x, y) => { const t = Math.max(0, Math.min(1, ((x - l.v1.x) * l.dx + (y - l.v1.y) * l.dy) / (l.dx * l.dx + l.dy * l.dy))); return Math.hypot(l.v1.x + l.dx * t - x, l.v1.y + l.dy * t - y); };
const breakOk = (tag) => {
  const ls = L(903, tag);
  if (!ls.length) return [false, 'no such line'];
  for (const l of ls) {
    for (let y = Math.ceil((Math.min(l.v1.y, l.v2.y) - 64) / C) * C; y <= Math.max(l.v1.y, l.v2.y) + 64; y += C) for (let x = Math.ceil((Math.min(l.v1.x, l.v2.x) - 64) / C) * C; x <= Math.max(l.v1.x, l.v2.x) + 64; x += C) {
      const k = latOf(x, y);
      if (seen[k] && distSeg(l, x, y) <= 64) return [true, `from (${x},${y})`, k];
    }
  }
  return [false, `${ls.length} line(s) out of reach`];
};
const crossOk = (tag) => {
  const ls = L(905, tag);
  if (!ls.length) return [false, 'no such line'];
  const l = ls.find((x) => crossed.has(x));
  return [!!l, l ? `crossed near (${PX(crossed.get(l) % LX)},${PY((crossed.get(l) / LX) | 0)})` : `${ls.length} line(s) never crossed`, l ? crossed.get(l) : undefined];
};
// a pickup is touched when the player's box overlaps it (radius 16 + 20) and
// it is no more than 8 below / 56 above the player's feet
function touchSpot(t, r = 20) {
  const sx = Math.floor((t.x - X0) / C) + Math.floor((t.y - Y0) / C) * NX;
  const tz = CS[sx] >= 0 ? FL[CS[sx]] : 0;
  for (let y = Math.ceil((t.y - 16 - r) / C) * C; y < t.y + 16 + r; y += C) for (let x = Math.ceil((t.x - 16 - r) / C) * C; x < t.x + 16 + r; x += C) {
    if (Math.abs(x - t.x) >= 16 + r || Math.abs(y - t.y) >= 16 + r) continue;
    const k = latOf(x, y);
    if (seen[k] && tz - B.fz[k] <= 56 && tz - B.fz[k] >= -8) return k;
  }
  return -1;
}
const thingOk = (type) => {
  const T = mapthings.filter((t) => t.type === type);
  if (!T.length) return [false, 'none placed'];
  const ok = T.map((t) => touchSpot(t) >= 0);
  return [ok.every(Boolean), T.map((t, i) => `(${t.x},${t.y})${ok[i] ? '' : ' UNREACHABLE'}`).join(' ')];
};
const sectorOk = (pred) => {
  for (let k = 0; k < LN; k++) {
    if (!seen[k]) continue;
    const I = k % LX, J = (k / LX) | 0;
    const s = CS[I - 1 + (J - 1) * NX];
    if (s >= 0 && pred(sectors[s])) return [true, `at (${PX(I)},${PY(J)})`, k];
  }
  return [false, 'not reached'];
};
function pathTo(k) {
  const pts = [];
  for (let n = 0; k >= 0 && n < 200000; k = parent[k], n++) pts.push(k);
  pts.reverse();
  const step = Math.max(1, Math.floor(pts.length / 30));
  return pts.filter((_, i) => i % step === 0 || i === pts.length - 1).map((p) => `(${PX(p % LX)},${PY((p / LX) | 0)})`).join(' ');
}
const not = ([ok, d, k]) => [!ok, ok ? `LEAK: reachable too early (${d})${VERBOSE && k !== undefined ? '; path: ' + pathTo(k) : ' (--verbose shows the path)'}` : 'gated'];

// --- stages -------------------------------------------------------------------------------
const start = mapthings.find((t) => t.type === 1);
if (!start) { console.log('FAIL: no player start'); process.exit(1); }
const extraStarts = [];
const reach = () => bfs([latOf(start.x, start.y), ...extraStarts]);
const startK = latOf(start.x, start.y);
const ladderUsed = (tag) => { st.ladders.add(tag); };
// doors start shut
for (const t of [1, 2, 4, 5, 6, 7]) closeDoor(t);
reach();
check('1. player start: a free 32x32 box', B.valid[startK] === 1, `(${start.x},${start.y})`);
check('1. chain gate 903/50 reachable', ...breakOk(50));
check('1. (gate shut) elevator button 904/1 not reachable yet', ...not(useOk(904, 1)));
st.broken.add(50); reach();
check('1. elevator button 904/1 reachable', ...useOk(904, 1));
check('1. (door 1 shut) street not reachable yet (905/130)', ...not(crossOk(130)));
openDoor(1); reach();
check('1. portal 100 pair exists', (portals.get(100) || []).length === 2, `${(portals.get(100) || []).length} lines`);
check('1. street reached: 905/130 crossed', ...crossOk(130));
check('2. gas can spots 9040 (all 3) touchable', ...thingOk(9040));
check('2. generator panel 904/2 usable', ...useOk(904, 2));
check('2. gate button 904/3 usable', ...useOk(904, 3));
check('2. (gate 2 shut) ladder switch 904/4 not reachable yet', ...not(useOk(904, 4)));
check('2. (gate 2 shut) Market St ambush line 905/140 not crossed yet', ...not(crossOk(140)));
check('2. (gate 2 shut) roadblock ladder 902/80 not reachable yet', ...not(useOk(902, 80)));
openDoor(2); reach();
check('3. ladder switch 904/4 usable (warehouse route, door 4 shut)', ...useOk(904, 4));
check('3. shortcut button 904/5 usable', ...useOk(904, 5));
check('3. roadblock ladder 902/80 usable from the street', ...useOk(902, 80));
check('3. (ladder up) landing 80 not reachable yet', ...not(sectorOk((s) => s.tag === 80)));
check('3. (ladder up) north side not reachable yet (board 903/51)', ...not(breakOk(51)));
openDoor(4); ladderUsed(80); reach();
check('3. ladder 80 landing (sector tag 80) reached', ...sectorOk((s) => s.tag === 80));
check('3. 905/131 crossed', ...crossOk(131));
check('4. pre-sewer board 903/51 reachable', ...breakOk(51));
check('4. (board up) sewers not reachable yet (903/54)', ...not(breakOk(54)));
st.broken.add(51); reach();
check('4. portal 101 pair exists', (portals.get(101) || []).length === 2, `${(portals.get(101) || []).length} lines`);
check('4. sewer plank 903/54 reachable', ...breakOk(54));
check('4. sewer exit ladder 902/81 usable (plank intact)', ...useOk(902, 81));
check('4. ladder 81 landing (sector tag 81) reached', ...sectorOk((s) => s.tag === 81));
check('4. 905/132 crossed', ...crossOk(132));
check('4. back-room button 904/6 usable', ...useOk(904, 6));
check('4. (boards up) padlock 904/7 not reachable yet', ...not(useOk(904, 7)));
st.broken.add(54); openDoor(5); reach();
check('5. laundromat boards 903/53 reachable', ...breakOk(53));
st.broken.add(53); st.broken.add(56); reach();
check('5. medical room boards 903/52 reachable', ...breakOk(52));
check('5. (boards 52 up) medical-room blowtorch not touchable yet', (() => { const t = mapthings.filter((m) => m.type === 9042); return t.length === 2 && t.filter((m) => touchSpot(m) >= 0).length === 1; })(), 'exactly one of two touchable');
st.broken.add(52); reach();
check('5. blowtorch spots 9042 (both) touchable', ...thingOk(9042));
check('5. padlock 904/7 usable', ...useOk(904, 7));
check('5. crank 904/8 usable', ...useOk(904, 8));
check('5. (weld gate shut) docks not reached yet (905/133)', ...not(crossOk(133)));
check('5. (weld gate shut) radio not reachable yet', ...not(useOk(904, 10)));
{ // the 50% roll may seal the welder garage: the medical room must still work
  closeDoor(8); reach();
  const torch = mapthings.filter((t) => t.type === 9042).map((t) => touchSpot(t) >= 0);
  check('5. (garage sealed) medical-room blowtorch still touchable', torch.some(Boolean), torch.join(','));
  openDoor(8);
}
openDoor(6); reach();
check('5. docks reached: 905/133 crossed', ...crossOk(133));
check('6. plug 9041 touchable (partition intact)', ...thingOk(9041));
check('6. socket 904/9 usable', ...useOk(904, 9));
check('6. radio 904/10 usable', ...useOk(904, 10));
check('6. extraction zone (sector tag 160, special 66) reached', ...sectorOk((s) => s.tag === 160));
check('6. dock boards 903/55 reachable', ...breakOk(55));
st.broken.add(55); st.broken.add(57); openDoor(7); reach();

// --- sanity --------------------------------------------------------------------------------------
for (const t of [1, 2, 4, 5, 6, 7, 8]) {
  const ds = sectors.filter((s) => s.tag === t);
  check(`door sector tag ${t} is a single sector`, ds.length === 1, `${ds.length} sector(s)`);
}
const ext = sectors.filter((s) => s.tag === 160);
check('extraction sector has special 66', ext.length > 0 && ext.every((s) => s.special === 66));
const secretSecs = sectors.filter((s) => s.special === 9);
const secretReach = secretSecs.map((s) => sectorOk((x) => x === s)[0]);
check('secrets: 3 secret sectors, each reachable', secretSecs.length === 3 && secretReach.every(Boolean), `${secretSecs.length} sector(s), reachable ${secretReach.filter(Boolean).length}`);
const reachedSectors = new Set();
for (let k = 0; k < LN; k++) if (seen[k]) { const I = k % LX, J = (k / LX) | 0; for (const c of [I - 1 + (J - 1) * NX, I + (J - 1) * NX, I - 1 + J * NX, I + J * NX]) if (CS[c] >= 0) reachedSectors.add(CS[c]); }

// monsters: zombies and wave markers need a free box (monster rules: also BLOCKMONSTERS lines)
const PROPR = { 9120: 24, 9121: 20, 9122: 8, 9124: 16, 9125: 16, 9126: 12, 9127: 8, 9128: 12, 9129: 16, 9130: 8, 9132: 20, 9133: 24 };
const solids = mapthings.filter((t) => PROPR[t.type]);
const hitsSolid = (x, y, r) => solids.some((s) => Math.abs(s.x - x) < PROPR[s.type] + r && Math.abs(s.y - y) < PROPR[s.type] + r);
// a thing at an arbitrary point: valid if the box round it is free (check the 4 lattice boxes enclosing it shrunk: use exact cells)
function thingBoxFree(x, y, r, monster) {
  const i0 = Math.floor((x - r - X0) / C), i1 = Math.ceil((x + r - X0) / C) - 1, j0 = Math.floor((y - r - Y0) / C), j1 = Math.ceil((y + r - Y0) / C) - 1;
  let f = -Infinity, fmin = Infinity, c = Infinity;
  for (let j = j0; j <= j1; j++) for (let i = i0; i <= i1; i++) {
    const s = CS[i + j * NX]; if (s < 0) return false;
    f = Math.max(f, FL[s]); fmin = Math.min(fmin, FL[s]); c = Math.min(c, CE[s]);
    if (i > i0) { const li = VE[i + j * (NX + 1)]; if (li >= 0 && blocks(li, monster)) return false; }
    if (j > j0) { const li = HE[i + j * NX]; if (li >= 0 && blocks(li, monster)) return false; }
  }
  return c - f >= 56 && f - fmin <= 24;
}
const zombies = mapthings.filter((t) => t.type >= 9000 && t.type <= 9005);
const zBad = zombies.filter((t) => !thingBoxFree(t.x, t.y, t.type === 9005 ? 12 : 16, true) || hitsSolid(t.x, t.y, t.type === 9005 ? 12 : 16));
check('zombies: every one starts in a free box (no line or prop overlap)', zBad.length === 0, `${zBad.length}/${zombies.length} bad ${zBad.slice(0, 6).map((t) => `${t.type}@(${t.x},${t.y})`).join(' ')}`);
const markers = mapthings.filter((t) => t.type === 9010);
const mBad = markers.filter((t) => !thingBoxFree(t.x, t.y, 16, true) || hitsSolid(t.x, t.y, 16));
check('wave markers 9010: every one a valid spawn spot', mBad.length === 0, `${mBad.length}/${markers.length} bad ${mBad.map((t) => `g${t.angle}@(${t.x},${t.y})`).join(' ')}`);
const groups = new Map(); for (const t of markers) groups.set(t.angle, (groups.get(t.angle) || 0) + 1);
check('wave markers: groups 1-6 each have at least 3 (hold-out 6: at least 6)', [1, 2, 3, 4, 5, 6].every((g) => (groups.get(g) || 0) >= (g === 6 ? 6 : 3)), [...groups].sort((a, b) => a[0] - b[0]).map(([g, n]) => `g${g}:${n}`).join(' '));
const zUnreach = zombies.filter((t) => touchSpot(t, 16) < 0);
info(`zombies: ${zombies.length} (easy ${zombies.filter((t) => t.options & 1).length}, medium ${zombies.filter((t) => t.options & 2).length}, hard ${zombies.filter((t) => t.options & 4).length}); not next to the player's reachable area: ${zUnreach.length}`);
const pick = mapthings.filter((t) => t.type < 9000 && t.type !== 1);
const pUnreach = pick.filter((t) => touchSpot(t) < 0);
check('pickups: all touchable at the end', pUnreach.length === 0, `${pick.length} placed, ${pUnreach.length} not: ${pUnreach.slice(0, VERBOSE ? 99 : 8).map((t) => `${t.type}@(${t.x},${t.y})`).join(' ')}`);
const lowCeil = [...reachedSectors].filter((i) => CE[i] - FL[i] < 56 && CE[i] > FL[i]);
info(`reached sectors with less than 56 of room (only touched by the box edge): ${lowCeil.length}`);

// Areas a point could walk to but the 32-wide player cannot (chokepoints
// narrower than 32): compare cell reachability with box reachability.
{
  const pseen = new Uint8Array(NX * NY);
  const stack = [];
  for (let k = 0; k < LN; k++) if (seen[k]) { const I = k % LX, J = (k / LX) | 0; for (const c of [I - 1 + (J - 1) * NX, I + (J - 1) * NX, I - 1 + J * NX, I + J * NX]) if (CS[c] >= 0 && !pseen[c]) { pseen[c] = 1; stack.push(c); } }
  const near = new Uint8Array(NX * NY);
  for (let k = 0; k < NX * NY; k++) if (pseen[k]) { const i = k % NX, j = (k / NX) | 0; for (let dj = -2; dj <= 2; dj++) for (let di = -2; di <= 2; di++) near[i + di + (j + dj) * NX] = 1; }
  const ok = (a, b, li) => {
    if (CS[b] < 0) return false;
    if (li >= 0) { const l = lines[li]; if (l.special === 900) return false; if (blocks(li, false)) return false; }
    const fa = FL[CS[a]], fb = FL[CS[b]], cb = CE[CS[b]];
    return cb - fb >= 56 && fb - fa <= 24 && cb - fa >= 56 && sectors[CS[b]].special !== 65;
  };
  while (stack.length) {
    const c = stack.pop(), i = c % NX, j = (c / NX) | 0;
    for (const [d, li] of [[c + 1, VE[i + 1 + j * (NX + 1)]], [c - 1, VE[i + j * (NX + 1)]], [c + NX, HE[i + (j + 1) * NX]], [c - NX, HE[i + j * NX]]]) {
      if (d < 0 || d >= NX * NY || pseen[d] || !ok(c, d, li)) continue;
      pseen[d] = 1; stack.push(d);
    }
  }
  const lost = new Uint8Array(NX * NY);
  for (let k = 0; k < lost.length; k++) if (pseen[k] && !near[k]) lost[k] = 1;
  const comps = [];
  const lab = new Int32Array(NX * NY).fill(-1);
  for (let k = 0; k < lost.length; k++) {
    if (!lost[k] || lab[k] >= 0) continue;
    const s = [k]; lab[k] = comps.length; let n = 0, bx = [Infinity, Infinity, -Infinity, -Infinity];
    while (s.length) { const c = s.pop(); n++; const x = X0 + C * (c % NX), y = Y0 + C * ((c / NX) | 0); bx = [Math.min(bx[0], x), Math.min(bx[1], y), Math.max(bx[2], x + C), Math.max(bx[3], y + C)]; for (const d of [c + 1, c - 1, c + NX, c - NX]) if (lost[d] && lab[d] < 0) { lab[d] = comps.length; s.push(d); } }
    comps.push({ n, bx });
  }
  comps.sort((a, b) => b.n - a.n);
  const big = comps.filter((c) => c.n >= 100);
  check('no area of 100+ cells only a point could reach (chokepoints under 32 wide)', big.length === 0, big.slice(0, 6).map((c) => `${c.n} cells at (${c.bx.join(',')})`).join('; '));
  info(`smaller point-only pockets: ${comps.filter((c) => c.n < 100 && c.n >= 16).length} of 16-99 cells${VERBOSE ? ': ' + comps.filter((c) => c.n < 100 && c.n >= 16).map((c) => `${c.n}@(${c.bx[0]},${c.bx[1]})`).join(' ') : ''}`);
}
// CT_PROBE="x,y;x,y": debug a spot at the final stage (box validity, reach, path)
for (const pr of (process.env.CT_PROBE || '').split(';').filter(Boolean)) {
  const [x, y] = pr.split(',').map(Number), k = latOf(x, y);
  console.log(`probe (${x},${y}): valid ${B.valid[k]} floor ${B.fz[k]} ceil ${B.cz[k]} seen ${seen[k]}${seen[k] ? ' path ' + pathTo(k) : ''}`);
}
let reachLat = 0; for (let k = 0; k < LN; k++) if (seen[k]) reachLat++;
info(`reachable box centres: ${(reachLat * 64 / 1e6).toFixed(2)}M sq units; sectors touched ${reachedSectors.size}/${sectors.length}`);

for (const r of results) console.log(r);
console.log(failures ? `FAIL (${failures})` : 'PASS');
process.exit(failures ? 1 : 0);
