// Examine-text mini-format (TECH §5.3).
//
//   'text'                        Tess's inner voice, neutral
//   '[worried] text'              Tess's inner voice with that portrait expression
//   '[n] text'                    plain narration (no portrait)
//   '[danny:grin] text'           a spoken line by that character
//   [ 'a', 'b' ]                  shown in sequence
//   [ { cond, text }, ... ]       first entry whose cond(state) holds wins; text may be any of these
//   (state) => spec               computed at show time
//
// Dialogue markup ({p}, *emph*, {shake}…) is passed through untouched for the UI to render.
import { CHARS } from '../data/chars.js';

const TAG = /^\s*\[([a-z0-9_]+)(?::([a-z0-9_]+))?\]\s*/i;

/** Split one line into { kind: 'think'|'narrate'|'say', who, expr, text }. */
export function parseLine(line, { speaker = null } = {}) {
  const s = String(line);
  const m = s.match(TAG);
  if (!m) {
    if (speaker) return { kind: 'say', who: speaker, expr: 'neutral', text: s };
    return { kind: 'think', who: 'tess', expr: 'neutral', text: s };
  }
  const text = s.slice(m[0].length);
  const a = m[1].toLowerCase();
  const b = m[2] ? m[2].toLowerCase() : null;
  if (a === 'n' && !b) return { kind: 'narrate', who: null, expr: null, text };
  if (b) return { kind: 'say', who: a, expr: b, text };
  // [expr] for the default speaker (banter lines), or Tess thinking.
  if (speaker) return { kind: 'say', who: speaker, expr: a, text };
  if (CHARS.tess.expr.includes(a)) return { kind: 'think', who: 'tess', expr: a, text };
  if (CHARS[a] && a !== 'tess') return { kind: 'say', who: a, expr: 'neutral', text };
  return { kind: 'think', who: 'tess', expr: a, text };
}

/** Flatten an examine spec into a list of parsed lines for the given state. */
export function resolveExamine(spec, state, opts = {}) {
  const out = [];
  walk(spec, 0);
  return out;

  function walk(v, depth) {
    if (v === null || v === undefined || v === false || depth > 8) return;
    if (typeof v === 'function') { walk(safe(() => v(state)), depth + 1); return; }
    if (typeof v === 'string') { if (v.trim()) out.push(parseLine(v, opts)); return; }
    if (Array.isArray(v)) {
      if (v.length && v.every((e) => e && typeof e === 'object' && !Array.isArray(e) && 'text' in e)) {
        // Conditional list: first match wins.
        const hit = v.find((e) => !e.cond || safe(() => e.cond(state)));
        if (hit) walk(hit.text, depth + 1);
        return;
      }
      for (const e of v) walk(e, depth + 1);
      return;
    }
    if (typeof v === 'object' && 'text' in v) {
      if (!v.cond || safe(() => v.cond(state))) walk(v.text, depth + 1);
    }
  }
}

function safe(fn) {
  try {
    return fn();
  } catch (e) {
    console.error('[examine] condition/text function failed', e);
    return null;
  }
}
