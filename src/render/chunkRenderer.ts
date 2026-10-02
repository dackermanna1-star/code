/**
 * Owns the GPU meshes of chunk sections, split into three scenes by render layer.
 */
import * as THREE from 'three';
import type { MeshOutput, LayerMesh } from './mesher';
import type { SectionSink } from '../world/chunkManager';
import { chunkKey } from '../core/math';

const BOUND_MIN = new THREE.Vector3(-1.5, -1.5, -1.5);
const BOUND_MAX = new THREE.Vector3(17.5, 17.5, 17.5);

export class ChunkRenderer implements SectionSink {
  readonly opaque = new THREE.Scene();
  readonly cutout = new THREE.Scene();
  readonly translucent = new THREE.Scene();
  private sections = new Map<number, { cx: number; cz: number; meshes: (THREE.Mesh | null)[] }>();
  private byChunk = new Map<number, Set<number>>();
  private index: THREE.BufferAttribute;
  private indexQuads = 0;
  vertexCount = 0;

  constructor(private materials: { opaque: THREE.Material; cutout: THREE.Material; translucent: THREE.Material }) {
    for (const s of [this.opaque, this.cutout, this.translucent]) {
      s.matrixAutoUpdate = false;
      (s as any).matrixWorldAutoUpdate = false;
    }
    this.index = this.makeIndex(1 << 16);
  }

  setMaterials(m: { opaque: THREE.Material; cutout: THREE.Material; translucent: THREE.Material }) {
    this.materials = m;
    for (const s of this.sections.values()) {
      if (s.meshes[0]) s.meshes[0].material = m.opaque;
      if (s.meshes[1]) s.meshes[1].material = m.cutout;
      if (s.meshes[2]) s.meshes[2].material = m.translucent;
    }
  }

  private makeIndex(quads: number): THREE.BufferAttribute {
    const idx = new Uint32Array(quads * 6);
    for (let q = 0; q < quads; q++) {
      const v = q * 4, i = q * 6;
      idx[i] = v; idx[i + 1] = v + 1; idx[i + 2] = v + 2;
      idx[i + 3] = v; idx[i + 4] = v + 2; idx[i + 5] = v + 3;
    }
    this.indexQuads = quads;
    return new THREE.BufferAttribute(idx, 1);
  }

  private ensureIndex(quads: number) {
    if (quads <= this.indexQuads) return;
    let n = this.indexQuads;
    while (n < quads) n *= 2;
    this.index = this.makeIndex(n);
    for (const s of this.sections.values()) for (const m of s.meshes) if (m) m.geometry.setIndex(this.index);
  }

  private buildMesh(l: LayerMesh, mat: THREE.Material, cx: number, sy: number, cz: number): THREE.Mesh {
    const g = new THREE.BufferGeometry();
    const pos = new THREE.BufferAttribute(l.pos, 4);
    pos.gpuType = THREE.IntType;
    const tex = new THREE.BufferAttribute(l.tex, 4);
    tex.gpuType = THREE.IntType;
    g.setAttribute('a_pos', pos);
    g.setAttribute('a_tex', tex);
    g.setAttribute('a_light', new THREE.BufferAttribute(l.light, 4, true));
    g.setAttribute('a_color', new THREE.BufferAttribute(l.color, 4, true));
    const quads = l.vertexCount / 4;
    this.ensureIndex(quads);
    g.setIndex(this.index);
    g.setDrawRange(0, quads * 6);
    g.boundingBox = new THREE.Box3(BOUND_MIN.clone(), BOUND_MAX.clone());
    g.boundingSphere = new THREE.Sphere(new THREE.Vector3(8, 8, 8), 16);
    const m = new THREE.Mesh(g, mat);
    m.position.set(cx * 16, sy * 16, cz * 16);
    m.matrixAutoUpdate = false;
    m.updateMatrix();
    m.matrixWorld.copy(m.matrix);
    (m as any).matrixWorldAutoUpdate = false;
    m.frustumCulled = true;
    return m;
  }

  updateSection(key: number, cx: number, sy: number, cz: number, out: MeshOutput): void {
    const old = this.sections.get(key);
    if (old) this.disposeSection(key, old);
    const layers = [out.opaque, out.cutout, out.translucent];
    if (!layers.some(Boolean)) return;
    const mats = [this.materials.opaque, this.materials.cutout, this.materials.translucent];
    const scenes = [this.opaque, this.cutout, this.translucent];
    const meshes: (THREE.Mesh | null)[] = [null, null, null];
    for (let i = 0; i < 3; i++) {
      const l = layers[i];
      if (!l) continue;
      const m = this.buildMesh(l, mats[i], cx, sy, cz);
      meshes[i] = m;
      scenes[i].add(m);
      this.vertexCount += l.vertexCount;
      (m as any).userData.vc = l.vertexCount;
    }
    this.sections.set(key, { cx, cz, meshes });
    const ck = chunkKey(cx, cz);
    let set = this.byChunk.get(ck);
    if (!set) this.byChunk.set(ck, (set = new Set()));
    set.add(key);
  }

  private disposeSection(key: number, s: { meshes: (THREE.Mesh | null)[] }) {
    for (const m of s.meshes) {
      if (!m) continue;
      m.removeFromParent();
      m.geometry.dispose();
      this.vertexCount -= (m as any).userData.vc ?? 0;
    }
    this.sections.delete(key);
  }

  removeChunk(cx: number, cz: number): void {
    const ck = chunkKey(cx, cz);
    const set = this.byChunk.get(ck);
    if (!set) return;
    for (const k of set) {
      const s = this.sections.get(k);
      if (s) this.disposeSection(k, s);
    }
    this.byChunk.delete(ck);
  }

  clear() {
    for (const [k, s] of [...this.sections]) this.disposeSection(k, s);
    this.byChunk.clear();
  }

  get sectionCount() {
    return this.sections.size;
  }
}
