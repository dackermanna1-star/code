import type { Engine } from '../core/Engine';
import type { Input } from '../core/Input';
import type { TimeControl } from '../core/Time';
import type { Physics } from '../physics/Physics';
import type * as THREE from 'three';
import type { FX } from '../fx/FX';
import type { PropSystem } from '../world/Props';
import type { Player } from '../player/Player';
import type { CombatSystem } from './CombatSystem';
import type { Scheduler } from '../core/Scheduler';

/**
 * Global service locator for game systems. Systems are assigned during
 * bootstrap (see Game.ts) so modules can reach each other without threading
 * references through every constructor. Only type imports here to avoid
 * runtime import cycles.
 */
export interface GameContext {
  engine: Engine;
  physics: Physics;
  input: Input;
  time: TimeControl;
  fx: FX;
  props: PropSystem;
  player: Player;
  combat: CombatSystem;
  /** game-time timers for the current round */
  timers: Scheduler;
  gibs?: { spawn(mesh: THREE.Mesh, half: THREE.Vector3, vel: THREE.Vector3, owner: unknown): void };
  weapons?: { dropFromCharacter(ch: unknown, item: unknown, vel?: THREE.Vector3): void };
  /** generic services added by later systems */
  services: Record<string, any>;
}

export const ctx = { services: {} } as unknown as GameContext;
