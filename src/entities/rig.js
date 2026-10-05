// Stylized humanoid rigs built from primitives, a pose library, and pose blending.
// Characters face +Z. Bones hang their limbs along -Y.
import * as THREE from 'three';
import { addRim } from '../render/renderer.js';
import { sharedAssets } from '../render/materials.js';
import { J } from '../physics/ragdoll.js';

const BONE_FRAME = {
  pelvis: 'pelvis', spine: 'torso', chest: 'torso', neck: 'head', head: 'head',
  shoulderL: 'upperArmL', elbowL: 'foreArmL', handL: 'foreArmL',
  shoulderR: 'upperArmR', elbowR: 'foreArmR', handR: 'foreArmR',
  hipL: 'thighL', kneeL: 'shinL', footL: 'shinL',
  hipR: 'thighR', kneeR: 'shinR', footR: 'shinR',
};

const geo = new Map();
const G = (key, fn) => { if (!geo.has(key)) geo.set(key, fn()); return geo.get(key); };

function std(color, opts = {}) {
  const m = new THREE.MeshStandardMaterial({ color, roughness: opts.rough ?? 0.75, metalness: opts.metal ?? 0, emissive: opts.emissive ?? 0x000000, emissiveIntensity: opts.ei ?? 1, flatShading: opts.flat ?? false, map: opts.map || null });
  if ((opts.metal ?? 0) > 0.3) { m.envMap = sharedAssets().envMap; m.envMapIntensity = 0.7; }
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

// ------------------------------------------------------------------ body builders

const SKIN = { goblin: 0x52782f, ghoul: 0x7a8a78, brute: 0x5a6a3c, bomber: 0xa04e32, human: 0xc8a080 };

function eyes(rig, color, size = 0.025, spread = 0.045, y = 0.12, z = 0.11) {
  const mat = new THREE.MeshBasicMaterial({ color });
  mat.color.multiplyScalar(2.5);
  const g = G('eye' + size, () => new THREE.SphereGeometry(size, 6, 4));
  rig.eyes.push(rig.add('head', g, mat, -spread, y, z), rig.add('head', g, mat, spread, y, z));
  const A = sharedAssets();
  const glow = new THREE.Sprite(new THREE.SpriteMaterial({ map: A.tex.glow, color, transparent: true, opacity: 0.6, blending: THREE.AdditiveBlending, depthWrite: false }));
  glow.scale.set(0.22, 0.12, 1);
  glow.position.set(0, y, z + 0.02);
  rig.bones.head.add(glow);
  rig.parts.push({ mesh: glow, frame: 'head', bone: 'head' });
}

export function buildBody(kind, opts = {}) {
  const A = sharedAssets();
  const tint = opts.tint;
  switch (kind) {
    case 'skeleton': {
      const rig = new Rig({ scale: opts.scale || 1, shoulderW: 0.2 });
      const bone = std(tint || 0xd8ccb0, { rough: 0.6, rim: 0x8899ff, rimStrength: 0.45 });
      const dark = std(0x2a2420, { rough: 0.9 });
      rig.add('pelvis', G('skPelvis', () => new THREE.BoxGeometry(0.26, 0.12, 0.14)), bone, 0, 0.02, 0);
      rig.add('spine', G('skSpine', () => new THREE.CylinderGeometry(0.03, 0.035, 0.32, 6)), bone, 0, 0.16, -0.03);
      // ribcage
      for (let i = 0; i < 4; i++) {
        const r = rig.add('chest', G('rib' + i, () => new THREE.TorusGeometry(0.13 - i * 0.012, 0.016, 4, 10, Math.PI * 1.5)), bone, 0, 0.0 + i * 0.065, 0.0);
        r.rotation.set(Math.PI / 2, 0, Math.PI * 0.75);
        r.scale.set(1, 0.8, 1);
      }
      rig.add('chest', G('skClav', () => new THREE.BoxGeometry(0.42, 0.04, 0.06)), bone, 0, 0.24, 0);
      rig.add('neck', G('skNeck', () => new THREE.CylinderGeometry(0.025, 0.03, 0.08, 5)), bone, 0, 0.03, 0);
      const skull = rig.add('head', G('skull', () => new THREE.SphereGeometry(0.13, 10, 8)), bone, 0, 0.13, 0.0);
      skull.scale.set(0.95, 1.05, 1.05);
      rig.add('head', G('skJaw', () => new THREE.BoxGeometry(0.15, 0.05, 0.12)), bone, 0, 0.02, 0.05);
      const socket = G('socket', () => new THREE.SphereGeometry(0.035, 6, 4));
      rig.add('head', socket, dark, -0.045, 0.13, 0.1);
      rig.add('head', socket, dark, 0.045, 0.13, 0.1);
      eyes(rig, opts.eyeColor || 0x66ccff, 0.018, 0.045, 0.13, 0.115);
      if (opts.crown) {
        const crown = rig.add('head', G('crown', () => new THREE.CylinderGeometry(0.12, 0.13, 0.08, 8, 1, true)), A.gold, 0, 0.25, 0);
        for (let i = 0; i < 6; i++) rig.add('head', G('crownSpike', () => new THREE.ConeGeometry(0.025, 0.08, 4)), A.gold, Math.cos(i) * 0.12, 0.32, Math.sin(i) * 0.12);
        void crown;
      }
      for (const s of ['L', 'R']) {
        rig.limb('shoulder' + s, rig.P.upper, 0.025, 0.022, bone);
        rig.limb('elbow' + s, rig.P.fore, 0.022, 0.018, bone);
        rig.add('hand' + s, G('skHand', () => new THREE.BoxGeometry(0.06, 0.08, 0.04)), bone, 0, -0.04, 0);
        rig.limb('hip' + s, rig.P.thigh, 0.03, 0.026, bone);
        rig.limb('knee' + s, rig.P.shin, 0.026, 0.022, bone);
        rig.add('foot' + s, G('skFoot', () => new THREE.BoxGeometry(0.08, 0.04, 0.16)), bone, 0, -0.02, 0.04);
      }
      if (opts.armor) {
        const rust = std(0x6a5a4a, { metal: 0.6, rough: 0.5 });
        rig.add('chest', G('skPlate', () => new THREE.BoxGeometry(0.3, 0.26, 0.2)), rust, 0, 0.1, 0.02);
        rig.add('head', G('skHelm', () => new THREE.SphereGeometry(0.145, 10, 6, 0, Math.PI * 2, 0, Math.PI / 2)), rust, 0, 0.14, 0);
      }
      if (opts.cape) {
        const cape = rig.add('chest', G('cape', () => { const g = new THREE.PlaneGeometry(0.5, 1.1, 1, 4); g.translate(0, -0.45, 0); return g; }), std(0x3a0a12, { rough: 1 }), 0, 0.25, -0.12);
        cape.material.side = THREE.DoubleSide;
        cape.rotation.x = 0.15;
      }
      return rig;
    }
    case 'goblin': {
      const rig = new Rig({ scale: opts.scale || 0.72, headR: 0.17, torso: 0.5, shoulderW: 0.2 });
      const skin = std(tint || SKIN.goblin, { rough: 0.7, rim: 0xaaff88, rimStrength: 0.3 });
      const leather = std(0x5a3a22, { rough: 0.9 });
      rig.add('pelvis', G('gobPelvis', () => new THREE.BoxGeometry(0.26, 0.16, 0.18)), leather, 0, 0, 0);
      const torso = rig.add('chest', G('gobTorso', () => new THREE.SphereGeometry(0.17, 10, 8)), skin, 0, 0.0, 0.02);
      torso.scale.set(1.05, 1.25, 0.9);
      rig.add('chest', G('gobVest', () => new THREE.CylinderGeometry(0.17, 0.19, 0.22, 8, 1, true)), leather, 0, 0.0, 0.0).scale.set(1.05, 1, 0.92);
      const head = rig.add('head', G('gobHead', () => new THREE.SphereGeometry(0.17, 10, 8)), skin, 0, 0.14, 0.02);
      head.scale.set(1.0, 0.92, 1.05);
      const ear = G('gobEar', () => { const g = new THREE.ConeGeometry(0.05, 0.28, 4); g.rotateZ(Math.PI / 2); return g; });
      rig.add('head', ear, skin, -0.25, 0.17, -0.02, 0, 0, -0.35);
      rig.add('head', ear, skin, 0.25, 0.17, -0.02, 0, Math.PI, -0.35);
      rig.add('head', G('gobNose', () => new THREE.ConeGeometry(0.035, 0.14, 5)), skin, 0, 0.12, 0.2, Math.PI / 2, 0, 0);
      eyes(rig, 0xffdd33, 0.028, 0.07, 0.17, 0.14);
      for (const s of ['L', 'R']) {
        rig.limb('shoulder' + s, rig.P.upper, 0.045, 0.04, skin);
        rig.limb('elbow' + s, rig.P.fore, 0.04, 0.035, skin);
        rig.add('hand' + s, G('gobHand', () => new THREE.SphereGeometry(0.05, 6, 5)), skin, 0, -0.03, 0);
        rig.limb('hip' + s, rig.P.thigh, 0.055, 0.045, leather);
        rig.limb('knee' + s, rig.P.shin, 0.045, 0.04, skin);
        rig.add('foot' + s, G('gobFoot', () => new THREE.BoxGeometry(0.09, 0.05, 0.2)), skin, 0, -0.02, 0.05);
      }
      return rig;
    }
    case 'ghoul': {
      const rig = new Rig({ scale: opts.scale || 1.0, upper: 0.36, fore: 0.36, torso: 0.5, shoulderW: 0.19 });
      const skin = std(tint || SKIN.ghoul, { rough: 0.8, rim: 0x99ffcc, rimStrength: 0.3 });
      const rag = std(0x3a3430, { rough: 1 });
      rig.add('pelvis', G('ghPelvis', () => new THREE.BoxGeometry(0.24, 0.16, 0.16)), rag, 0, 0, 0);
      rig.add('spine', G('ghBelly', () => new THREE.CylinderGeometry(0.1, 0.11, 0.26, 7)), skin, 0, 0.14, 0);
      const t = rig.add('chest', G('ghChest', () => new THREE.CylinderGeometry(0.17, 0.11, 0.3, 7)), skin, 0, 0.1, 0);
      t.scale.z = 0.7;
      for (let i = 0; i < 3; i++) rig.add('chest', G('ghRib', () => new THREE.BoxGeometry(0.28, 0.015, 0.02)), std(0x9aa898), 0, 0.02 + i * 0.06, 0.09);
      const head = rig.add('head', G('ghHead', () => new THREE.SphereGeometry(0.12, 8, 7)), skin, 0, 0.11, 0.02);
      head.scale.set(0.9, 1.15, 1);
      rig.add('head', G('ghJaw', () => new THREE.BoxGeometry(0.13, 0.08, 0.1)), skin, 0, 0.0, 0.06, 0.4, 0, 0);
      rig.add('head', G('ghMouth', () => new THREE.BoxGeometry(0.1, 0.03, 0.02)), new THREE.MeshBasicMaterial({ color: 0x220000 }), 0, 0.04, 0.12);
      eyes(rig, 0xaaff66, 0.022, 0.04, 0.13, 0.1);
      const claw = G('ghClaw', () => new THREE.ConeGeometry(0.012, 0.12, 4));
      for (const s of ['L', 'R']) {
        rig.limb('shoulder' + s, rig.P.upper, 0.035, 0.03, skin);
        rig.limb('elbow' + s, rig.P.fore, 0.03, 0.025, skin);
        rig.add('hand' + s, G('ghHand', () => new THREE.BoxGeometry(0.07, 0.08, 0.04)), skin, 0, -0.04, 0);
        for (let i = -1; i <= 1; i++) rig.add('hand' + s, claw, std(0x1a1a14), i * 0.025, -0.12, 0.01, Math.PI, 0, 0);
        rig.limb('hip' + s, rig.P.thigh, 0.045, 0.035, rag);
        rig.limb('knee' + s, rig.P.shin, 0.035, 0.03, skin);
        rig.add('foot' + s, G('ghFoot', () => new THREE.BoxGeometry(0.08, 0.04, 0.17)), skin, 0, -0.02, 0.05);
      }
      return rig;
    }
    case 'brute': {
      const rig = new Rig({ scale: opts.scale || 1.35, torso: 0.62, shoulderW: 0.33, hipW: 0.14, upper: 0.32, fore: 0.32, headR: 0.12, hipH: 0.9 });
      const skin = std(tint || SKIN.brute, { rough: 0.7, rim: 0xffaa66, rimStrength: 0.18 });
      const leather = std(0x4a3020, { rough: 0.9 });
      const iron = std(0x5a5a60, { metal: 0.7, rough: 0.45 });
      rig.add('pelvis', G('brPelvis', () => new THREE.BoxGeometry(0.42, 0.24, 0.3)), leather, 0, 0, 0);
      rig.add('spine', G('brBelly', () => new THREE.SphereGeometry(0.24, 10, 8)), skin, 0, 0.18, 0.04).scale.set(1, 0.9, 0.9);
      const t = rig.add('chest', G('brChest', () => new THREE.BoxGeometry(0.62, 0.42, 0.36)), skin, 0, 0.12, 0);
      t.rotation.x = 0.1;
      rig.add('chest', G('brStrap', () => new THREE.BoxGeometry(0.08, 0.6, 0.38)), leather, 0.05, 0.1, 0, 0, 0, 0.6);
      for (const s of [-1, 1]) {
        const pad = rig.add('chest', G('brPad', () => new THREE.SphereGeometry(0.16, 8, 6, 0, Math.PI * 2, 0, Math.PI / 2)), iron, 0.33 * s, 0.3, 0);
        pad.rotation.z = -0.4 * s;
        rig.add('chest', G('brSpike', () => new THREE.ConeGeometry(0.035, 0.14, 4)), iron, 0.38 * s, 0.4, 0, 0, 0, -0.5 * s);
      }
      const head = rig.add('head', G('brHead', () => new THREE.BoxGeometry(0.22, 0.24, 0.24)), skin, 0, 0.1, 0.06);
      head.rotation.x = 0.1;
      const tusk = G('tusk', () => new THREE.ConeGeometry(0.02, 0.09, 4));
      rig.add('head', tusk, std(0xeeeedd), -0.06, 0.03, 0.18, -0.4, 0, 0);
      rig.add('head', tusk, std(0xeeeedd), 0.06, 0.03, 0.18, -0.4, 0, 0);
      rig.add('head', G('brBrow', () => new THREE.BoxGeometry(0.24, 0.05, 0.06)), skin, 0, 0.15, 0.17);
      eyes(rig, 0xff5522, 0.022, 0.055, 0.12, 0.185);
      for (const s of ['L', 'R']) {
        rig.limb('shoulder' + s, rig.P.upper, 0.1, 0.085, skin);
        rig.limb('elbow' + s, rig.P.fore, 0.085, 0.075, skin);
        rig.add('elbow' + s, G('brBracer', () => new THREE.CylinderGeometry(0.09, 0.085, 0.14, 8)), leather, 0, -0.2, 0);
        rig.add('hand' + s, G('brHand', () => new THREE.SphereGeometry(0.085, 8, 6)), skin, 0, -0.05, 0);
        rig.limb('hip' + s, rig.P.thigh, 0.11, 0.09, leather);
        rig.limb('knee' + s, rig.P.shin, 0.09, 0.075, skin);
        rig.add('foot' + s, G('brFoot', () => new THREE.BoxGeometry(0.16, 0.08, 0.26)), leather, 0, -0.03, 0.05);
      }
      if (opts.apron) rig.add('spine', G('apron', () => new THREE.BoxGeometry(0.44, 0.55, 0.04)), std(0x6a5a4a, { rough: 1 }), 0, 0.05, 0.25);
      return rig;
    }
    case 'cultist': {
      const rig = new Rig({ scale: opts.scale || 1.0, shoulderW: 0.19 });
      const robe = std(tint || 0x3a1a3a, { rough: 0.95, rim: 0xff66aa, rimStrength: 0.35 });
      const dark = new THREE.MeshBasicMaterial({ color: 0x050205 });
      const skirt = rig.add('pelvis', G('robeSkirt', () => { const g = new THREE.CylinderGeometry(0.17, 0.36, 0.92, 10, 1, true); g.translate(0, -0.42, 0); return g; }), robe, 0, 0.05, 0);
      skirt.material.side = THREE.DoubleSide;
      rig.add('spine', G('robeTorso', () => new THREE.CylinderGeometry(0.17, 0.17, 0.32, 10)), robe, 0, 0.15, 0);
      rig.add('chest', G('robeChest', () => new THREE.CylinderGeometry(0.22, 0.17, 0.3, 10)), robe, 0, 0.12, 0);
      rig.add('chest', G('sash', () => new THREE.TorusGeometry(0.19, 0.02, 4, 12)), std(0xaa7722, { metal: 0.6, rough: 0.4 }), 0, -0.05, 0, Math.PI / 2, 0, 0);
      rig.add('head', G('hood', () => new THREE.ConeGeometry(0.17, 0.4, 10)), robe, 0, 0.18, -0.02);
      rig.add('head', G('hoodFace', () => new THREE.SphereGeometry(0.11, 8, 6)), dark, 0, 0.1, 0.05);
      eyes(rig, opts.eyeColor || 0xff3322, 0.02, 0.04, 0.12, 0.13);
      for (const s of ['L', 'R']) {
        rig.limb('shoulder' + s, rig.P.upper, 0.06, 0.07, robe);
        rig.limb('elbow' + s, rig.P.fore, 0.07, 0.09, robe);
        rig.add('hand' + s, G('cuHand', () => new THREE.SphereGeometry(0.04, 6, 5)), std(0xb8a090), 0, -0.04, 0);
        rig.limb('hip' + s, rig.P.thigh, 0.05, 0.045, robe);
        rig.limb('knee' + s, rig.P.shin, 0.045, 0.04, robe);
        rig.add('foot' + s, G('cuFoot', () => new THREE.BoxGeometry(0.08, 0.05, 0.16)), dark, 0, -0.02, 0.04);
      }
      return rig;
    }
    case 'knight': {
      const rig = new Rig({ scale: opts.scale || 1.08, shoulderW: 0.24, torso: 0.58 });
      const steel = std(tint || 0x8a8f99, { metal: 0.8, rough: 0.35, rim: 0xaaccff, rimStrength: 0.4, map: A.metal.map });
      const dark = std(0x2a2a30, { metal: 0.5, rough: 0.6 });
      const cloth = std(opts.tabard || 0x6a1a1a, { rough: 1 });
      rig.add('pelvis', G('knPelvis', () => new THREE.BoxGeometry(0.34, 0.2, 0.22)), steel, 0, 0, 0);
      rig.add('pelvis', G('knSkirt', () => { const g = new THREE.CylinderGeometry(0.18, 0.24, 0.3, 8, 1, true); g.translate(0, -0.12, 0); return g; }), dark, 0, 0, 0);
      rig.add('spine', G('knBelly', () => new THREE.BoxGeometry(0.3, 0.26, 0.2)), dark, 0, 0.14, 0);
      const ch = rig.add('chest', G('knChest', () => new THREE.CylinderGeometry(0.24, 0.18, 0.36, 8)), steel, 0, 0.1, 0);
      ch.scale.z = 0.75;
      rig.add('chest', G('knTabard', () => new THREE.BoxGeometry(0.22, 0.6, 0.02)), cloth, 0, -0.1, 0.15);
      for (const s of [-1, 1]) rig.add('chest', G('knPauldron', () => new THREE.SphereGeometry(0.13, 8, 6, 0, Math.PI * 2, 0, Math.PI / 2)), steel, 0.25 * s, 0.26, 0, 0, 0, -0.5 * s);
      rig.add('head', G('knHelm', () => new THREE.CylinderGeometry(0.13, 0.14, 0.28, 10)), steel, 0, 0.13, 0);
      rig.add('head', G('knHelmTop', () => new THREE.SphereGeometry(0.13, 10, 5, 0, Math.PI * 2, 0, Math.PI / 2)), steel, 0, 0.27, 0);
      rig.add('head', G('knVisor', () => new THREE.BoxGeometry(0.2, 0.025, 0.04)), new THREE.MeshBasicMaterial({ color: 0x000000 }), 0, 0.16, 0.13);
      eyes(rig, opts.eyeColor || 0xff4422, 0.016, 0.04, 0.16, 0.135);
      if (opts.plume) rig.add('head', G('plume', () => new THREE.BoxGeometry(0.04, 0.16, 0.3)), cloth, 0, 0.38, -0.05);
      for (const s of ['L', 'R']) {
        rig.limb('shoulder' + s, rig.P.upper, 0.065, 0.055, steel);
        rig.limb('elbow' + s, rig.P.fore, 0.055, 0.05, steel);
        rig.add('hand' + s, G('knHand', () => new THREE.BoxGeometry(0.08, 0.1, 0.07)), dark, 0, -0.04, 0);
        rig.limb('hip' + s, rig.P.thigh, 0.075, 0.06, dark);
        rig.limb('knee' + s, rig.P.shin, 0.06, 0.055, steel);
        rig.add('foot' + s, G('knFoot', () => new THREE.BoxGeometry(0.11, 0.07, 0.22)), steel, 0, -0.025, 0.05);
      }
      return rig;
    }
    case 'bomber': {
      const rig = new Rig({ scale: opts.scale || 0.85, torso: 0.5, shoulderW: 0.22, headR: 0.11 });
      const skin = std(tint || SKIN.bomber, { rough: 0.7, rim: 0xffaa55, rimStrength: 0.35 });
      const glowMat = new THREE.MeshStandardMaterial({ color: 0xff7a20, emissive: 0xff5a10, emissiveIntensity: 2.2, roughness: 0.4 });
      rig.add('pelvis', G('boPelvis', () => new THREE.BoxGeometry(0.24, 0.14, 0.16)), std(0x3a2a1a), 0, 0, 0);
      const belly = rig.add('spine', G('boBelly', () => new THREE.SphereGeometry(0.28, 12, 10)), skin, 0, 0.22, 0.06);
      belly.scale.set(1, 1, 1.05);
      const core = rig.add('spine', G('boCore', () => new THREE.SphereGeometry(0.2, 10, 8)), glowMat, 0, 0.22, 0.16);
      rig.glowCore = core;
      for (let i = 0; i < 5; i++) rig.add('spine', G('boStitch', () => new THREE.BoxGeometry(0.02, 0.12, 0.02)), std(0x1a1010), -0.12 + i * 0.06, 0.24, 0.34, 0, 0, 0.3);
      rig.add('head', G('boHead', () => new THREE.SphereGeometry(0.11, 8, 7)), skin, 0, 0.08, 0.04);
      rig.add('head', G('boHorn', () => new THREE.ConeGeometry(0.025, 0.12, 4)), std(0x2a1a10), -0.07, 0.18, 0, 0, 0, 0.4);
      rig.add('head', G('boHorn', () => new THREE.ConeGeometry(0.025, 0.12, 4)), std(0x2a1a10), 0.07, 0.18, 0, 0, 0, -0.4);
      eyes(rig, 0xffee55, 0.02, 0.04, 0.1, 0.1);
      for (const s of ['L', 'R']) {
        rig.limb('shoulder' + s, rig.P.upper, 0.04, 0.035, skin);
        rig.limb('elbow' + s, rig.P.fore, 0.035, 0.03, skin);
        rig.add('hand' + s, G('boHand', () => new THREE.SphereGeometry(0.045, 6, 5)), skin, 0, -0.03, 0);
        rig.limb('hip' + s, rig.P.thigh, 0.05, 0.04, skin);
        rig.limb('knee' + s, rig.P.shin, 0.04, 0.035, skin);
        rig.add('foot' + s, G('boFoot', () => new THREE.BoxGeometry(0.09, 0.05, 0.17)), skin, 0, -0.02, 0.04);
      }
      return rig;
    }
    default:
      return buildBody('skeleton', opts);
  }
}

// ------------------------------------------------------------------ enemy weapons

export function buildEnemyWeapon(kind, scale = 1) {
  const A = sharedAssets();
  const g = new THREE.Group();
  const steel = std(0x9a9a9e, { metal: 0.85, rough: 0.35, map: A.metal.map });
  const rust = std(0x7a5a48, { metal: 0.5, rough: 0.6 });
  const wood = std(0x5a3a22, { rough: 0.9 });
  const add = (geo, mat, x = 0, y = 0, z = 0, rx = 0, ry = 0, rz = 0) => { const m = new THREE.Mesh(geo, mat); m.position.set(x, y, z); m.rotation.set(rx, ry, rz); g.add(m); return m; };
  let length = 0.9;
  switch (kind) {
    case 'sword':
      add(G('ewBlade', () => new THREE.BoxGeometry(0.06, 0.8, 0.015)), rust, 0, 0.5, 0);
      add(G('ewGuard', () => new THREE.BoxGeometry(0.2, 0.03, 0.04)), A.darkMetal, 0, 0.1, 0);
      add(G('ewGrip', () => new THREE.CylinderGeometry(0.018, 0.018, 0.16, 6)), wood, 0, 0.0, 0);
      length = 0.9;
      break;
    case 'dagger':
      add(G('ewDagger', () => new THREE.ConeGeometry(0.03, 0.32, 4)), steel, 0, 0.22, 0);
      add(G('ewDGrip', () => new THREE.CylinderGeometry(0.015, 0.015, 0.1, 5)), wood, 0, 0, 0);
      length = 0.38;
      break;
    case 'club':
      add(G('ewClub', () => new THREE.CylinderGeometry(0.1, 0.04, 0.9, 7)), wood, 0, 0.42, 0);
      for (let i = 0; i < 5; i++) add(G('ewNail', () => new THREE.ConeGeometry(0.02, 0.08, 4)), A.darkMetal, Math.cos(i * 1.3) * 0.09, 0.65 + (i % 3) * 0.08, Math.sin(i * 1.3) * 0.09, 0, 0, Math.PI / 2 - i);
      length = 0.95;
      break;
    case 'cleaver':
      add(G('ewCleaverH', () => new THREE.CylinderGeometry(0.03, 0.03, 0.4, 6)), wood, 0, 0.05, 0);
      add(G('ewCleaver', () => new THREE.BoxGeometry(0.34, 0.75, 0.025)), steel, 0.1, 0.6, 0);
      length = 1.0;
      break;
    case 'staff':
      add(G('ewStaff', () => new THREE.CylinderGeometry(0.022, 0.026, 1.6, 6)), wood, 0, 0.3, 0);
      add(G('ewOrb', () => new THREE.SphereGeometry(0.07, 10, 8)), new THREE.MeshStandardMaterial({ color: 0xff5522, emissive: 0xff3311, emissiveIntensity: 3 }), 0, 1.15, 0);
      add(G('ewCage', () => new THREE.TorusGeometry(0.085, 0.01, 4, 10)), A.darkMetal, 0, 1.15, 0, Math.PI / 2, 0, 0);
      length = 1.2;
      break;
    case 'bow': {
      const curve = new THREE.CatmullRomCurve3([new THREE.Vector3(0, -0.55, 0.0), new THREE.Vector3(0, -0.25, 0.1), new THREE.Vector3(0, 0, 0.12), new THREE.Vector3(0, 0.25, 0.1), new THREE.Vector3(0, 0.55, 0)]);
      add(G('ewBow', () => new THREE.TubeGeometry(curve, 10, 0.02, 4, false)), wood, 0, 0, 0);
      add(G('ewString', () => new THREE.CylinderGeometry(0.004, 0.004, 1.1, 3)), std(0xdddddd), 0, 0, 0.0);
      length = 0.6;
      break;
    }
    case 'shield':
      add(G('ewShield', () => new THREE.CylinderGeometry(0.34, 0.34, 0.05, 12)), std(0x6a1a1a, { rough: 0.7 }), 0, 0, 0, Math.PI / 2, 0, 0);
      add(G('ewShieldRim', () => new THREE.TorusGeometry(0.34, 0.025, 4, 16)), A.darkMetal, 0, 0, 0.0);
      add(G('ewBoss', () => new THREE.SphereGeometry(0.07, 8, 6)), A.darkMetal, 0, 0, 0.03);
      length = 0.4;
      break;
    case 'greatsword':
      add(G('ewGS', () => new THREE.BoxGeometry(0.1, 1.5, 0.02)), steel, 0, 0.85, 0);
      add(G('ewGSGuard', () => new THREE.BoxGeometry(0.4, 0.05, 0.06)), A.darkMetal, 0, 0.1, 0);
      add(G('ewGSGrip', () => new THREE.CylinderGeometry(0.025, 0.025, 0.28, 6)), wood, 0, -0.04, 0);
      length = 1.6;
      break;
    case 'mace':
      add(G('ewMaceH', () => new THREE.CylinderGeometry(0.025, 0.025, 0.7, 6)), wood, 0, 0.3, 0);
      add(G('ewMaceHead', () => new THREE.IcosahedronGeometry(0.13, 0)), A.darkMetal, 0, 0.7, 0);
      length = 0.8;
      break;
    default:
      length = 0.3;
  }
  g.scale.setScalar(scale);
  return { group: g, length: length * scale };
}
