// Final QA: boot every chapter of a campaign (logic only) and check the survivor
// route reaches the end safe room with no errors.
// CAMP=deadair CHS=0,1,2,3,4 QUALITY=low node tests/play.mjs tests/scen_all.mjs
export default async ({ page, evalg, wait, logs }) => {
  const camp = process.env.CAMP || 'deadair';
  for (const ch of (process.env.CHS || '0,1,2,3,4').split(',')) {
    const before = logs.length;
    await page.goto((process.env.TEST_URL || 'http://localhost:5180/') + '?campaign=' + camp + '&autostart=' + ch, { timeout: 180000 });
    let ok = false;
    for (let i = 0; i < 180; i++) { await wait(1000); if ((await evalg(() => window.session?.state)) === 'playing') { ok = true; break; } }
    const r = ok ? await evalg(() => {
      const g = window.game, L = g.level, nav = L.nav, f = nav.fields.toExit;
      g.noRender = true; g.advance(3);
      let n = nav.nearestNode(L.flowStart[0], L.flowStart[1], L.flowStart[2], 3), last = n, steps = 0;
      while (n >= 0 && steps < 40000) { last = n; const m = nav.descend(f, n); if (m < 0 || m === n) break; n = m; steps++; }
      const dEnd = Math.hypot(nav.nodeX(last) - L.flowEnd[0], nav.nodeZ(last) - L.flowEnd[2]);
      return { title: window.session.chapters[window.session.chapterIdx].title, errs: g.errCount || 0, steps, dEnd: +dEnd.toFixed(1), endSafe: !!L.endSafe, finale: !!(L.finale || L.def?.finale) };
    }) : 'NOT PLAYING';
    const errs = logs.slice(before).filter((l) => /pageerror|\[error\]|\[frame\]/i.test(l) && !/WebGL|GL_INVALID/.test(l));
    console.log('CH', camp, ch, JSON.stringify(r), 'consoleErrors', errs.length, errs.slice(0, 3).join(' || ').slice(0, 400));
  }
};
