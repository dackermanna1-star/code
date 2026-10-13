// Dev tool: exercises the world map and minimap in headless Chromium and
// writes screenshots for visual review. Creates a world (cheats on),
// teleports a few hundred blocks around so there is explored terrain, then
// opens the map, zooms, pans, hovers and takes screenshots; finally reloads
// the page and re-opens the same world to check the explored map persisted.
//   npm run build && node scripts/map-shots.mjs [outDir]
import { spawn } from 'node:child_process';
import { mkdirSync } from 'node:fs';
import { chromium } from 'playwright-core';

const out = process.argv[2] ?? 'test-results/map';
mkdirSync(out, { recursive: true });
const port = 8000 + Math.floor(Math.random() * 1000);
const server = spawn(process.execPath, ['scripts/serve.mjs', String(port)], { stdio: 'pipe' });
await new Promise((r) => server.stdout.once('data', r));

const exe = process.env.CHROMIUM_PATH ?? '/opt/pw-browsers/chromium-1194/chrome-linux/chrome';
const browser = await chromium.launch({ executablePath: exe, args: ['--use-angle=swiftshader', '--enable-unsafe-swiftshader', '--ignore-gpu-blocklist'] });
const context = await browser.newContext({ viewport: { width: 1280, height: 720 }, deviceScaleFactor: Number(process.env.DPR ?? 1) });
const page = await context.newPage();
const errors = [];
page.on('pageerror', (e) => errors.push(String(e)));
page.on('console', (m) => { if (m.type() === 'error') errors.push(m.text()); });

const WORLD_KEY = 'map-shots';
const shot = async (name, opts = {}) => {
  await page.screenshot({ path: `${out}/${name}.png`, ...opts });
  console.log('shot', name);
};
const settle = async (ms = 2500) => {
  await page.waitForTimeout(400);
  await page.waitForFunction(() => {
    const t = document.getElementById('fps')?.textContent ?? '';
    const m = /pending (\d+)/.exec(t);
    return m && Number(m[1]) < 6;
  }, null, { timeout: 60000 }).catch(() => console.log('  (meshing not settled)'));
  await page.waitForTimeout(ms);
};
/** Teleport to (x, z) standing on the generated terrain surface. */
const tp = async (x, z) => {
  await page.evaluate(([x, z]) => {
    const g = window.__corrode;
    const h = g.gen ? g.gen.rawColumn(x, z).height : 90;
    g.sim.send({ t: 'chat', text: `/tp ${x} ${Math.max(h, 48) + 2} ${z}` });
  }, [x, z]);
  await settle();
};
const spawnWorld = async (create) => {
  await page.goto(`http://localhost:${port}/`);
  await page.fill('#m-name', 'Mapper');
  if (create) {
    await page.evaluate(() => { document.getElementById('m-new').open = true; });
    await page.fill('#nw-name', 'Map World');
    await page.fill('#nw-seed', process.env.SEED ?? '424242');
    await page.check('#nw-cheats');
    await page.click('#nw-create');
  } else {
    await page.click('.world button.primary');
  }
  await page.waitForSelector('#loading.hidden', { state: 'attached', timeout: 60000 });
  await page.evaluate((k) => window.__corrode.map.setWorldKey(k), WORLD_KEY);
  await settle(1500);
};

let ok = false;
try {
  await spawnWorld(true);
  const start = await page.evaluate(() => [window.__corrode.local.state.x, window.__corrode.local.state.z]);
  console.log('spawn at', start.map(Math.round));
  await page.evaluate(() => { const g = window.__corrode; g.local.yaw = Math.PI * 0.75; g.local.pitch = -0.2; });
  await page.waitForTimeout(400);
  await shot('01-play-minimap');
  await page.locator('#minimap').screenshot({ path: `${out}/01b-minimap-closeup.png` });

  // explore: a loop of teleports a few hundred blocks around spawn
  const [sx, sz] = start.map(Math.round);
  for (const [dx, dz] of [[180, 0], [360, 0], [360, 200], [360, 400], [160, 400], [0, 260]]) await tp(sx + dx, sz + dz);
  // walk a bit
  await page.keyboard.down('KeyW');
  await page.waitForTimeout(1200);
  await page.keyboard.up('KeyW');
  await page.waitForTimeout(300);
  await page.locator('#minimap').screenshot({ path: `${out}/02-minimap-after-travel.png` });
  // die once so there is a death marker, respawn on a beach
  await page.evaluate(() => window.__corrode.sim.send({ t: 'chat', text: '/kill' }));
  await page.waitForSelector('#death:not(.hidden)', { timeout: 10000 }).catch(() => console.log('  (no death screen)'));
  await page.waitForTimeout(500);
  await page.click('#respawn-beach').catch(() => undefined);
  await page.waitForSelector('#loading.hidden', { state: 'attached', timeout: 30000 }).catch(() => undefined);
  await settle(1500);
  await page.locator('#minimap').screenshot({ path: `${out}/02b-minimap-after-respawn.png` });
  // back into the explored area (the body stays where we died)
  await tp(sx + 220, sz + 160);
  await page.evaluate(() => { window.__corrode.local.yaw = -2.2; });
  // a fake sleeping bag near spawn so the bag marker shows up
  await page.evaluate(([x, z]) => { window.__corrode.bags = [{ x: x + 40, z: z - 30, label: 'Home bag', kind: 'bag' }]; }, [sx, sz]);
  await shot('03-play-after-respawn');

  const stats = await page.evaluate(() => {
    const g = window.__corrode;
    return { chunks: g.world.chunks.size, explored: g.map.terrain.exploredChunks, regions: g.map.terrain.regions.size };
  });
  console.log('stats', stats);

  // open the map
  await page.keyboard.press('KeyM');
  await page.waitForTimeout(500);
  await shot('04-map-default');
  const box = await page.locator('#map-canvas').boundingBox();
  const cx = box.x + box.width / 2, cy = box.y + box.height / 2;
  // zoom out twice around the centre-ish
  await page.mouse.move(cx, cy);
  await page.mouse.wheel(0, 120);
  await page.waitForTimeout(150);
  await page.mouse.wheel(0, 120);
  await page.waitForTimeout(150);
  await page.mouse.wheel(0, 120);
  await page.waitForTimeout(300);
  await shot('05-map-zoomed-out');
  // drag to pan
  await page.mouse.move(cx, cy);
  await page.mouse.down();
  await page.mouse.move(cx - 150, cy - 120, { steps: 8 });
  await page.mouse.up();
  await page.waitForTimeout(300);
  await shot('06-map-panned');
  // hover a POI if one is visible
  const poi = await page.evaluate(() => {
    const m = window.__corrode.map;
    const cv = document.getElementById('map-canvas');
    const W = cv.clientWidth, H = cv.clientHeight;
    for (const k of m.markers) {
      const sx = (k.x - m.vx) * m.zoom + W / 2, sy = (k.z - m.vz) * m.zoom + H / 2;
      if (sx > 120 && sy > 120 && sx < W - 120 && sy < H - 120) return [sx, sy, k.label];
    }
    return null;
  });
  if (poi) {
    console.log('hover', poi[2]);
    await page.mouse.move(box.x + poi[0], box.y + poi[1] + 1);
    await page.waitForTimeout(300);
    await shot('07-map-hover-poi');
  }
  // zoom in a lot around a point near the player
  await page.keyboard.press('Space');
  await page.waitForTimeout(200);
  for (let i = 0; i < 5; i++) {
    await page.mouse.move(cx + 60, cy + 40);
    await page.mouse.wheel(0, -120);
    await page.waitForTimeout(150);
  }
  await page.waitForTimeout(300);
  await shot('08-map-zoomed-in');
  // max zoom-out via keyboard
  await page.keyboard.press('Space');
  for (let i = 0; i < 12; i++) await page.keyboard.press('Minus');
  await page.waitForTimeout(300);
  await shot('09-map-max-zoom-out');

  // performance: time full redraws at a few zoom levels
  const perf = await page.evaluate(() => {
    const m = window.__corrode.map;
    const res = {};
    for (const z of [0.25, 1, 2, 8]) {
      m.zoom = z;
      const t0 = performance.now();
      for (let i = 0; i < 30; i++) { m.lastSig = ''; m.render(m.px + (i % 2) * 0.3, m.pz, m.yaw); }
      res[`map@${z}`] = +((performance.now() - t0) / 30).toFixed(2);
    }
    m.zoom = 2;
    const c = [...window.__corrode.world.chunks.values()][0];
    const t1 = performance.now();
    for (let i = 0; i < 50; i++) { m.terrain.revs.delete(c.key); m.terrain.cols.delete(c.key); m.terrain.capture(c); }
    res.captureMs = +((performance.now() - t1) / 50).toFixed(3);
    return res;
  });
  console.log('perf (ms per call)', perf);
  await page.keyboard.press('KeyM');
  await page.waitForTimeout(500);

  // minimap must be hidden in menus
  await page.keyboard.press('Tab');
  await page.waitForTimeout(300);
  const hiddenInInv = await page.evaluate(() => document.getElementById('minimap').classList.contains('hidden'));
  await page.keyboard.press('Tab');
  await page.waitForTimeout(300);
  const [shownInPlay, mode] = await page.evaluate(() => [!document.getElementById('minimap').classList.contains('hidden'), window.__corrode.mode]);
  console.log('minimap hidden in inventory:', hiddenInInv, ` shown after closing it: ${shownInPlay} (mode ${mode})`);
  if (mode === 'play' && !shownInPlay) throw new Error('minimap not shown in play mode');

  // block edit -> map pixels update: carve a 5x5 pit next to the player via world edits
  const edit = await page.evaluate(async () => {
    const g = window.__corrode;
    const x0 = Math.floor(g.local.state.x) + 3, z0 = Math.floor(g.local.state.z) + 3;
    const before = g.map.terrain.columnAt(x0, z0);
    for (let dx = 0; dx < 5; dx++) for (let dz = 0; dz < 5; dz++) {
      const top = g.world.topSolid(x0 + dx, z0 + dz);
      for (let y = top; y > top - 4; y--) g.world.setBlock(x0 + dx, y, z0 + dz, 0);
    }
    await new Promise((r) => setTimeout(r, 900));
    return [before, g.map.terrain.columnAt(x0, z0)];
  });
  console.log('edit: column before/after', JSON.stringify(edit));

  // persistence: force a save, reload, reopen the world
  await page.evaluate(() => window.__corrode.map.terrain.flush(false));
  await page.waitForTimeout(1500);
  const exploredBefore = await page.evaluate(() => window.__corrode.map.terrain.exploredChunks);
  await page.evaluate(() => window.__corrode.sim.send({ t: 'save' }));
  await page.waitForTimeout(1000);
  await spawnWorld(false);
  await page.waitForTimeout(1500);
  const exploredAfter = await page.evaluate(() => window.__corrode.map.terrain.exploredChunks);
  console.log(`persistence: explored before reload ${exploredBefore}, after reload ${exploredAfter}`);
  await page.keyboard.press('KeyM');
  await page.waitForTimeout(300);
  await page.keyboard.press('Minus');
  await page.keyboard.press('Minus');
  await page.waitForTimeout(300);
  await shot('10-map-after-reload');
  await page.keyboard.press('KeyM');
  ok = errors.length === 0 && exploredAfter >= exploredBefore * 0.95;
} catch (e) {
  console.error('map-shots failure:', e);
  await page.screenshot({ path: `${out}/error.png` }).catch(() => undefined);
}
if (errors.length) console.error('Page errors:\n' + errors.join('\n'));
await browser.close();
server.kill();
console.log(ok ? 'MAP SHOTS OK' : 'MAP SHOTS FAILED');
process.exit(ok ? 0 : 1);
