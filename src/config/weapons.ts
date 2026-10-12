// Weapon table, taken from the original game data (py-sealhunter constants.py
// and the official changelog). Tick values are at 50 ticks/s.
import { GAME_GRAVITY, PX_H, PX_X, SPD_X } from './constants';

export type WeaponId =
  | 'pistol'
  | 'magnum'
  | 'mp5'
  | 'grenades'
  | 'shotgun'
  | 'mac10'
  | 'flunk'
  | 'm4'
  | 'awp'
  | 'vintage'
  | 'minigun';

export type MuzzleKind = 'none' | 'small' | 'big' | 'shotgun';
export type ShellKind = 'none' | 'small' | 'normal' | 'shotgun' | 'awp' | 'minigun';
export type ClipKind = 'none' | 'small' | 'mp5' | 'mac' | 'awp' | 'drum' | 'belt';

export interface WeaponDef {
  id: WeaponId;
  name: string;
  /** HUD slot 1..10 (pistol has none). */
  slot: number;
  price: number;
  kind: 'hitscan' | 'grenade' | 'launcher';
  damage: number;
  /** Extra damage per level above 1. */
  damageInc: number;
  clip: number;
  /** Rounds consumed per trigger pull. */
  perShot: number;
  pellets: number;
  fireTicks: number;
  reloadTicks: number;
  /** Original screen-space accuracy angle, ± degrees. */
  spreadDeg: number;
  /** Fraction of a bullet's energy kept after passing through a body. */
  pierce: number;
  /** Recoil pushing the hunter right, m/s. */
  recoilX: number;
  /** Recoil hop, m/s upward. */
  recoilUp: number;
  /** Crosshair distance in front of the hunter, metres. */
  crossOffset: number;
  muzzle: MuzzleKind;
  shell: ShellKind;
  clipKind: ClipKind;
  /** Explosion radius (m) for grenade/launcher. */
  splash: number;
  /** Laser sight. */
  laser: boolean;
}

const zRecoilToUp = (zr: number) => {
  if (zr <= 0) return 0;
  const peakPx = (zr * zr) / (2 * 0.33);
  return Math.sqrt(2 * GAME_GRAVITY * peakPx * PX_H);
};

const W = (
  d: Omit<WeaponDef, 'recoilX' | 'recoilUp' | 'crossOffset' | 'perShot' | 'pellets' | 'damageInc' | 'pierce' | 'spreadDeg' | 'splash' | 'laser'> & {
    xRecoil?: number;
    zRecoil?: number;
    crossPx?: number;
    perShot?: number;
    pellets?: number;
    damageInc?: number;
    pierce?: number;
    spreadDeg?: number;
    splash?: number;
    laser?: boolean;
  },
): WeaponDef => ({
  ...d,
  perShot: d.perShot ?? 1,
  pellets: d.pellets ?? 1,
  damageInc: d.damageInc ?? 0,
  pierce: d.pierce ?? 0,
  spreadDeg: d.spreadDeg ?? 0,
  splash: d.splash ?? 0,
  laser: d.laser ?? false,
  recoilX: (d.xRecoil ?? 0) * SPD_X,
  recoilUp: zRecoilToUp(d.zRecoil ?? 0),
  crossOffset: (d.crossPx ?? 40) * PX_X,
});

export const WEAPONS: Record<WeaponId, WeaponDef> = {
  pistol: W({
    id: 'pistol', name: 'USP', slot: 0, price: 0, kind: 'hitscan',
    damage: 18, clip: 12, fireTicks: 13, reloadTicks: 100,
    muzzle: 'small', shell: 'small', clipKind: 'small', crossPx: 48,
  }),
  magnum: W({
    id: 'magnum', name: 'Magnum', slot: 1, price: 500, kind: 'hitscan',
    damage: 60, damageInc: 5, clip: 6, fireTicks: 20, reloadTicks: 110, pierce: 0.7,
    xRecoil: 1.0, muzzle: 'big', shell: 'none', clipKind: 'none', crossPx: 48,
  }),
  mp5: W({
    id: 'mp5', name: 'MP5', slot: 2, price: 1000, kind: 'hitscan',
    damage: 23, damageInc: 2, clip: 30, fireTicks: 5, reloadTicks: 80,
    xRecoil: 0.3, muzzle: 'small', shell: 'small', clipKind: 'mp5', crossPx: 48,
  }),
  grenades: W({
    id: 'grenades', name: 'Grenades', slot: 3, price: 1500, kind: 'grenade',
    damage: 250, clip: 1, fireTicks: 8, reloadTicks: 50, splash: 75 * PX_X,
    muzzle: 'none', shell: 'none', clipKind: 'none', crossPx: 60,
  }),
  shotgun: W({
    id: 'shotgun', name: 'Shotgun', slot: 4, price: 2500, kind: 'hitscan',
    damage: 40, pellets: 8, clip: 8, fireTicks: 40, reloadTicks: 125, spreadDeg: 7.5,
    xRecoil: 1.65, zRecoil: 1.9, muzzle: 'shotgun', shell: 'shotgun', clipKind: 'none', crossPx: 80,
  }),
  mac10: W({
    id: 'mac10', name: 'Dual MAC-10', slot: 5, price: 3500, kind: 'hitscan',
    damage: 37, clip: 60, fireTicks: 3, reloadTicks: 130, spreadDeg: 4.0,
    xRecoil: 0.2, muzzle: 'small', shell: 'small', clipKind: 'mac', crossPx: 50,
  }),
  flunk: W({
    id: 'flunk', name: 'Grenade Launcher', slot: 6, price: 5000, kind: 'launcher',
    damage: 400, clip: 5, fireTicks: 20, reloadTicks: 150, splash: 85 * PX_X,
    muzzle: 'big', shell: 'none', clipKind: 'none', crossPx: 60,
  }),
  m4: W({
    id: 'm4', name: 'M4', slot: 7, price: 6000, kind: 'hitscan',
    damage: 60, clip: 30, fireTicks: 5, reloadTicks: 80, pierce: 0.8,
    xRecoil: 0.35, muzzle: 'big', shell: 'normal', clipKind: 'mp5', crossPx: 60,
  }),
  awp: W({
    id: 'awp', name: 'AWP', slot: 8, price: 7500, kind: 'hitscan',
    damage: 855, clip: 5, fireTicks: 66, reloadTicks: 110, pierce: 0.9,
    xRecoil: 3.2, zRecoil: 3.0, muzzle: 'big', shell: 'awp', clipKind: 'awp', crossPx: 60, laser: true,
  }),
  vintage: W({
    id: 'vintage', name: 'Punt Gun', slot: 9, price: 10000, kind: 'hitscan',
    damage: 125, pellets: 15, clip: 2, perShot: 2, fireTicks: 50, reloadTicks: 50, spreadDeg: 5.25,
    pierce: 0.33, xRecoil: 3.0, zRecoil: 3.5, muzzle: 'shotgun', shell: 'shotgun', clipKind: 'none', crossPx: 80,
  }),
  minigun: W({
    id: 'minigun', name: 'Minigun', slot: 10, price: 12500, kind: 'hitscan',
    damage: 65, clip: 150, fireTicks: 13, reloadTicks: 120, spreadDeg: 1, pierce: 0.5,
    xRecoil: 0.25, muzzle: 'big', shell: 'minigun', clipKind: 'belt', crossPx: 80,
  }),
};

export const WEAPON_ORDER: WeaponId[] = [
  'pistol', 'magnum', 'mp5', 'grenades', 'shotgun', 'mac10', 'flunk', 'm4', 'awp', 'vintage', 'minigun',
];

/** Weapons shown in the HUD, slots 1..10. */
export const HUD_WEAPONS: WeaponId[] = WEAPON_ORDER.slice(1);

/** Vintage shotgun: the real shot happens this many ticks after the trigger (cocking both hammers). */
export const VINTAGE_FIRE_DELAY = 35;
/** Shotgun ejects its shell at this tick of the pump cycle. */
export const SHOTGUN_PUMP_TICK = 21;

/**
 * Convert the original's screen-space spread into a yaw angle in the
 * ground plane. A screen-space slope s covers s * (PX_Z/PX_X) metres of depth
 * per metre travelled.
 */
export const spreadToYaw = (deg: number) => {
  const k = 1 / Math.sin((32 * Math.PI) / 180); // PX_Z / PX_X
  return Math.atan(Math.tan((deg * Math.PI) / 180) * k);
};

/** Grenade throw (original: x_speed -4, z_speed +4 px/tick). */
export const GRENADE_THROW = { vx: -4 * SPD_X * 0.85, vy: 7.5, fuseTicks: 50 };
/** Launcher round (original: x_speed -7.7 px/tick from 12 px height). */
export const FLUNK_ROUND = { vx: -7.7 * SPD_X, height: 0.95 };
