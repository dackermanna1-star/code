export default async ({ page, evalg, wait }) => {
  await page.goto((process.env.TEST_URL || 'http://localhost:5180/') + '?autostart=' + (process.env.CH || 0));
  for (let i = 0; i < 60; i++) { await wait(1000); if ((await evalg(() => window.session?.state)) === 'playing') break; }
  const [cx, cy, cz, R] = (process.env.P || '103,-6,-24,2').split(',').map(Number);
  const r = await evalg(([cx, cy, cz, R]) => {
    const g = window.game, nav = g.level.nav, col = g.level.col;
    const rows = [];
    for (let z = cz - R; z <= cz + R; z += 0.5) {
      let row = z.toFixed(2).padStart(7) + ' ';
      for (let x = cx - R; x <= cx + R; x += 0.5) {
        const n = nav.nodeAt(x, cy, z);
        if (n < 0 || Math.abs(nav.nodeY[n] - cy) > 1) { row += '  .  '; continue; }
        let lk = 0; for (let d = 0; d < 8; d++) if (nav.links[n * 8 + d] >= 0) lk++;
        const f = nav.fields.toExit[n];
        row += (f >= 1e8 ? 'X' : 'o') + lk + (nav.doorOf[n] >= 0 ? 'D' : ' ') + '  ';
      }
      rows.push(row);
    }
    // colliders near
    const k = col.query(cx - R, cy, cz - R, cx + R, cy + 2.5, cz + R, 1);
    const boxes = [];
    for (let j = 0; j < k; j++) { const i = col.scratch[j]; boxes.push(Array.from(col.b.slice(i * 6, i * 6 + 6)).map((v) => v.toFixed(2)).join(',')); }
    return { rows, boxes: boxes.slice(0, 30), dyn: g.level.col.dynamic.length };
  }, [cx, cy, cz, R]);
  console.log(r.rows.join('\n'));
  console.log(r.boxes.join('\n'));
};
