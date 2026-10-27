// Debug probe: node tests/e2e/probe.mjs '<setup js>' <waitMs> '<expression js returning JSON-able>' [w h]
// Helpers available inside expressions: app, R (renderer), P (pipeline), h2f(half), read(rt, x, y, w, h) → Float32 RGBA rows
import { createRequire } from 'module';
const require = createRequire(import.meta.url);
const { chromium } = require('playwright');
const [setup = '', wait = '5000', expr = 'null', w = '320', h = '180'] = process.argv.slice(2);
const browser = await chromium.launch({ args: ['--use-gl=angle', '--use-angle=swiftshader', '--enable-unsafe-swiftshader'] });
const page = await browser.newPage({ viewport: { width: +w, height: +h } });
page.on('pageerror', (e) => console.log('[pageerror]', e.message));
page.on('console', (m) => { if (m.type() === 'error') console.log('[error]', m.text().slice(0, 300)); });
await page.goto(process.env.COSMOS_URL || 'http://localhost:5173/');
await page.waitForFunction(() => !!window.__cosmos, null, { timeout: 60000 });
await page.evaluate(`(async () => { const app = window.__cosmos; ${setup} })()`);
await page.waitForTimeout(+wait);
const out = await page.evaluate(`(() => {
  const app = window.__cosmos, R = app.renderer, P = R.pipeline;
  const h2f = (h) => { const s = (h & 0x8000) ? -1 : 1, e = (h >> 10) & 31, m = h & 1023; if (e === 0) return s * m * Math.pow(2, -24); if (e === 31) return m ? NaN : s * Infinity; return s * Math.pow(2, e - 15) * (1 + m / 1024); };
  const gl = R.renderer.getContext();
  const read = (rt, x, y, W = 1, H = 1) => { gl.bindBuffer(gl.PIXEL_PACK_BUFFER, null); const b = new Uint16Array(W * H * 4); R.renderer.readRenderTargetPixels(rt, x, y, W, H, b); return Array.from(b).map(h2f); };
  return JSON.stringify(${expr});
})()`);
console.log(out);
await browser.close();
