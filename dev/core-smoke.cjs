// Full-game smoke test: autostart a new game headlessly, report console errors, screenshots and stats.
const { chromium } = require('playwright');
(async () => {
  const port = process.argv[2] || 5198;
  const seconds = +(process.argv[3] || 20);
  const b = await chromium.launch({ args: ['--enable-unsafe-swiftshader', '--use-gl=angle', '--use-angle=swiftshader', '--autoplay-policy=no-user-gesture-required'] });
  const p = await b.newPage({ viewport: { width: 1280, height: 720 } });
  const errors = [];
  p.on('console', (m) => { if (m.type() === 'error' || m.type() === 'warning') { const t = m.text(); errors.push(m.type() + ': ' + t.slice(0, 500)); } });
  p.on('pageerror', (e) => errors.push('pageerror: ' + e.message + '\n' + (e.stack || '').split('\n').slice(0, 6).join('\n')));
  const t0 = Date.now();
  await p.goto(`http://localhost:${port}/?autostart=1&test=1&seed=${process.argv[4] || 'millbrook'}`);
  try {
    await p.waitForFunction(() => window.game && window.game.state === 'playing', null, { timeout: 240000 });
  } catch (e) {
    console.log('did not reach playing state:', await p.evaluate(() => window.game && window.game.state));
    console.log([...new Set(errors)].slice(0, 20).join('\n'));
    await b.close(); return;
  }
  console.log('load time', ((Date.now() - t0) / 1000).toFixed(1) + 's');
  await p.waitForTimeout(3000);
  await p.screenshot({ path: 'dev/out/smoke-1.png' });
  const stats = await p.evaluate(() => {
    const g = window.game;
    return {
      state: g.state, pos: [g.player.x.toFixed(1), g.player.y.toFixed(1), g.player.z.toFixed(1)], loc: g.location, time: g.time.hour + ':' + g.time.minute,
      zombies: g.zombies?.zombies.length, sections: g.chunks?.stats.sections, fps: g.fps.toFixed(1), health: g.player.health,
      inv: g.player.inv.hotbar.filter(Boolean).map((s) => s.id).concat(g.player.inv.equipment.filter(Boolean).map((s) => s.id)),
    };
  });
  console.log(JSON.stringify(stats));
  // walk forward a bit
  await p.keyboard.down('KeyW');
  await p.waitForTimeout(seconds * 500);
  await p.keyboard.up('KeyW');
  await p.mouse.move(640, 360); await p.mouse.move(900, 360);
  await p.waitForTimeout(seconds * 500);
  await p.screenshot({ path: 'dev/out/smoke-2.png', timeout: 120000 }).catch((e) => console.log('shot2 failed', e.message.split('\n')[0]));
  const stats2 = await p.evaluate(() => { const g = window.game; return { pos: [g.player.x.toFixed(1), g.player.y.toFixed(1), g.player.z.toFixed(1)], zombies: g.zombies?.zombies.length, chasing: g.zombies?.zombies.filter((z) => z.state === 'chase').length, fps: g.fps.toFixed(1), health: g.player.health.toFixed(1), perf: g.perf, draws: g.renderer.renderer.info.render.calls, tris: g.renderer.renderer.info.render.triangles }; });
  console.log(JSON.stringify(stats2));
  const uniq = [...new Set(errors)];
  console.log('errors (' + uniq.length + '):\n' + uniq.slice(0, 30).join('\n'));
  await b.close();
})();
