#!/usr/bin/env node
/* Smoke test: open the game, start a new run, advance N steps (picking the
 * first choice whenever one appears), screenshot along the way.
 *   node tools/smoke.mjs [steps=30] [--every=5] [--size=1280x720] [--pick=random] */
import { chromium } from 'playwright-core';
import fs from 'fs';
import path from 'path';
import { fileURLToPath } from 'url';

const root = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..');
const args = process.argv.slice(2);
const steps = parseInt(args.find((a) => /^\d+$/.test(a)) || '30', 10);
const every = parseInt((args.find((a) => a.startsWith('--every=')) || '--every=5').split('=')[1], 10);
const [w, h] = (args.find((a) => a.startsWith('--size=')) || '--size=1280x720').split('=')[1].split('x').map(Number);
const pickRandom = args.includes('--pick=random');
const out = process.env.SHOTS || path.join(root, '.shots');
fs.mkdirSync(out, { recursive: true });

const browser = await chromium.launch({ executablePath: '/opt/pw-browsers/chromium_headless_shell-1194/chrome-linux/headless_shell', args: ['--allow-file-access-from-files', '--autoplay-policy=no-user-gesture-required'] });
const page = await browser.newPage({ viewport: { width: w, height: h } });
const errors = [];
page.on('console', (m) => { if (m.type() === 'error' || m.type() === 'warning') errors.push(m.type() + ': ' + m.text()); });
page.on('pageerror', (e) => errors.push('pageerror: ' + e.message));
await page.route('**/*', (r) => { const u = r.request().url(); if (u.startsWith('file:')) return r.continue(); return r.abort(); });
await page.goto('file://' + path.join(root, 'index.html'));
await page.waitForTimeout(2500);
let n = 0;
const shot = async (name) => { const f = path.join(out, `smoke_${String(n).padStart(3, '0')}_${name}.png`); await page.screenshot({ path: f }); console.log(f); };
await shot('title');
await page.click('#t-new');
await page.waitForTimeout(500);
await page.click('#n-go');
await page.waitForTimeout(800);
for (let i = 0; i < steps; i++) {
  n = i + 1;
  const state = await page.evaluate(() => ({
    choices: !document.querySelector('#choices').hidden, map: document.querySelector('#map').classList.contains('on'),
    card: document.querySelector('#card').classList.contains('on'), text: document.querySelector('#text').textContent.slice(0, 90)
  }));
  if (state.card) { await page.waitForTimeout(1200); await page.click('#card').catch(() => {}); await page.waitForTimeout(700); }
  if (state.map) {
    const pins = await page.$$('#map .pin, #map .other .btn');
    await pins[pickRandom ? Math.floor(Math.random() * pins.length) : 0].click();
    await page.waitForTimeout(900);
  } else if (state.choices) {
    if (i % every === 0) await shot('choice');
    const btns = await page.$$('#choices .choice:not(.free)');
    if (btns.length) await btns[pickRandom ? Math.floor(Math.random() * btns.length) : 0].click();
    await page.waitForTimeout(700);
  } else {
    await page.keyboard.press('Space'); // finish typing
    await page.waitForTimeout(120);
    if (i % every === 0) await shot('line');
    await page.keyboard.press('Space');
    await page.waitForTimeout(350);
  }
}
await shot('end');
console.log('ERRORS:\n' + [...new Set(errors)].join('\n'));
await browser.close();
