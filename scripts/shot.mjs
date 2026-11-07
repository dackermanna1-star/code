// Headless screenshot / smoke-test harness (development only).
//
//   node scripts/shot.mjs --out shots/cruise.png --query "phase=cruise&seat=16A&look=90,-5"
//   node scripts/shot.mjs --out a.png --query "pos=0,1.66,-3&look=0,0" --eval "__app.flight.skipTo('cruise')" --frames 40
//   node scripts/shot.mjs --batch shots.json        // [{ "out": "...", "query": "...", "eval": "...", "frames": 30 }]
//
// Always adds autostart=1&shot=1&mute=1 and (unless given) quality=low.
// Prints a JSON report with console errors, warnings and timings.
import { createRequire } from 'node:module';
import { spawn } from 'node:child_process';
import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

const require = createRequire(import.meta.url);
let playwright;
try { playwright = require('playwright'); } catch { playwright = require('/usr/local/lib/node_modules/playwright'); }
const { chromium } = playwright;

const root = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..');
const args = process.argv.slice(2);
const opt = (k, d) => { const i = args.indexOf(`--${k}`); return i >= 0 ? args[i + 1] : d; };
const flag = (k) => args.includes(`--${k}`);

let jobs;
if (opt('batch')) jobs = JSON.parse(fs.readFileSync(opt('batch'), 'utf8'));
else jobs = [{ out: opt('out', 'shot.png'), query: opt('query', ''), eval: opt('eval'), frames: Number(opt('frames', 20)), wait: Number(opt('wait', 0)) }];
const width = Number(opt('width', 1280)), height = Number(opt('height', 720));
const timeout = Number(opt('timeout', 180000));

const port = 20000 + Math.floor(Math.random() * 20000);
const server = spawn(process.execPath, [path.join(root, 'scripts/serve.mjs'), String(port)], { stdio: 'ignore' });
await new Promise((r) => setTimeout(r, 400));

const browser = await chromium.launch({ args: ['--use-angle=swiftshader', '--enable-unsafe-swiftshader', '--ignore-gpu-blocklist', '--autoplay-policy=no-user-gesture-required'] });
const report = [];
try {
  for (const job of jobs) {
    const page = await browser.newPage({ viewport: { width, height } });
    const errors = [], warnings = [], logs = [];
    page.on('console', (m) => {
      const t = m.type(), text = m.text();
      if (t === 'error') errors.push(text); else if (t === 'warning') warnings.push(text); else if (flag('logs')) logs.push(text);
    });
    page.on('pageerror', (e) => errors.push(`pageerror: ${e.message}\n${e.stack || ''}`));
    page.on('requestfailed', (r) => errors.push(`requestfailed: ${r.url()} ${r.failure()?.errorText || ''}`));
    let q = job.query || '';
    if (!/quality=/.test(q)) q += (q ? '&' : '') + 'quality=low';
    q += `&autostart=1&shot=1&mute=1&frames=${job.frames || 20}`;
    const url = `http://localhost:${port}/?${q}`;
    const t0 = Date.now();
    await page.goto(url, { waitUntil: 'load', timeout });
    await page.waitForFunction(() => window.__shotReady === true, null, { timeout, polling: 250 });
    const tReady = Date.now() - t0;
    if (job.eval) {
      await page.evaluate(job.eval);
      const f0 = await page.evaluate(() => window.__app.frame);
      await page.waitForFunction((f) => window.__app.frame >= f + (window.__evalFrames || 15), f0, { timeout, polling: 200 });
    }
    if (job.wait) await page.waitForTimeout(job.wait);
    const info = await page.evaluate(() => {
      const a = window.__app;
      const st = a.flight && a.flight.state;
      return {
        frame: a.frame, time: a.time.toFixed(2), quality: a.qualityName,
        phase: st && st.phase, alt: st && Math.round(st.altitude), spd: st && Math.round(st.groundSpeed),
        moduleErrors: Object.keys(a.moduleErrors || {}),
        drawCalls: a.renderer.info.render.calls, triangles: a.renderer.info.render.triangles,
        textures: a.renderer.info.memory.textures, geometries: a.renderer.info.memory.geometries,
        camera: a.camera.position.toArray().map((v) => +v.toFixed(2)),
      };
    });
    fs.mkdirSync(path.dirname(path.resolve(job.out)), { recursive: true });
    await page.screenshot({ path: job.out });
    report.push({ out: job.out, url, readyMs: tReady, ...info, errors: errors.slice(0, 30), warnings: warnings.slice(0, 15), logs: logs.slice(0, 40) });
    await page.close();
  }
} catch (e) {
  report.push({ fatal: String(e && e.stack || e) });
} finally {
  await browser.close();
  server.kill();
}
console.log(JSON.stringify(report, null, 2));
