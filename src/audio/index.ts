// STUB — replaced by the Audio agent.
import type { GameContext } from '../core/GameContext';
import type { IAudio, SoundHandle } from '../core/contracts';

export async function installAudio(ctx: GameContext): Promise<void> {
  const silent: SoundHandle = { stop() {}, setVolume() {}, setPitch() {}, setPosition() {}, playing: false };
  const audio: IAudio = { play: () => silent, unlock() {}, ready: false };
  ctx.audio = audio;
}
