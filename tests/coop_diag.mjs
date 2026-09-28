// Co-op frame-rate diagnostic: host + client pages, prints frame counters.
import { chromium } from 'playwright';
const url = process.argv[2] || 'http://localhost:5190/';
const browser = await chromium.launch({ args: ['--use-gl=angle', '--use-angle=swiftshader', '--enable-unsafe-swiftshader', '--ignore-gpu-blocklist', '--disable-renderer-backgrounding', '--disable-background-timer-throttling', '--disable-backgrounding-occluded-windows'] });
const mk = async (tag) => {
  const ctx = await browser.newContext({ viewport: { width: 640, height: 360 } });
  const page = await ctx.newPage();
  page.on('pageerror', (e) => console.log(tag, 'pageerror', e.message));
  await page.addInitScript(() => { const s = JSON.parse(localStorage.getItem('lastfour.settings') || '{}'); s.quality = 'low'; s.tts = false; s.character = 'bill'; localStorage.setItem('lastfour.settings', JSON.stringify(s)); });
  await page.goto(url);
  await page.evaluate(() => { const t = setInterval(() => { if (window.game) { window.game.noRender = true; clearInterval(t); } }, 50); setInterval(() => { if (window.session) window.session.game.frame(1 / 30); }, 33); });
  return page;
};
const wait = (ms) => new Promise((r) => setTimeout(r, ms));
const A = await mk('A'), B = await mk('B');
for (let i = 0; i < 60; i++) { await wait(1000); if (await A.evaluate(() => window.session?.state === 'menu') && await B.evaluate(() => window.session?.state === 'menu')) break; }
const relay = url.replace(/^http/, 'ws') + 'net';
const code = await A.evaluate(async (r) => { await window.session.coopHost(r, 'H', () => {}); return window.session.net.code; }, relay);
await B.evaluate(async ([r, c]) => { await window.session.coopJoin(r, c, 'J', () => {}); }, [relay, code]);
await wait(1000);
await A.evaluate(() => window.session.coopStart(0));
for (let i = 0; i < +(process.env.N || 15); i++) {
  await wait(3000);
  const a = await A.evaluate(() => [window.game.frameNo, window.game.time.toFixed(2), window.session.state, Math.round(window.game.perf?.upd || 0)]);
  const b = await B.evaluate(() => [window.game.frameNo, window.game.time.toFixed(2), window.session.state, Math.round(window.game.perf?.upd || 0), window.session.net?.loaded, window.game.paused, document.visibilityState]);
  console.log('A', JSON.stringify(a), 'B', JSON.stringify(b));
}
await browser.close();
