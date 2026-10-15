// STUB — replaced by the Vegetation agent.
import type { GameContext } from '../core/GameContext';

export async function installVegetation(ctx: GameContext): Promise<void> {
  ctx.vegetation = {
    foliageOcclusion: () => 0,
    treesNear: (_p, _r, out = []) => out,
  };
}
