// Procedural 16x16 item / pickup / perk icons (transparent background, dark 1px outline).
import { PixelImage, lighten, darken, mixHex, hashString, PixelRng, hslHex, brightness } from './pixels';
import {
  OUTLINE,
  ball,
  sparkle,
  spr,
  diag,
  cyl,
  arrow,
  arrowHead,
  bezier,
  teardrop,
  starPoly,
  ringFn,
  noise2,
  shadedShape,
  inHeart,
  thickLine,
} from './glyphKit';

export const ITEM_ICON_SIZE = 16;
const W = '#ffffff';
const GOLD = { base: '#e8b830', light: '#fff0a0', dark: '#9a6a10' };

/** Runs `draw` on a 16x16 canvas, then adds the dark outline (art should keep a 1px margin). */
function icon(draw: (g: PixelImage) => void, outline = true): PixelImage {
  const g = new PixelImage(ITEM_ICON_SIZE, ITEM_ICON_SIZE);
  draw(g);
  if (outline) g.outline(OUTLINE);
  return g;
}

// ---------------------------------------------------------------------------------------------
// Potion

/** Pixels of the flask interior (where liquid can be), bottom row first. */
function flaskInterior(x: number, y: number): boolean {
  if (y >= 4 && y <= 5 && x >= 7 && x <= 8) return true; // neck
  const dx = x - 7.5;
  const dy = y - 9.5;
  return dx * dx + dy * dy < 4.35 * 4.35;
}
function flaskGlass(x: number, y: number): boolean {
  if (y >= 3 && y <= 5 && x >= 6 && x <= 9) return true; // neck
  const dx = x - 7.5;
  const dy = y - 9.5;
  return dx * dx + dy * dy < 5.35 * 5.35;
}

/**
 * 16x16 glass flask with cork. `liquidHex` null draws an empty flask; `fill` 0..1 sets the liquid level.
 */
export function potionIcon(liquidHex: string | null, fill: number): PixelImage {
  const f = Math.max(0, Math.min(1, Number.isFinite(fill) ? fill : 0));
  return icon((g) => {
    // glass body (dark translucent-looking interior + light rim)
    for (let y = 0; y < 16; y++)
      for (let x = 0; x < 16; x++) {
        if (!flaskGlass(x, y)) continue;
        g.set(x, y, flaskInterior(x, y) ? '#26303c' : '#a8c4d4');
      }
    // liquid level: fill the requested share of interior pixels from the bottom
    if (liquidHex && f > 0) {
      const cells: Array<[number, number]> = [];
      for (let y = 15; y >= 0; y--) for (let x = 0; x < 16; x++) if (flaskInterior(x, y)) cells.push([x, y]);
      const want = Math.max(1, Math.round(cells.length * f));
      const levelY = cells[Math.min(cells.length - 1, want - 1)][1];
      const surface = lighten(liquidHex, 0.4);
      const deep = darken(liquidHex, 0.2);
      for (const [x, y] of cells) {
        if (y < levelY) continue;
        let c = liquidHex;
        if (y === levelY) c = surface;
        else if (!flaskInterior(x + 1, y) || !flaskInterior(x, y + 1)) c = deep;
        g.set(x, y, c);
      }
      // a couple of bubbles
      if (levelY <= 11) {
        g.set(6, 12, lighten(liquidHex, 0.5));
        g.set(8, Math.max(levelY + 1, 10), lighten(liquidHex, 0.4));
      }
    }
    // glass highlight streak on the left
    g.set(4, 8, '#e8f6ff');
    g.set(4, 9, '#e8f6ff');
    g.set(5, 7, '#c8e4f4');
    // lip + cork
    g.fillRect(5, 3, 6, 1, '#c8dce8');
    g.fillRect(6, 1, 4, 2, '#a8743c');
    g.fillRect(6, 1, 4, 1, '#d09a5a');
    g.set(9, 1, '#a8743c');
    g.set(9, 2, '#7a4e24');
  });
}

// ---------------------------------------------------------------------------------------------
// Pickups

export function goldIcon(): PixelImage {
  return icon((g) => {
    const nugget = (cx: number, cy: number, rx: number, ry: number, seed: number) => {
      const inside = (x: number, y: number) => {
        const dx = (x - cx) / (rx + 0.4);
        const dy = (y - cy) / (ry + 0.4);
        const d = dx * dx + dy * dy;
        return d < 0.75 || (d < 1 && noise2(x, y, seed) > 0.35);
      };
      shadedShape(g, inside, GOLD.base, GOLD.light, GOLD.dark);
      g.set(Math.round(cx - rx * 0.4), Math.round(cy - ry * 0.4), W);
    };
    nugget(4, 11.5, 2.6, 2.2, 3);
    nugget(11, 11, 3, 2.6, 5);
    nugget(7.5, 7, 3.6, 3.2, 1);
    sparkle(g, 13, 3, GOLD.light, 1, W);
    g.set(2, 5, GOLD.light);
  });
}

export function heartIcon(kind: 'max' | 'full'): PixelImage {
  return icon((g) => {
    const red = kind === 'max' ? '#d8202e' : '#f04a6a';
    const inside = (x: number, y: number) => inHeart(x, y, 7.5, 8.2, 6.1);
    shadedShape(g, inside, red, lighten(red, 0.3), darken(red, 0.4), 0, 0, 15, 15);
    g.fillRect(3, 4, 2, 2, lighten(red, 0.55));
    g.set(3, 4, W);
    if (kind === 'max') {
      // "+ max HP": gold plus badge
      g.fillRect(9, 7, 2, 6, GOLD.base);
      g.fillRect(7, 9, 6, 2, GOLD.base);
      g.set(9, 7, GOLD.light);
      g.set(7, 9, GOLD.light);
    } else {
      // full heal: inner glow + sparkles
      for (let y = 0; y < 16; y++)
        for (let x = 0; x < 16; x++) if (inHeart(x, y, 7.5, 8.2, 3.2)) g.set(x, y, '#ffb8c8');
      g.set(7, 7, W);
      g.set(8, 7, W);
      sparkle(g, 14, 2, '#ffd0dc', 1, W);
      sparkle(g, 1, 13, '#ffd0dc', 1, W);
    }
  });
}

export function chestIcon(): PixelImage {
  return icon((g) => {
    const wood = '#8a5a2a';
    // lid (rounded) and body
    for (let y = 2; y <= 6; y++) {
      const inset = y === 2 ? 2 : y === 3 ? 1 : 0;
      g.fillRect(1 + inset, y, 14 - inset * 2, 1, y <= 3 ? lighten(wood, 0.2) : wood);
    }
    g.fillRect(1, 7, 14, 1, '#4a2e14'); // seam
    g.fillRect(1, 8, 14, 6, wood);
    g.fillRect(1, 11, 14, 1, darken(wood, 0.3)); // plank line
    g.fillRect(1, 13, 14, 1, darken(wood, 0.35));
    // gold bands
    for (const bx of [3, 12]) {
      g.fillRect(bx, 2, 1, 12, GOLD.base);
      g.set(bx, 2, GOLD.light);
      g.set(bx, 13, GOLD.dark);
    }
    // lock
    g.fillRect(6, 6, 4, 4, GOLD.base);
    g.fillRect(6, 6, 4, 1, GOLD.light);
    g.set(7, 7, '#2a1a0a');
    g.set(8, 7, '#2a1a0a');
    g.set(7, 8, '#2a1a0a');
    g.set(4, 4, '#c89a5a');
  });
}

/** Spell refresher: circular arrows around a little spell card. */
export function refresherIcon(): PixelImage {
  return icon((g) => {
    ringFn(g, 7.5, 7.5, 7, 1.6, (ang) => {
      const deg = (ang * 180) / Math.PI;
      if ((deg > 60 && deg < 110) || (deg > 240 && deg < 290)) return null;
      return deg < 180 ? '#5ae0ff' : '#3aa8e8';
    });
    arrowHead(g, 4, 1, 200, 2, '#c8f4ff');
    arrowHead(g, 11, 14, 20, 2, '#c8f4ff');
    // spell card
    g.fillRect(5, 4, 6, 8, '#2f5aa0');
    g.fillRect(6, 5, 4, 6, '#1a2440');
    sparkle(g, 8, 8, '#8ad8ff', 1, W);
  });
}

/** Orb of True Knowledge: glowing violet sphere with a swirl and sparkles. */
export function orbIcon(): PixelImage {
  return icon((g) => {
    ball(g, 7.5, 7.5, 6, '#7a3ad8');
    ringFn(g, 7.5, 7.5, 4.6, 4, (ang, depth) => {
      const v = Math.sin(ang * 2 + depth * 1.4);
      return v > 0.75 ? '#c8a0ff' : null;
    });
    g.circle(7.5, 7.5, 1.4, '#f0e0ff');
    g.set(4, 3, W);
    g.set(5, 3, '#e0d0ff');
    g.set(4, 4, '#e0d0ff');
    g.set(15, 1, '#fff0a0');
    g.set(0, 14, '#fff0a0');
  });
}

// ---------------------------------------------------------------------------------------------
// Perk emblems

function shield(g: PixelImage, base = '#3e4c6a'): (x: number, y: number) => boolean {
  const inside = (x: number, y: number) => {
    if (y < 1 || y > 15 || x < 2 || x > 13) return false;
    if (y === 1 && (x === 2 || x === 13)) return false;
    if (y <= 8) return true;
    const half = 5.6 * (1 - (y - 8) / 7.6);
    return Math.abs(x - 7.5) <= half + 0.1;
  };
  shadedShape(g, inside, base, lighten(base, 0.45), darken(base, 0.4));
  return inside;
}

function flame(g: PixelImage, cx: number, base: number, h: number): void {
  // teardrop flame pointing up (slightly curled tip): red outside, orange, yellow core
  const width = h * 0.42;
  const layer = (shrink: number, c: string) => {
    for (let y = base - h; y <= base; y++) {
      const t = (y - (base - h)) / h; // 0 at tip, 1 at bottom
      let half = t < 0.7 ? width * Math.pow(t / 0.7, 0.9) : width * Math.sqrt(Math.max(0, 1 - ((t - 0.7) / 0.32) ** 2));
      half -= shrink;
      if (half < 0) continue;
      const lean = (1 - t) * 1.6; // the tip leans right
      for (let x = Math.ceil(cx + lean - half - 0.3); x <= Math.floor(cx + lean + half + 0.3); x++) g.set(x, y, c);
    }
  };
  layer(0, '#d8341a');
  layer(1.2, '#ff8a20');
  layer(2.4, '#ffd84a');
}

function bolt(g: PixelImage, ox: number, oy: number, s = 1): void {
  const pts: Array<[number, number]> = [
    [5, 0],
    [1, 6],
    [4, 6],
    [2, 11],
    [7, 4],
    [4.5, 4],
    [7, 0],
  ];
  g.fillPolygon(
    pts.map(([x, y]) => [ox + x * s, oy + y * s] as [number, number]),
    '#ffe040',
  );
  g.line(ox + 5 * s, oy + 1, ox + 2 * s, oy + 5 * s, '#ffffc0');
}

function infinity(g: PixelImage, ox: number, oy: number, c: string, hi: string): void {
  spr(g, ['.xx...xx.', 'x..x.x..x', 'x...x...x', 'x..x.x..x', '.xx...xx.'], { x: c }, ox, oy);
  g.set(ox + 1, oy, hi);
  g.set(ox, oy + 1, hi);
}

function nugget(g: PixelImage, cx: number, cy: number, r: number): void {
  shadedShape(
    g,
    (x, y) => {
      const d = Math.hypot(x - cx, (y - cy) * 1.15);
      return d < r + 0.3 && (d < r - 0.7 || noise2(x, y, 9) > 0.3);
    },
    GOLD.base,
    GOLD.light,
    GOLD.dark,
  );
  g.set(Math.round(cx - r * 0.4), Math.round(cy - r * 0.4), W);
}

function skull(g: PixelImage, ox: number, oy: number): void {
  spr(
    g,
    [
      '..bbbbbb..',
      '.bwwwwwwb.',
      'bwwwwwwwwb',
      'bwkkwwkkwb',
      'bwkkwwkkwb',
      'bwwwwwwwwb',
      '.bwwwkwwb.',
      '..bwwwwb..',
      '..wkwkww..',
    ],
    { b: '#b8b0a0', w: '#ece4d4', k: '#1a1210' },
    ox,
    oy,
  );
}

type PerkFn = (g: PixelImage) => void;

const PERKS: Record<string, PerkFn> = {
  CRITICAL_HIT: (g) => {
    g.circle(7.5, 7.5, 5.6, '#e8e0d8', false);
    g.fillRect(7, 0, 2, 4, '#e8e0d8');
    g.fillRect(7, 12, 2, 4, '#e8e0d8');
    g.fillRect(0, 7, 4, 2, '#e8e0d8');
    g.fillRect(12, 7, 4, 2, '#e8e0d8');
    g.fillPolygon(starPoly(7.5, 7.5, 5, 4, 1.7, -90), '#ff4a2a');
    g.set(7, 7, '#ffd0a0');
  },
  EXTRA_HP: (g) => {
    shadedShape(g, (x, y) => inHeart(x, y, 7.5, 8.2, 6.1), '#d8202e', '#ff7a80', '#7a0a14');
    g.fillRect(7, 5, 2, 6, W);
    g.fillRect(5, 7, 6, 2, W);
  },
  EXTRA_LIFE: (g) => {
    const rows = [
      '....xxxx....',
      '...xx..xx...',
      '...x....x...',
      '...x....x...',
      '...xx..xx...',
      '....xxxx....',
      '.xxxxxxxxxx.',
      '.xxxxxxxxxx.',
      '.....xx.....',
      '.....xx.....',
      '.....xx.....',
      '.....xx.....',
      '.....xx.....',
      '....xxxx....',
    ];
    spr(g, rows, { x: GOLD.base }, 2, 1);
    // shade: right side darker, top-left highlights
    for (let y = 0; y < 16; y++)
      for (let x = 0; x < 16; x++) {
        if (!g.isOpaque(x, y)) continue;
        if (!g.isOpaque(x + 1, y) || !g.isOpaque(x, y + 1)) g.set(x, y, GOLD.dark);
        else if (!g.isOpaque(x - 1, y) || !g.isOpaque(x, y - 1)) g.set(x, y, GOLD.light);
      }
  },
  SAVING_GRACE: (g) => {
    g.ellipse(7.5, 2, 4, 1.2, '#ffe070', false);
    shadedShape(g, (x, y) => y >= 5 && inHeart(x, y, 7.5, 10, 4.6), '#e0304a', '#ff8a9a', '#7a0a1a');
    // little wings
    spr(g, ['ww..', 'wwww', '.www', '..ww'], { w: '#f0f4ff' }, 0, 6);
    spr(g, ['..ww', 'wwww', 'www.', 'ww..'], { w: '#f0f4ff' }, 12, 6);
    g.set(5, 8, W);
  },
  STAINLESS_ARMOUR: (g) => {
    const steel = '#9aa4b4';
    const inside = (x: number, y: number) => {
      if (y < 2 || y > 15) return false;
      if (y <= 4) return (x >= 1 && x <= 5) || (x >= 10 && x <= 14); // pauldrons
      if (y === 5) return x >= 1 && x <= 14 && !(x >= 6 && x <= 9);
      const half = y < 11 ? 5.5 : 5.5 - (y - 10) * 0.6;
      return Math.abs(x - 7.5) <= half;
    };
    shadedShape(g, inside, steel, '#e8eef8', '#4a5262');
    g.line(7, 6, 7, 14, '#6a7484');
    g.line(8, 6, 8, 14, '#c8d0dc');
    g.set(4, 7, W);
    g.set(3, 3, W);
    g.fillRect(5, 11, 6, 1, '#6a7484');
  },
  PROTECTION_FIRE: (g) => {
    shield(g);
    flame(g, 7.5, 13, 9);
  },
  PROTECTION_EXPLOSION: (g) => {
    shield(g);
    g.fillPolygon(starPoly(7.5, 8, 8, 5, 2.4, -90), '#ff7a20');
    g.fillPolygon(starPoly(7.5, 8, 8, 3, 1.5, -68), '#ffd84a');
    g.set(7, 8, W);
  },
  PROTECTION_RADIOACTIVITY: (g) => {
    shield(g, '#3a4a3a');
    ringFn(g, 7.5, 7.5, 5, 3, (ang) => {
      const deg = ((ang * 180) / Math.PI + 360) % 360;
      const k = (deg - 90 + 360) % 120;
      return k < 30 || k > 90 ? '#c8f030' : null;
    });
    g.circle(7.5, 7.5, 1, '#c8f030');
  },
  PROTECTION_ELECTRICITY: (g) => {
    shield(g);
    bolt(g, 4, 2, 1);
  },
  PROTECTION_MELEE: (g) => {
    shield(g, '#5a2e2e');
    g.fillRect(7, 3, 2, 7, '#eef2fa');
    g.fillRect(8, 3, 1, 7, '#98a2b4');
    g.set(7, 2, '#eef2fa');
    g.set(8, 2, '#98a2b4');
    g.fillRect(4, 10, 8, 1, GOLD.base);
    g.set(4, 10, GOLD.light);
    g.fillRect(7, 11, 2, 2, '#7a4e24');
    g.fillRect(7, 13, 2, 1, GOLD.base);
  },
  FASTER_LEVITATION: (g) => {
    // feathered wing + upward chevrons
    spr(
      g,
      [
        '......www',
        '....wwwww',
        '..wwwwwww',
        '.wwwwwww.',
        'wgwgwgw..',
        'gwgwgw...',
        '.g.g.....',
      ],
      { w: '#eef4ff', g: '#9aaccc' },
      0,
      7,
    );
    for (const oy of [2, 6]) {
      g.line(10, oy + 3, 12, oy + 1, '#5ae0ff');
      g.line(13, oy + 1, 15, oy + 3, '#5ae0ff');
      g.set(12, oy, '#c8f4ff');
      g.set(13, oy, '#c8f4ff');
    }
  },
  STRONG_LEVITATION: (g) => {
    g.fillRect(6, 5, 4, 7, '#5ab8f0');
    g.fillRect(6, 5, 1, 7, '#a8e8ff');
    arrowHead(g, 7.5, 0, 90, 5, '#c8f4ff');
    // air puff
    g.circle(4, 13, 2, '#d8dce8');
    g.circle(8, 13.5, 2.3, '#e8ecf4');
    g.circle(12, 13, 2, '#c8ccd8');
  },
  MOVEMENT_FASTER: (g) => {
    spr(
      g,
      ['.bbbb.....', '.bccb.....', '.bccb.....', '.bccb.....', '.bccbbbb..', '.bcccccbb.', 'bccccccccb', 'ssssssssss'],
      { b: '#6a3e20', c: '#9a6a3a', s: '#3a2414' },
      5,
      5,
    );
    g.set(7, 6, '#c89a5a');
    g.line(0, 7, 3, 7, '#d8e8ff');
    g.line(1, 10, 4, 10, '#a8c8f0');
    g.line(0, 13, 3, 13, '#d8e8ff');
  },
  BREATH_UNDERWATER: (g) => {
    for (let x = 0; x < 16; x++) {
      const y = 11 + Math.round(Math.sin(x * 0.8));
      for (let yy = y; yy < 16; yy++) g.set(x, yy, yy === y ? '#8ad0ff' : yy < 14 ? '#3a7ae8' : '#1e3e9a');
    }
    for (const [cx, cy, r] of [
      [5, 8, 1.5],
      [9, 4.5, 2],
      [6, 1.5, 1],
      [12, 9, 1],
    ] as const) {
      g.circle(cx, cy, r, '#1e4a74');
      g.circle(cx, cy, r, '#bfeaff', false);
      g.set(Math.round(cx - r * 0.5), Math.round(cy - r * 0.5), W);
    }
  },
  REPELLING_CAPE: (g) => {
    const cape = '#8a2a4a';
    const inside = (x: number, y: number) => {
      if (y < 2 || y > 14) return false;
      const half = 2 + (y - 2) * 0.42;
      const hem = y === 14 && (x % 3 === 0);
      return Math.abs(x - 7.5) <= half && !hem;
    };
    shadedShape(g, inside, cape, '#c84a6a', '#4a0a20');
    g.line(6, 4, 4, 13, '#5a1a30');
    g.line(9, 4, 11, 13, '#5a1a30');
    g.fillRect(6, 2, 4, 1, GOLD.base);
    g.set(7, 2, GOLD.light);
    arrow(g, 2, 3, 0, 1, '#c8f4ff', 1.5);
    arrow(g, 13, 3, 15, 1, '#c8f4ff', 1.5);
  },
  GOLD_IS_FOREVER: (g) => {
    nugget(g, 7.5, 11, 4);
    infinity(g, 3, 0, '#5ae0ff', '#c8f4ff');
  },
  ATTRACT_GOLD: (g) => {
    spr(
      g,
      ['..rrrrrss', '.rrrrrrss', 'rrr......', 'rr.......', 'rr.......', 'rrr......', '.RRRRRRss', '..RRRRRss'],
      { r: '#e03a2a', R: '#9a1a10', s: '#d8dce8' },
      0,
      4,
    );
    nugget(g, 13, 8, 2.2);
    g.set(10, 7, '#fff0a0');
    g.set(10, 9, '#fff0a0');
  },
  VAMPIRISM: (g) => {
    g.ellipse(7.5, 6, 6.5, 4, '#a01828');
    g.ellipse(7.5, 6.5, 5, 2.6, '#2a0a10');
    g.fillRect(3, 4, 10, 1, '#f0ece0');
    for (const fx of [4, 10]) {
      g.fillRect(fx, 4, 2, 3, '#f0ece0');
      g.set(fx, 7, '#f0ece0');
    }
    g.set(4, 4, W);
    teardrop(g, 5, 12, 1.6, 9, '#d01a1a', false);
    g.set(11, 13, '#d01a1a');
  },
  GLASS_CANNON: (g) => {
    diag(g, 2, 11, 30, (a, b) => {
      const ab = Math.abs(b);
      if (a >= 0 && a <= 12 && ab <= 2.4 - a * 0.06) return cyl(b, 2.2, '#8ad8f0', 0.5, 0.3);
      return null;
    });
    g.line(6, 7, 8, 9, '#3a8aa8');
    g.line(8, 9, 7, 10, '#3a8aa8');
    g.circle(5, 12.5, 2.5, '#7a4e24');
    g.circle(5, 12.5, 1, '#c89a5a');
    g.set(13, 2, W);
    g.set(14, 4, '#c8f4ff');
  },
  HOMING_SHOT: (g) => {
    g.circle(11.5, 11.5, 3.6, '#d82a22');
    g.circle(11.5, 11.5, 2.4, '#f4f0e8');
    g.circle(11.5, 11.5, 1.2, '#d82a22');
    const pts = bezier([1, 1], [14, 0], [9, 8], 40);
    pts.forEach(([x, y], i) => i % 2 === 0 && g.set(x, y, '#ffe070'));
    arrowHead(g, 9, 8, -110, 2, '#fff8c0');
    ball(g, 1.5, 1.5, 1.2, '#c8f4ff', null);
  },
  UNLIMITED_SPELLS: (g) => {
    g.fillRect(4, 5, 8, 10, '#2f5aa0');
    g.fillRect(5, 6, 6, 8, '#1a2440');
    sparkle(g, 8, 10, '#8ad8ff', 2, W);
    infinity(g, 3, 0, GOLD.base, GOLD.light);
  },
  NO_MORE_SHUFFLE: (g) => {
    // crossing "shuffle" arrows, crossed out
    g.line(3, 5, 10, 10, '#e8e8e8');
    g.line(3, 10, 10, 5, '#e8e8e8');
    arrowHead(g, 12, 4, 30, 2, '#e8e8e8');
    arrowHead(g, 12, 11, -30, 2, '#e8e8e8');
    ringFn(g, 7.5, 7.5, 6.9, 1.8, () => '#e02a2a');
    thickLine(g, 3, 3, 12, 12, '#e02a2a');
  },
  EDIT_WANDS_EVERYWHERE: (g) => {
    // wand
    diag(g, 1, 14, 45, (a, b) => (a >= 0 && a <= 12 && Math.abs(b) <= 0.7 ? cyl(b, 0.7, '#9a6a3a') : null));
    g.fillPolygon(
      [
        [10, 3],
        [12, 1],
        [14, 3],
        [12, 5],
      ],
      '#5ae0ff',
    );
    g.set(12, 2, W);
    // hammer crossing it
    diag(g, 14, 14, 135, (a, b) => (a >= 0 && a <= 10 && Math.abs(b) <= 0.7 ? cyl(b, 0.7, '#c89a5a') : null));
    g.fillPolygon(
      [
        [1, 4],
        [4, 1],
        [7, 4],
        [4, 7],
      ],
      '#8a929e',
    );
    g.line(1, 4, 4, 1, '#c8ccd6');
  },
  EXTRA_PERK: (g) => {
    g.fillPolygon(starPoly(7, 8, 5, 7, 3, -90), GOLD.base);
    g.fillPolygon(starPoly(7, 8, 5, 4, 1.8, -90), GOLD.light);
    g.fillRect(13, 0, 2, 6, '#5ae05a');
    g.fillRect(11, 2, 6, 2, '#5ae05a');
  },
  EXTRA_SHOP_ITEM: (g) => {
    // money sack
    shadedShape(
      g,
      (x, y) => (y >= 6 && y <= 15 && Math.hypot(x - 7, (y - 11) * 1.1) <= 5.2) || (y >= 3 && y <= 6 && Math.abs(x - 7) <= 1.5),
      '#a8743c',
      '#d8a868',
      '#6a4420',
    );
    g.fillRect(4, 2, 7, 1, '#a8743c');
    g.fillRect(5, 5, 5, 1, '#5a3418');
    g.fillRect(6, 9, 2, 4, GOLD.base);
    g.set(6, 9, GOLD.light);
    g.fillRect(13, 0, 2, 6, '#5ae05a');
    g.fillRect(11, 2, 6, 2, '#5ae05a');
  },
  PEACE_WITH_GODS: (g) => {
    g.ellipse(9, 1.5, 4, 1, '#ffe070', false);
    g.fillRect(2, 2, 1, 14, '#9a6a3a');
    g.set(2, 2, '#d8a868');
    for (let x = 3; x <= 13; x++) {
      const wave = Math.round(Math.sin(x * 0.7) * 0.8);
      for (let y = 4 + wave; y <= 10 + wave; y++) g.set(x, y, y === 4 + wave ? '#ffffff' : x > 10 ? '#c8ccd8' : '#eef0f8');
    }
  },
  EXPLODING_CORPSES: (g) => {
    g.fillPolygon(starPoly(7.5, 8, 9, 7.8, 4.2, -80), '#ff7a20');
    g.fillPolygon(starPoly(7.5, 8, 9, 6, 4, -60), '#ffd84a');
    skull(g, 3, 4);
  },
  FREEZE_FIELD: (g) => {
    ringFn(g, 7.5, 7.5, 7, 1, (ang) => (Math.floor((ang * 16) / Math.PI) % 2 === 0 ? '#5ac8f0' : '#a0e8ff'));
    const c = '#e0f8ff';
    g.line(7, 3, 7, 11, c);
    g.line(3, 7, 11, 7, c);
    g.line(4, 4, 10, 10, '#8ad8f8');
    g.line(4, 10, 10, 4, '#8ad8f8');
    g.set(7, 7, W);
  },
  OIL_BLOOD: (g) => {
    teardrop(g, 7.5, 9, 5.2, 0, '#3a3028');
    // oily rainbow sheen
    g.set(4, 7, '#c8c060');
    g.set(4, 8, '#8ad05a');
    g.set(4, 9, '#5ab8d8');
    g.set(5, 10, '#8a6ad8');
    // blood heart inside
    shadedShape(g, (x, y) => inHeart(x, y, 8.5, 10, 2.4), '#d01e1e', '#ff7a68', '#7a0a0a');
  },
  LEGGY_FEET: (g) => {
    const leg = '#5a3a4a';
    const tip = '#d88aa0';
    const legs: Array<Array<[number, number]>> = [
      [
        [6, 5],
        [2, 4],
        [0, 11],
      ],
      [
        [7, 6],
        [4, 9],
        [3, 15],
      ],
      [
        [8, 6],
        [11, 9],
        [12, 15],
      ],
      [
        [9, 5],
        [13, 4],
        [15, 11],
      ],
    ];
    for (const l of legs) {
      g.line(l[0][0], l[0][1], l[1][0], l[1][1], leg);
      g.line(l[1][0], l[1][1], l[2][0], l[2][1], leg);
      g.set(l[1][0], l[1][1], '#8a5a6a');
      g.set(l[2][0], l[2][1], tip);
    }
    ball(g, 7.5, 4, 3, '#c87a8a');
    g.set(6, 3, '#1a1210');
    g.set(9, 3, '#1a1210');
  },
};

/** Perk ids with a hand-designed emblem. */
export const PERK_ICON_IDS: readonly string[] = Object.keys(PERKS);

function genericPerk(g: PixelImage, id: string): void {
  const r = new PixelRng(hashString(id) ^ 0x9e7);
  const hue = r.range(0, 360);
  const base = hslHex(hue, 0.55, 0.55);
  g.circle(7.5, 7.5, 7, darken(base, 0.45));
  g.circle(7.5, 7.5, 7, lighten(base, 0.2), false);
  const sym = hslHex(hue + 180, 0.6, brightness(base) > 0.5 ? 0.3 : 0.75);
  for (let y = 0; y < 8; y++)
    for (let x = 0; x < 4; x++) {
      if (!r.chance(0.5)) continue;
      g.set(4 + x, 4 + y, sym);
      g.set(11 - x, 4 + y, sym);
    }
  g.set(4, 3, mixHex(base, '#ffffff', 0.7));
}

/** 16x16 perk emblem; unknown ids get a deterministic generic badge. */
export function perkIcon(id: string): PixelImage {
  const fn = PERKS[id];
  return icon((g) => (fn ? fn(g) : genericPerk(g, id)));
}
