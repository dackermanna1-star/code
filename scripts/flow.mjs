// Gameplay flow test: order food on the phone, receive the delivery, unbox and eat it.
// node scripts/flow.mjs [baseUrl] [outdir]
import { createRequire } from 'node:module';
import fs from 'node:fs';
const require = createRequire(import.meta.url);
let chromium;
try { ({ chromium } = require('playwright')); } catch { ({ chromium } = require('/opt/node22/lib/node_modules/playwright')); }
const base = process.argv[2] || 'http://localhost:5173/';
const out = process.argv[3] || 'scripts/shots/flow';
fs.mkdirSync(out, { recursive: true });
const browser = await chromium.launch({ args: ['--use-gl=angle', '--use-angle=swiftshader', '--enable-unsafe-swiftshader', '--ignore-gpu-blocklist'] });
const page = await browser.newPage({ viewport: { width: 880, height: 500 } });
const errors = [];
page.on('console', (m) => { if (m.type() === 'error') errors.push(m.text()); });
page.on('pageerror', (e) => errors.push(`[pageerror] ${e.message}\n${e.stack?.split('\n').slice(0, 3).join('\n')}`));
await page.goto(base + '?q=low&autotest');
await page.waitForFunction(() => window.__game && document.getElementById('title'), null, { timeout: 120000 });
await page.evaluate(() => { localStorage.clear(); });
await page.click('#title .btn.primary');
await page.waitForTimeout(800);
let n = 0;
const shot = async (name) => { await page.screenshot({ path: `${out}/${String(++n).padStart(2, '0')}_${name}.png`, timeout: 120000 }); };
const aim = (x, y, z) => page.evaluate(([x, y, z]) => { const G = window.__game; const c = G.player.camPos; const d = { x: x - c.x, y: y - c.y, z: z - c.z }; const l = Math.hypot(d.x, d.y, d.z); G.player.yaw = Math.atan2(-d.x, -d.z); G.player.pitch = Math.asin(d.y / l); }, [x, y, z]);
const tp = (x, z) => page.evaluate(([x, z]) => window.__game.player.teleport(x, z), [x, z]);
const frames = (n = 3) => page.evaluate((n) => new Promise((r) => { let k = 0; const f = () => (++k >= n ? r() : requestAnimationFrame(f)); requestAnimationFrame(f); }), n);
const focus = () => page.evaluate(() => { const f = window.__game.interaction.focus; return f ? `${f.getName()} :: ${window.__game.interaction.actions.map((a) => a.key + ' ' + a.label).join(' | ')}` : 'none'; });
const press = async (k, wait = 400) => { await page.keyboard.press(k); await page.waitForTimeout(wait); };

// 1. phone & ordering
await press('Tab', 600);
await shot('phone_home');
await page.evaluate(() => window.__game.phone.openApp('grubhop'));
await page.waitForTimeout(800);
await shot('grubhop');
await page.evaluate(() => window.__game.phone.push('store', { store: 'grubhop', restaurant: 'smashbros' }));
await page.waitForTimeout(800);
await shot('restaurant');
await page.evaluate(() => window.__game.phone.push('product', { store: 'grubhop', id: 'smash_burger' }));
await page.waitForTimeout(800);
await shot('product');
await page.evaluate(() => { const G = window.__game; G.orders.addToCart('grubhop', 'smash_burger', 1); G.orders.addToCart('grubhop', 'pizza_slice', 2); G.phone.push('cart', { store: 'grubhop' }); });
await page.waitForTimeout(800);
await shot('cart');
await page.click('.ph-screen .btn.primary.big');
await page.waitForTimeout(800);
await shot('confirmed');
await press('Escape'); await press('Escape'); await press('Escape');
console.log('after esc:', await page.evaluate(() => JSON.stringify({ phone: window.__game.phone.open, paused: window.__game.ui.paused, locked: window.__game.input.locked, modal: !!window.__game.ui.modal, pauseEl: !!document.getElementById('pause') })));
// 2. fast-forward until delivery
await page.evaluate(() => { const G = window.__game; const o = G.state.orders[0]; G.state.time = o.eta + 0.5; G.orders.update(0, true); });
await page.waitForTimeout(500);
console.log('orders:', await page.evaluate(() => JSON.stringify(window.__game.state.orders.map((o) => [o.id, o.status]))));
console.log('packages in world:', await page.evaluate(() => window.__game.items.all().filter((i) => i.def.category === 'package' && i.data.loc === 'world').map((i) => i.def.id + '@' + i.data.pos.map((v) => v.toFixed(2)).join(','))));
// 3. open the front door
await tp(-0.6, 4.3);
await aim(-0.6, 1.2, 5.2);
await frames(3);
console.log('focus at door:', await focus());
await press('KeyE', 300);
await frames(8);
await aim(-0.6, 0.1, 5.75);
await frames(3);
await shot('door_open');
console.log('focus at mat:', await focus());
// 4. open the package
await press('KeyE', 300);
await frames(25);
await shot('unboxed');
const items = await page.evaluate(() => window.__game.items.all().filter((i) => i.data.loc === 'world' && ['smash_burger', 'pizza_slice'].includes(i.def.id)).map((i) => ({ id: i.def.id, pos: i.data.pos })));
console.log('food in world:', JSON.stringify(items));
// 5. pick up the burger and eat it
const burger = items.find((i) => i.id === 'smash_burger');
if (burger) {
  await aim(burger.pos[0], burger.pos[1] + 0.05, burger.pos[2]);
  await frames(3);
  console.log('focus burger:', await focus());
  await press('KeyE', 200);
  await frames(3);
  console.log('held:', await page.evaluate(() => window.__game.hand.held?.def.id));
  await shot('holding');
  const needs0 = await page.evaluate(() => window.__game.state.needs.hunger);
  for (let i = 0; i < 3; i++) { await page.mouse.click(440, 250); await frames(12); }
  await shot('eating');
  console.log('hunger', needs0, '->', await page.evaluate(() => window.__game.state.needs.hunger));
}
// 6. inside: sit on sofa, TV
await tp(-3.2, -2.5);
await aim(-4.3, 0.4, -2.5);
await frames(3);
console.log('focus sofa:', await focus());
await press('KeyE', 200);
await frames(10);
console.log('sitting:', await page.evaluate(() => window.__game.player.isSitting));
await aim(0.74, 0.9, -2.5);
await frames(3);
console.log('focus tv from sofa:', await focus());
await press('KeyE', 200);
await frames(6);
await shot('tv_on');
console.log('ERRORS', errors.length);
for (const e of errors.slice(0, 30)) console.log(e);
await browser.close();
