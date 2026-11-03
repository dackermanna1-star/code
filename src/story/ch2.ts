import * as THREE from 'three';
import type { Enemy } from '../ai/enemy';
import { yawFromDir } from '../core/math';
import { outfitVariant } from '../core/settings';
import { CIVILIANS } from '../character/variants';
import type { Chapter, Story } from './runner';
import type { Npc } from './staging';
import { CLUB, clubStage, openRope, setAlarm } from '../world/level/club';
import { CLUB_BEAT } from '../anim/lib/dance';
import { ClubMix } from './clubMix';

/**
 * CHAPTER TWO — RED LEDGER. Back to the Lantern, 2:14 AM, in a red dress with the Butcher's black
 * card - the doorman who sent her home two hours ago holds the door for her. Lena behind the bar
 * (Ivy's friend: Varga sent Ivy up to the gallery at ten; the books are in his safe; there's a
 * hatch up from the keg room); past the staff door while Lena keeps its man busy; Ivy's locker,
 * number six - her jacket, her jeans, her sneakers, her sister's birthday on a note; the keg room's
 * two men in the dark; up through the hatch into Varga's office. The safe, the ledger: lot six,
 * reserved for V. at Meridian - and Palewater, where the rest go, the lab Scarlet used to guard.
 * Varga's thumb on the alarm. The house lights, the siren, the crowd running for the doors;
 * Branko's men up the gallery stairs, then Branko; the ladder to the roof, the rain, and Varga's
 * phone ringing in her pocket: a woman's voice. "I'll leave the light on."
 */
const yawTo = (a: { x: number; z: number }, b: { x: number; z: number }) => yawFromDir(b.x - a.x, b.z - a.z);
const V = (x: number, y: number, z: number) => new THREE.Vector3(x, y, z);
const G = CLUB.galleryY;
const R = CLUB.roofY;
const SEC = ['kxsec0', 'kxsec1', 'kxsec2'];
const sec = (i: number) => SEC[i % SEC.length];

let mix: ClubMix | null = null;
let musicT0 = 0;
/** The dance floor's people and how far into their loop each one is (in beats). */
let dancers: { n: Npc; beat: number }[] = [];
let lena: Npc | null = null;
let varga: Npc | null = null;
let fled = false;

/** Where a guest may not go: behind the staff door, behind the bar. */
function restricted(x: number, y: number, z: number) {
  if (z > 14.15 && y < 3.3) return true;
  if (z < -12.7 && x > -8 && x < 8 && y < 1) return true;
  return false;
}

/** What she hears of the sound system from where she is: [level, muffle]. */
function earshot(x: number, y: number, z: number): [number, number] {
  if (y > R - 1.5) return [0.32, 0.93];
  if (x > 14.2) return [0.8, 0.3];
  if (z > 14.15) return y > 3 ? [0.5, 0.68] : x < -4.6 ? [0.55, 0.76] : [0.6, 0.72];
  return [1, 0];
}

/** Everyone out: the floor empties through the lobby, the gallery down its stairs. */
function stampede(s: Story) {
  if (fled) return;
  fled = true;
  const out: [number, number][] = [[15.2, 0.4], [21, 0.5], [28.6, 0.6]];
  s.extras.forEach((n, i) => {
    if (n.gone || n === lena || n === varga) return;
    const onGallery = n.y > 2;
    void s.wait(0.2 + (i % 7) * 0.25 + Math.random() * 0.4, false).then(() => {
      if (n.gone) return;
      n.hold(null, 0.3);
      n.pose = null;
      const lane = (i % 3) - 1;
      const path: [number, number][] = onGallery
        ? [[12 + lane * 0.6, 9.4], [12 + lane * 0.6, 1.4], [14.4, 0.2 + lane * 0.8], ...out]
        : [[Math.max(-12, Math.min(12, n.x)), Math.max(-11, Math.min(7.5, n.z))], [13.6, lane * 1.1], ...out];
      n.walk(path, 2.6 + Math.random() * 0.8, () => n.vanish());
    });
  });
  // the DJ ducks behind his decks; Lena down behind the bar
  const dj = s.actorOf('DJ') as Npc | null;
  if (dj) dj.hold('st_cower', 0.3);
  if (lena && !lena.gone) {
    lena.hold('st_cower', 0.3);
  }
}

/** The club, full: the floor dancing, the bar three deep, the gallery's booths, the staff. */
function crowd(s: Story) {
  const g = s.game;
  const W = CIVILIANS.women, M = CIVILIANS.men;
  let wi = 0, mi = 0;
  const any = () => (Math.random() < 0.55 ? W[wi++ % W.length] : M[mi++ % M.length]);
  // the floor: a loose grid, jittered, every one of them on the beat but not all on the same move
  const moves = ['dance_a', 'dance_b', 'dance_c', 'dance_d', 'dance_a', 'dance_c'];
  dancers = [];
  for (let j = 0; j < 4; j++)
    for (let i = 0; i < 5; i++) {
      if ((i === 2 && j === 1) || Math.random() < 0.12) continue;
      const x = -4.6 + i * 2.3 + (Math.random() - 0.5) * 0.9;
      const z = -4.4 + j * 2.6 + (Math.random() - 0.5) * 0.9;
      const n = s.extra(any(), x, z, Math.random() * Math.PI * 2, { pose: moves[(i + j * 2) % moves.length] });
      if (n) dancers.push({ n, beat: Math.floor(Math.random() * 8) });
    }
  // at the bar: leaning, drinking, a couple talking
  for (const [x, pose, chat] of [[-6.5, 'st_lean', 0], [-5.2, 'st_drink', 0.6], [-3.6, 'st_lean', 0.5], [2.6, 'st_drink', 0], [4.2, 'st_lean', 0.6], [5.5, 'st_drink', 0.5], [7.0, 'st_lean', 0]] as [number, string, number][]) {
    s.extra(any(), x, CLUB.bar.z + 1.05 + Math.random() * 0.2, Math.PI + (Math.random() - 0.5) * 0.6, { pose, chat });
  }
  // a pair by the columns, talking; one alone at the end of the bar on his phone
  s.extra(W[3], 6.4, 7.6, -2.4, { pose: 'st_drink', chat: 0.7 });
  s.extra(M[2], 5.6, 6.9, 0.7, { pose: 'st_drink', chat: 0.6 });
  s.extra(M[4], 9.2, -10.6, -0.6, { pose: 'st_phone' });
  // behind the bar: Lena, and the other bartender
  lena = s.extra('lena', CLUB.bartender.x, CLUB.bartender.z, 0, { pose: 'st_shake' });
  s.cast('LENA', lena);
  s.extra('civ_m12', -4.6, CLUB.bartender.z, 0.2, { pose: 'st_shake' });
  // the DJ up on his stage
  const dj = s.extra('civ_m18', CLUB.djBooth.x, CLUB.djBooth.z, Math.PI / 2, { pose: 'st_dj', y: 1.0 });
  s.cast('DJ', dj);
  // up on the gallery: the black-card people in the booths
  for (const [x, v, pose] of [[-8.0, W[6], 'st_sit'], [-6.8, M[5], 'st_sit'], [-2.4, M[6], 'st_sit'], [2.0, W[4], 'st_sit'], [3.2, M[3], 'st_sit'], [7.4, W[7], 'st_sit']] as [number, string, string][]) {
    s.extra(v, x, 13.25, Math.PI, { pose, y: G, chat: 0.5 });
  }
  s.extra(W[5], 3.2, 10.0, 0.9, { pose: 'st_drink', y: G, chat: 0.6 });
  // the lobby: the coat-check girl, a man waiting for his coat, the doorman
  s.extra('civ_f05', CLUB.coatCheck.x, CLUB.coatCheck.z, Math.PI / 2, { pose: 'st_phone' });
  s.extra(M[1], 22.2, -2.6, -Math.PI / 2, { pose: 'st_crossed' });
  const b = s.extra('civ_b05', CLUB.bouncer.x, CLUB.bouncer.z, Math.PI / 2, { pose: 'st_crossed' });
  s.cast('BOUNCER', b);
  // (the floor's people keep to the music: their loops from the track's own clock)
  musicT0 = g.audio.ctx?.currentTime ?? 0;
}

/** Varga at his desk, sat over the night's take. */
function vargaAtDesk(s: Story): Npc {
  if (varga && !varga.gone) return varga;
  varga = s.extra('varga', CLUB.desk.x, CLUB.desk.z + 0.95, Math.PI, { pose: 'st_sitdesk', y: G }) ?? s.extra('civ_b04', CLUB.desk.x, CLUB.desk.z + 0.95, Math.PI, { pose: 'st_sitdesk', y: G });
  s.cast('VARGA', varga);
  // (a pale bald head under the office lamps: the close-ups' fill lighter on him)
  s.fillFor(varga, 0.35);
  return varga!;
}

/** Branko's security: one idle somewhere, watching (or not). */
function guard(s: Story, i: number, x: number, z: number, yaw: number, o: { pose?: string; watch?: boolean; patrol?: [number, number, number?][]; vision?: number; y?: number } = {}) {
  return s.spawn('brawler', x, z, yaw, { variant: sec(i), pose: o.pose ?? null, watch: o.watch, patrol: o.patrol, vision: o.vision, y: o.y });
}

export const CH2: Chapter = {
  id: 2,
  kick: 'CHAPTER TWO',
  title: 'RED LEDGER',
  place: 'THE LANTERN · KESSLER STREET',
  clock: '2:14 AM',
  map: 'club',
  outfit: 'dress',
  crew: { brawler: SEC },
  synopsis: 'The Lantern keeps books. Somebody wrote her sister in them.',
  par: 600,
  backdrop: { pos: [10, 5.2, -9], look: [-2, 1.2, 4], pos2: [9, 5.0, -8], look2: [-2, 1.4, 4], fov: 46, dur: 45 },
  next: { kick: 'CHAPTER THREE', title: 'RAIN', line: 'Six rooftops between the Lantern and Meridian. KX knows which way she\'s going.' },
  setup(s) {
    const g = s.game;
    fled = false;
    lena = varga = null;
    clubStage.t = 0;
    setAlarm(false);
    if (g.audio.ctx) mix = new ClubMix(g.audio);
    g.music.duck(0, 0.5);
    g.restricted = restricted;
    if (s.cp < 4) crowd(s);
    if (s.cp >= 3) setAlarm(s.cp >= 4);
    if (s.cp >= 4) {
      mix?.scratch();
      mix?.alarm(true);
      g.music.duck(1, 0.5);
      openRope(g.arena);
    }
    vargaAtDesk(s);
    // (Doyle's pistol, in her bag)
    s.givePistol(1);
    const st = CLUB.start;
    s.place(st.x, st.z, st.yaw);
    // things to find
    s.pickup('note', [25.2, 0.47, 5.5], { id: 'c2-flyer', title: 'A flyer on the lobby bench', text: 'THE LANTERN · SATURDAYS\n\nDoors 10 till late. Members upstairs from midnight.\nBlack cards only on the gallery.\n\nDiscretion is the house rule.' });
    s.pickup('note', [4.8, 0.95, 17.0], { id: 'c2-rota', title: 'The staff rota, pinned in the corridor', text: 'SATURDAY\n\nBAR — Lena, Ivy (9 till close), Marco (back)\nFLOOR — Tomas, Pauly\nGALLERY — Branko\'s lot\n\nV.: girls to the gallery when asked. NO PHONES ON THE FLOOR.\n\n(Under it, in Ivy\'s writing: <em>swapping sun w/ Lena — it\'s Scar\'s birthday</em>)' });
    s.pickup('photo', [5.55, 0.88, 20.6], { id: 'c2-polaroid', title: 'A Polaroid in the mirror\'s frame', text: 'Ivy and Lena behind the bar at New Year\'s, both pulling faces at the camera, paper crowns on.\n\nUnderneath, in marker: DON\'T TELL VARGA.' });
    s.pickup('medkit', [-3.4, 0.47, 20.5]);
    s.pickup('note', [-6.4, 1.62, 18.9], { id: 'c2-docket', title: 'A docket on the crates', text: 'KX FREIGHT — LANTERN\n\nCash up through the hatch at 2 and at 4.\nVarga counts. NOBODY else touches the bag.\n\nKegs Tues. Empties Thurs. Lot pick-ups as per the book.' });
    s.pickup('ammo', [-13.0, 0.02, 21.4]);
    s.pickup('medkit', [-13.4, G + 0.47, 17.2]);
  },
  tick(s, dt) {
    const g = s.game;
    const p = g.player;
    // a fight on the floor before the alarm: the people round it back off and crouch, Lena hisses
    if (!clubStage.alarm && !fled) {
      const brawl = g.enemies().find((e) => e.alive && e.state !== 'idle' && e.state !== 'enter' && e.y < 1 && Math.abs(e.x) < 14 && Math.abs(e.z) < 14);
      if (brawl) {
        for (const d of dancers) {
          if (d.n.gone || d.n.pose === 'st_cower' || Math.hypot(d.n.x - brawl.x, d.n.z - brawl.z) > 6) continue;
          d.n.hold('st_cower', 0.3);
        }
        if (!s.flags.brawlLine) {
          s.flags.brawlLine = true;
          s.bark('LENA', 'Scar! Not on the floor!', 2.2, lena);
        }
      }
    }
    // the sound of the place from where she stands (and quieter under dialogue on the floor)
    if (mix) {
      const [lv, mf] = earshot(p.x, p.y, p.z);
      mix.set(lv * (s.inScene && mf < 0.2 ? 0.55 : 1), mf);
      if (clubStage.alarm) mix.sirenLevel(p.y > R - 1.5 ? 0.35 : 1);
    }
    // the floor on the beat: each dancer's loop set from the track's clock (slow motion and all)
    const ctx = g.audio.ctx;
    const mt = ctx ? ctx.currentTime - musicT0 : clubStage.t;
    if (!clubStage.alarm) {
      for (const d of dancers) {
        const c = d.n.anim.mode === 'clip' ? d.n.anim.clip : null;
        if (!c || d.n.gone || !d.n.pose || d.n.pose === 'st_cower') continue;
        const dur = c.clip.dur;
        c.time = ((mt + d.beat * CLUB_BEAT * 0.5) % dur + dur) % dur;
      }
    }
    void dt;
  },
  segments: [
    // ------------------------------------------------------------------ the door, the floor, Lena
    {
      name: 'THE LANTERN',
      async play(s) {
        const g = s.game;
        const p = g.player;
        const bouncer = s.actorOf('BOUNCER') as Npc | null;
        await s.scene(async () => {
          s.ui.card('CHAPTER TWO', 'RED LEDGER', 'THE LANTERN · KESSLER STREET', '2:14 AM');
          await s.wait(4.4);
          // the doors from inside: the street's sodium light, and her in it
          s.place(28.5, 0.6, -Math.PI / 2);
          p.ghostWalls = true;
          s.shot({ pos: [23.4, 1.45, -2.2], look: [28.4, 1.35, 0.4], pos2: [23.8, 1.5, -2.0], look2: [27.6, 1.4, 0.4], fov: 40, dur: 7 });
          s.ui.cardHide();
          s.ui.fade(false, 1.6);
          g.audio.play('metal_hit', { pos: V(28.8, 1.2, 0.6), vol: 0.35, pitch: 0.7 });
          await s.walk(26.4, 0.5, { speed: 1.25, face: -Math.PI / 2 });
          p.ghostWalls = false;
          if (bouncer) {
            bouncer.hold(null, 0.4);
            bouncer.faceYaw = yawTo(bouncer, p);
            bouncer.lookAt = p;
          }
          s.overShoulder(p, bouncer ?? CLUB.bouncer, { side: 1, dist: 1.0, fov: 32, dur: 5 });
          await s.say('BOUNCER', 'Card.');
          // the Butcher's black card, held up between two fingers
          s.pose('st_phone', 0.3);
          if (bouncer) s.closeUp(bouncer, { side: -1, fov: 30, dist: 1.3, dur: 6 });
          await s.wait(0.9);
          await s.say('BOUNCER', '...Black card.');
          s.pose(null, 0.4);
          await s.say('BOUNCER', 'Evening, miss. Enjoy your night.');
          if (bouncer) bouncer.faceYaw = Math.PI / 2;
          void s.walk(23.4, 0.3, { speed: 1.3, face: -Math.PI / 2 });
          s.shot({ pos: [22.2, 1.5, 1.6], look: [25.4, 1.5, 0.0], fov: 34, dur: 5 });
          await s.wait(1.6);
          s.face(CLUB.bouncer);
          s.closeUp(p, { side: 1, fov: 30, dist: 1.2, dur: 4 });
          await s.wait(0.4);
          await s.say('SCARLET', 'Two hours ago you told me to go home.');
          if (bouncer) s.closeUp(bouncer, { side: 1, fov: 30, dist: 1.4, dur: 4 });
          await s.wait(0.5);
          await s.say('BOUNCER', '...Miss?');
          s.face(-Math.PI / 2);
          // through the curtain: the hall, the beams, the floor
          void s.walk(16.8, 0.2, { speed: 1.35, face: -Math.PI / 2 });
          s.shot({ pos: [13.2, 2.6, -3.4], look: [0, 1.6, 0], pos2: [12.4, 2.8, -2.6], look2: [-2, 1.8, 0], fov: 50, dur: 7 });
          s.ui.stamp('THE LANTERN', '2:16 AM');
          await s.wait(3.2);
          await s.say('SCARLET', 'Lena works the bar. If anyone saw Ivy tonight...', 3.2);
        });
        if (bouncer) {
          bouncer.lookAt = null;
          bouncer.hold('st_crossed', 0.5);
        }
        s.objective('LENA', 'Ivy\'s best friend works the bar');
        await s.reach(CLUB.barFront.x, CLUB.barFront.z + 0.2, 1.6, 'LENA');
        // ---- Lena
        const tomas = guard(s, 1, CLUB.doorGuard.x, CLUB.doorGuard.z, Math.PI, { pose: 'st_crossed', watch: true, vision: 9 });
        s.cast('TOMAS', tomas);
        s.flags.tomas = true;
        await s.scene(async () => {
          await s.walk(CLUB.barFront.x, CLUB.barFront.z, { face: Math.PI });
          const L = lena;
          if (L) {
            L.hold(null, 0.4);
            L.faceYaw = 0;
            L.lookAt = p;
          }
          s.overShoulder(p, L ?? CLUB.bartender, { side: 1, dist: 1.0, fov: 30, dur: 6 });
          await s.say('LENA', 'What can I get y— ...Scarlet?');
          s.closeUp(p, { side: -1, fov: 30, dist: 1.15, dur: 4 });
          await s.say('SCARLET', 'Hi, Lena.');
          if (L) s.closeUp(L, { side: 1, fov: 28, dist: 1.2, dur: 6 });
          await s.say('LENA', 'Oh my god. Did you find her? She just— she just left her phone and went.');
          s.overShoulder(L ?? CLUB.bartender, p, { side: -1, dist: 0.95, fov: 30, dur: 8 });
          await s.say('SCARLET', 'They took her out the back door, Lena. KX. They\'re selling people.');
          if (L) s.closeUp(L, { side: 1, fov: 26, dist: 1.15, dur: 12 });
          await s.wait(0.6);
          await s.say('LENA', '...Varga sent her up to the gallery at ten. Some guests wanted a bottle. She never came back down.');
          s.closeUp(p, { side: -1, fov: 28, dist: 1.1, dur: 3 });
          await s.say('SCARLET', 'Varga.');
          if (L) s.closeUp(L, { side: 1, fov: 28, dist: 1.25, dur: 14 });
          await s.say('LENA', 'He keeps KX\'s books. Everything that goes through this place goes in his ledger — the red one. It lives in his safe.');
          await s.say('LENA', 'His office is off the gallery. Branko\'s guys are on the door, you\'ll never get near it.');
          await s.say('LENA', 'But there\'s a hatch up from the keg room. We pass the cash bag up through it.');
          s.overShoulder(p, L ?? CLUB.bartender, { side: 1, dist: 1.0, fov: 30, dur: 6 });
          await s.say('SCARLET', 'How do I get to the keg room?');
          await s.say('LENA', 'Staff door, under the gallery. Tomas is on it.');
          // she looks over at him, and back
          s.shot({ pos: [0.2, 1.6, -10.0], look: [-2.0, 1.4, 12.9], fov: 26, dur: 4 });
          await s.wait(1.8);
          if (L) s.closeUp(L, { side: -1, fov: 28, dist: 1.2, dur: 10 });
          await s.say('LENA', 'Give me a second. I\'ll get rid of him.');
          await s.say('LENA', 'And Scar — her locker\'s number six. She always kept a change of clothes in it.');
          s.closeUp(p, { side: 1, fov: 30, dist: 1.2, dur: 4, dy: -0.4 });
          await s.say('SCARLET', '...Good. These heels are a crime.', 2.6);
          // Lena down to the end of the bar, waving him over
          if (L) {
            L.lookAt = null;
            L.walk([[-7.2, CLUB.bartender.z]], 1.6, () => (L.faceYaw = Math.PI / 2 + 0.6));
          }
          s.shot({ pos: [-6.4, 1.7, -9.0], look: [-4.0, 1.4, 10.0], pos2: [-6.0, 1.7, -8.6], fov: 40, dur: 6 });
          await s.wait(1.6);
          s.bark('LENA', 'Tomas! TOMAS! Some idiot\'s been sick in the ice!', 2.8, L);
          await s.wait(1.6);
          s.bark('TOMAS', 'Every night...', 1.8, tomas);
          tomas.idlePose = null;
          tomas.idleTo = { x: -8.6, z: -10.9 };
          tomas.idleFace = -Math.PI / 2 - 0.4;
          await s.wait(2.2);
        });
        if (lena) lena.hold('st_shake', 0.5);
        s.objective('STAFF ONLY', 'Through the staff door under the gallery while Tomas is busy');
        s.ui.marker(V(CLUB.staffDoor.x, 1.5, 16.6), 'STAFF DOOR');
        // (Tomas comes back to his door after a while; if he sees her in there, he follows her in)
        let back = false;
        void s.wait(45, false).then(() => {
          if (tomas.alive && tomas.state === 'idle' && p.z < 14.2) {
            back = true;
            tomas.idleTo = { x: CLUB.doorGuard.x, z: CLUB.doorGuard.z };
            tomas.idleFace = Math.PI;
            tomas.idlePose = 'st_crossed';
            s.bark('LENA', 'He\'s going back — go round, or wait, I\'ll try again!', 3, lena);
            void s.wait(16, false).then(() => {
              if (!tomas.alive || tomas.state !== 'idle' || p.z > 14.2) return;
              s.bark('LENA', 'TOMAS! The ice! Again!', 2.4, lena);
              tomas.idleTo = { x: -8.6, z: -10.9 };
              tomas.idleFace = -Math.PI / 2 - 0.4;
              tomas.idlePose = null;
            });
          }
        });
        void back;
        await s.until(() => p.z > 15.4 && p.y < 3, false);
        s.ui.marker(null);
        // seen going in: he comes after her (in the corridor: nobody on the floor hears a thing)
        if (tomas.alive && tomas.state !== 'idle') {
          s.objective('TOMAS', 'He saw you go in');
          await s.fight([tomas], { pressure: 2 });
        }
      },
    },
    // ------------------------------------------------------------------ the staff room: Ivy's locker
    {
      name: 'STAFF ONLY',
      resume(s) {
        s.place(-1.8, 16.6, Math.PI / 2);
      },
      async play(s) {
        const g = s.game;
        const p = g.player;
        // a barback humping crates down the corridor (staff: he doesn't care who she is)
        s.extra('civ_m02', 3.8, 16.8, -Math.PI / 2, { loop: [[-3.4, 16.8], [5.0, 16.8]] });
        s.objective('LOCKER SIX', 'Ivy\'s locker, in the staff room');
        const L = CLUB.locker;
        // (her mark: in the gap between the bench and the lockers, square to number six)
        const at = { x: L.x + 0.15, z: L.z - 0.2 };
        let opened = false;
        s.interact([L.x, 1.2, L.z - 0.25], 'OPEN LOCKER 6', () => (opened = true), { r: 1.25 });
        s.ui.marker(V(L.x, 1.6, L.z - 0.2), 'LOCKER 6');
        await s.until(() => opened, false);
        s.ui.marker(null);
        await s.scene(async () => {
          // (on the cut: at the locker, wherever round the bench she reached for it from)
          s.place(at.x, at.z, 0);
          s.shot({ pos: [L.x + 1.5, 1.55, L.z - 1.75], look: [L.x - 0.05, 1.2, L.z], fov: 34, dur: 5 });
          await s.wait(0.5);
          g.audio.play('metal_hit', { pos: V(L.x, 1.2, L.z), vol: 0.3, pitch: 1.9 });
          clubStage.lockerWant = 1;
          await s.wait(1.4);
          // over her left shoulder and down into it: Ivy's jacket on its hook
          s.shot({ pos: [L.x + 0.75, 2.6, L.z - 0.9], look: [L.x, 1.1, L.z + 0.6], pos2: [L.x + 0.7, 2.55, L.z - 0.85], fov: 36, dur: 6 });
          await s.wait(1.2);
          await s.say('SCARLET', 'Her jacket. Of course it\'s her jacket.', 2.6);
          // side-on: the note from its pocket
          s.pose('st_phone', 0.35);
          s.shot({ pos: [L.x + 1.35, 1.72, L.z - 0.04], look: [at.x - 0.05, 1.36, at.z], pos2: [L.x + 1.28, 1.71, L.z - 0.05], fov: 30, dur: 9 });
          await s.wait(0.8);
          s.ui.item('A NOTE', 'IN HER POCKET', 'SCAR\'S BIRTHDAY SUNDAY!!! cake from Marcello\'s — DON\'T TELL HER', 5);
          await s.wait(3.2);
          await s.say('SCARLET', '...Sunday.', 2);
          await s.wait(0.6);
          s.pose(null, 0.4);
          // the dress off, her sister's clothes on
          s.ui.fade(true, 0.7);
          await s.wait(0.9);
          p.changeOutfit(outfitVariant('denim'));
          s.flags.denim = true;
          g.audio.play('whoosh_light', { pos: V(p.x, 1, p.z), vol: 0.3, pitch: 0.7 });
          await s.wait(0.6);
          s.place(L.x + 0.6, L.z - 1.3, Math.PI - 0.5);
          s.shot({ pos: [L.x + 2.4, 1.5, L.z - 2.9], look: [L.x + 0.6, 1.0, L.z - 1.3], pos2: [L.x + 2.2, 1.45, L.z - 2.6], fov: 36, dur: 6 });
          s.ui.fade(false, 0.9);
          await s.wait(1.4);
          await s.say('SCARLET', 'Better.', 1.6);
          await s.wait(0.5);
        });
        s.ui.item('IVY\'S CLOTHES', 'DENIM, BLACK JEANS, SNEAKERS', 'Quieter on her feet than heels', 3.2);
        s.objective('THE KEG ROOM', 'The hatch up into Varga\'s office is in there');
        await s.reach(CLUB.kegDoor.x + 0.6, CLUB.kegDoor.z, 1.3, 'KEG ROOM');
      },
    },
    // ------------------------------------------------------------------ the keg room
    {
      name: 'THE KEG ROOM',
      resume(s) {
        s.game.player.changeOutfit(outfitVariant('denim'));
        s.place(CLUB.kegDoor.x + 0.9, CLUB.kegDoor.z, -Math.PI / 2);
      },
      async play(s) {
        const g = s.game;
        const p = g.player;
        // two of Branko's men down here with the kegs: one on his phone by the crates, one walking it
        const pho = guard(s, 0, -6.1, 20.0, -Math.PI / 2 - 0.3, { pose: 'st_phone', watch: true, vision: 7 });
        const walker = guard(s, 2, -9.0, 16.8, Math.PI, { watch: true, vision: 9, patrol: [[-9.0, 16.8, 2], [-9.0, 20.1, 1.5], [-11.7, 20.1, 2], [-11.7, 16.1, 1.5]] });
        const men = [pho, walker];
        let spotted = false;
        s.when(() => men.some((e) => e.alive && e.state !== 'idle' && !e.down), () => (spotted = true));
        s.objective('THE HATCH', 'Up the ladder in the far corner — quietly');
        void (async () => {
          await s.tutor(['C'], 'IN THE DARK', 'Crouched, between the lamps, they won\'t see you. One at a time from behind: F', s.since(() => p.stats.takedowns), 1, () => spotted || p.y > 1.5);
        })();
        const T = CLUB.trapLadder;
        s.ui.marker(V(T.x - 0.75, G + 1.2, T.z), 'HATCH');
        void (async () => {
          await s.until(() => Math.hypot(p.x - T.x, p.z - T.z) < 2.2 || spotted, false);
          if (!spotted) await s.tutor(['SPACE'], 'THE LADDER', 'Into it with SPACE, then up', () => (p.y > 1 ? 1 : 0), 1, () => spotted || p.y > G - 0.6);
        })();
        await s.until(() => p.y > G - 0.6 && p.z > 14.1 && p.x < -5 || spotted, false);
        if (spotted && p.y < G - 0.6) {
          s.hideTutor();
          s.objective('THEY HEARD YOU', 'Put them down before they raise the alarm');
          await s.fight(men.filter((e) => e.alive), { pressure: 2 });
          s.objective('THE HATCH', 'Up the ladder in the far corner');
          await s.until(() => p.y > G - 0.6 && p.x < -5 && p.z > 14.1, false);
        }
        s.ui.marker(null);
        s.hideTutor();
      },
    },
    // ------------------------------------------------------------------ the office: the ledger
    {
      name: 'THE LEDGER',
      resume(s) {
        s.game.player.changeOutfit(outfitVariant('denim'));
        s.place(CLUB.trapLadder.x - 0.6, CLUB.trapLadder.z + 0.5, Math.PI / 2);
        s.game.player.setY(G);
      },
      async play(s) {
        const g = s.game;
        const p = g.player;
        const v = vargaAtDesk(s);
        const S = CLUB.safe;
        await s.scene(async () => {
          // he's on the phone, his back half to her, the night's money in bands in front of him
          s.shot({ pos: [-7.0, G + 1.7, 16.4], look: [-8.8, G + 1.0, 19.4], pos2: [-7.2, G + 1.65, 16.8], fov: 36, dur: 7 });
          await s.wait(0.6);
          await s.say('VARGA', '—no. No, I don\'t care what the Butcher\'s boys say. Six went out of here. Six.', undefined, { phone: false });
          await s.say('VARGA', 'And tell V.\'s people the invoice is in the—', 1.8);
          await s.walk(-11.2, 16.6, { face: yawTo({ x: -11.2, z: 16.6 }, v), speed: 1.2 });
          v.lookAt = p;
          s.closeUp(v, { side: -1, fov: 30, dist: 1.25, dur: 5 });
          await s.wait(0.5);
          await s.say('VARGA', '...I\'ll call you back.');
          await s.say('VARGA', 'Who let you up here?');
          s.overShoulder(v, p, { side: 1, dist: 1.1, fov: 30, dur: 4 });
          await s.say('SCARLET', 'Lot six.');
          s.closeUp(v, { side: 1, fov: 28, dist: 1.2, dur: 10 });
          await s.wait(0.7);
          await s.say('VARGA', 'Ah. The sister. Doyle said you\'d be a problem.');
          await s.say('VARGA', 'Doyle\'s not answering his phone.');
          s.overShoulder(v, p, { side: -1, dist: 1.0, fov: 30, dur: 5 });
          await s.say('SCARLET', 'Doyle\'s not answering anything. Open the safe.');
          s.closeUp(v, { side: -1, fov: 28, dist: 1.25, dur: 12 });
          await s.say('VARGA', 'Do you know what\'s in that safe? Every favour this city owes. Judges. A deputy mayor. Half the vice squad.');
          await s.say('VARGA', 'You don\'t walk out of here with that.');
          void s.walk(-10.0, 18.2, { speed: 1.4, face: yawTo({ x: -10, z: 18.2 }, v) });
          s.shot({ pos: [-11.6, G + 1.6, 16.3], look: [-8.8, G + 1.1, 19.4], fov: 32, dur: 4 });
          await s.wait(1.0);
          s.closeUp(p, { side: 1, fov: 28, dist: 1.1, dur: 4 });
          await s.say('SCARLET', 'Now, Varga.');
          // he gets up, and goes to it
          v.hold(null, 0.4);
          v.lookAt = null;
          v.walk([[-11.6, 19.2], [S.x + 1.05, S.z - 0.55]], 1.1, () => (v.faceYaw = -Math.PI / 2 - 0.5));
          s.shot({ pos: [-10.4, G + 1.65, 17.0], look: [S.x + 0.3, G + 0.9, S.z], fov: 34, dur: 9 });
          await s.wait(3.2);
          v.hold('st_crouch', 0.4);
          await s.wait(1.0);
          g.audio.play('metal_hit', { pos: V(S.x, G + 0.8, S.z), vol: 0.25, pitch: 2.4 });
          await s.wait(0.5);
          g.audio.play('metal_hit', { pos: V(S.x, G + 0.8, S.z), vol: 0.3, pitch: 1.2 });
          clubStage.safeWant = 1;
          await s.wait(1.0);
          v.hold(null, 0.4);
          // (a step back out of the way of it: the open safe, its shelves, the red book)
          v.walk([[S.x + 2.2, S.z - 0.6]], 1.0, () => (v.faceYaw = yawTo(v, p)));
          await s.wait(0.6);
          await s.say('VARGA', 'There. Take your book.');
        });
        // the ledger: she takes it and reads it (and he's not standing still meanwhile)
        let read = false;
        s.objective('THE RED LEDGER', 'In the safe');
        s.pickup('note', [S.x + 0.1, G + 0.82, S.z], {
          id: 'c2-ledger',
          title: 'The red ledger — tonight\'s page',
          text:
            'SAT — LOTS (Dock 4, 6 head)\n\n' +
            '1–5 · KX Freight reefer → PALEWATER BIO · standing order · 06:00 dep.\n' +
            '6 · F, 22, red hair, staff (bar) · "clean, no record, no family to speak of"\n' +
            '      → RESERVED: V. · MERIDIAN PH · collected 23:40 by V.\'s car\n\n' +
            'PALEWATER: 40/month, any condition. Paid on delivery.\n' +
            'Meridian viewing: 04:00, the penthouse. Buyers by invitation. <em>The boss picks first.</em>',
          onTake: () => (read = true),
        });
        s.ui.marker(V(S.x + 0.1, G + 1.3, S.z), 'LEDGER');
        await s.until(() => read && !s.ui.reading, false);
        s.ui.marker(null);
        await s.scene(async () => {
          // she reads it standing at the open safe, the office behind her
          s.place(S.x + 1.2, S.z + 0.05, -Math.PI / 2);
          s.face(-Math.PI / 2);
          s.closeUp(p, { side: 1, fov: 30, dist: 1.2, dy: -0.05, dur: 5.2 });
          await s.say('SCARLET', 'Palewater...', 1.6);
          await s.say('SCARLET', 'I used to guard their doors. Nights. Cash in hand, no questions.', 3.2);
          // his hand under the desk: the alarm
          const D = CLUB.desk;
          const mark = { x: D.x - 0.75, z: D.z + 0.85 };
          s.shot({ pos: [D.x - 1.9, G + 1.25, D.z - 0.9], look: [D.x - 0.7, G + 0.75, D.z + 0.6], fov: 34, dur: 3 });
          v.walk([[mark.x, mark.z]], 1.6, () => {
            v.faceYaw = Math.PI;
            v.hold('st_crouch', 0.3);
          });
          await s.wait(2.0);
          setAlarm(true);
          mix?.scratch();
          mix?.alarm(true);
          g.audio.thump(0.6, V(0, 2, 0));
          s.face(mark);
          await s.wait(0.6);
          // (up, and round to her, under the cut)
          v.hold(null, 0.01);
          v.put(mark.x, mark.z, yawTo(mark, p));
          s.closeUp(v, { side: 1, fov: 30, dist: 1.3, dur: 4 });
          v.lookAt = p;
          await s.say('VARGA', 'You should have read faster.');
          s.closeUp(p, { side: -1, fov: 30, dist: 1.2, dur: 3 });
          await s.say('SCARLET', 'You should have run.');
          // one blow, and he's down against his desk (from behind her: her back to us, his face)
          s.shot({ pos: [-13.3, G + 2.0, 21.0], look: [mark.x - 0.85, G + 1.1, mark.z + 0.05], fov: 40, dur: 5, drift: 0.04 });
          const to = { x: mark.x - 0.62, z: mark.z + 0.05 };
          void s.walk(to.x, to.z, { speed: 2.4, face: yawTo(to, mark) });
          await s.until(() => Math.hypot(p.x - v.x, p.z - v.z) < 0.85, true, 1.8);
          g.audio.play('punch_heavy', { pos: V(v.x, 1.6 + G, v.z), vol: 0.9 });
          g.cam.addTrauma(0.25);
          v.hold('st_sitwall', 0.15);
          v.lookAt = null;
          await s.wait(1.0);
          s.ui.item('TAKEN', 'A BLACK ENVELOPE', 'MERIDIAN TOWER · THE VIEWING · 4 AM · THE PENTHOUSE', 4);
          await s.wait(1.2);
          s.ui.item('TAKEN', 'VARGA\'S PHONE', 'Somebody will call it', 3);
          await s.wait(0.8);
        });
        g.music.duck(1, 2);
        s.cast('VARGA', null);
      },
    },
    // ------------------------------------------------------------------ the alarm: Branko's men
    {
      name: 'ALARM',
      resume(s) {
        s.game.player.changeOutfit(outfitVariant('denim'));
        s.place(-11.0, 17.4, Math.PI);
        s.game.player.setY(G);
        const v = vargaAtDesk(s);
        // (where he went down: on the floor by the end of his desk)
        v.put(CLUB.desk.x - 0.75, CLUB.desk.z + 0.85, -Math.PI / 2);
        v.hold('st_sitwall', 0.01);
      },
      async play(s) {
        const g = s.game;
        const p = g.player;
        stampede(s);
        openRope(g.arena);
        s.objective('GET OUT', 'Branko\'s men are coming up the gallery');
        // up the stairs and along the gallery to the office door
        const wave1: Enemy[] = [];
        for (let i = 0; i < 3; i++) {
          const e = guard(s, i, 12.0 + (i - 1) * 0.9, 1.0 - i * 0.7, 0);
          wave1.push(e);
        }
        s.bark('KX', 'Office! The office!', 2, wave1[0]);
        await s.wait(1.4, false);
        await s.fight(wave1, { pressure: 3 });
        // ---- Branko
        const br = s.spawn('bouncer', 12.0, 0.6, 0, { variant: 'branko' });
        s.cast('BRANKO', br);
        const b2 = guard(s, 0, 11.2, -0.6, 0);
        const b3 = s.spawn('club', 12.8, -0.8, 0, {});
        await s.scene(async () => {
          // he comes up the stairs, taking his time; the floor below him empty, the lights all up
          br.idleTo = { x: 12.0, z: 9.4 };
          br.idleFace = Math.PI;
          for (const [e, x, z] of [[b2, 11.0, 9.0], [b3, 13.0, 8.8]] as [Enemy, number, number][]) {
            e.idleTo = { x, z };
            e.idleFace = Math.PI;
          }
          s.shot({ pos: [6.0, G + 1.8, 11.6], look: [12.0, G - 0.6, 4.0], pos2: [6.6, G + 1.7, 11.4], fov: 38, dur: 7 });
          await s.arrive(br, 8);
          br.idleFace = yawTo(br, p);
          s.closeUp(br, { side: -1, fov: 30, dist: 1.6, dur: 6 });
          await s.wait(0.4);
          await s.say('BRANKO', 'Twelve years I run this door. Nobody ever went up those stairs I didn\'t say could.');
          s.overShoulder(br, p, { side: 1, dist: 1.2, height: 2.1, fov: 34, dur: 5 });
          await s.say('SCARLET', 'I came up the back.');
          s.closeUp(br, { side: 1, fov: 28, dist: 1.5, dur: 6 });
          await s.say('BRANKO', 'Then you go down the front. Over the rail.');
          p.sceneStyle = 'fight';
          p.sceneGuard = 1;
          await s.wait(0.6);
        });
        p.sceneStyle = 'relaxed';
        p.sceneGuard = 0.35;
        g.cam.yaw = s.behindYaw(yawTo(p, br));
        s.boss(br, { name: 'BRANKO', sub: 'THE LANTERN\'S SECURITY', kick: 'THE GALLERY' });
        s.objective('BRANKO', 'Mind the rail');
        s.onBossPhase = (e, phase) => {
          if (e !== br || phase !== 2) return false;
          s.bark('BRANKO', 'Pauly! Get up here!', 2, br);
          const e2 = guard(s, 2, 12.0, 1.2, 0);
          s.encounter.push(e2);
          e2.alert(0.6);
          return true;
        };
        s.when(() => br.alive && br.hp < br.maxHp * 0.3, () => s.bark('BRANKO', 'Stay DOWN, you—', 1.8, br));
        await s.fight([br, b2, b3], { pressure: 4 });
        s.onBossPhase = null;
      },
    },
    // ------------------------------------------------------------------ the roof
    {
      name: 'THE ROOF',
      resume(s) {
        s.game.player.changeOutfit(outfitVariant('denim'));
        s.place(-9.6, 18.8, Math.PI / 2);
        s.game.player.setY(G);
      },
      async play(s) {
        const g = s.game;
        const p = g.player;
        s.objective('THE ROOF', 'The ladder in Varga\'s office — more of them on the way');
        const L = CLUB.ladder;
        s.ui.marker(V(L.x + 1.0, R + 1.2, L.z), 'LADDER');
        // (more coming up behind her: a reason not to dawdle)
        let late = false;
        void s.wait(24, false).then(() => {
          if (p.y > R - 1) return;
          late = true;
          const e = guard(s, 1, 12.0, 1.0, 0);
          const e2 = guard(s, 0, 12.6, 0.2, 0);
          e.alert(0.2);
          e2.alert(0.8);
          s.bark('KX', 'Up there! Office!', 2, e);
        });
        await s.until(() => p.y > R - 0.6, false);
        void late;
        s.ui.marker(null);
        s.objective(null);
        // (whoever's still coming stops at the hatch: she's gone)
        for (const e of g.enemies()) if (e.alive && e.state !== 'idle') e.becomeIdle(null);
        await s.scene(async () => {
          mix?.sirenLevel(0.3);
          // the rain, the city; Meridian on the skyline, lit to its crown
          s.shot({ pos: [-3.2, R + 1.6, 22.6], look: [8, R + 4, -16], pos2: [-2.4, R + 1.8, 21.8], look2: [30, R + 30, -60], fov: 44, dur: 9 });
          void s.walk(2.0, 14.0, { speed: 1.2, face: yawTo({ x: 2, z: 14 }, { x: 160, z: -230 }) });
          await s.wait(4.5);
          // Varga's phone, in her pocket
          g.audio.buzz(0.7);
          await s.wait(0.8);
          g.audio.buzz(0.7);
          s.pose('st_phone', 0.4);
          s.closeUp(p, { side: 1, fov: 30, dist: 1.3, dur: 6 });
          s.ui.phoneCall('UNKNOWN', '?', 'incoming…', '2:51');
          await s.wait(1.6);
          s.ui.phoneClose();
          await s.say('VIPER', 'Mr. Varga.', 1.8, { phone: true });
          await s.wait(0.6);
          await s.say('VIPER', '...No. Not Mr. Varga. You must be the sister.', undefined, { phone: true });
          await s.say('SCARLET', 'Where is she?');
          s.shot({ pos: [p.x + 2.6, R + 1.2, p.z + 1.4], look: [p.x, R + 1.5, p.z], pos2: [p.x + 2.4, R + 1.3, p.z + 1.2], fov: 34, dur: 14 });
          await s.say('VIPER', 'Somewhere warm. Somewhere high. She\'s very calm — they always are, after the first hour.', undefined, { phone: true });
          await s.say('SCARLET', 'I\'m coming to get her.');
          await s.say('VIPER', 'I know. You\'ve made such a mess getting this far.', undefined, { phone: true });
          await s.say('VIPER', 'The viewing\'s at four. The boss picks first. You could be in the room when he does.', undefined, { phone: true });
          await s.say('VIPER', 'Come up, then. I\'ll leave the light on.', undefined, { phone: true });
          s.pose(null, 0.5);
          // across the city: the tower's crown blinks once, and stays lit
          s.shot({ pos: [p.x - 1.6, R + 1.7, p.z + 2.4], look: [160, 210, -230], fov: 30, dur: 8 });
          await s.wait(2.6);
          await s.say('SCARLET', 'Leave it on.', 2.2);
          await s.wait(1.4);
          s.ui.fade(true, 2.0);
          await s.wait(2.4);
        });
        mix?.dispose();
        mix = null;
        g.restricted = null;
      },
    },
  ],
};
