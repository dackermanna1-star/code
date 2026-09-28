// Chapter 1 visual tour (QUALITY=medium): teleport to key spots, screenshot.
// SPOTS env (JSON list of [name,x,y,z,yaw,pitch]) overrides the default list; PREFIX names the files.
export default async ({ page, shot, evalg, wait }) => {
  await page.goto((process.env.TEST_URL || 'http://localhost:5180/') + '?autostart=0');
  for (let i = 0; i < 90; i++) { await wait(1000); if ((await evalg(() => window.session?.state)) === 'playing') break; }
  await evalg(() => { const g = window.game; g.director.enabled = false; g.cheats.botsIdle = true; g.cheats.god = true; g.hud?.show?.(false); for (const s of g.survivors) if (s !== g.player) s.teleport(200, -50, 200, 0); });
  const pre = process.env.PREFIX || 'c1';
  const spots = process.env.SPOTS ? JSON.parse(process.env.SPOTS) : [
    ['roof_start', 15, 14.4, 13.5, 0.35, -0.08],
    ['f3_corr', 6, 10.8, 10.4, -1.57, -0.05],
    ['burning', 24.3, 10.8, 12.3, -2.24, -0.3],
    ['f2_exit', 21.5, 7.2, 10.6, -1.57, 0.05],
    ['shaft', 25.8, 7.2, 9.1, -1.57, -0.12],
    ['lobby', 21, 0, 14.5, -0.69, 0.05],
    ['street', 22, 0.15, 23, -2.1, 0.05],
    ['roadblock', 60, 0, 28.5, -1.57, 0.05],
    ['grand', 101.5, 0, 50, 0.1, 0.02],
    ['saferoom', 104.5, -6, -20.5, 0, 0.0],
  ];
  for (const [name, x, y, z, yaw, pitch] of spots) {
    await evalg(([x, y, z, yaw, pitch]) => { const g = window.game; g.player.teleport(x, y + 0.02, z, yaw); g.player.pitch = pitch; g.advance(0.5); }, [x, y, z, yaw, pitch]);
    await wait(900);
    await shot(pre + '_' + name);
  }
};
