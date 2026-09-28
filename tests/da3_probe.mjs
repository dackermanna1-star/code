// Dead Air ch3 nav connectivity probe: distance from the start along the route.
export default async ({ page, evalg, wait }) => {
  await page.goto((process.env.TEST_URL || 'http://localhost:5180/') + '?campaign=deadair&autostart=2', { timeout: 180000 });
  for (let i = 0; i < 150; i++) { await wait(1000); if ((await evalg(() => window.session?.state)) === 'playing') break; }
  const out = await evalg((pts) => {
    const g = window.game, L = g.level, nav = L.nav;
    g.noRender = true;
    nav.computeStatic('fromStart', [L.flowStart]);
    const f = nav.fields.fromStart, e = nav.fields.toExit;
    return pts.map((p) => { const n = nav.nearestNode(p[0], p[1], p[2], 1.5); return `${p.join(',')}: n=${n} s=${n >= 0 ? (f[n] >= 1e8 ? 'X' : f[n].toFixed(0)) : '-'} e=${n >= 0 ? (e[n] >= 1e8 ? 'X' : e[n].toFixed(0)) : '-'}`; }).join('\n');
  }, JSON.parse(process.env.PTS || '[]'));
  console.log(out);
};
