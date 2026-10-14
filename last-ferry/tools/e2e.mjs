// End-to-end check of the real app in headless Chromium (software WebGL).
// Frames are stepped explicitly through window.__lf (the rAF loop is stopped),
// so runs are deterministic in game time however slow the renderer is.
//
// Usage (from the repo root):
//   node last-ferry/tools/e2e.mjs [options]
//     --url URL          app URL (default http://127.0.0.1:5180/)
//     --file PATH        open a file instead (e.g. release/LastFerry.html, via file://)
//     --out DIR          screenshots (default tests/output/ferry-e2e[-full], git-ignored)
//     --mode quick|full  quick (default): loading → title → options → Play → the human controls
//                        (incl. lining up with the crane hook) → autoplay N s → pause → forced game over → retry →
//                        chapter 3 → forced game over → Retry chapter 3 → boss → mop-up → victory → play again
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
await page.waitForSelector('.lf-loading', { timeout: 120000 }).catch(() => null);
await page.waitForTimeout(1500);
await page.screenshot({ path: `${out}/${String(shotN++).padStart(2, '0')}_loading.png` });
await page.waitForFunction(() => window.__lf, null, { timeout: 240000 });
log('booted');
await page.evaluate(() => window.__lf.stage.stop());

// ---- title (live attract game behind the menu)
await run(3, 1 / 30, 30);
let s = await stats();
check(s.mode === 'title' && s.screen === 'title', `title screen (mode ${s.mode}, screen ${s.screen})`);
check(s.t > 0, 'attract game runs behind the title');
await shot('title');

// ---- Options from the title (keyboard): change the graphics quality and come back.
if (mode === 'quick') {
  const q0 = await page.evaluate(() => [window.__lf.screens.options.quality, window.__lf.stage.postQualityLevel]);
  await page.keyboard.press('ArrowDown');
  await page.keyboard.press('ArrowDown');
  await page.waitForTimeout(300);
  await page.keyboard.press('Enter');
  await run(0.1, 1 / 30, 3);
  check((await stats()).screen === 'options', 'Options opens from the title');
  for (let i = 0; i < 3; i++) await page.keyboard.press('ArrowDown');
  await page.keyboard.press(q0[0] === 'high' ? 'ArrowLeft' : 'ArrowRight');
  await run(0.1, 1 / 30, 3);
  const q1 = await page.evaluate(() => [window.__lf.screens.options.quality, window.__lf.stage.postQualityLevel, window.__lf.stage.maxPixelRatio]);
  check(q1[0] !== q0[0] && q1[1] === q1[0], `quality option applies to the stage (${q0} → ${q1})`);
  await shot('options');
  await page.keyboard.press('Escape');
  await run(0.1, 1 / 30, 3);
  check((await stats()).screen === 'title', 'Esc returns to the title');
  // Put the menu cursor back on Play.
  await page.keyboard.press('ArrowUp');
  await page.keyboard.press('ArrowUp');
  await page.waitForTimeout(300);
}

// ---- Play (the real menu path: Enter on "Play")
await page.evaluate((full) => {
  const lf = window.__lf;
  // The full run is the bot's from the start; the quick run checks the human controls first.
  lf.game.autoplay = full;
  lf.god(true);
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
// Pin the splash's CSS sequence mid-way for the capture (headless frames are slower than its timers).
await page.evaluate(() => {
  for (const a of document.getAnimations()) {
    const t = a.effect?.target;
    if (t instanceof Element && t.closest('.lf-splash')) {
      a.pause();
      a.currentTime = 1100;
    }
  }
});
await shot('chapter_splash');
await page.evaluate(() => document.getAnimations().forEach((a) => a.playState === 'paused' && a.play()));
await run(1.2, 1 / 30, 12);

if (mode === 'quick') {
  // ---- the human controls (real key / mouse events), god mode so nothing interrupts
  await run(2.6, 1 / 30, 80);
  const P = () =>
    page.evaluate(() => {
      const w = window.__lf.world();
      const p = w.player;
      return { x: p.x, z: p.z, y: p.y, weapon: p.weapon.id, wstate: p.weapon.state, bullets: p.weapon.bullets, shots: p.stats.shots, money: p.money, owned: [...p.owned.keys()], horn: w.hornReady, favour: w.favour, state: p.state };
    });
  const hold = async (key, sec) => {
    await page.keyboard.down(key);
    await run(sec, 1 / 30, 1000);
    await page.keyboard.up(key);
    await run(1 / 30, 1 / 30, 1000);
  };
  const tap = async (key, sec = 0.1) => {
    await page.keyboard.press(key);
    await run(sec, 1 / 30, 1000);
  };
  let a = await P();
  await hold('ArrowUp', 0.6);
  let b = await P();
  check(b.z < a.z - 0.6, `↑ moves the Bosun (z ${a.z.toFixed(2)} → ${b.z.toFixed(2)})`);
  await hold('KeyA', 0.5);
  a = await P();
  check(a.x < b.x - 0.6, `A moves him left (x ${b.x.toFixed(2)} → ${a.x.toFixed(2)})`);
  await hold('Space', 0.8);
  b = await P();
  check(b.shots > a.shots, `Space fires (${a.shots} → ${b.shots} shots)`);
  await run(1.7, 1 / 30, 1000);
  await hold('KeyJ', 0.5);
  a = await P();
  check(a.shots > b.shots, `J fires (${b.shots} → ${a.shots} shots)`);
  await hold('ControlLeft', 0.5);
  b = await P();
  check(b.shots === a.shots, `Ctrl does not fire (it belongs to the browser: Ctrl+W) (${a.shots} → ${b.shots})`);
  // The crane: walk into the hook's lane → the overlay shows the line-up, and the rope is still hanging.
  const hookZ = await page.evaluate(() => {
    const w = window.__lf.world();
    w.clearZombies();
    return w.pier.constructor.hookLane(1) - 0.1; // revolver muzzle offset
  });
  for (let i = 0; i < 40; i++) {
    const p = await P();
    if (Math.abs(p.z - hookZ) < 0.08) break;
    await hold(p.z > hookZ ? 'ArrowUp' : 'ArrowDown', Math.min(0.25, Math.max(1 / 30, Math.abs(p.z - hookZ) / 3.2)));
    await run(0.15, 1 / 30, 1000);
  }
  s = await stats();
  check(s.overlay.crane === 'lined' && s.crane === 'hanging', `lined up with the crane hook: the overlay shows it (${s.overlay.crane}, crane ${s.crane})`);
  await shot('crane_lined_up');
  await hold('Space', 0.3);
  await run(0.8, 1 / 30, 1000);
  check((await stats()).crane !== 'hanging', `firing lined up drops the pallet (${(await stats()).crane})`);
  await hold('ArrowDown', 0.6);
  await tap('KeyR');
  a = await P();
  check(a.wstate === 'reload' || a.bullets === 6, `R reloads (${a.wstate}, ${a.bullets})`);
  await run(2, 1 / 30, 1000);
  await page.mouse.move(640, 420);
  await page.mouse.down();
  await run(0.7, 1 / 30, 1000);
  await page.mouse.up();
  b = await P();
  check(b.shots > a.shots, `left mouse fires (${a.shots} → ${b.shots} shots)`);
  await page.evaluate(() => window.__lf.money(5000));
  await tap('KeyB');
  a = await P();
  check(a.owned.includes('harpoon') && a.weapon === 'harpoon', `B buys the best affordable (${a.owned} / ${a.weapon})`);
  await tap('KeyQ');
  b = await P();
  check(b.weapon !== a.weapon, `Q cycles weapons (${a.weapon} → ${b.weapon})`);
  await tap('Digit1');
  check((await P()).weapon === 'revolver', '1 selects the revolver');
  const tiles = page.locator('.lf-tile');
  await tiles.nth(5).click();
  await run(0.05, 1 / 30, 1000);
  check(await tiles.nth(5).evaluate((e) => e.classList.contains('is-deny')), 'clicking an unaffordable tile is denied');
  await tiles.nth(2).click();
  await run(0.1, 1 / 30, 1000);
  a = await P();
  check(a.owned.includes('shotgun') && a.weapon === 'shotgun', `clicking a tile buys it (${a.weapon}, $${a.money})`);
  await tap('KeyH', 0.2);
  check(!(await P()).horn, 'H blows the ferry horn');
  await page.evaluate(() => {
    const lf = window.__lf;
    lf.world().setFavour(100);
    lf.spawn('shambler', -6, lf.world().player.z);
  });
  await tap('KeyF', 0.3);
  check((await P()).favour < 100, 'F calls the deck gun when the Favour is full');
  await tap('KeyE', 0.15);
  check((await P()).state === 'air', 'E jumps (stomp)');
  await run(1, 1 / 30, 30);
  await shot('controls');
  await tap('KeyP');
  check((await stats()).mode === 'paused', 'P pauses');
  await page.waitForTimeout(350);
  await tap('KeyP');
  check((await stats()).mode === 'playing', 'P resumes');
  await page.evaluate(() => window.__lf.autoplay(true));

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

  // ---- the fast way to the end: chapter 3, the Riot Squad, the ferry departs.
  const start3 = await page.evaluate(() => {
    const lf = window.__lf;
    lf.god(true);
    lf.setChapter(3);
    const p = lf.world().player;
    return { money: p.money, owned: [...p.owned.keys()] };
  });
  await run(3, 1 / 15, 45);
  // Lose chapter 3 once: the results offer "Retry chapter 3" with the money and guns it began with.
  await page.evaluate(() => {
    const lf = window.__lf;
    lf.god(false);
    lf.world().pier.hornReady = false;
    lf.spawn('shambler', 21.3, 0, { life: 9999 });
  });
  await run(6, 1 / 30, 30);
  s = await stats();
  const labels = await page.evaluate(() => [...document.querySelectorAll('.lf-results .lf-btn')].map((b) => b.textContent));
  check(s.screen === 'gameover' && labels[0] === 'Retry chapter 3' && labels.includes('Restart night'), `game over in chapter 3 offers ${JSON.stringify(labels)}`);
  await shot('gameover_retry_options');
  await page.waitForTimeout(400);
  await page.keyboard.press('Enter');
  await run(0.3, 1 / 30, 9);
  const again3 = await page.evaluate(() => {
    const p = window.__lf.world().player;
    return { chapter: window.__lf.world().chapter, money: p.money, owned: [...p.owned.keys()] };
  });
  check(again3.chapter === 3 && again3.money === start3.money && again3.owned.join() === start3.owned.join(), `Retry chapter 3 restarts it with the same money and guns (${JSON.stringify(again3)})`);
  await page.evaluate(() => window.__lf.god(true));
  await run(3, 1 / 15, 45);
  await page.evaluate(() => window.__lf.skipToBoss());
  await run(4, 1 / 15, 60);
  s = await stats();
  check(s.chapter === 3 && s.phase === 'boss', `chapter 3 boss phase (${s.chapter}/${s.phase})`);
  await shot('ch3_boss');
  await page.evaluate(() => {
    const lf = window.__lf;
    lf.autoplay(false);
    for (const b of lf.world().level.bosses) b.life = 0;
    // A straggler in front of the gangway that the boss's death leaves behind.
    lf.spawn('shambler', 4, 1.5, { life: 9999 }).speed = 0;
  });
  await run(1.5, 1 / 15, 20);
  s = await stats();
  check(s.mode === 'playing' && s.phase === 'boss' && s.mopUp && s.stragglers > 0, `bosses down, stragglers left: mop-up, the pier is not held yet (${s.phase}, mopUp ${s.mopUp}, ${s.stragglers} left)`);
  const mopHud = await page.evaluate(() => document.querySelector('.lf-boss-name')?.textContent + ' · ' + document.querySelector('.lf-boss-pct')?.textContent);
  check(/MOP UP/.test(mopHud) && /LEFT/.test(mopHud), `the HUD shows the mop-up (${mopHud})`);
  await shot('mopup');
  await page.evaluate(() => {
    for (const z of window.__lf.world().zombies) z.life = 0;
  });
  await run(5, 1 / 15, 75);
  s = await stats();
  check(s.mode === 'victory', `beating the last boss and mopping up wins (${s.mode}/${s.phase})`);
  await run(3, 1 / 15, 45);
  s = await stats();
  check(s.departure > 0 && s.t > 0, `the ferry departs while the pier lives on (departure ${s.departure.toFixed(2)})`);
  await shot('victory_departure');
  await run(4, 1 / 15, 60);
  s = await stats();
  check(s.screen === 'victory', `victory screen (${s.screen})`);
  await shot('victory_screen');
  await page.waitForTimeout(2800); // the results ignore keys until "TO BE CONTINUED" has played
  await page.keyboard.press('Enter');
  await run(0.3, 1 / 30, 9);
  s = await stats();
  check(s.mode === 'playing' && s.t < 1, `Play again starts a new game (${s.mode}, t ${s.t})`);
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
    ['boss3_late', (s) => s.chapter === 3 && s.phase === 'boss' && s.bossLife < 0.5],
    ['victory_departure', (s) => s.mode === 'victory' && s.departure > 0.15],
    ['victory_screen', (s) => s.screen === 'victory'],
  ];
  const deadline = Date.now() + 150 * 60 * 1000;
  let last = '';
  while (Date.now() < deadline) {
    // Big frames (1/15 s: the ragdoll physics' most per frame), drawing only every 45th:
    // the run is CPU bound in software GL.
    await run(s?.phase === 'boss' ? 1.2 : 3, 1 / 15, 45);
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
