import * as THREE from 'three';
import type { ExternalPose } from '../anim/animator';
import type { SkeletonDef } from '../anim/skeleton';
import type { PoseFK } from '../anim/pose';

/** Everything a ragdoll needs to take over from the animated pose. */
export interface RagdollInit {
  def: SkeletonDef;
  fk: PoseFK; // root-space FK of the current pose
  prevFk?: PoseFK; // previous frame (for velocities)
  dt: number;
  rootX: number;
  rootZ: number;
  rootYaw: number;
  vel: THREE.Vector3; // whole-body velocity (world)
  scale: number;
}

/** Simplified world-space collision primitive left behind by a settled body. */
export interface CorpseShape {
  kind: 'capsule' | 'ball';
  a: THREE.Vector3;
  b: THREE.Vector3; // == a for balls
  radius: number;
}

/**
 * Common interface of the passive Rapier ragdoll (world/ragdoll.ts) and the
 * active "euphoria" ragdoll (world/euphoria/bridge.ts).
 */
export interface RagdollLike extends ExternalPose {
  /** true for the active (muscle-driven, self-balancing) ragdoll. */
  readonly active: boolean;
  time: number;
  calmTime: number;
  settled: boolean;
  disposed: boolean;
  update(dt: number): void;
  read(): void;
  pelvisPos(out: THREE.Vector3): THREE.Vector3;
  chestPos(out: THREE.Vector3): THREE.Vector3;
  headPos(out: THREE.Vector3): THREE.Vector3;
  pelvisVel(out: THREE.Vector3): THREE.Vector3;
  /** Pelvis projected onto the floor. */
  rootPos(out: THREE.Vector3): THREE.Vector3;
  faceUp(): boolean;
  /** Apply an impulse (world, N*s) at the body part nearest to `at` (or a named part). */
  impulse(imp: THREE.Vector3, at?: THREE.Vector3, partName?: string): void;
  /** Add velocity to every body (whole-body launch). */
  launch(v: THREE.Vector3, spin?: number): void;
  corpseShapes(): CorpseShape[];
  dispose(): void;
}
