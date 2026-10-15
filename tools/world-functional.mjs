// End-to-end functional checks of the World module in a real browser (headless Chromium + SwiftShader).
// Usage: node tools/world-functional.mjs [url]   → prints PASS/FAIL lines, exits 1 on failure.
import { chromium } from 'playwright';

const url = process.argv[2] || 'http://localhost:5201/sandbox/world.html?texres=256';
const browser = await chromium.launch({ args: ['--use-angle=swiftshader', '--enable-unsafe-swiftshader', '--ignore-gpu-blocklist'] });
const page = await browser.newPage({ viewport: { width: 480, height: 270 } });
const errors = [];
page.on('console', (m) => {
  if (m.type() === 'error' || m.type() === 'warning') errors.push(`[${m.type()}] ${m.text()}`);
});
page.on('pageerror', (e) => errors.push(`[pageerror] ${e.message}`));
await page.goto(url, { waitUntil: 'load', timeout: 180000 });
await page.waitForFunction(() => window.__game && window.__game.ready, null, { timeout: 240000, polling: 500 });

let failed = 0;
const check = (name, ok, info = '') => {
  console.log(`${ok ? 'PASS' : 'FAIL'}  ${name}${info ? '  — ' + info : ''}`);
  if (!ok) failed++;
};

// 1) getHeight matches the physics collider (raycasts through Rapier) at random points
const hres = await page.evaluate(() => {
  const g = window.__game, w = g.ctx.world, ph = g.ctx.physics;
  const THREE = window.THREE;
  let max = 0, n = 0;
  const o = new THREE.Vector3(), d = new THREE.Vector3(0, -1, 0);
  for (let i = 0; i < 400; i++) {
    const x = 20 + Math.random() * 3030, z = 20 + Math.random() * 3030;
    o.set(x, 400, z);
    // Layer.Terrain only, and only the heightfield (bridge decks are also kind 'terrain' but owned by a bridge)
    const hit = ph.raycast(o, d, 800, { mask: 1, predicate: (c) => ph.getInfo(c)?.owner === w });
    if (!hit) continue;
    max = Math.max(max, Math.abs(hit.point.y - w.getHeight(x, z)));
    n++;
  }
  return { max, n };
});
check('getHeight == Rapier terrain collider', hres.n > 300 && hres.max < 0.01, `max err ${hres.max.toExponential(2)} over ${hres.n} rays`);

// 2) spatial queries
const q = await page.evaluate(() => {
  const w = window.__game.ctx.world;
  const road = w.roads[0].points[20];
  const river = w.layout.river.points[8];
  const lot = w.lots[0];
  return {
    roadReserved: w.isReserved(road.x, road.z, 0),
    roadSurface: w.getSurface(road.x, road.z),
    meadowReserved: w.isReserved(1700, 1000, 2),
    riverWater: w.getWaterHeight(river.x, river.z),
    landWater: w.getWaterHeight(1380, 1400),
    isLandRiver: w.isLand(river.x, river.z),
    lotFlat: Math.abs(w.getHeight(lot.x, lot.z) - lot.groundY),
    treeOnRoad: w.getTreeDensity(road.x, road.z),
    forest: w.getTreeDensity(880, 330),
    cover: w.getGroundCover(1070, 410),
    nearest: w.nearestLocation(1380, 1400)?.name,
    map: (() => { const c = w.getMapImage(); return c ? `${c.width}x${c.height}` : null; })(),
    lots: w.lots.length,
    spawns: w.vehicleSpawns.length,
  };
});
check('road point is reserved', q.roadReserved === true);
check('road surface is asphalt', q.roadSurface === 'asphalt', q.roadSurface);
check('meadow is not reserved', q.meadowReserved === false);
check('river has water at ~sea level', q.riverWater !== null && Math.abs(q.riverWater) < 1.5, String(q.riverWater));
check('town has no water', q.landWater === null);
check('river is not land', q.isLandRiver === false);
check('lot is flat at groundY', q.lotFlat < 0.01, q.lotFlat.toFixed(4));
check('no trees on roads', q.treeOnRoad === 0);
check('forest density high', q.forest > 0.4, q.forest.toFixed(2));
check('wheat field ground cover high', q.cover > 0.8, q.cover.toFixed(2));
check('nearest location', q.nearest === 'Volodino', q.nearest);
check('map image 2048x2048', q.map === '2048x2048', q.map);

// 3) debug camera + teleport + fly camera
const cam = await page.evaluate(async () => {
  const g = window.__game;
  g.debugCam(1000, 50, 1000, 0, 0);
  const p0 = g.ctx.camera.position.clone();
  g.teleport(1500, 1500);
  const p1 = g.ctx.camera.position.clone();
  g.flycam(true);
  g.debugCam(1500, 60, 1500, 0, 0);
  return { p0: p0.toArray(), p1: p1.toArray(), ground: g.ctx.world.getHeight(1500, 1500) };
});
check('debugCam places the camera', Math.abs(cam.p0[0] - 1000) < 1e-3 && Math.abs(cam.p0[1] - 50) < 1e-3);
check('teleport (no player) moves the camera to the ground', Math.abs(cam.p1[0] - 1500) < 1e-3 && Math.abs(cam.p1[1] - (cam.ground + 2.7)) < 0.01);
await page.keyboard.down('KeyW');
await page.waitForTimeout(2500);
await page.keyboard.up('KeyW');
const moved = await page.evaluate(() => window.__game.ctx.camera.position.z);
check('fly camera moves forward (north) with W', moved < 1500 - 2, `z ${moved.toFixed(1)}`);

// 4) time / weather
const env = await page.evaluate(async () => {
  const g = window.__game, e = g.ctx.environment;
  g.setTime(12);
  const noonSun = e.sunDirection.y;
  g.setTime(1);
  const nightVis = e.visibility, nightSun = e.sunDirection.y;
  g.setTime(13.5);
  e.setWeather('rain', 2);
  const f0 = g.ctx.engine.realTime;
  await new Promise((res) => { const t = () => (g.ctx.engine.realTime > f0 + 2.5 ? res() : setTimeout(t, 100)); t(); });
  const rain = e.params.rain, fogRain = e.fogDistance;
  g.setWeather('fog');
  const fogVis = e.visibility, fogDist = e.fogDistance;
  g.setWeather('clear');
  return { noonSun, nightSun, nightVis, rain, fogRain, fogVis, fogDist, clearDist: e.fogDistance, weather: e.weather };
});
check('sun high at noon, below horizon at 1:00', env.noonSun > 0.8 && env.nightSun < 0, `${env.noonSun.toFixed(2)} / ${env.nightSun.toFixed(2)}`);
check('night reduces AI visibility', env.nightVis < 0.5, env.nightVis.toFixed(2));
check('smooth weather transition reaches rain', env.rain > 0.95, env.rain.toFixed(2));
check('fog reduces visibility + fog distance', env.fogVis < 0.6 && env.fogDist < 600, `${env.fogVis.toFixed(2)} / ${env.fogDist.toFixed(0)} m`);
check('clear fog distance large', env.clearDist > 3000, env.clearDist.toFixed(0));

// 5) graphics presets apply live without errors
const errBefore = errors.length;
const presets = await page.evaluate(async () => {
  const g = window.__game, s = g.ctx.settings;
  const out = {};
  for (const p of ['low', 'medium', 'high', 'ultra', 'high']) {
    s.applyPreset(p);
    const f0 = g.ctx.engine.frame;
    await new Promise((res) => { const t = () => (g.ctx.engine.frame >= f0 + 2 ? res() : setTimeout(t, 50)); t(); });
    const sun = g.ctx.scene.getObjectByName('sun');
    out[p] = { cascades: sun.shadow.activeCascades, map: sun.shadow.mapSize.x, far: Math.round(g.ctx.camera.far), scale: g.ctx.engine.renderScale };
  }
  return out;
});
check('presets apply live', presets.low.cascades === 2 && presets.medium.cascades === 3 && presets.ultra.cascades === 4 && presets.low.scale === 0.75, JSON.stringify(presets));
check('no console errors while switching presets', errors.length === errBefore, errors.slice(errBefore).join(' | '));

check('no console errors/warnings overall', errors.length === 0, errors.slice(0, 5).join(' | '));
await browser.close();
console.log(failed ? `${failed} check(s) FAILED` : 'ALL PASSED');
process.exit(failed ? 1 : 0);
