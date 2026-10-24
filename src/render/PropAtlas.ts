import * as THREE from 'three';
import { Rng } from '../core/math';

/** Tile ids in the 16x16 prop atlas (32px tiles). */
export const T = {
  WHITE: 0,
  WOOD: 1,
  WOOD_DARK: 2,
  PLANKS: 3,
  METAL: 4,
  CHROME: 5,
  VINYL: 6,
  FABRIC: 7,
  FELT: 8,
  GLASS: 9,
  LABEL_A: 10,
  LABEL_B: 11,
  LABEL_C: 12,
  LABEL_D: 13,
  CHALK: 14,
  CERAMIC: 15,
  CARDBOARD: 16,
  CRATE: 17,
  KEG: 18,
  JUKEBOX: 19,
  ARCADE_SCREEN: 20,
  ARCADE_SIDE: 21,
  DARTBOARD: 22,
  REGISTER: 23,
  BOOKS: 24,
  RUG: 25,
  CUSHION: 26,
  PIANO: 27,
  SPEAKER: 28,
  PAPER: 29,
  TV: 30,
  POOL_RACK: 31,
  WOOD_LIGHT: 32,
  LEATHER: 33,
  RUBBER: 34,
  GUITAR: 35,
  DRUM: 36,
  NEON: 37,
  MENU: 38,
  POSTER_A: 39,
  POSTER_B: 40,
  POSTER_C: 41,
  BARREL: 42,
  CARPET_RED: 43,
  LABEL_E: 44,
  PINBALL: 45,
  GRILL: 46,
  TILE_SMALL: 47,
  ARCADE_SCREEN2: 48,
  FRAME_PIC: 49,
  MIRROR: 50,
  PLANT: 51,
  BRASS: 52,
  CLOTH_WHITE: 53,
  SAFE: 54,
  FILE_CABINET: 55,
} as const;

export const ATLAS_TILES = 16;
const TILE = 32;

function shadeHex(hex: string, amt: number): string {
  const c = new THREE.Color(hex);
  if (amt >= 0) c.lerp(new THREE.Color(1, 1, 1), amt);
  else c.multiplyScalar(1 + amt);
  return '#' + c.getHexString();
}

/** Procedurally paint the prop texture atlas. */
export function buildPropAtlas(): THREE.CanvasTexture {
  const c = document.createElement('canvas');
  c.width = c.height = TILE * ATLAS_TILES;
  const g = c.getContext('2d')!;
  g.imageSmoothingEnabled = false;
  const rng = new Rng(9001);
  const at = (id: number) => [(id % ATLAS_TILES) * TILE, Math.floor(id / ATLAS_TILES) * TILE] as const;
  const px = (x: number, y: number, col: string, w = 1, h = 1) => {
    g.fillStyle = col;
    g.fillRect(x, y, w, h);
  };
  const fill = (id: number, col: string) => {
    const [x, y] = at(id);
    px(x, y, col, TILE, TILE);
  };
  const noise = (id: number, cols: string[], density: number) => {
    const [ox, oy] = at(id);
    for (let y = 0; y < TILE; y++) for (let x = 0; x < TILE; x++) if (rng.next() < density) px(ox + x, oy + y, rng.pick(cols));
  };

  fill(T.WHITE, '#ffffff');
  noise(T.WHITE, ['#f2f2f2', '#fafafa'], 0.15);

  // wood grain (neutral-ish light, gets tinted)
  const wood = (id: number, base: string, dark: string, light: string) => {
    const [ox, oy] = at(id);
    px(ox, oy, base, TILE, TILE);
    for (let y = 0; y < TILE; y++) {
      const wave = Math.sin(y * 0.6 + rng.next()) * 1.5;
      for (let x = 0; x < TILE; x++) {
        const v = Math.sin((x + wave) * 0.9 + y * 0.05);
        if (v > 0.82) px(ox + x, oy + y, dark);
        else if (v < -0.9 && rng.next() < 0.5) px(ox + x, oy + y, light);
      }
    }
    for (let k = 0; k < 2; k++) {
      const kx = ox + rng.int(4, 27),
        ky = oy + rng.int(4, 27);
      px(kx, ky, dark, 2, 2);
    }
  };
  wood(T.WOOD, '#c8a080', '#a07a5a', '#dcb898');
  wood(T.WOOD_DARK, '#7a5238', '#5a3a26', '#8e6446');
  wood(T.WOOD_LIGHT, '#e0c8a8', '#c4a684', '#ecd8bc');
  {
    // planks (table tops / floors)
    const [ox, oy] = at(T.PLANKS);
    px(ox, oy, '#c09a78', TILE, TILE);
    for (let p = 0; p < 4; p++) {
      const y0 = oy + p * 8;
      const tone = rng.pick(['#c09a78', '#b48e6c', '#caa684', '#b89270']);
      px(ox, y0, tone, TILE, 8);
      px(ox, y0 + 7, '#7a5a40', TILE, 1);
      for (let x = 0; x < TILE; x++) if (rng.next() < 0.25) px(ox + x, y0 + rng.int(1, 6), shadeHex(tone, -0.12));
      const nailX = ox + rng.int(2, 28);
      px(nailX, y0 + 3, '#4a3a30');
    }
  }
  {
    const [ox, oy] = at(T.METAL);
    px(ox, oy, '#b8bcc0', TILE, TILE);
    for (let y = 0; y < TILE; y++) px(ox, oy + y, rng.next() < 0.5 ? '#aeb2b6' : '#c2c6ca', TILE, 1);
    noise(T.METAL, ['#9a9ea2'], 0.04);
  }
  {
    const [ox, oy] = at(T.CHROME);
    for (let y = 0; y < TILE; y++) {
      const t = y / TILE;
      const v = Math.round(150 + 100 * Math.abs(Math.sin(t * 3.14 * 1.5)));
      px(ox, oy + y, `rgb(${v},${v},${v + 8})`, TILE, 1);
    }
    px(ox + 6, oy + 2, '#ffffff', 2, 26);
  }
  {
    // tufted vinyl
    const [ox, oy] = at(T.VINYL);
    px(ox, oy, '#d0d0d0', TILE, TILE);
    for (let y = 4; y < TILE; y += 8) for (let x = 4; x < TILE; x += 8) {
      px(ox + x, oy + y, '#909090', 2, 2);
      px(ox + x - 3, oy + y - 3, '#e8e8e8', 2, 1);
    }
  }
  fill(T.FABRIC, '#d8d8d8');
  noise(T.FABRIC, ['#c4c4c4', '#e4e4e4', '#b8b8b8'], 0.5);
  fill(T.FELT, '#2f8a4a');
  noise(T.FELT, ['#2a7e43', '#349652', '#287640'], 0.4);
  {
    const [ox, oy] = at(T.GLASS);
    px(ox, oy, '#e8f4f0', TILE, TILE);
    px(ox + 5, oy, '#ffffff', 3, TILE);
    px(ox + 22, oy, '#d0e4e0', 2, TILE);
  }
  const label = (id: number, bg: string, band: string, mark: string) => {
    const [ox, oy] = at(id);
    // glass top/bottom (tinted by vertex color) with paper label middle
    px(ox, oy, '#ffffff', TILE, TILE);
    px(ox + 4, oy, '#ffffff', 2, TILE);
    px(ox, oy + 12, bg, TILE, 14);
    px(ox, oy + 14, band, TILE, 2);
    px(ox, oy + 23, band, TILE, 1);
    for (let k = 0; k < 4; k++) px(ox + 10 + k * 3, oy + 18, mark, 2, 3);
  };
  label(T.LABEL_A, '#e8d8a0', '#c01818', '#2a2a2a');
  label(T.LABEL_B, '#2a3a8a', '#e8c040', '#f0f0f0');
  label(T.LABEL_C, '#1a1a1a', '#d0a040', '#e8e0d0');
  label(T.LABEL_D, '#f0f0e8', '#2a7a3a', '#c01818');
  label(T.LABEL_E, '#c02020', '#f0f0f0', '#f0d040');
  {
    const [ox, oy] = at(T.CHALK);
    px(ox, oy, '#1e2a24', TILE, TILE);
    noise(T.CHALK, ['#2a3a32', '#18221c'], 0.3);
    for (let r = 0; r < 6; r++) for (let k = 0; k < rng.int(3, 7); k++) px(ox + 3 + k * 4, oy + 4 + r * 4, '#d8dcd0', rng.int(2, 3), 1);
  }
  fill(T.CERAMIC, '#f4f2ec');
  noise(T.CERAMIC, ['#e6e4de'], 0.08);
  {
    const [ox, oy] = at(T.CARDBOARD);
    px(ox, oy, '#b8905a', TILE, TILE);
    noise(T.CARDBOARD, ['#a8824e', '#c49c66'], 0.25);
    px(ox, oy + 15, '#d8c090', TILE, 3);
    px(ox + 8, oy + 6, '#3a2a1a', 6, 5);
  }
  {
    const [ox, oy] = at(T.CRATE);
    px(ox, oy, '#b08858', TILE, TILE);
    for (let s = 0; s < 4; s++) {
      px(ox, oy + s * 8 + 7, '#6a4a2a', TILE, 1);
    }
    px(ox, oy, '#6a4a2a', 2, TILE);
    px(ox + 30, oy, '#6a4a2a', 2, TILE);
    for (let k = 0; k < 30; k++) px(ox + rng.int(2, 29), oy + rng.int(0, 31), '#9a7448');
  }
  {
    const [ox, oy] = at(T.KEG);
    px(ox, oy, '#b8bcc0', TILE, TILE);
    px(ox, oy + 4, '#80848a', TILE, 2);
    px(ox, oy + 26, '#80848a', TILE, 2);
    px(ox + 6, oy, '#e0e4e8', 2, TILE);
  }
  {
    // jukebox front: arch of lights + record window + buttons
    const [ox, oy] = at(T.JUKEBOX);
    px(ox, oy, '#5a1a1a', TILE, TILE);
    for (let x = 0; x < TILE; x++) {
      const hue = (x * 11) % 360;
      px(ox + x, oy + 1, `hsl(${hue},90%,60%)`, 1, 3);
    }
    px(ox + 4, oy + 6, '#e8d8a0', 24, 10);
    px(ox + 6, oy + 8, '#1a1a1a', 20, 6);
    for (let k = 0; k < 8; k++) px(ox + 5 + k * 3, oy + 19, k % 2 ? '#f0f0f0' : '#d03030', 2, 2);
    for (let y = 23; y < 31; y += 2) px(ox + 4, oy + y, '#c8a040', 24, 1);
  }
  {
    const scr = (id: number, a: string, b: string) => {
      const [ox, oy] = at(id);
      px(ox, oy, '#0a0a1a', TILE, TILE);
      for (let k = 0; k < 14; k++) px(ox + rng.int(2, 28), oy + rng.int(2, 28), rng.pick([a, b, '#ffffff']), 2, 2);
      px(ox + 12, oy + 22, a, 6, 3);
      px(ox + 4, oy + 3, b, 24, 2);
    };
    scr(T.ARCADE_SCREEN, '#30e030', '#e03030');
    scr(T.ARCADE_SCREEN2, '#e0d020', '#3070f0');
  }
  {
    const [ox, oy] = at(T.ARCADE_SIDE);
    px(ox, oy, '#1a1a6a', TILE, TILE);
    for (let k = 0; k < 6; k++) px(ox, oy + k * 5 + 2, `hsl(${k * 50},80%,55%)`, TILE, 2);
  }
  {
    const [ox, oy] = at(T.DARTBOARD);
    px(ox, oy, '#1a1a1a', TILE, TILE);
    for (let y = 0; y < TILE; y++)
      for (let x = 0; x < TILE; x++) {
        const dx = x - 15.5,
          dy = y - 15.5;
        const r = Math.sqrt(dx * dx + dy * dy);
        if (r > 15) continue;
        const ang = Math.atan2(dy, dx);
        const seg = Math.floor(((ang + Math.PI) / (2 * Math.PI)) * 20);
        let col = seg % 2 ? '#e8dcb8' : '#1a1a1a';
        if (r > 13 || (r > 7 && r < 8.5)) col = seg % 2 ? '#c02020' : '#208040';
        if (r < 2.5) col = '#c02020';
        if (r < 1.2) col = '#208040';
        px(ox + x, oy + y, col);
      }
  }
  {
    const [ox, oy] = at(T.REGISTER);
    px(ox, oy, '#3a3a3a', TILE, TILE);
    for (let y = 0; y < 4; y++) for (let x = 0; x < 5; x++) px(ox + 3 + x * 5, oy + 12 + y * 5, '#e8e8e0', 4, 4);
    px(ox + 4, oy + 3, '#30c040', 24, 6);
  }
  {
    const [ox, oy] = at(T.BOOKS);
    let x = 0;
    while (x < TILE) {
      const w = rng.int(2, 4);
      const col = rng.pick(['#8a2a2a', '#2a4a8a', '#2a6a3a', '#8a6a2a', '#4a2a6a', '#c8b890']);
      px(ox + x, oy + rng.int(0, 4), col, w, TILE);
      px(ox + x, oy + 10, shadeHex(col, 0.3), w, 1);
      x += w;
    }
  }
  {
    const [ox, oy] = at(T.RUG);
    px(ox, oy, '#7a2a2a', TILE, TILE);
    px(ox + 2, oy + 2, '#c8a040', 28, 28);
    px(ox + 4, oy + 4, '#7a2a2a', 24, 24);
    for (let k = 0; k < 6; k++) px(ox + 8 + k * 3, oy + 8 + k * 3, '#c8a040', 3, 3);
  }
  fill(T.CUSHION, '#c02828');
  noise(T.CUSHION, ['#a82020', '#d03030'], 0.3);
  {
    const [ox, oy] = at(T.PIANO);
    px(ox, oy, '#f4f0e6', TILE, TILE);
    for (let k = 0; k < 8; k++) px(ox + k * 4 + 3, oy, '#111111', 2, 18);
    for (let k = 0; k < 8; k++) px(ox + k * 4, oy, '#9a968e', 1, TILE);
  }
  {
    const [ox, oy] = at(T.SPEAKER);
    px(ox, oy, '#1a1a1a', TILE, TILE);
    for (const [cx, cy, r] of [
      [16, 10, 6],
      [16, 24, 7],
    ]) {
      for (let y = -r; y <= r; y++) for (let x = -r; x <= r; x++) if (x * x + y * y <= r * r) px(ox + cx + x, oy + cy + y, x * x + y * y < 4 ? '#5a5a5a' : '#2c2c2c');
    }
  }
  fill(T.PAPER, '#f0ead8');
  noise(T.PAPER, ['#2a2a2a'], 0.06);
  {
    const [ox, oy] = at(T.TV);
    px(ox, oy, '#151515', TILE, TILE);
    px(ox + 2, oy + 2, '#2a5a3a', 28, 22);
    for (let k = 0; k < 10; k++) px(ox + 2 + rng.int(0, 26), oy + 2 + rng.int(0, 20), '#4a8a5a', 3, 2);
    px(ox + 6, oy + 26, '#5a5a5a', 3, 3);
  }
  {
    const [ox, oy] = at(T.POOL_RACK);
    px(ox, oy, '#5a3a26', TILE, TILE);
    for (let k = 0; k < 6; k++) px(ox + 3 + k * 5, oy + 2, '#d8c8a0', 2, 28);
  }
  {
    const [ox, oy] = at(T.LEATHER);
    px(ox, oy, '#5a3a26', TILE, TILE);
    noise(T.LEATHER, ['#4a2e1e', '#6a4630', '#3e2618'], 0.35);
  }
  fill(T.RUBBER, '#2a2a2a');
  noise(T.RUBBER, ['#222', '#333'], 0.3);
  {
    const [ox, oy] = at(T.GUITAR);
    px(ox, oy, '#c02020', TILE, TILE);
    px(ox + 10, oy + 6, '#1a1a1a', 12, 20);
    px(ox + 12, oy + 10, '#e8e8e8', 8, 2);
    px(ox + 12, oy + 18, '#e8e8e8', 8, 2);
    for (let k = 0; k < 6; k++) px(ox + 13 + k, oy, '#d8d8d8', 1, TILE);
  }
  {
    const [ox, oy] = at(T.DRUM);
    px(ox, oy, '#f0f0f0', TILE, TILE);
    px(ox, oy, '#2050c0', TILE, 4);
    px(ox, oy + 28, '#2050c0', TILE, 4);
    for (let k = 0; k < 6; k++) px(ox + k * 6, oy + 4, '#c8c8c8', 1, 24);
  }
  fill(T.NEON, '#ffffff');
  {
    const [ox, oy] = at(T.MENU);
    px(ox, oy, '#2a1a12', TILE, TILE);
    px(ox + 2, oy + 2, '#e8dcc0', 28, 28);
    for (let r = 0; r < 7; r++) {
      px(ox + 4, oy + 5 + r * 3, '#3a2a1a', rng.int(10, 18), 1);
      px(ox + 24, oy + 5 + r * 3, '#3a2a1a', 3, 1);
    }
  }
  const poster = (id: number, bg: string, fg: string, accent: string) => {
    const [ox, oy] = at(id);
    px(ox, oy, '#1a1410', TILE, TILE);
    px(ox + 2, oy + 2, bg, 28, 28);
    px(ox + 8, oy + 6, fg, 16, 14);
    px(ox + 4, oy + 22, accent, 24, 3);
    px(ox + 6, oy + 26, accent, 20, 2);
  };
  poster(T.POSTER_A, '#d8b040', '#2a1a12', '#c01818');
  poster(T.POSTER_B, '#2a4a8a', '#e8d8c0', '#e8c040');
  poster(T.POSTER_C, '#c01818', '#1a1a1a', '#f0f0f0');
  {
    const [ox, oy] = at(T.BARREL);
    wood(T.BARREL, '#9a6a3a', '#6a4422', '#b07c48');
    px(ox, oy + 5, '#3a3a3a', TILE, 2);
    px(ox, oy + 25, '#3a3a3a', TILE, 2);
  }
  fill(T.CARPET_RED, '#7a1418');
  noise(T.CARPET_RED, ['#6a1014', '#8a1a1e', '#5a0c10'], 0.45);
  {
    const [ox, oy] = at(T.PINBALL);
    px(ox, oy, '#1a0a3a', TILE, TILE);
    for (let k = 0; k < 9; k++) px(ox + rng.int(2, 26), oy + rng.int(2, 26), rng.pick(['#f0d020', '#e03070', '#30d0f0']), 4, 4);
  }
  {
    const [ox, oy] = at(T.GRILL);
    px(ox, oy, '#2a2a2a', TILE, TILE);
    for (let k = 0; k < 8; k++) px(ox, oy + k * 4, '#5a5a5a', TILE, 1);
  }
  {
    const [ox, oy] = at(T.TILE_SMALL);
    for (let y = 0; y < 4; y++) for (let x = 0; x < 4; x++) px(ox + x * 8, oy + y * 8, (x + y) % 2 ? '#e8e8e0' : '#2a2a2a', 8, 8);
  }
  {
    const [ox, oy] = at(T.FRAME_PIC);
    px(ox, oy, '#8a6a2a', TILE, TILE);
    px(ox + 3, oy + 3, '#5a7a9a', 26, 26);
    px(ox + 3, oy + 18, '#4a6a3a', 26, 11);
    px(ox + 18, oy + 8, '#e8d080', 5, 5);
  }
  {
    const [ox, oy] = at(T.MIRROR);
    px(ox, oy, '#a8b8c0', TILE, TILE);
    for (let k = 0; k < 4; k++) px(ox + 4 + k * 6, oy + 2 + k * 4, '#e8f0f4', 3, 12);
  }
  {
    const [ox, oy] = at(T.PLANT);
    px(ox, oy, '#2a5a2a', TILE, TILE);
    noise(T.PLANT, ['#3a7a3a', '#1e4a1e', '#4a8a3a'], 0.6);
  }
  fill(T.BRASS, '#c8a040');
  noise(T.BRASS, ['#e0c060', '#a88030'], 0.2);
  fill(T.CLOTH_WHITE, '#f2f0ea');
  noise(T.CLOTH_WHITE, ['#e2e0da'], 0.15);
  {
    const [ox, oy] = at(T.SAFE);
    px(ox, oy, '#3a4a3a', TILE, TILE);
    px(ox + 2, oy + 2, '#2a3a2a', 28, 28);
    for (let y = -5; y <= 5; y++) for (let x = -5; x <= 5; x++) if (x * x + y * y <= 25) px(ox + 16 + x, oy + 16 + y, '#b8b8b0');
    px(ox + 15, oy + 11, '#2a2a2a', 2, 10);
  }
  {
    const [ox, oy] = at(T.FILE_CABINET);
    px(ox, oy, '#7a8a8a', TILE, TILE);
    for (let k = 0; k < 3; k++) {
      px(ox + 2, oy + 2 + k * 10, '#6a7a7a', 28, 9);
      px(ox + 12, oy + 5 + k * 10, '#d8d8d0', 8, 2);
    }
  }

  const tex = new THREE.CanvasTexture(c);
  tex.magFilter = THREE.NearestFilter;
  tex.minFilter = THREE.NearestMipmapLinearFilter;
  tex.colorSpace = THREE.SRGBColorSpace;
  tex.anisotropy = 4;
  return tex;
}

export function tileUV(tile: number): { u0: number; v0: number; u1: number; v1: number } {
  const x = tile % ATLAS_TILES;
  const y = Math.floor(tile / ATLAS_TILES);
  const inset = 0.5 / (TILE * ATLAS_TILES);
  // flipY true (default): canvas row 0 is at v=1
  return {
    u0: x / ATLAS_TILES + inset,
    u1: (x + 1) / ATLAS_TILES - inset,
    v1: 1 - y / ATLAS_TILES - inset,
    v0: 1 - (y + 1) / ATLAS_TILES + inset,
  };
}
