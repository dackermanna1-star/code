// MOVIES / TV: poster walls, title detail page and series (episode list) page.
import { C, text, wrap, fillRR, rr, cover, ease, clamp01, clamp, withShadow, fmtDuration, blurred } from '../ui/kit.js';
import { icon } from '../ui/icons.js';

function header(ctx, x, y, title, sub) {
  text(ctx, title, x, y + 58, { size: 38, weight: 800 });
  if (sub) text(ctx, sub, x, y + 90, { size: 18, color: C.muted });
}

/** Horizontal poster wall shared by Movies and TV. */
function posterWall(id, title, sub, items, open) {
  return {
    id,
    _t0: 0,
    scroll: 0, target: 0,
    onEnter() { this._t0 = this.ui.now; },
    fps(ui) { return ui.now - this._t0 < 0.8 || Math.abs(this.scroll - this.target) > 0.5 ? 30 : 0; },
    onWheel(d) { this.target += d * 140; },
    draw(ui, ctx, x, y, w, h) {
      const pad = 34;
      const list = items(ui.host);
      header(ctx, x + pad, y, title, sub(ui.host, list));
      const ph = Math.min(h - 210, 420), pw = Math.round(ph * 2 / 3);
      const gap = 28;
      const total = list.length * (pw + gap) - gap;
      const maxScroll = Math.max(0, total - (w - 2 * pad));
      this.target = clamp(this.target, 0, maxScroll);
      this.scroll += (this.target - this.scroll) * 0.3;
      let x0 = x + pad - this.scroll;
      if (total < w - 2 * pad) x0 = x + pad;
      const py = y + 124;
      ui.hit(`${id}:scroll`, x, py - 10, w, ph + 90, { onScroll: (dx) => { this.target += dx; this.scroll = this.target = clamp(this.target, 0, maxScroll); }, ripple: false });
      list.forEach((it, i) => {
        const px = x0 + i * (pw + gap);
        if (px > x + w || px + pw < x) return;
        const a = ease.outCubic(clamp01((ui.now - this._t0 - i * 0.06) / 0.5));
        ctx.save();
        ctx.globalAlpha *= a;
        ctx.translate(0, (1 - a) * 24);
        const s = ui.hit(`${id}:${it.id}`, px, py, pw, ph, { onClick: () => open(ui, it), radius: 14, onScroll: (dx) => { this.target += dx; this.scroll = this.target = clamp(this.target, 0, maxScroll); } });
        if (s.hover && this._spot !== it) { this._spot = it; ui.dirty = true; }
        const sc = s.hover ? 1.03 : 1;
        ctx.translate(px + pw / 2, py + ph / 2); ctx.scale(sc, sc); ctx.translate(-(px + pw / 2), -(py + ph / 2));
        withShadow(ctx, s.hover ? 30 : 16, 'rgba(0,0,0,0.6)', () => fillRR(ctx, px, py, pw, ph, 14, '#0d2440'), 8);
        ctx.save();
        rr(ctx, px, py, pw, ph, 14); ctx.clip();
        ctx.drawImage(ui.host.catalog.poster(it, pw, ph), px, py, pw, ph);
        ctx.restore();
        if (s.hover) { rr(ctx, px + 1, py + 1, pw - 2, ph - 2, 14); ctx.strokeStyle = C.gold; ctx.lineWidth = 3; ctx.stroke(); }
        const resume = ui.host.video.resume.get(it.id);
        if (resume && it.duration) { fillRR(ctx, px + 14, py + ph - 14, pw - 28, 5, 2.5, 'rgba(255,255,255,0.3)'); fillRR(ctx, px + 14, py + ph - 14, (pw - 28) * clamp01(resume / it.duration), 5, 2.5, C.gold); }
        ctx.restore();
        text(ctx, it.title, px, py + ph + 36, { size: 21, weight: 700, maxWidth: pw, alpha: a });
        const meta = it.episodes ? `${it.episodes.length} episodes · ${it.rating}` : `${it.year} · ${Math.round(it.duration / 60)} min · ${it.rating}`;
        text(ctx, meta, px, py + ph + 62, { size: 16, color: C.muted, maxWidth: pw, alpha: a });
      });
      if (!list.length) text(ctx, 'Loading content…', x + pad, y + 200, { size: 22, color: C.muted });
      // spotlight panel when the wall leaves room (hovered title, else the first)
      const free = w - pad - (x0 + total - x) - 40;
      if (list.length && free > 380) {
        const it = this._spot && list.includes(this._spot) ? this._spot : list[0];
        const sx = x + w - pad - free + 10, sw = free - 10, sh = ph + 70;
        withShadow(ctx, 24, 'rgba(0,0,0,0.45)', () => fillRR(ctx, sx, py, sw, sh, 18, 'rgba(8,22,40,0.92)'));
        ctx.save();
        rr(ctx, sx, py, sw, sh, 18); ctx.clip();
        const img = it.backdropImg || it.stillImg;
        if (img) {
          const ih = Math.round(Math.min(sw * 9 / 16, sh * 0.52));
          cover(ctx, img, sx, py, sw, ih, 0.5, 0.4);
          const g = ctx.createLinearGradient(0, py + ih * 0.45, 0, py + ih);
          g.addColorStop(0, 'rgba(8,22,40,0)'); g.addColorStop(1, 'rgba(8,22,40,1)');
          ctx.fillStyle = g; ctx.fillRect(sx, py, sw, ih + 1);
        }
        ctx.restore();
        const ty = py + Math.round(Math.min(sw * 9 / 16, sh * 0.52)) - 4;
        text(ctx, it.title, sx + 28, ty, { size: 34, weight: 800, maxWidth: sw - 56 });
        const meta = it.episodes ? `${it.year}  ·  ${it.episodes.length} episodes  ·  ${it.genre}` : `${it.year}  ·  ${fmtDuration(it.duration)}  ·  ${it.genre}`;
        text(ctx, meta, sx + 28, ty + 32, { size: 17, color: C.muted, maxWidth: sw - 56 });
        wrap(ctx, it.synopsis, sx + 28, ty + 70, sw - 56, 27, { size: 18, color: 'rgba(243,241,234,0.85)', maxLines: Math.max(1, Math.floor((py + sh - 90 - (ty + 70)) / 27)) });
        ui.button(`${id}:spot:open`, sx + 28, py + sh - 76, 200, 52, it.episodes ? 'Episodes' : 'Details', { icon: it.episodes ? 'list' : 'info', kind: 'primary', onClick: () => open(ui, it), size: 19 });
      }
    },
  };
}

export function moviesPage() {
  return posterWall('movies', 'Movies', (host, list) => `${list.length} films  ·  Open movies from the Blender Foundation`, (host) => host.catalog.movies, (ui, it) => ui.push('detail', { id: it.id }));
}
export function tvPage() {
  return posterWall('tv', 'TV', () => 'Series & short films', (host) => host.catalog.series, (ui, it) => ui.push('series', { id: it.id }));
}

const _fadeCache = new Map();
/** Backdrop image with soft alpha fades on the left and bottom (cached per size). */
function fadedBackdrop(it, w, h) {
  const img = it?.backdropImg || it?.stillImg;
  if (!img) return null;
  const key = `${it.id}:${w}x${h}`;
  let c = _fadeCache.get(key);
  if (c) return c;
  c = document.createElement('canvas');
  c.width = w; c.height = h;
  const x = c.getContext('2d');
  cover(x, img, 0, 0, w, h, 0.5, 0.35);
  x.globalCompositeOperation = 'destination-in';
  const gx = x.createLinearGradient(0, 0, w * 0.55, 0);
  gx.addColorStop(0, 'rgba(0,0,0,0)'); gx.addColorStop(1, 'rgba(0,0,0,1)');
  x.fillStyle = gx; x.fillRect(0, 0, w, h);
  const gy = x.createLinearGradient(0, h * 0.45, 0, h);
  gy.addColorStop(0, 'rgba(0,0,0,1)'); gy.addColorStop(1, 'rgba(0,0,0,0)');
  x.fillStyle = gy; x.fillRect(0, 0, w, h);
  _fadeCache.set(key, c);
  return c;
}

function backdropLayer(ui, ctx, x, y, w, h, it, alpha = 0.85) {
  const img = it?.backdropImg || it?.stillImg;
  if (!img) return;
  if (!it._blur) it._blur = blurred(img, 64, 36, 3);
  ctx.save();
  ctx.globalAlpha *= 0.22;
  cover(ctx, it._blur, x, y, w, h);
  ctx.restore();
  const bw = Math.round(w * 0.66), bh = Math.round(h * 0.8);
  const f = fadedBackdrop(it, bw, bh);
  ctx.save();
  ctx.globalAlpha *= alpha;
  if (f) ctx.drawImage(f, x + w - bw, y, bw, bh);
  ctx.restore();
}

function ratingBadge(ctx, x, y, r) {
  ctx.font = '700 15px sans-serif';
  const w = ctx.measureText(r).width + 18;
  rr(ctx, x, y - 19, w, 26, 5); ctx.strokeStyle = 'rgba(255,255,255,0.6)'; ctx.lineWidth = 1.5; ctx.stroke();
  text(ctx, r, x + 9, y, { size: 15, weight: 700 });
  return w;
}

export function detailPage() {
  return {
    id: 'detail',
    _t0: 0,
    onEnter() { this._t0 = this.ui.now; },
    fps(ui) { return ui.now - this._t0 < 0.7 ? 30 : 0; },
    draw(ui, ctx, x, y, w, h, params) {
      const host = ui.host;
      const it = host.catalog.byId(params.id);
      if (!it) return;
      backdropLayer(ui, ctx, x, y, w, h, it);
      const pad = 48;
      const a = ease.outCubic(clamp01((ui.now - this._t0) / 0.5));
      ctx.save();
      ctx.globalAlpha *= a;
      ctx.translate((1 - a) * -20, 0);
      ui.button('detail:back', x + pad - 8, y + 22, 112, 46, 'Back', { icon: 'back', onClick: () => ui.pop(), size: 19 });
      const ph = Math.min(330, h * 0.5), pw = Math.round(ph * 2 / 3);
      const py = y + 92;
      withShadow(ctx, 30, 'rgba(0,0,0,0.7)', () => ctx.drawImage(host.catalog.poster(it, pw, ph), x + pad, py, pw, ph), 10);
      const tx = x + pad + pw + 40;
      const tw = w - (tx - x) - pad;
      text(ctx, it.title, tx, py + 50, { size: 48, weight: 800, maxWidth: tw });
      let mx = tx;
      const rw = ratingBadge(ctx, mx, py + 90, it.rating);
      mx += rw + 14;
      text(ctx, `${it.year}   ·   ${fmtDuration(it.duration)}   ·   ${it.genre}`, mx, py + 90, { size: 18, color: C.muted });
      let yy = wrap(ctx, it.synopsis, tx, py + 132, Math.min(tw, 600), 29, { size: 19, color: 'rgba(243,241,234,0.88)', maxLines: 4 });
      yy += 4;
      const people = [it.director ? `Director: ${it.director}` : '', it.cast ? `Voices: ${it.cast}` : ''].filter(Boolean).join('     ');
      if (people) text(ctx, people, tx, yy, { size: 16, color: C.muted, maxWidth: tw });
      // actions
      const by = Math.max(py + ph - 56, yy + 24);
      const resume = host.video.resume.get(it.id);
      const play = () => { host.playVideo(it, { fromStart: false }); };
      ui.button('detail:play', tx, by, resume ? 230 : 190, 56, resume ? `Resume ${fmtDuration(resume)}` : 'Play', { icon: 'play', kind: 'primary', onClick: play, size: 21 });
      if (resume) ui.button('detail:restart', tx + 246, by, 190, 56, 'Start over', { icon: 'rew10', onClick: () => host.playVideo(it, { fromStart: true }), size: 19 });
      // credits / licence
      const cy = Math.max(py + ph, by + 56) + 46;
      ctx.fillStyle = 'rgba(255,255,255,0.08)';
      ctx.fillRect(x + pad, cy - 20, w - 2 * pad, 1);
      text(ctx, 'CREDITS & LICENCE', x + pad, cy + 6, { size: 14, weight: 700, color: C.gold, spacing: 1.5 });
      wrap(ctx, `${it.credits}  ${it.license}`, x + pad, cy + 34, w - 2 * pad, 24, { size: 16, color: C.faint, maxLines: 3 });
      ctx.restore();
    },
  };
}

export function seriesPage() {
  return {
    id: 'series',
    _t0: 0,
    onEnter() { this._t0 = this.ui.now; },
    fps(ui) { return ui.now - this._t0 < 0.9 ? 30 : 0; },
    draw(ui, ctx, x, y, w, h, params) {
      const host = ui.host;
      const s = host.catalog.byId(params.id);
      if (!s) return;
      backdropLayer(ui, ctx, x, y, w, h, s);
      const pad = 48;
      ui.button('series:back', x + pad - 8, y + 22, 112, 46, 'Back', { icon: 'back', onClick: () => ui.pop(), size: 19 });
      text(ctx, s.title, x + pad, y + 134, { size: 50, weight: 800 });
      let mx = x + pad;
      mx += ratingBadge(ctx, mx, y + 172, s.rating) + 14;
      text(ctx, `${s.year}  ·  Season 1  ·  ${s.episodes.length} episodes  ·  ${s.genre}`, mx, y + 172, { size: 18, color: C.muted });
      wrap(ctx, s.synopsis, x + pad, y + 214, Math.min(640, w * 0.55), 28, { size: 19, color: 'rgba(243,241,234,0.85)', maxLines: 3 });
      text(ctx, 'SEASON 1', x + pad, y + 330, { size: 15, weight: 700, color: C.gold, spacing: 2 });
      const ey = y + 348;
      const eh = Math.min(118, (h - 348 - 70) / Math.max(1, s.episodes.length) - 12);
      s.episodes.forEach((e, i) => {
        const a = ease.outCubic(clamp01((ui.now - this._t0 - i * 0.08) / 0.5));
        const ry = ey + i * (eh + 12);
        ctx.save();
        ctx.globalAlpha *= a;
        ctx.translate((1 - a) * 30, 0);
        const st = ui.hit(`ep:${e.id}`, x + pad, ry, w - 2 * pad, eh, { onClick: () => host.playVideo(e, {}), radius: 14 });
        fillRR(ctx, x + pad, ry, w - 2 * pad, eh, 14, st.hover ? 'rgba(255,255,255,0.14)' : 'rgba(8,22,40,0.72)');
        const thw = Math.round(eh * 16 / 9);
        ctx.save(); rr(ctx, x + pad + 10, ry + 10, thw - 20, eh - 20, 10); ctx.clip();
        if (e.stillImg) cover(ctx, e.stillImg, x + pad + 10, ry + 10, thw - 20, eh - 20);
        ctx.fillStyle = 'rgba(0,0,0,0.25)'; ctx.fillRect(x + pad + 10, ry + 10, thw, eh);
        ctx.restore();
        ctx.beginPath(); ctx.arc(x + pad + thw / 2, ry + eh / 2, 22, 0, 7); ctx.fillStyle = st.hover ? C.gold : 'rgba(0,0,0,0.55)'; ctx.fill();
        icon(ctx, 'play', x + pad + thw / 2 - 10, ry + eh / 2 - 11, 22, st.hover ? '#1a1407' : '#fff');
        const tx = x + pad + thw + 10;
        text(ctx, `${i + 1}. ${e.title}`, tx, ry + 40, { size: 22, weight: 700, maxWidth: w - tx - pad - 140 });
        text(ctx, fmtDuration(e.duration), x + w - pad - 24, ry + 40, { size: 18, color: C.muted, align: 'right' });
        wrap(ctx, e.synopsis, tx, ry + 70, w - tx - pad - 40, 24, { size: 16, color: C.muted, maxLines: Math.max(1, Math.floor((eh - 60) / 24)) });
        const res = host.video.resume.get(e.id);
        if (res) { fillRR(ctx, x + pad + 20, ry + eh - 22, thw - 40, 4, 2, 'rgba(255,255,255,0.3)'); fillRR(ctx, x + pad + 20, ry + eh - 22, (thw - 40) * clamp01(res / e.duration), 4, 2, C.gold); }
        ctx.restore();
      });
      text(ctx, s.license, x + pad, y + h - 22, { size: 14, color: C.faint, maxWidth: w - 2 * pad });
    },
  };
}
