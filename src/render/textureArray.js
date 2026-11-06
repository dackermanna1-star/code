// Builds the block texture array (THREE.DataArrayTexture) from the procedural texture generator.
import * as THREE from 'three';
import { allTextureNames } from '../world/blocks.js';
import { generateTextures } from './textures.js';

let built = null;

export function getBlockTextures() {
  if (built) return built;
  const names = allTextureNames();
  const { size, layers, data } = generateTextures(names, 16);
  const tex = new THREE.DataArrayTexture(data, size, size, names.length);
  tex.format = THREE.RGBAFormat;
  tex.type = THREE.UnsignedByteType;
  tex.magFilter = THREE.NearestFilter;
  tex.minFilter = THREE.NearestMipmapLinearFilter;
  tex.generateMipmaps = true;
  tex.colorSpace = THREE.SRGBColorSpace;
  tex.wrapS = tex.wrapT = THREE.RepeatWrapping;
  tex.anisotropy = 4;
  tex.needsUpdate = true;
  // average color per layer (map colors / particles)
  const avg = new Map();
  for (const [name, li] of layers) {
    let r = 0, g = 0, b = 0, n = 0;
    for (let i = 0; i < size * size; i++) {
      const o = (li * size * size + i) * 4;
      if (data[o + 3] < 128) continue;
      r += data[o]; g += data[o + 1]; b += data[o + 2]; n++;
    }
    avg.set(name, n ? [r / n, g / n, b / n] : [0, 0, 0]);
  }
  built = {
    texture: tex, size, layers, data, names,
    layer: (name) => layers.get(name) ?? 0,
    avgColor: (name) => avg.get(name) || [255, 0, 255],
  };
  return built;
}
