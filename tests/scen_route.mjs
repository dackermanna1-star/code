// Route connectivity check: ROUTE='[["name",x,y,z],...]' CH=n node tests/play.mjs tests/scen_route.mjs
export default async ({ page, evalg, wait }) => {
  await page.goto((process.env.TEST_URL || 'http://localhost:5180/') + '?autostart=' + (process.env.CH || 0));
  for (let i = 0; i < 90; i++) { await wait(1000); if ((await evalg(() => window.session?.state)) === 'playing') break; }
  const pts = JSON.parse(process.env.ROUTE || '[]');
  const r = await evalg((pts) => {
    const g = window.game, L = g.level, nav = L.nav;
    const out = [`nav nodes ${nav.N}, boxes ${L.col.n}, lights ${L.lights.length}, buildMs ${Math.round(g.loadMs)}`];
    for (const [k, x, y, z] of pts) {
      const n = nav.nearestNode(x, y, z, 1.5);
      out.push(k.padEnd(14) + (n < 0 ? 'NO NODE' : (L.progressAt(nav.nodeX(n), nav.nodeY[n], nav.nodeZ(n)).toFixed(3) + ' y=' + nav.nodeY[n].toFixed(2))));
    }
    return out;
  }, pts);
  console.log(r.join('\n'));
};
