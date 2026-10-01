// Vertex light baking with simple 2.5D occlusion against the cell grid.
import { W } from './zonebuilder.js';
import { HALF_T, DOOR_H, HALFWALL_H, PARTITION_H, MAX_LIGHT_R } from '../config.js';
import { vnoise3 } from '../core/rng.js';

// Does the segment from (ax,ay,az) to (bx,by,bz) pass unobstructed through the window cells?
// Heights are relative to the level base.
export function segmentClear(win, ax, ay, az, bx, by, bz) {
  const dx = bx - ax, dz = bz - az, dy = by - ay;
  let cx = Math.floor(ax), cz = Math.floor(az);
  const tx = Math.floor(bx), tz = Math.floor(bz);
  const stepX = dx > 0 ? 1 : -1, stepZ = dz > 0 ? 1 : -1;
  const tdx = dx !== 0 ? Math.abs(1 / dx) : Infinity, tdz = dz !== 0 ? Math.abs(1 / dz) : Infinity;
  let tmx = dx !== 0 ? (dx > 0 ? cx + 1 - ax : ax - cx) * tdx : Infinity;
  let tmz = dz !== 0 ? (dz > 0 ? cz + 1 - az : az - cz) * tdz : Infinity;
  let guard = 64;
  while ((cx !== tx || cz !== tz) && guard-- > 0) {
    let t, edgeType, ex, ez, side;
    if (tmx < tmz) {
      t = tmx; tmx += tdx;
      const nx = cx + stepX;
      side = 'W'; ex = stepX > 0 ? nx : cx; ez = cz;
      cx = nx;
    } else {
      t = tmz; tmz += tdz;
      const nz = cz + stepZ;
      side = 'N'; ex = cx; ez = stepZ > 0 ? nz : cz;
      cz = nz;
    }
    if (t > 1) break;
    const y = ay + dy * t;
    if (!win.inside(ex, ez)) return true;
    const ei = win.idx(ex, ez);
    edgeType = side === 'W' ? win.wallW[ei] : win.wallN[ei];
    if (edgeType) {
      const ox = side === 'W' ? ex - 1 : ex, oz = side === 'W' ? ez : ez - 1;
      const oi = win.inside(ox, oz) ? win.idx(ox, oz) : -1;
      let bot = win.floor[ei], top = win.ceil[ei];
      if (oi >= 0) {
        const f2 = win.floor[oi], c2 = win.ceil[oi];
        if (!(bot <= f2)) bot = Number.isNaN(f2) ? bot : f2;
        if (!(top >= c2)) top = Number.isNaN(c2) ? top : c2;
      }
      if (Number.isNaN(bot)) bot = 0;
      if (Number.isNaN(top)) top = 6;
      const rel = y - bot;
      switch (edgeType) {
        case W.WALL: case W.FULL: if (y > bot - 0.05 && y < top + 0.05) return false; break;
        case W.DOOR: if (rel > DOOR_H && y < top) return false; break;
        case W.BIGDOOR: if (rel > 2.45 && y < top) return false; break;
        case W.ARCH: if (rel > 2.6 && y < top) return false; break;
        case W.LOW: if (rel > 1.0 && y < top) return false; break;
        case W.WINDOW: if ((rel < 1.0 || rel > DOOR_H) && y < top) return false; break;
        case W.HALF: if (rel < HALFWALL_H) return false; break;
        case W.PART: if (rel < PARTITION_H) return false; break;
        case W.UPPER: if (y > top - 0.05) return false; break;
        default: break;
      }
    }
    if (!win.inside(cx, cz)) return true;
    const ci = win.idx(cx, cz);
    if (win.solid[ci]) return false;
    const f = win.floor[ci], c = win.ceil[ci];
    if (y < f - 0.04) return false;
    if (y > c + 0.04) return false;
  }
  return true;
}

const KNEE = 0.85, KMAX = 1.32;
const AMB_ISOLATED = [0.2, 0.19, 0.17];
function knee(v) { return KNEE + (KMAX - KNEE) * (1 - Math.exp(-(v - KNEE) / (KMAX - KNEE))); }

// Bake per-vertex light into col/flk arrays (0..2 range). ctx: {win, lights, y0, ambient(x,z)->[r,g,b]}
export function bakeMesh(mb, ctx) {
  const n = mb.n;
  const col = new Float32Array(n * 3), flk = new Float32Array(n * 3);
  const lights = ctx.lights;
  const y0 = ctx.y0;
  // bucket lights on a coarse grid for quick lookup
  const B = 4;
  const buckets = new Map();
  for (let li = 0; li < lights.length; li++) {
    const L = lights[li];
    const r = Math.min(L.rad, MAX_LIGHT_R + 2);
    for (let bz = Math.floor((L.z - r) / B); bz <= Math.floor((L.z + r) / B); bz++) {
      for (let bx = Math.floor((L.x - r) / B); bx <= Math.floor((L.x + r) / B); bx++) {
        const k = bx * 73856093 ^ bz * 19349663;
        let arr = buckets.get(k);
        if (!arr) { arr = []; buckets.set(k, arr); }
        arr.push(li);
      }
    }
  }
  const win = ctx.win;
  const stainSeed = ctx.stainSeed || 7;
  const wrap = ctx.wrap ?? 0.4;
  const ambBoost = ctx.ambBoost || 0;
  const NOBLEED = 4; // CF.NOLIGHTBLEED
  for (let i = 0; i < n; i++) {
    const p3 = i * 3;
    if (!mb.lit[i]) {
      col[p3] = mb.pre[i * 4]; col[p3 + 1] = mb.pre[i * 4 + 1]; col[p3 + 2] = mb.pre[i * 4 + 2];
      flk[p3] = mb.preF[p3]; flk[p3 + 1] = mb.preF[p3 + 1]; flk[p3 + 2] = mb.preF[p3 + 2];
      continue;
    }
    const nx = mb.nrm[p3], ny = mb.nrm[p3 + 1], nz = mb.nrm[p3 + 2];
    const px = mb.pos[p3] + nx * 0.06 + mb.nudge[p3];
    const py = mb.pos[p3 + 1] + ny * 0.06 + mb.nudge[p3 + 1];
    const pz = mb.pos[p3 + 2] + nz * 0.06 + mb.nudge[p3 + 2];
    // cells flagged NOLIGHTBLEED (portal vestibules) only see their own 'local' lights
    const sxi = Math.floor(px), szi = Math.floor(pz);
    const isolated = win.inside(sxi, szi) && (win.flags[win.idx(sxi, szi)] & NOBLEED) !== 0;
    const amb = isolated ? AMB_ISOLATED : ctx.ambient(px, pz);
    let r = amb[0] * (1 + ambBoost), g = amb[1] * (1 + ambBoost), b = amb[2] * (1 + ambBoost);
    let fr = 0, fg = 0, fb = 0, fch = 0, fbest = 0;
    const k = Math.floor(px / B) * 73856093 ^ Math.floor(pz / B) * 19349663;
    const arr = buckets.get(k);
    if (arr) {
      for (let a = 0; a < arr.length; a++) {
        const L = lights[arr[a]];
        if (isolated && !L.local) continue;
        const dx = L.x - px, dy = (L.y + y0) - py, dz = L.z - pz;
        const d2 = dx * dx + dy * dy + dz * dz;
        const rad = L.rad;
        if (d2 >= rad * rad) continue;
        const d = Math.sqrt(d2) || 0.001;
        const ndl = (nx * dx + ny * dy + nz * dz) / d;
        const lam = ndl > -wrap ? (ndl + wrap) / (1 + wrap) : 0;
        if (lam <= 0) continue;
        const a1 = 1 - d / rad;
        const att = a1 * Math.sqrt(a1);
        const v = L.int * att * lam;
        if (v < 0.004) continue;
        if (!segmentClear(win, L.x, L.y, L.z, px, py - y0, pz)) continue;
        if (L.ch) {
          const s = v * (L.r + L.g + L.b);
          if (s > fbest) {
            // demote previous best into the steady term
            if (fbest > 0) { r += fr; g += fg; b += fb; }
            fbest = s; fch = L.ch; fr = L.r * v; fg = L.g * v; fb = L.b * v;
          } else { r += L.r * v * 0.5; g += L.g * v * 0.5; b += L.b * v * 0.5; }
        } else {
          r += L.r * v; g += L.g * v; b += L.b * v;
        }
      }
    }
    let m = mb.ao[i];
    const st = mb.stain[i];
    if (st > 0) {
      const s = vnoise3(px * 0.55, py * 0.4, pz * 0.55, stainSeed);
      m *= 1 - st * Math.max(0, s * 1.6 - 0.35);
    }
    const tr = mb.tint[p3] * m, tg = mb.tint[p3 + 1] * m, tb = mb.tint[p3 + 2] * m;
    // soft knee: keeps overlapping fixtures from blowing bright paint out to white
    const tot = Math.max(r, g, b) + Math.max(fr, fg, fb);
    const kn = tot > KNEE ? knee(tot) / tot : 1;
    col[p3] = r * tr * kn; col[p3 + 1] = g * tg * kn; col[p3 + 2] = b * tb * kn;
    if (fch) {
      flk[p3] = fr * tr * kn; flk[p3 + 1] = fg * tg * kn; flk[p3 + 2] = fb * tb * kn;
      mb.chan[i] = fch;
    }
  }
  return { col, flk };
}
