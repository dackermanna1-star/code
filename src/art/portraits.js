// Visual-novel bust portraits (96×120, shown at 2× in the dialogue box).
// One parametric rig per character (portraits_<char>.js) → every expression is the same face with different
// muscle settings; lights are band remaps of the same drawing (portraits_core.js). Everything is cached.
// 'colonel' is delegated to portraits_colonel.js (owned by the colonel agent).
import { makeCanvas, ctxOf, tinyText } from './util.js';
import { getColonelPortrait, initColonelPortraits } from './portraits_colonel.js';
import { prepare, shade, edgeDistance, mixInto, bay, PW, PH, hexToRgb, PAL, clamp } from './portraits_core.js';
import { mergeExpr } from './portraits_face.js';
import { buildHuman } from './portraits_human.js';
import { TESS, TESS_EXPR } from './portraits_tess.js';
import { DANNY, DANNY_EXPR } from './portraits_danny.js';
import { LEAH, LEAH_EXPR } from './portraits_leah.js';
import { MARCUS, MARCUS_EXPR } from './portraits_marcus.js';
import { ADAIR, ADAIR_EXPR } from './portraits_adair.js';
import { DENISE, DENISE_EXPR } from './portraits_denise.js';
import { CHARS } from '../data/chars.js';

const CAST = {
  tess: { def: TESS, expr: TESS_EXPR },
  danny: { def: DANNY, expr: DANNY_EXPR },
  leah: { def: LEAH, expr: LEAH_EXPR },
  marcus: { def: MARCUS, expr: MARCUS_EXPR },
  adair: { def: ADAIR, expr: ADAIR_EXPR },
  denise: { def: DENISE, expr: DENISE_EXPR },
};
export const PORTRAIT_LIGHTS = ['normal', 'dark', 'under', 'fluor', 'red', 'dawn'];

const cache = new Map();      // final canvases
const geo = new Map();        // prepared rigs (LRU-ish), key without light
const GEO_MAX = 24;

function exprOf(char, expr) {
  const c = CAST[char];
  if (!c) return null;
  const id = c.expr[expr] ? expr : (c.def.defaultExpr || 'neutral');
  return { id, params: c.expr[id] };
}

function geometry(char, exprId, grime, enrolled) {
  const key = `${char}|${exprId}|${grime}|${enrolled ? 1 : 0}`;
  let rig = geo.get(key);
  if (rig) { geo.delete(key); geo.set(key, rig); return rig; }
  const c = CAST[char];
  const base = c.expr[exprId];
  const enr = enrolled || !!base.__enr;
  const E = mergeExpr(c.def.exprBase, base, enrolled ? c.def.enrolledExpr || ENROLLED : null);
  rig = buildHuman(c.def, E, { grime, enrolled: enr, half: !enrolled && base.__enr === 'half', expr: exprId });
  prepare(rig);
  rig.edge = edgeDistance(rig, 6);
  geo.set(key, rig);
  if (geo.size > GEO_MAX) geo.delete(geo.keys().next().value);
  return rig;
}

// Entranced styling layered over any expression: glassy unfocused eyes, slack, pale (materials handle pallor).
const ENROLLED = { eye: { glassy: 1, gx: 0, gy: 0.15, diverge: 0.1, pupil: 1.1 } };

function enrolledPost(d, rig, k = 1) {
  const A = hexToRgb(PAL.amber_l), A2 = hexToRgb(PAL.amber);
  for (let y = 0; y < PH; y++) for (let x = 0; x < PW; x++) {
    const i = y * PW + x; if (!rig.mat[i]) continue;
    const e = rig.edge[i];
    // faint husk-amber at the silhouette: a solid 1-px rim, a broken row inside it, a breath of warmth deeper in
    if (e <= 1.2) mixInto(d, i, A, 0.42 * k);
    else if (e <= 2.2) { if (bay(x, y) < 0.5) mixInto(d, i, A2, 0.3 * k); }
    else if (e <= 4.2) { if (bay(x, y) < 0.25 * k) mixInto(d, i, A2, 0.16); }
  }
}

/** Apply a character post pass (glass, glow...) declared by the rig definition. */
function postFor(char, exprId, enrolled, lightName) {
  const def = CAST[char].def;
  const enr = enrolled || CAST[char].expr[exprId]?.__enr;
  return (d, rig, idx, light) => {
    def.post?.(d, rig, idx, light, lightName, exprId);
    if (enr) enrolledPost(d, rig, enr === 'half' && !enrolled ? 0.5 : 1);
  };
}

export async function initPortraits() {
  await initColonelPortraits();
  // warm the most common faces now; everything else is generated lazily (and cached) on first use
  for (const ch of Object.keys(CAST)) getPortrait(ch, CAST[ch].def.defaultExpr || 'neutral', {});
  scheduleWarm();
}

let warmQ = null;
function scheduleWarm() {
  if (typeof window === 'undefined' || warmQ) return;
  warmQ = [];
  for (const ch of Object.keys(CAST)) for (const e of Object.keys(CAST[ch].expr)) warmQ.push([ch, e]);
  const idle = window.requestIdleCallback || ((fn) => setTimeout(() => fn({ timeRemaining: () => 8 }), 60));
  const step = (dl) => {
    let n = 0;
    while (warmQ.length && (dl.timeRemaining() > 6 || n === 0) && n < 2) { const [c, e] = warmQ.shift(); getPortrait(c, e, {}); n++; }
    if (warmQ.length) idle(step);
  };
  idle(step);
}

export function getPortrait(char, expr = 'neutral', opts = {}) {
  if (char === 'colonel') return getColonelPortrait(expr, opts);
  const light = PORTRAIT_LIGHTS.includes(opts.light) ? opts.light : 'normal';
  const grime = clamp(Math.round(opts.grime || 0), 0, 2);
  const enrolled = !!opts.enrolled;
  if (!CAST[char]) return placeholder(char, expr);
  const ex = exprOf(char, expr);
  const key = `${char}|${ex.id}|${light}|${grime}|${enrolled ? 1 : 0}`;
  let c = cache.get(key);
  if (c) return c;
  const rig = geometry(char, ex.id, grime, enrolled);
  c = shade(rig, light, postFor(char, ex.id, enrolled, light)).canvas;
  cache.set(key, c);
  return c;
}

/** Debug/preview helper: expression ids per character (from the data contract). */
export function portraitExprs(char) { return CHARS[char]?.expr || []; }

function placeholder(char, expr) {
  const key = `ph|${char}|${expr}`;
  if (cache.has(key)) return cache.get(key);
  const c = makeCanvas(96, 120); const x = ctxOf(c);
  x.fillStyle = '#272834'; x.fillRect(0, 0, 96, 120);
  tinyText(x, 4, 4, char, '#c4bdb0'); tinyText(x, 4, 12, expr, '#9d812e');
  cache.set(key, c); return c;
}
