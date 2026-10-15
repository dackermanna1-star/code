// Finalize a character GLB produced by build_character.py:
//  * normalizes the skeleton: every joint gets an IDENTITY rest rotation (joint axes == model
//    axes: +X = character's left, +Y = up, +Z = forward) and unit scale; inverse bind matrices
//    are rebuilt accordingly, so animation tracks are plain model-space rotations.
//  * attaches PBR textures from a prepared texture dir (by material name)
//  * optional extra nodes (sockets) from a json file
//  * weld / prune / meshopt compression
// usage: node finalize_character.mjs in.glb texDir out.glb [--sockets sockets.json] [--no-meshopt]
import { NodeIO } from '@gltf-transform/core';
import { ALL_EXTENSIONS, EXTTextureWebP } from '@gltf-transform/extensions';
import { prune, dedup, weld, meshopt, reorder, quantize } from '@gltf-transform/functions';
import { MeshoptEncoder, MeshoptDecoder } from 'meshoptimizer';
import * as THREE from 'three';
import fs from 'fs';
import path from 'path';

const [inp, texDir, out] = process.argv.slice(2);
const opt = (n) => { const i = process.argv.indexOf(n); return i >= 0 ? process.argv[i + 1] : null; };
const noMeshopt = process.argv.includes('--no-meshopt');
await MeshoptEncoder.ready; await MeshoptDecoder.ready;
const io = new NodeIO().registerExtensions(ALL_EXTENSIONS).registerDependencies({ 'meshopt.encoder': MeshoptEncoder, 'meshopt.decoder': MeshoptDecoder });
const doc = await io.read(inp);
const root = doc.getRoot();
const skin = root.listSkins()[0];
const joints = skin.listJoints();

// ---------- skeleton normalisation ----------
const worldOf = (node) => { const m = new THREE.Matrix4(); const chain = []; for (let n = node; n; n = n.getParentNode()) chain.unshift(n); for (const n of chain) m.multiply(new THREE.Matrix4().fromArray(n.getMatrix())); return m; };
const wpos = new Map();
for (const j of joints) wpos.set(j, new THREE.Vector3().setFromMatrixPosition(worldOf(j)));
// armature (parent of the root joint) is expected to be identity
for (const j of joints) {
  const p = j.getParentNode();
  const pp = joints.includes(p) ? wpos.get(p) : new THREE.Vector3().setFromMatrixPosition(worldOf(p));
  const d = wpos.get(j).clone().sub(pp);
  j.setTranslation([d.x, d.y, d.z]).setRotation([0, 0, 0, 1]).setScale([1, 1, 1]);
}
const ibm = skin.getInverseBindMatrices();
const arr = new Float32Array(joints.length * 16);
joints.forEach((j, i) => { const p = wpos.get(j); new THREE.Matrix4().makeTranslation(-p.x, -p.y, -p.z).toArray(arr, i * 16); });
ibm.setArray(arr);
const hips = joints.find((j) => j.getName() === 'Hips');
skin.setSkeleton(hips);

// ---------- sockets ----------
const sockFile = opt('--sockets');
if (sockFile) {
  let socks = JSON.parse(fs.readFileSync(sockFile, 'utf8'));
  if (!Array.isArray(socks)) socks = socks.sockets; // compute_sockets.mjs output {sockets, check}
  for (const s of socks) {
    const parent = joints.find((j) => j.getName() === s.parent);
    const n = doc.createNode(s.name).setTranslation(s.t).setRotation(s.r);
    parent.addChild(n);
  }
}

// ---------- materials ----------
const texCache = new Map();
const tex = (file) => {
  const f = path.join(texDir, file);
  if (!fs.existsSync(f)) return null;
  if (texCache.has(f)) return texCache.get(f);
  const mime = f.endsWith('.webp') ? 'image/webp' : f.endsWith('.png') ? 'image/png' : 'image/jpeg';
  const t = doc.createTexture(path.basename(file, path.extname(file))).setImage(fs.readFileSync(f)).setMimeType(mime).setURI(path.basename(file));
  texCache.set(f, t);
  return t;
};
let usesWebp = false;
for (const m of root.listMaterials()) {
  const name = m.getName().replace(/\.\d+$/, '');
  m.setName(name);
  m.setMetallicFactor(1).setRoughnessFactor(1).setBaseColorFactor([1, 1, 1, 1]);
  if (name === 'hair') {
    const c = tex('hair_color.webp');
    if (c) { m.setBaseColorTexture(c); usesWebp = true; }
    m.setAlphaMode('MASK').setAlphaCutoff(0.45).setDoubleSided(true);
    m.setMetallicFactor(0).setRoughnessFactor(0.75);
    continue;
  }
  const c = tex(`${name}_color.jpg`), nrm = tex(`${name}_normal.jpg`), orm = tex(`${name}_orm.jpg`);
  if (c) m.setBaseColorTexture(c); else console.warn('missing color for', name);
  if (nrm) m.setNormalTexture(nrm);
  if (orm) m.setMetallicRoughnessTexture(orm); else m.setMetallicFactor(0).setRoughnessFactor(0.8);
  m.setAlphaMode('OPAQUE').setDoubleSided(false);
}
if (usesWebp) doc.createExtension(EXTTextureWebP).setRequired(true);

await doc.transform(dedup(), prune({ keepLeaves: true }), weld(), reorder({ encoder: MeshoptEncoder }));
if (!noMeshopt) await doc.transform(quantize({ quantizeNormal: 10, quantizePosition: 14, quantizeTexcoord: 14 }), meshopt({ encoder: MeshoptEncoder, level: 'medium' }));
await io.write(out, doc);
let tris = 0;
for (const me of root.listMeshes()) for (const p of me.listPrimitives()) tris += p.getIndices().getCount() / 3;
const st = fs.statSync(out);
console.log(JSON.stringify({ out, tris, bytes: st.size, joints: joints.length }));
