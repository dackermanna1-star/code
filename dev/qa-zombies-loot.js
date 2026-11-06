// ---- loot
const { generateLoot, LOOT_TABLES } = await import('/src/items/loot.js');
const { makeRng } = await import('/src/core/rng.js');
const out = {};
for (const t of ['zombie_civilian', 'zombie_police', 'zombie_military', 'zombie_medic', 'zombie_survivor']) {
  let items = 0, empty = 0;
  for (let i = 0; i < 200; i++) { const s = generateLoot(t, makeRng(i * 2654435761 >>> 0), { scavenging: 0, day: 1, size: 6 }); items += s.length; if (!s.length) empty++; }
  out[t] = { exists: !!LOOT_TABLES[t], avg: items / 200, emptyPct: empty / 2 };
}
// how ZombieManager seeds it: (zb.id * 2654435761) >>> 0 with small ids
const ids = [];
for (let id = 1; id < 30; id++) ids.push(generateLoot('zombie_civilian', makeRng((id * 2654435761) >>> 0), { scavenging: 0, day: 1, size: 6 }).length);
out.byId = ids.join(',');
return out;
