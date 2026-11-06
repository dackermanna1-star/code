// Tiny PNG encoder + world renderers (top-down map, floor plans, cross sections) for worldgen debugging.
import { deflateSync } from 'node:zlib';
import { writeFileSync, mkdirSync } from 'node:fs';
import { dirname } from 'node:path';
import { BLOCKS, B } from '../src/world/blocks.js';

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
export function encodePNG(w, h, rgb) {
  const raw = Buffer.alloc((w * 3 + 1) * h);
  for (let y = 0; y < h; y++) {
    raw[y * (w * 3 + 1)] = 0;
    for (let x = 0; x < w * 3; x++) raw[y * (w * 3 + 1) + 1 + x] = rgb[y * w * 3 + x];
  }
  const ihdr = Buffer.alloc(13);
  ihdr.writeUInt32BE(w, 0); ihdr.writeUInt32BE(h, 4);
  ihdr[8] = 8; ihdr[9] = 2; ihdr[10] = 0; ihdr[11] = 0; ihdr[12] = 0;
  return Buffer.concat([Buffer.from([137, 80, 78, 71, 13, 10, 26, 10]), chunk('IHDR', ihdr), chunk('IDAT', deflateSync(raw, { level: 6 })), chunk('IEND', Buffer.alloc(0))]);
}
export function savePNG(path, img) {
  mkdirSync(dirname(path), { recursive: true });
  writeFileSync(path, encodePNG(img.w, img.h, img.data));
}
export function makeImage(w, h, bg = [0, 0, 0]) {
  const data = new Uint8Array(w * h * 3);
  for (let i = 0; i < w * h; i++) { data[i * 3] = bg[0]; data[i * 3 + 1] = bg[1]; data[i * 3 + 2] = bg[2]; }
  return { w, h, data };
}
export function px(img, x, y, c) {
  if (x < 0 || y < 0 || x >= img.w || y >= img.h) return;
  const o = (y * img.w + x) * 3;
  img.data[o] = c[0]; img.data[o + 1] = c[1]; img.data[o + 2] = c[2];
}
export function rect(img, x, y, w, h, c) { for (let j = 0; j < h; j++) for (let i = 0; i < w; i++) px(img, x + i, y + j, c); }

// 3x5 font
const FONT = {
  A: '010101111101101', B: '110101110101110', C: '011100100100011', D: '110101101101110', E: '111100110100111',
  F: '111100110100100', G: '011100101101011', H: '101101111101101', I: '111010010010111', J: '001001001101010',
  K: '101101110101101', L: '100100100100111', M: '101111111101101', N: '110101101101101', O: '010101101101010',
  P: '110101110100100', Q: '010101101110011', R: '110101110101101', S: '011100010001110', T: '111010010010010',
  U: '101101101101111', V: '101101101101010', W: '101101111111101', X: '101101010101101', Y: '101101010010010',
  Z: '111001010100111', 0: '111101101101111', 1: '010110010010111', 2: '110001010100111', 3: '110001010001110',
  4: '101101111001001', 5: '111100110001110', 6: '011100111101111', 7: '111001010010010', 8: '111101111101111',
  9: '111101111001110', '-': '000000111000000', '.': '000000000000010', "'": '010010000000000', '&': '010101010101011',
  '#': '101111101111101', ' ': '000000000000000', '/': '001001010100100', ':': '000010000010000',
};
export function text(img, x, y, str, c = [255, 255, 255], scale = 1, shadow = true) {
  str = String(str).toUpperCase();
  const draw = (ox, oy, col) => {
    let cx = ox;
    for (const ch of str) {
      const g = FONT[ch] || FONT[' '];
      for (let j = 0; j < 5; j++) for (let i = 0; i < 3; i++) {
        if (g[j * 3 + i] === '1') rect(img, cx + i * scale, oy + j * scale, scale, scale, col);
      }
      cx += 4 * scale;
    }
  };
  if (shadow) draw(x + 1, y + 1, [0, 0, 0]);
  draw(x, y, c);
}

// ------------------------------------------------------------------ block colours
const NAMED = {
  grass: [86, 140, 58], dry_grass: [150, 150, 80], forest_floor: [92, 98, 50], dirt: [120, 85, 55], sand: [214, 200, 150],
  gravel: [130, 125, 120], mud: [80, 62, 45], water: [52, 96, 170], stone: [125, 125, 125], cobblestone: [110, 110, 110],
  asphalt: [55, 55, 58], asphalt_cracked: [65, 63, 60], road_yellow_x: [200, 170, 40], road_yellow_z: [200, 170, 40],
  road_white_x: [220, 220, 220], road_white_z: [220, 220, 220], crosswalk_x: [200, 200, 200], crosswalk_z: [200, 200, 200],
  parking_line_x: [210, 210, 210], parking_line_z: [210, 210, 210], manhole: [40, 40, 40], sidewalk: [170, 168, 160],
  concrete: [160, 160, 158], concrete_dark: [100, 100, 100], concrete_white: [215, 215, 210], dirt_path: [150, 115, 70],
  log_oak: [100, 75, 45], log_birch: [210, 210, 200], log_pine: [80, 60, 40], leaves_oak: [60, 110, 40],
  leaves_birch: [150, 170, 60], leaves_pine: [30, 75, 45], leaves_autumn: [210, 130, 30], leaves_autumn_red: [180, 50, 30],
  tall_grass: [100, 150, 60], fern: [60, 120, 50], bush: [50, 100, 40], berry_bush: [140, 40, 90], wheat: [220, 190, 90],
  corn: [120, 160, 50], corn_top: [190, 190, 70], pumpkin: [230, 120, 20], hay_bale: [210, 180, 80], reeds: [110, 140, 70],
  brick_red: [150, 60, 45], brick_brown: [120, 80, 55], brick_white: [210, 200, 185], stone_brick: [140, 140, 135],
  siding_white: [235, 235, 230], siding_blue: [110, 140, 185], siding_yellow: [225, 205, 120], siding_grey: [150, 155, 160],
  siding_green: [110, 150, 110], siding_red: [170, 70, 60], planks_oak: [175, 140, 90], planks_dark: [90, 65, 40],
  planks_light: [200, 175, 130], planks_white: [225, 220, 210], barn_red: [160, 40, 35], roof_dark: [60, 60, 70],
  roof_red: [140, 50, 40], roof_brown: [110, 75, 50], roof_tar: [45, 45, 45], roof_metal: [150, 155, 160],
  roof_dark_stairs: [70, 70, 80], roof_red_stairs: [150, 60, 50], roof_brown_stairs: [120, 85, 60],
  roof_dark_slab: [80, 80, 90], roof_red_slab: [160, 70, 60], roof_brown_slab: [130, 95, 70],
  metal_wall: [140, 145, 150], corrugated_metal: [130, 135, 140], garage_door: [200, 200, 200], glass: [170, 220, 240],
  glass_shop: [140, 200, 230], glass_broken: [120, 160, 180], awning_red: [200, 40, 40], awning_green: [40, 140, 60],
  awning_blue: [40, 80, 180], sign_letter: [250, 240, 120], wall_white: [225, 225, 220], wall_beige: [215, 200, 170],
  wall_green: [150, 180, 140], wall_blue: [150, 170, 200], wallpaper_floral: [200, 170, 180], wallpaper_stripe: [190, 180, 150],
  wall_tile: [200, 215, 220], wall_wood_panel: [140, 100, 60], floor_wood: [160, 120, 75], floor_tile: [205, 205, 200],
  floor_checker: [180, 180, 180], floor_linoleum: [180, 190, 170], floor_hospital: [200, 210, 205], carpet_red: [150, 40, 40],
  carpet_blue: [50, 70, 140], carpet_beige: [200, 185, 150], carpet_grey: [120, 120, 125],
  door_wood: [255, 0, 255], door_white: [255, 0, 255], door_metal: [255, 0, 255], door_glass: [255, 0, 255], door_cell: [255, 0, 255],
  barricade: [160, 110, 50], iron_bars: [90, 90, 100], ladder: [255, 150, 0], stairs_wood: [255, 210, 0], stairs_concrete: [255, 210, 0],
  fence_picket: [240, 240, 240], fence_wood: [130, 95, 60], fence_chainlink: [160, 160, 170], fence_post: [90, 65, 40],
  barbed_wire: [100, 100, 100], sandbags: [180, 160, 110], hesco: [170, 150, 100], jersey_barrier: [190, 190, 185],
  guardrail: [200, 200, 210], tent_green: [70, 95, 50], tent_orange: [230, 120, 30], tent_white: [240, 240, 240],
  camo_net: [90, 110, 60], rubble: [120, 110, 100], trash_bags: [30, 30, 30], fire: [255, 120, 0], campfire: [255, 140, 0],
  barrel_burning: [255, 100, 0], lantern: [255, 230, 120], gravestone: [150, 150, 150],
  bed_head: [0, 220, 255], bed_foot: [0, 170, 210], hospital_bed: [0, 220, 255], toilet: [255, 255, 255], bathtub: [230, 240, 255],
  table: [255, 120, 60], chair: [180, 80, 40], couch: [0, 160, 80], couch_blue: [0, 120, 160], tv: [20, 20, 20],
  street_lamp: [255, 255, 150], street_pole: [80, 80, 80], utility_pole: [100, 70, 40], traffic_light: [255, 200, 0],
  stop_sign: [220, 0, 0], fire_hydrant: [230, 30, 30], bench: [170, 120, 70], pew: [130, 90, 50],
  chalkboard: [40, 80, 50], workbench: [200, 120, 50], toolbox: [220, 30, 30], gas_pump: [220, 60, 60], water_pump: [40, 160, 220],
  slab_wood: [190, 150, 100], slab_concrete: [170, 170, 170], pallet: [190, 150, 100], traffic_cone: [255, 120, 0],
  rain_barrel: [60, 110, 160], dumpster: [40, 90, 50], mailbox: [60, 60, 200], cash_register: [80, 80, 80], radio: [90, 90, 90],
  flower_red: [200, 40, 40], flower_yellow: [230, 210, 40], flower_white: [240, 240, 240], dead_bush: [130, 100, 60],
  bedrock: [20, 20, 20], air: [0, 0, 0],
};
function colourOf(id) {
  const d = BLOCKS[id];
  if (NAMED[d.name]) return NAMED[d.name];
  if (d.container) return [255, 60, 160]; // unnamed containers: pink
  return [255, 0, 0];
}
const COL = BLOCKS.map((d) => colourOf(d.id));
const CONTAINER_COL = {
  fridge: [235, 235, 255], freezer: [200, 220, 255], stove: [90, 90, 90], kitchen_cabinet: [200, 150, 90], kitchen_sink: [170, 200, 220],
  wardrobe: [120, 70, 30], dresser: [160, 100, 50], bookshelf: [110, 60, 30], desk: [150, 110, 60], medicine_cabinet: [240, 250, 255],
  washing_machine: [230, 230, 240], metal_shelf: [130, 130, 150], gun_cabinet: [80, 40, 20], safe: [50, 50, 60],
  store_shelf: [255, 150, 50], store_shelf_misc: [230, 180, 60], store_shelf_meds: [80, 220, 120], store_shelf_empty: [150, 150, 150],
  cooler: [120, 220, 255], checkout: [255, 220, 120], clothing_rack: [200, 100, 200], filing_cabinet: [120, 130, 140],
  locker: [100, 120, 180], medical_cabinet: [220, 255, 240], crate_wood: [190, 140, 80], crate_military: [80, 100, 50],
  cardboard_box: [200, 160, 110], bar_counter: [120, 70, 40], floorboard_loose: [255, 0, 0], hollow_log: [255, 0, 0],
  trash_can: [70, 70, 70], vending_machine: [220, 40, 40], barrel_rust: [140, 70, 40],
};
for (const [n, c] of Object.entries(CONTAINER_COL)) COL[B[n]] = c;

const GLYPH = {
  fridge: 'F', freezer: 'F', stove: 'S', kitchen_cabinet: 'K', kitchen_sink: 'W', table: 'T', chair: 'C', couch: 'U', couch_blue: 'U',
  bed_head: 'B', bed_foot: 'b', hospital_bed: 'H', wardrobe: 'R', dresser: 'D', bookshelf: 'L', desk: 'E', tv: 'V', toilet: 'O',
  bathtub: 'A', medicine_cabinet: 'M', washing_machine: 'X', workbench: 'J', metal_shelf: 'Z', toolbox: 'J', gun_cabinet: 'G', safe: '#',
  store_shelf: 'S', store_shelf_misc: 'S', store_shelf_meds: 'S', store_shelf_empty: 'S', cooler: 'Q', checkout: 'K', cash_register: 'K',
  clothing_rack: 'R', filing_cabinet: 'I', locker: 'L', medical_cabinet: 'M', crate_wood: 'X', crate_military: 'X', cardboard_box: 'x',
  bar_counter: 'K', pew: 'P', chalkboard: '-', radio: 'R', floorboard_loose: '#', trash_bags: 't', trash_can: 't', bench: 'P',
  stairs_wood: '/', stairs_concrete: '/', ladder: 'H', slab_wood: '-', door_wood: 'D', door_white: 'D', door_metal: 'D', door_glass: 'D', door_cell: 'D',
  lantern: '*', campfire: '*', barrel_burning: '*', fire: '*', vending_machine: 'V', dumpster: 'Y', mailbox: 'M', gas_pump: 'P',
};
/** Top-down map. scale = blocks per pixel (1 = full res). */
export function renderMap(world, { scale = 1, pois = true } = {}) {
  const W = Math.floor(world.SX / scale), H = Math.floor(world.SZ / scale);
  const img = makeImage(W, H);
  const { SX, SY, blocks } = world;
  const topAt = (x, z) => {
    const base = (x + z * SX) * SY;
    let y = SY - 1;
    while (y > 0 && blocks[base + y] === 0) y--;
    return y;
  };
  for (let pz = 0; pz < H; pz++) {
    for (let pxx = 0; pxx < W; pxx++) {
      const x = pxx * scale, z = pz * scale;
      const y = topAt(x, z);
      const id = blocks[(x + z * SX) * SY + y];
      let c = COL[id];
      // shading: height + slope toward NW light
      const yw = x > 0 ? topAt(x - 1, z) : y, yn = z > 0 ? topAt(x, z - 1) : y;
      let f = 0.78 + (y - 20) * 0.012 + (y - yw) * 0.05 + (y - yn) * 0.05;
      if (id === B.water) f = 0.9 + (y - 18) * 0.02;
      f = Math.max(0.35, Math.min(1.35, f));
      px(img, pxx, pz, [Math.min(255, c[0] * f), Math.min(255, c[1] * f), Math.min(255, c[2] * f)]);
    }
  }
  if (pois) {
    for (const p of world.pois) {
      const cx = Math.floor((p.x0 + p.x1) / 2 / scale), cz = Math.floor((p.z0 + p.z1) / 2 / scale);
      const label = p.name.replace(/[^A-Za-z0-9 .'&#-]/g, '');
      text(img, cx - label.length * 2, cz - 2, label, [255, 255, 160]);
    }
  }
  return img;
}

/**
 * Floor plan: for each column show the block at y (furniture / walls) or the floor at y-1 when y is air.
 * Doors magenta, stairs yellow, ladders orange, containers coloured. Each block = s pixels.
 */
export function renderFloor(world, x0, z0, x1, z1, y, s = 6, labels = null) {
  const W = (x1 - x0 + 1) * s, H = (z1 - z0 + 1) * s;
  const img = makeImage(W, H);
  for (let z = z0; z <= z1; z++) {
    for (let x = x0; x <= x1; x++) {
      let id = world.get(x, y, z);
      let c, dim = 1;
      if (id === 0) {
        const id2 = world.get(x, y + 1, z);
        if (id2 !== 0 && BLOCKS[id2].render !== 'cube') { id = id2; dim = 0.85; }
      }
      if (id === 0) { id = world.get(x, y - 1, z); dim = 0.55; }
      c = COL[id];
      const ox = (x - x0) * s, oz = (z - z0) * s;
      rect(img, ox, oz, s, s, [c[0] * dim, c[1] * dim, c[2] * dim]);
      const d = BLOCKS[id];
      // mark facing for oriented blocks with a dot toward the front
      if (d.oriented && dim > 0.6 && s >= 5) {
        const m = world.getMeta(x, dim > 0.9 ? y : y + 1, z) & 3;
        const [fx, fz] = [[0, 1], [-1, 0], [0, -1], [1, 0]][m];
        const cx = ox + Math.floor(s / 2) + fx * Math.floor(s / 2 - 1), cz = oz + Math.floor(s / 2) + fz * Math.floor(s / 2 - 1);
        rect(img, cx - 1, cz - 1, 2, 2, [0, 0, 0]);
      }
      if (world.containers.has(world.idx(x, y, z))) rect(img, ox + 1, oz + 1, 2, 2, [255, 255, 255]);
      const g = GLYPH[d.name];
      if (g && s >= 10 && dim > 0.6) text(img, ox + Math.floor(s / 2) - 1, oz + Math.floor(s / 2) - 2, g, [0, 0, 0], 1, false);
    }
  }
  for (const l of labels || []) {
    if (l.y !== y || l.x < x0 || l.x > x1 || l.z < z0 || l.z > z1) continue;
    const tx = (l.x - x0) * s + Math.floor(s / 2) - l.text.length * 2, tz = (l.z - z0) * s + 2;
    text(img, tx, tz, l.text, [255, 255, 255], 1, true);
  }
  // grid lines every block (faint)
  return img;
}

/** Vertical cross-section along X (axis 'x' at fixed z) or along Z. */
export function renderSection(world, axis, c, a0, a1, y0, y1, s = 4) {
  const W = (a1 - a0 + 1) * s, H = (y1 - y0 + 1) * s;
  const img = makeImage(W, H, [140, 180, 230]);
  for (let a = a0; a <= a1; a++) {
    for (let y = y0; y <= y1; y++) {
      const [x, z] = axis === 'x' ? [a, c] : [c, a];
      const id = world.get(x, y, z);
      if (id === 0) continue;
      const col = COL[id];
      rect(img, (a - a0) * s, (y1 - y) * s, s, s, col);
    }
  }
  return img;
}

export function scaleImage(img, k) {
  const out = makeImage(img.w * k, img.h * k);
  for (let y = 0; y < out.h; y++) for (let x = 0; x < out.w; x++) {
    const o = ((y / k | 0) * img.w + (x / k | 0)) * 3;
    px(out, x, y, [img.data[o], img.data[o + 1], img.data[o + 2]]);
  }
  return out;
}
