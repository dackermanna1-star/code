// Segmented low-poly humanoid rig (rigid parts merged into one SkinnedMesh)
// and a procedural pose animator.
import * as THREE from 'three';
import { MeshKit } from '../engine/meshkit.js';
import { createPS1Material } from '../engine/ps1material.js';
import { canvasFor, mulberry32 } from '../engine/textures.js';

export const BONES = ['root', 'hips', 'spine', 'chest', 'neck', 'head',
  'upperArmL', 'forearmL', 'handL', 'upperArmR', 'forearmR', 'handR',
  'thighL', 'shinL', 'footL', 'thighR', 'shinR', 'footR'];
export const B = Object.fromEntries(BONES.map((n, i) => [n, i]));
const PARENT = [-1, 0, 1, 2, 3, 4, 3, 6, 7, 3, 9, 10, 1, 12, 13, 1, 15, 16];

// ---------- character atlas ----------
// 256x128: [0..64) cloth grime, [64..128) blood grime, [128..256)x[0..64) misc (hazmat, skin rot),
// bottom half: 16 x 4 grid of 16px faces.
export const FACES = {
  gus: 0, maya: 1, trey: 2, silas: 3, earl: 4,
  boomer: 5, hunter: 6, smoker: 7, charger: 8, jockey: 9, spitter: 10, tank: 11, witch: 12, hazmat: 13,
  zombieStart: 16, zombieCount: 40,
};
let atlas = null;
export function charAtlas() {
  if (atlas) return atlas;
  const W = 256, H = 128;
  const c = document.createElement('canvas'); c.width = W; c.height = H;
  const ctx = c.getContext('2d');
  ctx.drawImage(canvasFor('grime', { seed: 11 }), 0, 0);
  ctx.drawImage(canvasFor('grime', { seed: 12, blood: true }), 64, 0);
  // misc region: rotten skin (128..192), hazmat fabric (192..256)
  ctx.drawImage(canvasFor('grime', { seed: 13, blood: true }), 128, 0);
  ctx.fillStyle = 'rgba(80,120,60,0.35)'; ctx.fillRect(128, 0, 64, 64);
  ctx.drawImage(canvasFor('fabric', { seed: 14, color: 0xd8d8d0 }), 192, 0);
  ctx.drawImage(canvasFor('fabric', { seed: 15, color: 0xd8d8d0 }), 224, 0);
  ctx.drawImage(canvasFor('fabric', { seed: 16, color: 0xd8d8d0 }), 192, 32);
  ctx.drawImage(canvasFor('fabric', { seed: 17, color: 0xd8d8d0 }), 224, 32);
  const faceSpecs = [];
  faceSpecs[0] = { skin: 0x8a5a3c, hair: 0x2a2420, beard: 0x8a8a84 };        // Gus
  faceSpecs[1] = { skin: 0xc8946c, hair: 0x1c1410, eye: 'rgb(40,30,20)' };   // Maya
  faceSpecs[2] = { skin: 0xe0b090, hair: 0x6a4a2a };                          // Trey
  faceSpecs[3] = { skin: 0xd8a888, hair: null, beard: 0x5a3a24 };             // Silas
  faceSpecs[4] = { skin: 0xd0a080, hair: 0x9a9a94, beard: 0x9a9a94 };         // Earl
  const zombieSkins = [0x9a8a78, 0xa89880, 0x7a6a58, 0x6a5040, 0xb8a890, 0x8a7a6a, 0x584030, 0xa09070];
  const r = mulberry32(99);
  for (let i = 0; i < 64; i++) {
    let spec = faceSpecs[i];
    if (i === 5) spec = { skin: 0x9aa070, zombie: true, seed: 500 };   // boomer
    else if (i === 6) spec = { skin: 0x4a4a4a, zombie: true, seed: 501 }; // hunter (hood shadow)
    else if (i === 7) spec = { skin: 0x8a7a80, zombie: true, seed: 502 };
    else if (i === 8) spec = { skin: 0x8a7060, zombie: true, seed: 503 };
    else if (i === 9) spec = { skin: 0xa08a70, zombie: true, seed: 504 };
    else if (i === 10) spec = { skin: 0x8a9a70, zombie: true, seed: 505 };
    else if (i === 11) spec = { skin: 0x8a8870, zombie: true, seed: 506 };
    else if (i === 12) spec = { skin: 0xd8d0c8, zombie: true, seed: 507 };
    else if (i === 13) spec = null;
    else if (!spec) spec = { skin: zombieSkins[(r() * zombieSkins.length) | 0], zombie: true, hair: r() < 0.6 ? [0x2a2018, 0x4a3420, 0x7a6a50, 0x1a1a1a, 0x8a7a6a][(r() * 5) | 0] : undefined, seed: 600 + i };
    const x = (i % 16) * 16, y = 64 + ((i / 16) | 0) * 16;
    if (spec) ctx.drawImage(canvasFor('face', spec), x, y);
    else {
      // hazmat gas-mask face
      ctx.fillStyle = 'rgb(200,190,60)'; ctx.fillRect(x, y, 16, 16);
      ctx.fillStyle = 'rgb(40,40,40)'; ctx.fillRect(x + 2, y + 4, 12, 9);
      ctx.fillStyle = 'rgb(120,150,140)'; ctx.fillRect(x + 3, y + 5, 4, 3); ctx.fillRect(x + 9, y + 5, 4, 3);
      ctx.fillStyle = 'rgb(70,70,70)'; ctx.fillRect(x + 6, y + 10, 4, 4);
    }
  }
  // special faces: glowing spitter throat, witch eyes
  const tex = new THREE.CanvasTexture(c);
  tex.magFilter = THREE.NearestFilter; tex.minFilter = THREE.NearestFilter; tex.generateMipmaps = false;
  tex.colorSpace = THREE.NoColorSpace;
  const reg = (x0, y0, x1, y1) => [x0 / W, 1 - y1 / H, x1 / W, 1 - y0 / H];
  atlas = {
    texture: tex, canvas: c,
    cloth: reg(1, 1, 63, 63), blood: reg(65, 1, 127, 63), rot: reg(129, 1, 191, 63), fabric: reg(193, 1, 255, 63),
    face: (i) => { const x = (i % 16) * 16, y = 64 + ((i / 16) | 0) * 16; return reg(x + 0.5, y + 0.5, x + 15.5, y + 15.5); },
    flat: reg(2, 2, 3, 3),
  };
  return atlas;
}

// ---------- rig construction ----------
/**
 * spec: {
 *  scale, build ('average'|'heavy'|'thin'|'muscle'), female, skin, shirt, pants, shoes, hair, hairStyle,
 *  sleeves ('long'|'short'|'none'), jacket, face, blood (bool), extra: (kit, ctx) => {}
 *  bonesScale: {boneName: [sx,sy,sz]} proportion overrides applied to bind positions
 * }
 */
export function buildHumanoid(spec) {
  const A = charAtlas();
  const kit = new MeshKit();
  const s = spec.scale || 1;
  const heavy = spec.build === 'heavy', thin = spec.build === 'thin', muscle = spec.build === 'muscle';
  const w = heavy ? 1.28 : thin ? 0.85 : muscle ? 1.18 : 1.0;
  const fem = !!spec.female;
  // bind positions (relative to parent)
  const legLen = spec.legLen || 1, armLen = spec.armLen || 1, torsoLen = spec.torsoLen || 1;
  const rel = {
    root: [0, 0, 0],
    hips: [0, 0.98 * legLen, 0],
    spine: [0, 0.12 * torsoLen, 0],
    chest: [0, 0.2 * torsoLen, 0],
    neck: [0, 0.22 * torsoLen, 0],
    head: [0, 0.08, 0],
    upperArmL: [0.2 * w * (fem ? 0.9 : 1), 0.18 * torsoLen, 0], forearmL: [0, -0.29 * armLen, 0], handL: [0, -0.26 * armLen, 0],
    upperArmR: [-0.2 * w * (fem ? 0.9 : 1), 0.18 * torsoLen, 0], forearmR: [0, -0.29 * armLen, 0], handR: [0, -0.26 * armLen, 0],
    thighL: [0.1 * w, -0.06, 0], shinL: [0, -0.44 * legLen, 0], footL: [0, -0.42 * legLen, 0],
    thighR: [-0.1 * w, -0.06, 0], shinR: [0, -0.44 * legLen, 0], footR: [0, -0.42 * legLen, 0],
  };
  if (spec.rel) for (const k in spec.rel) rel[k] = spec.rel[k];
  // world bind positions
  const wpos = [];
  for (let i = 0; i < BONES.length; i++) {
    const r = rel[BONES[i]];
    const p = new THREE.Vector3(r[0] * s, r[1] * s, r[2] * s);
    if (PARENT[i] >= 0) p.add(wpos[PARENT[i]]);
    wpos.push(p);
  }
  const ctx = { kit, wpos, s, w, A, spec };
  const part = (bone, c, size, color, opts = {}) => {
    kit.curBone = B[bone];
    const bp = wpos[B[bone]];
    kit.push([bp.x, bp.y, bp.z], [0, 0, 0], [s, s, s]);
    kit.box(c, size, color, { uv: opts.uv || (spec.blood ? A.blood : A.cloth), ...opts });
    kit.pop();
  };
  ctx.part = part;
  const skin = spec.skin !== undefined ? spec.skin : 0xc89a78;
  const shirt = spec.shirt !== undefined ? spec.shirt : 0x7a7a7a;
  const pants = spec.pants !== undefined ? spec.pants : 0x3a4a6a;
  const shoes = spec.shoes !== undefined ? spec.shoes : 0x2a2420;
  const sleeve = spec.jacket !== undefined && spec.jacket !== null ? spec.jacket : shirt;
  const uvBody = spec.blood ? A.blood : A.cloth;
  const skinUV = spec.rot ? A.rot : uvBody;
  // torso
  part('hips', [0, -0.02, 0], [0.34 * w, 0.2, 0.2 * (heavy ? 1.2 : 1)], pants);
  part('spine', [0, 0.1, heavy ? 0.03 : 0], [0.32 * w * (fem ? 0.9 : 1), 0.22, 0.19 * (heavy ? 1.45 : 1)], spec.jacket ? spec.jacket : shirt, { taper: [1.05, 1] });
  part('chest', [0, 0.11, 0], [0.4 * w * (fem ? 0.88 : 1), 0.26, 0.22 * (heavy ? 1.2 : 1)], spec.jacket ? spec.jacket : shirt, { taper: [1.08, 0.95], taperBottom: [0.85, 1] });
  if (spec.jacket && spec.shirt !== undefined) {
    // open jacket: shirt strip on front
    part('chest', [0, 0.1, 0.112 * (heavy ? 1.2 : 1)], [0.12 * w, 0.24, 0.01], shirt, { skip: { back: true } });
    part('spine', [0, 0.1, 0.1 * (heavy ? 1.45 : 1) + (heavy ? 0.03 : 0)], [0.12 * w, 0.2, 0.01], shirt, { skip: { back: true } });
  }
  part('neck', [0, 0.04, 0], [0.1, 0.1, 0.1], skin, { uv: skinUV });
  // head (front uses face)
  const faceUV = A.face(spec.face !== undefined ? spec.face : FACES.zombieStart);
  const hair = spec.hair;
  const headColors = { top: hair !== undefined && hair !== null && spec.hairStyle !== 'bald' ? hair : skin, back: hair !== undefined && hair !== null && spec.hairStyle !== 'bald' ? hair : skin };
  part('head', [0, 0.12, 0], [0.2, 0.24, 0.22], skin, { colors: { ...headColors, front: 0xffffff }, uvs: { front: faceUV }, uv: skinUV, taper: [0.95, 0.95] });
  if (hair !== undefined && hair !== null) {
    if (spec.hairStyle === 'long') part('head', [0, 0.06, -0.08], [0.22, 0.3, 0.1], hair);
    if (spec.hairStyle === 'ponytail') part('head', [0, 0.1, -0.14], [0.08, 0.18, 0.08], hair);
    if (spec.hairStyle === 'short' || spec.hairStyle === 'ponytail' || spec.hairStyle === 'long') part('head', [0, 0.235, -0.01], [0.21, 0.04, 0.23], hair);
  }
  if (spec.hairStyle === 'cap') {
    part('head', [0, 0.24, 0], [0.22, 0.06, 0.23], spec.capColor || 0x8a2020);
    part('head', [0, 0.215, spec.capBack ? -0.17 : 0.17], [0.18, 0.02, 0.12], spec.capColor || 0x8a2020);
  }
  if (spec.hairStyle === 'hood') {
    part('head', [0, 0.13, -0.02], [0.26, 0.3, 0.26], spec.hoodColor || sleeve, { skip: { front: true } });
    part('head', [0, 0.27, 0.03], [0.24, 0.04, 0.22], spec.hoodColor || sleeve);
  }
  // arms
  const sleeveLong = spec.sleeves !== 'short' && spec.sleeves !== 'none';
  for (const side of ['L', 'R']) {
    const armW = heavy ? 1.2 : muscle ? 1.3 : thin ? 0.85 : 1;
    if (spec.sleeves === 'none') part('upperArm' + side, [0, -0.14, 0], [0.1 * armW, 0.29, 0.1 * armW], skin, { uv: skinUV });
    else if (spec.sleeves === 'short') {
      part('upperArm' + side, [0, -0.07, 0], [0.12 * armW, 0.15, 0.12 * armW], sleeve);
      part('upperArm' + side, [0, -0.2, 0], [0.09 * armW, 0.16, 0.09 * armW], skin, { uv: skinUV });
    } else part('upperArm' + side, [0, -0.14, 0], [0.11 * armW, 0.3, 0.115 * armW], sleeve, { taperBottom: [0.85, 0.85] });
    part('forearm' + side, [0, -0.13, 0], [0.09 * armW, 0.27, 0.09 * armW], sleeveLong ? sleeve : skin, { taperBottom: [0.8, 0.8], uv: sleeveLong ? uvBody : skinUV });
    part('hand' + side, [0, -0.06, 0.01], [0.075, 0.12, 0.065], spec.gloves || skin, { uv: skinUV });
  }
  // legs
  for (const side of ['L', 'R']) {
    const legW = heavy ? 1.2 : thin ? 0.85 : 1;
    const skirt = spec.skirt && side;
    part('thigh' + side, [0, -0.22, 0], [0.15 * legW, 0.46, 0.16 * legW], skirt ? spec.skirt : pants, { taperBottom: [0.78, 0.8] });
    part('shin' + side, [0, -0.2, 0], [0.12 * legW, 0.42, 0.125 * legW], spec.bareLegs ? skin : pants, { taperBottom: [0.8, 0.85], uv: spec.bareLegs ? skinUV : uvBody });
    part('foot' + side, [0, -0.025, 0.05], [0.11, 0.075, 0.25], shoes);
  }
  if (spec.skirt) part('hips', [0, -0.15, 0], [0.38 * w, 0.28, 0.24], spec.skirt, { taperBottom: [1.25, 1.2] });
  if (spec.extra) spec.extra(ctx);

  const geo = kit.toGeometry(true);
  // skeleton
  const bones = [];
  for (let i = 0; i < BONES.length; i++) {
    const b = new THREE.Bone(); b.name = BONES[i];
    const r = rel[BONES[i]];
    b.position.set(r[0] * s, r[1] * s, r[2] * s);
    if (PARENT[i] >= 0) bones[PARENT[i]].add(b);
    bones.push(b);
  }
  const skeleton = new THREE.Skeleton(bones);
  const mat = createPS1Material({ map: A.texture, tint: true });
  const mesh = new THREE.SkinnedMesh(geo, mat);
  mesh.add(bones[0]);
  mesh.bind(skeleton);
  mesh.frustumCulled = false; // skinned bounds are unreliable; we cull manually by distance
  mesh.userData.bindScale = s;
  return { mesh, bones, skeleton, material: mat, rel, wpos };
}

// ---------- animation ----------
const _q1 = new THREE.Quaternion();
const _e1 = new THREE.Euler();

/** Holds target and current Euler angles per bone, with smoothing. */
export class PoseAnimator {
  constructor(rig) {
    this.rig = rig;
    this.n = BONES.length;
    this.cur = new Float32Array(this.n * 3);
    this.tgt = new Float32Array(this.n * 3);
    this.rootOff = new THREE.Vector3(); this.rootOffT = new THREE.Vector3();
    this.rootRot = new THREE.Vector3(); this.rootRotT = new THREE.Vector3();
    this.scaleT = new Float32Array(this.n).fill(1); // bone scale (dismemberment)
    this.rate = 14;
    this.stepTimer = 0;
    this.stepRate = 0; // >0 = quantised (choppy) animation updates per second
  }
  reset() { this.tgt.fill(0); this.rootOffT.set(0, 0, 0); this.rootRotT.set(0, 0, 0); }
  set(bone, x = 0, y = 0, z = 0) { const i = B[bone] * 3; this.tgt[i] = x; this.tgt[i + 1] = y; this.tgt[i + 2] = z; }
  add(bone, x = 0, y = 0, z = 0) { const i = B[bone] * 3; this.tgt[i] += x; this.tgt[i + 1] += y; this.tgt[i + 2] += z; }
  snap() { this.cur.set(this.tgt); this.rootOff.copy(this.rootOffT); this.rootRot.copy(this.rootRotT); }
  apply(dt, rate = this.rate) {
    if (this.stepRate > 0) {
      this.stepTimer -= dt;
      if (this.stepTimer > 0) return;
      dt = Math.max(dt, 1 / this.stepRate);
      this.stepTimer = 1 / this.stepRate;
    }
    const k = 1 - Math.exp(-dt * rate);
    const cur = this.cur, tgt = this.tgt;
    for (let i = 0; i < cur.length; i++) cur[i] += (tgt[i] - cur[i]) * k;
    this.rootOff.lerp(this.rootOffT, k);
    this.rootRot.lerp(this.rootRotT, k);
    const bones = this.rig.bones;
    for (let b = 0; b < this.n; b++) {
      _e1.set(cur[b * 3], cur[b * 3 + 1], cur[b * 3 + 2], 'YXZ');
      bones[b].quaternion.setFromEuler(_e1);
      const sc = this.scaleT[b];
      bones[b].scale.set(sc, sc, sc);
    }
    const r = this.rig.rel.root;
    bones[0].position.set(r[0] + this.rootOff.x, r[1] + this.rootOff.y, r[2] + this.rootOff.z);
    _e1.set(this.rootRot.x, this.rootRot.y, this.rootRot.z, 'YXZ');
    bones[0].quaternion.setFromEuler(_e1);
    // hips carry the lower-body offset
  }
}

/** Bone world position helper. */
export function boneWorld(rig, name, out = new THREE.Vector3()) {
  return rig.bones[B[name]].getWorldPosition(out);
}
