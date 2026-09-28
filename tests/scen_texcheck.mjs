// Quick functional check: boot CH, report texture timing + errors (QUALITY=low ok)
export default async ({ page, evalg, wait, logs }) => {
  const ch = process.env.CH || '0';
  page.on('crash', () => console.log('PAGE CRASH'));
  page.on('close', () => console.log('PAGE CLOSE'));
  await page.goto((process.env.TEST_URL || 'http://localhost:5180/') + '?autostart=' + ch + (process.env.CAMPAIGN ? '&campaign=' + process.env.CAMPAIGN : ''));
  let st;
  for (let i = 0; i < 90; i++) {
    await wait(1000);
    const q = await evalg(() => ({ st: window.session?.state, t: window.__texStats && { ms: Math.round(window.__texStats.ms), w: Math.round(window.__texStats.workerMs || 0), c: window.__texStats.count, p: window.__texStats.pending } }));
    if (i % 5 === 0 || q?.st === 'playing') console.log('t', i, JSON.stringify(q));
    if (q?.st === 'playing') break;
  }
  const t0 = Date.now();
  for (let i = 0; i < 60; i++) { const p = await evalg(() => window.__texStats?.pending ?? 0); if (!p) break; await wait(250); }
  const r = await evalg(() => { const g = window.game, t = window.__texStats; g.advance(3); return { state: window.session.state, loadMs: Math.round(g.loadMs), mainMs: Math.round(t.ms), workerMs: Math.round(t.workerMs), count: t.count, pending: t.pending, errs: g.errCount || 0, nav: g.level.nav.N }; });
  console.log('CH', ch, JSON.stringify(r), 'texWaitMs', Date.now() - t0);
};
