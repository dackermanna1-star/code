import { defineClip, Key } from '../clip';
import { k, RELAXED } from './stances';

/**
 * Poses for the story's scenes, held as looping two-key clips: captives kneeling with their hands
 * tied behind them, sitting against the wall with their knees up, cowering; thugs warming their
 * hands at the drum fire, standing with their arms crossed, smoking; Scarlet reading a phone,
 * crouching to take something off the floor.
 */
const hold = (name: string, pose: Omit<Key, 't'>) => defineClip(name, { keys: [k(0, pose), k(1, pose)], loop: true });

/** Kneeling, sat back on the heels, the hands tied behind, the head down. */
const KNEEL: Omit<Key, 't'> = {
  ...RELAXED,
  hips: [0, -0.5, -0.1],
  hipsR: [6, 0, 0],
  spine: [8, 0, 0],
  chest: [6, 0, 0],
  neck: [14, 0, 0],
  head: [16, 0, 0],
  lh: { p: [0.06, -0.36, -0.2], sp: 'chest', pole: [0.8, -0.3, -1], roll: 0, aim: null, dir: null },
  rh: { p: [-0.06, -0.36, -0.2], sp: 'chest', pole: [-0.8, -0.3, -1], roll: 0, aim: null, dir: null },
  lf: { p: [0.13, 0.06, -0.52], yaw: 6, pitch: 78, pole: [0.1, 0, 1] },
  rf: { p: [-0.13, 0.06, -0.52], yaw: -6, pitch: 78, pole: [-0.1, 0, 1] },
};

/** On the floor against the wall: knees up, forearms over them, the head back on the wall. */
const SIT_WALL: Omit<Key, 't'> = {
  ...RELAXED,
  hips: [0, -0.8, -0.05],
  hipsR: [-18, 0, 0],
  spine: [8, 0, 0],
  chest: [10, 0, 0],
  neck: [6, 0, 0],
  head: [-4, 8, 0],
  lh: { p: [0.14, 0.44, 0.34], sp: 'root', pole: [0.8, -0.4, -0.4], roll: 40, aim: null, dir: null },
  rh: { p: [-0.12, 0.42, 0.36], sp: 'root', pole: [-0.8, -0.4, -0.4], roll: 40, aim: null, dir: null },
  lf: { p: [0.16, 0, 0.4], yaw: 12, pitch: 0, pole: [0.2, 1, 0.6] },
  rf: { p: [-0.15, 0, 0.36], yaw: -10, pitch: 0, pole: [-0.2, 1, 0.6] },
};

/** Crouched low, the arms up over the head. */
const COWER: Omit<Key, 't'> = {
  ...RELAXED,
  hips: [0, -0.42, -0.08],
  hipsR: [28, 0, 0],
  spine: [16, 0, 0],
  chest: [12, 0, 0],
  neck: [16, 0, 0],
  head: [14, 0, 0],
  lh: { p: [0.12, 0.3, 0.16], sp: 'chest', pole: [1, 0.2, -0.3], roll: 60, aim: null, dir: null },
  rh: { p: [-0.1, 0.32, 0.18], sp: 'chest', pole: [-1, 0.2, -0.3], roll: 60, aim: null, dir: null },
  lf: { p: [0.17, 0, 0.12], yaw: 14, pitch: 0, pole: [0.4, 0, 1] },
  rf: { p: [-0.17, 0, 0.02], yaw: -14, pitch: 18, pole: [-0.4, 0, 1] },
};

/** Standing, the wrists tied in front, the head bowed. */
const BOUND: Omit<Key, 't'> = {
  ...RELAXED,
  spine: [6, 0, 0],
  chest: [5, 0, 0],
  neck: [10, 0, 0],
  head: [10, 0, 0],
  lh: { p: [0.035, -0.3, 0.21], sp: 'chest', pole: [0.6, -0.4, -1], roll: 70, aim: null, dir: null },
  rh: { p: [-0.035, -0.3, 0.21], sp: 'chest', pole: [-0.6, -0.4, -1], roll: 70, aim: null, dir: null },
};

/** Hands held out over the drum fire. */
const WARM: Omit<Key, 't'> = {
  ...RELAXED,
  spine: [8, 0, 0],
  chest: [6, 0, 0],
  head: [8, 0, 0],
  lh: { p: [0.12, -0.1, 0.42], sp: 'chest', pole: [0.8, -1, 0], roll: 75, aim: null, dir: null },
  rh: { p: [-0.12, -0.12, 0.4], sp: 'chest', pole: [-0.8, -1, 0], roll: 75, aim: null, dir: null },
};

/** Arms crossed over the chest (a doorman, a man waiting). */
const CROSSED: Omit<Key, 't'> = {
  ...RELAXED,
  hips: [0, -0.015, 0],
  spine: [0, 0, 0],
  chest: [-2, 0, 0],
  head: [-3, 0, 0],
  lh: { p: [-0.16, -0.13, 0.15], sp: 'chest', pole: [1, -0.5, -0.1], roll: 0, aim: null, dir: null },
  rh: { p: [0.17, -0.1, 0.17], sp: 'chest', pole: [-1, -0.5, -0.1], roll: 0, aim: null, dir: null },
  lf: { p: [0.14, 0, 0.02], yaw: 12 },
  rf: { p: [-0.14, 0, -0.02], yaw: -12 },
};

/** A cigarette to the lips, the other hand in a pocket. */
const SMOKE: Omit<Key, 't'> = {
  ...RELAXED,
  head: [-4, 6, 0],
  rh: { p: [-0.04, 0.24, 0.17], sp: 'chest', pole: [-0.7, -1, 0], roll: 40, aim: null, dir: null },
  lh: { p: [0.2, -0.43, 0.06], sp: 'chest', pole: [0.4, 0, -1], roll: -20, aim: null, dir: null },
};

/** Looking down at a phone held in both hands. */
const PHONE: Omit<Key, 't'> = {
  ...RELAXED,
  spine: [6, 0, 0],
  chest: [6, 0, 0],
  neck: [14, 0, 0],
  head: [20, 0, 0],
  rh: { p: [-0.05, -0.05, 0.3], sp: 'chest', pole: [-0.8, -1, 0], roll: 60, aim: null, dir: null },
  lh: { p: [0.03, -0.07, 0.29], sp: 'chest', pole: [0.8, -1, 0], roll: 60, aim: null, dir: null },
};

/** Down on one knee, a hand reaching to the floor in front. */
const CROUCH: Omit<Key, 't'> = {
  ...RELAXED,
  hips: [0, -0.48, -0.05],
  hipsR: [26, 0, 0],
  spine: [14, 0, 0],
  chest: [10, 0, 0],
  neck: [10, 0, 0],
  head: [14, 0, 0],
  rh: { p: [-0.12, 0.06, 0.5], sp: 'root', pole: [-0.6, -0.2, -1], roll: 80, aim: null, dir: null },
  lh: { p: [0.2, 0.5, 0.28], sp: 'root', pole: [0.8, -0.3, -0.6], roll: 30, aim: null, dir: null },
  lf: { p: [0.15, 0, 0.3], yaw: 10, pitch: 0, pole: [0.3, 0.4, 1] },
  rf: { p: [-0.14, 0.04, -0.34], yaw: -8, pitch: 62, pole: [-0.1, -0.4, 1] },
};

export function registerStoryPoses() {
  hold('st_kneel', KNEEL);
  hold('st_sitwall', SIT_WALL);
  hold('st_cower', COWER);
  hold('st_bound', BOUND);
  hold('st_warm', WARM);
  hold('st_crossed', CROSSED);
  hold('st_smoke', SMOKE);
  hold('st_phone', PHONE);
  hold('st_crouch', CROUCH);
}
