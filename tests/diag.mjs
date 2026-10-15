// Quick diagnostic: load a URL, print errors/warnings as they arrive, wait for a condition or timeout.
import { launch, shot } from './harness.mjs';
const url = process.argv[2];
const secs = +(process.argv[3] || 40);
const { browser, page, errors, logs } = await launch({ url });
page.on('console', (m) => { if (m.type() === 'error' || m.type() === 'warning') console.log('[' + m.type() + ']', m.text().slice(0, 400)); });
page.on('pageerror', (e) => console.log('[pageerror]', e.message, (e.stack || '').split('\n').slice(0, 4).join(' | ')));
const t0 = Date.now();
while ((Date.now() - t0) / 1000 < secs) {
  const st = await page.evaluate(() => window.__game ? { state: window.__game.state, msg: document.querySelector('.msg') && document.querySelector('.msg').textContent } : null).catch(() => null);
  if (st && st.state === 'playing') { console.log('PLAYING after', (Date.now() - t0) / 1000); break; }
  await page.waitForTimeout(1000);
  if (((Date.now() - t0) / 1000 | 0) % 5 === 0) console.log('...', JSON.stringify(st));
}
await shot(page, 'diag');
await browser.close();
