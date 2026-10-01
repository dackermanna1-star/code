// Headless play test: click the gate, walk forward, report errors and frame stats.
// node scripts/playtest.mjs [seconds] [out.png]
import { chromium } from '/opt/node22/lib/node_modules/playwright/index.mjs';
import fs from 'node:fs';
const secs = +(process.argv[2] ?? 4);
const out = process.argv[3];
const base = process.env.BASE ?? 'http://localhost:5180/';
const browser = await chromium.launch({ args: ['--use-gl=angle', '--use-angle=swiftshader', '--enable-unsafe-swiftshader', '--ignore-gpu-blocklist', '--autoplay-policy=no-user-gesture-required'] });
const page = await browser.newPage({ viewport: { width: 640, height: 360 } });
const logs = [];
page.on('console', (m) => { if (!m.text().includes('[vite]')) logs.push(`[${m.type()}] ${m.text()}`); });
page.on('pageerror', (e) => logs.push(`[pageerror] ${e.message}\n${e.stack}`));
await page.goto(base + '?dpr=1&fixedRes');
await page.waitForSelector('#gate.ready', { timeout: 300000 });
await page.click('#gate');
await page.keyboard.down('KeyW');
const t0 = Date.now();
await page.waitForTimeout(secs * 1000);
await page.keyboard.up('KeyW');
const info = await page.evaluate(() => {
  const e = window.__engine;
  return {
    pos: e.player.pos.toArray().map((v) => +v.toFixed(2)),
    steps: e.player.stepIndex,
    audioReady: !!e.audio?.ready,
    audioState: e.audio?.context?.state,
    debugReady: e.audio?.getDebugInfo ? e.audio.getDebugInfo().ready : null,
    renderScale: e.renderScale,
    frames: e.frames,
    simTime: +e.time.toFixed(2),
  };
});
console.log(JSON.stringify(info, null, 1));
if (out) {
  const d = await page.evaluate(() => document.getElementById('view').toDataURL('image/png'));
  fs.writeFileSync(out, Buffer.from(d.split(',')[1], 'base64'));
}
for (const l of logs.slice(0, 30)) console.log(l);
await browser.close();
