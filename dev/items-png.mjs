// Tiny PNG encoder + 3x5 pixel font helpers for the items dev scripts (node only).
import { deflateSync } from 'node:zlib';
import { writeFileSync, mkdirSync } from 'node:fs';
import { dirname } from 'node:path';

const CRC_TABLE = (() => {
  const t = new Uint32Array(256);
  for (let n = 0; n < 256; n++) {
    let c = n;
    for (let k = 0; k < 8; k++) c = c & 1 ? 0xedb88320 ^ (c >>> 1) : c >>> 1;
    t[n] = c >>> 0;
  }
  return t;
})();
function crc32(buf) {
  let c = 0xffffffff;
  for (let i = 0; i < buf.length; i++) c = CRC_TABLE[(c ^ buf[i]) & 255] ^ (c >>> 8);
  return (c ^ 0xffffffff) >>> 0;
}
function chunk(type, data) {
  const len = Buffer.alloc(4); len.writeUInt32BE(data.length);
  const td = Buffer.concat([Buffer.from(type, 'ascii'), data]);
  const crc = Buffer.alloc(4); crc.writeUInt32BE(crc32(td));
  return Buffer.concat([len, td, crc]);
}
/** rgba: Uint8Array w*h*4 */
export function encodePNG(w, h, rgba) {
  const raw = Buffer.alloc((w * 4 + 1) * h);
  for (let y = 0; y < h; y++) {
    raw[y * (w * 4 + 1)] = 0;
    Buffer.from(rgba.buffer, rgba.byteOffset + y * w * 4, w * 4).copy(raw, y * (w * 4 + 1) + 1);
  }
  const ihdr = Buffer.alloc(13);
  ihdr.writeUInt32BE(w, 0); ihdr.writeUInt32BE(h, 4);
  ihdr[8] = 8; ihdr[9] = 6; ihdr[10] = 0; ihdr[11] = 0; ihdr[12] = 0;
  return Buffer.concat([
    Buffer.from([0x89, 0x50, 0x4e, 0x47, 0x0d, 0x0a, 0x1a, 0x0a]),
    chunk('IHDR', ihdr), chunk('IDAT', deflateSync(raw, { level: 9 })), chunk('IEND', Buffer.alloc(0)),
  ]);
}
export function writePNG(path, w, h, rgba) {
  mkdirSync(dirname(path), { recursive: true });
  writeFileSync(path, encodePNG(w, h, rgba));
}

// 3x5 font, each glyph = 5 rows of 3 bits
const F = {
  a: '010101111101101', b: '110101110101110', c: '011100100100011', d: '110101101101110', e: '111100110100111',
  f: '111100110100100', g: '011100101101011', h: '101101111101101', i: '111010010010111', j: '001001001101010',
  k: '101101110101101', l: '100100100100111', m: '101111111101101', n: '110101101101101', o: '010101101101010',
  p: '110101110100100', q: '010101101110011', r: '110101110101101', s: '011100010001110', t: '111010010010010',
  u: '101101101101111', v: '101101101101010', w: '101101111111101', x: '101101010101101', y: '101101010010010',
  z: '111001010100111', 0: '111101101101111', 1: '010110010010111', 2: '110001010100111', 3: '110001010001110',
  4: '101101111001001', 5: '111100110001110', 6: '011100111101111', 7: '111001010010010', 8: '111101111101111',
  9: '111101111001110', _: '000000000000111', '.': '000000000000010', '-': '000000111000000', ' ': '000000000000000',
  '/': '001001010100100', ':': '000010000010000', '(': '010100100100010', ')': '010001001001010', '%': '101001010100101',
};
export class Canvas {
  constructor(w, h, bg = [0, 0, 0, 255]) {
    this.w = w; this.h = h; this.d = new Uint8Array(w * h * 4);
    for (let i = 0; i < w * h; i++) this.d.set(bg, i * 4);
  }
  px(x, y, c) {
    if (x < 0 || y < 0 || x >= this.w || y >= this.h) return;
    const i = (y * this.w + x) * 4;
    const a = (c[3] ?? 255) / 255;
    this.d[i] = this.d[i] * (1 - a) + c[0] * a; this.d[i + 1] = this.d[i + 1] * (1 - a) + c[1] * a;
    this.d[i + 2] = this.d[i + 2] * (1 - a) + c[2] * a; this.d[i + 3] = 255;
  }
  rect(x, y, w, h, c) { for (let j = 0; j < h; j++) for (let i = 0; i < w; i++) this.px(x + i, y + j, c); }
  text(x, y, str, c, scale = 1) {
    let cx = x;
    for (const ch of String(str).toLowerCase()) {
      const g = F[ch] ?? F[' '];
      for (let r = 0; r < 5; r++) for (let k = 0; k < 3; k++) if (g[r * 3 + k] === '1') this.rect(cx + k * scale, y + r * scale, scale, scale, c);
      cx += 4 * scale;
    }
  }
  blit(rgba, sw, sh, dx, dy, scale = 1) {
    for (let y = 0; y < sh; y++) for (let x = 0; x < sw; x++) {
      const i = (y * sw + x) * 4;
      if (!rgba[i + 3]) continue;
      this.rect(dx + x * scale, dy + y * scale, scale, scale, [rgba[i], rgba[i + 1], rgba[i + 2], rgba[i + 3]]);
    }
  }
  save(path) { writePNG(path, this.w, this.h, this.d); }
}
