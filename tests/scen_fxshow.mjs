// Effects showcase on the ch1 street: muzzle flash + tracer fire, molotov fire,
// explosion (fireball -> smoke), sparks, blood, bullet impacts. Screenshots at
// several moments. QUALITY=medium node tests/play.mjs tests/scen_fxshow.mjs
export default async ({ page, evalg, wait, shot }) => {
  await page.goto((process.env.TEST_URL || 'http://localhost:5180/') + '?autostart=' + (process.env.CH || 0), { timeout: 180000 });
  for (let i = 0; i < 150; i++) { await wait(1000); if ((await evalg(() => window.session?.state)) === 'playing') break; }
  const hide = () => { const g = window.game; g.hud?.clearTransient?.(); if (g.hud?.title) { g.hud.title.style.opacity = 0; g.hud.titleT = 0; } document.querySelectorAll('.subline').forEach((e) => e.remove()); };
  await evalg((hs) => {
    const g = window.game;
    g.director.enabled = false; g.cheats.god = true; g.cheats.godAll = true; g.cheats.botsIdle = true;
    for (const c of g.infected.commons) c.hp = 0;
    g.player.giveWeapon('rifle');
    g.survivors.forEach((s, i) => { if (s !== g.player) s.teleport(14 + i * 1.2, 0.15, 21.6, 0); });
    g.player.teleport(19.5, 0.15, 22.3, Math.PI); // looking +z down the street... yaw pi faces +z
    g.player.pitch = -0.06;
    g.advance(7);
    new Function(hs)();
  }, `(${hide.toString()})()`);
  // 1) explosion just after detonation
  await evalg(() => { const g = window.game; g.combat.explode(21, 0.1, 30, 5, 0, null); g.advance(0.08); });
  await shot('fx_explosion_a');
  await evalg(() => { window.game.advance(0.35); });
  await shot('fx_explosion_b');
  await evalg(() => { window.game.advance(2.5); });
  await shot('fx_explosion_smoke');
  // 2) molotov fire + sparks + blood
  await evalg(() => {
    const g = window.game;
    g.combat.startFire(17, 0.1, 28, 2.5, 30, null);
    g.advance(1.5);
    g.fx.sparks(23, 1.0, 27.5, -1, 0.3, 0, 30);
    g.fx.blood(15, 1.2, 26, 1, 0.3, 0, 2.5);
    g.advance(0.06);
  });
  await shot('fx_fire_sparks');
  // 3) muzzle flash while firing at the wrecked car
  await evalg(() => {
    const g = window.game;
    g.player.yaw = Math.PI - 0.25; g.player.pitch = -0.1;
    g.testCmd = { fire: true, firePressed: true };
    g.advance(0.25);
  });
  await shot('fx_muzzle');
  await evalg(() => { const g = window.game; g.advance(0.05); g.testCmd = null; g.advance(0.4); });
  await shot('fx_impacts');
  const r = await evalg(() => ({ add: window.game.fx.add.n, alpha: window.game.fx.alpha.n, errs: window.game.errCount || 0 }));
  console.log('FX', JSON.stringify(r));
};
