import * as THREE from 'three';

/** Minecraft celestial angle (0 = noon) with its day-lengthening smoothing. */
export function celestialAngle(dayTime: number): number {
  let f = dayTime / 24000 - 0.25;
  f -= Math.floor(f);
  const g = f;
  f = 1 - (Math.cos(f * Math.PI) + 1) / 2;
  return g + (f - g) / 3;
}

const TILT = THREE.MathUtils.degToRad(18);

/** Direction toward the sun for a day time (ticks, 0 = sunrise). */
export function sunDirection(dayTime: number, out = new THREE.Vector3()): THREE.Vector3 {
  const a = celestialAngle(dayTime) * Math.PI * 2;
  const x = -Math.sin(a), y = Math.cos(a);
  return out.set(x, y * Math.cos(TILT), y * Math.sin(TILT)).normalize();
}

/** Sky brightness factor used for mob spawning/daylight sensors (0 night .. 1 day). */
export function skyDarken(dayTime: number, rain: number, thunder: number): number {
  const a = celestialAngle(dayTime);
  let f = 1 - (Math.cos(a * Math.PI * 2) * 2 + 0.5);
  f = Math.min(1, Math.max(0, f));
  f = 1 - f;
  f *= 1 - rain * 5 / 16;
  f *= 1 - thunder * 5 / 16;
  return f;
}

export function moonPhase(totalTicks: number): number {
  return Math.floor(totalTicks / 24000) % 8;
}
