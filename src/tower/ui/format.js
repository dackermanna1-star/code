// LAST LOOKOUT — pure formatting helpers for the HUD, shop and screens (no DOM).

import { ENEMIES } from '../catalog.js';

const isNum = (x) => typeof x === 'number' && Number.isFinite(x);

/** 1234 -> '1,234' (integers; negative keeps its sign). */
export function groupThousands(n) {
  if (!isNum(n)) return '0';
  const s = String(Math.round(Math.abs(n)));
  let out = '';
  for (let i = 0; i < s.length; i++) {
    if (i && (s.length - i) % 3 === 0) out += ',';
    out += s[i];
  }
  return (n < 0 && Math.round(Math.abs(n)) !== 0 ? '-' : '') + out;
}

/** 1234 -> '$1,234'; -50 -> '-$50'. */
export function formatCash(n) {
  if (!isNum(n)) return '$0';
  return (n < 0 ? '-$' : '$') + groupThousands(Math.abs(n));
}

/** Signed cash delta for popups: '+$20' / '-$300'. */
export function formatCashDelta(n) {
  if (!isNum(n) || n === 0) return '';
  return (n > 0 ? '+$' : '-$') + groupThousands(Math.abs(n));
}

/** 5 -> '05' (width w, zero padded). */
export function pad(n, w = 2) {
  const s = String(Math.max(0, Math.floor(isNum(n) ? n : 0)));
  return s.length >= w ? s : '0'.repeat(w - s.length) + s;
}

/** Rangefinder text: 238.4 -> '238 m', null -> '---'. */
export function formatRange(m) {
  if (!isNum(m) || m < 0) return '---';
  if (m >= 9999) return '>9999 m';
  return `${Math.round(m)} m`;
}

/** 3.24 -> '3.2 m/s'. */
export function formatSpeed(v) {
  return `${isNum(v) ? Math.max(0, v).toFixed(1) : '0.0'} m/s`;
}

/** Scope magnification: 10 -> '10.0×', 4.5 -> '4.5×'. */
export function formatZoom(z) {
  return `${isNum(z) && z > 0 ? z.toFixed(1) : '1.0'}×`;
}

/** Seconds -> 'm:ss' (rounded up, so a countdown never shows 0:00 while still running). */
export function formatClock(s) {
  const t = isNum(s) ? Math.max(0, Math.ceil(s)) : 0;
  return `${Math.floor(t / 60)}:${pad(t % 60)}`;
}

/** Accuracy as a whole percentage: (hits, shots) -> '63%'; no shots -> '—'. */
export function formatAccuracy(hits, shots) {
  if (!isNum(shots) || shots <= 0) return '—';
  return `${Math.round(100 * Math.min(1, Math.max(0, (isNum(hits) ? hits : 0) / shots)))}%`;
}

/** A ratio 0..1 as a percentage string: 0.734 -> '73%'. */
export function formatPercent(f) {
  return `${Math.round(100 * Math.min(1, Math.max(0, isNum(f) ? f : 0)))}%`;
}

/** Clamp to 0..1 (non-numbers -> 0). */
export function frac(x) {
  return isNum(x) ? (x < 0 ? 0 : x > 1 ? 1 : x) : 0;
}

/** hp / max as 0..1, safe against max 0 and missing objects. */
export function ratio(o) {
  if (!o || !isNum(o.hp) || !isNum(o.max) || o.max <= 0) return 0;
  return frac(o.hp / o.max);
}

const NUMBER_WORDS = ['', '', 'TWO', 'THREE', 'FOUR', 'FIVE'];

/** Display name of an enemy kind ('brute' -> 'BRUTE'); unknown strings are upper-cased. */
export function enemyName(kind) {
  if (!kind) return '';
  const e = ENEMIES[kind] || ENEMIES[String(kind).toLowerCase()];
  return (e ? e.name : String(kind)).toUpperCase();
}

/**
 * Boss line for a wave banner. boss: a kind ('brute'), a list of kinds, a display name, true or
 * a falsy value. ['juggernaut', 'brute', 'brute'] -> 'THE JUGGERNAUT & TWO BRUTES'.
 */
export function bossTitle(boss) {
  if (!boss) return '';
  if (boss === true) return 'BOSS INBOUND';
  const list = Array.isArray(boss) ? boss : [boss];
  if (!list.length) return '';
  const counts = new Map();
  for (const k of list) {
    const key = typeof k === 'object' && k ? k.kind || k.name : k;
    counts.set(key, (counts.get(key) || 0) + 1);
  }
  const parts = [];
  for (const [k, n] of counts) {
    const name = enemyName(k);
    parts.push(n === 1 ? `THE ${name}` : `${NUMBER_WORDS[n] || n} ${name.endsWith('S') ? name : name + 'S'}`);
  }
  if (parts.length === 1) return parts[0];
  return parts.slice(0, -1).join(', ') + ' & ' + parts[parts.length - 1];
}

/** Subtitle of an ordinary wave from the time of day (0 dusk .. 1 night). */
export function nightLine(timeOfDay) {
  const t = frac(timeOfDay);
  if (t < 0.12) return 'DUSK';
  if (t < 0.35) return 'LAST LIGHT';
  if (t < 0.6) return 'NIGHTFALL';
  if (t < 0.85) return 'DARK';
  return 'DEAD OF NIGHT';
}

/** { title: 'WAVE 05', sub: 'THE BRUTE' | 'NIGHTFALL', boss: bool } for the wave intro banner. */
export function waveTitle(n, boss, timeOfDay = 0) {
  const sub = bossTitle(boss);
  return { title: `WAVE ${pad(n)}`, sub: sub || nightLine(timeOfDay), boss: !!sub };
}

/** Upper-case + trim to `max` characters with an ellipsis. */
export function clip(s, max) {
  const t = String(s ?? '');
  return t.length > max ? t.slice(0, Math.max(0, max - 1)) + '…' : t;
}

/** Splits text into lines of at most `width` characters at spaces (monospace layouts). */
export function wrap(text, width) {
  const words = String(text ?? '').split(/\s+/).filter(Boolean);
  const lines = [];
  let line = '';
  for (const w of words) {
    if (!line) line = w;
    else if (line.length + 1 + w.length <= width) line += ' ' + w;
    else {
      lines.push(line);
      line = w;
    }
  }
  if (line) lines.push(line);
  return lines;
}

/** Smooth exponential approach of `cur` toward `target` (rate per second). */
export function approach(cur, target, rate, dt) {
  return target + (cur - target) * Math.exp(-rate * dt);
}

/** Game-over title by how the run ended. */
export function gameOverTitle(stats) {
  if (stats && stats.mode === 'holdout') return 'THE DEAD HAVE YOU';
  const goal = stats && stats.goal;
  if (stats && stats.wave >= (goal || Infinity)) return 'THE NIGHT IS OVER';
  return stats && stats.cause === 'gate' ? 'THE GATE HAS FALLEN' : 'THE LOOKOUT HAS FALLEN';
}
