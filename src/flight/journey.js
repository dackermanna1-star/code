// =============================================================================
// JOURNEY PRESENTATION — maps the (compressed) session onto the presented
// ~2 h 50 flight: presented clock, route fraction (moving map), sun clock
// (state.timeOfDay, drives the sun), fictional great-circle coordinates.
// Values are piecewise linear per phase in phaseProgress, so they are
// continuous across phase boundaries.
// =============================================================================
import { clamp01, greatCircle } from './fmath.js';

/** Fictional route: Cedar Bay (CBY) -> Port Solano (PSX), eastbound. */
export const ROUTE_GEO = { origin: { lat: 37.6, lon: -122.4 }, dest: { lat: 35.42, lon: -97.55 } };
export const ROUTE_KM = Math.round(greatCircle(ROUTE_GEO.origin.lat, ROUTE_GEO.origin.lon, ROUTE_GEO.dest.lat, ROUTE_GEO.dest.lon, 0.5, {}).distanceKm);

/** Presented hours since pushback at [phase start, phase end]. Airborne 0.20 -> 3.03 h ≈ 2 h 50. */
export const PRESENTED_H = {
  gate: [-0.40, 0], pushback: [0, 0.07], taxi_out: [0.07, 0.18], lineup: [0.18, 0.19], takeoff: [0.19, 0.20],
  climb: [0.20, 0.55], cruise: [0.55, 2.38], descent: [2.38, 2.86], approach: [2.86, 3.015], landing: [3.015, 3.04],
  taxi_in: [3.04, 3.16], arrived: [3.16, 3.16],
};
export const TAKEOFF_H = 0.195;
export const LANDING_H = 3.03;
/** Local civil time at pushback (both airports share a time zone): landing ≈ 18:45 ("a quarter to seven"). */
export const PUSHBACK_CIVIL = 15.72;

/** Sun clock (decimal hours, solar): 16:40 departure, approach in the sunset, taxi-in at dusk. */
export const SUN_CLOCK = {
  gate: [16.55, 16.67], pushback: [16.67, 16.70], taxi_out: [16.70, 16.78], lineup: [16.78, 16.79], takeoff: [16.79, 16.80],
  climb: [16.80, 17.05], cruise: [17.05, 18.0], descent: [18.0, 18.42], approach: [18.42, 18.60], landing: [18.60, 18.63],
  taxi_in: [18.63, 18.75], arrived: [18.75, 18.75],
};
/** Fraction of the great-circle route flown. */
export const ROUTE_FRACTION = {
  gate: [0, 0], pushback: [0, 0], taxi_out: [0, 0], lineup: [0, 0], takeoff: [0, 0.002],
  climb: [0.002, 0.10], cruise: [0.10, 0.86], descent: [0.86, 0.985], approach: [0.985, 0.999], landing: [0.999, 1],
  taxi_in: [1, 1], arrived: [1, 1],
};
/** Fixed choices of settings.timeOfDay (anything else = scripted). */
export const FIXED_TOD = { morning: 8.5, noon: 12.5, afternoon: 15.5, sunset: 18.55, night: 22.5 };

export function phaseValue(tab, phase, p) {
  const r = tab[phase] || tab.gate;
  return r[0] + (r[1] - r[0]) * clamp01(p);
}
