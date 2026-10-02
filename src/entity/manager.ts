/**
 * Entity registry + per-world entity manager.
 */
import * as THREE from 'three';
import type { Entity, EntityGame } from './entity';
import type { World } from '../world/world';
import type { AABB } from '../physics/aabb';

type EntityCtor = new (...args: any[]) => Entity;
const REGISTRY = new Map<string, { ctor: EntityCtor; category: 'monster' | 'creature' | 'ambient' | 'water' | 'misc' }>();

export function registerEntity(type: string, ctor: EntityCtor, category: 'monster' | 'creature' | 'ambient' | 'water' | 'misc' = 'misc') {
  REGISTRY.set(type, { ctor, category });
}
export function createEntity(type: string): Entity | null {
  const r = REGISTRY.get(type);
  return r ? new r.ctor() : null;
}
export function entityTypes() {
  return [...REGISTRY.entries()].map(([type, r]) => ({ type, category: r.category }));
}
export function entityCategory(type: string) {
  return REGISTRY.get(type)?.category ?? 'misc';
}

export class EntityManager {
  readonly list: Entity[] = [];
  readonly byId = new Map<number, Entity>();
  /** Scene for entity models rendered into the G-buffer. */
  readonly scene = new THREE.Scene();
  /** Scene for shadow-casting (models add depth-material clones here, or share). */
  readonly shadowScene = new THREE.Scene();
  /** Scene for forward/transparent entity effects. */
  readonly forwardScene = new THREE.Scene();

  constructor(readonly game: EntityGame, readonly world: World) {
    this.scene.matrixWorldAutoUpdate = true;
  }

  add<T extends Entity>(e: T): T {
    e.init(this.game, this.world);
    this.list.push(e);
    this.byId.set(e.id, e);
    if (e.model) this.scene.add(e.model);
    this.game.events.emit('entityAdded', { entity: e });
    return e;
  }

  remove(e: Entity) {
    e.removed = true;
  }

  private purge() {
    let w = 0;
    for (let i = 0; i < this.list.length; i++) {
      const e = this.list[i];
      if (e.removed) {
        this.byId.delete(e.id);
        if (e.model) e.model.removeFromParent();
        this.game.events.emit('entityRemoved', { entity: e });
        continue;
      }
      this.list[w++] = e;
    }
    this.list.length = w;
  }

  tick() {
    for (let i = 0; i < this.list.length; i++) {
      const e = this.list[i];
      if (e.removed) continue;
      // freeze entities in unloaded chunks
      if (!this.world.isLoaded(Math.floor(e.pos.x), Math.floor(e.pos.z))) continue;
      e.tick();
    }
    this.purge();
  }

  physics(dt: number) {
    for (const e of this.list) {
      if (e.removed) continue;
      if (!this.world.isLoaded(Math.floor(e.pos.x), Math.floor(e.pos.z))) continue;
      e.physicsStep(dt);
    }
  }

  updateVisuals(alpha: number, dt: number) {
    for (const e of this.list) {
      if (e.model && !e.model.parent) this.scene.add(e.model);
      e.updateVisual(alpha, dt);
    }
  }

  /** Entities whose boxes intersect `box`. */
  query(box: AABB, filter?: (e: Entity) => boolean): Entity[] {
    const out: Entity[] = [];
    for (const e of this.list) if (!e.removed && e.box.intersects(box) && (!filter || filter(e))) out.push(e);
    return out;
  }

  nearest<T extends Entity = Entity>(p: THREE.Vector3, radius: number, filter?: (e: Entity) => boolean): T | null {
    let best: Entity | null = null, bd = radius * radius;
    for (const e of this.list) {
      if (e.removed || (filter && !filter(e))) continue;
      const d = e.pos.distanceToSquared(p);
      if (d < bd) { bd = d; best = e; }
    }
    return best as T | null;
  }

  ofType<T extends Entity = Entity>(type: string): T[] {
    return this.list.filter((e) => e.type === type && !e.removed) as T[];
  }

  clear() {
    for (const e of this.list) if (e.model) e.model.removeFromParent();
    this.list.length = 0;
    this.byId.clear();
  }
}
