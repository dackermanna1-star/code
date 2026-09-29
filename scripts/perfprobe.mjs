// Scene census: visible meshes / shadow casters grouped by top-level object.
// usage: node scripts/perfprobe.mjs [url]
import { chromium } from 'playwright-core';
const url = process.argv[2] || 'http://localhost:4173/?station=order&stats=1';
const browser = await chromium.launch({ executablePath: '/opt/pw-browsers/chromium', args: ['--use-gl=angle', '--use-angle=swiftshader', '--enable-unsafe-swiftshader', '--ignore-gpu-blocklist'] });
const page = await browser.newPage({ viewport: { width: 1280, height: 720 } });
page.on('pageerror', (e) => console.log('[pageerror]', e.message));
await page.goto(url);
await page.waitForFunction(() => window.__game && window.__game.state === 'day', null, { timeout: 240000 });
await page.waitForTimeout(3000);
const r = await page.evaluate(() => {
  const g = window.__game;
  const scene = g.engine.scene;
  const groups = {};
  let meshes = 0, casters = 0, tris = 0, instanced = 0;
  const mats = new Set();
  const label = (o) => {
    // climb to a named ancestor below the scene
    let p = o, path = [];
    while (p && p.parent && p.parent !== scene) { if (p.name) path.unshift(p.name); p = p.parent; }
    return (p.name || p.type) + (path[0] ? '/' + path[0] : '');
  };
  scene.traverseVisible((o) => {
    if (!o.isMesh && !o.isPoints) return;
    meshes++;
    if (o.isInstancedMesh) instanced++;
    if (o.castShadow) casters++;
    mats.add(o.material);
    const idx = o.geometry.index;
    tris += (idx ? idx.count : o.geometry.attributes.position.count) / 3;
    const k = label(o);
    groups[k] = groups[k] || { n: 0, cast: 0 };
    groups[k].n++;
    if (o.castShadow) groups[k].cast++;
  });
  const top = Object.entries(groups).sort((a, b) => b[1].n - a[1].n).slice(0, 25);
  const lights = [];
  scene.traverse((o) => { if (o.isLight && o.castShadow && o.visible && o.intensity > 0) lights.push(o.type + ':' + (o.shadow.mapSize.x)); });
  return { meshes, casters, instanced, materials: mats.size, tris: Math.round(tris), lights, top };
});
// average renderer counters over a dozen frames (shadow maps update on a stagger)
const frames = await page.evaluate(() => new Promise((resolve) => {
  const out = [];
  const tick = () => {
    const st = window.__game.engine.stats;
    out.push({ calls: st.calls, tris: st.triangles });
    if (out.length < 12) requestAnimationFrame(tick);
    else resolve(out);
  };
  requestAnimationFrame(tick);
}));
const avg = (k) => Math.round(frames.reduce((a, f) => a + f[k], 0) / frames.length);
r.avgCalls = avg('calls');
r.avgTris = avg('tris');
r.maxCalls = Math.max(...frames.map((f) => f.calls));
console.log(JSON.stringify(r, null, 1));
await browser.close();
