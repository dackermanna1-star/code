const { chromium } = require('playwright');
(async () => {
  const shots = process.argv.slice(2);
  const b = await chromium.launch({ args: ['--enable-unsafe-swiftshader', '--use-gl=angle', '--use-angle=swiftshader'] });
  const p = await b.newPage({ viewport: { width: 960, height: 540 } });
  p.on('console', (m) => { if (m.type() === 'error' || m.type() === 'warning') console.log('[console]', m.type(), m.text().slice(0, 400)); });
  p.on('pageerror', (e) => console.log('[pageerror]', e.message));
  for (const s of shots) {
    const i = s.indexOf('='); const name = s.slice(0, i), url = s.slice(i + 1);
    await p.goto('http://localhost:5199/' + url);
    await p.waitForFunction(() => window.__ready && window.__frames > 5, null, { timeout: 120000 });
    await p.waitForTimeout(500);
    await p.screenshot({ path: `dev/out/${name}.png` });
    console.log('shot', name);
  }
  await b.close();
})();
