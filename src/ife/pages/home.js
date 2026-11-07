// HOME: greeting, featured title, live map card and the main category tiles.
import { C, text, fillRR, rr, cover, ease, clamp01, withShadow, fmtHM } from '../ui/kit.js';
import { icon } from '../ui/icons.js';

export function homePage() {
  return {
    id: 'home',
    _t0: 0,
    onEnter() { this._t0 = this.ui.now; },
    fps(ui) { return ui.now - this._t0 < 0.8 ? 30 : 2; },
    draw(ui, ctx, x, y, w, h) {
      const host = ui.host, st = host.app.flight?.state;
      const d = host.data();
      const appear = (k) => ease.outCubic(clamp01((ui.now - this._t0 - k * 0.05) / 0.45));
      const pad = 34;
      // greeting
      const hour = st?.localTimeOrigin ?? 16.5;
      const greet = hour < 12 ? 'Good morning' : hour < 18 ? 'Good afternoon' : 'Good evening';
      text(ctx, greet, x + pad, y + 54, { size: 34, weight: 700 });
      text(ctx, `Welcome aboard flight HN 482 to ${st?.destination?.city || 'Port Solano'}  ·  Seat ${host.seatId || ''}`, x + pad, y + 86, { size: 19, color: C.muted });
      // status chip
      const chip = d.phaseLabel;
      ctx.font = '600 17px sans-serif';
      const cw = Math.max(150, ctx.measureText(chip).width + 54);
      fillRR(ctx, x + w - pad - cw, y + 34, cw, 38, 19, 'rgba(31,159,178,0.22)');
      ctx.beginPath(); ctx.arc(x + w - pad - cw + 22, y + 53, 6, 0, 7); ctx.fillStyle = C.teal; ctx.fill();
      text(ctx, chip, x + w - pad - cw + 36, y + 59, { size: 17, weight: 600 });

      const top = y + 112;
      const tileH = Math.round((h - 112) * 0.36);
      const heroH = h - 112 - tileH - 24 - 30;
      // featured
      const feat = host.catalog.movies.find((m) => m.featured) || host.catalog.movies[0];
      const hw = Math.round(w * 0.6);
      const a0 = appear(0);
      ctx.save();
      ctx.globalAlpha *= a0;
      ctx.translate(0, (1 - a0) * 16);
      const fh = ui.hit('home:feature', x + pad, top, hw - pad, heroH, { onClick: () => feat && ui.push('detail', { id: feat.id }), radius: 18 });
      withShadow(ctx, 24, 'rgba(0,0,0,0.5)', () => fillRR(ctx, x + pad, top, hw - pad, heroH, 18, '#0d2440'));
      ctx.save();
      rr(ctx, x + pad, top, hw - pad, heroH, 18); ctx.clip();
      if (feat?.backdropImg) cover(ctx, feat.backdropImg, x + pad, top, hw - pad, heroH, 0.5, 0.4);
      const g = ctx.createLinearGradient(x + pad, 0, x + hw, 0);
      g.addColorStop(0, 'rgba(4,12,24,0.92)'); g.addColorStop(0.55, 'rgba(4,12,24,0.35)'); g.addColorStop(1, 'rgba(4,12,24,0)');
      ctx.fillStyle = g; ctx.fillRect(x + pad, top, hw - pad, heroH);
      if (fh.hover) { ctx.fillStyle = 'rgba(255,255,255,0.05)'; ctx.fillRect(x + pad, top, hw - pad, heroH); }
      ctx.restore();
      if (feat) {
        text(ctx, 'FEATURED FILM', x + pad + 30, top + 44, { size: 15, weight: 700, color: C.gold, spacing: 2 });
        text(ctx, feat.title, x + pad + 30, top + 96, { size: 46, weight: 800 });
        text(ctx, `${feat.year}  ·  ${feat.genre}  ·  ${Math.round(feat.duration / 60)} min`, x + pad + 30, top + 130, { size: 18, color: C.muted });
        const by = top + heroH - 78;
        fillRR(ctx, x + pad + 30, by, 190, 52, 26, fh.hover ? '#f0c063' : C.gold);
        icon(ctx, 'play', x + pad + 50, by + 14, 24, '#1a1407');
        text(ctx, 'Watch now', x + pad + 84, by + 34, { size: 20, weight: 700, color: '#1a1407' });
      }
      ctx.restore();

      // live map card
      const mx = x + hw + 20, mw = w - hw - 20 - pad;
      const a1 = appear(1);
      ctx.save();
      ctx.globalAlpha *= a1;
      ctx.translate(0, (1 - a1) * 16);
      const mh = ui.hit('home:map', mx, top, mw, heroH, { onClick: () => ui.push('map'), radius: 18 });
      withShadow(ctx, 24, 'rgba(0,0,0,0.5)', () => fillRR(ctx, mx, top, mw, heroH, 18, '#0d2440'));
      ctx.save();
      rr(ctx, mx, top, mw, heroH, 18); ctx.clip();
      host.map.draw(ctx, mx, top, mw, heroH, { view: 'overview', st, units: d.units, mini: true });
      const g2 = ctx.createLinearGradient(0, top + heroH * 0.45, 0, top + heroH);
      g2.addColorStop(0, 'rgba(4,12,24,0)'); g2.addColorStop(1, 'rgba(4,12,24,0.95)');
      ctx.fillStyle = g2; ctx.fillRect(mx, top, mw, heroH);
      if (mh.hover) { ctx.fillStyle = 'rgba(255,255,255,0.05)'; ctx.fillRect(mx, top, mw, heroH); }
      ctx.restore();
      text(ctx, 'Flight map', mx + 24, top + heroH - 54, { size: 26, weight: 700 });
      text(ctx, st?.onGround && (st?.routeProgress ?? 0) < 0.01 ? `${d.distance} to ${st?.destination?.city || 'Port Solano'}` : `${fmtHM(st?.timeToGoSec)} to ${st?.destination?.city || 'Port Solano'}`, mx + 24, top + heroH - 24, { size: 18, color: C.muted });
      fillRR(ctx, mx + mw - 92, top + 18, 74, 30, 15, 'rgba(228,87,75,0.92)');
      ctx.beginPath(); ctx.arc(mx + mw - 76, top + 33, 5, 0, 7); ctx.fillStyle = '#fff'; ctx.globalAlpha *= 0.6 + 0.4 * Math.sin(ui.now * 4) ** 2; ctx.fill();
      ctx.globalAlpha = a1;
      text(ctx, 'LIVE', mx + mw - 66, top + 39, { size: 15, weight: 800, spacing: 1 });
      ctx.restore();

      // category tiles
      const tiles = [
        { id: 'movies', label: 'Movies', sub: `${host.catalog.movies.length} films`, ic: 'movie', go: () => ui.push('movies') },
        { id: 'tv', label: 'TV', sub: `${host.catalog.series.length} series`, ic: 'tv', go: () => ui.push('tv') },
        { id: 'music', label: 'Music', sub: `${host.music.albums.length} albums`, ic: 'music', go: () => ui.push('music') },
        { id: 'info', label: 'Flight info', sub: d.altitude, ic: 'info', go: () => ui.push('info') },
        { id: 'games', label: 'Games', sub: 'Puzzle', ic: 'games', go: () => ui.push('games') },
        { id: 'settings', label: 'Settings', sub: 'Screen & sound', ic: 'settings', go: () => ui.push('settings') },
      ];
      const ty = top + heroH + 24;
      const gap = 18;
      const tw = (w - 2 * pad - gap * (tiles.length - 1)) / tiles.length;
      tiles.forEach((t, i) => {
        const tx = x + pad + i * (tw + gap);
        const a = appear(2 + i);
        ctx.save();
        ctx.globalAlpha *= a;
        ctx.translate(0, (1 - a) * 18);
        const s = ui.hit(`home:${t.id}`, tx, ty, tw, tileH, { onClick: t.go, radius: 18 });
        const lift = s.hover ? -3 : 0;
        const g3 = ctx.createLinearGradient(0, ty, 0, ty + tileH);
        g3.addColorStop(0, s.hover ? 'rgba(42,110,150,0.85)' : 'rgba(26,64,98,0.85)');
        g3.addColorStop(1, s.hover ? 'rgba(20,60,92,0.9)' : 'rgba(12,36,60,0.9)');
        withShadow(ctx, s.hover ? 22 : 12, 'rgba(0,0,0,0.45)', () => fillRR(ctx, tx, ty + lift, tw, tileH, 18, g3));
        rr(ctx, tx + 0.5, ty + lift + 0.5, tw - 1, tileH - 1, 18); ctx.strokeStyle = s.hover ? 'rgba(232,176,75,0.6)' : 'rgba(255,255,255,0.1)'; ctx.lineWidth = s.hover ? 2 : 1; ctx.stroke();
        const isz = Math.min(64, tileH * 0.36);
        icon(ctx, t.ic, tx + 26, ty + lift + 26, isz, s.hover ? C.gold : C.text);
        text(ctx, t.label, tx + 26, ty + lift + tileH - 52, { size: 24, weight: 700, maxWidth: tw - 40 });
        text(ctx, t.sub, tx + 26, ty + lift + tileH - 24, { size: 16, color: C.muted, maxWidth: tw - 40 });
        ctx.restore();
      });
    },
  };
}
