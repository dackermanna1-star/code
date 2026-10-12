// Manages GPU meshes for chunks: incremental, budgeted, distance-prioritised rebuilds.
import * as THREE from 'three';
import { CHUNK } from '../config';
import { Chunk } from '../world/chunk';
import { VoxelWorld } from '../world/world';
import { ChunkMeshData, Emitter, LayerData, PointData, meshChunk } from './chunkMesher';
import { VoxelMaterials } from './voxelMaterial';

interface ChunkGfx {
  opaque: THREE.Mesh | null;
  trans: THREE.Mesh | null;
  gas: THREE.Points | null;
  fire: THREE.Points | null;
  emitter: Emitter | null;
}

const SPHERE = new THREE.Sphere(new THREE.Vector3(CHUNK / 2, CHUNK / 2, CHUNK / 2), Math.sqrt(3) * CHUNK * 0.5 + 1);

export class ChunkRenderer {
  readonly group = new THREE.Group();
  private gfx = new Map<Chunk, ChunkGfx>();
  readonly emitters = new Map<Chunk, Emitter>();
  stats = { rebuilt: 0, lastRebuildMs: 0, meshes: 0, triangles: 0 };
  renderDistance = 7; // chunks

  constructor(private world: VoxelWorld, private mats: VoxelMaterials) {
    this.group.matrixAutoUpdate = false;
  }

  /** Rebuild dirty chunk meshes nearest the camera first, within a time budget. */
  update(camPos: THREE.Vector3, budgetMs: number): void {
    const t0 = performance.now();
    const dirty = this.world.meshDirty;
    if (dirty.size === 0) return;
    const ccx = camPos.x / CHUNK, ccy = camPos.y / CHUNK, ccz = camPos.z / CHUNK;
    const rd = this.renderDistance;
    const list: [number, Chunk][] = [];
    for (const c of dirty) {
      const dx = c.cx + 0.5 - ccx, dy = c.cy + 0.5 - ccy, dz = c.cz + 0.5 - ccz;
      const d = dx * dx + dy * dy * 1.3 + dz * dz;
      if (d > (rd + 1) * (rd + 1)) {
        // too far: drop the mesh, keep it marked dirty for later
        if (this.gfx.has(c)) this.removeChunk(c);
        continue;
      }
      list.push([d, c]);
    }
    list.sort((a, b) => a[0] - b[0]);
    let n = 0;
    for (const [, c] of list) {
      if (n > 0 && performance.now() - t0 > budgetMs) break;
      dirty.delete(c);
      c.meshDirty = false;
      this.rebuild(c);
      n++;
    }
    this.stats.rebuilt = n;
    this.stats.lastRebuildMs = performance.now() - t0;
  }

  rebuild(c: Chunk): void {
    const data = meshChunk(this.world, c);
    this.apply(c, data);
  }

  private apply(c: Chunk, d: ChunkMeshData): void {
    let g = this.gfx.get(c);
    if (!g) {
      g = { opaque: null, trans: null, gas: null, fire: null, emitter: null };
      this.gfx.set(c, g);
    }
    g.opaque = this.setLayer(g.opaque, d.opaque, this.mats.opaque, c, 0);
    g.trans = this.setLayer(g.trans, d.translucent, this.mats.translucent, c, 1);
    g.gas = this.setPoints(g.gas, d.gas, this.mats.gas, c, 2);
    g.fire = this.setPoints(g.fire, d.fire, this.mats.fire, c, 3);
    g.emitter = d.emitter;
    if (d.emitter) this.emitters.set(c, d.emitter);
    else this.emitters.delete(c);
  }

  private setLayer(old: THREE.Mesh | null, data: LayerData | null, mat: THREE.Material, c: Chunk, order: number): THREE.Mesh | null {
    if (old) {
      this.group.remove(old);
      old.geometry.dispose();
    }
    if (!data) return null;
    const geo = new THREE.BufferGeometry();
    geo.setAttribute('position', new THREE.BufferAttribute(data.pos, 3));
    geo.setAttribute('vinfo', new THREE.BufferAttribute(data.info, 2));
    geo.setIndex(new THREE.BufferAttribute(data.index, 1));
    geo.boundingSphere = SPHERE.clone();
    const mesh = new THREE.Mesh(geo, mat);
    mesh.position.set(c.ox, c.oy, c.oz);
    mesh.updateMatrix();
    mesh.matrixAutoUpdate = false;
    mesh.renderOrder = order;
    this.group.add(mesh);
    return mesh;
  }

  private setPoints(old: THREE.Points | null, data: PointData | null, mat: THREE.Material, c: Chunk, order: number): THREE.Points | null {
    if (old) {
      this.group.remove(old);
      old.geometry.dispose();
    }
    if (!data) return null;
    const geo = new THREE.BufferGeometry();
    geo.setAttribute('position', new THREE.BufferAttribute(data.pos, 3));
    geo.setAttribute('pinfo', new THREE.BufferAttribute(data.info, 2));
    geo.boundingSphere = SPHERE.clone();
    const pts = new THREE.Points(geo, mat);
    pts.position.set(c.ox, c.oy, c.oz);
    pts.updateMatrix();
    pts.matrixAutoUpdate = false;
    pts.renderOrder = order;
    this.group.add(pts);
    return pts;
  }

  removeChunk(c: Chunk): void {
    const g = this.gfx.get(c);
    if (!g) return;
    for (const o of [g.opaque, g.trans, g.gas, g.fire]) {
      if (o) {
        this.group.remove(o);
        o.geometry.dispose();
      }
    }
    this.gfx.delete(c);
    this.emitters.delete(c);
  }

  /** Remove meshes of chunks beyond render distance. */
  cull(camPos: THREE.Vector3): void {
    const ccx = camPos.x / CHUNK, ccy = camPos.y / CHUNK, ccz = camPos.z / CHUNK;
    const rd = this.renderDistance + 1.5;
    for (const c of this.gfx.keys()) {
      const dx = c.cx + 0.5 - ccx, dy = c.cy + 0.5 - ccy, dz = c.cz + 0.5 - ccz;
      if (dx * dx + dy * dy * 1.3 + dz * dz > rd * rd) {
        this.removeChunk(c);
        c.meshDirty = true;
        this.world.meshDirty.add(c);
      }
    }
    let tris = 0;
    for (const g of this.gfx.values()) {
      if (g.opaque) tris += (g.opaque.geometry.index!.count / 3) | 0;
      if (g.trans) tris += (g.trans.geometry.index!.count / 3) | 0;
    }
    this.stats.meshes = this.gfx.size;
    this.stats.triangles = tris;
  }

  hasMesh(c: Chunk): boolean {
    return this.gfx.has(c);
  }

  clear(): void {
    for (const c of [...this.gfx.keys()]) this.removeChunk(c);
  }
}
