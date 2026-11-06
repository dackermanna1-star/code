const { chromium } = require('playwright');
(async () => {
  const b = await chromium.launch({ args: ['--enable-unsafe-swiftshader', '--use-gl=angle', '--use-angle=swiftshader'] });
  const p = await b.newPage();
  p.on('console', (m) => console.log('console', m.type(), m.text().slice(0, 400)));
  p.on('pageerror', (e) => console.log('pageerror', e.message, (e.stack || '').slice(0, 300)));
  await p.goto('file:///home/user/code/release/DeadCounty.html');
  await p.waitForTimeout(3000);
  console.log(await p.evaluate(() => [typeof window.game, document.scripts.length, document.scripts[document.scripts.length-1].type, document.scripts[document.scripts.length-1].text.length]));
  await b.close();
})();
