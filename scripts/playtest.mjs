// Automated headless playtest: boots the game, plays through a day with a bot
// and captures screenshots + console errors.
// usage: node scripts/playtest.mjs [url] [outDir] [scenario]
import { chromium } from 'playwright-core';
import fs from 'node:fs';

const url = process.argv[2] || 'http://localhost:5173/?test=1';
const out = process.argv[3] || 'test-output/play';
const scenario = process.argv[4] || 'full';
const W = +(process.env.W || 1280);
const H = +(process.env.H || 720);
fs.mkdirSync(out, { recursive: true });

const browser = await chromium.launch({
  executablePath: '/opt/pw-browsers/chromium',
  args: ['--use-gl=angle', '--use-angle=swiftshader', '--enable-unsafe-swiftshader', '--ignore-gpu-blocklist', '--autoplay-policy=no-user-gesture-required'],
});
const page = await browser.newPage({ viewport: { width: W, height: H } });
const errors = [];
const logs = [];
page.on('console', (m) => {
  const t = `[${m.type()}] ${m.text()}`;
  logs.push(t);
  if (m.type() === 'error') errors.push(t);
});
page.on('pageerror', (e) => errors.push(`[pageerror] ${e.message}\n${e.stack}`));

let shotN = 0;
const shot = async (name) => {
  const f = `${out}/${String(shotN++).padStart(2, '0')}-${name}.png`;
  await page.screenshot({ path: f });
  console.log('shot', f);
};
const wait = (ms) => page.waitForTimeout(ms);
const g = (fn, arg) => page.evaluate(fn, arg);

const t0 = Date.now();
await page.goto(url, { waitUntil: 'load' });
await page.waitForSelector('.load-start button', { timeout: 240000 });
console.log('loaded in', ((Date.now() - t0) / 1000).toFixed(1), 's');
await shot('loaded');
await page.click('.load-start button');
await wait(4000);
await shot('title');
if (scenario === 'title') {
  console.log(errors.join('\n'));
  await browser.close();
  process.exit(0);
}
// speed up game time for the bot
await g(() => {
  window.__game.progress.data.tutorialDone = true;
  window.__game.progress.data.settings.hints = true;
});
await page.click('.title-btns .btn.yellow');
await wait(9000);
await shot('day-start');
await g(() => (window.__game.engine.timeScale = 3));

// wait for a customer at the counter
const waitFor = async (fn, timeout = 120000, step = 500, arg) => {
  const start = Date.now();
  while (Date.now() - start < timeout) {
    if (await g(fn, arg)) return true;
    await wait(step);
  }
  return false;
};
const ok1 = await waitFor(() => !!window.__game.customers.atCounter, 240000);
console.log('customer at counter:', ok1);
await g(() => (window.__game.engine.timeScale = 1));
await wait(1500);
await shot('customer-at-counter');
await g(() => window.__game.onTakeOrder());
await wait(2500);
await shot('ordering');
await waitFor(() => window.__game.orders.orders.length > 0, 60000);
const order = await g(() => JSON.parse(JSON.stringify(window.__game.orders.orders[0])));
console.log('order:', JSON.stringify(order));
await wait(3000);
await shot('ordered');

// grill
await g(() => window.__game.goStation('grill'));
await wait(2500);
const patties = order.layers.filter((l) => l.doneness);
await g((ps) => {
  for (const p of ps) window.__game.stations.grill.botPlace(p.id);
}, patties);
await wait(1500);
await shot('grill-placed');
const target = { rare: 0.4, medium: 0.6, well: 0.8 };
// cook side a, flip, cook side b, move to warmer
await g(() => (window.__game.engine.timeScale = 3));
for (let i = 0; i < patties.length; i++) {
  const tgt = target[patties[i].doneness];
  await waitFor((a) => window.__game.stations.grill.debugState()[a.i]?.a >= a.t - 0.01, 180000, 200, { i, t: tgt });
  await g((a) => {
    const st = window.__game.stations.grill.debugState();
    return st;
  }, { i });
  await g((i) => window.__game.stations.grill.botFlip(i), i);
}
await g(() => (window.__game.engine.timeScale = 1));
await wait(800);
await shot('grill-flipped');
await g(() => (window.__game.engine.timeScale = 3));
for (let i = 0; i < patties.length; i++) {
  const tgt = target[patties[i].doneness];
  await waitFor((a) => (window.__game.stations.grill.debugState()[a.i]?.b ?? 9) >= a.t - 0.01, 180000, 200, { i, t: tgt });
}
await g(() => (window.__game.engine.timeScale = 1));
console.log('grill state', JSON.stringify(await g(() => window.__game.stations.grill.debugState())));
await shot('grill-cooked');
for (let i = patties.length - 1; i >= 0; i--) {
  await g((i) => window.__game.stations.grill.botToWarmer(i), i);
  await wait(900);
}
await wait(1000);
await shot('warmer');

// build
await g(() => window.__game.goStation('build'));
await wait(2500);
await shot('build-empty');
const seq = [order.bun, ...order.layers.map((l) => l.id), order.bun];
for (const id of seq) {
  const ok = await g((id) => window.__game.stations.build.botAdd(id), id);
  console.log('add', id, ok);
  await wait(1400);
}
await shot('build-done');
await wait(4000);
// serve
await g(() => window.__game.goStation('serve'));
await g(() => (window.__game.engine.timeScale = 3));
await waitFor(() => {
  const gm = window.__game;
  return gm.orders.ready.some((r) => gm.stations.serve.canServe(r));
}, 90000);
await g(() => (window.__game.engine.timeScale = 1));
await wait(1000);
await shot('serve-ready');
await g(() => {
  const gm = window.__game;
  const r = gm.orders.ready[0];
  gm.onServe(r.order.id);
});
await wait(2500);
await shot('serving');
await wait(3500);
await shot('rating');
await wait(6000);
await shot('after-serve');
console.log('money', await g(() => window.__game.progress.data.money), 'xp', await g(() => window.__game.progress.data.xp));
// view dining room
await g(() => window.__game.goStation('order'));
await wait(6000);
await shot('dining');
console.log('ERRORS:\n' + errors.join('\n'));
fs.writeFileSync(`${out}/console.log`, logs.join('\n'));
await browser.close();
