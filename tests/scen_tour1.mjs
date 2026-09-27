// Visual tour of chapter 1: teleport the player to key spots and screenshot.
export default async ({ page, shot, evalg, wait }) => {
  await page.goto('' + (process.env.TEST_URL || 'http://localhost:5180/') + '?autostart=0');
  for (let i = 0; i < 30; i++) { await wait(1000); const st = await evalg(() => window.session?.state); if (st === 'playing') break; }
  await evalg(() => { const g = window.game; g.director.enabled = false; g.cheats.botsIdle = true; g.cheats.god = true; });
  const spots = [
    ['t1_roof', 15, 14.4, 13, 0.3, -0.05],
    ['t2_roof_view', 25, 14.4, 17, 2.4, -0.05],
    ['t3_f3corr', 3, 10.8, 10.4, -1.57, -0.05],
    ['t4_burning', 22.5, 10.8, 12.2, -2.0, -0.15],
    ['t5_f2corr', 20, 7.2, 10.4, -1.57, -0.05],
    ['t6_shaft', 26, 7.2, 8.6, 0.0, -0.4],
    ['t7_lobby', 12, 0, 17, -1.2, -0.05],
    ['t8_street', 19, 0.15, 22, -1.9, -0.05],
    ['t9_street2', 50, 0, 29, -1.57, -0.05],
    ['t10_pharmacy', 41, 0.15, 38.5, 3.14, -0.1],
    ['t11_alley', 40, 0.15, 51, -1.57, -0.05],
    ['t12_grand', 104, 0.15, 30, 0, -0.05],
    ['t13_stairs', 104, 0.15, 14, 0, -0.35],
    ['t14_concourse', 104, -6, -5, 0, -0.05],
    ['t15_saferoom', 103, -6, -25, 0.2, -0.1],
  ];
  for (const [name, x, y, z, yaw, pitch] of spots) {
    await evalg(([x, y, z, yaw, pitch]) => { const g = window.game; g.player.teleport(x, y, z, yaw); g.player.pitch = pitch; g.advance(0.4); }, [x, y, z, yaw, pitch]);
    await wait(700);
    await shot(name);
  }
  console.log(JSON.stringify(await evalg(() => ({ fps: window.game.fps, perf: window.game.perf, calls: window.game.renderer.r.info.render.calls, tris: window.game.renderer.r.info.render.triangles }))));
};
