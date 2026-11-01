// Smoke test for the bundled build (dist/): boots on desktop and on an emulated phone,
// walks title -> intake -> play, and checks touch controls drive the player.
// Run `npm run build` first.
import { createRequire } from 'node:module';
import path from 'node:path';
import fs from 'node:fs';
import { ROOT, OUT } from './harness.mjs';
import { startServer } from '../../tools/serve.mjs';

const require = createRequire('/opt/node22/lib/node_modules/');
const { chromium, devices } = require('playwright');
if (!fs.existsSync(path.join(ROOT, 'dist/standalone.html'))) { console.error('dist/ missing: run npm run build'); process.exit(1); }

const server = await startServer(8124, true);
const browser = await chromium.launch({ args: ['--use-angle=swiftshader', '--enable-unsafe-swiftshader', '--ignore-gpu-blocklist'] });
let failed = 0;
const check = (ok, msg) => { console.log(`${ok ? '✔' : '✘'} ${msg}`); if (!ok) failed++; };
// Headless Chromium rasterises WebGL on the CPU here (a few fps), so poll instead of fixed waits.
const until = (page, fn, arg, timeout = 5000) => page.waitForFunction(fn, arg, { timeout, polling: 100 }).then(() => true, () => false);

async function open(ctxOpts, query = '') {
  const ctx = await browser.newContext(ctxOpts);
  const page = await ctx.newPage();
  const errors = [];
  page.on('pageerror', (e) => errors.push(e.message));
  page.on('console', (m) => { if (m.type() === 'error' && !/fonts\.g|net::ERR_FAILED/.test(m.text())) errors.push(m.text()); });
  await page.route('https://cdn.jsdelivr.net/npm/babylonjs@7.54.3/babylon.js', (r) => r.fulfill({ path: path.join(ROOT, 'node_modules/babylonjs/babylon.js'), contentType: 'text/javascript' }));
  await page.route(/fonts\.(googleapis|gstatic)\.com/, (r) => r.abort());
  await page.goto(`http://localhost:8124/dist/standalone.html${query}`);
  await page.waitForFunction(() => window.__game && document.getElementById('boot')?.classList.contains('hidden'), null, { timeout: 90000 });
  return { ctx, page, errors };
}

// ---------------------------------------------------------------- desktop
{
  const { ctx, page, errors } = await open({ viewport: { width: 1280, height: 720 } });
  await page.waitForTimeout(800);
  await page.screenshot({ path: path.join(OUT, 'dist-title.png') });
  check(await page.isVisible('text=New Sentence'), 'desktop: title menu shows');
  await page.click('text=New Sentence');
  await page.waitForTimeout(300);
  await page.click('[data-act="begin"]');
  await page.waitForFunction(() => window.__game.mode === 'play', null, { timeout: 20000 });
  await page.waitForTimeout(1500);
  const touchShown = await page.evaluate(() => window.__game.touch.active);
  check(!touchShown, 'desktop: touch controls stay hidden');
  // Clicking the canvas asks for mouse capture; when refused the game falls back to drag-look.
  await page.mouse.click(640, 360);
  await page.waitForTimeout(300);
  const st = await page.evaluate(() => ({ locked: window.__game.input.pointerLocked, drag: window.__game.input.dragLook }));
  check(st.locked || st.drag, `desktop: mouse look available (${st.locked ? 'pointer lock' : 'drag-look fallback'})`);
  // Real mouse input: a left click throws a punch, and the camera keeps turning while a button is held.
  const atk0 = await page.evaluate(() => window.__game.player.lastAttackT || 0);
  await page.mouse.down({ button: 'left' });
  const punched = await until(page, (t) => (window.__game.player.lastAttackT || 0) > t, atk0);
  // Headless pointer lock reports each synthetic move plus an equal "recentre" jump, so feed the
  // handler pointer events with known deltas instead (button still held).
  const yawA = await page.evaluate(() => window.__game.cameraRig.yaw);
  await page.evaluate(() => {
    for (let i = 0; i < 8; i++) document.dispatchEvent(new PointerEvent('pointermove', { pointerType: 'mouse', buttons: 1, movementX: 30, movementY: 0, bubbles: true }));
  });
  const turned = await until(page, (y) => Math.abs(window.__game.cameraRig.yaw - y) > 0.15, yawA);
  await page.mouse.up({ button: 'left' });
  check(punched, 'desktop: left click throws a punch');
  check(turned, 'desktop: mouse turns the camera while a button is held');
  const audio = await page.evaluate(async () => { const a = window.__game.audio; await a.init?.(); return !!(a.manifest && Object.keys(a.manifest).length); });
  check(audio, 'desktop: audio manifest loads from a relative path');
  await page.screenshot({ path: path.join(OUT, 'dist-play.png') });
  check(errors.length === 0, `desktop: no page errors${errors.length ? ': ' + errors.slice(0, 3).join(' | ') : ''}`);
  await ctx.close();
}

// ---------------------------------------------------------------- desktop, mouse capture refused
{
  const { ctx: ctx2, page, errors } = await open({ viewport: { width: 1280, height: 720 } }, '?start');
  // Embedded viewers can refuse pointer lock: make every request fail the way browsers do.
  await page.evaluate(() => {
    HTMLCanvasElement.prototype.requestPointerLock = function () {
      setTimeout(() => document.dispatchEvent(new Event('pointerlockerror')), 0);
      return Promise.reject(new DOMException('Pointer lock refused', 'SecurityError'));
    };
  });
  await until(page, () => window.__game.mode === 'play');
  await page.mouse.click(640, 360);
  const fell = await until(page, () => window.__game.input.dragLook);
  const toast = await until(page, () => [...document.querySelectorAll('.toast')].some((t) => /drag to look/.test(t.textContent)));
  check(fell && toast, 'refused capture: falls back to drag-to-look and says so');
  const yaw0 = await page.evaluate(() => window.__game.cameraRig.yaw);
  const atk1 = await page.evaluate(() => window.__game.player.lastAttackT || 0);
  await page.mouse.move(640, 360);
  await page.mouse.down({ button: 'right' });
  for (let i = 1; i <= 10; i++) await page.mouse.move(640 + i * 20, 360);
  await until(page, (y) => Math.abs(window.__game.cameraRig.yaw - y) > 0.2, yaw0);
  await page.mouse.up({ button: 'right' });
  const heavy = await page.evaluate((t) => (window.__game.player.lastAttackT || 0) > t, atk1);
  check(!heavy, 'refused capture: right-drag does not throw a heavy attack');
  const yaw1 = await page.evaluate(() => window.__game.cameraRig.yaw);
  check(Math.abs(yaw1 - yaw0) > 0.2, `refused capture: dragging turns the camera (${(yaw1 - yaw0).toFixed(2)} rad)`);
  check(errors.length === 0, `refused capture: no page errors${errors.length ? ': ' + errors.slice(0, 3).join(' | ') : ''}`);
  await ctx2.close();
}

// ---------------------------------------------------------------- phone (landscape)
for (const [name, dev] of [['landscape', devices['iPhone 13 landscape']], ['portrait', devices['Pixel 7']]]) {
  const { ctx, page, errors } = await open({ ...dev, defaultBrowserType: undefined });
  await page.waitForTimeout(600);
  const scroll = await page.evaluate(() => document.documentElement.scrollWidth - innerWidth);
  check(scroll <= 0, `${name}: no horizontal scroll`);
  await page.screenshot({ path: path.join(OUT, `dist-${name}-title.png`) });
  await page.tap('text=New Sentence');
  await page.waitForTimeout(300);
  await page.screenshot({ path: path.join(OUT, `dist-${name}-intake.png`) });
  await page.tap('[data-act="begin"]');
  await page.waitForFunction(() => window.__game.mode === 'play', null, { timeout: 20000 });
  await page.waitForTimeout(1200);
  const q = await page.evaluate(() => ({ touch: window.__game.touch.active, quality: window.__game.lighting.quality }));
  check(q.touch, `${name}: touch controls active`);
  check(q.quality === 'low', `${name}: light renderer selected (${q.quality})`);
  // Talk: stand in front of an inmate, tap the context button, tap a reply, then walk away.
  const who = await page.evaluate(() => {
    const g = window.__game, p = g.player;
    const npc = g.characters.find((c) => c !== p && c.id === 'grandpa') || g.characters.find((c) => c !== p && c.kind === 'inmate');
    if (npc.brain) npc.brain.paused = true;
    p.x = npc.x + Math.sin(npc.yaw) * 1.3; p.z = npc.z + Math.cos(npc.yaw) * 1.3; p.y = npc.y;
    p.yaw = Math.atan2(npc.x - p.x, npc.z - p.z); g.cameraRig.snapBehind(p);
    return npc.short;
  });
  await page.waitForTimeout(700);
  const pill = await until(page, () => document.querySelector('.tc-interact.show'));
  if (pill) await page.tap('.tc-interact');
  const talking = await until(page, () => !!window.__game.dialogue?.active);
  check(pill && talking, `${name}: context button starts a conversation with ${who}`);
  if (talking) {
    await page.screenshot({ path: path.join(OUT, `dist-${name}-talk.png`) });
    const before = await page.evaluate(() => JSON.stringify(window.__game.dialogue.lines));
    await page.tap('.dlg-opts li:not(.dis) >> nth=0');
    const advanced = await until(page, (b) => !window.__game.dialogue?.active || JSON.stringify(window.__game.dialogue.lines) !== b, before);
    check(advanced, `${name}: tapping a reply advances the conversation`);
  }
  // Drag the move stick up (forward) for a second and check the player moved.
  const vp = page.viewportSize();
  const before = await page.evaluate(() => ({ x: window.__game.player.x, z: window.__game.player.z }));
  const cdp = await ctx.newCDPSession(page);
  const sx = vp.width * 0.2, sy = vp.height * 0.75;
  const touch = (type, x, y) => cdp.send('Input.dispatchTouchEvent', { type, touchPoints: type === 'touchEnd' ? [] : [{ x, y, id: 1 }] });
  await touch('touchStart', sx, sy);
  for (let i = 1; i <= 6; i++) { await touch('touchMove', sx, sy - i * 10); await page.waitForTimeout(16); }
  await until(page, (b) => Math.hypot(window.__game.player.x - b.x, window.__game.player.z - b.z) > 1.5, before, 8000);
  await page.screenshot({ path: path.join(OUT, `dist-${name}-play.png`) });
  await touch('touchEnd', 0, 0);
  const after = await page.evaluate(() => ({ x: window.__game.player.x, z: window.__game.player.z }));
  const moved = Math.hypot(after.x - before.x, after.z - before.z);
  check(moved > 1, `${name}: move stick walks the player (${moved.toFixed(2)} m)`);
  check(await until(page, () => !window.__game.dialogue?.active), `${name}: walking away ends the conversation`);
  // Tap the attack button.
  const box = await page.locator('.tc-btn.attack').boundingBox();
  const t0 = await page.evaluate(() => window.__game.player.lastAttackT || 0);
  await page.tap('.tc-btn.attack');
  const swung = await until(page, (t) => (window.__game.player.lastAttackT || 0) > t || window.__game.player.state === 'attack', t0);
  check(!!box && swung, `${name}: attack button throws a punch`);
  check(errors.length === 0, `${name}: no page errors${errors.length ? ': ' + errors.slice(0, 3).join(' | ') : ''}`);
  await ctx.close();
}

await browser.close();
server.close();
console.log(failed ? `\n${failed} check(s) failed` : '\nall dist checks passed');
process.exit(failed ? 1 : 0);
