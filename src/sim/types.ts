import type { AspectId } from '../core/ids';
import type { Vec2 } from '../core/math';
import type { SfxId } from '../audio/types';

/** Fighter index within the simulation (0 or 1). Sides are randomised independently. */
export type Side = 0 | 1;
export type Facing = 1 | -1;

export const TICK_RATE = 60;
export const DT = 1 / TICK_RATE;

export type WeaponId = 'katana' | 'greatsword' | 'spear' | 'daggers' | 'scythe' | 'gauntlets' | 'staff';
export type PersonalityId = 'berserker' | 'duelist' | 'trickster' | 'tactician' | 'sentinel' | 'zealot';
export type AbilitySlot = 'mobility' | 'ranged' | 'special' | 'defense' | 'ultimate';
export type AccessoryId = 'scarf' | 'ponytail' | 'headband' | 'cape' | 'horns' | 'halo' | 'longhair';

export type AbilityId =
  // mobility
  | 'phantomStep' | 'flashCut' | 'voidGate' | 'galeAscent' | 'mirage'
  // ranged
  | 'barrage' | 'crescentWave' | 'seekerOrbs' | 'starfall' | 'thunderJudgment' | 'spikeEruption' | 'gravityOrb'
  // special
  | 'annihilationBeam' | 'bindingChains' | 'dimensionRend' | 'titanSlam' | 'bladeStorm' | 'chronoStop'
  // defense
  | 'aegis' | 'mirrorWard' | 'counterStance' | 'phaseShift' | 'chronoRewind' | 'secondWind'
  // ultimate
  | 'ascension' | 'thousandCuts' | 'supernova' | 'heavensLance' | 'blackHole' | 'colossus' | 'cataclysm';

export interface Traits {
  /** Preference for initiating offence. */
  aggression: number;
  /** Willingness to wait, bait and set traps. */
  patience: number;
  /** Tolerance for unsafe, high-reward options. */
  risk: number;
  /** Feints, teleports, mix-ups, deception. */
  trickery: number;
  /** Preference for ranged play. */
  zoning: number;
  /** Preference for parries, blocks and counters. */
  defense: number;
  /** How quickly the fighter learns the opponent's habits. */
  adaptivity: number;
  /** Reaction delay in ticks. */
  reaction: number;
  /** Timing accuracy (parries, dodges, combo execution) 0..1. */
  precision: number;
  /** Decision randomness (softmax temperature). */
  temperature: number;
}

export interface FighterDef {
  name: string;
  title: string;
  aspect: AspectId;
  weapon: WeaponId;
  personality: PersonalityId;
  abilities: Record<AbilitySlot, AbilityId>;
  accessory: AccessoryId;
  traits: Traits;
  /** Visual-only variety: stance flavour, idle bob speed etc. */
  styleSeed: number;
}

export type AttackHeight = 'mid' | 'low' | 'overhead' | 'throw' | 'unblockable';

export interface HitDef {
  damage: number;
  /** Guard (posture) damage when blocked. */
  guard: number;
  hitstun: number;
  blockstun: number;
  /** Knockback velocity, x relative to attacker facing (positive = away from attacker). */
  kbx: number;
  kby: number;
  launch?: boolean;
  knockdown?: boolean;
  groundBounce?: boolean;
  wallBounce?: boolean;
  /** 1 light .. 4 massive — drives presentation (hitstop, shake, sfx). */
  level: 1 | 2 | 3 | 4;
  unblockable?: boolean;
  /** Ignores armor. */
  crush?: boolean;
  /** Extra tag for flavour (e.g. 'fire', 'cut'). */
  tag?: string;
}

/** Capsule hitbox relative to the attacker's feet; x is forward (multiplied by facing). */
export interface RelCapsule {
  ax: number;
  ay: number;
  bx: number;
  by: number;
  r: number;
}

export type ActionKind =
  | 'light' | 'heavy' | 'launcher' | 'sweep' | 'thrust' | 'dashAttack'
  | 'air' | 'airSlam' | 'throw'
  | 'ability' | 'universal';

export interface ActionDef {
  id: string;
  name: string;
  kind: ActionKind;
  startup: number;
  active: number;
  recovery: number;
  height: AttackHeight;
  /** Animation clip id (presentation). */
  clip: string;
  hit?: HitDef;
  hitbox?: RelCapsule;
  /** Number of separate hits during active frames (spread evenly). */
  hits?: number;
  /** Forward velocity applied when the action starts (startup) / becomes active. */
  lungeStartup?: number;
  lungeActive?: number;
  /** Vertical velocity applied when active (negative = up). */
  riseActive?: number;
  airOK?: boolean;
  groundOK?: boolean;
  /** Actions this may cancel into once it has hit (or been blocked, if cancelOnBlock). */
  cancels?: string[];
  cancelOnBlock?: boolean;
  /** Can be cancelled into a jump on hit. */
  jumpCancel?: boolean;
  /** Super armor frames from the start (absorbs hits of level < 4 without flinching). */
  armor?: number;
  feintable?: boolean;
  /** Max extra startup frames when held (charged attacks deal more damage). */
  chargeable?: number;
  /** Intangible frame window [from, to] (inclusive, action frames). */
  iframes?: [number, number];
  /** Horizontal reach the AI uses for spacing: [min, max] distance between fighters. */
  range: [number, number];
  /** Vertical band (relative target y - self y) the move covers, for the AI. */
  yRange?: [number, number];
  energyCost?: number;
  wrathCost?: number;
  cooldown?: number;
  sfx?: SfxId;
  whiffSfx?: SfxId;
  /** Lands with a slam (crater etc.) when it ends airborne→ground. */
  slam?: boolean;
  /** Ability slot when this is an ability. */
  slot?: AbilitySlot;
  abilityId?: AbilityId;
  description?: string;
}

/** High-level state of a fighter. */
export type FState =
  | 'intro' | 'idle' | 'walk' | 'run' | 'dash' | 'backdash' | 'crouch'
  | 'jumpsquat' | 'air' | 'airdash' | 'land'
  | 'action' | 'block' | 'parry' | 'dodge' | 'vanish' | 'appear'
  | 'hitstun' | 'launched' | 'knockdown' | 'getup' | 'wallsplat' | 'tech'
  | 'guardbreak' | 'parried' | 'stagger' | 'charge' | 'burst'
  | 'locked' | 'bound' | 'dead' | 'victory';

export interface ActiveAction {
  def: ActionDef;
  frame: number;
  /** Extra startup frames from charging / delaying. */
  hold: number;
  /** Frame at which the action is feinted (cancelled) if set. */
  feintAt: number;
  /** Ids of hits already delivered (for multi-hit spacing). */
  hitCount: number;
  hasHit: boolean;
  wasBlocked: boolean;
  whiffed: boolean;
  /** Free-form per-action data (ability behaviours). */
  data: Record<string, number>;
  /** Optional aim point. */
  aim: Vec2 | null;
  /** Unique instance id (for hit de-dup). */
  uid: number;
}

export type BuffId =
  | 'ascended' | 'burn' | 'chill' | 'shield' | 'reflect' | 'counter' | 'phase'
  | 'regen' | 'blind' | 'haste' | 'invisible' | 'lastStand' | 'stunned' | 'empowered';

export interface Buff {
  id: BuffId;
  /** Remaining ticks. */
  t: number;
  /** Stack count or magnitude. */
  v: number;
  src: Side;
}

/** Projectile visual style; the renderer chooses the look from this + aspect. */
export type ProjectileStyle =
  | 'bolt' | 'orb' | 'crescent' | 'seeker' | 'meteor' | 'spike' | 'blade' | 'gravity' | 'shockwave' | 'reflected' | 'kiblast' | 'spear';

export interface Projectile {
  id: number;
  owner: Side;
  style: ProjectileStyle;
  aspect: AspectId;
  x: number;
  y: number;
  vx: number;
  vy: number;
  r: number;
  hit: HitDef;
  /** Remaining ticks. */
  life: number;
  age: number;
  homing: number;
  gravity: number;
  /** Interaction strength vs other projectiles. */
  power: number;
  reflectable: boolean;
  /** Can be cut by melee attacks. */
  slashable: boolean;
  /** Travels along the ground (shockwaves / spikes / crescent waves). */
  grounded: boolean;
  /** Pulls the opposing fighter (gravity orb). */
  pull: number;
  /** Explosion radius on impact (0 = none). */
  explode: number;
  dead: boolean;
  /** Ability that spawned it (for stats / narration). */
  source: string;
  /** Frozen by time stop. */
  frozen: boolean;
  /** Visual rotation / spin (presentation helper). */
  rot: number;
  /** Orbiting projectiles (blade storm): radius, angle, angular speed, release tick (-1 = released). */
  orbitR: number;
  orbitAng: number;
  orbitSpeed: number;
  releaseTick: number;
  /** Ticks remaining during which it cannot hit (spawn grace for orbiters). */
  armedIn: number;
}

export interface Beam {
  id: number;
  owner: Side;
  aspect: AspectId;
  /** Origin follows the owner's hands. */
  ox: number;
  oy: number;
  dirX: number;
  dirY: number;
  length: number;
  maxLength: number;
  width: number;
  /** Damage per tick. */
  dps: number;
  life: number;
  age: number;
  /** Tick at which the beam started firing (after charge). */
  firing: boolean;
  dead: boolean;
  /** Locked in a struggle with another beam. */
  struggling: boolean;
  source: string;
}

export type ZoneKind =
  | 'lightning' | 'meteor' | 'rend' | 'chains' | 'spike' | 'lance' | 'blackhole' | 'supernova'
  | 'hazard_lightning' | 'hazard_lava' | 'hazard_icicles' | 'hazard_voidrift' | 'hazard_starfall'
  | 'cataclysm' | 'colossus';

/** A telegraphed area effect: warns for `warn` ticks, then strikes for `active` ticks. */
export interface Zone {
  id: number;
  kind: ZoneKind;
  /** null for environmental hazards (hit everyone). */
  owner: Side | null;
  aspect: AspectId | null;
  x: number;
  y: number;
  r: number;
  warn: number;
  active: number;
  age: number;
  hit: HitDef;
  /** Track target until this age. */
  trackUntil: number;
  trackSpeed: number;
  /** Multi-hit interval during active (0 = single hit). */
  interval: number;
  hitSides: number;
  dead: boolean;
  source: string;
  /** Pull strength during warn/active (black hole). */
  pull: number;
  /** Horizontal sweep velocity (colossus). */
  vx: number;
  /** Column-shaped zones (lightning, chains, lance) hit from the ground up to maxHeight. */
  fullHeight: boolean;
  maxHeight: number;
  /** Hits delivered so far (multi-hit zones). */
  hitCount: number;
}

/** Summary stats tracked per fighter (shown on the results screen). */
export interface FighterStats {
  damageDealt: number;
  damageTaken: number;
  hitsLanded: number;
  attacksAttempted: number;
  blocks: number;
  parries: number;
  perfectParries: number;
  dodges: number;
  teleports: number;
  abilitiesUsed: number;
  ultimatesUsed: number;
  longestCombo: number;
  biggestCombo: number;
  clashesWon: number;
  guardBreaks: number;
  counterHits: number;
  reads: number;
  feints: number;
  whiffPunishes: number;
  lowestHp: number;
  minWinProb: number;
  projectilesFired: number;
  healing: number;
}

export function emptyStats(): FighterStats {
  return {
    damageDealt: 0, damageTaken: 0, hitsLanded: 0, attacksAttempted: 0, blocks: 0, parries: 0, perfectParries: 0,
    dodges: 0, teleports: 0, abilitiesUsed: 0, ultimatesUsed: 0, longestCombo: 0, biggestCombo: 0, clashesWon: 0,
    guardBreaks: 0, counterHits: 0, reads: 0, feints: 0, whiffPunishes: 0, lowestHp: 1000, minWinProb: 0.5,
    projectilesFired: 0, healing: 0,
  };
}

/** AI → fighter command for one tick. Computed for both fighters from the same snapshot. */
export interface Command {
  /** Desired horizontal movement (world space) -1..1. */
  moveX: number;
  /** Desired vertical movement for flight -1..1 (negative = up). */
  moveY: number;
  run: boolean;
  jump: boolean;
  crouch: boolean;
  block: boolean;
  /** Start this action if able. */
  act: ActionRequest | null;
  /** Input during locked sequences. */
  struggle: 'push' | 'hold' | 'slip' | 'vanish' | null;
  /** Wake-up choice when getting up / landing from a launch. */
  wake: 'neutral' | 'rollF' | 'rollB' | 'tech' | null;
  /** Use a combo-breaking burst while in hitstun. */
  burst: boolean;
  /** Force facing (turn around) when free; 0 = automatic (face the opponent). */
  face: number;
}

export interface ActionRequest {
  id: string;
  aim?: Vec2;
  /** Cancel at this action frame (feint). */
  feintAt?: number;
  /** Extra startup frames (delay / charge). */
  hold?: number;
  /** Teleport placement hint. */
  place?: 'behind' | 'above' | 'away' | 'front' | 'flank';
}

export function emptyCommand(): Command {
  return { moveX: 0, moveY: 0, run: false, jump: false, crouch: false, block: false, act: null, struggle: null, wake: null, burst: false, face: 0 };
}

export type FightPhase = 'intro' | 'opening' | 'escalation' | 'climax' | 'collapse' | 'judgment' | 'finale' | 'over';

export type WinMethod =
  | 'combo' | 'counter' | 'beam' | 'ultimate' | 'ability' | 'projectile' | 'clash' | 'hazard' | 'throw' | 'finalClash' | 'guardBreak' | 'environment';
