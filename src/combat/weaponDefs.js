// Weapon & item definitions. Angles in degrees, times in seconds.
// Every gun has its own damage, cadence, spread behaviour, recoil pattern,
// magazine, handling and sound so each feels distinct.

export const WEAPONS = {
  pistol: {
    name: 'Pistol', slot: 1, kind: 'pistol', auto: false, damage: 36, pellets: 1, interval: 0.14,
    clip: 15, reserve: Infinity, reload: 1.55, spread: 0.7, spreadMove: 2.2, spreadAir: 5, spreadPerShot: 1.3, spreadMax: 5,
    spreadRecover: 9, recoilPitch: 1.5, recoilYaw: 0.35, recoilRecover: 10, range: 80, falloff: 0.8, penetration: 1,
    knockback: 1.2, sound: 'pistol', viewKick: 0.6, moveMult: 1, shellType: 'pistol', tracer: 0.25, dualClip: 30,
  },
  magnum: {
    name: 'Magnum', slot: 1, kind: 'pistol', auto: false, damage: 80, pellets: 1, interval: 0.3,
    clip: 8, reserve: Infinity, reload: 1.8, spread: 0.6, spreadMove: 2.8, spreadAir: 6, spreadPerShot: 3.2, spreadMax: 7,
    spreadRecover: 7, recoilPitch: 4.2, recoilYaw: 0.8, recoilRecover: 7, range: 100, falloff: 0.9, penetration: 3,
    knockback: 3, sound: 'magnum', viewKick: 1.4, moveMult: 1, shellType: 'none', tracer: 0.5,
  },
  smg: {
    name: 'Submachine Gun', slot: 0, tier: 1, kind: 'smg', auto: true, damage: 20, pellets: 1, interval: 0.063,
    clip: 50, reserve: 480, reload: 2.1, spread: 1.6, spreadMove: 3.2, spreadAir: 6, spreadPerShot: 0.32, spreadMax: 5.5,
    spreadRecover: 11, recoilPitch: 0.55, recoilYaw: 0.45, recoilRecover: 12, range: 60, falloff: 0.65, penetration: 1,
    knockback: 0.7, sound: 'smg', viewKick: 0.35, moveMult: 1, shellType: 'pistol', tracer: 0.35,
  },
  silencedSmg: {
    name: 'Silenced SMG', slot: 0, tier: 1, kind: 'smg', auto: true, damage: 22, pellets: 1, interval: 0.07,
    clip: 50, reserve: 480, reload: 2.2, spread: 1.4, spreadMove: 3.0, spreadAir: 6, spreadPerShot: 0.3, spreadMax: 5,
    spreadRecover: 11, recoilPitch: 0.45, recoilYaw: 0.35, recoilRecover: 12, range: 60, falloff: 0.65, penetration: 1,
    knockback: 0.7, sound: 'silenced', viewKick: 0.3, moveMult: 1, shellType: 'pistol', tracer: 0.2, silenced: true, noise: 0.35,
  },
  pumpShotgun: {
    name: 'Pump Shotgun', slot: 0, tier: 1, kind: 'shotgun', auto: false, damage: 25, pellets: 10, interval: 0.87,
    clip: 8, reserve: 128, reload: 0.47, reloadStart: 0.35, reloadEnd: 0.45, shellReload: true, spread: 5.2, spreadMove: 6,
    spreadAir: 8, spreadPerShot: 0, spreadMax: 6, spreadRecover: 10, recoilPitch: 5.5, recoilYaw: 1.2, recoilRecover: 6,
    range: 40, falloff: 0.35, penetration: 1, knockback: 2.4, sound: 'shotgun', viewKick: 2.2, moveMult: 1, pump: true,
    shellType: 'shell', tracer: 0.3,
  },
  chromeShotgun: {
    name: 'Chrome Shotgun', slot: 0, tier: 1, kind: 'shotgun', auto: false, damage: 31, pellets: 8, interval: 0.87,
    clip: 8, reserve: 128, reload: 0.47, reloadStart: 0.35, reloadEnd: 0.45, shellReload: true, spread: 4.2, spreadMove: 5,
    spreadAir: 7, spreadPerShot: 0, spreadMax: 5, spreadRecover: 10, recoilPitch: 5.8, recoilYaw: 1, recoilRecover: 6,
    range: 45, falloff: 0.4, penetration: 1, knockback: 2.4, sound: 'shotgun', viewKick: 2.2, moveMult: 1, pump: true,
    shellType: 'shell', tracer: 0.3, chrome: true,
  },
  autoShotgun: {
    name: 'Auto Shotgun', slot: 0, tier: 2, kind: 'shotgun', auto: true, damage: 23, pellets: 11, interval: 0.28,
    clip: 10, reserve: 128, reload: 0.4, reloadStart: 0.4, reloadEnd: 0.55, shellReload: true, spread: 6, spreadMove: 7,
    spreadAir: 9, spreadPerShot: 0.8, spreadMax: 8, spreadRecover: 8, recoilPitch: 4.4, recoilYaw: 1.6, recoilRecover: 7,
    range: 38, falloff: 0.35, penetration: 1, knockback: 2.2, sound: 'autoshotgun', viewKick: 1.9, moveMult: 0.97,
    shellType: 'shell', tracer: 0.3,
  },
  rifle: {
    name: 'Assault Rifle', slot: 0, tier: 2, kind: 'rifle', auto: true, damage: 33, pellets: 1, interval: 0.0875,
    clip: 50, reserve: 360, reload: 2.25, spread: 0.9, spreadMove: 2.6, spreadAir: 6, spreadPerShot: 0.42, spreadMax: 4.6,
    spreadRecover: 9, recoilPitch: 0.95, recoilYaw: 0.55, recoilRecover: 8, range: 120, falloff: 0.85, penetration: 2,
    knockback: 1.1, sound: 'rifle', viewKick: 0.55, moveMult: 0.97, shellType: 'rifle', tracer: 0.4,
  },
  scar: {
    name: 'Combat Rifle', slot: 0, tier: 2, kind: 'rifle', auto: true, burst: 3, damage: 44, pellets: 1, interval: 0.075, burstInterval: 0.33,
    clip: 60, reserve: 360, reload: 2.5, spread: 0.6, spreadMove: 2.2, spreadAir: 6, spreadPerShot: 0.35, spreadMax: 3.5,
    spreadRecover: 10, recoilPitch: 1.1, recoilYaw: 0.4, recoilRecover: 9, range: 120, falloff: 0.9, penetration: 2,
    knockback: 1.3, sound: 'rifle2', viewKick: 0.6, moveMult: 0.96, shellType: 'rifle', tracer: 0.4,
  },
  huntingRifle: {
    name: 'Hunting Rifle', slot: 0, tier: 2, kind: 'sniper', auto: false, damage: 90, pellets: 1, interval: 0.25,
    clip: 15, reserve: 150, reload: 3.0, spread: 0.25, spreadMove: 4, spreadAir: 8, spreadPerShot: 2.4, spreadMax: 6,
    spreadRecover: 8, recoilPitch: 3.2, recoilYaw: 0.5, recoilRecover: 7, range: 250, falloff: 1, penetration: 6,
    knockback: 2.6, sound: 'sniper', viewKick: 1.3, moveMult: 0.95, zoom: 28, zoomSpread: 0.02, shellType: 'rifle', tracer: 0.6,
  },
  m60: {
    name: 'M60', slot: 0, tier: 3, kind: 'heavy', auto: true, damage: 50, pellets: 1, interval: 0.11,
    clip: 150, reserve: 0, reload: 0, noReload: true, spread: 1.5, spreadMove: 4, spreadAir: 8, spreadPerShot: 0.4, spreadMax: 5,
    spreadRecover: 8, recoilPitch: 1.3, recoilYaw: 0.8, recoilRecover: 7, range: 140, falloff: 0.9, penetration: 3,
    knockback: 2.2, sound: 'm60', viewKick: 0.9, moveMult: 0.88, shellType: 'rifle', tracer: 0.7,
  },
  grenadeLauncher: {
    name: 'Grenade Launcher', slot: 0, tier: 3, kind: 'launcher', auto: false, damage: 400, pellets: 1, interval: 0.6,
    clip: 1, reserve: 30, reload: 2.7, spread: 0.5, spreadMove: 1.5, spreadAir: 3, spreadPerShot: 0, spreadMax: 1,
    spreadRecover: 8, recoilPitch: 5, recoilYaw: 1, recoilRecover: 6, range: 200, falloff: 1, penetration: 0,
    knockback: 0, sound: 'launcher', viewKick: 2, moveMult: 0.92, projectile: 'grenade', shellType: 'none', tracer: 0,
  },
  minigun: {
    name: 'Mounted Minigun', slot: -1, kind: 'minigun', auto: true, damage: 50, pellets: 1, interval: 0.035,
    clip: Infinity, reserve: Infinity, spread: 1.8, spreadMove: 1.8, spreadAir: 1.8, spreadPerShot: 0, spreadMax: 1.8,
    spreadRecover: 0, recoilPitch: 0.3, recoilYaw: 0.3, recoilRecover: 10, range: 160, falloff: 1, penetration: 2,
    knockback: 2, sound: 'minigun', viewKick: 0.3, shellType: 'rifle', tracer: 0.8,
  },
  // Melee (replace secondary slot)
  fireaxe: {
    name: 'Fire Axe', slot: 1, kind: 'melee', melee: true, damage: 250, interval: 0.95, windup: 0.18, range: 2.0, arc: 85,
    maxTargets: 4, knockback: 4, sound: 'axe', decap: 0.6, viewKick: 1.4, moveMult: 1,
  },
  crowbar: {
    name: 'Crowbar', slot: 1, kind: 'melee', melee: true, damage: 175, interval: 0.72, windup: 0.13, range: 1.85, arc: 70,
    maxTargets: 3, knockback: 3.2, sound: 'crowbar', decap: 0.15, blunt: true, viewKick: 1.1, moveMult: 1,
  },
  machete: {
    name: 'Machete', slot: 1, kind: 'melee', melee: true, damage: 200, interval: 0.62, windup: 0.1, range: 1.9, arc: 80,
    maxTargets: 4, knockback: 2.6, sound: 'machete', decap: 0.45, viewKick: 1.0, moveMult: 1,
  },
};

export const THROWABLES = {
  molotov: { name: 'Molotov', slot: 2, kind: 'throwable', fuse: 0, sound: 'glass' },
  pipebomb: { name: 'Pipe Bomb', slot: 2, kind: 'throwable', fuse: 6, sound: 'beep' },
  bile: { name: 'Bile Jar', slot: 2, kind: 'throwable', fuse: 0, sound: 'glass' },
};

export const ITEMS = {
  medkit: { name: 'First Aid Kit', slot: 3 },
  pills: { name: 'Pain Pills', slot: 4 },
  adrenaline: { name: 'Adrenaline', slot: 4 },
};

// Tier-based weapon groups for random spawns.
export const TIER1 = ['smg', 'pumpShotgun', 'silencedSmg', 'chromeShotgun'];
export const TIER2 = ['rifle', 'autoShotgun', 'huntingRifle', 'scar'];
export const MELEE = ['fireaxe', 'crowbar', 'machete'];

export function isWeapon(t) { return !!WEAPONS[t]; }
export function isThrowable(t) { return !!THROWABLES[t]; }
