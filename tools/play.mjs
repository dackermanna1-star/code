#!/usr/bin/env node
// Scripted playtest: node tools/play.mjs <scenario.mjs> [outDir] [w] [h]
// A scenario exports `default async function (t)` using t.eval(fn|string), t.shot(name), t.wait(ms),
// t.click(x,y), t.drag(x1,y1,x2,y2,steps), t.page (Playwright page).
import { chromium } from '/opt/node22/lib/node_modules/playwright/index.mjs';
import { mkdirSync } from 'node:fs';
import { resolve } from 'node:path';
const [, , scenario, outDir = 'shots/play', w = '1400', h = '800'] = process.argv;
const base = process.env.SHOT_BASE ?? 'http://localhost:5173';
mkdirSync(outDir, { recursive: true });
const browser = await chromium.launch({ args: ['--use-angle=swiftshader', '--enable-unsafe-swiftshader', '--ignore-gpu-blocklist'] });
const page = await browser.newPage({ viewport: { width: +w, height: +h } });
const logs = [];
page.on('pageerror', (e) => logs.push('pageerror: ' + e.message + '\n' + (e.stack ?? '').split('\n').slice(0, 4).join('\n')));
page.on('console', (m) => { if (m.type() === 'error' || m.type() === 'warning') logs.push(m.type() + ': ' + m.text()); });
await page.goto(base + (process.env.PLAY_PATH ?? '/'), { waitUntil: 'load', timeout: 120000 });
await page.waitForFunction(() => window.__ready === true, null, { timeout: 120000 });
const t = {
  page,
  eval: (fn, arg) => page.evaluate(fn, arg),
  wait: (ms) => page.waitForTimeout(ms),
  shot: async (name) => { await page.screenshot({ path: `${outDir}/${name}.png` }); console.log('shot', name); },
  click: async (x, y) => { await page.mouse.click(x, y); },
  drag: async (x1, y1, x2, y2, steps = 12) => {
    await page.mouse.move(x1, y1); await page.mouse.down();
    for (let i = 1; i <= steps; i++) { await page.mouse.move(x1 + ((x2 - x1) * i) / steps, y1 + ((y2 - y1) * i) / steps); await page.waitForTimeout(16); }
    await page.mouse.up();
  },
  /** project a world point to screen pixels */
  screenOf: (expr) => page.evaluate((e) => { const g = window.game; const p = eval(e).clone().project(g.camera.camera); const r = g.renderer.domElement.getBoundingClientRect(); return { x: (p.x * 0.5 + 0.5) * r.width + r.left, y: (-p.y * 0.5 + 0.5) * r.height + r.top }; }, expr),
};
try {
  const mod = await import(resolve(scenario));
  await mod.default(t);
} catch (e) { logs.push('scenario error: ' + e.message); }
await browser.close();
const uniq = [...new Set(logs)].filter((l) => !l.includes('ERR_CERT') && !l.includes('GPU stall'));
if (uniq.length) console.log(uniq.slice(0, 40).join('\n'));
