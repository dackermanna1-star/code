// ICharacters: spawn/remove/all/byId + a uniform-grid spatial hash for radius queries.
import * as THREE from 'three';
import type { CharacterSpawnOptions, ICharacter, ICharacters } from '../core/contracts';
import type { EntityId } from '../core/types';
import { Character } from './Character';

const CELL = 16;

export class CharacterRegistry implements ICharacters {
  readonly list: Character[] = [];
  private readonly byIdMap = new Map<EntityId, Character>();
  private readonly cells = new Map<number, Character[]>();
  private readonly cellOf = new Map<Character, number>();
  /** Called after a character is created (visual attachment etc.). */
  onSpawn: ((c: Character) => void) | null = null;
  onRemove: ((c: Character) => void) | null = null;

  private static key(x: number, z: number): number {
    // 2^15 cells per axis is plenty (map is ~3 km / 16 m = 192 cells).
    const cx = Math.floor(x / CELL) + 16384;
    const cz = Math.floor(z / CELL) + 16384;
    return cx * 32768 + cz;
  }

  spawn(opts: CharacterSpawnOptions): ICharacter {
    const c = new Character(opts);
    this.list.push(c);
    this.byIdMap.set(c.id, c);
    this.reindex(c);
    this.onSpawn?.(c);
    return c;
  }

  remove(ch: ICharacter): void {
    const c = this.byIdMap.get(ch.id);
    if (!c) return;
    this.onRemove?.(c);
    const i = this.list.indexOf(c);
    if (i >= 0) this.list.splice(i, 1);
    this.byIdMap.delete(c.id);
    const k = this.cellOf.get(c);
    if (k !== undefined) {
      const cell = this.cells.get(k);
      if (cell) {
        const j = cell.indexOf(c);
        if (j >= 0) cell.splice(j, 1);
      }
      this.cellOf.delete(c);
    }
    c.dispose();
  }

  all(): readonly ICharacter[] {
    return this.list;
  }

  byId(id: EntityId): ICharacter | undefined {
    return this.byIdMap.get(id);
  }

  /** Re-bucket a character after it moved (called each tick by the system). */
  reindex(c: Character): void {
    const k = CharacterRegistry.key(c.position.x, c.position.z);
    const old = this.cellOf.get(c);
    if (old === k) return;
    if (old !== undefined) {
      const cell = this.cells.get(old);
      if (cell) {
        const j = cell.indexOf(c);
        if (j >= 0) cell.splice(j, 1);
      }
    }
    let cell = this.cells.get(k);
    if (!cell) this.cells.set(k, (cell = []));
    cell.push(c);
    this.cellOf.set(c, k);
  }

  queryRadius(pos: THREE.Vector3, radius: number, out: ICharacter[] = []): ICharacter[] {
    out.length = 0;
    const r2 = radius * radius;
    if (radius > 400) {
      for (const c of this.list) if (c.position.distanceToSquared(pos) <= r2) out.push(c);
      return out;
    }
    const x0 = Math.floor((pos.x - radius) / CELL), x1 = Math.floor((pos.x + radius) / CELL);
    const z0 = Math.floor((pos.z - radius) / CELL), z1 = Math.floor((pos.z + radius) / CELL);
    for (let x = x0; x <= x1; x++)
      for (let z = z0; z <= z1; z++) {
        const cell = this.cells.get((x + 16384) * 32768 + (z + 16384));
        if (!cell) continue;
        for (const c of cell) if (c.position.distanceToSquared(pos) <= r2) out.push(c);
      }
    return out;
  }
}
