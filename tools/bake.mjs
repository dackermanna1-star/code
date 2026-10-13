// Offline lightmap baker for the built-in maps (src/map/maps/*).
//   node tools/bake.mjs <id|all> [high|low] [--force]
//   (node tools/bake.mjs [high|low] still bakes de_dust2)
// Writes public/maps/<id>.lm.png (RGB8 PNG: light / 2, or sqrt(light / 2) for maps whose
// lighting says lmEncoding: 'sqrt') and <id>.lm.json ({ width, height, hash, quality }).
// The game loads them when the hash matches its own build of the map, else bakes at load.
// 'all' skips maps whose shipped lightmap already matches (--force rebakes those too).
import { writeFileSync, mkdirSync, readFileSync, existsSync } from 'fs';
import { deflateSync } from 'zlib';
import { BUILTIN, BUILTIN_MAPS } from '../src/map/maps/index.js';
import { prepareMap, BAKE_QUALITY } from '../src/map/prepare.js';
import { bakeLightmaps, encodeLightmap } from '../src/map/lightmap.js';
import { albedoOf } from '../src/map/lighting.js';

const args = process.argv.slice(2).filter((a) => !a.startsWith('--'));
const force = process.argv.includes('--force');
let [which = 'de_dust2', quality = 'high'] = args;
if (BAKE_QUALITY[which]) { quality = which; which = 'de_dust2'; } // the old usage: bake.mjs [quality]
if (!BAKE_QUALITY[quality]) throw new Error(`bake: unknown quality "${quality}" (high | low)`);
const defs = which === 'all' ? BUILTIN_MAPS : [BUILTIN[which]];
if (!defs[0]) throw new Error(`bake: no built-in map "${which}" (${Object.keys(BUILTIN).join(', ')})`);
const dir = new URL('../public/maps/', import.meta.url);
mkdirSync(dir, { recursive: true });

for (const def of defs) {
  const t0 = performance.now();
  const P = prepareMap(def);
  const metaFile = new URL(`${def.id}.lm.json`, dir);
  if (which === 'all' && !force && existsSync(metaFile)) {
    const meta = JSON.parse(readFileSync(metaFile, 'utf8'));
    if (meta.hash === P.hash && meta.width === P.alloc.width && meta.height === P.alloc.height) { console.log(`${def.id}: up to date (${P.hash})`); continue; }
  }
  process.stdout.write(`${def.id}: ${P.compiled.faces.length} faces, ${P.lighting.lights.length} lights, ${P.alloc.width}x${P.alloc.height} ... `);
  let lastPct = -1;
  const rgb = bakeLightmaps(P.compiled.faces, P.compiled.world, P.alloc, { ...P.lighting, ...BAKE_QUALITY[quality] }, albedoOf, (p) => {
    const pct = Math.floor(p * 10) * 10;
    if (pct !== lastPct) { lastPct = pct; process.stdout.write(`${pct}% `); }
  });
  const { width: W, height: H } = P.alloc;
  const rgba = encodeLightmap(rgb, W, H, P.encoding);
  const out = new Uint8Array(W * H * 3);
  for (let i = 0, n = W * H; i < n; i++) { out[i * 3] = rgba[i * 4]; out[i * 3 + 1] = rgba[i * 4 + 1]; out[i * 3 + 2] = rgba[i * 4 + 2]; }
  writeFileSync(new URL(`${def.id}.lm.png`, dir), encodePng(out, W, H));
  // (de_dust2's json keeps its exact old shape: only non-default encodings are recorded)
  writeFileSync(metaFile, JSON.stringify({ width: W, height: H, hash: P.hash, quality, ...(P.encoding !== 'linear' ? { encoding: P.encoding } : {}) }));
  console.log(`\n${def.id}: baked ${W}x${H} hash ${P.hash} (${P.encoding}) in ${((performance.now() - t0) / 1000).toFixed(1)}s`);
}

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
