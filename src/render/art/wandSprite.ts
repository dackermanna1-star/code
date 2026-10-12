// Procedural Noita-like wand sprites: horizontal, handle on the left, gem/tip on the right, dark outline.
// Visual hints follow Noita: capacity -> length, cast delay -> thickness, shuffle -> round/irregular gem
// (non-shuffle -> rhombic gem), actions per round >= 2 -> forked double prong.
import { PixelImage, PixelRng, mixSeed, lighten, darken, hslHex, rgbToHex } from './pixels';

export interface WandSpriteStats {
  capacity: number;
  actionsPerRound: number;
  /** Cast delay in frames (60 fps), like Noita. Seconds-sized values (< 1.5) are also accepted. */
  castDelay: number;
  shuffle: boolean;
  manaMax: number;
}

export type WandMaterial = 'wood' | 'bone' | 'metal' | 'crystal';

export interface WandSpriteInfo {
  img: PixelImage;
  material: WandMaterial;
  gemColor: string;
  /** Pixel where spells leave the wand (right-most gem/prong centre). */
  tip: { x: number; y: number };
  /** Centre of the grip (where the hand holds it). */
  grip: { x: number; y: number };
}

export const WAND_OUTLINE = '#170f0c';
export const WAND_MIN_W = 20;
export const WAND_MAX_W = 28;

const GEM_COLORS = ['#e83a3a', '#3ae86a', '#3a8ae8', '#b04ae8', '#f0d030', '#3ae0e0', '#ff8a20', '#ff60c0'];
const ACCENTS = ['#d8a840', '#c0c4cc', '#c87a40', '#e8d070'];

interface MatPal {
  base: string;
  light: string;
  dark: string;
  grip: string;
  gripDark: string;
}

function materialPalette(mat: WandMaterial, r: PixelRng): MatPal {
  switch (mat) {
    case 'wood': {
      const base = r.pick(['#7a4a24', '#8a5a2e', '#5e3a1e', '#9a6a3a', '#6e4a30']);
      return { base, light: lighten(base, 0.25), dark: darken(base, 0.35), grip: '#3a2418', gripDark: '#24160e' };
    }
    case 'bone': {
      const base = r.pick(['#d8ccb0', '#c8b898', '#e0d8c0', '#cfc2a0']);
      return { base, light: lighten(base, 0.45), dark: darken(base, 0.3), grip: '#6a3a2a', gripDark: '#44241a' };
    }
    case 'metal': {
      const base = r.pick(['#8a8e98', '#a87a3a', '#6a6e78', '#b89040', '#7a8a8a']);
      return { base, light: lighten(base, 0.45), dark: darken(base, 0.4), grip: '#2a2a34', gripDark: '#18181e' };
    }
    case 'crystal': {
      const base = hslHex(r.range(0, 360), 0.55, 0.6);
      return { base, light: lighten(base, 0.5), dark: darken(base, 0.35), grip: '#3a2a4a', gripDark: '#22182c' };
    }
  }
}

function clampInt(v: number, lo: number, hi: number): number {
  return Math.max(lo, Math.min(hi, Math.round(v)));
}

/** Full wand build: sprite plus anchor points and the chosen look. */
export function wandSpriteInfo(seed: number, stats: WandSpriteStats): WandSpriteInfo {
  const r = new PixelRng(mixSeed(seed | 0, 0x77a2d));
  const cap = Number.isFinite(stats.capacity) ? stats.capacity : 4;
  let delay = Number.isFinite(stats.castDelay) ? stats.castDelay : 10;
  if (Math.abs(delay) > 0 && Math.abs(delay) < 1.5) delay *= 60; // given in seconds
  const multi = (stats.actionsPerRound | 0) >= 2;
  const mana = Number.isFinite(stats.manaMax) ? stats.manaMax : 300;

  // material: crystal more likely on high-mana wands, bone/metal/wood otherwise
  const matRoll = r.next() + Math.min(0.25, mana / 4000);
  const material: WandMaterial = matRoll < 0.36 ? 'wood' : matRoll < 0.58 ? 'bone' : matRoll < 0.86 ? 'metal' : 'crystal';
  const pal = materialPalette(material, r);
  const accent = r.pick(ACCENTS);
  const gemColor = r.pick(GEM_COLORS);
  const jitter = r.int(0, 1);

  // --- dimensions ------------------------------------------------------------------------
  const W = clampInt(19 + jitter + (cap - 2) * 0.9, WAND_MIN_W, WAND_MAX_W);
  const t = delay <= 5 ? 2 : delay <= 20 ? 3 : 4; // body thickness
  const bigGem = t >= 3 || mana >= 500 || r.chance(0.35);
  const gemShape: 'rhombus' | 'round' = stats.shuffle ? 'round' : 'rhombus';
  const gs = gemShape === 'rhombus' ? (bigGem ? 5 : 3) : bigGem ? 5 : 4; // gem size (w = h)
  const gh2 = Math.floor(gs / 2);

  const CH = 16; // scratch canvas height; cropped later
  const cy = 8;
  const img = new PixelImage(W, CH);
  const x1 = W - 2; // right-most drawable column (1px outline margin)
  const bodyTop = cy - Math.floor(t / 2);
  const bodyBot = bodyTop + t - 1;

  // --- part choices -----------------------------------------------------------------------
  const gripStyle = r.pick(['wrapped', 'wrapped', 'plain', 'studded'] as const);
  const shaftStyle = t >= 3 ? r.pick(['straight', 'club', 'taper'] as const) : 'straight';
  const headStyle = multi ? 'fork' : r.pick(['collar', 'cup', 'bare'] as const);
  const hasGuard = r.chance(material === 'metal' ? 0.7 : 0.4);

  // --- layout along x ----------------------------------------------------------------------
  const hl = 3 + (W >= 25 ? 1 : 0) + r.int(0, 1); // grip length (after the 3px pommel)
  const gripStart = 4;
  const gripEnd = gripStart + hl - 1;
  const shaftStart = gripEnd + 1 + (hasGuard ? 1 : 0);
  const gemRight = multi ? x1 - 1 : x1;
  const gemLeft = gemRight - gs + 1;
  const bodyEnd = multi ? gemLeft - 3 : headStyle === 'collar' ? gemLeft - 2 : gemLeft - 1;

  // --- handle -----------------------------------------------------------------------------
  const gt = t >= 4 ? 3 : 2;
  const gTop = cy - Math.floor(gt / 2);
  const pommel = r.chance(0.35) ? accent : pal.dark;
  // round pommel knob (3 columns, corners cut)
  img.fillRect(1, gTop, 1, gt, pommel);
  img.fillRect(2, gTop - 1, 2, gt + 2, pommel);
  img.set(1, gTop, lighten(pommel, 0.25));
  img.set(2, gTop - 1, lighten(pommel, 0.35));
  img.set(3, gTop - 1, lighten(pommel, 0.15));
  img.set(3, gTop + gt, darken(pommel, 0.35));
  for (let x = gripStart; x <= gripEnd; x++)
    for (let y = gTop; y < gTop + gt; y++) {
      let c: string;
      if (gripStyle === 'plain') c = y === gTop ? pal.base : pal.dark;
      else if (gripStyle === 'studded') c = (x - gripStart) % 2 === 1 && y === gTop ? accent : y === gTop ? lighten(pal.grip, 0.2) : pal.grip;
      else {
        const wrap = (x + y) % 3 === 0;
        c = wrap ? pal.gripDark : y === gTop ? lighten(pal.grip, 0.22) : pal.grip;
      }
      img.set(x, y, c);
    }
  if (hasGuard) {
    const gx = gripEnd + 1;
    img.fillRect(gx, bodyTop - 1, 1, t + 2, accent);
    img.set(gx, bodyTop - 1, lighten(accent, 0.4));
    img.set(gx, bodyBot + 1, darken(accent, 0.35));
  }

  // --- shaft ------------------------------------------------------------------------------
  const knobEvery = r.int(4, 5);
  const bands = new Set<number>();
  const bandCount = material === 'metal' ? r.int(1, 2) : material === 'crystal' ? 0 : r.int(0, 1);
  for (let i = 0; i < bandCount; i++) bands.add(r.int(shaftStart + 2, Math.max(shaftStart + 2, bodyEnd - 3)));
  const span = Math.max(1, bodyEnd - shaftStart);
  const leafX = material === 'wood' && r.chance(0.45) ? r.int(shaftStart + 2, Math.max(shaftStart + 2, bodyEnd - 3)) : -1;
  for (let x = shaftStart; x <= bodyEnd; x++) {
    const u = (x - shaftStart) / span;
    let top = bodyTop;
    let bot = bodyBot;
    if (shaftStyle === 'club' && u < 0.45) top += 1; // thickens toward the head
    if (shaftStyle === 'taper' && u > 0.6) top += 1; // thins toward the head
    const knob = material === 'bone' && (x - shaftStart) % knobEvery === knobEvery - 1 && x < bodyEnd - 1;
    if (knob) {
      top -= 1;
      bot += 1;
    }
    for (let y = top; y <= bot; y++) {
      let c = pal.base;
      const n = mixSeed(seed | 0, x, y) & 0xff;
      if (y === top) c = pal.light;
      else if (y === bot) c = pal.dark;
      switch (material) {
        case 'wood':
          if (y > top && y < bot && n < 70) c = darken(pal.base, 0.15);
          if (y === top && n < 40) c = pal.base;
          break;
        case 'bone':
          if (knob && y === top) c = lighten(pal.light, 0.3);
          if (n < 18 && y !== top) c = darken(pal.base, 0.22);
          break;
        case 'metal':
          if (y === top) c = lighten(pal.base, 0.6);
          if (y > top && y < bot && (x + 1) % 5 === 0) c = pal.light;
          break;
        case 'crystal':
          if (y !== bot && (x + y) % 4 === 0) c = lighten(pal.light, 0.3);
          else if (y !== top && (x - y + 64) % 4 === 0) c = pal.dark;
          break;
      }
      if (bands.has(x)) c = y === top ? lighten(accent, 0.35) : y === bot ? darken(accent, 0.3) : accent;
      img.set(x, y, c);
    }
    if (x === leafX) {
      img.set(x, top - 1, '#4a8a2a');
      img.set(x + 1, top - 2, '#7ac040');
      img.set(x + 1, top - 1, '#5aa034');
    }
  }
  // inlaid mana stone on rich wands
  if (mana >= 800 && bodyEnd - shaftStart > 5) {
    const ix = Math.round((shaftStart + bodyEnd) / 2);
    img.set(ix, cy, lighten(gemColor, 0.25));
    img.set(ix + 1, cy, gemColor);
  }

  // --- head -------------------------------------------------------------------------------
  const gTopRow = cy - gh2;
  const gBotRow = cy + (gs - 1 - gh2);
  if (headStyle === 'fork') {
    // the shaft splits into two prongs that diverge, then run forward past the gem
    const yTop = gTopRow - 1;
    const yBot = gBotRow + 1;
    const prong = material === 'crystal' || material === 'bone' ? pal.base : r.chance(0.5) ? accent : pal.base;
    const pl = lighten(prong, 0.25);
    const pd = darken(prong, 0.3);
    let y0 = bodyTop;
    let y1 = bodyBot;
    let x = bodyEnd + 1;
    while (y0 > yTop || y1 < yBot) {
      if (y0 > yTop) y0--;
      if (y1 < yBot) y1++;
      img.set(x, y0, pl);
      img.set(x, y0 + 1, prong);
      img.set(x, y1, pd);
      img.set(x, y1 - 1, prong);
      x++;
    }
    img.fillRect(x, yTop, x1 - x + 1, 1, pl);
    img.fillRect(x, yBot, x1 - x + 1, 1, pd);
    img.set(x1, yTop, lighten(gemColor, 0.45));
    img.set(x1, yBot, lighten(gemColor, 0.25));
  } else if (headStyle === 'collar') {
    const cTop = Math.min(bodyTop, gTopRow) - (gs >= 5 ? 0 : 1);
    const cBot = Math.max(bodyBot, gBotRow) + (gs >= 5 ? 0 : 1);
    img.fillRect(bodyEnd + 1, cTop, 1, cBot - cTop + 1, accent);
    img.set(bodyEnd + 1, cTop, lighten(accent, 0.4));
    img.set(bodyEnd + 1, cBot, darken(accent, 0.35));
  } else if (headStyle === 'cup') {
    // the shaft flares into a little cup that cradles the gem
    img.set(bodyEnd, bodyTop - 1, pal.light);
    img.set(bodyEnd, bodyBot + 1, pal.dark);
    img.set(bodyEnd + 1, gTopRow - (gs >= 5 ? 0 : 1), pal.light);
    img.set(bodyEnd + 1, gBotRow + (gs >= 5 ? 0 : 1), pal.dark);
  }
  drawGem(img, gemLeft, cy, gs, gemShape, gemColor, r);

  // --- crop vertically to content (+1px outline margin), clamp to 6..10 rows -------------
  let minY = CH;
  let maxY = -1;
  for (let y = 0; y < CH; y++)
    for (let x = 0; x < W; x++)
      if (img.isOpaque(x, y)) {
        minY = Math.min(minY, y);
        maxY = Math.max(maxY, y);
      }
  let top = minY - 1;
  let H = maxY - minY + 3;
  if (H < 6) {
    top -= Math.floor((6 - H) / 2);
    H = 6;
  }
  H = Math.min(10, H);
  const out = new PixelImage(W, H);
  for (let y = 0; y < H; y++) for (let x = 0; x < W; x++) out.set(x, y, img.get(x, top + y));
  out.outline(WAND_OUTLINE);
  return {
    img: out,
    material,
    gemColor,
    tip: { x: multi ? x1 : gemRight, y: cy - top },
    grip: { x: Math.round((gripStart + gripEnd) / 2), y: cy - top },
  };
}

function drawGem(
  img: PixelImage,
  left: number,
  cy: number,
  s: number,
  shape: 'rhombus' | 'round',
  color: string,
  r: PixelRng,
): void {
  const h2 = Math.floor(s / 2);
  const cx = left + (s - 1) / 2;
  const top = cy - h2;
  const cells: Array<[number, number]> = [];
  if (shape === 'rhombus') {
    for (let dy = -h2; dy <= h2; dy++) {
      const half = h2 - Math.abs(dy);
      for (let dx = -half; dx <= half; dx++) cells.push([cx + dx, cy + dy]);
    }
  } else {
    // round / irregular: a disc with a couple of pixels nudged by the seed
    for (let y = 0; y < s; y++)
      for (let x = 0; x < s; x++) {
        const dx = x - (s - 1) / 2;
        const dy = y - (s - 1) / 2;
        if (dx * dx + dy * dy <= (s / 2) * (s / 2) - 0.1) cells.push([left + x, top + y]);
      }
    if (r.chance(0.6)) {
      // irregular nub on the top or bottom edge
      const nx = left + r.int(1, s - 2);
      cells.push([nx, r.chance(0.5) ? top - 1 : top + s]);
    }
  }
  const midY = shape === 'rhombus' ? cy : top + (s - 1) / 2;
  for (const [x, y] of cells) {
    const d = x - cx + (y - midY);
    const c = d < -0.6 ? lighten(color, 0.35) : d > 1.4 ? darken(color, 0.35) : color;
    img.set(x, y, c);
  }
  // specular glint
  img.set(Math.round(cx - (s >= 5 ? 1 : 0)), Math.round(midY - (s >= 4 ? 1 : 0)), '#ffffff');
}

/** Wand sprite only (see wandSpriteInfo for anchors). Deterministic in (seed, stats). */
export function wandSprite(seed: number, stats: WandSpriteStats): PixelImage {
  return wandSpriteInfo(seed, stats).img;
}

/**
 * Flattens a sprite for voxel extrusion: row-major, top row first; null = empty (alpha < 128),
 * otherwise '#rrggbb'.
 */
export function wandPixelsForVoxel(img: PixelImage): { w: number; h: number; colors: (string | null)[] } {
  const colors: (string | null)[] = new Array(img.w * img.h);
  for (let y = 0; y < img.h; y++)
    for (let x = 0; x < img.w; x++) {
      const i = (y * img.w + x) * 4;
      colors[y * img.w + x] = img.data[i + 3] < 128 ? null : rgbToHex(img.data[i], img.data[i + 1], img.data[i + 2]);
    }
  return { w: img.w, h: img.h, colors };
}
