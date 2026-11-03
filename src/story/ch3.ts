import * as THREE from 'three';
import type { Enemy } from '../ai/enemy';
import { yawFromDir } from '../core/math';
import type { Chapter, Story } from './runner';
import { ROOFS } from '../world/level/roofs';
import { Weapon } from '../combat/weapons';

/**
 * CHAPTER THREE — RAIN. The roofs north from the Lantern, 2:58 AM, in the rain, in her sister's
 * jacket. Branko's men up through the hatch behind her; over the first gap, down onto a roof of
 * washing lines where the two who went round by the stairs are waiting with a third; up a ladder
 * onto an office block under a billboard for the tower she's going to (men up there with torches,
 * and a voice on their radios); over another gap onto a tenement roof, where they've set a trap;
 * up the fire escape onto the neon roof - and Kael, who trained every one of them, waiting in the
 * rain. "Voss."
 */
const yawTo = (a: { x: number; z: number }, b: { x: number; z: number }) => yawFromDir(b.x - a.x, b.z - a.z);
const V = (x: number, y: number, z: number) => new THREE.Vector3(x, y, z);
const R1 = ROOFS.r1, R2 = ROOFS.r2, R3 = ROOFS.r3, R4 = ROOFS.r4;
/** Kael's own: the men he trained (their tracksuits and gis). */
const CREW = ['agile0', 'agile1', 'agile2'];

/** Put her at (x, z) on whatever roof is there. */
function at(s: Story, x: number, z: number, yaw: number) {
  s.place(x, z, yaw);
  const g = s.game;
  g.player.setY(g.arena.groundAt(x, z, 60));
}

/** Someone on a roof (idle, or straight into it). */
function man(s: Story, key: string, x: number, z: number, yaw: number, o: { variant?: string; pose?: string; watch?: boolean; patrol?: [number, number, number?][]; vision?: number } = {}) {
  return s.spawn(key, x, z, yaw, { ...o, y: s.game.arena.groundAt(x, z, 60) });
}

export const CH3: Chapter = {
  id: 3,
  kick: 'CHAPTER THREE',
  title: 'RAIN',
  place: 'THE ROOFTOPS · KESSLER STREET',
  clock: '2:58 AM',
  map: 'roofs',
  outfit: 'denim',
  synopsis: 'Six roofs between the Lantern and the tower. Kael is waiting on the last one.',
  par: 660,
  backdrop: { pos: [-6, 4.5, 16], look: [0, 1.5, -6], pos2: [-5, 4.4, 15], look2: [0, 2, -8], fov: 46, dur: 45 },
  next: { kick: 'CHAPTER FOUR', title: 'MERIDIAN', line: 'Sixty-one floors. The viewing is at four. Voss picks first.' },
  setup(s) {
    const st = ROOFS.start;
    at(s, st.x, st.z, st.yaw);
    // (Doyle's pistol, still in her jacket)
    s.givePistol(1);
    s.pickup('note', [5.2, R2.y + 0.62, 106], { id: 'c3-note', title: 'A note pegged to the washing line', text: 'TO WHOEVER KEEPS TAKING MY SHEETS —\n\nI know it\'s you, Mrs. Abara.\nI have a camera now.\n\n(I don\'t have a camera.)' });
    s.pickup('medkit', [-11.4, R2.y + 0.02, 101.6]);
    s.pickup('photo', [8.0, R3.y + 0.02, 63.4], { id: 'c3-billboard', title: 'A torn poster under the billboard', text: 'MERIDIAN TOWER — LIVE ABOVE IT ALL\n\nA Voss Development. Penthouse levels 58–61: by invitation.\n\nSomebody has drawn horns on the man in the photograph and written underneath: <em>he owns the lab too.</em>' });
    s.pickup('ammo', [-15.0, R4.y + 0.02, 40.0]);
    s.pickup('medkit', [3.4, R4.y + 0.02, 17.2]);
    s.pickup('note', [-12.0, R4.y + 4.08, 31.2], { id: 'c3-tower', title: 'Scratched into the water tower\'s rail', text: 'IVY + LENA\nTHE BEST VIEW IN THE CITY\n(summer, 3 yrs ago)\n\nThe tower in the distance is just a crane and a hole in the ground in the scratch-drawing next to it.' });
  },
  segments: [
    // ------------------------------------------------------------------ the Lantern's roof
    {
      name: 'THE LANTERN\'S ROOF',
      async play(s) {
        const g = s.game;
        const p = g.player;
        const H = ROOFS.hatch;
        const chasers: Enemy[] = [];
        await s.scene(async () => {
          s.ui.card('CHAPTER THREE', 'RAIN', 'THE ROOFTOPS · KESSLER STREET', '2:58 AM');
          await s.wait(4.4);
          // the rain on the roof; the street a long way down, a car's lights
          s.shot({ pos: [9, R1.y + 2.2, 134], look: [-2, R1.y + 1.2, 126], pos2: [8.4, R1.y + 2.4, 133], fov: 44, dur: 7 });
          s.ui.cardHide();
          s.ui.fade(false, 1.6);
          await s.wait(2.6);
          s.ui.stamp('THE ROOFTOPS · KESSLER STREET', '2:58 AM');
          // north, over the roofs: the tower, its crown lit
          s.shot({ pos: [st().x - 1.0, R1.y + 1.65, st().z + 1.6], look: [30, 160, -300], pos2: [st().x - 0.9, R1.y + 1.7, st().z + 1.3], fov: 30, dur: 6 });
          await s.wait(2.0);
          await s.say('SCARLET', 'Six blocks. Every one of them uphill.', 2.6);
          // the hatch behind her: boots on the ladder
          g.audio.play('metal_hit', { pos: V(H.x, R1.y + 0.5, H.z), vol: 0.8, pitch: 0.7 });
          g.cam.addTrauma(0.1);
          for (let i = 0; i < 2; i++) {
            const e = man(s, 'brawler', H.x + 0.4 - i * 0.8, H.z - 0.9, Math.PI, { variant: ['kxsec0', 'kxsec2'][i] });
            chasers.push(e);
          }
          s.shot({ pos: [H.x + 3.0, R1.y + 1.4, H.z - 4.0], look: [H.x, R1.y + 1.0, H.z], fov: 38, dur: 3 });
          await s.wait(0.6);
          s.bark('KX', 'ROOF! She\'s on the roof!', 2, chasers[0]);
          await s.wait(1.4);
        });
        for (const e of chasers) e.alert(0.6);
        s.objective('NORTH', 'Over the roofs toward the tower — the gap ahead');
        const J = ROOFS.jump1;
        await s.tutor(['SHIFT', 'SPACE'], 'JUMP THE GAP', 'Run at the edge — SPACE as you reach it', () => (p.z < J.z - 1 ? 1 : 0), 1, undefined, [(J.x0 + J.x1) / 2, R2.z1 - 1.6, R2.y]);
        await s.until(() => p.z < J.z - 1.5 && p.y < R1.y - 0.6, false);
        // (the two behind her can't follow over that: they go round, by the stairs)
        for (const e of chasers) {
          if (!e.alive) continue;
          s.bark('KX', 'She jumped it — down the stairs, round the back!', 2.4, e);
          break;
        }
        s.flags.chasers = chasers.filter((e) => e.alive).length;
        for (const e of chasers) if (e.alive) e.becomeIdle(null);
        void s.wait(2.5, false).then(() => {
          for (const e of chasers) {
            if (!e.alive) continue;
            e.x = 9;
            e.z = 130;
            e.anim.initAt(e.x, e.z, e.yaw);
          }
        });
      },
    },
    // ------------------------------------------------------------------ the washing lines
    {
      name: 'THE WASHING LINES',
      resume(s) {
        at(s, -4, 107.6, Math.PI);
      },
      async play(s) {
        const g = s.game;
        const p = g.player;
        const S = ROOFS.shed2;
        // up the stairs and out of the shed: the two who went round, and one more
        const n = Math.min(2, (s.flags.chasers as number | undefined) ?? 2);
        const crew: Enemy[] = [];
        for (let i = 0; i < n + 1; i++) {
          const e = man(s, i === n ? 'club' : 'brawler', S.x + 0.6, S.z - 2.0 - i * 0.6, Math.PI, { variant: i === n ? undefined : ['kxsec0', 'kxsec2'][i] });
          e.ghostWalls = true;
          crew.push(e);
        }
        await s.wait(0.6, false);
        g.audio.play('metal_hit', { pos: V(S.x + 0.6, R2.y + 1, S.z - 1.6), vol: 0.7, pitch: 0.6 });
        s.bark('KX', 'There! Between the sheets!', 2, crew[0]);
        for (const e of crew) e.ghostWalls = false;
        s.objective('THE WASHING LINES', 'Branko\'s men came round by the stairs');
        await s.fight(crew, { pressure: 3 });
        const L = ROOFS.ladder2;
        s.objective('UP', 'The ladder up the office block\'s wall');
        void s.tutor(['SPACE'], 'LADDER', 'Walk into it, SPACE, then up', () => (p.y > R2.y + 1 ? 1 : 0), 1, () => p.y > R3.y - 0.6, [L.x, L.z - 0.6, R3.y]);
        await s.until(() => p.y > R3.y - 0.4 && p.z < 84, false);
        s.hideTutor();
      },
    },
    // ------------------------------------------------------------------ the billboard roof: the lookouts
    {
      name: 'THE LOOKOUTS',
      resume(s) {
        at(s, ROOFS.ladder2.x, 83.2, Math.PI);
      },
      async play(s) {
        const g = s.game;
        const p = g.player;
        // three of them up here with torches, watching the roofs she has to cross
        const look = [
          man(s, 'brawler', 14, 62, 0, { variant: CREW[0], watch: true, patrol: [[14, 62, 2.5], [14, 78, 2.5]], vision: 12 }),
          man(s, 'knife', -2.5, 57.6, 0, { variant: CREW[1], watch: true, pose: 'st_smoke', vision: 9 }),
          man(s, 'brawler', 0, 72, Math.PI / 2, { variant: CREW[2], watch: true, patrol: [[0, 72, 2], [11, 72, 3]], vision: 11 }),
        ];
        let spotted = false;
        s.when(() => look.some((e) => e.alive && e.state !== 'idle' && !e.down), () => (spotted = true));
        s.objective('THE GAP', 'Over to the tenement roof — they\'re watching for you');
        // a voice on their radios
        void (async () => {
          await s.wait(2.5, false);
          if (spotted) return;
          s.bark('KAEL', '<em>(radio)</em> She\'s coming over the roofs. Nobody lets her see the tower up close.', 4.2, null);
          await s.wait(5, false);
          if (spotted) return;
          s.bark('KAEL', '<em>(radio)</em> And nobody touches her face. I want to see it.', 3.4, null);
        })();
        void (async () => {
          await s.tutor(['C'], 'UNDER THE BILLBOARD', 'The lamps on its frame light the east side: keep low in the dark to the west, take them one at a time', s.since(() => p.stats.takedowns), 1, () => spotted || p.z < 57);
        })();
        const J = ROOFS.jump2;
        s.ui.marker(V((J.x0 + J.x1) / 2, R4.y + 1.2, R4.z1 - 1.6), 'THE GAP');
        await s.until(() => p.z < 53.2 && p.y < R3.y + 0.4 || spotted, false);
        if (spotted && p.z > 53.2) {
          s.ui.marker(null);
          s.hideTutor();
          s.objective('THEY SAW YOU', 'Put them down');
          await s.fight(look.filter((e) => e.alive), { pressure: 3 });
          s.objective('THE GAP', 'Over to the tenement roof');
          s.ui.marker(V((J.x0 + J.x1) / 2, R4.y + 1.2, R4.z1 - 1.6), 'THE GAP');
          await s.until(() => p.z < 53.2 && p.y < R3.y + 0.4, false);
        }
        s.ui.marker(null);
        s.hideTutor();
        // (whoever's left up there stays up there)
        for (const e of look) if (e.alive && e.state !== 'idle') e.becomeIdle(null);
      },
    },
    // ------------------------------------------------------------------ the tenement roof: the trap
    {
      name: 'THE CROSSING',
      resume(s) {
        at(s, -1.4, 51.6, Math.PI);
      },
      async play(s) {
        const g = s.game;
        const p = g.player;
        // behind the chimneys and the water tower: waiting for her
        const trap = [
          man(s, 'agile', -13.4, 46.6, 0.6, { variant: CREW[0] }),
          man(s, 'knife', -6, 42.8, 0.2, {}),
          man(s, 'brawler', 2.6, 38.8, -0.5, { variant: CREW[2] }),
          man(s, 'club', -12, 26.6, 0, {}),
        ];
        await s.wait(0.8, false);
        await s.scene(async () => {
          s.shot({ pos: [-1.0, R4.y + 2.4, 54.4], look: [-6, R4.y + 1.0, 40], pos2: [-1.2, R4.y + 2.2, 53.8], fov: 46, dur: 5 });
          for (const e of trap) {
            e.idleTo = { x: e.x + (p.x - e.x) * 0.3, z: e.z + (p.z - e.z) * 0.3 };
            e.idleFace = yawTo(e.idleTo, p);
          }
          await s.wait(1.2);
          s.bark('KX', 'Kael said you\'d come this way.', 2.2, trap[0]);
          await s.wait(2.4);
        });
        s.objective('THE CROSSING', 'It\'s a trap. Spring it');
        // the lightning helps them see her; the rain hides the rest
        s.when(() => trap.filter((e) => e.alive).length <= 2, () => {
          const e = man(s, 'brawler', -16, 18, 0.8, { variant: CREW[1] });
          s.encounter.push(e);
          e.alert(0.4);
          s.bark('KX', 'Up the fire escape! Another one!', 2, e);
        });
        await s.fight(trap, { pressure: 4 });
        const L = ROOFS.ladder4;
        s.objective('THE NEON ROOF', 'Up the fire escape — he\'s up there');
        s.ui.marker(V(L.x, 1.2, L.z - 0.6), 'FIRE ESCAPE');
        await s.until(() => p.y > -0.4 && p.z < 13.6, false);
        s.ui.marker(null);
      },
    },
    // ------------------------------------------------------------------ Kael
    {
      name: 'KAEL',
      resume(s) {
        at(s, 0, 12.4, Math.PI);
      },
      async play(s) {
        const g = s.game;
        const p = g.player;
        const kael = man(s, 'master', 0.4, -5.2, 0, { variant: 'master' });
        s.cast('KAEL', kael);
        await s.scene(async () => {
          // through the gap in the parapet: the neon roof, the rain coming down through the signs' light, him
          await s.walk(0, 8.4, { speed: 1.3, face: Math.PI });
          s.shot({ pos: [3.2, 1.2, 10.6], look: [0.4, 1.6, -5], pos2: [2.8, 1.25, 10.2], fov: 38, dur: 7 });
          await s.wait(2.0);
          kael.idleTo = { x: 0.3, z: 2.6 };
          kael.idleFace = Math.PI * 0;
          s.shot({ pos: [-2.2, 1.0, 6.4], look: [0.3, 1.7, 2.6], fov: 34, dur: 6 });
          await s.arrive(kael, 6);
          kael.idleFace = yawTo(kael, p);
          s.closeUp(kael, { side: 1, fov: 30, dist: 1.5, dur: 9 });
          await s.wait(0.5);
          await s.say('KAEL', 'Every man you\'ve put down tonight, I taught to stand.');
          await s.say('KAEL', 'Doyle. The Butcher\'s boys. Branko — he was the slow one.');
          s.overShoulder(kael, p, { side: -1, dist: 1.1, fov: 32, dur: 4 });
          await s.say('SCARLET', 'You should have taught them to stay down.');
          s.closeUp(kael, { side: -1, fov: 28, dist: 1.4, dur: 10 });
          await s.say('KAEL', 'Your sister is upstairs because the man who owns this city looked at a list and pointed.');
          await s.say('KAEL', 'Nothing personal. Nothing at all.');
          s.closeUp(p, { side: 1, fov: 28, dist: 1.15, dur: 4 });
          await s.say('SCARLET', 'It\'s personal to me.');
          p.sceneStyle = 'fight';
          p.sceneGuard = 1;
          s.overShoulder(p, kael, { side: 1, dist: 1.0, fov: 32, dur: 3 });
          await s.say('KAEL', 'Then come and learn something.');
        });
        p.sceneStyle = 'relaxed';
        p.sceneGuard = 0.35;
        g.cam.yaw = s.behindYaw(yawTo(p, kael));
        s.boss(kael, { name: 'KAEL', sub: 'KX\'S ENFORCER', kick: 'THE NEON ROOF' });
        s.objective('KAEL', 'He reads early counters — only the late ones get through');
        s.onBossPhase = (e, phase) => {
          if (e !== kael) return false;
          if (phase === 2) {
            // a blade from the man at the door, and two of his own up the stairs
            if (!e.weapon) {
              const w = new Weapon(g, 'sword');
              w.attach(e);
              g.weapons.push(w);
            }
            e.cfg = { ...e.cfg, attacks: [...e.cfg.attacks, 'sword_slash', 'sword_slash', 'sword_spin'] };
            s.bark('KAEL', 'Enough playing.', 1.6, e);
            s.enter('agile', 2, 0);
            s.enter('agile', 3, 0);
          } else {
            e.cfg = { ...e.cfg, attacks: ['elite_spin', 'elite_fly', 'elite_round', 'sword_spin', 'elite_cross'], comboHits: [3, 4] };
            s.bark('KAEL', 'Again!', 1.4, e);
            s.enter('brawler', 0, 0);
          }
          return true;
        };
        s.when(() => kael.alive && kael.hp < kael.maxHp * 0.2, () => s.bark('KAEL', 'Good. GOOD. Again.', 1.8, kael));
        await s.fight([kael], { pressure: 5 });
        s.onBossPhase = null;
        s.flags.kael = { x: kael.x, z: kael.z };
      },
    },
    // ------------------------------------------------------------------ Voss
    {
      name: 'THE TOWER',
      resume(s) {
        const k = (s.flags.kael as { x: number; z: number } | undefined) ?? { x: 0, z: 0 };
        at(s, k.x + 1.4, k.z + 1.4, yawTo({ x: k.x + 1.4, z: k.z + 1.4 }, k));
      },
      async play(s) {
        const g = s.game;
        const p = g.player;
        const k = (s.flags.kael as { x: number; z: number } | undefined) ?? { x: 0, z: 0 };
        s.objective(null);
        await s.scene(async () => {
          // he's dying in the rain; she kneels by him
          const by = { x: k.x + 0.9, z: k.z + 0.6 };
          await s.walk(by.x, by.z, { face: yawTo(by, k) });
          s.pose('st_crouch', 0.4);
          s.shot({ pos: [by.x + 1.6, 1.2, by.z + 1.5], look: [k.x, 0.4, k.z], fov: 34, dur: 9 });
          await s.wait(1.2);
          await s.say('KAEL', '...You fight like someone who was taught. Badly. By someone who loved you.', 4.2, { to: p });
          await s.say('SCARLET', 'Who\'s the man who owns this city?');
          await s.say('KAEL', 'Voss.', 1.6, { to: p });
          s.closeUp(p, { side: -1, fov: 30, dist: 1.2, dur: 6, dy: -0.5 });
          await s.wait(0.6);
          await s.say('SCARLET', 'Julian Voss. Palewater\'s owner. His name was on my paycheques.', 3.4);
          await s.say('KAEL', 'He built that tower to look down at all of us. Sixty-one floors. Service lift on the north side.', 4.4, { to: p });
          await s.say('KAEL', 'The viewing is at four. He always picks first.', 3, { to: p });
          s.pose(null, 0.5);
          // she stands, and looks north: the crown of the tower lit through the rain
          s.shot({ pos: [p.x - 1.4, 1.7, p.z + 2.4], look: [30, 190, -300], pos2: [p.x - 1.2, 1.75, p.z + 2.0], fov: 28, dur: 9 });
          s.face({ x: 30, z: -300 });
          await s.wait(2.4);
          s.ui.item('TAKEN', 'KAEL\'S KEYCARD', 'MERIDIAN · SITE ACCESS · ALL LEVELS', 3.6);
          await s.wait(2.2);
          await s.say('SCARLET', 'Hold on, Ivy. Nearly there.', 2.6);
          await s.wait(1.2);
          s.ui.fade(true, 2.0);
          await s.wait(2.4);
        });
      },
    },
  ],
};
function st() {
  return ROOFS.start;
}
