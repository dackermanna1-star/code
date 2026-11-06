// Screenshots every UI screen at 1280x720 and 1920x1080 into dev/out/ui-*.png.
// Usage: node dev/ui-shots.cjs [port] [screen,screen,...] [sizes e.g. 1280x720,1920x1080]
const { chromium } = require('playwright');
const path = require('path');

const port = process.argv[2] || '5207';
const only = process.argv[3] ? process.argv[3].split(',') : null;
const sizes = (process.argv[4] || '1280x720,1920x1080').split(',').map((s) => s.split('x').map(Number));
const SCREENS = [
  ['hud', ''], ['hud-scope', '&scope=1'], ['hud-basic', '&nowatch=1&nocompass=1&calm=1&jam=1'],
  ['inventory', ''], ['crafting', ''], ['health', '&infected=1'], ['skills', ''], ['map', ''], ['map-revealed', '&revealed=1'],
  ['menu', ''], ['menu-nosave', '&nosave=1'], ['newgame', ''], ['settings', ''], ['controls', ''], ['credits', ''],
  ['loading', ''], ['pause', ''], ['death', ''], ['note', ''], ['dialog', ''], ['icons', ''],
];

(async () => {
  const browser = await chromium.launch();
  const errors = [];
  for (const [w, h] of sizes) {
    const ctx = await browser.newContext({ viewport: { width: w, height: h } });
    const page = await ctx.newPage();
    page.on('console', (m) => { if (m.type() === 'error' || m.type() === 'warning') errors.push(`[${m.type()}] ${m.text()}`); });
    page.on('pageerror', (e) => errors.push('[pageerror] ' + e.message));
    for (const [name, extra] of SCREENS) {
      if (only && !only.includes(name)) continue;
      const base = name.split('-')[0];
      const scr = name === 'hud-scope' || name === 'hud-basic' ? 'hud' : name === 'map-revealed' ? 'map' : name === 'menu-nosave' ? 'menu' : base;
      await page.goto(`http://localhost:${port}/dev/ui-test.html?screen=${scr}${extra}`);
      await page.waitForFunction(() => window.__ready === true, null, { timeout: 15000 });
      await page.evaluate(() => document.fonts.ready);
      await page.waitForTimeout(name === 'death' ? 4600 : name.startsWith('hud') ? 1100 : 700);
      if (name === 'inventory') {
        // hover an item to show its tooltip
        const el = await page.$('.inv-panel .slot[data-key="hotbar"][data-i="1"]');
        if (el) { const b = await el.boundingBox(); await page.mouse.move(b.x + b.width / 2, b.y + b.height / 2); await page.waitForTimeout(150); }
      }
      const file = path.join(__dirname, 'out', `ui-${name}-${w}.png`);
      await page.screenshot({ path: file });
      console.log('saved', file);
    }
    await ctx.close();
  }
  await browser.close();
  if (errors.length) { console.log('CONSOLE ERRORS/WARNINGS:'); for (const e of [...new Set(errors)]) console.log(e); }
  else console.log('no console errors');
})();
