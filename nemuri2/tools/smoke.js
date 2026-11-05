// Headless smoke test for nemuri II.
// usage: node tools/smoke.js [--file=NAME] [--worlds=a,b|new|sample:N] [--shots=DIR] [--keys=KeyJ,Escape,...] [--walk=SECONDS] [--eval=JS]
// Loads dist/nemuri-ii.test.html?debug, starts the game, builds the requested worlds,
// presses keys, walks around, and reports every console error / page error.
// Modules can register world names in N2.newWorlds (array) so --worlds=new tests them all.
const { chromium } = require('playwright');
const path = require('path'), fs = require('fs');
const args = Object.fromEntries(process.argv.slice(2).map(a => { const m = a.match(/^--([^=]+)=?(.*)$/); return m ? [m[1], m[2] || true] : [a, true]; }));
(async () => {
  const browser = await chromium.launch({ args: ['--use-gl=angle', '--use-angle=swiftshader', '--enable-unsafe-swiftshader', '--ignore-gpu-blocklist', '--autoplay-policy=no-user-gesture-required'] });
  const page = await browser.newPage({ viewport: { width: 960, height: 600 } });
  const errors = [], logs = [];
  page.on('pageerror', e => errors.push('pageerror: ' + (e.stack || e.message).split('\n').slice(0, 4).join(' | ')));
  page.on('console', m => { const t = m.text(); if (m.type() === 'error') errors.push('console.error: ' + t.slice(0, 600)); else if (/\[N2|\[nemuri/.test(t)) logs.push(t.slice(0, 300)); });
  // --file=name  tests dist/<name>.test.html (pair with build.js --out=name)
const url = 'file://' + path.join(__dirname, '..', 'dist', (typeof args.file === 'string' ? args.file : 'nemuri-ii') + '.test.html') + '?debug';
  await page.goto(url);
  await page.waitForTimeout(800);
  const shots = args.shots && args.shots !== true ? args.shots : null;
  if (shots) fs.mkdirSync(shots, { recursive: true });
  const snap = async (name) => { if (shots) await page.screenshot({ path: path.join(shots, name.replace(/[^\w.-]/g, '_') + '.png') }); };
  await snap('00_title');
  // title: first click arms audio, second click starts
  await page.mouse.click(480, 300); await page.waitForTimeout(300);
  await page.mouse.click(480, 300); await page.waitForTimeout(2500);
  const st = await page.evaluate(() => ({ phase: __N2.phase, bedroom: __N2.inBedroom, worlds: __N2.ALL_NAMES.length, newWorlds: (__N2.N2.newWorlds || []).length, mods: Object.keys(__N2.N2.mods) }));
  console.log('after start:', JSON.stringify(st));
  await snap('01_start');
  if (args.eval && args.eval !== true) { const r = await page.evaluate(args.eval); console.log('eval ->', JSON.stringify(r)); }
  // keys
  if (args.keys && args.keys !== true) {
    for (const k of args.keys.split(',')) { await page.keyboard.press(k); await page.waitForTimeout(500); await snap('key_' + k); }
  }
  // worlds
  let list = [];
  if (args.worlds === 'new') list = await page.evaluate(() => (__N2.N2.newWorlds || []).slice());
  else if (typeof args.worlds === 'string' && args.worlds.startsWith('sample:')) { const n = +args.worlds.slice(7); list = await page.evaluate(n => { const a = __N2.ALL_NAMES.slice(); const o = []; for (let i = 0; i < n && a.length; i++) o.push(a.splice((Math.random() * a.length) | 0, 1)[0]); return o; }, n); }
  else if (typeof args.worlds === 'string') list = args.worlds.split(',');
  const worldReport = [];
  for (const w of list) {
    const before = errors.length; const t0 = Date.now();
    const info = await page.evaluate(w => { try { if (!__N2.RECIPES[w]) return { err: 'no recipe' }; __N2.build(w); const z = __N2.zone; return { ok: true, meshes: z && z.group ? z.group.children.length : 0 }; } catch (e) { return { err: String(e && e.stack || e).slice(0, 400) }; } }, w);
    await page.waitForTimeout(400);
    // walk forward a moment and look around
    await page.keyboard.down('KeyW'); await page.waitForTimeout(700); await page.keyboard.up('KeyW');
    const fps = await page.evaluate(() => new Promise(res => { let n = 0; const t = performance.now(); function f() { n++; if (performance.now() - t < 1000) requestAnimationFrame(f); else res(n); } requestAnimationFrame(f); }));
    await snap('world_' + w);
    worldReport.push({ world: w, ms: Date.now() - t0, fps, ...info, newErrors: errors.slice(before) });
  }
  if (worldReport.length) console.log('worlds:', JSON.stringify(worldReport, null, 1));
  if (args.walk) {
    const secs = +args.walk || 10; const end = Date.now() + secs * 1000;
    await page.evaluate(() => { if (__N2.inBedroom) __N2.warp(); });
    while (Date.now() < end) { await page.keyboard.down('KeyW'); await page.waitForTimeout(600); await page.keyboard.up('KeyW'); await page.mouse.move(480 + (Math.random() * 200 - 100), 300); await page.keyboard.press('KeyE'); }
    console.log('after walk:', JSON.stringify(await page.evaluate(() => ({ phase: __N2.phase, day: __N2.day, zone: __N2.zone && __N2.zone.archetypeName }))));
    await snap('99_walk');
  }
  console.log('module logs:', JSON.stringify(logs.slice(0, 30)));
  console.log('ERRORS (' + errors.length + '):'); errors.slice(0, 60).forEach(e => console.log('  ' + e));
  await browser.close();
  process.exit(errors.length ? 1 : 0);
})().catch(e => { console.error('smoke harness failure', e); process.exit(2); });
