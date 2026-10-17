// PROLOGUE — Kettle Run (narrative-1). DESIGN §6 Prologue · CONTENT §2.1, §3 · TECH §6.
//
//   pro.start   new game: black card → the car (CG car_interior) → engine off, 2 s of nothing, rain →
//               the front lot, party of four. Objective "Get inside."
//   pro.car     Leah's wagon (keys in the visor)          pro.oak     the dead oak (Brood II)
//   pro.sign    the school sign with letters missing        pro.danger  DANGER — UNDERGROUND MINE FIRE
//   pro.motto   NEMO RELINQUATUR                            pro.doors   Danny's bolt cutters → in → ch1.start
//
// The exterior's ordinary examinables are the map's (maps-A); these are the scripted ones. Every pro.*
// script also works outside the Prologue (the endings come back out here at dawn): with nobody in the
// party they fall back to a line or two of Tess.
//
// Shared helpers for narrative-1's files are exported from here (ch1.js / items.js import them).
import HW from '../../engine/hw.js';
import { DIR_ANGLE } from '../../engine/entities.js';

const TILE = 16;
const PRO = (s) => (s.chapter || 0) === 0;

/** Danny's cheap red flashlight while he's with us: a weak warm cone carried by his sprite (CONTENT §7). */
export const DANNY_LIGHT = Object.freeze({ type: 'flashlight', power: 0.35, cone: 30, color: '#ffc9a8' });

/** Is a friend here, in the party, with a body on the map? */
export const here = (g, id) => g.party.has(id) && !!g.npc(id);

/** Turn Tess and point her beam (the beam's aim holds during cutscenes, so set it outright). */
export function aim(g, dir) {
  g.face('tess', dir);
  if (HW.flashlight && DIR_ANGLE[dir] !== undefined) HW.flashlight.angle = DIR_ANGLE[dir];
}

/** Sweep Tess's beam to an angle (radians) over `sec` of game time. */
export function sweep(to, sec) {
  const fl = HW.flashlight;
  if (!fl || !HW.game?.tween) return Promise.resolve();
  const from = fl.angle;
  let d = to - from;
  while (d > Math.PI) d -= Math.PI * 2;
  while (d < -Math.PI) d += Math.PI * 2;
  if (HW.debug?.autoAdvance) { fl.angle = to; return Promise.resolve(); }
  return HW.game.tween(sec, (k) => { fl.angle = from + d * (k * k * (3 - 2 * k)); });
}

/** Take a friend out of the caterpillar so a scene can place them (they stay where they stand). */
export function hold(g, ...ids) {
  for (const id of ids) if (g.party.has(id)) g.party.remove(id);
}

/** Put friends back in the caterpillar, in the canonical order. */
export function release(g, ...ids) {
  const order = ['danny', 'leah', 'marcus'];
  const want = new Set([...(g.state.party || []), ...ids]);
  for (const id of order) if (want.has(id) && !g.party.has(id) && g.npc(id)) g.party.add(id);
  // keep party order canonical
  g.state.party = order.filter((id) => g.state.party.includes(id));
  HW.entities?.syncParty?.();
}

/** Tile of an entity. */
export const tileOf = (e) => [Math.floor(e.x / TILE), Math.floor(e.y / TILE)];

// ---------------------------------------------------------------------------------------------
// Exterior weather. The exterior map carries `weather: { rain, steam }` for "systems/scripts" to apply
// while it is loaded; no system does yet, so this tiny one does: rain on/off with the map, and steam
// wisping out of the `steam_vent` props near the camera. (Systems may adopt it — see report.)
let weatherInstalled = false;
export function installWeather() {
  if (weatherInstalled) return true;
  if (!HW.game?.addSystem || !HW.fx) return false;
  weatherInstalled = true;
  let t = 0;
  HW.game.addSystem({
    onMapLoad(map) {
      const w = map?.data?.weather;
      try { HW.fx?.rain?.(!!(w && w.rain), (w && w.rain) || 1); } catch (e) { console.error('[pro] rain', e); }
    },
    update(dt) {
      const map = HW.map;
      if (!map?.data?.weather?.steam) return;
      t -= dt;
      if (t > 0) return;
      t = 0.3 + Math.random() * 0.45;
      const cam = HW.camera?.view;
      const vents = map.props.filter((p) => p.type === 'steam_vent'
        && (!cam || (p.x * TILE > cam.x - 32 && p.x * TILE < cam.x + (cam.w || 480) + 32 && p.y * TILE > cam.y - 32 && p.y * TILE < cam.y + (cam.h || 270) + 48)));
      if (!vents.length) return;
      const v = vents[Math.floor(Math.random() * vents.length)];
      try { HW.fx.emit('steam', v.x * TILE + 8, v.y * TILE + 10, 1 + Math.floor(Math.random() * 2)); } catch (e) { /* fx not ready */ }
    },
  });
  return true;
}
// Boot is async: install as soon as the game exists (scripts are data and load before it).
if (typeof window !== 'undefined') {
  const poll = setInterval(() => { if (installWeather()) clearInterval(poll); }, 200);
}

// ---------------------------------------------------------------------------------------------
export default {
  /**
   * New game. DESIGN §6 Prologue 1–2 (verbatim lines where the bible gives them).
   * Black → "Kettle Run, Pennsylvania. / October 18, 1996." → the car → engine off → 2 s → rain → the lot.
   */
  'pro.start': async (g) => {
    installWeather();
    g.seen('pro_start');
    g.state.chapter = 0;
    if (typeof HW.game?.chapterSetup === 'function') await HW.game.chapterSetup(0); // party of four, "Get inside."

    // 1. Black. Rain on a car roof, an idling engine, the wipers.
    g.ambience('car_interior', 2.5);
    await g.wait(1.6);
    await g.card('Kettle Run, Pennsylvania.', 'October 18, 1996.', { hold: 2.2 });
    await g.wait(0.6);

    // 2. The car.
    await g.cg('car_interior', { fade: 1.8 });
    await g.wait(1.2);
    await g.narrate("The radio's on low. Friday-night scores out of Pottsville, a mattress ad, the scores again.");
    await g.wait(0.4);
    g.sfx('flashlight_click', { vol: 0.8, rate: 0.7 }); // the knob
    await g.wait(0.7);
    await g.say('danny', 'grin', 'Mood lighting.');
    await g.wait(0.5);
    await g.say('danny', 'talk', "Okay. So. Founder's Day, 1979. Whole school's in the auditorium. Big assembly.");
    await g.say('danny', 'talk', 'Lights go out. Lights come back on. {p} Nine kids, gone.');
    await g.say('leah', 'deadpan', 'Carbon monoxide. From the mine fire. It was in the *Republican*.');
    await g.say('danny', 'smug', "And the guy the school's named after? Buried right under it. Medals, the whole uniform. And a solid gold sword.");
    await g.say('tess', 'skeptical', 'Says who?');
    await g.say('danny', 'grin', 'Uncle Frank.');

    // Leah's field report: the full names, on tape (R7 is planted here).
    await g.wait(0.4);
    g.sfx('camcorder_click');
    await g.wait(0.3);
    g.sfx('camcorder_whir', { vol: 0.5 });
    await g.say('leah', 'talk', 'This is Leah Brandt for STATIC. It is nine forty-seven P.M., Friday, October eighteenth, 1996. With me are Daniel Kovach—');
    await g.say('danny', 'smug', 'Danny.');
    await g.say('leah', 'deadpan', '—Daniel Kovach, Marcus Webb, and Theresa Dolan.');
    await g.say('tess', 'skeptical', 'Never call me Theresa on tape.');
    await g.say('leah', 'smirk', 'Noted. {p} For the tape.');

    // The joke that lands wrong. Marcus says nothing.
    await g.wait(0.5);
    await g.say('danny', 'grin', "Nine kids walk into an assembly. Zero walk out. It's like the worst math problem ever.");
    await g.say('leah', 'annoyed', 'Danny.');
    await g.wait(1.8); // wipers. Nobody laughs.
    await g.say('danny', 'nervous', "Tough room. {p} Gold sword, though. I find that, I'm gone. California.");
    await g.say('tess', 'smirk', "You've never been past Harrisburg.");
    await g.say('danny', 'serious', 'Yeah, well. {p=0.6} Kovaches don\'t leave Kettle Run. We just get buried in it.');
    await g.wait(1.2);

    // The tape. Leah's eyes find Tess in the mirror.
    g.sfx('paper_rustle', { vol: 0.5 });
    await g.narrate("Leah reaches back between the seats with a cassette. Her handwriting on the J-card: FOR THE DRIVE.");
    await g.say('leah', 'neutral', 'For the drive.');
    await g.say('tess', 'confused', "Pittsburgh's not till Thanksgiving.");
    await g.say('leah', 'neutral', '{p=0.6}So you\'ll have it.');
    await g.think('look_away', "The transfer form's in my bag, under the sketchbook. Mom signed it Tuesday. {p} Monday, Leah sees my name come off the attendance sheet. She's smart. She'll get it.");
    await g.wait(1.0);

    // Marcus, who has been looking at the school the whole time.
    await g.say('marcus', 'thoughtful', "There's a light on. Second floor.");
    await g.say('danny', 'nervous', "Reflection. Power's been off since the buyout.");
    await g.say('leah', 'worried', 'Reflection of what?');
    await g.wait(2.0); // nobody answers

    // Engine off → 2 s of nothing → the rain, louder (DESIGN §14 silence ledger).
    g.sfx('key_unlock', { vol: 0.35, rate: 0.75 });
    await g.ambience('silence', 0.1);
    await g.wait(2.0);
    await g.ambience('exterior_rain', 0.8);
    await g.wait(1.4);

    // 3. Out into it.
    await g.fade('out', 0.9);
    await g.cg(null, { fade: 0.05 });
    await g.transfer('exterior', 'start', { fade: false });
    g.light('danny', DANNY_LIGHT);
    g.refresh();
    aim(g, 'up');
    g.sfx('door_close_metal', { vol: 0.45, rate: 1.35, delay: 0.2 });
    g.sfx('door_close_metal', { vol: 0.4, rate: 1.45, delay: 0.75 });
    g.sfx('door_close_metal', { vol: 0.35, rate: 1.3, delay: 1.1 });
    await g.fade('in', 1.4);
    await g.wait(0.6);
    // The building, once: the only lit thing on it is the bulb over the doors.
    await g.cam([24, 6], { time: 2.6 });
    await g.wait(0.5);
    g.lightning();
    g.sfx('thunder', { vol: 0.8, delay: 1.3 });
    await g.wait(1.6);
    await g.cam(null, { time: 1.6 });
    g.objective('Get inside.');
    g.checkpoint('prologue');
  },

  /** Leah's wagon. */
  'pro.car': async (g) => {
    installWeather();
    if (PRO(g.state) && here(g, 'leah')) {
      await g.examine("[n] Leah's mom's '86 Taurus wagon, ticking as it cools. The headlights are still on.");
      await g.say('leah', 'neutral', 'Keys are in the visor. Nobody steals anything in Kettle Run.');
      if (here(g, 'danny')) await g.say('danny', 'grin', "There's nobody *in* Kettle Run.");
      return;
    }
    await g.examine([
      { cond: (s) => !!(s.flags.dawn || s.flags.register_done), text: "[n] Leah's mom's wagon, beaded with rain. The keys are in the visor." },
      { text: ["[n] Leah's mom's wagon. Keys in the visor.", '[worried] It would start. I know it would start.'] },
    ]);
  },

  /** The dead oak, covered in cicada shells. */
  'pro.oak': async (g) => {
    installWeather();
    if (PRO(g.state)) {
      g.face('tess', 'up');
      await g.examine('[n] The oak has been dead for years, but it\'s covered in cicada shells. Hundreds of them, split down the back, still holding on.');
      if (here(g, 'leah')) await g.say('leah', 'talk', 'Brood Two. They came up in May. Seventeen years underground.');
      if (here(g, 'danny')) await g.say('danny', 'grin', 'Seventeen years in the dirt for one summer. {p} That\'s the Kovach family plan.');
      return;
    }
    await g.examine('[n] The shells are still on the oak. Every one of them split down the back. Every one of them empty.');
  },

  /** HALLOWE L CONS LIDATED SCH OL — the sign has been losing letters for years. */
  'pro.sign': async (g) => {
    installWeather();
    await g.examine("[n] The sign by the road: HALLOWE L CONS LIDATED SCH OL. HOME OF THE COL IERS.");
    if (PRO(g.state) && here(g, 'danny')) {
      await g.say('danny', 'grin', 'Every kid in Schuylkill County has an O off that sign.');
      if (here(g, 'leah')) await g.say('leah', 'deadpan', 'You have two.');
      await g.say('danny', 'smug', "I'm a collector.");
    }
  },

  /** DANGER — UNDERGROUND MINE FIRE. */
  'pro.danger': async (g) => {
    installWeather();
    await g.examine('[n] DANGER — UNDERGROUND MINE FIRE. KEEP OFF. Under it, in marker: NO KIDDING.');
    if (!PRO(g.state)) {
      await g.examine('[neutral] Still burning. It doesn\'t care what happened in there.');
      return;
    }
    if (here(g, 'leah')) await g.say('leah', 'talk', 'Same as Centralia. Same year, even.');
    if (here(g, 'danny')) await g.say('danny', 'smug', 'Coincidence? {p} The truth is out there, Scully.');
    if (here(g, 'leah') && here(g, 'danny')) await g.say('leah', 'deadpan', "It's under there, Danny. That's the whole problem.");
  },

  /** NEMO RELINQUATUR — Leah translates (if nobody reads it first, she reads it at the doors). */
  'pro.motto': async (g) => {
    installWeather();
    g.face('tess', 'up');
    if (PRO(g.state)) g.set('pro_motto_read');
    await g.examine('[n] Cut into the stone beside the doors: NEMO RELINQUATUR.');
    if (!PRO(g.state)) {
      await g.examine('[neutral] Let no one be left behind.');
      return;
    }
    if (here(g, 'leah')) await g.say('leah', 'talk', "'Let no one be left behind.' {p} It's the school motto.");
    if (here(g, 'danny')) await g.say('danny', 'grin', "Aw. That's sweet. {p} Creepy, but sweet.");
    if (here(g, 'marcus')) await g.say('marcus', 'soft_smile', "Grandma's got that on a plate. In the good cabinet.");
  },

  /**
   * The front doors (trigger `approach_doors` on the top step, once). Danny's bolt cutters; Uncle
   * Frank's sword; the doors swing in and the air that comes out is warm. Checkpoint, then in →
   * the lobby → ch1.start (the chapter card).
   */
  'pro.doors': async (g) => {
    installWeather();
    if (g.flag('pro_doors_cut')) return;
    const replay = g.seen('pro_doors');
    const tess = g.player;
    const danny = here(g, 'danny') ? g.npc('danny') : null;
    const leah = here(g, 'leah');
    hold(g, 'danny', 'leah', 'marcus');
    aim(g, 'up');
    await g.cam([24, 7], { time: 0.8 });

    if (danny) {
      const spot = Math.floor(tess.x / TILE) <= 24 ? [25, 7] : [24, 7];
      await g.walk('danny', spot);
      g.face('danny', 'up');
      if (!replay) {
        await g.narrate('Danny swings his backpack off and comes up with a pair of bolt cutters as long as his arm.');
        await g.say('danny', 'grin', 'Uncle Frank\'s. He *basically* said I could borrow them.');
        if (leah) await g.say('leah', 'deadpan', 'Basically.');
      }
    }
    // the cut
    g.sfx('bolt_cutters', { x: 24.5 * TILE, y: 6 * TILE });
    g.shake(1.2, 0.18);
    await g.wait(0.35);
    g.sfx('chain_rattle', { x: 24.5 * TILE, y: 6.5 * TILE });
    g.sfx('padlock', { x: 24.5 * TILE, y: 7 * TILE, delay: 0.3 });
    g.setProp('ext_front_doors', 'closed');
    g.set('pro_doors_cut');
    await g.wait(0.6);

    if (danny && !replay) {
      g.face('danny', 'down');
      await g.say('danny', 'talk', 'Somewhere under there, Dolan. Gold sword. Rubies in the handle. Frank swears.');
      if (leah && !g.flag('pro_motto_read')) {
        // The stone beside the doors, right at Leah's eye level.
        g.set('pro_motto_read');
        await g.say('leah', 'talk', "Nemo relinquatur. {p} 'Let no one be left behind.'");
        await g.say('danny', 'grin', "Aw. That's sweet. {p} Creepy, but sweet.");
      } else {
        if (leah) await g.say('leah', 'deadpan', 'Frank also swears there\'s a mountain lion behind the Acme.');
        await g.say('danny', 'smug', 'That was a very big cat, Leah.');
      }
      g.face('danny', 'up');
    }

    // The doors swing in on their own weight.
    g.sfx('door_creak_slow', { x: 24.5 * TILE, y: 6 * TILE, rate: 0.85 });
    await g.wait(0.5);
    g.setProp('ext_front_doors', 'open');
    await g.wait(0.9);
    if (!replay) {
      await g.narrate('The doors swing in on their own weight. The air that comes out is warm.');
      await g.think('suspicious', "Warm. {p} Nobody's paid the heat in there since 1984.");
    }
    g.checkpoint('doors cut');

    // In: Danny first (of course), Leah filming, Marcus, Tess last.
    const goIn = async (id, delay) => {
      if (!g.npc(id)) return;
      await g.wait(delay);
      await g.walk(id, [[24, 6], [24, 3]]);
      const e = g.npc(id);
      if (e) e.visible = false;
    };
    const steps = [goIn('danny', 0), goIn('leah', 0.7), goIn('marcus', 1.3)];
    await g.wait(1.6);
    await g.cam(null, { time: 0.6 });
    await g.walk('tess', [[24, 7], [24, 5]]);
    await Promise.all(steps);
    for (const id of ['danny', 'leah', 'marcus']) { const e = g.npc(id); if (e) e.visible = true; }
    release(g, 'danny', 'leah', 'marcus');
    await g.fade('out', 0.7);
    await g.transfer('lobby', 'from_exterior', { fade: false });
    await g.run('ch1.start');
  },
};
