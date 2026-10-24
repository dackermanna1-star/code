import * as THREE from 'three';
import { Emitter } from '../core/Events';
import type { Combatant, HitInfo, HitResult } from './Combat';
import type { RemovedVoxel } from '../characters/VoxelPart';
import type { SurfaceMaterial } from '../physics/Physics';

export interface GameEvents {
  hit: { target: Combatant; hit: HitInfo; result: HitResult };
  death: { victim: Combatant; hit: HitInfo | null; cause: string };
  knockdown: { victim: Combatant; hit: HitInfo | null };
  carve: { target: Combatant; part: number; removed: RemovedVoxel[]; hit: HitInfo; color: string };
  sever: { target: Combatant; part: number; point: THREE.Vector3; dir: THREE.Vector3 };
  headExplode: { target: Combatant; point: THREE.Vector3; dir: THREE.Vector3 };
  bleed: { pos: THREE.Vector3; amount: number; vel?: THREE.Vector3 };
  noise: { pos: THREE.Vector3; radius: number; kind: 'hit' | 'scream' | 'break' | 'death' | 'shout' | 'impact' | 'music'; source: Combatant | null; target?: Combatant | null };
  impact: { pos: THREE.Vector3; normal: THREE.Vector3; material: SurfaceMaterial; strength: number; otherMaterial?: SurfaceMaterial };
  whiff: { attacker: Combatant; pos: THREE.Vector3; heavy: boolean };
  footstep: { pos: THREE.Vector3; material: SurfaceMaterial; intensity: number; isPlayer: boolean };
  ragdollImpact: { pos: THREE.Vector3; strength: number; part: number; target: Combatant };
  vocal: { who: Combatant; kind: 'grunt' | 'pain' | 'scream' | 'death' | 'shout' | 'laugh' | 'taunt' | 'effort' | 'gurgle'; pos: THREE.Vector3; pitch: number };
  block: { target: Combatant; attacker: Combatant | null; pos: THREE.Vector3; parry: boolean };
  kill: { killer: Combatant | null; victim: Combatant; style: string };
}

export const events = new Emitter<GameEvents>();
