import { defineClip, defineClipPair } from '../clip';
import { FIGHT, k } from './stances';

/**
 * Player strike library. Clip space: +Z towards target, +X = attacker's left.
 * Root-space hand targets unless sp:'chest'. Foot p = clip-space ankle (y above ground).
 */
export function registerStrikes() {
  // ------------------------------------------------------------------ JAB (lead/left)
  defineClipPair('jab', {
    warp: [0, 0.1], hitT: 0.11, comboT: 0.17, recoverT: 0.3,
    keys: [
      k(0, FIGHT),
      k(0.05, FIGHT, { e: 'in', root: [0, 0.06, 0], hips: [0, -0.08, 0.03], hipsR: [4, -30, 0], torso: [8, -8, 0], lh: { p: [0.14, 0.2, 0.4], sp: 'chest', roll: 40 }, lf: { p: [0.1, 0, 0.24], yaw: -4 } }),
      k(0.11, FIGHT, { e: 'snap', root: [0, 0.14, 0], hips: [0.02, -0.09, 0.06], hipsR: [5, -36, 0], torso: [9, -14, 2], head: [-6, 24, 0], lh: { p: [0.05, 1.5, 0.85], aim: 'head', aimOff: [0, 0, -0.06], roll: 88, pole: [0.6, -0.6, -0.2] }, lf: { p: [0.1, 0, 0.3], yaw: -6 }, shrug: [8, 0] }),
      k(0.2, FIGHT, { e: 'out', root: [0, 0.14, 0], hips: [0.01, -0.08, 0.04], hipsR: [4, -30, 0], torso: [7, -8, 0], lh: { p: [0.15, 0.2, 0.36], sp: 'chest', aim: null, roll: 40 }, lf: { p: [0.1, 0, 0.3] }, shrug: [0, 0] }),
      k(0.36, FIGHT, { e: 'inout', root: [0, 0.16, 0], lf: { p: [0.1, 0, 0.3] }, rf: { p: [-0.13, 0, -0.04], yaw: -38, lift: 0.04 } }),
    ],
    events: [{ t: 0.02, type: 'sfx', name: 'whoosh_light' }, { t: 0.11, type: 'hit', limb: 'lh' }],
  });

  // ------------------------------------------------------------------ CROSS (rear/right)
  defineClipPair('cross', {
    warp: [0, 0.14], hitT: 0.15, comboT: 0.22, recoverT: 0.34,
    keys: [
      k(0, FIGHT),
      k(0.07, FIGHT, { e: 'in', root: [0, 0.04, 0], hips: [0, -0.09, 0], hipsR: [4, -30, 0], torso: [6, -10, 0], rh: { p: [-0.08, 0.16, 0.18], sp: 'chest', roll: 30 } }),
      k(0.15, FIGHT, { e: 'snap', root: [0, 0.16, 0], hips: [0.02, -0.1, 0.08], hipsR: [6, 14, 0], torso: [10, 18, -3], neck: [-2, -4, 0], head: [-6, -6, 0], rh: { p: [0, 1.5, 0.85], aim: 'head', aimOff: [0, 0, -0.06], roll: 86, pole: [-0.6, -0.6, -0.3] }, lh: { p: [0.12, 0.24, 0.22], sp: 'chest', roll: 20 }, lf: { p: [0.1, 0, 0.3], yaw: -2 }, rf: { p: [-0.12, 0, -0.12], yaw: -10, pitch: 32, toe: 28 }, shrug: [0, 9] }),
      k(0.26, FIGHT, { e: 'out', root: [0, 0.16, 0], hipsR: [5, -6, 0], torso: [7, 4, 0], rh: { p: [-0.05, 0.2, 0.3], sp: 'chest', aim: null, roll: 30 }, lf: { p: [0.1, 0, 0.3] }, rf: { p: [-0.12, 0, -0.1], yaw: -28, pitch: 0, toe: 0 }, shrug: [0, 0] }),
      k(0.42, FIGHT, { e: 'inout', root: [0, 0.16, 0], lf: { p: [0.1, 0, 0.3] }, rf: { p: [-0.13, 0, -0.04], yaw: -38 } }),
    ],
    events: [{ t: 0.04, type: 'sfx', name: 'whoosh_light' }, { t: 0.15, type: 'hit', limb: 'rh' }],
  });

  // ------------------------------------------------------------------ LEAD HOOK
  defineClipPair('hook', {
    warp: [0, 0.16], hitT: 0.17, comboT: 0.24, recoverT: 0.38,
    keys: [
      k(0, FIGHT),
      k(0.08, FIGHT, { e: 'in', root: [0, 0.04, 0], hipsR: [4, -10, 0], torso: [6, 12, -4], lh: { p: [0.3, 0.14, 0.2], sp: 'chest', roll: 0, pole: [1, 0.2, -0.3] } }),
      k(0.17, FIGHT, { e: 'snap', root: [0, 0.08, 0], hips: [0, -0.11, 0.02], hipsR: [4, -54, 0], torso: [8, -30, 6], head: [-4, 42, -4], lh: { p: [0, 1.55, 0.6], aim: 'head', aimOff: [0.07, 0, -0.02], roll: 5, pole: [1, 0.6, 0] }, rh: { p: [0.0, 0.24, 0.24], sp: 'chest' }, lf: { p: [0.1, 0, 0.2], yaw: -48, pitch: 18 }, rf: { yaw: -55 } }),
      k(0.3, FIGHT, { e: 'out', root: [0, 0.08, 0], hipsR: [4, -36, 0], torso: [6, -12, 2], lh: { p: [0.05, 0.22, 0.3], sp: 'chest', aim: null, pole: [0.3, -1, -0.15] }, lf: { p: [0.1, 0, 0.2], yaw: -18, pitch: 0 }, rf: { yaw: -40 } }),
      k(0.46, FIGHT, { root: [0, 0.08, 0], lf: { p: [0.1, 0, 0.22], yaw: -4 } }),
    ],
    events: [{ t: 0.07, type: 'sfx', name: 'whoosh_light' }, { t: 0.17, type: 'hit', limb: 'lh', dir: 'right' }],
  });

  // ------------------------------------------------------------------ REAR HOOK (to body)
  defineClipPair('bodyhook', {
    warp: [0, 0.17], hitT: 0.18, comboT: 0.26, recoverT: 0.4,
    keys: [
      k(0, FIGHT),
      k(0.09, FIGHT, { e: 'in', root: [0, 0.05, 0], hips: [0, -0.13, 0], hipsR: [6, -34, 0], torso: [14, -16, 8], rh: { p: [-0.3, -0.05, 0.12], sp: 'chest', pole: [-1, 0, -0.3], roll: 10 } }),
      k(0.18, FIGHT, { e: 'snap', root: [0, 0.14, 0], hips: [0.03, -0.16, 0.05], hipsR: [8, 18, 0], torso: [18, 22, -10], head: [-4, -10, 4], rh: { p: [0, 1.1, 0.6], aim: 'gut', aimOff: [-0.06, 0, -0.05], roll: 20, pole: [-1, 0.2, 0] }, lh: { p: [0.1, 0.24, 0.2], sp: 'chest' }, rf: { p: [-0.12, 0, -0.1], yaw: -10, pitch: 30, toe: 25 }, lf: { p: [0.12, 0, 0.28] } }),
      k(0.32, FIGHT, { e: 'out', root: [0, 0.14, 0], hipsR: [4, -10, 0], torso: [7, 2, 0], rh: { p: [-0.04, 0.2, 0.26], sp: 'chest', aim: null, pole: [-0.4, -1, -0.25] }, rf: { p: [-0.13, 0, -0.08], yaw: -35, pitch: 0, toe: 0 }, lf: { p: [0.12, 0, 0.28] } }),
      k(0.48, FIGHT, { root: [0, 0.14, 0], lf: { p: [0.12, 0, 0.28] }, rf: { p: [-0.13, 0, -0.04] } }),
    ],
    events: [{ t: 0.08, type: 'sfx', name: 'whoosh_light' }, { t: 0.18, type: 'hit', limb: 'rh', dir: 'left' }],
  });

  // ------------------------------------------------------------------ REAR UPPERCUT
  defineClipPair('uppercut', {
    warp: [0, 0.18], hitT: 0.19, comboT: 0.27, recoverT: 0.42,
    keys: [
      k(0, FIGHT),
      k(0.09, FIGHT, { e: 'in', root: [0, 0.06, 0], hips: [-0.02, -0.17, 0], hipsR: [8, -34, 0], torso: [16, -6, 10], head: [0, 14, 4], rh: { p: [-0.13, -0.08, 0.18], sp: 'chest', roll: -40, pole: [-0.3, -1, -0.4] } }),
      k(0.19, FIGHT, { e: 'snap', root: [0, 0.12, 0], hips: [0.02, -0.03, 0.05], hipsR: [2, 12, 0], torso: [-4, 16, -6], head: [-12, -4, 0], rh: { p: [0, 1.55, 0.6], aim: 'jaw', aimOff: [0, -0.04, -0.04], roll: -80, pole: [-0.2, -1, 0.3], dir: [0, 1, 0.4], dirW: 0.5 }, rf: { p: [-0.12, 0, -0.12], yaw: -15, pitch: 26, toe: 20 }, lf: { p: [0.1, 0, 0.26] } }),
      k(0.33, FIGHT, { e: 'out', root: [0, 0.12, 0], hipsR: [4, -10, 0], torso: [4, 6, 0], rh: { p: [-0.06, 0.24, 0.26], sp: 'chest', aim: null, roll: 20, dir: null }, lf: { p: [0.1, 0, 0.26] }, rf: { p: [-0.13, 0, -0.1], yaw: -35, pitch: 0, toe: 0 } }),
      k(0.5, FIGHT, { root: [0, 0.12, 0], lf: { p: [0.1, 0, 0.26] }, rf: { p: [-0.13, 0, -0.06] } }),
    ],
    events: [{ t: 0.1, type: 'sfx', name: 'whoosh_light' }, { t: 0.19, type: 'hit', limb: 'rh', dir: 'up' }],
  });

  // ------------------------------------------------------------------ HORIZONTAL ELBOW (rear)
  defineClipPair('elbow', {
    warp: [0, 0.16], hitT: 0.17, comboT: 0.25, recoverT: 0.4,
    keys: [
      k(0, FIGHT),
      k(0.08, FIGHT, { e: 'in', root: [0, 0.06, 0], hipsR: [4, -38, 0], torso: [6, -16, 0], rh: { p: [-0.26, 0.14, 0.1], sp: 'chest', pole: [-0.3, 0.3, -1], roll: 60 } }),
      k(0.17, FIGHT, { e: 'snap', root: [0, 0.16, 0], hips: [0.02, -0.1, 0.05], hipsR: [6, 24, 0], torso: [10, 32, -8], head: [-4, -16, 0], rh: { p: [0.17, 0.16, 0.17], sp: 'chest', pole: [-0.3, 0.45, 1], roll: 90 }, lh: { p: [0.17, 0.22, 0.22], sp: 'chest' }, rf: { p: [-0.11, 0, -0.08], yaw: -10, pitch: 28, toe: 20 }, lf: { p: [0.1, 0, 0.28] } }),
      k(0.31, FIGHT, { e: 'out', root: [0, 0.16, 0], hipsR: [4, -6, 0], torso: [6, 6, 0], rh: { p: [-0.05, 0.2, 0.26], sp: 'chest', pole: [-0.4, -1, -0.25], roll: 15 }, rf: { p: [-0.13, 0, -0.08], yaw: -32, pitch: 0, toe: 0 }, lf: { p: [0.1, 0, 0.28] } }),
      k(0.48, FIGHT, { root: [0, 0.16, 0], lf: { p: [0.1, 0, 0.28] }, rf: { p: [-0.13, 0, -0.04] } }),
    ],
    events: [{ t: 0.07, type: 'sfx', name: 'whoosh_light' }, { t: 0.17, type: 'hit', limb: 're', dir: 'left' }],
  });

  // ------------------------------------------------------------------ CLINCH KNEE (rear)
  defineClipPair('knee', {
    warp: [0, 0.12], hitT: 0.24, comboT: 0.32, recoverT: 0.5,
    keys: [
      k(0, FIGHT),
      k(0.12, FIGHT, { e: 'in', root: [0, 0.12, 0], hips: [0, -0.06, 0.02], torso: [14, 0, 0], head: [6, 8, 0], lh: { aim: 'neck', aimOff: [0.07, 0.02, -0.04], roll: 70, pole: [0.8, -0.3, -0.3] }, rh: { aim: 'neck', aimOff: [-0.07, 0.02, -0.04], roll: 70, pole: [-0.8, -0.3, -0.3] }, lf: { p: [0.09, 0, 0.26] } }),
      k(0.24, FIGHT, { e: 'snap', root: [0, 0.18, 0], hips: [0, -0.02, 0.1], hipsR: [-10, -6, 0], torso: [20, -4, 0], head: [-6, 8, 0], lh: { aim: 'neck', aimOff: [0.06, -0.06, -0.06] }, rh: { aim: 'neck', aimOff: [-0.06, -0.06, -0.06] }, rf: { p: [-0.06, 0.38, 0.16], pitch: 55, pole: [0, 0.3, 1], lift: 0.1 }, lf: { p: [0.09, 0, 0.26], pitch: 18 } }),
      k(0.38, FIGHT, { e: 'out', root: [0, 0.18, 0], torso: [10, 0, 0], lh: { aim: null, p: [0.17, 0.17, 0.33], sp: 'chest' }, rh: { aim: null, p: [-0.03, 0.19, 0.25], sp: 'chest' }, rf: { p: [-0.12, 0.12, 0.0], pitch: 10 }, lf: { p: [0.09, 0, 0.26], pitch: 0 } }),
      k(0.52, FIGHT, { e: 'in', root: [0, 0.18, 0], rf: { p: [-0.13, 0, -0.05], pitch: 0, yaw: -38 }, lf: { p: [0.09, 0, 0.26] } }),
    ],
    events: [{ t: 0.14, type: 'sfx', name: 'whoosh_light' }, { t: 0.24, type: 'hit', limb: 'rk', dir: 'up' }],
  });

  // ------------------------------------------------------------------ FRONT (PUSH) KICK lead leg
  defineClipPair('frontkick', {
    warp: [0, 0.18], hitT: 0.21, comboT: 0.3, recoverT: 0.5,
    keys: [
      k(0, FIGHT),
      k(0.1, FIGHT, { e: 'in', root: [0, 0.02, 0], hips: [0, -0.05, -0.03], hipsR: [-4, -18, 0], torso: [-6, 0, 0], lf: { p: [0.1, 0.42, 0.26], pitch: -10, toe: 10, pole: [0, 0.3, 1] }, rf: { yaw: -42 } }),
      k(0.21, FIGHT, { e: 'snap', root: [0, 0.06, 0], hips: [0, -0.02, 0.04], hipsR: [-12, -14, 0], torso: [-14, 4, 0], head: [10, 10, 0], lf: { p: [0.08, 0.95, 0.75], aim: 'gut', aimW: 1, aimOff: [0, -0.04, -0.17], pitch: -28, toe: 40, pole: [0, 0.2, 1] }, rf: { yaw: -40 }, lh: { p: [0.2, 0.2, 0.25], sp: 'chest' } }),
      k(0.33, FIGHT, { e: 'out', root: [0, 0.06, 0], torso: [-4, 0, 0], lf: { p: [0.1, 0.36, 0.32], aim: null, aimW: 0, pitch: -5, toe: 0 } }),
      k(0.45, FIGHT, { e: 'in', root: [0, 0.12, 0], lf: { p: [0.1, 0, 0.32], pitch: 0, toe: 0 } }),
      k(0.56, FIGHT, { root: [0, 0.12, 0], lf: { p: [0.1, 0, 0.32] }, rf: { p: [-0.13, 0, -0.08], yaw: -38 } }),
    ],
    events: [{ t: 0.12, type: 'sfx', name: 'whoosh_heavy' }, { t: 0.21, type: 'hit', limb: 'lf', dir: 'back' }],
  });

  // ------------------------------------------------------------------ ROUNDHOUSE (rear leg, head)
  defineClipPair('roundhouse', {
    warp: [0, 0.2], hitT: 0.23, comboT: 0.36, recoverT: 0.56,
    keys: [
      k(0, FIGHT),
      k(0.1, FIGHT, { e: 'in', root: [0, 0.05, 0], hips: [0, -0.09, 0], hipsR: [2, -6, 0], torso: [4, 12, 0], lf: { p: [0.1, 0, 0.22], yaw: 25, pitch: 10 }, rf: { p: [-0.22, 0.34, -0.06], pitch: 30, pole: [-0.7, 0.5, 0.5] }, rh: { p: [-0.25, 0.0, 0.15], sp: 'chest' } }),
      k(0.23, FIGHT, { e: 'snap', root: [0, 0.1, 0], hips: [0.02, -0.05, 0.0], hipsR: [-2, 72, -24], torso: [-6, -26, 20], neck: [0, -10, -6], head: [-6, -30, -10], lf: { p: [0.1, 0, 0.22], yaw: 112, pitch: 22 }, rf: { p: [0.25, 1.45, 0.8], aim: 'head', aimW: 1, aimOff: [0.16, -0.05, -0.06], pitch: 48, pole: [-0.2, 1, 0.1] }, lh: { p: [0.25, 0.18, 0.26], sp: 'chest' }, rh: { p: [-0.36, -0.2, -0.1], sp: 'chest', roll: -20 } }),
      k(0.35, FIGHT, { e: 'out', root: [0, 0.1, 0], hipsR: [0, 52, -12], torso: [0, -15, 10], rf: { p: [0.05, 0.6, 0.36], aim: null, aimW: 0, pitch: 30, pole: [0, 0.6, 1] }, lf: { p: [0.1, 0, 0.22], yaw: 82, pitch: 10 }, rh: { p: [-0.2, 0.1, 0.2], sp: 'chest' } }),
      k(0.48, FIGHT, { e: 'in', root: [0, 0.12, 0], hipsR: [4, -12, 0], torso: [3, 0, 0], rf: { p: [-0.12, 0, -0.12], pitch: 0, yaw: -30 }, lf: { p: [0.1, 0, 0.22], yaw: 15, pitch: 0 } }),
      k(0.62, FIGHT, { root: [0, 0.12, 0], lf: { p: [0.1, 0, 0.22], yaw: -4 }, rf: { p: [-0.13, 0, -0.12], yaw: -38 } }),
    ],
    events: [{ t: 0.12, type: 'sfx', name: 'whoosh_heavy' }, { t: 0.23, type: 'hit', limb: 'rf', dir: 'left' }],
  });

  // ------------------------------------------------------------------ SIDE KICK (lead leg, body)
  defineClipPair('sidekick', {
    warp: [0, 0.2], hitT: 0.22, comboT: 0.34, recoverT: 0.52,
    keys: [
      k(0, FIGHT),
      k(0.11, FIGHT, { e: 'in', root: [0, 0.04, 0], hips: [0, -0.06, -0.02], hipsR: [0, -70, 10], torso: [0, 20, -6], head: [0, 50, 0], lf: { p: [0.0, 0.5, 0.18], pitch: 20, toe: 0, pole: [0.4, 0.4, 1], yaw: -80 }, rf: { yaw: -120, pitch: 10 } }),
      k(0.22, FIGHT, { e: 'snap', root: [0, 0.08, 0], hips: [-0.05, -0.04, -0.05], hipsR: [0, -88, 26], torso: [2, 18, -14], head: [-4, 60, 10], lf: { p: [0.02, 1.15, 0.85], aim: 'chest', aimW: 1, aimOff: [0, -0.06, -0.14], pitch: 0, toe: -10, pole: [0.2, 0.8, 0.3], yaw: -90 }, rf: { yaw: -128, pitch: 15 }, lh: { p: [0.22, 0.12, 0.2], sp: 'chest' }, rh: { p: [-0.1, 0.22, 0.2], sp: 'chest' } }),
      k(0.34, FIGHT, { e: 'out', root: [0, 0.08, 0], hipsR: [0, -60, 8], torso: [2, 12, 0], lf: { p: [0.05, 0.45, 0.25], aim: null, aimW: 0, pitch: 10, yaw: -60 }, rf: { yaw: -100, pitch: 0 } }),
      k(0.46, FIGHT, { e: 'in', root: [0, 0.12, 0], hipsR: [4, -26, 0], torso: [3, 4, 0], lf: { p: [0.1, 0, 0.28], yaw: -4, pitch: 0 }, rf: { yaw: -45 } }),
      k(0.6, FIGHT, { root: [0, 0.12, 0], lf: { p: [0.1, 0, 0.28] }, rf: { p: [-0.13, 0, -0.08], yaw: -38 } }),
    ],
    events: [{ t: 0.12, type: 'sfx', name: 'whoosh_heavy' }, { t: 0.22, type: 'hit', limb: 'lf', dir: 'back' }],
  });

  // ------------------------------------------------------------------ SPINNING BACK KICK
  defineClipPair('spinkick', {
    warp: [0, 0.22], hitT: 0.26, comboT: 0.4, recoverT: 0.6,
    keys: [
      k(0, FIGHT),
      k(0.1, FIGHT, { e: 'in', root: [0, 0.06, -95], hips: [0, -0.08, 0], hipsR: [8, -20, 0], torso: [10, -15, 0], head: [-4, 75, 0], lf: { p: [0.06, 0, 0.18], yaw: -100, pitch: 15 }, rf: { p: [-0.1, 0.18, -0.1], pitch: 15 }, lh: { p: [0.2, 0.15, 0.25], sp: 'chest' }, rh: { p: [-0.1, 0.2, 0.25], sp: 'chest' } }),
      k(0.26, FIGHT, { e: 'snap', root: [0, 0.1, -178], hips: [0, -0.1, 0.04], hipsR: [32, -8, 0], torso: [24, -8, 0], neck: [-14, -30, 0], head: [-20, -40, 0], lf: { p: [0.06, 0, 0.18], yaw: -175, pitch: 18 }, rf: { p: [0.0, 1.0, 0.9], aim: 'gut', aimW: 1, aimOff: [0, 0, 0.16], pitch: -20, toe: 30, pole: [0, -1, 0.4] }, lh: { p: [0.22, -0.05, 0.3], sp: 'chest' }, rh: { p: [-0.22, -0.05, 0.3], sp: 'chest' } }),
      k(0.4, FIGHT, { e: 'out', root: [0, 0.1, -200], hipsR: [16, -12, 0], torso: [12, -6, 0], head: [-8, -30, 0], rf: { p: [0.0, 0.35, 0.45], aim: null, aimW: 0, pitch: 0, toe: 0, pole: [0, 0.3, -1] }, lf: { yaw: -190, pitch: 0 } }),
      k(0.56, FIGHT, { e: 'inout', root: [0, 0.18, -350], hipsR: [4, -24, 0], torso: [3, 4, 0], head: [-4, 12, 0], rf: { p: [-0.12, 0, -0.04], yaw: -380, pitch: 0, lift: 0.05 }, lf: { p: [0.1, 0, 0.3], yaw: -360 } }),
      k(0.66, FIGHT, { root: [0, 0.18, -360], rf: { p: [-0.13, 0, -0.02], yaw: -398 }, lf: { p: [0.1, 0, 0.32], yaw: -364 } }),
    ],
    events: [{ t: 0.14, type: 'sfx', name: 'whoosh_heavy' }, { t: 0.26, type: 'hit', limb: 'rf', dir: 'back' }],
  });

  // ------------------------------------------------------------------ FLYING KNEE (gap closer)
  defineClipPair('flyknee', {
    warp: [0, 0.3], hitT: 0.32, comboT: 0.44, recoverT: 0.62,
    keys: [
      k(0, FIGHT),
      k(0.08, FIGHT, { e: 'in', root: [0, 0.25, 0], hips: [0, -0.16, 0.04], hipsR: [12, -10, 0], torso: [18, 0, 0], lf: { p: [0.1, 0, 0.3] }, rf: { p: [-0.1, 0, 0.0], pitch: 30 } }),
      k(0.2, FIGHT, { e: 'out', root: [0, 0.75, 0], hips: [0, 0.32, 0.08], hipsR: [-4, -8, 0], torso: [8, 0, 0], lf: { p: [0.1, 0.45, 0.6], pitch: 30, pole: [0, 0.4, 1] }, rf: { p: [-0.08, 0.6, 0.55], pitch: 50, pole: [0, 0.5, 1] }, lh: { p: [0.25, 0.3, 0.2], sp: 'chest' }, rh: { p: [-0.25, 0.3, 0.2], sp: 'chest' } }),
      k(0.32, FIGHT, { e: 'snap', root: [0, 1.0, 0], hips: [0, 0.38, 0.12], hipsR: [-14, -4, 0], torso: [16, 0, 0], head: [-10, 4, 0], lf: { p: [0.1, 0.35, 0.85], pitch: 50, pole: [0, 0.2, 1] }, rf: { p: [-0.06, 0.95, 1.1], pitch: 60, pole: [0, 0.6, 1] }, lh: { aim: 'neck', aimOff: [0.08, 0.1, -0.06], roll: 70 }, rh: { aim: 'neck', aimOff: [-0.08, 0.1, -0.06], roll: 70 } }),
      k(0.46, FIGHT, { e: 'in', root: [0, 1.15, 0], hips: [0, 0.0, 0.05], torso: [10, 0, 0], lh: { aim: null, p: [0.2, 0.2, 0.3], sp: 'chest' }, rh: { aim: null, p: [-0.05, 0.2, 0.25], sp: 'chest' }, lf: { p: [0.1, 0, 1.3], pitch: 0 }, rf: { p: [-0.12, 0, 1.0], pitch: 0, yaw: -30 } }),
      k(0.64, FIGHT, { root: [0, 1.15, 0], lf: { p: [0.1, 0, 1.32] }, rf: { p: [-0.13, 0, 0.98], yaw: -38 } }),
    ],
    events: [{ t: 0.1, type: 'sfx', name: 'whoosh_heavy' }, { t: 0.32, type: 'hit', limb: 'rk', dir: 'up' }],
  });

  // ------------------------------------------------------------------ BACK ELBOW (target behind)
  defineClipPair('backelbow', {
    warp: [0, 0.14], hitT: 0.16, comboT: 0.24, recoverT: 0.42,
    keys: [
      k(0, FIGHT),
      k(0.08, FIGHT, { e: 'in', root: [0, -0.03, 0], hipsR: [2, -40, 0], torso: [4, -30, 0], head: [0, -60, 0], rh: { p: [-0.12, 0.12, 0.35], sp: 'chest', pole: [-0.4, 0.2, -1] } }),
      k(0.16, FIGHT, { e: 'snap', root: [0, -0.12, 0], hips: [0, -0.1, -0.06], hipsR: [-4, -55, 0], torso: [-6, -40, 0], neck: [0, -30, 0], head: [-4, -50, 0], rh: { p: [-0.12, 0.1, 0.32], sp: 'chest', pole: [0, 0.3, -1], roll: 90 }, rf: { p: [-0.13, 0, -0.32], yaw: -60 }, lf: { yaw: -30 } }),
      k(0.3, FIGHT, { e: 'out', root: [0, -0.12, 0], hipsR: [4, -30, 0], torso: [4, -8, 0], head: [-4, -10, 0], rh: { p: [-0.03, 0.19, 0.25], sp: 'chest', pole: [-0.4, -1, -0.25] }, rf: { p: [-0.13, 0, -0.3] } }),
      k(0.48, FIGHT, { root: [0, -0.1, 0], rf: { p: [-0.13, 0, -0.28] }, lf: { p: [0.1, 0, 0.05] } }),
    ],
    events: [{ t: 0.06, type: 'sfx', name: 'whoosh_light' }, { t: 0.16, type: 'hit', limb: 're', dir: 'back' }],
  });

  // ------------------------------------------------------------------ BACK KICK (target behind, donkey)
  defineClipPair('backkick', {
    warp: [0, 0.16], hitT: 0.2, comboT: 0.3, recoverT: 0.5,
    keys: [
      k(0, FIGHT),
      k(0.1, FIGHT, { e: 'in', root: [0, 0.04, 0], hips: [0, -0.08, 0], torso: [20, 0, 0], head: [-10, -60, 0], rf: { p: [-0.1, 0.3, -0.05], pitch: 20, pole: [0, 0.2, 1] } }),
      k(0.2, FIGHT, { e: 'snap', root: [0, 0.08, 0], hips: [0, -0.06, 0.05], hipsR: [28, -10, 0], torso: [30, -4, 0], neck: [-20, -20, 0], head: [-26, -40, 0], rf: { p: [-0.08, 0.9, -0.85], aim: 'gut', aimW: 1, aimOff: [0, 0, 0.16], pitch: -15, toe: 30, pole: [0, -1, -0.3] }, lf: { pitch: 10 } }),
      k(0.34, FIGHT, { e: 'out', root: [0, 0.08, 0], hipsR: [12, -16, 0], torso: [12, 0, 0], head: [-6, -10, 0], rf: { p: [-0.1, 0.3, -0.2], aim: null, aimW: 0, pitch: 0, toe: 0, pole: [0, 0.3, 1] } }),
      k(0.5, FIGHT, { root: [0, 0.08, 0], rf: { p: [-0.13, 0, -0.14] } }),
    ],
    events: [{ t: 0.1, type: 'sfx', name: 'whoosh_heavy' }, { t: 0.2, type: 'hit', limb: 'rf', dir: 'back' }],
  });

  // ------------------------------------------------------------------ STUN: double palm strike to chest
  defineClip('stun_palm', {
    warp: [0, 0.14], hitT: 0.16, comboT: 0.28, recoverT: 0.4,
    keys: [
      k(0, FIGHT),
      k(0.08, FIGHT, { e: 'in', root: [0, 0.04, 0], hips: [0, -0.1, -0.02], hipsR: [4, -8, 0], torso: [2, 0, 0], lh: { p: [0.16, 0.05, 0.12], sp: 'chest', roll: -10 }, rh: { p: [-0.16, 0.05, 0.12], sp: 'chest', roll: -10 } }),
      k(0.16, FIGHT, { e: 'snap', root: [0, 0.18, 0], hips: [0, -0.12, 0.08], hipsR: [8, -4, 0], torso: [10, 0, 0], lh: { p: [0.1, 1.3, 0.75], aim: 'chest', aimOff: [0.1, 0, -0.08], roll: -90, dir: [0, 1, 0.3], dirW: 0.7, pole: [0.5, -1, 0] }, rh: { p: [-0.1, 1.3, 0.75], aim: 'chest', aimOff: [-0.1, 0, -0.08], roll: -90, dir: [0, 1, 0.3], dirW: 0.7, pole: [-0.5, -1, 0] }, lf: { p: [0.1, 0, 0.32] }, rf: { p: [-0.13, 0, -0.08], pitch: 20 } }),
      k(0.3, FIGHT, { e: 'out', root: [0, 0.18, 0], lh: { aim: null, dir: null, p: [0.17, 0.17, 0.33], sp: 'chest' }, rh: { aim: null, dir: null, p: [-0.03, 0.19, 0.25], sp: 'chest' }, lf: { p: [0.1, 0, 0.32] }, rf: { p: [-0.13, 0, -0.06], pitch: 0 } }),
      k(0.42, FIGHT, { root: [0, 0.18, 0], lf: { p: [0.1, 0, 0.32] }, rf: { p: [-0.13, 0, -0.04] } }),
    ],
    events: [{ t: 0.06, type: 'sfx', name: 'whoosh_light' }, { t: 0.16, type: 'hit', limb: 'rh', dir: 'back' }],
  });
}
