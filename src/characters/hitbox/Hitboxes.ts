// Per-zone capsule hitboxes in world space, rebuilt every fixed tick from the latest posed joints
// (root space) transformed by the character's *simulation* transform. Far/culled characters reuse their
// last cached pose (animated at a reduced rate) — the transform still follows the simulation exactly.
import * as THREE from 'three';
import type { Hitbox, HitZone } from '../../core/types';
import { JOINT_INDEX, type PoseJoint, type PosePoints } from '../anim/types';
import { templateFor } from './templates';
import type { Character } from '../Character';

interface CapsuleDef {
  zone: HitZone;
  a: PoseJoint;
  b: PoseJoint;
  /** Interpolate the endpoints toward each other/outward: point = a + (b-a)*ta, a + (b-a)*tb. */
  ta: number;
  tb: number;
  radius: number;
}

/** Hitbox layout. Radii are tuned to the visual body (chest/pelvis use an extra cross capsule for width). */
export const HITBOX_DEFS: readonly CapsuleDef[] = [
  { zone: 'head', a: 'head', b: 'headTop', ta: 0.22, tb: 0.78, radius: 0.118 },
  { zone: 'neck', a: 'neck', b: 'head', ta: 0, tb: 0.9, radius: 0.06 },
  { zone: 'chest', a: 'chest', b: 'neck', ta: 0.0, tb: 0.72, radius: 0.155 },
  { zone: 'chest', a: 'upperArmL', b: 'upperArmR', ta: 0.12, tb: 0.88, radius: 0.1 },
  { zone: 'stomach', a: 'spine', b: 'chest', ta: -0.1, tb: 1.0, radius: 0.145 },
  { zone: 'pelvis', a: 'hips', b: 'spine', ta: -0.35, tb: 0.6, radius: 0.15 },
  { zone: 'pelvis', a: 'upperLegL', b: 'upperLegR', ta: 0, tb: 1, radius: 0.11 },
  { zone: 'arm', a: 'upperArmL', b: 'lowerArmL', ta: 0.05, tb: 1, radius: 0.06 },
  { zone: 'arm', a: 'lowerArmL', b: 'handL', ta: 0, tb: 0.95, radius: 0.05 },
  { zone: 'hand', a: 'handL', b: 'fingersL', ta: -0.05, tb: 1.6, radius: 0.052 },
  { zone: 'arm', a: 'upperArmR', b: 'lowerArmR', ta: 0.05, tb: 1, radius: 0.06 },
  { zone: 'arm', a: 'lowerArmR', b: 'handR', ta: 0, tb: 0.95, radius: 0.05 },
  { zone: 'hand', a: 'handR', b: 'fingersR', ta: -0.05, tb: 1.6, radius: 0.052 },
  { zone: 'leg', a: 'upperLegL', b: 'lowerLegL', ta: 0.08, tb: 1, radius: 0.085 },
  { zone: 'leg', a: 'lowerLegL', b: 'footL', ta: 0, tb: 0.95, radius: 0.065 },
  { zone: 'foot', a: 'footL', b: 'toesL', ta: -0.35, tb: 1.35, radius: 0.065 },
  { zone: 'leg', a: 'upperLegR', b: 'lowerLegR', ta: 0.08, tb: 1, radius: 0.085 },
  { zone: 'leg', a: 'lowerLegR', b: 'footR', ta: 0, tb: 0.95, radius: 0.065 },
  { zone: 'foot', a: 'footR', b: 'toesR', ta: -0.35, tb: 1.35, radius: 0.065 },
];

const _m = new THREE.Matrix4();
const _one = new THREE.Vector3(1, 1, 1);
const _pa = new THREE.Vector3();
const _pb = new THREE.Vector3();

/** Fill `out` hitboxes from root-space joints and a root→world matrix. Pure (no character dependency). */
export function buildHitboxes(points: PosePoints, rootToWorld: THREE.Matrix4, out: Hitbox[]): void {
  for (let i = 0; i < HITBOX_DEFS.length; i++) {
    const d = HITBOX_DEFS[i];
    const ia = JOINT_INDEX[d.a] * 3;
    const ib = JOINT_INDEX[d.b] * 3;
    _pa.set(points[ia], points[ia + 1], points[ia + 2]);
    _pb.set(points[ib], points[ib + 1], points[ib + 2]);
    const h = out[i];
    h.a.copy(_pa).lerp(_pb, d.ta).applyMatrix4(rootToWorld);
    h.b.copy(_pa).lerp(_pb, d.tb).applyMatrix4(rootToWorld);
    h.radius = d.radius;
    h.zone = d.zone;
  }
}

export class HitboxSet {
  readonly boxes: Hitbox[];
  /** World-space AABB of all capsules (broadphase). */
  readonly bounds = new THREE.Box3();
  private readonly c: Character;

  constructor(c: Character) {
    this.c = c;
    this.boxes = HITBOX_DEFS.map((d) => ({ zone: d.zone, a: new THREE.Vector3(), b: new THREE.Vector3(), radius: d.radius }));
  }

  /** Pose to use: the animated skeleton when available, else a stance template. */
  private pose(): PosePoints {
    const c = this.c;
    const p = c.visual?.getPosePoints();
    if (p) return p;
    if (c.mode === 'vehicle') return templateFor('seated');
    if (c.lifeState === 'knocked') return templateFor('knocked');
    if (c.mode === 'swim' || c.mode === 'skydive') return templateFor('stand');
    return templateFor(c.stance);
  }

  update(): void {
    const c = this.c;
    _m.compose(c.position, c.simQuat, _one);
    buildHitboxes(this.pose(), _m, this.boxes);
    const b = this.bounds.makeEmpty();
    for (const h of this.boxes) {
      b.expandByPoint(h.a);
      b.expandByPoint(h.b);
    }
    b.expandByScalar(0.16);
  }
}
