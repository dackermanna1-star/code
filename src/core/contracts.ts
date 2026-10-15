// Cross-subsystem contracts. Every subsystem implements its interface here and talks to the
// others ONLY through `ctx` (core/GameContext.ts) and these interfaces, plus the EventBus.
//
// Rules for changing this file:
//  - Additive changes (new optional members, new interfaces) are fine. Note them in docs/ARCHITECTURE.md
//    under "Contract changelog".
//  - Never remove or change existing members without updating all implementers and consumers.
import type * as THREE from 'three';
import type {
  AmmoType,
  AttachmentSlot,
  Circle2,
  DamageInfo,
  DamageResult,
  Difficulty,
  EntityId,
  EquipmentSlot,
  FireMode,
  Hitbox,
  LifeState,
  MatchMode,
  MoveState,
  NoiseEvent,
  Perspective,
  Stance,
  SurfaceType,
  TeamId,
  WeaponClass,
  WeaponSlot,
  WeatherKind,
} from './types';

// ─────────────────────────────────────────────────────────────────────────────
// WORLD (terrain, water, map layout, sky/lighting/weather)
// ─────────────────────────────────────────────────────────────────────────────

export type LocationKind =
  | 'town'
  | 'city'
  | 'village'
  | 'military'
  | 'industrial'
  | 'farm'
  | 'landmark'
  | 'port'
  | 'school'
  | 'quarry'
  | 'ruins';

export interface MapLocation {
  name: string;
  kind: LocationKind;
  x: number;
  z: number;
  radius: number;
  /** 0..1 loot quality multiplier (military base high, villages low). */
  lootTier: number;
}

/** A plot of land the world reserves for a building. The buildings system instantiates it. */
export interface BuildingLot {
  id: number;
  type: BuildingType;
  x: number;
  z: number;
  /** Rotation about +Y in radians. The building's front door faces local +Z rotated by this. */
  rotationY: number;
  seed: number;
  /** Terrain is flattened to this height under the lot (building floor level = groundY). */
  groundY: number;
  /** Name of MapLocation this lot belongs to, if any. */
  location?: string;
}

/** World-placed static prop request (fence, pole, container, wreck…), instantiated by the buildings/props system. */
export interface PropPlacement {
  kind: string; // e.g. 'fence_wood', 'power_pole', 'container', 'car_wreck', 'hay_bale', 'barrier'
  x: number;
  y: number;
  z: number;
  rotationY: number;
  scale?: number;
  /** For linear props (fences, walls): length in meters along local X. */
  length?: number;
}

export interface VehicleSpawn {
  x: number;
  y: number;
  z: number;
  rotationY: number;
  kind: 'land' | 'water';
  /** Optional preferred vehicle ids, e.g. ['vehicle_uaz','vehicle_dacia']. */
  prefer?: string[];
}

export interface RoadSegment {
  /** Polyline points (x,z) in world space. */
  points: { x: number; z: number }[];
  width: number;
  kind: 'asphalt' | 'dirt';
}

export interface IWorld {
  /** Side length of the square world in meters (map spans 0..size on X and Z). */
  readonly size: number;
  readonly seaLevel: number;
  readonly locations: readonly MapLocation[];
  readonly lots: readonly BuildingLot[];
  readonly props: readonly PropPlacement[];
  readonly roads: readonly RoadSegment[];
  readonly vehicleSpawns: readonly VehicleSpawn[];
  /** Ground height of the terrain surface (ignores buildings). */
  getHeight(x: number, z: number): number;
  getNormal(x: number, z: number, out: THREE.Vector3): THREE.Vector3;
  getSurface(x: number, z: number): SurfaceType;
  /** Water surface height at x,z or null if no water there. */
  getWaterHeight(x: number, z: number): number | null;
  /** True if the point is on land and inside the playable island. */
  isLand(x: number, z: number): boolean;
  /** 0..1, how dense ground cover (grass/crops) is here: used for prone concealment by AI and grass rendering. */
  getGroundCover(x: number, z: number): number;
  /** 0..1 desired tree density (forests ~0.6-1, meadows ~0.02, 0 on roads/lots/water/fields/beaches). */
  getTreeDensity(x: number, z: number): number;
  /** True if a road, building lot, bridge or placed prop occupies the point (+margin m): no vegetation/rocks here. */
  isReserved(x: number, z: number, margin?: number): boolean;
  /** Nearest named location to the point. */
  nearestLocation(x: number, z: number): MapLocation | null;
  /** Top-down map image (canvas) for the UI map/minimap. Generated once at load. */
  getMapImage(): HTMLCanvasElement | null;
}

export interface IEnvironment {
  /** Hours 0..24. */
  timeOfDay: number;
  weather: WeatherKind;
  readonly sunDirection: THREE.Vector3;
  /** 0..1 ambient light level used by AI vision (night/fog reduce sight). */
  readonly visibility: number;
  /** Max view distance in meters due to fog/weather (for AI + rendering). */
  readonly fogDistance: number;
  setTimeOfDay(h: number): void;
  setWeather(w: WeatherKind): void;
}

// ─────────────────────────────────────────────────────────────────────────────
// BUILDINGS & PROPS
// ─────────────────────────────────────────────────────────────────────────────

export type BuildingType =
  | 'house_small' // 1-floor cottage
  | 'house_two_story'
  | 'house_brick' // 2-floor brick house
  | 'shed'
  | 'garage'
  | 'barn'
  | 'apartment' // 3-4 floors
  | 'warehouse'
  | 'factory'
  | 'shop'
  | 'gas_station'
  | 'school'
  | 'police'
  | 'hospital'
  | 'church'
  | 'military_barracks'
  | 'military_hangar'
  | 'watchtower'
  | 'ruin';

/** Nominal footprints (width along local X, depth along local Z), meters. Buildings must fit inside. */
export const BUILDING_FOOTPRINTS: Record<BuildingType, { w: number; d: number; floors: number }> = {
  house_small: { w: 9, d: 8, floors: 1 },
  house_two_story: { w: 11, d: 10, floors: 2 },
  house_brick: { w: 10, d: 10, floors: 2 },
  shed: { w: 5, d: 4, floors: 1 },
  garage: { w: 7, d: 7, floors: 1 },
  barn: { w: 12, d: 20, floors: 2 },
  apartment: { w: 14, d: 24, floors: 4 },
  warehouse: { w: 22, d: 36, floors: 1 },
  factory: { w: 30, d: 40, floors: 2 },
  shop: { w: 10, d: 12, floors: 1 },
  gas_station: { w: 20, d: 16, floors: 1 },
  school: { w: 40, d: 22, floors: 3 },
  police: { w: 16, d: 20, floors: 2 },
  hospital: { w: 24, d: 36, floors: 3 },
  church: { w: 12, d: 24, floors: 1 },
  military_barracks: { w: 10, d: 30, floors: 2 },
  military_hangar: { w: 30, d: 40, floors: 1 },
  watchtower: { w: 4, d: 4, floors: 3 },
  ruin: { w: 12, d: 12, floors: 1 },
};

export interface LootSpawnPoint {
  position: THREE.Vector3;
  /** 0..1 relative loot quality. */
  tier: number;
  indoor: boolean;
  buildingId?: number;
}

export interface NavNode {
  id: number;
  position: THREE.Vector3;
  buildingId?: number;
  floor?: number;
  /** True for nodes just outside an exterior door; these connect to the outdoor nav grid. */
  exterior?: boolean;
}

export interface NavEdge {
  a: number;
  b: number;
  kind: 'walk' | 'stairs' | 'door' | 'ladder' | 'window' | 'vault';
  doorId?: number;
  cost?: number;
}

export interface NavGraph {
  nodes: NavNode[];
  edges: NavEdge[];
}

export interface IDoor {
  readonly id: number;
  readonly position: THREE.Vector3;
  readonly isOpen: boolean;
  readonly buildingId: number;
  open(by?: ICharacter): void;
  close(by?: ICharacter): void;
  toggle(by?: ICharacter): void;
}

export interface BuildingInfo {
  id: number;
  type: BuildingType;
  lot: BuildingLot;
  /** World-space bounds of the building (all floors + roof). */
  bounds: THREE.Box3;
  floors: number;
}

export interface IBuildings {
  readonly buildings: readonly BuildingInfo[];
  getLootSpawnPoints(): readonly LootSpawnPoint[];
  getDoors(): readonly IDoor[];
  getDoorsNear(pos: THREE.Vector3, radius: number): IDoor[];
  /** Indoor navigation graph for all buildings (exterior door nodes link outside). */
  getNavGraph(): NavGraph;
  /** Building containing the point (inside walls & under roof), or null. */
  buildingAt(pos: THREE.Vector3): BuildingInfo | null;
  isIndoors(pos: THREE.Vector3): boolean;
}

// ─────────────────────────────────────────────────────────────────────────────
// VEGETATION
// ─────────────────────────────────────────────────────────────────────────────

export interface IVegetation {
  /**
   * 0..1 how much foliage (bushes, tree crowns, tall grass) blocks sight along the segment from→to.
   * Used by AI vision on top of physics line-of-sight.
   */
  foliageOcclusion(from: THREE.Vector3, to: THREE.Vector3): number;
  /** Nearby trees (trunk positions) for cover search. */
  treesNear(pos: THREE.Vector3, radius: number, out?: THREE.Vector3[]): THREE.Vector3[];
}

// ─────────────────────────────────────────────────────────────────────────────
// CHARACTERS (shared by player and bots — bots use exactly the same rules)
// ─────────────────────────────────────────────────────────────────────────────

/**
 * Input-agnostic commands. PlayerController fills it from keyboard/mouse; BotBrain fills it from AI.
 * Edge-triggered flags (jump, reload, interact, …) are consumed by the character after one fixed tick.
 */
export interface CharacterIntent {
  /** Local move axes in -1..1: x = strafe right(+)/left(-), y = forward(+)/back(-). */
  moveX: number;
  moveY: number;
  /** Desired absolute view angles (see core/types.ts conventions). */
  yaw: number;
  pitch: number;
  sprint: boolean;
  walk: boolean;
  /** Desired stance; null = keep current. */
  stance: Stance | null;
  jump: boolean; // edge: jump or vault/climb if an obstacle is ahead
  lean: -1 | 0 | 1; // -1 left, +1 right
  aim: boolean; // held: aim (over-shoulder in TPP)
  ads: boolean; // held/toggled: aim down sights / scope
  fire: boolean; // held trigger
  reload: boolean; // edge
  interact: boolean; // edge (F): pick up, open door, enter vehicle, revive (hold handled via interactHeld)
  interactHeld: boolean;
  switchSlot: WeaponSlot | null; // edge
  cycleWeapon: -1 | 0 | 1; // edge (mouse wheel)
  holster: boolean; // edge
  toggleFireMode: boolean; // edge
  /** Use a consumable item by item id (bandage, first aid, …) — edge. */
  useItem: string | null;
  /** Cancel current action (healing, reload) — edge. */
  cancel: boolean;
  freeLook: boolean; // held: camera orbits without turning the body
  /** Vehicle controls when seated (driver). */
  vehicle: VehicleControls;
  /** Switch to vehicle seat index — edge. */
  switchSeat: number | null;
}

export interface VehicleControls {
  throttle: number; // -1..1 (negative = reverse/brake)
  steer: number; // -1 (left) .. 1 (right)
  handbrake: boolean;
  boost: boolean;
  /** Air/lean control for motorcycles & boats (-1..1). */
  pitch: number;
  horn: boolean;
}

export function emptyIntent(): CharacterIntent {
  return {
    moveX: 0,
    moveY: 0,
    yaw: 0,
    pitch: 0,
    sprint: false,
    walk: false,
    stance: null,
    jump: false,
    lean: 0,
    aim: false,
    ads: false,
    fire: false,
    reload: false,
    interact: false,
    interactHeld: false,
    switchSlot: null,
    cycleWeapon: 0,
    holster: false,
    toggleFireMode: false,
    useItem: null,
    cancel: false,
    freeLook: false,
    vehicle: { throttle: 0, steer: 0, handbrake: false, boost: false, pitch: 0, horn: false },
    switchSeat: null,
  };
}

/** What the character is currently busy doing (blocks some other actions). */
export type CharacterAction =
  | { kind: 'none' }
  | { kind: 'reload'; progress: number; duration: number }
  | { kind: 'useItem'; itemId: string; progress: number; duration: number }
  | { kind: 'revive'; targetId: EntityId; progress: number; duration: number }
  | { kind: 'beingRevived'; byId: EntityId; progress: number; duration: number }
  | { kind: 'switchWeapon'; progress: number; duration: number }
  | { kind: 'throw'; progress: number; cookTime: number }
  | { kind: 'melee'; progress: number; duration: number }
  | { kind: 'interact'; label: string; progress: number; duration: number };

export interface ICharacter {
  readonly id: EntityId;
  name: string;
  teamId: TeamId;
  readonly isPlayer: boolean;
  /** Feet position (simulation state, fixed-tick). */
  readonly position: THREE.Vector3;
  readonly velocity: THREE.Vector3;
  /** Current view angles (after intent smoothing). */
  readonly yaw: number;
  readonly pitch: number;
  readonly stance: Stance;
  readonly moveState: MoveState;
  readonly lifeState: LifeState;
  health: number;
  readonly maxHealth: number;
  /** Knocked (DBNO) health, 0..100, drains while knocked. */
  knockHealth: number;
  /** Boost meter 0..100 (energy drink/painkiller/adrenaline). */
  boost: number;
  /** Lean amount -1..1 (smoothed). */
  readonly lean: number;
  readonly isAiming: boolean;
  readonly isADS: boolean;
  readonly action: CharacterAction;
  readonly intent: CharacterIntent;
  readonly inventory: IInventory;
  /** Currently held weapon (null = fists/holstered). */
  readonly activeWeapon: IWeaponInstance | null;
  readonly activeSlot: WeaponSlot | null;
  readonly vehicle: IVehicle | null;
  readonly seatIndex: number;
  /** Visual root object in the scene (interpolated at render time). */
  readonly root: THREE.Object3D;
  /** True if the character is currently rendered with full detail (near camera). */
  readonly isVisibleDetailed: boolean;
  /** World-space eye position (accounts for stance and lean). */
  getEyePosition(out: THREE.Vector3): THREE.Vector3;
  /** World-space unit aim direction from yaw/pitch (no recoil). */
  getAimDirection(out: THREE.Vector3): THREE.Vector3;
  /** World-space muzzle position of the held weapon (or eye position fallback). */
  getMuzzlePosition(out: THREE.Vector3): THREE.Vector3;
  /** Up-to-date world-space hitboxes (refreshed every fixed tick when alive). */
  getHitboxes(): readonly Hitbox[];
  /** Rough bounding capsule radius/height for broadphase. */
  readonly radius: number;
  readonly height: number;
  /** Apply final health damage (already processed by DamageSystem). */
  applyHealthDelta(delta: number, info?: DamageInfo): void;
  /** Lifecycle transitions are driven by the DamageSystem / Match rules. */
  setLifeState(state: LifeState, info?: DamageInfo): void;
  teleport(pos: THREE.Vector3, yaw?: number): void;
  /** Enter/exit vehicle seat (called by the vehicle system). */
  setVehicle(vehicle: IVehicle | null, seatIndex: number): void;
  /** For parachute flow. */
  setMoveState(state: MoveState): void;
  equipSlot(slot: WeaponSlot | null): void;
  /** Called when stats/equipment change so visuals (helmet, vest, backpack, weapons on back) refresh. */
  refreshEquipmentVisuals(): void;
  dispose(): void;
}

export interface CharacterSpawnOptions {
  name: string;
  teamId: TeamId;
  isPlayer: boolean;
  position: THREE.Vector3;
  yaw?: number;
  /** Visual variant index (character model/outfit). */
  variant?: number;
}

export interface ICharacters {
  spawn(opts: CharacterSpawnOptions): ICharacter;
  remove(c: ICharacter): void;
  all(): readonly ICharacter[];
  byId(id: EntityId): ICharacter | undefined;
  /** Characters whose position is within radius (any life state). */
  queryRadius(pos: THREE.Vector3, radius: number, out?: ICharacter[]): ICharacter[];
}

// ─────────────────────────────────────────────────────────────────────────────
// ITEMS, INVENTORY, LOOT
// ─────────────────────────────────────────────────────────────────────────────

export type ItemCategory =
  | 'weapon'
  | 'ammo'
  | 'attachment'
  | 'heal'
  | 'boost'
  | 'throwable'
  | 'helmet'
  | 'vest'
  | 'backpack'
  | 'fuel'
  | 'misc';

export interface ItemDef {
  id: string; // e.g. 'ammo_556', 'item_bandage', 'helmet_2', 'ar_m416', 'scope_4x'
  name: string;
  category: ItemCategory;
  /** Capacity units per single item (PUBG-style weight). */
  weight: number;
  maxStack: number;
  /** 1..3 for helmets/vests/backpacks; rarity hint for others. */
  level?: number;
  /** Model URL for ground loot / held visuals. */
  model?: string;
  icon?: string;
  description?: string;
}

export interface ItemStack {
  itemId: string;
  count: number;
}

export interface IWeaponInstance {
  readonly uid: number;
  readonly def: WeaponDef;
  ammoInMag: number;
  fireMode: FireMode;
  attachments: Partial<Record<AttachmentSlot, string>>;
  /** Effective magazine size after attachments. */
  readonly magSize: number;
  /** Selected zeroing distance in meters (snipers/DMRs). */
  zeroing: number;
}

export interface IInventory {
  readonly owner: ICharacter | null;
  readonly weapons: Record<WeaponSlot, IWeaponInstance | null>;
  readonly equipment: Record<EquipmentSlot, { itemId: string; durability: number } | null>;
  readonly items: readonly ItemStack[];
  readonly capacity: number;
  readonly used: number;
  count(itemId: string): number;
  canFit(itemId: string, count: number): number; // how many fit
  add(itemId: string, count: number): number; // returns amount added
  remove(itemId: string, count: number): number; // returns amount removed
  /** Equip a weapon instance into a slot; returns the previously held instance (to be dropped). */
  setWeapon(slot: WeaponSlot, w: IWeaponInstance | null): IWeaponInstance | null;
  setEquipment(slot: EquipmentSlot, itemId: string | null, durability?: number): { itemId: string; durability: number } | null;
  /** Fires 'inventory:changed' for UI. */
  notifyChanged(): void;
}

export interface GroundItem {
  readonly id: number;
  readonly position: THREE.Vector3;
  /** Either a plain stack or a weapon instance (with attachments/ammo). */
  readonly stack: ItemStack;
  readonly weapon?: IWeaponInstance;
}

export interface ILoot {
  /** Spawn all initial world loot. */
  populate(seed: number, density: number): void;
  spawnGround(pos: THREE.Vector3, stack: ItemStack, weapon?: IWeaponInstance): GroundItem;
  removeGround(item: GroundItem): void;
  itemsNear(pos: THREE.Vector3, radius: number): GroundItem[];
  /** Move a ground item into a character's inventory (handles auto-equip, attachments, swapping). */
  pickUp(c: ICharacter, item: GroundItem): boolean;
  /** Drop a stack from inventory to the ground near the character. */
  drop(c: ICharacter, itemId: string, count: number): void;
  /** Create a death crate containing everything the character carried. */
  createDeathBox(c: ICharacter): void;
  /** Supply drop from the sky. */
  spawnAirdrop(x: number, z: number): void;
}

export interface IItems {
  defs: Record<string, ItemDef>;
  get(id: string): ItemDef;
  createInventory(owner: ICharacter | null): IInventory;
  /** Seconds to use a consumable (bandage 4s, first aid 6s, medkit 8s, drink 4s, painkiller 6s, adrenaline 8s). */
  useDuration(itemId: string): number;
  /** Apply consumable effect at the end of use. Returns false if not allowed (e.g. first aid caps at 75 hp). */
  applyUse(c: ICharacter, itemId: string): boolean;
  canUse(c: ICharacter, itemId: string): boolean;
  loot: ILoot;
}

// ─────────────────────────────────────────────────────────────────────────────
// COMBAT (weapons, ballistics, damage)
// ─────────────────────────────────────────────────────────────────────────────

export interface WeaponDef {
  id: string; // e.g. 'ar_m416'
  name: string;
  class: WeaponClass;
  ammo: AmmoType | null;
  /** Base damage per bullet (per pellet for shotguns). */
  damage: number;
  pellets?: number;
  /** Rounds per minute. */
  rpm: number;
  fireModes: FireMode[];
  burstCount?: number;
  magSize: number;
  /** Seconds for tactical reload / empty reload. Per-shell reload for shotguns/bolt actions uses shellReload. */
  reloadTime: number;
  reloadTimeEmpty: number;
  shellReload?: number;
  /** Muzzle velocity in m/s. */
  muzzleVelocity: number;
  /** Effective range (m) after which damage falls off. */
  range: number;
  /** Allowed attachments by slot. */
  attachmentSlots: AttachmentSlot[];
  /** Model URL. */
  model: string;
  /** Crate-only weapon. */
  crate?: boolean;
}

export interface ShotOptions {
  shooter: ICharacter;
  weapon: IWeaponInstance;
  origin: THREE.Vector3;
  direction: THREE.Vector3;
}

export interface ICombat {
  weaponDefs: Record<string, WeaponDef>;
  createWeapon(defId: string): IWeaponInstance;
  /** Spawn a ballistic projectile (simulated with gravity/drag/travel time). */
  fireProjectile(opts: ShotOptions): void;
  /** Apply damage with hit zones, armor and knock/kill rules. */
  applyDamage(target: ICharacter, info: DamageInfo): DamageResult;
  /** Ray-cast against all character hitboxes (closest hit), ignoring `ignore`. */
  raycastCharacters(
    origin: THREE.Vector3,
    dir: THREE.Vector3,
    maxDist: number,
    ignore?: ICharacter | null,
  ): { character: ICharacter; zone: string; distance: number; point: THREE.Vector3 } | null;
  /**
   * Per-tick weapon handling for a character (fire, recoil, reload, switching). Called by the character
   * each fixed tick with its intent. Returns current recoil offset to add to the view (radians).
   */
  updateWeaponHandling(c: ICharacter, dt: number): { recoilPitch: number; recoilYaw: number };
  /** Current dynamic crosshair spread (radians) for UI. */
  getSpread(c: ICharacter): number;
  /** Throw the currently cooked throwable. */
  throwGrenade(c: ICharacter, itemId: string, cookTime: number, power: number): void;
  /**
   * Build the visual model of a weapon instance including its attachments (origin at grip, barrel +Z).
   * Returns immediately; meshes are filled in asynchronously. Child empties 'muzzle', 'grip_support',
   * 'sight_eye' (active optic eye point) are guaranteed to exist once loaded (userData.loaded = true).
   */
  createWeaponModel?(w: IWeaponInstance): THREE.Object3D;
}

// ─────────────────────────────────────────────────────────────────────────────
// VEHICLES
// ─────────────────────────────────────────────────────────────────────────────

export interface VehicleSeat {
  index: number;
  occupant: ICharacter | null;
  /** Can the occupant shoot from this seat? */
  canShoot: boolean;
}

export interface IVehicle {
  readonly id: EntityId;
  readonly kind: string; // e.g. 'vehicle_uaz'
  readonly position: THREE.Vector3;
  readonly quaternion: THREE.Quaternion;
  readonly velocity: THREE.Vector3;
  readonly speedKmh: number;
  readonly seats: readonly VehicleSeat[];
  health: number;
  readonly maxHealth: number;
  fuel: number; // 0..100
  readonly destroyed: boolean;
  readonly isBoat: boolean;
  readonly root: THREE.Object3D;
  /** World position for a seated character's hips. */
  getSeatTransform(seat: number, outPos: THREE.Vector3, outQuat: THREE.Quaternion): void;
  enter(c: ICharacter, seat?: number): boolean;
  exit(c: ICharacter): boolean;
  switchSeat(c: ICharacter, seat: number): boolean;
  applyDamage(amount: number, attackerId?: EntityId): void;
  refuel(amount: number): void;
}

export interface IVehicles {
  spawnAll(seed: number): void;
  spawn(kind: string, pos: THREE.Vector3, rotationY: number): IVehicle;
  all(): readonly IVehicle[];
  nearest(pos: THREE.Vector3, maxDist: number): IVehicle | null;
  /** Vehicle owning a physics collider handle, if any. */
  byCollider(handle: number): IVehicle | null;
}

// ─────────────────────────────────────────────────────────────────────────────
// MATCH / ZONE
// ─────────────────────────────────────────────────────────────────────────────

export interface MatchConfig {
  mode: MatchMode;
  /** Total combatants including the player (60-100). */
  totalPlayers: number;
  difficulty: Difficulty;
  perspective: Perspective;
  timeOfDay: number;
  weather: WeatherKind;
  seed: number;
  /** Debug: skip the plane and spawn on the ground. */
  quickStart?: boolean;
}

export type MatchState = 'loading' | 'lobby' | 'plane' | 'playing' | 'ended';

export interface KillRecord {
  time: number;
  killerId?: EntityId;
  victimId: EntityId;
  weaponId?: string;
  headshot: boolean;
  knock: boolean; // true for a knock (not a final kill)
  distance?: number;
}

export interface PlayerResult {
  placement: number;
  kills: number;
  knocks: number;
  damageDealt: number;
  survivalTime: number;
  won: boolean;
  teamPlacement: number;
}

export interface IZone {
  /** 0 = before first circle announced. */
  readonly phase: number;
  readonly state: 'idle' | 'waiting' | 'shrinking' | 'final';
  /** Current blue-zone (outside this you take damage). */
  readonly current: Circle2;
  /** Next safe zone (white circle), null when none is announced. */
  readonly next: Circle2 | null;
  /** Seconds until the next state change (shrink start or shrink end). */
  readonly timeRemaining: number;
  readonly damagePerSecond: number;
  isInside(x: number, z: number): boolean;
  /** Distance outside the current safe zone (0 if inside). */
  distanceOutside(x: number, z: number): number;
}

export interface IMatch {
  readonly config: MatchConfig;
  readonly state: MatchState;
  /** Seconds since the match started (plane takeoff). */
  readonly time: number;
  readonly player: ICharacter | null;
  readonly combatants: readonly ICharacter[];
  readonly killFeed: readonly KillRecord[];
  aliveCount(): number;
  aliveTeams(): number;
  teammates(c: ICharacter): ICharacter[];
  /** Whether a lethal hit knocks instead of kills (squad/duo with living teammates). */
  shouldKnock(c: ICharacter): boolean;
  stats(id: EntityId): { kills: number; knocks: number; damage: number };
  start(config: MatchConfig): Promise<void>;
  /** Plane path (for UI map), once known. */
  readonly planePath: { from: THREE.Vector3; to: THREE.Vector3 } | null;
  readonly result: PlayerResult | null;
}

// ─────────────────────────────────────────────────────────────────────────────
// AI
// ─────────────────────────────────────────────────────────────────────────────

export interface IAI {
  /** Create a bot brain driving the character's intent. */
  addBot(c: ICharacter, difficulty: Difficulty): void;
  removeBot(c: ICharacter): void;
  /** Debug info for the bot driving c, if any. */
  debugInfo(c: ICharacter): string | null;
}

// ─────────────────────────────────────────────────────────────────────────────
// AUDIO
// ─────────────────────────────────────────────────────────────────────────────

export type AudioCategory = 'sfx' | 'ui' | 'ambience' | 'music' | 'voice';

export interface PlayOptions {
  position?: THREE.Vector3;
  /** Attach the voice to an object (follows it). */
  follow?: THREE.Object3D;
  volume?: number;
  pitch?: number;
  /** Random pitch variation ± (e.g. 0.05). */
  pitchJitter?: number;
  loop?: boolean;
  category?: AudioCategory;
  /** Distance at which volume starts to roll off. */
  refDistance?: number;
  maxDistance?: number;
  /** Delay playback by distance / 343 m/s (distant gunfire/explosions). */
  speedOfSound?: boolean;
  /** Apply line-of-sight occlusion (muffling through walls/terrain). */
  occlusion?: boolean;
}

export interface SoundHandle {
  stop(fadeSeconds?: number): void;
  setVolume(v: number): void;
  setPitch(p: number): void;
  setPosition(p: THREE.Vector3): void;
  readonly playing: boolean;
}

export interface IAudio {
  /**
   * Play a sound by id = path under /assets/audio without extension and without variation suffix,
   * e.g. 'weapons/ar_556' picks a random 'weapons/ar_556_0N' variation if present.
   */
  play(id: string, opts?: PlayOptions): SoundHandle;
  /** Unlock the AudioContext after a user gesture. */
  unlock(): void;
  readonly ready: boolean;
}

// ─────────────────────────────────────────────────────────────────────────────
// FX (particles, decals, tracers)
// ─────────────────────────────────────────────────────────────────────────────

export interface IEffects {
  muzzleFlash(pos: THREE.Vector3, dir: THREE.Vector3, size: number, suppressed: boolean): void;
  tracer(from: THREE.Vector3, to: THREE.Vector3, color?: number): void;
  impact(pos: THREE.Vector3, normal: THREE.Vector3, surface: SurfaceType): void;
  blood(pos: THREE.Vector3, dir: THREE.Vector3, amount: number): void;
  bulletHole(pos: THREE.Vector3, normal: THREE.Vector3, surface: SurfaceType): void;
  explosion(pos: THREE.Vector3, radius: number): void;
  smokeCloud(pos: THREE.Vector3, duration: number): void;
  fire(pos: THREE.Vector3, radius: number, duration: number): void;
  waterSplash(pos: THREE.Vector3, size: number): void;
  dust(pos: THREE.Vector3, size: number): void;
  shellEject(pos: THREE.Vector3, dir: THREE.Vector3, kind: 'rifle' | 'pistol' | 'shotgun'): void;
  /** Screen flash for stun grenades (0..1). */
  flashbang(intensity: number): void;
}

// ─────────────────────────────────────────────────────────────────────────────
// UI
// ─────────────────────────────────────────────────────────────────────────────

export interface IUI {
  showMainMenu(): void;
  showHUD(): void;
  showResults(result: PlayerResult): void;
  /** Big center-screen notice (e.g. "RESTRICTING THE PLAY AREA IN 1:00"). */
  notify(text: string, kind?: 'info' | 'warning' | 'kill' | 'zone', seconds?: number): void;
  /** True while a menu/inventory/map overlay captures input (gameplay input suspended). */
  readonly capturesInput: boolean;
  /** Show the loading screen with progress 0..1 and a status message. */
  setLoading(progress: number, message: string): void;
  hideLoading(): void;
}

// ─────────────────────────────────────────────────────────────────────────────
// Interactables (doors, loot, vehicles, revives, …) — registry implemented in core.
// ─────────────────────────────────────────────────────────────────────────────

export interface Interactable {
  readonly id: number;
  readonly kind: 'loot' | 'door' | 'vehicle' | 'revive' | 'deathbox' | 'airdrop' | 'other';
  /** World position used for distance/view tests. */
  readonly position: THREE.Vector3;
  /** Max interaction distance in meters. */
  readonly range: number;
  /** Higher wins ties (e.g. revive over loot). */
  readonly priority: number;
  label(c: ICharacter): string;
  available(c: ICharacter): boolean;
  /** Seconds the interact key must be held (0 = instant). */
  holdTime(c: ICharacter): number;
  interact(c: ICharacter): void;
}

// re-export for convenience
export type { Circle2, NoiseEvent };
