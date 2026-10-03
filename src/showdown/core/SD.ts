import type * as THREE from 'three';
import type { Input } from '../../core/Input';
import type { Physics } from '../../physics/Physics';
import type { SRenderer } from '../render/SRenderer';
import type { City } from '../world/City';

/** Showdown context: systems register here during boot. */
export interface SDCtx {
  time: number;
  dt: number;
  frame: number;
  /** Simulation speed (slow motion, hit-stop). */
  timeScale: number;
  renderer: SRenderer;
  scene: THREE.Scene;
  camera: THREE.PerspectiveCamera;
  vmScene: THREE.Scene;
  vmCamera: THREE.PerspectiveCamera;
  physics: Physics;
  input: Input;
  city: City;
  [key: string]: any;
}

export const SD = { time: 0, dt: 0, frame: 0, timeScale: 1 } as SDCtx;
