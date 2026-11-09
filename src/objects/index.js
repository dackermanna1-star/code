// Registry of level object types. To add a new obstacle, implement an Entity subclass and
// register it here; levels can then use B.add('<type>', {...}).

import { Spikes, Saw, Pendulum, Crusher, Mine, Barrel, Zapper } from './hazards.js';
import { HarpoonGun, Cannon } from './weapons.js';
import { Crate, Glass, Bridge, Seesaw, Dropper, MovingPlatform, CollapsePlatform, Ball } from './props.js';
import { Boost, LaunchPad, Checkpoint, Tooth, Finish, Sign } from './zones.js';

export const OBJECT_TYPES = {
  spikes: Spikes,
  saw: Saw,
  blade: Pendulum,
  wrecking: Pendulum,
  crusher: Crusher,
  mine: Mine,
  barrel: Barrel,
  zapper: Zapper,
  harpoon: HarpoonGun,
  cannon: Cannon,
  crate: Crate,
  glass: Glass,
  bridge: Bridge,
  seesaw: Seesaw,
  drop: Dropper,
  platform: MovingPlatform,
  collapse: CollapsePlatform,
  ball: Ball,
  tire: Ball,
  boost: Boost,
  pad: LaunchPad,
  checkpoint: Checkpoint,
  tooth: Tooth,
  finish: Finish,
  sign: Sign,
};

export function createObject(game, def) {
  const C = OBJECT_TYPES[def.type];
  if (!C) {
    console.warn('Unknown object type', def.type);
    return null;
  }
  return new C(game, def);
}
