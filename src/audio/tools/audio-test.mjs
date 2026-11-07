// Headless audio verification runner (development only; no screenshot).
//
//   node src/audio/tools/audio-test.mjs <script.js> [--query "phase=cruise"] [--wait ms]
//
// Serves the repo (scripts/serve.mjs), opens headless Chromium with the app
// (autostart, quality=low, mute=1), waits for it to be ready, then evaluates the
// given script file in the page. The script must evaluate to a value or a Promise;
// its (JSON-serialisable) result is printed together with console errors/warnings.
// Example scripts: src/audio/tools/tests/*.js
import { createRequire } from 'node:module';
import { spawn } from 'node:child_process';
import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

const require = createRequire(import.meta.url);
let playwright;
try { playwright = require('playwright'); } catch { playwright = require('/usr/local/lib/node_modules/playwright'); }
const root = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '../../..');
const args = process.argv.slice(2);
const opt = (k, d) => { const i = args.indexOf(`--${k}`); return i >= 0 ? args[i + 1] : d; };
const file = args[0];
const code = fs.readFileSync(file, 'utf8');
const port = 20000 + Math.floor(Math.random() * 20000);
const server = spawn(process.execPath, [path.join(root, 'scripts/serve.mjs'), String(port)], { stdio: 'ignore' });
await new Promise((r) => setTimeout(r, 400));
const browser = await playwright.chromium.launch({ args: ['--use-angle=swiftshader', '--enable-unsafe-swiftshader', '--ignore-gpu-blocklist', '--autoplay-policy=no-user-gesture-required'] });
const errors = [], warnings = [], logs = [];
let result;
try {
  const page = await browser.newPage({ viewport: { width: 480, height: 270 } });
  page.on('console', (m) => { const t = m.type(); if (t === 'error') errors.push(m.text()); else if (t === 'warning') warnings.push(m.text()); else logs.push(m.text()); });
  page.on('pageerror', (e) => errors.push(`pageerror: ${e.message}`));
  page.on('requestfailed', (r) => errors.push(`requestfailed: ${r.url()}`));
  let q = opt('query', '');
  if (!/quality=/.test(q)) q += (q ? '&' : '') + 'quality=low';
  q += '&autostart=1&shot=1&mute=1';
  await page.goto(`http://localhost:${port}/?${q}`, { waitUntil: 'load', timeout: 180000 });
  await page.waitForFunction(() => window.__shotReady === true || (window.__app && window.__app.ready), null, { timeout: 180000, polling: 250 });
  const w = Number(opt('wait', 0)); if (w) await page.waitForTimeout(w);
  result = await page.evaluate(code);
  await page.close();
} catch (e) { result = { fatal: String(e && e.stack || e) }; }
await browser.close();
server.kill();
console.log(JSON.stringify({ result, errors: errors.slice(0, 30), warnings: warnings.filter((w) => !/GPU stall|swiftshader/i.test(w)).slice(0, 20), logs: logs.filter((l) => /audio/i.test(l)).slice(0, 20) }, null, 1));
