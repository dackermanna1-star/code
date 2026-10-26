// Behavior dispatcher. Each item definition has `use: { type, ... }` and the
// matching handler below gives it actions, animations and effects.
//
// Handler interface (all optional):
//   init(inst) / dispose(inst)            model built / destroyed (create lights, sounds...)
//   onEnterWorld / onLeaveWorld / onHold / onUnhold (inst)
//   held(inst) -> [actions]               actions while held (LMB, R, ...)
//   world(inst) -> [actions]              actions when aimed at in the world (E, F, R ...)
//   sink(inst, sink) -> action|null       special action when aiming at a sink while holding it
//   update(inst, dt)                      per-frame while in world/hand
//   subtitle(inst) -> string              extra info in the prompt
import { G } from '../../game.js';
import { consumables } from './consumables.js';
import { home } from './home.js';
import { tech } from './tech.js';
import { toys } from './toys.js';
import { hobby } from './hobby.js';
import { kitchen } from './kitchen.js';
import { findOwned, consumeUse, usesLeft } from './util.js';

export const HANDLERS = { ...consumables, ...home, ...tech, ...toys, ...hobby, ...kitchen };

export function registerBehaviors(map) { Object.assign(HANDLERS, map); }

function h(inst) { return HANDLERS[inst.def.use?.type] || null; }
function call(inst, fn, ...args) {
  const handler = h(inst);
  if (!handler || !handler[fn]) return undefined;
  try { return handler[fn](inst, ...args); } catch (e) { console.error(`behavior ${inst.def.use?.type}.${fn}`, e); return undefined; }
}

export const behaviors = {
  init: (inst) => call(inst, 'init'),
  dispose: (inst) => call(inst, 'dispose'),
  onEnterWorld: (inst) => call(inst, 'onEnterWorld'),
  onLeaveWorld: (inst) => call(inst, 'onLeaveWorld'),
  onHold: (inst) => call(inst, 'onHold'),
  onUnhold: (inst) => call(inst, 'onUnhold'),
  heldActions: (inst) => call(inst, 'held') || [],
  worldActions: (inst) => call(inst, 'world') || [],
  containerActions: (inst) => call(inst, 'container') || [],
  sinkAction: (inst, sink) => call(inst, 'sink', sink) || null,
  update: (inst, dt) => call(inst, 'update', dt),
  subtitle: (inst) => call(inst, 'subtitle') || '',
  consumeUse,
  usesLeft,
};
export { findOwned };
