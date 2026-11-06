// STUB — replaced by the procedural texture generator. Keep the exported API.
// generateTextures(names, size) -> { size, layers: Map<name, index>, data: Uint8Array(size*size*4*names.length) }
// Pure JS (no DOM) so it also runs in Node.
import { hash32 } from '../core/rng.js';

export function generateTextures(names, size = 16) {
  const layers = new Map();
  const data = new Uint8Array(size * size * 4 * names.length);
  names.forEach((name, li) => {
    layers.set(name, li);
    const h = hash32(name.length, name.charCodeAt(0), name.charCodeAt(name.length - 1));
    const r = h & 255, g = (h >> 8) & 255, b = (h >> 16) & 255;
    for (let i = 0; i < size * size; i++) {
      const o = (li * size * size + i) * 4;
      const n = ((i * 7919) % 31) - 15;
      data[o] = Math.max(0, Math.min(255, r + n));
      data[o + 1] = Math.max(0, Math.min(255, g + n));
      data[o + 2] = Math.max(0, Math.min(255, b + n));
      data[o + 3] = 255;
    }
  });
  return { size, layers, data };
}
