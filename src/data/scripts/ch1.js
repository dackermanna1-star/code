// CHAPTER I — After Hours (narrative-1). DESIGN §6 I · CONTENT §2.2, §2.3, §3, §4 · TECH §6.
// Maps: lobby (vestibule + the hall under the portrait), west1 (the west hall).
//
//   ch1.start            after pro.doors: chapter card, the vestibule; for one frame, Miss Adair stands
//                        behind Tess in the trophy-case glass
//   ch1.enter_lobby      trigger (once) crossing into the lobby: the portrait (exposure #1), Leah reads the
//                        plaque, the group shot ("Everybody say Hollow Hell"), Danny's backpack goes down.
//                        After the vanish the same trigger is re-armed once: Tess takes the bolt cutters.
//   ch1.portrait / memorial / plaque / trophy / east_jammed / backpack      lobby props
//   ch1.vestibule_refuse front doors before the vanish (Leah: "We've been here four minutes…")
//   ch1.room_enter       west1 rooms (one STATIC field report each; counts toward the vanish); 101 → the
//                        tiny chair (ch1_danny_stuck) + Uncle Frank #2
//   ch1.tiny_chair       the chair itself (if reached first)
//   ch1.danny_vanish     Danny breaks R3 — the vanish, staged in the dark (DESIGN §6 I.4, §14)
//   ch1.voice_102        "Guys? …Theresa? In here."  (INTERCOM styling, name "Danny?")
//   ch1.room102          desks in rows, DANIEL KOVACH — PRESENT
//   ch1.front_loop       front doors → (seamless) → out of the library doors at the far end of the west hall
//   ch1.end              intercom crackle → g.chapter(2) → ch2.start
import HW from '../../engine/hw.js';
import { DIR_ANGLE } from '../../engine/entities.js';
import { DANNY_LIGHT, here, aim, sweep, hold, release, tileOf, installWeather } from './pro.js';

const TILE = 16;
const auto = () => !!HW.debug?.autoAdvance;
const vanished = (g) => !!g.flag('ch1_danny_vanished');

/** Leah's camcorder is recording all chapter: a red LED rides with her. */
const LEAH_LED = Object.freeze({ type: 'led_red', radius: 0.7, intensity: 0.55 });
/** Danny jogging backward, the flashlight under his chin: a warm glow on his face instead of a cone. */
const DANNY_CHIN = Object.freeze({ type: 'bulb', radius: 1.5, intensity: 0.55, color: '#ffc29e', cage: false, glow: null });

/** Game-time tween that collapses under autoAdvance (tests). */
function tween(sec, fn) {
  if (auto() || !HW.game?.tween) { fn(1); return Promise.resolve(); }
  return HW.game.tween(sec, fn);
}

/** Leah narrates one line into the camcorder, filming in Tess's direction. */
async function leahReport(g, text, expr = 'talk') {
  if (!here(g, 'leah')) return;
  const dir = g.player.dir;
  g.anim('leah', `film_${dir}`);
  g.sfx('camcorder_whir', { vol: 0.3, x: g.npc('leah').x, y: g.npc('leah').y });
  await g.say('leah', expr, text);
  if (g.npc('leah')) g.anim('leah', null);
}

/** Danny drops his backpack by the lobby bench (base camp). */
function dropBag(g) {
  if (g.flag('danny_bag_dropped')) return;
  g.set('danny_bag_dropped');
  g.refresh();
}

// ---------------------------------------------------------------------------------------------
// The lobby, first time in (exposure #1 · the plaque · the group shot · base camp).
async function lobbyScene(g) {
  const lights = [];
  try {
    await lobbySceneInner(g, lights);
  } finally {
    for (const L of lights) HW.lighting?.removeLight?.(L);
  }
}
async function lobbySceneInner(g, lights) {
  const was = { danny: here(g, 'danny'), leah: here(g, 'leah'), marcus: here(g, 'marcus') };
  hold(g, 'danny', 'leah', 'marcus');
  // Up the inlay toward the painting, into the pool of skylight.
  const walks = [g.walk('tess', [15, 9])];
  if (was.danny) walks.push(g.walk('danny', [13, 9]));
  if (was.leah) walks.push(g.walk('leah', [17, 10]));
  if (was.marcus) walks.push(g.walk('marcus', [15, 11]));
  const pan = g.cam([15, 6], { time: 2.8 });
  await Promise.all(walks);
  aim(g, 'up');
  for (const id of ['danny', 'leah', 'marcus']) if (was[id]) g.face(id, 'up');
  // Their beams find the painting: a soft pool on the canvas while they look (exposure #1).
  const pool = HW.lighting?.addLight?.({ type: 'bulb', px: 15.5 * TILE, py: 3.6 * TILE, radius: 2.6, intensity: 0, color: '#e8dcc0', cage: false, glow: null, shadows: false, map: 'lobby' });
  if (pool) { pool._n1keep = true; lights.push(pool); tween(1.4, (k) => { pool.intensity = 0.55 * k; }); }
  await pan;
  await g.wait(1.4);

  // Marcus drifts off to the memorial board while the others look at the painting.
  const drift = was.marcus ? g.walk('marcus', 'memorial').then(() => g.npc('marcus') && g.face('marcus', 'up')) : null;
  if (was.danny) {
    await g.say('danny', 'laugh', 'Dolan. Dolan. Look at this guy. {p} He ate the Civil War.');
  }
  await g.say('tess', 'smirk', 'He looks like he ate the *ammunition*.');
  if (was.leah) {
    await g.say('leah', 'talk', "Technically the mine was Pleasants's idea. Hallowell just got the statue.");
    await g.walk('leah', 'plaque');
    g.face('leah', 'up');
    await g.wait(0.4);
    await g.say('leah', 'talk', "'Founder's Day, October nineteenth, first kept in 1894, in memory of the boys of the Hallowell Breaker.'");
    await g.wait(0.5);
    await g.say('leah', 'deadpan', 'He made the day they died a holiday. {p} Cool. Normal.');
    readPlaque(g);
  }
  if (drift) await drift;

  // The group shot (VHS frame 0): the camcorder on the bench, the four of them under the painting.
  if (was.leah) {
    await g.walk('leah', [15, 11]);
    g.face('leah', 'up');
    g.sfx('camcorder_click', { x: 15.5 * TILE, y: 10.5 * TILE });
    await g.wait(0.3);
    await g.say('leah', 'talk', 'Group shot. For the record. {p} Marcus. You too.');
    const lineUp = [g.walk('tess', [14, 6])];
    if (was.danny) lineUp.push(g.walk('danny', [13, 6]));
    if (was.marcus) lineUp.push(g.walk('marcus', [16, 6]));
    lineUp.push(g.walk('leah', [15, 6], { run: true }));
    const frame = g.cam([15, 6], { time: 1.6 });
    await Promise.all(lineUp);
    for (const id of ['tess', 'danny', 'leah', 'marcus']) if (id === 'tess' || was[id]) g.face(id, 'down');
    aim(g, 'down');
    await frame;
    await g.wait(0.6);
    await g.say('leah', 'smile', 'Everybody say Hollow Hell.');
    if (was.danny) await g.say('danny', 'laugh', 'HOLLOW HELL!');
    await g.narrate("Danny gives Tess bunny ears. He thinks she doesn't know.");
    g.set('ch1_group_shot');
    await g.wait(0.9);
    // Leah fetches the camera; it never stops recording.
    await g.walk('leah', [15, 11]);
    g.face('leah', 'up');
    g.sfx('camcorder_click', { x: 15.5 * TILE, y: 10.5 * TILE, vol: 0.6 });
    await g.wait(0.3);
    g.light('leah', LEAH_LED);
  }

  // Base camp.
  if (was.danny) {
    await g.walk('danny', [16, 11]);
    g.face('danny', 'up');
    g.sfx('desk_creak', { x: 16.5 * TILE, y: 10.5 * TILE, vol: 0.6, rate: 0.7 });
    dropBag(g);
    await g.say('danny', 'grin', 'Base camp.');
  } else dropBag(g);

  if (pool) tween(1.0, (k) => { pool.intensity = 0.55 * (1 - k); }).then(() => HW.lighting?.removeLight?.(pool));
  await g.cam(null, { time: 1.0 });
  release(g, ...['danny', 'leah', 'marcus'].filter((id) => was[id]));
}

/** Leah read the plaque aloud: it goes in the Notes (DESIGN §6 VI.1 needs "first kept 1894"). */
function readPlaque(g) {
  if (g.flag('ch1_plaque_read')) return;
  g.set('ch1_plaque_read');
  g.state.docs.plaque = true;
  HW.game?.emit?.('doc', 'plaque');
  g.toast("Notes: Founder's Day — Oct 19, first kept 1894.");
}

// ---------------------------------------------------------------------------------------------
// Room 101: Danny and the tiny chair (ch1_danny_stuck) · Uncle Frank #2.
async function tinyChair(g) {
  if (g.flag('ch1_danny_stuck') || vanished(g) || !here(g, 'danny')) return false;
  const chair = g.prop('w1_tiny_chair');
  if (!chair) return false;
  g.set('ch1_danny_stuck');
  const was = { leah: here(g, 'leah'), marcus: here(g, 'marcus') };
  hold(g, 'danny', 'leah', 'marcus');
  const d = g.npc('danny');
  await g.cam([39, 6], { time: 1.0 });
  let sat = false;
  try { sat = await HW.hiding?.seatNpc?.(d, chair, { walk: true }); } catch (e) { console.error('[ch1] seatNpc', e); }
  if (!sat) {
    await g.walk('danny', 'tiny_chair');
    if (g.npc('danny')) { d.x = chair.x * TILE + 8; d.y = chair.y * TILE + 12; d.sitDir = 'up'; d.dir = 'up'; d.sortBias = 4; }
  }
  g.sfx('desk_creak', { x: d.x, y: d.y, rate: 1.4 });
  if (was.leah) {
    g.face('leah', 'up');
    g.anim('leah', 'film_up');
    g.set('ch1_report');
    await g.say('leah', 'talk', 'STATIC field report. Room one-oh-one. The chairs are tiny. {p} Danny is not.');
    g.anim('leah', null);
  }
  await g.wait(0.5);
  g.sfx('chair_scrape', { x: d.x, y: d.y, vol: 0.5, rate: 1.5 });
  await g.wait(0.4);
  g.sfx('chair_scrape', { x: d.x, y: d.y, vol: 0.6, rate: 1.4 });
  await g.say('danny', 'nervous', 'Dolan. {p} Dolan. I\'m stuck.');
  await g.say('tess', 'skeptical', "You're not stuck.");
  await g.say('danny', 'talk', "I'm a little stuck. {p} I'm the guy who gets stuck. That's my whole thing.");
  // Marcus hauls him out by the jacket.
  if (was.marcus) {
    await g.walk('marcus', [41, 7]);
    g.face('marcus', 'left');
    await g.wait(0.3);
  }
  g.sfx('chair_scrape', { x: d.x, y: d.y, vol: 0.9, rate: 0.9 });
  g.shake(0.6, 0.15);
  HW.hiding?.unseatNpc?.(d);
  d.sitDir = null;
  d.sortBias = 0;
  g.refresh(); // the chair Danny got stuck in becomes an ordinary chair
  await g.walk('danny', [38, 7]);
  g.face('danny', 'up');
  await g.wait(0.4);
  await g.say('danny', 'grin', 'Uncle Frank says cubbies were the best part of his education.');
  if (was.leah) await g.say('leah', 'deadpan', 'It shows.');
  await g.cam(null, { time: 0.8 });
  release(g, 'danny', ...Object.keys(was).filter((k) => was[k]));
  return true;
}

// ---------------------------------------------------------------------------------------------
// The vanish. Everything that happens in the dark is light and sound; nobody says it is scary.
async function flickerDie(g, sec) {
  g.sfx('flashlight_flicker', { vol: 0.9 });
  const pattern = [0.09, 0.05, 0.14, 0.04, 0.22, 0.06, 0.1, 0.05, 0.28, 0.07, 0.18, 0.12, 0.05];
  let t = 0;
  let on = false;
  for (const d of pattern) {
    g.flashlight(on);
    on = !on;
    await g.wait(d);
    t += d;
    if (t >= sec) break;
    if (Math.abs(t - 0.75) < 0.06) g.sfx('flashlight_flicker', { vol: 0.6, rate: 0.9 });
  }
  g.flashlight(false);
}

/** Switch off every light on the map except ours (exit signs, moonlight in the stairwell…). */
function blackout() {
  const saved = [];
  for (const L of HW.lighting?.lights || []) {
    if (L._n1keep || L.on === false) continue;
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

async function vanishScene(g) {
  const tess = g.player;
  const [ttx] = tileOf(tess);
  const dirX = tess.dir === 'right' ? 1 : tess.dir === 'left' ? -1 : (ttx < 16 ? 1 : -1);
  const ahead = dirX > 0 ? 'right' : 'left';
  const back = dirX > 0 ? 'left' : 'right';
  const row = 15;
  const clampX = (x) => Math.max(3, Math.min(58, x));
  const was = { leah: here(g, 'leah'), marcus: here(g, 'marcus') };
  hold(g, 'danny', 'leah', 'marcus');
  aim(g, ahead);
  const cam = g.cam([clampX(ttx + dirX * 4), row], { time: 1.2 });

  // Danny runs ahead, turns round, and jogs backward with the flashlight under his chin.
  const d = g.npc('danny');
  await g.walk('danny', [clampX(ttx + dirX * 3), row], { run: true });
  g.face('danny', back);
  g.light('danny', DANNY_CHIN);
  await cam;
  const jog = g.walk('danny', [clampX(ttx + dirX * 6), row], { speed: 16 });
  g.anim('danny', `walk_${back}`, { hold: true });
  await g.say('marcus', 'worried', "Quit running, man. Floor's rotten.");
  await g.say('danny', 'grin', "I'm *jogging*. Backwards. It's different.", { light: 'under' });
  // The line never finishes: `hold` ends it the instant it is typed (no confirm).
  const frank = g.say('danny', 'talk',
    "So Uncle Frank, right, four Yuenglings deep at the Legion, grabs my arm, goes, Danny. *Danny.* They buried him with the sword. And whoever finds it gets to—",
    { light: 'under', hold: true });
  await frank;
  await jog;
  g.anim('danny', `walk_${back}`, { hold: true });

  // For one frame in Tess's beam, far down the hall: a small figure with an orange belt.
  const kx = clampX(ttx + dirX * 10);
  const fl = HW.lighting?.flashlight;
  if (fl) fl.radiusScale = 1.5;
  const belt = HW.lighting?.addLight?.({ type: 'bulb', px: kx * TILE + 8, py: row * TILE + 2, radius: 0.9, intensity: 0.6, color: '#f06a1c', cage: false, glow: null, map: 'west1' });
  if (belt) belt._n1keep = true;
  g.spawn({ id: 'kevin', sprite: 'kevin', at: [kx, row], dir: back });
  g.set('ch1_kevin_glimpse');
  await g.wait(1 / 15);
  g.despawn('kevin');
  if (belt) HW.lighting.removeLight(belt);
  if (fl) fl.radiusScale = 1;
  // The breathy pre-whistle.
  g.sfx('whistle_breath', { x: kx * TILE + 8, y: row * TILE });
  await g.wait(0.35);

  // Tess's Maglite flickers and dies (1.6 s); the dark comes up to ~0.98.
  g.anim('danny', null);
  g.face('danny', back);
  HW.lighting?.setAmbient?.(null, 0.98, 1.6);
  await flickerDie(g, 1.6);
  const saved = blackout();

  // The only light left: Danny's. He points it at them.
  g.light('danny', null);
  const hx = d.x;
  const hy = d.y - 9;
  const cone = HW.lighting?.addLight?.({ ...DANNY_LIGHT, intensity: 1.35, px: hx, py: hy, angle: Math.atan2(tess.y - 9 - hy, tess.x - hx), map: 'west1' });
  if (cone) cone._n1keep = true;
  // The lens itself: a hot little point that rides with the cone (so the flashlight reads as a thing).
  const lens = HW.lighting?.addLight?.({ type: 'bulb', px: hx, py: hy, radius: 0.4, intensity: 1.1, color: '#fff0dc', cage: false, glow: 'led', shadows: false, map: 'west1' });
  if (lens) lens._n1keep = true;
  const follow = () => { if (cone && lens) { lens.px = cone.px + Math.cos(cone.angle) * 2; lens.py = cone.py + Math.sin(cone.angle) * 2; } };
  try {
    await g.wait(0.7);
    // It jerks up to the ceiling. Danny is gone from under it.
    g.despawn('danny');
    const a0 = cone ? cone.angle : 0;
    await tween(0.07, (k) => { if (cone) { cone.angle = a0 + (-Math.PI / 2 - a0) * k; cone.py = hy - 10 * k; } follow(); });
    // …swings once…
    await tween(0.5, (k) => { if (cone) cone.angle = -Math.PI / 2 + Math.sin(k * Math.PI) * 1.1 * dirX; follow(); });
    await g.wait(0.12);
    // …drops…
    const fx0 = hx;
    const fy0 = hy - 10;
    await tween(0.16, (k) => { if (cone) { cone.py = fy0 + (d.y - fy0) * k * k; cone.angle = -Math.PI / 2 + 2.2 * k * dirX; } follow(); });
    g.sfx('flashlight_roll', { x: hx, y: d.y });
    g.shake(0.5, 0.12);
    // …and spins across the floor toward Tess's feet.
    const lx = tess.x + dirX * 20;
    const ly = tess.y + 4;
    const aEnd = Math.atan2(tess.y - 6 - ly, tess.x - lx);
    const aStart = cone ? cone.angle : 0;
    const turns = Math.PI * 2 * 3.25 * -dirX;
    await tween(1.35, (k) => {
      if (!cone) return;
      const e = 1 - (1 - k) * (1 - k) * (1 - k);
      cone.px = fx0 + (lx - fx0) * e;
      cone.py = d.y + (ly - d.y) * e;
      cone.angle = aStart + (aEnd + turns - aStart) * e;
      follow();
    });

    // 3 s of total silence (DESIGN §14). The light lies still, pointed at her.
    HW.audio?.silence?.(true, 0.05);
    await g.wait(3.0);
    HW.audio?.silence?.(false, 1.0);

    // Tess's light comes back.
    g.flashlight(true);
    await g.wait(0.06);
    g.flashlight(false);
    await g.wait(0.1);
    g.flashlight(true);
    unblackout(saved);
    HW.lighting?.setAmbient?.(null, HW.map?.data?.dark ?? 0.94, 0.25);
    // His flashlight rocks to a stop at her feet, beam pointed at her.
    await tween(0.9, (k) => { if (cone) cone.angle = aEnd + Math.sin(k * Math.PI * 3) * 0.16 * (1 - k); follow(); });
    g.flashlight('restore');
    await g.cam(null, { time: 0.8 });
    await g.wait(1.4);

    // Leah, whispering.
    if (was.leah) {
      g.face('leah', ahead);
      await g.say('leah', 'scared', 'Danny. {p=0.9} Not funny.', { speed: 0.8 });
      await g.wait(1.6);
      g.anim('leah', `film_${ahead}`);
      await g.say('leah', 'worried', "I'm *recording*, Danny.", { speed: 0.85 });
      g.anim('leah', null);
      await g.wait(0.6);
    }
    await g.think('shocked', "He was right there. He was mid-sentence. {p} He's never not mid-sentence.");

    // She picks it up. It's still on.
    aim(g, 'down');
    await g.wait(0.3);
    await g.anim('tess', 'pickup_down', { once: true });
  } finally {
    if (cone) HW.lighting?.removeLight?.(cone);
    if (lens) HW.lighting?.removeLight?.(lens);
    unblackout(saved);
    HW.audio?.silence?.(false, 0.5);
    HW.flashlight?.force?.(null);
    const fl2 = HW.lighting?.flashlight;
    if (fl2) fl2.radiusScale = 1;
  }
  g.give('danny_flashlight');
  return was;
}

// ---------------------------------------------------------------------------------------------
// Room 102 and the voice.
async function voice102(g, was = { leah: here(g, 'leah'), marcus: here(g, 'marcus') }) {
  await g.wait(1.0);
  g.sfx('intercom_crackle', { x: 20.5 * TILE, y: 11 * TILE, vol: 0.7 });
  await g.wait(0.5);
  await g.say('voice', null, 'Guys? {p=1.0}...Theresa? {p=0.6}In here.', { name: 'Danny?', speed: 0.7 });
  await g.wait(0.6);
  if (was.leah) await g.say('leah', 'scared', '*Theresa?* {p} He never calls you that.');
  // Room 102's door eases open by itself.
  g.sfx('door_creak_slow', { x: 20.5 * TILE, y: 12 * TILE });
  await g.wait(0.4);
  g.setProp('w1_door_102', 'open');
  await g.cam([20, 13], { time: 0.9 });
  await g.wait(0.8);
  if (was.marcus) await g.say('marcus', 'urgent', 'Stay behind me.');
  await g.cam(null, { time: 0.6 });
  g.objective('Room 102. Danny?');
}

// ---------------------------------------------------------------------------------------------
export default {
  /** After pro.doors: the chapter card; the vestibule; Miss Adair, one frame, in the trophy glass. */
  'ch1.start': async (g) => {
    installWeather();
    const replay = g.seen('ch1_start');
    if (g.state.map === 'lobby' && HW.fx?.faded === false) await g.fade('out', 0.4);
    await g.chapter(1);
    g.light('danny', DANNY_LIGHT);
    g.refresh();
    aim(g, 'up');
    await g.fade('in', 1.2);
    if (g.state.map !== 'lobby') return;

    // The outer doors settle shut behind them. Marcus looks back.
    g.sfx('door_close_metal', { x: 15 * TILE, y: 25.5 * TILE, rate: 0.8, vol: 0.9 });
    g.shake(0.6, 0.2);
    await g.wait(0.9);
    if (g.npc('marcus')) g.face('marcus', 'down');
    await g.wait(0.7);
    if (replay) { g.objective('Look around.'); return; }

    // Tess's beam finds the west trophy case.
    await g.walk('tess', [11, 22]);
    aim(g, 'up');
    await g.wait(0.9);
    // For one frame, a woman stands behind her in the glass.
    const t = g.player;
    // In the glass, over Tess's shoulder: drawn on the case (after it, before Tess), half there.
    const ad = g.spawn({ id: 'adair_glass', sprite: 'adair', px: 10 * TILE + 8, py: 21 * TILE + 8, dir: 'down', alpha: 0.7 });
    if (ad) { ad.sortBias = 10; ad.shadow = false; }
    await g.wait(1 / 15);
    g.despawn('adair_glass');
    g.set('ch1_adair_glimpse');
    await g.wait(0.45);
    // She turns round. Nobody. Just Leah and Marcus, and the doors.
    aim(g, 'down');
    await g.wait(1.3);
    aim(g, 'up');
    await g.wait(0.6);
    if (here(g, 'danny')) {
      hold(g, 'danny');
      await g.walk('danny', [14, 21]);
      g.face('danny', 'down');
      await g.say('danny', 'grin', 'Dolan. You coming?');
      release(g, 'danny');
    }
    g.objective('Look around.');
  },

  /** Trigger (once) crossing from the vestibule into the lobby. */
  'ch1.enter_lobby': async (g) => {
    installWeather();
    if ((g.state.chapter || 0) < 1) { // reload from the Prologue checkpoint: the doors were already cut
      await g.chapter(1);
      g.light('danny', DANNY_LIGHT);
      g.refresh();
    }
    if (vanished(g)) { await g.run('ch1.backpack', { beat: true }); return; }
    if (g.seen('ch1_enter_lobby')) { dropBag(g); readPlaque(g); return; }
    await lobbyScene(g);
  },

  /** The portrait (seated). The reveal itself is in enter_lobby; this is a closer look. */
  'ch1.portrait': async (g) => {
    g.face('tess', 'up');
    if (!vanished(g)) {
      await g.examine(['[n] Colonel Cyrus Hallowell, 1841–1911, in oils. A carved chair, a red sash, brass buttons, and a great deal of man.',
        '[skeptical] The painter ran out of canvas around the elbows.']);
      if (here(g, 'danny')) await g.say('danny', 'grin', 'Dolan. His eyes follow you. Move. {p} Still following.');
      if (here(g, 'leah')) await g.say('leah', 'deadpan', "It's a technique. They teach it.");
      if (here(g, 'marcus')) await g.say('marcus', 'worried', "My grandma won't say his name.");
      return;
    }
    await g.examine(['[n] The Colonel, in his carved chair, in the skylight.', '[scared] That little smile. Like he knows where Danny is.']);
    if (here(g, 'leah')) await g.say('leah', 'scared', "Don't look at it, T.");
    if (here(g, 'marcus')) await g.say('marcus', 'urgent', 'Keep moving.');
  },

  /** The memorial board. Marcus goes and stands in front of it, and doesn't say why. */
  'ch1.memorial': async (g) => {
    g.face('tess', 'up');
    if (!vanished(g)) {
      await g.examine('[n] THE HOMECOMING NINE — FOREVER IN OUR HEARTS. Nine school pictures, gone the color of weak tea.');
      await g.doc('memorial');
      if (here(g, 'marcus')) {
        hold(g, 'marcus');
        await g.walk('marcus', 'memorial');
        g.face('marcus', 'up');
        await g.wait(1.4);
      }
      if (here(g, 'danny')) await g.say('danny', 'nervous', "That's them. The Nine.");
      if (here(g, 'leah')) await g.say('leah', 'worried', 'Raymond Oakes was nine. {p} Fourth grade.');
      if (g.npc('marcus') && !here(g, 'marcus')) {
        await g.wait(0.8);
        await g.say('tess', 'curious', 'Marcus?');
        await g.say('marcus', 'neutral', '{p=0.8}Yeah. {p} Nothing.');
        release(g, 'marcus');
      }
      return;
    }
    // After the vanish: a Polaroid has been pinned over the corner of the board.
    await g.examine(["[n] Pinned over the corner of the board, a Polaroid. Danny, mid-laugh, two fingers up behind somebody's head. Under it, in ink: 1996.",
      "[horrified] That's tonight. {p} Nobody here has a Polaroid."]);
    if (here(g, 'leah')) await g.say('leah', 'scared', "That's my shot. {p} That's the group shot.");
    if (here(g, 'marcus')) await g.say('marcus', 'urgent', 'Front doors. Come on.');
  },

  /** The plaque. If Leah hasn't read it out yet (or Tess wants it again), the plaque doc itself. */
  'ch1.plaque': async (g) => {
    g.face('tess', 'up');
    if (!g.flag('ch1_plaque_read') && !vanished(g) && here(g, 'leah')) {
      await g.say('leah', 'talk', "'Founder's Day, October nineteenth, first kept in 1894, in memory of the boys of the Hallowell Breaker.'");
      await g.say('leah', 'deadpan', 'He made the day they died a holiday. {p} Cool. Normal.');
      readPlaque(g);
      return;
    }
    await g.doc('plaque');
    readPlaque(g);
    if (!vanished(g)) {
      if (here(g, 'danny')) await g.say('danny', 'grin', "1894. That's, like, old old.");
      if (here(g, 'marcus')) await g.say('marcus', 'thoughtful', "'His boys.'");
    } else if (here(g, 'leah')) await g.say('leah', 'scared', 'T. Please. The doors.');
  },

  /** The west trophy case (Miss Adair's glass). */
  'ch1.trophy': async (g) => {
    g.face('tess', 'up');
    if (!vanished(g)) {
      await g.examine(['[n] Bowling trophies, a debate plaque, a pennant: DISTRICT XI — 1978. On green felt, a little enamel clarinet: ALL-COUNTY BAND 1979.',
        { cond: (s) => !!s.flags.ch1_adair_glimpse, text: '[worried] My face in the glass. {p} Just mine.' }]);
      if (here(g, 'danny')) await g.say('danny', 'grin', 'The Colliers. Runners-up in everything since 1923.');
      if (here(g, 'leah')) await g.say('leah', 'talk', 'Band made All-County that year. Says so on the clarinet.');
      if (here(g, 'marcus')) await g.say('marcus', 'thoughtful', '...Clarinet.');
      return;
    }
    await g.examine("[scared] My face in the glass. Leah's. Marcus's. {p} Three.");
    if (here(g, 'leah')) await g.say('leah', 'worried', "T. Don't.");
  },

  /** The east doors, jammed. Danny tries it Kovach style, once. */
  'ch1.east_jammed': async (g, ctx) => {
    g.sfx('door_locked', { vol: 0.8 });
    const p = ctx?.prop || g.prop('lobby_east_doors');
    if (!vanished(g) && here(g, 'danny') && !g.flag('ch1_danny_shoulder')) {
      g.set('ch1_danny_shoulder');
      await g.examine("[n] The doors to the east hall. They give an inch and stop, like something's leaning on them.");
      await g.say('danny', 'grin', 'Stand back. Kovach style.');
      hold(g, 'danny');
      await g.walk('danny', [25, 15]);
      g.face('danny', 'right');
      await g.wait(0.3);
      await g.walk('danny', [26, 15], { run: true });
      g.sfx('door_locked', { x: 27 * TILE, y: 15.5 * TILE, vol: 1, rate: 0.7 });
      g.shake(1.2, 0.2);
      await g.walk('danny', [25, 15], { speed: 40 });
      g.face('danny', 'left');
      await g.say('danny', 'nervous', "...That's a load-bearing door.");
      if (here(g, 'marcus')) await g.say('marcus', 'neutral', 'Swollen. Rain gets in the frames.');
      release(g, 'danny');
      return;
    }
    const text = p?.inst?.lockedText;
    await g.examine(text ? (typeof text === 'function' ? text(g.state) : text)
      : "[n] Still jammed. Something on the other side is leaning on them.");
  },

  /** The outer front doors before the vanish (DESIGN §9.2). Leah keeps exact time. */
  'ch1.vestibule_refuse': async (g) => {
    if (vanished(g)) return;
    const n = g.inc('ch1_refusals');
    if (n === 1 && here(g, 'leah')) {
      await g.say('leah', 'deadpan', "We've been here four minutes. Danny'll never let us live it down.");
    } else if (n === 2 && here(g, 'danny')) {
      await g.say('danny', 'grin', 'Dolan. {p} Chicken.');
    } else {
      await g.think('neutral', 'Not yet.');
    }
    // Step back from the doors.
    const p = g.player;
    const [tx, ty] = tileOf(p);
    if (ty >= 24) await g.walk('tess', [tx, 23]);
    aim(g, 'up');
  },

  /** Danny's backpack. Before: Krimpets and a pamphlet he'd rather you didn't see. After: the bolt cutters. */
  'ch1.backpack': async (g, ctx) => {
    // Ch6: the breather happens on this bag.
    if (g.flag('safe_open') && !g.flag('ch6_breather_done') && HW.scripts?.has?.('ch6.breather')) { await g.run('ch6.breather'); return; }
    if (!vanished(g) && (g.state.chapter || 0) <= 1) {
      await g.examine("[n] Danny's JanSport. Bolt cutters, two bags of Herr's, a box of Butterscotch Krimpets, and a pamphlet folded small and shoved down the side.");
      if (here(g, 'danny')) await g.say('danny', 'nervous', "That's nothing. {p} Hands off the Krimpets.");
      return;
    }
    if (!g.has('bolt_cutters')) {
      if (ctx?.beat) {
        // On the way to the doors: she stops, and goes back for them.
        hold(g, 'leah', 'marcus');
        await g.cam('danny_bag', { time: 0.9 });
        await g.wait(0.6);
        await g.walk('tess', [16, 9]);
        aim(g, 'down');
      }
      if (g.player.dir === 'down') await g.anim('tess', 'pickup_down', { once: true });
      g.give('bolt_cutters');
      await g.say('tess', 'sad', "He'll want these back.");
      if (ctx?.beat) {
        await g.cam(null, { time: 0.7 });
        release(g, 'leah', 'marcus');
      }
      return;
    }
    if (ctx?.beat) return;
    await g.examine((g.state.chapter || 0) <= 1
      ? '[sad] The Krimpets are still in there. Base camp.'
      : "[sad] Danny's backpack. Right where he dropped it.");
  },

  /** West1 rooms, first time each (pre-vanish): Leah's field report; the count gates the vanish. */
  'ch1.room_enter': async (g, ctx) => {
    if (vanished(g) || (g.state.chapter || 0) > 1) return;
    const id = String(ctx?.trigger?.id || '').replace('room_enter_', '');
    if (!id || g.flag(`ch1_room_${id}`)) return;
    g.set(`ch1_room_${id}`);
    g.inc('ch1_rooms_entered');
    if (typeof g.flag('ch1_west1_t') !== 'number') g.set('ch1_west1_t', g.state.playtime);
    if (id === '101') {
      if (await tinyChair(g)) return;
      await leahReport(g, 'STATIC field report. Room one-oh-one. The chairs are tiny.');
      return;
    }
    const LINES = {
      103: "Room one-oh-three. Front row's clean. {p} Like somebody dusted.",
      102: "Room one-oh-two. It's colder in here than the hall. {p} For the record.",
      rr: "Girls' room. The mirror's filthy. {p} I look incredible.",
    };
    // The first report of the night gets the full STATIC slate; after that she just names the room.
    const slate = g.flag('ch1_report') ? '' : 'STATIC field report. ';
    g.set('ch1_report');
    if (LINES[id]) await leahReport(g, slate + LINES[id], id === 'rr' ? 'smirk' : 'talk');
  },

  /** The tiny chair itself (101), if Tess gets to it before the room-enter scene. */
  'ch1.tiny_chair': async (g) => {
    if (await tinyChair(g)) return;
    await g.examine('[n] A chair for a very small person.');
  },

  /** Danny breaks R3 by the bell schedule (DESIGN §6 I.4). */
  'ch1.danny_vanish': async (g) => {
    if (vanished(g) || !g.npc('danny')) return;
    const replay = g.seen('ch1_vanish');
    g.set('ch1_danny_vanished');
    // The school rearranges Room 102 in the dark (rows + DANIEL KOVACH — PRESENT) and re-arms the
    // lobby trigger so Tess passes Danny's bag on the way to the doors.
    g.set('ch1_102_rows');
    g.set('trig_lobby_enter_lobby', false);
    let was;
    if (replay) {
      hold(g, 'danny', 'leah', 'marcus');
      g.light('danny', null);
      g.despawn('danny');
      g.give('danny_flashlight');
      was = { leah: !!g.npc('leah'), marcus: !!g.npc('marcus') };
    } else {
      was = await vanishScene(g);
    }
    g.light('danny', null);
    g.state.party = g.state.party.filter((id) => id !== 'danny');
    g.refresh();
    await g.run('ch1.voice_102', { was });
    release(g, 'leah', 'marcus');
  },

  /** "Guys? …Theresa? In here." — INTERCOM styling, the borrowed name "Danny?" (R7). */
  'ch1.voice_102': async (g, ctx) => {
    if (g.flag('ch1_voice_102')) return;
    g.set('ch1_voice_102');
    await voice102(g, ctx?.was);
  },

  /** Room 102 after the vanish: desks in perfect rows, fresh chalk. */
  'ch1.room102': async (g) => {
    if (!vanished(g) || g.flag('ch1_room102_done') || (g.state.chapter || 0) > 1) return;
    g.set('ch1_room102_done');
    if (!g.flag('ch1_102_rows')) { g.set('ch1_102_rows'); g.refresh(); }
    const replay = g.seen('ch1_room102');
    const was = { leah: here(g, 'leah'), marcus: here(g, 'marcus') };
    if (!replay) {
      hold(g, 'leah', 'marcus');
      aim(g, 'up');
      await g.cam([23, 6], { time: 1.6 });
      await g.wait(0.5);
      // one stroke of chalk, the last one, from the board at the front
      g.sfx('chalk', { x: 19.5 * TILE, y: 3 * TILE, vol: 0.45 });
      await g.cam([19, 4], { time: 1.2 });
      await g.wait(0.9);
      if (was.leah) {
        await g.say('leah', 'scared', g.flag('ch1_room_102') ? 'We were just in here.' : 'Danny?', { speed: 0.85 });
      }
      if (was.marcus) await g.say('marcus', 'worried', "Danny can't spell 'present.'");
      await g.wait(0.6);
      if (was.marcus) await g.say('marcus', 'urgent', 'Front doors. Now.');
      await g.cam(null, { time: 0.8 });
      release(g, 'leah', 'marcus');
    }
    g.objective('Get out. Get help.');
  },

  /**
   * Front doors after the vanish (trigger, once). Push them open into the rain — and step out of
   * the library doors at the far west end of the west hall, two tiles, seamless.
   */
  'ch1.front_loop': async (g) => {
    if (!vanished(g) || g.flag('ch1_front_loop')) return;
    g.set('ch1_front_loop');
    if (!g.flag('ch1_102_rows')) g.set('ch1_102_rows');
    const replay = g.seen('ch1_front_loop');
    const was = { leah: here(g, 'leah'), marcus: here(g, 'marcus') };
    // The night, right there: rain and cold air through the open doors.
    aim(g, 'down');
    g.ambience('exterior_rain', 0.25);
    g.sfx('wind_gust', { vol: 0.7 });
    await g.wait(0.6);
    // Out of the library doors, two tiles, as if nothing happened. The rain stops on the cut.
    g.setProp('w1_library_doors', 'open');
    g.setProp('w1_library_doors_b', 'open');
    g.ambience(null, 0.05);
    await g.transfer('west1', [1, 15], { fade: false, dir: 'right' });
    hold(g, 'leah', 'marcus');
    const L = g.npc('leah');
    const M = g.npc('marcus');
    if (L) { L.visible = false; g.setPos('leah', [1, 15]); }
    if (M) { M.visible = false; g.setPos('marcus', [1, 16]); }
    aim(g, 'right');
    const out = [g.walk('tess', [3, 15], { ignoreSolid: true })];
    await g.wait(0.35);
    if (L) { L.visible = true; out.push(g.walk('leah', [[2, 15], [3, 16]], { ignoreSolid: true })); }
    await g.wait(0.35);
    if (M) { M.visible = true; out.push(g.walk('marcus', [[2, 16], [4, 16]], { ignoreSolid: true })); }
    await Promise.all(out);
    // The doors swing shut behind them. Jammed, the way they always were.
    g.setProp('w1_library_doors', 'jammed');
    g.setProp('w1_library_doors_b', 'jammed');
    g.sfx('door_close_wood', { x: 1.5 * TILE, y: 16 * TILE, rate: 0.85 });
    if (L) g.face('leah', 'right');
    if (M) g.face('marcus', 'left');
    await g.wait(1.6);
    // Across the hall: the collapsed stairwell.
    aim(g, 'down');
    await g.cam([6, 21], { time: 1.2 });
    await g.wait(0.6);
    if (!replay) {
      // portraits on the right: the hall end and the stairwell stay in view on the left
      await g.say('tess', 'scared', "That's the stairwell. {p} The collapsed one.", { side: 'right' });
      if (was.leah) {
        g.face('leah', 'down');
        g.anim('leah', 'film_down');
        await g.say('leah', 'scared', 'We walked in a straight line.');
        g.anim('leah', null);
      }
      if (was.marcus) await g.say('marcus', 'worried', 'Yeah.');
      // Marcus tries the library doors. They don't move.
      if (M) {
        await g.walk('marcus', [2, 16]);
        g.face('marcus', 'left');
        g.sfx('door_locked', { x: 1.5 * TILE, y: 16 * TILE, vol: 1 });
        g.shake(0.5, 0.15);
        await g.wait(0.8);
      }
    }
    await g.cam(null, { time: 0.7 });
    release(g, 'leah', 'marcus');
    await g.run('ch1.end');
  },

  /** The intercom crackles. Chapter II. */
  'ch1.end': async (g) => {
    g.set('ch1_front_loop');
    if (!g.flag('ch1_102_rows')) g.set('ch1_102_rows');
    g.light('leah', null); // the camcorder's LED goes with the camcorder (Ch2: Leah's desk in 103)
    await g.wait(0.8);
    g.sfx('intercom_crackle', { vol: 1 });
    const hum = g.loop('intercom_hum', { vol: 0.5 });
    await g.wait(1.4);
    await g.chapter(2);
    try { hum.stop(1.5); } catch (e) { /* audio stub */ }
    if (HW.scripts?.has?.('ch2.start')) await g.run('ch2.start');
  },
};
