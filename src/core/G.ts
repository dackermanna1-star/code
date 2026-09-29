import type * as THREE from 'three';
import type { GameRenderer } from '../render/Renderer';
import type { Physics } from '../physics/Physics';
import type { Input } from './Input';
import type { Atmosphere } from '../world/Atmosphere';
import type { Environment } from '../world/Environment';

/**
 * Global game context. Systems register themselves here during boot so that
 * gameplay code can reach any system without threading references around.
 */
export interface Ctx {
  time: number;
  dt: number;
  frame: number;
  renderer: GameRenderer;
  scene: THREE.Scene;
  camera: THREE.PerspectiveCamera;
  vmScene: THREE.Scene;
  vmCamera: THREE.PerspectiveCamera;
  physics: Physics;
  input: Input;
  atmosphere: Atmosphere;
  env: Environment;
  // Late-bound systems (typed as any-shaped to avoid import cycles; see their modules)
  [key: string]: any;
}

export const G = { time: 0, dt: 0, frame: 0 } as Ctx;
