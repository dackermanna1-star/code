// GLB utilities for gear / attachments / items (gltf-transform).
//   node tools/assets/gear/gltf_util.mjs pack <in.gltf> <out.glb>          -> plain repack (no compression)
//   node tools/assets/gear/gltf_util.mjs optimize <in.glb> <out.glb>        -> dedup, prune, weld, reorder, quantize,
//        EXT_meshopt_compression; sets occlusionTexture = metallicRoughnessTexture (packed ORM) when missing.
//        Nodes listed with --keep a,b,c (and every node that has children) keep their exact transforms.
//   node tools/assets/gear/gltf_util.mjs plain <in.glb> <out.glb>         -> decode meshopt/quantization (for Blender import)
//   node tools/assets/gear/gltf_util.mjs info <file.glb>
import { NodeIO } from '@gltf-transform/core';
import { ALL_EXTENSIONS } from '@gltf-transform/extensions';
import { dedup, prune, weld, quantize, reorder, meshopt, dequantize } from '@gltf-transform/functions';
import { MeshoptEncoder, MeshoptDecoder } from 'meshoptimizer';
import fs from 'fs';

const [cmd, ...args] = process.argv.slice(2);
await MeshoptDecoder.ready; await MeshoptEncoder.ready;
const io = new NodeIO().registerExtensions(ALL_EXTENSIONS).registerDependencies({ 'meshopt.decoder': MeshoptDecoder, 'meshopt.encoder': MeshoptEncoder });

function triCount(doc) {
  let t = 0;
  for (const m of doc.getRoot().listMeshes()) for (const p of m.listPrimitives()) {
    const idx = p.getIndices(); t += (idx ? idx.getCount() : p.getAttribute('POSITION').getCount()) / 3;
  }
  return t;
}

if (cmd === 'plain') {
  // decode meshopt + quantization so Blender can import the file
  const doc = await io.read(args[0]);
  await doc.transform(dequantize());
  for (const e of doc.getRoot().listExtensionsUsed()) {
    if (['EXT_meshopt_compression', 'KHR_mesh_quantization'].includes(e.extensionName)) e.dispose();
  }
  await io.write(args[1], doc);
  console.log(JSON.stringify({ out: args[1], bytes: fs.statSync(args[1]).size }));
} else if (cmd === 'pack') {
  const doc = await io.read(args[0]);
  await io.write(args[1], doc);
  console.log(JSON.stringify({ out: args[1], bytes: fs.statSync(args[1]).size, tris: triCount(doc) }));
} else if (cmd === 'optimize') {
  const [inp, out] = args;
  const doc = await io.read(inp);
  for (const mat of doc.getRoot().listMaterials()) {
    const mr = mat.getMetallicRoughnessTexture();
    if (mr && !mat.getOcclusionTexture() && mat.getName().startsWith('M_')) {
      mat.setOcclusionTexture(mr);
      const src = mat.getMetallicRoughnessTextureInfo();
      mat.getOcclusionTextureInfo().setTexCoord(src.getTexCoord());
    }
  }
  await doc.transform(dedup(), prune({ keepLeaves: true, keepAttributes: false }), weld(), reorder({ encoder: MeshoptEncoder }),
    quantize({ quantizePosition: 14, quantizeNormal: 10, quantizeTexcoord: 12, quantizationVolume: 'mesh' }),
    meshopt({ encoder: MeshoptEncoder, level: 'medium' }));
  await io.write(out, doc);
  console.log(JSON.stringify({ out, bytes: fs.statSync(out).size, tris: triCount(doc) }));
} else if (cmd === 'info') {
  const doc = await io.read(args[0]);
  const root = doc.getRoot();
  const nodes = root.listNodes().map(n => ({ name: n.getName(), mesh: !!n.getMesh(), t: n.getTranslation().map(v => +v.toFixed(4)), parent: n.getParentNode()?.getName?.() }));
  const tex = root.listTextures().map(t => ({ name: t.getName(), mime: t.getMimeType(), size: t.getSize(), bytes: t.getImage().length }));
  const mats = root.listMaterials().map(m => m.getName());
  console.log(JSON.stringify({ tris: triCount(doc), materials: mats, nodes, tex, bytes: fs.statSync(args[0]).size }, null, 1));
} else {
  console.log('usage: pack|optimize|info');
}
