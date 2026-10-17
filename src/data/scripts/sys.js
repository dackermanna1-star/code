// System scripts (CONTENT §3, owner: systems): the PA console and roll call #1, Haupt's safe, the
// ROLLCALL terminal, the Register, a generic catch, and the VHS scrubber helper.
//
//   sys.pa        PA console (west1 office, Ch4). LISTEN plays PA_LISTEN; ALL CALL (roll call #1) fires
//                 after the 3rd listen, 45 s at the console, or when the console is closed → runs
//                 'ch4.roll1' if the narrative defines it, else sys.roll1 (PA_ALL_CALL, lamps on the console).
//   sys.roll1     the default roll call #1 (callable by narrative scripts too).
//   sys.safe      Haupt's safe (SAFE): wrong-try lines, third-wrong hint; on success sets `safe_open` and
//                 runs 'ch6.safe_open' (else gives the stamp, the key and Haupt's letter).
//   sys.terminal  ROLLCALL.BAS (TERMINAL): only while the lab has power (a period); HALLOWELL → printer battery once.
//   sys.register  the Register (game/endings.js model → 'register' screen) → commit → checkpoint → 'ch8.after_register'.
//   sys.caught    generic catch beat → game over (ctx.reason).
//   sys.vhs       Leah's tape in the 'vhs' scrubber (ctx.args forwarded).
import HW from '../../engine/hw.js';
import { PA_ROOMS, PA_LISTEN, PA_ALL_CALL, SAFE, TERMINAL } from '../puzzles.js';
import { buildRegisterModel, PUPILS } from '../../game/endings.js';
import { chimeRate } from '../../game/chapters.js';

const has = (id) => !!HW.scripts?.has?.(id);
const pa = () => HW.ui?.get?.('pa') || null;

// ---- PA console ------------------------------------------------------------------------------------------
/** Tess's face for each room's afterthought. */
const LISTEN_EXPR = { '101': 'scared', '205': 'worried', LIB: 'sad', GYM: 'scared', AUD: 'worried', OFFICE: 'terrified', BSMT: 'worried', '201': 'suspicious' };

/** Play one LISTEN: narration lines with their sfx, an ambience bed layered quietly under, Tess's reaction. */
async function playListen(g, id) {
  const L = PA_LISTEN[id] || { lines: [{ text: 'Static.' }] };
  const layers = [];
  try {
    for (const line of L.lines) {
      if (line.loop && !layers.includes(line.loop)) { HW.audio?.layer?.(line.loop, true, 0.6); layers.push(line.loop); }
      if (line.sfx) g.sfx(line.sfx, { vol: 0.7 });
      if (line.text) await g.narrate(line.text);
      else await g.wait(0.8);
    }
  } finally {
    for (const l of layers) HW.audio?.layer?.(l, false, 0.8);
  }
  if (L.think) await g.think(LISTEN_EXPR[id] || 'worried', L.think);
}

/** One beat of the ALL CALL (PA_ALL_CALL shapes; see puzzles.js). */
async function rollBeat(g, b) {
  if (b.beat) { await g.narrate(b.beat); return; }
  if (b.sfx) g.sfx(b.sfx, b.sfx === 'intercom_chime' ? { rate: chimeRate(g.state.chapter) } : { vol: 0.8 });
  if (!b.who) {
    if (b.text) await g.narrate(b.text);
    else await g.wait(1.1);
    return;
  }
  if (b.who === 'voice') { await g.say('voice', null, b.text, { name: '???' }); return; }
  if (b.via === 'intercom') {
    // the friend's own faint reply through the speaker; that room's lamp lights as they answer
    if (b.lamp) {
      const p = pa();
      if (p?.setLamp) p.setLamp(b.lamp, true);
      else p?.setRoom?.(b.lamp);
      g.sfx('flashlight_click', { vol: 0.5 });
    }
    await g.say('voice', null, b.text, { name: PUPILS[b.who]?.short || b.who });
    return;
  }
  await g.say(b.who, b.who === 'marcus' ? 'urgent' : 'neutral', b.text);
}

/** Default roll call #1 (DESIGN §6 IV.3). Sets roll1_done / roll1_answered, checkpoints after the choice. */
async function rollCall1(g) {
  const A = PA_ALL_CALL;
  g.seen('roll1');
  pa()?.setLocked?.(true);
  pa()?.setMode?.('allcall');
  for (const b of A.start) await rollBeat(g, b);
  for (const b of A.roll) await rollBeat(g, b);
  await rollBeat(g, A.tess.call);
  const c = await g.choice(A.tess.choices);
  if (c === 0) {
    g.set('roll1_answered');
    for (const b of A.tess.here) await rollBeat(g, b);
  } else {
    for (const b of A.tess.silent) await rollBeat(g, b);
  }
  g.set('roll1_done');
  pa()?.setMode?.('listen');
  pa()?.setLocked?.(false);
  // Notes (DESIGN IV.3): where the two answers came from.
  g.set('roll1_note', A.note);
  g.objective(A.note);
}

// ---- Register --------------------------------------------------------------------------------------------
/** The friend's real voice far above as their name lifts off the page (DESIGN §6 VIII.5). */
async function withdrawVoice(g, id, tool, text) {
  if (!text) return;
  if (has('ch8.register_voice')) { await g.run('ch8.register_voice', { id, tool, text }); return; }
  g.sfx('husk_rustle', { vol: 0.25 });
  await g.narrate(`{dim}Far above, through the stone:{/dim} {p} ${text}`);
}

/** Fallback for a missing 'ch8.after_register': two seconds of nothing, then the bell or the scream. */
async function afterRegisterDefault(g, ending) {
  g.silence(true, 0.2);
  await g.wait(2);
  g.silence(false, 0.6);
  if (ending === 'dismissed') {
    g.sfx('school_bell', { dur: 9 });
    await g.wait(2);
  } else if (ending === 'withdrawn') {
    g.sfx('stinger_hard');
    await g.say('colonel', 'wrong', 'WHO IS OUT OF THEIR SEAT.', { light: 'red', shake: 2 });
  } else {
    g.sfx('school_bell', { dur: 2 });
    await g.say('colonel', 'serene', 'Thank you, Theresa.', { light: 'red' });
  }
  await g.ending(ending);
}

export default {
  'sys.pa': async (g, ctx) => {
    const due = () => !g.flag('roll1_done');
    if (due()) g.checkpoint('pa console');
    const S = { listens: 0, opened: HW.time, fired: false, listening: false, closed: false };
    let fire = null;
    const allCall = new Promise((r) => { fire = r; });
    const trigger = (why) => {
      if (S.fired || !due()) return;
      S.fired = true;
      fire(why);
    };
    const onListen = async (room) => {
      if (S.fired) return;
      S.listening = true;
      try {
        await playListen(g, room);
        S.listens++;
        g.set('ch4_pa_used');
        if (has('ch4.pa_listen')) await g.run('ch4.pa_listen', { ...ctx, room, count: S.listens });
      } finally {
        S.listening = false;
      }
      if (S.listens >= PA_ALL_CALL.trigger.listens) trigger('listens');
    };
    // 45 s at the console (game time) — never cutting into a listen that's playing.
    if (due()) {
      g.parallel(async (pg) => {
        while (!S.closed && !S.fired) {
          await pg.wait(0.25);
          if (!S.listening && HW.time - S.opened >= PA_ALL_CALL.trigger.seconds) trigger('time');
        }
      });
    }
    let screen = g.screen('pa', { rooms: PA_ROOMS, onListen });
    const first = await Promise.race([screen.then(() => 'closed'), allCall]);
    if (first === 'closed') {
      S.closed = true;
      if (!due()) return;
      trigger('close');
      // Closing it doesn't stop it: the console switches itself to ALL CALL.
      screen = g.screen('pa', { rooms: PA_ROOMS, onListen: async () => {} });
    }
    pa()?.setLocked?.(true); // the console belongs to the roll now
    if (has('ch4.roll1')) await g.run('ch4.roll1', { ...ctx, pa: true });
    else await rollCall1(g);
    if (!g.flag('roll1_done')) g.set('roll1_done');
    S.closed = true;
    HW.ui?.close?.('pa');
    await screen;
    g.checkpoint('roll 1');
    if (!has('ch4.roll1') && has('ch4.hide')) await g.run('ch4.hide', ctx);
  },

  'sys.roll1': async (g) => rollCall1(g),

  'sys.safe': async (g, ctx) => {
    if (g.flag('safe_open')) {
      await g.think('neutral', "It's open. I took what was in it.");
      return;
    }
    let last = [0, 0, 0];
    const [A, B, C] = SAFE.combo;
    const opened = await g.screen('safe', {
      label: SAFE.label,
      check: (a, b, c) => {
        last = [a, b, c];
        return a === A && b === B && c === C;
      },
      onWrong: async (tries) => {
        g.set('safe_tries', tries);
        await g.think(tries >= 3 ? 'determined' : 'worried', SAFE.wrongLine(last[0], last[1], last[2], tries));
      },
    });
    if (!opened) return;
    g.set('safe_open');
    if (has('ch6.safe_open')) { await g.run('ch6.safe_open', ctx); return; }
    // Fallback so the game stays completable without the chapter script.
    await g.narrate('Inside: a rubber stamp on an ink pad, a long brass key, and an envelope.');
    g.give('withdrawn_stamp');
    g.give('aud_key');
    await g.doc('haupt_letter');
    g.checkpoint('safe');
  },

  'sys.terminal': async (g, ctx) => {
    const powered = !!HW.periods?.active || ctx?.prop?.state === 'on';
    if (!powered) {
      await g.narrate('The screen is dead.');
      return;
    }
    let printed = false;
    g.sfx('trs80_beep', { vol: 0.5 });
    await g.screen('terminal', {
      boot: [...TERMINAL.boot, '', TERMINAL.prompt],
      handle: async (input) => {
        const out = TERMINAL.respond(input, HW.state);
        const cmd = String(input || '').toUpperCase().replace(/[.,\s]+$/, '').trim();
        if (cmd.split(',')[0].trim().split(' ')[0] === 'HALLOWELL' && !g.flag('terminal_battery')) {
          g.set('terminal_battery');
          printed = true;
          g.sfx('typewriter_key', { vol: 0.6 });
          out.push('', 'PRINTING... 1 PAGE.', 'PRINTER: PAPER LOW - CHECK TRAY.');
        }
        return [...out, '', TERMINAL.prompt];
      },
    });
    if (printed) {
      await g.narrate('The printer coughs out one page. Under it, in the paper tray, somebody\'s spare D cells.');
      g.give('battery');
    }
  },

  'sys.register': async (g, ctx) => {
    if (g.flag('register_done')) {
      await g.think('neutral', "It's closed. Whatever's written stays written.");
      return;
    }
    g.seen('register');
    const model = buildRegisterModel(HW.state);
    const res = await g.screen('register', {
      model,
      onWithdraw: (id, tool, text) => withdrawVoice(g, id, tool, text),
    });
    // Automated tests drive the page through a forced screen answer: { actions: [[tool, line, opts], ...] }.
    if (res && Array.isArray(res.actions)) for (const [tool, id, o] of res.actions) model.act(tool, id, o || {});
    const { ending } = model.commit(HW.state);
    g.checkpoint('register closed');
    if (has('ch8.after_register')) await g.run('ch8.after_register', { ...ctx, ending });
    else await afterRegisterDefault(g, ending);
  },

  'sys.caught': async (g, ctx) => {
    const reason = ctx?.reason || 'caught';
    g.sfx('colonel_grab');
    g.shake(3, 0.35);
    g.flash('#000', 0.25);
    await g.wait(0.5);
    await g.gameOver(reason);
  },

  'sys.vhs': async (g, ctx) => {
    g.sfx('tape_play', { vol: 0.6 });
    return g.screen('vhs', ctx?.args || {});
  },
};
