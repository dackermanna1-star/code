// Measures frame times over a CPU vs CPU session (worst-case effects included).
const { chromium } = require('/opt/node22/lib/node_modules/playwright');
const path = require('path');
(async () => {
  const browser = await chromium.launch();
  const page = await browser.newPage({ viewport: { width: 1280, height: 720 } });
  const errs = [];
  page.on('pageerror', (e) => errs.push(e.message));
  await page.goto('file://' + path.resolve(__dirname, '..', 'index.html') + '?play=watch&level=boss');
  await page.waitForTimeout(3000);
  const r = await page.evaluate(async () => {
    const m = JJK.game.scene.m;
    // give both full resources so big techniques happen
    const times = [];
    const orig = m.render.bind(m);
    m.render = (ctx) => { const t = performance.now(); orig(ctx); times.push(performance.now() - t); };
    for (let i = 0; i < 6; i++) {
      for (const f of m.fighters) { f.meter = 300; f.dg = 100; }
      await new Promise((res) => setTimeout(res, 2500));
    }
    times.sort((a, b) => a - b);
    const p = (q) => times[Math.floor(times.length * q)].toFixed(2);
    return { frames: times.length, median: p(0.5), p95: p(0.95), p99: p(0.99), max: times[times.length - 1].toFixed(2), parts: JJK.FX.parts.length };
  });
  console.log('render ms', r);
  if (errs.length) console.log('ERRORS', errs.slice(0, 5));
  await browser.close();
})();
