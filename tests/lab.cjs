// Runs a scenario script inside the game page:  node tests/lab.cjs scenario.js [--shot name]
// The scenario file body runs as an async function with `g` (Game), `chars`, `levels` in scope
// and should return a JSON-serialisable result.
const { chromium } = require('playwright');
const path = require('node:path');
const fs = require('node:fs');
const { spawn } = require('node:child_process');

(async () => {
  const file = process.argv[2];
  const body = fs.readFileSync(file, 'utf8');
  const port = 8100 + Math.floor(Math.random() * 800);
  const server = spawn(process.execPath, [path.join(__dirname, '..', 'tools', 'serve.mjs'), String(port)], { stdio: 'ignore' });
  await new Promise((r) => setTimeout(r, 600));
  const browser = await chromium.launch();
  const page = await browser.newPage({ viewport: { width: 1280, height: 720 }, deviceScaleFactor: 1 });
  const errors = [];
  page.on('console', (m) => {
    if (m.type() === 'error') errors.push(m.text());
    if (m.type() === 'log') console.log('[page]', m.text());
  });
  page.on('pageerror', (e) => errors.push(e.message + '\n' + e.stack));
  await page.goto(`http://localhost:${port}/index.html`);
  await page.waitForTimeout(700);
  try {
    const res = await page.evaluate(`(async () => { const g = window.__game; const chars = window.__chars; const levels = window.__levels; window.__ui.stopAttract(); ${body} })()`);
    console.log(Array.isArray(res) ? res.map((r) => JSON.stringify(r)).join("\n") : JSON.stringify(res, null, 1));
  } catch (e) {
    console.log('SCENARIO ERROR', e.message);
  }
  const shotIdx = process.argv.indexOf('--shot');
  if (shotIdx > 0) {
    await page.evaluate(() => { window.__ui.enterGame(); window.__game.render(); });
    const out = path.join(__dirname, '..', 'test-output', process.argv[shotIdx + 1] + '.png');
    fs.mkdirSync(path.dirname(out), { recursive: true });
    await page.screenshot({ path: out });
    console.log('shot ->', path.relative(process.cwd(), out));
  }
  if (errors.length) console.log('ERRORS:\n' + [...new Set(errors)].slice(0, 20).join('\n'));
  await browser.close();
  server.kill();
})();
