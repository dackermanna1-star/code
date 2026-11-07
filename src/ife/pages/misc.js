// GAMES (sliding puzzle), SETTINGS and the SPLASH ("touch to start") page.
import { C, text, wrap, fillRR, rr, ease, clamp01, withShadow, fmtDuration, bar, logoMark, wordmark, rng } from '../ui/kit.js';
import { icon } from '../ui/icons.js';

// ------------------------------------------------------------------------------------- games
export function gamesPage() {
  const N = 4;
  const g = {
    id: 'games',
    tiles: null, moves: 0, t0: 0, won: false, anim: new Map(), seed: 1,
    onEnter() { if (!this.tiles) this.shuffle(); },
    shuffle() {
      const r = rng(this.seed++ * 977 + 13);
      this.tiles = [...Array(N * N).keys()].map((i) => (i + 1) % (N * N));   // 1..15, 0 = blank
      let blank = N * N - 1;
      for (let k = 0; k < 220; k++) {
        const bx = blank % N, by = Math.floor(blank / N);
        const opts = [];
        if (bx > 0) opts.push(blank - 1); if (bx < N - 1) opts.push(blank + 1);
        if (by > 0) opts.push(blank - N); if (by < N - 1) opts.push(blank + N);
        const o = opts[Math.floor(r() * opts.length)];
        [this.tiles[blank], this.tiles[o]] = [this.tiles[o], this.tiles[blank]];
        blank = o;
      }
      this.moves = 0; this.t0 = this.ui?.now || 0; this.won = false; this.anim.clear();
    },
    tap(i) {
      if (this.won) return;
      const b = this.tiles.indexOf(0);
      const ix = i % N, iy = Math.floor(i / N), bx = b % N, by = Math.floor(b / N);
      if (ix !== bx && iy !== by) return;
      // slide a whole row/column segment towards the blank
      const step = ix === bx ? (iy < by ? -N : N) : (ix < bx ? -1 : 1);
      let cur = b;
      while (cur !== i) {
        const nxt = cur + step;
        this.anim.set(this.tiles[nxt], { from: nxt, t0: this.ui.now });
        this.tiles[cur] = this.tiles[nxt];
        cur = nxt;
      }
      this.tiles[i] = 0;
      this.moves++;
      this.ui.host.app.audio?.play?.('button_press', { volume: 0.15 });
      if (this.tiles.every((v, k) => v === (k + 1) % (N * N))) this.won = true;
    },
    fps(ui) { return [...this.anim.values()].some((a) => ui.now - a.t0 < 0.2) ? 30 : 1; },
    draw(ui, ctx, x, y, w, h) {
      const pad = 34;
      text(ctx, 'Games', x + pad, y + 58, { size: 38, weight: 800 });
      text(ctx, 'Sky Slide — put the tiles back in order', x + pad, y + 90, { size: 18, color: C.muted });
      const bs = Math.min(h - 140, w * 0.5);
      const bx = x + (w - bs) / 2 - 120, by = y + 112;
      const cell = bs / N;
      withShadow(ctx, 30, 'rgba(0,0,0,0.5)', () => fillRR(ctx, bx - 12, by - 12, bs + 24, bs + 24, 22, 'rgba(6,18,32,0.95)'));
      for (let i = 0; i < N * N; i++) {
        const v = this.tiles[i];
        if (!v) continue;
        let cx = (i % N) * cell, cy = Math.floor(i / N) * cell;
        const a = this.anim.get(v);
        if (a) {
          const t = ease.outCubic(clamp01((ui.now - a.t0) / 0.18));
          cx = ((a.from % N) * cell) * (1 - t) + cx * t;
          cy = (Math.floor(a.from / N) * cell) * (1 - t) + cy * t;
          if (t >= 1) this.anim.delete(v);
        }
        const tx = bx + cx + 5, ty = by + cy + 5, ts = cell - 10;
        const s = ui.hit(`tile:${i}`, tx, ty, ts, ts, { onClick: () => this.tap(i), radius: 14 });
        const home = v === i + 1;
        const gr = ctx.createLinearGradient(0, ty, 0, ty + ts);
        gr.addColorStop(0, home ? '#2aa6b8' : s.hover ? '#3c6f9c' : '#24507a');
        gr.addColorStop(1, home ? '#1b7a8a' : s.hover ? '#2a557c' : '#163a5c');
        fillRR(ctx, tx, ty, ts, ts, 14, gr);
        rr(ctx, tx + 1, ty + 1, ts - 2, ts - 2, 14); ctx.strokeStyle = 'rgba(255,255,255,0.12)'; ctx.lineWidth = 1.5; ctx.stroke();
        text(ctx, String(v), tx + ts / 2, ty + ts / 2 + ts * 0.14, { size: ts * 0.4, weight: 800, align: 'center' });
      }
      const sx = bx + bs + 60;
      text(ctx, 'MOVES', sx, by + 30, { size: 14, weight: 700, color: C.faint, spacing: 1.5 });
      text(ctx, String(this.moves), sx, by + 76, { size: 44, weight: 800 });
      text(ctx, 'TIME', sx, by + 130, { size: 14, weight: 700, color: C.faint, spacing: 1.5 });
      text(ctx, fmtDuration(this.won ? this._wonT : ui.now - this.t0), sx, by + 176, { size: 44, weight: 800 });
      ui.button('games:new', sx, by + 220, 200, 56, 'New game', { icon: 'shuffle', onClick: () => this.shuffle(), size: 19 });
      if (this.won) {
        if (this._wonT === undefined || this._wonFlag !== this.seed) { this._wonT = ui.now - this.t0; this._wonFlag = this.seed; }
        withShadow(ctx, 30, 'rgba(0,0,0,0.6)', () => fillRR(ctx, bx + bs / 2 - 200, by + bs / 2 - 70, 400, 140, 20, 'rgba(232,176,75,0.97)'));
        text(ctx, 'Well done!', bx + bs / 2, by + bs / 2 - 8, { size: 36, weight: 800, color: '#1a1407', align: 'center' });
        text(ctx, `Solved in ${this.moves} moves`, bx + bs / 2, by + bs / 2 + 34, { size: 20, color: '#1a1407', align: 'center' });
      }
    },
  };
  return g;
}

// ------------------------------------------------------------------------------------- settings
export function settingsPage() {
  return {
    id: 'settings',
    draw(ui, ctx, x, y, w, h) {
      const host = ui.host, app = host.app;
      const pad = 34;
      text(ctx, 'Settings', x + pad, y + 58, { size: 38, weight: 800 });
      text(ctx, `Seat ${host.seatId || '—'}  ·  Halcyon Skyline entertainment system`, x + pad, y + 90, { size: 18, color: C.muted });
      const cx = x + pad, cw = Math.min(820, w - 2 * pad);
      let ry = y + 124;
      const slider = (id, label, ic, val, set) => {
        fillRR(ctx, cx, ry, cw, 92, 16, 'rgba(255,255,255,0.06)');
        icon(ctx, ic, cx + 24, ry + 30, 32, C.gold);
        text(ctx, label, cx + 76, ry + 54, { size: 22, weight: 600 });
        const sx = cx + 330, sw = cw - 330 - 110;
        ui.hit(id, sx - 14, ry + 20, sw + 28, 52, { onDrag: (px) => { set(clamp01((px - sx) / sw)); ui.dirty = true; }, ripple: false });
        bar(ctx, sx, ry + 42, sw, 8, val, { knob: true, fg: C.teal });
        text(ctx, `${Math.round(val * 100)}%`, cx + cw - 28, ry + 54, { size: 20, color: C.muted, align: 'right' });
        ry += 108;
      };
      slider('set:bright', 'Screen brightness', 'brightness', host.brightness, (v) => host.setBrightness(Math.max(0.15, v)));
      slider('set:vol', 'Headphone volume', 'volume', host.volume, (v) => host.setVolume(v));
      // units
      fillRR(ctx, cx, ry, cw, 92, 16, 'rgba(255,255,255,0.06)');
      icon(ctx, 'layers', cx + 24, ry + 30, 32, C.gold);
      text(ctx, 'Units', cx + 76, ry + 54, { size: 22, weight: 600 });
      const units = app.settings.get('units') || 'imperial';
      ['imperial', 'metric'].forEach((u, i) => {
        ui.button(`set:units:${u}`, cx + 330 + i * 170, ry + 20, 156, 52, u === 'imperial' ? 'Imperial' : 'Metric', { active: units === u, onClick: () => app.settings.set('units', u), size: 19 });
      });
      ry += 108;
      // screen off
      fillRR(ctx, cx, ry, cw, 92, 16, 'rgba(255,255,255,0.06)');
      icon(ctx, 'power', cx + 24, ry + 30, 32, C.gold);
      text(ctx, 'Display', cx + 76, ry + 54, { size: 22, weight: 600 });
      text(ctx, 'Touch the screen to turn it back on', cx + 330, ry + 54, { size: 17, color: C.muted });
      ui.button('set:off', cx + cw - 200, ry + 20, 176, 52, 'Screen off', { icon: 'power', onClick: () => host.setPower(host.seatId, false), size: 19 });
      ry += 108;
      wrap(ctx, 'Movies & TV: Blender Foundation open movies (CC BY 3.0). Music: original generative compositions synthesised on board. Map data: fictional.', cx, Math.min(ry + 20, y + h - 40), cw, 22, { size: 15, color: C.faint, maxLines: 2 });
    },
  };
}

// ------------------------------------------------------------------------------------- splash
export function splashPage() {
  return {
    id: 'splash',
    fullscreen: () => true,
    fps: () => 10,
    draw(ui, ctx, x, y, w, h) {
      const host = ui.host;
      drawWelcome(ctx, x, y, w, h, ui.now, host, true);
      ui.hit('splash:start', x, y, w, h, { onClick: () => { ui.reset('home'); }, radius: 0 });
    },
  };
}

/** Welcome / attract artwork (used by the splash page and the shared idle-screen canvas). */
export function drawWelcome(ctx, x, y, w, h, t, host, touchHint) {
  const s = w / 1280;
  const st = host?.app?.flight?.state;
  // sky gradient with a low sun and cloud bands
  const g = ctx.createLinearGradient(0, y, 0, y + h);
  g.addColorStop(0, '#0b2a4a'); g.addColorStop(0.55, '#1f5f86'); g.addColorStop(0.78, '#e2a964'); g.addColorStop(1, '#f2d8a8');
  ctx.fillStyle = g; ctx.fillRect(x, y, w, h);
  const sun = ctx.createRadialGradient(x + w * 0.74, y + h * 0.74, 0, x + w * 0.74, y + h * 0.74, w * 0.3);
  sun.addColorStop(0, 'rgba(255,236,200,0.95)'); sun.addColorStop(0.15, 'rgba(255,210,150,0.5)'); sun.addColorStop(1, 'rgba(255,200,140,0)');
  ctx.fillStyle = sun; ctx.fillRect(x, y, w, h);
  const r = rng(4);
  for (let i = 0; i < 9; i++) {
    const cy = y + h * (0.78 + i * 0.03), drift = ((t * (6 + i * 2) * s + r() * w) % (w * 1.6)) - w * 0.3;
    ctx.fillStyle = `rgba(255,${235 - i * 6},${215 - i * 8},${0.25 + i * 0.05})`;
    ctx.beginPath(); ctx.ellipse(x + drift, cy, w * (0.35 + r() * 0.2), h * 0.022, 0, 0, Math.PI * 2); ctx.fill();
    ctx.beginPath(); ctx.ellipse(x + drift - w * 0.8, cy, w * (0.3 + r() * 0.2), h * 0.02, 0, 0, Math.PI * 2); ctx.fill();
  }
  const vg = ctx.createLinearGradient(x, 0, x + w * 0.7, 0);
  vg.addColorStop(0, 'rgba(6,18,36,0.75)'); vg.addColorStop(1, 'rgba(6,18,36,0)');
  ctx.fillStyle = vg; ctx.fillRect(x, y, w, h);
  logoMark(ctx, x + 70 * s, y + 70 * s, 110 * s);
  wordmark(ctx, x + 196 * s, y + 140 * s, 46 * s, '#fff');
  text(ctx, 'Welcome aboard', x + 72 * s, y + 300 * s, { size: 64 * s, weight: 800 });
  text(ctx, `Flight HN 482 to ${st?.destination?.city || 'Port Solano'}`, x + 72 * s, y + 356 * s, { size: 30 * s, weight: 500, color: 'rgba(255,255,255,0.88)' });
  const o = st?.origin?.code || 'CBY', d = st?.destination?.code || 'PSX';
  text(ctx, `${o}  ✈  ${d}`, x + 72 * s, y + 410 * s, { size: 24 * s, weight: 700, color: C.gold, spacing: 3 * s });
  if (touchHint) {
    const p = 0.55 + 0.45 * Math.sin(t * 2.4);
    ctx.save();
    ctx.globalAlpha *= p;
    fillRR(ctx, x + 72 * s, y + h - 150 * s, 372 * s, 64 * s, 32 * s, 'rgba(6,18,36,0.45)');
    text(ctx, 'Touch the screen to start', x + 104 * s, y + h - 108 * s, { size: 24 * s, weight: 600 });
    ctx.restore();
  }
}
