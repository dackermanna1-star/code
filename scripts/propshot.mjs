// node scripts/propshot.mjs out.png "dumpster,trashCart" [cam "x,y,z,yaw,pitch" | "camA;camB;..."] [w] [h] [extraQuery]
// Renders props via tools/props-preview.html (needs a dev server; BASE env var, default http://localhost:5173/)
// Several cameras separated by ';' are rendered as tiles of w x h each (see tools/props-preview.js).
import { chromium } from '/opt/node22/lib/node_modules/playwright/index.mjs';
import fs from 'node:fs';

const [, , out = 'props.png', props = '', cam = '', w = '1100', h = '620', extra = ''] = process.argv;
const base = process.env.BASE ?? 'http://localhost:5173/';
const browser = await chromium.launch({
  args: ['--use-gl=angle', '--use-angle=swiftshader', '--enable-unsafe-swiftshader', '--ignore-gpu-blocklist'],
});
const page = await browser.newPage({ viewport: { width: +w, height: +h }, deviceScaleFactor: 1 });
const logs = [];
page.on('console', (m) => logs.push(`[${m.type()}] ${m.text()}`));
page.on('pageerror', (e) => logs.push(`[pageerror] ${e.message}`));
const camQ = cam ? (cam.includes(';') ? `&cams=${encodeURIComponent(cam)}` : `&cam=${encodeURIComponent(cam)}`) : '';
const url = `${base}tools/props-preview.html?props=${encodeURIComponent(props)}${camQ}${extra ? '&' + extra : ''}`;
await page.goto(url);
try {
  await page.waitForFunction(() => window.__shotReady, null, { timeout: 300000, polling: 300 });
} catch {
  console.log('timeout');
}
const dataUrl = await page.evaluate(() => (window.__shotCanvas ?? document.getElementById('view')).toDataURL('image/png'));
fs.writeFileSync(out, Buffer.from(dataUrl.split(',')[1], 'base64'));
for (const l of logs) if (!l.includes('[vite]')) console.log(l);
console.log('wrote', out);
await browser.close();
