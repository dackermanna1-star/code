// Public API of the public-buildings package. Layout packages import from here:
//   import { placeShop, placeKiosk, ... } from '../public/api.js'
// Every helper takes (ctx, opts) with opts.x / opts.z (meters, centre of the footprint unless
// stated), opts.rot (quarter turns; the building's front/entrance faces north at rot 0, west at
// rot 1, south at rot 2, east at rot 3) or opts.angle (radians), and opts.seed.
// See docs/catalog/public.md for sizes, pivots and examples.

export { placeShop, SHOP_DIMS } from './shop.js'
export { placeKiosk, KIOSK_TYPES, KIOSK_DIMS } from './kiosk.js'
export { placePharmacy, PHARMACY_DIMS } from './pharmacy.js'
export { placeSchool, SCHOOL_DIMS } from './school.js'
export { Frame } from './lib.js'
