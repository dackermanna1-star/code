// Render-cost report for the world sandbox: draw calls / triangles per viewpoint and per graphics configuration.
// (SwiftShader timings are meaningless; counts are what matter for the GTX 1660 budget.)
// Usage: node tools/world-perf.mjs [url]
import { chromium } from 'playwright';

const url = process.argv[2] || 'http://localhost:5201/sandbox/world.html?texres=256';
const browser = await chromium.launch({ args: ['--use-angle=swiftshader', '--enable-unsafe-swiftshader', '--ignore-gpu-blocklist'] });
const page = await browser.newPage({ viewport: { width: 640, height: 360 } });
await page.goto(url, { waitUntil: 'load', timeout: 180000 });
await page.waitForFunction(() => window.__game && window.__game.ready, null, { timeout: 240000, polling: 500 });

const views = {
  town_ground: [1385, null, 1420, 90, -3],
  hill_vista: [2040, null, 1185, 60, -2],
  aerial_150: [1150, 150, 1620, 225, -15],
  plane_600: [600, 600, 2900, 20, -25],
};
const configs = {
  full: {},
  no_shadows: { shadowQuality: 0 },
  no_post: { postProcessing: false },
  world_only: { hide: ['roads', 'bridges', 'rain'] },
};
const rows = [];
for (const [cname, cfg] of Object.entries(configs)) {
  for (const [vname, v] of Object.entries(views)) {
    const r = await page.evaluate(
      async ({ v, cfg }) => {
        const g = window.__game;
        const s = g.ctx.settings;
        const base = { shadowQuality: 3, postProcessing: true };
        s.update('graphics', { ...base, ...Object.fromEntries(Object.entries(cfg).filter(([k]) => k !== 'hide')) });
        for (const n of ['roads', 'bridges', 'rain']) {
          const o = g.ctx.scene.getObjectByName(n);
          if (o) o.visible = !(cfg.hide || []).includes(n);
        }
        g.debugCam(...v);
        const f0 = g.ctx.engine.frame;
        await new Promise((res) => {
          const t = () => (g.ctx.engine.frame >= f0 + 3 ? res() : setTimeout(t, 50));
          t();
        });
        const st = g.ctx.engine.stats;
        const tr = g.ctx.scene.getObjectByName('terrain');
        return { draws: st.drawCalls, tris: st.triangles, nodes: tr?.geometry?.instanceCount };
      },
      { v, cfg },
    );
    rows.push({ config: cname, view: vname, ...r });
    console.log(`${cname.padEnd(11)} ${vname.padEnd(12)} draws ${String(r.draws).padStart(4)}  tris ${(r.tris / 1000).toFixed(0).padStart(5)}k  terrain nodes ${r.nodes}`);
  }
}
await browser.close();
