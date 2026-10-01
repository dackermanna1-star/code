// Facade weathering maps: soot (R), damp/water streaks (G), efflorescence (B),
// rust bleed (A). Drawn in facade space from the facade layout + fixtures so
// streaks fall from sills, AC units and lamps, and the base of the wall is
// stained by rising damp and splash-back.
import { RNG } from '../core/rng.js';
import { PAINT_LAYER_H } from '../world/units.js';

function makeCanvas(w, h) {
  if (typeof OffscreenCanvas !== 'undefined') return new OffscreenCanvas(w, h);
  const c = document.createElement('canvas');
  c.width = w;
  c.height = h;
  return c;
}

/** Draw a vertical drip streak (grayscale intensity into ctx with 'lighter'). */
function streak(ctx, rng, x, y, len, width, alpha, ppm) {
  const n = Math.max(1, Math.round(width * ppm * 0.8));
  for (let i = 0; i < n; i++) {
    const sx = x + rng.range(-width / 2, width / 2) * ppm;
    const l = len * ppm * rng.range(0.35, 1.0);
    const a = alpha * rng.range(0.25, 0.8);
    const g = ctx.createLinearGradient(sx, y, sx, y + l);
    g.addColorStop(0, `rgba(255,255,255,${a})`);
    g.addColorStop(0.6, `rgba(255,255,255,${a * 0.5})`);
    g.addColorStop(1, 'rgba(255,255,255,0)');
    ctx.fillStyle = g;
    const w = Math.max(1, rng.range(0.5, 1.6));
    ctx.fillRect(sx, y, w, l);
  }
}

function blob(ctx, x, y, r, alpha) {
  const g = ctx.createRadialGradient(x, y, 0, x, y, r);
  g.addColorStop(0, `rgba(255,255,255,${alpha})`);
  g.addColorStop(1, 'rgba(255,255,255,0)');
  ctx.fillStyle = g;
  ctx.fillRect(x - r, y - r, r * 2, r * 2);
}

/**
 * @param {object} f facade spec
 * @param {Array} fixtures fixtures belonging to this facade
 * @param {number} ppm pixels per meter
 * @param {number} v0 absolute height of the layer bottom
 */
export function generateGrime(f, fixtures, ppm = 16, v0 = 0) {
  const rng = new RNG((f.seed ?? 1) * 7919 + 17);
  const W = Math.max(1, Math.round(f.width * ppm));
  const H = Math.round(PAINT_LAYER_H * ppm);
  const Y = (y) => (PAINT_LAYER_H - (y - v0)) * ppm; // absolute meters -> canvas y
  const X = (u) => u * ppm;
  const chans = [0, 1, 2, 3].map(() => {
    const c = makeCanvas(W, H);
    const ctx = c.getContext('2d');
    ctx.fillStyle = '#000';
    ctx.fillRect(0, 0, W, H);
    ctx.globalCompositeOperation = 'lighter';
    return { c, ctx };
  });
  const [soot, damp, salt, rust] = chans.map((c) => c.ctx);

  // ── base splash / rising damp band ──
  for (let u = 0; u < f.width; u += 0.25) {
    const hDamp = 0.35 + rng.range(0, 0.55) + 0.25 * Math.sin(u * 0.7 + f.seed);
    const g = damp.createLinearGradient(0, Y(hDamp + v0 * 0), 0, Y(0));
    g.addColorStop(0, 'rgba(255,255,255,0)');
    g.addColorStop(0.5, 'rgba(255,255,255,0.35)');
    g.addColorStop(1, 'rgba(255,255,255,0.7)');
    damp.fillStyle = g;
    damp.fillRect(X(u), Y(hDamp), 0.26 * ppm, Y(0) - Y(hDamp));
    const g2 = soot.createLinearGradient(0, Y(0.4), 0, Y(0));
    g2.addColorStop(0, 'rgba(255,255,255,0)');
    g2.addColorStop(1, `rgba(255,255,255,${rng.range(0.25, 0.5)})`);
    soot.fillStyle = g2;
    soot.fillRect(X(u), Y(0.4), 0.26 * ppm, Y(0) - Y(0.4));
    if (rng.chance(0.12)) blob(salt, X(u + rng.range(0, 0.25)), Y(rng.range(0.15, 0.7)), rng.range(0.1, 0.35) * ppm, rng.range(0.25, 0.6));
  }

  // ── soot streaks from the coping / roofline ──
  const top = f.height;
  for (let u = 0; u < f.width; u += rng.range(0.15, 0.6)) {
    if (top - v0 > PAINT_LAYER_H + 2) break;
    streak(soot, rng, X(u), Y(top - 0.3), rng.range(0.6, 3.5), rng.range(0.05, 0.3), rng.range(0.15, 0.5), ppm);
  }

  // ── fixtures ──
  for (const fx of fixtures) {
    const u0 = fx.u, u1 = fx.u + fx.w;
    if (fx.kind === 'window' || fx.kind === 'glassblock') {
      // water runs off both sill ends and the middle
      const sy = fx.y - 0.07;
      const ends = [u0 - 0.03, u1 + 0.03, (u0 + u1) / 2 + rng.range(-0.2, 0.2)];
      for (const e of ends) {
        if (rng.chance(0.85)) streak(damp, rng, X(e), Y(sy), rng.range(0.6, 2.6), rng.range(0.06, 0.22), rng.range(0.3, 0.75), ppm);
        if (rng.chance(0.5)) streak(soot, rng, X(e), Y(sy), rng.range(0.5, 2.0), rng.range(0.05, 0.18), rng.range(0.2, 0.45), ppm);
        if (rng.chance(0.35)) streak(salt, rng, X(e), Y(sy - 0.05), rng.range(0.2, 0.8), rng.range(0.05, 0.15), rng.range(0.3, 0.7), ppm);
      }
      // grime above the lintel
      const g = soot.createLinearGradient(0, Y(fx.y + fx.h + 0.35), 0, Y(fx.y + fx.h));
      g.addColorStop(0, 'rgba(255,255,255,0)');
      g.addColorStop(1, 'rgba(255,255,255,0.3)');
      soot.fillStyle = g;
      soot.fillRect(X(u0 - 0.05), Y(fx.y + fx.h + 0.35), (fx.w + 0.1) * ppm, 0.35 * ppm);
      if (rng.chance(0.4)) streak(rust, rng, X(u0 + rng.range(0, fx.w)), Y(fx.y + fx.h), rng.range(0.2, 0.9), 0.08, rng.range(0.2, 0.5), ppm);
      if (fx.ac) {
        // AC units drip constantly: a dark wet stain and white mineral deposits
        streak(damp, rng, X((u0 + u1) / 2), Y(fx.y + 0.3), rng.range(2.0, 3.6), 0.5, 0.9, ppm);
        streak(salt, rng, X((u0 + u1) / 2), Y(fx.y + 0.2), rng.range(0.8, 2.0), 0.35, 0.6, ppm);
        streak(rust, rng, X((u0 + u1) / 2), Y(fx.y + 0.25), rng.range(0.6, 1.4), 0.3, 0.5, ppm);
      }
    } else if (fx.kind === 'door') {
      // hand grime around the latch side, splash at the threshold
      blob(soot, X(u1 - 0.1), Y(1.05), 0.35 * ppm, 0.35);
      blob(soot, X(u0 + 0.1), Y(1.0), 0.25 * ppm, 0.2);
      const g = damp.createLinearGradient(0, Y(0.6), 0, Y(0));
      g.addColorStop(0, 'rgba(255,255,255,0)');
      g.addColorStop(1, 'rgba(255,255,255,0.5)');
      damp.fillStyle = g;
      damp.fillRect(X(u0 - 0.3), Y(0.6), (fx.w + 0.6) * ppm, 0.6 * ppm);
      streak(rust, rng, X(u0 - 0.05), Y(fx.h + 0.05), rng.range(0.3, 1.2), 0.1, 0.5, ppm);
      streak(rust, rng, X(u1 + 0.05), Y(fx.h + 0.05), rng.range(0.3, 1.0), 0.1, 0.4, ppm);
      if (fx.lamp) {
        blob(soot, X((u0 + u1) / 2), Y(fx.h + 0.75), 0.45 * ppm, 0.45);
        streak(rust, rng, X((u0 + u1) / 2), Y(fx.h + 0.35), rng.range(0.3, 0.8), 0.12, 0.35, ppm);
      }
    } else if (fx.kind === 'rollup' || fx.kind === 'garage' || fx.kind === 'sliding') {
      for (let i = 0; i < 6; i++) streak(rust, rng, X(u0 + rng.range(-0.1, fx.w + 0.1)), Y(fx.h + 0.1), rng.range(0.2, 1.5), 0.12, rng.range(0.3, 0.6), ppm);
      for (let i = 0; i < 4; i++) streak(damp, rng, X(u0 + rng.range(0, fx.w)), Y(fx.h + 0.2), rng.range(0.4, 2.0), 0.2, 0.5, ppm);
    }
  }

  // ── facade-specific stains (grease from kitchen exhaust etc.) ──
  for (const p of f.patches ?? []) {
    if (p.kind !== 'grease') continue;
    for (let i = 0; i < 18; i++) streak(soot, rng, X(p.u + rng.range(0, p.w)), Y(p.y + p.h), rng.range(0.4, p.h + 1.2), 0.25, 0.65, ppm);
    blob(soot, X(p.u + p.w / 2), Y(p.y + p.h * 0.8), p.w * 0.45 * ppm, 0.8);
    for (let i = 0; i < 8; i++) streak(damp, rng, X(p.u + rng.range(0, p.w)), Y(p.y + p.h * 0.6), rng.range(0.5, 2.0), 0.15, 0.5, ppm);
  }

  // ── random leaks & stains ──
  const leaks = Math.round(f.width * 0.25);
  for (let i = 0; i < leaks; i++) {
    const u = rng.range(0, f.width);
    const y = rng.range(1.5, Math.min(top, v0 + PAINT_LAYER_H) - 0.5);
    streak(damp, rng, X(u), Y(y), rng.range(0.5, 3.0), rng.range(0.1, 0.4), rng.range(0.2, 0.5), ppm);
    if (rng.chance(0.3)) blob(salt, X(u), Y(y - 0.3), rng.range(0.1, 0.3) * ppm, 0.4);
  }

  // merge channels into RGBA (raw bytes: a canvas round-trip would premultiply
  // the independent rust channel into the others)
  const data = new Uint8ClampedArray(W * H * 4);
  const datas = chans.map(({ c }) => c.getContext('2d').getImageData(0, 0, W, H).data);
  for (let i = 0; i < W * H; i++) {
    data[i * 4] = datas[0][i * 4];
    data[i * 4 + 1] = datas[1][i * 4];
    data[i * 4 + 2] = datas[2][i * 4];
    data[i * 4 + 3] = datas[3][i * 4];
  }
  return { width: W, height: H, data };
}
