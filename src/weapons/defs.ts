export type Category = 'pistol' | 'shotgun' | 'smg' | 'rifle' | 'mg' | 'marksman' | 'sniper' | 'launcher' | 'bow' | 'energy' | 'flame' | 'particle';

export const CATEGORIES: { id: Category | 'defense'; label: string }[] = [
  { id: 'pistol', label: 'Pistols' },
  { id: 'shotgun', label: 'Shotguns' },
  { id: 'smg', label: 'SMGs' },
  { id: 'rifle', label: 'Assault Rifles' },
  { id: 'mg', label: 'Machine Guns' },
  { id: 'marksman', label: 'Marksman Rifles' },
  { id: 'sniper', label: 'Snipers' },
  { id: 'launcher', label: 'Launchers' },
  { id: 'bow', label: 'Bows' },
  { id: 'energy', label: 'Energy Weapons' },
  { id: 'flame', label: 'Flamethrowers' },
  { id: 'particle', label: 'Particle Weapons' },
  { id: 'defense', label: 'Defenses' },
];

export type FireMode = 'semi' | 'auto' | 'burst' | 'pump' | 'bolt' | 'break' | 'spin' | 'heat' | 'flame' | 'bow' | 'charge';
export type ReloadType = 'mag' | 'shell' | 'revolver' | 'clip' | 'single' | 'belt' | 'stripper' | 'energy' | 'cylinder' | 'fuel' | 'none';
export type CasingKind = 'pistol' | 'rifle' | 'big' | 'shell' | 'none';
export type Anim =
  | 'revolver' | 'pistol' | 'handcannon' | 'pump' | 'break' | 'shotmag' | 'smg' | 'rifle' | 'lmg' | 'minigun' | 'hmg'
  | 'garand' | 'bolt' | 'semisniper' | 'rpg' | 'gl' | 'mgl' | 'bow' | 'laser' | 'flamer' | 'pir';

export interface Projectile {
  kind: 'rocket' | 'grenade40' | 'arrow' | 'lightArrow';
  speed: number;
  gravity: number;
  explosive?: { radius: number; damage: number };
  fire?: boolean;
}

export interface WeaponStats {
  damage: number;
  pellets: number;
  mag: number;
  rpm: number;
  pen: number;
  stopping: number;
  mode: FireMode;
  burst?: number;
  reload: number;
  spread: number;
  range: number;
  optic?: number;
}

export interface WeaponLevel extends Partial<WeaponStats> {
  name: string;
  cost: number;
  unlockDay: number;
  desc: string;
  /** Visual upgrade flags used by the model builder. */
  visual: string;
}

export interface WeaponDef extends WeaponStats {
  id: string;
  name: string;
  category: Category;
  cost: number;
  unlockDay: number;
  reloadType: ReloadType;
  casing: CasingKind;
  anim: Anim;
  turret: boolean;
  weight: number;
  recoil: { pitch: number; yaw: number; kick: number; shake: number };
  /** ADS FOV multiplier (scope if <= 0.3). */
  adsFov: number;
  scope?: boolean;
  special?: 'airstrike' | 'spinup' | 'heat' | 'charge' | 'strength' | 'suppressed' | 'elite' | 'dualTrigger';
  projectile?: Projectile;
  flame?: { dps: number; burn: number; range: number; cone: number; color: 'orange' | 'blue' };
  charge?: { time: number; minDmg: number; maxDmg: number; minPen: number; maxPen: number; minSp: number; maxSp: number; maxAmmo: number };
  strengthScale?: number;
  eliteMul?: number;
  levels?: WeaponLevel[];
  sound: string;
  desc: string;
  headMul?: number;
}

const W = (d: Partial<WeaponDef> & Pick<WeaponDef, 'id' | 'name' | 'category' | 'cost' | 'unlockDay' | 'anim' | 'sound'>): WeaponDef => ({
  damage: 5,
  pellets: 1,
  mag: 10,
  rpm: 400,
  pen: 50,
  stopping: 50,
  mode: 'semi',
  reload: 2,
  spread: 1.5,
  range: 160,
  reloadType: 'mag',
  casing: 'pistol',
  turret: false,
  weight: 1,
  recoil: { pitch: 0.02, yaw: 0.006, kick: 1, shake: 0.03 },
  adsFov: 0.82,
  desc: '',
  ...d,
});

export const WEAPONS: WeaponDef[] = [
  // ------------------------------------------------------------------ PISTOLS
  W({
    id: 'm686', name: 'M686', category: 'pistol', cost: 0, unlockDay: 0, anim: 'revolver', sound: 'revolver',
    damage: 4, mag: 6, rpm: 170, pen: 45, stopping: 70, reload: 2.3, reloadType: 'revolver', casing: 'none', spread: 1.1,
    recoil: { pitch: 0.045, yaw: 0.012, kick: 1.4, shake: 0.06 }, desc: 'Reliable six-shot .357 revolver. Your first friend on the road.',
  }),
  W({
    id: 'm1911', name: "Captain Miller's M1911", category: 'pistol', cost: 390, unlockDay: 2, anim: 'pistol', sound: 'pistol45',
    damage: 5, mag: 7, rpm: 550, pen: 50, stopping: 70, reload: 1.6, spread: 1.3, special: 'airstrike',
    recoil: { pitch: 0.036, yaw: 0.01, kick: 1.1, shake: 0.05 },
    desc: 'The last round of each magazine may call in an air strike. The lower your health, the likelier — guaranteed below 50%.',
  }),
  W({
    id: 'glock17', name: 'Glock 17', category: 'pistol', cost: 400, unlockDay: 3, anim: 'pistol', sound: 'pistol9',
    damage: 3.5, mag: 17, rpm: 750, pen: 40, stopping: 40, reload: 1.5, spread: 1.6, turret: true,
    recoil: { pitch: 0.024, yaw: 0.008, kick: 0.8, shake: 0.03 }, desc: 'Light, fast and dependable. Turret capable.',
    levels: [
      { name: 'Glock 17 Extended', cost: 200, unlockDay: 6, mag: 33, mode: 'auto', rpm: 1150, desc: '33-round extended mag and full-auto conversion.', visual: 'extmag' },
      { name: 'Glock 18C Drum', cost: 500, unlockDay: 10, mag: 50, mode: 'auto', rpm: 1150, damage: 4, desc: '50-round drum, compensator. Bullet hose.', visual: 'drum' },
    ],
  }),
  W({
    id: 'deagle', name: 'Desert Eagle', category: 'pistol', cost: 1800, unlockDay: 9, anim: 'handcannon', sound: 'deagle',
    damage: 9, mag: 7, rpm: 360, pen: 110, stopping: 150, reload: 1.9, spread: 1.4, casing: 'rifle',
    recoil: { pitch: 0.075, yaw: 0.02, kick: 2.0, shake: 0.1 }, desc: '.50 AE hand cannon. Punches through two walkers.',
  }),
  W({
    id: 'm500', name: 'M500', category: 'pistol', cost: 2000, unlockDay: 13, anim: 'revolver', sound: 'm500',
    damage: 10, mag: 5, rpm: 400, pen: 150, stopping: 200, reload: 2.6, reloadType: 'revolver', casing: 'none', spread: 1.5,
    recoil: { pitch: 0.09, yaw: 0.025, kick: 2.4, shake: 0.14 }, desc: 'The biggest revolver money can buy. Brutal stopping power.',
  }),
  W({
    id: 'thunder50', name: 'Thunder 50', category: 'pistol', cost: 2800, unlockDay: 17, anim: 'handcannon', sound: 'thunder',
    damage: 23, mag: 1, rpm: 60, mode: 'break', pen: 400, stopping: 300, reload: 1.5, reloadType: 'single', casing: 'big', spread: 0.8,
    recoil: { pitch: 0.16, yaw: 0.04, kick: 3.4, shake: 0.28 }, desc: 'Single-shot .50 BMG pistol. Goes through an entire line of zombies.',
  }),
  // ------------------------------------------------------------------ SHOTGUNS
  W({
    id: 'shorty', name: 'Super Shorty', category: 'shotgun', cost: 0, unlockDay: 0, anim: 'pump', sound: 'shotgun',
    damage: 4, pellets: 5, mag: 2, rpm: 80, mode: 'pump', pen: 30, stopping: 190, reload: 0.45, reloadType: 'shell', casing: 'shell', spread: 6.5, range: 45,
    recoil: { pitch: 0.1, yaw: 0.025, kick: 2.6, shake: 0.16 }, desc: 'Stubby pump shotgun. Two shells, enormous close-range knockback.',
  }),
  W({
    id: 'r870', name: 'Remington 870', category: 'shotgun', cost: 700, unlockDay: 2, anim: 'pump', sound: 'shotgun',
    damage: 4, pellets: 5, mag: 5, rpm: 120, mode: 'pump', pen: 40, stopping: 100, reload: 0.42, reloadType: 'shell', casing: 'shell', spread: 4.5, range: 55,
    recoil: { pitch: 0.085, yaw: 0.02, kick: 2.2, shake: 0.13 }, desc: 'Classic 5-shell pump action. Tighter spread than the Shorty.',
  }),
  W({
    id: 'db', name: 'Double-Barreled', category: 'shotgun', cost: 800, unlockDay: 4, anim: 'break', sound: 'shotgunDB',
    damage: 3.4, pellets: 6, mag: 2, rpm: 350, pen: 80, stopping: 200, reload: 1.9, reloadType: 'single', casing: 'shell', spread: 5, range: 50,
    recoil: { pitch: 0.12, yaw: 0.03, kick: 2.8, shake: 0.18 }, desc: 'Two barrels, two triggers, twenty damage per blast.',
  }),
  W({
    id: 'm590', name: 'Mossberg 590M', category: 'shotgun', cost: 1300, unlockDay: 8, anim: 'pump', sound: 'shotgun',
    damage: 4, pellets: 5, mag: 10, rpm: 130, mode: 'pump', pen: 100, stopping: 110, reload: 2.4, reloadType: 'mag', casing: 'shell', spread: 4, range: 55,
    recoil: { pitch: 0.085, yaw: 0.02, kick: 2.2, shake: 0.13 }, desc: 'Magazine-fed pump. Ten shells and high-penetration buckshot.',
  }),
  W({
    id: 'ks23', name: 'KS-23', category: 'shotgun', cost: 1300, unlockDay: 10, anim: 'pump', sound: 'shotgunBig',
    damage: 8, pellets: 5, mag: 3, rpm: 70, mode: 'pump', pen: 60, stopping: 280, reload: 0.6, reloadType: 'shell', casing: 'shell', spread: 5.5, range: 50,
    recoil: { pitch: 0.15, yaw: 0.035, kick: 3.2, shake: 0.24 }, desc: '23mm riot cannon. Sends zombies flying.',
  }),
  W({
    id: 'saiga', name: 'Saiga 12', category: 'shotgun', cost: 2100, unlockDay: 14, anim: 'shotmag', sound: 'shotgun',
    damage: 4, pellets: 5, mag: 20, rpm: 300, pen: 50, stopping: 100, reload: 2.6, casing: 'shell', spread: 4.5, range: 50, turret: true,
    recoil: { pitch: 0.07, yaw: 0.02, kick: 1.9, shake: 0.11 }, desc: 'Semi-automatic drum-fed shotgun. Turret capable.',
  }),
  W({
    id: 'bp12', name: 'BP-12', category: 'shotgun', cost: 2400, unlockDay: 16, anim: 'shotmag', sound: 'shotgun',
    damage: 4.5, pellets: 5, mag: 5, rpm: 330, pen: 70, stopping: 130, reload: 2.0, casing: 'shell', spread: 4, range: 55, turret: true,
    recoil: { pitch: 0.075, yaw: 0.02, kick: 2.0, shake: 0.12 }, desc: 'Bullpup semi-auto shotgun. Turret capable.',
    levels: [{ name: 'BP-12 Drum', cost: 600, unlockDay: 20, mag: 10, desc: 'Doubles capacity to 10 shells.', visual: 'drum' }],
  }),
  W({
    id: 'aa12', name: 'AA-12', category: 'shotgun', cost: 2800, unlockDay: 19, anim: 'shotmag', sound: 'shotgun',
    damage: 4, pellets: 5, mag: 20, rpm: 300, mode: 'auto', pen: 50, stopping: 110, reload: 2.8, casing: 'shell', spread: 5, range: 50, turret: true,
    recoil: { pitch: 0.055, yaw: 0.02, kick: 1.6, shake: 0.1 }, desc: 'Fully automatic shotgun. Clears doorways — and roads. Turret capable.',
  }),
  // ------------------------------------------------------------------ SMGs
  W({
    id: 'mac11', name: 'MAC-11', category: 'smg', cost: 1100, unlockDay: 5, anim: 'smg', sound: 'smgLight',
    damage: 2.6, mag: 32, rpm: 1200, mode: 'auto', pen: 30, stopping: 25, reload: 1.6, spread: 3.2, range: 90,
    recoil: { pitch: 0.016, yaw: 0.012, kick: 0.6, shake: 0.03 }, desc: 'Absurd fire rate, empties in a heartbeat.',
  }),
  W({
    id: 'sterling', name: 'Sterling', category: 'smg', cost: 1200, unlockDay: 6, anim: 'smg', sound: 'smg',
    damage: 3.6, mag: 34, rpm: 550, mode: 'auto', pen: 40, stopping: 35, reload: 1.9, spread: 2.2, range: 100,
    recoil: { pitch: 0.018, yaw: 0.008, kick: 0.7, shake: 0.03 }, desc: 'Side-loading British workhorse. Controllable.',
  }),
  W({
    id: 'thompson', name: 'Thompson', category: 'smg', cost: 1700, unlockDay: 8, anim: 'smg', sound: 'smgHeavy',
    damage: 4, mag: 30, rpm: 700, mode: 'auto', pen: 45, stopping: 45, reload: 2.1, spread: 2.4, range: 100,
    recoil: { pitch: 0.02, yaw: 0.01, kick: 0.8, shake: 0.035 }, desc: 'The Chicago typewriter.',
    levels: [{ name: 'Thompson Drum', cost: 800, unlockDay: 12, mag: 50, rpm: 800, desc: '50-round drum and a faster cyclic rate.', visual: 'drum' }],
  }),
  W({
    id: 'mp40', name: 'MP40', category: 'smg', cost: 1800, unlockDay: 10, anim: 'smg', sound: 'smg',
    damage: 4.5, mag: 32, rpm: 550, mode: 'auto', pen: 55, stopping: 45, reload: 2.0, spread: 2.0, range: 110,
    recoil: { pitch: 0.019, yaw: 0.008, kick: 0.75, shake: 0.03 }, desc: 'Hard-hitting 9mm with a slow, steady rhythm.',
  }),
  W({
    id: 'mp5k', name: 'MP5K', category: 'smg', cost: 1800, unlockDay: 11, anim: 'smg', sound: 'smg',
    damage: 3.6, mag: 30, rpm: 900, mode: 'auto', pen: 45, stopping: 40, reload: 1.8, spread: 2.3, range: 100, turret: true,
    recoil: { pitch: 0.017, yaw: 0.01, kick: 0.65, shake: 0.03 }, desc: 'Compact and snappy. Turret capable.',
  }),
  W({
    id: 'p90', name: 'FN P90', category: 'smg', cost: 2000, unlockDay: 13, anim: 'smg', sound: 'smgLight',
    damage: 3.6, mag: 50, rpm: 900, mode: 'auto', pen: 60, stopping: 40, reload: 2.3, spread: 2.0, range: 120, turret: true,
    recoil: { pitch: 0.015, yaw: 0.008, kick: 0.6, shake: 0.025 }, desc: '50-round top magazine, armor-piercing 5.7mm. Turret capable.',
  }),
  // ------------------------------------------------------------------ ASSAULT RIFLES
  W({
    id: 'akm', name: 'AKM', category: 'rifle', cost: 2200, unlockDay: 12, anim: 'rifle', sound: 'ak', casing: 'rifle',
    damage: 6, mag: 30, rpm: 600, mode: 'auto', pen: 90, stopping: 80, reload: 2.3, spread: 1.8,
    recoil: { pitch: 0.028, yaw: 0.012, kick: 1.1, shake: 0.05 }, desc: 'Rugged 7.62. Loud, strong, reliable.',
  }),
  W({
    id: 'm16', name: 'M16', category: 'rifle', cost: 2700, unlockDay: 14, anim: 'rifle', sound: 'm16', casing: 'rifle',
    damage: 5.5, mag: 30, rpm: 800, mode: 'burst', burst: 3, pen: 95, stopping: 70, reload: 2.2, spread: 1.2,
    recoil: { pitch: 0.022, yaw: 0.008, kick: 0.9, shake: 0.04 }, desc: 'Accurate three-round bursts.',
  }),
  W({
    id: 'm4', name: 'M4 CQB', category: 'rifle', cost: 2800, unlockDay: 15, anim: 'rifle', sound: 'm16', casing: 'rifle',
    damage: 5.5, mag: 30, rpm: 850, mode: 'auto', pen: 85, stopping: 70, reload: 2.0, spread: 1.6, turret: true,
    recoil: { pitch: 0.022, yaw: 0.01, kick: 0.9, shake: 0.04 }, desc: 'Short-barrel carbine. Turret capable.',
  }),
  W({
    id: 'aug', name: 'AUG', category: 'rifle', cost: 3000, unlockDay: 17, anim: 'rifle', sound: 'm16', casing: 'rifle',
    damage: 6, mag: 42, rpm: 700, mode: 'auto', pen: 95, stopping: 75, reload: 2.4, spread: 1.4, adsFov: 0.55, optic: 1,
    recoil: { pitch: 0.021, yaw: 0.009, kick: 0.85, shake: 0.04 }, desc: 'Bullpup with an integrated 1.5x optic and a 42-round mag.',
  }),
  W({
    id: 'scarh', name: 'SCAR-H', category: 'rifle', cost: 3500, unlockDay: 20, anim: 'rifle', sound: 'battle', casing: 'rifle',
    damage: 8, mag: 20, rpm: 600, mode: 'auto', pen: 120, stopping: 110, reload: 2.3, spread: 1.5,
    recoil: { pitch: 0.034, yaw: 0.012, kick: 1.25, shake: 0.06 }, desc: 'Full-power 7.62 battle rifle.',
    levels: [{ name: 'SCAR-H Mk17 Ext.', cost: 1000, unlockDay: 24, mag: 30, damage: 9, optic: 1, desc: '30-round mag, heavier load and a red-dot optic.', visual: 'optic' }],
  }),
  // ------------------------------------------------------------------ MACHINE GUNS
  W({
    id: 'bar', name: 'BAR M1918', category: 'mg', cost: 3000, unlockDay: 16, anim: 'rifle', sound: 'battle', casing: 'rifle',
    damage: 8, mag: 20, rpm: 550, mode: 'auto', pen: 110, stopping: 110, reload: 2.5, spread: 1.8, weight: 0.9,
    recoil: { pitch: 0.03, yaw: 0.012, kick: 1.2, shake: 0.06 }, desc: 'Automatic rifle. Heavy, hits hard.',
    levels: [{ name: 'BAR 40-Round', cost: 1000, unlockDay: 20, mag: 40, rpm: 650, desc: 'Doubled magazine and a faster rate of fire.', visual: 'extmag' }],
  }),
  W({
    id: 'm1922', name: 'M1922', category: 'mg', cost: 3500, unlockDay: 19, anim: 'rifle', sound: 'battle', casing: 'rifle',
    damage: 8, mag: 20, rpm: 600, mode: 'auto', pen: 110, stopping: 110, reload: 2.5, spread: 1.8, weight: 0.9,
    recoil: { pitch: 0.03, yaw: 0.012, kick: 1.2, shake: 0.06 }, desc: 'Cavalry BAR variant with a finned barrel.',
    levels: [{ name: 'M1922 Drum', cost: 2500, unlockDay: 26, mag: 60, rpm: 700, damage: 9, desc: '60-round drum and hotter loads.', visual: 'drum' }],
  }),
  W({
    id: 'm249', name: 'M249', category: 'mg', cost: 4200, unlockDay: 22, anim: 'lmg', sound: 'lmg', casing: 'rifle',
    damage: 6, mag: 100, rpm: 850, mode: 'auto', pen: 90, stopping: 80, reload: 4.5, reloadType: 'belt', spread: 2.4, weight: 0.85, turret: true,
    recoil: { pitch: 0.022, yaw: 0.014, kick: 0.9, shake: 0.05 }, desc: '100-round belt-fed SAW. Turret capable.',
  }),
  W({
    id: 'pkm', name: 'PKM', category: 'mg', cost: 5800, unlockDay: 26, anim: 'lmg', sound: 'lmgHeavy', casing: 'rifle',
    damage: 8, mag: 100, rpm: 700, mode: 'auto', pen: 130, stopping: 120, reload: 5.0, reloadType: 'belt', spread: 2.2, weight: 0.82,
    recoil: { pitch: 0.028, yaw: 0.014, kick: 1.1, shake: 0.06 }, desc: 'Belt-fed 7.62x54R. Chews through hordes.',
  }),
  W({
    id: 'm240', name: 'M240L', category: 'mg', cost: 6800, unlockDay: 29, anim: 'lmg', sound: 'lmgHeavy', casing: 'rifle',
    damage: 8.5, mag: 100, rpm: 850, mode: 'auto', pen: 135, stopping: 125, reload: 5.0, reloadType: 'belt', spread: 2.0, weight: 0.82,
    recoil: { pitch: 0.028, yaw: 0.014, kick: 1.1, shake: 0.06 }, desc: 'Lightweight titanium M240. Faster and meaner.',
  }),
  W({
    id: 'minigun', name: 'Minigun', category: 'mg', cost: 20000, unlockDay: 38, anim: 'minigun', sound: 'minigun', casing: 'rifle',
    damage: 7, mag: 500, rpm: 3000, mode: 'spin', pen: 120, stopping: 150, reload: 7, reloadType: 'belt', spread: 3.0, weight: 0.6, special: 'spinup',
    recoil: { pitch: 0.006, yaw: 0.006, kick: 0.5, shake: 0.08 }, desc: 'Spins up, then deletes everything in front of it. 3000 RPM.',
  }),
  W({
    id: 'mg42', name: 'MG42', category: 'mg', cost: 22000, unlockDay: 40, anim: 'lmg', sound: 'mg42', casing: 'rifle',
    damage: 9, mag: 250, rpm: 1300, mode: 'auto', pen: 140, stopping: 140, reload: 6, reloadType: 'belt', spread: 2.2, weight: 0.75,
    recoil: { pitch: 0.018, yaw: 0.014, kick: 1.0, shake: 0.08 }, desc: "Hitler's buzzsaw. 1300 rounds per minute.",
  }),
  W({
    id: 'm2', name: 'M2 Browning', category: 'mg', cost: 32000, unlockDay: 48, anim: 'hmg', sound: 'hmg', casing: 'big',
    damage: 22, mag: 200, rpm: 550, mode: 'auto', pen: 350, stopping: 300, reload: 7, reloadType: 'belt', spread: 1.6, weight: 0.55, turret: true,
    recoil: { pitch: 0.05, yaw: 0.02, kick: 1.8, shake: 0.2 }, desc: 'Ma Deuce. .50 BMG that turns crowds into mist. Turret capable.',
  }),
  // ------------------------------------------------------------------ MARKSMAN
  W({
    id: 'garand', name: 'M1 Garand', category: 'marksman', cost: 1200, unlockDay: 6, anim: 'garand', sound: 'garand', casing: 'rifle',
    damage: 14, mag: 8, rpm: 300, pen: 150, stopping: 200, reload: 2.0, reloadType: 'clip', spread: 0.6,
    recoil: { pitch: 0.06, yaw: 0.015, kick: 1.7, shake: 0.08 }, desc: 'Eight rounds of .30-06 and that famous PING.',
  }),
  W({
    id: 'vss', name: 'VSS', category: 'marksman', cost: 2000, unlockDay: 12, anim: 'rifle', sound: 'suppressed', casing: 'rifle',
    damage: 9, mag: 20, rpm: 700, pen: 160, stopping: 80, reload: 2.0, spread: 0.7, adsFov: 0.3, scope: true, turret: true, special: 'suppressed',
    recoil: { pitch: 0.022, yaw: 0.008, kick: 0.8, shake: 0.03 }, desc: 'Integrally suppressed with a 4x scope. High penetration. Turret capable.',
  }),
  // ------------------------------------------------------------------ SNIPERS
  W({
    id: 'k98', name: 'Karabiner 98k', category: 'sniper', cost: 1200, unlockDay: 7, anim: 'bolt', sound: 'sniper', casing: 'rifle',
    damage: 30, mag: 5, rpm: 50, mode: 'bolt', pen: 250, stopping: 250, reload: 2.6, reloadType: 'stripper', spread: 0.2, adsFov: 0.24, scope: true,
    recoil: { pitch: 0.11, yaw: 0.02, kick: 2.2, shake: 0.12 }, desc: 'Scoped Mauser bolt-action. One shot, one line of kills.', headMul: 3,
  }),
  W({
    id: 'srs', name: 'SRS-A2 Covert', category: 'sniper', cost: 1800, unlockDay: 11, anim: 'bolt', sound: 'sniper', casing: 'rifle',
    damage: 35, mag: 6, rpm: 55, mode: 'bolt', pen: 280, stopping: 260, reload: 2.8, spread: 0.15, adsFov: 0.2, scope: true,
    recoil: { pitch: 0.1, yaw: 0.02, kick: 2.0, shake: 0.12 }, desc: 'Compact bullpup bolt gun.', headMul: 3,
  }),
  W({
    id: 'awm', name: 'AWM', category: 'sniper', cost: 3800, unlockDay: 21, anim: 'bolt', sound: 'sniperBig', casing: 'big',
    damage: 55, mag: 5, rpm: 45, mode: 'bolt', pen: 350, stopping: 320, reload: 3.2, spread: 0.1, adsFov: 0.17, scope: true,
    recoil: { pitch: 0.14, yaw: 0.025, kick: 2.6, shake: 0.16 }, desc: '.338 Lapua Magnum. Devastating.', headMul: 3,
  }),
  W({
    id: 'barrett', name: 'Barrett M107', category: 'sniper', cost: 16000, unlockDay: 36, anim: 'semisniper', sound: 'barrett', casing: 'big',
    damage: 90, mag: 10, rpm: 150, pen: 600, stopping: 500, reload: 3.6, spread: 0.12, adsFov: 0.16, scope: true, weight: 0.8, special: 'elite', eliteMul: 2,
    recoil: { pitch: 0.18, yaw: 0.03, kick: 3.0, shake: 0.24 }, desc: 'Semi-auto .50 BMG anti-materiel rifle. Double damage vs. elite zombies.', headMul: 3,
  }),
  // ------------------------------------------------------------------ LAUNCHERS
  W({
    id: 'rpg', name: 'RPG-7', category: 'launcher', cost: 8000, unlockDay: 24, anim: 'rpg', sound: 'rpg', casing: 'none',
    damage: 120, mag: 1, rpm: 30, pen: 0, stopping: 0, reload: 3.0, reloadType: 'single', spread: 0.5, weight: 0.85,
    projectile: { kind: 'rocket', speed: 55, gravity: 0.25, explosive: { radius: 7, damage: 120 } },
    recoil: { pitch: 0.06, yaw: 0.02, kick: 2.2, shake: 0.2 }, desc: 'Rocket-propelled grenade. Enormous blast radius.',
  }),
  W({
    id: 'm79', name: 'M79', category: 'launcher', cost: 12000, unlockDay: 31, anim: 'gl', sound: 'gl', casing: 'none',
    damage: 95, mag: 1, rpm: 60, pen: 0, stopping: 0, reload: 1.8, reloadType: 'single', spread: 0.6,
    projectile: { kind: 'grenade40', speed: 48, gravity: 1, explosive: { radius: 6, damage: 95 } },
    recoil: { pitch: 0.08, yaw: 0.02, kick: 2.0, shake: 0.14 }, desc: 'Break-action 40mm grenade launcher. Arcing shots.',
  }),
  W({
    id: 'm32', name: 'M32 MGL', category: 'launcher', cost: 35000, unlockDay: 47, anim: 'mgl', sound: 'gl', casing: 'none',
    damage: 95, mag: 6, rpm: 150, pen: 0, stopping: 0, reload: 4.5, reloadType: 'cylinder', spread: 0.8, weight: 0.8,
    projectile: { kind: 'grenade40', speed: 48, gravity: 1, explosive: { radius: 6, damage: 95 } },
    recoil: { pitch: 0.07, yaw: 0.02, kick: 1.9, shake: 0.14 }, desc: 'Six-shot revolving grenade launcher. Late-game crowd deletion.',
  }),
  // ------------------------------------------------------------------ BOWS
  W({
    id: 'bow', name: 'Hunting Bow', category: 'bow', cost: 800, unlockDay: 4, anim: 'bow', sound: 'bow', casing: 'none',
    damage: 18, mag: 1, rpm: 90, mode: 'bow', pen: 200, stopping: 150, reload: 0.35, reloadType: 'none', spread: 0.3, strengthScale: 1,
    projectile: { kind: 'arrow', speed: 58, gravity: 0.5 }, special: 'strength',
    recoil: { pitch: 0.01, yaw: 0.004, kick: 0.6, shake: 0.02 }, desc: 'Silent. Hold to draw — damage scales with draw and your Strength.',
  }),
  W({
    id: 'rambo', name: 'Rambo', category: 'bow', cost: 14000, unlockDay: 34, anim: 'bow', sound: 'bow', casing: 'none',
    damage: 60, mag: 1, rpm: 90, mode: 'bow', pen: 200, stopping: 250, reload: 0.4, reloadType: 'none', spread: 0.3, strengthScale: 1.2,
    projectile: { kind: 'arrow', speed: 60, gravity: 0.5, explosive: { radius: 5, damage: 80 } }, special: 'strength',
    recoil: { pitch: 0.012, yaw: 0.004, kick: 0.7, shake: 0.02 }, desc: 'Compound bow with explosive-tipped arrows.',
  }),
  W({
    id: 'sunstrike', name: 'Sunstrike', category: 'bow', cost: 18000, unlockDay: 44, anim: 'bow', sound: 'bowMagic', casing: 'none',
    damage: 45, mag: 1, rpm: 110, mode: 'bow', pen: 1000, stopping: 300, reload: 0.3, reloadType: 'none', spread: 0.1, strengthScale: 3,
    projectile: { kind: 'lightArrow', speed: 110, gravity: 0, fire: true }, special: 'strength',
    recoil: { pitch: 0.012, yaw: 0.004, kick: 0.7, shake: 0.03 }, desc: 'Fires searing arrows of light that pierce everything. Massive Strength scaling.',
  }),
  // ------------------------------------------------------------------ ENERGY
  W({
    id: 'laser', name: 'Laser Gun', category: 'energy', cost: 25000, unlockDay: 42, anim: 'laser', sound: 'laser', casing: 'none',
    damage: 10, mag: 45, rpm: 900, mode: 'heat', pen: 200, stopping: 60, reload: 3.0, reloadType: 'energy', spread: 0.25, turret: true, special: 'heat',
    recoil: { pitch: 0.008, yaw: 0.004, kick: 0.4, shake: 0.03 }, desc: 'Needs to heat up before firing, then cuts through everything. Turret capable.',
  }),
  // ------------------------------------------------------------------ FLAMETHROWERS
  W({
    id: 'naf', name: 'Not A Flamethrower', category: 'flame', cost: 2300, unlockDay: 15, anim: 'flamer', sound: 'flame', casing: 'none',
    damage: 14, mag: 100, rpm: 600, mode: 'flame', pen: 0, stopping: 10, reload: 3.0, reloadType: 'fuel', spread: 7, range: 9,
    flame: { dps: 14, burn: 5, range: 9, cone: 11, color: 'orange' },
    recoil: { pitch: 0.001, yaw: 0.001, kick: 0.2, shake: 0.01 }, desc: 'Definitely not a flamethrower. Sets whole groups ablaze.',
  }),
  W({
    id: 'reedham', name: "Reedham's Fury", category: 'flame', cost: 9500, unlockDay: 32, anim: 'flamer', sound: 'flameBig', casing: 'none',
    damage: 24, mag: 150, rpm: 600, mode: 'flame', pen: 0, stopping: 15, reload: 3.4, reloadType: 'fuel', spread: 9, range: 14, weight: 0.85,
    flame: { dps: 24, burn: 9, range: 14, cone: 15, color: 'blue' },
    recoil: { pitch: 0.001, yaw: 0.001, kick: 0.25, shake: 0.015 }, desc: 'Military-grade incinerator. Blue-hot, longer reach.',
  }),
  // ------------------------------------------------------------------ PARTICLE
  W({
    id: 'pir', name: 'PIR', category: 'particle', cost: 20000, unlockDay: 27, anim: 'pir', sound: 'pir', casing: 'none',
    damage: 30, mag: 20, rpm: 100, mode: 'charge', pen: 200, stopping: 200, reload: 3.0, reloadType: 'energy', spread: 0.1, weight: 0.85, special: 'charge',
    charge: { time: 1.4, minDmg: 30, maxDmg: 220, minPen: 200, maxPen: 1500, minSp: 200, maxSp: 900, maxAmmo: 5 },
    recoil: { pitch: 0.06, yaw: 0.02, kick: 2.0, shake: 0.2 }, desc: 'Particle Impact Rifle. Hold to charge: more damage, penetration and stopping power — and more ammo.',
    levels: [
      { name: 'PIR-L2', cost: 8000, unlockDay: 30, mag: 30, desc: 'Faster charging (1.1s), 320 max damage, 30 cells.', visual: 'l2' },
      { name: 'PIR-L3', cost: 8000, unlockDay: 45, mag: 40, desc: 'Charges in 0.9s, 460 max damage, 40 cells.', visual: 'l3' },
    ],
  }),
];

export const WEAPON_MAP: Record<string, WeaponDef> = Object.fromEntries(WEAPONS.map((w) => [w.id, w]));

/** Effective stats for an owned weapon at an upgrade level. */
export function statsFor(def: WeaponDef, level: number): WeaponDef & { levelName: string; visual: string[] } {
  let s: any = { ...def, levelName: def.name, visual: [] as string[] };
  for (let i = 0; i < level && def.levels && i < def.levels.length; i++) {
    const L = def.levels[i];
    const { name, cost, unlockDay, desc, visual, ...rest } = L;
    s = { ...s, ...rest, levelName: name, visual: [...s.visual, visual] };
    void cost; void unlockDay; void desc;
  }
  if (def.id === 'pir' && def.charge) {
    const ch = { ...def.charge };
    if (level >= 1) {
      ch.time = 1.1;
      ch.maxDmg = 320;
    }
    if (level >= 2) {
      ch.time = 0.9;
      ch.maxDmg = 460;
      ch.maxPen = 2000;
    }
    s.charge = ch;
  }
  return s;
}

export const GRENADE = { id: 'grenade', name: 'Frag Grenade', cost: 150, max: 12, radius: 7.5, damage: 75, fuse: 2.4 };
