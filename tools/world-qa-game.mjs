// World QA in the full game (?quick=1): the player character walks onto and off every bridge deck (no step/dip at
// the ends, no falling through), stands on the gravel shoulder, swims in an (organic) pond, and the console stays
// clean. Usage: node tools/world-qa-game.mjs [baseUrl] [outDir]
import { chromium } from 'playwright';
import { mkdirSync } from 'node:fs';

const base = process.argv[2] || 'http://localhost:5301';
const outDir = process.argv[3] || '.';
mkdirSync(outDir, { recursive: true });
const browser = await chromium.launch({ args: ['--use-angle=swiftshader', '--enable-unsafe-swiftshader', '--ignore-gpu-blocklist'] });
const page = await browser.newPage({ viewport: { width: 800, height: 450 } });
const logs = [];
page.on('console', (m) => logs.push(`[${m.type()}] ${m.text()}`));
page.on('pageerror', (e) => logs.push(`[pageerror] ${e.message}`));
const t0 = Date.now();
await page.goto(`${base}/?quick=1&debug=1`, { waitUntil: 'load', timeout: 180000 });
await page.waitForFunction(() => window.__game?.ctx?.player && window.__game.ctx.engine.frame > 10 && window.__game.ctx.physics.steps > 30, null, {
  timeout: 300000,
  polling: 500,
});
console.log(`game ready after ${((Date.now() - t0) / 1000).toFixed(1)} s`);
console.log(logs.filter((l) => l.includes('[boot]') || l.includes('[world]')).join('\n'));

let failed = 0;
const check = (name, ok, info = '') => {
  console.log(`${ok ? 'PASS' : 'FAIL'}  ${name}${info ? '  — ' + info : ''}`);
  if (!ok) failed++;
};

/** Walk the player from `from` toward `to` (run) for up to `seconds` of game time, sampling its state. */
async function walk(from, to, seconds) {
  return page.evaluate(
    async ({ from, to, seconds }) => {
      const g = window.__game, c = g.ctx, p = c.player;
      g.teleport(from.x, from.z, from.y);
      const dx = to.x - from.x, dz = to.z - from.z;
      const yaw = Math.atan2(-dx, -dz);
      const wait = (s) => new Promise((res) => { const s0 = c.engine.simTime; const t = () => (c.engine.simTime >= s0 + s ? res() : setTimeout(t, 30)); t(); });
      g.setLook(yaw, 0);
      await wait(0.4);
      const samples = [];
      c.input.simulate('KeyW', true);
      const s0 = c.engine.simTime;
      let reached = false;
      while (c.engine.simTime < s0 + seconds) {
        g.setLook(yaw, 0);
        await wait(0.1);
        samples.push({ x: p.position.x, y: p.position.y, z: p.position.z, mode: p.mode, grounded: p.isGrounded, surf: p.groundSurface });
        const along = ((p.position.x - from.x) * dx + (p.position.z - from.z) * dz) / Math.hypot(dx, dz);
        if (along >= Math.hypot(dx, dz)) {
          reached = true;
          break;
        }
      }
      c.input.simulate('KeyW', false);
      await wait(0.2);
      return { samples, reached, health: p.health };
    },
    { from, to, seconds },
  );
}

const bridges = await page.evaluate(() => window.__game.ctx.world.layout.bridges.map((b) => ({ id: b.id, kind: b.kind, a: b.a, b: b.b, deckY: b.deckY, width: b.width })));
for (const br of bridges) {
  const L = Math.hypot(br.b.x - br.a.x, br.b.z - br.a.z);
  const tx = (br.b.x - br.a.x) / L, tz = (br.b.z - br.a.z) / L;
  // start on the ramp 14 m before end a, walk onto the deck, 25 m along it; then from the deck off end b
  const from = { x: br.a.x - tx * 14, z: br.a.z - tz * 14 };
  const to = { x: br.a.x + tx * 25, z: br.a.z + tz * 25 };
  const r1 = await walk(from, to, 14);
  const fromB = { x: br.b.x - tx * 25, z: br.b.z - tz * 25, y: br.deckY + 0.05 };
  const toB = { x: br.b.x + tx * 14, z: br.b.z + tz * 14 };
  const r2 = await walk(fromB, toB, 14);
  const all = [...r1.samples, ...r2.samples];
  const lowest = Math.min(...all.filter((s) => {
    const u = (s.x - br.a.x) * tx + (s.z - br.a.z) * tz;
    return u > 2 && u < L - 2;
  }).map((s) => s.y));
  const swam = all.some((s) => s.mode === 'swim');
  check(
    `bridge ${br.id} (${br.kind}): walk on and off both deck ends`,
    r1.reached && r2.reached && !swam && lowest > br.deckY - 0.3 && r1.health >= 99 && r2.health >= 99,
    `reached ${r1.reached}/${r2.reached}, min y on deck ${lowest.toFixed(2)} (deck ${br.deckY.toFixed(2)}), swam ${swam}, hp ${r1.health}/${r2.health}`,
  );
}

// surfaces under the player: highway centre / shoulder; organic pond → swim
const surf = await page.evaluate(async () => {
  const g = window.__game, c = g.ctx, w = c.world;
  const wait = (s) => new Promise((res) => { const s0 = c.engine.simTime; const t = () => (c.engine.simTime >= s0 + s ? res() : setTimeout(t, 30)); t(); });
  const r = w.layout.roadDefs.find((x) => x.kind === 'asphalt' && x.width >= 8);
  const p = r.points[60], q = r.points[61];
  const L = Math.hypot(q.x - p.x, q.z - p.z), nx = -(q.z - p.z) / L, nz = (q.x - p.x) / L;
  const out = {};
  g.teleport(p.x, p.z);
  await wait(0.5);
  out.centre = c.player.groundSurface;
  g.teleport(p.x + nx * (r.width / 2 + 0.7), p.z + nz * (r.width / 2 + 0.7));
  await wait(0.5);
  out.shoulder = c.player.groundSurface;
  const pond = w.layout.ponds[0];
  g.teleport(pond.x, pond.z, pond.level + 0.5);
  await wait(1.5);
  out.pondMode = c.player.mode;
  out.pondY = c.player.position.y;
  out.pondLevel = pond.level;
  return out;
});
check('player ground surface: asphalt on the road, gravel on the shoulder', surf.centre === 'asphalt' && surf.shoulder === 'gravel', `${surf.centre} / ${surf.shoulder}`);
check('player swims in a pond', surf.pondMode === 'swim', `${surf.pondMode} y ${surf.pondY?.toFixed(2)} level ${surf.pondLevel?.toFixed(2)}`);

// view from the player on a bridge deck
await page.evaluate(() => {
  const g = window.__game, b = g.ctx.world.layout.bridges[1];
  const L = Math.hypot(b.b.x - b.a.x, b.b.z - b.a.z), tx = (b.b.x - b.a.x) / L, tz = (b.b.z - b.a.z) / L;
  g.teleport(b.a.x - tx * 10, b.a.z - tz * 10);
  g.setLook(Math.atan2(-tx, -tz), -0.05);
});
await page.waitForTimeout(4000);
await page.screenshot({ path: `${outDir}/game_bridge.png` });
const stats = await page.evaluate(() => ({ ...window.__game.ctx.engine.stats }));
console.log('render stats', JSON.stringify(stats));

const errs = logs.filter((l) => /^\[(error|warning|pageerror)\]/.test(l));
check('no console errors/warnings', errs.length === 0, errs.slice(0, 6).join(' | '));
await browser.close();
console.log(failed ? `${failed} check(s) FAILED` : 'ALL PASSED');
process.exit(failed ? 1 : 0);
