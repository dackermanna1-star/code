#!/usr/bin/env node
/* Fast-forward through the game with random choices (skip mode), then
 * screenshot the notebook tabs, history, saves, and the end summary.
 *   node tools/uicheck.mjs [--size=1280x720] [--stop=ch4] [--seed=3] */
import { chromium } from 'playwright-core';
import fs from 'fs';
import path from 'path';
import { fileURLToPath } from 'url';

const root = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..');
const args = process.argv.slice(2);
const [w, h] = (args.find((a) => a.startsWith('--size=')) || '--size=1280x720').split('=')[1].split('x').map(Number);
const stop = (args.find((a) => a.startsWith('--stop=')) || '--stop=end').split('=')[1];
const seed = parseInt((args.find((a) => a.startsWith('--seed=')) || '--seed=3').split('=')[1], 10);
const out = process.env.SHOTS || path.join(root, '.shots');
fs.mkdirSync(out, { recursive: true });
const browser = await chromium.launch({ executablePath: '/opt/pw-browsers/chromium_headless_shell-1194/chrome-linux/headless_shell', args: ['--allow-file-access-from-files'] });
const page = await browser.newPage({ viewport: { width: w, height: h } });
const errors = [];
page.on('pageerror', (e) => errors.push('pageerror: ' + e.message));
page.on('console', (m) => { if (m.type() === 'error') errors.push(m.text()); });
await page.route('**/*', (r) => (r.request().url().startsWith('file:') ? r.continue() : r.abort()));
await page.goto('file://' + path.join(root, 'index.html'));
await page.waitForTimeout(2200);
const tag = `${w}x${h}`;
await page.screenshot({ path: path.join(out, `ui_${tag}_title.png`) });
await page.click('#t-new'); await page.waitForTimeout(300); await page.click('#n-go'); await page.waitForTimeout(500);
await page.evaluate((seed) => { let s = seed; window.__rand = () => { s = (s * 1103515245 + 12345) & 0x7fffffff; return s / 0x7fffffff; }; ENGINE.settings.skipUnseen = true; ENGINE.settings.textSpeed = 100; ENGINE.setSkip(true); }, seed);
const t0 = Date.now();
let lastChapter = '';
while (Date.now() - t0 < 240000) {
  const st = await page.evaluate(() => ({
    choices: !document.querySelector('#choices').hidden, map: document.querySelector('#map').classList.contains('on'),
    card: document.querySelector('#card').classList.contains('on'), summary: document.querySelector('#summary').classList.contains('on'),
    ch: ENGINE.eng && ENGINE.eng.chapter ? ENGINE.eng.chapter.num : '', freeform: !document.querySelector('#freeform').hidden
  }));
  if (st.summary) break;
  if (st.ch !== lastChapter) { lastChapter = st.ch; if (stop !== 'end' && st.ch && st.ch.toLowerCase().includes(stop.replace('ch', 'chapter ').replace('chapter 4', 'four').replace('chapter 5', 'five').replace('chapter 3', 'three'))) break; }
  if (st.card) { await page.click('#card').catch(() => {}); await page.waitForTimeout(150); continue; }
  if (st.map) { await page.evaluate(() => { const b = document.querySelectorAll('#map .pin, #map .other .btn'); b[Math.floor(window.__rand() * b.length)].click(); }); await page.waitForTimeout(700); continue; }
  if (st.choices) { await page.evaluate(() => { const b = document.querySelectorAll('#choices .choice:not(.free)'); if (b.length) b[Math.floor(window.__rand() * b.length)].click(); }); await page.waitForTimeout(120); continue; }
  await page.evaluate(() => ENGINE.userAdvance());
  await page.waitForTimeout(25);
}
await page.evaluate(() => ENGINE.setSkip(false));
await page.waitForTimeout(600);
const summary = await page.evaluate(() => document.querySelector('#summary').classList.contains('on'));
if (summary) { await page.screenshot({ path: path.join(out, `ui_${tag}_summary.png`) }); await page.evaluate(() => document.querySelector('#summary').classList.remove('on')); }
await page.screenshot({ path: path.join(out, `ui_${tag}_stage.png`) });
for (const tab of ['people', 'clues', 'tapes', 'theories', 'self']) {
  await page.evaluate((t) => UI.openJournal(t), tab);
  await page.waitForTimeout(400);
  await page.screenshot({ path: path.join(out, `ui_${tag}_journal_${tab}.png`) });
}
await page.evaluate(() => { UI.closeAll(true); UI.openLog(); }); await page.waitForTimeout(400);
await page.screenshot({ path: path.join(out, `ui_${tag}_log.png`) });
await page.evaluate(() => { UI.closeAll(true); UI.openSaves('save'); }); await page.waitForTimeout(400);
await page.screenshot({ path: path.join(out, `ui_${tag}_saves.png`) });
await page.evaluate(() => { UI.closeAll(true); UI.openSettings(); }); await page.waitForTimeout(400);
await page.screenshot({ path: path.join(out, `ui_${tag}_settings.png`) });
console.log('reached:', lastChapter, 'summary:', summary);
console.log('ERRORS:\n' + [...new Set(errors)].filter((e) => !e.includes('ERR_FAILED')).join('\n'));
await browser.close();
