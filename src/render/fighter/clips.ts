import type { EaseName } from '../../core/math';
import type { ClipSet } from '../../sim/weapons';
import type { Pose } from './skeleton';

/**
 * Authored animation library.
 *
 * Action clips use PHASE-ALIGNED keys so that the visual strike always lands exactly on the
 * simulation's active frames:
 *   'start'  frame 0
 *   'wind'   last startup frame (extreme anticipation)
 *   'hit'    contact pose, 2 frames into the active window (the snap between wind→hit is
 *            where the renderer draws smear frames / motion blur)
 *   'follow' end of the active window (follow-through)
 *   'end'    end of recovery (settles back toward the stance)
 * Sequence / finisher clips use absolute tick keys (numbers).
 *
 * Poses are authored with ABSOLUTE limb angles through K() for readability; K converts them to the
 * skeleton's relative angles.
 */

export type Mark = 'start' | 'wind' | 'hit' | 'follow' | 'end';
export interface ClipKey {
  at: Mark | number;
  pose: Partial<Pose>;
  ease?: EaseName;
}
export interface Clip {
  keys: ClipKey[];
  /** Loop period in ticks for tick-based clips (0 = hold last key). */
  loop?: number;
  /** Procedural vibration amplitude (power-ups, struggles). */
  shake?: number;
}

interface KSpec {
  torso?: number;
  head?: number;
  /** Lead arm [upper, fore] absolute angles. */
  a1?: [number, number];
  /** Rear arm [upper, fore] absolute angles. */
  a2?: [number, number];
  /** Weapon absolute angle (requires a1). */
  w?: number;
  /** Second weapon absolute angle (requires a2). */
  w2?: number;
  /** Lead leg [thigh absolute, shin bend]. */
  l1?: [number, number];
  l2?: [number, number];
  dx?: number;
  dy?: number;
  spin?: number;
}

/** Build a partial pose from absolute angles. */
export function K(s: KSpec): Partial<Pose> {
  const p: Partial<Pose> = {};
  const torso = s.torso ?? 0;
  if (s.torso !== undefined) p.torso = s.torso;
  if (s.head !== undefined) p.head = s.head;
  if (s.a1) {
    p.ua1 = s.a1[0] - torso;
    p.la1 = s.a1[1] - s.a1[0];
    if (s.w !== undefined) p.wpn = s.w - s.a1[1];
  }
  if (s.a2) {
    p.ua2 = s.a2[0] - torso;
    p.la2 = s.a2[1] - s.a2[0];
    if (s.w2 !== undefined) p.wpn2 = s.w2 - s.a2[1];
  }
  if (s.l1) {
    p.th1 = s.l1[0];
    p.sh1 = s.l1[1];
  }
  if (s.l2) {
    p.th2 = s.l2[0];
    p.sh2 = s.l2[1];
  }
  if (s.dx !== undefined) p.dx = s.dx;
  if (s.dy !== undefined) p.dy = s.dy;
  if (s.spin !== undefined) p.spin = s.spin;
  return p;
}

/* ======================================================================== */
/* Stances                                                                  */
/* ======================================================================== */

export const STANCES: Record<ClipSet, Partial<Pose>> = {
  blade: K({ torso: 10, head: -4, a1: [58, 108], a2: [40, 110], w: 150, w2: 150, l1: [26, -26], l2: [-22, -10], dy: 7 }),
  heavy: K({ torso: 12, head: -4, a1: [70, 128], a2: [55, 125], w: 160, w2: 160, l1: [28, -28], l2: [-26, -10], dy: 9 }),
  pole: K({ torso: 6, head: -2, a1: [66, 84], a2: [30, 70], w: 86, w2: 86, l1: [27, -24], l2: [-26, -8], dy: 8 }),
  dual: K({ torso: 18, head: -10, a1: [70, 150], a2: [45, 135], w: 120, w2: 110, l1: [30, -40], l2: [-30, -18], dy: 14 }),
  fist: K({ torso: 10, head: 4, a1: [60, 160], a2: [40, 158], w: 160, w2: 160, l1: [20, -20], l2: [-20, -8], dy: 6 }),
};

/** Weapon grip offset for the rear hand along the weapon (negative = toward the pommel/butt). 0 = no two-hand grip. */
export const GRIP: Record<ClipSet, number> = { blade: -11, heavy: -15, pole: -40, dual: 0, fist: 0 };

/* ======================================================================== */
/* Weapon attack clips                                                      */
/* ======================================================================== */

type MoveName = 'light1' | 'light2' | 'light3' | 'light4' | 'heavy' | 'launcher' | 'sweep' | 'thrust' | 'air1' | 'air2' | 'airSlam' | 'throw';

const LUNGE = { l1: [40, -32] as [number, number], l2: [-34, -6] as [number, number], dy: 15 };

function bladeClips(variant: 'blade' | 'heavy' | 'pole' | 'dual'): Record<MoveName, Clip> {
  const heavy = variant === 'heavy';
  const pole = variant === 'pole';
  const dual = variant === 'dual';
  const tw = heavy ? 1.15 : 1; // bigger arcs for heavy weapons
  const c: Record<MoveName, Clip> = {
    light1: {
      keys: [
        { at: 'wind', ease: 'outCubic', pose: pole ? K({ torso: -6, a1: [30, 60], a2: [10, 50], w: 92, l1: [18, -20], l2: [-26, -8], dy: 9 }) : K({ torso: -8, a1: [205 * tw, 232 * tw], a2: [190, 230], w: 250, l1: [20, -22], l2: [-24, -8], dy: 8 }) },
        { at: 'hit', ease: 'linear', pose: pole ? K({ torso: 22, a1: [86, 90], a2: [60, 80], w: 90, ...LUNGE }) : K({ torso: 18, a1: [95, 90], a2: [70, 84], w: 92, w2: 70, ...LUNGE }) },
        { at: 'follow', ease: 'outQuad', pose: pole ? K({ torso: 24, a1: [88, 92], a2: [62, 82], w: 92, ...LUNGE }) : K({ torso: 22, a1: [52, 44], a2: [40, 40], w: 28, w2: 30, ...LUNGE }) },
      ],
    },
    light2: {
      keys: [
        { at: 'wind', ease: 'outCubic', pose: K({ torso: 16, a1: [20, 14], a2: dual ? [200, 230] : [10, 20], w: -40, w2: 250, l1: [30, -30], l2: [-26, -8], dy: 12 }) },
        { at: 'hit', ease: 'linear', pose: K({ torso: 2, a1: [125, 128], a2: dual ? [96, 92] : [100, 110], w: 118, w2: 92, ...LUNGE }) },
        { at: 'follow', ease: 'outQuad', pose: K({ torso: -6, a1: [165, 172], a2: dual ? [55, 45] : [140, 150], w: 196, w2: 30, ...LUNGE }) },
      ],
    },
    light3: {
      keys: [
        { at: 'wind', ease: 'outCubic', pose: K({ torso: 26, a1: [-2, 6], a2: [-10, 10], w: -70, w2: -60, l1: [44, -70], l2: [-34, -22], dy: 22 }) },
        { at: 'hit', ease: 'linear', pose: K({ torso: -10, head: -14, a1: [170, 165], a2: [160, 160], w: 172, w2: 168, l1: [16, -10], l2: [-16, -4], dy: -6 }) },
        { at: 'follow', ease: 'outQuad', pose: K({ torso: -12, head: -16, a1: [200, 210], a2: [190, 200], w: 215, w2: 210, l1: [14, -8], l2: [-14, -4], dy: -4 }) },
      ],
    },
    light4: {
      keys: [
        { at: 'wind', ease: 'outCubic', pose: K({ torso: 30, a1: [200, 230], a2: [-40, -20], w: 250, w2: -70, l1: [40, -60], l2: [-30, -20], dy: 18 }) },
        { at: 'hit', ease: 'linear', pose: K({ torso: 20, a1: [100, 92], a2: [80, 70], w: 80, w2: 60, ...LUNGE, spin: 0 }) },
        { at: 'follow', ease: 'outQuad', pose: K({ torso: 26, a1: [40, 30], a2: [130, 140], w: 10, w2: 150, ...LUNGE }) },
      ],
    },
    heavy: {
      keys: [
        { at: 'wind', ease: 'outCubic', pose: K({ torso: -16, head: -12, a1: [205, 215], a2: [198, 212], w: 260, w2: 255, l1: [24, -20], l2: [-26, -6], dy: 3 }) },
        { at: 'hit', ease: 'linear', pose: K({ torso: 30, head: 6, a1: [80, 72], a2: [74, 70], w: 62, w2: 62, l1: [44, -40], l2: [-38, -8], dy: 18 }) },
        { at: 'follow', ease: 'outQuad', pose: K({ torso: 36, head: 10, a1: [42, 30], a2: [38, 28], w: 8, w2: 8, l1: [46, -44], l2: [-40, -10], dy: 22 }) },
      ],
    },
    launcher: {
      keys: [
        { at: 'wind', ease: 'outCubic', pose: K({ torso: 26, a1: [10, 2], a2: [0, 0], w: -45, w2: -45, l1: [52, -86], l2: [-36, -30], dy: 26 }) },
        { at: 'hit', ease: 'linear', pose: K({ torso: -8, head: -18, a1: [178, 180], a2: [168, 172], w: 186, w2: 180, l1: [14, -6], l2: [-14, -4], dy: -6 }) },
        { at: 'follow', ease: 'outQuad', pose: K({ torso: -10, head: -20, a1: [196, 204], a2: [188, 196], w: 205, w2: 200, l1: [12, -6], l2: [-12, -4], dy: -4 }) },
      ],
    },
    sweep: {
      keys: [
        { at: 'wind', ease: 'outCubic', pose: K({ torso: 40, a1: [30, 26], a2: [10, 10], w: -50, w2: -50, l1: [62, -112], l2: [-48, -24], dy: 32 }) },
        { at: 'hit', ease: 'linear', pose: K({ torso: 46, a1: [96, 94], a2: [60, 60], w: 94, w2: 90, l1: [82, -8], l2: [-60, -44], dy: 42 }) },
        { at: 'follow', ease: 'outQuad', pose: K({ torso: 44, a1: [124, 128], a2: [80, 80], w: 128, w2: 120, l1: [80, -10], l2: [-58, -44], dy: 40 }) },
      ],
    },
    thrust: {
      keys: [
        { at: 'wind', ease: 'outCubic', pose: K({ torso: -12, a1: [-36, 70], a2: [-50, 40], w: 92, w2: 92, l1: [14, -16], l2: [-26, -8], dy: 10 }) },
        { at: 'hit', ease: 'linear', pose: K({ torso: 28, head: 4, a1: [92, 92], a2: pole ? [70, 82] : [40, 30], w: 90, w2: 50, l1: [56, -46], l2: [-50, -12], dy: 25 }) },
        { at: 'follow', ease: 'outQuad', pose: K({ torso: 30, head: 4, a1: [94, 94], a2: pole ? [72, 84] : [38, 28], w: 92, w2: 48, l1: [56, -46], l2: [-50, -12], dy: 25 }) },
      ],
    },
    air1: {
      keys: [
        { at: 'wind', ease: 'outCubic', pose: K({ torso: -4, a1: [210, 225], a2: [180, 200], w: 250, w2: 240, l1: [70, -100], l2: [36, -92] }) },
        { at: 'hit', ease: 'linear', pose: K({ torso: 12, a1: [92, 90], a2: [70, 80], w: 88, w2: 80, l1: [40, -52], l2: [-12, -42] }) },
        { at: 'follow', ease: 'outQuad', pose: K({ torso: 18, a1: [48, 40], a2: [40, 40], w: 25, w2: 30, l1: [36, -48], l2: [-14, -40] }) },
      ],
    },
    air2: {
      keys: [
        { at: 'wind', ease: 'outCubic', pose: K({ torso: 10, a1: [20, 10], a2: [10, 20], w: -30, w2: -20, l1: [74, -110], l2: [40, -100], spin: -20 }) },
        { at: 'hit', ease: 'linear', pose: K({ torso: 10, a1: [110, 108], a2: [80, 90], w: 110, w2: 100, l1: [60, -90], l2: [30, -80], spin: 160 }) },
        { at: 'follow', ease: 'outQuad', pose: K({ torso: 10, a1: [130, 140], a2: [90, 100], w: 150, w2: 120, l1: [50, -70], l2: [10, -60], spin: 340 }) },
        { at: 'end', ease: 'outQuad', pose: K({ spin: 360 }) },
      ],
    },
    airSlam: {
      keys: [
        { at: 'wind', ease: 'outCubic', pose: K({ torso: -10, head: -10, a1: [195, 200], a2: [190, 196], w: 205, w2: 200, l1: [78, -110], l2: [40, -96], spin: -25 }) },
        { at: 'hit', ease: 'linear', pose: K({ torso: 26, head: 14, a1: [34, 20], a2: [30, 18], w: -2, w2: -2, l1: [-12, -12], l2: [14, -30], spin: 0 }) },
        { at: 'follow', ease: 'outQuad', pose: K({ torso: 28, head: 16, a1: [30, 16], a2: [28, 16], w: -4, w2: -4, l1: [-14, -12], l2: [16, -30], spin: 0 }) },
      ],
    },
    throw: {
      keys: [
        { at: 'wind', ease: 'outCubic', pose: K({ torso: 18, a1: [96, 96], a2: [88, 88], w: 200, l1: [36, -34], l2: [-30, -8], dy: 12 }) },
        { at: 'hit', ease: 'linear', pose: K({ torso: 12, a1: [104, 118], a2: [98, 112], w: 210, l1: [32, -30], l2: [-28, -8], dy: 10 }) },
        { at: 'follow', ease: 'outQuad', pose: K({ torso: 10, a1: [100, 120], a2: [96, 116], w: 210, l1: [30, -28], l2: [-28, -8], dy: 10 }) },
      ],
    },
  };
  return c;
}

function fistClips(): Record<MoveName, Clip> {
  return {
    light1: {
      keys: [
        { at: 'wind', ease: 'outCubic', pose: K({ torso: 6, a1: [30, 150], a2: [40, 160], l1: [22, -22], l2: [-22, -8] }) },
        { at: 'hit', ease: 'linear', pose: K({ torso: 18, a1: [92, 92], a2: [36, 158], l1: [34, -30], l2: [-30, -8], dy: 10 }) },
        { at: 'follow', ease: 'outQuad', pose: K({ torso: 18, a1: [90, 92], a2: [36, 158], l1: [34, -30], l2: [-30, -8], dy: 10 }) },
      ],
    },
    light2: {
      keys: [
        { at: 'wind', ease: 'outCubic', pose: K({ torso: 4, a1: [50, 160], a2: [10, 130], l1: [22, -22], l2: [-24, -8] }) },
        { at: 'hit', ease: 'linear', pose: K({ torso: 26, a1: [30, 150], a2: [94, 94], l1: [38, -34], l2: [-34, -6], dy: 12 }) },
        { at: 'follow', ease: 'outQuad', pose: K({ torso: 26, a1: [30, 150], a2: [92, 94], l1: [38, -34], l2: [-34, -6], dy: 12 }) },
      ],
    },
    light3: {
      keys: [
        { at: 'wind', ease: 'outCubic', pose: K({ torso: 22, a1: [0, 90], a2: [40, 150], l1: [40, -60], l2: [-30, -20], dy: 18 }) },
        { at: 'hit', ease: 'linear', pose: K({ torso: -8, head: -14, a1: [158, 178], a2: [30, 140], l1: [16, -10], l2: [-18, -6], dy: -4 }) },
        { at: 'follow', ease: 'outQuad', pose: K({ torso: -10, head: -14, a1: [168, 186], a2: [30, 140], l1: [14, -8], l2: [-16, -6], dy: -4 }) },
      ],
    },
    light4: {
      keys: [
        { at: 'wind', ease: 'outCubic', pose: K({ torso: -14, a1: [60, 160], a2: [40, 150], l1: [44, -110], l2: [-14, -10], dy: 4 }) },
        { at: 'hit', ease: 'linear', pose: K({ torso: -26, head: -4, a1: [130, 150], a2: [-60, -40], l1: [104, -2], l2: [-12, -4], dy: 0 }) },
        { at: 'follow', ease: 'outQuad', pose: K({ torso: -24, head: -4, a1: [130, 150], a2: [-60, -40], l1: [100, -4], l2: [-12, -4], dy: 0 }) },
      ],
    },
    heavy: {
      keys: [
        { at: 'wind', ease: 'outCubic', pose: K({ torso: -14, head: -14, a1: [205, 225], a2: [195, 215], l1: [20, -18], l2: [-24, -6], dy: 2 }) },
        { at: 'hit', ease: 'linear', pose: K({ torso: 36, head: 10, a1: [62, 50], a2: [56, 46], l1: [46, -46], l2: [-40, -10], dy: 20 }) },
        { at: 'follow', ease: 'outQuad', pose: K({ torso: 40, head: 12, a1: [40, 30], a2: [36, 28], l1: [48, -48], l2: [-40, -10], dy: 24 }) },
      ],
    },
    launcher: {
      keys: [
        { at: 'wind', ease: 'outCubic', pose: K({ torso: 26, a1: [-6, 100], a2: [40, 150], l1: [50, -90], l2: [-36, -30], dy: 28 }) },
        { at: 'hit', ease: 'linear', pose: K({ torso: -10, head: -20, a1: [176, 182], a2: [20, 120], l1: [22, -40], l2: [-16, -8], dy: -14 }) },
        { at: 'follow', ease: 'outQuad', pose: K({ torso: -12, head: -20, a1: [184, 190], a2: [20, 120], l1: [20, -38], l2: [-14, -8], dy: -14 }) },
      ],
    },
    sweep: {
      keys: [
        { at: 'wind', ease: 'outCubic', pose: K({ torso: 32, a1: [-30, -20], a2: [30, 40], l1: [62, -124], l2: [-50, -40], dy: 40 }) },
        { at: 'hit', ease: 'linear', pose: K({ torso: 30, a1: [-40, -30], a2: [40, 50], l1: [86, -4], l2: [-70, -64], dy: 52 }) },
        { at: 'follow', ease: 'outQuad', pose: K({ torso: 30, a1: [-40, -30], a2: [40, 50], l1: [84, -6], l2: [-70, -64], dy: 52 }) },
      ],
    },
    thrust: {
      keys: [
        { at: 'wind', ease: 'outCubic', pose: K({ torso: -10, a1: [-24, 120], a2: [40, 150], l1: [14, -16], l2: [-26, -8], dy: 10 }) },
        { at: 'hit', ease: 'linear', pose: K({ torso: 30, head: 6, a1: [90, 90], a2: [10, 60], l1: [58, -48], l2: [-52, -12], dy: 26 }) },
        { at: 'follow', ease: 'outQuad', pose: K({ torso: 30, head: 6, a1: [90, 90], a2: [10, 60], l1: [58, -48], l2: [-52, -12], dy: 26 }) },
      ],
    },
    air1: {
      keys: [
        { at: 'wind', ease: 'outCubic', pose: K({ torso: -10, a1: [60, 150], a2: [40, 140], l1: [60, -120], l2: [30, -90] }) },
        { at: 'hit', ease: 'linear', pose: K({ torso: -24, a1: [140, 150], a2: [-40, -20], l1: [98, -2], l2: [-24, -60] }) },
        { at: 'follow', ease: 'outQuad', pose: K({ torso: -22, a1: [140, 150], a2: [-40, -20], l1: [96, -4], l2: [-24, -60] }) },
      ],
    },
    air2: {
      keys: [
        { at: 'wind', ease: 'outCubic', pose: K({ torso: 4, a1: [20, 140], a2: [40, 150], l1: [70, -110], l2: [40, -100] }) },
        { at: 'hit', ease: 'linear', pose: K({ torso: 22, a1: [96, 96], a2: [30, 140], l1: [50, -90], l2: [20, -80] }) },
        { at: 'follow', ease: 'outQuad', pose: K({ torso: 22, a1: [94, 96], a2: [30, 140], l1: [50, -90], l2: [20, -80] }) },
      ],
    },
    airSlam: {
      keys: [
        { at: 'wind', ease: 'outCubic', pose: K({ torso: -20, head: -10, a1: [140, 160], a2: [-60, -40], l1: [168, -10], l2: [-10, -20], spin: -10 }) },
        { at: 'hit', ease: 'linear', pose: K({ torso: 24, head: 10, a1: [120, 140], a2: [-40, -20], l1: [14, -4], l2: [-30, -40] }) },
        { at: 'follow', ease: 'outQuad', pose: K({ torso: 26, head: 10, a1: [120, 140], a2: [-40, -20], l1: [12, -4], l2: [-30, -40] }) },
      ],
    },
    throw: {
      keys: [
        { at: 'wind', ease: 'outCubic', pose: K({ torso: 18, a1: [96, 100], a2: [88, 92], l1: [36, -34], l2: [-30, -8], dy: 12 }) },
        { at: 'hit', ease: 'linear', pose: K({ torso: 12, a1: [104, 124], a2: [98, 116], l1: [32, -30], l2: [-28, -8], dy: 10 }) },
        { at: 'follow', ease: 'outQuad', pose: K({ torso: 10, a1: [100, 124], a2: [96, 116], l1: [30, -28], l2: [-28, -8], dy: 10 }) },
      ],
    },
  };
}

const ATTACKS: Record<ClipSet, Record<MoveName, Clip>> = {
  blade: bladeClips('blade'),
  heavy: bladeClips('heavy'),
  pole: bladeClips('pole'),
  dual: bladeClips('dual'),
  fist: fistClips(),
};

/* ======================================================================== */
/* State poses (procedurally layered by the animator)                       */
/* ======================================================================== */

export const POSES = {
  run: K({ torso: 30, head: -14, a1: [-40, -10], a2: [40, 110], w: 100, w2: 100, dy: 4 }),
  runFist: K({ torso: 30, head: -14, a1: [-30, 70], a2: [30, 120], dy: 4 }),
  dash: K({ torso: 46, head: -24, a1: [-60, -40], a2: [-40, -10], w: 80, w2: 80, l1: [62, -92], l2: [-62, -10], dy: 8 }),
  backdash: K({ torso: -24, head: 8, a1: [70, 110], a2: [50, 100], w: 150, w2: 150, l1: [36, -10], l2: [10, -40], dy: 6 }),
  airUp: K({ torso: 4, head: -10, a1: [120, 150], a2: [60, 100], w: 170, w2: 160, l1: [66, -86], l2: [22, -76] }),
  airDown: K({ torso: 8, head: 4, a1: [100, 120], a2: [-60, -30], w: 140, w2: 60, l1: [24, -26], l2: [-18, -14] }),
  airdash: K({ torso: 72, head: -40, a1: [-40, -30], a2: [-30, -10], w: 70, w2: 70, l1: [-26, -24], l2: [-48, -10] }),
  land: K({ torso: 26, head: 6, l1: [52, -96], l2: [-30, -62], dy: 26 }),
  crouch: K({ torso: 16, l1: [60, -110], l2: [-40, -60], dy: 30 }),
  blockBlade: K({ torso: -4, head: 2, a1: [76, 150], a2: [56, 140], w: 178, w2: 178, l1: [28, -30], l2: [-28, -10], dy: 10 }),
  blockPole: K({ torso: -4, head: 2, a1: [100, 150], a2: [60, 100], w: 175, w2: 175, l1: [28, -30], l2: [-28, -10], dy: 10 }),
  blockFist: K({ torso: 6, head: 10, a1: [68, 172], a2: [58, 176], l1: [24, -26], l2: [-24, -10], dy: 10 }),
  crouchBlock: K({ torso: 12, head: 6, a1: [70, 130], a2: [50, 130], w: 170, w2: 170, l1: [62, -112], l2: [-40, -62], dy: 32 }),
  parry: K({ torso: 6, head: -4, a1: [118, 140], a2: [40, 100], w: 120, w2: 120, l1: [30, -30], l2: [-28, -10], dy: 10 }),
  dodge: K({ torso: -28, head: -8, a1: [40, 90], a2: [-40, -20], w: 120, w2: 120, l1: [30, -20], l2: [-30, -30], dy: 8 }),
  roll: K({ torso: 40, head: 30, a1: [60, 160], a2: [60, 160], w: 200, w2: 200, l1: [90, -140], l2: [80, -140], dy: 30 }),
  hitLight: K({ torso: -14, head: -18, a1: [40, 60], a2: [-50, -30], w: 120, w2: 60, l1: [16, -18], l2: [-26, -12], dy: 6 }),
  hitHeavy: K({ torso: -28, head: -32, a1: [140, 160], a2: [-130, -110], w: 190, w2: -100, l1: [26, -30], l2: [-30, -24], dy: 10 }),
  hitLow: K({ torso: 34, head: 26, a1: [20, 60], a2: [10, 50], w: 100, w2: 100, l1: [24, -24], l2: [-20, -12], dy: 10 }),
  launched: K({ torso: -32, head: -26, a1: [150, 170], a2: [-140, -120], w: 200, w2: -110, l1: [30, -64], l2: [-20, -44] }),
  knockdown: K({ torso: 0, head: -8, a1: [190, 200], a2: [170, 170], w: 200, w2: 180, l1: [6, -4], l2: [-4, -2], spin: -88, dy: 46 }),
  wallsplat: K({ torso: -12, head: -20, a1: [130, 150], a2: [-130, -150], w: 160, w2: -160, l1: [26, -10], l2: [-26, -10] }),
  stagger: K({ torso: -22, head: -24, a1: [200, 225], a2: [-150, -170], w: 240, w2: -150, l1: [36, -20], l2: [-20, -30], dy: 8 }),
  charge: K({ torso: 6, head: -22, a1: [-22, -40], a2: [22, 40], w: -70, w2: 60, l1: [32, -24], l2: [-32, -24], dy: 18 }),
  burst: K({ torso: -16, head: -32, a1: [120, 130], a2: [-120, -130], w: 140, w2: -140, l1: [24, -6], l2: [-24, -6], dy: -2 }),
  appear: K({ torso: 26, head: -6, a1: [70, 120], a2: [-30, -10], w: 140, w2: 60, l1: [52, -100], l2: [-34, -50], dy: 26 }),
  bound: K({ torso: 4, head: 24, a1: [6, 0], a2: [-6, 0], w: 60, w2: 60, l1: [4, -2], l2: [-4, -2], dy: 0 }),
  vanish: K({ torso: 30, l1: [50, -90], l2: [-34, -40], dy: 22 }),
  suspended: K({ torso: -18, head: 30, a1: [-10, -20], a2: [10, 0], w: 30, w2: 30, l1: [10, -20], l2: [-6, -30] }),
};

/* ======================================================================== */
/* Ability archetypes                                                       */
/* ======================================================================== */

type Arch =
  | 'castForward' | 'castUp' | 'castDown' | 'beam' | 'stance' | 'guard' | 'ward' | 'dashSlash' | 'vanish' | 'leap'
  | 'point' | 'clock' | 'rewind' | 'meditate' | 'transform' | 'supernova' | 'slashWave' | 'spin' | 'twoHandUp';

const ARCH: Record<Arch, Clip> = {
  castForward: {
    keys: [
      { at: 'wind', ease: 'outCubic', pose: K({ torso: -8, a1: [-30, 80], a2: [30, 150], w: 150, w2: 160, l1: [26, -24], l2: [-28, -10], dy: 10 }) },
      { at: 'hit', ease: 'linear', pose: K({ torso: 16, a1: [90, 92], a2: [-30, -10], w: 160, w2: 60, l1: [40, -34], l2: [-34, -8], dy: 14 }) },
      { at: 'follow', ease: 'outQuad', pose: K({ torso: 16, a1: [92, 94], a2: [-30, -10], w: 160, w2: 60, l1: [40, -34], l2: [-34, -8], dy: 14 }) },
    ],
  },
  castUp: {
    keys: [
      { at: 'wind', ease: 'outCubic', pose: K({ torso: 10, head: 10, a1: [40, 100], a2: [-20, 0], w: 150, w2: 60, l1: [28, -30], l2: [-28, -10], dy: 14 }) },
      { at: 'hit', ease: 'linear', pose: K({ torso: -10, head: -34, a1: [182, 186], a2: [-40, -30], w: 190, w2: 40, l1: [18, -10], l2: [-20, -6], dy: 2 }) },
      { at: 'follow', ease: 'outQuad', pose: K({ torso: -10, head: -34, a1: [184, 188], a2: [-40, -30], w: 190, w2: 40, l1: [18, -10], l2: [-20, -6], dy: 2 }) },
    ],
  },
  castDown: {
    keys: [
      { at: 'wind', ease: 'outCubic', pose: K({ torso: -10, head: -16, a1: [200, 210], a2: [-60, -40], w: 220, w2: 40, l1: [22, -14], l2: [-26, -6], dy: 2 }) },
      { at: 'hit', ease: 'linear', pose: K({ torso: 52, head: 20, a1: [40, 10], a2: [-30, -20], w: 0, w2: 30, l1: [62, -110], l2: [-40, -60], dy: 34 }) },
      { at: 'follow', ease: 'outQuad', pose: K({ torso: 52, head: 20, a1: [40, 10], a2: [-30, -20], w: 0, w2: 30, l1: [62, -110], l2: [-40, -60], dy: 34 }) },
    ],
  },
  beam: {
    keys: [
      { at: 'start', ease: 'outCubic', pose: K({ torso: -10, head: 0, a1: [-34, 64], a2: [-40, 60], w: 150, w2: 150, l1: [34, -30], l2: [-36, -14], dy: 16 }) },
      { at: 'wind', ease: 'inOutQuad', pose: K({ torso: -14, head: -4, a1: [-40, 60], a2: [-44, 56], w: 150, w2: 150, l1: [36, -32], l2: [-38, -14], dy: 18 }) },
      { at: 'hit', ease: 'linear', pose: K({ torso: 16, head: 4, a1: [88, 90], a2: [84, 88], w: 150, w2: 150, l1: [44, -40], l2: [-42, -10], dy: 18 }) },
      { at: 'follow', ease: 'linear', pose: K({ torso: 18, head: 4, a1: [88, 90], a2: [84, 88], w: 150, w2: 150, l1: [44, -40], l2: [-42, -10], dy: 18 }) },
    ],
    shake: 1.5,
  },
  stance: {
    keys: [
      { at: 'wind', ease: 'outCubic', pose: K({ torso: 26, head: 0, a1: [-6, 50], a2: [-30, 70], w: -100, w2: -100, l1: [50, -70], l2: [-40, -24], dy: 22 }) },
      { at: 'hit', ease: 'outQuad', pose: K({ torso: 28, head: 4, a1: [-8, 48], a2: [-30, 70], w: -102, w2: -100, l1: [52, -72], l2: [-42, -24], dy: 24 }) },
    ],
  },
  guard: {
    keys: [
      { at: 'wind', ease: 'outCubic', pose: K({ torso: 10, a1: [60, 160], a2: [50, 160], w: 170, w2: 170, l1: [26, -26], l2: [-26, -10], dy: 12 }) },
      { at: 'hit', ease: 'outBack', pose: K({ torso: -8, head: -16, a1: [110, 112], a2: [-110, -112], w: 120, w2: -120, l1: [30, -16], l2: [-30, -16], dy: 8 }) },
    ],
  },
  ward: {
    keys: [
      { at: 'wind', ease: 'outCubic', pose: K({ torso: -6, a1: [40, 140], a2: [30, 150], w: 170, w2: 170, l1: [26, -26], l2: [-26, -10], dy: 10 }) },
      { at: 'hit', ease: 'outBack', pose: K({ torso: 10, a1: [96, 100], a2: [70, 150], w: 170, w2: 170, l1: [34, -30], l2: [-30, -10], dy: 12 }) },
    ],
  },
  dashSlash: {
    keys: [
      { at: 'wind', ease: 'outCubic', pose: K({ torso: 36, head: -10, a1: [-20, 10], a2: [-30, 0], w: -80, w2: -80, l1: [56, -96], l2: [-46, -30], dy: 26 }) },
      { at: 'hit', ease: 'linear', pose: K({ torso: 50, head: -26, a1: [-60, -40], a2: [-50, -30], w: -100, w2: -100, l1: [60, -80], l2: [-60, -10], dy: 14 }) },
      { at: 'follow', ease: 'outQuad', pose: K({ torso: 20, head: -8, a1: [110, 120], a2: [-40, -20], w: 160, w2: 60, l1: [44, -40], l2: [-40, -10], dy: 16 }) },
    ],
  },
  vanish: { keys: [{ at: 'wind', ease: 'outCubic', pose: POSES.vanish }, { at: 'hit', pose: POSES.vanish }] },
  leap: {
    keys: [
      { at: 'start', ease: 'outCubic', pose: K({ torso: 30, a1: [-20, 10], a2: [-30, 0], w: 60, w2: 60, l1: [56, -100], l2: [-40, -60], dy: 32 }) },
      { at: 'wind', ease: 'outQuad', pose: K({ torso: -10, head: -20, a1: [190, 200], a2: [180, 190], w: 210, w2: 200, l1: [70, -110], l2: [40, -100] }) },
      { at: 'hit', ease: 'inQuad', pose: K({ torso: 30, head: 16, a1: [60, 30], a2: [50, 20], w: 10, w2: 10, l1: [40, -60], l2: [-20, -40] }) },
      { at: 'follow', ease: 'outQuad', pose: K({ torso: 50, head: 20, a1: [40, 10], a2: [30, 10], w: -10, w2: -10, l1: [62, -110], l2: [-40, -60], dy: 34 }) },
    ],
  },
  point: {
    keys: [
      { at: 'wind', ease: 'outCubic', pose: K({ torso: 6, head: -10, a1: [40, 110], a2: [-20, 0], w: 150, w2: 50, l1: [26, -26], l2: [-26, -10], dy: 10 }) },
      { at: 'hit', ease: 'outBack', pose: K({ torso: -6, head: -30, a1: [150, 152], a2: [-30, -20], w: 160, w2: 40, l1: [22, -14], l2: [-24, -8], dy: 4 }) },
    ],
  },
  clock: {
    keys: [
      { at: 'wind', ease: 'outCubic', pose: K({ torso: 14, head: 14, a1: [60, 150], a2: [20, 140], w: 170, w2: 160, l1: [28, -28], l2: [-28, -10], dy: 12 }) },
      { at: 'hit', ease: 'outBack', pose: K({ torso: -4, head: -10, a1: [100, 104], a2: [-60, -40], w: 170, w2: 40, l1: [30, -20], l2: [-30, -12], dy: 8 }) },
    ],
  },
  rewind: {
    keys: [
      { at: 'wind', ease: 'outCubic', pose: K({ torso: 4, head: 10, a1: [80, 190], a2: [80, 200], w: 220, w2: 220, l1: [20, -20], l2: [-20, -10], dy: 8 }) },
      { at: 'hit', ease: 'outQuad', pose: K({ torso: -10, head: -24, a1: [130, 150], a2: [-130, -150], w: 170, w2: -170, l1: [16, -8], l2: [-16, -8], dy: 0 }) },
    ],
  },
  meditate: {
    keys: [
      { at: 'wind', ease: 'outCubic', pose: K({ torso: 4, head: 16, a1: [60, 170], a2: [56, 172], w: 200, w2: 200, l1: [40, -80], l2: [-40, -80], dy: 28 }) },
      { at: 'hit', ease: 'outQuad', pose: K({ torso: -6, head: -20, a1: [120, 140], a2: [-120, -140], w: 160, w2: -160, l1: [22, -14], l2: [-22, -14], dy: 6 }) },
    ],
    shake: 0.6,
  },
  transform: {
    keys: [
      { at: 'start', ease: 'outCubic', pose: K({ torso: 34, head: 24, a1: [30, 130], a2: [30, 130], w: 160, w2: 160, l1: [40, -70], l2: [-40, -70], dy: 30 }) },
      { at: 'hit', ease: 'outBack', pose: K({ torso: -16, head: -40, a1: [-30, -60], a2: [30, 60], w: -90, w2: 90, l1: [34, -20], l2: [-34, -20], dy: 10 }) },
    ],
    shake: 2.4,
  },
  supernova: {
    keys: [
      { at: 'start', ease: 'outCubic', pose: K({ torso: 40, head: 30, a1: [60, 170], a2: [60, 170], w: 200, w2: 200, l1: [60, -110], l2: [40, -110], dy: 20 }) },
      { at: 'wind', ease: 'linear', pose: K({ torso: 44, head: 34, a1: [56, 172], a2: [56, 172], w: 200, w2: 200, l1: [64, -114], l2: [44, -114], dy: 22 }) },
      { at: 'hit', ease: 'outBack', pose: K({ torso: -18, head: -40, a1: [130, 130], a2: [-130, -130], w: 140, w2: -140, l1: [40, -6], l2: [-40, -6], dy: -6 }) },
    ],
    shake: 3,
  },
  slashWave: {
    keys: [
      { at: 'wind', ease: 'outCubic', pose: K({ torso: -10, a1: [205, 225], a2: [190, 215], w: 250, w2: 245, l1: [22, -20], l2: [-26, -8], dy: 6 }) },
      { at: 'hit', ease: 'linear', pose: K({ torso: 24, a1: [60, 50], a2: [56, 48], w: 40, w2: 40, l1: [44, -40], l2: [-38, -8], dy: 18 }) },
      { at: 'follow', ease: 'outQuad', pose: K({ torso: 26, a1: [40, 30], a2: [36, 28], w: 10, w2: 10, l1: [46, -42], l2: [-40, -10], dy: 20 }) },
    ],
  },
  spin: {
    keys: [
      { at: 'wind', ease: 'outCubic', pose: K({ torso: 10, a1: [90, 100], a2: [-90, -100], w: 100, w2: -100, l1: [30, -20], l2: [-30, -20], dy: 10, spin: 0 }) },
      { at: 'hit', ease: 'linear', pose: K({ torso: 10, a1: [90, 100], a2: [-90, -100], w: 100, w2: -100, l1: [30, -20], l2: [-30, -20], dy: 10, spin: 0 }) },
    ],
  },
  twoHandUp: {
    keys: [
      { at: 'wind', ease: 'outCubic', pose: K({ torso: 14, head: 10, a1: [20, 100], a2: [20, 100], w: 160, w2: 160, l1: [30, -36], l2: [-30, -20], dy: 18 }) },
      { at: 'hit', ease: 'outBack', pose: K({ torso: -12, head: -36, a1: [170, 175], a2: [190, 185], w: 180, w2: 180, l1: [26, -10], l2: [-26, -10], dy: 4 }) },
    ],
    shake: 1.2,
  },
};

const ABILITY_ARCH: Record<string, Arch> = {
  'ab.vanish': 'vanish', 'ab.flashCut': 'dashSlash', 'ab.voidGate': 'castForward', 'ab.galeAscent': 'twoHandUp', 'ab.mirage': 'vanish',
  'ab.barrage': 'castForward', 'ab.crescentWave': 'slashWave', 'ab.seekerOrbs': 'castUp', 'ab.starfall': 'point', 'ab.thunder': 'castUp',
  'ab.spikes': 'castDown', 'ab.gravityOrb': 'castForward', 'ab.beam': 'beam', 'ab.chains': 'castDown', 'ab.rend': 'castForward',
  'ab.titanSlam': 'leap', 'ab.bladeStorm': 'twoHandUp', 'ab.chronoStop': 'clock', 'ab.aegis': 'guard', 'ab.mirrorWard': 'ward',
  'ab.counter': 'stance', 'ab.phase': 'vanish', 'ab.rewind': 'rewind', 'ab.secondWind': 'meditate', 'ab.ascension': 'transform',
  'ab.thousandCuts': 'dashSlash', 'ab.supernova': 'supernova', 'ab.lance': 'point', 'ab.blackHole': 'castForward', 'ab.colossus': 'slashWave',
  'ab.cataclysm': 'castUp', 'u.kiblast': 'castForward', 'u.blitz': 'vanish',
};

/* ======================================================================== */
/* Tick-based sequence / finisher / victory clips                           */
/* ======================================================================== */

const hold = (pose: Partial<Pose>, shake = 0): Clip => ({ keys: [{ at: 0, pose }], shake });

const SEQ: Record<string, Clip> = {
  idle: hold({}),
  dead: hold(POSES.knockdown),
  'lock.push': hold(K({ torso: 36, head: -6, a1: [100, 128], a2: [80, 120], w: 150, w2: 150, l1: [46, -54], l2: [-48, -10], dy: 20 }), 1.6),
  'beam.struggle': hold(K({ torso: 20, head: 6, a1: [88, 90], a2: [84, 88], w: 150, w2: 150, l1: [48, -44], l2: [-46, -10], dy: 20 }), 2.2),
  'blitz.vanish': hold(POSES.airdash),
  'blitz.strike': { keys: [{ at: 0, pose: K({ torso: 10, a1: [200, 230], a2: [-30, -10], w: 250, w2: 40, l1: [60, -100], l2: [20, -80] }) }, { at: 3, ease: 'linear', pose: K({ torso: 30, a1: [92, 90], a2: [-40, -20], w: 88, w2: 30, l1: [40, -40], l2: [-30, -30] }) }] },
  'blitz.guard': hold(K({ torso: -16, head: 10, a1: [70, 172], a2: [60, 176], w: 178, w2: 178, l1: [50, -90], l2: [20, -80] })),
  'throw.grab': hold(K({ torso: 14, a1: [102, 118], a2: [96, 112], w: 210, l1: [32, -30], l2: [-28, -8], dy: 10 })),
  'throw.grabbed': hold(K({ torso: -20, head: -16, a1: [80, 100], a2: [60, 90], w: 150, w2: 150, l1: [20, -10], l2: [-10, -20], dy: 4 })),
  'throw.slam': { keys: [{ at: 0, pose: K({ torso: 0, a1: [170, 180], a2: [170, 180], w: 200, l1: [26, -20], l2: [-26, -10], dy: 6 }) }, { at: 14, ease: 'inQuad', pose: K({ torso: 50, a1: [40, 20], a2: [40, 20], w: 20, l1: [50, -80], l2: [-40, -40], dy: 30 }) }] },
  'throw.toss': { keys: [{ at: 0, pose: K({ torso: -20, a1: [40, 60], a2: [40, 60], w: 150, l1: [20, -20], l2: [-30, -10] }) }, { at: 12, ease: 'outQuad', pose: K({ torso: 30, a1: [140, 150], a2: [130, 140], w: 170, l1: [46, -40], l2: [-40, -8], dy: 14 }) }] },
  'throw.kick': { keys: [{ at: 0, pose: K({ torso: -10, a1: [70, 120], a2: [40, 120], w: 150, l1: [60, -120], l2: [-14, -8] }) }, { at: 10, ease: 'linear', pose: K({ torso: -26, a1: [120, 140], a2: [-50, -30], w: 160, l1: [100, -2], l2: [-12, -4] }) }] },
  'thrown.slam': hold(K({ torso: -30, head: -30, a1: [160, 180], a2: [-150, -170], w: 200, w2: -160, l1: [40, -60], l2: [-20, -50], spin: 140 })),
  'thrown.toss': hold(POSES.launched),
  'thrown.kick': hold(POSES.hitHeavy),
  'counter.ready': hold(K({ torso: 26, head: 0, a1: [-6, 50], a2: [-30, 70], w: -100, w2: -100, l1: [50, -70], l2: [-40, -24], dy: 22 })),
  'counter.vanish': hold(POSES.vanish),
  'counter.slash': hold(K({ torso: 20, head: -6, a1: [120, 126], a2: [-50, -30], w: 140, w2: 40, l1: [52, -46], l2: [-48, -10], dy: 22 })),
  'tc.flurry': hold(POSES.airdash),
  'tc.cut': { keys: [{ at: 0, pose: K({ torso: 30, a1: [-50, -30], a2: [-40, -20], w: -100, w2: -100, l1: [50, -80], l2: [-50, -20], dy: 10 }) }, { at: 2, ease: 'linear', pose: K({ torso: 20, a1: [110, 120], a2: [-40, -20], w: 150, w2: 40, l1: [44, -40], l2: [-40, -10], dy: 14 }) }] },
  'tc.sheath': { keys: [{ at: 0, pose: K({ torso: 16, head: 6, a1: [110, 120], a2: [-40, -20], w: 150, w2: 40, l1: [40, -40], l2: [-36, -10], dy: 14 }) }, { at: 12, ease: 'inOutQuad', pose: K({ torso: 4, head: 10, a1: [-10, 40], a2: [-20, 60], w: -100, w2: -100, l1: [24, -20], l2: [-24, -8], dy: 6 }) }] },
  'hit.suspended': hold(POSES.suspended, 1.2),
  'hit.light': hold(POSES.hitLight),
  transform: ARCH.transform,
  'laststand.kneel': hold(K({ torso: 30, head: 36, a1: [-10, -16], a2: [10, 0], w: 40, w2: 40, l1: [90, -96], l2: [-6, -110], dy: 40 }), 0.8),
  'laststand.rise': { keys: [{ at: 0, pose: K({ torso: 30, head: 30, a1: [-10, -16], a2: [10, 0], w: 40, w2: 40, l1: [90, -96], l2: [-6, -110], dy: 40 }) }, { at: 18, ease: 'outBack', pose: K({ torso: -14, head: -36, a1: [-30, -60], a2: [30, 60], w: -90, w2: 90, l1: [30, -20], l2: [-30, -20], dy: 10 }) }], shake: 1.8 },
  'final.charge': { keys: [{ at: 0, pose: POSES.charge }], shake: 2 },
  'final.dash': hold(POSES.dash),
  // Finisher — victor
  'fin.stand': hold({}),
  'fin.sheathReady': hold(K({ torso: 24, head: 0, a1: [-6, 50], a2: [-30, 70], w: -100, w2: -100, l1: [48, -66], l2: [-40, -24], dy: 20 })),
  'fin.slashThrough': { keys: [{ at: 0, pose: K({ torso: 46, a1: [-60, -40], a2: [-50, -30], w: -100, w2: -100, l1: [60, -80], l2: [-60, -10], dy: 14 }) }, { at: 4, ease: 'outQuad', pose: K({ torso: 22, head: -6, a1: [124, 130], a2: [-50, -30], w: 150, w2: 40, l1: [54, -48], l2: [-50, -10], dy: 24 }) }] },
  'fin.sheath': SEQ_SHEATH(),
  'fin.ready': hold(K({ torso: 14, head: 0, a1: [-8, 40], a2: [-30, 60], w: -110, w2: -110, l1: [40, -50], l2: [-36, -16], dy: 16 })),
  'fin.dash': hold(POSES.dash),
  'fin.afterSlash': hold(K({ torso: 22, head: -6, a1: [124, 130], a2: [-50, -30], w: 150, w2: 40, l1: [54, -48], l2: [-50, -10], dy: 24 })),
  'fin.uppercut': { keys: [{ at: 0, pose: K({ torso: 26, a1: [10, 2], a2: [0, 0], w: -45, w2: -45, l1: [52, -86], l2: [-36, -30], dy: 26 }) }, { at: 3, ease: 'linear', pose: K({ torso: -8, head: -18, a1: [178, 180], a2: [168, 172], w: 186, w2: 180, l1: [14, -6], l2: [-14, -4], dy: -6 }) }] },
  'fin.slamDown': hold(K({ torso: 26, head: 14, a1: [34, 20], a2: [30, 18], w: -2, w2: -2, l1: [-12, -12], l2: [14, -30] })),
  'fin.landCrouch': hold(K({ torso: 40, head: 16, a1: [30, 10], a2: [-30, -10], w: -10, w2: 40, l1: [62, -114], l2: [-40, -62], dy: 34 })),
  'fin.grab': hold(K({ torso: 14, a1: [102, 118], a2: [96, 112], w: 210, l1: [32, -30], l2: [-28, -8], dy: 10 })),
  'fin.punch': { keys: [{ at: 0, pose: K({ torso: 6, a1: [30, 150], a2: [96, 110], l1: [24, -24], l2: [-24, -8] }) }, { at: 3, ease: 'linear', pose: K({ torso: 20, a1: [92, 92], a2: [96, 110], l1: [36, -30], l2: [-30, -8], dy: 10 }) }] },
  'fin.punch2': { keys: [{ at: 0, pose: K({ torso: 6, a1: [96, 110], a2: [10, 130], l1: [24, -24], l2: [-24, -8] }) }, { at: 3, ease: 'linear', pose: K({ torso: 26, a1: [96, 110], a2: [94, 94], l1: [38, -34], l2: [-34, -6], dy: 12 }) }] },
  'fin.liftSlam': { keys: [{ at: 0, pose: K({ torso: 0, a1: [170, 180], a2: [170, 180], w: 200, l1: [26, -20], l2: [-26, -10], dy: 6 }) }, { at: 14, ease: 'inQuad', pose: K({ torso: 50, a1: [40, 20], a2: [40, 20], w: 20, l1: [50, -80], l2: [-40, -40], dy: 30 }) }] },
  'fin.slamFollow': hold(K({ torso: 46, head: 16, a1: [40, 20], a2: [36, 20], w: 10, w2: 10, l1: [54, -96], l2: [-40, -50], dy: 30 })),
  'fin.palmCharge': { keys: [{ at: 0, pose: K({ torso: -14, head: -4, a1: [-40, 60], a2: [-44, 56], w: 150, w2: 150, l1: [36, -32], l2: [-38, -14], dy: 18 }) }], shake: 1.8 },
  'fin.beam': hold(K({ torso: 18, head: 4, a1: [88, 90], a2: [84, 88], w: 150, w2: 150, l1: [46, -42], l2: [-44, -10], dy: 18 }), 2.4),
  'fin.beamEnd': hold(K({ torso: 10, head: 6, a1: [80, 86], a2: [60, 80], w: 150, w2: 150, l1: [40, -36], l2: [-40, -10], dy: 14 })),
  'fin.raise': hold(K({ torso: -10, head: -34, a1: [182, 186], a2: [-40, -30], w: 190, w2: 40, l1: [18, -10], l2: [-20, -6], dy: 2 }), 0.8),
  'fin.clench': hold(K({ torso: 8, head: -6, a1: [96, 140], a2: [-40, -20], w: 170, w2: 40, l1: [28, -24], l2: [-28, -10], dy: 10 }), 1.4),
  'fin.throwUp': { keys: [{ at: 0, pose: K({ torso: 26, a1: [10, 2], a2: [0, 0], w: -45, w2: -45, l1: [52, -86], l2: [-36, -30], dy: 26 }) }, { at: 4, ease: 'linear', pose: K({ torso: -10, head: -24, a1: [176, 180], a2: [170, 176], w: 186, w2: 180, l1: [14, -6], l2: [-14, -4], dy: -6 }) }] },
  'fin.point': hold(K({ torso: -6, head: -30, a1: [150, 152], a2: [-30, -20], w: 160, w2: 40, l1: [22, -14], l2: [-24, -8], dy: 4 })),
  'fin.clockRaise': hold(K({ torso: -4, head: -10, a1: [100, 104], a2: [-60, -40], w: 170, w2: 40, l1: [30, -20], l2: [-30, -12], dy: 8 })),
  'fin.walk': hold({}),
  'fin.slash': { keys: [{ at: 0, pose: K({ torso: -8, a1: [205, 232], a2: [190, 230], w: 250, l1: [20, -22], l2: [-24, -8], dy: 8 }) }, { at: 2, ease: 'linear', pose: K({ torso: 18, a1: [95, 90], a2: [70, 84], w: 92, l1: [40, -32], l2: [-34, -6], dy: 15 }) }] },
  'fin.slash2': { keys: [{ at: 0, pose: K({ torso: 16, a1: [20, 14], a2: [10, 20], w: -40, l1: [30, -30], l2: [-26, -8], dy: 12 }) }, { at: 2, ease: 'linear', pose: K({ torso: 2, a1: [125, 128], a2: [100, 110], w: 118, l1: [40, -32], l2: [-34, -6], dy: 15 }) }] },
  'fin.stomp': { keys: [{ at: 0, pose: K({ torso: -10, a1: [60, 150], a2: [40, 150], w: 170, l1: [80, -110], l2: [-10, -10] }) }, { at: 6, ease: 'inQuad', pose: K({ torso: 20, a1: [40, 120], a2: [-40, -20], w: 160, l1: [30, -20], l2: [-30, -20], dy: 18 }) }] },
  'fin.heavySwing': { keys: [{ at: 0, pose: K({ torso: -16, a1: [205, 215], a2: [198, 212], w: 260, w2: 255, l1: [24, -20], l2: [-26, -6], dy: 3 }) }, { at: 3, ease: 'linear', pose: K({ torso: 30, a1: [80, 72], a2: [74, 70], w: 62, w2: 62, l1: [44, -40], l2: [-38, -8], dy: 18 }) }] },
  'fin.thrust': { keys: [{ at: 0, pose: K({ torso: -12, a1: [-36, 70], a2: [-50, 40], w: 92, w2: 92, l1: [14, -16], l2: [-26, -8], dy: 10 }) }, { at: 4, ease: 'linear', pose: K({ torso: 28, a1: [92, 92], a2: [40, 30], w: 90, w2: 50, l1: [56, -46], l2: [-50, -12], dy: 25 }) }] },
  'fin.throwSpin': { keys: [{ at: 0, pose: K({ torso: 10, a1: [120, 130], a2: [110, 120], w: 200, l1: [30, -20], l2: [-30, -20], dy: 10, spin: 0 }) }, { at: 28, ease: 'inQuad', pose: K({ torso: 40, a1: [50, 30], a2: [40, 30], w: 30, l1: [50, -80], l2: [-40, -40], dy: 28, spin: 0 }) }] },
  'fin.palmStrike': hold(K({ torso: 20, a1: [90, 92], a2: [-30, -10], w: 160, w2: 60, l1: [44, -36], l2: [-38, -8], dy: 16 })),
  // Finisher — defeated
  'fin.stagger': hold(POSES.stagger, 0.6),
  'fin.launched': hold(POSES.launched),
  'fin.crumple': hold(POSES.knockdown),
  'fin.suspended': hold(POSES.suspended, 0.8),
  'fin.frozen': hold(POSES.stagger),
  'fin.kneel': hold(K({ torso: 26, head: 36, a1: [-10, -16], a2: [10, 0], w: 40, w2: 40, l1: [90, -96], l2: [-6, -110], dy: 40 })),
  'fin.collapse': { keys: [{ at: 0, pose: K({ torso: 26, head: 30, a1: [-10, -16], a2: [10, 0], w: 40, w2: 40, l1: [90, -96], l2: [-6, -110], dy: 40 }) }, { at: 22, ease: 'inQuad', pose: K({ torso: 0, head: 10, a1: [170, 180], a2: [160, 170], w: 190, w2: 180, l1: [4, -4], l2: [-4, -2], spin: 88, dy: 46 }) }] },
  'fin.wallStuck': hold(POSES.wallsplat, 0.5),
  'fin.grabbed': hold(K({ torso: -20, head: -16, a1: [80, 100], a2: [60, 90], w: 150, w2: 150, l1: [20, -10], l2: [-10, -20], dy: 4 })),
  'fin.dissolve': hold(K({ torso: 24, head: 30, a1: [-10, -16], a2: [10, 0], w: 40, w2: 40, l1: [80, -90], l2: [-6, -100], dy: 36 })),
  // Victory poses (by personality)
  'victory.berserker': { keys: [{ at: 0, pose: K({ torso: -14, head: -36, a1: [160, 170], a2: [-160, -170], w: 175, w2: -170, l1: [34, -20], l2: [-34, -20], dy: 8 }) }], shake: 1.2 },
  'victory.duelist': hold(K({ torso: 0, head: -4, a1: [60, 170], a2: [-10, 20], w: 180, w2: 60, l1: [12, -6], l2: [-12, -4], dy: 2 })),
  'victory.trickster': hold(K({ torso: -8, head: -10, a1: [140, 200], a2: [-20, 60], w: 260, w2: 80, l1: [24, -10], l2: [-2, -40], dy: 4 })),
  'victory.tactician': hold(K({ torso: 2, head: 6, a1: [70, 190], a2: [66, 196], w: 240, w2: 240, l1: [10, -4], l2: [-10, -4], dy: 1 })),
  'victory.sentinel': hold(K({ torso: 0, head: -6, a1: [40, 60], a2: [30, 60], w: 0, w2: 0, l1: [14, -6], l2: [-14, -6], dy: 2 })),
  'victory.zealot': hold(K({ torso: -8, head: -36, a1: [178, 182], a2: [-40, -20], w: 190, w2: 40, l1: [16, -8], l2: [-16, -8], dy: 2 }), 0.6),
};

function SEQ_SHEATH(): Clip {
  return {
    keys: [
      { at: 0, pose: K({ torso: 16, head: 6, a1: [124, 130], a2: [-50, -30], w: 150, w2: 40, l1: [50, -44], l2: [-46, -10], dy: 20 }) },
      { at: 16, ease: 'inOutQuad', pose: K({ torso: 4, head: 12, a1: [-10, 40], a2: [-20, 60], w: -100, w2: -100, l1: [24, -20], l2: [-24, -8], dy: 6 }) },
    ],
  };
}

/* ======================================================================== */
/* Lookup                                                                   */
/* ======================================================================== */

/** Returns the action clip for a sim action clip id (e.g. "blade.light1", "ab.beam", "u.kiblast"). */
export function actionClip(id: string, set: ClipSet): Clip | null {
  const dot = id.indexOf('.');
  const head = id.slice(0, dot);
  const tail = id.slice(dot + 1);
  if (head in ATTACKS) {
    const table = ATTACKS[head as ClipSet] ?? ATTACKS[set];
    return (table as Record<string, Clip>)[tail] ?? null;
  }
  const arch = ABILITY_ARCH[id];
  if (arch) return ARCH[arch];
  return null;
}

/** Tick-based sequence clip. */
export function seqClip(id: string, set: ClipSet): Clip | null {
  if (SEQ[id]) return SEQ[id];
  // Sequences can also reference action clips (e.g. counter freezes the attacker mid-swing).
  const a = actionClip(id, set);
  if (a) return { keys: a.keys.map((k, i) => ({ at: i * 4, pose: k.pose, ease: k.ease })) };
  return null;
}
