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
const strawberryGeo = lazy(() => {
  const prof = smoothProfile(
    [
      [0.0001, 0],
      [0.0065, 0.0012],
      [0.0112, 0.006],
      [0.0112, 0.0115],
      [0.0082, 0.0185],
      [0.0036, 0.024],
      [0.0001, 0.0262],
    ],
    12,
  );
  return revolve(prof, { segments: 14 });
});
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
function chocoCurl(r: Rng): THREE.BufferGeometry {
  const pts: V3[] = [];
  const turns = r.range(1.2, 1.9), rad = r.range(0.0022, 0.0032), len = r.range(0.012, 0.018);
  for (let i = 0; i <= 10; i++) {
    const t = i / 10, a = t * turns * TAU;
    pts.push([Math.cos(a) * rad, Math.sin(a) * rad, (t - 0.5) * len]);
  }
  return sweepGeometry(curveThrough(pts), { radius: 0.0016, squash: [1, 0.28], radialSegments: 6, tubularSegments: 14, caps: 'flat' });
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

// ---------------------------------------------------------------------------------------------
// Model table (more products are appended below)

type Builder = (c: Ctx) => THREE.Object3D;

function product(id: string, build: Builder, extra: Partial<ModelDef> = {}, blend = false): ModelDef {
  return {
    build: (r) => build(ctxOf(id, defaultState(id), r, blend)),
    variant: (state, r) => (state.form === 'whole' ? build(ctxOf(id, state, r, blend)) : null),
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
  ];
}
