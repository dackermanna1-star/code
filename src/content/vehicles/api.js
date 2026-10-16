// Public API of the vehicles package (see docs/catalog/vehicles.md).
//
//   import { placeParkedCar, parkRow, placeParkedBus } from '../vehicles/api.js'
//
// Call the placement helpers from build(): plates are static signs and buried cars reshape the
// terrain, both of which are frozen once the world is finalized.

export { placeParkedCar, parkRow, placeParkedBus, PARK_MIX, SNOW_MIX } from './parked.js'
export { carModelName, CAR_INFO, CAR_TYPES } from './cars.js'
export { BIG_INFO } from './big.js'
export { TRAIN, TRAIN_PITCH } from './train.js'
export { CAR_COLORS, CAR_PALETTE, TYPE_PALETTE } from './palette.js'
export { AVENUE, SPAWN_STOP } from './traffic.js'
export { RAILWAY } from './rail.js'
export { makePlate, plateString, drawPlate, drawRouteBoard, ROUTES, ROUTE_EN } from './plates.js'
