// STUB — replaced by the AI agent.
import type { GameContext } from '../core/GameContext';

export async function installAI(ctx: GameContext): Promise<void> {
  ctx.ai = { addBot() {}, removeBot() {}, debugInfo: () => null };
}
