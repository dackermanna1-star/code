// Boot every chapter of both campaigns and check the survivor route reaches the end.
// CHS="nomercy:0,deadair:1" optional filter. QUALITY=low node tests/play.mjs tests/scen_all.mjs
export default async ({ page, evalg, wait, shot }) => {
  const list = (process.env.CHS || 'nomercy:0,nomercy:1,nomercy:2,nomercy:3,nomercy:4,deadair:0,deadair:1,deadair:2,deadair:3,deadair:4').split(',');
  for (const it of list) {
    const [camp, ch] = it.split(':');
    await page.goto((process.env.TEST_URL || 'http://localhost:5180/') + '?campaign=' + camp + '&autostart=' + ch, { timeout: 180000 });
    let ok = false;
    for (let i = 0; i < 150; i++) { await wait(1000); if ((await evalg(() => window.session?.state)) === 'playing') { ok = true; break; } }
    const r = ok ? await evalg(() => {
      const g = window.game, L = g.level, nav = L.nav, f = nav.fields.toExit;
      g.advance(2);
      let n = nav.nearestNode(L.flowStart[0], L.flowStart[1], L.flowStart[2], 3), steps = 0, last = n;
      while (n >= 0 && steps < 20000) { last = n; const m = nav.descend(f, n); if (m < 0 || m === n) break; n = m; steps++; }
      const ex = nav.nodeX(last), ey = nav.nodeY[last], ez = nav.nodeZ(last);
      const dEnd = Math.hypot(ex - L.flowEnd[0], ez - L.flowEnd[2]);
      return { title: window.session.chapters[window.session.chapterIdx].title, errs: g.errCount || 0, steps, dEnd: +dEnd.toFixed(1), endY: +ey.toFixed(1), arrows: L.guideArrowCount, lights: L.lights?.list?.length, finale: !!L.finale };
    }) : 'NOT PLAYING';
    console.log('CH', camp, ch, JSON.stringify(r));
    if (process.env.SHOT) await shot('all_' + camp + '_' + ch);
  }
};
