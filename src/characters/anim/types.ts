// Shared types between the Character simulation and its visual (animation) layer.
import type * as THREE from 'three';
import type { DamageInfo, HitZone } from '../../core/types';

/** Canonical humanoid joints used for hitboxes, IK and procedural posing. */
export const POSE_JOINTS = [
  'hips',
  'spine',
  'chest',
  'upperChest',
  'neck',
  'head',
  'headTop',
  'upperArmL',
  'lowerArmL',
  'handL',
  'fingersL',
  'upperArmR',
  'lowerArmR',
  'handR',
  'fingersR',
  'upperLegL',
  'lowerLegL',
  'footL',
  'toesL',
  'upperLegR',
  'lowerLegR',
  'footR',
  'toesR',
] as const;
export type PoseJoint = (typeof POSE_JOINTS)[number];
export const JOINT_INDEX: Record<PoseJoint, number> = Object.fromEntries(POSE_JOINTS.map((j, i) => [j, i])) as Record<PoseJoint, number>;
export const JOINT_COUNT = POSE_JOINTS.length;

/**
 * Joint positions in character-root space (meters; root at the feet/body origin, +Z = character forward,
 * +X = character LEFT (assets face +Z), +Y up). Stored as a flat Float32Array [x,y,z]*JOINT_COUNT.
 */
export type PosePoints = Float32Array;

export interface HitReaction {
  zone?: HitZone;
  /** World-space direction of the incoming hit (from shooter toward victim). */
  direction?: THREE.Vector3;
  amount: number;
}

/** Render-side representation of a character (model, animation, attachments). */
export interface ICharacterVisual {
  readonly root: THREE.Group;
  /** True when rendered with full detail (near and in view). */
  readonly detailed: boolean;
  /** Per-frame update: interpolation, animation, IK, LOD. */
  update(dt: number, alpha: number): void;
  /** Latest posed joints in root space (null until the first pose is available). */
  getPosePoints(): PosePoints | null;
  onWeaponChanged(): void;
  refreshEquipment(): void;
  hitReaction(r: HitReaction): void;
  die(info?: DamageInfo): void;
  /** Revive / respawn from a dead visual state. */
  reset(): void;
  /** World position of the held weapon's muzzle, if the model is loaded. */
  getMuzzleWorld(out: THREE.Vector3): boolean;
  /** World position of the active sight's eye point (ADS camera), if available. */
  getSightEyeWorld(out: THREE.Vector3): boolean;
  /** World position between the eyes (FPP camera), if the model is loaded. */
  getEyeWorld(out: THREE.Vector3): boolean;
  /** Hide head/helmet for the first-person camera. */
  setFirstPerson(on: boolean): void;
  setVisible(on: boolean): void;
  /** Team marker above the head (null hides). */
  setMarker?(color: number | null): void;
  dispose(): void;
}
