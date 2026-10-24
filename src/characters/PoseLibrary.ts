import { Pose, poseFromDef, type PoseDef, type MaskName, mergeDefs, mirrorDef, JOINT_NAMES, J } from './Pose';

export type Ease = 'linear' | 'in' | 'out' | 'inout' | 'snap';
export interface ActionKey {
  t: number;
  pose: PoseDef;
  ease?: Ease;
}
export interface ActionDef {
  id: string;
  mask: MaskName;
  keys: ActionKey[];
  events?: Record<string, number>;
  blendIn: number;
  blendOut: number;
  loop?: boolean;
  /** compiled */
  poses?: Pose[];
  duration?: number;
}

// ------------------------------------------------------------------ base poses
export const RELAXED: PoseDef = {
  torso: [2, 0, 0],
  head: [0, 0, 0],
  uarmL: [2, 0, 7],
  larmL: [-10, 0, 0],
  uarmR: [2, 0, -7],
  larmR: [-10, 0, 0],
};

export const GUARD: PoseDef = {
  torso: [9, -12, 0],
  head: [5, 12, 0],
  uarmL: [-50, 0, 12],
  larmL: [-115, 0, 0],
  uarmR: [-38, 0, -14],
  larmR: [-130, 0, 0],
};

export const BLOCK: PoseDef = {
  torso: [14, -4, 0],
  head: [12, 4, 0],
  uarmL: [-80, 0, -6],
  larmL: [-122, 0, 0],
  uarmR: [-80, 0, 6],
  larmR: [-122, 0, 0],
};

export const CARRY1H: PoseDef = {
  torso: [6, -6, 0],
  head: [3, 6, 0],
  uarmL: [-40, 0, 14],
  larmL: [-100, 0, 0],
  uarmR: [-30, 0, -16],
  larmR: [-75, 0, 0],
};

export const CARRY2H: PoseDef = {
  torso: [8, -20, 0],
  head: [4, 20, 0],
  uarmL: [-62, 0, -22],
  larmL: [-70, 0, 0],
  uarmR: [-40, 0, -10],
  larmR: [-95, 0, 0],
};

export const CARRY_BODY: PoseDef = {
  torso: [10, 0, 0],
  head: [0, 0, 0],
  uarmL: [-80, 0, -4],
  larmL: [-40, 0, 0],
  uarmR: [-80, 0, 4],
  larmR: [-40, 0, 0],
};

export const ARMS_CROSSED: PoseDef = {
  torso: [-2, 0, 0],
  head: [-3, 0, 0],
  uarmL: [-38, 0, -18],
  larmL: [-100, 0, 0],
  uarmR: [-30, 0, 18],
  larmR: [-100, 0, 0],
};

export const HANDS_HIPS: PoseDef = {
  torso: [-2, 0, 0],
  uarmL: [10, 0, 38],
  larmL: [-75, 0, 0],
  uarmR: [10, 0, -38],
  larmR: [-75, 0, 0],
};

export const COWER: PoseDef = {
  torso: [38, 0, 0],
  head: [28, 0, 0],
  uarmL: [-150, 0, -10],
  larmL: [-125, 0, 0],
  uarmR: [-150, 0, 10],
  larmR: [-125, 0, 0],
  thighL: [-75, 0, 6],
  shinL: [115, 0, 0],
  thighR: [-75, 0, -6],
  shinR: [115, 0, 0],
  root: [0, -0.4, 0.05],
};

export const DRINK_HOLD: PoseDef = {
  uarmR: [-24, 0, -10],
  larmR: [-88, 0, 0],
};

export const FLEE_ARMS: PoseDef = {
  torso: [18, 0, 0],
  head: [-10, 0, 0],
  uarmL: [-150, 0, 20],
  larmL: [-60, 0, 0],
  uarmR: [-150, 0, -20],
  larmR: [-60, 0, 0],
};

export const SIT_CHAIR: PoseDef = {
  pelvis: [0, 0, 0],
  torso: [6, 0, 0],
  thighL: [-90, 0, 3],
  shinL: [88, 0, 0],
  thighR: [-90, 0, -3],
  shinR: [88, 0, 0],
  uarmL: [-18, 0, 6],
  larmL: [-60, 0, 0],
  uarmR: [-18, 0, -6],
  larmR: [-60, 0, 0],
  root: [0, -0.43, -0.12],
};

export const SIT_STOOL: PoseDef = {
  torso: [10, 0, 0],
  thighL: [-78, 0, 6],
  shinL: [70, 0, 0],
  thighR: [-82, 0, -6],
  shinR: [86, 0, 0],
  uarmL: [-40, 0, 4],
  larmL: [-70, 0, 0],
  uarmR: [-40, 0, -4],
  larmR: [-70, 0, 0],
  root: [0, -0.2, -0.12],
};

export const SIT_COUCH: PoseDef = {
  torso: [-12, 0, 0],
  head: [6, 0, 0],
  thighL: [-82, 0, 10],
  shinL: [80, 0, 0],
  thighR: [-82, 0, -10],
  shinR: [80, 0, 0],
  uarmL: [-6, 0, 30],
  larmL: [-40, 0, 0],
  uarmR: [-6, 0, -30],
  larmR: [-40, 0, 0],
  root: [0, -0.5, -0.16],
};

export const LEAN_BAR: PoseDef = {
  torso: [16, 0, 0],
  head: [-10, 0, 0],
  uarmL: [-60, 0, 10],
  larmL: [-70, 0, 0],
  uarmR: [-62, 0, -12],
  larmR: [-74, 0, 0],
};

export const LIE_BACK: PoseDef = {
  pelvis: [-90, 0, 0],
  torso: [0, 0, 0],
  head: [-5, 0, 0],
  uarmL: [8, 0, 25],
  larmL: [-10, 0, 0],
  uarmR: [8, 0, -25],
  larmR: [-10, 0, 0],
  thighL: [0, 0, 8],
  shinL: [4, 0, 0],
  thighR: [0, 0, -8],
  shinR: [4, 0, 0],
  root: [0, -0.8, 0],
};

export const LIE_FRONT: PoseDef = {
  pelvis: [90, 0, 0],
  torso: [0, 0, 0],
  head: [-20, 0, 0],
  uarmL: [-150, 0, 20],
  larmL: [-30, 0, 0],
  uarmR: [-150, 0, -20],
  larmR: [-30, 0, 0],
  thighL: [0, 0, 6],
  shinL: [8, 0, 0],
  thighR: [0, 0, -6],
  shinR: [8, 0, 0],
  root: [0, -0.8, 0],
};

const LEGS_STAND: PoseDef = {
  pelvis: [0, 0, 0],
  thighL: [0, 0, 0],
  shinL: [0, 0, 0],
  thighR: [0, 0, 0],
  shinR: [0, 0, 0],
  root: [0, 0, 0],
};

// ------------------------------------------------------------------ actions
const A: ActionDef[] = [];
function def(a: ActionDef): ActionDef {
  A.push(a);
  return a;
}

// --- unarmed strikes (NPC) ---------------------------------------------------
def({
  id: 'jabL',
  mask: 'upper',
  blendIn: 0.06,
  blendOut: 0.14,
  events: { hit: 0.2 },
  keys: [
    { t: 0, pose: GUARD },
    { t: 0.14, pose: mergeDefs(GUARD, { uarmL: [-44, 0, 16], larmL: [-122, 0, 0], torso: [8, -4, 0] }), ease: 'out' },
    { t: 0.21, pose: mergeDefs(GUARD, { uarmL: [-88, 0, -8], larmL: [-6, 0, 0], torso: [12, -26, 0], head: [4, 20, 0] }), ease: 'snap' },
    { t: 0.42, pose: GUARD, ease: 'inout' },
  ],
});
def({
  id: 'crossR',
  mask: 'upperLegs',
  blendIn: 0.06,
  blendOut: 0.16,
  events: { hit: 0.26 },
  keys: [
    { t: 0, pose: GUARD },
    { t: 0.18, pose: mergeDefs(GUARD, { uarmR: [-30, 0, -24], larmR: [-138, 0, 0], torso: [6, -26, 0] }), ease: 'out' },
    {
      t: 0.27,
      pose: mergeDefs(GUARD, { uarmR: [-90, 0, 8], larmR: [-4, 0, 0], torso: [14, 28, 0], head: [6, -14, 0], uarmL: [-44, 0, 20], thighR: [6, 0, 0], shinR: [18, 0, 0] }),
      ease: 'snap',
    },
    { t: 0.52, pose: GUARD, ease: 'inout' },
  ],
});
def({
  id: 'hookR',
  mask: 'upper',
  blendIn: 0.06,
  blendOut: 0.18,
  events: { hit: 0.3 },
  keys: [
    { t: 0, pose: GUARD },
    { t: 0.2, pose: mergeDefs(GUARD, { uarmR: [-10, 0, -82], larmR: [-92, 0, 0], torso: [8, -40, 0], head: [4, 26, 0] }), ease: 'out' },
    { t: 0.31, pose: mergeDefs(GUARD, { uarmR: [-6, 0, -84], larmR: [-96, 0, 0], torso: [10, 46, 0], head: [6, -20, 0] }), ease: 'snap' },
    { t: 0.58, pose: GUARD, ease: 'inout' },
  ],
});
def({
  id: 'uppercutR',
  mask: 'upperLegs',
  blendIn: 0.06,
  blendOut: 0.18,
  events: { hit: 0.31 },
  keys: [
    { t: 0, pose: GUARD },
    {
      t: 0.2,
      pose: mergeDefs(GUARD, { uarmR: [-6, 0, -18], larmR: [-110, 0, 0], torso: [24, -24, 0], head: [10, 18, 0], thighL: [-24, 0, 0], shinL: [30, 0, 0], thighR: [-10, 0, 0], shinR: [30, 0, 0], root: [0, -0.1, 0] }),
      ease: 'out',
    },
    {
      t: 0.32,
      pose: mergeDefs(GUARD, { uarmR: [-122, 0, 6], larmR: [-118, 0, 0], torso: [-6, 18, 0], head: [-10, -10, 0], thighL: [-8, 0, 0], shinL: [6, 0, 0], thighR: [4, 0, 0], shinR: [6, 0, 0], root: [0, 0.02, 0] }),
      ease: 'snap',
    },
    { t: 0.6, pose: mergeDefs(GUARD, LEGS_STAND), ease: 'inout' },
  ],
});
def({
  id: 'haymaker',
  mask: 'upperLegs',
  blendIn: 0.08,
  blendOut: 0.2,
  events: { hit: 0.58 },
  keys: [
    { t: 0, pose: GUARD },
    {
      t: 0.45,
      pose: mergeDefs(GUARD, { uarmR: [-70, 0, -90], larmR: [-80, 0, 0], torso: [-6, -55, 0], head: [-2, 40, 0], uarmL: [-60, 0, 30], thighR: [10, 0, 0], shinR: [14, 0, 0] }),
      ease: 'out',
    },
    {
      t: 0.59,
      pose: mergeDefs(GUARD, { uarmR: [-92, 0, 20], larmR: [-12, 0, 0], torso: [20, 50, 0], head: [10, -26, 0], uarmL: [-20, 0, 30], larmL: [-60, 0, 0], thighR: [-6, 0, 0], shinR: [20, 0, 0] }),
      ease: 'snap',
    },
    { t: 0.95, pose: mergeDefs(GUARD, LEGS_STAND), ease: 'inout' },
  ],
});
def({
  id: 'kick',
  mask: 'full',
  blendIn: 0.07,
  blendOut: 0.2,
  events: { hit: 0.36 },
  keys: [
    { t: 0, pose: mergeDefs(GUARD, LEGS_STAND) },
    {
      t: 0.24,
      pose: mergeDefs(GUARD, { thighR: [-96, 0, 0], shinR: [92, 0, 0], thighL: [-6, 0, 0], shinL: [12, 0, 0], torso: [-8, 0, 0], uarmL: [-30, 0, 40], uarmR: [-30, 0, -40], root: [0, -0.03, 0] }),
      ease: 'out',
    },
    {
      t: 0.37,
      pose: mergeDefs(GUARD, { thighR: [-88, 0, 0], shinR: [4, 0, 0], thighL: [-8, 0, 0], shinL: [14, 0, 0], torso: [-18, 0, 0], head: [10, 0, 0], uarmL: [-10, 0, 50], larmL: [-60, 0, 0], uarmR: [-10, 0, -50], root: [0, -0.04, -0.06] }),
      ease: 'snap',
    },
    { t: 0.55, pose: mergeDefs(GUARD, { thighR: [-60, 0, 0], shinR: [70, 0, 0], torso: [-4, 0, 0] }), ease: 'inout' },
    { t: 0.78, pose: mergeDefs(GUARD, LEGS_STAND), ease: 'inout' },
  ],
});
def({
  id: 'shove',
  mask: 'upper',
  blendIn: 0.06,
  blendOut: 0.16,
  events: { hit: 0.25 },
  keys: [
    { t: 0, pose: GUARD },
    { t: 0.16, pose: { torso: [-4, 0, 0], uarmL: [-60, 0, 16], larmL: [-110, 0, 0], uarmR: [-60, 0, -16], larmR: [-110, 0, 0] }, ease: 'out' },
    { t: 0.26, pose: { torso: [18, 0, 0], uarmL: [-88, 0, -4], larmL: [-10, 0, 0], uarmR: [-88, 0, 4], larmR: [-10, 0, 0] }, ease: 'snap' },
    { t: 0.5, pose: GUARD, ease: 'inout' },
  ],
});

// --- weapon strikes ------------------------------------------------------------
def({
  id: 'swing1h',
  mask: 'upper',
  blendIn: 0.08,
  blendOut: 0.18,
  events: { hit: 0.36 },
  keys: [
    { t: 0, pose: CARRY1H },
    { t: 0.28, pose: mergeDefs(CARRY1H, { uarmR: [-75, 0, -78], larmR: [-55, 0, 0], torso: [4, -42, 0], head: [2, 30, 0] }), ease: 'out' },
    { t: 0.38, pose: mergeDefs(CARRY1H, { uarmR: [-88, 0, 34], larmR: [-12, 0, 0], torso: [12, 38, 0], head: [6, -20, 0] }), ease: 'snap' },
    { t: 0.66, pose: CARRY1H, ease: 'inout' },
  ],
});
def({
  id: 'overhead1h',
  mask: 'upperLegs',
  blendIn: 0.08,
  blendOut: 0.2,
  events: { hit: 0.42 },
  keys: [
    { t: 0, pose: CARRY1H },
    { t: 0.32, pose: mergeDefs(CARRY1H, { uarmR: [-168, 0, -6], larmR: [-96, 0, 0], torso: [-12, -10, 0], head: [-6, 8, 0] }), ease: 'out' },
    { t: 0.43, pose: mergeDefs(CARRY1H, { uarmR: [-62, 0, 6], larmR: [-12, 0, 0], torso: [28, 4, 0], head: [12, 0, 0], thighL: [-20, 0, 0], shinL: [24, 0, 0], root: [0, -0.06, 0] }), ease: 'snap' },
    { t: 0.75, pose: mergeDefs(CARRY1H, LEGS_STAND), ease: 'inout' },
  ],
});
def({
  id: 'stab',
  mask: 'upper',
  blendIn: 0.06,
  blendOut: 0.14,
  events: { hit: 0.24 },
  keys: [
    { t: 0, pose: CARRY1H },
    { t: 0.16, pose: mergeDefs(CARRY1H, { uarmR: [-30, 0, -20], larmR: [-118, 0, 0], torso: [4, -22, 0] }), ease: 'out' },
    { t: 0.25, pose: mergeDefs(CARRY1H, { uarmR: [-86, 0, 10], larmR: [-6, 0, 0], torso: [14, 22, 0], head: [6, -14, 0] }), ease: 'snap' },
    { t: 0.46, pose: CARRY1H, ease: 'inout' },
  ],
});
def({
  id: 'swing2h',
  mask: 'upperLegs',
  blendIn: 0.1,
  blendOut: 0.24,
  events: { hit: 0.5 },
  keys: [
    { t: 0, pose: CARRY2H },
    {
      t: 0.4,
      pose: mergeDefs(CARRY2H, { uarmR: [-95, 0, -62], larmR: [-60, 0, 0], uarmL: [-96, 0, -50], larmL: [-58, 0, 0], torso: [-2, -58, 0], head: [0, 40, 0], thighR: [8, 0, 0] }),
      ease: 'out',
    },
    {
      t: 0.52,
      pose: mergeDefs(CARRY2H, { uarmR: [-96, 0, 40], larmR: [-14, 0, 0], uarmL: [-94, 0, 60], larmL: [-12, 0, 0], torso: [16, 58, 0], head: [6, -30, 0], thighR: [-6, 0, 0], shinR: [16, 0, 0] }),
      ease: 'snap',
    },
    { t: 0.95, pose: mergeDefs(CARRY2H, LEGS_STAND), ease: 'inout' },
  ],
});
def({
  id: 'overhead2h',
  mask: 'upperLegs',
  blendIn: 0.1,
  blendOut: 0.24,
  events: { hit: 0.55 },
  keys: [
    { t: 0, pose: CARRY2H },
    { t: 0.44, pose: mergeDefs(CARRY2H, { uarmR: [-170, 0, -4], larmR: [-80, 0, 0], uarmL: [-170, 0, 4], larmL: [-80, 0, 0], torso: [-16, 0, 0], head: [-8, 0, 0] }), ease: 'out' },
    {
      t: 0.56,
      pose: mergeDefs(CARRY2H, { uarmR: [-70, 0, 6], larmR: [-10, 0, 0], uarmL: [-70, 0, -6], larmL: [-10, 0, 0], torso: [36, 0, 0], head: [14, 0, 0], thighL: [-22, 0, 0], shinL: [26, 0, 0], root: [0, -0.08, 0] }),
      ease: 'snap',
    },
    { t: 1.0, pose: mergeDefs(CARRY2H, LEGS_STAND), ease: 'inout' },
  ],
});
def({
  id: 'throw',
  mask: 'upper',
  blendIn: 0.08,
  blendOut: 0.2,
  events: { release: 0.4 },
  keys: [
    { t: 0, pose: CARRY1H },
    { t: 0.3, pose: mergeDefs(CARRY1H, { uarmR: [-160, 0, -22], larmR: [-100, 0, 0], torso: [-12, -34, 0], head: [-4, 26, 0], uarmL: [-80, 0, 20], larmL: [-20, 0, 0] }), ease: 'out' },
    { t: 0.41, pose: mergeDefs(CARRY1H, { uarmR: [-80, 0, 10], larmR: [-12, 0, 0], torso: [20, 28, 0], head: [8, -16, 0], uarmL: [-20, 0, 20], larmL: [-60, 0, 0] }), ease: 'snap' },
    { t: 0.7, pose: RELAXED, ease: 'inout' },
  ],
});
def({
  id: 'throwHeavy',
  mask: 'upper',
  blendIn: 0.1,
  blendOut: 0.2,
  events: { release: 0.5 },
  keys: [
    { t: 0, pose: CARRY_BODY },
    { t: 0.38, pose: { torso: [-14, 0, 0], head: [-8, 0, 0], uarmL: [-170, 0, 4], larmL: [-60, 0, 0], uarmR: [-170, 0, -4], larmR: [-60, 0, 0] }, ease: 'out' },
    { t: 0.5, pose: { torso: [30, 0, 0], head: [10, 0, 0], uarmL: [-70, 0, 4], larmL: [-10, 0, 0], uarmR: [-70, 0, -4], larmR: [-10, 0, 0] }, ease: 'snap' },
    { t: 0.85, pose: RELAXED, ease: 'inout' },
  ],
});

// --- reactions -------------------------------------------------------------------
def({
  id: 'flinch',
  mask: 'upper',
  blendIn: 0.03,
  blendOut: 0.2,
  keys: [
    { t: 0, pose: GUARD },
    { t: 0.06, pose: { torso: [-14, 10, 0], head: [-20, -8, 0], uarmL: [-30, 0, 30], larmL: [-60, 0, 0], uarmR: [-30, 0, -30], larmR: [-60, 0, 0] }, ease: 'snap' },
    { t: 0.32, pose: GUARD, ease: 'inout' },
  ],
});
def({
  id: 'doubleOver',
  mask: 'upperLegs',
  blendIn: 0.04,
  blendOut: 0.3,
  keys: [
    { t: 0, pose: GUARD },
    {
      t: 0.1,
      pose: { torso: [44, 0, 0], head: [10, 0, 0], uarmL: [-40, 0, -14], larmL: [-100, 0, 0], uarmR: [-40, 0, 14], larmR: [-100, 0, 0], thighL: [-30, 0, 0], shinL: [36, 0, 0], thighR: [-20, 0, 0], shinR: [36, 0, 0], root: [0, -0.12, -0.05] },
      ease: 'snap',
    },
    { t: 0.55, pose: { torso: [38, 0, 0], head: [6, 0, 0], thighL: [-26, 0, 0], shinL: [30, 0, 0], thighR: [-18, 0, 0], shinR: [30, 0, 0], root: [0, -0.1, -0.04] }, ease: 'inout' },
    { t: 0.9, pose: mergeDefs(GUARD, LEGS_STAND), ease: 'inout' },
  ],
});
def({
  id: 'stagger',
  mask: 'upper',
  blendIn: 0.04,
  blendOut: 0.3,
  keys: [
    { t: 0, pose: GUARD },
    { t: 0.1, pose: { torso: [-22, 14, 6], head: [-24, -10, 8], uarmL: [-80, 0, 70], larmL: [-30, 0, 0], uarmR: [-70, 0, -80], larmR: [-40, 0, 0] }, ease: 'snap' },
    { t: 0.4, pose: { torso: [-10, -8, -4], head: [-8, 6, -6], uarmL: [-60, 0, 50], larmL: [-50, 0, 0], uarmR: [-90, 0, -40], larmR: [-30, 0, 0] }, ease: 'inout' },
    { t: 0.75, pose: GUARD, ease: 'inout' },
  ],
});
def({
  id: 'parried',
  mask: 'upper',
  blendIn: 0.03,
  blendOut: 0.3,
  keys: [
    { t: 0, pose: GUARD },
    { t: 0.08, pose: { torso: [-20, 0, 0], head: [-16, 0, 0], uarmL: [-150, 0, 40], larmL: [-30, 0, 0], uarmR: [-150, 0, -40], larmR: [-30, 0, 0] }, ease: 'snap' },
    { t: 0.8, pose: { torso: [-10, 0, 0], head: [-6, 0, 0], uarmL: [-110, 0, 30], larmL: [-50, 0, 0], uarmR: [-110, 0, -30], larmR: [-50, 0, 0] }, ease: 'inout' },
    { t: 1.1, pose: GUARD, ease: 'inout' },
  ],
});

// --- get up ------------------------------------------------------------------------
def({
  id: 'getUpBack',
  mask: 'full',
  blendIn: 0.22,
  blendOut: 0.25,
  keys: [
    { t: 0, pose: LIE_BACK },
    {
      t: 0.35,
      pose: { pelvis: [-12, 0, 0], torso: [52, 0, 0], head: [10, 0, 0], uarmL: [10, 0, 30], larmL: [-20, 0, 0], uarmR: [10, 0, -30], larmR: [-20, 0, 0], thighL: [-88, 0, 6], shinL: [10, 0, 0], thighR: [-88, 0, -6], shinR: [10, 0, 0], root: [0, -0.8, -0.1] },
      ease: 'out',
    },
    {
      t: 0.75,
      pose: { pelvis: [0, 0, 0], torso: [48, 0, 0], head: [-6, 0, 0], uarmL: [-50, 0, 20], larmL: [-30, 0, 0], uarmR: [-50, 0, -20], larmR: [-30, 0, 0], thighL: [-120, 0, 10], shinL: [140, 0, 0], thighR: [-110, 0, -10], shinR: [140, 0, 0], root: [0, -0.62, 0.05] },
      ease: 'inout',
    },
    {
      t: 1.05,
      pose: { pelvis: [0, 0, 0], torso: [30, 0, 0], head: [-6, 0, 0], uarmL: [-30, 0, 20], larmL: [-40, 0, 0], uarmR: [-30, 0, -20], larmR: [-40, 0, 0], thighL: [-60, 0, 6], shinL: [80, 0, 0], thighR: [-50, 0, -6], shinR: [70, 0, 0], root: [0, -0.28, 0.02] },
      ease: 'inout',
    },
    { t: 1.35, pose: mergeDefs(RELAXED, LEGS_STAND), ease: 'inout' },
  ],
});
def({
  id: 'getUpFront',
  mask: 'full',
  blendIn: 0.22,
  blendOut: 0.25,
  keys: [
    { t: 0, pose: LIE_FRONT },
    {
      t: 0.35,
      pose: { pelvis: [70, 0, 0], torso: [-30, 0, 0], head: [-20, 0, 0], uarmL: [-70, 0, 10], larmL: [-10, 0, 0], uarmR: [-70, 0, -10], larmR: [-10, 0, 0], thighL: [-10, 0, 4], shinL: [80, 0, 0], thighR: [-10, 0, -4], shinR: [80, 0, 0], root: [0, -0.62, 0] },
      ease: 'out',
    },
    {
      t: 0.7,
      pose: { pelvis: [30, 0, 0], torso: [20, 0, 0], head: [-20, 0, 0], uarmL: [-60, 0, 10], larmL: [-20, 0, 0], uarmR: [-60, 0, -10], larmR: [-20, 0, 0], thighL: [-110, 0, 6], shinL: [130, 0, 0], thighR: [-60, 0, -6], shinR: [110, 0, 0], root: [0, -0.55, 0] },
      ease: 'inout',
    },
    {
      t: 1.0,
      pose: { pelvis: [0, 0, 0], torso: [32, 0, 0], head: [-6, 0, 0], uarmL: [-30, 0, 20], larmL: [-40, 0, 0], uarmR: [-30, 0, -20], larmR: [-40, 0, 0], thighL: [-60, 0, 6], shinL: [80, 0, 0], thighR: [-50, 0, -6], shinR: [70, 0, 0], root: [0, -0.28, 0.02] },
      ease: 'inout',
    },
    { t: 1.3, pose: mergeDefs(RELAXED, LEGS_STAND), ease: 'inout' },
  ],
});

// --- utility ----------------------------------------------------------------------
def({
  id: 'pickup',
  mask: 'full',
  blendIn: 0.1,
  blendOut: 0.2,
  events: { grab: 0.32 },
  keys: [
    { t: 0, pose: mergeDefs(RELAXED, LEGS_STAND) },
    {
      t: 0.32,
      pose: { torso: [55, 0, 0], head: [-20, 0, 0], uarmR: [-70, 0, -4], larmR: [-10, 0, 0], uarmL: [-40, 0, 10], larmL: [-20, 0, 0], thighL: [-60, 0, 0], shinL: [80, 0, 0], thighR: [-30, 0, 0], shinR: [60, 0, 0], root: [0, -0.3, -0.06] },
      ease: 'out',
    },
    { t: 0.65, pose: mergeDefs(CARRY1H, LEGS_STAND), ease: 'inout' },
  ],
});
def({
  id: 'drink',
  mask: 'armsHead',
  blendIn: 0.2,
  blendOut: 0.3,
  keys: [
    { t: 0, pose: DRINK_HOLD },
    { t: 0.5, pose: { uarmR: [-62, 0, -6], larmR: [-138, 0, 0], head: [-26, 0, 0] }, ease: 'inout' },
    { t: 1.5, pose: { uarmR: [-66, 0, -6], larmR: [-142, 0, 0], head: [-32, 0, 0] }, ease: 'inout' },
    { t: 2.0, pose: DRINK_HOLD, ease: 'inout' },
  ],
});
def({
  id: 'taunt',
  mask: 'upper',
  blendIn: 0.15,
  blendOut: 0.25,
  keys: [
    { t: 0, pose: GUARD },
    { t: 0.25, pose: { torso: [-8, 0, 0], head: [-10, 0, 0], uarmL: [-20, 0, 40], larmL: [-100, 0, 0], uarmR: [-20, 0, -40], larmR: [-100, 0, 0] }, ease: 'out' },
    { t: 0.45, pose: { torso: [-10, 0, 0], head: [-12, 0, 0], uarmL: [-50, 0, 20], larmL: [-90, 0, 0], uarmR: [-50, 0, -20], larmR: [-90, 0, 0] }, ease: 'inout' },
    { t: 0.65, pose: { torso: [-8, 0, 0], head: [-10, 0, 0], uarmL: [-20, 0, 40], larmL: [-100, 0, 0], uarmR: [-20, 0, -40], larmR: [-100, 0, 0] }, ease: 'inout' },
    { t: 1.0, pose: GUARD, ease: 'inout' },
  ],
});
def({
  id: 'beckon',
  mask: 'upper',
  blendIn: 0.12,
  blendOut: 0.25,
  keys: [
    { t: 0, pose: GUARD },
    { t: 0.2, pose: mergeDefs(GUARD, { uarmR: [-80, 0, -10], larmR: [-20, 0, 0], torso: [-4, 10, 0] }), ease: 'out' },
    { t: 0.4, pose: mergeDefs(GUARD, { uarmR: [-80, 0, -10], larmR: [-80, 0, 0], torso: [-4, 10, 0] }), ease: 'inout' },
    { t: 0.6, pose: mergeDefs(GUARD, { uarmR: [-80, 0, -10], larmR: [-20, 0, 0], torso: [-4, 10, 0] }), ease: 'inout' },
    { t: 0.8, pose: mergeDefs(GUARD, { uarmR: [-80, 0, -10], larmR: [-80, 0, 0], torso: [-4, 10, 0] }), ease: 'inout' },
    { t: 1.1, pose: GUARD, ease: 'inout' },
  ],
});
def({
  id: 'cheer',
  mask: 'upper',
  blendIn: 0.15,
  blendOut: 0.3,
  keys: [
    { t: 0, pose: RELAXED },
    { t: 0.25, pose: { torso: [-8, 0, 0], head: [-14, 0, 0], uarmL: [-170, 0, 18], larmL: [-30, 0, 0], uarmR: [-170, 0, -18], larmR: [-30, 0, 0] }, ease: 'out' },
    { t: 0.5, pose: { torso: [-6, 0, 0], head: [-10, 0, 0], uarmL: [-150, 0, 22], larmL: [-60, 0, 0], uarmR: [-150, 0, -22], larmR: [-60, 0, 0] }, ease: 'inout' },
    { t: 0.75, pose: { torso: [-8, 0, 0], head: [-14, 0, 0], uarmL: [-170, 0, 18], larmL: [-30, 0, 0], uarmR: [-170, 0, -18], larmR: [-30, 0, 0] }, ease: 'inout' },
    { t: 1.2, pose: RELAXED, ease: 'inout' },
  ],
});
def({
  id: 'point',
  mask: 'upper',
  blendIn: 0.15,
  blendOut: 0.3,
  keys: [
    { t: 0, pose: RELAXED },
    { t: 0.25, pose: mergeDefs(RELAXED, { uarmR: [-92, 0, -6], larmR: [-4, 0, 0], torso: [0, 12, 0], head: [-4, -6, 0] }), ease: 'out' },
    { t: 1.1, pose: mergeDefs(RELAXED, { uarmR: [-90, 0, -6], larmR: [-6, 0, 0], torso: [0, 12, 0] }), ease: 'inout' },
    { t: 1.4, pose: RELAXED, ease: 'inout' },
  ],
});
def({
  id: 'poolShot',
  mask: 'full',
  blendIn: 0.35,
  blendOut: 0.4,
  events: { hit: 1.6 },
  keys: [
    { t: 0, pose: mergeDefs(RELAXED, LEGS_STAND) },
    {
      t: 0.6,
      pose: { torso: [62, -8, 0], head: [-50, 8, 0], uarmL: [-100, 0, -12], larmL: [-8, 0, 0], uarmR: [-30, 0, -30], larmR: [-80, 0, 0], thighL: [-30, 0, 4], shinL: [10, 0, 0], thighR: [6, 0, -4], shinR: [6, 0, 0], root: [0, -0.06, -0.08] },
      ease: 'inout',
    },
    { t: 1.45, pose: { torso: [62, -8, 0], head: [-50, 8, 0], uarmL: [-100, 0, -12], larmL: [-8, 0, 0], uarmR: [-14, 0, -30], larmR: [-110, 0, 0], thighL: [-30, 0, 4], shinL: [10, 0, 0], thighR: [6, 0, -4], shinR: [6, 0, 0], root: [0, -0.06, -0.08] }, ease: 'inout' },
    { t: 1.62, pose: { torso: [62, -8, 0], head: [-50, 8, 0], uarmL: [-100, 0, -12], larmL: [-8, 0, 0], uarmR: [-50, 0, -26], larmR: [-40, 0, 0], thighL: [-30, 0, 4], shinL: [10, 0, 0], thighR: [6, 0, -4], shinR: [6, 0, 0], root: [0, -0.06, -0.08] }, ease: 'snap' },
    { t: 2.4, pose: mergeDefs(RELAXED, LEGS_STAND), ease: 'inout' },
  ],
});
def({
  id: 'dartThrow',
  mask: 'upper',
  blendIn: 0.2,
  blendOut: 0.3,
  events: { release: 0.75 },
  keys: [
    { t: 0, pose: RELAXED },
    { t: 0.45, pose: mergeDefs(RELAXED, { uarmR: [-80, 0, -8], larmR: [-130, 0, 0], head: [-4, 0, 0] }), ease: 'inout' },
    { t: 0.62, pose: mergeDefs(RELAXED, { uarmR: [-84, 0, -8], larmR: [-150, 0, 0] }), ease: 'inout' },
    { t: 0.76, pose: mergeDefs(RELAXED, { uarmR: [-86, 0, -6], larmR: [-30, 0, 0] }), ease: 'snap' },
    { t: 1.3, pose: RELAXED, ease: 'inout' },
  ],
});
def({
  id: 'laugh',
  mask: 'upper',
  blendIn: 0.15,
  blendOut: 0.3,
  keys: [
    { t: 0, pose: RELAXED },
    { t: 0.2, pose: mergeDefs(RELAXED, { torso: [-10, 0, 0], head: [-22, 0, 0] }), ease: 'out' },
    { t: 0.35, pose: mergeDefs(RELAXED, { torso: [-6, 0, 0], head: [-16, 0, 0] }), ease: 'inout' },
    { t: 0.5, pose: mergeDefs(RELAXED, { torso: [-10, 0, 0], head: [-22, 0, 0] }), ease: 'inout' },
    { t: 0.65, pose: mergeDefs(RELAXED, { torso: [-6, 0, 0], head: [-16, 0, 0] }), ease: 'inout' },
    { t: 0.9, pose: mergeDefs(RELAXED, { torso: [14, 0, 0], head: [6, 0, 0], uarmR: [-30, 0, 10], larmR: [-80, 0, 0] }), ease: 'inout' },
    { t: 1.3, pose: RELAXED, ease: 'inout' },
  ],
});
def({
  id: 'gesture',
  mask: 'arms',
  blendIn: 0.25,
  blendOut: 0.3,
  keys: [
    { t: 0, pose: RELAXED },
    { t: 0.4, pose: { uarmL: [-30, 0, 20], larmL: [-70, 0, 0], uarmR: [-36, 0, -16], larmR: [-80, 0, 0] }, ease: 'inout' },
    { t: 0.8, pose: { uarmL: [-20, 0, 34], larmL: [-60, 0, 0], uarmR: [-44, 0, -26], larmR: [-60, 0, 0] }, ease: 'inout' },
    { t: 1.2, pose: { uarmL: [-36, 0, 14], larmL: [-80, 0, 0], uarmR: [-26, 0, -30], larmR: [-90, 0, 0] }, ease: 'inout' },
    { t: 1.7, pose: RELAXED, ease: 'inout' },
  ],
});
def({
  id: 'shrug',
  mask: 'upper',
  blendIn: 0.15,
  blendOut: 0.3,
  keys: [
    { t: 0, pose: RELAXED },
    { t: 0.3, pose: { torso: [-4, 0, 0], head: [0, 0, 10], uarmL: [-10, 0, 30], larmL: [-90, 0, 0], uarmR: [-10, 0, -30], larmR: [-90, 0, 0] }, ease: 'out' },
    { t: 0.8, pose: { torso: [-4, 0, 0], head: [0, 0, 8], uarmL: [-10, 0, 30], larmL: [-90, 0, 0], uarmR: [-10, 0, -30], larmR: [-90, 0, 0] }, ease: 'inout' },
    { t: 1.1, pose: RELAXED, ease: 'inout' },
  ],
});
def({
  id: 'wave',
  mask: 'rArm',
  blendIn: 0.15,
  blendOut: 0.3,
  keys: [
    { t: 0, pose: RELAXED },
    { t: 0.25, pose: { uarmR: [-30, 0, -100], larmR: [-80, 0, 0] }, ease: 'out' },
    { t: 0.45, pose: { uarmR: [-30, 0, -110], larmR: [-50, 0, 0] }, ease: 'inout' },
    { t: 0.65, pose: { uarmR: [-30, 0, -100], larmR: [-90, 0, 0] }, ease: 'inout' },
    { t: 0.85, pose: { uarmR: [-30, 0, -110], larmR: [-50, 0, 0] }, ease: 'inout' },
    { t: 1.15, pose: RELAXED, ease: 'inout' },
  ],
});

export const ACTIONS: Record<string, ActionDef> = {};
for (const a of A) ACTIONS[a.id] = a;

// mirrored variants
for (const id of ['crossR', 'hookR', 'uppercutR']) {
  const src = ACTIONS[id];
  const mid = id.replace(/R$/, 'L');
  ACTIONS[mid] = {
    ...src,
    id: mid,
    keys: src.keys.map((k) => ({ ...k, pose: mirrorDef(k.pose) })),
  };
}

/** Compile keys into Pose objects with joints filled forward so every key defines all masked joints. */
export function compileAction(a: ActionDef): void {
  if (a.poses) return;
  const filled: PoseDef[] = [];
  let prev: PoseDef = {};
  for (const k of a.keys) {
    const merged = mergeDefs(prev, k.pose);
    filled.push(merged);
    prev = merged;
  }
  // backfill joints first defined later
  for (let i = filled.length - 2; i >= 0; i--) {
    for (const n of JOINT_NAMES) if (!filled[i][n] && filled[i + 1][n]) filled[i][n] = filled[i + 1][n];
    if (!filled[i].root && filled[i + 1].root) filled[i].root = filled[i + 1].root;
  }
  a.poses = filled.map((d) => poseFromDef(d));
  a.duration = a.keys[a.keys.length - 1].t;
}
for (const id in ACTIONS) compileAction(ACTIONS[id]);

export const STANCES = {
  relaxed: poseFromDef(RELAXED),
  guard: poseFromDef(GUARD),
  block: poseFromDef(BLOCK),
  carry1h: poseFromDef(CARRY1H),
  carry2h: poseFromDef(CARRY2H),
  carryBody: poseFromDef(CARRY_BODY),
  armsCrossed: poseFromDef(ARMS_CROSSED),
  hips: poseFromDef(HANDS_HIPS),
  cower: poseFromDef(COWER),
  drinkHold: poseFromDef(mergeDefs(RELAXED, DRINK_HOLD)),
  flee: poseFromDef(FLEE_ARMS),
  leanBar: poseFromDef(LEAN_BAR),
};
export type StanceName = keyof typeof STANCES;

export const FULLBODY = {
  sitChair: poseFromDef(SIT_CHAIR),
  sitStool: poseFromDef(SIT_STOOL),
  sitCouch: poseFromDef(SIT_COUCH),
  cower: poseFromDef(COWER),
  lieBack: poseFromDef(LIE_BACK),
  lieFront: poseFromDef(LIE_FRONT),
};
export type FullBodyName = keyof typeof FULLBODY;

export { J };
