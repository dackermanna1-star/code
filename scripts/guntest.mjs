// Headless check of the revolver: draw, aim, kid refusal, headshot + ragdoll,
// panic, wall hits, reload, holster and the body fading away.
// usage: node scripts/guntest.mjs [baseUrl] [outDir]
import { chromium } from 'playwright-core';
import { mkdirSync } from 'node:fs';

const [, , base = 'http://localhost:4173/', out = 'test-output/gun'] = process.argv;
mkdirSync(out, { recursive: true });
const browser = await chromium.launch({
  executablePath: '/opt/pw-browsers/chromium',
  args: ['--use-gl=angle', '--use-angle=swiftshader', '--enable-unsafe-swiftshader', '--ignore-gpu-blocklist', '--autoplay-policy=no-user-gesture-required'],
});
const page = await browser.newPage({ viewport: { width: 1280, height: 720 } });
const logs = [];
page.on('console', (m) => {
  if (m.type() === 'error' || m.type() === 'warning') logs.push(`[${m.type()}] ${m.text()}`);
});
page.on('pageerror', (e) => logs.push(`[pageerror] ${e.message}\n${e.stack}`));
await page.goto(base + '?test=1&station=order', { waitUntil: 'load' });
await page.waitForFunction(() => window.__game && window.__game.state === 'day', null, { timeout: 120000 });

const game = (fn, arg) => page.evaluate(fn, arg);
/** wait for game time to advance */
async function waitGame(sec) {
  const t0 = await game(() => window.__game.engine.time);
  await page.waitForFunction((t) => window.__game.engine.time >= t, t0 + sec, { timeout: 180000, polling: 100 });
}
const shot = (name) => page.screenshot({ path: `${out}/${name}.png` });
const results = {};
const check = (name, ok, extra) => {
  results[name] = ok ? 'ok' : `FAIL ${extra ?? ''}`;
  console.log(name, results[name], ok && extra ? extra : '');
};

// ---- a customer at the counter, one in line and (if the roster has one) a kid
const cast = await game(() => {
  const g = window.__game;
  const defs = g.schedule.map((s) => s.def);
  const adults = defs.filter((d) => !d.app.kid);
  const kid = defs.find((d) => d.app.kid) ?? null;
  const put = (def, x, z) => {
    const c = g.customers.spawn(def);
    c.place(new c.pos.constructor(x, 0, z), Math.PI);
    g.customers.enterQueue(c);
    return c.uid;
  };
  // nobody else walks in (but the day must not think it is over)
  for (const s of g.schedule) s.at += 9999;
  const a = put(adults[0], -1.0, 0.2);
  const b = put(adults[1] ?? adults[0], -0.8, 1.2);
  let k = null;
  if (kid) {
    // off to the side, clear of the line of fire
    const c = g.customers.spawn(kid);
    c.place(new c.pos.constructor(0.9, 0, 0.7), Math.PI);
    c.walk([]);
    c.state = 'waiting';
    c.arrivedAt = g.ctx.now();
    k = c.uid;
  }
  return { a, b, k };
});
const find = (uid) => `window.__game.customers.list.find((c) => c.uid === ${uid})`;
await page.waitForFunction(new Function(`const c = ${find(cast.a)}; return c && c.state === 'atCounter';`), null, { timeout: 120000, polling: 200 });
await waitGame(0.6);

// ---- draw
await page.keyboard.press('g');
await waitGame(0.8);
const drawn = await game(() => ({ phase: window.__game.gun.phase, input: window.__game.input.enabled, armed: window.__game.ctx.armed }));
check('draw', drawn.phase === 'ready' && !drawn.input && drawn.armed, JSON.stringify(drawn));
const headOf = (uid) =>
  game((uid) => {
    const g = window.__game;
    const c = g.customers.list.find((x) => x.uid === uid);
    const p = g.ui.project(c.headPos);
    return { x: p.x, y: p.y };
  }, uid);
const chestOf = (uid) =>
  game((uid) => {
    const g = window.__game;
    const c = g.customers.list.find((x) => x.uid === uid);
    const v = c.model.rig.chest.getWorldPosition(c.pos.clone());
    v.y += 0.1;
    const p = g.ui.project(v);
    return { x: p.x, y: p.y };
  }, uid);

/** Move the cursor onto a body part; the view turns toward the cursor, so re-aim until it holds. */
async function aimAt(uid, part = 'head') {
  let p = { x: 640, y: 360 };
  for (let i = 0; i < 5; i++) {
    p = await (part === 'head' ? headOf(uid) : chestOf(uid));
    await page.mouse.move(p.x, p.y, { steps: 2 });
    await waitGame(0.35);
  }
  return p;
}

// ---- aim at the customer: hands go up
let h = await aimAt(cast.a);
await waitGame(0.4);
const aimed = await game((uid) => {
  const c = window.__game.customers.list.find((x) => x.uid === uid);
  return { gesture: c.anim.gesture, xh: document.querySelector('.crosshair').className };
}, cast.a);
check('aim-reaction', aimed.gesture === 'handsUp' && aimed.xh.includes('target'), JSON.stringify(aimed));
await shot('1-aim');

// ---- kids are off limits
if (cast.k) {
  await aimAt(cast.k);
  await page.mouse.down();
  await page.mouse.up();
  await waitGame(0.5);
  const k = await game((uid) => ({ loaded: window.__game.gun.loaded, state: window.__game.customers.list.find((x) => x.uid === uid).state, xh: document.querySelector('.crosshair').className }), cast.k);
  check('kid-refused', k.loaded === 6 && k.state !== 'dead' && k.xh.includes('nogo'), JSON.stringify(k));
  await shot('2-kid');
} else results['kid-refused'] = 'skipped (no kid in schedule)';

// ---- headshot
h = await aimAt(cast.a);
await page.mouse.down();
await page.mouse.up();
await page.waitForTimeout(50);
await shot('3-bang');
const afterShot = await game((uid) => {
  const g = window.__game;
  const c = g.customers.list.find((x) => x.uid === uid);
  return { state: c.state, loaded: g.gun.loaded, ts: g.engine.timeScale, drops: g.gun.gore.drops.filter((d) => d.alive).length, gibs: g.gun.gore.gibs.length };
}, cast.a);
check('headshot', afterShot.state === 'dead' && afterShot.loaded === 5 && afterShot.gibs > 0, JSON.stringify(afterShot));
await waitGame(0.4);
await shot('4-falling');
// look down over the counter at the body
await page.mouse.move(h.x, 690, { steps: 5 });
await waitGame(1.2);
await shot('5-down');
const fled = await game((uid) => {
  const c = window.__game.customers.list.find((x) => x.uid === uid);
  return { state: c.state, panic: c.panic, gesture: c.anim.gesture, speed: +c.walkSpeed.toFixed(2) };
}, cast.b);
check('others-flee', fled.panic && (fled.state === 'leaving' || fled.state === 'gone'), JSON.stringify(fled));

// ---- shoot the runner in the back
const runner = await game((uid) => {
  const c = window.__game.customers.list.find((x) => x.uid === uid);
  return c && c.state === 'leaving' ? uid : null;
}, cast.b);
if (runner) {
  const ch = await chestOf(runner);
  if (ch.x > 0 && ch.x < 1280 && ch.y > 0 && ch.y < 720) {
    await aimAt(runner, 'chest');
    await page.mouse.down();
    await page.mouse.up();
    await waitGame(0.2);
    const r = await game((uid) => window.__game.customers.list.find((x) => x.uid === uid)?.state, runner);
    results['runner'] = r === 'dead' ? 'ok (hit)' : `missed/out of view (${r})`;
  } else results['runner'] = 'out of view';
}

// ---- the body settles and bleeds (at rest within 9 s of game time)
{
  const t0 = await game(() => window.__game.engine.time);
  await page.waitForFunction(
    ([uid, t]) => {
      const g = window.__game;
      const c = g.customers.list.find((x) => x.uid === uid);
      return !c || c.ragdoll?.sleeping || g.engine.time > t + 9;
    },
    [cast.a, t0],
    { timeout: 300000, polling: 200 },
  );
  await waitGame(0.3);
}
const settled = await game((uid) => {
  const g = window.__game;
  const c = g.customers.list.find((x) => x.uid === uid);
  if (!c) return { missing: g.customers.list.map((x) => [x.uid, x.state]), state: g.state };
  const rd = c.ragdoll;
  const head = rd.get(3);
  return { sleeping: rd.sleeping, headY: +head.y.toFixed(3), pools: g.gun.gore.pools.length, splats: g.gun.gore.splats.reduce((a, d) => a + d.mesh.count, 0) };
}, cast.a);
check('ragdoll-settles', settled.sleeping && settled.headY < 0.45 && settled.pools > 0, JSON.stringify(settled));
await page.mouse.move(640, 700);
await shot('6-aftermath');

// ---- a wall and the floor
await page.mouse.move(250, 260);
await page.mouse.down();
await page.mouse.up();
await waitGame(0.5);
await page.mouse.move(900, 600);
await page.mouse.down();
await page.mouse.up();
await waitGame(0.5);
const holes = await game(() => window.__game.gun.gore.holes.mesh.count);
check('bullet-holes', holes >= 1, `holes=${holes}`);

// ---- reload
await page.keyboard.press('r');
await waitGame(0.85);
await shot('7-reload');
await waitGame(1.6);
const rl = await game(() => ({ loaded: window.__game.gun.loaded, phase: window.__game.gun.phase, casings: window.__game.gun.gore.casings.length }));
check('reload', rl.loaded === 6 && rl.phase === 'ready' && rl.casings === 6, JSON.stringify(rl));

// ---- holster
await page.keyboard.press('g');
await waitGame(0.6);
const hol = await game(() => ({ phase: window.__game.gun.phase, input: window.__game.input.enabled, visible: window.__game.gun.view.visible }));
check('holster', hol.phase === 'holstered' && hol.input && !hol.visible, JSON.stringify(hol));

// ---- bodies fade out and are cleaned up; spawns resume after
await game(() => {
  window.__game.engine.timeScale = 8;
});
await page.waitForFunction(() => window.__game.customers.bodies.length === 0, null, { timeout: 240000, polling: 250 });
await game(() => {
  window.__game.engine.timeScale = 1;
});
const end = await game(() => ({ list: window.__game.customers.list.map((c) => c.state), heap: Math.round((performance.memory?.usedJSHeapSize ?? 0) / 1048576) }));
check('bodies-cleared', true, JSON.stringify(end));
await shot('8-clean');

console.log(JSON.stringify({ results, end }, null, 1));
console.log(logs.length ? logs.join('\n') : 'no console errors');
await browser.close();
