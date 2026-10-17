// Endings — the Register's rules and the ending resolution (DESIGN §8, CONTENT §5.9).
//
// The Register is a *model* the UI drives (TECH §16 'register'): it lists the 1996 page, previews what
// each tool would do (Tess's prediction), applies tools provisionally, answers refusals in Tess's voice,
// and only writes the night's outcome into HW.state when the book is closed (commit()).
//
// Rules, verbatim from DESIGN §8 (R = rollAnswered):
//   ink(id) = id==='tess' ? (R>=2 ? 'ink' : 'pencil') : (bonds[id] ? 'pencil' : 'ink')
//   stamp(id)        ok iff listed(id) && ink(id)==='pencil' && !withdrawn(id)   (auto keepsake; Tess → house key)
//   form(id)         ok iff !formUsed && !withdrawn(id) && ink(id)==='ink'       (one use; Reason written by Tess)
//   pen('founder')   ok iff has(red_pen) && has(charter) && every listed line withdrawn && grounds ∈ {R1, R2, R3}
//   resolveEnding(): truant → 'truant'; expelled → 'dismissed'; (R>=1 && !withdrawn.tess) → 'present'; else 'withdrawn'
//
// The module is pure apart from reading HW.state by default (and emitting 'flag' events on commit), so
// the rules can be unit-tested in node (tests/meta.mjs).
import HW from '../engine/hw.js';

export const FRIENDS = ['danny', 'leah', 'marcus'];
/** Page order of the 1996 lines (Tess last, and only when she has answered a roll). */
export const LINE_ORDER = ['danny', 'leah', 'marcus', 'tess'];
export const FOUNDER = 'founder';

/** Everything the Register knows about each pupil on the 1996 page. */
export const PUPILS = {
  danny: {
    name: 'KOVACH, DANIEL', short: 'Danny', poss: 'His', keepsake: 'danny_flashlight', keepsakeName: "Danny's flashlight",
    stampLine: "He'll say I broke it. He's gonna want it back so he can say I broke it.", stampExpr: 'sad',
    reason: 'he has somewhere to be.', voice: '...Dolan?',
  },
  leah: {
    name: 'BRANDT, LEAH', short: 'Leah', poss: 'Her', keepsake: 'camcorder', keepsakeName: 'the camcorder',
    stampLine: 'Leah Brandt, for STATIC. {p} ...Still recording.', stampExpr: 'sad',
    reason: 'she was right. I should have said.', voice: 'T?',
  },
  marcus: {
    name: 'WEBB, MARCUS', short: 'Marcus', poss: 'His', keepsake: 'denise_photo', keepsakeName: "Denise's photo",
    stampLine: "Grandma Ivy's handwriting. Somebody's still waiting up. {p} Not for Denise. For him.", stampExpr: 'sad',
    reason: "somebody's still setting a plate.", voice: 'Tess?',
  },
  tess: {
    name: 'DOLAN, THERESA', short: 'I', poss: 'My', keepsake: 'house_key', keepsakeName: 'our house key',
    stampLine: 'Dolan. Kettle Run. {p} For now.', stampExpr: 'neutral',
    reason: "moving to Philadelphia. I'm sorry I didn't say.", voice: null,
  },
};

export const FOUNDER_NAME = 'HALLOWELL, CYRUS — FIRST PUPIL';

/** Expulsion grounds: the school's own rules (DESIGN §4). Only what Tess has seen him break counts. */
export const GROUNDS = [
  { id: 'R1', rule: 'No student may be in the halls when the bell rings.', valid: true, phrase: 'in the halls during the bell' },
  { id: 'R2', rule: 'Students will be seated and quiet during class.', valid: true, phrase: 'out of his seat' },
  { id: 'R3', rule: 'No running in the halls.', valid: true, phrase: 'running in the halls' },
  { id: 'R4', rule: 'Hall passes are required.', valid: false },
  { id: 'R5', rule: 'Attendance is mandatory.', valid: false },
  { id: 'R6', rule: 'No student may leave before dismissal.', valid: false },
];
const VALID_GROUNDS = new Set(GROUNDS.filter((g) => g.valid).map((g) => g.id));

/** Hold-to-write time for the expulsion (DESIGN §8: 6 s; assist adds 30 %). */
export const EXPEL_SECONDS = 6;
export const expulsionText = (phrase) => `HALLOWELL, CYRUS — EXPELLED — ${phrase}. Reported by T. Dolan.`;

// Tess's lines (DESIGN §8 where given verbatim; the rest written to match).
export const LINES = {
  formOnPencil: (id) => `${PUPILS[id].poss} name's only in pencil. The stamp'll take. I'm not wasting Mom's signature.`,
  formOnFounder: 'Transfer him where? Nobody would take him.',
  stampOnInk: 'It beads up like water on wax. Real ink.',
  stampOnFounder: 'Red ink. Nothing takes on it.',
  penNotClear: 'Not yet. Clear the roll first.',
  penNoCharter: 'Expel him? On what grounds? {p} ...The Charter. Adair said the Charter.',
  penBadGrounds: 'He never did that. {p} Not that I saw.',
  penOnPupil: 'Not their names. Not in red.',
  penOnTess: 'Not my name. Not in red.',
  formUsed: 'I only had the one form.',
  already: (id) => (id === 'tess' ? "I'm already off it." : `${PUPILS[id].short}'s already off it.`),
  expelledAlready: "It's done. It's written.",
  noTool: "I don't have that anymore.",
  wayOut: (id) => `That's my way out. {p} Use it on ${PUPILS[id].short}?`,
  startOver: 'Okay. {p} Think.',
  nothingToUndo: "I haven't done anything yet.",
  reason: (id) => `Reason: ${PUPILS[id].reason}`,
};

const has = (s, item) => ((s?.inv?.[item]) || 0) > 0;
const flags = (s) => s?.flags || {};

/** rollAnswered (0..3), from the mirror field or the three roll flags. */
export function rollAnswered(s = HW.state) {
  if (Number.isFinite(s?.rollAnswered)) return s.rollAnswered;
  const f = flags(s);
  return ['roll1_answered', 'roll2_answered', 'roll3_answered'].filter((k) => f[k]).length;
}
export const bonded = (s, id) => !!(s?.bonds?.[id] || flags(s)[`bond_${id}`]);
/** Is the pupil written on the 1996 page? Friends always; Tess only once she has answered (DESIGN §8). */
export const listed = (s, id) => (id === 'tess' ? rollAnswered(s) >= 1 : FRIENDS.includes(id));
/** 'pencil' | 'ink' — DESIGN §8 ink(). */
export function inkOf(s, id) {
  if (id === 'tess') return rollAnswered(s) >= 2 ? 'ink' : 'pencil';
  return bonded(s, id) ? 'pencil' : 'ink';
}

/**
 * Ending id from committed state: 'truant' | 'dismissed' | 'present' | 'withdrawn' (DESIGN §8).
 * Truant is decided before the Register (the coal chute): flag `truant` or ending 'truant'.
 */
export function resolveEnding(s = HW.state) {
  const f = flags(s);
  if (f.truant || f.ending === 'truant') return 'truant';
  if (f.expelled) return 'dismissed';
  if (rollAnswered(s) >= 1 && !f.withdrawn_tess) return 'present';
  return 'withdrawn';
}

/** Friends withdrawn (committed state), in page order. */
export const savedFriends = (s = HW.state) => FRIENDS.filter((id) => flags(s)[`withdrawn_${id}`]);

const ok = (extra) => ({ ok: true, say: [], ...extra });
const refuse = (text, expr = 'worried') => ({ ok: false, kind: 'refuse', say: [['think', expr, text]] });

/**
 * Build the Register model for the UI (TECH §16 + DESIGN §8). `state` defaults to HW.state.
 * Model API:
 *   title, founder { id, name, status: 'enrolled'|'expelled', grounds }, lines [{ id, name, ink, status, by, reason, keepsake }]
 *   tools [{ id, label, available, comment, unavailableText }], grounds (GROUNDS)
 *   preview(tool, line)            → { text, ok } Tess's prediction (no side effects)
 *   apply(tool, line, opts)        → Promise<result>; act() is the synchronous version
 *       opts: { confirmed } (form on a friend while Tess is in ink), { grounds, written } (the pen)
 *       result: { ok, kind, say: [[who|'think'|'narrate', expr, text]], need?: 'confirm'|'grounds'|'write',
 *                 prompt?, options?, write?: { seconds, text }, voice?: { who, text }, reason?, keepsake? }
 *   startOver() → { say } · dirty · actions · closeSummary() → { lines, prompt, options }
 *   outcome() → the ending the current (provisional) page would give
 *   commit(state?) → { ending } — writes withdrawn_*, form_used_on (+ form_used), expelled, register_done, ending
 *   refresh() → model
 */
export function buildRegisterModel(state = HW.state, opts = {}) {
  const s = state || { flags: {}, inv: {}, bonds: {} };
  const R = rollAnswered(s);
  const f0 = flags(s);
  const assist = Number(s.assist) > 1 ? s.assist : 1;
  // Provisional page state. Starts from whatever is already committed (normally nothing).
  const fresh = () => {
    const w = {};
    for (const id of LINE_ORDER) w[id] = f0[`withdrawn_${id}`] ? (f0.form_used_on === id ? 'form' : 'stamp') : null;
    return { withdrawn: w, formOn: f0.form_used_on || null, expelled: !!f0.expelled, grounds: f0.expel_grounds || null, actions: [] };
  };
  let P = fresh();

  const ids = () => LINE_ORDER.filter((id) => listed(s, id));
  const withdrawn = (id) => !!P.withdrawn[id];
  const rollClear = () => ids().every(withdrawn);
  const formUsed = () => !!P.formOn;
  const tessInk = () => listed(s, 'tess') && inkOf(s, 'tess') === 'ink' && !withdrawn('tess');
  const who = (id) => (id === 'tess' ? 'I' : PUPILS[id].short);
  const isLine = (id) => ids().includes(id);

  function preview(tool, id) {
    if (tool === 'stamp') {
      if (id === FOUNDER) return { ok: false, text: "Red ink. Nothing'll take on that." };
      if (withdrawn(id)) return { ok: false, text: LINES.already(id) };
      const ink = inkOf(s, id);
      if (!has(s, 'withdrawn_stamp')) return { ok: false, text: LINES.noTool };
      if (ink === 'pencil') return { ok: true, text: id === 'tess' ? "I'm in pencil. The stamp'll take." : `${who(id)}'s in pencil. The stamp'll take.` };
      return { ok: false, text: id === 'tess' ? "I'm in ink. It won't take." : `${who(id)}'s in ink. It won't take.` };
    }
    if (tool === 'form') {
      if (id === FOUNDER) return { ok: false, text: 'Transfer him? Where?' };
      if (withdrawn(id)) return { ok: false, text: LINES.already(id) };
      if (formUsed()) return { ok: false, text: "The form's gone. I only had the one." };
      if (!has(s, 'transfer_form')) return { ok: false, text: LINES.noTool };
      if (inkOf(s, id) === 'pencil') return { ok: false, text: id === 'tess' ? "I'm only in pencil. The stamp would do it." : `Only pencil. The stamp would do it.` };
      if (id === 'tess') return { ok: true, text: "That's me. In ink. Mom already signed it." };
      if (tessInk()) return { ok: true, text: `${who(id)}'s in ink. So am I. {p} One form.` };
      return { ok: true, text: `${who(id)}'s in ink. Only the form'll do it.` };
    }
    if (tool === 'pen') {
      if (id !== FOUNDER) return { ok: false, text: id === 'tess' ? LINES.penOnTess : LINES.penOnPupil };
      if (P.expelled) return { ok: false, text: LINES.expelledAlready };
      if (!has(s, 'red_pen')) return { ok: false, text: LINES.noTool };
      if (!has(s, 'charter')) return { ok: false, text: 'Expel him? On what grounds?' };
      if (!rollClear()) return { ok: false, text: "Not while anyone's still on the roll." };
      return { ok: true, text: 'He enrolled himself. He can be expelled like anyone.' };
    }
    return { ok: false, text: '' };
  }

  function act(tool, id, o = {}) {
    if (tool === 'stamp') {
      if (!has(s, 'withdrawn_stamp')) return refuse(LINES.noTool);
      if (id === FOUNDER) return refuse(LINES.stampOnFounder);
      if (!isLine(id)) return refuse('Nothing there to stamp.');
      if (withdrawn(id)) return refuse(LINES.already(id), 'neutral');
      if (inkOf(s, id) !== 'pencil') return refuse(LINES.stampOnInk);
      const p = PUPILS[id];
      if (!has(s, p.keepsake)) console.warn(`[endings] keepsake '${p.keepsake}' for ${id} missing — treating it as present`);
      P.withdrawn[id] = 'stamp';
      P.actions.push({ tool, id });
      return ok({
        kind: 'stamp', keepsake: p.keepsake, keepsakeName: p.keepsakeName,
        voice: p.voice ? { who: id, text: p.voice } : null,
        say: [['think', p.stampExpr, p.stampLine]],
      });
    }
    if (tool === 'form') {
      if (id === FOUNDER) return refuse(LINES.formOnFounder);
      if (!isLine(id)) return refuse('Nothing there to sign over.');
      if (withdrawn(id)) return refuse(LINES.already(id), 'neutral');
      if (formUsed() || !has(s, 'transfer_form')) return refuse(LINES.formUsed);
      if (inkOf(s, id) !== 'ink') return refuse(LINES.formOnPencil(id), 'neutral');
      if (id !== 'tess' && tessInk() && !o.confirmed) {
        return { ok: false, kind: 'ask', need: 'confirm', prompt: LINES.wayOut(id), options: ['Yes', 'No'], say: [] };
      }
      const p = PUPILS[id];
      P.withdrawn[id] = 'form';
      P.formOn = id;
      P.actions.push({ tool, id });
      return ok({
        kind: 'form', reason: LINES.reason(id),
        voice: p.voice ? { who: id, text: p.voice } : null,
        say: [['think', id === 'tess' ? 'sad' : 'neutral', LINES.reason(id)]],
      });
    }
    if (tool === 'pen') {
      if (!has(s, 'red_pen')) return refuse(LINES.noTool);
      if (id !== FOUNDER) return refuse(id === 'tess' ? LINES.penOnTess : LINES.penOnPupil, 'neutral');
      if (P.expelled) return refuse(LINES.expelledAlready, 'neutral');
      // Honest order: without the Charter there are no grounds at all, so say that first.
      if (!has(s, 'charter')) return refuse(LINES.penNoCharter);
      if (!rollClear()) return refuse(LINES.penNotClear);
      if (!o.grounds) return { ok: false, kind: 'ask', need: 'grounds', prompt: 'On what grounds?', options: GROUNDS.map((g) => g.id), say: [] };
      const g = GROUNDS.find((x) => x.id === o.grounds);
      if (!g || !VALID_GROUNDS.has(g.id)) return { ...refuse(LINES.penBadGrounds), need: 'grounds' };
      if (!o.written) {
        return { ok: false, kind: 'ask', need: 'write', grounds: g.id, write: { seconds: EXPEL_SECONDS * assist, text: expulsionText(g.phrase), letters: 'HALLOWELL' }, say: [] };
      }
      P.expelled = true;
      P.grounds = g.id;
      P.actions.push({ tool, id, grounds: g.id });
      return ok({ kind: 'expel', grounds: g.id, text: expulsionText(g.phrase) });
    }
    return refuse("I can't do anything with that.");
  }

  /** The page as it stands (provisional). */
  const lines = () => ids().map((id) => ({
    id, name: PUPILS[id].name, ink: inkOf(s, id),
    status: withdrawn(id) ? 'withdrawn' : 'enrolled',
    by: P.withdrawn[id],
    reason: P.withdrawn[id] === 'form' ? LINES.reason(id) : null,
    keepsake: P.withdrawn[id] === 'stamp' ? PUPILS[id].keepsakeName : null,
  }));

  const tools = () => [
    { id: 'stamp', label: 'Stamp', available: has(s, 'withdrawn_stamp'),
      comment: "WITHDRAWN. Like a transfer. It only takes on pencil.", unavailableText: "I don't have the stamp." },
    { id: 'form', label: 'Transfer form', available: has(s, 'transfer_form') && !formUsed(),
      comment: "Mom already signed it. I'd just have to write a name.",
      unavailableText: formUsed() ? `The form's on ${P.formOn === 'tess' ? 'my' : `${PUPILS[P.formOn].short}'s`} line now. I only had the one.` : "I don't have it." },
    { id: 'pen', label: 'Red pen', available: has(s, 'red_pen'),
      comment: has(s, 'charter') ? "Miss Adair's red pen. He enrolled himself. He can be expelled like anyone." : "Miss Adair's red pen. It still writes.",
      unavailableText: "I don't have a pen." },
  ];

  function closeSummary() {
    const out = [];
    for (const id of ids()) {
      if (withdrawn(id)) continue;
      const ink = inkOf(s, id);
      out.push(id === 'tess' ? `I'm still on it. In ${ink}.` : `${who(id)}'s still there. In ${ink}.`);
    }
    if (!P.expelled) out.push(out.length ? 'And him. At the top, in red.' : "Everybody's off it. {p} Except him.");
    else if (!out.length) out.push("That's everyone. {p} Even him.");
    const prompt = `${out.join(' {p} ')} {p} Close it?`;
    return { lines: out, prompt, options: ['Close it.', 'Not yet.'] };
  }

  function view() {
    // A state-shaped object for resolveEnding() over the provisional page.
    const fl = { ...f0, expelled: P.expelled };
    for (const id of LINE_ORDER) fl[`withdrawn_${id}`] = !!P.withdrawn[id];
    return { ...s, flags: fl };
  }

  const model = {
    page: '1996',
    title: 'REGISTER OF PUPILS',
    grounds: GROUNDS,
    rollAnswered: R,
    get founder() { return { id: FOUNDER, name: FOUNDER_NAME, status: P.expelled ? 'expelled' : 'enrolled', grounds: P.grounds, ink: 'red' }; },
    get lines() { return lines(); },
    get tools() { return tools(); },
    get actions() { return P.actions.slice(); },
    get dirty() { return P.actions.length > 0; },
    get formOn() { return P.formOn; },
    preview,
    act,
    apply: async (tool, id, o) => act(tool, id, o),
    startOver() {
      const had = P.actions.length > 0;
      P = fresh();
      return { ok: had, say: [['think', 'neutral', had ? LINES.startOver : LINES.nothingToUndo]] };
    },
    closeSummary,
    outcome: () => resolveEnding(view()),
    /** Write the page into the state's flags (Close the Book). */
    commit(target = s) {
      const fl = target.flags || (target.flags = {});
      const set = (k, v) => {
        fl[k] = v;
        if (target === HW.state) HW.game?.emit?.('flag', k, v);
      };
      for (const id of LINE_ORDER) set(`withdrawn_${id}`, !!P.withdrawn[id]);
      if (P.formOn) { set('form_used_on', P.formOn); set('form_used', true); }
      set('expelled', !!P.expelled);
      if (P.expelled) set('expel_grounds', P.grounds);
      set('register_done', true);
      const ending = resolveEnding(target);
      set('ending', ending);
      return { ending, saved: savedFriends(target) };
    },
    refresh() { return model; },
  };
  if (opts.debug) model._P = () => P;
  return model;
}

export default { buildRegisterModel, resolveEnding, inkOf, listed, savedFriends, GROUNDS, PUPILS };
