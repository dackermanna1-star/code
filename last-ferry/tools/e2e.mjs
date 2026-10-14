// End-to-end check of the real app in headless Chromium (software WebGL).
// Frames are stepped explicitly through window.__lf (the rAF loop is stopped),
// so runs are deterministic in game time however slow the renderer is.
//
// Usage (from the repo root):
//   node last-ferry/tools/e2e.mjs [options]
//     --url URL          app URL (default http://127.0.0.1:5180/)
//     --file PATH        open a file instead (e.g. release/LastFerry.html, via file://)
//     --out DIR          screenshots (default tests/output/ferry-e2e[-full], git-ignored)
//     --mode quick|full  quick (default): title → Play → autoplay N s → pause → forced game over
//                        full: god + autoplay through all three chapters to the victory screen
//     --seconds N        quick mode: game seconds of autoplay (default 40)
//     --quality Q        low|medium|high (default low)
//     --query Q          extra URL parameters (e.g. "seed=3")
//     --sound            keep audio on (default ?nosound)
//     --width W --height H  viewport (default 1280x720)
// Exits 1 on any page error, console error, failed request or failed check.
import { chromium } from 'playwright-core';
import fs from 'node:fs';
import path from 'node:path';
import { pathToFileURL } from 'node:url';

const args = process.argv.slice(2);
const opt = (name, def) => {
  const i = args.indexOf(`--${name}`);
  return i >= 0 && i + 1 < args.length && !args[i + 1].startsWith('--') ? args[i + 1] : def;
};
const flag = (name) => args.includes(`--${name}`);
const mode = opt('mode', 'quick');
const out = opt('out', 'tests/output/ferry-e2e' + (mode === 'full' ? '-full' : ''));
const seconds = Number(opt('seconds', 40));
const W = Number(opt('width', 1280));
const H = Number(opt('height', 720));
const query = [opt('query', ''), `quality=${opt('quality', 'low')}`, flag('sound') ? '' : 'nosound', 'title'].filter(Boolean).join('&');
const file = opt('file', null);
const base = file ? pathToFileURL(path.resolve(file)).href : opt('url', 'http://127.0.0.1:5180/');
fs.mkdirSync(out, { recursive: true });

const browser = await chromium.launch({
  executablePath: process.env.CHROME ?? '/opt/pw-browsers/chromium-1194/chrome-linux/chrome',
  args: ['--use-gl=angle', '--use-angle=swiftshader', '--enable-unsafe-swiftshader', '--ignore-gpu-blocklist', '--autoplay-policy=no-user-gesture-required'],
});
const page = await browser.newPage({ viewport: { width: W, height: H } });
page.setDefaultTimeout(600000);
const errors = [];
const failures = [];
page.on('pageerror', (e) => errors.push(`pageerror: ${e.message}\n${e.stack ?? ''}`));
page.on('console', (m) => {
  if (m.type() === 'error' && !m.text().includes('favicon')) errors.push(`console: ${m.text()}`);
});
page.on('requestfailed', (r) => {
  if (!r.url().includes('favicon')) errors.push(`requestfailed ${r.url()} ${r.failure()?.errorText ?? ''}`);
});
page.on('response', (r) => {
  if (r.status() >= 400 && !r.url().includes('favicon')) errors.push(`http ${r.status()} ${r.url()}`);
});

const T0 = Date.now();
const log = (...a) => console.log(`[${((Date.now() - T0) / 1000).toFixed(0).padStart(4)}s]`, ...a);
const check = (ok, what) => {
  if (!ok) failures.push(what);
  log(ok ? 'ok  ' : 'FAIL', what);
};

let shotN = 0;
async function shot(name) {
  // CSS transitions run on real time: let screens fade in before capturing.
  await page.waitForTimeout(450);
  const p = `${out}/${String(shotN++).padStart(2, '0')}_${name}.png`;
  await page.screenshot({ path: p });
  log('shot', p);
}
const stats = () => page.evaluate(() => window.__lf.stats());
/** Advance `sec` of real time in frames of `dt`, rendering every `every`th frame and the last. */
const run = (sec, dt = 0.05, every = 20) =>
  page.evaluate(
    ([sec, dt, every]) => {
      const { stage } = window.__lf;
      const n = Math.max(1, Math.round(sec / dt));
      for (let i = 0; i < n; i++) stage.frame(dt, i % every === every - 1 || i === n - 1);
    },
    [sec, dt, every],
  );

log(`open ${base}?${query}`);
await page.goto(`${base}${base.includes('?') ? '&' : '?'}${query}`);
await page.waitForFunction(() => window.__lf, null, { timeout: 240000 });
log('booted');
await page.evaluate(() => window.__lf.stage.stop());

// ---- title (live attract game behind the menu)
await run(3, 1 / 30, 30);
let s = await stats();
check(s.mode === 'title' && s.screen === 'title', `title screen (mode ${s.mode}, screen ${s.screen})`);
check(s.t > 0, 'attract game runs behind the title');
await shot('title');

// ---- Play (the real menu path: Enter on "Play")
await page.evaluate((full) => {
  const lf = window.__lf;
  lf.game.autoplay = true;
  if (full) lf.god(true);
}, mode === 'full');
await page.keyboard.press('Enter');
// Two quick frames without drawing: the chapter splash is a real-time CSS
// sequence (≈2.6 s) and a software-rendered frame can take a second.
await page.evaluate(() => {
  window.__lf.stage.frame(1 / 30, false);
  window.__lf.stage.frame(1 / 30, false);
});
s = await stats();
check(s.mode === 'playing' && s.chapter >= 1, `Play starts a game (mode ${s.mode}, phase ${s.phase})`);
check(await page.evaluate(() => !!document.querySelector('.lf-splash-in')), 'chapter splash shown');
await shot('chapter_splash');
await run(1.2, 1 / 30, 12);

if (mode === 'quick') {
  const chunks = Math.max(1, Math.round(seconds / 10));
  for (let i = 0; i < chunks; i++) {
    await run(seconds / chunks);
    s = await stats();
    log(JSON.stringify(s));
    await shot(`play_${String(Math.round(s.t)).padStart(3, '0')}s`);
  }
  check(s.kills > 0, `the bot kills zombies (${s.kills})`);
  check(s.money > 0 || s.weapon !== 'revolver', 'money is earned or spent');

  // Pause and resume through the real keys.
  await page.keyboard.press('Escape');
  await run(0.1, 1 / 30, 3);
  s = await stats();
  check(s.mode === 'paused' && s.screen === 'pause', `Esc pauses (${s.mode}/${s.screen})`);
  const t0 = s.t;
  await run(1, 1 / 30, 30);
  check((await stats()).t === t0, 'the world is frozen while paused');
  await shot('pause');
  await page.keyboard.press('Escape');
  await run(0.3, 1 / 30, 9);
  s = await stats();
  check(s.mode === 'playing' && s.screen === null, `Esc resumes (${s.mode}/${s.screen})`);

  // Forced game over: a shambler right at the gangway.
  await page.evaluate(() => {
    const lf = window.__lf;
    lf.god(false);
    // (The bot would blow the horn and stagger it: use the horn up first.)
    lf.world().pier.hornReady = false;
    lf.spawn('shambler', 21.3, 0, { life: 9999 });
  });
  await run(2.0, 1 / 30, 10);
  s = await stats();
  check(s.mode === 'over' && s.phase === 'gameover', `a zombie at the gangway ends the game (${s.mode}/${s.phase})`);
  await shot('gameover_moment');
  await run(3, 1 / 30, 15);
  s = await stats();
  check(s.screen === 'gameover', `game-over screen (${s.screen})`);
  await shot('gameover_screen');
  // Retry from the results screen (the primary button).
  await page.waitForTimeout(400);
  await page.keyboard.press('Enter');
  await run(0.3, 1 / 30, 9);
  s = await stats();
  check(s.mode === 'playing' && s.t < 1, `Retry starts a new game (${s.mode}, t ${s.t})`);
} else {
  // ---- full run: all chapters to the victory screen (god mode: nothing can board).
  const seen = new Set();
  const checkpoints = [
    ['ch1_early', (s) => s.chapter === 1 && s.phase === 'playing' && s.t > 12],
    ['ch1_late', (s) => s.chapter === 1 && s.phase === 'playing' && s.boarded >= 36],
    ['boss1_arrives', (s) => s.chapter === 1 && s.phase === 'boss' && s.bossLife > 0.9],
    ['boss1_fight', (s) => s.chapter === 1 && s.phase === 'boss' && s.bossLife < 0.6],
    ['ch1_clear', (s) => s.chapter === 1 && s.phase === 'between'],
    ['ch2_early', (s) => s.chapter === 2 && s.phase === 'playing' && s.boarded >= 8],
    ['ch2_late', (s) => s.chapter === 2 && s.phase === 'playing' && s.boarded >= 50],
    ['boss2_marathon', (s) => s.chapter === 2 && s.phase === 'boss' && s.bossLife < 0.85],
    ['boss2_late', (s) => s.chapter === 2 && s.phase === 'boss' && s.bossLife < 0.3],
    ['ch3_early', (s) => s.chapter === 3 && s.phase === 'playing' && s.boarded >= 10],
    ['ch3_late', (s) => s.chapter === 3 && s.phase === 'playing' && s.boarded >= 55],
    ['boss3_riot', (s) => s.chapter === 3 && s.phase === 'boss' && s.bossLife < 0.9],
    ['boss3_late', (s) => s.chapter === 3 && s.phase === 'boss' && s.bossLife < 0.35],
    ['victory_departure', (s) => s.mode === 'victory' && s.departure > 0.15],
    ['victory_screen', (s) => s.screen === 'victory'],
  ];
  const deadline = Date.now() + 150 * 60 * 1000;
  let last = '';
  while (Date.now() < deadline) {
    // Big frames (1/15 s: the ragdoll physics' most per frame), drawing only every 45th:
    // the run is CPU bound in software GL.
    await run(3, 1 / 15, 45);
    s = await stats();
    const line = `ch${s.chapter} ${s.phase} t=${s.t} boarded=${s.boarded} boss=${s.bossLife?.toFixed?.(2) ?? '-'} kills=${s.kills} $${s.money} ${s.weapon} z=${s.zombies} c=${s.corpses} rag=${s.view?.ragdolls} calls=${s.view?.drawCalls}`;
    if (line.split(' t=')[0] !== last) log(line);
    last = line.split(' t=')[0];
    for (const [name, when] of checkpoints) {
      if (!seen.has(name) && when(s)) {
        seen.add(name);
        log(name, JSON.stringify(s));
        await shot(name);
      }
    }
    if (s.screen === 'victory' || s.mode === 'over' || s.mode === 'title') break;
  }
  s = await stats();
  check(s.screen === 'victory', `victory screen reached (mode ${s.mode}, screen ${s.screen})`);
  check(s.kills > 300, `sane kill count (${s.kills})`);
  for (const [name] of checkpoints) check(seen.has(name), `checkpoint ${name}`);
  await run(4, 1 / 30, 30);
  await shot('victory_final');
}

log(`done in ${Math.round((Date.now() - T0) / 1000)} s`);
await browser.close();
if (errors.length) console.log('PAGE ERRORS:\n' + [...new Set(errors)].slice(0, 30).join('\n'));
if (failures.length) console.log('FAILED CHECKS:\n' + failures.join('\n'));
process.exit(errors.length || failures.length ? 1 : 0);
