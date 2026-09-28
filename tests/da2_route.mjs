// Dead Air ch2 (The Crane): boot + route connectivity. ROUTE='[["name",x,y,z],...]' optional.
// node tests/play.mjs tests/da2_route.mjs
export default async ({ page, evalg, wait, shot }) => {
  await page.goto((process.env.TEST_URL || 'http://localhost:5180/') + '?campaign=deadair&autostart=1', { timeout: 180000 });
  for (let i = 0; i < 150; i++) { await wait(1000); if ((await evalg(() => window.session?.state)) === 'playing') break; }
  const def = [
    ['start', 47, 1.2, 15.8], ['kitchen', 30, 1.2, 14], ['hallDoor', 18, 1.2, 9.2], ['hall', 16, 1.2, 8], ['dock', 8, 1.2, 6], ['apron', 9.7, 1.2, -1.2],
    ['alley', 20, 0, -5], ['alleyE', 34, 0, -5], ['fe1', 38.5, 1.4, -2.7], ['feA', 42, 2.87, -2], ['fe2', 38.5, 4.3, -1.0], ['feB', 35, 5.73, -2], ['fe3', 38.5, 7.2, -2.7], ['feC', 45, 8.6, -2],
    ['sill', 47.2, 8.95, 0], ['r301', 47, 8.6, 3], ['corrE', 44, 8.6, 9.4], ['corrMid', 30, 8.6, 9.4], ['r310', 23, 8.6, 14.3], ['hole', 20.4, 8.6, 14.3], ['r312', 17.5, 8.6, 14.3], ['corrW', 10, 8.6, 9.4],
    ['stairLow', 1.6, 8.6, 7.2], ['stairMid', 3, 10.3, 1], ['stairTop', 4.5, 12, 7.2], ['roofNW', 5, 12, 11], ['roofMid', 25, 12, 14], ['console', 39.3, 12, 16.2], ['gateN', 36, 12, 17.8],
    ['bridge', 36, 12.25, 22.4], ['gateS', 36, 12, 27.2], ['deck', 36, 12, 35], ['deckS', 28.8, 12, 54.5], ['scafTop', 28.8, 12, 57], ['scafBot', 20.7, 8.6, 57], ['plank', 20.7, 8.6, 59.4],
    ['lbRoof', 30, 8.6, 64], ['lbE', 55, 8.6, 71.3], ['l3entry', 59.5, 8.6, 71.3], ['l3aisle', 70, 8.6, 65], ['l3NE', 89, 8.6, 65], ['stairB_top', 90, 8.6, 62.6], ['stairB_mid', 88, 6.6, 57.2], ['stairB_low', 86.8, 4.6, 62.6],
    ['server', 82.2, 4.6, 70], ['serverS', 83.8, 4.6, 76.6], ['dark', 78, 4.6, 86], ['mezz', 73, 4.6, 87.3], ['grand', 68, 2.5, 87.3], ['lobby', 70, 0.3, 90], ['exitIn', 85, 0.3, 95.4], ['exitOut', 85, 0.3, 96.6],
    ['street', 75, 0, 104], ['gate', 66.5, 0.15, 113], ['lot', 63, 0.15, 118], ['office', 63, 0.3, 122], ['c1N', 69.5, 0.3, 125], ['c1S', 69.5, 0.3, 139.8], ['c2', 85, 0.3, 139.8], ['safeDoor', 94.5, 0.3, 140.5], ['end', 94.6, 0.3, 145.4],
  ];
  const pts = process.env.ROUTE ? JSON.parse(process.env.ROUTE) : def;
  const r = await evalg((pts) => {
    const g = window.game, L = g.level, nav = L.nav;
    const out = [`nav nodes ${nav.N}, boxes ${L.col.n}, lights ${L.lights.length}, doors ${L.doors.length}, loadMs ${Math.round(g.loadMs)}, navMs ${Math.round(L.navBuildMs)}, arrows ${L.guideArrowCount}, errs ${g.errCount || 0}, objects ${L.root.children.length}`];
    for (const [k, x, y, z] of pts) {
      const n = nav.nearestNode(x, y, z, 1.5);
      out.push(k.padEnd(12) + (n < 0 ? 'NO NODE' : (L.progressAt(nav.nodeX(n), nav.nodeY[n], nav.nodeZ(n)).toFixed(3) + ' y=' + nav.nodeY[n].toFixed(2) + ' @' + nav.nodeX(n).toFixed(2) + ',' + nav.nodeZ(n).toFixed(2))));
    }
    return out;
  }, pts);
  console.log((r || ['eval failed']).join('\n'));
};
