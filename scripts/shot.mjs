// Headless screenshot harness: node scripts/shot.mjs out.png "x,y,z,yaw,pitch" [w] [h] [extraQuery]
// Requires a dev server (default http://localhost:5173).
import { chromium } from '/opt/node22/lib/node_modules/playwright/index.mjs';

const [, , out = 'shot.png', cam = '0,1.62,2,0,0', w = '960', h = '540', extra = ''] = process.argv;
const base = process.env.BASE ?? 'http://localhost:5173/';
const browser = await chromium.launch({
  args: ['--use-gl=angle', '--use-angle=swiftshader', '--enable-unsafe-swiftshader', '--ignore-gpu-blocklist'],
});
const page = await browser.newPage({ viewport: { width: +w, height: +h }, deviceScaleFactor: 1 });
const logs = [];
page.on('console', (m) => logs.push(`[${m.type()}] ${m.text()}`));
page.on('pageerror', (e) => logs.push(`[pageerror] ${e.message}`));
const url = `${base}?shot&dpr=1${extra.includes('q=') ? '' : '&q=high'}&cam=${encodeURIComponent(cam)}${extra ? '&' + extra : ''}`;
const t0 = Date.now();
await page.goto(url);
try {
  await page.waitForFunction(() => window.__shotReady || window.__shotError, null, { timeout: 600000, polling: 500 });
} catch (e) {
  console.log('timeout waiting for shot');
}
const err = await page.evaluate(() => window.__shotError);
if (err) console.log('ERROR:', err);
const info = await page.evaluate(() => {
  const e = window.__engine;
  if (!e || !e.renderer) return null;
  const r = e.renderer.info;
  return { calls: r.render.calls, tris: r.render.triangles, geoms: r.memory.geometries, tex: r.memory.textures, timings: e.world?.timings };
});
const dataUrl = await page.evaluate(() => document.getElementById('view').toDataURL('image/png'));
const fs = await import('node:fs');
fs.writeFileSync(out, Buffer.from(dataUrl.split(',')[1], 'base64'));
console.log(`shot ${out} in ${((Date.now() - t0) / 1000).toFixed(1)}s`, JSON.stringify(info));
for (const l of logs.slice(0, 40)) console.log(l);
await browser.close();
