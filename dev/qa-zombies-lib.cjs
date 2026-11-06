// Shared Playwright helpers for the zombie QA scripts (dev/qa-zombies-*.cjs).
const { chromium } = require('playwright');

async function boot({ port = 5302, seed = 'millbrook', viewport = { width: 1280, height: 720 } } = {}) {
  const browser = await chromium.launch({ args: ['--enable-unsafe-swiftshader', '--use-gl=angle', '--use-angle=swiftshader', '--autoplay-policy=no-user-gesture-required'] });
  const page = await browser.newPage({ viewport });
  const errors = [];
  page.on('console', (m) => { if (m.type() === 'error' || m.type() === 'warning') errors.push(m.type() + ': ' + m.text().slice(0, 400)); });
  page.on('pageerror', (e) => errors.push('pageerror: ' + e.message + ' @ ' + (e.stack || '').split('\n').slice(1, 4).join(' | ')));
  await page.goto(`http://localhost:${port}/?autostart=1&test=1&seed=${seed}`);
  await page.waitForFunction(() => window.game && window.game.state === 'playing', null, { timeout: 300000 });
  const ev = (fn, arg) => page.evaluate(fn, arg);
  // install in-page helpers
  await ev(() => {
    const g = window.game;
    window.qa = {
      // instrument zombie update timing
      zt: { sum: 0, n: 0, max: 0, last: 0 },
      tp(x, y, z, yaw = 0, pitch = 0) { const P = g.player; P.x = x; P.y = y; P.z = z; P.vx = P.vy = P.vz = 0; P.yaw = yaw; P.pitch = pitch; },
      setTime(h) { g.time = g.computeTime(Math.floor(g.time.totalHours / 24) * 24 + h); },
      god(on = true) {
        const s = g.survival;
        if (on && !s.__hurt) { s.__hurt = s.hurt; s.__zh = s.zombieHit; s.hurt = () => {}; s.zombieHit = (d, v) => { window.qa.hits = (window.qa.hits || 0) + 1; window.qa.hitDmg = (window.qa.hitDmg || 0) + d; return { blocked: true }; }; }
        if (!on && s.__hurt) { s.hurt = s.__hurt; s.zombieHit = s.__zh; delete s.__hurt; }
      },
      clear() { g.zombies.clearAll(); },
      // run the game simulation synchronously (no rendering) for `secs` of game time
      sim(secs, dt = 1 / 30, each) {
        const n = Math.round(secs / dt);
        for (let i = 0; i < n; i++) { g.update(dt); g.input.endFrame?.(); if (each && each(i * dt) === false) break; }
        g.last = performance.now();
      },
      // spawn a zombie of a variant at a position (feet y)
      z(x, y, z, variant = 'walker', o = {}) { const zb = g.zombies.spawn(x, y, z, { variant, ...o }); return zb; },
      ground(x, z, fromY = 40) {
        const w = g.world; x = Math.floor(x); z = Math.floor(z);
        for (let y = fromY; y > 1; y--) if (window.__SOLID?.[w.get(x, y - 1, z)] && !window.__SOLID?.[w.get(x, y, z)] && !window.__SOLID?.[w.get(x, y + 1, z)]) return y;
        return -1;
      },
      summary() {
        const zs = g.zombies.zombies;
        const st = {};
        for (const z of zs) { const k = z.dead ? 'dead' : z.state; st[k] = (st[k] || 0) + 1; }
        return { n: zs.length, alive: zs.filter((z) => !z.dead).length, states: st };
      },
    };
    const mgr = g.zombies;
    const orig = mgr.update.bind(mgr);
    mgr.update = (dt) => {
      const t0 = performance.now();
      orig(dt);
      const t = performance.now() - t0;
      const zt = window.qa.zt;
      zt.sum += t; zt.n++; zt.max = Math.max(zt.max, t); zt.last = t;
    };
  });
  const shot = async (name) => { await page.screenshot({ path: `dev/out/qa-zombies-${name}.png`, timeout: 120000 }).catch((e) => console.log('shot fail', name, e.message.split('\n')[0])); console.log('shot', name); };
  await ev(async () => {
    const { SOLID, B, BLOCKS } = await import('/src/world/blocks.js');
    const { lineOfSight } = await import('/src/world/raycast.js');
    window.__SOLID = SOLID; window.__los = lineOfSight; window.__B = B; window.__BLOCKS = BLOCKS;
  });
  await page.addScriptTag({ path: require('path').join(__dirname, 'qa-zombies-arena.js') });
  const settle = async (ms = 2500) => { await ev(() => { window.game.chunks.budgetMs = 60; }); await page.waitForTimeout(ms); await ev(() => { window.game.chunks.budgetMs = 6; }); };
  const report = () => { const uniq = [...new Set(errors)]; console.log('errors (' + uniq.length + '):\n' + uniq.slice(0, 40).join('\n')); };
  return { browser, page, ev, shot, settle, errors, report };
}

module.exports = { boot };
