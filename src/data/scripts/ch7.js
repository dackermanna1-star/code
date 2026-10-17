// CHAPTER VII — Assembly (lobby, aud; alone). DESIGN §6 VII · CONTENT §3 · owner: narrative-4.
//
//   ch7.start        (lobby trigger, ch6_marcus_taken) the chapter card; the intercom: "All students will
//                    report…"; the memorial — three Polaroids (pencil if bonded, ink if not) and Tess's frame
//                    by rollAnswered; Mom's voice ('Mom?'). Checkpoint 'lobby'.
//   ch7.aud_doors    (lobby_aud_doors) the chain (bolt cutters), the key, the gate (DESIGN §9.2).
//   ch7.aud_enter    (aud trigger) the Assembly: husks in every seat, one spotlight, the Colonel at the
//                    lectern reading "Hallowell, Cyrus. First pupil." — "Present."; the friends in the front
//                    row (danny_e / leah_e / marcus_e) beside Denise's husk; HW.assembly.start().
//   ch7.roll3        (assembly system: first sit in rows 1–4) his bust, light 'under': "Theresa Dolan?"
//                    [Here.] / [(Say nothing.)]. roll3_done / roll3_answered. Checkpoint 'roll 3'.
//   ch7.front_danny / ch7.front_leah / ch7.front_marcus   (sit in the empty seat beside a friend; the
//                    cutscene pauses the cycle) bond-dependent; Marcus: the diary page → bond_marcus, or the
//                    no-page branch.
//   ch7.clarinet     Denise's clarinet case → the diary page. Checkpoint 'music room'.
//   ch7.mirror       Adair points east: FINISH IT (or, without the Charter, HE IS ON THE ROLL…).
//   ch7.phonograph   the record from the intercom. A few bars, then a hand on the platter. "Hm."
//   ch7.stage_door   unbar the stage door (→ lobby NE corner, the back way).
//   ch7.lever        the trapdoor lever; without the Charter a one-time choice [Go down.] / [Go back for it.].
//   ch7.trapdoor     (aud exit refusal while chapter < 8) the point of no return: checkpoint, → Chapter VIII.
//
// Module hooks: on every aud load in Chapter VII the friends are seated in the front row again (map loads
// clear NPCs) and the 'assembly' light group is on; a sit in a `front` seat (aud_seats.js) runs that
// friend's scene once roll #3 is done; the Assembly's READ phase murmurs names and the husks answer.
import HW from '../../engine/hw.js';
import { chimeRate } from '../../game/chapters.js';
import { look, tween, fog, glassGhost, auto, hasTrack, installCh6 } from './ch6.js';

const TILE = 16;
const FRIENDS = ['danny', 'leah', 'marcus'];
const MIMIC = { name: 'Mom?', speed: 0.8 };
const UNDER = { light: 'under' };

const bonded = (s, id) => !!(s?.bonds?.[id] || s?.flags?.[`bond_${id}`]);
const IN_SESSION = (s = HW.state) => !!s && s.chapter === 7 && !!s.flags.ch7_started && !s.flags.register_done;

/** The three of them, entranced, in their front-row seats (danny_e / leah_e / marcus_e). */
function seatFriends() {
  const map = HW.map;
  if (!map || map.id !== 'aud' || !HW.entities || !HW.hiding) return;
  for (const id of FRIENDS) {
    if (HW.state.flags[`withdrawn_${id}`]) continue;
    const seat = map.prop(`aud_seat_${id}`);
    if (!seat) continue;
    let e = HW.entities.get(id);
    if (!e) e = HW.entities.spawn({ id, sprite: `${id}_e`, at: `front_row_${id}`, dir: 'up' });
    if (e && e.seat !== seat) HW.hiding.seatNpc(e, seat, { walk: false });
  }
}

function assemblyLights() {
  HW.lighting?.setGroup?.('assembly', true, { mode: 'instant' });
}

/** Spotlight helpers (the assembly system owns the light; scenes may steer it while paused). */
function spotTo(pt, sec = 1.2) {
  const s = HW.assembly?.spot;
  if (!s || !pt) return Promise.resolve();
  const x0 = s.px;
  const y0 = s.py;
  return tween(sec, (k) => { s.px = x0 + (pt.x - x0) * k; s.py = y0 + (pt.y - y0) * k; s._spriteDirty = true; });
}

// ---------------------------------------------------------------------------------------------
let installed = false;
let frontGen = -1;
const frontBusy = new Set();
function install() {
  if (installed) return true;
  if (!HW.game?.on || !HW.scripts) return false;
  installed = true;
  installCh6();
  HW.game.on('mapLoad', (map) => {
    if (!IN_SESSION()) return;
    assemblyLights();
    if (map?.id === 'aud') {
      seatFriends();
      if (HW.state.flags.ch7_assembly) HW.audio?.ambience?.('assembly', 1);
    }
  });
  // Front row: sit in the empty seat beside a friend → that friend's scene (after roll #3, which the
  // same sit fires first when it's due).
  HW.game.on('sit', (prop) => {
    const friend = prop?.inst?.front;
    if (!friend || HW.map?.id !== 'aud' || !IN_SESSION() || frontBusy.has(friend)) return;
    frontBusy.add(friend);
    const gen = HW.scripts.gen;
    HW.game.until(() => gen !== HW.scripts.gen || HW.player?.seated !== prop
      || (!!HW.state.flags.roll3_done && !HW.scripts.blocking && HW.game.mode === 'play'), 120).then(() => {
      frontBusy.delete(friend);
      if (gen !== HW.scripts.gen || HW.player?.seated !== prop || !HW.state.flags.roll3_done) return;
      HW.scripts.run(`ch7.front_${friend}`, { prop });
    });
  });
  // READ: names, murmured from the lectern; now and then the house answers.
  HW.game.on('assemblyPhase', (phase) => {
    if (HW.map?.id !== 'aud' || !IN_SESSION() || phase !== 'read') return;
    const e = HW.colonel?.entity;
    try { HW.audio?.murmur?.(5.5); } catch { /* audio stub */ }
    if (frontGen === HW.scripts.gen && Math.random() < 0.5) return;
    frontGen = HW.scripts.gen;
    const gen = HW.scripts.gen;
    HW.game.afterSteps(2 + Math.random() * 3).then(() => {
      if (gen !== HW.scripts.gen || HW.map?.id !== 'aud') return;
      HW.audio?.sfx?.('husk_rustle', e ? { x: e.x, y: e.y + 6 * TILE, vol: 0.35 } : { vol: 0.25 });
    });
  });
  return true;
}
if (typeof window !== 'undefined') {
  const poll = setInterval(() => { if (install()) clearInterval(poll); }, 200);
}

// ---------------------------------------------------------------------------------------------
export default {
  // ------------------------------------------------------------------------------------------ the lobby
  'ch7.start': async (g) => {
    install();
    if ((g.state.chapter || 0) < 7) await g.chapter(7);   // the card; party []; ch7_started
    if (!g.flag('ch7_started')) g.set('ch7_started');
    g.refresh();                                          // the memorial: Tess's frame
    if (HW.patrol) { HW.patrol.disable(); if (g.npc('kevin')) HW.patrol.despawn('kevin'); }
    HW.lighting?.setGroup?.('assembly', true, { mode: 'fade', time: 2.5 });
    const replay = g.seen('ch7_start');
    g.music(null, 0.5);                                   // the phonograph stops mid-bar
    if (!replay) {
      await g.wait(1.4);
      g.sfx('intercom_crackle', { vol: 0.7 });
      await g.wait(0.8);
      g.sfx('intercom_chime', { rate: chimeRate(7) });
      await g.wait(2.6);
      await g.say('voice', null, "All students will report to the auditorium for the Founder's Day Assembly.", { name: 'INTERCOM', speed: 0.85 });
      // Behind the auditorium doors, a crowd settling into seats. Warm light along the sill.
      const doors = HW.map?.anchor('aud_doors');
      if (doors) g.sfx('crowd_murmur', { x: doors.x, y: doors.y - 16, vol: 0.55 });
      await g.wait(1.8);
      // The memorial board.
      await g.walk('tess', 'memorial');
      look(g, 'up');
      await g.cam([4, 5], { time: 1.2 });
      await g.wait(0.8);
      const s = g.state;
      const ink = (id) => (bonded(s, id) ? 'in pencil' : 'in ink');
      await g.narrate(`Three Polaroids now, pinned over the Nine. Danny. Leah. Marcus. Under each, 1996 — Danny's ${ink('danny')}, Leah's ${ink('leah')}, Marcus's ${ink('marcus')}.`);
      const r = Math.min(2, s.rollAnswered || 0);
      await g.narrate(['Under them, a little frame on a nail. A typed card: THERESA DOLAN. The frame is empty.',
        'Under them, a little frame on a nail. A typed card: THERESA DOLAN. Inside, a pencil sketch: a girl at a desk, head down.',
        'Under them, a little frame on a nail. A typed card: THERESA DOLAN. Inside, a Polaroid: a girl at a desk, head down.'][r]);
      await g.think(r === 0 ? 'scared' : r === 1 ? 'scared' : 'terrified',
        ['Empty. {p} Keep it empty.', "That's me. {p} In pencil.", "That's me. {p=0.8} That's ink."][r]);
      await g.wait(1.0);
      // Mom (R7: the school uses your full name).
      g.sfx('intercom_crackle', { vol: 0.8 });
      await g.wait(1.6);
      g.fx('distort', 0.22, 5);
      g.fx('chroma', 0.3, 5);
      await g.say('voice', null, 'Theresa.', MIMIC);
      await g.wait(1.6);
      await g.say('voice', null, 'Theresa Marie Dolan. {p} You answer me when I call you.', MIMIC);
      await g.wait(1.4);
      look(g, 'down');
      await g.say('tess', 'sad', "...She only does the middle name when it's bad.");
      await g.wait(1.2);
      await g.say('tess', 'determined', "She's on nights at Pottsville. She doesn't know I'm here. {p} Nice try.");
      await g.cam(null, { time: 0.9 });
    }
    g.objective('The auditorium.');
    g.checkpoint('lobby');
  },

  /** lobby_aud_doors: chain + key + the gate (aud_key && ch6_marcus_taken). */
  'ch7.aud_doors': async (g, ctx) => {
    const door = ctx?.prop || g.prop('lobby_aud_doors');
    const f = g.state.flags;
    look(g, 'up');
    if (door?.state === 'open') { await g.transfer('aud', 'from_lobby'); return; }
    const at = door ? { x: (door.x + 1) * TILE, y: (door.y + 1) * TILE } : null;
    if (g.has('aud_key') && f.ch6_marcus_taken) {
      if (!f.aud_chain_cut) {
        g.sfx('bolt_cutters', at ? { ...at, vol: 1 } : { vol: 1 });
        g.shake(0.8, 0.2);
        await g.wait(0.4);
        g.sfx('chain_rattle', at ? { ...at, vol: 0.9 } : { vol: 0.9 });
        g.set('aud_chain_cut');
        await g.narrate('The chain drops through the push bars and piles on the floor.');
      }
      g.sfx('key_unlock', at || {});
      await g.wait(0.7);
      if (!g.seen('ch7_aud_doors')) await g.narrate('The brass key turns like it was oiled this morning. Warm light comes through the crack. And a sound like a full house, holding its breath.');
      if (door) g.setProp(door.id, 'open');
      g.sfx('door_creak_slow', at || {});
      await g.wait(0.6);
      await g.transfer('aud', 'from_lobby');
      return;
    }
    g.sfx('chain_rattle', at ? { ...at, vol: 0.7 } : { vol: 0.7 });
    if (g.has('aud_key') && !f.ch6_marcus_taken) {
      await g.think('determined', "Marcus went toward the gym. I'm not doing this without him.");
      return;
    }
    if (g.has('bolt_cutters') && !f.aud_chain_cut && (g.state.chapter || 0) >= 2) {
      await g.examine('[n] AUDITORIUM. A chain through both push bars, and a padlock gone orange with rust.');
      const c = await g.choice(['Cut the chain.', 'Leave it.']);
      if (c !== 0) return;
      g.sfx('bolt_cutters', at ? { ...at, vol: 1 } : { vol: 1 });
      HW.noise?.emit?.(at?.x ?? 0, at?.y ?? 0, null, 'bolt_cutters');
      g.set('aud_chain_cut');
      await g.wait(0.5);
      await g.examine("[n] Chain's off. Doors are still locked. Old keyhole.");
      return;
    }
    let text = door?.inst?.lockedText;
    if (typeof text === 'function') text = text(g.state);
    await g.examine(text || "[n] Chain's off. Doors are still locked. Old keyhole.");
  },

  // ------------------------------------------------------------------------------------------ the Assembly
  /** aud trigger (crossing into the house). */
  'ch7.aud_enter': async (g) => {
    install();
    g.set('ch7_assembly');                    // the coal chute's window closes (DESIGN §9.2)
    assemblyLights();
    seatFriends();
    g.ambience('assembly', 1.5);
    if (!HW.assembly?.active) HW.assembly?.start?.();
    const replay = g.seen('ch7_aud_enter');
    const p = g.player;
    await g.walk('tess', [Math.max(16, Math.min(28, Math.floor(p.x / TILE))), 32]);
    look(g, 'up');
    if (!replay) {
      await g.wait(0.8);
      await g.cam([21, 25], { time: 2.4 });
      g.sfx('husk_rustle', { x: 21 * TILE, y: 24 * TILE, vol: 0.5 });
      await g.narrate('Every seat is taken. Shapes sitting up straight, the color of old honey, and you can see through them. Every one of them facing the stage.');
      await g.cam([21, 13], { time: 2.6 });
      await g.wait(1.2);
      HW.audio?.murmur?.(2.4);
      await g.narrate('{dim}"Hallowell, Cyrus. First pupil."{/dim}');
      await g.wait(0.6);
      g.sfx('husk_rustle', { x: 21 * TILE, y: 22 * TILE, vol: 0.9 });
      g.sfx('cicada_click', { x: 18 * TILE, y: 20 * TILE, vol: 0.5 });
      await g.narrate('{dim}"Present."{/dim} {p} From every seat at once. Dry, like paper.');
      await g.think('scared', 'His own name. {p} At the top of his own list.');
      await g.cam([21, 15], { time: 1.6 });
      await g.wait(1.4);
      await g.think('sad', 'Danny. Leah. {p=0.8} Marcus.');
      await g.cam(null, { time: 1.4 });
      await g.think('determined', 'He reads. {p} When he looks up, I sit.');
    }
    g.objective('The front row.');
  },

  /** The assembly system: Tess's first sit in rows 1–4. His bust, under-lit. */
  'ch7.roll3': async (g, ctx) => {
    if (g.flag('roll3_done')) return;
    g.seen('roll3');
    const C = g.colonel;
    const e = C?.entity;
    HW.assembly?.pause?.();
    g.ambience('assembly', 0.3);
    // The reading stops. The spotlight comes off the lectern and finds her.
    if (e?.sheet?.anims?.lectern_scan) e.playAnim('lectern_scan');
    g.sfx('page_turn', e ? { x: e.x, y: e.y - 24, vol: 0.8 } : {});
    const p = g.player;
    await spotTo(p ? { x: p.x, y: p.y } : null, 1.4);
    await g.wait(1.2);
    await g.say('colonel', 'looking', 'Theresa Dolan?', UNDER);
    const c = await g.choice(['Here.', '(Say nothing.)']);
    if (c === 0) {
      g.set('roll3_answered');
      await g.wait(0.8);
      await g.say('colonel', 'serene', 'Thank you, Theresa.', UNDER);
      const r = g.state.rollAnswered || 0;
      await g.think(r >= 2 ? 'horrified' : 'scared', r >= 2 ? "...That's ink." : '...Pencil.');
    } else {
      g.sfx('breath_hold', { vol: 0.7 });
      await g.wait(2.6);
      g.sfx('pen_scratch', e ? { x: e.x, y: e.y - 20, vol: 0.9 } : { vol: 0.8 });
      await g.wait(1.4);
      await g.think('terrified', "He's still looking. {p} Don't move.");
      g.sfx('breath_release', { vol: 0.5 });
    }
    g.set('roll3_done');
    const home = HW.map?.anchor('lectern');
    await spotTo(home ? { x: home.x, y: home.y + 2 * TILE } : null, 1.0);
    if (e?.sheet?.anims?.lectern_down) e.playAnim('lectern_down');
    HW.assembly?.resume?.();
    g.checkpoint('roll 3');
  },

  // ------------------------------------------------------------------------------------------ the front row
  'ch7.front_danny': async (g) => {
    look(g, 'left');
    const b = g.flag('bond_danny');
    if (g.seen('ch7_front_danny')) {
      await g.say('danny', b ? 'flicker' : 'entranced', b ? 'Dolan. {p} Still here.' : 'Class is starting.');
      return;
    }
    await g.wait(0.9);
    if (b) {
      await g.say('danny', 'flicker', 'Dolan. {p} You came back.');
      await g.say('tess', 'sad', 'I said I would.');
      await g.say('danny', 'entranced', "My pencil quit. Right in the middle of a word. {p} It won't start up again.");
      await g.say('danny', 'flicker', "I'm the guy who gets stuck. {p} You're the guy who comes back. That's the act.");
    } else {
      await g.say('danny', 'entranced', 'Sit down, Theresa— {p} ...Dolan. Sorry. It keeps doing that.');
      await g.say('tess', 'scared', 'Danny. Look at me.');
      await g.say('danny', 'entranced', "Can't. {p} Class is starting.");
    }
  },

  'ch7.front_leah': async (g) => {
    look(g, 'left');
    const b = g.flag('bond_leah');
    if (g.seen('ch7_front_leah')) {
      await g.say('leah', 'entranced', b ? 'Keep it recording, T.' : 'There\'s no due date.');
      return;
    }
    await g.wait(0.9);
    if (b) {
      await g.say('leah', 'entranced', 'T. {p} You still have my camera?');
      await g.say('tess', 'sad', "It's in my bag. {p} Still recording.");
      await g.say('leah', 'entranced', 'Good. {p=0.8} Then it\'s evidence.');
    } else {
      await g.say('leah', 'entranced', 'Sit down, Theresa— {p} ...T. Sorry. It keeps doing that.');
      await g.say('tess', 'scared', 'Leah.');
      await g.say('leah', 'entranced', "There's no due date, T. {p} Nobody has to bring anything back.");
    }
  },

  'ch7.front_marcus': async (g) => {
    look(g, 'left');
    if (g.flag('bond_marcus')) {
      await g.say('marcus', 'entranced', "I'm okay. {p} Go, Tess.");
      return;
    }
    const replay = g.seen('ch7_front_marcus');
    if (g.has('diary_page')) {
      // BOND (Marcus): he reads it.
      if (!replay) await g.wait(0.8);
      await g.say('marcus', 'entranced', "She's so cold, Tess. {p} Her hand's so cold.");
      await g.narrate("I put the page in his free hand. Denise's handwriting, leaning hard to the right, like she was in a hurry.");
      g.sfx('paper_rustle', { vol: 0.5 });
      await g.wait(auto() ? 0 : 3.2);       // a long pause
      await g.say('marcus', 'grief', 'She puts the good fork out. {p} Every year.');
      await g.wait(1.2);
      await g.say('marcus', 'sad', 'I never met her, Tess. {p} I came here to meet her.');
      await g.wait(1.0);
      await g.narrate("He lets go of the husk's hand.");
      g.sfx('husk_rustle', { x: 26.5 * TILE, y: 16 * TILE, vol: 0.4 });
      await g.say('marcus', 'relieved', 'Okay. {p} Okay, Aunt Denise.');
      g.take('diary_page');
      g.set('bond_marcus');
      g.refresh();                          // his Polaroid in the lobby: pencil now
      g.checkpoint('marcus bond');
      return;
    }
    // No page.
    if (!replay) await g.wait(0.8);
    await g.say('marcus', 'entranced', "She's so cold, Tess. {p} Her hand's so cold.");
    const c = await g.choice(["She's gone, Marcus.", '(Say nothing.)']);
    if (c === 0) {
      await g.say('marcus', 'entranced', "You don't know that.");
      await g.wait(0.8);
      await g.say('marcus', 'grief', "You're leaving too. {p} Everybody says it like it's nothing.");
    } else {
      await g.narrate("I don't say anything. He doesn't look away from her.");
    }
    if (!g.flag('ch7_music_hint') && !g.flag('diary_page')) {
      g.set('ch7_music_hint');
      await g.think('sad', 'Denise was in the band. {p} The band room is back there somewhere. Behind the stage.');
      g.objective('The music room. Stage left.');
    }
    g.checkpoint('marcus');
  },

  // ------------------------------------------------------------------------------------------ the music room
  'ch7.clarinet': async (g, ctx) => {
    const prop = ctx?.prop || g.prop('aud_clarinet');
    if (g.flag('diary_page')) {
      await g.examine("[n] Her clarinet, in three pieces on blue velvet. The reed's still damp.");
      return;
    }
    g.seen('ch7_clarinet');
    g.sfx('locker_open', { vol: 0.4, rate: 1.6 });       // two brass latches
    if (prop) g.setProp(prop.id, 'open');
    await g.narrate('A clarinet case, the latches gone green. D. WEBB in white tape on the lid.');
    await g.narrate('Inside, the clarinet in three pieces on blue velvet. Folded small under the bell: a page torn out of a diary.');
    g.give('diary_page');
    g.set('diary_page');
    g.sfx('paper_rustle', { vol: 0.6 });
    await g.doc('denise_diary');
    await g.think('determined', 'Marcus needs to read this.');
    g.objective('Marcus. The front row.');
    g.checkpoint('music room');
  },

  'ch7.mirror': async (g) => {
    look(g, 'up');
    const charter = g.has('charter');
    const replay = g.seen('ch7_mirror');
    g.sfx('glass_tone', { x: 6.5 * TILE, y: 3 * TILE, vol: 0.7 });
    const ghost = glassGhost(g, 'adair_music', 6, 3, 'point_right');
    await g.wait(replay ? 0.6 : 1.6);
    g.setProp('aud_music_mirror', 'fogged');
    await fog(g, charter ? 'FINISH IT' : 'HE IS ON THE ROLL. THE CHARTER. LIBRARY.', { x: 6.5 * TILE, y: 3 * TILE });
    if (!replay) {
      await g.wait(0.6);
      await g.think('determined', charter ? 'East. {p} The trap room.' : 'The Charter. {p} It\'s still in the library. Under glass.');
    }
    await ghost.despawn(0.9);
    g.setProp('aud_music_mirror', 'grimy');
  },

  'ch7.phonograph': async (g) => {
    if (g.seen('ch7_phonograph')) {
      await g.examine("[n] The record's still on the platter. I'm not touching it again.");
      return;
    }
    await g.narrate('A portable record player in a leatherette case. On the platter, a 78: HALLOWELL ALMA MATER — HALLOWELL BAND, arr. R. ADAIR.');
    await g.think('worried', 'That\'s the record. From the intercom.');
    // The platter starts turning by itself. A few bars, out loud, back here.
    g.sfx('record_crackle', { x: 9.5 * TILE, y: 9.5 * TILE, vol: 0.8 });
    await g.wait(0.6);
    if (hasTrack('phonograph')) g.music('phonograph', 0.2);
    await g.wait(auto() ? 0 : 1.6);
    g.music(null, 0.05);
    g.sfx('door_close_wood', { x: 9.5 * TILE, y: 9.5 * TILE, vol: 0.4, rate: 1.8 });   // a hand slapped flat on the platter
    g.shake(0.4, 0.1);
    // From the stage, through the wall: the reading has stopped.
    await g.wait(auto() ? 0 : 2.2);
    const e = g.colonel?.entity;
    g.sfx('colonel_hm', e ? { x: e.x, y: e.y - 20, vol: 0.8 } : { vol: 0.6 });
    await g.wait(auto() ? 0 : 2.6);
    HW.audio?.murmur?.(2);
    await g.narrate('{dim}...The names start again.{/dim}');
  },

  // ------------------------------------------------------------------------------------------ the trap room
  'ch7.stage_door': async (g, ctx) => {
    const door = ctx?.prop || g.prop('aud_stage_door');
    if (door?.state === 'open' || g.flag('stage_door_open')) { await g.transfer('lobby', 'stage_door'); return; }
    look(g, 'right');
    const at = door ? { x: door.x * TILE + 8, y: (door.y + 0.5) * TILE } : {};
    await g.narrate('A steel door with a bar dropped across it in iron brackets.');
    g.sfx('chain_rattle', { ...at, vol: 0.6, rate: 0.7 });
    await g.wait(0.5);
    g.sfx('door_open_metal', { ...at, vol: 0.9 });
    g.set('stage_door_open');
    if (door) g.setProp(door.id, 'open');
    await g.wait(0.6);
    if (!g.seen('ch7_stage_door')) await g.think('neutral', 'The lobby. {p} The back way, around him.');
  },

  'ch7.lever': async (g, ctx) => {
    const lever = ctx?.prop || g.prop('aud_lever');
    look(g, 'up');
    if (g.flag('trapdoor_open')) {
      await g.examine("[n] The lever's down. The trapdoor's open.");
      return;
    }
    if (!g.has('charter') && !g.flag('ch7_lever_asked')) {
      g.set('ch7_lever_asked');
      await g.think('worried', "Adair said the Charter. {p} If I go down there, I'm not coming back up for it.");
      const c = await g.choice(['Go down.', 'Go back for it.']);
      if (c === 1) {
        await g.think('determined', 'The library. {p} The case.');
        g.objective('The library. The Charter.');
        return;
      }
    }
    const at = lever ? { x: lever.x * TILE + 8, y: (lever.y + 0.5) * TILE } : {};
    g.sfx('lever_pull', { ...at, vol: 1 });
    if (lever) g.setProp(lever.id, 'down');
    g.shake(0.7, 0.2);
    await g.wait(0.7);
    g.sfx('trapdoor', { x: 38 * TILE, y: 8 * TILE, vol: 1 });
    g.set('trapdoor_open');
    g.refresh();
    await g.wait(0.6);
    if (!g.seen('ch7_lever')) await g.narrate('Behind me, the trapdoor drops open. Warm air comes up out of it, smelling like a coal stove.');
    g.objective('Down. Under the stage.');
  },

  /** aud exit refusal (exit 'trapdoor' is locked while chapter < 8): the point of no return. */
  'ch7.trapdoor': async (g) => {
    if (!g.flag('trapdoor_open')) return;
    look(g, 'down');
    if (!g.seen('ch7_trapdoor')) await g.narrate('Iron rungs, going down into the dark. Somewhere under the stage, the roll goes on.');
    await g.think('scared', 'Once I go down, I stay down. {p} Until it\'s done.');
    const c = await g.choice(['Go down.', 'Not yet.']);
    if (c !== 0) {
      await g.walk('tess', [37, 10]);
      look(g, 'up');
      return;
    }
    g.checkpoint('trapdoor');                         // before the trapdoor (DESIGN §9.3)
    g.sfx('trapdoor', { vol: 0.6, rate: 0.8 });
    await g.fade('out', 1.0);
    await g.transfer('vault', 'from_aud', { fade: false });
    await g.chapter(8);
    if (HW.scripts?.has?.('ch8.start')) await g.run('ch8.start');
    else await g.fade('in', 1.0);
  },
};
