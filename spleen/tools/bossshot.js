// Mid-fight screenshots: node tools/bossshot.js <floor> <outPrefix> "<times e.g. 6,12,20>" "<extra query>"
// Advances the fast sim (autopilot) to each time, renders one frame, screenshots.
const { chromium } = require('playwright');
const path = require('path');
const BAB = process.env.BAB || '/tmp/claude-0/bab/babylon.js';
(async () => {
  const [floor = '1', out = '/tmp/claude-0/bs', times = '6,12,20', extra = 'god=1'] = process.argv.slice(2);
  const browser = await chromium.launch({ args: ['--use-gl=angle', '--use-angle=swiftshader', '--enable-unsafe-swiftshader'] });
  const page = await browser.newPage({ viewport: { width: 1280, height: 720 } });
  const errors = [];
  page.on('pageerror', (e) => errors.push('pageerror: ' + e.message + ' @ ' + (e.stack || '').split('\n').slice(1, 3).join(' | ')));
  page.on('console', (m) => { const t = m.text(); if (m.type() === 'error' && !/GPU stall|GL Driver|ReadPixels/.test(t)) errors.push(t); });
  await page.route('**/babylonjs@*/babylon.js', (r) => r.fulfill({ path: BAB, contentType: 'application/javascript' }));
  await page.addInitScript(() => { window.__TEST__ = true; });
  await page.goto('file://' + path.resolve(__dirname, '..', 'index.html') + `?start=1&boss=1&seed=5&floor=${floor}&${extra}`);
  await page.waitForFunction(() => window.__SPLEEN && __SPLEEN.Game && __SPLEEN.Game.state === 'play', null, { timeout: 30000 });
  await page.waitForTimeout(3800);
  await page.evaluate(() => { Gfx.engine().stopRenderLoop(); __SPLEEN.Game.autopilot = true; });
  let cur = 0;
  for (const tt of times.split(',').map(Number)) {
    const info = await page.evaluate(([n]) => {
      __SPLEEN.step(n);
      Gfx.caPulse = 0; Gfx.shake = 0; Gfx.flash = 0; Gfx.clearFloaters(); for (let i = 0; i < 3; i++) { renderFrame(1 / 60); UI.hudFrame(1 / 60); }
      const S = __SPLEEN.SIM, B = S.boss;
      return { t: Math.round(S.time), boss: B && Math.round(B.hp), phase: B && B.phase, atk: B && B.atk && B.atk.name, shots: S.eshots.length, beams: S.beams.length, teles: S.teles.length, en: S.enemies.length };
    }, [Math.max(1, Math.round((tt - cur) * 60))]);
    cur = tt;
    await page.waitForTimeout(150);
    await page.screenshot({ path: `${out}_${tt}.png` });
    console.log(tt, JSON.stringify(info));
  }
  console.log(errors.length ? errors.join('\n') : 'no errors');
  await browser.close();
})();
