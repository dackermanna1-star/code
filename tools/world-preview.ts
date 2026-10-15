// Node preview of the generated world (no browser): writes the map raster with roads, lots, bridges, props
// and labels-free markers to a PNG, plus a timing report.
// Usage: npx vite-node tools/world-preview.ts [out.png] [crop: x0,z0,x1,z1]
import { writeFileSync } from 'node:fs';
import { deflateSync } from 'node:zlib';
import { buildLayout } from '../src/world/layout/MapData';
import { generateTerrain } from '../src/world/terrain/generate';
import { BUILDING_FOOTPRINTS } from '../src/core/contracts';
import { MAP_RES, WORLD_SIZE } from '../src/world/terrain/TerrainData';

function crc32(buf: Uint8Array): number {
  let c = ~0;
  for (let i = 0; i < buf.length; i++) {
    c ^= buf[i];
    for (let k = 0; k < 8; k++) c = c & 1 ? (c >>> 1) ^ 0xedb88320 : c >>> 1;
  }
  return ~c >>> 0;
}
function chunk(type: string, data: Uint8Array): Buffer {
  const len = Buffer.alloc(4);
  len.writeUInt32BE(data.length);
  const td = Buffer.concat([Buffer.from(type, 'ascii'), Buffer.from(data)]);
  const crc = Buffer.alloc(4);
  crc.writeUInt32BE(crc32(td));
  return Buffer.concat([len, td, crc]);
}
export function encodePng(w: number, h: number, rgba: Uint8ClampedArray | Uint8Array): Buffer {
  const raw = Buffer.alloc((w * 4 + 1) * h);
  for (let y = 0; y < h; y++) {
    raw[y * (w * 4 + 1)] = 0;
    Buffer.from(rgba.buffer, rgba.byteOffset + y * w * 4, w * 4).copy(raw, y * (w * 4 + 1) + 1);
  }
  const ihdr = Buffer.alloc(13);
  ihdr.writeUInt32BE(w, 0);
  ihdr.writeUInt32BE(h, 4);
  ihdr[8] = 8;
  ihdr[9] = 6;
  return Buffer.concat([Buffer.from([137, 80, 78, 71, 13, 10, 26, 10]), chunk('IHDR', ihdr), chunk('IDAT', deflateSync(raw)), chunk('IEND', new Uint8Array())]);
}

const out = process.argv[2] ?? 'world-preview.png';
const crop = process.argv[3]?.split(',').map(Number);
const t0 = performance.now();
const layout = buildLayout();
const t1 = performance.now();
const r = generateTerrain(layout);
const t2 = performance.now();
console.log(`layout ${(t1 - t0).toFixed(0)} ms, terrain ${(t2 - t1).toFixed(0)} ms`, r.timings);
const R = MAP_RES;
const px = WORLD_SIZE / R;
const img = new Uint8ClampedArray(r.mapRaster);
const put = (x: number, y: number, c: [number, number, number], a = 1) => {
  if (x < 0 || y < 0 || x >= R || y >= R) return;
  const o = (y * R + x) * 4;
  img[o] = img[o] * (1 - a) + c[0] * a;
  img[o + 1] = img[o + 1] * (1 - a) + c[1] * a;
  img[o + 2] = img[o + 2] * (1 - a) + c[2] * a;
};
const disc = (wx: number, wz: number, rad: number, c: [number, number, number], a = 1) => {
  const cx = wx / px, cy = wz / px, rr = Math.max(0.6, rad / px);
  for (let y = Math.floor(cy - rr); y <= Math.ceil(cy + rr); y++)
    for (let x = Math.floor(cx - rr); x <= Math.ceil(cx + rr); x++) if ((x - cx) ** 2 + (y - cy) ** 2 <= rr * rr) put(x, y, c, a);
};
for (const road of layout.roadDefs) {
  const col: [number, number, number] = road.kind === 'asphalt' ? [235, 232, 220] : [196, 170, 120];
  const p = road.points;
  for (let i = 1; i < p.length; i++) {
    const L = Math.hypot(p[i].x - p[i - 1].x, p[i].z - p[i - 1].z);
    for (let s = 0; s <= L; s += 1) {
      const t = s / L;
      disc(p[i - 1].x + (p[i].x - p[i - 1].x) * t, p[i - 1].z + (p[i].z - p[i - 1].z) * t, road.width / 2, col);
    }
  }
}
for (const br of layout.bridges) {
  const L = Math.hypot(br.b.x - br.a.x, br.b.z - br.a.z);
  for (let s = 0; s <= L; s += 1) disc(br.a.x + ((br.b.x - br.a.x) * s) / L, br.a.z + ((br.b.z - br.a.z) * s) / L, br.width / 2, [90, 90, 90]);
}
for (const lot of layout.lots) {
  const f = BUILDING_FOOTPRINTS[lot.type];
  const c = Math.cos(lot.rotationY), s = Math.sin(lot.rotationY);
  for (let lz = -f.d / 2; lz <= f.d / 2; lz += px * 0.7)
    for (let lx = -f.w / 2; lx <= f.w / 2; lx += px * 0.7) {
      const x = lot.x + lx * c + lz * s, z = lot.z - lx * s + lz * c;
      put(Math.floor(x / px), Math.floor(z / px), [70, 66, 62]);
    }
  // door marker
  const dx = lot.x + (f.d / 2) * s, dz = lot.z + (f.d / 2) * c;
  disc(dx, dz, 1.2, [220, 60, 50]);
}
for (const p of layout.props) {
  const col: [number, number, number] = p.kind.startsWith('container') ? [200, 90, 40] : p.kind === 'power_pole' ? [40, 40, 40] : [150, 60, 150];
  if (p.length) {
    const c = Math.cos(p.rotationY), s = Math.sin(p.rotationY);
    for (let l = -p.length / 2; l <= p.length / 2; l += 0.7) disc(p.x + l * c, p.z - l * s, 0.4, col);
  } else disc(p.x, p.z, p.kind.startsWith('container') ? 2 : 1, col);
}
for (const v of layout.vehicleSpawns) disc(v.x, v.z, 3, v.kind === 'land' ? [30, 60, 230] : [0, 220, 255]);
for (const l of layout.locations) disc(l.x, l.z, 6, [255, 230, 0]);
let w = R, h = R, data: Uint8ClampedArray = img;
if (crop) {
  const [x0, z0, x1, z1] = crop.map((v) => Math.round(v / px));
  w = x1 - x0;
  h = z1 - z0;
  data = new Uint8ClampedArray(w * h * 4);
  for (let y = 0; y < h; y++) for (let x = 0; x < w; x++) for (let k = 0; k < 4; k++) data[(y * w + x) * 4 + k] = img[((y + z0) * R + x + x0) * 4 + k];
}
writeFileSync(out, encodePng(w, h, data));
const hs = r.heights;
let mn = Infinity, mx = -Infinity;
for (const v of hs) {
  mn = Math.min(mn, v);
  mx = Math.max(mx, v);
}
console.log('height range', mn.toFixed(1), mx.toFixed(1), 'bridges deck', Array.from(r.bridgeDeck).map((v) => v.toFixed(1)).join(','), 'ponds', Array.from(r.pondLevel).map((v) => v.toFixed(1)).join(','));
console.log('wrote', out, w, h);
