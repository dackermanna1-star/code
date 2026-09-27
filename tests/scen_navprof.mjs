export default async ({ page, evalg, wait }) => {
  await page.goto((process.env.TEST_URL || 'http://localhost:5180/') + '?autostart=' + (process.env.CH || 0));
  for (let i = 0; i < 60; i++) { await wait(1000); if ((await evalg(() => window.session?.state)) === 'playing') break; }
  const [x0, z0, x1, z1] = (process.env.L || '104,-2,104,14').split(',').map(Number);
  const r = await evalg(([x0, z0, x1, z1]) => {
    const g = window.game, nav = g.level.nav;
    const out = [];
    const n = Math.ceil(Math.hypot(x1 - x0, z1 - z0) / 0.5);
    for (let i = 0; i <= n; i++) {
      const x = x0 + (x1 - x0) * i / n, z = z0 + (z1 - z0) * i / n;
      const c = nav.colIndex(x, z);
      let s = `${x.toFixed(2)},${z.toFixed(2)}: `;
      for (let m = nav.colStart[c]; m < nav.colStart[c + 1]; m++) {
        let lk = ''; for (let d = 0; d < 8; d++) { const v = nav.links[m * 8 + d]; if (v >= 0) lk += nav.ltype[m * 8 + d]; }
        s += `[${nav.nodeY[m].toFixed(2)} ${nav.fields.toExit[m] >= 1e8 ? 'X' : 'ok'} L${lk}] `;
      }
      out.push(s);
    }
    return out;
  }, [x0, z0, x1, z1]);
  console.log(r.join('\n'));
};
