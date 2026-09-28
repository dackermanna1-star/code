// Dead Air ch4 (The Terminal): boot, errors, nav/progress along the route.
// node tests/play.mjs tests/da4_boot.mjs
export const ROUTE = [[11, 7.2, 42.5], [15.5, 7.2, 20], [40, 7.2, 3], [78, 0, 3], [80, 0, 20], [100.5, 0, 18], [118, 0, 20], [120, 0, -14], [104, 0, -22], [92, 0, -20], [82, 0, -19], [82, 0, -30], [70, 0, -17], [50, 6.4, -17], [30, 6.4, -28], [6, 6.4, -40], [6, 6.4, -50], [6, 6.4, -60], [9.3, 6.4, -60], [9.3, 0, -72.5], [-2.6, 0, -82.5], [-15.3, 0, -72.5], [-15.3, 6.4, -60], [-12, 6.4, -50], [-20, 6.4, -38], [-34, 6.4, -38], [-45, 6.4, -37]];
export default async ({ page, evalg, wait, logs }) => {
  const t0 = Date.now();
  await page.goto((process.env.TEST_URL || 'http://localhost:5180/') + '?campaign=deadair&autostart=3', { timeout: 180000 });
  for (let i = 0; i < 180; i++) { await wait(1000); if ((await evalg(() => window.session?.state)) === 'playing') break; }
  console.log('boot s', ((Date.now() - t0) / 1000).toFixed(0));
  const info = await evalg((R) => {
    const g = window.game, L = g.level, nav = L.nav;
    return {
      id: L.def?.id, nodes: nav.count ?? nav.nodeCount ?? nav.nodeY?.length, lights: L.lights.length, boxes: L.col.n, errs: g.errCount || 0,
      meshes: L.meshes?.length, objs: L.root.children.length, items: L.itemSpawns.length, doors: L.doors.length,
      office: (() => { const pth = nav.findPath(90, 0, -30, 74, 0, -30); if (!pth) return 'NO PATH'; let inOff = 0, lane = 0; for (const n of pth) { const x = nav.nodeX(n), z = nav.nodeZ(n); if (x > 78 && x < 86 && z > -34 && z < -26) inOff++; if (Math.abs(x - 82) < 1 && Math.abs(z + 19) < 1.5) lane++; } return `office route nodes ${pth.length} in office ${inOff} via detector ${lane}`; })(),
      prog: R.map((p) => `${p.join(',')}:${L.progressAt(...p).toFixed(3)}`).join(' | '),
    };
  }, ROUTE);
  console.log(JSON.stringify(info, null, 1));
};
