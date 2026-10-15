// STUB — replaced by the FX agent.
import type { GameContext } from '../core/GameContext';
import type { IEffects } from '../core/contracts';

export async function installFx(ctx: GameContext): Promise<void> {
  const noop = () => {};
  const fx: IEffects = {
    muzzleFlash: noop, tracer: noop, impact: noop, blood: noop, bulletHole: noop, explosion: noop,
    smokeCloud: noop, fire: noop, waterSplash: noop, dust: noop, shellEject: noop, flashbang: noop,
  };
  ctx.fx = fx;
}
