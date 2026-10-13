import * as THREE from 'three';
import { CHUNK_SIZE } from '../../shared/constants';
import { chunkKey, type VoxelWorld } from '../../shared/world/chunk';
import type { MeshArrays, MeshResult } from './mesher';

interface ChunkMeshes {
  opaque: THREE.Mesh | null;
  trans: THREE.Mesh | null;
}

/**
 * Owns chunk meshes and the mesher worker pool. Chunks are (re)meshed when
 * they or their neighbours change; the nearest dirty chunks go first and a
 * chunk is only meshed once its 4 direct neighbours are present (so borders,
 * AO and light are right the first time).
 */
export class ChunkRenderer {
  readonly group = new THREE.Group();
  private meshes = new Map<number, ChunkMeshes>();
  private dirty = new Set<number>();
  private inflight = new Map<number, number>(); // key -> request id
  private workers: Worker[] = [];
  private idle: Worker[] = [];
  private reqId = 1;
  private reqKey = new Map<number, number>();
  private dirtyAgain = new Set<number>();
  ao = true;
  stats = { meshed: 0, msLight: 0, msMesh: 0, triangles: 0 };

  constructor(private world: VoxelWorld, private materials: { opaque: THREE.Material; trans: THREE.Material }, workerUrl: string, workers = 2) {
    for (let i = 0; i < workers; i++) {
      const w = new Worker(workerUrl, { type: 'module' });
      w.onmessage = (ev) => this.onResult(w, ev.data);
      w.onerror = (e) => console.error('mesher worker error', e.message);
      this.workers.push(w);
      this.idle.push(w);
    }
  }

  markDirty(cx: number, cz: number) {
    const k = chunkKey(cx, cz);
    if (!this.world.chunks.has(k)) return;
    if (this.inflight.has(k)) this.dirtyAgain.add(k);
    else this.dirty.add(k);
  }

  /** Mark a chunk and its 8 neighbours. */
  markArea(cx: number, cz: number) {
    for (let dz = -1; dz <= 1; dz++) for (let dx = -1; dx <= 1; dx++) this.markDirty(cx + dx, cz + dz);
  }

  /** A block changed: remesh its chunk, and neighbours if it is near a border. */
  blockChanged(x: number, z: number) {
    const cx = Math.floor(x / CHUNK_SIZE), cz = Math.floor(z / CHUNK_SIZE);
    const lx = x - cx * CHUNK_SIZE, lz = z - cz * CHUNK_SIZE;
    this.markDirty(cx, cz);
    const ex = lx <= 1 ? -1 : lx >= CHUNK_SIZE - 2 ? 1 : 0;
    const ez = lz <= 1 ? -1 : lz >= CHUNK_SIZE - 2 ? 1 : 0;
    if (ex) this.markDirty(cx + ex, cz);
    if (ez) this.markDirty(cx, cz + ez);
    if (ex && ez) this.markDirty(cx + ex, cz + ez);
  }

  remove(cx: number, cz: number) {
    const k = chunkKey(cx, cz);
    this.dirty.delete(k);
    const m = this.meshes.get(k);
    if (m) {
      for (const mesh of [m.opaque, m.trans]) {
        if (!mesh) continue;
        this.group.remove(mesh);
        mesh.geometry.dispose();
      }
      this.meshes.delete(k);
    }
  }

  get chunkMeshCount() {
    return this.meshes.size;
  }

  /** Chunks waiting to be meshed whose neighbours are present (edge chunks wait for neighbours and are not counted). */
  get pendingCount() {
    let n = this.inflight.size;
    for (const k of this.dirty) {
      const c = this.world.chunks.get(k);
      if (!c) continue;
      const has = (dx: number, dz: number) => this.world.chunks.has(chunkKey(c.cx + dx, c.cz + dz));
      if (has(1, 0) && has(-1, 0) && has(0, 1) && has(0, -1)) n++;
    }
    return n;
  }

  /** Dispatch work to idle workers, nearest chunks first. */
  pump(camX: number, camZ: number) {
    if (!this.idle.length || !this.dirty.size) return;
    const ccx = Math.floor(camX / CHUNK_SIZE), ccz = Math.floor(camZ / CHUNK_SIZE);
    const ready: Array<[number, number]> = [];
    for (const k of this.dirty) {
      const c = this.world.chunks.get(k);
      if (!c) {
        this.dirty.delete(k);
        continue;
      }
      const has = (dx: number, dz: number) => this.world.chunks.has(chunkKey(c.cx + dx, c.cz + dz));
      if (!(has(1, 0) && has(-1, 0) && has(0, 1) && has(0, -1))) continue;
      ready.push([k, (c.cx - ccx) ** 2 + (c.cz - ccz) ** 2]);
    }
    ready.sort((a, b) => a[1] - b[1]);
    for (const [k] of ready) {
      const w = this.idle.pop();
      if (!w) break;
      const c = this.world.chunks.get(k)!;
      const chunks: Array<Uint8Array | null> = [];
      for (let dz = -1; dz <= 1; dz++) for (let dx = -1; dx <= 1; dx++) {
        const n = this.world.chunks.get(chunkKey(c.cx + dx, c.cz + dz));
        chunks.push(n ? n.blocks.slice() : null);
      }
      const id = this.reqId++;
      this.dirty.delete(k);
      this.inflight.set(k, id);
      this.reqKey.set(id, k);
      w.postMessage({ id, cx: c.cx, cz: c.cz, chunks, ao: this.ao }, chunks.filter(Boolean).map((b) => (b as Uint8Array).buffer));
    }
  }

  private onResult(w: Worker, data: { id: number; res?: MeshResult; error?: string }) {
    this.idle.push(w);
    const k = this.reqKey.get(data.id);
    this.reqKey.delete(data.id);
    if (k === undefined) return;
    if (this.inflight.get(k) === data.id) this.inflight.delete(k);
    if (this.dirtyAgain.delete(k)) this.dirty.add(k);
    if (!data.res) {
      console.error('meshing failed', data.error);
      return;
    }
    if (!this.world.chunks.has(k)) return;
    const r = data.res;
    this.stats.meshed++;
    this.stats.msLight += r.ms[0];
    this.stats.msMesh += r.ms[1];
    this.remove(r.cx, r.cz);
    const m: ChunkMeshes = { opaque: this.build(r.opaque, this.materials.opaque, r.cx, r.cz), trans: this.build(r.trans, this.materials.trans, r.cx, r.cz) };
    if (m.trans) m.trans.renderOrder = 1;
    this.meshes.set(k, m);
    for (const mesh of [m.opaque, m.trans]) if (mesh) this.group.add(mesh);
  }

  private build(a: MeshArrays, mat: THREE.Material, cx: number, cz: number): THREE.Mesh | null {
    if (!a.idx.length) return null;
    const g = new THREE.BufferGeometry();
    g.setAttribute('position', new THREE.BufferAttribute(a.pos, 4));
    g.setAttribute('uv', new THREE.BufferAttribute(a.uv, 2));
    g.setAttribute('info', new THREE.BufferAttribute(a.info, 4));
    g.setIndex(new THREE.BufferAttribute(a.idx, 1));
    let maxY = 0;
    for (let i = 1; i < a.pos.length; i += 4) if (a.pos[i] > maxY) maxY = a.pos[i];
    g.boundingBox = new THREE.Box3(new THREE.Vector3(0, 0, 0), new THREE.Vector3(256, maxY, 256));
    g.boundingSphere = g.boundingBox.getBoundingSphere(new THREE.Sphere());
    const mesh = new THREE.Mesh(g, mat);
    mesh.position.set(cx * CHUNK_SIZE, 0, cz * CHUNK_SIZE);
    mesh.scale.setScalar(1 / 16);
    mesh.matrixAutoUpdate = false;
    mesh.updateMatrix();
    this.stats.triangles += a.idx.length / 3;
    return mesh;
  }

  dispose() {
    for (const w of this.workers) w.terminate();
  }
}
