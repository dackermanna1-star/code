// Headless screenshot / smoke tool.
// node tools/shot.mjs <page-path> <out.png> [--w=960] [--h=540] [--wait=15000] [--eval="js"] [--delay=0]
//   page-path: repo-relative (e.g. tools/preview/tiles.html or index.html) or file:///abs/path.html
//   Waits until window.__ready === true (or --wait ms), optionally awaits --eval, then screenshots.
//   Prints console output; exits 1 on page errors.
import { chromium } from '/opt/node22/lib/node_modules/playwright/index.mjs';
import { startServer } from './serve.mjs';

const args = Object.fromEntries(process.argv.slice(4).map((a) => {
  const m = a.match(/^--([^=]+)=?(.*)$/); return m ? [m[1], m[2]] : [a, true];
}));
const [page, out] = process.argv.slice(2);
if (!page || !out) { console.error('usage: node tools/shot.mjs <page> <out.png> [--w --h --wait --eval --delay]'); process.exit(2); }
const W = Number(args.w || 960), H = Number(args.h || 540), WAIT = Number(args.wait || 15000);

const srv = page.startsWith('file://') ? null : await startServer(0);
const url = srv ? `http://127.0.0.1:${srv.port}/${page.replace(/^\//, '')}` : page;
const browser = await chromium.launch({ args: ['--autoplay-policy=no-user-gesture-required'] });
const p = await browser.newPage({ viewport: { width: W, height: H } });
let errors = 0;
p.on('console', (m) => { const t = m.type(); if (t === 'error') errors++; console.log(`[${t}] ${m.text()}`); });
p.on('pageerror', (e) => { errors++; console.log(`[pageerror] ${e.message}\n${e.stack || ''}`); });
await p.goto(url);
try { await p.waitForFunction(() => window.__ready === true, null, { timeout: WAIT }); }
catch { console.log(`[shot] window.__ready not set within ${WAIT}ms — screenshotting anyway`); }
if (args.eval) { const r = await p.evaluate(`(async () => { ${args.eval} })()`); if (r !== undefined) console.log('[eval]', JSON.stringify(r)); }
if (args.delay) await p.waitForTimeout(Number(args.delay));
await p.screenshot({ path: out });
console.log(`[shot] wrote ${out}${errors ? ` (${errors} errors)` : ''}`);
await browser.close(); srv?.close();
process.exit(errors ? 1 : 0);
