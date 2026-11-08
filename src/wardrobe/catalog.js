// Garment catalogue.  Fitted garments are described by a signed field over the
// body surface (negative = covered) plus an offset (fabric thickness + ease).
// All distances are metres in the rest pose.  Landmarks come from BodyAtlas.L.
import { buildSkirt } from './Skirt.js';
import { buildShoes, SHOE_STYLES } from './Shoes.js';

export const clamp = (x, a, b) => Math.max(a, Math.min(b, x));
export const smoothstep = (a, b, x) => { const t = clamp((x - a) / (b - a), 0, 1); return t * t * (3 - 2 * t); };
const mix = (a, b, t) => a + (b - a) * t;

export const SLOTS = [
  { id: 'bra', label: 'Bra' },
  { id: 'briefs', label: 'Briefs' },
  { id: 'legwear', label: 'Hosiery' },
  { id: 'socks', label: 'Socks' },
  { id: 'top', label: 'Top' },
  { id: 'bottom', label: 'Bottom' },
  { id: 'dress', label: 'Dress' },
  { id: 'layer', label: 'Knit / layer' },
  { id: 'outer', label: 'Outerwear' },
  { id: 'shoes', label: 'Shoes' },
];

export const CATEGORIES = [
  { id: 'tops', label: 'Tops', slots: ['top'] },
  { id: 'bottoms', label: 'Bottoms', slots: ['bottom'] },
  { id: 'dresses', label: 'Dresses', slots: ['dress'] },
  { id: 'layers', label: 'Knits & Jackets', slots: ['layer', 'outer'] },
  { id: 'legwear', label: 'Legwear', slots: ['legwear', 'socks'] },
  { id: 'shoes', label: 'Shoes', slots: ['shoes'] },
  { id: 'lingerie', label: 'Lingerie', slots: ['bra', 'briefs'] },
];

// ---------------------------------------------------------------- palettes
export const PALETTE = [
  '#f7f5f0', '#e9e1d3', '#d8c3a5', '#b89b72', '#8a6a4a', '#5b3e2b', '#2b211c', '#111114',
  '#9aa3ad', '#5c6670', '#2f3742', '#1d2433', '#2c3e66', '#3d6a9e', '#8fb3d9', '#c9dcef',
  '#2f4a3a', '#4f6f4b', '#8a9a5b', '#c2b280', '#7a1f2b', '#a3263a', '#d1495b', '#e8a0a8',
  '#f2c6c2', '#c76b4a', '#d98b3a', '#e9c46a', '#f4e8c1', '#6d4c7d', '#a58bbd', '#ffffff',
];
const DENIM = ['#1f2c46', '#2b3f63', '#3f5c86', '#6f8db3', '#a9bdd6', '#1a1a1d', '#e9e6df'];
const HOSIERY = ['#1a1717', '#2a2420', '#5b3f33', '#b88c74', '#d7ae94', '#7a1f2b', '#1d2433', '#f2efe9'];

// ---------------------------------------------------------------- field helpers
function legLine(s, { crotchDrop = 0.012, sideY, frontRise = 0, backDrop = 0.02 }) {
  const L = s.L;
  const ax = Math.abs(s.x);
  const front = smoothstep(-0.02, 0.06, s.z);
  const back = 1 - smoothstep(-0.06, 0.02, s.z);
  const yLine = mix(L.crotchY - crotchDrop, sideY + frontRise * front - backDrop * back, smoothstep(0.025, 0.165, ax));
  return yLine - s.y;
}

/** Neckline: positive above the curve (outside the garment). */
function neckField(s, n) {
  const nb = s.L.neckBase;
  const ax = Math.abs(s.x);
  const front = smoothstep(-0.03, 0.03, s.z - nb.z);
  const depth = mix(n.back ?? 0.0, n.depth, front);
  const hw = mix(n.backWidth ?? n.width, n.width, front);
  const t = clamp(ax / hw, 0, 1);
  const prof = n.type === 'v' ? t : n.type === 'square' ? (t < 0.85 ? 0 : (t - 0.85) / 0.15) : t * t;
  const yN = nb.y - depth + (depth + 0.07) * prof;
  return s.y - yN;
}

function sleeveField(s, len) {
  const side = s.x > 0 ? 'l' : 'r';
  if (len === null) return (s.arm - 0.42) * 0.3;          // sleeveless armhole
  const w = smoothstep(0.12, 0.5, s.arm);
  if (w === 0) return -0.05;
  return mix(-0.05, s.armT(side) - len, w);
}

function topField(s, o) {
  if (s.head > 0.25 || s.hand > 0.2) return 1;
  if (s.leg > 0.9) return 1;
  let f = Math.max(neckField(s, o.neck), (o.hemY(s.L) - s.y) + (o.hemCurve || 0) * Math.abs(s.x) * Math.abs(s.x) * 4);
  f = Math.max(f, sleeveField(s, o.sleeve));
  if (o.straps) {
    // camisole: above the bust only thin straps remain
    const tip = s.x > 0 ? s.L.breastTipL : s.L.breastTipR;
    const top = s.y - (tip.y + o.straps.cut - 0.06 * smoothstep(0.0, 0.08, -s.z) * 0);
    const strap = Math.abs(Math.abs(s.x) - o.straps.x) - o.straps.w;
    const back = s.z < -0.02 ? s.y - (tip.y + o.straps.backCut) : -1;
    f = Math.max(f, Math.min(Math.max(top, back > 0 ? back : top), strap));
  }
  if (o.openFront) {
    // cardigan / jacket opening below the neckline
    const gap = o.openFront - Math.abs(s.x);
    if (s.z > 0.02) f = Math.max(f, gap);
  }
  return f;
}

function bottomField(s, o) {
  if (s.arm > 0.3 || s.hand > 0.2) return 1;
  const L = s.L;
  const yW = o.waistY(L) - (o.frontDrop || 0) * smoothstep(0, 0.1, s.z);
  let f = s.y - yW;
  if (o.hemY) f = Math.max(f, o.hemY(L) - s.y);
  if (!o.feet) f = Math.max(f, (s.foot - 0.45) * 0.5);
  return f;
}

/** Radially widen trouser legs below `fromY` to at least r(y). */
function legReshape(rFn) {
  return (p, b, n, off, L) => {
    if (b.y > L.crotchY - 0.01) return false;
    const left = b.x > 0;
    const hip = left ? L.hipL : L.hipR, knee = left ? L.kneeL : L.kneeR, ank = left ? L.ankleL : L.ankleR;
    let ax, az;
    if (b.y > knee.y) { const t = (hip.y - b.y) / (hip.y - knee.y); ax = mix(hip.x, knee.x, t); az = mix(hip.z, knee.z, t); }
    else { const t = clamp((knee.y - b.y) / (knee.y - ank.y), 0, 1.2); ax = mix(knee.x, ank.x, t); az = mix(knee.z, ank.z, t); }
    const dx = p.x - ax, dz = p.z - az, r = Math.hypot(dx, dz);
    const rmin = rFn(b.y, L);
    if (r >= rmin || r < 1e-5) return false;
    p.x = ax + (dx / r) * rmin; p.z = az + (dz / r) * rmin;
    if (left) p.x = Math.max(p.x, 0.006); else p.x = Math.min(p.x, -0.006);
    return true;
  };
}

/** Loose sleeves: widen around the arm axis. */
function sleeveReshape(rFn) {
  return (p, b, n, off, L) => {
    const left = b.x > 0;
    const sh = left ? L.shoulderL : L.shoulderR, el = left ? L.elbowL : L.elbowR, wr = left ? L.wristL : L.wristR;
    // project on shoulder->elbow->wrist
    const proj = (a, c) => {
      const dx = c.x - a.x, dy = c.y - a.y, dz = c.z - a.z; const l2 = dx * dx + dy * dy + dz * dz;
      const t = ((b.x - a.x) * dx + (b.y - a.y) * dy + (b.z - a.z) * dz) / l2;
      return { t, x: a.x + dx * t, y: a.y + dy * t, z: a.z + dz * t, l: Math.sqrt(l2) };
    };
    let q = proj(sh, el), u;
    if (q.t < 0.15) return false;
    if (q.t > 1) { const q2 = proj(el, wr); q = q2; u = 1 + clamp(q2.t, 0, 1.2); } else u = q.t;
    const dx = p.x - q.x, dy = p.y - q.y, dz = p.z - q.z; const r = Math.hypot(dx, dy, dz);
    const rmin = rFn(u);
    if (r >= rmin || r < 1e-5) return false;
    const k = rmin / r;
    p.x = q.x + dx * k; p.y = q.y + dy * k; p.z = q.z + dz * k;
    return true;
  };
}

/** Fabric hangs from the bust apex / shoulder blades instead of following the body back in. */
function apexTables(atlas) {
  if (atlas._apex) return atlas._apex;
  const L = atlas.L, P = atlas.P;
  const tipY = L.breastTipL.y;
  const front = new Map(), back = new Map();
  for (let i = 0; i < atlas.count; i++) {
    if (atlas.arm[i] > 0.2 || atlas.head[i] > 0.2) continue;
    const x = P[i * 3], y = P[i * 3 + 1], z = P[i * 3 + 2];
    const bin = Math.round(x * 100);
    if (y > tipY - 0.03 && y < tipY + 0.03 && z > 0) front.set(bin, Math.max(front.get(bin) ?? -1, z));
    if (y > tipY + 0.02 && y < tipY + 0.09 && z < 0) back.set(bin, Math.min(back.get(bin) ?? 1, z));
  }
  atlas._apex = { front, back, tipY, backY: tipY + 0.05 };
  return atlas._apex;
}
function drape(slope = 0.28, extra = 0.0) {
  return (p, b, n, off, L, atlas) => {
    const T = apexTables(atlas);
    const bin = Math.round(b.x * 100);
    let moved = false;
    if (b.z > 0 && b.y < T.tipY && b.y > T.tipY - 0.4) {
      const ap = T.front.get(bin);
      if (ap !== undefined) {
        const zMin = ap + off + extra - slope * (T.tipY - b.y);
        if (p.z < zMin) { p.z = zMin; moved = true; }
      }
    }
    if (b.z < 0 && b.y < T.backY && b.y > T.backY - 0.3) {
      const ap = T.back.get(bin);
      if (ap !== undefined) {
        const zMax = ap - off - extra * 0.5 + slope * 1.3 * (T.backY - b.y);
        if (p.z > zMax) { p.z = zMax; moved = true; }
      }
    }
    return moved;
  };
}
const compose = (...fns) => (...a) => { let m = false; for (const f of fns) if (f && f(...a)) m = true; return m; };

const land = (L, topY) => [L.pelvis.y + 0.03, L.pelvis.y - 0.05, L.crotchY, topY ?? L.neckBase.y];

export const CATALOG = {};
function add(def) { CATALOG[def.id] = def; return def; }

// ============================================================================ underwear
add({
  id: 'briefs_hipster', label: 'Hipster briefs', slot: 'briefs', locked: true, layer: 1,
  materials: ['microfiber', 'silk', 'lace', 'cotton'], patterns: ['solid', 'polka', 'floral', 'leopard'],
  defaults: { material: 'microfiber', color: '#1e1b20' },
  fitted: {
    field: (s) => {
      const L = s.L;
      if (s.arm > 0.3) return 1;
      const top = s.y - (L.pelvis.y + 0.005 - 0.012 * smoothstep(0.0, 0.1, s.z));
      const leg = legLine(s, { sideY: L.pelvis.y - 0.045, frontRise: 0.015, backDrop: 0.035 });
      return Math.max(top, leg);
    },
    offset: () => 0.0012, smooth: 6, hem: 0.0015,
  },
});

add({
  id: 'briefs_highwaist', label: 'High-waist briefs', slot: 'briefs', locked: true, layer: 1,
  materials: ['microfiber', 'silk', 'lace', 'cotton'], patterns: ['solid', 'polka', 'floral'],
  defaults: { material: 'microfiber', color: '#e9ddd2' },
  fitted: {
    field: (s) => {
      const L = s.L;
      if (s.arm > 0.3) return 1;
      const top = s.y - (L.naturalWaistY - 0.01);
      const leg = legLine(s, { sideY: L.pelvis.y - 0.035, frontRise: 0.0, backDrop: 0.03 });
      return Math.max(top, leg);
    },
    offset: () => 0.0012, smooth: 6, hem: 0.0015,
  },
});

function braField(style) {
  return (s) => {
    const L = s.L;
    if (s.arm > 0.4 || s.head > 0.3 || s.leg > 0.3) return 1;
    const tip = s.x > 0 ? L.breastTipL : L.breastTipR;
    const bandY = tip.y - 0.075;
    const bottom = bandY - (style === 'sport' ? 0.035 : 0.018) - s.y;
    const ax = Math.abs(s.x);
    const front = smoothstep(-0.04, 0.05, s.z);
    // neckline across the bust: lowest in the centre (gore), highest over the cups
    const cupTop = tip.y + (style === 'sport' ? 0.075 : 0.045);
    const centre = tip.y - (style === 'sport' ? 0.0 : 0.035);
    const yFront = mix(centre, cupTop, smoothstep(0.0, Math.abs(tip.x) * 0.9, ax)) - (style === 'sport' ? 0 : 0.03) * smoothstep(Math.abs(tip.x), Math.abs(tip.x) + 0.06, ax);
    const yBack = bandY + (style === 'sport' ? 0.07 : 0.022);
    const top = s.y - mix(yBack, yFront, front);
    const body = Math.max(bottom, top);
    // shoulder straps
    const sx = style === 'sport' ? 0.075 : mix(0.085, 0.1, smoothstep(tip.y, L.neckBase.y, s.y));
    const sw = style === 'sport' ? 0.022 : 0.0065;
    const strap = Math.max(Math.abs(ax - sx) - sw, bandY - s.y);
    return Math.min(body, strap);
  };
}

add({
  id: 'bra_bralette', label: 'Soft bralette', slot: 'bra', locked: true, layer: 1,
  materials: ['microfiber', 'silk', 'lace', 'cotton'], patterns: ['solid', 'polka', 'floral', 'leopard'],
  defaults: { material: 'microfiber', color: '#1e1b20' },
  fitted: { field: braField('bralette'), offset: () => 0.0016, smooth: 14, hem: 0.0015, minOffset: 0.0012 },
});
add({
  id: 'bra_sport', label: 'Sports bra', slot: 'bra', locked: true, layer: 1,
  materials: ['microfiber', 'cotton', 'jersey'], patterns: ['solid', 'stripes'],
  defaults: { material: 'microfiber', color: '#2f3742' },
  fitted: { field: braField('sport'), offset: () => 0.002, smooth: 18, hem: 0.002, minOffset: 0.0015 },
});

// ============================================================================ tops
const TOP_MATERIALS = ['cotton', 'jersey', 'linen', 'silk', 'chiffon', 'cashmere'];
const TOP_PATTERNS = ['solid', 'stripes', 'pinstripe', 'gingham', 'polka', 'floral', 'leopard'];

add({
  id: 'tshirt', hides: ['bra'], label: 'Crew-neck T-shirt', slot: 'top', layer: 3,
  materials: TOP_MATERIALS, patterns: TOP_PATTERNS,
  defaults: { material: 'jersey', color: '#f7f5f0', pattern: 'solid', color2: '#1d2433' },
  fitted: {
    field: (s) => topField(s, { neck: { depth: 0.035, width: 0.08, back: 0.008, backWidth: 0.075 }, hemY: (L) => L.pelvis.y - 0.035, sleeve: 0.13 }),
    offset: (s) => 0.006 + 0.016 * smoothstep(1.2, 0.98, s.y) + 0.004 * s.arm,
    smooth: 26, hem: 0.004, minOffset: 0.004,
    reshape: compose(sleeveReshape((u) => (u < 0.4 ? 0 : 0.06)), drape(0.3)),
  },
});

add({
  id: 'breton', hides: ['bra'], label: 'Breton long-sleeve', slot: 'top', layer: 3,
  materials: ['cotton', 'jersey'], patterns: TOP_PATTERNS,
  defaults: { material: 'jersey', color: '#f4f1ea', pattern: 'stripes', color2: '#1d2433' },
  fitted: {
    field: (s) => topField(s, { neck: { type: 'boat', depth: 0.02, width: 0.13, back: 0.01, backWidth: 0.12 }, hemY: (L) => L.pelvis.y - 0.02, sleeve: 0.40 }),
    offset: (s) => 0.003 + 0.004 * smoothstep(1.15, 1.0, s.y),
    smooth: 12, hem: 0.004, reshape: drape(0.45),
  },
});

add({
  id: 'fitted_top', hides: ['bra'], label: 'Fitted scoop top', slot: 'top', layer: 3,
  materials: ['jersey', 'cotton', 'silk', 'cashmere'], patterns: ['solid', 'stripes', 'rib', 'leopard'],
  defaults: { material: 'jersey', color: '#111114', pattern: 'rib' },
  fitted: {
    field: (s) => topField(s, { neck: { depth: 0.11, width: 0.1, back: 0.02, backWidth: 0.08 }, hemY: (L) => L.pelvis.y - 0.01, sleeve: 0.47 }),
    offset: () => 0.0022, smooth: 8, hem: 0.003,
  },
});

add({
  id: 'camisole', label: 'Silk camisole', slot: 'top', layer: 3,
  materials: ['silk', 'chiffon', 'jersey', 'lace'], patterns: ['solid', 'polka', 'floral', 'leopard'],
  defaults: { material: 'silk', color: '#e8d8c4' },
  fitted: {
    field: (s) => topField(s, { neck: { type: 'v', depth: 0.16, width: 0.12, back: 0.12, backWidth: 0.14 }, hemY: (L) => L.pelvis.y + 0.01, sleeve: null, straps: { x: 0.092, w: 0.004, cut: 0.05, backCut: -0.04 } }),
    offset: (s) => 0.003 + 0.01 * smoothstep(1.2, 1.02, s.y),
    smooth: 18, hem: 0.002, reshape: drape(0.2),
  },
});

add({
  id: 'blouse', hides: ['bra'], label: 'V-neck blouse', slot: 'top', layer: 3,
  materials: ['silk', 'chiffon', 'cotton', 'linen'], patterns: ['solid', 'polka', 'floral', 'pinstripe', 'gingham'],
  defaults: { material: 'silk', color: '#f2e9dc' },
  fitted: {
    field: (s) => topField(s, { neck: { type: 'v', depth: 0.13, width: 0.075, back: 0.012, backWidth: 0.075 }, hemY: (L) => L.pelvis.y - 0.06, sleeve: 0.40 }),
    offset: (s) => 0.006 + 0.014 * smoothstep(1.2, 0.98, s.y) + 0.006 * s.arm,
    smooth: 22, hem: 0.003,
    reshape: compose(sleeveReshape((u) => (u < 0.5 ? 0 : mix(0.055, 0.058, clamp(u - 1, 0, 1)))), drape(0.18, 0.004)),
  },
});

add({
  id: 'shirt', hides: ['bra'], label: 'Button-up shirt', slot: 'top', layer: 3,
  materials: ['cotton', 'linen', 'silk', 'denim'], patterns: ['solid', 'pinstripe', 'gingham', 'tartan', 'stripes'],
  defaults: { material: 'cotton', color: '#f7f7f4', pattern: 'solid', color2: '#3d6a9e', detail: 2 },
  fitted: {
    field: (s) => topField(s, { neck: { depth: 0.045, width: 0.07, back: 0.0, backWidth: 0.065 }, hemY: (L) => L.pelvis.y - 0.08, hemCurve: 0.7, sleeve: 0.47 }),
    offset: (s) => 0.0045 + 0.01 * smoothstep(1.2, 1.0, s.y) + 0.004 * s.arm,
    smooth: 18, hem: 0.003,
    collar: { height: 0.032, flare: 0.012, minY: 1.36, maxX: 0.1, cz: -0.02 },
    reshape: compose(sleeveReshape((u) => (u < 0.4 ? 0 : 0.052)), drape(0.25)),
  },
});

add({
  id: 'crop_top', hides: ['bra'], label: 'Cropped tee', slot: 'top', layer: 3,
  materials: ['jersey', 'cotton'], patterns: ['solid', 'stripes', 'rib'],
  defaults: { material: 'jersey', color: '#e8a0a8' },
  fitted: {
    field: (s) => topField(s, { neck: { depth: 0.04, width: 0.085, back: 0.01, backWidth: 0.08 }, hemY: (L) => L.naturalWaistY + 0.035, sleeve: 0.1 }),
    offset: () => 0.0028, smooth: 10, hem: 0.003,
  },
});

// ============================================================================ knits & jackets
add({
  id: 'sweater', hides: ['bra', 'top'], label: 'Chunky knit sweater', slot: 'layer', layer: 4, replaces: [], gait: { armOut: 2.5 },
  materials: ['wool', 'cashmere'], patterns: ['solid', 'cable', 'rib', 'stripes'],
  defaults: { material: 'wool', color: '#e9e1d3', pattern: 'cable' },
  fitted: {
    field: (s) => topField(s, { neck: { depth: 0.03, width: 0.085, back: 0.006, backWidth: 0.08 }, hemY: (L) => L.pelvis.y - 0.055, sleeve: 0.5 }),
    offset: (s) => 0.012 + 0.012 * smoothstep(1.22, 1.0, s.y) + 0.004 * s.arm,
    smooth: 26, hem: 0.008, minOffset: 0.009,
    reshape: compose(sleeveReshape((u) => (u < 0.3 ? 0 : mix(0.066, 0.056, clamp(u - 1.5, 0, 0.5) * 2))), drape(0.15, 0.004)),
  },
  band: (L) => [L.pelvis.y - 0.06, L.pelvis.y - 0.005, 1, 1],
});

add({
  id: 'cardigan', label: 'Fine-knit cardigan', slot: 'layer', layer: 4,
  materials: ['cashmere', 'wool', 'jersey'], patterns: ['solid', 'rib', 'stripes'],
  defaults: { material: 'cashmere', color: '#c2b280', detail: 3, button: '#efe8d8' },
  fitted: {
    field: (s) => topField(s, { neck: { type: 'v', depth: 0.22, width: 0.085, back: 0.008, backWidth: 0.08 }, hemY: (L) => L.pelvis.y - 0.07, sleeve: 0.49, openFront: 0.012 }),
    offset: (s) => 0.008 + 0.01 * smoothstep(1.2, 1.0, s.y) + 0.003 * s.arm,
    smooth: 20, hem: 0.005, minOffset: 0.006,
    reshape: compose(sleeveReshape((u) => (u < 0.3 ? 0 : 0.063)), drape(0.2)),
  },
  band: (L) => [L.pelvis.y - 0.075, L.pelvis.y - 0.035, 1, 1],
});

add({
  id: 'blazer', gait: { armOut: 3 }, label: 'Tailored blazer', slot: 'outer', layer: 5,
  materials: ['wool', 'tweed', 'linen', 'leather', 'suede'], patterns: ['solid', 'pinstripe', 'houndstooth', 'tartan'],
  defaults: { material: 'wool', color: '#1d2433', detail: 5, button: '#2b211c' },
  fitted: {
    field: (s) => topField(s, { neck: { type: 'v', depth: 0.25, width: 0.1, back: 0.0, backWidth: 0.07 }, hemY: (L) => L.pelvis.y - 0.11, sleeve: 0.49, openFront: 0.004 }),
    offset: (s) => 0.016 + 0.012 * smoothstep(1.2, 1.0, s.y) + 0.004 * s.arm,
    smooth: 30, hem: 0.008, minOffset: 0.012,
    collar: { height: 0.035, flare: 0.02, minY: 1.38, maxX: 0.09, cz: -0.02 },
    reshape: compose(sleeveReshape((u) => (u < 0.2 ? 0 : 0.072)), drape(0.12, 0.006)),
  },
});

add({
  id: 'leather_jacket', gait: { armOut: 3 }, label: 'Leather biker jacket', slot: 'outer', layer: 5,
  materials: ['leather', 'suede', 'denim'], patterns: ['solid'],
  defaults: { material: 'leather', color: '#141214', detail: 4 },
  fitted: {
    field: (s) => topField(s, { neck: { depth: 0.04, width: 0.08, back: 0.0, backWidth: 0.075 }, hemY: (L) => L.pelvis.y - 0.0, sleeve: 0.5 }),
    offset: (s) => 0.014 + 0.008 * smoothstep(1.2, 1.0, s.y) + 0.003 * s.arm,
    smooth: 24, hem: 0.01, minOffset: 0.01,
    collar: { height: 0.04, flare: 0.03, minY: 1.37, maxX: 0.1, cz: -0.02 },
    reshape: compose(sleeveReshape((u) => (u < 0.2 ? 0 : 0.07)), drape(0.1, 0.004)),
  },
});

add({
  id: 'denim_jacket', gait: { armOut: 3 }, label: 'Denim jacket', slot: 'outer', layer: 5,
  materials: ['denim', 'suede', 'cotton'], patterns: ['solid'],
  defaults: { material: 'denim', color: '#6f8db3', detail: 2, button: '#b08a52' },
  fitted: {
    field: (s) => topField(s, { neck: { depth: 0.045, width: 0.075, back: 0.0, backWidth: 0.07 }, hemY: (L) => L.pelvis.y - 0.01, sleeve: 0.5 }),
    offset: (s) => 0.013 + 0.01 * smoothstep(1.2, 1.0, s.y) + 0.003 * s.arm,
    smooth: 24, hem: 0.009, minOffset: 0.009,
    collar: { height: 0.04, flare: 0.028, minY: 1.37, maxX: 0.1, cz: -0.02 },
    reshape: compose(sleeveReshape((u) => (u < 0.2 ? 0 : 0.072)), drape(0.1, 0.004)),
  },
});

// ============================================================================ bottoms
add({
  id: 'jeans_skinny', waist: (L) => L.pelvis.y + 0.035, hides: ['briefs'], label: 'Skinny jeans', slot: 'bottom', layer: 3,
  materials: ['denim'], patterns: ['solid'],
  defaults: { material: 'denim', color: '#2b3f63', detail: 1 }, colors: DENIM,
  fitted: {
    field: (s) => bottomField(s, { waistY: (L) => L.pelvis.y + 0.035, hemY: (L) => L.ankleL.y + 0.025 }),
    offset: (s) => 0.0032 + 0.002 * smoothstep(0.75, 0.55, s.y) * 0,
    smooth: 5, hem: 0.004,
  },
});

add({
  id: 'jeans_straight', waist: (L) => L.naturalWaistY - 0.02, hides: ['briefs'], label: 'Straight-leg jeans', slot: 'bottom', layer: 3,
  materials: ['denim'], patterns: ['solid'],
  defaults: { material: 'denim', color: '#3f5c86', detail: 1 }, colors: DENIM,
  fitted: {
    field: (s) => bottomField(s, { waistY: (L) => L.naturalWaistY - 0.02, hemY: (L) => L.ankleL.y - 0.005 }),
    offset: () => 0.0045,
    smooth: 10, hem: 0.006,
    reshape: legReshape((y, L) => mix(0.0, 0.066, smoothstep(L.crotchY - 0.1, L.kneeL.y + 0.05, y) * 0 + smoothstep(L.crotchY - 0.12, L.kneeL.y, y))),
  },
  gait: { },
});

add({
  id: 'trousers_wide', waist: (L) => L.naturalWaistY + 0.005, hides: ['briefs'], label: 'Wide-leg trousers', slot: 'bottom', layer: 3,
  materials: ['wool', 'linen', 'silk', 'cotton', 'tweed'], patterns: ['solid', 'pinstripe', 'houndstooth', 'tartan'],
  defaults: { material: 'wool', color: '#2f3742' },
  fitted: {
    field: (s) => bottomField(s, { waistY: (L) => L.naturalWaistY + 0.005, hemY: (L) => L.ankleL.y - 0.03 }),
    offset: (s) => 0.005 + 0.006 * smoothstep(0.95, 0.8, s.y),
    smooth: 18, hem: 0.006,
    reshape: legReshape((y, L) => mix(0.0, mix(0.085, 0.118, smoothstep(L.kneeL.y, 0.05, y)), smoothstep(L.crotchY - 0.06, L.crotchY - 0.2, y))),
  },
});

add({
  id: 'leggings', waist: (L) => L.naturalWaistY - 0.01, hides: ['briefs'], label: 'Leggings', slot: 'bottom', layer: 3,
  materials: ['jersey', 'microfiber', 'leather'], patterns: ['solid', 'leopard', 'rib'],
  defaults: { material: 'microfiber', color: '#111114' },
  fitted: {
    field: (s) => bottomField(s, { waistY: (L) => L.naturalWaistY - 0.01, hemY: (L) => L.ankleL.y + 0.03 }),
    offset: () => 0.0018, smooth: 3, hem: 0.002,
  },
});

add({
  id: 'shorts_denim', waist: (L) => L.naturalWaistY - 0.015, hides: ['briefs'], label: 'Denim shorts', slot: 'bottom', layer: 3,
  materials: ['denim', 'linen', 'cotton'], patterns: ['solid', 'gingham'],
  defaults: { material: 'denim', color: '#6f8db3', detail: 1 }, colors: DENIM,
  fitted: {
    field: (s) => bottomField(s, { waistY: (L) => L.naturalWaistY - 0.015, hemY: (L) => L.crotchY - 0.06 + 0.02 * smoothstep(0.03, 0.12, Math.abs(s.x)) }),
    offset: (s) => 0.004 + 0.006 * smoothstep(0.86, 0.7, s.y),
    smooth: 10, hem: 0.006,
    reshape: legReshape((y, L) => (y < L.crotchY - 0.02 ? 0.088 : 0)),
  },
});

// fitted (body-derived) mini skirt & bodycon: tube built by Skirt.js without simulation
add({
  id: 'skirt_mini', label: 'A-line mini skirt', slot: 'bottom', layer: 3,
  materials: ['denim', 'suede', 'leather', 'wool', 'tweed', 'cotton'], patterns: ['solid', 'tartan', 'houndstooth', 'gingham'],
  defaults: { material: 'suede', color: '#8a6a4a' },
  build: (w, o) => buildSkirt(w, o, { top: 'hip', length: 0.36, flare: 0.13, sim: true, stiffness: 0.9, rows: 14, gather: 1.0 }),
  waist: (L) => L.pelvis.y + 0.012,
});
add({
  id: 'skirt_pencil', label: 'Pencil midi skirt', slot: 'bottom', layer: 3,
  materials: ['wool', 'leather', 'tweed', 'silk', 'cotton'], patterns: ['solid', 'pinstripe', 'houndstooth', 'tartan'],
  defaults: { material: 'wool', color: '#1a1a1d' },
  build: (w, o) => buildSkirt(w, o, { top: 'waist', length: 0.66, flare: 0.0, sim: true, rows: 22, stiffness: 1, tight: true, ease: 0.016 }),
  waist: (L) => L.naturalWaistY - 0.005,
  gait: { strideScale: 0.74, cadenceScale: 1.1, stepWidth: 0.03 },
});
add({
  id: 'skirt_pleated', gait: { armOut: 3 }, label: 'Pleated midi skirt', slot: 'bottom', layer: 3,
  materials: ['silk', 'chiffon', 'cotton', 'wool'], patterns: ['solid', 'polka', 'floral', 'tartan'],
  defaults: { material: 'silk', color: '#a3263a' },
  build: (w, o) => buildSkirt(w, o, { top: 'waist', length: 0.7, flare: 0.3, sim: true, pleats: 28, rows: 22, gather: 1.25 }),
  waist: (L) => L.naturalWaistY - 0.005,
});
add({
  id: 'skirt_maxi', label: 'Flowing maxi skirt', slot: 'bottom', layer: 3,
  materials: ['chiffon', 'silk', 'linen', 'cotton'], patterns: ['solid', 'floral', 'polka', 'stripes'],
  defaults: { material: 'chiffon', color: '#e9c46a', pattern: 'floral', color2: '#f4e8c1' },
  build: (w, o) => buildSkirt(w, o, { top: 'waist', length: 0.98, flare: 0.22, sim: true, rows: 26, gather: 1.25 }),
  waist: (L) => L.naturalWaistY - 0.005,
  gait: { strideScale: 0.95 },
});

// ============================================================================ dresses (bodice + skirt)
function bodice(o) {
  return {
    field: (s) => topField(s, { neck: o.neck, hemY: (L) => L.naturalWaistY - 0.035 - (o.drop || 0), sleeve: o.sleeve ?? null, straps: o.straps }),
    offset: (s) => (o.off || 0.0035) + (o.ease || 0.005) * smoothstep(1.2, 1.03, s.y) + 0.004 * s.arm,
    smooth: o.smooth ?? 16, hem: 0.0, minOffset: 0.002,
    reshape: compose(o.sleeveR ? sleeveReshape(o.sleeveR) : null, o.noDrape ? null : drape(0.3)),
  };
}
add({
  id: 'dress_slip', label: 'Silk slip dress', slot: 'dress', layer: 3, replaces: ['top', 'bottom'],
  materials: ['silk', 'chiffon', 'jersey'], patterns: ['solid', 'polka', 'floral', 'leopard'],
  defaults: { material: 'silk', color: '#5b3e2b' },
  build: (w, o) => buildSkirt(w, o, { top: 'waist', length: 0.72, flare: 0.16, sim: true, rows: 22, gather: 1.15,
    bodice: bodice({ neck: { type: 'v', depth: 0.15, width: 0.12, back: 0.15, backWidth: 0.14 }, straps: { x: 0.092, w: 0.0035, cut: 0.045, backCut: -0.05 }, ease: 0.008, smooth: 20 }) }),
});
add({
  id: 'dress_sun', gait: { armOut: 3 }, hides: ['bra'], label: 'Summer tea dress', slot: 'dress', layer: 3, replaces: ['top', 'bottom'],
  materials: ['cotton', 'linen', 'chiffon', 'silk'], patterns: ['floral', 'gingham', 'polka', 'solid', 'stripes'],
  defaults: { material: 'cotton', color: '#f4e8c1', pattern: 'floral', color2: '#d1495b' },
  build: (w, o) => buildSkirt(w, o, { top: 'waist', length: 0.56, flare: 0.3, sim: true, rows: 20, gather: 1.35,
    bodice: bodice({ neck: { type: 'square', depth: 0.1, width: 0.1, back: 0.04, backWidth: 0.1 }, sleeve: 0.11, sleeveR: (u) => (u < 0.4 ? 0 : 0.062), ease: 0.006 }) }),
});
add({
  id: 'dress_knit', hides: ['bra'], label: 'Ribbed bodycon dress', slot: 'dress', layer: 3, replaces: ['top', 'bottom'],
  materials: ['jersey', 'cashmere', 'wool'], patterns: ['rib', 'solid', 'stripes'],
  defaults: { material: 'jersey', color: '#7a1f2b', pattern: 'rib' },
  build: (w, o) => buildSkirt(w, o, { top: 'waist', length: 0.5, flare: 0.0, sim: true, rows: 18, stiffness: 1, tight: true, ease: 0.014,
    bodice: bodice({ neck: { depth: 0.03, width: 0.07, back: 0.01, backWidth: 0.07 }, sleeve: 0.49, off: 0.0022, ease: 0.0, smooth: 8, noDrape: true }) }),
  gait: { strideScale: 0.86, cadenceScale: 1.05 },
});
add({
  id: 'dress_evening', label: 'Evening gown', slot: 'dress', layer: 3, replaces: ['top', 'bottom'],
  materials: ['silk', 'chiffon', 'jersey'], patterns: ['solid'],
  defaults: { material: 'silk', color: '#111114' },
  build: (w, o) => buildSkirt(w, o, { top: 'waist', length: 1.0, flare: 0.1, sim: true, rows: 28, gather: 1.08, slit: 0.32,
    bodice: bodice({ neck: { type: 'v', depth: 0.17, width: 0.1, back: 0.22, backWidth: 0.12 }, sleeve: null, ease: 0.004, smooth: 14 }) }),
});

// ============================================================================ coats (fitted upper + simulated tails)
add({
  id: 'coat_trench', label: 'Trench coat', slot: 'outer', layer: 6, replaces: [], gait: { armOut: 4, armSwing: 0.85 },
  materials: ['cotton', 'leather', 'suede', 'wool'], patterns: ['solid', 'houndstooth', 'tartan'],
  defaults: { material: 'cotton', color: '#c2a878', detail: 5, button: '#3a2c20' },
  build: (w, o) => buildSkirt(w, o, { top: 'hipcoat', length: 0.5, flare: 0.22, sim: true, rows: 18, gather: 1.05, openFront: 0.03, layerOff: 0.03,
    bodice: {
      field: (s) => topField(s, { neck: { type: 'v', depth: 0.2, width: 0.1, back: 0.0, backWidth: 0.075 }, hemY: (L) => L.pelvis.y - 0.06, sleeve: 0.51, openFront: 0.004 }),
      offset: (s) => 0.022 + 0.012 * smoothstep(1.2, 1.0, s.y) + 0.004 * s.arm,
      smooth: 30, hem: 0.0, minOffset: 0.016,
      collar: { height: 0.05, flare: 0.04, minY: 1.37, maxX: 0.1, cz: -0.02 },
      reshape: compose(sleeveReshape((u) => (u < 0.2 ? 0 : 0.078)), drape(0.06, 0.012)),
    } }),
});
add({
  id: 'coat_wool', label: 'Long wool coat', slot: 'outer', layer: 6, replaces: [], gait: { armOut: 4.5, armSwing: 0.8 },
  materials: ['wool', 'tweed', 'cashmere'], patterns: ['solid', 'houndstooth', 'tartan'],
  defaults: { material: 'wool', color: '#8a6a4a', detail: 5, button: '#2b211c' },
  build: (w, o) => buildSkirt(w, o, { top: 'hipcoat', length: 0.58, flare: 0.16, sim: true, rows: 18, gather: 1.0, openFront: 0.025, layerOff: 0.034, heavy: true,
    bodice: {
      field: (s) => topField(s, { neck: { type: 'v', depth: 0.18, width: 0.1, back: 0.0, backWidth: 0.075 }, hemY: (L) => L.pelvis.y - 0.06, sleeve: 0.51, openFront: 0.004 }),
      offset: (s) => 0.026 + 0.012 * smoothstep(1.2, 1.0, s.y) + 0.005 * s.arm,
      smooth: 30, hem: 0.0, minOffset: 0.02,
      collar: { height: 0.055, flare: 0.045, minY: 1.37, maxX: 0.1, cz: -0.02 },
      reshape: compose(sleeveReshape((u) => (u < 0.2 ? 0 : 0.082)), drape(0.06, 0.014)),
    } }),
});

// ============================================================================ hosiery & socks
function hoseField(topY) {
  return (s) => {
    if (s.arm > 0.3 || s.hand > 0.2) return 1;
    return s.y - topY(s.L);
  };
}
add({
  id: 'tights_opaque', hides: ['briefs'], label: 'Opaque tights', slot: 'legwear', layer: 2,
  materials: ['nylon', 'microfiber'], patterns: ['solid', 'rib', 'polka'], colors: HOSIERY,
  defaults: { material: 'nylon', color: '#1a1717', sheer: 1, density: 0.86 },
  fitted: { field: hoseField((L) => L.pelvis.y + 0.04), offset: (s) => 0.0016 + 0.0004 * s.foot, smooth: 2, hem: 0 },
  sheerOptions: true,
});
add({
  id: 'pantyhose', label: 'Sheer pantyhose', slot: 'legwear', layer: 2,
  materials: ['nylon'], patterns: ['solid'], colors: HOSIERY,
  defaults: { material: 'nylon', color: '#b88c74', sheer: 1, density: 0.22 },
  fitted: { field: hoseField((L) => L.pelvis.y + 0.04), offset: (s) => 0.0016 + 0.0004 * s.foot, smooth: 2, hem: 0 },
  sheerOptions: true,
});
add({
  id: 'stockings', label: 'Lace-top stockings', slot: 'legwear', layer: 2,
  materials: ['nylon'], patterns: ['solid'], colors: HOSIERY,
  defaults: { material: 'nylon', color: '#1a1717', sheer: 1, density: 0.3 },
  fitted: { field: hoseField((L) => L.crotchY - 0.09), offset: (s) => 0.0016 + 0.0004 * s.foot, smooth: 2, hem: 0.001 },
  band: (L) => [L.crotchY - 0.155, L.crotchY - 0.09, 2, 1],
  sheerOptions: true,
});
add({
  id: 'fishnets', label: 'Fishnet tights', slot: 'legwear', layer: 2,
  materials: ['nylon'], patterns: ['solid'], colors: HOSIERY,
  defaults: { material: 'nylon', color: '#111111', sheer: 2, density: 0.0 },
  fitted: { field: hoseField((L) => L.pelvis.y + 0.04), offset: (s) => 0.0016 + 0.0004 * s.foot, smooth: 2, hem: 0 },
});
function sockField(topY) { return (s) => (s.leg < 0.3 ? 1 : s.y - topY(s.L)); }
add({
  id: 'socks_ankle', label: 'Ankle socks', slot: 'socks', layer: 2.5,
  materials: ['cotton', 'wool'], patterns: ['solid', 'stripes', 'polka'],
  defaults: { material: 'cotton', color: '#f7f5f0' },
  fitted: { field: sockField((L) => L.ankleL.y + 0.035), offset: () => 0.0028, smooth: 3, hem: 0.002 },
  band: (L) => [L.ankleL.y + 0.012, L.ankleL.y + 0.04, 1, 1],
});
add({
  id: 'socks_crew', label: 'Crew socks', slot: 'socks', layer: 2.5,
  materials: ['cotton', 'wool', 'cashmere'], patterns: ['solid', 'stripes', 'polka', 'tartan'],
  defaults: { material: 'wool', color: '#9aa3ad' },
  fitted: { field: sockField((L) => L.ankleL.y + 0.13), offset: () => 0.003, smooth: 3, hem: 0.002 },
  band: (L) => [L.ankleL.y + 0.09, L.ankleL.y + 0.135, 1, 1],
});
add({
  id: 'socks_knee', label: 'Over-the-knee socks', slot: 'socks', layer: 2.5,
  materials: ['wool', 'cotton', 'cashmere'], patterns: ['solid', 'stripes', 'rib'],
  defaults: { material: 'wool', color: '#2f3742', pattern: 'rib' },
  fitted: { field: sockField((L) => L.kneeL.y + 0.09), offset: () => 0.0028, smooth: 3, hem: 0.002 },
  band: (L) => [L.kneeL.y + 0.05, L.kneeL.y + 0.095, 1, 1],
});

// ============================================================================ shoes
for (const [id, st] of Object.entries(SHOE_STYLES)) {
  add({
    id, label: st.label, slot: 'shoes', layer: 2.8,
    materials: st.materials, patterns: ['solid'],
    defaults: { material: st.materials[0], color: st.color, color2: st.color2 },
    build: (w, o) => buildShoes(w, o, st),
    gait: st.gait,
  });
}

export const OUTFITS = {
  casual: { label: 'Casual', items: { top: ['tshirt', {}], bottom: ['jeans_straight', {}], shoes: ['sneakers', {}] } },
  breton: { label: 'Parisian', items: { top: ['breton', {}], bottom: ['skirt_mini', { color: '#2f3742', material: 'denim' }], legwear: ['tights_opaque', {}], shoes: ['flats', { color: '#111114' }] } },
  office: { label: 'Office', items: { top: ['blouse', {}], bottom: ['skirt_pencil', {}], legwear: ['pantyhose', {}], outer: ['blazer', {}], shoes: ['pumps', {}] } },
  evening: { label: 'Evening', items: { dress: ['dress_evening', {}], legwear: ['pantyhose', { color: '#1a1717', density: 0.18 }], shoes: ['stilettos', { color: '#111114', material: 'patent' }] } },
  summer: { label: 'Summer', items: { dress: ['dress_sun', {}], shoes: ['sandals', {}] } },
  autumn: { label: 'Autumn', items: { top: ['fitted_top', {}], layer: ['sweater', {}], bottom: ['skirt_pleated', { color: '#5b3e2b', material: 'wool' }], legwear: ['tights_opaque', {}], shoes: ['boots_knee', {}] } },
  rock: { label: 'Rock', items: { top: ['tshirt', { color: '#111114' }], bottom: ['jeans_skinny', { color: '#1a1a1d' }], outer: ['leather_jacket', {}], shoes: ['boots_ankle', {}] } },
  winter: { label: 'Winter', items: { top: ['breton', {}], layer: ['sweater', { color: '#5c6670' }], bottom: ['trousers_wide', { color: '#e9e1d3' }], outer: ['coat_wool', {}], shoes: ['loafers', {}] } },
};
