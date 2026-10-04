/**
 * The list of game systems installed at startup. Feature modules add themselves here.
 */
import type { GameSystem } from './systems';
import { OverlaySystem } from './overlays';
import { CoreWorldSystem } from './coreWorld';
import { AudioGlueSystem } from './audioGlue';
import { ContainerSystem } from './containers/system';
import { ItemSystem } from './items/itemSystem';
import { MobSpawningSystem } from './spawning';
import { PhysicsSystem } from '../physics/system';
import { ExplosionSystem } from './explosions';
import { RagdollSystem } from '../physics/ragdoll';
import { FxSystem } from './fxGlue';
import { GoreSystem } from './gore/system';
import { WeatherSystem } from './weather';
import { createSurvivalSystems } from './survival';
import { SaveSystem } from './saves';
import { LandmarkSystem } from './landmarks';
import { DisasterSystem } from './disasters/system';
import { HeliSystem } from './vehicles/heliSystem';
import { TankSystem } from './vehicles/tankSystem';
import { PortalSystem } from './portal/portalSystem';

export function createSystems(): GameSystem[] {
  return [
    new CoreWorldSystem(),
    new OverlaySystem(),
    new AudioGlueSystem(),
    new ContainerSystem(),
    new ItemSystem(),
    new MobSpawningSystem(),
    new PhysicsSystem(),
    new ExplosionSystem(),
    new RagdollSystem(),
    new FxSystem(),
    new GoreSystem(),
    new WeatherSystem(),
    ...createSurvivalSystems(),
    new LandmarkSystem(),
    new DisasterSystem(),
    new HeliSystem(),
    new TankSystem(),
    new PortalSystem(),
    new SaveSystem(),
  ];
}
