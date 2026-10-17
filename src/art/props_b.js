// PROPS B (art) — the second half of the prop catalog: computer lab & science, cafeteria & kitchen,
// gym, basement, auditorium, Founder's Vault (incl. the husks), the Breaker, exterior, pickups,
// notes, decals and graffiti. src/art/props.js dispatches every type in PROP_B_TYPES here.
//
//   initPropsB()                                   → Promise (prewarms a few cheap props)
//   renderPropB(type, { state, dir, variant, clean, frame, occupant, params, label, sitDir })
//                                                  → { canvas, ox, oy }  draw at (x*16+ox, y*16+oy)
//   drawPropDynamicB(ctx, type, px, py, params, t) → draws the prop (animated ones pick a frame from t)
//
// Conventions
// - Everything is generated lazily and cached per (type, state, dir, variant bucket, clean, frame,
//   occupant, label). Builders are deterministic (seeded by type/variant), never Math.random.
// - `frame`: animated types (boiler firebox, breathing coal heap, candle, cursor blink, pickup
//   glint, lit lamps) take frame = 0..FRAMES-1 (see PROP_B_FRAMES); any frame value is wrapped.
//   The engine only cycles frames when the catalog sets `frames` — see PROP_B_FRAMES for the
//   suggested { frames, fps } per type.
// - `variant`: numbers are bucketed per type; husk types also accept 'a'..'f' / 'husk_c' / 'boy'.
// - `dir` (only where it matters): seats & husks = the sitter's facing; car_wagon = the end the
//   car's nose points to; cobweb = which ceiling corner; chute = the way the coal runs downhill.
//   The engine defaults a missing dir to 'down'; each type maps 'down' to its natural default.
// - Wall props (mount 'wall') are drawn on the face_low cell (y 0..15) and may rise into face_high
//   (y -16..-1); y = 16 is the floor line. 1×2 door props span y 0..31 (face_high + face_low).
import { PROPS } from '../data/props.js';
import { makeCanvas, ctxOf, tinyText, hashStr } from './util.js';
import { LAB } from './props_b_lab.js';
import { KITCHEN } from './props_b_kitchen.js';
import { GYM } from './props_b_gym.js';
import { BASEMENT } from './props_b_basement.js';
import { AUD } from './props_b_aud.js';
import { VAULT } from './props_b_vault.js';
import { BREAKER } from './props_b_breaker.js';
import { EXTERIOR } from './props_b_ext.js';
import { MISC } from './props_b_misc.js';

export const PROP_B_TYPES = [
  'computer_desk', 'printer', 'lab_bench', 'lab_stool', 'fume_hood', 'eyewash', 'specimen_shelf', 'chem_cabinet', 'skeleton',
  'caf_table', 'serving_line', 'tray_rack', 'stove', 'mixer', 'freezer_door', 'dumbwaiter', 'sink_big', 'shelf_pantry',
  'vending_machine', 'milk_cooler',
  'bleachers', 'hoop', 'hoop_stand', 'scoreboard', 'mat_stack', 'ball_cart', 'locker_bench', 'court_circle', 'court_line_h',
  'court_line_v',
  'boiler', 'pipe_h', 'pipe_v', 'breaker_panel', 'coal_heap', 'janitor_desk', 'pegboard', 'mop_bucket', 'shelf_metal',
  'desk_pile', 'water_heater', 'valve_wheel', 'calendar', 'cage_bulb', 'cobweb',
  'aud_seat', 'curtain', 'lectern', 'piano', 'music_stand', 'phonograph', 'instrument_case', 'stage_flat', 'lever', 'rope_rail',
  'sarcophagus', 'wreath', 'flag_regimental', 'name_wall', 'writing_desk', 'candle', 'husk_seated', 'husk_kneeling',
  'chute', 'picking_bench', 'beam', 'lamp_miner', 'weigh_desk', 'register_book', 'shelf_ledgers', 'pulley_wheel',
  'car_wagon', 'oak_dead', 'oak_canopy', 'sign_school', 'sign_danger', 'steam_vent', 'flagpole', 'fence', 'lamp_post',
  'dumpster', 'bush_dead',
  'pickup', 'note_paper', 'backpack', 'decal_leaves', 'decal_papers', 'decal_glass', 'decal_stain', 'decal_tiles', 'graffiti',
  'cicada_shells',
];

/** type → { build(o), facing?, defaultDir?, variants?, variantOf?, frames?, fps?, states?, label?, draw? } */
export const PROPS_B = { ...LAB, ...KITCHEN, ...GYM, ...BASEMENT, ...AUD, ...VAULT, ...BREAKER, ...EXTERIOR, ...MISC };

/** Suggested catalog animation settings (engine cycles `frames` at `fps` when the catalog has them). */
export const PROP_B_FRAMES = Object.fromEntries(
  Object.entries(PROPS_B).filter(([, e]) => e.frames > 1).map(([t, e]) => [t, { frames: e.frames, fps: e.fps || 4 }]),
);

const DIRS = ['up', 'down', 'left', 'right'];
const cache = new Map();

function norm(type, entry, opts) {
  const def = PROPS[type] || {};
  const states = entry.states || def.states || ['default'];
  const state = states.includes(opts.state) ? opts.state : states[0];
  let dir = 'down';
  if (entry.facing) {
    const sit = opts.sitDir || opts.params?.sitDir;
    dir = DIRS.includes(sit) ? sit : DIRS.includes(opts.dir) ? opts.dir : 'down';
    if (!DIRS.includes(sit) && dir === 'down' && entry.defaultDir) dir = entry.defaultDir;
    if (!entry.facing.includes(dir)) dir = entry.facing[0];
  }
  let variant = 0;
  const v = opts.variant ?? opts.params?.variant;
  if (entry.variantOf) variant = entry.variantOf(v, opts);
  else if (entry.variants > 1) {
    const n = entry.variants;
    const num = typeof v === 'number' ? v : typeof v === 'string' ? (/^\d+$/.test(v) ? Number(v) : hashStr(v)) : 0;
    variant = ((num | 0) % n + n) % n;
  }
  const nf = entry.frames || 1;
  const frame = nf > 1 && (!entry.animStates || entry.animStates.includes(state)) ? (((opts.frame | 0) % nf) + nf) % nf : 0;
  const label = entry.label ? String(opts.label ?? opts.params?.label ?? opts.params?.text ?? '') : '';
  const occupant = entry.occupant ? (opts.occupant || opts.params?.occupant || null) : null;
  const item = entry.item ? String(opts.item ?? opts.params?.item ?? '') : '';
  return { type, state, dir, variant, clean: !!opts.clean, frame, label, occupant, item, params: opts.params || {} };
}

export async function initPropsB() {
  const t0 = performance.now();
  // Cheap, common ones; everything else is built on first use.
  for (const t of ['pickup', 'note_paper', 'cobweb', 'pipe_h']) { try { renderPropB(t, {}); } catch (e) { console.error('[props_b] prewarm', t, e); } }
  initPropsB.ms = Math.round(performance.now() - t0);
}

export function renderPropB(type, opts = {}) {
  const entry = PROPS_B[type];
  if (!entry) return null;
  const o = norm(type, entry, opts);
  const key = `${type}|${o.state}|${o.dir}|${o.variant}|${o.clean ? 1 : 0}|${o.frame}|${o.occupant || ''}|${o.label}|${o.item}`;
  let r = cache.get(key);
  if (!r) {
    try { r = entry.build(o); } catch (e) { console.error(`[props_b] ${type} build failed`, e); r = fallback(type); }
    cache.set(key, r);
  }
  return r;
}

export function drawPropDynamicB(ctx, type, px, py, params = {}, t = 0) {
  const entry = PROPS_B[type];
  if (!entry) return;
  if (entry.draw) { entry.draw(ctx, px, py, norm(type, entry, { ...params, params }), params, t); return; }
  const frame = entry.frames > 1 ? Math.floor(t * (entry.fps || 4)) : 0;
  const p = renderPropB(type, { ...params, params, frame });
  if (p && p.canvas) ctx.drawImage(p.canvas, px + p.ox, py + p.oy);
}

/** Build/caching stats for QA (preview bench). */
export function propsBStats() { return { cached: cache.size }; }

function fallback(type) {
  const def = PROPS[type] || { w: 1, h: 1 };
  const w = (def.w || 1) * 16, h = (def.h || 1) * 16;
  const c = makeCanvas(w, h); const x = ctxOf(c);
  x.fillStyle = '#3a2a3a'; x.fillRect(0, 0, w, h);
  tinyText(x, 1, 1, type.slice(0, Math.max(1, Math.floor(w / 4))), '#cfc8b8');
  return { canvas: c, ox: 0, oy: 0 };
}
