// CHAPTER VI — Passing Time (west1, lobby, east1, gym, basement; Marcus until the gym). DESIGN §6 VI ·
// CONTENT §3 · owner: narrative-4.
//
//   ch6.start        after the card (wherever ch5.end leaves Tess): Haupt's office. Marcus in the party.
//   ch6.portrait     Haupt's small portrait (w1_haupt_portrait). Before the compact has shown it open in
//                    1979 (safe_seen_past): "Just a painting. He's watching the door." (a second try brings
//                    Adair to the diploma glass, pointing at Tess's bag). After: it swings out → sys.safe.
//   ch6.safe_open    (sys.safe hook) the stamp + ink pad, the AUD key, Haupt's letter, the thunk; the
//                    intercom — the Colonel, quietly, to Tess for the first time outside a roll call; "No."
//   ch6.breather     (lobby trigger / ch1.backpack) the bench, Danny's Krimpets, "You've been weird since
//                    August." [Tell him about Philly] / [It's nothing.]; Marcus hums, a clarinet carries the
//                    tune on from the east: "That's not me." → gym_open.
//   ch6.lead         (non-blocking, east1) Marcus walks ahead down the east hall, waiting for her.
//   ch6.gym_doors    at the gym doors: checkpoint 'gym doors'; he goes in first.
//   ch6.gym_arrive   (non-blocking, gym) Marcus stopped dead two steps inside the doors.
//   ch6.gym          (gym trigger) Denise on the bleachers; [Marcus, wait—] / [Grab his arm.]; the lure;
//                    four banks bang on near → far; him, under the far hoop; he rises; "TESS. RUN."
//   ch6.chase        (non-blocking) HW.chase.gym() — resolves 'hidden' when she climbs into the locker.
//   ch6.locker       (gym_locker_tess) THE LOCKER: the slit view, the taps, the face, roll call #2 —
//                    [Here.] / [Hold your breath.] (one retry, then 'breath'). Checkpoint inside.
//   ch6.after_locker Marcus is gone. The photo on the boards (denise_photo, by script).
//   ch6.showers      (gym trigger) every mirror holds Adair, pointing down; the fog by rollAnswered.
//   ch6.alone        no drone; rain, a clock; the phonograph on the intercom. "I could just go home."
//   ch6.chute        (basement b_chute) the coal chute: refusals (DESIGN §9.2) or the TRUANT choice.
//
// Module hooks (installed once the game exists, so they also hold after a reload):
//   mapLoad  gym: the four banks stay lit after ch6_gym_lights (group state isn't saved) · east1:
//            Marcus leads (ch6.lead); Kevin on the walk back · gym while he leads: ch6.gym_arrive ·
//            elsewhere while he leads: he rejoins the caterpillar.
//   load     a reload in the lit gym resumes ch6.locker (slit view, tapping phase 0.4) or
//            ch6.after_locker; seen_ch6_* / seen_ch7_* / seen_roll3 survive a retry (stashed on gameOver:
//            the gym's checkpoints are before its scene sets seen_ — Pillar 6).
// Exports used by other files (keep stable): look, tween, auto, fog, glassGhost, hold, later, hasTrack,
// installCh6 (ch7.js; end.js imports auto / tween / look).
// Replays: every scene calls g.seen() and jumps to its decision point when it was already seen.
import HW from '../../engine/hw.js';

const TILE = 16;
const VOICE = { name: '???' };                                   // the school (no bust before the gym)
const DENISE_LIGHT = Object.freeze({ type: 'bulb', color: '#e8cf8a', radius: 1.5, intensity: 0.55, cage: false, glow: null });
const ADAIR_SHEEN = Object.freeze({ type: 'bulb', radius: 1.3, intensity: 0.6, color: '#9ec3c9', cage: false, glow: null });
const BANKS = [6, 16, 26, 37];                                    // gym1..gym4, near (west) → far (east)
const GYM_DOOR_WAIT = [56, 15];

export const auto = () => !!HW.debug?.autoAdvance;
const ent = (id) => HW.entities?.get(id) || null;
const flags = () => HW.state?.flags || {};
const dist = (a, b) => (a && b ? Math.hypot(a.x - b.x, a.y - b.y) : Infinity);
const roomOf = (e) => (e && HW.map ? HW.map.roomAt(e.x, e.y)?.id || null : null);
const ch = () => HW.state?.chapter || 0;

/** Marcus leads (breather done, gym not yet lit, still with her). */
const LEAD = (s = HW.state) => !!s && s.chapter === 6 && !!s.flags.ch6_breather_done && !s.flags.ch6_gym_lights && !s.flags.ch6_marcus_taken;

/** Tess turns to a direction / entity / anchor, and her beam goes with her (it holds still in cutscenes). */
export function look(g, target) {
  g.face('tess', target);
  const p = HW.player;
  if (!p || !HW.flashlight) return;
  const e = typeof target === 'string' ? (HW.entities?.get(target) || HW.map?.anchor(target)) : null;
  HW.flashlight.angle = e ? Math.atan2(e.y - 6 - (p.y - 9), e.x - p.x) : Math.atan2(p.aimY, p.aimX);
}

/** Game-time tween that collapses under autoAdvance (tests). */
export function tween(sec, fn) {
  if (auto() || !HW.game?.tween) { fn(1); return Promise.resolve(); }
  return HW.game.tween(sec, fn);
}

/** Is a music track available? (a solo clarinet is an audio request — silence until it exists) */
export const hasTrack = (id) => !!HW.audio?.ids?.music?.includes?.(id);

/** Adair writes in the fog: never speaks (CONTENT §3). */
export async function fog(g, text, at = null) {
  g.sfx('glass_write', at ? { ...at, vol: 0.9 } : { vol: 0.9 });
  await g.wait(0.5);
  await g.narrate(`{dim}${text}{/dim}`);
}

/**
 * Miss Adair in a pane of glass at a wall cell (tile x, face row y): a half-there figure with a cold
 * sheen, fading in. Returns { despawn() }. id must be unique per scene.
 */
export function glassGhost(g, id, tx, ty, anim = 'idle_down', alpha = 0.72) {
  const e = g.spawn({ id, sprite: 'adair', px: tx * TILE + 8, py: ty * TILE + 8, dir: 'down', alpha: 0 });
  if (e) {
    e.sortBias = 10;
    e.shadow = false;
    e.solid = false;
    g.anim(id, anim, { hold: true });
  }
  const sheen = HW.lighting?.addLight?.({ ...ADAIR_SHEEN, px: tx * TILE + 8, py: ty * TILE - 6, map: HW.map?.id, intensity: 0 }) || null;
  tween(0.6, (k) => { if (e) e.alpha = alpha * k; if (sheen) sheen.intensity = ADAIR_SHEEN.intensity * k; });
  return {
    entity: e,
    async despawn(sec = 0.8) {
      await tween(sec, (k) => { if (e) e.alpha = alpha * (1 - k); if (sheen) sheen.intensity = ADAIR_SHEEN.intensity * (1 - k); });
      if (HW.entities?.get(id)) HW.entities.despawn(id);
      if (sheen) HW.lighting?.removeLight?.(sheen);
    },
  };
}

/** Take a friend out of the caterpillar so a scene can place them (they stay where they stand). */
export function hold(g, ...ids) {
  for (const id of ids) if (g.party.has(id)) g.party.remove(id);
}

/** Run a script once the current transfer has finished (hooks fire inside loadMap). */
export function later(id, ctx = {}, { blocking = true, delay = 0 } = {}) {
  const gen = HW.scripts.gen;
  HW.game.until(() => !HW.game.transferring, 10).then(async () => {
    if (delay) await HW.game.afterSteps?.(delay);
    if (gen === HW.scripts.gen) HW.scripts.run(id, ctx, { blocking });
  });
}

/** The Colonel speaks without a bust (DESIGN §5.1 portrait rule): the school's voice. */
async function colonelVoice(g, text, opts = {}) {
  HW.audio?.murmur?.(1.4);
  await g.say('voice', null, text, { ...VOICE, ...opts });
}

/** Marcus as an NPC on this map (spawning him if the caterpillar didn't bring him). */
function ensureMarcus(g, at) {
  let m = g.npc('marcus');
  if (!m) m = g.spawn({ id: 'marcus', sprite: 'marcus', at, dir: 'right' });
  hold(g, 'marcus');
  return m;
}

/** A gym light bank bangs on (no automatic switch sound in 'bang' mode: the contactor's thunk). */
function bank(g, n, vol = 0.75) {
  HW.lighting?.setGroup?.(`gym${n}`, true, { mode: 'bang' });
  g.sfx('door_slam', { x: BANKS[n - 1] * TILE + 8, y: 15 * TILE, vol, rate: 0.55 });
}

/** All four banks on at once (after a reload: group state isn't saved). */
function banksOn() {
  for (let n = 1; n <= 4; n++) HW.lighting?.setGroup?.(`gym${n}`, true, { mode: 'instant' });
}

/** Leave the gym quiet behind her: Marcus and Denise gone (out of her sight). */
function takeMarcus(g) {
  for (const id of ['marcus', 'denise']) if (g.npc(id)) g.despawn(id);
  if (g.party.has('marcus')) g.party.remove('marcus');
}

// ---------------------------------------------------------------------------------------------
// Hooks. Installed once (polled until the game exists), like pro.js's weather.
let installed = false;
let stash = null;            // seen_ flags remembered across a game over (retry)
let kevinGen = -1;
export function installCh6() {
  if (installed) return true;
  if (!HW.game?.on || !HW.scripts) return false;
  installed = true;
  HW.game.on('mapLoad', (map) => {
    const s = HW.state;
    if (!s || !map) return;
    const f = s.flags;
    if (map.id === 'gym' && f.ch6_gym_lights) banksOn();
    if (LEAD(s)) {
      if (map.id === 'east1') later('ch6.lead', {}, { blocking: false });
      else if (map.id === 'gym') later('ch6.gym_arrive', {}, { blocking: false });
      else if (!s.party.includes('marcus')) { s.party.push('marcus'); HW.entities?.syncParty?.(); }
    }
    // Kevin, at the far end of the east hall, on the walk back alone (DESIGN §6 VI.8).
    if (map.id === 'east1' && s.chapter === 6 && f.ch6_marcus_taken && !f.ch6_kevin && kevinGen !== HW.scripts.gen) {
      kevinGen = HW.scripts.gen;
      later('ch6.kevin', {}, { blocking: false });
    }
  });
  // Pillar 6: a retry never replays a scene's dialogue. The gym's checkpoint is at the doors, before
  // the scene sets its seen_ flag, so remember this chapter's seen_ flags across the game over.
  HW.game.on('gameOver', () => {
    const f = HW.state?.flags || {};
    stash = Object.keys(f).filter((k) => /^seen_(ch6_|ch7_|roll3$)/.test(k) && f[k]);
  });
  HW.game.on('load', () => {
    if (stash) {
      // only into the run that died (Ch6/Ch7); never into an older save loaded from the title
      if ((HW.state?.chapter || 0) >= 6) for (const k of stash) HW.state.flags[k] = true;
      stash = null;
    }
    // A reload inside the gym after the lights (the 'locker' / 'roll 2' checkpoints): pick the scene up.
    const s = HW.state;
    const f = s?.flags || {};
    if (HW.map?.id !== 'gym' || s.chapter !== 6 || !f.ch6_gym_lights) return;
    if (!f.roll2_done) later('ch6.locker', { resume: true });
    else if (!f.ch6_marcus_taken || !s.inv.denise_photo) later('ch6.after_locker', { resume: true });
  });
  HW.game.on('newGame', () => { stash = null; });
  HW.game.on('title', () => { stash = null; });
  return true;
}
if (typeof window !== 'undefined') {
  const poll = setInterval(() => { if (installCh6()) clearInterval(poll); }, 200);
}

// ---------------------------------------------------------------------------------------------
export default {
  // ------------------------------------------------------------------------------------------ start
  'ch6.start': async (g) => {
    installCh6();
    if (!g.party.has('marcus') && !g.flag('ch6_marcus_taken')) g.party.add('marcus');
    g.objective("Haupt's office. The safe.");
    g.seen('ch6_start');
  },

  // ------------------------------------------------------------------------------------------ the safe
  /** w1_haupt_portrait (gate: chapter ≥ 6 and the 1979 view of it, swung open). */
  'ch6.portrait': async (g, ctx) => {
    look(g, 'up');
    const f = g.state.flags;
    if (f.safe_open) { await g.run('sys.safe', ctx); return; }
    const prop = ctx?.prop || g.prop('w1_haupt_portrait');
    if (ch() < 6 || !f.safe_seen_past) {
      if (!f.ch6_portrait_looked) {
        g.set('ch6_portrait_looked');
        await g.narrate("A small oil of the Colonel in a gilt frame, hanging a little crooked. I go to straighten it. It doesn't budge.");
      }
      await g.think('worried', "Just a painting. He's watching the door.");
      if (ch() >= 6 && g.inc('ch6_portrait_tries') >= 2 && !f.ch6_safe_hint) await safeHint(g);
      return;
    }
    // The compact showed it open in 1979: there's a catch.
    if (prop && prop.state !== 'open') {
      const replay = g.seen('ch6_portrait');
      if (!replay) await g.narrate('I feel along the gilt. Under the bottom edge, a catch.');
      g.sfx('safe_click', { x: 55.5 * TILE, y: 20.5 * TILE, vol: 0.8 });
      g.setProp(prop.id, 'open');
      await g.wait(0.6);
      if (!replay) {
        await g.narrate('The painting swings out on hinges. Behind it, a little steel door with a dial.');
        if (g.party.has('marcus') && g.npc('marcus')) {
          g.face('marcus', 'principal_portrait');
          await g.say('marcus', 'thoughtful', 'Behind *him*. {p} Of course it is.');
        }
      }
    }
    await g.run('sys.safe', ctx);
  },

  /** sys.safe's hook: safe_open is set. The stamp, the key, the letter, and the intercom. */
  'ch6.safe_open': async (g) => {
    const replay = g.seen('ch6_safe_open');
    g.sfx('safe_open', { x: 55.5 * TILE, y: 20.5 * TILE });
    g.music(null, 1.2);
    await g.wait(0.8);
    await g.narrate('Inside: a rubber stamp on a tin ink pad. A long brass key on a paper tag. An envelope with no name on it.');
    g.give('withdrawn_stamp');
    g.give('aud_key');
    if (!replay) {
      g.sfx('paper_rustle', { vol: 0.6 });
      await g.doc('haupt_letter');
      // She tries the stamp on the back of the envelope.
      await g.wait(0.5);
      g.sfx('stamp', { vol: 1 });
      g.shake(0.6, 0.15);
      await g.narrate('I press the stamp on the back of the envelope. *WITHDRAWN*, in purple. The pad is still wet.');
      await g.wait(1.2);
      // The intercom. For the first time he speaks to her outside a roll call — quietly.
      g.sfx('intercom_crackle', { vol: 0.6 });
      const hum = g.loop('intercom_hum', { vol: 0.35 });
      await g.wait(1.6);
      g.fx('distort', 0.12, 2.6);
      await colonelVoice(g, 'Theresa. {p=1.2} Those belong to the principal. {p=1.4} ...Put them back.', { speed: 0.75 });
      await g.wait(1.0);
      try { hum.stop(0.6); } catch { /* audio stub */ }
      look(g, 'down');
      await g.say('tess', 'determined', 'No.');
      await g.wait(0.9);
      if (g.npc('marcus')) {
        g.face('marcus', 'tess');
        await g.wait(0.6);
      }
      look(g, 'up');
      await g.say('tess', 'angry', "Founder's Day. {p} The day his boys died. {p=0.8} He made it a holiday.");
    } else {
      g.state.docs.haupt_letter = true;
    }
    g.objective('The auditorium.');
    g.checkpoint('safe');
  },

  // ------------------------------------------------------------------------------------------ the breather
  /** Lobby trigger (safe_open && !ch6_breather_done), or Danny's backpack (ch1.backpack hands over). */
  'ch6.breather': async (g) => {
    if (g.flag('ch6_breather_done') || !g.flag('safe_open')) return;
    const replay = g.seen('ch6_breather');
    const m = ensureMarcus(g, [14, 13]);
    const bench = g.prop('lobby_bench');
    g.music(null, 2.5);            // no drone under this one
    // He walks past her to the bench by Danny's bag and sits down hard.
    if (!replay) await g.cam([15, 9], { time: 1.6 });
    await g.walk('marcus', [14, 11]);
    sitMarcusOnBench(m);
    g.sfx('desk_creak', { x: 14.5 * TILE, y: 10.5 * TILE, vol: 0.7, rate: 0.75 });
    if (!replay) {
      await g.wait(0.6);
      await g.say('marcus', 'sad', 'Sit a minute. {p} My hands won\'t stop.');
      await g.choice(['Sit.']);
    }
    await g.walk('tess', [15, 11]);
    if (bench && HW.hiding && !HW.player.seated) await HW.hiding.sit(bench);
    if (!replay) {
      await g.wait(1.4);
      g.sfx('paper_rustle', { x: 16.5 * TILE, y: 10.5 * TILE, vol: 0.6 });
      await g.narrate('He reaches into Danny\'s backpack and comes out with the box of Butterscotch Krimpets. Splits the cellophane with his thumb. Holds one out.');
      await g.say('tess', 'smirk', "He'd kill us.");
      await g.say('marcus', 'soft_smile', "He'd want us to.");
      await g.wait(2.2);
      await g.say('marcus', 'thoughtful', "You've been weird since August.");
    }
    const c = await g.choice(['Tell him about Philly.', "It's nothing."]);
    if (c === 0) {
      g.set('ch6_told_marcus');
      await g.say('tess', 'look_away', 'Mom took a job in Philly. {p} We leave after Christmas.');
      await g.wait(0.8);
      await g.say('marcus', 'neutral', "Philly's not that far.");
      await g.say('tess', 'sad', "It's two hours.");
      await g.say('marcus', 'soft_smile', 'Like I said.');
    } else {
      await g.say('tess', 'look_away', "It's nothing.");
      await g.wait(0.8);
      await g.say('marcus', 'neutral', 'Okay.');
    }
    if (g.flag('bond_leah') || g.flag('ch6_told_marcus')) {
      g.set('ch6_homeroom_said');
      await g.wait(0.6);
      await g.think('sad', 'I was gonna let homeroom find out from the attendance sheet. Just gone, and a chalkboard says why. {p} Like Danny.');
    }
    // The hum. Then the tune goes on without him.
    await g.wait(1.4);
    await g.narrate('Marcus hums under his breath. The old school song, the one his grandma sings. I don\'t think he knows he\'s doing it.');
    await g.wait(1.6);
    await g.narrate('He stops. {p=0.8} The tune doesn\'t.');
    if (hasTrack('clarinet')) g.music('clarinet', 3);
    g.sfx('glass_tone', { vol: 0.15, pan: 0.8, rate: 0.5 });   // (a far, reedy note until a clarinet track exists)
    await g.wait(1.6);
    await g.narrate('From the east, far off, a clarinet picks it up right where he left off.');
    g.face('marcus', 'right');
    await g.say('marcus', 'scared', "That's not me.");
    // Far down the east hall, heavy doors swinging open on their own.
    g.sfx('door_creak_slow', { vol: 0.5, pan: 0.85, rate: 0.8 });
    await g.wait(1.2);
    g.set('gym_open');
    g.set('ch6_breather_done');
    g.refresh();
    // Up. He goes first.
    unsitMarcus(m);
    if (HW.player.seated) await HW.hiding.stand();
    g.objective('The gym. East hall.');
    await g.cam(null, { time: 0.8 });
    g.walk('marcus', [25, 15]).then(() => { if (g.alive && g.npc('marcus')) g.face('marcus', 'left'); });
    await g.wait(0.4);
  },

  // ------------------------------------------------------------------------------------------ the follow
  /** Non-blocking (east1, while LEAD): Marcus walks ahead and waits for her at the gym doors. */
  'ch6.lead': async (g) => {
    if (!LEAD(g.state) || HW.map?.id !== 'east1') return;
    const p = HW.player;
    const nearDoors = p && p.x > 40 * TILE;
    const start = nearDoors ? GYM_DOOR_WAIT : [6, 16];
    let m = g.npc('marcus');
    hold(g, 'marcus');
    if (!m) m = g.spawn({ id: 'marcus', sprite: 'marcus', at: start, dir: 'right' });
    else g.setPos('marcus', start);
    g.music(hasTrack('clarinet') ? 'clarinet' : null, 2);    // (no drone while he leads: the tune, or nothing)
    for (const leg of [[16, 16], [27, 16], [38, 16], [48, 16], GYM_DOOR_WAIT]) {
      if (!g.alive || HW.map?.id !== 'east1' || !g.npc('marcus')) return;
      if (m.x >= leg[0] * TILE - 2) continue;
      await g.walk('marcus', leg);
      // He waits when she falls behind.
      while (g.alive && HW.map?.id === 'east1' && dist(HW.player, m) > 7 * TILE) {
        g.face('marcus', 'tess');
        await g.wait(0.3);
      }
    }
    // Waiting at the gym doors; the trigger there (ch6.gym_doors) takes it from here.
    if (g.alive && HW.map?.id === 'east1' && g.npc('marcus') === m) g.face('marcus', 'left');
  },

  /** east1 trigger at the gym doors (while Marcus leads): checkpoint (DESIGN §9.3). He goes in first. */
  'ch6.gym_doors': async (g) => {
    if (!LEAD(g.state)) return;
    g.checkpoint('gym doors');
    const m = ensureMarcus(g, GYM_DOOR_WAIT);
    // She outran him: he jogs up.
    if (dist(m, HW.player) > 4 * TILE) await g.walk('marcus', [56, 16], { run: true });
    if (!g.seen('ch6_gym_doors')) {
      look(g, 'right');
      g.face('marcus', 'right');
      await g.wait(0.9);
      await g.say('marcus', 'sad', 'She played clarinet.');
      await g.wait(0.5);
    }
    await g.walk('marcus', [58, 15]);
    if (m && g.npc('marcus')) g.despawn('marcus');
  },

  /** Non-blocking (gym, while LEAD): he stopped dead two steps inside, looking up at the bleachers. */
  'ch6.gym_arrive': async (g) => {
    if (!LEAD(g.state) || HW.map?.id !== 'gym') return;
    hold(g, 'marcus');
    if (!g.npc('marcus')) g.spawn({ id: 'marcus', sprite: 'marcus', at: [7, 20], dir: 'up' });
    else g.setPos('marcus', [7, 20]);
    g.face('marcus', 'up');
    g.music(hasTrack('clarinet') ? 'clarinet' : null, 1.5);
  },

  // ------------------------------------------------------------------------------------------ the gym
  'ch6.gym': async (g) => {
    if (g.flag('ch6_gym_lights') || g.flag('ch6_marcus_taken')) return;
    const replay = g.seen('ch6_gym');
    const m = ensureMarcus(g, [7, 20]);
    g.music(hasTrack('clarinet') ? 'clarinet' : null, 1);
    // Denise on the bleachers, faintly glowing, playing.
    const d = g.npc('denise') || g.spawn({ id: 'denise', sprite: 'denise', at: 'denise', dir: 'down', light: { ...DENISE_LIGHT } });
    if (d && !d.seat && HW.hiding) await HW.hiding.seatNpc(d, g.prop('gym_bleachers_denise'), { walk: false });
    g.anim('denise', 'sit_play');
    if (!replay) {
      // Her beam goes out across the dark court first: under the far hoop, a heap.
      look(g, 'colonel_hoop');
      await g.cam([31, 16], { time: 2.6 });
      await g.wait(0.8);
      await g.think('worried', 'Gym mats. {p} ...Just gym mats.');
      await g.wait(0.4);
      // The clarinet. Up on the bleachers.
      look(g, 'up');
      await g.cam('denise', { time: 2.2 });
      await g.wait(1.6);
      await g.narrate('On the bleachers, a girl in a green-and-gold band uniform and a tall plumed hat. Playing.');
      await g.wait(0.4);
    }
    // Wide enough for the three of them.
    g.cam([14, 12], { time: replay ? 1.0 : 1.4 });
    // Marcus walks to her.
    const toHer = g.walk('marcus', 'beside_denise');
    const tessTo = g.walk('tess', 'tess_mark');
    if (!replay) {
      await g.wait(0.7);
      const c = await g.choice(['Marcus, wait—', 'Grab his arm.']);
      if (c === 1) {
        m.stopPath(false);
        await g.walk('tess', { x: m.x - 12, y: m.y + 4 }, { run: true });
        look(g, 'marcus');
        g.face('marcus', 'tess');
        await g.narrate('I grab his arm. He looks down at my hand like he doesn\'t know whose it is.');
        await g.say('marcus', 'soft_smile', "It's okay, Tess.");
        await g.narrate('He takes my hand off his sleeve. Gently. Like he\'s putting something back on a shelf.');
        await g.walk('marcus', 'beside_denise');
      } else {
        await g.wait(0.4);
        g.set('ch6_marcus_wait');
      }
    }
    await toHer;
    await tessTo;
    await g.walk('tess', 'tess_mark');
    look(g, 'denise');
    g.face('marcus', 'left');
    // The tune stops. She lowers the clarinet and looks at him.
    g.music(null, 0.8);
    g.anim('denise', null);
    g.face('denise', 'marcus');
    await g.wait(1.0);
    const DL = { light: 'normal' };
    if (!replay) {
      await g.say('denise', 'lure', 'Marcus Webb.', DL);
      await g.wait(0.5);
      await g.say('denise', 'lure', 'Look at you. {p} You got my eyes. Mama always said.', DL);
      await g.say('marcus', 'grief', '...She still says it.');
      await g.say('denise', 'lure', 'Is she still setting my plate?', DL);
      await g.say('marcus', 'sad', 'Every Thanksgiving.');
    }
    await g.say('denise', 'lure', "Then sit with me. {p} Just till the song's done.", DL);
    if (HW.hiding) await HW.hiding.seatNpc(m, g.prop('gym_bleachers_marcus'), { walk: true });
    g.anim('denise', 'sit_play');
    if (hasTrack('clarinet')) g.music('clarinet', 0.6);
    await g.wait(1.4);
    if (!replay) await g.think('scared', 'Marcus Webb. {p=0.6} The whole name.');
    await g.wait(0.4);

    // FOUR LIGHT BANKS bang on near → far, 0.45 s apart; the last lights the hoop. Him. There the whole time.
    const pan = g.cam([31, 15], { time: 1.35 });
    bank(g, 1, 0.6);
    await g.wait(0.45);
    bank(g, 2, 0.7);
    await g.wait(0.45);
    bank(g, 3, 0.8);
    await g.wait(0.45);
    g.set('ch6_gym_lights');            // the light no longer dies around him (exposure #12)
    g.refresh();                        // the 'gym mats' are gone
    const C = g.colonel;
    // seated on the floor under the hoop, facing them — he was there the whole time
    await C.spawn('colonel_hoop', { mode: 'scripted', anim: 'sitfloor', dir: 'left' });
    C.face('left');
    bank(g, 4, 1);
    g.sfx(g.replaying ? 'stinger_soft' : 'stinger_hard', g.replaying ? { vol: 0.5 } : undefined);   // stinger #3 (DESIGN §14)
    g.music(null, 0.05);
    g.anim('denise', 'wrong', { once: true, hold: true });
    g.silence(true, 0.05);              // the roof rain cuts out for 2 s
    g.shake(1.2, 0.3);
    await pan;
    await g.wait(2.0);
    g.silence(false, 0.4);
    // He rises — slowly — bigger than she has ever seen him.
    const hoop = HW.map?.anchor('colonel_hoop');
    if (hoop) g.sfx('colonel_breath', { x: hoop.x, y: hoop.y - 24, vol: 1 });
    await g.wait(0.6);
    const rise = C.anim('rise_seated', { once: true, hold: true });   // ~2 s, slowly
    g.shake(0.8, 2.0);
    if (hoop) g.sfx('coal_slide', { x: hoop.x, y: hoop.y, vol: 0.7, rate: 0.6 });
    await rise;
    C.anim(null);
    C.face('tess');
    await g.wait(0.5);
    // Marcus stands up (the ones who stand up): off the bench, onto the boards.
    if (m.seat) HW.hiding?.unseatNpc?.(m);
    g.setPos('marcus', 'beside_denise');
    g.face('marcus', 'tess');
    await g.cam([31, 14], { time: 0.35 });   // hold the wide shot: Marcus, Tess and his lunge all above the box
    HW.scripts.run('ch6.chase', {}, { blocking: false });
    await g.say('marcus', 'urgent', 'TESS. RUN.', { shake: 2, hold: true });
    if (!replay) await g.think('terrified', "The girls' locker room. {p=0.3} The left door—");
    g.objective("The girls' locker room. Hide.");
    await g.cam(null, { time: 0.4 });
  },

  /** Non-blocking: the gym chase. Resolves 'hidden' when she climbs into gym_locker_tess. */
  'ch6.chase': async (g) => {
    if (!HW.chase) return;
    g.music('chase', 0.3);
    // Out of her sight (the locker room), the bleachers empty.
    g.parallel(async (pg) => {
      await HW.game.until(() => !pg.alive || roomOf(HW.player) === 'gym_girls_lr' || HW.player?.hidden, 600);
      if (pg.alive && HW.map?.id === 'gym') takeMarcus(pg);
    });
    const r = await HW.chase.gym();
    HW.debug?.record?.('chase', null, null, `ch6:${r}`);
    if (r === 'lost' && g.alive && HW.map?.id === 'gym' && !g.flag('roll2_done') && !HW.player?.hidden) {
      // He lost her: he comes looking, slowly, through the locker room. Standing in his sight is enough.
      const C = g.colonel;
      C.setMode('scripted', { vision: true });
      await C.walkTo('locker_room', { speed: 30 });
      if (g.alive && C.mode === 'scripted') await C.walkTo('locker_row', { speed: 26 });
    }
  },

  // ------------------------------------------------------------------------------------------ the locker
  'ch6.locker': async (g, ctx) => {
    const prop = ctx?.prop || g.prop('gym_locker_tess');
    if (!prop) return;
    if (!g.flag('ch6_gym_lights')) {
      await g.examine(prop.inst?.examine || '[n] The last locker in the row hangs open.');
      return;
    }
    if (g.flag('roll2_done')) {
      await g.think('scared', "I'm not getting back in there.");
      return;
    }
    const resume = !!ctx?.resume;
    if (HW.player && !HW.player.hidden && HW.hiding) {
      if (resume) g.setPos('tess', 'locker_tess');
      await HW.hiding.enterLocker(prop);
    }
    if (HW.chase?.active) HW.chase.stop('hidden');
    takeMarcus(g);
    g.music(null, 0.4);
    const replay = g.seen('ch6_locker');
    g.checkpoint('locker');             // reload opens on the slit view, tapping (phase 0.4)
    const C = g.colonel;
    if (!C.entity) await C.spawn('locker_room', { mode: 'scripted', anim: null, dir: 'down' });
    else C.setMode('scripted');
    const lockerAt = { x: 16 * TILE + 8, y: 32 * TILE + 12 };
    const params = { phase: 0, faceIn: 0 };
    const set = (o) => { Object.assign(params, o); g.overlay('locker', { ...params }); };
    set({});
    const taps = { on: false, gap: 0.9 };
    g.parallel(async (pg) => {
      while (pg.alive && !taps.done) {
        await pg.wait(taps.gap);
        if (!taps.on || taps.done) continue;
        const e = C.entity;
        pg.sfx('locker_tap', e ? { x: e.x + 18, y: e.y - 18, vol: 0.9 } : { vol: 0.6 });
      }
    });
    let beat = null;
    try {
      // Through the slits: navy wool going past, a brass button sunk in a fold, the sash.
      if (resume) {
        await tween(0.8, (k) => set({ phase: 0.4 * k }));
      } else {
        await g.wait(1.8);
        const walk = auto() ? null : C.walkTo('locker_row', { speed: 26 });
        await tween(6.0, (k) => set({ phase: 0.5 * k }));
        if (walk) await walk;
      }
      if (auto() && C.entity) { C.entity.x = 9 * TILE + 8; C.entity.y = 32 * TILE + 12; }
      // The ringed hand, tapping the lockers one by one. Closer.
      taps.on = true;
      const along = auto() ? null : C.walkTo([15, 32], { speed: 17 });
      await tween(resume ? 4.5 : 6.5, (k) => set({ phase: (resume ? 0.4 : 0.5) + (resume ? 0.5 : 0.4) * k }));
      if (along) await along;
      if (auto() && C.entity) { C.entity.x = 15 * TILE + 8; C.entity.y = 32 * TILE + 12; }
      taps.on = false;
      // Her locker.
      await g.wait(0.7);
      g.sfx('locker_tap', { ...lockerAt, vol: 1.2 });
      g.shake(0.5, 0.12);
      await g.wait(1.3);
      // His small face slides into the slit. Heartbeat only now (DESIGN §14).
      beat = g.loop('heartbeat', { bpm: 88, vol: 0.6 });
      C.face('up');
      await tween(1.8, (k) => set({ faceIn: k }));
      await g.wait(replay ? 0.8 : 2.2);
      // The mouth opens too far, vertically (stinger #4): below the eye the lips part and keep going.
      g.sfx('stinger_hard');
      g.shake(1.6, 0.4);
      g.fx('chroma', 0.4, 0.8);
      const opening = tween(2.2, (k) => set({ mouth: k < 0.25 ? k * 0.9 : 0.225 + (k - 0.25) * 1.03 }));
      if (!replay) await g.narrate('{shake}Below the eye, the mouth opens. {p} It keeps opening. Down past where a mouth stops.{/shake}');
      // Roll call #2.
      await colonelVoice(g, 'Theresa?', { speed: 0.6, present: true });
      let fails = 0;
      for (;;) {
        const c = await g.choice(['Here.', 'Hold your breath.']);
        if (c === 0) {
          g.set('roll2_answered');
          g.set('roll2_done');
          await g.wait(0.9);
          await colonelVoice(g, 'Thank you, Theresa.', { speed: 0.7, present: true });
          break;
        }
        const assist = g.state.assist || 1;
        const r = await g.screen('breath', { seconds: 6 / assist });
        if (r === 'held') {
          g.set('roll2_done');
          // A long wait. The eye stays in the slit. Then it slides away.
          await g.wait(2.6);
          break;
        }
        fails++;
        if (fails >= 2) {
          // Caught: 'Disrupting attendance' (DESIGN §9.4).
          g.overlay('black', { alpha: 1 });
          try { beat.stop(0.1); } catch { /* audio stub */ }
          await g.run('sys.caught', { reason: 'breath' });
          // Only reached in god mode (tests): carry on as if he moved on.
          g.overlay('black', null);
          g.set('roll2_done');
          break;
        }
        // A gasp. He taps again — on this door — and asks again.
        await g.wait(0.8);
        g.sfx('locker_tap', { ...lockerAt, vol: 1.3 });
        g.shake(0.7, 0.15);
        await g.wait(0.6);
        g.sfx('locker_tap', { ...lockerAt, vol: 1.3 });
        await g.wait(1.0);
        await colonelVoice(g, 'Theresa?', { speed: 0.55, present: true });
      }
      // The face withdraws. He moves on.
      await opening;
      await tween(1.4, (k) => set({ faceIn: 1 - k, mouth: Math.max(0, 1 - k * 1.8) }));
      try { beat?.stop(1.2); } catch { /* audio stub */ }
      beat = null;
      const away = auto() ? null : C.walkTo('locker_room', { speed: 26 });
      await tween(4.0, (k) => set({ phase: 0.9 + 0.1 * k }));
      if (away) await away;
      await C.despawn({ sink: true });
      g.checkpoint('roll 2');
    } finally {
      taps.done = true;
      try { beat?.stop(0.3); } catch { /* audio stub */ }
    }
    await g.run('ch6.after_locker');
  },

  /** Out of the locker. Marcus is gone; his photo of Denise on the boards. */
  'ch6.after_locker': async (g, ctx) => {
    if (g.flag('ch6_marcus_taken') && g.has('denise_photo')) return;
    const replay = g.seen('ch6_after_locker');
    if (g.colonel?.entity) await g.colonel.despawn({ sink: false });
    takeMarcus(g);
    await g.wait(ctx?.resume ? 0.4 : 1.6);
    if (HW.player?.hidden && HW.hiding) await HW.hiding.exitLocker();
    g.overlay('locker', null);
    g.set('ch6_marcus_taken');          // MARCUS WEBB — PRESENT on 102's board; his photo on the gym floor
    g.refresh();
    g.music(null, 0.5);
    // Back out onto the court. The lights are all still on.
    await g.walk('tess', 'lr_door');
    await g.walk('tess', [17, 12]);
    look(g, 'up');
    await g.cam([19, 8], { time: 1.4 });
    await g.wait(1.2);
    if (!replay) {
      await g.say('tess', 'scared', 'Marcus?', { speed: 0.9 });
      g.sfx('husk_rustle', { x: 19.5 * TILE, y: 6 * TILE, vol: 0.25 });
      await g.wait(2.0);
    }
    // She kneels and takes it.
    await g.walk('tess', [19, 8]);
    look(g, 'down');
    await g.anim('tess', 'pickup_down', { once: true });
    g.give('denise_photo');
    g.refresh();
    if (!replay) {
      await g.wait(0.6);
      await g.think('sad', 'He never puts this down. {p} He wouldn\'t leave it.');
      // A glass note, from the showers.
      await g.wait(1.0);
      g.sfx('glass_tone', { x: 4.5 * TILE, y: 28 * TILE, vol: 0.7 });
      await g.wait(0.9);
      await g.think('worried', 'That sound. {p} Like the mirror upstairs.');
    }
    await g.cam(null, { time: 0.8 });
    g.objective('The showers.');
  },

  // ------------------------------------------------------------------------------------------ the showers
  'ch6.showers': async (g) => {
    if (g.flag('ch6_showers')) return;
    const replay = g.seen('ch6_showers');
    g.set('ch6_showers');
    await g.walk('tess', 'shower_mirrors');
    look(g, 'up');
    await g.wait(0.5);
    // Every mirror holds her: Miss Adair, pointing down.
    g.sfx('glass_tone', { x: 4.5 * TILE, y: 27 * TILE, vol: 0.8 });
    const ghosts = [3, 4, 5, 6].map((x, i) => glassGhost(g, `adair_shower_${i}`, x, 27, 'point_down'));
    await g.wait(1.6);
    if (!replay) {
      await g.narrate('In every mirror, behind me: Miss Adair. Four of her. Pointing at the floor.');
    }
    const r = g.state.rollAnswered || 0;
    const at = { x: 4.5 * TILE, y: 27 * TILE };
    g.setProp('gym_mirror_2', 'fogged');
    await fog(g, r <= 0 ? 'NOT GONE. KEPT.' : r === 1 ? 'NOT GONE. KEPT. NOT AGAIN.' : "YOU'RE IN INK.", at);
    if (!g.has('charter')) {
      g.setProp('gym_mirror_4', 'fogged');
      await fog(g, 'THE CHARTER. LIBRARY.', { x: 6.5 * TILE, y: 27 * TILE });
    }
    await g.wait(0.8);
    await g.say('tess', 'scared', "The lights didn't go out. {p} They always go out around him.");
    await g.wait(0.6);
    g.sfx('glass_tone', { ...at, vol: 0.5, rate: 0.9 });
    await g.wait(1.0);
    await Promise.all(ghosts.map((gh) => gh.despawn(1.0)));
    g.setProp('gym_mirror_2', 'grimy');
    if (g.prop('gym_mirror_4')?.state === 'fogged') g.setProp('gym_mirror_4', 'cracked');
    await g.run('ch6.alone');
  },

  // ------------------------------------------------------------------------------------------ alone
  'ch6.alone': async (g) => {
    const replay = g.seen('ch6_alone');
    g.music(null, 1.5);               // no drone (DESIGN §14): rain, a clock, then the phonograph
    if (!replay) {
      const tick = g.loop('clock_tick', { x: 17 * TILE + 8, y: 27 * TILE, vol: 0.6 });
      try {
        look(g, 'down');
        await g.wait(3.2);
        await g.think('exhausted', "Danny's flashlight. Leah's camera. {p} Marcus's picture.");
        await g.wait(2.0);
        // The intercom: a record, warped, the needle in the groove.
        g.sfx('intercom_crackle', { vol: 0.7 });
        await g.wait(1.2);
        g.music('phonograph', 3);
        await g.wait(3.5);
        await g.think('devastated', 'His grandma\'s song.');
        await g.wait(1.0);
        if (!g.flag('ch6_homeroom_said')) {
          g.set('ch6_homeroom_said');
          await g.think('devastated', 'I was gonna let homeroom find out from the attendance sheet. Just gone, and a chalkboard says why. {p} Like them.');
          await g.wait(0.8);
        }
        await g.think('exhausted', "The coal chute. Danny's bolt cutters. {p} I could just go home.");
      } finally {
        try { tick.stop(1.0); } catch { /* audio stub */ }
      }
    } else if (hasTrack('phonograph')) g.music('phonograph', 2);
    g.set('truant_available');
    g.objective('The auditorium.');
    g.checkpoint('alone');
  },

  /** Non-blocking (east1, walking back alone): Kevin at the far end of the hall. Never a word. */
  'ch6.kevin': async (g) => {
    if (g.flag('ch6_kevin') || !HW.patrol || HW.map?.id !== 'east1') return;
    g.set('ch6_kevin');
    const p = HW.player;
    const west = !p || p.x > 30 * TILE;
    const at = west ? 'kevin_west' : 'kevin_east';
    HW.patrol.spawn('kevin', { at, dir: west ? 'right' : 'left', whistle: true, glimpse: true });
    const k = g.npc('kevin');
    if (!k) return;
    await HW.game.until(() => !g.alive || HW.map?.id !== 'east1' || dist(HW.player, k) < 15 * TILE, 3600);
    if (g.alive && HW.map?.id === 'east1' && g.npc('kevin')) g.sfx('squeak', { x: k.x, y: k.y, vol: 0.6 });
  },

  // ------------------------------------------------------------------------------------------ the coal chute
  /** b_chute: the TRUANT loophole (DESIGN §9.2). Window: truant_available && !ch7_assembly, with the cutters. */
  'ch6.chute': async (g, ctx) => {
    const f = g.state.flags;
    const prop = ctx?.prop || g.prop('b_chute');
    look(g, 'up');
    const open = !!f.truant_available && !f.ch7_assembly;
    if (!open) {
      if (prop?.inst?.examine) await g.examine(prop.inst.examine);
      if (g.party.has('marcus') && g.npc('marcus')) {
        g.face('marcus', 'tess');
        await g.say('marcus', 'determined', "I'm not leaving.");
      } else if (f.ch6_marcus_taken || f.ch7_assembly) {
        await g.think('determined', 'Not without them.');
      }
      return;
    }
    if (!f.chute_cut && !g.has('bolt_cutters')) {
      if (prop?.inst?.examine) await g.examine(prop.inst.examine);
      await g.think('worried', "Danny's uncle's bolt cutters would go through that.");
      return;
    }
    const replay = g.seen('ch6_chute');
    if (!f.chute_cut) {
      if (!replay) await g.narrate('The coal chute. A grate, a padlock, and above it the dark of the chute, going up.');
      const at = prop ? { x: (prop.x + 1) * TILE, y: (prop.y + 1) * TILE } : { x: HW.player.x, y: HW.player.y };
      g.sfx('bolt_cutters', { ...at, vol: 1 });
      HW.noise?.emit?.(at.x, at.y, null, 'bolt_cutters');
      g.shake(1, 0.2);
      g.set('chute_cut');
      if (prop) g.setProp(prop.id, 'cut');
      await g.wait(1.0);
      g.sfx('wind_gust', { ...at, vol: 0.5 });
      await g.narrate('The grate swings down. Cold air pours out of the chute. Outside air. It smells like rain.');
    }
    await g.think('exhausted', 'Coal goes in this way. {p} Nobody ever made a rule about coal going out.');
    const c = await g.choice(['Climb out.', 'Not without them.']);
    if (c !== 0) return;
    g.set('truant');
    if (prop) g.setProp(prop.id, 'open');
    g.music(null, 1);
    await g.fade('out', 1.6);
    await g.ending('truant');
  },
};

// ---------------------------------------------------------------------------------------------
/** Second try at the portrait without the 1979 view: Adair in the diploma glass, pointing at the bag. */
async function safeHint(g) {
  g.set('ch6_safe_hint');
  await g.wait(0.6);
  g.sfx('glass_tone', { x: 58.5 * TILE, y: 20.5 * TILE, vol: 0.6 });
  const ghost = glassGhost(g, 'adair_hint', 58, 20, 'point_left', 0.6);
  await g.wait(1.4);
  look(g, 'right');
  await g.wait(0.6);
  await g.think('worried', 'The compact. {p} In 1979 this room looked different.');
  await ghost.despawn(0.6);
  look(g, 'up');
}

/** Marcus on the bench's left cell (Tess takes the other; one sitter per prop, so his is by hand). */
function sitMarcusOnBench(m) {
  if (!m) return;
  m.stopPath?.(false);
  m.x = 14 * TILE + 8;
  m.y = 10 * TILE + 12;
  m.sitDir = 'down';
  m.dir = 'down';
  m.sortBias = 4.25;
}

function unsitMarcus(m) {
  if (!m) return;
  m.sitDir = null;
  m.sortBias = 0;
  m.y = 11 * TILE + 12;
}
