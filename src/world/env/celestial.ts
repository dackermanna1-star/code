// Sun / moon positions for the island (≈ 50°N, mid-summer), in world axes: X = east, Y = up, -Z = north.

export const LATITUDE_DEG = 50;
/** Solar declination for mid June (degrees). */
export const DECLINATION_DEG = 22.5;

export interface Dir3 {
  x: number;
  y: number;
  z: number;
}

/** Unit vector toward the sun for local solar time `hours` (0..24). */
export function sunDirection(hours: number, out: Dir3): Dir3 {
  const lat = (LATITUDE_DEG * Math.PI) / 180;
  const dec = (DECLINATION_DEG * Math.PI) / 180;
  const H = ((hours - 12) / 24) * Math.PI * 2; // hour angle, + = afternoon (west)
  const sinEl = Math.sin(lat) * Math.sin(dec) + Math.cos(lat) * Math.cos(dec) * Math.cos(H);
  const el = Math.asin(Math.max(-1, Math.min(1, sinEl)));
  // azimuth from north, clockwise toward east
  const cosAz = (Math.sin(dec) - Math.sin(el) * Math.sin(lat)) / Math.max(1e-6, Math.cos(el) * Math.cos(lat));
  let az = Math.acos(Math.max(-1, Math.min(1, cosAz)));
  if (H > 0) az = Math.PI * 2 - az; // afternoon: sun in the west
  const ce = Math.cos(el);
  out.x = Math.sin(az) * ce;
  out.y = Math.sin(el);
  out.z = -Math.cos(az) * ce;
  return out;
}

/** Moon roughly opposite the sun but kept high in the night sky. */
export function moonDirection(hours: number, out: Dir3): Dir3 {
  const s = sunDirection((hours + 12) % 24, out);
  // lift and skew so the moon is a usable light source all night
  const y = Math.max(0.42, s.y + 0.25);
  const len = Math.hypot(s.x + 0.15, s.z - 0.1) || 1;
  const h = Math.sqrt(1 - y * y);
  out.x = ((s.x + 0.15) / len) * h;
  out.y = y;
  out.z = ((s.z - 0.1) / len) * h;
  return out;
}

const smooth = (a: number, b: number, v: number) => {
  const t = Math.max(0, Math.min(1, (v - a) / (b - a)));
  return t * t * (3 - 2 * t);
};

/** 0 = full day, 1 = full night, based on the sun elevation (sin). */
export function nightFactor(sunY: number): number {
  return smooth(0.06, -0.14, sunY);
}

/** Sunlight color (linear RGB, unscaled) for a sun elevation (sin). Reddens toward the horizon. */
export function sunColor(sunY: number, out: Dir3): Dir3 {
  const e = Math.max(0, sunY);
  // approximate atmospheric extinction (air mass) per channel
  const air = 1 / Math.max(0.035, e + 0.15 * Math.pow(Math.max(0.01, 93.885 - (Math.acos(Math.min(1, e)) * 180) / Math.PI), -1.253));
  out.x = Math.exp(-0.012 * air);
  out.y = Math.exp(-0.035 * air);
  out.z = Math.exp(-0.085 * air);
  const m = Math.max(out.x, out.y, out.z);
  out.x /= m;
  out.y /= m;
  out.z /= m;
  return out;
}
