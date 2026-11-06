// Sample loot tables offline (node): average stacks per table, empties, and a few examples.
import { generateLoot, LOOT_TABLES } from '../src/items/loot.js';
import { makeRng } from '../src/core/rng.js';
const tables = process.argv.slice(2).length ? process.argv.slice(2) : Object.keys(LOOT_TABLES).filter((t) => /^zombie_|^corpse_|^floor_|^kitchen$|^fridge$|^medicine_cabinet$|^car_/.test(t));
for (const t of tables) {
  let n = 0, empty = 0, items = 0; const ex = []; const freq = {};
  for (let i = 0; i < 400; i++) {
    const r = generateLoot(t, makeRng(1000 + i), { day: 1, size: 8 });
    n++; if (!r.length) empty++; items += r.length;
    for (const s of r) freq[s.id] = (freq[s.id] || 0) + 1;
    if (ex.length < 3 && r.length) ex.push(r.map((s) => s.id + (s.count > 1 ? 'x' + s.count : '')).join(','));
  }
  const top = Object.entries(freq).sort((a, b) => b[1] - a[1]).slice(0, 8).map(([k, v]) => `${k}:${(v / n * 100).toFixed(0)}%`).join(' ');
  console.log(`${t.padEnd(18)} empty ${(empty / n * 100).toFixed(0).padStart(3)}%  avg ${(items / n).toFixed(2)}  top: ${top}`);
}
