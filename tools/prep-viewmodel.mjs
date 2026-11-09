// Prepare a Sketchfab-exported first-person rig (scene.gltf + bin + textures) for the game:
// spec/gloss -> metal/rough, drop unused data, resample animations, downscale + re-encode
// textures, write a single GLB.
// usage: node tools/prep-viewmodel.mjs <scene.gltf> <out.glb> [maxColor=2048] [maxOther=1024]
import { NodeIO } from '@gltf-transform/core';
import { ALL_EXTENSIONS } from '@gltf-transform/extensions';
import { metalRough, prune, dedup, resample, textureCompress, quantize } from '@gltf-transform/functions';
import sharp from 'sharp';
import fs from 'node:fs';

const [, , src, out, maxColorArg, maxOtherArg] = process.argv;
const MAX_COLOR = +(maxColorArg || 2048), MAX_OTHER = +(maxOtherArg || 1024);
const io = new NodeIO().registerExtensions(ALL_EXTENSIONS);
const doc = await io.read(src);
const root = doc.getRoot();

// three.js no longer understands KHR_materials_pbrSpecularGlossiness
if (root.listExtensionsUsed().some((e) => e.extensionName === 'KHR_materials_pbrSpecularGlossiness')) {
  await doc.transform(metalRough());
}
// specular/f0 textures add little in first person and cost megabytes
for (const ext of root.listExtensionsUsed()) {
  if (['KHR_materials_specular', 'KHR_materials_ior'].includes(ext.extensionName)) ext.dispose();
}
for (const cam of root.listCameras()) cam.dispose();

const colorTex = new Set(), otherTex = new Set();
for (const m of root.listMaterials()) {
  const bc = m.getBaseColorTexture(), em = m.getEmissiveTexture();
  if (bc) colorTex.add(bc);
  if (em) colorTex.add(em);
  for (const t of [m.getNormalTexture(), m.getMetallicRoughnessTexture(), m.getOcclusionTexture()]) if (t) otherTex.add(t);
}
await doc.transform(prune(), dedup(), resample({ tolerance: 1e-4 }), quantize({ quantizePosition: 14, quantizeNormal: 10, quantizeTexcoord: 12, quantizeWeight: 8 }));
await doc.transform(
  textureCompress({ encoder: sharp, targetFormat: 'jpeg', resize: [MAX_COLOR, MAX_COLOR], quality: 86, slots: /^(baseColorTexture|emissiveTexture)$/ }),
  textureCompress({ encoder: sharp, targetFormat: 'jpeg', resize: [MAX_OTHER, MAX_OTHER], quality: 88, slots: /^(normalTexture|metallicRoughnessTexture|occlusionTexture)$/ }),
);
await io.write(out, doc);
const anims = root.listAnimations().map((a) => a.getName());
console.log(out, (fs.statSync(out).size / 1048576).toFixed(2) + ' MB', 'anims:', anims.join(', '));
