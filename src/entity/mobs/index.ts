/**
 * Mob registry: registers every mob entity type and the items they use.
 */
import { registerEntity } from '../manager';
import { Zombie, Skeleton, Creeper, Spider } from './monster';
import { Cow, Pig, Sheep, Chicken } from './passive';
import { ensureMobItems } from './items';

ensureMobItems();
registerEntity('zombie', Zombie, 'monster');
registerEntity('skeleton', Skeleton, 'monster');
registerEntity('creeper', Creeper, 'monster');
registerEntity('spider', Spider, 'monster');
registerEntity('cow', Cow, 'creature');
registerEntity('pig', Pig, 'creature');
registerEntity('sheep', Sheep, 'creature');
registerEntity('chicken', Chicken, 'creature');

export const MONSTERS = ['zombie', 'skeleton', 'creeper', 'spider'];
export const CREATURES = ['cow', 'pig', 'sheep', 'chicken'];
export { Zombie, Skeleton, Creeper, Spider, Cow, Pig, Sheep, Chicken };
