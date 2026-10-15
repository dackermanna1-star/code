// World screenshot driver: loads the world sandbox (or any page exposing __game.debugCam) and captures a list
// of viewpoints. Usage:
//   node tools/world-shot.mjs <url> <outDir> [--views "name:x,y,z,yaw,pitch;..."] [--tour] [--frames 3]
//        [--eval "js"] [--width 1280 --height 720] [--time 18.5] [--weather fog] [--wait 60000]
import { chromium } from 'playwright';
import { mkdirSync } from 'node:fs';

const args = process.argv.slice(2);
const url = args[0];
const outDir = args[1] || '.';
const opt = (name, def) => {
  const i = args.indexOf('--' + name);
  return i >= 0 ? args[i + 1] : def;
};
const has = (name) => args.includes('--' + name);
const width = Number(opt('width', 1280)), height = Number(opt('height', 720));
const frames = Number(opt('frames', 3));
mkdirSync(outDir, { recursive: true });

const browser = await chromium.launch({
  args: ['--use-angle=swiftshader', '--enable-unsafe-swiftshader', '--ignore-gpu-blocklist', '--enable-webgl', '--autoplay-policy=no-user-gesture-required'],
});
const page = await browser.newPage({ viewport: { width, height } });
const logs = [];
page.on('console', (m) => logs.push(`[${m.type()}] ${m.text()}`));
page.on('pageerror', (e) => logs.push(`[pageerror] ${e.message}\n${e.stack || ''}`));
const t0 = Date.now();
await page.goto(url, { waitUntil: 'load', timeout: 180000 });
const readyExpr = opt('ready', 'window.__game && window.__game.ready');
await page.waitForFunction(readyExpr, null, { timeout: Number(opt('wait', 240000)), polling: 500 });
if (opt('settle', null)) await page.waitForTimeout(Number(opt('settle')));
console.log(`ready after ${((Date.now() - t0) / 1000).toFixed(1)} s`);

async function waitFrames(n) {
  const start = await page.evaluate(() => window.__game.ctx.engine.frame);
  await page.waitForFunction((s) => window.__game.ctx.engine.frame >= s, start + n, { timeout: 240000, polling: 200 });
}

if (opt('time', null)) await page.evaluate((h) => window.__game.setTime(h), Number(opt('time')));
if (opt('weather', null)) await page.evaluate((w) => window.__game.setWeather(w), opt('weather'));
if (opt('eval', null)) {
  const r = await page.evaluate(opt('eval'));
  console.log('EVAL:', typeof r === 'string' ? r : JSON.stringify(r));
}

if (opt('map', null)) {
  const url = await page.evaluate(() => window.__game.ctx.world.getMapImage()?.toDataURL('image/png'));
  if (url) {
    const { writeFileSync } = await import('node:fs');
    writeFileSync(opt('map'), Buffer.from(url.split(',')[1], 'base64'));
    console.log('map image ->', opt('map'));
  } else console.log('map image: null');
}

let views = [];
if (has('tour')) views = await page.evaluate(() => window.__game.screenshotTour());
const vs = opt('views', null);
if (vs)
  for (const part of vs.split(';').filter(Boolean)) {
    const [name, nums] = part.split(':');
    const [x, y, z, yaw, pitch] = nums.split(',').map((v) => (v === '' || v === 'g' ? null : Number(v)));
    views.push({ name, x, y, z, yaw, pitch });
  }
if (!views.length) views.push({ name: 'default' });
const only = opt('only', null);
for (const v of views) {
  if (only && !v.name.toLowerCase().includes(only.toLowerCase())) continue;
  if (v.x !== undefined) await page.evaluate((v) => window.__game.debugCam(v.x, v.y, v.z, v.yaw, v.pitch), v);
  await waitFrames(frames);
  const file = `${outDir}/${v.name.replace(/[^a-z0-9]+/gi, '_').toLowerCase()}.png`;
  const t = Date.now();
  await page.screenshot({ path: file, timeout: 240000 });
  const stats = await page.evaluate(() => {
    const s = window.__game.ctx.engine.stats;
    return `draws ${s.drawCalls} tris ${(s.triangles / 1000).toFixed(0)}k`;
  });
  console.log(`${file}  (${((Date.now() - t) / 1000).toFixed(1)} s)  ${stats}`);
}
const errs = logs.filter((l) => /error|warn/i.test(l));
console.log(`--- ${logs.length} console lines, ${errs.length} warnings/errors ---`);
console.log((has('logs') ? logs : errs).slice(0, 60).join('\n'));
await browser.close();
