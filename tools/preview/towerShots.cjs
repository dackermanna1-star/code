// Screenshots of the Last Lookout world preview (headless Chromium, software GL).
// node tools/preview/towerShots.cjs <outDir> '<json list of shots>' [width] [height] [port]
//   shot: { name, yaw, pitch, zoom, t, rain, floods, traps, lean, gate: [id, damage | 'break'], crows, step }
// Needs the dev server: npx vite --config vite.tower.config.js --port 5181
const { chromium } = require('playwright');
const fs = require('fs');

(async () => {
  const out = process.argv[2] || 'shots';
  const shots = JSON.parse(process.argv[3] || '[{"name":"west","yaw":90,"pitch":-6}]');
  const width = +(process.argv[4] || 960), height = +(process.argv[5] || 540), port = +(process.argv[6] || 5181);
  fs.mkdirSync(out, { recursive: true });
  const browser = await chromium.launch({ args: ['--use-gl=angle', '--use-angle=swiftshader', '--enable-unsafe-swiftshader', '--ignore-gpu-blocklist'] });
  const page = await browser.newPage({ viewport: { width, height }, deviceScaleFactor: 1 });
  const logs = [];
  page.on('console', (m) => logs.push(`[${m.type()}] ${m.text()}`));
  page.on('pageerror', (e) => logs.push(`[pageerror] ${e.message}\n${e.stack}`));
  await page.goto(`http://127.0.0.1:${port}/tools/preview/tower.html?still&dpr=1`, { waitUntil: 'load', timeout: 180000 });
  try {
    await page.waitForFunction(() => window.__tower && window.__tower.ready, null, { timeout: 240000 });
  } catch (e) {
    for (const l of logs) console.log(l);
    throw e;
  }
  console.log('build ms', await page.evaluate(() => window.__tower.buildMs.toFixed(0)));
  console.log('stats', JSON.stringify(await page.evaluate(() => window.__tower.stats())));
  for (const s of shots) {
    const res = await page.evaluate((s) => {
      const T = window.__tower;
      T.stop();
      if (s.t !== undefined) T.tod(s.t);
      T.rain(s.rain ?? 0);
      if (s.floods && !T._floods) { T.floods(); T._floods = true; }
      if (!s.floods && T._floods) { T.floods(); T._floods = false; }
      if (s.traps && !T._traps) { T.traps(); T._traps = true; }
      if (!s.traps && T._traps) { T.traps(); T._traps = false; }
      if (s.gate) T.level.gateMesh(s.gate[0])[s.gate[1] === 'break' ? 'break' : 'setDamage'](s.gate[1]);
      T.view(s.yaw ?? 90, s.pitch ?? -6, s.zoom ?? 1, s.lean ?? 0);
      if (s.crows) T.level.scare(T.camera.position);
      if (s.step) T.step(s.step, Math.ceil(s.step * 30));
      return T.render();
    }, s);
    await page.waitForTimeout(150);
    await page.screenshot({ path: `${out}/${s.name}.png`, timeout: 180000 });
    console.log(s.name, JSON.stringify(res));
  }
  for (const l of logs) console.log(l);
  await browser.close();
})().catch((e) => {
  console.error(e);
  process.exit(1);
});
