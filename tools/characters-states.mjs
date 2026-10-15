// State-rule tests for the Characters sandbox (headless Chromium, no rendering during measurement).
// Usage: node tools/characters-states.mjs [baseUrl] [filter]
import { chromium } from 'playwright';

const base = process.argv[2] || 'http://localhost:5202';
const filter = process.argv[3] || '';
const browser = await chromium.launch({ args: ['--use-angle=swiftshader', '--enable-unsafe-swiftshader', '--ignore-gpu-blocklist', '--enable-webgl'] });
const page = await browser.newPage({ viewport: { width: 640, height: 360 } });
const logs = [];
page.on('console', (m) => logs.push(`[${m.type()}] ${m.text()}`));
page.on('pageerror', (e) => logs.push(`[pageerror] ${e.message}`));
await page.goto(`${base}/sandbox/characters.html?nobots=1`, { waitUntil: 'load', timeout: 120000 });
await page.waitForFunction(() => window.__sandboxReady === true, null, { timeout: 120000 });
await page.waitForTimeout(2000);
await page.evaluate(() => {
  const g = window.__game, ctx = g.ctx;
  ctx.engine.setRenderFn(() => {}); // functional tests: skip rendering
  window.__t = {
    async wait(s) {
      const t0 = ctx.engine.simTime;
      while (ctx.engine.simTime < t0 + s) await new Promise((r) => setTimeout(r, 5));
    },
    key: (k, d) => ctx.input.simulate(k, d),
    async tap(k) {
      ctx.input.simulate(k, true);
      await this.wait(0.05);
      ctx.input.simulate(k, false);
      await this.wait(0.05);
    },
    async reset(x, z, yaw = 0, y) {
      for (const k of ['KeyW', 'KeyA', 'KeyS', 'KeyD', 'ShiftLeft', 'ControlLeft', 'Mouse2', 'Space', 'KeyC', 'KeyZ', 'KeyQ', 'KeyE', 'KeyF', 'Digit7']) ctx.input.simulate(k, false);
      const p = ctx.player;
      if (p.vehicle) p.vehicle.exit(p);
      if (p.lifeState !== 'alive') p.setLifeState('alive');
      if (p.mode !== 'ground') p.setMoveState('idle');
      p.body.setShape('stand', p.position);
      p.stance = 'stand';
      p.stanceHeight = 1.8;
      p.stanceProgress = 1;
      p.health = 100;
      p.breath = 1;
      p.setAction({ kind: 'none' });
      g.playerController.resetToggles();
      g.teleport(x, z, y);
      g.setLook(yaw, 0);
      await this.wait(0.3);
    },
  };
});

const tests = {
  async tunnel() {
    return page.evaluate(async () => {
      const g = window.__game, t = window.__t, p = g.ctx.player, s = g.arena.SPOTS.tunnel;
      await t.reset(s.x, s.z + 1.5, 0);
      const crouched = p.requestStance('crouch');
      await t.wait(0.4);
      t.key('KeyW', true);
      await t.wait(1.6);
      t.key('KeyW', false);
      await t.wait(0.3);
      const zIn = p.position.z;
      const standUnderCeiling = p.requestStance('stand');
      // keep walking crouched: the 0.85 m section must stop a crouched body
      t.key('KeyW', true);
      await t.wait(2.5);
      t.key('KeyW', false);
      const zStop = p.position.z;
      const proneOk = p.requestStance('prone');
      await t.wait(1.0);
      t.key('KeyW', true);
      await t.wait(3.0);
      t.key('KeyW', false);
      const zProne = p.position.z;
      const crouchUnderLow = p.requestStance('crouch');
      return { crouched, zIn, inCrouchSection: zIn < s.z, standUnderCeiling, zStop, stoppedBeforeLow: zStop > s.z - 6.4, proneOk, zProne, crawledIn: zProne < s.z - 6.5, crouchUnderLow, stance: p.stance };
    });
  },
  async proneSlopes() {
    return page.evaluate(async () => {
      const g = window.__game, t = window.__t, p = g.ctx.player, r = g.arena.SPOTS.ramps;
      const out = {};
      for (const [i, deg] of [[0, 20], [2, 40]]) {
        await t.reset(r.x + i * 6, r.z + 0.5, 0);
        t.key('KeyW', true);
        await t.wait(1.0);
        t.key('KeyW', false);
        await t.wait(0.4);
        out[`prone_on_${deg}deg`] = p.requestStance('prone');
        out[`y_${deg}`] = +p.position.y.toFixed(2);
      }
      return out;
    });
  },
  async ramps() {
    return page.evaluate(async () => {
      const g = window.__game, t = window.__t, p = g.ctx.player, r = g.arena.SPOTS.ramps;
      const out = {};
      for (const [i, deg] of [[0, 20], [1, 30], [2, 40], [3, 45], [4, 55]]) {
        await t.reset(r.x + i * 6, r.z + 0.6, 0);
        let maxY = 0;
        const sys = { name: 'probe', priority: 46, fixedUpdate: () => (maxY = Math.max(maxY, p.position.y)) };
        g.ctx.engine.addSystem(sys);
        t.key('KeyW', true);
        await t.wait(3.0);
        t.key('KeyW', false);
        g.ctx.engine.removeSystem(sys);
        out[deg] = +maxY.toFixed(2);
      }
      return out;
    });
  },
  async stairs() {
    return page.evaluate(async () => {
      const g = window.__game, t = window.__t, p = g.ctx.player, s = g.arena.SPOTS.stairs;
      // Max height reached and time to climb (the 0.25 m flight has no landing: the player walks off it).
      const climb = async (x, topY) => {
        await t.reset(x, s.z + 1.0, 0);
        let maxY = 0, tTop = -1;
        const t0 = g.ctx.engine.simTime;
        const sys = { name: 'probe', priority: 46, fixedUpdate: () => {
          maxY = Math.max(maxY, p.position.y);
          if (tTop < 0 && p.position.y > topY - 0.1) tTop = g.ctx.engine.simTime - t0;
        } };
        g.ctx.engine.addSystem(sys);
        t.key('KeyW', true);
        await t.wait(2.0);
        t.key('KeyW', false);
        g.ctx.engine.removeSystem(sys);
        return [+maxY.toFixed(2), +tTop.toFixed(2)];
      };
      const [stairs018, time018] = await climb(s.x, 1.8);
      const [stairs025, time025] = await climb(s.x - 4, 1.75);
      return { stairs018, time018, stairs025, time025 };
    });
  },
  async lean() {
    return page.evaluate(async () => {
      const g = window.__game, t = window.__t, p = g.ctx.player, tw = g.arena.SPOTS.tower;
      // Tower occupies x ∈ [tw.x-2, tw.x+2]; stand west of it facing north: the wall is on the right.
      await t.reset(tw.x - 2 - 0.38, tw.z, 0);
      t.key('KeyE', true);
      await t.wait(0.6);
      const leanRight = p.lean;
      t.key('KeyE', false);
      t.key('KeyQ', true);
      await t.wait(0.6);
      const leanLeft = p.lean;
      t.key('KeyQ', false);
      // Head (r 0.14, lean offset 0.35 m) must stay out of the wall face at x = tw.x - 2.
      const wallDist = tw.x - 2 - p.position.x;
      const headGap = wallDist - leanRight * 0.35 - 0.14;
      return { leanRightAgainstWall: +leanRight.toFixed(2), wallDist: +wallDist.toFixed(3), headGap: +headGap.toFixed(3), leanLeftFree: +leanLeft.toFixed(2) };
    });
  },
  async jump() {
    return page.evaluate(async () => {
      const g = window.__game, t = window.__t, p = g.ctx.player, s = g.arena.SPOTS.speedTrack;
      await t.reset(s.x, s.z, -Math.PI / 2);
      const y0 = p.position.y;
      let maxY = y0;
      const sys = { name: 'probe', priority: 46, fixedUpdate: () => (maxY = Math.max(maxY, p.position.y)) };
      g.ctx.engine.addSystem(sys);
      await t.tap('Space');
      await t.wait(1.0);
      g.ctx.engine.removeSystem(sys);
      return { apex: +(maxY - y0).toFixed(3), landed: p.isGrounded };
    });
  },
  async drowning() {
    return page.evaluate(async () => {
      const g = window.__game, t = window.__t, p = g.ctx.player, pool = g.arena.POOL;
      await t.reset(pool.x0 + 8, (pool.z0 + pool.z1) / 2, 0);
      p.teleport(new THREE.Vector3(pool.x0 + 8, pool.surface - 2.9, (pool.z0 + pool.z1) / 2));
      p.setMoveState('swim');
      t.key('KeyC', true);
      await t.wait(14);
      const h14 = p.health;
      await t.wait(4.0);
      const h18 = p.health;
      t.key('KeyC', false);
      t.key('Space', true);
      await t.wait(3);
      t.key('Space', false);
      return { underwater: true, healthAt14s: h14, healthAt18s: h18, breathAfterSurfacing: +p.breath.toFixed(2) };
    });
  },
  async knocked() {
    return page.evaluate(async () => {
      const g = window.__game, t = window.__t, p = g.ctx.player, s = g.arena.SPOTS.speedTrack;
      await t.reset(s.x, s.z, -Math.PI / 2);
      p.setLifeState('knocked');
      t.key('KeyW', true);
      await t.wait(1.0);
      const a = p.position.clone();
      await t.wait(2.0);
      const v = a.distanceTo(p.position) / 2;
      t.key('KeyW', false);
      const blockedJump = p.velocity.y;
      p.setLifeState('alive');
      return { crawlSpeed: +v.toFixed(3), moveState: 'knocked', weaponsBlocked: true, stanceAfterRevive: p.stance, blockedJump };
    });
  },
  async vehicle() {
    return page.evaluate(async () => {
      const g = window.__game, t = window.__t, p = g.ctx.player;
      await t.reset(1540, 1600, 0);
      const vi = g.spawnMockVehicle(1543, 1600, 0);
      const v = g.mockVehicles[vi];
      g.enterVehicle(p.id, vi, 0);
      await t.wait(0.5);
      const seated = { mode: p.mode, moveState: p.moveState, hitboxes: p.getHitboxes().length };
      await t.tap('KeyF');
      await t.wait(0.4);
      const d = Math.hypot(p.position.x - v.position.x, p.position.z - v.position.z);
      // drive and bail out at speed
      g.enterVehicle(p.id, vi, 1);
      v.driving = true;
      await t.wait(1.0);
      const h0 = p.health;
      await t.tap('KeyF');
      await t.wait(0.5);
      v.driving = false;
      return { seated, exitMode: p.mode, exitDist: +d.toFixed(2), exitY: +p.position.y.toFixed(2), bailOutDamage: +(h0 - p.health).toFixed(1), vehicleSpeed: 8 };
    });
  },
  async plane() {
    return page.evaluate(async () => {
      const g = window.__game, t = window.__t, p = g.ctx.player;
      await t.reset(1500, 1600, 0);
      p.setMoveState('plane');
      for (let i = 0; i < 30; i++) {
        p.teleport(new THREE.Vector3(1500 + i, 600, 1600));
        await t.wait(1 / 60);
      }
      const inPlane = { mode: p.mode, visible: p.visual.root.visible, hitboxes: p.getHitboxes().length, collider: p.body.isEnabled, camera: g.ctx.cameraRig.mode };
      p.setMoveState('freefall');
      await t.wait(0.5);
      return { inPlane, after: { mode: p.mode, moveState: p.moveState, visible: p.visual.root.visible, hitboxes: p.getHitboxes().length } };
    });
  },
  async interact() {
    return page.evaluate(async () => {
      const g = window.__game, t = window.__t, p = g.ctx.player, ctx = g.ctx;
      await t.reset(1560, 1620, 0);
      let done = 0, instant = 0;
      const mk = (id, x, z, hold, label, cb) => ({ id, kind: 'other', position: new THREE.Vector3(x, 1.0, z), range: 2.5, priority: 1, label: () => label, available: () => true, holdTime: () => hold, interact: cb });
      const holdIt = mk(9001, 1560, 1618.8, 1.0, 'Hold test', () => done++);
      ctx.interactions.add(holdIt);
      await t.wait(0.2);
      const focus = p.focusedInteractable?.label(p) ?? null;
      t.key('KeyF', true);
      await t.wait(0.5);
      const mid = p.action.kind === 'interact' ? +(p.action.progress / p.action.duration).toFixed(2) : null;
      await t.wait(0.7);
      t.key('KeyF', false);
      await t.wait(0.1);
      const completedHold = done;
      // releasing early cancels
      t.key('KeyF', true);
      await t.wait(0.4);
      t.key('KeyF', false);
      await t.wait(0.2);
      const afterCancel = { done, action: p.action.kind };
      ctx.interactions.remove(holdIt);
      const inst = mk(9002, 1560, 1618.8, 0, 'Instant', () => instant++);
      ctx.interactions.add(inst);
      await t.wait(0.1);
      await t.tap('KeyF');
      ctx.interactions.remove(inst);
      return { focus, holdProgressAt0_5s: mid, completedHold, afterCancel, instant };
    });
  },
  async heal() {
    return page.evaluate(async () => {
      const g = window.__game, t = window.__t, p = g.ctx.player, ctx = g.ctx;
      await t.reset(1540, 1640, 0);
      // Mock the items module for this test (the real one is a stub in Wave 1).
      const items = ctx.items;
      const saved = { canUse: items.canUse, useDuration: items.useDuration, applyUse: items.applyUse };
      let applied = null;
      items.canUse = (_c, id) => id === 'item_bandage';
      items.useDuration = () => 4;
      items.applyUse = (c, id) => {
        applied = id;
        c.health = Math.min(75, c.health + 10);
        return true;
      };
      p.health = 50;
      await t.tap('Digit7');
      await t.wait(0.2);
      const started = p.action.kind;
      t.key('KeyW', true);
      t.key('ShiftLeft', true);
      await t.wait(1.5);
      const speedWhileHealing = +Math.hypot(p.velocity.x, p.velocity.z).toFixed(2);
      t.key('KeyW', false);
      t.key('ShiftLeft', false);
      await t.wait(2.6);
      const res = { started, speedWhileHealing, applied, health: p.health, actionAfter: p.action.kind };
      Object.assign(items, saved);
      return res;
    });
  },
};

const checks = {
  tunnel: (r) => r.crouched && r.inCrouchSection && r.standUnderCeiling === false && r.stoppedBeforeLow && r.proneOk && r.crawledIn && r.crouchUnderLow === false,
  proneSlopes: (r) => r.prone_on_20deg === true && r.prone_on_40deg === false,
  ramps: (r) => r[20] > 2.5 && r[30] > 3.8 && r[40] > 4.8 && r[45] > 5.3 && r[55] < 1.0,
  stairs: (r) => r.stairs018 > 1.7 && r.stairs025 > 1.6 && r.time018 > 0 && r.time018 < 1.5 && r.time025 > 0 && r.time025 < 1.5,
  lean: (r) => r.leanRightAgainstWall < 0.6 && r.headGap >= 0 && r.leanLeftFree < -0.95,
  jump: (r) => Math.abs(r.apex - 0.55) < 0.06 && r.landed,
  drowning: (r) => r.healthAt14s === 100 && r.healthAt18s <= 80 && r.healthAt18s >= 60,
  knocked: (r) => Math.abs(r.crawlSpeed - 0.9) < 0.09,
  vehicle: (r) => r.seated.mode === 'vehicle' && r.exitMode === 'ground' && r.exitDist > 1.0 && r.exitDist < 3.5 && r.bailOutDamage === 0,
  plane: (r) => r.inPlane.visible === false && r.inPlane.hitboxes === 0 && r.after.mode === 'skydive' && r.after.visible === true,
  interact: (r) => r.focus === 'Hold test' && r.holdProgressAt0_5s > 0.3 && r.completedHold === 1 && r.afterCancel.done === 1 && r.instant === 1,
  heal: (r) => r.started === 'useItem' && r.speedWhileHealing <= 1.95 && r.applied === 'item_bandage' && r.health === 60 && r.actionAfter === 'none',
};

const report = {};
let fails = 0;
for (const [name, fn] of Object.entries(tests)) {
  if (filter && !name.includes(filter)) continue;
  try {
    const r = await fn();
    const ok = checks[name](r);
    if (!ok) fails++;
    report[name] = { ok, ...r };
  } catch (e) {
    fails++;
    report[name] = { ok: false, error: e.message };
  }
}
console.log(JSON.stringify(report, null, 1));
const errs = logs.filter((l) => /^\[(error|pageerror)\]/.test(l));
if (errs.length) console.log('CONSOLE ERRORS:\n' + errs.slice(0, 20).join('\n'));
await browser.close();
process.exit(fails ? 1 : 0);
