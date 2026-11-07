// VIDEO PLAYER: full-screen playback with auto-hiding transport controls.
import { C, text, fillRR, contain, clamp01, fmtDuration, bar, withShadow } from '../ui/kit.js';
import { icon } from '../ui/icons.js';

export function playerPage() {
  const rect = {};
  return {
    id: 'player',
    _shown: 0,
    _scrub: null,
    fullscreen: () => true,
    onEnter() { this._shown = this.ui.now; },
    onLeave(removed) { if (removed) this.ui.host.video.pause(); },
    fps(ui) {
      const v = ui.host.video;
      return v.playing ? 24 : (this._controlsAlpha(ui) > 0.01 && this._controlsAlpha(ui) < 0.99 ? 30 : 4);
    },
    _controlsAlpha(ui) {
      const v = ui.host.video;
      if (!v.playing || this._scrub !== null || ui.popover) return 1;
      const idle = ui.now - Math.max(this._shown, ui.pointer.lastMove);
      return clamp01(1 - (idle - 3) / 0.5);
    },
    draw(ui, ctx, x, y, w, h) {
      const host = ui.host, v = host.video, it = v.item;
      ctx.fillStyle = '#000';
      ctx.fillRect(x, y, w, h);
      if (!it) { ui.pop(); return; }
      let drew = false;
      if (v.ready) drew = !!contain(ctx, v.el, x, y, w, h, rect);
      if (!drew) {
        const img = it.backdropImg || it.stillImg;
        if (img) { ctx.save(); ctx.globalAlpha = 0.35; contain(ctx, img, x, y, w, h, rect); ctx.restore(); }
        if (v.error) {
          text(ctx, v.error, x + w / 2, y + h / 2, { size: 24, weight: 600, align: 'center' });
          text(ctx, 'Please try another title or contact a crew member.', x + w / 2, y + h / 2 + 36, { size: 18, color: C.muted, align: 'center' });
        } else {
          // spinner
          ctx.save();
          ctx.translate(x + w / 2, y + h / 2);
          ctx.rotate(ui.now * 5);
          ctx.beginPath(); ctx.arc(0, 0, 30, 0, Math.PI * 1.4);
          ctx.strokeStyle = C.gold; ctx.lineWidth = 5; ctx.lineCap = 'round'; ctx.stroke();
          ctx.restore();
          text(ctx, 'Loading…', x + w / 2, y + h / 2 + 70, { size: 20, color: C.muted, align: 'center' });
        }
      }
      // whole surface toggles the controls / play-pause
      const a = this._controlsAlpha(ui);
      ui.hit('player:surface', x, y, w, h, {
        ripple: false,
        onClick: () => { if (a < 0.5) this._shown = ui.now; else v.toggle(); },
      });
      if (a <= 0.01) return;
      ctx.save();
      ctx.globalAlpha = a;
      const gt = ctx.createLinearGradient(0, y, 0, y + 130);
      gt.addColorStop(0, 'rgba(0,0,0,0.75)'); gt.addColorStop(1, 'rgba(0,0,0,0)');
      ctx.fillStyle = gt; ctx.fillRect(x, y, w, 130);
      const gb = ctx.createLinearGradient(0, y + h - 190, 0, y + h);
      gb.addColorStop(0, 'rgba(0,0,0,0)'); gb.addColorStop(1, 'rgba(0,0,0,0.85)');
      ctx.fillStyle = gb; ctx.fillRect(x, y + h - 190, w, 190);
      ui.button('player:back', x + 22, y + 18, 54, 54, null, { icon: 'back', kind: 'icon', onClick: () => ui.pop() });
      const series = it.series ? `${it.series.title}  ·  ` : '';
      text(ctx, `${series}${it.title}`, x + 92, y + 52, { size: 26, weight: 700, maxWidth: w - 340 });
      icon(ctx, 'headphones', x + w - 252, y + 30, 24, C.muted);
      text(ctx, 'Headphone audio', x + w - 220, y + 49, { size: 17, color: C.muted });
      if (host.focused) ui.button('player:exit', x + w - 76, y + 18, 54, 54, null, { icon: 'close', kind: 'icon', onClick: () => host.close() });
      // centre play button when paused
      if (!v.playing && !v.error) {
        const cx = x + w / 2, cy = y + h / 2;
        const s = ui.hit('player:bigplay', cx - 56, cy - 56, 112, 112, { onClick: () => v.play(), radius: 56 });
        withShadow(ctx, 20, 'rgba(0,0,0,0.5)', () => { ctx.beginPath(); ctx.arc(cx, cy, 56, 0, 7); ctx.fillStyle = s.hover ? '#f0c063' : 'rgba(232,176,75,0.95)'; ctx.fill(); });
        icon(ctx, 'play', cx - 24, cy - 26, 52, '#1a1407');
      }
      // transport
      const by = y + h - 64;
      const pos = this._scrub !== null ? this._scrub : v.position, dur = v.duration || it.duration || 1;
      const sx = x + 150, sw = w - 300;
      text(ctx, fmtDuration(pos), sx - 20, by - 50, { size: 19, weight: 600, align: 'right' });
      text(ctx, `-${fmtDuration(dur - pos)}`, sx + sw + 20, by - 50, { size: 19, weight: 600, color: C.muted });
      ui.hit('player:scrub', sx - 10, by - 80, sw + 20, 50, {
        ripple: false,
        onDrag: (px, py, phase) => {
          const t = clamp01((px - sx) / sw) * dur;
          if (phase === 'end') { v.seek(t); this._scrub = null; } else this._scrub = t;
          this._shown = ui.now;
        },
      });
      bar(ctx, sx, by - 62, sw, 7, pos / dur, { knob: true, fg: C.gold, buffered: v.buffered });
      const cx = x + w / 2;
      ui.button('player:rew', cx - 150, by - 26, 64, 64, null, { icon: 'rew10', kind: 'icon', onClick: () => { v.skip(-10); this._shown = ui.now; } });
      ui.button('player:pp', cx - 38, by - 32, 76, 76, null, { icon: v.wantPlay ? 'pause' : 'play', kind: 'primary', onClick: () => { v.toggle(); this._shown = ui.now; } });
      ui.button('player:fwd', cx + 86, by - 26, 64, 64, null, { icon: 'fwd10', kind: 'icon', onClick: () => { v.skip(10); this._shown = ui.now; } });
      ui.button('player:vol', x + w - 96, by - 24, 60, 60, null, { icon: host.volume < 0.02 ? 'mute' : 'volume', kind: 'icon', onClick: () => ui._togglePopover('volume') });
      ui.button('player:bright', x + w - 166, by - 24, 60, 60, null, { icon: 'brightness', kind: 'icon', onClick: () => ui._togglePopover('brightness') });
      text(ctx, it.rating || '', x + 40, by + 12, { size: 16, weight: 700, color: C.muted });
      ctx.restore();
    },
  };
}
