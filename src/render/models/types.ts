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
