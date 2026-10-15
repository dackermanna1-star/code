// Creates the visual for a character. The shared CharacterLibrary loads models/clips once; each
// CharacterVisual shows a placeholder until the library is ready, then builds its skinned model.
import type { GameContext } from '../../core/GameContext';
import type { Character } from '../Character';
import type { ICharacterVisual } from './types';
import { characterLibrary } from './CharacterLibrary';
import { CharacterVisual } from './CharacterVisual';

export function preloadCharacterAssets(ctx: GameContext): Promise<void> {
  return characterLibrary.load(ctx);
}

export function createVisual(c: Character): ICharacterVisual {
  return new CharacterVisual(c, characterLibrary);
}

export { characterLibrary };
