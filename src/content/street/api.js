// Public API of the street package (street furniture & courtyard props library).
// Layout packages import from here; build() of the street package itself places nothing.
//
//   import { placeStreetLamp, placeBench, placePlayground } from '../street/api.js'
//
// Angle convention for every helper: a model's FRONT is its local +Z and faces direction
// (sin angle, cos angle) — the same convention as signs.add({angle}). angle 0 → front faces
// south (+z), π/2 → east (+x), π → north, −π/2 → west. See docs/catalog/street.md.

export { placeStreetLamp, placeLampRow, SODIUM_COLOR, MERCURY_COLOR } from './lamps.js'
export { placeBench, addSeat, BENCH_TYPES } from './seating.js'
export {
  placePlayground, placeSwing, placeCarousel, placeRocketSlide, placeClimbingDome, placeBars, placeLadder,
  placeMonkeyBars, placeSeesaw, placeSandbox, placePlayhouse, placeTyrePlanter, placeTyreSwan, placeCarpetRack,
  TYRE_TINTS, RACK_TINTS,
} from './playground.js'
export {
  placeGarbageArea, placeContainer, placeLitterBin, placeTrashBag, placeTrashBox, placeDiscardedTree, placeBrokenChair,
  CONTAINER_TINTS,
} from './waste.js'
export { placeRakushka, placeRakushkaRow, RAKUSHKA_TINTS } from './garages.js'
export { placeFence, FENCE_TYPES } from './fences.js'
export { placeBusStop, placeStopPole, placeTrolleyLine, placeRoadSign, placeTrafficLight, PAVILION_TINTS } from './transit.js'
export {
  placePayphone, placePaymentTerminal, placeVendingMachine, placeMailbox, placeHeatPipe, placeHeatPipeGate, placeManhole,
  placeElectricalCabinet, placeBollards, placeBillboard, placeAdColumn, placeNoticeBoard,
} from './utilities.js'
export { addPoleFlyer, drawPoster, drawNotice, drawFlyer, drawRoadSign, drawGraffiti, GRAFFITI, signLocal } from './signs.js'
export { FLYERS, NOTICES, POSTERS, LOST_DOG, PLATES, TIMETABLE, TICKET } from './texts.js'
export { rotXZ, localToWorld, angleAlong, angleFacing } from './lib.js'
