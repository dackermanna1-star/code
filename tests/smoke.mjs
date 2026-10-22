// Smoke test: the dev page AND the built single file boot to the title, start a new game, walk
// around with real keyboard input, render, and produce no errors. Screenshots → $HW_SHOTS.
// node tests/smoke.mjs [--dev-only | --built-only]
import fs from 'node:fs';
import { launch, openGame, suite, SHOTS, DIST, STUBS } from './lib.mjs';

const T = suite('smoke');
const targets = process.argv.includes('--dev-only') ? [false] : process.argv.includes('--built-only') ? [true] : [false, true];
const browser = await launch();

for (const built of targets) {
  const tag = built ? 'built' : 'dev';
  let g;
  await T.step(`${tag} smoke`, async () => {
    g = await openGame(browser, { built });
    T.ok(true, `${tag}: boots (window.__ready)`);
    await g.page.waitForTimeout(400);
    await g.shot(`smoke_${tag}_title`);
    T.ok(['title', 'play'].includes(await g.mode()), `${tag}: title screen up (or auto-started by the stub UI)`);

    await g.hw(async (H) => {
      H.autoAdvance(true);
      await H.newGame({ skipIntro: true });
      if (H.map() !== 'test') await H.teleport('test', 'start');
    });
    T.eq(await g.mode(), 'play', `${tag}: new game in play mode`);
    await g.page.waitForTimeout(300);
    await g.shot(`smoke_${tag}_start`);

    // Real keyboard input through the page (not the debug API).
    await g.page.click('canvas#screen');
    const p0 = await g.player();
    await g.page.keyboard.down('ArrowRight');
    await g.page.waitForTimeout(700);
    await g.page.keyboard.up('ArrowRight');
    const p1 = await g.player();
    T.ok(p1.x > p0.x + 20, `${tag}: arrow keys walk right`, { p0: p0.x, p1: p1.x });
    await g.page.keyboard.down('Shift');
    await g.page.keyboard.down('KeyA');
    await g.page.waitForTimeout(500);
    await g.page.keyboard.up('KeyA');
    await g.page.keyboard.up('Shift');
    const p2 = await g.player();
    T.ok(p1.x - p2.x > 30, `${tag}: Shift+A runs left`, { p1: p1.x, p2: p2.x });
    await g.page.keyboard.down('ArrowUp');
    await g.page.waitForTimeout(900);
    await g.page.keyboard.up('ArrowUp');
    await g.page.waitForTimeout(200);
    await g.shot(`smoke_${tag}_walk`);

    // Walk into Room B through its door and look around.
    T.ok(await g.walkTo('in_b'), `${tag}: walkTo Room B`);
    await g.page.waitForTimeout(250);
    await g.shot(`smoke_${tag}_room_b`);

    const fps = await g.hw((H) => H.HW.game.fps);
    T.ok(fps >= 30, `${tag}: renders at a playable frame rate (${fps} fps headless)`, fps);
    T.eq(await g.errors(), [], `${tag}: no errors`);
  });
  await g?.close();
}

// The shipped file keeps the debug API and the F3 overlay to itself unless opened with ?debug.
if (targets.includes(true) && !STUBS && fs.existsSync(DIST)) {
  await T.step('built: no debug API without ?debug', async () => {
    const page = await browser.newPage({ viewport: { width: 960, height: 540 } });
    try {
      await page.goto(`file://${DIST}`);
      await page.waitForFunction(() => window.__ready === true, null, { timeout: 30000 });
      await page.evaluate(() => { window.__f3 = null; window.addEventListener('keydown', (e) => { if (e.code === 'F3') window.__f3 = e.defaultPrevented; }); });
      await page.keyboard.press('F3');
      const r = await page.evaluate(() => ({ api: typeof window.__HW, hw: typeof window.HW, f3: window.__f3 }));
      T.ok(r.api === 'undefined' && r.hw === 'undefined' && r.f3 === false, 'built: window.__HW / F3 overlay off without ?debug', r);
    } finally {
      await page.close();
    }
  });
}

await browser.close();
console.log(`screenshots: ${SHOTS}`);
process.exit(T.done() ? 0 : 1);
