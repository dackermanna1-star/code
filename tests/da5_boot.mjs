// Dead Air 5 boot check: errors, nav, progress samples along the route.
export default async ({ page, evalg, wait, shot, logs }) => {
  await page.goto((process.env.TEST_URL || 'http://localhost:5180/') + '?campaign=deadair&autostart=4', { timeout: 180000 });
  let st;
  for (let i = 0; i < 150; i++) { await wait(1000); st = await evalg(() => window.session?.state); if (st === 'playing') break; }
  const r = await evalg(() => {
    const g = window.game, L = g.level;
    g.noRender = !window.__render;
    const t0 = performance.now(); g.advance(3); const adv = performance.now() - t0;
    const pts = { start: L.flowStart, lounge: [-24, 6, -8], bridge: [-24.3, 6, 8], cab: [-24, 6, 16.3], stairTop: [-20.5, 6, 16.3], stairBot: [-12, 0, 16.3], lane: [10, 0, 24], gap: [22, 0, 34], crew: [22, 0, 40], pump: [40, 0, 60], ramp: [58, 0, 53], hold: L.flowEnd };
    const out = {};
    for (const k in pts) { const p = pts[k]; out[k] = +L.progressAt(p[0], p[1], p[2]).toFixed(3); }
    return { state: window.session.state, nav: L.nav.N, lights: L.lights.length, dyn: L.dynamics.length, boxes: L.col?.n, adv: adv.toFixed(0), prog: out, fin: L.finale && { hall: L.finale.hallNodes.length, hangar: L.finale.hangarNodes.length, strip: L.finale.stripNodes.length }, commons: g.infected.commons.length };
  });
  console.log(JSON.stringify(r));
  if (process.env.SHOT) await shot('da5_boot');
};
