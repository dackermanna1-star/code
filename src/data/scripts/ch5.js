// CHAPTER V — Upstairs (east1 gate, east2, longhall, west2, library). DESIGN §6 V · CONTENT §3 · owner: narrative-3.
//
//   ch5.start          after the card (still in the office): Kevin's posts upstairs, the objective.
//   ch5.gate           e1_gate (east1 stairs, every chapter): before the keys / before roll #1 the refusals
//                      (DESIGN §9.2, the bolt cutters: "No shackle to cut…"); after roll #1 the 2F GATE key.
//   ch5.upstairs       first time on east2: the pencil, scratching, somewhere down the hall.
//   ch5.danny          trigger room205_enter: Danny writing I WILL NOT LEAVE; the BOND (Danny); checkpoint.
//   ch5.period205      the scripted period in 205 (no fail): he steps in, pats Danny's head, the close pass;
//                      portrait_state → empty; free periods open (ch5_205_period_done); checkpoint.
//   ch5.hall_pass      206: the wooden HALL PASS — RM 206 (item + flag hall_pass).
//   ch5.longhall_refuse  east2 → longhall before ch5_danny_found: "Two-oh-five first. He's right there, Tess."
//   ch5.longhall_enter trigger under the arch: the sign, the empty chair across the void; checkpoint.
//   ch5.gallery        the portrait across the void (lh_portrait / lh_gallery).
//   ch5.longhall_loop  HW.longhall, non-blocking, ctx { loop }: schedules ch5.longhall_line per DESIGN.
//   ch5.longhall_voice HW.longhall at loop 4: Leah's voice behind the painted door (via ch5.longhall_line).
//   ch5.longhall_line  the blocking beats for the loops (1 the door · 2 Kevin's belt · 3/6 Marcus · 4 the voice).
//   ch5.kevin_whistle  HW.longhall, running: whistle → blackout → breath at the neck → back at loop_reset.
//   ch5.kevin_pass     HW.longhall, with the pass at Kevin: "...pass." "...one pass." Marcus goes around;
//                      longhall_cleared; checkpoint. Tess is alone from here.
//   ch5.west2_arrive   first step into west2, alone: the tap running at the far end.
//   ch5.mirror         trigger mirror_2f: the Reflection; fog by roll #1; the compact tutorial (adair_met,
//                      compact_unlocked); something in 201; checkpoint.
//   ch5.room202        trigger room202: OUR PROUD HERITAGE (+ the Charter excerpt, if read).
//   ch5.false_leah     trigger 201 threshold (after adair_met): checkpoint; the tells; [Ask about the tape] /
//                      [Sit down] (→ PRESENT) / [Back out slowly] → the head turn → hold the door → empty room.
//   ch5.library_enter  trigger on the mezzanine walkway: the green lamp below.
//   ch5.leah           trigger at her table: the BOND (Leah), the School Code card (adair_named); checkpoint.
//   ch5.catalog        the card catalog: needs the 1979 view (saw_catalog_past) or adair_note → case_key.
//   ch5.case           the display case: case_key → the Founder's Charter (item charter, doc charter_full).
//   ch5.marcus_knock   trigger in the reading room after Leah: "Tess? It's Marcus." "Say my name." "...Tess."
//   ch5.unbar          the barricade: library_door_open, Marcus back in the party → ch5.end.
//   ch5.end            "Haupt's office. The safe." → g.chapter(6) → ch6.start.
//   ch5.enter_east2 / ch5.enter_west2 / ch5.enter_library   map onEnter hooks (non-blocking): the people
//                      who are "in session" there (Danny at his desk, Leah at her table, the False Leah),
//                      their pencils, the running tap — and resuming a scene after a reload mid-chapter.
// Replays: every scene calls g.seen() and, when it was already seen, jumps to its decision point.
import HW from '../../engine/hw.js';
import { DIR_ANGLE } from '../../engine/entities.js';
import { hold, release } from './pro.js';

const TILE = 16;
const VOICE = { name: '???' };          // the school / the Colonel, before the gym (DESIGN §5.1 portrait rule)
const LEAH_Q = { name: 'Leah?' };       // the mimic wearing Leah (R7)
const ENR = { enrolled: true };         // a friend "in session"
const LED = Object.freeze({ type: 'led_red', radius: 0.7, intensity: 0.6 });

const auto = () => !!HW.debug?.autoAdvance;
const ent = (id) => HW.entities?.get(id) || null;
const propOf = (id) => HW.map?.prop(id) || null;
const center = (p) => ({ x: (p.x + p.w / 2) * TILE, y: (p.y + p.h / 2) * TILE });
const cell = (tx, ty) => ({ x: tx * TILE + 8, y: ty * TILE + 12 });
const onMap = (id) => HW.map?.id === id;
const withMarcus = (g) => g.party.has('marcus') && !!g.npc('marcus');
const keyLabel = (a) => HW.ui?.input?.keyLabel?.(a) || (a === 'compact' ? 'Q' : 'Z');
const periodQuiet = () => !HW.periods || HW.periods.phase === 'idle';
const chapter = (g) => g.state.chapter || 0;
const freePlay = () => HW.game?.mode === 'play' && !HW.scripts?.blocking && !HW.game?.transferring
  && !(HW.ui?.isBusy?.());

/**
 * Tess turns to a direction / entity / anchor / [tx,ty] and her beam goes with her. With the v2.2
 * engine g.face('tess', target) eases the beam there itself; older engines hold the beam in cutscenes,
 * so set the angle outright.
 */
function look(g, target) {
  g.face('tess', target);
  const p = HW.player;
  if (!p || !HW.flashlight || typeof p.faceToward === 'function') return;
  if (typeof target === 'string' && DIR_ANGLE[target] !== undefined) { HW.flashlight.angle = DIR_ANGLE[target]; return; }
  let pt = null;
  if (Array.isArray(target)) pt = cell(target[0], target[1]);
  else if (typeof target === 'string') pt = HW.entities?.get(target) || HW.map?.anchor(target);
  if (pt) HW.flashlight.angle = Math.atan2(pt.y - 6 - (p.y - 9), pt.x - p.x);
}

/** Run a blocking script as soon as nothing else is (map loads, closing screens, other scenes). */
function runWhenFree(g, id, ctx = {}, guard = null) {
  g.parallel(async (pg) => {
    await HW.game.until(() => !pg.alive || freePlay(), 30);
    if (!pg.alive || !freePlay()) return;
    if (guard && !guard()) return;
    HW.scripts.run(id, ctx);
  });
}

// ---------------------------------------------------------------------------------------------
// Positional loops that belong to one map visit (a pencil that never stops, the tap). Stopped on the
// next map load, load or game over.
const LOOPS = new Map();
let loopsHooked = false;
function hookLoops() {
  if (loopsHooked || !HW.game?.on) return;
  loopsHooked = true;
  const sweep = () => { for (const [name, L] of [...LOOPS]) if (L.map !== HW.map) stopLoop(name, 0.3); };
  const all = () => { for (const name of [...LOOPS.keys()]) stopLoop(name, 0.1); };
  HW.game.on('mapLoad', sweep);
  for (const ev of ['load', 'newGame', 'gameOver']) HW.game.on(ev, all);
}
function mapLoop(name, id, at, vol = 0.6) {
  hookLoops();
  stopLoop(name, 0.05);
  const h = HW.audio?.loop?.(id, { x: at.x, y: at.y, vol });
  if (h) LOOPS.set(name, { h, map: HW.map });
}
function stopLoop(name, fade = 0.4) {
  const L = LOOPS.get(name);
  if (!L) return;
  LOOPS.delete(name);
  try { L.h.stop?.(fade); } catch (e) { console.error('[ch5] loop stop', e); }
}

/** An NPC "in session": spawned (once per map load) and seated at a desk/chair. */
function seatNpc(g, id, sprite, at, seatId, sitDir = null) {
  let e = ent(id);
  if (!e) e = g.spawn({ id, sprite, at, dir: sitDir || 'up' });
  const seat = propOf(seatId);
  if (e && seat && HW.hiding?.seatNpc) {
    if (seat.seatedBy && seat.seatedBy !== e) seat.seatedBy = null;
    HW.hiding.seatNpc(e, seat, { walk: false }); // no walk → settles synchronously
    if (sitDir) { e.sitDir = sitDir; e.dir = sitDir; }
  }
  return e;
}

/** Tess walks to a desk's aisle cell and sits at it. */
async function sitTess(g, deskId, anchor) {
  const p = HW.player;
  const desk = propOf(deskId);
  if (!p || !desk || p.seated === desk) return;
  if (p.seated) await HW.hiding.stand();
  await g.walk('tess', anchor);
  g.face('tess', 'up');
  if (!desk.seatedBy) await HW.hiding.sit(desk);
}

/** Switch off every light on the map (the long-hall blackout). Returns what to switch back on. */
function blackout() {
  const saved = [];
  for (const L of HW.lighting?.lights || []) {
    if (L.on === false) continue;
    saved.push(L);
    L.on = false;
  }
  if (HW.lighting?.selfGlow) HW.lighting.selfGlow.on = false;
  return saved;
}
function unblackout(saved) {
  for (const L of saved || []) L.on = true;
  if (HW.lighting?.selfGlow) HW.lighting.selfGlow.on = true;
}

// ---------------------------------------------------------------------------------------------
// Danny, Leah, the False Leah.
function seatDanny(g) {
  const d = seatNpc(g, 'danny', 'danny_e', 'danny_desk', 'e2_desk_danny');
  if (!d) return null;
  if (g.flag('bond_danny') && g.flag('ch5_danny_found')) {
    // The pencil stopped at LEA. It stays stopped (the writing loop, resting on its last frame).
    stopLoop('danny_pen', 0.05);
    g.anim('danny', 'sit_up', { hold: true });
  } else if (!LOOPS.has('danny_pen')) {
    mapLoop('danny_pen', 'pen_scratch', { x: d.x, y: d.y - 14 }, 0.5);
  }
  return d;
}

function seatLeah(g) {
  // Her chair faces the room (the instance dir is 'down'; seats default to facing up).
  const L = seatNpc(g, 'leah', 'leah_e', 'leah_table', 'lib_leah_chair', 'down');
  if (L && !LOOPS.has('leah_pen')) mapLoop('leah_pen', 'pen_scratch', { x: L.x, y: L.y - 4 }, 0.45);
  return L;
}

function spawnFalseLeah(g) {
  // Not entranced: perfectly calm, her back to the door, the camcorder in her lap with its red light on.
  const L = seatNpc(g, 'false_leah', 'leah', 'false_leah', 'w2_desk_false_leah');
  if (L) g.light('false_leah', LED);
  return L;
}

/** Her shadow in the beam: the shroud (near-black, brass winking in it) rising behind her chair. */
async function shadowOn(g) {
  const C = g.colonel;
  if (!C) return null;
  if (C.entity) return C.entity;
  const e = await C.spawn([15, 7], { mode: 'scripted', anim: null, dir: 'down' });
  // The room is quiet; the breathing is there, low. (No public volume API: the AI's own breath loop.)
  try { C._breath?.setVol?.(0.3, 0.6); } catch (err) { console.error('[ch5] breath vol', err); }
  return e;
}

function finishFalseLeah(g) {
  g.set('false_leah_done');
  g.light('false_leah', null);
  if (ent('false_leah')) g.despawn('false_leah');
  if (HW.colonel?.entity && HW.colonel.mode === 'scripted') HW.colonel.despawn({ sink: false });
}

/** Open the compact on one of this map's past views (scripted), hold, and say what she sees. */
async function compactLook(g, pastId, expr, line, sec = 2.4) {
  const past = HW.map?.past?.find((p) => p.id === pastId);
  if (past && HW.compact && !HW.compact.active) HW.compact.open(past);
  await g.wait(sec);
  if (line) await g.think(expr, line);
  await g.wait(0.4);
  HW.compact?.close?.();
}

// ---------------------------------------------------------------------------------------------
// Holding 201's door shut: the 'write' meter, labelled for the door (release = the door gives).
// The UI's 'breath' screen fails on release but is labelled "Hold your breath"; 'write' takes a label
// but only pauses on release — so a watcher closes it with 'released' when Confirm lets go.
async function holdOnce(g, label, seconds, at) {
  const watch = auto() ? null : g.parallel(async (pg) => {
    await HW.game.until(() => !pg.alive || !!HW.ui?.get?.('write'), 3);
    const scr = HW.ui?.get?.('write');
    if (!scr || !pg.alive) return;
    await HW.game.until(() => !pg.alive || scr.done || scr.closing
      || (scr.started ? !HW.input.down('confirm') : scr.t > 3.5), 120);
    if (pg.alive && !scr.done && !scr.closing) HW.ui.close('write', 'released');
  });
  // Something on the other side of the door, leaning on it.
  const thumps = g.parallel(async (pg) => {
    await pg.wait(0.6);
    let n = 0;
    while (pg.alive && HW.ui?.get?.('write')) {
      pg.sfx('door_slam', { ...at, vol: 0.35 + 0.1 * (n % 3), rate: 0.7 });
      pg.shake(n % 2 ? 1.2 : 0.7, 0.18);
      n++;
      await pg.wait(0.8 + ((n * 37) % 7) / 10);
    }
  });
  const r = await g.screen('write', { label, seconds, letters: '', allowCancel: false });
  void watch; void thumps;
  return r === 'done' ? 'done' : 'released';
}

async function holdDoor(g) {
  const door = propOf('w2_door_201');
  const at = door ? center(door) : cell(20, 11);
  for (let attempt = 0; attempt < 2; attempt++) {
    const r = await holdOnce(g, attempt === 0 ? 'Hold the door' : 'Hold it shut', attempt === 0 ? 7 : 5, at);
    if (r === 'done') return 'held';
    if (attempt > 0) break;
    // First release: the door opens an inch, and a hand comes round the edge.
    if (door) g.setProp(door.id, 'open');
    g.sfx('door_creak_slow', { ...at, vol: 1, rate: 1.25 });
    g.shake(2, 0.3);
    const C = g.colonel;
    if (C && !C.entity) await C.spawn([20, 9], { mode: 'scripted', anim: null, dir: 'down' });
    if (C?.entity) C.anim('reach_down', { once: true, hold: true });
    g.sfx('colonel_breath_fast', { ...at, vol: 1 });
    await g.narrate('{shake}The door gives an inch. Fingers come round the edge — white, fat, a ring sunk into every one.{/shake}');
    // Grip again.
    if (door) g.setProp(door.id, 'closed');
    g.sfx('door_slam', { ...at, vol: 0.9 });
    g.shake(1.5, 0.2);
    if (C?.entity) await C.despawn({ sink: false });
  }
  return 'caught';
}

// ---------------------------------------------------------------------------------------------
export default {
  // ------------------------------------------------------------------------------------------ start
  'ch5.start': async (g) => {
    g.seen('ch5_start');
    // The Safety Patrol keeps posts at the ends of both upstairs halls (never visible at load).
    HW.patrol?.enable?.({ maps: ['east2', 'west2'] });
    g.objective('Room 205. Upstairs — the east stairs.');
  },

  // ------------------------------------------------------------------------------------------ the gate
  'ch5.gate': async (g, ctx) => {
    if (g.flag('gate_2f_open')) return;
    const gate = ctx?.prop || propOf('e1_gate');
    const at = gate ? center(gate) : {};
    const bump = !!ctx?.bump;
    if (!g.has('keyring') || !g.flag('roll1_done')) {
      g.sfx('gate_rattle', { ...at, vol: 0.8 });
      if (!g.has('keyring')) {
        await g.examine('[n] A steel accordion gate across the stairs up. A tin sign: SECOND FLOOR CLOSED — BY ORDER OF THE DISTRICT.');
        if (withMarcus(g)) await g.say('marcus', 'neutral', "Janitor's keys. {p} Whatever opens this, he had it.");
        if (!bump && g.has('bolt_cutters') && !g.flag('ch5_gate_cutters')) {
          const c = await g.choice(['Try the bolt cutters.', 'Leave it.']);
          if (c === 0) {
            g.set('ch5_gate_cutters');
            await g.think('skeptical', "No shackle to cut. {p} The lock's built into the gate.");
          }
        } else if (!bump && g.flag('ch5_gate_cutters')) {
          await g.think('skeptical', "No shackle to cut. {p} The lock's built into the gate.");
        }
        return;
      }
      // Keys, but nobody knows where the others are yet (DESIGN §9.2).
      if (withMarcus(g)) await g.say('marcus', 'worried', "Not up. {p} We don't even know where they are.");
      await g.say('tess', 'determined', 'The intercom.');
      return;
    }
    // After roll #1: the key tagged 2F GATE.
    const replay = g.seen('ch5_gate');
    g.sfx('key_unlock', { ...at, vol: 0.9 });
    await g.wait(0.6);
    g.sfx('gate_rattle', { ...at, vol: 1, rate: 0.85 });
    if (at.x !== undefined) HW.noise?.emit?.(at.x, at.y, null, 'door');
    g.set('gate_2f_open');
    g.refresh();
    look(g, 'up');
    if (!replay) {
      await g.wait(0.9);
      if (withMarcus(g)) await g.say('marcus', 'thoughtful', "Second floor's been shut since '79.");
    }
  },

  /** First time on the second floor: a pencil, scratching, somewhere down the hall. */
  'ch5.upstairs': async (g) => {
    if (g.seen('ch5_upstairs') || g.flag('ch5_danny_found')) return;
    await g.wait(0.6);
    look(g, 'right');
    await g.wait(0.9);
    await g.think('worried', 'A pencil. {p} Somebody up here is writing.');
    g.objective('Room 205.');
  },

  // ------------------------------------------------------------------------------------------ Danny
  'ch5.danny': async (g) => {
    if (g.flag('ch5_danny_found')) return;
    const replay = g.seen('ch5_danny');
    const d = ent('danny') || seatDanny(g);
    const m = withMarcus(g);
    hold(g, 'marcus');
    // The board behind him writes itself while she looks at him: I WILL NOT LEAVE.
    g.set('ch5_danny_found');
    g.refresh();
    look(g, 'danny');
    const pan = g.cam([20, 6], { time: 1.4 });
    if (!replay) {
      g.sfx('chalk', { x: 20 * TILE, y: 2.5 * TILE, vol: 0.45 });
      await pan;
      await g.wait(0.7);
      await g.say('tess', 'shocked', 'Danny!');
    } else await pan;
    // Over to him; Marcus at the end of the row.
    const walks = [g.walk('tess', [20, 8])];
    if (m) walks.push(g.walk('marcus', [17, 9]));
    await Promise.all(walks);
    look(g, 'danny');
    if (m) g.face('marcus', 'danny');
    if (!replay) {
      await g.wait(0.7);
      await g.say('danny', 'entranced', 'It wrote my name, Dolan. {p} In a big book. {p} Under the school.', ENR);
      await g.say('tess', 'scared', 'Danny. {p} Look at me.');
      await g.say('danny', 'flicker', 'He smells like pennies. {p} And, like, Christmas ham.');
      // She takes his arm and pulls. Nothing gives — not him, not the chair.
      if (d) g.sfx('chair_scrape', { x: d.x, y: d.y, vol: 0.35, rate: 0.55 });
      g.shake(0.4, 0.2);
      await g.wait(0.8);
      if (m) await g.say('marcus', 'worried', "He's not moving, Tess. {p} The chair's not even moving.");
      await g.say('danny', 'flicker', "I can't get up, Dolan. I tried. {p} My legs are, like... enrolled.");
      await g.wait(0.6);
      await g.say('danny', 'entranced', "I'm the guy who gets stuck. {p} That's my whole thing.", ENR);
    }
    const c = await g.choice(["I'm coming back for you. Promise.", "Hang in there. You're gonna be fine.", "I'm sorry, Danny."]);
    if (c === 0) {
      g.set('bond_danny');
      await g.say('danny', 'flicker', "You can't promise that.");
      await g.say('tess', 'determined', 'Watch me.');
      // The pencil stops mid-word.
      stopLoop('danny_pen', 0.05);
      g.anim('danny', 'sit_up', { hold: true });
      g.refresh();   // e2_chalk_205_lea: …I WILL NOT LEA
      await g.wait(0.9);
      await g.cam([21, 5], { time: 1.0 });
      await g.narrate('{dim}The pencil stops. On the board, the last line breaks off: I WILL NOT LEA{/dim}');
    } else if (c === 1) {
      await g.say('danny', 'entranced', 'Sure, Dolan.', ENR);
      await g.narrate("{dim}The pencil doesn't stop.{/dim}");
    } else {
      await g.narrate("{dim}He nods. The pencil doesn't stop.{/dim}");
    }
    release(g, 'marcus');
    g.checkpoint('danny bond');
    await g.run('ch5.period205');
  },

  /** The scripted period in 205 (DESIGN §6 V.2): Tess auto-sits; no fail. */
  'ch5.period205': async (g) => {
    if (g.flag('ch5_205_period_done')) return;
    if (HW.periods && HW.periods.phase !== 'idle') return;
    const replay = g.seen('ch5_period205');
    const C = g.colonel;
    const m = withMarcus(g) ? ent('marcus') : null;
    hold(g, 'marcus');
    // The chime. (Scripted: the bell waits until she's in her seat.)
    const bell = g.periods.start({ scripted: true, colonel: false, waitSeated: true, waitMax: 1e6, reason: 'ch5_205' });
    await g.wait(1.3);
    if (m) {
      g.face('marcus', 'tess');
      await g.say('marcus', 'urgent', 'Sit.');
    }
    // Her desk is two over from Danny's; Marcus takes the one nearest the door.
    const seatM = m ? HW.hiding?.nearestSeat?.(16 * TILE, 8 * TILE, { room: 'e2_room205' }) : null;
    const sitM = m && seatM ? HW.hiding.seatNpc(m, seatM, { run: true }) : null;
    await sitTess(g, 'e2_desk_205_tess', 'desk_205_tess');
    if (sitM) await sitM;
    look(g, 'up');
    const rang = await bell;
    if (!rang) { release(g, 'marcus'); return; }
    // The tubes stutter on. Down the hall they die again, one at a time, coming this way.
    const cam = g.cam([20, 9], { time: 1.6 });
    await g.wait(1.6);
    await C.spawn('fold:0', { mode: 'scripted', anim: 'emerge', dir: 'left' });
    await cam;
    await C.walkTo([16, 14]);
    C.face('up');
    await g.wait(0.9);
    const door = propOf('e2_door_205');
    if (door && door.state !== 'open') {
      HW.interact?.openDoor?.(door, { by: 'colonel', silent: true, hold: true });
      g.sfx('door_creak_slow', center(door));
    }
    await g.wait(0.7);
    await C.walkTo('colonel_205');
    await g.wait(0.5);
    // Along the back row, behind their chairs.
    await C.walkTo([19, 9]);
    C.face('up');
    await g.wait(0.8);
    g.sfx('colonel_jingle', { x: C.x, y: C.y - 16, vol: 0.8 });
    await C.anim('reach_up', { once: true, hold: true });
    HW.audio?.murmur?.(2.8);
    await g.say('voice', null, "Good boy. {p} I knew your grandfather's name.", VOICE);
    await g.wait(1.0);
    C.anim(null);
    await C.walkTo([22, 9]);
    C.face('up');
    // Beside her desk. The close pass.
    C.closePass();
    const p = HW.player;
    if (p) g.sfx('colonel_breath', { x: p.x + 6, y: p.y - 14, vol: 1 });
    await g.wait(0.9);
    await g.think('eyes_shut', '{dim}Pennies. {p} Danny was right.{/dim}', { hold: true });
    await g.wait(2.0);
    await C.walkTo('colonel_205');
    await C.walkTo([16, 14]);
    if (door) HW.interact?.closeDoor?.(door);
    await g.wait(0.5);
    await C.despawn({ sink: true });
    await g.wait(1.6);
    await g.periods.end();
    await g.cam(null, { time: 0.8 });
    // After.
    if (m?.seat) HW.hiding?.unseatNpc?.(m);
    if (HW.player?.seated) await HW.hiding?.stand?.();
    g.set('portrait_state', 'empty');   // downstairs, the chair in the lobby portrait is empty now
    release(g, 'marcus');
    if (!replay) {
      await g.wait(0.8);
      if (withMarcus(g)) {
        g.face('marcus', 'tess');
        look(g, 'marcus');
        await g.say('marcus', 'thoughtful', "He didn't hurt him. {p} He's *keeping* him.");
      }
      await g.say('tess', 'determined', g.flag('bond_danny') ? "Then I'm coming back for him." : "Then he's still in there.");
    }
    g.set('ch5_205_period_done');        // chapters.js opens the free periods on this flag
    g.objective('Leah. The library — west.');
    g.checkpoint('205 period');
  },

  // ------------------------------------------------------------------------------------------ 206
  'ch5.hall_pass': async (g, ctx) => {
    const p = ctx?.prop;
    if (g.has('hall_pass') || g.flag('longhall_cleared')) {
      if (p) g.removeProp(p.id);
      return;
    }
    if (p) g.removeProp(p.id);
    g.give('hall_pass');
    g.set('hall_pass');
    await g.examine("[n] A wooden paddle, burned in with a hot nail: HALL PASS — RM. 206. Hundreds of kids' thumbs wore the varnish off.");
    const sawSign = !!g.flag('seen_ch5_longhall_enter') || (Number(g.flag('longhall_loops')) || 0) > 0;
    if (sawSign && !g.seen('ch5_hall_pass')) await g.think('determined', "'Hall pass required.' {p} Okay. I've got one.");
    else g.seen('ch5_hall_pass');
  },

  // ------------------------------------------------------------------------------------------ the long hall
  'ch5.longhall_refuse': async (g) => {
    if (withMarcus(g)) {
      g.face('marcus', 'tess');
      await g.say('marcus', 'urgent', "Two-oh-five first. {p} He's right there, Tess.");
    } else {
      await g.think('worried', "Two-oh-five first. {p} He's right there.");
    }
    const p = HW.player;
    if (p && onMap('east2')) await g.walk('tess', [3, Math.max(13, Math.min(17, Math.floor(p.y / TILE)))]);
  },

  'ch5.longhall_enter': async (g) => {
    if (g.flag('longhall_cleared')) return;
    const replay = g.seen('ch5_longhall_enter');
    look(g, 'up');
    if (!replay) {
      await g.cam([83, 7], { time: 1.0 });
      await g.wait(0.5);
      await g.examine('[n] Lettered on the arch, in chalk that never smudged: HALL PASS REQUIRED BEYOND THIS POINT — BY ORDER OF THE PRINCIPAL.');
      if (g.has('hall_pass')) await g.think('determined', 'Got one.');
      else if (withMarcus(g)) await g.say('marcus', 'neutral', 'Hall pass. {p} Seriously.');
      // Across the void, in a thread of skylight: the portrait from the lobby.
      look(g, [78, 2]);
      await g.cam([78, 4], { time: 1.8 });
      await g.wait(1.4);
      await g.think('scared', "The lobby portrait. {p} The chair's empty.");
      // Down the hall: dark, and darker.
      look(g, 'left');
      await g.cam([64, 9], { time: 2.0 });
      await g.wait(0.9);
      await g.cam(null, { time: 1.0 });
    }
    g.checkpoint('long hall');
  },

  'ch5.gallery': async (g) => {
    look(g, [78, 2]);
    if (g.flag('expelled')) {
      await g.examine('[n] Across the dark, the portrait. Only his coat, slumped in the chair.');
      return;
    }
    if (!g.seen('ch5_gallery')) {
      await g.examine('[n] Across the dark, the lobby portrait: the gilt frame, the carved chair, the painted window behind it.');
      if (withMarcus(g)) await g.say('marcus', 'worried', "He's out. {p} He's somewhere in here with us.");
      else await g.think('scared', 'Nobody in the chair.');
      return;
    }
    await g.think('scared', withMarcus(g) ? 'Still empty.' : "Still empty. {p} He's somewhere.");
  },

  /** HW.longhall (non-blocking) after each loop: schedules the beat for that loop. */
  'ch5.longhall_loop': async (g, ctx) => {
    const n = Number(ctx?.loop) || 0;
    if (n === 4) return;   // ch5.longhall_voice has this one
    if (![1, 2, 3, 6].includes(n)) return;
    if ((n === 3 || n === 6) && (!withMarcus(g) || g.has('hall_pass'))) return;
    await g.wait(n === 2 ? 0.5 : 0.9);
    runWhenFree(g, 'ch5.longhall_line', { loop: n }, () => onMap('longhall') && !g.flag('longhall_cleared'));
  },

  /** HW.longhall (non-blocking) at loop 4: Leah's voice behind a painted door. */
  'ch5.longhall_voice': async (g) => {
    await g.wait(1.1);
    runWhenFree(g, 'ch5.longhall_line', { loop: 4 }, () => onMap('longhall') && !g.flag('longhall_cleared'));
  },

  'ch5.longhall_line': async (g, ctx) => {
    const n = Number(ctx?.loop) || 0;
    if (!onMap('longhall') || g.flag('longhall_cleared')) return;
    if (g.seen(`ch5_longhall_line_${n}`)) return;
    const p = HW.player;
    if (n === 1) {
      look(g, 'down');
      await g.wait(0.4);
      await g.think('worried', "That's the same door.");
      look(g, 'left');
    } else if (n === 2) {
      // Far down the hall, at the edge of the beam: a small figure with an orange belt.
      const tx = Math.floor(p.x / TILE) - 11;
      const k = g.spawn({ id: 'kevin_far', sprite: 'kevin', at: [tx, 9], dir: 'right' });
      if (k) k.shadow = false;
      const belt = HW.lighting?.addLight?.({ type: 'bulb', px: tx * TILE + 8, py: 9 * TILE + 2, radius: 0.9, intensity: 0.6, color: '#f06a1c', cage: false, glow: null, map: 'longhall' }) || null;
      look(g, 'left');
      g.sfx('squeak', { x: tx * TILE + 8, y: 9 * TILE + 8, vol: 0.5 });
      await g.cam([tx + 6, 9], { time: 1.0 });
      await g.wait(0.9);
      await g.think('scared', "He's wearing a Safety Patrol belt. {p} Those kids checked passes.");
      // The beam stutters. He's gone.
      g.flashlight(false);
      g.sfx('flashlight_flicker', { vol: 0.6 });
      await g.wait(0.14);
      g.despawn('kevin_far');
      if (belt) HW.lighting.removeLight(belt);
      g.flashlight('restore');
      await g.wait(0.5);
      await g.cam(null, { time: 0.8 });
    } else if (n === 3) {
      if (!withMarcus(g) || g.has('hall_pass')) return;
      g.face('marcus', 'tess');
      await g.say('marcus', 'thoughtful', 'There was a pass on a hook in 206.');
    } else if (n === 6) {
      if (!withMarcus(g) || g.has('hall_pass')) return;
      await g.say('marcus', 'urgent', 'Tess. {p} The hook in 206.');
    } else if (n === 4) {
      // A knock from behind the painted 201, then her voice.
      const door = propOf('lh_voice_door');
      const at = door ? center(door) : { x: p.x - 9 * TILE, y: p.y - 24 };
      look(g, door ? 'voice_door' : 'left');
      g.sfx('door_locked', { ...at, vol: 0.55, rate: 0.75 });
      await g.wait(0.45);
      g.sfx('door_locked', { ...at, vol: 0.5, rate: 0.7 });
      await g.wait(1.0);
      g.fx('distort', 0.2, 2.6);
      g.fx('chroma', 0.3, 2.6);
      await g.say('voice', null, 'Theresa? {p} Is that you? {p=0.7} Open the door.', { ...LEAH_Q, speed: 0.75 });
      await g.think('scared', "It's painted on. {p} It's *painted on*.");
      if (withMarcus(g)) await g.say('marcus', 'urgent', 'Keep walking.');
    }
  },

  /** Running in the long hall: the whistle, the dark, the breath at her neck — and back to the start. */
  'ch5.kevin_whistle': async (g) => {
    const p = HW.player;
    if (!p || !onMap('longhall')) return;
    const first = !g.seen('ch5_kevin_whistle');
    const C = g.colonel;
    g.sfx('whistle_breath', { x: p.x - 200, y: p.y - 20, vol: 0.8 });
    await g.wait(0.45);
    g.sfx('whistle', { x: p.x - 200, y: p.y - 20, vol: 1 });
    await g.wait(0.4);
    // The lights go. All of them.
    HW.lighting?.setAmbient?.(null, 0.995, 0.08);
    g.flashlight(false);
    const saved = blackout();
    await g.wait(1.1);
    // Behind her: the breath at her neck. Nothing to see but brass, winking.
    const v = p.dir === 'left' ? 1 : p.dir === 'right' ? -1 : 0;
    if (C) await C.spawn({ x: p.x + v * 14, y: p.y + (v ? 1 : 12) }, { mode: 'scripted', anim: null, dir: p.dir });
    g.sfx('colonel_breath', { x: p.x, y: p.y - 16, vol: 1 });
    if (first) g.sfx('stinger_soft', { vol: 0.7 });
    g.fx('vignette', 0.85, 0.3);
    await g.wait(1.6);
    g.sfx('colonel_jingle', { x: p.x + v * 14, y: p.y - 18, vol: 0.7 });
    await g.wait(0.9);
    if (C?.entity) await C.despawn({ sink: false });
    // Lights. She's back under the arch.
    g.setPos('tess', 'loop_reset');
    g.face('tess', 'left');
    HW.camera?.snap?.();
    unblackout(saved);
    HW.lighting?.setAmbient?.(null, HW.map?.data?.dark ?? 0.96, 0.5);
    g.flashlight('restore');
    g.fx('vignette', 0.25, 1.2);
    await g.wait(0.8);
    if (first) await g.think('terrified', "Okay. Okay okay okay. {p} Walk. Don't run.");
  },

  /** With the pass, at Kevin (DESIGN §6 V.4): he keeps it. Marcus goes around. Tess is alone. */
  'ch5.kevin_pass': async (g) => {
    if (g.flag('longhall_cleared')) return;
    const replay = g.seen('ch5_kevin_pass');
    const K = ent('kevin');
    const M = withMarcus(g) ? ent('marcus') : null;
    hold(g, 'marcus');
    await g.walk('tess', 'kevin_stop');
    look(g, 'left');
    await g.cam([6, 8], { time: 0.9 });
    await g.wait(0.9);
    if (K) {
      g.face('kevin', 'down');
      await g.anim('kevin', 'hand_out_down', { once: true, hold: true });
    }
    await g.wait(0.5);
    await g.say('kevin', null, '{dim}...pass.{/dim}');
    // She puts it in his hand.
    if (g.has('hall_pass')) g.take('hall_pass');
    g.set('hall_pass', false);
    g.sfx('desk_creak', { x: (K?.x ?? HW.player.x - 40), y: (K?.y ?? HW.player.y) - 10, vol: 0.4, rate: 1.4 });
    await g.wait(1.0);
    await g.say('kevin', null, '{dim}...one pass.{/dim}');
    await g.wait(0.6);
    // The hall snaps short in front of her — and stays long behind.
    g.set('longhall_cleared');
    g.sfx('wind_gust', { vol: 0.6 });
    g.fx('distort', 0.45, 0.6);
    g.shake(1.2, 0.3);
    if (M) { g.setPos('marcus', 'marcus_far'); g.face('marcus', 'left'); }
    if (K) g.setPos('kevin', [12, 9]);   // his hand, raised, between them
    await g.wait(0.5);
    look(g, 'right');
    await g.cam([18, 8], { time: 1.6 });
    await g.wait(1.0);
    if (M) {
      await g.say('marcus', 'determined', "One student. Right. {p} Go. {p} I'll go around — east stairs. Find Leah.");
      g.face('marcus', 'right');
      await g.walk('marcus', [40, 9]);
      g.despawn('marcus');
    }
    g.state.party = g.state.party.filter((id) => id !== 'marcus');
    HW.entities?.syncParty?.();
    g.set('ch5_marcus_around');
    await g.cam(null, { time: 1.0 });
    look(g, 'left');
    if (!replay) await g.say('tess', 'sad', 'He kept it. {p} Of course he kept it.');
    g.objective('The library. West end.');
    g.checkpoint('long hall cleared');
  },

  // ------------------------------------------------------------------------------------------ west2, alone
  'ch5.west2_arrive': async (g) => {
    if (g.flag('adair_met') || g.seen('ch5_west2_arrive')) return;
    await g.wait(0.5);
    look(g, 'left');
    await g.wait(0.8);
    await g.think('worried', 'Water. {p} A tap running, all the way down at the end.');
  },

  'ch5.mirror': async (g) => {
    if (g.flag('adair_met')) return;
    if (!periodQuiet()) return;   // never mid-period (the trigger re-arms)
    const replay = g.seen('ch5_mirror');
    await g.walk('tess', 'mirror_2f');
    look(g, 'up');
    await g.cam([4, 4], { time: 1.0 });
    if (!replay) {
      await g.wait(0.7);
      await g.think('worried', "There's no water in this building. {p} There hasn't been since the buyout.");
      await g.wait(0.3);
    }
    // The tap stops.
    stopLoop('faucet', 0.05);
    g.sfx('pipe_knock', { x: 4 * TILE + 8, y: 3 * TILE + 8, vol: 0.4, rate: 0.8 });
    await g.wait(replay ? 0.6 : 2.0);
    // In the glass: herself — and a woman behind her shoulder.
    const glass = () => {
      if (ent('adair_glass')) g.despawn('adair_glass');
      const a = g.spawn({ id: 'adair_glass', sprite: 'adair', px: 4 * TILE + 8 + 9, py: 3 * TILE + 2, dir: 'down', alpha: 0.72 });
      if (a) a.shadow = false;
      return a;
    };
    let sheen = null;
    const sheenOn = () => {
      if (!sheen) sheen = HW.lighting?.addLight?.({ type: 'bulb', px: 4 * TILE + 17, py: 2 * TILE - 2, radius: 1.3, intensity: 0.6, color: '#9ec3c9', cage: false, glow: null, map: 'west2' }) || null;
    };
    const sheenOff = () => { if (sheen) { HW.lighting?.removeLight?.(sheen); sheen = null; } };
    g.sfx('glass_tone', { vol: 0.7 });
    glass();
    sheenOn();
    await g.wait(1.6);
    g.sfx('breath_hold', { vol: 0.5 });
    // She turns round. Nobody.
    look(g, 'down');
    g.despawn('adair_glass');
    sheenOff();
    await g.wait(1.6);
    // Back to the glass. Her finger in the fog.
    look(g, 'up');
    await g.wait(0.6);
    const a = glass();
    sheenOn();
    a?.playAnim('write', { hold: false });
    g.sfx('glass_write', { vol: 0.9 });
    await g.wait(1.4);
    await g.narrate(g.flag('roll1_answered') ? "{dim}YOU ANSWERED. DON'T AGAIN.{/dim}" : "{dim}DON'T ANSWER HIM{/dim}");
    await g.wait(0.5);
    // She points at my bag.
    a?.playAnim('point_down', { once: true, hold: true });
    await g.wait(1.3);
    g.set('adair_met');
    await g.think('worried', "My bag. {p} ...Mom's compact.");
    // The compact: the room as it was that Friday.
    g.set('compact_unlocked');
    if (!auto()) {
      await g.narrate(`{dim}Press ${keyLabel('compact')} — Mom's compact.{/dim}`, { hold: true });
      HW.input?.consume?.('compact');
      await HW.game.until(() => !g.alive || !!HW.input?.pressed?.('compact'), 30);
      HW.input?.consume?.('compact');
    }
    g.despawn('adair_glass');
    sheenOff();
    await compactLook(g, 'rr2f_1979', 'curious', 'It remembers. {p} The mirror remembers that Friday.', 2.8);
    // Down the hall, in 201: the door swings open; a chair takes somebody's weight.
    await g.wait(0.8);
    spawnFalseLeah(g);
    const door = propOf('w2_door_201');
    if (door) {
      g.setProp(door.id, 'open');
      g.sfx('door_creak_slow', { ...center(door), vol: 0.9 });
    }
    await g.wait(1.4);
    g.sfx('chair_scrape', { ...cell(15, 9), vol: 0.9 });
    look(g, 'right');
    await g.wait(0.6);
    await g.think('scared', 'That came from two-oh-one.');
    await g.cam(null, { time: 0.8 });
    g.objective('Room 201.');
    g.checkpoint('adair met');
  },

  'ch5.room202': async (g) => {
    if (g.seen('ch5_room202')) return;
    await g.wait(0.3);
    look(g, 'history_board');
    await g.cam([28, 4], { time: 1.0 });
    await g.wait(0.6);
    await g.think('sad', 'OUR PROUD HERITAGE. {p} Breaker boys on benches. Some of them look eight.');
    if (g.state.docs?.charter_excerpt) await g.think('worried', "'Subject to its rules as any child.' {p} He made himself a student.");
    await g.cam(null, { time: 0.8 });
  },

  // ------------------------------------------------------------------------------------------ 201
  'ch5.false_leah': async (g) => {
    if (g.flag('false_leah_done') || !g.flag('adair_met')) return;
    if (chapter(g) !== 5) { finishFalseLeah(g); return; }   // not with Marcus back (Ch6+)
    if (!periodQuiet()) return;
    const replay = g.seen('ch5_false_leah');
    const L = ent('false_leah') || spawnFalseLeah(g);
    g.checkpoint('201 threshold');
    look(g, 'false_leah');
    await g.cam([17, 7], { time: 1.0 });
    if (!replay) {
      await g.wait(1.4);
      await g.say('tess', 'relieved', 'Leah—');
      await g.wait(1.2);
      await g.say('voice', null, 'I got out of the library, Theresa. {p} I came to find you.', LEAH_Q);
      await g.think('confused', 'Theresa.');
      await g.wait(0.6);
      // The camcorder in her lap, its red light on.
      if (L) g.sfx('camcorder_whir', { x: L.x, y: L.y - 8, vol: 0.35 });
      await g.think('scared', "That's in my bag. {p} That's in my *bag*.");
      // In the beam, her shadow climbs the wall behind her. It is the wrong shape.
      look(g, [15, 6]);
      await shadowOn(g);
      await g.wait(2.6);
      // The compact.
      await compactLook(g, 'room201_1979', 'terrified', "Her chair's empty. {p} And the corner isn't.", 2.6);
    } else {
      await shadowOn(g);
    }
    look(g, 'false_leah');
    await g.say('voice', null, 'Sit with me, Theresa. {p} Like homeroom.', LEAH_Q);
    let asked = false;
    for (;;) {
      const c = await g.choice([{ text: 'Ask about the tape', cond: () => !asked }, 'Sit down', 'Back out slowly']);
      if (c === 0) {
        asked = true;
        await g.say('tess', 'scared', 'The tape. {p} The one you gave me in the car.');
        await g.say('voice', null, 'For the drive, silly. {p} Pittsburgh. {p} Thanksgiving.', LEAH_Q);
        await g.think('terrified', "That's what *I* said. {p} In the car. That's my line, not hers.");
        continue;
      }
      if (c === 1) {
        // She sits down beside her.
        await sitTess(g, 'w2_desk_201_tess', 'desk_201_tess');
        await g.wait(1.0);
        await g.say('voice', null, 'There. {p=0.8} Present.', LEAH_Q);
        g.sfx('colonel_grab', { x: HW.player.x, y: HW.player.y - 10, vol: 1 });
        g.flash('#000', 0.4);
        await g.gameOver('present');
        return;
      }
      break;
    }
    // Back out slowly. Her head turns — too far.
    await g.wait(0.5);
    await g.walk('tess', [20, 9]);
    look(g, 'false_leah');
    await g.wait(0.6);
    if (L) { L.sitDir = 'down'; L.dir = 'down'; }
    g.sfx('stinger_hard');
    g.fx('chroma', 0.7, 0.9);
    g.fx('distort', 0.5, 0.9);
    g.shake(2, 0.4);
    if (HW.colonel?.entity) HW.colonel.face('tess');
    await g.narrate('{shake}Her head turns. {p} It keeps turning.{/shake}');
    // Out. Backwards, eyes on her, then the door.
    const out = g.walk('tess', 'door_hold', { run: true });
    g.anim('tess', 'walk_up');
    await out;
    g.anim('tess', null);
    look(g, 'up');
    const door = propOf('w2_door_201');
    if (door && door.state === 'open') HW.interact?.closeDoor?.(door);
    g.sfx('door_slam', { ...(door ? center(door) : cell(20, 11)), vol: 1 });
    g.shake(1.5, 0.2);
    const r = await holdDoor(g);
    if (r !== 'held') {
      if (door) g.setProp(door.id, 'open');
      g.sfx('door_slam', { ...(door ? center(door) : cell(20, 11)), vol: 1, rate: 0.8 });
      g.sfx('colonel_grab', { x: HW.player.x, y: HW.player.y - 10, vol: 1 });
      g.shake(3, 0.4);
      g.flash('#000', 0.4);
      await g.gameOver('present');
      return;
    }
    // Silence. Then nothing on the other side at all.
    finishFalseLeah(g);
    g.silence(true, 0.05);
    await g.wait(3.0);
    g.silence(false, 1.2);
    await g.wait(0.9);
    if (door) {
      HW.interact?.openDoor?.(door, { hold: true });
    }
    await g.walk('tess', [20, 10]);
    look(g, [15, 8]);
    await g.cam([16, 7], { time: 1.0 });
    await g.wait(1.4);
    g.sfx('paper_rustle', { vol: 0.5 });
    await g.think('scared', "Empty. {p} ...The camcorder's still in my bag. It never left my bag.");
    await g.cam(null, { time: 0.8 });
    g.objective(g.flag('ch5_leah_found') ? 'The library. Leah.' : "The library. The door by the girls' room.");
  },

  // ------------------------------------------------------------------------------------------ the library
  'ch5.library_enter': async (g) => {
    if (g.flag('ch5_leah_found') || g.seen('ch5_library_enter')) return;
    look(g, 'down');
    // Over the rail, down to the only lit lamp.
    await g.cam([11, 15], { time: 2.0 });
    await g.wait(1.2);
    if (g.flag('false_leah_done')) await g.think('scared', 'The real one. {p} Please be the real one.');
    else await g.think('relieved', "Leah. {p} She hasn't looked up once.");
    await g.cam(null, { time: 1.2 });
    g.objective('Down to Leah. The spiral stairs.');
  },

  'ch5.leah': async (g) => {
    if (g.flag('ch5_leah_found')) return;
    const replay = g.seen('ch5_leah');
    if (!ent('leah')) seatLeah(g);
    await g.walk('tess', 'leah_talk');
    look(g, 'leah');
    await g.cam([11, 15], { time: 1.0 });
    if (!replay) {
      await g.wait(0.9);
      await g.say('tess', 'relieved', "Leah. {p} Hey. It's me.");
      await g.wait(0.8);
      await g.say('leah', 'entranced', "There's no due date. Every card. {p} Nobody ever has to bring anything back.", ENR);
      await g.say('leah', 'entranced', "My sister's like that. You check out, they stamp you, you just... keep going. {p} Nobody calls.", ENR);
      g.sfx('paper_rustle', { ...cell(11, 16), vol: 0.5 });
      await g.narrate('I put my hand over hers. It keeps writing under mine. LEAH BRANDT. LEAH BRANDT.');
      await g.wait(0.6);
    }
    await g.say('leah', 'hurt', 'Where were you gonna go, T? {p} After.');
    const c = await g.choice(['Philly. Mom took a job. We leave at Christmas.', "Let's talk about it when we're out.", "Nowhere. I'm right here."]);
    if (c === 0) {
      g.set('bond_leah');
      await g.wait(0.6);
      await g.say('leah', 'hurt', 'I know.');
      await g.wait(1.4);
      await g.say('leah', 'hurt', 'Since August. Your mom told my mom. In the Acme. {p} By the *lunchmeat*, T.');
      await g.say('leah', 'crying', 'I kept waiting. {p} I made the tape in August.');
      await g.say('tess', 'look_away', 'I thought you meant Pittsburgh.');
      await g.say('leah', 'hurt', 'I know what you thought.');
      g.sfx('book_close', { ...cell(12, 17), vol: 0.8 });
      await g.wait(1.0);
      await g.narrate("She holds up a card that isn't hers. PENNSYLVANIA SCHOOL CODE, 1949 — ADAIR, R. — DUE OCT 26 1979.");
      await g.say('leah', 'talk', 'Adair checked out the School Code. Withdrawals. {p} You can *withdraw* people. Like a transfer.');
      await g.wait(1.2);
      await g.say('leah', 'hurt', 'Like you.');
      g.set('ch5_leah_clue');
    } else if (c === 1) {
      await g.say('leah', 'deadpan', "Sure. Later. {p} You're good at later.");
      g.sfx('paper_rustle', { ...cell(11, 16), vol: 0.4 });
      await g.narrate('She pushes a card across the table without looking. PENNSYLVANIA SCHOOL CODE, 1949 — ADAIR, R. — DUE OCT 26 1979. In red pencil, inside the pocket: WITHDRAWALS, p. 212.');
      await g.say('leah', 'entranced', "WITHDRAWN. {p} It's what they'll stamp on you too.", ENR);
      g.set('ch5_leah_clue');
    } else {
      await g.narrate('She goes back to writing her name. Under her hand, one card isn\'t hers: ADAIR, R. — DUE OCT 26 1979.');
    }
    g.set('adair_named');
    await g.think('determined', 'R. Adair. {p} The woman in the mirror. {p} It has to be.');
    await g.say('leah', 'crying', "My hand won't stop, T. {p} Go. Come back.");
    g.set('ch5_leah_found');
    g.refresh();   // her checkout cards on the table
    await g.cam(null, { time: 0.8 });
    g.objective('The library doors. Marcus went around.');
    g.checkpoint('leah bond');
  },

  'ch5.catalog': async (g) => {
    if (g.flag('case_key') || g.has('case_key') || g.has('charter')) {
      await g.examine('[n] HA–HE, pulled out, empty. The rest of the drawers sit shut in their brass frames.');
      return;
    }
    if (!g.flag('saw_catalog_past') && !g.flag('adair_note')) {
      const n = g.inc('ch5_catalog_tries');
      await g.think('skeptical', 'Hundreds of drawers. {p} I\'d need to know which one.');
      if (n >= 2 && g.flag('compact_unlocked')) await g.think('worried', 'The mirror remembered the restroom. {p} Maybe it remembers this.');
      return;
    }
    g.sfx('paper_rustle', { vol: 0.6 });
    await g.examine('[n] HA–HE. The drawer slides all the way out. Behind the last card, taped to the wood: a small brass key.');
    g.give('case_key');
    g.set('case_key');
    await g.think('determined', 'H for Hallowell.');
  },

  'ch5.case': async (g, ctx) => {
    const p = ctx?.prop || propOf('lib_case');
    if (g.has('charter') || g.flag('charter')) {
      await g.examine("[n] KETTLE RUN HISTORICAL COLLECTION. The velvet still has the dent where it lay. It's in my bag now.");
      return;
    }
    if (!g.has('case_key')) {
      g.sfx('door_locked', { vol: 0.5, rate: 1.3 });
      await g.examine("[n] Locked. Under the glass: pages in a cramped brown hand, and a typed card — THE FOUNDER'S CHARTER, 1911. COMPLETE INSTRUMENT.");
      if (!g.seen('ch5_case_locked')) await g.think('worried', 'The rest of it. {p} The whole thing, in his own handwriting.');
      return;
    }
    g.sfx('key_unlock', p ? center(p) : {});
    if (p) g.setProp(p.id, 'empty');
    g.take('case_key');
    g.give('charter');
    g.set('charter');
    await g.doc('charter_full');
    await g.think('worried', "'The first scholar of Hallowell School.' {p} He put himself on the roll.");
  },

  'ch5.marcus_knock': async (g) => {
    if (g.flag('library_door_open') || g.flag('ch5_knocked') || !g.flag('ch5_leah_found')) return;
    const replay = g.seen('ch5_marcus_knock');
    const doors = propOf('lib_doors');
    const at = doors ? center(doors) : cell(27, 19);
    // Three knocks on the barricaded doors.
    for (let i = 0; i < 3; i++) { g.sfx('door_locked', { ...at, vol: 0.8, rate: 0.85 }); await g.wait(0.42); }
    g.shake(0.4, 0.2);
    look(g, 'barricade');
    await g.cam([23, 18], { time: 1.0 });
    await g.wait(0.8);
    await g.narrate('{dim}Through the barricade, muffled: "Tess? {p} It\'s Marcus."{/dim}');
    await g.say('tess', 'scared', 'Say my name.');
    await g.wait(replay ? 0.5 : 1.8);
    await g.narrate('{dim}"...Tess."{/dim}');
    if (!replay) await g.think('relieved', 'Tess. {p} Not Theresa.');
    g.set('ch5_knocked');
    await g.cam(null, { time: 0.8 });
    g.objective('Let Marcus in. The barricade.');
    g.checkpoint('marcus knocks');
  },

  'ch5.unbar': async (g) => {
    if (g.flag('library_door_open')) return;
    if (!g.flag('ch5_knocked')) {
      await g.examine('[n] A reading table, two chairs and a book cart, jammed against the doors. From in here.');
      if (g.flag('ch5_leah_found')) await g.think('worried', 'Somebody wanted to keep something out. {p} Or in.');
      return;
    }
    const replay = g.seen('ch5_unbar');
    look(g, 'right');
    // The cart, the chairs, the table: dragged screeching across the floor.
    for (const [r, v] of [[1.0, 0.8], [0.8, 0.9], [0.65, 1]]) {
      g.sfx('chair_scrape', { ...cell(25, 19), vol: v, rate: r });
      g.shake(0.4, 0.15);
      await g.wait(0.55);
    }
    g.sfx('desk_creak', { ...cell(25, 19), vol: 0.8, rate: 0.7 });
    g.set('library_door_open');
    g.refresh();
    for (const id of ['lib_doors', 'lib_doors_b']) if (propOf(id)) g.setProp(id, 'open');
    g.sfx('door_open_wood', { ...cell(27, 19), vol: 0.9 });
    // Marcus, in the doorway.
    if (!ent('marcus')) g.spawn({ id: 'marcus', sprite: 'marcus', at: [26, 20], dir: 'left' });
    await g.walk('marcus', [23, 19]);
    g.face('marcus', 'tess');
    look(g, 'marcus');
    g.party.add('marcus');
    if (!replay) await g.wait(0.4);
    await g.run('ch5.end');
  },

  'ch5.end': async (g) => {
    const replay = g.seen('ch5_end');
    if (!replay) {
      if (ent('leah')) g.face('marcus', 'leah');
      await g.wait(0.9);
      await g.say('marcus', 'sad', '...Leah.');
      await g.say('tess', 'sad', "She won't get up. {p} Her hand won't stop.");
      await g.wait(0.8);
      g.face('marcus', 'tess');
      await g.say('marcus', 'thoughtful', "Came past the office. {p} Haupt's door was standing open. That little painting of him's crooked.");
      if (g.flag('ch5_leah_clue')) await g.think('look_away', "WITHDRAWN. {p} The office stamps it on the form. Mine's in my bag.");
      await g.say('tess', 'determined', "Crooked painting in a principal's office. {p} There's a safe behind it.");
      await g.say('marcus', 'soft_smile', 'Every movie.');
    }
    g.objective("Haupt's office. The safe.");
    await g.chapter(6);
    if (HW.scripts?.has?.('ch6.start')) await g.run('ch6.start');
  },

  // ------------------------------------------------------------------------------------------ map hooks
  /** east2 onEnter: Danny at his desk (Ch5–6), his pencil; resume the 205 period after a reload. */
  'ch5.enter_east2': async (g) => {
    const ch = chapter(g);
    if (ch < 5 || g.flag('ch7_started')) return;
    seatDanny(g);
    if (ch !== 5) return;
    if (g.flag('ch5_danny_found') && !g.flag('ch5_205_period_done')) {
      runWhenFree(g, 'ch5.period205', {}, () => onMap('east2') && !g.flag('ch5_205_period_done'));
    } else if (!g.flag('ch5_danny_found') && !g.flag('seen_ch5_upstairs')) {
      runWhenFree(g, 'ch5.upstairs', {}, () => onMap('east2') && !g.flag('ch5_danny_found'));
    }
  },

  /** west2 onEnter: the tap (until Adair), the False Leah (after Adair), and the 201 retry. */
  'ch5.enter_west2': async (g) => {
    const ch = chapter(g);
    if (ch < 5) return;
    // The running tap (map `sounds` is not wired in the engine yet — see the map header).
    if (!g.flag('adair_met')) mapLoop('faucet', 'faucet', { x: 4 * TILE + 8, y: 3 * TILE + 8 }, 1);
    if (ch !== 5) return;
    if (g.flag('adair_met') && !g.flag('false_leah_done')) {
      spawnFalseLeah(g);
      // A retry from the 201 threshold checkpoint puts her straight back at the decision point.
      const p = HW.player;
      const in201 = p && HW.map?.roomAt(p.x, p.y)?.id === 'w2_room201';
      if (g.state.checkpoint === '201 threshold' && in201) {
        runWhenFree(g, 'ch5.false_leah', {}, () => onMap('west2') && !g.flag('false_leah_done'));
      }
    } else if (g.flag('longhall_cleared') && !g.flag('adair_met') && !g.flag('seen_ch5_west2_arrive')) {
      runWhenFree(g, 'ch5.west2_arrive', {}, () => onMap('west2') && !g.flag('adair_met'));
    }
  },

  /** library onEnter: Leah at her table under the lamp (Ch5–6), writing. */
  'ch5.enter_library': async (g) => {
    if (chapter(g) < 5 || g.flag('ch7_started')) return;
    seatLeah(g);
  },
};
