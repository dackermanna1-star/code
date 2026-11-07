// =============================================================================
// Solar / lunar position for the fictional route (latitude ~36 N, mid-summer).
//
// Local clock hours -> apparent sun direction in the WORLD frame
// (+X east, -Z north, +Y up). Standard spherical-astronomy formulas with
// atmospheric refraction (Bennett). The local clock runs ~25 min behind solar
// time so that the 'sunset' preset (18.65 h) has the sun ~2 deg above the
// horizon and it sets around 18.85 h, as the flight director expects.
// =============================================================================

const DEG = Math.PI / 180;

export const SOLAR = {
  latitude: 36.2,
  dayOfYear: 172,          // June 21st
  solarOffsetHours: 0.42,  // solar time = local clock + offset
  moonElongationDeg: 132,  // waxing gibbous
  moonDeclinationDeg: -16,
};

export const TIME_PRESETS = { morning: 8.5, noon: 12.5, afternoon: 15.5, sunset: 18.65, night: 22.0 };

export function declinationDeg(dayOfYear = SOLAR.dayOfYear) {
  return 23.44 * Math.sin(2 * Math.PI * (284 + dayOfYear) / 365);
}

/** Bennett refraction (deg) for an apparent altitude given the true altitude (deg). */
function refractionDeg(altDeg) {
  if (altDeg < -2) return 0;
  const a = Math.max(-1.9, altDeg);
  return (1.02 / Math.tan((a + 10.3 / (a + 5.11)) * DEG)) / 60;
}

/**
 * Direction (unit, world) of a body at hour angle haDeg and declination decDeg.
 * Writes into `out` ({x,y,z}) and returns {elevationDeg, azimuthDeg}.
 */
function bodyDirection(haDeg, decDeg, latDeg, out, refract = true) {
  const H = haDeg * DEG, d = decDeg * DEG, phi = latDeg * DEG;
  const sinEl = Math.sin(phi) * Math.sin(d) + Math.cos(phi) * Math.cos(d) * Math.cos(H);
  let el = Math.asin(Math.max(-1, Math.min(1, sinEl))) / DEG;
  // azimuth from north, clockwise
  const azS = Math.atan2(Math.sin(H), Math.cos(H) * Math.sin(phi) - Math.tan(d) * Math.cos(phi));
  const az = (azS / DEG + 180 + 360) % 360;
  if (refract) el += refractionDeg(el);
  const ce = Math.cos(el * DEG);
  out.x = Math.sin(az * DEG) * ce;
  out.y = Math.sin(el * DEG);
  out.z = -Math.cos(az * DEG) * ce;
  return { elevationDeg: el, azimuthDeg: az };
}

/** Sun direction for local clock hours. */
export function sunPosition(localHours, out) {
  const solar = localHours + SOLAR.solarOffsetHours;
  const ha = (solar - 12) * 15;
  return bodyDirection(ha, declinationDeg(), SOLAR.latitude, out);
}

/** Moon direction (fixed phase relative to the sun) + illuminated fraction. */
export function moonPosition(localHours, out) {
  const solar = localHours + SOLAR.solarOffsetHours;
  const ha = (solar - 12) * 15 - SOLAR.moonElongationDeg * (1 - 1 / 29.53 * 0);   // the moon trails the sun
  const r = bodyDirection(ha, SOLAR.moonDeclinationDeg, SOLAR.latitude, out);
  r.phase = (1 - Math.cos(SOLAR.moonElongationDeg * DEG)) / 2;
  return r;
}

/** Hours (0..24) wrapped. */
export function wrapHours(h) { return ((h % 24) + 24) % 24; }
