// Loot sanity: generate every registered container's loot (without opening it) and aggregate per table.
const { boot, dumpErrors } = require('./qa-survival-lib.cjs');
(async () => {
  const { b, ev, errors } = await boot(process.argv[2] || 5303);
  const res = await ev(async () => {
    const g = H.g, w = g.world;
    const { generateLoot, LOOT_TABLES } = await import('/src/items/loot.js');
    const { makeRng, hash32 } = await import('/src/core/rng.js');
    const { BLOCKS } = await import('/src/world/blocks.js');
    const I = __items;
    const by = {};
    let n = 0;
    const itemFreq = {};
    const spoilState = { fresh: 0, stale: 0, rotten: 0 };
    const { IS_CONTAINER } = await import('/src/world/blocks.js');
    const all = new Map(w.containers);
    for (let x = 0; x < w.SX; x++) for (let z = 0; z < w.SZ; z++) for (let y = 18; y < 44; y++) {
      const id = w.get(x, y, z);
      if (!IS_CONTAINER[id]) continue;
      const i = w.idx(x, y, z);
      if (all.has(i)) continue;
      const d = BLOCKS[id];
      all.set(i, { x, y, z, loot: d.container, size: d.slots || 6, unreg: true });
    }
    window.__allContainers = all;
    for (const [, c] of all) {
      n++;
      const rng = makeRng(hash32(w.seed, c.x * 73856093 ^ c.y * 19349663 ^ c.z * 83492791, 99));
      const stacks = generateLoot(c.loot, rng, { scavenging: 0, day: 1, size: c.size });
      const k = (c.unreg ? '*' : '') + c.loot + '/' + (BLOCKS[w.get(c.x, c.y, c.z)]?.name || '?');
      const e = by[k] ||= { n: 0, empty: 0, items: 0, max: 0, full: 0, size: c.size, sample: [] };
      e.n++; if (!stacks.length) e.empty++;
      e.items += stacks.length; e.max = Math.max(e.max, stacks.length); if (stacks.length >= c.size) e.full++;
      if (e.sample.length < 3 && stacks.length) e.sample.push(stacks.map((s) => s.id + (s.count > 1 ? 'x' + s.count : '')).join(','));
      for (const s of stacks) {
        itemFreq[s.id] = (itemFreq[s.id] || 0) + 1;
        const st = I.freshnessState(s, g.time.totalHours); if (st) spoilState[st]++;
      }
    }
    const rows = Object.entries(by).sort((a, b) => b[1].n - a[1].n).map(([k, e]) => `${k.padEnd(34)} n=${String(e.n).padStart(4)} empty=${(e.empty / e.n * 100).toFixed(0).padStart(3)}% avg=${(e.items / e.n).toFixed(1)} max=${e.max}/${e.size} full=${e.full}  e.g. ${e.sample.join(' | ').slice(0, 160)}`);
    const top = Object.entries(itemFreq).sort((a, b) => b[1] - a[1]);
    // key early-game items
    const key = ['can_opener', 'kitchen_knife', 'pocket_knife', 'hunting_knife', 'bandage', 'rag', 'water_bottle', 'canned_beans', 'baseball_bat', 'crowbar', 'hammer', 'backpack_school', 'backpack_hiking', 'lighter', 'matches', 'painkillers', 'disinfectant', 'antibiotics', 'antiviral', 'pistol_m9', 'ammo_9mm', 'flashlight', 'batteries', 'tweezers', 'purification_tablets', 'map_millbrook', 'watch', 'cooking_pot', 'pot', 'suture_kit', 'splint', 'first_aid_kit'];
    // spawn neighbourhood: containers within 60 blocks of the player
    const P = g.player;
    let near = 0, nearItems = 0;
    const nearFreq = {};
    for (const [, c] of all) {
      if (Math.hypot(c.x - P.x, c.z - P.z) > 80) continue;
      near++;
      const rng = makeRng(hash32(w.seed, c.x * 73856093 ^ c.y * 19349663 ^ c.z * 83492791, 99));
      const stacks = generateLoot(c.loot, rng, { scavenging: 0, day: 1, size: c.size });
      nearItems += stacks.length;
      for (const s of stacks) nearFreq[s.id] = (nearFreq[s.id] || 0) + 1;
    }
    return { n, rows, top: top.slice(0, 40).map(([id, c]) => id + ':' + c).join(' '), key: key.map((id) => id + ':' + (itemFreq[id] || 0)).join(' '), spoilState, near, nearItems, nearKey: key.map((id) => id + ':' + (nearFreq[id] || 0)).join(' '), tables: Object.keys(LOOT_TABLES).length, floor: w.floorLoot?.length };
  });
  console.log('containers', res.n, 'tables', res.tables, 'floorLoot', res.floor);
  console.log(res.rows.join('\n'));
  console.log('TOP:', res.top);
  console.log('KEY:', res.key);
  console.log('spoil', JSON.stringify(res.spoilState));
  console.log('near spawn (80m):', res.near, 'containers', res.nearItems, 'stacks');
  console.log('NEAR KEY:', res.nearKey);
  dumpErrors(errors);
  await b.close();
})();
