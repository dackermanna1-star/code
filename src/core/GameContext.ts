// The global service registry. Every subsystem is reached through `ctx`.
// Systems are installed in src/game/Game.ts (installX functions in each module's index.ts).
import type * as THREE from 'three';
import type { Engine } from './Engine';
import type { EventBus } from './EventBus';
import type { Input } from './Input';
import type { Settings } from './Settings';
import type { Assets } from './Assets';
import type { Physics } from './Physics';
import type { InteractionRegistry } from './Interactions';
import type {
  IAI,
  IAudio,
  IBuildings,
  ICharacter,
  ICharacters,
  ICameraRig,
  ICombat,
  IEffects,
  IEnvironment,
  IItems,
  IMatch,
  IUI,
  IVegetation,
  IVehicles,
  IWorld,
  IZone,
} from './contracts';

export interface GameContext {
  engine: Engine;
  events: EventBus;
  input: Input;
  settings: Settings;
  assets: Assets;
  physics: Physics;
  interactions: InteractionRegistry;
  /** Main gameplay camera (owned by Engine, driven by the camera controller). */
  camera: THREE.PerspectiveCamera;
  scene: THREE.Scene;

  world: IWorld;
  environment: IEnvironment;
  buildings: IBuildings;
  vegetation: IVegetation;
  characters: ICharacters;
  items: IItems;
  combat: ICombat;
  vehicles: IVehicles;
  zone: IZone;
  match: IMatch;
  ai: IAI;
  audio: IAudio;
  fx: IEffects;
  ui: IUI;
  cameraRig: ICameraRig;

  /** The local player's character, once spawned. */
  player: ICharacter | null;
  /** URL query flags (e.g. ?quick=1&seed=42&debug=1). */
  flags: URLSearchParams;
}

/** Global context singleton. Members are assigned during install; do not access before 'game:ready'. */
export const ctx = { player: null } as unknown as GameContext;
