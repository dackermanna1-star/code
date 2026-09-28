// Render N frames at a spot and time each (detect slow/hanging frames).
export default async ({ page, evalg, wait }) => {
  page.on('crash', () => console.log('PAGE CRASHED'));
  await page.goto((process.env.TEST_URL || 'http://localhost:5180/') + '?autostart=1');
  for (let i = 0; i < 90; i++) { await wait(1000); if ((await evalg(() => window.session?.state)) === 'playing') break; }
  await evalg(() => { const g = window.game; g.director.enabled = false; g.cheats.botsIdle = true; g.cheats.god = true; g.hud.show(false); window.session.menu.clear(); g.paused = true; });
  const p = JSON.parse(process.env.P || '[162.2,-6.2,73.2,2.6,-0.3]');
  for (let k = 0; k < 6; k++) {
    const r = await evalg(([x, y, z, yaw, pitch]) => {
      const g = window.game; g.player.teleport(x, y, z, yaw); g.player.pitch = pitch; g.advance(0.1);
      const out = [];
      for (let i = 0; i < 3; i++) { const t0 = performance.now(); g.renderer.render(0.016); out.push(Math.round(performance.now() - t0)); }
      return { out, progs: g.renderer.r.info.programs?.length, lights: g.lights.pool.map((l) => +l.intensity.toFixed(1)) };
    }, p);
    console.log(k, JSON.stringify(r));
    await wait(300);
  }
};
