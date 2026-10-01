// Headless screenshot tool (Playwright + SwiftShader).
//   node tools/shots.mjs '<json array>' [query] [outDir]
// Each entry: {name, x, y, z, yaw, pitch, dim, wait, eval}. Positions use game.spawnAt(), which
// drops the player on the nearest free floor. `query` is appended to the page URL, e.g. "force=office".
// Needs a static server on PORT (default 8765) serving the repo root:  python3 -m http.server 8765
import { chromium } from '/opt/node22/lib/node_modules/playwright/index.mjs';
const shots = JSON.parse(process.argv[2] || '[{"name":"shot"}]');
const query = process.argv[3] || '';
const outDir = process.argv[4] || '.';
const port = process.env.PORT || 8765;
const browser = await chromium.launch({ args: ['--use-gl=angle', '--use-angle=swiftshader', '--enable-unsafe-swiftshader', '--ignore-gpu-blocklist', '--autoplay-policy=no-user-gesture-required'] });
const page = await browser.newPage({ viewport: { width: 640, height: 480 } });
const logs = [];
page.on('console', (m) => logs.push(m.type() + ': ' + m.text()));
page.on('pageerror', (e) => logs.push('PAGEERROR: ' + e.message + '\n' + e.stack));
await page.goto(`http://127.0.0.1:${port}/index.html?${query}`);
await page.waitForTimeout(2500);
for (const s of shots) {
  const info = await page.evaluate((s) => {
    const g = window.__game;
    if (!g) return 'game failed to boot';
    if (s.eval) { try { (0, eval)(s.eval); } catch (e) { return 'eval error ' + e.message; } }
    if (s.x !== undefined) {
      g.spawnAt(s.dim || 0, s.x, s.y || 0, s.z, s.yaw || 0);
      g.player.pitch = g.player.tpitch = s.pitch || 0;
    }
    return 'ok';
  }, s);
  await page.waitForTimeout(s.wait || 1200);
  const st = await page.evaluate(() => {
    const g = window.__game;
    if (!g) return {};
    const p = g.player;
    return { pos: [p.x.toFixed(1), p.y.toFixed(2), p.z.toFixed(1)], zone: g.zone && (g.zone.type + ':' + (g.zone.params.variant || g.zone.params.layout || '')), tris: g.renderer.stats.tris, chunks: g.world.chunks.size, avgChunkMs: (g.world.stats.buildMs / Math.max(1, g.world.stats.built)).toFixed(1) };
  });
  console.log(s.name, info, JSON.stringify(st));
  await page.screenshot({ path: `${outDir}/${s.name}.png` });
}
for (const l of logs.slice(0, 40)) console.log(l);
await browser.close();
