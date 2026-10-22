// Weapon and ammunition definitions. Speeds in m/s, penetration in mm RHA,
// damage in hit points (infantry have 100), ranges in metres, rates in rounds
// per minute. `targets` weights how suitable a weapon is against each target
// class (0 = never use against it).
//
// Projectile kinds:
//   bullet    - small arms / MG / autocannon / cannon rounds (ballistic + drag)
//   shell     - tank gun rounds (flat, fast)
//   artillery - indirect fire shells (high arc), whistle before impact
//   rocket    - unguided rockets with a short motor burn
//   missile   - guided missiles (ATGM, SAM, AGM); seeker defines behaviour
//   bomb      - free-fall bombs
//   grenade   - thrown or launched grenades with a fuse

const EX = {
  frag: { radius: 7, damage: 150, blastPen: 3, suppression: 0.8, size: 'small', crater: 0 },
  gl40: { radius: 5.5, damage: 130, blastPen: 4, suppression: 0.65, size: 'small', crater: 0 },
  rpg: { radius: 3.5, damage: 110, blastPen: 20, suppression: 0.8, size: 'medium', crater: 0.6 },
  atgm: { radius: 4, damage: 130, blastPen: 25, suppression: 0.9, size: 'large', crater: 0.8 },
  ac_he: { radius: 3, damage: 70, blastPen: 6, suppression: 0.45, size: 'small', crater: 0 },
  aa_he: { radius: 4, damage: 60, blastPen: 4, suppression: 0.4, size: 'small', crater: 0, airburst: true },
  tank_he: { radius: 11, damage: 220, blastPen: 35, suppression: 1, size: 'large', crater: 1.4 },
  heli_rocket: { radius: 9, damage: 180, blastPen: 18, suppression: 1, size: 'medium', crater: 1.0 },
  arty: { radius: 22, damage: 380, blastPen: 45, suppression: 1.5, size: 'huge', crater: 2.6 },
  mlrs: { radius: 18, damage: 300, blastPen: 30, suppression: 1.4, size: 'huge', crater: 2.0 },
  bomb: { radius: 32, damage: 600, blastPen: 90, suppression: 2, size: 'huge', crater: 4.2 },
  drone: { radius: 4, damage: 120, blastPen: 18, suppression: 0.9, size: 'medium', crater: 0.4 },
  sam: { radius: 6, damage: 90, blastPen: 3, suppression: 0.2, size: 'medium', crater: 0, airburst: true },
  agm: { radius: 6, damage: 200, blastPen: 30, suppression: 1, size: 'large', crater: 1.2 },
};

export const EXPLOSIVES = EX;

const T_INF = { inf: 1, light: 0.15, armor: 0, air: 0.08, drone: 0.25, struct: 0.1 };

export const WEAPONS = {
  // ------------------------------------------------------------ infantry
  rifle_556: {
    name: '5.56 mm assault rifle', kind: 'bullet', sound: 'rifle', speed: 920, drag: 0.0011,
    rpm: 650, burst: [1, 4], pause: [0.25, 0.9], mag: 30, reload: 2.6, ammo: 270,
    spread: 0.0032, range: 450, damage: 42, pen: 7, suppression: 0.045, tracer: 5,
    flash: 0.5, aimTime: 0.45, targets: T_INF,
  },
  rifle_545: {
    name: '5.45 mm assault rifle', kind: 'bullet', sound: 'rifle_ak', speed: 880, drag: 0.0012,
    rpm: 650, burst: [1, 4], pause: [0.25, 0.9], mag: 30, reload: 2.6, ammo: 270,
    spread: 0.0034, range: 430, damage: 41, pen: 7, suppression: 0.045, tracer: 5,
    flash: 0.5, aimTime: 0.45, targets: T_INF,
  },
  lmg_556: {
    name: '5.56 mm light machine gun', kind: 'bullet', sound: 'lmg', speed: 915, drag: 0.0011,
    rpm: 800, burst: [6, 14], pause: [0.5, 1.4], mag: 200, reload: 6, ammo: 1000,
    spread: 0.0055, range: 700, damage: 40, pen: 7, suppression: 0.08, tracer: 3,
    flash: 0.7, aimTime: 0.7, targets: { ...T_INF, air: 0.15, drone: 0.4 },
  },
  gpmg_762: {
    name: '7.62 mm general-purpose MG', kind: 'bullet', sound: 'gpmg', speed: 825, drag: 0.0009,
    rpm: 700, burst: [6, 14], pause: [0.5, 1.4], mag: 100, reload: 6, ammo: 900,
    spread: 0.0055, range: 800, damage: 52, pen: 10, suppression: 0.1, tracer: 3,
    flash: 0.8, aimTime: 0.7, targets: { ...T_INF, air: 0.15, drone: 0.4 },
  },
  dmr: {
    name: 'Marksman rifle', kind: 'bullet', sound: 'sniper', speed: 860, drag: 0.0007,
    rpm: 60, burst: [1, 1], pause: [1.6, 3.4], mag: 10, reload: 3.4, ammo: 80,
    spread: 0.00045, range: 1100, damage: 115, pen: 14, suppression: 0.2, tracer: 0,
    flash: 0.6, aimTime: 1.6, targets: { inf: 1, light: 0.05, armor: 0, air: 0, drone: 0, struct: 0 },
  },
  pistol: {
    name: 'Pistol', kind: 'bullet', sound: 'pistol', speed: 360, drag: 0.003,
    rpm: 120, burst: [1, 2], pause: [0.4, 0.9], mag: 15, reload: 1.8, ammo: 45,
    spread: 0.012, range: 70, damage: 30, pen: 3, suppression: 0.02, tracer: 0,
    flash: 0.3, aimTime: 0.3, targets: T_INF,
  },
  ugl: {
    name: '40 mm grenade launcher', kind: 'grenade', sound: 'grenade_launch', speed: 76, drag: 0,
    rpm: 15, burst: [1, 1], pause: [2.5, 5], mag: 1, reload: 3.2, ammo: 10,
    spread: 0.018, range: 340, minRange: 35, damage: 0, pen: 0, impact: true,
    explosive: EX.gl40, flash: 0.4, aimTime: 1.2, lob: true, targets: { inf: 1, light: 0.1, armor: 0, air: 0, drone: 0, struct: 0.3 },
  },
  frag: {
    name: 'Hand grenade', kind: 'grenade', sound: null, speed: 16, drag: 0,
    rpm: 10, burst: [1, 1], pause: [6, 12], mag: 1, reload: 1.5, ammo: 2,
    spread: 0.05, range: 32, minRange: 8, fuse: 3.4, damage: 0, pen: 0, thrown: true,
    explosive: EX.frag, flash: 0, aimTime: 1.0, lob: true, targets: { inf: 1, light: 0, armor: 0, air: 0, drone: 0, struct: 0 },
  },
  rpg: {
    name: 'Rocket-propelled grenade', kind: 'rocket', sound: 'rpg_launch', speed: 115, drag: 0.0002,
    thrust: { accel: 1300, burn: 0.15, sustain: 0 }, maxSpeed: 295, rpm: 8, burst: [1, 1], pause: [5, 9],
    mag: 1, reload: 5, ammo: 4, spread: 0.009, range: 380, minRange: 15, damage: 0, pen: 600,
    vehicleDamage: 340, explosive: EX.rpg, flash: 1.2, aimTime: 1.8, smokeTrail: true, backblast: true,
    targets: { inf: 0.12, light: 1, armor: 1, air: 0.05, drone: 0, struct: 0.6 },
  },
  javelin: {
    name: 'Fire-and-forget ATGM', kind: 'missile', seeker: 'ir_top', sound: 'atgm_launch', speed: 32, drag: 0,
    thrust: { accel: 160, burn: 1.6, sustain: 30 }, maxSpeed: 150, turnRate: 1.8, rpm: 3, burst: [1, 1], pause: [8, 14],
    mag: 1, reload: 18, ammo: 3, spread: 0.0, range: 2300, minRange: 70, damage: 0, pen: 850,
    vehicleDamage: 650, explosive: EX.atgm, flash: 1.0, aimTime: 3.2, smokeTrail: true, life: 22, topAttack: true,
    targets: { inf: 0.02, light: 0.8, armor: 1, air: 0.3, drone: 0, struct: 0.2 },
  },
  manpads: {
    name: 'MANPADS', kind: 'missile', seeker: 'ir', sound: 'sam_launch', speed: 28, drag: 0,
    thrust: { accel: 380, burn: 2.0, sustain: 0 }, maxSpeed: 680, turnRate: 3.2, rpm: 2, burst: [1, 1], pause: [10, 16],
    mag: 1, reload: 14, ammo: 2, spread: 0, range: 4200, minRange: 250, damage: 0, pen: 0,
    airDamage: 520, explosive: EX.sam, proximity: 7, flash: 1.0, aimTime: 2.2, smokeTrail: true, life: 14, antiAir: true,
    targets: { inf: 0, light: 0, armor: 0, air: 1, drone: 0, struct: 0 },
  },
  // ------------------------------------------------------------ vehicles
  mbt_gun: {
    name: '120 mm smoothbore', kind: 'shell', sound: 'tank_cannon', rpm: 7.5, burst: [1, 1], pause: [0, 0],
    mag: 1, reload: 7, ammo: Infinity, spread: 0.0005, range: 3200, aimTime: 1.1, flash: 3.2, recoil: 1,
    ammoTypes: {
      apfsds: { speed: 1650, drag: 0.00004, damage: 0, pen: 650, vehicleDamage: 520, tracerGlow: true },
      he: { speed: 900, drag: 0.0001, damage: 0, pen: 60, vehicleDamage: 160, explosive: EX.tank_he, tracerGlow: true },
    },
    targets: { inf: 0.55, light: 1, armor: 1, air: 0.15, drone: 0, struct: 0.8 },
  },
  coax_mg: {
    name: '7.62 mm coaxial MG', kind: 'bullet', sound: 'gpmg', speed: 830, drag: 0.0009,
    rpm: 700, burst: [8, 20], pause: [0.4, 1.0], mag: 250, reload: 5, ammo: Infinity,
    spread: 0.003, range: 900, damage: 52, pen: 10, suppression: 0.1, tracer: 3, flash: 0.6, aimTime: 0.4,
    targets: { inf: 1, light: 0.1, armor: 0, air: 0.1, drone: 0.4, struct: 0 },
  },
  hmg: {
    name: '12.7 mm heavy MG', kind: 'bullet', sound: 'hmg', speed: 890, drag: 0.0006,
    rpm: 550, burst: [4, 10], pause: [0.4, 1.2], mag: 200, reload: 6, ammo: Infinity,
    spread: 0.0028, range: 1500, damage: 95, pen: 25, vehicleDamage: 14, suppression: 0.16, tracer: 4, flash: 1.0, aimTime: 0.5,
    targets: { inf: 1, light: 0.6, armor: 0, air: 0.5, drone: 0.6, struct: 0.1 },
  },
  autocannon: {
    name: '30 mm autocannon', kind: 'bullet', sound: 'autocannon', rpm: 200, burst: [3, 7], pause: [0.6, 1.5],
    mag: 150, reload: 8, ammo: Infinity, spread: 0.0016, range: 2200, aimTime: 0.7, flash: 1.6, suppression: 0.3, tracer: 1,
    ammoTypes: {
      ap: { speed: 1150, drag: 0.0003, damage: 140, pen: 70, vehicleDamage: 60 },
      he: { speed: 1080, drag: 0.0004, damage: 60, pen: 12, vehicleDamage: 15, explosive: EX.ac_he },
    },
    targets: { inf: 0.9, light: 1, armor: 0.25, air: 0.7, drone: 0.6, struct: 0.5 },
  },
  ifv_atgm: {
    name: 'Wire-guided ATGM', kind: 'missile', seeker: 'saclos', sound: 'atgm_launch', speed: 60, drag: 0,
    thrust: { accel: 220, burn: 0.8, sustain: 30 }, maxSpeed: 230, turnRate: 1.2, rpm: 2, burst: [1, 1], pause: [10, 16],
    mag: 2, reload: 30, ammo: 6, spread: 0, range: 3600, minRange: 80, damage: 0, pen: 820,
    vehicleDamage: 620, explosive: EX.atgm, flash: 1.0, aimTime: 2.4, smokeTrail: true, life: 20,
    targets: { inf: 0, light: 0.6, armor: 1, air: 0.25, drone: 0, struct: 0.2 },
  },
  aa_twin: {
    name: '35 mm twin AA cannon', kind: 'bullet', sound: 'aa_gun', speed: 1175, drag: 0.0003,
    rpm: 1100, burst: [10, 22], pause: [0.6, 1.4], mag: 320, reload: 12, ammo: Infinity,
    spread: 0.0022, range: 3800, damage: 80, pen: 30, vehicleDamage: 35, airDamage: 70, suppression: 0.35,
    explosive: EX.aa_he, proximity: 3.5, tracer: 1, flash: 1.6, aimTime: 0.5, twin: true,
    targets: { inf: 0.35, light: 0.4, armor: 0, air: 1, drone: 1, struct: 0 },
  },
  sam_vehicle: {
    name: 'Radar-guided SAM', kind: 'missile', seeker: 'radar', sound: 'sam_launch', speed: 60, drag: 0,
    thrust: { accel: 420, burn: 2.4, sustain: 0 }, maxSpeed: 900, turnRate: 3.8, rpm: 3, burst: [1, 1], pause: [6, 10],
    mag: 4, reload: 40, ammo: 8, spread: 0, range: 8000, minRange: 400, damage: 0, pen: 0,
    airDamage: 650, explosive: EX.sam, proximity: 9, flash: 1.2, aimTime: 1.6, smokeTrail: true, life: 16, antiAir: true,
    targets: { inf: 0, light: 0, armor: 0, air: 1, drone: 0.2, struct: 0 },
  },
  howitzer: {
    name: '155 mm howitzer', kind: 'artillery', sound: 'howitzer', speed: 560, drag: 0, rpm: 6, burst: [1, 1],
    pause: [0, 0], mag: 1, reload: 9, ammo: Infinity, spread: 0.0035, range: 20000, minRange: 400, damage: 0,
    pen: 60, vehicleDamage: 260, explosive: EX.arty, flash: 4, aimTime: 2, indirect: true,
    targets: { inf: 1, light: 1, armor: 0.6, air: 0, drone: 0, struct: 1 },
  },
  mlrs_rocket: {
    name: '122 mm rocket salvo', kind: 'rocket', sound: 'mlrs_launch', speed: 140, drag: 0,
    thrust: { accel: 240, burn: 1.6, sustain: 0 }, maxSpeed: 520, rpm: 120, burst: [12, 12], pause: [0, 0],
    mag: 12, reload: 75, ammo: Infinity, spread: 0.011, range: 20000, minRange: 600, damage: 0, pen: 40,
    vehicleDamage: 220, explosive: EX.mlrs, flash: 3, aimTime: 3, indirect: true, smokeTrail: true, life: 60,
    targets: { inf: 1, light: 1, armor: 0.5, air: 0, drone: 0, struct: 1 },
  },
  // ------------------------------------------------------------ aircraft
  heli_cannon: {
    name: '30 mm chain gun', kind: 'bullet', sound: 'heli_gun', speed: 805, drag: 0.0005,
    rpm: 625, burst: [10, 20], pause: [1.0, 2.2], mag: 300, reload: 30, ammo: 1200,
    spread: 0.004, range: 1700, damage: 60, pen: 45, vehicleDamage: 26, suppression: 0.35,
    explosive: EX.ac_he, tracer: 2, flash: 1.4, aimTime: 0.6,
    targets: { inf: 1, light: 1, armor: 0.2, air: 0.4, drone: 0.3, struct: 0.4 },
  },
  heli_rockets: {
    name: '70 mm rocket pods', kind: 'rocket', sound: 'rocket_pod', speed: 300, drag: 0.0001,
    thrust: { accel: 900, burn: 0.8, sustain: 0 }, maxSpeed: 740, rpm: 600, burst: [4, 8], pause: [6, 10],
    mag: 38, reload: 999, ammo: 38, spread: 0.012, range: 3000, minRange: 300, damage: 0, pen: 90,
    vehicleDamage: 120, explosive: EX.heli_rocket, flash: 1.2, aimTime: 1.2, smokeTrail: true, life: 12,
    targets: { inf: 1, light: 1, armor: 0.3, air: 0, drone: 0, struct: 0.8 },
  },
  heli_atgm: {
    name: 'Laser-guided AT missile', kind: 'missile', seeker: 'laser', sound: 'missile_launch', speed: 90, drag: 0,
    thrust: { accel: 280, burn: 2.6, sustain: 0 }, maxSpeed: 420, turnRate: 1.6, rpm: 6, burst: [1, 1], pause: [4, 8],
    mag: 8, reload: 999, ammo: 8, spread: 0, range: 7000, minRange: 400, damage: 0, pen: 950,
    vehicleDamage: 720, explosive: EX.agm, flash: 1.2, aimTime: 1.8, smokeTrail: true, life: 25, loft: true,
    targets: { inf: 0, light: 0.8, armor: 1, air: 0.2, drone: 0, struct: 0.3 },
  },
  door_gun: {
    name: '7.62 mm door gun', kind: 'bullet', sound: 'gpmg', speed: 830, drag: 0.0009,
    rpm: 750, burst: [8, 20], pause: [0.6, 1.4], mag: 500, reload: 8, ammo: Infinity,
    spread: 0.006, range: 900, damage: 52, pen: 10, suppression: 0.1, tracer: 2, flash: 0.8, aimTime: 0.4,
    targets: { inf: 1, light: 0.2, armor: 0, air: 0.2, drone: 0.4, struct: 0 },
  },
  jet_cannon: {
    name: 'Rotary cannon', kind: 'bullet', sound: 'jet_gun', speed: 1030, drag: 0.0004,
    rpm: 3600, burst: [60, 90], pause: [0, 0], mag: 500, reload: 999, ammo: 500,
    spread: 0.0055, range: 1600, damage: 70, pen: 35, vehicleDamage: 30, suppression: 0.5,
    explosive: EX.ac_he, tracer: 3, flash: 2, aimTime: 0.3, oneSoundPerBurst: true,
    targets: { inf: 1, light: 1, armor: 0.35, air: 0.4, drone: 0, struct: 0.5 },
  },
  bomb: {
    name: '500 lb bomb', kind: 'bomb', sound: null, speed: 0, drag: 0.00005, rpm: 240, burst: [2, 4], pause: [0, 0],
    mag: 4, reload: 999, ammo: 4, spread: 0, range: 3000, damage: 0, pen: 90, vehicleDamage: 900,
    explosive: EX.bomb, flash: 0, aimTime: 0, targets: { inf: 1, light: 1, armor: 1, air: 0, drone: 0, struct: 1 },
  },
  agm: {
    name: 'Air-to-ground missile', kind: 'missile', seeker: 'laser', sound: 'missile_launch', speed: 220, drag: 0,
    thrust: { accel: 160, burn: 3, sustain: 0 }, maxSpeed: 520, turnRate: 1.4, rpm: 30, burst: [1, 1], pause: [2, 3],
    mag: 2, reload: 999, ammo: 2, spread: 0, range: 8000, minRange: 600, damage: 0, pen: 1000,
    vehicleDamage: 900, explosive: EX.agm, flash: 1.4, aimTime: 1.2, smokeTrail: true, life: 25,
    targets: { inf: 0.1, light: 0.8, armor: 1, air: 0, drone: 0, struct: 0.6 },
  },
  aam: {
    name: 'Short-range AAM', kind: 'missile', seeker: 'ir', sound: 'missile_launch', speed: 250, drag: 0,
    thrust: { accel: 300, burn: 2.5, sustain: 0 }, maxSpeed: 900, turnRate: 4, rpm: 20, burst: [1, 1], pause: [3, 6],
    mag: 2, reload: 999, ammo: 2, spread: 0, range: 6000, minRange: 400, damage: 0, pen: 0,
    airDamage: 700, explosive: EX.sam, proximity: 9, flash: 1.0, aimTime: 1.4, smokeTrail: true, life: 18, antiAir: true,
    targets: { inf: 0, light: 0, armor: 0, air: 1, drone: 0, struct: 0 },
  },
  drone_warhead: {
    name: 'FPV warhead', kind: 'drone', sound: null, damage: 0, pen: 520, vehicleDamage: 480,
    explosive: EX.drone, targets: { inf: 0.6, light: 1, armor: 1, air: 0, drone: 0, struct: 0.2 },
  },
};

for (const [id, w] of Object.entries(WEAPONS)) w.id = id;

// Pick the ammo type for a gun against a target class.
export function chooseAmmo(def, targetClass) {
  if (!def.ammoTypes) return null;
  if (def.ammoTypes.apfsds) return targetClass === 'armor' || targetClass === 'light' || targetClass === 'air' ? 'apfsds' : 'he';
  if (def.ammoTypes.ap) return targetClass === 'armor' || targetClass === 'light' ? 'ap' : 'he';
  return Object.keys(def.ammoTypes)[0];
}

// Resolved projectile parameters for a def + ammo type.
export function ammoParams(def, ammo) {
  if (ammo && def.ammoTypes && def.ammoTypes[ammo]) return def.ammoTypes[ammo];
  return def;
}
