// headless check: node tools/shot.cjs <url-query> <out.png> [waitMs] [evalBeforeShot]
const { chromium } = require('playwright');
(async () => {
  const [, , query = '', out = 'shot.png', wait = '6000', evalJs = ''] = process.argv;
  const browser = await chromium.launch({ args: ['--use-angle=swiftshader', '--enable-unsafe-swiftshader', '--ignore-gpu-blocklist'] });
  const page = await browser.newPage({ viewport: { width: 1280, height: 720 } });
  const logs = [];
  page.on('console', (m) => logs.push(`[${m.type()}] ${m.text()}`));
  page.on('pageerror', (e) => logs.push(`[pageerror] ${e.message}\n${e.stack}`));
  await page.goto('http://localhost:8080/index.html' + query);
  await page.waitForTimeout(+wait);
  if (evalJs) { try { logs.push('[eval] ' + JSON.stringify(await page.evaluate(evalJs))); } catch (e) { logs.push('[eval-error] ' + e.message); } await page.waitForTimeout(800); }
  await page.screenshot({ path: out });
  const info = await page.evaluate(() => JSON.stringify(window.__test || window.__game_debug || null)).catch(() => 'n/a');
  console.log(logs.filter((l) => !/GPU stall|WebGL-|swiftshader|Automatic fallback/i.test(l)).slice(0, 60).join('\n'));
  console.log('INFO', info);
  await browser.close();
})();
