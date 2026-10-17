// CHAPTER II — First Period (west1, Room 103). DESIGN §6 II · CONTENT §3 · owner: narrative-2.
//
//   ch2.start    chime, the voice (intercom styling, '???'), the other doors slam, Marcus raises his
//                voice; Leah and Marcus run into 103. Free play: the bell waits until Tess sits.
//   ch2.sit      trigger ch2_103 (entering 103 before the bell): makes sure the room is set (doors,
//                friends at their desks) and arms the watcher that starts the scene when Tess sits.
//   ch2.glimpse  the heads-down scene: the bell, HOLD [confirm] (overlay tight while held; releasing
//                opens her eyes on the coat — no death), fragments under the tubes, CG colonel_hand,
//                Leah's record button, Leah taken, silence, dismissal. Chains into the rest.
//   ch2.after    the empty desk, the red LED, the camcorder (scripted give).
//   ch2.vhs      the tape: the group shot, "Where's the hour?", Leah's narration, the face
//                (stinger_hard #1), ▶ PLAY; [Rewind it.] / [Don't.] → "That's him. The portrait."
//   ch2.marcus   "She moved." · "We don't move." · Denise · the office · the east doors. Checkpoint.
//   ch2.end      → g.chapter(3) → ch3.start.
// Replays: every scene calls g.seen() and jumps to its decision point when it was already seen.
import HW from '../../engine/hw.js';
import { chimeRate } from '../../game/chapters.js';

const VOICE = { name: '???' };                       // the school, before the gym (DESIGN §5.1 portrait rule)
const TAPE = { name: 'LEAH — TAPE', light: 'fluor' }; // Leah's voice on her own tape
const SLAMS = ['w1_door_custodian', 'w1_door_rr', 'w1_door_101', 'w1_door_av', 'w1_door_102'];
const ROOM = 'w1_room103';
const DESKS = { leah: 'w1_desk_103_leah', tess: 'w1_desk_103_tess', marcus: 'w1_desk_103_marcus' };
const TILE = 16;

const keyLabel = (a) => HW.ui?.input?.keyLabel?.(a) || 'Z';
const ent = (id) => HW.entities?.get(id) || null;
const propOf = (id) => HW.map?.prop(id) || null;
const doorPt = (p) => ({ x: (p.x + p.w / 2) * TILE, y: (p.y + p.h / 2) * TILE });

/** Tess turns to a direction / entity / anchor, and her beam goes with her (it holds still in cutscenes). */
function look(g, target) {
  g.face('tess', target);
  const p = HW.player;
  if (!p || !HW.flashlight) return;
  const e = typeof target === 'string' ? (HW.entities?.get(target) || HW.map?.anchor(target)) : null;
  HW.flashlight.angle = e ? Math.atan2(e.y - 6 - (p.y - 9), e.x - p.x) : Math.atan2(p.aimY, p.aimX);
}

/** Seat a friend at a desk (walk/run there, or snap). Never leaves a stale seat reservation behind. */
async function seatFriend(g, id, deskId, { walk = true } = {}) {
  const e = ent(id);
  const desk = propOf(deskId);
  if (!e || !desk || !HW.hiding) return false;
  if (e.seat === desk) return true;
  if (e.path) { e.stopPath(false); await g.wait(0.02); }
  if (desk.seatedBy && desk.seatedBy !== e) return false;
  return HW.hiding.seatNpc(e, desk, { walk, run: true });
}

/** Tess onto her own desk (any 103 desk "snaps" to desk_103_tess). */
async function snapTess(g) {
  const p = HW.player;
  const desk = propOf(DESKS.tess);
  if (!p || !desk || p.seated === desk) return;
  await g.fade('out', 0.18);
  if (p.seated) await HW.hiding.stand();
  g.setPos('tess', 'desk_103_tess');
  await HW.hiding.sit(desk);
  await g.fade('in', 0.25);
}

/** Room state the scene relies on: the other doors slammed shut, 103 open, the friends at their desks. */
function setRoom(g) {
  for (const id of SLAMS) if (g.prop(id) && g.prop(id).state !== 'locked') g.setProp(id, 'locked');
  if (g.prop('w1_door_103')?.state !== 'open') g.setProp('w1_door_103', 'open');
}

// One watcher per script generation (a load/game over aborts it with everything else).
let sitWatchGen = -1;
function armSitWatcher(g) {
  if (sitWatchGen === HW.scripts.gen) return;
  sitWatchGen = HW.scripts.gen;
  g.parallel(async (pg) => {
    await HW.game.until(() => {
      const p = HW.player;
      return !!p?.seated && HW.map?.id === 'west1' && HW.map.roomAt(p.x, p.y)?.id === ROOM;
    });
    if (!pg.alive || pg.flag('ch2_bell1')) return;
    HW.scripts.run('ch2.glimpse');
  });
}

/**
 * Heads down (DESIGN §6 II.2): while Confirm is held the tunnel stays tight; letting go opens her eyes
 * on whatever is beside the desk, then she squeezes them shut again by herself. No death.
 * Returns the shared state; set .danger while he's in the room, .cg during the CG, .on = false to stop.
 */
function eyesShut(g) {
  const eyes = { on: true, danger: false, cg: false, glimpses: 0, cool: 0, loose: 0, open: false };
  const tight = (on) => {
    g.overlay('heads_down', {});
    g.overlay('black', on ? { alpha: 0.22 } : null);
  };
  tight(true);
  g.parallel(async (pg) => {
    let wasHeld = true;
    while (eyes.on) {
      await pg.wait(0.05);
      if (!eyes.on || eyes.cg || eyes.open) continue;
      eyes.cool = Math.max(0, eyes.cool - 0.05);
      const held = !!HW.input?.down?.('confirm');
      if (held !== wasHeld) { wasHeld = held; tight(held); }
      eyes.loose = held ? 0 : eyes.loose + 0.05;
      if (!eyes.danger || held || eyes.loose < 0.3 || eyes.cool > 0 || eyes.glimpses >= 2) continue;
      // Her eyes open: the coat, inches away; the hand sliding toward her face.
      eyes.open = true;
      eyes.glimpses++;
      HW.debug?.record?.('glimpse', null, null, `ch2:${eyes.glimpses}`);
      pg.overlay('heads_down', null);
      pg.overlay('black', null);
      if (eyes.glimpses === 1) pg.sfx('stinger_soft', { vol: 0.8 });
      const C = HW.colonel;
      if (C?.entity) {
        pg.sfx('colonel_breath_fast', { x: C.entity.x, y: C.entity.y - 20, vol: 1 });
        const d = HW.player ? (HW.player.x < C.entity.x ? 'left' : 'right') : 'left';
        try { C.entity.playAnim(`reach_${d}`, { once: true }); } catch { /* art missing: the mass is enough */ }
      }
      pg.fx('vignette', 0.75, 0.15);
      pg.fx('chroma', 0.35, 0.9);
      await pg.wait(1.0);
      pg.sfx('breath_hold', { vol: 0.7 });
      pg.fx('vignette', 0.25, 0.6);
      if (eyes.on && !eyes.cg) tight(true);
      wasHeld = true;
      eyes.cool = 3.5;
      eyes.open = false;
    }
    pg.overlay('black', null);
  });
  return eyes;
}

/** A fragment glimpsed through the tubes' stutter: the lights die for a beat, one line, back. */
async function fragment(g, text) {
  HW.lighting?.setGroup?.('period', false, { mode: 'instant' });
  await g.wait(0.14);
  HW.lighting?.setGroup?.('period', true, { mode: 'stutter', stagger: 0.12 });
  await g.narrate(`{dim}${text}{/dim}`, { hold: true });
  await g.wait(1.3);
}

export default {
  // ------------------------------------------------------------------------------------------ start
  'ch2.start': async (g) => {
    if (g.seen('ch2_start')) {
      // Decision point: the hall, the doors shut, 103 open, the friends already inside.
      setRoom(g);
      seatFriend(g, 'leah', DESKS.leah, { walk: false });
      seatFriend(g, 'marcus', DESKS.marcus, { walk: false });
      g.objective('Room 103. Sit down.');
      armSitWatcher(g);
      return;
    }
    // Every door on the hall drifts open in the dark (so it can slam).
    for (const id of SLAMS) if (g.prop(id)) g.setProp(id, 'open');
    g.setProp('w1_door_103', 'open');
    look(g, 'right');
    await g.wait(0.6);
    g.sfx('intercom_crackle', { vol: 0.5 });
    await g.wait(0.5);
    g.sfx('intercom_chime', { rate: chimeRate(2) });
    await g.wait(2.2);
    await g.say('voice', null, 'Good evening, students. {p} You will proceed to your homerooms. {p=0.6} Attendance will now be taken.', VOICE);
    await g.wait(0.8);
    await g.say('tess', 'scared', 'Who is that?');
    await g.say('leah', 'scared', "There's no power. There hasn't been power since '84.");
    // The doors slam, far to near. Only 103 — the nearest — stays open.
    g.cam([19, 14], { time: 1.4 });
    await g.wait(0.9);
    const gaps = [0, 0.55, 0.5, 0.42, 0.36];
    for (let i = 0; i < SLAMS.length; i++) {
      await g.wait(gaps[i]);
      const d = g.prop(SLAMS[i]);
      if (!d) continue;
      g.setProp(SLAMS[i], 'locked');
      g.sfx('door_slam', { ...doorPt(d), vol: 1 });
      if (i >= 3) g.shake(i === 4 ? 2 : 1, 0.25);
    }
    await g.wait(1.2);
    await g.cam([11, 13], { time: 0.9 });
    await g.wait(0.7);
    await g.cam(null, { time: 0.6 });
    look(g, 'marcus');
    await g.say('marcus', 'urgent', 'Get in a room. {p} Sit down. {p} Now.', { shake: 1 });
    await g.say('leah', 'scared', 'Marcus, what—');
    // He takes her arm; they run for 103.
    seatFriend(g, 'marcus', DESKS.marcus);
    await g.wait(0.15);
    seatFriend(g, 'leah', DESKS.leah);
    g.objective('Room 103. Sit down.');
    g.checkpoint('ch2 start');
    armSitWatcher(g);
  },

  /** Trigger ch2_103: Tess steps into 103 before the bell. The bell waits until she sits. */
  'ch2.sit': async (g) => {
    if (g.flag('ch2_bell1')) return;
    setRoom(g);
    for (const [id, desk] of [['leah', DESKS.leah], ['marcus', DESKS.marcus]]) {
      const e = ent(id);
      if (e && !e.seat && !e.path) seatFriend(g, id, desk);
    }
    if (!g.seen('ch2_sit')) {
      await g.wait(0.2);
      await g.think('scared', 'A desk. Any desk.');
    }
    armSitWatcher(g);
  },

  // ------------------------------------------------------------------------------------------ the scene
  'ch2.glimpse': async (g) => {
    g.seen('ch2_glimpse');
    g.set('ch2_bell1');
    setRoom(g);
    await snapTess(g);
    await seatFriend(g, 'leah', DESKS.leah, { walk: false });
    await seatFriend(g, 'marcus', DESKS.marcus, { walk: false });
    for (const id of ['leah', 'marcus']) g.face(id, 'up');
    // The door swings shut by itself. Then the bell.
    const door = g.prop('w1_door_103');
    if (door?.state === 'open') HW.interact?.closeDoor?.(door);
    g.cam([8, 7], { time: 1.0 });
    await g.wait(1.1);
    await g.periods.start({ scripted: true, warning: false, colonel: false, reason: 'ch2' });
    await g.wait(2.4);
    await g.say('leah', 'scared', "T. {p} I'm still recording.");
    await g.say('marcus', 'urgent', 'Heads down. {p} Whatever happens.');
    await g.narrate(`{dim}Hold ${keyLabel('confirm')} — keep your head down.{/dim}`);

    // HOLD: the tunnel. Everyone's head goes down.
    for (const id of ['tess', 'leah', 'marcus']) g.anim(id, 'heads_down', { hold: true });
    const eyes = eyesShut(g);
    await g.wait(1.6);
    const C = g.colonel;
    // He pours out of the seam behind the bulletin board; the hall tubes die around him.
    await C.spawn('fold:1', { mode: 'scripted', anim: 'emerge', dir: 'left' });
    await g.wait(0.8);
    await C.walkTo([11, 13]);
    eyes.danger = true;
    const into = C.walkTo([11, 8]);
    await g.wait(0.9);
    await fragment(g, 'Navy wool. A hem, dragging.');
    await into;
    const along = C.walkTo([9, 7]);
    await g.think('eyes_shut', "{slow}Don't move. Don't move.{/slow}", { hold: true });
    await g.wait(0.6);
    await fragment(g, 'A crimson fringe, swinging.');
    await along;
    await C.walkTo([8, 7]);
    C.face('tess');
    await fragment(g, 'A boot. Split open along the seam.');
    await g.wait(1.4);

    // The hand (CG): on her desk, beside her face. A long breath.
    await HW.game.until(() => !eyes.open, 3);
    eyes.cg = true;
    g.overlay('heads_down', null);
    g.overlay('black', null);
    await g.cg('colonel_hand', { fade: 1.4 });
    g.sfx('colonel_breath', { x: HW.player.x, y: HW.player.y - 12, vol: 1 });
    await g.wait(2.0);
    await g.think('eyes_shut', '{dim}Pennies. {p} Wet wool.{/dim}', { hold: true });
    await g.wait(1.6);
    // Leah's record button.
    g.sfx('camcorder_click', { ...(ent('leah') ? { x: ent('leah').x, y: ent('leah').y } : {}), vol: 0.9 });
    g.anim('leah', 'film_down', { hold: true });
    await g.wait(1.6);
    await g.cg(null, { fade: 0.6 });   // the hand lifts
    g.overlay('heads_down', {});
    g.overlay('black', { alpha: 0.22 });
    eyes.cg = false;
    await C.walkTo([6, 7]);
    C.face('leah');
    C.anim('reach_up', { once: true });
    await g.wait(0.7);
    const L = ent('leah');
    const at = L ? { x: L.x, y: L.y } : {};
    g.sfx('colonel_grab', { ...at, vol: 0.45, rate: 0.85 });   // a soft, wet sound
    await g.wait(0.35);
    g.sfx('chair_scrape', { ...at, vol: 0.9 });
    // The camcorder drops on her desk, still recording.
    if (L) { HW.hiding?.unseatNpc?.(L); g.party.remove('leah'); g.despawn('leah'); }
    g.set('ch2_leah_taken');
    g.refresh();
    const led = HW.lighting?.addLight?.({ type: 'led_red', x: 5, y: 6, map: 'west1', radius: 1.2 }) || null;
    eyes.danger = false;
    await g.wait(0.6);
    // Silence (DESIGN §14): nothing, until the bell.
    g.silence(true, 0.05);
    await C.despawn({ sink: false });
    await g.wait(4.2);
    g.silence(false, 0.05);
    await g.periods.end();
    eyes.on = false;
    g.overlay('heads_down', null);
    g.overlay('black', null);
    for (const id of SLAMS) if (g.prop(id)) g.setProp(id, 'closed');
    await g.run('ch2.after', { led });
  },

  // ------------------------------------------------------------------------------------------ after
  'ch2.after': async (g, ctx) => {
    const led = ctx?.led || null;
    const replay = g.seen('ch2_after');
    await g.wait(1.4);
    g.anim('tess', null);
    await g.wait(0.8);
    look(g, 'left');
    await g.say('tess', 'scared', 'Leah?');
    await g.wait(1.2);
    g.anim('marcus', null);
    g.face('marcus', 'left');
    await g.wait(0.8);
    // The empty desk; the camcorder on it, its red light still on.
    await HW.hiding?.stand?.();
    await g.walk('tess', 'desk_103_leah');
    look(g, 'up');
    await g.wait(0.5);
    if (led) HW.lighting?.removeLight?.(led);
    g.give('camcorder');
    g.sfx('camcorder_whir', { vol: 0.5 });
    if (!replay) await g.think('shocked', "It's still warm.");
    await g.run('ch2.vhs', { chain: true });
  },

  // ------------------------------------------------------------------------------------------ the tape
  'ch2.vhs': async (g, ctx) => {
    if (!g.seen('ch2_vhs')) {
      await g.think('worried', 'She was filming. {p} The whole time.');
      g.sfx('camcorder_click');
      g.sfx('camcorder_whir', { vol: 0.6 });
      await g.wait(1.2);
      await playTape(g);
    }
    // Decision point.
    const c = await g.choice(['Rewind it.', "Don't."]);
    if (c === 0) {
      const r = await g.screen('vhs', {
        start: 4, min: 1, max: 5,
        onFrame: (i) => { if (i === 5) g.sfx('camcorder_whir', { vol: 0.4 }); },
      });
      g.set('ch2_vhs_rewound', true);
      if (r && r.held >= 2) g.set('ch2_vhs_held', r.held);
      await g.say('tess', 'horrified', "That's him. {p} The portrait.");
    } else {
      await g.say('tess', 'horrified', "I saw it. {p} That's him. The portrait.");
    }
    g.overlay('vhs', null);
    g.set('ch2_vhs_seen');
    g.set('colonel_named');
    if (ctx?.chain) await g.run('ch2.marcus');
  },

  // ------------------------------------------------------------------------------------------ Marcus
  'ch2.marcus': async (g) => {
    const replay = g.seen('ch2_marcus');
    const m = ent('marcus');
    if (m?.seat) HW.hiding?.unseatNpc?.(m);
    if (m && HW.map?.id === 'west1') await g.walk('marcus', [7, 7]);
    g.face('marcus', 'tess');
    look(g, 'marcus');
    if (!replay) {
      await g.wait(0.8);
      await g.say('marcus', 'grief', "She moved. {p} That's all she did. {p=0.6} She lifted the camera.");
      await g.say('tess', 'scared', "So we don't move.");
      await g.say('marcus', 'determined', "We don't move.");
      await g.wait(1.6);
      g.face('marcus', 'desk_103_leah');
      await g.wait(1.0);
      await g.say('marcus', 'sad', 'My aunt was one of them. {p=0.8} Denise.');
      await g.think('sad', 'The memorial board. He stood at one of those pictures a long time.');
      await g.wait(0.6);
      g.face('marcus', 'tess');
      await g.say('tess', 'determined', 'That voice came from the office. {p} The intercom.');
      await g.say('marcus', 'thoughtful', "Office is locked. {p} Janitor would've had keys.");
    }
    g.set('ch2_marcus_told');
    g.objective('The main office. The intercom.');
    // Far off, toward the lobby: heavy doors swinging open on their own.
    if (!g.flag('east_doors_open')) {
      await g.wait(0.6);
      g.sfx('door_creak_slow', { vol: 0.45, pan: 0.7, rate: 0.85 });
      await g.wait(1.4);
      g.set('east_doors_open');
      g.refresh();
      if (!replay) await g.think('worried', 'Something opened. Out by the lobby.');
    }
    await g.cam(null, { time: 0.6 });
    g.checkpoint('ch2 marcus');
    await g.run('ch2.end');
  },

  'ch2.end': async (g) => {
    await g.wait(0.4);
    await g.chapter(3);
    if (HW.scripts?.has?.('ch3.start')) await g.run('ch3.start');
  },
};

/** The first viewing (cinematic; the screen ignores the player until the blue screen). */
async function playTape(g) {
  const shown = g.screen('vhs', {
    start: 0, min: 0, max: 5,
    onFrame: (i) => { if (i === 5) g.sfx('stinger_hard'); },
  });
  await g.wait(0.05);
  // Automated runs resolve the screen at once: the lines still play (into the transcript), unframed.
  const scr = HW.ui?.get?.('vhs') || null;
  if (scr) {
    // Hands off the controls while the tape plays; the OSD reads ▶ PLAY and the frames are stepped here.
    const update = scr.update;
    if (typeof update === 'function') scr.update = (dt) => update.call(scr, dt, null);
    scr.playing = true;
    scr.hold = 1e9;
  }
  const on = () => !scr || HW.ui?.get?.('vhs') === scr;   // false once the player has ejected it
  const step = async (sec) => {
    if (!on()) return false;
    if (scr && typeof scr._step === 'function') scr._step(1);
    await g.wait(sec);
    return true;
  };
  const leah = (expr, text, o = {}) => (on() ? g.say('leah', expr, text, { ...TAPE, hold: true, ...o }) : null);
  await g.wait(1.8);
  await leah('smile', 'Everybody say Hollow Hell.');                                        // 9:51 — the lobby
  await g.wait(1.4);
  if (!(await step(1.4))) return;                                                         // 10:41 — heads down
  await leah('worried', "We got here at nine forty-seven. {p} That's an hour, T. {p} Where's the hour?");
  await g.wait(1.6);
  if (!(await step(0.9))) return;                                                         // a dark mass
  await leah('scared', "This is Leah Brandt for STATIC. Ten forty-one. {p} For the record— {p} it's real.", { speed: 0.9 });
  await g.wait(1.1);
  if (!(await step(0.5))) return;                                                         // the hand on her shoulder
  await leah('scared', "T, don't look up—");
  if (!(await step(0.9))) return;                                                         // tilt, static
  if (!(await step(2.6))) return;                                                         // his face, filling the lens
  // ▶ PLAY: blue.
  g.overlay('vhs', { blue: true, timestamp: 'OCT 18 1996 10:42PM' });
  if (scr) HW.ui?.close?.('vhs', { frame: 5, held: 0 });
  await shown;
  await g.wait(1.2);
}
