// Shared Playwright helpers: launches Chromium (software GL) against the Vite dev server.
import { chromium } from 'playwright-core';
import fs from 'node:fs';
import path from 'node:path';

export const OUT = path.resolve('tests/output');
fs.mkdirSync(OUT, { recursive: true });

export async function launch({ width = 960, height = 540, url = 'http://localhost:5173/' } = {}) {
  const browser = await chromium.launch({
    executablePath: process.env.CHROME_PATH || '/opt/pw-browsers/chromium-1194/chrome-linux/chrome',
    args: ['--use-angle=swiftshader', '--enable-unsafe-swiftshader', '--ignore-gpu-blocklist', '--autoplay-policy=no-user-gesture-required'],
  });
  const page = await browser.newPage({ viewport: { width, height } });
  const errors = [];
  const logs = [];
  page.on('console', (m) => { const t = `[${m.type()}] ${m.text()}`; logs.push(t); if (m.type() === 'error') errors.push(t); });
  page.on('pageerror', (e) => errors.push('[pageerror] ' + e.message + '\n' + e.stack));
  await page.goto(url, { waitUntil: 'load' });
  return { browser, page, errors, logs };
}

export async function shot(page, name) {
  const p = path.join(OUT, name + '.png');
  await page.screenshot({ path: p });
  return p;
}
