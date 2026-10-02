/**
 * Pixel-art HUD icons rendered as SVG data URLs (9x9 grids, Minecraft-style status icons).
 */
type Px = string[];
const svg = (rows: Px, pal: Record<string, string>) => {
  const h = rows.length, w = rows[0].length;
  let r = '';
  for (let y = 0; y < h; y++)
    for (let x = 0; x < w; x++) {
      const c = rows[y][x];
      if (c === '.' || !pal[c]) continue;
      r += `<rect x="${x}" y="${y}" width="1.02" height="1.02" fill="${pal[c]}"/>`;
    }
  return `data:image/svg+xml;utf8,${encodeURIComponent(`<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 ${w} ${h}" shape-rendering="crispEdges">${r}</svg>`)}`;
};

const HEART: Px = [
  '.kk...kk.',
  'kRRk.kRRk',
  'kRwRkRRRk',
  'kRRRRRRRk',
  'kRRRRRRrk',
  '.kRRRRrk.',
  '..kRRrk..',
  '...krk...',
  '....k....',
];
const HEART_HALF: Px = HEART.map((r) => r.split('').map((c, x) => (x > 4 && 'Rrw'.includes(c) ? 'e' : c)).join(''));
const HEART_EMPTY: Px = HEART.map((r) => r.replace(/[Rrw]/g, 'e'));
const heartPal = (main: string, dark: string, hi = '#ffd0d0') => ({ k: '#1a0c0c', R: main, r: dark, w: hi, e: '#3a1414' });

const FOOD: Px = [
  '.....kkk.',
  '....kBBBk',
  '...kBbBBk',
  '..kBBBBBk',
  '.kkBBBBk.',
  'kwkkBBk..',
  'kwwkkk...',
  '.kwk.....',
  '..k......',
];
const FOOD_HALF: Px = FOOD.map((r) => r.split('').map((c, x) => (x > 4 && 'Bb'.includes(c) ? 'e' : c)).join(''));
const FOOD_EMPTY: Px = FOOD.map((r) => r.replace(/[Bbw]/g, 'e'));
const foodPal = { k: '#2b1608', B: '#c27a35', b: '#e3a35f', w: '#f1eadc', e: '#3a2a1c' };
const foodPalHunger = { k: '#18240e', B: '#6f8f2b', b: '#99b84a', w: '#c8d9a5', e: '#2a321c' };

const ARMOR: Px = [
  '.kk...kk.',
  'kAAk.kAAk',
  'kAAkkkAAk',
  'kAaAAAAak',
  '.kAAAAAk.',
  '.kAaAaAk.',
  '.kAAAAAk.',
  '.kAaAaAk.',
  '..kkkkk..',
];
const ARMOR_HALF: Px = ARMOR.map((r) => r.split('').map((c, x) => (x > 4 && 'Aa'.includes(c) ? 'e' : c)).join(''));
const ARMOR_EMPTY: Px = ARMOR.map((r) => r.replace(/[Aa]/g, 'e'));
const armorPal = { k: '#1d1d1d', A: '#d9d9d9', a: '#9a9a9a', e: '#3a3a3a' };

const BUBBLE: Px = [
  '..kkkkk..',
  '.kBBBBBk.',
  'kBwBBBBBk',
  'kBwBBBBBk',
  'kBBBBBBBk',
  'kBBBBBBBk',
  'kBBBBBBbk',
  '.kBBBBbk.',
  '..kkkkk..',
];
const bubblePal = { k: '#0d2b5a', B: 'rgba(80,160,255,0.55)', b: 'rgba(40,90,200,0.7)', w: '#ffffff' };

export const ICONS = {
  heart: svg(HEART, heartPal('#e01b1b', '#8e0a0a')),
  heartHalf: svg(HEART_HALF, heartPal('#e01b1b', '#8e0a0a')),
  heartEmpty: svg(HEART_EMPTY, heartPal('#e01b1b', '#8e0a0a')),
  heartPoison: svg(HEART, heartPal('#7c8f1b', '#4c5a0a', '#d9e8a0')),
  heartPoisonHalf: svg(HEART_HALF, heartPal('#7c8f1b', '#4c5a0a', '#d9e8a0')),
  heartWither: svg(HEART, heartPal('#2b2b2b', '#111', '#888')),
  heartAbsorb: svg(HEART, heartPal('#f5c518', '#a77d00', '#fff4b0')),
  heartAbsorbHalf: svg(HEART_HALF, heartPal('#f5c518', '#a77d00', '#fff4b0')),
  heartHardcore: svg(HEART, heartPal('#e01b1b', '#5e0505', '#fff')),
  food: svg(FOOD, foodPal),
  foodHalf: svg(FOOD_HALF, foodPal),
  foodEmpty: svg(FOOD_EMPTY, foodPal),
  foodHunger: svg(FOOD, foodPalHunger),
  foodHungerHalf: svg(FOOD_HALF, foodPalHunger),
  armor: svg(ARMOR, armorPal),
  armorHalf: svg(ARMOR_HALF, armorPal),
  armorEmpty: svg(ARMOR_EMPTY, armorPal),
  bubble: svg(BUBBLE, bubblePal),
};
