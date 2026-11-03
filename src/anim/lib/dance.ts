import { defineClip, Key } from '../clip';
import { k, RELAXED } from './stances';

/**
 * The Lantern's people: a few dance loops for the floor (on the club's beat, 122 BPM - the track's),
 * and the rest of a night out - leaning on the bar with a drink, sipping one, shaking one behind
 * the bar, sat in a booth, the DJ over his decks, the bookkeeper at his desk.
 *
 * Each dance moves the hips with the kick, the shoulders against them, the arms their own way;
 * played at a random phase and a little faster or slower, a floor of them doesn't move as one.
 */
export const CLUB_BEAT = 60 / 122;
const B = CLUB_BEAT;
type V3 = [number, number, number];
const hand = (x: number, y: number, z: number, roll = 0) => ({ p: [x, y, z] as V3, sp: 'chest' as const, pole: [x > 0 ? 0.6 : -0.6, -0.4, -0.6] as V3, roll, aim: null, dir: null });
const handR = (x: number, y: number, z: number, roll = 0) => ({ p: [x, y, z] as V3, sp: 'root' as const, pole: [x > 0 ? 0.6 : -0.6, -0.6, -0.4] as V3, roll, aim: null, dir: null });

function loop(name: string, beats: number, keys: (t: number, i: number) => Key) {
  const out: Key[] = [];
  const n = beats * 2;
  for (let i = 0; i <= n; i++) out.push(keys((i * B) / 2, i % n));
  defineClip(name, { loop: true, keys: out });
}
const hold = (name: string, pose: Omit<Key, 't'>) => defineClip(name, { keys: [k(0, pose), k(1, pose)], loop: true });

/** Sat on a sofa or a stool: the knees bent over its edge, a hand on a thigh, the other with a glass. */
const SIT: Omit<Key, 't'> = {
  ...RELAXED,
  hips: [0, -0.5, -0.1],
  hipsR: [-10, 0, 0],
  spine: [-2, 0, 0],
  chest: [2, 0, 0],
  neck: [2, 0, 0],
  head: [4, 4, 0],
  lh: { p: [0.17, 0.56, 0.3], sp: 'root', pole: [0.8, -0.2, -0.4], roll: 20, aim: null, dir: null },
  rh: { p: [-0.2, 0.74, 0.3], sp: 'root', pole: [-0.8, -0.6, -0.2], roll: 60, aim: null, dir: null },
  lf: { p: [0.16, 0, 0.44], yaw: 10, pitch: 0, pole: [0.2, 0.2, 1] },
  rf: { p: [-0.15, 0, 0.4], yaw: -8, pitch: 0, pole: [-0.2, 0.2, 1] },
};
/** At a desk: sat, leant in over it, both hands on its top. */
const SIT_DESK: Omit<Key, 't'> = {
  ...SIT,
  hipsR: [-2, 0, 0],
  spine: [10, 0, 0],
  chest: [8, 0, 0],
  neck: [8, 0, 0],
  head: [14, 0, 0],
  lh: { p: [0.2, 0.82, 0.46], sp: 'root', pole: [0.8, -0.6, -0.2], roll: 80, aim: null, dir: null },
  rh: { p: [-0.18, 0.82, 0.48], sp: 'root', pole: [-0.8, -0.6, -0.2], roll: 80, aim: null, dir: null },
};

/**
 * Sat back in a chair, legs crossed: the right thigh over the left knee, its foot hanging in front
 * of the left shin, both hands resting on the top knee, the head turned a little.
 */
const SIT_CROSS: Omit<Key, 't'> = {
  ...SIT,
  hips: [0.0, -0.49, -0.12],
  hipsR: [0, -6, 3],
  spine: [4, 2, 0],
  chest: [4, 2, 0],
  neck: [2, 4, 0],
  head: [-2, 10, -3],
  lf: { p: [0.07, 0, 0.42], yaw: 6, pitch: 0, pole: [0.25, 0.2, 1] },
  rf: { p: [0.09, 0.14, 0.56], yaw: 16, pitch: -30, pole: [0.15, 0.6, 0.8] },
  rh: { p: [0.03, 0.66, 0.38], sp: 'root', pole: [-0.8, -0.4, -0.3], roll: 85, aim: null, dir: null },
  lh: { p: [0.1, 0.66, 0.42], sp: 'root', pole: [0.8, -0.4, -0.2], roll: 85, aim: null, dir: null },
};

export function registerDances() {
  // the bounce: down on every beat, the arms loose, a shoulder roll
  loop('dance_a', 4, (t, i) => {
    const down = i % 2 === 0;
    const side = i % 4 < 2 ? 1 : -1;
    return k(t, RELAXED, {
      hips: [side * 0.03, down ? -0.09 : -0.02, 0], hipsR: [down ? 6 : 2, side * 8, side * 4], spine: [4, -side * 6, -side * 3], chest: [3, -side * 4, -side * 2], head: [down ? 8 : -2, side * 6, 0],
      lh: hand(0.24, down ? -0.2 : -0.12, 0.2, 30), rh: hand(-0.24, down ? -0.14 : -0.22, 0.22, 30),
      lf: { p: [0.14, 0, 0.04], yaw: 10 }, rf: { p: [-0.14, 0, -0.02], yaw: -10 },
    });
  });
  // hands up: the drop, both arms over the head, swaying
  loop('dance_b', 4, (t, i) => {
    const side = i % 4 < 2 ? 1 : -1;
    const down = i % 2 === 0;
    return k(t, RELAXED, {
      hips: [side * 0.05, down ? -0.06 : -0.01, 0], hipsR: [2, side * 10, side * 6], spine: [-4, -side * 5, -side * 5], chest: [-6, -side * 4, -side * 3], head: [-12, side * 8, side * 4],
      lh: handR(0.18 + side * 0.06, 1.95, 0.12, 60), rh: handR(-0.18 + side * 0.06, 1.98, 0.1, 60),
      lf: { p: [0.15, 0, 0.02], yaw: 12 }, rf: { p: [-0.15, 0, 0.0], yaw: -12 },
    });
  });
  // the two-step: a step out and back each side, the arms with it
  loop('dance_c', 4, (t, i) => {
    const ph = i % 4;
    const out = ph === 1 ? 1 : ph === 3 ? -1 : 0;
    return k(t, RELAXED, {
      root: [out * 0.08, 0, 0], hips: [out * 0.04, -0.06, 0], hipsR: [4, out * 12, out * 5], spine: [3, -out * 6, 0], head: [2, out * 10, 0],
      lh: hand(0.22 + Math.max(0, out) * 0.12, -0.1 + Math.max(0, out) * 0.12, 0.24, 20), rh: hand(-0.22 + Math.min(0, out) * 0.12, -0.1 - Math.min(0, out) * 0.12, 0.24, 20),
      lf: { p: [0.14 + Math.max(0, out) * 0.16, 0, 0.03], yaw: 12, lift: 0.06 }, rf: { p: [-0.14 + Math.min(0, out) * 0.16, 0, -0.01], yaw: -12, lift: 0.06 },
    });
  });
  // the sway: hardly dancing, a drink up, the head going
  loop('dance_d', 4, (t, i) => {
    const side = i % 4 < 2 ? 1 : -1;
    const down = i % 2 === 0;
    return k(t, RELAXED, {
      hips: [side * 0.04, down ? -0.04 : -0.01, 0], hipsR: [2, side * 6, side * 5], spine: [2, -side * 3, -side * 3], head: [down ? 6 : -4, side * 4, side * 3],
      lh: hand(0.22, -0.3, 0.12, 10), rh: hand(-0.12, down ? 0.02 : 0.06, 0.28, 70),
      lf: { p: [0.13, 0, 0.03], yaw: 10 }, rf: { p: [-0.13, 0, -0.01], yaw: -10 },
    });
  });
  // leaning on the bar, a drink in hand
  defineClip('st_lean', {
    loop: true,
    keys: [0, 2].map((t) =>
      k(t, RELAXED, {
        hips: [0.04, -0.03, -0.02], hipsR: [-2, -14, 3], spine: [4, 6, 0], chest: [6, 4, 0], head: [2, 12, 0],
        lh: hand(0.24, -0.02, 0.26, 70), rh: handR(-0.32, 1.08, 0.24, 40),
        lf: { p: [0.12, 0, 0.06], yaw: 14 }, rf: { p: [-0.16, 0, -0.04], yaw: -4 },
      }),
    ),
  });
  // behind the bar: shaking a drink
  loop('st_shake', 2, (t, i) => {
    const up = i % 2 === 0;
    return k(t, RELAXED, {
      spine: [6, 0, 0], chest: [4, 0, 0], head: [10, 0, 0],
      lh: hand(0.08, up ? 0.12 : 0.02, 0.3, 80), rh: hand(-0.04, up ? 0.18 : 0.06, 0.32, 80),
    });
  });
  // a glass held at the chest, a sip every few bars
  loop('st_drink', 8, (t, i) => {
    const sip = i >= 12 && i <= 13;
    return k(t, RELAXED, {
      head: [sip ? -10 : 2, 4, 0], neck: [sip ? -6 : 0, 0, 0],
      rh: sip ? hand(-0.04, 0.27, 0.16, 90) : hand(-0.12, -0.12, 0.26, 70),
      lh: hand(0.22, -0.4, 0.06, 0),
    });
  });
  // the DJ: a cup of the headphones to one ear, the other hand on the mixer, the head on the beat
  loop('st_dj', 2, (t, i) => {
    const down = i % 2 === 0;
    return k(t, RELAXED, {
      hips: [0, down ? -0.04 : -0.01, 0], spine: [10, 0, 0], chest: [8, -6, 0], neck: [6, 0, 0], head: [down ? 18 : 6, -8, 6],
      lh: hand(0.16, 0.42, 0.02, 100), rh: handR(-0.16, 1.02, 0.42, 80),
    });
  });
  hold('st_sit', SIT);
  hold('st_sitdesk', SIT_DESK);
  // (the crossed foot comes up off the floor as she settles, then stays: not a loop, which would
  // put it back down every time round)
  defineClip('st_sitcross', { keys: [k(0, SIT_CROSS), k(0.5, SIT_CROSS), k(600, SIT_CROSS)], settleFeet: 0.45 });
}
