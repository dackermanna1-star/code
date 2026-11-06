// Survival under attack: a walker mauls the player (wounds, bleeding, HUD), bandage through the health panel,
// rain wetness outdoors, then death (cause on the death screen).
const { boot, dumpErrors } = require('./qa-survival-lib.cjs');
(async () => {
  const { b, p, ev, shot, errors } = await boot(process.argv[2] || 5303);
  await p.waitForTimeout(800);
  await ev(() => {
    const g = H.g;
    window.__toasts = [];
    const t = g.ui.toast.bind(g.ui);
    g.ui.toast = (txt, type) => { window.__toasts.push(type + ': ' + txt); t(txt, type); };
    g.noSpawn = true; g.zombies.clearAll?.();
    // house spawn point (open ground nearby)
    // open ground in town: the street in front of a house spawn point
    const s = g.world.spawnPoints[2]; const P = g.player; P.x = s.x; P.y = s.y; P.z = s.z;
    const w = g.world;
    for (let r = 1; r < 30; r++) { let ok = false; for (let a = 0; a < 16 && !ok; a++) { const x = Math.floor(s.x + Math.cos(a / 16 * 6.28) * r), z = Math.floor(s.z + Math.sin(a / 16 * 6.28) * r); const y = w.surfaceY(x, z); if (w.skyAt(x, y + 1, z) >= 15 && Math.abs(y - s.y) < 3) { P.x = x + 0.5; P.y = y; P.z = z + 0.5; ok = true; } } if (ok) break; }
    H.give('bandage'); H.give('rag');
  });
  await p.waitForTimeout(2000);
  await ev(() => {
    const g = H.g, P = g.player;
    const z = g.zombies.spawn(P.x - Math.sin(P.yaw) * 1.6, P.y, P.z - Math.cos(P.yaw) * 1.6, { variant: 'walker' });
    z.target = { x: P.x, y: P.y, z: P.z }; z.setState?.('chase');
    window.__z = z;
  });
  const t0 = Date.now();
  let hits = 0;
  while (Date.now() - t0 < 60000) {
    await ev(() => H.step(1));
    const s = await ev(() => ({ hp: H.g.player.health, w: H.g.player.wounds.length, state: __z.state, d: Math.hypot(__z.x - H.g.player.x, __z.z - H.g.player.z).toFixed(1) }));
    if (s.w >= 2 || s.hp < 70) { hits = s.w; break; }
  }
  await ev(() => { __z.dead = true; H.g.zombies.clearAll?.(); });
  console.log('after attack:', JSON.stringify(await ev(() => H.stats())));
  console.log('toasts:', await ev(() => __toasts.join(' | ')));
  await shot('fight-hud');
  // bandage through the health panel (real click)
  await p.keyboard.press('h');
  await p.waitForTimeout(800);
  for (let k = 0; k < 3; k++) {
    const btn = await p.$('.wound.bleeding .wound-actions .btn:not(.disabled)');
    if (!btn) break;
    const lbl = await btn.textContent();
    const bb = await btn.boundingBox();
    await p.mouse.move(bb.x + bb.width / 2, bb.y + bb.height / 2); await p.waitForTimeout(150);
    await p.mouse.down(); await p.waitForTimeout(120); await p.mouse.up();
    await p.waitForTimeout(200);
    console.log('clicked', lbl, '->', await ev(() => H.g.action?.label));
    await ev(() => H.finish());
    await p.waitForTimeout(500);
  }
  console.log('after bandaging:', JSON.stringify(await ev(() => H.stats().wounds)));
  await shot('fight-health');
  await p.keyboard.press('Escape');
  // rain
  await ev(() => H.g.weatherSys.set('storm', true));
  const w0 = await ev(() => ({ wet: H.g.player.wetness, indoor: H.g.indoor, rain: H.g.weatherSys.params.rain }));
  await ev(() => H.step(30));
  const w1 = await ev(() => ({ wet: H.g.player.wetness.toFixed(1), indoor: H.g.indoor, rain: H.g.weatherSys.params.rain, game_h: H.g.time.totalHours.toFixed(2) }));
  console.log('rain wetness', JSON.stringify(w0), '->', JSON.stringify(w1));
  // death
  await ev(() => { const P = H.g.player; P.thirst = 0; P.health = 0.5; H.step(30); });
  await p.waitForTimeout(1500);
  console.log('dead:', await ev(() => ({ state: H.g.state, dead: H.g.player.dead, cause: H.g.player.deathCause, screen: document.querySelector('.death:not(.hidden), .death-screen:not(.hidden)')?.textContent?.slice(0, 200) })));
  await shot('fight-death');
  dumpErrors(errors);
  await b.close();
})();
