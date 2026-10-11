// Offline lightmap baker: node tools/bake.mjs [quality]
// Writes public/maps/de_dust2.lm.png (RGB8 PNG, light/2) and de_dust2.lm.json.
import { writeFileSync, mkdirSync } from 'fs';
import { deflateSync } from 'zlib';
import { buildDust2 } from '../src/map/dust2.js';
import { compileMap } from '../src/map/compile.js';
import { allocateLightmaps, bakeLightmaps, encodeLightmap } from '../src/map/lightmap.js';
import { hashMap } from '../src/map/bakeio.js';
import { DUST2_LIGHTING, albedoOf } from '../src/map/lighting.js';

const quality = process.argv[2] || 'high';
const t0 = performance.now();
const m = buildDust2();
const c = compileMap(m.brushes);
const alloc = allocateLightmaps(c.faces);
const lighting = { ...DUST2_LIGHTING, lights: m.lights };
const hash = hashMap(m.brushes, lighting);
const opts = quality === 'high' ? { skySamples: 48, sunSamples: 4 } : { skySamples: 12, sunSamples: 2 };
let lastPct = -1;
const rgb = bakeLightmaps(c.faces, c.world, alloc, { ...lighting, ...opts }, albedoOf, (p) => {
  const pct = Math.floor(p * 20) * 5;
  if (pct !== lastPct) { lastPct = pct; process.stdout.write(`${pct}% `); }
});
const rgba = encodeLightmap(rgb, alloc.width, alloc.height);
const out = new Uint8Array(alloc.width * alloc.height * 3);
for (let i = 0, n = alloc.width * alloc.height; i < n; i++) {
  out[i * 3] = rgba[i * 4]; out[i * 3 + 1] = rgba[i * 4 + 1]; out[i * 3 + 2] = rgba[i * 4 + 2];
}
mkdirSync(new URL('../public/maps/', import.meta.url), { recursive: true });
writeFileSync(new URL('../public/maps/de_dust2.lm.png', import.meta.url), encodePng(out, alloc.width, alloc.height));
writeFileSync(new URL('../public/maps/de_dust2.lm.json', import.meta.url), JSON.stringify({ width: alloc.width, height: alloc.height, hash, quality }));
console.log(`\nbaked ${alloc.width}x${alloc.height} hash ${hash} in ${((performance.now() - t0) / 1000).toFixed(1)}s`);

// Minimal RGB8 PNG writer (filter 0 rows), read back by decodeRgbPng.
function encodePng(rgb, w, h) {
  const crcTable = new Int32Array(256).map((_, n) => { let c = n; for (let k = 0; k < 8; k++) c = c & 1 ? 0xedb88320 ^ (c >>> 1) : c >>> 1; return c; });
  const crc = (buf) => { let c = -1; for (const v of buf) c = crcTable[(c ^ v) & 255] ^ (c >>> 8); return (c ^ -1) >>> 0; };
  const chunk = (type, data) => {
    const out = Buffer.alloc(12 + data.length);
    out.writeUInt32BE(data.length, 0); out.write(type, 4, 'ascii'); Buffer.from(data).copy(out, 8);
    out.writeUInt32BE(crc(out.subarray(4, 8 + data.length)), 8 + data.length);
    return out;
  };
  const ihdr = Buffer.alloc(13);
  ihdr.writeUInt32BE(w, 0); ihdr.writeUInt32BE(h, 4); ihdr[8] = 8; ihdr[9] = 2;
  const raw = Buffer.alloc(h * (w * 3 + 1));
  for (let y = 0; y < h; y++) Buffer.from(rgb.buffer, rgb.byteOffset + y * w * 3, w * 3).copy(raw, y * (w * 3 + 1) + 1);
  return Buffer.concat([Buffer.from([137, 80, 78, 71, 13, 10, 26, 10]), chunk('IHDR', ihdr), chunk('IDAT', deflateSync(raw, { level: 9 })), chunk('IEND', Buffer.alloc(0))]);
}
