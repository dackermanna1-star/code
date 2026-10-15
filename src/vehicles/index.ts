// STUB — replaced by the Vehicles agent.
import type { GameContext } from '../core/GameContext';

export async function installVehicles(ctx: GameContext): Promise<void> {
  ctx.vehicles = {
    spawnAll() {},
    spawn: () => { throw new Error('vehicles stub'); },
    all: () => [],
    nearest: () => null,
    byCollider: () => null,
  };
}
