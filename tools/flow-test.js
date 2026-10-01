// Full UI flow test with real key presses.
const { chromium } = require('/opt/node22/lib/node_modules/playwright');
const path = require('path');
const OUT = process.argv[2] || '/tmp/flow';
(async () => {
  const browser = await chromium.launch({ args: ['--autoplay-policy=no-user-gesture-required'] });
  const page = await browser.newPage({ viewport: { width: 1280, height: 720 } });
  const errs = [];
  page.on('pageerror', (e) => errs.push('pageerror: ' + e.message + ' ' + (e.stack || '').split('\n')[1]));
  page.on('console', (m) => { if (m.type() === 'error') errs.push('console: ' + m.text()); });
  await page.goto('file://' + path.resolve(__dirname, '..', 'index.html'));
  const scene = () => page.evaluate(() => JJK.game.scene.constructor.name);
  const tap = async (k, wait = 250) => { await page.keyboard.down(k); await page.waitForTimeout(60); await page.keyboard.up(k); await page.waitForTimeout(wait); };
  await page.waitForTimeout(600);
  const log = [];
  log.push(await scene());
  await tap('Enter'); log.push(await scene());
  await tap('Enter'); log.push(await scene()); // arcade -> difficulty
  await tap('ArrowDown'); await tap('Enter'); log.push(await scene()); // hard -> select
  await tap('KeyJ', 900); log.push(await scene()); // pick gojo
  await page.screenshot({ path: OUT + '-vs.png' });
  await tap('Enter', 600); log.push(await scene());
  await page.waitForTimeout(5000);
  await page.screenshot({ path: OUT + '-fight.png' });
  await tap('Escape', 300); log.push(await scene() + ' paused=' + await page.evaluate(() => JJK.game.scene.m.paused));
  await page.screenshot({ path: OUT + '-pause.png' });
  await tap('ArrowDown'); await tap('Enter', 400); // move list
  await page.screenshot({ path: OUT + '-movelist.png' });
  await tap('Escape', 300); await tap('Escape', 300);
  log.push('after resume paused=' + await page.evaluate(() => JJK.game.scene.m.paused));
  const info = await page.evaluate(() => { const m = JJK.game.scene.m; return { phase: m.phase, p2cpu: !!m.fighters[1].cpu, level: m.fighters[1].cpu && m.fighters[1].cpu.level, hp: m.fighters.map((f) => Math.round(f.hp)) }; });
  console.log(log.join(' -> '));
  console.log(JSON.stringify(info));
  if (errs.length) console.log(errs.slice(0, 8).join('\n'));
  await browser.close();
})();
