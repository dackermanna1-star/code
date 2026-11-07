// =============================================================================
// Shared "attract mode" artwork for every idle seatback screen (one small canvas
// texture for all of them, redrawn about once per second): rotating panels with
// the Halcyon welcome, a live map snapshot and the featured film.
// During the safety demonstration it shows the safety briefing slides instead.
// =============================================================================
import { C, text, fillRR, cover, wordmark, logoMark, fmtHM } from './ui/kit.js';
import { drawWelcome } from './pages/misc.js';
import { drawSafety } from './pages/safety.js';

const PANEL_T = 12;

export function drawAttract(ctx, W, H, now, host) {
  ctx.save();
  if (host.safety.active) {
    drawSafety(ctx, 0, 0, W, H, now, host.safety);
    ctx.restore();
    return;
  }
  const st = host.app.flight?.state;
  const panel = Math.floor(now / PANEL_T) % 3;
  const s = W / 1280;
  if (panel === 0) {
    drawWelcome(ctx, 0, 0, W, H, now, host, false);
  } else if (panel === 1) {
    host.map.draw(ctx, 0, 0, W, H, { view: 'overview', st, units: host.data().units, mini: true });
    const g = ctx.createLinearGradient(0, H * 0.55, 0, H);
    g.addColorStop(0, 'rgba(4,12,24,0)'); g.addColorStop(1, 'rgba(4,12,24,0.92)');
    ctx.fillStyle = g; ctx.fillRect(0, 0, W, H);
    const d = host.data();
    text(ctx, `${d.originCity}  →  ${d.destCity}`, 50 * s, H - 110 * s, { size: 44 * s, weight: 800 });
    text(ctx, st?.onGround && (st?.routeProgress ?? 0) < 0.01 ? `Flight time ${fmtHM(st?.timeToGoSec)}  ·  ${d.distance}` : `${d.timeToGo} to destination  ·  ${d.altitude}`, 50 * s, H - 60 * s, { size: 30 * s, weight: 500, color: C.muted });
    logoMark(ctx, W - 120 * s, 30 * s, 80 * s);
  } else {
    const feat = host.catalog.movies.find((m) => m.featured) || host.catalog.movies[0];
    ctx.fillStyle = '#071528'; ctx.fillRect(0, 0, W, H);
    if (feat?.backdropImg) cover(ctx, feat.backdropImg, 0, 0, W, H, 0.5, 0.4);
    const g = ctx.createLinearGradient(0, 0, W * 0.8, 0);
    g.addColorStop(0, 'rgba(4,12,24,0.92)'); g.addColorStop(1, 'rgba(4,12,24,0)');
    ctx.fillStyle = g; ctx.fillRect(0, 0, W, H);
    text(ctx, 'NOW SHOWING', 60 * s, 150 * s, { size: 26 * s, weight: 700, color: C.gold, spacing: 3 * s });
    text(ctx, feat?.title || 'Movies & TV', 60 * s, 250 * s, { size: 96 * s, weight: 800 });
    text(ctx, feat ? `${feat.year}  ·  ${feat.genre}` : '', 60 * s, 310 * s, { size: 32 * s, color: C.muted });
    wordmark(ctx, 60 * s, H - 70 * s, 34 * s, '#fff');
  }
  // persistent hint strip
  fillRR(ctx, W - 430 * s, H - 92 * s, 380 * s, 56 * s, 28 * s, 'rgba(6,18,36,0.55)');
  text(ctx, 'Touch the screen to start', W - 240 * s, H - 55 * s, { size: 24 * s, weight: 600, align: 'center' });
  ctx.restore();
}
