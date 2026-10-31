import { defineClip, defineClipPair, Key } from '../clip';
import { BRAWL, FIGHT, k } from './stances';

/** Weapon hold (right hand) base: blade/club forward-down. */
const WEAP: Omit<Key, 't'> = {
  ...BRAWL,
  rh: { p: [-0.16, 0.02, 0.3], sp: 'chest', pole: [-0.5, -1, -0.1], roll: 0, dir: [0, 0.3, 1], dirW: 0.6 },
};
const HEAVY: Omit<Key, 't'> = {
  ...BRAWL,
  hips: [0, -0.05, 0],
  hipsR: [8, -8, 0],
  spine: [8, 2, 0],
  chest: [6, 2, 0],
  lh: { p: [0.26, 0.04, 0.3], sp: 'chest', pole: [0.6, -1, 0], roll: 40 },
  rh: { p: [-0.22, 0.05, 0.3], sp: 'chest', pole: [-0.6, -1, 0], roll: 40 },
  lf: { p: [0.17, 0, 0.1], yaw: 6 },
  rf: { p: [-0.17, 0, -0.12], yaw: -18 },
};

export function registerEnemyMoves() {
  // ------------------------------------------------------------------ straight right punch (thug)
  defineClipPair('e_punch', {
    warp: [0.25, 0.48], hitT: 0.5, recoverT: 0.85,
    keys: [
      k(0, BRAWL),
      k(0.36, BRAWL, { e: 'out', root: [0, -0.05, 0], hips: [0, -0.05, -0.05], hipsR: [2, -40, 0], torso: [-4, -18, 4], head: [-6, 30, 0], rh: { p: [-0.28, 0.24, -0.02], sp: 'chest', roll: 30, pole: [-0.8, -0.2, -0.6] } }),
      k(0.5, BRAWL, { e: 'expoIn', root: [0, 0.32, 0], hips: [0.02, -0.08, 0.08], hipsR: [6, 16, 0], torso: [12, 20, -4], head: [-6, -10, 0], rh: { p: [0, 1.5, 0.85], aim: 'head', aimOff: [0, 0, -0.05], roll: 85, pole: [-0.6, -0.6, -0.3] }, lf: { p: [0.14, 0, 0.42] }, rf: { p: [-0.13, 0, -0.05], pitch: 30, yaw: -10 } }),
      k(0.66, BRAWL, { e: 'out', root: [0, 0.34, 0], hipsR: [4, 0, 0], torso: [8, 8, 0], rh: { p: [-0.1, 0.1, 0.32], sp: 'chest', aim: null, roll: 25 }, lf: { p: [0.14, 0, 0.42] }, rf: { p: [-0.14, 0, 0.0], pitch: 0, yaw: -28 } }),
      k(0.88, BRAWL, { root: [0, 0.34, 0], lf: { p: [0.14, 0, 0.42] }, rf: { p: [-0.15, 0, 0.12] } }),
    ],
    events: [{ t: 0.4, type: 'sfx', name: 'whoosh_light' }, { t: 0.5, type: 'hit', limb: 'rh' }],
  });

  // ------------------------------------------------------------------ haymaker (wide hook)
  defineClipPair('e_haymaker', {
    warp: [0.3, 0.56], hitT: 0.58, recoverT: 0.95,
    keys: [
      k(0, BRAWL),
      k(0.42, BRAWL, { e: 'out', root: [0, -0.06, 0], hips: [0, -0.07, -0.04], hipsR: [0, -50, 0], torso: [-2, -30, 8], head: [-4, 40, 0], rh: { p: [-0.5, 0.2, -0.12], sp: 'chest', roll: 0, pole: [-0.6, 0.6, -0.6] }, lh: { p: [0.25, 0.1, 0.35], sp: 'chest' } }),
      k(0.58, BRAWL, { e: 'expoIn', root: [0, 0.3, 0], hips: [0.02, -0.1, 0.06], hipsR: [6, 30, 0], torso: [14, 34, -8], head: [-4, -24, 0], rh: { p: [0, 1.55, 0.6], aim: 'head', aimOff: [-0.07, 0, 0], roll: 0, pole: [-1, 0.6, 0.2] }, lf: { p: [0.15, 0, 0.4], yaw: 20 }, rf: { p: [-0.14, 0, -0.02], pitch: 30, yaw: 10 } }),
      k(0.76, BRAWL, { e: 'out', root: [0, 0.34, 0], hipsR: [4, 20, 0], torso: [10, 20, 0], rh: { p: [0.2, -0.05, 0.25], sp: 'chest', aim: null, pole: [-0.3, -1, 0] }, lf: { p: [0.15, 0, 0.4], yaw: 10 }, rf: { p: [-0.14, 0, 0.0], pitch: 0, yaw: -20 } }),
      k(1.0, BRAWL, { root: [0, 0.34, 0], lf: { p: [0.15, 0, 0.4], yaw: 0 }, rf: { p: [-0.15, 0, 0.1], yaw: -28 } }),
    ],
    events: [{ t: 0.47, type: 'sfx', name: 'whoosh_heavy' }, { t: 0.58, type: 'hit', limb: 'rh', dir: 'left' }],
  });

  // ------------------------------------------------------------------ front kick (thug)
  defineClipPair('e_kick', {
    warp: [0.2, 0.52], hitT: 0.55, recoverT: 0.95,
    keys: [
      k(0, BRAWL),
      k(0.36, BRAWL, { e: 'out', hips: [0, -0.04, -0.05], hipsR: [-4, -10, 0], torso: [-8, 0, 0], rf: { p: [-0.1, 0.42, 0.08], pitch: -5, pole: [0, 0.3, 1] }, lf: { yaw: 15 } }),
      k(0.55, BRAWL, { e: 'expoIn', root: [0, 0.12, 0], hips: [0, 0.0, 0.05], hipsR: [-12, 10, 0], torso: [-16, 4, 0], rf: { p: [-0.05, 0.95, 0.75], aim: 'gut', aimOff: [0, -0.04, -0.17], pitch: -25, toe: 35, pole: [0, 0.2, 1] }, lh: { p: [0.28, 0.1, 0.25], sp: 'chest' } }),
      k(0.72, BRAWL, { e: 'out', root: [0, 0.14, 0], torso: [-4, 0, 0], rf: { p: [-0.1, 0.35, 0.3], aim: null, pitch: 0, toe: 0 } }),
      k(0.95, BRAWL, { root: [0, 0.2, 0], rf: { p: [-0.15, 0, 0.0] }, lf: { yaw: 0 } }),
    ],
    events: [{ t: 0.45, type: 'sfx', name: 'whoosh_heavy' }, { t: 0.55, type: 'hit', limb: 'rf', dir: 'back' }],
  });

  // ------------------------------------------------------------------ lunge punch (agile): long gap closer
  defineClipPair('e_lunge', {
    warp: [0.12, 0.42], hitT: 0.44, recoverT: 0.78,
    keys: [
      k(0, FIGHT),
      k(0.18, FIGHT, { e: 'out', root: [0, -0.04, 0], hips: [0, -0.16, -0.04], hipsR: [10, -30, 0], torso: [18, -10, 0], rh: { p: [-0.12, 0.05, 0.12], sp: 'chest' } }),
      k(0.44, FIGHT, { e: 'expoIn', root: [0, 0.9, 0], hips: [0.02, -0.12, 0.1], hipsR: [8, 10, 0], torso: [14, 16, -4], rh: { p: [0, 1.5, 0.85], aim: 'head', aimOff: [0, 0, -0.06], roll: 88, pole: [-0.6, -0.6, -0.3] }, lf: { p: [0.12, 0, 1.15], yaw: -6 }, rf: { p: [-0.12, 0, 0.6], pitch: 30, yaw: -20 } }),
      k(0.6, FIGHT, { e: 'out', root: [0, 0.95, 0], rh: { p: [-0.03, 0.19, 0.25], sp: 'chest', aim: null, roll: 15 }, lf: { p: [0.12, 0, 1.15] }, rf: { p: [-0.13, 0, 0.85], pitch: 0, yaw: -38 } }),
      k(0.8, FIGHT, { root: [0, 0.95, 0], lf: { p: [0.12, 0, 1.15] }, rf: { p: [-0.13, 0, 0.85] } }),
    ],
    events: [{ t: 0.3, type: 'sfx', name: 'whoosh_light' }, { t: 0.44, type: 'hit', limb: 'rh' }],
  });

  // ------------------------------------------------------------------ knife slash (horizontal, counterable)
  defineClipPair('e_knife_slash', {
    warp: [0.25, 0.48], hitT: 0.5, recoverT: 0.85,
    keys: [
      k(0, WEAP),
      k(0.36, WEAP, { e: 'out', root: [0, -0.04, 0], hipsR: [2, -45, 0], torso: [0, -25, 6], head: [-6, 30, 0], rh: { p: [-0.5, 0.15, 0.0], sp: 'chest', roll: 0, pole: [-0.6, 0.5, -0.6], dir: [-1, 0.2, 0.3], dirW: 1 } }),
      k(0.5, WEAP, { e: 'expoIn', root: [0, 0.3, 0], hips: [0.02, -0.08, 0.06], hipsR: [6, 28, 0], torso: [10, 30, -6], rh: { p: [0, 1.3, 0.6], aim: 'chest', aimOff: [-0.15, 0.05, -0.1], roll: 0, pole: [-1, 0.4, 0.2], dir: [1, 0, 0.6], dirW: 1 }, lf: { p: [0.14, 0, 0.4] }, rf: { p: [-0.13, 0, -0.04], pitch: 25 } }),
      k(0.66, WEAP, { e: 'out', root: [0, 0.32, 0], hipsR: [4, 30, 0], torso: [8, 26, 0], rh: { p: [0.3, 0.0, 0.25], sp: 'chest', aim: null, dir: [1, -0.2, 0], dirW: 1 }, lf: { p: [0.14, 0, 0.4] }, rf: { p: [-0.14, 0, 0.0], pitch: 0 } }),
      k(0.88, WEAP, { root: [0, 0.32, 0], lf: { p: [0.14, 0, 0.4] }, rf: { p: [-0.15, 0, 0.12] } }),
    ],
    events: [{ t: 0.42, type: 'sfx', name: 'whoosh_light' }, { t: 0.5, type: 'hit', limb: 'rh', dir: 'left' }],
  });

  // ------------------------------------------------------------------ knife lunge stab (unblockable)
  defineClipPair('e_knife_stab', {
    warp: [0.3, 0.6], hitT: 0.62, recoverT: 1.0,
    keys: [
      k(0, WEAP),
      k(0.42, WEAP, { e: 'out', root: [0, -0.1, 0], hips: [0, -0.18, -0.08], hipsR: [12, -40, 0], torso: [16, -20, 0], rh: { p: [-0.2, 0.0, -0.15], sp: 'chest', dir: [0, 0, 1], dirW: 1, roll: 90 }, lf: { p: [0.14, 0, 0.12] } }),
      k(0.62, WEAP, { e: 'expoIn', root: [0, 0.75, 0], hips: [0.02, -0.18, 0.1], hipsR: [12, 10, 0], torso: [20, 16, -4], rh: { p: [0, 1.15, 0.7], aim: 'gut', aimOff: [0, 0, -0.02], roll: 90, dir: [0, 0, 1], dirW: 1, pole: [-0.4, -0.8, -0.3] }, lf: { p: [0.14, 0, 1.0], yaw: -4 }, rf: { p: [-0.13, 0, 0.2], pitch: 35, yaw: -20 } }),
      k(0.8, WEAP, { e: 'out', root: [0, 0.78, 0], rh: { p: [-0.16, 0.02, 0.3], sp: 'chest', aim: null, dir: [0, 0.3, 1], dirW: 0.6, roll: 0 }, lf: { p: [0.14, 0, 1.0] }, rf: { p: [-0.14, 0, 0.55], pitch: 0, yaw: -28 } }),
      k(1.02, WEAP, { root: [0, 0.78, 0], lf: { p: [0.14, 0, 1.0] }, rf: { p: [-0.15, 0, 0.62] } }),
    ],
    events: [{ t: 0.5, type: 'sfx', name: 'whoosh_light' }, { t: 0.62, type: 'hit', limb: 'rh', dir: 'back' }],
  });

  // ------------------------------------------------------------------ club / bat horizontal swing (counterable)
  defineClipPair('e_club_swing', {
    warp: [0.3, 0.56], hitT: 0.58, recoverT: 1.0,
    keys: [
      k(0, WEAP),
      k(0.44, WEAP, { e: 'out', root: [0, -0.05, 0], hipsR: [0, -60, 0], torso: [-4, -32, 8], head: [-4, 40, 0], rh: { p: [-0.4, 0.35, -0.2], sp: 'chest', roll: 0, pole: [-0.5, 0.2, -1], dir: [-0.5, 0.7, -0.5], dirW: 1 }, lh: { p: [-0.25, 0.3, -0.1], sp: 'chest' } }),
      k(0.58, WEAP, { e: 'expoIn', root: [0, 0.3, 0], hips: [0.02, -0.1, 0.06], hipsR: [6, 30, 0], torso: [10, 34, -8], rh: { p: [0, 1.45, 0.55], aim: 'head', aimOff: [-0.35, -0.05, -0.15], roll: 0, pole: [-1, 0.4, 0.2], dir: [1, 0, 0.3], dirW: 1 }, lh: { p: [0.2, 0.15, 0.35], sp: 'chest' }, lf: { p: [0.15, 0, 0.42], yaw: 20 }, rf: { p: [-0.14, 0, -0.02], pitch: 30, yaw: 10 } }),
      k(0.78, WEAP, { e: 'out', root: [0, 0.34, 0], hipsR: [4, 40, 0], torso: [8, 30, 0], rh: { p: [0.35, -0.1, 0.1], sp: 'chest', aim: null, dir: [0.6, -0.6, -0.4], dirW: 1 }, lf: { p: [0.15, 0, 0.42] }, rf: { p: [-0.14, 0, 0.0], pitch: 0, yaw: -20 } }),
      k(1.05, WEAP, { root: [0, 0.34, 0], lf: { p: [0.15, 0, 0.42] }, rf: { p: [-0.15, 0, 0.1], yaw: -28 } }),
    ],
    events: [{ t: 0.48, type: 'sfx', name: 'whoosh_heavy' }, { t: 0.58, type: 'hit', limb: 'rh', dir: 'left' }],
  });

  // ------------------------------------------------------------------ club overhead smash (unblockable)
  defineClipPair('e_club_overhead', {
    warp: [0.35, 0.66], hitT: 0.68, recoverT: 1.15,
    keys: [
      k(0, WEAP),
      k(0.5, WEAP, { e: 'out', root: [0, -0.08, 0], hips: [0, 0.0, -0.06], hipsR: [-10, -15, 0], torso: [-18, -6, 0], head: [-14, 10, 0], rh: { p: [-0.1, 0.55, -0.15], sp: 'chest', roll: -20, pole: [-0.4, 0.6, -0.6], dir: [0, 0.2, -1], dirW: 1 }, lh: { p: [0.0, 0.55, -0.1], sp: 'chest' } }),
      k(0.68, WEAP, { e: 'expoIn', root: [0, 0.32, 0], hips: [0, -0.18, 0.08], hipsR: [20, 0, 0], torso: [30, 4, 0], head: [-10, 0, 0], rh: { p: [0, 1.0, 0.6], aim: 'head', aimOff: [0, -0.45, -0.25], roll: -20, pole: [-0.3, -1, 0], dir: [0, -0.6, 1], dirW: 1 }, lh: { p: [-0.02, 0.98, 0.55], aim: 'head', aimOff: [0.04, -0.45, -0.3] }, lf: { p: [0.15, 0, 0.42] }, rf: { p: [-0.14, 0, -0.04], pitch: 25 } }),
      k(0.95, WEAP, { e: 'out', root: [0, 0.34, 0], hipsR: [10, 0, 0], torso: [16, 0, 0], rh: { p: [-0.15, -0.1, 0.35], sp: 'chest', aim: null, dir: [0, -0.5, 1], dirW: 1 }, lh: { aim: null, p: [0.22, 0.12, 0.3], sp: 'chest' }, lf: { p: [0.15, 0, 0.42] }, rf: { p: [-0.15, 0, 0.0], pitch: 0 } }),
      k(1.2, WEAP, { root: [0, 0.34, 0], lf: { p: [0.15, 0, 0.42] }, rf: { p: [-0.15, 0, 0.1] } }),
    ],
    events: [{ t: 0.58, type: 'sfx', name: 'whoosh_heavy' }, { t: 0.68, type: 'hit', limb: 'rh', dir: 'down' }],
  });

  // ------------------------------------------------------------------ sword diagonal slash (counterable)
  defineClipPair('e_sword_slash', {
    warp: [0.25, 0.5], hitT: 0.52, recoverT: 0.9,
    keys: [
      k(0, WEAP),
      k(0.38, WEAP, { e: 'out', root: [0, -0.05, 0], hipsR: [0, -50, 0], torso: [-8, -28, 10], rh: { p: [-0.35, 0.5, -0.1], sp: 'chest', roll: 0, pole: [-0.6, 0.6, -0.5], dir: [-0.4, 0.8, -0.3], dirW: 1 }, lh: { p: [0.2, 0.2, 0.25], sp: 'chest' } }),
      k(0.52, WEAP, { e: 'expoIn', root: [0, 0.3, 0], hips: [0.02, -0.12, 0.06], hipsR: [8, 26, 0], torso: [18, 30, -10], rh: { p: [0, 1.0, 0.6], aim: 'chest', aimOff: [0.25, -0.35, -0.1], roll: 0, pole: [-0.8, 0.2, 0.4], dir: [0.6, -0.6, 0.5], dirW: 1 }, lf: { p: [0.14, 0, 0.42], yaw: 15 }, rf: { p: [-0.14, 0, -0.04], pitch: 28 } }),
      k(0.72, WEAP, { e: 'out', root: [0, 0.32, 0], hipsR: [4, 30, 0], torso: [10, 24, 0], rh: { p: [0.3, -0.25, 0.2], sp: 'chest', aim: null, dir: [0.5, -0.8, 0.2], dirW: 1 }, lf: { p: [0.14, 0, 0.42] }, rf: { p: [-0.15, 0, 0.0], pitch: 0 } }),
      k(0.92, WEAP, { root: [0, 0.32, 0], lf: { p: [0.14, 0, 0.42] }, rf: { p: [-0.15, 0, 0.1] } }),
    ],
    events: [{ t: 0.44, type: 'sfx', name: 'sword_swing' }, { t: 0.52, type: 'hit', limb: 'rh', dir: 'right' }],
  });

  // ------------------------------------------------------------------ sword spin slash (unblockable)
  defineClipPair('e_sword_spin', {
    warp: [0.3, 0.66], hitT: 0.68, recoverT: 1.1,
    keys: [
      k(0, WEAP),
      k(0.4, WEAP, { e: 'out', root: [0, -0.06, 30], hips: [0, -0.14, 0], hipsR: [8, -40, 0], torso: [10, -30, 0], rh: { p: [-0.45, 0.1, -0.15], sp: 'chest', dir: [-1, 0, -0.2], dirW: 1 } }),
      k(0.56, WEAP, { e: 'linear', root: [0, 0.2, -160], hips: [0, -0.18, 0], hipsR: [10, -20, 0], torso: [14, -10, 0], rh: { p: [-0.6, 0.0, -0.2], sp: 'chest', dir: [-1, 0, 0], dirW: 1 } }),
      k(0.68, WEAP, { e: 'linear', root: [0, 0.35, -330], hips: [0, -0.2, 0.05], hipsR: [12, 20, 0], torso: [16, 26, -6], rh: { p: [-0.1, 1.2, 0.8], aim: 'gut', aimOff: [-0.4, 0, -0.2], dir: [1, 0, 0.4], dirW: 1, pole: [-1, 0.3, 0] }, lf: { p: [0.14, 0, 0.45], yaw: -300 }, rf: { p: [-0.12, 0, 0.1], yaw: -330 } }),
      k(0.9, WEAP, { e: 'out', root: [0, 0.38, -360], hipsR: [6, 10, 0], torso: [8, 10, 0], rh: { p: [0.3, -0.1, 0.2], sp: 'chest', aim: null, dir: [0.5, -0.5, 0.3], dirW: 1 }, lf: { p: [0.14, 0, 0.45], yaw: -360 }, rf: { p: [-0.14, 0, 0.12], yaw: -390 } }),
      k(1.15, WEAP, { root: [0, 0.38, -360], lf: { p: [0.14, 0, 0.45], yaw: -360 }, rf: { p: [-0.15, 0, 0.16], yaw: -388 } }),
    ],
    events: [{ t: 0.5, type: 'sfx', name: 'sword_swing' }, { t: 0.68, type: 'hit', limb: 'rh', dir: 'right' }],
  });

  // ------------------------------------------------------------------ bruiser: big punch (counterable)
  defineClipPair('e_bruiser_punch', {
    warp: [0.3, 0.6], hitT: 0.62, recoverT: 1.05,
    keys: [
      k(0, HEAVY),
      k(0.46, HEAVY, { e: 'out', root: [0, -0.08, 0], hips: [0, -0.06, -0.06], hipsR: [0, -45, 0], torso: [-6, -25, 6], head: [-6, 30, 0], rh: { p: [-0.35, 0.28, -0.1], sp: 'chest', roll: 30, pole: [-0.8, -0.1, -0.6] } }),
      k(0.62, HEAVY, { e: 'expoIn', root: [0, 0.35, 0], hips: [0.02, -0.1, 0.08], hipsR: [8, 20, 0], torso: [16, 24, -6], rh: { p: [0, 1.5, 0.9], aim: 'head', aimOff: [0, -0.02, -0.08], roll: 80, pole: [-0.6, -0.6, -0.3] }, lf: { p: [0.17, 0, 0.45] }, rf: { p: [-0.17, 0, -0.04], pitch: 25 } }),
      k(0.85, HEAVY, { e: 'out', root: [0, 0.38, 0], hipsR: [6, 6, 0], torso: [10, 8, 0], rh: { p: [-0.2, 0.05, 0.32], sp: 'chest', aim: null, roll: 40 }, lf: { p: [0.17, 0, 0.45] }, rf: { p: [-0.17, 0, 0.0], pitch: 0 } }),
      k(1.1, HEAVY, { root: [0, 0.38, 0], lf: { p: [0.17, 0, 0.45] }, rf: { p: [-0.17, 0, 0.14] } }),
    ],
    events: [{ t: 0.5, type: 'sfx', name: 'whoosh_heavy' }, { t: 0.62, type: 'hit', limb: 'rh' }],
  });

  // ------------------------------------------------------------------ bruiser: double-fist overhead smash (unblockable)
  defineClip('e_bruiser_smash', {
    warp: [0.35, 0.74], hitT: 0.78, recoverT: 1.35,
    keys: [
      k(0, HEAVY),
      k(0.55, HEAVY, { e: 'out', root: [0, -0.08, 0], hips: [0, 0.02, -0.08], hipsR: [-14, 0, 0], torso: [-22, 0, 0], head: [-16, 0, 0], lh: { p: [0.05, 0.62, 0.0], sp: 'chest', roll: -40, pole: [0.6, 0.5, -0.6] }, rh: { p: [-0.05, 0.62, 0.0], sp: 'chest', roll: -40, pole: [-0.6, 0.5, -0.6] } }),
      k(0.78, HEAVY, { e: 'expoIn', root: [0, 0.3, 0], hips: [0, -0.24, 0.1], hipsR: [26, 0, 0], torso: [36, 0, 0], head: [-8, 0, 0], lh: { p: [0.06, 0.8, 0.72], aim: 'head', aimOff: [0.05, -0.55, -0.2], roll: -60 }, rh: { p: [-0.06, 0.8, 0.72], aim: 'head', aimOff: [-0.05, -0.55, -0.2], roll: -60 }, lf: { p: [0.18, 0, 0.42] }, rf: { p: [-0.18, 0, -0.05], pitch: 10 } }),
      k(1.1, HEAVY, { e: 'out', root: [0, 0.32, 0], hips: [0, -0.15, 0.04], hipsR: [16, 0, 0], torso: [20, 0, 0], lh: { aim: null, p: [0.2, 0.0, 0.4], sp: 'chest' }, rh: { aim: null, p: [-0.2, 0.0, 0.4], sp: 'chest' }, lf: { p: [0.18, 0, 0.42] }, rf: { p: [-0.18, 0, 0.0], pitch: 0 } }),
      k(1.4, HEAVY, { root: [0, 0.32, 0], lf: { p: [0.18, 0, 0.42] }, rf: { p: [-0.17, 0, 0.12] } }),
    ],
    events: [{ t: 0.66, type: 'sfx', name: 'whoosh_heavy' }, { t: 0.78, type: 'hit', limb: 'rh', dir: 'down', shockwave: true }],
  });

  // ------------------------------------------------------------------ bruiser: shoulder charge (unblockable)
  defineClip('e_bruiser_charge', {
    warp: [0.25, 0.72], hitT: 0.74, recoverT: 1.25,
    keys: [
      k(0, HEAVY),
      k(0.3, HEAVY, { e: 'out', root: [0, -0.1, 0], hips: [0, -0.14, -0.05], hipsR: [16, -30, 0], torso: [24, -20, 0], head: [-20, 30, 0] }),
      k(0.5, HEAVY, { e: 'linear', root: [0, 1.0, 0], hips: [0, -0.1, 0.1], hipsR: [20, -40, 0], torso: [26, -30, 0], head: [-24, 40, 0], lf: { p: [0.15, 0, 1.2], lift: 0.12 }, rf: { p: [-0.15, 0, 0.6], lift: 0.12 } }),
      k(0.74, HEAVY, { e: 'linear', root: [0, 2.2, 0], hips: [0, -0.1, 0.12], hipsR: [24, -60, 0], torso: [28, -30, 0], head: [-26, 55, 0], lf: { p: [0.15, 0, 2.5], lift: 0.12 }, rf: { p: [-0.15, 0, 1.8], lift: 0.12 } }),
      k(1.0, HEAVY, { e: 'out', root: [0, 2.5, 0], hips: [0, -0.06, 0.02], hipsR: [8, -20, 0], torso: [10, -8, 0], head: [-6, 15, 0], lf: { p: [0.17, 0, 2.7] }, rf: { p: [-0.17, 0, 2.3] } }),
      k(1.3, HEAVY, { root: [0, 2.5, 0], lf: { p: [0.17, 0, 2.7] }, rf: { p: [-0.17, 0, 2.4] } }),
    ],
    events: [{ t: 0.4, type: 'sfx', name: 'grunt_attack' }, { t: 0.74, type: 'hit', limb: 'chest', dir: 'back' }],
  });

  // ------------------------------------------------------------------ taunts
  defineClip('e_taunt', {
    keys: [
      k(0, BRAWL),
      k(0.3, BRAWL, { hipsR: [-6, -5, 0], torso: [-10, 0, 0], head: [-12, 0, 0], lh: { p: [0.45, 0.25, 0.35], sp: 'chest', roll: -60, pole: [1, -0.5, 0] }, rh: { p: [-0.45, 0.25, 0.35], sp: 'chest', roll: -60, pole: [-1, -0.5, 0] } }),
      k(0.6, BRAWL, { hipsR: [-4, -5, 0], torso: [-6, 0, 0], head: [-8, 0, 0], lh: { p: [0.42, 0.15, 0.32], sp: 'chest', roll: -60, pole: [1, -0.5, 0] }, rh: { p: [-0.42, 0.15, 0.32], sp: 'chest', roll: -60, pole: [-1, -0.5, 0] } }),
      k(0.9, BRAWL, { hipsR: [-6, -5, 0], torso: [-10, 0, 0], head: [-12, 0, 0], lh: { p: [0.45, 0.25, 0.35], sp: 'chest', roll: -60, pole: [1, -0.5, 0] }, rh: { p: [-0.45, 0.25, 0.35], sp: 'chest', roll: -60, pole: [-1, -0.5, 0] } }),
      k(1.3, BRAWL),
    ],
    events: [{ t: 0.2, type: 'sfx', name: 'taunt' }],
  });
  defineClip('e_taunt2', {
    keys: [
      k(0, BRAWL),
      k(0.25, BRAWL, { rh: { p: [-0.1, 0.35, 0.4], sp: 'chest', roll: 90, pole: [-1, 0, 0] }, head: [0, 10, 6] }),
      k(0.45, BRAWL, { rh: { p: [-0.05, 0.38, 0.35], sp: 'chest', roll: 90, pole: [-1, 0, 0] }, head: [4, 10, 6] }),
      k(0.65, BRAWL, { rh: { p: [-0.1, 0.35, 0.4], sp: 'chest', roll: 90, pole: [-1, 0, 0] }, head: [0, 10, 6] }),
      k(0.95, BRAWL),
    ],
    events: [{ t: 0.15, type: 'sfx', name: 'taunt' }],
  });
}
