// Screenshots of the animation preview (tools/preview/anim.html) with headless Chromium.
//   npx vite --config vite.tower.config.js --port 5182 &
//   node tools/preview/animshot.cjs <outDir> '[{"clip":"walk","kind":"walker","film":true,"t":0.5,"cam":1}]' [w] [h] [query, e.g. retro=3]
// Each shot calls window.__sim.set(shot) and saves <outDir>/<clip>_<kind>_<i>.png.
const { chromium } = require('playwright');
const path = require('path');
const fs = require('fs');

(async () => {
  const out = process.argv[2] || 'shots';
  const shots = JSON.parse(process.argv[3] || '[{"clip":"walk","kind":"walker","film":true}]');
  const w = +(process.argv[4] || 1280), h = +(process.argv[5] || 640);
  const extra = process.argv[6] ? '&' + process.argv[6] : '';
  const url = process.env.PREVIEW_URL || `http://127.0.0.1:5182/tools/preview/anim.html?w=${w}&h=${h}${extra}`;
  fs.mkdirSync(out, { recursive: true });
  const browser = await chromium.launch({ args: ['--use-gl=angle', '--use-angle=swiftshader', '--enable-unsafe-swiftshader', '--ignore-gpu-blocklist'] });
  const page = await browser.newPage({ viewport: { width: w, height: h } });
  const logs = [];
  page.on('console', (m) => logs.push(`[${m.type()}] ${m.text()}`));
  page.on('pageerror', (e) => logs.push(`[pageerror] ${e.message}`));
  await page.goto(url, { waitUntil: 'load' });
  await page.waitForFunction(() => window.__sim && window.__sim.ready, null, { timeout: 120000 });
  for (let i = 0; i < shots.length; i++) {
    const s = shots[i];
    const res = await page.evaluate((o) => window.__sim.set(o), s);
    const file = path.join(out, s.name || `${s.clip}_${s.kind || 'walker'}_${i}.png`);
    await page.screenshot({ path: file, timeout: 180000 });
    console.log('shot', file, JSON.stringify(res));
  }
  for (const l of logs) console.log(l);
  await browser.close();
})().catch((e) => {
  console.error(e);
  process.exit(1);
});
