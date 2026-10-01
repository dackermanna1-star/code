// Screenshot a running page at intervals. Usage: node tools/play-shots.js "<query>" <outprefix> <count> <intervalMs> [keysScript]
const { chromium } = require('/opt/node22/lib/node_modules/playwright');
const path = require('path');
(async () => {
  const [,, query, out, count, interval, keys] = process.argv;
  const browser = await chromium.launch({ args: ['--autoplay-policy=no-user-gesture-required'] });
  const page = await browser.newPage({ viewport: { width: 1280, height: 720 } });
  const errs = [];
  page.on('console', (m) => { if (m.type() === 'error') errs.push('console: ' + m.text()); });
  page.on('pageerror', (e) => errs.push('pageerror: ' + e.message + '\n' + (e.stack || '').split('\n').slice(0, 4).join('\n')));
  await page.goto('file://' + path.resolve(__dirname, '..', 'index.html') + (query ? '?' + query : ''));
  await page.waitForTimeout(500);
  const n = +(count || 1);
  for (let i = 0; i < n; i++) {
    if (keys) {
      const seq = JSON.parse(keys)[i] || [];
      for (const k of seq) {
        if (k.startsWith('wait:')) await page.waitForTimeout(+k.slice(5));
        else if (k.startsWith('down:')) await page.keyboard.down(k.slice(5));
        else if (k.startsWith('up:')) await page.keyboard.up(k.slice(5));
        else await page.keyboard.press(k);
      }
    }
    await page.waitForTimeout(+(interval || 1000));
    await page.screenshot({ path: `${out}${i}.png` });
  }
  const fps = await page.evaluate(() => window.JJK && JJK.game ? JJK.game.scene.constructor.name : '');
  console.log('scene', fps);
  if (errs.length) console.log(errs.slice(0, 10).join('\n'));
  await browser.close();
})();
