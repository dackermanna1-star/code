// Memory soak: render continuously while turning/walking; log JS heap and
// renderer resource counts so leaks show up. CH=4 SECS=60 QUALITY=high
export default async ({ page, evalg, wait }) => {
  await page.goto((process.env.TEST_URL || 'http://localhost:5180/') + '?autostart=' + (process.env.CH || 4), { timeout: 180000 });
  for (let i = 0; i < 120; i++) { await wait(1000); if ((await evalg(() => window.session?.state)) === 'playing') break; }
  const secs = +(process.env.SECS || 60);
  for (let t = 0; t < secs; t += 5) {
    const r = await evalg(() => {
      const g = window.game;
      for (let k = 0; k < 20; k++) { g.player.yaw += 0.3; g.advance(1 / 30); g.renderer.render(1 / 30); }
      const i = g.renderer.r.info;
      return { heapMB: Math.round((performance.memory?.usedJSHeapSize || 0) / 1e6), geos: i.memory.geometries, tex: i.memory.textures, progs: i.programs?.length, calls: i.render.calls, commons: g.infected.commons.length };
    });
    console.log('MEM', t, JSON.stringify(r));
    await wait(500);
  }
};
