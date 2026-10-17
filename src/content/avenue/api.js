// Public helpers/constants of the avenue package (geometry for other packages).
//   import { AVENUE_GEO } from '../avenue/api.js'
import { Z, LANES_W, LANES_E, PERIOD, STOP_N, STOP_S, ZEBRA, TERM, METRO, NAV_N, NAV_S, WALK_LAMPS, stations } from './layout.js'

export const AVENUE_GEO = Object.freeze({ Z, LANES_W, LANES_E, PERIOD, STOP_N, STOP_S, ZEBRA, TERM, METRO, NAV_N, NAV_S, WALK_LAMPS })
/** x of every median lamp / trolley station (0, 37, …, 629). */
export const AVENUE_STATIONS = stations()
