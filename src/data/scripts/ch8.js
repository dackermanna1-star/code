// CHAPTER VIII — The Register (vault, breaker; then aud, lobby, exterior). DESIGN §6 VIII, §7–§8, §14 ·
// CONTENT §3 · owner: narrative-5.
//
//   ch8.start          (ch7.trapdoor, after the card) fade up under the stage. The Assembly stops being a
//                      system — up there the roll goes on as sound only. No music for the whole descent.
//   ch8.last_roll      (vault trigger, under the lectern) the roll through the floorboards reaches 1996. A
//                      bonded friend doesn't say present (pencil); an unbonded one does (ink). endings.js
//                      reads the same bonds, so the Register matches what she just heard.
//   ch8.spiral         (vault, first arrival at the foot of the iron spiral) the roll is out of earshot.
//   ch8.vault          (vault trigger, the west archway) the Founder's Vault. Checkpoint 'vault'.
//   ch8.sarcophagus    the tomb, split from the inside. The hollow is still warm.
//   ch8.adair          Adair's husk: the red pen (red_pen), her last note (doc adair_note, flag adair_note).
//   ch8.no_light       (vault exit refusal, no pen) "My light won't reach. Not without— no. Her pen."
//   ch8.breaker        (breaker trigger) the shift whistle from below — the bell two octaves down, steam;
//                      CG breaker_reveal; the first lamps; the realization in four fragments, no more.
//   ch8.office         (breaker trigger, top of the stair) the weigh-master's office, his ledger. Checkpoint
//                      'office'. Under the Register: room tone and the faint roll through the stone.
//   ch8.register_voice (sys.register hook, ctx { id, tool, text }) that friend's real voice, far above.
//   ch8.after_register (sys.register hook, ctx { ending }) two seconds of nothing, then by ending:
//     ch8.dismissal      DISMISSED: the bell, on and on; the lamps go out behind her as she climbs down.
//     ch8.escape         WITHDRAWN: "WHO IS OUT OF THEIR SEAT." — HW.chase.escape, breaker → aud → lobby.
//     ch8.escape_present PRESENT, a friend freed: the chase that cannot catch.
//     ch8.present        PRESENT, nobody freed: the bell once; "Thank you, Theresa."; the pen set down.
//   ch8.vault_after    (vault, DISMISSED) Miss Adair's shell lifts away in motes; up through the trapdoor.
//   ch8.stage_edge     (aud, DISMISSED) the Colonel on the stage edge — "You are." — the empty uniform; the
//                      house goes to motes; Denise turns to Marcus; the three of them, awake.
//   ch8.lobby          (lobby, DISMISSED) Kevin takes off the belt; the doors open on the last ring; Adair
//                      smiles in the trophy glass: GO HOME, TESS.
//   ch8.escape_aud     (aud, during the escape) freed friends wake and run with her; the others stay seated.
//   ch8.vestibule      (lobby trigger, PRESENT) the friends cross into the dawn; "Theresa."; the doors close.
//   ch8.dawn           (exterior, DISMISSED / WITHDRAWN) the steps at dawn → g.ending().
//
// Module hooks (installed once, so they hold after a reload too): 'mapLoad' routes every map of the way out
// to its scene by the committed ending; 'load' resumes a consequence that a reload at 'register closed'
// (sys.register's checkpoint, before ch8.after_register) would otherwise lose.
// Colonel lines here (DESIGN §3 bank only): "Theresa. {p} ...The bell." + "I was to be the last to leave."
// (bust: the stage-edge beat) · "WHO IS OUT OF THEIR SEAT." · "Theresa." · "Thank you, Theresa." (voice).
// The roll through the floor is narrated, like the Assembly's own roll in Ch7. Adair never speaks.
import HW from '../../engine/hw.js';
import { look, tween, fog, glassGhost, auto, later, hold } from './ch6.js';
import { DANNY_LIGHT } from './pro.js';
import { savedFriends, PUPILS } from '../../game/endings.js';

const TILE = 16;
const FRIENDS = ['danny', 'leah', 'marcus'];
const FULL = { danny: 'Daniel Kovach', leah: 'Leah Brandt', marcus: 'Marcus Webb' };
const NICK = { danny: 'Dolan', leah: 'T', marcus: 'Tess' };
const NAME = { danny: 'Danny', leah: 'Leah', marcus: 'Marcus' };
const VOICE = { name: '???' };
const DAWN = '#c9b6c8';
const DARK = { light: 'dark' };

const flags = () => HW.state?.flags || {};
const ent = (id) => HW.entities?.get(id) || null;
const bonded = (id) => !!(HW.state?.bonds?.[id] || flags()[`bond_${id}`]);
const saved = () => savedFriends(HW.state);
const at = (tx, ty) => ({ x: tx * TILE + 8, y: ty * TILE + 8 });

/** Tess turns toward a tile and points her beam at it (the beam holds its aim in cutscenes). */
function aimAt(g, tx, ty) {
  const p = HW.player;
  if (!p) return;
  const x = tx * TILE + 8;
  const y = ty * TILE + 8;
  g.face('tess', { x, y });
  if (HW.flashlight) HW.flashlight.angle = Math.atan2(y - (p.y - 9), x - p.x);
}

/** The Colonel without a bust (DESIGN §5.1: the three bust beats are roll #3, the pen, the stage edge). */
async function colonelVoice(g, text, opts = {}) {
  HW.audio?.murmur?.(1.4);
  await g.say('voice', null, text, { ...VOICE, ...opts });
}

/** Ch7 leaves the Assembly running; from here on it is sound through the floor, not a system. */
function clearAssembly() {
  const f = flags();
  if (f.assembly_on || HW.assembly?.active) {
    HW.assembly?.stop?.({ despawn: false });
    if (HW.colonel?.mode === 'assembly') HW.colonel.despawn({ sink: false });
  }
  delete f.assembly_on;
}

/** A friend as an NPC sitting in their front-row seat (entranced sprite unless awake). */
function seatFriend(id, awake) {
  const map = HW.map;
  if (!map || map.id !== 'aud' || !HW.entities || !HW.hiding) return null;
  const seat = map.prop(`aud_seat_${id}`);
  if (!seat) return null;
  const sprite = awake ? id : `${id}_e`;
  let e = ent(id);
  if (!e) e = HW.entities.spawn({ id, sprite, at: `front_row_${id}`, dir: 'up' });
  else if (e.spriteId !== sprite) e.setSprite(sprite);
  if (e && e.seat !== seat) HW.hiding.seatNpc(e, seat, { walk: false });
  return e;
}

/** Stand a seated friend up onto the aisle in front of their seat. */
function standFriend(id) {
  const e = ent(id);
  if (!e) return null;
  HW.hiding?.unseatNpc?.(e);
  const a = HW.map?.anchor(`front_row_${id}`);
  if (a) { e.x = a.x; e.y = a.y; }
  e.face('up');
  return e;
}

/** Join the caterpillar in canonical order (they're standing near her by now). */
function joinParty(g, ids) {
  for (const id of FRIENDS) if (ids.includes(id) && !g.party.has(id)) g.party.add(id);
  g.state.party = FRIENDS.filter((id) => g.state.party.includes(id));
  HW.entities?.syncParty?.();
}

/** Gray light through the lobby's open front doors (scoped to the lobby). */
function dawnDoorLight(intensity = 0.75) {
  const L = HW.lighting;
  if (!L?.addLight) return null;
  L.addLight({ type: 'bulb', px: 15 * TILE, py: 25.8 * TILE, color: DAWN, radius: 5.5, intensity, cage: false, glow: null, map: 'lobby' });
  return L.addLight({ type: 'bulb', px: 15 * TILE, py: 22.5 * TILE, color: DAWN, radius: 3.5, intensity: intensity * 0.45, cage: false, glow: null, map: 'lobby' });
}

/** The front doors stand open (both leaves of the inner pair too). */
function doorsOpen(g) {
  if (g.prop('lobby_inner_doors')) g.setProp('lobby_inner_doors', 'open');
  if (g.prop('lobby_front_doors')) g.setProp('lobby_front_doors', 'open');
}

// ---------------------------------------------------------------------------------------------
// DISMISSED: the bell rings on and on until the front doors open (flag ch8_bell_done).
function bellLoop(g) {
  if (flags().ch8_bell_done) return;
  g.sfx('school_bell', { dur: 9, vol: 0.8 });
  if (auto()) return;
  g.parallel(async (pg) => {
    while (pg.alive && !flags().ch8_bell_done) {
      await pg.wait(9.6);
      if (!pg.alive || flags().ch8_bell_done) break;
      pg.sfx('school_bell', { dur: 9, vol: 0.8 });
    }
  });
}

/** Under the Register: the roll goes on above, faint, through the stone (stops when the book closes). */
function faintRoll(g) {
  if (auto()) return;
  g.parallel(async (pg) => {
    while (pg.alive && !flags().register_done && HW.map?.id === 'breaker') {
      await pg.wait(5.5 + Math.random() * 4);
      if (!pg.alive || flags().register_done || HW.map?.id !== 'breaker') break;
      pg.sfx('colonel_murmur', { dur: 1.6 + Math.random(), vol: 0.22 });
      if (Math.random() < 0.4) pg.sfx('husk_rustle', { vol: 0.1 });
    }
  });
}

// ---------------------------------------------------------------------------------------------
let installed = false;
function install() {
  if (installed) return true;
  if (!HW.game?.on || !HW.scripts) return false;
  installed = true;
  HW.game.on('mapLoad', (map) => {
    const s = HW.state;
    if (!s || !map) return;
    const f = s.flags;
    if ((s.chapter || 0) >= 8) clearAssembly();
    // The foot of the iron spiral, the first time down: the roll is out of earshot.
    if (map.id === 'vault' && (s.chapter || 0) === 8 && !f.register_done && !f.ch8_spiral && HW.player && HW.player.y > 10 * 16) {
      later('ch8.spiral');
    }
    if (!f.register_done || f.ending === 'truant') return;
    const dismissed = f.ending === 'dismissed';
    switch (map.id) {
      case 'breaker':
        if (dismissed && f.ch8_dismissal && !f.breaker_out) later('ch8.dismissal', { resume: true }, { blocking: false });
        break;
      case 'vault':
        if (dismissed && !f.ch8_vault_after) later('ch8.vault_after');
        break;
      case 'aud':
        later(dismissed ? 'ch8.stage_edge' : 'ch8.escape_aud');
        break;
      case 'lobby':
        if (dismissed) later('ch8.lobby');
        else later('ch8.lobby_open', {}, { blocking: false });
        break;
      case 'exterior':
        if (dismissed || f.ending === 'withdrawn') later('ch8.dawn');
        break;
      default:
    }
  });
  // A reload at 'register closed' lands back at the desk with the book shut and nothing after it.
  HW.game.on('load', () => {
    const f = HW.state?.flags || {};
    if (!f.register_done || HW.map?.id !== 'breaker' || f.ending === 'truant') return;
    if (f.ending === 'dismissed' ? !f.ch8_dismissal : !(f.chase_escape || f.ch8_escape)) {
      later('ch8.after_register', { ending: f.ending, resume: true });
    }
  });
  return true;
}
if (typeof window !== 'undefined') {
  const poll = setInterval(() => { if (install()) clearInterval(poll); }, 200);
}

// ---------------------------------------------------------------------------------------------
export default {
  // ------------------------------------------------------------------------------------------ under the stage
  'ch8.start': async (g) => {
    install();
    clearAssembly();
    HW.patrol?.disable?.();
    g.music(null, 0.5);                       // no music for the descent (DESIGN §14)
    const replay = g.seen('ch8_start');
    look(g, 'left');
    await g.fade('in', replay ? 0.6 : 1.6);
    if (!replay) {
      // Overhead, the house: a dry rustle, the boards taking a great weight. The roll goes on.
      await g.wait(1.2);
      const p = g.player;
      g.sfx('footstep_heavy_above', { vol: 0.5 });
      if (p) g.fx('emit', 'dust', p.x - 6, p.y - 20, 6, { z: 26 });
      await g.wait(0.8);
      g.sfx('colonel_murmur', { dur: 2.4, vol: 0.4 });
      await g.wait(2.0);
      look(g, 'up');
      await g.think('scared', 'Right over my head. {p} All of them.');
      look(g, 'left');
    }
    g.objective('Under the stage. Go down.');
  },

  /** Under the lectern: the roll through the floorboards reaches 1996. */
  'ch8.last_roll': async (g) => {
    install();
    if (g.flag('ch8_last_roll')) return;
    const replay = g.seen('ch8_last_roll');
    g.music(null, 0.3);
    await g.walk('tess', 'under_lectern');
    look(g, 'up');
    const spot = HW.map?.anchor('under_lectern');
    // The boards over her creak under the weight at the lectern. Dust sifts down into the light.
    g.sfx('footstep_heavy_above', { vol: 0.7 });
    if (spot) g.fx('emit', 'dust', spot.x, spot.y - 22, 10, { z: 28 });
    g.sfx('dust_fall', spot ? { x: spot.x, y: spot.y - 20, vol: 0.6 } : { vol: 0.5 });
    await g.wait(1.4);
    if (!replay) {
      g.sfx('colonel_murmur', { dur: 2.8, vol: 0.5 });
      await g.narrate('{dim}"...Patricia Szalay." "Michelle Yancey."{/dim} {p} The names come down through the boards, one at a time.');
      await g.wait(0.6);
      await g.narrate('{dim}"Present." "Present."{/dim} {p} Dry, from a hundred seats.');
      await g.wait(1.4);
      await g.narrate('A page turns, up there. {p=0.8} Nineteen ninety-six.');
      await g.wait(1.0);
    }
    // What she hears is what the Register will read (endings.js inkOf: bonded → pencil). Keep the two
    // sources of a bond (state.bonds and the bond_* flag) in agreement before the page is written.
    for (const id of FRIENDS) if (bonded(id) && !(g.state.bonds?.[id] && g.flag(`bond_${id}`))) g.set(`bond_${id}`, true);
    const answered = [];
    for (const id of FRIENDS) {
      g.sfx('page_turn', spot ? { x: spot.x, y: spot.y - 30, vol: 0.4 } : { vol: 0.3 });
      HW.audio?.murmur?.(1.2);
      await g.narrate(`{dim}"${FULL[id]}?"{/dim}`);
      if (bonded(id)) {
        // A long silence, then the real one, whispering.
        await g.wait(auto() ? 0 : 2.6);
        if (id === 'danny') {
          await g.say('danny', 'flicker', "...Dolan said she's coming back.", { ...DARK, speed: 0.8 });
          await g.think('crying', 'I am.');
        }
        if (id === 'leah') await g.say('leah', 'entranced', '...She said Philly. {p} She actually said it.', { ...DARK, speed: 0.8 });
        if (id === 'marcus') await g.say('marcus', 'entranced', "I'm just visiting.", { ...DARK, speed: 0.8 });
        g.sfx('pen_scratch', spot ? { x: spot.x, y: spot.y - 30, vol: 0.25, rate: 1.3 } : { vol: 0.2 });
      } else {
        await g.wait(auto() ? 0 : 0.9);
        await g.say(id, 'entranced', '...present.', { ...DARK, speed: 0.75 });
        g.sfx('pen_scratch', spot ? { x: spot.x, y: spot.y - 30, vol: 0.5, rate: 0.8 } : { vol: 0.4 });
        answered.push(id);
      }
      await g.wait(auto() ? 0 : 1.0);
    }
    g.set('ch8_last_roll');
    // The roll moves on. The light between the boards goes out.
    g.lights('floorboards', false);
    g.sfx('colonel_murmur', { dur: 2, vol: 0.25 });
    await g.wait(1.2);
    if (!answered.length) {
      await g.think('determined', 'None of them said it.');
    } else {
      const who = answered.map((id) => NAME[id]);
      const list = who.length === 1 ? who[0] : who.length === 2 ? `${who[0]} and ${who[1]}` : 'All three of them';
      await g.think('devastated', `${list} said present. {p=0.8} That's ink.`);
    }
    g.objective('Down. The iron stair.');
  },

  /** The foot of the iron spiral (first time): the descent's silence starts here. */
  'ch8.spiral': async (g) => {
    if (g.flag('ch8_spiral')) return;
    g.set('ch8_spiral');
    g.music(null, 0.3);
    look(g, 'up');
    await g.wait(1.4);
    await g.think('worried', "I can't hear them anymore.");
    await g.wait(0.4);
    look(g, 'right');
  },

  // ------------------------------------------------------------------------------------------ the vault
  'ch8.vault': async (g) => {
    install();
    const replay = g.seen('ch8_vault');
    look(g, 'right');
    if (!replay) {
      await g.wait(0.6);
      await g.cam([17, 26], { time: 2.4 });
      await g.narrate('A marble room, down where nothing should be. Wreaths gone to wire. A flag eaten to the stitching.');
      await g.cam([19, 26], { time: 1.4 });
      await g.wait(0.8);
      await g.narrate('In the middle, a tomb. {p} Split open. From the inside.');
      aimAt(g, 22, 29);
      await g.cam([21, 31], { time: 2.0 });
      await g.wait(1.4);
      await g.think('sad', 'Miss Adair.');
      await g.cam(null, { time: 1.4 });
    }
    if (!g.has('red_pen')) g.objective('Miss Adair. The desk.');
    g.checkpoint('vault');
  },

  'ch8.sarcophagus': async (g) => {
    look(g, 'up');
    if (g.flag('expelled')) {
      await g.examine('[n] Empty. It was always going to be empty.');
      return;
    }
    if (g.seen('ch8_sarcophagus')) {
      await g.examine(['[n] The hollow, the shape of something lying down. Too wide.', '[scared] Still warm.']);
      return;
    }
    await g.narrate('The lid is in pieces. Not pried off — pushed out, from in there.');
    await g.narrate('The hollow inside is the shape of something lying down. Something much too wide for a man.');
    g.sfx('husk_rustle', { x: 19.5 * TILE, y: 26.5 * TILE, vol: 0.4 });
    await g.wait(1.0);
    await g.narrate('I put my hand flat on the stone where it lay.');
    await g.wait(auto() ? 0 : 1.2);
    await g.think('scared', "It's still warm.");
  },

  /** Adair's husk: the red pen and her last note. */
  'ch8.adair': async (g) => {
    look(g, 'up');
    const husk = g.prop('v_adair_husk');                 // (the desk in front of her runs this too)
    if (g.has('red_pen') || g.flag('adair_note')) {
      await g.examine("[n] Miss Adair, kneeling at her desk in a cardigan gone to amber. Her hands are empty now.");
      if (!g.state.docs.adair_note) await g.doc('adair_note');
      return;
    }
    const replay = g.seen('ch8_adair');
    if (!replay) {
      await g.narrate('Her hands rest on a page of her own handwriting. The pen is still between her fingers. Red.');
      await g.wait(0.6);
    }
    g.sfx('paper_rustle', { x: 22.5 * TILE, y: 29.5 * TILE, vol: 0.5 });
    await g.narrate("I take it. Her fingers let go like they'd been waiting to.");
    g.give('red_pen');
    if (husk) g.setProp(husk.id, 'nopen');
    await g.doc('adair_note');
    g.set('adair_note');
    await g.wait(0.5);
    await g.think('determined', 'Get them out first. {p} Then him.');
    g.objective('Down. The breaker.');
  },

  /** Vault → breaker without the pen (exit refusal, DESIGN §9.2). Her light dies short, like Adair's. */
  'ch8.no_light': async (g) => {
    look(g, 'down');
    g.sfx('flashlight_flicker', { vol: 0.7 });
    g.flashlight(false);
    await g.wait(0.35);
    g.flashlight('restore');
    await g.wait(0.2);
    await g.think('worried', "My light won't reach. Not without— {p} no. Her pen.");
    await g.walk('tess', [32, 32]);
    look(g, 'left');
  },

  // ------------------------------------------------------------------------------------------ the breaker
  'ch8.breaker': async (g) => {
    install();
    const replay = g.seen('ch8_breaker');
    g.music(null, 0.3);
    look(g, 'up');
    // The shift whistle: the school bell from far below, two octaves down, with steam.
    g.sfx('school_bell', { rate: 0.25, vol: 0.9 });
    g.sfx('steam_hiss', { vol: 0.8 });
    g.shake(0.5, 1.4);
    if (!replay) {
      HW.art?.warmCg?.('breaker_reveal');
      await g.wait(1.6);
      await g.cg('breaker_reveal', { fade: 2.2 });
      await g.wait(3.2);
      await g.think('scared', "The bells. {p} That's the whistle.");
      await g.wait(0.6);
      await g.cg(null, { fade: 1.6 });
    }
    // The first two lamps, at the foot of the front face. The dead lighting the way.
    for (let i = 0; HW.breaker && HW.breaker.lit < 2 && i < 2; i++) {
      HW.breaker.lightNext();
      await g.wait(0.9);
    }
    if (!replay) {
      await g.wait(1.0);
      await g.cam([24, 31], { time: 2.2 });
      await g.wait(0.6);
      await g.think('scared', "Roll call's the payroll.");
      await g.cam([30, 19], { time: 2.6 });
      await g.think('scared', 'Hall pass. {p} Brass check.');
      await g.cam([29, 8], { time: 2.4 });
      await g.wait(1.4);
      await g.think('horrified', '...It never stopped running.');
      await g.cam(null, { time: 2.0 });
    }
    g.objective('The office. At the top.');
  },

  'ch8.office': async (g) => {
    install();
    if (g.flag('register_done')) return;
    const replay = g.seen('ch8_office');
    HW.audio?.duck?.(0.45, 2);                // room tone under the Register (DESIGN §14)
    await g.walk('tess', [30, 7]);
    look(g, 'left');
    if (!replay) {
      await g.wait(0.8);
      await g.narrate('Two candles burning, one either side of a book as long as my arm.');
      await g.wait(0.6);
      look(g, 'right');
      await g.narrate('On the shelf, one ledger is pulled halfway out. Like somebody wanted it read.');
      g.sfx('paper_rustle', { x: 34.5 * TILE, y: 5.5 * TILE, vol: 0.5 });
      await g.doc('ledger_colonel');
      await g.wait(0.8);
      look(g, 'down');
      await g.think('horrified', 'He watched.');
      look(g, 'left');
    } else if (!g.state.docs.ledger_colonel) {
      g.state.docs.ledger_colonel = true;
    }
    g.objective('The book.');
    g.checkpoint('office');
    faintRoll(g);
  },

  // ------------------------------------------------------------------------------------------ the Register
  /** sys.register hook: the friend's real voice, far up through the stone, as their name lifts away. */
  'ch8.register_voice': async (g, ctx) => {
    const id = ctx?.id;
    if (!FRIENDS.includes(id)) return;
    g.sfx('colonel_murmur', { dur: 1.2, vol: 0.18 });
    await g.wait(0.7);
    const expr = { danny: 'nervous', leah: 'worried', marcus: 'worried' }[id];
    await g.say(id, expr, `{dim}${ctx.text || PUPILS[id].voice}{/dim}`, { ...DARK, speed: 0.7 });
  },

  /** sys.register hook (flags committed, 'register closed' checkpointed): two seconds of nothing, then… */
  'ch8.after_register': async (g, ctx) => {
    install();
    const ending = ctx?.ending || g.flag('ending');
    HW.audio?.duck?.(1, 0.6);
    if (!ctx?.resume) {
      g.silence(true, 0.12);
      await g.wait(2);
    }
    if (ending === 'dismissed') { await g.run('ch8.dismissal'); return; }
    if (ending === 'withdrawn') { await g.run('ch8.escape'); return; }
    if (saved().length) { await g.run('ch8.escape_present'); return; }
    await g.run('ch8.present');
  },

  /** DISMISSED: the bell rings everywhere, on and on. No chase. The lamps go out as she climbs down. */
  'ch8.dismissal': async (g, ctx) => {
    g.set('ch8_dismissal');
    g.silence(false, 0.4);
    bellLoop(g);
    if (ctx?.resume) {
      HW.breaker?.extinguish?.({ follow: true });
      return;
    }
    const replay = g.seen('ch8_dismissal');
    g.sfx('desk_creak', { x: 28.5 * TILE, y: 5.5 * TILE, vol: 0.4, rate: 0.7 });  // the split chair, empty
    if (!replay) {
      await g.wait(2.4);
      look(g, 'down');
      await g.wait(1.6);
      // The candles go out on their own, one, then the other.
      g.setProp('br_candle', 'out');
      await g.wait(0.9);
      g.setProp('br_candle_2', 'out');
      await g.wait(1.4);
    }
    HW.breaker?.extinguish?.({ follow: true });
    g.objective('The auditorium.');
  },

  /** WITHDRAWN: Tess is off the roll and he isn't. The scream; the escape. */
  'ch8.escape': async (g) => {
    g.set('ch8_escape');
    const replay = g.seen('ch8_escape');
    const C = g.colonel;
    g.silence(false, 0.05);
    if (!replay) {
      HW.art?.warmCg?.('colonel_face');
      g.sfx('stinger_hard');                 // stinger #5 (DESIGN §14)
      g.cg('colonel_face', { fade: 0.05, params: { lit: 1 } });
      g.shake(2.2, 0.6);
      g.fx('chroma', 0.6, 1.2);
      g.fx('distort', 0.3, 1.2);
      await colonelVoice(g, 'WHO IS OUT OF THEIR SEAT.', { shake: 3, speed: 1.6 });
      await g.cg(null, { fade: 0.15 });
    }
    // He pours up out of the floor behind the desk — out of his chair.
    g.sfx('coal_slide', { x: 24 * TILE, y: 5 * TILE, vol: 1, rate: 0.7 });
    g.fx('emit', 'coal_dust', 24 * TILE + 8, 5 * TILE + 8, 14);
    await C.spawn([24, 5], { mode: 'scripted', anim: 'emerge', dir: 'right' });
    C.face('tess');
    look(g, 'left');
    g.music('chase', 0.2);
    await g.think('terrified', 'Run.');
    g.objective('Out. The front doors.');
    HW.chase?.escape?.({ cannotCatch: false, rubber: [4, 8] });
  },

  /** PRESENT with a friend freed: the chase plays, but he cannot catch her — he doesn't need to. */
  'ch8.escape_present': async (g) => {
    g.set('ch8_escape');
    const replay = g.seen('ch8_escape_present');
    const C = g.colonel;
    g.silence(false, 0.6);
    g.sfx('desk_creak', { x: 28.5 * TILE, y: 5.5 * TILE, vol: 0.6, rate: 0.6 });
    await g.wait(1.0);
    g.sfx('colonel_breath', { x: 26 * TILE, y: 5 * TILE, vol: 0.8 });
    g.sfx('coal_slide', { x: 24 * TILE, y: 5 * TILE, vol: 0.7, rate: 0.6 });
    await C.spawn([24, 5], { mode: 'scripted', anim: 'emerge', dir: 'right' });
    C.face('tess');
    look(g, 'left');
    if (!replay) {
      await g.wait(1.4);
      await g.think('terrified', 'Get them out. {p} Go.');
    }
    g.music('chase', 0.4);
    g.objective('Out. The front doors.');
    HW.chase?.escape?.({ cannotCatch: true, rubber: [4, 8] });
  },

  /** PRESENT with nobody freed: the book closes, the bell rings once, the pen goes down by itself. */
  'ch8.present': async (g) => {
    g.set('ch8_escape');
    g.silence(false, 0.4);
    g.sfx('school_bell', { dur: 3.6, vol: 0.8 });
    await g.wait(auto() ? 0 : 4.2);
    look(g, 'up');
    await colonelVoice(g, 'Thank you, Theresa.', { speed: 0.7 });
    await g.wait(1.2);
    g.sfx('desk_creak', { x: 28.5 * TILE, y: 6.5 * TILE, vol: 0.3, rate: 1.4 });
    await g.narrate("My hand puts the pen down on the desk. Gently. I didn't tell it to.");
    await g.wait(1.6);
    await g.fade('out', 2.6);
    await g.ending('present');
  },

  // ------------------------------------------------------------------------------------------ DISMISSED: the way up
  /** The vault, on the way back: Miss Adair's shell lifts away. Then up, through the trapdoor. */
  'ch8.vault_after': async (g) => {
    if (g.flag('ch8_vault_after')) return;
    g.set('ch8_vault_after');
    const husk = g.prop('v_adair_husk');
    look(g, 'left');
    await g.cam([22, 29], { time: 2.2 });
    await g.wait(0.8);
    if (husk) {
      const p = at(22, 29);
      for (let i = 0; i < 4; i++) {
        g.fx('emit', 'amber_motes', p.x, p.y - 6, 10, { z: 10 });
        await g.wait(auto() ? 0 : 0.5);
      }
      g.sfx('husk_rustle', { x: p.x, y: p.y, vol: 0.4, rate: 0.8 });
      g.removeProp(husk.id);
    }
    await g.narrate("Miss Adair's shell is coming apart. Not falling. Lifting — up past my light, toward the stage.");
    await g.wait(1.6);
    await g.fade('out', 1.8);
    g.sfx('trapdoor', { vol: 0.5, rate: 0.9 });
    await g.transfer('aud', 'trapdoor', { fade: false });
    await g.wait(0.6);
    await g.fade('in', 1.4);
  },

  /** The auditorium: the Colonel on the stage edge. */
  'ch8.stage_edge': async (g) => {
    if (g.flag('ch8_stage_done')) return;
    const replay = g.seen('ch8_stage_edge');
    // The three of them, awake, still in their seats. The house still full.
    for (const id of FRIENDS) seatFriend(id, true);
    HW.lighting?.setGroup?.('assembly', true, { mode: 'instant' });
    // Him, sitting on the stage edge. Not the AI: nothing here hunts anymore (and an NPC can keep the empty
    // uniform — the dissolve's last frame — without the AI's breathing loop going on under it).
    const E = 'colonel_edge';
    const him = g.spawn({ id: E, sprite: 'colonel', at: [21, 13], dir: 'down', solid: false });
    const breath = g.loop('colonel_breath', { x: 21 * TILE + 8, y: 12 * TILE, vol: 0.5 });
    await g.walk('tess', [32, 9]);
    await g.walk('tess', [26, 13]);
    look(g, 'left');
    await g.cam([22, 13], { time: 1.6 });
    if (!replay) {
      await g.wait(1.2);
      await g.narrate("He's sitting on the edge of the stage, looking out at the house. Listening to the bell.");
      await g.wait(1.0);
    }
    g.face(E, 'right');
    await g.wait(1.0);
    await g.say('colonel', 'confused', 'Theresa. {p} ...The bell.', { light: 'under' });
    await g.wait(0.8);
    await g.say('colonel', 'dissolving', 'I was to be the last to leave.', { light: 'under', speed: 0.8 });
    await g.wait(0.6);
    await g.say('tess', 'sad', 'You are.');
    await g.wait(1.2);
    if (!replay) await g.narrate('He blinks. {p} Both eyes, at the same time.');
    // He comes apart into coal dust and wet wool. The empty uniform is the last thing left behind.
    g.sfx('coal_slide', { x: 21 * TILE + 8, y: 13 * TILE, vol: 0.8, rate: 0.55 });
    g.sfx('husk_rustle', { x: 21 * TILE + 8, y: 13 * TILE, vol: 0.5, rate: 0.6 });
    const pt = at(21, 12);
    g.fx('emit', 'coal_dust', pt.x, pt.y, 18, { z: 20 });
    try { breath.stop(1.2); } catch { /* audio stub */ }
    if (him) await g.anim(E, 'dissolve', { once: true, hold: true });
    g.fx('emit', 'coal_dust', pt.x, pt.y + 8, 10, { z: 6 });
    g.set('portrait_state', 'uniform');
    g.refresh();
    await g.wait(1.6);
    // The house lights come up, gray. The spotlight on the lectern goes out.
    HW.lighting?.setGroup?.('assembly', false, { mode: 'fade', time: 3 });
    HW.lighting?.setAmbient?.('#8f8a96', 0.74, 4);
    await g.cam([21, 22], { time: 2.4 });
    // Every husk in the house goes to slow amber motes, row by row from the front.
    const map = HW.map;
    const rows = new Map();
    for (const p of map?.props || []) {
      if (p.type !== 'aud_seat' || p.state !== 'occupied' || !p.present || p.id === 'aud_seat_denise') continue;
      const r = Number(p.inst?.row) || 9;
      if (!rows.has(r)) rows.set(r, []);
      rows.get(r).push(p);
    }
    for (const r of [...rows.keys()].sort((a, b) => a - b)) {
      for (const p of rows.get(r)) {
        const occ = String(p.params?.occupant || p.inst?.occupant || 'husk_b').replace(/[:_-]?(turned|crumbled)$/, '');
        g.setProp(p.id, 'occupied', { occupant: `${occ}:crumbled` });
        g.fx('emit', 'amber_motes', p.x * TILE + 8, p.y * TILE + 4, 2, { z: 8 });
      }
      g.sfx('husk_rustle', { x: 21 * TILE, y: (14 + r * 2) * TILE, vol: 0.35, rate: 0.9 + r * 0.03 });
      await g.wait(auto() ? 0 : 0.45);
    }
    await g.wait(auto() ? 0 : 2.4);
    // Denise, last. She turns toward Marcus.
    await g.cam([26, 16], { time: 1.6 });
    const den = map?.prop('aud_seat_denise');
    if (den) g.setProp(den.id, 'occupied', { occupant: 'husk_e:turned' });
    g.face('marcus', 'left');
    await g.wait(auto() ? 0 : 2.2);
    if (!replay) await g.narrate('She turns her head toward Marcus. {p} Then she isn\'t there.');
    if (den) {
      g.setProp(den.id, 'occupied', { occupant: 'husk_e:crumbled' });
      g.fx('emit', 'amber_motes', 26 * TILE + 8, 16 * TILE + 4, 14, { z: 10 });
      g.sfx('husk_rustle', { x: 26 * TILE + 8, y: 16 * TILE, vol: 0.4, rate: 1.1 });
    }
    await g.wait(auto() ? 0 : 3.0);
    g.set('husks_gone');
    g.refresh();
    // Up. The three of them come to the stage steps.
    await g.walk('tess', [28, 13]);
    await g.walk('tess', [28, 15]);
    look(g, 'left');
    await g.cam([22, 15], { time: 1.2 });
    const walks = [];
    for (const [id, x] of [['danny', 23], ['leah', 25], ['marcus', 27]]) {
      if (!standFriend(id)) continue;
      walks.push(g.walk(id, [x, 15]).then(() => { if (g.alive && g.npc(id)) g.face(id, 'tess'); }));
    }
    await Promise.all(walks);
    if (!replay) {
      await g.wait(0.6);
      if (g.has('danny_flashlight')) {
        await g.narrate("Danny's flashlight is still in my hand. I give it back.");
        g.take('danny_flashlight');
        if (HW.state.lightSource === 'danny') HW.state.lightSource = 'maglite';
        g.light('danny', DANNY_LIGHT);
        await g.say('tess', 'exhausted', "It's still on.");
        await g.say('danny', 'sad', '...You broke it.');
      }
      if (g.has('camcorder')) {
        g.take('camcorder');
        g.sfx('camcorder_click', { x: 25 * TILE, y: 15 * TILE, vol: 0.6 });
        await g.say('leah', 'hurt', 'T. {p} Is it still—');
        await g.say('tess', 'exhausted', 'Still recording.');
      }
      if (g.has('denise_photo')) {
        g.take('denise_photo');
        await g.narrate("Marcus takes the photo. He looks at it for a long time, and then at the seat beside his. He doesn't say anything.");
      }
    } else {
      for (const it of ['danny_flashlight', 'camcorder', 'denise_photo']) if (g.has(it)) g.take(it);
      if (HW.state.lightSource === 'danny') HW.state.lightSource = 'maglite';
      g.light('danny', DANNY_LIGHT);
    }
    joinParty(g, FRIENDS);
    g.set('ch8_stage_done');
    await g.cam(null, { time: 1.0 });
    g.objective('The front doors.');
  },

  /** The lobby, DISMISSED: Kevin; the doors on the last ring; Adair in the trophy glass. */
  'ch8.lobby': async (g) => {
    if (g.flag('ch8_lobby_done')) { doorsOpen(g); dawnDoorLight(); return; }
    const replay = g.seen('ch8_lobby');
    const P = HW.patrol;
    // The Safety Patrol boy, at the far end, in front of the vestibule doors.
    const k = P?.spawn?.('kevin', { at: [15, 17], dir: 'up', whistle: false }) || null;
    look(g, 'down');
    await g.cam([15, 19], { time: 1.6 });
    await g.wait(1.0);
    if (k) {
      P.dismiss();
      g.sfx('squeak', { x: k.x, y: k.y, vol: 0.4 });
      await g.wait(auto() ? 0 : 1.6);
      if (!replay) await g.narrate('The Safety Patrol boy lets the whistle drop on its cord. He unbuckles the orange belt and holds it out, like he\'s handing it in.');
      await g.wait(auto() ? 0 : 1.2);
      g.fx('emit', 'amber_motes', k.x, k.y - 14, 12, { z: 12 });
      await tween(1.4, (t) => { if (g.npc('kevin')) k.alpha = 1 - t; });
      P.despawn('kevin');
    }
    // The bell's last ring. On it, the doors swing open by themselves.
    g.set('ch8_bell_done');
    await g.wait(auto() ? 0 : 2.0);
    g.sfx('school_bell', { dur: 4.5, vol: 0.9 });
    await g.wait(auto() ? 0 : 4.2);
    doorsOpen(g);
    g.sfx('door_creak_slow', { x: 15 * TILE, y: 25 * TILE, vol: 0.9 });
    g.sfx('door_creak_slow', { x: 15 * TILE, y: 20 * TILE, vol: 0.6, delay: 0.3 });
    dawnDoorLight();
    HW.audio?.ambience?.('dawn', 4);
    await g.cam([15, 22], { time: 2.0 });
    await g.wait(1.0);
    // The trophy case (the Ch1 glimpse, held this time).
    await g.walk('tess', [11, 22]);
    look(g, 'up');
    await g.wait(1.2);
    g.sfx('glass_tone', { x: 10 * TILE + 8, y: 21 * TILE, vol: 0.6 });
    const ghost = glassGhost(g, 'adair_dawn', 10, 21, 'idle_down', 0.78);
    await g.wait(1.8);
    if (!replay) await g.narrate("In the trophy glass, over my shoulder: Miss Adair. {p} She's smiling.");
    await fog(g, 'GO HOME, TESS', { x: 10 * TILE + 8, y: 21 * TILE });
    await g.wait(1.6);
    await g.say('tess', 'crying', 'Okay.', { speed: 0.8 });
    await g.wait(0.8);
    await ghost.despawn(1.4);
    look(g, 'down');
    g.set('ch8_lobby_done');
    await g.cam(null, { time: 1.0 });
    g.objective('Home.');
  },

  // ------------------------------------------------------------------------------------------ the escape
  /** Non-blocking (lobby, during an escape): the front doors stand open on gray dawn. */
  'ch8.lobby_open': async (g) => {
    doorsOpen(g);
    dawnDoorLight(0.85);
  },

  /** The auditorium on the way out: the freed wake and run with her; the rest stay in their seats. */
  'ch8.escape_aud': async (g) => {
    const free = saved();
    const lost = FRIENDS.filter((id) => !free.includes(id));
    HW.lighting?.setGroup?.('assembly', true, { mode: 'instant' });
    for (const id of lost) seatFriend(id, false);
    const fresh = free.filter((id) => !g.party.has(id));
    for (const id of fresh) seatFriend(id, true);
    if (g.seen('ch8_escape_aud')) {
      // A reload mid-escape: the freed are already in the party; the rest are back in their seats.
      for (const id of fresh) standFriend(id);
      if (fresh.length) joinParty(g, free);
      return;
    }
    // Off the trap-room ladder, through the wing, down the stage steps, to the front row.
    await g.walk('tess', [32, 9], { run: true });
    await g.walk('tess', [29, 13], { run: true });
    await g.walk('tess', [20, 15], { run: true });
    look(g, 'down');
    await g.cam([19, 16], { time: 0.8 });
    // The ones she got off the roll: awake, blinking at the house.
    const WAKE = {
      danny: ['nervous', 'Dolan. {p} Tell me this is the dream part.'],
      leah: ['worried', "T? {p} Where's my camera?"],
      marcus: ['worried', 'Tess.'],
    };
    for (const id of fresh) {
      g.face(id, 'tess');
      await g.say(id, WAKE[id][0], WAKE[id][1]);
    }
    if (fresh.length) await g.say('tess', 'determined', "Get up. {p} We're going.");
    // The ones she didn't.
    for (let i = 0; i < lost.length; i++) {
      const id = lost[i];
      await g.walk('tess', `beside_${id}`, { run: true });
      look(g, 'down');
      if (i < 2) await g.say('tess', 'scared', `${NAME[id]}. {p} ${NAME[id]}, get up.`);
      else await g.say('tess', 'devastated', `${NAME[id]}—`);
      await g.say(id, 'entranced', `Class is starting, ${NICK[id]}.`);
    }
    // Under the stage, the trapdoor bangs up. He's coming.
    g.sfx('trapdoor', { x: 38 * TILE, y: 8 * TILE, vol: 1 });
    g.sfx('colonel_drag', { x: 37 * TILE, y: 8 * TILE, vol: 0.8 });
    g.shake(0.6, 0.3);
    look(g, 'up');
    const p = g.player;
    await Promise.all(fresh.map((id) => {
      standFriend(id);
      return g.walk(id, { x: p.x + (id === 'danny' ? -14 : id === 'leah' ? 0 : 14), y: p.y + 12 }, { run: true });
    }));
    joinParty(g, free);
    await g.cam(null, { time: 0.4 });
    g.checkpoint('escape_aud');
  },

  /** Lobby trigger (PRESENT): the vestibule. The friends cross into the dawn. She doesn't. */
  'ch8.vestibule': async (g) => {
    if (g.flag('ch8_doors_shut')) return;
    g.set('ch8_doors_shut');
    HW.chase?.stop?.('stopped');
    const C = g.colonel;
    if (C?.entity) C.despawn({ sink: true });
    g.music(null, 0.6);
    doorsOpen(g);
    const free = saved().filter((id) => g.npc(id));
    hold(g, ...free);
    // They go past her, out into the gray. They think she's right behind them.
    const outs = free.map((id, i) => (async () => {
      await g.wait(i * 0.35);
      await g.walk(id, [14 + (i % 2), 24], { run: true });
      await g.walk(id, [14 + (i % 2), 26]);
      const e = g.npc(id);
      if (e) await tween(0.8, (k) => { e.alpha = 1 - k; });
      if (g.npc(id)) g.despawn(id);
    })());
    await g.walk('tess', [15, 23]);
    look(g, 'down');
    await Promise.all(outs);
    const first = free[0];
    if (first) {
      await g.wait(0.6);
      await g.say(first, 'worried', `${NICK[first]}. {p} Come on.`, { light: 'dawn' });
    }
    await g.wait(1.0);
    // The intercom. Her full name.
    g.sfx('intercom_crackle', { vol: 0.7 });
    await g.wait(1.0);
    g.sfx('stinger_soft', { vol: 0.6 });
    await colonelVoice(g, 'Theresa.', { speed: 0.7 });
    await g.wait(0.8);
    look(g, 'up');                               // she turns
    await g.wait(1.4);
    g.sfx('door_close_metal', { x: 15 * TILE, y: 25.5 * TILE, vol: 1, rate: 0.85 });
    g.setProp('lobby_front_doors', 'closed');
    g.shake(0.5, 0.2);
    g.overlay('black', { alpha: 1 });
    await g.wait(auto() ? 0 : 2.4);
    g.overlay('black', null);
    await g.fade('out', 0.01);
    await g.ending('present');
  },

  // ------------------------------------------------------------------------------------------ dawn
  /** The front steps at dawn (DISMISSED / WITHDRAWN): "It's morning. How is it morning?" */
  'ch8.dawn': async (g) => {
    const ending = g.flag('ending');
    g.set('dawn');
    g.music(null, 1.5);
    HW.fx?.rain?.(false, 0, { instant: true });
    HW.lighting?.setAmbient?.(DAWN, 0.5, 0);
    HW.audio?.ambience?.('dawn', 2);
    for (const [id, st] of [['ext_door_lamp', 'off'], ['ext_wagon', 'off'], ['ext_front_doors', 'open']]) if (g.prop(id)) g.setProp(id, st);
    if (g.colonel?.entity) g.colonel.despawn({ sink: false });
    look(g, 'down');
    await g.cam([24, 12], { time: 2.2 });
    await g.wait(1.6);
    await g.say('tess', 'exhausted', "It's morning. {p} How is it *morning*?", { light: 'dawn' });
    if (g.party.has('leah') && g.npc('leah')) {
      await g.wait(0.6);
      await g.say('leah', 'deadpan', 'We got here at nine forty-seven.', { light: 'dawn' });
    }
    await g.wait(1.8);
    await g.fade('out', 2.0);
    await g.ending(ending === 'dismissed' ? 'dismissed' : 'withdrawn');
  },
};
