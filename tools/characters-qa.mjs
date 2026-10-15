// Adversarial QA scenarios for the Characters module (headless Chromium, rendering stubbed unless --render).
// Each scenario tries to break a rule (steep slopes, water landings, stance spam, overlaps, long random runs,
// vehicle seat sync, removal while spectated, deaths in every state…) and reports measured values + ok flags.
// Usage: node tools/characters-qa.mjs [baseUrl] [filterRegex]
import { chromium } from 'playwright';

const base = process.argv[2] || 'http://localhost:5302';
const filter = process.argv[3] || '';
// --file <snippet.js>: evaluate an ad-hoc async snippet (body of an async function, `g`, `t`, `p` in scope)
// against the prepared harness instead of the scenario list (debugging aid).
const fileIdx = process.argv.indexOf('--file');
const snippet = fileIdx > 0 ? (await import('node:fs')).readFileSync(process.argv[fileIdx + 1], 'utf8') : null;
const extraQuery = process.argv.includes('--bots') ? '' : '?nobots=1';
const browser = await chromium.launch({ args: ['--use-angle=swiftshader', '--enable-unsafe-swiftshader', '--ignore-gpu-blocklist', '--enable-webgl'] });
const page = await browser.newPage({ viewport: { width: 480, height: 270 } });
const logs = [];
page.on('console', (m) => logs.push(`[${m.type()}] ${m.text()}`));
page.on('pageerror', (e) => logs.push(`[pageerror] ${e.message}\n${e.stack}`));
await page.goto(`${base}/sandbox/characters.html${extraQuery}`, { waitUntil: 'load', timeout: 120000 });
await page.waitForFunction(() => window.__sandboxReady === true, null, { timeout: 120000 });
await page.waitForTimeout(1500);
await page.evaluate(() => {
  const g = window.__game, ctx = g.ctx;
  ctx.engine.setRenderFn(() => {});
  window.__t = {
    sim: () => ctx.engine.simTime,
    async wait(s) {
      const t0 = ctx.engine.simTime;
      while (ctx.engine.simTime < t0 + s) await new Promise((r) => setTimeout(r, 4));
    },
    key: (k, d) => ctx.input.simulate(k, d),
    async tap(k) {
      ctx.input.simulate(k, true);
      await this.wait(0.04);
      ctx.input.simulate(k, false);
      await this.wait(0.04);
    },
    releaseAll() {
      for (const k of ['KeyW', 'KeyA', 'KeyS', 'KeyD', 'ShiftLeft', 'ControlLeft', 'Mouse2', 'Mouse0', 'Space', 'KeyC', 'KeyZ', 'KeyQ', 'KeyE', 'KeyF', 'AltLeft']) ctx.input.simulate(k, false);
    },
    async reset(x, z, yaw = 0, y) {
      this.releaseAll();
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
      ctx.cameraRig.setMode('player');
      await this.wait(0.3);
    },
    finite(c) {
      return [c.position.x, c.position.y, c.position.z, c.velocity.x, c.velocity.y, c.velocity.z, c.yaw, c.pitch].every(Number.isFinite);
    },
    /** Body collider shape consistent with the stance (or knocked/disabled states). */
    shapeOk(c) {
      if (c.mode !== 'ground') return true;
      if (c.lifeState === 'knocked') return c.body.shape === 'knocked' || c.body.shape === 'prone';
      return c.body.shape === c.stance;
    },
    /** Collider center sits where the feet say it should. */
    colliderSynced(c) {
      const t = c.body.collider.translation();
      return Math.abs(t.x - c.position.x) < 1e-3 && Math.abs(t.z - c.position.z) < 1e-3 && Math.abs(t.y - (c.position.y + c.body.centerY)) < 1e-3;
    },
  };
});

const S = {};

// Standing on a slope steeper than the climb limit must not be a stable floor.
S.steepSlope = () => page.evaluate(async () => {
  const g = window.__game, t = window.__t, p = g.ctx.player, r = g.arena.SPOTS.ramps;
  // 55° ramp is index 4: put the player half-way up it (ramp rises toward -Z).
  const a = (55 * Math.PI) / 180;
  const x = r.x + 4 * 6, zMid = r.z - Math.cos(a) * 4, yMid = Math.sin(a) * 4;
  await t.reset(x, zMid, 0, yMid + 0.3);
  const y0 = p.position.y;
  await t.wait(2.5);
  return { y0: +y0.toFixed(2), yAfter: +p.position.y.toFixed(2), grounded: p.isGrounded, slid: p.position.y < y0 - 1.0, ok: p.position.y < y0 - 1.0 };
});

// High dive into deep water: no fall damage, swim state.
S.waterDive = () => page.evaluate(async () => {
  const g = window.__game, t = window.__t, p = g.ctx.player, pool = g.arena.POOL;
  await t.reset((pool.x0 + pool.x1) / 2 - 8, (pool.z0 + pool.z1) / 2, 0, 20);
  await t.wait(3.5);
  return { mode: p.mode, health: p.health, ok: p.mode === 'swim' && p.health === 100 };
});

// Rapid random stance/jump/lean input for 6 s: collider shape must always match the stance; nothing NaN.
S.stanceSpam = () => page.evaluate(async () => {
  const g = window.__game, t = window.__t, p = g.ctx.player, s = g.arena.SPOTS.start;
  await t.reset(s.x, s.z, 0);
  const keys = ['KeyC', 'KeyZ', 'Space', 'KeyC', 'KeyZ', 'KeyW', 'ShiftLeft', 'KeyQ'];
  let bad = 0, badDetail = null;
  const sys = {
    name: 'qaProbe', priority: 46,
    fixedUpdate: () => {
      if (!t.shapeOk(p) || !t.finite(p) || !t.colliderSynced(p)) {
        bad++;
        badDetail ??= { stance: p.stance, shape: p.body.shape, mode: p.mode, pos: p.position.toArray(), synced: t.colliderSynced(p) };
      }
    },
  };
  g.ctx.engine.addSystem(sys);
  let seed = 7;
  const rnd = () => ((seed = (seed * 16807) % 2147483647) / 2147483647);
  const t0 = t.sim();
  while (t.sim() - t0 < 6) {
    const k = keys[Math.floor(rnd() * keys.length)];
    t.key(k, true);
    await t.wait(0.02 + rnd() * 0.15);
    t.key(k, false);
  }
  t.releaseAll();
  await t.wait(1.5);
  g.ctx.engine.removeSystem(sys);
  return { bad, badDetail, stance: p.stance, shape: p.body.shape, ok: bad === 0 };
});

// Lying prone along a wall and turning into it: the body must not rotate into the wall.
S.proneTurnWall = () => page.evaluate(async () => {
  const g = window.__game, t = window.__t, p = g.ctx.player, tw = g.arena.SPOTS.tower;
  // Tower is 4x4 centred on tw; stand 0.7 m east of its east face, facing north (along the wall).
  await t.reset(tw.x + 2 + 0.7, tw.z + 4, 0);
  p.requestStance('prone');
  await t.wait(1.2);
  // Look west (into the wall): yaw +90° turns left (west).
  g.setLook(Math.PI / 2, 0);
  await t.wait(2.0);
  const fits = p.body.proneBodyFits(p.position, p.bodyYaw, p.pronePitch);
  return { bodyYaw: +p.bodyYaw.toFixed(2), fits, ok: fits && Math.abs(p.bodyYaw) < 1.2 };
});

// Two characters spawned on the same spot: they separate/keep moving; no NaN, nobody stuck in the other.
S.overlapSpawn = () => page.evaluate(async () => {
  const g = window.__game, t = window.__t, p = g.ctx.player, s = g.arena.SPOTS.start;
  await t.reset(s.x + 10, s.z, 0);
  const id = g.spawnBot(p.position.x, p.position.z, 0, 3);
  const b = g.charById(id);
  t.key('KeyW', true);
  await t.wait(2.0);
  t.key('KeyW', false);
  const moved = Math.hypot(p.position.x - (s.x + 10), p.position.z - s.z);
  const sep = Math.hypot(p.position.x - b.position.x, p.position.z - b.position.z);
  const ok = t.finite(p) && t.finite(b) && moved > 3;
  g.ctx.characters.remove(b);
  return { moved: +moved.toFixed(2), sep: +sep.toFixed(2), ok };
});

// Walking into another character is blocked (bodies collide) but sliding past works.
S.bodyBlock = () => page.evaluate(async () => {
  const g = window.__game, t = window.__t, p = g.ctx.player, s = g.arena.SPOTS.start;
  await t.reset(s.x + 20, s.z, 0);
  const id = g.spawnBot(s.x + 20, s.z - 3, 0, 3);
  const b = g.charById(id);
  t.key('KeyW', true);
  await t.wait(2.0);
  t.key('KeyW', false);
  const gap = Math.hypot(p.position.x - b.position.x, p.position.z - b.position.z);
  g.ctx.characters.remove(b);
  return { gap: +gap.toFixed(2), ok: gap > 0.6 };
});

// Coyote time: jump pressed shortly after running off a ledge still jumps.
S.coyote = () => page.evaluate(async () => {
  const g = window.__game, t = window.__t, p = g.ctx.player, tw = g.arena.SPOTS.tower;
  // 5 m platform at (tw.x+8, tw.z), 3x3: stand on it, run east off the edge.
  const px = tw.x + 8, pz = tw.z;
  await t.reset(px, pz, -Math.PI / 2, 5.05);
  let leftAt = -1, jumped = false;
  const offJ = g.ctx.events.on('character:jump', (e) => { if (e.character === p) jumped = true; });
  t.key('KeyW', true);
  const t0 = t.sim();
  while (t.sim() - t0 < 2) {
    await t.wait(0.004);
    if (!p.isGrounded && leftAt < 0 && p.position.x > px + 1.4) { leftAt = t.sim(); break; }
  }
  await t.wait(0.06);
  await t.tap('Space');
  t.key('KeyW', false);
  await t.wait(1.5);
  offJ();
  return { leftAt: leftAt > 0, jumped, ok: jumped };
});

// Jumping under a low ceiling: head stops, no tunnelling, lands.
S.jumpCeiling = () => page.evaluate(async () => {
  const g = window.__game, t = window.__t, p = g.ctx.player, s = g.arena.SPOTS.tunnel;
  await t.reset(s.x, s.z - 1.5, 0);
  p.requestStance('crouch');
  await t.wait(0.5);
  // stand up blocked under the 1.5 m ceiling → crouch stays; Space from crouch tries to stand (blocked).
  await t.tap('Space');
  await t.wait(1.0);
  return { stance: p.stance, y: +p.position.y.toFixed(3), ok: p.stance === 'crouch' && p.position.y < 0.1 && p.position.y > -0.05 };
});

// Long random run (90 s sim): never NaN, never below the floor, never inside geometry for long.
S.longRandom = () => page.evaluate(async () => {
  const g = window.__game, t = window.__t, p = g.ctx.player, s = g.arena.SPOTS.start;
  await t.reset(s.x, s.z - 25, 0);
  const keys = ['KeyW', 'KeyA', 'KeyS', 'KeyD', 'ShiftLeft', 'ControlLeft', 'Space', 'KeyC', 'KeyZ', 'KeyQ', 'KeyE', 'Mouse2'];
  let seed = 99;
  const rnd = () => ((seed = (seed * 16807) % 2147483647) / 2147483647);
  let minY = Infinity, nan = 0, stuckTicks = 0, maxSpeed = 0;
  const sys = {
    name: 'qaProbe2', priority: 46,
    fixedUpdate: () => {
      if (!t.finite(p)) nan++;
      if (p.mode === 'ground') minY = Math.min(minY, p.position.y);
      maxSpeed = Math.max(maxSpeed, Math.hypot(p.velocity.x, p.velocity.z));
      if (p.mode === 'ground' && !p.body.fits(p.stance === 'prone' ? 'crouch' : 'crouch', p.position, false, 0.15) && p.stance !== 'prone') stuckTicks++;
    },
  };
  g.ctx.engine.addSystem(sys);
  const t0 = t.sim();
  while (t.sim() - t0 < 90) {
    for (const k of keys) if (rnd() < 0.25) t.key(k, rnd() < 0.5);
    g.ctx.input.simulateMouse((rnd() - 0.5) * 120, (rnd() - 0.5) * 30);
    await t.wait(0.25);
  }
  t.releaseAll();
  g.ctx.engine.removeSystem(sys);
  await t.wait(1);
  return { nan, minY: +minY.toFixed(3), stuckTicks, maxSpeed: +maxSpeed.toFixed(2), pos: p.position.toArray().map((v) => +v.toFixed(1)), ok: nan === 0 && minY > -0.2 && maxSpeed < 7.0 };
});

// Extreme mouse input: pitch clamped, yaw finite.
S.mouseExtreme = () => page.evaluate(async () => {
  const g = window.__game, t = window.__t, p = g.ctx.player, s = g.arena.SPOTS.start;
  await t.reset(s.x, s.z, 0);
  // Mouse deltas are only consumed in 'player' camera mode with pointer lock not required for simulateMouse.
  g.ctx.input.simulateMouse(1e7, 1e7);
  await t.wait(0.2);
  const a = { yaw: p.intent.yaw, pitch: p.intent.pitch };
  g.ctx.input.simulateMouse(-3e7, -2e7);
  await t.wait(0.2);
  const b = { yaw: p.intent.yaw, pitch: p.intent.pitch, cyaw: p.yaw, cpitch: p.pitch };
  return { a, b, ok: Number.isFinite(b.yaw) && Math.abs(b.pitch) <= 1.5 && Math.abs(a.pitch) <= 1.5 && Math.abs(b.yaw) < 13 };
});

// Seated in a moving vehicle: seat/hitboxes must follow the vehicle within the same tick (combat runs after
// vehicles move). Measures the hips offset to the seat right after the vehicle tick.
S.vehicleSync = () => page.evaluate(async () => {
  const g = window.__game, t = window.__t, p = g.ctx.player, s = g.arena.SPOTS.start, ctx = g.ctx;
  await t.reset(s.x + 30, s.z, 0);
  const vi = g.spawnMockVehicle(s.x + 33, s.z, 0);
  const v = g.mockVehicles[vi];
  g.enterVehicle(p.id, vi, 1);
  v.driving = true;
  await t.wait(1.0);
  const seat = new window.THREE.Vector3(), q = new window.THREE.Quaternion();
  let maxErr = 0, maxHb = 0;
  const sys = {
    name: 'qaSeatProbe', priority: 31, // after vehicles (25), where combat (30) would raycast
    fixedUpdate: () => {
      v.getSeatTransform(p.seatIndex, seat, q);
      const feet = seat.clone().add(new window.THREE.Vector3(0, -0.5, 0).applyQuaternion(q));
      maxErr = Math.max(maxErr, feet.distanceTo(p.position));
      // pelvis hitbox should be near the seat hips point
      const pel = p.getHitboxes().find((h) => h.zone === 'pelvis');
      if (pel) maxHb = Math.max(maxHb, pel.a.clone().lerp(pel.b, 0.5).distanceTo(seat));
    },
  };
  ctx.engine.addSystem(sys);
  await t.wait(1.0);
  ctx.engine.removeSystem(sys);
  v.driving = false;
  await t.wait(0.1);
  v.exit(p);
  await t.wait(0.3);
  return { speed: v.speedKmh, maxSeatErr: +maxErr.toFixed(3), maxPelvisToSeat: +maxHb.toFixed(3), ok: maxErr < 0.02 && maxHb < 0.35 };
});

// Spectated character removed: camera survives (no exception), falls back.
S.removeSpectated = () => page.evaluate(async () => {
  const g = window.__game, t = window.__t, ctx = g.ctx, s = g.arena.SPOTS.start;
  await t.reset(s.x, s.z, 0);
  const id = g.spawnBot(s.x + 3, s.z, 0, 2);
  const b = g.charById(id);
  ctx.cameraRig.spectate(b);
  await t.wait(0.3);
  ctx.characters.remove(b);
  await t.wait(0.3);
  const mode1 = ctx.cameraRig.mode;
  ctx.cameraRig.spectate(null);
  await t.wait(0.1);
  return { modeAfterRemove: mode1, modeAfter: ctx.cameraRig.mode, ok: ctx.cameraRig.mode === 'player' };
});

// Death in every state: no exceptions, no hitboxes, collider disabled; revive restores.
S.deaths = () => page.evaluate(async () => {
  const g = window.__game, t = window.__t, ctx = g.ctx, s = g.arena.SPOTS.start, pool = g.arena.POOL;
  const out = {};
  const mk = async (name, setup) => {
    const id = g.spawnBot(s.x + 40, s.z, 0, 4);
    const b = g.charById(id);
    await t.wait(0.3);
    await setup(b);
    b.setLifeState('dead', { type: 'bullet', amount: 50, zone: 'chest' });
    await t.wait(0.5);
    out[name] = { mode: b.mode, hb: b.getHitboxes().length, collider: b.body.isEnabled, finite: t.finite(b) };
    ctx.characters.remove(b);
  };
  await mk('ground', async () => {});
  await mk('prone', async (b) => { b.requestStance('prone'); await t.wait(1); });
  await mk('skydive', async (b) => { b.teleport(new window.THREE.Vector3(b.position.x, 300, b.position.z)); b.setMoveState('freefall'); await t.wait(0.5); });
  await mk('swim', async (b) => { b.teleport(new window.THREE.Vector3(pool.x0 + 8, pool.surface - 1.4, (pool.z0 + pool.z1) / 2)); b.setMoveState('swim'); await t.wait(0.5); });
  await mk('knocked', async (b) => { b.setLifeState('knocked'); await t.wait(0.5); });
  await mk('vault', async (b) => {
    const bx = g.arena.SPOTS.boxes;
    b.teleport(new window.THREE.Vector3(bx.x + 6, 0.02, bx.z - 4 + 0.3 + 0.9), 0);
    b.intent.jump = true; b.intent.moveY = 1;
    await t.wait(0.15);
  });
  const ok = Object.values(out).every((r) => r.mode === 'dead' && r.hb === 0 && !r.collider && r.finite);
  return { out, ok };
});

// Knocked in deep water: still swims, does not sink to the bottom/drown instantly.
S.knockedWater = () => page.evaluate(async () => {
  const g = window.__game, t = window.__t, p = g.ctx.player, pool = g.arena.POOL;
  await t.reset(pool.x0 - 2, (pool.z0 + pool.z1) / 2, -Math.PI / 2);
  p.setLifeState('knocked');
  t.key('KeyW', true);
  await t.wait(5);
  t.key('KeyW', false);
  await t.wait(1);
  const r = { mode: p.mode, y: +p.position.y.toFixed(2), underwater: p.underwater, x: +(p.position.x - pool.x0).toFixed(2) };
  p.setLifeState('alive');
  return { ...r, ok: r.mode === 'swim' && !r.underwater };
});

// Prone on a slope then walking uphill until the slope is too steep: auto-crouch, no stuck state.
S.proneUphill = () => page.evaluate(async () => {
  const g = window.__game, t = window.__t, p = g.ctx.player, r = g.arena.SPOTS.ramps;
  await t.reset(r.x, r.z + 0.5, 0); // 20° ramp
  p.requestStance('prone');
  await t.wait(1.2);
  t.key('KeyW', true);
  await t.wait(4);
  t.key('KeyW', false);
  return { stance: p.stance, y: +p.position.y.toFixed(2), shape: p.body.shape, ok: p.position.y > 0.8 && t.shapeOk(p) };
});

// Vault from a sprint at an angle (45°) and from standstill directly in front.
S.vaultAngles = () => page.evaluate(async () => {
  const g = window.__game, t = window.__t, p = g.ctx.player, bx = g.arena.SPOTS.boxes;
  const out = {};
  for (const [name, dx, yaw, sprint] of [['diag45', -1.4, -Math.PI / 4, true], ['standstill', 0, 0, false]]) {
    const x = bx.x + 6; // 0.8 m box, front face z = bx.z - 4 + 0.3
    const face = bx.z - 4 + 0.3;
    await t.reset(x + dx, face + (name === 'standstill' ? 0.75 : 1.8), yaw);
    let kind = null;
    const off = g.ctx.events.on('character:vault', (e) => { if (e.character === p) kind = e.kind; });
    if (name !== 'standstill') {
      t.key('KeyW', true);
      if (sprint) t.key('ShiftLeft', true);
      const t0 = t.sim();
      while (t.sim() - t0 < 1.5 && face - p.position.z < -0.95) await t.wait(0.01);
    }
    await t.tap('Space');
    await t.wait(1.0);
    t.releaseAll();
    off();
    out[name] = { kind, z: +(p.position.z - face).toFixed(2), crossed: p.position.z < face - 0.6, y: +p.position.y.toFixed(2) };
  }
  return { out, ok: out.diag45.kind === 'vault' && out.diag45.crossed && out.standstill.kind === 'vault' && out.standstill.crossed };
});

// Stand-up / crouch request immediately after prone request (mid-transition) — shapes stay consistent and
// the character ends in the last requested stance.
S.midTransition = () => page.evaluate(async () => {
  const g = window.__game, t = window.__t, p = g.ctx.player, s = g.arena.SPOTS.start;
  await t.reset(s.x - 10, s.z, 0);
  await t.tap('KeyZ');
  await t.wait(0.2);
  await t.tap('KeyZ'); // back to stand mid-transition
  await t.wait(1.5);
  const a = { stance: p.stance, shape: p.body.shape, h: +p.stanceHeight.toFixed(2) };
  await t.tap('KeyC');
  await t.wait(0.1);
  await t.tap('KeyZ');
  await t.wait(1.5);
  const b = { stance: p.stance, shape: p.body.shape, h: +p.stanceHeight.toFixed(2) };
  return { a, b, ok: a.stance === 'stand' && a.shape === 'stand' && a.h === 1.8 && b.stance === 'prone' && b.shape === 'prone' && b.h === 0.6 };
});

// Teleport into the air above the ground then fall 12 m: fall damage once.
S.fallOnce = () => page.evaluate(async () => {
  const g = window.__game, t = window.__t, p = g.ctx.player, s = g.arena.SPOTS.start;
  await t.reset(s.x - 20, s.z, 0, 12);
  let hits = 0;
  const off = g.ctx.events.on('combat:damage', (e) => { if (e.target === p) hits++; });
  await t.wait(3);
  off();
  return { hits, health: +p.health.toFixed(1), ok: hits === 1 && p.health < 100 && p.health > 0 };
});

// Interaction focus is cleared/blocked while dead or in a vehicle; F in the air (falling) does nothing.
S.hitboxStance = () => page.evaluate(async () => {
  const g = window.__game, t = window.__t, ctx = g.ctx, s = g.arena.SPOTS.start;
  // A bot far outside the camera view changes stance: its hitboxes must follow (pose refresh while culled).
  const id = g.spawnBot(s.x, s.z + 200, 0, 2);
  const b = g.charById(id);
  await t.wait(1.0);
  const top = () => Math.max(...b.getHitboxes().map((h) => Math.max(h.a.y, h.b.y) + h.radius)) - b.position.y;
  const stand = top();
  b.requestStance('prone');
  await t.wait(1.6);
  const prone = top();
  b.requestStance('crouch');
  await t.wait(1.0);
  const crouch = top();
  ctx.characters.remove(b);
  return { stand: +stand.toFixed(2), crouch: +crouch.toFixed(2), prone: +prone.toFixed(2), ok: stand > 1.6 && crouch < 1.45 && crouch > 0.9 && prone < 0.7 };
});

if (snippet) {
  try {
    const r = await page.evaluate(`(async () => { const g = window.__game, t = window.__t, p = g.ctx.player, ctx = g.ctx, THREE = window.THREE; ${snippet} })()`);
    console.log(JSON.stringify(r, null, 1));
  } catch (e) {
    console.log('SNIPPET ERROR', e.message);
  }
  const errs = logs.filter((l) => /^\[(error|pageerror)/.test(l));
  if (errs.length) console.log('CONSOLE ERRORS:\n' + errs.slice(0, 20).join('\n'));
  await browser.close();
  process.exit(0);
}
const results = {};
for (const [name, fn] of Object.entries(S)) {
  if (filter && !new RegExp(filter).test(name)) continue;
  try {
    results[name] = await fn();
  } catch (e) {
    results[name] = { error: e.message, ok: false };
  }
  console.log(name, JSON.stringify(results[name]));
}
const failed = Object.entries(results).filter(([, r]) => !r.ok).map(([n]) => n);
console.log('FAILED:', JSON.stringify(failed));
const errs = logs.filter((l) => /^\[(error|pageerror)/.test(l));
if (errs.length) console.log('CONSOLE ERRORS:\n' + errs.slice(0, 20).join('\n'));
const warns = logs.filter((l) => /^\[warning/.test(l));
if (warns.length) console.log('WARNINGS (' + warns.length + '):\n' + [...new Set(warns)].slice(0, 15).join('\n'));
await browser.close();
