// Renders every animation clip of the character library on one subject (forced clip, no procedural
// layers) at a few normalized times into a contact sheet per clip group. Validates delivered assets.
// Usage: node tools/characters-clips.mjs [baseUrl] [outDir] [filterRegex]
import { chromium } from 'playwright';
import fs from 'node:fs';
const base = process.argv[2] || 'http://localhost:5202';
const outDir = process.argv[3] || '.';
const filter = new RegExp(process.argv[4] || '.');
fs.mkdirSync(outDir, { recursive: true });
const browser = await chromium.launch({ args: ['--use-angle=swiftshader', '--enable-unsafe-swiftshader', '--ignore-gpu-blocklist', '--enable-webgl'] });
const page = await browser.newPage({ viewport: { width: 360, height: 420 } });
await page.goto(`${base}/sandbox/characters.html?nobots=1`, { waitUntil: 'load', timeout: 120000 });
await page.waitForFunction(() => window.__sandboxReady === true, null, { timeout: 120000 });
await page.waitForTimeout(4000);
const names = await page.evaluate(() => {
  const g = window.__game, ctx = g.ctx;
  g.debugState.freeCam = true;
  const id = g.spawnBot(1520, 1585, 0, 1);
  const c = g.charById(id);
  window.__subject = c;
  ctx.engine.addSystem({ name: 'clipCam', priority: 81, update: () => {
    const p = c.visual.root.position;
    const yaw = window.__camYaw ?? 0.7;
    ctx.camera.position.set(p.x - Math.sin(yaw) * 3.6, p.y + 1.3, p.z - Math.cos(yaw) * 3.6);
    ctx.camera.lookAt(p.x, p.y + 0.8, p.z);
    ctx.camera.fov = 45; ctx.camera.updateProjectionMatrix();
  }});
  return g.characterLibrary.clips.map((x) => x.name);
});
const picked = names.filter((n) => filter.test(n));
for (const n of picked) {
  await page.evaluate(async (n) => {
    const c = window.__subject;
    c.visual.forceClip(n);
    const ctx = window.__game.ctx;
    const t0 = ctx.engine.simTime;
    const dur = window.__game.characterLibrary.clipByName.get(n).clip.duration;
    while (ctx.engine.simTime < t0 + Math.min(dur * 0.45, 1.2)) await new Promise((r) => setTimeout(r, 16));
  }, n);
  await page.screenshot({ path: `${outDir}/clip_${n}.png` });
}
console.log(picked.join(' '));
await browser.close();
