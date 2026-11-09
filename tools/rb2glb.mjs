// Convert a Microsoft Rocketbox avatar (FBX + TGA textures, MIT licence) into a compact GLB that
// follows the engine's "Scarlet" conventions: metres, Y up, facing +Z, feet at y = 0, Bip01 rig.
// usage: node rb2glb.mjs <avatarDir> <out.glb> [colorSize=1024] [normalSize=512]
import fs from 'node:fs';
import path from 'node:path';
import * as THREE from 'three';
import { FBXLoader } from 'three/examples/jsm/loaders/FBXLoader.js';
import { Document, NodeIO } from '@gltf-transform/core';
import sharp from 'sharp';

const [, , dir, out, cSizeArg, nSizeArg] = process.argv;
const C_SIZE = +(cSizeArg || 1024), N_SIZE = +(nSizeArg || 512);
const name = path.basename(dir);
const fbxPath = path.join(dir, 'Export', name + '.fbx');

// textures are resolved by file name from the avatar's Textures folder; never fetched by the loader
THREE.TextureLoader.prototype.load = function (url) {
  const t = new THREE.Texture();
  t.userData.url = url;
  return t;
};
globalThis.self = globalThis;

const buf = fs.readFileSync(fbxPath);
const manager = new THREE.LoadingManager();
manager.addHandler(/\.tga$/i, { setPath() { return this; }, load(url) { const t = new THREE.Texture(); t.userData.url = url; return t; } });
const group = new FBXLoader(manager).parse(buf.buffer.slice(buf.byteOffset, buf.byteOffset + buf.byteLength), '');
group.updateMatrixWorld(true);

const skinned = [];
group.traverse((o) => o.isSkinnedMesh && skinned.push(o));
if (!skinned.length) throw new Error('no skinned mesh');
const skeleton = skinned[0].skeleton;
const bones = skeleton.bones;

// ---- TGA decode (types 2, 3, 10, 11; 8/24/32 bpp) -------------------------------------------
function decodeTGA(b) {
  const idLen = b[0], cmapType = b[1], type = b[2];
  const w = b[12] | (b[13] << 8), h = b[14] | (b[15] << 8), bpp = b[16], desc = b[17];
  let p = 18 + idLen + (cmapType ? (b[5] | (b[6] << 8)) * (b[7] >> 3) : 0);
  const px = bpp >> 3, n = w * h, rgba = Buffer.alloc(n * 4);
  const put = (i, o) => {
    if (px === 1) { rgba[i * 4] = rgba[i * 4 + 1] = rgba[i * 4 + 2] = b[o]; rgba[i * 4 + 3] = 255; }
    else { rgba[i * 4] = b[o + 2]; rgba[i * 4 + 1] = b[o + 1]; rgba[i * 4 + 2] = b[o]; rgba[i * 4 + 3] = px === 4 ? b[o + 3] : 255; }
  };
  if (type === 2 || type === 3) for (let i = 0; i < n; i++, p += px) put(i, p);
  else if (type === 10 || type === 11) {
    let i = 0;
    while (i < n) {
      const c = b[p++], cnt = (c & 127) + 1;
      if (c & 128) { for (let k = 0; k < cnt; k++) put(i++, p); p += px; }
      else for (let k = 0; k < cnt; k++, p += px) put(i++, p);
    }
  } else throw new Error('unsupported tga type ' + type);
  if (!(desc & 0x20)) { // bottom-left origin: flip rows
    const row = w * 4, tmp = Buffer.alloc(row);
    for (let y = 0; y < h >> 1; y++) {
      const a = y * row, z = (h - 1 - y) * row;
      rgba.copy(tmp, 0, a, a + row); rgba.copy(rgba, a, z, z + row); tmp.copy(rgba, z);
    }
  }
  return { w, h, rgba };
}
const texDir = path.join(dir, 'Textures');
const texFiles = fs.existsSync(texDir) ? fs.readdirSync(texDir) : [];
function findTex(url) {
  if (!url) return null;
  const base = path.basename(url.replace(/\\/g, '/')).toLowerCase().replace(/\.[a-z]+$/, '');
  const f = texFiles.find((t) => t.toLowerCase().replace(/\.[a-z]+$/, '') === base);
  return f ? path.join(texDir, f) : null;
}
async function encodeTex(file, size, kind, alphaFile = null) {
  const { w, h, rgba } = decodeTGA(fs.readFileSync(file));
  let img = sharp(rgba, { raw: { width: w, height: h, channels: 4 } });
  if (alphaFile) {
    const a = decodeTGA(fs.readFileSync(alphaFile));
    const merged = Buffer.from(rgba);
    for (let i = 0; i < w * h; i++) merged[i * 4 + 3] = a.rgba[i * 4];
    img = sharp(merged, { raw: { width: w, height: h, channels: 4 } });
    return { data: await img.resize(size, size).png({ compressionLevel: 9 }).toBuffer(), mime: 'image/png' };
  }
  if (kind === 'normal') {
    // 3ds Max exports DirectX-style (green down); glTF wants OpenGL-style (green up)
    const flipped = Buffer.from(rgba);
    for (let i = 0; i < w * h; i++) flipped[i * 4 + 1] = 255 - flipped[i * 4 + 1];
    img = sharp(flipped, { raw: { width: w, height: h, channels: 4 } });
  }
  return { data: await img.removeAlpha().resize(size, size).jpeg({ quality: kind === 'normal' ? 88 : 84, mozjpeg: true }).toBuffer(), mime: 'image/jpeg' };
}

// ---- scale / orientation -----------------------------------------------------------------
// bake the skinned mesh into bind space, then measure
const box = new THREE.Box3();
for (const sm of skinned) {
  const g = sm.geometry.clone().applyMatrix4(sm.bindMatrix);
  g.computeBoundingBox();
  box.union(g.boundingBox);
}
const size = box.getSize(new THREE.Vector3());
// pick up axis = longest extent
let up = 'y';
if (size.z > size.y * 1.3) up = 'z';
let s = 1.8 / Math.max(size.x, size.y, size.z);
// round to a clean unit conversion if close (cm -> m)
if (Math.abs(s - 0.01) < 0.003) s = 0.01;
const fix = new THREE.Matrix4();
if (up === 'z') fix.makeRotationX(-Math.PI / 2);
const S = new THREE.Matrix4().makeScale(s, s, s);
const T = new THREE.Matrix4().multiplyMatrices(fix, S); // world fix applied to everything

// facing: in the bind pose the toes should point to +Z
const boneWorld = (b) => b.matrixWorld.clone();
const posOf = (nm) => {
  const b = bones.find((x) => x.name.replace(/[_ ]/g, '') === nm.replace(/[_ ]/g, ''));
  return b ? new THREE.Vector3().setFromMatrixPosition(new THREE.Matrix4().multiplyMatrices(T, boneWorld(b))) : null;
};
const lFoot = posOf('Bip01 L Foot'), lToe = posOf('Bip01 L Toe0'), lThigh = posOf('Bip01 L Thigh'), rThigh = posOf('Bip01 R Thigh');
let yaw = 0;
if (lThigh && rThigh) {
  // left hip must end up on +x when the body faces +z
  const d = lThigh.clone().sub(rThigh);
  yaw = Math.atan2(-d.z, d.x);
}
const Ry = new THREE.Matrix4().makeRotationY(-yaw);
const W = new THREE.Matrix4().multiplyMatrices(Ry, T);
// feet on the floor
let minY = Infinity;
for (const sm of skinned) {
  const g = sm.geometry.clone().applyMatrix4(sm.bindMatrix).applyMatrix4(W);
  g.computeBoundingBox();
  minY = Math.min(minY, g.boundingBox.min.y);
}
const Wf = new THREE.Matrix4().makeTranslation(0, -minY, 0).multiply(W);
const check = (p) => p && p.clone().applyMatrix4(new THREE.Matrix4().makeTranslation(0, -minY, 0).multiply(Ry));
console.log(name, 'up', up, 'scale', s, 'yaw', (yaw * 180 / Math.PI).toFixed(1), 'Lthigh', check(lThigh)?.toArray().map((v) => +v.toFixed(3)), 'Rthigh', check(rThigh)?.toArray().map((v) => +v.toFixed(3)));

// ---- build glTF -----------------------------------------------------------------------------
const doc = new Document();
const buffer = doc.createBuffer();
const scene = doc.createScene(name);
const rootNode = doc.createNode(name);
scene.addChild(rootNode);

// joints: world matrices = Wf * bindWorld; we store them as a flat hierarchy-preserving tree
const boneSet = new Set(bones);
const jointNode = new Map();
const bindWorld = new Map(); // fixed world matrix at bind
// world matrices carry the unit scale; strip it so local translations come out in metres
const unitScale = (m) => {
  const p = new THREE.Vector3(), q = new THREE.Quaternion(), sc = new THREE.Vector3();
  m.decompose(p, q, sc);
  return new THREE.Matrix4().compose(p, q, new THREE.Vector3(1, 1, 1));
};
skeleton.boneInverses.forEach((inv, i) => {
  bindWorld.set(bones[i], unitScale(new THREE.Matrix4().multiplyMatrices(Wf, inv.clone().invert())));
});
// pose bones not in the skin (helpers) from their current world
group.traverse((o) => {
  if (o.isBone && !bindWorld.has(o)) bindWorld.set(o, unitScale(new THREE.Matrix4().multiplyMatrices(Wf, o.matrixWorld)));
});
function boneParent(b) {
  let p = b.parent;
  while (p && !p.isBone) p = p.parent;
  return p;
}
const allBones = [];
group.traverse((o) => o.isBone && allBones.push(o));
for (const b of allBones) {
  const n = doc.createNode(b.name.replace(/_/g, ' '));
  jointNode.set(b, n);
}
const tmpP = new THREE.Vector3(), tmpQ = new THREE.Quaternion(), tmpS = new THREE.Vector3();
for (const b of allBones) {
  const n = jointNode.get(b);
  const p = boneParent(b);
  const local = p ? new THREE.Matrix4().multiplyMatrices(bindWorld.get(p).clone().invert(), bindWorld.get(b)) : bindWorld.get(b).clone();
  local.decompose(tmpP, tmpQ, tmpS);
  n.setTranslation(tmpP.toArray()).setRotation(tmpQ.toArray()).setScale([1, 1, 1]);
  (p ? jointNode.get(p) : rootNode).addChild(n);
}
// recompute bind worlds after dropping any scale so inverse binds match the node tree exactly
const nodeWorld = (b) => {
  const chain = [];
  for (let x = b; x; x = boneParent(x)) chain.unshift(x);
  const m = new THREE.Matrix4();
  for (const x of chain) {
    const n = jointNode.get(x);
    m.multiply(new THREE.Matrix4().compose(new THREE.Vector3(...n.getTranslation()), new THREE.Quaternion(...n.getRotation()), new THREE.Vector3(1, 1, 1)));
  }
  return m;
};

const skin = doc.createSkin(name + '_Rig');
const ibm = new Float32Array(bones.length * 16);
bones.forEach((b, i) => {
  skin.addJoint(jointNode.get(b));
  nodeWorld(b).invert().toArray(ibm, i * 16);
});
skin.setInverseBindMatrices(doc.createAccessor().setType('MAT4').setArray(ibm).setBuffer(buffer));

const mesh = doc.createMesh(name);
const texCache = new Map();
async function tex(file, size, kind, alphaFile) {
  const key = file + kind + (alphaFile || '');
  if (texCache.has(key)) return texCache.get(key);
  const { data, mime } = await encodeTex(file, size, kind, alphaFile);
  const t = doc.createTexture(path.basename(file).replace(/\.tga$/i, '')).setImage(data).setMimeType(mime);
  texCache.set(key, t);
  return t;
}
const normalMat = new THREE.Matrix3();
const byMat = new Map();
for (const sm of skinned) {
  const g = sm.geometry.clone().applyMatrix4(sm.bindMatrix).applyMatrix4(Wf);
  const mats = Array.isArray(sm.material) ? sm.material : [sm.material];
  const cnt = g.index ? g.index.count : g.attributes.position.count;
  const groups = g.groups.length ? g.groups : [{ start: 0, count: cnt, materialIndex: 0 }];
  for (const gr of groups) {
    const m3 = mats[gr.materialIndex ?? 0];
    const key = (m3 && m3.name) || 'mat';
    if (!byMat.has(key)) byMat.set(key, { m3, parts: [] });
    byMat.get(key).parts.push({ g, gr });
  }
}
for (const [mname, { m3, parts }] of byMat) {
  const remap = new Map();
  const P = [], N = [], U = [], J = [], Wt = [], I = [];
  for (const { g, gr } of parts) {
    const pos = g.attributes.position, nor = g.attributes.normal, uv = g.attributes.uv;
    const si = g.attributes.skinIndex, sw = g.attributes.skinWeight;
    const idxSrc = g.index ? g.index.array : null;
    for (let k = gr.start; k < gr.start + gr.count; k++) {
      const v = idxSrc ? idxSrc[k] : k;
      const px = pos.getX(v), py = pos.getY(v), pz = pos.getZ(v);
      const nn = new THREE.Vector3(nor.getX(v), nor.getY(v), nor.getZ(v)).normalize();
      const u0 = uv ? uv.getX(v) : 0, v0 = uv ? 1 - uv.getY(v) : 0;
      const key = [px.toFixed(5), py.toFixed(5), pz.toFixed(5), nn.x.toFixed(3), nn.y.toFixed(3), nn.z.toFixed(3), u0.toFixed(5), v0.toFixed(5)].join(',');
      let r = remap.get(key);
      if (r === undefined) {
        r = remap.size;
        remap.set(key, r);
        P.push(px, py, pz);
        N.push(nn.x, nn.y, nn.z);
        U.push(u0, v0);
        const w4 = [sw.getX(v), sw.getY(v), sw.getZ(v), sw.getW(v)];
        const tot = w4[0] + w4[1] + w4[2] + w4[3] || 1;
        J.push(si.getX(v), si.getY(v), si.getZ(v), si.getW(v));
        Wt.push(...w4.map((x) => x / tot));
      }
      I.push(r);
    }
  }
  const prim = doc.createPrimitive()
    .setAttribute('POSITION', doc.createAccessor().setType('VEC3').setArray(new Float32Array(P)).setBuffer(buffer))
    .setAttribute('NORMAL', doc.createAccessor().setType('VEC3').setArray(new Float32Array(N)).setBuffer(buffer))
    .setAttribute('TEXCOORD_0', doc.createAccessor().setType('VEC2').setArray(new Float32Array(U)).setBuffer(buffer))
    .setAttribute('JOINTS_0', doc.createAccessor().setType('VEC4').setArray(new Uint16Array(J)).setBuffer(buffer))
    .setAttribute('WEIGHTS_0', doc.createAccessor().setType('VEC4').setArray(new Float32Array(Wt)).setBuffer(buffer))
    .setIndices(doc.createAccessor().setType('SCALAR').setArray(remap.size > 65535 ? new Uint32Array(I) : new Uint16Array(I)).setBuffer(buffer));
  const mat = doc.createMaterial(mname).setMetallicFactor(0).setRoughnessFactor(/head|skin/i.test(mname) ? 0.6 : 0.82);
  const mapF = findTex(m3?.map?.userData?.url);
  const norF = findTex(m3?.normalMap?.userData?.url) || (mapF ? findTex(path.basename(mapF).replace(/_color[^.]*/i, '_normal')) : null);
  const alphaF = findTex(m3?.alphaMap?.userData?.url);
  const isOpacity = mapF && /opacity/i.test(mapF);
  if (mapF) {
    if (isOpacity) mat.setBaseColorTexture(await tex(mapF, 512, 'color', mapF)).setAlphaMode('MASK').setAlphaCutoff(0.4).setDoubleSided(true);
    else if (alphaF) mat.setBaseColorTexture(await tex(mapF, C_SIZE, 'color', alphaF)).setAlphaMode('MASK').setAlphaCutoff(0.4).setDoubleSided(true);
    else mat.setBaseColorTexture(await tex(mapF, /head/i.test(mname) ? Math.min(C_SIZE, 1024) : C_SIZE, 'color'));
  }
  if (norF && !isOpacity && N_SIZE > 0) mat.setNormalTexture(await tex(norF, N_SIZE, 'normal'));
  prim.setMaterial(mat);
  mesh.addPrimitive(prim);
  console.log('  prim', mname, 'verts', remap.size, 'tris', I.length / 3, 'map', mapF && path.basename(mapF), 'nrm', norF && path.basename(norF), alphaF ? 'alpha ' + path.basename(alphaF) : '', m3 && m3.type);
}
const meshNode = doc.createNode(name + '_mesh').setMesh(mesh).setSkin(skin);
rootNode.addChild(meshNode);
doc.getRoot().getAsset().generator = 'backrooms rb2glb (Microsoft Rocketbox Avatar Library, MIT licence)';
await new NodeIO().write(out, doc);
console.log('wrote', out, fs.statSync(out).size);
