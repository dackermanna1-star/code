// Procedural 20x20 Noita-style spell icons: a 1px frame coloured by spell type, a dark card background,
// and a hand-designed 16x16 glyph (drawn with primitives, then given a dark 1px outline).
import { PixelImage, lighten, darken, mixHex, hashString, PixelRng, hslHex } from './pixels';
import {
  OUTLINE,
  ball,
  sparkle,
  diag,
  cyl,
  arrow,
  arrowHead,
  polyline,
  bezier,
  teardrop,
  clockMark,
  triggerMark,
  bar,
  starPoly,
  ringFn,
  noise2,
  thickLine,
} from './glyphKit';

export type SpellIconType = 'projectile' | 'static' | 'modifier' | 'multicast' | 'material' | 'utility' | 'passive' | 'other';

export const SPELL_ICON_SIZE = 20;
export const SPELL_GLYPH_SIZE = 16;

/** Frame colour per spell type (Noita convention). */
export const SPELL_TYPE_COLORS: Record<SpellIconType, string> = {
  projectile: '#8a3324', // dark red/brown
  static: '#9a6428', // orange-brown
  modifier: '#2f5aa0', // blue
  multicast: '#2a8a6e', // teal/green
  material: '#2f9aa6', // cyan-ish
  utility: '#7a3c9e', // purple
  passive: '#55667e', // gray-blue
  other: '#6a6666', // gray
};

// ---------------------------------------------------------------------------------------------
// Palettes

const W = '#ffffff';
const SPARK = { hi: '#c8f8ff', mid: '#5cd4ff', lo: '#2a8ce0', dim: '#1d56a8' };
const FIRE = { white: '#fff8d0', yellow: '#ffd84a', orange: '#ff8a20', red: '#d8341a', deep: '#8a1a10' };

interface Mat {
  base: string;
  light: string;
  dark: string;
}
const MAT: Record<string, Mat> = {
  water: { base: '#3a7ae8', light: '#9ad0ff', dark: '#1e3e9a' },
  oil: { base: '#4e4230', light: '#a8945e', dark: '#221a12' },
  blood: { base: '#c01e1e', light: '#ff7a68', dark: '#6a0a0a' },
  acid: { base: '#6ad82a', light: '#d0ff88', dark: '#2e7a10' },
  fire: { base: '#ff7a1a', light: '#ffe060', dark: '#c02a10' },
  lava: { base: '#f05a10', light: '#ffd040', dark: '#901a08' },
  flamgas: { base: '#b8c060', light: '#f0f2b8', dark: '#6a7030' },
};

type GlyphFn = (g: PixelImage) => void;

// ---------------------------------------------------------------------------------------------
// Reusable glyph pieces

/** Spark bolt: bright star head at (hx, hy) with a tapering diagonal tail toward the lower left. */
function sparkBolt(g: PixelImage, hx = 10, hy = 5, len = 8): void {
  for (let i = 1; i <= len; i++) {
    const x = hx - i;
    const y = hy + i;
    const c = i <= 2 ? SPARK.mid : i <= 5 ? SPARK.lo : SPARK.dim;
    g.set(x, y, c);
    if (i < len - 1) g.set(x + 1, y, i <= 3 ? SPARK.hi : i <= 5 ? SPARK.mid : SPARK.lo);
  }
  g.circle(hx, hy, 1.5, SPARK.mid);
  for (const [dx, dy] of [
    [2, 0],
    [-2, 0],
    [0, 2],
    [0, -2],
  ])
    g.set(hx + dx, hy + dy, SPARK.hi);
  g.set(hx + 3, hy, SPARK.mid);
  g.set(hx, hy - 3, SPARK.mid);
  g.set(hx + 4, hy, SPARK.lo);
  g.set(hx, hy - 4, SPARK.lo);
  sparkle(g, hx, hy, W, 1);
}

/** Energy orb (blue-violet). */
function energyOrb(g: PixelImage, cx: number, cy: number, r: number): void {
  g.circle(cx, cy, r, '#3a2a9a');
  g.circle(cx, cy, r - 1, '#6a52ea');
  g.circle(cx - 0.5, cy - 0.5, r - 2.2, '#a898ff');
  g.circle(cx - 0.5, cy - 0.5, Math.max(0.5, r - 3.6), '#e8e0ff');
  g.set(Math.round(cx - r * 0.45), Math.round(cy - r * 0.45), W);
  // little orbiting motes
  g.set(Math.round(cx + r + 1), Math.round(cy - r + 1), '#b8a8ff');
  g.set(Math.round(cx - r - 1), Math.round(cy + r - 2), '#8a78f0');
}

function spitterBlobs(g: PixelImage, big: boolean): void {
  const base = big ? '#d03ad8' : '#b43ee0';
  if (big) {
    ball(g, 9.5, 6, 4, base);
    ball(g, 3.5, 11.5, 1.6, base, null);
    ball(g, 12.5, 12.5, 1.2, base, null);
    g.set(1, 15, darken(base, 0.1));
    g.set(6, 14, lighten(base, 0.2));
    g.set(15, 1, lighten(base, 0.3));
  } else {
    ball(g, 10, 5, 3, base);
    ball(g, 4.5, 10.5, 1.6, base, null);
    g.fillRect(1, 14, 2, 1, darken(base, 0.1));
    g.set(1, 13, lighten(base, 0.2));
  }
}

/** Swirling teleport vortex. */
function vortex(g: PixelImage, cx: number, cy: number, r: number): void {
  ringFn(g, cx, cy, r, r + 1, (ang, depth) => {
    const d = r + 0.45 - depth; // distance from centre
    const v = Math.sin(ang * 2 - d * 1.25);
    if (d < 1.2) return '#ffffff';
    if (v > 0.45) return d < r * 0.55 ? '#a8f4ff' : '#c890ff';
    if (v > -0.2) return d < r * 0.55 ? '#4ab8f0' : '#7a48d8';
    return d > r - 0.8 ? null : '#2a1a6a';
  });
}

function dottedPath(g: PixelImage, pts: Array<[number, number]>, c: string, every = 2, c2?: string): void {
  pts.forEach(([x, y], i) => {
    if (i % every === 0) g.set(x, y, c);
    else if (c2) g.set(x, y, c2);
  });
}

function circleOf(g: PixelImage, m: Mat, fire = false): void {
  ringFn(g, 7.5, 7.5, 7, 2.2, (ang, depth, x, y) => {
    const deg = (ang * 180) / Math.PI;
    if (depth < 1) {
      if (deg > 95 && deg < 190) return m.light;
      if (deg > 250 && deg < 345) return m.dark;
      return m.base;
    }
    return noise2(x, y, 7) < 0.25 ? m.light : mixHex(m.base, m.dark, 0.35);
  });
  if (fire) {
    // flame tongues licking up from the top half of the ring
    for (const [x, y, h] of [
      [3, 2, 2],
      [7, 0, 1],
      [11, 1, 2],
      [1, 6, 1],
      [14, 5, 1],
    ] as const) {
      for (let i = 0; i < h; i++) g.set(x, y - i, i === h - 1 ? FIRE.yellow : FIRE.orange);
    }
  }
  // tiny caster dot in the middle
  g.fillRect(7, 7, 2, 2, lighten(m.light, 0.3));
  g.set(7, 7, W);
}

function sea(g: PixelImage, m: Mat, gas = false): void {
  const crest = (k: number, x: number) => 4 + k * 4 + Math.round(1.1 * Math.sin(((x + k * 3) * Math.PI * 2) / 8));
  if (!gas) {
    for (let x = 0; x < 16; x++)
      for (let y = crest(0, x); y < 16; y++) {
        const depth = (y - 4) / 12;
        g.set(x, y, depth < 0.45 ? m.base : depth < 0.8 ? mixHex(m.base, m.dark, 0.5) : m.dark);
      }
    for (let k = 0; k < 3; k++)
      for (let x = 0; x < 16; x++) {
        const y = crest(k, x);
        g.set(x, y, k === 0 ? m.light : k === 1 ? lighten(m.base, 0.3) : lighten(m.base, 0.12));
        if (k === 0 && Math.sin(((x + 1) * Math.PI * 2) / 8) > 0.7) g.set(x, y - 1, W);
      }
    // splash droplets above the surface
    g.set(4, 1, m.light);
    g.set(11, 0, m.light);
    g.set(12, 2, m.base);
  } else {
    // gas: dithered haze under wavy, puffy tops
    for (let x = 0; x < 16; x++)
      for (let y = crest(0, x); y < 16; y++) {
        if ((x + y) % 2 === 1 && y > crest(0, x) + 1) continue;
        g.set(x, y, y < 9 ? m.base : m.dark);
      }
    for (let k = 0; k < 3; k++)
      for (let x = 0; x < 16; x++) g.set(x, crest(k, x), k === 0 ? m.light : lighten(m.base, 0.15));
    g.circle(4, 1.5, 1.2, m.light);
    g.circle(11, 0.5, 0.8, m.base);
  }
}

function materialDrop(g: PixelImage, m: Mat): void {
  teardrop(g, 7.5, 7.5, 4.5, 0, m.base);
  // puddle below
  g.fillRect(2, 15, 12, 1, m.base);
  g.fillRect(4, 15, 4, 1, m.light);
  g.set(1, 13, m.base);
  g.set(14, 12, m.light);
}

function trail(g: PixelImage, kind: 'fire' | 'oil' | 'water' | 'acid'): void {
  const m = MAT[kind];
  // path from the projectile back toward the lower left
  const path: Array<[number, number]> = [];
  for (let i = 0; i <= 9; i++) path.push([11 - i, 4 + Math.round(i * 0.8)]);
  if (kind === 'fire') {
    path.forEach(([x, y], i) => {
      if (i > 0) g.set(x, y + 1, i < 5 ? FIRE.orange : FIRE.red);
    });
    const flame = (x: number, y: number, h: number) => {
      // small flame: wide yellow base, orange body, red flickering tip
      g.fillRect(x - 1, y - 1, 3, 2, FIRE.orange);
      g.set(x, y, FIRE.yellow);
      g.set(x, y - 1, FIRE.yellow);
      for (let k = 2; k <= h; k++) g.set(x, y - k, k === h ? FIRE.red : FIRE.orange);
      g.set(x + 1, y - h + 1, FIRE.red);
    };
    flame(8, 6, 4);
    flame(4, 9, 3);
    flame(1, 13, 2);
    g.set(6, 12, FIRE.orange);
    g.set(3, 15, FIRE.red);
  } else {
    path.forEach(([x, y], i) => {
      if (i === 0) return;
      g.set(x, y, i < 4 ? m.light : m.base);
      g.set(x, y + 1, m.dark);
    });
    // drips falling from the trail
    for (const [x, y, s] of [
      [8, 9, 1],
      [4, 11, 2],
      [1, 14, 1],
      [6, 14, 1],
    ] as const) {
      g.set(x, y, m.light);
      for (let k = 1; k <= s; k++) g.set(x, y + k, m.base);
      g.set(x, y + s + 1, m.dark);
    }
  }
  ball(g, 12, 3, 1.6, '#fff4c0', W);
  g.set(14, 1, '#fff4c0');
}

function burst(g: PixelImage, n: number): void {
  const rows = n === 2 ? [4, 10] : n === 3 ? [2, 7, 12] : [1, 5, 9, 13];
  for (const y of rows) {
    for (let x = 1; x <= 10; x++) {
      const c = x < 4 ? '#2a6a7a' : x < 7 ? '#4ab8c8' : '#9ef0f0';
      g.set(x, y + (x < 4 ? 0 : 0), c);
      if (x >= 6) g.set(x, y + 1, darken(c, 0.25));
    }
    g.fillRect(11, y - (n === 4 ? 0 : 1), 3, n === 4 ? 2 : 3, '#e8fff8');
    g.set(14, y, '#9ef0f0');
    g.set(12, y, W);
  }
}

function scatter(g: PixelImage, n: number): void {
  const angles = n === 2 ? [22, -22] : n === 3 ? [32, 0, -32] : [40, 14, -14, -40];
  const ox = 1;
  const oy = 7.5;
  for (const a of angles) {
    const t = (a * Math.PI) / 180;
    const ex = ox + Math.cos(t) * 12.5;
    const ey = oy - Math.sin(t) * 12.5;
    const pts = bezier([ox, oy], [(ox + ex) / 2, (oy + ey) / 2], [ex, ey], 30);
    dottedPath(g, pts.slice(1, -2), '#4ab8c8', 2);
    g.circle(ex, ey, 1, '#e8fff8');
    g.set(Math.round(ex), Math.round(ey), W);
  }
  g.fillRect(0, 7, 2, 2, '#d8a840');
  g.set(0, 7, '#ffe8a0');
}

function formation(g: PixelImage, hub: [number, number], arrows: number[], stem: boolean, len = 6, ring = false): void {
  const [hx, hy] = hub;
  const col = '#8ae8c8';
  if (ring) {
    const pts: Array<[number, number]> = arrows.map((a) => {
      const t = (a * Math.PI) / 180;
      return [Math.round(hx + Math.cos(t) * len), Math.round(hy - Math.sin(t) * len)];
    });
    pts.push(pts[0]);
    polyline(g, pts, '#2a6a5a');
  }
  if (stem) g.line(hx, hy + 1, hx, 15, '#b8a070');
  for (const a of arrows) {
    const t = (a * Math.PI) / 180;
    const ex = Math.round(hx + Math.cos(t) * len);
    const ey = Math.round(hy - Math.sin(t) * len);
    arrow(g, hx, hy, ex, ey, col, 2, '#e8fff4');
  }
  g.fillRect(hx - 1, hy - 1, 3, 3, '#d8a840');
  g.set(hx, hy, '#fff0b0');
}

function hourglass(g: PixelImage): void {
  const wood = '#8a5a2a';
  bar(g, 2, 1, 10, 2, wood);
  bar(g, 2, 13, 10, 2, wood);
  const glass = '#b8d8e8';
  for (let y = 3; y <= 12; y++) {
    const t = y <= 7 ? 7 - y : y - 8;
    const half = 1 + Math.round(t * 0.75);
    for (let x = 7 - half; x < 7 + half; x++) {
      const edge = x === 7 - half || x === 7 + half - 1;
      let c = edge ? glass : '#2a3a48';
      // sand: settled at bottom, a little left on top, falling stream
      if (!edge && ((y >= 10 && y <= 12) || (y >= 5 && y <= 6) || (x === 6 && y >= 7 && y <= 9))) c = '#e8b840';
      g.set(x, y, c);
    }
  }
  g.set(5, 4, W);
}

function genericRune(g: PixelImage, id: string, type: SpellIconType): void {
  const r = new PixelRng(hashString(id) ^ 0x5eed);
  const hueBase: Record<SpellIconType, number> = {
    projectile: 20,
    static: 40,
    modifier: 210,
    multicast: 160,
    material: 185,
    utility: 285,
    passive: 220,
    other: 0,
  };
  const hue = (hueBase[type] ?? 0) + r.range(-40, 40);
  const sat = type === 'other' || type === 'passive' ? 0.25 : 0.75;
  const base = hslHex(hue, sat, 0.58);
  const cells: boolean[][] = [];
  for (let y = 0; y < 12; y++) {
    const row: boolean[] = [];
    for (let x = 0; x < 6; x++) row.push(r.chance(0.32 + (x / 6) * 0.25));
    cells.push(row);
  }
  for (let y = 0; y < 12; y++)
    for (let x = 0; x < 6; x++) {
      if (!cells[y][x]) continue;
      const c = y < 4 ? lighten(base, 0.3) : y > 8 ? darken(base, 0.25) : base;
      g.set(2 + x, 2 + y, c);
      g.set(13 - x, 2 + y, c);
    }
  // type motif
  switch (type) {
    case 'projectile':
    case 'static':
      g.circle(7.5, 7.5, 1.5, W);
      break;
    case 'modifier':
      g.fillRect(7, 5, 2, 6, W);
      g.fillRect(5, 7, 6, 2, W);
      break;
    case 'multicast':
      g.fillRect(4, 7, 2, 2, W);
      g.fillRect(10, 7, 2, 2, W);
      break;
    default:
      g.fillRect(7, 7, 2, 2, W);
  }
}

// ---------------------------------------------------------------------------------------------
// Glyphs

const GLYPHS: Record<string, GlyphFn> = {
  LIGHT_BULLET: (g) => sparkBolt(g, 10, 5, 8),
  LIGHT_BULLET_TRIGGER: (g) => {
    sparkBolt(g, 9, 5, 7);
    triggerMark(g, 11, 11);
  },
  LIGHT_BULLET_TRIGGER_2: (g) => {
    sparkBolt(g, 9, 5, 7);
    triggerMark(g, 11, 11);
    triggerMark(g, 5, 11, '#ff7a30');
  },
  LIGHT_BULLET_TIMER: (g) => {
    sparkBolt(g, 9, 5, 7);
    clockMark(g, 11, 11);
  },
  RUBBER_BALL: (g) => {
    // dotted bounce arcs ending at the ball, with floor marks where it hit
    g.fillRect(0, 15, 2, 1, '#7a6a50');
    g.fillRect(5, 15, 3, 1, '#7a6a50');
    const hop: Array<[number, number]> = [];
    for (let x = 0; x <= 12; x++) {
      const y = x <= 6 ? 14 - 6 * (1 - ((x - 3) / 3) ** 2) : 14 - 1.9 * (x - 6) - 0.05 * (x - 6) ** 2;
      hop.push([x, Math.round(y)]);
    }
    hop.forEach(([x, y], i) => {
      if (i % 2 === 0 && x <= 8) g.set(x, y, i < 6 ? '#7a9030' : '#b8d050');
    });
    ball(g, 11, 5, 3.6, '#b8d830');
  },
  SLOW_BULLET: (g) => energyOrb(g, 7.5, 7.5, 5.5),
  SLOW_BULLET_TRIGGER: (g) => {
    energyOrb(g, 6.5, 6.5, 5);
    triggerMark(g, 11, 11);
  },
  SLOW_BULLET_TIMER: (g) => {
    energyOrb(g, 6.5, 6.5, 5);
    clockMark(g, 11, 11);
  },
  SPITTER: (g) => spitterBlobs(g, false),
  SPITTER_TIMER: (g) => {
    spitterBlobs(g, false);
    clockMark(g, 11, 11);
  },
  SPITTER_TIER_2: (g) => spitterBlobs(g, true),
  BUBBLESHOT: (g) => {
    const bub = (cx: number, cy: number, r: number) => {
      g.circle(cx, cy, r, '#1e4a74');
      g.circle(cx, cy, r, '#8ad8ff', false);
      g.set(Math.round(cx - r * 0.5), Math.round(cy - r * 0.5), W);
      if (r > 2.5) g.set(Math.round(cx - r * 0.5) + 1, Math.round(cy - r * 0.5), '#d0f4ff');
      g.set(Math.round(cx + r * 0.45), Math.round(cy + r * 0.45), '#4a9ad0');
    };
    bub(9.5, 6.5, 4.5);
    bub(3.5, 11.5, 2.5);
    bub(11.5, 13, 1.6);
    g.set(1, 4, '#8ad8ff');
  },
  ROCKET: (g) => {
    diag(g, 2.5, 13.5, 45, (a, b) => {
      const ab = Math.abs(b);
      if (a >= 11 && a <= 14.2 && ab <= (14.2 - a) * 0.6 + 0.2) return cyl(b, 1.5, '#e03a2a');
      if (a >= 4 && a < 11 && ab <= 1.5) return a > 7.2 && a < 8.8 && ab <= 0.8 ? '#58c8ff' : cyl(b, 1.5, '#c8ccd4');
      if (a >= 3 && a < 6.5 && ab <= 1.5 + (6.5 - a) * 0.7 && ab > 1.1) return cyl(b, 3, '#c02a20');
      if (a >= 0 && a < 4 && ab <= (a + 0.5) * 0.4) return a > 2.5 ? FIRE.white : a > 1.2 ? FIRE.yellow : FIRE.orange;
      return null;
    });
    g.set(1, 15, FIRE.red);
    g.set(0, 13, FIRE.orange);
  },
  BOMB: (g) => {
    ball(g, 6.5, 9.5, 5.2, '#3c3c4a');
    g.fillRect(9, 3, 3, 2, '#7a7a88');
    g.set(9, 3, '#b0b0c0');
    g.line(11, 2, 12, 1, '#a07040');
    g.set(13, 1, '#c89050');
    sparkle(g, 14, 1, FIRE.yellow, 1, W);
    g.set(15, 3, FIRE.orange);
    g.set(12, 0, FIRE.orange);
  },
  DYNAMITE: (g) => {
    diag(g, 2.5, 13.5, 45, (a, b) => {
      const ab = Math.abs(b);
      if (a >= 0 && a <= 10 && ab <= 1.9) {
        if ((a > 2.2 && a < 3.4) || (a > 7 && a < 8.2)) return cyl(b, 1.9, '#e8d090');
        return cyl(b, 1.9, '#d82a22');
      }
      return null;
    });
    // fuse + spark
    g.line(10, 5, 12, 3, '#9a7040');
    sparkle(g, 13, 2, FIRE.yellow, 1, W);
    g.set(15, 1, FIRE.orange);
    g.set(14, 4, FIRE.red);
  },
  FIREBALL: (g) => {
    diag(g, 9.5, 6.5, 45, (a, b, x, y) => {
      const ab = Math.abs(b);
      if (a > -10 && a < 0 && ab <= (a + 10) * 0.42 * (0.7 + noise2(x, y, 11) * 0.5)) {
        return a > -3 ? FIRE.orange : a > -6.5 ? FIRE.red : FIRE.deep;
      }
      return null;
    });
    g.circle(9.5, 6.5, 4.6, FIRE.red);
    g.circle(9.5, 6.5, 3.6, FIRE.orange);
    g.circle(9, 6, 2.4, FIRE.yellow);
    g.circle(8.5, 5.5, 1, FIRE.white);
    g.set(14, 3, FIRE.orange);
    g.set(13, 1, FIRE.yellow);
  },
  GRENADE: (g) => {
    // firebolt: glowing rock with a narrow fiery streak
    diag(g, 11, 5, 45, (a, b, x, y) => {
      const ab = Math.abs(b);
      if (a > -12 && a < -1 && ab <= 0.6 + (a + 12) * 0.12 + (noise2(x, y, 5) - 0.5) * 0.8) {
        return a > -4 ? FIRE.yellow : a > -8 ? FIRE.orange : FIRE.red;
      }
      return null;
    });
    g.circle(11, 5, 3, FIRE.orange);
    ball(g, 11, 5, 2.1, '#a8401c', FIRE.yellow);
    g.set(12, 6, '#5a1a0c');
    g.set(10, 6, '#d06a2a');
  },
  CHAINSAW: (g) => {
    ringFn(g, 7.5, 7.5, 7.4, 1.6, (ang) => {
      const k = (ang / (Math.PI * 2)) * 12;
      const f = k - Math.floor(k);
      return f < 0.55 ? (ang > 0.8 && ang < 3.6 ? '#e8ecf0' : '#a0a8b4') : null;
    });
    g.circle(7.5, 7.5, 5.6, '#8a929e');
    ringFn(g, 7.5, 7.5, 5.6, 1, (ang) => (ang > 0.6 && ang < 3.4 ? '#d0d6de' : '#5a606a'));
    g.circle(7.5, 7.5, 2.2, '#c84a2a');
    g.circle(7.5, 7.5, 1, '#2a1a1a');
    // motion swooshes
    g.set(5, 4, '#e8ecf0');
    g.set(4, 5, '#e8ecf0');
    g.set(11, 11, '#5a606a');
  },
  LUMINOUS_DRILL: (g) => {
    // a short, blinding beam boring into a rock face
    g.fillRect(12, 0, 4, 16, '#6a5a4a');
    for (let y = 0; y < 16; y++) {
      g.set(12, y, noise2(12, y, 9) < 0.5 ? '#8a7a64' : '#4a3e34');
      if (noise2(14, y, 4) < 0.3) g.set(14, y, '#4a3e34');
    }
    for (let x = 0; x <= 12; x++) {
      const flare = x < 2 ? 1 : 0;
      for (let dy = -3 - flare; dy <= 3 + flare; dy++) {
        const ad = Math.abs(dy);
        const c = ad === 0 ? W : ad === 1 ? '#fffbc0' : ad === 2 ? '#f8e048' : '#c8a020';
        if (ad === 3 && noise2(x, dy, 2) < 0.35) continue;
        g.set(x, 8 + dy, c);
      }
    }
    // the bore hole glows and spits sparks
    g.fillRect(12, 6, 2, 5, '#fffbc0');
    g.fillRect(12, 7, 2, 3, W);
    for (const [x, y] of [
      [10, 2],
      [9, 13],
      [11, 3],
      [11, 13],
      [8, 1],
    ] as const)
      g.set(x, y, '#fff070');
  },
  DIGGER: (g) => {
    // pickaxe: handle along the diagonal, curved head across its top
    diag(g, 1.5, 14.5, 45, (a, b) => (a >= 0 && a <= 13 && Math.abs(b) <= 0.75 ? cyl(b, 0.75, '#9a6a3a') : null));
    const cx = 4.5;
    const cy = 11.5;
    for (let y = 0; y < 16; y++)
      for (let x = 0; x < 16; x++) {
        const d = Math.hypot(x - cx, y - cy);
        const ang = (Math.atan2(-(y - cy), x - cx) * 180) / Math.PI; // 45 = toward upper right
        const off = Math.abs(ang - 45);
        if (off > 50) continue;
        const th = 1.6 * (1 - off / 58);
        if (d >= 10.2 - th && d <= 10.2 + th * 0.7) g.set(x, y, d > 10.3 ? '#6a6e78' : off < 20 ? '#c8ccd6' : '#9aa0aa');
      }
    g.set(9, 5, '#d0d4dc');
  },
  BLACK_HOLE: (g) => {
    ringFn(g, 7.5, 7.5, 7.3, 4.2, (ang, depth) => {
      const v = Math.sin(ang * 2 + depth * 1.6);
      if (depth < 1.2) return v > 0.3 ? '#5a2a9a' : null;
      return v > 0.2 ? '#a060f0' : v > -0.5 ? '#6a30b0' : '#3a1a6a';
    });
    g.circle(7.5, 7.5, 3.2, '#e0b8ff');
    g.circle(7.5, 7.5, 2.6, '#000000');
    g.set(6, 6, '#1a0a2a');
  },
  LIGHTNING: (g) => {
    const pts: Array<[number, number]> = [
      [11, 0],
      [4, 8],
      [8, 8],
      [4, 15],
      [13, 6],
      [9, 6],
      [13.5, 0],
    ];
    g.fillPolygon(pts, '#ffe040');
    g.line(11, 1, 6, 7, '#ffffc0');
    g.line(7, 9, 6, 11, '#ffffc0');
    g.line(12, 7, 6, 13, '#d8a020');
    g.set(2, 3, '#ffe040');
    g.set(14, 12, '#ffe040');
  },
  DEATH_CROSS: (g) => {
    // glowing latin cross
    const draw = (grow: number, c: string) => {
      g.fillRect(6 - grow, 1 - grow, 4 + grow * 2, 14 + grow * 2, c);
      g.fillRect(2 - grow, 4 - grow, 12 + grow * 2, 4 + grow * 2, c);
    };
    draw(1, '#5a1a6a');
    draw(0, '#d8a8f0');
    g.fillRect(7, 2, 2, 12, '#ffffff');
    g.fillRect(3, 5, 10, 2, '#ffffff');
    g.fillRect(9, 8, 1, 6, '#a070c0');
    g.fillRect(10, 7, 3, 1, '#a070c0');
  },
  ARROW: (g) => {
    diag(g, 1.5, 14.5, 45, (a, b) => {
      const ab = Math.abs(b);
      if (a >= 13 && a <= 18.5 && ab <= (18.5 - a) * 0.62 + 0.2) return b < 0 ? '#e8ecf0' : '#9aa0aa';
      if (a >= 0 && a < 13 && ab <= 0.6) return cyl(b, 0.6, '#9a6a34');
      if (a >= 0 && a < 4.5 && ab > 0.6 && ab <= 2.4 - (4.5 - a) * 0.15) return Math.floor(a) % 2 === 0 ? '#e83a2a' : '#f0f0f0';
      return null;
    });
  },
  FLAMETHROWER: (g) => {
    for (let x = 3; x < 16; x++) {
      const half = (x - 3) * 0.48 + 0.5;
      for (let y = 0; y < 16; y++) {
        const dy = Math.abs(y - 8);
        const n = noise2(x, y, 21);
        if (dy > half + (n - 0.5) * 2.2) continue;
        const t = (x - 3) / 12 + dy / 10 + (n - 0.5) * 0.15;
        g.set(x, y, t < 0.25 ? FIRE.white : t < 0.5 ? FIRE.yellow : t < 0.78 ? FIRE.orange : FIRE.red);
      }
    }
    bar(g, 0, 6, 4, 4, '#7a7a8a');
    g.set(3, 7, '#3a3a44');
    g.set(3, 8, '#3a3a44');
  },
  FREEZING_GAZE: (g) => {
    // almond eye
    for (let y = 0; y < 16; y++)
      for (let x = 0; x < 16; x++) {
        const inLens = Math.hypot(x - 7.5, y - 13) <= 7.6 && Math.hypot(x - 7.5, y - 1) <= 7.6;
        if (inLens) g.set(x, y, '#e4f4ff');
      }
    g.circle(7.5, 7, 2.6, '#38b8f0');
    g.circle(7.5, 7, 1.3, '#0c2a50');
    g.set(6, 6, W);
    // upper lid line
    for (let x = 1; x <= 14; x++) {
      const y = Math.round(13 - Math.sqrt(Math.max(0, 7.6 * 7.6 - (x - 7.5) ** 2)));
      g.set(x, y, '#2a6ab0');
    }
    // icicles + frost rays
    for (const [x, y, h] of [
      [4, 10, 3],
      [7, 11, 4],
      [10, 10, 3],
      [12, 9, 2],
    ] as const)
      for (let k = 0; k < h; k++) g.set(x, y + k, k === h - 1 ? '#5ac8f0' : '#c8f4ff');
    g.set(1, 2, '#a0e8ff');
    g.set(14, 2, '#a0e8ff');
    g.set(7, 0, '#c8f4ff');
    g.set(8, 0, '#a0e8ff');
  },
  HEAL_BULLET: (g) => {
    g.fillRect(5, 1, 6, 14, '#2ab83a');
    g.fillRect(1, 5, 14, 6, '#2ab83a');
    g.fillRect(5, 1, 1, 14, '#8af09a');
    g.fillRect(1, 5, 14, 1, '#8af09a');
    g.fillRect(10, 1, 1, 14, '#167a24');
    g.fillRect(1, 10, 14, 1, '#167a24');
    g.fillRect(5, 5, 6, 6, '#3ad04a');
    g.fillRect(6, 6, 3, 3, '#b8ffc0');
    g.set(6, 6, W);
    sparkle(g, 2, 2, '#b8ffc0', 1);
    sparkle(g, 13, 13, '#b8ffc0', 1);
  },
  TELEPORT_PROJECTILE: (g) => {
    vortex(g, 10, 6, 5.6);
    dottedPath(g, bezier([0, 15], [1, 10], [4, 10], 20), '#e8dcff', 1);
    arrowHead(g, 5, 10, 0, 2, '#ffffff');
  },
  TELEPORT_PROJECTILE_SHORT: (g) => {
    vortex(g, 10, 6, 3.8);
    g.line(2, 13, 4, 11, '#e8dcff');
    arrowHead(g, 5, 10, 45, 1.5, '#ffffff');
    g.set(1, 14, '#8a5ad8');
  },
  ACIDSHOT: (g) => {
    const m = MAT.acid;
    ball(g, 9.5, 5.5, 3.8, m.base, W);
    g.set(11, 7, m.light);
    g.set(8, 7, lighten(m.base, 0.4));
    // drips hanging off the bottom
    for (const [x, h] of [
      [7, 3],
      [10, 4],
      [12, 2],
    ] as const)
      for (let k = 0; k < h; k++) g.set(x, 9 + k, k === h - 1 ? m.light : m.base);
    ball(g, 4, 11, 1.4, m.base, null);
    g.set(1, 14, m.base);
    g.set(2, 13, m.light);
  },
  LASER: (g) => {
    diag(g, 2.5, 13.5, 45, (a, b) => {
      const ab = Math.abs(b);
      if (a < 1 || a > 15) return null;
      if (ab <= 0.5) return '#ffe8e8';
      if (ab <= 1.2) return '#ff3a3a';
      if (ab <= 1.9 && a > 3) return '#8a1020';
      return null;
    });
    ball(g, 2, 13, 2, '#8a3ab0', '#f0c0ff');
    sparkle(g, 13, 2, '#ff9a9a', 2, W);
  },
  CIRCLE_WATER: (g) => circleOf(g, MAT.water),
  CIRCLE_OIL: (g) => circleOf(g, MAT.oil),
  CIRCLE_FIRE: (g) => circleOf(g, MAT.fire, true),
  CIRCLE_ACID: (g) => circleOf(g, MAT.acid),
  SEA_WATER: (g) => sea(g, MAT.water),
  SEA_OIL: (g) => sea(g, MAT.oil),
  SEA_LAVA: (g) => sea(g, MAT.lava),
  SEA_ACID: (g) => sea(g, MAT.acid),
  SEA_FLAMGAS: (g) => sea(g, MAT.flamgas, true),
  MATERIAL_WATER: (g) => materialDrop(g, MAT.water),
  MATERIAL_OIL: (g) => materialDrop(g, MAT.oil),
  MATERIAL_BLOOD: (g) => materialDrop(g, MAT.blood),
  MATERIAL_ACID: (g) => materialDrop(g, MAT.acid),

  // --- modifiers -------------------------------------------------------------------------
  DAMAGE: (g) => {
    g.fillRect(6, 1, 4, 14, '#d82a22');
    g.fillRect(1, 6, 14, 4, '#d82a22');
    g.fillRect(6, 1, 1, 14, '#ff8a70');
    g.fillRect(1, 6, 14, 1, '#ff8a70');
    g.fillRect(9, 1, 1, 14, '#7a1010');
    g.fillRect(1, 9, 14, 1, '#7a1010');
    g.fillRect(7, 7, 2, 2, '#ffb8a8');
    g.set(7, 2, W);
  },
  SPEED: (g) => {
    const chevron = (x: number, c: string) => {
      for (let i = 0; i < 5; i++) {
        g.set(x + i, 3 + i, c);
        g.set(x + i + 1, 3 + i, c);
        g.set(x + i, 13 - i, c);
        g.set(x + i + 1, 13 - i, c);
      }
    };
    chevron(4, '#5ab8f0');
    chevron(9, '#d8f4ff');
    g.line(0, 5, 2, 5, '#3a7ab0');
    g.line(0, 8, 3, 8, '#5ab8f0');
    g.line(0, 11, 2, 11, '#3a7ab0');
  },
  HEAVY_SHOT: (g) => {
    g.ellipse(7.5, 3.5, 2.5, 2.2, '#5a5a64', false);
    g.ellipse(7.5, 3.5, 2.5, 2.2, '#9a9aa8', false);
    g.set(6, 2, '#c8c8d0');
    g.fillPolygon(
      [
        [3.5, 6],
        [11.5, 6],
        [14.5, 15],
        [0.5, 15],
      ],
      '#6a6a76',
    );
    for (let y = 6; y <= 15; y++) {
      const t = (y - 6) / 9;
      const xl = Math.round(3.5 - t * 3);
      const xr = Math.round(11.5 + t * 3);
      g.set(xl, y, '#a8a8b8');
      g.set(xr, y, '#3a3a44');
    }
    g.fillRect(1, 15, 14, 1, '#3a3a44');
    g.fillRect(4, 6, 8, 1, '#b8b8c8');
    // engraved "down" arrow
    arrow(g, 7, 8, 7, 13, '#3a3a44', 2);
  },
  MANA_REDUCE: (g) => {
    teardrop(g, 6.5, 10, 4.5, 2, '#3a6af0');
    g.fillRect(11, 1, 2, 6, '#8ad8ff');
    g.fillRect(9, 3, 6, 2, '#8ad8ff');
    g.set(11, 1, W);
  },
  RECHARGE: (g) => {
    g.circle(7.5, 8.5, 4.6, '#e8e0cc');
    g.circle(7.5, 8.5, 4.6, '#8a7458', false);
    g.line(7, 5, 7, 8, '#2a1c18');
    g.line(8, 8, 10, 8, '#2a1c18');
    ringFn(g, 7.5, 8.5, 7.3, 1.3, (ang) => {
      const deg = (ang * 180) / Math.PI;
      return deg > 20 && deg < 300 ? (deg > 150 ? '#5ad8a8' : '#9af0c8') : null;
    });
    arrowHead(g, 14, 8, -80, 2, '#9af0c8');
  },
  HOMING: (g) => {
    g.circle(11.5, 4.5, 3.6, '#d82a22');
    g.circle(11.5, 4.5, 2.6, '#f4f0e8');
    g.circle(11.5, 4.5, 1.4, '#d82a22');
    g.set(11, 4, '#ffb0a0');
    const pts = bezier([1, 15], [1, 4], [7, 5], 40);
    dottedPath(g, pts, '#f0e060', 1);
    arrowHead(g, 8, 5, 0, 2, '#fff8b0');
  },
  PIERCING_SHOT: (g) => {
    // brick wall
    g.fillRect(6, 1, 4, 14, '#7a5a48');
    for (let y = 1; y < 15; y++) {
      g.set(6, y, '#9a7a62');
      if (y % 3 === 0) g.fillRect(6, y, 4, 1, '#4a3428');
    }
    g.set(8, 2, '#4a3428');
    g.set(7, 5, '#4a3428');
    g.set(8, 11, '#4a3428');
    // spear through it
    g.fillRect(0, 7, 13, 2, '#e8f0ff');
    g.fillRect(0, 8, 13, 1, '#8ab0d8');
    arrowHead(g, 15, 7.5, 0, 3, '#e8f0ff');
    g.set(15, 8, '#c8d8f0');
    // debris
    g.set(11, 4, '#9a7a62');
    g.set(12, 11, '#9a7a62');
    g.set(13, 3, '#7a5a48');
  },
  EXPLOSIVE_PROJECTILE: (g) => {
    g.fillPolygon(starPoly(8, 8, 9, 7.8, 3.8, -80), FIRE.red);
    g.fillPolygon(starPoly(8, 8, 9, 5.6, 3, -60), FIRE.orange);
    g.fillPolygon(starPoly(8, 8, 6, 3.6, 2, -90), FIRE.yellow);
    g.circle(8, 8, 1, FIRE.white);
    g.set(1, 1, FIRE.orange);
    g.set(14, 14, FIRE.orange);
    g.set(15, 2, FIRE.yellow);
  },
  FIRE_TRAIL: (g) => trail(g, 'fire'),
  OIL_TRAIL: (g) => trail(g, 'oil'),
  WATER_TRAIL: (g) => trail(g, 'water'),
  ACID_TRAIL: (g) => trail(g, 'acid'),
  BOUNCE: (g) => {
    g.fillRect(0, 14, 16, 2, '#5a4a3c');
    g.fillRect(0, 14, 16, 1, '#8a7a62');
    thickLine(g, 1, 2, 7, 12, '#f0f0d0');
    thickLine(g, 8, 12, 13, 4, '#f0f0d0');
    arrowHead(g, 14, 2, 60, 2.5, W);
    sparkle(g, 7, 13, '#ffe070', 1);
    g.set(4, 12, '#ffe070');
    g.set(11, 12, '#ffe070');
  },
  LIFETIME: (g) => {
    hourglass(g);
    g.fillRect(13, 0, 1, 5, '#5ae05a');
    g.fillRect(11, 2, 5, 1, '#5ae05a');
  },
  LIFETIME_DOWN: (g) => {
    hourglass(g);
    g.fillRect(11, 2, 5, 2, '#f04a3a');
  },
  SPREAD_REDUCE: (g) => {
    g.line(0, 1, 13, 7, '#5a9ad8');
    g.line(0, 14, 13, 8, '#5a9ad8');
    arrowHead(g, 5, 4, -25, 2, '#d8f0ff');
    arrowHead(g, 5, 11, 25, 2, '#d8f0ff');
    g.line(0, 7, 12, 7, '#e8f8ff');
    g.line(0, 8, 12, 8, '#a8c8e8');
    g.fillRect(13, 6, 3, 4, W);
  },
  CRITICAL_HIT: (g) => {
    g.circle(7.5, 7.5, 6, '#e8e0d8', false);
    g.fillRect(7, 0, 2, 4, '#e8e0d8');
    g.fillRect(7, 12, 2, 4, '#e8e0d8');
    g.fillRect(0, 7, 4, 2, '#e8e0d8');
    g.fillRect(12, 7, 4, 2, '#e8e0d8');
    g.fillPolygon(starPoly(7.5, 7.5, 4, 3.8, 1.3, -90), '#ff3a2a');
    g.fillRect(7, 7, 2, 2, '#ffd0a0');
  },
  ELECTRIC_CHARGE: (g) => {
    const zig = (pts: Array<[number, number]>) => polyline(g, pts, '#7ae4ff');
    zig([
      [7, 5],
      [6, 3],
      [8, 1],
      [7, 0],
    ]);
    zig([
      [10, 7],
      [12, 6],
      [13, 8],
      [15, 7],
    ]);
    zig([
      [8, 10],
      [9, 12],
      [7, 13],
      [8, 15],
    ]);
    zig([
      [5, 8],
      [3, 9],
      [2, 7],
      [0, 8],
    ]);
    ball(g, 7.5, 7.5, 2.6, '#58c8ff', W);
    g.set(13, 2, '#d8f8ff');
    g.set(2, 13, '#d8f8ff');
    g.set(14, 13, '#7ae4ff');
  },
  FREEZE: (g) => {
    const c1 = '#c8f4ff';
    const c2 = '#5ab8f0';
    g.line(7, 1, 7, 13, c1);
    g.line(1, 7, 13, 7, c1);
    g.line(2, 2, 12, 12, c2);
    g.line(2, 12, 12, 2, c2);
    for (const [dx, dy] of [
      [0, -1],
      [0, 1],
      [-1, 0],
      [1, 0],
    ]) {
      const tx = 7 + dx * 4;
      const ty = 7 + dy * 4;
      g.set(tx + dy, ty + dx, c1);
      g.set(tx - dy, ty - dx, c1);
      g.set(tx + dy + dx, ty + dx + dy, c1);
      g.set(tx - dy + dx, ty - dx + dy, c1);
    }
    g.fillRect(6, 6, 3, 3, c2);
    g.set(7, 7, W);
    g.set(14, 14, c1);
  },
  LIGHT: (g) => {
    for (let i = 0; i < 8; i++) {
      const t = (i * Math.PI) / 4;
      const r = i % 2 === 0 ? 7.4 : 6;
      g.line(7.5 + Math.cos(t) * 4.5, 7.5 + Math.sin(t) * 4.5, 7.5 + Math.cos(t) * r, 7.5 + Math.sin(t) * r, '#f8e070');
    }
    g.circle(7.5, 7.5, 3.6, '#f8d040');
    g.circle(7.5, 7.5, 2.6, '#fff4a0');
    g.circle(7, 7, 1.2, W);
  },
  GRAVITY: (g) => {
    const pts = bezier([1, 3], [11, 1], [12, 11], 40);
    dottedPath(g, pts, '#e0a050', 2, '#8a5a2a');
    arrowHead(g, 12, 13, -90, 2.5, '#ffe0a0');
    ball(g, 2, 3, 1.6, '#ffe0a0', null);
    g.fillRect(5, 15, 11, 1, '#7a6a58');
  },
  GRAVITY_ANTI: (g) => {
    const pts = bezier([1, 12], [11, 14], [12, 4], 40);
    dottedPath(g, pts, '#60c8f0', 2, '#2a5a8a');
    arrowHead(g, 12, 2, 90, 2.5, '#d0f4ff');
    ball(g, 2, 12, 1.6, '#d0f4ff', null);
    g.fillRect(5, 0, 11, 1, '#5a6a88');
  },
  BURST_2: (g) => burst(g, 2),
  BURST_3: (g) => burst(g, 3),
  BURST_4: (g) => burst(g, 4),
  SCATTER_2: (g) => scatter(g, 2),
  SCATTER_3: (g) => scatter(g, 3),
  SCATTER_4: (g) => scatter(g, 4),
  I_SHAPE: (g) => formation(g, [7, 7], [90, 270], false, 7),
  T_SHAPE: (g) => formation(g, [7, 6], [0, 180, 90], true, 6),
  Y_SHAPE: (g) => formation(g, [7, 8], [45, 135], true, 7),
  W_SHAPE: (g) => formation(g, [7, 11], [30, 90, 150], false, 8),
  PENTAGON_SHAPE: (g) => formation(g, [7, 8], [90, 162, 234, 306, 18], false, 6, true),
  HEXAGON_SHAPE: (g) => formation(g, [7, 7], [90, 150, 210, 270, 330, 30], false, 6, true),
};

/** Spell ids with a hand-designed glyph (anything else gets a seeded generic rune). */
export const SPELL_GLYPH_IDS: readonly string[] = Object.keys(GLYPHS);

export function hasSpellGlyph(id: string): boolean {
  return Object.prototype.hasOwnProperty.call(GLYPHS, id);
}

/**
 * The outlined glyph alone: an 18x18 transparent image (16x16 art + 1px outline margin).
 * Exposed for tests and for UI that wants the glyph without a frame (e.g. drag previews).
 */
export function spellGlyph(id: string, type: SpellIconType): PixelImage {
  const g = new PixelImage(SPELL_GLYPH_SIZE, SPELL_GLYPH_SIZE);
  const fn = GLYPHS[id];
  if (fn) fn(g);
  else genericRune(g, id, type);
  const out = new PixelImage(SPELL_GLYPH_SIZE + 2, SPELL_GLYPH_SIZE + 2);
  out.blit(g, 1, 1);
  out.outline(OUTLINE);
  return out;
}

/** Empty framed card for a spell type (also used for empty slots of a known type). */
export function spellFrame(type: SpellIconType): PixelImage {
  const S = SPELL_ICON_SIZE;
  const frame = SPELL_TYPE_COLORS[type] ?? SPELL_TYPE_COLORS.other;
  const img = new PixelImage(S, S);
  const bgTop = mixHex('#1c1614', frame, 0.22);
  const bgBot = mixHex('#0e0b0a', frame, 0.1);
  for (let y = 1; y < S - 1; y++) img.fillRect(1, y, S - 2, 1, mixHex(bgTop, bgBot, (y - 1) / (S - 3)));
  // inset shadow under the frame
  img.fillRect(1, 1, S - 2, 1, darken(bgTop, 0.35));
  img.fillRect(1, 1, 1, S - 2, darken(bgTop, 0.25));
  // frame: lit top/left, shaded bottom/right, darker corners for a slightly rounded look
  const lit = lighten(frame, 0.22);
  const shade = darken(frame, 0.3);
  img.fillRect(1, 0, S - 2, 1, lit);
  img.fillRect(0, 1, 1, S - 2, lit);
  img.fillRect(1, S - 1, S - 2, 1, shade);
  img.fillRect(S - 1, 1, 1, S - 2, shade);
  const corner = darken(frame, 0.55);
  img.set(0, 0, corner);
  img.set(S - 1, 0, corner);
  img.set(0, S - 1, corner);
  img.set(S - 1, S - 1, corner);
  return img;
}

/** 20x20 Noita-style spell icon: type-coloured 1px frame, dark card, outlined 16x16 glyph. */
export function spellIcon(id: string, type: SpellIconType): PixelImage {
  const img = spellFrame(type);
  img.blit(spellGlyph(id, type), 1, 1);
  return img;
}
