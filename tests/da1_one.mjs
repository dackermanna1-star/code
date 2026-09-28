// Single medium-quality frame of Dead Air ch1 with crash/console diagnostics.
export default async ({ page, evalg, wait, shot, logs }) => {
  page.on('crash', () => console.log('PAGE CRASHED'));
  await page.goto((process.env.TEST_URL || 'http://localhost:5180/') + '?campaign=deadair&autostart=0', { timeout: 180000 });
  for (let i = 0; i < 200; i++) { await wait(1000); if ((await evalg(() => window.session?.state)) === 'playing') break; }
  console.log('playing', await evalg(() => ({ q: window.game.quality.name, mem: performance.memory ? Math.round(performance.memory.usedJSHeapSize / 1e6) : -1 })));
  const pos = (process.env.POS || '8.9,18,32.6,4,18.9,26.5').split(',').map(Number);
  await evalg((p) => { const g = window.game, P = g.player; g.director.enabled = false; g.cheats.botsIdle = true; g.cheats.godAll = true; window.session.menu?.clear?.();
    P.teleport(p[0], p[1] + 0.02, p[2], 0); const dx = p[3] - p[0], dy = p[4] - p[1] - 1.6, dz = p[5] - p[2]; P.yaw = Math.atan2(-dx, -dz); P.pitch = Math.atan2(dy, Math.hypot(dx, dz));
    g.survivors.forEach((s, i) => { if (s !== P) s.teleport(p[0] + Math.sin(P.yaw) * 2, p[1] + 0.02, p[2] + Math.cos(P.yaw) * 2, 0); }); g.advance(1); }, pos);
  await wait(3000);
  console.log('frame', await evalg(() => { const g = window.game, r = g.renderer.r; r.info.autoReset = false; r.info.reset(); const t0 = performance.now(); g.renderer.render(0.016); const o = { calls: r.info.render.calls, tris: r.info.render.triangles, ms: Math.round(performance.now() - t0) }; r.info.autoReset = true; return o; }));
  await shot(process.env.NAME || 'da1_one');
  console.log('errors', logs.filter((l) => /error/i.test(l)).slice(0, 5));
};
