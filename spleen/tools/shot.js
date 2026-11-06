// Usage: node tools/shot.js "<query>" <outPrefix> [waitMs] [shots] [intervalMs] [w] [h]
// Loads the game headlessly (Babylon served from a local cache), screenshots, prints errors.
const { chromium } = require('playwright');
const path = require('path');
const fs = require('fs');
const BAB = process.env.BAB || '/tmp/claude-0/bab/babylon.js';
(async () => {
  const [query = '', out = '/tmp/claude-0/shot', wait = '2500', shots = '1', interval = '1000', w = '1280', h = '720'] = process.argv.slice(2);
  const browser = await chromium.launch({ args: ['--use-gl=angle', '--use-angle=swiftshader', '--enable-unsafe-swiftshader'] });
  const page = await browser.newPage({ viewport: { width: +w, height: +h } });
  const errors = [];
  page.on('console', (m) => { if (m.type() === 'error' || m.type() === 'warning') { const t = m.text(); if (!/GPU stall|GL Driver|ReadPixels/.test(t)) errors.push(m.type() + ': ' + t); } });
  page.on('pageerror', (e) => errors.push('pageerror: ' + e.message + '\n' + (e.stack || '').split('\n').slice(0, 4).join('\n')));
  await page.route('**/babylonjs@*/babylon.js', (r) => r.fulfill({ path: BAB, contentType: 'application/javascript' }));
  await page.addInitScript(() => { window.__TEST__ = true; });
  const file = 'file://' + path.resolve(__dirname, '..', 'index.html') + (query ? '?' + query : '');
  await page.goto(file);
  await page.waitForTimeout(+wait);
  for (let i = 0; i < +shots; i++) {
    await page.screenshot({ path: `${out}${shots > 1 ? '_' + i : ''}.png` });
    if (i < shots - 1) await page.waitForTimeout(+interval);
  }
  const info = await page.evaluate(() => {
    const S = window.__SPLEEN && __SPLEEN.SIM; if (!S) return null;
    return { state: __SPLEEN.Game.state, sub: __SPLEEN.Game.sub, room: S.room && S.room.type, enemies: S.enemies.length, hp: S.player && S.player.hp, floor: S.floor && S.floor.idx, fps: Gfx.fps() };
  });
  console.log(JSON.stringify(info));
  console.log(errors.length ? errors.join('\n') : 'no errors');
  await browser.close();
})();
