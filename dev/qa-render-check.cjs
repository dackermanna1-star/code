// Render QA regression pass: street-level scenes across time of day / weather (screenshots), movement
// tests (stairs, slabs, sneak edge, ladders, falls, swim-out, doors, fences), a frame-cost profile and
// audio voice counts. Usage: node dev/qa-render-check.cjs [port=5305]  -> dev/out/qa-render-final-*.png
// The in-page snippets live in dev/qa-render-snip-*.js (also usable through dev/qa-render-repl.cjs).
const { chromium } = require('playwright');
const fs = require('fs');
const path = require('path');
const port = process.argv[2] || 5305;
const snip = (n) => fs.readFileSync(path.join(__dirname, `qa-render-snip-${n}.js`), 'utf8');
(async () => {
  const b = await chromium.launch({ args: ['--enable-unsafe-swiftshader', '--use-gl=angle', '--use-angle=swiftshader', '--autoplay-policy=no-user-gesture-required'] });
  const p = await b.newPage({ viewport: { width: 1280, height: 720 } });
  const errors = [];
  p.on('console', (m) => { if ((m.type() === 'error' || m.type() === 'warning') && !/403/.test(m.text())) errors.push(m.type() + ': ' + m.text().slice(0, 300)); });
  p.on('pageerror', (e) => errors.push('pageerror: ' + e.message));
  await p.goto(`http://localhost:${port}/?autostart=1&test=1&seed=${process.env.SEED || 'millbrook'}`);
  await p.waitForFunction(() => window.game && window.game.state === 'playing', null, { timeout: 300000 });
  const run = async (src) => JSON.parse(await p.evaluate(async (s) => {
    const g = window.game;
    const r = await new Function('g', 'return (async () => {' + s + '\n})()')(g);
    return JSON.stringify(r ?? null);
  }, src));
  // helpers (same as the REPL harness)
  await p.evaluate(() => {
    const g = window.game, P = g.player, orig = P.updateMovement.bind(P);
    P.updateMovement = (dt, input, ctx) => (P.flying ? ((P.vy = P.vx = P.vz = 0), {}) : orig(dt, input, ctx));
    g.survival.hurt = ((h) => (a, c, s) => (g.__god ? undefined : h.call(g.survival, a, c, s)))(g.survival.hurt);
    g.__god = true;
    window.__qa = {
      tp(x, y, z, yaw = 0, pitch = -0.1, fly = false) { Object.assign(P, { x, y, z, vx: 0, vy: 0, vz: 0, yaw, pitch, flying: fly }); },
      time(h) { g.time = g.computeTime(Math.floor(g.time.totalHours / 24) * 24 + h); },
      day(d, h) { g.time = g.computeTime((d - 1) * 24 + h); },
      weather(w) { g.weatherSys.set(w, true); g.weatherSys.nextChange = 999; },
      ground(x, z) { return g.world.surfaceY(Math.floor(x), Math.floor(z)); },
      frames(n) { return new Promise((res) => { let k = 0; const f = () => (++k >= n ? res() : requestAnimationFrame(f)); requestAnimationFrame(f); }); },
    };
  });
  await run(snip('setup'));
  const out = { scenes: {} };
  const scenes = [
    ['noon', { x: 470, z: 512, y: 21, yaw: -1.57, pitch: -0.1, h: 12.5 }],
    ['dawn', { x: 497, z: 516, y: 21, yaw: 0, h: 6.3 }],
    ['sunset', { x: 497, z: 516, y: 21, yaw: 1.57, pitch: 0.05, h: 19.1 }],
    ['blue-hour', { x: 497, z: 516, y: 21, yaw: 0, h: 20 }],
    ['night-fullmoon', { x: 497, z: 516, y: 21, yaw: 0, h: 23.5, day: 1 }],
    ['night-newmoon', { x: 497, z: 516, y: 21, yaw: 0, h: 23.5, day: 6 }],
    ['night-flashlight', { x: 497, z: 516, y: 21, yaw: 0, h: 23.5, day: 1, flash: true }],
    ['overcast', { x: 497, z: 516, y: 21, yaw: 0.3, h: 15, weather: 'overcast' }],
    ['fog', { x: 497, z: 516, y: 21, yaw: 1.57, pitch: 0.02, h: 9, weather: 'fog' }],
    ['rain', { x: 497, z: 516, y: 21, yaw: 0.3, h: 14, weather: 'rain', wet: 1 }],
    ['interior-day', { x: 497, z: 349, y: 21, yaw: 1.2, pitch: -0.4, h: 13, wet: 0 }],
    ['interior-night', { x: 497, z: 349, y: 21, yaw: 1.2, pitch: -0.4, h: 23, day: 1 }],
    ['suburb', { x: 507, z: 337, y: 21, yaw: 0.9, pitch: 0.2, h: 16 }],
    ['lake', { x: 200, z: 210, yaw: 0.2, pitch: -0.1, h: 7.5 }],
    ['underwater', { x: 240, z: 188, y: 13, yaw: -1.2, pitch: 0.15, h: 12, fly: true }],
  ];
  for (const [name, s] of scenes) {
    s.wait = 5000;
    const r = await run(`const r = await window.__qa.scene(${JSON.stringify(s)}); const e = g.renderer.readExposure(); return { exposure: +e.exposure.toFixed(2), avgLum: +e.avgLum.toFixed(4) };`);
    out.scenes[name] = r;
    await p.screenshot({ path: `dev/out/qa-render-final-${name}.png`, timeout: 120000 });
    console.log('scene', name, JSON.stringify(r));
  }
  out.move = await run(snip('move'));
  out.swim = await run(snip('swim'));
  out.doors = await run(snip('doors'));
  out.mesh = await run(snip('meshbench'));
  await run('await window.__qa.scene({ x: 497, z: 516, y: 21, yaw: 0, h: 12, wait: 3000 }); return 1;');
  out.prof = await run(snip('prof'));
  out.audio = await run('g.audio.init(); await new Promise((r) => setTimeout(r, 6000)); const s = g.audio.debugStats(); return { state: s.state, voices: s.voices, loops: s.loops, rendered: s.rendered + "/" + s.total, failed: s.failed, music: s.music };');
  out.errors = errors;
  fs.writeFileSync('dev/out/qa-render-final.json', JSON.stringify(out, null, 1));
  console.log(JSON.stringify({ move: out.move, swim: { fwd: out.swim.swimFwd.end, fwdJump: out.swim.swimFwdJump.end }, doors: out.doors.R, mesh: out.mesh, prof: out.prof.T, audio: out.audio, errors }, null, 1));
  await b.close();
})();
