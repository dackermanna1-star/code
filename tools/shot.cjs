// Usage: node tools/shot.cjs <url> <out.png> [js-to-eval-before-shot] [width] [height]
const { chromium } = require('playwright');
(async () => {
  const url = process.argv[2] || 'http://127.0.0.1:5173/';
  const out = process.argv[3] || 'shot.png';
  const js = process.argv[4] || '';
  const width = +(process.argv[5] || 1280), height = +(process.argv[6] || 800);
  const browser = await chromium.launch({ args: ['--use-angle=swiftshader', '--enable-unsafe-swiftshader', '--ignore-gpu-blocklist'] });
  const page = await browser.newPage({ viewport: { width, height } });
  const logs = [];
  page.on('console', (m) => logs.push(`[${m.type()}] ${m.text()}`));
  page.on('pageerror', (e) => logs.push(`[pageerror] ${e.message}\n${e.stack}`));
  await page.goto(url, { waitUntil: 'load' });
  await page.waitForFunction(() => window.__sim && window.__sim.ready !== false, null, { timeout: 60000 });
  if (js) {
    const res = await page.evaluate(js);
    if (res !== undefined) console.log('eval result:', typeof res === 'string' ? res : JSON.stringify(res));
  }
  await page.waitForTimeout(300);
  await page.screenshot({ path: out, timeout: 120000 });
  for (const l of logs) console.log(l);
  await browser.close();
})().catch((e) => { console.error(e); process.exit(1); });
