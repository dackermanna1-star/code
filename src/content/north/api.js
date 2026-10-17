// Public API of the north layout package (park, ул. Заводская, industrial edge, railway).
// Other packages may read the geometry to line up with it:
//   import { RAIL, ROAD, PARK, GATES, PLATFORM, CROSSING } from '../north/api.js'
// Runtime state is also published as ctx.registry.north / ctx.registry.railway.

export {
  ROAD, WALK, VERGE, PARK, FENCE, GATES, POND, MEMORIAL, CAFE, BANDSTAND, PLAYGROUND,
  RAIL, PLATFORM, CROSSING, GSK, BOILER, WAREHOUSE, SUBSTATION, PYLONS, STOP, HEAT,
} from './layout.js'
export { ALLEYS, alleyDist } from './park.js'
export { signal as crossingSignal } from './railway.js'
