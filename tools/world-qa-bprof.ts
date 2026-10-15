// QA helper: terrain profile at every bridge end (relative to the deck) and the roads/lots near each end.
// Usage: npx vite-node tools/world-qa-bprof.ts
import { buildLayout } from '../src/world/layout/MapData';
import { generateTerrain } from '../src/world/terrain/generate';
import { CELL, N } from '../src/world/terrain/TerrainData';
import { heightAt } from '../src/world/terrain/sample';
const layout = buildLayout();
const t = generateTerrain(layout);
const h = (x: number, z: number) => heightAt(t.heights, N, CELL, x, z);
for (const [i, br] of layout.bridges.entries()) {
  const deck = t.bridgeDeck[i];
  const L = Math.hypot(br.b.x - br.a.x, br.b.z - br.a.z);
  const tx = (br.b.x - br.a.x) / L, tz = (br.b.z - br.a.z) / L;
  for (const [p, dir, n] of [[br.a, -1, 'a'], [br.b, 1, 'b']] as const) {
    const row: string[] = [];
    for (let u = -6; u <= 14; u += 1) row.push((h(p.x + tx * u * dir, p.z + tz * u * dir) - deck).toFixed(2));
    console.log(`bridge ${br.id} ${br.kind} end ${n} deck ${deck.toFixed(2)} (u=-6..14 m, rel to deck):`, row.join(' '));
  }
}
// road A1 at (1240,388) and A2 at (598,1442) grade profile
for (const r of layout.roadDefs) {
  if (r.id !== 1 && r.id !== 2 && r.id !== 12) continue;
  const tgt = r.id === 1 ? [1240, 388] : r.id === 2 ? [598, 1442] : [2045, 1190];
  let bi = 0, bd = Infinity;
  r.points.forEach((p, i) => { const d = Math.hypot(p.x - tgt[0], p.z - tgt[1]); if (d < bd) { bd = d; bi = i; } });
  const row: string[] = [];
  for (let i = Math.max(0, bi - 8); i < Math.min(r.points.length, bi + 8); i++) row.push(`${h(r.points[i].x, r.points[i].z).toFixed(1)}`);
  console.log(`road ${r.id} ${r.name} heights around ${tgt}:`, row.join(' '));
}
for (const br of layout.bridges) {
  for (const [p, n] of [[br.a, 'a'], [br.b, 'b']] as const) {
    const near: string[] = [];
    for (const r of layout.roadDefs) {
      let d = Infinity;
      for (const q of r.points) d = Math.min(d, Math.hypot(q.x - p.x, q.z - p.z));
      if (d < 40) near.push(`${r.id}:${r.name ?? r.kind}(${d.toFixed(0)}m)${r.id === br.roadId ? '*' : ''}`);
    }
    console.log(`bridge ${br.id} end ${n} (${p.x.toFixed(0)},${p.z.toFixed(0)}) roads:`, near.join(', '));
  }
}
const lotsNear = layout.lots.filter((l) => layout.bridges.some((br) => Math.hypot(l.x - br.a.x, l.z - br.a.z) < 40 || Math.hypot(l.x - br.b.x, l.z - br.b.z) < 40));
console.log('lots near bridge ends', lotsNear.map((l) => `${l.id} ${l.type} (${l.x.toFixed(0)},${l.z.toFixed(0)})`).join('; '));
