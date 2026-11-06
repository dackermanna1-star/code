// Basic survival QA: spawn state, inventory screenshot, needs drain simulation.
const { boot, dumpErrors } = require('./qa-survival-lib.cjs');
(async () => {
  const { b, p, ev, shot, errors } = await boot(process.argv[2] || 5303);
  await p.waitForTimeout(2500);
  await shot('spawn');
  console.log('start', JSON.stringify(await ev(() => H.stats())));
  console.log('inv', JSON.stringify(await ev(() => { const inv = H.g.player.inv; return { hotbar: inv.hotbar.map((s) => s && s.id + 'x' + s.count), eq: inv.equipment.map((s) => s && s.id), storage: inv.storageDescs().map((d) => d.name + ':' + d.slots.map((s) => s ? s.id : '-').join(',')), weight: H.g.player.weight, max: H.g.player.maxWeight }; })));
  // open inventory
  await ev(() => H.g.ui.openPanel('inventory'));
  await p.waitForTimeout(800);
  await shot('inventory');
  await ev(() => H.g.ui.closeAll());
  // needs drain simulation (pure Survival.update, 1 game hour steps of 1 minute)
  const sim = await ev(() => {
    const g = H.g, P = g.player, S = g.survival;
    const save = JSON.parse(JSON.stringify({ hunger: P.hunger, thirst: P.thirst, energy: P.energy, health: P.health, bodyTemp: P.bodyTemp }));
    P.hunger = 100; P.thirst = 100; P.energy = 100;
    const out = [];
    for (let h = 0; h <= 30; h++) {
      if (h % 2 === 0) out.push(`h${h}: hun ${P.hunger.toFixed(0)} thi ${P.thirst.toFixed(0)} en ${P.energy.toFixed(0)} hp ${P.health.toFixed(0)} T ${P.bodyTemp.toFixed(1)} [${P.moodles.map((m) => m.id + m.level).join(' ')}]`);
      for (let k = 0; k < 60; k++) S.update({ dt: 1, dtH: 1 / 60, ambient: 14, indoor: false, raining: 0, nearFire: false, threat: 0, sleeping: false, carryFactor: 1 });
    }
    Object.assign(P, save);
    return out;
  });
  console.log(sim.join('\n'));
  dumpErrors(errors);
  await b.close();
})();
