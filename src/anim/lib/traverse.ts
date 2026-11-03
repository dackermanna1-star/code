import { ClipSpec, defineClip, getClip, Key, KeyHand } from '../clip';
import type { EaseName } from '../../core/math';
import { k, RELAXED } from './stances';

/**
 * Scarlet's ways over and up and down the world, authored in clip space: +z ahead, +x her left,
 * y up from the floor she starts on. A ledge's face is at z = 0.42 ahead of where a move starts;
 * the move is played with its heights scaled to the real ledge (yScale) and its origin on the face.
 *
 *  tv_vault   a one-handed speed vault over something waist high and thin (1.0 m)
 *  tv_mantle  hands on a ledge at chest height (1.2 m), a knee up, stand on it
 *  tv_climb   a jump to a ledge over her head (2.1 m), hang, walk up the wall, over
 *  tv_fence   up a chain-link fence (2.0 m) hand over hand, a leg over, down the other side
 *  tv_jump    a running jump over a gap (2 m nominal, warped to the real one)
 *  tv_drop    off an edge: the step out, the fall (the game drives the height), the landing
 *  tv_land    a fall's landing
 *  tv_ladder  hand over hand up a ladder (a loop the game drives by height)
 *  tv_lower / tv_lower_hi  the mantle and the climb backwards: lowering herself down a ledge
 */

/** Arms down at the sides, hands loose (chest space), for keys between the climbing ones. */
const ARMS_LOOSE: { lh: KeyHand; rh: KeyHand } = {
  lh: { p: [0.26, -0.42, 0.06], sp: 'chest', pole: [0.3, 0, -1], roll: -10, aim: null, dir: null },
  rh: { p: [-0.26, -0.42, 0.06], sp: 'chest', pole: [-0.3, 0, -1], roll: -10, aim: null, dir: null },
};
const H = (x: number, y: number, z: number, pole: [number, number, number], roll = 70) => ({ p: [x, y, z] as [number, number, number], sp: 'root' as const, pole, roll, aim: null, dir: null });
const LP: [number, number, number] = [0.7, -0.5, -0.8];
const RP: [number, number, number] = [-0.7, -0.5, -0.8];

export function registerTraversal() {
  // ------------------------------------------------------------------ mantle (1.2 m)
  defineClip('tv_mantle', {
    recoverT: 0.9,
    keys: [
      k(0, RELAXED),
      k(0.12, RELAXED, { e: 'out', hips: [0, -0.08, 0.02], hipsR: [10, 0, 0], torso: [12, 0, 0], head: [-12, 0, 0], lh: H(0.21, 1.1, 0.34, LP), rh: H(-0.21, 1.1, 0.34, RP) }),
      k(0.24, RELAXED, { hips: [0, -0.2, 0.04], hipsR: [24, 0, 0], torso: [18, 0, 0], head: [-14, 0, 0], lh: H(0.22, 1.22, 0.43, LP), rh: H(-0.22, 1.22, 0.43, RP) }),
      k(0.4, RELAXED, {
        e: 'out', root: [0, 0.1, 0], hips: [0, 0.5, 0.05], hipsR: [40, 0, 0], torso: [28, 0, 0], head: [-18, 0, 0],
        lh: H(0.22, 1.22, 0.33, LP), rh: H(-0.22, 1.22, 0.33, RP),
        lf: { p: [0.12, 0.42, 0.12], yaw: 6, pitch: 40, pole: [0.2, 0.3, 1] }, rf: { p: [-0.13, 1.22, 0.56], yaw: -6, pitch: 0, lift: 0.25, pole: [-0.1, 0.6, 1] },
      }),
      k(0.56, RELAXED, {
        root: [0, 0.32, 0], hips: [0, 0.92, 0.02], hipsR: [30, 0, 0], torso: [22, 0, 0], head: [-8, 0, 0],
        lh: H(0.24, 1.24, 0.11, [0.8, -0.2, -0.6], 40), rh: H(-0.24, 1.24, 0.11, [-0.8, -0.2, -0.6], 40),
        lf: { p: [0.12, 1.22, 0.62], yaw: 6, pitch: 0, lift: 0.18, pole: [0.2, 0.5, 1] }, rf: { p: [-0.13, 1.22, 0.56], yaw: -6, pole: [-0.2, 0.5, 1] },
      }),
      k(0.74, RELAXED, { e: 'inout', root: [0, 0.55, 0], hips: [0, 1.12, 0], hipsR: [10, 0, 0], torso: [6, 0, 0], ...ARMS_LOOSE, lf: { p: [0.12, 1.2, 0.66], yaw: 6 }, rf: { p: [-0.11, 1.2, 0.58], yaw: -6 } }),
      k(0.95, RELAXED, { root: [0, 0.66, 0], hips: [0, 1.185, 0], lf: { p: [0.11, 1.2, 0.7], yaw: 8 }, rf: { p: [-0.11, 1.2, 0.64], yaw: -8 } }),
    ],
    events: [{ t: 0.24, type: 'sfx', name: 'grab' }, { t: 0.42, type: 'sfx', name: 'effort' }, { t: 0.56, type: 'sfx', name: 'footstep' }, { t: 0.74, type: 'sfx', name: 'footstep' }],
  });

  // ------------------------------------------------------------------ climb (2.1 m)
  defineClip('tv_climb', {
    recoverT: 1.18,
    keys: [
      k(0, RELAXED),
      k(0.14, RELAXED, { e: 'out', hips: [0, -0.22, 0.02], hipsR: [18, 0, 0], torso: [10, 0, 0], head: [-22, 0, 0], lh: H(0.26, 0.72, -0.12, [0.6, 0, -1], 0), rh: H(-0.26, 0.72, -0.12, [-0.6, 0, -1], 0) }),
      k(0.3, RELAXED, {
        e: 'out', root: [0, 0.15, 0], hips: [0, 0.36, 0.02], hipsR: [-4, 0, 0], torso: [-6, 0, 0], head: [-24, 0, 0],
        lh: H(0.24, 2.08, 0.28, LP), rh: H(-0.24, 2.08, 0.28, RP),
        lf: { p: [0.12, 0.26, 0.24], yaw: 4, pitch: 30 }, rf: { p: [-0.12, 0.32, 0.18], yaw: -4, pitch: 35 },
      }),
      k(0.44, RELAXED, {
        root: [0, 0.17, 0], hips: [0, 0.08, 0.06], hipsR: [-6, 0, 0], torso: [-2, 0, 0], head: [-16, 0, 0],
        lh: H(0.24, 2.1, 0.26, LP, 80), rh: H(-0.24, 2.1, 0.26, RP, 80),
        lf: { p: [0.14, 0.58, 0.3], yaw: 0, pitch: -30, pole: [0.2, 0.2, 1] }, rf: { p: [-0.14, 0.78, 0.31], yaw: 0, pitch: -30, pole: [-0.2, 0.2, 1] },
      }),
      k(0.64, RELAXED, {
        e: 'inout', root: [0, 0.22, 0], hips: [0, 0.62, 0.08], hipsR: [8, 0, 0], torso: [18, 0, 0], head: [-8, 0, 0],
        lh: H(0.24, 2.1, 0.21, [0.8, -0.6, -0.4], 70), rh: H(-0.24, 2.1, 0.21, [-0.8, -0.6, -0.4], 70),
        lf: { p: [0.14, 1.05, 0.31], pitch: -30, pole: [0.2, 0.6, 1] }, rf: { p: [-0.14, 0.72, 0.32], pitch: -30, pole: [-0.2, 0.4, 1] },
      }),
      k(0.84, RELAXED, {
        root: [0, 0.3, 0], hips: [0, 1.15, 0.05], hipsR: [32, 0, 0], torso: [34, 0, 0], head: [-6, 0, 0],
        lh: H(0.24, 2.12, 0.13, [0.9, 0, -0.4], 40), rh: H(-0.24, 2.12, 0.13, [-0.9, 0, -0.4], 40),
        lf: { p: [0.14, 2.1, 0.62], yaw: 6, lift: 0.2, pole: [0.2, 0.8, 1] }, rf: { p: [-0.14, 1.25, 0.32], pitch: -25, pole: [-0.2, 0.4, 1] },
      }),
      k(1.04, RELAXED, {
        root: [0, 0.45, 0], hips: [0, 1.7, 0.02], hipsR: [26, 0, 0], torso: [24, 0, 0], head: [-4, 0, 0],
        lh: H(0.25, 2.12, -0.02, [0.9, 0.2, -0.3], 20), rh: H(-0.25, 2.12, -0.02, [-0.9, 0.2, -0.3], 20),
        lf: { p: [0.13, 2.1, 0.65], yaw: 6, pole: [0.2, 0.6, 1] }, rf: { p: [-0.13, 2.1, 0.58], yaw: -6, lift: 0.22, pole: [-0.2, 0.6, 1] },
      }),
      k(1.25, RELAXED, { e: 'inout', root: [0, 0.62, 0], hips: [0, 2.085, 0], ...ARMS_LOOSE, lf: { p: [0.11, 2.1, 0.68], yaw: 8 }, rf: { p: [-0.11, 2.1, 0.6], yaw: -8 } }),
    ],
    events: [{ t: 0.3, type: 'sfx', name: 'effort' }, { t: 0.42, type: 'sfx', name: 'grab' }, { t: 0.84, type: 'sfx', name: 'footstep' }, { t: 1.05, type: 'sfx', name: 'footstep' }],
  });

  // ------------------------------------------------------------------ vault (1.0 m, thin)
  defineClip('tv_vault', {
    recoverT: 0.74,
    warp: [0.18, 0.52],
    keys: [
      k(0, RELAXED, { hipsR: [8, 0, 0], torso: [6, 0, 0] }),
      k(0.1, RELAXED, {
        root: [0, 0.12, 0], hips: [0, -0.06, 0.04], hipsR: [14, 0, 0], torso: [14, 0, 0],
        lh: H(0.08, 1.0, 0.34, [0.7, -0.6, -0.3], 60), rh: H(-0.25, 1.0, 0.24, RP, 20),
        lf: { p: [0.11, 0, 0.12], yaw: 4 }, rf: { p: [-0.13, 0.08, -0.08], yaw: -6, pitch: 30 },
      }),
      k(0.22, RELAXED, {
        e: 'out', root: [0.04, 0.35, 0], hips: [0, 0.42, 0], hipsR: [10, 0, -20], torso: [8, 0, -10], head: [-6, 0, 8],
        lh: H(0.1, 1.0, 0.18, [0.8, -0.4, -0.2], 70), rh: H(-0.32, 1.25, 0.24, [-0.6, -0.4, -0.6], 20),
        lf: { p: [-0.1, 0.92, 0.45], yaw: -20, pitch: 10, pole: [-0.6, 0.4, 1] }, rf: { p: [-0.3, 0.78, 0.38], yaw: -30, pitch: 10, pole: [-0.6, 0.4, 1] },
      }),
      k(0.36, RELAXED, {
        root: [0.06, 0.62, 0], hips: [0, 0.46, 0], hipsR: [6, 0, -14], torso: [6, 0, -8], head: [-4, 0, 6],
        lh: H(0.12, 1.0, -0.09, [0.9, -0.2, 0], 40), rh: H(-0.36, 1.18, 0.22, [-0.6, -0.4, -0.6], 20),
        lf: { p: [-0.18, 1.04, 0.92], yaw: -10, pitch: 0, pole: [-0.4, 0.4, 1] }, rf: { p: [-0.34, 0.88, 0.82], yaw: -16, pole: [-0.5, 0.4, 1] },
      }),
      k(0.5, RELAXED, { e: 'in', root: [0.04, 0.95, 0], hips: [0, 0.14, 0.02], hipsR: [6, 0, -4], torso: [4, 0, -2], ...ARMS_LOOSE, lf: { p: [0, 0.34, 1.25], yaw: 0 }, rf: { p: [-0.2, 0.24, 1.15], yaw: -6 } }),
      k(0.62, RELAXED, { root: [0, 1.15, 0], hips: [0, -0.14, 0.03], hipsR: [12, 0, 0], torso: [10, 0, 0], lf: { p: [0.1, 0, 1.3], yaw: 6 }, rf: { p: [-0.12, 0, 1.12], yaw: -8 } }),
      k(0.82, RELAXED, { root: [0, 1.35, 0], lf: { p: [0.11, 0, 1.45], yaw: 8 }, rf: { p: [-0.11, 0, 1.3], yaw: -8 } }),
    ],
    events: [{ t: 0.1, type: 'sfx', name: 'grab' }, { t: 0.2, type: 'sfx', name: 'whoosh' }, { t: 0.62, type: 'sfx', name: 'footstep' }],
  });

  // ------------------------------------------------------------------ fence (2.0 m, chain-link)
  defineClip('tv_fence', {
    recoverT: 1.22,
    keys: [
      k(0, RELAXED),
      k(0.15, RELAXED, { e: 'out', root: [0, 0.1, 0], hips: [0, 0.18, 0.02], torso: [4, 0, 0], head: [-18, 0, 0], lh: H(0.22, 1.9, 0.26, LP), rh: H(-0.22, 1.82, 0.26, RP), lf: { p: [0.12, 0.6, 0.36], pitch: -20, pole: [0.2, 0.4, 1] }, rf: { p: [-0.12, 0.18, 0.2], pitch: 20 } }),
      k(0.38, RELAXED, { root: [0, 0.15, 0], hips: [0, 0.72, 0.06], torso: [8, 0, 0], head: [-10, 0, 0], lh: H(0.22, 2.0, 0.3, LP), rh: H(-0.22, 2.0, 0.3, RP), lf: { p: [0.12, 1.0, 0.4], pitch: -20, pole: [0.2, 0.6, 1] }, rf: { p: [-0.12, 0.62, 0.4], pitch: -20, pole: [-0.2, 0.6, 1] } }),
      k(0.6, RELAXED, { root: [0, 0.3, 0], hips: [0, 1.24, 0.04], hipsR: [12, 0, 12], torso: [14, 0, 4], lh: H(0.22, 2.02, 0.15, LP, 40), rh: H(-0.22, 2.02, 0.15, RP, 40), lf: { p: [0.16, 2.06, 0.6], yaw: 20, lift: 0.3, pole: [0.6, 0.6, 1] }, rf: { p: [-0.12, 1.32, 0.38], pitch: -20, pole: [-0.2, 0.6, 1] } }),
      k(0.82, RELAXED, { root: [0, 0.55, 0], hips: [0, 1.08, 0], hipsR: [6, 0, -6], torso: [8, 0, 0], lh: H(0.22, 2.02, -0.1, [0.8, 0, 0.2], 10), rh: H(-0.22, 2.02, -0.1, [-0.8, 0, 0.2], 10), lf: { p: [0.13, 1.08, 0.56], pitch: 10, pole: [0.2, 0.4, 1] }, rf: { p: [-0.13, 2.02, 0.52], yaw: -20, lift: 0.3, pole: [-0.6, 0.6, 1] } }),
      k(0.98, RELAXED, { e: 'in', root: [0, 0.75, 0], hips: [0, 0.6, 0], torso: [6, 0, 0], ...ARMS_LOOSE, lf: { p: [0.13, 0.32, 0.75], pitch: 10 }, rf: { p: [-0.13, 0.44, 0.72], pitch: 10 } }),
      k(1.12, RELAXED, { root: [0, 0.9, 0], hips: [0, -0.18, 0.03], hipsR: [16, 0, 0], torso: [12, 0, 0], lf: { p: [0.11, 0, 0.95], yaw: 6 }, rf: { p: [-0.12, 0, 0.82], yaw: -8 } }),
      k(1.32, RELAXED, { root: [0, 1.0, 0], lf: { p: [0.11, 0, 1.02], yaw: 8 }, rf: { p: [-0.11, 0, 0.98], yaw: -8 } }),
    ],
    events: [{ t: 0.15, type: 'sfx', name: 'fence' }, { t: 0.4, type: 'sfx', name: 'fence' }, { t: 0.62, type: 'sfx', name: 'fence' }, { t: 1.12, type: 'sfx', name: 'footstep' }],
  });

  // ------------------------------------------------------------------ running jump (2 m gap)
  const RUN = { ...RELAXED, hipsR: [10, 0, 0] as [number, number, number], torso: [10, 0, 0] as [number, number, number] };
  defineClip('tv_jump', {
    recoverT: 0.86,
    warp: [0.12, 0.66],
    keys: [
      k(0, RUN, { lf: { p: [0.11, 0, 0.1], yaw: 4 }, rf: { p: [-0.11, 0, -0.15], yaw: -4 } }),
      k(0.12, RUN, {
        root: [0, 0.45, 0], hips: [0, -0.05, 0.05], hipsR: [14, 0, 0], torso: [14, 0, 0],
        lh: H(0.24, 0.85, -0.25, [0.4, 0, -1], 0), rh: H(-0.22, 1.25, 0.25, [-0.4, -0.6, -1], 40),
        lf: { p: [0.1, 0, 0.45], yaw: 4 }, rf: { p: [-0.1, 0.25, 0.2], yaw: -4, pitch: 30 },
      }),
      k(0.3, RUN, {
        e: 'out', root: [0, 1.2, 0], hips: [0, 0.42, 0.02], hipsR: [6, 0, 0], torso: [4, 0, 0], head: [6, 0, 0],
        lh: H(0.28, 1.35, 0.3, LP, 20), rh: H(-0.28, 1.4, 0.32, RP, 20),
        lf: { p: [0.1, 0.55, 1.0], pitch: 50, pole: [0.1, 0, 1] }, rf: { p: [-0.1, 0.62, 1.55], pitch: 0, pole: [-0.1, 0.6, 1] },
      }),
      k(0.5, RUN, { root: [0, 1.95, 0], hips: [0, 0.36, 0], hipsR: [4, 0, 0], lh: H(0.3, 1.3, 0.25, LP, 20), rh: H(-0.3, 1.32, 0.27, RP, 20), lf: { p: [0.1, 0.45, 1.85], pitch: 20 }, rf: { p: [-0.1, 0.4, 2.25], pitch: -10 } }),
      k(0.66, RUN, { e: 'in', root: [0, 2.6, 0], hips: [0, -0.22, 0.05], hipsR: [20, 0, 0], torso: [16, 0, 0], lh: H(0.3, 0.95, 0.32, LP, 20), rh: H(-0.3, 0.95, 0.34, RP, 20), lf: { p: [0.11, 0, 2.75], yaw: 6 }, rf: { p: [-0.12, 0, 2.95], yaw: -6 } }),
      k(0.9, RELAXED, { root: [0, 3.0, 0], lf: { p: [0.11, 0, 3.1], yaw: 8 }, rf: { p: [-0.11, 0, 2.95], yaw: -8 } }),
    ],
    events: [{ t: 0.12, type: 'sfx', name: 'effort' }, { t: 0.66, type: 'sfx', name: 'land' }],
  });

  // ------------------------------------------------------------------ drop off an edge
  defineClip('tv_drop', {
    recoverT: 0.82,
    keys: [
      k(0, RELAXED),
      k(0.16, RELAXED, { root: [0, 0.3, 0], hips: [0, -0.05, 0.05], hipsR: [8, 0, 0], lf: { p: [0.11, 0, 0.1], yaw: 6 }, rf: { p: [-0.11, 0.2, 0.42], pitch: 10, yaw: -6 } }),
      k(0.32, RELAXED, { e: 'out', root: [0, 0.6, 0], hips: [0, 0.05, 0], hipsR: [0, 0, 0], head: [10, 0, 0], lh: H(0.45, 1.35, 0.12, [0.4, -1, 0], 0), rh: H(-0.45, 1.35, 0.12, [-0.4, -1, 0], 0), lf: { p: [0.12, 0.16, 0.62], pitch: 20 }, rf: { p: [-0.12, 0.22, 0.68], pitch: 20 } }),
      k(0.48, RELAXED, { root: [0, 0.74, 0], hips: [0, 0.02, 0], head: [14, 0, 0], lh: H(0.42, 1.45, 0.1, [0.4, -1, 0], 0), rh: H(-0.42, 1.45, 0.1, [-0.4, -1, 0], 0), lf: { p: [0.12, 0.2, 0.76], pitch: 20 }, rf: { p: [-0.12, 0.18, 0.8], pitch: 20 } }),
      k(0.58, RELAXED, { e: 'in', root: [0, 0.8, 0], hips: [0, -0.34, 0.05], hipsR: [26, 0, 0], torso: [16, 0, 0], head: [-6, 0, 0], lh: H(0.3, 0.75, 0.42, LP, 40), rh: H(-0.3, 0.75, 0.44, RP, 40), lf: { p: [0.13, 0, 0.84], yaw: 8 }, rf: { p: [-0.13, 0, 0.74], yaw: -8 } }),
      k(0.88, RELAXED, { root: [0, 0.9, 0], lf: { p: [0.11, 0, 0.92], yaw: 8 }, rf: { p: [-0.11, 0, 0.86], yaw: -8 } }),
    ],
    events: [{ t: 0.58, type: 'sfx', name: 'land' }],
  });

  // ------------------------------------------------------------------ a fall's landing
  defineClip('tv_land', {
    recoverT: 0.36,
    keys: [
      k(0, RELAXED, { hips: [0, -0.3, 0.05], hipsR: [24, 0, 0], torso: [14, 0, 0], lh: H(0.3, 0.8, 0.4, LP, 40), rh: H(-0.3, 0.8, 0.42, RP, 40), lf: { p: [0.13, 0, 0.06], yaw: 8 }, rf: { p: [-0.13, 0, -0.04], yaw: -8 } }),
      k(0.12, RELAXED, { hips: [0, -0.4, 0.06], hipsR: [30, 0, 0], torso: [18, 0, 0], lh: H(0.3, 0.7, 0.42, LP, 40), rh: H(-0.3, 0.7, 0.44, RP, 40), lf: { p: [0.13, 0, 0.06], yaw: 8 }, rf: { p: [-0.13, 0, -0.04], yaw: -8 } }),
      k(0.42, RELAXED, { lf: { p: [0.12, 0, 0.06], yaw: 8 }, rf: { p: [-0.12, 0, -0.04], yaw: -8 } }),
    ],
  });
  // a hard landing: down on a knee and a hand
  defineClip('tv_land_hard', {
    recoverT: 0.7,
    keys: [
      k(0, RELAXED, { hips: [0, -0.4, 0.05], hipsR: [28, 0, 0], torso: [18, 0, 0], lh: H(0.3, 0.7, 0.42, LP, 40), rh: H(-0.3, 0.7, 0.44, RP, 40), lf: { p: [0.14, 0, 0.12], yaw: 8 }, rf: { p: [-0.14, 0, -0.08], yaw: -8 } }),
      k(0.14, RELAXED, { hips: [0, -0.56, 0.0], hipsR: [32, 0, 0], torso: [22, 0, 0], head: [-10, 0, 0], rh: H(-0.18, 0.04, 0.42, [-0.6, -0.2, -1], 80), lh: H(0.3, 0.55, 0.36, LP, 40), lf: { p: [0.15, 0, 0.3], yaw: 10, pole: [0.3, 0.4, 1] }, rf: { p: [-0.14, 0.05, -0.32], yaw: -8, pitch: 60, pole: [-0.1, -0.4, 1] } }),
      k(0.4, RELAXED, { hips: [0, -0.5, 0.0], hipsR: [26, 0, 0], torso: [16, 0, 0], rh: H(-0.18, 0.05, 0.42, [-0.6, -0.2, -1], 80), lh: H(0.3, 0.6, 0.34, LP, 40), lf: { p: [0.15, 0, 0.3], yaw: 10, pole: [0.3, 0.4, 1] }, rf: { p: [-0.14, 0.05, -0.32], yaw: -8, pitch: 60, pole: [-0.1, -0.4, 1] } }),
      k(0.75, RELAXED, { lf: { p: [0.12, 0, 0.18], yaw: 8 }, rf: { p: [-0.12, 0, 0.0], yaw: -8 } }),
    ],
  });

  // ------------------------------------------------------------------ ladder (loop: 2 rungs)
  // (the game moves her up 0.6 m a loop: a gripping hand's height falls 0.3 m relative to her
  // while it holds, the free one reaches up the same; the feet the same, half a loop apart)
  const LAD = { ...RELAXED, hips: [0, -0.1, 0.02] as [number, number, number], hipsR: [6, 0, 0] as [number, number, number], torso: [4, 0, 0] as [number, number, number], head: [-8, 0, 0] as [number, number, number] };
  const lad = (t: number, l: number, r: number, fl: number, fr: number) =>
    k(t, LAD, {
      lh: H(0.2, l, 0.24, [0.8, -0.6, -0.2], 80), rh: H(-0.2, r, 0.24, [-0.8, -0.6, -0.2], 80),
      lf: { p: [0.13, fl, 0.14], yaw: 4, pitch: 0, pole: [0.2, 0.3, 1] }, rf: { p: [-0.13, fr, 0.14], yaw: -4, pitch: 0, pole: [-0.2, 0.3, 1] },
    });
  defineClip('tv_ladder', {
    loop: true,
    keys: [lad(0, 1.78, 1.48, 0.12, 0.42), lad(0.25, 1.63, 1.72, 0.27, 0.27), lad(0.5, 1.48, 1.78, 0.42, 0.12), lad(0.75, 1.72, 1.63, 0.27, 0.27), lad(1.0, 1.78, 1.48, 0.12, 0.42)],
  });

  // ------------------------------------------------------------------ backwards: lowering herself down
  reverseClip('tv_mantle', 'tv_lower');
  reverseClip('tv_climb', 'tv_lower_hi');
}

/** A clip played backwards (a climb up as a climb down), its events dropped. */
function reverseClip(name: string, as: string) {
  const c = getClip(name);
  const D = c.dur;
  const flip = (e: EaseName | undefined): EaseName | undefined => (e === 'in' ? 'out' : e === 'out' ? 'in' : e);
  // the resolved keys carry every channel: rebuild them as spec keys in reverse order
  const keys: Key[] = [];
  for (let i = c.keys.length - 1; i >= 0; i--) {
    const rk = c.keys[i];
    const next = c.keys[i + 1];
    keys.push({
      t: D - rk.t,
      e: next ? flip(next.e) : undefined,
      root: [...rk.root] as Key['root'],
      hips: [...rk.hips] as Key['hips'],
      hipsR: [...rk.hipsR] as Key['hipsR'],
      spine: [...rk.spine] as Key['spine'],
      chest: [...rk.chest] as Key['chest'],
      neck: [...rk.neck] as Key['neck'],
      head: [...rk.head] as Key['head'],
      lh: { ...rk.lh, p: [...rk.lh.p] as [number, number, number] },
      rh: { ...rk.rh, p: [...rk.rh.p] as [number, number, number] },
      lf: { p: [...rk.lf.p] as [number, number, number], yaw: rk.lf.yaw, pitch: rk.lf.pitch, roll: rk.lf.roll, toe: rk.lf.toe, ...(rk.lf.pole ? { pole: [...rk.lf.pole] as [number, number, number] } : {}) },
      rf: { p: [...rk.rf.p] as [number, number, number], yaw: rk.rf.yaw, pitch: rk.rf.pitch, roll: rk.rf.roll, toe: rk.rf.toe, ...(rk.rf.pole ? { pole: [...rk.rf.pole] as [number, number, number] } : {}) },
    });
  }
  const spec: ClipSpec = { keys, recoverT: D - 0.05 };
  defineClip(as, spec);
}
