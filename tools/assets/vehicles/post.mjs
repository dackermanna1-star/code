// Vehicle GLB post-processing (gltf-transform):
//   node tools/assets/vehicles/post.mjs optimize <in.glb> <out.glb>
//       dedup, prune (keeps empty nodes), weld, reorder, quantize, meshopt (EXT_meshopt_compression), sets
//       occlusionTexture = metallicRoughnessTexture (packed ORM) when missing. No Draco, no KTX2.
//   node tools/assets/vehicles/post.mjs info <file.glb>
import { NodeIO } from '@gltf-transform/core';
import { ALL_EXTENSIONS } from '@gltf-transform/extensions';
import { dedup, prune, weld, quantize, reorder, meshopt } from '@gltf-transform/functions';
import { MeshoptEncoder, MeshoptDecoder } from 'meshoptimizer';
import fs from 'fs';

const [cmd, ...args] = process.argv.slice(2);
await MeshoptDecoder.ready; await MeshoptEncoder.ready;
const io = new NodeIO().registerExtensions(ALL_EXTENSIONS).registerDependencies({ 'meshopt.decoder': MeshoptDecoder, 'meshopt.encoder': MeshoptEncoder });

function triCount(doc) {
  let t = 0;
  const meshTris = new Map();
  for (const m of doc.getRoot().listMeshes()) {
    let mt = 0;
    for (const p of m.listPrimitives()) { const idx = p.getIndices(); mt += (idx ? idx.getCount() : p.getAttribute('POSITION').getCount()) / 3; }
    meshTris.set(m, mt);
  }
  let rendered = 0;
  for (const n of doc.getRoot().listNodes()) if (n.getMesh()) rendered += meshTris.get(n.getMesh());
  for (const v of meshTris.values()) t += v;
  return { unique: t, rendered };
}

if (cmd === 'optimize') {
  const [inp, out] = args;
  const doc = await io.read(inp);
  for (const mat of doc.getRoot().listMaterials()) {
    const mr = mat.getMetallicRoughnessTexture();
    if (mr && !mat.getOcclusionTexture()) {
      mat.setOcclusionTexture(mr);
      mat.getOcclusionTextureInfo().setTexCoord(mat.getMetallicRoughnessTextureInfo().getTexCoord());
    }
  }
  await doc.transform(dedup(), prune({ keepLeaves: true, keepAttributes: false }), weld(), reorder({ encoder: MeshoptEncoder }),
    quantize({ quantizePosition: 14, quantizeNormal: 10, quantizeTexcoord: 12 }), meshopt({ encoder: MeshoptEncoder, level: 'medium' }));
  await io.write(out, doc);
  console.log(JSON.stringify({ out, bytes: fs.statSync(out).size, tris: triCount(doc) }));
} else if (cmd === 'info') {
  const doc = await io.read(args[0]);
  const root = doc.getRoot();
  const nodes = root.listNodes().map(n => ({ name: n.getName(), mesh: n.getMesh()?.getName() || null, t: n.getTranslation().map(v => +v.toFixed(4)), r: n.getRotation().map(v => +v.toFixed(4)) }));
  const tex = root.listTextures().map(t => ({ name: t.getName(), mime: t.getMimeType(), size: t.getSize(), bytes: t.getImage().length }));
  const mats = root.listMaterials().map(m => ({ name: m.getName(), alpha: m.getAlphaMode(), color: m.getBaseColorFactor().map(v => +v.toFixed(3)), doubleSided: m.getDoubleSided() }));
  console.log(JSON.stringify({ tris: triCount(doc), mats, nodes, tex, bytes: fs.statSync(args[0]).size }, null, 1));
} else {
  console.log('usage: optimize|info');
}
