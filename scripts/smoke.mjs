// Headless browser smoke test: boots the game, runs a scenario, captures screenshots and console errors.
// Usage: node scripts/smoke.mjs [scenario] [seed]   (dev server must be running on :5173, or pass URL via BASE)
import { chromium } from 'playwright-core';
import fs from 'node:fs';

const scenario = process.argv[2] ?? 'boot';
const seed = process.argv[3] ?? '1234';
const base = process.env.BASE ?? 'http://localhost:5173/';
const exe = ['/opt/pw-browsers/chromium-1194/chrome-linux/chrome', '/opt/pw-browsers/chromium/chrome-linux/chrome'].find((p) => fs.existsSync(p));

const browser = await chromium.launch({
  executablePath: exe,
  args: ['--use-angle=swiftshader', '--enable-unsafe-swiftshader', '--ignore-gpu-blocklist', '--disable-gpu-sandbox'],
});
const page = await browser.newPage({ viewport: { width: Number(process.env.W ?? 1280), height: Number(process.env.H ?? 720) } });
const errors = [];
page.on('console', (m) => {
  const t = m.text();
  if (m.type() === 'error' || m.type() === 'warning') errors.push(`[${m.type()}] ${t}`);
  else if (process.env.VERBOSE) console.log('[console]', t);
});
page.on('pageerror', (e) => errors.push(`[pageerror] ${e.message}\n${e.stack}`));
const extra = process.env.PARAMS ?? '';
await page.goto(`${base}?autostart&seed=${seed}&debug${extra}`);
await page.waitForFunction(() => window.game && window.game.state === 'playing', null, { timeout: 120000 });
const shot = async (name) => {
  await page.screenshot({ path: `screenshots/${scenario}-${name}.png` });
  console.log('screenshot', `screenshots/${scenario}-${name}.png`);
};
const wait = (ms) => page.waitForTimeout(ms);
const run = async (fn, arg) => page.evaluate(fn, arg);

const scenarios = (await import('./scenarios.mjs')).default;
const fn = scenarios[scenario];
if (!fn) throw new Error('unknown scenario ' + scenario);
await fn({ page, shot, wait, run });
const stats = await run(() => ({ fps: window.game.fps, frame: window.game.frameMs, sim: window.game.sim.stats, loaded: window.game.world.loadedCount, tris: window.game.chunks.stats.triangles }));
console.log('stats', JSON.stringify(stats));
if (errors.length) console.log('ERRORS:\n' + errors.slice(0, 30).join('\n'));
await browser.close();
