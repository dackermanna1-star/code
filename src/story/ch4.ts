import * as THREE from 'three';
import type { Enemy } from '../ai/enemy';
import { yawFromDir } from '../core/math';
import { CIVILIANS } from '../character/variants';
import type { Chapter, Story } from './runner';
import type { Npc } from './staging';
import { MERIDIAN, meridianStage } from '../world/level/meridian';

/**
 * CHAPTER FOUR — MERIDIAN. Kael's keycard calls the service lift to 57, 3:41 AM. Bare concrete,
 * the rain blowing in at the edges, the site's night men with their torches, the stairs up chained
 * shut - so out onto the scaffold, two hundred metres up, and in through the gap where a pane of 58
 * is missing. The private floor: Voss's security, and the monitors in their office - the viewing,
 * live from the penthouse: her sister on a stage. Up the service stairs and through the kitchen
 * door, into the room. Viper. Ivy gone down in the private lift before she can reach her; the fight;
 * and Voss on the screen, calm as a man reading a menu: the trucks leave at dawn.
 */
const yawTo = (a: { x: number; z: number }, b: { x: number; z: number }) => yawFromDir(b.x - a.x, b.z - a.z);
const V = (x: number, y: number, z: number) => new THREE.Vector3(x, y, z);
const S57 = MERIDIAN.site, S58 = MERIDIAN.f58;
const SEC = ['kxsec0', 'kxsec1', 'kxsec2'];
const SITE = ['worker0', 'worker1', 'worker2'];
const VIPERS = ['agile0', 'agile1', 'agile2'];

let ivy: Npc | null = null;
let viper: Enemy | null = null;
const guests: Npc[] = [];
/** Viper's two at the viewing (kept here: a checkpoint's flags are plain data). */
let vguards: Enemy[] = [];

function at(s: Story, x: number, z: number, yaw: number, y: number) {
  s.place(x, z, yaw);
  s.game.player.setY(y);
}
function man(s: Story, key: string, x: number, z: number, yaw: number, y: number, o: { variant?: string; pose?: string; watch?: boolean; patrol?: [number, number, number?][]; vision?: number } = {}) {
  return s.spawn(key, x, z, yaw, { ...o, y });
}

/** The viewing: the guests in a half-circle, Ivy on her mark by the glass, Viper beside her. */
function viewing(s: Story) {
  const W = CIVILIANS.women, M = CIVILIANS.men;
  const spots: [number, number][] = [[-4.6, -4.6], [-2.8, -3.6], [-0.8, -3.2], [1.2, -3.2], [3.2, -3.6], [5.0, -4.6], [-3.6, -2.0], [4.0, -2.0]];
  const vars = [M[6], W[6], M[3], W[3], M[0], W[0], M[2], W[4]];
  guests.length = 0;
  spots.forEach(([x, z], i) => {
    const n = s.extra(vars[i], x, z, yawTo({ x, z }, { x: 0.4, z: -9 }), { pose: i % 3 ? 'st_drink' : 'st_crossed', chat: 0.3 });
    if (n) guests.push(n);
  });
  ivy = s.extra('ivy', 0.4, -9.0, 0, { pose: 'st_bound' });
  s.cast('IVY', ivy);
  viper = s.spawn('viper', -1.4, -8.6, 0.3, { variant: 'viper_story' });
  s.cast('VIPER', viper);
  const g1 = s.spawn('agile', 2.2, -8.8, -0.3, { variant: VIPERS[0], pose: 'st_crossed' });
  const g2 = s.spawn('agile', -2.8, -9.2, 0.3, { variant: VIPERS[1], pose: 'st_crossed' });
  vguards = [g1, g2];
}

export const CH4: Chapter = {
  id: 4,
  kick: 'CHAPTER FOUR',
  title: 'MERIDIAN',
  place: 'MERIDIAN TOWER · FLOOR 57',
  clock: '3:41 AM',
  map: 'meridian',
  outfit: 'denim',
  crew: { brawler: SITE },
  synopsis: 'Sixty-one floors. The viewing is at four. Voss picks first.',
  par: 720,
  backdrop: { pos: [6, 1.6, 4], look: [0, 1.2, -9], pos2: [5.4, 1.6, 3.6], look2: [0, 1.4, -9], fov: 46, dur: 45 },
  next: { kick: 'CHAPTER FIVE', title: 'THE TRUCKS LEAVE AT DAWN', line: 'Viper\'s car. Voss\'s convoy. The river road to Palewater.' },
  setup(s) {
    ivy = null;
    viper = null;
    vguards = [];
    meridianStage.feed = 0;
    s.givePistol(1);
    const L = MERIDIAN.lift;
    at(s, L.x, L.z, L.yaw, S57);
    if (s.cp >= 3) viewing(s);
    // things to find
    s.pickup('note', [-12.2, S57 + 0.92, 19.4], { id: 'c4-sitelog', title: 'The site log, on the office container\'s desk', text: 'MERIDIAN TOWER — LEVEL 57 · NIGHT\n\n02:10  Hoist to 58–61 LOCKED OUT (Mr Voss\'s guests)\n02:40  Scaffold N face: netting torn, bay 4. Do NOT use.\n03:05  KX van in the loading bay. Not on the sheet. Told to leave it.\n\nNobody above 57 tonight. Mr V. was clear.' });
    s.pickup('medkit', [14.2, S57 + 0.02, 15.6]);
    s.pickup('ammo', [-6.4, S58 + 0.02, 12.6]);
    s.pickup('photo', [-15.2, S58 + 0.8, 13.2], { id: 'c4-badge', title: 'A Palewater ID, clipped to the monitor', text: 'PALEWATER BIOTECH · SECURITY\nNIGHT SHIFT · ACCESS LEVEL 2\n\nThe photo is of a man she knows. They did nights together for a year: he used to bring her coffee.\n\nOn the back: <em>Meridian detail — tonight only.</em>' });
    s.pickup('medkit', [18.6, 0.02, 7.5]);
  },
  segments: [
    // ------------------------------------------------------------------ 57: the site
    {
      name: 'FLOOR 57',
      async play(s) {
        const g = s.game;
        const p = g.player;
        // the night men: one walking the floor, one at the office having a smoke, one at the edge
        const site = [
          man(s, 'brawler', 10, 8, 0, S57, { variant: SITE[0], watch: true, patrol: [[10, 8, 2], [10, -8, 2.5], [-2, -8, 2]], vision: 12 }),
          man(s, 'brawler', -8.8, 17.4, Math.PI / 2, S57, { variant: SITE[1], watch: true, pose: 'st_smoke', vision: 9 }),
          man(s, 'club', -10, -11, Math.PI, S57, { variant: SITE[2], watch: true, patrol: [[-10, -11, 3], [2, -11, 3]], vision: 10 }),
        ];
        let spotted = false;
        s.when(() => site.some((e) => e.alive && e.state !== 'idle' && !e.down), () => (spotted = true));
        await s.scene(async () => {
          s.ui.card('CHAPTER FOUR', 'MERIDIAN', 'MERIDIAN TOWER · FLOOR 57', '3:41 AM');
          await s.wait(4.4);
          // inside the lift, the doors still shut; the counter running up
          s.shot({ pos: [20.9, S57 + 1.7, 21.4], look: [19.6, S57 + 1.45, 19.2], fov: 40, dur: 7 });
          s.ui.cardHide();
          s.ui.fade(false, 1.2);
          for (const f of ['48', '51', '54', '57']) {
            s.ui.item('SERVICE LIFT', `FLOOR ${f}`, f === '57' ? 'HOIST LOCKED ABOVE THIS LEVEL' : '', 0.9);
            await s.wait(0.9);
          }
          g.audio.play('metal_hit', { pos: V(20, S57 + 1, 18.4), vol: 0.5, pitch: 1.6 });
          await s.say('SCARLET', 'Fifty-seven. The rest of the way, I walk.', 2.6);
          // the doors open: the site, the rain blowing in at the edges, the work lights
          s.shot({ pos: [20, S57 + 1.6, 20.6], look: [8, S57 + 1.4, 4], pos2: [19.6, S57 + 1.6, 19.4], fov: 52, dur: 7 });
          s.ui.stamp('MERIDIAN TOWER · 57', '3:43 AM');
          await s.walk(20, 17.6, { speed: 1.2, face: Math.PI });
          await s.wait(0.6);
          s.bark('GUARD', '<em>(radio)</em> Who called the hoist? ...Probably the wind again.', 3.2, null);
          await s.wait(1.2);
        });
        s.objective('UP', 'The stairs above 57 are chained — find another way');
        // a hint once she's had a look round (or has seen the chain)
        const D = MERIDIAN.stairDoor57;
        const Gp = MERIDIAN.edgeGap;
        let hinted = false;
        const hint = async () => {
          if (hinted) return;
          hinted = true;
          s.bark('SCARLET', 'The scaffold. Outside, round the north face.', 2.6);
          s.objective('UP', 'Out onto the scaffold at the north edge — up its ladder to 58');
          s.ui.marker(V((Gp.x0 + Gp.x1) / 2, S57 + 1.2, -14.8), 'SCAFFOLD');
        };
        s.when(() => Math.hypot(p.x - D.x, p.z - D.z) < 4, () => void hint());
        void s.wait(35, false).then(() => hint());
        void s.tutor(['C'], 'THE NIGHT MEN', 'Their torches carry: keep low between the work lights', ((tk) => () => tk() + (spotted ? 1 : 0))(s.since(() => p.stats.takedowns)), 1, () => p.z < -14 || spotted);
        await s.until(() => p.z < -14.15 && p.y < S57 + 0.5 || (spotted && !hinted), false);
        if (spotted && p.z > -14) {
          s.hideTutor();
          s.objective('THE NIGHT MEN', 'They\'ve seen you');
          await s.fight(site.filter((e) => e.alive), { pressure: 3 });
          await hint();
          await s.until(() => p.z < -14.15 && p.y < S57 + 0.5, false);
        }
        s.ui.marker(null);
        s.hideTutor();
      },
    },
    // ------------------------------------------------------------------ the scaffold
    {
      name: 'THE SCAFFOLD',
      resume(s) {
        at(s, -5, -14.8, -Math.PI / 2, S57);
      },
      async play(s) {
        const g = s.game;
        const p = g.player;
        const Ld = MERIDIAN.ladder;
        await s.scene(async () => {
          // outside: the wind, the rain, the city a very long way down
          s.shot({ pos: [p.x - 2.0, S57 + 1.2, -15.0], look: [p.x + 8, S57 - 40, -60], pos2: [p.x - 1.6, S57 + 1.3, -14.9], fov: 52, dur: 5 });
          await s.wait(2.4);
          await s.say('SCARLET', 'Don\'t look down.', 1.6);
          await s.say('SCARLET', '...I looked down.', 1.8);
        });
        s.objective('THE SCAFFOLD', 'East along the planks — up the ladder to 58');
        // a lookout on the upper boards, smoking out of the wind
        const look = man(s, 'brawler', 11.2, -14.8, -Math.PI / 2, S58, { variant: SEC[0], pose: 'st_smoke', watch: true, vision: 6 });
        s.ui.marker(V(Ld.x, S58 + 1.2, -15.2), 'LADDER');
        void s.tutor(['SPACE'], 'THE LADDER', 'Into it, SPACE, then up', () => (p.y > S57 + 1 ? 1 : 0), 1, () => p.y > S58 - 0.5, [Ld.x, -15.2, S58]);
        await s.until(() => p.y > S58 - 0.4, false);
        s.ui.marker(V((MERIDIAN.pane.x0 + MERIDIAN.pane.x1) / 2, S58 + 1.2, -12.8), 'THE GAP IN THE GLASS');
        s.objective('INSIDE', 'Through the missing pane into 58');
        if (look.alive && look.state === 'idle') void s.tutor(['F'], 'FROM BEHIND', 'He\'s watching the city, not the boards', s.since(() => p.stats.takedowns), 1, () => p.z > -13.8 || look.state !== 'idle' || !look.alive);
        await s.until(() => p.z > -13.6 && p.y > S58 - 0.4 || (look.alive && look.state !== 'idle' && !look.down), false);
        if (look.alive && look.state !== 'idle') {
          s.hideTutor();
          await s.fight([look], { pressure: 2 });
          await s.until(() => p.z > -13.6 && p.y > S58 - 0.4, false);
        }
        s.ui.marker(null);
        s.hideTutor();
      },
    },
    // ------------------------------------------------------------------ 58: the private floor
    {
      name: 'FLOOR 58',
      resume(s) {
        at(s, 9.2, -12.6, 0, S58);
      },
      async play(s) {
        const g = s.game;
        const p = g.player;
        const sec = [
          man(s, 'brawler', 0, -2, 0, S58, { variant: SEC[1], watch: true, patrol: [[0, -2, 2], [14, -2, 2], [14, 10, 2]], vision: 12 }),
          man(s, 'brawler', -4, 12, Math.PI / 2, S58, { variant: SEC[2], watch: true, patrol: [[-4, 12, 3], [8, 18, 3]], vision: 11 }),
          man(s, 'knife', -9.6, 6.8, Math.PI, S58, { variant: SEC[0], watch: true, pose: 'st_crossed', vision: 9 }),
        ];
        let spotted = false;
        s.when(() => sec.some((e) => e.alive && e.state !== 'idle' && !e.down), () => (spotted = true));
        s.objective('THE SECURITY OFFICE', 'Whatever they\'re watching up there, they\'re watching it from here');
        const O = MERIDIAN.screens;
        let watched = false;
        s.interact([O.x + 0.8, S58 + 1.4, O.z], 'WATCH THE SCREENS', () => (watched = true), { r: 1.8 });
        s.ui.marker(V(O.x + 1.6, S58 + 1.2, O.z), 'MONITORS');
        await s.until(() => watched || spotted, false);
        if (spotted && !watched) {
          s.objective('SECURITY', 'Put them down');
          await s.fight(sec.filter((e) => e.alive), { pressure: 3 });
          s.objective('THE SECURITY OFFICE', 'The monitors');
          await s.until(() => watched, false);
        }
        s.ui.marker(null);
        await s.scene(async () => {
          await s.walk(O.x + 1.5, O.z, { face: -Math.PI / 2, speed: 1.3 });
          meridianStage.feed = 1;
          s.shot({ pos: [O.x + 3.2, S58 + 1.75, O.z + 1.4], look: [O.x, S58 + 1.8, O.z], fov: 34, dur: 9 });
          await s.wait(1.2);
          await s.say('VIPER', '<em>(speaker)</em> ...and the last lot of the night. The one you\'ve all been so patient for.', 4, { phone: true });
          await s.say('VIPER', '<em>(speaker)</em> Twenty-two. No record. No one to come looking for her.', 3.4, { phone: true });
          s.closeUp(p, { side: 1, fov: 28, dist: 1.15, dur: 6 });
          await s.wait(0.6);
          await s.say('SCARLET', 'Ivy.', 1.4);
          await s.say('VIPER', '<em>(speaker)</em> Reserved, of course. But Mr. Voss likes to hear what you\'d have paid.', 3.6, { phone: true });
          await s.wait(0.4);
        });
        s.objective('THE PENTHOUSE', 'The service stairs in the east core');
        // (the marker on the landing at the top: up the stairs is the way)
        s.ui.marker(V(27.6, 1.2, 7.6), 'SERVICE STAIRS');
        await s.until(() => p.y > -1.2 && p.x > 22, false);
        s.ui.marker(null);
        // (whoever's still on 58 stays on 58)
        for (const e of sec) if (e.alive && e.state !== 'idle') e.becomeIdle(null);
      },
    },
    // ------------------------------------------------------------------ the viewing
    {
      name: 'THE VIEWING',
      resume(s) {
        at(s, 18, 7.5, -Math.PI / 2, 0);
      },
      async play(s) {
        const g = s.game;
        const p = g.player;
        if (!viper) viewing(s);
        const V0 = viper!;
        s.objective('THE VIEWING', 'Through the kitchen door');
        s.ui.marker(V(MERIDIAN.serviceDoor.x - 0.6, 1.2, MERIDIAN.serviceDoor.z), 'KITCHEN');
        await s.until(() => p.x < 12.6, false);
        s.ui.marker(null);
        await s.scene(async () => {
          await s.walk(10.4, 7.0, { speed: 1.3, face: yawTo({ x: 10.4, z: 7 }, { x: 0.4, z: -9 }) });
          s.shot({ pos: [9.8, 1.7, 8.4], look: [0.4, 1.4, -8.6], pos2: [9.4, 1.7, 8.0], fov: 40, dur: 7 });
          await s.wait(2.2);
          V0.idleFace = yawTo(V0, p);
          s.closeUp(V0, { side: 1, fov: 30, dist: 1.5, dur: 8 });
          await s.wait(0.5);
          await s.say('VIPER', 'And here she is. Ladies and gentlemen — the sister.');
          await s.say('VIPER', 'Bidding is closed, I\'m afraid. Mr. Voss has already picked.');
          // Ivy sees her
          if (ivy) {
            ivy.lookAt = p;
            s.closeUp(ivy, { side: -1, fov: 28, dist: 1.2, dur: 4 });
          }
          await s.say('IVY', 'Scar...?', 1.6, { to: p });
          s.closeUp(p, { side: 1, fov: 28, dist: 1.2, dur: 3 });
          await s.say('SCARLET', 'IVY!', 1.2);
          // the guests scatter; two of Viper's men take Ivy to the private lift
          for (const [i, n] of guests.entries()) {
            n.hold(null, 0.2);
            n.pose = null;
            n.walk([[n.x * 0.6 - 2.0, Math.min(9.6, n.z + 6)], [-4.5, 10.6], [-4.5, 13.5]], 2.5 + (i % 3) * 0.3, () => n.vanish());
          }
          const [g1] = vguards;
          if (ivy) {
            const I = ivy;
            I.hold(null, 0.3);
            I.pose = 'st_bound';
            I.walk([[2.6, -4], [4.5, 9.8], [4.5, 13.4]], 1.8, () => I.vanish());
          }
          if (g1) {
            g1.ghostWalls = true;
            g1.idleTo = { x: 4.5, z: 13.0 };
          }
          s.shot({ pos: [6.6, 1.6, 4.0], look: [3.6, 1.2, 9.8], fov: 40, dur: 6 });
          await s.wait(3.0);
          g.audio.play('metal_hit', { pos: V(4.5, 1.2, 11.4), vol: 0.5, pitch: 1.8 });
          if (g1) {
            g1.ghostWalls = false;
            g1.x = 4.5;
            g1.z = 9.6;
            g1.anim.initAt(g1.x, g1.z, Math.PI);
          }
          s.closeUp(V0, { side: -1, fov: 30, dist: 1.4, dur: 6 });
          await s.say('VIPER', 'She\'ll be in the truck by the time you\'re done with me.');
          p.sceneStyle = 'fight';
          p.sceneGuard = 1;
          await s.say('SCARLET', 'Then I\'ll be quick.', 1.6);
        });
        p.sceneStyle = 'relaxed';
        p.sceneGuard = 0.35;
        // her men first
        const crew = vguards.filter((e) => e.alive);
        // (in behind her through the service door: the front doors open on nothing up here)
        crew.push(s.enter('agile', 2, 0), s.enter('knife', 2, 1));
        s.objective('VIPER\'S PEOPLE', 'Get through them');
        g.cam.yaw = s.behindYaw(yawTo(p, V0));
        V0.becomeIdle(yawTo(V0, p), 'st_crossed');
        await s.fight(crew, { pressure: 4 });
      },
    },
    // ------------------------------------------------------------------ Viper
    {
      name: 'VIPER',
      resume(s) {
        at(s, 3, -1, Math.PI, 0);
        if (!viper) viewing(s);
        for (const n of guests) n.vanish();
        ivy?.vanish();
        for (const e of vguards) {
          e.alive = false;
          e.model.group.visible = false;
          s.game.removeFighter(e);
        }
      },
      async play(s) {
        const g = s.game;
        const p = g.player;
        const V0 = viper!;
        await s.scene(async () => {
          V0.idleTo = { x: p.x - 3.2, z: p.z - 2.4 };
          V0.idleFace = yawTo({ x: p.x - 3.2, z: p.z - 2.4 }, p);
          s.shot({ pos: [p.x + 1.4, 1.5, p.z + 2.2], look: [V0.x, 1.4, V0.z], fov: 36, dur: 5 });
          await s.until(() => !V0.idleTo, true, 4);
          s.closeUp(V0, { side: 1, fov: 30, dist: 1.5, dur: 7 });
          await s.say('VIPER', 'I took her out the back of that club myself. She asked for you the whole way.');
          s.overShoulder(V0, p, { side: -1, dist: 1.0, fov: 30, dur: 4 });
          await s.say('SCARLET', 'Then you know I\'m not leaving without her.');
          s.closeUp(V0, { side: -1, fov: 28, dist: 1.4, dur: 4 });
          await s.say('VIPER', 'Everyone leaves without something.', 2.4);
        });
        g.cam.yaw = s.behindYaw(yawTo(p, V0));
        // (her phases: two more of hers in through the kitchen behind Scarlet, then just her)
        s.onBossPhase = (e, phase) => {
          if (e !== V0) return false;
          if (phase === 2) {
            s.bark('VIPER', 'Boys!', 1.2, V0);
            s.enter('agile', 2, 0);
            s.enter('knife', 2, 1);
          } else s.bark('VIPER', 'You\'re actually enjoying this.', 2.0, V0);
          return true;
        };
        s.boss(V0, { name: 'VIPER', sub: 'VOSS\'S FIXER', kick: 'THE PENTHOUSE' });
        s.objective('VIPER', 'She vanishes and comes from behind — don\'t stand still');
        s.when(() => V0.alive && V0.hp < V0.maxHp * 0.3, () => s.bark('VIPER', 'You\'re better than he said.', 2, V0));
        await s.fight([V0], { pressure: 5 });
        s.onBossPhase = null;
        s.flags.viper = { x: V0.x, z: V0.z };
      },
    },
    // ------------------------------------------------------------------ Voss
    {
      name: 'DAWN',
      resume(s) {
        const v = (s.flags.viper as { x: number; z: number } | undefined) ?? { x: 0, z: -4 };
        at(s, v.x + 1.4, v.z + 1.2, yawTo({ x: v.x + 1.4, z: v.z + 1.2 }, v), 0);
      },
      async play(s) {
        const g = s.game;
        const p = g.player;
        s.objective(null);
        await s.scene(async () => {
          // the screen over the fireplace comes on by itself: a man in a car, the city going by behind him
          s.shot({ pos: [-4, 1.7, 3.0], look: [-12.6, 1.6, 0.5], fov: 40, dur: 6 });
          s.face({ x: -12.6, z: 0.5 });
          g.audio.buzz(0.5);
          s.ui.phoneCall('JULIAN VOSS', 'V', 'video call · connected', '4:06');
          await s.wait(1.8);
          s.ui.phoneClose();
          await s.say('VOSS', 'Miss Reyes. You guarded my doors for two years.', 3.2, { phone: true });
          await s.say('VOSS', 'You never once asked what was behind them. I always liked that about you.', 4, { phone: true });
          s.closeUp(p, { side: 1, fov: 30, dist: 1.2, dur: 5 });
          await s.say('SCARLET', 'Where is she?', 1.6);
          await s.say('VOSS', 'On her way to Palewater. The trucks leave the garage at dawn — they always have.', 4, { phone: true });
          await s.say('VOSS', 'Come and see what we do there. Or go home. Those are both very sensible choices.', 4.2, { phone: true });
          await s.wait(0.4);
          // Viper, on the floor by the glass, a car key on a green fob
          const v = (s.flags.viper as { x: number; z: number } | undefined) ?? { x: 0, z: -4 };
          s.shot({ pos: [v.x + 1.6, 1.0, v.z + 1.4], look: [v.x, 0.3, v.z], fov: 34, dur: 5 });
          await s.wait(1.2);
          await s.say('VIPER', '...Black car. Level minus two. You won\'t catch them.', 3, { to: p });
          s.closeUp(p, { side: -1, fov: 28, dist: 1.15, dur: 4 });
          await s.say('SCARLET', 'Watch me.', 1.4);
          s.ui.item('TAKEN', 'VIPER\'S CAR KEY', 'A green fob · MERIDIAN GARAGE · B2', 3.4);
          await s.wait(2.0);
          s.ui.fade(true, 1.8);
          await s.wait(2.2);
        });
      },
    },
  ],
};
