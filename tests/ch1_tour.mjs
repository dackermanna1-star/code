// Chapter 1 visual tour (QUALITY=medium): teleport to key spots, screenshot.
// SPOTS env (JSON list of [name,x,y,z,yaw,pitch]) overrides the default list; PREFIX names the files.
export default async ({ page, shot, evalg, wait }) => {
  await page.goto((process.env.TEST_URL || 'http://localhost:5180/') + '?autostart=0');
  for (let i = 0; i < 90; i++) { await wait(1000); if ((await evalg(() => window.session?.state)) === 'playing') break; }
  await evalg(() => { const g = window.game; g.director.enabled = false; g.cheats.botsIdle = true; g.cheats.god = true; g.hud?.show?.(false); for (const s of g.survivors) if (s !== g.player) s.teleport(200, -50, 200, 0); });
  const pre = process.env.PREFIX || 'c1';
  const spots = process.env.SPOTS ? JSON.parse(process.env.SPOTS) : [
    ['roof_start', 15, 14.4, 13.5, 0.35, -0.08],
    ['bulkhead', 10.5, 14.4, 8.6, 1.57, -0.05],
    ['f3_corr', 6, 10.8, 10.4, -1.57, -0.05],
    ['burning', 23.3, 10.8, 12.4, -2.3, -0.2],
    ['f2_exit', 21.5, 7.2, 10.6, -1.7, 0.05],
    ['shaft', 25.8, 7.2, 9.0, -2.4, -0.35],
    ['lobby', 24, 0, 12, 2.3, -0.02],
    ['street', 22, 0.15, 23, -2.1, 0.05],
    ['pharmacy', 38, 0, 31, -0.2, 0.05],
    ['subway', 104, 0.15, 19, 0, -0.1],
    ['concourse', 104, -6, -12, 3.14, 0.02],
    ['saferoom', 104.5, -6, -20.5, 0, 0.0],
  ];
  for (const [name, x, y, z, yaw, pitch] of spots) {
    await evalg(([x, y, z, yaw, pitch]) => { const g = window.game; g.player.teleport(x, y + 0.02, z, yaw); g.player.pitch = pitch; g.advance(0.5); }, [x, y, z, yaw, pitch]);
    await wait(900);
    await shot(pre + '_' + name);
  }
};
