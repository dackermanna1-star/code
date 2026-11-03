import * as THREE from 'three';
import type { Enemy } from '../ai/enemy';
import { yawFromDir } from '../core/math';
import type { Chapter, Story } from './runner';
import type { Npc } from './staging';
import { DAWN, dawnStage } from '../world/level/dawn';

/**
 * CHAPTER EIGHT — DAWN. Palewater's river dock, 6:12 AM, the sun coming up over the far bank.
 * Voss walking down the jetty to his helicopter with his people round him, and Viper, who isn't
 * dead after all. His men on the apron; Viper on the jetty, the river either side; Voss in the
 * open door of the helicopter, offering money. Sirens across the water. And then the two of them
 * at the end of the jetty, their feet over the edge, watching it get light.
 */
const yawTo = (a: { x: number; z: number }, b: { x: number; z: number }) => yawFromDir(b.x - a.x, b.z - a.z);
const V = (x: number, y: number, z: number) => new THREE.Vector3(x, y, z);
const D = DAWN;
const GUARD = ['elite0', 'elite1', 'elite2'];

let ivy: Npc | null = null;
let voss: Npc | null = null;

export const CH8: Chapter = {
  id: 8,
  kick: 'CHAPTER EIGHT',
  title: 'DAWN',
  place: 'PALEWATER · THE RIVER DOCK',
  clock: '6:12 AM',
  map: 'dawn',
  outfit: 'guard',
  fill: 0.3,
  synopsis: 'The river. Voss\'s helicopter. The sun coming up.',
  par: 420,
  backdrop: { pos: [3.4, 1.2, -50], look: [0, 1.0, -68], pos2: [3.0, 1.3, -52], look2: [0, 1.4, -70], fov: 44, dur: 45 },
  next: null,
  setup(s) {
    ivy = null;
    voss = null;
    dawnStage.sun = 0;
    dawnStage.rotorSpeed = 0;
    s.givePistol(1);
    s.place(D.start.x, D.start.z, D.start.yaw);
    ivy = s.extra('ivy', D.start.x - 1.2, D.start.z + 1.4, Math.PI, {});
    s.cast('IVY', ivy);
    if (s.cp < 3) {
      voss = s.extra('voss', 0, -40, Math.PI, {});
      s.cast('VOSS', voss);
    }
    s.pickup('note', [-15.0, 2.62, 12.2], { id: 'c8-manifest', title: 'A manifest on a container\'s door', text: 'PALEWATER → OFFSHORE (via river)\n\nCARGO: "biological samples, frozen"\nCONSIGNEE: J. Voss / Meridian Holdings\nDEPART: 06:30 Sunday\n\n<em>Six of them, it says. Six lots. Two of them crossed out this morning.</em>' });
    s.pickup('medkit', [18.4, 0.02, 14]);
    s.pickup('medkit', [-1.6, 0.02, -30]);
  },
  tick(s, dt) {
    // the sun comes up as she goes down the jetty
    const p = s.game.player;
    const k = Math.min(1, Math.max(0, (D.start.z - p.z) / (D.start.z - D.pad.z)));
    dawnStage.sun = Math.max(dawnStage.sun, k * 0.8);
    void dt;
  },
  segments: [
    // ------------------------------------------------------------------ the dock
    {
      name: 'THE DOCK',
      async play(s) {
        const g = s.game;
        const p = g.player;
        const guards: Enemy[] = [
          s.spawn('elite', -6, 8, Math.PI, { variant: GUARD[0] }),
          s.spawn('elite', 6, 6, Math.PI, { variant: GUARD[1] }),
          s.spawn('brawler', -12, 14, Math.PI / 2, { variant: 'labguard0' }),
          s.spawn('brawler', 12, 16, -Math.PI / 2, { variant: 'labguard1' }),
        ];
        const viper = s.spawn('viper', 1.2, -38, Math.PI, { variant: 'viper_story' });
        s.cast('VIPER', viper);
        s.flags.viperE = true;
        await s.scene(async () => {
          s.ui.card('CHAPTER EIGHT', 'DAWN', 'PALEWATER · THE RIVER DOCK', '6:12 AM');
          await s.wait(4.4);
          s.ui.cardHide();
          s.ui.fade(false, 2.0);
          // out of the service door: the river, the sky going gold, the jetty, the helicopter
          s.shot({ pos: [0.6, 1.8, 28.4], look: [0, 2, -60], pos2: [0.4, 2.0, 27.6], fov: 40, dur: 8 });
          dawnStage.rotorSpeed = 2;
          await s.wait(3.0);
          s.ui.stamp('PALEWATER · THE RIVER DOCK', '6:12 AM');
          await s.say('IVY', 'Scar... is that him?', 1.8);
          // Voss on the jetty, with Viper - she turns round
          if (voss) {
            // (he turns to look back down the jetty at her - turned before the camera finds him)
            voss.faceYaw = 0;
            voss.yaw = 0;
            voss.anim.initAt(voss.x, voss.z, 0);
            s.closeUp(voss, { side: 1, fov: 24, dist: 2.2, dur: 6 });
          }
          await s.wait(1.0);
          await s.say('SCARLET', 'VOSS!', 1.2);
          await s.say('VOSS', 'Miss Reyes. You really should have gone home.', 3.0, { to: p });
          s.closeUp(viper, { side: -1, fov: 26, dist: 1.8, dur: 5 });
          await s.say('VIPER', 'I told you. Everyone leaves without something.', 2.6, { to: p });
          await s.say('VOSS', 'Take care of it. I have a flight.', 2.4, { to: viper });
          if (voss) voss.walk([[0, -60], [0, D.heli.z + 6.6]], 1.4, () => voss && (voss.faceYaw = 0));
          viper.idleTo = { x: 1.2, z: -8 };
          viper.idleFace = 0;
          s.closeUp(p, { side: 1, fov: 30, dist: 1.2, dur: 4 });
          await s.say('SCARLET', 'Ivy. Behind the containers. Stay down.', 2.4);
          if (ivy) ivy.walk([[-14, 22]], 2.6, () => ivy?.hold('st_cower', 0.3));
          p.sceneStyle = 'fight';
          p.sceneGuard = 1;
          await s.wait(0.8);
        });
        p.sceneStyle = 'relaxed';
        p.sceneGuard = 0.35;
        s.objective('VOSS\'S PEOPLE', 'Through them — the river either side of the quay');
        await s.fight(guards, { pressure: 4 });
      },
    },
    // ------------------------------------------------------------------ the jetty: Viper
    {
      name: 'THE JETTY',
      resume(s) {
        s.place(0, 4, Math.PI);
        if (ivy) {
          ivy.x = -14;
          ivy.z = 22;
          ivy.anim.initAt(ivy.x, ivy.z, 0);
          ivy.hold('st_cower', 0.01);
        }
      },
      async play(s) {
        const g = s.game;
        const p = g.player;
        let viper = s.actorOf('VIPER') as Enemy | null;
        if (!viper) {
          viper = s.spawn('viper', 1.2, -8, Math.PI, { variant: 'viper_story' });
          s.cast('VIPER', viper);
        }
        const V0 = viper;
        const crew: Enemy[] = [];
        await s.scene(async () => {
          V0.idleTo = { x: 0, z: -6 };
          V0.idleFace = yawTo({ x: 0, z: -6 }, p);
          s.shot({ pos: [2.2, 1.4, p.z - 1], look: [0, 1.5, -8], fov: 36, dur: 5 });
          await s.arrive(V0, 5);
          s.closeUp(V0, { side: 1, fov: 28, dist: 1.6, dur: 6 });
          await s.say('VIPER', 'Last time I let you win. I wanted to see what you\'d do.', 3.2);
          s.closeUp(p, { side: -1, fov: 28, dist: 1.15, dur: 3 });
          await s.say('SCARLET', 'Now you know.', 1.6);
          // a whistle: her people up the ladders from the launch tied under the jetty
          s.closeUp(V0, { side: -1, fov: 30, dist: 1.6, dur: 5 });
          await s.say('VIPER', 'Not yet, though. I like to watch first.', 2.6);
          g.audio.play('metal_hit', { pos: V(0, 0.4, -26), vol: 0.5, pitch: 1.4 });
          crew.push(
            s.spawn('agile', -1.4, -24, 0, { variant: 'agile0' }),
            s.spawn('agile', 1.3, -27, 0, { variant: 'agile1' }),
            s.spawn('knife', -0.2, -30, 0, { variant: 'agile2' }),
          );
          s.shot({ pos: [2.2, 1.6, -18], look: [0, 1.2, -27], fov: 40, dur: 4 });
          await s.wait(1.6);
        });
        // (she backs off up the jetty to watch them do it, out of the way of it)
        V0.becomeIdle(yawTo({ x: 0.8, z: -44 }, p));
        V0.idleTo = { x: 0.8, z: -44 };
        s.objective('VIPER\'S PEOPLE', 'The jetty\'s rail is low: a heavy blow puts a man in the river');
        s.alert(crew, 0.6);
        await s.fight(crew, { pressure: 4 });
        s.bark('VIPER', 'Fine. Me, then.', 1.8, V0);
        g.cam.yaw = s.behindYaw(yawTo(p, V0));
        // (her phases on the jetty: no doors for anyone to come through - the last two of hers up
        // the ladder from the launch instead)
        s.onBossPhase = (e, phase) => {
          if (e !== V0) return false;
          if (phase === 2) s.bark('VIPER', 'Now you\'re making me work.', 1.8, V0);
          else {
            s.bark('VIPER', 'Get UP here!', 1.4, V0);
            for (const [x, z] of [[-1.2, -30], [1.2, -32]] as [number, number][]) {
              const m = s.spawn('agile', x, z, 0, { variant: 'agile0' });
              s.encounter.push(m);
              m.alert(0.5);
            }
          }
          return true;
        };
        s.boss(V0, { name: 'VIPER', sub: 'NO TRICKS LEFT', kick: 'THE JETTY' });
        s.objective('VIPER', 'The jetty rail is low: a heavy blow sends her in the river');
        s.when(() => V0.alive && V0.hp < V0.maxHp * 0.3, () => s.bark('VIPER', 'He\'ll pay you whatever you want. Take it!', 2.6, V0));
        await s.fight([V0], { pressure: 5 });
        s.onBossPhase = null;
      },
    },
    // ------------------------------------------------------------------ Voss
    {
      name: 'VOSS',
      resume(s) {
        s.place(0, -40, Math.PI);
      },
      async play(s) {
        const g = s.game;
        const p = g.player;
        s.objective('VOSS', 'The helicopter — before it lifts');
        dawnStage.rotorSpeed = 8;
        if (!voss) {
          voss = s.extra('voss', 0, D.heli.z + 6.6, 0, {});
          s.cast('VOSS', voss);
        }
        await s.reach(0, D.heli.z + 9.5, 2.2, 'HELIPAD');
        await s.scene(async () => {
          const Vs = voss!;
          dawnStage.rotorSpeed = 14;
          await s.walk(0.6, D.heli.z + 8.4, { face: Math.PI, speed: 1.4 });
          Vs.lookAt = p;
          s.overShoulder(p, Vs, { side: 1, dist: 1.1, fov: 32, dur: 6 });
          await s.say('VOSS', 'Everyone has a number, Miss Reyes. I\'ve paid more for less. Name yours.', 3.6);
          s.closeUp(p, { side: -1, fov: 28, dist: 1.15, dur: 5 });
          await s.wait(0.6);
          await s.say('SCARLET', 'Sunday.', 1.4);
          s.closeUp(Vs, { side: 1, fov: 28, dist: 1.4, dur: 4 });
          await s.say('VOSS', '...I\'m sorry?', 1.4);
          s.closeUp(p, { side: 1, fov: 28, dist: 1.1, dur: 4 });
          await s.say('SCARLET', 'It\'s my birthday. You owe me a whole day of it.', 2.8);
          // one blow; he goes down on the pad
          void s.walk(Vs.x - 0.4, Vs.z + 0.7, { speed: 2.4, face: yawTo({ x: Vs.x - 0.4, z: Vs.z + 0.7 }, Vs) });
          await s.wait(0.6);
          g.audio.play('punch_heavy', { pos: V(Vs.x, 1.6, Vs.z), vol: 1 });
          g.cam.addTrauma(0.3);
          Vs.hold('st_sitwall', 0.15);
          Vs.lookAt = null;
          await s.wait(1.2);
          // sirens across the water: blue lights on the far bank, a boat coming
          dawnStage.rotorSpeed = 3;
          g.audio.play('whoosh_light', { vol: 0.4, pitch: 0.4 });
          s.shot({ pos: [3, 2.4, D.heli.z + 12], look: [-60, 2, -200], fov: 34, dur: 6 });
          s.bark('', '<em>(across the water: sirens, a lot of them)</em>', 3, null);
          await s.wait(2.6);
          s.ui.phoneCall('OWENS', 'O', 'text message', '6:31');
          await s.wait(1.4);
          s.ui.phoneClose();
          await s.phone({ name: 'Owens', initial: 'O', sub: 'Palewater', clock: '6:31' }, [
            { dir: 'in', time: '6:29 AM', text: 'called it in. all of it. B3, the trucks, the lot', wait: 1.6 },
            { dir: 'in', time: '6:30 AM', text: 'your friend Lena sent the papers the pages of some red book. its everywhere', wait: 2.0 },
            { dir: 'in', time: '6:31 AM', text: 'go home scarlet. take her home', wait: 2.4 },
          ]);
          s.ui.phoneClose();
          await s.wait(0.8);
        });
      },
    },
    // ------------------------------------------------------------------ sunrise
    {
      name: 'SUNRISE',
      resume(s) {
        s.place(0, D.jetty.z0 + 2, Math.PI);
      },
      async play(s) {
        const g = s.game;
        const p = g.player;
        s.objective(null);
        await s.scene(async () => {
          // the end of the jetty: the two of them sat on its edge, the sun up over the far bank
          s.ui.fade(true, 1.2);
          await s.wait(1.4);
          dawnStage.sun = 1;
          dawnStage.rotorSpeed = 0;
          // sat on the jetty's east edge, side by side, their feet over the water, facing the far
          // bank and the sun (sat on the boards: the hips at their level, the legs hung over)
          const SEAT = -0.46;
          const ex = D.jetty.x1 - 0.32, ez = -34;
          s.place(ex, ez, Math.PI / 2);
          p.heightLocked = true;
          p.setY(SEAT);
          s.pose('st_sit', 0.01);
          if (ivy) {
            ivy.x = ex;
            ivy.z = ez + 0.82;
            ivy.heightLocked = true;
            ivy.setY(SEAT);
            ivy.anim.initAt(ivy.x, ivy.z, Math.PI / 2);
            ivy.yaw = Math.PI / 2;
            ivy.faceYaw = Math.PI / 2;
            ivy.hold('st_sit', 0.01);
            ivy.lookAt = null;
          }
          s.shot({ pos: [ex - 4.2, 1.3, ez + 2.2], look: [ex + 40, 2, ez - 26], pos2: [ex - 4.8, 1.5, ez + 2.6], fov: 40, dur: 14 });
          s.ui.fade(false, 2.4);
          await s.wait(4.0);
          await s.say('IVY', 'Scar? What day is it?', 1.8, { to: p });
          s.shot({ pos: [ex + 2.2, 0.5, ez - 1.8], look: [ex, 0.35, ez + 0.4], fov: 32, dur: 12 });
          await s.wait(0.8);
          await s.say('SCARLET', '...Sunday.', 1.6, { to: ivy });
          await s.say('IVY', 'Happy birthday.', 1.6, { to: p });
          await s.wait(1.0);
          await s.say('SCARLET', 'Yeah.', 1.0, { to: ivy });
          await s.say('SCARLET', 'Best one yet.', 1.8, { to: ivy });
          // the sun on the water; the city waking up across it
          s.shot({ pos: [ex - 6, 1.6, ez + 6], look: [140, 30, -560], pos2: [ex - 6.4, 2.6, ez + 9], fov: 34, dur: 10 });
          await s.wait(5.0);
          s.ui.card('SCARLET', 'BEFORE DAWN', 'THE END', '');
          await s.wait(5.0);
          s.ui.fade(true, 2.0);
          await s.wait(2.2);
          s.ui.cardHide();
        });
      },
    },
  ],
};
