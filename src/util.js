'use strict';
const clock = require('./clock');

function parseCookies(header) {
  const out = {};
  for (const part of header.split(';')) {
    const i = part.indexOf('=');
    if (i < 0) continue;
    const k = part.slice(0, i).trim();
    try { out[k] = decodeURIComponent(part.slice(i + 1).trim()); } catch { out[k] = part.slice(i + 1).trim(); }
  }
  return out;
}

function parseForm(body) {
  const out = {};
  for (const [k, v] of new URLSearchParams(body || '')) out[k] = v;
  return out;
}

/** HTML-escape. */
function h(s) {
  return String(s ?? '').replace(/[&<>"']/g, (c) => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' }[c]));
}

function commas(n) {
  return Math.round(Number(n) || 0).toString().replace(/\B(?=(\d{3})+(?!\d))/g, ',');
}

/** "4 hours ago", "1 day ago", "49 minutes ago" -- as on the 2008 Games page. */
function timeAgo(ms, now = clock.now()) {
  const s = Math.max(0, (now - ms) / 1000);
  const plural = (n, w) => `${n} ${w}${n === 1 ? '' : 's'} ago`;
  if (s < 60) return plural(Math.max(1, Math.floor(s)), 'second');
  if (s < 3600) return plural(Math.floor(s / 60), 'minute');
  if (s < 86400) return plural(Math.floor(s / 3600), 'hour');
  if (s < 86400 * 30) return plural(Math.floor(s / 86400), 'day');
  if (s < 86400 * 365) return plural(Math.floor(s / 86400 / 30), 'month');
  return plural(Math.floor(s / 86400 / 365), 'year');
}

/** 2008 sites printed dates like 6/14/2008 */
function shortDate(ms) {
  const d = new Date(ms);
  return `${d.getMonth() + 1}/${d.getDate()}/${d.getFullYear()}`;
}

function longDate(ms) {
  const d = new Date(ms);
  let hr = d.getHours();
  const ampm = hr >= 12 ? 'PM' : 'AM';
  hr = hr % 12 || 12;
  const mm = String(d.getMinutes()).padStart(2, '0');
  const ss = String(d.getSeconds()).padStart(2, '0');
  return `${shortDate(ms)} ${hr}:${mm}:${ss} ${ampm}`;
}

function clampInt(v, lo, hi, def) {
  const n = parseInt(v, 10);
  if (Number.isNaN(n)) return def;
  return Math.max(lo, Math.min(hi, n));
}

module.exports = { parseCookies, parseForm, h, commas, timeAgo, shortDate, longDate, clampInt };
