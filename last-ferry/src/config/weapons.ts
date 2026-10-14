// Weapon table (DESIGN.md §7). Times in seconds, damage per bullet / pellet,
// distances in metres. The logic (src/core/Weapon.ts, Combat.ts) reads every
// number from here; presentation may read names, debris kinds and muzzles.
import type { ClipKind, ShellKind, WeaponId } from './ids';
import { CAMERA_PITCH_DEG } from './view';

export type FireMode = 'hitscan' | 'flare' | 'harpoon';

export interface WeaponDef {
  id: WeaponId;
  /** Full name (HUD tooltip / shop). */
  name: string;
  /** Short HUD label. */
  short: string;
  price: number;
  mode: FireMode;
  /** Damage per bullet / pellet (chapter 1). */
  damage: number;
  /** Pellets per trigger pull. */
  pellets: number;
  clip: number;
  /** Seconds between shots (0 = single shot then reload). */
  fireInterval: number;
  /** Full reload time, or per-shell time when `perShell`. */
  reload: number;
  /** Shells go in one by one (shotgun); firing interrupts the reload. */
  perShell: boolean;
  /** ± spread on screen (degrees); converted to a ground-plane yaw by spreadToYaw. */
  spreadDeg: number;
  /** Extra zombies a projectile passes through (harpoon: up to 5 in total). */
  pierce: number;
  /** Recoil pushing the hunter right (+x), m/s. */
  recoil: number;
  /** Screen shake per shot (DESIGN §10). */
  shake: number;
  /** Outboard: seconds of pull-start spin-up before the first round. */
  spinUp: number;
  /** A head hit within this range blows the head off (DeathKind 'headoff'); 0 = never. */
  headoffRange: number;
  /** Shotgun: zombies hit are shoved back this far (m) and briefly staggered. */
  knockback: number;
  /** Damage multiplier against riot plates. */
  plateMult: number;
  /** Harpoon: plates are ignored (and a shield is torn off). */
  ignoresPlates: boolean;
  /** Presentation debris (ejected shells / dropped magazines). */
  shell: ShellKind;
  clipKind: ClipKind;
}

export const WEAPONS: Record<WeaponId, WeaponDef> = {
  revolver: {
    id: 'revolver', name: '"Old Faithful" revolver', short: 'Old Faithful', price: 0, mode: 'hitscan',
    damage: 34, pellets: 1, clip: 6, fireInterval: 0.3, reload: 1.6, perShell: false, spreadDeg: 0.6, pierce: 0,
    recoil: 0, shake: 0.03, spinUp: 0, headoffRange: 0, knockback: 0, plateMult: 1, ignoresPlates: false,
    shell: 'none', clipKind: 'none',
  },
  nailgun: {
    id: 'nailgun', name: 'Pneumatic nail gun', short: 'Nail Gun', price: 600, mode: 'hitscan',
    damage: 15, pellets: 1, clip: 40, fireInterval: 0.075, reload: 2.0, perShell: false, spreadDeg: 3.5, pierce: 0,
    recoil: 0, shake: 0.015, spinUp: 0, headoffRange: 0, knockback: 0, plateMult: 0.6, ignoresPlates: false,
    shell: 'none', clipKind: 'mp5',
  },
  shotgun: {
    id: 'shotgun', name: 'Pump shotgun', short: 'Pump Shotgun', price: 1500, mode: 'hitscan',
    damage: 16, pellets: 8, clip: 6, fireInterval: 0.75, reload: 0.45, perShell: true, spreadDeg: 9, pierce: 0,
    recoil: 1.6, shake: 0.15, spinUp: 0, headoffRange: 4.5, knockback: 0.6, plateMult: 2, ignoresPlates: false,
    shell: 'shotgun', clipKind: 'none',
  },
  flare: {
    id: 'flare', name: 'Flare pistol', short: 'Flare Pistol', price: 2200, mode: 'flare',
    damage: 50, pellets: 1, clip: 1, fireInterval: 0, reload: 1.2, perShell: false, spreadDeg: 0, pierce: 0,
    recoil: 0.3, shake: 0.05, spinUp: 0, headoffRange: 0, knockback: 0, plateMult: 1, ignoresPlates: false,
    shell: 'normal', clipKind: 'none',
  },
  harpoon: {
    id: 'harpoon', name: 'Harpoon gun', short: 'Harpoon Gun', price: 3500, mode: 'harpoon',
    damage: 220, pellets: 1, clip: 1, fireInterval: 0, reload: 2.2, perShell: false, spreadDeg: 0, pierce: 4,
    recoil: 2.4, shake: 0.2, spinUp: 0, headoffRange: 0, knockback: 0, plateMult: 1, ignoresPlates: true,
    shell: 'none', clipKind: 'none',
  },
  outboard: {
    id: 'outboard', name: '"Outboard" boat-engine minigun', short: 'The Outboard', price: 12000, mode: 'hitscan',
    damage: 22, pellets: 1, clip: 300, fireInterval: 0.045, reload: 3.5, perShell: false, spreadDeg: 4, pierce: 0,
    recoil: 0.12, shake: 0.05, spinUp: 0.6, headoffRange: 3.5, knockback: 0, plateMult: 1, ignoresPlates: false,
    shell: 'minigun', clipKind: 'belt',
  },
};

/** Damage multiplier per chapter: +10% per chapter after the first. */
export const chapterDamage = (chapter: number) => 1 + 0.1 * Math.max(0, chapter - 1);

/**
 * Distance of the muzzle in front of the hunter (toward -x) for each weapon's
 * hold pose. The gun line starts here. (Matches the hunter rig's hold within a
 * few cm; the integrator can tune these to the final models.)
 */
export const MUZZLE_FORWARD: Record<WeaponId, number> = {
  revolver: 0.55,
  nailgun: 0.62,
  shotgun: 0.98,
  flare: 0.55,
  harpoon: 1.12,
  outboard: 1.0,
};

/** Depth offset of the muzzle (+z, toward the camera: the gun is carried on the camera side). */
export const MUZZLE_Z: Record<WeaponId, number> = {
  revolver: 0.1,
  nailgun: 0.12,
  shotgun: 0.14,
  flare: 0.1,
  harpoon: 0.14,
  outboard: 0.2,
};

/**
 * Outboard engine: idle spin between bursts, idle seconds before it stalls,
 * heat per round / cooling per second. At full heat the engine overheats and
 * stalls: no firing until it has cooled to `restartHeat`, then a pull-start.
 */
export const OUTBOARD = { idleSpin: 0.35, stallSeconds: 12, heatPerShot: 0.0075, coolPerSecond: 0.32, hotSpread: 1.5, restartHeat: 0.45 };

/** Flare projectile (DESIGN §7: fast, slight arc). A hit sprays fire on everything within `splash` m. */
export const FLARE = { speed: 28, vy: 0.6, gravity: 3, radius: 0.12, splash: 1.3 };

/** Harpoon: bodies on the line are reeled this far toward the hunter. */
export const HARPOON = { reel: 2, maxSkewer: 5 };

/**
 * Convert a screen-space spread angle to a yaw angle in the ground plane: a
 * screen slope s covers s / sin(pitch) metres of depth per metre travelled.
 */
export function spreadToYaw(deg: number): number {
  const k = 1 / Math.sin((CAMERA_PITCH_DEG * Math.PI) / 180);
  return Math.atan(Math.tan((deg * Math.PI) / 180) * k);
}
