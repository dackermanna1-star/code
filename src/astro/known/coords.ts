/**
 * Astronomical frame conversions (J2000).
 *   equatorial (RA/Dec) ⇄ ecliptic ⇄ galactic (IAU 1958/J2000 matrix)
 * and the engine's Y-up frames: for any right-handed (x, y, z-north) frame
 * the engine uses (x, z, −y).
 */
import { Matrix3, Matrix4, Quaternion, Vector3 } from 'three';

const DEG = Math.PI / 180;
export const OBLIQUITY = 23.43928 * DEG;

// rows: galactic x (→ GC), y (→ l=90°), z (→ NGP) in equatorial components
const EQ_TO_GAL = new Matrix3().set(
  -0.0548755604, -0.8734370902, -0.4838350155,
  0.4941094279, -0.44482963, 0.7469822445,
  -0.867666149, -0.1980763734, 0.4559837762,
);

/** Unit vector (standard z-north) from RA/Dec in degrees. */
export function radecToVec(raDeg: number, decDeg: number, out = new Vector3()): Vector3 {
  const ra = raDeg * DEG, dec = decDeg * DEG;
  return out.set(Math.cos(dec) * Math.cos(ra), Math.cos(dec) * Math.sin(ra), Math.sin(dec));
}

export function eqToGal(v: Vector3): Vector3 {
  return v.applyMatrix3(EQ_TO_GAL);
}

export function eclToEq(v: Vector3): Vector3 {
  const c = Math.cos(OBLIQUITY), s = Math.sin(OBLIQUITY);
  return v.set(v.x, v.y * c - v.z * s, v.y * s + v.z * c);
}

export function eqToEcl(v: Vector3): Vector3 {
  const c = Math.cos(OBLIQUITY), s = Math.sin(OBLIQUITY);
  return v.set(v.x, v.y * c + v.z * s, -v.y * s + v.z * c);
}

/** standard (x, y, z-north) → engine Y-up (x, z, −y) */
export function toYUp(v: Vector3): Vector3 {
  return v.set(v.x, v.z, -v.y);
}
export function fromYUp(v: Vector3): Vector3 {
  return v.set(v.x, -v.z, v.y);
}

/** Galactic (l, b, distance) → Milky-Way engine frame offset from the Sun. */
export function galacticDir(lDeg: number, bDeg: number, out = new Vector3()): Vector3 {
  const l = lDeg * DEG, b = bDeg * DEG;
  return toYUp(out.set(Math.cos(b) * Math.cos(l), Math.cos(b) * Math.sin(l), Math.sin(b)));
}

/** Equatorial RA/Dec → direction in the Milky-Way engine frame. */
export function radecToGalaxyDir(raDeg: number, decDeg: number, out = new Vector3()): Vector3 {
  return toYUp(eqToGal(radecToVec(raDeg, decDeg, out)));
}

/** Rotation taking Solar-System engine frame (ecliptic, Y-up) into the Milky-Way engine frame. */
export function eclipticToGalaxyQuat(): Quaternion {
  const cols: Vector3[] = [];
  // images of the engine basis vectors
  for (const e of [new Vector3(1, 0, 0), new Vector3(0, 1, 0), new Vector3(0, 0, 1)]) {
    const v = fromYUp(e.clone());
    eclToEq(v);
    eqToGal(v);
    cols.push(toYUp(v));
  }
  const m = new Matrix4().makeBasis(cols[0], cols[1], cols[2]);
  return new Quaternion().setFromRotationMatrix(m);
}

/**
 * Pole orientation (tilt from the ecliptic north, azimuth) for an IAU pole
 * RA/Dec, in the convention of Body.poleQ (rotation of +Y about the axis
 * (cos az, 0, sin az) by tilt).
 */
export function poleFromRaDec(raDeg: number, decDeg: number): { tilt: number; az: number } {
  const v = toYUp(eqToEcl(radecToVec(raDeg, decDeg)));
  const tilt = Math.acos(Math.max(-1, Math.min(1, v.y)));
  const s = Math.sin(tilt);
  const az = s < 1e-9 ? 0 : Math.atan2(-v.x / s, v.z / s);
  return { tilt, az };
}
