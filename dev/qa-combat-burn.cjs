// Burning damage over time (molotov victims) + firecrackers / noise maker sanity.
const { boot } = require('./qa-combat-lib.cjs');
(async () => {
  const T = await boot({ fast: true });
  const s = await T.openSpot();
  await T.tp(s.x, s.y, s.z, 0, 0);
  await T.wait(1500);
  const zi = await T.spawnFront(6);
  await T.ev((zi) => { const z = window.__zmap[zi]; z.hp = z.maxHp = 100; z.outfit = 'civilian'; z.armor = { head: 1, body: 1 }; z.burning = 16.2; z.startChase = () => {}; z.state = 'idle'; window.__c0 = window.game.clock; }, zi);
  for (let k = 0; k < 6; k++) {
    await T.gwait(2);
    console.log(JSON.stringify(await T.ev((zi) => { const z = window.__zmap[zi], g = window.game; return { t: +(g.clock - window.__c0).toFixed(1), hp: +z.hp.toFixed(1), burning: +z.burning.toFixed(1), dead: z.dead, state: z.state, lod: z.lod }; }, zi)));
  }
  // firecrackers
  await T.hold('firecrackers', { count: 2 });
  await T.wait(300);
  await T.ev(() => { const g = window.game; window.__sounds.length = 0; window.__noises = []; const nz = g.zombies.noise.bind(g.zombies); g.zombies.noise = (n) => { window.__noises.push(n.type + ':' + n.radius); return nz(n); }; g.combat.cooldown = 0; g.combat.throwItem(g.player.inv.selectedStack, g.combat.def); });
  await T.gwait(4);
  console.log('firecrackers', JSON.stringify(await T.ev(() => ({ noises: window.__noises.length, sample: window.__noises.slice(0, 3), sounds: window.__sounds.filter((x) => x === 'gun_22').length, proj: window.game.combat.projectiles.map((p) => p.def.id + ':' + p.life.toFixed(1)) }))));
  await T.done();
})();
