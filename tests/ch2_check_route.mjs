// Ch2 regression check 2: progress along the intended path (nav node + progress per point),
// and survivor A* (no climb links) between consecutive route points and start->end.
const TY = -6.2;
export const ROUTE = [
  ['safe', -4.5, 0, 5.5], ['safeDoor', -1, 0, 6.6], ['concourse', 3, 0, 6.6], ['booth', 15, 0, 11], ['turnstile', 21, 0, 11.2], ['stairsTop', 30.5, 0, 5.5],
  ['stairsMid', 36, -2.6, 5.5], ['platform', 45, -5, 5], ['carDoor', 55.4, -5, 9.6], ['car1', 55, -5, 11.1], ['car2', 67.4, -5, 11.1], ['carDoorS', 71.4, -5, 12.6],
  ['track', 72, TY, 14], ['farTrack', 90, TY, 16], ['tunnel', 110, TY, 13], ['walkway', 110, TY + 0.9, 19.5], ['wreck', 130, TY, 12.5], ['crossing', 138.5, TY, 14], ['wreck2', 150, TY, 17],
  ['caveIn', 163, TY, 16], ['maintDoor', 165.2, TY, 20.5], ['corridor', 165.2, TY, 25], ['corridor2', 165.2, TY, 38], ['hallDoor', 165.2, TY, 40.5], ['console', 165.5, TY, 49.5],
  ['hallMid', 176, TY, 55], ['gate', 182.2, TY, 55], ['dock', 186, TY, 55], ['dockStairs', 195, -3.3, 55], ['officeDoor', 199.9, 0, 55], ['office', 203, 0, 55], ['r1door', 206, 0, 55],
  ['cubicles', 208, 0, 52.4], ['cubicles2', 222.5, 0, 52.4], ['aisle', 222.5, 0, 59], ['lobbyDoor', 213, 0, 61.5], ['lobby', 214, 0, 61.5], ['corr', 228, 0, 64.6], ['exitDoor', 232.2, 0, 64.6],
  ['alley', 234, 0.15, 64.6], ['alleyEnd', 235, 0.15, 69], ['street', 245, 0, 80], ['pawnDoorOut', 253.5, 0.15, 86.8], ['pawnDoor', 253.5, 0.15, 88], ['end', 256, 0.15, 93.3],
];
export default async ({ page, evalg, wait }) => {
  await page.goto((process.env.TEST_URL || 'http://localhost:5180/') + '?autostart=1');
  for (let i = 0; i < 120; i++) { await wait(1000); if ((await evalg(() => window.session?.state)) === 'playing') break; }
  const r = await evalg((pts) => {
    const g = window.game, L = g.level, nav = L.nav;
    g.director.enabled = false;
    const out = [`nav nodes ${nav.N}`];
    let prev = null;
    for (const [k, x, y, z] of pts) {
      const n = nav.nearestNode(x, y, z, 1.5);
      let line = k.padEnd(12) + (n < 0 ? 'NO NODE' : (L.progressAt(nav.nodeX(n), nav.nodeY[n], nav.nodeZ(n)).toFixed(3) + ' y=' + nav.nodeY[n].toFixed(2)));
      if (prev && n >= 0) {
        const p = nav.findPath(prev[0], prev[1], prev[2], x, y, z, 200000);
        line += p ? (p.partial ? '  PATH PARTIAL' : '  path ' + p.length) : '  NO PATH';
      }
      out.push(line);
      if (n >= 0) prev = [nav.nodeX(n), nav.nodeY[n], nav.nodeZ(n)];
    }
    const full = nav.findPath(...L.flowStart, ...L.flowEnd, 2000000);
    out.push('start->end: ' + (full ? (full.partial ? 'PARTIAL' : 'ok nodes=' + full.length) : 'null'));
    return out;
  }, ROUTE);
  console.log(r ? r.join('\n') : 'null');
};
