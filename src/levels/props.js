// Static prop library for the Dead Center levels (procedural, PS1-style).
//
// Every prop is `fn(L, x, y, z, rotY = 0, opts = {})`: it emits geometry into the
// LevelBuilder with its base at (x,y,z), local +Z (the prop's front) rotated by rotY,
// and returns an object with anchor points in world coordinates (e.g. {topY},
// {fuelCap:[x,y,z]}, {bottom, top}).
//
// Common opts understood by every prop:
//   seed      - deterministic variation (defaults to a hash of the position)
//   scale     - uniform scale
//   collide   - false: purely decorative (no collision / nav obstacle)
// Many props also take opts.color (hex tint) and opts.variant; lamps take opts.light === false.
//
// Mounting conventions (see PROP_MOUNT): 'wall' props have their back on the wall plane at
// local z = 0 with (x,y,z) at floor level; 'ceiling' props take y = ceiling height and hang down;
// 'facade' props (store_front, security_gate, food_court_counter) sit in a wall opening on the z = 0 plane.
import { VEHICLES } from './props/vehicles.js';
import { STREET, STREET_MOUNT } from './props/street.js';
import { HOTEL, HOTEL_MOUNT } from './props/hotel.js';
import { MALL, MALL_MOUNT } from './props/mall.js';
import { SIGNS, SIGNS_MOUNT } from './props/signage.js';

export { mats as registerPropMaterials } from './props/kit.js';

export const PROP_CATEGORIES = {
  vehicles: Object.keys(VEHICLES),
  street: Object.keys(STREET),
  hotel: Object.keys(HOTEL),
  mall: Object.keys(MALL),
  signs: Object.keys(SIGNS),
};

export const PROPS = { ...VEHICLES, ...STREET, ...HOTEL, ...MALL, ...SIGNS };

/** How a prop is mounted: 'floor' (default), 'wall', 'ceiling' or 'facade' (self-contained wall piece placed in an opening). */
export const PROP_MOUNT = { ...STREET_MOUNT, ...HOTEL_MOUNT, ...MALL_MOUNT, ...SIGNS_MOUNT };

/** Dispatch by name. */
export function prop(L, name, x, y, z, rotY = 0, opts = {}) {
  const f = PROPS[name];
  if (!f) throw new Error('Unknown prop ' + name);
  return f(L, x, y, z, rotY, opts);
}
