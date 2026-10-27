// End-to-end smoke test: boots the app in headless Chromium (software WebGL),
// drives the main journeys and asserts on simulation state and rendered pixels.
// Usage: npm run test:e2e   (starts its own Vite dev server)
import { createRequire } from 'module';
import { createServer } from 'vite';
const require = createRequire(import.meta.url);
const { chromium } = require('playwright');

const server = await createServer({ server: { port: 0, strictPort: false }, logLevel: 'error' });
await server.listen();
const port = server.httpServer.address().port;
const url = process.env.COSMOS_URL || `http://localhost:${port}/?test`;

const browser = await chromium.launch({ args: ['--use-gl=angle', '--use-angle=swiftshader', '--enable-unsafe-swiftshader', '--ignore-gpu-blocklist'] });
const page = await browser.newPage({ viewport: { width: 480, height: 270 } });
const errors = [];
page.on('pageerror', (e) => errors.push(e.message));
page.on('console', (m) => { if (m.type() === 'error') errors.push(m.text()); });

let failed = 0;
async function step(name, fn) {
  const t0 = Date.now();
  try {
    await fn();
    console.log(`  ✓ ${name} (${((Date.now() - t0) / 1000).toFixed(1)} s)`);
  } catch (e) {
    failed++;
    console.log(`  ✗ ${name}: ${e.message}`);
  }
}
const run = (js) => page.evaluate(`(async () => { const app = window.__cosmos; ${js} })()`);
const wait = (ms) => page.waitForTimeout(ms);
function assert(cond, msg) { if (!cond) throw new Error(msg); }
/** Poll a JS condition (software WebGL runs at a few fps, so simulated time lags wall time). */
async function until(js, timeoutMs, what, diag = 'return null;') {
  const t0 = Date.now();
  while (Date.now() - t0 < timeoutMs) {
    if (await run(js)) return;
    await wait(500);
  }
  throw new Error(`timed out waiting for ${what} ${JSON.stringify(await run(diag))}`);
}

/** mean display brightness (0–255) of a centred box of the WebGL canvas */
const brightness = () => run(`
  const c = app.canvas, g = document.createElement('canvas'); g.width = 64; g.height = 64;
  const x = g.getContext('2d'); x.drawImage(c, c.width * 0.35, c.height * 0.35, c.width * 0.3, c.height * 0.3, 0, 0, 64, 64);
  const d = x.getImageData(0, 0, 64, 64).data; let s = 0; for (let i = 0; i < d.length; i += 4) s += (d[i] + d[i + 1] + d[i + 2]) / 3;
  return s / (d.length / 4);`);

console.log(`Infinite Cosmos smoke test → ${url}`);
await page.goto(url);
await page.waitForFunction(() => !!window.__cosmos, null, { timeout: 120000 });

await step('boots in interstellar space inside the Milky Way', async () => {
  await wait(3000);
  const s = await run(`return { gal: app.cosmos.current?.name, sys: app.world.system?.name ?? null };`);
  assert(s.gal === 'Milky Way', `galaxy ${s.gal}`);
});

await step('Known Universe journey starts at Earth and renders it', async () => {
  await run(`app.startKnown();`);
  await run(`await app.settle(6000);`);
  await wait(2500);
  const s = await run(`return { sys: app.world.system?.name, sel: app.selected?.name, info: document.querySelector('.info-title')?.textContent };`);
  assert(s.sys === 'Solar System', `system ${s.sys}`);
  assert(s.sel === 'Earth' && s.info === 'Earth', `selection ${s.sel} / ${s.info}`);
  const b = await brightness();
  assert(b > 8, `Earth view too dark (${b.toFixed(1)})`);
  assert(b < 235, `Earth view blown out (${b.toFixed(1)})`);
});

await step('search finds planets, stars and galaxies', async () => {
  const r = await run(`return ['mar', 'proxima', 'andromeda'].map((q) => app.search.query(q)[0]?.label);`);
  assert(r[0] === 'Mars', `mar → ${r[0]}`);
  assert(r[1] === 'Proxima Centauri', `proxima → ${r[1]}`);
  assert(/Andromeda/.test(r[2]), `andromeda → ${r[2]}`);
});

await step('travel to Mars via go-to', async () => {
  await run(`const r = app.search.query('mars')[0]; r.run(true);`);
  await until(`return !app.spectator.travel;`, 90000, 'arrival');
  const s = await run(`const m = app.findBody('Mars'); return { d: app.targetRel(app.selected).length() / m.radius };`);
  assert(s.d > 2 && s.d < 4, `distance ${s.d.toFixed(2)} R`);
});

await step('map opens at all scales', async () => {
  for (const l of ['system', 'local', 'galaxy', 'universe']) {
    await run(`app.map.isOpen || app.map.open(app.mapSources()); app.map.setLevel('${l}');`);
    await wait(400);
  }
  const s = await run(`const open = app.map.isOpen; app.map.close(); return open;`);
  assert(s, 'map did not open');
});

await step('spacecraft holds orbit around the Moon', async () => {
  await run(`app.placeNear('Moon', 1.15, 0.5); app.player.spawnShip('scout');`);
  await until(`return isFinite(app.player.ship.altitude);`, 10000, 'first ship update');
  const a0 = await run(`return app.player.ship.altitude;`);
  await wait(4000);
  const s = await run(`const sh = app.player.ship; return { mode: app.player.mode, alt: sh.altitude, body: sh.frame.body?.name };`);
  assert(s.mode === 'ship' && s.body === 'Moon', `${s.mode} / ${s.body}`);
  assert(Math.abs(s.alt - a0) / a0 < 0.05, `altitude drifted ${a0.toFixed(0)} → ${s.alt.toFixed(0)} m`);
});

await step('land, step out and walk on the Moon', async () => {
  await run(`app.player.toSpectator(); app.placeBySun(35, 25, 0, -10, 'Moon'); app.player.spawnShip('lander');`);
  await run(`await app.settle(5000);`);
  await wait(2000);
  const landed = await run(`return app.player.ship.landed;`);
  assert(landed, 'lander did not settle on the ground');
  await run(`app.player.exitShip();`);
  await wait(1500);
  const s = await run(`return { mode: app.player.mode, g: app.player.walker.gravity };`);
  assert(s.mode === 'walk', `mode ${s.mode}`);
  assert(Math.abs(s.g - 1.62) < 0.1, `lunar gravity ${s.g}`);
  await run(`app.player.boardShip();`);
  const m = await run(`return app.player.mode;`);
  assert(m === 'ship', `boarding failed (${m})`);
});

await step('bookmarks restore positions exactly', async () => {
  await run(`app.player.toSpectator(); app.placeNear('Saturn', 3, 0.4); window.__bm = app.bookmark('smoke'); window.__p = app.world.view.toUPos();`);
  await run(`app.placeNear('Venus', 5, 0.2);`);
  await wait(500);
  await run(`app.visitBookmark(window.__bm);`);
  const d = await run(`return app.world.view.toUPos().distanceTo(window.__p);`);
  // the planet moves along its orbit meanwhile; body-relative frames keep us beside it
  const rel = await run(`return app.world.view.body?.name;`);
  assert(rel === 'Saturn', `frame body ${rel}`);
  assert(d < 1e8, `moved ${d} m away from the bookmark (planet motion only)`);
});

await step('catalogued exoplanet system: Proxima Centauri', async () => {
  await run(`app.visitSystem('Proxima Centauri');`);
  const s = await run(`return { sys: app.world.system?.name, planets: app.world.system?.bodies.filter((b) => b.kind === 'planet').map((b) => b.name) };`);
  assert(s.sys === 'Proxima Centauri', `system ${s.sys}`);
  assert(s.planets.some((n) => /Proxima Centauri b$/.test(n)), `planets ${s.planets}`);
});

await step('scientific scan completes within range', async () => {
  await run(`const b = app.world.system.bodies.find((x) => x.kind === 'planet'); app.placeNear(b, 4, 0.5); app.select({ kind: 'body', id: b.id, name: b.displayName, body: b, radius: b.radius, position: (o) => b.system.bodyUPos(b, o) }); app.startScan();`);
  await until(`return app.discoveries.isScanned(app.selected.id);`, 60000, 'scan completion',
    `return { active: app.scanner.active, p: app.scanner.progress, sel: app.selected?.name, sys: app.world.system?.name, mode: app.player.mode, d: app.selected && app.targetRel(app.selected).length(), fps: document.querySelector('#hud-perf')?.textContent };`);
});

await step('leave the galaxy: intergalactic view', async () => {
  await run(`const u = app.cosmos.universe; app.world.view.rebase('universe', null); app.world.view.upos.copy(u.home.upos).addXYZ(0, 2.2e21, 1.5e21); app.world.view.setWorldOrientation(new (app.world.view.orient.constructor)().setFromAxisAngle({ x: 1, y: 0, z: 0 }, -Math.PI / 2 + 0.6)); app.renderer.pipeline.resetExposure();`);
  await wait(4000);
  const s = await run(`return { cur: app.cosmos.current?.name ?? null, n: app.cosmos.galaxies.length };`);
  assert(s.cur === null, `still inside ${s.cur}`);
  assert(s.n > 10, `only ${s.n} galaxies around`);
  const b = await brightness();
  const diag = await run(`return { vols: app.renderer.galaxies.group.children.length, exp: app.renderer.pipeline.settings.maxExposure };`);
  assert(b > 2, `Milky Way not visible from outside (${b.toFixed(1)}) ${JSON.stringify(diag)}`);
});

await step('procedural star systems generate on approach', async () => {
  await run(`const u = app.cosmos.universe; const g = u.home; app.world.view.rebase('universe', null); app.world.view.upos.copy(g.upos).addXYZ(...[12000, 20, 9000].map((x) => x * 9.4607e15));`);
  await wait(6000);
  const s = await run(`const n = app.renderer.starField.nearest(app.cosmos.camG, 60); if (!n) return null; const ref = app.cosmos.refFromStar(n.star); app.select({ kind: 'system', id: ref.id, name: ref.name, system: ref, radius: 7e8, position: (o) => o.copy(ref.upos) }); app.goTo(app.selected); return ref.name;`);
  assert(s, 'no stars loaded around the camera');
  await until(`return !app.spectator.travel;`, 120000, 'arrival');
  await until(`return !!app.world.system;`, 10000, 'system activation');
  const sys = await run(`return app.world.system?.name ?? null;`);
  assert(sys === s, `arrived at ${sys}, expected ${s}`);
});

const unique = [...new Set(errors)].filter((e) => !/favicon|fonts\.g/.test(e));
await step('no runtime errors', async () => {
  assert(unique.length === 0, unique.slice(0, 5).join(' | '));
});

await browser.close();
await server.close();
console.log(failed ? `${failed} step(s) failed` : 'all steps passed');
process.exit(failed ? 1 : 0);
