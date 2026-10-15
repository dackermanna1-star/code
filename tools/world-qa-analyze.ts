// QA analysis of the generated world data (node, no browser): vehicle spawns, props, lots, roads and bridges
// checked against the generated terrain for things a player would notice (cars on slopes / in water / inside
// props, props floating on cliffs or standing in the sea, bridge deck steps, steep roads...).
// Usage: npx vite-node tools/world-qa-analyze.ts
import { BUILDING_FOOTPRINTS } from '../src/core/contracts';
import { buildLayout } from '../src/world/layout/MapData';
import { PROP_FOOTPRINTS } from '../src/world/layout/props';
import { generateTerrain } from '../src/world/terrain/generate';
import { CELL, M, N, WATER_RES, WORLD_SIZE } from '../src/world/terrain/TerrainData';
import { heightAt } from '../src/world/terrain/sample';

const layout = buildLayout();
const t0 = Date.now();
const t = generateTerrain(layout);
console.log(`terrain generated in ${Date.now() - t0} ms`, JSON.stringify(t.timings));
layout.lots.forEach((l, i) => (l.groundY = t.lotGround[i]));
layout.bridges.forEach((b, i) => (b.deckY = t.bridgeDeck[i]));
const h = (x: number, z: number) => heightAt(t.heights, N, CELL, x, z);
const roadAt = (x: number, z: number) => t.roadMask[Math.min(M - 1, Math.max(0, (z / CELL) | 0)) * M + Math.min(M - 1, Math.max(0, (x / CELL) | 0))];
const fromHalf = (v: number) => {
  const s = (v & 0x8000) >> 15, e = (v & 0x7c00) >> 10, f = v & 0x03ff;
  if (e === 0) return (s ? -1 : 1) * Math.pow(2, -14) * (f / 1024);
  if (e === 0x1f) return f ? NaN : (s ? -1 : 1) * Infinity;
  return (s ? -1 : 1) * Math.pow(2, e - 15) * (1 + f / 1024);
};
const shore = (x: number, z: number) => {
  const tex = WORLD_SIZE / WATER_RES;
  const i = Math.min(WATER_RES - 1, Math.max(0, (x / tex) | 0)), j = Math.min(WATER_RES - 1, Math.max(0, (z / tex) | 0));
  return fromHalf(t.water[(j * WATER_RES + i) * 4 + 1]);
};

/** Samples a rotated rectangle footprint: returns min/max terrain height. */
function footprint(x: number, z: number, rot: number, hx: number, hz: number): { min: number; max: number; pts: [number, number][] } {
  const c = Math.cos(rot), s = Math.sin(rot);
  let min = Infinity, max = -Infinity;
  const pts: [number, number][] = [];
  for (let a = -1; a <= 1; a += 0.5)
    for (let b = -1; b <= 1; b += 0.5) {
      const lx = a * hx, lz = b * hz;
      const wx = x + lx * c + lz * s, wz = z - lx * s + lz * c;
      const y = h(wx, wz);
      min = Math.min(min, y);
      max = Math.max(max, y);
      pts.push([wx, wz]);
    }
  return { min, max, pts };
}

function inRect(px: number, pz: number, x: number, z: number, rot: number, hx: number, hz: number, pad = 0): boolean {
  const c = Math.cos(rot), s = Math.sin(rot);
  const dx = px - x, dz = pz - z;
  const lx = dx * c - dz * s, lz = dx * s + dz * c;
  return Math.abs(lx) <= hx + pad && Math.abs(lz) <= hz + pad;
}

/** Exact distance from (x, z) to the nearest road edge (negative on the road). */
function roadEdge(x: number, z: number): number {
  let best = Infinity;
  for (const r of layout.roadDefs) {
    const p = r.points;
    for (let i = 1; i < p.length; i++) {
      const ax = p[i - 1].x, az = p[i - 1].z, bx = p[i].x, bz = p[i].z;
      const dx = bx - ax, dz = bz - az, L2 = dx * dx + dz * dz || 1;
      const t = Math.max(0, Math.min(1, ((x - ax) * dx + (z - az) * dz) / L2));
      const d = Math.hypot(ax + dx * t - x, az + dz * t - z) - r.width / 2;
      if (d < best) best = d;
    }
  }
  return best;
}
/** Distance along a bridge axis beyond its deck ends (negative = on the deck span), for the nearest bridge. */
function nearDeck(x: number, z: number): boolean {
  return layout.bridges.some((br) => {
    const dx = br.b.x - br.a.x, dz = br.b.z - br.a.z, L = Math.hypot(dx, dz);
    const u = ((x - br.a.x) * dx + (z - br.a.z) * dz) / L;
    const v = Math.abs((x - br.a.x) * dz - (z - br.a.z) * dx) / L;
    return u > -4 && u < L + 4 && v < br.width;
  });
}

const issues: string[] = [];
const report = (cat: string, msg: string) => issues.push(`[${cat}] ${msg}`);

// ── vehicle spawns ───────────────────────────────────────────────────────────
for (const v of layout.vehicleSpawns) {
  if (v.kind === 'land') {
    const fp = footprint(v.x, v.z, v.rotationY, 1.0, 2.3); // car ~2 x 4.6 m, length along local Z
    if (fp.max - fp.min > 0.9) report('spawn', `land spawn (${v.x.toFixed(0)},${v.z.toFixed(0)}) on a slope: Δh ${(fp.max - fp.min).toFixed(2)} m`);
    if (fp.min < 0.3) report('spawn', `land spawn (${v.x.toFixed(0)},${v.z.toFixed(0)}) at/below sea level (${fp.min.toFixed(2)})`);
    for (const p of layout.props) {
      const f = PROP_FOOTPRINTS[p.kind];
      if (!f) continue;
      const hx = f.linear ? (p.length ?? 0) / 2 : f.hx;
      for (const [px, pz] of fp.pts) {
        if (inRect(px, pz, p.x, p.z, p.rotationY, hx, f.hz, 0.3)) {
          report('spawn', `land spawn (${v.x.toFixed(0)},${v.z.toFixed(0)}) overlaps prop ${p.kind} at (${p.x.toFixed(0)},${p.z.toFixed(0)})`);
          break;
        }
      }
    }
    for (const l of layout.lots) {
      const f = BUILDING_FOOTPRINTS[l.type];
      if (fp.pts.some(([px, pz]) => inRect(px, pz, l.x, l.z, l.rotationY, f.w / 2, f.d / 2, 0.5)))
        report('spawn', `land spawn (${v.x.toFixed(0)},${v.z.toFixed(0)}) overlaps lot ${l.id} ${l.type}`);
    }
  } else {
    // boat ~ 2.5 x 6 m needs ≥ 0.8 m water everywhere under it
    const fp = footprint(v.x, v.z, v.rotationY, 1.4, 3.2);
    if (fp.max > -0.8) report('spawn', `water spawn (${v.x.toFixed(0)},${v.z.toFixed(0)}) too shallow: bed max ${fp.max.toFixed(2)} m`);
    if (v.x < 15 || v.z < 15 || v.x > WORLD_SIZE - 15 || v.z > WORLD_SIZE - 15) report('spawn', `water spawn (${v.x.toFixed(0)},${v.z.toFixed(0)}) touches the map edge wall`);
  }
}

// ── props ───────────────────────────────────────────────────────────────────
const propStats: Record<string, number> = {};
for (const p of layout.props) {
  propStats[p.kind] = (propStats[p.kind] ?? 0) + 1;
  const f = PROP_FOOTPRINTS[p.kind];
  if (!f) {
    report('prop', `unknown prop kind ${p.kind}`);
    continue;
  }
  const hx = f.linear ? Math.max(0.2, (p.length ?? 0) / 2) : Math.max(0.2, f.hx);
  const fp = footprint(p.x, p.z, p.rotationY, hx, Math.max(0.2, f.hz));
  const g = h(p.x, p.z);
  const level = p.y - g; // props store y = ground (+ stack level)
  if (fp.min < -0.2 && !f.linear) report('prop', `${p.kind} at (${p.x.toFixed(0)},${p.z.toFixed(0)}) partly in water (bed ${fp.min.toFixed(2)})`);
  if (!f.linear && fp.max - fp.min > Math.max(1.0, f.h * 0.35)) report('prop', `${p.kind} at (${p.x.toFixed(0)},${p.z.toFixed(0)}) on a slope Δh ${(fp.max - fp.min).toFixed(2)} m (y lvl ${level.toFixed(1)})`);
  if (f.linear && fp.max - fp.min > 6) report('prop', `${p.kind} len ${p.length?.toFixed(0)} at (${p.x.toFixed(0)},${p.z.toFixed(0)}) spans Δh ${(fp.max - fp.min).toFixed(1)} m`);
  // props on roads (non-linear only: fences may cross driveways)
  if (!f.linear && p.kind !== 'car_wreck') {
    let onRoad = 0;
    for (const [px, pz] of fp.pts) if (roadEdge(px, pz) < 0) onRoad++;
    if (onRoad > 2) report('prop', `${p.kind} at (${p.x.toFixed(0)},${p.z.toFixed(0)}) stands on a road (${onRoad}/25 samples)`);
  }
}
// linear props crossing roads (fence/wall through an asphalt road blocks traffic)
for (const p of layout.props) {
  const f = PROP_FOOTPRINTS[p.kind];
  if (!f?.linear || !p.length) continue;
  const c = Math.cos(p.rotationY), s = Math.sin(p.rotationY);
  let hits = 0;
  for (let a = -p.length / 2; a <= p.length / 2; a += 1) {
    const x = p.x + a * c, z = p.z - a * s;
    if (roadEdge(x, z) < 0) hits++;
  }
  if (hits > 1 && p.kind !== 'guard_rail') report('prop', `${p.kind} len ${p.length.toFixed(0)} at (${p.x.toFixed(0)},${p.z.toFixed(0)}) crosses asphalt (${hits} m)`);
}

// ── lots ────────────────────────────────────────────────────────────────────
for (const l of layout.lots) {
  const f = BUILDING_FOOTPRINTS[l.type];
  // terrain right outside the pad: a big drop/cliff makes doors unreachable
  const out = footprint(l.x, l.z, l.rotationY, f.w / 2 + 4, f.d / 2 + 4);
  if (out.max - l.groundY > 3.5 || l.groundY - out.min > 3.5)
    report('lot', `lot ${l.id} ${l.type} @${l.location ?? '-'} (${l.x.toFixed(0)},${l.z.toFixed(0)}) pad step: ground ${out.min.toFixed(1)}..${out.max.toFixed(1)} vs pad ${l.groundY.toFixed(1)}`);
  // front door (local +Z) should face open ground, i.e. approach not blocked by a steep bank
  const c = Math.cos(l.rotationY), s = Math.sin(l.rotationY);
  const fx = l.x + (f.d / 2 + 3) * s, fz = l.z + (f.d / 2 + 3) * c;
  const dh = Math.abs(h(fx, fz) - l.groundY);
  if (dh > 1.2) report('lot', `lot ${l.id} ${l.type} door approach Δh ${dh.toFixed(2)} m`);
}

// ── roads ───────────────────────────────────────────────────────────────────
for (const r of layout.roadDefs) {
  let maxG = 0, wet = 0, at = '';
  for (let i = 1; i < r.points.length; i++) {
    const a = r.points[i - 1], b = r.points[i];
    const d = Math.hypot(b.x - a.x, b.z - a.z);
    if (d < 0.5) continue;
    if (nearDeck(a.x, a.z) || nearDeck(b.x, b.z)) continue; // the deck carries the road there
    const g = Math.abs(h(b.x, b.z) - h(a.x, a.z)) / d;
    if (g > maxG) {
      maxG = g;
      at = `(${b.x.toFixed(0)},${b.z.toFixed(0)})`;
    }
    if (h(b.x, b.z) < 0.15) wet++;
  }
  if (maxG > (r.kind === 'asphalt' ? 0.2 : 0.3)) report('road', `${r.kind} road ${r.id} ${r.name ?? ''} max grade ${(maxG * 100).toFixed(0)}% at ${at}`);
  if (wet) report('road', `${r.kind} road ${r.id} ${r.name ?? ''}: ${wet} points at/below sea level (not bridged)`);
}

// ── bridges ─────────────────────────────────────────────────────────────────
for (const br of layout.bridges) {
  const L = Math.hypot(br.b.x - br.a.x, br.b.z - br.a.z);
  const tx = (br.b.x - br.a.x) / L, tz = (br.b.z - br.a.z) / L;
  for (const [p, n, dir] of [[br.a, 'a', -1], [br.b, 'b', 1]] as const) {
    // ramp terrain 2 m beyond the deck end must meet the deck top
    const g = h(p.x + tx * 2 * dir, p.z + tz * 2 * dir);
    const step = br.deckY - g;
    if (Math.abs(step) > 0.4) report('bridge', `bridge ${br.id} end ${n}: deck ${br.deckY.toFixed(2)} vs road ${g.toFixed(2)} (step ${step.toFixed(2)} m)`);
  }
}

// ── shoreline / misc ────────────────────────────────────────────────────────
let landEdge = 0;
for (let i = 0; i < N; i += 4) for (const [x, z] of [[i * CELL, 0], [i * CELL, WORLD_SIZE], [0, i * CELL], [WORLD_SIZE, i * CELL]]) if (h(x, z) > 0) landEdge++;
if (landEdge) report('coast', `${landEdge} map-edge samples are above sea level (island touches the edge)`);
void shore;

console.log('props by kind', JSON.stringify(propStats));
console.log(`lots ${layout.lots.length}, props ${layout.props.length}, spawns ${layout.vehicleSpawns.length}, roads ${layout.roadDefs.length}, bridges ${layout.bridges.length}`);
const cats: Record<string, number> = {};
for (const i of issues) {
  const c = i.slice(1, i.indexOf(']'));
  cats[c] = (cats[c] ?? 0) + 1;
}
console.log('ISSUES', JSON.stringify(cats));
for (const i of issues) console.log(i);
