// Automated movement tests for the Characters sandbox (headless Chromium).
// Usage: node tools/characters-movement.mjs [baseUrl] [outDir]
// Measures steady-state speeds vs DESIGN §3 (±10 %), vault/climb outcomes, fall damage, swimming,
// freefall/parachute. Prints a JSON report and exits non-zero on failures.
import { chromium } from 'playwright';

const base = process.argv[2] || 'http://localhost:5202';
const outDir = process.argv[3] || `${(await import('node:os')).tmpdir()}/characters-shots`;
const only = process.argv[4] || '';
(await import('node:fs')).mkdirSync(outDir, { recursive: true });
const browser = await chromium.launch({
  args: ['--use-angle=swiftshader', '--enable-unsafe-swiftshader', '--ignore-gpu-blocklist', '--enable-webgl'],
});
const page = await browser.newPage({ viewport: { width: 960, height: 540 } });
const logs = [];
page.on('console', (m) => logs.push(`[${m.type()}] ${m.text()}`));
page.on('pageerror', (e) => logs.push(`[pageerror] ${e.message}`));
await page.goto(`${base}/sandbox/characters.html?nobots=1&debug=1`, { waitUntil: 'load', timeout: 120000 });
await page.waitForFunction(() => window.__sandboxReady === true, null, { timeout: 120000 });
await page.waitForTimeout(1500);

// In-page helpers.
await page.evaluate(() => {
  const g = window.__game;
  const ctx = g.ctx;
  const T = window.THREE;
  window.__t = {
    sim: () => ctx.engine.simTime,
    async wait(s) {
      const t0 = ctx.engine.simTime;
      while (ctx.engine.simTime < t0 + s) await new Promise((r) => setTimeout(r, 16));
    },
    key(code, down) {
      ctx.input.simulate(code, down);
    },
    async tap(code) {
      ctx.input.simulate(code, true);
      await this.wait(0.05);
      ctx.input.simulate(code, false);
      await this.wait(0.05);
    },
    releaseAll() {
      for (const c of ['KeyW', 'KeyA', 'KeyS', 'KeyD', 'ShiftLeft', 'ControlLeft', 'Mouse2', 'Space', 'KeyC', 'KeyZ', 'KeyQ', 'KeyE', 'KeyF']) ctx.input.simulate(c, false);
    },
    p: () => ctx.player,
    async reset(x, z, yaw, y) {
      this.releaseAll();
      const p = ctx.player;
      if (p.lifeState !== 'alive') p.setLifeState('alive');
      p.health = 100;
      if (p.mode !== 'ground') p.setMoveState('idle');
      if (p.stance !== 'stand') { p.body.setShape('stand', p.position); p.stance = 'stand'; p.stanceHeight = 1.8; p.stanceProgress = 1; }
      g.teleport(x, z, y);
      g.setLook(yaw, 0);
      p.velocity.set(0, 0, 0);
      await this.wait(0.3);
    },
    /** Horizontal speed averaged over `dur` seconds of sim time. */
    async measureSpeed(dur) {
      const p = ctx.player;
      const a = p.position.clone();
      const t0 = ctx.engine.simTime;
      await this.wait(dur);
      const b = p.position.clone();
      const dt = ctx.engine.simTime - t0;
      return Math.hypot(b.x - a.x, b.z - a.z) / dt;
    },
    T,
  };
});

const report = { speeds: [], vault: [], fall: [], swim: null, skydive: null, failures: [] };
const check = (name, ok, detail) => {
  if (!ok) report.failures.push(`${name}: ${JSON.stringify(detail)}`);
};

async function shot(name) {
  await page.screenshot({ path: `${outDir}/${name}.png` });
}

// ── Speeds ────────────────────────────────────────────────────────────────────
const speedCases = [
  { name: 'run', keys: ['KeyW'], expect: 4.7 },
  { name: 'sprint', keys: ['KeyW', 'ShiftLeft'], expect: 6.3 },
  { name: 'walk', keys: ['KeyW', 'ControlLeft'], expect: 1.9 },
  { name: 'back', keys: ['KeyS'], expect: 4.7 * 0.65 },
  { name: 'strafe', keys: ['KeyD'], expect: 4.7 * 0.85 },
  { name: 'aim (RMB hold)', keys: ['KeyW', 'Mouse2'], expect: 4.7 * 0.65 },
  { name: 'crouch run', pre: ['KeyC'], keys: ['KeyW'], expect: 3.0 },
  { name: 'crouch walk', pre: ['KeyC'], keys: ['KeyW', 'ControlLeft'], expect: 1.6 },
  { name: 'crouch sprint', pre: ['KeyC'], keys: ['KeyW', 'ShiftLeft'], expect: 4.5 },
  { name: 'prone crawl', pre: ['KeyZ'], keys: ['KeyW'], expect: 1.2 },
];
if (!only || only === 'speed')
  for (const sc of speedCases) {
    const r = await page.evaluate(async (sc) => {
      const t = window.__t;
      const a = window.__game.arena.SPOTS.speedTrack;
      await t.reset(a.x, a.z, -Math.PI / 2);
      for (const k of sc.pre ?? []) await t.tap(k);
      await t.wait(1.0);
      for (const k of sc.keys) t.key(k, true);
      await t.wait(1.3);
      const v = await t.measureSpeed(2.0);
      const st = window.__game.playerState();
      t.releaseAll();
      return { v, stance: st.stance, moveState: st.moveState, aiming: st.aiming };
    }, sc);
    const ok = Math.abs(r.v - sc.expect) <= sc.expect * 0.1;
    report.speeds.push({ case: sc.name, measured: +r.v.toFixed(3), expected: +sc.expect.toFixed(3), errPct: +(((r.v - sc.expect) / sc.expect) * 100).toFixed(1), ok, ...r, v: undefined });
    check(`speed ${sc.name}`, ok, r);
  }

// ── Vault / climb ─────────────────────────────────────────────────────────────
if (!only || only === 'vault') {
  const heights = [0.5, 0.8, 1.1, 1.6, 2.0, 2.5];
  for (let i = 0; i < heights.length; i++) {
    const r = await page.evaluate(async ({ i, h }) => {
      const t = window.__t;
      const s = window.__game.arena.SPOTS.boxes;
      const x = s.x + i * 6;
      await t.reset(x, s.z, 0);
      const p = t.p();
      const startZ = p.position.z;
      t.key('KeyW', true);
      // Run until ~1.0 m from the face (box front face at z = s.z - 4 + 0.3).
      const face = s.z - 4 + 0.3;
      const t0 = t.sim();
      while (p.position.z - face > 1.05 && t.sim() - t0 < 4) await t.wait(0.016);
      let sawTraversal = null;
      t.key('Space', true);
      const t1 = t.sim();
      while (t.sim() - t1 < 2.2) {
        if (p.traversal && !sawTraversal) sawTraversal = { kind: p.traversal.kind, duration: p.traversal.duration };
        await t.wait(0.016);
        if (sawTraversal && !p.traversal && p.mode === 'ground') break;
      }
      t.key('Space', false);
      t.key('KeyW', false);
      await t.wait(0.4);
      return { h, sawTraversal, endZ: p.position.z, endY: p.position.y, face, backFace: face - 0.6, startZ, health: p.health };
    }, { i, h: heights[i] });
    let expect;
    if (heights[i] <= 1.1) expect = 'vault';
    else if (heights[i] <= 2.1) expect = 'climb';
    else expect = 'none';
    const got = r.sawTraversal?.kind ?? 'none';
    const crossed = r.endZ < r.backFace - 0.2;
    const onTop = Math.abs(r.endY - heights[i]) < 0.15;
    let ok = got === expect;
    if (expect === 'vault') ok = ok && crossed && r.endY < 0.1;
    if (expect === 'climb') ok = ok && onTop;
    report.vault.push({ height: heights[i], expect, got, ok, duration: r.sawTraversal?.duration, endY: +r.endY.toFixed(3), crossed });
    check(`vault ${heights[i]}`, ok, r);
    if (i === 2) await shot('vault_after');
  }
}

// ── Fall damage ───────────────────────────────────────────────────────────────
if (!only || only === 'fall') {
  for (const h of [5, 10, 15, 20]) {
    const r = await page.evaluate(async (h) => {
      const t = window.__t;
      const tw = window.__game.arena.SPOTS.tower;
      const idx = [5, 10, 15, 20].indexOf(h);
      const px = tw.x + 8 + idx * 6;
      await t.reset(px, tw.z, 0, h + 0.05);
      const p = t.p();
      // Walk off the north edge.
      t.key('KeyW', true);
      const t0 = t.sim();
      let landed = null;
      const off = window.__game.ctx.events.on('character:land', (e) => {
        if (e.character === p && !landed) landed = e.impactSpeed;
      });
      while (t.sim() - t0 < 5 && !(landed && p.position.y < 0.2)) await t.wait(0.02);
      t.key('KeyW', false);
      off();
      await t.wait(0.2);
      return { impact: landed, health: p.health, life: p.lifeState };
    }, h);
    const expectDmg = Math.max(0, (Math.sqrt(2 * 9.81 * h) - 9) * 10);
    const dmg = 100 - r.health;
    const ok = h >= 20 ? r.life === 'dead' : Math.abs(dmg - expectDmg) <= Math.max(4, expectDmg * 0.12);
    report.fall.push({ height: h, impact: r.impact && +r.impact.toFixed(2), damage: +dmg.toFixed(1), expected: +expectDmg.toFixed(1), life: r.life, ok });
    check(`fall ${h}`, ok, r);
  }
}

// ── Swim ──────────────────────────────────────────────────────────────────────
if (!only || only === 'swim') {
  report.swim = await page.evaluate(async () => {
    const t = window.__t;
    const pool = window.__game.arena.POOL;
    const p = t.p();
    // Enter from the beach (east end) walking west into deep water.
    await t.reset(pool.x1 + 2, (pool.z0 + pool.z1) / 2, Math.PI / 2);
    t.key('KeyW', true);
    const t0 = t.sim();
    while (p.mode !== 'swim' && t.sim() - t0 < 8) await t.wait(0.02);
    const enteredAfter = t.sim() - t0;
    const enterX = p.position.x;
    await t.wait(1.0);
    const v = await t.measureSpeed(1.5);
    t.key('ShiftLeft', true);
    await t.wait(0.8);
    const vFast = await t.measureSpeed(1.2);
    t.key('ShiftLeft', false);
    t.key('KeyW', false);
    // Dive.
    t.key('KeyC', true);
    await t.wait(2.5);
    const divedY = p.position.y;
    const underwater = p.underwater;
    await t.wait(2.0);
    const breathAfter4s = p.breath;
    t.key('KeyC', false);
    t.key('Space', true);
    await t.wait(3.0);
    t.key('Space', false);
    await t.wait(1.0);
    const surfacedY = p.position.y;
    // Swim back out over the beach.
    window.__game.setLook(-Math.PI / 2, 0);
    t.key('KeyW', true);
    const t2 = t.sim();
    while (p.mode === 'swim' && t.sim() - t2 < 12) await t.wait(0.05);
    t.key('KeyW', false);
    return { entered: p.mode !== undefined, enteredAfter, enterX, swimSpeed: v, fastSwimSpeed: vFast, divedY, underwater, breathAfter4s, surfacedY, surface: pool.surface, exitedTo: p.mode, health: p.health };
  });
  const s = report.swim;
  check('swim speed', Math.abs(s.swimSpeed - 2.8) < 0.28, s);
  check('fast swim speed', Math.abs(s.fastSwimSpeed - 4.2) < 0.42, s);
  check('dive underwater', s.underwater && s.divedY < s.surface - 2, s);
  check('surface', s.surfacedY > s.surface - 1.6, s);
  check('exit pool', s.exitedTo === 'ground', s);
}

// ── Freefall + parachute ──────────────────────────────────────────────────────
if (!only || only === 'skydive') {
  report.skydive = await page.evaluate(async () => {
    const t = window.__t;
    const s = window.__game.arena.SPOTS.speedTrack;
    await t.reset(s.x, s.z, 0);
    const p = t.p();
    window.__game.skydive(600);
    const events = [];
    const offs = [
      window.__game.ctx.events.on('character:parachute', (e) => e.character === p && events.push([e.phase, +t.sim().toFixed(2), +p.position.y.toFixed(1)])),
    ];
    const t0 = t.sim();
    await t.wait(4);
    const vNeutral = -p.velocity.y;
    window.__game.setLook(0, -1.3);
    t.key('KeyW', true);
    await t.wait(4);
    const vDive = -p.velocity.y;
    window.__game.setLook(0, 0);
    await t.wait(3);
    const vGlideH = Math.hypot(p.velocity.x, p.velocity.z);
    const vGlideV = -p.velocity.y;
    let deployAgl = null;
    while (p.mode === 'skydive' && t.sim() - t0 < 120) {
      if (p.sky.phase === 'parachute' && deployAgl === null) deployAgl = p.sky.agl;
      await t.wait(0.05);
      if (p.sky.phase === 'parachute' && p.sky.chuteOpen >= 1 && t.sim() - t0 > 0) break;
    }
    await t.wait(1.5);
    const chuteFwdV = -p.velocity.y;
    const chuteFwdH = Math.hypot(p.velocity.x, p.velocity.z);
    t.key('KeyW', false);
    await t.wait(2.0);
    const chuteNeutralV = -p.velocity.y;
    while (p.mode === 'skydive' && t.sim() - t0 < 160) await t.wait(0.05);
    for (const o of offs) o();
    return { vNeutral, vDive, vGlideH, vGlideV, deployAgl, chuteFwdV, chuteFwdH, chuteNeutralV, events, landedMode: p.mode, health: p.health, totalTime: t.sim() - t0 };
  });
  const k = report.skydive;
  check('freefall neutral ~45', Math.abs(k.vNeutral - 45) < 5, k);
  check('dive ~65', k.vDive > 58, k);
  check('auto deploy ~120 AGL', k.deployAgl !== null && k.deployAgl <= 121 && k.deployAgl > 100, k);
  check('chute descent 5-7.5', k.chuteNeutralV > 4.5 && k.chuteNeutralV < 7.6, k);
  check('landed', k.landedMode === 'ground' && k.health === 100, k);
}

await shot('movement_end');
console.log(JSON.stringify(report, null, 1));
const errs = logs.filter((l) => l.startsWith('[error]') || l.startsWith('[pageerror]'));
if (errs.length) console.log('CONSOLE ERRORS:\n' + errs.join('\n'));
await browser.close();
process.exit(report.failures.length ? 1 : 0);
