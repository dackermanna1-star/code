/**
 * Pluggable game systems. Feature modules (survival, farming, redstone, mobs, physics,
 * particles, weather ...) implement GameSystem and are registered in `src/game/systemList.ts`.
 */
import type { Game } from './game';
import type { World } from '../world/world';

export interface GameSystem {
  readonly name: string;
  /** Called once after the game (and first world) is created. */
  init?(game: Game): void | Promise<void>;
  /** 20 TPS logic tick (after the world tick, before entity ticks). */
  tick?(game: Game): void;
  /** 60 Hz fixed physics step (after entity physics). */
  physics?(game: Game, dt: number): void;
  /** Per rendered frame (variable dt), before rendering. */
  update?(game: Game, dt: number, alpha: number): void;
  /** The active world/dimension changed. */
  onWorldChange?(game: Game, world: World): void;
  /** Save/load of system state (per world save). */
  save?(game: Game): any;
  load?(game: Game, data: any): void;
  dispose?(game: Game): void;
}
