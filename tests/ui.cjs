// Click through the menus and capture screenshots of each screen.
//   node tests/ui.cjs [--w 1280 --h 720]
const { chromium } = require('playwright');
const path = require('node:path');
const fs = require('node:fs');
const { spawn } = require('node:child_process');

function arg(name, def) {
  const i = process.argv.indexOf('--' + name);
  return i < 0 ? def : process.argv[i + 1];
}

(async () => {
  const port = 8100 + Math.floor(Math.random() * 800);
  const server = spawn(process.execPath, [path.join(__dirname, '..', 'tools', 'serve.mjs'), String(port)], { stdio: 'ignore' });
  await new Promise((r) => setTimeout(r, 600));
  const out = path.join(__dirname, '..', 'test-output');
  fs.mkdirSync(out, { recursive: true });
  const w = parseInt(arg('w', '1280'), 10);
  const h = parseInt(arg('h', '720'), 10);
  const tag = `${w}x${h}`;
  const browser = await chromium.launch();
  const page = await browser.newPage({ viewport: { width: w, height: h } });
  const errors = [];
  page.on('pageerror', (e) => errors.push(e.message));
  page.on('console', (m) => m.type() === 'error' && errors.push(m.text()));
  const shot = async (name) => {
    await page.screenshot({ path: path.join(out, `ui-${tag}-${name}.png`) });
    console.log('shot', name);
  };
  await page.goto(`http://localhost:${port}/index.html`);
  await page.waitForTimeout(2500);
  await shot('main');
  await page.click('[data-act="play"]');
  await page.waitForTimeout(500);
  await shot('chars');
  await page.click('.char-card[data-id="reginald"]');
  await page.click('[data-act="to-levels"]');
  await page.waitForTimeout(500);
  await shot('levels');
  await page.click('.level-card[data-i="0"]');
  await page.waitForTimeout(1500);
  await page.keyboard.down('ArrowUp');
  await page.waitForTimeout(2500);
  await page.keyboard.up('ArrowUp');
  await shot('ingame');
  await page.keyboard.press('Escape');
  await page.waitForTimeout(300);
  await shot('pause');
  await page.keyboard.press('Escape');
  await page.waitForTimeout(300);
  // force a death for the overlay
  await page.evaluate(() => window.__game.player.rider.gib(window.__game.player.rider.parts.head, 'headsplode'));
  await page.waitForTimeout(1500);
  await shot('death');
  // results screen
  await page.evaluate(() => {
    const g = window.__game;
    g.restart();
    g.levelTime = 42.37;
    g.finishLevel();
  });
  await page.waitForTimeout(2200);
  await shot('results');
  await page.click('#screen-results [data-act="to-levels"]');
  await page.waitForTimeout(400);
  await page.click('#screen-levels [data-act="back-main"]');
  await page.click('#screen-main [data-act="settings"]');
  await page.waitForTimeout(300);
  await shot('settings');
  await page.click('#screen-settings [data-act="close-modal"]');
  await page.click('#screen-main [data-act="help"]');
  await page.waitForTimeout(300);
  await shot('help');
  if (errors.length) console.log('ERRORS:\n' + [...new Set(errors)].join('\n'));
  else console.log('no console errors');
  await browser.close();
  server.kill();
})();
