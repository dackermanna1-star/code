// CHAPTER IV — Attendance (west1 office suite). DESIGN §6 IV · CONTENT §3 · owner: narrative-2.
//
//   ch4.start         the chapter opens in the cafeteria after the guided period: the office, keys in hand.
//   ch4.office_enter  trigger office_first (reception, every entry from Ch4 on): first time sets
//                     `office_open` and a beat; afterwards it only resumes ch4.hide after a reload.
//   ch4.signout       the sign-out sheet: Marcus reads it ("That's Grandma's handwriting." · "Time out's
//                     blank."), shows Tess the photo. Then Kevin, through the reception glass (ch4.kevin).
//   ch4.mailbox       Adair's pigeonhole (doc adair_mailbox).   ch4.jar   BROOD II — 1979 — MR. LUTZ.
//   ch4.kevin         a dying tube far down the hall; a small figure with an orange belt; gone.
//   ch4.pa_listen     sys.pa hook after each LISTEN (ctx { room, count }): Marcus, once, for 205 / LIB.
//   ch4.roll1         sys.pa hook (ctx { pa: true }): roll call #1 on the console, lamps, the choice.
//   ch4.hide          the standard warning → "Sit. Anywhere." → the bell waits until Tess sits.
//   ch4.period        through the reception glass he pours out of the seam, tubes dying around him;
//                     the door, the coat in the doorway, "hm?", over the counter; he leaves. Dismissal.
//   ch4.end           "Danny's upstairs. Two-oh-five." → g.chapter(5) (+ ch5.start).
import HW from '../../engine/hw.js';
import { chimeRate } from '../../game/chapters.js';

const VOICE = { name: '???' };
const TILE = 16;
const NOTE = 'Danny — 205? Leah — library?';

const ent = (id) => HW.entities?.get(id) || null;
const pa = () => HW.ui?.get?.('pa') || null;
const roomOf = (e) => (e && HW.map ? HW.map.roomAt(e.x, e.y)?.id || null : null);
const center = (p) => ({ x: (p.x + p.w / 2) * TILE, y: (p.y + p.h / 2) * TILE });

/** Tess turns to a direction / entity / anchor, and her beam goes with her (it holds still in cutscenes). */
function look(g, target) {
  g.face('tess', target);
  const p = HW.player;
  if (!p || !HW.flashlight) return;
  const e = typeof target === 'string' ? (HW.entities?.get(target) || HW.map?.anchor(target)) : null;
  HW.flashlight.angle = e ? Math.atan2(e.y - 6 - (p.y - 9), e.x - p.x) : Math.atan2(p.aimY, p.aimX);
}

/** Run a blocking script once nothing else is (sys.pa has to finish closing the console first). */
function runWhenFree(g, id) {
  g.parallel(async (pg) => {
    await HW.game.until(() => !HW.scripts.blocking && HW.game.mode === 'play' && !HW.game.transferring);
    if (pg.alive) HW.scripts.run(id);
  });
}

export default {
  'ch4.start': async (g) => {
    g.seen('ch4_start');
    g.objective('The main office. The intercom.');
  },

  // ------------------------------------------------------------------------------------------ the office
  'ch4.office_enter': async (g) => {
    g.set('office_open');
    // After a reload between the roll call and the period: pick the period back up.
    if (g.flag('roll1_done') && !g.flag('ch4_hide_done')) {
      if (HW.periods?.phase === 'idle') await g.run('ch4.hide');
      return;
    }
    if (g.flag('roll1_done') || g.seen('ch4_office')) return;
    await g.wait(0.3);
    look(g, 'pa_console');
    await g.think('worried', 'The red light. Back past the counter — the P.A. room.');
    g.objective('The P.A. room. Behind the counter.');
  },

  'ch4.signout': async (g) => {
    if (g.seen('ch4_signout')) {
      await g.doc('signout');
      return;
    }
    await g.examine('[n] A clipboard on the counter. STUDENT SIGN-OUT, FRI. OCT. 19, 1979.');
    await g.doc('signout');
    const m = ent('marcus');
    if (m && g.party.has('marcus')) {
      g.face('marcus', 'tess');
      look(g, 'marcus');
      await g.wait(0.6);
      await g.say('marcus', 'neutral', 'Denise Webb. {p} Dentist. {p} Signed I. Webb.');
      await g.wait(0.6);
      await g.say('marcus', 'sad', "That's Grandma's handwriting.");
      await g.wait(1.0);
      await g.say('marcus', 'grief', "Time out's blank.");
      await g.wait(0.8);
      g.sfx('paper_rustle', { vol: 0.6 });
      await g.narrate('He takes a photo from his jacket and holds it in my light. A girl in a band uniform, laughing at somebody off camera.');
      await g.say('tess', 'sad', 'She looks like you.');
      await g.say('marcus', 'soft_smile', 'Grandma says I got her eyes.');
      g.set('ch4_signout_read');
    }
    await g.wait(0.8);
    await g.run('ch4.kevin');
  },

  'ch4.mailbox': async (g) => {
    if (g.seen('ch4_mailbox')) {
      await g.doc('adair_mailbox');
      return;
    }
    await g.examine('[n] Pigeonholes, name strips gone yellow: HAUPT. LUTZ. DOMBROWSKI. ADAIR. Only ADAIR has anything in it.');
    g.sfx('paper_rustle', { vol: 0.5 });
    await g.doc('adair_mailbox');
    await g.think('worried', "'I am begging you.' {p} Whoever R. was, she knew.");
    if (!g.flag('ch4_kevin')) { await g.wait(0.6); await g.run('ch4.kevin'); }
  },

  'ch4.jar': async (g) => {
    if (g.seen('ch4_jar')) {
      await g.examine('[n] BROOD II — 1979 — MR. LUTZ. The shells tick against the glass when I breathe on it.');
      return;
    }
    await g.examine([
      '[n] Gauze, iodine, a box of tongue depressors. And a specimen jar, labeled in careful capitals: BROOD II — 1979 — MR. LUTZ.',
      '[n] Cicada shells. Dozens, split down the back, dry as paper.',
    ]);
    await g.think('worried', 'Seventeen years in the ground, Leah said.');
  },

  /** Kevin through the reception glass: for a moment; gone on a second look. */
  'ch4.kevin': async (g) => {
    if (g.flag('ch4_kevin') || g.flag('roll1_done')) return;
    g.set('ch4_kevin');
    g.seen('ch4_kevin');
    const at = HW.map?.anchor('kevin_glass');
    if (!at || !HW.patrol) return;
    HW.patrol.spawn('kevin', { at: 'kevin_glass', dir: 'right', whistle: false });
    const tube = HW.lighting?.addLight?.({ type: 'fluor', x: Math.floor(at.x / TILE), y: Math.floor(at.y / TILE) - 1, map: 'west1', flicker: true, intensity: 0.8, fade: 0.05 }) || null;
    g.sfx('squeak', { x: at.x, y: at.y, vol: 0.7 });
    look(g, 'up');
    await g.cam([28, 15], { time: 1.4 });
    await g.wait(1.7);
    if (tube) tube.on = false;
    g.sfx('fluor_off', { x: at.x, y: at.y - 16 });
    await g.wait(0.9);
    HW.patrol.despawn('kevin');
    if (tube) tube.on = true;
    g.sfx('fluor_on', { x: at.x, y: at.y - 16, vol: 0.6 });
    await g.wait(1.3);
    if (tube) { tube.on = false; HW.lighting?.removeLight?.(tube); }
    await g.cam(null, { time: 0.9 });
    await g.think('scared', 'Orange belt. {p} Same as before Danny.');
  },

  // ------------------------------------------------------------------------------------------ the console
  'ch4.pa_listen': async (g, ctx) => {
    const room = ctx?.room;
    if (!g.party.has('marcus')) return;
    if (room === '205' && !g.flag('ch4_listen_205')) {
      g.set('ch4_listen_205');
      await g.say('marcus', 'thoughtful', "Sounds like detention. {p} He's had practice.");
    } else if (room === 'LIB' && !g.flag('ch4_listen_lib')) {
      g.set('ch4_listen_lib');
      await g.say('marcus', 'relieved', "She's alive, Tess.");
    }
  },

  /** Roll call #1 (DESIGN §6 IV.3), while the console is open. sys.pa closes it and checkpoints 'roll 1'. */
  'ch4.roll1': async (g) => {
    g.seen('roll1');
    g.music(null, 1.5);   // no drone under the school's voice (DESIGN §14); the period hooks bring it back
    const lamp = (id) => {
      const p = pa();
      if (p?.setLamp) p.setLamp(id, true);
      else p?.setRoom?.(id);
      g.sfx('flashlight_click', { vol: 0.5 });
    };
    pa()?.setLocked?.(true);
    pa()?.setMode?.('allcall');
    g.sfx('intercom_crackle');
    await g.narrate('Every switch on the console drops at once. The ALL CALL key goes down by itself.');
    g.sfx('intercom_chime', { rate: chimeRate(g.state.chapter) });
    await g.wait(2.4);
    await g.say('voice', null, 'Daniel Kovach.', VOICE);
    await g.wait(1.6);
    lamp('205');
    await g.say('voice', null, '{dim}...present.{/dim}', { name: 'Danny' });
    await g.wait(0.8);
    await g.say('voice', null, 'Leah Brandt.', VOICE);
    await g.wait(1.8);
    lamp('LIB');
    await g.say('voice', null, '{dim}...{p=0.6}present.{/dim}', { name: 'Leah' });
    await g.wait(0.8);
    await g.say('voice', null, 'Marcus Webb.', VOICE);
    await g.narrate("Marcus stares at the grille. He doesn't make a sound.");
    await g.wait(1.2);
    await g.say('voice', null, '{slow}Marcus Webb.{/slow}', VOICE);
    g.face('marcus', 'tess');
    await g.say('marcus', 'urgent', "Don't.");
    await g.wait(0.6);
    await g.say('voice', null, 'Theresa Dolan?', VOICE);
    const c = await g.choice(['Here.', '(Say nothing.)']);
    if (c === 0) {
      g.set('roll1_answered');
      await g.wait(0.9);
      await g.say('voice', null, 'Thank you, Theresa.', VOICE);
      await g.wait(0.8);
      await g.say('marcus', 'scared', '...Tess.');
    } else {
      g.sfx('breath_hold', { vol: 0.6 });
      await g.wait(2.4);
      await g.say('voice', null, 'Theresa Dolan... {p=0.8} absent.', VOICE);
      g.sfx('pen_scratch', { vol: 0.8 });
      await g.wait(1.4);
      await g.say('voice', null, 'Absences will be made up.', VOICE);
      g.sfx('breath_release', { vol: 0.5 });
    }
    g.set('roll1_done');
    g.set('roll1_note', NOTE);
    g.refresh();
    pa()?.setMode?.('listen');
    await g.wait(0.8);
    await g.think('determined', 'Two lamps lit. {p} Two-oh-five. The library.');
    g.objective(NOTE);
    // sys.pa closes the console and checkpoints 'roll 1'; the period comes right after.
    runWhenFree(g, 'ch4.hide');
  },

  // ------------------------------------------------------------------------------------------ the period
  'ch4.hide': async (g) => {
    if (g.flag('ch4_hide_done') || !g.flag('roll1_done')) return;
    if (HW.periods && HW.periods.phase !== 'idle') return;
    const replay = g.seen('ch4_hide');
    // The standard warning (crackle + chime; Marcus sits on it). The bell waits until Tess sits.
    const bell = g.periods.start({ scripted: true, waitSeated: true, waitMax: 1e6, colonel: false, reason: 'ch4' });
    await g.wait(replay ? 0.4 : 1.4);
    await g.say('marcus', 'urgent', 'Sit. {p} Anywhere.');
    if (!replay) g.objective('Sit down. Anywhere in the office.');
    g.parallel(async (pg) => {
      const rang = await bell;
      if (!rang || !pg.alive) return;
      HW.scripts.run('ch4.period');
    });
  },

  'ch4.period': async (g) => {
    g.seen('ch4_period');
    const C = g.colonel;
    const p = HW.player;
    const seatRoom = roomOf(p);
    await g.wait(1.8);
    // Through the reception glass: the seam in the far wall of the hall.
    await g.cam([30, 17], { time: 1.6 });
    await g.wait(1.2);
    await C.spawn('colonel_fold_hall', { mode: 'scripted', anim: 'emerge', dir: 'right' });
    g.cam('colonel', { time: 1.4 });
    await g.wait(0.9);
    await C.walkTo('door_office');
    C.face('down');
    await g.wait(1.1);
    // The door opens. The coat fills the doorway.
    const door = g.prop('w1_office_door');
    if (door && door.state !== 'open') {
      HW.interact?.openDoor?.(door, { by: 'colonel', silent: true, hold: true });
      g.sfx('door_creak_slow', center(door));
    }
    await g.wait(0.9);
    await C.walkTo([34, 21]);
    C.face(seatRoom === 'w1_reception' ? 'tess' : 'down');
    g.sfx('colonel_hm', { x: C.x, y: C.y - 20 });
    await g.wait(2.2);
    // He leans over the counter.
    await C.walkTo([36, 23]);
    C.face('down');
    C.anim('peek_down', { once: true, hold: true });
    g.sfx('colonel_jingle', { x: C.x, y: C.y - 16, vol: 0.9 });
    if (p && Math.hypot(p.x - C.x, p.y - C.y) < 3 * TILE) C.closePass();
    await g.wait(3.0);
    C.anim(null);
    await C.walkTo([34, 21]);
    await C.walkTo('door_office');
    if (door) HW.interact?.closeDoor?.(door);
    await g.wait(0.4);
    await C.despawn({ sink: true });
    await g.wait(1.6);
    await g.periods.end();
    await g.cam(null, { time: 0.8 });
    g.set('ch4_hide_done');
    await g.wait(0.8);
    await g.run('ch4.end');
  },

  'ch4.end': async (g) => {
    const replay = g.seen('ch4_end');
    const m = ent('marcus');
    if (m?.seat) HW.hiding?.unseatNpc?.(m);
    if (HW.player?.seated) await HW.hiding?.stand?.();
    await g.wait(0.6);
    g.face('marcus', 'tess');
    look(g, 'marcus');
    if (!replay) {
      await g.say('marcus', 'determined', "Danny's upstairs. {p} Two-oh-five.");
      await g.say('tess', 'determined', 'East stairs. The gate.');
    }
    g.objective('Room 205. Upstairs — the east stairs.');
    g.checkpoint('ch4 end');
    await g.chapter(5);
    if (HW.scripts?.has?.('ch5.start')) await g.run('ch5.start');
  },
};

