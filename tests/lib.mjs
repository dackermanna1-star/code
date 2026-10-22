// Shared test harness: serves the repo, launches headless Chromium, opens the dev page or the
// built single file, collects errors and wraps the window.__HW debug API (TECH §14).
//
// Environment:
//   HW_SHOTS=<dir>   where screenshots go (default: <os tmp>/hallowell-shots)
//   HW_STUBS=1       engine isolation: serve the committed (git HEAD) versions of the art / UI /
//                    audio / lighting / FX modules instead of the working tree, for the dev page
//                    and for a separately built stub bundle. Useful while those modules are
//                    mid-rewrite; the default tests the real tree.
import { chromium } from '/opt/node22/lib/node_modules/playwright/index.mjs';
import { execFileSync } from 'node:child_process';
import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import { startServer, ROOT, fontsCss } from '../tools/serve.mjs';

export const SHOTS = process.env.HW_SHOTS || path.join(os.tmpdir(), 'hallowell-shots');
export const STUBS = process.env.HW_STUBS === '1';
export const DIST = path.join(ROOT, 'dist/hallowell.html');
fs.mkdirSync(SHOTS, { recursive: true });

// Modules owned by other subsystems (swapped for their HEAD versions in HW_STUBS mode).
const FOREIGN = /^src\/(art\/(?!index\.js$|palette\.js$|util\.js$)[^/]+\.js|ui\/.+\.js|audio\/.+\.js|render\/(lighting|fx)\.js)$/;
const headCache = new Map();
function headVersion(rel) {
  if (!headCache.has(rel)) {
    let src = null;
    try {
      src = execFileSync('git', ['show', `HEAD:${rel}`], { cwd: ROOT, encoding: 'utf8', stdio: ['ignore', 'pipe', 'ignore'] });
    } catch { /* not committed */ }
    headCache.set(rel, src);
  }
  return headCache.get(rel);
}

/** Build dist-like single file from the HEAD stubs (HW_STUBS mode only). */
let stubBuildPath = null;
async function stubBuild() {
  if (stubBuildPath) return stubBuildPath;
  const esbuild = await import('esbuild');
  const plugin = {
    name: 'head-stubs',
    setup(b) {
      b.onLoad({ filter: /[\\/]src[\\/].*\.js$/ }, (args) => {
        const rel = path.relative(ROOT, args.path).split(path.sep).join('/');
        if (!FOREIGN.test(rel)) return undefined;
        const src = headVersion(rel);
        if (src === null) return undefined;
        return { contents: src, loader: 'js', resolveDir: path.dirname(args.path) };
      });
    },
  };
  const result = await esbuild.build({
    entryPoints: [path.join(ROOT, 'src/main.js')], bundle: true, format: 'iife', write: false, target: 'es2020',
    logLevel: 'warning', define: { 'globalThis.__HW_BUILD__': 'true' }, plugins: [plugin],
  });
  const js = result.outputFiles[0].text.replace(/<\/script/gi, '<\\/script');
  const html = `<!doctype html><html><head><meta charset="utf-8"><style>${fontsCss({ inline: true })}
html,body{margin:0;height:100%;background:#000;overflow:hidden}canvas#screen{display:block;width:100vw;height:100vh;image-rendering:pixelated;outline:none}</style></head>
<body><canvas id="screen" tabindex="0"></canvas><script>${js}</script></body></html>`;
  stubBuildPath = path.join(SHOTS, 'hallowell-stubs.html');
  fs.writeFileSync(stubBuildPath, html);
  return stubBuildPath;
}

export async function launch() {
  return chromium.launch({ args: ['--autoplay-policy=no-user-gesture-required'] });
}

/**
 * Open the game. built=false → dev server + index.html; built=true → file://dist/hallowell.html?debug=1.
 * Resolves once window.__ready is true. Returns a Game wrapper.
 */
export async function openGame(browser, { built = false, width = 960, height = 540, timeout = 30000 } = {}) {
  const page = await browser.newPage({ viewport: { width, height } });
  const errors = [];
  page.on('pageerror', (e) => errors.push(`pageerror: ${e.message}`));
  page.on('console', (m) => {
    if (m.type() === 'error') errors.push(`console.error: ${m.text()}`);
  });
  let srv = null;
  let url;
  if (built) {
    const file = STUBS ? await stubBuild() : DIST;
    if (!fs.existsSync(file)) throw new Error(`${file} not found — run npm run build first`);
    // The shipped build only exposes window.__HW (and the F3 overlay) with ?debug in the URL.
    url = `file://${file}?debug=1`;
  } else {
    srv = await startServer(0);
    url = `http://127.0.0.1:${srv.port}/index.html`;
    if (STUBS) {
      await page.route('**/src/**', (route) => {
        const rel = decodeURIComponent(new URL(route.request().url()).pathname).replace(/^\//, '');
        const src = FOREIGN.test(rel) ? headVersion(rel) : null;
        if (src === null) return route.continue();
        return route.fulfill({ status: 200, contentType: 'text/javascript; charset=utf-8', body: src });
      });
    }
  }
  await page.goto(url);
  await page.waitForFunction(() => window.__ready === true, null, { timeout });
  return new Game(page, errors, srv);
}

export class Game {
  constructor(page, errors, srv) {
    this.page = page;
    this.pageErrors = errors;
    this.srv = srv;
  }

  /** Evaluate a function in the page: fn receives (__HW, ...args). */
  hw(fn, ...args) {
    return this.page.evaluate(([src, a]) => {
      // eslint-disable-next-line no-new-func
      const f = new Function(`return (${src})`)();
      return f(window.__HW, ...a);
    }, [fn.toString(), args]);
  }

  /** New game straight into the test map, dialogue auto-advancing. */
  async newTestGame({ timeScale = 1 } = {}) {
    await this.hw(async (H, ts) => {
      H.autoAdvance(true);
      H.timeScale(ts);
      await H.newGame({ skipIntro: true });
      await H.teleport('test', 'start');
    }, timeScale);
  }

  state() { return this.hw((H) => H.state()); }
  player() { return this.hw((H) => H.player()); }
  mode() { return this.hw((H) => H.mode()); }
  map() { return this.hw((H) => H.map()); }
  prop(id) { return this.hw((H, i) => H.prop(i), id); }
  teleport(map, a, b) { return this.hw((H, m, x, y) => H.teleport(m, x, y), map, a, b); }
  walkTo(target, opts) { return this.hw((H, t, o) => H.walkTo(t, o), target, opts || {}); }
  interact() { return this.hw((H) => H.interact()); }
  idle() { return this.hw((H) => H.idle()); }
  face(dir) { return this.hw((H, d) => H.face(d), dir); }
  press(action, ms) { return this.hw((H, a, t) => H.press(a, t), action, ms); }
  steps(n) { return this.hw((H, k) => H.steps(k), n); }
  /** Errors captured in-page (window.onerror, rejections, console.error) + page errors. */
  async errors() {
    const inPage = await this.hw((H) => H.errors.slice());
    return [...new Set([...inPage, ...this.pageErrors.filter((e) => !inPage.some((x) => e.includes(x.slice(0, 60))))])];
  }

  async shot(name) {
    const file = path.join(SHOTS, `${name}.png`);
    await this.page.screenshot({ path: file });
    return file;
  }

  async close() {
    await this.page.close();
    this.srv?.close();
  }
}

// ---- tiny assertion runner ---------------------------------------------------------------------
export function suite(name) {
  const results = [];
  const t0 = Date.now();
  return {
    ok(cond, msg, detail) {
      results.push({ ok: !!cond, msg, detail });
      console.log(`${cond ? '  ok  ' : '  FAIL'} ${msg}${!cond && detail !== undefined ? ` — ${typeof detail === 'string' ? detail : JSON.stringify(detail)}` : ''}`);
      return !!cond;
    },
    eq(a, b, msg) {
      const same = JSON.stringify(a) === JSON.stringify(b);
      return this.ok(same, msg, same ? undefined : `got ${JSON.stringify(a)}, expected ${JSON.stringify(b)}`);
    },
    async step(label, fn) {
      try {
        await fn();
      } catch (e) {
        this.ok(false, `${label} threw`, e?.stack || String(e));
      }
    },
    done() {
      const failed = results.filter((r) => !r.ok);
      console.log(`\n${name}: ${results.length - failed.length}/${results.length} passed in ${((Date.now() - t0) / 1000).toFixed(1)}s${STUBS ? ' (HW_STUBS)' : ''}`);
      return failed.length === 0;
    },
  };
}
