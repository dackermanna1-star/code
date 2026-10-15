// Check survivor-walkable connectivity along a list of waypoints for a chapter.
// usage: node tests/navcheck.mjs <chapter> (waypoints come from the level module's `routeCheck` array)
import { launch } from './harness.mjs';
const ch = process.argv[2] || '0';
const { browser, page } = await launch({ url: `http://localhost:5173/?chapter=${ch}&auto=1` });
page.on('pageerror', (e) => console.log('[pageerror]', e.message));
await page.waitForFunction(() => window.__game && (window.__game.state === 'playing' || window.__game.loadError), null, { timeout: 240000 });
const r = await page.evaluate(() => {
  const w = window.__game.world, nav = w.nav;
  const pts = w.level.routeCheck || [];
  const out = [];
  for (let i = 0; i < pts.length; i++) {
    const [name, x, y, z] = pts[i];
    const n = nav.nearest(x, y + 0.3, z, 4);
    const info = { name, node: n, ny: n >= 0 ? +nav.y[n].toFixed(2) : null, links: n >= 0 ? Array.from({ length: 8 }, (_, d) => nav.ltype[n * 8 + d]).join('') : '' };
    if (i > 0) {
      const [pn, px, py, pz] = pts[i - 1];
      const a = nav.nearest(px, py + 0.3, pz, 4);
      const p = a >= 0 && n >= 0 ? nav.path(a, n, false, 3, 200000, true) : null;
      info.reach = !!p; info.len = p ? p.length : 0;
      if (!p && a >= 0 && n >= 0) { const pi = nav.path(a, n, true, 9, 200000, true); info.infectedReach = !!pi; }
    }
    out.push(info);
  }
  return { count: nav.count, out, escapeTotal: w.director.totalFlow };
});
console.log('nodes', r.count, 'escapeTotal', r.escapeTotal);
for (const o of r.out) console.log(JSON.stringify(o));
await browser.close();
