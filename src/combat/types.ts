import * as THREE from 'three';

export type Region = 'head' | 'chest' | 'gut' | 'legs' | 'back';
export type HitKind = 'punch' | 'kick' | 'elbow' | 'knee' | 'blunt' | 'blade' | 'slam' | 'throw' | 'stomp' | 'palm';

export interface HitInfo {
  attacker: { id: number } | null;
  damage: number;
  dir: THREE.Vector3; // world horizontal unit direction of force
  point: THREE.Vector3; // impact point (world)
  region: Region;
  strength: number; // 0.2 light .. 1 heavy .. 1.5 brutal
  kind: HitKind;
  knockdown: boolean;
  launch: number; // knockback speed m/s
  bleed: number; // blood amount 0..1
  boneBreak: boolean;
  finisher: boolean;
  unblockable: boolean;
  stun: number; // seconds of stun applied
  noReact?: boolean; // paired clips handle the reaction
  breakArm?: number; // 1 left, -1 right
}

export function makeHit(p: Partial<HitInfo> & { dir: THREE.Vector3; point: THREE.Vector3 }): HitInfo {
  return {
    attacker: null,
    damage: 10,
    region: 'head',
    strength: 0.5,
    kind: 'punch',
    knockdown: false,
    launch: 0,
    bleed: 0.3,
    boneBreak: false,
    finisher: false,
    unblockable: false,
    stun: 0,
    ...p,
  };
}

export type HitResult = 'hit' | 'blocked' | 'parried' | 'dodged' | 'killed' | 'ignored';
