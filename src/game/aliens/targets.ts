/** The running alien invasion (if any), for weapons that want to shoot at it. */
export interface AlienTargets {
  rayHit(o: import('three').Vector3, d: import('three').Vector3, maxT: number, dmg: number): { t: number; what: 'ship' | 'mother' | null };
}

export const ALIENS: { active: AlienTargets | null } = { active: null };
