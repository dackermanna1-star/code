import * as THREE from 'three';
import type { Enemy } from '../ai/enemy';
import { yawFromDir } from '../core/math';
import { outfitVariant } from '../core/settings';
import type { Chapter, Story } from './runner';
import type { Npc } from './staging';
import { PALEWATER } from '../world/level/palewater';

/**
 * CHAPTER SIX — NIGHT SHIFT. Palewater at first light, 5:16 AM. Viper's car in pieces against the
 * gate; the trucks already in, backed up to the dock with their doors open. She knows this place:
 * she walked its fence every night for two years. Over the patched bit of fence by the car park,
 * into the guards' hut - and her old locker, her name still on it, her uniform still inside. In
 * that, nobody looks twice at her: through the forecourt, through the front doors, past reception
 * (Owens, who used to bring her coffee), down the restricted corridor to the main lab - and the
 * Warden, who signed her last paycheque, with the card that opens the way down.
 */
const yawTo = (a: { x: number; z: number }, b: { x: number; z: number }) => yawFromDir(b.x - a.x, b.z - a.z);
const V = (x: number, y: number, z: number) => new THREE.Vector3(x, y, z);
const P = PALEWATER;
const GUARDS = ['labguard0', 'labguard1', 'labguard2'];

let owens: Npc | null = null;

/** In uniform, where a guard may go: everywhere but the restricted corridor and the labs. */
function restricted(x: number, y: number, z: number) {
  void y;
  return z < P.corridor.z1 - 0.1 && x > -15 && x < 19;
}

export const CH6: Chapter = {
  id: 6,
  kick: 'CHAPTER SIX',
  title: 'NIGHT SHIFT',
  place: 'PALEWATER BIOTECH',
  clock: '5:16 AM',
  map: 'palewater',
  outfit: 'denim',
  synopsis: 'She knows Palewater\'s doors. She used to guard them.',
  par: 600,
  backdrop: { pos: [0, 2.2, 8], look: [0, 1.6, -4], pos2: [0.6, 2.1, 7.4], look2: [0, 1.7, -4], fov: 46, dur: 45 },
  next: { kick: 'CHAPTER SEVEN', title: 'SUBJECT ZERO', line: 'Under the main lab: the tanks. Her sister is in one of them.' },
  setup(s) {
    const g = s.game;
    owens = null;
    s.givePistol(1);
    const st = P.start;
    s.place(st.x, st.z, st.yaw);
    // (in uniform from the locker on: the checkpoint at the locker is before she's opened it)
    if (s.cp >= 2) g.player.changeOutfit(outfitVariant('guard'));
    if (s.cp >= 2) g.restricted = restricted;
    // reception: Owens, at his desk
    owens = s.extra('civ_m04', P.desk.x + 0.4, P.desk.z - 1.0, 0, { pose: 'st_phone' });
    s.cast('OWENS', owens);
    // things to find
    s.pickup('note', [P.hut.x0 + 2.6, 0.77, P.hut.z0 + 5.6], { id: 'c6-rota', title: 'The night rota, on the hut\'s table', text: 'PALEWATER SECURITY — NIGHT\n\nGATE: Duarte, Kim\nLOBBY: Owens\nLEVEL 3: the Warden\'s own people only.\n\nDELIVERY 05:10 — DOCK 2. Paperwork to the Warden. DO NOT open the trucks.' });
    s.pickup('photo', [P.locker.x - 0.4, 1.0, P.locker.z], { id: 'c6-photo', title: 'Taped inside her old locker', text: 'A photo she forgot she\'d left: her and Ivy on a fairground ride, both screaming, a year before their mother died.\n\nOn the back in her own handwriting: <em>whatever it takes, kid.</em>' });
    s.pickup('medkit', [P.secOffice.x1 - 1.6, 0.8, P.secOffice.z0 + 2]);
    s.pickup('ammo', [-9.6, 0.02, 13.4]);
    s.pickup('note', [21.4, 0.9, 2.2], { id: 'c6-dock', title: 'A delivery note, clipped to the dock door', text: 'NORDFROST · DOCK 2 · 05:10\n\nLOTS 1–6 RECEIVED (live)\nLot 6: PRIORITY — B3 direct. Mr V. to inspect Sunday.\n\nSigned for: <em>the Warden</em>\n\nAt the bottom, in a different pen: <em>drivers do not open the boxes. drivers do not ask.</em>' });
  },
  segments: [
    // ------------------------------------------------------------------ the gate
    {
      name: 'THE GATE',
      async play(s) {
        const g = s.game;
        const p = g.player;
        const gate = [
          s.spawn('brawler', 24.6, 60.4, 0, { variant: GUARDS[0], watch: true, vision: 10 }),
          s.spawn('brawler', 21.2, 60.8, 0.3, { variant: GUARDS[1], watch: true, vision: 10, pose: 'st_phone' }),
          s.spawn('brawler', 30.0, 57.0, 0, { variant: GUARDS[2], watch: true, pose: 'st_crossed', vision: 9 }),
        ];
        await s.scene(async () => {
          s.ui.card('CHAPTER SIX', 'NIGHT SHIFT', 'PALEWATER BIOTECH', '5:16 AM');
          await s.wait(4.4);
          // the wreck against the gate; the sky going grey; her, getting out of it
          s.shot({ pos: [27.4, 1.3, 69.4], look: [23, 1.0, 63.4], pos2: [27.0, 1.4, 68.6], fov: 40, dur: 7 });
          s.ui.cardHide();
          s.ui.fade(false, 2.0);
          s.pose('st_crouch', 0.01);
          await s.wait(2.6);
          s.pose(null, 0.8);
          await s.wait(1.0);
          s.ui.stamp('PALEWATER BIOTECH', '5:16 AM');
          await s.say('SCARLET', '...Still breathing. Good.', 2.2);
          // through the fence: the trucks at the dock, their doors open
          // (west of the gatehouse and the hut, down the forecourt to the dock)
          s.shot({ pos: [21.0, 1.7, 65.4], look: [22.4, 1.5, 12.0], fov: 30, dur: 6 });
          await s.wait(2.4);
          await s.say('SCARLET', 'They\'re already in.', 1.8);
          s.bark('GUARD', 'Jesus. Is the driver still in there?', 2.6, gate[0]);
          await s.wait(1.6);
        });
        s.objective('INSIDE THE FENCE', 'Not through the gate — the low bit by the car park, west');
        const Cl = P.climb;
        const cx = (Cl.x0 + Cl.x1) / 2;
        // (to the patched bit first, along the outside; then over it)
        const route = () => s.markRoute([[cx, Cl.z + 1.6], [cx, Cl.z - 2.5]], 'THE FENCE', 1.6);
        let stopRoute = route();
        let spotted = false;
        s.when(() => gate.some((e) => e.alive && e.state !== 'idle' && !e.down), () => (spotted = true));
        // (the two at the gate go and look at the wreck)
        void s.wait(3, false).then(() => {
          for (const [i, e] of gate.slice(0, 2).entries()) {
            if (e.state !== 'idle') continue;
            e.idleTo = { x: P.gate.x0 + 2 + i * 3, z: P.gate.z - 1.0 };
            e.idleFace = 0;
          }
        });
        void s.tutor(['SPACE'], 'OVER', 'The patched section: SPACE at the fence', () => (p.z < Cl.z - 0.5 ? 1 : 0), 1, () => p.z < Cl.z - 0.5);
        await s.until(() => p.z < P.gate.z - 0.6 || spotted, false);
        stopRoute();
        if (spotted) {
          s.objective('THEY SAW YOU', 'Put them down');
          await s.fight(gate.filter((e) => e.alive), { pressure: 3 });
          if (p.z > P.gate.z - 0.6) {
            s.objective('INSIDE THE FENCE', 'Over the low section, west');
            stopRoute = route();
            await s.until(() => p.z < P.gate.z - 0.6, false);
            stopRoute();
          }
        }
        s.hideTutor();
      },
    },
    // ------------------------------------------------------------------ her old locker
    {
      name: 'HER OLD LOCKER',
      resume(s) {
        s.place((P.climb.x0 + P.climb.x1) / 2, P.climb.z - 2, Math.PI);
      },
      async play(s) {
        const g = s.game;
        const p = g.player;
        s.objective('THE GUARDS\' HUT', 'If they never cleared out her locker...');
        const H = P.hut;
        let opened = false;
        s.interact([P.locker.x - 0.3, 1.2, P.locker.z], 'OPEN · S. REYES', () => (opened = true), { r: 1.4 });
        s.ui.marker(V(P.locker.x - 0.5, 1.6, P.locker.z), 'HER LOCKER');
        await s.until(() => opened, false);
        s.ui.marker(null);
        await s.scene(async () => {
          await s.walk(P.locker.x - 1.1, P.locker.z, { face: Math.PI / 2, speed: 1.3 });
          s.shot({ pos: [P.locker.x - 2.6, 1.6, P.locker.z + 1.6], look: [P.locker.x - 0.4, 1.2, P.locker.z], fov: 34, dur: 6 });
          g.audio.play('metal_hit', { pos: V(P.locker.x, 1.2, P.locker.z), vol: 0.3, pitch: 1.8 });
          await s.wait(1.2);
          await s.say('SCARLET', 'Two months. They didn\'t even take my name off it.', 3);
          await s.say('SCARLET', 'Navy. Size small. Badge still clipped on.', 2.6);
          s.ui.fade(true, 0.7);
          await s.wait(0.9);
          p.changeOutfit(outfitVariant('guard'));
          g.audio.play('whoosh_light', { pos: V(p.x, 1, p.z), vol: 0.3, pitch: 0.8 });
          await s.wait(0.5);
          s.shot({ pos: [H.x0 + 1.6, 1.7, H.z0 + 4.2], look: [P.locker.x - 1.1, 1.3, P.locker.z], fov: 36, dur: 6 });
          s.ui.fade(false, 0.9);
          await s.wait(1.2);
          await s.say('SCARLET', 'Night shift. Here we go.', 2.0);
        });
        g.restricted = restricted;
        s.ui.item('THE UNIFORM', 'PALEWATER SECURITY · NIGHT SHIFT', 'Walk like you belong: they won\'t look twice — except where nobody\'s allowed', 4.5);
      },
    },
    // ------------------------------------------------------------------ the dock: the trucks
    {
      name: 'DOCK 2',
      resume(s) {
        s.game.player.changeOutfit(outfitVariant('guard'));
        s.game.restricted = restricted;
        s.place(P.hut.x0 - 1.2, P.hut.z0 + 4, Math.PI);
      },
      async play(s) {
        const g = s.game;
        const p = g.player;
        // the drivers by their cabs, a smoke each; a guard on the dock's edge, bored
        const d1 = s.extra('civ_m01', 25.6, 15.6, -Math.PI / 2, { pose: 'st_smoke', chat: 0.4 });
        const d2 = s.extra('civ_m18', 37.4, 6.2, -Math.PI / 2 - 0.4, { pose: 'st_crossed', chat: 0.4 });
        s.cast('DRIVER', d1 ?? d2);
        const dock = s.spawn('brawler', 22.4, 15.4, Math.PI / 2, { variant: GUARDS[2], watch: true, pose: 'st_crossed', vision: 9 });
        s.objective('DOCK 2', 'The trucks. If she\'s still in one of them...');
        // round the back of the second one: its doors open on the dark
        await s.reach(22.6, 11.4, 1.6, 'THE TRUCKS');
        await s.scene(async () => {
          await s.walk(22.4, 11.5, { face: Math.PI / 2, speed: 1.2 });
          s.shot({ pos: [21.0, 1.7, 13.4], look: [24.6, 1.4, 11.4], pos2: [21.2, 1.75, 13.0], fov: 38, dur: 7 });
          await s.wait(1.4);
          // empty: chains bolted to the floor, a blanket, a red hair tie
          await s.say('SCARLET', '...Empty.', 1.4);
          s.closeUp(p, { side: -1, fov: 30, dist: 1.2, dur: 5 });
          await s.wait(0.6);
          s.ui.item('FOUND', 'A RED HAIR TIE', 'On the truck\'s floor, by the chains. Ivy\'s — she\'s worn one on her wrist since she was twelve', 3.8);
          await s.wait(2.4);
          await s.say('SCARLET', 'She was in here.', 1.8);
          // the driver, wandering over
          const D = d1;
          if (D) {
            D.hold(null, 0.3);
            D.walk([[23.2, 13.8]], 1.4, () => {
              D.faceYaw = Math.atan2(p.x - D.x, p.z - D.z);
              D.lookAt = p;
            });
          }
          s.shot({ pos: [21.4, 1.65, 10.2], look: [23.2, 1.6, 13.8], fov: 34, dur: 8 });
          await s.wait(1.6);
          await s.say('DRIVER', 'Nobody told you? They had them off the trucks the minute we backed up. All six.', 3.6);
          await s.say('DRIVER', 'The Warden came down for the redhead himself. Walked her in by the arm like she was his.', 3.8);
          s.face({ x: 23.2, z: 13.8 });
          s.closeUp(p, { side: 1, fov: 28, dist: 1.15, dur: 4 });
          await s.say('SCARLET', 'In where?', 1.4);
          await s.say('DRIVER', 'Front doors. I don\'t ask past the front doors.', 2.8);
          if (D) D.lookAt = null;
          await s.wait(0.4);
        });
        if (d1) d1.walk([[25.6, 15.6]], 1.3, () => d1.hold('st_smoke', 0.4));
        void dock;
      },
    },
    // ------------------------------------------------------------------ the front door, reception
    {
      name: 'NIGHT SHIFT',
      resume(s) {
        s.game.player.changeOutfit(outfitVariant('guard'));
        s.game.restricted = restricted;
        s.place(21.6, 13.8, -Math.PI / 2);
      },
      async play(s) {
        const g = s.game;
        const p = g.player;
        // the morning: guards about the forecourt, a tech having a smoke - none of them looking twice
        const yard = [
          s.spawn('brawler', 6, 40, 0, { variant: GUARDS[0], watch: true, patrol: [[6, 40, 3], [-14, 40, 3]], vision: 11 }),
          s.spawn('knife', 14, 34, -0.5, { variant: 'labtech0', watch: true, pose: 'st_smoke', vision: 8 }),
        ];
        s.when(() => Math.hypot(p.x - yard[0].x, p.z - yard[0].z) < 4 && yard[0].state === 'idle', () => s.bark('GUARD', 'Morning. You\'re early.', 2, yard[0]));
        s.when(() => Math.hypot(p.x - yard[1].x, p.z - yard[1].z) < 4 && yard[1].state === 'idle', () => s.bark('GUARD', 'Don\'t tell the Warden I\'m out here.', 2.4, yard[1]));
        s.objective('THE MAIN BUILDING', 'In through the front doors — walk, don\'t run');
        await s.reach(P.frontDoor.x, P.frontDoor.z - 2.0, 1.8, 'FRONT DOORS');
        const O = owens;
        await s.scene(async () => {
          await s.walk(P.desk.x - 1.6, P.desk.z + 1.4, { speed: 1.3, face: yawTo({ x: P.desk.x - 1.6, z: P.desk.z + 1.4 }, P.desk) });
          if (O) {
            O.hold(null, 0.4);
            O.lookAt = p;
            O.faceYaw = yawTo(O, p);
          }
          s.overShoulder(p, O ?? P.desk, { side: 1, dist: 1.1, fov: 32, dur: 5 });
          await s.say('OWENS', 'Morning— ...Scarlet?');
          s.closeUp(p, { side: -1, fov: 30, dist: 1.2, dur: 4 });
          await s.say('SCARLET', 'Hi, Owens.');
          if (O) s.closeUp(O, { side: 1, fov: 28, dist: 1.3, dur: 10 });
          await s.say('OWENS', 'You quit. Two months ago. You said you were never coming back here.');
          await s.say('OWENS', 'And you\'re bleeding on my floor.');
          s.overShoulder(O ?? P.desk, p, { side: -1, dist: 1.0, fov: 30, dur: 6 });
          await s.say('SCARLET', 'They brought my sister in this morning. In a truck.');
          if (O) s.closeUp(O, { side: -1, fov: 28, dist: 1.25, dur: 12 });
          await s.wait(0.8);
          await s.say('OWENS', '...A redhead. The Warden took her down himself. B3.');
          await s.say('OWENS', 'Nobody goes down to B3 without his card. He\'s in the main lab. Through the corridor.');
          await s.say('OWENS', 'Scarlet — I didn\'t see you. I didn\'t see anything.');
          s.closeUp(p, { side: 1, fov: 28, dist: 1.15, dur: 3 });
          await s.say('SCARLET', 'You never did. That\'s why I liked you.', 2.6);
          if (O) {
            O.lookAt = null;
            O.hold('st_phone', 0.5);
          }
        });
        s.objective('THE MAIN LAB', 'The restricted corridor — a guard has no business in there');
        s.ui.marker(V(0, 1.2, P.corridor.z0 + 1), 'CORRIDOR');
        await s.until(() => p.z < P.corridor.z1 - 0.3, false);
        s.ui.marker(null);
      },
    },
    // ------------------------------------------------------------------ the corridor, the Warden
    {
      name: 'THE WARDEN',
      resume(s) {
        s.game.player.changeOutfit(outfitVariant('guard'));
        s.game.restricted = restricted;
        s.place(0, P.corridor.z1 + 1, Math.PI);
      },
      async play(s) {
        const g = s.game;
        const p = g.player;
        // two of his own in the corridor
        const cor = [
          s.spawn('club', -9, 13.4, Math.PI / 2, { variant: 'labbaton0', watch: true, patrol: [[-9, 13.4, 2], [-2, 13.4, 2]], vision: 9 }),
          s.spawn('brawler', 9.6, 13.4, -Math.PI / 2, { variant: GUARDS[1], watch: true, pose: 'st_crossed', vision: 9 }),
        ];
        let spotted = false;
        s.when(() => cor.some((e) => e.alive && e.state !== 'idle' && !e.down), () => {
          spotted = true;
          s.bark('GUARD', 'Hey — you\'re not cleared for this level!', 2.4);
        });
        s.objective('THE MAIN LAB', 'Through the corridor, into the lab');
        s.ui.marker(V(-7, 1.2, 9.4), 'MAIN LAB');
        await s.until(() => p.z < 10.6 || spotted, false);
        if (spotted && p.z >= 10.6) {
          s.ui.marker(null);
          await s.fight(cor.filter((e) => e.alive), { pressure: 3 });
          s.ui.marker(V(-7, 1.2, 9.4), 'MAIN LAB');
          await s.until(() => p.z < 10.6, false);
        }
        s.ui.marker(null);
        g.restricted = null;
        const w = s.spawn('warden', 0.4, -6.4, 0, { variant: 'warden' });
        s.cast('THE WARDEN', w);
        await s.scene(async () => {
          s.shot({ pos: [-4.6, 1.6, 8.4], look: [0, 1.8, -5], pos2: [-4.2, 1.6, 8.0], fov: 40, dur: 6 });
          await s.wait(1.6);
          w.idleTo = { x: 0.4, z: -1.6 };
          w.idleFace = yawTo({ x: 0.4, z: -1.6 }, p);
          await s.arrive(w, 5);
          s.closeUp(w, { side: 1, fov: 30, dist: 1.6, dur: 9 });
          await s.wait(0.5);
          await s.say('THE WARDEN', 'Reyes. I signed your last paycheque.');
          await s.say('THE WARDEN', 'Two years on my fence and you never asked once what we kept behind it. You were a good guard.');
          s.overShoulder(w, p, { side: -1, dist: 1.2, height: 2.1, fov: 32, dur: 5 });
          await s.say('SCARLET', 'I\'m asking now.');
          s.closeUp(w, { side: -1, fov: 28, dist: 1.5, dur: 7 });
          await s.say('THE WARDEN', 'People nobody misses. Turned into something worth the money.');
          await s.say('THE WARDEN', 'Your sister\'s a good match. Mr. Voss was very pleased.');
          p.sceneStyle = 'fight';
          p.sceneGuard = 1;
          s.closeUp(p, { side: 1, fov: 28, dist: 1.1, dur: 3 });
          await s.say('SCARLET', 'Give me the card.', 1.6);
        });
        p.sceneStyle = 'relaxed';
        p.sceneGuard = 0.35;
        g.cam.yaw = s.behindYaw(yawTo(p, w));
        s.boss(w, { name: 'THE WARDEN', sub: 'PALEWATER SECURITY', kick: 'THE MAIN LAB' });
        s.objective('THE WARDEN', 'His card opens B3');
        s.when(() => w.alive && w.hp < w.maxHp * 0.3, () => s.bark('THE WARDEN', 'You should have stayed home, Reyes.', 2.2, w));
        await s.fight([w], { pressure: 5 });
        s.flags.warden = { x: w.x, z: w.z };
        await s.scene(async () => {
          const d = (s.flags.warden as { x: number; z: number }) ?? { x: 0, z: -2 };
          const at = { x: d.x + 0.8, z: d.z + 0.6 };
          await s.walk(at.x, at.z, { face: yawTo(at, d) });
          s.pose('st_crouch', 0.4);
          s.shot({ pos: [at.x + 1.3, 1.1, at.z + 1.3], look: [d.x, 0.4, d.z], fov: 34, dur: 4 });
          await s.wait(1.2);
          s.ui.item('TAKEN', 'THE WARDEN\'S KEYCARD', 'LEVEL B3 · CONTAINMENT', 3.4);
          await s.wait(1.4);
          s.pose(null, 0.4);
          // the blast door at the lab's north end, its light going green
          s.shot({ pos: [2.4, 1.7, 2.6], look: [0, 2.2, -11], fov: 40, dur: 5 });
          g.audio.play('metal_hit', { pos: V(0, 2, -11), vol: 0.8, pitch: 0.5 });
          await s.wait(1.6);
          await s.say('SCARLET', 'B3. I\'m coming, Ivy.', 2.2);
          s.ui.fade(true, 1.6);
          await s.wait(2.0);
        });
      },
    },
  ],
};
