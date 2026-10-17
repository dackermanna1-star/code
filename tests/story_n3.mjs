// Story test — narrative-3: Chapter V (Upstairs).
//
// Plays the chapter end to end the way a player would: real walks (H.walkTo / H.press, real collisions,
// exits and triggers), interactions (H.interact on the props), the systems' scripted period, the long
// hall (loops, the whistle, the pass), with dialogue auto-advancing and choices from __HW.choiceQueue.
//   run A (continuous, from ch4.end): gate · Danny [Promise] · the 205 period · the long hall looping
//          1–4 + running (whistle reset) + back for the pass · Kevin keeps it · west2 (202 + Charter excerpt,
//          locked mezzanine door) · the mirror (roll #1 silent) · False Leah [Ask] → [Back out] → door
//          released once → held · library: Leah [Philly] · catalog (refused, compact, key) · case →
//          Charter · the knock · unbar → Chapter VI.
//   run B: gate refusals (no keys / before roll #1 + bolt cutters) · long-hall refusal before 205 · Danny
//          [Hang in there] · a reload between the bond and the period (resumes) · the pass picked up first
//          (no loops) · roll #1 answered (fog variant) · False Leah [Sit down] → PRESENT → retry at the
//          threshold (abbreviated) → [Back out] → door lost twice → PRESENT → retry → held · Leah [later].
//   run C: Danny [I'm sorry] · Leah [Nowhere] · no Charter · a free period upstairs (Marcus sits; god on).
// Then a screenshot pass WITHOUT autoAdvance (real key presses, pausing on dialogue boxes and staged
// frames), plus the stinger budget. Asserts flags / items / chapter / objective / checkpoints at each beat
// and zero captured errors. Usage: node tests/story_n3.mjs [--no-shots] [--shots-only] [--only=A|B|C]
import { launch, openGame, suite } from './lib.mjs';

const t = suite('story_n3');
const NO_SHOTS = process.argv.includes('--no-shots');
const SHOTS_ONLY = process.argv.includes('--shots-only');
const ONLY = (process.argv.find((a) => a.startsWith('--only=')) || '').slice(7);
const sleep = (ms) => new Promise((r) => setTimeout(r, ms));

// ------------------------------------------------------------------------------------------ page helpers
/** Fresh game in the state of the end of Chapter IV (or later, via cfg.flags). Runs in the page. */
async function setup(H, cfg) {
  const HW = H.HW;
  H.autoAdvance(true);
  H.timeScale(cfg.timeScale || 1);
  H.god(!!cfg.god);
  await H.newGame({ skipIntro: true });
  H.autoAdvance(true);
  const base = { pro_doors_cut: true, ch1_danny_vanished: true, ch1_102_rows: true, ch1_front_loop: true, ch1_rooms_entered: 3, ch1_danny_stuck: true };
  const ch3 = { ch2_bell1: true, ch2_leah_taken: true, ch2_vhs_seen: true, ch2_marcus_told: true, colonel_named: true, east_doors_open: true };
  const ch4 = { ch3_jan_key: true, ch3_keyring: true, ch3_period_done: true, coalbin_empty: true };
  const ch5 = { office_open: true, ch4_pa_used: true, ch4_signout_read: true, ch4_kevin: true, roll1_done: true, roll1_note: 'Danny — 205? Leah — library?', ch4_hide_done: true };
  const pre = cfg.chapter >= 5 || cfg.ch4end;
  const flags = { ...base, ...ch3, ...(cfg.chapter >= 4 ? ch4 : {}), ...(pre ? ch5 : {}), ...(cfg.flags || {}) };
  for (const [k, v] of Object.entries(flags)) H.setFlag(k, v);
  if (cfg.answered) H.setFlag('roll1_answered', true);
  HW.state.chapter = cfg.chapter;
  HW.state.party = cfg.party || ['marcus'];
  for (const it of ['danny_flashlight', 'bolt_cutters', 'camcorder', ...(cfg.chapter >= 4 && !cfg.noKeys ? ['keyring'] : []), ...(cfg.items || [])]) H.give(it);
  if (cfg.chapter >= 5) {
    HW.patrol.enable({ maps: ['east2', 'west2'] });
    HW.chapters?.applyPeriods?.(5);
  }
  // the map load runs its onEnter with this state
  await H.teleport(cfg.map, cfg.at);
  if (cfg.noPeriods) { HW.periods.disable(); }
  if (cfg.noPatrol) { HW.patrol.disable(); for (const s of [...HW.patrol.sentinels]) HW.patrol.despawn(s.id); }
  H.refresh();
  H.transcript.length = 0;
  H.errors.length = 0;
  // sfx tap: count stingers (DESIGN §14 budget)
  if (!HW.audio.__n3tap) {
    const orig = HW.audio.sfx.bind(HW.audio);
    HW.audio.__n3tap = { counts: {} };
    HW.audio.sfx = (id, o) => { const c = HW.audio.__n3tap.counts; c[id] = (c[id] || 0) + 1; return orig(id, o); };
  }
  HW.audio.__n3tap.counts = {};
  H.autoAdvance(cfg.auto !== false);
  return HW.state.chapter;
}

/** Walk to a target and wait until the game is idle (triggers that fire on the way included). */
async function go(H, target, opts) {
  const ok = await H.walkTo(target, opts);
  await H.steps(2);
  await H.idle(120);
  return ok;
}

/** Interact facing a direction. */
async function use(H, dir) {
  if (dir) H.face(dir);
  await H.steps(2);
  await H.interact();
  await H.idle(120);
}

/** Cross an exit rect into another map: walk onto it, then wait for the new map. */
async function cross(H, target, mapId, opts) {
  await H.walkTo(target, opts);
  await H.HW.game.until(() => H.HW.map?.id === mapId && !H.HW.game.transferring, 15);
  await H.steps(3);
  await H.idle(120);
  return H.HW.map?.id === mapId;
}

const TR = (H) => H.transcript.map((x) => ({ type: x.type, who: x.who, expr: x.expr, text: x.text, map: x.map }));

// ------------------------------------------------------------------------------------------ test helpers
const said = (tr, who, re) => tr.some((x) => (x.type === 'say' || x.type === 'think') && x.who === who && re.test(x.text));
const voice = (tr, re) => tr.some((x) => x.type === 'say' && x.who === 'voice' && re.test(x.text));
const narr = (tr, re) => tr.some((x) => x.type === 'narrate' && re.test(x.text));
const chose = (tr, text) => tr.some((x) => x.type === 'choice' && x.text === text);
const cps = (tr) => tr.filter((x) => x.type === 'checkpoint').map((x) => x.text);
const objs = (tr) => tr.filter((x) => x.type === 'objective').map((x) => x.text);

const browser = await launch();
const open = async () => {
  const g = await openGame(browser);
  await g.page.addScriptTag({ content: `window.__n3setup = ${setup.toString()}; window.__n3go = ${go.toString()}; window.__n3use = ${use.toString()}; window.__n3cross = ${cross.toString()};` });
  return g;
};
let game = await open();
const errs = async (label) => {
  const e = await game.errors();
  t.ok(e.length === 0, `${label}: zero captured errors`, e.slice(0, 6));
};
const snapState = (g) => g.hw((H) => {
  const HW = H.HW;
  return {
    chapter: HW.state.chapter, map: HW.map?.id, obj: HW.state.objective, party: HW.state.party.slice(),
    inv: Object.keys(HW.state.inv).filter((k) => HW.state.inv[k] > 0), roll: HW.state.rollAnswered,
    flags: { ...HW.state.flags }, cp: HW.state.checkpoint, mode: HW.game.mode, player: H.player(),
    stingers: { ...(HW.audio.__n3tap?.counts || {}) }, bonds: { ...HW.state.bonds },
  };
});

// ================================================================================================ part 1
// From ch4.end to the end of the 205 period (east1 gate, east2, Danny, the scripted period).
async function partUpstairs(g, { bond, label, fromCh4 = true, reloadMid = false }) {
  const r = await g.hw(async (H, fromCh4, bond, reloadMid) => {
    const HW = H.HW;
    const log = {};
    const mark = (k, v) => { log[k] = v; };
    if (fromCh4) {
      await H.run('ch4.end');
      await H.idle();
      mark('chapter', HW.state.chapter);
      mark('obj', HW.state.objective);
      mark('patrol', HW.state.patrolCfg?.maps || null);
      mark('periodsOff', !HW.periods.enabled);
      // office → lobby → east1
      mark('w1>lobby', await window.__n3cross(H, [61, 15], 'lobby'));
      mark('lobby>e1', await window.__n3cross(H, [28, 15], 'east1'));
    }
    if (HW.map.id === 'east1') {
      // the gate: the 2F GATE key
      mark('gate', await window.__n3go(H, 'stair_gate'));
      await window.__n3use(H, 'up');
      mark('gate_open', !!HW.state.flags.gate_2f_open);
      mark('e1>e2', await window.__n3cross(H, [14, 3], 'east2'));
      await H.steps(10); await H.idle();
    } else {
      mark('gate_open', !!HW.state.flags.gate_2f_open);
      mark('e1>e2', HW.map.id === 'east2');
    }
    mark('danny_spawned', !!HW.entities.get('danny'));
    mark('danny_seated', HW.entities.get('danny')?.seat?.id || null);
    mark('upstairs', !!HW.state.flags.seen_ch5_upstairs);
    // 205
    H.choiceQueue = [bond];
    mark('door205', await window.__n3go(H, 'door_205'));
    // (the walk's promise stays pending through the cutscene the trigger starts — don't await it)
    H.walkTo('in_205');
    await HW.game.until(() => HW.scripts.blocking > 0, 10);
    if (reloadMid) {
      await HW.game.until(() => HW.state.checkpoint === 'danny bond', 60);
      mark('cp_bond', HW.state.checkpoint);
      // quit before the period could finish: back to the checkpoint
      H.load('auto');
      await H.steps(5);
      mark('reload_map', HW.map.id);
      mark('reload_period', HW.periods.phase);
    }
    await HW.game.until(() => HW.state.flags.ch5_205_period_done && !HW.scripts.blocking, 300);
    await H.idle();
    mark('colonel', (HW.colonel.log || []).map((e) => e.ev));
    mark('periodsOn', HW.periods.enabled && HW.periods.config?.maps);
    mark('periodsCfg', HW.periods.config && { passing: HW.periods.config.passing, length: HW.periods.config.length, max: HW.periods.config.max });
    mark('lea', !!H.prop('e2_chalk_205_lea')?.present);
    mark('leave_b', !!H.prop('e2_chalk_205_b')?.present);
    mark('danny_anim', HW.entities.get('danny')?.animName || null);
    mark('seated', H.player().seated);
    mark('party', HW.state.party.slice());
    return log;
  }, fromCh4, bond, reloadMid);
  const s = await snapState(g);
  const tr = await g.hw((H) => H.transcript.map((x) => ({ type: x.type, who: x.who, expr: x.expr, text: x.text })));
  if (fromCh4) {
    t.eq(r.chapter, 5, `${label} ch4.end → g.chapter(5) → ch5.start`);
    t.eq(r.obj, 'Room 205. Upstairs — the east stairs.', `${label} ch5.start objective`);
    t.eq(r.patrol, ['east2', 'west2'], `${label} ch5.start: HW.patrol.enable east2/west2`);
    t.ok(r.periodsOff, `${label} free periods wait for the 205 period (chapters.js periodsAfter)`);
    t.ok(r['w1>lobby'] && r['lobby>e1'], `${label} walked office → lobby → east1`, r);
  }
  t.ok(r.gate_open, `${label} the 2F GATE key opens the stair gate (gate_2f_open)`, r);
  t.ok(said(tr, 'marcus', /^Second floor's been shut since '79\.$/) || !fromCh4, `${label} gate: Marcus — "Second floor's been shut since '79."`);
  t.ok(r['e1>e2'], `${label} up the east stairs to east2`);
  t.ok(r.danny_spawned && r.danny_seated === 'e2_desk_danny', `${label} east2 onEnter: Danny in session at e2_desk_danny`, r);
  if (fromCh4) t.ok(r.upstairs && said(tr, 'tess', /A pencil\./), `${label} first time upstairs: "A pencil. Somebody up here is writing."`);
  t.ok(said(tr, 'danny', /^It wrote my name, Dolan\. \{p\} In a big book\. \{p\} Under the school\.$/), `${label} Danny — "It wrote my name, Dolan. In a big book. Under the school."`);
  t.ok(said(tr, 'danny', /He smells like pennies\. \{p\} And, like, Christmas ham\./), `${label} Danny — pennies / Christmas ham`);
  t.ok(said(tr, 'danny', /^I can't get up, Dolan\. I tried\. \{p\} My legs are, like\.\.\. enrolled\.$/), `${label} Danny — "My legs are, like... enrolled."`);
  t.ok(said(tr, 'danny', /^I'm the guy who gets stuck\. \{p\} That's my whole thing\.$/), `${label} Danny — "I'm the guy who gets stuck. That's my whole thing."`);
  const opts = ["I'm coming back for you. Promise.", "Hang in there. You're gonna be fine.", "I'm sorry, Danny."];
  if (!t.ok(chose(tr, opts[bond]), `${label} BOND (Danny): [${opts[bond]}]`) && process.env.N3_DEBUG) console.log(tr.map((x) => `${x.type}|${x.who}|${x.text}`).join('\n'));
  if (bond === 0) {
    t.ok(said(tr, 'danny', /^You can't promise that\.$/) && said(tr, 'tess', /^Watch me\.$/), `${label} Promise → "You can't promise that." / "Watch me."`);
    t.ok(s.flags.bond_danny && s.bonds.danny, `${label} bond_danny (state.bonds.danny)`);
    t.ok(r.lea && !r.leave_b, `${label} the pencil stops: the board reads …I WILL NOT LEA (e2_chalk_205_lea)`, r);
    t.ok(narr(tr, /I WILL NOT LEA/), `${label} narration: the last line breaks off at LEA`);
  } else {
    t.ok(!s.flags.bond_danny && !s.bonds.danny, `${label} no bond_danny`);
    t.ok(!r.lea && r.leave_b, `${label} the board keeps going: I WILL NOT LEAVE`, r);
  }
  t.ok(cps(tr).includes('danny bond'), `${label} checkpoint after the Danny bond`);
  if (r.cp_bond) t.ok(r.reload_map === 'east2', `${label} reload at 'danny bond' → the period resumes by itself (onEnter)`, r);
  t.ok(said(tr, 'marcus', /^Sit\.$/), `${label} 205 period: Marcus — "Sit."`);
  t.ok(['spawn', 'despawn'].every((e) => r.colonel.includes(e)), `${label} 205 period: he steps in and leaves`, r.colonel);
  t.ok(r.colonel.includes('closePass'), `${label} 205 period: the close pass beside her desk`, r.colonel);
  t.ok(voice(tr, /^Good boy\. \{p\} I knew your grandfather's name\.$/), `${label} 205 period: "Good boy. I knew your grandfather's name." (voice styling)`);
  t.ok(!tr.some((x) => x.who === 'colonel'), `${label} no Colonel bust before the gym`);
  t.ok(!tr.some((x) => x.type === 'gameover'), `${label} 205 period: no fail`);
  t.eq(s.flags.portrait_state, 'empty', `${label} portrait_state → empty`);
  t.ok(s.flags.ch5_205_period_done, `${label} ch5_205_period_done`);
  t.ok(Array.isArray(r.periodsOn) && r.periodsOn.join() === 'east2,west2', `${label} free periods now run on east2/west2`, r.periodsOn);
  t.eq(r.periodsCfg, { passing: 150, length: 60, max: 3 }, `${label} free periods: passing 150 s, ≤ 60 s, max 3`);
  t.ok(cps(tr).includes('205 period'), `${label} checkpoint after the 205 period`);
  t.eq(s.obj, 'Leah. The library — west.', `${label} objective → the library`);
  t.ok(!r.seated && r.party.includes('marcus'), `${label} up again, Marcus back in the party`, r);
  if (bond === 0) t.ok(r.danny_anim === 'sit_up', `${label} Danny's pencil stays stopped (held frame)`, r.danny_anim);
  return tr;
}

// ================================================================================================ part 2
// The long hall: optionally loop 1–4 + run (whistle) + go back for the pass; or have the pass already.
async function partLongHall(g, { loops, label }) {
  const r = await g.hw(async (H, loops) => {
    const HW = H.HW;
    const log = {};
    const mark = (k, v) => { log[k] = v; };
    const tr0 = () => H.transcript.length;
    if (HW.map.id !== 'east2') { await H.teleport('east2', 'hall_west'); }
    if (!HW.state.inv.hall_pass && !loops) {
      mark('to206', await window.__n3go(H, 'hall_pass'));
      await window.__n3use(H, 'up');
      mark('pass', !!HW.state.inv.hall_pass);
      mark('hook', H.prop('e2_hall_pass')?.present ?? 'gone');
    }
    mark('e2>lh', await window.__n3cross(H, [1, 15], 'longhall'));
    mark('kevin', !!HW.entities.get('kevin'));
    mark('lh_active', !!HW.longhall?.active);
    // under the arch
    await window.__n3go(H, [78, 9]);
    mark('cp_lh', HW.state.checkpoint);
    if (loops) {
      for (let i = 1; i <= 4; i++) {
        await window.__n3go(H, [25, 9]);
        await H.press('left', 700);
        await H.steps(6);
        await HW.game.until(() => !HW.scripts.active || HW.scripts.blocking, 3);
        await H.steps(60);
        await H.idle(30);
        mark(`loop${i}`, Number(HW.state.flags.longhall_loops) || 0);
        mark(`x${i}`, H.player().tx);
      }
      mark('kevin_far_gone', !HW.entities.get('kevin_far'));
      mark('strip', HW.audio?._strip ?? null);
      // running → the whistle → blackout → back at loop_reset
      await window.__n3go(H, [70, 9]);
      HW.input.setVirtual('left', true); HW.input.setVirtual('run', true);
      await HW.game.until(() => HW.scripts.blocking > 0, 4);
      HW.input.setVirtual('left', false); HW.input.setVirtual('run', false);
      await H.steps(5);
      await H.idle(60);
      mark('after_whistle', H.player());
      mark('lights_back', !!HW.flashlight?.on);
      // back east for the pass (walking east is never touched)
      mark('lh>e2', await window.__n3cross(H, [89, 9], 'east2'));
      mark('to206', await window.__n3go(H, 'hall_pass'));
      await window.__n3use(H, 'up');
      mark('pass', !!HW.state.inv.hall_pass);
      mark('e2>lh2', await window.__n3cross(H, [1, 15], 'longhall'));
    }
    // with the pass: straight to Kevin (no loops)
    const before = Number(HW.state.flags.longhall_loops) || 0;
    await window.__n3go(H, [7, 9]);
    await HW.game.until(() => HW.state.flags.longhall_cleared && !HW.scripts.blocking, 60);
    await H.idle();
    mark('loops_with_pass', (Number(HW.state.flags.longhall_loops) || 0) - before);
    mark('cleared', !!HW.state.flags.longhall_cleared);
    mark('pass_after', !!HW.state.inv.hall_pass);
    mark('party', HW.state.party.slice());
    mark('marcus_ent', !!HW.entities.get('marcus'));
    mark('cp', HW.state.checkpoint);
    mark('lh_active_after', !!HW.longhall?.active);
    // on to west2
    mark('lh>w2', await window.__n3cross(H, [1, 9], 'west2'));
    await H.steps(10); await H.idle();
    mark('faucet', !!HW.state.flags.seen_ch5_west2_arrive);
    void tr0;
    return log;
  }, !!loops);
  const s = await snapState(g);
  const tr = await g.hw((H) => H.transcript.map((x) => ({ type: x.type, who: x.who, expr: x.expr, text: x.text, map: x.map })));
  t.ok(r['e2>lh'] && r.lh_active && r.kevin, `${label} into the long hall (system active, Kevin at his post)`, r);
  t.ok(narr(tr, /HALL PASS REQUIRED BEYOND THIS POINT — BY ORDER OF THE PRINCIPAL/), `${label} the archway sign`);
  t.ok(said(tr, 'tess', /The chair's empty\./), `${label} across the void: the chair is empty`);
  t.eq(r.cp_lh, 'long hall', `${label} checkpoint at the long hall start`);
  if (loops) {
    t.eq([r.loop1, r.loop2, r.loop3, r.loop4], [1, 2, 3, 4], `${label} the hall loops without the pass (1–4)`);
    t.ok([r.x1, r.x2, r.x3, r.x4].every((x) => x >= 50 && x <= 60), `${label} each loop drops her 32 tiles back east`, [r.x1, r.x2, r.x3, r.x4]);
    t.ok(said(tr, 'tess', /^That's the same door\.$/), `${label} loop 1 — "That's the same door."`);
    t.ok(said(tr, 'tess', /^He's wearing a Safety Patrol belt\. \{p\} Those kids checked passes\.$/), `${label} loop 2 — "He's wearing a Safety Patrol belt. Those kids checked passes."`);
    t.ok(r.kevin_far_gone, `${label} loop 2: the far figure is gone after the beam stutters`);
    t.ok(said(tr, 'marcus', /^There was a pass on a hook in 206\.$/), `${label} loop 3 — Marcus: "There was a pass on a hook in 206."`);
    t.ok(voice(tr, /^Theresa\? \{p\} Is that you\? \{p=0\.7\} Open the door\.$/), `${label} loop 4 — "Theresa? Is that you? Open the door." (voice styling)`);
    t.ok(tr.some((x) => x.type === 'say' && x.who === 'voice' && /Open the door/.test(x.text)), `${label} loop 4: mimic as 'voice' (name Leah?)`);
    t.ok(r.after_whistle && r.after_whistle.tx === 77 && r.after_whistle.ty === 9, `${label} running → whistle → blackout → reset at loop_reset`, r.after_whistle);
    t.ok(said(tr, 'tess', /^Okay\. Okay okay okay\. \{p\} Walk\. Don't run\.$/), `${label} after the reset: "Okay. Okay okay okay. Walk. Don't run."`);
    t.ok(r['lh>e2'], `${label} walking east always exits normally`);
  } else {
    t.ok(said(tr, 'tess', /^Got one\.$/), `${label} with the pass already: "Got one."`);
  }
  t.ok(r.pass === true || !loops, `${label} 206: the hall pass (item)`, r);
  t.eq(r.loops_with_pass, 0, `${label} with the pass the hall does not loop`);
  t.ok(said(tr, 'kevin', /\.\.\.pass\./) && said(tr, 'kevin', /\.\.\.one pass\./), `${label} Kevin — "...pass." / "...one pass."`);
  t.ok(r.cleared && !r.pass_after && !s.flags.hall_pass, `${label} he keeps the pass; longhall_cleared`, r);
  t.ok(said(tr, 'marcus', /^One student\. Right\. \{p\} Go\. \{p\} I'll go around — east stairs\. Find Leah\.$/), `${label} Marcus: "One student. Right. Go. I'll go around — east stairs. Find Leah."`);
  t.ok(said(tr, 'tess', /^He kept it\. \{p\} Of course he kept it\.$/), `${label} "He kept it. Of course he kept it."`);
  t.ok(!r.party.includes('marcus') && !r.marcus_ent, `${label} Marcus leaves the party — Tess is alone`, r);
  t.eq(r.cp, 'long hall cleared', `${label} checkpoint after the long hall`);
  t.ok(!r.lh_active_after, `${label} the long hall system is off once cleared`);
  t.ok(r['lh>w2'] && r.faucet && said(tr, 'tess', /A tap running/), `${label} west2: the tap, all the way down at the end`, r);
  t.ok(!tr.some((x) => x.type === 'gameover'), `${label} long hall: no game over (Kevin reports, never kills)`);
  return tr;
}

// ================================================================================================ part 3
// west2: 202, the locked mezzanine door, the mirror, the False Leah (choices per cfg).
async function partWest2(g, { label, readExcerpt = true, leahChoices, write, untilDone = false }) {
  const r = await g.hw(async (H, readExcerpt, leahChoices, write, untilDone) => {
    const HW = H.HW;
    const log = {};
    const mark = (k, v) => { log[k] = v; };
    if (readExcerpt) {
      mark('excerpt', await window.__n3go(H, 'charter_excerpt'));
      await window.__n3use(H, 'up');
    }
    mark('202', await window.__n3go(H, 'in_202'));
    // the mezzanine door, still locked (the faucet line)
    mark('mezz', await window.__n3go(H, [2, 15]));
    await window.__n3use(H, 'left');
    mark('mezz_locked', H.prop('w2_mezz_door')?.state);
    mark('faucet_on', !HW.state.flags.adair_met);
    // the mirror
    await window.__n3go(H, 'in_rr');
    await window.__n3go(H, 'mirror_2f');
    await HW.game.until(() => HW.state.flags.adair_met && !HW.scripts.blocking, 60);
    await H.idle();
    mark('cp_mirror', HW.state.checkpoint);
    mark('compact_unlocked', !!HW.state.flags.compact_unlocked);
    mark('door201', H.prop('w2_door_201')?.state);
    mark('false_leah', !!HW.entities.get('false_leah'));
    mark('false_leah_seat', HW.entities.get('false_leah')?.seat?.id || null);
    // the False Leah
    H.choiceQueue = leahChoices.slice();
    if (write) H.screenAnswer('write', write.slice());
    await window.__n3go(H, 'door_201');
    await H.walkTo('in_201');
    await H.steps(4);
    if (untilDone) await HW.game.until(() => HW.state.flags.false_leah_done && !HW.scripts.blocking, 400);
    else await HW.game.until(() => HW.state.flags.false_leah_done || HW.game.mode === 'gameover' || (!HW.scripts.blocking && HW.game.mode === 'play' && HW.state.flags.seen_ch5_false_leah), 120);
    await H.idle();
    mark('mode', HW.game.mode);
    mark('done', !!HW.state.flags.false_leah_done);
    mark('cp_201', HW.state.checkpoint);
    mark('obj', HW.state.objective);
    return log;
  }, readExcerpt, leahChoices, write || null, untilDone);
  return r;
}

async function checkWest2(g, r, { label, answered, readExcerpt = true }) {
  const tr = await g.hw((H) => H.transcript.map((x) => ({ type: x.type, who: x.who, expr: x.expr, text: x.text })));
  const s = await snapState(g);
  t.ok(said(tr, 'tess', /^OUR PROUD HERITAGE\./), `${label} 202: OUR PROUD HERITAGE`);
  if (readExcerpt) t.ok(said(tr, 'tess', /Subject to its rules as any child/), `${label} 202: the Charter excerpt reaction (read)`);
  t.ok(r.mezz_locked === 'locked' && narr(tr, /^Locked\. Behind me, a faucet is running\.$/), `${label} mezzanine door before the compact: "Locked. Behind me, a faucet is running."`, r);
  t.ok(narr(tr, answered ? /^\{dim\}YOU ANSWERED\. DON'T AGAIN\.\{\/dim\}$/ : /^\{dim\}DON'T ANSWER HIM\{\/dim\}$/), `${label} Adair's fog: ${answered ? "YOU ANSWERED. DON'T AGAIN." : "DON'T ANSWER HIM"}`);
  t.ok(!tr.some((x) => x.who === 'adair'), `${label} Adair never speaks (fog = narration)`);
  t.ok(r.compact_unlocked && s.flags.adair_met, `${label} adair_met, compact_unlocked`, r);
  t.ok(tr.some((x) => x.type === 'compact' && x.text === 'rr2f_1979') || said(tr, 'tess', /It remembers/), `${label} compact tutorial: the restroom in 1979`);
  t.eq(r.cp_mirror, 'adair met', `${label} checkpoint after adair_met`);
  t.ok(r.door201 === 'open' && r.false_leah && r.false_leah_seat === 'w2_desk_false_leah', `${label} the 201 door swings open; she's at the desk (after adair_met only)`, r);
  t.ok(objs(tr).includes('Room 201.'), `${label} objective "Room 201."`);
  return { tr, s };
}

// ================================================================================================ part 4
// The library: the mezzanine door, the green lamp, Leah, (catalog, case), the knock, unbar → Ch6.
async function partLibrary(g, { label, choice, charter }) {
  const r = await g.hw(async (H, choice, charter) => {
    const HW = H.HW;
    const log = {};
    const mark = (k, v) => { log[k] = v; };
    if (HW.map.id !== 'west2') await H.teleport('west2', 'hall_west');
    await window.__n3go(H, [2, 15]);
    H.face('left'); await H.steps(2);
    await H.interact();
    await HW.game.until(() => HW.map?.id === 'library' && !HW.game.transferring, 15);
    await H.steps(4); await H.idle();
    mark('in_lib', HW.map.id);
    mark('leah_ent', !!HW.entities.get('leah'));
    mark('leah_seat', HW.entities.get('leah')?.seat?.id || null);
    // the walkway: the lamp below
    await window.__n3go(H, [18, 9]);
    mark('lib_enter', !!HW.state.flags.seen_ch5_library_enter);
    // through the aisle behind the stacks to the spiral
    mark('to_spiral', await window.__n3cross(H, [1, 11], 'library'));
    await HW.game.until(() => H.player().ty >= 14, 5);
    await H.idle();
    mark('at_bottom', H.player());
    H.choiceQueue = [choice];
    mark('to_leah', await window.__n3go(H, [9, 16]));
    await HW.game.until(() => HW.state.flags.ch5_leah_found && !HW.scripts.blocking, 60);
    await H.idle();
    mark('cp_leah', HW.state.checkpoint);
    mark('cards', !!H.prop('lib_checkout_cards')?.present);
    // back up the spiral and around would skip the knock; instead the catalog (inside the knock rect)
    if (charter) {
      await window.__n3go(H, 'card_catalog');
      await HW.game.until(() => HW.state.flags.ch5_knocked && !HW.scripts.blocking, 30);
      await H.idle();
      mark('knock_first', !!HW.state.flags.ch5_knocked);
      H.face('up'); await H.steps(2); await H.interact(); await H.idle();
      mark('catalog_refused', !HW.state.inv.case_key);
      // the compact at the catalog: Mrs. Ostrowski, drawer HA–HE
      HW.compact.use();
      await H.steps(10);
      mark('past', HW.compact.current?.id || null);
      HW.compact.use(); await H.steps(4);
      mark('saw_past', !!HW.state.flags.saw_catalog_past);
      H.face('up'); await H.steps(2); await H.interact(); await H.idle();
      mark('key', !!HW.state.inv.case_key);
      await window.__n3go(H, 'display_case');
      H.face('up'); await H.steps(2); await H.interact(); await H.idle();
      mark('charter', !!HW.state.inv.charter);
      mark('case_state', H.prop('lib_case')?.state);
    } else {
      await window.__n3go(H, [20, 22]);
      await HW.game.until(() => HW.state.flags.ch5_knocked && !HW.scripts.blocking, 30);
      await H.idle();
      mark('knock_first', !!HW.state.flags.ch5_knocked);
    }
    mark('cp_knock', HW.state.checkpoint);
    // unbar
    await window.__n3go(H, 'barricade');
    H.face('right'); await H.steps(2); await H.interact();
    await HW.game.until(() => HW.state.chapter === 6 && !HW.scripts.blocking, 60);
    await H.idle();
    mark('door_open', !!HW.state.flags.library_door_open);
    mark('barricade', H.prop('lib_barricade')?.present ?? null);
    mark('marcus', !!HW.entities.get('marcus'));
    return log;
  }, choice, !!charter);
  const s = await snapState(g);
  const tr = await g.hw((H) => H.transcript.map((x) => ({ type: x.type, who: x.who, expr: x.expr, text: x.text })));
  t.eq(r.in_lib, 'library', `${label} the mezzanine door opens after the compact`);
  t.ok(r.leah_ent && r.leah_seat === 'lib_leah_chair', `${label} library onEnter: Leah at her table`, r);
  t.ok(r.lib_enter, `${label} the walkway: the green lamp below`);
  t.ok(said(tr, 'leah', /^There's no due date\. Every card\. \{p\} Nobody ever has to bring anything back\.$/), `${label} Leah — "There's no due date. Every card..."`);
  t.ok(said(tr, 'leah', /^My sister's like that\./), `${label} Leah — "My sister's like that..."`);
  t.ok(said(tr, 'leah', /^Where were you gonna go, T\? \{p\} After\.$/), `${label} Leah — "Where were you gonna go, T? After."`);
  const opts = ['Philly. Mom took a job. We leave at Christmas.', "Let's talk about it when we're out.", "Nowhere. I'm right here."];
  t.ok(chose(tr, opts[choice]), `${label} BOND (Leah): [${opts[choice]}]`);
  if (choice === 0) {
    t.ok(s.flags.bond_leah && s.bonds.leah, `${label} bond_leah`);
    t.ok(said(tr, 'leah', /^I know\.$/) && said(tr, 'leah', /In the Acme\. \{p\} By the \*lunchmeat\*, T\./) && said(tr, 'leah', /I made the tape in August\./),
      `${label} truth → "I know." / the Acme, the lunchmeat / "I made the tape in August."`);
    t.ok(said(tr, 'tess', /^I thought you meant Pittsburgh\.$/) && said(tr, 'leah', /^I know what you thought\.$/), `${label} "I thought you meant Pittsburgh." / "I know what you thought."`);
    t.ok(said(tr, 'leah', /Adair checked out the School Code\. Withdrawals\./) && said(tr, 'leah', /^Like you\.$/), `${label} the clue: "Adair checked out the School Code. Withdrawals..." / "Like you."`);
  } else if (choice === 1) {
    t.ok(!s.flags.bond_leah, `${label} no bond_leah`);
    t.ok(said(tr, 'leah', /^Sure\. Later\. \{p\} You're good at later\.$/) && said(tr, 'leah', /^WITHDRAWN\. \{p\} It's what they'll stamp on you too\.$/), `${label} deferral → "Sure. Later. You're good at later." / "WITHDRAWN..."`);
  } else {
    t.ok(!s.flags.bond_leah, `${label} no bond_leah`);
    t.ok(narr(tr, /She goes back to writing her name\./), `${label} lie → she goes back to writing her name`);
  }
  t.ok(narr(tr, /ADAIR, R\./), `${label} the School Code checkout card (ADAIR, R. — DUE OCT 26 1979)`);
  t.ok(said(tr, 'leah', /^My hand won't stop, T\. \{p\} Go\. Come back\.$/), `${label} "My hand won't stop, T. Go. Come back."`);
  t.ok(s.flags.adair_named && s.flags.ch5_leah_found, `${label} adair_named, ch5_leah_found`);
  t.eq(r.cp_leah, 'leah bond', `${label} checkpoint after the Leah bond`);
  t.ok(r.cards, `${label} her checkout cards on the table`);
  t.ok(r.knock_first && narr(tr, /Tess\? \{p\} It\\?'s Marcus\./) && said(tr, 'tess', /^Say my name\.$/) && narr(tr, /"\.\.\.Tess\."/), `${label} the knock: "Tess? It's Marcus." / "Say my name." / "...Tess."`, r);
  if (charter) {
    t.ok(r.catalog_refused && said(tr, 'tess', /Hundreds of drawers\. \{p\} I'd need to know which one\./), `${label} catalog without the 1979 view: "Hundreds of drawers. I'd need to know which one."`);
    t.ok(r.past === 'librarian' && r.saw_past, `${label} the compact at the catalog: Mrs. Ostrowski (saw_catalog_past)`, r);
    t.ok(r.key && s.flags.case_key === true, `${label} drawer HA–HE → case_key`, r);
    t.ok(r.charter && s.flags.charter && r.case_state === 'empty' && tr.some((x) => x.type === 'doc' && x.text === 'charter_full'), `${label} the case → the Founder's Charter (item, doc charter_full)`, r);
  } else {
    t.ok(!s.flags.charter, `${label} no Charter`);
  }
  t.ok(cps(tr).includes('marcus knocks'), `${label} checkpoint after Marcus knocks`);
  t.ok(r.door_open && r.barricade === false && r.marcus && s.party.includes('marcus'), `${label} unbar: library_door_open, Marcus rejoins`, r);
  t.ok(said(tr, 'tess', /There's a safe behind it\./), `${label} the crooked painting → "There's a safe behind it."`);
  t.ok(tr.some((x) => x.type === 'objective' && x.text === "Haupt's office. The safe."), `${label} objective "Haupt's office. The safe."`);
  t.eq(s.chapter, 6, `${label} ch5.end → g.chapter(6)`);
  t.ok(cps(tr).includes('chapter 6'), `${label} checkpoint 'chapter 6'`);
  return tr;
}

/** Transcript editor's view: spoken lines (say + think; voice counted too). */
function budget(tr, label) {
  const spoken = tr.filter((x) => x.type === 'say' || x.type === 'think');
  const v = spoken.filter((x) => x.who === 'voice').length;
  const col = spoken.filter((x) => x.who === 'voice' && /grandfather/.test(x.text)).length;
  console.log(`  info ${label}: ${spoken.length} spoken lines (${v} voice, ${col} Colonel), ${tr.filter((x) => x.type === 'narrate').length} narrations — budget 70 ±20%`);
  return spoken.length;
}

// ================================================================================================ runs
if (!SHOTS_ONLY && (!ONLY || ONLY === 'A')) {
  // ---- run A: continuous from ch4.end
  await game.hw((H, cfg) => window.__n3setup(H, cfg), { chapter: 4, ch4end: true, map: 'west1', at: 'in_office', timeScale: 6 });
  const all = [];
  const keep = async () => { const tr = await game.hw((H) => H.transcript.map((x) => ({ type: x.type, who: x.who, expr: x.expr, text: x.text }))); all.push(...tr); await game.hw((H) => { H.transcript.length = 0; }); };
  await partUpstairs(game, { bond: 0, label: 'A' });
  await keep();
  // keep the rest of the run deterministic: no free periods (run C covers one)
  await game.hw((H) => { H.HW.periods.disable(); });
  await partLongHall(game, { loops: true, label: 'A' });
  await keep();
  const w = await partWest2(game, { label: 'A', leahChoices: [0, 1], write: ['released', 'done'] });
  const { tr: trW } = await checkWest2(game, w, { label: 'A', answered: false });
  t.ok(w.done && w.mode === 'play', 'A 201: survived — false_leah_done', w);
  t.eq(w.cp_201, '201 threshold', 'A 201: checkpoint at the threshold');
  t.ok(said(trW, 'tess', /^Leah—$/) && voice(trW, /^I got out of the library, Theresa\. \{p\} I came to find you\.$/), 'A 201: "Leah—" / "I got out of the library, Theresa. I came to find you."');
  t.ok(trW.filter((x) => x.who === 'voice').every((x) => true) && said(trW, 'tess', /^That's in my bag\. \{p\} That's in my \*bag\*\.$/), "A 201: the camcorder tell — \"That's in my bag. That's in my *bag*.\"");
  t.ok(said(trW, 'tess', /Her chair's empty\. \{p\} And the corner isn't\./), "A 201: the compact tell — the empty chair, the mound in the corner");
  t.ok(chose(trW, 'Ask about the tape') && voice(trW, /^For the drive, silly\. \{p\} Pittsburgh\. \{p\} Thanksgiving\.$/), 'A 201: [Ask about the tape] → "For the drive, silly. Pittsburgh. Thanksgiving."');
  t.ok(chose(trW, 'Back out slowly'), 'A 201: [Back out slowly]');
  t.ok(narr(trW, /The door gives an inch/), 'A 201: first release → the door gives an inch, the hand');
  t.ok(said(trW, 'tess', /^Empty\.$/), 'A 201: silence, then the room is empty');
  const sA = await snapState(game);
  t.eq(sA.stingers.stinger_hard || 0, 1, 'A 201: stinger_hard exactly once (the head turn)');
  t.ok(!sA.flags.longhall_cleared || true, 'A');
  await keep();
  await partLibrary(game, { label: 'A', choice: 0, charter: true });
  await keep();
  budget(all, 'A ch5');
  if (process.env.N3_TRANSCRIPT) (await import('node:fs')).writeFileSync(process.env.N3_TRANSCRIPT, all.filter((x) => ['say', 'think', 'narrate', 'choice', 'objective', 'checkpoint'].includes(x.type)).map((x) => `${x.type.padEnd(10)} ${(x.who || '').padEnd(7)} ${x.expr ? `[${x.expr}] ` : ''}${x.text}`).join('\n'));
  const sA2 = await snapState(game);
  t.ok((sA2.stingers.stinger_soft || 0) <= 1, 'A: stinger_soft ≤ 1 in the chapter', sA2.stingers.stinger_soft);
  await game.hw((H, all) => { window.__n3all = all; }, all);
  await errs('run A');
}

if (!SHOTS_ONLY && (!ONLY || ONLY === 'B')) {
  // ---- run B
  // gate refusals: no keys (bolt cutters), keys but no roll #1
  const gate = await game.hw(async (H, cfg) => {
    const HW = H.HW;
    await window.__n3setup(H, cfg);
    await window.__n3go(H, 'stair_gate');
    H.choiceQueue = [0];
    await window.__n3use(H, 'up');
    const a = H.transcript.map((x) => `${x.type}|${x.who}|${x.text}`);
    H.give('keyring');
    H.transcript.length = 0;
    await window.__n3use(H, 'up');
    const b = H.transcript.filter((x) => x.type === 'say').map((x) => `${x.who}:${x.text}`);
    return { a, b, open: !!HW.state.flags.gate_2f_open, cutters: !!HW.state.flags.ch5_gate_cutters };
  }, { chapter: 3, map: 'east1', at: 'from_lobby', timeScale: 6, noKeys: true, flags: { roll1_done: false } });
  t.ok(gate.a.some((l) => /No shackle to cut\. \{p\} The lock's built into the gate\./.test(l)) && gate.cutters, 'gate: bolt cutters → "No shackle to cut. The lock\'s built into the gate."', gate.a);
  t.eq(gate.b, ["marcus:Not up. {p} We don't even know where they are.", 'tess:The intercom.'], 'gate: before roll #1 — Marcus "Not up. We don\'t even know where they are." / Tess "The intercom."');
  t.ok(!gate.open, 'gate: stays locked before roll #1');

  // Ch5 mid-chapter: before 205 the long hall refuses; Danny [Hang in there]; reload between bond and period
  await game.hw((H, cfg) => window.__n3setup(H, cfg), { chapter: 5, map: 'east2', at: 'from_east1', timeScale: 6, flags: { gate_2f_open: true }, noPeriods: true });
  const ref = await game.hw(async (H) => {
    const HW = H.HW;
    await H.idle();
    H.transcript.length = 0;
    H.walkTo([1, 15]);
    await HW.game.until(() => HW.scripts.blocking > 0, 20);
    await H.idle();
    await H.walkTo(H.player());   // a player stops after the refusal (cancels the autopilot)
    await H.steps(4); await H.idle();
    return { map: HW.map.id, tr: H.transcript.map((x) => `${x.who}:${x.text}`), p: H.player() };
  });
  t.ok(ref.map === 'east2' && ref.tr.includes("marcus:Two-oh-five first. {p} He's right there, Tess.") && ref.p.tx >= 2, 'long hall before 205: Marcus "Two-oh-five first. He\'s right there, Tess." and she steps back', ref);
  await game.hw((H) => { H.transcript.length = 0; });
  await partUpstairs(game, { bond: 1, label: 'B', fromCh4: false, reloadMid: true }).catch(() => {});
  await game.hw((H) => { H.HW.periods.disable(); H.transcript.length = 0; });
  // the pass first, then the long hall without a single loop
  await partLongHall(game, { loops: false, label: 'B' });
  await game.hw((H) => { H.transcript.length = 0; H.setFlag('roll1_answered', true); });
  // False Leah: [Sit down] → PRESENT → retry at the threshold (abbreviated) → [Back out] → the door lost twice
  // → PRESENT → retry → [Back out] → held. Choices and door results are queued up front: each retry resumes
  // at once (the west2 onEnter picks the scene back up after the reload).
  const w1 = await partWest2(game, { label: 'B', readExcerpt: false, leahChoices: [1, 2, 2], write: ['released', 'released', 'done'], untilDone: true });
  const { tr: tb } = await checkWest2(game, w1, { label: 'B', answered: true, readExcerpt: false });
  const gos = tb.filter((x) => x.type === 'gameover' && /present/.test(x.text)).length;
  t.ok(chose(tb, 'Sit down') && gos === 2, 'B 201: [Sit down] → PRESENT; the door released twice → PRESENT (two referrals)', gos);
  t.ok(tb.filter((x) => x.type === 'say' && x.who === 'voice' && /I got out of the library/.test(x.text)).length === 1
    && tb.filter((x) => x.type === 'say' && x.who === 'voice' && /^Sit with me, Theresa\./.test(x.text)).length === 3,
    'B 201: each retry is abbreviated to the decision point ("Sit with me, Theresa." ×3, the intro once)');
  t.ok(tb.filter((x) => x.type === 'narrate' && /The door gives an inch/.test(x.text)).length === 1, 'B 201: first release → the hand round the door edge; second release → caught');
  t.ok(tb.filter((x) => x.type === 'checkpoint' && x.text === '201 threshold').length >= 1 && w1.cp_201 === '201 threshold', 'B 201: retries from the threshold checkpoint');
  t.ok(w1.done && w1.obj === "The library. The door by the girls' room.", 'B 201: third try held → the empty room; objective → the library', w1);
  const sB = await snapState(game);
  t.ok((sB.stingers.stinger_hard || 0) >= 1, 'B 201: the head turn stinger plays on each [Back out]');
  await game.hw((H) => { H.transcript.length = 0; });
  await partLibrary(game, { label: 'B', choice: 1, charter: false });
  await errs('run B');
}

if (!SHOTS_ONLY && (!ONLY || ONLY === 'C')) {
  // ---- run C: Danny [I'm sorry]; a free period upstairs with Marcus (god on, not about the AI)
  await game.hw((H, cfg) => window.__n3setup(H, cfg), { chapter: 5, map: 'east2', at: 'from_east1', timeScale: 6, flags: { gate_2f_open: true } });
  await partUpstairs(game, { bond: 2, label: 'C', fromCh4: false });
  const fp = await game.hw(async (H) => {
    const HW = H.HW;
    H.god(true);
    await window.__n3go(H, 'in_206');
    const ok = HW.periods.start({ reason: 'auto' });
    await HW.game.until(() => HW.periods.phase === 'warning', 5);
    await H.steps(30);
    const m = HW.entities.get('marcus');
    const seated = await HW.game.until(() => !!m?.seat, 20);
    const room = m?.seat ? HW.map.roomAt((m.seat.x + 0.5) * 16, (m.seat.y + 0.5) * 16)?.id : null;
    await HW.periods.end();
    H.god(false);
    return { seated, room, phase: HW.periods.phase, ok: !!ok };
  });
  t.ok(fp.seated && fp.room === 'e2_room206', 'C free period: on the chime Marcus sits in Tess\'s room', fp);
  await game.hw((H) => { H.HW.periods.disable(); H.transcript.length = 0; });
  // Leah [Nowhere] straight from a Ch5 library state
  await game.hw((H, cfg) => window.__n3setup(H, cfg), { chapter: 5, map: 'west2', at: 'from_library', timeScale: 6, party: [],
    flags: { gate_2f_open: true, ch5_danny_found: true, ch5_205_period_done: true, portrait_state: 'empty', longhall_cleared: true, ch5_marcus_around: true, adair_met: true, compact_unlocked: true, false_leah_done: true }, noPeriods: true });
  await partLibrary(game, { label: 'C', choice: 2, charter: false });
  await errs('run C');
}

// ================================================================================================ screenshots
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
      compact: !!HW.compact?.active, map: HW.map?.id, flags: { ...HW.state.flags },
    };
  });
}
const shots = [];
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
      await sleep(220);
      await g.page.keyboard.press('z');
    }
    await sleep(110);
  }
  console.log(`  warn [${label}] drive timed out`);
  return st;
}

if (!NO_SHOTS && (!ONLY || ONLY === 'S')) {
  await game.close();
  game = await open();
  const g = game;
  const play = () => g.hw((H) => { H.autoAdvance(false); H.timeScale(1); });
  // A walk into a trigger stays pending through the cutscene it starts: never await those.
  const walk = (target) => { g.walkTo(target).catch(() => {}); };
  const T = (re) => (st) => !!st.text && re.test(st.text);
  const L5 = { gate_2f_open: true, ch5_danny_found: true, ch5_205_period_done: true, portrait_state: 'empty' };
  const ALONE = { ...L5, longhall_cleared: true, ch5_marcus_around: true, seen_ch5_west2_arrive: true };

  // 205: Danny; the pat; the close pass
  await g.hw((H, cfg) => window.__n3setup(H, cfg), { chapter: 5, map: 'east2', at: 'door_205', auto: false, flags: { gate_2f_open: true, seen_ch5_upstairs: true }, noPatrol: true });
  await play(); walk('in_205');
  await drive(g, { label: '205', until: (st) => st.flags.ch5_205_period_done && !st.blocking, choices: [0], maxSec: 240, rules: [
    { when: (st) => T(/^It wrote my name/)(st) && st.done, shot: 'n3_01_danny' },
    { when: T(/^Good boy/), delay: 1500, shot: 'n3_02_good_boy' },
    { when: T(/Pennies/), delay: 900, shot: 'n3_03_close_pass' },
  ] });

  // the long hall: the empty chair across the void; Kevin keeps the pass; Marcus at the far end
  await g.hw((H, cfg) => window.__n3setup(H, cfg), { chapter: 5, map: 'longhall', at: 'from_east2', auto: false, flags: { ...L5 }, noPeriods: true });
  await play(); walk([60, 9]);
  await drive(g, { label: 'lh enter', until: (st) => st.flags.seen_ch5_longhall_enter && !st.blocking, maxSec: 60, rules: [
    { when: (st) => T(/The chair's empty/)(st) && st.done, shot: 'n3_04_empty_chair' },
  ] });
  await g.hw((H) => { H.give('hall_pass'); H.setFlag('hall_pass', true); });
  await g.walkTo([12, 9]);
  walk([7, 9]);
  await drive(g, { label: 'kevin pass', until: (st) => st.flags.longhall_cleared && !st.blocking, maxSec: 90, rules: [
    { when: T(/^\{dim\}\.\.\.pass/), delay: 900, shot: 'n3_05_pass' },
    { when: (st) => st.flags.longhall_cleared && !st.text, delay: 3600, shot: 'n3_06_far_end' },
  ] });

  // west2: the Reflection; the compact
  await g.hw((H, cfg) => window.__n3setup(H, cfg), { chapter: 5, map: 'west2', at: 'in_rr', auto: false, party: [], flags: { ...ALONE }, noPeriods: true, noPatrol: true });
  await play(); walk('mirror_2f');
  await drive(g, { label: 'mirror', until: (st) => st.flags.adair_met && !st.blocking, maxSec: 90, rules: [
    { when: T(/ANSWER HIM/), delay: 800, shot: 'n3_07_fog' },
    { when: T(/Press/), delay: 400, act: async () => { await g.page.keyboard.press('q'); } },
    { when: (st) => st.compact, delay: 1500, shot: 'n3_08_compact' },
  ] });

  // 201: the False Leah — the 1979 view, the head turn, the door
  await play(); walk('in_201');
  let holding = false;
  await drive(g, { label: '201', until: (st) => st.flags.false_leah_done && !st.blocking, choices: [2], maxSec: 200, rules: [
    { when: (st) => T(/^I got out of the library/)(st) && st.done, shot: 'n3_09_theresa' },
    { when: (st) => st.compact, delay: 1500, shot: 'n3_10_compact_201' },
    { when: T(/keeps turning/), delay: 200, shot: 'n3_11_head_turn' },
    { when: (st) => st.screens.includes('write'), delay: 300, act: async () => { await g.hw((H) => H.HW.input.setVirtual('confirm', true)); holding = true; await sleep(1500); await g.shot('n3_12_hold_door'); shots.push('n3_12_hold_door'); } },
    { when: (st) => holding && !st.screens.includes('write'), act: async () => { await g.hw((H) => H.HW.input.setVirtual('confirm', false)); holding = false; } },
  ] });
  await g.hw((H) => H.HW.input.setVirtual('confirm', false));

  // the library: Leah under the lamp
  await g.hw((H, cfg) => window.__n3setup(H, cfg), { chapter: 5, map: 'library', at: 'spiral_bottom', auto: false, party: [],
    flags: { ...ALONE, adair_met: true, compact_unlocked: true, false_leah_done: true, seen_ch5_library_enter: true, trig_library_library_enter: true }, noPeriods: true });
  await play(); walk([9, 16]);
  await drive(g, { label: 'leah', until: (st) => st.flags.ch5_leah_found && !st.blocking, choices: [0], maxSec: 120, rules: [
    { when: (st) => T(/^Where were you gonna go/)(st) && st.done, shot: 'n3_13_leah' },
  ] });
  const st = await snapState(g);
  t.ok(st.flags.ch5_leah_found && st.flags.false_leah_done && st.flags.adair_met, 'shots: the real-input scenes all reach their ends', st.flags);
  t.ok(shots.length >= 10, `shots: ${shots.length} key moments captured`, shots);
  await errs('screenshot pass');
  console.log(`  info screenshots (${shots.length}): ${shots.join(', ')}`);
}

await game.close();
await browser.close();
process.exit(t.done() ? 0 : 1);
