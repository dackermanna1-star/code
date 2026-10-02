// Group 10: helpers shared by the levels of this group (painting, scripts that touch the animated
// props of the loaded chunks).
import { pnoise } from '../../gfx/texgen.js';

export const mix = (a, b, t) => [a[0] + (b[0] - a[0]) * t, a[1] + (b[1] - a[1]) * t, a[2] + (b[2] - a[2]) * t];
export const mulc = (c, m) => [c[0] * m, c[1] * m, c[2] * m];

// n x n square tiles with grout and a slight tone per tile
export function tiles(p, n, base, grout, r, amp = 0.05) {
  const ts = 64 / n;
  p.fill(base);
  for (let ty = 0; ty < n; ty++) for (let tx = 0; tx < n; tx++) p.shade(tx * ts, ty * ts, ts, ts, r.range(-amp, amp * 0.5));
  for (let k = 0; k < 64; k += ts) { p.rect(0, k, 64, 1, grout); p.rect(k, 0, 1, 64, grout); }
}

// a film of dust: blends toward a dull colour with blotchy noise (more at the top of the tile if `settle`)
export function dust(p, amt, col = [150, 138, 112], seed = 5) {
  return p.map((x, y, c) => {
    const n = pnoise(x, y, 8, seed) * 0.6 + pnoise(x, y, 16, seed + 3) * 0.4;
    const k = Math.min(1, Math.max(0, amt * (0.35 + n)));
    return [c[0] + (col[0] - c[0]) * k, c[1] + (col[1] - c[1]) * k, c[2] + (col[2] - c[2]) * k];
  });
}

// every animated prop of the loaded chunks of this level whose anim.tag matches
// (anim objects are plain data the game keeps: showFar / showNear / spin / osc, and our own fields)
export function dynamicsOf(ctx, tag) {
  const out = [];
  const w = ctx.game.world;
  if (!w || !w.chunks) return out;
  for (const ch of w.chunks.values()) {
    if (ch.dim !== ctx.level.dim || !ch.dyn) continue;
    for (const d of ch.dyn) if (d.anim && d.anim.tag === tag) out.push(d);
  }
  return out;
}

// is the point (x, z) inside the view cone of the player? (half angle in radians, flat)
export function inView(ctx, x, z, half = 1.0) {
  const p = ctx.player;
  const dx = x - p.x, dz = z - p.z;
  const d = Math.hypot(dx, dz);
  if (d < 1.5) return true;
  const fx = Math.sin(p.yaw), fz = -Math.cos(p.yaw);
  return (dx * fx + dz * fz) / d > Math.cos(half);
}
