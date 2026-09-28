// Dead Air ch1 (The Greenhouse): boot, stats and route connectivity.
// node tests/play.mjs tests/da1_route.mjs
const PTS = [
  ['start', 6.5, 18, 28], ['gh mid', 18, 18, 27], ['gh door', 27.5, 18, 27], ['plank A', 31, 18, 37], ['plank mid', 35.5, 18.09, 37], ['plank B', 39.8, 18, 37],
  ['B roof', 46, 18, 35], ['B gate', 59, 18, 31.2], ['B encl', 52, 18, 25], ['bulk door', 44.3, 18, 25.35], ['top land', 42, 18, 25.5], ['mid land', 41.5, 16.2, 19.8], ['F4 bottom', 40.3, 14.4, 25.5],
  ['F4 cor', 41, 14.4, 28.2], ['F4 cor2', 48, 14.4, 28.2], ['5D door', 50.5, 14.4, 28.9], ['5D', 51, 14.4, 33], ['hole edge', 53.5, 14.4, 36],
  ['F3 land', 53.5, 10.8, 38], ['4D door', 55.5, 10.8, 29.3], ['F3 cor', 58, 10.8, 28.2], ['F3 end', 64.5, 10.8, 28.2],
  ['fe plat', 66.8, 10.8, 28.2], ['fe stair', 66.8, 9, 32.7], ['fe bottom', 66.8, 7.2, 36], ['C roof', 72, 7.24, 27], ['D door out', 79.5, 7.24, 20.5],
  ['D lobby', 82.5, 7.2, 21.5], ['office', 87, 7.2, 22.5], ['office2', 100, 7.2, 30], ['partition', 102.3, 7.2, 34.5], ['lounge', 95, 7.2, 39], ['sill', 84.25, 7.2, 43.75],
  ['trailer', 84.25, 4.05, 45.2], ['street', 88, 0, 50], ['street2', 105, 0, 54], ['sidewalk S', 110, 0.15, 62.5], ['dock stair', 109, 0.7, 65.3],
  ['dock', 114, 1.2, 68.5], ['svc door', 116.2, 1.2, 70.1], ['svc cor', 116.2, 1.2, 76], ['svc turn', 116.2, 1.2, 83.2], ['west leg', 110, 1.2, 83.2],
  ['kit door', 106, 1.2, 83.2], ['kitchen', 101.5, 1.2, 81.2],
];
export default async ({ page, evalg, wait, shot, logs }) => {
  await page.goto((process.env.TEST_URL || 'http://localhost:5180/') + '?campaign=deadair&autostart=' + (process.env.CH || 0), { timeout: 180000 });
  for (let i = 0; i < 150; i++) { await wait(1000); if ((await evalg(() => window.session?.state)) === 'playing') break; }
  const r = await evalg((pts) => {
    const g = window.game, L = g.level, nav = L.nav;
    let draws = 0; L.root.traverse((o) => { if (o.isMesh || o.isPoints) draws++; });
    const n0 = nav.nearestNode(L.flowStart[0], L.flowStart[1], L.flowStart[2], 3);
    const out = [`title ${window.session.chapters[window.session.chapterIdx].title} nav nodes ${nav.N}, boxes ${L.col.n}, lights ${L.lights.length}, doors ${L.doors.length}, objs ${draws}, buildMs ${Math.round(g.loadMs)}, navMs ${Math.round(L.navBuildMs)}, arrows ${L.guideArrowCount}, routeLen ${nav.fields.toExit[n0]?.toFixed(1)}, errs ${g.errCount || 0}`];
    out.push(`bounds x ${L.bounds.minX.toFixed(0)}..${L.bounds.maxX.toFixed(0)} y ${L.bounds.minY.toFixed(0)}..${L.bounds.maxY.toFixed(0)} z ${L.bounds.minZ.toFixed(0)}..${L.bounds.maxZ.toFixed(0)} grid ${nav.nx}x${nav.nz}`);
    for (const [k, x, y, z] of pts) {
      const n = nav.nearestNode(x, y, z, 1.5);
      out.push(k.padEnd(12) + (n < 0 ? 'NO NODE' : (L.progressAt(nav.nodeX(n), nav.nodeY[n], nav.nodeZ(n)).toFixed(3) + ' y=' + nav.nodeY[n].toFixed(2) + ' fs=' + (nav.fields.fromStart[n] > 1e8 ? 'INF' : nav.fields.fromStart[n].toFixed(0)))));
    }
    return out;
  }, PTS);
  console.log((r || []).join('\n'));
  if (process.env.SHOT) await shot('da1_boot');
};
