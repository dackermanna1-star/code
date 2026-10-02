import * as THREE from 'three';
import { SUN_PATH_TILT_DEG } from './constants';

/**
 * Celestial geometry helpers.
 *
 * World convention: +X = east, -X = west, +Z = south, -Z = north, +Y = up.
 * The sun moves on a great circle through east (+X) and west (-X) whose noon point is tilted from
 * the zenith toward the south by `tiltDeg` (so noon shadows are not axis aligned):
 *   sunDir(t) = cos(a)·X + sin(a)·U,  U = (0, cos tilt, sin tilt),  a = 2π·ticks/24000
 * tick 0 = sunrise (east), 6000 = noon, 12000 = sunset (west), 18000 = midnight.
 * The moon is exactly opposite the sun (Minecraft); its phase only changes the lit fraction.
 */

const _X = new THREE.Vector3(1, 0, 0);

export interface CelestialState {
  sunDir: THREE.Vector3;
  moonDir: THREE.Vector3;
  /** Minecraft moon phase 0..7 (0 = full) for the given world tick count (day index % 8). */
  moonPhase: number;
}

/** Axis of the daily rotation (normal of the sun path, right-handed so X → U). */
export function sunPathAxis(tiltDeg = SUN_PATH_TILT_DEG, out = new THREE.Vector3()): THREE.Vector3 {
  const t = (tiltDeg * Math.PI) / 180;
  return out.set(0, -Math.sin(t), Math.cos(t));
}

/** Noon direction of the sun path. */
export function sunPathNoon(tiltDeg = SUN_PATH_TILT_DEG, out = new THREE.Vector3()): THREE.Vector3 {
  const t = (tiltDeg * Math.PI) / 180;
  return out.set(0, Math.cos(t), Math.sin(t));
}

/** Sun & moon directions for a world time in ticks (24000 per day). */
export function celestialFromTicks(ticks: number, tiltDeg = SUN_PATH_TILT_DEG, out?: CelestialState): CelestialState {
  const o = out ?? { sunDir: new THREE.Vector3(), moonDir: new THREE.Vector3(), moonPhase: 0 };
  const day = Math.floor(ticks / 24000);
  const a = (((ticks % 24000) + 24000) % 24000) / 24000 * Math.PI * 2;
  const U = sunPathNoon(tiltDeg);
  o.sunDir.copy(_X).multiplyScalar(Math.cos(a)).addScaledVector(U, Math.sin(a)).normalize();
  o.moonDir.copy(o.sunDir).negate();
  o.moonPhase = ((day % 8) + 8) % 8;
  return o;
}

/** Phase angle (Sun–Moon–Earth) in radians for a Minecraft moon phase, and whether it is waxing. */
export function moonPhaseAngle(phase: number): { alpha: number; waxing: boolean } {
  const p = ((Math.round(phase) % 8) + 8) % 8;
  const alpha = (p <= 4 ? p : 8 - p) * (Math.PI / 4);
  return { alpha, waxing: p >= 5 };
}

/**
 * Lambertian-sphere phase function normalised to 1 at full moon; scales moon illuminance.
 * (Real Moon is a bit more peaked; Lambert keeps quarter-moon nights readable.)
 */
export function moonPhaseFactor(phase: number): number {
  const { alpha } = moonPhaseAngle(phase);
  return Math.max(0, (Math.sin(alpha) + (Math.PI - alpha) * Math.cos(alpha)) / Math.PI);
}

/**
 * Direction of the sunlight that illuminates the moon's visible face (world space).
 * Full moon: light comes from behind the viewer (-moonDir). For other phases the light is rotated
 * by the phase angle along the moon's daily motion: waxing moons are lit on the side they move
 * toward (west), waning moons on the trailing (east) side.
 */
export function moonLightDirection(moonDir: THREE.Vector3, phase: number, tiltDeg = SUN_PATH_TILT_DEG, out = new THREE.Vector3()): THREE.Vector3 {
  const { alpha, waxing } = moonPhaseAngle(phase);
  const axis = sunPathAxis(tiltDeg);
  const T = new THREE.Vector3().crossVectors(axis, moonDir);
  if (T.lengthSq() < 1e-8) T.set(-1, 0, 0);
  T.normalize();
  if (!waxing) T.negate();
  return out.copy(moonDir).multiplyScalar(-Math.cos(alpha)).addScaledVector(T, Math.sin(alpha)).normalize();
}

/**
 * Rotation from world space into the (fixed) star frame: rotates the sky back by the sun's angle
 * along its path, so stars wheel around the path axis with the sun.
 */
export function starFrameRotation(sunDir: THREE.Vector3, tiltDeg = SUN_PATH_TILT_DEG, out = new THREE.Matrix3()): THREE.Matrix3 {
  const U = sunPathNoon(tiltDeg);
  const axis = sunPathAxis(tiltDeg);
  const angle = Math.atan2(sunDir.dot(U), sunDir.dot(_X));
  const m4 = new THREE.Matrix4().makeRotationAxis(axis, -angle);
  return out.setFromMatrix4(m4);
}
