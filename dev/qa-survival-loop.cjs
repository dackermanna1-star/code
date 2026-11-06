// Early-game loop playtest: spawn -> nearest house -> open furniture with E -> take loot -> eat / drink -> bandage.
const { boot, dumpErrors } = require('./qa-survival-lib.cjs');
(async () => {
  const { b, p, ev, shot, errors } = await boot(process.argv[2] || 5303);
  await p.waitForTimeout(1000);
  await ev(() => {
    const g = H.g;
    window.__toasts = [];
    const t = g.ui.toast.bind(g.ui);
    g.ui.toast = (txt, type) => { window.__toasts.push(type + ': ' + txt); t(txt, type); };
    g.noSpawn = true; g.zombies.clearAll?.();
    g.chunks.budgetMs = 60;
  });
  const spawn = await ev(() => { const P = H.g.player; return { x: P.x.toFixed(1), y: P.y.toFixed(1), z: P.z.toFixed(1), loc: H.g.location?.name, poi: H.g.world.pois.filter((q) => Math.hypot((q.x0 + q.x1) / 2 - P.x, (q.z0 + q.z1) / 2 - P.z) < 150).map((q) => q.name + '@' + Math.round(Math.hypot((q.x0 + q.x1) / 2 - P.x, (q.z0 + q.z1) / 2 - P.z))).join(', ') }; });
  console.log('spawn', JSON.stringify(spawn));
  // start in a house (seed millbrook spawns on the lake island): teleport to the house spawn point nearest town
  const sp = await ev(() => {
    const g = H.g, w = g.world, P = g.player;
    const pts = w.spawnPoints.filter((s) => w.getZone(Math.floor(s.x), Math.floor(s.z)) !== undefined);
    const idx = +(new URLSearchParams(location.search).get('sp') || 1) % pts.length;
    const s = pts[idx];
    P.x = s.x; P.y = s.y; P.z = s.z; P.yaw = s.yaw || 0; P.vx = P.vy = P.vz = 0;
    return { n: w.spawnPoints.length, x: s.x, y: s.y, z: s.z };
  });
  console.log('house spawn', JSON.stringify(sp));
  await p.waitForTimeout(2500);
  await shot('loop-house-spawn');
  // find the nearest houses' furniture: kitchen cabinets, fridges, wardrobes, medicine cabinets
  const targets = await ev(async () => {
    const g = H.g, w = g.world, P = g.player;
    const { B, BLOCKS, SOLID } = await import('/src/world/blocks.js');
    const want = new Set([B.kitchen_cabinet, B.fridge, B.wardrobe, B.medicine_cabinet, B.dresser, B.kitchen_sink]);
    const found = [];
    for (let r = 2; r < 260 && found.length < 40; r += 2) {
      for (let dx = -r; dx <= r; dx += 1) for (const dz of [-r, r]) for (const [x, z] of [[Math.floor(P.x) + dx, Math.floor(P.z) + dz], [Math.floor(P.x) + dz, Math.floor(P.z) + dx]]) {
        for (let y = 20; y < 32; y++) {
          const id = w.get(x, y, z);
          if (!want.has(id)) continue;
          // standing spot next to it
          for (const [ox, oz] of [[1, 0], [-1, 0], [0, 1], [0, -1]]) {
            const sx = x + ox, sz = z + oz;
            if (!SOLID[w.get(sx, y, sz)] && !SOLID[w.get(sx, y + 1, sz)] && SOLID[w.get(sx, y - 1, sz)]) { found.push({ x, y, z, sx, sz, sy: y, name: BLOCKS[id].name }); break; }
          }
        }
      }
    }
    // keep the ones from the first house (closest cluster)
    const f0 = found[0];
    return found.filter((f) => Math.hypot(f.x - f0.x, f.z - f0.z) < 16).slice(0, 10);
  });
  console.log('house furniture:', targets.map((t) => `${t.name}@${t.x},${t.y},${t.z}`).join(' '));
  const look = (t) => ev((t) => {
    const g = H.g, P = g.player;
    P.x = t.sx + 0.5; P.y = t.sy; P.z = t.sz + 0.5; P.vx = P.vy = P.vz = 0;
    const dx = t.x + 0.5 - P.x, dz = t.z + 0.5 - P.z, dy = t.y + 0.5 - (P.y + P.eye);
    P.yaw = Math.atan2(-dx, -dz); P.pitch = Math.atan2(dy, Math.hypot(dx, dz));
  }, t);
  let i = 0;
  for (const t of targets) {
    await look(t);
    await p.waitForTimeout(i === 0 ? 2500 : 300);
    await p.waitForFunction((t) => { const h = H.g.interact.target?.hit; return h && h.x === t.x && h.y === t.y && h.z === t.z; }, t, { timeout: 8000 }).catch(() => console.log('  (target never matched)'));
    const hud = await ev(() => H.g.hud.interaction);
    await p.keyboard.press('e');
    await p.waitForTimeout(700);
    const st = await ev(() => ({ open: H.g.ui.panels.current, loot: H.g.ui.panels.panels.inventory?.lootDescs?.map((d) => d.name + ':' + d.slots.filter(Boolean).map((s) => s.id + (s.count > 1 ? 'x' + s.count : '')).join(',')).join(' | '), action: H.g.action?.label }));
    console.log(`${t.name}: prompt=${JSON.stringify(hud)} -> ${JSON.stringify(st)}`);
    if (i === 0 && st.open === 'inventory') await shot('loop-loot');
    if (st.open === 'inventory') {
      // take all from the first (world) source
      await ev(() => { const btn = document.querySelector('.inv-loot .sec-take'); btn?.click(); });
      await p.waitForTimeout(300);
      await p.keyboard.press('Escape');
      await p.waitForTimeout(300);
    } else if (st.action) { await ev(() => H.finish()); }
    i++;
  }
  const inv = await ev(() => { const o = []; H.g.player.inv.forEachStack((s) => o.push(s.id + (s.count > 1 ? 'x' + s.count : ''))); return o.join(' ') + ` | weight ${H.g.player.weight.toFixed(1)}/${H.g.player.maxWeight}`; });
  console.log('inventory after looting:', inv);
  await ev(() => H.g.ui.openPanel('inventory'));
  await p.waitForTimeout(700);
  await shot('loop-inv');
  await ev(() => H.g.ui.closeAll());
  // eat something / drink
  const meal = await ev(() => {
    const g = H.g, P = g.player; P.hunger = 45; P.thirst = 45;
    const food = P.inv.find((s) => __items.getItemDef(s.id).food && !__items.getItemDef(s.id).food.raw)[0];
    const drink = P.inv.find((s) => __items.getItemDef(s.id).drink && (s.uses ?? 1) > 0)[0];
    const o = [];
    for (const f of [food, drink]) {
      if (!f) { o.push('none'); continue; }
      const r = H.descOf(f.stack); const acts = g.getItemActions(r.d, r.i).map((a) => a.label + (a.disabled ? '(x)' : ''));
      g.useItem(r.d, r.i); const a = g.action?.label; H.finish();
      o.push(`${f.stack.id} [${acts.join(', ')}] -> ${a} hunger ${P.hunger.toFixed(0)} thirst ${P.thirst.toFixed(0)}`);
    }
    return o.join(' || ') + ' || ' + __toasts.slice(-3).join(' | ');
  });
  console.log('meal:', meal);
  // refill the bottle at the kitchen sink through the bottle's context menu
  const sink = targets.find((t) => t.name === 'kitchen_sink');
  if (sink) {
    await look(sink);
    await p.waitForFunction((t) => { const h = H.g.interact.target?.hit; return h && h.x === t.x && h.y === t.y && h.z === t.z; }, sink, { timeout: 8000 }).catch(() => console.log('  (sink target never matched)'));
    console.log('fill:', await ev(() => {
      const g = H.g, f = H.find('water_bottle'); if (!f) return 'no bottle';
      const before = f.stack.uses; const acts = H.actions(f.stack); const r = H.run(f.stack, 'Fill'); H.finish();
      return `[${acts.join(', ')}] ${r} uses ${before} -> ${f.stack.uses} liquid ${f.stack.data?.liquid} | src ${JSON.stringify(g.interact.nearbyWaterSource())}`;
    }));
  }
  console.log('toasts:', await ev(() => __toasts.join(' | ')));
  dumpErrors(errors);
  await b.close();
})();
