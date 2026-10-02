// Group 10: helpers shared by the levels of this group (painting, scripts that touch the animated
// props of the loaded chunks).
import { pnoise } from '../../gfx/texgen.js';
import { CF } from './kit.js';

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

// A flight of steps over the cell rect [x0, x1) x [z0, z1): every step is a slab a little thicker than
// the rise (so the underside shows as a saw tooth) instead of a column down to the floor; far fewer
// vertices than the engine's stairs(). dir: '+x' '-x' '+z' '-z' is the way up. The cells become
// CF.STAIRS (no floor of their own); the steps carry the collision.
export function slabStairs(zb, x0, z0, x1, z1, dir, h0, h1, mat, n) {
  const alongX = dir === '+x' || dir === '-x', up = dir === '+x' || dir === '+z';
  zb.fill(x0, z0, x1, z1, (x, z, i) => { zb.flags[i] |= CF.STAIRS; zb.floor[i] = Math.min(h0, h1); zb.solid[i] = 0; });
  const run = alongX ? x1 - x0 : z1 - z0, tread = run / n, rise = (h1 - h0) / n;
  const thick = Math.abs(rise) + 0.04;
  for (let k = 0; k < n; k++) {
    const a = up ? k * tread : run - (k + 1) * tread, top = h0 + rise * (k + 1);
    // the face toward the next step up is hidden: leave it out
    const back = alongX ? (up ? 1 : 2) : (up ? 16 : 32);
    if (alongX) zb.box(x0 + a, top - thick, z0, x0 + a + tread, top, z1, mat, { sub: 8, skip: back });
    else zb.box(x0, top - thick, z0 + a, x1, top, z0 + a + tread, mat, { sub: 8, skip: back });
  }
}
