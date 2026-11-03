import * as THREE from 'three';
import type { Enemy } from '../ai/enemy';
import { yawFromDir } from '../core/math';
import type { Chapter, Story } from './runner';
import { animateWarehouse, dressWarehouse, Npc, PEN, setPenOpen, stage } from './staging';
import { HARBOR } from '../world/level/harbor';

/**
 * CHAPTER ONE — MEAT MARKET. The KX warehouse on Dock 4, 12:50 AM.
 *
 * In through the side door; the crew's pen under its one bulb, five people in it, and the men
 * minding it talking about the sixth (the fight); Marco at the fence - Ivy isn't here, she went in a
 * black car, "spoken for" - and the Butcher walks in off the loading dock with Doyle's phone message
 * in his hand (his crew, then him); the key from round his neck, the pen open, the people out;
 * Ivy's phone ringing in the crate on the table, the draft she never sent, and the Butcher's
 * clipboard: lot six, reserved - Meridian Tower, the penthouse.
 *
 * The warehouse's doors: 0 the north loading door, 1 the south loading door, 2 east, 3 west.
 */
const NORTH = 0, SOUTH = 1, EAST = 2, WEST = 3;
const GATE = { x: (PEN.gateX0 + PEN.gateX1) / 2, z: PEN.z0 };
const yawTo = (a: { x: number; z: number }, b: { x: number; z: number }) => yawFromDir(b.x - a.x, b.z - a.z);
const V = (x: number, y: number, z: number) => new THREE.Vector3(x, y, z);

let clock = 0;
let butcher: Enemy | null = null;
const captives: Npc[] = [];
let marco: Npc | null = null;

/** The pen's five: where they are, how they're holding up. */
const PEN_PEOPLE: [string, number, number, number, string][] = [
  ['marco', 7.6, 9.35, Math.PI, 'st_kneel'],
  ['cap_suit', 6.6, 8.35, 2.5, 'st_kneel'],
  ['cap_party', 6.6, 10.5, Math.PI, 'st_sitwall'],
  ['cap_jeans', 8.25, 10.5, Math.PI, 'st_sitwall'],
  ['cap_kid', 9.3, 8.1, -2.4, 'st_cower'],
];

/** The Butcher, waiting out on the loading dock beyond the north door. */
function butcherAtDock(s: Story) {
  if (butcher && butcher.alive) return butcher;
  butcher = s.spawn('butcher', 0.3, -12.3, 0, { variant: 'butcher' });
  s.cast('THE BUTCHER', butcher);
  butcher.ghostWalls = true;
  return butcher;
}

export const CH1: Chapter = {
  id: 1,
  kick: 'CHAPTER ONE',
  title: 'MEAT MARKET',
  place: 'THE HARBOUR · DOCK 4',
  clock: '12:41 AM',
  map: 'harbor',
  outfit: 'leather',
  synopsis: 'Six heads on a truck at Dock 4. The Butcher counts them himself.',
  par: 640,
  dress: dressWarehouse,
  backdrop: { pos: [3.2, 1.1, 4.2], look: [7.8, 1.4, 9.4], pos2: [4.4, 1.2, 4.9], look2: [7.8, 1.5, 9.6], fov: 40, dur: 45 },
  next: { kick: 'CHAPTER TWO', title: 'RED LEDGER', line: 'The Butcher\'s black card opens the Lantern\'s gallery. The books are kept upstairs.' },
  setup(s) {
    const g = s.game;
    for (const [v, x, z, yaw, pose] of PEN_PEOPLE) {
      try {
        const n = new Npc(g, g.lib, v);
        n.spawn(x, z, yaw);
        g.addFighter(n);
        n.hold(pose, 0.01);
        captives.push(n);
        if (v === 'marco') {
          marco = n;
          s.cast('MARCO', n);
        }
      } catch (e) {
        console.warn('captive', v, e);
      }
    }
    const st = HARBOR.start;
    s.place(st.x, st.z, st.yaw);
    // things to find in the yard
    s.pickup('note', [-53.6, 0.02, 53.4], { id: 'c1-gatelog', title: 'The gate log, on a clipboard', text: 'KX FREIGHT · DOCK 4 · NIGHT GATE\n\n22:40  NORDFROST reefer IN (Butcher)\n23:12  2 x KX cars IN\n23:55  black Mercedes OUT - no plate\n         (V. says don\'t write it down)\n00:20  Doyle - no show?' });
    s.pickup('ammo', [-26.4, 0.02, 30.0]);
    s.pickup('photo', [-35.6, 0.02, -2.4], { id: 'c1-polaroid', title: 'A polaroid by the office door', text: 'The inside of a refrigerated truck, lit by a phone\'s flash. Mattresses on the floor. Six water bottles. A child\'s shoe.\n\nOn the back, in marker: LOT 4-9 TUES. CLEAN IT AFTER.' });
    // (Doyle's pistol, one round in it)
    g.player.specialLocked = false;
    g.player.specialCharges = 1;
  },
  tick(s, dt) {
    clock += dt;
    animateWarehouse(dt, clock);
    for (const n of captives) if (!n.gone && n.z > 12.4) n.vanish();
  },
  segments: [
    // ------------------------------------------------------------------ the yard
    {
      name: 'THE YARD',
      async play(s) {
        const g = s.game;
        const p = g.player;
        // the night shift: men walking the lanes, one up on the stacks, two at the gate
        const guards = [
          s.spawn('brawler', -50, 14.5, Math.PI / 2, { variant: 'brawler1', watch: true, patrol: [[-50, 14.5, 2.5], [-24, 14.5, 2.5]] }),
          s.spawn('club', -40, 30.8, Math.PI / 2, { watch: true, patrol: [[-40, 30.8, 2], [-8, 30.8, 3]] }),
          s.spawn('brawler', -35, -1.6, Math.PI, { variant: 'brawler3', watch: true, pose: 'st_smoke', vision: 11 }),
          s.spawn('knife', -14, 26.5, -Math.PI / 2, { watch: true, y: 5.18, vision: 16 }),
          s.spawn('brawler', -18.5, -3.5, 0, { variant: 'brawler0', watch: true, patrol: [[-18.5, -3.5, 3], [-18.5, 4.5, 3]] }),
          s.spawn('brawler', -55.5, 53.6, Math.PI, { variant: 'brawler4', watch: true, pose: 'st_crossed', vision: 10 }),
          s.spawn('brawler', -53.6, 47.6, 0.4, { variant: 'brawler2', watch: true, pose: 'st_phone', vision: 9 }),
        ];
        await s.scene(async () => {
          s.ui.card('CHAPTER ONE', 'MEAT MARKET', 'THE HARBOUR · DOCK 4', '12:41 AM');
          await s.wait(4.4);
          // over the fence: the yard in its rows, the cranes, the hall at the end of it
          s.shot({ pos: [-71, 3.8, 63], look: [-30, 2, 20], pos2: [-70, 3.4, 61.5], look2: [-28, 2.5, 18], fov: 44, dur: 7 });
          s.ui.cardHide();
          s.ui.fade(false, 1.8);
          await s.wait(3.0);
          s.ui.stamp('THE HARBOUR · DOCK 4', '12:41 AM');
          s.shot({ pos: [-66.5, 1.5, 53], look: [-57, 1.4, 55.6], fov: 34, dur: 5 });
          await s.wait(1.8);
          await s.say('SCARLET', 'Two on the gate.');
          s.closeUp(p, { side: 1, fov: 30, dist: 1.3, dur: 5 });
          await s.wait(0.4);
          await s.say('SCARLET', 'Let\'s not knock.');
        });
        s.objective('DOCK 4', 'Inside the fence, unseen — the hall at the far end of the yard');
        // the way in: the dumpster by the crushed bit of fence
        await s.tutor(['SPACE'], 'OVER THE FENCE', 'The wire\'s down where the container hit it: up the dumpster, over', () => (p.x > -59.6 ? 1 : 0), 1, undefined, [HARBOR.dumpster.x - 0.8, HARBOR.dumpster.z]);
        // the stealth lesson, once she's inside
        let spotted = false;
        s.when(() => guards.some((e) => e.alive && e.state !== 'idle' && !e.down), () => (spotted = true));
        void (async () => {
          await s.tutor(['C'], 'STAY LOW', 'Crouched and out of the light, they look straight past you. The eye over a man fills as he notices', () => (p.crouched ? 1 : 0), 1, () => spotted);
          await s.tutor(['F'], 'FROM BEHIND', 'Up behind one who hasn\'t seen you: F, and he goes down without a sound', s.since(() => p.stats.takedowns), 1, () => spotted || p.x > -24);
        })();
        await s.reach(HARBOR.westDoor.x - 0.6, HARBOR.westDoor.z, 2.0, 'DOCK 4');
        s.hideTutor();
        // (still a fight on out there: the hall can wait until it's done)
        const live = guards.filter((e) => e.alive && e.state !== 'idle');
        if (live.length) {
          s.objective('THEY SAW YOU', 'Put them down');
          await s.fight(live, { pressure: 2 });
        }
      },
    },
    // ------------------------------------------------------------------ Dock 4
    {
      name: 'DOCK 4',
      resume(s) {
        s.place(HARBOR.westDoor.x - 0.2, HARBOR.westDoor.z, Math.PI / 2);
      },
      async play(s) {
        const g = s.game;
        const p = g.player;
        // the men minding the pen
        const sal = s.spawn('brawler', 5.0, 5.45, yawTo({ x: 5.0, z: 5.45 }, { x: 7.8, z: 9.0 }), { variant: 'brawler1', pose: 'st_smoke', alertR: 6.5 });
        const teo = s.spawn('brawler', 10.6, 5.7, yawTo({ x: 10.6, z: 5.7 }, { x: 5.0, z: 5.45 }), { variant: 'brawler3', pose: 'st_crossed', alertR: 6.5 });
        s.cast('SAL', sal);
        s.cast('TEO', teo);
        const nik = s.spawn('brawler', 3.25, 6.95, yawTo({ x: 3.25, z: 6.95 }, stage.pen?.table ?? { x: 4, z: 6.3 }), { variant: 'brawler0', pose: 'st_phone', alertR: 5.5 });
        const crew = [sal, teo, nik];
        let alerted = false;
        const wake = () => {
          if (alerted) return;
          alerted = true;
          for (const e of crew) e.alert(Math.random() * 0.4);
          s.bark('SAL', 'Who the hell—?');
          s.enter('knife', NORTH, 0);
          s.enter('club', NORTH, 1);
        };
        for (const e of crew) e.onAlert = wake;
        await s.scene(async () => {
          // high in the rafters: the hall, the rain on the roof, the pen under its bulb
          s.shot({ pos: [-4.5, 4.6, -9.6], look: [7.6, 1.2, 9.0], pos2: [-3.5, 4.45, -8.5], look2: [7.7, 1.25, 9.0], fov: 44, dur: 7 });
          await s.wait(4.2);
          // in through the side door
          s.shot({ pos: [-9.3, 1.45, -3.1], look: [-13, 1.35, 0.1], look2: [-11.0, 1.4, 0.4], fov: 40, dur: 5 });
          p.ghostWalls = true;
          await s.walk(-10.4, 0.45, { speed: 1.35, face: yawTo({ x: -10.4, z: 0.45 }, { x: 7.8, z: 9.0 }) });
          p.ghostWalls = false;
          s.ui.stamp('KX WAREHOUSE · DOCK 4', '12:50 AM');
          s.shot({ pos: [-11.6, 1.66, -0.4], look: [7.8, 1.25, 8.6], pos2: [-11.4, 1.66, -0.3], fov: 26, dur: 5 });
          await s.wait(1.4);
          await s.say('SCARLET', 'Ivy...');
        });
        s.objective('THE PEN', 'Get to the people in the cage');
        s.ui.marker(V(GATE.x, 1.4, GATE.z - 0.5), 'THE PEN');
        // what they're saying as she comes up the hall (if she lets them talk)
        void (async () => {
          await s.until(() => alerted || p.x > -4.5, false);
          const lines: [string, string][] = [
            ['TEO', 'Five in the cage. Six on the sheet.'],
            ['SAL', 'Sixth went in the black car. Personal pickup.'],
            ['TEO', 'Personal? Whose?'],
            ['SAL', 'You don\'t ask whose.'],
          ];
          for (const [who, line] of lines) {
            if (alerted) return;
            s.bark(who, line, 2.4);
            await s.wait(2.6, false);
          }
        })();
        await s.until(() => alerted || crew.some((e) => e.state !== 'idle'), false);
        wake();
        s.ui.marker(null);
        s.objective('THE MEN MINDING THE PEN');
        await s.fight(crew, { pressure: 4 });
      },
    },
    // ------------------------------------------------------------------ the pen
    {
      name: 'THE PEN',
      resume(s) {
        s.place(2.5, 3.0, yawTo({ x: 2.5, z: 3.0 }, GATE));
      },
      async play(s) {
        const g = s.game;
        const p = g.player;
        s.objective('THE PEN');
        await s.reach(GATE.x, GATE.z - 0.75, 1.3, 'THE PEN');
        const crew: Enemy[] = [];
        await s.scene(async () => {
          await s.walk(GATE.x, GATE.z - 0.55, { face: 0 });
          s.shot({ pos: [GATE.x - 0.55, 1.62, GATE.z - 1.6], look: [7.6, 0.9, 9.4], fov: 34, dur: 5 });
          await s.say('SCARLET', 'Ivy? IVY!');
          // he knows her: he gets up and comes to the wire
          if (marco) {
            marco.hold(null, 0.5);
            marco.walk([[GATE.x + 0.05, GATE.z + 0.55]], 1.1);
            marco.pose = 'st_bound';
          }
          await s.wait(1.6);
          if (marco) marco.faceYaw = Math.PI;
          s.shot({ pos: [GATE.x - 0.5, 1.6, GATE.z - 1.05], look: [GATE.x + 0.05, 1.55, GATE.z + 0.55], pos2: [GATE.x - 0.45, 1.6, GATE.z - 0.95], fov: 30, dur: 6 });
          await s.say('MARCO', '...Scarlet?');
          s.shot({ pos: [GATE.x + 0.45, 1.58, GATE.z + 1.15], look: [GATE.x, 1.6, GATE.z - 0.55], fov: 30, dur: 5 });
          await s.say('SCARLET', 'Marco. Where is she?');
          s.shot({ pos: [GATE.x - 0.5, 1.6, GATE.z - 1.05], look: [GATE.x + 0.05, 1.55, GATE.z + 0.55], fov: 28, dur: 12 });
          await s.say('MARCO', 'Not here. They split us up at the club.');
          await s.say('MARCO', 'Five of us in the truck. Ivy went in a car. A black car, on her own.');
          await s.say('SCARLET', 'Whose car?');
          await s.say('MARCO', 'The Butcher said she was <em>spoken for</em>.');
          s.closeUp(p, { side: -1, fov: 30, dist: 1.2, dur: 4 });
          await s.say('SCARLET', 'Hold on. I\'m getting you out.');
          // the loading dock: an engine, a door going up, him
          g.audio.thump(0.9, V(0, 1, -11));
          g.audio.play('metal_hit', { pos: V(0, 2, -11), vol: 0.6, pitch: 0.45 });
          const b = butcherAtDock(s);
          b.x = 0.3;
          b.z = -13.9;
          b.anim.initAt(b.x, b.z, 0);
          b.idleTo = { x: 0.3, z: -9.7 };
          b.idleFace = yawTo({ x: 0.3, z: -9.7 }, p);
          const c1 = s.spawn('brawler', -1.6, -13.4, 0, { variant: 'brawler4' });
          const c2 = s.spawn('knife', 2.0, -13.6, 0, { variant: 'knife1' });
          for (const [e, x, z] of [[c1, -1.9, -8.5], [c2, 2.2, -8.3]] as [Enemy, number, number][]) {
            e.ghostWalls = true;
            e.idleTo = { x, z };
            e.idleFace = yawTo({ x, z }, p);
            crew.push(e);
          }
          await s.say('MARCO', 'He\'s here—', 1.2);
          // she turns, and comes away from the wire to meet it
          void s.walk(GATE.x - 1.6, GATE.z - 3.6, { speed: 1.3, face: yawTo({ x: GATE.x - 1.6, z: GATE.z - 3.6 }, { x: 0.3, z: -9.7 }) });
          s.shot({ pos: [-2.6, 0.75, -3.8], look: [0.3, 1.8, -10.6], pos2: [-2.4, 0.78, -4.3], fov: 38, dur: 6 });
          await s.wait(2.4);
          await s.until(() => !b.idleTo, true, 5);
          for (const e of [b, c1, c2]) e.ghostWalls = false;
          s.closeUp(b, { side: -1, fov: 30, dist: 1.6, dur: 7 });
          await s.wait(0.3);
          await s.say('THE BUTCHER', '<em>“On my way,”</em> she says.');
          await s.say('THE BUTCHER', 'Doyle never could keep his phone in his pocket.');
          s.overShoulder(b, p, { side: 1, dist: 1.2, height: 2.15, fov: 34, dur: 6 });
          await s.say('THE BUTCHER', 'Boys. Put her in with the others.');
          await s.say('THE BUTCHER', 'Mind the face. Faces sell.');
          // he goes back out onto the dock to watch
          b.ghostWalls = true;
          b.idleTo = { x: 0.3, z: -12.4 };
          b.idleFace = 0;
          p.sceneStyle = 'fight';
          p.sceneGuard = 1;
          s.shot({ pos: [GATE.x + 1.6, 1.5, GATE.z - 2.6], look: [0.3, 1.2, -8.4], fov: 40, dur: 3 });
          await s.wait(1.4);
        });
        p.sceneStyle = 'relaxed';
        p.sceneGuard = 0.35;
        g.cam.yaw = s.behindYaw(yawTo(p, { x: 0, z: -8 }));
        s.objective('THE BUTCHER\'S CREW');
        // a second pair through the east door; the heavy and a runner when it thins out
        crew.push(s.enter('brawler', EAST, 0), s.enter('club', EAST, 1));
        const kills0 = p.stats.kills;
        s.when(() => s.encounter.filter((e) => e.alive).length <= 2, () => {
          s.enter('bruiser', NORTH, 0);
          s.enter('agile', WEST, 0);
          s.bark('THE BUTCHER', 'Tank! Fold her up!');
        });
        s.when(() => p.stats.kills >= kills0 + 2, () => s.bark('THE BUTCHER', 'Mind the merchandise!'));
        await s.fight(crew, { pressure: 6 });
      },
    },
    // ------------------------------------------------------------------ the Butcher
    {
      name: 'THE BUTCHER',
      resume(s) {
        s.place(0.8, -1.5, Math.PI);
        butcherAtDock(s);
      },
      async play(s) {
        const g = s.game;
        const p = g.player;
        const b = butcherAtDock(s);
        s.objective(null);
        await s.scene(async () => {
          s.face({ x: 0.3, z: -8 });
          b.ghostWalls = true;
          b.idleTo = { x: 0.3, z: -7.2 };
          b.idleFace = yawTo({ x: 0.3, z: -7.2 }, p);
          s.shot({ pos: [1.6, 0.6, -4.2], look: [0.3, 1.9, -9.5], look2: [0.3, 2.1, -7.6], fov: 36, dur: 5 });
          await s.wait(2.6);
          await s.until(() => !b.idleTo, true, 5);
          b.ghostWalls = false;
          s.closeUp(b, { side: 1, fov: 28, dist: 1.6, dur: 9 });
          await s.say('THE BUTCHER', 'You want to know where your sister is?');
          await s.say('THE BUTCHER', 'Upstairs. With the money.');
          await s.say('THE BUTCHER', 'You\'re down here. With the meat.');
          p.sceneStyle = 'fight';
          p.sceneGuard = 1;
          s.overShoulder(b, p, { side: -1, dist: 1.2, height: 2.15, fov: 32, dur: 3 });
          await s.say('SCARLET', 'Then come and cut.');
        });
        p.sceneStyle = 'relaxed';
        p.sceneGuard = 0.35;
        g.cam.yaw = s.behindYaw(yawTo(p, b));
        s.boss(b, { name: 'THE BUTCHER', sub: 'THE MEAT MARKET', kick: 'BOSS FIGHT' });
        s.objective('THE BUTCHER', 'The key\'s round his neck');
        s.onBossPhase = (e, phase) => {
          if (e !== b || phase !== 2) return false;
          s.bark('THE BUTCHER', 'BOYS! Get her on the hook!');
          s.enter('brawler', WEST, 0);
          s.enter('brawler', EAST, 0);
          return true;
        };
        s.when(() => b.alive && b.hp < b.maxHp * 0.25, () => s.bark('THE BUTCHER', 'Hold STILL, damn you!'));
        s.when(() => b.alive && b.state === 'stunned', () => s.bark('SCARLET', 'Twenty years cutting meat. Ever had it cut back?'));
        await s.fight([b], { pressure: 5 });
        s.onBossPhase = null;
        s.flags.butcher = { x: b.x, z: b.z };
      },
    },
    // ------------------------------------------------------------------ spoken for
    {
      name: 'SPOKEN FOR',
      resume(s) {
        const d = (s.flags.butcher as { x: number; z: number } | undefined) ?? { x: 0.3, z: -6 };
        s.place(d.x + 1.5, d.z + 1.6, yawTo({ x: d.x + 1.5, z: d.z + 1.6 }, d));
      },
      async play(s) {
        const g = s.game;
        const p = g.player;
        s.objective(null);
        const d = (s.flags.butcher as { x: number; z: number } | undefined) ?? { x: 0.3, z: -6 };
        await s.scene(async () => {
          // the key from round his neck
          const at = { x: d.x + 0.8, z: d.z + 0.6 };
          await s.walk(at.x, at.z, { face: yawTo(at, d) });
          s.pose('st_crouch');
          s.shot({ pos: [at.x + 1.2, 1.1, at.z + 1.25], look: [d.x + 0.2, 0.4, d.z + 0.1], fov: 34, dur: 4 });
          await s.wait(1.1);
          g.audio.play('metal_hit', { pos: V(d.x, 0.3, d.z), vol: 0.25, pitch: 2.6 });
          s.ui.item('TAKEN', 'A PADLOCK KEY', 'On a bootlace, round his neck', 3.5);
          await s.wait(1.4);
          s.ui.item('TAKEN', 'A BLACK CARD', 'THE LANTERN · GALLERY — no name on it', 3.5);
          await s.wait(1.2);
          s.pose(null, 0.4);
          // the pen
          await s.walk(GATE.x + 0.2, GATE.z - 0.55, { face: 0, speed: 1.8 });
          s.shot({ pos: [GATE.x - 1.6, 1.55, GATE.z - 1.9], look: [GATE.x + 0.6, 1.1, GATE.z], fov: 36, dur: 6 });
          s.pose('st_phone', 0.35);
          await s.wait(0.9);
          g.audio.play('metal_hit', { pos: V(GATE.x + 0.4, 1.05, GATE.z), vol: 0.45, pitch: 1.8 });
          await s.wait(0.35);
          setPenOpen(g.arena, true);
          g.audio.play('metal_hit', { pos: V(GATE.x, 1.4, GATE.z), vol: 0.5, pitch: 0.9 });
          s.pose(null, 0.4);
          await s.walk(GATE.x - 1.3, GATE.z - 1.2, { face: yawTo({ x: GATE.x - 1.3, z: GATE.z - 1.2 }, { x: GATE.x, z: GATE.z + 1 }) });
          // they come out, and go - out of the south doors, into the rain
          captives.forEach((n, i) => {
            if (n.gone || n === marco) return;
            void s.wait(0.5 + i * 0.7, false).then(() => {
              n.hold(null, 0.6);
              n.pose = null;
              n.walk([[GATE.x, GATE.z + 0.6], [GATE.x - 0.5, GATE.z - 0.9], [2.6, 9.0], [0.2, 10.4], [0.0, 13.0]], 1.9);
            });
          });
          s.shot({ pos: [3.3, 1.5, 4.0], look: [GATE.x, 1.2, GATE.z + 0.5], fov: 40, dur: 6 });
          await s.wait(3.2);
          if (marco) {
            marco.hold(null, 0.5);
            marco.pose = null;
            marco.walk([[GATE.x, GATE.z + 0.6], [GATE.x - 0.6, GATE.z - 0.9]], 1.4);
          }
          await s.wait(2.0);
          if (marco) marco.faceYaw = yawTo(marco, p);
          s.overShoulder(p, marco ?? { x: GATE.x - 0.6, z: GATE.z - 0.9 }, { side: 1, dist: 1.0, fov: 30, dur: 10 });
          await s.wait(0.6);
          await s.say('MARCO', 'I owe you.');
          await s.say('MARCO', 'They took everybody\'s phones. They\'re in the box on the table.');
          await s.say('SCARLET', 'Go. Don\'t stop till it\'s light.');
          if (marco) marco.walk([[2.6, 9.0], [0.2, 10.4], [0.0, 13.0]], 1.9);
          await s.wait(1.4);
          // she calls her sister: in the crate on the table, a screen lights up
          s.pose('st_phone', 0.4);
          s.shot({ pos: [p.x - 0.9, 1.62, p.z + 0.8], look: [p.x + 0.1, 1.3, p.z], fov: 30, dur: 4 });
          s.ui.phoneCall('Ivy', 'I', 'calling…', '1:24');
          await s.wait(1.6);
          if (stage.pen) stage.pen.phoneT = 30;
          const T = stage.pen?.table ?? V(4.15, 0, 6.35);
          g.audio.buzz(0.8);
          await s.wait(0.9);
          s.ui.phoneClose();
          s.pose(null, 0.4);
          s.face(T);
          s.shot({ pos: [T.x - 1.5, 1.3, T.z - 1.6], look: [T.x - 0.2, 0.95, T.z], pos2: [T.x - 1.2, 1.2, T.z - 1.3], fov: 32, dur: 4 });
          g.audio.buzz(0.8);
          await s.wait(1.4);
          g.audio.buzz(0.8);
          await s.wait(1.6);
        });
        // to the table
        const T = stage.pen?.table ?? V(4.15, 0, 6.35);
        s.objective('THE RINGING PHONE');
        const ring = setInterval(() => g.audio.buzz(0.7), 1600);
        await s.reach(T.x - 0.1, T.z - 0.75, 1.0, 'PHONE');
        clearInterval(ring);
        if (stage.pen) stage.pen.phoneT = 0;
        s.objective(null);
        await s.scene(async () => {
          await s.walk(T.x - 0.15, T.z - 0.68, { face: 0 });
          s.pose('st_phone', 0.4);
          s.shot({ pos: [T.x - 0.75, 1.68, T.z - 1.5], look: [T.x - 0.1, 1.15, T.z - 0.5], fov: 30, dur: 14 });
          await s.wait(0.8);
          // her phone: the thread with her sister, and what she never got to send
          await s.phone({ name: 'Scar', initial: 'S', sub: 'sister', clock: '1:25' }, [
            { dir: 'out', time: 'Today 11:03 PM', text: 'back door. come get me', status: 'Delivered', wait: 1.4 },
            { dir: 'in', time: '11:04 PM', text: 'on my way. stay where people can see you', wait: 1.4 },
            { dir: 'in', time: '11:46 PM', text: 'ivy?', wait: 1.4 },
            { dir: 'in', time: '1:24 AM', text: 'Missed call', wait: 1.8 },
            { dir: 'out', time: 'Draft', text: 'they put me in a car. a woman in a green hood', status: 'Not delivered', fail: true, wait: 2.6, typing: 1.2 },
            { dir: 'out', text: 'she says the boss picks first. scar im scared', status: 'Not delivered', fail: true, wait: 3.4, typing: 1.2 },
          ]);
          s.ui.phoneClose();
          await s.wait(0.5);
          await s.say('SCARLET', '<em>The boss picks first.</em>', 2.4);
          // the Butcher's clipboard
          s.shot({ pos: [T.x + 0.55, 1.38, T.z - 0.6], look: [T.x + 0.32, 0.77, T.z], fov: 28, dur: 6 });
          await s.wait(1.6);
          await s.say('SCARLET', 'Lot six. Reserved. <em>V.</em>');
          await s.say('SCARLET', 'Meridian Tower. The penthouse.');
          s.pose(null, 0.5);
          // out the way he came in
          s.shot({ pos: [2.5, 0.7, 1.0], look: [0.3, 1.6, -10.5], fov: 40, dur: 8 });
          void s.walk(0.3, -9.6, { speed: 1.55 });
          await s.wait(4.4);
          s.ui.fade(true, 1.8);
          await s.wait(2.2);
        });
      },
    },
  ],
};
