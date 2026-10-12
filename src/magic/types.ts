// Shared contract between the SpellCastingEngine (data + deck logic) and the ProjectileSystem (runtime).
//
// UNIT CONVENTIONS (3D adaptation of Noita's 2D pixel units):
//   * distances/radii: voxels.   Noita px -> voxels: multiply by 0.5
//   * speeds: voxels/second.     Noita px/s -> voxels/s: multiply by 0.5
//   * gravity: voxels/second^2.  Noita px/s^2 -> voxels/s^2: multiply by 0.5
//   * times: FRAMES at 60 fps (cast delay, recharge, lifetimes, timers) exactly like Noita
//   * damage/healing: displayed HP (player has 100 HP), exactly like the in-game numbers
//   * spread/angles: degrees

export type SpellType = 'projectile' | 'static' | 'modifier' | 'multicast' | 'material' | 'utility' | 'passive' | 'other';

/** Effect tags a modifier can attach to every projectile of a shot (interpreted by the ProjectileSystem). */
export type EffectTag =
  | 'homing'
  | 'piercing'
  | 'explosive' // also see ShotState.explosionRadius / damageExplosion
  | 'fire_trail'
  | 'burn' // projectile sets things on fire on hit
  | 'electric_charge'
  | 'freeze_charge'
  | 'light'
  | 'bounce_explode' // impact-exploding projectiles bounce instead (Bounce modifier)
  | 'gravity'
  | 'anti_gravity'
  | 'chaotic'
  | 'orbit';

/** gun.lua's per-shot state "c". All modifiers are additive on top of the defaults from defaultShotState(). */
export interface ShotState {
  fireRateWait: number; // frames, cast delay contribution of this shot (root only counts)
  spread: number; // degrees, added to wand spread
  speedMult: number; // multiplier on projectile speed
  damageProjectile: number; // added displayed damage
  damageExplosion: number;
  damageFire: number;
  damageElectric: number;
  damageIce: number;
  damageSlice: number;
  damageHealing: number;
  critChance: number; // percent added
  explosionRadius: number; // voxels added
  lifetimeAdd: number; // frames added
  bounces: number; // bounces added
  gravityAdd: number; // voxels/s^2 added
  knockback: number;
  recoil: number;
  /** Formation arc in degrees; projectiles are spread evenly across it (0 = none). */
  patternDegrees: number;
  extra: EffectTag[];
  trailMaterial: string | null; // material name from world/materials.ts
  trailChance: number; // probability per frame to drop one voxel of trail material
  friendlyFire: boolean;
  homing: number; // homing strength (0 = none)
  piercing: boolean;
  lightRadiusAdd: number;
  speedMultCap?: number;
}

export interface ProjectileSpawn {
  projectile: string; // ProjectileDef id
  trigger?: {
    kind: 'hit' | 'timer' | 'death';
    timerFrames?: number;
    payload: Shot;
  };
}

export interface Shot {
  state: ShotState;
  projectiles: ProjectileSpawn[];
}

export interface CastResult {
  /** True if a cast happened (wand was ready). */
  fired: boolean;
  root: Shot;
  /** Total cast delay applied after this cast, in frames (root state only; payloads ignored). */
  castDelayFrames: number;
  /** If the wand started reloading, the recharge time in frames, else 0. */
  reloadFrames: number;
  reloaded: boolean;
  manaSpent: number;
  /** Spell ids skipped because the wand lacked mana (UI plays a "not enough mana" sound). */
  skippedForMana: string[];
  /** Spell ids actually played this cast, in draw order (for UI highlighting / tests). */
  drawn: string[];
  /** True if at least one projectile was produced (anywhere in the tree). */
  producedProjectile: boolean;
}

export interface DamageSpec {
  projectile?: number;
  explosion?: number;
  fire?: number;
  electric?: number;
  ice?: number;
  slice?: number;
  drill?: number;
  healing?: number;
}

export type ProjectileStyle =
  | 'spark' | 'orb' | 'bolt' | 'bomb' | 'missile' | 'saw' | 'beam' | 'arrow' | 'bubble' | 'cross' | 'fire'
  | 'ice' | 'acid' | 'dynamite' | 'blackhole' | 'lightning' | 'heal' | 'teleport' | 'circle' | 'sea' | 'material' | 'none';

export interface ProjectileDef {
  id: string;
  /** voxels/s; random in [min, max] */
  speed: [number, number];
  /** frames; random in [min, max]. -1 = until it hits something */
  lifetime: [number, number];
  /** voxels/s^2 (positive pulls down) */
  gravity: number;
  /** collision radius in voxels against creatures */
  radius: number;
  damage: DamageSpec;
  /** Explosion on impact/expiry */
  explosion?: {
    radius: number; // voxels
    durability: number; // max material durability destroyed (Noita max_durability_to_destroy)
    rayEnergy: number; // energy each blast ray spends on voxel hardness (materials.ts hardness)
    fire?: boolean; // incendiary blast
    powderEdge?: boolean; // erode surviving terrain at the edge into powder (Bomb)
    damageSelf?: boolean; // default true: explosions always hurt the caster too
  };
  explodeOn?: 'hit' | 'death' | 'both';
  bounces: number;
  bounceEnergy: number; // 0..1 speed kept per bounce
  /** Terrain carving done every frame at the projectile position (Chainsaw, Digging Bolt, Luminous Drill). */
  dig?: { radius: number; durability: number };
  /** Projectile keeps going through terrain (it digs or ignores it). */
  passTerrain?: boolean;
  /** Pierces creatures (keeps flying after hitting one). */
  passCreatures?: boolean;
  /** Projectile does not move (spawned at the wand tip). */
  stationary?: boolean;
  material?: {
    onHit?: { mat: string; amount: number }; // voxels released at the impact point
    onDeath?: { mat: string; amount: number };
    trail?: { mat: string; chance: number };
    circle?: { mat: string; radius: number }; // expanding ring that creates the material in open air
    sea?: { mat: string; width: number; depth: number }; // fills a large box of open air below the caster
    spray?: { mat: string; perFrame: number }; // material spray projectiles (Water/Oil/Blood spells)
  };
  /** Special behaviour handled by the ProjectileSystem. */
  special?: 'teleport_caster' | 'black_hole' | 'heal_target' | 'lightning' | 'death_cross' | 'freeze_area' | 'none';
  status?: { onFire?: number; frozen?: number; oily?: number; wet?: number; stunned?: number };
  /** Short visual description for the renderer. */
  visual: { style: ProjectileStyle; color: string; size: number; trail?: string; light?: string; lightRadius?: number };
  /** Audio cue played when cast (see src/audio sound names). */
  castSound: string;
  hitSound?: string;
  /** Frames during which the projectile cannot hit its own caster (Noita grants a short grace). */
  ownerGraceFrames?: number;
  /** Ignores the speed cap (Lightning). */
  homingBase?: number;
  spin?: boolean;
}

export interface SpellDef {
  id: string; // Noita internal id, e.g. LIGHT_BULLET
  name: string; // display name, e.g. "Spark bolt"
  description: string;
  type: SpellType;
  mana: number; // mana drain (negative = gives mana)
  maxUses: number; // -1 = unlimited
  /** Spawn tiers 0..6 with weights (Noita spawn_level / spawn_probability). */
  spawnTiers: number[];
  spawnWeights: number[];
  price: number; // Holy Mountain shop base price in gold
  /** Related projectile (for UI stats); optional for modifiers. */
  projectile?: string;
  /** Short stats for the tooltip, e.g. { 'Cast delay': '+0.05 s', Damage: '3' } */
  stats: Record<string, string>;
  /** The gun.lua action. Implemented against the ActionContext of the casting engine. */
  action: (ctx: ActionContext) => void;
}

/** What a spell's action can do (mirrors gun.lua globals). */
export interface ActionContext {
  c: ShotState; // current shot state
  addProjectile(id: string): void;
  addTrigger(id: string, kind: 'hit' | 'timer' | 'death', drawCount: number, timerFrames?: number): void;
  drawActions(n: number, wrap: boolean): void;
  /** Global recharge time adjustment in frames (current_reload_time += delta). */
  addReload(deltaFrames: number): void;
  /** Mana refund (Add Mana). */
  addMana(amount: number): void;
  /** Random helper (deterministic per wand cast). */
  random(): number;
  /** True while evaluating an Always Cast (permanent) card. */
  permanent: boolean;
}

export interface WandStats {
  name: string;
  shuffle: boolean;
  actionsPerRound: number; // "Spells/Cast"
  castDelay: number; // frames
  rechargeTime: number; // frames
  manaMax: number;
  manaChargeSpeed: number; // per second
  capacity: number;
  spread: number; // degrees
  speedMult: number; // hidden projectile speed multiplier
  /** Seed for the procedural sprite. */
  spriteSeed: number;
}

export interface SpellInstance {
  id: string;
  uses: number; // remaining uses, -1 unlimited
}
