import { Clip, P, Pose, mirror, over } from './Anim';

const ik = (p: Pose, k: Pose['ik']): Pose => ({ ...p, ik: k });

/*
 * Pose conventions (degrees, Euler XYZ, bind = arms and legs hanging straight down, facing +Z, left = +X):
 *  limbs: X- swings forward, Z+ swings a left limb outward (Z- for right), Y twists
 *  elbows bend with fArm X-, knees with shin X+
 *  spine/chest/neck/head: X+ bends forward, Y+ turns left, Z+ leans right
 */

// ------------------------------------------------------------------ shared cycles
export function runCycle(ph: number, k = 1): Pose {
  const s = Math.sin(ph);
  const c = Math.cos(ph);
  const kneeL = 18 + 78 * Math.pow(Math.max(0, c), 1.2);
  const kneeR = 18 + 78 * Math.pow(Math.max(0, -c), 1.2);
  return P(
    {
      spine: [14 * k, -6 * s, 0],
      chest: [6 * k, -10 * s, 0],
      neck: [-8, 6 * s, 0],
      head: [-8, 4 * s, 0],
      thighL: [-48 * s - 12, 0, 3],
      shinL: [kneeL, 0, 0],
      footL: [-10 + 20 * Math.max(0, -s), 0, -3],
      thighR: [48 * s - 12, 0, -3],
      shinR: [kneeR, 0, 0],
      footR: [-10 + 20 * Math.max(0, s), 0, 3],
      uArmL: [42 * s, 0, 10],
      fArmL: [-88 - 10 * s, 0, 0],
      uArmR: [-42 * s, 0, -10],
      fArmR: [-88 + 10 * s, 0, 0],
      handL: [0, 0, -10],
      handR: [0, 0, 10],
    },
    [0, -0.07 + 0.04 * Math.abs(c), 0],
    ['fist', 'fist'],
  );
}

export function walkCycle(ph: number, swagger = 1): Pose {
  const s = Math.sin(ph);
  const c = Math.cos(ph);
  return P(
    {
      spine: [2, -4 * s * swagger, 0],
      chest: [-4, -6 * s * swagger, 2 * s],
      head: [2, 4 * s, -3],
      thighL: [-24 * s - 2, 0, 3],
      shinL: [6 + 32 * Math.max(0, c), 0, 0],
      footL: [-4 + 10 * Math.max(0, -s), 0, -3],
      thighR: [24 * s - 2, 0, -3],
      shinR: [6 + 32 * Math.max(0, -c), 0, 0],
      footR: [-4 + 10 * Math.max(0, s), 0, 3],
      uArmL: [14 * s, 0, 8],
      fArmL: [-14, 0, 0],
      uArmR: [-14 * s, 0, -8],
      fArmR: [-14, 0, 0],
    },
    [0, -0.015 + 0.012 * Math.abs(c), 0],
    ['relax', 'relax'],
  );
}

export function airPose(vy: number): Pose {
  const up = Math.max(0, Math.min(1, vy / 6));
  const dn = Math.max(0, Math.min(1, -vy / 10));
  return P(
    {
      spine: [6, 0, 0],
      chest: [4, 0, 0],
      head: [-6, 0, 0],
      thighL: [-38 * up - 12 * dn, 0, 8],
      shinL: [70 * up + 20 * dn, 0, 0],
      footL: [10, 0, -4],
      thighR: [-10 * up + 6 * dn, 0, -8],
      shinR: [40 * up + 12 * dn, 0, 0],
      footR: [16, 0, 4],
      uArmL: [-10 - 20 * dn, 0, 28 + 24 * dn],
      fArmL: [-40, 0, 0],
      uArmR: [-6 - 20 * dn, 0, -28 - 24 * dn],
      fArmR: [-40, 0, 0],
    },
    [0, 0, 0],
    ['open', 'open'],
  );
}

// ------------------------------------------------------------------ Sukuna
/** Arrogant, loose standing. */
export const SK_IDLE = P(
  {
    spine: [-3, 4, 0],
    chest: [-5, 4, -2],
    neck: [4, -6, 0],
    head: [4, -8, -6],
    uArmL: [4, -6, 9],
    fArmL: [-14, 0, 0],
    handL: [0, 0, -6],
    uArmR: [6, 6, -9],
    fArmR: [-18, 0, 0],
    handR: [0, 0, 6],
    thighL: [-3, -6, 6],
    shinL: [5, 0, 0],
    footL: [-2, 6, -6],
    thighR: [4, 8, -5],
    shinR: [4, 0, 0],
    footR: [-4, -8, 5],
  },
  [0, -0.012, 0],
  ['relax', 'relax'],
);

/** Ready to strike: low, weight forward, open hands. */
export const SK_GUARD = P(
  {
    spine: [10, -10, 0],
    chest: [8, -12, 0],
    neck: [-6, 10, 0],
    head: [-8, 12, 0],
    thighL: [-28, -10, 8],
    shinL: [34, 0, 0],
    footL: [-6, 10, -8],
    thighR: [18, 18, -8],
    shinR: [30, 0, 0],
    footR: [-40, -10, 8],
    uArmL: [-38, -10, 22],
    fArmL: [-70, -30, 0],
    handL: [0, 0, -15],
    uArmR: [-14, 10, -26],
    fArmR: [-88, 30, 0],
    handR: [0, 0, 10],
  },
  [0, -0.08, 0.02],
  ['open', 'claw'],
);

const strikeBase = SK_GUARD;

/** Right straight punch (palm down at contact). */
export const SK_JAB: Clip = {
  name: 'jab',
  fadeIn: 0.04,
  fadeOut: 0.12,
  events: [[0.11, 'hit']],
  keys: [
    { t: 0, p: strikeBase },
    { t: 0.06, e: 'out', p: ik(over(strikeBase, P({ chest: [6, -26, 0], uArmR: [20, 0, -34], fArmR: [-118, 20, 0], spine: [8, -14, 0] }, [0, -0.08, -0.02], ['open', 'fist'])), { R: [-0.12, 1.36, 0.12], Rf: [0, 0.3, 1], Rp: [1, 0, 0] }) },
    {
      t: 0.11,
      e: 'snap',
      p: ik(over(strikeBase, P({ spine: [6, 12, 0], chest: [4, 16, 0], head: [-8, -14, 0], uArmR: [-86, 0, -6], fArmR: [-4, 80, 0], handR: [0, 0, 0], uArmL: [-20, 0, 30], fArmL: [-100, -30, 0] }, [0, -0.1, 0.16], ['fist', 'fist'])), { R: [-0.03, 1.38, 0.62], Rf: [0, 0, 1], Rp: [0, -1, 0], L: [0.14, 1.36, 0.1], Lf: [0, 0.6, 0.6], Lp: [-1, 0, 0] }),
    },
    { t: 0.3, e: 'io', p: strikeBase },
  ],
};

/** Left hook. */
export const SK_HOOK: Clip = {
  name: 'hook',
  fadeIn: 0.05,
  events: [[0.14, 'hit']],
  keys: [
    { t: 0, p: strikeBase },
    { t: 0.08, e: 'out', p: over(strikeBase, P({ chest: [4, 30, 0], spine: [8, 18, 0], uArmL: [-10, 30, 70], fArmL: [-95, 0, 0] }, [0, -0.1, 0], ['fist', 'claw'])) },
    { t: 0.14, e: 'snap', p: ik(over(strikeBase, P({ chest: [8, -34, 0], spine: [12, -20, 0], head: [-6, 20, 0], uArmL: [-8, -62, 84], fArmL: [-92, 0, 0], handL: [0, 0, 0] }, [0, -0.12, 0.12], ['fist', 'claw'])), { L: [-0.02, 1.36, 0.42], Lf: [-0.6, 0, 0.8], Lp: [0, -1, 0] }) },
    { t: 0.36, e: 'io', p: strikeBase },
  ],
};

/** Rising uppercut that launches. */
export const SK_UPPER: Clip = {
  name: 'upper',
  fadeIn: 0.05,
  events: [[0.16, 'hit']],
  keys: [
    { t: 0, p: strikeBase },
    { t: 0.09, e: 'out', p: over(strikeBase, P({ spine: [24, -10, 0], chest: [14, -20, 0], uArmR: [10, 0, -20], fArmR: [-110, 0, 0], thighL: [-50, 0, 8], shinL: [70, 0, 0], thighR: [30, 0, -8], shinR: [60, 0, 0] }, [0, -0.25, 0], ['open', 'fist'])) },
    { t: 0.16, e: 'snap', p: ik(over(strikeBase, P({ spine: [-14, 16, 0], chest: [-16, 20, 0], head: [-20, -10, 0], uArmR: [-160, 0, -14], fArmR: [-30, 0, 0], thighL: [-20, 0, 8], shinL: [10, 0, 0], thighR: [20, 0, -6], shinR: [10, 0, 0] }, [0, 0.04, 0.1], ['open', 'fist'])), { R: [-0.04, 1.82, 0.26], Rf: [0, 1, 0.2], Rp: [0, 0, -1] }) },
    { t: 0.42, e: 'io', p: strikeBase },
  ],
};

/** Spinning roundhouse with the right leg. */
export const SK_KICK: Clip = {
  name: 'kick',
  fadeIn: 0.06,
  events: [[0.2, 'hit']],
  keys: [
    { t: 0, p: strikeBase },
    { t: 0.1, e: 'out', p: P({ spine: [0, -40, 10], chest: [0, -30, 10], head: [0, 50, 0], thighL: [-6, 30, 4], shinL: [16, 0, 0], thighR: [-40, 30, -40], shinR: [100, 0, 0], uArmL: [-20, 0, 50], fArmL: [-60, 0, 0], uArmR: [0, 0, -60], fArmR: [-50, 0, 0] }, [0, -0.04, 0], ['fist', 'fist']) },
    { t: 0.2, e: 'snap', p: P({ spine: [-10, 40, 28], chest: [-8, 30, 12], head: [8, -40, -10], thighL: [-4, 40, 10], shinL: [10, 0, 0], footL: [0, 0, 0], thighR: [-30, -20, -88], shinR: [8, 0, 0], footR: [30, 0, 0], uArmL: [10, 0, 70], fArmL: [-40, 0, 0], uArmR: [-10, 0, -40], fArmR: [-80, 0, 0] }, [0.06, 0.02, 0], ['fist', 'fist']) },
    { t: 0.44, e: 'io', p: strikeBase },
  ],
};

/** Overhead heel drop. */
export const SK_AXE: Clip = {
  name: 'axe',
  fadeIn: 0.06,
  events: [[0.26, 'hit']],
  keys: [
    { t: 0, p: strikeBase },
    { t: 0.16, e: 'out', p: P({ spine: [-14, 0, 0], chest: [-10, 0, 0], head: [10, 0, 0], thighL: [-6, 0, 6], shinL: [12, 0, 0], thighR: [-150, 0, -10], shinR: [6, 0, 0], footR: [-20, 0, 0], uArmL: [10, 0, 50], fArmL: [-30, 0, 0], uArmR: [10, 0, -50], fArmR: [-30, 0, 0] }, [0, 0.02, -0.04], ['open', 'open']) },
    { t: 0.26, e: 'snap', p: P({ spine: [30, 0, 0], chest: [18, 0, 0], head: [-20, 0, 0], thighL: [20, 0, 6], shinL: [60, 0, 0], thighR: [-70, 0, -6], shinR: [4, 0, 0], uArmL: [-20, 0, 40], fArmL: [-60, 0, 0], uArmR: [-20, 0, -40], fArmR: [-60, 0, 0] }, [0, -0.32, 0.14], ['open', 'open']) },
    { t: 0.55, e: 'io', p: strikeBase },
  ],
};

/** Dismantle: a flat knife-hand swipe (right), the slash flies off the fingertips. */
export const SK_DISMANTLE: Clip = {
  name: 'dismantle',
  upper: true,
  fadeIn: 0.04,
  fadeOut: 0.15,
  events: [[0.1, 'release']],
  keys: [
    { t: 0, p: SK_IDLE },
    { t: 0.06, e: 'out', p: ik(over(SK_IDLE, P({ chest: [0, 30, 0], spine: [0, 14, 0], uArmR: [-80, -70, -70], fArmR: [-50, 0, 0], handR: [0, 0, 0] }, undefined, ['relax', 'blade'])), { R: [0.26, 1.4, 0.34], Rf: [1, 0.1, 0.3], Rp: [0, -1, 0] }) },
    { t: 0.1, e: 'snap', p: ik(over(SK_IDLE, P({ chest: [0, -26, 0], spine: [0, -12, 0], head: [0, 14, 0], uArmR: [-86, 40, -78], fArmR: [-6, 0, 0], handR: [0, 0, 0] }, undefined, ['relax', 'blade'])), { R: [-0.56, 1.38, 0.24], Rf: [-1, 0, 0.25], Rp: [0, -1, 0] }) },
    { t: 0.32, e: 'io', p: SK_IDLE },
  ],
};

/** Dismantle volley: both hands alternate. */
export const SK_DISMANTLE_L: Clip = {
  name: 'dismantleL',
  upper: true,
  fadeIn: 0.04,
  events: [[0.1, 'release']],
  keys: SK_DISMANTLE.keys.map((k) => ({ ...k, p: mirror(k.p) })),
};

/** Cleave: palm thrust, fingers spread. */
export const SK_CLEAVE: Clip = {
  name: 'cleave',
  fadeIn: 0.05,
  events: [[0.16, 'hit']],
  keys: [
    { t: 0, p: strikeBase },
    { t: 0.08, e: 'out', p: over(strikeBase, P({ chest: [0, -20, 0], uArmR: [10, 0, -30], fArmR: [-120, 0, 0], handR: [0, 0, -40] }, [0, -0.1, -0.04], ['open', 'open'])) },
    { t: 0.16, e: 'snap', p: ik(over(strikeBase, P({ spine: [10, 14, 0], chest: [8, 14, 0], uArmR: [-84, 0, -2], fArmR: [-6, 0, 0], handR: [0, 0, -70] }, [0, -0.12, 0.2], ['open', 'open'])), { R: [-0.04, 1.42, 0.58], Rf: [0, 1, 0.15], Rp: [0, 0, 1] }) },
    { t: 0.5, e: 'io', p: strikeBase },
  ],
};

/** Fuga: the bow stance. Left arm out, right hand drawn back to the cheek. */
export const SK_FUGA_DRAW = P(
  {
    spine: [2, 60, 0],
    chest: [-4, 30, 0],
    neck: [0, -40, 0],
    head: [0, -46, 0],
    uArmL: [-6, 30, 88],
    fArmL: [-6, 0, 0],
    handL: [0, 0, 0],
    uArmR: [-10, 70, -86],
    fArmR: [-150, 0, 0],
    handR: [0, 0, 20],
    thighL: [-20, 40, 18],
    shinL: [20, 0, 0],
    footL: [-4, -30, -10],
    thighR: [10, 50, -20],
    shinR: [16, 0, 0],
    footR: [-10, -60, 10],
  },
  [0, -0.08, 0],
  ['fist', 'pinch'],
);
SK_FUGA_DRAW.ik = { L: [0.06, 1.52, 0.6], Lf: [0, 0.2, 1], Lp: [-1, 0, 0], R: [-0.13, 1.55, -0.02], Rf: [0.3, 0.2, 1], Rp: [-0.2, -1, 0] };
export const SK_FUGA: Clip = {
  name: 'fuga',
  fadeIn: 0.25,
  fadeOut: 0.3,
  events: [
    [0.3, 'flame'],
    [1.6, 'release'],
  ],
  keys: [
    { t: 0, p: SK_IDLE },
    { t: 0.45, e: 'io', p: SK_FUGA_DRAW },
    { t: 1.55, e: 'lin', p: over(SK_FUGA_DRAW, P({ fArmR: [-156, 0, 0], uArmR: [-10, 76, -86] })) },
    { t: 1.62, e: 'snap', p: over(SK_FUGA_DRAW, P({ uArmR: [-10, 30, -80], fArmR: [-40, 0, 0], handR: [0, 0, -20] }, undefined, ['fist', 'open'])) },
    { t: 2.1, e: 'io', p: SK_IDLE },
  ],
};

/** Malevolent Shrine: Enma-ten, hands joined before the chest. */
export const SK_SIGN = P(
  {
    spine: [4, 0, 0],
    chest: [2, 0, 0],
    head: [8, 0, 0],
    uArmL: [-30, 0, 16],
    fArmL: [-104, -50, 0],
    handL: [0, -20, -30],
    uArmR: [-30, 0, -16],
    fArmR: [-104, 50, 0],
    handR: [0, 20, 30],
    thighL: [-2, 0, 8],
    thighR: [2, 0, -8],
    footL: [0, 0, -8],
    footR: [0, 0, 8],
  },
  [0, -0.02, 0],
  ['mudra', 'mudra'],
);
SK_SIGN.ik = { L: [0.028, 1.26, 0.27], R: [-0.028, 1.26, 0.27], Lf: [0, 1, 0.1], Lp: [-1, 0, 0], Rf: [0, 1, 0.1], Rp: [1, 0, 0] };
export const SK_DOMAIN: Clip = {
  name: 'domain',
  fadeIn: 0.2,
  fadeOut: 0.4,
  events: [[0.5, 'sign']],
  keys: [
    { t: 0, p: SK_IDLE },
    { t: 0.5, e: 'io', p: SK_SIGN },
    { t: 2.4, e: 'lin', p: over(SK_SIGN, P({ head: [14, 0, 0] })) },
    { t: 2.9, e: 'io', p: SK_IDLE },
  ],
};

/** Hand over the face, head thrown back: the laugh. */
export const SK_LAUGH: Clip = {
  name: 'laugh',
  fadeIn: 0.2,
  fadeOut: 0.3,
  keys: [
    { t: 0, p: SK_IDLE },
    { t: 0.35, e: 'io', p: over(SK_IDLE, P({ spine: [-10, 0, 0], chest: [-14, 0, 4], neck: [-12, 0, 0], head: [-18, 10, 0], uArmR: [-140, 0, 10], fArmR: [-130, -40, 0], handR: [20, 0, 10] }, undefined, ['relax', 'open'])) },
    { t: 1.3, e: 'lin', p: over(SK_IDLE, P({ spine: [-12, 0, 0], chest: [-16, 0, 6], neck: [-14, 0, 0], head: [-22, 14, 0], uArmR: [-140, 0, 12], fArmR: [-128, -40, 0], handR: [20, 0, 10] }, undefined, ['relax', 'open'])) },
    { t: 1.7, e: 'io', p: SK_IDLE },
  ],
};

/** World-cutting chant: three signs, then the swing. */
export const SK_CHANT1 = ik(P({ spine: [4, 0, 0], uArmL: [-40, 0, 10], fArmL: [-110, -60, 0], uArmR: [-40, 0, -10], fArmR: [-110, 60, 0], head: [10, 0, 0] }, [0, -0.04, 0], ['fist', 'open']), { L: [0.03, 1.26, 0.28], R: [-0.03, 1.34, 0.27], Lf: [-1, 0, 0.2], Lp: [0, -1, 0], Rf: [0, 1, 0], Rp: [1, 0, 0] });
export const SK_CHANT2 = ik(P({ spine: [4, 0, 0], uArmL: [-60, 0, 30], fArmL: [-60, -40, 0], uArmR: [-60, 0, -30], fArmR: [-60, 40, 0], head: [4, 0, 0] }, [0, -0.06, 0], ['cross', 'cross']), { L: [0.05, 1.38, 0.3], R: [-0.05, 1.38, 0.3], Lf: [-0.4, 1, 0], Lp: [-0.3, 0, 1], Rf: [0.4, 1, 0], Rp: [0.3, 0, 1] });
export const SK_CHANT3 = ik(P({ spine: [-4, 0, 0], uArmL: [-150, 0, 20], fArmL: [-20, 0, 0], uArmR: [-30, 0, -10], fArmR: [-100, 50, 0], head: [-10, 0, 0] }, [0, -0.02, 0], ['blade', 'point']), { R: [-0.08, 1.64, 0.3], Rf: [0, 1, 0], Rp: [0, 0, -1] });
export const SK_WCS: Clip = {
  name: 'wcs',
  fadeIn: 0.15,
  fadeOut: 0.3,
  events: [
    [0.6, 'chant1'],
    [1.5, 'chant2'],
    [2.4, 'chant3'],
    [3.3, 'release'],
  ],
  keys: [
    { t: 0, p: SK_IDLE },
    { t: 0.5, e: 'io', p: over(SK_IDLE, SK_CHANT1) },
    { t: 1.4, e: 'io', p: over(SK_IDLE, SK_CHANT2) },
    { t: 2.3, e: 'io', p: over(SK_IDLE, SK_CHANT3) },
    { t: 3.1, e: 'in', p: over(SK_IDLE, P({ spine: [0, 40, 0], chest: [0, 30, 0], uArmR: [-80, -80, -80], fArmR: [-40, 0, 0], uArmL: [-20, 0, 30] }, [0, -0.1, -0.05], ['relax', 'blade'])) },
    { t: 3.3, e: 'snap', p: over(SK_IDLE, P({ spine: [10, -40, 0], chest: [10, -30, 0], uArmR: [-80, 60, -80], fArmR: [-4, 0, 0], uArmL: [0, 0, 40] }, [0, -0.14, 0.12], ['relax', 'blade'])) },
    { t: 4.1, e: 'io', p: SK_IDLE },
  ],
};

const SUMMON_IK: Pose['ik'] = { L: [0.0, 1.25, 0.3], R: [0.0, 1.34, 0.3], Lf: [-1, 0, 0.1], Lp: [0, 1, 0], Rf: [1, 0, 0.1], Rp: [0, -1, 0] };
/** Summoning Mahoraga: Megumi's sign, fists stacked. */
export const SK_SUMMON: Clip = {
  name: 'summon',
  fadeIn: 0.2,
  fadeOut: 0.4,
  events: [[0.6, 'sign']],
  keys: [
    { t: 0, p: SK_IDLE },
    { t: 0.6, e: 'io', p: ik(over(SK_IDLE, P({ spine: [6, 0, 0], head: [12, 0, 0], uArmL: [-34, 0, 12], fArmL: [-100, -40, 0], uArmR: [-30, 0, -14], fArmR: [-110, 50, 0], handL: [0, 0, 0] }, [0, -0.05, 0], ['fist', 'fist'])), SUMMON_IK) },
    { t: 3.0, e: 'lin', p: ik(over(SK_IDLE, P({ spine: [6, 0, 0], head: [16, 0, 0], uArmL: [-34, 0, 12], fArmL: [-100, -40, 0], uArmR: [-30, 0, -14], fArmR: [-110, 50, 0] }, [0, -0.05, 0], ['fist', 'fist'])), SUMMON_IK) },
    { t: 3.5, e: 'io', p: SK_IDLE },
  ],
};

// ------------------------------------------------------------------ reactions (shared)
export const HIT_LIGHT: Clip = {
  name: 'hitLight',
  fadeIn: 0.02,
  fadeOut: 0.2,
  keys: [
    { t: 0, p: SK_GUARD },
    { t: 0.05, e: 'snap', p: over(SK_GUARD, P({ spine: [-14, 10, 0], chest: [-16, 12, 0], neck: [-14, 0, 0], head: [-20, -16, 8] }, [0, -0.06, -0.08], ['open', 'open'])) },
    { t: 0.32, e: 'io', p: SK_GUARD },
  ],
};
export const HIT_HEAVY: Clip = {
  name: 'hitHeavy',
  fadeIn: 0.02,
  fadeOut: 0.25,
  keys: [
    { t: 0, p: SK_GUARD },
    { t: 0.06, e: 'snap', p: P({ spine: [34, 0, 0], chest: [26, 0, 0], neck: [10, 0, 0], head: [6, 0, 0], uArmL: [-60, 0, 30], fArmL: [-40, 0, 0], uArmR: [-60, 0, -30], fArmR: [-40, 0, 0], thighL: [-30, 0, 6], shinL: [40, 0, 0], thighR: [-10, 0, -6], shinR: [40, 0, 0] }, [0, -0.15, -0.12], ['open', 'open']) },
    { t: 0.55, e: 'io', p: SK_GUARD },
  ],
};
/** Thrown through the air: arched back, limbs trailing. */
export const LAUNCHED = P(
  {
    spine: [-26, 0, 0],
    chest: [-20, 0, 0],
    neck: [-20, 0, 0],
    head: [-24, 0, 0],
    uArmL: [-160, 0, 40],
    fArmL: [-30, 0, 0],
    uArmR: [-150, 0, -50],
    fArmR: [-40, 0, 0],
    thighL: [30, 0, 10],
    shinL: [60, 0, 0],
    thighR: [-20, 0, -12],
    shinR: [70, 0, 0],
  },
  [0, 0, 0],
  ['open', 'open'],
);
/** Flat on the back. */
export const DOWN = P(
  {
    spine: [-6, 0, 0],
    chest: [-4, 0, 0],
    head: [-8, 20, 0],
    uArmL: [-10, 0, 60],
    fArmL: [-30, 0, 0],
    uArmR: [-100, 0, -40],
    fArmR: [-20, 0, 0],
    thighL: [-10, 0, 10],
    shinL: [30, 0, 0],
    thighR: [0, 0, -8],
    shinR: [6, 0, 0],
  },
  [0, 0, 0],
  ['relax', 'relax'],
);
/** On one knee, hand on the ground. */
export const KNEEL = P(
  {
    spine: [30, 0, 0],
    chest: [20, 0, 0],
    neck: [10, 0, 0],
    head: [10, 0, 0],
    thighL: [-90, 0, 8],
    shinL: [90, 0, 0],
    footL: [0, 0, 0],
    thighR: [10, 0, -6],
    shinR: [100, 0, 0],
    footR: [50, 0, 0],
    uArmL: [-30, 0, 20],
    fArmL: [-30, 0, 0],
    uArmR: [-50, 0, -20],
    fArmR: [-10, 0, 0],
  },
  [0, -0.5, 0],
  ['relax', 'open'],
);
export const GET_UP: Clip = {
  name: 'getUp',
  fadeIn: 0.1,
  fadeOut: 0.2,
  keys: [
    { t: 0, p: KNEEL },
    { t: 0.45, e: 'io', p: SK_GUARD },
  ],
};
export const DODGE: Clip = {
  name: 'dodge',
  fadeIn: 0.03,
  fadeOut: 0.15,
  keys: [
    { t: 0, p: SK_GUARD },
    { t: 0.08, e: 'snap', p: P({ spine: [10, 0, -24], chest: [6, 0, -16], head: [0, 0, 20], thighL: [-10, 0, 40], shinL: [20, 0, 0], thighR: [-20, 0, -10], shinR: [60, 0, 0], uArmL: [-30, 0, 60], fArmL: [-60, 0, 0], uArmR: [-40, 0, -20], fArmR: [-90, 0, 0] }, [0, -0.2, 0], ['open', 'open']) },
    { t: 0.32, e: 'io', p: SK_GUARD },
  ],
};
export const BLOCK: Clip = {
  name: 'block',
  fadeIn: 0.04,
  fadeOut: 0.2,
  keys: [
    { t: 0, p: SK_GUARD },
    { t: 0.06, e: 'snap', p: over(SK_GUARD, P({ uArmL: [-80, 0, 20], fArmL: [-120, -60, 0], uArmR: [-80, 0, -20], fArmR: [-120, 60, 0], head: [10, 0, 0] }, undefined, ['fist', 'fist'])) },
    { t: 0.4, e: 'io', p: SK_GUARD },
  ],
};

// ------------------------------------------------------------------ Gojo (third person)
/** Hands in his pockets: the strongest doesn't need a guard. */
export const GJ_POCKETS = P(
  {
    spine: [-4, 0, 0],
    chest: [-6, 0, 0],
    neck: [6, 0, 0],
    head: [4, 10, -4],
    uArmL: [12, -10, 14],
    fArmL: [-26, -10, 0],
    handL: [0, 0, -30],
    uArmR: [12, 10, -14],
    fArmR: [-26, 10, 0],
    handR: [0, 0, 30],
    thighL: [-4, -8, 6],
    shinL: [4, 0, 0],
    footL: [-2, 8, -6],
    thighR: [3, 8, -6],
    shinR: [4, 0, 0],
    footR: [-4, -8, 6],
  },
  [0, -0.01, 0],
  ['fist', 'fist'],
);
GJ_POCKETS.ik = { L: [0.19, 1.0, 0.05], R: [-0.19, 1.0, 0.05], Lf: [0, -1, 0.1], Lp: [-1, 0, 0], Rf: [0, -1, 0.1], Rp: [1, 0, 0] };
/** Domain Expansion: right hand raised, index and middle crossed. */
export const GJ_SIGN = P(
  {
    spine: [-2, -8, 0],
    chest: [-4, -10, 0],
    head: [6, 10, 0],
    uArmR: [-40, 30, -40],
    fArmR: [-128, 40, 0],
    handR: [0, 30, 10],
    uArmL: [10, 0, 8],
    fArmL: [-20, 0, 0],
  },
  [0, -0.01, 0],
  ['relax', 'cross'],
);
GJ_SIGN.ik = { R: [-0.06, 1.67, 0.3], Rf: [0.1, 1, 0.1], Rp: [0.6, 0, 0.8] };
/** Hollow Purple: both arms out, hands meeting before him. */
export const GJ_PURPLE = P(
  {
    spine: [4, 0, 0],
    chest: [2, 0, 0],
    head: [0, 0, 0],
    uArmL: [-84, 0, 10],
    fArmL: [-10, 0, 0],
    uArmR: [-84, 0, -10],
    fArmR: [-10, 0, 0],
    thighL: [-20, 0, 10],
    shinL: [20, 0, 0],
    thighR: [14, 0, -10],
    shinR: [14, 0, 0],
    footR: [-20, 0, 0],
  },
  [0, -0.05, 0],
  ['point', 'point'],
);
GJ_PURPLE.ik = { L: [0.06, 1.53, 0.68], R: [-0.06, 1.53, 0.68], Lf: [0, 0, 1], Lp: [-1, 0, 0], Rf: [0, 0, 1], Rp: [1, 0, 0] };
export const GJ_POINT = P(
  {
    spine: [0, 20, 0],
    chest: [0, 10, 0],
    head: [0, -20, 0],
    uArmR: [-88, 0, -4],
    fArmR: [-4, 90, 0],
    uArmL: [6, 0, 10],
    fArmL: [-20, 0, 0],
  },
  [0, -0.02, 0],
  ['relax', 'point'],
);
GJ_POINT.ik = { R: [-0.12, 1.54, 0.72], Rf: [0, 0, 1], Rp: [1, 0, 0] };

export const ALL_POSES: Record<string, Pose> = {
  SK_IDLE,
  SK_GUARD,
  SK_FUGA_DRAW,
  SK_SIGN,
  SK_CHANT1,
  SK_CHANT2,
  SK_CHANT3,
  LAUNCHED,
  DOWN,
  KNEEL,
  GJ_POCKETS,
  GJ_SIGN,
  GJ_PURPLE,
  GJ_POINT,
};
export const ALL_CLIPS: Record<string, Clip> = { SK_JAB, SK_HOOK, SK_UPPER, SK_KICK, SK_AXE, SK_DISMANTLE, SK_CLEAVE, SK_FUGA, SK_DOMAIN, SK_LAUGH, SK_WCS, SK_SUMMON, HIT_LIGHT, HIT_HEAVY, DODGE, BLOCK };

// ------------------------------------------------------------------ Mahoraga
export const MH_IDLE = P(
  {
    spine: [14, 0, 0],
    chest: [10, 0, 0],
    neck: [-8, 0, 0],
    head: [-10, 0, 0],
    uArmL: [-8, 0, 18],
    fArmL: [-28, 0, 0],
    uArmR: [-30, 0, -16],
    fArmR: [-40, 30, 0],
    thighL: [-14, -10, 10],
    shinL: [26, 0, 0],
    footL: [-10, 10, -10],
    thighR: [6, 10, -10],
    shinR: [24, 0, 0],
    footR: [-28, -10, 10],
  },
  [0, -0.06, 0],
  ['claw', 'fist'],
);
export const MH_SLASH: Clip = {
  name: 'mhSlash',
  fadeIn: 0.1,
  fadeOut: 0.3,
  events: [[0.62, 'hit']],
  keys: [
    { t: 0, p: MH_IDLE },
    { t: 0.45, e: 'io', p: over(MH_IDLE, P({ spine: [6, -40, 0], chest: [4, -30, 0], uArmR: [-60, -60, -90], fArmR: [-30, 0, 0], uArmL: [-30, 0, 40] }, [0, -0.08, -0.04], ['claw', 'fist'])) },
    { t: 0.62, e: 'snap', p: over(MH_IDLE, P({ spine: [14, 40, 0], chest: [10, 30, 0], uArmR: [-80, 70, -80], fArmR: [-6, 0, 0], uArmL: [-10, 0, 20] }, [0, -0.12, 0.1], ['claw', 'fist'])) },
    { t: 1.15, e: 'io', p: MH_IDLE },
  ],
};
export const MH_SLAM: Clip = {
  name: 'mhSlam',
  fadeIn: 0.1,
  fadeOut: 0.35,
  events: [[0.78, 'hit']],
  keys: [
    { t: 0, p: MH_IDLE },
    { t: 0.55, e: 'io', p: over(MH_IDLE, P({ spine: [-16, 0, 0], chest: [-14, 0, 0], head: [10, 0, 0], uArmR: [-170, 0, -10], fArmR: [-20, 0, 0], uArmL: [-160, 0, 20], fArmL: [-30, 0, 0] }, [0, 0.05, -0.05], ['fist', 'fist'])) },
    { t: 0.78, e: 'snap', p: over(MH_IDLE, P({ spine: [40, 0, 0], chest: [24, 0, 0], head: [-24, 0, 0], uArmR: [-70, 0, -10], fArmR: [-4, 0, 0], uArmL: [-60, 0, 20], fArmL: [-10, 0, 0], thighL: [-40, 0, 10], shinL: [50, 0, 0] }, [0, -0.3, 0.15], ['fist', 'fist'])) },
    { t: 1.4, e: 'io', p: MH_IDLE },
  ],
};
export const MH_PUNCH: Clip = {
  name: 'mhPunch',
  fadeIn: 0.08,
  fadeOut: 0.25,
  events: [[0.38, 'hit']],
  keys: [
    { t: 0, p: MH_IDLE },
    { t: 0.26, e: 'out', p: over(MH_IDLE, P({ chest: [6, 30, 0], uArmL: [20, 0, 40], fArmL: [-110, 0, 0] }, [0, -0.06, -0.05], ['fist', 'fist'])) },
    { t: 0.38, e: 'snap', p: over(MH_IDLE, P({ spine: [16, -20, 0], chest: [10, -26, 0], uArmL: [-88, 0, 6], fArmL: [-4, -80, 0] }, [0, -0.1, 0.18], ['fist', 'fist'])) },
    { t: 0.8, e: 'io', p: MH_IDLE },
  ],
};
export const MH_ROAR: Clip = {
  name: 'mhRoar',
  fadeIn: 0.2,
  fadeOut: 0.4,
  keys: [
    { t: 0, p: MH_IDLE },
    { t: 0.5, e: 'io', p: P({ spine: [-14, 0, 0], chest: [-18, 0, 0], neck: [-14, 0, 0], head: [-26, 0, 0], uArmL: [-30, 0, 70], fArmL: [-40, 0, 0], uArmR: [-30, 0, -70], fArmR: [-40, 0, 0], thighL: [-8, 0, 14], thighR: [8, 0, -14], shinL: [10, 0, 0], shinR: [10, 0, 0] }, [0, -0.04, 0], ['claw', 'fist']) },
    { t: 2.0, e: 'lin', p: P({ spine: [-16, 0, 0], chest: [-20, 0, 0], neck: [-16, 0, 0], head: [-30, 0, 0], uArmL: [-34, 0, 74], fArmL: [-44, 0, 0], uArmR: [-34, 0, -74], fArmR: [-44, 0, 0], thighL: [-8, 0, 14], thighR: [8, 0, -14], shinL: [10, 0, 0], shinR: [10, 0, 0] }, [0, -0.04, 0], ['claw', 'fist']) },
    { t: 2.5, e: 'io', p: MH_IDLE },
  ],
};
