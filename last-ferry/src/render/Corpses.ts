// Baked bodies. Ragdolls that have settled are baked into one BatchedMesh per
// material class, so hundreds of bodies cost a handful of draw calls. A baked
// body can be un-baked again (its instances are deleted) when it has to move:
// twitching before it rises, a shove, catching fire.
//
// Memory: each batch starts small (INIT_*) and doubles when it runs out, so it
// holds what the night actually needs (a few MB per class, not 32). Batches
// live as long as the view: clear() (a new world) only deletes the instances;
// the look geometries already added stay (looks share geometry, so the next
// game's bodies reuse them) and nothing is re-uploaded at the next first kill.
import * as THREE from 'three';
import { MATERIALS, type MatClass } from './models/kit';

/** Initial capacity per material class (grown ×2 on demand). */
const INIT_INSTANCES = 512;
const INIT_VERTICES = 48 * 1024;

/** A baked body (returned by bake, passed back to unbake). */
export interface BakeHandle {
  /** Index in the soak table. */
  readonly idx: number;
  readonly inst: Array<[THREE.BatchedMesh, number]>;
  /** Static copies of meshes that could not be batched. */
  readonly loose: THREE.Object3D[];
  /** Kept as-is because a batch could not take it. */
  readonly overflowRoot: THREE.Object3D | null;
}

interface SoakBody {
  x: number;
  z: number;
  r: number;
  blood: number;
  shown: number;
  inst: Array<[THREE.BatchedMesh, number]>;
  /** Untinted colour of this body (charred bodies stay charred). */
  base: THREE.Color;
  alive: boolean;
  /** Grid cells this body is listed in. */
  cells: number[];
}

export class Corpses {
  private batches = new Map<MatClass, THREE.BatchedMesh>();
  private geoIds = new Map<MatClass, Map<THREE.BufferGeometry, number>>();
  readonly group = new THREE.Group();
  /** Fallback when a mesh cannot be batched: plain static meshes. */
  private overflow: THREE.Object3D[] = [];
  count = 0;
  private bodies: SoakBody[] = [];
  /** Soak table slots of unbaked bodies, reused by the next bake. */
  private free: number[] = [];
  /** 1 m grid of body indices. */
  private grid = new Map<number, number[]>();
  private dirty = new Set<number>();
  /** Whether baked bodies cast shadows (quality: high only; they lie flat). */
  private shadows = true;
  private static readonly BASE = new THREE.Color(1, 0.94, 0.94);
  private static readonly SOAKED = new THREE.Color(0.48, 0.05, 0.035);
  private readonly _c = new THREE.Color();
  private readonly _box = new THREE.Box3();
  private readonly _v = new THREE.Vector3();

  constructor(scene: THREE.Scene) {
    this.group.name = 'Corpses';
    scene.add(this.group);
  }

  /** Shadow casting of the baked bodies (quality). */
  setShadows(on: boolean): void {
    this.shadows = on;
    for (const [cls, b] of this.batches) b.castShadow = on && castsShadow(cls);
  }

  private batch(cls: MatClass): THREE.BatchedMesh {
    let b = this.batches.get(cls);
    if (!b) {
      b = new THREE.BatchedMesh(INIT_INSTANCES, INIT_VERTICES, 0, MATERIALS[cls]);
      b.castShadow = this.shadows && castsShadow(cls);
      b.receiveShadow = false;
      // The fixed camera sees the whole deck: per-instance culling would only
      // cost CPU in every pass. Bodies lie flat: they are not mirrored either.
      b.perObjectFrustumCulled = false;
      b.frustumCulled = false;
      b.sortObjects = false;
      b.name = `corpses:${cls}`;
      this.batches.set(cls, b);
      this.geoIds.set(cls, new Map());
      this.group.add(b);
    }
    return b;
  }

  /** Geometry id of `g` in the class batch (added, growing the batch, on first use). */
  private geometryId(cls: MatClass, b: THREE.BatchedMesh, g: THREE.BufferGeometry): number {
    const ids = this.geoIds.get(cls)!;
    let gid = ids.get(g);
    if (gid !== undefined) return gid;
    const need = g.attributes.position.count;
    if (b.unusedVertexCount < need) {
      const max = (b as unknown as { _maxVertexCount: number })._maxVertexCount;
      const used = max - b.unusedVertexCount;
      let size = max;
      while (size - used < need) size *= 2;
      b.setGeometrySize(size, 0);
    }
    gid = b.addGeometry(g);
    ids.set(g, gid);
    return gid;
  }

  private addInstance(b: THREE.BatchedMesh, gid: number): number {
    if (b.instanceCount >= b.maxInstanceCount) b.setInstanceCount(b.maxInstanceCount * 2);
    return b.addInstance(gid);
  }

  /**
   * Bake every visible mesh under `root` (world transforms as they are now) and
   * remove `root` from the scene. `tint` is the body's base colour multiplier
   * (charred bodies); blood soaking darkens it further.
   */
  bake(root: THREE.Object3D, tint?: THREE.Color): BakeHandle {
    root.updateMatrixWorld(true);
    const meshes: THREE.Mesh[] = [];
    root.traverse((o) => {
      if ((o as THREE.Mesh).isMesh && !(o as THREE.InstancedMesh).isInstancedMesh && !(o as THREE.SkinnedMesh).isSkinnedMesh) meshes.push(o as THREE.Mesh);
    });
    const base = (tint ?? Corpses.BASE).clone();
    const inst: Array<[THREE.BatchedMesh, number]> = [];
    const loose: THREE.Object3D[] = [];
    let ok = true;
    for (const m of meshes) {
      if (!this.visibleInHierarchy(m, root)) continue;
      const cls = (m.userData.matClass as MatClass | undefined) ?? null;
      if (!cls || m.material !== MATERIALS[cls] || m.geometry.index) {
        const c = m.clone(false);
        c.matrix.copy(m.matrixWorld);
        c.matrixAutoUpdate = false;
        c.matrixWorldNeedsUpdate = true;
        c.castShadow = c.castShadow && this.shadows;
        c.layers.disableAll();
        c.layers.enable(0);
        loose.push(c);
        continue;
      }
      const b = this.batch(cls);
      try {
        const gid = this.geometryId(cls, b, m.geometry);
        const iid = this.addInstance(b, gid);
        b.setMatrixAt(iid, m.matrixWorld);
        b.setColorAt(iid, cls === 'glow' ? WHITE : base);
        inst.push([b, iid]);
      } catch (err) {
        console.warn('Corpses.bake', err);
        ok = false;
        break;
      }
    }
    if (!ok) {
      // A batch could not take it (should not happen): undo, keep the object as-is (static).
      for (const [b, id] of inst) b.deleteInstance(id);
      this.overflow.push(root);
      root.traverse((o) => (o.matrixAutoUpdate = false));
      this.count++;
      return { idx: -1, inst: [], loose: [], overflowRoot: root };
    }
    for (const c of loose) {
      this.group.add(c);
      this.overflow.push(c);
    }
    let idx = -1;
    if (inst.length) {
      const box = this._box.setFromObject(root);
      const c = box.getCenter(this._v);
      // (Clamped: a soak radius is a body's size; a broken transform must not flood the grid.)
      const r = Math.min(2.5, Math.max(0.3, Math.max(box.max.x - box.min.x, box.max.z - box.min.z) * 0.5));
      if (!Number.isFinite(c.x) || !Number.isFinite(c.z)) c.set(0, 0, -1e4);
      const cells: number[] = [];
      idx = this.free.length ? this.free.pop()! : this.bodies.length;
      this.bodies[idx] = { x: c.x, z: c.z, r, blood: 0, shown: 0, inst, base, alive: true, cells };
      for (let gx = Math.floor(c.x - r); gx <= Math.floor(c.x + r); gx++) {
        for (let gz = Math.floor(c.z - r); gz <= Math.floor(c.z + r); gz++) {
          const k = gx * 1000 + gz;
          const list = this.grid.get(k);
          if (list) list.push(idx);
          else this.grid.set(k, [idx]);
          cells.push(k);
        }
      }
    }
    root.removeFromParent();
    this.count++;
    return { idx, inst, loose, overflowRoot: null };
  }

  /**
   * Take a baked body out of the batches again (its root must be re-added to
   * the scene by the caller). Returns the blood it had soaked up (0..1).
   */
  unbake(h: BakeHandle): number {
    let blood = 0;
    for (const [b, id] of h.inst) b.deleteInstance(id);
    for (const o of h.loose) {
      o.removeFromParent();
      const i = this.overflow.indexOf(o);
      if (i >= 0) this.overflow.splice(i, 1);
    }
    if (h.overflowRoot) {
      const i = this.overflow.indexOf(h.overflowRoot);
      if (i >= 0) this.overflow.splice(i, 1);
      h.overflowRoot.traverse((o) => (o.matrixAutoUpdate = true));
    }
    if (h.idx >= 0) {
      const b = this.bodies[h.idx];
      if (b && b.alive && b.inst === h.inst) {
        blood = b.blood;
        b.alive = false;
        b.inst = [];
        this.dirty.delete(h.idx);
        // Out of the grid; the slot is reused by the next bake.
        for (const k of b.cells) {
          const list = this.grid.get(k);
          if (!list) continue;
          const i = list.indexOf(h.idx);
          if (i >= 0) list.splice(i, 1);
          if (!list.length) this.grid.delete(k);
        }
        b.cells.length = 0;
        this.free.push(h.idx);
      }
    }
    this.count = Math.max(0, this.count - 1);
    return blood;
  }

  /** Pre-soak a freshly baked body (it carries the blood it had before). */
  setBlood(h: BakeHandle, blood: number): void {
    const b = h.idx >= 0 ? this.bodies[h.idx] : undefined;
    if (!b || !b.alive || blood <= 0) return;
    b.blood = Math.min(1, blood);
    this.dirty.add(h.idx);
  }

  /** A blood droplet landed at (x, z): bodies there get a little bloodier. */
  soak(x: number, z: number, amount: number): void {
    const list = this.grid.get(Math.floor(x) * 1000 + Math.floor(z));
    if (!list) return;
    for (const i of list) {
      const b = this.bodies[i];
      if (!b.alive || (x - b.x) ** 2 + (z - b.z) ** 2 > b.r * b.r) continue;
      b.blood = Math.min(1, b.blood + amount / (b.r * b.r));
      if (b.blood - b.shown > 0.04) this.dirty.add(i);
    }
  }

  /** Apply pending blood tints (call once per frame). */
  flushTints(): void {
    if (!this.dirty.size) return;
    const c = this._c;
    for (const i of this.dirty) {
      const b = this.bodies[i];
      if (!b.alive) continue;
      b.shown = b.blood;
      c.copy(b.base).lerp(Corpses.SOAKED, b.blood * 0.45);
      for (const [mesh, iid] of b.inst) {
        if (mesh.material !== MATERIALS.glow) mesh.setColorAt(iid, c);
      }
    }
    this.dirty.clear();
  }

  private visibleInHierarchy(o: THREE.Object3D, root: THREE.Object3D): boolean {
    for (let p: THREE.Object3D | null = o; p && p !== root.parent; p = p.parent) if (!p.visible) return false;
    return true;
  }

  /** Number of live batched instances (stats). */
  get instances(): number {
    let n = 0;
    for (const b of this.batches.values()) n += b.instanceCount;
    return n;
  }

  /** Bytes held by the batches' vertex buffers (stats). */
  get bytes(): number {
    let n = 0;
    for (const b of this.batches.values()) for (const a of Object.values(b.geometry.attributes)) n += (a as THREE.BufferAttribute).array.byteLength;
    return n;
  }

  /**
   * A new world: every body goes, the batches (and the look geometries in
   * them) stay for the next one.
   */
  clear(): void {
    for (const b of this.batches.values()) {
      // Ids in use are exactly the active ones; deleting frees them for reuse.
      const info = (b as unknown as { _instanceInfo: Array<{ active: boolean }> })._instanceInfo;
      for (let i = 0; i < info.length; i++) if (info[i].active) b.deleteInstance(i);
    }
    for (const o of this.overflow) o.removeFromParent();
    this.overflow.length = 0;
    this.count = 0;
    this.bodies.length = 0;
    this.free.length = 0;
    this.grid.clear();
    this.dirty.clear();
  }
}

/** Glass, glow, hi-vis tape and eyes cast no shadow (too small, or see-through). */
function castsShadow(cls: MatClass): boolean {
  return cls !== 'glow' && cls !== 'glass' && cls !== 'hivis' && cls !== 'eye';
}

const WHITE = new THREE.Color(1, 1, 1);
