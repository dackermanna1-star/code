// STUB — replaced by the Buildings agent.
import type { GameContext } from '../core/GameContext';
import type { IBuildings } from '../core/contracts';

export async function installBuildings(ctx: GameContext): Promise<void> {
  const b: IBuildings = {
    buildings: [],
    getLootSpawnPoints: () => [],
    getDoors: () => [],
    getDoorsNear: () => [],
    getNavGraph: () => ({ nodes: [], edges: [] }),
    buildingAt: () => null,
    isIndoors: () => false,
  };
  ctx.buildings = b;
}
