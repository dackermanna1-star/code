// Weapon GLB utilities (gltf-transform).
//   node tools/assets/weapons/gltf_util.mjs optimize <in.glb> <out.glb> [--tex 1024] [--q 88]
//        -> dedup, prune, resize textures (max), weld, meshopt (EXT_meshopt_compression + quantization),
//           sets occlusionTexture = metallicRoughnessTexture (packed ORM) when missing.
//   node tools/assets/weapons/gltf_util.mjs info <file.glb>
//   node tools/assets/weapons/gltf_util.mjs dump-tex <file.glb> <out_prefix>
import { NodeIO } from '@gltf-transform/core';
import { ALL_EXTENSIONS, EXTMeshoptCompression, KHRMeshQuantization } from '@gltf-transform/extensions';
import { dedup, prune, weld, quantize, reorder, meshopt } from '@gltf-transform/functions';
import { MeshoptEncoder, MeshoptDecoder } from 'meshoptimizer';
import fs from 'fs';

const [cmd, ...args] = process.argv.slice(2);
await MeshoptDecoder.ready; await MeshoptEncoder.ready;
const io = new NodeIO().registerExtensions(ALL_EXTENSIONS).registerDependencies({ 'meshopt.decoder': MeshoptDecoder, 'meshopt.encoder': MeshoptEncoder });
const opt = (n, d) => { const i = args.indexOf('--' + n); return i >= 0 ? args[i + 1] : d; };

function triCount(doc) {
  let t = 0;
  for (const m of doc.getRoot().listMeshes()) for (const p of m.listPrimitives()) {
    const idx = p.getIndices(); t += (idx ? idx.getCount() : p.getAttribute('POSITION').getCount()) / 3;
  }
  return t;
}

if (cmd === 'optimize') {
  const [inp, out] = args;
  const doc = await io.read(inp);
  for (const mat of doc.getRoot().listMaterials()) {
    const mr = mat.getMetallicRoughnessTexture();
    if (mr && !mat.getOcclusionTexture()) {
      mat.setOcclusionTexture(mr);
      const src = mat.getMetallicRoughnessTextureInfo();
      mat.getOcclusionTextureInfo().setTexCoord(src.getTexCoord());
    }
  }
  await doc.transform(dedup(), prune({ keepLeaves: true }), weld(), reorder({ encoder: MeshoptEncoder }), quantize({ quantizePosition: 14, quantizeNormal: 10, quantizeTexcoord: 12 }), meshopt({ encoder: MeshoptEncoder, level: 'medium' }));
  await io.write(out, doc);
  const sz = fs.statSync(out).size;
  console.log(JSON.stringify({ out, bytes: sz, tris: triCount(doc) }));
} else if (cmd === 'info') {
  const doc = await io.read(args[0]);
  const root = doc.getRoot();
  const nodes = root.listNodes().map(n => ({ name: n.getName(), mesh: !!n.getMesh(), t: n.getTranslation().map(v => +v.toFixed(4)), parent: n.getParentNode()?.getName?.() }));
  const tex = root.listTextures().map(t => ({ name: t.getName(), mime: t.getMimeType(), size: t.getSize(), bytes: t.getImage().length }));
  console.log(JSON.stringify({ tris: triCount(doc), materials: root.listMaterials().length, nodes, tex, bytes: fs.statSync(args[0]).size }, null, 1));
} else if (cmd === 'dump-tex') {
  const doc = await io.read(args[0]);
  doc.getRoot().listTextures().forEach((t, i) => {
    const ext = t.getMimeType().split('/')[1];
    fs.writeFileSync(`${args[1]}_${i}.${ext}`, t.getImage());
    console.log(i, t.getName(), t.getMimeType(), t.getSize());
  });
} else {
  console.log('usage: optimize|info|dump-tex');
}
