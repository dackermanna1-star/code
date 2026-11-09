// scripted headless playtest: node tools/play.cjs script.json
// script: [{"eval": "js"}, {"wait": ms}, {"shot": "path.png"}, {"log": "js expr"}]
const { chromium } = require('playwright');
const fs = require('fs');
(async () => {
  const script = JSON.parse(fs.readFileSync(process.argv[2], 'utf8'));
  const query = process.argv[3] || '?debug';
  const browser = await chromium.launch({ args: ['--use-angle=swiftshader', '--enable-unsafe-swiftshader', '--ignore-gpu-blocklist', '--autoplay-policy=no-user-gesture-required'] });
  const page = await browser.newPage({ viewport: { width: 1280, height: 720 } });
  const logs = [];
  page.on('console', (m) => { const t = m.text(); if (!/GPU stall|WebGL-|swiftshader|Automatic fallback|PCFSoftShadowMap/i.test(t)) logs.push(`[${m.type()}] ${t}`); });
  page.on('pageerror', (e) => logs.push(`[pageerror] ${e.message}\n${(e.stack || '').split('\n').slice(0, 4).join('\n')}`));
  // PLAY_URL points at another server (worktrees serve their own dist on their own port)
  await page.goto((process.env.PLAY_URL || 'http://localhost:8080/index.html') + query);
  await page.waitForFunction(() => window.__dbg, null, { timeout: 60000 });
  const t0 = Date.now();
  for (const st of script) {
    if (st.wait) await page.waitForTimeout(st.wait);
    if (st.eval) { try { const r = await page.evaluate(st.eval); if (r !== undefined) logs.push(`[eval ${((Date.now() - t0) / 1000).toFixed(1)}s] ${JSON.stringify(r)}`); } catch (e) { logs.push('[eval-error] ' + e.message.split('\n')[0]); } }
    if (st.log) { try { logs.push(`[log ${((Date.now() - t0) / 1000).toFixed(1)}s] ` + JSON.stringify(await page.evaluate(st.log))); } catch (e) { logs.push('[log-error] ' + e.message.split('\n')[0]); } }
    if (st.shot) await page.screenshot({ path: st.shot, timeout: 120000 });
  }
  console.log(logs.slice(0, 120).join('\n'));
  await browser.close();
})();
