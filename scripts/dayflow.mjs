// Plays full days with the autopilot bot: day 1 → summary → shop → day 2.
import { chromium } from 'playwright-core';
import fs from 'node:fs';
const url = process.argv[2] || 'http://localhost:5173/?test=1';
const out = process.argv[3] || 'test-output/day';
const days = +(process.argv[4] || 1);
fs.mkdirSync(out, { recursive: true });
const browser = await chromium.launch({ executablePath: '/opt/pw-browsers/chromium', args: ['--use-gl=angle', '--use-angle=swiftshader', '--enable-unsafe-swiftshader', '--ignore-gpu-blocklist'] });
const page = await browser.newPage({ viewport: { width: 1280, height: 720 } });
const errors = [];
page.on('console', (m) => { if (m.type() === 'error') errors.push(m.text()); });
page.on('pageerror', (e) => errors.push(`[pageerror] ${e.message}\n${e.stack}`));
let n = 0;
const shot = async (name) => { const f = `${out}/${String(n++).padStart(2, '0')}-${name}.png`; await page.screenshot({ path: f }); console.log('shot', f); };
const g = (fn, arg) => page.evaluate(fn, arg);
const wait = (ms) => page.waitForTimeout(ms);
await page.goto(url);
await page.waitForSelector('.load-start button', { timeout: 240000 });
await page.evaluate(() => localStorage.clear());
await page.click('.load-start button');
await wait(3000);
await g(() => { window.__game.progress.data.tutorialDone = true; });
await page.click('.title-btns .btn.yellow');
await wait(8000);
const mem = () => g(() => { const r = window.__game.engine.renderer; return { geo: r.info.memory.geometries, tex: r.info.memory.textures, prog: r.info.programs?.length ?? 0, heapMB: performance.memory ? Math.round(performance.memory.usedJSHeapSize / 1048576) : -1 }; });
console.log('memory at day start', JSON.stringify(await mem()));
await g(() => window.__game.startBot(1));
await g(() => (window.__game.engine.timeScale = 4));
for (let d = 0; d < days; d++) {
  const start = Date.now();
  let lastShot = 0;
  while (Date.now() - start < 1500000) {
    const st = await g(() => window.__game.state);
    if (st === 'summary') break;
    if (Date.now() - lastShot > 60000) { lastShot = Date.now(); await shot(`day${d + 1}-progress`); console.log(await g(() => ({ t: window.__game.dayTime | 0, cust: window.__game.customers.list.map((c) => c.state), served: window.__game.progress.data.stats.served }))); }
    await wait(2000);
  }
  await wait(5000);
  await shot(`day${d + 1}-summary`);
  console.log('money', await g(() => window.__game.progress.data.money), 'xp', await g(() => window.__game.progress.data.xp), 'rank', await g(() => window.__game.progress.rank));
  console.log('memory at day end', JSON.stringify(await mem()));
  // shop
  const shopBtn = await page.$('.btn.teal');
  if (shopBtn) { await shopBtn.click(); await wait(1500); await shot(`day${d + 1}-shop`);
    await g(() => { window.__game.progress.data.money += 500; });
    const tabs = await page.$$('.tab'); if (tabs[1]) { await tabs[1].click(); await wait(800); await shot(`day${d + 1}-shop-decor`); }
    const done = await page.$('.modal .actions .btn.yellow'); if (done) await done.click(); await wait(1500);
  }
  const next = await page.$('.modal .actions .btn.yellow');
  if (next) await next.click();
  await wait(9000);
  await g(() => (window.__game.engine.timeScale = 4));
}
await shot('end');
console.log('ERRORS:\n' + errors.join('\n'));
await browser.close();
