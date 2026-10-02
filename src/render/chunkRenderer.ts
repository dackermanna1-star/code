/**
 * Owns the GPU meshes of the world, split into three scenes by render layer.
 *
 * To keep draw calls low, the 16 sections of a chunk column are merged into 4 vertical
 * groups of 4 sections (64 blocks): one mesh per (group, layer). Vertex y coordinates are
 * re-based exactly by integer offsets (a_pos uses 1/256 block units with +8 bias).
 */
import * as THREE from 'three';
import type { MeshOutput, LayerMesh } from './mesher';
import type { SectionSink } from '../world/chunkManager';
import { chunkKey } from '../core/math';

const GROUP_SECTIONS = 4;

interface Group {
  cx: number;
  cz: number;
  gy: number;
  sections: (MeshOutput | null)[];
  meshes: (THREE.Mesh | null)[];
  dirty: boolean;
}

export class ChunkRenderer implements SectionSink {
  readonly opaque = new THREE.Scene();
  readonly cutout = new THREE.Scene();
  readonly translucent = new THREE.Scene();
  private groups = new Map<number, Group>();
  private dirty = new Set<Group>();
  private index: THREE.BufferAttribute;
  private indexQuads = 0;
  vertexCount = 0;
  sectionCount = 0;

  constructor(private materials: { opaque: THREE.Material; cutout: THREE.Material; translucent: THREE.Material }) {
    for (const s of [this.opaque, this.cutout, this.translucent]) {
      s.matrixAutoUpdate = false;
      (s as any).matrixWorldAutoUpdate = false;
    }
    this.index = this.makeIndex(1 << 16);
  }

  setMaterials(m: { opaque: THREE.Material; cutout: THREE.Material; translucent: THREE.Material }) {
    this.materials = m;
    for (const g of this.groups.values()) {
      if (g.meshes[0]) g.meshes[0].material = m.opaque;
      if (g.meshes[1]) g.meshes[1].material = m.cutout;
      if (g.meshes[2]) g.meshes[2].material = m.translucent;
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
    for (const g of this.groups.values()) for (const m of g.meshes) if (m) m.geometry.setIndex(this.index);
  }

  private groupKey(cx: number, gy: number, cz: number) {
    return chunkKey(cx, cz) * 8 + gy;
  }

  updateSection(_key: number, cx: number, sy: number, cz: number, out: MeshOutput): void {
    const gy = Math.floor(sy / GROUP_SECTIONS);
    const k = this.groupKey(cx, gy, cz);
    let g = this.groups.get(k);
    const empty = !out.opaque && !out.cutout && !out.translucent;
    if (!g) {
      if (empty) return;
      g = { cx, cz, gy, sections: new Array(GROUP_SECTIONS).fill(null), meshes: [null, null, null], dirty: false };
      this.groups.set(k, g);
    }
    const local = sy - gy * GROUP_SECTIONS;
    if (g.sections[local]) this.sectionCount--;
    g.sections[local] = empty ? null : out;
    if (!empty) this.sectionCount++;
    g.dirty = true;
    this.dirty.add(g);
  }

  /** Rebuild merged meshes for groups changed since the last call. Call once per frame. */
  flush(maxGroups = 64) {
    let n = 0;
    for (const g of this.dirty) {
      this.dirty.delete(g);
      this.rebuild(g);
      if (++n >= maxGroups) break;
    }
  }

  private rebuild(g: Group) {
    g.dirty = false;
    const scenes = [this.opaque, this.cutout, this.translucent];
    const mats = [this.materials.opaque, this.materials.cutout, this.materials.translucent];
    for (let li = 0; li < 3; li++) {
      const old = g.meshes[li];
      if (old) {
        old.removeFromParent();
        old.geometry.dispose();
        this.vertexCount -= (old as any).userData.vc ?? 0;
        g.meshes[li] = null;
      }
      let total = 0;
      for (const s of g.sections) {
        const l = s ? (li === 0 ? s.opaque : li === 1 ? s.cutout : s.translucent) : null;
        if (l) total += l.vertexCount;
      }
      if (total === 0) continue;
      const pos = new Uint16Array(total * 4), tex = new Uint16Array(total * 4), light = new Uint8Array(total * 4), color = new Uint8Array(total * 4);
      let off = 0;
      let minY = 1e9, maxY = -1e9;
      for (let si = 0; si < GROUP_SECTIONS; si++) {
        const s = g.sections[si];
        const l: LayerMesh | null = s ? (li === 0 ? s.opaque : li === 1 ? s.cutout : s.translucent) : null;
        if (!l) continue;
        const n4 = l.vertexCount * 4;
        pos.set(l.pos, off);
        const yAdd = si * 16 * 256;
        if (yAdd) for (let i = off + 1; i < off + n4; i += 4) pos[i] += yAdd;
        tex.set(l.tex, off);
        light.set(l.light, off);
        color.set(l.color, off);
        off += n4;
        minY = Math.min(minY, si * 16);
        maxY = Math.max(maxY, si * 16 + 16);
      }
      const geo = new THREE.BufferGeometry();
      const pa = new THREE.BufferAttribute(pos, 4);
      pa.gpuType = THREE.IntType;
      const ta = new THREE.BufferAttribute(tex, 4);
      ta.gpuType = THREE.IntType;
      geo.setAttribute('a_pos', pa);
      geo.setAttribute('a_tex', ta);
      geo.setAttribute('a_light', new THREE.BufferAttribute(light, 4, true));
      geo.setAttribute('a_color', new THREE.BufferAttribute(color, 4, true));
      const quads = total / 4;
      this.ensureIndex(quads);
      geo.setIndex(this.index);
      geo.setDrawRange(0, quads * 6);
      geo.boundingBox = new THREE.Box3(new THREE.Vector3(-1.5, minY - 1.5, -1.5), new THREE.Vector3(17.5, maxY + 1.5, 17.5));
      geo.boundingSphere = geo.boundingBox.getBoundingSphere(new THREE.Sphere());
      const m = new THREE.Mesh(geo, mats[li]);
      m.position.set(g.cx * 16, g.gy * GROUP_SECTIONS * 16, g.cz * 16);
      m.matrixAutoUpdate = false;
      m.updateMatrix();
      m.matrixWorld.copy(m.matrix);
      (m as any).matrixWorldAutoUpdate = false;
      (m as any).userData.vc = total;
      scenes[li].add(m);
      g.meshes[li] = m;
      this.vertexCount += total;
    }
    if (!g.meshes.some(Boolean) && !g.sections.some(Boolean)) this.groups.delete(this.groupKey(g.cx, g.gy, g.cz));
  }

  removeChunk(cx: number, cz: number): void {
    for (let gy = 0; gy < 4; gy++) {
      const k = this.groupKey(cx, gy, cz);
      const g = this.groups.get(k);
      if (!g) continue;
      for (const m of g.meshes) {
        if (!m) continue;
        m.removeFromParent();
        m.geometry.dispose();
        this.vertexCount -= (m as any).userData.vc ?? 0;
      }
      for (const s of g.sections) if (s) this.sectionCount--;
      this.dirty.delete(g);
      this.groups.delete(k);
    }
  }

  clear() {
    for (const g of this.groups.values()) {
      for (const m of g.meshes) {
        if (!m) continue;
        m.removeFromParent();
        m.geometry.dispose();
      }
    }
    this.groups.clear();
    this.dirty.clear();
    this.vertexCount = 0;
    this.sectionCount = 0;
  }
}
