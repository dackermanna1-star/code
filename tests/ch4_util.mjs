// Shared helpers for Chapter 4 tests: boot on the isolated server with the
// game's real-time frame loop throttled (rendering only on demand), which
// keeps CPU use low on a shared machine.
export async function boot(page, evalg, wait, ch = 3) {
  await page.addInitScript(() => {
    window.__ch4r = false;
    setInterval(() => {
      const g = window.game;
      if (g && typeof g.frame === 'function' && !g.__thr) { g.__thr = true; const f = g.frame.bind(g); g.frame = (dt) => { if (window.__ch4r) f(dt); }; }
    }, 30);
  });
  await page.goto((process.env.TEST_URL || 'http://localhost:5184/') + '?autostart=' + ch);
  for (let i = 0; i < 240; i++) { await wait(1000); if ((await evalg(() => window.session?.state)) === 'playing') return true; }
  return false;
}
export async function snap(page, evalg, wait, shot, name) {
  // render exactly one frame synchronously (camera/lights were updated by advance())
  const ms = await evalg(() => { const t = performance.now(); window.game.renderer.render(0.016); return Math.round(performance.now() - t); });
  await wait(200);
  await shot(name);
  return ms;
}
