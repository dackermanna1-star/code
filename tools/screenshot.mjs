#!/usr/bin/env node
/**
 * Headless screenshot helper (Chromium + SwiftShader WebGL2).
 *
 *   node tools/screenshot.mjs <path-with-query> <out.png> [--w 1280] [--h 720] [--timeout 120000] [--port 5199]
 *
 * Starts a Vite dev server, opens http://localhost:<port>/<path>, waits until the page sets
 * `window.__shotReady = true` (or the timeout elapses), saves a PNG and prints console
 * errors. Pages can also expose `window.__shotInfo` (any JSON) which is printed.
 */
import { createServer } from 'vite';
import { chromium } from '/opt/node22/lib/node_modules/playwright/index.mjs';
import path from 'node:path';
import fs from 'node:fs';

const args = process.argv.slice(2);
const opt = (name, def) => {
  const i = args.indexOf('--' + name);
  return i >= 0 ? args[i + 1] : def;
};
const urlPath = args[0] ?? '/';
const out = args[1] ?? 'screenshots/shot.png';
const W = +opt('w', 1280), H = +opt('h', 720), timeout = +opt('timeout', 180000), port = +opt('port', 5199);

fs.mkdirSync(path.dirname(path.resolve(out)), { recursive: true });
const server = await createServer({ server: { port, strictPort: false, host: '127.0.0.1' }, logLevel: 'error' });
await server.listen();
const actualPort = server.config.server.port ?? port;
const addr = server.httpServer.address();
const realPort = typeof addr === 'object' && addr ? addr.port : actualPort;
const browser = await chromium.launch({
  args: ['--use-gl=angle', '--use-angle=swiftshader', '--enable-unsafe-swiftshader', '--ignore-gpu-blocklist', '--enable-webgl', '--disable-gpu-sandbox'],
});
const page = await browser.newPage({ viewport: { width: W, height: H } });
const logs = [];
page.on('console', (m) => {
  const t = m.type();
  if (t === 'error' || t === 'warning' || t === 'log' || t === 'info') logs.push(`[${t}] ${m.text()}`);
});
page.on('pageerror', (e) => logs.push(`[pageerror] ${e.stack || e.message}`));
const url = `http://127.0.0.1:${realPort}${urlPath.startsWith('/') ? '' : '/'}${urlPath}`;
const t0 = Date.now();
let ready = false;
try {
  await page.goto(url, { waitUntil: 'load', timeout: 120000 });
  await page.waitForFunction(() => window.__shotReady === true, null, { timeout, polling: 500 });
  ready = true;
} catch (e) {
  logs.push(`[shot] not ready: ${e.message.split('\n')[0]}`);
}
const info = await page.evaluate(() => window.__shotInfo ?? null).catch(() => null);
await page.screenshot({ path: out });
console.log(`screenshot ${out} (${ready ? 'ready' : 'TIMEOUT'}) in ${((Date.now() - t0) / 1000).toFixed(1)}s url=${url}`);
if (info) console.log('info:', JSON.stringify(info));
const maxLogs = 60;
for (const l of logs.slice(-maxLogs)) console.log(l);
await browser.close();
await server.close();
process.exit(0);
