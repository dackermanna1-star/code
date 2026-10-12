// First-person mode: shared constants and the aim convention.
//
// Aim angles (radians):
//   yaw   = heading on the ice. 0 looks along -x (left, the direction the
//           original hunter always faces); positive yaw turns towards +z
//           (towards the classic camera), so yaw = PI/2 looks at +z and
//           yaw = PI looks right (+x, where creatures escape).
//   pitch = elevation; positive looks up, negative looks down at the ice.
// Direction vector: (-cos(yaw)cos(pitch), sin(pitch), sin(yaw)cos(pitch)).
// This matches Combat's existing lane-trace convention (zRay = z + run*tan(yaw)).

export type ViewMode = 'third' | 'first';

export interface Aim {
  yaw: number;
  pitch: number;
}

export const FP = {
  /** Eye (camera and bullet origin) height above the hunter's feet, m. Hunter is 1.5 m tall. */
  eyeHeight: 1.36,
  /** Vertical field of view, degrees. */
  fovDeg: 72,
  /** Pitch limits, radians. */
  pitchMin: -1.25,
  pitchMax: 0.8,
  /** Radians per CSS px of mouse movement at sensitivity 1. */
  mouseRadPerPx: 0.0024,
  /** Radians per second at full gamepad stick deflection (sensitivity 1). */
  stickRadPerSec: 3.2,
  /** Camera near / far planes. */
  near: 0.05,
  far: 4000,
} as const;

/** Unit aim direction for the convention above. */
export function aimDir(aim: Aim, out = { x: 0, y: 0, z: 0 }): { x: number; y: number; z: number } {
  const cp = Math.cos(aim.pitch);
  out.x = -Math.cos(aim.yaw) * cp;
  out.y = Math.sin(aim.pitch);
  out.z = Math.sin(aim.yaw) * cp;
  return out;
}

/** Wrap an angle to (-PI, PI]. */
export function wrapAngle(a: number): number {
  a = (a + Math.PI) % (2 * Math.PI);
  if (a < 0) a += 2 * Math.PI;
  return a - Math.PI;
}
