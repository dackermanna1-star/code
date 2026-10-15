// Usage: node tools/assets/characters/inspect.mjs <file.glb> [--nodes]
// Prints animations (name, duration, channel count), skins, joints and meshes.
import { NodeIO } from '@gltf-transform/core';
import { ALL_EXTENSIONS } from '@gltf-transform/extensions';
import { MeshoptDecoder } from 'meshoptimizer';
await MeshoptDecoder.ready;
const io = new NodeIO().registerExtensions(ALL_EXTENSIONS).registerDependencies({ 'meshopt.decoder': MeshoptDecoder });
const file = process.argv[2];
const doc = await io.read(file);
const root = doc.getRoot();
const showNodes = process.argv.includes('--nodes');
let tris = 0;
for (const m of root.listMeshes()) for (const p of m.listPrimitives()) { const idx = p.getIndices(); tris += (idx ? idx.getCount() : p.getAttribute('POSITION').getCount()) / 3; }
console.log(`meshes=${root.listMeshes().length} tris=${tris} skins=${root.listSkins().length} nodes=${root.listNodes().length} materials=${root.listMaterials().length} textures=${root.listTextures().length}`);
for (const s of root.listSkins()) console.log(`skin joints=${s.listJoints().length}: ${s.listJoints().map(j=>j.getName()).join(',')}`);
for (const a of root.listAnimations()) {
  let maxT = 0; for (const s of a.listSamplers()) { const inp = s.getInput(); const arr = inp.getArray(); maxT = Math.max(maxT, arr[arr.length-1]); }
  console.log(`anim "${a.getName()}" dur=${maxT.toFixed(3)} channels=${a.listChannels().length}`);
}
if (showNodes) {
  const print = (n, d) => { const t=n.getTranslation(), r=n.getRotation(), s=n.getScale(); console.log(`${'  '.repeat(d)}${n.getName()} t=[${t.map(v=>v.toFixed(3))}] r=[${r.map(v=>v.toFixed(3))}] s=[${s.map(v=>v.toFixed(3))}]${n.getMesh()?' MESH':''}`); for (const c of n.listChildren()) print(c, d+1); };
  for (const sc of root.listScenes()) for (const n of sc.listChildren()) print(n, 0);
}
