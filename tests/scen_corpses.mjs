// Visual check: shotgun a group of commons and look at the corpses.
export default async ({ page, evalg, wait, shot }) => {
  await page.goto((process.env.TEST_URL || 'http://localhost:5180/') + '?autostart=0');
  for (let i = 0; i < 90; i++) { await wait(1000); if ((await evalg(() => window.session?.state)) === 'playing') break; }
  await evalg(() => {
    const g = window.game;
    g.cheats.godAll = true; g.director.enabled = false;
    for (const c of [...g.infected.commons]) { c.hp = 0; }
    g.survivors.forEach((s, i) => { if (i) s.teleport(38 + i, 0.15, 34, 0); });
    const P = [40, 0.15, 30]; g.player.teleport(P[0], P[1], P[2], 0); g.player.pitch = -0.5;
    g.player.giveWeapon('autoShotgun');
    const nav = g.level.nav;
    for (let i = 0; i < 6; i++) { const n = nav.nearestNode(38.5 + i * 0.6, 0.15, 26.5, 3); const c = g.infected.spawnCommon(nav.nodeX(n), nav.nodeY[n], nav.nodeZ(n), {}); if (c) c.yaw = 0; }
    g.advance(0.2);
    for (let k = 0; k < 12; k++) { g.testCmd = { fire: true, firePressed: true }; g.player.yaw = Math.sin(k) * 0.3; g.advance(0.3); }
    g.testCmd = null; g.player.yaw = 0; g.player.pitch = -0.55; g.advance(2);
  });
  await wait(500);
  await shot('corpses');
};
