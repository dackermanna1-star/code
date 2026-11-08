import * as THREE from 'three';
import { GLTFLoader } from 'three/addons/loaders/GLTFLoader.js';
import { makeSkinMaterial } from './materials.js';

const loader = new GLTFLoader();

/**
 * The character: skinned body, eyes, brows, lashes and a swappable hairstyle,
 * all bound to one skeleton whose rest orientations are identity (so every
 * rotation is expressed in the character frame: +X = her left, +Y = up,
 * +Z = forward).
 */
export class Character {
  static async load(base = './assets/') {
    const [gltf, meta] = await Promise.all([
      loader.loadAsync(base + 'character.glb'),
      fetch(base + 'character.json').then((r) => r.json()),
    ]);
    return new Character(gltf, meta, base);
  }

  constructor(gltf, meta, base) {
    this.base = base;
    this.meta = meta;
    this.root = new THREE.Group();          // world placement (ground position + heading)
    this.root.name = 'CharacterRoot';
    this.model = gltf.scene;
    this.root.add(this.model);

    this.meshes = {};
    this.model.traverse((o) => {
      if (o.isSkinnedMesh) {
        this.meshes[o.name] = o;
        o.frustumCulled = false;
        o.castShadow = true;
        o.receiveShadow = true;
      }
    });
    this.body = this.meshes.Body;
    this.skeleton = this.body.skeleton;
    this.bones = {};
    for (const b of this.skeleton.bones) this.bones[b.name] = b;

    // rest data
    this.restLocal = {};   // local translation
    this.restModel = {};   // model-space head position
    for (const b of meta.bones) {
      this.restModel[b.name] = new THREE.Vector3().fromArray(b.head);
      this.bones[b.name] && (this.restLocal[b.name] = this.bones[b.name].position.clone());
    }
    this.tailModel = {};
    for (const b of meta.bones) this.tailModel[b.name] = new THREE.Vector3().fromArray(b.tail);
    this.height = meta.height;

    this._setupMaterials();
    this._addEyeBones();
    this.morphs = {};
    for (const m of Object.values(this.meshes)) {
      if (m.morphTargetDictionary) {
        for (const [k, i] of Object.entries(m.morphTargetDictionary)) {
          (this.morphs[k] ||= []).push([m, i]);
        }
      }
    }
    this.hair = null;
    this.hairId = null;
  }

  _setupMaterials() {
    const b = this.body;
    const skinMap = b.material.map;
    b.material = makeSkinMaterial(skinMap);
    this.skinMaterial = b.material;

    const eyes = this.meshes.Eyes;
    if (eyes) {
      const map = eyes.material.map;
      map.colorSpace = THREE.SRGBColorSpace;
      // the outer cornea shell maps to a fully transparent texel: alpha-test it away
      eyes.material = new THREE.MeshPhysicalMaterial({
        map, roughness: 0.25, clearcoat: 1.0, clearcoatRoughness: 0.02, specularIntensity: 0.5,
        alphaTest: 0.5, transparent: false,
      });
      eyes.material.onBeforeCompile = (sh) => {
        // brighten sclera slightly (eyes otherwise read too grey in a white studio)
        sh.fragmentShader = sh.fragmentShader.replace('#include <map_fragment>', '#include <map_fragment>\n diffuseColor.rgb *= 1.12;');
      };
      eyes.castShadow = false;
    }
    const cornea = this.meshes.Cornea;
    if (cornea) {
      // additive, black base: only the wet specular highlight shows
      cornea.material = new THREE.MeshPhysicalMaterial({
        color: 0x000000, roughness: 0.03, metalness: 0, clearcoat: 1, clearcoatRoughness: 0.0,
        specularIntensity: 1, transparent: true, depthWrite: false, blending: THREE.AdditiveBlending,
      });
      cornea.castShadow = false;
      cornea.renderOrder = 4;
    }
    for (const name of ['Eyebrows', 'Eyelashes']) {
      const m = this.meshes[name];
      if (!m) continue;
      const map = m.material.map;
      map.colorSpace = THREE.SRGBColorSpace;
      m.material = new THREE.MeshStandardMaterial({
        map, transparent: true, depthWrite: false, side: THREE.DoubleSide,
        roughness: 0.75, alphaTest: 0.02,
      });
      m.castShadow = false;
      m.renderOrder = 2;
    }
  }

  /** Eyes get their own bones so they can look around and saccade. */
  _addEyeBones() {
    const eyes = this.meshes.Eyes;
    if (!eyes) return;
    const pos = eyes.geometry.attributes.position;
    const cL = new THREE.Vector3(), cR = new THREE.Vector3();
    let nL = 0, nR = 0;
    const v = new THREE.Vector3();
    for (let i = 0; i < pos.count; i++) {
      v.fromBufferAttribute(pos, i);
      if (v.x > 0) { cL.add(v); nL++; } else { cR.add(v); nR++; }
    }
    cL.divideScalar(nL); cR.divideScalar(nR);
    const head = this.bones.head;
    const headPos = this.restModel.head;
    const mk = (name, c) => {
      const bone = new THREE.Bone();
      bone.name = name;
      bone.position.copy(c).sub(headPos);
      head.add(bone);
      this.bones[name] = bone;
      this.restModel[name] = c.clone();
      this.restLocal[name] = bone.position.clone();
      return bone;
    };
    const eL = mk('eye_l', cL), eR = mk('eye_r', cR);
    const bones = [...this.skeleton.bones, eL, eR];
    const inverses = [...this.skeleton.boneInverses,
      new THREE.Matrix4().makeTranslation(-cL.x, -cL.y, -cL.z),
      new THREE.Matrix4().makeTranslation(-cR.x, -cR.y, -cR.z)];
    const sk = new THREE.Skeleton(bones, inverses);
    const si = eyes.geometry.attributes.skinIndex, sw = eyes.geometry.attributes.skinWeight;
    const iL = bones.length - 2, iR = bones.length - 1;
    for (let i = 0; i < pos.count; i++) {
      v.fromBufferAttribute(pos, i);
      si.setXYZW(i, v.x > 0 ? iL : iR, 0, 0, 0);
      sw.setXYZW(i, 1, 0, 0, 0);
    }
    si.needsUpdate = sw.needsUpdate = true;
    eyes.bind(sk, eyes.bindMatrix);
    const cornea = this.meshes.Cornea;
    if (cornea) {
      const cp = cornea.geometry.attributes.position, csi = cornea.geometry.attributes.skinIndex, csw = cornea.geometry.attributes.skinWeight;
      for (let i = 0; i < cp.count; i++) {
        csi.setXYZW(i, cp.getX(i) > 0 ? iL : iR, 0, 0, 0);
        csw.setXYZW(i, 1, 0, 0, 0);
      }
      csi.needsUpdate = csw.needsUpdate = true;
      cornea.bind(sk, cornea.bindMatrix);
    }
    this.eyeCenters = { l: cL, r: cR };
  }

  setMorph(name, w) {
    const list = this.morphs[name];
    if (!list) return;
    for (const [m, i] of list) m.morphTargetInfluences[i] = w;
  }

  async setHair(id, hairMaterialFactory) {
    if (this.hairId === id) return;
    this.hairId = id;
    if (this.hair) {
      this.hair.parent && this.hair.parent.remove(this.hair);
      this.hair.geometry.dispose();
      this.hair = null;
    }
    if (!id || id === 'none') return;
    const entry = this.meta.hair.find((h) => h.id === id);
    if (!entry) return;
    const gltf = await loader.loadAsync(this.base + entry.file);
    if (this.hairId !== id) return;
    let mesh = null;
    gltf.scene.traverse((o) => { if (o.isSkinnedMesh) mesh = o; });
    if (!mesh) return;
    const map = mesh.material.map;
    if (map) map.colorSpace = THREE.SRGBColorSpace;
    mesh.material = hairMaterialFactory ? hairMaterialFactory(map) : mesh.material;
    mesh.frustumCulled = false;
    mesh.castShadow = true;
    mesh.receiveShadow = true;
    mesh.renderOrder = 3;
    // rebind onto our skeleton (identical bone order)
    const geom = mesh.geometry;
    const hairMesh = new THREE.SkinnedMesh(geom, mesh.material);
    hairMesh.name = 'Hair';
    hairMesh.frustumCulled = false;
    hairMesh.castShadow = true;
    hairMesh.receiveShadow = true;
    hairMesh.renderOrder = 3;
    this.model.add(hairMesh);
    hairMesh.bind(this.skeleton, this.body.bindMatrix);
    this.hair = hairMesh;
    return hairMesh;
  }
}
