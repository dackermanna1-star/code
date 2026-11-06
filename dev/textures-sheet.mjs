// Contact sheets for the procedural block textures.
//
//   node dev/textures-sheet.mjs                 -> dev/out/textures-sheet.png (all textures x4 on a checkerboard)
//                                                  dev/out/textures-page-NN.png (x5 + 3x3 tiled x2, for seams)
//                                                  dev/out/textures-signs.png (letter tiles spelling words)
//                                                  dev/out/textures-mock.png (small facade / street mock-ups)
//   node dev/textures-sheet.mjs name1 name2 ... -> dev/out/textures-focus.png (x8 + 3x3 tiled x3)
//
// Also prints generation timings and sanity checks (alpha modes, missing generators).
import zlib from 'node:zlib';
import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import { allTextureNames, BLOCKS, getBoxes, faceTexture } from '../src/world/blocks.js';
import { generateTextures, hasTexture, alphaMode, renderTexture } from '../src/render/textures.js';

const here = path.dirname(fileURLToPath(import.meta.url));
const outDir = path.join(here, 'out');
fs.mkdirSync(outDir, { recursive: true });

// ---------------------------------------------------------------------------
// tiny PNG encoder
const CRC = new Int32Array(256).map((_, n) => {
  let c = n;
  for (let k = 0; k < 8; k++) c = c & 1 ? 0xedb88320 ^ (c >>> 1) : c >>> 1;
  return c;
});
function crc32(buf) {
  let c = -1;
  for (let i = 0; i < buf.length; i++) c = CRC[(c ^ buf[i]) & 255] ^ (c >>> 8);
  return (c ^ -1) >>> 0;
}
function chunk(type, data) {
  const len = Buffer.alloc(4); len.writeUInt32BE(data.length);
  const td = Buffer.concat([Buffer.from(type, 'ascii'), data]);
  const crc = Buffer.alloc(4); crc.writeUInt32BE(crc32(td));
  return Buffer.concat([len, td, crc]);
}
function encodePNG(w, h, rgba) {
  const raw = Buffer.alloc((w * 4 + 1) * h);
  for (let y = 0; y < h; y++) {
    raw[y * (w * 4 + 1)] = 0;
    Buffer.from(rgba.buffer, rgba.byteOffset + y * w * 4, w * 4).copy(raw, y * (w * 4 + 1) + 1);
  }
  const ihdr = Buffer.alloc(13);
  ihdr.writeUInt32BE(w, 0); ihdr.writeUInt32BE(h, 4);
  ihdr[8] = 8; ihdr[9] = 6; ihdr[10] = 0; ihdr[11] = 0; ihdr[12] = 0;
  return Buffer.concat([
    Buffer.from([137, 80, 78, 71, 13, 10, 26, 10]),
    chunk('IHDR', ihdr),
    chunk('IDAT', zlib.deflateSync(raw, { level: 6 })),
    chunk('IEND', Buffer.alloc(0)),
  ]);
}

// ---------------------------------------------------------------------------
// canvas
class Canvas {
  constructor(w, h, bg = [40, 40, 44]) {
    this.w = w; this.h = h; this.d = new Uint8Array(w * h * 4);
    for (let i = 0; i < w * h; i++) { this.d[i * 4] = bg[0]; this.d[i * 4 + 1] = bg[1]; this.d[i * 4 + 2] = bg[2]; this.d[i * 4 + 3] = 255; }
  }
  px(x, y, c, a = 255) {
    if (x < 0 || y < 0 || x >= this.w || y >= this.h) return;
    const i = (y * this.w + x) * 4, t = a / 255;
    for (let k = 0; k < 3; k++) this.d[i + k] = Math.round(this.d[i + k] * (1 - t) + c[k] * t);
  }
  rect(x, y, w, h, c) { for (let j = 0; j < h; j++) for (let i = 0; i < w; i++) this.px(x + i, y + j, c); }
  checker(x, y, w, h, s = 4) {
    for (let j = 0; j < h; j++) for (let i = 0; i < w; i++) this.px(x + i, y + j, ((i / s | 0) + (j / s | 0)) & 1 ? [58, 92, 140] : [40, 66, 104]);
  }
  /** draw texture layer `li` at (x, y) scaled by `sc`, repeated rep x rep times */
  tex(T, li, x, y, sc, rep = 1, checker = true) {
    const s = T.size, n = s * rep * sc;
    if (checker) this.checker(x, y, n, n, Math.max(2, sc * 2));
    for (let j = 0; j < n; j++) for (let i = 0; i < n; i++) {
      const tx = Math.floor(i / sc) % s, ty = Math.floor(j / sc) % s;
      const o = (li * s * s + ty * s + tx) * 4;
      this.px(x + i, y + j, [T.data[o], T.data[o + 1], T.data[o + 2]], T.data[o + 3]);
    }
  }
  text(x, y, str, c = [230, 230, 230]) {
    let cx = x;
    for (const ch of str.toUpperCase()) {
      const g = FONT[ch] || FONT['?'];
      for (let j = 0; j < 5; j++) for (let i = 0; i < 3; i++) if (g[j * 3 + i] === '1') this.px(cx + i, y + j, c);
      cx += 4;
    }
  }
  save(file) { fs.writeFileSync(path.join(outDir, file), encodePNG(this.w, this.h, this.d)); console.log('wrote dev/out/' + file); }
}
const FONT = {
  A: '010101111101101', B: '110101110101110', C: '011100100100011', D: '110101101101110', E: '111100110100111',
  F: '111100110100100', G: '011100101101011', H: '101101111101101', I: '111010010010111', J: '001001001101010',
  K: '101101110101101', L: '100100100100111', M: '101111111101101', N: '110101101101101', O: '010101101101010',
  P: '110101110100100', Q: '010101101110011', R: '110101110101101', S: '011100010001110', T: '111010010010010',
  U: '101101101101111', V: '101101101101010', W: '101101111111101', X: '101101010101101', Y: '101101010010010',
  Z: '111001010100111', 0: '111101101101111', 1: '010110010010111', 2: '110001010100111', 3: '110001010001110',
  4: '101101111001001', 5: '111100110001110', 6: '011100111101111', 7: '111001010010010', 8: '111101111101111',
  9: '111101111001110', _: '000000000000111', '-': '000000111000000', ' ': '000000000000000', '?': '111001010000010',
  '.': '000000000000010', '#': '101111101111101', '&': '010101010101011', "'": '010010000000000', '!': '010010010000010',
  '+': '000010111010000',
};

// ---------------------------------------------------------------------------
const names = allTextureNames();
const extra = process.argv.slice(2);

// timings (cold first call is what the browser pays once)
let t0 = performance.now();
const T = generateTextures(names, 16);
const cold = performance.now() - t0;
let best = Infinity;
for (let k = 0; k < 5; k++) {
  t0 = performance.now();
  generateTextures(names, 16);
  best = Math.min(best, performance.now() - t0);
}
console.log(`${names.length} textures: cold ${cold.toFixed(1)} ms, warm best ${best.toFixed(1)} ms`);

// determinism + sanity checks
const T2 = generateTextures(names, 16);
let same = T.data.length === T2.data.length && T.data.every((v, i) => v === T2.data[i]);
console.log('deterministic:', same);
const missing = names.filter((n) => !hasTexture(n));
if (missing.length) console.log('MISSING generators:', missing.join(' '));
for (const [name, li] of T.layers) {
  const mode = alphaMode(name);
  let zero = 0, mid = 0;
  for (let i = 0; i < 256; i++) {
    const a = T.data[(li * 256 + i) * 4 + 3];
    if (a === 0) zero++; else if (a < 255) mid++;
  }
  if (mode === 'cutout' && zero === 0) console.log('note: cutout texture without holes:', name);
  if (mode === 'blend' && mid === 0) console.log('note: translucent texture without partial alpha:', name);
}

// opaque textures must not leave pixels undrawn (they would be forced to alpha 255 and show as black)
for (const name of names) {
  if (alphaMode(name) !== 'opaque') continue;
  const img = renderTexture(name);
  let holes = 0;
  for (let i = 3; i < img.d.length; i += 4) if (img.d[i] === 0) holes++;
  if (holes) console.log(`note: opaque texture ${name} has ${holes} undrawn pixels`);
}

function label(c, x, y, name, maxChars) {
  if (name.length <= maxChars) { c.text(x, y, name); return; }
  c.text(x, y, name.slice(0, maxChars));
  c.text(x, y + 6, name.slice(maxChars, maxChars * 2));
}

if (extra.length) {
  // focus sheet
  const list = extra.filter((n) => T.layers.has(n) || console.log('unknown texture', n));
  const cw = 128 + 8 + 144 + 16, ch = 160;
  const cols = Math.min(3, list.length);
  const c = new Canvas(cols * cw + 8, Math.ceil(list.length / cols) * ch + 8);
  list.forEach((n, k) => {
    const x = 8 + (k % cols) * cw, y = 8 + Math.floor(k / cols) * ch;
    c.tex(T, T.layers.get(n), x, y, 8);
    c.tex(T, T.layers.get(n), x + 136, y, 3, 3);
    c.text(x, y + 148, n);
  });
  c.save('textures-focus.png');
} else {
  // box-shaped blocks seen front / side / top with Minecraft-style sub-region UVs (what the mesher draws)
  {
    const list = BLOCKS.filter((d) => d.render === 'boxes');
    const sc = 4, t = 16 * sc, cw = 3 * (t + 6) + 10, ch = t + 2 * t + 20;
    const cols = 6;
    const c = new Canvas(cols * cw + 8, Math.ceil(list.length / cols) * (t * 2 + 30) + 8, [70, 74, 80]);
    const texel = (name, u, v) => {
      const li = T.layers.get(name); if (li === undefined) return null;
      const x = Math.min(15, Math.max(0, Math.floor(u * 16))), y = Math.min(15, Math.max(0, Math.floor(((v % 1) + 1) % 1 * 16)));
      const o = (li * 256 + y * 16 + x) * 4;
      return [T.data[o], T.data[o + 1], T.data[o + 2], T.data[o + 3]];
    };
    list.forEach((d, k) => {
      const ox = 8 + (k % cols) * cw, oy = 8 + Math.floor(k / cols) * (t * 2 + 30);
      const metas = d.door ? [8, 0] : [0];
      metas.forEach((meta, mi) => {
        const boxes = getBoxes(d.id, meta);
        const views = [
          { f: 4, sort: (b) => b[5], map: (b) => [b[0], 1 - b[4], b[3], 1 - b[1]], uv: (sx, sy) => [sx, sy], depth: (b) => b[5] },
          { f: 0, sort: (b) => b[3], map: (b) => [1 - b[5], 1 - b[4], 1 - b[2], 1 - b[1]], uv: (sx, sy) => [sx, sy], depth: (b) => b[3] },
          { f: 2, sort: (b) => b[4], map: (b) => [b[0], b[2], b[3], b[5]], uv: (sx, sy) => [sx, sy], depth: (b) => b[4] },
        ];
        views.forEach((V, vi) => {
          if (d.door && vi > 0) return;
          const name0 = faceTexture(d, V.f, meta);
          const vx = ox + vi * (t + 6), vy = oy + mi * t;
          const sorted = [...boxes].sort((a, b) => V.sort(a) - V.sort(b));
          for (const b of sorted) {
            let name = name0;
            if (d.door) { const ex = b[3] - b[0], ey = b[4] - b[1]; name = ex > 0.5 && ey > 0.5 ? (meta & 8 ? d.tex.topTex : d.tex.front) : d.tex.side; }
            const [a0, b0, a1, b1] = V.map(b);
            const k2 = 0.6 + 0.4 * V.depth(b);
            for (let py = Math.round(b0 * t); py < Math.round(b1 * t); py++) for (let px = Math.round(a0 * t); px < Math.round(a1 * t); px++) {
              const [u, v] = V.uv(px / t, py / t);
              const p = texel(name, u, v);
              if (!p || p[3] < 128) continue;
              c.px(vx + px, vy + py, [p[0] * k2, p[1] * k2, p[2] * k2]);
            }
          }
        });
      });
      c.text(ox, oy + (d.door ? 2 * t : t) + 4, d.name);
    });
    c.save('textures-boxes.png');
  }
  // full contact sheet
  {
    const cols = 16, cw = 72, ch = 80;
    const c = new Canvas(cols * cw + 8, Math.ceil(names.length / cols) * ch + 8);
    names.forEach((n, k) => {
      const x = 8 + (k % cols) * cw, y = 8 + Math.floor(k / cols) * ch;
      c.tex(T, T.layers.get(n), x, y, 4);
      label(c, x, y + 67, n, 16);
    });
    c.save('textures-sheet.png');
  }
  // pages: x5 single + 3x3 tiled x2
  {
    const per = 30, cols = 5, cw = 80 + 6 + 96 + 12, ch = 96 + 18;
    for (let p = 0; p * per < names.length; p++) {
      const list = names.slice(p * per, p * per + per);
      const c = new Canvas(cols * cw + 8, Math.ceil(list.length / cols) * ch + 8);
      list.forEach((n, k) => {
        const x = 8 + (k % cols) * cw, y = 8 + Math.floor(k / cols) * ch;
        c.tex(T, T.layers.get(n), x, y, 5);
        c.tex(T, T.layers.get(n), x + 86, y, 2, 3);
        label(c, x, y + 99, n, 44);
      });
      c.save(`textures-page-${String(p + 1).padStart(2, '0')}.png`);
    }
  }
  // sign words
  {
    const words = ['PHARMACY', 'POLICE', 'MILLBROOK HARDWARE', "JOE'S DINER", 'GAS & GO', 'OPEN 24', 'MOTEL', 'FIRST AID', '#1 AUTO-PARTS', 'HELP!', 'ABCDEFGHIJKLM', 'NOPQRSTUVWXYZ', '0123456789 +.'];
    const sc = 3, tw = 16 * sc;
    const maxLen = Math.max(...words.map((w) => w.length));
    const c = new Canvas(maxLen * tw + 16, words.length * (tw + 8) + 8, [96, 90, 84]);
    const charName = (ch) => (/[A-Z0-9]/.test(ch) ? ch : { ' ': 'blank', '-': 'dash', '+': 'plus', '!': 'excl', '&': 'amp', '.': 'dot', "'": 'apos', '#': 'hash' }[ch]);
    words.forEach((w, j) => {
      [...w].forEach((ch, i) => {
        const n = 'sign_' + charName(ch);
        c.tex(T, T.layers.get(n), 8 + i * tw, 8 + j * (tw + 8), sc, 1, false);
      });
    });
    c.save('textures-signs.png');
  }
  // mock-ups: facade elevations + a top-down street
  {
    const sc = 3, t = 16 * sc;
    const c = new Canvas(t * 30 + 16, t * 15 + 16, [120, 150, 170]);
    const put = (n, gx, gy) => { if (T.layers.has(n)) c.tex(T, T.layers.get(n), 8 + gx * t, 8 + gy * t, sc, 1, false); };
    // house: roof row, siding walls, window, door
    for (let x = 0; x < 7; x++) put('roof_dark', x, 0);
    for (let y = 1; y < 4; y++) for (let x = 0; x < 7; x++) put('siding_white', x, y);
    put('glass', 1, 2); put('glass', 2, 2); put('glass', 5, 2);
    put('door_wood_top', 3, 2); put('door_wood', 3, 3);
    for (let x = 0; x < 7; x++) put('grass_side', x, 4);
    for (let x = 0; x < 7; x++) put('dirt', x, 5);
    put('fence_picket', 0, 3); put('flower_red', 6, 3); put('tall_grass', 5, 3); put('bush', 4, 3);
    // storefront
    for (let y = 0; y < 5; y++) for (let x = 8; x < 18; x++) put('brick_red', x, y);
    const word = 'PHARMACY';
    [...word].forEach((ch, i) => put('sign_' + ch, 9 + i, 1));
    put('sign_cross_green', 17, 1);
    for (let x = 9; x < 17; x++) if (x !== 12) { put('glass_shop', x, 3); put('glass_shop', x, 2); }
    put('door_glass_top', 12, 2); put('door_glass', 12, 3);
    for (let x = 8; x < 18; x++) put('concrete', x, 4);
    for (let x = 8; x < 18; x++) put('awning_green', x, 2 - 2 + 0) ;
    for (let x = 8; x < 18; x++) put('brick_red', x, 0);
    for (let x = 8; x < 18; x++) put('concrete', x, 5);
    // more siding colours + roofs
    const sid = ['siding_blue', 'siding_yellow', 'siding_grey', 'siding_green', 'siding_red', 'planks_white', 'barn_red', 'brick_brown', 'brick_white', 'stone_brick', 'metal_wall', 'corrugated_metal'];
    sid.forEach((n, k) => { put(n, 19 + (k % 6) * 2, 0 + Math.floor(k / 6) * 2); put(n, 20 + (k % 6) * 2, 0 + Math.floor(k / 6) * 2); put(n, 19 + (k % 6) * 2, 1 + Math.floor(k / 6) * 2); put(n, 20 + (k % 6) * 2, 1 + Math.floor(k / 6) * 2); });
    // top-down street
    const oy = 7;
    for (let x = 0; x < 30; x++) {
      put('grass_top', x, oy); put('sidewalk', x, oy + 1); put('asphalt', x, oy + 2); put('road_white_x', x, oy + 3);
      put('asphalt', x, oy + 4); put('road_yellow_x', x, oy + 5); put('asphalt_cracked', x, oy + 6); put('parking_line_x', x, oy + 7);
    }
    for (let y = oy + 2; y < oy + 8; y++) { put('crosswalk_z', 12, y); put('crosswalk_z', 13, y); put('asphalt', 11, y); put('asphalt', 14, y); }
    put('manhole', 20, oy + 4);
    for (let x = 0; x < 30; x++) if (x % 7 === 3) put('asphalt_cracked', x, oy + 2);
    for (let x = 22; x < 30; x++) { put('forest_floor_top', x, oy); put('leaves_autumn', x, oy - 1); }
    c.save('textures-mock.png');
  }
}
