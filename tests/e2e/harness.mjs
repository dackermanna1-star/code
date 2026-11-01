// Shared Playwright harness: serves the repo, routes the Babylon CDN to the local copy,
// and exposes helpers for screenshot-driven checks.
import { createRequire } from 'node:module';
import path from 'node:path';
import fs from 'node:fs';
import { fileURLToPath } from 'node:url';
import { startServer } from '../../tools/serve.mjs';

const require = createRequire('/opt/node22/lib/node_modules/');
const { chromium } = require('playwright');
export const ROOT = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '../..');
export const OUT = path.join(ROOT, 'tests/e2e/out');
fs.mkdirSync(OUT, { recursive: true });

export async function launch({ port = 8123, width = 1280, height = 720, query = '?manual' } = {}) {
  const server = await startServer(port, true);
  const browser = await chromium.launch({ args: ['--use-angle=swiftshader', '--enable-unsafe-swiftshader', '--ignore-gpu-blocklist', '--autoplay-policy=no-user-gesture-required'] });
  const page = await browser.newPage({ viewport: { width, height } });
  const logs = [];
  page.on('console', (m) => logs.push(`[${m.type()}] ${m.text()}`));
  page.on('pageerror', (e) => logs.push(`[pageerror] ${e.message}\n${e.stack}`));
  await page.route('https://cdn.jsdelivr.net/npm/babylonjs@7.54.3/babylon.js', (r) => r.fulfill({ path: path.join(ROOT, 'node_modules/babylonjs/babylon.js'), contentType: 'text/javascript' }));
  await page.route(/fonts\.(googleapis|gstatic)\.com/, (r) => r.abort());
  await page.goto(`http://localhost:${port}/index.html${query}`);
  const close = async () => { await browser.close(); server.close(); };
  return { page, browser, logs, close };
}
export async function waitFor(page, fnSrc, timeout = 60000) {
  await page.waitForFunction(fnSrc, null, { timeout, polling: 250 });
}
export async function shot(page, name) {
  const file = path.join(OUT, `${name}.png`);
  await page.screenshot({ path: file });
  return file;
}
