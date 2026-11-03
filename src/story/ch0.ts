import * as THREE from 'three';
import type { Enemy } from '../ai/enemy';
import { yawFromDir } from '../core/math';
import type { Chapter, Story } from './runner';
import { animateAlley, ClubBass, dressAlley, stage } from './staging';
import { LANTERN as LV } from '../world/level/lantern';
import { CIVILIANS } from '../character/variants';

/**
 * PROLOGUE — LAST CALL. Kessler Street and the alley behind the Lantern, 11:46 PM.
 *
 * Ivy's last texts; a cab leaves Scarlet at the bottom of Kessler Street and she walks up it in the
 * rain to the Lantern's front door, where the man on it sends her home; round the back by the lane
 * (over a fence, over a wall of crates, under a shutter: the climbing lesson) and through the
 * block into the alley, where the crew at the drum fire is waiting for her (the fight that teaches
 * the fight); the door's shut - Ivy's lanyard
 * on the ground beside it - and the crew comes over the fence (red attacks, blades, weapons);
 * Doyle the doorman comes out to finish it (stuns, vaults, finishers); his pistol (the special);
 * the club empties out; his phone buzzes - the Butcher, Dock 4 - and she answers it.
 *
 * The alley's doors: 0 the north side door, 1 the Lantern's back door, 2 the south block's door,
 * 3 the street, 4 the gate in the west fence.
 */
const DOOR = { x: 6, z: -11 };
const DRUM = { x: -5.6, z: 2.4 };
const STREET = 3, LANTERN = 1, SOUTH = 2, GATE = 4;
const yawTo = (a: { x: number; z: number }, b: { x: number; z: number }) => yawFromDir(b.x - a.x, b.z - a.z);
const V = (x: number, y: number, z: number) => new THREE.Vector3(x, y, z);

let bass: ClubBass | null = null;
let clock = 0;

export const CH0: Chapter = {
  id: 0,
  kick: 'PROLOGUE',
  title: 'LAST CALL',
  place: 'KESSLER STREET',
  clock: '11:46 PM',
  map: 'lantern',
  outfit: 'leather',
  synopsis: 'Ivy texted from the Lantern\'s back door an hour ago. Nobody\'s answered since.',
  par: 560,
  dress: dressAlley,
  backdrop: { pos: [3.6, 0.5, -7.6], look: [6.0, 2.6, -11], pos2: [4.6, 0.6, -8.8], look2: [6.0, 3.0, -11], fov: 42, dur: 45 },
  next: { kick: 'CHAPTER ONE', title: 'MEAT MARKET', line: 'Dock 4. Six heads on a truck, and the Butcher counting them.' },
  setup(s) {
    const g = s.game;
    if (g.audio.ctx) bass = new ClubBass(g.audio.ctx, g.audio.amb);
    const st = LV.start;
    s.place(st.x, st.z, st.yaw);
    // (no gun yet: it's Doyle's, and he's still behind that door)
    g.player.specialLocked = true;
    g.player.specialCharges = 0;
    // things to find round the back
    s.pickup('note', [10.6, 0.02, 30.6], { id: 'p0-flyer', title: 'A flyer, wet through', text: 'THE LANTERN · THURSDAYS · VIP NIGHT\nMembers and their guests.\n\nOn the back, in Ivy\'s writing:\nswap w/ Mara — I do Thurs 11-close, she does my Sat\nDON\'T tell Scar' });
    s.pickup('photo', [-4.55, 1.62, 26.8], { id: 'p0-strip', title: 'A photo-booth strip', text: 'Four frames. Ivy pulling a face; Scarlet trying not to laugh; both of them laughing; the last one blurred - somebody pulled the curtain.\n\nPinned above the staff lockers with a bar tab.' });
    s.pickup('medkit', [-3.95, 0.02, 15.2]);
    // Kessler Street at a quarter to midnight: the Lantern's queue, the bus stop, people about
    if (s.cp <= 1) {
      const D = LV.door;
      const q: [number, number, number][] = [[16.15, D.z + 3.4, 0], [16.25, D.z + 4.3, 1], [16.1, D.z + 5.4, 2], [16.3, D.z + 6.3, 3], [16.15, D.z + 7.5, 4]];
      const poses = [null, 'st_phone', null, 'st_smoke', 'st_crossed'];
      for (const [x, z, i] of q) s.extra(i % 2 ? CIVILIANS.men[i % CIVILIANS.men.length] : CIVILIANS.women[i % CIVILIANS.women.length], x, z, Math.PI, { pose: poses[i], chat: i === 0 || i === 2 ? 0.8 : 0, lookAt: i === 0 ? { x: 16.25, z: D.z + 4.3 } : i === 2 ? { x: 16.25, z: D.z + 4.3 } : undefined });
      const b = s.extra('civ_b05', LV.bouncer.x, LV.bouncer.z, Math.PI / 2 + 0.3, { pose: 'st_crossed' });
      if (b) s.cast('BOUNCER', b);
      s.extra('civ_f17', 27.0, 29.6, -Math.PI / 2, { pose: 'st_phone' });
      s.extra('civ_m02', 27.2, 31.6, -Math.PI / 2 - 0.4, { chat: 0.6, lookAt: { x: 27.0, z: 29.6 } });
      s.extra('civ_m18', 15.0, 43.5, Math.PI / 2, { pose: 'st_smoke' });
      s.extra('civ_cook', 27.7, 38.8, -Math.PI / 2, { pose: 'st_crossed' });
      s.extra('civ_f05', 27.2, 66, Math.PI, { loop: [[27.2, -40], [27.2, 66]] });
      s.extra('civ_m04', 27.4, 60, Math.PI, { loop: [[27.4, -38], [27.4, 62]] });
      s.extra('civ_f11', 15.3, -40, 0, { loop: [[15.3, 50], [15.3, -40]] });
      s.extra('civ_m12', 14.7, 22.5, Math.PI / 2, { pose: 'st_sitwall' });
    }
  },
  tick(s, dt) {
    clock += dt;
    animateAlley(dt, clock);
    const p = s.game.player;
    // (the bass through the back door; out front, through the Lantern's own doors)
    const back = Math.hypot(p.x - DOOR.x, p.z - DOOR.z), front = Math.hypot(p.x - LV.door.x, p.z - LV.door.z) + 4;
    bass?.update(Math.min(back, front), Math.max(stage.lantern?.open ?? 0, front < back ? 0.35 : 0), dt);
  },
  segments: [
    // ------------------------------------------------------------------ Kessler Street
    {
      name: 'KESSLER STREET',
      async play(s) {
        const g = s.game;
        const p = g.player;
        const st = LV.start;
        await s.scene(async () => {
          // Ivy's last texts, on black
          await s.phone({ name: 'Ivy', initial: 'I', sub: 'mobile', clock: '9:14' }, [
            { dir: 'in', time: 'Today 9:14 PM', text: 'covering a double tonight. don\'t wait up', wait: 2.0, clock: '9:14' },
            { dir: 'in', time: '10:31 PM', text: 'there\'s a guy at the bar asking about you', wait: 1.8, typing: 1.0, clock: '10:31' },
            { dir: 'in', text: 'says he knows you from palewater??', wait: 1.8, typing: 0.9, clock: '10:32' },
            { dir: 'out', time: '10:40 PM', text: 'what guy. what\'s his name', status: 'Read 10:41 PM', wait: 2.0, clock: '10:40' },
            { dir: 'in', time: '10:58 PM', text: 'scar something\'s wrong', wait: 1.4, typing: 1.2, clock: '10:58' },
            { dir: 'in', text: 'they locked the front doors', wait: 1.4, typing: 0.8 },
            { dir: 'in', time: '11:03 PM', text: 'back door. come get me', wait: 2.0, typing: 1.0, clock: '11:03' },
            { dir: 'out', time: '11:04 PM', text: 'on my way. stay where people can see you', status: 'Delivered', wait: 2.2, clock: '11:04' },
            { dir: 'out', time: '11:39 PM', text: 'ivy?', status: 'Delivered', wait: 1.8, clock: '11:39' },
            { dir: 'out', time: '11:45 PM', text: 'i\'m outside', status: 'Not delivered', fail: true, wait: 2.6, clock: '11:45' },
          ]);
          s.ui.phoneClose();
          await s.wait(0.6);
          s.ui.card('PROLOGUE', 'LAST CALL', 'KESSLER STREET', '11:46 PM');
          await s.wait(4.4);
          // the cab pulls away; the rain; the street, up to the Lantern's sign
          s.shot({ pos: [19.8, 0.9, 71.2], look: [16.4, 1.7, 60.5], pos2: [19.2, 1.15, 70.2], look2: [16.0, 1.9, 58], fov: 40, dur: 7 });
          s.ui.cardHide();
          s.ui.fade(false, 1.8);
          await s.wait(1.4);
          s.ui.stamp('KESSLER STREET', '11:46 PM');
          const walked = s.walk(st.x, st.z - 4.6, { speed: 1.35 });
          await s.wait(3.0);
          s.shot({ pos: [st.x - 0.55, 1.58, st.z - 7.6], look: [16.0, 4.6, -20], fov: 30, dur: 6 });
          await walked;
          s.face(Math.PI);
          await s.wait(0.6);
          // she tries her once more
          s.pose('st_phone', 0.4);
          s.closeUp(p, { side: 1, fov: 30, dist: 1.25, dur: 6 });
          s.ui.phoneCall('Ivy', 'I', 'calling…', '11:46');
          await s.wait(2.6);
          s.ui.phoneCall('Ivy', 'I', 'no answer', '11:46');
          await s.wait(1.0);
          s.ui.phoneClose();
          await s.say('SCARLET', 'Come on, Ivy.');
          s.pose(null, 0.4);
        });
        s.objective('THE LANTERN', 'Up Kessler Street');
        // (the queue grumbles as she goes by it)
        s.when(() => Math.hypot(p.x - 16, p.z - (LV.door.z + 8)) < 3, () => {
          const q = s.extras.find((n) => Math.abs(n.z - (LV.door.z + 7.5)) < 0.3);
          s.bark('', 'Forty minutes. They\'re not letting anybody in.', 3, q ?? null);
        });
        await s.reach(LV.door.x + 1.3, LV.door.z + 2.6, 2.2, 'THE LANTERN');
        const bouncer = s.actorOf('BOUNCER');
        await s.scene(async () => {
          const at = { x: LV.door.x + 1.25, z: LV.door.z + 1.7 };
          await s.walk(at.x, at.z, { face: yawTo(at, LV.bouncer) });
          if (bouncer) {
            (bouncer as unknown as { hold(p: string | null): void }).hold(null);
            bouncer.lookAt = p;
          }
          s.overShoulder(p, bouncer ?? LV.bouncer, { side: 1, dist: 1.0, fov: 32, dur: 6 });
          await s.say('BOUNCER', 'Line\'s back there.');
          s.closeUp(p, { side: -1, fov: 30, dist: 1.2, dur: 6 });
          await s.say('SCARLET', 'I\'m not here to dance. My sister works the bar. Ivy.');
          if (bouncer) s.closeUp(bouncer, { side: 1, fov: 30, dist: 1.4, dur: 7 });
          await s.wait(0.6);
          await s.say('BOUNCER', 'Bar\'s closed to staff tonight. Private party.');
          s.overShoulder(bouncer ?? LV.bouncer, p, { side: -1, dist: 0.95, fov: 32, dur: 6 });
          await s.say('SCARLET', 'Then get her out here.');
          if (bouncer) s.closeUp(bouncer, { side: -1, fov: 28, dist: 1.25, dur: 7 });
          await s.wait(0.5);
          await s.say('BOUNCER', 'Go home, miss.');
          await s.wait(0.4);
          await s.say('BOUNCER', '...I mean it. Go home.');
          // she looks down the street: the alley's gate, chained, the lane past the block
          s.shot({ pos: [16.4, 1.65, LV.door.z + 0.6], look: [14.2, 1.5, 8], fov: 30, dur: 6 });
          s.face({ x: 14.6, z: 10 });
          await s.wait(1.6);
          await s.say('SCARLET', 'Back door, she said.');
        });
        if (bouncer) (bouncer as unknown as { hold(p: string | null): void }).hold('st_crossed');
        s.objective('ANOTHER WAY IN', 'The alley\'s gate is chained — round the back of the block');
      },
    },
    // ------------------------------------------------------------------ the lane
    {
      name: 'THE LANE',
      resume(s) {
        s.place(LV.laneMouth.x - 0.6, LV.laneMouth.z, -Math.PI / 2);
      },
      async play(s) {
        const g = s.game;
        const p = g.player;
        s.objective('ROUND THE BACK', 'The lane south of the block');
        await s.reach(LV.laneMouth.x - 1.5, LV.laneMouth.z, 2.4, 'THE LANE');
        // over the gate, over the crates, under the shutter: the ways over the world
        await s.tutor(['SPACE'], 'CLIMB', 'At a fence, a wall, a ledge: SPACE to climb it', () => (p.x < LV.fence.x - 0.5 ? 1 : 0), 1, undefined, [LV.fence.x - 1.4, LV.fence.z]);
        await s.tutor(['SPACE'], 'UP AND OVER', 'Climb the crates; walk off the far side, or SPACE to climb down', () => (p.x < LV.crates.x - 1.1 && p.y < 0.2 ? 1 : 0), 1, undefined, [LV.crates.x - 1.9, LV.crates.z]);
        await s.reach(LV.shutter.x, LV.shutter.z + 1.3, 1.6, 'THE SHUTTER');
        await s.tutor(['C'], 'CROUCH', 'Low and quiet: under the shutter. C again to stand', () => (p.z < LV.shutter.z - 0.6 ? 1 : 0), 1, undefined, [LV.shutter.x, LV.shutter.z - 1.4]);
        s.objective('THROUGH THE BLOCK', 'The corridor comes out in the alley');
        s.ui.stamp('THE BLOCK · BACK STAIRS', '11:51 PM');
        await s.reach(LV.storeDoor.x, LV.storeDoor.z + 1.2, 1.2, 'DOOR');
        if (p.crouched) p.setCrouch(false);
      },
    },
    // ------------------------------------------------------------------ the alley
    {
      name: 'THE ALLEY',
      resume(s) {
        s.place(-3.4, 8.4, Math.PI);
      },
      async play(s) {
        const g = s.game;
        const p = g.player;
        // out front nobody's watching any more: the street's people are off the stage
        s.clearExtras();
        // round the drum fire: three of the crew, waiting
        const dez = s.spawn('brawler', -4.72, 1.98, yawTo({ x: -4.72, z: 1.98 }, DRUM), { variant: 'brawler2', pose: 'st_warm' });
        const b = s.spawn('brawler', -6.4, 2.95, yawTo({ x: -6.4, z: 2.95 }, DRUM), { variant: 'brawler0', pose: 'st_warm' });
        const c = s.spawn('brawler', -5.2, 3.45, Math.PI / 2 - 0.3, { variant: 'brawler4', pose: 'st_smoke' });
        const crew = [dez, b, c];
        s.cast('DEZ', dez);
        s.cast('KX', b);
        await s.scene(async () => {
          // the door at the end of the corridor; the alley; the fire
          g.audio.play('metal_hit', { pos: V(-4, 1.2, 11.2), vol: 0.5, pitch: 0.7 });
          p.ghostWalls = true;
          const HERE = { x: -3.3, z: 7.9 };
          s.shot({ pos: [-7.6, 1.7, 0.6], look: [-4, 1.4, 10.6], pos2: [-7.2, 1.7, 0.9], fov: 34, dur: 5 });
          const walked = s.walk(HERE.x, HERE.z, { speed: 1.3, face: yawTo(HERE, DRUM) });
          await s.wait(0.6);
          s.ui.stamp('THE LANTERN · BACK ALLEY', '11:52 PM');
          await walked;
          p.ghostWalls = false;
          dez.idlePose = null;
          dez.anim.toLoco(0.4);
          dez.idleFace = yawTo(dez, p);
          await s.wait(0.8);
          s.closeUp(dez, { side: -1, fov: 30, dist: 1.4, dur: 4 });
          await s.wait(0.3);
          await s.say('DEZ', 'Told you she\'d come.');
          c.idleFace = yawTo(c, p);
          // he comes away from the fire to look at her
          const DEZ_AT = { x: -3.6, z: 5.0 };
          dez.idleTo = DEZ_AT;
          dez.idleFace = yawTo(DEZ_AT, HERE);
          s.closeUp(p, { side: 1, fov: 32, dur: 5 });
          await s.wait(0.3);
          await s.say('SCARLET', 'I\'m looking for my sister. Ivy. She tends bar here.');
          await s.until(() => !dez.idleTo, true, 5);
          s.overShoulder(p, dez, { side: -1, dist: 0.9, fov: 30, dur: 5 });
          await s.wait(0.5);
          await s.say('DEZ', 'Tended.');
          s.closeUp(p, { side: -1, fov: 28, dist: 1.05, dur: 3.5 });
          await s.wait(1.3);
          await s.say('SCARLET', 'Where is she.');
          s.closeUp(dez, { side: 1, fov: 30, dur: 4 });
          await s.say('DEZ', 'Some guy at the bar said you\'d come asking.');
          s.overShoulder(p, dez, { side: -1, dist: 1.1, fov: 34, dur: 5 });
          // the other two leave the fire and spread out
          b.idlePose = null;
          b.anim.toLoco(0.3);
          b.idleTo = { x: -0.6, z: 6.4 };
          b.idleFace = yawTo({ x: -0.6, z: 6.4 }, HERE);
          c.idlePose = null;
          c.anim.toLoco(0.3);
          c.idleTo = { x: -6.6, z: 6.8 };
          c.idleFace = yawTo({ x: -6.6, z: 6.8 }, HERE);
          await s.say('DEZ', 'Said to make it quick.');
          p.sceneStyle = 'fight';
          p.sceneGuard = 1;
          s.shot({ pos: [-0.4, 1.55, 9.6], look: [-4.6, 1.25, 3.6], fov: 40, dur: 3 });
          await s.wait(0.5);
          await s.say('SCARLET', 'You first.');
        });
        p.sceneStyle = 'relaxed';
        p.sceneGuard = 0.35;
        g.cam.yaw = s.behindYaw(yawTo(p, dez));
        // ---- the fight that teaches the fight
        s.objective('THE CREW AT THE FIRE', 'They know where Ivy went');
        let done = false;
        const lessons = (async () => {
          await s.tutor(['LMB'], 'STRIKE', 'Steer toward one and strike — chain from man to man', () => p.stats.hits, 4, () => done);
          await s.tutor(['RMB'], 'COUNTER', 'When a gold bolt shows over one of them — late is perfect', () => p.stats.counters, 1, () => done);
          await s.tutor(['SPACE'], 'DODGE', 'Toward a man to vault over him', () => p.stats.dodges, 1, () => done);
        })();
        // two more come out of the block's back door when it's going badly for them
        s.when(() => crew.filter((e) => e.alive).length <= 1, () => {
          s.bark('KX', 'Hey — HEY! Get out here!');
          s.enter('brawler', SOUTH, 0);
          s.enter('brawler', SOUTH, 1);
        });
        await s.fight(crew, { pressure: 1, spread: 0.6 });
        done = true;
        await lessons;
        s.hideTutor();
      },
    },
    // ------------------------------------------------------------------ the Lantern's door
    {
      name: 'THE BACK DOOR',
      resume(s) {
        s.place(2.2, -2.4, yawTo({ x: 2.2, z: -2.4 }, DOOR));
      },
      async play(s) {
        const g = s.game;
        const p = g.player;
        s.objective('THE LANTERN', 'Ivy said the back door');
        await s.reach(DOOR.x + 0.15, -9.55, 1.6, 'BACK DOOR');
        const wave: Enemy[] = [];
        await s.scene(async () => {
          await s.walk(6.1, -10.2, { face: Math.PI });
          s.shot({ pos: [7.9, 1.45, -8.9], look: [6.0, 1.35, -10.9], fov: 36, dur: 4 });
          g.audio.play('metal_hit', { pos: V(6, 1.1, -11), vol: 0.55, pitch: 0.8 });
          await s.wait(0.45);
          g.audio.play('metal_hit', { pos: V(6, 1.1, -11), vol: 0.5, pitch: 0.75 });
          await s.wait(0.7);
          await s.say('SCARLET', 'Ivy!');
          await s.wait(0.9);
          // nothing but the bass. Then, by her boot: a staff lanyard
          s.shot({ pos: [5.3, 1.25, -8.7], look: [6.7, 0.05, -9.6], pos2: [5.45, 1.05, -8.85], fov: 34, dur: 3.5 });
          s.face({ x: 6.7, z: -9.65 });
          await s.wait(1.4);
          await s.walk(6.45, -9.2, { face: yawTo({ x: 6.45, z: -9.2 }, { x: 6.7, z: -9.65 }) });
          s.pose('st_crouch');
          await s.wait(0.9);
          if (stage.lantern) stage.lantern.lanyard.visible = false;
          s.closeUp(p, { side: 1, dist: 1.2, fov: 34, dur: 8, turn: 0.75, dy: -0.28 });
          await s.wait(0.4);
          await s.say('SCARLET', 'Her lanyard.');
          await s.wait(0.5);
          await s.say('SCARLET', 'She made it as far as the door.');
          s.pose(null, 0.5);
          // the gate in the fence rattles: more of them, blades out, against the fire
          g.audio.play('metal_hit', { pos: V(-13, 1.2, 0), vol: 0.8, pitch: 0.6 });
          wave.push(s.enter('knife', GATE, 0), s.enter('knife', GATE, 1), s.enter('club', SOUTH, 0));
          s.shot({ pos: [-8.4, 1.45, 2.1], look: [-13, 1.25, -0.2], pos2: [-8.8, 1.45, 1.9], fov: 38, dur: 4 });
          await s.wait(1.2);
          await s.say('KX', 'There! By the door!', 1.6);
          await s.wait(0.6);
        });
        // ---- blades and bats: over the fence, out of the block
        s.objective('SURVIVE', 'They\'re not here to talk');
        let done = false;
        const lessons = (async () => {
          await s.until(() => g.director.incoming.some((i) => !i.counterable) || done, false);
          if (!done) await s.tutor(['SPACE'], 'DODGE THE RED', 'A red warning can\'t be countered — get out of its way', () => p.stats.dodges, 1, () => done);
          const wp = new THREE.Vector3();
          await s.until(() => g.weapons.some((w) => w.pickable && w.worldPos(wp).distanceTo(V(p.x, wp.y, p.z)) < 6) || done, false);
          if (!done) await s.tutor(['E'], 'PICK IT UP', 'Counter a blade to take it off him — E picks a weapon up, G throws it', () => (p.weapon ? 1 : 0) + p.stats.disarms, 1, () => done);
        })();
        s.when(() => wave.filter((e) => e.alive).length <= 1, () => {
          openStreetGate(s);
          s.enter('brawler', STREET, 0);
          s.enter('agile', STREET, 1);
          s.bark('KX', 'Street side — cut her off!');
        });
        await s.fight(wave, { pressure: 4 });
        done = true;
        await lessons;
        s.hideTutor();
      },
    },
    // ------------------------------------------------------------------ the doorman
    {
      name: 'THE DOORMAN',
      resume(s) {
        openStreetGate(s);
        s.place(3.4, -4.6, yawTo({ x: 3.4, z: -4.6 }, DOOR));
        if (stage.lantern) stage.lantern.lanyard.visible = false;
      },
      async play(s) {
        const g = s.game;
        const p = g.player;
        s.objective(null);
        let doyle!: Enemy;
        await s.scene(async () => {
          // she squares up to the door; it bangs open from inside
          void s.walk(5.0, -5.9, { face: yawTo({ x: 5.0, z: -5.9 }, DOOR) });
          s.shot({ pos: [3.2, 0.62, -6.2], look: [6.0, 1.5, -10.6], fov: 40, dur: 6 });
          await s.wait(1.4);
          g.audio.play('metal_hit', { pos: V(6, 1.2, -11), vol: 1, pitch: 0.55 });
          g.audio.thump(1.2, V(6, 1, -11));
          g.cam.addTrauma(0.15);
          if (stage.lantern) stage.lantern.want = 1;
          doyle = s.spawn('bouncer', 6.05, -12.6, 0, { variant: 'doyle' });
          s.cast('DOYLE', doyle);
          doyle.ghostWalls = true;
          doyle.idleTo = { x: 6.0, z: -8.9 };
          doyle.idleFace = yawTo({ x: 6.0, z: -8.9 }, p);
          await s.until(() => !doyle.idleTo, true, 5);
          doyle.ghostWalls = false;
          s.closeUp(doyle, { side: -1, fov: 32, dist: 1.5, dur: 5 });
          await s.wait(0.5);
          await s.say('DOYLE', 'That\'s enough noise.');
          s.overShoulder(doyle, p, { side: 1, dist: 0.9, fov: 34, dur: 5 });
          await s.say('DOYLE', 'Look at this. You\'re the sister.');
          s.overShoulder(p, doyle, { side: -1, dist: 1.0, fov: 32, dur: 8 });
          await s.say('SCARLET', 'Where is she?');
          await s.say('DOYLE', 'Gone. Truck left at eleven.');
          s.closeUp(p, { side: -1, fov: 28, dist: 1.1, dur: 3 });
          await s.say('SCARLET', 'Where.');
          s.closeUp(doyle, { side: 1, fov: 28, dist: 1.4, dur: 9 });
          await s.say('DOYLE', 'Nothing personal, sweetheart. Somebody wanted her. Somebody wants you gone.');
          await s.say('DOYLE', 'And I\'m the door. Nobody gets past the door.');
          p.sceneStyle = 'fight';
          p.sceneGuard = 1;
          s.overShoulder(doyle, p, { side: 1, dist: 0.9, fov: 30, dur: 3 });
          await s.say('SCARLET', 'Watch me.');
        });
        p.sceneStyle = 'relaxed';
        p.sceneGuard = 0.35;
        g.cam.yaw = s.behindYaw(yawTo(p, doyle));
        s.boss(doyle, { name: 'DOYLE', sub: 'THE LANTERN\'S DOOR', kick: 'THE DOORMAN' });
        s.flags.doyleDown = false;
        s.objective('DOYLE', 'He keeps the door');
        s.onBossPhase = (e, phase) => {
          if (e !== doyle || phase !== 2) return false;
          s.bark('DOYLE', 'Get out here! ALL of you!');
          s.enter('brawler', LANTERN, 0);
          s.enter('brawler', LANTERN, 1);
          return true;
        };
        let stunned = 0;
        s.when(() => doyle.state === 'stunned', () => (stunned = 1));
        let done = false;
        const lessons = (async () => {
          await s.wait(2.5, false);
          await s.tutor(['Q'], 'STUN HIM', 'Big men shrug off blows — stun first, then hit him while he reels', () => stunned, 1, () => done);
          await s.tutor(['SPACE'], 'VAULT', 'Dodge toward him to go over the top — it dazes him', () => (doyle.vaulted > 0 ? 1 : 0), 1, () => done);
          await s.until(() => p.charges > 0 || done, false);
          if (!done) await s.tutor(['F'], 'FINISHER', 'A combo fills the diamonds — spend one to end a man', () => p.stats.finishers + p.stats.takedowns, 1, () => done);
        })();
        // a line when he's hurting
        s.when(() => doyle.hp < doyle.maxHp * 0.25 && doyle.alive, () => s.bark('DOYLE', 'You don\'t even know who you\'re fighting for.'));
        await s.fight([doyle], { pressure: 3 });
        done = true;
        s.onBossPhase = null;
        s.flags.doyle = { x: doyle.x, z: doyle.z };
        await lessons;
        s.hideTutor();
      },
    },
    // ------------------------------------------------------------------ last call
    {
      name: 'LAST CALL',
      resume(s) {
        openStreetGate(s);
        if (stage.lantern) {
          stage.lantern.want = 1;
          stage.lantern.open = 1;
          stage.lantern.lanyard.visible = false;
        }
        const d = (s.flags.doyle as { x: number; z: number } | undefined) ?? { x: 6, z: -8 };
        s.place(d.x + 1.6, d.z + 1.4, yawTo({ x: d.x + 1.6, z: d.z + 1.4 }, d));
      },
      async play(s) {
        const g = s.game;
        const p = g.player;
        s.objective(null);
        const d = (s.flags.doyle as { x: number; z: number } | undefined) ?? { x: 6, z: -8 };
        // his gun
        const wave: Enemy[] = [];
        await s.scene(async () => {
          const at = { x: d.x + 0.75, z: d.z + 0.55 };
          await s.walk(at.x, at.z, { face: yawTo(at, d) });
          s.pose('st_crouch');
          s.shot({ pos: [at.x + 1.3, 1.05, at.z + 1.2], look: [d.x + 0.2, 0.35, d.z + 0.1], pos2: [at.x + 1.15, 0.95, at.z + 1.05], fov: 34, dur: 2 });
          await s.wait(1.0);
          s.closeUp(p, { side: 1, dist: 1.2, fov: 34, dur: 5, turn: 0.7, dy: -0.28 });
          await s.wait(0.4);
          g.audio.play('metal_hit', { pos: V(d.x, 0.4, d.z), vol: 0.3, pitch: 2.2 });
          s.givePistol(1);
          s.ui.item('TAKEN', 'SUPPRESSED PISTOL', 'Two shots, one man · knockouts load it', 4.5);
          await s.wait(1.6);
          await s.say('SCARLET', 'Seven rounds.');
          s.pose(null, 0.4);
          // the club's heard: out of the door they come
          wave.push(s.enter('brawler', LANTERN, 0), s.enter('brawler', LANTERN, 1));
          s.shot({ pos: [3.4, 1.25, -5.8], look: [6.0, 1.45, -10.6], fov: 36, dur: 4 });
          await s.wait(0.8);
          await s.say('KX', 'Doyle? ...DOYLE\'S DOWN!', 1.8);
          wave.push(s.enter('club', LANTERN, 0));
          await s.wait(0.4);
        });
        g.cam.yaw = s.behindYaw(yawTo(p, DOOR));
        s.objective('THE CLUB EMPTIES OUT');
        let done = false;
        const lessons = (async () => {
          await s.wait(1.2, false);
          await s.tutor(['R'], 'PISTOL', 'One round loaded — steer to pick who gets it', () => p.stats.specials, 1, () => done);
        })();
        await s.fight(wave, { pressure: 3 });
        done = true;
        await lessons;
        s.hideTutor();
        s.objective(null);
        // his phone
        await s.scene(async () => {
          g.audio.buzz(0.9);
          await s.wait(0.6);
          s.face(d);
          const at = { x: d.x + 0.7, z: d.z + 0.6 };
          await s.walk(at.x, at.z, { face: yawTo(at, d) });
          s.pose('st_crouch');
          await s.wait(0.7);
          s.pose('st_phone', 0.5);
          s.shot({ pos: [at.x + 1.1, 1.5, at.z + 0.9], look: [at.x, 1.25, at.z], fov: 30, dur: 12 });
          await s.wait(0.6);
          await s.phone({ name: 'BUTCHER', initial: 'B', sub: 'KX', clock: '11:58' }, [
            { dir: 'in', time: 'Today 11:02 PM', text: 'truck loaded. 6 head. dock 4 by one', wait: 2.2 },
            { dir: 'in', time: '11:03 PM', text: 'the barmaid is RESERVED. vipers orders. nobody touches her', wait: 2.8, typing: 0.6 },
            { dir: 'in', time: '11:49 PM', text: 'sister shows up you bury her in the alley', wait: 2.4, typing: 0.6 },
            { dir: 'in', time: '11:58 PM', text: 'doyle??', wait: 2.0, typing: 0.8 },
            { dir: 'out', time: '11:59 PM', text: 'on my way.', status: 'Delivered', wait: 2.6, typing: 1.4 },
          ]);
          s.ui.phoneClose();
          s.pose(null, 0.5);
          await s.wait(0.6);
          // out to the street; the sign stutters behind her
          s.shot({ pos: [4.5, 1.7, -4.4], look: [13, 1.45, 0.3], fov: 34, dur: 7 });
          p.ghostWalls = true;
          void s.walk(16.5, 0.4, { speed: 1.5 });
          await s.wait(4.5);
          s.ui.fade(true, 1.6);
          await s.wait(2.0);
          p.ghostWalls = false;
        });
        bass?.stop(2.5);
      },
    },
  ],
};

/** The crew unchain the alley's street gate (it swings in against the wall: the way out's open). */
function openStreetGate(s: Story) {
  const a = s.game.arena;
  const ob = a.obstacles.find((o) => o.name === 'alley gate');
  if (!ob) return;
  a.obstacles = a.obstacles.filter((o) => o !== ob);
  a.heightsChanged();
  const m = a.group.getObjectByName('alleyGate');
  if (m) {
    m.rotation.y = 0.2;
    m.position.set(LV.gate.x - 0.3, m.position.y, 2.4 + 2.4);
    m.scale.x = 0.98;
  }
  s.game.audio.play('metal_hit', { pos: V(LV.gate.x, 1.2, 0), vol: 0.6, pitch: 0.65 });
}
