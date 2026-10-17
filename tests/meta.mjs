// Meta systems tests: the Register rules + ending resolution (DESIGN §8, incl. its QA matrix), chapter
// setup, the system scripts (sys.pa → roll call #1, sys.safe, sys.terminal, sys.register, gen.*), and the
// UI v2 screens (Register states, the expulsion with the hand, referral slips, VHS scrubber, write meter)
// with screenshots in $HW_SHOTS (meta_*.png).
// node tests/meta.mjs            (dev page; exit code 1 on failure)
import { launch, openGame, suite, SHOTS } from './lib.mjs';
import { buildRegisterModel, resolveEnding, inkOf, listed, savedFriends, LINES, PUPILS, FRIENDS } from '../src/game/endings.js';

const T = suite('meta');

// ================================================================================================
// 1. Register rules (pure, in node)
// ================================================================================================
const KEEPSAKES = { danny_flashlight: 1, camcorder: 1, denise_photo: 1, house_key: 1 };
/** A state with R answers, bonds B (ids), Charter C, and the Register tools. */
function mkState(R, B = [], C = false, extra = {}) {
  const flags = {};
  for (let k = 1; k <= R; k++) flags[`roll${k}_answered`] = true;
  for (const b of B) flags[`bond_${b}`] = true;
  const inv = { withdrawn_stamp: 1, transfer_form: 1, red_pen: 1, ...KEEPSAKES, ...(C ? { charter: 1 } : {}), ...(extra.inv || {}) };
  return { chapter: 8, rollAnswered: R, flags, inv, bonds: { danny: B.includes('danny'), leah: B.includes('leah'), marcus: B.includes('marcus') } };
}
const thinkOf = (r) => (r.say || []).map((l) => l[2]).join(' | ');

/**
 * Play the page: stamp everything the stamp takes, use the form on `formOn` (confirmed), then try the pen
 * with grounds R2. Returns { ending, saved, expelled, formOn, steps }.
 */
function playPlan(s, formOn) {
  const m = buildRegisterModel(s);
  const steps = [];
  for (const id of ['danny', 'leah', 'marcus', 'tess']) {
    if (!listed(s, id)) continue;
    if (inkOf(s, id) === 'pencil') steps.push(['stamp', id, m.act('stamp', id).ok]);
  }
  if (formOn) steps.push(['form', formOn, m.act('form', formOn, { confirmed: true }).ok]);
  const pen = m.act('pen', 'founder', { grounds: 'R2' });
  if (pen.need === 'write') steps.push(['pen', 'founder', m.act('pen', 'founder', { grounds: 'R2', written: true }).ok]);
  const out = { ...s, flags: { ...s.flags } };
  const { ending, saved } = m.commit(out);
  return { ending, saved, expelled: !!out.flags.expelled, formOn: out.flags.form_used_on || null, steps, flags: out.flags };
}
const subsets = (arr) => arr.reduce((acc, x) => acc.concat(acc.map((a) => [...a, x])), [[]]);

await T.step('Register QA matrix (DESIGN §8)', async () => {
  // The five named cases.
  let r = playPlan(mkState(0, ['danny', 'leah', 'marcus'], true), null);
  T.ok(r.ending === 'dismissed' && r.formOn === null && r.saved.length === 3, '(0,3,C) → DISMISSED, form unused', r);
  r = playPlan(mkState(1, ['danny', 'leah'], true), 'marcus');
  T.ok(r.ending === 'dismissed' && r.flags.withdrawn_tess && r.saved.length === 3, '(1,2,C) → DISMISSED (stamp Tess + 2, form on the ink friend)', r);
  r = playPlan(mkState(2, ['danny', 'leah'], true), 'tess');
  T.ok(r.ending === 'withdrawn' && r.saved.join() === 'danny,leah' && !r.expelled, '(2,2,C) form on self → WITHDRAWN-2', r);
  r = playPlan(mkState(2, ['danny', 'leah'], true), 'marcus');
  T.ok(r.ending === 'present' && r.saved.length === 3, '(2,2,C) form on Marcus → PRESENT-3', r);
  r = playPlan(mkState(3, [], false), 'tess');
  T.ok(r.ending === 'withdrawn' && r.saved.length === 0, '(3,0,!C) form on self → WITHDRAWN alone', r);
  r = playPlan(mkState(3, [], false), 'leah');
  T.ok(r.ending === 'present' && r.saved.join() === 'leah', '(3,0,!C) form on a friend → PRESENT-1', r);
  r = playPlan(mkState(0, [], false), 'danny');
  T.ok(r.ending === 'withdrawn' && r.saved.join() === 'danny', '(0,0,!C) → WITHDRAWN-1', r);

  // The general statements, exhaustively over R 0..3 × every bond set × Charter.
  const bad = [];
  for (const R of [0, 1, 2, 3]) for (const B of subsets(FRIENDS)) for (const C of [false, true]) {
    const s = mkState(R, B, C);
    const inkFriends = FRIENDS.filter((f) => !B.includes(f));
    const plans = [null, ...inkFriends, ...(R >= 2 ? ['tess'] : [])];
    const results = plans.map((p) => ({ p, ...playPlan(s, p) }));
    const tag = `R${R} B[${B}] C${C ? 1 : 0}`;
    if (R <= 1) {
      // DISMISSED iff C && B ≥ 2 (form on the one ink friend)
      const can = results.some((x) => x.ending === 'dismissed');
      if (can !== (C && B.length >= 2)) bad.push(`${tag}: dismissed reachable=${can}`);
      if (B.length === 2 && C && !results.find((x) => x.p === inkFriends[0]).expelled) bad.push(`${tag}: form on the ink friend should expel`);
    } else {
      const self = results.find((x) => x.p === 'tess');
      const want = C && B.length === 3 ? 'dismissed' : 'withdrawn';
      if (self.ending !== want || self.saved.length !== B.length) bad.push(`${tag}: form on self → ${self.ending}/${self.saved.length}, want ${want}/${B.length}`);
      for (const f of inkFriends) {
        const x = results.find((y) => y.p === f);
        if (x.ending !== 'present' || x.saved.length !== Math.min(3, B.length + 1)) bad.push(`${tag}: form on ${f} → ${x.ending}/${x.saved.length}`);
      }
    }
    // Nothing done at all: R ≥ 1 → PRESENT, R = 0 → WITHDRAWN (Tess free by default).
    const none = buildRegisterModel(s).outcome();
    if (none !== (R >= 1 ? 'present' : 'withdrawn')) bad.push(`${tag}: untouched page → ${none}`);
  }
  T.eq(bad, [], 'matrix holds for all 64 (R, B, C) combinations');

  T.eq(resolveEnding({ flags: { truant: true, expelled: true }, rollAnswered: 2 }), 'truant', 'truant wins over everything');
  T.eq(resolveEnding({ flags: { ending: 'truant' }, rollAnswered: 0 }), 'truant', "ending 'truant' set by the chute");
  T.eq(resolveEnding({ flags: { expelled: true }, rollAnswered: 3 }), 'dismissed', 'expelled → dismissed');
  T.eq(resolveEnding({ flags: {}, rollAnswered: 1 }), 'present', 'answered and still on the roll → present');
  T.eq(resolveEnding({ flags: { withdrawn_tess: true }, rollAnswered: 2 }), 'withdrawn', 'withdrawn Tess → withdrawn');
  T.eq(resolveEnding({ flags: { roll1_answered: true, roll2_answered: true } }), 'present', 'rollAnswered falls back to the roll flags');
});

await T.step('Register model behaviours', async () => {
  // Listing & ink
  const s0 = mkState(0, ['leah']);
  T.eq(buildRegisterModel(s0).lines.map((l) => `${l.id}:${l.ink}`), ['danny:ink', 'leah:pencil', 'marcus:ink'], 'R=0: Tess not listed; friends by bond');
  T.eq(buildRegisterModel(mkState(1)).lines.find((l) => l.id === 'tess')?.ink, 'pencil', 'R=1: Tess in pencil');
  T.eq(buildRegisterModel(mkState(2)).lines.find((l) => l.id === 'tess')?.ink, 'ink', 'R≥2: Tess in ink');
  T.eq(buildRegisterModel(mkState(1)).founder.name, 'HALLOWELL, CYRUS — FIRST PUPIL', 'the founder heads the page');

  // Refusals in voice (DESIGN §8 wording)
  const m = buildRegisterModel(mkState(1, ['danny', 'leah']));
  T.eq(thinkOf(m.act('form', 'leah')), "Her name's only in pencil. The stamp'll take. I'm not wasting Mom's signature.", 'form on pencil (her)');
  T.eq(thinkOf(m.act('form', 'danny')), "His name's only in pencil. The stamp'll take. I'm not wasting Mom's signature.", 'form on pencil (his)');
  T.eq(thinkOf(m.act('form', 'founder')), 'Transfer him where? Nobody would take him.', 'form on the founder');
  T.eq(thinkOf(m.act('stamp', 'marcus')), 'It beads up like water on wax. Real ink.', 'stamp on ink');
  T.eq(thinkOf(m.act('stamp', 'founder')), 'Red ink. Nothing takes on it.', 'stamp on the founder');
  T.eq(thinkOf(m.act('pen', 'founder')), 'Expel him? On what grounds? {p} ...The Charter. Adair said the Charter.', 'pen without the Charter');
  const mc = buildRegisterModel(mkState(1, ['danny', 'leah'], true));
  T.eq(thinkOf(mc.act('pen', 'founder')), 'Not yet. Clear the roll first.', 'pen before the roll is clear');
  T.eq(thinkOf(mc.act('pen', 'danny')), LINES.penOnPupil, 'pen on a pupil');

  // Previews (Tess's prediction) — no side effects
  T.eq(m.preview('stamp', 'danny').text, "Danny's in pencil. The stamp'll take.", 'preview: stamp on pencil');
  T.eq(m.preview('stamp', 'tess').text, "I'm in pencil. The stamp'll take.", 'preview: stamp on Tess');
  T.ok(m.preview('stamp', 'marcus').ok === false && m.preview('form', 'marcus').ok === true, 'preview ok flags');
  T.eq(m.lines.filter((l) => l.status === 'withdrawn').length, 0, 'previews and refusals change nothing');

  // Stamping lines + keepsakes + voices
  const st = mc.act('stamp', 'danny');
  T.ok(st.ok && st.keepsake === 'danny_flashlight' && st.voice?.text === '...Dolan?', 'stamp Danny: keepsake auto, his voice from above', st);
  T.eq(thinkOf(st), PUPILS.danny.stampLine, 'stamping line (Danny)');
  T.eq(thinkOf(mc.act('stamp', 'leah')), 'Leah Brandt, for STATIC. {p} ...Still recording.', 'stamping line (Leah)');
  T.eq(thinkOf(mc.act('stamp', 'tess')), 'Dolan. Kettle Run. {p} For now.', 'stamping line (Tess, house key)');
  T.eq(thinkOf(mc.act('stamp', 'danny')), "Danny's already off it.", 'stamping twice is refused');

  // Form reasons
  const fr = mc.act('form', 'marcus');
  T.ok(fr.ok && fr.reason === "Reason: somebody's still setting a plate." && fr.voice?.text === 'Tess?', 'form on Marcus: reason + voice', fr);
  T.eq(thinkOf(mc.act('form', 'marcus')), "Marcus's already off it.", 'form on a withdrawn line refused');
  const reasons = {};
  for (const id of ['danny', 'leah', 'tess']) {
    const s = mkState(id === 'tess' ? 2 : 0, []);
    reasons[id] = buildRegisterModel(s).act('form', id, { confirmed: true }).reason;
  }
  T.eq(reasons, { danny: 'Reason: he has somewhere to be.', leah: 'Reason: she was right. I should have said.', tess: "Reason: moving to Philadelphia. I'm sorry I didn't say." }, 'form reasons (Tess writes them)');
  const one = buildRegisterModel(mkState(0));
  one.act('form', 'danny');
  T.eq(thinkOf(one.act('form', 'leah')), 'I only had the one form.', 'one form only');

  // Tess in ink: using the form on a friend asks first
  const mi = buildRegisterModel(mkState(2));
  const ask = mi.act('form', 'leah');
  T.ok(!ask.ok && ask.need === 'confirm' && ask.prompt === "That's my way out. {p} Use it on Leah?" && ask.options.join() === 'Yes,No', 'way-out confirm when Tess is in ink', ask);
  T.ok(mi.act('form', 'leah', { confirmed: true }).ok, 'confirmed → applied');
  T.ok(buildRegisterModel(mkState(1)).act('form', 'leah').ok, 'no confirm while Tess is only in pencil');

  // Grounds and the written expulsion
  const mg = buildRegisterModel(mkState(0, ['danny', 'leah', 'marcus'], true));
  for (const f of FRIENDS) mg.act('stamp', f);
  T.eq(mg.preview('pen', 'founder').text, 'He enrolled himself. He can be expelled like anyone.', 'preview: pen ready');
  T.eq(mg.act('pen', 'founder').need, 'grounds', 'pen asks for grounds');
  const badG = {};
  for (const g of ['R4', 'R5', 'R6']) badG[g] = thinkOf(mg.act('pen', 'founder', { grounds: g }));
  T.eq(Object.values(badG), Array(3).fill('He never did that. {p} Not that I saw.'), "R4–R6: 'He never did that.'");
  for (const g of ['R1', 'R2', 'R3']) {
    const w = mg.act('pen', 'founder', { grounds: g });
    if (!T.ok(w.need === 'write' && w.write.seconds === 6 && /^HALLOWELL, CYRUS — EXPELLED — .+\. Reported by T\. Dolan\.$/.test(w.write.text), `${g} is valid → hold to write`, w)) break;
  }
  T.eq(mg.act('pen', 'founder', { grounds: 'R2' }).write.text, 'HALLOWELL, CYRUS — EXPELLED — out of his seat. Reported by T. Dolan.', 'expulsion text (R2)');
  T.eq(mg.founder.status, 'enrolled', 'not expelled until the writing is finished');
  T.ok(mg.act('pen', 'founder', { grounds: 'R2', written: true }).ok && mg.founder.status === 'expelled', 'written → expelled (provisional)');
  T.eq(mg.outcome(), 'dismissed', 'outcome preview: dismissed');
  const assisted = buildRegisterModel({ ...mkState(0, FRIENDS, true), assist: 1.3 });
  for (const f of FRIENDS) assisted.act('stamp', f);
  T.ok(Math.abs(assisted.act('pen', 'founder', { grounds: 'R1' }).write.seconds - 7.8) < 1e-9, 'assist: +30 % writing time');

  // Provisional until Close; Start over
  const sp = mkState(1, ['danny', 'leah'], true);
  const mp = buildRegisterModel(sp);
  mp.act('stamp', 'danny'); mp.act('form', 'marcus');
  T.ok(mp.dirty && !sp.flags.withdrawn_danny && !sp.flags.form_used_on, 'actions are provisional (state untouched)');
  const so = mp.startOver();
  T.ok(so.ok && thinkOf(so) === 'Okay. {p} Think.' && !mp.dirty && mp.lines.every((l) => l.status === 'enrolled') && mp.formOn === null, 'Start over wipes the page');
  T.eq(thinkOf(mp.startOver()), "I haven't done anything yet.", 'Start over on a clean page');
  T.ok(mp.tools.find((t) => t.id === 'form').available, 'the form is back in the tray after Start over');

  // Close summary in Tess's voice
  const sum = buildRegisterModel(mkState(1, ['danny'])).closeSummary();
  T.ok(sum.lines.includes("Leah's still there. In ink.") && sum.lines.includes("Danny's still there. In pencil.") && sum.lines.includes("I'm still on it. In pencil.") && sum.options.join() === 'Close it.,Not yet.', 'close summary lists what remains', sum);
  T.ok(/Close it\?$/.test(sum.prompt), 'close prompt ends with the question');

  // Commit
  const sc = mkState(2, ['danny', 'leah'], true);
  const mm = buildRegisterModel(sc);
  mm.act('stamp', 'danny'); mm.act('stamp', 'leah'); mm.act('form', 'tess');
  const res = mm.commit(sc);
  T.eq([res.ending, sc.flags.withdrawn_danny, sc.flags.withdrawn_leah, sc.flags.withdrawn_marcus, sc.flags.withdrawn_tess, sc.flags.form_used_on, sc.flags.form_used, sc.flags.expelled, sc.flags.register_done, sc.flags.ending],
    ['withdrawn', true, true, false, true, 'tess', true, false, true, 'withdrawn'], 'commit writes withdrawn_*, form_used_on (+form_used), expelled, register_done, ending');
  T.eq(savedFriends(sc), ['danny', 'leah'], 'savedFriends()');

  // Missing keepsake → warn, treat as present
  const warns = [];
  const ow = console.warn; console.warn = (...a) => warns.push(a.join(' '));
  const mk = buildRegisterModel(mkState(0, ['leah'], false, { inv: { camcorder: 0 } }));
  const okNoKeep = mk.act('stamp', 'leah').ok;
  console.warn = ow;
  T.ok(okNoKeep && warns.some((w) => /camcorder/.test(w)), 'missing keepsake: stamp still takes, console.warn', warns);

  // Tool availability
  const noStamp = buildRegisterModel({ ...mkState(0, FRIENDS), inv: { transfer_form: 1, red_pen: 1 } });
  T.ok(noStamp.tools.find((t) => t.id === 'stamp').available === false && !noStamp.act('stamp', 'danny').ok, 'no stamp in the bag → unavailable');
});

// ================================================================================================
// 2. In the game
// ================================================================================================
const browser = await launch();
let g;
const lastTexts = (n = 30) => g.hw((H, k) => H.transcript.slice(-k).map((e) => `${e.type}:${e.text}`), n);
const wait = (ms) => g.page.waitForTimeout(ms);
const tap = async (a, ms = 140) => { await g.page.evaluate((x) => window.__HW.HW.input.tap(x), a); await wait(ms); };
const shot = (name) => g.shot(`meta_${name}`);

try {
  g = await openGame(browser);
  await g.newTestGame({ timeScale: 1 });

  // These tests exercise the systems' own defaults: narrative scripts that would take over a beat
  // (ch4.roll1, ch6.safe_open, …) are set aside while they run (__meta.hide(ids) → restore()).
  await g.hw((H) => {
    window.__meta = {
      hide(ids) {
        const S = H.HW.data.scripts, saved = {};
        for (const id of ids) { if (S[id]) saved[id] = S[id]; delete S[id]; }
        return () => Object.assign(S, saved);
      },
    };
  });

  await T.step('chapter setup', async () => {
    const r = await g.hw(async (H) => {
      const HW = H.HW;
      const calls = [];
      const realPeriods = HW.periods;
      HW.periods = { active: false, enable: (c) => calls.push(['enable', c]), disable: () => calls.push(['disable']) };
      const out = {};
      const run = (n) => HW.scripts.runFn(async (gg) => { await gg.chapter(n); });
      await run(2);
      out.c2 = { party: [...HW.state.party], obj: HW.state.objective, act: HW.game.act, rate: HW.chapters?.chimeRate(2) };
      await run(5);
      out.c5 = { party: [...HW.state.party], obj: HW.state.objective, act: HW.game.act, calls: calls.splice(0) };
      H.setFlag('ch5_205_period_done', true);
      out.c5b = calls.splice(0);
      await run(7);
      out.c7 = { party: [...HW.state.party], started: HW.state.flags.ch7_started, act: HW.game.act, calls: calls.splice(0) };
      out.grime = [0, 3, 6].map((n) => HW.chapters.grimeFor(n));
      // drones: the chime silences the chapter drone, the dismissal brings it back; Ch6 ends it with Marcus
      const music = [];
      const origMusic = HW.audio.music;
      HW.audio.music = (id) => music.push(id || null);
      await run(4);
      HW.game.emit('periodWarning', {}); HW.game.emit('periodStart', {}); HW.game.emit('periodEnd', {});
      await run(6);
      H.setFlag('ch6_marcus_taken', true);
      H.checkpoint('meta ch6'); H.load('auto'); await H.steps(2);
      H.setFlag('ch6_marcus_taken', false);
      HW.audio.music = origMusic;
      out.music = music;
      out.drones = [2, 3, 5, 6, 8].map((n) => HW.chapters.droneFor(n));
      // reload in Ch5 after the 205 period: free periods come back
      await run(5);
      calls.splice(0);
      H.checkpoint('meta ch5');
      H.load('auto');
      await H.steps(3);
      out.load = calls.splice(0);
      HW.periods = realPeriods;
      return out;
    });
    T.ok(r.c2.party.join() === 'leah,marcus' && r.c2.obj && r.c2.act === 1 && Math.abs(r.c2.rate - 1) < 1e-9, 'Ch2: Leah + Marcus, act 1, default objective', r.c2);
    T.ok(r.c5.party.join() === 'marcus' && r.c5.act === 2 && r.c5.calls.some((c) => c[0] === 'disable') && !r.c5.calls.some((c) => c[0] === 'enable'), 'Ch5: Marcus, act 2, free periods wait for the 205 period', r.c5);
    const en = r.c5b.find((c) => c[0] === 'enable');
    T.ok(en && en[1].maps.join() === 'east2,west2' && en[1].passing === 150 && en[1].length === 60 && en[1].max === 3, 'Ch5: ch5_205_period_done opens free periods (east2/west2, 150/60/3)', r.c5b);
    T.ok(r.c7.party.length === 0 && r.c7.started === true && r.c7.act === 3 && r.c7.calls.some((c) => c[0] === 'disable'), 'Ch7: alone, ch7_started, act 3, no free periods', r.c7);
    T.eq(r.grime, [0, 1, 2], 'portrait grime 0 → 1 (Ch3) → 2 (Ch6)');
    T.eq(r.drones, [null, 'drone_1', 'drone_2', 'drone_3', null], 'drones per chapter');
    T.eq(r.music, ['drone_2', null, 'drone_2', 'drone_3', null], 'drone: chapter start, silenced by the chime, back at dismissal; none after ch6_marcus_taken (reload)');
    T.ok(r.load.some((c) => c[0] === 'enable'), 'free periods re-applied after loading a Ch5 save', r.load);
  });

  await T.step('Tess enrolled portrait levels', async () => {
    const r = await g.hw(async (H) => {
      const svc = await import('/src/ui/services.js');
      const HW = H.HW;
      const px = (c) => { const d = c.getContext('2d').getImageData(0, 0, 96, 120).data; let h = 0; for (let i = 0; i < d.length; i += 7) h = (h * 31 + d[i]) | 0; return h; };
      HW.state.rollAnswered = 0;
      const p0 = px(svc.portrait('tess', 'neutral', { light: 'dark' }));
      HW.state.rollAnswered = 1;
      const lvl1 = svc.tessEnrolledLevel();
      const p1 = px(svc.portrait('tess', 'neutral', { light: 'dark' }));
      HW.state.rollAnswered = 3;
      const lvl2 = svc.tessEnrolledLevel();
      const p2 = px(svc.portrait('tess', 'neutral', { light: 'dark' }));
      const explicit = px(svc.portrait('tess', 'neutral', { light: 'dark', enrolled: 0 }));
      HW.state.rollAnswered = 0;
      return { lvl1, lvl2, distinct: new Set([p0, p1, p2]).size, explicit0: explicit === p0 };
    });
    T.ok(r.lvl1 === 1 && r.lvl2 === 2 && r.distinct === 3 && r.explicit0, "Tess's portrait follows rollAnswered (0 / 1 catchlight / 2 sheen); explicit level wins", r);
  });

  await T.step('gen scripts', async () => {
    const r = await g.hw(async (H) => {
      const out = {};
      for (const id of ['gen.locked', 'gen.no_seats', 'gen.front_loop', 'gen.front_loop', 'gen.locker_not_hide', 'gen.nothing']) {
        const n = H.transcript.length;
        await H.run(id, id === 'gen.locked' ? { prop: { inst: { lockedText: "[n] It's painted on." } } } : {});
        out[id] = (out[id] ? out[id] + ' / ' : '') + H.transcript.slice(n).filter((e) => ['think', 'narrate', 'say'].includes(e.type)).map((e) => e.text).join(' ');
      }
      return out;
    });
    T.eq(r['gen.locked'], "It's painted on.", 'gen.locked uses the prop lockedText');
    T.ok(/No seats in here/.test(r['gen.no_seats']), 'gen.no_seats');
    T.ok(/library doors again/.test(r['gen.front_loop']) && r['gen.front_loop'].includes(' / '), 'gen.front_loop: one line per loop, varied', r['gen.front_loop']);
    T.ok(/Seats\. Marcus said seats\./.test(r['gen.locker_not_hide']), 'gen.locker_not_hide');
    T.ok(r['gen.nothing'].length > 0, 'gen.nothing');
  });

  await T.step('sys.safe: wrong tries, third-try hint, success', async () => {
    const r = await g.hw(async (H) => {
      const HW = H.HW;
      const orig = HW.ui.open;
      const tried = [];
      const restore = window.__meta.hide(['ch6.safe_open']);
      HW.ui.open = (name, args) => {
        if (name !== 'safe') return orig.call(HW.ui, name, args);
        return (async () => {
          const combos = [[10, 19, 23], [10, 19, 11], [1, 2, 3], [10, 19, 79], [10, 19, 94]];
          for (let i = 0; i < combos.length; i++) {
            const ok = args.check(...combos[i]);
            tried.push({ c: combos[i].join('-'), ok });
            if (ok) return true;
            const n = H.transcript.length;
            await args.onWrong(i + 1);
            tried[i].line = H.transcript.slice(n).map((e) => e.text).join(' ');
          }
          return false;
        })();
      };
      await H.run('sys.safe');
      HW.ui.open = orig;
      restore();
      const s = H.state();
      return { tried, open: s.flags.safe_open, inv: s.inv, docs: s.docs };
    });
    T.eq(r.tried.map((t) => t.line || (t.ok ? 'OPEN' : '')), [
      "That's when the school opened. Founder's Day is older than the school.",
      "That's when he died. It started before that.",
      "First Founder's Day. The plaque had the year.",
      'No. Not *that* day.',
      'OPEN',
    ], 'specific wrong lines, the third wrong try hints, 10-19-94 opens');
    T.ok(r.open && r.inv.withdrawn_stamp && r.inv.aud_key && r.docs.haupt_letter, 'safe_open set; fallback gives the stamp, the key and the letter (no ch6.safe_open yet)', r);
    const again = await g.hw(async (H) => { await H.run('sys.safe'); return H.transcript.slice(-1)[0].text; });
    T.ok(/It's open/.test(again), 'an opened safe stays open');
  });

  await T.step('sys.pa: closing the console fires ALL CALL (roll call #1)', async () => {
    const r = await g.hw(async (H) => {
      H.setFlag('roll1_done', false); H.setFlag('roll1_answered', false);
      H.choiceQueue = [0];
      const restore = window.__meta.hide(['ch4.roll1', 'ch4.pa_listen', 'ch4.hide']);
      const n = H.transcript.length;
      await H.run('sys.pa');
      restore();
      const tr = H.transcript.slice(n);
      const s = H.state();
      return { lines: tr.filter((e) => e.type === 'say').map((e) => `${e.who}:${e.text}`), choice: tr.find((e) => e.type === 'choice')?.text, done: s.flags.roll1_done, answered: s.flags.roll1_answered, R: s.rollAnswered, checkpoints: tr.filter((e) => e.type === 'checkpoint').map((e) => e.text), obj: s.objective };
    });
    T.ok(r.lines[0] === 'voice:Daniel Kovach.' && r.lines.includes('marcus:Don\'t.') && r.lines.includes('voice:Theresa Dolan?'), 'the roll: Danny, Leah, Marcus x2, Theresa', r.lines);
    T.ok(r.choice === 'Here.' && r.done && r.answered && r.R === 1 && r.lines.includes('voice:Thank you, Theresa.'), '[Here.] → roll1_answered, rollAnswered 1, "Thank you, Theresa."', r);
    T.ok(r.checkpoints.includes('pa console') && r.checkpoints.includes('roll 1'), 'checkpoints before ALL CALL and after the choice', r.checkpoints);
    T.eq(r.obj, 'Danny — 205? Leah — library?', "Notes line as the sketchbook's objective");
    const r2 = await g.hw(async (H) => {
      H.setFlag('roll1_done', false); H.setFlag('roll1_answered', false);
      H.choiceQueue = [1];
      const restore = window.__meta.hide(['ch4.roll1', 'ch4.pa_listen', 'ch4.hide']);
      const n = H.transcript.length;
      await H.run('sys.pa');
      restore();
      const tr = H.transcript.slice(n);
      return { lines: tr.filter((e) => e.type === 'say').map((e) => e.text), answered: !!H.state().flags.roll1_answered, R: H.state().rollAnswered };
    });
    T.ok(r2.lines.includes('Theresa Dolan... {p} absent.') && r2.lines.includes('Absences will be made up.') && !r2.answered && r2.R === 0, '[(Say nothing.)] → absent, absences will be made up', r2);
  });

  await T.step('sys.pa: the third LISTEN fires ALL CALL; lamps light on the console', async () => {
    const r = await g.hw(async (H) => {
      const HW = H.HW;
      H.setFlag('roll1_done', false);
      H.choiceQueue = [1];
      const orig = HW.ui.open, origGet = HW.ui.get, origClose = HW.ui.close;
      const spy = { lamps: [], modes: [], locked: [] };
      const fake = { setLamp: (id) => spy.lamps.push(id), setMode: (m) => spy.modes.push(m), setLocked: (v) => spy.locked.push(v), setRoom() {} };
      let resolveScreen = null, listenArgs = null;
      const restore = window.__meta.hide(['ch4.roll1', 'ch4.pa_listen', 'ch4.hide']);
      HW.ui.open = (name, args) => {
        if (name !== 'pa') return orig.call(HW.ui, name, args);
        listenArgs = args;
        return new Promise((res) => { resolveScreen = res; });
      };
      HW.ui.get = (name) => (name === 'pa' && resolveScreen ? fake : origGet.call(HW.ui, name));
      HW.ui.close = (name, v) => { if (name === 'pa' && resolveScreen) { const r = resolveScreen; resolveScreen = null; r(v ?? null); return true; } return origClose.call(HW.ui, name, v); };
      const n = H.transcript.length;
      const done = H.run('sys.pa');
      await H.steps(3);
      const heard = [];
      for (const room of ['205', 'LIB', 'GYM']) {
        const k = H.transcript.length;
        await listenArgs.onListen(room);
        heard.push(H.transcript.slice(k).map((e) => e.text).join(' | '));
        await H.steps(2);
      }
      await done;
      HW.ui.open = orig; HW.ui.get = origGet; HW.ui.close = origClose;
      restore();
      const tr = H.transcript.slice(n);
      return { heard, spy, closed: resolveScreen === null, done: H.state().flags.roll1_done, firstRoll: tr.findIndex((e) => e.text === 'Daniel Kovach.'), pa_used: H.state().flags.ch4_pa_used };
    });
    T.ok(/i will not leave/.test(r.heard[0]) && /Leah doesn't cry/.test(r.heard[1]) && /Never the gym/.test(r.heard[2]), 'LISTEN plays each room and Tess reacts', r.heard);
    T.ok(r.done && r.firstRoll >= 0 && r.pa_used, 'ALL CALL ran after the third listen', r);
    T.eq(r.spy.lamps, ['205', 'LIB'], 'the 205 and LIB lamps light as Danny and Leah answer');
    T.ok(r.spy.modes.includes('allcall') && r.spy.locked[0] === true && r.closed, 'console switched to ALL CALL, locked, then closed', r.spy);
  });

  await T.step('sys.terminal', async () => {
    const r = await g.hw(async (H) => {
      const HW = H.HW;
      const out = {};
      let k = H.transcript.length;
      await H.run('sys.terminal');
      out.dead = H.transcript.slice(k).map((e) => e.text).join(' ');
      const realPeriods = HW.periods;
      HW.periods = { active: true };
      const orig = HW.ui.open;
      HW.ui.open = (name, args) => {
        if (name !== 'terminal') return orig.call(HW.ui, name, args);
        return (async () => { out.boot = args.boot.slice(-1)[0]; out.kovach = await args.handle('KOVACH'); out.hall = await args.handle('hallowell'); out.hall2 = await args.handle('HALLOWELL'); return null; })();
      };
      const bat = HW.state.inv.battery || 0;
      k = H.transcript.length;
      await H.run('sys.terminal');
      HW.ui.open = orig;
      HW.periods = realPeriods;
      out.battery = (HW.state.inv.battery || 0) - bat;
      out.after = H.transcript.slice(k).map((e) => e.text).join(' ');
      return out;
    });
    T.eq(r.dead, 'The screen is dead.', 'no period → the screen is dead');
    T.ok(r.boot === 'SURNAME?' && r.kovach.some((l) => /KOVACH, DANIEL/.test(l)) && r.kovach.slice(-1)[0] === 'SURNAME?', 'TERMINAL.respond lookups + prompt', r.kovach);
    T.ok(r.hall.some((l) => /PRINTING/.test(l)) && !r.hall2.some((l) => /PRINTING/.test(l)) && r.battery === 1, 'HALLOWELL prints once → printer battery', r);
  });

  await T.step('sys.register: forced page → commit → checkpoint → ch8.after_register', async () => {
    const r = await g.hw(async (H) => {
      const HW = H.HW;
      HW.state.flags = { ...HW.state.flags };
      for (const k of ['roll1_answered', 'roll2_answered', 'roll3_answered']) delete HW.state.flags[k];
      H.setFlag('roll1_answered', true);
      H.setFlag('bond_danny', true); H.setFlag('bond_leah', true);
      for (const i of ['withdrawn_stamp', 'red_pen', 'charter', 'danny_flashlight', 'camcorder', 'denise_photo']) H.give(i);
      const restore = window.__meta.hide(['ch8.after_register', 'ch8.register_voice']);
      HW.data.scripts['ch8.after_register'] = async (gg, ctx) => { gg.set('meta_after_register', ctx.ending); };
      H.screenAnswer('register', { actions: [['stamp', 'danny'], ['stamp', 'leah'], ['stamp', 'tess'], ['form', 'marcus'], ['pen', 'founder', { grounds: 'R2', written: true }]] });
      const n = H.transcript.length;
      await H.run('sys.register');
      delete HW.data.scripts['ch8.after_register'];
      restore();
      const f = H.state().flags;
      const again = (await H.run('sys.register'), H.transcript.slice(-1)[0].text);
      return { f, cps: H.transcript.slice(n).filter((e) => e.type === 'checkpoint').map((e) => e.text), again };
    });
    const f = r.f;
    T.ok(f.register_done && f.expelled && f.ending === 'dismissed' && f.withdrawn_danny && f.withdrawn_leah && f.withdrawn_marcus && f.withdrawn_tess && f.form_used_on === 'marcus' && f.form_used, 'flags committed at Close', f);
    T.ok(r.cps.includes('register closed') && f.meta_after_register === 'dismissed', 'checkpoint, then ch8.after_register with the ending', r);
    T.ok(/It's closed/.test(r.again), 'a closed Register stays closed');
  });

  // -------------------------------------------------------------------------------------------- real UI
  const st = () => g.page.evaluate(() => { const U = window.__HW.HW.ui; const r = U.get('register'); const d = U.dialogue; return { open: !!r, mode: r?.mode, busy: r?.busy, cur: !!(d.cur || d.queue.length), choice: !!d.choiceState }; });
  async function settle(max = 60) {
    for (let i = 0; i < max; i++) {
      const r = await st();
      if (r.choice) return r;
      if (r.cur) { await tap('confirm', 60); await wait(180); continue; }
      if (!r.busy) return r;
      await wait(180);
    }
    return st();
  }
  const sel = (mode, tool, line) => g.page.evaluate(([m, t, l]) => { const r = window.__HW.HW.ui.get('register'); r.mode = m; r.toolSel = t; if (l != null) r.lineSel = l; }, [mode, tool, line]);
  const openRegister = (o) => g.hw(async (H, opt) => {
    H.autoAdvance(true);
    await H.newGame({ skipIntro: true });
    await H.teleport('breaker', 'register');
    for (const i of ['withdrawn_stamp', 'red_pen', 'danny_flashlight', 'camcorder', 'denise_photo', ...(opt.charter ? ['charter'] : [])]) H.give(i);
    for (let k = 1; k <= opt.R; k++) H.setFlag(`roll${k}_answered`, true);
    for (const b of opt.bonds) H.setFlag(`bond_${b}`, true);
    H.autoAdvance(false);
    const E = await import('/src/game/endings.js');
    window.__model = E.buildRegisterModel(H.HW.state);
    window.__regResult = 'pending';
    H.HW.ui.open('register', { model: window.__model }).then((v) => { window.__regResult = v; });
  }, o);

  await T.step('Register UI: tools, previews, stamp, refusal, form, grounds, expulsion, close', async () => {
    await openRegister({ R: 1, bonds: ['danny', 'leah'], charter: true });
    await wait(1100); await shot('register_tray');
    await sel('line', 0, 1); await wait(250); await shot('register_preview_stamp');
    T.ok(await g.page.evaluate(() => window.__HW.HW.ui.get('register').mode === 'line'), 'line mode with a preview');
    await tap('confirm'); await wait(650); await shot('register_stamp_lands');
    await settle();
    T.eq(await g.page.evaluate(() => window.__model.lines.find((l) => l.id === 'danny').status), 'withdrawn', 'stamp applied through the UI');
    await sel('line', 0, 3); await tap('confirm'); await wait(1100); await shot('register_refusal_ink');
    await settle();
    T.eq(await g.page.evaluate(() => window.__model.lines.find((l) => l.id === 'marcus').status), 'enrolled', 'refusal leaves the line');
    await sel('line', 0, 2); await tap('confirm'); await settle();
    await sel('line', 0, 4); await tap('confirm'); await settle();
    await sel('line', 1, 3); await tap('confirm'); await wait(1000); await shot('register_form_slip');
    await settle(); await shot('register_roll_clear');
    await sel('line', 2, 0); await tap('confirm'); await wait(450);
    T.eq((await st()).mode, 'grounds', 'pen on the founder asks for grounds');
    await g.page.evaluate(() => { window.__HW.HW.ui.get('register').groundSel = 5; });
    await shot('register_grounds');
    await tap('confirm'); await wait(1200); await shot('register_bad_grounds');
    await settle();
    T.eq((await st()).mode, 'grounds', 'bad grounds: refused, back to the rules');
    await g.page.evaluate(() => { window.__HW.HW.ui.get('register').groundSel = 1; });
    await tap('confirm'); await wait(500);
    T.eq((await st()).mode, 'write', 'R2 → hold to write');
    await g.page.evaluate(() => window.__HW.HW.input.setVirtual('confirm', true));
    await wait(2300); await shot('register_writing');
    await wait(2600); await g.page.evaluate(() => window.__HW.HW.input.setVirtual('confirm', false));
    const paused = await g.page.evaluate(() => { const r = window.__HW.HW.ui.get('register'); return { p: r.write?.p, hand: r.write?.handT >= 0 }; });
    T.ok(paused.p > 0.7 && paused.p < 1 && paused.hand, 'past 70 %: the hand is on the desk; releasing only pauses', paused);
    await wait(3000); await shot('register_hand_colonel');
    const stillPaused = await g.page.evaluate(() => window.__HW.HW.ui.get('register').write?.p);
    T.ok(Math.abs(stillPaused - paused.p) < 1e-6, 'no progress (and no death) while released');
    await g.page.evaluate(() => window.__HW.HW.input.setVirtual('confirm', true));
    await wait(2000); await g.page.evaluate(() => window.__HW.HW.input.setVirtual('confirm', false));
    await wait(1500); await shot('register_expelled');
    await settle();
    T.eq(await g.page.evaluate(() => window.__model.founder.status), 'expelled', 'EXPELLED (provisional)');
    await sel('tray', 4); await tap('confirm'); await wait(2600); await shot('register_close_confirm');
    const c = await st();
    T.ok(c.choice, 'Close asks first (summary in Tess\'s voice)');
    // [Not yet.] keeps the book open
    await tap('down'); await tap('confirm'); await wait(500);
    T.ok((await st()).open && (await g.page.evaluate(() => window.__regResult)) === 'pending', '[Not yet.] keeps it open');
    await sel('tray', 4); await tap('confirm'); await wait(2600); await tap('confirm'); await wait(1200);
    T.eq(await g.page.evaluate(() => window.__regResult), null, '[Close it.] closes the book');
    T.eq(await g.page.evaluate(() => window.__model.outcome()), 'dismissed', 'page outcome: dismissed');
  });

  await T.step('Register UI: way-out confirm, no Charter, Start over', async () => {
    await openRegister({ R: 3, bonds: [], charter: false });
    await wait(1000); await shot('register_all_ink');
    await sel('line', 1, 2); await tap('confirm'); await wait(2800);
    T.ok((await st()).choice, '"That\'s my way out. Use it on Leah?"');
    await shot('register_way_out');
    await tap('confirm'); await wait(900); await settle();
    T.eq(await g.page.evaluate(() => window.__model.formOn), 'leah', '[Yes] → the form goes on Leah');
    await sel('line', 2, 0); await tap('confirm'); await wait(2400); await shot('register_no_charter');
    await settle();
    await sel('tray', 3); await tap('confirm'); await wait(300); await settle();
    T.ok(await g.page.evaluate(() => !window.__model.dirty && window.__model.formOn === null), 'Start over wipes the provisional page');
    await shot('register_start_over');
    await g.page.evaluate(() => window.__HW.HW.ui.close('register'));
    await wait(500);
  });

  await T.step('write meter', async () => {
    const r = await g.hw(async (H) => {
      const HW = H.HW;
      const prog = [];
      const p = HW.ui.open('write', { label: 'Keep writing', seconds: 1.2, letters: 'HALLOWELL', onProgress: (x) => prog.push(x) });
      await H.steps(10);
      const idle = prog.length;
      HW.input.setVirtual('confirm', true);
      await H.steps(40);
      HW.input.setVirtual('confirm', false);
      await H.steps(30);
      const mid = prog[prog.length - 1];
      HW.input.setVirtual('confirm', true);
      const res = await Promise.race([p, new Promise((r) => setTimeout(() => r('timeout'), 4000))]);
      HW.input.setVirtual('confirm', false);
      const p2 = HW.ui.open('write', { seconds: 5 });
      await H.steps(5);
      HW.input.setVirtual('confirm', true); await H.steps(10); HW.input.setVirtual('confirm', false);
      await H.steps(3);
      HW.input.tap('cancel');
      const res2 = await Promise.race([p2, new Promise((r) => setTimeout(() => r('timeout'), 3000))]);
      return { idle, mid, res, res2, last: prog[prog.length - 1] };
    });
    T.ok(r.idle === 0 && r.mid > 0.3 && r.mid < 0.9, 'progress only while holding; paused on release', r);
    T.ok(r.res === 'done' && r.last === 1, "completes → 'done'", r);
    T.eq(r.res2, 'cancelled', "cancel → 'cancelled'");
  });

  await T.step('VHS scrubber', async () => {
    const r = await g.hw(async (H) => {
      const HW = H.HW;
      const seen = [];
      window.__vhs = HW.ui.open('vhs', { onFrame: (i) => seen.push(i) });
      await H.steps(30);
      return { seen: seen.slice() };
    });
    T.eq(r.seen, [0], 'opens on frame 0 (the lobby group shot)');
    await wait(400); await shot('vhs_group');
    for (let i = 0; i < 5; i++) { await tap('right'); await wait(i === 0 ? 60 : 500); if (i === 0) await shot('vhs_seek'); }
    await wait(600); await shot('vhs_face');
    await tap('right'); await wait(300);
    await tap('confirm'); await wait(500);
    await tap('cancel');
    const res = await g.page.evaluate(() => window.__vhs);
    T.ok(res && res.frame === 5 && res.held > 0.5, 'scrubbed to the face, held on it, ejected', res);
  });

  await T.step('referral slips', async () => {
    for (const reason of ['out_of_seat', 'running', 'present', 'woke', 'caught']) {
      await g.page.evaluate((x) => { window.__go = window.__HW.HW.ui.open('gameover', { reason: x }); }, reason);
      await wait(3600);
      await shot(`gameover_${reason}`);
      await tap('confirm'); await wait(800);
      T.eq(await g.page.evaluate(() => window.__go), 'retry', `gameover '${reason}' → retry`);
    }
    const map = await g.hw(async () => {
      const m = await import('/src/ui/screens/gameover.js');
      return ['hall_after_bell', 'out_of_seat', 'running', 'breath', 'chase', 'woke', 'present', 'caught', 'Something odd happened', 'zzz'].map((r) => { const x = m.referralFor(r); return x.present ? 'PRESENT' : `${x.infraction} / ${x.by}`; });
    });
    T.eq(map, [
      'In hall after bell (Rule 1) / colonel', 'Out of seat during class (Rule 2) / colonel', 'Running in the halls (Rule 3) / kevin',
      'Disrupting attendance / colonel', 'Leaving before dismissal (Rule 6) / colonel', 'Disturbing the Founder / colonel', 'PRESENT',
      'Out of seat during class (Rule 2) / colonel', 'Something odd happened / colonel', 'Conduct unbecoming a pupil / colonel',
    ], 'reasons → infraction text (with fallbacks)');
    const quit = await g.hw(async (H) => {
      const p = H.HW.ui.open('gameover', { reason: 'chase' });
      await H.steps(200);
      H.HW.input.tap('down'); await H.steps(3); H.HW.input.tap('confirm');
      return Promise.race([p, new Promise((r) => setTimeout(() => r('timeout'), 3000))]);
    });
    T.eq(quit, 'title', "second option → 'title'");
  });

  await T.step('no errors', async () => {
    T.eq(await g.errors(), [], 'no captured errors');
  });
} catch (e) {
  T.ok(false, 'meta suite crashed', e?.stack || String(e));
} finally {
  await g?.close();
  await browser.close();
}
console.log(`screenshots: ${SHOTS}/meta_*.png`);
process.exit(T.done() ? 0 : 1);
