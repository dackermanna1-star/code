// Permanent corpses. Ragdolls that have settled are baked into one BatchedMesh
// per material class, so hundreds of bodies (screenshots 4/5 show ~250) cost a
// handful of draw calls.
import * as THREE from 'three';
import { MATERIALS, type MatClass } from './models/kit';
import { REFLECT_LAYER } from './Stage';

const MAX_INSTANCES = 12000;
const MAX_VERTICES = 900_000;

export class Corpses {
  private batches = new Map<MatClass, THREE.BatchedMesh>();
  private geoIds = new Map<MatClass, Map<THREE.BufferGeometry, number>>();
  private group = new THREE.Group();
  /** Fallback when a batch is full: keep plain meshes. */
  private overflow: THREE.Object3D[] = [];
  count = 0;
  /** Baked corpses (for blood soaking). */
  private bodies: Array<{ x: number; z: number; r: number; blood: number; shown: number; inst: Array<[THREE.BatchedMesh, number]> }> = [];
  /** 1 m grid of corpse indices. */
  private grid = new Map<number, number[]>();
  private dirty = new Set<number>();
  private static readonly BASE = new THREE.Color(1, 0.94, 0.94);
  private static readonly SOAKED = new THREE.Color(0.48, 0.05, 0.035);

  constructor(scene: THREE.Scene) {
    this.group.name = 'Corpses';
    scene.add(this.group);
  }

  private batch(cls: MatClass): THREE.BatchedMesh {
    let b = this.batches.get(cls);
    if (!b) {
      b = new THREE.BatchedMesh(MAX_INSTANCES, MAX_VERTICES, 0, MATERIALS[cls]);
      b.castShadow = true;
      b.receiveShadow = false;
      b.perObjectFrustumCulled = true;
      b.sortObjects = false;
      b.layers.enable(REFLECT_LAYER);
      this.batches.set(cls, b);
      this.geoIds.set(cls, new Map());
      this.group.add(b);
    }
    return b;
  }

  /**
   * Bake every mesh under `root` (world transforms as they are now) and remove
   * `root` from the scene. `tint` multiplies colour (blood-soaked corpses).
   */
  bake(root: THREE.Object3D, tint?: THREE.Color): void {
    root.updateMatrixWorld(true);
    const meshes: THREE.Mesh[] = [];
    root.traverse((o) => {
      if ((o as THREE.Mesh).isMesh && o.visible && !(o as THREE.InstancedMesh).isInstancedMesh) meshes.push(o as THREE.Mesh);
    });
    let ok = true;
    const loose: THREE.Mesh[] = [];
    const inst: Array<[THREE.BatchedMesh, number]> = [];
    for (const m of meshes) {
      if (!this.visibleInHierarchy(m, root)) continue;
      const cls = (m.userData.matClass as MatClass | undefined) ?? null;
      if (!cls || m.material !== MATERIALS[cls] || m.geometry.index) {
        loose.push(m);
        continue;
      }
      const b = this.batch(cls);
      const ids = this.geoIds.get(cls)!;
      let gid = ids.get(m.geometry);
      try {
        if (gid === undefined) {
          gid = b.addGeometry(m.geometry);
          ids.set(m.geometry, gid);
        }
        const iid = b.addInstance(gid);
        b.setMatrixAt(iid, m.matrixWorld);
        b.setColorAt(iid, tint ?? Corpses.BASE);
        inst.push([b, iid]);
      } catch {
        ok = false;
        break;
      }
    }
    if (!ok) {
      // Out of batch capacity: keep the object as-is (static).
      this.overflow.push(root);
      root.traverse((o) => (o.matrixAutoUpdate = false));
      return;
    }
    // Meshes with custom materials are kept as static copies.
    for (const m of loose) {
      const c = m.clone(false);
      c.matrix.copy(m.matrixWorld);
      c.matrixAutoUpdate = false;
      c.matrixWorldNeedsUpdate = true;
      this.group.add(c);
      this.overflow.push(c);
    }
    if (inst.length) {
      const box = new THREE.Box3().setFromObject(root);
      const c = box.getCenter(new THREE.Vector3());
      const r = Math.max(0.3, Math.max(box.max.x - box.min.x, box.max.z - box.min.z) * 0.5);
      const idx = this.bodies.length;
      this.bodies.push({ x: c.x, z: c.z, r, blood: 0, shown: 0, inst });
      for (let gx = Math.floor(c.x - r); gx <= Math.floor(c.x + r); gx++) {
        for (let gz = Math.floor(c.z - r); gz <= Math.floor(c.z + r); gz++) {
          const k = gx * 1000 + gz;
          const list = this.grid.get(k);
          if (list) list.push(idx);
          else this.grid.set(k, [idx]);
        }
      }
    }
    root.removeFromParent();
    this.count++;
  }

  /** A blood droplet landed at (x, z): corpses there get a little bloodier. */
  soak(x: number, z: number, amount: number): void {
    const list = this.grid.get(Math.floor(x) * 1000 + Math.floor(z));
    if (!list) return;
    for (const i of list) {
      const b = this.bodies[i];
      if ((x - b.x) ** 2 + (z - b.z) ** 2 > b.r * b.r) continue;
      b.blood = Math.min(1, b.blood + amount / (b.r * b.r));
      if (b.blood - b.shown > 0.04) this.dirty.add(i);
    }
  }

  /** Apply pending blood tints (call once per frame). */
  flushTints(): void {
    if (!this.dirty.size) return;
    const c = new THREE.Color();
    for (const i of this.dirty) {
      const b = this.bodies[i];
      b.shown = b.blood;
      c.copy(Corpses.BASE).lerp(Corpses.SOAKED, b.blood * 0.85);
      for (const [mesh, iid] of b.inst) mesh.setColorAt(iid, c);
    }
    this.dirty.clear();
  }

  private visibleInHierarchy(o: THREE.Object3D, root: THREE.Object3D): boolean {
    for (let p: THREE.Object3D | null = o; p && p !== root.parent; p = p.parent) if (!p.visible) return false;
    return true;
  }

  clear(): void {
    for (const b of this.batches.values()) {
      this.group.remove(b);
      b.dispose();
    }
    this.batches.clear();
    this.geoIds.clear();
    for (const o of this.overflow) o.removeFromParent();
    this.overflow.length = 0;
    this.count = 0;
    this.bodies.length = 0;
    this.grid.clear();
    this.dirty.clear();
  }
}
