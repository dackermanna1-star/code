// Validate the catalogue: node scripts/validate.mjs   (needs the dev server running; PORT env)
import { createRequire } from 'node:module';
const require = createRequire(import.meta.url);
let chromium;
try { ({ chromium } = require('playwright')); } catch { ({ chromium } = require('/opt/node22/lib/node_modules/playwright')); }
const port = process.env.PORT || 5173;
const browser = await chromium.launch({ args: ['--use-gl=angle', '--use-angle=swiftshader', '--enable-unsafe-swiftshader'] });
const page = await browser.newPage();
const errs = [];
page.on('pageerror', (e) => errs.push(e.message));
await page.goto(`http://localhost:${port}/preview.html?validate&n=0`);
await page.waitForFunction(() => window.__validation, null, { timeout: 120000 });
const v = await page.evaluate(() => window.__validation);
console.log(`items ${v.total} (visible ${v.visible}) · games ${v.games} · recipes ${v.recipes} · series ${v.series} · card sets ${v.cardSets}`);
console.log('by category', JSON.stringify(v.counts));
console.log(`${v.problems.length} problems`);
for (const p of v.problems) console.log(' -', p);
for (const e of errs) console.log('PAGEERROR', e);
await browser.close();
