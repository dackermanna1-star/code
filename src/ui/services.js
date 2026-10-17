// Guarded adapters to other subsystems. The UI only reaches the engine, audio, settings and saves
// through these helpers, so a missing or stubbed subsystem degrades gracefully instead of throwing.
import { HW } from '../engine/hw.js';
import { CHARS } from '../data/chars.js';
import { ITEMS } from '../data/items.js';
import { DOCS } from '../data/docs.js';
import { chapterTitle } from './theme.js';

const EMPTY_STATE = { chapter: 0, flags: {}, inv: {}, docs: {}, objective: '', battery: 100, flashlightOn: false, visited: {}, playtime: 0 };

export const state = () => HW.state || EMPTY_STATE;
export const flag = (k) => !!HW.state?.flags?.[k];
export const chars = () => HW.data?.chars || CHARS;
export const items = () => HW.data?.items || ITEMS;
export const docs = () => HW.data?.docs || DOCS;

// ---- audio -------------------------------------------------------------------------------------
export function sfx(id, o) { try { return HW.audio?.sfx?.(id, o); } catch (e) { warnOnce('sfx', e); } return null; }
export function blip(who) { try { HW.audio?.blip?.(who); } catch (e) { warnOnce('blip', e); } }
export function murmur(sec) { try { HW.audio?.murmur?.(sec); } catch (e) { warnOnce('murmur', e); } }

// ---- debug / automated tests ---------------------------------------------------------------------
/** True when tests asked dialogue to auto-advance (TECH §14). Accepts several debug shapes. */
export function auto() {
  const d = HW.debug;
  if (!d) return false;
  const a = d.autoAdvance;
  if (a === true) return true;
  if (typeof a === 'function') return !!(d.autoAdvanceOn ?? d.auto ?? d._autoAdvance);
  return !!(d.autoAdvanceOn ?? d._autoAdvance);
}
/** Next scripted choice index for automated tests. */
export function nextChoice() {
  const d = HW.debug;
  const v = d?.nextChoice?.() ?? d?.choiceQueue?.shift?.() ?? (typeof window !== 'undefined' ? window.__HW?.choiceQueue?.shift?.() : undefined);
  return Number.isInteger(v) ? v : 0;
}

// ---- portraits ---------------------------------------------------------------------------------
export function grimeFor(chapter) { return chapter >= 6 ? 2 : chapter >= 3 ? 1 : 0; }
/** Portrait canvas (96×120) or null. Never throws. */
export function portrait(who, expr, o = {}) {
  const def = chars()[who];
  if (!def || !def.expr || def.expr.length === 0) return null; // voice, kevin: no portrait
  const e = def.expr.includes(expr) ? expr : def.expr[0] || 'neutral';
  let light = o.light;
  if (light == null) { try { light = HW.renderer?.portraitLight?.(); } catch { light = null; } }
  const grime = o.grime ?? grimeFor(state().chapter | 0);
  try {
    // Tess's `enrolled` is a level (DESIGN §7, CONTENT §7): 0 / 1 (amber catchlight) / 2 (+ husk sheen), taken
    // from her answers unless the caller passes one. `true` keeps the art's fully entranced look.
    if (who === 'tess' && o.enrolled !== true) {
      const lvl = o.enrolled == null ? tessEnrolledLevel() : Math.max(0, Math.min(2, Number(o.enrolled) || 0));
      const base = HW.art?.portrait?.(who, e, { light: light || 'normal', grime, enrolled: false }) || null;
      return base && lvl > 0 ? tessEnrolled(base, lvl, e) : base;
    }
    return HW.art?.portrait?.(who, e, { light: light || 'normal', grime, enrolled: !!o.enrolled, mirror: !!o.mirror }) || null;
  } catch (err) { warnOnce('portrait:' + who, err); return null; }
}

/** Tess's enrolled level from the roll calls she answered: 0, 1 (pencil) or 2 (ink). */
export function tessEnrolledLevel() {
  const s = state();
  const r = Number.isFinite(s.rollAnswered) ? s.rollAnswered
    : ['roll1_answered', 'roll2_answered', 'roll3_answered'].filter((k) => s.flags?.[k]).length;
  return Math.max(0, Math.min(2, r | 0));
}

// Tess's enrolled look, as a post pass over her normal portrait (the art rig only knows "entranced"):
// level 1 turns the catchlight in each eye husk-amber; level 2 adds a faint amber sheen along her silhouette.
const enrolledCache = new WeakMap();
const AMBER = [255, 196, 92], AMBER_D = [214, 150, 60];
const EYES = [[41, 47], [59, 47]];   // where her catchlights sit in the 96×120 rig (± a few px by expression)
function tessEnrolled(base, level, expr) {
  let per = enrolledCache.get(base);
  if (!per) { per = {}; enrolledCache.set(base, per); }
  if (per[level]) return per[level];
  const w = base.width, h = base.height;
  const c = document.createElement('canvas'); c.width = w; c.height = h;
  const x = c.getContext('2d', { willReadFrequently: true });
  x.drawImage(base, 0, 0);
  const img = x.getImageData(0, 0, w, h); const d = img.data;
  const lum = (i) => d[i * 4] * 0.3 + d[i * 4 + 1] * 0.59 + d[i * 4 + 2] * 0.11;
  const mixPx = (i, rgb, k) => { for (let ch = 0; ch < 3; ch++) d[i * 4 + ch] = Math.round(d[i * 4 + ch] + (rgb[ch] - d[i * 4 + ch]) * k); };
  if (expr !== 'eyes_shut') {
    // catchlight = a small local maximum near each eye, ringed by the much darker iris
    for (const [ex, ey] of EYES) {
      let best = -1, bl = 0;
      for (let y = ey - 4; y <= ey + 4; y++) for (let xx = ex - 5; xx <= ex + 5; xx++) {
        const i = y * w + xx; if (d[i * 4 + 3] < 200) continue;
        const L = lum(i); if (L <= bl) continue;
        let darker = 0;
        for (let dy = -1; dy <= 1; dy++) for (let dx = -1; dx <= 1; dx++) if ((dx || dy) && lum((y + dy) * w + xx + dx) < L * 0.62) darker++;
        if (darker >= 4) { best = i; bl = L; }
      }
      if (best < 0) continue;
      const bx = best % w, by = (best / w) | 0;
      for (let dy = -1; dy <= 1; dy++) for (let dx = -1; dx <= 1; dx++) {
        const i = (by + dy) * w + bx + dx;
        if (lum(i) >= bl * 0.9) mixPx(i, AMBER, 0.85);
      }
    }
  }
  if (level >= 2) {
    // husk sheen: amber at the silhouette edge, a broken second row just inside it
    const a = (xx, y) => (xx < 0 || y < 0 || xx >= w || y >= h ? 0 : d[(y * w + xx) * 4 + 3]);
    const edge = new Uint8Array(w * h);
    for (let y = 0; y < h; y++) for (let xx = 0; xx < w; xx++) {
      if (a(xx, y) < 128) continue;
      if (a(xx - 1, y) < 128 || a(xx + 1, y) < 128 || a(xx, y - 1) < 128 || a(xx, y + 1) < 128) edge[y * w + xx] = 1;
      else if (a(xx - 2, y) < 128 || a(xx + 2, y) < 128 || a(xx, y - 2) < 128 || a(xx, y + 2) < 128) edge[y * w + xx] = 2;
    }
    for (let i = 0; i < w * h; i++) {
      if (edge[i] === 1) mixPx(i, AMBER, 0.3);
      else if (edge[i] === 2 && ((i % w) + ((i / w) | 0)) % 2 === 0) mixPx(i, AMBER_D, 0.18);
    }
  }
  x.putImageData(img, 0, 0);
  per[level] = c;
  return c;
}
export function icon(id) { try { return HW.art?.icon?.(id) || null; } catch (e) { warnOnce('icon:' + id, e); return null; } }
export function cgArt(id) { try { return HW.art?.cg?.(id) || null; } catch (e) { warnOnce('cg:' + id, e); return null; } }

/** Speaker name shown on the plate (TECH: nameShown until the naming flag is set). */
export function speakerName(who, o = {}) {
  if (o.name) return o.name;
  const def = chars()[who];
  if (!def) return String(who || '').toUpperCase();
  if (who === 'colonel' && !flag('colonel_named')) return def.nameShown || '???';
  if (who === 'adair' && !flag('adair_named')) return def.nameShown || '???';
  return def.name;
}

// ---- settings ----------------------------------------------------------------------------------
export const SETTINGS_KEY = 'hallowell.settings';
export const SETTINGS_DEFAULTS = { master: 0.8, music: 0.7, sfx: 0.9, ambience: 0.8, textSpeed: 1, pixelPerfect: true,
  crt: false, grain: true, reduceFlashing: false, fullscreen: false };
let localSettings = null;
function local() {
  if (!localSettings) {
    localSettings = { ...SETTINGS_DEFAULTS };
    try { Object.assign(localSettings, JSON.parse(localStorage.getItem(SETTINGS_KEY) || '{}')); } catch { /* private mode */ }
  }
  return localSettings;
}
export const settings = {
  get(k) {
    const s = HW.settings;
    if (s) {
      if (typeof s.get === 'function') { const v = s.get(k); if (v !== undefined) return v; }
      if (s.values && k in s.values) return s.values[k];
      if (k in s && typeof s[k] !== 'function') return s[k];
    }
    return local()[k] ?? SETTINGS_DEFAULTS[k];
  },
  set(k, v) {
    const s = HW.settings;
    if (s && typeof s.set === 'function') s.set(k, v);
    else if (s && typeof s === 'object') { if (s.values) s.values[k] = v; else s[k] = v; }
    local()[k] = v;
    applySetting(k, v);
  },
  save() {
    try {
      if (HW.settings && typeof HW.settings.save === 'function') HW.settings.save();
      else localStorage.setItem(SETTINGS_KEY, JSON.stringify(local()));
    } catch (e) { warnOnce('settings.save', e); }
  },
};
function applySetting(k, v) {
  try {
    if (k === 'master' || k === 'music' || k === 'sfx' || k === 'ambience') {
      HW.audio?.setVolumes?.({ master: settings.get('master'), music: settings.get('music'), sfx: settings.get('sfx'), ambience: settings.get('ambience') });
    } else if (k === 'fullscreen') {
      if (HW.display?.toggleFullscreen) HW.display.toggleFullscreen(!!v);
      else if (HW.display?.setFullscreen) HW.display.setFullscreen(v);
      else if (typeof document !== 'undefined') {
        if (v && !document.fullscreenElement) document.documentElement.requestFullscreen?.().catch(() => {});
        else if (!v && document.fullscreenElement) document.exitFullscreen?.().catch(() => {});
      }
    } else if (k === 'pixelPerfect') {
      HW.display?.setPixelPerfect?.(v); HW.display?.resize?.();
    }
    HW.settings?.apply?.(k, v);
  } catch (e) { warnOnce('applySetting', e); }
}

/** Accessibility: tone down flicker/strobe effects in the UI too. */
export const reduceFlashing = () => !!settings.get('reduceFlashing');

// ---- saves -------------------------------------------------------------------------------------
export const SLOTS = ['auto', '1', '2', '3'];
/** Summary for a slot, or null if empty: { chapter, chapterTitle, map, playtime, date }. */
export function saveSummary(slot) {
  try {
    const g = HW.game;
    if (g?.saveSummary) { const s = g.saveSummary(slot); if (s !== undefined) return normalizeSummary(s); }
    if (typeof g?.saves === 'function') {
      const row = g.saves().find((r) => String(r.slot) === String(slot));
      if (row) return normalizeSummary(row.summary);
    }
    const raw = typeof localStorage !== 'undefined' ? localStorage.getItem(`hallowell.save.${slot}`) : null;
    if (!raw) return null;
    const data = JSON.parse(raw);
    return normalizeSummary(data.summary || data, data);
  } catch (e) { warnOnce('saveSummary', e); return null; }
}
function normalizeSummary(s, data) {
  if (!s) return null;
  const st = data?.state || data || {};
  const chapter = s.chapter ?? st.chapter ?? 0;
  return {
    chapter,
    chapterTitle: s.chapterTitle || (typeof s.chapter === 'string' ? s.chapter : null) || s.title || chapterTitle(chapter),
    map: [s.mapName || s.map || st.map || '', s.room].filter(Boolean).join(' · '),
    playtime: s.playtime ?? st.playtime ?? 0,
    date: s.date || s.savedAt || s.time || data?.date || null,
  };
}
export function anySave() { return SLOTS.some((s) => saveSummary(s)); }
/** Most recently written slot (for Continue). */
export function latestSave() {
  let best = null, bestT = -Infinity;
  for (const s of SLOTS) {
    const sum = saveSummary(s);
    if (!sum) continue;
    const t = sum.date ? new Date(sum.date).getTime() || 0 : 0;
    if (t > bestT || best === null) { best = s; bestT = t; }
  }
  return best;
}
export const canSave = () => { try { return !!HW.game?.canSave?.(); } catch { return false; } };
/** Write a slot via the engine (TECH names it saveTo; engine/game.js calls it save). */
export async function saveTo(slot) {
  try {
    const g = HW.game;
    if (g?.saveTo) return (await g.saveTo(slot)) !== false;
    if (g?.save) return (await g.save(slot)) !== false;
  } catch (e) { warnOnce('saveTo', e); }
  return false;
}
export async function loadSave(slot) {
  try { if (HW.game?.loadSave) return (await HW.game.loadSave(slot)) !== false; } catch (e) { warnOnce('loadSave', e); }
  return false;
}

export function fmtTime(sec) {
  sec = Math.max(0, Math.floor(sec || 0));
  const h = Math.floor(sec / 3600), m = Math.floor((sec % 3600) / 60), s = sec % 60;
  return h ? `${h}:${String(m).padStart(2, '0')}:${String(s).padStart(2, '0')}` : `${m}:${String(s).padStart(2, '0')}`;
}
export function fmtDate(d) {
  if (!d) return '';
  const t = new Date(d);
  if (isNaN(t)) return String(d);
  const p = (n) => String(n).padStart(2, '0');
  return `${p(t.getMonth() + 1)}/${p(t.getDate())}/${String(t.getFullYear()).slice(2)} ${p(t.getHours())}:${p(t.getMinutes())}`;
}

// ---- world → UI ---------------------------------------------------------------------------------
const _pt = { x: 0, y: 0 };
/** World px → UI px (the UI buffer is 2× the world buffer). Returns null without a camera. */
export function worldToUI(wx, wy) {
  const c = HW.camera;
  if (!c) return null;
  if (typeof c.toUI === 'function') return c.toUI(wx, wy, _pt);
  const v = c.view || c;
  const cx = v.x ?? 0, cy = v.y ?? 0;
  return { x: Math.round((wx - Math.round(cx)) * 2), y: Math.round((wy - Math.round(cy)) * 2) };
}

/** Item description (ITEMS desc may be a function(state)). */
export function itemDesc(id) {
  const it = items()[id];
  if (!it) return '';
  try { return typeof it.desc === 'function' ? it.desc(state()) : it.desc || ''; } catch { return ''; }
}

// ---- misc ----------------------------------------------------------------------------------------
const warned = new Set();
export function warnOnce(key, err) {
  if (warned.has(key)) return;
  warned.add(key);
  console.warn(`[ui] ${key}:`, err?.message || err);
}
