// Pose gallery for the Characters sandbox: puts a subject character into each stance/state, frames it with a
// free camera and saves one screenshot per scenario (plus a contact sheet HTML listing them).
// Usage: node tools/characters-poses.mjs [baseUrl] [outDir] [filterRegex]
import { chromium } from 'playwright';
import fs from 'node:fs';

const base = process.argv[2] || 'http://localhost:5202';
const outDir = process.argv[3] || `${(await import('node:os')).tmpdir()}/characters-shots`;
const filter = process.argv[4] || '';
const extra = process.argv[5] || '';
const dbg = process.argv[6] || '';
fs.mkdirSync(outDir, { recursive: true });

const browser = await chromium.launch({ args: ['--use-angle=swiftshader', '--enable-unsafe-swiftshader', '--ignore-gpu-blocklist', '--enable-webgl'] });
const page = await browser.newPage({ viewport: { width: 800, height: 600 } });
const logs = [];
page.on('console', (m) => logs.push(`[${m.type()}] ${m.text()}`));
page.on('pageerror', (e) => logs.push(`[pageerror] ${e.message}\n${e.stack}`));
await page.goto(`${base}/sandbox/characters.html?nobots=1${extra}`, { waitUntil: 'load', timeout: 120000 });
await page.waitForFunction(() => window.__sandboxReady === true, null, { timeout: 120000 });
await page.waitForTimeout(3000);
if (dbg) await page.evaluate((d) => { const o = JSON.parse(d); if (o.hitboxes) window.__game.showHitboxes(true); delete o.hitboxes; Object.assign(window.__game.animDebug, o); }, dbg);

await page.evaluate(() => {
  const g = window.__game;
  const ctx = g.ctx;
  const T = window.THREE;
  g.debugState.freeCam = true;
  const x = 1520, z = 1585;
  const id = g.spawnBot(x, z, 0, 2);
  const c = g.charById(id);
  window.__subject = c;
  window.__cam = { dist: 3.2, yaw: 0.6, height: 1.2, target: 0.95, follow: true };
  if (window.__animDebugInit) Object.assign(g.animDebug, window.__animDebugInit);
  ctx.engine.addSystem({
    name: 'galleryCam',
    priority: 81,
    update: () => {
      const s = window.__cam;
      const p = c.visual?.root?.position ?? c.position;
      const yaw = c.bodyYaw + s.yaw; // s.yaw = 0: in front of the character
      const cx = p.x - Math.sin(yaw) * s.dist, cz = p.z - Math.cos(yaw) * s.dist;
      ctx.camera.position.set(cx, p.y + s.height, cz);
      ctx.camera.lookAt(p.x, p.y + s.target, p.z);
      ctx.camera.fov = 50;
      ctx.camera.updateProjectionMatrix();
    },
  });
  window.__wait = async (s) => {
    const t0 = ctx.engine.simTime;
    while (ctx.engine.simTime < t0 + s) await new Promise((r) => setTimeout(r, 16));
  };
  window.__reset = async () => {
    const i = c.intent;
    Object.assign(i, { moveX: 0, moveY: 0, sprint: false, walk: false, aim: false, ads: false, fire: false, lean: 0, jump: false, stance: null, dive: false, ascend: false });
    if (c.vehicle) c.vehicle.exit(c);
    if (c.lifeState !== 'alive') c.setLifeState('alive');
    if (c.mode !== 'ground') c.setMoveState('idle');
    if (c.stance !== 'stand') { c.body.setShape('stand', c.position); c.stance = 'stand'; c.stanceHeight = 1.8; c.stanceProgress = 1; }
    c.equipSlot(null);
    for (const k of Object.keys(c.inventory.weapons)) c.inventory.weapons[k] = null;
    for (const k of Object.keys(c.inventory.equipment)) c.inventory.equipment[k] = null;
    c.refreshEquipmentVisuals();
    c.setAction({ kind: 'none' });
    g.charById(id).teleport(new T.Vector3(x, 0.02, z), 0);
    i.yaw = 0;
    i.pitch = 0;
    Object.assign(window.__cam, { dist: 3.2, yaw: 0.6, height: 1.2, target: 0.95 });
    await window.__wait(0.3);
  };
});

// Wait until the subject's model is loaded and posed (variants stream in after boot).
await page.waitForFunction(() => {
  const v = window.__subject.visual;
  const lib = window.__game.characterLibrary;
  return !!v && !!v.getPosePoints() && lib.hasVariant(window.__subject.variant ?? 2) && !!lib.clips.length;
}, null, { timeout: 120000 });
await page.waitForTimeout(500);

const S = (name, body, cam) => ({ name, body, cam });
const scenarios = [
  S('stand_idle', `await __wait(1);`),
  S('walk', `c.intent.moveY=1; c.intent.walk=true; await __wait(1.6);`),
  S('run', `c.intent.moveY=1; await __wait(1.4);`, { yaw: 1.4 }),
  S('sprint', `c.intent.moveY=1; c.intent.sprint=true; await __wait(1.4);`, { yaw: 1.4 }),
  S('strafe_right', `c.intent.moveX=1; await __wait(1.4);`, { yaw: 0.3 }),
  S('run_back', `c.intent.moveY=-1; await __wait(1.4);`, { yaw: 0.5 }),
  S('crouch_idle', `c.intent.stance='crouch'; await __wait(1);`),
  S('crouch_walk', `c.intent.stance='crouch'; await __wait(0.5); c.intent.moveY=1; await __wait(1.4);`, { yaw: 1.4 }),
  S('crouch_walk_side', `c.intent.stance='crouch'; await __wait(0.5); c.intent.moveY=1; await __wait(1.4);`, { yaw: 1.57 }),
  S('crouch_idle_side', `c.intent.stance='crouch'; await __wait(1.2);`, { yaw: 1.57 }),
  S('pistol_crouch_walk', `g.giveWeapon(c.id,'pistol_p92'); c.intent.stance='crouch'; await __wait(0.5); c.intent.moveY=1; await __wait(1.4);`, { yaw: 1.57 }),
  S('rifle_crouch_walk', `g.giveWeapon(c.id,'ar_m416'); c.intent.stance='crouch'; await __wait(0.5); c.intent.moveY=1; await __wait(1.4);`, { yaw: 1.57 }),
  S('prone_idle', `c.intent.stance='prone'; await __wait(1.6);`, { yaw: 0.9, height: 1.0, target: 0.3, dist: 3 }),
  S('prone_crawl', `c.intent.stance='prone'; await __wait(1.4); c.intent.moveY=1; await __wait(1.5);`, { yaw: 1.3, height: 1.0, target: 0.3, dist: 3 }),
  S('rifle_idle', `g.giveWeapon(c.id,'ar_m416'); await __wait(1);`),
  S('rifle_run', `g.giveWeapon(c.id,'ar_m416'); c.intent.moveY=1; await __wait(1.4);`, { yaw: 1.2 }),
  S('rifle_sprint', `g.giveWeapon(c.id,'ar_m416'); c.intent.moveY=1; c.intent.sprint=true; await __wait(1.4);`, { yaw: 1.2 }),
  S('rifle_sprint_front', `g.giveWeapon(c.id,'ar_m416'); c.intent.moveY=1; c.intent.sprint=true; await __wait(1.4);`, { yaw: 0.35 }),
  S('rifle_aim', `g.giveWeapon(c.id,'ar_m416'); c.intent.aim=true; await __wait(1);`, { yaw: 1.0 }),
  S('rifle_ads_side', `g.giveWeapon(c.id,'ar_m416'); c.intent.ads=true; c.intent.aim=true; await __wait(1);`, { yaw: 1.57, dist: 2.2, height: 1.5, target: 1.4 }),
  S('rifle_aim_up', `g.giveWeapon(c.id,'ar_m416'); c.intent.aim=true; c.intent.pitch=0.6; await __wait(1);`, { yaw: 1.4 }),
  S('rifle_aim_down', `g.giveWeapon(c.id,'ar_m416'); c.intent.aim=true; c.intent.pitch=-0.6; await __wait(1);`, { yaw: 1.4 }),
  S('rifle_crouch_aim', `g.giveWeapon(c.id,'ar_m416'); c.intent.stance='crouch'; c.intent.aim=true; await __wait(1);`, { yaw: 1.0 }),
  S('rifle_prone_aim', `g.giveWeapon(c.id,'ar_m416'); c.intent.stance='prone'; await __wait(1.4); c.intent.aim=true; await __wait(0.6);`, { yaw: 1.0, height: 0.9, target: 0.3, dist: 2.8 }),
  S('rifle_reload', `g.giveWeapon(c.id,'ar_m416'); c.setAction({kind:'reload',progress:0,duration:2.2}); const t0=g.ctx.engine.simTime; while(g.ctx.engine.simTime<t0+0.9){ c.action.progress=g.ctx.engine.simTime-t0; await __wait(0.016);} `, { yaw: 1.0 }),
  S('lean_left', `g.giveWeapon(c.id,'ar_m416'); c.intent.aim=true; c.intent.lean=-1; await __wait(1);`, { yaw: 0.2 }),
  S('lean_right', `g.giveWeapon(c.id,'ar_m416'); c.intent.aim=true; c.intent.lean=1; await __wait(1);`, { yaw: 0.2 }),
  S('pistol_aim', `g.giveWeapon(c.id,'pistol_p92'); c.intent.aim=true; await __wait(1);`, { yaw: 1.0 }),
  S('pistol_idle', `g.giveWeapon(c.id,'pistol_p92'); await __wait(1);`, { yaw: 0.8 }),
  S('melee_idle', `g.giveWeapon(c.id,'melee_pan'); await __wait(1);`, { yaw: 0.8 }),
  S('gear_slung', `g.giveGear(c.id,2,2,3); g.giveWeapon(c.id,'ar_akm',false); g.giveWeapon(c.id,'sr_kar98k',false); g.giveWeapon(c.id,'pistol_p92',false); c.equipSlot(null); await __wait(1);`, { yaw: 2.7, target: 1.2 }),
  S('gear_front', `g.giveGear(c.id,3,3,2); g.giveWeapon(c.id,'ar_m416'); await __wait(1);`, { yaw: 0.4 }),
  S('gear_closeup', `g.giveGear(c.id,2,2,2); g.giveWeapon(c.id,'ar_m416'); await __wait(2.5);`, { yaw: 0.6, dist: 1.6, height: 1.5, target: 1.35 }),
  S('gear_closeup_back', `g.giveGear(c.id,3,3,3); await __wait(2.5);`, { yaw: 2.6, dist: 1.8, height: 1.5, target: 1.3 }),
  S('jump', `c.intent.moveY=1; await __wait(0.6); c.intent.jump=true; await __wait(0.28);`, { yaw: 1.4 }),
  S('knocked', `c.setLifeState('knocked'); await __wait(1);`, { yaw: 1.2 }),
  S('knocked_crawl', `c.setLifeState('knocked'); await __wait(0.5); c.intent.moveY=1; await __wait(1.2);`, { yaw: 1.2 }),
  S('death_ragdoll', `g.giveWeapon(c.id,'ar_m416'); c.intent.moveY=1; await __wait(0.6); c.setLifeState('dead',{type:'bullet',amount:60,zone:'chest',direction:new THREE.Vector3(0,0,1)}); await __wait(2.5);`, { yaw: 1.2, target: 0.3 }),
  S('swim_surface', `const pool=g.arena.POOL; c.teleport(new THREE.Vector3(pool.x0+8, pool.surface-1.4,(pool.z0+pool.z1)/2),0); c.setMoveState('swim'); c.intent.moveY=1; await __wait(1.2);`, { yaw: 1.57, height: 2.3, target: 1.3, dist: 3.4 }),
  S('swim_tread', `const pool=g.arena.POOL; c.teleport(new THREE.Vector3(pool.x0+8, pool.surface-1.4,(pool.z0+pool.z1)/2),0); c.setMoveState('swim'); await __wait(1.2);`, { yaw: 0.8, height: 2.3, target: 1.3, dist: 3.4 }),
  S('freefall_pose', `c.teleport(new THREE.Vector3(c.position.x, 400, c.position.z),0); c.setMoveState('freefall'); await __wait(1.5);`, { yaw: 1.2, height: 1.5, target: 0.9, dist: 3.5 }),
  S('parachute_pose', `c.teleport(new THREE.Vector3(c.position.x, 300, c.position.z),0); c.setMoveState('parachute'); await __wait(2.0);`, { yaw: 1.0, height: 2.0, target: 3.0, dist: 11 }),
  S('parachute_behind', `c.teleport(new THREE.Vector3(c.position.x, 300, c.position.z),0); c.setMoveState('parachute'); c.intent.moveX=1; await __wait(2.0);`, { yaw: 3.0, height: 1.0, target: 2.5, dist: 7 }),
  S('parachute_opening', `c.teleport(new THREE.Vector3(c.position.x, 300, c.position.z),0); c.setMoveState('freefall'); await __wait(0.8); c.deployParachute(); await __wait(0.5);`, { yaw: 1.2, height: 2.0, target: 2.5, dist: 10 }),
  S('seated_driver', `const vi=g.spawnMockVehicle(c.position.x+3, c.position.z, 0); g.enterVehicle(c.id, vi, 0); await __wait(1);`, { yaw: 1.3, height: 1.4, target: 1.0, dist: 3 }),
  S('seated_passenger_rifle', `const vi=g.spawnMockVehicle(c.position.x+3, c.position.z-6, 0); g.giveWeapon(c.id,'ar_m416'); g.enterVehicle(c.id, vi, 3); c.intent.aim=true; await __wait(1);`, { yaw: 1.3, height: 1.4, target: 1.0, dist: 3 }),
  S('vault_mid', `const b=g.arena.SPOTS.boxes; c.teleport(new THREE.Vector3(b.x+12, 0.02, b.z),0); c.intent.moveY=1; while(c.position.z-(b.z-3.7)>1.0) await __wait(0.016); c.intent.jump=true; while(!c.traversal) await __wait(0.016); while(c.traversal && c.traversal.t<0.42) await __wait(0.008);`, { yaw: 1.57, height: 1.2, target: 0.9, dist: 3.4 }),
  S('climb_mid', `const b=g.arena.SPOTS.boxes; c.teleport(new THREE.Vector3(b.x+24, 0.02, b.z),0); c.intent.moveY=1; while(c.position.z-(b.z-3.7)>1.0) await __wait(0.016); c.intent.jump=true; while(!c.traversal) await __wait(0.016); while(c.traversal && c.traversal.t<0.45) await __wait(0.008);`, { yaw: 1.57, height: 1.6, target: 1.3, dist: 3.6 }),
  S('heal_bandage_unarmed', `c.setAction({kind:'useItem',itemId:'item_bandage',progress:0,duration:4}); const t0=g.ctx.engine.simTime; while(g.ctx.engine.simTime<t0+1.5){ c.action.progress=g.ctx.engine.simTime-t0; await __wait(0.016);} `, { yaw: 0.7 }),
  S('heal_bandage_rifle', `g.giveWeapon(c.id,'ar_m416'); await __wait(0.3); c.setAction({kind:'useItem',itemId:'item_bandage',progress:0,duration:4}); const t0=g.ctx.engine.simTime; while(g.ctx.engine.simTime<t0+1.3){ c.action.progress=g.ctx.engine.simTime-t0; await __wait(0.016);} `, { yaw: 0.5, dist: 2.2, height: 1.3, target: 1.1 }),
  S('heal_bandage_side', `c.setAction({kind:'useItem',itemId:'item_bandage',progress:0,duration:4}); const t0=g.ctx.engine.simTime; while(g.ctx.engine.simTime<t0+1.7){ c.action.progress=g.ctx.engine.simTime-t0; await __wait(0.016);} `, { yaw: 1.3, dist: 2.2, height: 1.3, target: 1.1 }),
  S('heal_firstaid', `c.setAction({kind:'useItem',itemId:'item_firstaid',progress:0,duration:6}); const t0=g.ctx.engine.simTime; while(g.ctx.engine.simTime<t0+1.5){ c.action.progress=g.ctx.engine.simTime-t0; await __wait(0.016);} `, { yaw: 0.8, dist: 2.2, height: 1.3, target: 1.1 }),
  S('heal_drink_rifle_walk', `g.giveWeapon(c.id,'ar_m416'); c.intent.moveY=1; c.intent.walk=true; c.setAction({kind:'useItem',itemId:'item_energy_drink',progress:0,duration:4}); const t0=g.ctx.engine.simTime; while(g.ctx.engine.simTime<t0+1.6){ c.action.progress=g.ctx.engine.simTime-t0; await __wait(0.016);} `, { yaw: 0.9 }),
  S('revive_hold', `c.intent.stance='crouch'; await __wait(0.5); c.setAction({kind:'revive',targetId:0,progress:0,duration:10}); const t0=g.ctx.engine.simTime; while(g.ctx.engine.simTime<t0+2){ c.action.progress=g.ctx.engine.simTime-t0; await __wait(0.016);} `, { yaw: 1.0 }),
  S('throw_cook', `g.giveWeapon(c.id,'throw_frag'); await __wait(0.4); c.setAction({kind:'throw',progress:0,cookTime:0}); const t0=g.ctx.engine.simTime; while(g.ctx.engine.simTime<t0+1){ c.action.progress=g.ctx.engine.simTime-t0; await __wait(0.016);} `, { yaw: 1.2 }),
  S('melee_swing', `g.giveWeapon(c.id,'melee_pan'); await __wait(0.4); c.setAction({kind:'melee',progress:0,duration:1.2}); const t0=g.ctx.engine.simTime; while(g.ctx.engine.simTime<t0+0.55){ c.action.progress=g.ctx.engine.simTime-t0; await __wait(0.016);} `, { yaw: 1.2 }),
  S('pickup_event', `g.ctx.events.emit('item:pickup',{character:c,itemId:'x',count:1}); await __wait(0.45);`, { yaw: 1.2 }),
];

const results = [];
for (const sc of scenarios) {
  if (filter && !new RegExp(filter).test(sc.name)) continue;
  try {
    await page.evaluate(async ({ body, cam }) => {
      const g = window.__game;
      const c = window.__subject;
      const THREE = window.THREE;
      await window.__reset();
      if (cam) Object.assign(window.__cam, cam);
      await eval(`(async () => { ${body} })()`);
      void g; void c; void THREE;
    }, sc);
    await page.screenshot({ path: `${outDir}/pose_${sc.name}.png` });
    const st = await page.evaluate(() => {
      const c = window.__subject;
      return `${c.moveState}/${c.stance}/${c.mode}/${c.lifeState}`;
    });
    results.push(`${sc.name}: ${st}`);
  } catch (e) {
    results.push(`${sc.name}: ERROR ${e.message}`);
  }
}
console.log(results.join('\n'));
const errs = logs.filter((l) => /error|pageerror/i.test(l.slice(0, 12)));
if (errs.length) console.log('CONSOLE ERRORS:\n' + errs.slice(0, 20).join('\n'));
await browser.close();
