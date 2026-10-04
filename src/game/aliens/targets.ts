/** The running alien invasion (if any), for weapons that want to shoot at it. */
export interface AlienTargets {
  /** Hit along a ray; with `cone` > 0 a ship within that many radians of the aim is hit if the ray misses. */
  rayHit(o: import('three').Vector3, d: import('three').Vector3, maxT: number, dmg: number, cone?: number): { t: number; what: 'ship' | 'mother' | null; at?: import('three').Vector3 };
  /** The ship the aim assist would hit (for a lock-on marker), or null. */
  lockOn(o: import('three').Vector3, d: import('three').Vector3, maxT: number, cone: number): import('three').Vector3 | null;
}

export const ALIENS: { active: AlienTargets | null } = { active: null };
