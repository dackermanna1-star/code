import * as THREE from 'three';
import type { Combatant } from './Combat';
import type { PartHit } from '../characters/CharacterModel';
import { ctx } from './ctx';
import { QG } from '../physics/Physics';

const _v = new THREE.Vector3();
const _w = new THREE.Vector3();

export interface TargetHit {
  target: Combatant;
  hit: PartHit;
}

/** Registry of combatants with hit queries. */
export class CombatSystem {
  readonly list: Combatant[] = [];

  add(c: Combatant): void {
    if (!this.list.includes(c)) this.list.push(c);
  }

  remove(c: Combatant): void {
    const i = this.list.indexOf(c);
    if (i >= 0) this.list.splice(i, 1);
  }

  /**
   * Closest combatant part hit along a ray. Characters whose axis is far from the
   * ray are skipped cheaply before the per-part OBB tests.
   */
  rayHit(origin: THREE.Vector3, dir: THREE.Vector3, maxDist: number, inflate: number, exclude: (c: Combatant) => boolean, includeDown = true): TargetHit | null {
    let best: TargetHit | null = null;
    for (const c of this.list) {
      if (exclude(c)) continue;
      if (!includeDown && !c.upright) continue;
      // cheap bound: distance from ray to character center
      c.chestPosition(_v);
      _w.subVectors(_v, origin);
      const along = _w.dot(dir);
      if (along < -1.2 || along > maxDist + 1.2) continue;
      const perp2 = _w.lengthSq() - along * along;
      if (perp2 > 1.8 * 1.8) continue;
      const h = c.raycastHitbox(origin, dir, best ? best.hit.dist : maxDist, inflate);
      if (h && (!best || h.dist < best.hit.dist)) best = { target: c, hit: { ...h, local: h.local.clone(), localNormal: h.localNormal.clone(), world: h.world.clone() } };
    }
    return best;
  }

  /** Combatants within radius of a point (horizontal distance). */
  nearby(pos: THREE.Vector3, radius: number, out: Combatant[] = [], filter?: (c: Combatant) => boolean): Combatant[] {
    out.length = 0;
    const r2 = radius * radius;
    for (const c of this.list) {
      const dx = c.position.x - pos.x,
        dz = c.position.z - pos.z,
        dy = c.position.y - pos.y;
      if (dx * dx + dz * dz <= r2 && Math.abs(dy) < 2.5 && (!filter || filter(c))) out.push(c);
    }
    return out;
  }

  /** Is the straight line between two points blocked by static geometry? */
  occluded(a: THREE.Vector3, b: THREE.Vector3): boolean {
    return !ctx.physics.lineOfSight(a, b, QG.LOS);
  }
}
