// Character rigs for survivors and special infected: one continuous skinned
// mesh per character (body + clothing layers + hair in a single geometry with
// one group per texture atlas) driven by the Body's 12 bone frames, plus
// per-part attachment groups for rigid add-ons. Optional x-ray silhouettes
// render teammates through walls (L4D-style glow) without self-overlap.
import * as THREE from 'three';
import { PART, NBONES, partMatrix, boneMatrices, J } from './body.js';
import { footMatrix } from './crowd.js';
import { xrayMaterial } from './charshade.js';
import { getCharacterAsset } from './charlooks.js';

// Kept for compatibility (menu portraits etc.): paints a simple face texture.
export function paintFace(o) {
  const W = 256, H = 128;
  const c = document.createElement('canvas');
  c.width = W; c.height = H;
  const g = c.getContext('2d');
  const sk = new THREE.Color(o.skin).convertLinearToSRGB();
  g.fillStyle = `rgb(${(sk.r * 255) | 0},${(sk.g * 255) | 0},${(sk.b * 255) | 0})`;
  g.fillRect(0, 0, W, H);
  const t = new THREE.CanvasTexture(c);
  t.colorSpace = THREE.SRGBColorSpace;
  return t;
}

// Build the parts description for a look. look.id selects a character recipe
// (bill, zoey, louis, francis, hunter, smoker, boomer, tank, witch); unknown
// looks fall back to a generic survivor built from the look's colours.
export function buildHumanoid(look) {
  const parts = {};
  const G = (name) => { const g = new THREE.Group(); g.name = name; g.matrixAutoUpdate = false; parts[name] = g; return g; };
  for (const n of PART_NAMES) G(n);
  G('footL'); G('footR');
  Object.defineProperty(parts, '_asset', { value: getCharacterAsset(look), enumerable: false });
  return parts;
}

const PART_NAMES = ['torso', 'head', 'uarmL', 'farmL', 'uarmR', 'farmR', 'thighL', 'shinL', 'thighR', 'shinR'];
const _m4 = new Float32Array(16);

export class RigModel {
  constructor(scene, parts, opts = {}) {
    this.scene = scene;
    this.root = new THREE.Group();
    this.root.name = opts.name || 'rig';
    this.parts = parts;
    this.partArr = PART_NAMES.map((n) => parts[n]);
    for (const n in parts) this.root.add(parts[n]);
    scene.add(this.root);
    this.arr = new Float32Array(NBONES * 16);
    this.xray = null;
    this.hidden = false;
    const asset = parts._asset;
    this.asset = asset;
    if (asset) {
      this.bones = [];
      for (let i = 0; i < NBONES; i++) {
        const b = new THREE.Bone();
        b.matrixAutoUpdate = false;
        b.matrixWorldAutoUpdate = false;
        this.bones.push(b);
      }
      const inv = asset.bindInv.map((a) => new THREE.Matrix4().fromArray(a));
      this.skeleton = new THREE.Skeleton(this.bones, inv);
      const mesh = new THREE.SkinnedMesh(asset.geometry, asset.materials);
      mesh.bind(this.skeleton, new THREE.Matrix4());
      mesh.castShadow = true;
      mesh.receiveShadow = true;
      mesh.boundingSphere = new THREE.Sphere(new THREE.Vector3(), 1.4 * (asset.radius ?? 1));
      mesh.name = (opts.name || 'rig') + ':skin';
      this.mesh = mesh;
      this.root.add(mesh);
    }
    if (opts.xray) this.makeXray(opts.xray);
  }
  makeXray(color) {
    if (!this.mesh) return;
    const mat = xrayMaterial(color);
    this.xrayMat = mat;
    const geo = this.asset.xrayGeometry || this.asset.geometry;
    const m = new THREE.SkinnedMesh(geo, mat);
    m.bind(this.skeleton, new THREE.Matrix4());
    m.renderOrder = 50;
    m.castShadow = false;
    m.receiveShadow = false;
    m.userData.xray = true;
    m.boundingSphere = this.mesh.boundingSphere;
    this.root.add(m);
    this.xray = [m];
  }
  setXray(on, color) {
    if (!this.xray) return;
    for (const m of this.xray) m.visible = on;
    if (color != null) this.xrayMat.color.set(color);
  }
  setVisible(v) {
    this.root.visible = v;
  }
  update(body) {
    const a = this.arr;
    if (this.mesh) {
      boneMatrices(body, a);
      for (let i = 0; i < NBONES; i++) this.bones[i].matrixWorld.fromArray(a, i * 16);
      this.mesh.boundingSphere.center.set(body.jx(J.PELVIS), body.jy(J.PELVIS), body.jz(J.PELVIS));
      this.mesh.visible = body.visible !== false;
    }
    // rigid attachment groups (only when something is attached)
    for (let i = 0; i < this.partArr.length; i++) {
      const g = this.partArr[i];
      if (!g || g.children.length === 0) continue;
      if (body.severed & (1 << i)) { g.visible = false; continue; }
      g.visible = true;
      partMatrix(body, i, _m4);
      g.matrix.fromArray(_m4);
      g.matrixWorldNeedsUpdate = true;
    }
    const fl = this.parts.footL, fr = this.parts.footR;
    if (fl && fl.children.length) { footMatrix(body, 0, _m4); fl.matrix.fromArray(_m4); fl.matrixWorldNeedsUpdate = true; fl.visible = !(body.severed & (1 << PART.shinL)); }
    if (fr && fr.children.length) { footMatrix(body, 1, _m4); fr.matrix.fromArray(_m4); fr.matrixWorldNeedsUpdate = true; fr.visible = !(body.severed & (1 << PART.shinR)); }
  }
  dispose() {
    this.scene.remove(this.root);
    this.skeleton?.dispose();
    // geometry/materials are cached per character and shared: only dispose
    // attachments that were created for this instance
    for (const g of this.partArr) g?.traverse((o) => { if (o.geometry && !o.userData.shared) o.geometry.dispose?.(); });
  }
}
