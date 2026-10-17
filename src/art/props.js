// PROPS (art) — dispatcher for every prop type + the group-A builders (props_a_*.js).
//   initProps()                         → Promise (awaits props B; prewarms a few common props)
//   getProp(type, { state, dir, variant, clean, frame, occupant, label?, sitDir?, params? })
//                                       → { canvas, ox, oy }  draw at (x*16 + ox, y*16 + oy)
//   drawPropDynamic(ctx, type, px, py, params, t)   (chalkboard, clocks, memorial board)
// Types listed in PROP_B_TYPES go to props_b.js (renderPropB / drawPropDynamicB). Anything in
// neither group gets a neutral labelled box — never a throw.
//
// Conventions (group A)
// - Canvases are cached per (type, state, facing, variant bucket, clean, label). Builders run lazily.
// - `dir` for seats is the SITTER's facing. The engine defaults a missing instance dir to 'down',
//   so for seats whose catalog sitDir is 'up' (desk_student, tiny_chair) 'down' means "default";
//   an explicit facing can be passed as opts.sitDir / params.sitDir (preferred, see report).
// - `label` (door plates, gold leaf) is read from opts.label or opts.params.label when present.
import { propDef, PROPS } from '../data/props.js';
import { makeCanvas, ctxOf, hashStr, tinyText } from './util.js';
import { PROP_B_TYPES, renderPropB, drawPropDynamicB, initPropsB } from './props_b.js';
import { DOORS } from './props_a_doors.js';
import { CLASSROOM } from './props_a_class.js';
import { HALL } from './props_a_hall.js';
import { OFFICE } from './props_a_office.js';
import { LIBRARY } from './props_a_library.js';
import { DYNAMIC } from './props_a_dynamic.js';

/** Group-A registry: type → { build(o), variants?, label?, facing?, dynamic?, draw? }. */
export const PROPS_A = { ...DOORS, ...CLASSROOM, ...HALL, ...OFFICE, ...LIBRARY, ...DYNAMIC };
export const PROP_A_TYPES = Object.keys(PROPS_A);

const cache = new Map();
const DIRS = ['up', 'down', 'left', 'right'];
const B_SET = new Set(PROP_B_TYPES);
const warned = new Set();
function warnOnce(key, e) { if (!warned.has(key)) { warned.add(key); console.error(`[props] ${key}`, e); } }

function safeDef(type) {
  try { return propDef(type); } catch { return null; }
}

/** Normalise the options a builder sees. */
function norm(type, entry, def, opts) {
  const states = def ? def.states : ['default'];
  const state = states.includes(opts.state) ? opts.state : states[0];
  let dir = 'down';
  if (entry.facing) {
    const sit = opts.sitDir || opts.params?.sitDir;
    if (DIRS.includes(sit)) dir = sit;
    else {
      dir = DIRS.includes(opts.dir) ? opts.dir : 'down';
      if (def?.sitDir === 'up' && dir === 'down') dir = 'up';
    }
    if (!entry.facing.includes(dir)) dir = entry.facing[0];
  }
  const nv = entry.variants || 1;
  const variant = nv > 1 ? ((opts.variant | 0) % nv + nv) % nv : 0;
  const label = entry.label ? String(opts.label ?? opts.params?.label ?? '') : '';
  return { type, state, dir, variant, clean: !!opts.clean, label, frame: opts.frame | 0, occupant: opts.occupant || null, params: opts.params || {} };
}

export async function initProps() {
  try { await initPropsB(); } catch (e) { warnOnce('initPropsB failed', e); }
  // Prewarm the props nearly every map shows; everything else is built on first use (~0.1–2 ms).
  for (const t of ['door_class', 'desk_student', 'locker']) { try { getProp(t, {}); } catch { /* lazily retried */ } }
}

export function getProp(type, opts = {}) {
  if (B_SET.has(type)) {
    try { const r = renderPropB(type, opts); if (r && r.canvas) return r; } catch (e) { warnOnce(`renderPropB ${type}`, e); }
  }
  const entry = PROPS_A[type];
  const def = safeDef(type);
  if (!entry) return fallback(type, def, opts);
  const o = norm(type, entry, def, opts);
  const key = `${type}|${o.state}|${o.dir}|${o.variant}|${o.clean ? 1 : 0}|${o.label}`;
  let r = cache.get(key);
  if (!r) {
    try { r = entry.build(o); } catch (e) { warnOnce(`${type} build failed`, e); r = fallback(type, def, opts); }
    cache.set(key, r);
  }
  return r;
}

export function drawPropDynamic(ctx, type, px, py, params = {}, t = 0) {
  if (B_SET.has(type)) {
    try { return drawPropDynamicB(ctx, type, px, py, params, t); } catch (e) { warnOnce(`drawPropDynamicB ${type}`, e); return; }
  }
  const entry = PROPS_A[type];
  if (entry && entry.draw) {
    try {
      const o = norm(type, entry, safeDef(type), { ...params, params });
      return entry.draw(ctx, px, py, o, params, t);
    } catch (e) { warnOnce(`${type} dynamic draw failed`, e); }
  }
  const p = getProp(type, { ...params, params });
  ctx.drawImage(p.canvas, px + p.ox, py + p.oy);
}

// ---- neutral fallback (unknown or not-yet-drawn types) ------------------------------------------
function fallback(type, def, opts) {
  const key = `?${type}|${opts.state || ''}`;
  if (cache.has(key)) return cache.get(key);
  const d = def || { w: 1, h: 1, mount: 'floor' };
  const w = d.w * 16, h = d.h * 16 + (d.mount === 'floor' ? 8 : 0);
  const c = makeCanvas(w, h); const x = ctxOf(c);
  const hue = hashStr(type) % 360;
  x.fillStyle = `hsl(${hue},18%,${d.mount === 'decal' ? 20 : 30}%)`; x.fillRect(0, 0, w, h);
  x.fillStyle = 'rgba(0,0,0,.5)'; x.fillRect(0, h - 2, w, 2);
  tinyText(x, 1, 1, type.slice(0, Math.max(1, Math.floor(w / 4))), '#cfc8b8');
  const r = { canvas: c, ox: 0, oy: -(h - d.h * 16) };
  cache.set(key, r); return r;
}

/** QA helper: group-A types that the catalog lists (used by the preview). */
export function propATypes() { return PROP_A_TYPES.filter((t) => PROPS[t]); }
