// Smoke test of the interactive viewmodel test page: cycles all models and triggers every action via keys.
const { chromium } = require('playwright');
(async () => {
  const browser = await chromium.launch({ args: ['--enable-unsafe-swiftshader', '--use-gl=angle', '--use-angle=swiftshader'] });
  const page = await browser.newPage({ viewport: { width: 1280, height: 720 } });
  const errs = [];
  page.on('console', (m) => { if (m.type() === 'error') errs.push(m.text()); });
  page.on('pageerror', (e) => errs.push('pageerror: ' + e.message));
  await page.goto('http://localhost:5206/dev/viewmodel-test.html');
  await page.waitForTimeout(1500);
  const n = await page.evaluate(() => window.vmTest.items.length);
  const keys = ['KeyF', 'KeyV', 'KeyB', 'KeyG', 'KeyR', 'KeyT', 'KeyY', 'KeyP', 'KeyO', 'KeyX', 'KeyC'];
  for (let i = 0; i < n; i++) {
    for (const k of keys) { await page.keyboard.press(k); await page.waitForTimeout(60); }
    await page.mouse.move(640, 360); await page.mouse.down(); await page.mouse.move(700, 330, { steps: 3 }); await page.mouse.up();
    await page.click('button[data-a="use:eat"]'); await page.waitForTimeout(80);
    await page.click('button[data-a="use2:bandage"]'); await page.waitForTimeout(80);
    await page.keyboard.press('BracketRight');
  }
  await page.waitForTimeout(500);
  await page.screenshot({ path: 'dev/out/viewmodel-interactive.png' });
  console.log('models cycled:', n, errs.length ? 'ERRORS:\n' + [...new Set(errs)].join('\n') : 'no errors');
  await browser.close();
})();
