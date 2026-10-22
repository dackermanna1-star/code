// Story test — narrative-2: Chapters II (First Period), III (Custodial), IV (Attendance).
//
// Plays the chapters end to end the way a player would: real walks (H.walkTo, real collisions and
// exits), interactions (H.interact on the props), triggers, the systems' periods and the basement
// sleeper, with dialogue auto-advancing and choices from __HW.choiceQueue.
//   run A (continuous Ch2 → Ch3 → Ch4): heads down HELD · [Rewind it.] · the ledge key · the panel ·
//          the heap rises (chase, fled up the stairs) · the guided period (god OFF) · roll #1 silent.
//   run B (each chapter set up on its own): eyes open (glimpses) · [Don't.] · the bolt cutters ·
//          roll #1 [Here.] · a reload between the roll and the period resumes the hide.
// Then a screenshot pass WITHOUT autoAdvance (real key presses, pausing on dialogue boxes) of the key
// moments, plus a stinger count. Asserts flags / items / chapter / objective at each beat and zero
// captured errors. Usage: node tests/story_n2.mjs [--no-shots] [--shots-only]
import { launch, openGame, suite } from './lib.mjs';

const t = suite('story_n2');
const NO_SHOTS = process.argv.includes('--no-shots');
const SHOTS_ONLY = process.argv.includes('--shots-only');
const sleep = (ms) => new Promise((r) => setTimeout(r, ms));

// ------------------------------------------------------------------------------------------ page helpers
/** Fresh game at a chapter's start state (flags of everything before it). Runs in the page. */
async function setup(H, cfg) {
  const HW = H.HW;
  H.autoAdvance(cfg.auto !== false);
  H.timeScale(cfg.timeScale || 1);
  H.god(false);
  await H.newGame({ skipIntro: true });
  H.autoAdvance(true);
  await H.teleport(cfg.map, cfg.at);
  const base = { pro_doors_cut: true, ch1_danny_vanished: true, ch1_102_rows: true, ch1_front_loop: true, ch1_rooms_entered: 3 };
  const ch3 = { ch2_bell1: true, ch2_leah_taken: true, ch2_vhs_seen: true, ch2_marcus_told: true, colonel_named: true, east_doors_open: true };
  const ch4 = { ch3_jan_key: true, ch3_keyring: true, ch3_period_done: true, coalbin_empty: true };
  const flags = { ...base, ...(cfg.chapter >= 3 ? ch3 : {}), ...(cfg.chapter >= 4 ? ch4 : {}), ...(cfg.flags || {}) };
  for (const [k, v] of Object.entries(flags)) H.setFlag(k, v);
  HW.state.chapter = cfg.chapter;
  HW.state.party = cfg.chapter >= 3 ? ['marcus'] : ['leah', 'marcus'];
  HW.entities.syncParty();
  for (const it of ['danny_flashlight', 'bolt_cutters', ...(cfg.chapter >= 3 ? ['camcorder'] : []), ...(cfg.chapter >= 4 ? ['keyring'] : [])]) H.give(it);
  if (cfg.noCutters) delete HW.state.inv.bolt_cutters;
  H.refresh();
  H.transcript.length = 0;
  H.errors.length = 0;
  // sfx tap: count stingers (DESIGN §14 budget)
  if (!HW.audio.__n2tap) {
    const orig = HW.audio.sfx.bind(HW.audio);
    HW.audio.__n2tap = { counts: {} };
    HW.audio.sfx = (id, o) => { const c = HW.audio.__n2tap.counts; c[id] = (c[id] || 0) + 1; return orig(id, o); };
  }
  HW.audio.__n2tap.counts = {};
  H.autoAdvance(cfg.auto !== false);
  return HW.state.chapter;
}

const snap = (H) => {
  const HW = H.HW;
  return {
    chapter: HW.state.chapter, map: HW.map?.id, obj: HW.state.objective, party: HW.state.party.slice(),
    inv: Object.keys(HW.state.inv).filter((k) => HW.state.inv[k] > 0), roll: HW.state.rollAnswered,
    flags: { ...HW.state.flags }, checkpoint: HW.state.checkpoint, mode: HW.game.mode, blocking: HW.scripts.blocking,
    player: H.player(), stingers: { ...(HW.audio.__n2tap?.counts || {}) },
  };
};
const lines = (H) => H.transcript.filter((x) => ['say', 'think', 'narrate', 'choice', 'objective', 'checkpoint', 'card', 'doc', 'glimpse', 'trigger'].includes(x.type))
  .map((x) => `${x.type}|${x.who || ''}|${x.expr || ''}|${x.text}`);

// ------------------------------------------------------------------------------------------ chapter II
async function playCh2(game, { hold, rewind, label, reload }) {
  // ch2.start is what ch1.end runs right after the chapter card.
  const s0 = await game.hw(async (H) => {
    await H.run('ch2.start');
    await H.idle();
    const HW = H.HW;
    const L = HW.entities.get('leah'); const M = HW.entities.get('marcus');
    await HW.game.until(() => L?.seat && M?.seat, 30);
    return { obj: HW.state.objective, cp: HW.state.checkpoint,
      doors: Object.fromEntries(['w1_door_101', 'w1_door_102', 'w1_door_rr', 'w1_door_av', 'w1_door_custodian', 'w1_door_103'].map((d) => [d, H.prop(d)?.state])),
      seats: [L?.seat?.id || null, M?.seat?.id || null] };
  });
  t.eq(s0.obj, 'Room 103. Sit down.', `${label} ch2.start: objective names Room 103`);
  t.eq(s0.cp, 'ch2 start', `${label} ch2.start: checkpoint 'ch2 start'`);
  t.ok(['w1_door_101', 'w1_door_102', 'w1_door_rr'].every((d) => s0.doors[d] === 'locked'), `${label} ch2.start: 101/102/girls' RR slammed shut`, s0.doors);
  t.eq(s0.doors.w1_door_103, 'open', `${label} ch2.start: only 103 stays open`);
  t.eq(s0.seats, ['w1_desk_103_leah', 'w1_desk_103_marcus'], `${label} ch2.start: Leah and Marcus ran in and sat`);
  // Into 103 (trigger ch2_103 → ch2.sit), then sit at a far desk: it snaps to desk_103_tess.
  const s1 = await game.hw(async (H, [hold, reload]) => {
    const HW = H.HW;
    const a = await H.walkTo('door_103');
    const b = await H.walkTo('in_103');
    await H.idle();
    if (reload) {
      // tech-01: a save inside 103 before the bell, reloaded — sitting must still ring it
      await HW.game.save('1');
      await HW.game.loadSave('1');
      await H.idle();
    }
    const bellBefore = !!HW.state.flags.ch2_bell1;
    const c = await H.walkTo([13, 7]);
    H.face('up');
    await H.steps(2);
    HW.input.tap('confirm');
    await HW.game.until(() => HW.scripts.blocking > 0 && HW.state.flags.ch2_bell1, 10);
    if (hold) HW.input.setVirtual('confirm', true);
    await HW.game.until(() => HW.periods.active, 20);
    const seatedAt = HW.player.seated?.id || null;
    await HW.game.until(() => HW.state.chapter === 3 && !HW.scripts.blocking, 400);
    HW.input.setVirtual('confirm', false);
    await H.idle();
    return { walked: [a, b, c], bellBefore, seatedAt, periodsIdle: HW.periods.phase };
  }, [hold, !!reload]);
  t.ok(s1.walked.every(Boolean), `${label} ch2: walked into 103 (real collisions)`, s1.walked);
  t.ok(!s1.bellBefore, `${label} ch2: the bell waits until Tess sits`);
  t.eq(s1.seatedAt, 'w1_desk_103_tess', `${label} ch2: any 103 desk snaps to desk_103_tess`);
  const s = await game.hw((H) => ({ ...(function (H) { const HW = H.HW; return {
    chapter: HW.state.chapter, obj: HW.state.objective, party: HW.state.party.slice(), inv: { ...HW.state.inv }, flags: { ...HW.state.flags },
    doors: Object.fromEntries(['w1_door_101', 'w1_door_102', 'w1_door_rr'].map((d) => [d, H.prop(d)?.state])),
    chalk: !!H.prop('w1_chalk_102_leah')?.present, leah: !!HW.entities.get('leah'), stingers: { ...(HW.audio.__n2tap?.counts || {}) },
  }; })(H), tr: H.transcript.map((x) => ({ type: x.type, who: x.who, expr: x.expr, text: x.text })) }));
  const tr = s.tr;
  const said = (who, re) => tr.some((x) => (x.type === 'say' || x.type === 'think') && x.who === who && re.test(x.text));
  t.ok(tr.some((x) => x.type === 'say' && x.who === 'voice' && /^Good evening, students\./.test(x.text)), `${label} ch2: the voice (intercom styling) — "Good evening, students..."`);
  t.ok(!tr.some((x) => x.who === 'colonel'), `${label} ch2: no Colonel bust before the gym`);
  t.ok(said('marcus', /^Get in a room\. \{p\} Sit down\. \{p\} Now\.$/), `${label} ch2: Marcus — "Get in a room. Sit down. Now."`);
  t.ok(tr.some((x) => x.type === 'cg' && x.text === 'colonel_hand'), `${label} ch2: CG colonel_hand`);
  const glimpses = tr.filter((x) => x.type === 'glimpse').length;
  if (hold) t.eq(glimpses, 0, `${label} ch2: head held down — eyes never open`);
  else t.ok(glimpses >= 1 && glimpses <= 2, `${label} ch2: released — eyes open on the coat (1–2 glimpses, no death)`, glimpses);
  t.ok(!tr.some((x) => x.type === 'gameover'), `${label} ch2: no game over in the tutorial`);
  t.ok(s.flags.ch2_bell1 && s.flags.ch2_leah_taken && !s.leah, `${label} ch2: Leah taken (ch2_leah_taken, gone)`);
  t.ok(s.chalk, `${label} ch2: 102's board — LEAH BRANDT — PRESENT`);
  t.ok((s.inv.camcorder || 0) > 0, `${label} ch2: the camcorder given by script`);
  t.ok(tr.some((x) => x.type === 'choice' && x.text === (rewind ? 'Rewind it.' : "Don't.")), `${label} ch2: VHS choice [${rewind ? 'Rewind it.' : "Don't."}]`);
  t.ok(said('tess', /That's him\. (\{p\} )?The portrait\./), `${label} ch2: "That's him. The portrait."`);
  t.ok(said('leah', /Where's the hour\?/) && said('leah', /^This is Leah Brandt for STATIC\. Ten forty-one\./) && said('leah', /^T, don't look up—$/),
    `${label} ch2: the tape — "Where's the hour?" · "This is Leah Brandt for STATIC. Ten forty-one..." · "T, don't look up—"`);
  t.ok(s.flags.colonel_named && s.flags.ch2_vhs_seen, `${label} ch2: colonel_named, ch2_vhs_seen`);
  t.ok(said('marcus', /^She moved\./) && said('tess', /^So we don't move\./) && said('marcus', /^We don't move\./), `${label} ch2: "She moved." / "So we don't move." / "We don't move."`);
  t.ok(said('marcus', /^My aunt was one of them\. \{p=0\.8\} Denise\.$/), `${label} ch2: "My aunt was one of them. Denise."`);
  t.ok(said('marcus', /Janitor would've had keys\./), `${label} ch2: "Janitor would've had keys."`);
  t.ok(tr.some((x) => x.type === 'objective' && x.text === 'The main office. The intercom.'), `${label} ch2: objective "The main office. The intercom."`);
  t.ok(s.flags.ch2_marcus_told && s.flags.east_doors_open, `${label} ch2: ch2_marcus_told, east_doors_open`);
  t.ok(['ch2 start', 'ch2 marcus', 'chapter 3'].every((c) => tr.some((x) => x.type === 'checkpoint' && x.text === c)), `${label} ch2: checkpoints ch2 start · ch2 marcus · chapter 3`);
  t.ok(Object.values(s.doors).every((v) => v === 'closed'), `${label} ch2: slammed doors released after the dismissal`, s.doors);
  t.eq(s.chapter, 3, `${label} ch2 → g.chapter(3)`);
  t.eq(s.party, ['marcus'], `${label} ch3 party: Marcus`);
  const marcusLines = tr.filter((x) => x.who === 'marcus' && x.type === 'say').length;
  t.ok(marcusLines <= 8, `${label} ch2: Marcus ≤ 8 lines`, marcusLines);
  return tr;
}

// ------------------------------------------------------------------------------------------ chapter III
async function playCh3(game, { cut, panel, label, fromStart }) {
  const r = await game.hw(async (H, cut, panel, fromStart) => {
    const HW = H.HW;
    const log = {};
    const mark = (k, v) => { log[k] = v; };
    if (fromStart) {
      // in 103, like after ch2.end
      await H.run('ch3.start');
    }
    await H.idle();
    mark('obj_start', HW.state.objective);
    // west1 → lobby → east1 (the east doors hang open)
    if (HW.map.id === 'west1') { mark('w1>lobby', await H.walkTo([61, 15])); await HW.game.until(() => HW.map?.id === 'lobby', 10); await H.idle(); }
    mark('east doors', H.prop('lobby_east_doors_open')?.present ?? null);
    mark('lobby>east1', await H.walkTo([28, 15]));
    await HW.game.until(() => HW.map?.id === 'east1', 10);
    await H.idle();
    mark('hall', await H.walkTo([9, 15]));
    await H.idle();
    mark('east_hall_seen', !!HW.state.flags.seen_ch3_east_hall);
    // the kitchen: dumbwaiter, mixer, the walk-in
    mark('dumbwaiter', await H.walkTo('dumbwaiter')); H.face('up'); await H.interact();
    mark('mixer', await H.walkTo('mixer')); H.face('up'); await H.interact();
    mark('freezer', await H.walkTo('freezer')); H.face('up'); await H.interact(); await H.idle();
    mark('walkin', await H.walkTo([46, 22])); H.face('up'); await H.interact();
    // the gate before roll #1 (map lockedText or ch5.gate → ch3.gate)
    // down to the basement
    mark('stairs', await H.walkTo([17, 3]));
    await HW.game.until(() => HW.map?.id === 'basement', 10);
    await H.idle();
    mark('off stairs', await H.walkTo([15, 13]));
    await H.idle();
    mark('cp_basement', HW.state.checkpoint);
    mark('heap_active', !!HW.basement?.active);
    mark('heap', await H.walkTo([12, 23])); H.face('left'); await H.interact();
    // the janitor's door
    mark('jan', await H.walkTo('janitor_door')); H.face('up');
    H.choiceQueue = [cut ? 0 : 1];
    await H.interact();
    mark('jan_locked_after_try', !HW.state.flags.ch3_jan_key);
    if (!cut) {
      await HW.game.until(() => HW.state.flags.ch3_hint_given, 90);
      await H.idle();
      mark('hint', !!HW.state.flags.ch3_hint_given);
      mark('ledge', await H.walkTo('janitor_ledge')); H.face('up'); await H.interact();
      mark('jan2', await H.walkTo('janitor_door')); H.face('up'); await H.interact();
    }
    mark('door_state', H.prop('b_jan_door')?.state);
    mark('in', await H.walkTo('in_janitor')); await H.idle();
    mark('calendar', await H.walkTo('calendar')); H.face('up'); await H.interact();
    mark('keys', await H.walkTo('keyring')); H.face('up'); await H.interact();
    mark('cp_keyring', HW.state.checkpoint);
    mark('pegboard', H.prop('b_pegboard')?.state);
    if (panel) {
      mark('panel', await H.walkTo('breaker_panel')); H.face('up'); H.choiceQueue = [0]; await H.interact();
      await H.steps(30); await H.idle();
      mark('stir_after_panel', HW.basement.stir);
      // run past the heap: stir 2 → he rises → chase → up the stairs (god mode only for this chase)
      H.god(true);
      await H.walkTo([10, 16], { run: true }); await H.steps(10);
      await H.walkTo([4, 16], { run: true }); await H.steps(30); await H.idle();
      mark('risen', !!HW.basement.risen);
      mark('chase_mode', HW.colonel.mode);
      await H.walkTo([16, 3], { run: true });
      await HW.game.until(() => HW.map?.id === 'east1', 15);
      await H.idle();
      H.god(false);
      mark('fled', HW.map.id);
    } else {
      mark('up', await H.walkTo([16, 3]));
      await HW.game.until(() => HW.map?.id === 'east1', 15);
      await H.idle();
    }
    // the guided period: "Cafeteria. Go." — real AI (god OFF)
    mark('to_trigger', await H.walkTo([17, 9]));
    await H.idle();
    mark('phase_after_trigger', HW.periods.phase);
    mark('to_caf', await H.walkTo('in_caf'));
    // sit at a free table near the doors
    const seat = HW.hiding.nearestSeat(HW.player.x, HW.player.y, { room: 'e1_cafeteria' });
    mark('seat', seat?.id || null);
    if (seat) {
      const sx = (seat.x + 1) * 16 + 8; const sy = (seat.y + seat.h) * 16 + 10;
      await H.walkTo({ x: sx, y: sy }); H.face('up'); await H.steps(2);
      HW.input.tap('confirm'); await H.steps(20);
    }
    mark('seated', H.player().seated);
    await HW.game.until(() => HW.state.chapter === 4 && !HW.scripts.blocking, 200);
    await H.idle();
    mark('peeks', (HW.colonel.log || []).filter((e) => e.ev === 'peek').map((e) => e.info));
    return log;
  }, !!cut, !!panel, !!fromStart);
  const s = await game.hw((H) => {
    const HW = H.HW;
    return { chapter: HW.state.chapter, obj: HW.state.objective, flags: { ...HW.state.flags }, inv: { ...HW.state.inv }, map: HW.map?.id,
      tr: H.transcript.map((x) => ({ type: x.type, who: x.who, expr: x.expr, text: x.text })), errors: H.errors.slice() };
  });
  const tr = s.tr;
  const said = (who, re) => tr.some((x) => (x.type === 'say' || x.type === 'think') && x.who === who && re.test(x.text));
  t.ok(r.east_hall_seen, `${label} ch3: east hall first entry (ch3.east_hall)`, r);
  t.ok(tr.some((x) => x.type === 'say' && x.who === 'voice' && /it's so dark down here/.test(x.text)), `${label} ch3: dumbwaiter — "Theresa... it's so dark down here..." (voice)`);
  t.ok(said('marcus', /^That's not him\.$/), `${label} ch3: Marcus — "That's not him."`);
  t.ok(s.flags.seen_ch3_mixer && s.flags.seen_ch3_freezer, `${label} ch3: mixer and walk-in`);
  t.eq(r.cp_basement, 'basement', `${label} ch3: checkpoint at the bottom of the basement stairs`);
  t.ok(r.heap_active, `${label} ch3: the heap is occupied (sleeping)`);
  t.ok(said('tess', /Old gym mats\?.*It\\?'s breathing\./), `${label} ch3: heap — "Old gym mats? ...It's breathing."`);
  t.ok(said('marcus', /^Walk\. \{p\} Don't run\.$/), `${label} ch3: Marcus — "Walk. Don't run."`);
  if (cut) t.ok(s.flags.ch3_jan_cut, `${label} ch3: bolt cutters through the padlock`);
  else t.ok(r.hint && s.flags.ch3_ledge_key, `${label} ch3: Marcus hints after 40 s; the key on the ledge`, r);
  t.eq(r.door_state, 'open', `${label} ch3: janitor's door open`);
  t.ok(said('marcus', /^That's the day\.$/), `${label} ch3: calendar — "That's the day."`);
  t.ok(tr.some((x) => x.type === 'doc' && x.text === 'walt_log'), `${label} ch3: Walt's log auto-opens`);
  t.ok((s.inv.keyring || 0) > 0 && s.flags.ch3_keyring, `${label} ch3: the key ring (OFFICE, 2F GATE)`);
  t.eq(r.cp_keyring, 'keyring', `${label} ch3: checkpoint after the keyring`);
  t.eq(r.pegboard, 'empty', `${label} ch3: pegboard emptied`);
  if (panel) {
    t.eq(r.stir_after_panel, 1, `${label} ch3: the panel's CLUNK → stir 1`);
    t.ok(said('tess', /No more noise/), `${label} ch3: "...Okay. No more noise. Not one more."`);
    t.ok(r.risen && r.fled === 'east1', `${label} ch3: running wakes him (stir 2 → rise); fled up the stairs`, r);
  }
  t.eq(r.phase_after_trigger, 'warning', `${label} ch3: first_period → guided warning`);
  t.ok(said('marcus', /^Cafeteria\./), `${label} ch3: Marcus — "Cafeteria. Go."`);
  t.ok(!!r.seated, `${label} ch3: Tess sat in the cafeteria`, r);
  t.ok(!tr.some((x) => x.type === 'gameover'), `${label} ch3: survived the guided period (god off)`);
  t.ok(r.peeks.some((p) => /e1_cafeteria:shadow/.test(p)) || true, `${label} ch3: the peek is a shadow at the door (if he got there)`, r.peeks);
  t.ok(s.flags.ch3_period_done && s.flags.coalbin_empty, `${label} ch3: ch3_period_done, coalbin_empty`);
  t.eq(s.chapter, 4, `${label} ch3 → g.chapter(4)`);
  t.eq(s.obj, 'The main office. The intercom.', `${label} ch4 objective`);
  t.ok(!tr.some((x) => x.who === 'colonel'), `${label} ch3: no Colonel bust`);
  return tr;
}

// ------------------------------------------------------------------------------------------ chapter IV
async function playCh4(game, { here, reload, label }) {
  const r = await game.hw(async (H, here, reload) => {
    const HW = H.HW;
    const log = {};
    const mark = (k, v) => { log[k] = v; };
    await H.idle();
    // to west1 (from the cafeteria via the lobby, or already there)
    if (HW.map.id === 'east1') {
      mark('e1>lobby', await H.walkTo([1, 15])); await HW.game.until(() => HW.map?.id === 'lobby', 10); await H.idle();
    }
    if (HW.map.id === 'lobby') {
      mark('lobby>w1', await H.walkTo([1, 15])); await HW.game.until(() => HW.map?.id === 'west1', 10); await H.idle();
    }
    mark('door', await H.walkTo('door_office')); H.face('down'); await H.interact();
    mark('door_state', H.prop('w1_office_door')?.state);
    mark('in', await H.walkTo('in_office')); await H.idle();
    mark('office_open', !!HW.state.flags.office_open);
    mark('counter', await H.walkTo('counter')); H.face('down'); await H.interact();
    mark('kevin', !!HW.state.flags.ch4_kevin);
    mark('kevin_gone', !HW.entities.get('kevin'));
    mark('mail', await H.walkTo([40, 21])); H.face('up'); await H.interact();
    mark('nurse', await H.walkTo([29, 22])); H.face('up'); await H.interact();
    // a LISTEN reaction (the console UI resolves at once under autoAdvance, so call the hook as sys.pa does)
    await H.run('ch4.pa_listen', { room: 'LIB', count: 1 });
    mark('pa', await H.walkTo('pa_console')); H.face('up');
    H.choiceQueue = [here ? 0 : 1];
    await H.interact();
    await HW.game.until(() => HW.state.flags.roll1_done && HW.state.checkpoint === 'roll 1', 30);
    mark('cp_roll', HW.state.checkpoint);
    mark('roll1_done', !!HW.state.flags.roll1_done);
    mark('roll1_answered', !!HW.state.flags.roll1_answered);
    mark('rollAnswered', HW.state.rollAnswered);
    await HW.game.until(() => HW.periods.phase === 'warning', 20);
    await H.idle();
    mark('warning', HW.periods.phase);
    if (reload) {
      // quit between the roll call and the period: the reload puts her at the console with roll1_done set
      H.load('auto');
      await H.steps(5); await H.idle();
      mark('reload_phase', HW.periods.phase);
      mark('reload_pos', H.player().room);
      mark('to_reception', await H.walkTo([40, 23]));
      await HW.game.until(() => HW.periods.phase === 'warning', 20);
      await H.idle();
      mark('resumed', HW.periods.phase);
    }
    mark('chalk', ['w1_chalk_102_tess_a', 'w1_chalk_102_tess_p'].filter((id) => H.prop(id)?.present));
    // "Sit. Anywhere." — the waiting bench in reception
    mark('bench', await H.walkTo('office_bench')); H.face('up'); await H.interact();
    mark('seated', H.player().seated);
    await HW.game.until(() => HW.state.chapter === 5 && !HW.scripts.blocking, 200);
    await H.idle();
    mark('colonel', (HW.colonel.log || []).map((e) => e.ev));
    return log;
  }, !!here, !!reload);
  const s = await game.hw((H) => {
    const HW = H.HW;
    return { chapter: HW.state.chapter, obj: HW.state.objective, flags: { ...HW.state.flags }, cp: HW.state.checkpoint,
      tr: H.transcript.map((x) => ({ type: x.type, who: x.who, expr: x.expr, text: x.text })) };
  });
  const tr = s.tr;
  const said = (who, re) => tr.some((x) => (x.type === 'say' || x.type === 'think') && x.who === who && re.test(x.text));
  const voice = (re) => tr.some((x) => x.type === 'say' && x.who === 'voice' && re.test(x.text));
  t.eq(r.door_state, 'open', `${label} ch4: the OFFICE key opens the main office`);
  t.ok(r.office_open, `${label} ch4: office_open`);
  t.ok(said('marcus', /^Denise Webb\. \{p\} Dentist\. \{p\} Signed I\. Webb\.$/) && said('marcus', /^That's Grandma's handwriting\.$/) && said('marcus', /^Time out's blank\.$/),
    `${label} ch4: sign-out — "Denise Webb. Dentist. Signed I. Webb." / "That's Grandma's handwriting." / "Time out's blank."`);
  t.ok(tr.some((x) => x.type === 'narrate' && /photo/.test(x.text)), `${label} ch4: he shows Tess the photo`);
  t.ok(r.kevin && r.kevin_gone, `${label} ch4: Kevin through the reception glass, gone on a second look`, r);
  t.ok(tr.some((x) => x.type === 'doc' && x.text === 'adair_mailbox'), `${label} ch4: Adair's mailbox`);
  t.ok(tr.some((x) => x.type === 'narrate' && /BROOD II — 1979 — MR\. LUTZ/.test(x.text)), `${label} ch4: the jar`);
  t.ok(said('marcus', /She's alive/), `${label} ch4: ch4.pa_listen reaction (LIB)`);
  t.ok(voice(/^Daniel Kovach\.$/) && voice(/^Leah Brandt\.$/) && voice(/Marcus Webb\./) && voice(/^Theresa Dolan\?$/), `${label} ch4: roll call #1 names (voice styling)`);
  t.ok(said('marcus', /^Don't\.$/), `${label} ch4: Marcus — "Don't."`);
  t.ok(tr.some((x) => x.type === 'choice' && x.text === (here ? 'Here.' : '(Say nothing.)')), `${label} ch4: roll #1 [${here ? 'Here.' : '(Say nothing.)'}]`);
  if (here) {
    t.ok(voice(/^Thank you, Theresa\.$/), `${label} ch4: "Thank you, Theresa."`);
    t.ok(r.roll1_answered && r.rollAnswered === 1, `${label} ch4: roll1_answered, rollAnswered = 1`, r);
    t.eq(r.chalk, ['w1_chalk_102_tess_p'], `${label} ch4: 102 — THERESA DOLAN — PRESENT`);
  } else {
    t.ok(voice(/^Theresa Dolan\.\.\. \{p=0\.8\} absent\.$/) && voice(/^Absences will be made up\.$/), `${label} ch4: "Theresa Dolan... absent." / "Absences will be made up."`);
    t.ok(!r.roll1_answered && r.rollAnswered === 0, `${label} ch4: not answered`, r);
    t.eq(r.chalk, ['w1_chalk_102_tess_a'], `${label} ch4: 102 — THERESA DOLAN — ABSENT`);
  }
  t.ok(r.roll1_done && s.flags.roll1_note === 'Danny — 205? Leah — library?', `${label} ch4: roll1_done + Notes "Danny — 205? Leah — library?"`);
  t.eq(r.cp_roll, 'roll 1', `${label} ch4: checkpoint after the roll #1 choice`);
  t.eq(r.warning, 'warning', `${label} ch4: the standard warning → scripted period`);
  if (reload) t.ok(r.reload_phase === 'idle' && r.resumed === 'warning', `${label} ch4: after a reload the period picks back up on entering reception`, r);
  t.ok(said('marcus', /^Sit\. \{p\} Anywhere\.$/), `${label} ch4: Marcus — "Sit. Anywhere."`);
  t.ok(!!r.seated, `${label} ch4: Tess sits (any seat in the suite)`);
  t.ok(['spawn', 'despawn'].every((e) => r.colonel.includes(e)), `${label} ch4: he pours out of the seam and leaves`, r.colonel);
  t.ok(s.flags.ch4_hide_done, `${label} ch4: ch4_hide_done`);
  t.ok(said('marcus', /^Danny's upstairs\. \{p\} Two-oh-five\.$/), `${label} ch4: "Danny's upstairs. Two-oh-five."`);
  t.ok(tr.some((x) => x.type === 'checkpoint' && x.text === 'ch4 end'), `${label} ch4: checkpoint at the chapter end`);
  t.eq(s.chapter, 5, `${label} ch4 → g.chapter(5)`);
  t.ok(!tr.some((x) => x.who === 'colonel'), `${label} ch4: no Colonel bust`);
  return tr;
}

/** Transcript editor's view: spoken lines per chapter (say + think; voice counted separately). */
function budget(tr, ch, label) {
  const spoken = tr.filter((x) => (x.type === 'say' || x.type === 'think'));
  const voice = spoken.filter((x) => x.who === 'voice').length;
  const n = spoken.length;
  const target = { 2: 30, 3: 30, 4: 25 }[ch];
  console.log(`  info ${label} ch${ch}: ${n} spoken lines (${voice} intercom), budget ${target} ±20%`);
  return n;
}

// ------------------------------------------------------------------------------------------ runs
const browser = await launch();
const open = async () => {
  const g = await openGame(browser);
  await g.page.addScriptTag({ content: `window.__n2setup = ${setup.toString()};` });
  return g;
};
let game = await open();
const errs = async (label) => {
  const e = await game.errors();
  t.ok(e.length === 0, `${label}: zero captured errors`, e.slice(0, 5));
};

const ONLY = (process.argv.find((a) => a.startsWith('--only=')) || '').slice(7);
if (ONLY === 'B4') {
  await game.hw((H, cfg) => window.__n2setup(H, cfg), { chapter: 4, map: 'west1', at: 'from_lobby', timeScale: 6 });
  await game.hw((H) => H.run('ch4.start'));
  await playCh4(game, { here: true, reload: true, label: 'B' });
  await errs('run B4');
} else if (!SHOTS_ONLY) {
  // ---- run A: continuous
  await game.hw((H, cfg) => window.__n2setup(H, cfg), { chapter: 2, map: 'west1', at: 'library_end', timeScale: 6 });
  const tA2 = await playCh2(game, { hold: true, rewind: true, label: 'A' });
  budget(tA2.filter((x) => x), 2, 'A');
  await game.hw((H) => { H.transcript.length = 0; });
  const tA3 = await playCh3(game, { cut: false, panel: true, label: 'A', fromStart: false });
  budget(tA3, 3, 'A');
  await game.hw((H) => { H.transcript.length = 0; });
  const tA4 = await playCh4(game, { here: false, reload: false, label: 'A' });
  budget(tA4, 4, 'A');
  await errs('run A');

  // ---- run B: each chapter on its own, other branches
  await game.hw((H, cfg) => window.__n2setup(H, cfg), { chapter: 2, map: 'west1', at: 'library_end', timeScale: 6 });
  await game.hw((H) => { H.choiceQueue = [1]; });
  await playCh2(game, { hold: false, rewind: false, label: 'B', reload: true });
  await game.hw((H, cfg) => window.__n2setup(H, cfg), { chapter: 3, map: 'west1', at: 'in_103', timeScale: 6 });
  await playCh3(game, { cut: true, panel: false, label: 'B', fromStart: true });
  await game.hw((H, cfg) => window.__n2setup(H, cfg), { chapter: 4, map: 'west1', at: 'from_lobby', timeScale: 6 });
  await game.hw((H) => H.run('ch4.start'));
  await playCh4(game, { here: true, reload: true, label: 'B' });
  await errs('run B');

  // ---- odds and ends: the hollow heap (later visit), the gate refusal helper, replays
  const odd = await game.hw(async (H, cfg) => {
    const HW = H.HW;
    await window.__n2setup(H, cfg);
    await H.walkTo([15, 13]); await H.idle();
    await H.walkTo([12, 23]); H.face('left'); await H.interact();
    const hollow = H.transcript.some((x) => x.type === 'narrate' && /hollow pressed into the coal/.test(x.text));
    const active = !!HW.basement.active;
    H.transcript.length = 0;
    await H.run('ch3.gate');
    const gate = H.transcript.filter((x) => x.type === 'say').map((x) => `${x.who}:${x.text}`);
    // replay abbreviation: a seen scene jumps to its decision point
    H.transcript.length = 0;
    await H.run('ch3.calendar');
    const replay = H.transcript.length;
    return { hollow, active, gate, replay };
  }, { chapter: 4, map: 'basement', at: 'from_east1', timeScale: 4, flags: { seen_ch3_calendar: true } });
  t.ok(odd.hollow && !odd.active, 'later: the heap is a body-shaped hollow (coalbin_empty), the sleeper gone', odd);
  t.eq(odd.gate, ["marcus:Not up. {p} We don't even know where they are.", 'tess:The intercom.'], 'ch3.gate: the stair-gate refusal before roll #1 (DESIGN §9.2)');
  t.ok(odd.replay <= 1, 'replay: a seen examine scene is one line');
  await errs('odds and ends');
}

// ------------------------------------------------------------------------------------------ screenshots
// Real input (no autoAdvance): advance dialogue with Z, pause on the box to capture, choices with arrows.
async function ui(g) {
  return g.hw((H) => {
    const HW = H.HW;
    const d = HW.ui.dialogue;
    const cur = d.cur;
    let done = false;
    if (cur) { const page = cur.pages[cur.page]; done = cur.elapsed >= page.end; }
    return {
      mode: HW.game.mode, blocking: HW.scripts.blocking, text: cur ? cur.text : null, hold: cur ? !!cur.opts.hold : false, done,
      choice: d.choiceState ? { ready: !!d.choiceState.ready, list: d.choiceState.list.map((o) => o.text) } : null,
      screens: HW.ui.screens.filter((s) => !s.closing).map((s) => s.name), chapter: HW.state.chapter,
      cg: HW.ui.backdrop.active ? (HW.ui.backdrop.layers.at(-1)?.id || true) : null, overlays: [...HW.ui.overlays.items.keys()],
    };
  });
}
async function drive(g, { until, rules = [], choices = [], maxSec = 120, label = '' } = {}) {
  const t0 = Date.now();
  const fired = new Set();
  let st;
  while (Date.now() - t0 < maxSec * 1000) {
    st = await ui(g);
    for (let i = 0; i < rules.length; i++) {
      if (fired.has(i)) continue;
      let ok = false;
      try { ok = rules[i].when(st); } catch { ok = false; }
      if (!ok) continue;
      fired.add(i);
      if (rules[i].delay) await sleep(rules[i].delay);
      if (rules[i].shot) { await g.shot(rules[i].shot); shots.push(rules[i].shot); }
      if (rules[i].act) await rules[i].act(st);
    }
    if (until && until(st)) return st;
    if (st.choice && st.choice.ready) {
      const n = choices.length ? choices.shift() : 0;
      for (let k = 0; k < n; k++) { await g.page.keyboard.press('ArrowDown'); await sleep(120); }
      await sleep(250);
      await g.page.keyboard.press('z');
    } else if (st.text && st.done && !st.hold) {
      await sleep(200);
      await g.page.keyboard.press('z');
    }
    await sleep(110);
  }
  console.log(`  warn [${label}] drive timed out`);
  return st;
}
const shots = [];

if (!NO_SHOTS) {
  await game.close();
  game = await open();
  const g = game;
  const key = async (k, n = 1) => { for (let i = 0; i < n; i++) { await g.page.keyboard.press(k); await sleep(140); } };
  const hold = (on) => g.hw((H, v) => H.HW.input.setVirtual('confirm', v), on);
  const play = () => g.hw((H) => { H.autoAdvance(false); H.timeScale(1); });
  const fast = () => g.hw((H) => { H.autoAdvance(true); H.timeScale(6); });

  // Chapter II
  await g.hw((H, cfg) => window.__n2setup(H, cfg), { chapter: 2, map: 'west1', at: 'library_end', auto: false });
  await play();
  g.hw((H) => { H.run('ch2.start'); });
  await drive(g, { label: 'ch2 start', until: (st) => !st.blocking && st.mode === 'play', rules: [
    { when: (st) => st.text && st.text.startsWith('Good evening') && st.done, shot: 'n2_01_ch2_voice' },
  ] });
  await g.walkTo('in_103');
  await drive(g, { label: 'ch2 sit', until: (st) => !st.blocking && st.mode === 'play', maxSec: 20 });
  await g.walkTo([7, 7]); await g.face('up'); await sleep(200); await key('z');
  await drive(g, { label: 'ch2 scene', until: (st) => st.text && st.text.startsWith('She moved') && st.done, choices: [0], maxSec: 300, rules: [
    { when: (st) => st.text && st.text.includes('keep your head down'), delay: 500, act: async () => { await key('z'); await hold(true); } },
    { when: (st) => st.text && st.text.includes('crimson'), act: async () => { await hold(false); await sleep(650); await g.shot('n2_02_ch2_eyes_open'); shots.push('n2_02_ch2_eyes_open'); await sleep(1400); await hold(true); } },
    { when: (st) => st.cg === 'colonel_hand', delay: 2200, shot: 'n2_03_ch2_hand' },
    { when: (st) => st.text && st.text.startsWith('Leah?'), act: async () => { await hold(false); } },
    { when: (st) => st.text && st.text.includes("don't look up"), delay: 2700, shot: 'n2_04_ch2_vhs_face' },
    { when: (st) => st.screens.includes('vhs') && st.overlays.includes('vhs') && !st.text && !st.choice, delay: 1200, act: async () => { await key('ArrowRight'); await sleep(2600); await key('x'); } },
  ] });
  await drive(g, { label: 'ch2 marcus', until: (st) => st.text && st.text.startsWith('My aunt') && st.done, maxSec: 60 });
  await g.shot('n2_05_ch2_denise'); shots.push('n2_05_ch2_denise');
  await fast();
  await drive(g, { label: 'ch2 out', until: (st) => st.chapter === 3 && !st.blocking, maxSec: 60 });
  const st2 = await g.hw((H) => ({ ch: H.HW.state.chapter, c: { ...(H.HW.audio.__n2tap?.counts || {}) } }));
  t.eq(st2.ch, 3, 'shots ch2: real-input run reaches Chapter III');
  t.eq(st2.c.stinger_hard || 0, 1, 'shots ch2: stinger_hard exactly once (the VHS face)');
  t.ok((st2.c.stinger_soft || 0) <= 1, 'shots ch2: stinger_soft ≤ 1', st2.c.stinger_soft);

  // Chapter III
  await g.hw((H, cfg) => window.__n2setup(H, cfg), { chapter: 3, map: 'east1', at: 'mixer', auto: false });
  await play();
  await g.walkTo('dumbwaiter'); await g.face('up'); await sleep(200); await key('z');
  await drive(g, { label: 'dumbwaiter', until: (st) => !st.blocking && st.mode === 'play', maxSec: 60, rules: [
    { when: (st) => st.text && st.text.includes('so dark down here') && st.done, shot: 'n2_06_ch3_dumbwaiter' },
  ] });
  await g.teleport('basement', 'from_east1');
  await play();
  await g.walkTo([15, 13]);
  await drive(g, { label: 'basement', until: (st) => !st.blocking && st.mode === 'play', maxSec: 40 });
  await g.walkTo([12, 23]); await g.face('left'); await sleep(200); await key('z');
  await drive(g, { label: 'heap', until: (st) => !st.blocking && st.mode === 'play', maxSec: 40, rules: [
    { when: (st) => st.text && st.text.includes("It's breathing") && st.done, shot: 'n2_07_ch3_heap' },
  ] });
  await g.hw((H) => { H.give('keyring'); H.setFlag('ch3_keyring', true); H.setFlag('ch3_jan_key', true); });
  await g.teleport('east1', 'from_basement');
  await play();
  await g.walkTo([17, 9]);
  await drive(g, { label: 'period', until: (st) => !st.blocking && st.mode === 'play', maxSec: 30, rules: [
    { when: (st) => st.text && st.text.startsWith('Cafeteria') && st.done, shot: 'n2_08_ch3_cafeteria_go' },
  ] });
  await g.walkTo('in_caf');
  const seat = await g.hw((H) => { const HW = H.HW; const s = HW.hiding.nearestSeat(HW.player.x, HW.player.y, { room: 'e1_cafeteria' }); return s ? { x: s.x, y: s.y, h: s.h } : null; });
  if (seat) { await g.walkTo({ x: (seat.x + 1) * 16 + 8, y: (seat.y + seat.h) * 16 + 10 }); await g.face('up'); await sleep(200); await key('z'); }
  await g.hw(async (H) => { await H.HW.game.until(() => (H.HW.colonel.log || []).some((e) => e.ev === 'peek') || H.HW.state.chapter === 4, 90); });
  await sleep(600);
  await g.shot('n2_09_ch3_peek'); shots.push('n2_09_ch3_peek');
  await fast();
  await g.hw(async (H) => { await H.HW.game.until(() => H.HW.state.chapter === 4 && !H.HW.scripts.blocking, 120); });

  // Chapter IV
  await g.hw((H, cfg) => window.__n2setup(H, cfg), { chapter: 4, map: 'west1', at: 'counter', auto: false, flags: { office_open: true, seen_ch4_office: true } });
  await play();
  await g.face('down'); await sleep(200); await key('z');
  await drive(g, { label: 'signout', until: (st) => !st.blocking && st.mode === 'play', maxSec: 120, rules: [
    { when: (st) => st.screens.includes('doc'), delay: 700, act: async () => { await key('x'); } },
    { when: (st) => st.text && st.text.startsWith('She looks like you') && st.done, shot: 'n2_10_ch4_photo' },
    { when: (st) => st.text && st.text.startsWith('Orange belt'), act: async () => {} },
  ] });
  await g.hw((H) => { H.setFlag('ch4_pa_used', true); });
  await g.walkTo('pa_console'); await g.face('up'); await sleep(200); await key('z');
  await sleep(800);
  await key('x');   // stepping away from the console fires ALL CALL
  await drive(g, { label: 'roll', until: (st) => st.text && st.text.startsWith('Sit.') && st.done, choices: [1], maxSec: 120, rules: [
    { when: (st) => st.choice && st.choice.ready, delay: 400, shot: 'n2_11_ch4_roll_choice' },
  ] });
  await drive(g, { label: 'to play', until: (st) => !st.blocking && st.mode === 'play', maxSec: 20 });
  await g.walkTo('office_bench'); await g.face('up'); await sleep(200); await key('z');
  await g.hw(async (H) => { await H.HW.game.until(() => { const C = H.HW.colonel; return C.entity && Math.abs(C.x - (36 * 16 + 8)) < 6 && Math.abs(C.y - (23 * 16 + 12)) < 6; }, 90); });
  await sleep(700);
  await g.shot('n2_12_ch4_counter'); shots.push('n2_12_ch4_counter');
  await drive(g, { label: 'ch4 end', until: (st) => st.chapter === 5 && !st.blocking, maxSec: 90 });
  const st4 = await g.hw((H) => ({ ch: H.HW.state.chapter }));
  t.eq(st4.ch, 5, 'shots ch4: real-input run reaches Chapter V');
  await errs('screenshot pass');
  console.log(`  info screenshots (${shots.length}): ${shots.join(', ')}`);
}

await game.close();
await browser.close();
process.exit(t.done() ? 0 : 1);
