// End-to-end smoke test: loads the built app in headless Chromium, checks that
// every prop spawns and rests without breaking, then hits each one and checks
// that the destruction system responds.
//
//   npm run build && npm run test:e2e
//
// Needs Playwright (`npm i -D playwright && npx playwright install chromium`)
// unless it is already available on the machine.
import http from 'node:http';
import { readFile } from 'node:fs/promises';
import { extname, join, normalize } from 'node:path';
import { fileURLToPath } from 'node:url';
import { createRequire } from 'node:module';

const root = join(fileURLToPath(new URL('.', import.meta.url)), '..', 'dist');
const TYPES = { '.html': 'text/html', '.js': 'text/javascript', '.css': 'text/css', '.wasm': 'application/wasm', '.png': 'image/png' };

const server = http.createServer(async (req, res) => {
  try {
    const path = normalize(decodeURIComponent(new URL(req.url, 'http://x').pathname)).replace(/^([/\\])+/, '');
    const file = join(root, path || 'index.html');
    if (!file.startsWith(root)) throw new Error('outside root');
    const data = await readFile(file);
    res.writeHead(200, { 'content-type': TYPES[extname(file)] || 'application/octet-stream' });
    res.end(data);
  } catch {
    res.writeHead(404);
    res.end('not found');
  }
});

let chromium;
try {
  ({ chromium } = await import('playwright'));
} catch {
  try {
    // a globally installed Playwright is only visible to CommonJS resolution
    ({ chromium } = createRequire(import.meta.url)('playwright'));
  } catch {
    console.error('Playwright is not installed. Run: npm i -D playwright && npx playwright install chromium');
    process.exit(2);
  }
}

await new Promise((r) => server.listen(0, '127.0.0.1', r));
const url = `http://127.0.0.1:${server.address().port}/?gfx=low&manual=1&empty=1&shadows=off`;
const browser = await chromium.launch({ args: ['--use-gl=angle', '--use-angle=swiftshader', '--enable-unsafe-swiftshader', '--ignore-gpu-blocklist'] });
const page = await browser.newPage({ viewport: { width: 900, height: 600 } });
const errors = [];
page.on('pageerror', (e) => errors.push('pageerror: ' + e.message));
page.on('console', (m) => {
  if (m.type() === 'error') errors.push('console: ' + m.text());
});

let failed = 0;
const check = (ok, label, detail = '') => {
  console.log(`${ok ? '  ok  ' : 'FAIL  '}${label}${detail ? '  ' + detail : ''}`);
  if (!ok) failed++;
};

try {
  await page.goto(url, { waitUntil: 'load' });
  await page.waitForFunction(() => document.getElementById('loading').classList.contains('done'), null, { timeout: 120000 });
  check(true, 'app boots');

  const props = ['window', 'laptop', 'desk', 'tv', 'door', 'bookshelf', 'chair', 'vase', 'washer', 'cabinet'];
  // [aim height, ball speed, must it visibly break?]
  const shots = { window: [0.8, 20, true], laptop: [0.1, 12, true], desk: [0.95, 22, true], tv: [0.6, 20, true], door: [1.5, 30, false], bookshelf: [1.1, 25, false], chair: [0.6, 20, false], vase: [0.3, 12, true], washer: [0.45, 30, true], cabinet: [0.6, 25, true] };

  for (const type of props) {
    const r = await page.evaluate(
      ({ type, h, speed }) => {
        const a = window.__lab, sim = a.sim;
        const V = (x, y, z) => new a.rig.target.constructor(x, y, z);
        sim.clearAll();
        a.fx.clear();
        const fr0 = sim.stats.fractures;
        const prop = a.spawn(type, V(0, 0, 0), 0);
        const bodies0 = prop.asms.size, chunks0 = prop.chunks.size;
        // 1. at rest: wake everything and let it settle
        a.advance(0.2);
        sim.wakeAll();
        const start = [...prop.asms].map((x) => [x, sim.asmComWorld(x, V(0, 0, 0)).clone()]);
        a.advance(2.5);
        let drift = 0;
        for (const [x, p] of start) if (!x.removed) drift = Math.max(drift, sim.asmComWorld(x, V(0, 0, 0)).distanceTo(p));
        const restFractures = sim.stats.fractures - fr0;
        const restBodies = sim.stats.bodies;
        // 2. impact
        a.launch('bowling', V(0.05, h, 4), V(0, 0, -1), speed);
        a.advance(2.0);
        a.renderOnce();
        return { bodies0, chunks0, drift, restFractures, restBodies, bodies: sim.stats.bodies, fractures: sim.stats.fractures - fr0 - restFractures, joints: sim.joints.size };
      },
      { type, h: shots[type][0], speed: shots[type][1] }
    );
    check(r.chunks0 > 5, `${type}: spawns`, `${r.bodies0} bodies, ${r.chunks0} parts`);
    check(r.restFractures === 0 && r.restBodies === r.bodies0, `${type}: stable at rest`, `drift ${r.drift.toFixed(3)} m`);
    check(r.drift < 0.05, `${type}: does not creep`, '');
    const broke = r.fractures > 0 || r.bodies > r.bodies0 + 1;
    check(broke || !shots[type][2], `${type}: reacts to a bowling ball`, `${r.fractures} fractures, ${r.bodies} bodies afterwards`);
  }

  // tools
  const tools = await page.evaluate(() => {
    const a = window.__lab, sim = a.sim;
    const V = (x, y, z) => new a.rig.target.constructor(x, y, z);
    sim.clearAll();
    a.spawn('door', V(0, 0, 0), 0);
    a.spawn('vase', V(1.5, 0, 0), 0);
    a.advance(0.2);
    const hit = sim.raycast(V(0.2, 1.5, 3), V(0, 0, -1), 50);
    const before = sim.stats.bodies;
    sim.toolImpact(hit.chunk, hit.point, V(0, 0, -1), 300);
    a.advance(0.5);
    const afterHammer = sim.stats.bodies;
    sim.explode(V(1.5, 0.3, 0.6), 600, 4.5);
    a.advance(1);
    return { part: hit.chunk.name, before, afterHammer, afterBomb: sim.stats.bodies };
  });
  check(tools.afterHammer > tools.before, 'sledgehammer breaks a door panel', `hit ${tools.part}: ${tools.before} -> ${tools.afterHammer} bodies`);
  check(tools.afterBomb > tools.afterHammer + 10, 'explosive shatters the vase', `${tools.afterBomb} bodies`);

  check(errors.length === 0, 'no console errors', errors.slice(0, 5).join(' | '));
} catch (e) {
  check(false, 'test run', String(e && e.message ? e.message : e));
} finally {
  await browser.close();
  server.close();
}
console.log(failed ? `\n${failed} check(s) failed` : '\nall checks passed');
process.exit(failed ? 1 : 0);
