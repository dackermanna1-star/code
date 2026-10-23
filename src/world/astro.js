import * as THREE from 'three';

// Sun and moon directions for the Erg Chebbi region (31.1 N) using standard solar
// geometry. World frame: +X east, +Y up, -Z north.

export const LATITUDE_DEG = 31.1;
export const LONGITUDE_DEG = -3.98;
const LAT = (LATITUDE_DEG * Math.PI) / 180;
const DAY_OF_YEAR = 290; // mid October: warm days, cool nights, low golden sun
const MOON_AGE_DAYS = 12.5; // waxing gibbous: rises in the east before sunset

function declination(day) {
  return ((-23.44 * Math.PI) / 180) * Math.cos(((2 * Math.PI) / 365) * (day + 10));
}

// Direction toward a body at hour angle H (radians, positive westward) and declination d.
function bodyDirection(H, d, out) {
  const east = -Math.cos(d) * Math.sin(H);
  const north = Math.cos(LAT) * Math.sin(d) - Math.sin(LAT) * Math.cos(d) * Math.cos(H);
  const up = Math.sin(LAT) * Math.sin(d) + Math.cos(LAT) * Math.cos(d) * Math.cos(H);
  return out.set(east, up, -north).normalize();
}

/** hours: local solar time in [0, 24). */
export function sunDirection(hours, out = new THREE.Vector3()) {
  const H = ((hours - 12) * 15 * Math.PI) / 180;
  return bodyDirection(H, declination(DAY_OF_YEAR), out);
}

export function moonDirection(hours, out = new THREE.Vector3()) {
  // The moon lags the sun by ~50.5 minutes per day of age.
  const lagHours = (MOON_AGE_DAYS * 50.5) / 60;
  const H = ((hours - 12 - lagHours) * 15 * Math.PI) / 180;
  // Near full, the moon sits roughly opposite the sun's declination.
  return bodyDirection(H, -declination(DAY_OF_YEAR) * 0.9 + 0.05, out);
}

/** Illuminated fraction of the moon for the configured age. */
export function moonPhaseFraction() {
  return 0.5 * (1 - Math.cos((2 * Math.PI * MOON_AGE_DAYS) / 29.53));
}

// World direction -> rotating celestial frame, for the star field.
const _basis = new THREE.Matrix3();
const _spin = new THREE.Matrix3();
export function starRotation(hours, out = new THREE.Matrix3()) {
  // Rows of the hour-angle frame expressed in world coordinates:
  // M: meridian point of the celestial equator, W: west, P: celestial north pole.
  const cl = Math.cos(LAT);
  const sl = Math.sin(LAT);
  // world (x=E, y=U, z=-N) -> components along M, W, P
  _basis.set(
    0, cl, sl, // M = -sin(lat) N + cos(lat) U  => N comp -sl -> world z comp +sl
    -1, 0, 0, // W = -E
    0, sl, -cl, // P = cos(lat) N + sin(lat) U => world z comp -cl
  );
  const lst = (hours / 24) * 2 * Math.PI;
  const c = Math.cos(lst);
  const s = Math.sin(lst);
  _spin.set(c, -s, 0, s, c, 0, 0, 0, 1);
  return out.multiplyMatrices(_spin, _basis);
}

/** Air temperature (C) for the HUD: hot afternoons, cold desert nights. */
export function airTemperature(hours, storm = 0) {
  // Minimum just before sunrise (~6h), maximum mid-afternoon (~15h).
  const t = ((hours - 15 + 24) % 24) / 24;
  const shape = Math.cos(2 * Math.PI * t) * 0.5 + 0.5;
  const skew = Math.pow(shape, 1.3);
  return 11 + 23 * skew - 4 * storm;
}
