// Public surface of the Last Ferry game logic (pure, deterministic, 50 Hz).
export { World, HUNTER_START, SPLASH_TICKS, BETWEEN_TICKS, type WorldOptions, type SpawnOpts, type GameOverInfo } from './World';
export { Bot, BOT_BUY_LIST, laneFor, type BotOptions } from './Bot';
export { Player, emptyInput, type PlayerInput, type PlayerStats } from './Player';
export { Weapon } from './Weapon';
export { Zombie, type HitShape, type DamageInfo, type DamageSource, type SilhouetteHit } from './Zombie';
export { Shambler, Jogger, Bloater, Medic, Patient, Riot, BigDave, Crawler, Stretcher, createZombie } from './zombies';
export { Corpse, CorpseField } from './Corpses';
export { GasCloud, FireZone, Hazards } from './Hazards';
export { Combat, Projectile } from './Combat';
export { Pier } from './Pier';
export { Chapter } from './Chapter';
export { Rng } from './Rng';
export { EventBus, type GameEvents, type EventName, type V3, type BulletPath } from './events';
export type * from './api';
