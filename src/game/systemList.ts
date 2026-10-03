/**
 * The list of game systems installed at startup. Feature modules add themselves here.
 */
import type { GameSystem } from './systems';
import { OverlaySystem } from './overlays';
import { CoreWorldSystem } from './coreWorld';
import { AudioGlueSystem } from './audioGlue';
import { ItemSystem } from './items/itemSystem';

export function createSystems(): GameSystem[] {
  return [new CoreWorldSystem(), new OverlaySystem(), new AudioGlueSystem(), new ItemSystem()];
}
