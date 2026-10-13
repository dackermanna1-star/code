// End-to-end smoke test: serves the built game, opens it in headless
// Chromium (WebGL2 via SwiftShader), creates a world, waits for the player
// to spawn and terrain to mesh, walks around, swings, opens the inventory,
// and takes screenshots. Fails on page errors or if the game never spawns.
//   node scripts/e2e-smoke.mjs [outDir]
import { spawn } from 'node:child_process';
import { mkdirSync } from 'node:fs';
import { chromium } from 'playwright-core';

const out = process.argv[2] ?? 'test-results';
mkdirSync(out, { recursive: true });
const port = 8000 + Math.floor(Math.random() * 1000);
const server = spawn(process.execPath, ['scripts/serve.mjs', String(port)], { stdio: 'pipe' });
await new Promise((r) => server.stdout.once('data', r));

const exe = process.env.CHROMIUM_PATH ?? '/opt/pw-browsers/chromium-1194/chrome-linux/chrome';
const browser = await chromium.launch({ executablePath: exe, args: ['--use-angle=swiftshader', '--enable-unsafe-swiftshader', '--ignore-gpu-blocklist'] });
const page = await browser.newPage({ viewport: { width: 1280, height: 720 } });
const errors = [];
const logs = [];
page.on('pageerror', (e) => errors.push(String(e)));
page.on('console', (m) => {
  logs.push(`[${m.type()}] ${m.text()}`);
  if (m.type() === 'error') errors.push(m.text());
});

let ok = false;
try {
  await page.goto(`http://localhost:${port}/`);
  await page.fill('#m-name', 'Tester');
  await page.evaluate(() => { (document.getElementById('m-new')).open = true; });
  await page.fill('#nw-name', 'Smoke World');
  await page.fill('#nw-seed', process.env.SEED ?? '424242');
  await page.check('#nw-cheats');
  const t0 = Date.now();
  await page.click('#nw-create');
  await page.waitForSelector('#loading.hidden', { state: 'attached', timeout: 60000 });
  console.log(`spawned after ${Date.now() - t0} ms`);
  // let terrain mesh
  await page.waitForFunction(() => {
    const t = document.getElementById('fps')?.textContent ?? '';
    const m = /meshed (\d+) pending (\d+)/.exec(t);
    return m && Number(m[1]) > 100 && Number(m[2]) < 4;
  }, null, { timeout: 90000 }).catch(() => console.log('warning: meshing did not settle in time'));
  console.log('stats:', await page.textContent('#fps'));
  await page.screenshot({ path: `${out}/01-spawn.png` });
  // turn inland, walk forward
  await page.evaluate(() => { const g = window.__corrode; g.local.yaw = Math.PI; g.local.pitch = -0.15; });
  await page.waitForTimeout(300);
  await page.keyboard.down('KeyW');
  await page.waitForTimeout(1500);
  await page.keyboard.up('KeyW');
  await page.screenshot({ path: `${out}/02-walk.png` });
  // inventory & crafting UI
  await page.keyboard.press('Tab');
  await page.waitForTimeout(400);
  await page.screenshot({ path: `${out}/03-inventory.png` });
  await page.keyboard.press('Tab');
  // night & cheats via console
  await page.keyboard.press('Enter');
  await page.fill('#chat-input', '/give building_plan 1');
  await page.keyboard.press('Enter');
  await page.waitForTimeout(300);
  await page.keyboard.press('KeyM');
  await page.waitForTimeout(400);
  await page.screenshot({ path: `${out}/04-map.png` });
  await page.keyboard.press('KeyM');
  // --- persistence through IndexedDB: give items, quit, reload page, continue ---
  await page.evaluate(() => window.__corrode.sim.send({ t: 'chat', text: '/give scrap 123' }));
  await page.waitForTimeout(500);
  const before = await page.evaluate(() => [...window.__corrode.inv.main, ...window.__corrode.inv.belt].filter((s) => s && s.id === 'scrap').reduce((a, s) => a + s.n, 0));
  await page.evaluate(() => window.__corrode.setMode('pause'));
  await page.waitForTimeout(300);
  await page.click('#p-quit');
  await page.waitForSelector('#menu:not(.hidden)', { timeout: 30000 });
  await page.reload();
  await page.waitForSelector('#m-worlds .world button.primary', { timeout: 10000 });
  await page.click('#m-worlds .world button.primary');
  await page.waitForSelector('#loading.hidden', { state: 'attached', timeout: 60000 });
  await page.waitForTimeout(800);
  const after = await page.evaluate(() => [...window.__corrode.inv.main, ...window.__corrode.inv.belt].filter((s) => s && s.id === 'scrap').reduce((a, s) => a + s.n, 0));
  console.log(`persistence: scrap before quit ${before}, after reload ${after}`);
  const persisted = before === 123 && after === 123;
  await page.screenshot({ path: `${out}/05-reloaded.png` });
  ok = errors.length === 0 && persisted;
  console.log('hint:', await page.textContent('#hint'));
} catch (e) {
  console.error('E2E failure:', e);
  await page.screenshot({ path: `${out}/error.png` }).catch(() => undefined);
}
console.log(logs.filter((l) => !l.includes('[log]')).slice(-25).join('\n'));
if (errors.length) console.error('Page errors:\n' + errors.join('\n'));
await browser.close();
server.kill();
console.log(ok ? 'E2E OK' : 'E2E FAILED');
process.exit(ok ? 0 : 1);
