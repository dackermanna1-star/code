// Munch Lab food engine: everything that changes food (heat, cold, room temperature, knife and
// tools, combining, mixing, blending, pot / pan merges) as pure logic over FoodState.
// No rendering, no DOM.
//
// Conventions
//  - applyHeat / applyCold / applyRoom / addSeasoning mutate the state in place (stations call
//    them every frame). A transformation in place (batter -> pancake) reports `rebuild: true`.
//  - cut / peel / flatten / mash / combine / mixBowl / blend / potMerge / panMerge never mutate
//    their inputs; they return new objects (or null when nothing happens).
//  - Every produced state is renderable: a catalogue id (or 'assembly' with parts + layout) and a
//    form valid for its cut style (CUT_SEQUENCES) or one of the tool forms.
//  - Products keep what went in (`from`) and carry a `tint` (weighted colour of the inputs).

import { CUT_SEQUENCES, cloneFood, doneness, emptyCook, makeFood, newSeed } from './types';
import type { AssemblyLayout, CookState, FoodState, Form, IngredientDef, Tag } from './types';
import { getDef, hasDef, SEASONINGS } from './catalog';

export type HeatMethod = 'fry' | 'grill' | 'boil' | 'bake' | 'deepfry' | 'toast' | 'micro';
export type StationKind =
  | 'board'
  | 'bowl'
  | 'pan'
  | 'grill'
  | 'pot'
  | 'oven'
  | 'fryer'
  | 'blender'
  | 'toaster'
  | 'microwave'
  | 'freezer'
  | 'plate'
  | 'counter';

export interface CookEvent {
  kind: 'done' | 'burning' | 'burnt' | 'transform' | 'melted' | 'popped' | 'exploded' | 'frozen' | 'thawed';
  /** The state changed shape / identity: rebuild the visual. */
  rebuild?: boolean;
  /** Short floating label ("Pancake!", "Burnt!"). */
  label?: string;
}

// ---------------------------------------------------------------------------------------------
// Tuning

/** Forms produced by tools / appliances rather than by the knife. */
export const TOOL_FORMS: readonly Form[] = ['flat', 'mashed', 'popped', 'pieces', 'cracked'];
export const HEAT_METHODS: readonly HeatMethod[] = ['fry', 'grill', 'boil', 'bake', 'deepfry', 'toast', 'micro'];

/** Smaller pieces cook faster. */
const FORM_FACTOR: Record<Form, number> = {
  whole: 1,
  halved: 1.3,
  sliced: 1.8,
  strips: 1.8,
  sticks: 1.8,
  flat: 1.8,
  cracked: 1.8,
  diced: 2.2,
  leaves: 2.2,
  minced: 2.5,
  grated: 2.5,
  shredded: 2.5,
  pieces: 2.5,
  popped: 2.5,
  mashed: 1.5,
};

/** Per-appliance speed. The toaster is built for thin slices, so it is gentler. */
const METHOD_SPEED: Record<HeatMethod, number> = { fry: 1, grill: 1, boil: 1, bake: 1, deepfry: 1, toast: 0.45, micro: 1 };
/** How fast melty things melt per method. */
const METHOD_MELT: Record<HeatMethod, number> = { fry: 1, grill: 1, boil: 1.2, bake: 0.8, deepfry: 1.5, toast: 0.8, micro: 1.3 };
/** Seconds (at heat 1, whole) for melty things to melt completely. */
const MELT_TIME: Record<string, number> = {
  'ice-cream': 1.2,
  scoops: 1.5,
  icepop: 2.5,
  butter: 2,
  chocolate: 2.5,
  cheese: 3.2,
  mozzarella: 3,
  marshmallow: 3,
};

/** Dry doneness where burning starts; burn then reaches 1 over the same amount of doneness again. */
export const BURN_START = 1.7;
export const BURNT_AT = 0.8;
const METHOD_CAP = 8;
/** Seconds in the freezer until a whole item is frozen solid. */
const FREEZE_TIME = 9;
const FROZEN_AT = 0.95;

const CONTAINER_IDS = new Set(['drink', 'soup', 'batter', 'beaten-egg', 'sweet-cream', 'whipped-cream', 'mixture', 'scoops']);
/** Runny products that spread out flat in a pan. */
const POURABLE = new Set(['batter', 'beaten-egg', 'sweet-cream']);
const FROZEN_TREATS = new Set(['ice-cream', 'scoops', 'icepop']);
const SEASONING_IDS = new Set(SEASONINGS.map((s) => s.id));
const SEASONING_COLOR = new Map(SEASONINGS.map((s) => [s.id, s.color]));

// ---------------------------------------------------------------------------------------------
// Small helpers (exported ones are shared with the recipe analysis)

const fin = (x: unknown, fb = 0): number => (typeof x === 'number' && Number.isFinite(x) ? x : fb);
const clamp = (x: number, a: number, b: number) => (x < a ? a : x > b ? b : x);

export function formFactor(form: string): number {
  return FORM_FACTOR[form as Form] ?? 1;
}

export function defOf(f: FoodState | null | undefined): IngredientDef | null {
  return f && f.id !== 'assembly' && hasDef(f.id) ? getDef(f.id) : null;
}

export function isAssembly(f: FoodState | null | undefined): boolean {
  return !!f && f.id === 'assembly';
}

export function hasTagF(f: FoodState | null | undefined, tag: Tag): boolean {
  const d = defOf(f);
  return !!d && d.tags.includes(tag);
}

/** Made in the kitchen (batter, soup, pancake...). */
export function isProduct(f: FoodState | null | undefined): boolean {
  const d = defOf(f);
  return !!d && d.category === 'product';
}

/** Doneness from dry heat only (boiling never burns). */
export function dryDoneness(c: CookState): number {
  return fin(c.fry) + fin(c.grill) + fin(c.bake) + fin(c.deepfry) + fin(c.toast) + fin(c.micro) * 0.6;
}

/** A hard-cooked egg (boiled, baked...) that the knife can halve / slice. */
export function isCookedEgg(f: FoodState): boolean {
  return f.id === 'egg' && f.form !== 'cracked' && doneness(f.cook) >= 0.6;
}

/** Normalise a state's bookkeeping in place (missing / non-finite cook fields, season map). */
function ensureCook(f: FoodState): CookState {
  const base = emptyCook();
  const c = (f.cook ?? {}) as Partial<CookState>;
  for (const k of Object.keys(base) as (keyof CookState)[]) base[k] = fin(c[k]);
  for (const m of HEAT_METHODS) base[m] = clamp(base[m], 0, METHOD_CAP);
  base.burn = clamp(base.burn, 0, 1);
  base.freeze = clamp(base.freeze, 0, 1);
  base.melt = clamp(base.melt, 0, 1);
  base.temp = clamp(base.temp, -1, 1);
  if (!f.cook || typeof f.cook !== 'object') f.cook = base;
  else for (const k of Object.keys(base) as (keyof CookState)[]) if (f.cook[k] !== base[k]) f.cook[k] = base[k];
  if (!f.season || typeof f.season !== 'object') f.season = {};
  return f.cook;
}

function clampDt(dt: number): number {
  return clamp(fin(dt), 0, 120);
}

function snapshot(f: FoodState): FoodState {
  return cloneFood(f);
}

/** Visit every non-assembly descendant of a state (the state itself if it is not an assembly). */
export function walkParts(f: FoodState, fn: (p: FoodState) => void, depth = 0): void {
  if (!f || depth > 12) return;
  if (isAssembly(f)) {
    for (const p of f.parts ?? []) if (p) walkParts(p, fn, depth + 1);
  } else fn(f);
}

/** Ingredient leaves: assembly parts and product inputs, recursively. */
export function leaves(f: FoodState): FoodState[] {
  const out: FoodState[] = [];
  const visit = (s: FoodState, depth: number) => {
    if (!s) return;
    if (depth > 10) {
      out.push(s);
      return;
    }
    if (isAssembly(s)) {
      for (const p of s.parts ?? []) visit(p, depth + 1);
      return;
    }
    const from = (s.from ?? []).filter(Boolean);
    if (from.length && isProduct(s)) {
      for (const p of from) visit(p, depth + 1);
      return;
    }
    out.push(s);
    // non-products that remember extras (mashed potato with butter) keep both
    for (const p of from) visit(p, depth + 1);
  };
  visit(f, 0);
  return out;
}

/** Seasonings on a state and its assembly parts (product inputs were merged when it was made). */
export function seasonTotals(f: FoodState, out: Record<string, number> = {}, depth = 0): Record<string, number> {
  if (!f || depth > 12) return out;
  for (const [k, v] of Object.entries(f.season ?? {})) {
    const a = fin(v);
    if (a > 0 && SEASONING_IDS.has(k)) out[k] = (out[k] ?? 0) + a;
  }
  if (isAssembly(f)) for (const p of f.parts ?? []) if (p) seasonTotals(p, out, depth + 1);
  return out;
}

function mergeSeasons(items: FoodState[]): Record<string, number> {
  const out: Record<string, number> = {};
  for (const it of items) seasonTotals(it, out);
  for (const k of Object.keys(out)) out[k] = Math.min(12, out[k]);
  return out;
}

/** Keep product histories small: cap nesting depth and list length. */
function trimFrom(list: FoodState[], depth = 0): FoodState[] {
  const out = list.filter(Boolean).slice(0, 24);
  for (const f of out) {
    if (f.from?.length) {
      if (depth >= 3) {
        const flat = leaves(f).filter((x) => x !== f).map((x) => ({ ...x, from: undefined }));
        f.from = flat.slice(0, 12);
      } else f.from = trimFrom(f.from, depth + 1);
    }
    if (f.parts?.length) for (const p of f.parts) if (p.from?.length) p.from = trimFrom(p.from, depth + 1);
  }
  return out;
}

// ---------------------------------------------------------------------------------------------
// Colour

type RGB = [number, number, number];

function parseHex(h: unknown): RGB | null {
  if (typeof h !== 'string') return null;
  const m = /^#?([0-9a-f]{3}|[0-9a-f]{6})$/i.exec(h.trim());
  if (!m) return null;
  let s = m[1];
  if (s.length === 3) s = s.split('').map((ch) => ch + ch).join('');
  const n = parseInt(s, 16);
  return [(n >> 16) & 255, (n >> 8) & 255, n & 255];
}

function toHex(c: RGB): string {
  return '#' + c.map((v) => clamp(Math.round(fin(v, 200)), 0, 255).toString(16).padStart(2, '0')).join('');
}

function mixRgb(a: RGB, b: RGB, t: number): RGB {
  const k = clamp(t, 0, 1);
  return [a[0] + (b[0] - a[0]) * k, a[1] + (b[1] - a[1]) * k, a[2] + (b[2] - a[2]) * k];
}

/** Saturated and dark colours (chocolate, berries) dominate a mix; pale ones (milk, flour) don't. */
function colorStrength(c: RGB): number {
  const max = Math.max(c[0], c[1], c[2]), min = Math.min(c[0], c[1], c[2]);
  const chroma = (max - min) / 255;
  const light = (max + min) / 510;
  return 0.35 + 2.4 * chroma + 1.4 * (1 - light);
}

const DEFAULT_TINT = '#e8d8b0';
const POPCORN_TINT: RGB = [253, 243, 214];

function accumulateColor(f: FoodState, weight: number, acc: { c: RGB; w: number }, depth: number) {
  if (!f || weight <= 0 || depth > 8) return;
  if (isAssembly(f)) {
    const parts = (f.parts ?? []).filter(Boolean);
    for (const p of parts) accumulateColor(p, weight / Math.max(1, Math.sqrt(parts.length)), acc, depth + 1);
    return;
  }
  const d = defOf(f);
  let col: RGB | null = parseHex(f.tint);
  if (!col && f.from?.length && isProduct(f)) col = parseHex(tintOf(f.from));
  if (!col && d) col = parseHex(d.colors.juice ?? d.colors.flesh);
  if (!col) col = parseHex(DEFAULT_TINT)!;
  // cooking browns, burning blackens
  if (d) {
    const dry = dryDoneness(f.cook ?? emptyCook());
    const cooked = parseHex(d.colors.cooked);
    if (cooked && dry > 0.2 && !isProduct(f)) col = mixRgb(col, cooked, Math.min(0.55, dry * 0.3));
  }
  const burn = fin(f.cook?.burn);
  if (burn > 0.05) col = mixRgb(col, [42, 26, 16], burn * 0.8);
  const size = d ? clamp(0.6 + d.size * 4, 0.7, 1.8) : 1;
  const amount = clamp(fin(f.amount, 1), 0.1, 1);
  const w = weight * size * amount * colorStrength(col);
  acc.c = [acc.c[0] + col[0] * w, acc.c[1] + col[1] * w, acc.c[2] + col[2] * w];
  acc.w += w;
  // seasonings tint a little
  for (const [id, v] of Object.entries(f.season ?? {})) {
    const sc = parseHex(SEASONING_COLOR.get(id));
    const a = clamp(fin(v), 0, 6);
    if (!sc || a <= 0) continue;
    const sw = weight * a * 0.45 * colorStrength(sc);
    acc.c = [acc.c[0] + sc[0] * sw, acc.c[1] + sc[1] * sw, acc.c[2] + sc[2] * sw];
    acc.w += sw;
  }
}

/** Weighted average colour of some ingredients, as a hex string (strong colours dominate). */
export function tintOf(contents: FoodState[]): string {
  const acc = { c: [0, 0, 0] as RGB, w: 0 };
  for (const f of contents ?? []) accumulateColor(f, 1, acc, 0);
  if (!(acc.w > 0)) return DEFAULT_TINT;
  return toHex([acc.c[0] / acc.w, acc.c[1] / acc.w, acc.c[2] / acc.w]);
}

/** Like tintOf, with per-item weights (an omelet is mostly egg, whatever went in). */
function tintWeighted(items: FoodState[], weights: number[]): string {
  const acc = { c: [0, 0, 0] as RGB, w: 0 };
  items.forEach((f, i) => accumulateColor(f, weights[i] ?? 1, acc, 0));
  if (!(acc.w > 0)) return DEFAULT_TINT;
  return toHex([acc.c[0] / acc.w, acc.c[1] / acc.w, acc.c[2] / acc.w]);
}

// ---------------------------------------------------------------------------------------------
// Making products

/** A brand-new product (fresh seed) made from some inputs. */
function makeProduct(id: string, from: FoodState[], extra: Partial<FoodState> = {}): FoodState {
  const inputs = trimFrom(from.map(snapshot));
  const f = makeFood(id, 'whole', { from: inputs, ...extra });
  if (!f.tint) f.tint = tintOf(inputs);
  f.season = { ...(extra.season ?? mergeSeasons(from)) };
  return f;
}

/** Turn a state into a product in place (cooking transformations keep the item and its seed). */
function becomeProduct(f: FoodState, id: string, form: Form, from: FoodState[], tint?: string) {
  const inputs = trimFrom(from);
  f.id = id;
  f.form = form;
  f.from = inputs;
  f.tint = tint ?? tintOf(inputs);
  delete f.parts;
  delete f.layout;
  delete f.peeled;
}

/** Average temperature etc. of some inputs, for a freshly mixed product. */
function mixedCook(items: FoodState[]): CookState {
  const c = emptyCook();
  if (!items.length) return c;
  let t = 0, fr = 0;
  for (const it of items) {
    t += fin(it.cook?.temp);
    fr += fin(it.cook?.freeze);
  }
  c.temp = clamp(t / items.length, -1, 1);
  c.freeze = clamp((fr / items.length) * 0.5, 0, 1);
  return c;
}

// ---------------------------------------------------------------------------------------------
// Heat

interface Before {
  done: number;
  burn: number;
  freeze: number;
}

function before(c: CookState): Before {
  return { done: doneness(c), burn: c.burn, freeze: c.freeze };
}

function meltTime(f: FoodState): number | null {
  if (MELT_TIME[f.id]) return MELT_TIME[f.id];
  return hasTagF(f, 'melty') || hasTagF(f, 'frozen-treat') ? 3 : null;
}

/** Things that get better with cooking (they earn a "Perfect!" when done). */
function likesCooking(f: FoodState): boolean {
  const d = defOf(f);
  if (!d) return false;
  if (!d.rawOk) return true;
  if (['meat', 'seafood', 'bakery', 'veg'].includes(d.category)) return !d.tags.includes('leafy');
  return ['pancake', 'flatbread', 'fried-egg', 'omelet', 'scrambled-eggs', 'cake', 'cookie', 'donut', 'popcorn'].includes(f.id);
}

/** Cook one plain (non-assembly) item by `inc` doneness units. Returns true when it just melted. */
function heatLeaf(f: FoodState, method: HeatMethod, inc: number, dt: number, heat: number): boolean {
  const c = ensureCook(f);
  const dry0 = dryDoneness(c);
  if (c.freeze > 0) c.freeze = Math.max(0, c.freeze - dt * heat * 0.35);
  c[method] = Math.min(METHOD_CAP, c[method] + inc);
  if (method !== 'boil') {
    const over = Math.max(0, dryDoneness(c) - Math.max(dry0, BURN_START));
    if (over > 0) c.burn = Math.min(1, c.burn + over / BURN_START);
  }
  c.temp = clamp(c.temp + (1 - c.temp) * (1 - Math.exp(-dt * heat * 0.9)), -1, 1);
  const mt = meltTime(f);
  if (!mt || c.melt >= 1) return false;
  const shell = method === 'deepfry' && FROZEN_TREATS.has(f.id) ? 0.2 : 1;
  c.melt = Math.min(1, c.melt + (dt * heat * METHOD_MELT[method] * shell * Math.sqrt(formFactor(f.form))) / mt);
  return c.melt >= 1;
}

function thresholdEvents(b: Before, f: FoodState, method: HeatMethod, events: CookEvent[]) {
  const c = f.cook;
  const done = doneness(c);
  if (b.done < 1 && done >= 1 && c.burn < 0.05) {
    const wantsLabel = isAssembly(f) ? method !== 'bake' : likesCooking(f) && method !== 'bake';
    events.push(wantsLabel ? { kind: 'done', label: 'Perfect!' } : { kind: 'done' });
  }
  if (b.burn <= 0 && c.burn > 0) events.push({ kind: 'burning', label: 'Burning!' });
  if (b.burn < BURNT_AT && c.burn >= BURNT_AT) events.push({ kind: 'burnt', label: 'Burnt!' });
  if (b.freeze >= 0.5 && c.freeze < 0.5) events.push({ kind: 'thawed' });
}

/** Ice cream / ice pops that melted completely turn back into something runny. */
function meltTransform(f: FoodState, events: CookEvent[], inPan: boolean): boolean {
  if (f.id === 'ice-cream' || f.id === 'scoops') {
    const from = f.id === 'scoops' && f.from?.length ? f.from : [snapshot(f)];
    becomeProduct(f, 'sweet-cream', inPan ? 'flat' : 'whole', from, f.id === 'scoops' ? f.tint : undefined);
  } else if (f.id === 'icepop') {
    const from = f.from?.length ? f.from : [snapshot(f)];
    becomeProduct(f, 'drink', 'whole', from, f.tint);
  } else return false;
  f.cook.melt = 0;
  f.cook.freeze = 0;
  events.push({ kind: 'melted', rebuild: true, label: 'Melted!' });
  return true;
}

/** Appliance transformations of a single item (batter -> pancake, corn -> popcorn...). */
function heatTransform(f: FoodState, method: HeatMethod, events: CookEvent[]) {
  const c = f.cook;
  const v = c[method];
  const pan = method === 'fry' || method === 'grill';
  const dryish = method !== 'boil';
  const become = (id: string, form: Form, label: string, kind: CookEvent['kind'] = 'transform', from?: FoodState[], tint?: string) => {
    const src = snapshot(f);
    becomeProduct(f, id, form, from ?? [src], tint);
    events.push({ kind, rebuild: true, label });
  };
  switch (f.id) {
    case 'batter':
      if (pan && v >= 0.5) become('pancake', 'whole', 'Pancake!');
      else if (method === 'bake' && v >= 0.5) become('cake', 'whole', 'Cake!');
      else if (method === 'micro' && v >= 0.7) become('cake', 'whole', 'Mug Cake!');
      else if (method === 'deepfry' && v >= 0.5) become('donut', 'whole', 'Donut!');
      break;
    case 'beaten-egg':
      if (dryish && method !== 'toast' && v >= 0.6) become('scrambled-eggs', 'whole', 'Scrambled!');
      break;
    case 'egg':
      if (f.form === 'cracked') {
        if (dryish && method !== 'toast' && v >= (method === 'micro' ? 0.5 : 0.35)) become('fried-egg', 'whole', 'Fried Egg!');
      } else if (f.form === 'whole' && method === 'micro' && c.boil < 0.6 && v >= 0.4) {
        become('scrambled-eggs', 'whole', 'Pop!', 'exploded');
      }
      break;
    case 'dough':
      if (v < 0.5) break;
      if (f.form === 'flat' && (pan || method === 'bake' || method === 'deepfry' || method === 'toast')) become('flatbread', 'whole', 'Flatbread!');
      else if (method === 'bake') {
        if (f.form === 'pieces') become('cookie', 'pieces', 'Cookies!');
        else become('bread', 'whole', 'Bread!');
      } else if (method === 'deepfry') become('donut', 'whole', 'Donut!');
      break;
    case 'cookie-dough':
      if (v < 0.5) break;
      if (method === 'bake' || pan || method === 'micro' || method === 'toast') become('cookie', f.form === 'flat' ? 'whole' : 'pieces', 'Cookies!');
      else if (method === 'deepfry') become('donut', 'whole', 'Donut!');
      break;
    case 'corn':
      if (method === 'micro' && v >= 0.5 && f.form !== 'mashed') {
        const src = snapshot(f);
        become('popcorn', 'whole', 'Popcorn!', 'popped', [src], toHex(mixRgb(POPCORN_TINT, parseHex(tintOf([src]))!, 0.15)));
      }
      break;
    case 'marshmallow':
      if (method === 'micro' && v >= 0.4 && (f.form === 'whole' || f.form === 'pieces')) {
        f.form = 'popped';
        events.push({ kind: 'popped', rebuild: true, label: 'Puff!' });
      }
      break;
    default:
      break;
  }
}

/** Time (s at heat 1) for an assembly to cook through: its slowest part sets the pace. */
function assemblyUnitTime(a: FoodState): number {
  let t = 0;
  walkParts(a, (p) => {
    const d = defOf(p);
    if (d) t = Math.max(t, d.cookTime / formFactor(p.form));
  });
  return clamp(t || 6, 1, 20);
}

/** Root cook of an assembly summarises its parts (stations read it for dings, smoke, steam). */
export function syncAssemblyCook(a: FoodState, depth = 0) {
  if (!isAssembly(a) || depth > 12) return;
  const parts = (a.parts ?? []).filter(Boolean);
  const c = ensureCook(a);
  if (!parts.length) return;
  for (const p of parts) {
    ensureCook(p);
    if (isAssembly(p)) syncAssemblyCook(p, depth + 1);
  }
  const n = parts.length;
  for (const m of HEAT_METHODS) c[m] = parts.reduce((s, p) => s + p.cook[m], 0) / n;
  c.burn = Math.max(...parts.map((p) => p.cook.burn));
  c.melt = Math.max(...parts.map((p) => p.cook.melt));
  c.freeze = parts.reduce((s, p) => s + p.cook.freeze, 0) / n;
  c.temp = parts.reduce((s, p) => s + p.cook.temp, 0) / n;
}

/**
 * Cook a state for dt seconds at the given heat (0..1+). Mutates in place.
 * Assemblies cook every part at the pace of the slowest one (a pizza's cheese does not burn
 * before its crust is baked) and never transform their parts.
 */
export function applyHeat(f: FoodState, method: HeatMethod, dt: number, heat = 1): CookEvent[] {
  const events: CookEvent[] = [];
  if (!f || !HEAT_METHODS.includes(method)) return events;
  dt = clampDt(dt);
  heat = clamp(fin(heat), 0, 4);
  if (dt <= 0 || heat <= 0) return events;
  ensureCook(f);
  if (isAssembly(f)) {
    syncAssemblyCook(f);
    const b = before(f.cook);
    const inc = ((heat * dt) / assemblyUnitTime(f)) * METHOD_SPEED[method];
    let melted = false;
    walkParts(f, (p) => {
      if (heatLeaf(p, method, inc, dt, heat)) melted = true;
    });
    syncAssemblyCook(f);
    if (melted) events.push({ kind: 'melted', label: 'Melty!' });
    thresholdEvents(b, f, method, events);
    return events;
  }
  const b = before(f.cook);
  const d = defOf(f);
  const inc = ((heat * dt) / Math.max(0.5, fin(d?.cookTime, 8))) * formFactor(f.form) * METHOD_SPEED[method];
  const melted = heatLeaf(f, method, inc, dt, heat);
  if (melted && !meltTransform(f, events, method === 'fry' || method === 'grill')) events.push({ kind: 'melted', label: 'Melty!' });
  heatTransform(f, method, events);
  thresholdEvents(b, f, method, events);
  return events;
}

// ---------------------------------------------------------------------------------------------
// Cold

function coldLeaf(f: FoodState, dt: number, rate = 1) {
  const c = ensureCook(f);
  c.freeze = Math.min(1, c.freeze + (dt / FREEZE_TIME) * rate * (0.85 + 0.15 * formFactor(f.form)));
  c.temp = clamp(c.temp + (-1 - c.temp) * (1 - Math.exp(-dt * 0.8)), -1, 1);
  if (c.melt > 0) c.melt = Math.max(0, c.melt - dt * 0.6);
}

/** Leaves of a product that are all fruit / dairy / sweets (fit for ice cream). */
function sweetOnly(f: FoodState): boolean {
  const ls = leaves(f);
  return ls.length > 0 && ls.every((l) => {
    const d = defOf(l);
    return !!d && (d.category === 'fruit' || d.category === 'dairy' || d.category === 'sweets' || d.tags.includes('sweet')) && !d.tags.includes('egg');
  });
}

/** Freezer transformations (drink -> ice pop, sweet cream -> ice cream). */
function coldTransform(f: FoodState, events: CookEvent[]): boolean {
  let label = '';
  const src = snapshot(f);
  const tint = f.tint ?? tintOf([src]);
  switch (f.id) {
    case 'drink':
      becomeProduct(f, 'icepop', 'whole', f.from?.length ? f.from : [src], tint);
      label = 'Ice Pop!';
      break;
    case 'soup':
    case 'milk':
      becomeProduct(f, 'icepop', 'whole', [src], tint);
      label = f.from?.[0]?.id === 'soup' ? 'Soup Pop!' : 'Ice Pop!';
      break;
    case 'sweet-cream':
    case 'whipped-cream':
      becomeProduct(f, 'scoops', 'whole', f.from?.length ? f.from : [src], tint);
      label = 'Ice Cream!';
      break;
    case 'cream':
    case 'yogurt':
      label = f.id === 'yogurt' ? 'Froyo!' : 'Ice Cream!';
      becomeProduct(f, 'scoops', 'whole', [src], tint);
      break;
    case 'mixture':
      if (!sweetOnly(f)) return false;
      becomeProduct(f, 'scoops', 'whole', f.from?.length ? f.from : [src], tint);
      label = 'Ice Cream!';
      break;
    default:
      return false;
  }
  const season = f.season;
  f.cook = { ...emptyCook(), freeze: 1, temp: -1 };
  f.season = season;
  events.push({ kind: 'transform', rebuild: true, label });
  return true;
}

/** Chill a state for dt seconds (freezer). Mutates in place. */
export function applyCold(f: FoodState, dt: number): CookEvent[] {
  const events: CookEvent[] = [];
  if (!f) return events;
  dt = clampDt(dt);
  if (dt <= 0) return events;
  ensureCook(f);
  if (isAssembly(f)) {
    syncAssemblyCook(f);
    const b0 = f.cook.freeze;
    walkParts(f, (p) => coldLeaf(p, dt, 0.9));
    syncAssemblyCook(f);
    if (b0 < FROZEN_AT && f.cook.freeze >= FROZEN_AT) events.push({ kind: 'frozen', label: 'Frozen!' });
    return events;
  }
  const b0 = f.cook.freeze;
  coldLeaf(f, dt);
  if (b0 < FROZEN_AT && f.cook.freeze >= FROZEN_AT && !coldTransform(f, events)) events.push({ kind: 'frozen', label: 'Frozen!' });
  return events;
}

// ---------------------------------------------------------------------------------------------
// Room temperature

function roomLeaf(f: FoodState, dt: number, events: CookEvent[] | null) {
  const c = ensureCook(f);
  if (c.temp !== 0) {
    // back to room temperature in ~25 s
    const t = Math.max(0, Math.abs(c.temp) - dt / 25);
    c.temp = t < 0.005 ? 0 : Math.sign(c.temp) * t;
  }
  if (c.freeze > 0) {
    const f0 = c.freeze;
    c.freeze = Math.max(0, c.freeze - dt / 60);
    if (c.freeze < 0.002) c.freeze = 0;
    if (events && f0 >= 0.5 && c.freeze < 0.5) events.push({ kind: 'thawed' });
  }
  if (FROZEN_TREATS.has(f.id) && c.freeze < 0.3 && c.melt < 1) {
    c.melt = Math.min(1, c.melt + dt / (f.id === 'icepop' ? 120 : 150));
    if (events && c.melt >= 1) meltTransform(f, events, false);
  }
}

/** Food left out: hot things cool down (~25 s), frozen things thaw (~60 s), ice cream slowly melts. */
export function applyRoom(f: FoodState, dt: number): CookEvent[] {
  const events: CookEvent[] = [];
  if (!f) return events;
  dt = clampDt(dt);
  if (dt <= 0) return events;
  ensureCook(f);
  if (isAssembly(f)) {
    const freeze0 = f.cook.freeze;
    walkParts(f, (p) => roomLeaf(p, dt, null));
    syncAssemblyCook(f);
    if (Math.abs(f.cook.temp) < 0.01) f.cook.temp = 0;
    if (freeze0 >= 0.5 && f.cook.freeze < 0.5) events.push({ kind: 'thawed' });
    return events;
  }
  roomLeaf(f, dt, events);
  return events;
}

// ---------------------------------------------------------------------------------------------
// Queries

/** Runny things Mochi drinks (and that cannot be rolled or mashed). Frozen liquids are solid. */
export function isLiquid(f: FoodState): boolean {
  const d = defOf(f);
  if (!d) return false;
  if (fin(f.cook?.freeze) >= 0.8) return false;
  return d.texture === 'liquid' || d.tags.includes('liquid');
}

/** Products that live in a bowl / glass / pot rather than lying on a surface. */
export function isContainerProduct(f: FoodState): boolean {
  return !!f && CONTAINER_IDS.has(f.id);
}

/** Shake / squeeze / spread a seasoning onto a state (mutates). Unknown seasonings are ignored. */
export function addSeasoning(f: FoodState, id: string, amount: number): void {
  if (!f || !SEASONING_IDS.has(id)) return;
  const a = fin(amount);
  if (a <= 0) return;
  if (!f.season || typeof f.season !== 'object') f.season = {};
  f.season[id] = Math.min(12, fin(f.season[id]) + a);
}

// ---------------------------------------------------------------------------------------------
// Stations

/** An item arrives at a station: eggs crack into the pan, batter spreads out flat... */
export function enterStation(f: FoodState, station: StationKind): FoodState {
  if (!f || isAssembly(f)) return f;
  const panLike = station === 'pan' || station === 'grill';
  if (panLike) {
    if (f.id === 'egg' && f.form === 'whole' && !isCookedEgg(f)) return { ...snapshot(f), form: 'cracked' };
    if (POURABLE.has(f.id) && f.form !== 'flat') return { ...snapshot(f), form: 'flat' };
    return f;
  }
  // a puddle poured back into a bowl / pot / glass is a bowlful again
  if (POURABLE.has(f.id) && f.form === 'flat' && station !== 'oven') return { ...snapshot(f), form: 'whole' };
  return f;
}

// ---------------------------------------------------------------------------------------------
// Board tools

function withForm(f: FoodState, form: Form): FoodState {
  return { ...snapshot(f), form };
}

/** Knife: the next form in the item's cut sequence (new state), or null when it can't be cut. */
export function cut(f: FoodState): FoodState | null {
  if (!f) return null;
  if (isAssembly(f)) {
    if (f.layout === 'pile' || !f.parts?.length) return null;
    if (f.form === 'whole') return withForm(f, 'halved');
    if (f.form === 'halved') return withForm(f, 'sliced');
    return null;
  }
  const d = defOf(f);
  if (!d) return null;
  if (d.cut === 'egg') {
    if (isCookedEgg(f)) {
      const seq: Form[] = ['whole', 'halved', 'sliced', 'diced'];
      const i = seq.indexOf(f.form);
      return i >= 0 && i < seq.length - 1 ? withForm(f, seq[i + 1]) : null;
    }
    return f.form === 'whole' ? withForm(f, 'cracked') : null;
  }
  const seq = CUT_SEQUENCES[d.cut] ?? ['whole'];
  const i = seq.indexOf(f.form);
  if (i >= 0) return i < seq.length - 1 ? withForm(f, seq[i + 1]) : null;
  if (f.form === 'flat') {
    if (d.cut === 'dough') return withForm(f, 'pieces');
    return seq.includes('diced') ? withForm(f, 'diced') : null;
  }
  if (f.form === 'pieces' && seq.includes('diced')) return withForm(f, 'diced');
  return null;
}

export function canCut(f: FoodState): boolean {
  try {
    return cut(f) !== null;
  } catch {
    return false;
  }
}

export function canPeel(f: FoodState): boolean {
  const d = defOf(f);
  return !!d && !!d.peelable && !f.peeled && (f.form === 'whole' || f.form === 'halved');
}

export function peel(f: FoodState): FoodState | null {
  return canPeel(f) ? { ...snapshot(f), peeled: true } : null;
}

/** Rolling pin: dough becomes a flat base; anything else gets a cartoon squash. */
export function flatten(f: FoodState): FoodState | null {
  if (!f || isAssembly(f) || f.form === 'flat' || f.form === 'cracked') return null;
  const d = defOf(f);
  if (!d || isLiquid(f) || isContainerProduct(f)) return null;
  if (f.id === 'egg' && f.form === 'whole' && !isCookedEgg(f)) return withForm(f, 'cracked');
  return withForm(f, 'flat');
}

/** Masher: a soft mound. Raw eggs crack, cracked eggs get beaten. */
export function mash(f: FoodState): FoodState | null {
  if (!f || isAssembly(f) || f.form === 'mashed') return null;
  const d = defOf(f);
  if (!d || isLiquid(f) || isContainerProduct(f)) return null;
  if (f.id === 'egg' && !isCookedEgg(f)) {
    if (f.form === 'whole') return withForm(f, 'cracked');
    const src = snapshot(f);
    const out = makeProduct('beaten-egg', [src], { season: { ...(f.season ?? {}) } });
    out.seed = f.seed;
    out.cook = { ...emptyCook(), temp: fin(f.cook?.temp) };
    return out;
  }
  return withForm(f, 'mashed');
}

// ---------------------------------------------------------------------------------------------
// Combining (dropping food onto food)

function cutStyle(f: FoodState): string {
  return defOf(f)?.cut ?? 'none';
}

/** Split bread that wraps a sandwich (renders bottom + top halves). */
export function isSandwichBase(f: FoodState): boolean {
  if (!f || isAssembly(f)) return false;
  const c = cutStyle(f);
  return (c === 'bun' && f.form === 'halved') || (c === 'bread' && f.form === 'sliced') || (f.id === 'baguette' && f.form === 'halved');
}

/** Whole buns / baguettes: split automatically when something is put on them. */
function isSplittableBread(f: FoodState): boolean {
  return !!f && !isAssembly(f) && f.form === 'whole' && (cutStyle(f) === 'bun' || f.id === 'baguette');
}

/** Flat things that carry toppings (pizza base, tortilla, pancake, cake, cookie). */
export function isFlatBase(f: FoodState): boolean {
  if (!f || isAssembly(f)) return false;
  if ((f.id === 'dough' || f.id === 'cookie-dough') && f.form === 'flat') return true;
  return ['tortilla', 'flatbread', 'pancake', 'cake', 'cookie', 'omelet'].includes(f.id) && f.form === 'whole';
}

/** Things that sit on a base as a layer rather than being scattered. */
function isDiscLayer(f: FoodState): boolean {
  if (!f || isAssembly(f)) return false;
  if (isFlatBase(f) || isSandwichBase(f) || isSplittableBread(f)) return true;
  return f.form === 'whole' && (cutStyle(f) === 'disc' || f.id === 'fried-egg');
}

function asSandwichBase(f: FoodState): FoodState {
  return isSplittableBread(f) ? { ...f, form: 'halved' } : f;
}

/** Give every node of a tree a seed that is unique within it (visual segments are keyed by seed). */
function uniqueSeeds(root: FoodState) {
  const seen = new Set<number>();
  const visit = (s: FoodState, depth: number) => {
    if (!s || depth > 12) return;
    while (!Number.isFinite(s.seed) || seen.has(s.seed)) s.seed = newSeed();
    seen.add(s.seed);
    for (const p of s.parts ?? []) visit(p, depth + 1);
  };
  visit(root, 0);
}

function makeAssembly(layout: AssemblyLayout, parts: FoodState[], seed?: number): FoodState {
  const a = makeFood('assembly', 'whole', { layout, parts: parts.filter(Boolean) });
  if (seed !== undefined && Number.isFinite(seed)) a.seed = seed;
  uniqueSeeds(a);
  syncAssemblyCook(a);
  return a;
}

function appendPart(a: FoodState, p: FoodState): FoodState {
  const out: FoodState = { ...a, parts: [...(a.parts ?? []), p] };
  uniqueSeeds(out);
  syncAssemblyCook(out);
  return out;
}

function combineImpl(b: FoodState, a: FoodState): FoodState {
  ensureCook(b);
  ensureCook(a);
  // a dollop of whipped cream becomes a topping
  if (a.id === 'whipped-cream') {
    const out = snapshot(b);
    addSeasoning(out, 'whip', 1.5);
    for (const [k, v] of Object.entries(a.season ?? {})) addSeasoning(out, k, v);
    return out;
  }
  // runny things poured over food coat it (French toast, battered fish)
  if (POURABLE.has(a.id)) {
    const coat = { ...a, form: 'flat' as Form };
    if (isAssembly(b)) return appendPart(b, coat);
    return makeAssembly('stack', [b, coat]);
  }
  if (isAssembly(b)) {
    const parts = b.parts ?? [];
    if (isAssembly(a) && a.layout === 'pile' && b.layout === 'pile') {
      const out: FoodState = { ...b, parts: [...parts, ...(a.parts ?? [])] };
      uniqueSeeds(out);
      syncAssemblyCook(out);
      return out;
    }
    // a heap of burger bits + a bun = a burger
    if (b.layout === 'pile' && b.form === 'whole' && (isSandwichBase(a) || isSplittableBread(a)) && parts.every((p) => !isContainerProduct(p) && !isLiquid(p))) {
      return makeAssembly('stack', [asSandwichBase(a), ...parts], b.seed);
    }
    return appendPart(b, a);
  }
  if (isAssembly(a)) {
    if (isSandwichBase(b) || isSplittableBread(b)) return makeAssembly('stack', [asSandwichBase(b), a]);
    if (isFlatBase(b)) return makeAssembly('topped', [b, a]);
    if (a.layout === 'pile') return makeAssembly('pile', [b, ...(a.parts ?? [])]);
    return makeAssembly('pile', [b, a]);
  }
  if (isSandwichBase(b) || isSplittableBread(b)) return makeAssembly('stack', [asSandwichBase(b), a]);
  if (isFlatBase(b)) return makeAssembly(isDiscLayer(a) ? 'stack' : 'topped', [b, a]);
  const solid = (x: FoodState) => !isContainerProduct(x) && !isLiquid(x);
  if ((isSandwichBase(a) || isSplittableBread(a)) && solid(b)) return makeAssembly('stack', [asSandwichBase(a), b]);
  if (isFlatBase(a) && solid(b)) return makeAssembly('topped', [a, b]);
  return makeAssembly('pile', [b, a]);
}

/**
 * Drop `added` onto `base`. Forgiving and never throws: sandwiches & burgers stack, flat bases
 * get toppings, existing dishes get the part appended, anything else becomes a pile.
 */
export function combine(base: FoodState, added: FoodState): FoodState {
  try {
    if (!base) return snapshot(added);
    if (!added) return snapshot(base);
    return combineImpl(snapshot(base), snapshot(added));
  } catch {
    try {
      return makeAssembly('pile', [snapshot(base), snapshot(added)]);
    } catch {
      return base;
    }
  }
}

// ---------------------------------------------------------------------------------------------
// Mixing bowl

const CUT_BITS = new Set<Form>(['halved', 'sliced', 'sticks', 'strips', 'diced', 'minced', 'leaves', 'shredded', 'pieces', 'grated', 'mashed', 'flat']);

function cat(f: FoodState): string {
  return defOf(f)?.category ?? '';
}

function isRawEgg(f: FoodState): boolean {
  if (f.id === 'beaten-egg') return true;
  return f.id === 'egg' && !isCookedEgg(f) && doneness(f.cook) < 0.35;
}

/** Small or chopped: fits in a salad / stir-fry / omelet. */
function isBit(f: FoodState): boolean {
  const d = defOf(f);
  if (!d || isAssembly(f) || isContainerProduct(f) || isLiquid(f)) return false;
  if (CUT_BITS.has(f.form)) return true;
  return (d.cut === 'bunch' && d.size <= 0.14) || d.cut === 'leafy';
}

function sweetness(season: Record<string, number>): number {
  const g = (k: string) => season[k] ?? 0;
  return g('sugar') + g('honey') + g('chocolate-syrup') + 0.6 * g('jam') + 0.5 * g('sprinkles') + 0.4 * g('whip') + 0.3 * g('cinnamon');
}

/** Fine in a salad bowl: chopped veg & fruit, herbs, cheese, nuts, croutons, cooked eggs / meat. */
function saladOk(f: FoodState): boolean {
  const d = defOf(f);
  if (!d || isAssembly(f) || isContainerProduct(f) || isLiquid(f)) return false;
  if (d.category === 'fruit' || d.category === 'veg') return isBit(f);
  if (d.tags.includes('cheese') || f.id === 'nuts' || f.id === 'tofu') return true;
  if (f.id === 'bread' || f.id === 'baguette') return f.form === 'diced';
  if (f.id === 'egg') return isCookedEgg(f);
  if (d.category === 'meat' || d.category === 'seafood') return doneness(f.cook) >= 0.6 && f.form !== 'whole' || f.id === 'ham';
  if (f.id === 'beans') return f.cook.boil >= 0.6;
  return false;
}

/** Whisk everything in the bowl together. Always returns one new state. */
export function mixBowl(contents: FoodState[]): FoodState {
  // a salad already in the bowl takes the new things in
  const items = (contents ?? [])
    .filter(Boolean)
    .flatMap((i) => (isAssembly(i) && i.layout === 'pile' && (contents ?? []).length > 1 ? i.parts ?? [] : [i]))
    .map(snapshot);
  items.forEach(ensureCook);
  if (!items.length) return makeProduct('mixture', []);
  // finished things on their own stay what they are (re-whisking dough or a salad changes nothing)
  if (items.length === 1) {
    const only = items[0];
    const keep = isAssembly(only) || ['dough', 'cookie-dough', 'flour'].includes(only.id) || (isProduct(only) && only.id !== 'beaten-egg');
    if (keep) return { ...only, seed: newSeed() };
  }
  const has = (id: string) => items.some((i) => i.id === id);
  const season = mergeSeasons(items);
  const sweetSeason = sweetness(season);
  const eggs = items.filter(isRawEgg);
  const milky = items.filter((i) => i.id === 'milk' || i.id === 'cream');
  const chocolate = has('chocolate') || (season['chocolate-syrup'] ?? 0) >= 0.2;
  const sweet = sweetSeason >= 0.4 || chocolate || has('marshmallow') || has('candy') || has('gummy');
  const cook = mixedCook(items);
  const product = (id: string, from = items, extra: Partial<FoodState> = {}) => makeProduct(id, from, { cook: { ...cook }, season: { ...season }, ...extra });

  // baking: flour + wet things
  if (has('flour')) {
    if (milky.length || items.some((i) => i.id === 'sweet-cream')) return product('batter');
    if (eggs.length || has('butter') || has('yogurt') || (season['olive-oil'] ?? 0) >= 0.2) {
      return product(sweet && (has('butter') || eggs.length) ? 'cookie-dough' : 'dough');
    }
    if (items.length === 1) return { ...items[0], seed: newSeed() };
    return product('mixture');
  }
  // eggs (± milk, cheese, herbs, chopped fillings) -> beaten eggs
  if (eggs.length) {
    const friendly = (x: FoodState) =>
      isRawEgg(x) || x.id === 'milk' || x.id === 'cream' || x.id === 'basil' || hasTagF(x, 'cheese') || x.id === 'ham' ||
      (isBit(x) && ['veg', 'meat', 'seafood', 'dairy', 'pantry'].includes(cat(x)));
    if (items.every(friendly)) {
      const weights = items.map((x) => (isRawEgg(x) ? 3 : x.id === 'milk' || x.id === 'cream' ? 0.6 : 0.25));
      return product('beaten-egg', items, { tint: tintWeighted(items, weights) });
    }
    return product('mixture');
  }
  const sweetThing = (x: FoodState) => ['fruit', 'sweets', 'dairy'].includes(cat(x)) || hasTagF(x, 'sweet') || x.id === 'nuts';
  // cream -> whipped cream; with fruit / chocolate -> sweet cream
  if (has('cream')) {
    if (items.every((i) => i.id === 'cream' || i.id === 'whipped-cream' || i.id === 'sweet-cream')) return product('whipped-cream');
    if (items.every(sweetThing)) return product('sweet-cream');
  }
  // ice cream + mix-ins -> ice cream with bits in it; with milk -> sweet cream
  if (has('ice-cream') || has('scoops')) {
    if (milky.length && items.every(sweetThing)) return product('sweet-cream');
    if (items.every(sweetThing)) return product('scoops', items, { cook: { ...cook, freeze: Math.max(0.6, cook.freeze), temp: Math.min(-0.3, cook.temp) } });
  }
  // milk + something sweet -> sweet cream (freeze it for ice cream)
  if (has('milk') && items.every(sweetThing) && (sweetSeason >= 0.3 || items.some((i) => i.id !== 'milk'))) return product('sweet-cream');
  // cooked potatoes (+ butter / milk / cheese) -> mashed potatoes
  const potatoes = items.filter((i) => i.id === 'potato');
  if (potatoes.length && potatoes.every((p) => doneness(p.cook) >= 0.5)) {
    const extrasOk = items.every((i) => i.id === 'potato' || ['butter', 'milk', 'cream', 'garlic', 'basil', 'yogurt'].includes(i.id) || hasTagF(i, 'cheese'));
    if (extrasOk) {
      const main = potatoes[0];
      const rest = items.filter((i) => i !== main);
      const out: FoodState = { ...main, form: 'mashed', seed: newSeed(), season: { ...season }, cook: { ...main.cook, temp: cook.temp } };
      if (rest.length) out.from = trimFrom(rest);
      else delete out.from;
      return out;
    }
  }
  // avocado (+ lemon / onion / tomato / chili) -> guacamole
  if (has('avocado') && items.every((i) => ['avocado', 'lemon', 'onion', 'tomato', 'chili', 'garlic', 'basil', 'bell-pepper', 'corn'].includes(i.id))) {
    return product('mixture');
  }
  // chopped veg / fruit (± cheese, nuts, croutons...) -> salad
  const produce = items.filter((i) => cat(i) === 'fruit' || cat(i) === 'veg' || i.id === 'basil');
  if (items.every(saladOk) && produce.length * 3 >= items.length && produce.length) {
    return makeAssembly('pile', items);
  }
  // nothing to mix
  if (items.length === 1 && (isLiquid(items[0]) || isContainerProduct(items[0]) || hasTagF(items[0], 'powder'))) {
    return { ...items[0], seed: newSeed() };
  }
  return product('mixture');
}

// ---------------------------------------------------------------------------------------------
// Blender

function massOf(f: FoodState): number {
  const d = defOf(f);
  return (d ? clamp(0.6 + d.size * 4, 0.7, 1.8) : 1) * clamp(fin(f.amount, 1), 0.1, 1);
}

/** Blend everything: fruity / milky -> drink, veggie -> (cold) soup, meaty / bready -> mixture. */
export function blend(contents: FoodState[]): FoodState {
  const items = (contents ?? []).filter(Boolean).map(snapshot);
  items.forEach(ensureCook);
  if (!items.length) return makeProduct('drink', []);
  let savory = 0, veg = 0, sweet = 0;
  for (const l of items.flatMap((i) => leaves(i))) {
    const d = defOf(l);
    if (!d) continue;
    const w = massOf(l);
    const t = d.tags;
    if (t.includes('meat') || t.includes('seafood') || t.includes('bread') || t.includes('pasta') || t.includes('rice') || t.includes('dough') || t.includes('powder') || t.includes('egg')) savory += w;
    else if (t.includes('veg') || t.includes('herb') || t.includes('leafy') || t.includes('mushroom')) veg += w;
    else if (d.category === 'fruit' || d.category === 'dairy' || d.category === 'sweets' || t.includes('sweet') || t.includes('drink')) sweet += w;
    else veg += w * 0.5;
  }
  const total = savory + veg + sweet;
  const cook = mixedCook(items);
  const iceCream = items.some((i) => i.id === 'ice-cream' || i.id === 'scoops' || i.id === 'icepop');
  if (iceCream) cook.temp = Math.min(cook.temp, -0.3);
  cook.boil = items.reduce((s, i) => s + i.cook.boil, 0) / items.length;
  cook.freeze = 0;
  const out = (id: string) => makeProduct(id, items, { cook });
  if (items.some((i) => i.id === 'soup') && sweet < veg + savory) return out('soup');
  if (total > 0 && savory >= total * 0.5) return out('mixture');
  if (veg > sweet) return out('soup');
  return out('drink');
}

// ---------------------------------------------------------------------------------------------
// Soup pot

const STAPLES = new Set(['spaghetti', 'rice', 'egg', 'potato']);
const HOT_DRINK_IDS = new Set(['milk', 'cream', 'chocolate', 'marshmallow', 'sweet-cream', 'drink', 'ice-cream', 'scoops', 'whipped-cream', 'cookie', 'candy']);

/**
 * Called while the pot boils. Different ingredients that have boiled enough become soup;
 * milk + chocolate becomes hot chocolate; pasta / rice / eggs / potatoes on their own stay
 * separate. Returns null when nothing should change.
 */
export function potMerge(contents: FoodState[]): FoodState | null {
  const items = (contents ?? []).filter(Boolean);
  if (!items.length) return null;
  items.forEach(ensureCook);
  const season = mergeSeasons(items);
  const hot = (extra: Partial<CookState> = {}) => {
    const c = mixedCook(items);
    c.temp = Math.max(...items.map((i) => i.cook.temp), 0.6);
    c.boil = Math.min(2, items.reduce((s, i) => s + i.cook.boil, 0) / items.length);
    c.freeze = 0;
    return { ...c, ...extra };
  };
  if (items.length === 1) {
    const it = items[0];
    if ((it.id === 'milk' || it.id === 'cream') && (season['chocolate-syrup'] ?? 0) >= 0.4 && it.cook.boil >= 0.4) {
      return makeProduct('drink', [it], { cook: hot(), season });
    }
    return null;
  }
  const fresh = items.filter((i) => i.id !== 'soup' && i.id !== 'drink');
  if (!fresh.every((i) => i.cook.boil >= (isLiquid(i) || isContainerProduct(i) ? 0.3 : 0.5))) return null;
  const expand = (list: FoodState[]) => list.flatMap((i) => (i.id === 'soup' || i.id === 'drink') && i.from?.length ? i.from : [i]);
  // hot chocolate & friends
  const liquidBase = items.some((i) => i.id === 'milk' || i.id === 'cream' || i.id === 'sweet-cream' || i.id === 'drink');
  const drinky = items.every((i) => HOT_DRINK_IDS.has(i.id) || cat(i) === 'fruit');
  const chocolatey = items.some((i) => i.id === 'chocolate' || i.id === 'drink') || (season['chocolate-syrup'] ?? 0) >= 0.3;
  if (liquidBase && drinky && (chocolatey || items.some((i) => cat(i) === 'fruit' || i.id === 'marshmallow'))) {
    return makeProduct('drink', snapshotAll(expand(items)), { cook: hot(), season });
  }
  // soup: an existing soup takes anything; otherwise 2+ different things, not just staples
  const ids = new Set(expand(items).map((i) => i.id));
  const onlyStaples = items.every((i) => STAPLES.has(i.id));
  if (items.some((i) => i.id === 'soup') || (ids.size >= 2 && !onlyStaples)) {
    return makeProduct('soup', snapshotAll(expand(items)), { cook: hot(), season });
  }
  return null;
}

function snapshotAll(list: FoodState[]): FoodState[] {
  return list.map(snapshot);
}

// ---------------------------------------------------------------------------------------------
// Frying pan

function isEggy(f: FoodState): boolean {
  return (f.id === 'egg' && f.form === 'cracked') || f.id === 'beaten-egg' || f.id === 'scrambled-eggs';
}

function isCookedStarch(f: FoodState): boolean {
  return (f.id === 'rice' || f.id === 'spaghetti') && f.cook.boil >= 0.6;
}

/** Eggs going into a stir-fry are scrambled through it. */
function scrambledFrom(f: FoodState): FoodState {
  if (f.id === 'scrambled-eggs' || f.id === 'fried-egg') return f;
  const out = makeProduct('scrambled-eggs', [f], { season: { ...(f.season ?? {}) } });
  out.cook = { ...f.cook };
  out.seed = f.seed;
  return out;
}

/**
 * Called while the pan sizzles with several things in it. Eggs + chopped fillings fold into an
 * omelet; chopped things that have fried a while become a stir-fry (with cooked rice: fried
 * rice). Returns null when nothing should change.
 */
export function panMerge(contents: FoodState[]): FoodState | null {
  const items = (contents ?? []).filter(Boolean);
  if (items.length < 2) return null;
  items.forEach(ensureCook);
  const fried = (x: FoodState, min: number) => Math.max(x.cook.fry, x.cook.grill) >= min;
  const pile = items.find((x) => isAssembly(x) && x.layout === 'pile') ?? null;
  const rest = items.filter((x) => x !== pile);
  const starch = items.some((x) => isCookedStarch(x)) || (pile?.parts ?? []).some((x) => isCookedStarch(x));
  const eggs = rest.filter(isEggy);
  const fillings = rest.filter((x) => !isEggy(x));
  // omelet
  if (!pile && !starch && eggs.length && fillings.length && fillings.every(isBit)) {
    const from = [...eggs, ...fillings].map(snapshot);
    const weights = from.map((x) => (isEggy(x) ? 3 : 0.25));
    const om = makeProduct('omelet', from, { tint: tintWeighted(from, weights) });
    const c = emptyCook();
    c.fry = eggs.reduce((s, e) => s + e.cook.fry, 0) / eggs.length;
    c.grill = eggs.reduce((s, e) => s + e.cook.grill, 0) / eggs.length;
    c.temp = Math.max(...items.map((x) => x.cook.temp));
    om.cook = c;
    return om;
  }
  // stir-fry / fried rice
  const ok = (x: FoodState) => {
    if (starch && (isEggy(x) || x.id === 'fried-egg')) return true;
    if (isCookedStarch(x)) return fried(x, 0.25);
    return isBit(x) && fried(x, 0.4);
  };
  if (!rest.length || !rest.every(ok)) return null;
  const parts = rest.map((x) => (isEggy(x) || x.id === 'fried-egg' ? scrambledFrom(snapshot(x)) : snapshot(x)));
  if (pile) return makeAssembly('pile', [...(pile.parts ?? []).map(snapshot), ...parts], pile.seed);
  if (new Set(rest.map((x) => x.id)).size < 2) return null;
  return makeAssembly('pile', parts);
}
