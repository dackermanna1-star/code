export default async ({ page, evalg, wait }) => {
  await page.goto((process.env.TEST_URL || 'http://localhost:5180/') + '?autostart=0');
  for (let i = 0; i < 60; i++) { await wait(1000); if ((await evalg(() => window.session?.state)) === 'playing') break; }
  const r = await evalg(() => {
    const g = window.game, L = g.level, nav = L.nav;
    const pts = {
      start: [15, 14.4, 12], bulkDoor: [7.6, 14.4, 8.5], bulkIn: [5, 14.4, 8.5], stairTop: [1.6, 14.4, 8.2], stairMid: [1.6, 12.6, 5], stairBot: [1.6, 10.8, 1.2],
      encl: [5, 10.8, 5], enclDoor: [5.2, 10.8, 9.4], corr3: [15, 10.8, 10.4], apt3F: [23.3, 10.8, 12.5], holeEdge: [26.5, 10.8, 15], f2land: [28.3, 7.2, 15.3], apt2Fdoor: [23.4, 7.2, 12], corr2: [24, 7.2, 10.4], shaftDoor: [25.8, 7.2, 9.0],
      shaftL2: [29, 7.2, 8.6], d1mid: [29.7, 6.3, 6.5], mid2: [28, 5.4, 4.2], d2mid: [26.2, 4.5, 6.5], land1: [27, 3.6, 8.6], d3: [29.7, 2.7, 6.5], mid1: [28, 1.8, 4.2], d4: [26.2, 0.9, 6.5], land0: [27, 0, 8.6],
      lobby: [20, 0, 15], entrance: [19.5, 0, 20], street: [19.5, 0.15, 22], road: [40, 0, 28], pharmIn: [41, 0.15, 38], pharmBack: [45.6, 0.15, 46.5], alley: [60, 0.15, 51], grand: [104, 0, 30], stairsTop: [104, 0, 12], stairsMid: [104, -3, 7.5], tunnel: [104, -6, 0], concourse: [104, -6, -8], gate: [102.8, -6, -14], sr: [105, -6, -28],
    };
    const out = {};
    for (const k in pts) {
      const [x, y, z] = pts[k];
      const n = nav.nearestNode(x, y, z, 1.5);
      out[k] = n < 0 ? 'NO NODE' : (L.progressAt(nav.nodeX(n), nav.nodeY[n], nav.nodeZ(n)).toFixed(3) + ' y=' + nav.nodeY[n].toFixed(2));
    }
    return out;
  });
  for (const k in r) console.log(k.padEnd(12), r[k]);
};
