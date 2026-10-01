// Run scripted scenarios in the browser and capture screenshots.
// Usage: node tools/scenario.js <name> <outprefix>
const { chromium } = require('/opt/node22/lib/node_modules/playwright');
const path = require('path');
const SC = {
  // each step: [waitMs, jsToEval, shot?]
  blue: { q: 'play=training&p1=gojo&p2=sukuna', steps: [[600, 'F(0).meter=300'], [100, "F(0).startMove('blue')"], [450, '', 1], [300, '', 1]] },
  red: { q: 'play=training&p1=gojo&p2=sukuna', steps: [[600, "F(0).startMove('red')"], [330, '', 1], [120, '', 1], [200, '', 1]] },
  maxred: { q: 'play=training&p1=gojo&p2=sukuna', steps: [[600, "F(0).startMove('maxRed')"], [300, '', 1], [500, '', 1], [250, '', 1]] },
  purple: { q: 'play=training&p1=gojo&p2=sukuna', steps: [[600, "F(0).cpu={holdSU:true,think(){}};F(0).startMove('purple')"], [1200, '', 1], [800, '', 1], [600, 'F(0).cpu.holdSU=false', 1], [700, '', 1], [800, '', 1], [500, '', 1], [500, '', 1]] },
  void: { q: 'play=training&p1=gojo&p2=sukuna', steps: [[600, "F(0).startMove('domain')"], [600, '', 1], [900, '', 1], [800, '', 1], [800, '', 1], [1000, '', 1]] },
  shrine: { q: 'play=training&p1=sukuna&p2=gojo', steps: [[600, "F(0).startMove('domain')"], [600, '', 1], [900, '', 1], [800, '', 1], [800, '', 1], [1000, '', 1]] },
  dismantle: { q: 'play=training&p1=sukuna&p2=gojo', steps: [[600, "F(0).startMove('dismantle')"], [280, '', 1], [150, '', 1], [300, "F(0).startMove('cross')"], [350, '', 1]] },
  fuga: { q: 'play=training&p1=sukuna&p2=gojo', steps: [[600, "F(0).cpu={holdSP:true,think(){}};F(0).startMove('fuga')"], [900, '', 1], [800, 'F(0).cpu.holdSP=false', 1], [300, '', 1], [300, '', 1], [500, '', 1]] },
  wcs: { q: 'play=training&p1=sukuna&p2=gojo', steps: [[600, "F(1).cs.infOn=true;F(0).startMove('wcs')"], [700, '', 1], [800, '', 1], [500, '', 1], [80, '', 1], [150, '', 1], [400, '', 1]] },
  cleave: { q: 'play=training&p1=sukuna&p2=gojo', steps: [[400, 'F(1).x=F(0).x+90'], [200, "F(0).startMove('cleave')"], [180, '', 1], [120, '', 1], [500, "F(0).startMove('enhancedCleave')"], [700, '', 1], [300, '', 1]] },
  clash: { q: 'play=training&p1=gojo&p2=sukuna', steps: [[600, "F(0).startMove('domain');F(1).startMove('domain')"], [600, '', 1], [1300, '', 1], [1200, '', 1], [2500, '', 1], [1500, '', 1]] },
  infinity: { q: 'play=training&p1=gojo&p2=sukuna', steps: [[600, "F(0).cs.infOn=true;F(1).x=F(0).x+80"], [100, "F(1).startMove('5H')"], [250, '', 1], [200, '', 1], [300, "F(1).startMove('dismantle')"], [400, '', 1]] },
  combo: { q: 'play=training&p1=gojo&p2=sukuna', steps: [[400, 'F(1).x=F(0).x+70'], [100, "F(0).startMove('2H')"], [200, '', 1], [300, '', 1]] },
  title: { q: '', steps: [[1500, '', 1]] },
  select: { q: '', steps: [[800, "JJK.game.set(new JJK.UI.Select({mode:'versus'}))"], [600, '', 1]] },
  vs: { q: '', steps: [[300, "JJK.game.set(new JJK.UI.VsScreen({mode:'versus',p1:{char:'gojo',pal:0},p2:{char:'sukuna',pal:0}}))"], [900, '', 1]] },
  intro: { q: 'play=versus', steps: [[700, '', 1], [1700, '', 1], [800, '', 1]] },
};
(async () => {
  const [,, name, out] = process.argv;
  const sc = SC[name];
  const browser = await chromium.launch({ args: ['--autoplay-policy=no-user-gesture-required'] });
  const page = await browser.newPage({ viewport: { width: 1280, height: 720 } });
  const errs = [];
  page.on('console', (m) => { if (m.type() === 'error' && !/ERR_FILE_NOT_FOUND/.test(m.text())) errs.push('console: ' + m.text()); });
  page.on('pageerror', (e) => errs.push('pageerror: ' + e.message + '\n' + (e.stack || '').split('\n').slice(0, 5).join('\n')));
  await page.goto('file://' + path.resolve(__dirname, '..', 'index.html') + (sc.q ? '?' + sc.q : ''));
  await page.evaluate(() => { window.F = (i) => JJK.game.scene.m.fighters[i]; });
  let n = 0;
  for (const [ms, js, shot] of sc.steps) {
    await page.waitForTimeout(ms);
    if (js) { try { await page.evaluate(js); } catch (e) { errs.push('eval: ' + e.message); } }
    if (shot) await page.screenshot({ path: `${out}${n++}.png` });
  }
  if (errs.length) console.log(errs.slice(0, 10).join('\n'));
  console.log('shots', n);
  await browser.close();
})();
