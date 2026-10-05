// Stylized humanoid rigs built from primitives, a pose library, and pose blending.
// Characters face +Z. Bones hang their limbs along -Y.
import * as THREE from 'three';
import { addRim } from '../render/renderer.js';
import { sharedAssets } from '../render/materials.js';
import { J } from '../physics/ragdoll.js';
import { mergeGeometries } from 'three/addons/utils/BufferGeometryUtils.js';

const BONE_FRAME = {
  pelvis: 'pelvis', spine: 'torso', chest: 'torso', neck: 'head', head: 'head',
  shoulderL: 'upperArmL', elbowL: 'foreArmL', handL: 'foreArmL',
  shoulderR: 'upperArmR', elbowR: 'foreArmR', handR: 'foreArmR',
  hipL: 'thighL', kneeL: 'shinL', footL: 'shinL',
  hipR: 'thighR', kneeR: 'shinR', footR: 'shinR',
};

const geo = new Map();
const MERGED = new Map(); // merged per-bone geometry shared by identical rigs
export const G = (key, fn) => { if (!geo.has(key)) geo.set(key, fn()); return geo.get(key); };

export function std(color, opts = {}) {
  const m = new THREE.MeshStandardMaterial({ color, roughness: opts.rough ?? 0.75, metalness: opts.metal ?? 0, emissive: opts.emissive ?? 0x000000, emissiveIntensity: opts.ei ?? 1, flatShading: opts.flat ?? false, map: opts.map || null, normalMap: opts.normalMap || null });
  if (opts.normalMap && opts.normalScale) m.normalScale.setScalar(opts.normalScale);
  if (opts.side) m.side = opts.side;
  if ((opts.metal ?? 0) > 0.3) { m.envMap = sharedAssets().envMap; m.envMapIntensity = opts.env ?? 0.7; }
  return addRim(m, opts.rim ?? 0x6677aa, opts.rimStrength ?? 0.35);
}

export class Rig {
  constructor(spec) {
    this.spec = spec;
    const s = spec.scale || 1;
    this.scale = s;
    const P = (this.P = {
      hipH: spec.hipH ?? 0.95, torso: spec.torso ?? 0.56, shoulderW: spec.shoulderW ?? 0.21, hipW: spec.hipW ?? 0.1,
      upper: spec.upper ?? 0.3, fore: spec.fore ?? 0.29, thigh: spec.thigh ?? 0.44, shin: spec.shin ?? 0.45, headR: spec.headR ?? 0.13,
    });
    this.root = new THREE.Group();
    this.body = new THREE.Group();
    this.body.scale.setScalar(s);
    this.root.add(this.body);
    const b = (this.bones = {});
    const mk = (name, parent, x, y, z) => {
      const o = new THREE.Object3D();
      o.name = name;
      o.position.set(x, y, z);
      parent.add(o);
      b[name] = o;
      return o;
    };
    mk('pelvis', this.body, 0, P.hipH, 0);
    mk('spine', b.pelvis, 0, 0.02, 0);
    mk('chest', b.spine, 0, P.torso * 0.5, 0);
    mk('neck', b.chest, 0, P.torso * 0.5, 0);
    mk('head', b.neck, 0, 0.07, 0);
    mk('shoulderL', b.chest, P.shoulderW, P.torso * 0.42, 0);
    mk('elbowL', b.shoulderL, 0, -P.upper, 0);
    mk('handL', b.elbowL, 0, -P.fore, 0);
    mk('shoulderR', b.chest, -P.shoulderW, P.torso * 0.42, 0);
    mk('elbowR', b.shoulderR, 0, -P.upper, 0);
    mk('handR', b.elbowR, 0, -P.fore, 0);
    mk('hipL', b.pelvis, P.hipW, 0, 0);
    mk('kneeL', b.hipL, 0, -P.thigh, 0);
    mk('footL', b.kneeL, 0, -P.shin, 0);
    mk('hipR', b.pelvis, -P.hipW, 0, 0);
    mk('kneeR', b.hipR, 0, -P.thigh, 0);
    mk('footR', b.kneeR, 0, -P.shin, 0);
    this.parts = [];
    this.materials = [];
    this.weaponMesh = null;
    this.offhandMesh = null;
    this.eyes = [];
  }

  add(boneName, geometry, material, x = 0, y = 0, z = 0, rx = 0, ry = 0, rz = 0, sx = 1, sy = 1, sz = 1) {
    const m = new THREE.Mesh(geometry, material);
    m.position.set(x, y, z);
    m.rotation.set(rx, ry, rz);
    m.scale.set(sx, sy, sz);
    this.bones[boneName].add(m);
    this.parts.push({ mesh: m, frame: BONE_FRAME[boneName], bone: boneName });
    if (material.userData && material.userData.flash && !this.materials.includes(material)) this.materials.push(material);
    return m;
  }

  // limb segment hanging from a bone: cylinder from 0 to -len
  limb(boneName, len, r0, r1, mat, segs = 6) {
    const g = G(`limb${len.toFixed(3)}_${r0}_${r1}_${segs}`, () => { const c = new THREE.CylinderGeometry(r0, r1, len, segs); c.translate(0, -len / 2, 0); return c; });
    return this.add(boneName, g, mat);
  }

  // A mesh spanning two points in a bone's space; geometry is unit length along +Y, centred.
  seg(boneName, geometry, material, a, b, thick = 1) {
    const d = new THREE.Vector3(b[0] - a[0], b[1] - a[1], b[2] - a[2]);
    const len = d.length();
    const m = this.add(boneName, geometry, material, (a[0] + b[0]) / 2, (a[1] + b[1]) / 2, (a[2] + b[2]) / 2);
    m.quaternion.setFromUnitVectors(new THREE.Vector3(0, 1, 0), d.normalize());
    m.scale.set(thick, len, thick);
    return m;
  }

  // Merge meshes that share a bone and a material into one draw call (ragdoll frames are per bone,
  // so dismemberment is unaffected).
  optimize() {
    const out = [];
    const byBone = new Map();
    for (const p of this.parts) {
      if (!p.mesh.isMesh || p.mesh.parent !== this.bones[p.bone]) { out.push(p); continue; }
      const key = p.bone;
      if (!byBone.has(key)) byBone.set(key, new Map());
      const mats = byBone.get(key);
      if (!mats.has(p.mesh.material)) mats.set(p.mesh.material, []);
      mats.get(p.mesh.material).push(p);
    }
    // material slots in order of first use: identical builds get identical slot numbers
    const slots = new Map();
    for (const p of this.parts) if (p.mesh.isMesh && !slots.has(p.mesh.material)) slots.set(p.mesh.material, slots.size);
    for (const [bone, mats] of byBone) {
      for (const [mat, list] of mats) {
        if (list.length === 1) { out.push(list[0]); continue; }
        const key = this.cacheKey ? `${this.cacheKey}|${bone}|${slots.get(mat)}|${list.length}` : null;
        if (key && MERGED.has(key)) {
          const m = new THREE.Mesh(MERGED.get(key), mat);
          for (const p of list) p.mesh.removeFromParent();
          this.bones[bone].add(m);
          out.push({ mesh: m, frame: list[0].frame, bone });
          continue;
        }
        const geos = [];
        let ok = true;
        const indexed = list.every((p) => p.mesh.geometry.index);
        for (const p of list) {
          p.mesh.updateMatrix();
          const g = indexed ? p.mesh.geometry.clone() : p.mesh.geometry.index ? p.mesh.geometry.toNonIndexed() : p.mesh.geometry.clone();
          if (!g.attributes.uv || !g.attributes.normal) { ok = false; break; }
          for (const k of Object.keys(g.attributes)) if (!['position', 'normal', 'uv'].includes(k)) g.deleteAttribute(k);
          g.applyMatrix4(p.mesh.matrix);
          geos.push(g);
        }
        const merged = ok ? mergeGeometries(geos, false) : null;
        if (!merged) { out.push(...list); continue; }
        merged.computeBoundingSphere();
        if (key) MERGED.set(key, merged);
        const m = new THREE.Mesh(merged, mat);
        for (const p of list) p.mesh.removeFromParent();
        this.bones[bone].add(m);
        out.push({ mesh: m, frame: list[0].frame, bone });
      }
    }
    this.parts = out;
    return this;
  }

  setFlash(v) {
    for (const m of this.materials) m.userData.flash.value = v;
  }

  setRim(color, strength) {
    for (const m of this.materials) m.userData.rim.value.set(color).multiplyScalar(strength);
  }

  jointPositions() {
    const b = this.bones;
    const w = (o, x = 0, y = 0, z = 0) => o.localToWorld(new THREE.Vector3(x, y, z));
    this.root.updateMatrixWorld(true);
    const P = this.P;
    const out = new Array(22);
    out[J.pelvis] = w(b.pelvis);
    out[J.chest] = w(b.chest);
    out[J.neck] = w(b.neck);
    out[J.headBase] = w(b.head);
    out[J.headTop] = w(b.head, 0, P.headR * 2.1, 0);
    out[J.headFront] = w(b.head, 0, P.headR, P.headR * 1.1);
    out[J.shoulderL] = w(b.shoulderL);
    out[J.armRootL] = w(b.shoulderL, 0, -0.01, 0);
    out[J.elbowL] = w(b.elbowL);
    out[J.handL] = w(b.handL, 0, -0.07, 0);
    out[J.shoulderR] = w(b.shoulderR);
    out[J.armRootR] = w(b.shoulderR, 0, -0.01, 0);
    out[J.elbowR] = w(b.elbowR);
    out[J.handR] = w(b.handR, 0, -0.07, 0);
    out[J.hipL] = w(b.hipL);
    out[J.legRootL] = w(b.hipL, 0, -0.01, 0);
    out[J.kneeL] = w(b.kneeL);
    out[J.footL] = w(b.footL, 0, -0.04, 0.04);
    out[J.hipR] = w(b.hipR);
    out[J.legRootR] = w(b.hipR, 0, -0.01, 0);
    out[J.kneeR] = w(b.kneeR);
    out[J.footR] = w(b.footR, 0, -0.04, 0.04);
    return out;
  }

  // Joint positions in the neutral standing pose (same root transform), used as ragdoll rest lengths.
  neutralJoints() {
    const b = this.bones;
    const saved = [];
    for (const k in b) saved.push([b[k], b[k].rotation.clone(), b[k].position.clone()]);
    this.resetPose();
    b.pelvis.position.set(0, this.P.hipH, 0);
    const out = this.jointPositions();
    for (const [o, r, p] of saved) { o.rotation.copy(r); o.position.copy(p); }
    this.root.updateMatrixWorld(true);
    return out;
  }

  // Apply a pose: {bone: [x,y,z]} with weight onto current rotations (assumes rotations reset first)
  resetPose() {
    for (const k in this.bones) this.bones[k].rotation.set(0, 0, 0);
  }
}

export function blendPose(rig, pose, w = 1) {
  if (!pose || w <= 0) return;
  for (const k in pose) {
    const bone = rig.bones[k];
    if (!bone) continue;
    const r = pose[k];
    bone.rotation.x += r[0] * w;
    bone.rotation.y += r[1] * w;
    bone.rotation.z += r[2] * w;
  }
}

// Pose library (radians). Right arm = shoulderR. Positive x on shoulders swings arm forward... (rotation.x negative raises forward)
export const POSES = {
  guard: { shoulderR: [-0.5, 0, 0.15], elbowR: [-0.9, 0, 0], shoulderL: [-0.3, 0, -0.2], elbowL: [-0.6, 0, 0], spine: [0.08, 0, 0] },
  slashWind: { shoulderR: [-2.2, 0.0, 0.9], elbowR: [-1.2, 0, 0], spine: [0, 0.6, 0.05], chest: [0, 0.3, 0], shoulderL: [-0.5, 0, -0.5] },
  slashHit: { shoulderR: [-1.2, 0, -1.3], elbowR: [-0.2, 0, 0], spine: [0.1, -0.7, 0], chest: [0, -0.35, 0], shoulderL: [-0.2, 0, -0.2] },
  overWind: { shoulderR: [-3.0, 0, 0.2], elbowR: [-1.4, 0, 0], shoulderL: [-2.8, 0, -0.2], elbowL: [-1.2, 0, 0], spine: [-0.25, 0, 0], chest: [-0.15, 0, 0] },
  overHit: { shoulderR: [-1.1, 0, 0.1], elbowR: [-0.1, 0, 0], shoulderL: [-1.1, 0, -0.1], elbowL: [-0.1, 0, 0], spine: [0.45, 0, 0], chest: [0.2, 0, 0] },
  stabWind: { shoulderR: [-0.4, 0, 0.3], elbowR: [-2.0, 0, 0], spine: [0, 0.4, 0], hipL: [-0.4, 0, 0], kneeL: [0.6, 0, 0] },
  stabHit: { shoulderR: [-1.6, 0, 0], elbowR: [-0.05, 0, 0], spine: [0.25, -0.3, 0], hipL: [-0.6, 0, 0], kneeL: [0.5, 0, 0], hipR: [0.4, 0, 0] },
  clawWind: { shoulderR: [-2.4, 0, 0.6], shoulderL: [-2.4, 0, -0.6], elbowR: [-0.8, 0, 0], elbowL: [-0.8, 0, 0], spine: [-0.1, 0, 0] },
  clawHit: { shoulderR: [-0.9, 0, -0.6], shoulderL: [-0.9, 0, 0.6], elbowR: [-0.2, 0, 0], elbowL: [-0.2, 0, 0], spine: [0.5, 0, 0], chest: [0.2, 0, 0] },
  bowDraw: { shoulderL: [-1.55, 0.0, -0.05], elbowL: [0, 0, 0], shoulderR: [-1.5, 0, 0.6], elbowR: [-2.3, 0.0, 0], spine: [0, 0.5, 0], neck: [0, -0.5, 0] },
  bowRelease: { shoulderL: [-1.55, 0, -0.05], shoulderR: [-1.2, 0, 1.2], elbowR: [-0.6, 0, 0], spine: [0, 0.5, 0], neck: [0, -0.5, 0] },
  castWind: { shoulderR: [-2.8, 0, 0.3], elbowR: [-0.3, 0, 0], shoulderL: [-0.8, 0, -0.6], elbowL: [-1.0, 0, 0], spine: [-0.2, 0, 0] },
  castHit: { shoulderR: [-1.5, 0, 0], elbowR: [0, 0, 0], shoulderL: [-1.5, 0, 0], spine: [0.2, 0, 0] },
  bashWind: { shoulderL: [-0.6, 0.6, -0.4], elbowL: [-1.2, 0, 0], spine: [0, -0.5, 0] },
  bashHit: { shoulderL: [-1.4, -0.3, 0], elbowL: [-0.6, 0, 0], spine: [0.2, 0.4, 0], hipR: [-0.5, 0, 0], kneeR: [0.4, 0, 0] },
  sweepWind: { shoulderR: [-1.4, 0, 1.6], elbowR: [-0.4, 0, 0], shoulderL: [-1.0, 0, 1.0], spine: [0, 1.1, 0], chest: [0, 0.4, 0] },
  sweepHit: { shoulderR: [-1.4, 0, -1.5], elbowR: [-0.1, 0, 0], shoulderL: [-1.0, 0, -0.6], spine: [0, -1.0, 0], chest: [0, -0.4, 0] },
  roar: { spine: [-0.35, 0, 0], chest: [-0.2, 0, 0], neck: [-0.4, 0, 0], shoulderR: [-0.5, 0, 0.9], shoulderL: [-0.5, 0, -0.9], elbowR: [-1.2, 0, 0], elbowL: [-1.2, 0, 0] },
  charge: { spine: [0.6, 0, 0], neck: [-0.5, 0, 0], shoulderR: [0.6, 0, 0.3], shoulderL: [0.6, 0, -0.3] },
  stagger: { spine: [-0.35, 0, 0.1], chest: [-0.2, 0, 0], neck: [0.3, 0, 0], shoulderR: [-0.6, 0, 0.7], shoulderL: [-0.6, 0, -0.7], hipL: [-0.3, 0, 0], kneeL: [0.5, 0, 0] },
  crouch: { pelvis: [0, 0, 0], hipL: [-0.9, 0, 0], kneeL: [1.6, 0, 0], hipR: [-0.9, 0, 0], kneeR: [1.6, 0, 0], footL: [-0.7, 0, 0], footR: [-0.7, 0, 0], spine: [0.5, 0, 0] },
  leap: { hipL: [-1.4, 0, 0], kneeL: [1.4, 0, 0], hipR: [0.3, 0, 0], kneeR: [0.6, 0, 0], shoulderR: [-2.6, 0, 0.4], shoulderL: [-2.6, 0, -0.4], spine: [0.2, 0, 0] },
  lie: { hipL: [0.1, 0, 0.1], hipR: [0.1, 0, -0.1], shoulderR: [0.3, 0, 0.6], shoulderL: [0.3, 0, -0.6] },
  hunch: { spine: [0.45, 0, 0], neck: [-0.5, 0, 0], shoulderR: [-0.3, 0, 0.1], shoulderL: [-0.3, 0, -0.1] },
  aimWind: { spine: [0, 0.12, 0], neck: [0, -0.1, 0], shoulderR: [-0.06, 0, 0] },
  aimShot: { spine: [-0.06, 0.12, 0], shoulderR: [0.25, 0, 0], elbowR: [-0.2, 0, 0] },
  fly: { shoulderR: [0, 0, 1.2], shoulderL: [0, 0, -1.2], hipL: [0.2, 0, 0], hipR: [0.2, 0, 0], kneeL: [0.4, 0, 0], kneeR: [0.4, 0, 0] },
};

export function walkPose(rig, phase, amt, run = false) {
  const b = rig.bones;
  const s = Math.sin(phase), c = Math.cos(phase);
  const k = amt * (run ? 1.25 : 1);
  b.hipL.rotation.x += s * 0.55 * k;
  b.hipR.rotation.x -= s * 0.55 * k;
  b.kneeL.rotation.x += Math.max(0, -c) * 0.9 * k + 0.05;
  b.kneeR.rotation.x += Math.max(0, c) * 0.9 * k + 0.05;
  b.footL.rotation.x += -s * 0.2 * k;
  b.footR.rotation.x += s * 0.2 * k;
  b.shoulderL.rotation.x -= s * 0.4 * k;
  b.shoulderR.rotation.x += s * 0.4 * k;
  b.spine.rotation.y += s * 0.08 * k;
  b.spine.rotation.x += 0.08 * k * (run ? 2 : 1);
  b.pelvis.position.y = rig.P.hipH - Math.abs(c) * 0.04 * k + 0.02 * k;
}

// ------------------------------------------------------------------ shared body helpers

export function eyes(rig, color, size = 0.025, spread = 0.045, y = 0.12, z = 0.11) {
  const mat = new THREE.MeshBasicMaterial({ color });
  mat.color.multiplyScalar(2.5);
  const g = G('eye' + size, () => new THREE.SphereGeometry(size, 6, 4));
  rig.eyes.push(rig.add('head', g, mat, -spread, y, z), rig.add('head', g, mat, spread, y, z));
  const A = sharedAssets();
  const glow = new THREE.Sprite(new THREE.SpriteMaterial({ map: A.tex.glow, color, transparent: true, opacity: 0.6, blending: THREE.AdditiveBlending, depthWrite: false }));
  glow.scale.set(Math.min(0.22, spread * 2 + size * 5), Math.min(0.12, size * 4.5), 1);
  glow.position.set(0, y, z + 0.02);
  rig.bones.head.add(glow);
  rig.parts.push({ mesh: glow, frame: 'head', bone: 'head' });
}
