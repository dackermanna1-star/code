// Convert a Microsoft Rocketbox avatar (MIT, https://github.com/microsoft/Microsoft-Rocketbox) into the
// game's mesh asset: an indexed mesh in metres (Y up, facing +Z), its fingers curled into a loose fist
// (the game's skeleton has no finger bones), skinned to the game's 22 bones, plus the avatar's joint
// positions (src/character/realBody.ts fits it onto a fighter's skeleton when the library is built).
//
// Usage (from the project root):
//   node tools/models/rocketbox.mjs <avatar.fbx> <out.json> [labels.json]
// labels.json (optional) gets per-vertex part labels and UVs for the texture scripts
// (tools/models/scarlet_textures.py, tools/models/avatar_textures.py).
import fs from 'fs';
import path from 'path';
import { pathToFileURL } from 'url';

// FBXLoader wants a DOM for its textures; the textures are handled separately, so stub it.
globalThis.self = globalThis;
globalThis.window = globalThis;
const fakeEl = () => ({ addEventListener() {}, removeEventListener() {}, style: {}, setAttribute() {}, getContext: () => null });
globalThis.document = { createElementNS: fakeEl, createElement: fakeEl };
const root = path.resolve(path.dirname(new URL(import.meta.url).pathname), '../..');
const THREE = await import(pathToFileURL(path.join(root, 'node_modules/three/build/three.module.js')).href);
const { FBXLoader } = await import(pathToFileURL(path.join(root, 'node_modules/three/examples/jsm/loaders/FBXLoader.js')).href);

const [fbxPath, outPath, labelsPath] = process.argv.slice(2);
const buf = fs.readFileSync(fbxPath);
const obj = new FBXLoader().parse(buf.buffer.slice(buf.byteOffset, buf.byteOffset + buf.byteLength), '');
obj.updateMatrixWorld(true);
let mesh = null;
obj.traverse((o) => {
  if (o.isSkinnedMesh && !mesh) mesh = o;
});
if (!mesh) throw new Error('no skinned mesh');
const bones = mesh.skeleton.bones;
const byName = new Map(bones.map((b, i) => [b.name, i]));
const bone = (n) => {
  const i = byName.get(n);
  if (i === undefined) throw new Error('missing bone ' + n);
  return bones[i];
};
const wpos = (n) => bone(n).getWorldPosition(new THREE.Vector3());

// ------------------------------------------------------------------ the fist
// The fingers close together (towards the middle finger) and curl towards the palm, each about the
// axis across its own direction; the thumb then folds over the curled index and middle fingers.
const FINGERS = [1, 2, 3, 4];
const CURL = [88, 100, 72]; // degrees at the knuckle, the middle and the end joint
const turnWorld = (b, q) => {
  // a world-space rotation of a bone about its own origin
  const pq = b.parent.getWorldQuaternion(new THREE.Quaternion());
  const bq = b.getWorldQuaternion(new THREE.Quaternion());
  b.quaternion.copy(pq.clone().invert().multiply(q).multiply(bq));
  obj.updateMatrixWorld(true);
};
for (const side of ['L', 'R']) {
  const P = (n) => `Bip01_${side}_${n}`;
  obj.updateMatrixWorld(true);
  const W = wpos(P('Hand'));
  const I = wpos(P('Finger1'));
  const K = wpos(P('Finger4'));
  const T2 = wpos(P('Finger02'));
  const across = I.clone().sub(K);
  const along = I.clone().add(K).multiplyScalar(0.5).sub(W);
  // the palm's normal: the side the thumb's tip is on
  const palm = new THREE.Vector3().crossVectors(along, across).normalize();
  if (palm.dot(T2.clone().sub(W)) < 0) palm.negate();
  const flat = (v) => v.clone().addScaledVector(palm, -v.dot(palm)).normalize();
  // close the fingers up: each turns (in the palm's plane) most of the way to the middle finger's line
  const mid = flat(wpos(P('Finger21')).sub(wpos(P('Finger2'))));
  for (const f of [1, 3, 4]) {
    const d = flat(wpos(P(`Finger${f}1`)).sub(wpos(P(`Finger${f}`))));
    const ang = Math.atan2(new THREE.Vector3().crossVectors(d, mid).dot(palm), d.dot(mid));
    turnWorld(bone(P(`Finger${f}`)), new THREE.Quaternion().setFromAxisAngle(palm, ang * 0.85));
  }
  for (const f of FINGERS) {
    const chain = [P(`Finger${f}`), P(`Finger${f}1`), P(`Finger${f}2`)];
    // a finger flexes in one plane: every joint turns about the axis across the straight finger
    // (once bent, the finger points along the palm's normal and that cross product means nothing)
    const dir = wpos(chain[1]).sub(wpos(chain[0])).normalize();
    const axisW = new THREE.Vector3().crossVectors(dir, palm).normalize();
    // (the little finger curls a touch more, the index a touch less: a fist's natural roll)
    const extra = (f - 2.5) * 4;
    for (let j = 0; j < 3; j++) turnWorld(bone(chain[j]), new THREE.Quaternion().setFromAxisAngle(axisW, ((CURL[j] + extra) * Math.PI) / 180));
  }
  // the thumb: CCD towards a point over the curled index and middle fingers' middle bones
  const i1 = wpos(P('Finger11')), m1 = wpos(P('Finger21')), i2 = wpos(P('Finger12')), m2 = wpos(P('Finger22'));
  const target = i1.clone().lerp(m1, 0.4).lerp(i2.clone().lerp(m2, 0.4), 0.45).addScaledVector(palm, 0.9);
  const thumb = [P('Finger0'), P('Finger01'), P('Finger02')];
  const tipOf = () => {
    const a = wpos(thumb[2]);
    return a.clone().add(a.clone().sub(wpos(thumb[1])).multiplyScalar(0.75));
  };
  for (let it = 0; it < 16; it++) {
    for (let j = 2; j >= 0; j--) {
      const a = wpos(thumb[j]);
      const tip = tipOf();
      const v0 = tip.clone().sub(a).normalize();
      const v1 = target.clone().sub(a).normalize();
      let q = new THREE.Quaternion().setFromUnitVectors(v0, v1);
      // a little at a time
      const ang = 2 * Math.acos(Math.min(1, Math.abs(q.w)));
      const lim = (j === 0 ? 0.25 : 0.35) * 0.5;
      if (ang > lim) q = new THREE.Quaternion().slerp(q, lim / ang);
      turnWorld(bone(thumb[j]), q);
    }
  }
  console.log(side, 'thumb tip miss (cm)', tipOf().distanceTo(target).toFixed(2));
}
obj.updateMatrixWorld(true);
mesh.skeleton.update();

// ------------------------------------------------------------------ skinning to the posed rest
const g = mesh.geometry;
const P0 = g.attributes.position, N0 = g.attributes.normal, UV0 = g.attributes.uv, SI = g.attributes.skinIndex, SW = g.attributes.skinWeight;
const nv = P0.count;
const boneMats = bones.map((b, i) => new THREE.Matrix4().multiplyMatrices(b.matrixWorld, mesh.skeleton.boneInverses[i]));
const toWorld = mesh.matrixWorld.clone().multiply(mesh.bindMatrixInverse); // mesh space after skinning -> world
const bindM = mesh.bindMatrix;
const M = new THREE.Matrix4(), T = new THREE.Matrix4();
const pos = new Float32Array(nv * 3), nrm = new Float32Array(nv * 3);
const v = new THREE.Vector3(), n = new THREE.Vector3();
const nm = new THREE.Matrix3();
for (let i = 0; i < nv; i++) {
  M.set(0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0);
  for (let k = 0; k < 4; k++) {
    const w = SW.getComponent(i, k);
    if (w <= 0) continue;
    T.copy(boneMats[SI.getComponent(i, k)]);
    for (let e = 0; e < 16; e++) M.elements[e] += T.elements[e] * w;
  }
  M.multiply(bindM);
  M.premultiply(toWorld);
  v.fromBufferAttribute(P0, i).applyMatrix4(M).multiplyScalar(0.01);
  n.fromBufferAttribute(N0, i).applyMatrix3(nm.getNormalMatrix(M)).normalize();
  pos.set([v.x, v.y, v.z], i * 3);
  nrm.set([n.x, n.y, n.z], i * 3);
}

// ------------------------------------------------------------------ the game's bones
// 0 root 1 hips 2 spine 3 chest 4 neck 5 head 6..9 left arm 10..13 right arm 14..17 left leg 18..21 right leg
const G = (name) => {
  if (name === 'Bip01' || name === 'Bip01_Pelvis') return [[1, 1]];
  if (name === 'Bip01_Spine') return [[2, 1]];
  if (name === 'Bip01_Spine1') return [[2, 0.5], [3, 0.5]];
  if (name === 'Bip01_Spine2') return [[3, 1]];
  if (name === 'Bip01_Neck') return [[4, 1]];
  const m = /^Bip01_([LR])_(\w+?)(\d*)$/.exec(name);
  if (m) {
    const L = m[1] === 'L';
    const part = m[2];
    const arm = L ? 6 : 10, leg = L ? 14 : 18;
    if (part === 'Clavicle') return [[arm, 1]];
    if (part === 'UpperArm') return [[arm + 1, 1]];
    if (part === 'Forearm') return [[arm + 2, 1]];
    if (part === 'Hand' || part === 'Finger') return [[arm + 3, 1]];
    if (part === 'Thigh') return [[leg, 1]];
    if (part === 'Calf') return [[leg + 1, 1]];
    if (part === 'Foot') return [[leg + 2, 1]];
    if (part === 'Toe') return [[leg + 3, 1]];
  }
  return [[5, 1]]; // the head and its face bones
};
const gmap = bones.map((b) => G(b.name));
const skinI = new Uint8Array(nv * 4), skinW = new Uint8Array(nv * 4);
const domRB = new Uint8Array(nv);
for (let i = 0; i < nv; i++) {
  const acc = new Map();
  let best = -1, bw = -1;
  for (let k = 0; k < 4; k++) {
    const w = SW.getComponent(i, k);
    if (w <= 0) continue;
    const bi = SI.getComponent(i, k);
    if (w > bw) {
      bw = w;
      best = bi;
    }
    for (const [gb, f] of gmap[bi]) acc.set(gb, (acc.get(gb) ?? 0) + w * f);
  }
  domRB[i] = best;
  const top = [...acc.entries()].sort((a, b) => b[1] - a[1]).slice(0, 4);
  const sum = top.reduce((s, e) => s + e[1], 0);
  let q = 0;
  top.forEach(([gb, w], k) => {
    const qi = k === top.length - 1 ? 255 - q : Math.round((w / sum) * 255);
    q += qi;
    skinI[i * 4 + k] = gb;
    skinW[i * 4 + k] = qi;
  });
}

// ------------------------------------------------------------------ material slots
// Rocketbox materials are named <id>_<slot>: body, head, opacity (hair cards, lashes) and, on some,
// extras (helmet, equipment, pistol, tools...). The game draws three: the extras are packed beside
// the body on a texture twice as wide (the body on the left half, the extras in 512 cells on the
// right), their uvs moved there - tools/models/avatar_textures.py packs the images the same way.
const matNames = (Array.isArray(mesh.material) ? mesh.material : [mesh.material]).map((m) => m.name);
const slotName = (n) => n.replace(/^[a-z]*\d+_/i, '').toLowerCase();
const extras = [...new Set(matNames.map(slotName).filter((x) => !['body', 'head', 'opacity'].includes(x)))].sort();
if (extras.length > 4) throw new Error('more than four extra materials: ' + extras.join(','));
const groups = [...g.groups].sort((a, b) => a.start - b.start);
const matOf = new Uint8Array(nv); // 0 body (+ extras), 1 head, 2 hair cards
const extraOf = new Int8Array(nv).fill(-1);
for (const gr of groups) {
  const sl = slotName(matNames[gr.materialIndex] ?? 'body');
  const m = sl === 'head' ? 1 : sl === 'opacity' ? 2 : 0;
  const ex = extras.indexOf(sl);
  for (let i = gr.start; i < gr.start + gr.count; i++) {
    matOf[i] = m;
    extraOf[i] = ex;
  }
}
const wide = extras.length > 0;
let uvOut = 0;
const uvAt = (i) => {
  let u = UV0.getX(i), v = UV0.getY(i);
  if (u < -0.002 || u > 1.002 || v < -0.002 || v > 1.002) uvOut++;
  u = Math.min(1, Math.max(0, u));
  v = Math.min(1, Math.max(0, v));
  if (!wide || matOf[i] !== 0) return [u, v];
  const ex = extraOf[i];
  if (ex < 0) return [u * 0.5, v];
  const cx = ex % 2, cy = 1 - Math.floor(ex / 2);
  return [0.5 + (cx + u) * 0.25, (cy + v) * 0.5];
};

// ------------------------------------------------------------------ weld into an indexed mesh, by slot
const key = (i) => {
  const r = (x, s) => Math.round(x * s);
  const [u, v] = uvAt(i);
  return [matOf[i], r(pos[i * 3], 1e4), r(pos[i * 3 + 1], 1e4), r(pos[i * 3 + 2], 1e4), r(nrm[i * 3], 100), r(nrm[i * 3 + 1], 100), r(nrm[i * 3 + 2], 100), r(u, 1e5), r(v, 1e5)].join(',');
};
const remap = new Map();
const uniq = [];
const tri = [[], [], []];
for (let t = 0; t < nv / 3; t++) {
  const ids = [];
  for (let c = 0; c < 3; c++) {
    const i = t * 3 + c;
    const kk = key(i);
    let u = remap.get(kk);
    if (u === undefined) {
      u = uniq.length;
      uniq.push(i);
      remap.set(kk, u);
    }
    ids.push(u);
  }
  tri[matOf[t * 3]].push(...ids);
}
const N = uniq.length;
if (N > 65535) throw new Error('too many vertices for 16-bit indices: ' + N);
// quantised: positions in 1/16000 m (to +-2 m), uvs in 1/65535
const POS_Q = 16000;
const outPos = new Int16Array(N * 3), outNrm = new Int8Array(N * 3), outUv = new Uint16Array(N * 2), outSkin = new Uint8Array(N * 8);
const labPos = new Float32Array(N * 3), labUv = new Float32Array(N * 2);
const outRB = new Uint8Array(N), outMat = new Uint8Array(N), outExtra = new Int8Array(N);
uniq.forEach((i, u) => {
  for (let c = 0; c < 3; c++) {
    outPos[u * 3 + c] = Math.max(-32767, Math.min(32767, Math.round(pos[i * 3 + c] * POS_Q)));
    labPos[u * 3 + c] = pos[i * 3 + c];
    outNrm[u * 3 + c] = Math.round(nrm[i * 3 + c] * 127);
  }
  const [uu, vv] = uvAt(i);
  outUv[u * 2] = Math.round(uu * 65535);
  outUv[u * 2 + 1] = Math.round(vv * 65535);
  labUv[u * 2] = uu;
  labUv[u * 2 + 1] = vv;
  for (let c = 0; c < 4; c++) {
    outSkin[u * 8 + c] = skinI[i * 4 + c];
    outSkin[u * 8 + 4 + c] = skinW[i * 4 + c];
  }
  outRB[u] = domRB[i];
  outMat[u] = matOf[i];
  outExtra[u] = extraOf[i];
});
const index = new Uint16Array(tri[0].length + tri[1].length + tri[2].length);
const outGroups = [];
let off = 0;
tri.forEach((t, m) => {
  index.set(t, off);
  outGroups.push({ start: off, count: t.length, mat: ['body', 'head', 'hair'][m] });
  off += t.length;
});
if (uvOut) console.warn(`  ${uvOut} uvs outside 0..1 (clamped)`);

// ------------------------------------------------------------------ joints (metres, after the fist)
const J = (n) => wpos(n).multiplyScalar(0.01).toArray().map((x) => +x.toFixed(5));
const joints = {
  pelvis: J('Bip01_Pelvis'), spine: J('Bip01_Spine'), spine1: J('Bip01_Spine1'), spine2: J('Bip01_Spine2'), neck: J('Bip01_Neck'), head: J('Bip01_Head'),
  eyeL: J('Bip01_LEye'), eyeR: J('Bip01_REye'),
};
for (const [s, S] of [['L', 'L'], ['R', 'R']]) {
  Object.assign(joints, {
    ['clav' + s]: J(`Bip01_${S}_Clavicle`), ['uarm' + s]: J(`Bip01_${S}_UpperArm`), ['farm' + s]: J(`Bip01_${S}_Forearm`), ['hand' + s]: J(`Bip01_${S}_Hand`),
    ['knuckle' + s]: J(`Bip01_${S}_Finger2`),
    ['thigh' + s]: J(`Bip01_${S}_Thigh`), ['shin' + s]: J(`Bip01_${S}_Calf`), ['foot' + s]: J(`Bip01_${S}_Foot`), ['toe' + s]: J(`Bip01_${S}_Toe0`),
  });
}
const b64 = (a) => Buffer.from(a.buffer, a.byteOffset, a.byteLength).toString('base64');
const out = {
  source: path.basename(fbxPath),
  count: N,
  posQ: POS_Q,
  wide,
  extras,
  groups: outGroups,
  joints,
  pos: b64(outPos),
  nrm: b64(outNrm),
  uv: b64(outUv),
  skin: b64(outSkin),
  index: b64(index),
};
fs.writeFileSync(outPath, JSON.stringify(out));
console.log('vertices', N, 'triangles', index.length / 3, 'groups', outGroups.map((g) => `${g.mat}:${g.count / 3}`).join(' '), 'extras', extras.join(',') || '-', 'bytes', fs.statSync(outPath).size);
if (labelsPath) {
  fs.writeFileSync(labelsPath, JSON.stringify({ bones: bones.map((b) => b.name), rb: Array.from(outRB), mat: Array.from(outMat), extra: Array.from(outExtra), extras, wide, uv: Array.from(labUv, (x) => +x.toFixed(6)), pos: Array.from(labPos, (x) => +x.toFixed(4)), index: Array.from(index) }));
}
