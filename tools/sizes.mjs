import { NodeIO } from '@gltf-transform/core';
import { ALL_EXTENSIONS } from '@gltf-transform/extensions';
const io = new NodeIO().registerExtensions(ALL_EXTENSIONS);
for (const f of process.argv.slice(2)) {
  const doc = await io.read(f); const r = doc.getRoot();
  let tex = 0; const tl = [];
  for (const t of r.listTextures()) { tex += t.getImage().byteLength; tl.push(`${t.getName()||t.getURI()}:${t.getSize()}:${(t.getImage().byteLength/1024|0)}k`); }
  let animB = 0; for (const a of r.listAnimations()) for (const s of a.listSamplers()) animB += s.getInput().getArray().byteLength + s.getOutput().getArray().byteLength;
  let geo = 0; for (const m of r.listMeshes()) for (const p of m.listPrimitives()) { for (const a of p.listAttributes()) geo += a.getArray().byteLength; if (p.getIndices()) geo += p.getIndices().getArray().byteLength; }
  console.log(f, 'tex', (tex/1048576).toFixed(2), 'anim', (animB/1048576).toFixed(2), 'geo', (geo/1048576).toFixed(2)); console.log('   ', tl.join('  '));
}
