// Shared state of the game view's subsystems (hunters, horde, bodies, hazards).
import type * as THREE from 'three';
import type { World } from '../../core/World';
import type { BloodSystem } from '../BloodSystem';
import type { Corpses } from '../Corpses';
import type { Debris } from '../Debris';
import type { Effects } from '../Effects';
import type { Environment } from '../env/Environment';
import type { Physics } from '../Physics';
import type { Stage } from '../Stage';
import type { Gore } from './Gore';
import type { LightPool } from './LightPool';
import type { Shake } from './Shake';

export interface ViewOptions {
  blood: 'low' | 'normal' | 'max';
  /** 0..1 */
  shake: number;
}

export interface Ctx {
  readonly stage: Stage;
  readonly env: Environment;
  readonly scene: THREE.Scene;
  /** Parent of every per-world object (rigs, props). */
  readonly root: THREE.Group;
  readonly physics: Physics;
  readonly blood: BloodSystem;
  readonly effects: Effects;
  readonly debris: Debris;
  readonly corpses: Corpses;
  readonly gore: Gore;
  readonly lights: LightPool;
  readonly shake: Shake;
  world: World | null;
  /** Presentation time (s), advances with update dt. */
  time: number;
  /** Interpolation factor of this frame. */
  alpha: number;
  /** This frame's dt. */
  dt: number;
  /** Blood option multiplier (0.4 / 1 / 1.8). */
  bloodK: number;
  /** env.lightRig.darkness (0 sunset … 1 night). */
  darkness: number;
}

export const BLOOD_K: Record<ViewOptions['blood'], number> = { low: 0.4, normal: 1, max: 1.8 };

export const clamp = (x: number, a: number, b: number) => (x < a ? a : x > b ? b : x);
export const lerp = (a: number, b: number, t: number) => a + (b - a) * t;
export const rand = (a: number, b: number) => a + Math.random() * (b - a);
