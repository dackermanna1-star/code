// Headless browser smoke test: builds nothing, serves the repo with Vite,
// deploys a battle, cycles camera modes and saves screenshots. Fails on any
// page error. Usage: node scripts/smoke.mjs [scenario] [quality]

import { createRequire } from 'module';
import { createServer } from 'vite';
import { mkdirSync } from 'fs';

const require = createRequire(import.meta.url);
let chromium;
try {
  ({ chromium } = require('playwright'));
} catch {
  ({ chromium } = require('/opt/node22/lib/node_modules/playwright'));
}

const scenario = process.argv[2] || 'town';
const quality = process.argv[3] || 'medium';
const out = new URL('../screenshots/', import.meta.url).pathname;
mkdirSync(out, { recursive: true });

const server = await createServer({ server: { port: 5310, host: '127.0.0.1', hmr: false, watch: null }, logLevel: 'warn' });
await server.listen();
const url = 'http://127.0.0.1:5310/';

const browser = await chromium.launch({
  executablePath: process.env.CHROMIUM || '/opt/pw-browsers/chromium',
  args: ['--use-gl=angle', '--use-angle=swiftshader', '--enable-unsafe-swiftshader', '--ignore-gpu-blocklist', '--autoplay-policy=no-user-gesture-required'],
});
const page = await browser.newPage({ viewport: { width: 1280, height: 720 } });
const errors = [];
page.on('pageerror', (e) => errors.push(`pageerror: ${e.message}\n${e.stack || ''}`));
page.on('console', (m) => {
  if (m.type() === 'error') errors.push(`console: ${m.text()}`);
  else if (m.type() === 'warning') console.log(`warning: ${m.text()}`);
});
page.on('response', (r) => {
  if (r.status() >= 400) errors.push(`http ${r.status()}: ${r.url()}`);
});
page.on('requestfailed', (r) => console.log(`request failed: ${r.url()} ${r.failure()?.errorText || ''}`));

try {
  await page.goto(url, { waitUntil: 'load' });
  await page.screenshot({ path: `${out}menu.png` });
  await page.evaluate(
    ([s, q]) => {
      localStorage.setItem('battlespace.settings.v1', JSON.stringify({ scenario: s, size: 250, quality: q, audio: false, time: 'morning', weather: 'clear' }));
    },
    [scenario, quality],
  );
  await page.reload({ waitUntil: 'load' });
  await page.click('#deploy');
  await page.waitForFunction(() => window.__battlespace && window.__battlespace.world && document.getElementById('loading').hidden, null, { timeout: 180000 });
  const shoot = async (name, ms = 4000) => {
    await page.waitForTimeout(ms);
    await page.screenshot({ path: `${out}${scenario}-${name}.png` });
  };
  await shoot('start', 6000);
  await page.evaluate(() => {
    const app = window.__battlespace;
    app.timeScaleIdx = 4;
  });
  await page.waitForTimeout(20000);
  await page.evaluate(() => {
    window.__battlespace.timeScaleIdx = 2;
    window.__battlespace.jumpToHotspot();
  });
  await shoot('hotspot');
  await page.keyboard.press('KeyF');
  await shoot('chase');
  await page.keyboard.press('KeyV');
  await shoot('eyes');
  await page.keyboard.press('Digit5');
  await shoot('cinematic', 6000);
  await page.keyboard.press('Digit6');
  await shoot('overview');
  const stats = await page.evaluate(() => {
    const w = window.__battlespace.world;
    return { time: w.time, units: w.units.length, dead: w.dead.length, projectiles: w.projectiles.active.length, fps: Math.round(1000 / window.__battlespace.frameMs) };
  });
  console.log('stats', JSON.stringify(stats));
} catch (e) {
  errors.push(`script: ${e.message}`);
} finally {
  await browser.close();
  await server.close();
}
if (errors.length) {
  console.error(errors.slice(0, 20).join('\n'));
  process.exit(1);
}
console.log('smoke test passed; screenshots in', out);
