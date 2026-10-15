// Combat sandbox: test arena + autopilot; spawn commons / specials and watch.
// usage: node tests/combat.mjs [scenario] where scenario in: commons, mob, hunter, smoker, boomer, charger, jockey, spitter, tank, witch, all
import { launch, shot } from './harness.mjs';
const sc = process.argv[2] || 'commons';
const secs = +(process.argv[3] || 12);
const { browser, page, errors } = await launch({ url: 'http://localhost:5173/?test=arena&auto=1&autopilot=1' });
page.on('pageerror', (e) => console.log('[pageerror]', e.message, (e.stack || '').split('\n').slice(0, 3).join(' | ')));
await page.waitForFunction(() => window.__game && window.__game.state === 'playing', null, { timeout: 120000 });
await page.evaluate(() => { const d = window.__game.debug; d.startDirector(); d.teleport(0, 0, -24); window.__game.world.survivors.forEach((s, i) => { s.give(['m16', 'auto_shotgun', 'smg', 'ak47'][i]); s.yaw = Math.PI * 0; }); });
await page.waitForTimeout(500);
await page.evaluate((sc) => {
  const d = window.__game.debug;
  if (sc === 'commons') d.spawnCommons(10, 10);
  else if (sc === 'mob') d.spawnMob(25, true);
  else if (sc === 'all') { for (const t of ['hunter', 'smoker', 'boomer', 'charger', 'jockey', 'spitter']) d.spawnSpecial(t, 12 + Math.random() * 6); d.spawnCommons(8, 10); }
  else d.spawnSpecial(sc, 12);
}, sc);
for (let i = 0; i < 4; i++) {
  await page.waitForTimeout(secs * 250);
  const info = await page.evaluate(() => window.__game.debug.info());
  console.log(JSON.stringify(info));
  await shot(page, `combat_${sc}_${i}`);
}
console.log('errors:', errors.filter(e => !e.includes('Failed to load resource')).slice(0, 8).join('\n') || 'none');
await browser.close();
