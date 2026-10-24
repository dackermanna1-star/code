import * as THREE from 'three';
import { type Appearance, shade } from './Appearance';
import { CharacterAtlas, type Expression } from './CharacterTexture';
import { makeRig, PART_COUNT, PARENT, P, type RigDims, boxFaceCoords } from './Rig';
import { VoxelPart, buildBoxPart, type RemovedVoxel } from './VoxelPart';
import { Pose } from './Pose';
import { rayOBB } from '../core/math';

const _m = new THREE.Matrix4();
const _v = new THREE.Vector3();
const _v2 = new THREE.Vector3();
const _q = new THREE.Quaternion();
const _st = { s: 0, t: 0 };

export interface PartHit {
  part: number;
  dist: number;
  /** box-local hit point */
  local: THREE.Vector3;
  /** box-local normal of the face hit */
  localNormal: THREE.Vector3;
  world: THREE.Vector3;
  face: number;
}

/** Visual model: bones, skinned mesh of intact parts, voxel meshes for carved ones. */
export class CharacterModel {
  readonly root = new THREE.Group();
  readonly bones: THREE.Bone[] = [];
  readonly rig: RigDims;
  readonly atlas: CharacterAtlas;
  readonly material: THREE.MeshStandardMaterial;
  readonly skinned: THREE.SkinnedMesh;
  readonly voxels: (VoxelPart | null)[] = new Array(PART_COUNT).fill(null);
  readonly partMeshes: (THREE.Mesh | null)[] = new Array(PART_COUNT).fill(null);
  /** part no longer drawn by the skinned mesh */
  readonly hidden: boolean[] = new Array(PART_COUNT).fill(false);
  /** part detached from the body (gib or destroyed) */
  readonly severed: boolean[] = new Array(PART_COUNT).fill(false);
  readonly destroyed: boolean[] = new Array(PART_COUNT).fill(false);
  /** part whose ragdoll joint was broken (still rendered through its bone) */
  readonly detached: boolean[] = new Array(PART_COUNT).fill(false);
  private baseIndex: number[] = [];
  readonly boxMatrix: THREE.Matrix4[] = [];
  readonly boxInv: THREE.Matrix4[] = [];
  readonly half: THREE.Vector3[] = [];
  private matricesFrame = -1;
  readonly prevCenters: THREE.Vector3[] = [];
  readonly currCenters: THREE.Vector3[] = [];
  hat: THREE.Object3D | null = null;
  held: THREE.Object3D | null = null;
  dirtyParts = new Set<number>();

  constructor(public app: Appearance) {
    this.rig = makeRig(app.build);
    this.atlas = new CharacterAtlas(this.rig, app);
    this.material = new THREE.MeshStandardMaterial({
      map: this.atlas.texture,
      roughness: 0.84,
      metalness: 0,
    });
    for (let i = 0; i < PART_COUNT; i++) {
      this.boxMatrix.push(new THREE.Matrix4());
      this.boxInv.push(new THREE.Matrix4());
      this.half.push(this.rig.size[i].clone().multiplyScalar(0.5));
      this.prevCenters.push(new THREE.Vector3());
      this.currCenters.push(new THREE.Vector3());
    }

    // bones at bind pose
    for (let i = 0; i < PART_COUNT; i++) {
      const b = new THREE.Bone();
      b.name = 'b' + i;
      b.position.copy(this.rig.joint[i]);
      this.bones.push(b);
      const p = PARENT[i];
      if (p < 0) this.root.add(b);
      else this.bones[p].add(b);
    }

    // skinned geometry (all boxes, in bind world space)
    const acc = { pos: [] as number[], nor: [] as number[], uv: [] as number[], idx: [] as number[], skinIndex: [] as number[], bone: 0 };
    for (let i = 0; i < PART_COUNT; i++) {
      acc.bone = i;
      const off = this.rig.bindWorld[i].clone().add(this.rig.center[i]);
      buildBoxPart(this.atlas, i, this.rig.size[i], off, acc);
    }
    const geo = new THREE.BufferGeometry();
    geo.setAttribute('position', new THREE.Float32BufferAttribute(acc.pos, 3));
    geo.setAttribute('normal', new THREE.Float32BufferAttribute(acc.nor, 3));
    geo.setAttribute('uv', new THREE.Float32BufferAttribute(acc.uv, 2));
    geo.setAttribute('skinIndex', new THREE.Uint16BufferAttribute(acc.skinIndex, 4));
    const sw: number[] = [];
    for (let i = 0; i < acc.skinIndex.length / 4; i++) sw.push(1, 0, 0, 0);
    geo.setAttribute('skinWeight', new THREE.Float32BufferAttribute(sw, 4));
    this.baseIndex = acc.idx.slice();
    geo.setIndex(acc.idx);
    this.skinned = new THREE.SkinnedMesh(geo, this.material);
    this.skinned.castShadow = true;
    this.skinned.receiveShadow = true;
    this.root.add(this.skinned);
    this.root.updateMatrixWorld(true);
    const skeleton = new THREE.Skeleton(this.bones);
    this.skinned.bind(skeleton);
    this.skinned.boundingSphere = new THREE.Sphere(new THREE.Vector3(0, 0.9, 0), 1.7);
    this.skinned.frustumCulled = true;

    this.buildHat();
  }

  dispose(): void {
    this.skinned.geometry.dispose();
    for (const m of this.partMeshes) m?.geometry.dispose();
    this.material.dispose();
    this.atlas.dispose();
  }

  private buildHat(): void {
    const a = this.app;
    if (a.hat === 'none') return;
    const hs = this.rig.size[P.HEAD].x;
    const top = this.rig.center[P.HEAD].y + hs / 2;
    const mat = new THREE.MeshStandardMaterial({ color: a.hatColor, roughness: 0.8 });
    const g = new THREE.Group();
    const add = (w: number, h: number, d: number, x: number, y: number, z: number, m: THREE.Material = mat) => {
      const mesh = new THREE.Mesh(new THREE.BoxGeometry(w, h, d), m);
      mesh.position.set(x, y, z);
      mesh.castShadow = true;
      g.add(mesh);
      return mesh;
    };
    switch (a.hat) {
      case 'cap':
        add(hs * 1.04, hs * 0.22, hs * 1.04, 0, top + hs * 0.09, 0);
        add(hs * 0.9, hs * 0.05, hs * 0.45, 0, top - hs * 0.0, hs * 0.66);
        break;
      case 'beanie':
        add(hs * 1.06, hs * 0.3, hs * 1.06, 0, top + hs * 0.1, 0);
        add(hs * 1.08, hs * 0.08, hs * 1.08, 0, top - hs * 0.03, 0, new THREE.MeshStandardMaterial({ color: shade(a.hatColor, -0.2), roughness: 0.9 }));
        break;
      case 'cowboy':
        add(hs * 1.9, hs * 0.05, hs * 1.9, 0, top + hs * 0.02, 0);
        add(hs * 1.0, hs * 0.38, hs * 1.0, 0, top + hs * 0.22, 0);
        add(hs * 1.02, hs * 0.07, hs * 1.02, 0, top + hs * 0.08, 0, new THREE.MeshStandardMaterial({ color: '#2a1a10', roughness: 0.9 }));
        break;
      case 'bandana':
        add(hs * 1.05, hs * 0.2, hs * 1.05, 0, top - hs * 0.05, 0);
        add(hs * 0.2, hs * 0.3, hs * 0.1, hs * 0.2, top - hs * 0.2, -hs * 0.56);
        break;
      case 'chef':
        add(hs * 1.0, hs * 0.14, hs * 1.0, 0, top + hs * 0.05, 0);
        add(hs * 1.15, hs * 0.55, hs * 1.15, 0, top + hs * 0.4, 0);
        break;
      case 'helmet':
        add(hs * 1.1, hs * 0.4, hs * 1.12, 0, top + hs * 0.08, 0, new THREE.MeshStandardMaterial({ color: a.hatColor, roughness: 0.3, metalness: 0.2 }));
        break;
    }
    this.bones[P.HEAD].add(g);
    this.hat = g;
  }

  /** Detach hat from the head (returns it in world space) */
  detachHat(): THREE.Object3D | null {
    const h = this.hat;
    if (!h) return null;
    h.updateMatrixWorld(true);
    const m = h.matrixWorld.clone();
    h.removeFromParent();
    m.decompose(h.position, h.quaternion, h.scale);
    this.hat = null;
    return h;
  }

  setExpression(e: Expression): void {
    if (this.atlas.expression === e) return;
    this.atlas.drawFace(e);
  }

  applyPose(pose: Pose): void {
    for (let i = 0; i < PART_COUNT; i++) this.bones[i].quaternion.copy(pose.q[i]);
    this.bones[P.PELVIS].position.copy(this.rig.joint[P.PELVIS]).add(pose.root);
  }

  /** Recompute world matrices of part boxes (call after root/bones moved). */
  updateMatrices(frame?: number): void {
    if (frame !== undefined && this.matricesFrame === frame) return;
    this.matricesFrame = frame ?? -1;
    this.root.updateMatrixWorld(true);
    for (let i = 0; i < PART_COUNT; i++) {
      const bm = this.boxMatrix[i];
      bm.copy(this.bones[i].matrixWorld);
      _v.copy(this.rig.center[i]);
      bm.multiply(_m.makeTranslation(_v.x, _v.y, _v.z));
      this.boxInv[i].copy(bm).invert();
    }
  }

  /** Record part centers (for ragdoll initial velocities). */
  trackCenters(): void {
    for (let i = 0; i < PART_COUNT; i++) {
      this.prevCenters[i].copy(this.currCenters[i]);
      this.currCenters[i].setFromMatrixPosition(this.boxMatrix[i]);
    }
  }

  partCenter(i: number, out: THREE.Vector3): THREE.Vector3 {
    return out.setFromMatrixPosition(this.boxMatrix[i]);
  }

  /** world-space box transform of a part */
  partTransform(i: number, pos: THREE.Vector3, quat: THREE.Quaternion): void {
    this.boxMatrix[i].decompose(pos, quat, _v2);
  }

  /** Raycast against intact/carved parts. Returns nearest hit. */
  raycast(origin: THREE.Vector3, dir: THREE.Vector3, maxDist: number, inflate = 0, out?: PartHit): PartHit | null {
    let best: PartHit | null = null;
    const lp = new THREE.Vector3();
    const ln = new THREE.Vector3();
    const infl = new THREE.Vector3();
    for (let i = 0; i < PART_COUNT; i++) {
      if (this.severed[i] || this.destroyed[i]) continue;
      infl.copy(this.half[i]).addScalar(inflate);
      const d = rayOBB(origin, dir, this.boxInv[i], infl, best ? best.dist : maxDist, lp, ln);
      if (d < 0) continue;
      let dist = d;
      const vox = this.voxels[i];
      if (vox) {
        // march into voxel grid to find first solid voxel
        const res = this.marchVoxels(vox, i, origin, dir, d, best ? best.dist : maxDist, lp, ln);
        if (res < 0) continue;
        dist = res;
      }
      if (!best || dist < best.dist) {
        best = out ?? { part: 0, dist: 0, local: new THREE.Vector3(), localNormal: new THREE.Vector3(), world: new THREE.Vector3(), face: 0 };
        best.part = i;
        best.dist = dist;
        best.local.copy(lp);
        // clamp to box (inflated rays may land outside)
        best.local.x = THREE.MathUtils.clamp(best.local.x, -this.half[i].x, this.half[i].x);
        best.local.y = THREE.MathUtils.clamp(best.local.y, -this.half[i].y, this.half[i].y);
        best.local.z = THREE.MathUtils.clamp(best.local.z, -this.half[i].z, this.half[i].z);
        best.localNormal.copy(ln);
        best.world.copy(origin).addScaledVector(dir, dist);
        best.face = boxFaceCoords(best.local.x, best.local.y, best.local.z, this.half[i].x, this.half[i].y, this.half[i].z, _st);
      }
    }
    return best;
  }

  private marchVoxels(vox: VoxelPart, part: number, origin: THREE.Vector3, dir: THREE.Vector3, tEnter: number, maxDist: number, outLocal: THREE.Vector3, outNormal: THREE.Vector3): number {
    const inv = this.boxInv[part];
    const o = _v.copy(origin).applyMatrix4(inv);
    const d = _v2.copy(dir).transformDirection(inv);
    const step = Math.min(vox.vs.x, vox.vs.y, vox.vs.z) * 0.45;
    const h = vox.half;
    const eps = 1e-3;
    let t = tEnter;
    for (let k = 0; k < 96 && t <= maxDist; k++, t += step) {
      const px = o.x + d.x * t,
        py = o.y + d.y * t,
        pz = o.z + d.z * t;
      if (k > 0 && (Math.abs(px) > h.x + eps || Math.abs(py) > h.y + eps || Math.abs(pz) > h.z + eps)) return -1;
      const ix = Math.min(vox.nx - 1, Math.max(0, Math.floor((px + h.x) / vox.vs.x)));
      const iy = Math.min(vox.ny - 1, Math.max(0, Math.floor((py + h.y) / vox.vs.y)));
      const iz = Math.min(vox.nz - 1, Math.max(0, Math.floor((pz + h.z) / vox.vs.z)));
      if (vox.get(ix, iy, iz)) {
        outLocal.set(px, py, pz);
        if (k > 0) {
          const ax = Math.abs(d.x),
            ay = Math.abs(d.y),
            az = Math.abs(d.z);
          outNormal.set(0, 0, 0);
          if (ax >= ay && ax >= az) outNormal.x = -Math.sign(d.x);
          else if (ay >= az) outNormal.y = -Math.sign(d.y);
          else outNormal.z = -Math.sign(d.z);
        }
        return t;
      }
    }
    return -1;
  }

  // ------------------------------------------------------------- damage
  ensureVoxels(part: number): VoxelPart {
    let v = this.voxels[part];
    if (!v) {
      const [nx, ny, nz] = this.rig.vox[part];
      v = new VoxelPart(part, nx, ny, nz, this.rig.size[part]);
      this.voxels[part] = v;
    }
    return v;
  }

  carve(part: number, local: THREE.Vector3, radius: number, dirLocal: THREE.Vector3 | null, maxRemove: number, out: RemovedVoxel[]): number {
    if (this.severed[part] || this.destroyed[part]) return 0;
    const v = this.ensureVoxels(part);
    const n = v.carve(local, radius, dirLocal, maxRemove, out);
    if (n > 0) this.dirtyParts.add(part);
    return n;
  }

  obliterate(part: number, out: RemovedVoxel[]): void {
    const v = this.ensureVoxels(part);
    v.obliterate(out, part === P.HEAD ? 2 : 3);
    this.destroyed[part] = true;
    this.dirtyParts.add(part);
    if (part === P.HEAD && this.hat) {
      this.hat.visible = false;
    }
  }

  /** Rebuild meshes for parts whose voxels changed. */
  flushParts(): void {
    if (this.dirtyParts.size === 0) return;
    for (const part of this.dirtyParts) {
      const v = this.voxels[part];
      if (!v) continue;
      this.hidden[part] = true;
      let mesh = this.partMeshes[part];
      if (this.destroyed[part] || v.solid === 0) {
        if (mesh) {
          mesh.removeFromParent();
          mesh.geometry.dispose();
          this.partMeshes[part] = null;
        }
        continue;
      }
      const geo = v.buildGeometry(this.atlas, this.rig.center[part]);
      if (!mesh) {
        mesh = new THREE.Mesh(geo, this.material);
        mesh.castShadow = true;
        mesh.receiveShadow = true;
        this.partMeshes[part] = mesh;
        if (!this.severed[part]) this.bones[part].add(mesh);
      } else {
        mesh.geometry.dispose();
        mesh.geometry = geo;
      }
    }
    this.dirtyParts.clear();
    this.rebuildIndex();
  }

  rebuildIndex(): void {
    const idx: number[] = [];
    for (let i = 0; i < PART_COUNT; i++) {
      if (this.hidden[i] || this.severed[i] || this.destroyed[i]) continue;
      for (let k = 0; k < 36; k++) idx.push(this.baseIndex[i * 36 + k]);
    }
    this.skinned.geometry.setIndex(idx);
  }

  /**
   * Detach a part's visual into a standalone mesh (for gibs). Returns a mesh
   * in world space positioned at the part's box center (geometry centered).
   */
  detachPartMesh(part: number): THREE.Mesh {
    this.severed[part] = true;
    const v = this.voxels[part];
    let geo: THREE.BufferGeometry;
    const zero = new THREE.Vector3();
    if (v && v.solid > 0) geo = v.buildGeometry(this.atlas, zero);
    else {
      const acc = { pos: [] as number[], nor: [] as number[], uv: [] as number[], idx: [] as number[], skinIndex: [] as number[], bone: 0 };
      buildBoxPart(this.atlas, part, this.rig.size[part], zero, acc);
      geo = new THREE.BufferGeometry();
      geo.setAttribute('position', new THREE.Float32BufferAttribute(acc.pos, 3));
      geo.setAttribute('normal', new THREE.Float32BufferAttribute(acc.nor, 3));
      geo.setAttribute('uv', new THREE.Float32BufferAttribute(acc.uv, 2));
      geo.setIndex(acc.idx);
    }
    const old = this.partMeshes[part];
    if (old) {
      old.removeFromParent();
      old.geometry.dispose();
      this.partMeshes[part] = null;
    }
    const mesh = new THREE.Mesh(geo, this.material);
    mesh.castShadow = true;
    this.boxMatrix[part].decompose(mesh.position, mesh.quaternion, _v);
    if (part === P.HEAD && this.hat) {
      // keep hat on the severed head
      const hat = this.hat;
      hat.removeFromParent();
      hat.position.y -= this.rig.center[P.HEAD].y;
      mesh.add(hat);
      this.hat = null;
    }
    this.rebuildIndex();
    return mesh;
  }

  /** world position of the right hand grip */
  gripWorld(out: THREE.Vector3, left = false): THREE.Vector3 {
    const b = this.bones[left ? P.LARM_L : P.LARM_R];
    return out.copy(this.rig.grip).applyMatrix4(b.matrixWorld);
  }

  attachHeld(obj: THREE.Object3D | null, left = false): void {
    if (this.held) this.held.removeFromParent();
    this.held = obj;
    if (obj) {
      this.bones[left ? P.LARM_L : P.LARM_R].add(obj);
      obj.position.copy(this.rig.grip);
    }
  }

  worldQuatOfBone(i: number, out: THREE.Quaternion): THREE.Quaternion {
    return this.bones[i].getWorldQuaternion(out);
  }
}

export { _q as _tmpQuat };
