// Capture every UI preview scenario to PNGs (one browser, one page).
//   node tools/preview/ui_shots.js <outDir> [filter-regex] [--art=fake]
import { chromium } from '/opt/node22/lib/node_modules/playwright/index.mjs';
import { startServer } from '../serve.mjs';
import fs from 'node:fs';

const [outDir = 'shots', filter] = process.argv.slice(2).filter((a) => !a.startsWith('--'));
const artFake = process.argv.includes('--art=fake');
fs.mkdirSync(outDir, { recursive: true });
const srv = await startServer(0);
const browser = await chromium.launch({ args: ['--autoplay-policy=no-user-gesture-required'] });
const page = await browser.newPage({ viewport: { width: 960, height: 540 } });
let errors = 0;
page.on('console', (m) => { if (m.type() === 'error' || m.type() === 'warning') { if (m.type() === 'error') errors++; console.log(`[${m.type()}] ${m.text()}`); } });
page.on('pageerror', (e) => { errors++; console.log(`[pageerror] ${e.message}\n${e.stack}`); });
await page.goto(`http://127.0.0.1:${srv.port}/tools/preview/ui.html${artFake ? '?art=fake' : ''}`);
await page.waitForFunction(() => window.__ready === true, null, { timeout: 30000 });
const names = await page.evaluate(() => window.scenarios);
const re = filter ? new RegExp(filter) : null;
for (const n of names) {
  if (re && !re.test(n)) continue;
  try {
    await page.evaluate((s) => window.show(s), n);
    await page.screenshot({ path: `${outDir}/${n}.png`, clip: { x: 0, y: 0, width: 960, height: 540 } });
    console.log('shot', n);
  } catch (e) { errors++; console.log(`[fail] ${n}: ${e.message}`); }
}
await browser.close(); srv.close();
console.log(errors ? `${errors} errors` : 'ok');
process.exit(errors ? 1 : 0);
