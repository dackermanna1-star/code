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
        if (tint) b.setColorAt(iid, tint);
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
    root.removeFromParent();
    this.count++;
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
  }
}
