// =============================================================================
// Content catalogue (assets/ife/catalog.json): movies + TV series (Blender
// Foundation open movies, CC BY). Loads still frames and builds portrait
// posters / thumbnails procedurally (title typography over a cropped still).
// =============================================================================
import { cover, font, rng } from '../ui/kit.js';

function loadImage(src) {
  return new Promise((resolve) => {
    const im = new Image();
    im.onload = () => resolve(im);
    im.onerror = () => resolve(null);
    im.src = src;
  });
}

export class Catalog {
  constructor(app, base = 'assets/ife') {
    this.app = app;
    this.base = base;
    this.movies = [];
    this.series = [];
    this.images = new Map();
    this._posters = new Map();
    this.ready = this._load();
  }

  async _load() {
    let data = null;
    try { data = await (this.app?.assets?.json ? this.app.assets.json(`${this.base}/catalog.json`) : fetch(`${this.base}/catalog.json`).then((r) => r.json())); } catch { data = null; }
    if (!data) { console.warn('[ife] catalog missing'); return; }
    this.movies = data.movies || [];
    this.series = data.series || [];
    const all = [...this.movies];
    for (const s of this.series) { all.push(s); for (const e of s.episodes) { e.series = s; all.push(e); } }
    await Promise.all(all.map(async (it) => {
      if (it.still) it.stillImg = await loadImage(it.still);
      if (it.backdrop) it.backdropImg = await loadImage(it.backdrop);
      if (!it.backdropImg) it.backdropImg = it.stillImg;
    }));
  }

  byId(id) {
    for (const m of this.movies) if (m.id === id) return m;
    for (const s of this.series) { if (s.id === id) return s; for (const e of s.episodes) if (e.id === id) return e; }
    return null;
  }

  /** Portrait 2:3 poster with title treatment, cached. */
  poster(item, w, h) {
    const key = `${item.id}:${w}x${h}`;
    let c = this._posters.get(key);
    if (c) return c;
    c = document.createElement('canvas');
    c.width = w; c.height = h;
    const x = c.getContext('2d');
    const r = rng(item.title.length * 31 + w);
    x.fillStyle = item.color || '#163252';
    x.fillRect(0, 0, w, h);
    const img = item.posterImg || item.stillImg;
    if (img) cover(x, img, 0, 0, w, h, item.posterFocus ?? 0.5, 0.5);
    // cinematic grade + vignette
    const g = x.createLinearGradient(0, 0, 0, h);
    g.addColorStop(0, 'rgba(0,0,0,0.25)');
    g.addColorStop(0.45, 'rgba(0,0,0,0)');
    g.addColorStop(0.7, 'rgba(0,0,0,0.35)');
    g.addColorStop(1, 'rgba(0,0,0,0.92)');
    x.fillStyle = g; x.fillRect(0, 0, w, h);
    const v = x.createRadialGradient(w / 2, h * 0.45, h * 0.2, w / 2, h * 0.45, h * 0.8);
    v.addColorStop(0, 'rgba(0,0,0,0)'); v.addColorStop(1, 'rgba(0,0,0,0.45)');
    x.fillStyle = v; x.fillRect(0, 0, w, h);
    // title
    const title = (item.posterTitle || item.title).toUpperCase();
    const words = title.split(' ');
    let size = w * 0.16;
    x.textAlign = 'center';
    x.textBaseline = 'alphabetic';
    x.font = font(size, 800);
    while (words.some((wd) => x.measureText(wd).width > w * 0.86) && size > 10) { size *= 0.92; x.font = font(size, 800); }
    const lines = [];
    let line = '';
    for (const wd of words) { const t = line ? `${line} ${wd}` : wd; if (x.measureText(t).width > w * 0.86 && line) { lines.push(line); line = wd; } else line = t; }
    if (line) lines.push(line);
    let y = h * 0.86 - (lines.length - 1) * size * 1.02;
    x.fillStyle = '#fff';
    x.shadowColor = 'rgba(0,0,0,0.6)'; x.shadowBlur = size * 0.3;
    if ('letterSpacing' in x) x.letterSpacing = `${size * 0.04}px`;
    for (const l of lines) { x.fillText(l, w / 2, y); y += size * 1.02; }
    x.shadowBlur = 0;
    if ('letterSpacing' in x) x.letterSpacing = `${w * 0.012}px`;
    const tag = (item.tagline || item.studio || 'BLENDER FOUNDATION').toUpperCase();
    let ts = w * 0.05;
    x.font = font(ts, 500);
    while (x.measureText(tag).width + tag.length * w * 0.012 > w * 0.9 && ts > 6) { ts *= 0.92; x.font = font(ts, 500); }
    x.fillStyle = 'rgba(255,255,255,0.75)';
    x.fillText(tag, w / 2, h * 0.95);
    if ('letterSpacing' in x) x.letterSpacing = '0px';
    // subtle film grain so it reads as a printed key-art
    for (let i = 0; i < (w * h) / 60; i++) { x.fillStyle = `rgba(255,255,255,${r() * 0.035})`; x.fillRect(r() * w, r() * h, 1, 1); }
    this._posters.set(key, c);
    return c;
  }
}
