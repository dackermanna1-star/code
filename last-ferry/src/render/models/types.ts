// Contracts between procedural models, animation, ragdolls and the game view.
import type * as THREE from 'three';

/**
 * Ragdoll description for one bone. A bone listed here becomes a rigid body
 * when the creature dies; bones not listed ride along with their nearest
 * listed ancestor. The joint to the parent body is placed at this bone's
 * origin (its pivot).
 */
export interface BoneSpec {
  shape: 'sphere' | 'box' | 'capsule';
  /** sphere: [r]; box: half extents [x,y,z]; capsule: [radius, halfLength] along `axis`. */
  size: number[];
  axis?: 'x' | 'y' | 'z';
  /** Collider centre in bone-local space. */
  offset: [number, number, number];
  /** kg */
  mass: number;
  /** Joint to the parent ragdoll body. Omit for the root body. */
  joint?: {
    kind: 'cone' | 'hinge';
    /** Joint axis in bone-local space (cone: twist axis along the limb; hinge: rotation axis). */
    axis: [number, number, number];
    /** Cone half-angle (rad) for 'cone'. */
    cone?: number;
    /** Twist limit (rad) for 'cone'. */
    twist?: number;
  };
  /** May fly off as a separate chunk in gib deaths. */
  gib?: boolean;
}

/** Inputs for procedural animation, filled from the logic entity each frame. */
export interface AnimInput {
  /** Logic state name (walk, crawl, glide, run, panic, flee, sniff, hidden, charge, rush, ...). */
  state: string;
  /** Seconds since the state started. */
  stateTime: number;
  /** Global time (s). */
  time: number;
  /** Distance travelled (m) — drives gait cycles so feet don't slide. */
  distance: number;
  /** Current ground speed (m/s). */
  speed: number;
  /** Frame delta (s). */
  dt: number;
  /** Extra per-type parameters (e.g. hasCub, rage, heat). */
  params: Record<string, number | boolean>;
}

export interface CreatureRig {
  /** Root group: origin at the feet centre, creature faces +X. */
  root: THREE.Group;
  /** Every named bone (pivot objects). */
  bones: Map<string, THREE.Object3D>;
  /** Ragdoll specs keyed by bone name. */
  spec: Record<string, BoneSpec>;
  /** Name of the head bone (headshots, head-off deaths). */
  head: string;
  /** Pose the rig for this frame. */
  animate(a: AnimInput): void;
  /** Optional: the cub held by an activist, so it can be detached when shot out. */
  cub?: THREE.Object3D;
}

// ---------------------------------------------------------------------------
// Last Ferry model contracts (implemented in src/render/models/index.ts).
// Conventions: metres; root origin at the feet centre; the character faces +X
// (zombies walk right). The hunter faces -X (he fires left). Y up.
// ---------------------------------------------------------------------------
import type { WeaponId, ZombieKind } from '../../config/ids';

export interface ZombieRig extends CreatureRig {
  readonly kind: ZombieKind;
  readonly look: number;
  /**
   * Riot brute: show only the armour pieces in `mask` (PLATE_* flags). The
   * pieces are separate meshes so the game view can clone one as flying debris.
   */
  setPlates?(mask: number): void;
  /** Riot brute armour piece meshes by PLATE_* flag (for debris clones). */
  plates?: Record<number, THREE.Object3D>;
  /** Charred look 0..1 (burning / burned bodies). `force`: re-apply the materials (meshes were swapped). */
  setCharred(t: number, force?: boolean): void;
  /** Hand-held prop that drops on death (waiter's tray, granny's handbag …), if any. */
  prop?: THREE.Object3D;
  /** Big Dave's apron (hidden when he enrages). */
  apron?: THREE.Object3D;
  /** Approximate standing height (m) for UI anchors (money popups, boss bar). */
  readonly height: number;
  /** Glowing eyes on/off (put them out when the body is dead for good, before baking). */
  setEyeGlow?(on: boolean): void;
  /** Jogger: show the gold medal (the 40th Marathon runner). */
  setMedal?(on: boolean): void;
  /** One-body ragdoll specs (in each piece's local frame) for the detachable prop, riot plates and apron. */
  propSpec?: BoneSpec;
  plateSpec?: Record<number, BoneSpec>;
  apronSpec?: BoneSpec;
}

/** How the hunter holds a weapon. */
export type HoldStyle = 'pistol' | 'shoulder' | 'hip';

export interface WeaponAnimState {
  /** Seconds since the last shot (large = idle). */
  fireT: number;
  /** 0..1 reload progress, or -1. */
  reloadT: number;
  /** Outboard engine spin 0..1. */
  spin: number;
  /** 0..1 heat. */
  heat: number;
  /** Shotgun pump progress 0..1. */
  cock: number;
  /** Loaded (harpoon bolt / flare in the barrel visible). */
  loaded: boolean;
  dt: number;
}

export interface WeaponModel {
  readonly id: WeaponId;
  /** Origin at the main grip, barrel toward -X, top toward +Y. */
  group: THREE.Group;
  /** Muzzle point: local -X = firing direction. */
  muzzle: THREE.Object3D;
  /** Shell ejection port (local +Y = ejection direction), if the gun ejects anything. */
  ejector?: THREE.Object3D;
  /** Detachable magazine / nail strip / harpoon bolt / flare cartridge (hidden while reloading). */
  magazine?: THREE.Object3D;
  /** Support-hand grip point (child of the part it grips, e.g. the pump), or null. */
  support: THREE.Object3D | null;
  hold: HoldStyle;
  animate(s: WeaponAnimState): void;
}

export interface HunterRig extends CreatureRig {
  /** Mount point in the main hand (weapon models are added here). */
  hand: THREE.Object3D;
  /** Mount a weapon (null = empty hands) and switch the hold pose. */
  setWeapon(model: WeaponModel | null): void;
  getWeapon(): WeaponModel | null;
}

/**
 * Factory surface implemented by src/render/models/index.ts:
 *   createZombieRig(kind: ZombieKind, look: number): ZombieRig
 *   createHunterRig(): HunterRig
 *   createWeaponModel(id: WeaponId): WeaponModel
 *   createStretcher(): THREE.Group          // origin at its centre, long axis X, deck height 0
 *   createCratePallet(): THREE.Group        // origin at the pallet's bottom centre
 *   createCrate(): THREE.Group              // a single fish crate (debris / barricade)
 *   createHarpoonBolt(): THREE.Group        // origin at the tail, tip toward -X
 *   createNail(): THREE.Group               // origin at the head, point toward -X
 *   createFlareCartridge(): THREE.Group     // the burning flare stick (deck fire zones)
 *
 * Hunter AnimInput.params: weapon (index into WEAPON_ORDER), fireT, reloadT,
 * spin, heat, cock, loaded, hurt (0..1), and the state names from PlayerState
 * (stand, walk, air, stomp, kick, grabbed, dead).
 *
 * Zombie AnimInput.state: the ZombieState names in src/core/api.ts (plus
 * 'down': lying on the back), params: burning (bool), enraged (bool),
 * charred (0..1), twitch (bool, 'down'), front (bool, medic 'carry': true =
 * front medic), facing (+1/−1, keep the 3/4 turn when walking left), blend
 * (s, cross-fade on the next state change; default 0.22).
 * Hunter extra params: shells (shotgun: shells loaded over one reloadT 0..1).
 */
