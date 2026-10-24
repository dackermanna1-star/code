// Headless playtest helper: loads the game, runs a scenario script, saves screenshots.
// Usage: node tools/shot.mjs <url> <outDir> [scenario.js]
import { createRequire } from 'node:module';
const require = createRequire(import.meta.url);
const { chromium } = require('/opt/node-tools/node_modules/playwright');
import fs from 'node:fs';
import path from 'node:path';

const url = process.argv[2] || 'http://localhost:5173/';
const outDir = process.argv[3] || './shots';
const scenarioPath = process.argv[4];
fs.mkdirSync(outDir, { recursive: true });

const browser = await chromium.launch({
  args: ['--use-angle=swiftshader', '--enable-unsafe-swiftshader', '--ignore-gpu-blocklist', '--autoplay-policy=no-user-gesture-required'],
});
const vw = parseInt(process.env.VW || '960', 10);
const vh = parseInt(process.env.VH || '540', 10);
const page = await browser.newPage({ viewport: { width: vw, height: vh } });
const logs = [];
page.on('console', (m) => logs.push(`[${m.type()}] ${m.text()}`));
page.on('pageerror', (e) => logs.push(`[pageerror] ${e.message}\n${e.stack}`));
await page.goto(url, { waitUntil: 'load' });
await page.waitForFunction(() => !!window.__game, null, { timeout: 60000 });
const shot = async (name) => {
  await page.screenshot({ path: path.join(outDir, name + '.png'), timeout: 90000 });
  console.log('saved', name);
};
if (scenarioPath) {
  const mod = await import(path.resolve(scenarioPath));
  await mod.default({ page, shot, logs });
} else {
  await page.waitForTimeout(2000);
  await shot('default');
}
console.log('--- console ---');
for (const l of logs.slice(-80)) console.log(l);
await browser.close();
