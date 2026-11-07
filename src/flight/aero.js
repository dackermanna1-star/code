// =============================================================================
// Simple but physically consistent 737-800 performance model: lift curve per
// flap setting (-> angle of attack -> pitch attitude), drag polar, derated
// CFM56-7B thrust vs N1, and a layered wind model. Pure JS.
// =============================================================================
import { DEG, G, KT } from '../core/constants.js';
import { RHO0, clamp, clamp01, table, lerp } from './fmath.js';

export const AERO = {
  S: 124.6,                       // wing reference area (m²)
  massTakeoff: 70500,             // kg
  massLanding: 63200,
  clAlpha0: 0.1,                  // lift-curve slope per degree at low Mach
  // zero-AoA lift coefficient (body reference) per flap detent
  cl0: [[0, 0.17], [1, 0.38], [5, 0.50], [15, 0.70], [25, 0.84], [30, 0.90], [40, 0.98]],
  cd0: 0.021,
  k: 0.045,                       // induced drag factor
  cdFlaps: [[0, 0], [1, 0.003], [5, 0.010], [15, 0.022], [25, 0.040], [30, 0.055], [40, 0.075]],
  cdGear: 0.020,
  cdSpeedbrake: 0.035,            // in-flight spoilers (per unit deployment)
  cdGroundSpoilers: 0.08,
  thrustTO: 165000,               // N, both engines at the (derated) takeoff N1 of 95 %
  mu: 0.015,                      // rolling friction
  idleFrac: 0.035,
};

/** Lift-curve slope per degree (Prandtl-Glauert). */
export const clAlpha = (mach) => { const m = Math.min(mach, 0.86); return AERO.clAlpha0 / Math.sqrt(1 - m * m); };
export const cl0 = (flapsDeg) => table(AERO.cl0, flapsDeg);
/** Angle of attack (deg) giving lift coefficient CL. Spoilers dump lift, so need more AoA. */
export const alphaFor = (CL, flapsDeg, mach, spoilers = 0) => (CL - cl0(flapsDeg) + 0.12 * spoilers) / clAlpha(mach);
export const clFor = (alphaDeg, flapsDeg, mach, spoilers = 0) => cl0(flapsDeg) - 0.12 * spoilers + clAlpha(mach) * alphaDeg;
export function cdFor(CL, flapsDeg, gear, spoilers, onGround) {
  return AERO.cd0 + table(AERO.cdFlaps, flapsDeg) + AERO.cdGear * gear +
    (onGround ? AERO.cdGroundSpoilers : AERO.cdSpeedbrake) * spoilers + AERO.k * CL * CL;
}
/** Fraction of takeoff thrust produced at N1 (per engine, 0..1+). */
export const thrustFrac = (n1) => AERO.idleFrac + (1 - AERO.idleFrac) * Math.pow(clamp01((n1 - 21) / 74), 1.6);
/** Thrust available scale (N, both engines) at density / Mach. */
export const thrustScale = (rho, mach) => AERO.thrustTO * (1 - 0.3 * mach) * Math.pow(rho / RHO0, 0.7);
/** Total thrust (N) of the engines array. Reverser: thrust acts backwards (≈ 45 % efficiency). */
export function engineThrust(engines, rho, mach, reverser = 0) {
  const sc = thrustScale(rho, mach) * 0.5;
  let T = 0;
  for (const e of engines) if (e.running || e.n1 > 15) T += sc * thrustFrac(e.n1) * (e.running ? 1 : 0.2);
  return T * (1 - reverser * 1.45);
}
/** N1 (%) needed for total thrust T (N). */
export function n1ForThrust(T, rho, mach) {
  const f = T / Math.max(1, thrustScale(rho, mach));
  return 21 + 74 * Math.pow(clamp01((f - AERO.idleFrac) / (1 - AERO.idleFrac)), 1 / 1.6);
}

// ----------------------------------------------------------------------------- wind
// Layered wind (direction it blows FROM, compass deg; speed m/s). Surface winds
// favour runway 09 at both airports (light crosswind from the left on departure,
// from the right on arrival); the jet-level wind is chosen so the cruise ground
// speed matches the captain's "about five hundred and ten miles per hour".
const WIND_LEVELS = [
  // [height m, dir, speed]
  [0, null, null],                 // surface (region dependent)
  [900, null, null],               // 3000 ft (region dependent)
  [3000, 300, 11],
  [7000, 330, 12],
  [11000, 10, 7.2],
];
const SURF = { departure: [[70, 3.6], [90, 7]], arrival: [[130, 4.6], [165, 7.5]] };
const vx = (dir, spd) => -Math.sin(dir * DEG) * spd;
const vz = (dir, spd) => Math.cos(dir * DEG) * spd;
// per level: [depX, depZ, arrX, arrZ] (identical for the upper, region-independent levels)
const LEVEL_VEC = WIND_LEVELS.map((L, i) => (i < 2
  ? [vx(SURF.departure[i][0], SURF.departure[i][1]), vz(SURF.departure[i][0], SURF.departure[i][1]),
    vx(SURF.arrival[i][0], SURF.arrival[i][1]), vz(SURF.arrival[i][0], SURF.arrival[i][1])]
  : [vx(L[1], L[2]), vz(L[1], L[2]), vx(L[1], L[2]), vz(L[1], L[2])]));
/**
 * Wind at height h (m). arrivalMix 0..1 blends the surface layers between the two airports.
 * Writes { wx, wz (world velocity the air moves with), dir (from, deg), speed (m/s) } into out.
 */
export function windInto(h, arrivalMix, out) {
  const n = WIND_LEVELS.length;
  let i = 0, t = 0;
  if (h <= 0) { i = 0; t = 0; }
  else if (h >= WIND_LEVELS[n - 1][0]) { i = n - 2; t = 1; }
  else {
    while (i < n - 2 && h > WIND_LEVELS[i + 1][0]) i++;
    t = (h - WIND_LEVELS[i][0]) / (WIND_LEVELS[i + 1][0] - WIND_LEVELS[i][0]);
  }
  const a = LEVEL_VEC[i], b = LEVEL_VEC[i + 1], m = arrivalMix;
  const ax = lerp(a[0], a[2], m), az = lerp(a[1], a[3], m), bx = lerp(b[0], b[2], m), bz = lerp(b[1], b[3], m);
  const wx = lerp(ax, bx, t), wz = lerp(az, bz, t);
  out.wx = wx; out.wz = wz;
  out.speed = Math.hypot(wx, wz);
  // from-direction: the air moves towards (wx, wz) -> it comes from the opposite bearing
  out.dir = out.speed > 0.01 ? (((Math.atan2(-wx, wz) / DEG) % 360) + 360) % 360 : 0;
  return out;
}

export const kt = (v) => v * KT;
export { G, clamp };
