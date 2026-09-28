// Dead Air ch4 nav/collision probe around suspect spots. SPOTS='x,y,z;...' node tests/play.mjs tests/da4_probe.mjs
export default async ({ page, evalg, wait }) => {
  await page.goto((process.env.TEST_URL || 'http://localhost:5180/') + '?campaign=deadair&autostart=3', { timeout: 180000 });
  for (let i = 0; i < 180; i++) { await wait(1000); if ((await evalg(() => window.session?.state)) === 'playing') break; }
  const spots = (process.env.SPOTS || '23.7,7.2,15.7').split(';').map((s) => s.split(',').map(Number));
  const r = await evalg((spots) => {
    const g = window.game, L = g.level, nav = L.nav, col = L.col, out = [];
    const f = nav.fields.toExit, bx = new Float32Array(6);
    const fmtN = (n) => `${nav.nodeX(n).toFixed(2)},${nav.nodeY[n].toFixed(2)},${nav.nodeZ(n).toFixed(2)}`;
    for (const [x, y, z] of spots) {
      out.push(`== ${x},${y},${z}`);
      let n = nav.nearestNode(x, y, z, 2); const path = [];
      for (let k = 0; k < 16 && n >= 0; k++) { path.push(fmtN(n) + ':' + f[n].toFixed(0)); n = nav.descend(f, n); }
      out.push(' field: ' + path.join(' > '));
      const k = col.query(x - 1.2, y + 0.05, z - 1.2, x + 1.2, y + 1.8, z + 1.2, 1);
      for (let i = 0; i < k; i++) { const id = col.scratch[i]; col.getBox(id, bx); out.push(` box#${id} ${Array.from(bx).map((v) => v.toFixed(2)).join(',')} fl ${col.flags[id]}`); }
      for (const d of L.doors) if (Math.hypot(d.cx - x, d.cz - z) < 4 && Math.abs(d.cy - y) < 2) out.push(` door ${d.cx},${d.cy},${d.cz} axis ${d.axis} open ${d.open} ang ${d.angle.toFixed(2)} hinge ${d.hingeSign} dir ${d.dirSign}`);
    }
    return out;
  }, spots);
  console.log((r || []).join('\n'));
};
