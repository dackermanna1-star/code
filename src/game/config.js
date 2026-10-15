// Gameplay constants, taken from the original game's cvars / weapon scripts
// (see docs/RESEARCH_MECHANICS.md) and converted from Hammer units to metres.
export const U = 0.0254; // 1 Hammer unit in metres

export const SURVIVOR = {
  maxHealth: 100,
  runSpeed: 220 * U,          // 5.59 m/s
  walkSpeed: 85 * U,
  crouchSpeed: 75 * U,
  limpSpeed: 150 * U,          // total HP < 40
  critSpeed: 85 * U,           // at 1 HP
  adrenalineSpeed: 260 * U,
  limpHealth: 40,
  gravity: 800 * U,            // 20.3 m/s^2
  jumpVel: 6.6,                // ~1.07 m apex
  friction: 4,
  accelerate: 5,
  airAccelerate: 10,
  stopSpeed: 75 * U,
  radius: 0.36,
  height: 1.83,
  crouchHeight: 1.25,
  eyeHeight: 62 * U,           // 1.57 m
  crouchEye: 1.0,
  incapEye: 24 * U,
  useRange: 96 * U,            // 2.44 m
  shoveRange: 75 * U,          // 1.9 m
  shoveInterval: 0.7,
  shoveFatigueMin: 5,          // co-op fatigue penalty starts after this many rapid shoves
  shoveFatigueMax: 8,
  incapHealth: 300,
  incapDecay: 3,               // hp/s
  incapDecayHopeless: 12,
  reviveTime: 5,
  reviveHealth: 30,            // temp
  maxIncaps: 2,                // third incap kills
  ledgeHealth: 300,
  ledgeDecay: 3,
  medkitTime: 5,
  medkitPercent: 0.8,
  defibTime: 3,
  defibHealth: 50,
  pillsHealth: 50,
  adrenalineHealth: 25,
  adrenalineDuration: 15,
  tempDecay: 0.27,             // hp/s
  fallSafeSpeed: 560 * U,      // 14.2 m/s (~5 m drop)
  fallFatalSpeed: 720 * U,     // 18.3 m/s (~8.2 m drop)
  rescueMinDeadTime: 60,
  hitGrace: { easy: 0.5, normal: 0.33, advanced: 0.5, expert: 1.0 },
};

export const DIFFICULTY = {
  easy:     { name: 'Easy',     commonDmg: 1,  ff: 0,   bodyFactor: 2.0,  tankHp: 3000, tankPunch: 24,  tankPound: 75,  witchKills: false, claw: 1,  hunterClaw: 10, chargerPunch: 5,  shred: 5,  choke: 10, ride: 4,  incapFactor: 0.1, burn: 0.2, specialDelay: 3,   witchStartle: 8, hazmatHp: 50 },
  normal:   { name: 'Normal',   commonDmg: 2,  ff: 0.1, bodyFactor: 1.0,  tankHp: 4000, tankPunch: 24,  tankPound: 75,  witchKills: false, claw: 2,  hunterClaw: 10, chargerPunch: 10, shred: 5,  choke: 10, ride: 4,  incapFactor: 1,   burn: 0.2, specialDelay: 1.5, witchStartle: 5, hazmatHp: 150 },
  advanced: { name: 'Advanced', commonDmg: 5,  ff: 0.3, bodyFactor: 0.75, tankHp: 8000, tankPunch: 33,  tankPound: 100, witchKills: false, claw: 5,  hunterClaw: 20, chargerPunch: 15, shred: 10, choke: 20, ride: 8,  incapFactor: 1,   burn: 0.4, specialDelay: 0.3, witchStartle: 5, hazmatHp: 150 },
  expert:   { name: 'Expert',   commonDmg: 20, ff: 0.5, bodyFactor: 0.5,  tankHp: 8000, tankPunch: 100, tankPound: 150, witchKills: true,  claw: 20, hunterClaw: 40, chargerPunch: 20, shred: 15, choke: 30, ride: 12, incapFactor: 1,   burn: 1.0, specialDelay: 0,   witchStartle: 4, hazmatHp: 150 },
};

export const COMMON = {
  health: 50,
  runSpeed: 250 * U,          // 6.35 m/s
  walkSpeed: 85 * U,
  attackInterval: 1.0,
  attackRange: 1.15,          // centre-to-centre reach
  attackRangeRun: 1.4,
  limit: 30,
  doorDamage: 60,
  hearGunfire: 200 * U * 6,   // louder weapons reach further; base ~30 m for guns
  hearRunner: 500 * U,
  acquireNear: 200 * U,
  sightRange: 1000 * U,       // daytime maps see much further
  stunTime: 1.25,
  radius: 0.34,
};

export const SPECIAL = {
  boomer: { hp: 50, speed: 175 * U, vomitRange: 300 * U, vomitMax: 350 * U, vomitDuration: 1.5, cooldown: 30, explodeInner: 130 * U, explodeOuter: 200 * U, bileTime: 20, bileScreen: 10 },
  hunter: { hp: 250, speed: 300 * U, pounceRange: 750 * U, readyRange: 500 * U, airSpeed: 700 * U, shredInterval: 0.5, interruptDamage: 50 },
  smoker: { hp: 250, speed: 210 * U, tongueRange: 750 * U, tongueSpeed: 1000 * U, dragSpeed: 175 * U, hitCooldown: 20, missCooldown: 15, breakDamage: 50, cloudRadius: 175 * U },
  charger: { hp: 600, speed: 250 * U, chargeSpeed: 500 * U, chargeTime: 2.5, warmup: 0.5, cooldown: 12, impactRadius: 120 * U, poundDmg: 15, poundInterval: 1.6 },
  jockey: { hp: 325, speed: 250 * U, leapRange: 200 * U, leapPower: 400 * U },
  spitter: { hp: 100, speed: 210 * U, range: 850 * U, projSpeed: 900 * U, cooldown: 20, poolTime: 7, poolRadius: 1.7 },
  tank: { speed: 210 * U, punchRange: 1.9, swingInterval: 1.5, missInterval: 1.0, windup: 0.5, throwMin: 250 * U, throwInterval: 8, rockHp: 50 },
  witch: { hp: 1000, speed: 300 * U, burnSpeed: 200 * U, personal: 100 * U, flashlight: 400 * U, wanderPersonal: 240 * U, wanderTime: 10, angerRate: 0.2, relaxRate: 0.05, burnTime: 15 },
};

export const DIRECTOR = {
  mobInterval: { easy: [120, 240], normal: [90, 180], advanced: [90, 180], expert: [90, 180] },
  mobSize: [10, 30],
  megaMob: 50,
  mobBehindChance: 0.75,
  spawnMin: 550 * U,          // 14 m
  spawnMax: 1500 * U,         // 38 m
  discard: 2500 * U,          // 63.5 m
  specialMin: 250 * U,
  specialInitial: [30, 60],
  specialRespawn: 45,
  maxSpecials: 2,
  buildUpMin: 15,
  peakThreshold: 0.9,
  sustain: [3, 5],
  relax: [30, 45],
  relaxFlow: 3000 * U,
  intensityDecayTime: 30,
  wanderDensity: 0.03 / (U * U) * 0.0007, // tuned per m^2 below
};

// Weapons. damage per bullet/pellet; cycle = seconds between shots; reload seconds;
// spread in degrees: [standing, crouched, max, perShot, decayPerSec, moving]; range modifier per 500u.
export const WEAPONS = {
  pistol:       { slot: 1, kind: 'pistol', name: 'Pistol', dmg: 36, pellets: 1, cycle: 0.175, clip: 15, reserve: Infinity, reload: 1.75, rangeMod: 0.75, pen: 1, spread: [1.5, 0.5, 30, 1.2, 8, 3], sound: 'pistol_fire', semi: true, tier: 0 },
  dual_pistols: { slot: 1, kind: 'pistol', name: 'Dual Pistols', dmg: 36, pellets: 1, cycle: 0.0875, clip: 30, reserve: Infinity, reload: 2.3, rangeMod: 0.75, pen: 1, spread: [2.0, 0.9, 30, 1.4, 8, 3.5], sound: 'dual_pistol_fire', semi: true, tier: 0 },
  magnum:       { slot: 1, kind: 'pistol', name: 'Magnum', dmg: 80, pellets: 1, cycle: 0.3, clip: 8, reserve: Infinity, reload: 2.0, rangeMod: 0.75, pen: 4, spread: [1.25, 0.5, 30, 3, 6, 3], sound: 'magnum_fire', semi: true, tier: 0, kick: 2.2 },
  smg:          { slot: 0, kind: 'smg', name: 'Submachine Gun', dmg: 20, pellets: 1, cycle: 0.0625, clip: 50, reserve: 650, reload: 2.27, rangeMod: 0.84, pen: 1, spread: [1.0, 0.7, 30, 0.45, 6, 2.5], sound: 'smg_fire', tier: 1 },
  smg_silenced: { slot: 0, kind: 'smg', name: 'Silenced SMG', dmg: 25, pellets: 1, cycle: 0.0625, clip: 50, reserve: 650, reload: 2.27, rangeMod: 0.84, pen: 1, spread: [1.2, 0.85, 30, 0.5, 6, 2.6], sound: 'smg_silenced_fire', tier: 1, quiet: true },
  pump_shotgun: { slot: 0, kind: 'shotgun', name: 'Pump Shotgun', dmg: 25, pellets: 10, cycle: 0.9, clip: 8, reserve: 72, reloadShell: 0.473, rangeMod: 0.7, pen: 1, scatter: [5.0, 7.5], spread: [1.5, 1, 10, 0, 6, 2], sound: 'pump_shotgun_fire', pump: true, tier: 1, kick: 3 },
  chrome_shotgun: { slot: 0, kind: 'shotgun', name: 'Chrome Shotgun', dmg: 31, pellets: 8, cycle: 0.9, clip: 8, reserve: 72, reloadShell: 0.473, rangeMod: 0.7, pen: 1, scatter: [3.0, 5.0], spread: [1.5, 1, 10, 0, 6, 2], sound: 'chrome_shotgun_fire', pump: true, tier: 1, kick: 3 },
  auto_shotgun: { slot: 0, kind: 'shotgun', name: 'Auto Shotgun', dmg: 23, pellets: 11, cycle: 0.3, clip: 10, reserve: 90, reloadShell: 0.396, rangeMod: 0.7, pen: 1, scatter: [4.0, 8.5], spread: [1.5, 1, 10, 0, 6, 2], sound: 'auto_shotgun_fire', tier: 2, tankScale: 0.85, kick: 2.6 },
  spas:         { slot: 0, kind: 'shotgun', name: 'Combat Shotgun', dmg: 28, pellets: 9, cycle: 0.3, clip: 10, reserve: 90, reloadShell: 0.396, rangeMod: 0.7, pen: 1, scatter: [3.5, 8.0], spread: [1.5, 1, 10, 0, 6, 2], sound: 'spas_fire', tier: 2, tankScale: 0.85, kick: 2.6 },
  m16:          { slot: 0, kind: 'rifle', name: 'Assault Rifle', dmg: 33, pellets: 1, cycle: 0.0875, clip: 50, reserve: 360, reload: 2.2, rangeMod: 0.97, pen: 3, spread: [0.4, 0.05, 30, 0.75, 7, 2.5], sound: 'm16_fire', tier: 2 },
  ak47:         { slot: 0, kind: 'rifle', name: 'AK-47', dmg: 58, pellets: 1, cycle: 0.13, clip: 40, reserve: 360, reload: 2.36, rangeMod: 0.97, pen: 3, spread: [1.0, 0.5, 35, 1.6, 7, 3], sound: 'ak47_fire', tier: 2, kick: 1.6 },
  scar:         { slot: 0, kind: 'rifle', name: 'Combat Rifle', dmg: 44, pellets: 1, cycle: 0.07, burst: 3, burstDelay: 0.14, clip: 60, reserve: 360, reload: 3.32, rangeMod: 0.97, pen: 3, spread: [0.35, 0.05, 25, 0.6, 7, 2.4], sound: 'scar_fire', tier: 2 },
  hunting_rifle: { slot: 0, kind: 'sniper', name: 'Hunting Rifle', dmg: 90, pellets: 1, cycle: 0.25, clip: 15, reserve: 150, reload: 3.1, rangeMod: 1.0, pen: 6, spread: [0.1, 0, 15, 2.5, 8, 4], sound: 'hunting_rifle_fire', semi: true, scope: 3, tier: 2, kick: 2.4 },
  sniper_military: { slot: 0, kind: 'sniper', name: 'Sniper Rifle', dmg: 90, pellets: 1, cycle: 0.25, clip: 30, reserve: 180, reload: 3.33, rangeMod: 1.0, pen: 6, spread: [0.5, 0.05, 15, 2.2, 8, 4], sound: 'sniper_fire', semi: true, scope: 3, tier: 2, kick: 2.2 },
  grenade_launcher: { slot: 0, kind: 'launcher', name: 'Grenade Launcher', dmg: 400, pellets: 1, cycle: 0.4, clip: 1, reserve: 30, reload: 3.3, rangeMod: 1, pen: 0, spread: [0.5, 0.3, 5, 0, 5, 2], sound: 'grenade_launcher_fire', semi: true, projectile: true, tier: 3, tankScale: 3, kick: 3 },
  m60:          { slot: 0, kind: 'mg', name: 'M60', dmg: 50, pellets: 1, cycle: 0.11, clip: 150, reserve: 0, reload: 0, rangeMod: 0.97, pen: 3, spread: [1.0, 0.5, 35, 0.8, 6, 3], sound: 'm60_fire', tier: 3, noReload: true },
  chainsaw:     { slot: 1, kind: 'chainsaw', name: 'Chainsaw', dmg: 100, hitInterval: 0.1, fuel: 30, reach: 50 * U * 1.8, tier: 0, melee: true },
};

export const MELEE = {
  fireaxe:      { name: 'Fire Axe', refire: 1.0, type: 'slash', reach: 1.9, arc: 1.2 },
  crowbar:      { name: 'Crowbar', refire: 0.8, type: 'slash', reach: 1.7, arc: 1.0 },
  cricket_bat:  { name: 'Cricket Bat', refire: 0.8, type: 'club', reach: 1.8, arc: 1.1 },
  katana:       { name: 'Katana', refire: 0.8, type: 'slash', reach: 2.0, arc: 1.15 },
  baseball_bat: { name: 'Baseball Bat', refire: 0.75, type: 'club', reach: 1.8, arc: 1.1 },
  golf_club:    { name: 'Golf Club', refire: 0.75, type: 'club', reach: 2.0, arc: 1.1 },
  knife:        { name: 'Knife', refire: 0.8, type: 'slash', reach: 1.5, arc: 0.9 },
};
for (const k in MELEE) Object.assign(MELEE[k], { slot: 1, kind: 'melee', melee: true });

export const THROWABLES = {
  pipebomb: { name: 'Pipe Bomb', fuse: 6, radius: 4.0, damage: 200 },
  molotov: { name: 'Molotov', burn: 15, radius: 3.6 },
  bilejar: { name: 'Bile Bomb', radius: 110 * U, duration: 20 },
};

export const ITEMS = {
  medkit: { slot: 3, name: 'First Aid Kit' },
  defib: { slot: 3, name: 'Defibrillator' },
  upgrade_incendiary: { slot: 3, name: 'Incendiary Ammo' },
  upgrade_explosive: { slot: 3, name: 'Explosive Ammo' },
  pills: { slot: 4, name: 'Pain Pills' },
  adrenaline: { slot: 4, name: 'Adrenaline' },
  pipebomb: { slot: 2, name: 'Pipe Bomb' },
  molotov: { slot: 2, name: 'Molotov' },
  bilejar: { slot: 2, name: 'Bile Bomb' },
};

// Hitgroup damage multipliers vs special infected (commons: headshot always kills)
export const HITGROUP = { head: 4, chest: 1, stomach: 1.25, arm: 1, leg: 0.75 };

export const GLOW = {
  teammate: [0.3, 0.4, 1.0],
  hurt: [1.0, 0.4, 0.0],
  item: [0.7, 0.7, 1.0],
  itemFar: [0.3, 0.4, 1.0],
  thirdStrike: [1.0, 0.0, 0.0],
};
