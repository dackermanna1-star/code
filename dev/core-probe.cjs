const { chromium } = require('playwright');
(async () => {
  const b = await chromium.launch({ args: ['--enable-unsafe-swiftshader', '--use-gl=angle', '--use-angle=swiftshader'] });
  const p = await b.newPage({ viewport: { width: 1280, height: 720 } });
  p.on('pageerror', (e) => console.log('pageerror: ' + e.message + '\n' + (e.stack || '').split('\n').slice(0, 8).join('\n')));
  p.on('console', (m) => { if (m.type() === 'error') console.log('console.error', m.text().slice(0, 600)); });
  await p.goto('http://localhost:5198/?autostart=1&test=1&seed=millbrook');
  await p.waitForFunction(() => window.game && window.game.state === 'playing', null, { timeout: 240000 });
  for (let i = 0; i < 5; i++) {
    await p.waitForTimeout(1000);
    console.log(await p.evaluate(() => { const g = window.game; return JSON.stringify({ state: g.state, hasPlayer: !!g.player, keys: g.player ? Object.keys(g.player).length : 0, perf: g.perf, dead: g.player?.dead, cause: g.player?.deathCause }); }));
  }
  await b.close();
})();
