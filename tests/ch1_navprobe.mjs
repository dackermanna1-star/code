// Chapter 1 diagnostics: print nav nodes (height / progress / link types) in a small window.
// PROBE='[x,y,z,r]' (r = half size in metres), optional TP=1 teleports the player there and reports where physics leaves it.
export default async ({ page, evalg, wait }) => {
  await page.goto((process.env.TEST_URL || 'http://localhost:5180/') + '?autostart=0');
  for (let i = 0; i < 90; i++) { await wait(1000); if ((await evalg(() => window.session?.state)) === 'playing') break; }
  const pr = JSON.parse(process.env.PROBE || '[102.8,-6,-14,1.5]');
  const r = await evalg(([x, y, z, r, tp]) => {
    const g = window.game, L = g.level, nav = L.nav, f = nav.fields.toExit;
    const out = [];
    const cs = nav.cs;
    for (let zz = z - r; zz <= z + r + 1e-6; zz += cs) {
      let line = 'z' + (Math.floor((zz - nav.minZ) / cs) * cs + nav.minZ + cs / 2).toFixed(2).padStart(7) + ' ';
      for (let xx = x - r; xx <= x + r + 1e-6; xx += cs) {
        const c = nav.colIndex(xx, zz);
        let cell = '';
        for (let m = nav.colStart[c]; m < nav.colStart[c + 1]; m++) {
          if (Math.abs(nav.nodeY[m] - y) > 2) continue;
          cell += (f[m] >= 1e8 ? 'X' : '') + nav.nodeY[m].toFixed(1);
        }
        line += (cell || '.').padStart(8);
      }
      out.push(line);
    }
    let head = 'x       ';
    for (let xx = x - r; xx <= x + r + 1e-6; xx += cs) head += (Math.floor((xx - nav.minX) / cs) * cs + nav.minX + cs / 2).toFixed(2).padStart(8);
    out.unshift(head);
    if (tp) {
      const n = nav.nearestNode(x, y, z, 3);
      g.cheats.god = true; g.director.enabled = false;
      g.player.teleport(nav.nodeX(n), nav.nodeY[n] + 0.02, nav.nodeZ(n), 0);
      g.advance(1);
      const p = g.player.pos;
      out.push(`tp node ${nav.nodeX(n)},${nav.nodeY[n]},${nav.nodeZ(n)} -> player ${p.x.toFixed(2)},${p.y.toFixed(2)},${p.z.toFixed(2)} nodeAt ${nav.nodeAt(p.x, p.y, p.z)} prog ${L.progressAt(p.x, p.y, p.z).toFixed(3)}`);
    }
    return out;
  }, [...pr, process.env.TP === '1']);
  console.log(r.join('\n'));
};
