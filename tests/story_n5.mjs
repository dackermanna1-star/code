// Story test — narrative-5: Chapter VIII (The Register) and every ending.
//
// Plays the chapter like a player: real walks (H.walkTo — collisions, exits, triggers), interactions
// (H.interact), the systems' escape chase and breaker lamps, dialogue auto-advancing, choices from
// __HW.choiceQueue and the Register driven through sys.register with __HW.screenAnswer('register',
// { actions }) (API_NOTES "Test hook"). God mode only where the AI is not what's being tested (the escape
// runs); run J catches Tess for real.
//   run A  Ch7's trapdoor → the whole of Ch8 → DISMISSED (R0, three bonds, the Charter; form unused):
//          the last roll, the descent, the vault, the pen gate, Adair, the breaker, the climb, the office,
//          the Register, the walk down, the stage edge, the lobby, dawn, end.dismissed (+ "Monday.")
//   run B  DISMISSED with the form (R1, Danny + Leah bonded, Marcus in ink): no "Monday."
//   run C  WITHDRAWN, nobody saved (R0, no bonds): the scream, the escape, "Class is starting" ×3,
//          the keepsakes (Danny's light dies; Marcus's photo; Leah's camcorder in the wagon), 3 lost cards
//   run D  WITHDRAWN, 1 saved (form on Leah): the confession trimmed to Leah
//   run E  WITHDRAWN, 2 saved (R2, form on Tess, stamps Danny + Leah): Danny + Leah's confession
//   run F  WITHDRAWN, 3 saved (stamps, no Charter): the full confession, no keepsake beats
//   run G  PRESENT with the escape (R2, form on Marcus): cannot catch; the vestibule; end.present + coda
//   run H  PRESENT direct (R1, nobody freed): the bell once, "Thank you, Theresa."
//   run I  TRUANT (the coal chute, Ch6): the wagon at dawn, the cards, the 102 chalkboard
//   run J  gates & reloads: the trapdoor up, the closed book, a reload at 'register closed', a catch in
//          the escape → 'chase' referral → the escape checkpoint, the aud reload, register_voice, the last
//          roll's unbonded / mixed answers vs. the Register's pencil and ink
// Then a screenshot pass WITHOUT autoAdvance (real key presses, pausing on dialogue boxes and staged frames).
// Usage: node tests/story_n5.mjs [--no-shots] [--shots-only] [--only=A|B|…|J]
import { launch, openGame, suite } from './lib.mjs';

const t = suite('story_n5');
const NO_SHOTS = process.argv.includes('--no-shots');
const SHOTS_ONLY = process.argv.includes('--shots-only');
const ONLY = (process.argv.find((a) => a.startsWith('--only=')) || '').slice(7);
const run = (k) => !SHOTS_ONLY && (!ONLY || ONLY.split(',').includes(k));
const sleep = (ms) => new Promise((r) => setTimeout(r, ms));

// ------------------------------------------------------------------------------------------ page helpers
/**
 * Fresh game at a stage of Chapter VIII (runs in the page). stage: 'chute' (Ch6, the basement chute) ·
 * 'aud' (Ch7, the trap room, trapdoor open, the Assembly running) · 'vault' (Ch8 start, under the stage) ·
 * 'breaker' (the breaker floor, pen in hand) · 'office' (at the Register, all 17 lamps lit).
 * cfg: bonds { danny, leah, marcus }, roll (0..3 answers), charter, god, timeScale, auto, flags, take [items].
 */
async function setup(H, cfg) {
  const HW = H.HW;
  H.autoAdvance(true);
  H.timeScale(cfg.timeScale || 6);
  H.god(cfg.god !== false);
  await H.newGame({ skipIntro: true });
  H.autoAdvance(true);
  const F = {
    pro_doors_cut: true, ch1_danny_vanished: true, ch1_102_rows: true, ch1_front_loop: true, ch1_rooms_entered: 3,
    ch2_bell1: true, ch2_leah_taken: true, ch2_vhs_seen: true, ch2_marcus_told: true, colonel_named: true, east_doors_open: true,
    ch3_jan_key: true, ch3_keyring: true, ch3_period_done: true, coalbin_empty: true,
    office_open: true, ch4_pa_used: true, roll1_done: true, ch4_hide_done: true, gate_2f_open: true, ch5_danny_found: true,
    ch5_205_period_done: true, longhall_cleared: true, false_leah_done: true, adair_met: true, compact_unlocked: true,
    ch5_leah_found: true, library_door_open: true, adair_named: true,
    safe_seen_past: true, safe_open: true, ch6_breather_done: true, gym_open: true, ch6_gym_lights: true, seen_ch6_gym: true,
    roll2_done: true, ch6_marcus_taken: true, ch6_showers: true, truant_available: true, ch6_homeroom_said: true, ch6_kevin: true,
  };
  const S = ['chute', 'aud', 'vault', 'breaker', 'office'];
  const at = S.indexOf(cfg.stage);
  if (at >= 1) {
    Object.assign(F, { ch7_started: true, ch7_assembly: true, aud_chain_cut: true, roll3_done: true, diary_page: true,
      trapdoor_open: true, stage_door_open: true, seen_ch7_aud_enter: true, trig_aud_aud_enter: true, trig_lobby_ch7_start_w: true });
  }
  if (at >= 2) F.ch8_spiral = true;
  if (at >= 3) Object.assign(F, { ch8_last_roll: true, seen_ch8_start: true, seen_ch8_last_roll: true, seen_ch8_vault: true, adair_note: true });
  if (at >= 4) Object.assign(F, { seen_ch8_breaker: true, breaker_lamps: 17, trig_breaker_breaker_enter: true, trig_breaker_office_enter: true, seen_ch8_office: true });
  const B = cfg.bonds || {};
  for (const id of ['danny', 'leah', 'marcus']) if (B[id]) F[`bond_${id}`] = true;
  const R = cfg.roll || 0;
  if (R >= 1) F.roll1_answered = true;
  if (R >= 2) F.roll2_answered = true;
  if (R >= 3) F.roll3_answered = true;
  if (cfg.charter) Object.assign(F, { charter: true, case_key: true, saw_catalog_past: true });
  for (const [k, v] of Object.entries({ ...F, ...(cfg.flags || {}) })) H.setFlag(k, v);
  HW.state.chapter = at === 0 ? 6 : at === 1 ? 7 : 8;
  HW.state.party = [];
  const items = ['danny_flashlight', 'bolt_cutters', 'camcorder', 'keyring', 'withdrawn_stamp', 'aud_key', 'denise_photo'];
  if (cfg.charter) items.push('charter');
  if (at >= 3) items.push('red_pen');
  for (const it of items) if (!HW.state.inv[it]) H.give(it);
  for (const it of cfg.take || []) delete HW.state.inv[it];
  if (at >= 3) HW.state.mapState.vault = { ...(HW.state.mapState.vault || {}), v_adair_husk: { state: 'nopen' } };
  const where = { chute: ['basement', 'coal_chute'], aud: ['aud', [37, 10]], vault: ['vault', 'from_aud'], breaker: ['breaker', 'from_vault'], office: ['breaker', 'register'] }[cfg.stage];
  await H.teleport(where[0], where[1]);
  HW.entities.syncParty();
  H.refresh();
  if (at === 1) HW.assembly.start();
  await H.idle();
  H.transcript.length = 0;
  H.errors.length = 0;
  H.choiceQueue = [];
  // sfx tap: ids + the opts that matter (the whistle's rate, the dismissal bell's length) and the stingers.
  if (!HW.audio.__n5tap) {
    const orig = HW.audio.sfx.bind(HW.audio);
    HW.audio.__n5tap = { log: [] };
    HW.audio.sfx = (id, o) => { HW.audio.__n5tap.log.push({ id, rate: o?.rate, dur: o?.dur }); return orig(id, o); };
  }
  HW.audio.__n5tap.log = [];
  H.screenAnswer('credits', null);       // the engine rolls the credits after end.<id>: resolve at once
  // …and then goes to the title, whose auto-answer starts a new game: hold at the title instead, so the
  // ending's state can still be read.
  if (!HW.game.__n5title) {
    const toTitle = HW.game.toTitle.bind(HW.game);
    HW.game.__n5title = toTitle;
    HW.game.toTitle = function () {
      if (!window.__n5hold) return toTitle();
      HW.scripts.abortAll();
      this.setMode('title');
      return Promise.resolve();
    };
  }
  window.__n5hold = true;
  H.autoAdvance(cfg.auto !== false);
  return HW.state.chapter;
}

/** In-page routines shared by the runs (installed as window.__n5). */
function install() {
  const until = (H, p, s = 60) => H.HW.game.until(p, s);
  const settle = async (H, s = 60) => { await until(H, () => !H.HW.scripts.blocking && !H.HW.game.transferring, s); await H.idle(); };
  window.__n5 = {
    until, settle,
    /** At the Register (office stage): close the book with these actions; returns what after_register left. */
    async register(H, actions) {
      const HW = H.HW;
      H.screenAnswer('register', { actions });
      H.face('up');
      await H.interact();
      await until(H, () => !!HW.state.flags.register_done && !HW.scripts.blocking, 60);
      await H.steps(4);
      return { ending: HW.state.flags.ending, f: { ...HW.state.flags }, chase: [HW.chase.active, HW.chase.kind, HW.colonel.mode, HW.colonel.cannotCatch], obj: HW.state.objective, cp: HW.state.checkpoint };
    },
    /** The escape (WITHDRAWN / PRESENT): breaker → vault → spiral → aud → lobby. Returns per-map notes. */
    async escape(H, { toExterior = true } = {}) {
      const HW = H.HW;
      const log = {};
      log.b = await H.walkTo([1, 39], { run: true, timeout: 200 });
      await until(H, () => HW.map?.id === 'vault' && !HW.game.transferring, 20); await H.steps(4);
      log.v = [HW.map.id, HW.chase.active, HW.state.checkpoint];
      log.v1 = await H.walkTo([3, 10], { run: true, timeout: 200 });
      await until(H, () => !HW.game.transferring, 20); await H.steps(4);
      log.v2 = await H.walkTo([32, 2], { run: true, timeout: 200 });
      await until(H, () => HW.map?.id === 'aud' && !HW.game.transferring, 20); await H.steps(3);
      await until(H, () => !!HW.state.flags.seen_ch8_escape_aud && !HW.scripts.blocking, 60);
      await settle(H);
      log.aud = {
        party: HW.state.party.slice(), cp: HW.state.checkpoint,
        npcs: ['danny', 'leah', 'marcus'].map((id) => { const e = HW.entities.get(id); return e ? `${id}:${e.spriteId}:${e.seat?.id || '-'}:${e.etype}` : `${id}:none`; }),
        assembly: [HW.assembly.active, !!HW.state.flags.assembly_on],
      };
      log.a = await H.walkTo([16, 40], { run: true, timeout: 200 });
      await until(H, () => HW.map?.id === 'lobby' && !HW.game.transferring, 20); await H.steps(6); await settle(H);
      log.lobby = { doors: H.prop('lobby_front_doors')?.state, party: HW.state.party.slice(), chase: HW.chase.active };
      if (toExterior) {
        log.l = await H.walkTo([14, 26], { run: true, timeout: 120 });
        await until(H, () => H.transcript.some((x) => x.type === 'credits'), 240);
      } else {
        H.walkTo([15, 23], { run: true, timeout: 60 });
        await until(H, () => H.transcript.some((x) => x.type === 'credits'), 240);
      }
      log.end = { mode: HW.game.mode, ending: HW.state.flags.ending };
      return log;
    },
    /** DISMISSED, from the Register down and out. */
    async dismissedWalk(H) {
      const HW = H.HW;
      const log = {};
      log.down = await H.walkTo([2, 39], { timeout: 200 });
      await H.steps(30);
      log.lamps = [Number(HW.state.flags.breaker_lamps) || 0, !!HW.state.flags.breaker_out];
      log.exit = await H.walkTo([1, 39]);
      await until(H, () => HW.map?.id === 'aud' && !!HW.state.flags.ch8_stage_done && !HW.scripts.blocking, 180); await settle(H);
      log.aud = {
        party: HW.state.party.slice(), obj: HW.state.objective, husks: !!HW.state.flags.husks_gone, portrait: HW.state.flags.portrait_state,
        uniform: HW.entities.get('colonel_edge')?.animName || null, colonel: HW.colonel.mode, adair: !!HW.state.mapState?.vault?.v_adair_husk?.taken,
        keep: ['danny_flashlight', 'camcorder', 'denise_photo'].map((i) => HW.state.inv[i] || 0), dannyLight: !!HW.state.entityLights?.danny,
        denise: HW.map.prop('aud_seat_denise')?.present ?? null,
      };
      log.foyer = await H.walkTo([16, 40], { timeout: 200 });
      await until(H, () => HW.map?.id === 'lobby' && !!HW.state.flags.ch8_lobby_done && !HW.scripts.blocking, 180); await settle(H);
      log.lobby = { doors: H.prop('lobby_front_doors')?.state, inner: H.prop('lobby_inner_doors')?.state, bell: !!HW.state.flags.ch8_bell_done,
        obj: HW.state.objective, kevin: HW.patrol.dismissed, kevinGone: !HW.entities.get('kevin'), portrait: H.prop('lobby_portrait_uniform')?.present ?? null };
      log.out = await H.walkTo([14, 26]);
      await until(H, () => H.transcript.some((x) => x.type === 'credits'), 300);
      log.end = { mode: HW.game.mode, ending: HW.state.flags.ending, seen: !!HW.state.flags.ending_seen_dismissed };
      return log;
    },
  };
}

const TR = (H) => H.transcript.map((x) => ({ type: x.type, who: x.who, expr: x.expr, text: x.text, map: x.map }));
const said = (tr, who, re) => tr.some((x) => (x.type === 'say' || x.type === 'think') && x.who === who && re.test(x.text));
const narrated = (tr, re) => tr.some((x) => x.type === 'narrate' && re.test(x.text));
const card = (tr, re) => tr.some((x) => x.type === 'card' && re.test(x.text));
const cp = (tr, label) => tr.some((x) => x.type === 'checkpoint' && x.text === label);
const objective = (tr, text) => tr.some((x) => x.type === 'objective' && x.text === text);
const count = (tr, pred) => tr.filter(pred).length;
const lines = (tr) => tr.filter((x) => x.type === 'say' || x.type === 'think');
/** Slice of the transcript between the first match of a and the first match of b (exclusive). */
function between(tr, a, b) {
  const i = a ? tr.findIndex(a) : 0;
  const j = b ? tr.findIndex((x, k) => k > i && b(x)) : -1;
  return tr.slice(Math.max(0, i), j < 0 ? undefined : j);
}
const isEnding = (x) => x.type === 'ending';
const isCredits = (x) => x.type === 'credits';
const CONFESSION = {
  tell: /^You gonna tell them, or am I\?$/,
  moving: /^I'm moving\. To Philly\. \{p\} After Christmas\.$/,
  santa: /^\.\.\.Philly\. \{p\} Dolan\. They booed \*Santa\*\.$/,
  long: /^Took you long enough\.$/,
  knew: /^Wait\. \*You\* knew\?$/,
  august: /^Since August\.$/,
  AUGUST: /^Since AUGUST\?$/,
  call: /^You'll call\.$/,
  icall: /^I'll call\.$/,
  sideB: /^Side B's better\. \{p\} For the record\.$/,
};
const FATE = {
  danny: { saved: /^Danny Kovach enlisted in 1998\. — His postcards say one thing: STILL NOT STUCK\.$/, lost: /^Daniel Kovach was listed as a runaway\. — His uncle Frank still says he went looking for the sword\.$/ },
  leah: { saved: /^STATIC #9: HOLLOW HELL, A CORRECTION\. — Circulation: four\.$/, lost: /^The last issue of STATIC was never printed\.$/ },
  marcus: { saved: /^That Thanksgiving, — Ivy Webb set the table for two\.$/, lost: /^That Thanksgiving, — Ivy Webb set two extra plates\.$/ },
};

// ------------------------------------------------------------------------------------------ runs
const browser = await launch();
const open = async () => {
  const g = await openGame(browser);
  await g.page.addScriptTag({ content: `window.__n5setup = ${setup.toString()}; (${install.toString()})();` });
  return g;
};
let game = await open();
const S = (cfg) => game.hw((H, c) => window.__n5setup(H, c), cfg);
const tap = () => game.hw((H) => H.HW.audio.__n5tap.log.slice());
const errs = async (label) => {
  const e = await game.errors();
  t.ok(e.length === 0, `${label}: zero captured errors`, e.slice(0, 5));
};
const budget = {};

/** Shared epilogue assertions. */
function epilogueChecks(L, tr, { ending, who = [], keepsakes = [], fates = null, coda = false, kaylee = false }) {
  const ep = between(tr, isEnding, isCredits);
  t.ok(card(ep, /^EPILOGUE$/), `${L}: the EPILOGUE card`);
  const stamp = { dismissed: /^DISMISSED — ALL PUPILS — OCT\. 19, 1996$/, withdrawn: /^WITHDRAWN — DOLAN, THERESA — OCT\. 19, 1996$/, present: /^PRESENT — DOLAN, THERESA — OCT\. 19, 1996$/, truant: /^TRUANT — DOLAN, THERESA — OCT\. 19, 1996$/ }[ending];
  t.ok(card(ep, stamp), `${L}: the ${ending.toUpperCase()} stamp card`);
  if (fates) {
    for (const [id, fate] of fates) t.ok(card(ep, FATE[id][fate]), `${L}: ${id} ${fate} card (verbatim)`);
    const other = (id, fate) => FATE[id][fate === 'saved' ? 'lost' : 'saved'];
    t.ok(!fates.some(([id, fate]) => card(ep, other(id, fate))), `${L}: no contradicting fate card`);
  }
  if (coda) {
    t.ok(card(ep, /^October 19, 2013\.$/) && ep.some((x) => x.type === 'cg' && x.text === 'coda_2013'), `${L}: the 2013 coda (card + CG coda_2013)`);
    t.ok(ep.some((x) => x.type === 'say' && x.who === 'voice' && x.text === "Okay, we're live. {p} This is Kaylee, and this is Hollow Hell."), `${L}: "Okay, we're live. This is Kaylee, and this is Hollow Hell."`);
    t.eq(ep.some((x) => x.type === 'say' && x.text === 'Kaylee Ann Brooks?'), kaylee, `${L}: "Kaylee Ann Brooks?" ${kaylee ? 'in' : 'not in'} the coda`);
  }
  t.ok(tr.some(isCredits), `${L}: end.credits hands over to the credits`);
  const n = lines(ep).length;
  budget[`${L} epilogue`] = n;
  return ep;
}

// ---- run A: Ch7's trapdoor → the whole of Chapter VIII → DISMISSED (form unused) ------------------------
if (run('A')) {
  await S({ stage: 'aud', bonds: { danny: true, leah: true, marcus: true }, roll: 0, charter: true });
  const r = await game.hw(async (H) => {
    const HW = H.HW;
    const N = window.__n5;
    const log = {};
    const m = (k, v) => { log[k] = v; };
    m('assembly0', [HW.assembly.active, !!HW.state.flags.assembly_on]);
    // The point of no return (ch7.trapdoor) → the card → ch8.start.
    H.choiceQueue = [0];
    await H.walkTo([37, 8]);
    await N.until(H, () => HW.map?.id === 'vault' && HW.state.chapter === 8 && !HW.scripts.blocking, 60); await N.settle(H);
    m('start', { ch: HW.state.chapter, map: HW.map.id, obj: HW.state.objective, assembly: [HW.assembly.active, !!HW.state.flags.assembly_on, HW.colonel.mode], cp: HW.state.checkpoint });
    // Under the lectern: the last roll.
    await H.walkTo([16, 5]);
    await N.settle(H);
    m('roll', { obj: HW.state.objective, boards: HW.lighting.groupOn('floorboards'), done: !!HW.state.flags.ch8_last_roll });
    // The model the Register will build now (pencil = bonded, ink = said present).
    m('model', HW.endings.buildRegisterModel(HW.state).lines.map((l) => `${l.id}:${l.ink}`));
    // The iron spiral down; the descent; the vault.
    await H.walkTo([4, 6]);
    await N.until(H, () => !HW.game.transferring, 20); await H.steps(4);
    m('spiral', H.player());
    await H.walkTo([14, 30], { timeout: 200 });
    await N.settle(H);
    m('vault', { cp: HW.state.checkpoint, obj: HW.state.objective });
    // The way down without the pen: refused.
    await H.walkTo([32, 33]);
    await H.press('down', 500);
    await N.settle(H);
    m('gate', { map: HW.map.id, p: H.player() });
    // The tomb, then Adair.
    await H.walkTo('sarcophagus'); H.face('up'); await H.interact(); await N.settle(H);
    await H.walkTo('adair'); H.face('up'); await H.interact(); await N.settle(H);
    m('adair', { pen: HW.state.inv.red_pen || 0, note: !!HW.state.flags.adair_note, doc: !!HW.state.docs.adair_note, husk: H.prop('v_adair_husk')?.state, obj: HW.state.objective });
    // Down to the breaker.
    await H.walkTo([32, 34]);
    await N.until(H, () => HW.map?.id === 'breaker' && !HW.game.transferring, 20); await H.steps(4);
    await H.walkTo([7, 39]);
    await N.settle(H);
    m('breaker', { lit: HW.breaker.lit, obj: HW.state.objective });
    // The climb: the lamps light ahead of her, deck by deck.
    await H.walkTo([29, 12], { timeout: 240 });
    await N.until(H, () => HW.breaker.lit >= 17, 20);
    m('climb', HW.breaker.lit);
    await H.walkTo([29, 8]);
    await N.settle(H);
    m('office', { cp: HW.state.checkpoint, obj: HW.state.objective, ledger: !!HW.state.docs.ledger_colonel });
    await H.walkTo('register');
    m('reg', await N.register(H, [['stamp', 'danny'], ['stamp', 'leah'], ['stamp', 'marcus'], ['pen', 'founder', { grounds: 'R2', written: true }]]));
    m('walk', await N.dismissedWalk(H));
    return log;
  });
  const tr = await game.hw(TR);
  const sfx = await tap();
  const L = 'A';
  t.eq(r.assembly0, [true, true], `${L}: (Ch7) the Assembly is running when she goes down`);
  t.ok(card(tr, /^VIII — The Register$/), `${L}: ch7.trapdoor → card "VIII — The Register"`);
  t.ok(r.start.ch === 8 && r.start.map === 'vault' && r.start.obj === 'Under the stage. Go down.', `${L}.start: Chapter VIII under the stage; objective "Under the stage. Go down."`, r.start);
  t.ok(!r.start.assembly[0] && !r.start.assembly[1] && r.start.assembly[2] !== 'assembly', `${L}.start: the Assembly stops being a system (flag assembly_on cleared)`, r.start.assembly);
  // the last roll
  t.ok(narrated(tr, /^\{dim\}"\.\.\.Patricia Szalay\." "Michelle Yancey\."\{\/dim\}/) && narrated(tr, /Nineteen ninety-six\.$/), `${L}.last_roll: the roll through the boards reaches 1996`);
  for (const n of ['Daniel Kovach', 'Leah Brandt', 'Marcus Webb']) t.ok(narrated(tr, new RegExp(`^\\{dim\\}"${n}\\?"\\{/dim\\}$`)), `${L}.last_roll: "${n}?" (full legal name)`);
  t.ok(said(tr, 'danny', /^\.\.\.Dolan said she's coming back\.$/) && said(tr, 'tess', /^I am\.$/), `${L}.last_roll: Danny (bonded) — "...Dolan said she's coming back." · Tess: "I am."`);
  t.ok(said(tr, 'leah', /^\.\.\.She said Philly\. \{p\} She actually said it\.$/), `${L}.last_roll: Leah (bonded) — "...She said Philly. She actually said it."`);
  t.ok(said(tr, 'marcus', /^I'm just visiting\.$/), `${L}.last_roll: Marcus (bonded) — "I'm just visiting."`);
  t.ok(!tr.some((x) => x.type === 'say' && x.text === '...present.'), `${L}.last_roll: nobody bonded says present`);
  t.ok(said(tr, 'tess', /^None of them said it\.$/), `${L}.last_roll: "None of them said it."`);
  t.eq(r.model, ['danny:pencil', 'leah:pencil', 'marcus:pencil'], `${L}.last_roll: the Register will read what she heard — three in pencil`);
  t.ok(r.roll.done && !r.roll.boards && r.roll.obj === 'Down. The iron stair.', `${L}.last_roll: the floorboard light goes out; objective "Down. The iron stair."`, r.roll);
  t.ok(r.spiral.map === 'vault' && r.spiral.ty >= 11, `${L}: down the iron spiral (stair_bottom)`, r.spiral);
  t.ok(said(tr, 'tess', /^Right over my head\. \{p\} All of them\.$/), `${L}.start: "Right over my head. All of them."`);
  t.ok(said(tr, 'tess', /^I can't hear them anymore\.$/), `${L}.spiral: at the foot of the spiral — "I can't hear them anymore."`);
  // the vault
  t.ok(narrated(tr, /^In the middle, a tomb\. \{p\} Split open\. From the inside\.$/) && said(tr, 'tess', /^Miss Adair\.$/), `${L}.vault: the tomb split from inside; "Miss Adair."`);
  t.ok(cp(tr, 'vault') && r.vault.obj === 'Miss Adair. The desk.', `${L}.vault: checkpoint 'vault'; objective "Miss Adair. The desk."`, r.vault);
  t.ok(said(tr, 'tess', /^My light won't reach\. Not without— \{p\} no\. Her pen\.$/) && r.gate.map === 'vault', `${L}.no_light: no pen → "My light won't reach. Not without— no. Her pen." (stays in the vault)`, r.gate);
  t.ok(said(tr, 'tess', /^It's still warm\.$/), `${L}.sarcophagus: "It's still warm."`);
  t.ok(r.adair.pen === 1 && r.adair.note && r.adair.doc && r.adair.husk === 'nopen', `${L}.adair: red_pen, flag adair_note, doc adair_note, the husk without her pen`, r.adair);
  t.ok(said(tr, 'tess', /^Get them out first\. \{p\} Then him\.$/) && r.adair.obj === 'Down. The breaker.', `${L}.adair: "Get them out first. Then him."; objective "Down. The breaker."`);
  // the breaker
  const whistle = sfx.find((s) => s.id === 'school_bell' && s.rate === 0.25);
  t.ok(!!whistle && sfx.some((s) => s.id === 'steam_hiss'), `${L}.breaker: the bell from below at rate 0.25 + steam (the shift whistle)`);
  t.ok(tr.some((x) => x.type === 'cg' && x.text === 'breaker_reveal'), `${L}.breaker: CG breaker_reveal`);
  const frags = between(tr, (x) => x.type === 'cg' && x.text === 'breaker_reveal', (x) => x.type === 'objective' && x.text === 'The office. At the top.').filter((x) => x.type === 'think' || x.type === 'say');
  t.eq(frags.map((x) => x.text), ["The bells. {p} That's the whistle.", "Roll call's the payroll.", 'Hall pass. {p} Brass check.', '...It never stopped running.'], `${L}.breaker: the realization in four fragments, no more`);
  t.ok(r.breaker.lit >= 2 && r.breaker.obj === 'The office. At the top.', `${L}.breaker: the first lamps; objective "The office. At the top."`, r.breaker);
  t.eq(r.climb, 17, `${L}.climb: all seventeen cap-lamps lit by the top (HW.breaker thresholds)`);
  t.ok(r.office.ledger && said(tr, 'tess', /^He watched\.$/) && cp(tr, 'office') && r.office.obj === 'The book.', `${L}.office: the ledger; "He watched."; checkpoint 'office'; objective "The book."`, r.office);
  // the Register → DISMISSED
  t.ok(r.reg.ending === 'dismissed' && r.reg.f.expelled && r.reg.f.register_done && ['danny', 'leah', 'marcus'].every((id) => r.reg.f[`withdrawn_${id}`]), `${L}.register: three stamps + the pen → DISMISSED`, r.reg.ending);
  t.ok(cp(tr, 'register closed'), `${L}.register: checkpoint 'register closed' (immediately after Close the Book)`);
  t.ok(sfx.some((s) => s.id === 'school_bell' && s.dur === 9), `${L}.dismissal: the bell rings on and on (dur 9)`);
  t.ok(!r.reg.chase[0] && r.reg.obj === 'The auditorium.', `${L}.dismissal: no chase; objective "The auditorium."`, r.reg);
  const w = r.walk;
  t.ok(w.lamps[1], `${L}.dismissal: the lamps go out as she climbs down (breaker_out)`, w.lamps);
  t.ok(narrated(tr, /^Miss Adair's shell is coming apart\./) && w.aud.adair, `${L}.vault_after: Adair's shell lifts away (husk removed)`);
  t.ok(narrated(tr, /^He's sitting on the edge of the stage/), `${L}.stage_edge: the Colonel on the stage edge`);
  const cl = tr.filter((x) => x.type === 'say' && x.who === 'colonel');
  t.eq(cl.map((x) => `${x.expr}|${x.text}`), ['confused|Theresa. {p} ...The bell.', 'dissolving|I was to be the last to leave.'], `${L}.stage_edge: his bust — 'confused' then 'dissolving' (the bank's lines)`);
  t.ok(said(tr, 'tess', /^You are\.$/) && narrated(tr, /^He blinks\. \{p\} Both eyes, at the same time\.$/), `${L}.stage_edge: "You are."; his eyes blink in sync`);
  t.ok(w.aud.uniform === 'dissolve' && w.aud.portrait === 'uniform', `${L}.stage_edge: the dissolve holds on the empty uniform; portrait_state 'uniform'`, w.aud);
  t.ok(w.aud.husks && narrated(tr, /^She turns her head toward Marcus\./), `${L}.stage_edge: the house goes to motes; Denise turns to Marcus and is gone`, w.aud);
  t.ok(said(tr, 'tess', /^It's still on\.$/) && said(tr, 'danny', /^\.\.\.You broke it\.$/) && said(tr, 'tess', /^Still recording\.$/), `${L}.stage_edge: the keepsakes go back ("It's still on." / "...You broke it." / "Still recording.")`);
  t.ok(w.aud.keep.every((n) => n === 0) && w.aud.dannyLight, `${L}.stage_edge: flashlight, camcorder and photo returned; Danny's red light back on him`, w.aud);
  t.ok(w.aud.party.join() === 'danny,leah,marcus' && w.aud.obj === 'The front doors.', `${L}.stage_edge: the three of them with her; objective "The front doors."`, w.aud);
  t.ok(w.lobby.kevin && w.lobby.kevinGone && narrated(tr, /^The Safety Patrol boy lets the whistle drop/), `${L}.lobby: Kevin takes off the belt (HW.patrol.dismiss) and is gone`, w.lobby);
  t.ok(w.lobby.bell && w.lobby.doors === 'open' && w.lobby.inner === 'open', `${L}.lobby: the doors open by themselves on the bell's last ring`, w.lobby);
  t.ok(narrated(tr, /^\{dim\}GO HOME, TESS\{\/dim\}$/) && narrated(tr, /^In the trophy glass, over my shoulder: Miss Adair\. \{p\} She's smiling\.$/), `${L}.lobby: Adair smiles in the trophy glass and fogs GO HOME, TESS`);
  t.ok(sfx.some((s) => s.id === 'glass_write'), `${L}.lobby: glass_write for the fog`);
  t.ok(said(tr, 'tess', /^Okay\.$/) && w.lobby.obj === 'Home.' && w.lobby.portrait === true, `${L}.lobby: "Okay."; objective "Home."; the portrait shows the uniform`, w.lobby);
  t.ok(said(tr, 'tess', /^It's morning\. \{p\} How is it \*morning\*\?$/) && said(tr, 'leah', /^We got here at nine forty-seven\.$/), `${L}.dawn: "It's morning. How is it morning?" · Leah: "We got here at nine forty-seven."`);
  t.ok(w.end.ending === 'dismissed' && w.end.seen, `${L}: g.ending('dismissed') → end.dismissed → credits`, w.end);
  const ep = epilogueChecks(L, tr, { ending: 'dismissed' });
  t.ok(ep.some((x) => x.type === 'cg' && x.text === 'ending_dawn'), `${L}.end: CG ending_dawn`);
  for (const [k, re] of Object.entries(CONFESSION)) t.ok(ep.some((x) => x.type === 'say' && re.test(x.text)), `${L}.end: confession — ${k}`);
  t.ok(said(ep, 'leah', /^Side A\. \{p\} Track one\.$/), `${L}.end: "Side A. Track one."`);
  t.ok(said(ep, 'tess', /^Monday\.$/), `${L}.end: the form went unused → "Monday."`);
  t.ok(card(ep, /^In 1997, Hallowell Consolidated School was demolished\. — Nothing was found beneath it\.$/) && card(ep, /^In the spring of 2013, the cicadas came back\. — Nobody went missing\.$/), `${L}.end: the 1997 / 2013 card`);
  // budgets & ledgers
  const ch8 = between(tr, (x) => x.type === 'card' && /^VIII/.test(x.text), isEnding);
  budget['A ch8 (DISMISSED, +UI register lines)'] = lines(ch8).length;
  t.ok(count(sfx, (s) => s.id === 'stinger_hard') === 0, `${L}: no stinger_hard on the DISMISSED path`);
  t.ok(count(ch8, (x) => x.type === 'say' && (x.who === 'colonel' || (x.who === 'voice' && !/Kaylee|INTERCOM/.test(x.text)))) === 2, `${L}: the Colonel speaks twice in Ch8 here (both at the stage edge)`);
  t.ok(!ch8.some((x) => x.who === 'tess' && ['smirk', 'laugh', 'smile'].includes(x.expr)), `${L}: no quips from Tess before the epilogue`);
  await errs('run A');
}

// ---- run B: DISMISSED through the form (R1, Danny + Leah bonded, Marcus in ink) ------------------------
if (run('B')) {
  await S({ stage: 'office', bonds: { danny: true, leah: true }, roll: 1, charter: true });
  const r = await game.hw(async (H) => {
    const N = window.__n5;
    const model = H.HW.endings.buildRegisterModel(H.HW.state).lines.map((l) => `${l.id}:${l.ink}`);
    const reg = await N.register(H, [['stamp', 'danny'], ['stamp', 'leah'], ['stamp', 'tess'], ['form', 'marcus'], ['pen', 'founder', { grounds: 'R1', written: true }]]);
    // The book is shut: the Register only says so now.
    H.transcript.length = 0;
    H.face('up'); await H.interact(); await N.settle(H);
    const closed = H.transcript.filter((x) => x.type === 'think').map((x) => x.text);
    const walk = await N.dismissedWalk(H);
    return { model, reg, closed, walk };
  });
  const tr = await game.hw(TR);
  t.eq(r.model, ['danny:pencil', 'leah:pencil', 'marcus:ink', 'tess:pencil'], 'B: the page — Danny, Leah, Tess in pencil; Marcus in ink');
  t.ok(r.reg.ending === 'dismissed' && r.reg.f.form_used_on === 'marcus' && r.reg.f.form_used, 'B: the form on Marcus + three stamps + the pen (R1) → DISMISSED', r.reg.f.form_used_on);
  t.ok(r.closed.includes("It's closed. Whatever's written stays written."), 'B: the Register after Close — "It\'s closed…"', r.closed);
  t.ok(r.walk.end.ending === 'dismissed', 'B: the walk out → end.dismissed', r.walk.end);
  const ep = epilogueChecks('B', tr, { ending: 'dismissed' });
  t.ok(!said(ep, 'tess', /^Monday\.$/), 'B: the form was used → no "Monday." beat');
  t.ok(said(ep, 'leah', /^Side A\. \{p\} Track one\.$/), 'B: "Side A. Track one."');
  await errs('run B');
}

// ---- runs C–F: WITHDRAWN with 0 / 1 / 2 / 3 saved ------------------------------------------------------
async function withdrawn(L, cfg, actions, expect) {
  await S({ ...cfg, stage: 'office' });
  const r = await game.hw(async (H, a) => {
    const N = window.__n5;
    const reg = await N.register(H, a);
    const esc = await N.escape(H);
    return { reg, esc };
  }, actions);
  const tr = await game.hw(TR);
  const sfx = await tap();
  const free = expect.saved;
  t.ok(r.reg.ending === 'withdrawn' && r.reg.f.withdrawn_tess === (cfg.roll >= 1), `${L}: → WITHDRAWN (${free.length} saved)`, r.reg.ending);
  t.ok(tr.some((x) => x.type === 'cg' && x.text === 'colonel_face') && tr.some((x) => x.type === 'say' && x.who === 'voice' && x.text === 'WHO IS OUT OF THEIR SEAT.'), `${L}.escape: "WHO IS OUT OF THEIR SEAT." over his full face (CG colonel_face, no bust)`);
  t.eq(count(sfx, (s) => s.id === 'stinger_hard'), 1, `${L}.escape: stinger_hard #5, once`);
  t.ok(r.reg.chase[0] && r.reg.chase[1] === 'escape' && r.reg.chase[2] === 'escape' && !r.reg.chase[3], `${L}.escape: HW.chase.escape — he pursues (and can catch)`, r.reg.chase);
  t.ok(said(tr, 'tess', /^Run\.$/) && r.reg.obj === 'Out. The front doors.', `${L}.escape: "Run."; objective "Out. The front doors."`);
  for (const m of ['breaker', 'vault', 'aud', 'lobby']) t.ok(cp(tr, `escape_${m}`), `${L}.escape: checkpoint escape_${m}`);
  const lost = ['danny', 'leah', 'marcus'].filter((id) => !free.includes(id));
  t.eq(r.esc.aud.party, free, `${L}.aud: the freed wake and run with her (${free.join(', ') || 'nobody'})`);
  for (const id of lost) t.ok(r.esc.aud.npcs.includes(`${id}:${id}_e:aud_seat_${id}:npc`), `${L}.aud: ${id} stays seated, entranced`, r.esc.aud.npcs);
  const nick = { danny: 'Dolan', leah: 'T', marcus: 'Tess' };
  lost.forEach((id, i) => {
    t.ok(said(tr, id, new RegExp(`^Class is starting, ${nick[id]}\\.$`)), `${L}.aud: ${id} — "Class is starting, ${nick[id]}."`);
    const name = id[0].toUpperCase() + id.slice(1);
    t.ok(said(tr, 'tess', i < 2 ? new RegExp(`^${name}\\. \\{p\\} ${name}, get up\\.$`) : new RegExp(`^${name}—$`)), `${L}.aud: Tess — "${name}. ${name}, get up."${i >= 2 ? ' (cut short the third time)' : ''}`);
  });
  if (free.length) t.ok(said(tr, 'tess', /^Get up\. \{p\} We're going\.$/), `${L}.aud: "Get up. We're going."`);
  t.ok(!r.esc.aud.assembly[0] && !r.esc.aud.assembly[1], `${L}.aud: no Assembly restarts on the way out`, r.esc.aud.assembly);
  t.ok(r.esc.lobby.doors === 'open', `${L}.lobby: the front doors stand open on gray dawn`, r.esc.lobby);
  t.ok(tr.some((x) => x.type === 'chase' && x.text === 'end:escape:escaped'), `${L}: the escape ends on the exterior`);
  t.ok(said(tr, 'tess', /^It's morning\. \{p\} How is it \*morning\*\?$/), `${L}.dawn: "It's morning. How is it morning?"`);
  const fates = ['danny', 'leah', 'marcus'].map((id) => [id, free.includes(id) ? 'saved' : 'lost']);
  const ep = epilogueChecks(L, tr, { ending: 'withdrawn', fates, coda: true, kaylee: false });
  t.ok(ep.some((x) => x.type === 'cg' && x.text === 'ending_dawn'), `${L}.end: CG ending_dawn (who: tess + saved)`);
  if (expect.confession) for (const k of expect.confession) t.ok(ep.some((x) => x.type === 'say' && CONFESSION[k].test(x.text)), `${L}.end: confession — ${k}`);
  for (const k of expect.notConfession || []) t.ok(!ep.some((x) => x.type === 'say' && CONFESSION[k].test(x.text)), `${L}.end: confession trimmed — no ${k}`);
  if (!free.length) t.ok(!ep.some((x) => x.type === 'say' && x.who !== 'voice' && x.who !== 'tess'), `${L}.end: alone — no confession`);
  if (lost.includes('danny')) t.ok(narrated(ep, /^On the bottom step it flickers once, and goes out\.$/), `${L}.end: Danny's red flashlight finally dies on the steps`);
  else t.ok(!narrated(ep, /flickers once, and goes out/), `${L}.end: Danny saved — no flashlight beat`);
  if (lost.includes('marcus')) t.ok(said(ep, 'tess', /^I'll take it to his grandma\. \{p\} I'll tell her he came to meet her\.$/), `${L}.end: Marcus's photo — "I'll take it to his grandma."`);
  if (lost.includes('leah')) t.ok(narrated(ep, /^I put her camera on the passenger seat\. The red light's still on\. Still recording\.$/) && narrated(ep, /^I push in the tape\.$/), `${L}.end: Leah unfreed — the camcorder on the passenger seat; she pushes in the tape`);
  else t.ok(!narrated(ep, /I push in the tape/), `${L}.end: Leah saved — Leah drives`);
  t.ok(!said(ep, 'leah', /^Side A/), `${L}.end: "Side A. Track one." is the true ending's alone`);
  budget[`${L} ch8 (escape)`] = lines(between(tr, null, isEnding)).length;
  await errs(`run ${L}`);
}
if (run('C')) await withdrawn('C', { bonds: {}, roll: 0, charter: false }, [], { saved: [] });
if (run('D')) {
  await withdrawn('D', { bonds: {}, roll: 0, charter: false }, [['form', 'leah']], {
    saved: ['leah'], confession: ['moving', 'long', 'sideB'], notConfession: ['tell', 'santa', 'knew', 'call'],
  });
  const tr = await game.hw(TR);
  t.ok(said(tr, 'leah', /^You gonna say it, or am I\?$/), 'D.end: Leah alone — "You gonna say it, or am I?"');
}
if (run('E')) {
  await withdrawn('E', { bonds: { danny: true, leah: true }, roll: 2, charter: true }, [['form', 'tess'], ['stamp', 'danny'], ['stamp', 'leah']], {
    saved: ['danny', 'leah'], confession: ['moving', 'santa', 'long', 'knew', 'august', 'AUGUST', 'sideB'], notConfession: ['call', 'icall'],
  });
  const tr = await game.hw(TR);
  t.ok(said(tr, 'leah', /^You gonna tell him, or am I\?$/), 'E.end: Danny + Leah — "You gonna tell him, or am I?"');
}
if (run('F')) {
  await withdrawn('F', { bonds: { danny: true, leah: true, marcus: true }, roll: 0, charter: false }, [['stamp', 'danny'], ['stamp', 'leah'], ['stamp', 'marcus']], {
    saved: ['danny', 'leah', 'marcus'], confession: Object.keys(CONFESSION),
  });
}

// ---- run G: PRESENT with the escape (R2, form on Marcus) ----------------------------------------------
if (run('G')) {
  await S({ stage: 'office', bonds: { danny: true, leah: true }, roll: 2, charter: true });
  const r = await game.hw(async (H) => {
    const N = window.__n5;
    const reg = await N.register(H, [['stamp', 'danny'], ['stamp', 'leah'], ['form', 'marcus', { confirmed: true }]]);
    const esc = await N.escape(H, { toExterior: false });
    return { reg, esc, shut: H.HW.state.flags.ch8_doors_shut, doors: H.HW.state.mapState?.lobby?.lobby_front_doors?.state };
  });
  const tr = await game.hw(TR);
  const sfx = await tap();
  t.ok(r.reg.ending === 'present' && !r.reg.f.withdrawn_tess, 'G: Tess in ink, the form on Marcus → PRESENT (three freed)', r.reg.ending);
  t.ok(r.reg.chase[0] && r.reg.chase[1] === 'escape' && r.reg.chase[3] === true, 'G.escape_present: the chase plays but cannot catch', r.reg.chase);
  t.ok(said(tr, 'tess', /^Get them out\. \{p\} Go\.$/) && !tr.some((x) => /WHO IS OUT/.test(x.text || '')), 'G: "Get them out. Go." — no scream on this path');
  t.eq(count(sfx, (s) => s.id === 'stinger_hard'), 0, 'G: no stinger_hard');
  t.eq(r.esc.aud.party, ['danny', 'leah', 'marcus'], 'G.aud: all three wake and run with her');
  t.ok(tr.some((x) => x.type === 'trigger' && x.text === 'lobby:ch8_vestibule') && r.shut && r.doors === 'closed', 'G.vestibule: the trigger; the doors close behind her', { shut: r.shut, doors: r.doors });
  t.ok(said(tr, 'danny', /^Dolan\. \{p\} Come on\.$/), 'G.vestibule: the friends cross into the dawn — "Dolan. Come on."');
  t.ok(tr.some((x) => x.type === 'say' && x.who === 'voice' && x.text === 'Theresa.'), 'G.vestibule: the intercom — "Theresa."');
  t.eq(count(sfx, (s) => s.id === 'stinger_soft'), 1, 'G.vestibule: stinger_soft once');
  const ep = epilogueChecks('G', tr, { ending: 'present', fates: [['danny', 'saved'], ['leah', 'saved'], ['marcus', 'saved']], coda: true, kaylee: true });
  t.ok(ep.some((x) => x.type === 'cg' && x.text === 'ending_present') && said(ep, 'tess', /^Nobody gets left behind\.$/), 'G.end: CG ending_present; "Nobody gets left behind."');
  t.ok(narrated(ep, /denim jacket three sizes too big/), 'G.coda: a husk in an oversized denim jacket in Room 102');
  await errs('run G');
}

// ---- run H: PRESENT direct (R1, nobody freed) ----------------------------------------------------------
if (run('H')) {
  await S({ stage: 'office', bonds: {}, roll: 1, charter: false });
  const r = await game.hw(async (H) => {
    const N = window.__n5;
    const reg = await N.register(H, []);
    await N.until(H, () => H.transcript.some((x) => x.type === 'credits'), 120);
    return { reg };
  });
  const tr = await game.hw(TR);
  const sfx = await tap();
  t.ok(r.reg.ending === 'present', 'H: R1, nobody withdrawn → PRESENT', r.reg.ending);
  t.ok(sfx.some((s) => s.id === 'school_bell' && s.dur === 3.6), 'H: the dismissal bell rings once');
  t.ok(tr.some((x) => x.type === 'say' && x.who === 'voice' && x.text === 'Thank you, Theresa.'), 'H: "Thank you, Theresa." (voice, no bust)');
  t.ok(narrated(tr, /^My hand puts the pen down on the desk\./), 'H: her hand sets the pen down on its own');
  t.ok(!tr.some((x) => x.type === 'chase'), 'H: no escape');
  const ep = epilogueChecks('H', tr, { ending: 'present', fates: [], coda: true, kaylee: true });
  t.ok(!Object.values(FATE).some((f) => card(ep, f.saved) || card(ep, f.lost)), 'H.end: no friend cards (nobody freed)');
  await errs('run H');
}

// ---- run I: TRUANT -------------------------------------------------------------------------------------
if (run('I')) {
  await S({ stage: 'chute', bonds: { danny: true }, roll: 1, flags: { chute_cut: true } });
  const r = await game.hw(async (H) => {
    const N = window.__n5;
    H.choiceQueue = [0];
    H.face('up'); await H.interact();
    await N.until(H, () => H.transcript.some((x) => x.type === 'credits'), 180);
    const board = ['w1_chalk_102_tess_a', 'w1_chalk_102_tess_p'].map((id) => H.HW.state.mapState?.west1?.[id]?.params?.text || null);
    return { ending: H.HW.state.flags.ending, truant: !!H.HW.state.flags.truant, board, chute: H.HW.state.mapState?.exterior?.ext_coal_chute?.state };
  });
  const tr = await game.hw(TR);
  t.ok(r.ending === 'truant' && r.truant, 'I: [Climb out.] → g.ending("truant")', r);
  const ep = epilogueChecks('I', tr, { ending: 'truant' });
  t.ok(r.chute === 'open' && tr.some((x) => x.type === 'transfer' && /exterior:chute_exit/.test(x.text)), 'I.end: out of the coal hatch on the east lawn');
  t.ok(narrated(ep, /^The keys are in the visor, where she said\.$/) && narrated(ep, /^I don't start it\.$/), "I.end: Leah's wagon, keys in the visor; she doesn't drive");
  t.ok(card(ep, /^Theresa Dolan handed in her transfer form on Monday\.$/) && card(ep, /^The secretary asked if she wanted to say goodbye to anyone\. — She said no\.$/), 'I.end: the TRUANT card text (verbatim)');
  t.ok(ep.some((x) => x.type === 'cg' && x.text === 'ending_truant'), 'I.end: CG ending_truant');
  t.ok(r.board.includes('DOLAN, THERESA — ABSENT') && narrated(ep, /^ABSENCES WILL BE MADE UP$/), 'I.coda: the 102 chalkboard — DOLAN, THERESA — ABSENT · ABSENCES WILL BE MADE UP', r.board);
  t.ok(!card(ep, /^October 19, 2013/), 'I: no 2013 coda');
  await errs('run I');
}

// ---- run J: gates & reloads ----------------------------------------------------------------------------
if (run('J')) {
  // J1 the trapdoor back up is shut until the book is closed.
  await S({ stage: 'vault', bonds: { danny: true }, roll: 0 });
  const j1 = await game.hw(async (H) => {
    const N = window.__n5;
    await H.walkTo([32, 3]); await H.walkTo([32, 2]); await N.settle(H);
    return { map: H.HW.map.id, tr: H.transcript.filter((x) => x.type === 'narrate' || x.type === 'think').map((x) => x.text) };
  });
  t.ok(j1.map === 'vault' && j1.tr.some((x) => /Not yet\. Not without them\./.test(x)), 'J1: the steps back up to the trap room refuse until the book is closed', j1);
  // J2 the last roll: nobody bonded — three "...present." → ink; one unbonded → that one.
  const lr = async (bonds) => {
    await S({ stage: 'vault', bonds, roll: 0, flags: { ch8_last_roll: false, seen_ch8_last_roll: false } });
    return game.hw(async (H) => {
      await H.walkTo([16, 5]); await window.__n5.settle(H);
      return { tr: H.transcript.filter((x) => x.type === 'say' || x.type === 'think').map((x) => `${x.who}|${x.text}`),
        model: H.HW.endings.buildRegisterModel(H.HW.state).lines.map((l) => `${l.id}:${l.ink}`) };
    });
  };
  const none = await lr({});
  t.eq(none.tr.filter((x) => /\|\.\.\.present\.$/.test(x)), ['danny|...present.', 'leah|...present.', 'marcus|...present.'], 'J2: unbonded — Danny, Leah, Marcus each say "...present."');
  t.ok(none.tr.includes("tess|All three of them said present. {p=0.8} That's ink."), 'J2: "All three of them said present. That\'s ink."', none.tr);
  t.eq(none.model, ['danny:ink', 'leah:ink', 'marcus:ink'], 'J2: … and the Register has them in ink');
  const mixed = await lr({ danny: true, marcus: true });
  t.ok(mixed.tr.includes('leah|...present.') && mixed.tr.includes("tess|Leah said present. {p=0.8} That's ink.") && !mixed.tr.includes('danny|...present.'), 'J2: mixed — only Leah says present', mixed.tr);
  t.eq(mixed.model, ['danny:pencil', 'leah:ink', 'marcus:pencil'], 'J2: … the Register matches (Leah ink, the others pencil)');
  // J3 register_voice: the friend's real voice, far above.
  const j3 = await game.hw(async (H) => {
    await H.run('ch8.register_voice', { id: 'leah', tool: 'stamp', text: 'T?' });
    await H.run('ch8.register_voice', { id: 'tess', tool: 'stamp', text: null });
    return H.transcript.filter((x) => x.type === 'say').map((x) => `${x.who}|${x.text}`);
  });
  t.ok(j3.includes('leah|{dim}T?{/dim}') && j3.length >= 1 && !j3.some((x) => x.startsWith('tess|')), 'J3: ch8.register_voice — Leah, faint: "T?" (nothing for Tess\'s own line)', j3);
  // J4 a reload at 'register closed' (WITHDRAWN) resumes the consequence.
  await S({ stage: 'office', bonds: {}, roll: 0, charter: false });
  const j4 = await game.hw(async (H) => {
    const HW = H.HW;
    const model = HW.endings.buildRegisterModel(HW.state);
    model.commit(HW.state);
    HW.game.checkpoint('register closed');
    HW.game.loadSave('auto');
    await window.__n5.until(H, () => HW.chase.active && !HW.scripts.blocking, 30); await H.steps(4);
    return { ending: HW.state.flags.ending, chase: [HW.chase.active, HW.chase.kind, HW.colonel.mode], scream: H.transcript.some((x) => x.text === 'WHO IS OUT OF THEIR SEAT.') };
  });
  t.ok(j4.ending === 'withdrawn' && j4.chase[0] && j4.chase[1] === 'escape', "J4: a reload at 'register closed' picks the escape back up", j4);
  // J5 caught in the escape (god off) → the referral 'chase' → back at the escape checkpoint, still hunted.
  await S({ stage: 'office', bonds: {}, roll: 0, charter: false, god: false, timeScale: 3 });
  const j5 = await game.hw(async (H) => {
    const HW = H.HW;
    const N = window.__n5;
    await N.register(H, []);
    const cp0 = HW.state.checkpoint;
    await N.until(H, () => H.transcript.some((x) => x.type === 'gameover'), 30);
    const go = H.transcript.filter((x) => x.type === 'gameover').map((x) => x.text);
    await N.until(H, () => HW.game.mode === 'play' && HW.chase.active, 20); await H.steps(10);
    const after = { cp: HW.state.checkpoint, chase: [HW.chase.active, HW.chase.kind], map: HW.map.id, f: !!HW.state.flags.chase_escape };
    // she moves: he pours in behind her again
    H.god(true);
    await H.walkTo([29, 12], { run: true });
    await N.until(H, () => !!HW.colonel.entity, 10);
    return { cp0, go, after, back: [HW.colonel.mode, !!HW.colonel.entity] };
  });
  t.ok(j5.cp0 === 'escape_breaker' && j5.go.some((x) => /^chase/.test(x)), "J5: standing still after the scream — caught; the referral reads 'chase'", j5);
  t.ok(j5.after.cp === 'escape_breaker' && j5.after.chase[0] && j5.after.chase[1] === 'escape' && j5.after.f, 'J5: the retry reloads at escape_breaker with the escape re-armed', j5.after);
  t.ok(j5.back[0] === 'escape' && j5.back[1], 'J5: he pours in behind her again', j5.back);
  // J6 the aud reload mid-escape: the party comes back; the others are re-seated; no repeated lines.
  await S({ stage: 'office', bonds: { danny: true }, roll: 0, charter: false });
  const j6 = await game.hw(async (H) => {
    const HW = H.HW;
    const N = window.__n5;
    await N.register(H, [['stamp', 'danny']]);
    await H.walkTo([1, 39], { run: true, timeout: 200 }); await N.until(H, () => HW.map?.id === 'vault' && !HW.game.transferring, 20); await H.steps(4);
    await H.walkTo([3, 10], { run: true, timeout: 200 }); await N.until(H, () => !HW.game.transferring, 20); await H.steps(4);
    await H.walkTo([32, 2], { run: true, timeout: 200 }); await N.until(H, () => HW.map?.id === 'aud', 20);
    await N.until(H, () => !!HW.state.flags.seen_ch8_escape_aud && !HW.scripts.blocking, 60); await N.settle(H);
    const cp = HW.state.checkpoint;
    const n0 = H.transcript.filter((x) => x.type === 'say').length;
    HW.game.loadSave('auto');
    await N.until(H, () => HW.map?.id === 'aud', 10); await N.settle(H); await H.steps(10);
    return { cp, again: H.transcript.filter((x) => x.type === 'say').length - n0, newLines: H.transcript.filter((x) => x.type === 'say').slice(n0).map((x) => x.text), party: HW.state.party.slice(),
      seats: ['leah', 'marcus'].map((id) => { const e = HW.entities.get(id); return e ? `${e.spriteId}:${e.seat?.id}` : null; }), danny: HW.entities.get('danny')?.etype };
  });
  t.ok(j6.cp === 'escape_aud' && j6.again === 0, "J6: the aud scene checkpoints 'escape_aud'; the reload doesn't replay it", j6);
  t.ok(j6.party.join() === 'danny' && j6.danny === 'follower' && j6.seats.join() === 'leah_e:aud_seat_leah,marcus_e:aud_seat_marcus', 'J6: Danny follows; Leah and Marcus back in their seats, entranced', j6);
  await errs('run J');
}

// ------------------------------------------------------------------------------------------ screenshots
// Real input (no autoAdvance): advance dialogue with Z, pause on the box to capture, choices with arrows.
const shots = [];
async function ui(g) {
  return g.hw((H) => {
    const HW = H.HW;
    const d = HW.ui.dialogue;
    const cur = d.cur;
    return {
      mode: HW.game.mode, blocking: HW.scripts.blocking, text: cur ? cur.text : null, hold: cur ? !!cur.opts.hold : false,
      pageDone: cur ? cur.elapsed >= cur.pages[cur.page].end : false,
      choice: d.choiceState ? { ready: !!d.choiceState.ready, list: d.choiceState.list.map((o) => o.text) } : null,
      screens: HW.ui.screens.filter((s) => !s.closing).map((s) => s.name), map: HW.map?.id,
      cardTitle: HW.ui.screens.find((s) => s.name === 'card' && !s.closing)?.big || null, tr: H.transcript.length,
      f: { aud: !!HW.state.flags.seen_ch8_escape_aud, stage: !!HW.state.flags.ch8_stage_done, lobby: !!HW.state.flags.ch8_lobby_done },
    };
  });
}
async function drive(g, { until, rules = [], maxSec = 120, label = '' } = {}) {
  const t0 = Date.now();
  const fired = new Set();
  let st;
  let tr0 = null;
  while (Date.now() - t0 < maxSec * 1000) {
    st = await ui(g);
    if (tr0 === null) tr0 = st.tr;
    st.dtr = st.tr - tr0;                // transcript entries since this drive began
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
      await sleep(250);
      await g.page.keyboard.press('z');
    } else if (st.text && st.pageDone && !st.hold) {
      await sleep(220);
      await g.page.keyboard.press('z');
    }
    await sleep(100);
  }
  console.log(`  warn [${label}] drive timed out`);
  return st;
}

if (!NO_SHOTS && !ONLY) {
  await game.close();
  game = await open();
  const g = game;
  const play = () => g.hw((H) => { H.autoAdvance(false); H.timeScale(1); });
  const press = async (k) => { await sleep(250); await g.page.keyboard.press(k); await sleep(600); };
  const walk = (to) => { g.walkTo(to).catch(() => {}); return sleep(600); };
  const quiet = (st) => !st.blocking && st.mode === 'play';
  // VIII — the last roll, under the lectern.
  await S({ stage: 'vault', bonds: { danny: true, leah: false, marcus: true }, roll: 1, charter: true, auto: false, timeScale: 1, flags: { ch8_last_roll: false, seen_ch8_last_roll: false } });
  await play();
  await walk([16, 5]);
  await drive(g, { label: 'last roll', until: (st) => quiet(st) && st.dtr > 1, maxSec: 150, rules: [
    { when: (st) => st.text && st.text.includes('Dolan said') && st.pageDone, shot: 'n5_01_last_roll' },
  ] });
  // VIII — Adair's pen.
  await g.hw(async (H) => { await H.teleport('vault', 'adair'); H.HW.state.inv.red_pen = 0; delete H.HW.state.inv.red_pen; H.HW.state.flags.adair_note = false; H.HW.state.mapState.vault = { ...(H.HW.state.mapState.vault || {}), v_adair_husk: { state: 'intact' } }; H.refresh(); });
  await g.face('up'); await press('z');
  await drive(g, { label: 'adair', until: (st) => quiet(st) && st.dtr > 1, maxSec: 90, rules: [
    { when: (st) => st.text && st.text.startsWith('I take it') && st.pageDone, shot: 'n5_02_adair_pen' },
    { when: (st) => st.screens.includes('doc'), delay: 900, act: async () => { await g.page.keyboard.press('x'); await sleep(300); await g.page.keyboard.press('x'); } },
  ] });
  // VIII — the whistle.
  await S({ stage: 'breaker', roll: 1, charter: true, auto: false, timeScale: 1 });
  await play();
  await walk([7, 39]);
  await drive(g, { label: 'breaker', until: (st) => quiet(st) && st.dtr > 1, maxSec: 120, rules: [
    { when: (st) => st.text && st.text.startsWith('The bells') && st.pageDone, shot: 'n5_03_whistle' },
  ] });
  // VIII — the office.
  await g.hw(async (H) => { H.HW.state.flags.breaker_lamps = 17; await H.teleport('breaker', [29, 13]); });
  await walk([29, 8]);
  await drive(g, { label: 'office', until: (st) => quiet(st) && st.dtr > 1, maxSec: 120, rules: [
    { when: (st) => st.screens.includes('doc'), delay: 900, act: async () => { await g.page.keyboard.press('x'); await sleep(300); await g.page.keyboard.press('x'); } },
    { when: (st) => st.text && st.text.startsWith('He watched') && st.pageDone, shot: 'n5_04_he_watched' },
  ] });
  // WITHDRAWN — the scream, then the auditorium on the way out.
  await S({ stage: 'office', bonds: { danny: true, marcus: true }, roll: 0, charter: false, auto: false, timeScale: 1 });
  await play();
  await g.hw((H) => { const u = H.HW.ui; if (!u.__o) u.__o = u.open.bind(u); u.open = (n, a, p) => (n === 'register' ? Promise.resolve({ actions: [['stamp', 'danny'], ['stamp', 'marcus']] }) : u.__o(n, a, p)); });
  await g.face('up'); await press('z');
  await drive(g, { label: 'scream', until: (st) => quiet(st) && st.dtr > 1, maxSec: 60, rules: [
    { when: (st) => st.text && st.text.startsWith('WHO IS') && st.pageDone, shot: 'n5_05_scream' },
  ] });
  await g.hw(async (H) => { H.timeScale(2); await H.walkTo([1, 39], { run: true, timeout: 200 }); await H.HW.game.until(() => H.HW.map?.id === 'vault' && !H.HW.game.transferring, 20); await H.steps(4);
    await H.walkTo([3, 10], { run: true, timeout: 200 }); await H.HW.game.until(() => !H.HW.game.transferring, 20); await H.steps(4); });
  await walk([32, 2]);
  await g.hw(async (H) => { H.timeScale(1); await H.HW.game.until(() => H.HW.map?.id === 'aud', 30); });
  await drive(g, { label: 'aud', until: (st) => quiet(st) && st.map === 'aud' && st.f.aud, maxSec: 120, rules: [
    { when: (st) => st.text && st.text.startsWith('Class is starting') && st.pageDone, shot: 'n5_06_class_starting' },
  ] });
  await g.hw((H) => { const u = H.HW.ui; if (u.__o) { u.open = u.__o; delete u.__o; } });   // un-fake the Register
  // DISMISSED — the stage edge.
  await S({ stage: 'office', bonds: { danny: true, leah: true, marcus: true }, roll: 0, charter: true, timeScale: 6 });
  await g.hw(async (H) => {
    H.screenAnswer('register', { actions: [['stamp', 'danny'], ['stamp', 'leah'], ['stamp', 'marcus'], ['pen', 'founder', { grounds: 'R2', written: true }]] });
    H.face('up'); await H.interact(); await H.HW.game.until(() => !H.HW.scripts.blocking, 30);
    H.HW.state.flags.ch8_vault_after = true;
    H.autoAdvance(false); H.timeScale(1);
    await H.teleport('aud', 'trapdoor');
  });
  await drive(g, { label: 'stage edge', until: (st) => quiet(st) && st.f.stage, maxSec: 240, rules: [
    { when: (st) => st.text && st.text.startsWith('I was to be') && st.pageDone, shot: 'n5_07_last_to_leave' },
    { when: (st) => st.text && st.text.startsWith('He blinks') && st.pageDone, act: async () => { await sleep(300); await g.page.keyboard.press('z'); await sleep(2800); await g.shot('n5_08_uniform'); shots.push('n5_08_uniform'); } },
  ] });
  // DISMISSED — the lobby: GO HOME, TESS.
  await g.hw(async (H) => { await H.teleport('lobby', 'from_aud'); });
  await drive(g, { label: 'lobby', until: (st) => quiet(st) && st.f.lobby, maxSec: 200, rules: [
    { when: (st) => st.text && st.text.includes('GO HOME') && st.pageDone, shot: 'n5_09_go_home' },
  ] });
  // DISMISSED — the steps at dawn (end.dismissed).
  await walk([14, 26]);
  await drive(g, { label: 'epilogue', until: (st) => st.screens.includes('credits'), maxSec: 300, rules: [
    { when: (st) => st.text && st.text.startsWith('Since AUGUST') && st.pageDone, shot: 'n5_10_dawn_steps' },
    { when: (st) => st.text && st.text.startsWith('Side A') && st.pageDone, shot: 'n5_11_side_a' },
  ] });
  // PRESENT — Room 102 at dawn.
  await S({ stage: 'office', bonds: {}, roll: 2, auto: false, timeScale: 1 });
  await play();
  await g.hw((H) => { H.HW.game.setMode('ending'); H.run('end.present'); });
  await drive(g, { label: 'present', until: (st) => st.cardTitle === 'PRESENT', maxSec: 120, rules: [
    { when: (st) => st.text && st.text.startsWith('Nobody gets left') && st.pageDone, shot: 'n5_12_present' },
  ] });
  await errs('screenshot pass');
  console.log(`  info screenshots (${shots.length}): ${shots.join(', ')}`);
}

console.log(`  info line budgets (say + think): ${JSON.stringify(budget)}`);
await game.close();
await browser.close();
process.exit(t.done() ? 0 : 1);
