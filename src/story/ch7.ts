import * as THREE from 'three';
import type { Enemy } from '../ai/enemy';
import { yawFromDir } from '../core/math';
import { outfitVariant } from '../core/settings';
import { CIVILIANS } from '../character/variants';
import type { Chapter, Story } from './runner';
import type { Npc } from './staging';
import { TANKS, tankStage } from '../world/level/tanks';

/**
 * CHAPTER SEVEN — SUBJECT ZERO. Palewater, level B3, 5:41 AM. The freight lift down, the
 * decontamination corridor, and the hall: two rows of tanks lit green, a person floating in each
 * one - the "lots", the ones nobody would miss. Ivy's at the far end, her own number on it. The
 * console in the booth drains it; she comes out into her sister's arms - and the alarm, and the
 * glass of the big tank in the middle of the floor giving way: Subject Zero, what they make of the
 * people they buy. Then out: up the service stairs toward the river, Ivy behind her.
 */
const yawTo = (a: { x: number; z: number }, b: { x: number; z: number }) => yawFromDir(b.x - a.x, b.z - a.z);
const V = (x: number, y: number, z: number) => new THREE.Vector3(x, y, z);
const T = TANKS;

let ivy: Npc | null = null;
/** Ivy keeps close behind her (when she's out of the tank and it's quiet). */
let follow = false;
let followT = 0;

function ivyInTank(s: Story) {
  ivy = s.extra('ivy', T.ivyTank.x, T.ivyTank.z, Math.PI, { pose: 'st_bound', y: 0.62 });
  s.cast('IVY', ivy);
}
/** The tank's glass up and gone (and the tank's footprint no longer in her way). */
function openTank(s: Story, x: number, z: number) {
  const a = s.game.arena;
  a.obstacles = a.obstacles.filter((o) => !(o.name === 'tank' && Math.abs((o.minX + o.maxX) / 2 - x) < 0.1 && Math.abs((o.minZ + o.maxZ) / 2 - z) < 0.1));
  a.heightsChanged();
}

export const CH7: Chapter = {
  id: 7,
  kick: 'CHAPTER SEVEN',
  title: 'SUBJECT ZERO',
  place: 'PALEWATER · LEVEL B3',
  clock: '5:41 AM',
  map: 'tanks',
  outfit: 'guard',
  synopsis: 'Under the main lab: the tanks. Her sister is in one of them.',
  par: 540,
  backdrop: { pos: [-6, 2.2, 6], look: [0, 1.6, 16], pos2: [-5.4, 2.2, 6.4], look2: [0, 1.8, 16], fov: 44, dur: 45 },
  next: { kick: 'CHAPTER EIGHT', title: 'DAWN', line: 'The river. Voss\'s helicopter. The sun coming up.' },
  setup(s) {
    const g = s.game;
    ivy = null;
    follow = false;
    s.givePistol(1);
    s.place(T.start.x, T.start.z, T.start.yaw);
    // the lots in their tanks
    const W = CIVILIANS.women, M = CIVILIANS.men;
    const who = [M[0], W[1], M[2], W[3], M[4], W[5], M[6], W[7], M[1], W[0], M[3], W[2]];
    let i = 0;
    for (const x of T.rows) for (const z of T.rowZ) s.extra(who[i++ % who.length], x, z, x < 0 ? Math.PI / 2 : -Math.PI / 2, { pose: 'st_bound', y: 0.62 });
    if (s.cp < 2) ivyInTank(s);
    else {
      tankStage.ivyWant = tankStage.ivyLevel = 0;
      if (tankStage.ivyGlass) tankStage.ivyGlass.visible = false;
      openTank(s, T.ivyTank.x, T.ivyTank.z);
      ivy = s.extra('ivy', T.booth.x0 + 1.2, T.booth.z1 + 2, -Math.PI / 2, {});
      s.cast('IVY', ivy);
    }
    if (s.cp >= 2) {
      tankStage.alarm = true;
      tankStage.zeroBroken = true;
      openTank(s, T.zero.x, T.zero.z);
    }
    void g;
    s.pickup('note', [-11.4, 0.02, -26], { id: 'c7-file', title: 'A clipboard on the floor by tank 1', text: 'SUBJECT 01 — M, 40s. Intake 14 Mar (KX).\nCompatibility 31%. Neural graft rejected.\n\nRecommend: <em>discard</em>.\n\n(Initialled: H.S.)' });
    s.pickup('note', [10.8, 3.62, 9.3], { id: 'c7-voss', title: 'A memo on the console', text: 'FROM: J. Voss\nTO: Dr H. Strand\n\nLot 6 is the best match we\'ve had. She goes in Zero\'s line - and she is NOT to be wasted the way the last four were.\n\nThe sister is not a concern. The sister used to work for us.' });
    s.pickup('medkit', [-12.6, 3.62, -10]);
    s.pickup('ammo', [12.6, 3.62, -20]);
  },
  tick(s, dt) {
    const g = s.game;
    const p = g.player;
    const I = ivy;
    if (!I || I.gone || !follow) return;
    followT -= dt;
    if (followT > 0) return;
    followT = 0.4;
    // (a fight on: she gets down where she is)
    if (!s.calm) {
      if (I.pose !== 'st_cower') I.hold('st_cower', 0.3);
      return;
    }
    if (I.pose === 'st_cower') I.hold(null, 0.3);
    const d = Math.hypot(p.x - I.x, p.z - I.z);
    if (d > 2.4) {
      const fx = Math.sin(p.yaw), fz = Math.cos(p.yaw);
      I.walk([[p.x - fx * 1.4, p.z - fz * 1.4]], d > 6 ? 3.6 : 1.9);
    }
  },
  segments: [
    // ------------------------------------------------------------------ B3
    {
      name: 'B3',
      async play(s) {
        const g = s.game;
        const p = g.player;
        await s.scene(async () => {
          s.ui.card('CHAPTER SEVEN', 'SUBJECT ZERO', 'PALEWATER · LEVEL B3', '5:41 AM');
          await s.wait(4.4);
          s.ui.cardHide();
          s.ui.fade(false, 1.4);
          // the lift's doors behind her; the corridor's spray of decontaminant
          s.shot({ pos: [0.6, 1.7, -36], look: [0, 1.4, -42], fov: 40, dur: 4 });
          g.audio.play('whoosh_heavy', { pos: V(0, 2, -40), vol: 0.5, pitch: 0.5 });
          await s.wait(2.2);
          await s.walk(0, -31, { speed: 1.3, face: 0 });
          // the hall: the rows of tanks, the green light, the people in them
          s.shot({ pos: [0.3, 2.4, -29.4], look: [0, 1.4, 6], pos2: [0.2, 2.0, -27.8], fov: 50, dur: 9 });
          s.ui.stamp('PALEWATER · B3 · CONTAINMENT', '5:43 AM');
          await s.wait(3.4);
          await s.say('SCARLET', '...Oh, god.', 1.8);
          s.shot({ pos: [-6.4, 1.6, -21], look: [-8.5, 1.6, -18], fov: 32, dur: 5 });
          await s.wait(1.6);
          await s.say('SCARLET', 'They\'re people. Every one of them.', 2.4);
          await s.say('SCARLET', 'I stood outside this building for two years.', 2.8);
        });
        const lab = [
          s.spawn('brawler', -4, -12, Math.PI / 2, { variant: 'labguard0', watch: true, patrol: [[-4, -12, 2], [-4, 8, 2]], vision: 11 }),
          s.spawn('brawler', 4, 2, -Math.PI / 2, { variant: 'labguard2', watch: true, patrol: [[4, 2, 2], [4, -20, 2]], vision: 11 }),
          s.spawn('knife', 12.6, -6, -Math.PI / 2, { variant: 'labtech1', watch: true, pose: 'st_phone', vision: 8, y: T.catwalkY }),
        ];
        let spotted = false;
        s.when(() => lab.some((e) => e.alive && e.state !== 'idle' && !e.down), () => (spotted = true));
        s.objective('IVY', 'She\'s in here somewhere — the far end');
        s.ui.marker(V(T.ivyTank.x, 1.4, T.ivyTank.z - 2.2), 'LOT 6');
        await s.until(() => p.z > T.ivyTank.z - 3.4 || spotted, false);
        if (spotted && p.z <= T.ivyTank.z - 3.4) {
          s.ui.marker(null);
          s.objective('THE NIGHT STAFF', 'Put them down');
          await s.fight(lab.filter((e) => e.alive), { pressure: 3 });
          s.ui.marker(V(T.ivyTank.x, 1.4, T.ivyTank.z - 2.2), 'LOT 6');
          await s.until(() => p.z > T.ivyTank.z - 3.4, false);
        }
        s.ui.marker(null);
        for (const e of lab) if (e.alive && e.state !== 'idle') e.becomeIdle(null);
      },
    },
    // ------------------------------------------------------------------ lot six
    {
      name: 'LOT SIX',
      resume(s) {
        s.place(T.ivyTank.x - 0.4, T.ivyTank.z - 2.6, 0);
      },
      async play(s) {
        const g = s.game;
        const p = g.player;
        await s.scene(async () => {
          await s.walk(T.ivyTank.x, T.ivyTank.z - 1.7, { face: 0, speed: 1.2 });
          s.shot({ pos: [T.ivyTank.x + 1.6, 1.6, T.ivyTank.z - 3.0], look: [T.ivyTank.x, 1.7, T.ivyTank.z], fov: 32, dur: 8 });
          await s.wait(1.6);
          s.pose('st_phone', 0.5);
          await s.say('SCARLET', 'Ivy. Ivy, it\'s me. I\'m here.', 2.6);
          await s.wait(0.6);
          s.closeUp(p, { side: 1, fov: 28, dist: 1.1, dur: 5 });
          await s.say('SCARLET', 'Hang on. I\'ll get you out of there.', 2.4);
          s.pose(null, 0.4);
        });
        s.objective('THE CONSOLE', 'The booth up on the east catwalk drains the tanks');
        const C = T.console;
        let drained = false;
        s.interact([C.x - 0.6, T.catwalkY + 1.2, C.z], 'DRAIN · LOT 6', () => (drained = true), { r: 1.4 });
        s.ui.marker(V(C.x - 0.8, T.catwalkY + 1.2, C.z), 'CONSOLE');
        await s.until(() => drained, false);
        s.ui.marker(null);
        await s.scene(async () => {
          s.shot({ pos: [C.x - 1.4, T.catwalkY + 1.7, C.z + 1.6], look: [T.ivyTank.x, 1.4, T.ivyTank.z], fov: 38, dur: 4 });
          g.audio.play('whoosh_heavy', { pos: V(T.ivyTank.x, 1, T.ivyTank.z), vol: 0.7, pitch: 0.4 });
          tankStage.ivyWant = 0;
          await s.wait(2.6);
          if (tankStage.ivyGlass) tankStage.ivyGlass.visible = false;
          openTank(s, T.ivyTank.x, T.ivyTank.z);
          g.audio.play('metal_hit', { pos: V(T.ivyTank.x, 2, T.ivyTank.z), vol: 0.6, pitch: 1.4 });
          if (ivy) ivy.hold('st_kneel', 0.6);
          // (down the catwalk and across: a cut)
          s.place(T.ivyTank.x + 0.9, T.ivyTank.z - 1.1, yawTo({ x: T.ivyTank.x + 0.9, z: T.ivyTank.z - 1.1 }, T.ivyTank));
          s.pose('st_crouch', 0.01);
          s.shot({ pos: [T.ivyTank.x - 1.6, 1.0, T.ivyTank.z - 2.2], look: [T.ivyTank.x + 0.4, 0.8, T.ivyTank.z - 0.4], fov: 32, dur: 12 });
          await s.wait(1.0);
          if (ivy) ivy.lookAt = p;
          await s.say('IVY', '...Scar?', 1.4);
          await s.say('SCARLET', 'Hey, kid. I\'ve got you.', 2.0);
          await s.say('IVY', 'You came. You actually came.', 2.2);
          await s.say('SCARLET', 'I told you. Stay where people can see you.', 2.6);
          await s.say('IVY', '...I did. They were watching.', 2.2);
          s.pose(null, 0.4);
          // the alarm; the big tank in the middle of the floor
          tankStage.alarm = true;
          g.audio.thump(0.8, V(0, 2, T.zero.z));
          s.shot({ pos: [3.4, 1.6, T.zero.z + 5], look: [0, 2, T.zero.z], fov: 38, dur: 5 });
          s.bark('GUARD', '<em>(speaker)</em> Containment alarm, B3. Zero is awake. Zero is AWAKE.', 3.4, null);
          await s.wait(2.4);
          g.audio.play('metal_hit', { pos: V(0, 2, T.zero.z), vol: 1, pitch: 0.4 });
          g.cam.addTrauma(0.3);
          await s.wait(0.8);
        });
      },
    },
    // ------------------------------------------------------------------ Subject Zero
    {
      name: 'SUBJECT ZERO',
      resume(s) {
        s.place(T.ivyTank.x + 1.4, T.ivyTank.z - 3, Math.PI);
      },
      async play(s) {
        const g = s.game;
        const p = g.player;
        const I = ivy;
        tankStage.zeroBroken = true;
        openTank(s, T.zero.x, T.zero.z);
        const zero = s.spawn('subject', T.zero.x, T.zero.z, 0, { variant: 'subject' });
        s.cast('SUBJECT ZERO', zero);
        await s.scene(async () => {
          // the glass goes; he steps out of the green, steaming
          g.audio.play('wood_break', { pos: V(0, 2, T.zero.z), vol: 1, pitch: 0.5 });
          g.fx.sparks(V(T.zero.x, 1.6, T.zero.z + 1.4), V(0, 1, 1), 20);
          zero.idleTo = { x: T.zero.x, z: T.zero.z + 3.2 };
          zero.idleFace = 0;
          s.shot({ pos: [2.4, 0.7, T.zero.z + 6.4], look: [T.zero.x, 2.0, T.zero.z + 1], fov: 40, dur: 6 });
          await s.until(() => !zero.idleTo, true, 4);
          if (I) {
            I.hold(null, 0.3);
            I.walk([[T.booth.x0 - 1.4, T.booth.z1 + 1.6]], 2.4, () => I.hold('st_cower', 0.3));
          }
          zero.idleFace = yawTo(zero, p);
          s.closeUp(zero, { side: 1, fov: 30, dist: 2.0, dur: 4 });
          g.audio.play('grunt_attack', { pos: V(zero.x, 2, zero.z), vol: 1, pitch: 0.5 });
          await s.wait(1.6);
          await s.say('SCARLET', 'Ivy — get behind the booth. Don\'t look.', 2.4);
          p.sceneStyle = 'fight';
          p.sceneGuard = 1;
          await s.wait(0.4);
        });
        p.sceneStyle = 'relaxed';
        p.sceneGuard = 0.35;
        g.cam.yaw = s.behindYaw(yawTo(p, zero));
        s.boss(zero, { name: 'SUBJECT ZERO', sub: 'WHAT THEY MAKE OF PEOPLE', kick: 'B3' });
        s.objective('SUBJECT ZERO', 'Stay out of his reach — stun him, then hit him while he reels');
        await s.fight([zero], { pressure: 5 });
        s.flags.zero = { x: zero.x, z: zero.z };
      },
    },
    // ------------------------------------------------------------------ out
    {
      name: 'OUT',
      resume(s) {
        s.place(T.ivyTank.x + 1.6, T.ivyTank.z - 4, Math.PI);
      },
      async play(s) {
        const g = s.game;
        const p = g.player;
        await s.scene(async () => {
          const I = ivy;
          if (I) {
            I.hold(null, 0.3);
            I.walk([[p.x - 1.2, p.z + 1.0]], 2.2);
          }
          s.shot({ pos: [p.x + 2.4, 1.6, p.z + 2.6], look: [p.x, 1.3, p.z], fov: 36, dur: 6 });
          await s.wait(1.6);
          await s.say('IVY', 'Is it dead?', 1.4);
          await s.say('SCARLET', 'It was somebody, once. Come on. Stay right behind me.', 3.0);
          s.bark('GUARD', '<em>(speaker)</em> All units to B3. The Reyes woman is in containment. Lethal force.', 3.6, null);
          await s.wait(1.2);
        });
        follow = true;
        followT = 0;
        s.objective('OUT', 'The service stairs at the south end — up to the river. Bring her');
        // the last of them, down the stairs at her
        const wave1: Enemy[] = [s.enter('brawler', 1, 0), s.enter('club', 1, 1)];
        await s.fight(wave1, { pressure: 3 });
        // and the lift behind them: the riot team, in through the decontamination corridor
        s.bark('GUARD', '<em>(speaker)</em> Riot team to B3. She has the subject with her. Do not let them reach the stairs.', 3.6, null);
        await s.wait(2.0, false);
        s.objective('THE RIOT TEAM', 'Down from the lift behind you — keep them off her');
        const wave2: Enemy[] = [s.enter('defender', 0, 0), s.enter('club', 0, 1), s.enter('brawler', 0, 2)];
        s.when(() => wave2.filter((e) => e.alive).length === 1, () => s.bark('IVY', 'Scar — behind you!', 1.6, ivy));
        await s.fight(wave2, { pressure: 3 });
        s.objective('OUT', 'The service stairs at the south end — up to the river. Bring her');
        s.ui.marker(V(0, 4.2 + 1.2, T.stairs.z1 + 1.5), 'EXIT');
        await s.until(() => p.y > 3.6 && p.z > T.stairs.z1, false);
        s.ui.marker(null);
        follow = false;
        await s.scene(async () => {
          // the door at the top; grey daylight
          const I = ivy;
          if (I) {
            I.x = p.x - 0.8;
            I.z = p.z - 1.2;
            I.setY(4.2);
            I.anim.initAt(I.x, I.z, 0);
            I.hold(null, 0.01);
          }
          s.shot({ pos: [1.2, 5.6, T.stairs.z1 - 1.2], look: [0, 5.4, T.stairs.z1 + 3], fov: 44, dur: 6 });
          await s.wait(1.6);
          await s.say('IVY', 'Is it morning?', 1.4);
          await s.say('SCARLET', 'Nearly.', 1.4);
          s.ui.fade(true, 2.4);
          await s.wait(2.6);
        });
        void outfitVariant;
      },
    },
  ],
};
