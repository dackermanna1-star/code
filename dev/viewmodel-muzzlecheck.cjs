const { chromium } = require('playwright');
(async () => {
  const browser = await chromium.launch({ args: ['--enable-unsafe-swiftshader', '--use-gl=angle', '--use-angle=swiftshader'] });
  const page = await browser.newPage({ viewport: { width: 1280, height: 720 } });
  page.on('pageerror', (e) => console.log('pageerror', e.message));
  await page.goto('http://localhost:5206/dev/viewmodel-test.html?auto=1');
  await page.waitForFunction(() => window.vmTest && window.vmTest.ready);
  for (const p of [{ model: 'rifle_ak' }, { model: 'pistol', aim: true }, { model: 'rifle_ar', aim: true, yaw: 1.2, pitch: 0.3 }, { model: 'shotgun_pump', yaw: -2, pitch: -0.4, moving: true, t: 0.3 }]) {
    const r = await page.evaluate((q) => window.vmTest.muzzleCheck(q), p);
    console.log(JSON.stringify(p), JSON.stringify(r));
  }
  await browser.close();
})();
