import * as THREE from 'three';
import { BareHand } from '../../gojo/BareHand';
import { RAMP_CHAR, addOutline, outlineMaterial, toon } from '../render/Toon';
import { Expr, FaceSet } from './Face';
import { BoneName, Rig } from './Rig';

/**
 * A built character: skeleton, skinned body, rigid head/hair/hands/props on
 * bones, ink outlines and a face whose expression can change.
 */
export class CharModel {
  readonly group = new THREE.Group();
  readonly outlines: THREE.Object3D[] = [];
  readonly meshes: THREE.Mesh[] = [];
  body!: THREE.SkinnedMesh;
  head!: THREE.Mesh;
  faceMat!: THREE.MeshToonMaterial;
  faces!: FaceSet;
  hands!: { L: BareHand; R: BareHand };
  expr: Expr = 'neutral';
  /** height of the eyes above the root (camera / look-at anchor) */
  eyeHeight = 1.7;
  readonly outline: THREE.ShaderMaterial;
  private shadowOnly = false;

  constructor(
    readonly rig: Rig,
    outlinePx = 2.4,
  ) {
    this.group.add(rig.bones.root);
    this.outline = outlineMaterial(outlinePx);
  }

  bone(n: BoneName) {
    return this.rig.bones[n];
  }

  /** Frees the GPU side: geometry, materials and the face canvases. */
  dispose() {
    disposeTree(this.group);
    if (this.faces) {
      for (const t of this.faces.maps.values()) t.dispose();
      this.faces.glow.dispose();
    }
    this.rig.skeleton.dispose();
  }

  setBody(geo: THREE.BufferGeometry, mat: THREE.Material) {
    const m = new THREE.SkinnedMesh(geo, mat);
    m.bind(this.rig.skeleton);
    m.frustumCulled = false;
    m.castShadow = true;
    m.receiveShadow = true;
    this.group.add(m);
    this.body = m;
    this.meshes.push(m);
    this.outlines.push(addOutline(m, this.outline));
    return m;
  }

  /** Rigid mesh on a bone, positioned in bind space (world-aligned bones). */
  attach(bone: BoneName, geo: THREE.BufferGeometry, mat: THREE.Material, bindPos: THREE.Vector3, outline = true, rot?: THREE.Euler) {
    const m = new THREE.Mesh(geo, mat);
    const b = this.rig.bones[bone];
    m.position.copy(bindPos).sub(this.rig.joints[bone]);
    if (rot) m.rotation.copy(rot);
    m.castShadow = true;
    m.receiveShadow = true;
    b.add(m);
    this.meshes.push(m);
    if (outline) this.outlines.push(addOutline(m, this.outline));
    return m;
  }

  setHead(geo: THREE.BufferGeometry, faces: FaceSet, at: THREE.Vector3) {
    this.faces = faces;
    this.faceMat = new THREE.MeshToonMaterial({
      color: 0xffffff,
      map: faces.maps.get('neutral')!,
      gradientMap: RAMP_CHAR,
      emissive: 0xffffff,
      emissiveMap: faces.glow,
      emissiveIntensity: faces.style.glow * 1.6,
    });
    this.head = this.attach('head', geo, this.faceMat, at);
    this.eyeHeight = at.y;
  }

  setExpr(e: Expr) {
    if (e === this.expr || !this.faces) return;
    this.expr = e;
    this.faceMat.map = this.faces.maps.get(e) ?? this.faces.maps.get('neutral')!;
    this.faceMat.needsUpdate = true;
  }

  /** Bare hands on the wrists, fingers down, backs facing out, thumbs forward. */
  setHands(mats: { skin: THREE.Material; skinD: THREE.Material; nail: THREE.Material }, scale: number) {
    const L = new BareHand(-1, mats);
    const R = new BareHand(1, mats);
    for (const [h, side] of [
      [L, 1],
      [R, -1],
    ] as [BareHand, number][]) {
      const bone = this.rig.bones[side > 0 ? 'handL' : 'handR'];
      // hand frame: fingers -Z, back +Y, wrist +Z → bone frame: fingers -Y, back ±X (outward), wrist +Y
      const back = new THREE.Vector3(side, 0, 0);
      const wrist = new THREE.Vector3(0, 1, 0);
      const x = new THREE.Vector3().crossVectors(back, wrist);
      const m = new THREE.Matrix4().makeBasis(x, back, wrist);
      h.group.quaternion.setFromRotationMatrix(m);
      h.group.scale.setScalar(scale);
      h.group.position.copy(h.wrist).multiplyScalar(-scale).applyQuaternion(h.group.quaternion);
      bone.add(h.group);
      for (const mesh of h.meshes()) {
        mesh.castShadow = true;
        mesh.receiveShadow = true;
        this.meshes.push(mesh);
      }
    }
    this.hands = { L, R };
  }

  update(dt: number) {
    this.hands?.L.update(dt);
    this.hands?.R.update(dt);
  }

  /** First person: the body still casts a shadow but is never drawn. */
  setShadowOnly(on: boolean) {
    if (on === this.shadowOnly) return;
    this.shadowOnly = on;
    for (const m of this.meshes) {
      const mats = Array.isArray(m.material) ? m.material : [m.material];
      for (const mat of mats) {
        mat.colorWrite = !on;
        mat.depthWrite = !on;
      }
    }
    for (const o of this.outlines) o.visible = !on;
  }

  set visible(v: boolean) {
    this.group.visible = v;
  }
  get visible() {
    return this.group.visible;
  }
}

/** Skin materials for BareHand. */
export function handMats(skin: number, skinD: number, nail: number) {
  return {
    skin: toon(skin, { rim: 0.3 }),
    skinD: toon(skinD, { rim: 0.3 }),
    nail: toon(nail),
  };
}

/** Disposes every geometry and material under an object (textures shared through ramps are left alone). */
export function disposeTree(o: THREE.Object3D) {
  o.traverse((c) => {
    const m = c as THREE.Mesh;
    if (m.geometry) m.geometry.dispose();
    const mats = Array.isArray(m.material) ? m.material : m.material ? [m.material] : [];
    for (const mt of mats) mt.dispose();
  });
}
