/** Name catalogues (all generated from the recipe registry, so they can never drift). */
import { LOOPS, SOUNDS } from './render';
import type { AudioCategory } from './types';

/** Every one-shot name accepted by `AudioEngine.play` (includes `block.<group>.<action>`). */
export const SOUND_NAMES: readonly string[] = Object.freeze(Object.keys(SOUNDS).sort());
/** Every loop name accepted by `AudioEngine.loop`. */
export const LOOP_NAMES: readonly string[] = Object.freeze(Object.keys(LOOPS).sort());
export const MUSIC_MODES = ['menu', 'overworld', 'creative', 'underwater', 'nether', 'end', 'off'] as const;
export const AUDIO_CATEGORIES = ['master', 'music', 'blocks', 'hostile', 'neutral', 'players', 'ambient', 'weather', 'ui'] as const satisfies readonly AudioCategory[];

export { SOUND_GROUPS, BLOCK_ACTIONS } from './recipes/blocks';
export { NOTE_INSTRUMENTS } from './recipes/world';

/** Mixer category of a sound or loop name (null if unknown). */
export function categoryOf(name: string): AudioCategory | null {
  return SOUNDS[name]?.cat ?? LOOPS[name]?.cat ?? null;
}

/** Number of pre-rendered variations of a sound (0 if unknown). */
export function variationsOf(name: string): number {
  return SOUNDS[name]?.n ?? 0;
}
