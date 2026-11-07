// MUSIC: album shelf + album page with track list and a now-playing panel.
import { C, text, fillRR, rr, ease, clamp01, withShadow, fmtDuration, bar } from '../ui/kit.js';
import { icon } from '../ui/icons.js';
import { albumArt } from '../media/music.js';

export function musicPage() {
  return {
    id: 'music',
    _t0: 0,
    onEnter(params) { this._t0 = this.ui.now; if (params?.album !== undefined) this.sel = params.album; },
    sel: null,
    fps(ui) { return ui.now - this._t0 < 0.8 ? 30 : (ui.host.music.playing ? 8 : 0); },
    draw(ui, ctx, x, y, w, h) {
      const m = ui.host.music;
      const pad = 34;
      if (this.sel === null) return this._shelf(ui, ctx, x, y, w, h, m, pad);
      return this._album(ui, ctx, x, y, w, h, m, pad);
    },
    _shelf(ui, ctx, x, y, w, h, m, pad) {
      text(ctx, 'Music', x + pad, y + 58, { size: 38, weight: 800 });
      text(ctx, 'Original albums, generated live on board  ·  Headphones recommended', x + pad, y + 90, { size: 18, color: C.muted });
      const n = m.albums.length, gap = 30;
      const aw = Math.min(250, (w - 2 * pad - gap * (n - 1)) / n);
      const ay = y + 140;
      m.albums.forEach((al, i) => {
        const ax = x + pad + i * (aw + gap);
        const a = ease.outBack(clamp01((ui.now - this._t0 - i * 0.07) / 0.5));
        ctx.save();
        ctx.globalAlpha *= clamp01(a);
        ctx.translate(ax + aw / 2, ay + aw / 2); ctx.scale(0.9 + 0.1 * a, 0.9 + 0.1 * a); ctx.translate(-(ax + aw / 2), -(ay + aw / 2));
        const s = ui.hit(`album:${i}`, ax, ay, aw, aw + 80, { onClick: () => { this.sel = i; this._t0 = ui.now; ui.dirty = true; }, radius: 12 });
        withShadow(ctx, s.hover ? 34 : 18, 'rgba(0,0,0,0.6)', () => ctx.drawImage(albumArt(i, 256), ax, ay - (s.hover ? 6 : 0), aw, aw), 10);
        if (m.active && m.albumIndex === i) {
          fillRR(ctx, ax + aw - 58, ay + 12, 46, 34, 17, 'rgba(0,0,0,0.6)');
          for (let k = 0; k < 4; k++) { const hh = m.playing ? 6 + 12 * Math.abs(Math.sin(ui.now * (3 + k) + k)) : 6; ctx.fillStyle = C.gold; ctx.fillRect(ax + aw - 47 + k * 7, ay + 38 - hh, 4, hh); }
        }
        text(ctx, al.title, ax, ay + aw + 34, { size: 21, weight: 700, maxWidth: aw });
        text(ctx, al.artist, ax, ay + aw + 60, { size: 16, color: C.muted, maxWidth: aw });
        ctx.restore();
      });
    },
    _album(ui, ctx, x, y, w, h, m, pad) {
      const i = this.sel, al = m.albums[i];
      const appear = ease.outCubic(clamp01((ui.now - this._t0) / 0.45));
      ctx.save();
      ctx.globalAlpha *= appear;
      ui.button('music:back', x + pad - 8, y + 22, 120, 46, 'Albums', { icon: 'back', onClick: () => { this.sel = null; this._t0 = ui.now; }, size: 19 });
      const as = Math.min(300, h - 200);
      const ay = y + 92;
      withShadow(ctx, 30, 'rgba(0,0,0,0.6)', () => ctx.drawImage(albumArt(i, 512), x + pad, ay, as, as), 10);
      const playingThis = m.active && m.albumIndex === i;
      text(ctx, al.title, x + pad, ay + as + 44, { size: 30, weight: 800, maxWidth: as + 40 });
      text(ctx, `${al.artist}`, x + pad, ay + as + 72, { size: 17, color: C.muted, maxWidth: as + 40 });
      text(ctx, `${al.genre}  ·  ${al.year}`, x + pad, ay + as + 96, { size: 15, color: C.faint, maxWidth: as + 40 });
      // track list
      const lx = x + pad + as + 48, lw = w - (lx - x) - pad;
      text(ctx, 'TRACKS', lx, ay + 6, { size: 15, weight: 700, color: C.gold, spacing: 2 });
      const rh = 64;
      al.tracks.forEach((tr, k) => {
        const ry = ay + 22 + k * (rh + 8);
        const cur = playingThis && m.trackIndex === k;
        const s = ui.hit(`track:${k}`, lx, ry, lw, rh, { onClick: () => { if (cur) m.toggle(); else m.play(i, k); }, radius: 12 });
        fillRR(ctx, lx, ry, lw, rh, 12, cur ? 'rgba(31,159,178,0.28)' : s.hover ? 'rgba(255,255,255,0.12)' : 'rgba(255,255,255,0.05)');
        if (cur && m.playing) {
          for (let b = 0; b < 4; b++) { const hh = 6 + 14 * Math.abs(Math.sin(ui.now * (3 + b) + b)); ctx.fillStyle = C.gold; ctx.fillRect(lx + 22 + b * 7, ry + rh / 2 + 10 - hh, 4, hh); }
        } else text(ctx, String(k + 1), lx + 34, ry + 40, { size: 20, weight: 600, color: C.muted, align: 'center' });
        text(ctx, tr.title, lx + 70, ry + 40, { size: 21, weight: cur ? 700 : 500, maxWidth: lw - 200, color: cur ? '#fff' : C.text });
        text(ctx, fmtDuration(tr.dur), lx + lw - 24, ry + 40, { size: 18, color: C.muted, align: 'right' });
      });
      // now playing panel
      const py = ay + 22 + al.tracks.length * (rh + 8) + 16;
      const ph = Math.min(140, y + h - py - 20);
      if (ph > 90) {
        fillRR(ctx, lx, py, lw, ph, 16, 'rgba(8,22,40,0.8)');
        const tr = playingThis ? m.current : al.tracks[0];
        text(ctx, playingThis ? (m.playing ? 'NOW PLAYING' : 'PAUSED') : 'READY TO PLAY', lx + 24, py + 32, { size: 13, weight: 700, color: C.gold, spacing: 2 });
        text(ctx, tr.title, lx + 24, py + 62, { size: 22, weight: 700, maxWidth: lw - 300 });
        const p = playingThis ? m.position / m.duration : 0;
        bar(ctx, lx + 24, py + ph - 36, lw - 48 - 260, 6, p, { fg: C.teal });
        text(ctx, `${fmtDuration(playingThis ? m.position : 0)} / ${fmtDuration(tr.dur)}`, lx + 24, py + ph - 48, { size: 15, color: C.muted });
        const bx = lx + lw - 250;
        ui.button('np:prev', bx, py + ph / 2 - 28, 56, 56, null, { icon: 'prev', kind: 'icon', onClick: () => (playingThis ? m.prev() : m.play(i, 0)) });
        ui.button('np:pp', bx + 70, py + ph / 2 - 36, 72, 72, null, { icon: playingThis && m.playing ? 'pause' : 'play', kind: 'primary', onClick: () => (playingThis ? m.toggle() : m.play(i, 0)) });
        ui.button('np:next', bx + 156, py + ph / 2 - 28, 56, 56, null, { icon: 'next', kind: 'icon', onClick: () => (playingThis ? m.next() : m.play(i, 1)) });
      }
      ctx.restore();
      void rr;
      void icon;
    },
  };
}
