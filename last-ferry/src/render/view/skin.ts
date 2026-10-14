// Draw-call diet for live zombies. A rig is built as one mesh per (bone,
// material class) — ~24 meshes, ×3 passes (shadow, wet-deck reflection,
// scene) per zombie. While a zombie walks, its rigid parts are merged into one
// SkinnedMesh per material class (each vertex bound 100% to its bone), so the
// same bones drive ~5 draw calls instead. The per-bone meshes stay in the
// hierarchy (hidden) and come back when the body becomes a ragdoll (heads come
// off, bodies are baked into the corpse batches per bone).
//
// Left as they are: eyes (their material switches when the body dies), glass,
// and the detachable pieces (prop, riot plates, apron, medal).
import * as THREE from 'three';
import { MATERIALS, type MatClass } from '../models/kit';
import type { ZombieRigExt } from '../models/index';
import { REFLECT_LAYER } from '../Stage';

interface Merged {
  geo: THREE.BufferGeometry;
  cls: MatClass;
}

/** Merged geometries per look variant (bone order is deterministic per variant). */
const CACHE = new Map<string, Merged[]>();
const IDENTITY = new THREE.Matrix4();
const SKIP: ReadonlySet<string> = new Set(['glow', 'eye', 'glass']);

export interface SkinState {
  meshes: THREE.SkinnedMesh[];
  /** Per-bone meshes hidden while skinned. */
  hidden: THREE.Mesh[];
  skeleton: THREE.Skeleton;
}

function excludedRoots(rig: ZombieRigExt): Set<THREE.Object3D> {
  const out = new Set<THREE.Object3D>();
  if (rig.prop) out.add(rig.prop);
  if (rig.apron) out.add(rig.apron);
  if (rig.medal) out.add(rig.medal);
  if (rig.plates) for (const p of Object.values(rig.plates)) out.add(p);
  return out;
}

function underExcluded(o: THREE.Object3D, ex: Set<THREE.Object3D>, root: THREE.Object3D): boolean {
  for (let p: THREE.Object3D | null = o; p && p !== root; p = p.parent) if (ex.has(p)) return true;
  return false;
}

/** Meshes of the rig that can be merged, grouped by class, with their bone index. */
function collect(rig: ZombieRigExt, boneIndex: Map<THREE.Object3D, number>): Map<MatClass, Array<{ mesh: THREE.Mesh; bone: number }>> {
  const ex = excludedRoots(rig);
  const groups = new Map<MatClass, Array<{ mesh: THREE.Mesh; bone: number }>>();
  rig.root.traverse((o) => {
    const m = o as THREE.Mesh;
    if (!m.isMesh || (m as THREE.SkinnedMesh).isSkinnedMesh) return;
    const cls = m.userData.matClass as MatClass | undefined;
    if (!cls || SKIP.has(cls) || m.material !== MATERIALS[cls]) return;
    const g = m.geometry;
    if (g.index || !g.attributes.position || !g.attributes.normal || !g.attributes.color) return;
    if (Object.keys(g.attributes).length !== 3) return;
    const bone = m.parent ? boneIndex.get(m.parent) : undefined;
    if (bone === undefined) return;
    if (underExcluded(m, ex, rig.root)) return;
    let list = groups.get(cls);
    if (!list) groups.set(cls, (list = []));
    list.push({ mesh: m, bone });
  });
  return groups;
}

function merge(items: Array<{ mesh: THREE.Mesh; bone: number }>): THREE.BufferGeometry {
  let n = 0;
  for (const it of items) n += it.mesh.geometry.attributes.position.count;
  const pos = new Float32Array(n * 3);
  const nor = new Float32Array(n * 3);
  const col = new Float32Array(n * 3);
  const si = new Uint16Array(n * 4);
  const sw = new Float32Array(n * 4);
  const v = new THREE.Vector3();
  const nm = new THREE.Matrix3();
  let k = 0;
  for (const it of items) {
    const g = it.mesh.geometry;
    it.mesh.updateMatrix();
    nm.getNormalMatrix(it.mesh.matrix);
    const P = g.attributes.position as THREE.BufferAttribute;
    const N = g.attributes.normal as THREE.BufferAttribute;
    const C = g.attributes.color as THREE.BufferAttribute;
    for (let i = 0; i < P.count; i++, k++) {
      v.fromBufferAttribute(P, i).applyMatrix4(it.mesh.matrix);
      pos[k * 3] = v.x;
      pos[k * 3 + 1] = v.y;
      pos[k * 3 + 2] = v.z;
      v.fromBufferAttribute(N, i).applyMatrix3(nm).normalize();
      nor[k * 3] = v.x;
      nor[k * 3 + 1] = v.y;
      nor[k * 3 + 2] = v.z;
      col[k * 3] = C.getX(i);
      col[k * 3 + 1] = C.getY(i);
      col[k * 3 + 2] = C.getZ(i);
      si[k * 4] = it.bone;
      sw[k * 4] = 1;
    }
  }
  const out = new THREE.BufferGeometry();
  out.setAttribute('position', new THREE.BufferAttribute(pos, 3));
  out.setAttribute('normal', new THREE.BufferAttribute(nor, 3));
  out.setAttribute('color', new THREE.BufferAttribute(col, 3));
  out.setAttribute('skinIndex', new THREE.BufferAttribute(si, 4));
  out.setAttribute('skinWeight', new THREE.BufferAttribute(sw, 4));
  // Generous bounds around the standing body (local to the rig root).
  out.boundingSphere = new THREE.Sphere(new THREE.Vector3(0, 1, 0), 2.2);
  return out;
}

/** Swap a live zombie's per-bone meshes for skinned ones. */
export function skinify(rig: ZombieRigExt): SkinState | null {
  const bones = [...rig.bones.values()];
  const boneIndex = new Map<THREE.Object3D, number>();
  bones.forEach((b, i) => boneIndex.set(b, i));
  const groups = collect(rig, boneIndex);
  if (!groups.size) return null;
  const key = `${rig.kind}:${rig.lookInfo.key}`;
  let merged = CACHE.get(key);
  if (!merged) {
    merged = [];
    for (const [cls, items] of groups) merged.push({ geo: merge(items), cls });
    CACHE.set(key, merged);
  }
  const skeleton = new THREE.Skeleton(bones as unknown as THREE.Bone[], bones.map(() => new THREE.Matrix4()));
  const meshes: THREE.SkinnedMesh[] = [];
  for (const m of merged) {
    const sm = new THREE.SkinnedMesh(m.geo, MATERIALS[m.cls]);
    sm.userData.matClass = m.cls;
    sm.userData.skinned = true;
    sm.castShadow = m.cls !== 'hivis';
    sm.receiveShadow = false;
    sm.layers.enable(REFLECT_LAYER);
    sm.bind(skeleton, IDENTITY);
    // Fixed bounds (skipping three's per-vertex skinned bounds pass).
    sm.boundingSphere = new THREE.Sphere(new THREE.Vector3(0, 1.1, 0), rig.kind === 'bigdave' ? 3.2 : 2.2);
    rig.root.add(sm);
    meshes.push(sm);
  }
  const hidden: THREE.Mesh[] = [];
  for (const items of groups.values()) {
    for (const it of items) {
      it.mesh.visible = false;
      hidden.push(it.mesh);
    }
  }
  return { meshes, hidden, skeleton };
}

/** Back to per-bone meshes (death: ragdoll, head shots, baking). */
export function unskin(s: SkinState): void {
  for (const m of s.meshes) m.removeFromParent();
  for (const m of s.hidden) m.visible = true;
  s.meshes.length = 0;
  s.hidden.length = 0;
  s.skeleton.dispose();
}
