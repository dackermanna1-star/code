// Projectile definitions used by the spell table (data only; behaviour lives in the ProjectileSystem).
//
// Numbers come from the Noita wiki spell infoboxes (docs/research-notes.md section 2) converted with the
// conventions in types.ts: px() converts Noita pixels (distances, px/s speeds, px/s^2 gravity) to voxels;
// lifetimes stay in frames; damage stays in displayed HP. Explosion `rayEnergy` is the energy budget each
// blast ray spends on voxel hardness (world/materials.ts: soil 2, wood 2.5, coal 25, rock 100, dense rock 200).
//
// Friendly fire convention: a projectile with `ownerGraceFrames` set (Arrow, Healing bolt, Acid ball, Death
// cross, Black hole) can hit its own caster once that many frames have passed, like Noita's friendly-fire
// projectiles; without it the projectile body never hits its caster unless the shot state has
// friendlyFire (Piercing shot). Explosions always hurt the caster (explosion.damageSelf defaults to true).

import type { ProjectileDef } from './types';

/** Noita pixels (or px/s, px/s^2) -> voxels. */
const px = (n: number): number => n * 0.5;

type Spec = Omit<ProjectileDef, 'id' | 'gravity' | 'bounces' | 'bounceEnergy' | 'damage'> &
  Partial<Pick<ProjectileDef, 'gravity' | 'bounces' | 'bounceEnergy' | 'damage'>>;

function proj(id: string, s: Spec): ProjectileDef {
  return { id, gravity: 0, bounces: 0, bounceEnergy: 0, damage: {}, ...s };
}

/** Lifetime range for Noita's "lifetime ± random". */
const life = (frames: number, random = 0): [number, number] => [frames - random, frames + random];
const speed = (minPx: number, maxPx = minPx): [number, number] => [px(minPx), px(maxPx)];

const LIST: ProjectileDef[] = [
  // ------------------------------------------------------------------ bolts
  proj('spark_bolt', {
    speed: speed(750, 850), lifetime: life(40, 7), gravity: px(200), radius: 0.6,
    damage: { projectile: 3 },
    // Tiny blast: chips soil/coal/wood (durability <= 8 gate, little energy), never rock.
    explosion: { radius: px(2), durability: 8, rayEnergy: 30 }, explodeOn: 'hit',
    visual: { style: 'spark', color: '#bff4ff', size: 0.45, trail: '#4fa8ff', light: '#7fd8ff', lightRadius: 6 },
    castSound: 'cast_spark', hitSound: 'impact_small',
  }),
  proj('spark_bolt_double_trigger', {
    speed: speed(650, 750), lifetime: life(40, 7), gravity: px(200), radius: 0.6,
    damage: { projectile: 3.75, explosion: 2.5 },
    explosion: { radius: px(12), durability: 9, rayEnergy: 60 }, explodeOn: 'hit',
    visual: { style: 'spark', color: '#8fb8ff', size: 0.55, trail: '#3a6cff', light: '#6f9cff', lightRadius: 7 },
    castSound: 'cast_spark', hitSound: 'impact_small',
  }),
  proj('bouncing_burst', {
    speed: speed(650, 750), lifetime: life(750, 7), gravity: px(250), radius: 0.5,
    damage: { projectile: 3 }, bounces: 10, bounceEnergy: 0.9, // no terrain damage
    visual: { style: 'spark', color: '#d8ff5a', size: 0.4, trail: '#9adf2a', light: '#c8ff60', lightRadius: 4 },
    castSound: 'cast_spark', hitSound: 'impact_small',
  }),
  proj('energy_orb', {
    speed: speed(180, 240), lifetime: life(50, 7), gravity: 0, radius: 1.2,
    damage: { projectile: 11.25, explosion: 4.5 },
    explosion: { radius: px(15), durability: 10, rayEnergy: 600 }, explodeOn: 'both',
    visual: { style: 'orb', color: '#8a7dff', size: 0.9, trail: '#5a4aff', light: '#9a8cff', lightRadius: 9 },
    castSound: 'cast_generic', hitSound: 'explosion_small',
  }),
  proj('spitter_bolt', {
    speed: speed(400, 600), lifetime: life(25, 7), gravity: px(200), radius: 0.6,
    damage: { projectile: 7.5 }, bounces: 10, bounceEnergy: 0.6, // no terrain damage
    visual: { style: 'bolt', color: '#ff6a4a', size: 0.45, trail: '#c8342a', light: '#ff7050', lightRadius: 4 },
    castSound: 'cast_generic', hitSound: 'impact_small',
  }),
  proj('spitter_bolt_large', {
    speed: speed(600, 800), lifetime: life(30, 12), gravity: px(200), radius: 0.8,
    damage: { projectile: 12.5 }, bounces: 10, bounceEnergy: 0.6,
    visual: { style: 'bolt', color: '#ff5a6a', size: 0.6, trail: '#c02a3a', light: '#ff6070', lightRadius: 5 },
    castSound: 'cast_generic', hitSound: 'impact_small',
  }),
  proj('bubble_spark', {
    speed: speed(200, 300), lifetime: life(100, 7), gravity: 0, radius: 0.8,
    damage: { projectile: 5 }, bounces: 20, bounceEnergy: 0.85,
    explosion: { radius: px(4), durability: 10, rayEnergy: 60 }, explodeOn: 'both',
    visual: { style: 'bubble', color: '#8adcff', size: 0.6, light: '#7ac8ff', lightRadius: 4 },
    castSound: 'cast_generic', hitSound: 'impact_small',
  }),
  proj('arrow', {
    speed: speed(550, 650), lifetime: life(750, 7), gravity: px(250), radius: 0.5,
    damage: { slice: 5 }, bounces: 1, bounceEnergy: 0.35, ownerGraceFrames: 6, // friendly fire
    visual: { style: 'arrow', color: '#a07850', size: 0.8 },
    castSound: 'cast_generic', hitSound: 'impact_small',
  }),
  proj('concentrated_light', {
    // Noita: 130-150 px/s with air friction -9 (accelerates into a near-instant beam). No acceleration
    // field in the contract, so the effective beam speed is used instead.
    speed: [550, 650], lifetime: life(30, 7), gravity: 0, radius: 0.5,
    damage: { projectile: 9.75, explosion: 5.5 }, bounces: 10, bounceEnergy: 1,
    explosion: { radius: px(3), durability: 10, rayEnergy: 150 }, explodeOn: 'hit',
    status: { stunned: 10 },
    visual: { style: 'beam', color: '#7dff6a', size: 0.3, trail: '#3fdc3a', light: '#80ff70', lightRadius: 6 },
    castSound: 'cast_electric', hitSound: 'electric_zap',
  }),
  proj('healing_bolt', {
    speed: speed(625, 650), lifetime: life(60, 7), gravity: px(200), radius: 0.6,
    damage: { healing: 8.75 }, special: 'heal_target', ownerGraceFrames: 4, // must be able to hit the caster
    visual: { style: 'heal', color: '#7aff8a', size: 0.5, trail: '#3adc5a', light: '#80ff90', lightRadius: 5 },
    castSound: 'cast_heal', hitSound: 'impact_small',
  }),
  proj('teleport_bolt', {
    speed: speed(750, 850), lifetime: life(40, 7), gravity: px(200), radius: 0.6,
    special: 'teleport_caster',
    visual: { style: 'teleport', color: '#c890ff', size: 0.5, trail: '#8a50e8', light: '#b080ff', lightRadius: 6 },
    castSound: 'cast_teleport', hitSound: 'impact_small',
  }),
  proj('teleport_bolt_small', {
    speed: speed(1350), lifetime: life(8), gravity: px(200), radius: 0.6,
    special: 'teleport_caster',
    visual: { style: 'teleport', color: '#d8b0ff', size: 0.4, trail: '#9a6af0', light: '#c090ff', lightRadius: 5 },
    castSound: 'cast_teleport', hitSound: 'impact_small',
  }),

  // ------------------------------------------------------------------ explosives
  proj('magic_missile', {
    // Self-propelled: the wiki's gravity value is ignored so the slow missile keeps its line.
    speed: speed(70, 100), lifetime: life(360, 7), gravity: 0, radius: 1.2,
    damage: { projectile: 75, explosion: 105 },
    explosion: { radius: px(15), durability: 10, rayEnergy: 1500, fire: true }, explodeOn: 'both',
    visual: { style: 'missile', color: '#ffb040', size: 0.9, trail: '#8a8a8a', light: '#ff9a30', lightRadius: 8 },
    castSound: 'cast_heavy', hitSound: 'explosion_big',
  }),
  proj('bomb', {
    speed: speed(60), lifetime: life(180), gravity: px(400), radius: 1.2,
    damage: { explosion: 125 }, bounces: 6, bounceEnergy: 0.35,
    // Clears most terrain, erodes the rim to powder; durability 11 keeps steel / extremely dense rock intact.
    explosion: { radius: px(60), durability: 11, rayEnergy: 9000, powderEdge: true }, explodeOn: 'death',
    visual: { style: 'bomb', color: '#3a3a44', size: 1.1, light: '#ff5a30', lightRadius: 3 },
    castSound: 'cast_bomb', hitSound: 'explosion_big',
  }),
  proj('dynamite', {
    speed: speed(800), lifetime: life(50), gravity: px(400), radius: 0.8,
    damage: { explosion: 62.5 }, bounces: 3, bounceEnergy: 0.45, spin: true,
    explosion: { radius: px(28), durability: 11, rayEnergy: 3500, fire: true }, explodeOn: 'both',
    visual: { style: 'dynamite', color: '#d8402a', size: 0.8, trail: '#ffcf40', light: '#ffb040', lightRadius: 3 },
    castSound: 'cast_bomb', hitSound: 'explosion_big',
  }),
  proj('fireball', {
    speed: speed(160, 170), lifetime: life(60), gravity: px(100), radius: 1.2,
    damage: { explosion: 50, fire: 6.25 },
    explosion: { radius: px(15), durability: 10, rayEnergy: 1500, fire: true }, explodeOn: 'both',
    status: { onFire: 300 },
    visual: { style: 'fire', color: '#ff7a1a', size: 1.0, trail: '#ffcf40', light: '#ff8a28', lightRadius: 10 },
    castSound: 'cast_fire', hitSound: 'explosion_small',
  }),
  proj('firebolt', {
    speed: speed(250, 280), lifetime: life(500, 7), gravity: px(400), radius: 0.9,
    damage: { projectile: 32.5, explosion: 47.5, fire: 12.5 }, bounces: 4, bounceEnergy: 0.6,
    explosion: { radius: px(7), durability: 10, rayEnergy: 800, fire: true }, explodeOn: 'hit',
    status: { onFire: 180 },
    visual: { style: 'fire', color: '#ffa030', size: 0.7, trail: '#ff5a10', light: '#ff9a30', lightRadius: 7 },
    castSound: 'cast_fire', hitSound: 'explosion_small',
  }),
  proj('unstable_crystal', {
    // Proximity mine: the large creature radius stands in for Noita's "explodes when something comes near".
    speed: speed(120, 160), lifetime: life(900), gravity: px(400), radius: 6,
    damage: { explosion: 62.5 }, bounces: 2, bounceEnergy: 0.25,
    explosion: { radius: px(35), durability: 8, rayEnergy: 120 }, explodeOn: 'both',
    visual: { style: 'orb', color: '#e05aff', size: 0.6, light: '#d060ff', lightRadius: 5 },
    castSound: 'cast_generic', hitSound: 'explosion_small',
  }),
  proj('lightning_bolt', {
    // Not limited by terminal velocity; near-instant short-range strike.
    speed: speed(5400), lifetime: life(2), gravity: 0, radius: 0.8,
    damage: { electric: 25, explosion: 125 },
    explosion: { radius: px(35), durability: 10, rayEnergy: 1500 }, explodeOn: 'both',
    special: 'lightning', status: { stunned: 30 },
    visual: { style: 'lightning', color: '#d8ecff', size: 0.4, light: '#bcd8ff', lightRadius: 16 },
    castSound: 'cast_electric', hitSound: 'electric_zap',
  }),
  proj('death_cross', {
    // Spawned at the wand tip; pierces everything, blasts every 15 frames, final explosion on expiry.
    speed: [0, 0], lifetime: life(68), gravity: 0, radius: 2.5, stationary: true,
    damage: { explosion: 75 }, bounces: 20, bounceEnergy: 0.8, passCreatures: true,
    explosion: { radius: px(25), durability: 10, rayEnergy: 400 }, explodeOn: 'death',
    special: 'death_cross', ownerGraceFrames: 0, // friendly fire
    visual: { style: 'cross', color: '#ff4a8a', size: 1.4, light: '#ff60a0', lightRadius: 10 },
    castSound: 'cast_heavy', hitSound: 'explosion_small',
  }),
  proj('black_hole', {
    // Eats every solid in its path (durability gate 14 covers temple brick but not the indestructible
    // world boundary); no damage; pulls objects. Leaves liquids and gases alone.
    speed: speed(40), lifetime: life(120, 7), gravity: 0, radius: 2, ownerGraceFrames: 10,
    passTerrain: true, passCreatures: true, dig: { radius: 6, durability: 14 },
    special: 'black_hole',
    visual: { style: 'blackhole', color: '#0a0010', size: 2.2, trail: '#6a2aa8', light: '#7a3ac8', lightRadius: 6 },
    castSound: 'cast_heavy', hitSound: 'impact_dirt',
  }),

  // ------------------------------------------------------------------ digging tools
  proj('chainsaw', {
    // Slices whatever is at the wand tip every frame (radius 3 px -> rounded up so the tunnel stays usable).
    speed: [0, 0], lifetime: life(1), gravity: 0, radius: 2, stationary: true,
    damage: { slice: 12.75 }, passTerrain: true, passCreatures: true,
    dig: { radius: 2, durability: 10 },
    visual: { style: 'saw', color: '#c8c8d0', size: 0.9 },
    castSound: 'cast_dig', hitSound: 'impact_dirt',
  }),
  proj('digging_bolt', {
    // Static 2-frame sphere at the wand tip.
    speed: [0, 0], lifetime: life(2), gravity: 0, radius: px(6), stationary: true,
    damage: { drill: 7.5 }, passTerrain: true, passCreatures: true,
    dig: { radius: px(6), durability: 10 },
    visual: { style: 'orb', color: '#e8d8a8', size: 1.2, light: '#fff0c0', lightRadius: 3 },
    castSound: 'cast_dig', hitSound: 'impact_dirt',
  }),
  proj('luminous_drill', {
    // Short, very fast beam: 1400 px/s for 2 frames (~23 voxels). Durability 14 digs temple brick.
    speed: speed(1400), lifetime: life(2), gravity: 0, radius: 1,
    damage: { projectile: 10 }, passTerrain: true, passCreatures: true,
    dig: { radius: 2, durability: 14 },
    visual: { style: 'beam', color: '#d8fff0', size: 0.5, trail: '#7affd0', light: '#a0ffe0', lightRadius: 8 },
    castSound: 'cast_dig', hitSound: 'impact_dirt',
  }),

  // ------------------------------------------------------------------ elemental
  proj('flamethrower', {
    speed: speed(160, 170), lifetime: life(80), gravity: px(100), radius: 1,
    damage: { fire: 11.25, explosion: 12.5 },
    explosion: { radius: px(8), durability: 4, rayEnergy: 20, fire: true }, explodeOn: 'both',
    material: { onDeath: { mat: 'fire', amount: 3 } }, status: { onFire: 300 },
    visual: { style: 'fire', color: '#ff8a20', size: 0.8, trail: '#ffcf40', light: '#ff8a28', lightRadius: 6 },
    castSound: 'cast_fire', hitSound: 'impact_small',
  }),
  proj('freezing_gaze', {
    // One of the 12 fan projectiles; each pierces creatures and terrain and can hit each target once.
    speed: speed(220), lifetime: life(25), gravity: 0, radius: 0.8,
    damage: { ice: 10 }, bounces: 10, bounceEnergy: 0.8, passCreatures: true, passTerrain: true,
    special: 'freeze_area', status: { frozen: 50 },
    visual: { style: 'ice', color: '#9affd0', size: 0.4, light: '#90ffc8', lightRadius: 4 },
    castSound: 'cast_ice', hitSound: 'freeze',
  }),
  proj('acid_ball', {
    speed: speed(90, 108), lifetime: life(330), gravity: px(10), radius: 0.9,
    damage: { projectile: 6 },
    material: { onHit: { mat: 'acid', amount: 40 }, trail: { mat: 'acid', chance: 0.12 } },
    ownerGraceFrames: 10, // friendly fire
    visual: { style: 'acid', color: '#c6ef2a', size: 0.7, trail: '#a8d820', light: '#d0ff40', lightRadius: 4 },
    castSound: 'cast_material', hitSound: 'water_splash',
  }),

  // ------------------------------------------------------------------ material circles (expanding rings)
  ...(
    [
      ['circle_water', 'water', '#3a6fc8'],
      ['circle_oil', 'oil', '#3a3028'],
      ['circle_fire', 'fire', '#ff8a28'],
      ['circle_acid', 'acid', '#c6ef2a'],
    ] as const
  ).map(([id, mat, color]) =>
    proj(id, {
      speed: [0, 0], lifetime: life(260), gravity: 0, radius: 0, stationary: true,
      material: { circle: { mat, radius: 16 } },
      visual: { style: 'circle', color, size: 1, ...(mat === 'fire' || mat === 'acid' ? { light: color, lightRadius: 8 } : {}) },
      castSound: 'cast_material',
    }),
  ),

  // ------------------------------------------------------------------ seas (big box of material below the caster)
  ...(
    [
      ['sea_water', 'water', '#3a6fc8'],
      ['sea_oil', 'oil', '#3a3028'],
      ['sea_lava', 'lava', '#ff6a10'],
      ['sea_acid', 'acid', '#c6ef2a'],
      ['sea_flamgas', 'flamgas', '#a89a5c'],
    ] as const
  ).map(([id, mat, color]) =>
    proj(id, {
      speed: [0, 0], lifetime: life(300), gravity: 0, radius: 0, stationary: true,
      material: { sea: { mat, width: 32, depth: 6 } },
      visual: { style: 'sea', color, size: 1, ...(mat === 'lava' || mat === 'acid' ? { light: color, lightRadius: 12 } : {}) },
      castSound: 'cast_material',
    }),
  ),

  // ------------------------------------------------------------------ material sprays (Water / Oil / Blood / Acid)
  ...(
    [
      ['spray_water', 'water', '#3a6fc8', { wet: 300 }],
      ['spray_oil', 'oil', '#3a3028', { oily: 720 }],
      ['spray_blood', 'blood', '#8c0c12', {}],
      ['spray_acid', 'acid', '#c6ef2a', {}],
    ] as const
  ).map(([id, mat, color, status]) =>
    proj(id, {
      speed: speed(200, 280), lifetime: life(20, 4), gravity: px(300), radius: 0.5,
      material: { spray: { mat, perFrame: 2 } }, status: { ...status },
      visual: { style: 'material', color, size: 0.35 },
      castSound: 'cast_material', hitSound: 'water_splash',
    }),
  ),
];

export const PROJECTILES: Record<string, ProjectileDef> = Object.fromEntries(LIST.map((p) => [p.id, p]));
