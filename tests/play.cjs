// Headless play-tester. Starts the dev server, opens the game in Chromium, optionally
// drives it with the autopilot, and reports progress, deaths and console errors.
//
//   node tests/play.cjs --level 1 --char marco --seconds 20 [--shots 4] [--auto] [--out dir]
//
const { chromium } = require('playwright');
const http = require('node:http');
const path = require('node:path');
const fs = require('node:fs');
const { spawn } = require('node:child_process');

function arg(name, def) {
  const i = process.argv.indexOf('--' + name);
  if (i < 0) return def;
  const v = process.argv[i + 1];
  return v === undefined || v.startsWith('--') ? true : v;
}

(async () => {
  const port = 8100 + Math.floor(Math.random() * 800);
  const server = spawn(process.execPath, [path.join(__dirname, '..', 'tools', 'serve.mjs'), String(port)], { stdio: 'ignore' });
  await new Promise((r) => setTimeout(r, 600));
  const out = arg('out', path.join(__dirname, '..', 'test-output'));
  fs.mkdirSync(out, { recursive: true });
  const level = arg('level', '1');
  const char = arg('char', 'marco');
  const seconds = parseFloat(arg('seconds', '10'));
  const shots = parseInt(arg('shots', '3'), 10);
  const auto = !!arg('auto', false);
  const w = parseInt(arg('w', '1280'), 10);
  const h = parseInt(arg('h', '720'), 10);
  const browser = await chromium.launch();
  const page = await browser.newPage({ viewport: { width: w, height: h }, deviceScaleFactor: 1 });
  const errors = [];
  page.on('console', (m) => {
    if (m.type() === 'error' || m.type() === 'warning') errors.push(`[${m.type()}] ${m.text()}`);
  });
  page.on('pageerror', (e) => errors.push('[pageerror] ' + e.message + '\n' + (e.stack || '')));
  const q = arg('menu', false) ? '' : `?level=${level}&char=${char}${auto ? '&auto=1' : ''}`;
  await page.goto(`http://localhost:${port}/index.html${q}`);
  await page.waitForTimeout(800);
  const ok = await page.evaluate(() => !!window.__game);
  if (!ok) {
    console.log('GAME FAILED TO BOOT\n' + errors.join('\n'));
    await browser.close();
    server.kill();
    process.exit(1);
  }
  const log = [];
  for (let i = 0; i < shots; i++) {
    await page.waitForTimeout((seconds * 1000) / shots);
    const st = await page.evaluate(() => {
      const g = window.__game;
      const p = g.player;
      if (!p) return { state: g.state };
      const f = p.focus();
      return {
        state: g.state,
        t: +g.levelTime.toFixed(2),
        x: +f.x.toFixed(1),
        y: +f.y.toFixed(1),
        hp: +p.rider.hp.toFixed(0),
        alive: p.alive,
        mounted: p.mounted,
        cause: p.rider.deathCause,
        lost: p.rider.stats.limbsLost,
        fps: g.fps,
      };
    });
    log.push(st);
    const file = path.join(out, `shot-L${level}-${char}-${i}.png`);
    await page.screenshot({ path: file });
    console.log(JSON.stringify(st), '->', path.relative(process.cwd(), file));
  }
  if (errors.length) console.log('ERRORS:\n' + [...new Set(errors)].slice(0, 30).join('\n'));
  else console.log('no console errors');
  await browser.close();
  server.kill();
})();
