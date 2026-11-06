// Screenshot the entities test page with Playwright.
// usage: node dev/entities-shot.cjs name:query [name:query ...]
//   e.g. node dev/entities-shot.cjs lineup:scene=lineup states:"scene=states&t=2"
const { chromium } = require('playwright');
const path = require('path');
const fs = require('fs');

const PORT = process.env.PORT || 5205;
(async () => {
  const outDir = path.join(__dirname, 'out');
  fs.mkdirSync(outDir, { recursive: true });
  const browser = await chromium.launch({ args: ['--enable-unsafe-swiftshader', '--use-gl=angle', '--use-angle=swiftshader'] });
  const jobs = process.argv.slice(2);
  for (const job of jobs) {
    const i = job.indexOf(':');
    const name = job.slice(0, i), q = job.slice(i + 1);
    const w = /(?:^|&)w=(\d+)/.exec(q)?.[1] || 1280, h = /(?:^|&)h=(\d+)/.exec(q)?.[1] || 720;
    const page = await browser.newPage({ viewport: { width: +w, height: +h }, deviceScaleFactor: 1 });
    const msgs = [];
    page.on('console', (m) => msgs.push(`[${m.type()}] ${m.text()}`));
    page.on('pageerror', (e) => msgs.push(`[pageerror] ${e.message}`));
    const t0 = Date.now();
    await page.goto(`http://localhost:${PORT}/dev/entities-test.html?${q}`);
    try {
      await page.waitForFunction(() => window.__ready === true, null, { timeout: 180000 });
    } catch (e) { msgs.push('[timeout] ' + e.message); }
    await page.waitForTimeout(200);
    const file = path.join(outDir, `entities-${name}.png`);
    await page.screenshot({ path: file });
    console.log(`== ${name} (${Date.now() - t0}ms) -> ${file}`);
    for (const m of msgs) if (!/Download the React DevTools|\[vite\]/.test(m)) console.log('   ' + m);
    await page.close();
  }
  await browser.close();
})();
