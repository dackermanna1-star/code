// Shared game constants, angle helpers and the original random number table.

import { RNDTABLE } from './data.js';
import { MF } from './info.js';

export { MF };

export const TICRATE = 35;
export const TIC = 1 / TICRATE;

export const MAPBLOCKSIZE = 128;
export const MAXRADIUS = 32;
export const MAXMOVE = 30;
export const GRAVITY = 1;
export const FRICTION = 0.90625; // 0xe800
export const STOPSPEED = 0x1000 / 65536;
export const VIEWHEIGHT = 41;
export const MAXBOB = 16;
export const USERANGE = 64;
export const MELEERANGE = 64;
export const MISSILERANGE = 32 * 64;
export const FLOATSPEED = 4;
export const ONFLOORZ = -Infinity;
export const ONCEILINGZ = Infinity;
export const MAXHEALTH = 100;

export const ANG90 = Math.PI / 2;
export const ANG180 = Math.PI;
export const ANG270 = Math.PI * 1.5;
export const ANG45 = Math.PI / 4;
export const TAU = Math.PI * 2;
// One step of the original 32-bit BAM angle shifted by 18 bits (spread units).
export const SPREAD_UNIT = TAU / 16384;
// Doom's angle conversion for "angle_t" numbers written in source as e.g. ANG90/8.
export const BAM = TAU / 4294967296;

export function normAngle(a) {
  a %= TAU;
  return a < 0 ? a + TAU : a;
}

// Signed difference b - a in (-PI, PI].
export function angleDiff(a, b) {
  let d = (b - a) % TAU;
  if (d > Math.PI) d -= TAU;
  else if (d <= -Math.PI) d += TAU;
  return d;
}

export function pointToAngle(x1, y1, x2, y2) {
  return normAngle(Math.atan2(y2 - y1, x2 - x1));
}

export function aproxDistance(dx, dy) {
  dx = Math.abs(dx);
  dy = Math.abs(dy);
  if (dx < dy) return dx + dy - dx / 2;
  return dx + dy - dy / 2;
}

// Deterministic game RNG (P_Random) and a separate one for cosmetic effects
// so that gore/particles never perturb gameplay randomness.
export class Random {
  constructor() {
    this.prndindex = 0;
    this.rndindex = 0;
  }

  P() {
    this.prndindex = (this.prndindex + 1) & 0xff;
    return RNDTABLE[this.prndindex];
  }

  M() {
    this.rndindex = (this.rndindex + 1) & 0xff;
    return RNDTABLE[this.rndindex];
  }

  // P_Random() - P_Random()
  sub() {
    const a = this.P();
    return a - this.P();
  }
}

// Deterministic [0,1) generator for gameplay-affecting modern extensions
// (recoil yaw, dropped item tosses). Separate from P_Random so vanilla's
// sequence is untouched; its state lives in w.modSeed (persisted by saves).
export function modRandom(w) {
  w.modSeed = (Math.imul(w.modSeed || 7654321, 1103515245) + 12345) >>> 0;
  return (w.modSeed >>> 8) / 16777216;
}

// Cosmetic randomness (not part of the deterministic sim).
export function frand(min = 0, max = 1) {
  return min + Math.random() * (max - min);
}

export function flagsOf(names) {
  let f = 0;
  for (const n of names) {
    const key = n.replace(/^MF_/, '');
    if (MF[key] === undefined) throw new Error(`unknown flag ${n}`);
    f |= MF[key];
  }
  return f;
}

export const SKILL = { BABY: 0, EASY: 1, MEDIUM: 2, HARD: 3, NIGHTMARE: 4 };

export const MTF = { EASY: 1, NORMAL: 2, HARD: 4, AMBUSH: 8, NOTSINGLE: 16 };

export const CARDS = { BLUECARD: 0, YELLOWCARD: 1, REDCARD: 2, BLUESKULL: 3, YELLOWSKULL: 4, REDSKULL: 5 };

export const PW = { INVULNERABILITY: 0, STRENGTH: 1, INVISIBILITY: 2, IRONFEET: 3, ALLMAP: 4, INFRARED: 5 };
export const INVULNTICS = 30 * TICRATE;
export const INVISTICS = 60 * TICRATE;
export const INFRATICS = 120 * TICRATE;
export const IRONTICS = 60 * TICRATE;

export const WP = {
  FIST: 0, PISTOL: 1, SHOTGUN: 2, CHAINGUN: 3, MISSILE: 4, PLASMA: 5, BFG: 6, CHAINSAW: 7, SUPERSHOTGUN: 8, NOCHANGE: 10,
};
export const AM = { CLIP: 0, SHELL: 1, CELL: 2, MISL: 3, NOAMMO: 5 };
