// Story test — narrative-4: Chapters VI (Passing Time) and VII (Assembly).
//
// Plays the chapters like a player: real walks (H.walkTo — real collisions, exits and triggers),
// interactions (H.interact on the props), the systems' chase / locker / assembly, dialogue auto-advancing
// and choices from __HW.choiceQueue. God mode only where the AI is not what's being tested (the chase,
// the assembly scans while walking the house).
//   run A (continuous VI → VII → the trapdoor): bonds Danny + Leah, roll #1 silent, the compact shows the
//          safe · [Tell him about Philly.] · [Grab his arm.] · locker [Hold your breath.] gasp → retry → held ·
//          the chute [Not without them.] · roll #3 silent · Leah, Danny (bonded) · Marcus with no page →
//          the music room → his bond · no Charter: [Go back for it.], then the lever · [Not yet.] → [Go down.]
//   run B (other branches, from the gym doors / the lobby): unbonded, roll #1 answered, the Charter ·
//          [It's nothing.] · [Marcus, wait—] · locker [Here.] (ink) · roll #3 [Here.] · name slips ·
//          the page first → bond · FINISH IT · the lever without a choice
//   run C  the locker: two failed breaths (god OFF) → referral 'breath' → reload 'locker' → the scene
//          resumes on the slit view (abbreviated) → [Here.]
//   run D  TRUANT: the coal chute → [Climb out.] → ending 'truant'
//   run E  gates & refusals (DESIGN §9.2) and reload resumes (gym retry keeps seen_, 'roll 2' reload)
//   run F  what the chapters hand the Register (pencil / ink / listed) for runs A and B
// Then a screenshot pass WITHOUT autoAdvance (real key presses, pausing on dialogue boxes and staged
// frames). Asserts flags / items / chapter / objective / checkpoints at each beat and zero captured errors.
// Usage: node tests/story_n4.mjs [--no-shots] [--shots-only] [--only=A|B|C|D|E|F]
import fs from 'node:fs';
import path from 'node:path';
import { launch, openGame, suite, SHOTS } from './lib.mjs';

const t = suite('story_n4');
const NO_SHOTS = process.argv.includes('--no-shots');
const SHOTS_ONLY = process.argv.includes('--shots-only');
const ONLY = (process.argv.find((a) => a.startsWith('--only=')) || '').slice(7);
const sleep = (ms) => new Promise((r) => setTimeout(r, ms));

// ------------------------------------------------------------------------------------------ page helpers
/**
 * Fresh game at a stage of the chapters (runs in the page). stage: 'ch6' (Haupt's office, Ch6 start) ·
 * 'gym' (east1, Marcus leading, at the gym doors) · 'locker' (gym, lights on, at the open locker) ·
 * 'alone' (gym showers, after ch6.alone) · 'ch7' (east1 walking back, Ch6 done) · 'aud' (the house, Ch7).
 * opts: bonds { danny, leah }, roll1 (answered), roll2 (answered), charter, god, timeScale, auto.
 */
async function setup(H, cfg) {
  const HW = H.HW;
  H.autoAdvance(true);
  H.timeScale(cfg.timeScale || 6);
  H.god(cfg.god !== false);
  await H.newGame({ skipIntro: true });
  H.autoAdvance(true);
  const S = ['ch6', 'gym', 'locker', 'alone', 'ch7', 'aud'];
  const at = S.indexOf(cfg.stage);
  const F = {
    pro_doors_cut: true, ch1_danny_vanished: true, ch1_102_rows: true, ch1_front_loop: true, ch1_rooms_entered: 3,
    ch2_bell1: true, ch2_leah_taken: true, ch2_vhs_seen: true, ch2_marcus_told: true, colonel_named: true, east_doors_open: true,
    ch3_jan_key: true, ch3_keyring: true, ch3_period_done: true, coalbin_empty: true,
    office_open: true, ch4_pa_used: true, roll1_done: true, ch4_hide_done: true, gate_2f_open: true, ch5_danny_found: true,
    ch5_205_period_done: true, longhall_cleared: true, false_leah_done: true, adair_met: true, compact_unlocked: true,
    ch5_leah_found: true, library_door_open: true, adair_named: true,
  };
  if (cfg.bonds?.danny) F.bond_danny = true;
  if (cfg.bonds?.leah) F.bond_leah = true;
  if (cfg.roll1) F.roll1_answered = true;
  if (cfg.charter) { F.charter = true; F.case_key = true; F.saw_catalog_past = true; }
  if (at >= 1) Object.assign(F, { safe_seen_past: true, safe_open: true, ch6_breather_done: true, gym_open: true });
  if (at >= 2) Object.assign(F, { ch6_gym_lights: true, seen_ch6_gym: true });
  if (at >= 3) Object.assign(F, { roll2_done: true, ch6_marcus_taken: true, ch6_showers: true, truant_available: true, ch6_homeroom_said: true });
  if (at >= 3 && cfg.roll2) F.roll2_answered = true;
  if (at >= 4) F.ch6_kevin = true;
  if (at >= 5) Object.assign(F, { ch7_started: true, ch7_assembly: true, aud_chain_cut: true });
  for (const [k, v] of Object.entries({ ...F, ...(cfg.flags || {}) })) H.setFlag(k, v);
  HW.state.chapter = at >= 5 ? 7 : 6;
  HW.state.party = at >= 1 ? [] : ['marcus'];
  const items = ['danny_flashlight', 'bolt_cutters', 'camcorder', 'keyring'];
  if (cfg.charter) items.push('charter');
  if (at >= 1) items.push('withdrawn_stamp', 'aud_key');
  if (at >= 3) items.push('denise_photo');
  for (const it of items) H.give(it);
  if (cfg.noCutters) delete HW.state.inv.bolt_cutters;
  const where = { ch6: ['west1', 'principal_portrait'], gym: ['east1', [53, 15]], locker: ['gym', 'locker_tess'],
    alone: ['gym', 'shower_mirrors'], ch7: ['east1', 'from_gym'], aud: ['aud', 'back_row'] }[cfg.stage];
  await H.teleport(where[0], where[1]);
  HW.entities.syncParty();
  H.refresh();
  if (at >= 2) for (let n = 1; n <= 4; n++) HW.lighting.setGroup(`gym${n}`, true, { mode: 'instant' });
  await H.idle();
  H.transcript.length = 0;
  H.errors.length = 0;
  H.choiceQueue = [];
  // sfx tap: count stingers (DESIGN §14 budget)
  if (!HW.audio.__n4tap) {
    const orig = HW.audio.sfx.bind(HW.audio);
    HW.audio.__n4tap = { counts: {} };
    HW.audio.sfx = (id, o) => { const c = HW.audio.__n4tap.counts; c[id] = (c[id] || 0) + 1; return orig(id, o); };
  }
  HW.audio.__n4tap.counts = {};
  H.autoAdvance(cfg.auto !== false);
  return HW.state.chapter;
}

/** Transcript entries (for asserting lines and counting the chapter budget). */
const TR = (H) => H.transcript.map((x) => ({ type: x.type, who: x.who, expr: x.expr, text: x.text, map: x.map }));

// ------------------------------------------------------------------------------------------ assertions
const said = (tr, who, re) => tr.some((x) => (x.type === 'say' || x.type === 'think') && x.who === who && re.test(x.text));
const narrated = (tr, re) => tr.some((x) => x.type === 'narrate' && re.test(x.text));
const chose = (tr, text) => tr.some((x) => x.type === 'choice' && x.text === text);
const cp = (tr, label) => tr.some((x) => x.type === 'checkpoint' && x.text === label);
const objective = (tr, text) => tr.some((x) => x.type === 'objective' && x.text === text);
/** Spoken lines (say + think, the Colonel's AI toast excluded). */
function spoken(tr) {
  return tr.filter((x) => (x.type === 'say' || x.type === 'think') && !(x.who === 'colonel' && /^Who is out of their seat/i.test(x.text)));
}
/** The Colonel's own lines: '???' voice (not mimics / the PA) + his bust. */
const colonelLines = (tr) => tr.filter((x) => x.type === 'say' && (x.who === 'colonel' && !/^Who is out/.test(x.text)));

// ------------------------------------------------------------------------------------------ runs
const browser = await launch();
const open = async () => {
  const g = await openGame(browser);
  await g.page.addScriptTag({ content: `window.__n4setup = ${setup.toString()};` });
  return g;
};
let game = await open();
const errs = async (label) => {
  const e = await game.errors();
  t.ok(e.length === 0, `${label}: zero captured errors`, e.slice(0, 5));
};
const S = (cfg) => game.hw((H, c) => window.__n4setup(H, c), cfg);
const budgets = {};

// ---- Chapter VI, from Haupt's office to the walk back -------------------------------------------------
async function playCh6(label, o) {
  const r = await game.hw(async (H, o) => {
    const HW = H.HW;
    const log = {};
    const m = (k, v) => { log[k] = v; };
    const until = (p, s = 60) => HW.game.until(p, s);
    await H.run('ch6.start'); await H.idle();
    m('obj_start', HW.state.objective);
    m('party_start', HW.state.party.slice());
    // The portrait before the 1979 view: refused; a second try brings Adair to the glass.
    H.face('up'); await H.interact(); H.face('up'); await H.interact();
    m('hint', !!HW.state.flags.ch6_safe_hint);
    m('safe_before', !!HW.state.flags.safe_open);
    // The compact (R8): the room as it was in 1979 — the portrait is open.
    HW.compact.use(); await H.steps(40);
    m('past', !!HW.state.flags.safe_seen_past);
    if (HW.compact.active) { HW.compact.use(); await H.steps(30); }
    await H.idle();
    H.face('up'); await H.interact(); await until(() => !HW.scripts.blocking, 30); await H.idle();
    m('safe', !!HW.state.flags.safe_open);
    m('items_safe', ['withdrawn_stamp', 'aud_key'].map((i) => HW.state.inv[i] || 0));
    m('letter', !!HW.state.docs.haupt_letter);
    m('portrait', H.prop('w1_haupt_portrait')?.state);
    m('cp_safe', HW.state.checkpoint);
    m('obj_safe', HW.state.objective);
    // To the lobby: the breather.
    m('w1>lobby', await H.walkTo([61, 15])); await until(() => HW.map?.id === 'lobby', 10); await H.idle();
    H.choiceQueue = o.breather;
    m('breather_walk', await H.walkTo([8, 15]));
    await until(() => HW.state.flags.ch6_breather_done && !HW.scripts.blocking, 90); await H.idle();
    m('breather', !!HW.state.flags.ch6_breather_done);
    m('gym_open', !!HW.state.flags.gym_open);
    m('told', !!HW.state.flags.ch6_told_marcus);
    m('obj_breather', HW.state.objective);
    m('marcus_led', HW.state.party.slice());
    // East hall: Marcus walks ahead, waits at the gym doors.
    m('lobby>east1', await H.walkTo([28, 15])); await until(() => HW.map?.id === 'east1', 10); await H.idle();
    await H.steps(40);
    const mk = HW.entities.get('marcus');
    m('marcus_ahead', mk ? mk.x > HW.player.x : null);
    m('to_doors', await H.walkTo([56, 15])); await until(() => !HW.scripts.blocking, 40); await H.idle();
    m('marcus_in', !HW.entities.get('marcus'));
    m('e1>gym', await H.walkTo([59, 15])); await until(() => HW.map?.id === 'gym', 10); await H.idle();
    await H.steps(10);
    m('marcus_gym', !!HW.entities.get('marcus'));
    // The gym.
    H.choiceQueue = o.gym;
    m('gym_walk', await H.walkTo([6, 21]));
    await until(() => HW.state.flags.ch6_gym_lights && !HW.scripts.blocking, 120);
    m('lights', !!HW.state.flags.ch6_gym_lights);
    m('chase', HW.chase.active ? HW.chase.kind : null);
    m('shroud', HW.colonel.shrouded);
    m('heap', !!H.prop('gym_heap')?.present);
    m('exit_shut', !!H.prop('gym_doors_shut')?.present);
    m('obj_chase', HW.state.objective);
    // Run for the girls' locker room; climb into the open locker.
    m('to_locker', await H.walkTo('locker_tess', { run: true }));
    H.face('up');
    H.choiceQueue = o.locker;
    H.screenAnswer('breath', o.breath || []);
    await H.interact();
    await until(() => HW.state.inv.denise_photo > 0 && !HW.scripts.blocking, 180); await H.idle();
    m('roll2', [!!HW.state.flags.roll2_done, !!HW.state.flags.roll2_answered, HW.state.rollAnswered]);
    m('taken', !!HW.state.flags.ch6_marcus_taken);
    m('photo', HW.state.inv.denise_photo || 0);
    m('photo_prop', !!H.prop('gym_photo')?.present);
    m('marcus_gone', !HW.entities.get('marcus') && !HW.entities.get('denise'));
    m('cp_roll2', HW.state.checkpoint);
    m('obj_after', HW.state.objective);
    m('exit_open', !H.prop('gym_doors_shut')?.present);
    m('lights_still', ['gym1', 'gym2', 'gym3', 'gym4'].every((gr) => HW.lighting.groupOn(gr)));
    // The showers, then alone.
    m('to_showers', await H.walkTo('shower_mirrors'));
    await until(() => HW.state.flags.truant_available && !HW.scripts.blocking, 120); await H.idle();
    m('showers', !!HW.state.flags.ch6_showers);
    m('truant', !!HW.state.flags.truant_available);
    m('cp_alone', HW.state.checkpoint);
    m('obj_alone', HW.state.objective);
    m('adairs_gone', ![0, 1, 2, 3].some((i) => HW.entities.get(`adair_shower_${i}`)));
    // Back out: Kevin at the far end of the east hall.
    m('gym>east1', await H.walkTo([1, 21])); await until(() => HW.map?.id === 'east1', 10); await H.idle();
    await H.steps(30);
    const k = HW.entities.get('kevin');
    m('kevin', k ? [Math.floor(k.x / 16), Math.floor(k.y / 16)] : null);
    m('ch', HW.state.chapter);
    return log;
  }, o);
  const tr = await game.hw(TR);
  const L = `${label} ch6`;
  t.eq(r.obj_start, "Haupt's office. The safe.", `${L}.start: objective "Haupt's office. The safe."`);
  t.eq(r.party_start, ['marcus'], `${L}.start: Marcus in the party`);
  t.ok(said(tr, 'tess', /^Just a painting\. He's watching the door\.$/) && !r.safe_before, `${L}.portrait: gate — "Just a painting. He's watching the door." (no 1979 view yet)`);
  t.ok(r.hint && said(tr, 'tess', /^The compact\./), `${L}.portrait: second try — Adair in the glass, "The compact."`);
  t.ok(r.past, `${L}: the compact (1979) shows the portrait open → safe_seen_past`);
  t.ok(r.safe && r.items_safe.every((n) => n === 1) && r.letter, `${L}.safe_open: withdrawn_stamp + aud_key + Haupt's letter`, r);
  t.eq(r.portrait, 'open', `${L}.portrait: swung open on its hinges`);
  t.ok(tr.some((x) => x.type === 'say' && x.who === 'voice' && /^Theresa\. \{p=1\.2\} Those belong to the principal\. .*Put them back\.$/.test(x.text)),
    `${L}.safe_open: the intercom, quietly — "Theresa. Those belong to the principal. …Put them back." (voice styling)`);
  t.ok(said(tr, 'tess', /^No\.$/) && said(tr, 'tess', /^Founder's Day\. \{p\} The day the boys burned\. \{p=0\.8\} He made it a holiday\.$/), `${L}.safe_open: "No." · "Founder's Day. The day the boys burned. He made it a holiday."`);
  t.ok(narrated(tr, /WITHDRAWN/) , `${L}.safe_open: the stamp's thunk (WITHDRAWN on the envelope)`);
  t.eq(r.cp_safe, 'safe', `${L}: checkpoint 'safe'`);
  t.eq(r.obj_safe, 'The auditorium.', `${L}: objective "The auditorium."`);
  t.ok(r.breather && r.gym_open, `${L}.breather: ch6_breather_done, gym_open`, r);
  t.ok(chose(tr, 'Sit.') && said(tr, 'tess', /^He'd kill us\.$/) && said(tr, 'marcus', /^He'd want us to\.$/) && narrated(tr, /Krimpets/), `${L}.breather: [Sit.] · Krimpets · "He'd kill us." / "He'd want us to."`);
  t.ok(said(tr, 'marcus', /^You've been weird since August\.$/), `${L}.breather: "You've been weird since August."`);
  if (o.breather[1] === 0) {
    t.ok(r.told && said(tr, 'marcus', /^Philly's not that far\.$/) && said(tr, 'tess', /^It's two hours\.$/) && said(tr, 'marcus', /^Like I said\.$/), `${L}.breather: [Tell him about Philly.] → "Philly's not that far." "It's two hours." "Like I said."`);
  } else {
    t.ok(!r.told && chose(tr, "It's nothing."), `${L}.breather: [It's nothing.]`);
  }
  const homeroom = /^I was gonna let homeroom find out from the attendance sheet\. Just gone, and a chalkboard says why\./;
  const hr = tr.filter((x) => x.type === 'think' && homeroom.test(x.text));
  t.eq(hr.length, 1, `${L}: the attendance-sheet thought exactly once (breather if she told Leah or Marcus, else alone)`);
  if (o.expectHomeroomIn === 'breather') t.ok(/Like \*him\*\.$/.test(hr[0]?.text || ''), `${L}: …in the breather ("Like *him*.")`);
  if (o.expectHomeroomIn === 'alone') t.ok(/Like them\.$/.test(hr[0]?.text || ''), `${L}: …alone ("Like them.")`);
  t.ok(narrated(tr, /The tune doesn't\./) && narrated(tr, /clarinet picks it up/) && said(tr, 'marcus', /^That's not me\.$/), `${L}.breather: the hum; the clarinet carries on from the east — "That's not me."`);
  t.eq(r.obj_breather, 'The gym. East hall.', `${L}: objective "The gym. East hall."`);
  t.ok(r.marcus_ahead === true, `${L}.lead: Marcus walks ahead down the east hall (periods off)`);
  t.ok(cp(tr, 'gym doors'), `${L}: checkpoint 'gym doors'`);
  t.ok(said(tr, 'marcus', /^She played clarinet\.$/) && r.marcus_in, `${L}.gym_doors: "She played clarinet." — he goes in first`);
  t.ok(r.marcus_gym, `${L}.gym: Marcus two steps inside`);
  t.ok(narrated(tr, /On the bleachers, a girl in a green-and-gold band uniform/), `${L}.gym: Denise on the bleachers`);
  t.ok(chose(tr, o.gym[0] === 1 ? 'Grab his arm.' : 'Marcus, wait—'), `${L}.gym: [${o.gym[0] === 1 ? 'Grab his arm.' : 'Marcus, wait—'}]`);
  if (o.gym[0] === 1) t.ok(said(tr, 'marcus', /^It's okay, Tess\.$/), `${L}.gym: he takes her hand off his sleeve — "It's okay, Tess."`);
  const lure = [/^Marcus Webb\.$/, /^Look at you\. \{p\} You got my eyes\. Mama always said\.$/, /^Is she still setting my plate\?$/, /^Then sit with me\. \{p\} Just till the song's done\.$/];
  t.ok(lure.every((re) => said(tr, 'denise', re)) && said(tr, 'marcus', /^\.\.\.She still says it\.$/) && said(tr, 'marcus', /^Every Thanksgiving\.$/), `${L}.gym: the lure, verbatim (DESIGN §6 VI.4)`);
  t.ok(r.lights && !r.heap && r.shroud === false, `${L}.gym: ch6_gym_lights — the heap is gone, no shroud`, r);
  t.ok(said(tr, 'marcus', /^TESS\. RUN\.$/), `${L}.gym: "TESS. RUN."`);
  t.eq(r.chase, 'gym', `${L}.chase: HW.chase.gym() running after the scene`);
  t.ok(r.exit_shut, `${L}.chase: the way back to the east hall is shut`);
  t.eq(r.obj_chase, "The girls' locker room. Hide.", `${L}: objective "The girls' locker room. Hide."`);
  t.ok(tr.some((x) => x.type === 'chase' && x.text === 'ch6:hidden'), `${L}.chase: resolves 'hidden' when she climbs into gym_locker_tess`);
  t.ok(cp(tr, 'locker'), `${L}: checkpoint 'locker' (inside)`);
  t.ok(narrated(tr, /the mouth opens\. \{p\} It keeps opening/), `${L}.locker: the mouth opens too far`);
  t.ok(tr.filter((x) => x.type === 'say' && x.who === 'voice' && x.text === 'Theresa?').length === (o.breath?.[0] === 'failed' ? 2 : 1), `${L}.locker: roll call #2 — "Theresa?"${o.breath?.[0] === 'failed' ? ' (asked again after the gasp)' : ''}`);
  if (o.locker[0] === 0) t.ok(r.roll2[1] && tr.some((x) => x.who === 'voice' && x.text === 'Thank you, Theresa.'), `${L}.locker: [Here.] → roll2_answered, "Thank you, Theresa."`);
  else t.ok(!r.roll2[1] && chose(tr, 'Hold your breath.') && tr.some((x) => x.type === 'screen' && x.text === 'breath'), `${L}.locker: [Hold your breath.] → the breath screen, not answered`);
  t.ok(r.roll2[0], `${L}.locker: roll2_done`);
  t.ok(cp(tr, 'roll 2'), `${L}: checkpoint 'roll 2' after the choice`);
  t.ok(r.taken && r.photo === 1 && !r.photo_prop && r.marcus_gone, `${L}.after_locker: Marcus gone, ch6_marcus_taken, denise_photo by script`, r);
  t.ok(said(tr, 'tess', /^Marcus\?$/), `${L}.after_locker: "Marcus?"`);
  t.ok(r.exit_open, `${L}.after_locker: the gym lets her go once she has the photo`);
  t.ok(r.lights_still, `${L}: the banks stay on (the light no longer dies around him)`);
  const fogLine = { 0: 'NOT GONE. KEPT.', 1: 'NOT GONE. KEPT. NOT AGAIN.', 2: "YOU'RE IN INK." }[Math.min(2, r.roll2[2])];
  t.ok(narrated(tr, new RegExp(`^\\{dim\\}${fogLine.replace(/[.]/g, '\\.')}\\{/dim\\}$`)), `${L}.showers: fog by rollAnswered (${r.roll2[2]}) — ${fogLine}`);
  t.eq(narrated(tr, /THE CHARTER\. LIBRARY\./), !o.charter, `${L}.showers: the Charter signpost ${o.charter ? 'absent (has it)' : 'on the last mirror'}`);
  t.ok(said(tr, 'tess', /^The lights didn't go out\. \{p\} They always go out around him\.$/), `${L}.showers: "The lights didn't go out. They always go out around him."`);
  t.ok(r.adairs_gone, `${L}.showers: Adair's reflections fade`);
  t.ok(said(tr, 'tess', /^The coal chute\. Danny's bolt cutters\. \{p\} I could just go home\.$/), `${L}.alone: "The coal chute. Danny's bolt cutters. I could just go home."`);
  t.ok(tr.some((x) => x.type === 'think' && x.expr === 'exhausted') && tr.some((x) => x.type === 'think' && x.expr === 'devastated'), `${L}.alone: exhausted → devastated portraits`);
  t.ok(r.truant && r.cp_alone === 'alone' && r.obj_alone === 'The auditorium.', `${L}.alone: truant_available · objective "The auditorium." · checkpoint 'alone'`, r);
  t.ok(Array.isArray(r.kevin) && r.kevin[0] < 12, `${L}: Kevin at the far end of the east hall on the walk back`, r.kevin);
  // No quips once she's alone: no smirk/laugh/smile from Tess after Marcus is taken.
  const iTaken = tr.findIndex((x) => x.type === 'say' && x.who === 'tess' && x.text === 'Marcus?');
  t.ok(!tr.slice(iTaken).some((x) => x.who === 'tess' && ['smirk', 'laugh', 'smile'].includes(x.expr)), `${L}: no quips after she's alone`);
  t.ok(!tr.slice(0, tr.findIndex((x) => /^TESS\. RUN\./.test(x.text || ''))).some((x) => x.who === 'colonel'), `${L}: no Colonel bust before the gym`);
  return tr;
}

// ---- Chapter VII, from the lobby to the trapdoor -----------------------------------------------------
async function playCh7(label, o) {
  const r = await game.hw(async (H, o) => {
    const HW = H.HW;
    const log = {};
    const m = (k, v) => { log[k] = v; };
    const until = (p, s = 60) => HW.game.until(p, s);
    const sit = async (anchor) => {
      if (HW.player.seated) { await H.press('up', 220); await H.idle(); }
      const ok = await H.walkTo(anchor); H.face('down'); await H.interact(); await H.steps(6);
      await until(() => !HW.scripts.blocking, 60); await H.steps(12); await until(() => !HW.scripts.blocking, 60); await H.idle();
      return ok;
    };
    if (HW.map.id === 'east1') {
      m('e1>lobby', await H.walkTo([1, 15])); await until(() => HW.map?.id === 'lobby', 10); await H.idle();
    }
    m('kevin_off', !HW.state.patrolCfg);
    m('lobby_walk', await H.walkTo([20, 15]));
    await until(() => HW.state.flags.ch7_started && !HW.scripts.blocking, 60); await H.idle();
    m('ch', HW.state.chapter);
    m('party', HW.state.party.slice());
    m('cp_lobby', HW.state.checkpoint);
    m('memorial', HW.map.props.find((p) => p.present && /^lobby_memorial_v_/.test(p.id))?.id || null);
    m('assembly_light', HW.lighting.groupOn('assembly'));
    // The auditorium doors.
    m('doors', await H.walkTo('aud_doors')); H.face('up'); await H.interact();
    await until(() => HW.map?.id === 'aud', 10); await H.idle();
    m('chain', !!HW.state.flags.aud_chain_cut);
    m('aud_walk', await H.walkTo([16, 31])); await until(() => !HW.scripts.blocking, 60); await H.idle();
    m('assembly', [HW.assembly.active, HW.colonel.mode, !!HW.state.flags.ch7_assembly]);
    m('front', ['danny', 'leah', 'marcus'].map((id) => { const e = HW.entities.get(id); return e ? `${e.spriteId}@${e.seat?.id}` : null; }));
    m('denise_husk', H.prop('aud_seat_denise')?.state);
    m('obj_aud', HW.state.objective);
    // Roll #3 (first sit in rows 1–4), on the seat beside Leah: then her scene.
    H.choiceQueue = [o.roll3];
    m('sit_leah', await sit('beside_leah'));
    m('roll3', [!!HW.state.flags.roll3_done, !!HW.state.flags.roll3_answered, HW.state.rollAnswered]);
    m('cp_roll3', HW.state.checkpoint);
    m('seen_leah', !!HW.state.flags.seen_ch7_front_leah);
    m('sit_danny', await sit('beside_danny'));
    m('seen_danny', !!HW.state.flags.seen_ch7_front_danny);
    if (o.pageFirst) {
      await H.press('up', 220); await H.idle();
    } else {
      H.choiceQueue = [o.nopage];
      m('sit_marcus1', await sit('beside_marcus'));
      m('obj_nopage', HW.state.objective);
      m('bond_m1', !!HW.state.flags.bond_marcus);
      await H.press('up', 220); await H.idle();
    }
    // The music room: the clarinet case, the mirror, the phonograph.
    m('clar', await H.walkTo('clarinet_case')); H.face('left'); await H.interact(); await H.idle();
    m('page', [HW.state.inv.diary_page || 0, !!HW.state.flags.diary_page, HW.state.checkpoint, HW.state.objective]);
    m('mirror', await H.walkTo('music_mirror')); H.face('up'); await H.interact(); await H.idle();
    m('phono', await H.walkTo([9, 10])); H.face('up'); await H.interact(); await H.idle();
    m('battery', await H.walkTo([4, 6])); H.face('up'); await H.interact(); await H.idle();
    // Back to Marcus with the page.
    m('sit_marcus2', await sit('beside_marcus'));
    m('bond', [!!HW.state.flags.bond_marcus, HW.state.inv.diary_page || 0, HW.state.checkpoint]);
    await H.press('up', 220); await H.idle();
    // The trap room.
    m('lever_walk', await H.walkTo([36, 4])); H.face('up');
    H.choiceQueue = o.lever;
    await H.interact(); await H.idle();
    m('lever1', [!!HW.state.flags.trapdoor_open, HW.state.objective]);
    if (!HW.state.flags.trapdoor_open) { H.face('up'); await H.interact(); await H.idle(); }
    m('trap', [!!HW.state.flags.trapdoor_open, H.prop('aud_trapdoor_open')?.present ?? null, H.prop('aud_lever')?.state]);
    m('stage_walk', await H.walkTo([41, 4])); H.face('right'); await H.interact(); await H.idle();
    m('stage', [!!HW.state.flags.stage_door_open, H.prop('aud_stage_door')?.state]);
    // The point of no return: [Not yet.] steps back; [Go down.] → Chapter VIII.
    H.choiceQueue = [1];
    H.walkTo([37, 8]);
    await until(() => HW.scripts.blocking > 0, 20);
    H.walkTo({ x: HW.player.x, y: HW.player.y });      // (the test's autopilot would walk her straight back on)
    await until(() => !HW.scripts.blocking, 30); await H.idle();
    m('notyet', [HW.map.id, HW.state.chapter]);
    H.choiceQueue = [0];
    await H.walkTo([37, 8]);
    await until(() => HW.map?.id === 'vault' && HW.state.chapter === 8 && !HW.scripts.blocking, 60); await H.idle();
    m('down', [HW.map.id, HW.state.chapter]);
    m('state', { flags: { ...HW.state.flags }, inv: { ...HW.state.inv }, bonds: { ...HW.state.bonds }, roll: HW.state.rollAnswered });
    return log;
  }, o);
  const tr = await game.hw(TR);
  const L = `${label} ch7`;
  t.eq(r.ch, 7, `${L}.start: the lobby trigger → g.chapter(7)`);
  t.ok(tr.some((x) => x.type === 'card' && /^VII — Assembly$/.test(x.text)), `${L}.start: card "VII — Assembly"`);
  t.ok(r.kevin_off, `${L}.start: the Safety Patrol stands down for the lobby`);
  t.eq(r.party, [], `${L}: alone`);
  t.ok(tr.some((x) => x.type === 'say' && x.who === 'voice' && x.text === "All students will report to the auditorium for the Founder's Day Assembly."), `${L}.start: the intercom — "All students will report to the auditorium…"`);
  const ink = (b) => (b ? 'in pencil' : 'in ink');
  t.ok(narrated(tr, new RegExp(`Danny's ${ink(o.bonds.danny)}, Leah's ${ink(o.bonds.leah)}, Marcus's in ink\\.`)), `${L}.start: the Polaroids — Danny ${ink(o.bonds.danny)}, Leah ${ink(o.bonds.leah)}, Marcus in ink`);
  const rr = Math.min(2, o.rollBefore7);
  t.ok(narrated(tr, [/The frame is empty\./, /a pencil sketch\. A girl at a desk/, /a Polaroid\. A girl at a desk/][rr]), `${L}.start: Tess's frame by rollAnswered (${o.rollBefore7})`);
  t.ok(typeof r.memorial === 'string' && r.memorial.endsWith(String(rr)), `${L}.start: the board itself (memorial variant ${r.memorial})`);
  t.ok(tr.filter((x) => x.type === 'say' && x.who === 'voice' && /^Theresa( Marie Dolan)?\./.test(x.text)).length === 2, `${L}.start: Mom's voice (mimic) — "Theresa." · "Theresa Marie Dolan. You answer me when I call you."`);
  t.ok(said(tr, 'tess', /^\.\.\.She only does the middle name when it's bad\.$/) && said(tr, 'tess', /^She's on nights at Pottsville\. She doesn't know I'm here\. \{p\} Nice try\.$/), `${L}.start: "...She only does the middle name when it's bad." · "…Nice try."`);
  t.eq(r.cp_lobby, 'lobby', `${L}: checkpoint 'lobby'`);
  t.ok(r.assembly_light, `${L}.start: the warm leak under the auditorium doors (group 'assembly')`);
  t.ok(r.chain, `${L}.aud_doors: chain cut, key turned`);
  t.ok(r.assembly[0] && r.assembly[1] === 'assembly' && r.assembly[2], `${L}.aud_enter: HW.assembly running, ch7_assembly`, r.assembly);
  t.eq(r.front, ['danny_e@aud_seat_danny', 'leah_e@aud_seat_leah', 'marcus_e@aud_seat_marcus'], `${L}.aud_enter: the three of them, entranced, in the front row`);
  t.eq(r.denise_husk, 'occupied', `${L}.aud_enter: Denise's husk beside Marcus`);
  t.ok(narrated(tr, /^\{dim\}"Hallowell, Cyrus\. First pupil\."\{\/dim\}$/) && narrated(tr, /"Present\."/), `${L}.aud_enter: "Hallowell, Cyrus. First pupil." — "Present."`);
  t.eq(r.obj_aud, 'The front row.', `${L}: objective "The front row."`);
  t.ok(tr.some((x) => x.type === 'say' && x.who === 'colonel' && x.text === 'Theresa Dolan?'), `${L}.roll3: his bust — "Theresa Dolan?"`);
  t.ok(r.roll3[0] && r.roll3[1] === (o.roll3 === 0), `${L}.roll3: roll3_done, roll3_answered=${o.roll3 === 0}`, r.roll3);
  if (o.roll3 === 0) t.ok(tr.some((x) => x.type === 'say' && x.who === 'colonel' && x.text === 'Thank you, Theresa.'), `${L}.roll3: [Here.] → "Thank you, Theresa."`);
  t.ok(cp(tr, 'roll 3'), `${L}: checkpoint 'roll 3'`);
  t.ok(r.seen_leah && r.seen_danny, `${L}: the front-row scenes run when she sits beside them`);
  if (o.bonds.leah) t.ok(said(tr, 'leah', /Then it's evidence\./), `${L}.front_leah: bonded — "Then it's evidence."`);
  else t.ok(said(tr, 'leah', /^Sit down, Theresa— \{p\} \.\.\.T\. Sorry\. It keeps doing that\.$/), `${L}.front_leah: unbonded name slip — "Sit down, Theresa— …T. Sorry. It keeps doing that."`);
  if (o.bonds.danny) t.ok(said(tr, 'danny', /^Dolan\. \{p\} You came back\.$/), `${L}.front_danny: bonded — "Dolan. You came back."`);
  else t.ok(said(tr, 'danny', /^Take your seat, Theresa— \{p\} \.\.\.Dolan\. Jeez\. Sorry\./), `${L}.front_danny: unbonded name slip — "Take your seat, Theresa— …Dolan. Jeez. Sorry."`);
  t.ok(said(tr, 'marcus', /^She's so cold, Tess\. \{p\} Her hand's so cold\.$/), `${L}.front_marcus: "She's so cold, Tess. Her hand's so cold."`);
  if (!o.pageFirst) {
    if (o.nopage === 0) t.ok(said(tr, 'marcus', /^You don't know that\.$/) && said(tr, 'marcus', /^You're leaving too\. \{p\} Everybody says it like it's nothing\.$/), `${L}.front_marcus: no page — [She's gone, Marcus.] → "You don't know that." · "You're leaving too…"`);
    t.ok(!r.bond_m1 && r.obj_nopage === 'The music room. Stage left.', `${L}.front_marcus: no bond without the page; objective "The music room. Stage left."`, r);
  }
  t.ok(r.page[0] === 1 && r.page[1] && r.page[2] === 'music room', `${L}.clarinet: the diary page; checkpoint 'music room'`, r.page);
  t.ok(said(tr, 'tess', /^Marcus needs to read this\.$/), `${L}.clarinet: "Marcus needs to read this."`);
  t.ok(tr.some((x) => x.type === 'doc' && x.text === 'denise_diary'), `${L}.clarinet: doc denise_diary`);
  t.ok(narrated(tr, o.charter ? /^\{dim\}FINISH IT\{\/dim\}$/ : /^\{dim\}HE IS ON THE ROLL\. THE CHARTER\. LIBRARY\.\{\/dim\}$/), `${L}.mirror: Adair fogs ${o.charter ? 'FINISH IT' : 'HE IS ON THE ROLL. THE CHARTER. LIBRARY.'}`);
  t.ok(narrated(tr, /HALLOWELL ALMA MATER/), `${L}.phonograph: the record from the intercom`);
  t.ok(r.bond[0] && r.bond[1] === 0 && r.bond[2] === 'marcus bond', `${L}.front_marcus: the page → bond_marcus (page given), checkpoint 'marcus bond'`, r.bond);
  t.ok(said(tr, 'marcus', /^She puts the good fork out\. \{p\} Every year\.$/) && said(tr, 'marcus', /^I never met her, Tess\. \{p\} I came here to meet her\.$/) && said(tr, 'marcus', /^Okay\. \{p\} Okay, Aunt Denise\.$/), `${L}.front_marcus: the bond, verbatim`);
  if (o.charter) t.ok(!chose(tr, 'Go back for it.') && r.lever1[0], `${L}.lever: with the Charter, no choice — the trapdoor opens`);
  else if (o.lever[0] === 1) t.ok(chose(tr, 'Go back for it.') && !r.lever1[0] && r.lever1[1] === 'The library. The Charter.', `${L}.lever: no Charter — [Go back for it.] (one time); objective "The library. The Charter."`, r.lever1);
  else t.ok(chose(tr, 'Go down.') && r.lever1[0], `${L}.lever: no Charter — [Go down.]`);
  t.ok(r.trap[0] && r.trap[1] === true && r.trap[2] === 'down', `${L}.lever: trapdoor_open`, r.trap);
  t.ok(r.stage[0] && r.stage[1] === 'open', `${L}.stage_door: unbarred (the back way to the lobby)`, r.stage);
  t.eq(r.notyet, ['aud', 7], `${L}.trapdoor: [Not yet.] keeps her up top`);
  t.ok(cp(tr, 'trapdoor'), `${L}: checkpoint 'trapdoor' (before the point of no return)`);
  t.eq(r.down, ['vault', 8], `${L}.trapdoor: [Go down.] → the vault, Chapter VIII`);
  t.ok(tr.some((x) => x.type === 'card' && /^VIII/.test(x.text)), `${L}.trapdoor: card "VIII — The Register"`);
  return { tr, state: r.state };
}

/** The chapter's dialogue as a script (for the editing pass): <SHOTS>/n4_script_<label>.txt */
function dump(label, tr) {
  const lines = tr.filter((x) => ['say', 'think', 'narrate', 'choice', 'objective', 'checkpoint', 'card', 'doc'].includes(x.type))
    .map((x) => (x.type === 'say' ? `${(x.who || '').toUpperCase()} (${x.expr || ''}): ${x.text}`
      : x.type === 'think' ? `  TESS thinks (${x.expr || ''}): ${x.text}` : x.type === 'narrate' ? `    [${x.text}]` : `      <${x.type}: ${x.text}>`));
  try { fs.writeFileSync(path.join(SHOTS, `n4_script_${label}.txt`), `${lines.join('\n')}\n`); } catch { /* best effort */ }
}

function budget(tr, ch, label) {
  dump(`${label}${ch}`, tr);
  const n = spoken(tr).length;
  const target = { 6: 35, 7: 35 }[ch];
  budgets[`${label}${ch}`] = n;
  console.log(`  info ${label} ch${ch}: ${n} spoken lines (say+think, incl. ${tr.filter((x) => x.type === 'say' && x.who === 'voice').length} intercom/voice), budget ${target} ±20%`);
  t.ok(n >= target * 0.8 && n <= target * 1.2, `${label} ch${ch}: spoken lines within the budget (${n} vs ${target} ±20%)`);
}

if (!SHOTS_ONLY && (!ONLY || ONLY === 'A')) {
  // ---- run A: continuous
  await S({ stage: 'ch6', bonds: { danny: true, leah: true }, roll1: false });
  const trA6 = await playCh6('A', { breather: [0, 0], gym: [1], locker: [1, 1], breath: ['failed', 'held'], charter: false, expectHomeroomIn: 'breather' });
  budget(trA6, 6, 'A');
  const sA6 = await game.hw((H) => ({ ...(H.HW.audio.__n4tap?.counts || {}) }));
  t.eq(sA6.stinger_hard || 0, 2, 'A ch6: stinger_hard exactly twice (the last light bank · the locker face)');
  t.ok((sA6.stinger_soft || 0) <= 1, 'A ch6: stinger_soft ≤ 1');
  // The coal chute, with the window open: cut, look up, [Not without them.]
  const chute = await game.hw(async (H) => {
    const HW = H.HW;
    H.transcript.length = 0;
    const a = await H.walkTo([17, 3]); await HW.game.until(() => HW.map?.id === 'basement', 10); await H.idle();
    const b = await H.walkTo('coal_chute'); H.face('up');
    H.choiceQueue = [1];
    await H.interact(); await H.idle();
    const r = { a, b, cut: !!HW.state.flags.chute_cut, prop: H.prop('b_chute')?.state, ending: HW.state.flags.ending || null, mode: HW.game.mode };
    await H.walkTo([15, 3]); await HW.game.until(() => HW.map?.id === 'east1', 10); await H.idle();
    r.back = HW.map.id;
    r.tr = H.transcript.map((x) => ({ type: x.type, who: x.who, text: x.text }));
    return r;
  });
  t.ok(chute.cut && chute.prop === 'cut' && !chute.ending && chute.mode === 'play', 'A ch6.chute: the grate cut, [Not without them.] — no ending', chute);
  t.ok(said(chute.tr, 'tess', /^Coal goes in this way\. \{p\} Nobody ever made a rule about coal going out\.$/), 'A ch6.chute: "Coal goes in this way. Nobody ever made a rule about coal going out."');
  t.ok(chose(chute.tr, 'Not without them.'), 'A ch6.chute: [Not without them.]');
  t.eq(chute.back, 'east1', 'A: back up the basement stairs');
  await game.hw((H) => { H.transcript.length = 0; H.HW.audio.__n4tap.counts = {}; });
  const A7 = await playCh7('A', { bonds: { danny: true, leah: true }, rollBefore7: 0, roll3: 1, nopage: 0, lever: [1], charter: false });
  budget(A7.tr, 7, 'A');
  const sA7 = await game.hw((H) => ({ ...(H.HW.audio.__n4tap?.counts || {}) }));
  t.eq(sA7.stinger_hard || 0, 0, 'A ch7: no stinger_hard (budget spent elsewhere)');
  const col6 = colonelLines(trA6).length;
  const colVoice6 = trA6.filter((x) => x.type === 'say' && x.who === 'voice' && /^(Theresa[.?]|Theresa\. \{p=1\.2\} Those|Thank you, Theresa\.)/.test(x.text)).length;
  const colA7 = colonelLines(A7.tr).length + A7.tr.filter((x) => x.type === 'narrate' && /Hallowell, Cyrus\. First pupil/.test(x.text)).length;
  console.log(`  info A: the Colonel speaks ${colVoice6 + col6} times in Ch6 (no bust), ${colA7} in Ch7 (bust beats: roll #3 only)`);
  t.ok(col6 === 0, 'A ch6: no Colonel bust in Chapter VI (voice styling only)');
  t.ok(A7.tr.filter((x) => x.type === 'say' && x.who === 'colonel' && !/^Who is out/.test(x.text)).every((x) => /^(Theresa Dolan\?|Thank you, Theresa\.)$/.test(x.text)), 'A ch7: the bust appears only in the roll #3 beat');
  await errs('run A');
  globalThis.__stateA = A7.state;
}

if (!SHOTS_ONLY && (!ONLY || ONLY === 'B')) {
  // ---- run B: the other branches (from the gym doors; then Ch7 on its own)
  await S({ stage: 'ch6', bonds: { danny: false, leah: false }, roll1: true, charter: true });
  const trB6 = await playCh6('B', { breather: [0, 1], gym: [0], locker: [0], charter: true, expectHomeroomIn: 'alone' });
  budget(trB6, 6, 'B');
  t.ok(!chose(trB6, 'Grab his arm.') && !said(trB6, 'marcus', /^It's okay, Tess\.$/), 'B ch6.gym: [Marcus, wait—] — he doesn\'t stop');
  await errs('run B ch6');
  await game.hw((H) => { H.transcript.length = 0; });
  const B7 = await playCh7('B', { bonds: { danny: false, leah: false }, rollBefore7: 2, roll3: 0, pageFirst: true, lever: [], charter: true });
  budget(B7.tr, 7, 'B');
  t.ok(said(B7.tr, 'tess', /^\.\.\.That's ink\.$/), 'B ch7.roll3: answered a third time — "...That\'s ink."');
  await errs('run B ch7');
  globalThis.__stateB = B7.state;
}

if (!SHOTS_ONLY && (!ONLY || ONLY === 'C')) {
  // ---- run C: two failed breaths, god OFF → the referral → reload 'locker' → the scene resumes
  await S({ stage: 'locker', god: false, timeScale: 4 });
  const c = await game.hw(async (H) => {
    const HW = H.HW;
    H.face('up');
    H.choiceQueue = [1, 1, 0];
    H.screenAnswer('breath', ['failed', 'failed']);
    HW.input.tap('confirm'); await H.steps(4);
    // (under autoAdvance the referral resolves 'retry' at once: the game over shows in the transcript)
    await HW.game.until(() => HW.state.flags.roll2_done && HW.state.inv.denise_photo > 0 && !HW.scripts.blocking, 240); await H.idle();
    const tr = H.transcript.map((x) => ({ type: x.type, who: x.who, text: x.text }));
    const iGo = tr.findIndex((x) => x.type === 'gameover');
    const after = tr.slice(iGo + 1);
    return { go: iGo >= 0, reason: iGo >= 0 ? tr[iGo].text : null, cpAfter: (after.find((x) => x.type === 'checkpoint') || {}).text,
      seen: !!HW.state.flags.seen_ch6_locker, deaths: HW.state.flags.deaths_locker || 0,
      roll2: [!!HW.state.flags.roll2_done, !!HW.state.flags.roll2_answered], tr: after, photo: HW.state.inv.denise_photo || 0 };
  });
  t.ok(c.go && c.reason === 'breath', "C ch6.locker: second failed breath → game over 'breath' (Disrupting attendance)", c.reason);
  t.eq(c.cpAfter, 'locker', "C: the retry reloads the 'locker' checkpoint");
  t.ok(c.seen && c.deaths >= 1, 'C: seen_ch6_locker saved with the checkpoint; the death is counted (assist)', c);
  t.ok(!narrated(c.tr, /the mouth opens/), 'C: the reload resumes on the slit view, abbreviated (no repeat of the mouth line)');
  t.ok(c.tr.some((x) => x.who === 'voice' && x.text === 'Theresa?') && chose(c.tr, 'Here.'), 'C: he asks again; [Here.]');
  t.ok(c.roll2[0] && c.roll2[1] && c.photo === 1, 'C: roll2_answered; the scene carries on to the photo', c);
  await errs('run C');
}

if (!SHOTS_ONLY && (!ONLY || ONLY === 'D')) {
  // ---- run D: TRUANT
  await S({ stage: 'alone' });
  const d = await game.hw(async (H) => {
    const HW = H.HW;
    await H.walkTo([1, 21]); await HW.game.until(() => HW.map?.id === 'east1', 10); await H.idle();
    await H.walkTo([17, 3]); await HW.game.until(() => HW.map?.id === 'basement', 10); await H.idle();
    await H.walkTo('coal_chute'); H.face('up');
    H.choiceQueue = [0];
    HW.input.tap('confirm');
    await HW.game.until(() => HW.game.mode === 'ending', 30);
    return { mode: HW.game.mode, ending: HW.state.flags.ending, truant: !!HW.state.flags.truant, chute: HW.state.mapState?.basement?.b_chute?.state,
      tr: H.transcript.map((x) => ({ type: x.type, who: x.who, text: x.text })), resolved: HW.endings?.resolveEnding?.(HW.state) };
  });
  t.ok(d.mode === 'ending' && d.ending === 'truant' && d.truant, 'D ch6.chute: [Climb out.] → g.ending(\'truant\')', d);
  t.eq(d.resolved, 'truant', 'D: resolveEnding() → truant');
  t.ok(chose(d.tr, 'Climb out.') && d.chute === 'open', 'D: [Climb out.] — the grate open');
  await errs('run D');
}

if (!SHOTS_ONLY && (!ONLY || ONLY === 'E')) {
  // ---- run E: gates & refusals (DESIGN §9.2), resumes after reloads
  // Haupt's portrait before Chapter VI.
  await S({ stage: 'ch6' });
  const e1 = await game.hw(async (H) => {
    const HW = H.HW;
    HW.state.chapter = 5; H.setFlag('safe_seen_past', true);
    H.face('up'); await H.interact();
    const r = { safe: !!HW.state.flags.safe_open, tr: H.transcript.filter((x) => x.type === 'think').map((x) => x.text) };
    // The coal chute before the window, with Marcus.
    HW.state.chapter = 6;
    await H.teleport('basement', 'coal_chute'); await H.idle();
    H.transcript.length = 0; H.face('up'); await H.interact();
    r.chute = H.transcript.filter((x) => x.type === 'say').map((x) => `${x.who}:${x.text}`);
    r.cut = !!HW.state.flags.chute_cut;
    return r;
  });
  t.ok(!e1.safe && e1.tr.includes("Just a painting. He's watching the door."), 'E: Haupt\'s portrait before Chapter VI — "Just a painting. He\'s watching the door."');
  t.ok(e1.chute.includes("marcus:I'm not leaving.") && !e1.cut, 'E: the chute before truant_available, Marcus — "I\'m not leaving."', e1.chute);
  // The auditorium doors with the key but Marcus still out there; the chain without the key.
  await S({ stage: 'gym' });
  const e2 = await game.hw(async (H) => {
    const HW = H.HW;
    await H.teleport('lobby', 'aud_doors'); await H.idle();
    H.transcript.length = 0; H.face('up'); await H.interact();
    const r = { key: H.transcript.filter((x) => x.type === 'think').map((x) => x.text), map: HW.map.id };
    delete HW.state.inv.aud_key;
    H.transcript.length = 0; H.choiceQueue = [0]; H.face('up'); await H.interact();
    r.cut = H.transcript.filter((x) => x.type === 'narrate').map((x) => x.text);
    r.chain = !!HW.state.flags.aud_chain_cut;
    return r;
  });
  t.ok(e2.key.includes("Marcus went toward the gym. I'm not doing this without him.") && e2.map === 'lobby', 'E: aud doors — key but !ch6_marcus_taken → "Marcus went toward the gym. I\'m not doing this without him."');
  t.ok(e2.chain && e2.cut.includes("Chain's off. Doors are still locked. Old keyhole."), 'E: aud doors — bolt cutters without the key → "Chain\'s off. Doors are still locked. Old keyhole."', e2.cut);
  // The chute: after the Assembly started; without the cutters.
  await S({ stage: 'aud' });
  const e3 = await game.hw(async (H) => {
    const HW = H.HW;
    await H.teleport('basement', 'coal_chute'); await H.idle();
    H.transcript.length = 0; H.face('up'); await H.interact();
    const r = { after: H.transcript.filter((x) => x.type === 'think').map((x) => x.text) };
    H.setFlag('ch7_assembly', false); delete HW.state.inv.bolt_cutters;
    H.transcript.length = 0; H.face('up'); await H.interact();
    r.nocut = H.transcript.filter((x) => x.type === 'think').map((x) => x.text);
    r.ending = HW.state.flags.ending || null;
    return r;
  });
  t.ok(e3.after.includes('Not without them.'), 'E: the chute after ch7_assembly — "Not without them."', e3.after);
  t.ok(e3.nocut.includes("Danny's uncle's bolt cutters would go through that.") && !e3.ending, 'E: the chute without the cutters — "Danny\'s uncle\'s bolt cutters would go through that."', e3.nocut);
  // The lever without the Charter: [Go down.] at once.
  await S({ stage: 'aud' });
  const e4 = await game.hw(async (H) => {
    const HW = H.HW;
    await H.teleport('aud', 'trap_room'); await H.idle();
    await H.walkTo([36, 4]); H.face('up'); H.choiceQueue = [0]; await H.interact(); await H.idle();
    return { open: !!HW.state.flags.trapdoor_open, chose: H.transcript.filter((x) => x.type === 'choice').map((x) => x.text) };
  });
  t.ok(e4.open && e4.chose.includes('Go down.'), 'E: the lever without the Charter — [Go down.] opens the trapdoor', e4);
  // A death in the gym chase: the retry keeps seen_ch6_gym (Pillar 6) and replays the scene abbreviated.
  await S({ stage: 'gym', god: false, timeScale: 4 });
  const e5 = await game.hw(async (H) => {
    const HW = H.HW;
    await H.walkTo([59, 15]); await HW.game.until(() => HW.map?.id === 'gym', 10); await H.idle();
    const cp0 = HW.state.checkpoint;
    await H.walkTo([6, 21]);
    await HW.game.until(() => HW.state.flags.ch6_gym_lights && !HW.scripts.blocking, 120);
    // she doesn't run (the referral resolves 'retry' at once under autoAdvance: watch the transcript)
    const gone = () => H.transcript.some((x) => x.type === 'gameover');
    await HW.game.until(gone, 90);
    const go = gone();
    await HW.game.until(() => HW.game.mode === 'play' && !HW.state.flags.ch6_gym_lights, 20); await H.idle();
    const after = { cp: HW.state.checkpoint, seen: !!HW.state.flags.seen_ch6_gym, lights: !!HW.state.flags.ch6_gym_lights, map: HW.map.id };
    H.transcript.length = 0;
    H.god(true);
    await H.walkTo([6, 21]);
    await HW.game.until(() => HW.state.flags.ch6_gym_lights && !HW.scripts.blocking, 120);
    const tr = H.transcript.filter((x) => x.type === 'say' || x.type === 'narrate' || x.type === 'choice').map((x) => `${x.type}|${x.who || ''}|${x.text}`);
    return { cp0, go, after, tr, chase: HW.chase.active };
  });
  t.ok(e5.go, 'E: standing still after "TESS. RUN." — caught (game over)');
  t.ok(e5.after.seen && !e5.after.lights && e5.after.map === 'gym', 'E: the retry reloads before the lights, seen_ch6_gym kept across the game over', e5.after);
  t.ok(!e5.tr.some((x) => /Marcus Webb\.$|^choice/.test(x)) && e5.tr.some((x) => /Then sit with me/.test(x)) && e5.tr.some((x) => /TESS\. RUN\./.test(x)) && e5.chase,
    'E: the replay jumps to "Then sit with me…" → the lights → "TESS. RUN." (no repeated lure, no choice)', e5.tr);
  // A reload at 'roll 2' (inside the locker, roll answered) resumes after_locker: the photo is always given.
  await S({ stage: 'locker' });
  const e6 = await game.hw(async (H) => {
    const HW = H.HW;
    H.setFlag('roll2_done', true); H.setFlag('seen_ch6_locker', true);
    HW.game.checkpoint('roll 2');
    HW.game.loadSave('auto');
    await HW.game.until(() => HW.state.inv.denise_photo > 0 && !HW.scripts.blocking, 60); await H.idle();
    return { photo: HW.state.inv.denise_photo || 0, taken: !!HW.state.flags.ch6_marcus_taken, open: !H.prop('gym_doors_shut')?.present };
  });
  t.ok(e6.photo === 1 && e6.taken && e6.open, "E: a reload at 'roll 2' resumes ch6.after_locker (photo given, the gym lets her go)", e6);
  // ch1.backpack hands the bag over to the breather while it's due.
  await S({ stage: 'ch6', flags: { safe_open: true } });
  const e7 = await game.hw(async (H) => {
    const HW = H.HW;
    await H.teleport('lobby', 'danny_bag'); await H.idle();
    HW.entities.syncParty();
    H.transcript.length = 0; H.choiceQueue = [0, 1];
    H.face('up'); await H.interact(); await HW.game.until(() => HW.state.flags.ch6_breather_done && !HW.scripts.blocking, 60); await H.idle();
    return { done: !!HW.state.flags.ch6_breather_done, lines: H.transcript.filter((x) => x.type === 'say').length };
  });
  t.ok(e7.done && e7.lines >= 5, 'E: Danny\'s backpack (ch1.backpack) → the breather', e7);
  await errs('run E');
}

if (!SHOTS_ONLY && (!ONLY || ONLY === 'F')) {
  // ---- run F: what VI–VII hand the Register (DESIGN §7–8)
  const f = await game.hw((H, a, b) => {
    const E = H.HW.endings;
    const look = (s) => {
      if (!s) return null;
      const st = { ...s, rollAnswered: s.roll, bonds: s.bonds };
      const model = E.buildRegisterModel(st);
      return { lines: model.lines.map((l) => `${l.id}:${l.ink}`), resolve: E.resolveEnding(st) };
    };
    return { a: look(a), b: look(b) };
  }, globalThis.__stateA || null, globalThis.__stateB || null);
  if (f.a) t.eq(f.a.lines, ['danny:pencil', 'leah:pencil', 'marcus:pencil'], 'F: run A (three bonds, never answered) — three friends in pencil, Tess not listed');
  if (f.b) t.eq(f.b.lines, ['danny:ink', 'leah:ink', 'marcus:pencil', 'tess:ink'], 'F: run B (Marcus\'s bond only, answered three times) — Danny/Leah ink, Marcus pencil, Tess ink');
  if (f.b) t.ok(['present', 'withdrawn'].includes(f.b.resolve), 'F: run B resolves (before the book) to PRESENT — Tess answered', f.b.resolve);
}

// ------------------------------------------------------------------------------------------ screenshots
// Real input (no autoAdvance): advance dialogue with Z, pause on the box to capture, choices with arrows.
const shots = [];
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
      screens: HW.ui.screens.filter((s) => !s.closing).map((s) => s.name), chapter: HW.state.chapter, map: HW.map?.id,
      overlays: [...HW.ui.overlays.items.keys()], lights: !!HW.state.flags.ch6_gym_lights, phase: HW.assembly?.phase,
      seenLeah: !!HW.state.flags.seen_ch7_front_leah, bondMarcus: !!HW.state.flags.bond_marcus,
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

if (!NO_SHOTS && !ONLY) {
  await game.close();
  game = await open();
  const g = game;
  const key = async (k, n = 1) => { for (let i = 0; i < n; i++) { await g.page.keyboard.press(k); await sleep(140); } };
  const play = () => g.hw((H) => { H.autoAdvance(false); H.timeScale(1); });
  const shot = async (name) => { await g.shot(name); shots.push(name); };

  const SH7 = process.argv.includes('--shots7');     // (iterate on Chapter VII's frames only)
  if (!SH7) {
  // VI — the intercom after the safe.
  await S({ stage: 'ch6', bonds: { danny: true, leah: true }, flags: { safe_seen_past: true }, auto: false, timeScale: 1 });
  await play();
  await g.hw((H) => { H.screenAnswer('safe', true); const ui = H.HW.ui; const o = ui.open.bind(ui); ui.open = (n, a, p) => (n === 'safe' ? Promise.resolve(true) : o(n, a, p)); });
  await g.face('up'); await sleep(250); await key('z');
  await drive(g, { label: 'safe', until: (st) => !st.blocking && st.mode === 'play', maxSec: 90, rules: [
    { when: (st) => st.screens.includes('doc'), delay: 900, act: async () => { await key('x'); } },
    { when: (st) => st.text && st.text.startsWith('Theresa.') && st.done, shot: 'n4_01_ch6_intercom' },
  ] });
  // VI — the breather.
  await g.walkTo([61, 15]);
  await g.hw(async (H) => { await H.HW.game.until(() => H.HW.map?.id === 'lobby', 10); });
  await g.walkTo([8, 15]);
  await drive(g, { label: 'breather', until: (st) => !st.blocking && st.mode === 'play', choices: [0, 0], maxSec: 150, rules: [
    { when: (st) => st.choice && st.choice.ready && st.choice.list[0].startsWith('Tell'), delay: 300, shot: 'n4_02_ch6_bench' },
  ] });
  // VI — the gym.
  await S({ stage: 'gym', auto: false, timeScale: 1 });
  await play();
  await g.walkTo([56, 15]);
  await drive(g, { label: 'doors', until: (st) => !st.blocking && st.mode === 'play', maxSec: 40 });
  await g.walkTo([59, 15]);
  await g.hw(async (H) => { await H.HW.game.until(() => H.HW.map?.id === 'gym', 10); });
  await sleep(600);
  await g.walkTo([6, 21]);
  await drive(g, { label: 'gym', until: (st) => st.text && st.text.startsWith('TESS'), choices: [1], maxSec: 200, rules: [
    { when: (st) => st.text === 'Marcus Webb.' && st.done, shot: 'n4_03_ch6_lure' },
    { when: (st) => st.lights, delay: 900, shot: 'n4_04_ch6_bank4' },
  ] });
  await sleep(300);
  await shot('n4_05_ch6_run');
  // VI — the locker.
  await S({ stage: 'locker', auto: false, timeScale: 1 });
  await play();
  await g.face('up'); await sleep(300); await key('z');
  await drive(g, { label: 'locker', until: (st) => st.choice && st.choice.ready, maxSec: 120, rules: [
    { when: (st) => st.text && st.text.startsWith('Theresa?') && st.done, shot: 'n4_06_ch6_locker_face' },
  ] });
  await key('z');
  await drive(g, { label: 'after locker', until: (st) => !st.blocking && st.mode === 'play', maxSec: 120 });
  await g.walkTo('shower_mirrors');
  await drive(g, { label: 'showers', until: (st) => !st.blocking && st.mode === 'play', maxSec: 150, rules: [
    { when: (st) => st.text && /NOT GONE|IN INK/.test(st.text) && st.done, shot: 'n4_07_ch6_showers' },
  ] });
  }
  // VII — the lobby: the memorial and Mom's voice.
  await S({ stage: 'ch7', bonds: { danny: true, leah: false }, roll1: true, auto: false, timeScale: 1 });
  await play();
  await g.walkTo([1, 15]);
  await g.hw(async (H) => { await H.HW.game.until(() => H.HW.map?.id === 'lobby', 10); });
  await g.walkTo([20, 15]);
  await drive(g, { label: 'ch7 start', until: (st) => !st.blocking && st.mode === 'play' && st.chapter === 7, maxSec: 150, rules: [
    { when: (st) => st.text && st.text.startsWith('Under them') && st.done, shot: 'n4_08_ch7_memorial' },
  ] });
  // VII — the Assembly.
  await g.walkTo('aud_doors'); await g.face('up'); await sleep(200); await key('z');
  await g.hw(async (H) => { H.god(true); await H.HW.game.until(() => H.HW.map?.id === 'aud', 20); });
  await drive(g, { label: 'to aud', until: (st) => !st.blocking && st.mode === 'play', maxSec: 30 });
  await g.walkTo([16, 31]);
  await drive(g, { label: 'aud enter', until: (st) => !st.blocking && st.mode === 'play', maxSec: 150, rules: [
    { when: (st) => st.text && st.text.startsWith('{dim}"Hallowell') && st.done, shot: 'n4_09_ch7_assembly' },
  ] });
  await g.walkTo('beside_leah'); await g.face('down'); await sleep(200); await key('z');
  await drive(g, { label: 'roll3', until: (st) => st.seenLeah && !st.blocking && st.mode === 'play' && !st.text, choices: [0], maxSec: 150, rules: [
    { when: (st) => st.text === 'Theresa Dolan?' && st.done, shot: 'n4_10_ch7_roll3' },
    { when: (st) => st.text && st.text.startsWith('Sit down, Theresa') && st.done, shot: 'n4_11_ch7_leah' },
  ] });
  await g.hw((H) => { H.give('diary_page'); H.setFlag('diary_page', true); });
  await g.press('up', 250);
  await g.hw((H) => H.idle());
  await g.walkTo('beside_marcus'); await g.face('down'); await sleep(300); await key('z');
  await drive(g, { label: 'marcus', until: (st) => st.bondMarcus && !st.blocking && st.mode === 'play' && !st.text, maxSec: 150, rules: [
    { when: (st) => st.text && st.text.startsWith('Okay. {p} Okay, Aunt Denise') && st.done, shot: 'n4_12_ch7_marcus' },
  ] });
  await errs('screenshot pass');
  console.log(`  info screenshots (${shots.length}): ${shots.join(', ')}`);
}

await game.close();
await browser.close();
process.exit(t.done() ? 0 : 1);
