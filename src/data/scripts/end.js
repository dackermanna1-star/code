// EPILOGUE — the endings (DESIGN §6 EPILOGUES, §7–§8, §14) · CONTENT §3 · owner: narrative-5.
//
// g.ending(id) runs 'end.<id>' as the ending sequence; the engine then rolls the credits screen and returns
// to the title (engine/game.js ending()). So every end.* script finishes with end.credits, which only
// hands over: the last fade to black and the music the credits play under — it never opens the credits
// screen itself (that would roll them twice).
//
//   end.dismissed  dawn steps (CG ending_dawn, all four, the empty uniform through the open doors) → the
//                  confession → the wagon at dawn, "Side A. Track one." (ending_true) → "Monday." if the form
//                  went unused → DISMISSED → the 1997 / 2013 card → credits.
//   end.withdrawn  dawn steps with the saved (the confession trimmed to who's there) → the things left behind
//                  for the ones she couldn't free (Danny's light dies on the steps; Marcus's photo; Leah's
//                  camcorder on the passenger seat) → the tape (ending_good) → WITHDRAWN → per-friend cards →
//                  the 2013 coda → credits.
//   end.present    room tone only: Room 102 at dawn (CG ending_present), "Nobody gets left behind." →
//                  PRESENT → the cards of the ones she freed → the 2013 coda + "Kaylee Ann Brooks?" → credits.
//   end.truant     out of the coal chute; Leah's wagon, keys in the visor; she doesn't drive; the tape; dawn
//                  comes; the doors never open → TRUANT → the Monday card → CG ending_truant → the 102
//                  chalkboard → credits.
//   end.coda       (ctx { present }) "October 19, 2013." → CG coda_2013 → "Okay, we're live…" (→ in PRESENT:
//                  a phone light across a husk in a denim jacket in Room 102; the intercom: "Kaylee Ann
//                  Brooks?") → cut.
//   end.credits    (ctx { ending }) the hand-off to the engine's credits screen.
// Art request (see report): car_interior has no dawn variant (it is the prologue's 9:47 PM), so the wagon
// beats play in-engine on the exterior at dawn instead of over the CG.
import HW from '../../engine/hw.js';
import { savedFriends } from '../../game/endings.js';
import { auto, tween, look } from './ch6.js';
import { DANNY_LIGHT } from './pro.js';

const TILE = 16;
const FRIENDS = ['danny', 'leah', 'marcus'];
const DAWN = '#c9b6c8';
const DL = { light: 'dawn' };
const CARD = { hold: 3.4 };
const STAMP = { hold: 2.4 };
const TESS_CODE = 'DOLAN, THERESA — OCT. 19, 1996';

/** The per-friend cards (DESIGN EPILOGUES, verbatim). [title, subtitle] — split for the card's two lines. */
const FATES = {
  danny: {
    saved: ['Danny Kovach enlisted in 1998.', 'His postcards say one thing: STILL NOT STUCK.'],
    lost: ['Daniel Kovach was listed as a runaway.', 'His uncle Frank still says he went looking for the sword.'],
  },
  leah: {
    saved: ['STATIC #9: HOLLOW HELL, A CORRECTION.', 'Circulation: four.'],
    lost: ['The last issue of STATIC was never printed.', ''],
  },
  marcus: {
    saved: ['That Thanksgiving,', 'Ivy Webb set the table for two.'],
    lost: ['That Thanksgiving,', 'Ivy Webb set two extra plates.'],
  },
};

const flags = () => HW.state?.flags || {};

/** Into the epilogue: chapter 9 (silently — no checkpoint over the save), black under the cards. */
async function begin(g) {
  g.state.chapter = 9;
  g.set('dawn');
  g.overlay('black', { alpha: 1 });
  await g.card('EPILOGUE', '', { hold: 2 });
}

/** The exterior at dawn, for the in-engine beats (ch8.dawn set most of it; a reload or a test may not). */
function dawnWorld(g) {
  HW.fx?.rain?.(false, 0, { instant: true });
  HW.lighting?.setAmbient?.(DAWN, 0.5, 0);
  HW.audio?.ambience?.('dawn', 1.5);
  for (const [id, st] of [['ext_door_lamp', 'off'], ['ext_front_doors', 'open']]) if (g.prop(id)) g.setProp(id, st);
  if (g.prop('ext_wagon') && g.prop('ext_wagon').state === 'on') g.setProp('ext_wagon', 'off');
}

/** Show the world again from under the black. */
async function reveal(g, sec = 1.6) {
  await g.fade('out', 0.01);
  g.overlay('black', null);
  await g.fade('in', sec);
}

/** The confession on the steps, trimmed to who's there (DESIGN EPILOGUES; lines verbatim). */
async function confession(g, here) {
  const D = here.includes('danny');
  const L = here.includes('leah');
  const M = here.includes('marcus');
  const others = here.filter((id) => id !== 'leah');
  if (L && others.length > 1) await g.say('leah', 'smirk', 'You gonna tell them, or am I?', DL);
  else if (L && others.length === 1) await g.say('leah', 'smirk', 'You gonna tell him, or am I?', DL);
  else if (L) await g.say('leah', 'smirk', 'You gonna say it, or am I?', DL);
  else {
    await g.narrate('Nobody says anything for a while. Steam comes up off the walk.');
    await g.wait(auto() ? 0 : 1.2);
  }
  await g.say('tess', 'look_away', "I'm moving. To Philly. {p} After Christmas.", DL);
  if (D) await g.say('danny', 'grin', '...Philly. {p} Dolan. They booed *Santa*.', DL);
  if (L) await g.say('leah', 'smirk', 'Took you long enough.', DL);
  if (D && L) {
    await g.say('danny', 'talk', 'Wait. *You* knew?', DL);
    await g.say('leah', 'deadpan', 'Since August.', DL);
    await g.say('danny', 'laugh', 'Since AUGUST?', DL);
  }
  if (M) {
    await g.wait(auto() ? 0 : 0.8);
    await g.say('marcus', 'soft_smile', "You'll call.", DL);
    await g.say('tess', 'smile', "I'll call.", DL);
  }
  if (L) await g.say('leah', 'smile', "Side B's better. {p} For the record.", DL);
}

/** One of them gets into the wagon (walk, a door, gone inside). Tess just goes invisible. */
async function intoWagon(g, id, spot, face) {
  await g.walk(id, spot);
  if (face) g.face(id, face);
  await g.wait(auto() ? 0 : 0.3);
  g.sfx('door_close_metal', { x: spot[0] * TILE + 8, y: spot[1] * TILE, vol: 0.7, rate: 1.1 });
  if (id === 'tess') { if (HW.player) HW.player.visible = false; g.flashlight(false); } else if (g.npc(id)) g.despawn(id);
}

/** Take the caterpillar apart so the scene can place everybody. */
function release(g) {
  const ids = g.state.party.slice();
  g.state.party = [];
  HW.entities?.syncParty?.();
  return ids;
}

/** Make sure a friend has a body on the exterior (a test or a reload can arrive without the party). */
function body(g, id, at) {
  return g.npc(id) || g.spawn({ id, sprite: id, at, dir: 'down' });
}

async function fates(g, list) {
  for (const [id, fate] of list) {
    const [a, b] = FATES[id][fate];
    await g.card(a, b, CARD);
  }
}

// ---------------------------------------------------------------------------------------------
export default {
  // ------------------------------------------------------------------------------------------ DISMISSED
  'end.dismissed': async (g) => {
    await begin(g);
    HW.art?.warmCg?.('ending_dawn');
    g.music(null, 1);
    HW.audio?.ambience?.('dawn', 2);
    await g.cg('ending_dawn', { fade: 2.4, params: { who: ['tess', 'danny', 'leah', 'marcus'], uniform: true } });
    g.overlay('black', null);
    await g.wait(auto() ? 0 : 2.8);
    await confession(g, FRIENDS);
    await g.wait(auto() ? 0 : 2.0);
    // The wagon, at dawn (in-engine: car_interior is the night CG).
    g.overlay('black', { alpha: 1 });
    await g.cg(null, { fade: 1.2 });
    dawnWorld(g);
    if (HW.map?.id === 'exterior') {
      const ids = release(g);
      g.setPos('tess', 'dawn_steps');
      const pos = { danny: [23, 9], leah: [25, 9], marcus: [26, 8] };
      for (const id of FRIENDS) { body(g, id, pos[id]); if (!ids.includes(id)) g.setPos(id, pos[id]); }
      if (g.npc('danny')) g.light('danny', DANNY_LIGHT);
      await g.cam([21, 11], { time: 0 });
      await reveal(g, 1.8);
      await g.wait(auto() ? 0 : 0.8);
      await Promise.all([
        intoWagon(g, 'leah', [19, 13], 'up'),
        (async () => { await g.wait(auto() ? 0 : 0.4); await intoWagon(g, 'danny', [18, 10], 'down'); })(),
        (async () => { await g.wait(auto() ? 0 : 0.8); await intoWagon(g, 'marcus', [21, 10], 'down'); })(),
        (async () => { await g.wait(auto() ? 0 : 1.2); await intoWagon(g, 'tess', [21, 13], 'up'); })(),
      ]);
      g.light('danny', null);
      await g.wait(auto() ? 0 : 0.8);
      g.sfx('lever_pull', { x: 19 * TILE, y: 12 * TILE, vol: 0.3, rate: 1.6 });      // the ignition
      const engine = g.loop('engine_idle', { x: 19 * TILE, y: 12 * TILE, vol: 0.5 });
      g.setProp('ext_wagon', 'on');
      await g.wait(auto() ? 0 : 1.4);
      g.sfx('tape_play', { vol: 0.7 });
      await g.say('leah', 'smile', 'Side A. {p} Track one.', DL);
      g.music('ending_true', 1.5);
      await g.wait(auto() ? 0 : 3.4);
      if (!g.flag('form_used') && g.has('transfer_form')) {
        await g.narrate("The form's still in my bag. Mom's signature at the bottom, in her ER-nurse capitals.");
        await g.think('relieved', 'Monday.');
        await g.wait(auto() ? 0 : 1.2);
      }
      await g.fade('out', 2.2);
      try { engine.stop(1.5); } catch { /* audio stub */ }
    } else {
      g.music('ending_true', 1.5);
      await g.say('leah', 'smile', 'Side A. {p} Track one.', DL);
      if (!g.flag('form_used') && g.has('transfer_form')) await g.think('relieved', 'Monday.');
    }
    g.overlay('black', { alpha: 1 });
    await g.card('DISMISSED', 'ALL PUPILS — OCT. 19, 1996', STAMP);
    await g.card('In 1997, Hallowell Consolidated School was demolished.', 'Nothing was found beneath it.', CARD);
    await g.card('In the spring of 2013, the cicadas came back.', 'Nobody went missing.', CARD);
    await g.run('end.credits', { ending: 'dismissed' });
  },

  // ------------------------------------------------------------------------------------------ WITHDRAWN
  'end.withdrawn': async (g) => {
    const free = savedFriends(g.state);
    const lost = FRIENDS.filter((id) => !free.includes(id));
    await begin(g);
    HW.art?.warmCg?.('ending_dawn');
    g.music(null, 1);
    HW.audio?.ambience?.('dawn', 2);
    await g.cg('ending_dawn', { fade: 2.4, params: { who: ['tess', ...free], uniform: false } });
    g.overlay('black', null);
    await g.wait(auto() ? 0 : 2.6);
    if (free.length) {
      await confession(g, free);
      await g.wait(auto() ? 0 : 1.6);
    }
    // The things left behind: she carries out what she couldn't bring back.
    g.overlay('black', { alpha: 1 });
    await g.cg(null, { fade: 1.2 });
    dawnWorld(g);
    const inWorld = HW.map?.id === 'exterior';
    let engine = null;
    if (inWorld) {
      const ids = release(g);
      g.setPos('tess', 'dawn_steps');
      const pos = { danny: [23, 9], leah: [25, 9], marcus: [26, 8] };
      for (const id of free) { body(g, id, pos[id]); if (!ids.includes(id)) g.setPos(id, pos[id]); }
      await g.cam([24, 10], { time: 0 });
      await reveal(g, 1.6);
      await g.wait(auto() ? 0 : 0.8);
    }
    if (lost.includes('danny') && g.has('danny_flashlight')) {
      // His light, the one that never died. On the bottom step it finally does.
      if (inWorld) {
        HW.state.lightSource = 'danny';
        HW.state.flashlightOn = true;
        g.flashlight(true);
        look(g, 'down');
        await g.walk('tess', [24, 9]);
        await g.wait(auto() ? 0 : 1.4);
      }
      await g.narrate("Danny's flashlight is still on in my hand. It's been on all night.");
      g.sfx('flashlight_flicker', { vol: 0.6 });
      if (inWorld) { g.flashlight(false); await g.wait(auto() ? 0 : 0.3); g.flashlight(true); await g.wait(auto() ? 0 : 0.5); }
      g.sfx('flashlight_click', { vol: 0.5, rate: 0.8 });
      if (inWorld) g.flashlight(false);
      await g.narrate('On the bottom step it flickers once, and goes out.');
      await g.wait(auto() ? 0 : 1.4);
      if (inWorld) { HW.state.lightSource = 'maglite'; g.flashlight('restore'); }
    }
    if (lost.includes('marcus') && g.has('denise_photo')) {
      await g.narrate('Denise, fifteen, laughing at somebody off camera. On the back: My girl. Fall 1979. —Mama.');
      await g.think('sad', "I'll take it to his grandma. {p} I'll tell her he came to meet her.");
      await g.wait(auto() ? 0 : 1.0);
    }
    if (lost.includes('leah')) {
      // Leah's mom's wagon. Keys in the visor. The camcorder on the passenger seat, red light on.
      if (inWorld) {
        for (const id of free) if (g.npc(id)) g.face(id, 'tess');
        await intoWagon(g, 'tess', [19, 13], 'up');
        await g.cam([19, 11], { time: 1.4 });
      }
      await g.narrate("Leah's mom's wagon. The keys are in the visor. Nobody steals anything in Kettle Run.");
      if (g.has('camcorder')) await g.narrate("I put her camera on the passenger seat. The red light's still on. Still recording.");
      if (free.length) await g.narrate(free.length > 1 ? "The others wait on the steps. They let me have this." : `${free[0] === 'danny' ? 'Danny' : 'Marcus'} waits on the steps. He lets me have this.`);
      await g.wait(auto() ? 0 : 1.2);
      g.sfx('tape_play', { vol: 0.7 });
      await g.narrate('I push in the tape.');
      g.music('ending_good', 1.5);
      await g.wait(auto() ? 0 : 4.0);
    } else {
      // Leah drives. The tape goes in.
      if (inWorld) {
        const spots = { leah: [19, 13, 'up'], danny: [18, 10, 'down'], marcus: [21, 10, 'down'] };
        await Promise.all([...free.map((id, i) => (async () => {
          await g.wait(auto() ? 0 : i * 0.4);
          await intoWagon(g, id, spots[id].slice(0, 2), spots[id][2]);
        })()), (async () => { await g.wait(auto() ? 0 : 1.2); await intoWagon(g, 'tess', [21, 13], 'up'); })()]);
        await g.wait(auto() ? 0 : 0.8);
        g.sfx('lever_pull', { x: 19 * TILE, y: 12 * TILE, vol: 0.3, rate: 1.6 });
        engine = g.loop('engine_idle', { x: 19 * TILE, y: 12 * TILE, vol: 0.5 });
        g.setProp('ext_wagon', 'on');
        await g.cam([20, 11], { time: 1.2 });
      }
      await g.wait(auto() ? 0 : 1.2);
      g.sfx('tape_play', { vol: 0.7 });
      g.music('ending_good', 1.5);
      await g.wait(auto() ? 0 : 4.0);
    }
    await g.fade('out', 2.2);
    try { engine?.stop?.(1.5); } catch { /* audio stub */ }
    g.overlay('black', { alpha: 1 });
    await g.card('WITHDRAWN', TESS_CODE, STAMP);
    await fates(g, FRIENDS.map((id) => [id, free.includes(id) ? 'saved' : 'lost']));
    await g.run('end.coda', { present: false });
    await g.run('end.credits', { ending: 'withdrawn' });
  },

  // ------------------------------------------------------------------------------------------ PRESENT
  'end.present': async (g) => {
    const free = savedFriends(g.state);
    await begin(g);
    // Room tone only (DESIGN §14).
    g.music(null, 0.5);
    HW.audio?.ambience?.('classroom', 1.5);
    HW.art?.warmCg?.('ending_present');
    await g.cg('ending_present', { fade: 2.6 });
    g.overlay('black', null);
    await g.wait(auto() ? 0 : 4.0);
    await g.think('dissociated', 'Nobody gets left behind.');
    await g.wait(auto() ? 0 : 3.2);
    g.overlay('black', { alpha: 1 });
    await g.cg(null, { fade: 2.0 });
    await g.card('PRESENT', TESS_CODE, STAMP);
    if (free.length) await fates(g, FRIENDS.filter((id) => free.includes(id)).map((id) => [id, 'saved']));
    await g.run('end.coda', { present: true });
    await g.run('end.credits', { ending: 'present' });
  },

  // ------------------------------------------------------------------------------------------ TRUANT
  'end.truant': async (g) => {
    await begin(g);
    g.music(null, 0.5);
    g.state.party = [];
    HW.entities?.syncParty?.();
    // Out of the coal hatch on the east lawn, into the rain.
    await g.transfer('exterior', 'chute_exit', { fade: false });
    g.state.chapter = 9;
    if (g.prop('ext_coal_chute')) g.setProp('ext_coal_chute', 'open');
    HW.audio?.ambience?.('exterior_rain', 0.5);
    const p0 = g.player;
    await g.cam([40, 10], { time: 0 });
    await reveal(g, 2.0);
    if (p0) g.fx('emit', 'coal_dust', p0.x, p0.y - 10, 10, { z: 10 });
    await g.wait(auto() ? 0 : 1.6);
    look(g, 'down');
    await g.wait(auto() ? 0 : 1.0);
    await g.cam(null, { time: 1.2 });
    // Across the lot to Leah's mom's wagon.
    await g.walk('tess', [33, 10]);
    await g.walk('tess', [21, 13]);
    look(g, 'up');
    await g.wait(auto() ? 0 : 0.8);
    await g.narrate('The keys are in the visor, where she said.');
    await intoWagon(g, 'tess', [19, 13], 'up');
    await g.cam([20, 9], { time: 1.6 });
    await g.wait(auto() ? 0 : 1.4);
    await g.narrate("I don't start it.");
    await g.wait(auto() ? 0 : 1.0);
    g.sfx('tape_play', { vol: 0.6 });
    g.music('ending_good', 2);
    // The night goes. Dawn comes up gray over the school. The doors never open.
    await g.cam([24, 8], { time: 4.0 });
    const L = HW.lighting;
    L?.setAmbient?.(DAWN, 0.5, auto() ? 0 : 12);
    if (auto()) HW.fx?.rain?.(false, 0, { instant: true });
    else {
      await g.wait(3.0);
      HW.fx?.rain?.(false, 0);                 // it eases off by itself
      await g.wait(7.0);
    }
    HW.audio?.ambience?.('dawn', 4);
    if (g.prop('ext_door_lamp')) g.setProp('ext_door_lamp', 'off');
    await g.wait(auto() ? 0 : 5.0);
    await g.fade('out', 2.4);
    g.overlay('black', { alpha: 1 });
    await g.card('TRUANT', TESS_CODE, STAMP);
    await g.card('Theresa Dolan handed in her transfer form on Monday.', '', CARD);
    await g.card('The secretary asked if she wanted to say goodbye to anyone.', 'She said no.', CARD);
    // December. The Turnpike, eastbound. The tape in the deck.
    HW.art?.warmCg?.('ending_truant');
    await g.cg('ending_truant', { fade: 2.0 });
    g.overlay('black', null);
    await g.wait(auto() ? 0 : 6.0);
    g.overlay('black', { alpha: 1 });
    await g.cg(null, { fade: 1.6 });
    g.music(null, 2);
    // Coda: Room 102. Her line on the board, and under it, fresh chalk.
    await g.transfer('west1', 'in_102', { fade: false });
    g.state.chapter = 9;
    for (const id of ['w1_chalk_102_tess_a', 'w1_chalk_102_tess_p', 'w1_chalk_102_p3']) {
      if (g.prop(id)) g.setProp(id, 'text', { text: 'DOLAN, THERESA — ABSENT' });
    }
    if (HW.player) HW.player.visible = false;
    g.flashlight(false);
    HW.lighting?.setAmbient?.('#7d7f8c', 0.8, 0);
    HW.audio?.ambience?.('classroom', 1);
    await g.cam([25, 4], { time: 0 });
    await reveal(g, 2.4);
    await g.wait(auto() ? 0 : 2.4);
    g.sfx('chalk', { x: 25 * TILE, y: 3 * TILE, vol: 0.8 });
    await g.wait(auto() ? 0 : 1.6);
    await g.narrate('DOLAN, THERESA — ABSENT. {p=0.8} And under it, in chalk so fresh the dust is still falling:');
    g.sfx('chalk', { x: 25 * TILE, y: 3 * TILE, vol: 0.9, rate: 0.9 });
    await g.narrate('ABSENCES WILL BE MADE UP');
    await g.wait(auto() ? 0 : 2.0);
    await g.fade('out', 2.0);
    await g.run('end.credits', { ending: 'truant' });
  },

  // ------------------------------------------------------------------------------------------ 2013
  'end.coda': async (g, ctx) => {
    const present = !!ctx?.present;
    g.overlay('black', { alpha: 1 });
    g.music(null, 1.5);
    HW.audio?.ambience?.('silence', 1);
    await g.card('October 19, 2013.', '', { hold: 2.4 });
    HW.art?.warmCg?.('coda_2013');
    await g.cg('coda_2013', { fade: 1.0 });
    g.overlay('black', null);
    HW.audio?.ambience?.('exterior_rain', 2);
    await g.wait(auto() ? 0 : 2.2);
    await g.say('voice', null, "Okay, we're live. {p} This is Kaylee, and this is Hollow Hell.", { name: 'Kaylee' });
    if (!present) {
      await g.wait(auto() ? 0 : 1.6);
      g.overlay('black', { alpha: 1 });
      await g.cg(null, { fade: 0.05 });
      HW.audio?.ambience?.('silence', 0.05);
      await g.wait(auto() ? 0 : 1.6);
      return;
    }
    // PRESENT: Room 102. Her phone light crosses a desk in the second row.
    await g.wait(auto() ? 0 : 1.2);
    g.overlay('black', { alpha: 1 });
    await g.cg(null, { fade: 0.4 });
    await g.transfer('west1', 'door_102', { fade: false });
    if (HW.player) HW.player.visible = false;
    g.flashlight(false);
    g.state.party = [];
    HW.entities?.syncParty?.();
    HW.lighting?.setAmbient?.('#0b1020', 0.985, 0);
    // Her desk: second row, the one the CG shows (seated on the desk like any sitter, so it draws right).
    const husk = g.spawn({ id: 'tess_husk', sprite: 'husk_c', at: [24, 8], dir: 'up' });
    const desk = g.prop('w1_102_r24_8');
    if (husk && desk && HW.hiding) await HW.hiding.seatNpc(husk, desk, { walk: false });
    g.anim('tess_husk', 'sit_up', { hold: true });
    if (g.prop('w1_door_102')) g.setProp('w1_door_102', 'open');      // she's in the doorway
    await g.cam([23, 7], { time: 0 });
    // (inside the doorway: a light origin in the door cell itself is boxed in by the wall's shadows)
    const A0 = -2.2;
    const A1 = -0.16;
    const beam = HW.lighting?.addLight?.({ type: 'flashlight', px: 20 * TILE + 8, py: 9.4 * TILE, angle: A0, power: 0.9, cone: 0.5, color: '#eef3ff', map: 'west1' }) || null;
    await g.fade('out', 0.01);
    g.overlay('black', null);
    await g.fade('in', 0.6);
    // The beam wanders the rows and stops on her.
    if (beam) await tween(3.4, (k) => { beam.angle = A0 + (A1 - A0) * k + Math.sin(k * 9) * 0.05 * (1 - k); });
    await g.wait(auto() ? 0 : 1.0);
    await g.narrate('{dim}Second row. Somebody sitting very straight, hands folded. A shell, amber, hollow, in a light denim jacket three sizes too big.{/dim}');
    await g.wait(auto() ? 0 : 1.4);
    g.sfx('intercom_crackle', { vol: 0.6 });
    await g.wait(auto() ? 0 : 1.2);
    await g.say('voice', null, 'Kaylee Ann Brooks?', { name: 'INTERCOM', speed: 0.8 });
    // Cut.
    g.overlay('black', { alpha: 1 });
    HW.audio?.ambience?.('silence', 0.02);
    if (beam) HW.lighting?.removeLight?.(beam);
    await g.wait(auto() ? 0 : 2.0);
  },

  // ------------------------------------------------------------------------------------------ credits
  /** Hand-off to the engine's credits screen (it opens after end.<id> returns): black, and the music. */
  'end.credits': async (g, ctx) => {
    const ending = ctx?.ending || flags().ending;
    g.overlay('black', { alpha: 1 });
    await g.cg(null, { fade: 0.6 });
    // Leah's tape plays the credits out for the two endings that leave with it; PRESENT gets the music box.
    const track = { dismissed: 'ending_true', withdrawn: 'ending_good', truant: 'ending_good', present: 'ending_bad' }[ending] || 'credits';
    g.music(track, 2.5);
    g.set(`ending_seen_${ending}`);
    HW.debug?.record?.('credits', null, null, ending);
    await g.wait(auto() ? 0 : 1.2);
  },
};
