// Dev tool: audit the recreation's floor areas against an original de_dust2.bsp
// from your own install (reference only, nothing is copied into the project).
//
//   node tools/audit-areas.mjs <path/to/de_dust2.bsp> [nameFilter]
//
// For every area of src/map/dust2.js it compares the floor height at a few
// sample points and finds where the original's walls are along each edge
// (player-hull rays cast outward from inside the area). Edges are reported as
// the offset (units) the edge would need to move outward to meet the wall,
// or "open" when no wall is found within 96 units.
import { readFileSync } from 'fs';
import { parseBsp, BspHulls, CONTENTS_SOLID } from '../src/bsp/bsp30.js';
import { buildDust2 } from '../src/map/dust2.js';
import { AreaMap } from '../src/map/areagen.js';

const [bspPath, filter] = process.argv.slice(2);
const buf = readFileSync(bspPath);
const bsp = parseBsp(buf.buffer.slice(buf.byteOffset, buf.byteOffset + buf.byteLength));
const hulls = new BspHulls(bsp);
const head1 = bsp.models[0].headnode[1];
const solid = (x, y, z) => hulls.pointContents(1, head1, [x, y, z]) === CONTENTS_SOLID;

// original floor under (x,y) near height zHint (hull centre search)
function floorNear(x, y, zHint) {
  let best = null;
  for (let z = zHint + 96; z >= zHint - 160; z -= 2) {
    if (solid(x, y, z) && !solid(x, y, z + 2)) {
      let lo = z, hi = z + 2;
      for (let k = 0; k < 6; k++) { const m = (lo + hi) / 2; if (solid(x, y, m)) lo = m; else hi = m; }
      const f = hi - 36;
      if (best == null || Math.abs(f - zHint) < Math.abs(best - zHint)) best = f;
    }
  }
  return best;
}
// distance along dir from p (hull centre at floor+37) to the first solid
function wallDist(x, y, z, dx, dy, max) {
  if (solid(x, y, z)) return null;
  let t = 0;
  while (t < max) { t += 4; if (solid(x + dx * t, y + dy * t, z)) break; }
  if (t >= max) return Infinity;
  let lo = t - 4, hi = t;
  for (let k = 0; k < 6; k++) { const m = (lo + hi) / 2; if (solid(x + dx * m, y + dy * m, z)) hi = m; else lo = m; }
  return lo + 16;
}

const m = buildDust2();
const rows = [];
for (const a of m.areas) {
  if (!a.name || a.name === 'opening' || a.noFloor) continue;
  if (filter && !a.name.includes(filter)) continue;
  const issues = [];
  const inset = 24;
  const pts = [[(a.x0 + a.x1) / 2, (a.y0 + a.y1) / 2], [a.x0 + inset, a.y0 + inset], [a.x1 - inset, a.y0 + inset], [a.x0 + inset, a.y1 - inset], [a.x1 - inset, a.y1 - inset]]
    .filter(([x, y]) => AreaMap.contains(a, x, y));
  const fl = [];
  for (const [x, y] of pts) {
    const mine = AreaMap.floorAt(a, x, y);
    const o = floorNear(x, y, mine);
    fl.push(o == null ? 'none' : Math.round(o - mine));
  }
  const fbad = fl.some((v) => v === 'none' || Math.abs(v) > 6);
  if (a.kind !== 'poly') {
    const sides = { w: [-1, 0], e: [1, 0], s: [0, -1], n: [0, 1] };
    for (const [side, [dx, dy]] of Object.entries(sides)) {
      const offs = [];
      for (const f of [0.2, 0.5, 0.8]) {
        const x = dx ? (dx < 0 ? a.x0 + inset : a.x1 - inset) : a.x0 + (a.x1 - a.x0) * f;
        const y = dy ? (dy < 0 ? a.y0 + inset : a.y1 - inset) : a.y0 + (a.y1 - a.y0) * f;
        const z = AreaMap.floorAt(a, x, y) + 37 + 2;
        const d = wallDist(x, y, z, dx, dy, inset + 96);
        offs.push(d == null ? 'S' : d === Infinity ? 'open' : Math.round(d - inset));
      }
      const nums = offs.filter((v) => typeof v === 'number');
      if (offs.includes('S') || (nums.length && nums.some((v) => Math.abs(v) > 6))) issues.push(`${side}:${offs.join('/')}`);
    }
  }
  if (fbad || issues.length) rows.push(`${a.name.padEnd(18)} ${a.kind.padEnd(6)} [${a.x0},${a.y0}..${a.x1},${a.y1}] z${a.z0}${a.z1 !== a.z0 ? '..' + a.z1 : ''}  floor(o-m): ${fl.join(' ')}  ${issues.join('  ')}`);
}
console.log(rows.join('\n') || 'all areas match');
