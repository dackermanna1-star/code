/**
 * Survival mechanics: hunger & eating, status effect visuals, death drops, XP orbs, farming,
 * beds, Nether/End portals. `createSurvivalSystems()` is called from systemList.ts.
 */
import './items';
import type { GameSystem } from '../systems';
import type { Game } from '../game';
import { SurvivalSystem } from './survivalSystem';
import { XpSystem } from './xp';
import { BedSystem } from './beds';
import { PortalSystem } from './portals';
import { installFarming } from './farming';

class FarmingSystem implements GameSystem {
  readonly name = 'farming';
  init(_game: Game) {
    installFarming();
  }
}

export function createSurvivalSystems(): GameSystem[] {
  return [new SurvivalSystem(), new XpSystem(), new FarmingSystem(), new BedSystem(), new PortalSystem()];
}

export { screenFx } from './survivalSystem';
export { explode, explodeFallback } from './explosion';
export { spawnXpOrbs, XpOrb } from './xp';
export { applyBoneMeal, growSapling, placeTree, cropGrowthSpeed, cropGrowthChance } from './farming';
export { tryLightPortal, buildPortal, buildEndPlatform } from './portals';
export * from './food';
