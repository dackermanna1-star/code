// Chapter 1 diagnostics: list doors (state, leaf collider) to spot open leaves blocking routes.
export default async ({ page, evalg, wait }) => {
  await page.goto((process.env.TEST_URL || 'http://localhost:5180/') + '?autostart=0');
  for (let i = 0; i < 90; i++) { await wait(1000); if ((await evalg(() => window.session?.state)) === 'playing') break; }
  const r = await evalg(() => {
    const g = window.game, L = g.level;
    return L.doors.map((d) => `#${d.idx} ${d.axis} c(${d.cx},${d.cy},${d.cz}) w${d.w} ${d.open ? 'OPEN' : 'closed'}${d.locked ? ' LOCKED' : ''}${d.safe ? ' SAFE' : ''} hinge${d.hingeSign} dir${d.dirSign} leaf x${d.collider.min[0].toFixed(2)}..${d.collider.max[0].toFixed(2)} z${d.collider.min[2].toFixed(2)}..${d.collider.max[2].toFixed(2)} en${d.collider.enabled}`);
  });
  console.log(r.join('\n'));
};
