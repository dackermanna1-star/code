// Draw-call diet for zombies and bodies. A rig is built as one mesh per (bone,
// material class) — ~24 meshes, ×3 passes (shadow, wet-deck reflection,
// scene) per zombie. While a zombie walks — and while its body ragdolls,
// falls, twitches or burns — its rigid parts are merged into ONE SkinnedMesh
// with the 'uber' material (each vertex bound 100% to its bone; the class's
// roughness / metalness and the eyes' glow ride along per vertex), plus one
// per glass / hi-vis class (riot gear): one draw call per pass for most
// zombies. Merged geometry is compact (32–35 bytes a vertex), cached per look
// and reference counted. The per-bone meshes are taken out of the hierarchy
// meanwhile (no matrix updates for ~20 hidden meshes per rig) and put back
// when the body is baked into the corpse batches per bone.
//
// Left as they are: the detachable pieces (prop, riot plates, apron, medal).
import * as THREE from 'three';
import { MATERIALS, UBER_CLASSES, charredMaterial, uberMaterial, uberParams, type MatClass, type UberState } from '../models/kit';
import type { ZombieRigExt } from '../models/index';
import { REFLECT_LAYER } from '../Stage';

interface Merged {
  geo: THREE.BufferGeometry;
  /** Material class, or 'uber' (every class in UBER_CLASSES in one mesh). */
  cls: MatClass | 'uber';
}

/**
 * Merged geometries per look variant (bone order is deterministic per
 * variant), reference counted and kept in least-recently-used order: looks no
 * rig uses any more are dropped (GPU buffers freed) past CACHE_MAX.
 */
interface Entry {
  list: Merged[];
  refs: number;
}
const CACHE = new Map<string, Entry>();
const CACHE_MAX = 72;
const IDENTITY = new THREE.Matrix4();
/** Classes never merged ('ice' is flat shaded). */
const SKIP: ReadonlySet<string> = new Set(['ice']);

export interface SkinState {
  /** Look key in the merged-geometry cache. */
  key: string;
  meshes: THREE.SkinnedMesh[];
  /** Look of the one-draw 'uber' mesh (tint, charring, eyes). */
  uber: UberState;
  /** Per-bone meshes taken out while skinned, with the bone each belongs under. */
  hidden: THREE.Mesh[];
  parents: THREE.Object3D[];
  skeleton: THREE.Skeleton;
}

/** Whether skinned zombies cast shadows (quality: off on low, blob shadows instead). */
let SHADOWS = true;
export function setSkinShadows(on: boolean): void {
  SHADOWS = on;
}
export function skinShadows(): boolean {
  return SHADOWS;
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
    if (!cls || SKIP.has(cls)) return;
    const mat = m.material as THREE.Material;
    if (mat !== MATERIALS[cls] && !mat.userData?.lfCharred) return;
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

/**
 * One skinned geometry for a class. Compact: normals and colours as normalised
 * 16-bit, bone index and (always 1) weight as 8-bit — 32 bytes a vertex
 * instead of 60.
 */
function merge(items: Array<{ mesh: THREE.Mesh; bone: number }>, uber = false): THREE.BufferGeometry {
  let n = 0;
  for (const it of items) n += it.mesh.geometry.attributes.position.count;
  const pos = new Float32Array(n * 3);
  const nor = new Int16Array(n * 3);
  const col = new Uint16Array(n * 3);
  const si = new Uint8Array(n * 4);
  const sw = new Uint8Array(n * 4);
  const mat = uber ? new Uint8Array(n * 3) : null;
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
    const [rough, metal, glow] = uberParams(it.mesh.userData.matClass as MatClass);
    for (let i = 0; i < P.count; i++, k++) {
      if (mat) {
        mat[k * 3] = Math.round(rough * 255);
        mat[k * 3 + 1] = Math.round(metal * 255);
        mat[k * 3 + 2] = glow * 255;
      }
      v.fromBufferAttribute(P, i).applyMatrix4(it.mesh.matrix);
      pos[k * 3] = v.x;
      pos[k * 3 + 1] = v.y;
      pos[k * 3 + 2] = v.z;
      v.fromBufferAttribute(N, i).applyMatrix3(nm).normalize();
      nor[k * 3] = Math.round(v.x * 32767);
      nor[k * 3 + 1] = Math.round(v.y * 32767);
      nor[k * 3 + 2] = Math.round(v.z * 32767);
      col[k * 3] = Math.round(Math.min(1, Math.max(0, C.getX(i))) * 65535);
      col[k * 3 + 1] = Math.round(Math.min(1, Math.max(0, C.getY(i))) * 65535);
      col[k * 3 + 2] = Math.round(Math.min(1, Math.max(0, C.getZ(i))) * 65535);
      si[k * 4] = it.bone;
      sw[k * 4] = 255;
    }
  }
  const out = new THREE.BufferGeometry();
  out.setAttribute('position', new THREE.BufferAttribute(pos, 3));
  out.setAttribute('normal', new THREE.BufferAttribute(nor, 3, true));
  out.setAttribute('color', new THREE.BufferAttribute(col, 3, true));
  out.setAttribute('skinIndex', new THREE.BufferAttribute(si, 4));
  out.setAttribute('skinWeight', new THREE.BufferAttribute(sw, 4, true));
  if (mat) out.setAttribute('lfMat', new THREE.BufferAttribute(mat, 3, true));
  // Generous bounds around the standing body (local to the rig root).
  out.boundingSphere = new THREE.Sphere(new THREE.Vector3(0, 1, 0), 2.2);
  return out;
}

/**
 * Swap a rig's per-bone meshes for skinned ones. `cull: false` for ragdolls
 * (their bones travel far from the root, outside the fixed bounds).
 */
export function skinify(rig: ZombieRigExt, opts: { cull?: boolean } = {}): SkinState | null {
  const bones = [...rig.bones.values()];
  const boneIndex = new Map<THREE.Object3D, number>();
  bones.forEach((b, i) => boneIndex.set(b, i));
  const groups = collect(rig, boneIndex);
  if (!groups.size) return null;
  let count = 0;
  for (const items of groups.values()) count += items.length;
  // (The mesh count keys the cache too: a rig whose meshes differ never gets another's geometry.)
  const key = `${rig.kind}:${rig.lookInfo.key}:${count}`;
  let entry = CACHE.get(key);
  if (!entry) {
    entry = { list: [], refs: 0 };
    const uber: Array<{ mesh: THREE.Mesh; bone: number }> = [];
    for (const [cls, items] of groups) {
      if (UBER_CLASSES.has(cls)) uber.push(...items);
      else entry.list.push({ geo: merge(items), cls });
    }
    if (uber.length) entry.list.unshift({ geo: merge(uber, true), cls: 'uber' });
  } else CACHE.delete(key);
  // (Re-)insert: Map order is the least-recently-used order.
  CACHE.set(key, entry);
  entry.refs++;
  const merged = entry.list;
  const skeleton = new THREE.Skeleton(bones as unknown as THREE.Bone[], bones.map(() => new THREE.Matrix4()));
  const meshes: THREE.SkinnedMesh[] = [];
  // Eyes lit (the rig's eye meshes are in the glowing class)?
  const head = rig.bones.get(rig.head);
  let eyes = false;
  head?.children.forEach((c) => {
    if ((c as THREE.Mesh).isMesh && c.userData.matClass === 'glow') eyes = true;
  });
  const uber: UberState = { tint: 'base', char: 0, eyes };
  for (const m of merged) {
    const sm = new THREE.SkinnedMesh(m.geo, m.cls === 'uber' ? uberMaterial(uber) : MATERIALS[m.cls]);
    if (m.cls === 'uber') sm.userData.uber = uber;
    else sm.userData.matClass = m.cls;
    sm.userData.skinned = true;
    sm.castShadow = SHADOWS && m.cls !== 'hivis' && m.cls !== 'glass';
    sm.receiveShadow = false;
    sm.frustumCulled = opts.cull ?? true;
    sm.layers.enable(REFLECT_LAYER);
    sm.bind(skeleton, IDENTITY);
    // Fixed bounds (skipping three's per-vertex skinned bounds pass).
    sm.boundingSphere = new THREE.Sphere(new THREE.Vector3(0, 1.1, 0), rig.kind === 'bigdave' ? 3.2 : 2.2);
    rig.root.add(sm);
    meshes.push(sm);
  }
  const hidden: THREE.Mesh[] = [];
  const parents: THREE.Object3D[] = [];
  for (const items of groups.values()) {
    for (const it of items) {
      parents.push(it.mesh.parent!);
      it.mesh.removeFromParent();
      hidden.push(it.mesh);
    }
  }
  return { key, meshes, uber, hidden, parents, skeleton };
}

/**
 * Change the look of a skinned rig's one-draw mesh: risen / slimed tint, eyes
 * lit or out (charring goes through rig.setCharred → applyCharred).
 */
export function setSkinLook(s: SkinState, patch: Partial<UberState>): void {
  Object.assign(s.uber, patch);
  for (const m of s.meshes) if (m.userData.uber) m.material = uberMaterial(s.uber);
}

/** Drop merged looks no rig uses any more, oldest first, past CACHE_MAX. */
function evict(): void {
  if (CACHE.size <= CACHE_MAX) return;
  for (const [k, e] of CACHE) {
    if (CACHE.size <= CACHE_MAX) break;
    if (e.refs > 0) continue;
    for (const m of e.list) m.geo.dispose();
    CACHE.delete(k);
  }
}

/** Shadow casting of a skinned rig's meshes (quality switch). */
export function setSkinCastShadow(s: SkinState, on: boolean): void {
  for (const m of s.meshes) m.castShadow = on && m.userData.matClass !== 'hivis' && m.userData.matClass !== 'glass';
}

/**
 * Back to per-bone meshes (baking, bloater pops). The per-bone meshes take
 * over the skinned meshes' charred variants (not the risen tint: bodies are
 * baked with the shared materials).
 */
export function unskin(s: SkinState): void {
  if (!s.meshes.length && !s.hidden.length) return;
  const byClass = new Map<string, THREE.Material>();
  for (const m of s.meshes) {
    const mat = m.material as THREE.Material;
    if (mat.userData?.lfCharred && !mat.userData.lfRisen) byClass.set(m.userData.matClass as string, mat);
    m.removeFromParent();
  }
  const char = s.uber.char;
  for (let i = 0; i < s.hidden.length; i++) {
    const m = s.hidden[i];
    s.parents[i].add(m);
    const cls = m.userData.matClass as MatClass;
    const mat = byClass.get(cls) ?? (char > 0 && UBER_CLASSES.has(cls) && m.material === MATERIALS[cls] ? charredMaterial(cls, char / 8) : null);
    if (mat) m.material = mat;
  }
  s.meshes.length = 0;
  s.hidden.length = 0;
  s.parents.length = 0;
  s.skeleton.dispose();
  const e = CACHE.get(s.key);
  if (e) e.refs = Math.max(0, e.refs - 1);
  evict();
}
