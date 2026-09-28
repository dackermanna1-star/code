// Route connectivity for each chapter: start -> end distance field finite,
// nav node count, arrows. CHS=0,1,2,3,4 QUALITY=low node tests/play.mjs tests/scen_routes.mjs
export default async ({ page, evalg, wait }) => {
  const chs = (process.env.CHS || '0,1,2,3,4').split(',').map(Number);
  for (const ch of chs) {
    await page.goto((process.env.TEST_URL || 'http://localhost:5180/') + '?autostart=' + ch, { timeout: 180000 });
    for (let i = 0; i < 150; i++) { await wait(1000); if ((await evalg(() => window.session?.state)) === 'playing') break; }
    const r = await evalg(() => {
      const g = window.game, L = g.level, nav = L.nav, f = nav.fields.toExit;
      const s = nav.nearestNode(...L.flowStart, 3), e = nav.nearestNode(...L.flowEnd, 3);
      // walk the route downhill and report the fraction reached
      let n = s, steps = 0;
      while (steps++ < 60000) { const m = nav.descend(f, n); if (m < 0) break; n = m; }
      const endD = Math.hypot(nav.nodeX(n) - L.flowEnd[0], nav.nodeZ(n) - L.flowEnd[2]);
      return { ch: window.session.chapterIdx, nodes: nav.N, startDist: Math.round(f[s]), connected: f[s] < 1e8, routeSteps: steps, endReachedWithin: +endD.toFixed(2), arrows: L.guideArrowCount, errs: g.errCount || 0 };
    });
    console.log('ROUTE', JSON.stringify(r));
  }
};
