// Full-game smoke test for the Characters module: boots /?quick=1, waits for the player, checks grounding, runs,
// crouch/prone, jump, then renders TPP / FPP / ADS screenshots of the player on the real map. Reports console
// errors. Usage: node tools/characters-game.mjs [baseUrl] [outDir]
import { chromium } from 'playwright';
import fs from 'node:fs';

const base = process.argv[2] || 'http://localhost:5302';
const outDir = process.argv[3] || `${(await import('node:os')).tmpdir()}/characters-shots/game`;
fs.mkdirSync(outDir, { recursive: true });
const browser = await chromium.launch({ args: ['--use-angle=swiftshader', '--enable-unsafe-swiftshader', '--ignore-gpu-blocklist', '--enable-webgl'] });
const page = await browser.newPage({ viewport: { width: 960, height: 540 } });
const logs = [];
page.on('console', (m) => logs.push(`[${m.type()}] ${m.text()}`));
page.on('pageerror', (e) => logs.push(`[pageerror] ${e.message}\n${e.stack}`));
// Low graphics (software WebGL renders the full map very slowly): smaller buffer, no shadows / post / grass.
await page.addInitScript(() => {
  try {
    localStorage.setItem('battlegrounds.settings', JSON.stringify({
      version: 1,
      graphics: { preset: 'custom', renderScale: 0.6, shadowQuality: 0, shadowDistance: 60, viewDistance: 500, foliageDensity: 0.3, grassDistance: 15, ssao: false, bloom: false, antialias: 'none', postProcessing: false, effectsQuality: 0, textureQuality: 1, motionBlur: false, fov: 90, maxFps: 0, brightness: 1 },
    }));
  } catch { /* ignore */ }
});
const t0 = Date.now();
await page.goto(`${base}/?quick=1&debug=1&seed=7`, { waitUntil: 'load', timeout: 180000 });
await page.waitForFunction(() => !!window.__game?.ctx?.player, null, { timeout: 300000, polling: 500 });
console.log(`player after ${((Date.now() - t0) / 1000).toFixed(1)} s`);
const report = await page.evaluate(async () => {
  const g = window.__game, ctx = g.ctx, p = ctx.player;
  const realRender = ctx.engine['renderFn'];
  ctx.engine.setRenderFn(() => {}); // functional part without the (slow, software) rendering
  const wait = async (s) => {
    const t1 = ctx.engine.simTime;
    while (ctx.engine.simTime < t1 + s) await new Promise((r) => setTimeout(r, 5));
  };
  const key = (k, d) => ctx.input.simulate(k, d);
  const tap = async (k) => { key(k, true); await wait(0.05); key(k, false); await wait(0.05); };
  await wait(1.5);
  const out = { spawn: g.playerState() };
  const ground = ctx.world.getHeight(p.position.x, p.position.z);
  out.aboveTerrain = +(p.position.y - ground).toFixed(3);
  const x0 = p.position.x, z0 = p.position.z;
  key('KeyW', true);
  await wait(1.0);
  const xa = p.position.x, za = p.position.z, ta = ctx.engine.simTime;
  await wait(2.0);
  out.runSpeed = +(Math.hypot(p.position.x - xa, p.position.z - za) / (ctx.engine.simTime - ta)).toFixed(2);
  key('KeyW', false);
  out.ranTotal = +Math.hypot(p.position.x - x0, p.position.z - z0).toFixed(2);
  await wait(0.5);
  await tap('KeyC');
  await wait(0.5);
  out.crouch = p.stance;
  await tap('KeyZ');
  await wait(1.2);
  out.prone = p.stance;
  await tap('KeyZ');
  await wait(1.2);
  out.stand = p.stance;
  await tap('Space');
  await wait(1.2);
  out.afterJump = { grounded: p.isGrounded, moveState: p.moveState, health: p.health };
  out.finite = [p.position.x, p.position.y, p.position.z].every(Number.isFinite);
  ctx.engine.setRenderFn(realRender);
  return out;
});
console.log(JSON.stringify(report, null, 1));
// Rendered views (software WebGL: give each a few seconds).
const shots = [
  ['game_tpp', `g.setPerspective('tpp');`],
  ['game_fpp', `g.setPerspective('fpp');`],
  ['game_tpp_back', `g.setPerspective('tpp'); g.setLook(p.intent.yaw + Math.PI, -0.1);`],
];
for (const [name, js] of shots) {
  await page.evaluate(`(() => { const g = window.__game, p = g.ctx.player; ${js} })()`);
  await page.waitForTimeout(6000);
  await page.screenshot({ path: `${outDir}/${name}.png`, timeout: 180000 });
}
const perf = await page.evaluate(() => ({ ...window.__game.ctx.engine.stats, chars: window.__game.charPerf }));
console.log('stats', JSON.stringify(perf));
const errs = logs.filter((l) => /^\[(error|pageerror)/.test(l));
console.log(errs.length ? 'CONSOLE ERRORS:\n' + errs.slice(0, 20).join('\n') : 'no console errors');
const warns = [...new Set(logs.filter((l) => /^\[warning/.test(l)))];
if (warns.length) console.log('WARNINGS:\n' + warns.slice(0, 15).join('\n'));
await browser.close();
