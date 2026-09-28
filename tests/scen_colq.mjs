// List colliders in a box: B='x0,y0,z0,x1,y1,z1' CH=0
export default async ({ page, evalg, wait }) => {
  await page.goto((process.env.TEST_URL || 'http://localhost:5180/') + '?autostart=' + (process.env.CH || 0));
  for (let i = 0; i < 90; i++) { await wait(1000); if ((await evalg(() => window.session?.state)) === 'playing') break; }
  console.log(await evalg((b) => {
    const col = window.game.level.col;
    const k = col.query(b[0], b[1], b[2], b[3], b[4], b[5], 0xffff);
    const out = [];
    for (let j = 0; j < k; j++) { const i = col.scratch[j]; out.push('static ' + Array.from(col.b.slice(i * 6, i * 6 + 6)).map((v) => v.toFixed(2)).join(',') + ' f' + (col.flags ? col.flags[i] : '?')); }
    for (const d of col.dynamic) if (d.enabled && d.max[0] > b[0] && d.min[0] < b[3] && d.max[1] > b[1] && d.min[1] < b[4] && d.max[2] > b[2] && d.min[2] < b[5]) out.push('dyn ' + [...d.min, ...d.max].map((v) => v.toFixed(2)).join(',') + ' ' + (d.owner?.constructor?.name || ''));
    return out.join('\n');
  }, (process.env.B || '26,10,13.5,30,12,17').split(',').map(Number)));
};
