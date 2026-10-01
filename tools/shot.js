// Usage: node tools/shot.js <url-relative-to-repo> <out.png> [w h]
const { chromium } = require('/opt/node22/lib/node_modules/playwright');
const path = require('path');
(async () => {
  const [,, rel, out, w, h, wait] = process.argv;
  const browser = await chromium.launch({ args: ['--autoplay-policy=no-user-gesture-required'] });
  const page = await browser.newPage({ viewport: { width: +(w || 1280), height: +(h || 720) } });
  const errs = [];
  page.on('console', (m) => { if (m.type() === 'error' || m.type() === 'warning') errs.push(m.type() + ': ' + m.text()); });
  page.on('pageerror', (e) => errs.push('pageerror: ' + e.message + '\n' + e.stack));
  const url = 'file://' + path.resolve(__dirname, '..', rel.split('?')[0]) + (rel.includes('?') ? '?' + rel.split('?')[1] : '');
  await page.goto(url);
  await page.waitForTimeout(+(wait || 300));
  await page.screenshot({ path: out });
  if (errs.length) console.log(errs.join('\n'));
  await browser.close();
})();
