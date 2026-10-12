// Enemy roster (EnemySystem data). Numbers follow the Noita wiki (docs/research-notes.md §3):
// HP and attack damage in displayed units, resistances as damage multipliers, blood material.
import type { ProjectileDef } from '../magic/types';
import type { DamageType, Faction } from './creature';

export type Behaviour = 'melee' | 'ranged' | 'turret' | 'prop' | 'passive';

export interface RangedAttack {
  projectile: string;
  count: number;
  spread: number; // degrees
  cooldown: number; // seconds
  windup: number; // seconds of telegraph before firing
  range: number;
  burst?: number; // shots per volley
  burstGap?: number;
  horizontalOnly?: boolean;
  lob?: boolean; // aim upward to arc thrown objects
  sound: string;
}

export interface EnemyDef {
  id: string;
  name: string; // Finnish
  display: string;
  hp: number;
  faction: Faction;
  hw: number;
  h: number;
  flying: boolean;
  speed: number; // voxels/s
  jump: number;
  sight: number;
  behaviour: Behaviour;
  preferredRange?: number;
  melee?: { damage: [number, number]; range: number; cooldown: number; lunge?: number };
  ranged?: RangedAttack;
  mult?: Partial<Record<DamageType, number>>;
  blood: string;
  explodeOnDeath?: { radius: number; damage: number; fire?: boolean; spill?: { mat: string; amount: number } };
  model: string;
  tint?: string;
  /** Burning creature panics and does not attack (Noita rule) unless fire immune. */
  aura?: 'fire' | 'cold' | 'spark';
  trail?: string; // material left behind while moving
  /** Scatter material when hurt (Liekkiö bleeds gunpowder). */
  goldOverride?: number;
  stepUp?: number;
  reaction?: number; // seconds before reacting to the player (weak variants are slower)
}

const D: EnemyDef[] = [
  { id: 'hamis', name: 'Hämis', display: 'Spidey', hp: 2.75, faction: 'beast', hw: 1.3, h: 2.2, flying: false, speed: 24, jump: 22, sight: 55,
    behaviour: 'melee', melee: { damage: [5, 10], range: 3.5, cooldown: 1.0, lunge: 34 }, mult: { drill: 0.7 }, blood: 'blood', model: 'spider', reaction: 0.3, stepUp: 2 },
  { id: 'hound_weak', name: 'Heikkohurtta', display: 'Weak Hound', hp: 5, faction: 'beast', hw: 1.5, h: 4.4, flying: false, speed: 13, jump: 20, sight: 50,
    behaviour: 'melee', melee: { damage: [5, 10], range: 4, cooldown: 1.4, lunge: 26 }, mult: { drill: 0.7 }, blood: 'blood', model: 'hound', tint: '#7a5a3a', reaction: 1.0, stepUp: 2 },
  { id: 'hound', name: 'Hurtta', display: 'Hound', hp: 12.5, faction: 'beast', hw: 1.6, h: 4.8, flying: false, speed: 17, jump: 22, sight: 60,
    behaviour: 'melee', melee: { damage: [5, 10], range: 4, cooldown: 1.1, lunge: 30 }, mult: { drill: 0.7 }, blood: 'blood', model: 'hound', tint: '#4f6a34', reaction: 0.5, stepUp: 2 },
  { id: 'shotgunner_weak', name: 'Heikko haulikkohiisi', display: 'Weak Shotgun Hiisi', hp: 9, faction: 'hiisi', hw: 1.3, h: 7.6, flying: false, speed: 11, jump: 20, sight: 70,
    behaviour: 'ranged', preferredRange: 24,
    ranged: { projectile: 'enemy_pellet', count: 3, spread: 9, cooldown: 2.0, windup: 0.55, range: 55, sound: 'enemy_shoot' },
    melee: { damage: [10, 17.5], range: 4, cooldown: 1.5 }, blood: 'blood', model: 'hiisi', tint: '#8a6a44', reaction: 0.9, stepUp: 2 },
  { id: 'shotgunner', name: 'Haulikkohiisi', display: 'Shotgun Hiisi', hp: 22.5, faction: 'hiisi', hw: 1.3, h: 7.6, flying: false, speed: 13, jump: 22, sight: 80,
    behaviour: 'ranged', preferredRange: 22,
    ranged: { projectile: 'enemy_pellet', count: 4, spread: 9, cooldown: 1.6, windup: 0.4, range: 60, sound: 'enemy_shoot' },
    melee: { damage: [10, 17.5], range: 4, cooldown: 1.3 }, blood: 'blood', model: 'hiisi', tint: '#5a7a44', reaction: 0.5, stepUp: 2 },
  { id: 'miner_weak', name: 'Tappurahiisiläinen', display: 'Weak Miner Hiisi', hp: 11, faction: 'hiisi', hw: 1.3, h: 7.4, flying: false, speed: 11, jump: 20, sight: 65,
    behaviour: 'ranged', preferredRange: 28,
    ranged: { projectile: 'enemy_tnt', count: 1, spread: 4, cooldown: 3.4, windup: 0.6, range: 50, lob: true, sound: 'potion_throw' },
    melee: { damage: [10, 17.5], range: 4, cooldown: 1.5 }, mult: { explosion: 0.2 }, blood: 'blood', model: 'miner', tint: '#8a6a44', reaction: 0.9, stepUp: 2 },
  { id: 'miner', name: 'Tappurahiisi', display: 'Miner Hiisi', hp: 25, faction: 'hiisi', hw: 1.3, h: 7.6, flying: false, speed: 13, jump: 22, sight: 75,
    behaviour: 'ranged', preferredRange: 28,
    ranged: { projectile: 'enemy_tnt', count: 1, spread: 4, cooldown: 2.8, windup: 0.5, range: 55, lob: true, sound: 'potion_throw' },
    melee: { damage: [10, 17.5], range: 4, cooldown: 1.3 }, mult: { explosion: 0.2 }, blood: 'blood', model: 'miner', tint: '#5a7a44', reaction: 0.5, stepUp: 2 },
  { id: 'slime_weak', name: 'Heikko limanuljaska', display: 'Weak Toxic Slime', hp: 7.5, faction: 'slime', hw: 1.6, h: 3.2, flying: true, speed: 9, jump: 0, sight: 60,
    behaviour: 'ranged', preferredRange: 26,
    ranged: { projectile: 'enemy_slimeball', count: 1, spread: 6, cooldown: 2.6, windup: 0.5, range: 55, sound: 'cast_material' },
    mult: { toxic: 0 }, blood: 'toxic', model: 'slime', tint: '#8edc28', reaction: 0.8 },
  { id: 'slimeshooter', name: 'Limanuljaska', display: 'Toxic Slime', hp: 18.75, faction: 'slime', hw: 1.8, h: 3.6, flying: true, speed: 12, jump: 0, sight: 75,
    behaviour: 'ranged', preferredRange: 30,
    ranged: { projectile: 'enemy_slimeball', count: 1, spread: 5, cooldown: 1.8, windup: 0.4, range: 65, sound: 'cast_material' },
    mult: { toxic: 0 }, blood: 'toxic', model: 'slime', tint: '#6cb814', trail: 'toxic', reaction: 0.5 },
  { id: 'acidslime', name: 'Happonuljaska', display: 'Acid Slime', hp: 25, faction: 'slime', hw: 1.7, h: 3.4, flying: true, speed: 11, jump: 0, sight: 70,
    behaviour: 'ranged', preferredRange: 28,
    ranged: { projectile: 'enemy_acidbubble', count: 1, spread: 5, cooldown: 2.2, windup: 0.45, range: 60, sound: 'cast_material' },
    melee: { damage: [5, 10], range: 3.5, cooldown: 1.2 }, mult: { toxic: 0, drill: 0.5 }, blood: 'acid', model: 'slime', tint: '#c6ef2a', reaction: 0.6 },
  { id: 'motherslime', name: 'Äitinuljaska', display: 'Mother Slime', hp: 50, faction: 'slime', hw: 2.4, h: 4.6, flying: true, speed: 7, jump: 0, sight: 60,
    behaviour: 'melee', melee: { damage: [5, 10], range: 4, cooldown: 1.4, lunge: 14 }, mult: { toxic: 0 }, blood: 'acid', model: 'slime', tint: '#b8e030',
    explodeOnDeath: { radius: 6, damage: 75, spill: { mat: 'acid', amount: 140 } }, reaction: 0.8 },
  { id: 'stendari', name: 'Stendari', display: 'Fire Mage', hp: 80, faction: 'mage', hw: 1.4, h: 8.4, flying: false, speed: 13, jump: 34, sight: 85,
    behaviour: 'ranged', preferredRange: 34,
    ranged: { projectile: 'enemy_fireball', count: 1, spread: 3, cooldown: 2.4, windup: 0.7, range: 75, sound: 'cast_fire' },
    melee: { damage: [10, 17.5], range: 4, cooldown: 1.3 }, mult: { fire: 0, explosion: 0.4 }, blood: 'lava', model: 'mage', tint: '#c84a1a', aura: 'fire', reaction: 0.5, stepUp: 2 },
  { id: 'liekkio', name: 'Liekkiö', display: 'Fire Spirit', hp: 35, faction: 'mage', hw: 1.4, h: 2.8, flying: true, speed: 18, jump: 0, sight: 65,
    behaviour: 'melee', melee: { damage: [5, 10], range: 3.5, cooldown: 1.0, lunge: 32 }, mult: { fire: 0 }, blood: 'gunpowder', model: 'skull', tint: '#ff8a28', aura: 'fire', reaction: 0.4 },
  { id: 'bat', name: 'Lepakko', display: 'Bat', hp: 12.5, faction: 'beast', hw: 1.2, h: 1.8, flying: true, speed: 21, jump: 0, sight: 55,
    behaviour: 'melee', melee: { damage: [6.25, 6.25], range: 3, cooldown: 1.0, lunge: 30 }, blood: 'slime', model: 'bat', tint: '#4a3a4a', reaction: 0.3 },
  { id: 'firefly', name: 'Pikkutulikärpänen', display: 'Lesser Firefly', hp: 5, faction: 'beast', hw: 0.9, h: 1.3, flying: true, speed: 19, jump: 0, sight: 55,
    behaviour: 'ranged', preferredRange: 14,
    ranged: { projectile: 'enemy_fire_spit', count: 1, spread: 8, cooldown: 1.6, windup: 0.3, range: 35, sound: 'cast_fire' },
    mult: { fire: 0 }, blood: 'lava', model: 'firefly', tint: '#ffb43a', reaction: 0.3 },
  { id: 'grenadier', name: 'Kranuhiisi', display: 'Hiisi Grenadier', hp: 25, faction: 'hiisi', hw: 1.3, h: 7.4, flying: true, speed: 12, jump: 0, sight: 80,
    behaviour: 'ranged', preferredRange: 32,
    ranged: { projectile: 'enemy_grenade', count: 1, spread: 5, cooldown: 2.6, windup: 0.5, range: 70, sound: 'cast_bomb' },
    blood: 'blood', model: 'jetpack', tint: '#6a5a8a', reaction: 0.5 },
  { id: 'gunner', name: 'Rynkkyhiisi', display: 'Hiisi Gunner', hp: 25, faction: 'hiisi', hw: 1.3, h: 7.4, flying: true, speed: 13, jump: 0, sight: 95,
    behaviour: 'ranged', preferredRange: 40,
    ranged: { projectile: 'enemy_rifle', count: 1, spread: 4, cooldown: 2.2, windup: 0.5, range: 90, burst: 5, burstGap: 0.08, sound: 'enemy_shoot' },
    blood: 'blood', model: 'jetpack', tint: '#4a6a7a', reaction: 0.5 },
  { id: 'sniper', name: 'Snipuhiisi', display: 'Hiisi Sniper', hp: 45, faction: 'hiisi', hw: 1.3, h: 7.6, flying: false, speed: 10, jump: 20, sight: 140,
    behaviour: 'ranged', preferredRange: 70,
    ranged: { projectile: 'enemy_sniper', count: 1, spread: 0.5, cooldown: 3.5, windup: 1.3, range: 140, sound: 'enemy_shoot' },
    melee: { damage: [10, 17.5], range: 4, cooldown: 1.4 }, blood: 'blood', model: 'hiisi', tint: '#7a7a7a', reaction: 0.5, stepUp: 2 },
  { id: 'iceskull', name: 'Jäätiö', display: 'Ice Spirit', hp: 37.5, faction: 'mage', hw: 1.4, h: 2.8, flying: true, speed: 15, jump: 0, sight: 75,
    behaviour: 'ranged', preferredRange: 26,
    ranged: { projectile: 'enemy_iceball', count: 1, spread: 4, cooldown: 2.4, windup: 0.5, range: 65, sound: 'cast_ice' },
    mult: { ice: 0 }, blood: 'water', model: 'skull', tint: '#9ad8ff', aura: 'cold', reaction: 0.5 },
  { id: 'icemage', name: 'Pakkasukko', display: 'Old Man Winter', hp: 125, faction: 'mage', hw: 1.5, h: 9, flying: false, speed: 10, jump: 26, sight: 85,
    behaviour: 'ranged', preferredRange: 32,
    ranged: { projectile: 'enemy_iceball_big', count: 1, spread: 3, cooldown: 2.6, windup: 0.8, range: 75, sound: 'cast_ice' },
    melee: { damage: [10, 17.5], range: 4, cooldown: 1.4 }, mult: { ice: -1, fire: 1.5, explosion: 0.3 }, blood: 'snow', model: 'mage', tint: '#b8d8f0', aura: 'cold', reaction: 0.6, stepUp: 2 },
  { id: 'ukko', name: 'Ukko', display: 'Thunder Mage', hp: 125, faction: 'mage', hw: 1.5, h: 9, flying: true, speed: 9, jump: 0, sight: 90,
    behaviour: 'ranged', preferredRange: 36,
    ranged: { projectile: 'enemy_thunder', count: 1, spread: 2, cooldown: 3.2, windup: 1.1, range: 80, sound: 'cast_electric' },
    mult: { fire: 0, electric: -1, explosion: 0.5 }, blood: 'water', model: 'mage', tint: '#5a6ad8', aura: 'spark', reaction: 0.6 },
  { id: 'tank', name: 'KK-Tankki', display: 'Tank', hp: 112.5, faction: 'robot', hw: 2.6, h: 4.2, flying: false, speed: 7, jump: 0, sight: 90,
    behaviour: 'ranged', preferredRange: 40,
    ranged: { projectile: 'enemy_rifle', count: 1, spread: 5, cooldown: 2.4, windup: 0.6, range: 85, burst: 8, burstGap: 0.07, sound: 'enemy_shoot' },
    mult: { fire: 0, ice: 0, slice: 0.1, projectile: 0.5, electric: 2 }, blood: 'oil', model: 'tank',
    explodeOnDeath: { radius: 10, damage: 75, fire: true }, reaction: 0.8, stepUp: 2 },
  { id: 'turret', name: 'Torjuntalaite', display: 'Turret', hp: 75, faction: 'robot', hw: 1.6, h: 3, flying: false, speed: 0, jump: 0, sight: 90,
    behaviour: 'turret',
    ranged: { projectile: 'enemy_laser', count: 2, spread: 2, cooldown: 2.0, windup: 0.6, range: 90, horizontalOnly: true, sound: 'cast_spark' },
    mult: { fire: 0, ice: 0 }, blood: 'oil', model: 'turret', explodeOnDeath: { radius: 8, damage: 50, fire: true }, reaction: 0.4 },
  { id: 'stevari', name: 'Stevari', display: 'Holy Mountain Guardian', hp: 600, faction: 'guardian', hw: 1.6, h: 9.5, flying: true, speed: 16, jump: 0, sight: 140,
    behaviour: 'ranged', preferredRange: 20,
    ranged: { projectile: 'enemy_holy_orb', count: 2, spread: 10, cooldown: 1.2, windup: 0.35, range: 120, sound: 'cast_electric' },
    melee: { damage: [20, 20], range: 4, cooldown: 0.8 }, mult: { fire: 0, explosion: 0.2, electric: 0.5 }, blood: 'ash', model: 'mage', tint: '#e8e0c0', reaction: 0.1 },
  { id: 'barrel_oil', name: 'Öljytynnyri', display: 'Oil barrel', hp: 8, faction: 'neutral', hw: 1.2, h: 3, flying: false, speed: 0, jump: 0, sight: 0,
    behaviour: 'prop', blood: 'oil', model: 'barrel', tint: '#6a3a22', explodeOnDeath: { radius: 5, damage: 20, fire: true, spill: { mat: 'oil', amount: 160 } } },
  { id: 'barrel_propane', name: 'Propaanitankki', display: 'Propane tank', hp: 12, faction: 'neutral', hw: 1.2, h: 3.4, flying: false, speed: 0, jump: 0, sight: 0,
    behaviour: 'prop', blood: 'smoke', model: 'barrel', tint: '#7a4ab0', explodeOnDeath: { radius: 13, damage: 60, fire: true } },
  { id: 'sheep', name: 'Lammas', display: 'Sheep', hp: 5, faction: 'neutral', hw: 1.5, h: 3.2, flying: false, speed: 7, jump: 14, sight: 0,
    behaviour: 'passive', blood: 'blood', model: 'sheep', stepUp: 2 },
];

export const ENEMIES: Record<string, EnemyDef> = Object.fromEntries(D.map((d) => [d.id, d]));

// ------------------------------------------------------------------ enemy projectiles (same runtime as spells)
const p = (id: string, d: Omit<ProjectileDef, 'id'>): ProjectileDef => ({ id, ...d });

export const ENEMY_PROJECTILES: Record<string, ProjectileDef> = {
  enemy_pellet: p('enemy_pellet', {
    speed: [210, 250], lifetime: [40, 50], gravity: 60, radius: 0.5, damage: { projectile: 6.75 }, bounces: 0, bounceEnergy: 0,
    visual: { style: 'spark', color: '#ffe0a0', size: 0.35, trail: '#b08040', light: '#ffc070', lightRadius: 4 }, castSound: 'enemy_shoot', hitSound: 'impact_small',
  }),
  enemy_tnt: p('enemy_tnt', {
    speed: [55, 70], lifetime: [100, 120], gravity: 300, radius: 0.8, damage: {}, bounces: 2, bounceEnergy: 0.3,
    explosion: { radius: 9, durability: 11, rayEnergy: 2200, fire: true }, explodeOn: 'death',
    visual: { style: 'dynamite', color: '#c8281a', size: 0.7, light: '#ff8040', lightRadius: 5 }, castSound: 'cast_bomb', spin: true,
  }),
  enemy_slimeball: p('enemy_slimeball', {
    speed: [80, 100], lifetime: [120, 140], gravity: 120, radius: 0.8, damage: { projectile: 6.25 }, bounces: 0, bounceEnergy: 0,
    explosion: { radius: 2, durability: 6, rayEnergy: 40 }, material: { onHit: { mat: 'toxic', amount: 22 } },
    visual: { style: 'bubble', color: '#8edc28', size: 0.8, trail: '#6cb814', light: '#88e020', lightRadius: 6 }, castSound: 'cast_material', hitSound: 'water_splash',
  }),
  enemy_acidbubble: p('enemy_acidbubble', {
    speed: [70, 90], lifetime: [140, 160], gravity: 60, radius: 0.9, damage: { projectile: 6 }, bounces: 0, bounceEnergy: 0,
    material: { onHit: { mat: 'acid', amount: 18 }, onDeath: { mat: 'acid', amount: 18 } },
    visual: { style: 'bubble', color: '#d8fa50', size: 0.9, light: '#d0ff40', lightRadius: 6 }, castSound: 'cast_material', hitSound: 'acid_sizzle',
  }),
  enemy_fireball: p('enemy_fireball', {
    speed: [85, 95], lifetime: [90, 110], gravity: 50, radius: 1.0, damage: { fire: 6.25 }, bounces: 0, bounceEnergy: 0,
    explosion: { radius: 6, durability: 10, rayEnergy: 900, fire: true }, explodeOn: 'both', status: { onFire: 4 },
    visual: { style: 'fire', color: '#ff8a20', size: 1.1, trail: '#ff5010', light: '#ff7020', lightRadius: 16 }, castSound: 'cast_fire', hitSound: 'explosion_small',
  }),
  enemy_fire_spit: p('enemy_fire_spit', {
    speed: [90, 110], lifetime: [40, 50], gravity: 80, radius: 0.5, damage: { fire: 3 }, bounces: 0, bounceEnergy: 0,
    status: { onFire: 3 }, material: { trail: { mat: 'fire', chance: 0.3 } },
    visual: { style: 'fire', color: '#ffc040', size: 0.5, light: '#ff9030', lightRadius: 6 }, castSound: 'cast_fire',
  }),
  enemy_grenade: p('enemy_grenade', {
    speed: [120, 140], lifetime: [150, 170], gravity: 300, radius: 0.8, damage: { projectile: 32.5 }, bounces: 3, bounceEnergy: 0.5,
    explosion: { radius: 4.5, durability: 10, rayEnergy: 700, fire: true }, explodeOn: 'death',
    visual: { style: 'bomb', color: '#3a4030', size: 0.7, light: '#ff6020', lightRadius: 4 }, castSound: 'cast_bomb',
  }),
  enemy_rifle: p('enemy_rifle', {
    speed: [300, 330], lifetime: [50, 60], gravity: 20, radius: 0.4, damage: { projectile: 3.75, explosion: 10 }, bounces: 0, bounceEnergy: 0,
    explosion: { radius: 1.2, durability: 6, rayEnergy: 25 },
    visual: { style: 'spark', color: '#fff0b0', size: 0.3, trail: '#c0a060' }, castSound: 'enemy_shoot', hitSound: 'impact_small',
  }),
  enemy_sniper: p('enemy_sniper', {
    speed: [480, 500], lifetime: [60, 70], gravity: 0, radius: 0.4, damage: { projectile: 25, explosion: 10 }, bounces: 0, bounceEnergy: 0,
    explosion: { radius: 1.5, durability: 8, rayEnergy: 40 },
    visual: { style: 'spark', color: '#ffffff', size: 0.35, trail: '#ff4040', light: '#ff6060', lightRadius: 5 }, castSound: 'enemy_shoot', hitSound: 'impact_small',
  }),
  enemy_iceball: p('enemy_iceball', {
    speed: [100, 120], lifetime: [90, 110], gravity: 40, radius: 0.8, damage: { ice: 7.5 }, bounces: 0, bounceEnergy: 0,
    explosion: { radius: 3, durability: 8, rayEnergy: 200 }, status: { frozen: 50 }, special: 'freeze_area',
    visual: { style: 'ice', color: '#c8f0ff', size: 0.9, trail: '#80c8ff', light: '#9ad8ff', lightRadius: 8 }, castSound: 'cast_ice', hitSound: 'freeze',
  }),
  enemy_iceball_big: p('enemy_iceball_big', {
    speed: [90, 110], lifetime: [100, 120], gravity: 40, radius: 1.1, damage: { ice: 8.75, explosion: 50 }, bounces: 0, bounceEnergy: 0,
    explosion: { radius: 6, durability: 10, rayEnergy: 800 }, status: { frozen: 70 }, special: 'freeze_area', material: { onHit: { mat: 'snow', amount: 40 } },
    visual: { style: 'ice', color: '#e0f8ff', size: 1.3, trail: '#80c8ff', light: '#9ad8ff', lightRadius: 12 }, castSound: 'cast_ice', hitSound: 'freeze',
  }),
  enemy_thunder: p('enemy_thunder', {
    speed: [2700, 2700], lifetime: [2, 2], gravity: 0, radius: 0.8, damage: { electric: 37.5, explosion: 45 }, bounces: 0, bounceEnergy: 0,
    explosion: { radius: 7, durability: 10, rayEnergy: 1200 }, special: 'lightning',
    visual: { style: 'lightning', color: '#c8d8ff', size: 0.6, light: '#a0b8ff', lightRadius: 30 }, castSound: 'cast_electric', hitSound: 'electric_zap',
  }),
  enemy_laser: p('enemy_laser', {
    speed: [400, 420], lifetime: [40, 50], gravity: 0, radius: 0.5, damage: { projectile: 25, explosion: 6.25 }, bounces: 0, bounceEnergy: 0,
    explosion: { radius: 1.5, durability: 8, rayEnergy: 40 },
    visual: { style: 'beam', color: '#ff4040', size: 0.5, trail: '#ff2020', light: '#ff3030', lightRadius: 8 }, castSound: 'cast_spark',
  }),
  enemy_holy_orb: p('enemy_holy_orb', {
    speed: [60, 80], lifetime: [180, 200], gravity: 0, radius: 1.0, damage: { projectile: 20, explosion: 25 }, bounces: 0, bounceEnergy: 0,
    explosion: { radius: 4, durability: 10, rayEnergy: 500 }, homingBase: 0.8,
    visual: { style: 'orb', color: '#fff4c0', size: 1.1, trail: '#ffe080', light: '#fff0b0', lightRadius: 14 }, castSound: 'cast_electric',
  }),
};
