// Story test — narrative-1: PROLOGUE (Kettle Run), CHAPTER I (After Hours) and the item scripts.
// Plays the chapters the way a player would (real walking with collisions, props by interaction, triggers
// by stepping on them), asserting flags / items / chapter / objective at each beat, then checks the
// alternative branches (time-gated vanish, vanish facing east, backpack taken by hand, reload fallback,
// replay abbreviations, item variants), and finally captures screenshots WITHOUT autoAdvance, driving real
// input and pausing on dialogue boxes.
//
//   node tests/story_n1.mjs              all phases
//   node tests/story_n1.mjs --no-shots   skip the screenshot phase
//   HW_SHOTS=<dir>                       where the screenshots go (default <tmp>/hallowell-shots, prefix n1_)
import path from 'node:path';
import { launch, openGame, suite, SHOTS } from './lib.mjs';

const NO_SHOTS = process.argv.includes('--no-shots');
const T = suite('story_n1');
const browser = await launch();
const game = await openGame(browser);
const page = game.page;
const hw = (fn, ...a) => game.hw(fn, ...a);

// ---- in-page helpers -------------------------------------------------------------------------------
await page.evaluate(() => {
  const H = () => window.__HW;
  window.__n1 = {
    /** Did anyone say/think/narrate a line containing `sub` (optionally by `who`)? */
    said(sub, who) {
      return H().transcript.some((t) => ['say', 'think', 'narrate'].includes(t.type) && String(t.text).includes(sub) && (!who || t.who === who));
    },
    lines(from = 0) {
      return H().transcript.slice(from).filter((t) => ['say', 'think', 'narrate'].includes(t.type)).map((t) => `${t.type}:${t.who || ''}:${t.expr || ''}: ${t.text}`);
    },
    mark() { return H().transcript.length; },
    /** Walk (real input, A*), face, press confirm, wait for idle. */
    async use(target, dir) {
      const ok = await H().walkTo(target);
      if (dir) H().face(dir);
      await H().steps(2);
      await H().interact();
      await H().idle(120);
      return ok;
    },
    lightsClean() {
      const HW = H().HW;
      return {
        keep: HW.lighting.lights.filter((l) => l._n1keep).length,
        selfGlow: HW.lighting.selfGlow?.on !== false,
        forced: HW.flashlight.forced,
        radiusScale: HW.lighting.flashlight?.radiusScale ?? 1,
      };
    },
    // Real-input dialogue driving (screenshot phase): advance every finished line until one containing
    // `sub` has typed `frac` of itself, then return (the box stays up for the screenshot).
    async line(sub, frac = 1, timeout = 45) {
      const ui = H().HW.ui; const t0 = performance.now();
      while (performance.now() - t0 < timeout * 1000) {
        const d = ui.dialogue; const l = d.cur;
        if (l) {
          const pg = l.pages[l.page];
          if (String(l.text).includes(sub)) { if (l.elapsed >= pg.end * frac + (frac >= 1 ? 0.05 : 0)) return true; }
          else if (l.elapsed >= pg.end + 0.05 && !l.opts.hold) H().HW.input.tap('confirm');
        } else if (d.choiceState?.ready) H().HW.input.tap('confirm');
        await H().steps(1);
      }
      return false;
    },
    async drain(timeout = 90) {
      const HW = H().HW; const ui = HW.ui; const t0 = performance.now();
      while (performance.now() - t0 < timeout * 1000) {
        const d = ui.dialogue; const l = d.cur;
        if (l) { const pg = l.pages[l.page]; if (l.elapsed >= pg.end && !l.opts.hold) HW.input.tap('confirm'); }
        else if (d.choiceState?.ready) HW.input.tap('confirm');
        if (H().mode() === 'play' && !HW.scripts.blocking && !ui.isBusy()) return true;
        await H().steps(1);
      }
      return false;
    },
    /** Switch to autoAdvance, releasing a line the UI is already showing. */
    async fast(ts = 4) {
      const HW = H().HW;
      H().autoAdvance(true);
      H().timeScale(ts);
      for (let i = 0; i < 240 && (HW.ui.dialogue.cur || HW.ui.dialogue.queue.length); i++) { HW.input.tap('confirm'); await H().steps(2); }
    },
    async until(src, timeout = 60) {
      const f = new Function('HW', `return (${src});`);
      const t0 = performance.now();
      while (performance.now() - t0 < timeout * 1000) { if (f(H().HW)) return true; await H().steps(1); }
      return false;
    },
  };
});
const said = (sub, who) => page.evaluate(([s, w]) => window.__n1.said(s, w), [sub, who || null]);
const use = (target, dir) => page.evaluate(([t, d]) => window.__n1.use(t, d), [target, dir || null]);
const st = () => hw((H) => H.state());
const player = () => hw((H) => H.player());

// =====================================================================================================
// A. The critical path, end to end (autoAdvance; god mode is irrelevant here: nothing can catch Tess).
await T.step('prologue: pro.start (the car, then the lot)', async () => {
  const r = await hw(async (H) => {
    H.autoAdvance(true);
    H.timeScale(4);
    H.HW.debug.infiniteBattery = true;
    await H.newGame();
    await H.idle(120);
    const s = H.state();
    return { map: H.map(), ch: s.chapter, party: s.party, obj: s.objective, cp: s.checkpoint, light: !!s.entityLights?.danny,
      rain: !!H.HW.fx?._rain?.on || !!H.HW.fx?._rain?.target, mode: H.mode() };
  });
  T.eq(r.map, 'exterior', 'pro.start ends on the exterior');
  T.eq(r.ch, 0, 'chapter 0 (Prologue)');
  T.eq(r.party, ['danny', 'leah', 'marcus'], 'party of four');
  T.eq(r.obj, 'Get inside.', 'objective "Get inside."');
  T.eq(r.cp, 'prologue', 'checkpoint at the start of the lot');
  T.ok(r.light, "Danny's red flashlight rides with him");
  T.eq(r.mode, 'play', 'control returns');
  for (const [line, who] of [
    ['Mood lighting.', 'danny'], ['Never call me Theresa on tape.', 'tess'], ['Noted. {p} For the tape.', 'leah'],
    ['With me are Daniel Kovach', 'leah'], ['It\'s like the worst math problem ever.', 'danny'],
    ['Kovaches don\'t leave Kettle Run. We just get buried in it.', 'danny'], ['For the drive.', 'leah'],
    ["Pittsburgh's not till Thanksgiving.", 'tess'], ["So you'll have it.", 'leah'], ['transfer form', 'tess'],
    ["There's a light on.", 'marcus'], ['Uncle Frank.', 'danny'],
  ]) T.ok(await said(line, who), `car: "${line}"`);
});

await T.step('prologue: the exterior specials (oak, motto, car, sign, danger)', async () => {
  await use('oak', 'up');
  T.ok(await said('Brood Two. They came up in May. Seventeen years underground.', 'leah'), 'pro.oak: Brood Two');
  await hw(async (H) => { await H.walkTo([30, 9]); await H.walkTo([28, 8]); });
  await use([28, 7], 'up'); // the motto stone, from the end of the top step (the doors' trigger stops at x 27)
  T.ok(await said("Creepy, but sweet.", 'danny'), 'pro.motto: Danny');
  T.ok(await said("Let no one be left behind.", 'leah'), 'pro.motto: Leah translates');
  await use('car', 'up');
  T.ok(await said('Keys are in the visor. Nobody steals anything in Kettle Run.', 'leah'), 'pro.car: keys in the visor');
  T.ok(await said("There's nobody *in* Kettle Run.", 'danny'), 'pro.car: Danny');
  await use([33, 22], 'up');
  T.ok(await said('HALLOWE L CONS LIDATED SCH OL'), 'pro.sign');
  await use([43, 22], 'up');
  T.ok(await said('UNDERGROUND MINE FIRE'), 'pro.danger');
  T.ok(await said('The truth is out there, Scully.', 'danny'), 'pro.danger: Mulder');
  const s = await st();
  T.ok(!s.flags.pro_doors_cut, 'the doors are still chained');
});

await T.step('prologue: pro.doors → in → Chapter I', async () => {
  const ok = await hw(async (H) => { const a = await H.walkTo('front_doors'); const b = await H.walkTo([24, 7]); await H.idle(120); return a && b; });
  T.ok(ok, 'walked up the steps');
  const s = await st();
  T.ok(s.flags.pro_doors_cut, 'pro_doors_cut');
  T.ok(s.flags.trig_exterior_approach_doors, 'approach_doors fired once');
  T.eq(s.map, 'lobby', 'in the lobby');
  T.eq(s.chapter, 1, 'chapter 1');
  T.eq(s.mapState.exterior?.ext_front_doors?.state, 'open', 'the front doors stand open behind them');
  T.ok(s.flags.ch1_adair_glimpse, 'Miss Adair, one frame, in the trophy glass');
  T.eq(s.objective, 'Look around.', 'objective "Look around."');
  T.eq(s.party, ['danny', 'leah', 'marcus'], 'all four inside');
  const cps = await hw((H) => H.transcript.filter((t) => t.type === 'checkpoint').map((t) => t.text));
  T.ok(cps.includes('doors cut') && cps.includes('chapter 1'), 'checkpoints: doors cut, chapter 1', cps);
  T.ok(await said('He *basically* said I could borrow them.', 'danny'), 'Danny cuts the chain (bolt cutters)');
  T.ok(await said('Rubies in the handle.', 'danny'), 'Uncle Frank #1: the sword');
  T.ok(await said('mountain lion', 'leah'), 'motto already read → the mountain lion instead');
  const rain = await hw((H) => H.HW.fx?._rain?.on ?? null);
  T.ok(rain === false || rain === null, 'the rain stays outside', rain);
});

await T.step('ch1: the vestibule refuses (before the vanish)', async () => {
  const r = await hw(async (H) => { await H.walkTo([14, 24]); await H.press('down', 500); await H.idle(60); return H.player(); });
  T.ok(await said("We've been here four minutes. Danny'll never let us live it down.", 'leah'), 'Leah: four minutes');
  T.eq(r.map, 'lobby', 'still in the lobby');
  T.ok(r.ty <= 24, 'stepped back from the doors', r);
});

await T.step('ch1: into the lobby — portrait, plaque, group shot, base camp', async () => {
  await hw(async (H) => { await H.walkTo([14, 16]); await H.idle(120); });
  const s = await st();
  T.ok(s.flags.trig_lobby_enter_lobby, 'enter_lobby fired');
  T.ok(await said('He ate the Civil War.', 'danny'), 'Danny: He ate the Civil War.');
  T.ok(await said("Technically the mine was Pleasants's idea. Hallowell just got the statue.", 'leah'), 'Leah: Pleasants');
  T.ok(await said('first kept in 1894', 'leah'), 'Leah reads the plaque aloud');
  T.ok(await said('He made the day they died a holiday. {p} Cool. Normal.', 'leah'), 'Leah: Cool. Normal.');
  T.ok(s.flags.ch1_plaque_read && s.docs.plaque, 'plaque → Notes');
  T.ok(await said('Everybody say Hollow Hell.', 'leah'), 'group shot');
  T.ok(await said('bunny ears'), 'Danny does bunny ears');
  T.ok(s.flags.ch1_group_shot, 'ch1_group_shot');
  T.ok(s.flags.danny_bag_dropped, 'Danny drops his backpack');
  const bag = await hw((H) => H.prop('lobby_backpack'));
  T.ok(bag && bag.present, 'the backpack is by the bench');
  T.eq(s.party, ['danny', 'leah', 'marcus'], 'party back in the caterpillar');
  T.ok(!!s.entityLights?.leah, "Leah's camcorder LED rides with her");
  T.eq(await page.evaluate(() => window.__n1.lightsClean().keep), 0, 'the painting light is cleaned up');
});

await T.step('ch1: lobby props (portrait, memorial, plaque, trophy, east doors, backpack)', async () => {
  await use('portrait', 'up');
  T.ok(await said('His eyes follow you.', 'danny'), 'ch1.portrait');
  await use('memorial', 'up');
  T.ok(await said('Raymond Oakes was nine.', 'leah') && await said('Nothing.', 'marcus'), 'ch1.memorial: Marcus lingers');
  T.ok((await st()).docs.memorial, 'memorial doc read');
  await use('plaque', 'up');
  T.ok(await said("'His boys.'", 'marcus'), 'ch1.plaque');
  await use([10, 22], 'up');
  T.ok(await said('ALL-COUNTY BAND 1979') && await said('...Clarinet.', 'marcus'), 'ch1.trophy');
  await hw(async (H) => { await H.walkTo([25, 15]); await H.press('right', 400); await H.idle(60); });
  T.ok((await st()).flags.ch1_danny_shoulder && await said("That's a load-bearing door.", 'danny'), 'ch1.east_jammed: Kovach style');
  await hw(async (H) => { await H.walkTo([26, 15]); await H.press('right', 400); await H.idle(60); });
  T.ok(await said("Danny's shoulder didn't help."), 'ch1.east_jammed: the second try is just the door');
  await use('danny_bag', 'up');
  T.ok(await said('Hands off the Krimpets.', 'danny'), 'ch1.backpack before the vanish');
  T.ok(!(await st()).inv.bolt_cutters, 'no bolt cutters yet');
  T.eq((await st()).party, ['danny', 'leah', 'marcus'], 'party intact');
});

await T.step('ch1: the west hall — two rooms, the tiny chair', async () => {
  await hw(async (H) => { await H.walkTo([2, 15]); await H.walkTo([1, 15]); await H.idle(60); });
  T.eq((await player()).map, 'west1', 'west hall');
  await hw(async (H) => { await H.walkTo('in_rr'); await H.idle(60); });
  let s = await st();
  T.ok(s.flags.ch1_room_rr && s.flags.ch1_rooms_entered === 1, 'girls\' room counted', s.flags.ch1_rooms_entered);
  T.ok(await said("STATIC field report. Girls' room.", 'leah'), 'Leah: first field report gets the slate');
  T.ok(typeof s.flags.ch1_west1_t === 'number', 'west1 time recorded');
  await hw(async (H) => { await H.walkTo('in_101'); await H.idle(120); });
  s = await st();
  T.ok(s.flags.ch1_danny_stuck, 'ch1_danny_stuck');
  T.eq(s.flags.ch1_rooms_entered, 2, 'two rooms');
  for (const [line, who] of [['The chairs are tiny. {p} Danny is not.', 'leah'], ["Dolan. {p} Dolan. I'm stuck.", 'danny'],
    ["You're not stuck.", 'tess'], ["I'm the guy who gets stuck. That's my whole thing.", 'danny'],
    ['Uncle Frank says cubbies were the best part of his education.', 'danny']]) T.ok(await said(line, who), `101: "${line}"`);
  T.eq(s.party, ['danny', 'leah', 'marcus'], 'Danny back in the party after the chair');
  const chair = await hw((H) => ({ a: H.prop('w1_tiny_chair')?.present ?? false, b: H.prop('w1_tiny_chair_after')?.present ?? false }));
  T.ok(!chair.a && chair.b, 'the chair swapped to its after-state', chair);
});

await T.step('ch1: THE VANISH by the bell schedule', async () => {
  await hw(async (H) => { await H.walkTo([22, 15]); await H.walkTo([18, 15]); await H.idle(120); });
  const s = await st();
  T.ok(s.flags.ch1_danny_vanished, 'ch1_danny_vanished');
  T.ok(s.flags.ch1_kevin_glimpse, 'the orange belt, one frame');
  T.eq(s.party, ['leah', 'marcus'], 'Danny is gone');
  T.ok(!(await hw((H) => !!H.HW.entities.get('danny'))), 'no Danny entity');
  T.ok(!s.entityLights?.danny, "Danny's attached light is gone with him");
  T.ok(s.inv.danny_flashlight === 1, "Tess has Danny's flashlight");
  T.ok(s.flags.ch1_102_rows, '102 rearranged in the dark');
  T.eq(s.objective, 'Room 102. Danny?', 'objective: Room 102');
  for (const [line, who] of [["Quit running, man. Floor's rotten.", 'marcus'], ["I'm *jogging*. Backwards. It's different.", 'danny'],
    ['four Yuenglings deep at the Legion', 'danny'], ['Not funny.', 'leah'], ["I'm *recording*, Danny.", 'leah'],
    ["He's never not mid-sentence.", 'tess'], ['...Theresa? {p=0.6}In here.', 'voice'], ['He never calls you that.', 'leah']]) {
    T.ok(await said(line, who), `vanish: "${line}"`);
  }
  const lc = await page.evaluate(() => window.__n1.lightsClean());
  T.eq(lc, { keep: 0, selfGlow: true, forced: null, radiusScale: 1 }, 'lighting restored after the dark');
  const door = await hw((H) => H.prop('w1_door_102')?.state);
  T.eq(door, 'open', '102 door eased open');
});

await T.step('ch1: Room 102 — rows, DANIEL KOVACH — PRESENT', async () => {
  await hw(async (H) => { await H.walkTo('in_102'); await H.idle(120); });
  const s = await st();
  T.ok(s.flags.ch1_room102_done, 'ch1.room102 ran');
  T.ok(await said("Danny can't spell 'present.'", 'marcus'), 'Marcus: spell present');
  T.eq(s.objective, 'Get out. Get help.', 'objective: Get out. Get help.');
  const board = await hw((H) => ({ p: H.prop('w1_chalk_102')?.present, row: H.prop('w1_102_r18_6')?.present, sc: H.prop('w1_102_s1')?.present ?? false }));
  T.ok(board.p && board.row && !board.sc, 'chalk + rows present, scattered gone', board);
});

await T.step('ch1: the bolt cutters on the way to the doors', async () => {
  await hw(async (H) => { await H.walkTo([60, 15]); await H.walkTo([61, 15]); await H.idle(60); await H.walkTo([15, 16]); await H.walkTo([14, 18]); await H.idle(120); });
  const s = await st();
  T.ok(s.inv.bolt_cutters === 1, 'bolt cutters taken from Danny\'s bag');
  T.ok(await said("He'll want these back.", 'tess'), 'Tess: He\'ll want these back.');
  T.eq(s.party, ['leah', 'marcus'], 'party: Leah, Marcus');
});

await T.step('ch1: the front doors loop (seamless) → Chapter II', async () => {
  const before = await page.evaluate(() => window.__n1.mark());
  await hw(async (H) => { await H.walkTo([14, 23]); await H.walkTo([14, 24]); await H.press('down', 900); await H.idle(180); });
  const s = await st();
  T.ok(s.flags.ch1_front_loop, 'ch1_front_loop');
  T.eq(s.map, 'west1', 'out of the library doors, west hall');
  T.ok(s.chapter >= 2, 'chapter 2', s.chapter);
  const tr = await hw((H, b) => H.transcript.slice(b).map((t) => `${t.type}:${t.text}`), before);
  T.ok(tr.some((x) => x.includes('transfer:lobby>west1') && x.includes('seamless')), 'the transfer is seamless', tr.filter((x) => x.startsWith('transfer')));
  T.ok(await said("That's the stairwell. {p} The collapsed one.", 'tess'), 'Tess: the stairwell');
  T.ok(await said('We walked in a straight line.', 'leah') && await said('Yeah.', 'marcus'), 'Leah / Marcus');
  T.eq(s.mapState.west1?.w1_library_doors?.state, 'jammed', 'the library doors stay jammed');
  T.ok(tr.some((x) => x === 'checkpoint:chapter 2'), 'Chapter II checkpoint');
  T.ok(!s.entityLights?.leah, 'the LED leaves with the chapter');
});

await T.step('ch1: line budgets (DESIGN §6: Pro 30, Ch1 35, ±20%)', async () => {
  const c = await hw((H) => {
    const tr = H.transcript;
    const i1 = tr.findIndex((t) => t.type === 'card' && String(t.text).startsWith('I —'));
    const i2 = tr.findIndex((t) => t.type === 'card' && String(t.text).startsWith('II —'));
    const isLine = (t) => ['say', 'think', 'narrate'].includes(t.type);
    const proCar = tr.slice(0, tr.findIndex((t) => t.type === 'transfer')).filter(isLine).length;
    const pro = tr.slice(0, i1).filter(isLine).length;
    const ch1 = tr.slice(i1, i2).filter(isLine).length;
    return { proCar, pro, ch1 };
  });
  console.log('       lines:', JSON.stringify(c), '(this run includes every optional prop)');
  T.ok(c.proCar >= 24 && c.proCar <= 34, 'car scene ≈ 30 lines', c.proCar);
});

// =====================================================================================================
// B. Branches and abbreviations.
/** Fresh Ch1 state in the lobby after enter_lobby, without replaying the Prologue. */
async function ch1Setup(H, extra = {}) {
  H.autoAdvance(true);
  H.timeScale(4);
  await H.newGame({ skipIntro: true });
  await H.teleport('lobby', 'from_exterior');
  for (const [k, v] of Object.entries({ pro_doors_cut: true, trig_lobby_enter_lobby: true, seen_ch1_enter_lobby: true,
    danny_bag_dropped: true, ch1_plaque_read: true, ...extra })) H.setFlag(k, v);
  H.HW.state.chapter = 1;
  H.HW.state.party = ['danny', 'leah', 'marcus'];
  H.refresh();
  await H.steps(2);
}

await T.step('branch: vanish by time (one room, 90 s in the hall), facing east', async () => {
  const r = await hw(async (H, setup) => {
    await (new Function(`return (${setup})`)())(H);
    await H.teleport('west1', [11, 15]);
    H.setFlag('ch1_rooms_entered', 1);
    H.setFlag('ch1_room_103', true);
    H.setFlag('ch1_west1_t', H.HW.state.playtime - 95);
    await H.steps(2);
    await H.walkTo([16, 15]);
    await H.idle(120);
    const s = H.state();
    return { v: s.flags.ch1_danny_vanished, fl: s.inv.danny_flashlight, party: s.party, dir: H.player().dir, err: H.errors.length };
  }, ch1Setup.toString());
  T.ok(r.v && r.fl === 1, 'time-gated vanish fires (facing east)', r);
  T.eq(r.party, ['leah', 'marcus'], 'party after the east-facing vanish');
  const lc = await page.evaluate(() => window.__n1.lightsClean());
  T.eq(lc.keep, 0, 'no stray lights');
});

await T.step('branch: no vanish with one room and < 90 s', async () => {
  const r = await hw(async (H, setup) => {
    await (new Function(`return (${setup})`)())(H);
    await H.teleport('west1', [11, 15]);
    H.setFlag('ch1_rooms_entered', 1);
    H.setFlag('ch1_west1_t', H.HW.state.playtime - 10);
    await H.walkTo([16, 15]);
    await H.idle(30);
    return H.state().flags.ch1_danny_vanished || false;
  }, ch1Setup.toString());
  T.eq(r, false, 'the vanish waits');
});

await T.step('branch: backpack taken by hand after the vanish (no lobby beat)', async () => {
  const r = await hw(async (H, setup) => {
    await (new Function(`return (${setup})`)())(H, { ch1_danny_vanished: true, trig_lobby_enter_lobby: false });
    H.HW.state.party = ['leah', 'marcus'];
    H.refresh();
    await H.teleport('lobby', [16, 9]);
    H.face('down');
    await H.steps(2);
    await H.interact();
    await H.idle(60);
    const got = H.state().inv.bolt_cutters;
    const mark = H.transcript.length;
    await H.walkTo([15, 16]);
    await H.walkTo([14, 18]);
    await H.idle(60);
    const extra = H.transcript.slice(mark).filter((t) => t.type === 'say').length;
    return { got, extra, again: H.state().inv.bolt_cutters };
  }, ch1Setup.toString());
  T.eq(r.got, 1, 'bolt cutters from the bag');
  T.eq(r.extra, 0, 'the lobby trigger then has nothing to say');
  T.eq(r.again, 1, 'still exactly one pair');
});

await T.step('branch: reload at "doors cut" — walking in still starts Chapter I', async () => {
  const r = await hw(async (H) => {
    H.autoAdvance(true);
    await H.newGame({ skipIntro: true });
    await H.teleport('exterior', [24, 8]);
    H.HW.state.chapter = 0;
    H.HW.state.party = ['danny', 'leah', 'marcus'];
    H.setFlag('pro_doors_cut', true);
    H.setFlag('trig_exterior_approach_doors', true);
    H.HW.game.setProp('ext_front_doors', 'open');
    H.refresh();
    await H.walkTo([24, 5]);
    await H.walkTo([24, 4]);
    await H.idle(60);
    const map = H.map();
    await H.walkTo([14, 16]);
    await H.idle(120);
    const s = H.state();
    return { map, ch: s.chapter, f: s.flags.seen_ch1_enter_lobby, bag: s.flags.danny_bag_dropped };
  });
  T.eq(r.map, 'lobby', 'through the open doors into the lobby');
  T.ok(r.ch === 1 && r.f && r.bag, 'enter_lobby falls back to g.chapter(1) and plays', r);
});

await T.step('branch: nobody read the motto — Leah reads it at the doors', async () => {
  const r = await hw(async (H) => {
    H.autoAdvance(true);
    H.timeScale(4);
    await H.newGame({ skipIntro: true });
    H.HW.state.chapter = 0;
    H.HW.state.party = ['danny', 'leah', 'marcus'];
    H.refresh();
    await H.teleport('exterior', 'front_doors');
    const m = H.transcript.length;
    await H.walkTo([24, 7]);
    await H.idle(120);
    const tr = H.transcript.slice(m).map((t) => String(t.text));
    return { creepy: tr.some((t) => t.includes('Creepy, but sweet.')), latin: tr.some((t) => t.includes('Nemo relinquatur.')),
      lion: tr.some((t) => t.includes('mountain lion')), map: H.map(), ch: H.state().chapter };
  });
  T.ok(r.latin && r.creepy && !r.lion, 'motto at the doors (not the mountain lion)', r);
  T.ok(r.map === 'lobby' && r.ch === 1, 'and in', r);
});

await T.step('replay: seen scenes abbreviate', async () => {
  const r = await hw(async (H, setup) => {
    await (new Function(`return (${setup})`)())(H, { trig_lobby_enter_lobby: false, danny_bag_dropped: false, ch1_plaque_read: false });
    const m = H.transcript.length;
    await H.walkTo([14, 16]);
    await H.idle(60);
    const lines = H.transcript.slice(m).filter((t) => t.type === 'say').length;
    const s = H.state();
    return { lines, bag: s.flags.danny_bag_dropped, plaque: s.flags.ch1_plaque_read };
  }, ch1Setup.toString());
  T.ok(r.lines === 0 && r.bag && r.plaque, 'seen enter_lobby: no dialogue, state applied', r);
});

await T.step('the memorial after the vanish: the Polaroid', async () => {
  const r = await hw(async (H, setup) => {
    await (new Function(`return (${setup})`)())(H, { ch1_danny_vanished: true });
    H.HW.state.party = ['leah', 'marcus'];
    H.refresh();
    await H.teleport('lobby', 'memorial');
    H.face('up');
    await H.steps(2);
    await H.interact();
    await H.idle(60);
    return H.transcript.some((t) => String(t.text).includes("That's my shot."));
  }, ch1Setup.toString());
  T.ok(r, "Leah: That's my shot.");
});

// =====================================================================================================
// C. Item scripts.
await T.step('item.mixtape: three readings of the same J-card', async () => {
  const r = await hw(async (H) => {
    H.autoAdvance(true);
    await H.newGame({ skipIntro: true });
    await H.teleport('west1', 'from_lobby');
    const out = {};
    const run = async (k) => { const m = H.transcript.length; await H.run('item.mixtape'); out[k] = H.transcript.slice(m).filter((t) => ['think', 'say', 'doc'].includes(t.type)).map((t) => `${t.type}:${t.text}`); };
    await run('before');
    H.setFlag('ch2_leah_taken', true); await run('taken');
    H.setFlag('ch5_leah_found', true); await run('lie');
    H.setFlag('bond_leah', true); await run('truth');
    return out;
  });
  T.ok(r.before.some((x) => x === 'doc:mixtape_jcard'), 'opens the J-card');
  T.ok(r.before.some((x) => x.includes('She is not sorry')), 'before: Side B joke');
  T.ok(r.taken.some((x) => x.includes('8/96')), 'Leah taken: the August date');
  T.ok(r.lie.some((x) => x.includes("I still haven't said it")), 'after the library, no truth');
  T.ok(r.truth.some((x) => x.includes('She meant Philly')), 'bond_leah: she meant Philly');
});

await T.step('item.camcorder: lobby shot / whole tape / put it away', async () => {
  const r = await hw(async (H) => {
    H.autoAdvance(true);
    await H.newGame({ skipIntro: true });
    await H.teleport('west1', 'from_lobby');
    H.give('camcorder');
    H.setFlag('ch2_vhs_seen', true);
    const out = [];
    for (const c of [0, 1, 2]) {
      H.choiceQueue = [c];
      const m = H.transcript.length;
      await H.run('item.camcorder');
      out.push(H.transcript.slice(m).map((t) => `${t.type}:${t.text}`));
    }
    return { out, f: H.state().flags };
  });
  T.ok(r.out[0].some((x) => x === 'screen:vhs') && r.out[0].some((x) => x.includes("Danny's doing the ears")), 'lobby shot');
  T.ok(r.out[1].some((x) => x === 'screen:vhs') && r.out[1].some((x) => x.includes('Still him')), 'whole tape');
  T.ok(!r.out[2].some((x) => x === 'screen:vhs'), "Don't.");
  T.ok(r.f.tape_lobby_watched === 1 && r.f.tape_full_watched === 1, 'counters');
});

await T.step('item.gum: five sticks, shared with Danny', async () => {
  const r = await hw(async (H, setup) => {
    await (new Function(`return (${setup})`)())(H);
    await H.teleport('west1', 'from_lobby');
    const m = H.transcript.length;
    await H.run('item.gum');
    const shared = H.transcript.slice(m).some((t) => String(t.text).includes('Share.'));
    const afterOne = H.state().flags.gum_sticks;
    for (let i = 0; i < 4; i++) await H.run('item.gum');
    return { shared, afterOne, left: H.state().flags.gum_sticks, inv: H.state().inv.gum || 0 };
  }, ch1Setup.toString());
  T.ok(r.shared && r.afterOne === 3, 'Danny gets one (two sticks gone)', r);
  T.eq(r.inv, 0, 'the pack runs out');
});

await T.step('no captured errors (functional phases)', async () => {
  T.eq(await game.errors(), [], 'no errors');
});

// =====================================================================================================
// D. Screenshots — real input, no autoAdvance; each pauses on a dialogue box (or a staged beat).
if (!NO_SHOTS) {
  const shot = async (name) => { const f = path.join(SHOTS, `n1_${name}.png`); await page.screenshot({ path: f }); return f; };
  const L = (sub, frac) => page.evaluate(([s, f]) => window.__n1.line(s, f), [sub, frac ?? 1]);
  const U = (src, t) => page.evaluate(([s, tt]) => window.__n1.until(s, tt), [src, t || 60]);
  const drain = () => page.evaluate(() => window.__n1.drain());
  const shots = [];
  const take = async (ok, name) => { if (ok) shots.push(await shot(name)); else T.ok(false, `shot ${name}: moment not reached`); };
  await T.step('screenshots', async () => {
    await hw(async (H) => { H.autoAdvance(false); H.timeScale(1); H.HW.debug.infiniteBattery = true; H.newGame(); });
    await take(await L('Mood lighting.'), '01_car');
    await take(await L("So you'll have it."), '02_car_tape');
    await drain();
    await hw(async (H) => { await H.walkTo('front_doors'); H.walkTo([24, 7]); });
    await take(await L('basically'), '03_doors');
    await page.evaluate(() => window.__n1.fast(4));
    await U("HW.map && HW.map.id === 'lobby' && HW.state.chapter === 1");
    await hw((H) => H.timeScale(0.25));
    await take(await U("((e) => !!(e && e.frameImage() && e.sortKey > 350))(HW.entities.get('adair_glass'))", 120), '04_adair_glass');
    await hw(async (H) => { H.timeScale(4); await H.idle(); H.autoAdvance(false); H.timeScale(1); H.walkTo([14, 16]); });
    await take(await L('He ate the Civil War.'), '05_portrait');
    await take(await L('Everybody say Hollow Hell.'), '06_group_shot');
    await drain();
    await hw(async (H) => { H.autoAdvance(true); H.timeScale(4); await H.walkTo([2, 15]); await H.walkTo([1, 15]); await H.idle(); await H.walkTo('in_rr'); await H.idle(); H.autoAdvance(false); H.timeScale(1); H.walkTo('in_101'); });
    await take(await L("I'm stuck."), '07_tiny_chair');
    await drain();
    await hw(async (H) => { H.timeScale(3); await H.walkTo([22, 15]); H.timeScale(1); H.walkTo([18, 15]); });
    await take(await L('Backwards.'), '08_jog');
    await L('gets to', 0.97);
    await hw((H) => H.timeScale(0.25));
    await take(await U("((e) => !!(e && e.frameImage()))(HW.entities.get('kevin'))", 30), '09_kevin');
    await hw((H) => H.timeScale(0.5));
    await U("!HW.entities.get('danny')");
    await page.waitForTimeout(300); shots.push(await shot('10_dark_jerk'));
    await page.waitForTimeout(1500); shots.push(await shot('11_dark_spin'));
    await hw((H) => H.timeScale(1));
    await take(await L('Not funny.'), '12_not_funny');
    await take(await L('In here.'), '13_voice_102');
    await drain();
    await hw((H) => { H.walkTo('in_102'); });
    await take(await L("spell 'present.'"), '14_room102');
    await drain();
    await hw(async (H) => { H.autoAdvance(true); H.timeScale(4); await H.walkTo([60, 15]); await H.walkTo([61, 15]); await H.idle(); await H.walkTo([15, 16]); await H.walkTo([14, 22]); await H.idle(); H.autoAdvance(false); H.timeScale(1); await H.walkTo([14, 24]); H.press('down', 900); });
    await take(await L('The collapsed one.'), '15_front_loop');
    console.log(`       screenshots: ${shots.length} in ${SHOTS} (n1_*.png)`);
    T.ok(shots.length >= 12, 'at least 12 key moments captured', shots.length);
    T.eq(await game.errors(), [], 'no errors during the real-input run');
  });
}

await game.close();
await browser.close();
process.exit(T.done() ? 0 : 1);
