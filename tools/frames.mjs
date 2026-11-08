// Capture a sequence of simulation frames for visual QA.
// usage: node tools/frames.mjs <outdir> <script.json>
// script: { w,h, query, steps: [ {input:[fx,fz,speed]}, {run:sec}, {cam:[x,y,z,tx,ty,tz]}, {shot:name}, {eval:"js"} ] }
import { createRequire } from 'module';
import fs from 'fs';
const require = createRequire(import.meta.url);
const { chromium } = require('playwright');
const [,, outdir, scriptPath] = process.argv;
const script = JSON.parse(fs.readFileSync(scriptPath, 'utf8'));
fs.mkdirSync(outdir, { recursive: true });
const url = (process.env.APP_URL || 'http://localhost:5173/') + '?test&' + (script.query || '');
const browser = await chromium.launch({ args: ['--use-gl=angle', '--use-angle=swiftshader', '--ignore-gpu-blocklist'] });
const page = await browser.newPage({ viewport: { width: script.w || 640, height: script.h || 800 }, deviceScaleFactor: 1 });
const logs = [];
page.on('console', (m) => { if (!m.text().includes('vite')) logs.push(m.type() + ': ' + m.text()); });
page.on('pageerror', (e) => logs.push('pageerror: ' + e.message));
await page.goto(url);
await page.waitForFunction(() => window.__ready || window.__error, null, { timeout: 120000 });
const err = await page.evaluate(() => window.__error);
if (err) { console.log('APP ERROR', err); }
let cam = null;
for (const st of script.steps) {
  if (st.input) await page.evaluate((a) => window.__test.setInput(...a), st.input);
  if (st.cam) cam = st.cam;
  if (st.camw) { cam = null; await page.evaluate((c) => window.__test.cameraWorld(...c), st.camw); }
  if (st.eval) await page.evaluate(st.eval);
  if (st.run) await page.evaluate((s) => window.__test.run(s), st.run);
  if (st.shot) {
    if (cam) await page.evaluate((c) => window.__test.camera(...c), cam);
    await page.evaluate(() => window.__test.render());
    await page.screenshot({ path: `${outdir}/${st.shot}.png` });
  }
  if (st.seq) {
    // { seq: { n, dt, prefix } } capture n frames dt apart
    for (let i = 0; i < st.seq.n; i++) {
      await page.evaluate((s) => window.__test.run(s), st.seq.dt);
      if (cam) await page.evaluate((c) => window.__test.camera(...c), cam);
      await page.evaluate(() => window.__test.render());
      await page.screenshot({ path: `${outdir}/${st.seq.prefix}${String(i).padStart(2, '0')}.png` });
      if (st.seq.plants) console.log(JSON.stringify(await page.evaluate(() => window.__test.footPlants())));
    }
  }
  if (st.log) console.log(JSON.stringify(await page.evaluate(() => window.__test.state())));
}
console.log(logs.slice(0, 20).join('\n'));
await browser.close();
