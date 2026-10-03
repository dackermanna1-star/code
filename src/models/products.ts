// Kitchen-made products (category 'product'): batter, doughs, egg dishes, pancakes, cake,
// flatbread, popcorn, frozen treats, drinks, soups and odd mixtures.
//
// Products are made by gameplay and carry `state.tint` (the colour of the mix) and `state.from`
// (what went in). Every model builds its whole form from the state in `variant()`; other forms
// return null there and fall through to the custom `forms` below or the generic cut builders
// (which use `profile`, `sectionV`, `skin` and `flesh`). `build()` runs the same code with a
// pretty default recipe (thumbnails / the model viewer). Containers come from ./containers.
//
// Disc-style products (pancake, cake, flatbread, fried egg, omelet) provide a `skin()` whose
// texture is indexed by the profile point (LatheGeometry v = index / (n - 1)), so generic wedges
// show the right colours on their outside (cake layers, golden pancake tops, the egg yolk).

import * as THREE from 'three';
import type { FoodState } from '../food/types';
import { emptyCook } from '../food/types';
import { getDef, hasDef } from '../food/catalog';
import type { ModelDef, ModelTable, SectionOpts } from './types';
import {
  type Rng,
  type Profile,
  foodMat,
  lazy,
  canvasTexture,
  fbm3,
  blobGeometry,
  sweepGeometry,
  curveThrough,
  sitOnGround,
  merge,
  paintVertices,
  deform,
  roundedBox,
  leafGeometry,
  smoothProfile,
  bumpNoiseTexture,
  noisify,
  smoothNormals,
  rng,
  specks,
} from './kit';
import { servingBowl, drinkGlass, mug, smallDish, liquidFill, fillY, revolve, fillet, paintPlanar, PASTEL, type Vessel, type Pt } from './containers';

// ---------------------------------------------------------------------------------------------
// Small utilities

const TAU = Math.PI * 2;
const clamp01 = (x: number) => (x < 0 ? 0 : x > 1 ? 1 : x);
function sstep(e0: number, e1: number, x: number): number {
  const t = clamp01((x - e0) / (e1 - e0));
  return t * t * (3 - 2 * t);
}
const isHex = (h: unknown): h is string => typeof h === 'string' && /^#([0-9a-f]{3}){1,2}$/i.test(h);
const toHex = (c: THREE.Color) => '#' + c.getHexString();
function mixHex(a: string, b: string, t: number): string {
  return toHex(new THREE.Color(a).lerp(new THREE.Color(b), clamp01(t)));
}
/** Scale HSL lightness / saturation. */
function adjust(hex: string, l = 1, s = 1): string {
  const c = new THREE.Color(hex);
  const hsl = { h: 0, s: 0, l: 0 };
  c.getHSL(hsl);
  c.setHSL(hsl.h, clamp01(hsl.s * s), clamp01(hsl.l * l));
  return toHex(c);
}
function lightness(hex: string): number {
  const hsl = { h: 0, s: 0, l: 0 };
  new THREE.Color(hex).getHSL(hsl);
  return hsl.l;
}
type RGB = [number, number, number];
function rgb(hex: string): RGB {
  const t = { r: 0, g: 0, b: 0 };
  new THREE.Color(hex).getRGB(t, THREE.SRGBColorSpace);
  return [t.r * 255, t.g * 255, t.b * 255];
}
const lerp3 = (a: RGB, b: RGB, t: number): RGB => [a[0] + (b[0] - a[0]) * t, a[1] + (b[1] - a[1]) * t, a[2] + (b[2] - a[2]) * t];
const css = (c: RGB, a = 1) => `rgba(${c[0] | 0},${c[1] | 0},${c[2] | 0},${a})`;

const Y_UP = new THREE.Vector3(0, 1, 0);
const _m4 = new THREE.Matrix4();
type V3 = [number, number, number];

/** Clone a geometry with a baked transform. */
function placed(g: THREE.BufferGeometry, pos: V3 | THREE.Vector3, rot?: THREE.Quaternion | V3, scale: number | V3 = 1): THREE.BufferGeometry {
  const p = Array.isArray(pos) ? new THREE.Vector3(...pos) : pos;
  const q = rot instanceof THREE.Quaternion ? rot : new THREE.Quaternion().setFromEuler(new THREE.Euler(...(rot ?? [0, 0, 0])));
  const s = typeof scale === 'number' ? new THREE.Vector3(scale, scale, scale) : new THREE.Vector3(...scale);
  const c = g.clone();
  c.applyMatrix4(_m4.compose(p, q, s));
  return c;
}

function randDir(r: Rng): THREE.Vector3 {
  const z = r.range(-1, 1), a = r.range(0, TAU), s = Math.sqrt(1 - z * z);
  return new THREE.Vector3(Math.cos(a) * s, z, Math.sin(a) * s);
}

function colored(g: THREE.BufferGeometry, hex: string): THREE.BufferGeometry {
  const c = new THREE.Color(hex);
  return paintVertices(g, () => c);
}

/** Collects geometry per material and merges it into a few meshes. */
class Batch {
  private parts = new Map<THREE.Material, THREE.BufferGeometry[]>();
  add(mat: THREE.Material, g: THREE.BufferGeometry) {
    let l = this.parts.get(mat);
    if (!l) this.parts.set(mat, (l = []));
    l.push(g);
    return this;
  }
  addTo(group: THREE.Object3D) {
    for (const [mat, list] of this.parts) {
      const m = new THREE.Mesh(list.length === 1 ? list[0] : merge(list), mat);
      m.castShadow = true;
      m.receiveShadow = true;
      group.add(m);
    }
    return group;
  }
}

function meshOf(g: THREE.BufferGeometry, m: THREE.Material | THREE.Material[], name?: string): THREE.Mesh {
  const o = new THREE.Mesh(g, m);
  o.castShadow = true;
  o.receiveShadow = true;
  if (name) o.name = name;
  return o;
}

const matCache = new Map<string, THREE.Material>();
function cmat(key: string, make: () => THREE.Material): THREE.Material {
  let m = matCache.get(key);
  if (!m) matCache.set(key, (m = make()));
  return m;
}

/** Non-food glossy plastic / wood / ice (never browns). */
function propMat(color: string, roughness = 0.4, extra: { clearcoat?: number; map?: THREE.Texture; key?: string } = {}): THREE.Material {
  return cmat(`prop:${color}:${roughness}:${extra.clearcoat ?? -1}:${extra.key ?? ''}`, () =>
    foodMat({ color, roughness, clearcoat: extra.clearcoat, map: extra.map ?? null, food: false, cookAmount: 0 }),
  );
}

/** Plain food material by colour (bits, chunks, garnish). */
function bitMat(color: string, roughness = 0.5, cooked = '#8a5a2a', gloss = 0): THREE.Material {
  return cmat(`bit:${color}:${roughness}:${gloss}`, () =>
    foodMat({ color, flesh: color, cookColor: cooked, roughness, clearcoat: gloss > 0 ? gloss : undefined, clearcoatRoughness: 0.2 }),
  );
}

/** Vertex-coloured food material (one per look). */
function vcMat(key: string, p: { roughness?: number; clearcoat?: number; flesh: string; cooked: string; cookAmount?: number; sheen?: number; bump?: THREE.Texture; bumpScale?: number }): THREE.Material {
  return cmat('vc:' + key, () =>
    foodMat({
      color: '#ffffff',
      vertexColors: true,
      roughness: p.roughness ?? 0.5,
      clearcoat: p.clearcoat,
      clearcoatRoughness: 0.25,
      sheen: p.sheen,
      sheenColor: '#ffffff',
      sheenRoughness: 0.5,
      flesh: p.flesh,
      cookColor: p.cooked,
      cookAmount: p.cookAmount,
      bumpMap: p.bump ?? null,
      bumpScale: p.bumpScale ?? 1,
    }),
  );
}

// ---------------------------------------------------------------------------------------------
// Product state context

interface Ctx {
  id: string;
  state: FoodState;
  r: Rng;
  /** state.tint, or the default colour. */
  tint: string;
  /** True when the state carries its own tint. */
  tinted: boolean;
  /** Ingredient ids that went in (flattened, de-duplicated); the default recipe when `from` is missing. */
  ids: string[];
  /** No `from`: showcase defaults (thumbnails, viewer). */
  isDefault: boolean;
  /** 0.15..1: how much is left (liquid levels). */
  amount: number;
  cooked: string;
}

/** Default recipes (and tints) used when a state has no `from` (thumbnails / the viewer). */
const DEFAULTS: Record<string, { from: string[]; tint?: string }> = {
  batter: { from: ['flour', 'egg', 'milk'] },
  'cookie-dough': { from: ['flour', 'butter', 'chocolate'] },
  'beaten-egg': { from: ['egg'] },
  'sweet-cream': { from: ['cream'] },
  'whipped-cream': { from: ['cream'] },
  pancake: { from: ['flour', 'egg', 'milk', 'butter'] },
  cake: { from: ['flour', 'egg', 'strawberry'], tint: '#fff0d9' },
  flatbread: { from: ['flour'] },
  'fried-egg': { from: ['egg'] },
  'scrambled-eggs': { from: ['egg', 'basil'] },
  omelet: { from: ['egg', 'cheese', 'tomato', 'basil'] },
  popcorn: { from: ['corn'] },
  icepop: { from: ['strawberry', 'mango', 'lemon'] },
  scoops: { from: ['strawberry', 'ice-cream', 'chocolate'] },
  drink: { from: ['strawberry', 'ice-cream', 'milk'], tint: '#f6a6bd' },
  soup: { from: ['pumpkin', 'carrot', 'peas', 'basil', 'cream'], tint: '#ef9a3c' },
  mixture: { from: ['banana', 'blueberry', 'nuts'], tint: '#e3c58c' },
};

/** Flattened ingredient ids of a product (nested products expanded; the products themselves kept). */
export function ingredientsOf(state: FoodState): string[] {
  const out: string[] = [];
  const seen = new Set<string>();
  const walk = (list: FoodState[] | undefined, depth: number) => {
    for (const f of list ?? []) {
      if (!f) continue;
      if (f.id === 'assembly') {
        if (depth < 5) walk(f.parts, depth + 1);
        continue;
      }
      if (hasDef(f.id) && !seen.has(f.id)) {
        seen.add(f.id);
        out.push(f.id);
      }
      if (depth < 5) walk(f.from, depth + 1);
    }
  };
  walk(state.from, 0);
  return out;
}

const amountOf = (s: FoodState) => THREE.MathUtils.clamp(s.amount ?? 1, 0.15, 1);

/** Average "juice" colour of some ingredients (fallback tint for mixes without one). */
function blendJuice(ids: string[], fallback: string): string {
  const cols = ids.filter(hasDef).map((id) => getDef(id).colors.juice ?? getDef(id).colors.flesh);
  if (!cols.length) return fallback;
  const c = new THREE.Color(0, 0, 0);
  for (const h of cols) c.add(new THREE.Color(h));
  c.multiplyScalar(1 / cols.length);
  return toHex(c);
}

function ctxOf(id: string, state: FoodState, r: Rng, blend = false): Ctx {
  const def = getDef(id);
  const d = DEFAULTS[id] ?? { from: [] };
  const isDefault = !state.from || state.from.length === 0;
  const ids = isDefault ? d.from.filter(hasDef) : ingredientsOf(state);
  const tinted = isHex(state.tint);
  let tint: string;
  if (tinted) tint = state.tint!;
  else if (isDefault && d.tint) tint = d.tint;
  else if (blend && !isDefault) tint = blendJuice(ids.filter((i) => getDef(i).category !== 'product'), def.colors.flesh);
  else tint = def.colors.flesh;
  return { id, state, r, tint, tinted, ids, isDefault, amount: amountOf(state), cooked: def.colors.cooked ?? '#a86a2c' };
}

function defaultState(id: string): FoodState {
  return { id, form: 'whole', cook: emptyCook(), season: {}, seed: 7 };
}

const has = (c: Ctx, ...ids: string[]) => ids.some((i) => c.ids.includes(i));
const hasTagged = (c: Ctx, tag: string) => c.ids.some((i) => hasDef(i) && (getDef(i).tags as string[]).includes(tag));
const fruitsOf = (c: Ctx) => c.ids.filter((i) => hasDef(i) && getDef(i).category === 'fruit');
/** Real candy went in (chocolate is tagged 'candy' too, but gets its own chips / curls). */
const hasCandy = (c: Ctx) => c.ids.some((i) => hasDef(i) && i !== 'marshmallow' && getDef(i).tags.includes('candy') && !getDef(i).tags.includes('chocolate'));

/** Ingredients that show up as visible bits in soups / mixtures / fillings. */
const NOT_BITS = new Set(['egg', 'butter', 'flour', 'milk', 'cream', 'yogurt', 'ice-cream', 'batter', 'beaten-egg', 'sweet-cream', 'whipped-cream', 'soup', 'drink', 'mixture', 'rice', 'spaghetti']);
function solidBits(c: Ctx): string[] {
  return c.ids.filter((i) => {
    if (!hasDef(i) || NOT_BITS.has(i)) return false;
    const d = getDef(i);
    return !d.tags.includes('liquid') && !d.tags.includes('powder');
  });
}
const isGreenHerb = (id: string) => hasDef(id) && (getDef(id).tags.includes('herb') || getDef(id).tags.includes('leafy')) && id !== 'garlic';

// ---------------------------------------------------------------------------------------------
// Shared little pieces: chunks, berries, garnish, sprinkles, curls

const chunkGeo = lazy(() => roundedBox(1, 1, 1, 0.26, 1));
const pebbleGeo = lazy(() => noisify(new THREE.IcosahedronGeometry(0.5, 2), 0.06, 3.2, 2));
const ballGeo = lazy(() => new THREE.SphereGeometry(0.5, 12, 9));

/** A bit of an ingredient for soups / fillings / toppings: [geometry (unit size), colour, kind]. */
function bitOf(id: string, r: Rng): { geo: THREE.BufferGeometry; color: string; kind: 'chunk' | 'ball' | 'leaf' | 'pebble' } {
  const d = getDef(id);
  if (isGreenHerb(id)) return { geo: herbLeafGeo(), color: d.colors.skin, kind: 'leaf' };
  if (d.cut === 'bunch' && !['broccoli', 'shrimp', 'crab', 'marshmallow', 'gummy', 'nuts'].includes(id)) return { geo: ballGeo(), color: id === 'peas' ? d.colors.skin : d.colors.skin, kind: 'ball' };
  if (id === 'nuts' || id === 'broccoli') return { geo: pebbleGeo(), color: id === 'broccoli' ? d.colors.skin : d.colors.flesh, kind: 'pebble' };
  if (d.category === 'meat' || d.category === 'seafood') return { geo: chunkGeo(), color: d.colors.cooked ? mixHex(d.colors.flesh, d.colors.cooked, 0.45) : d.colors.flesh, kind: 'chunk' };
  void r;
  return { geo: chunkGeo(), color: d.colors.flesh, kind: 'chunk' };
}

const herbLeafGeo = lazy(() => {
  const g = leafGeometry({ length: 1, width: 0.62, curl: 0.25, fold: 0.18, segments: 6 });
  g.translate(0, 0, -0.45);
  return g;
});

/** Tiny leafy herb garnish (a few leaves around a point), merged into a batch. */
function herbSprig(b: Batch, r: Rng, at: V3, size: number, color = '#4f9e38') {
  const mat = bitMat(color, 0.45, '#2a4a1a', 0.2);
  const n = r.int(3, 4);
  const a0 = r.range(0, TAU);
  for (let i = 0; i < n; i++) {
    const a = a0 + (i / n) * TAU + r.range(-0.3, 0.3);
    const q = new THREE.Quaternion().setFromEuler(new THREE.Euler(r.range(-0.35, -0.1), a, 0, 'YXZ'));
    const s = size * r.range(0.8, 1.15);
    b.add(mat, placed(herbLeafGeo(), [at[0], at[1] + 0.0008 * i, at[2]], q, s));
  }
}

const strawberryTex = lazy(() =>
  canvasTexture(
    128,
    128,
    (ctx, w, h) => {
      const g = ctx.createLinearGradient(0, 0, 0, h);
      g.addColorStop(0, '#d61a33'); // tip (v = 1 at the top of the canvas)
      g.addColorStop(0.75, '#e32a3c');
      g.addColorStop(1, '#f0605a'); // shoulder
      ctx.fillStyle = g;
      ctx.fillRect(0, 0, w, h);
      for (let row = 0; row < 9; row++)
        for (let k = 0; k < 9; k++) {
          const x = ((k + (row % 2) * 0.5) / 9) * w, y = (row + 0.6) * (h / 9.6);
          ctx.fillStyle = 'rgba(150,10,25,0.55)';
          ctx.beginPath();
          ctx.ellipse(x, y, 3.2, 4.2, 0, 0, TAU);
          ctx.fill();
          ctx.fillStyle = '#f7d86a';
          ctx.beginPath();
          ctx.ellipse(x, y - 0.6, 1.4, 2.1, 0, 0, TAU);
          ctx.fill();
        }
    },
    { key: 'prod:strawberry-seeds' },
  ),
);
const strawberryMat = lazy(() => foodMat({ color: '#ffffff', map: strawberryTex(), roughness: 0.28, clearcoat: 0.8, clearcoatRoughness: 0.12, flesh: '#f26a74', cookColor: '#9a1a2a' }));
/** Strawberry body profile: shoulder (stem end) at y = 0, tip at the top. */
const STRAWBERRY_PTS: Profile = [
  [0.0001, 0],
  [0.0065, 0.0012],
  [0.0112, 0.006],
  [0.0112, 0.0115],
  [0.0082, 0.0185],
  [0.0036, 0.024],
  [0.0001, 0.0262],
];
const strawberryGeo = lazy(() => revolve(smoothProfile(STRAWBERRY_PTS, 12), { segments: 14 }));
/** Green calyx (star of sepals) for a strawberry whose shoulder is at the origin, facing -y. */
const calyxGeo = lazy(() => {
  const parts: THREE.BufferGeometry[] = [];
  for (let i = 0; i < 6; i++) {
    const l = leafGeometry({ length: 0.011, width: 0.005, curl: -0.4, segments: 4 });
    parts.push(placed(l, [0, 0, 0], new THREE.Quaternion().setFromEuler(new THREE.Euler(0.25, (i / 6) * TAU, 0, 'YXZ'))));
  }
  const stem = new THREE.CylinderGeometry(0.0009, 0.0012, 0.006, 6, 1);
  stem.translate(0, 0.003, 0);
  parts.push(stem);
  const g = merge(parts);
  g.rotateX(Math.PI); // sepals point down the berry (berry tip at -y after flipping)
  return g;
});

const blueberryMat = lazy(() => foodMat({ color: '#3d4f9e', flesh: '#6b5a8e', cookColor: '#2a2050', roughness: 0.42, sheen: 0.9, sheenColor: '#a9b8e8', sheenRoughness: 0.45 }));
const cherryMat = lazy(() => foodMat({ color: '#c8142c', flesh: '#c81a2c', cookColor: '#5a0a14', roughness: 0.16, clearcoat: 1, clearcoatRoughness: 0.05 }));
const stemMat = lazy(() => foodMat({ color: '#7a8a2a', flesh: '#7a8a2a', cookColor: '#4a3a1a', roughness: 0.6 }));
const cherryGeo = lazy(() => {
  const prof = smoothProfile(
    [
      [0.0001, 0.0005],
      [0.006, 0],
      [0.0108, 0.006],
      [0.0108, 0.0125],
      [0.0068, 0.0182],
      [0.0015, 0.0172],
      [0.0001, 0.0166],
    ],
    14,
  );
  return revolve(prof, { segments: 16 });
});
/** Cherry with a curved stem, resting on its bottom at the origin. */
function cherry(b: Batch, at: V3, r: Rng, scale = 1) {
  const q = new THREE.Quaternion().setFromEuler(new THREE.Euler(r.range(-0.15, 0.15), r.range(0, TAU), r.range(-0.15, 0.15)));
  b.add(cherryMat(), placed(cherryGeo(), at, q, scale));
  const k = scale;
  const stem = sweepGeometry(curveThrough([[0, 0.016 * k, 0], [0.002 * k, 0.026 * k, 0], [0.007 * k, 0.034 * k, 0.001 * k], [0.012 * k, 0.037 * k, 0.002 * k]]), {
    radius: 0.0009 * k,
    radialSegments: 5,
    tubularSegments: 8,
    caps: 'flat',
  });
  b.add(stemMat(), placed(stem, at, q));
}

/** Rainbow sprinkles scattered on a surface; place(i) returns position + up normal. */
const SPRINKLE_COLORS = ['#ff5fa8', '#ffd23f', '#5fd3ff', '#8fe07a', '#b48cff', '#ffffff', '#ff8a4a'];
const sprinkleGeo = lazy(() => new THREE.CylinderGeometry(0.0009, 0.0009, 0.005, 5, 1, false));
const sprinkleMat = lazy(() => foodMat({ color: '#ffffff', vertexColors: true, roughness: 0.35, clearcoat: 0.5, flesh: '#ff9ac8', cookColor: '#a0603a' }));
function sprinkles(b: Batch, r: Rng, n: number, place: (i: number) => { p: THREE.Vector3; n: THREE.Vector3 } | null) {
  const geos: THREE.BufferGeometry[] = [];
  for (let i = 0; i < n; i++) {
    const s = place(i);
    if (!s) continue;
    const q = new THREE.Quaternion().setFromUnitVectors(Y_UP, s.n);
    const lie = new THREE.Quaternion().setFromEuler(new THREE.Euler(Math.PI / 2, r.range(0, TAU), 0, 'YXZ'));
    q.multiply(lie);
    geos.push(colored(placed(sprinkleGeo(), s.p.clone().addScaledVector(s.n, 0.0006), q), r.pick(SPRINKLE_COLORS)));
  }
  if (geos.length) b.add(sprinkleMat(), merge(geos));
}

const chocoMat = lazy(() => foodMat({ color: '#5a2f18', flesh: '#4a2614', cookColor: '#2a1408', roughness: 0.32, clearcoat: 0.6, clearcoatRoughness: 0.2 }));
const chipGeo = lazy(() =>
  revolve(
    smoothProfile(
      [
        [0.0001, 0],
        [0.0043, 0],
        [0.0045, 0.0012],
        [0.0026, 0.0036],
        [0.0007, 0.0055],
        [0.0001, 0.006],
      ],
      6,
    ),
    { segments: 7 },
  ),
);
/** Chocolate shaving curl (a curled flat ribbon). */
function chocoCurl(r: Rng, tubular = 14, radial = 6): THREE.BufferGeometry {
  const pts: V3[] = [];
  const turns = r.range(1.2, 1.9), rad = r.range(0.0022, 0.0032), len = r.range(0.012, 0.018);
  for (let i = 0; i <= 10; i++) {
    const t = i / 10, a = t * turns * TAU;
    pts.push([Math.cos(a) * rad, Math.sin(a) * rad, (t - 0.5) * len]);
  }
  return sweepGeometry(curveThrough(pts), { radius: 0.0016, squash: [1, 0.28], radialSegments: radial, tubularSegments: tubular, caps: 'flat' });
}

// Fruit garnish: wheels & wedges painted from the catalogue colours
function wheelKind(id: string): 'citrus' | 'kiwi' | 'banana' | 'core' | 'plain' {
  const d = getDef(id);
  if (d.tags.includes('citrus')) return 'citrus';
  if (id === 'kiwi') return 'kiwi';
  if (id === 'banana') return 'banana';
  if (id === 'apple' || id === 'pear') return 'core';
  return 'plain';
}
function wheelTexture(id: string): THREE.Texture {
  const d = getDef(id);
  const kind = wheelKind(id);
  return canvasTexture(
    128,
    128,
    (ctx, s) => {
      const c = s / 2;
      const flesh = d.colors.flesh;
      ctx.fillStyle = kind === 'banana' ? adjust(flesh, 0.97) : d.colors.skin;
      ctx.beginPath();
      ctx.arc(c, c, c, 0, TAU);
      ctx.fill();
      const inner = kind === 'banana' ? c * 0.96 : kind === 'citrus' ? c * 0.86 : c * 0.9;
      if (kind === 'citrus') {
        ctx.fillStyle = '#fffbe8';
        ctx.beginPath();
        ctx.arc(c, c, inner, 0, TAU);
        ctx.fill();
        const n = 10;
        for (let i = 0; i < n; i++) {
          const a0 = (i / n) * TAU + 0.035, a1 = ((i + 1) / n) * TAU - 0.035;
          const g = ctx.createRadialGradient(c, c, inner * 0.1, c, c, inner * 0.92);
          g.addColorStop(0, adjust(flesh, 1.12, 0.8));
          g.addColorStop(1, flesh);
          ctx.fillStyle = g;
          ctx.beginPath();
          ctx.moveTo(c + Math.cos((a0 + a1) / 2) * inner * 0.12, c + Math.sin((a0 + a1) / 2) * inner * 0.12);
          ctx.arc(c, c, inner * 0.9, a0, a1);
          ctx.closePath();
          ctx.fill();
          // juice vesicle streaks
          ctx.strokeStyle = 'rgba(255,255,255,0.35)';
          ctx.lineWidth = 1;
          for (let k = 0; k < 3; k++) {
            const a = a0 + ((a1 - a0) * (k + 1)) / 4;
            ctx.beginPath();
            ctx.moveTo(c + Math.cos(a) * inner * 0.3, c + Math.sin(a) * inner * 0.3);
            ctx.lineTo(c + Math.cos(a) * inner * 0.8, c + Math.sin(a) * inner * 0.8);
            ctx.stroke();
          }
        }
        ctx.fillStyle = '#fffbe8';
        ctx.beginPath();
        ctx.arc(c, c, inner * 0.1, 0, TAU);
        ctx.fill();
      } else {
        const g = ctx.createRadialGradient(c, c, 0, c, c, inner);
        g.addColorStop(0, adjust(flesh, kind === 'kiwi' ? 1.35 : 1.06, kind === 'kiwi' ? 0.5 : 1));
        g.addColorStop(kind === 'kiwi' ? 0.3 : 0.6, flesh);
        g.addColorStop(1, adjust(flesh, 0.95));
        ctx.fillStyle = g;
        ctx.beginPath();
        ctx.arc(c, c, inner, 0, TAU);
        ctx.fill();
        if (kind === 'kiwi') {
          ctx.fillStyle = '#1e1a12';
          for (let i = 0; i < 26; i++) {
            const a = (i / 26) * TAU;
            ctx.beginPath();
            ctx.ellipse(c + Math.cos(a) * inner * 0.42, c + Math.sin(a) * inner * 0.42, 2.6, 1.3, a, 0, TAU);
            ctx.fill();
          }
        } else if (kind === 'banana') {
          ctx.fillStyle = 'rgba(140,110,60,0.45)';
          for (let i = 0; i < 3; i++) {
            const a = (i / 3) * TAU + 0.5;
            ctx.beginPath();
            ctx.arc(c + Math.cos(a) * 6, c + Math.sin(a) * 6, 2.2, 0, TAU);
            ctx.fill();
          }
        } else if (kind === 'core') {
          ctx.strokeStyle = 'rgba(200,180,120,0.6)';
          ctx.lineWidth = 2;
          ctx.beginPath();
          for (let i = 0; i <= 5; i++) {
            const a = (i / 5) * TAU - Math.PI / 2;
            const rr = inner * 0.32;
            if (i === 0) ctx.moveTo(c + Math.cos(a) * rr, c + Math.sin(a) * rr);
            else ctx.lineTo(c + Math.cos(a) * rr, c + Math.sin(a) * rr);
          }
          ctx.stroke();
          ctx.fillStyle = '#4a2a14';
          for (let i = 0; i < 5; i++) {
            const a = (i / 5) * TAU - Math.PI / 2 + 0.6;
            ctx.beginPath();
            ctx.ellipse(c + Math.cos(a) * inner * 0.2, c + Math.sin(a) * inner * 0.2, 3, 1.6, a, 0, TAU);
            ctx.fill();
          }
        }
      }
    },
    { key: 'prod:wheel:' + id },
  );
}
const wheelGeo = lazy(() => new THREE.CylinderGeometry(1, 1, 1, 26, 1));
/** A fruit wheel (radius rw, thickness th) standing in the x-y plane (normal = z), centre at origin. */
function fruitWheel(id: string, rw: number, th: number): THREE.Group {
  const d = getDef(id);
  const face = cmat('wheelface:' + id, () => foodMat({ color: '#ffffff', map: wheelTexture(id), roughness: 0.3, clearcoat: 0.6, flesh: d.colors.flesh, cookColor: d.colors.cooked }));
  const rind = bitMat(wheelKind(id) === 'banana' ? d.colors.flesh : d.colors.skin, 0.4, d.colors.cooked ?? '#8a5a2a', 0.3);
  const m = meshOf(wheelGeo(), [rind, face, face]);
  m.scale.set(rw, th, rw);
  m.rotation.x = Math.PI / 2;
  const holder = new THREE.Group();
  holder.add(m);
  return holder;
}

/** Fruit wedge (pie slice of a fat wheel) with a rind on the arc; apex at origin pointing -x. */
function fruitWedge(id: string, rad: number, th: number, angle = 0.95): THREE.Group {
  const d = getDef(id);
  const rindW = id === 'watermelon' ? rad * 0.16 : rad * 0.08;
  const flesh = cmat('wedgeflesh:' + id, () => {
    const tex =
      id === 'watermelon'
        ? canvasTexture(
            64,
            64,
            (ctx, w, h) => {
              ctx.fillStyle = d.colors.flesh;
              ctx.fillRect(0, 0, w, h);
              ctx.fillStyle = '#2a1a14';
              for (let i = 0; i < 7; i++) {
                ctx.beginPath();
                ctx.ellipse(10 + ((i * 37) % 44), 12 + ((i * 23) % 40), 2.2, 3.4, i, 0, TAU);
                ctx.fill();
              }
            },
            { key: 'prod:wm-seeds' },
          )
        : null;
    return foodMat({ color: tex ? '#ffffff' : d.colors.flesh, map: tex, roughness: 0.32, clearcoat: 0.5, flesh: d.colors.flesh, cookColor: d.colors.cooked });
  });
  const rindM = bitMat(d.colors.skin, 0.45, d.colors.cooked ?? '#8a5a2a', 0.2);
  const shape = (r0: number, r1: number) => {
    const s = new THREE.Shape();
    const a0 = -angle / 2, a1 = angle / 2;
    s.moveTo(Math.cos(a0) * r0, Math.sin(a0) * r0);
    s.absarc(0, 0, r1, a0, a1, false);
    if (r0 < 1e-5) s.lineTo(0, 0);
    else s.absarc(0, 0, r0, a1, a0, true);
    return s;
  };
  const ex = (s: THREE.Shape) => {
    const g = new THREE.ExtrudeGeometry(s, { depth: th, bevelEnabled: true, bevelThickness: th * 0.12, bevelSize: th * 0.12, bevelSegments: 2, curveSegments: 10 });
    g.translate(0, 0, -th / 2);
    smoothNormals(g);
    return g;
  };
  const g = new THREE.Group();
  g.add(meshOf(ex(shape(0, rad - rindW)), flesh), meshOf(ex(shape(rad - rindW, rad)), rindM));
  return g;
}

// ---------------------------------------------------------------------------------------------
// Liquids & puddles

/** Planar "puddle" of liquid: a domed blob with an irregular outline, resting on y = 0. */
function puddleGeometry(o: { radius: number; height: number; seed: number; wobble?: number; lobes?: number; dome?: number; segments?: number; rings?: number; ripple?: number }) {
  const rings = o.rings ?? 10;
  const segs = o.segments ?? 56;
  const wob = o.wobble ?? 0.08;
  const s = o.seed;
  const outline = (th: number) => o.radius * (1 + wob * fbm3(Math.cos(th) * 1.4 + s, Math.sin(th) * 1.4 - s, s * 0.37, 3) * 1.6 + (o.lobes ? 0.05 * Math.sin(o.lobes * th + s) : 0));
  const prof: Profile = [[0, 0], [1, 0]];
  for (let k = 0; k <= rings; k++) {
    const u = Math.pow(k / rings, 1.7);
    const rho = 1 - u;
    const y = Math.pow(Math.max(0, 1 - Math.pow(rho, 6)), 0.5) * (1 + (o.dome ?? 0.15) * (1 - rho * rho));
    prof.push([Math.max(0, rho), y]);
  }
  const heightAt = (x: number, z: number) => {
    const th = Math.atan2(x, z);
    const rho = Math.hypot(x, z) / outline(th);
    if (rho >= 1) return 0;
    const ripple = o.ripple ? o.ripple * fbm3(x * 90 + s, z * 90, s) : 0;
    return o.height * (Math.pow(1 - Math.pow(rho, 6), 0.5) * (1 + (o.dome ?? 0.15) * (1 - rho * rho))) + ripple * (1 - rho);
  };
  const geo = revolve(prof, {
    segments: segs,
    uv: 'planar',
    planar: o.radius * 1.35,
    map: (j, th, r, y) => {
      const R = outline(th);
      if (j < 2) return [r * R, 0];
      const x = r * R * Math.sin(th), z = r * R * Math.cos(th);
      const ripple = o.ripple ? o.ripple * fbm3(x * 90 + s, z * 90, s) * (1 - r) : 0;
      return [r * R, y * o.height + ripple];
    },
  });
  return { geo, outline, heightAt };
}

/** Small half-sunk bubbles. */
function bubbles(list: { x: number; y: number; z: number; r: number }[]): THREE.BufferGeometry {
  const base = new THREE.SphereGeometry(1, 9, 6);
  return merge(list.map((b) => placed(base, [b.x, b.y, b.z], undefined, b.r)));
}

function liquidMat(key: string, color: string, cooked: string, o: { roughness?: number; clearcoat?: number; map?: THREE.Texture | null; vertexColors?: boolean } = {}): THREE.Material {
  return cmat(`liquid:${key}:${color}:${o.roughness ?? 0.2}:${o.vertexColors ? 1 : 0}`, () =>
    foodMat({
      color: o.vertexColors ? '#ffffff' : color,
      flesh: color,
      cookColor: cooked,
      roughness: o.roughness ?? 0.2,
      clearcoat: o.clearcoat ?? 0.8,
      clearcoatRoughness: 0.08,
      map: o.map ?? null,
      vertexColors: o.vertexColors,
    }),
  );
}

function bowlWith(v: Vessel, ...objs: THREE.Object3D[]): THREE.Group {
  const g = new THREE.Group();
  g.add(v.root, ...objs);
  return sitOnGround(g);
}

// ---------------------------------------------------------------------------------------------
// Batter

function buildBatter(c: Ctx): THREE.Object3D {
  const bowl = servingBowl({ radius: 0.068, height: 0.062, steep: 0.75, style: 'solid', color: PASTEL.sky, foot: 0.52 });
  const col = c.tint;
  const mat = liquidMat('batter', col, c.cooked, { roughness: 0.32, clearcoat: 0.55 });
  const level = 0.15 + 0.6 * c.amount;
  const seed = c.r.range(0, 50);
  const liquid = liquidFill(bowl, level, mat, { surfaceOnly: true, rings: 8, surface: (x, z) => 0.0007 * fbm3(x * 60 + seed, 0.5, z * 60) });
  const y = fillY(bowl, level);
  const R = bowl.radiusAt(y);
  // ribbon swirl of batter folding back onto the surface
  const pts: V3[] = [];
  const turns = 1.55, ph = c.r.range(0, TAU);
  for (let i = 0; i <= 36; i++) {
    const t = i / 36, a = ph + t * turns * TAU, rr = R * (0.1 + 0.52 * t);
    pts.push([Math.cos(a) * rr, y + 0.0012, Math.sin(a) * rr]);
  }
  const ribbon = sweepGeometry(curveThrough(pts), { radius: (t) => 0.0048 * (0.55 + 0.45 * Math.sin(Math.PI * Math.min(1, t * 1.15))), squash: [1, 0.45], radialSegments: 10, tubularSegments: 70, caps: 'round' });
  // a few bubbles
  const bl: { x: number; y: number; z: number; r: number }[] = [];
  for (let i = 0; i < 7; i++) {
    const a = c.r.range(0, TAU), rr = R * c.r.range(0.25, 0.85);
    bl.push({ x: Math.cos(a) * rr, y: y + 0.0002, z: Math.sin(a) * rr, r: c.r.range(0.0012, 0.0024) });
  }
  const g = new THREE.Group();
  g.add(liquid, meshOf(ribbon, mat), meshOf(bubbles(bl), mat));
  return bowlWith(bowl, g);
}

/** Batter poured flat (frying pan / tray): a glossy round puddle with a few bubbles. */
function batterFlat(c: Ctx, radius = 0.07, colorKey = 'batter', roughness = 0.3): THREE.Object3D {
  const seed = c.r.range(0, 40);
  const { geo, heightAt } = puddleGeometry({ radius, height: 0.0065, seed, wobble: 0.035, dome: 0.12, rings: 9, segments: 56 });
  const mat = liquidMat(colorKey, c.tint, c.cooked, { roughness, clearcoat: 0.5 });
  const bl: { x: number; y: number; z: number; r: number }[] = [];
  for (let i = 0; i < 9; i++) {
    const [dx, dz] = c.r.disc();
    const x = dx * radius * 0.75, z = dz * radius * 0.75;
    bl.push({ x, y: heightAt(x, z) - 0.0004, z, r: c.r.range(0.001, 0.0022) });
  }
  const g = new THREE.Group();
  g.add(meshOf(geo, mat), meshOf(bubbles(bl), mat));
  return sitOnGround(g);
}

// ---------------------------------------------------------------------------------------------
// Beaten egg & sweet cream

const eggStreakTex = lazy(() =>
  canvasTexture(
    256,
    256,
    (ctx, w) => {
      paintPlanar(ctx, w, 1, (x, z) => {
        const rr = Math.hypot(x, z), a = Math.atan2(z, x);
        const swirl = Math.sin(a * 2 + rr * 13 + fbm3(x * 3, z * 3, 1.3) * 3);
        const n = fbm3(x * 9, z * 9, 4.2, 3);
        const v = 232 + 18 * sstep(0.55, 0.95, swirl) * (0.6 + 0.4 * n) - 10 * sstep(0.2, 0.6, n);
        return [v + 4, v + 2, v - 6];
      });
    },
    { key: 'prod:egg-streaks' },
  ),
);

function buildBeatenEgg(c: Ctx): THREE.Object3D {
  const bowl = servingBowl({ radius: 0.07, height: 0.05, color: PASTEL.sky, style: 'band' });
  const col = adjust(c.tint, 1.06);
  const mat = cmat('beaten-egg:' + col, () => foodMat({ color: col, flesh: c.tint, cookColor: c.cooked, roughness: 0.1, clearcoat: 1, clearcoatRoughness: 0.05, map: eggStreakTex() }));
  const level = 0.12 + 0.52 * c.amount;
  const liquid = liquidFill(bowl, level, mat, { surfaceOnly: true, meniscus: 0.0024 });
  const y = fillY(bowl, level);
  const R = bowl.radiusAt(y) - 0.002;
  // foam: little bubbles hugging the wall, plus a few strays
  const bl: { x: number; y: number; z: number; r: number }[] = [];
  const clusters = 5;
  for (let k = 0; k < clusters; k++) {
    const a0 = c.r.range(0, TAU);
    const n = c.r.int(4, 8);
    for (let i = 0; i < n; i++) {
      const a = a0 + c.r.range(-0.35, 0.35), rr = R - c.r.range(0.0015, 0.008);
      bl.push({ x: Math.cos(a) * rr, y: y + 0.0006, z: Math.sin(a) * rr, r: c.r.range(0.0011, 0.0026) });
    }
  }
  for (let i = 0; i < 6; i++) {
    const [dx, dz] = c.r.disc();
    bl.push({ x: dx * R * 0.7, y: y + 0.0003, z: dz * R * 0.7, r: c.r.range(0.0008, 0.0016) });
  }
  const foam = cmat('egg-foam:' + col, () => foodMat({ color: mixHex(col, '#fff8e0', 0.55), flesh: c.tint, cookColor: c.cooked, roughness: 0.15, clearcoat: 1 }));
  const g = new THREE.Group();
  g.add(liquid, meshOf(bubbles(bl), foam));
  return bowlWith(bowl, g);
}

function eggFlat(c: Ctx): THREE.Object3D {
  const seed = c.r.range(0, 40);
  const { geo } = puddleGeometry({ radius: 0.068, height: 0.0045, seed, wobble: 0.14, lobes: 3, dome: 0.05, rings: 9, segments: 60, ripple: 0.0004 });
  const col = adjust(c.tint, 1.04);
  const mat = cmat('beaten-egg-flat:' + col, () => foodMat({ color: col, flesh: c.tint, cookColor: c.cooked, roughness: 0.12, clearcoat: 1, clearcoatRoughness: 0.05, map: eggStreakTex() }));
  return sitOnGround(meshOf(geo, mat));
}

function buildSweetCream(c: Ctx): THREE.Object3D {
  const bowl = servingBowl({ radius: 0.068, height: 0.05, color: PASTEL.lilac, style: 'band' });
  const col = c.tint;
  const mat = liquidMat('sweet-cream', col, c.cooked, { roughness: 0.22, clearcoat: 0.6 });
  const level = 0.12 + 0.55 * c.amount;
  const ph = c.r.range(0, TAU);
  const liquid = liquidFill(bowl, level, mat, {
    surfaceOnly: true,
    rings: 16,
    segments: 56,
    surface: (x, z) => {
      const rr = Math.hypot(x, z), a = Math.atan2(z, x);
      return 0.0011 * Math.sin(a + rr * 210 + ph) * sstep(0.004, 0.012, rr);
    },
  });
  return bowlWith(bowl, liquid);
}

function creamFlat(c: Ctx): THREE.Object3D {
  const seed = c.r.range(0, 40);
  const { geo } = puddleGeometry({ radius: 0.066, height: 0.005, seed, wobble: 0.09, lobes: 4, dome: 0.08, rings: 9, segments: 56 });
  return sitOnGround(meshOf(geo, liquidMat('sweet-cream-flat', c.tint, c.cooked, { roughness: 0.22, clearcoat: 0.6 })));
}

// ---------------------------------------------------------------------------------------------
// Whipped cream (piped star-tip swirl)

/** A piped swirl: a star cross-section swept up a narrowing helix, plus a filler core. */
function whippedSwirl(radius: number, height: number, seed: number, o: { turns?: number; ridges?: number; radial?: number; tubular?: number } = {}): THREE.BufferGeometry {
  const turns = o.turns ?? 2.4;
  const tube = radius * 0.4;
  const ridges = o.ridges ?? 7;
  const N = 60;
  const pts: V3[] = [];
  const a0 = seed * 1.7;
  for (let i = 0; i <= N; i++) {
    const u = i / N;
    const a = a0 + u * turns * TAU;
    const rr = (radius - tube * 0.85) * Math.pow(1 - u, 0.85);
    const y = tube * 0.7 + (height - tube * 1.25) * Math.pow(u, 0.9);
    pts.push([Math.cos(a) * rr, y, Math.sin(a) * rr]);
  }
  // the tip: rises a little and curls over
  const last = pts[pts.length - 1];
  pts.push([last[0] + tube * 0.25, last[1] + tube * 0.55, last[2] + tube * 0.1]);
  const swirl = sweepGeometry(curveThrough(pts, 'catmullrom'), {
    radius: (t) => tube * (1 - 0.5 * Math.pow(t, 1.2)) * (t > 0.86 ? 1 - Math.pow((t - 0.86) / 0.14, 1.4) * 0.75 : 1),
    shape: (ang, t) => 0.93 + 0.14 * Math.pow(Math.abs(Math.cos((ang * ridges) / 2 + t * 10)), 1.6),
    radialSegments: o.radial ?? 28,
    tubularSegments: o.tubular ?? 110,
    caps: 'round',
  });
  const core = revolve(
    smoothProfile(
      [
        [0.0001, 0],
        [radius * 0.72, 0],
        [radius * 0.55, height * 0.32],
        [radius * 0.25, height * 0.58],
        [0.0001, height * 0.68],
      ],
      10,
    ),
    { segments: 20 },
  );
  return merge([swirl, core]);
}

const whippedMat = (col: string) =>
  cmat('whipped:' + col, () => foodMat({ color: col, flesh: col, cookColor: '#e8d8b0', roughness: 0.42, clearcoat: 0.35, clearcoatRoughness: 0.35, sheen: 0.4, sheenColor: '#ffffff', sheenRoughness: 0.6 }));

function buildWhippedCream(c: Ctx): THREE.Object3D {
  const bowl = servingBowl({ radius: 0.066, height: 0.048, color: PASTEL.coral, style: 'band', segments: 44 });
  const col = c.tint;
  const mat = whippedMat(col);
  const level = 0.82;
  const seed = c.r.range(0, 30);
  const bed = liquidFill(bowl, level, mat, { surfaceOnly: true, rings: 8, segments: 44, surface: (x, z) => 0.003 * (1 - Math.min(1, Math.hypot(x, z) / 0.05)) + 0.0012 * fbm3(x * 70 + seed, 1, z * 70) });
  const y = fillY(bowl, level);
  const sw = whippedSwirl(0.041 * (0.6 + 0.4 * c.amount), 0.062 * (0.5 + 0.5 * c.amount), seed, { radial: 28, tubular: 96 });
  sw.translate(0, y + 0.001, 0);
  return bowlWith(bowl, bed, meshOf(sw, mat));
}

// ---------------------------------------------------------------------------------------------
// Soup

const SOUP_CREAMY = ['milk', 'cream', 'yogurt', 'sweet-cream'];

function buildSoup(c: Ctx): THREE.Object3D {
  const bowl = servingBowl({ radius: 0.078, height: 0.05, color: PASTEL.coral, style: 'band' });
  const col = c.tint;
  const mat = liquidMat('soup', col, c.cooked, { roughness: 0.14, clearcoat: 0.9 });
  const level = 0.12 + 0.62 * c.amount;
  const seed = c.r.range(0, 40);
  const liquid = liquidFill(bowl, level, mat, { surfaceOnly: true, rings: 7, surface: (x, z) => 0.0005 * fbm3(x * 50 + seed, 2, z * 50) });
  const y = fillY(bowl, level);
  const R = bowl.radiusAt(y) - 0.004;
  const batch = new Batch();
  // floating bits
  const kinds = solidBits(c).filter((i) => !isGreenHerb(i)).slice(0, 4);
  const herbs = c.ids.filter(isGreenHerb);
  const placedXZ: [number, number, number][] = [];
  const spot = (minR: number, maxR: number, size: number): [number, number] => {
    let best: [number, number] = [0, 0];
    let bestD = -1;
    for (let k = 0; k < 14; k++) {
      const a = c.r.range(0, TAU), rr = Math.sqrt(c.r.range(minR * minR, maxR * maxR));
      const x = Math.cos(a) * rr, z = Math.sin(a) * rr;
      const d = placedXZ.length ? Math.min(...placedXZ.map((p) => Math.hypot(p[0] - x, p[1] - z) - p[2] - size)) : 1;
      if (d > bestD) {
        bestD = d;
        best = [x, z];
      }
      if (d > 0.002) break;
    }
    placedXZ.push([best[0], best[1], size]);
    return best;
  };
  const perKind = kinds.length ? Math.max(3, Math.round(12 / kinds.length)) : 0;
  for (const id of kinds) {
    const bit = bitOf(id, c.r);
    const m = bitMat(bit.color, 0.45, getDef(id).colors.cooked ?? c.cooked, 0.25);
    for (let i = 0; i < perKind; i++) {
      const s = bit.kind === 'ball' ? c.r.range(0.0065, 0.0085) : c.r.range(0.0075, 0.011);
      const [x, z] = spot(R * 0.25, R * 0.92, s * 0.6);
      const q = new THREE.Quaternion().setFromEuler(new THREE.Euler(c.r.range(-0.4, 0.4), c.r.range(0, TAU), c.r.range(-0.4, 0.4)));
      b2(batch, m, bit.geo, [x, y - s * 0.12, z], q, [s, s * (bit.kind === 'chunk' ? 0.8 : 1), s]);
    }
  }
  // cream swirl
  if (SOUP_CREAMY.some((i) => c.ids.includes(i))) {
    const pts: V3[] = [];
    const ph = c.r.range(0, TAU);
    for (let i = 0; i <= 30; i++) {
      const t = i / 30, a = ph + t * 1.7 * TAU, rr = R * (0.08 + 0.42 * t);
      pts.push([Math.cos(a) * rr, y + 0.0006, Math.sin(a) * rr]);
    }
    const swirl = sweepGeometry(curveThrough(pts), { radius: (t) => 0.0026 * (0.6 + 0.4 * Math.sin(Math.PI * t)), squash: [1, 0.3], radialSegments: 8, tubularSegments: 60, caps: 'round' });
    batch.add(liquidMat('soup-cream', '#fff8ec', '#e8d8b0', { roughness: 0.2, clearcoat: 0.7 }), swirl);
  }
  // herb garnish in the middle
  if (herbs.length || c.isDefault) herbSprig(batch, c.r, [c.r.range(-0.006, 0.006), y + 0.0015, c.r.range(-0.006, 0.006)], 0.011, herbs.length ? getDef(herbs[0]).colors.skin : '#4f9e38');
  const g = new THREE.Group();
  g.add(liquid);
  batch.addTo(g);
  return bowlWith(bowl, g);
}

function b2(batch: Batch, m: THREE.Material, geo: THREE.BufferGeometry, pos: V3, q: THREE.Quaternion, s: V3) {
  batch.add(m, placed(geo, pos, q, s));
}

// ---------------------------------------------------------------------------------------------
// Mixture (anything goes)

function buildMixture(c: Ctx): THREE.Object3D {
  const bowl = servingBowl({ radius: 0.07, height: 0.052, color: PASTEL.butter, style: 'band' });
  const col = c.tint;
  const mat = liquidMat('mixture', col, c.cooked, { roughness: 0.42, clearcoat: 0.25 });
  const level = 0.2 + 0.65 * c.amount;
  const seed = c.r.range(0, 40);
  const y0 = fillY(bowl, level);
  const R0 = bowl.radiusAt(y0);
  const surf = (x: number, z: number) => {
    const rr = Math.hypot(x, z) / R0;
    return 0.007 * (1 - rr * rr) + 0.0035 * fbm3(x * 55 + seed, 3.1, z * 55);
  };
  const liquid = liquidFill(bowl, level, mat, { surfaceOnly: true, rings: 12, segments: 52, surface: surf, meniscus: 0.003 });
  const batch = new Batch();
  const bits = solidBits(c);
  const colors = bits.length ? bits.map((i) => bitOf(i, c.r)) : [];
  const n = Math.min(16, 4 + colors.length * 4);
  for (let i = 0; i < n && colors.length; i++) {
    const bit = colors[i % colors.length];
    const [dx, dz] = c.r.disc();
    const x = dx * R0 * 0.75, z = dz * R0 * 0.75;
    const s = c.r.range(0.007, 0.011);
    const yy = y0 + surf(x, z) * 0.9;
    const q = new THREE.Quaternion().setFromEuler(new THREE.Euler(c.r.range(0, 3), c.r.range(0, 3), c.r.range(0, 3)));
    batch.add(bitMat(bit.color, 0.5, c.cooked, 0.2), placed(bit.kind === 'leaf' ? herbLeafGeo() : pebbleGeo(), [x, yy - s * 0.15, z], q, s * (bit.kind === 'leaf' ? 1.4 : 1)));
  }
  // a streak of a second colour folded through
  const juices = c.ids.filter(hasDef).map((i) => getDef(i).colors.juice ?? getDef(i).colors.flesh).filter((h) => Math.abs(lightness(h) - lightness(col)) > 0.08);
  if (juices.length) {
    const pts: V3[] = [];
    const ph = c.r.range(0, TAU);
    for (let i = 0; i <= 24; i++) {
      const t = i / 24, a = ph + t * 1.3 * TAU, rr = R0 * (0.15 + 0.55 * t);
      const x = Math.cos(a) * rr, z = Math.sin(a) * rr;
      pts.push([x, y0 + surf(x, z) + 0.0004, z]);
    }
    const streak = sweepGeometry(curveThrough(pts), { radius: 0.003, squash: [1, 0.35], radialSegments: 8, tubularSegments: 50, caps: 'round' });
    batch.add(liquidMat('mixture-streak', juices[0], c.cooked, { roughness: 0.35, clearcoat: 0.3 }), streak);
  }
  const g = new THREE.Group();
  g.add(liquid);
  batch.addTo(g);
  return bowlWith(bowl, g);
}

// ---------------------------------------------------------------------------------------------
// Drinks

const CREAMY_DRINK = ['milk', 'ice-cream', 'yogurt', 'cream', 'banana', 'whipped-cream', 'sweet-cream', 'scoops', 'coconut', 'avocado'];
const SHAKE = ['ice-cream', 'cream', 'whipped-cream', 'scoops', 'sweet-cream'];

const strawTex = lazy(() =>
  canvasTexture(
    64,
    256,
    (ctx, w, h) => {
      const img = ctx.createImageData(w, h);
      const a = rgb('#ff6f9c'), b = rgb('#fffaf6');
      for (let y = 0; y < h; y++)
        for (let x = 0; x < w; x++) {
          const u = x / w, v = 1 - y / h;
          const s = (u * 2 + v * 22) % 1;
          const k = sstep(0.46, 0.5, s) - sstep(0.96, 1.0, s);
          const c = lerp3(a, b, k);
          const i = (y * w + x) * 4;
          img.data[i] = c[0];
          img.data[i + 1] = c[1];
          img.data[i + 2] = c[2];
          img.data[i + 3] = 255;
        }
      ctx.putImageData(img, 0, 0);
    },
    { key: 'prod:straw' },
  ),
);

function bendyStraw(from: V3, to: V3, out: THREE.Vector3, len: number): THREE.BufferGeometry {
  const a = new THREE.Vector3(...from), b = new THREE.Vector3(...to);
  const dir = b.clone().sub(a).normalize();
  const bend = b.clone().addScaledVector(dir, 0.008).addScaledVector(out, 0.004);
  const end = bend.clone().addScaledVector(out, len).addScaledVector(dir, len * 0.25);
  const curve = new THREE.CatmullRomCurve3([a, a.clone().lerp(b, 0.5), b, bend, end], false, 'centripetal');
  const total = curve.getLength();
  const bendT0 = a.distanceTo(b) / total;
  return sweepGeometry(curve, {
    radius: (t) => 0.0034 * (t > bendT0 - 0.02 && t < bendT0 + 0.09 ? 1 + 0.12 * Math.max(0, Math.sin(t * 900)) : 1),
    radialSegments: 9,
    tubularSegments: 40,
    caps: 'none',
  });
}

function buildDrink(c: Ctx): THREE.Object3D {
  const ck = c.state.cook;
  if (ck.boil + ck.micro > 0.5 || ck.temp > 0.45) return buildHotDrink(c);
  const glass = drinkGlass();
  const creamy = CREAMY_DRINK.some((i) => c.ids.includes(i));
  const shake = SHAKE.some((i) => c.ids.includes(i));
  const col = c.tint;
  const level = (shake ? 0.9 : 0.8) * (0.25 + 0.75 * c.amount);
  const top = fillY(glass, level);
  const froth = creamy ? mixHex(col, '#ffffff', 0.35) : mixHex(col, '#ffffff', 0.12);
  const deep = creamy ? col : adjust(col, 0.86, 1.1);
  const mat = cmat(`drink:${creamy ? 'cream' : 'juice'}`, () =>
    foodMat({ color: '#ffffff', vertexColors: true, roughness: creamy ? 0.32 : 0.08, clearcoat: creamy ? 0.4 : 1, clearcoatRoughness: 0.08, flesh: col, cookColor: c.cooked }),
  );
  const liquid = liquidFill(glass, level, mat, {
    meniscus: 0.0022,
    color: (y, partName) => (partName === 'top' ? froth : y > top - (creamy ? 0.007 : 0.003) ? mixHex(col, froth, 0.6) : mixHex(deep, col, sstep(glass.bottomY, top, y))),
  });
  const g = new THREE.Group();
  g.add(glass.root, liquid);
  const batch = new Batch();
  const H = glass.rimY;
  const Rin = glass.innerRadius;
  const ang = c.r.range(-0.4, 0.4);
  // straw leaning on the rim (on the -x side), bending outwards
  const sa = Math.PI + ang;
  const sdir = new THREE.Vector3(Math.cos(sa), 0, Math.sin(sa));
  const straw = bendyStraw([sdir.x * 0.004, glass.bottomY + 0.006, sdir.z * 0.004], [sdir.x * (Rin - 0.004), H + 0.028, sdir.z * (Rin - 0.004)], sdir.clone().add(new THREE.Vector3(0, 0.35, 0)).normalize(), 0.03);
  batch.add(propMat('#ffffff', 0.35, { clearcoat: 0.5, map: strawTex(), key: 'straw' }), straw);
  // topping
  let topY = top;
  if (shake) {
    const sw = whippedSwirl(Rin * 0.98, 0.05, c.r.range(0, 20), { radial: 21, tubular: 84 });
    sw.translate(0, top - 0.002, 0);
    batch.add(whippedMat('#fffaf2'), sw);
    topY = top + 0.05;
    if (!has(c, 'cherry')) cherry(batch, [0.003, topY - 0.006, 0.002], c.r, 0.95);
    if (hasTagged(c, 'chocolate')) {
      for (let i = 0; i < 7; i++) {
        const a = c.r.range(0, TAU), rr = c.r.range(0.006, Rin * 0.75);
        batch.add(chocoMat(), placed(chocoCurl(c.r), [Math.cos(a) * rr, top + 0.012 + (1 - rr / Rin) * 0.022, Math.sin(a) * rr], [c.r.range(0, 3), c.r.range(0, 3), 0], 0.8));
      }
    }
    if (hasTagged(c, 'candy')) sprinkles(batch, c.r, 26, () => {
      const a = c.r.range(0, TAU), rr = c.r.range(0, Rin * 0.85);
      const yy = top + 0.006 + (1 - rr / Rin) * 0.035;
      return { p: new THREE.Vector3(Math.cos(a) * rr, yy, Math.sin(a) * rr), n: new THREE.Vector3(Math.cos(a) * 0.6, 1, Math.sin(a) * 0.6).normalize() };
    });
  } else if (!creamy) {
    // ice cubes bobbing at the surface
    const ice = propMat('#eaf8ff', 0.06, { clearcoat: 1, key: 'ice' });
    const cube = roundedBox(0.016, 0.016, 0.016, 0.004, 1);
    const n = 3;
    for (let i = 0; i < n; i++) {
      const a = (i / n) * TAU + c.r.range(-0.4, 0.4) + 0.6;
      const rr = Rin * 0.45;
      batch.add(ice, placed(cube, [Math.cos(a) * rr, top + 0.002, Math.sin(a) * rr], [c.r.range(-0.5, 0.5), c.r.range(0, 3), c.r.range(-0.5, 0.5)]));
    }
  }
  // fruit garnish on the rim (+x side)
  const fruit = fruitsOf(c)[0] ?? (c.isDefault ? 'strawberry' : undefined);
  if (fruit) rimGarnish(g, batch, fruit, glass, c, shake ? topY : top);
  batch.addTo(g);
  return sitOnGround(g);
}

function rimGarnish(g: THREE.Group, batch: Batch, id: string, v: Vessel, c: Ctx, topY: number) {
  const H = v.rimY;
  const Rrim = v.innerRadius + 0.0012;
  const ga = c.r.range(-0.35, 0.35);
  const rot = new THREE.Quaternion().setFromAxisAngle(Y_UP, -ga);
  const dirOut = new THREE.Vector3(1, 0, 0).applyQuaternion(rot);
  const d = getDef(id);
  if (id === 'strawberry') {
    // whole strawberry notched on the rim, tip down outside
    const q = new THREE.Quaternion().setFromEuler(new THREE.Euler(0, 0, -2.5)).premultiply(rot);
    const pos = dirOut.clone().multiplyScalar(Rrim + 0.0035).add(new THREE.Vector3(0, H + 0.006, 0));
    batch.add(strawberryMat(), placed(strawberryGeo(), pos, q, 1.05));
    const calyx = placed(calyxGeo(), new THREE.Vector3(0, 0, 0), new THREE.Quaternion(), 1.05);
    batch.add(stemMat(), placed(calyx, pos, q));
    return;
  }
  if (id === 'cherry') {
    cherry(batch, [dirOut.x * (Rrim + 0.009), H - 0.006, dirOut.z * (Rrim + 0.009)], c.r, 1);
    return;
  }
  if (id === 'blueberry' || id === 'grapes') {
    // cocktail pick with three berries across the rim
    const pick = new THREE.CylinderGeometry(0.0011, 0.0011, 0.07, 6, 1);
    const q = new THREE.Quaternion().setFromUnitVectors(Y_UP, new THREE.Vector3(dirOut.x, 0.35, dirOut.z).normalize());
    const center = dirOut.clone().multiplyScalar(Rrim - 0.006).add(new THREE.Vector3(0, H + 0.008, 0));
    batch.add(propMat('#f0d39a', 0.6, { key: 'pick' }), placed(pick, center, q));
    const axis = new THREE.Vector3(0, 1, 0).applyQuaternion(q);
    const berry = id === 'grapes' ? bitMat(d.colors.skin, 0.3, d.colors.cooked ?? '#4a2252', 0.6) : blueberryMat();
    for (let i = 0; i < 3; i++) {
      const p = center.clone().addScaledVector(axis, -0.016 + i * 0.011);
      batch.add(berry, placed(ballGeo(), p, undefined, id === 'grapes' ? 0.013 : 0.011));
    }
    return;
  }
  const kind = wheelKind(id);
  if (kind === 'citrus' || kind === 'kiwi' || kind === 'banana' || kind === 'core') {
    const rw = kind === 'banana' ? 0.016 : 0.025;
    const wheel = fruitWheel(id, rw, 0.0055);
    // wheel plane contains the glass axis; centre straddles the wall
    wheel.quaternion.copy(rot).multiply(new THREE.Quaternion().setFromAxisAngle(Y_UP, Math.PI / 2));
    wheel.position.copy(dirOut.clone().multiplyScalar(Rrim + rw * 0.25)).add(new THREE.Vector3(0, H + rw * 0.35, 0));
    g.add(wheel);
    return;
  }
  // everything else: a wedge with its rind outside
  const wedge = fruitWedge(id, 0.034, 0.012, 0.85);
  const holder = new THREE.Group();
  holder.add(wedge);
  wedge.rotation.set(0, 0, Math.PI / 2 + 0.2);
  holder.quaternion.copy(rot).multiply(new THREE.Quaternion().setFromAxisAngle(Y_UP, 0));
  holder.position.copy(dirOut.clone().multiplyScalar(Rrim + 0.004)).add(new THREE.Vector3(0, H - 0.012, 0));
  g.add(holder);
  void topY;
}

function buildHotDrink(c: Ctx): THREE.Object3D {
  const m = mug({ color: PASTEL.mint });
  const col = c.tint;
  const level = 0.12 + 0.72 * c.amount;
  const mat = liquidMat('hot-drink', col, c.cooked, { roughness: 0.18, clearcoat: 0.8 });
  const liquid = liquidFill(m, level, mat, { surfaceOnly: true, rings: 6 });
  const y = fillY(m, level);
  const R = m.radiusAt(y) - 0.003;
  const batch = new Batch();
  if (has(c, 'marshmallow')) {
    const mm = bitMat('#fff6f8', 0.55, '#c8843a', 0);
    const cyl = new THREE.CylinderGeometry(0.005, 0.005, 0.007, 12, 1);
    for (let i = 0; i < 9; i++) {
      const [dx, dz] = c.r.disc();
      batch.add(mm, placed(cyl, [dx * R * 0.75, y + 0.002, dz * R * 0.75], [c.r.range(-0.6, 0.6), c.r.range(0, 3), c.r.range(-0.6, 0.6)]));
    }
  } else if (SHAKE.some((i) => c.ids.includes(i))) {
    const sw = whippedSwirl(R * 0.85, 0.035, c.r.range(0, 20), { radial: 21, tubular: 70 });
    sw.translate(0, y, 0);
    batch.add(whippedMat('#fffaf2'), sw);
  }
  const g = new THREE.Group();
  g.add(m.root, liquid);
  batch.addTo(g);
  return sitOnGround(g);
}

// =============================================================================================
// Solid products: cookie dough, pancakes, cake, flatbread, eggs, popcorn and frozen treats
// =============================================================================================

// ---------------------------------------------------------------------------------------------
// Shared helpers

/** Fill a canvas pixel by pixel (fn returns 0..255 RGB; the ImageData clamps). */
function paintPixels(ctx: CanvasRenderingContext2D, w: number, h: number, fn: (px: number, py: number) => RGB) {
  const img = ctx.createImageData(w, h);
  const d = img.data;
  for (let py = 0; py < h; py++)
    for (let px = 0; px < w; px++) {
      const c = fn(px, py);
      const i = (py * w + px) * 4;
      d[i] = c[0];
      d[i + 1] = c[1];
      d[i + 2] = c[2];
      d[i + 3] = 255;
    }
  ctx.putImageData(img, 0, 0);
}

/** Profile point at arc-length fraction v (the v of revolve()'s default lathe UVs). */
function arcLookup(p: Profile): (v: number) => Pt {
  const acc = [0];
  for (let j = 1; j < p.length; j++) acc.push(acc[j - 1] + Math.hypot(p[j][0] - p[j - 1][0], p[j][1] - p[j - 1][1]));
  const total = acc[acc.length - 1] || 1;
  return (v) => {
    const s = clamp01(v) * total;
    let lo = 0, hi = acc.length - 1;
    while (hi - lo > 1) {
      const m = (lo + hi) >> 1;
      if (acc[m] <= s) lo = m;
      else hi = m;
    }
    const t = (s - acc[lo]) / Math.max(1e-9, acc[hi] - acc[lo]);
    return [p[lo][0] + (p[hi][0] - p[lo][0]) * t, p[lo][1] + (p[hi][1] - p[lo][1]) * t];
  };
}

const colorDist = (a: string, b: string) => {
  const x = rgb(a), y = rgb(b);
  return Math.hypot(x[0] - y[0], x[1] - y[1], x[2] - y[2]);
};

/** Smooth bump: 1 at d = 0 falling to 0 at d >= 1. */
const bump = (d: number) => (d >= 1 ? 0 : (1 - d * d) * (1 - d * d));

/** Unsigned angular distance. */
function angDist(a: number, b: number): number {
  const d = (((a - b) % TAU) + TAU) % TAU;
  return d > Math.PI ? TAU - d : d;
}

/**
 * Parametric grid surface. Columns i = 0..nu run around (increasing angle: x = r sin t,
 * z = r cos t), rows j = 0..nv along a "profile" (bottom -> outside -> top), so triangles face
 * outwards exactly like revolve()'s. The last column must repeat the first (smoothNormals welds it).
 * splitRow: quads below that row form material group 0, the rest group 1.
 */
function gridGeometry(
  nu: number,
  nv: number,
  pos: (i: number, j: number) => V3,
  o: { uv?: (i: number, j: number, p: V3) => [number, number]; color?: (i: number, j: number, p: V3) => THREE.Color; splitRow?: number } = {},
): THREE.BufferGeometry {
  const n = nv + 1;
  const P = new Float32Array((nu + 1) * n * 3);
  const U = new Float32Array((nu + 1) * n * 2);
  const C = o.color ? new Float32Array((nu + 1) * n * 3) : null;
  for (let i = 0; i <= nu; i++)
    for (let j = 0; j <= nv; j++) {
      const k = i * n + j;
      const p = pos(i, j);
      P[k * 3] = p[0];
      P[k * 3 + 1] = p[1];
      P[k * 3 + 2] = p[2];
      const uv = o.uv ? o.uv(i, j, p) : [i / nu, j / nv];
      U[k * 2] = uv[0];
      U[k * 2 + 1] = uv[1];
      if (C) {
        const c = o.color!(i, j, p);
        C[k * 3] = c.r;
        C[k * 3 + 1] = c.g;
        C[k * 3 + 2] = c.b;
      }
    }
  const quads = (j0: number, j1: number) => {
    const idx: number[] = [];
    for (let i = 0; i < nu; i++)
      for (let j = j0; j < j1; j++) {
        const a = j + i * n, b = a + n, c = a + n + 1, d = a + 1;
        idx.push(a, b, d, c, d, b);
      }
    return idx;
  };
  const g = new THREE.BufferGeometry();
  g.setAttribute('position', new THREE.BufferAttribute(P, 3));
  g.setAttribute('uv', new THREE.BufferAttribute(U, 2));
  if (C) g.setAttribute('color', new THREE.BufferAttribute(C, 3));
  if (o.splitRow !== undefined) {
    const A = quads(0, o.splitRow), B = quads(o.splitRow, nv);
    g.setIndex([...A, ...B]);
    g.addGroup(0, A.length, 0);
    g.addGroup(A.length, B.length, 1);
  } else g.setIndex(quads(0, nv));
  smoothNormals(g);
  g.computeBoundingBox();
  g.computeBoundingSphere();
  return g;
}

/**
 * Skin texture for the generic disc wedges / dice: LatheGeometry gives profile point j the texture
 * row v = j / (n - 1), so rows follow the profile point by point (linear in between, duplicate
 * points make crisp colour steps); u (around) gets a soft seamless mottle.
 */
function laneTexture(key: string, cols: string[], mottle = 0.07): THREE.Texture {
  return canvasTexture(
    64,
    256,
    (ctx, w, h) => {
      const rgbs = cols.map(rgb);
      const n = rgbs.length;
      paintPixels(ctx, w, h, (px, py) => {
        const v = 1 - (py + 0.5) / h;
        const f = v * (n - 1);
        const j = Math.min(n - 2, Math.max(0, Math.floor(f)));
        const c = lerp3(rgbs[j], rgbs[j + 1], f - j);
        const a = ((px + 0.5) / w) * TAU;
        const k = 1 + mottle * fbm3(Math.cos(a) * 1.6, Math.sin(a) * 1.6, v * 22, 3) * 2;
        return [c[0] * k, c[1] * k, c[2] * k];
      });
    },
    { key: 'prod:lane:' + key },
  );
}

function laneMat(key: string, cols: string[], o: { flesh: string; cooked?: string; roughness?: number; mottle?: number; clearcoat?: number; cookAmount?: number }): THREE.Material {
  return cmat('lane:' + key, () =>
    foodMat({ color: '#ffffff', map: laneTexture(key, cols, o.mottle), roughness: o.roughness ?? 0.6, clearcoat: o.clearcoat, clearcoatRoughness: 0.25, flesh: o.flesh, cookColor: o.cooked, cookAmount: o.cookAmount }),
  );
}

/** Outward normal of a surface given as a function of a unit direction (finite differences). */
function surfNormal(F: (d: THREE.Vector3) => THREE.Vector3, d: THREE.Vector3): THREE.Vector3 {
  const t = Math.abs(d.y) < 0.9 ? Y_UP : new THREE.Vector3(1, 0, 0);
  const u = new THREE.Vector3().crossVectors(d, t).normalize();
  const v = new THREE.Vector3().crossVectors(d, u);
  const p = F(d.clone());
  const a = F(d.clone().addScaledVector(u, 0.01).normalize()).sub(p);
  const b = F(d.clone().addScaledVector(v, 0.01).normalize()).sub(p);
  const n = new THREE.Vector3().crossVectors(a, b).normalize();
  return n.dot(d) < 0 ? n.negate() : n;
}

/** Jittered Fibonacci direction i of n, from straight up down to height yMin (-1..1). */
function fibDir(i: number, n: number, yMin: number, r: Rng, jitter = 0.1, phase = 0): THREE.Vector3 {
  const y = 1 - ((i + 0.5) / n) * (1 - yMin);
  const s = Math.sqrt(Math.max(0, 1 - y * y));
  const a = i * 2.399963 + phase;
  return new THREE.Vector3(Math.cos(a) * s, y, Math.sin(a) * s).addScaledVector(randDir(r), jitter).normalize();
}

/** n points in a disc of radius R, kept apart from each other and from `taken`. */
function scatter(r: Rng, n: number, R: number, minD: number, taken: [number, number][] = []): [number, number][] {
  const out: [number, number][] = [];
  for (let i = 0; i < n; i++) {
    let best: [number, number] = [0, 0];
    let bestD = -1;
    for (let k = 0; k < 16; k++) {
      const [dx, dz] = r.disc();
      const p: [number, number] = [dx * R, dz * R];
      let d = 1;
      for (const q of taken) d = Math.min(d, Math.hypot(q[0] - p[0], q[1] - p[1]));
      for (const q of out) d = Math.min(d, Math.hypot(q[0] - p[0], q[1] - p[1]));
      if (d > bestD) {
        bestD = d;
        best = p;
      }
      if (d > minD) break;
    }
    out.push(best);
  }
  return out;
}

// Little bits pressed into doughs / scattered on top: chocolate chips, nuts, candy, chunks

interface Stud {
  geo: THREE.BufferGeometry;
  mat: THREE.Material;
  scale: number;
  /** Height of the scaled bit. */
  height: number;
  /** Fraction of the bit pushed below the surface. */
  sink: number;
  /** Geometry centred on its origin (else it stands on y = 0, like a chip). */
  centred: boolean;
  /** Random tilt away from the surface normal (0..1). */
  tilt: number;
  /** Random vertex colour per bit (candy). */
  colors?: string[];
}

const nutGeo = lazy(() => noisify(new THREE.IcosahedronGeometry(0.5, 1), 0.07, 3, 5));
const candyGeo = lazy(() => {
  const g = new THREE.SphereGeometry(0.5, 10, 6);
  g.scale(1, 0.46, 1);
  return g;
});
const CANDY_COLORS = ['#ff4f6e', '#ffc93a', '#4fb8ff', '#6fd36a', '#b07cff', '#ff8a3d'];
const candyMat = lazy(() => foodMat({ color: '#ffffff', vertexColors: true, roughness: 0.22, clearcoat: 0.9, clearcoatRoughness: 0.1, flesh: '#f87ac0', cookColor: '#a02a6a' }));
/** Rounded chocolate chunk (cookie dough). */
const chocChunkGeo = lazy(() => {
  const g = noisify(new THREE.IcosahedronGeometry(0.5, 1), 0.07, 3.2, 9);
  g.scale(1, 0.78, 1);
  return g;
});
const whiteChocMat = lazy(() => foodMat({ color: '#f6ead2', flesh: '#f6ead2', cookColor: '#c89a60', roughness: 0.34, clearcoat: 0.5, clearcoatRoughness: 0.25 }));

/** What went in, as little bits: chips (white ones on a dark base), nuts, candy, chunks. */
function studsOf(c: Ctx, darkBase: boolean, max = 3): Stud[] {
  const out: Stud[] = [];
  if (hasTagged(c, 'chocolate')) out.push({ geo: chocChunkGeo(), mat: darkBase ? whiteChocMat() : chocoMat(), scale: 0.0078, height: 0.0062, sink: 0.42, centred: true, tilt: 0.5 });
  for (const id of solidBits(c)) {
    if (out.length >= max) break;
    const d = getDef(id);
    if (d.tags.includes('chocolate') || isGreenHerb(id)) continue;
    const cooked = d.colors.cooked ?? c.cooked;
    if (id === 'nuts') out.push({ geo: nutGeo(), mat: bitMat(d.colors.flesh, 0.55, cooked), scale: 0.0078, height: 0.0078, sink: 0.35, centred: true, tilt: 1 });
    else if (d.tags.includes('candy') && id !== 'marshmallow') out.push({ geo: candyGeo(), mat: candyMat(), scale: 0.0095, height: 0.0045, sink: 0.3, centred: true, tilt: 0.3, colors: CANDY_COLORS });
    else {
      const bit = bitOf(id, c.r);
      if (bit.kind === 'leaf') continue;
      const geo = bit.kind === 'ball' ? ballGeo() : bit.kind === 'pebble' ? pebbleGeo() : chunkGeo();
      out.push({ geo, mat: bitMat(bit.color, 0.42, cooked, 0.25), scale: bit.kind === 'ball' ? 0.0085 : 0.0068, height: 0.0075, sink: 0.35, centred: true, tilt: 1 });
    }
  }
  return out;
}

/** Press studs into a surface: sample(i) gives a surface point and its outward normal. */
function pressStuds(b: Batch, r: Rng, studs: Stud[], n: number, sample: (i: number) => { p: THREE.Vector3; n: THREE.Vector3 } | null, size = 1) {
  if (!studs.length) return;
  for (let i = 0; i < n; i++) {
    const s = sample(i);
    if (!s) continue;
    const st = studs[i % studs.length];
    const k = r.range(0.85, 1.18) * size;
    const up = s.n.clone().addScaledVector(randDir(r), st.tilt * 0.45).normalize();
    const q = new THREE.Quaternion().setFromUnitVectors(Y_UP, up).multiply(new THREE.Quaternion().setFromAxisAngle(Y_UP, r.range(0, TAU)));
    const h = st.height * k;
    const pos = s.p.clone().addScaledVector(s.n, st.centred ? h * (0.5 - st.sink) : -h * st.sink);
    const g = placed(st.geo, pos, q, st.scale * k);
    b.add(st.mat, st.colors ? colored(g, r.pick(st.colors)) : g);
  }
}

// ---------------------------------------------------------------------------------------------
// Cookie dough: a lumpy ball studded with chocolate chips (or whatever went in)

const CDOUGH = getDef('cookie-dough').colors;

interface CookieColors {
  base: string;
  flesh: string;
  dark: boolean;
}
function cookieColors(c: Ctx): CookieColors {
  const base = c.tinted ? c.tint : CDOUGH.skin;
  return { base, flesh: c.tinted ? mixHex(c.tint, '#ffffff', 0.08) : CDOUGH.flesh, dark: lightness(base) < 0.42 };
}

const doughGrain = lazy(() => bumpNoiseTexture('prod:dough-grain', 72, 256, true));
const doughMat = (flesh: string) => vcMat('cookie-dough:' + flesh, { roughness: 0.64, sheen: 0.4, flesh, cooked: CDOUGH.cooked ?? '#b8782e', bump: doughGrain(), bumpScale: 0.9 });

interface DoughSurface {
  at: (d: THREE.Vector3, out?: THREE.Vector3) => THREE.Vector3;
  lump: (d: THREE.Vector3) => number;
}

/** Lumpy dough as a function of a unit direction: a squashed ball with a soft flat bottom. */
function doughSurface(R: number, seed: number, squash = 0.76): DoughSurface {
  const yb = -R * squash * 0.6;
  const kk = R * 0.16;
  const lump = (d: THREE.Vector3) =>
    0.15 * fbm3(d.x * 1.5 + seed, d.y * 1.5 - seed * 0.7, d.z * 1.5 + seed * 0.3, 3) +
    0.075 * fbm3(d.x * 4.3 - seed, d.y * 4.3 + seed, d.z * 4.3, 2) +
    0.03 * fbm3(d.x * 9 + seed, d.y * 9, d.z * 9 - seed, 2);
  const at = (d: THREE.Vector3, out = new THREE.Vector3()) => {
    const k = R * (1 + lump(d));
    let y = d.y * k * squash;
    const dy = y - yb;
    y = yb + 0.5 * (dy + Math.sqrt(dy * dy + kk * kk)) - kk * 0.5;
    const sag = 1 + 0.12 * sstep(R * 0.1, yb, y);
    return out.set(d.x * k * sag, y, d.z * k * sag);
  };
  return { at, lump };
}

/** Icosphere pushed onto a dough surface, with baked colours (mottled, darker in the creases). */
function doughGeo(S: DoughSurface, detail: number, base: string, seed: number): THREE.BufferGeometry {
  const g: THREE.BufferGeometry = new THREE.IcosahedronGeometry(1, detail);
  const cols = new Float32Array(g.attributes.position.count * 3);
  const cBase = new THREE.Color(base), cLight = new THREE.Color(adjust(base, 1.09, 0.88)), cDark = new THREE.Color(adjust(base, 0.78, 1.12));
  const tmp = new THREE.Color();
  const d = new THREE.Vector3();
  deform(g, (p, _n, i) => {
    d.copy(p).normalize();
    const l = S.lump(d);
    S.at(d, p);
    const m = fbm3(d.x * 7 + seed, d.y * 7 - seed, d.z * 7, 2);
    tmp.copy(cBase).lerp(cLight, clamp01(0.3 + m * 0.9 + l * 2)).lerp(cDark, clamp01(-l * 4.5 - 0.1));
    cols[i * 3] = tmp.r;
    cols[i * 3 + 1] = tmp.g;
    cols[i * 3 + 2] = tmp.b;
  });
  g.setAttribute('color', new THREE.BufferAttribute(cols, 3));
  return g;
}

/** One studded dough ball into a batch, resting on y = at.y at (at.x, at.z). */
function doughBall(b: Batch, c: Ctx, col: CookieColors, studs: Stud[], R: number, detail: number, nStuds: number, at: V3 = [0, 0, 0]) {
  const seed = c.r.range(0, 40);
  const small = R < 0.025;
  const S = doughSurface(R, seed, small ? 0.84 : 0.76);
  const geo = doughGeo(S, detail, col.base, seed);
  geo.computeBoundingBox();
  const off = new THREE.Vector3(at[0], at[1] - geo.boundingBox!.min.y, at[2]);
  geo.translate(off.x, off.y, off.z);
  b.add(doughMat(col.flesh), geo);
  const ph = c.r.range(0, TAU);
  pressStuds(
    b,
    c.r,
    studs,
    nStuds,
    (i) => {
      const d = fibDir(i, nStuds, -0.4, c.r, 0.12, ph);
      return { p: S.at(d).add(off), n: surfNormal(S.at, d) };
    },
    small ? 0.78 : 1,
  );
}

function buildCookieDough(c: Ctx): THREE.Object3D {
  const col = cookieColors(c);
  const b = new Batch();
  doughBall(b, c, col, studsOf(c, col.dark), 0.043, 10, 26);
  return sitOnGround(b.addTo(new THREE.Group()));
}

/** Pieces: 4-5 little studded dough balls in a loose cluster. */
function cookieDoughPieces(c: Ctx): THREE.Object3D {
  const col = cookieColors(c);
  const studs = studsOf(c, col.dark);
  const b = new Batch();
  const n = c.r.int(4, 5);
  const spots: [number, number][] = [];
  for (let k = 0; k < n; k++) {
    let best: [number, number] = [0, 0];
    let bestD = -1;
    for (let t = 0; t < 24; t++) {
      const a = c.r.range(0, TAU), rr = k === 0 ? c.r.range(0, 0.006) : c.r.range(0.03, 0.04);
      const p: [number, number] = [Math.cos(a) * rr, Math.sin(a) * rr];
      const dmin = spots.length ? Math.min(...spots.map((s) => Math.hypot(s[0] - p[0], s[1] - p[1]))) : 1;
      if (dmin > bestD) {
        bestD = dmin;
        best = p;
      }
      if (dmin > 0.035) break;
    }
    spots.push(best);
    doughBall(b, c, col, studs, 0.0158 * c.r.range(0.92, 1.12), 5, 5, [best[0], 0, best[1]]);
  }
  return sitOnGround(b.addTo(new THREE.Group()));
}

const cookieFlatProfile = lazy((): Profile =>
  smoothProfile(
    [
      [0.0001, 0],
      [0.068, 0],
      [0.0775, 0.0012],
      [0.0805, 0.0042],
      [0.0785, 0.0072],
      [0.072, 0.0086],
      [0.04, 0.0092],
      [0.0001, 0.0094],
    ],
    18,
  ),
);

/** Rolled out: a thick, slightly ragged sheet with the bits pressed into its top. */
function cookieDoughFlat(c: Ctx): THREE.Object3D {
  const col = cookieColors(c);
  const seed = c.r.range(0, 40);
  const geo = revolve(cookieFlatProfile(), {
    segments: 64,
    map: (_j, th, r, y) => {
      const out = 1 + 0.035 * fbm3(Math.cos(th) * 1.6 + seed, Math.sin(th) * 1.6, seed, 3) + 0.012 * Math.sin(th * 5 + seed);
      const x = r * Math.sin(th), z = r * Math.cos(th);
      const lumps = y > 0.004 ? 0.0011 * fbm3(x * 70 + seed, z * 70, 1.3, 3) : 0;
      return [r * (1 + (out - 1) * sstep(0.03, 0.075, r)), y + lumps];
    },
  });
  const cBase = new THREE.Color(col.base), cLight = new THREE.Color(adjust(col.base, 1.08, 0.9)), cDark = new THREE.Color(adjust(col.base, 0.84, 1.1));
  paintVertices(geo, (p) => {
    const m = fbm3(p.x * 60 + seed, p.y * 60, p.z * 60, 2);
    return cBase.clone().lerp(cLight, clamp01(0.3 + m)).lerp(cDark, clamp01(-m * 1.5 - 0.1) + sstep(0.074, 0.082, Math.hypot(p.x, p.z)) * 0.35);
  });
  const b = new Batch();
  b.add(doughMat(col.flesh), geo);
  const studs = studsOf(c, col.dark).map((s) => ({ ...s, sink: s.sink + 0.15, tilt: s.tilt + 0.3 }));
  const pts = scatter(c.r, 22, 0.064, 0.012);
  pressStuds(b, c.r, studs, pts.length, (i) => ({ p: new THREE.Vector3(pts[i][0], 0.0092, pts[i][1]), n: Y_UP.clone() }));
  return sitOnGround(b.addTo(new THREE.Group()));
}

const cookieSkinTex = lazy(() =>
  canvasTexture(
    256,
    256,
    (ctx, w, h) => {
      const base = rgb(CDOUGH.skin), light = rgb(adjust(CDOUGH.skin, 1.08, 0.9)), dark = rgb(adjust(CDOUGH.skin, 0.82, 1.1));
      paintPixels(ctx, w, h, (px, py) => {
        const a = (px / w) * TAU, b2 = (py / h) * TAU;
        const n = fbm3(Math.cos(a) * 2, Math.sin(a) * 2, Math.cos(b2) * 2 + Math.sin(b2) * 3, 3);
        return n > 0 ? lerp3(base, light, n * 1.6) : lerp3(base, dark, -n * 1.6);
      });
      specks(ctx, w, h, '#4a2614', { count: 60, size: [1.5, 3.2], alpha: 0.9, seed: 11, elongate: 0.8 });
    },
    { key: 'prod:cookie-skin', wrap: true },
  ),
);
const cookieSkin = lazy(() =>
  foodMat({ color: '#ffffff', map: cookieSkinTex(), roughness: 0.62, sheen: 0.4, sheenColor: '#fff4e0', sheenRoughness: 0.6, flesh: CDOUGH.flesh, cookColor: CDOUGH.cooked }),
);
const cookieFlesh = lazy(() => foodMat({ color: CDOUGH.flesh, roughness: 0.65, flesh: CDOUGH.flesh, cookColor: CDOUGH.cooked }));

// ---------------------------------------------------------------------------------------------
// Strawberry halves (cake & pancake toppings)

/** Cross-section of a halved strawberry: red rim, pink flesh, pale core (u across, v shoulder -> tip). */
const strawberrySecTex = lazy(() =>
  canvasTexture(
    128,
    128,
    (ctx, w, h) => {
      const H = STRAWBERRY_PTS[STRAWBERRY_PTS.length - 1][1], Rm = 0.0112;
      const half = (y: number) => {
        for (let i = 1; i < STRAWBERRY_PTS.length; i++) {
          const [r0, y0] = STRAWBERRY_PTS[i - 1], [r1, y1] = STRAWBERRY_PTS[i];
          if (y <= y1) return r0 + ((r1 - r0) * (y - y0)) / Math.max(1e-9, y1 - y0);
        }
        return 0.0001;
      };
      const core = rgb('#fff0ea'), pink = rgb('#f8a9ab'), flesh = rgb('#f0505f'), skin = rgb('#d61a33');
      paintPixels(ctx, w, h, (px, py) => {
        const u = (px + 0.5) / w, v = 1 - (py + 0.5) / h;
        const x = (u - 0.5) * 2 * Rm, y = v * H;
        const hw = Math.max(1e-5, half(y));
        const d = Math.abs(x) / hw;
        const streak = 0.5 + 0.5 * Math.sin(Math.atan2(x, y - H * 0.35) * 18);
        let c = lerp3(pink, flesh, sstep(0.3, 0.85, d + streak * 0.08));
        c = lerp3(c, core, (1 - sstep(0.12, 0.3, d)) * sstep(0.06, 0.2, v) * (1 - sstep(0.75, 0.92, v)));
        return lerp3(c, skin, sstep(0.86, 0.97, d));
      });
    },
    { key: 'prod:strawberry-sec' },
  ),
);
const strawberrySecMat = lazy(() => foodMat({ color: '#ffffff', map: strawberrySecTex(), roughness: 0.3, clearcoat: 0.6, clearcoatRoughness: 0.15, flesh: '#f26a74', cookColor: '#9a1a2a' }));

/** Half strawberry standing on its shoulder: shell (x >= 0) + cut face in the x = 0 plane facing -x. */
const strawberryHalf = lazy(() => {
  const prof = smoothProfile(STRAWBERRY_PTS, 10);
  const shell = revolve(prof, { segments: 8, phiLength: Math.PI });
  const H = prof[prof.length - 1][1];
  const Rm = Math.max(...prof.map((p) => p[0]));
  const s = new THREE.Shape();
  s.moveTo(prof[0][0], prof[0][1]);
  for (let i = 1; i < prof.length; i++) s.lineTo(prof[i][0], prof[i][1]);
  for (let i = prof.length - 1; i >= 0; i--) s.lineTo(-prof[i][0], prof[i][1]);
  const face = new THREE.ShapeGeometry(s, 2);
  const fp = face.attributes.position as THREE.BufferAttribute;
  const fu = face.attributes.uv as THREE.BufferAttribute;
  for (let i = 0; i < fp.count; i++) fu.setXY(i, (fp.getX(i) + Rm) / (2 * Rm), fp.getY(i) / H);
  face.rotateY(-Math.PI / 2);
  return { shell, face };
});

/** Half strawberry lying cut face up, centred on the origin with the face at y = 0. */
const strawberryHalfFlat = lazy(() => {
  const h = strawberryHalf();
  const q = new THREE.Quaternion().setFromAxisAngle(new THREE.Vector3(0, 0, 1), -Math.PI / 2);
  const f = (g: THREE.BufferGeometry) => {
    const c = g.clone();
    c.translate(0, -0.013, 0);
    c.applyQuaternion(q);
    return c;
  };
  return { shell: f(h.shell), face: f(h.face) };
});

function addStrawberryHalf(b: Batch, flat: boolean, pos: THREE.Vector3 | V3, q: THREE.Quaternion | V3) {
  const h = flat ? strawberryHalfFlat() : strawberryHalf();
  b.add(strawberryMat(), placed(h.shell, pos, q));
  b.add(strawberrySecMat(), placed(h.face, pos, q));
}

// ---------------------------------------------------------------------------------------------
// Pancakes: a stack of three fluffy golden pancakes

const PANC = getDef('pancake').colors;
const PAN_R = 0.066;
const PAN_T = 0.0124;
const PAN_STEP = PAN_T * 0.92;

/** One pancake: bottom centre -> puffy rim -> gently domed top. */
const pancakeProfile = lazy((): Profile =>
  smoothProfile(
    [
      [0.0001, 0.0005],
      [PAN_R * 0.5, 0],
      [PAN_R * 0.86, 0.0003],
      [PAN_R * 0.965, 0.0021],
      [PAN_R, 0.0056],
      [PAN_R * 0.988, 0.0092],
      [PAN_R * 0.945, 0.0116],
      [PAN_R * 0.84, PAN_T],
      [PAN_R * 0.45, PAN_T + 0.0007],
      [0.0001, PAN_T + 0.0009],
    ],
    20,
  ),
);

interface PanColors {
  crumb: string;
  face: string;
  light: string;
  dark: string;
}
function pancakeColors(c: Ctx): PanColors {
  const k = c.tinted ? 0.4 : 0;
  const crumb = mixHex(PANC.flesh, c.tint, k);
  const face = mixHex('#d68d3a', adjust(c.tint, 0.62, 1.1), k * 0.75);
  return { crumb, face, light: mixHex(face, crumb, 0.5), dark: adjust(face, 0.76, 1.08) };
}

/** Lathe-UV texture (u around, v along the profile): blotchy golden faces with pale lacy pores, pale fluffy rim. */
function pancakeTex(pc: PanColors): THREE.Texture {
  return canvasTexture(
    512,
    256,
    (ctx, w, h) => {
      const look = arcLookup(pancakeProfile());
      const crumb = rgb(pc.crumb), face = rgb(pc.face), light = rgb(pc.light), dark = rgb(pc.dark);
      const rows = Array.from({ length: h }, (_, py) => {
        const [r, y] = look(1 - (py + 0.5) / h);
        return { r, y, faceW: 1 - sstep(PAN_R * 0.82, PAN_R * 0.94, r), top: y > PAN_T * 0.5 };
      });
      paintPixels(ctx, w, h, (px, py) => {
        const { r, y, faceW, top } = rows[py];
        const a = ((px + 0.5) / w) * TAU;
        const x = Math.sin(a) * r, z = Math.cos(a) * r;
        const o = top ? 0 : 7.7;
        const n1 = fbm3(x * 55 + o, z * 55, 0.4, 3);
        const n2 = fbm3(x * 240 + o, z * 240, 1.7, 2);
        let f = lerp3(face, dark, clamp01(0.42 + n1 * 1.5));
        f = lerp3(f, light, sstep(0.12, 0.34, n2) * (0.3 + 0.5 * sstep(PAN_R * 0.3, PAN_R * 0.8, r)));
        f = lerp3(f, light, sstep(PAN_R * 0.62, PAN_R * 0.86, r) * 0.5);
        const m = fbm3(x * 130, y * 260, z * 130, 2);
        const rim = lerp3(crumb, light, clamp01(0.1 + m * 0.6));
        return lerp3(rim, f, faceW);
      });
    },
    { key: `prod:pancake:${pc.crumb}:${pc.face}` },
  );
}

const pancakeMat = (pc: PanColors) =>
  cmat(`pancake:${pc.crumb}:${pc.face}`, () =>
    foodMat({ color: '#ffffff', map: pancakeTex(pc), roughness: 0.62, sheen: 0.3, sheenColor: '#fff0cc', sheenRoughness: 0.55, flesh: pc.crumb, cookColor: PANC.cooked, cookAmount: 0.55 }),
  );

function pancakeGeo(seed: number): THREE.BufferGeometry {
  return revolve(pancakeProfile(), {
    segments: 44,
    map: (_j, th, r, y) => {
      const out = 1 + 0.015 * Math.sin(th * 2 + seed) + 0.016 * Math.sin(th * 3 + seed * 1.3) + 0.026 * fbm3(Math.cos(th) * 1.4 + seed, Math.sin(th) * 1.4, seed * 0.3, 2);
      const x = r * Math.sin(th), z = r * Math.cos(th);
      const puff = y > PAN_T * 0.6 ? 0.0007 * fbm3(x * 45 + seed, z * 45, 2.1, 2) * (1 - sstep(PAN_R * 0.8, PAN_R, r)) : 0;
      return [r * (1 + (out - 1) * sstep(PAN_R * 0.25, PAN_R * 0.85, r)), y + puff];
    },
  });
}

/** A pat of butter, softly slumping as it melts. */
const butterGeo = lazy(() => {
  const g = roundedBox(0.02, 0.0072, 0.02, 0.003, 3);
  g.translate(0, 0.0036, 0);
  return deform(g, (p) => {
    const t = p.y / 0.0072;
    const k = 1 + 0.12 * (1 - t) * (1 - t);
    p.x *= k;
    p.z *= k;
    p.y *= 1 - 0.12 * Math.min(1, Math.hypot(p.x, p.z) / 0.012);
  });
});
const butterMat = lazy(() => foodMat({ color: '#fde07c', flesh: '#fde69a', cookColor: '#e0a840', roughness: 0.22, clearcoat: 0.8, clearcoatRoughness: 0.15 }));

/** Butter pat, berries, fruit slices or chips on top of the stack (from the recipe). */
function pancakeToppings(c: Ctx, b: Batch, g: THREE.Group, top: THREE.Vector3, pc: PanColors) {
  const surfY = (x: number, z: number) => top.y - 0.0011 * Math.min(1, ((x - top.x) ** 2 + (z - top.z) ** 2) / (PAN_R * PAN_R));
  const taken: [number, number][] = [];
  if (has(c, 'butter')) {
    const x = top.x + c.r.range(-0.004, 0.004), z = top.z + c.r.range(-0.004, 0.004);
    const y = surfY(x, z);
    b.add(butterMat(), placed(butterGeo(), [x, y - 0.0009, z], [c.r.range(-0.05, 0.05), c.r.range(0, TAU), c.r.range(-0.05, 0.05)]));
    taken.push([x - top.x, z - top.z]);
  }
  for (const id of fruitsOf(c).slice(0, 2)) {
    const d = getDef(id);
    const at = (p: [number, number]) => [top.x + p[0], top.z + p[1]] as [number, number];
    if (id === 'blueberry' || id === 'grapes' || id === 'cherry') {
      for (const p of scatter(c.r, id === 'blueberry' ? 8 : 4, PAN_R * 0.68, 0.013, taken)) {
        const [x, z] = at(p);
        const y = surfY(x, z);
        if (id === 'cherry') cherry(b, [x, y - 0.001, z], c.r, 0.85);
        else b.add(id === 'grapes' ? bitMat(d.colors.skin, 0.3, d.colors.cooked ?? '#4a2252', 0.6) : blueberryMat(), placed(ballGeo(), [x, y + 0.0042, z], undefined, id === 'grapes' ? 0.0125 : 0.0105));
        taken.push(p);
      }
    } else if (id === 'strawberry') {
      for (const p of scatter(c.r, 3, PAN_R * 0.45, 0.026, taken)) {
        const [x, z] = at(p);
        addStrawberryHalf(b, true, [x, surfY(x, z) + 0.0094, z], [0, c.r.range(0, TAU), 0]);
        taken.push(p);
      }
    } else if (wheelKind(id) !== 'plain') {
      const banana = wheelKind(id) === 'banana';
      for (const p of scatter(c.r, banana ? 5 : 3, PAN_R * 0.55, banana ? 0.024 : 0.03, taken)) {
        const [x, z] = at(p);
        const w = fruitWheel(id, banana ? 0.0125 : 0.017, 0.0042);
        w.rotation.set(-Math.PI / 2, 0, c.r.range(0, TAU));
        w.position.set(x, surfY(x, z) + 0.0019, z);
        g.add(w);
        taken.push(p);
      }
    } else {
      const m = bitMat(d.colors.flesh, 0.3, d.colors.cooked ?? '#8a5a2a', 0.6);
      for (const p of scatter(c.r, 6, PAN_R * 0.62, 0.012, taken)) {
        const [x, z] = at(p);
        b.add(m, placed(chunkGeo(), [x, surfY(x, z) + 0.003, z], [c.r.range(-0.3, 0.3), c.r.range(0, TAU), c.r.range(-0.3, 0.3)], 0.0085));
        taken.push(p);
      }
    }
  }
  if (hasTagged(c, 'chocolate')) {
    const m = lightness(pc.face) < 0.35 ? whiteChocMat() : chocoMat();
    for (const p of scatter(c.r, 9, PAN_R * 0.72, 0.011, taken)) {
      const x = top.x + p[0], z = top.z + p[1];
      b.add(m, placed(chipGeo(), [x, surfY(x, z) - 0.0018, z], [c.r.range(-0.3, 0.3), c.r.range(0, TAU), c.r.range(-0.3, 0.3)], 1.05));
    }
  }
}

function buildPancakes(c: Ctx): THREE.Object3D {
  const pc = pancakeColors(c);
  const mat = pancakeMat(pc);
  const g = new THREE.Group();
  const top = new THREE.Vector3();
  for (let k = 0; k < 3; k++) {
    const m = meshOf(pancakeGeo(c.r.range(0, 60)), mat, 'pancake');
    const s = 1 - k * 0.015 + c.r.range(-0.012, 0.012);
    m.scale.set(s, 1, s);
    m.rotation.y = c.r.range(0, TAU);
    m.position.set(c.r.range(-0.003, 0.003), k * PAN_STEP, c.r.range(-0.003, 0.003));
    g.add(m);
    top.set(m.position.x, k * PAN_STEP + PAN_T + 0.0009, m.position.z);
  }
  const b = new Batch();
  pancakeToppings(c, b, g, top, pc);
  b.addTo(g);
  return sitOnGround(g);
}

/** The stack as one lathe profile (generic wedges), with a colour per point for the skin lanes. */
const pancakeStack = lazy(() => {
  const pts: Pt[] = [];
  const cols: string[] = [];
  const face = '#d68d3a', crumb = PANC.flesh, seam = '#b4702c', edge = '#e6ab5c';
  const add = (r: number, y: number, col: string) => {
    pts.push([r, y]);
    cols.push(col);
  };
  add(0.0001, 0, face);
  add(PAN_R * 0.5, 0, face);
  add(PAN_R * 0.86, 0.0003, face);
  for (let k = 0; k < 3; k++) {
    const y0 = k * PAN_STEP;
    add(PAN_R * 0.965, y0 + 0.0021, edge);
    add(PAN_R, y0 + 0.0056, crumb);
    add(PAN_R * 0.988, y0 + 0.0092, crumb);
    add(PAN_R * 0.945, y0 + 0.0114, edge);
    if (k < 2) add(PAN_R * 0.9, y0 + PAN_STEP + 0.0002, seam);
  }
  const yt = 2 * PAN_STEP + PAN_T;
  add(PAN_R * 0.84, yt, face);
  add(PAN_R * 0.45, yt + 0.0007, face);
  add(0.0001, yt + 0.0009, face);
  return { profile: pts as Profile, cols, height: yt + 0.0009 };
});

const pancakeSkin = () => laneMat('pancake', pancakeStack().cols, { flesh: PANC.flesh, cooked: PANC.cooked, roughness: 0.62, mottle: 0.1, cookAmount: 0.55 });
const pancakeFlesh = lazy(() => foodMat({ color: '#f8dfa6', roughness: 0.78, flesh: PANC.flesh, cookColor: PANC.cooked, cookAmount: 0.55 }));

/** Cut face of the stack: three fluffy crumb layers with golden crusts. */
function pancakeSectionV(ctx: CanvasRenderingContext2D, w: number, h: number) {
  const H = pancakeStack().height;
  const Y = (y: number) => (1 - y / H) * h;
  ctx.fillStyle = '#b4702c';
  ctx.fillRect(0, 0, w, h);
  const r = rng(31);
  for (let k = 0; k < 3; k++) {
    const y0 = k * PAN_STEP, y1 = k === 2 ? H : (k + 1) * PAN_STEP;
    const top = Y(y1), bot = Y(y0), th = bot - top;
    const g = ctx.createLinearGradient(0, top, 0, bot);
    g.addColorStop(0, '#c4843a');
    g.addColorStop(0.1, '#e8b462');
    g.addColorStop(0.2, '#f8e1a8');
    g.addColorStop(0.5, '#fbe8b8');
    g.addColorStop(0.8, '#f8e0a6');
    g.addColorStop(0.9, '#e6b05e');
    g.addColorStop(1, '#c08038');
    ctx.fillStyle = g;
    ctx.fillRect(0, top + 0.4, w, th - 0.8);
    for (let i = 0; i < 30; i++) {
      const x = r.range(0, w), y = top + th * r.range(0.25, 0.75), rx = r.range(1.2, 3.6) * (w / 256), ry = Math.max(0.6, rx * r.range(0.4, 0.8));
      ctx.fillStyle = 'rgba(205,160,88,0.5)';
      ctx.beginPath();
      ctx.ellipse(x, y, rx, ry, 0, 0, TAU);
      ctx.fill();
      ctx.fillStyle = 'rgba(255,250,230,0.55)';
      ctx.beginPath();
      ctx.ellipse(x - rx * 0.2, y - ry * 0.3, rx * 0.6, ry * 0.5, 0, 0, TAU);
      ctx.fill();
    }
  }
}

// ---------------------------------------------------------------------------------------------
// Cake: two sponge layers with a cream filling, frosting with gentle drips, piped rosettes and
// decorations from the recipe (strawberries, cherries, berries, fruit wheels, chocolate curls...)

const CAKE = getDef('cake').colors;
const CAKE_R = 0.093;
const CK_L1 = 0.031; // top of the bottom sponge
const CK_F = 0.0085; // filling
const CK_H = CK_L1 + CK_F + 0.031; // top of the sponge
const CK_FT = 0.0062; // frosting on top
const CK_RF = CAKE_R + 0.0034; // frosting outer radius on the side
const CK_E = 0.0042; // frosting edge roll

interface CakeColors {
  frost: string;
  sponge: string;
  side: string;
  filling: string;
  jam: string | null;
  choc: boolean;
}

/** Most colourful non-product ingredient (frosting colour when there is no tint). */
function accentOf(c: Ctx): { id: string; col: string } | null {
  let best: { id: string; col: string } | null = null;
  let bestS = 0.2;
  for (const id of c.ids) {
    if (!hasDef(id) || getDef(id).category === 'product') continue;
    const d = getDef(id);
    const col = d.tags.includes('chocolate') ? d.colors.skin : d.colors.juice ?? d.colors.flesh;
    const hsl = { h: 0, s: 0, l: 0 };
    new THREE.Color(col).getHSL(hsl);
    const s = hsl.s * (1 - Math.abs(hsl.l - 0.5));
    if (s > bestS) {
      bestS = s;
      best = { id, col };
    }
  }
  return best;
}

function cakeColors(c: Ctx): CakeColors {
  const choc = hasTagged(c, 'chocolate');
  let frost: string;
  if (c.tinted || c.isDefault) frost = c.tint;
  else {
    const acc = accentOf(c);
    frost = !acc ? '#fff3e0' : getDef(acc.id).tags.includes('chocolate') ? '#6b3a20' : mixHex(acc.col, '#fff8f0', 0.45);
  }
  const fruit = fruitsOf(c)[0];
  const jam = fruit ? adjust(getDef(fruit).colors.juice ?? getDef(fruit).colors.flesh, 0.82, 1.15) : null;
  return {
    frost,
    sponge: choc ? '#8c5a3a' : CAKE.flesh,
    side: choc ? '#7a4a2c' : '#eec274',
    filling: mixHex('#fff7ea', frost, 0.22),
    jam,
    choc,
  };
}

/** Body profile (bottom -> naked sponge side with the filling bulging out -> top), colour per point. */
function cakeBodyPoints(cc: CakeColors, withTop: boolean): { pts: Pt[]; cols: string[] } {
  const R = CAKE_R, f0 = CK_L1, f1 = CK_L1 + CK_F, mid = (f0 + f1) / 2;
  const pts: Pt[] = [];
  const cols: string[] = [];
  const add = (r: number, y: number, col: string) => {
    pts.push([r, y]);
    cols.push(col);
  };
  add(0.0001, 0, cc.side);
  add(R - 0.006, 0, cc.side);
  for (let k = 1; k < 4; k++) {
    const a = -Math.PI / 2 + (k / 4) * (Math.PI / 2);
    add(R - 0.006 + Math.cos(a) * 0.006, 0.006 + Math.sin(a) * 0.006, cc.side);
  }
  add(R, 0.0062, cc.side);
  add(R + 0.0005, f0 * 0.6, cc.side);
  add(R, f0 - 0.0005, cc.side);
  add(R - 0.0002, f0, cc.filling);
  add(R + 0.0013, f0 + 0.0015, cc.filling);
  if (cc.jam) {
    add(R + 0.0017, mid - 0.0012, cc.filling);
    add(R + 0.0017, mid - 0.0012, cc.jam);
    add(R + 0.0019, mid, cc.jam);
    add(R + 0.0017, mid + 0.0012, cc.jam);
    add(R + 0.0017, mid + 0.0012, cc.filling);
  } else add(R + 0.0018, mid, cc.filling);
  add(R + 0.0013, f1 - 0.0015, cc.filling);
  add(R - 0.0002, f1, cc.filling);
  add(R, f1 + 0.0005, cc.side);
  add(R + 0.0005, (f1 + CK_H) / 2, cc.side);
  add(R, CK_H - 0.002, cc.side);
  if (withTop) {
    add(R - 0.003, CK_H, cc.side);
    add(0.0001, CK_H, cc.side);
  }
  return { pts, cols };
}

/** Greyscale crumb pores for the sponge (multiplies the body's vertex colours; smooth on the filling). */
const cakeCrumbTex = lazy(() => {
  const { pts } = cakeBodyPoints({ frost: '#fff', sponge: '#fff', side: '#fff', filling: '#fff', jam: '#fff', choc: false }, true);
  const look = arcLookup(pts);
  return canvasTexture(
    1024,
    256,
    (ctx, w, h) => {
      const rows = Array.from({ length: h }, (_, py) => look(1 - (py + 0.5) / h));
      paintPixels(ctx, w, h, (px, py) => {
        const [r, y] = rows[py];
        const sponge = y < CK_L1 - 0.0003 || (y > CK_L1 + CK_F + 0.0003 && y < CK_H - 0.0004);
        if (!sponge) return [255, 255, 255];
        const a = ((px + 0.5) / w) * TAU;
        const x = Math.sin(a) * r, z = Math.cos(a) * r;
        const pore = sstep(0.18, 0.4, fbm3(x * 420, y * 420, z * 420, 2));
        const v = 252 - pore * 26 + fbm3(x * 90, y * 90, z * 90, 2) * 10;
        return [v, v * 0.985, v * 0.96];
      });
    },
    { key: 'prod:cake-crumb' },
  );
});

const cakeBodyMat = (sponge: string) =>
  cmat('cake-body:' + sponge, () =>
    foodMat({ color: '#ffffff', vertexColors: true, map: cakeCrumbTex(), roughness: 0.74, sheen: 0.2, sheenColor: '#fff4e0', sheenRoughness: 0.6, flesh: sponge, cookColor: CAKE.cooked, cookAmount: 0.55 }),
  );

const frostMat = (col: string) =>
  cmat('frost:' + col, () =>
    foodMat({ color: col, roughness: 0.28, clearcoat: 0.55, clearcoatRoughness: 0.16, sheen: 0.2, sheenColor: '#ffffff', sheenRoughness: 0.5, flesh: col, cookColor: '#c08a4a', cookAmount: 0.45 }),
  );

/** Drip lengths around the cake (with a soft shoulder where each drip leaves the edge) + extra columns across each drip. */
function cakeDrips(r: Rng): { L: (th: number) => number; cols: number[] } {
  const n = r.int(9, 12);
  const a0 = r.range(0, TAU);
  const drips = Array.from({ length: n }, (_, i) => ({
    a: a0 + ((i + r.range(-0.3, 0.3)) / n) * TAU,
    w: r.range(0.07, 0.105),
    L: r.next() < 0.3 ? r.range(0.005, 0.01) : r.range(0.012, 0.026),
  }));
  const L = (th: number) => {
    let out = 0.0014;
    for (const d of drips) {
      const x = angDist(th, d.a) / d.w;
      if (x < 1) out = Math.max(out, 0.0014 + d.L * Math.pow(1 - x * x, 0.4));
      if (x < 1.8) out = Math.max(out, 0.0014 + Math.min(0.004, d.L * 0.28) * (1 - sstep(0.8, 1.8, x)));
    }
    return out;
  };
  const cols: number[] = [];
  for (const d of drips) for (let k = -3; k <= 3; k++) cols.push(d.a + (k / 3) * d.w * 1.2);
  return { L, cols };
}

/** The frosting band: over the rounded top edge and down the side into drips (adaptive columns). */
function frostBandGeo(L: (th: number) => number, extra: number[]): THREE.BufferGeometry {
  const all: number[] = [];
  for (let i = 0; i < 64; i++) all.push((i / 64) * TAU);
  for (const a of extra) all.push(((a % TAU) + TAU) % TAU);
  all.sort((p, q) => p - q);
  const ths = all.filter((t, i) => i === 0 || t - all[i - 1] > 0.004);
  while (ths.length > 1 && TAU - ths[ths.length - 1] < 0.004) ths.pop();
  const NU = ths.length;
  const Yt = CK_H + CK_FT;
  const cx = CK_RF - CK_E, cy = Yt - CK_E;
  const th0 = CK_RF - CAKE_R;
  // rows from the drip's tucked-in end, up the side, over the edge roll onto the top
  const rowsAt = (Ld: number): Pt[] => {
    const thE = th0 + 0.0011 * Math.min(1, Ld / 0.022);
    const yEnd = cy - Ld;
    const out: Pt[] = [
      [CAKE_R - 0.0005, yEnd - thE * 0.7],
      [CAKE_R + thE * 0.7, yEnd - thE * 0.5],
    ];
    for (let k = 0; k <= 4; k++) {
      const t = 1 - k / 4;
      out.push([CAKE_R + th0 + (thE - th0) * t * t, cy - Ld * t]);
    }
    for (const phi of [Math.PI / 3, Math.PI / 6]) out.push([cx + CK_E * Math.sin(phi), cy + CK_E * Math.cos(phi)]);
    out.push([cx - 0.0015, Yt + 0.0001]);
    return out;
  };
  const rows = ths.map((th) => rowsAt(L(th)));
  return gridGeometry(NU, rows[0].length - 1, (i, j) => {
    const k = i % NU;
    const [r, y] = rows[k][j];
    return [r * Math.sin(ths[k]), y, r * Math.cos(ths[k])];
  });
}

/** Smooth frosting top (tucked under the band's edge roll). */
const frostCapGeo = lazy(() => {
  const Yt = CK_H + CK_FT;
  return revolve(
    [
      [CK_RF - CK_E + 0.0026, Yt - 0.0018],
      [CK_RF - CK_E + 0.0012, Yt - 0.0002],
      [CAKE_R * 0.88, Yt + 0.0002],
      [CAKE_R * 0.66, Yt + 0.0007],
      [CAKE_R * 0.4, Yt + 0.0011],
      [CAKE_R * 0.15, Yt + 0.0013],
      [0.0001, Yt + 0.0013],
    ],
    { segments: 48 },
  );
});

/** Piped star-tip rosette (5 twisted ridges). */
const rosetteGeo = lazy(() => {
  const H = 0.0144;
  const prof = smoothProfile(
    [
      [0.0001, 0],
      [0.0088, 0],
      [0.0099, 0.003],
      [0.0088, 0.0064],
      [0.0062, 0.0095],
      [0.0033, 0.0121],
      [0.0011, 0.0139],
      [0.0001, H],
    ],
    6,
  );
  return revolve(prof, {
    segments: 20,
    map: (_j, th, r, y) => [r * (0.9 + 0.2 * (0.5 + 0.5 * Math.cos(5 * (th + (y / H) * 2.2)))), y],
  });
});

function cakeTopper(c: Ctx, b: Batch, g: THREE.Group, id: string, a: number, x: number, y: number, z: number) {
  const d = getDef(id);
  const out = new THREE.Vector3(Math.sin(a), 0, Math.cos(a));
  if (id === 'strawberry') {
    const tangent = new THREE.Vector3(Math.cos(a), 0, -Math.sin(a));
    const q = new THREE.Quaternion().setFromAxisAngle(tangent, -0.42).multiply(new THREE.Quaternion().setFromAxisAngle(Y_UP, a + Math.PI / 2));
    addStrawberryHalf(b, false, new THREE.Vector3(x, y - 0.0035, z).addScaledVector(out, -0.002), q);
    return;
  }
  if (id === 'cherry') {
    cherry(b, [x, y - 0.0035, z], c.r, 0.85);
    return;
  }
  if (id === 'blueberry' || id === 'grapes') {
    const m = id === 'grapes' ? bitMat(d.colors.skin, 0.3, d.colors.cooked ?? '#4a2252', 0.6) : blueberryMat();
    const s = id === 'grapes' ? 0.0115 : 0.0098;
    const t = new THREE.Vector3(Math.cos(a), 0, -Math.sin(a));
    for (const k of [-1, 1]) b.add(m, placed(ballGeo(), new THREE.Vector3(x, y + s * 0.15, z).addScaledVector(t, k * s * 0.48), undefined, s));
    return;
  }
  const kind = wheelKind(id);
  if (kind !== 'plain') {
    const rw = kind === 'banana' ? 0.0105 : 0.0125;
    const w = fruitWheel(id, rw, 0.0038);
    w.rotation.y = a;
    w.position.set(x, y + rw * 0.2, z);
    g.add(w);
    return;
  }
  b.add(bitMat(d.colors.flesh, 0.3, d.colors.cooked ?? '#8a5a2a', 0.6), placed(chunkGeo(), [x, y + 0.001, z], [c.r.range(-0.3, 0.3), c.r.range(0, TAU), c.r.range(-0.3, 0.3)], 0.0095));
}

function cakeDecor(c: Ctx, cc: CakeColors, b: Batch, g: THREE.Group) {
  const Yt = CK_H + CK_FT;
  const topAt = (rr: number) => Yt + 0.0013 * (1 - sstep(0, CAKE_R * 0.95, rr));
  const fruit = fruitsOf(c)[0];
  const others = solidBits(c).filter((id) => {
    const d = getDef(id);
    return d.category !== 'fruit' && !d.tags.includes('chocolate') && !d.tags.includes('candy') && id !== 'nuts' && !isGreenHerb(id);
  });
  const darkFrost = lightness(cc.frost) < 0.45;
  const rosMat = whippedMat(darkFrost ? '#fff6ea' : mixHex(cc.frost, '#ffffff', 0.6));
  const nR = 8, ringR = CAKE_R * 0.77;
  const a0 = c.r.range(0, TAU);
  for (let k = 0; k < nR; k++) {
    const a = a0 + (k / nR) * TAU;
    const x = Math.sin(a) * ringR, z = Math.cos(a) * ringR;
    const s = c.r.range(1.18, 1.3);
    const y0 = topAt(ringR) - 0.0005;
    b.add(rosMat, placed(rosetteGeo(), [x, y0, z], [0, c.r.range(0, TAU), 0], s));
    const yTop = y0 + 0.0144 * s;
    if (fruit) cakeTopper(c, b, g, fruit, a, x, yTop, z);
    else if (others.length) {
      const bit = bitOf(others[k % others.length], c.r);
      b.add(bitMat(bit.color, 0.4, c.cooked, 0.3), placed(bit.kind === 'leaf' ? herbLeafGeo() : bit.geo, [x, yTop, z], [c.r.range(-0.4, 0.4), c.r.range(0, TAU), c.r.range(-0.4, 0.4)], 0.009));
    }
  }
  if (cc.choc) {
    for (let i = 0; i < 10; i++) {
      const [dx, dz] = c.r.disc();
      const x = dx * ringR * 0.55, z = dz * ringR * 0.55;
      const m = darkFrost && i % 2 === 0 ? whiteChocMat() : chocoMat();
      b.add(m, placed(chocoCurl(c.r, 9, 5), [x, topAt(Math.hypot(x, z)) + 0.0018 + i * 0.0003, z], [c.r.range(-0.4, 0.4), c.r.range(0, TAU), c.r.range(-0.3, 0.3)], 0.9));
    }
  }
  if (hasCandy(c))
    sprinkles(b, c.r, 46, () => {
      const [dx, dz] = c.r.disc();
      const x = dx * ringR * 0.86, z = dz * ringR * 0.86;
      return { p: new THREE.Vector3(x, topAt(Math.hypot(x, z)), z), n: Y_UP.clone() };
    });
  if (has(c, 'nuts')) {
    const nd = getDef('nuts').colors;
    for (let i = 0; i < 16; i++) {
      const [dx, dz] = c.r.disc();
      const x = dx * ringR * 0.6, z = dz * ringR * 0.6;
      b.add(bitMat(nd.flesh, 0.55, nd.cooked ?? c.cooked), placed(nutGeo(), [x, topAt(Math.hypot(x, z)) + 0.0012, z], [c.r.range(0, 3), c.r.range(0, 3), 0], 0.0055));
    }
  }
}

function buildCake(c: Ctx): THREE.Object3D {
  const cc = cakeColors(c);
  const g = new THREE.Group();
  const { pts, cols } = cakeBodyPoints(cc, true);
  g.add(meshOf(revolve(pts, { segments: 40, colors: cols.map((h) => new THREE.Color(h)) }), cakeBodyMat(cc.sponge), 'cake'));
  const drips = cakeDrips(c.r);
  const fm = frostMat(cc.frost);
  g.add(meshOf(frostBandGeo(drips.L, drips.cols), fm, 'frosting'), meshOf(frostCapGeo(), fm, 'frosting-top'));
  const b = new Batch();
  cakeDecor(c, cc, b, g);
  b.addTo(g);
  g.rotation.y = c.r.range(0, TAU);
  return sitOnGround(g);
}

/** Generic wedge profile (default look) with a colour per point. */
const cakeProfile = lazy(() => {
  const cc: CakeColors = { frost: DEFAULTS.cake.tint!, sponge: CAKE.flesh, side: '#eec274', filling: mixHex('#fff7ea', DEFAULTS.cake.tint!, 0.22), jam: '#c8304a', choc: false };
  const { pts, cols } = cakeBodyPoints(cc, false);
  const Yt = CK_H + CK_FT;
  // the naked side stops where the frosting lip starts (duplicate point = crisp colour change)
  pts.pop();
  cols.pop();
  pts.push([CAKE_R, CK_H - 0.006]);
  cols.push(cc.side);
  const add = (r: number, y: number) => {
    pts.push([r, y]);
    cols.push(cc.frost);
  };
  add(CAKE_R, CK_H - 0.006);
  add(CAKE_R + 0.0028, CK_H - 0.0058);
  add(CK_RF, CK_H - 0.0035);
  add(CK_RF, CK_H + 0.0012);
  add(CK_RF - 0.0014, Yt - 0.0009);
  add(CK_RF - CK_E, Yt);
  add(CAKE_R * 0.6, Yt + 0.0009);
  add(0.0001, Yt + 0.0013);
  return { profile: pts as Profile, cols, height: Yt + 0.0013, maxR: CK_RF, cc };
});

const cakeSkin = () => laneMat('cake', cakeProfile().cols, { flesh: CAKE.flesh, cooked: CAKE.cooked, roughness: 0.55, mottle: 0.05, cookAmount: 0.5 });
const cakeFlesh = lazy(() => foodMat({ color: CAKE.flesh, roughness: 0.78, flesh: CAKE.flesh, cookColor: CAKE.cooked, cookAmount: 0.5 }));

/** Cut face: sponge / cream + jam / sponge / frosting, golden crust on the outside. */
function cakeSectionV(ctx: CanvasRenderingContext2D, w: number, h: number) {
  const info = cakeProfile();
  const H = info.height;
  const Y = (y: number) => (1 - y / H) * h;
  const X = (x: number) => w / 2 + (x / info.maxR) * (w / 2);
  ctx.fillStyle = info.cc.frost;
  ctx.fillRect(0, 0, w, h);
  const r = rng(47);
  const sponge = (y0: number, y1: number, bottomCrust: boolean) => {
    const top = Y(y1), bot = Y(y0);
    const g = ctx.createLinearGradient(0, top, 0, bot);
    g.addColorStop(0, '#f6da96');
    g.addColorStop(0.5, '#f3d38a');
    g.addColorStop(bottomCrust ? 0.88 : 1, '#f0cd80');
    if (bottomCrust) g.addColorStop(1, '#c98f45');
    ctx.fillStyle = g;
    ctx.fillRect(0, top, w, bot - top);
    for (let i = 0; i < 70; i++) {
      const x = r.range(0, w), y = r.range(top + 1, bot - 1), rx = r.range(0.8, 2.6) * (w / 256), ry = rx * r.range(0.6, 1);
      ctx.fillStyle = r.next() < 0.6 ? 'rgba(201,150,70,0.45)' : 'rgba(255,246,214,0.7)';
      ctx.beginPath();
      ctx.ellipse(x, y, rx, ry, 0, 0, TAU);
      ctx.fill();
    }
    // golden crust where the sponge meets the outside
    ctx.fillStyle = '#e0a957';
    for (const s of [-1, 1]) {
      const x0 = X(s * (CAKE_R - 0.0016)), x1 = X(s * CAKE_R);
      ctx.fillRect(Math.min(x0, x1), top, Math.abs(x1 - x0) + 1, bot - top);
    }
  };
  sponge(0, CK_L1, true);
  sponge(CK_L1 + CK_F, CK_H, false);
  const f0 = Y(CK_L1 + CK_F), f1 = Y(CK_L1);
  ctx.fillStyle = info.cc.filling;
  ctx.fillRect(0, f0, w, f1 - f0);
  ctx.fillStyle = info.cc.jam ?? info.cc.filling;
  ctx.fillRect(0, f0 + (f1 - f0) * 0.36, w, (f1 - f0) * 0.28);
}

// ---------------------------------------------------------------------------------------------
// Flatbread: a soft, puffy round with blistered, toasty char spots

const FLATB = getDef('flatbread').colors;
const FB_R = 0.092;
const FB_TOP = 9; // first profile point of the top face

const flatbreadProfile = lazy((): Profile => [
  [0.0001, 0.0002],
  [0.035, 0],
  [0.07, 0],
  [0.084, 0.0004],
  [0.0895, 0.0016],
  [0.0918, 0.0038],
  [FB_R, 0.0058],
  [0.0905, 0.0082],
  [0.0868, 0.0098],
  [0.083, 0.0101],
  [0.077, 0.0102],
  [0.07, 0.0097],
  [0.063, 0.0092],
  [0.056, 0.009],
  [0.049, 0.0089],
  [0.042, 0.0089],
  [0.035, 0.009],
  [0.028, 0.0091],
  [0.021, 0.0092],
  [0.014, 0.0092],
  [0.007, 0.0093],
  [0.0001, 0.0093],
]);

/** Blisters (fixed layout so the char spots of the cached texture sit on them). */
const FB_BLISTERS = lazy(() => {
  const r = rng(4242);
  const list: { x: number; z: number; rad: number; h: number }[] = [];
  for (let i = 0; i < 90 && list.length < 24; i++) {
    const [dx, dz] = r.disc();
    const x = dx * FB_R * 0.78, z = dz * FB_R * 0.78;
    const rad = r.range(0.0055, 0.0135);
    if (list.some((b) => Math.hypot(b.x - x, b.z - z) < (b.rad + rad) * 0.85)) continue;
    list.push({ x, z, rad, h: r.range(0.0011, 0.0026) * (0.4 + rad / 0.0135) });
  }
  return list;
});

const flatbreadTex = lazy(() =>
  canvasTexture(
    512,
    512,
    (ctx, s) => {
      const bl = FB_BLISTERS();
      const dough = rgb('#f1d59c'), light = rgb('#f8e6bf'), gold = rgb('#e0aa5e'), toast = rgb('#c4843e'), charA = rgb('#7a4420'), charB = rgb('#4b2a12');
      paintPlanar(ctx, s, FB_R * 1.1, (x, z) => {
        const rr = Math.hypot(x, z);
        const n = fbm3(x * 40, z * 40, 0.7, 3);
        let c = lerp3(dough, light, clamp01(0.45 + n * 1.2));
        c = lerp3(c, gold, clamp01(sstep(FB_R * 0.8, FB_R * 0.97, rr) * 0.7 + clamp01(-n - 0.12) * 0.5));
        for (const b of bl) {
          const d = Math.hypot(x - b.x, z - b.z) / b.rad;
          if (d > 1.7) continue;
          const e = fbm3(x * 140 + b.x * 50, z * 140, 1.9, 2);
          c = lerp3(c, toast, (1 - sstep(0.75, 1.6, d + e * 0.35)) * 0.8);
          const core = 1 - sstep(0.15, 0.7, d + e * 0.5);
          c = lerp3(c, lerp3(charA, charB, clamp01(0.5 + e * 2)), core * 0.9);
        }
        const f = fbm3(x * 260, z * 260, 3.3, 2);
        return lerp3(c, toast, sstep(0.27, 0.4, f) * 0.55);
      });
      specks(ctx, s, s, '#fffaf0', { count: 900, size: [0.6, 1.4], alpha: 0.35, seed: 61 });
    },
    { key: 'prod:flatbread' },
  ),
);

const flatbreadMat = lazy(() =>
  foodMat({
    color: '#ffffff',
    map: flatbreadTex(),
    bumpMap: bumpNoiseTexture('prod:flatbread-bump', 48),
    bumpScale: 0.5,
    roughness: 0.76,
    sheen: 0.22,
    sheenColor: '#fff3da',
    sheenRoughness: 0.7,
    flesh: FLATB.flesh,
    cookColor: FLATB.cooked,
    cookAmount: 0.6,
  }),
);

function buildFlatbread(c: Ctx): THREE.Object3D {
  const seed = c.r.range(0, 40), ph = c.r.range(0, TAU);
  const bl = FB_BLISTERS();
  const geo = revolve(flatbreadProfile(), {
    segments: 96,
    uv: 'planar',
    planar: FB_R * 1.1,
    map: (j, th, r, y) => {
      const x = r * Math.sin(th), z = r * Math.cos(th);
      const out = 1 + 0.024 * Math.sin(th * 2 + ph) + 0.014 * Math.sin(th * 3 + ph * 1.7) + 0.02 * fbm3(Math.cos(th) * 1.3 + seed, Math.sin(th) * 1.3, seed, 2);
      let dy = 0;
      if (j >= FB_TOP) {
        let hb = 0;
        for (const b of bl) {
          const d = Math.hypot(x - b.x, z - b.z) / b.rad;
          if (d < 1) hb = Math.max(hb, b.h * bump(d));
        }
        dy = hb * (1 - sstep(0.074, 0.086, r)) + 0.0005 * fbm3(x * 80 + seed, z * 80, 0.5, 2);
      }
      return [r * (1 + (out - 1) * sstep(0.068, 0.092, r)), y + dy];
    },
  });
  const g = new THREE.Group();
  g.add(meshOf(geo, flatbreadMat(), 'flatbread'));
  // herbs baked on top
  const herbs = c.ids.filter(isGreenHerb);
  if (herbs.length) {
    const b = new Batch();
    const m = bitMat(getDef(herbs[0]).colors.skin, 0.45, '#2a4a1a', 0.2);
    for (const [x, z] of scatter(c.r, 18, FB_R * 0.72, 0.01)) b.add(m, placed(fleckGeo(), [x, 0.0098, z], [c.r.range(-0.2, 0.2), c.r.range(0, TAU), 0], c.r.range(0.004, 0.0065)));
    b.addTo(g);
  }
  g.rotation.y = c.r.range(0, TAU);
  return sitOnGround(g);
}

const flatbreadLanes = lazy(() => flatbreadProfile().map((_, j) => (j < 5 ? '#d29a52' : j < FB_TOP ? '#e3b26a' : '#efd296')));
const flatbreadSkin = () => laneMat('flatbread', flatbreadLanes(), { flesh: FLATB.flesh, cooked: FLATB.cooked, roughness: 0.74, mottle: 0.14, cookAmount: 0.6 });
const flatbreadFlesh = lazy(() => foodMat({ color: FLATB.flesh, roughness: 0.8, flesh: FLATB.flesh, cookColor: FLATB.cooked, cookAmount: 0.6 }));

function flatbreadSectionV(ctx: CanvasRenderingContext2D, w: number, h: number) {
  const g = ctx.createLinearGradient(0, 0, 0, h);
  g.addColorStop(0, '#cf9550');
  g.addColorStop(0.14, '#f2d9a6');
  g.addColorStop(0.5, '#f6e3b8');
  g.addColorStop(0.86, '#f2d9a6');
  g.addColorStop(1, '#c48a46');
  ctx.fillStyle = g;
  ctx.fillRect(0, 0, w, h);
  const r = rng(53);
  for (let i = 0; i < 60; i++) {
    const x = r.range(0, w), y = r.range(h * 0.25, h * 0.75), rx = r.range(1, 4) * (w / 256), ry = Math.max(0.6, rx * r.range(0.3, 0.6));
    ctx.fillStyle = 'rgba(200,160,96,0.45)';
    ctx.beginPath();
    ctx.ellipse(x, y, rx, ry, 0, 0, TAU);
    ctx.fill();
  }
}

/** Tiny flat fleck (chopped herbs, crumbs). */
const fleckGeo = lazy(() => {
  const g = new THREE.IcosahedronGeometry(0.5, 0);
  g.scale(1, 0.22, 0.65);
  return g;
});

// ---------------------------------------------------------------------------------------------
// Fried egg: an irregular white splat with lacy golden crispy edges and a glossy domed yolk

const FEGG = getDef('fried-egg').colors;
const EGG_R = 0.06;
/** Rows of the white (rim -> centre), as fractions of the outline radius. */
const EGG_RHO = [1, 0.992, 0.978, 0.958, 0.932, 0.9, 0.86, 0.81, 0.75, 0.67, 0.58, 0.48, 0.37, 0.26, 0.15, 0.06, 0];
/** Rows before this form the crispy rim (its own material: browns faster). */
const EGG_SPLIT = 7;

/** Polar texture (u = angle, v = radius fraction): soft white, lacy golden-brown crispy rim. */
const eggWhiteTex = lazy(() =>
  canvasTexture(
    1024,
    256,
    (ctx, w, h) => {
      const white = rgb('#fbfaf3'), thin = rgb('#ebede6'), cream = rgb('#f4efdf');
      const gold = rgb('#efc46a'), brown = rgb('#c27d38'), deep = rgb('#92541f');
      paintPixels(ctx, w, h, (px, py) => {
        const rho = 1 - (py + 0.5) / h;
        const a = ((px + 0.5) / w) * TAU;
        const ca = Math.cos(a), sa = Math.sin(a);
        const x = ca * rho, z = sa * rho;
        const n = fbm3(x * 9, z * 9, 0.5, 3);
        let c = lerp3(white, thin, clamp01(sstep(0.4, 0.82, rho) * (0.3 + n * 1.4)));
        c = lerp3(c, cream, clamp01(0.25 + n) * 0.35);
        // lacy crispy rim
        const edge = 0.81 + 0.07 * fbm3(ca * 3, sa * 3, 2.5, 3);
        const lace = fbm3(x * 34, z * 34, 4.4, 3);
        const t = sstep(edge - 0.05, edge + 0.07, rho + lace * 0.09);
        let rim = lerp3(gold, brown, clamp01(sstep(edge, 1.0, rho) + lace * 0.9));
        rim = lerp3(rim, deep, sstep(0.12, 0.3, fbm3(x * 95, z * 95, 7.1, 2)) * 0.55 * sstep(edge, 0.98, rho));
        rim = lerp3(rim, white, sstep(0.2, 0.36, fbm3(x * 60, z * 60, 9.3, 2)) * 0.35 * (1 - sstep(edge + 0.05, 0.97, rho)));
        return lerp3(c, rim, t);
      });
    },
    { key: 'prod:egg-white' },
  ),
);
const eggWhiteMat = (rim: boolean) =>
  cmat('egg-white:' + rim, () =>
    foodMat({ color: '#ffffff', map: eggWhiteTex(), roughness: 0.3, clearcoat: 0.45, clearcoatRoughness: 0.28, flesh: FEGG.flesh, cookColor: FEGG.cooked, cookAmount: rim ? 0.9 : 0.32 }),
  );

const yolkGeo = lazy(() => {
  // from the base edge up to the top (outward-facing like a lathe's outside)
  const prof = smoothProfile(
    [
      [0.0216, 0],
      [0.0212, 0.0007],
      [0.0205, 0.0026],
      [0.0184, 0.0062],
      [0.0138, 0.0101],
      [0.0075, 0.0124],
      [0.0001, 0.0131],
    ],
    12,
  );
  const top = new THREE.Color('#ff9c10'), mid = new THREE.Color('#ffb020'), base = new THREE.Color('#ffc443'), film = new THREE.Color('#fde3a0');
  const colors = prof.map(([, y]) => {
    const t = y / 0.0131;
    return t > 0.5 ? mid.clone().lerp(top, (t - 0.5) / 0.5) : t > 0.12 ? base.clone().lerp(mid, (t - 0.12) / 0.38) : film.clone().lerp(base, t / 0.12);
  });
  return revolve(prof, { segments: 40, colors });
});
const yolkMat = lazy(() => foodMat({ color: '#ffffff', vertexColors: true, roughness: 0.12, clearcoat: 1, clearcoatRoughness: 0.05, flesh: '#ffb21e', cookColor: '#e8a43a', cookAmount: 0.3 }));

function buildFriedEgg(c: Ctx): THREE.Object3D {
  const r = c.r;
  const seed = r.range(0, 40), ph = r.range(0, TAU);
  const ya = r.range(0, TAU), yd = r.range(0.005, 0.012);
  const yx = Math.sin(ya) * yd, yz = Math.cos(ya) * yd;
  const NU = 96;
  const outline = (th: number) =>
    EGG_R * (1 + 0.1 * fbm3(Math.cos(th) * 1.3 + seed, Math.sin(th) * 1.3 - seed, seed * 0.3, 3) + 0.04 * Math.sin(th * 3 + ph) + 0.022 * Math.sin(th * 5 + ph * 2.3));
  const frill = (th: number) => fbm3(Math.cos(th) * 6 + seed, Math.sin(th) * 6 - seed, 2.7, 2);
  const heightAt = (x: number, z: number, rho: number, th: number) => {
    const d = Math.hypot(x - yx, z - yz);
    const thick = 0.0038 * Math.exp(-((d / 0.02) ** 2)) + 0.0011 * Math.exp(-((d / 0.034) ** 2));
    const body = 0.0027 + 0.00045 * fbm3(x * 75 + seed, z * 75, 0.7, 2) + thick;
    const edge = Math.sqrt(clamp01((1 - rho) / 0.085));
    const crinkle = 0.0005 * frill(th * 1.7 + 1) * sstep(0.9, 0.99, rho);
    return Math.max(0.00005, body * edge + crinkle);
  };
  const geo = gridGeometry(
    NU,
    EGG_RHO.length - 1,
    (i, j) => {
      const th = i === NU ? 0 : (i / NU) * TAU;
      const rho = EGG_RHO[j];
      const R = outline(th) * (1 + 0.035 * frill(th) * sstep(0.9, 1, rho));
      const x = Math.sin(th) * R * rho, z = Math.cos(th) * R * rho;
      return [x, heightAt(x, z, rho, th), z];
    },
    { uv: (i, j) => [i / NU, EGG_RHO[j]], splitRow: EGG_SPLIT },
  );
  const g = new THREE.Group();
  g.add(meshOf(geo, [eggWhiteMat(true), eggWhiteMat(false)], 'egg-white'));
  const yolk = meshOf(yolkGeo(), yolkMat(), 'yolk');
  yolk.position.set(yx, heightAt(yx, yz, 0.2, 0) - 0.001, yz);
  yolk.rotation.y = r.range(0, TAU);
  g.add(yolk);
  return sitOnGround(g);
}

/** Generic wedge profile: rim -> white -> yolk dome, with a colour per point. */
const friedEggProfile = lazy(() => {
  const W = '#fbfaf3', G = '#e9b860', B = '#c07a36', Y = '#ffb020', YT = '#ff9f14', YB = '#ffc848';
  const P: [number, number, string][] = [
    [0.0001, 0, G],
    [0.045, 0, G],
    [0.056, 0.0003, B],
    [0.0598, 0.0011, B],
    [0.06, 0.0019, B],
    [0.0585, 0.0026, G],
    [0.054, 0.003, W],
    [0.042, 0.0031, W],
    [0.033, 0.0037, W],
    [0.027, 0.0056, W],
    [0.0232, 0.0066, W],
    [0.0232, 0.0066, YB],
    [0.0214, 0.0082, Y],
    [0.019, 0.0118, Y],
    [0.0148, 0.0152, Y],
    [0.0088, 0.0176, YT],
    [0.0001, 0.0186, YT],
  ];
  return { profile: P.map((p) => [p[0], p[1]] as Pt) as Profile, cols: P.map((p) => p[2]) };
});
const friedEggSkin = () => laneMat('fried-egg', friedEggProfile().cols, { flesh: FEGG.flesh, cooked: FEGG.cooked, roughness: 0.3, clearcoat: 0.6, mottle: 0.04, cookAmount: 0.4 });
const friedEggFlesh = lazy(() => foodMat({ color: FEGG.flesh, roughness: 0.35, clearcoat: 0.4, flesh: FEGG.flesh, cookColor: FEGG.cooked, cookAmount: 0.4 }));

function friedEggSectionV(ctx: CanvasRenderingContext2D, w: number, h: number) {
  const H = 0.0186, maxR = 0.06;
  ctx.fillStyle = '#fbfaf3';
  ctx.fillRect(0, 0, w, h);
  // crisp golden underside
  const g = ctx.createLinearGradient(0, h * 0.82, 0, h);
  g.addColorStop(0, 'rgba(233,184,96,0)');
  g.addColorStop(1, 'rgba(214,150,70,0.85)');
  ctx.fillStyle = g;
  ctx.fillRect(0, h * 0.82, w, h * 0.18);
  // runny yolk, cooked a little at its edge
  const cx = w / 2, cy = (1 - 0.006 / H) * h, rx = (0.0228 / maxR) * (w / 2), ry = ((H - 0.006) / H) * h;
  const yg = ctx.createRadialGradient(cx, cy, 0, cx, cy, Math.max(rx, ry));
  yg.addColorStop(0, '#ffa10f');
  yg.addColorStop(0.75, '#ffb21e');
  yg.addColorStop(1, '#ffd060');
  ctx.fillStyle = yg;
  ctx.beginPath();
  ctx.ellipse(cx, cy, rx, ry, 0, Math.PI, TAU);
  ctx.fill();
}

// ---------------------------------------------------------------------------------------------
// Scrambled eggs: a fluffy, glossy pile of soft yellow curds

const SCRAM = getDef('scrambled-eggs').colors;

/** Soft, puffy curds (unit size): rounded lumps with a gentle fold. Two levels of detail. */
const curdGeos = lazy(() =>
  Array.from({ length: 6 }, (_, k) => {
    const g: THREE.BufferGeometry = new THREE.IcosahedronGeometry(0.5, k < 3 ? 3 : 2);
    const s = k * 7.3 + 1.1;
    deform(g, (p) => {
      p.set(p.x * 1.22, p.y * 0.6, p.z * 0.94);
      p.multiplyScalar(1 + fbm3(p.x * 2 + s, p.y * 2, p.z * 2 - s, 3) * 0.28);
      // a soft fold across the curd, ends curling up a little
      p.y += 0.07 * Math.sin(p.x * 5.5 + s) * (p.y > 0 ? 1 : 0.4) + 0.12 * (p.x * p.x - 0.12) - 0.05 * Math.cos(p.z * 6 + s);
    });
    return g;
  }),
);

function buildScrambled(c: Ctx): THREE.Object3D {
  const base = c.tinted ? mixHex(SCRAM.flesh, c.tint, 0.5) : SCRAM.flesh;
  const light = new THREE.Color(mixHex(base, '#fff6d0', 0.5));
  const deep = new THREE.Color(adjust(base, 0.94, 1.08));
  const mat = vcMat('scrambled:' + base, { roughness: 0.3, clearcoat: 0.6, sheen: 0.25, flesh: base, cooked: SCRAM.cooked ?? c.cooked, cookAmount: 0.6 });
  const b = new Batch();
  // a hidden core keeps the heap solid
  const core = revolve(
    smoothProfile(
      [
        [0.0001, 0],
        [0.036, 0],
        [0.038, 0.006],
        [0.03, 0.019],
        [0.015, 0.027],
        [0.0001, 0.029],
      ],
      8,
    ),
    { segments: 18 },
  );
  b.add(mat, colored(core, adjust(base, 0.95)));
  const R = 0.046, H = 0.036, N = 22;
  const ph = c.r.range(0, TAU);
  const curds: { x: number; y: number; z: number; s: number }[] = [];
  for (let i = 0; i < N; i++) {
    const f = (i + 0.5) / N;
    const d = R * Math.sqrt(f) * c.r.range(0.88, 1.04);
    const a = i * 2.399963 + ph + c.r.range(-0.2, 0.2);
    const x = Math.sin(a) * d, z = Math.cos(a) * d;
    const R2 = R * 1.1;
    const u = Math.max(0, 1 - (d / R2) ** 2);
    const s = THREE.MathUtils.lerp(0.026, 0.036, f) * c.r.range(0.9, 1.1);
    const y = Math.max(s * 0.3, H * Math.pow(u, 0.7) - s * 0.15);
    // lie along the heap's slope
    const slope = H * 0.7 * Math.pow(Math.max(u, 0.05), -0.3) * ((2 * d) / (R2 * R2));
    const tilt = new THREE.Quaternion().setFromAxisAngle(new THREE.Vector3(Math.cos(a), 0, -Math.sin(a)), Math.min(0.9, Math.atan(slope)));
    const q = tilt.multiply(new THREE.Quaternion().setFromEuler(new THREE.Euler(c.r.range(-0.25, 0.25), c.r.range(0, TAU), c.r.range(-0.25, 0.25))));
    const geos = curdGeos();
    const geo = placed(geos[(i < N * 0.55 ? 0 : 3) + c.r.int(0, 2)], [x, y, z], q, [s, s * c.r.range(0.9, 1.15), s]);
    const cA = new THREE.Color(base).lerp(light, c.r.range(0, 0.3));
    const ns = c.r.range(0, 20);
    paintVertices(geo, (p) => {
      const t = clamp01((p.y - y) / (s * 0.35) + 0.4);
      return cA.clone().lerp(deep, (1 - t) * 0.5).lerp(light, clamp01(t * 0.3 + fbm3(p.x * 220 + ns, p.y * 220, p.z * 220, 2) * 0.5));
    });
    b.add(mat, geo);
    curds.push({ x, y, z, s });
  }
  const upper = curds.slice(Math.floor(N * 0.3));
  // chopped herbs on top
  const herbs = c.ids.filter(isGreenHerb);
  if (herbs.length) {
    const m = bitMat(getDef(herbs[0]).colors.skin, 0.45, '#2a4a1a', 0.2);
    for (let i = 0; i < 16; i++) {
      const cu = c.r.pick(upper);
      b.add(m, placed(fleckGeo(), [cu.x + c.r.range(-0.5, 0.5) * cu.s * 0.5, cu.y + cu.s * 0.3, cu.z + c.r.range(-0.5, 0.5) * cu.s * 0.5], [c.r.range(-0.4, 0.4), c.r.range(0, TAU), c.r.range(-0.4, 0.4)], c.r.range(0.004, 0.006)));
    }
  }
  // other bits folded through
  const bits = solidBits(c).filter((i) => !isGreenHerb(i)).slice(0, 2);
  for (const id of bits) {
    const bit = bitOf(id, c.r);
    const m = bitMat(bit.color, 0.4, getDef(id).colors.cooked ?? c.cooked, 0.3);
    for (let i = 0; i < 7; i++) {
      const cu = c.r.pick(upper);
      b.add(m, placed(bit.geo, [cu.x + c.r.range(-0.5, 0.5) * cu.s * 0.45, cu.y + cu.s * 0.24, cu.z + c.r.range(-0.5, 0.5) * cu.s * 0.45], [c.r.range(0, 3), c.r.range(0, 3), c.r.range(0, 3)], bit.kind === 'ball' ? 0.0075 : 0.007));
    }
  }
  return sitOnGround(b.addTo(new THREE.Group()));
}

const scrambledFlesh = lazy(() => foodMat({ color: SCRAM.flesh, roughness: 0.4, clearcoat: 0.4, flesh: SCRAM.flesh, cookColor: SCRAM.cooked, cookAmount: 0.6 }));

// ---------------------------------------------------------------------------------------------
// Omelet: a folded half-moon, golden with light browning, fillings peeking out of the seam

const OMEL = getDef('omelet').colors;
const OM_R = 0.076;
const OM_H = 0.024; // thickness at the fold
const OM_CZ = 0.031; // centre of the half-moon (the fold runs along x at z = 0, the open arc towards +z)
const OM_S = 0.082; // planar texture half-size
const OM_ZC = 0.036; // planar texture centre (z)

const omeletOutline = lazy((): Pt[] => {
  const pts: Pt[] = [
    [0, 0],
    [OM_R, 0],
  ];
  for (let k = 1; k < 28; k++) {
    const a = (k / 28) * Math.PI;
    pts.push([Math.cos(a) * OM_R, Math.sin(a) * OM_R]);
  }
  pts.push([-OM_R, 0], [0, 0]);
  return fillet(
    pts,
    pts.map((_, i) => (i === 1 || i === pts.length - 2 ? 0.017 : 0)),
    6,
  ) as Pt[];
});

/** Distance from (cx, cz) along (dx, dz) to a polyline. */
function rayDist(poly: Pt[], cx: number, cz: number, dx: number, dz: number): number {
  let best = Infinity;
  for (let i = 0; i < poly.length - 1; i++) {
    const [ax, az] = poly[i], [bx, bz] = poly[i + 1];
    const ex = bx - ax, ez = bz - az;
    const den = dx * ez - dz * ex;
    if (Math.abs(den) < 1e-12) continue;
    const wx = ax - cx, wz = az - cz;
    const t = (wx * ez - wz * ex) / den;
    const u = (wx * dz - wz * dx) / den;
    if (t > 0 && u >= -1e-9 && u <= 1 + 1e-9) best = Math.min(best, t);
  }
  return Number.isFinite(best) ? best : OM_R * 0.5;
}

/** Pillow cross-section [fraction of the outline distance, fraction of the height], bottom centre -> seam -> top centre. */
const OM_ROWS: [number, number][] = [
  [0, 0],
  [0.5, 0],
  [0.8, 0.012],
  [0.92, 0.06],
  [0.975, 0.16],
  [0.997, 0.29],
  [1, 0.42],
  [0.993, 0.54],
  [0.97, 0.67],
  [0.925, 0.79],
  [0.85, 0.89],
  [0.72, 0.96],
  [0.5, 0.995],
  [0.25, 1.005],
  [0, 1.01],
];

function omeletTex(col: string): THREE.Texture {
  return canvasTexture(
    512,
    512,
    (ctx, s) => {
      const base = rgb(col), light = rgb(mixHex(col, '#fff4c8', 0.35)), gold = rgb(mixHex(col, '#e09a38', 0.55)), brown = rgb(mixHex(col, '#c27a2a', 0.72));
      paintPlanar(ctx, s, OM_S, (x, z) => {
        const n = fbm3(x * 34, z * 34, 0.4, 3);
        let c = lerp3(base, light, clamp01(0.35 + n));
        const swirl = fbm3(x * 14 + Math.sin(z * 30) * 0.3, z * 14, 2.2, 3);
        c = lerp3(c, gold, sstep(0.04, 0.32, swirl) * 0.6);
        c = lerp3(c, brown, sstep(0.22, 0.45, swirl + n * 0.3) * 0.42);
        return lerp3(c, brown, sstep(0.3, 0.42, fbm3(x * 220, z * 220, 5.5, 2)) * 0.45);
      });
    },
    { key: 'prod:omelet:' + col },
  );
}
const omeletMat = (col: string) =>
  cmat('omelet:' + col, () =>
    foodMat({ color: '#ffffff', map: omeletTex(col), roughness: 0.42, clearcoat: 0.3, clearcoatRoughness: 0.3, sheen: 0.2, sheenColor: '#fff6d8', sheenRoughness: 0.6, flesh: OMEL.flesh, cookColor: OMEL.cooked, cookAmount: 0.55 }),
  );

/** A filling bit for the omelet seam, coloured from the ingredient's flesh. */
function fillingBit(c: Ctx, id: string): { geo: THREE.BufferGeometry; mat: THREE.Material; size: V3; leaf: boolean } {
  const d = getDef(id);
  const cooked = d.colors.cooked ?? c.cooked;
  if (isGreenHerb(id)) return { geo: herbLeafGeo(), mat: bitMat(d.colors.flesh, 0.45, '#2a4a1a', 0.2), size: [0.013, 0.013, 0.013], leaf: true };
  if (d.tags.includes('cheese')) return { geo: chunkGeo(), mat: bitMat(mixHex(d.colors.flesh, '#f0a020', 0.3), 0.22, cooked, 0.7), size: [0.013, 0.0042, 0.0095], leaf: false };
  const bit = bitOf(id, c.r);
  if (bit.kind === 'ball' || bit.kind === 'pebble') return { geo: bit.geo, mat: bitMat(bit.color, 0.4, cooked, 0.3), size: [0.0085, 0.0085, 0.0085], leaf: false };
  return { geo: chunkGeo(), mat: bitMat(d.category === 'meat' ? mixHex(d.colors.flesh, cooked, 0.25) : d.colors.flesh, 0.4, cooked, 0.3), size: [0.009, 0.0062, 0.0085], leaf: false };
}

function buildOmelet(c: Ctx): THREE.Object3D {
  const col = c.tinted ? mixHex(OMEL.skin, c.tint, 0.4) : OMEL.skin;
  const poly = omeletOutline();
  const seed = c.r.range(0, 30);
  const kinds = solidBits(c).slice(0, 4);
  const groove = kinds.length ? 1 : 0.35;
  const NU = 96;
  const cols = Array.from({ length: NU }, (_, i) => {
    const th = (i / NU) * TAU;
    const dx = Math.sin(th), dz = Math.cos(th);
    const d = rayDist(poly, 0, OM_CZ, dx, dz) * (1 + 0.018 * fbm3(dx * 1.5 + seed, dz * 1.5, seed, 2));
    const ez = (OM_CZ + dz * d) / OM_R;
    return { dx, dz, d, arc: sstep(0.28, 0.6, ez), H: OM_H * THREE.MathUtils.lerp(1, 0.5, sstep(0.05, 0.95, ez)) };
  });
  const Hc = OM_H * 0.8;
  const geo = gridGeometry(
    NU,
    OM_ROWS.length - 1,
    (i, j) => {
      const k0 = cols[i % NU];
      const [k, yf] = OM_ROWS[j];
      let kk = k * (1 - 0.06 * groove * k0.arc * Math.exp(-(((yf - 0.42) / 0.075) ** 2)));
      kk *= 1 + 0.012 * k0.arc * sstep(0.45, 0.6, yf) * (1 - sstep(0.7, 0.85, yf));
      const top = yf > 0.5;
      const H = top ? THREE.MathUtils.lerp(Hc, k0.H, sstep(0, 1, k)) : k0.H;
      const x = k0.dx * k0.d * kk, z = OM_CZ + k0.dz * k0.d * kk;
      const wob = top ? 0.0007 * fbm3(x * 60 + seed, z * 60, 0.3, 2) * k : 0;
      return [x, yf * H + wob, z];
    },
    { uv: (_i, _j, p) => [0.5 + p[0] / (2 * OM_S), 0.5 - (p[2] - OM_ZC) / (2 * OM_S)] },
  );
  const g = new THREE.Group();
  g.add(meshOf(geo, omeletMat(col), 'omelet'));
  // fillings peeking out of the seam along the open side
  if (kinds.length) {
    const b = new Batch();
    const arcCols = cols.filter((k0) => k0.arc > 0.65);
    const n = 15;
    for (let m = 0; m < n && arcCols.length; m++) {
      const k0 = arcCols[Math.min(arcCols.length - 1, Math.floor(((m + c.r.range(0.2, 0.8)) / n) * arcCols.length))];
      const fb = fillingBit(c, kinds[m % kinds.length]);
      const out = new THREE.Vector3(k0.dx, 0, k0.dz);
      const p = new THREE.Vector3(k0.dx * k0.d * 0.95, 0.42 * k0.H, OM_CZ + k0.dz * k0.d * 0.95);
      if (fb.leaf) {
        const dir = out.clone().add(new THREE.Vector3(0, -0.35, 0)).add(randDir(c.r).multiplyScalar(0.3)).normalize();
        const q = new THREE.Quaternion().setFromUnitVectors(new THREE.Vector3(0, 0, 1), dir);
        b.add(fb.mat, placed(fb.geo, p.clone().addScaledVector(out, -0.002), q, fb.size));
      } else {
        const q = new THREE.Quaternion().setFromAxisAngle(Y_UP, Math.atan2(k0.dx, k0.dz) + c.r.range(-0.4, 0.4)).multiply(new THREE.Quaternion().setFromEuler(new THREE.Euler(c.r.range(-0.3, 0.3), 0, c.r.range(-0.3, 0.3))));
        const k = c.r.range(0.85, 1.15);
        b.add(fb.mat, placed(fb.geo, p.clone().addScaledVector(out, fb.size[2] * 0.18), q, [fb.size[0] * k, fb.size[1] * k, fb.size[2] * k]));
      }
    }
    b.addTo(g);
  }
  g.rotation.y = c.r.range(0, TAU);
  return sitOnGround(g);
}

/** Generic wedge profile: a puffy folded pillow. */
const omeletProfile = lazy((): Profile =>
  smoothProfile(
    [
      [0.0001, 0],
      [0.04, 0],
      [0.054, 0.0012],
      [0.059, 0.005],
      [0.06, 0.0095],
      [0.0592, 0.0125],
      [0.056, 0.0165],
      [0.049, 0.0195],
      [0.035, 0.0212],
      [0.0001, 0.0218],
    ],
    16,
  ),
);
const omeletLanes = lazy(() => omeletProfile().map(([r, y]) => (y < 0.0015 ? '#e7b04a' : Math.abs(y - 0.0105) < 0.0012 && r > 0.055 ? '#d99a3c' : OMEL.skin)));
const omeletSkin = () => laneMat('omelet', omeletLanes(), { flesh: OMEL.flesh, cooked: OMEL.cooked, roughness: 0.42, mottle: 0.1, cookAmount: 0.55 });
const omeletFlesh = lazy(() => foodMat({ color: OMEL.flesh, roughness: 0.5, flesh: OMEL.flesh, cookColor: OMEL.cooked, cookAmount: 0.55 }));

/** Cut face: egg / colourful filling / egg. */
function omeletSectionV(ctx: CanvasRenderingContext2D, w: number, h: number) {
  ctx.fillStyle = OMEL.flesh;
  ctx.fillRect(0, 0, w, h);
  const g = ctx.createLinearGradient(0, 0, 0, h);
  g.addColorStop(0, 'rgba(232,170,70,0.9)');
  g.addColorStop(0.08, 'rgba(232,170,70,0)');
  g.addColorStop(0.92, 'rgba(232,170,70,0)');
  g.addColorStop(1, 'rgba(225,160,64,0.9)');
  ctx.fillStyle = g;
  ctx.fillRect(0, 0, w, h);
  const y0 = h * 0.38, y1 = h * 0.62;
  ctx.fillStyle = '#f9e6a8';
  ctx.fillRect(0, y0, w, y1 - y0);
  const r = rng(71);
  const cols = ['#f6b73c', '#f0574a', '#4f9e38', '#f6b73c'];
  for (let i = 0; i < 40; i++) {
    ctx.fillStyle = cols[i % cols.length];
    ctx.beginPath();
    ctx.ellipse(r.range(0, w), r.range(y0 + 1, y1 - 1), r.range(2, 6) * (w / 256), r.range(1.2, 2.6) * (h / 64), r.range(-0.4, 0.4), 0, TAU);
    ctx.fill();
  }
}

// ---------------------------------------------------------------------------------------------
// Popcorn: a generous heap of fluffy kernels (a few cached lumpy variants, no container)

const POPC = getDef('popcorn').colors;

/** Popped kernels: puffy lobes around a small golden hull, colours baked in (unit size). */
const kernelGeos = lazy(() =>
  Array.from({ length: 6 }, (_, k) => {
    const r = rng(k * 17 + 3);
    const g: THREE.BufferGeometry = new THREE.IcosahedronGeometry(0.5, 2);
    const lobes = Array.from({ length: r.int(5, 7) }, () => ({ d: randDir(r), a: r.range(0.28, 0.48), p: r.range(2.2, 3.6) }));
    const hull = lobes[0].d.clone().negate().addScaledVector(randDir(r), 0.3).normalize();
    const cols = new Float32Array(g.attributes.position.count * 3);
    const puff = new THREE.Color('#fffbf2'), cream = new THREE.Color('#f8ebc6'), hullA = new THREE.Color('#f2c25c'), hullB = new THREE.Color('#c98a34');
    const tmp = new THREE.Color();
    const d = new THREE.Vector3();
    deform(g, (p, _n, i) => {
      d.copy(p).normalize();
      let s = 0.62;
      for (const L of lobes) s += L.a * Math.pow(Math.max(0, d.dot(L.d)), L.p);
      s += 0.08 * fbm3(d.x * 4.5 + k, d.y * 4.5, d.z * 4.5 - k, 2);
      const hd = d.dot(hull);
      s *= 1 - 0.22 * sstep(0.72, 0.97, hd);
      p.copy(d).multiplyScalar(0.45 * s);
      tmp.copy(cream).lerp(puff, clamp01((s - 0.68) * 2.6));
      if (hd > 0.8) tmp.lerp(hullA, sstep(0.8, 0.9, hd)).lerp(hullB, sstep(0.93, 0.99, hd) * 0.6);
      cols[i * 3] = tmp.r;
      cols[i * 3 + 1] = tmp.g;
      cols[i * 3 + 2] = tmp.b;
    });
    g.setAttribute('color', new THREE.BufferAttribute(cols, 3));
    return g;
  }),
);

const popcornMat = (tint: string) =>
  cmat('popcorn:' + tint, () =>
    foodMat({ color: tint, vertexColors: true, roughness: 0.8, sheen: 0.35, sheenColor: '#fffaf0', sheenRoughness: 0.7, flesh: POPC.flesh, cookColor: POPC.cooked, cookAmount: 0.6 }),
  );

function buildPopcorn(c: Ctx): THREE.Object3D {
  const mat = popcornMat(c.tinted ? mixHex('#ffffff', c.tint, 0.55) : has(c, 'butter') ? '#fff1c6' : '#ffffff');
  const choc = hasTagged(c, 'chocolate');
  const b = new Batch();
  const RB = 0.044, HB = 0.046;
  // hidden core so the heap never looks hollow
  const core = revolve(
    smoothProfile(
      [
        [0.0001, 0],
        [RB * 0.85, 0],
        [RB * 0.8, HB * 0.3],
        [RB * 0.55, HB * 0.72],
        [RB * 0.22, HB * 0.9],
        [0.0001, HB * 0.94],
      ],
      6,
    ),
    { segments: 14 },
  );
  b.add(mat, colored(core, '#f8ecca'));
  const ph = c.r.range(0, TAU);
  const n = 36;
  for (let i = 0; i < n; i++) {
    const d = fibDir(i, n, -0.08, c.r, 0.1, ph);
    const s = c.r.range(0.023, 0.028);
    const q = new THREE.Quaternion().setFromEuler(new THREE.Euler(c.r.range(0, TAU), c.r.range(0, TAU), c.r.range(0, TAU)));
    b.add(choc && i % 3 === 0 ? chocoMat() : mat, placed(c.r.pick(kernelGeos()), [d.x * RB, Math.max(s * 0.35, d.y * HB), d.z * RB], q, s));
  }
  // a few strays around the heap
  for (let i = 0; i < 5; i++) {
    const a = ph + (i / 5) * TAU + c.r.range(-0.4, 0.4), rr = RB * c.r.range(1.3, 1.55);
    const s = c.r.range(0.021, 0.025);
    b.add(mat, placed(c.r.pick(kernelGeos()), [Math.sin(a) * rr, s * 0.42, Math.cos(a) * rr], [c.r.range(0, TAU), c.r.range(0, TAU), c.r.range(0, TAU)], s));
  }
  return sitOnGround(b.addTo(new THREE.Group()));
}

// ---------------------------------------------------------------------------------------------
// Ice pop: a rounded slab on a wooden stick, frosty, striped when it was made from several colours

const IPOP = getDef('icepop').colors;
const POP_L = 0.084, POP_W = 0.05, POP_T = 0.0165;
const STICK_X0 = -0.046, STICK_L = 0.068, STICK_W = 0.0098, STICK_T = 0.0024;

/** Closed rounded rectangle in the x-z plane, evenly resampled (n points): x0..x1, width w, corner radii rA (x0 end), rB (x1 end). */
function roundedRectXZ(x0: number, x1: number, w: number, rA: number, rB: number, n: number): Pt[] {
  const dense: Pt[] = [];
  const arcPts = (cx: number, cz: number, rad: number, a0: number, a1: number) => {
    for (let k = 0; k <= 12; k++) {
      const a = a0 + (a1 - a0) * (k / 12);
      dense.push([cx + Math.cos(a) * rad, cz + Math.sin(a) * rad]);
    }
  };
  const hw = w / 2;
  arcPts(x1 - rB, -hw + rB, rB, -Math.PI / 2, 0);
  arcPts(x1 - rB, hw - rB, rB, 0, Math.PI / 2);
  arcPts(x0 + rA, hw - rA, rA, Math.PI / 2, Math.PI);
  arcPts(x0 + rA, -hw + rA, rA, Math.PI, Math.PI * 1.5);
  dense.push(dense[0]);
  const acc = [0];
  for (let i = 1; i < dense.length; i++) acc.push(acc[i - 1] + Math.hypot(dense[i][0] - dense[i - 1][0], dense[i][1] - dense[i - 1][1]));
  const total = acc[acc.length - 1];
  const out: Pt[] = [];
  let j = 0;
  for (let k = 0; k < n; k++) {
    const s = (k / n) * total;
    while (j < acc.length - 2 && acc[j + 1] < s) j++;
    const t = (s - acc[j]) / (acc[j + 1] - acc[j] || 1);
    out.push([dense[j][0] + (dense[j + 1][0] - dense[j][0]) * t, dense[j][1] + (dense[j + 1][1] - dense[j][1]) * t]);
  }
  return out;
}

/**
 * A slab with flat faces and a fully rounded edge from a convex outline in the x-z plane,
 * centred on y = 0 (ice pop body, wooden stick). Rows: bottom centre -> edge -> top centre.
 */
function slabGeometry(outline: Pt[], thick: number, o: { bulge?: number; uv: (x: number, z: number) => [number, number] }): THREE.BufferGeometry {
  let pts = outline;
  let area = 0;
  for (let i = 0; i < pts.length; i++) {
    const a = pts[i], b = pts[(i + 1) % pts.length];
    area += a[0] * b[1] - b[0] * a[1];
  }
  if (area > 0) pts = [...pts].reverse(); // lathe order (from +z towards +x)
  const n = pts.length;
  let cx = 0, cz = 0;
  for (const p of pts) {
    cx += p[0] / n;
    cz += p[1] / n;
  }
  const b = thick / 2;
  const nrm = pts.map((p, i) => {
    const a = pts[(i - 1 + n) % n], c2 = pts[(i + 1) % n];
    const tl = Math.hypot(c2[0] - a[0], c2[1] - a[1]) || 1;
    let nx = (c2[1] - a[1]) / tl, nz = -(c2[0] - a[0]) / tl;
    if (nx * (p[0] - cx) + nz * (p[1] - cz) < 0) {
      nx = -nx;
      nz = -nz;
    }
    return [nx, nz] as Pt;
  });
  const faceK = [0, 0.4, 0.75, 1];
  const rows: { k: number; phi: number; face: boolean }[] = [];
  for (const k of faceK) rows.push({ k, phi: -Math.PI / 2, face: true });
  for (let s = 1; s < 8; s++) rows.push({ k: 1, phi: -Math.PI / 2 + (s / 8) * Math.PI, face: false });
  for (const k of [...faceK].reverse()) rows.push({ k, phi: Math.PI / 2, face: true });
  const bulge = o.bulge ?? 0;
  return gridGeometry(
    n,
    rows.length - 1,
    (i, j) => {
      const p = pts[i % n], nn = nrm[i % n], row = rows[j];
      const ix = p[0] - nn[0] * b, iz = p[1] - nn[1] * b;
      if (row.face) return [cx + (ix - cx) * row.k, Math.sin(row.phi) * b * (1 + bulge * (1 - row.k * row.k)), cz + (iz - cz) * row.k];
      return [ix + nn[0] * b * Math.cos(row.phi), Math.sin(row.phi) * b, iz + nn[1] * b * Math.cos(row.phi)];
    },
    { uv: (_i, _j, p) => o.uv(p[0], p[2]) },
  );
}

const popBodyGeo = lazy(() => slabGeometry(roundedRectXZ(0, POP_L, POP_W, 0.012, 0.0215, 64), POP_T, { bulge: 0.08, uv: (x, z) => [x / POP_L, (z + POP_W / 2) / POP_W] }));
const popStickGeo = lazy(() =>
  slabGeometry(roundedRectXZ(STICK_X0, STICK_X0 + STICK_L, STICK_W, STICK_W / 2 - 0.0002, STICK_W / 2 - 0.0002, 36), STICK_T, {
    uv: (x, z) => [(x - STICK_X0) / STICK_L, (z + STICK_W / 2) / STICK_W],
  }),
);

/** Colours an ice pop was made from: nested products count with their own tint. */
function popColors(c: Ctx): string[] {
  const out: string[] = [];
  const push = (col: string) => {
    if (out.length < 4 && out.every((o) => colorDist(o, col) > 45)) out.push(col);
  };
  const walk = (list: FoodState[] | undefined, depth: number) => {
    for (const f of list ?? []) {
      if (!f || !hasDef(f.id)) {
        if (f?.id === 'assembly' && depth < 4) walk(f.parts, depth + 1);
        continue;
      }
      const d = getDef(f.id);
      if (d.category === 'product') {
        if (isHex(f.tint)) push(f.tint);
        else if (f.from?.length && depth < 4) walk(f.from, depth + 1);
        else push(d.colors.flesh);
      } else push(d.colors.juice ?? d.colors.flesh);
    }
  };
  if (c.isDefault) for (const id of c.ids) push(getDef(id).colors.juice ?? getDef(id).colors.flesh);
  else walk(c.state.from, 0);
  if (out.length >= 2) return out.map((h) => adjust(h, 1, 1.12));
  return [c.tinted || !out.length ? c.tint : out[0]];
}

/** u along the pop (0 = stick end): bands from the top down with slightly wavy, soft borders + frosty speckle. */
function icepopTex(cols: string[]): THREE.Texture {
  return canvasTexture(
    256,
    64,
    (ctx, w, h) => {
      const rgbs = cols.map(rgb);
      const n = rgbs.length;
      paintPixels(ctx, w, h, (px, py) => {
        const u = (px + 0.5) / w, v = 1 - (py + 0.5) / h;
        const t = (1 - u + 0.022 * Math.sin(v * TAU * 1.3 + 1.1)) * n;
        const k = Math.min(n - 1, Math.max(0, Math.floor(t)));
        let c = rgbs[k];
        const f = t - k;
        if (n > 1 && f > 0.94 && k < n - 1) c = lerp3(c, rgbs[k + 1], (f - 0.94) / 0.12);
        if (n > 1 && f < 0.06 && k > 0) c = lerp3(c, rgbs[k - 1], (0.06 - f) / 0.12);
        const fr = fbm3(u * 46, v * 14, 3.3, 2);
        return lerp3(c, [255, 255, 255], clamp01(0.05 + fr * 0.35));
      });
    },
    { key: 'prod:icepop:' + cols.join(',') },
  );
}
const frostBump = lazy(() => bumpNoiseTexture('prod:frost-bump', 64));
const icepopMat = (cols: string[]) =>
  cmat('icepop:' + cols.join(','), () =>
    foodMat({
      color: '#ffffff',
      map: icepopTex(cols),
      bumpMap: frostBump(),
      bumpScale: 0.25,
      roughness: 0.26,
      clearcoat: 0.6,
      clearcoatRoughness: 0.3,
      sheen: 0.8,
      sheenColor: '#f2faff',
      sheenRoughness: 0.35,
      flesh: cols[0],
      cookColor: IPOP.cooked,
      cookAmount: 0.3,
    }),
  );

const woodTex = lazy(() =>
  canvasTexture(
    256,
    32,
    (ctx, w, h) => {
      const base = rgb('#ecd0a0'), dark = rgb('#cfa56a');
      paintPixels(ctx, w, h, (px, py) => {
        const u = px / w, v = py / h;
        const grain = Math.sin(v * 38 + fbm3(u * 4, v * 6, 1.3, 2) * 5 + u * 3);
        return lerp3(base, dark, sstep(0.55, 0.95, grain) * 0.5 + 0.12 * fbm3(u * 30, v * 8, 2.2, 2));
      });
    },
    { key: 'prod:wood-stick' },
  ),
);

function buildIcepop(c: Ctx): THREE.Object3D {
  const g = new THREE.Group();
  g.add(meshOf(popBodyGeo(), icepopMat(popColors(c)), 'icepop'));
  g.add(meshOf(popStickGeo(), propMat('#ffffff', 0.62, { map: woodTex(), key: 'stick' }), 'stick'));
  // lies flat on a face; the stick sticks out from the middle of its thickness
  g.rotation.y = c.r.range(-0.35, 0.35);
  return sitOnGround(g);
}

// ---------------------------------------------------------------------------------------------
// Ice cream scoops: two or three scoops (one per flavour) in a footed dish, with a wafer stick

const SCOOP = getDef('scoops').colors;
const VANILLA = '#fbeccb';

/** Unit scoop: flat bottom, the classic ragged ridge where the scoop let go, then the ball. */
const scoopProfile = lazy((): Profile => {
  const p: Profile = [
    [0.0001, -0.6],
    [0.55, -0.6],
    [0.85, -0.565],
    [1.0, -0.5],
    [1.08, -0.43],
    [1.06, -0.37],
    [0.97, -0.32],
    [0.965, -0.24],
    [0.985, -0.12],
  ];
  for (let k = 0; k <= 7; k++) {
    const a = (k / 7) * (Math.PI / 2);
    p.push([Math.max(0.0001, Math.cos(a)), Math.sin(a)]);
  }
  return p;
});
const scoopGeos = lazy(() =>
  [0, 1, 2].map((k) => {
    const s = k * 5.1 + 2;
    return revolve(scoopProfile(), {
      segments: 32,
      map: (_j, th, r, y) => {
        const lip = sstep(-0.24, -0.38, y) * (1 - sstep(-0.52, -0.6, y));
        const rag = 0.075 * Math.sin(th * 7 + s) + 0.06 * fbm3(Math.cos(th) * 3 + s, Math.sin(th) * 3, s, 2);
        const x = r * Math.sin(th), z = r * Math.cos(th);
        const cream = 0.035 * fbm3(x * 2.4 + s, y * 2.4, z * 2.4, 3);
        return [r * (1 + lip * rag + cream * (1 - lip)), y + lip * 0.045 * Math.sin(th * 5 + s * 2)];
      },
    });
  }),
);
const scoopBump = lazy(() => bumpNoiseTexture('prod:scoop-bump', 36));
const scoopMat = (col: string) =>
  cmat('scoop:' + col, () =>
    foodMat({
      color: col,
      roughness: 0.5,
      sheen: 0.45,
      sheenColor: '#ffffff',
      sheenRoughness: 0.45,
      clearcoat: 0.12,
      clearcoatRoughness: 0.4,
      bumpMap: scoopBump(),
      bumpScale: 0.35,
      flesh: col,
      cookColor: SCOOP.cooked,
      cookAmount: 0.3,
    }),
  );

/** Ice cream colour of an ingredient (pastel fruit, cocoa brown, vanilla for the dairy). */
function iceCreamColor(id: string): string {
  if (['ice-cream', 'milk', 'cream', 'yogurt', 'sweet-cream', 'whipped-cream', 'scoops'].includes(id)) return VANILLA;
  const d = getDef(id);
  if (d.tags.includes('chocolate')) return '#7b4a2e';
  if (id === 'nuts') return '#d9b68a';
  return mixHex(d.colors.juice ?? d.colors.flesh, '#fff6ea', d.category === 'fruit' ? 0.35 : 0.45);
}
const NOT_FLAVOURS = new Set(['egg', 'flour', 'butter', 'beaten-egg', 'batter']);

/** One colour per scoop: the distinct flavours that went in, else the tint. */
function scoopFlavours(c: Ctx): string[] {
  const out: string[] = [];
  for (const id of c.ids) {
    if (!hasDef(id) || NOT_FLAVOURS.has(id)) continue;
    const col = iceCreamColor(id);
    if (out.every((o) => colorDist(o, col) > 40)) out.push(col);
  }
  if (out.length >= 2) return out.slice(0, 3);
  if (c.tinted) return [c.tint];
  return out.length ? out : [c.tint];
}

const waferGeo = lazy(() => new THREE.CylinderGeometry(0.0043, 0.0043, 0.07, 12, 1, false));
const waferTex = lazy(() =>
  canvasTexture(
    64,
    256,
    (ctx, w, h) => {
      const a = rgb('#f2c77e'), b = rgb('#e2a458'), line = rgb('#a8642a');
      paintPixels(ctx, w, h, (px, py) => {
        const u = px / w, v = py / h;
        const s = (u + v * 7) % 1;
        const l = sstep(0, 0.05, s) * (1 - sstep(0.1, 0.16, s));
        return lerp3(lerp3(a, b, 0.5 + 0.5 * Math.sin(v * 90)), line, l * 0.8);
      });
    },
    { key: 'prod:wafer' },
  ),
);
const waferMat = lazy(() => foodMat({ color: '#ffffff', map: waferTex(), roughness: 0.55, flesh: '#f3d9a0', cookColor: '#8a5a2a' }));

function buildScoops(c: Ctx): THREE.Object3D {
  const flav = scoopFlavours(c);
  const n = flav.length >= 3 || c.isDefault ? 3 : c.r.next() < 0.6 ? 3 : 2;
  const dish = smallDish({ radius: 0.054, depth: 0.03, color: c.r.pick([PASTEL.mint, PASTEL.sky, PASTEL.lilac, PASTEL.butter]), segments: 40, detail: 0.6 });
  const g = new THREE.Group();
  g.add(dish.root);
  // a little melted ice cream fills the dish under the scoops
  g.add(liquidFill(dish, 0.55, scoopMat(flav[0]), { surfaceOnly: true, rings: 4, segments: 32 }));
  const rs = 0.0228;
  const y0 = dish.rimY + 0.0025;
  const spots: V3[] =
    n === 3
      ? [
          [-0.0192, y0, 0.0045],
          [0.0192, y0, 0.0045],
          [0, y0 + rs * 1.12, -0.0045],
        ]
      : [
          [-0.0195, y0, 0],
          [0.0195, y0, 0],
        ];
  const b = new Batch();
  spots.forEach((p, k) => {
    const q = new THREE.Quaternion().setFromEuler(new THREE.Euler(c.r.range(-0.12, 0.12), c.r.range(0, TAU), c.r.range(-0.12, 0.12)));
    b.add(scoopMat(flav[k % flav.length]), placed(scoopGeos()[k % 3], p, q, rs * c.r.range(0.96, 1.04)));
  });
  const tp = new THREE.Vector3(...spots[spots.length - 1]);
  // rolled wafer stick poking out of the top scoop
  const dir = new THREE.Vector3(0.42, 0.86, -0.3).normalize();
  b.add(waferMat(), placed(waferGeo(), tp.clone().add(new THREE.Vector3(-0.002, 0.006, -0.002)).addScaledVector(dir, 0.021), new THREE.Quaternion().setFromUnitVectors(Y_UP, dir)));
  if (has(c, 'cherry')) cherry(b, [tp.x - 0.004, tp.y + rs * 0.93, tp.z + 0.003], c.r, 0.9);
  if (hasCandy(c))
    sprinkles(b, c.r, 24, () => {
      const d = fibDir(c.r.int(0, 29), 30, 0.25, c.r, 0.2);
      return { p: tp.clone().addScaledVector(d, rs * 0.99), n: d };
    });
  if (has(c, 'nuts')) {
    const nd = getDef('nuts').colors;
    for (let i = 0; i < 9; i++) {
      const d = fibDir(i, 9, 0.35, c.r, 0.25);
      b.add(bitMat(nd.flesh, 0.55, nd.cooked ?? c.cooked), placed(nutGeo(), tp.clone().addScaledVector(d, rs * 0.98), [c.r.range(0, 3), c.r.range(0, 3), 0], 0.005));
    }
  }
  b.addTo(g);
  return sitOnGround(g);
}

// ---------------------------------------------------------------------------------------------
// Model table (more products are appended below)

type Builder = (c: Ctx) => THREE.Object3D;

function product(id: string, build: Builder, extra: Partial<ModelDef> = {}, blend = false): ModelDef {
  // Squashed by the rolling pin: keep this state's look (the generic squash rebuilds the default recipe).
  const squash = !extra.forms?.flat && getDef(id).cut !== 'dough';
  return {
    build: (r) => build(ctxOf(id, defaultState(id), r, blend)),
    variant: (state, r) => {
      if (state.form === 'whole') return build(ctxOf(id, state, r, blend));
      if (state.form === 'flat' && squash) {
        const o = build(ctxOf(id, state, r, blend));
        o.scale.set(1.45, 0.28, 1.45);
        const w = new THREE.Group();
        w.add(o);
        return w;
      }
      return null;
    },
    ...extra,
  };
}

/** Wrap a builder for a custom form (receives the full state for tint / from). */
function formOf(id: string, build: Builder, blend = false) {
  return (r: Rng, state: FoodState) => build(ctxOf(id, state, r, blend));
}

export const MODELS: ModelTable = {
  batter: product('batter', buildBatter, { forms: { flat: formOf('batter', (c) => batterFlat(c)) } }),
  'beaten-egg': product('beaten-egg', buildBeatenEgg, { forms: { flat: formOf('beaten-egg', eggFlat) } }),
  'sweet-cream': product('sweet-cream', buildSweetCream, { forms: { flat: formOf('sweet-cream', creamFlat) } }),
  'whipped-cream': product('whipped-cream', buildWhippedCream),
  soup: product('soup', buildSoup, {}, true),
  mixture: product('mixture', buildMixture, {}, true),
  drink: product('drink', buildDrink, {}, true),
  'cookie-dough': product('cookie-dough', buildCookieDough, {
    skin: cookieSkin,
    flesh: cookieFlesh,
    forms: { pieces: formOf('cookie-dough', cookieDoughPieces), flat: formOf('cookie-dough', cookieDoughFlat) },
  }),
  pancake: product('pancake', buildPancakes, { profile: pancakeStack().profile, sectionV: pancakeSectionV, skin: pancakeSkin, flesh: pancakeFlesh }),
  cake: product('cake', buildCake, { profile: cakeProfile().profile, sectionV: cakeSectionV, skin: cakeSkin, flesh: cakeFlesh }),
  flatbread: product('flatbread', buildFlatbread, { profile: flatbreadProfile(), sectionV: flatbreadSectionV, skin: flatbreadSkin, flesh: flatbreadFlesh }),
  'fried-egg': product('fried-egg', buildFriedEgg, { profile: friedEggProfile().profile, sectionV: friedEggSectionV, skin: friedEggSkin, flesh: friedEggFlesh }),
  'scrambled-eggs': product('scrambled-eggs', buildScrambled, { flesh: scrambledFlesh }),
  omelet: product('omelet', buildOmelet, { profile: omeletProfile(), sectionV: omeletSectionV, skin: omeletSkin, flesh: omeletFlesh }),
  popcorn: product('popcorn', buildPopcorn),
  icepop: product('icepop', buildIcepop),
  scoops: product('scoops', buildScoops),
};

/** Example states (tinted, with ingredients) for thumbnails and visual checks. */
export function demoStates(): FoodState[] {
  const f = (id: string, from: string[], tint?: string, seed = 11, extra: Partial<FoodState> = {}): FoodState => ({
    id,
    form: 'whole',
    cook: emptyCook(),
    season: {},
    seed,
    tint,
    from: from.map((i, k) => ({ id: i, form: 'whole', cook: emptyCook(), season: {}, seed: seed * 31 + k })),
    ...extra,
  });
  return [
    f('drink', ['orange'], '#ffa630', 21),
    f('drink', ['strawberry', 'banana', 'yogurt'], '#f3879a', 22),
    f('drink', ['chocolate', 'ice-cream', 'milk'], '#8a5a3c', 23),
    f('drink', ['kiwi', 'apple'], '#a8d65a', 24),
    f('drink', ['pineapple', 'mango'], '#ffc23a', 25),
    f('drink', ['blueberry', 'milk'], '#8a7ac0', 26),
    f('drink', ['lemon'], '#f6ef9a', 27),
    f('drink', ['chocolate', 'milk', 'marshmallow'], '#7a4a2c', 28, { cook: { ...emptyCook(), boil: 1, temp: 0.8 } }),
    f('soup', ['tomato', 'onion', 'basil'], '#d8452e', 31),
    f('soup', ['peas', 'potato', 'cream'], '#9cc75a', 32),
    f('soup', ['mushroom', 'chicken', 'carrot'], '#d9b98a', 33),
    f('batter', ['flour', 'egg', 'milk', 'chocolate'], '#9a6a48', 41),
    f('mixture', ['fish', 'ice-cream', 'chili'], '#e8b0a0', 51),
    f('mixture', ['broccoli', 'chocolate', 'cheese'], '#8a6a3a', 52),
    f('sweet-cream', ['cream', 'strawberry'], '#f8c8d2', 61),
    f('whipped-cream', ['cream', 'chocolate'], '#c8a080', 62),
    f('cookie-dough', ['flour', 'butter', 'nuts', 'candy'], undefined, 71),
    f('cookie-dough', ['flour', 'butter', 'chocolate'], '#7a4a2c', 72),
    f('pancake', ['flour', 'egg', 'milk', 'blueberry'], undefined, 81),
    f('pancake', ['flour', 'egg', 'milk', 'chocolate', 'banana'], '#a0704a', 82),
    f('pancake', ['flour', 'egg', 'milk', 'strawberry'], undefined, 83),
    f('cake', ['flour', 'egg', 'chocolate'], '#6b3a20', 91),
    f('cake', ['flour', 'egg', 'blueberry', 'lemon'], '#d9d2f2', 92),
    f('cake', ['flour', 'egg', 'cherry', 'candy'], '#f7b6c8', 93),
    f('cake', ['flour', 'egg', 'kiwi'], undefined, 94),
    f('flatbread', ['flour', 'basil'], undefined, 101),
    f('fried-egg', ['egg'], undefined, 102),
    f('scrambled-eggs', ['egg', 'cheese', 'tomato'], undefined, 103),
    f('omelet', ['egg', 'ham', 'mushroom', 'bell-pepper'], undefined, 104),
    f('omelet', ['egg', 'tomato', 'onion', 'basil'], undefined, 105),
    f('popcorn', ['corn', 'butter'], undefined, 111),
    f('popcorn', ['corn', 'chocolate'], '#d39a5a', 112),
    f('icepop', ['orange'], '#ffa630', 121),
    f('icepop', ['kiwi', 'strawberry'], undefined, 122),
    f('icepop', ['blueberry', 'milk'], '#8a7ac0', 123),
    f('scoops', ['mango', 'blueberry'], undefined, 131),
    f('scoops', ['strawberry', 'cherry'], '#f6a6bd', 132),
    f('scoops', ['ice-cream', 'chocolate', 'nuts', 'candy'], undefined, 133),
  ];
}
