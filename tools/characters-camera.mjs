// Camera rig + player controller checks through simulated input (headless Chromium).
// Usage: node tools/characters-camera.mjs [baseUrl] [outDir] [filter]
import { chromium } from 'playwright';
import fs from 'node:fs';

const base = process.argv[2] || 'http://localhost:5202';
const outDir = process.argv[3] || '.';
const filter = process.argv[4] || '';
fs.mkdirSync(outDir, { recursive: true });
const browser = await chromium.launch({ args: ['--use-angle=swiftshader', '--enable-unsafe-swiftshader', '--ignore-gpu-blocklist', '--enable-webgl'] });
const page = await browser.newPage({ viewport: { width: 960, height: 540 } });
const logs = [];
page.on('console', (m) => logs.push(`[${m.type()}] ${m.text()}`));
page.on('pageerror', (e) => logs.push(`[pageerror] ${e.message}\n${e.stack}`));
await page.goto(`${base}/sandbox/characters.html?nobots=1`, { waitUntil: 'load', timeout: 120000 });
await page.waitForFunction(() => window.__sandboxReady === true, null, { timeout: 120000 });
await page.waitForTimeout(3000);
await page.evaluate(() => {
  const g = window.__game, ctx = g.ctx;
  window.__wait = async (s) => {
    const t0 = ctx.engine.simTime;
    while (ctx.engine.simTime < t0 + s) await new Promise((r) => setTimeout(r, 16));
  };
  window.__key = (k, d) => ctx.input.simulate(k, d);
  window.__tap = async (k, hold = 0.06) => {
    ctx.input.simulate(k, true);
    await window.__wait(hold);
    ctx.input.simulate(k, false);
    await window.__wait(0.05);
  };
  window.__reset = async (x, z, yaw = 0) => {
    for (const k of ['KeyW', 'KeyA', 'KeyS', 'KeyD', 'ShiftLeft', 'ControlLeft', 'Mouse2', 'Mouse0', 'AltLeft', 'KeyQ', 'KeyE']) ctx.input.simulate(k, false);
    const p = ctx.player;
    if (p.vehicle) p.vehicle.exit(p);
    if (p.lifeState !== 'alive') p.setLifeState('alive');
    if (p.mode !== 'ground') p.setMoveState('idle');
    if (p.stance !== 'stand') { p.body.setShape('stand', p.position); p.stance = 'stand'; p.stanceHeight = 1.8; p.stanceProgress = 1; }
    g.setPerspective('tpp');
    g.playerController.resetToggles();
    p.equipSlot(null);
    g.teleport(x, z);
    g.setLook(yaw, 0);
    ctx.cameraRig.setMode('player');
    await window.__wait(0.4);
  };
  window.__state = () => ({ cam: g.cameraState(), p: g.playerState() });
});

const S = (name, body) => ({ name, body });
const tests = [
  S('tpp_idle', `await __reset(1520,1585,0); await __wait(0.6);`),
  S('tpp_rifle', `await __reset(1520,1585,0); g.giveWeapon(p.id,'ar_m416'); await __wait(0.8);`),
  S('tpp_aim_hold', `await __reset(1520,1585,0); g.giveWeapon(p.id,'ar_m416'); __key('Mouse2',true); await __wait(0.8);`),
  S('tpp_ads_click', `await __reset(1520,1585,0); g.giveWeapon(p.id,'ar_m416'); await __tap('Mouse2'); await __wait(0.6);`),
  S('fpp_idle', `await __reset(1520,1585,0); g.giveWeapon(p.id,'ar_m416'); await __tap('KeyV'); await __wait(0.6);`),
  S('fpp_ads', `await __reset(1520,1585,0); g.giveWeapon(p.id,'ar_m416'); await __tap('KeyV'); await __tap('Mouse2'); await __wait(0.6);`),
  S('mouse_look', `await __reset(1520,1585,0); const y0=p.intent.yaw; ctx.input.simulateMouse(200, -60); await __wait(0.2); window.__ml={dyaw:p.intent.yaw-y0, pitch:p.intent.pitch};`),
  S('free_look', `await __reset(1520,1585,0); __key('AltLeft',true); ctx.input.simulateMouse(-600, 0); await __wait(0.3); window.__fl={bodyYaw:p.yaw};`),
  S('wall_collision', `const t=g.arena.SPOTS.tower; await __reset(t.x, t.z+3.0, Math.PI); await __wait(0.6);`),
  S('crouch_tpp', `await __reset(1520,1585,0); g.giveWeapon(p.id,'ar_m416'); await __tap('KeyC'); await __wait(0.8);`),
  S('prone_tpp', `await __reset(1520,1585,0); g.giveWeapon(p.id,'ar_m416'); await __tap('KeyZ'); await __wait(1.4);`),
  S('lean_q_aim', `await __reset(1520,1585,0); g.giveWeapon(p.id,'ar_m416'); __key('Mouse2',true); __key('KeyQ',true); await __wait(0.8);`),
  S('vehicle', `await __reset(1520,1585,0); const vi=g.spawnMockVehicle(1524,1585,0); g.enterVehicle(p.id, vi, 0); await __wait(0.8);`),
  S('vehicle_passenger', `await __reset(1520,1585,0); const vi=g.spawnMockVehicle(1530,1590,0.5); g.enterVehicle(p.id, vi, 2); await __wait(0.8);`),
  S('freefall', `await __reset(1520,1585,0); g.skydive(500); await __wait(2.0);`),
  S('freefall_dive', `await __reset(1520,1585,0); g.skydive(500); g.setLook(0,-1.2); __key('KeyW',true); await __wait(2.5);`),
  S('parachute', `await __reset(1520,1585,0); g.skydive(300); await __wait(0.6); await __tap('KeyF'); await __wait(2.5);`),
  S('swim', `const pool=g.arena.POOL; await __reset(pool.x0+6,(pool.z0+pool.z1)/2,0); p.teleport(new THREE.Vector3(pool.x0+6, pool.surface-1.4,(pool.z0+pool.z1)/2)); p.setMoveState('swim'); __key('KeyW',true); await __wait(1.5);`),
  S('swim_dive', `const pool=g.arena.POOL; await __reset(pool.x0+6,(pool.z0+pool.z1)/2,-Math.PI/2); p.teleport(new THREE.Vector3(pool.x0+6, pool.surface-1.4,(pool.z0+pool.z1)/2)); p.setMoveState('swim'); __key('KeyC',true); await __wait(2.0);`),
  S('deathcam', `await __reset(1520,1585,0); p.setLifeState('dead',{type:'bullet',amount:80,zone:'head',direction:new THREE.Vector3(1,0,0)}); await __wait(2.5);`),
  S('spectate', `await __reset(1520,1585,0); const id=g.spawnBot(1530,1590,1.0,3); const b=g.charById(id); g.giveWeapon(id,'ar_akm'); ctx.cameraRig.spectate(b); b.intent.moveY=1; await __wait(1.2); b.intent.moveY=0;`),
];
const results = [];
for (const t of tests) {
  if (filter && !t.name.includes(filter)) continue;
  try {
    await page.evaluate(async (body) => {
      const g = window.__game, ctx = g.ctx, p = ctx.player, THREE = window.THREE;
      await eval(`(async () => { ${body} })()`);
      void g; void ctx; void p; void THREE;
    }, t.body);
    await page.screenshot({ path: `${outDir}/cam_${t.name}.png` });
    const st = await page.evaluate(() => {
      const s = window.__state();
      return { mode: s.cam.mode, persp: s.cam.perspective, fovH: +s.cam.fovH.toFixed(1), ads: +s.cam.adsBlend.toFixed(2), cam: s.cam.pos, ppos: s.p.pos, move: s.p.moveState, aim: s.p.aiming, isADS: s.p.ads, ml: window.__ml, fl: window.__fl };
    });
    results.push(`${t.name}: ${JSON.stringify(st)}`);
  } catch (e) {
    results.push(`${t.name}: ERROR ${e.message}`);
  }
}
console.log(results.join('\n'));
const errs = logs.filter((l) => /^\[(error|pageerror)\]/.test(l));
if (errs.length) console.log('CONSOLE ERRORS:\n' + errs.slice(0, 20).join('\n'));
await browser.close();
