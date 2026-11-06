const { chromium } = require('playwright');
(async () => {
  const b = await chromium.launch({ args: ['--enable-unsafe-swiftshader', '--use-gl=angle', '--use-angle=swiftshader'] });
  const p = await b.newPage({ viewport: { width: 960, height: 540 } });
  await p.goto('http://localhost:5198/?autostart=1&test=1&seed=millbrook');
  await p.waitForFunction(() => window.game && window.game.state === 'playing', null, { timeout: 240000 });
  await p.evaluate(() => { const g = window.game; g.weatherSys.set('clear', true); g.time = g.computeTime(10); });
  await p.waitForTimeout(1500);
  console.log(await p.evaluate(async () => {
    const m = await import('/src/render/materials.js');
    const G = m.globalUniforms, g = window.game;
    return JSON.stringify({ fog: G.uFogDensity.value, fogCol: G.uFogColor.value, amb: G.uAmbientColor.value, sun: G.uSunColor.value, weather: g.weatherSys.type, params: g.weatherSys.params, radius: g.chunks.radius, exposure: g.renderer.post.uExposure.value });
  }));
  await b.close();
})();
