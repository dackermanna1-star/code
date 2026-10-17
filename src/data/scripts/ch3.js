// CHAPTER III — Custodial (lobby, east1, basement; party: Marcus). DESIGN §6 III · CONTENT §3 · narrative-2.
//
//   ch3.start        after the card, still in 103: where a janitor keeps keys. Objective.
//   ch3.east_hall    trigger ch3_east (first step into the east hall, Ch3): the stairs, the moonlight.
//   ch3.dumbwaiter   the hatch: "Theresa... it's so dark down here..." in Danny's voice. "That's not him."
//   ch3.mixer        the Hobart turns over once, by itself.   ch3.freezer   the warm walk-in, the shells.
//   ch3.basement     trigger basement_enter: checkpoint at the bottom of the stairs; the boiler is lit.
//   ch3.heap         the coal heap: "Old gym mats? ...It's breathing." / later: the body-shaped hollow.
//   ch3.stir1/2      HW.basement hooks (stir 1: the coal slides; stir 2: he rises — the system chases).
//   ch3.jan_door     the padlocked janitor's door (key from the ledge, or the bolt cutters — loud).
//   ch3.ledge        the spare key above the door.  ch3.ledge_hint  Marcus, after 40 s at the door.
//   ch3.calendar     OCTOBER 1979. "That's the day."
//   ch3.keyring      the key ring (OFFICE, 2F GATE); Walt's log opens; checkpoint.
//   ch3.panel        the breaker panel: CLUNK (stir 1 if the heap is quiet).
//   ch3.gate         the stair gate before roll #1 (for ch5.gate to call; the map's gate text says the same).
//   ch3.first_period trigger first_period (top of the basement stairs, with the keys): the guided period —
//                    "Cafeteria. Go." — HW.periods.start({ guided: true }); afterwards ch3.end.
//   ch3.end          the heap is empty now (coalbin_empty); → g.chapter(4) → ch4.start.
import HW from '../../engine/hw.js';

const TILE = 16;
const ent = (id) => HW.entities?.get(id) || null;
const withMarcus = () => !!HW.state?.party?.includes('marcus') && !!ent('marcus');
const centerOf = (p) => (p ? { x: (p.x + p.w / 2) * TILE, y: (p.y + p.h / 2) * TILE } : null);
const heapProp = () => HW.map?.prop('b_coal_heap') || null;
const heapEmpty = () => !!HW.state?.flags?.coalbin_empty || heapProp()?.state === 'hollow';

/** The keyring was taken but the hint watcher should stop: one per script generation. */
let hintGen = -1;

export default {
  // ------------------------------------------------------------------------------------------ start
  'ch3.start': async (g) => {
    g.objective("Janitor's keys. The basement — east stairs.");
    if (g.seen('ch3_start')) return;
    await g.wait(0.8);
    await g.think('worried', 'Keys. {p} Where does a janitor even keep keys?');
    if (withMarcus()) await g.say('marcus', 'thoughtful', 'By the boiler. {p} Always by the boiler.');
  },

  /** First step into the east hall in Ch3 (the trigger fires on every crossing; only the first one speaks). */
  'ch3.east_hall': async (g) => {
    if (g.seen('ch3_east_hall')) return;
    await g.wait(0.2);
    g.face('tess', 'right');
    // Down the hall: the stairwell, the moonlight on the steps, the gym doors at the far end.
    await g.cam('stair_down', { time: 1.6 });
    await g.wait(1.2);
    await g.think('worried', 'Jammed an hour ago. Open now. {p} Like somebody wanted us over here.');
    await g.cam(null, { time: 1.0 });
  },

  // ------------------------------------------------------------------------------------------ kitchen
  'ch3.dumbwaiter': async (g, ctx) => {
    const id = ctx?.prop?.id || 'e1_dumbwaiter';
    if (g.seen('ch3_dumbwaiter')) {
      await g.examine("[n] The hatch. I'm not opening it again.");
      return;
    }
    g.setProp(id, 'open');
    g.sfx('dumbwaiter', { vol: 0.6 });
    await g.examine('[n] A hatch in the wall on a rope lift. Cold air comes up the shaft, smelling like coal.');
    await g.wait(1.4);
    g.sfx('dumbwaiter', { vol: 0.35, rate: 0.8 });   // the rope creaks, far down
    await g.wait(1.6);
    g.fx('distort', 0.25, 2.4);
    g.fx('chroma', 0.35, 2.4);
    await g.say('voice', null, 'Theresa... {p=0.8} it\'s so dark down here...', { name: 'Danny?', speed: 0.7 });
    await g.say('tess', 'shocked', 'Danny—');
    if (withMarcus()) {
      g.face('marcus', 'tess');
      await g.say('marcus', 'urgent', "That's not him.");
    }
    g.setProp(id, 'closed');
    g.sfx('door_close_wood', { vol: 0.6 });
    await g.think('scared', 'Danny calls me Dolan. {p} He has never once called me Theresa.');
  },

  'ch3.mixer': async (g, ctx) => {
    if (g.seen('ch3_mixer')) {
      await g.examine("[n] The mixer. I'm not touching it again.");
      return;
    }
    await g.examine('[n] A Hobart mixer taller than me. Dough still crusted in the bowl.');
    await g.wait(0.8);
    const c = centerOf(ctx?.prop) || {};
    g.sfx('mixer_start', { ...c, vol: 0.9 });
    g.shake(1, 0.6);
    if (c.x !== undefined) HW.noise?.emit?.(c.x, c.y, null, 'mixer');
    await g.wait(1.6);
    await g.think('scared', "It turned over. {p} It's not even plugged in.");
  },

  /** The walk-in (its shells): warm, and full. */
  'ch3.freezer': async (g) => {
    if (g.seen('ch3_freezer')) {
      await g.examine('[n] Shells. The whole floor.');
      return;
    }
    await g.examine([
      "[n] It's warm in here. Warm like an oven left open.",
      '[n] Cicada shells on every shelf, every crate, the floor. Thousands. Every one split down the back.',
    ]);
    await g.think('disgusted', "Freezers aren't warm.");
    if (withMarcus()) await g.say('marcus', 'worried', "Let's go. {p} Come on.");
  },

  // ------------------------------------------------------------------------------------------ basement
  'ch3.basement': async (g) => {
    if (g.flag('ch3_panel_thrown')) HW.lighting?.setGroup?.('bsmt', true, { mode: 'instant' });
    g.checkpoint('basement');
    if (g.seen('ch3_basement')) return;
    await g.wait(0.8);
    if (HW.map?.anchor('boiler')) {
      await g.cam('boiler', { time: 1.6 });
      await g.wait(1.0);
    }
    if (withMarcus()) await g.say('marcus', 'worried', "Boiler's lit.");
    await g.say('tess', 'scared', "Who's feeding it?");
    await g.cam(null, { time: 1.0 });
  },

  'ch3.heap': async (g) => {
    if (heapEmpty()) {
      if (g.seen('ch3_hollow')) {
        await g.examine("[n] The hollow in the coal. I'm not going any closer.");
        return;
      }
      await g.examine('[n] A hollow pressed into the coal. Long, and wide as a car. The shape of something that was lying on its side.');
      await g.think('terrified', "It isn't down here anymore. {p} It's up there. With us.");
      return;
    }
    if (g.seen('ch3_heap')) {
      await g.think('scared', 'Slow. In. {p=0.8} Out.');
      return;
    }
    if (HW.map?.anchor('coal_heap')) await g.cam('coal_heap', { time: 1.2 });
    await g.examine('[n] A heap of coal, and half-buried in it, something enormous. Dark folds. A gleam of brass.');
    const c = HW.map?.anchor('coal_heap');
    if (c) g.sfx('colonel_breath', { x: c.x, y: c.y - 8, vol: 1 });
    await g.wait(1.4);
    await g.think('scared', 'Old gym mats? {p=1.2} ...It\'s breathing.');
    await g.cam(null, { time: 0.8 });
    if (withMarcus() && !g.flag('ch3_walk_said')) {
      g.set('ch3_walk_said');
      await g.say('marcus', 'scared', 'Walk. {p} Don\'t run.', { speed: 0.8 });
    }
  },

  /** HW.basement: stir 1 (the coal slides, the breath quickens). */
  'ch3.stir1': async (g) => {
    if (g.flag('ch3_panel_clunk')) {
      g.set('ch3_panel_clunk', false);
      await g.wait(0.6);
      await g.think('terrified', '...Okay. No more noise. {p} Not one more.');
      return;
    }
    await g.wait(0.4);
    if (withMarcus() && !g.flag('ch3_walk_said')) {
      g.set('ch3_walk_said');
      await g.say('marcus', 'scared', 'Walk. {p} Don\'t run.', { speed: 0.85 });
      return;
    }
    await g.think('terrified', g.inc('ch3_stir_lines') % 2 ? "Don't wake it. Don't wake it." : 'Quiet. {p} Quiet.');
  },

  /** HW.basement: stir 2 — it rises (the system starts the chase when this returns). Keep it short. */
  'ch3.stir2': async (g) => {
    const c = HW.map?.anchor('coal_heap');
    if (c) HW.fx?.emit?.('coal_dust', c.x, c.y - 10, 24);
    g.shake(2, 0.8);
    if (withMarcus()) await g.say('marcus', 'scared', 'Stairs. {p} Go.', { shake: 1 });
  },

  'ch3.jan_door': async (g, ctx) => {
    const door = ctx?.prop || HW.map?.prop('b_jan_door');
    if (!door) return;
    if (g.flag('ch3_jan_key') || door.state === 'open') {
      if (door.state !== 'open') {
        if (!door.pparams?.unlocked) {
          g.sfx('key_unlock', centerOf(door));
          HW.map.setPropState(door.id, null, { unlocked: true });
        }
        HW.interact?.openDoor?.(door);
      }
      return;
    }
    g.sfx('padlock', centerOf(door));
    if (!g.flag('ch3_jan_tried')) g.set('ch3_jan_tried', HW.state.playtime);
    armHint(g);
    if (!g.seen('ch3_jan_door')) await g.examine('[n] JANITOR — W. PRUSZYNSKI, stenciled on a steel door. A hasp, and a brass padlock gone green.');
    else await g.examine('[n] Padlocked.');
    if (!g.has('bolt_cutters')) return;
    const c = await g.choice(['Cut the padlock. (Loud.)', 'Leave it.']);
    if (c !== 0) return;
    const at = centerOf(door);
    g.sfx('bolt_cutters', { ...at, vol: 1 });
    HW.noise?.emit?.(at.x, at.y, null, 'bolt_cutters');
    g.shake(1, 0.2);
    g.set('ch3_jan_key');
    g.set('ch3_jan_cut');
    await g.wait(1.4);
    // Listen.
    if (HW.basement?.active && (HW.basement.stir || 0) === 0) await g.think('scared', 'The snap rang off every pipe down here. {p} ...Still slow. Still asleep.');
    HW.map.setPropState(door.id, null, { unlocked: true });
    HW.interact?.openDoor?.(door);
  },

  'ch3.ledge': async (g) => {
    if (g.flag('ch3_jan_key')) {
      await g.examine('[n] Just dust up there now.');
      return;
    }
    g.sfx('paper_rustle', { vol: 0.4 });
    await g.examine('[n] I run my fingers along the top of the doorframe. Dust. A dead moth. A key on a loop of wire.');
    g.set('ch3_jan_key');
    g.set('ch3_ledge_key');
    await g.think('relieved', 'Thank you, whoever you were.');
  },

  'ch3.ledge_hint': async (g) => {
    if (g.flag('ch3_jan_key') || g.flag('ch3_hint_given') || !withMarcus()) return;
    g.set('ch3_hint_given');
    g.face('marcus', 'janitor_door');
    await g.say('marcus', 'thoughtful', 'Top of the frame. {p} Everybody keeps a spare up there.');
  },

  'ch3.calendar': async (g) => {
    if (g.seen('ch3_calendar')) {
      await g.examine('[n] OCTOBER 1979. The nineteenth, circled.');
      return;
    }
    await g.examine('[n] A hardware-store calendar, OCTOBER 1979. The nineteenth is circled in pencil, so hard the paper tore.');
    if (withMarcus()) {
      await g.wait(0.6);
      await g.say('marcus', 'sad', "That's the day.");
    }
  },

  'ch3.keyring': async (g, ctx) => {
    if (g.flag('ch3_keyring')) return;
    if (ctx?.prop?.id) g.removeProp(ctx.prop.id);
    if (HW.map?.prop('b_pegboard')) g.setProp('b_pegboard', 'empty');
    g.give('keyring');
    g.set('ch3_keyring');
    await g.think('determined', 'OFFICE. 2F GATE. {p} That\'s all he left.');
    if (!g.state.docs?.walt_log) {
      await g.narrate('Under the hook, a ledger in a plastic sleeve. The cover says LOG in black marker. It falls open.');
      await g.doc('walt_log');
      await g.think('scared', "Don't answer. {p} When the bell goes, sit.");
      if (withMarcus()) {
        await g.say('marcus', 'sad', "'Sit down when the bell goes.' {p} Grandma says that. Every single school morning.");
      }
    }
    g.objective('Back upstairs. The main office.');
    g.checkpoint('keyring');
  },

  'ch3.panel': async (g, ctx) => {
    if (g.flag('ch3_panel_thrown')) {
      await g.examine('[n] MAIN is down. Nothing came on.');
      return;
    }
    await g.examine('[n] A gray breaker panel. Somebody wrote MAIN in marker over the big handle.');
    const c = await g.choice(['Throw the main.', 'Leave it.']);
    if (c !== 0) return;
    g.set('ch3_panel_thrown');
    const at = centerOf(ctx?.prop) || (HW.player ? { x: HW.player.x, y: HW.player.y } : { x: 0, y: 0 });
    g.sfx('lever_pull', { ...at, vol: 1, rate: 0.8 });
    g.shake(2, 0.3);
    g.set('ch3_panel_clunk');
    HW.noise?.emit?.(at.x, at.y, null, 'panel');
    // The caged bulbs stutter awake down the corridor, one after another.
    await g.wait(0.7);
    HW.lighting?.setGroup?.('bsmt', true, { mode: 'stutter', stagger: 1.2 });
    for (const p of HW.map?.props || []) if (p.type === 'cage_bulb' && /^b_bulb_/.test(p.id)) g.setProp(p.id, 'on');
    await g.wait(1.0);
    // The heap system takes it from here (ch3.stir1 says the line); if it didn't stir, say it anyway.
    if (g.flag('ch3_panel_clunk')) {
      g.set('ch3_panel_clunk', false);
      await g.think('scared', '...Okay. {p} No more noise. Not one more.');
    }
  },

  /** The stair gate before roll #1 (DESIGN §9.2). e1_gate's script is ch5.gate; it can call this. */
  'ch3.gate': async (g) => {
    g.sfx('gate_rattle', { vol: 0.8 });
    if (!g.has('keyring')) {
      await g.examine("[n] A steel accordion gate across the stairs up. There's no padlock — the lock's built in.");
      return;
    }
    if (withMarcus()) await g.say('marcus', 'worried', "Not up. {p} We don't even know where they are.");
    await g.say('tess', 'determined', 'The intercom.');
  },

  // ------------------------------------------------------------------------------------------ the period
  'ch3.first_period': async (g) => {
    if (g.flag('ch3_period_done') || !g.flag('ch3_keyring')) return;
    if (HW.periods && HW.periods.phase !== 'idle') return;
    const replay = g.seen('ch3_first_period');
    const bell = g.periods.start({ guided: true, reason: 'ch3' });
    await g.wait(replay ? 0.4 : 1.2);
    const m = ent('marcus');
    if (m && withMarcus()) {
      g.face('marcus', 'caf_doors');
      await g.say('marcus', 'urgent', replay ? 'Cafeteria.' : 'Cafeteria. {p} Go.');
      // He takes a table by the doors (the warning may have sat him somewhere else).
      const seat = cafeteriaSeat();
      if (seat && m.seat !== seat) {
        HW.hiding?.unseatNpc?.(m);
        if (m.path) { m.stopPath(false); await g.wait(0.02); }
        HW.hiding?.seatNpc?.(m, seat, { run: true });
      }
    }
    g.objective('The cafeteria. Sit down.');
    // When the period is over (dismissal done), the chapter ends.
    g.parallel(async (pg) => {
      const rang = await bell;
      if (!rang || !pg.alive) return;
      await HW.game.until(() => !pg.alive || HW.periods.phase === 'idle');
      if (!pg.alive) return;
      HW.scripts.run('ch3.end');
    });
  },

  'ch3.end': async (g) => {
    if (g.flag('ch3_period_done')) return;
    g.set('ch3_period_done');
    g.set('coalbin_empty');   // the basement map swaps the heap for its hollow on this flag
    g.refresh();
    const m = ent('marcus');
    if (m?.seat) HW.hiding?.unseatNpc?.(m);
    await g.wait(1.6);
    if (!g.seen('ch3_end')) {
      await g.think('scared', 'That breathing. {p} The heap in the basement breathed exactly like that.');
      if (withMarcus()) await g.say('marcus', 'determined', 'Office. {p} Before it rings again.');
    }
    if (HW.player?.seated) await HW.hiding?.stand?.();
    await g.chapter(4);
    if (HW.scripts?.has?.('ch4.start')) await g.run('ch4.start');
  },
};

/** A cafeteria table for Marcus: free, inside the cafeteria, closest to the doors (the anchor caf_bench). */
function cafeteriaSeat() {
  const map = HW.map;
  if (!map || !HW.hiding) return null;
  const room = (map.data.rooms || []).find((r) => r.kind === 'cafeteria');
  const a = map.anchor('caf_bench') || map.anchor('in_caf');
  if (!room || !a) return null;
  return HW.hiding.nearestSeat(a.x, a.y, { room: room.id, maxDist: 16 * 30 });
}

/** Marcus's hint after 40 s at the locked janitor's door (game time, while in the basement). */
function armHint(g) {
  if (hintGen === HW.scripts.gen) return;
  hintGen = HW.scripts.gen;
  const t0 = Number(HW.state.flags.ch3_jan_tried) || HW.state.playtime;
  g.parallel(async (pg) => {
    await HW.game.until(() => !pg.alive || HW.state.flags.ch3_jan_key || (
      HW.state.playtime - t0 >= 40 && HW.map?.id === 'basement' && HW.game.mode === 'play' && !HW.scripts.blocking));
    if (!pg.alive || HW.state.flags.ch3_jan_key) return;
    HW.scripts.run('ch3.ledge_hint');
  });
}
