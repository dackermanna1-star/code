// UI & world tour: panels, fixtures, mirror, held items, night lighting.
import { createRequire } from 'node:module';
import fs from 'node:fs';
const require = createRequire(import.meta.url);
let chromium;
try { ({ chromium } = require('playwright')); } catch { ({ chromium } = require('/opt/node22/lib/node_modules/playwright')); }
const base = process.argv[2] || 'http://localhost:5173/';
const out = process.argv[3] || 'scripts/shots/tour';
const only = process.argv[4] ? process.argv[4].split(',') : null;
fs.mkdirSync(out, { recursive: true });
const browser = await chromium.launch({ args: ['--use-gl=angle', '--use-angle=swiftshader', '--enable-unsafe-swiftshader', '--ignore-gpu-blocklist'] });
const page = await browser.newPage({ viewport: { width: 960, height: 540 } });
const errors = [];
page.on('console', (m) => { if (m.type() === 'error') errors.push(m.text()); });
page.on('pageerror', (e) => errors.push(`[pageerror] ${e.message}\n${e.stack?.split('\n').slice(0, 3).join('\n')}`));
await page.goto(base + '?q=low&autotest');
await page.waitForFunction(() => window.__game && document.getElementById('title'), null, { timeout: 180000 });
await page.click('#title .btn.primary');
const frames = (n = 3) => page.evaluate((n) => new Promise((r) => { let k = 0; const f = () => (++k >= n ? r() : requestAnimationFrame(f)); requestAnimationFrame(f); }), n);
await frames(4);
const ev = (fn, arg) => page.evaluate(fn, arg);
const shot = async (name) => { await page.screenshot({ path: `${out}/${name}.png`, timeout: 120000 }); };
const view = (x, z, tx, ty, tz) => ev(([x, z, tx, ty, tz]) => { const G = window.__game; G.player.teleport(x, z); const c = G.player.camPos; const d = { x: tx - c.x, y: ty - c.y, z: tz - c.z }; const l = Math.hypot(d.x, d.y, d.z); G.player.yaw = Math.atan2(-d.x, -d.z); G.player.pitch = Math.asin(d.y / l); }, [x, z, tx, ty, tz]);
const steps = {
  fridge: async () => { await view(-2.6, 3.0, -2.6, 1.0, 4.6); await ev(() => window.__game.apartment.fridge.setOpen(true)); await frames(10); await shot('fridge'); await ev(() => window.__game.apartment.fridge.setOpen(false)); },
  mirror: async () => { await view(2.45, 2.9, 2.45, 1.55, 1.56); await frames(6); await shot('bath_mirror'); },
  closet: async () => { await view(5.0, 4.4, 6.4, 1.2, 2.6); await frames(6); await shot('closet'); await view(4.9, 3.6, 4.52, 1.1, 1.56); await frames(5); await shot('closet_mirror'); },
  bedroom: async () => { await view(2.3, -0.5, 6.0, 0.9, -1.8); await frames(6); await shot('bedroom'); await view(2.6, -3.0, 2.6, 1.0, -4.8); await frames(5); await shot('desk'); },
  held: async () => { await ev(() => { const G = window.__game; const i = G.items.spawn('soda_cola', { loc: 'storage' }); G.hand.take(i); }); await view(-2.0, -1.0, -3, 1.3, -3); await frames(12); await shot('held_soda'); await ev(() => { const G = window.__game; G.items.toStorage(G.hand.held, true); }); },
  wardrobe: async () => { await ev(() => window.__game.ui.openWardrobe()); await frames(6); await shot('wardrobe'); await ev(() => window.__game.ui.closeModal()); },
  cooking: async () => { await ev(() => window.__game.ui.openCooking(window.__game.apartment.range)); await frames(6); await shot('cooking'); await ev(() => window.__game.ui.closeModal()); },
  computer: async () => { await ev(() => window.__game.computer.show({})); await frames(6); await shot('computer'); await ev(() => window.__game.computer.launch('workhub')); await frames(4); await shot('workhub'); await ev(() => window.__game.computer.launch('browser')); await frames(4); await shot('browser'); await ev(() => window.__game.computer.close()); },
  game: async () => { await ev(() => window.__game.games.launch('neon_drift')); await frames(30); await shot('game_neon'); await ev(() => window.__game.games.quit()); },
  phoneapps: async () => { for (const a of ['goals', 'home', 'messages', 'storage', 'stockpile', 'music']) { await ev((a) => { const G = window.__game; G.state.level = 6; G.phone.show(a); }, a); await frames(5); await shot('app_' + a); } await ev(() => window.__game.phone.close()); },
  night: async () => { await ev(() => { const G = window.__game; G.state.time = 22 * 60; G.state.home.lights.living = true; G.apartment.applyLights(); }); await view(-0.5, 0.5, -4, 1.2, -4); await frames(30); await shot('night_living'); await ev(() => { const G = window.__game; G.weather.set('storm', true); }); await view(-2.0, -3.5, -2.5, 1.5, -6); await frames(20); await shot('night_storm'); },
  sunset: async () => { await ev(() => { const G = window.__game; G.state.time = 18.9 * 60; G.weather.set('clear', true); }); await view(-1.0, -2.0, -3.5, 1.5, -5.5); await frames(30); await shot('sunset'); },
};
for (const [k, f] of Object.entries(steps)) { if (only && !only.includes(k)) continue; try { await f(); console.log('ok', k); } catch (e) { console.log('FAIL', k, e.message); } }
console.log('ERRORS', errors.length);
for (const e of errors.slice(0, 30)) console.log(e);
await browser.close();
