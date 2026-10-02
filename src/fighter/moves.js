// Pose and move library. Poses are authored facing right, in degrees, with
// anticipation (wind-up keys) and follow-through keys. Each move carries hit
// windows, root motion, leg IK/FK intervals and metadata used by the AI.
//
// Pose keys: rot torso head | sA eA (lead arm) | sB eB (rear arm) |
//            hA kA (lead leg) | hB kB (rear leg) | px py (pelvis offset/height)

import { P, HAND_A, HAND_B, ELB_A, ELB_B, FOOT_A, FOOT_B, KNEE_A, HEAD } from './skeleton.js';

export const WEAPON_TIP = -1; // pseudo joint: tip of the held weapon

// Base stances ------------------------------------------------------------
export const GUARD = P({ rot: 0, torso: 10, head: -8, sA: 42, eA: 118, sB: 18, eB: 138, hA: 14, kA: 22, hB: -18, kB: 18, px: 0, py: 39 });
export const RELAXED = P({ torso: 3, head: 0, sA: 8, eA: 24, sB: -6, eB: 18, py: 42 }, GUARD);
export const TIRED = P({ torso: 40, head: -32, sA: -10, eA: 18, sB: -20, eB: 14, py: 37 }, GUARD);
export const BLOCK = P({ torso: 14, head: 8, sA: 64, eA: 142, sB: 50, eB: 150, py: 37 }, GUARD);
export const RUN = P({ torso: 20, head: -14, sA: 30, eA: 95, sB: 30, eB: 95, py: 40 }, GUARD);
export const AIR_UP = P({ torso: 6, head: -6, sA: 74, eA: 70, sB: 40, eB: 64, hA: 72, kA: 104, hB: -6, kB: 64 }, GUARD);
export const AIR_DOWN = P({ torso: 4, head: -4, sA: 88, eA: 34, sB: 62, eB: 32, hA: 30, kA: 38, hB: -12, kB: 30 }, GUARD);
export const LAND = P({ torso: 22, head: -10, sA: 52, eA: 92, sB: 32, eB: 104, py: 30 }, GUARD);
export const STAGGER = P({ torso: -24, head: -22, sA: 140, eA: 30, sB: -42, eB: 22, py: 37 }, GUARD);
export const TAUNT = P({ torso: -4, head: -6, sA: 72, eA: 62, sB: 62, eB: 72, py: 41 }, GUARD);
export const HELD = P({ torso: -8, head: -14, sA: 64, eA: 96, sB: 52, eB: 108, py: 40 }, GUARD);
export const HOLDING = P({ torso: 18, head: -6, sA: 82, eA: 72, sB: 76, eB: 82, px: 2, py: 38 }, GUARD);
export const WEAPON_GUARD = P({ torso: 8, head: -6, sA: 64, eA: 70, sB: 40, eB: 96, py: 39 }, GUARD);
export const FLINCH_HIGH = P({ rot: 0, torso: -22, head: -32, sA: -24, eA: -30, sB: -20, eB: -30, hA: 0, kA: 0, hB: 0, kB: 0, px: 0, py: -2 });
export const FLINCH_LOW = P({ rot: 0, torso: 28, head: 18, sA: -20, eA: -20, sB: -10, eB: -10, hA: 0, kA: 0, hB: 0, kB: 0, px: 0, py: -4 });

export const MOVES = {};

function def(id, m) {
  m.id = id;
  m.keys = m.keys.map(([t, pose, ease]) => ({ t, pose, ease: ease || 'inOutQuad' }));
  m.dur = m.dur || m.keys[m.keys.length - 1].t;
  m.hits = m.hits || [];
  m.motion = m.motion || [];
  m.legs = m.legs || { A: [], B: [] };
  m.legs.A = m.legs.A || [];
  m.legs.B = m.legs.B || [];
  m.flips = m.flips || [];
  m.windup = m.windup !== undefined ? m.windup : m.hits.length ? m.hits[0].t0 : m.grab ? m.grab[0] : m.dur * 0.3;
  m.cancel = m.cancel !== undefined ? m.cancel : m.dur * 0.75;
  m.stamina = m.stamina || 0;
  m.range = m.range || [0, 60];
  m.type = m.type || 'strike';
  m.power = m.hits.reduce((a, h) => a + h.dmg * (1 + Math.abs(h.kx) / 300), 0);
  MOVES[id] = m;
  return m;
}

// Strikes -------------------------------------------------------------------
def('jab', {
  keys: [
    [0, GUARD],
    [0.05, P({ torso: 12, sA: 52, eA: 110 }, GUARD), 'outQuad'],
    [0.1, P({ torso: 22, head: -14, sA: 94, eA: 6, sB: 16, eB: 142, px: 4 }, GUARD), 'outCubic'],
    [0.16, P({ torso: 20, head: -12, sA: 90, eA: 14, px: 4 }, GUARD)],
    [0.3, GUARD, 'inOutQuad'],
  ],
  hits: [{ t0: 0.07, t1: 0.13, joint: HAND_A, r: 9, dmg: 5, kx: 110, ky: -15, stun: 0.24, poise: 9, height: 'high', kind: 'punch' }],
  motion: [[0.02, 0.11, 110]],
  steps: [{ t: 0.02, foot: 0, dx: 12, dur: 0.09 }],
  cancel: 0.14,
  stamina: 3,
  range: [16, 60],
  speed: 'fast',
});

def('cross', {
  keys: [
    [0, GUARD],
    [0.07, P({ torso: 4, head: -6, sB: 30, eB: 128, sA: 46, eA: 118, px: -2 }, GUARD), 'outQuad'],
    [0.14, P({ torso: 28, head: -16, sB: 96, eB: 4, sA: 34, eA: 132, px: 8 }, GUARD), 'outCubic'],
    [0.21, P({ torso: 26, head: -14, sB: 92, eB: 12, sA: 34, eA: 132, px: 8 }, GUARD)],
    [0.4, GUARD],
  ],
  hits: [{ t0: 0.11, t1: 0.17, joint: HAND_B, r: 10, dmg: 9, kx: 180, ky: -25, stun: 0.32, poise: 15, height: 'high', kind: 'punch' }],
  motion: [[0.06, 0.15, 150]],
  cancel: 0.2,
  stamina: 5,
  range: [18, 66],
});

def('hook', {
  keys: [
    [0, GUARD],
    [0.07, P({ torso: -4, head: -6, sA: 72, eA: 92, sB: 20, eB: 140, px: -2 }, GUARD), 'outQuad'],
    [0.15, P({ torso: 26, head: -14, sA: 98, eA: 34, sB: 22, eB: 140, px: 6 }, GUARD), 'outCubic'],
    [0.22, P({ torso: 34, head: -12, sA: 90, eA: 52, sB: 24, eB: 138, px: 7 }, GUARD)],
    [0.4, GUARD],
  ],
  hits: [{ t0: 0.12, t1: 0.18, joint: HAND_A, r: 11, dmg: 8, kx: 150, ky: -40, stun: 0.3, poise: 14, height: 'high', kind: 'punch' }],
  motion: [[0.08, 0.16, 90]],
  cancel: 0.22,
  stamina: 5,
  range: [12, 54],
});

def('uppercut', {
  keys: [
    [0, GUARD],
    [0.08, P({ torso: 24, head: -6, sB: 10, eB: 100, sA: 40, eA: 120, py: 33, px: 2 }, GUARD), 'outQuad'],
    [0.17, P({ torso: -6, head: -22, sB: 112, eB: 78, sA: 30, eA: 130, py: 42, px: 8 }, GUARD), 'outCubic'],
    [0.25, P({ torso: -10, head: -24, sB: 122, eB: 80, sA: 30, eA: 130, py: 43, px: 8 }, GUARD)],
    [0.46, GUARD],
  ],
  hits: [{ t0: 0.11, t1: 0.2, joint: HAND_B, r: 12, dmg: 10, kx: 110, ky: -430, stun: 0.45, poise: 26, height: 'high', kind: 'punch', launch: true }],
  motion: [[0.08, 0.18, 110]],
  cancel: 0.26,
  stamina: 6,
  range: [8, 42],
});

def('elbow', {
  keys: [
    [0, GUARD],
    [0.06, P({ torso: 2, sA: 75, eA: 150 }, GUARD), 'outQuad'],
    [0.12, P({ torso: 26, head: -10, sA: 100, eA: 158, px: 6 }, GUARD), 'outCubic'],
    [0.18, P({ torso: 24, head: -10, sA: 98, eA: 156, px: 6 }, GUARD)],
    [0.34, GUARD],
  ],
  hits: [{ t0: 0.09, t1: 0.15, joint: ELB_A, r: 11, dmg: 8, kx: 140, ky: -30, stun: 0.3, poise: 16, height: 'high', kind: 'punch' }],
  motion: [[0.04, 0.12, 120]],
  cancel: 0.18,
  stamina: 4,
  range: [4, 34],
});

def('knee', {
  keys: [
    [0, GUARD],
    [0.08, P({ torso: 4, head: -6, sA: 70, eA: 50, sB: 60, eB: 60, hA: 50, kA: 100, py: 40 }, GUARD), 'outQuad'],
    [0.16, P({ torso: -8, head: -12, sA: 55, eA: 40, sB: 50, eB: 50, hA: 115, kA: 125, px: 8, py: 42 }, GUARD), 'outCubic'],
    [0.24, P({ torso: -6, head: -10, sA: 55, eA: 44, sB: 50, eB: 54, hA: 108, kA: 120, px: 8, py: 42 }, GUARD)],
    [0.42, GUARD],
  ],
  legs: { A: [[0.03, 0.34]] },
  hits: [{ t0: 0.12, t1: 0.2, joint: KNEE_A, r: 12, dmg: 10, kx: 130, ky: -170, stun: 0.36, poise: 20, height: 'mid', kind: 'kick' }],
  motion: [[0.06, 0.16, 100]],
  cancel: 0.24,
  stamina: 6,
  range: [4, 36],
});

def('teep', {
  keys: [
    [0, GUARD],
    [0.1, P({ torso: -6, head: -4, hA: 92, kA: 115, sA: 40, eA: 110, sB: 24, eB: 130, py: 40 }, GUARD), 'outQuad'],
    [0.18, P({ torso: -20, head: 6, hA: 88, kA: 6, sA: 30, eA: 90, sB: 10, eB: 120, px: 4, py: 41 }, GUARD), 'outCubic'],
    [0.27, P({ torso: -18, head: 4, hA: 84, kA: 14, sA: 30, eA: 90, sB: 10, eB: 120, px: 4, py: 41 }, GUARD)],
    [0.4, P({ torso: -4, hA: 60, kA: 85 }, GUARD)],
    [0.54, GUARD],
  ],
  legs: { A: [[0.03, 0.46]] },
  hits: [{ t0: 0.14, t1: 0.25, joint: FOOT_A, r: 12, dmg: 7, kx: 440, ky: -70, stun: 0.42, poise: 32, height: 'mid', kind: 'kick', push: true }],
  motion: [[0.12, 0.2, 60]],
  cancel: 0.36,
  stamina: 7,
  range: [22, 68],
  crowd: true,
});

def('roundhouse', {
  keys: [
    [0, GUARD],
    [0.1, P({ torso: -12, head: -6, hB: 55, kB: 120, sA: 60, eA: 100, sB: 0, eB: 90, px: 6, py: 40 }, GUARD), 'outQuad'],
    [0.19, P({ torso: -38, head: 12, hB: 126, kB: 10, sA: 70, eA: 50, sB: -35, eB: 30, px: 8, py: 42 }, GUARD), 'outCubic'],
    [0.28, P({ torso: -32, head: 10, hB: 110, kB: 26, sA: 65, eA: 60, sB: -25, eB: 40, px: 8, py: 42 }, GUARD)],
    [0.42, P({ torso: -8, hB: 40, kB: 90 }, GUARD)],
    [0.56, GUARD],
  ],
  legs: { B: [[0.03, 0.48]] },
  hits: [{ t0: 0.15, t1: 0.25, joint: FOOT_B, r: 12, dmg: 12, kx: 270, ky: -140, stun: 0.5, poise: 36, height: 'high', kind: 'kick' }],
  motion: [[0.06, 0.16, 70]],
  cancel: 0.38,
  stamina: 9,
  range: [24, 72],
});

def('spinkick', {
  keys: [
    [0, GUARD],
    [0.1, P({ torso: 6, head: -10, sA: 30, eA: 130, sB: 20, eB: 130, hB: -10, kB: 30, px: -2, py: 39 }, GUARD), 'inQuad'],
    [0.13, P({ torso: 20, head: -26, sA: 30, eA: 120, sB: 30, eB: 120, hB: -30, kB: 80, px: -4, py: 39 }, GUARD), 'linear'],
    [0.17, P({ torso: 34, head: -32, sA: 40, eA: 100, sB: 30, eB: 110, hB: -42, kB: 102, px: -6, py: 38 }, GUARD), 'outQuad'],
    [0.24, P({ torso: 46, head: -36, sA: 62, eA: 60, sB: 22, eB: 60, hB: -94, kB: 6, px: -10, py: 40 }, GUARD), 'outCubic'],
    [0.32, P({ torso: 44, head: -34, sA: 60, eA: 62, sB: 22, eB: 62, hB: -88, kB: 14, px: -10, py: 40 }, GUARD)],
    [0.44, P({ torso: 12, head: -12, hB: -30, kB: 80, px: -4 }, GUARD)],
    [0.5, P({ torso: 6, head: -6, sA: 30, eA: 125, sB: 20, eB: 130, px: 0 }, GUARD), 'linear'],
    [0.62, GUARD],
  ],
  flips: [0.13, 0.5],
  legs: { B: [[0.1, 0.5]] },
  hits: [{ t0: 0.2, t1: 0.32, joint: FOOT_B, r: 13, dmg: 14, kx: 500, ky: -150, stun: 0.55, poise: 44, height: 'mid', kind: 'kick', abs: true }],
  motion: [[0.16, 0.26, -60]],
  cancel: 0.48,
  stamina: 11,
  range: [24, 72],
  crowd: true,
  heroOnly: true,
});

def('sweep', {
  autoGround: true,
  keys: [
    [0, GUARD],
    [0.1, P({ torso: 35, head: -30, sA: 100, eA: 20, sB: 130, eB: 30, hA: 40, kA: 120, hB: -37, kB: 53, py: 20 }, GUARD), 'outQuad'],
    [0.2, P({ torso: 40, head: -34, sA: 95, eA: 15, sB: 140, eB: 20, hA: 76, kA: 4, hB: -37, kB: 53, py: 18, px: 6 }, GUARD), 'outCubic'],
    [0.3, P({ torso: 36, head: -30, sA: 95, eA: 15, sB: 140, eB: 20, hA: 80, kA: 10, hB: -37, kB: 53, py: 18, px: 6 }, GUARD)],
    [0.44, P({ torso: 20, head: -14, hA: 30, kA: 110, hB: -20, kB: 80, py: 28 }, GUARD)],
    [0.62, GUARD],
  ],
  legs: { A: [[0.05, 0.5]], B: [[0.05, 0.52]] },
  hits: [{ t0: 0.15, t1: 0.3, joint: FOOT_A, r: 13, dmg: 4, kx: 140, ky: -230, stun: 0.5, poise: 999, height: 'low', kind: 'kick', sweep: true }],
  cancel: 0.5,
  stamina: 7,
  range: [18, 62],
  crowd: true,
});

def('flyingkick', {
  keys: [
    [0, GUARD],
    [0.08, P({ torso: 16, head: -10, py: 33, hA: 30, kA: 60, hB: -30, kB: 50 }, GUARD), 'outQuad'],
    [0.2, P({ torso: -4, head: -8, sA: 80, eA: 70, sB: 30, eB: 90, hA: 85, kA: 110, hB: 10, kB: 120 }, GUARD), 'outQuad'],
    [0.3, P({ torso: -26, head: 2, sA: 60, eA: 40, sB: -20, eB: 40, hA: 92, kA: 4, hB: -10, kB: 110 }, GUARD), 'outCubic'],
    [0.55, P({ torso: -24, head: 2, sA: 60, eA: 40, sB: -20, eB: 40, hA: 90, kA: 8, hB: -10, kB: 110 }, GUARD)],
    [0.8, P({ torso: 8, sA: 70, eA: 60, sB: 40, eB: 60, hA: 30, kA: 40, hB: -15, kB: 30 }, GUARD)],
  ],
  air: { t: 0.08, vx: 430, vy: 520, legsFrom: 0.08 },
  legs: { A: [[0.0, 0.8]], B: [[0.0, 0.8]] },
  hits: [{ t0: 0.26, t1: 0.52, joint: FOOT_A, r: 13, dmg: 13, kx: 400, ky: -130, stun: 0.5, poise: 40, height: 'mid', kind: 'kick' }],
  endOnLand: 0.3,
  cancel: 0.9,
  stamina: 10,
  range: [110, 250],
});

def('backkick', {
  keys: [
    [0, GUARD],
    [0.08, P({ torso: 14, head: -20, hB: 20, kB: 110, sA: 40, eA: 110, py: 39 }, GUARD), 'outQuad'],
    [0.15, P({ torso: 40, head: -40, hB: -88, kB: 4, sA: 60, eA: 80, sB: 40, eB: 100, px: 2, py: 41 }, GUARD), 'outCubic'],
    [0.23, P({ torso: 38, head: -38, hB: -84, kB: 10, sA: 60, eA: 80, sB: 40, eB: 100, px: 2, py: 41 }, GUARD)],
    [0.36, P({ torso: 12, hB: -20, kB: 70 }, GUARD)],
    [0.44, GUARD],
  ],
  legs: { B: [[0.02, 0.38]] },
  hits: [{ t0: 0.11, t1: 0.22, joint: FOOT_B, r: 12, dmg: 9, kx: -340, ky: -70, stun: 0.4, poise: 28, height: 'mid', kind: 'kick', back: true }],
  cancel: 0.3,
  stamina: 7,
  range: [-66, -20],
  back: true,
  crowd: true,
});

def('backelbow', {
  keys: [
    [0, GUARD],
    [0.07, P({ torso: 4, head: -20, sB: -20, eB: 150 }, GUARD), 'outQuad'],
    [0.13, P({ torso: -10, head: -30, sB: -75, eB: 160, sA: 40, eA: 120 }, GUARD), 'outCubic'],
    [0.2, P({ torso: -8, head: -28, sB: -70, eB: 158 }, GUARD)],
    [0.34, GUARD],
  ],
  hits: [{ t0: 0.09, t1: 0.17, joint: ELB_B, r: 11, dmg: 7, kx: -190, ky: -30, stun: 0.32, poise: 18, height: 'high', kind: 'punch', back: true }],
  cancel: 0.2,
  stamina: 4,
  range: [-34, -4],
  back: true,
});

def('shove', {
  keys: [
    [0, GUARD],
    [0.06, P({ torso: 6, sA: 60, eA: 110, sB: 50, eB: 120 }, GUARD), 'outQuad'],
    [0.14, P({ torso: 26, head: -10, sA: 92, eA: 8, sB: 88, eB: 12, px: 10 }, GUARD), 'outCubic'],
    [0.22, P({ torso: 22, head: -8, sA: 90, eA: 14, sB: 86, eB: 16, px: 10 }, GUARD)],
    [0.45, GUARD],
  ],
  hits: [{ t0: 0.1, t1: 0.18, joint: HAND_A, r: 14, dmg: 2, kx: 380, ky: -90, stun: 0.5, poise: 26, height: 'mid', kind: 'push', push: true }],
  motion: [[0.06, 0.16, 130]],
  cancel: 0.3,
  stamina: 4,
  range: [10, 44],
  crowd: true,
});

// Grabs and throws ------------------------------------------------------------
def('grab', {
  type: 'grab',
  keys: [
    [0, GUARD],
    [0.07, P({ torso: 18, head: -8, sA: 88, eA: 24, sB: 80, eB: 30, px: 6 }, GUARD), 'outQuad'],
    [0.14, P({ torso: 22, sA: 84, eA: 40, sB: 78, eB: 44, px: 10 }, GUARD)],
    [0.42, GUARD],
  ],
  grab: [0.07, 0.18],
  motion: [[0.04, 0.14, 160]],
  stamina: 5,
  range: [10, 46],
});

def('bearhug', {
  type: 'grab',
  keys: [
    [0, GUARD],
    [0.12, P({ torso: 26, head: -10, sA: 96, eA: 20, sB: 90, eB: 26, px: 6, py: 37 }, GUARD), 'outQuad'],
    [0.22, P({ torso: 30, sA: 92, eA: 40, sB: 86, eB: 46, px: 12, py: 37 }, GUARD)],
    [0.6, GUARD],
  ],
  grab: [0.12, 0.26],
  motion: [[0.06, 0.22, 200]],
  stamina: 6,
  range: [10, 56],
  enemyOnly: true,
});

// Victim paths are neck/pelvis offsets from the thrower's pelvis (move-start
// facing frame, unscaled, y negative = up). release: [t, vx, vy].
def('hipthrow', {
  type: 'throw',
  keys: [
    [0, P({ torso: 20, sA: 80, eA: 60, sB: 70, eB: 70, px: 4 }, GUARD)],
    [0.18, P({ torso: 30, head: -10, sA: 150, eA: 40, sB: 140, eB: 50, py: 34, px: -2 }, GUARD), 'inOutQuad'],
    [0.36, P({ torso: 50, head: -20, sA: 110, eA: 10, sB: 100, eB: 20, py: 36, px: 4 }, GUARD), 'inOutQuad'],
    [0.48, P({ torso: 42, head: -14, sA: 70, eA: 10, sB: 60, eB: 20, py: 36, px: 6 }, GUARD), 'outQuad'],
    [0.75, GUARD],
  ],
  victim: [
    [0, 26, -40, 26, -4],
    [0.18, 14, -66, 24, -36],
    [0.36, 40, -40, 8, -78],
    [0.46, 58, -6, 34, -60],
  ],
  release: [0.46, 240, 520],
  throwDmg: 12,
  stamina: 6,
  dir: 1,
});

def('shouldertoss', {
  type: 'throw',
  keys: [
    [0, P({ torso: 16, sA: 84, eA: 50, sB: 76, eB: 60, px: 4 }, GUARD)],
    [0.16, P({ torso: -6, head: -14, sA: 160, eA: 60, sB: 150, eB: 70, py: 36 }, GUARD), 'inOutQuad'],
    [0.3, P({ torso: -36, head: -30, sA: 210, eA: 30, sB: 200, eB: 40, py: 38, px: -4 }, GUARD), 'inOutQuad'],
    [0.42, P({ torso: -26, head: -22, sA: 200, eA: 20, sB: 190, eB: 30, py: 39, px: -4 }, GUARD), 'outQuad'],
    [0.7, GUARD],
  ],
  victim: [
    [0, 26, -40, 26, -4],
    [0.16, 10, -80, 30, -50],
    [0.3, -30, -72, 6, -98],
    [0.4, -58, -44, -30, -92],
  ],
  release: [0.4, -620, -160],
  throwDmg: 8,
  stamina: 7,
  dir: -1,
});

def('spinthrow', {
  type: 'throw',
  keys: [
    [0, P({ torso: 16, sA: 84, eA: 50, sB: 76, eB: 60, px: 4 }, GUARD)],
    [0.2, P({ torso: -18, head: -8, sA: 96, eA: 8, sB: 90, eB: 12, py: 38 }, GUARD)],
    [0.5, P({ torso: -24, head: -8, sA: 96, eA: 6, sB: 92, eB: 10, py: 38 }, GUARD)],
    [0.82, P({ torso: -26, head: -6, sA: 96, eA: 6, sB: 92, eB: 10, py: 38 }, GUARD)],
    [0.94, P({ torso: 20, head: -10, sA: 90, eA: 10, sB: 80, eB: 20, px: 6, py: 38 }, GUARD), 'outQuad'],
    [1.15, GUARD],
  ],
  flips: [0.42, 0.8],
  victim: [
    [0, 26, -40, 26, -4],
    [0.2, 56, -52, 84, -44],
    [0.42, 8, -60, 4, -62],
    [0.62, -60, -62, -92, -60],
    [0.8, -6, -64, -4, -66],
    [0.92, 58, -58, 92, -56],
  ],
  release: [0.92, 720, -90],
  throwDmg: 6,
  stamina: 10,
  dir: 1,
  heroOnly: true,
});

def('reversal', {
  type: 'throw',
  keys: [
    [0, P({ torso: 10, head: -16, sA: 140, eA: 100, sB: 130, eB: 110 }, GUARD)],
    [0.16, P({ torso: 34, head: -10, sA: 180, eA: 60, sB: 170, eB: 70, py: 34 }, GUARD), 'inOutQuad'],
    [0.32, P({ torso: 56, head: -24, sA: 110, eA: 10, sB: 100, eB: 20, py: 34, px: 4 }, GUARD), 'inOutQuad'],
    [0.42, P({ torso: 44, head: -14, sA: 70, eA: 10, sB: 60, eB: 20, py: 36, px: 6 }, GUARD), 'outQuad'],
    [0.7, GUARD],
  ],
  victim: [
    [0, -22, -44, -20, -6],
    [0.16, -6, -84, -12, -52],
    [0.32, 32, -66, 8, -100],
    [0.42, 62, -12, 36, -70],
  ],
  release: [0.42, 300, 560],
  throwDmg: 14,
  stamina: 8,
  dir: 1,
  heroOnly: true,
});

// Defence and evasion ---------------------------------------------------------
def('parry', {
  type: 'parry',
  keys: [
    [0, GUARD],
    [0.05, P({ torso: 4, head: -4, sA: 108, eA: 46, sB: 30, eB: 130 }, GUARD), 'outQuad'],
    [0.13, P({ torso: -2, head: -6, sA: 70, eA: 84 }, GUARD)],
    [0.36, GUARD],
  ],
  parryWin: [0, 0.17],
  cancel: 0.2,
  stamina: 3,
  heroOnly: true,
});

def('backstep', {
  type: 'dodge',
  keys: [
    [0, GUARD],
    [0.06, P({ torso: -8, head: 4, sA: 50, eA: 120, py: 37 }, GUARD), 'outQuad'],
    [0.2, P({ torso: 2, head: -2, py: 38 }, GUARD)],
    [0.32, GUARD],
  ],
  motion: [[0.0, 0.18, -380]],
  cancel: 0.22,
  stamina: 6,
});

def('duck', {
  type: 'dodge',
  keys: [
    [0, GUARD],
    [0.07, P({ torso: 40, head: -28, sA: 46, eA: 130, sB: 30, eB: 140, py: 25, px: 4 }, GUARD), 'outQuad'],
    [0.26, P({ torso: 38, head: -26, sA: 46, eA: 130, sB: 30, eB: 140, py: 26, px: 4 }, GUARD)],
    [0.4, GUARD],
  ],
  cancel: 0.18,
  stamina: 4,
});

const TUCK = { torso: 20, head: 40, sA: 150, eA: 90, sB: 140, eB: 100, hA: 130, kA: 150, hB: 125, kB: 150 };
def('roll', {
  autoGround: true,
  type: 'dodge',
  keys: [
    [0, GUARD],
    [0.06, P({ rot: 30, torso: 20, head: 30, sA: 120, eA: 60, sB: 110, eB: 70, hA: 110, kA: 140, hB: 100, kB: 140, py: 26 }, GUARD), 'outQuad'],
    [0.17, P({ rot: 130, ...TUCK, py: 21 }, GUARD), 'linear'],
    [0.28, P({ rot: 230, ...TUCK, py: 21 }, GUARD), 'linear'],
    [0.39, P({ rot: 320, torso: 10, head: 20, sA: 90, eA: 80, sB: 80, eB: 90, hA: 100, kA: 120, hB: 60, kB: 120, py: 24 }, GUARD), 'linear'],
    [0.52, P({ rot: 360 }, GUARD), 'outQuad'],
  ],
  legs: { A: [[0.02, 0.46]], B: [[0.02, 0.46]] },
  motion: [[0.02, 0.44, 410]],
  iframes: [0.05, 0.4],
  pass: [0, 0.5],
  cancel: 0.46,
  stamina: 10,
});

def('vault', {
  autoGround: true,
  type: 'dodge',
  keys: [
    [0, GUARD],
    [0.06, P({ torso: 14, py: 32, hA: 30, kA: 60, hB: -24, kB: 50 }, GUARD), 'outQuad'],
    [0.2, P({ rot: 90, torso: 10, head: 20, sA: 140, eA: 60, sB: 130, eB: 70, hA: 120, kA: 140, hB: 115, kB: 140 }, GUARD), 'linear'],
    [0.35, P({ rot: 200, ...TUCK }, GUARD), 'linear'],
    [0.5, P({ rot: 320, sA: 90, eA: 40, sB: 80, eB: 40, hA: 40, kA: 60, hB: 10, kB: 50 }, GUARD), 'linear'],
    [0.7, P({ rot: 360, torso: 10, hA: 25, kA: 35, hB: -15, kB: 25, sA: 70, eA: 50, sB: 50, eB: 60 }, GUARD), 'outQuad'],
  ],
  air: { t: 0.06, vx: 330, vy: 800, legsFrom: 0.06 },
  legs: { A: [[0, 0.7]], B: [[0, 0.7]] },
  pass: [0, 0.8],
  iframes: [0.1, 0.5],
  endOnLand: 0.3,
  cancel: 0.9,
  stamina: 12,
  heroOnly: true,
});

def('hop', {
  type: 'dodge',
  keys: [
    [0, GUARD],
    [0.06, P({ torso: 14, py: 32 }, GUARD), 'outQuad'],
    [0.25, AIR_UP],
    [0.5, AIR_DOWN],
  ],
  air: { t: 0.06, vx: 260, vy: 700, legsFrom: 0.06 },
  legs: { A: [[0, 0.6]], B: [[0, 0.6]] },
  endOnLand: 0.2,
  cancel: 0.9,
  stamina: 6,
});

// Get-ups (first key is replaced by the ragdoll snapshot at runtime) ------------
def('getupBack', {
  autoGround: true,
  type: 'getup',
  keys: [
    [0, GUARD],
    [0.28, P({ rot: -20, torso: 10, head: 10, sA: -30, eA: 20, sB: -40, eB: 10, hA: 85, kA: 110, hB: 70, kB: 120, py: 12 }, GUARD), 'outQuad'],
    [0.55, P({ rot: 10, torso: 30, head: -10, sA: 50, eA: 60, sB: 30, eB: 70, hA: 60, kA: 120, hB: 0, kB: 120, py: 22 }, GUARD)],
    [0.78, P({ torso: 16, head: -10, py: 33 }, GUARD)],
    [0.95, GUARD],
  ],
  legs: { A: [[0, 0.62]], B: [[0, 0.62]] },
  cancel: 0.9,
});

def('getupFront', {
  autoGround: true,
  type: 'getup',
  keys: [
    [0, GUARD],
    [0.3, P({ rot: 65, torso: 0, head: -35, sA: 80, eA: 0, sB: 75, eB: 5, hA: -10, kA: 30, hB: 10, kB: 60, py: 12 }, GUARD), 'outQuad'],
    [0.55, P({ rot: 30, torso: 10, head: -25, sA: 60, eA: 40, sB: 50, eB: 50, hA: 100, kA: 110, hB: -20, kB: 120, py: 20 }, GUARD)],
    [0.8, P({ torso: 18, head: -10, py: 32 }, GUARD)],
    [1.0, GUARD],
  ],
  legs: { A: [[0, 0.62]], B: [[0, 0.62]] },
  cancel: 0.95,
});

def('kipup', {
  autoGround: true,
  type: 'getup',
  keys: [
    [0, GUARD],
    [0.12, P({ rot: -120, torso: 10, head: 20, sA: 170, eA: 30, sB: 165, eB: 40, hA: 140, kA: 120, hB: 135, kB: 125, py: 12 }, GUARD), 'outQuad'],
    [0.26, P({ rot: -40, torso: 0, head: 10, sA: 150, eA: 10, sB: 140, eB: 20, hA: 30, kA: 90, hB: 20, kB: 100, py: 32 }, GUARD), 'outCubic'],
    [0.4, P({ rot: 5, torso: 24, head: -10, sA: 60, eA: 90, sB: 40, eB: 100, py: 30 }, GUARD), 'outQuad'],
    [0.62, GUARD],
  ],
  legs: { A: [[0, 0.36]], B: [[0, 0.36]] },
  cancel: 0.5,
  heroOnly: true,
});

def('pickup', {
  type: 'special',
  keys: [
    [0, GUARD],
    [0.14, P({ torso: 52, head: -30, sA: 110, eA: 10, sB: 60, eB: 60, py: 27 }, GUARD), 'outQuad'],
    [0.36, GUARD],
  ],
  event: [0.14, 'pickup'],
  cancel: 0.3,
});

// Weapon attacks --------------------------------------------------------------
def('wswing', {
  keys: [
    [0, WEAPON_GUARD],
    [0.12, P({ torso: -12, head: -6, sA: 175, eA: 40, sB: 160, eB: 50, px: -4 }, GUARD), 'outQuad'],
    [0.22, P({ torso: 30, head: -12, sA: 70, eA: 8, sB: 62, eB: 14, px: 8 }, GUARD), 'outCubic'],
    [0.3, P({ torso: 36, head: -10, sA: 40, eA: 10, sB: 36, eB: 14, px: 8 }, GUARD)],
    [0.55, WEAPON_GUARD],
  ],
  hits: [{ t0: 0.15, t1: 0.28, joint: WEAPON_TIP, r: 9, dmg: 8, kx: 300, ky: -90, stun: 0.45, poise: 34, height: 'high', kind: 'weapon' }],
  motion: [[0.12, 0.24, 90]],
  cancel: 0.36,
  stamina: 7,
  range: [16, 86],
  weapon: true,
  crowd: true,
});

def('woverhead', {
  keys: [
    [0, WEAPON_GUARD],
    [0.2, P({ torso: -18, head: -10, sA: 200, eA: 20, sB: 195, eB: 25, py: 41 }, GUARD), 'outQuad'],
    [0.3, P({ torso: 40, head: -6, sA: 80, eA: 0, sB: 76, eB: 5, py: 36, px: 8 }, GUARD), 'inCubic'],
    [0.4, P({ torso: 38, head: -6, sA: 78, eA: 2, sB: 74, eB: 6, py: 36, px: 8 }, GUARD)],
    [0.66, WEAPON_GUARD],
  ],
  hits: [{ t0: 0.24, t1: 0.34, joint: WEAPON_TIP, r: 10, dmg: 12, kx: 170, ky: 260, stun: 0.6, poise: 60, height: 'high', kind: 'weapon' }],
  motion: [[0.2, 0.3, 80]],
  cancel: 0.5,
  stamina: 9,
  range: [20, 86],
  weapon: true,
});

def('wthrust', {
  keys: [
    [0, WEAPON_GUARD],
    [0.08, P({ torso: 2, sA: 60, eA: 90, sB: 40, eB: 100 }, GUARD), 'outQuad'],
    [0.15, P({ torso: 24, head: -10, sA: 92, eA: 4, sB: 84, eB: 10, px: 8 }, GUARD), 'outCubic'],
    [0.22, P({ torso: 22, sA: 90, eA: 8, sB: 82, eB: 14, px: 8 }, GUARD)],
    [0.4, WEAPON_GUARD],
  ],
  hits: [{ t0: 0.11, t1: 0.19, joint: WEAPON_TIP, r: 9, dmg: 6, kx: 230, ky: -30, stun: 0.35, poise: 20, height: 'mid', kind: 'weapon' }],
  motion: [[0.06, 0.15, 120]],
  cancel: 0.24,
  stamina: 4,
  range: [24, 92],
  weapon: true,
});

def('wthrow', {
  type: 'special',
  keys: [
    [0, WEAPON_GUARD],
    [0.15, P({ torso: -14, head: -6, sA: 200, eA: 60, sB: 40, eB: 90 }, GUARD), 'outQuad'],
    [0.25, P({ torso: 30, head: -10, sA: 80, eA: 10, sB: 30, eB: 100, px: 6 }, GUARD), 'outCubic'],
    [0.5, GUARD],
  ],
  event: [0.23, 'throwWeapon'],
  stamina: 5,
  range: [140, 520],
});

// Enemy repertoire --------------------------------------------------------------
def('haymaker', {
  keys: [
    [0, GUARD],
    [0.22, P({ torso: -14, head: -4, sB: -50, eB: 70, sA: 50, eA: 90, px: -4 }, GUARD), 'outQuad'],
    [0.34, P({ torso: 32, head: -14, sB: 96, eB: 30, sA: 20, eA: 60, px: 10 }, GUARD), 'inQuad'],
    [0.44, P({ torso: 42, head: -10, sB: 60, eB: 70, sA: 0, eA: 40, px: 12 }, GUARD)],
    [0.7, GUARD],
  ],
  hits: [{ t0: 0.28, t1: 0.38, joint: HAND_B, r: 12, dmg: 11, kx: 240, ky: -60, stun: 0.4, poise: 22, height: 'high', kind: 'punch' }],
  motion: [[0.24, 0.4, 170]],
  cancel: 0.6,
  stamina: 8,
  range: [16, 64],
  overcommit: true,
  enemyOnly: true,
});

def('tackle', {
  keys: [
    [0, GUARD],
    [0.16, P({ torso: 52, head: -42, sA: 92, eA: 20, sB: 84, eB: 30, py: 34 }, GUARD), 'outQuad'],
    [0.8, P({ torso: 54, head: -42, sA: 92, eA: 20, sB: 84, eB: 30, py: 34 }, GUARD)],
    [0.95, GUARD],
  ],
  hits: [{ t0: 0.14, t1: 0.75, joint: HEAD, r: 18, dmg: 6, kx: 360, ky: -110, stun: 0.6, poise: 999, height: 'mid', kind: 'body', tackle: true }],
  motion: [[0.1, 0.75, 470]],
  cancel: 0.9,
  stamina: 10,
  range: [70, 240],
  overcommit: true,
  enemyOnly: true,
});

def('groundkick', {
  keys: [
    [0, GUARD],
    [0.12, P({ torso: 12, head: 22, hA: 70, kA: 110 }, GUARD), 'outQuad'],
    [0.22, P({ torso: 22, head: 26, hA: 42, kA: 8, px: 4 }, GUARD), 'outCubic'],
    [0.3, P({ torso: 20, head: 24, hA: 44, kA: 14, px: 4 }, GUARD)],
    [0.5, GUARD],
  ],
  legs: { A: [[0.04, 0.42]] },
  hits: [{ t0: 0.16, t1: 0.27, joint: FOOT_A, r: 13, dmg: 6, kx: 140, ky: -60, stun: 0, poise: 0, height: 'ground', kind: 'kick', ground: true }],
  cancel: 0.4,
  stamina: 4,
  range: [10, 60],
});

def('throwobj', {
  type: 'special',
  keys: [
    [0, GUARD],
    [0.2, P({ torso: -12, head: -8, sB: -60, eB: 90, sA: 60, eA: 60 }, GUARD), 'outQuad'],
    [0.3, P({ torso: 26, head: -12, sB: 110, eB: 10, sA: 30, eA: 90, px: 4 }, GUARD), 'outCubic'],
    [0.6, GUARD],
  ],
  event: [0.28, 'throwObject'],
  stamina: 4,
  range: [160, 560],
  enemyOnly: true,
});

def('jumpsquat', {
  type: 'special',
  keys: [
    [0, GUARD],
    [0.07, P({ torso: 16, head: -10, py: 31 }, GUARD), 'outQuad'],
  ],
  cancel: 1,
  keepVel: true,
});

export const STRIKES_HERO = ['jab', 'cross', 'hook', 'uppercut', 'elbow', 'knee', 'teep', 'roundhouse', 'spinkick', 'sweep', 'flyingkick', 'shove'];
export const BACK_MOVES = ['backkick', 'backelbow'];
export const WEAPON_MOVES = ['wswing', 'woverhead', 'wthrust'];

// Enemy styles: weighted moves they may use.
export const STYLES = {
  boxer: [['jab', 4], ['cross', 3], ['hook', 2], ['uppercut', 1]],
  brawler: [['haymaker', 4], ['jab', 2], ['cross', 2], ['shove', 1]],
  kicker: [['teep', 3], ['roundhouse', 2], ['jab', 1], ['knee', 1], ['flyingkick', 1]],
  grappler: [['bearhug', 4], ['jab', 1], ['knee', 2], ['tackle', 1]],
  wild: [['haymaker', 3], ['tackle', 2], ['hook', 2], ['knee', 1]],
  balanced: [['jab', 3], ['cross', 2], ['teep', 1], ['hook', 1], ['roundhouse', 1]],
};
