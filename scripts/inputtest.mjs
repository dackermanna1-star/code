// Real pointer-input playtest (drags & clicks through the 3D scene) + tutorial.
import { chromium } from 'playwright-core';
import fs from 'node:fs';
const url = process.argv[2] || 'http://localhost:4173/?test=1';
const out = process.argv[3] || 'test-output/input';
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
const waitFor = async (fn, timeout = 120000, arg) => { const s = Date.now(); while (Date.now() - s < timeout) { if (await g(fn, arg)) return true; await wait(400); } return false; };
const scr = (v) => g((v) => window.__game.screenOf(v.x, v.y, v.z), v);
const drag = async (from, to, steps = 8) => {
  await page.mouse.move(from.x, from.y);
  await wait(300);
  await page.mouse.down();
  await wait(500);
  for (let i = 1; i <= steps; i++) {
    await page.mouse.move(from.x + ((to.x - from.x) * i) / steps, from.y + ((to.y - from.y) * i) / steps);
    await wait(250);
  }
  await wait(900);
  await page.mouse.up();
  await wait(600);
};
const tut = async () => g(() => window.__game.ui.tutorial.step?.id ?? null);
// wait until the camera has finished flying between stations
const settle = async () => {
  await wait(500);
  await waitFor(() => !window.__game.transitioning && !window.__game.rig.transitioning, 120000);
  await wait(800);
};
const station = async (key) => {
  await page.keyboard.press(key);
  await settle();
};

await page.goto(url);
await page.waitForSelector('.load-start button', { timeout: 240000 });
await g(() => localStorage.clear());
await page.click('.load-start button');
await wait(3000);
await page.click('.title-btns .btn.yellow');
await wait(9000);
console.log('tutorial step:', await tut());
await shot('tutorial-welcome');
await page.waitForSelector('.coach:not(.hidden) .btn', { timeout: 180000 });
console.log('tutorial step:', await tut());
await page.click('.coach:not(.hidden) .btn', { force: true });
await wait(800);
await g(() => (window.__game.engine.timeScale = 3));
await waitFor(() => !!window.__game.customers.atCounter, 240000);
await g(() => (window.__game.engine.timeScale = 1));
await wait(1500);
console.log('tutorial step:', await tut());
await shot('tutorial-order');
await page.click('.take-order .btn', { force: true });
await waitFor(() => window.__game.orders.orders.length > 0, 60000);
await wait(3000);
const order = await g(() => JSON.parse(JSON.stringify(window.__game.orders.orders[0])));
console.log('order', JSON.stringify(order));
console.log('tutorial step:', await tut());
await shot('tutorial-to-grill');
await station('2');
console.log('tutorial step:', await tut());
// drag a beef patty onto the grill
const tray = await g(() => { const p = window.__game.stations.grill.trayPos('patty_beef'); return { x: p.x, y: p.y, z: p.z }; });
const grillC = { x: -3.0, y: 0.97, z: -5.72 };
await drag(await scr(tray), await scr(grillC));
await wait(1500);
console.log('patties', JSON.stringify(await g(() => window.__game.stations.grill.debugState())));
console.log('tutorial step:', await tut());
await shot('patty-dragged');
const target = { rare: 0.4, medium: 0.6, well: 0.8 }[order.layers.find((l) => l.doneness).doneness];
await g(() => (window.__game.engine.timeScale = 3));
await waitFor((t) => (window.__game.stations.grill.debugState()[0]?.a ?? 0) >= t - 0.02, 180000, target);
await g(() => (window.__game.engine.timeScale = 1));
await wait(300);
await shot('gauge-ready');
const pp = await g(() => { const p = window.__game.stations.grill.botPatties()[0].piece.obj.position; return { x: p.x, y: p.y, z: p.z }; });
const pps = await scr(pp);
await page.mouse.click(pps.x, pps.y);
await wait(2000);
console.log('after click-flip', JSON.stringify(await g(() => window.__game.stations.grill.debugState())));
console.log('tutorial step:', await tut());
await g(() => (window.__game.engine.timeScale = 3));
await waitFor((t) => (window.__game.stations.grill.debugState()[0]?.b ?? 0) >= t - 0.02, 180000, target);
await g(() => (window.__game.engine.timeScale = 1));
await wait(300);
// drag patty to the warmer
const warm = await g(() => { const p = window.__game.warmer.root.position; return { x: p.x, y: p.y, z: p.z }; });
await drag(await scr(pp), await scr(warm));
await wait(1500);
console.log('warmer count', await g(() => window.__game.warmer.count));
console.log('tutorial step:', await tut());
await shot('in-warmer');
// build
await station('3');
console.log('tutorial step:', await tut());
await shot('build-start');
const plate = await g(() => { const p = window.__game.stations.build.stack.group.position; return { x: p.x, y: p.y, z: p.z }; });
const seq = [order.bun, ...order.layers.map((l) => l.id), order.bun];
for (const id of seq) {
  let from;
  if (id.startsWith('patty')) {
    from = await g(() => { const w = window.__game.warmer; const i = w.items.findIndex((x) => x); const p = w.slotWorld(i); return { x: p.x, y: p.y + 0.02, z: p.z }; });
  } else {
    from = await g((id) => { const p = window.__game.stations.build.sourcePos(id); return { x: p.x, y: p.y + 0.04, z: p.z }; }, id);
  }
  const top = await g(() => window.__game.stations.build.stack?.height ?? 0);
  await drag(await scr(from), await scr({ x: plate.x, y: plate.y + top + 0.085, z: plate.z }), 6);
  await wait(id.startsWith('ketchup') || id.startsWith('mustard') || id.startsWith('mayo') ? 1500 : 800);
  console.log('placed', id, 'layers', await g(() => window.__game.stations.build.stack?.items.length ?? -1));
}
await wait(2500);
await shot('build-complete');
console.log('ready', await g(() => window.__game.orders.ready.length));
console.log('tutorial step:', await tut());
await station('4');
await g(() => (window.__game.engine.timeScale = 3));
await waitFor(() => !!document.querySelector('.serve-btn .btn'), 120000);
await g(() => (window.__game.engine.timeScale = 1));
await wait(1000);
await shot('serve-button');
console.log('tutorial step before serve:', await tut());
await page.click('.serve-btn .btn', { force: true });
await wait(6000);
await shot('rating');
// dismiss the rating panel, then the tutorial's closing bubble
await waitFor(() => !window.__game.stations.serve.serving, 120000);
await wait(1500);
console.log('tutorial step after serve:', await tut());
const done = await page.$('.coach:not(.hidden) .btn');
if (done) await done.click({ force: true });
await wait(1000);
console.log('money', await g(() => window.__game.progress.data.money));
console.log('tutorial step:', await tut());
await shot('after');
console.log('ERRORS:\n' + errors.join('\n'));
await browser.close();
