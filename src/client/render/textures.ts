import { allTileNames } from '../../shared/world/blocks';
import { hash4, mulberry32 } from '../../shared/math';

/**
 * Procedural 16x16 pixel-art tiles for every block texture. All art is
 * generated at runtime from code (original, no external assets). Output is
 * a list of RGBA layers suitable for a WebGL2 texture array.
 */
export const TILE = 16;

type RGB = [number, number, number];
type Px = Uint8ClampedArray;

const hex = (c: number): RGB => [(c >> 16) & 255, (c >> 8) & 255, c & 255];

class Canvas {
  readonly px: Px = new Uint8ClampedArray(TILE * TILE * 4);
  constructor(public rnd: () => number) {}
  set(x: number, y: number, c: RGB, a = 255) {
    if (x < 0 || y < 0 || x >= TILE || y >= TILE) return;
    const i = (y * TILE + x) * 4;
    this.px[i] = c[0]; this.px[i + 1] = c[1]; this.px[i + 2] = c[2]; this.px[i + 3] = a;
  }
  get(x: number, y: number): RGB {
    const i = (y * TILE + x) * 4;
    return [this.px[i], this.px[i + 1], this.px[i + 2]];
  }
  alpha(x: number, y: number, a: number) {
    this.px[(y * TILE + x) * 4 + 3] = a;
  }
  /** Fill with base colour plus per-pixel brightness noise. */
  noise(base: number, amount = 0.12, a = 255) {
    const c = hex(base);
    for (let y = 0; y < TILE; y++) for (let x = 0; x < TILE; x++) this.set(x, y, shade(c, 1 + (this.rnd() * 2 - 1) * amount), a);
  }
  rect(x0: number, y0: number, w: number, h: number, c: number | RGB, a = 255) {
    const col = typeof c === 'number' ? hex(c) : c;
    for (let y = y0; y < y0 + h; y++) for (let x = x0; x < x0 + w; x++) this.set(x, y, col, a);
  }
  speckle(c: number, chance: number, var_ = 0.1) {
    const col = hex(c);
    for (let y = 0; y < TILE; y++) for (let x = 0; x < TILE; x++) if (this.rnd() < chance) this.set(x, y, shade(col, 1 + (this.rnd() * 2 - 1) * var_));
  }
  darken(f: number) {
    for (let i = 0; i < this.px.length; i += 4) {
      this.px[i] *= f; this.px[i + 1] *= f; this.px[i + 2] *= f;
    }
  }
  clear() {
    this.px.fill(0);
  }
}

function shade(c: RGB, f: number): RGB {
  return [Math.min(255, c[0] * f), Math.min(255, c[1] * f), Math.min(255, c[2] * f)];
}

function mix(a: RGB, b: RGB, t: number): RGB {
  return [a[0] + (b[0] - a[0]) * t, a[1] + (b[1] - a[1]) * t, a[2] + (b[2] - a[2]) * t];
}

// ---------------------------------------------------------------- pattern helpers
function blobs(cv: Canvas, color: number, count: number, size = 2) {
  const c = hex(color);
  for (let i = 0; i < count; i++) {
    const bx = Math.floor(cv.rnd() * TILE), by = Math.floor(cv.rnd() * TILE);
    const s = 1 + Math.floor(cv.rnd() * size);
    for (let y = 0; y < s; y++) for (let x = 0; x < s + (cv.rnd() < 0.5 ? 1 : 0); x++) cv.set(bx + x, by + y, shade(c, 0.85 + cv.rnd() * 0.3));
  }
}

function planks(cv: Canvas, base: number, vertical = false) {
  cv.noise(base, 0.06);
  const dark = shade(hex(base), 0.7);
  for (let i = 0; i < TILE; i++) {
    for (const line of [3, 7, 11, 15]) {
      if (vertical) cv.set(line, i, dark);
      else cv.set(i, line, dark);
    }
  }
  // stagger seams
  for (let r = 0; r < 4; r++) {
    const off = (r * 5 + 3) % TILE;
    for (let k = 0; k < 3; k++) {
      if (vertical) cv.set(r * 4 + k, off, dark);
      else cv.set(off, r * 4 + k, dark);
    }
  }
  // grain
  for (let k = 0; k < 20; k++) {
    const x = Math.floor(cv.rnd() * TILE), y = Math.floor(cv.rnd() * TILE);
    cv.set(x, y, shade(hex(base), 0.85));
  }
}

function bricksPattern(cv: Canvas, brick: number, mortar: number, bw = 8, bh = 4) {
  cv.noise(brick, 0.08);
  const m = hex(mortar);
  for (let y = 0; y < TILE; y++) {
    const row = Math.floor(y / bh);
    for (let x = 0; x < TILE; x++) {
      const off = row % 2 ? bw / 2 : 0;
      if (y % bh === bh - 1 || (x + off) % bw === 0) cv.set(x, y, shade(m, 0.95 + cv.rnd() * 0.1));
    }
  }
}

function bark(cv: Canvas, base: number, stripe: number) {
  cv.noise(base, 0.08);
  const s = hex(stripe);
  for (let x = 0; x < TILE; x++) {
    if (cv.rnd() < 0.35) for (let y = 0; y < TILE; y++) if (cv.rnd() < 0.8) cv.set(x, y, shade(s, 0.9 + cv.rnd() * 0.2));
  }
}

function rings(cv: Canvas, inner: number, outer: number, barkC: number) {
  const a = hex(inner), b = hex(outer), k = hex(barkC);
  for (let y = 0; y < TILE; y++) for (let x = 0; x < TILE; x++) {
    const d = Math.hypot(x - 7.5, y - 7.5);
    if (d > 7) cv.set(x, y, shade(k, 0.9 + cv.rnd() * 0.2));
    else cv.set(x, y, shade(Math.floor(d) % 2 ? a : b, 0.95 + cv.rnd() * 0.1));
  }
}

function leaves(cv: Canvas, base: number, holes = 0.18) {
  cv.noise(base, 0.22);
  for (let y = 0; y < TILE; y++) for (let x = 0; x < TILE; x++) if (cv.rnd() < holes) cv.alpha(x, y, 0);
}

function ore(cv: Canvas, spot: number) {
  cv.noise(0x7d7d7d, 0.1);
  blobs(cv, 0x6a6a6a, 6, 2);
  const c = hex(spot);
  for (let i = 0; i < 5; i++) {
    const bx = 1 + Math.floor(cv.rnd() * 12), by = 1 + Math.floor(cv.rnd() * 12);
    cv.set(bx, by, c); cv.set(bx + 1, by, shade(c, 0.85)); cv.set(bx, by + 1, shade(c, 1.15)); cv.set(bx + 1, by + 1, c);
  }
}

function cross(cv: Canvas, draw: () => void) {
  cv.clear();
  draw();
}

function frame(cv: Canvas, c: number, w = 1) {
  const col = hex(c);
  for (let i = 0; i < TILE; i++) for (let k = 0; k < w; k++) {
    cv.set(i, k, col); cv.set(i, TILE - 1 - k, col); cv.set(k, i, col); cv.set(TILE - 1 - k, i, col);
  }
}

function rivets(cv: Canvas, c: number) {
  for (const [x, y] of [[2, 2], [13, 2], [2, 13], [13, 13]]) {
    cv.set(x, y, hex(c));
    cv.set(x + 1, y + 1, shade(hex(c), 0.6));
  }
}

function corrugated(cv: Canvas, base: number, rust = 0) {
  const c = hex(base);
  for (let y = 0; y < TILE; y++) for (let x = 0; x < TILE; x++) {
    const f = x % 4 === 0 ? 0.7 : x % 4 === 1 ? 1.15 : 1;
    cv.set(x, y, shade(c, f * (0.95 + cv.rnd() * 0.1)));
  }
  if (rust > 0) blobs(cv, 0x8a4a2a, Math.floor(rust * 10), 2);
}

function gridWire(cv: Canvas, c: number) {
  cv.clear();
  const col = hex(c);
  for (let y = 0; y < TILE; y++) for (let x = 0; x < TILE; x++) if ((x + y) % 4 === 0 || (x - y + 16) % 4 === 0) cv.set(x, y, col);
}

// ---------------------------------------------------------------- tile table
const TILES: Record<string, (cv: Canvas) => void> = {
  bedrock: (cv) => { cv.noise(0x3a3a3a, 0.3); blobs(cv, 0x1a1a1a, 10, 3); },
  stone: (cv) => { cv.noise(0x7d7d7d, 0.08); blobs(cv, 0x6c6c6c, 7, 3); blobs(cv, 0x8c8c8c, 4, 2); },
  dirt: (cv) => { cv.noise(0x79553a, 0.12); blobs(cv, 0x5e412c, 6, 2); blobs(cv, 0x8a6a4a, 3, 1); },
  grass_top: (cv) => { cv.noise(0x5d9b3a, 0.15); blobs(cv, 0x4a8a2e, 8, 2); },
  grass_side: (cv) => { TILES.dirt(cv); for (let x = 0; x < TILE; x++) { const h = 3 + Math.floor(cv.rnd() * 2.5); for (let y = 0; y < h; y++) cv.set(x, y, shade(hex(0x5d9b3a), 0.85 + cv.rnd() * 0.3)); } },
  swamp_grass_top: (cv) => { cv.noise(0x4b6b35, 0.15); blobs(cv, 0x3a5a2a, 8, 2); },
  swamp_grass_side: (cv) => { TILES.dirt(cv); for (let x = 0; x < TILE; x++) { const h = 3 + Math.floor(cv.rnd() * 2.5); for (let y = 0; y < h; y++) cv.set(x, y, shade(hex(0x4b6b35), 0.85 + cv.rnd() * 0.3)); } },
  dry_grass_top: (cv) => { cv.noise(0xa39a4f, 0.15); blobs(cv, 0x8a8040, 8, 2); },
  dry_grass_side: (cv) => { TILES.dirt(cv); for (let x = 0; x < TILE; x++) { const h = 2 + Math.floor(cv.rnd() * 3); for (let y = 0; y < h; y++) cv.set(x, y, shade(hex(0xa39a4f), 0.85 + cv.rnd() * 0.3)); } },
  snowy_grass_side: (cv) => { TILES.dirt(cv); for (let x = 0; x < TILE; x++) { const h = 3 + Math.floor(cv.rnd() * 3); for (let y = 0; y < h; y++) cv.set(x, y, shade(hex(0xf2f6f8), 0.92 + cv.rnd() * 0.08)); } },
  sand: (cv) => { cv.noise(0xdbd29b, 0.06); cv.speckle(0xc8bc80, 0.12); },
  gravel: (cv) => { cv.noise(0x8a8580, 0.1); blobs(cv, 0x6a6560, 10, 2); blobs(cv, 0xa8a39e, 6, 2); },
  snow: (cv) => { cv.noise(0xf2f6f8, 0.03); cv.speckle(0xdde6ee, 0.08); },
  ice: (cv) => { cv.noise(0x9fc3ef, 0.05, 200); for (let i = 0; i < 6; i++) { const x = Math.floor(cv.rnd() * 14); const y = Math.floor(cv.rnd() * 14); cv.set(x, y, [230, 240, 255], 220); cv.set(x + 1, y + 1, [230, 240, 255], 220); } },
  water: (cv) => { cv.noise(0x2f5fbf, 0.08, 170); for (let i = 0; i < 10; i++) { const x = Math.floor(cv.rnd() * 13), y = Math.floor(cv.rnd() * 16); for (let k = 0; k < 3; k++) cv.set(x + k, y, [90, 140, 220], 180); } },
  clay: (cv) => { cv.noise(0x9ea4b0, 0.06); },
  mud: (cv) => { cv.noise(0x4d3f30, 0.12); blobs(cv, 0x3a2f24, 8, 2); },
  sandstone: (cv) => { cv.noise(0xd6c58f, 0.05); for (const y of [4, 10, 14]) for (let x = 0; x < TILE; x++) cv.set(x, y, shade(hex(0xc0ae78), 0.95 + cv.rnd() * 0.1)); },
  sandstone_top: (cv) => { cv.noise(0xdccb95, 0.05); },
  oak_log: (cv) => bark(cv, 0x6b5332, 0x4e3c24),
  oak_log_top: (cv) => rings(cv, 0xb08a58, 0x9a7646, 0x6b5332),
  pine_log: (cv) => bark(cv, 0x4a3721, 0x33261a),
  pine_log_top: (cv) => rings(cv, 0xa0804e, 0x8a6a40, 0x4a3721),
  birch_log: (cv) => { cv.noise(0xd8d4c8, 0.05); for (let i = 0; i < 8; i++) { const y = Math.floor(cv.rnd() * 16), x = Math.floor(cv.rnd() * 13); for (let k = 0; k < 2 + Math.floor(cv.rnd() * 3); k++) cv.set(x + k, y, [40, 40, 36]); } },
  birch_log_top: (cv) => rings(cv, 0xc8b88a, 0xb8a87a, 0xd8d4c8),
  oak_leaves: (cv) => leaves(cv, 0x3f7f2a),
  pine_leaves: (cv) => leaves(cv, 0x2b5532, 0.12),
  birch_leaves: (cv) => leaves(cv, 0x6c9a3c),
  cactus_side: (cv) => { cv.noise(0x3b7d2f, 0.08); for (const x of [0, 5, 10, 15]) for (let y = 0; y < TILE; y++) cv.set(x, y, [40, 90, 30]); for (let i = 0; i < 8; i++) cv.set(Math.floor(cv.rnd() * 16), Math.floor(cv.rnd() * 16), [230, 230, 200]); },
  cactus_top: (cv) => { cv.noise(0x4a8d3c, 0.08); frame(cv, 0x2f6a25); },
  tall_grass: (cv) => cross(cv, () => { for (let b = 0; b < 7; b++) { const x = 1 + Math.floor(cv.rnd() * 14); const h = 6 + Math.floor(cv.rnd() * 9); for (let y = 0; y < h; y++) cv.set(x + (y > h / 2 && cv.rnd() < 0.3 ? 1 : 0), 15 - y, shade(hex(0x5d9b3a), 0.75 + cv.rnd() * 0.4)); } }),
  flower_red: (cv) => cross(cv, () => { for (let y = 6; y < 16; y++) cv.set(8, y, [50, 120, 40]); cv.set(7, 11, [50, 120, 40]); for (const [dx, dy] of [[0, 0], [1, 0], [-1, 0], [0, 1], [0, -1]]) cv.set(8 + dx, 5 + dy, dx || dy ? [200, 40, 40] : [240, 200, 60]); }),
  flower_yellow: (cv) => cross(cv, () => { for (let y = 7; y < 16; y++) cv.set(8, y, [50, 120, 40]); for (const [dx, dy] of [[0, 0], [1, 0], [-1, 0], [0, 1], [0, -1]]) cv.set(8 + dx, 6 + dy, dx || dy ? [235, 205, 50] : [180, 120, 30]); }),
  hemp: (cv) => cross(cv, () => { for (const x of [5, 10]) { for (let y = 1; y < 16; y++) cv.set(x, y, [70, 130, 50]); for (let y = 3; y < 14; y += 3) { cv.set(x - 1, y, [100, 170, 70]); cv.set(x - 2, y - 1, [100, 170, 70]); cv.set(x + 1, y, [100, 170, 70]); cv.set(x + 2, y - 1, [100, 170, 70]); } } }),
  berry_bush: (cv) => cross(cv, () => { for (let y = 4; y < 16; y++) for (let x = 2; x < 14; x++) if (cv.rnd() < 0.6) cv.set(x, y, shade(hex(0x2f6a28), 0.8 + cv.rnd() * 0.4)); for (let i = 0; i < 9; i++) cv.set(3 + Math.floor(cv.rnd() * 10), 6 + Math.floor(cv.rnd() * 8), [140, 40, 110]); }),
  mushroom: (cv) => cross(cv, () => { cv.rect(7, 9, 2, 7, [225, 215, 190]); cv.rect(4, 6, 8, 3, [184, 107, 75]); cv.rect(5, 5, 6, 1, [184, 107, 75]); cv.set(6, 6, [240, 230, 210]); cv.set(9, 7, [240, 230, 210]); }),
  dead_bush: (cv) => cross(cv, () => { const c: RGB = [139, 107, 58]; for (let y = 8; y < 16; y++) cv.set(8, y, c); for (let k = 0; k < 5; k++) { cv.set(8 - k, 8 - k, c); cv.set(8 + k, 9 - k, c); cv.set(7 - Math.floor(k / 2), 12 - k, c); } }),
  metal_ore: (cv) => ore(cv, 0xc8a080),
  sulfur_ore: (cv) => ore(cv, 0xf0e040),
  rich_ore: (cv) => ore(cv, 0x8ad0f0),
  // structure tiers
  struct_twig: (cv) => { cv.clear(); const c = hex(0xb08850); for (let i = 0; i < TILE; i++) { cv.set(i, i, c); cv.set(TILE - 1 - i, i, c); cv.set(i, 0, c); cv.set(i, 15, c); cv.set(0, i, c); cv.set(15, i, c); cv.set(i, 8, shade(c, 0.8)); } },
  struct_wood: (cv) => { planks(cv, 0x8a6034, true); frame(cv, 0x5a3e22); },
  struct_stone: (cv) => { bricksPattern(cv, 0x9a9a92, 0x6a6a64, 8, 8); },
  struct_metal: (cv) => { corrugated(cv, 0x7f6a5a, 0.4); frame(cv, 0x4a3e34); rivets(cv, 0xb0a090); },
  struct_armored: (cv) => { cv.noise(0x4f5560, 0.05); frame(cv, 0x2f3540, 2); cv.rect(7, 2, 2, 12, [60, 66, 76]); rivets(cv, 0x9aa0aa); },
  door_wood: (cv) => { planks(cv, 0x8a6034, true); frame(cv, 0x4e3620); cv.rect(11, 8, 2, 2, [60, 60, 60]); },
  door_metal: (cv) => { corrugated(cv, 0x7f6a5a, 0.2); frame(cv, 0x3e342c, 2); cv.rect(11, 7, 2, 3, [30, 30, 30]); },
  door_armored: (cv) => { cv.noise(0x4f5560, 0.04); frame(cv, 0x23272e, 2); for (const y of [5, 10]) cv.rect(2, y, 12, 1, [35, 40, 48]); cv.rect(11, 7, 2, 2, [200, 180, 60]); },
  // deployables
  planks: (cv) => planks(cv, 0xa7804a),
  workbench1_top: (cv) => { planks(cv, 0xa7804a); cv.rect(3, 3, 4, 2, [120, 120, 125]); cv.rect(9, 9, 5, 1, [90, 60, 30]); },
  workbench1_side: (cv) => { planks(cv, 0x8a6034); cv.rect(0, 0, 16, 3, [120, 90, 50]); cv.rect(1, 3, 2, 13, [80, 55, 30]); cv.rect(13, 3, 2, 13, [80, 55, 30]); },
  workbench2_top: (cv) => { cv.noise(0x7a7a80, 0.06); frame(cv, 0x4a4a50); cv.rect(4, 4, 3, 3, [180, 60, 40]); cv.rect(9, 8, 4, 2, [60, 60, 66]); },
  workbench2_side: (cv) => { cv.noise(0x6d6d6d, 0.06); cv.rect(0, 0, 16, 3, [90, 90, 96]); rivets(cv, 0xaaaaaa); },
  workbench3_top: (cv) => { cv.noise(0x4a5a6a, 0.05); frame(cv, 0x2a3a4a); cv.rect(3, 3, 10, 2, [60, 180, 220]); cv.rect(5, 8, 6, 4, [30, 40, 50]); },
  workbench3_side: (cv) => { cv.noise(0x4a5a6a, 0.05); cv.rect(0, 0, 16, 3, [60, 70, 80]); cv.rect(6, 6, 4, 4, [80, 200, 240]); rivets(cv, 0x9aaabb); },
  metal_plate: (cv) => { cv.noise(0x6d6d72, 0.05); rivets(cv, 0x9a9aa0); },
  furnace_top: (cv) => { bricksPattern(cv, 0x6d6d6d, 0x4a4a4a, 8, 4); cv.rect(5, 5, 6, 6, [30, 30, 30]); },
  furnace_side: (cv) => { bricksPattern(cv, 0x6d6d6d, 0x4a4a4a, 8, 4); cv.rect(4, 8, 8, 6, [40, 30, 25]); for (let x = 5; x < 11; x++) cv.set(x, 12 + Math.floor(cv.rnd() * 2), [255, 140, 40]); },
  campfire: (cv) => cross(cv, () => { cv.rect(2, 13, 12, 2, [90, 60, 35]); cv.rect(4, 12, 8, 1, [110, 75, 40]); for (let y = 4; y < 13; y++) { const w = Math.max(0, 5 - Math.abs(y - 9)); for (let x = 8 - w; x < 8 + w; x++) if (cv.rnd() < 0.85) cv.set(x, y, y < 7 ? [255, 220, 90] : [255, 120, 30]); } }),
  box_top: (cv) => { planks(cv, 0x9a7040); frame(cv, 0x5a4024); },
  box_side: (cv) => { planks(cv, 0x9a7040); frame(cv, 0x5a4024); cv.rect(7, 5, 2, 3, [70, 70, 70]); },
  large_box_top: (cv) => { planks(cv, 0x7a5530); frame(cv, 0x3a2814, 2); },
  large_box_side: (cv) => { planks(cv, 0x7a5530); frame(cv, 0x3a2814, 2); cv.rect(4, 4, 8, 1, [90, 90, 90]); cv.rect(7, 5, 2, 3, [70, 70, 70]); },
  totem_top: (cv) => { cv.noise(0xd9a441, 0.06); frame(cv, 0x8a6020); cv.rect(6, 6, 4, 4, [240, 210, 120]); },
  totem_side: (cv) => { cv.noise(0xc8923a, 0.06); frame(cv, 0x7a5018); cv.rect(5, 3, 2, 2, [40, 30, 20]); cv.rect(9, 3, 2, 2, [40, 30, 20]); cv.rect(5, 9, 6, 1, [40, 30, 20]); cv.rect(4, 12, 8, 2, [240, 200, 100]); },
  sleeping_bag: (cv) => { cv.noise(0x6b8f3a, 0.08); cv.rect(0, 0, 16, 4, [200, 190, 160]); for (let x = 0; x < 16; x += 4) cv.rect(x, 4, 1, 12, [80, 110, 46]); },
  research_top: (cv) => { cv.noise(0x557799, 0.05); frame(cv, 0x2a3a4a); cv.rect(3, 3, 6, 6, [210, 230, 240]); cv.rect(10, 10, 3, 3, [240, 200, 60]); },
  research_side: (cv) => { cv.noise(0x557799, 0.05); cv.rect(0, 0, 16, 3, [70, 90, 110]); cv.rect(3, 6, 10, 5, [30, 40, 50]); cv.rect(4, 7, 3, 1, [80, 220, 120]); },
  crate_top: (cv) => { planks(cv, 0x8a6a3a); frame(cv, 0x4a3a1a, 2); },
  crate_side: (cv) => { planks(cv, 0x8a6a3a); frame(cv, 0x4a3a1a, 2); for (let i = 2; i < 14; i++) { cv.set(i, i, [74, 58, 26]); cv.set(15 - i, i, [74, 58, 26]); } },
  mil_crate_top: (cv) => { cv.noise(0x3f5a2f, 0.06); frame(cv, 0x2a3a1e, 2); cv.rect(6, 6, 4, 4, [200, 190, 120]); },
  mil_crate_side: (cv) => { cv.noise(0x3f5a2f, 0.06); frame(cv, 0x2a3a1e, 2); cv.rect(3, 6, 10, 3, [210, 200, 140]); cv.rect(4, 7, 8, 1, [63, 90, 47]); },
  barrel_top: (cv) => { cv.noise(0x8a4a2a, 0.12); frame(cv, 0x5a2a14); cv.rect(10, 4, 2, 2, [30, 30, 30]); },
  barrel_side: (cv) => { corrugated(cv, 0x9a4a2a, 0.6); for (const y of [2, 8, 13]) cv.rect(0, y, 16, 1, [60, 30, 18]); },
  // POI
  concrete: (cv) => { cv.noise(0xa8a8a0, 0.05); cv.speckle(0x8a8a84, 0.1); },
  rusted_metal: (cv) => { corrugated(cv, 0x8a4a2a, 0.3); blobs(cv, 0xb06030, 5, 2); },
  container_red: (cv) => { corrugated(cv, 0xa83a2a, 0.15); frame(cv, 0x6a2418); },
  container_blue: (cv) => { corrugated(cv, 0x2a5aa8, 0.15); frame(cv, 0x183a6a); },
  container_teal: (cv) => { corrugated(cv, 0x2a9a8a, 0.15); frame(cv, 0x186a5a); },
  asphalt: (cv) => { cv.noise(0x3a3a3c, 0.1); cv.speckle(0x55555a, 0.1); },
  steel_beam: (cv) => { cv.noise(0x404448, 0.06); cv.rect(0, 0, 16, 2, [30, 32, 36]); cv.rect(0, 14, 16, 2, [30, 32, 36]); cv.rect(7, 2, 2, 12, [70, 74, 80]); },
  hazard_stripes: (cv) => { for (let y = 0; y < TILE; y++) for (let x = 0; x < TILE; x++) cv.set(x, y, Math.floor((x + y) / 4) % 2 ? [30, 30, 30] : shade([216, 176, 32], 0.95 + cv.rnd() * 0.1)); },
  chain_fence: (cv) => { gridWire(cv, 0x9a9aa0); frame(cv, 0x6a6a70); },
  lamp: (cv) => { cv.noise(0xfff0a0, 0.04); frame(cv, 0x6a6a60); },
  cobblestone: (cv) => { cv.noise(0x6f6f6f, 0.05); for (let i = 0; i < 9; i++) { const x = Math.floor(cv.rnd() * 12), y = Math.floor(cv.rnd() * 12); const w = 3 + Math.floor(cv.rnd() * 3); cv.rect(x, y, w, 3, shade(hex(0x8a8a8a), 0.85 + cv.rnd() * 0.3)); } for (let y = 0; y < 16; y++) for (let x = 0; x < 16; x++) if (cv.rnd() < 0.08) cv.set(x, y, [60, 60, 60]); },
  bricks: (cv) => bricksPattern(cv, 0x9a4a3a, 0xb0a898),
  glass: (cv) => { cv.clear(); for (let y = 0; y < 16; y++) for (let x = 0; x < 16; x++) cv.set(x, y, [200, 225, 235], 50); frame(cv, 0xc8e0e8); cv.set(4, 4, [255, 255, 255], 200); cv.set(5, 3, [255, 255, 255], 200); cv.set(3, 5, [255, 255, 255], 200); },
  // monument decoration
  metal_grate: (cv) => {
    cv.clear();
    for (let y = 0; y < TILE; y++) for (let x = 0; x < TILE; x++) {
      const bar = x % 4 === 0 || y % 4 === 0;
      if (bar) cv.set(x, y, shade(hex(0x5a5e62), (x % 4 === 0 && y % 4 === 0 ? 0.8 : 1) * (0.92 + cv.rnd() * 0.16)));
    }
    frame(cv, 0x3a3e42);
    blobs(cv, 0x7a4a2a, 2, 1);
  },
  tank_plate: (cv) => {
    cv.noise(0xcc6a2c, 0.07);
    for (let i = 0; i < TILE; i++) { cv.set(i, 7, shade(hex(0xcc6a2c), 0.72)); cv.set(i, 15, shade(hex(0xcc6a2c), 0.72)); }
    for (let y = 0; y < 7; y++) cv.set(4, y, shade(hex(0xcc6a2c), 0.75));
    for (let y = 8; y < 15; y++) cv.set(11, y, shade(hex(0xcc6a2c), 0.75));
    for (const [x, y] of [[1, 2], [7, 2], [14, 10], [8, 12]]) cv.set(x, y, [230, 170, 110]);
    for (let k = 0; k < 5; k++) { const x = Math.floor(cv.rnd() * 16); for (let y = Math.floor(cv.rnd() * 6); y < 16; y++) if (cv.rnd() < 0.7) cv.set(x, y, shade(hex(0x8a4a2a), 0.9 + cv.rnd() * 0.2)); }
  },
  crane_stripes: (cv) => { for (let y = 0; y < TILE; y++) for (let x = 0; x < TILE; x++) cv.set(x, y, Math.floor((x + y) / 4) % 2 ? [28, 32, 34] : shade([42, 154, 138], 0.94 + cv.rnd() * 0.12)); frame(cv, 0x1c2224); },
  container_orange: (cv) => { corrugated(cv, 0xd0702a, 0.15); frame(cv, 0x8a4418); },
  fuel_pump_side: (cv) => {
    cv.noise(0xb03028, 0.05);
    frame(cv, 0x6a1a14);
    cv.rect(3, 2, 10, 4, [30, 36, 30]);
    cv.rect(4, 3, 6, 1, [120, 230, 120]);
    cv.rect(3, 8, 10, 1, [235, 225, 210]);
    cv.rect(10, 10, 2, 4, [40, 40, 44]);
    cv.rect(4, 11, 4, 2, [220, 190, 60]);
  },
  fuel_pump_top: (cv) => { cv.noise(0xa02820, 0.05); frame(cv, 0x6a1a14); },
  control_panel: (cv) => {
    cv.noise(0x5a6a70, 0.05);
    frame(cv, 0x2e383c);
    cv.rect(2, 2, 12, 5, [24, 30, 34]);
    for (let x = 3; x < 13; x++) cv.set(x, 6 - Math.floor(cv.rnd() * 4), [90, 220, 140]);
    for (const [x, c] of [[3, [230, 70, 50]], [6, [240, 200, 60]], [9, [80, 200, 90]], [12, [80, 160, 230]]] as Array<[number, RGB]>) { cv.rect(x - 1, 9, 2, 2, c); }
    cv.rect(2, 12, 12, 2, [70, 80, 86]);
  },
  road_marking: (cv) => { cv.noise(0x3a3a3c, 0.1); cv.speckle(0x55555a, 0.1); cv.rect(6, 0, 4, 16, [218, 200, 120]); for (let y = 0; y < 16; y++) if (cv.rnd() < 0.25) cv.set(6 + Math.floor(cv.rnd() * 4), y, [120, 116, 100]); },
  torch: (cv) => cross(cv, () => { cv.rect(7, 6, 2, 10, [110, 80, 40]); cv.rect(7, 3, 2, 3, [255, 200, 60]); cv.set(7, 2, [255, 240, 150]); cv.set(8, 4, [255, 140, 30]); }),
};

/** Fallback for any tile without a dedicated painter: coloured noise. */
function fallback(cv: Canvas, name: string) {
  const h = hash4(name.length, name.charCodeAt(0), name.charCodeAt(name.length - 1));
  cv.noise(0x404040 + (h & 0x7f7f7f), 0.1);
}

export interface TileAtlas {
  names: string[];
  index: Map<string, number>;
  data: Uint8Array;
}

export function buildTiles(): TileAtlas {
  const names = allTileNames();
  const data = new Uint8Array(names.length * TILE * TILE * 4);
  const index = new Map<string, number>();
  names.forEach((name, i) => {
    let seed = 0;
    for (let k = 0; k < name.length; k++) seed = (seed * 31 + name.charCodeAt(k)) >>> 0;
    const cv = new Canvas(mulberry32(seed));
    (TILES[name] ?? ((c: Canvas) => fallback(c, name)))(cv);
    data.set(cv.px, i * TILE * TILE * 4);
    index.set(name, i);
  });
  return { names, index, data };
}

/** Tile names with no dedicated painter (for tests / art TODOs). */
export function missingTilePainters(): string[] {
  return allTileNames().filter((n) => !TILES[n]);
}

export { mix };
