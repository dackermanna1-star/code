// Modern handling data for each original weapon. Fire rates, damage and
// ammo economy stay as in DOOM; these values add magazines, reload timing,
// aim-down-sights framing, recoil and effects on top.
//
// Spreads are in degrees. ADS sight points are in weapon-sprite pixels of
// the ready frame (where the barrel/sight should line up with the centre).

import { WP } from './defs.js';

export const WEAPON_CFG = {
  [WP.FIST]: {
    name: 'fist', mag: 0, ads: null, melee: true,
    recoil: { pitch: 0.4, yaw: 0.2, kick: 3, shake: 0 },
  },
  [WP.CHAINSAW]: {
    name: 'chainsaw', mag: 0, ads: null, melee: true,
    recoil: { pitch: 0.15, yaw: 0.3, kick: 1, shake: 0.6 },
  },
  [WP.PISTOL]: {
    name: 'pistol', mag: 12, chamber: true,
    reload: { tactical: 34, empty: 46, rackAt: 0.72 },
    spread: { hipFirst: 0, hip: 5.6, ads: 1.2, vertical: 0.6 },
    ads: { fov: 0.8, speed: 0.22, scale: 1.18, x: 0, y: 6, move: 0.65 },
    recoil: { pitch: 1.1, yaw: 0.35, kick: 7, shake: 0.4, recover: 0.82 },
    casing: 'brass', ejectState: 'S_PISTOL2',
    lightPower: 9,
  },
  [WP.SHOTGUN]: {
    name: 'shotgun', mag: 8, tube: true,
    reload: { start: 8, perShell: 11, end: 10 },
    spread: { hip: 5.6, ads: 3.6, vertical: 1.6, verticalAds: 1.0 },
    ads: { fov: 0.84, speed: 0.16, scale: 1.12, x: 0, y: 10, move: 0.6 },
    recoil: { pitch: 4.2, yaw: 0.9, kick: 16, shake: 2.2, recover: 0.86 },
    casing: 'shell', ejectState: 'S_SGUN5',
    lightPower: 13,
  },
  [WP.SUPERSHOTGUN]: {
    name: 'supershotgun', mag: 0,
    spread: { hip: 11.2, ads: 8, vertical: 7.1 },
    ads: { fov: 0.88, speed: 0.15, scale: 1.08, x: 0, y: 12, move: 0.6 },
    recoil: { pitch: 6.5, yaw: 1.4, kick: 22, shake: 3.4, recover: 0.86 },
    casing: 'shell2', ejectState: 'S_DSGUN5',
    lightPower: 16,
  },
  [WP.CHAINGUN]: {
    name: 'chaingun', mag: 50,
    reload: { tactical: 52, empty: 64, rackAt: 0.8 },
    spread: { hipFirst: 0, hip: 5.6, ads: 2.0, vertical: 0.8 },
    ads: { fov: 0.8, speed: 0.13, scale: 1.12, x: 0, y: 10, move: 0.55 },
    recoil: { pitch: 0.75, yaw: 0.45, kick: 6, shake: 0.7, recover: 0.88, climb: true },
    casing: 'brass', ejectState: null,
    lightPower: 10,
  },
  [WP.MISSILE]: {
    name: 'rocket', mag: 0, heavy: true,
    ads: { fov: 0.86, speed: 0.12, scale: 1.08, x: 0, y: 14, move: 0.55 },
    recoil: { pitch: 2.8, yaw: 0.5, kick: 14, shake: 3.0, recover: 0.9, push: 2.5 },
    lightPower: 12,
  },
  [WP.PLASMA]: {
    name: 'plasma', mag: 0, energy: true,
    spread: { hip: 0.6, ads: 0.15 },
    ads: { fov: 0.82, speed: 0.15, scale: 1.1, x: 0, y: 10, move: 0.6 },
    recoil: { pitch: 0.35, yaw: 0.25, kick: 3, shake: 0.35, recover: 0.85 },
    lightPower: 8,
  },
  [WP.BFG]: {
    name: 'bfg', mag: 0, energy: true, heavy: true,
    ads: null,
    recoil: { pitch: 5, yaw: 0.6, kick: 20, shake: 5.5, recover: 0.92, push: 4 },
    lightPower: 18,
  },
};

// Locational damage zones by monster sprite family (fraction of height).
export const HIT_ZONES = {
  default: { head: 0.8, legs: 0.33, headMult: 1.5, legMult: 0.9 },
  // Floating heads / spheres: no distinct head.
  HEAD: null, SKUL: null, PAIN: null, SPID: { head: 0.92, legs: 0.5, headMult: 1.25, legMult: 0.8 },
  CYBR: { head: 0.86, legs: 0.35, headMult: 1.25, legMult: 0.9 },
  SARG: { head: 0.72, legs: 0.3, headMult: 1.35, legMult: 0.9 },
};
