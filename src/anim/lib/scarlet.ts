import { defineClipPair, Key, KeyFoot, KeyHand } from '../clip';
import { definePaired } from './paired';
import { BRAWL, FIGHT, k } from './stances';

/**
 * Scarlet's kickboxing: a whipping backfist, a palm heel under the chin, a snapping lead-leg kick,
 * an axe kick dropped from above the head, a spinning hook kick, a flying side kick - and two
 * finishers of her own. Same conventions as the strike library (clip space +Z towards the target,
 * +X her left; feet in clip space, hands in root space unless sp:'chest').
 */
export function registerScarletMoves() {
  // ------------------------------------------------------------------ BACKFIST (lead hand, fastest)
  defineClipPair('s_backfist', {
    warp: [0, 0.09], hitT: 0.1, comboT: 0.16, recoverT: 0.3,
    keys: [
      k(0, FIGHT),
      k(0.05, FIGHT, { e: 'in', root: [0, 0.05, 0], hipsR: [4, -8, 0], torso: [6, 14, -2], head: [-4, 14, 0], lh: { p: [0.03, 0.3, 0.16], sp: 'chest', roll: 100, pole: [0.9, 0.5, -0.1] }, lf: { p: [0.1, 0, 0.22], yaw: -6 } }),
      k(0.1, FIGHT, { e: 'snap', root: [0, 0.13, 0], hips: [0.02, -0.08, 0.05], hipsR: [4, -46, 0], torso: [7, -24, 4], head: [-6, 30, 0], lh: { p: [0.05, 1.55, 0.85], aim: 'head', aimOff: [0.08, 0.02, -0.04], roll: 170, pole: [1, 0.5, -0.2] }, rh: { p: [-0.03, 0.22, 0.24], sp: 'chest' }, lf: { p: [0.1, 0, 0.3], yaw: -10 }, rf: { yaw: -45 }, shrug: [10, 0] }),
      k(0.19, FIGHT, { e: 'out', root: [0, 0.13, 0], hipsR: [4, -28, 0], torso: [6, -6, 0], lh: { p: [0.16, 0.2, 0.34], sp: 'chest', aim: null, roll: 30 }, lf: { p: [0.1, 0, 0.3] }, shrug: [0, 0] }),
      k(0.34, FIGHT, { e: 'inout', root: [0, 0.15, 0], lf: { p: [0.1, 0, 0.3] }, rf: { p: [-0.13, 0, -0.04], yaw: -38, lift: 0.04 } }),
    ],
    events: [{ t: 0.02, type: 'sfx', name: 'whoosh_light' }, { t: 0.1, type: 'hit', limb: 'lh', dir: 'right' }],
  });

  // ------------------------------------------------------------------ PALM HEEL (rear hand, under the chin)
  defineClipPair('s_palm', {
    warp: [0, 0.13], hitT: 0.15, comboT: 0.22, recoverT: 0.36,
    keys: [
      k(0, FIGHT),
      k(0.07, FIGHT, { e: 'in', root: [0, 0.04, 0], hips: [0, -0.13, 0], hipsR: [6, -32, 0], torso: [12, -12, 6], rh: { p: [-0.14, 0.0, 0.14], sp: 'chest', roll: -40, pole: [-0.3, -1, -0.4] } }),
      k(0.15, FIGHT, { e: 'snap', root: [0, 0.15, 0], hips: [0.02, -0.05, 0.07], hipsR: [4, 18, 0], torso: [2, 20, -6], head: [-10, -8, 0], rh: { p: [0, 1.5, 0.75], aim: 'jaw', aimOff: [0, -0.02, -0.07], roll: -95, pole: [-0.4, -1, 0], dir: [0, 1, 0.6], dirW: 0.7 }, lh: { p: [0.14, 0.24, 0.24], sp: 'chest' }, rf: { p: [-0.12, 0, -0.12], yaw: -12, pitch: 30, toe: 26 }, lf: { p: [0.1, 0, 0.28] }, shrug: [0, 8] }),
      k(0.26, FIGHT, { e: 'out', root: [0, 0.15, 0], hipsR: [4, -6, 0], torso: [5, 4, 0], rh: { p: [-0.05, 0.22, 0.28], sp: 'chest', aim: null, dir: null, roll: 15 }, lf: { p: [0.1, 0, 0.28] }, rf: { p: [-0.13, 0, -0.1], yaw: -32, pitch: 0, toe: 0 }, shrug: [0, 0] }),
      k(0.42, FIGHT, { e: 'inout', root: [0, 0.15, 0], lf: { p: [0.1, 0, 0.28] }, rf: { p: [-0.13, 0, -0.05], yaw: -38 } }),
    ],
    events: [{ t: 0.05, type: 'sfx', name: 'whoosh_light' }, { t: 0.15, type: 'hit', limb: 'rh', dir: 'up' }],
  });

  // ------------------------------------------------------------------ SNAP KICK (lead leg, to the body)
  defineClipPair('s_snapkick', {
    warp: [0, 0.14], hitT: 0.16, comboT: 0.24, recoverT: 0.42,
    keys: [
      k(0, FIGHT),
      k(0.07, FIGHT, { e: 'in', root: [0, 0.03, 0], hips: [0, -0.04, -0.03], hipsR: [-4, -16, 0], torso: [-6, 2, 0], lf: { p: [0.1, 0.5, 0.32], pitch: -20, toe: 15, pole: [0, 0.3, 1] }, rf: { yaw: -40, pitch: 8 } }),
      k(0.16, FIGHT, { e: 'snap', root: [0, 0.06, 0], hips: [0, -0.02, 0.03], hipsR: [-12, -16, 0], torso: [-14, 4, 0], head: [10, 10, 0], lf: { p: [0.06, 1.1, 0.82], aim: 'gut', aimW: 1, aimOff: [0, 0.06, -0.14], pitch: -45, toe: 35, pole: [0, 0.3, 1] }, rf: { yaw: -42, pitch: 14 }, lh: { p: [0.22, 0.14, 0.24], sp: 'chest' }, rh: { p: [-0.05, 0.24, 0.26], sp: 'chest' } }),
      k(0.25, FIGHT, { e: 'out', root: [0, 0.06, 0], torso: [-4, 0, 0], lf: { p: [0.1, 0.48, 0.36], aim: null, aimW: 0, pitch: -10, toe: 0 } }),
      k(0.35, FIGHT, { e: 'in', root: [0, 0.1, 0], lf: { p: [0.1, 0, 0.3], pitch: 0, toe: 0 }, rf: { pitch: 0 } }),
      k(0.46, FIGHT, { root: [0, 0.1, 0], lf: { p: [0.1, 0, 0.3] }, rf: { p: [-0.13, 0, -0.08], yaw: -38 } }),
    ],
    events: [{ t: 0.06, type: 'sfx', name: 'whoosh_light' }, { t: 0.16, type: 'hit', limb: 'lf', dir: 'up' }],
  });

  // ------------------------------------------------------------------ AXE KICK (rear leg up past the head, heel dropped)
  defineClipPair('s_axekick', {
    warp: [0, 0.26], hitT: 0.34, comboT: 0.46, recoverT: 0.62,
    keys: [
      k(0, FIGHT),
      k(0.1, FIGHT, { e: 'in', root: [0, 0.06, 0], hips: [0, -0.05, 0.02], hipsR: [0, -6, 0], torso: [2, 4, 0], lf: { p: [0.1, 0, 0.22], yaw: 10, pitch: 6 }, rf: { p: [-0.1, 0.38, 0.2], pitch: 15, pole: [0, 0.5, 1] }, lh: { p: [0.25, 0.1, 0.25], sp: 'chest' }, rh: { p: [-0.25, 0.05, 0.2], sp: 'chest' } }),
      k(0.17, FIGHT, { e: 'linear', root: [0, 0.09, 0], hips: [0.01, -0.02, -0.01], hipsR: [-6, 4, 0], torso: [-8, 5, 0], head: [8, 4, 0], lf: { p: [0.1, 0, 0.22], yaw: 18, pitch: 8 }, rf: { p: [-0.05, 1.0, 0.8], pitch: 20, toe: 25, pole: [0, 1, 0.1] }, lh: { p: [0.3, 0.05, 0.2], sp: 'chest' }, rh: { p: [-0.3, 0.0, 0.15], sp: 'chest' } }),
      k(0.24, FIGHT, { e: 'out', root: [0, 0.12, 0], hips: [0.02, 0.0, -0.03], hipsR: [-14, 10, 0], torso: [-18, 6, 0], head: [16, 4, 0], lf: { p: [0.1, 0, 0.22], yaw: 25, pitch: 10 }, rf: { p: [-0.02, 2.0, 0.62], pitch: 30, toe: 30, pole: [0, 1, -0.3] }, lh: { p: [0.34, 0.0, 0.15], sp: 'chest' }, rh: { p: [-0.34, -0.05, 0.1], sp: 'chest' } }),
      k(0.34, FIGHT, { e: 'expoIn', root: [0, 0.16, 0], hips: [0.02, -0.08, 0.05], hipsR: [12, 4, 0], torso: [16, 2, 0], head: [-14, 2, 0], rf: { p: [0, 1.4, 0.82], aim: 'head', aimW: 1, aimOff: [0, 0.1, -0.08], pitch: -15, toe: 0, pole: [0, 1, 0.3] }, lh: { p: [0.24, 0.18, 0.24], sp: 'chest' }, rh: { p: [-0.12, 0.22, 0.24], sp: 'chest' } }),
      k(0.46, FIGHT, { e: 'out', root: [0, 0.16, 0], hipsR: [6, -10, 0], torso: [6, 0, 0], head: [-4, 10, 0], rf: { p: [-0.06, 0.3, 0.45], aim: null, aimW: 0, pitch: 0, pole: [0, 0.3, 1] } }),
      k(0.6, FIGHT, { e: 'in', root: [0, 0.16, 0], rf: { p: [-0.13, 0, -0.04], yaw: -38, pitch: 0 }, lf: { p: [0.1, 0, 0.32], yaw: -4, pitch: 0 } }),
      k(0.68, FIGHT, { root: [0, 0.16, 0], lf: { p: [0.1, 0, 0.32] }, rf: { p: [-0.13, 0, -0.04] } }),
    ],
    events: [{ t: 0.1, type: 'sfx', name: 'whoosh_heavy' }, { t: 0.34, type: 'hit', limb: 'rf', dir: 'down' }],
  });

  // ------------------------------------------------------------------ SPINNING HOOK KICK (the heel swept across the head)
  defineClipPair('s_spinhook', {
    warp: [0, 0.26], hitT: 0.31, comboT: 0.46, recoverT: 0.66,
    keys: [
      k(0, FIGHT),
      k(0.1, FIGHT, { e: 'in', root: [0, 0.05, -90], hips: [0, -0.08, 0], hipsR: [6, -20, 0], torso: [8, -18, 0], head: [-4, 80, 0], lf: { p: [0.06, 0, 0.18], yaw: -95, pitch: 15 }, rf: { p: [-0.1, 0.16, -0.08], pitch: 15 }, lh: { p: [0.22, 0.12, 0.24], sp: 'chest' }, rh: { p: [-0.12, 0.2, 0.24], sp: 'chest' } }),
      k(0.22, FIGHT, { e: 'linear', root: [0, 0.08, -170], hips: [0, -0.04, 0], hipsR: [-6, -20, 16], torso: [-4, -10, 12], neck: [-6, -30, 0], head: [-10, -40, 0], lf: { p: [0.06, 0, 0.18], yaw: -170, pitch: 20 }, rf: { p: [0.55, 1.25, 0.35], pitch: 0, toe: -10, pole: [0, 0.3, -1] } }),
      k(0.31, FIGHT, { e: 'snap', root: [0, 0.1, -235], hips: [0.0, -0.03, 0.0], hipsR: [-8, -10, 20], torso: [-6, -12, 14], neck: [-6, -36, -4], head: [-10, -44, -6], lf: { p: [0.06, 0, 0.18], yaw: -235, pitch: 22 }, rf: { p: [-0.25, 1.6, 0.85], aim: 'head', aimW: 1, aimOff: [-0.16, -0.02, -0.02], pitch: -5, toe: -20, pole: [0, 0.4, -1] }, lh: { p: [0.3, -0.1, 0.2], sp: 'chest' }, rh: { p: [-0.3, -0.1, 0.25], sp: 'chest' } }),
      k(0.44, FIGHT, { e: 'out', root: [0, 0.12, -290], hipsR: [0, -20, 10], torso: [4, -10, 8], head: [-6, -10, 0], rf: { p: [-0.2, 0.45, 0.2], aim: null, aimW: 0, pitch: 0, toe: 0, pole: [0, 0.3, 1] }, lf: { yaw: -280, pitch: 0 } }),
      k(0.6, FIGHT, { e: 'inout', root: [0, 0.16, -350], hipsR: [4, -24, 0], torso: [3, 4, 0], head: [-4, 12, 0], rf: { p: [-0.12, 0, -0.04], yaw: -385, pitch: 0, lift: 0.05 }, lf: { p: [0.1, 0, 0.3], yaw: -360 } }),
      k(0.7, FIGHT, { root: [0, 0.16, -360], rf: { p: [-0.13, 0, -0.02], yaw: -398 }, lf: { p: [0.1, 0, 0.32], yaw: -364 } }),
    ],
    events: [{ t: 0.12, type: 'sfx', name: 'whoosh_heavy' }, { t: 0.31, type: 'hit', limb: 'rf', dir: 'right' }],
  });

  // ------------------------------------------------------------------ FLYING SIDE KICK (gap closer)
  defineClipPair('s_flykick', {
    warp: [0, 0.3], hitT: 0.33, comboT: 0.46, recoverT: 0.66,
    keys: [
      k(0, FIGHT),
      k(0.08, FIGHT, { e: 'in', root: [0, 0.25, 0], hips: [0, -0.16, 0.04], hipsR: [10, -20, 0], torso: [14, 0, 0], lf: { p: [0.1, 0, 0.3] }, rf: { p: [-0.1, 0, 0.02], pitch: 30 } }),
      k(0.2, FIGHT, { e: 'out', root: [0, 0.75, -50], hips: [0, 0.3, 0.0], hipsR: [-4, -30, 6], torso: [4, 10, 0], head: [0, 40, 0], lf: { p: [0.12, 0.7, 0.85], pitch: 10, pole: [0.5, 0.5, 1], yaw: -60 }, rf: { p: [-0.08, 0.55, 0.65], pitch: 40, pole: [0, 0.5, 1] }, lh: { p: [0.25, 0.25, 0.2], sp: 'chest' }, rh: { p: [-0.2, 0.25, 0.22], sp: 'chest' } }),
      k(0.33, FIGHT, { e: 'snap', root: [0, 1.0, -85], hips: [-0.04, 0.38, -0.04], hipsR: [0, -80, 24], torso: [2, 16, -12], head: [-4, 64, 10], lf: { p: [0.04, 1.3, 1.85], aim: 'chest', aimW: 1, aimOff: [0, -0.04, -0.13], pitch: 0, toe: -10, pole: [0.2, 0.8, 0.3], yaw: -90 }, rf: { p: [-0.1, 0.75, 0.9], pitch: 60, pole: [0, 0.5, 1] }, lh: { p: [0.24, 0.12, 0.2], sp: 'chest' }, rh: { p: [-0.1, 0.25, 0.2], sp: 'chest' } }),
      k(0.48, FIGHT, { e: 'in', root: [0, 1.25, -40], hips: [0, -0.05, 0.02], hipsR: [4, -30, 0], torso: [8, 6, 0], head: [-4, 24, 0], lf: { p: [0.1, 0, 1.45], aim: null, aimW: 0, pitch: 0, toe: 0, yaw: -30 }, rf: { p: [-0.12, 0, 1.12], pitch: 0, yaw: -60 } }),
      k(0.66, FIGHT, { root: [0, 1.28, 0], lf: { p: [0.1, 0, 1.45], yaw: -4 }, rf: { p: [-0.13, 0, 1.11], yaw: -38 } }),
    ],
    events: [{ t: 0.1, type: 'sfx', name: 'whoosh_heavy' }, { t: 0.33, type: 'hit', limb: 'lf', dir: 'back' }],
  });

  // =================================================================== FINISHER: axe kick through a dazed guard
  {
    const D = 1.0;
    definePaired(
      'fin_axe',
      {
        hitT: 0.5, recoverT: 0.92,
        keys: [
          k(0, FIGHT),
          k(0.14, FIGHT, { e: 'in', root: [0, 0.12, 0], hips: [0, -0.12, 0.02], hipsR: [4, -6, 0], torso: [8, 4, 0], lf: { p: [0.1, 0, 0.3], yaw: 10, pitch: 6 }, rf: { p: [-0.1, 0.36, 0.2], pitch: 15, pole: [0, 0.5, 1] }, lh: H({ p: [0.26, 0.1, 0.25], sp: 'chest' }), rh: H({ p: [-0.26, 0.05, 0.2], sp: 'chest' }) }),
          k(0.25, FIGHT, { e: 'linear', root: [0, 0.11, 0], hips: [0.01, -0.02, -0.02], hipsR: [-6, 4, 0], torso: [-8, 5, 0], head: [8, 4, 0], lf: { p: [0.1, 0, 0.3], yaw: 18, pitch: 8 }, rf: { p: [-0.04, 1.05, 0.88], pitch: 20, toe: 25, pole: [0, 1, 0.1] }, lh: H({ p: [0.32, 0.05, 0.18], sp: 'chest' }), rh: H({ p: [-0.32, 0.0, 0.14], sp: 'chest' }) }),
          k(0.36, FIGHT, { e: 'out', root: [0, 0.14, 0], hips: [0.02, 0.04, -0.04], hipsR: [-16, 10, 0], torso: [-20, 6, 0], head: [18, 4, 0], lf: { p: [0.1, 0, 0.3], yaw: 25, pitch: 12 }, rf: { p: [-0.02, 2.1, 0.75], pitch: 30, toe: 30, pole: [0, 1, -0.3] }, lh: H({ p: [0.36, 0.02, 0.12], sp: 'chest' }), rh: H({ p: [-0.36, -0.04, 0.08], sp: 'chest' }) }),
          k(0.5, FIGHT, { e: 'expoIn', root: [0, 0.17, 0], hips: [0.02, -0.12, 0.06], hipsR: [14, 4, 0], torso: [20, 2, 0], head: [-16, 2, 0], rf: { p: [0, 1.25, 0.98], aim: 'p.head', aimW: 1, aimOff: [0, 0.06, -0.02], pitch: -15, toe: 0, pole: [0, 1, 0.3] }, lh: H({ p: [0.24, 0.16, 0.24], sp: 'chest' }), rh: H({ p: [-0.14, 0.2, 0.24], sp: 'chest' }) }),
          k(0.66, FIGHT, { e: 'out', root: [0, 0.18, 0], hips: [0, -0.16, 0.04], torso: [12, 0, 0], rf: { p: [-0.04, 0, 0.72], aim: null, aimW: 0, pitch: 0, yaw: -10 } }),
          k(0.95, FIGHT, { root: [0, 0.18, 0], rf: { p: [-0.13, 0, 0.04], yaw: -38 }, lf: { p: [0.1, 0, 0.34], yaw: -4, pitch: 0 } }),
        ],
        events: [{ t: 0.16, type: 'sfx', name: 'whoosh_heavy' }, { t: 0.28, type: 'sfx', name: 'grunt_attack' }, { t: 0.5, type: 'hit', limb: 'rf', region: 'head', strength: 1.5, damage: 999, bleed: 1.3, kind: 'kick', dir: 'down', finisher: true, boneBreak: true, launch: 1 }],
      },
      { keys: [vk(0, D, BRAWL, { head: [10, 0, 8], torso: [10, 0, 4] }), vk(0.5, D, BRAWL, { root: [0, 0.02, 0], head: [14, -6, 8], torso: [12, 0, 6] })] },
      D,
      { side: 1, height: 1.6, dist: 3.3, fov: 46, orbit: 0.22 },
    );
  }
  // =================================================================== FINISHER: jumping spinning heel kick
  {
    const D = 1.1;
    definePaired(
      'fin_heelspin',
      {
        hitT: 0.42, recoverT: 0.88,
        keys: [
          k(0, FIGHT),
          k(0.14, FIGHT, { e: 'in', root: [0, 0.1, -60], hips: [0, -0.18, 0], hipsR: [10, -20, 0], torso: [14, -20, 0], head: [0, 50, 0], lf: { p: [0.08, 0, 0.25], yaw: -60, pitch: 15 } }),
          k(0.3, FIGHT, { e: 'linear', root: [0, 0.2, -190], hips: [0, 0.22, 0], hipsR: [-6, -20, 14], torso: [-4, -12, 10], head: [-8, -36, 0], lf: { p: [0.08, 0.4, 0.3], pitch: 30, pole: [0, 0.5, 1] }, rf: { p: [0.5, 1.3, 0.4], pitch: 0, toe: -10, pole: [0, 0.3, -1] } }),
          k(0.42, FIGHT, { e: 'snap', root: [0, 0.25, -255], hips: [0, 0.3, 0], hipsR: [-8, -10, 22], torso: [-6, -12, 14], neck: [-6, -36, -4], head: [-10, -44, -6], lf: { p: [0.1, 0.45, 0.3], pitch: 30, pole: [0, 0.5, 1] }, rf: { p: [-0.28, 1.65, 1.0], aim: 'p.head', aimW: 1, aimOff: [-0.16, 0, 0], pitch: -5, toe: -20, pole: [0, 0.4, -1] }, lh: H({ p: [0.3, -0.1, 0.2], sp: 'chest' }), rh: H({ p: [-0.3, -0.1, 0.25], sp: 'chest' }) }),
          k(0.6, FIGHT, { e: 'out', root: [0, 0.28, -330], hips: [0, -0.15, 0], hipsR: [6, -10, 4], torso: [6, -6, 4], lf: { p: [0.12, 0, 0.32], pitch: 0, yaw: -330 }, rf: { p: [-0.12, 0, 0.02], aim: null, aimW: 0, pitch: 0, toe: 0, yaw: -370 } }),
          k(0.9, FIGHT, { root: [0, 0.28, -360], lf: { p: [0.12, 0, 0.32], yaw: -364 }, rf: { p: [-0.13, 0, 0.0], yaw: -398 } }),
        ],
        events: [{ t: 0.15, type: 'sfx', name: 'whoosh_heavy' }, { t: 0.2, type: 'sfx', name: 'grunt_attack' }, { t: 0.42, type: 'hit', limb: 'rf', region: 'head', strength: 1.5, damage: 999, bleed: 1.3, kind: 'kick', dir: 'right', finisher: true, launch: 6 }],
      },
      { keys: [vk(0, D, BRAWL, { head: [6, 0, 6], torso: [8, 0, 4] }), vk(0.42, D, BRAWL, { root: [0, 0.04, 0], head: [10, 10, -8], torso: [10, 0, -6] })] },
      D,
      { side: -1, height: 1.1, dist: 3.4, fov: 46, orbit: -0.25 },
    );
  }
}

const H = (h: KeyHand) => h;
/** Victim key in its own frame (standing at the origin facing +Z), placed at (0, D) facing the attacker. */
function vk(t: number, D: number, base: Omit<Key, 't'>, over: Partial<Key> = {}): Key {
  const kk = k(t, base, over);
  const r = kk.root ?? [0, 0, 0];
  kk.root = [-r[0], D - r[1], 180 + r[2]];
  const conv = (f?: KeyFoot): KeyFoot | undefined => {
    if (!f) return f;
    const out = { ...f };
    if (f.p) out.p = [-f.p[0], f.p[1], D - f.p[2]];
    if (f.yaw !== undefined) out.yaw = 180 + f.yaw;
    return out;
  };
  kk.lf = conv(kk.lf);
  kk.rf = conv(kk.rf);
  return kk;
}
