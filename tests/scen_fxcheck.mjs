// Quick functional check of the render/prop/clutter upgrade on one chapter:
// errors, clutter stats, draw calls, one screenshot. CH=0 QUALITY=low node tests/play.mjs tests/scen_fxcheck.mjs
export default async ({ page, evalg, wait, shot, logs }) => {
  const ch = +(process.env.CH || 0);
  await page.goto((process.env.TEST_URL || 'http://localhost:5180/') + '?autostart=' + ch, { timeout: 180000 });
  for (let i = 0; i < 150; i++) { await wait(1000); if ((await evalg(() => window.session?.state)) === 'playing') break; }
  const r = await evalg(() => {
    const g = window.game, L = g.level;
    g.director.enabled = false;
    const info = g.renderer.r.info; info.autoReset = false; info.reset(); g.renderer.render(0.016);
    let clutter = 0, cones = 0; L.root.traverse((o) => { if (o.name.startsWith('clutter')) clutter++; if (o.name === 'lightCones') cones++; });
    return { ch: window.session.chapterIdx, loadMs: Math.round(g.loadMs), errs: g.errCount || 0, calls: info.render.calls, ktris: Math.round(info.render.triangles / 1000), clutterMeshes: clutter, clutterStats: L.clutterStats, cones, arrows: L.guideArrowCount, nodes: L.nav.N };
  });
  console.log('CHECK', JSON.stringify(r));
  await wait(500);
  await shot('fxcheck_c' + ch);
  console.log('errors', logs.filter((l) => /error/i.test(l)).length, logs.filter((l) => /error/i.test(l)).slice(0, 3).join(' || ').slice(0, 600));
};
