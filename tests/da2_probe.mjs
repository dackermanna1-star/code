// Nav probe for Dead Air ch2: SEG='[x0,y0,z0,x1,y1,z1]' samples a segment, or PROBE='[[x,y,z],...]'.
export default async ({ page, evalg, wait }) => {
  await page.goto((process.env.TEST_URL || 'http://localhost:5180/') + '?campaign=deadair&autostart=1', { timeout: 180000 });
  for (let i = 0; i < 150; i++) { await wait(1000); if ((await evalg(() => window.session?.state)) === 'playing') break; }
  const r = await evalg(([seg, probe]) => {
    const g = window.game, L = g.level, nav = L.nav, f = nav.fields.toExit;
    const pts = [];
    if (seg) { const [x0, y0, z0, x1, y1, z1] = seg; const n = Math.ceil(Math.hypot(x1 - x0, z1 - z0) / 0.5); for (let i = 0; i <= n; i++) { const t = i / n; pts.push([x0 + (x1 - x0) * t, y0 + (y1 - y0) * t, z0 + (z1 - z0) * t]); } }
    for (const p of probe || []) pts.push(p);
    const out = [];
    for (const [x, y, z] of pts) {
      const n = nav.nodeAt(x, y, z);
      if (n < 0) { out.push(`${x.toFixed(2)},${z.toFixed(2)} NO NODE`); continue; }
      const links = [];
      for (let d = 0; d < 8; d++) { const m = nav.links[n * 8 + d]; links.push(m < 0 ? '.' : (nav.ltype[n * 8 + d] === 0 ? 'w' : nav.ltype[n * 8 + d] === 1 ? 'c' : 'd')); }
      out.push(`${x.toFixed(2)},${z.toFixed(2)} y=${nav.nodeY[n].toFixed(2)} ${f[n] < 1e8 ? 'OK ' + f[n].toFixed(1) : 'INF'} links[+x,-x,+z,-z,diag]=${links.join('')}`);
    }
    return out;
  }, [process.env.SEG ? JSON.parse(process.env.SEG) : null, process.env.PROBE ? JSON.parse(process.env.PROBE) : null]);
  console.log((r || ['eval failed']).join('\n'));
};
