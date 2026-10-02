/**
 * Core world mechanics that are always on: fluids, gravity blocks, falling block spawning,
 * player death handling, item breaking sounds hooks.
 */
import type { Game } from './game';
import type { GameSystem } from './systems';
import { installFluids } from '../world/fluids';
import { installGravityBlocks, gravityHooks, FallingBlockEntity } from '../entity/fallingBlock';

export class CoreWorldSystem implements GameSystem {
  readonly name = 'coreWorld';
  init(game: Game) {
    installFluids();
    installGravityBlocks();
    gravityHooks.spawn = (w, x, y, z, state) => {
      if (w !== game.world) return;
      const e = new FallingBlockEntity(state);
      e.setPos(x + 0.5, y, z + 0.5);
      game.entities.add(e);
    };
  }
}
