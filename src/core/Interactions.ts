import * as THREE from 'three';
import type { ICharacter, Interactable } from './contracts';

let nextInteractableId = 1;
export function newInteractableId(): number {
  return nextInteractableId++;
}

const _eye = new THREE.Vector3();
const _dir = new THREE.Vector3();
const _to = new THREE.Vector3();

/**
 * Registry of everything a character can interact with (F key / bot interaction).
 * Uses a coarse spatial hash so queries stay cheap with thousands of loot items.
 */
export class InteractionRegistry {
  private cellSize = 8;
  private cells = new Map<string, Set<Interactable>>();
  private where = new Map<Interactable, string>();

  private key(x: number, z: number): string {
    return `${Math.floor(x / this.cellSize)},${Math.floor(z / this.cellSize)}`;
  }

  add(it: Interactable): void {
    const k = this.key(it.position.x, it.position.z);
    let set = this.cells.get(k);
    if (!set) this.cells.set(k, (set = new Set()));
    set.add(it);
    this.where.set(it, k);
  }

  remove(it: Interactable): void {
    const k = this.where.get(it);
    if (k === undefined) return;
    this.cells.get(k)?.delete(it);
    this.where.delete(it);
  }

  /** Call when an interactable's position changed (e.g. vehicle). */
  update(it: Interactable): void {
    const k = this.key(it.position.x, it.position.z);
    if (this.where.get(it) === k) return;
    this.remove(it);
    this.add(it);
  }

  near(pos: THREE.Vector3, radius: number, out: Interactable[] = []): Interactable[] {
    out.length = 0;
    const r2 = radius * radius;
    const x0 = Math.floor((pos.x - radius) / this.cellSize);
    const x1 = Math.floor((pos.x + radius) / this.cellSize);
    const z0 = Math.floor((pos.z - radius) / this.cellSize);
    const z1 = Math.floor((pos.z + radius) / this.cellSize);
    for (let x = x0; x <= x1; x++)
      for (let z = z0; z <= z1; z++) {
        const set = this.cells.get(`${x},${z}`);
        if (!set) continue;
        for (const it of set) if (it.position.distanceToSquared(pos) <= r2) out.push(it);
      }
    return out;
  }

  /**
   * Best interactable for a character: within range, available, roughly in front of the view,
   * preferring higher priority, then smaller view angle, then distance.
   */
  best(c: ICharacter, candidates: Interactable[] = []): Interactable | null {
    c.getEyePosition(_eye);
    c.getAimDirection(_dir);
    this.near(c.position, 4, candidates);
    let best: Interactable | null = null;
    let bestScore = -Infinity;
    for (const it of candidates) {
      if (!it.available(c)) continue;
      _to.copy(it.position).sub(_eye);
      const dist = _to.length();
      const flatDist = Math.hypot(it.position.x - c.position.x, it.position.z - c.position.z);
      if (flatDist > it.range) continue;
      const cos = dist > 1e-3 ? _to.dot(_dir) / dist : 1;
      if (cos < 0.2 && dist > 1.0) continue; // must be roughly in front
      const score = it.priority * 10 + cos * 3 - dist;
      if (score > bestScore) {
        bestScore = score;
        best = it;
      }
    }
    return best;
  }
}
