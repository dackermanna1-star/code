// Creates the visual for a character: the skinned model when the library is loaded, else a placeholder
// that upgrades itself once the model arrives.
import type { GameContext } from '../../core/GameContext';
import type { Character } from '../Character';
import type { ICharacterVisual } from './types';
import { PlaceholderVisual } from './PlaceholderVisual';

export async function preloadCharacterAssets(_ctx: GameContext): Promise<void> {
  /* filled in by the animation library */
}

export function createVisual(c: Character): ICharacterVisual {
  return new PlaceholderVisual(c);
}
