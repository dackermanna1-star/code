// End-to-end keyboard input test in the browser (training mode).
const { chromium } = require('/opt/node22/lib/node_modules/playwright');
const path = require('path');
const F = 17;
(async () => {
  const browser = await chromium.launch();
  const page = await browser.newPage({ viewport: { width: 1280, height: 720 } });
  const errs = [];
  page.on('pageerror', (e) => errs.push(e.message));
  const run = async (p1, label, seq, expectFn) => {
    await page.goto('file://' + path.resolve(__dirname, '..', 'index.html') + `?play=training&p1=${p1}&p2=${p1 === 'gojo' ? 'sukuna' : 'gojo'}`);
    await page.waitForTimeout(400);
    await page.evaluate(() => { window.F = (i) => JJK.game.scene.m.fighters[i]; window.LOG = []; const f = F(0); const o = f.startMove.bind(f); f.startMove = (id, opts) => { LOG.push(id); return o(id, opts); }; });
    for (const s of seq) {
      if (typeof s === 'number') await page.waitForTimeout(s * F);
      else if (s[0] === '+') await page.keyboard.down(s.slice(1));
      else if (s[0] === '-') await page.keyboard.up(s.slice(1));
      else { await page.keyboard.down(s); await page.waitForTimeout(F); await page.keyboard.up(s); }
    }
    await page.waitForTimeout(300);
    const log = await page.evaluate(() => LOG);
    const st = await page.evaluate(() => ({ x: F(0).x, st: F(0).st }));
    const ok = expectFn(log, st);
    console.log((ok ? 'PASS ' : 'FAIL ') + label.padEnd(28) + ' moves=' + JSON.stringify(log) + ' x=' + st.x.toFixed(0));
  };
  await run('gojo', '5L jab', ['KeyJ'], (l) => l.includes('5L'));
  await run('gojo', '2M (crouch medium)', ['+KeyS', 2, 'KeyK', 2, '-KeyS'], (l) => l.includes('2M'));
  await run('gojo', '236SP Blue', ['+KeyS', 2, '+KeyD', 2, '-KeyS', 1, 'KeyU', '-KeyD'], (l) => l.includes('blue'));
  await run('gojo', '214SP Red', ['+KeyS', 2, '+KeyA', 2, '-KeyS', 1, 'KeyU', '-KeyA'], (l) => l.includes('red'));
  await run('gojo', '22SP Teleport', ['+KeyS', 2, '-KeyS', 2, '+KeyS', 2, 'KeyU', '-KeyS'], (l) => l.includes('teleport'));
  await run('gojo', '623SU Purple', ['+KeyD', 2, '-KeyD', '+KeyS', 2, '+KeyD', 2, 'KeyI', '-KeyS', '-KeyD'], (l) => l.includes('purple'));
  await run('gojo', '66 blink', ['KeyD', 2, 'KeyD', 2], (l) => l.includes('dashF'));
  await run('gojo', 'Space dash', ['Space'], (l) => l.includes('dashF'));
  await run('gojo', 'L+M throw (H macro)', ['KeyH'], (l) => l.includes('throw'));
  await run('gojo', 'M+H parry (Y macro)', ['KeyY'], (l) => l.includes('parry'));
  await run('gojo', 'SP+SU domain', ['+KeyU', '+KeyI', 2, '-KeyU', '-KeyI'], (l) => l.includes('domain'));
  await run('gojo', 'chain 5L>5M>5H', ['+KeyD', 'KeyJ', 4, 'KeyK', 8, 'KeyL', 20, '-KeyD'], (l) => l.includes('5L'));
  await run('gojo', 'walk forward', ['+KeyD', 30, '-KeyD'], (l, s) => s.x > -100);
  await run('sukuna', '63214SP grab cleave', ['+KeyD', 1, '+KeyS', 1, '-KeyD', 1, '+KeyA', 1, '-KeyS', 1, 'KeyU', '-KeyA'], (l) => l.includes('grabCleave'));
  await run('sukuna', '236SP Dismantle', ['+KeyS', 2, '+KeyD', 2, '-KeyS', 1, 'KeyU', '-KeyD'], (l) => l.includes('dismantle'));
  await run('sukuna', '22SP Fuga', ['+KeyS', 2, '-KeyS', 2, '+KeyS', 2, 'KeyU', '-KeyS'], (l) => l.includes('fuga'));
  await run('sukuna', '6SP Lunge', ['+KeyD', 2, 'KeyU', '-KeyD'], (l) => l.includes('lunge'));
  await run('sukuna', '2SP Cross', ['+KeyS', 2, 'KeyU', '-KeyS'], (l) => l.includes('cross'));
  await run('sukuna', '214SU Enhanced Cleave', ['+KeyS', 2, '+KeyA', 2, '-KeyS', 1, 'KeyI', '-KeyA'], (l) => l.includes('enhancedCleave'));
  await run('sukuna', 'dash into run', ['KeyD', 2, '+KeyD', 40, '-KeyD'], (l, s) => l.includes('dashF') && s.x > 0);
  if (errs.length) console.log('ERRORS', errs);
  await browser.close();
})();
