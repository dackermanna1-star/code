#!/usr/bin/env node
// Reachability / sanity checker for the CHINATWN map (tools/ct/SPEC.md section 9).
// Loads the built map lumps with the engine's own loader, rasterises it on an
// 8-unit grid (sector per cell via the BSP, blocking per cell move via the
// linedefs) and walks the objective chain stage by stage: doors, breakables,
// ladders and portals become passable at the stage where the script would
// open them. Moves obey DOOM rules: step up <= 24, opening >= 56, no entering
// lethal water (sector special 65).
//
// Usage: node tools/ct/check-map.mjs [map.wad] [--verbose]
//   (default: build/ct/lumps/map/*.lmp)

import fs from 'node:fs';
import path from 'node:path';
import { Wad, WadStack } from '../../src/wad/wad.js';
import { loadMapData, pointInSubsector, ML } from '../../src/game/mapdata.js';

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

const lumps = loadLumps();
const level = loadMapData(lumps, { flatNum: () => 0, textureNum: () => 0 });
const { lines, sectors, vertices, mapthings } = level;

// --- grid --------------------------------------------------------------------
const C = 8;
let minx = Infinity, miny = Infinity, maxx = -Infinity, maxy = -Infinity;
for (const v of vertices) { minx = Math.min(minx, v.x); miny = Math.min(miny, v.y); maxx = Math.max(maxx, v.x); maxy = Math.max(maxy, v.y); }
const GX = Math.floor(minx / C) * C - C, GY = Math.floor(miny / C) * C - C;
const W = Math.ceil((maxx - GX) / C) + 1, H = Math.ceil((maxy - GY) / C) + 1, N = W * H;
const cx = (i) => GX + i * C + C / 2, cy = (j) => GY + j * C + C / 2;
const cellOf = (x, y) => { const i = Math.floor((x - GX) / C), j = Math.floor((y - GY) / C); return (i >= 0 && j >= 0 && i < W && j < H) ? j * W + i : -1; };

// sector per cell (only cells inside some sector's closed area: use the BSP, then
// verify with a ray parity test against that sector's lines)
const SEC = new Int32Array(N).fill(-1);
function insideSector(sec, x, y) {
  let inside = false;
  for (const l of sec.lines) {
    if (l.frontsector === l.backsector) continue;
    const a = l.v1, b = l.v2;
    if ((a.y > y) !== (b.y > y)) { const xi = a.x + (y - a.y) * (b.x - a.x) / (b.y - a.y); if (xi > x) inside = !inside; }
  }
  return inside;
}
for (let j = 0; j < H; j++) {
  for (let i = 0; i < W; i++) {
    const x = cx(i), y = cy(j);
    const ss = pointInSubsector(level, x, y);
    const s = ss.sector;
    // fast path: point inside the subsector polygon is inside the sector
    const P = ss.poly;
    let ok = false;
    if (P && P.length >= 3) {
      let area = 0; for (let k = 0; k < P.length; k++) { const p = P[k], q = P[(k + 1) % P.length]; area += p.x * q.y - q.x * p.y; }
      ok = true;
      for (let k = 0; k < P.length && ok; k++) { const a = P[k], q = P[(k + 1) % P.length]; const cr = (q.x - a.x) * (y - a.y) - (q.y - a.y) * (x - a.x); if (cr * Math.sign(area) < -1e-6) ok = false; }
    }
    if (ok) SEC[j * W + i] = s.index;
  }
}

// --- line crossings per cell move -----------------------------------------------
// XL[k]: lines crossed moving from cell k to k+1 (east); YL[k]: k to k+W (north)
const XL = new Map(), YL = new Map();
const add = (m, k, li) => { const a = m.get(k); if (a) { if (!a.includes(li)) a.push(li); } else m.set(k, [li]); };
function segInter(ax, ay, bx, by, l) {
  const cx1 = l.v1.x, cy1 = l.v1.y, dx2 = l.dx, dy2 = l.dy;
  const dx1 = bx - ax, dy1 = by - ay;
  const den = dx1 * dy2 - dy1 * dx2;
  if (!den) return false;
  const t = ((cx1 - ax) * dy2 - (cy1 - ay) * dx2) / den;
  const u = ((cx1 - ax) * dy1 - (cy1 - ay) * dx1) / den;
  return t >= 0 && t <= 1 && u >= 0 && u <= 1;
}
lines.forEach((l, li) => {
  const i0 = Math.floor((Math.min(l.v1.x, l.v2.x) - GX) / C) - 1, i1 = Math.floor((Math.max(l.v1.x, l.v2.x) - GX) / C) + 1;
  const j0 = Math.floor((Math.min(l.v1.y, l.v2.y) - GY) / C) - 1, j1 = Math.floor((Math.max(l.v1.y, l.v2.y) - GY) / C) + 1;
  const long = (i1 - i0) * (j1 - j0) > 4096;
  for (let j = j0; j <= j1; j++) {
    for (let i = i0; i <= i1; i++) {
      if (i < 0 || j < 0 || i >= W || j >= H) continue;
      if (long) {
        // distance of the cell centre to the line must be small
        const px = cx(i), py = cy(j);
        const d = Math.abs(l.dy * (px - l.v1.x) - l.dx * (py - l.v1.y)) / l.length;
        if (d > 12) continue;
      }
      const k = j * W + i;
      if (i + 1 < W && segInter(cx(i), cy(j), cx(i + 1), cy(j), l)) add(XL, k, li);
      if (j + 1 < H && segInter(cx(i), cy(j), cx(i), cy(j + 1), l)) add(YL, k, li);
    }
  }
});

// --- door / special tables ---------------------------------------------------------
const doorTags = new Set([1, 2, 3, 4, 5, 6, 7]);
const lowestNeighbourCeil = (s) => {
  let m = Infinity;
  for (const l of s.lines) { const o = l.frontsector === s ? l.backsector : l.frontsector; if (o && o !== s) m = Math.min(m, o.ceilingheight); }
  return m === Infinity ? s.ceilingheight : m;
};
// sectors that are DR doors (lines with special 1 touching them on the back side)
const drDoor = new Set();
for (const l of lines) if (l.special === 1 && l.backsector) drDoor.add(l.backsector.index);
const portals = new Map();
for (const l of lines) if (l.special === 900) { const a = portals.get(l.tag) || []; a.push(l); portals.set(l.tag, a); }

function sectorTop(s, st) {
  if ((s.tag && doorTags.has(s.tag) && st.doors.has(s.tag)) || drDoor.has(s.index)) return Math.max(s.ceilingheight, lowestNeighbourCeil(s) - 4);
  return s.ceilingheight;
}

// --- BFS -------------------------------------------------------------------------------------
const pointSide = (l, x, y) => (l.dy * (x - l.v1.x) - l.dx * (y - l.v1.y) > 0 ? 0 : 1); // 0 = front (right)
function portalDest(l, fromSide, x0, y0, x1, y1) {
  const mid = (q) => [q.v1.x + q.dx / 2, q.v1.y + q.dy / 2];
  const [mx, my] = mid(l);
  let partner = null, best = -1;
  for (const p of portals.get(l.tag) || []) { const [px, py] = mid(p); const d = Math.hypot(px - mx, py - my); if (p !== l && d > best) { best = d; partner = p; } }
  if (!partner) return -1;
  // fraction along l where the move crosses it
  const dx1 = x1 - x0, dy1 = y1 - y0;
  const den = dx1 * l.dy - dy1 * l.dx;
  const t = ((l.v1.x - x0) * dy1 - (l.v1.y - y0) * dx1) / den;
  const px = partner.v1.x + partner.dx * t, py = partner.v1.y + partner.dy * t;
  const nx = partner.dy / partner.length, ny = -partner.dx / partner.length; // front normal
  const s = fromSide === 0 ? -1 : 1; // front->back lands on partner's back side
  return cellOf(px + nx * s * 6, py + ny * s * 6);
}

let PARENT = null;
function bfs(st, starts) {
  const seen = new Uint8Array(N);
  const parent = PARENT = new Int32Array(N).fill(-1);
  const q = new Int32Array(N);
  let qh = 0, qt = 0;
  for (const s of starts) if (s >= 0 && SEC[s] >= 0 && !seen[s]) { seen[s] = 1; q[qt++] = s; }
  const tryMove = (k, n, crossed) => {
    if (n < 0 || seen[n] || SEC[n] < 0) return;
    const A = sectors[SEC[k]], B = sectors[SEC[n]];
    let dest = n;
    if (crossed) {
      for (const li of crossed) {
        const l = lines[li];
        if (!l.back) return; // one-sided
        if (l.special === 900) {
          const side = pointSide(l, cx(k % W), cy((k / W) | 0));
          const d = portalDest(l, side, cx(k % W), cy((k / W) | 0), cx(n % W), cy((n / W) | 0));
          if (d >= 0 && SEC[d] >= 0) dest = d;
          continue;
        }
        if (l.flags & ML.BLOCKING) {
          if (l.special === 903 && st.broken.has(l.tag)) continue;
          return;
        }
      }
    }
    if (seen[dest]) return;
    const D = sectors[SEC[dest]];
    if (D.special === 65) return;
    if (D.floorheight - A.floorheight > 24) return;
    const top = Math.min(sectorTop(A, st), sectorTop(D, st)), bot = Math.max(A.floorheight, D.floorheight);
    if (top - bot < 56 || sectorTop(D, st) - D.floorheight < 56) return;
    seen[dest] = 1; parent[dest] = k; q[qt++] = dest;
  };
  while (qh < qt) {
    const k = q[qh++];
    const i = k % W;
    tryMove(k, i + 1 < W ? k + 1 : -1, XL.get(k));
    tryMove(k, i > 0 ? k - 1 : -1, XL.get(k - 1));
    tryMove(k, k + W < N ? k + W : -1, YL.get(k));
    tryMove(k, k - W >= 0 ? k - W : -1, YL.get(k - W));
    // ladders: from cells in front of an enabled ladder line to its landing
    const lad = ladderAt.get(k);
    if (lad) for (const l of lad) if (st.ladders.has(l.tag)) for (const d of landing(l.tag)) if (!seen[d]) { seen[d] = 1; parent[d] = k; q[qt++] = d; }
  }
  return seen;
}

// ladder lines: cells within 40 units in front of them
const ladderAt = new Map();
for (const l of lines) {
  if (l.special !== 902) continue;
  const nx = l.dy / l.length, ny = -l.dx / l.length;
  for (let t = 0.1; t <= 0.9; t += 0.1) for (let d = 8; d <= 40; d += 8) {
    const k = cellOf(l.v1.x + l.dx * t + nx * d, l.v1.y + l.dy * t + ny * d);
    if (k >= 0) { const a = ladderAt.get(k) || []; if (!a.includes(l)) a.push(l); ladderAt.set(k, a); }
  }
}
const landingCache = new Map();
function landing(tag) {
  if (landingCache.has(tag)) return landingCache.get(tag);
  const out = [];
  for (const t of mapthings) {
    if (t.type !== 9061) continue;
    const k = cellOf(t.x, t.y);
    if (k >= 0 && SEC[k] >= 0 && sectors[SEC[k]].tag === tag) out.push(k);
  }
  landingCache.set(tag, out);
  return out;
}

// --- targets ------------------------------------------------------------------------------
const useLines = (special, tag) => lines.filter((l) => l.special === special && l.tag === tag);
function lineFrontCells(l, depth = 48) {
  const nx = l.dy / l.length, ny = -l.dx / l.length;
  const out = [];
  for (let t = 0.1; t <= 0.91; t += 0.2) for (let d = 4; d <= depth; d += 8) {
    const k = cellOf(l.v1.x + l.dx * t + nx * d, l.v1.y + l.dy * t + ny * d);
    if (k >= 0) out.push(k);
  }
  return out;
}
function lineSideCells(l, side, depth = 24) {
  const s = side === 0 ? 1 : -1;
  const nx = s * l.dy / l.length, ny = -s * l.dx / l.length;
  const out = [];
  for (let t = 0.05; t <= 0.96; t += 0.05) for (let d = 4; d <= depth; d += 8) {
    const k = cellOf(l.v1.x + l.dx * t + nx * d, l.v1.y + l.dy * t + ny * d);
    if (k >= 0) out.push(k);
  }
  return out;
}
const thingCells = (type) => mapthings.filter((t) => t.type === type).map((t) => ({ t, cells: [-16, 0, 16].flatMap((dx) => [-16, 0, 16].map((dy) => cellOf(t.x + dx, t.y + dy))) }));
const anySeen = (seen, cells) => cells.some((k) => k >= 0 && seen[k]);

// --- stages -------------------------------------------------------------------------------
const start = mapthings.find((t) => t.type === 1);
if (!start) { console.log('FAIL: no player start'); process.exit(1); }
const st = { doors: new Set([3]), broken: new Set(), ladders: new Set([81]) };
let seen = null;
const results = [];
let failures = 0;
const reach = () => { seen = bfs(st, [cellOf(start.x, start.y)]); };
function check(name, ok, detail = '') {
  if (process.env.CT_DUMP_AT && name.startsWith(process.env.CT_DUMP_AT)) dumpReach();
  results.push(`${ok ? 'ok  ' : 'FAIL'} ${name}${detail ? ' — ' + detail : ''}`);
  if (!ok) failures++;
  return ok;
}
const useOk = (special, tag) => {
  const ls = useLines(special, tag);
  if (!ls.length) return [false, 'no such line'];
  lastCells = ls.flatMap((l) => lineFrontCells(l));
  return [ls.some((l) => anySeen(seen, lineFrontCells(l))), `${ls.length} line(s)`];
};
const crossOk = (tag) => {
  const ls = useLines(905, tag);
  if (!ls.length) return [false, 'no such line'];
  lastCells = ls.flatMap((l) => lineSideCells(l, 1));
  return [ls.some((l) => anySeen(seen, lineSideCells(l, 0)) && anySeen(seen, lineSideCells(l, 1))), `${ls.length} line(s)`];
};
const breakOk = (tag) => {
  const ls = useLines(903, tag);
  if (!ls.length) return [false, 'no such line'];
  return [ls.some((l) => anySeen(seen, lineSideCells(l, 0)) || anySeen(seen, lineSideCells(l, 1))), `${ls.length} line(s)`];
};
const thingOk = (type, all = true) => {
  const T = thingCells(type);
  if (!T.length) return [false, 'none placed'];
  const ok = T.map((x) => anySeen(seen, x.cells));
  return [all ? ok.every(Boolean) : ok.some(Boolean), T.map((x, i) => `(${x.t.x},${x.t.y})${ok[i] ? '' : ' UNREACHABLE'}`).join(' ')];
};
const sectorTagOk = (tag) => {
  for (let k = 0; k < N; k++) if (seen[k] && sectors[SEC[k]].tag === tag) return [true, ''];
  return [false, 'not reached'];
};

function pathTo(cells) {
  const k0 = cells.find((k) => k >= 0 && seen[k]);
  if (k0 === undefined) return '';
  const pts = [];
  for (let k = k0, n = 0; k >= 0 && n < 100000; k = PARENT[k], n++) pts.push(k);
  pts.reverse();
  const step = Math.max(1, Math.floor(pts.length / 40));
  return pts.filter((_, i) => i % step === 0).map((k) => `(${cx(k % W)},${cy((k / W) | 0)})`).join(' ');
}
let lastCells = [];
const not = ([ok, d]) => [!ok, ok ? 'LEAK: reachable too early; path: ' + (VERBOSE ? pathTo(lastCells) : '(--verbose shows the path)') : 'gated'];
reach();
check('1. start inside the map', SEC[cellOf(start.x, start.y)] >= 0, `(${start.x},${start.y})`);
check('1. chain gate 903/50 reachable', ...breakOk(50));
check('1. (gate shut) elevator button 904/1 not reachable yet', ...not(useOk(904, 1)));
st.broken.add(50); reach();
check('1. elevator button 904/1 reachable', ...useOk(904, 1));
check('1. (door 1 shut) street not reachable yet', ...not(crossOk(130)));
st.doors.add(1); reach();
check('1. portal 100 pair exists', (portals.get(100) || []).length === 2, `${(portals.get(100) || []).length} lines`);
check('1. street reached: 905/130 crossable', ...crossOk(130));
check('2. gas can spots 9040 (all 3) reachable', ...thingOk(9040));
check('2. generator panel 904/2 reachable', ...useOk(904, 2));
check('2. gate button 904/3 reachable', ...useOk(904, 3));
check('2. (gate 2 shut) east Chinatown not reachable yet (904/4)', ...not(useOk(904, 4)));
check('2. (gate 2 shut) market St ambush line 905/140 not crossable yet', ...not(crossOk(140)));
st.doors.add(2); reach();
check('3. ladder switch 904/4 reachable (warehouse route)', ...useOk(904, 4));
check('3. shortcut button 904/5 reachable', ...useOk(904, 5));
check('3. (ladder up) north side not reachable yet (board 903/51)', ...not(breakOk(51)));
check('3. (ladder up) landing 80 not reachable yet', ...not(sectorTagOk(80)));
st.doors.add(4); reach();
check('3. roadblock ladder 902/80 front reachable', ...useOk(902, 80));
st.ladders.add(80); reach();
check('3. ladder 80 landing (sector tag 80) reached', ...sectorTagOk(80));
check('3. 905/131 crossable', ...crossOk(131));
check('4. pre-sewer board 903/51 reachable', ...breakOk(51));
check('4. (board up) sewers not reachable yet (903/54)', ...not(breakOk(54)));
st.broken.add(51); reach();
check('4. portal 101 pair exists', (portals.get(101) || []).length === 2, `${(portals.get(101) || []).length} lines`);
check('4. sewer plank 903/54 reachable', ...breakOk(54));
check('4. sewer exit ladder 902/81 front reachable (plank intact)', ...useOk(902, 81));
check('4. ladder 81 landing (sector tag 81) reached', ...sectorTagOk(81));
check('4. 905/132 crossable', ...crossOk(132));
check('4. back-room button 904/6 reachable', ...useOk(904, 6));
check('4. (boards up) laundromat side: padlock 904/7 not reachable yet', ...not(useOk(904, 7)));
st.broken.add(54); st.doors.add(5); reach();
check('5. laundromat boards 903/53 reachable', ...breakOk(53));
st.broken.add(53); st.broken.add(56); reach();
check('5. medical room boards 903/52 reachable', ...breakOk(52));
st.broken.add(52); reach();
check('5. blowtorch spots 9042 (both) reachable', ...thingOk(9042));
check('5. padlock 904/7 reachable', ...useOk(904, 7));
check('5. crank 904/8 reachable', ...useOk(904, 8));
check('5. (weld gate shut) docks not reachable yet (905/133)', ...not(crossOk(133)));
check('5. (weld gate shut) radio not reachable yet', ...not(useOk(904, 10)));
st.doors.add(6); reach();
check('5. docks reached: 905/133 crossable', ...crossOk(133));
check('6. plug 9041 reachable (partition intact)', ...thingOk(9041));
check('6. socket 904/9 reachable', ...useOk(904, 9));
check('6. radio 904/10 reachable', ...useOk(904, 10));
check('6. extraction zone (sector tag 160, special 66) reachable', ...sectorTagOk(160));
check('6. dock boards 903/55 reachable', ...breakOk(55));
st.broken.add(55); st.broken.add(57); st.doors.add(7); reach();

// --- sanity ------------------------------------------------------------------------------------
const reachedSectors = new Set(); for (let k = 0; k < N; k++) if (seen[k]) reachedSectors.add(SEC[k]);
const ext = sectors.filter((s) => s.tag === 160);
check('extraction sector has special 66', ext.length > 0 && ext.every((s) => s.special === 66));
const lowCeil = [...reachedSectors].filter((i) => { const s = sectors[i]; return sectorTop(s, st) - s.floorheight < 56; });
check('no reachable sector lower than 56', lowCeil.length === 0, lowCeil.slice(0, 5).join(','));
const zombies = mapthings.filter((t) => t.type >= 9000 && t.type <= 9005);
const zOut = zombies.filter((t) => { const k = cellOf(t.x, t.y); return k < 0 || SEC[k] < 0; });
check('all zombies inside sectors', zOut.length === 0, `${zOut.length}/${zombies.length} outside`);
const zUnreach = zombies.filter((t) => !anySeen(seen, [cellOf(t.x, t.y)]));
results.push(`info zombies: ${zombies.length} (easy ${zombies.filter((t) => t.options & 1).length}, medium ${zombies.filter((t) => t.options & 2).length}, hard ${zombies.filter((t) => t.options & 4).length}); not on the player's reachable area: ${zUnreach.length}`);
const pick = mapthings.filter((t) => t.type < 9000 && t.type !== 1);
const pUnreach = pick.filter((t) => !anySeen(seen, [cellOf(t.x, t.y)]));
results.push(`info pickups: ${pick.length}, unreachable: ${pUnreach.length} ${pUnreach.slice(0, 8).map((t) => `${t.type}@(${t.x},${t.y})`).join(' ')}`);
let reachCells = 0, totalCells = 0; for (let k = 0; k < N; k++) { if (SEC[k] >= 0) { totalCells++; if (seen[k]) reachCells++; } }
results.push(`info reachable area: ${(reachCells * 64 / 1e6).toFixed(2)}M of ${(totalCells * 64 / 1e6).toFixed(2)}M sq units (sectors ${reachedSectors.size}/${sectors.length})`);

for (const r of results) console.log(r);
console.log(failures ? `FAIL (${failures})` : 'PASS');
function dumpReach() {
  fs.writeFileSync(path.join(ROOT, 'build/ct/check-reach.json'), JSON.stringify({ GX, GY, W, H, C }));
  fs.writeFileSync(path.join(ROOT, 'build/ct/check-reach.bin'), Buffer.from(seen.buffer));
}
if (VERBOSE && !process.env.CT_DUMP_AT) dumpReach();
process.exit(failures ? 1 : 0);
