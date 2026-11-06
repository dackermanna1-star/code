// Loot balance report.  node dev/items-loot.mjs [table ...] [--n 1000] [--scav 0] [--day 1] [--samples 3]
// Prints sample rolls (fixed seed) and statistics for each table; also writes dev/out/items-loot.txt
import { writeFileSync, mkdirSync } from 'node:fs';
import { LOOT_TABLES, generateLoot } from '../src/items/loot.js';
import { getItemDef, itemDisplayName, itemFreshness } from '../src/items/items.js';
import { makeRng } from '../src/core/rng.js';

const args = process.argv.slice(2);
let n = 1000, scav = 0, day = 1, samples = 3;
const names = [];
for (let i = 0; i < args.length; i++) {
  if (args[i] === '--n') n = +args[++i];
  else if (args[i] === '--scav') scav = +args[++i];
  else if (args[i] === '--day') day = +args[++i];
  else if (args[i] === '--samples') samples = +args[++i];
  else names.push(args[i]);
}
const now = (day - 1) * 24 + 8;
const RANK = { common: 0, uncommon: 1, rare: 2, epic: 3 };

function describe(s) {
  const d = getItemDef(s.id);
  let t = itemDisplayName(s, now);
  if (s.count > 1) t += ` x${s.count}`;
  const extra = [];
  if (d.durability) extra.push(`${Math.round((s.dur / d.durability) * 100)}%`);
  if (d.firearm) extra.push(`${s.ammo}/${d.firearm.magSize} ${s.ammoType.replace('ammo_', '')}`);
  if (d.liquidContainer) extra.push(`${s.uses}u ${s.data?.liquid || 'empty'}`);
  else if (d.uses) extra.push(`${s.uses}/${d.uses}`);
  if (s.age != null) extra.push(`fresh ${Math.round(itemFreshness(s, now) * 100)}%`);
  return extra.length ? `${t} [${extra.join(', ')}]` : t;
}

const lines = [];
const out = (l = '') => { lines.push(l); console.log(l); };
out(`Loot report — n=${n} rolls/table, scavenging=${scav}, day=${day}`);
for (const name of names.length ? names : Object.keys(LOOT_TABLES)) {
  if (!LOOT_TABLES[name]) { out(`?? ${name}`); continue; }
  let empty = 0, stacks = 0, weight = 0;
  const freq = new Map();
  const rarity = [0, 0, 0, 0];
  for (let i = 0; i < n; i++) {
    const res = generateLoot(name, makeRng(1000 + i), { scavenging: scav, day });
    if (!res.length) empty++;
    stacks += res.length;
    for (const s of res) {
      const d = getItemDef(s.id);
      freq.set(s.id, (freq.get(s.id) || 0) + 1);
      rarity[RANK[d.rarity]]++;
      weight += d.weight * s.count;
    }
  }
  const top = [...freq.entries()].sort((a, b) => b[1] - a[1]).slice(0, 10).map(([id, c]) => `${id} ${((c / n) * 100).toFixed(0)}%`).join(', ');
  const tot = rarity.reduce((a, b) => a + b, 0) || 1;
  out(`\n== ${name}  empty ${((empty / n) * 100).toFixed(0)}%  avg ${(stacks / n).toFixed(2)} stacks  avg ${(weight / n).toFixed(1)} kg  ` +
    `rarity c/u/r/e ${rarity.map((r) => ((r / tot) * 100).toFixed(0)).join('/')}%  distinct ${freq.size}`);
  out(`   top: ${top}`);
  for (let k = 0; k < samples; k++) {
    const res = generateLoot(name, makeRng(77 + k * 31), { scavenging: scav, day, size: 8 });
    out(`   #${k + 1}: ${res.length ? res.map(describe).join(' | ') : '(empty)'}`);
  }
}
mkdirSync('dev/out', { recursive: true });
writeFileSync('dev/out/items-loot.txt', lines.join('\n') + '\n');
