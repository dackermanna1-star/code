import type * as THREE from 'three';
import type { Engine } from '../core/Engine';
import type { CameraRig } from '../core/CameraRig';
import type { Input } from '../core/Input';
import type { FoodKit } from '../food/FoodKit';
import type { Particles } from '../fx/Particles';
import type { Restaurant } from '../world/Restaurant';
import type { CustomerManager } from './CustomerManager';
import type { OrderBook } from './OrderBook';
import type { AudioEngine } from '../audio/AudioEngine';
import type { UI } from '../ui/UI';
import type { Progression } from './Progression';
import type { Warmer } from '../stations/Warmer';

export type StationId = 'order' | 'grill' | 'build' | 'serve';

export interface GameContext {
  engine: Engine;
  scene: THREE.Scene;
  rig: CameraRig;
  input: Input;
  food: FoodKit;
  fx: Particles;
  world: Restaurant;
  customers: CustomerManager;
  orders: OrderBook;
  audio: AudioEngine;
  ui: UI;
  progress: Progression;
  warmer: Warmer;
  /** game-time seconds since the day started */
  now(): number;
  station: StationId;
  goStation(id: StationId): void;
  /** true while a scripted sequence owns the camera / input */
  busy: boolean;
  haptic(ms?: number): void;
}
