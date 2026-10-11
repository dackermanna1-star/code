// Lightmap allocation and baking (a tiny hlrad): world-aligned luxel grids
// (one luxel per 16 units like GoldSrc), sun with shadows, sky light,
// point lights and one bounce. DOM-free; runs in a worker or node.

import { TraceResult, MASK_SHOT } from '../engine/collision.js';

// Quake TextureAxisFromPlane base axes: [normal, s, t]
const BASE_AXIS = [
  [[0, 0, 1], [1, 0, 0], [0, -1, 0]],
  [[0, 0, -1], [1, 0, 0], [0, -1, 0]],
  [[1, 0, 0], [0, 1, 0], [0, 0, -1]],
  [[-1, 0, 0], [0, 1, 0], [0, 0, -1]],
  [[0, 1, 0], [1, 0, 0], [0, 0, -1]],
  [[0, -1, 0], [1, 0, 0], [0, 0, -1]],
];

export function textureAxes(n) {
  let best = 0, bestDot = -Infinity;
  for (let i = 0; i < 6; i++) {
    const a = BASE_AXIS[i][0];
    const d = n[0] * a[0] + n[1] * a[1] + n[2] * a[2];
    if (d > bestDot + 1e-6) { bestDot = d; best = i; }
  }
  return { s: BASE_AXIS[best][1], t: BASE_AXIS[best][2], axisIndex: best };
}

const dot3 = (a, b) => a[0] * b[0] + a[1] * b[1] + a[2] * b[2];

// Allocate a luxel rectangle for every face and pack them into an atlas.
export function allocateLightmaps(faces, luxel = 16) {
  const PAD = 1;
  const rects = [];
  for (const f of faces) {
    const ax = textureAxes(f.n);
    let smin = Infinity, smax = -Infinity, tmin = Infinity, tmax = -Infinity;
    const st = [];
    for (const v of f.poly) {
      const s = dot3(v, ax.s), t = dot3(v, ax.t);
      st.push([s, t]);
      if (s < smin) smin = s; if (s > smax) smax = s;
      if (t < tmin) tmin = t; if (t > tmax) tmax = t;
    }
    const ls = f.brush.luxel || luxel;
    const s0 = Math.floor(smin / ls), s1 = Math.ceil(smax / ls);
    const t0 = Math.floor(tmin / ls), t1 = Math.ceil(tmax / ls);
    const w = s1 - s0 + 1, h = t1 - t0 + 1;
    f.lm = { ax, s0, t0, w, h, st, luxel: ls, x: 0, y: 0 };
    rects.push(f.lm);
  }
  // shelf packing
  let area = 0;
  for (const r of rects) area += (r.w + PAD * 2) * (r.h + PAD * 2);
  let W = 256;
  while (W * W < area * 1.25) W *= 2;
  const order = rects.slice().sort((a, b) => (b.h - a.h) || (b.w - a.w));
  let x = 0, y = 0, shelfH = 0;
  for (const r of order) {
    const rw = r.w + PAD * 2, rh = r.h + PAD * 2;
    if (rw > W) W = nextPow2(rw);
    if (x + rw > W) { x = 0; y += shelfH; shelfH = 0; }
    r.x = x + PAD; r.y = y + PAD;
    x += rw;
    if (rh > shelfH) shelfH = rh;
  }
  let H = nextPow2(y + shelfH);
  return { width: W, height: H, pad: PAD };
}

function nextPow2(v) { let p = 1; while (p < v) p *= 2; return p; }

// Point on face plane for given (s,t) world texture coordinates.
function pointOnPlane(f, s, t, out) {
  const { ax } = f.lm;
  const n = f.n;
  // s-axis and t-axis are world axes (possibly negated); find the third axis
  const si = ax.s[0] ? 0 : ax.s[1] ? 1 : 2;
  const ti = ax.t[0] ? 0 : ax.t[1] ? 1 : 2;
  const ui = 3 - si - ti;
  out[si] = s * ax.s[si];
  out[ti] = t * ax.t[ti];
  out[ui] = (f.d - n[si] * out[si] - n[ti] * out[ti]) / n[ui];
  return out;
}

// Clamp a 2D point into the convex polygon (inset by `inset`).
function clampToPoly(st, s, t, inset, out) {
  // polygon winding may be either way; compute centroid
  let cx = 0, cy = 0;
  for (const p of st) { cx += p[0]; cy += p[1]; }
  cx /= st.length; cy /= st.length;
  let inside = true;
  let bestD = Infinity, bx = s, by = t;
  for (let i = 0; i < st.length; i++) {
    const a = st[i], b = st[(i + 1) % st.length];
    const ex = b[0] - a[0], ey = b[1] - a[1];
    let nx = ey, ny = -ex;
    const l = Math.hypot(nx, ny) || 1;
    nx /= l; ny /= l;
    if ((cx - a[0]) * nx + (cy - a[1]) * ny > 0) { nx = -nx; ny = -ny; } // outward
    const dist = (s - a[0]) * nx + (t - a[1]) * ny;
    if (dist > -inset) inside = false;
    // closest point on segment
    const len2 = ex * ex + ey * ey || 1;
    let u = ((s - a[0]) * ex + (t - a[1]) * ey) / len2;
    u = Math.max(0, Math.min(1, u));
    const px = a[0] + ex * u, py = a[1] + ey * u;
    const dd = (px - s) ** 2 + (py - t) ** 2;
    if (dd < bestD) { bestD = dd; bx = px; by = py; }
  }
  if (inside) { out[0] = s; out[1] = t; return out; }
  // move closest boundary point toward centroid by inset
  const dx = cx - bx, dy = cy - by;
  const l = Math.hypot(dx, dy) || 1;
  const k = Math.min(inset, l * 0.5);
  out[0] = bx + dx / l * k;
  out[1] = by + dy / l * k;
  return out;
}

// Deterministic PRNG
function mulberry32(a) {
  return function () {
    a |= 0; a = a + 0x6D2B79F5 | 0;
    let t = Math.imul(a ^ a >>> 15, 1 | a);
    t = t + Math.imul(t ^ t >>> 7, 61 | t) ^ t;
    return ((t ^ t >>> 14) >>> 0) / 4294967296;
  };
}

export const DEFAULT_LIGHTING = {
  sunDir: [-0.42, 0.38, 0.82],
  sunColor: [0.95, 0.88, 0.72],
  skyColor: [0.40, 0.42, 0.47],
  ambientMin: [0.06, 0.055, 0.05],
  bounce: 0.55,
  skySamples: 32,
  sunSamples: 4,
  lights: [], // { pos:[x,y,z], color:[r,g,b], intensity, radius }
};

// Bake. faces must have .lm from allocateLightmaps. albedo(texName) -> [r,g,b] 0..1.
// Returns Float32Array RGB (width*height*3).
export function bakeLightmaps(faces, world, alloc, opts = {}, albedo = () => [0.6, 0.5, 0.4], onProgress) {
  const L = { ...DEFAULT_LIGHTING, ...opts };
  const W = alloc.width, H = alloc.height;
  const direct = new Float32Array(W * H * 3);
  const sd = norm(L.sunDir.slice());
  const rand = mulberry32(1234);

  // precompute luxel positions
  const tmp2 = [0, 0], P = [0, 0, 0], start = [0, 0, 0], end = [0, 0, 0];
  const tr = new TraceResult();
  const ZERO = [0, 0, 0];

  // hemisphere sample directions (cosine weighted, stratified)
  const hemi = [];
  const N = L.skySamples;
  const sq = Math.ceil(Math.sqrt(N));
  for (let i = 0; i < sq; i++) for (let j = 0; j < sq; j++) {
    if (hemi.length >= N) break;
    const u = (i + 0.5) / sq, v = (j + 0.5) / sq;
    const r = Math.sqrt(u), phi = 2 * Math.PI * v;
    hemi.push([r * Math.cos(phi), r * Math.sin(phi), Math.sqrt(Math.max(0, 1 - u))]);
  }

  const luxPos = (f, i, j, jx, jy, out) => {
    const lm = f.lm;
    const s = (lm.s0 + i + jx) * lm.luxel, t = (lm.t0 + j + jy) * lm.luxel;
    clampToPoly(lm.st, s, t, 1.0, tmp2);
    pointOnPlane(f, tmp2[0], tmp2[1], out);
    return out;
  };

  // ---- pass 1: direct light (sun + point lights) and sky
  const sky = new Float32Array(W * H * 3);
  let done = 0;
  const total = faces.length;
  for (const f of faces) {
    const lm = f.lm;
    const n = f.n;
    const cosSun = n[0] * sd[0] + n[1] * sd[1] + n[2] * sd[2];
    // tangent frame for hemisphere
    const tA = Math.abs(n[2]) < 0.9 ? [0, 0, 1] : [1, 0, 0];
    const b1 = norm(cross(tA, n)), b2 = cross(n, b1);
    const castsLight = f.brush.fullbright;
    for (let j = 0; j < lm.h; j++) {
      for (let i = 0; i < lm.w; i++) {
        const o = ((lm.y + j) * W + (lm.x + i)) * 3;
        if (castsLight) { direct[o] = direct[o + 1] = direct[o + 2] = 1; continue; }
        let r = 0, g = 0, b = 0;
        // sun
        if (cosSun > 0) {
          let lit = 0;
          const ns = L.sunSamples;
          for (let k = 0; k < ns; k++) {
            const jx = ns === 1 ? 0 : (k % 2 - 0.5) * 0.5 + (rand() - 0.5) * 0.4;
            const jy = ns === 1 ? 0 : ((k >> 1) % 2 - 0.5) * 0.5 + (rand() - 0.5) * 0.4;
            luxPos(f, i, j, jx, jy, P);
            start[0] = P[0] + n[0] * 0.5; start[1] = P[1] + n[1] * 0.5; start[2] = P[2] + n[2] * 0.5;
            end[0] = start[0] + sd[0] * 8192; end[1] = start[1] + sd[1] * 8192; end[2] = start[2] + sd[2] * 8192;
            world.trace(start, end, ZERO, ZERO, MASK_SHOT, tr);
            if (tr.fraction >= 1 && !tr.startsolid) lit++;
          }
          const k = lit / ns * cosSun;
          r += L.sunColor[0] * k; g += L.sunColor[1] * k; b += L.sunColor[2] * k;
        }
        luxPos(f, i, j, 0, 0, P);
        start[0] = P[0] + n[0] * 0.5; start[1] = P[1] + n[1] * 0.5; start[2] = P[2] + n[2] * 0.5;
        // point lights
        for (const lt of L.lights) {
          const dx = lt.pos[0] - P[0], dy = lt.pos[1] - P[1], dz = lt.pos[2] - P[2];
          const dist = Math.hypot(dx, dy, dz);
          if (dist > lt.radius) continue;
          const c = (dx * n[0] + dy * n[1] + dz * n[2]) / dist;
          if (c <= 0) continue;
          world.trace(start, lt.pos, ZERO, ZERO, MASK_SHOT, tr);
          if (tr.fraction < 0.999) continue;
          const att = Math.max(0, 1 - dist / lt.radius);
          const k = c * att * att * lt.intensity;
          r += lt.color[0] * k; g += lt.color[1] * k; b += lt.color[2] * k;
        }
        direct[o] = r; direct[o + 1] = g; direct[o + 2] = b;
        // sky visibility (random rotation per luxel)
        let vis = 0;
        const rot = rand() * Math.PI * 2, cr = Math.cos(rot), srt = Math.sin(rot);
        for (const h of hemi) {
          const hx = h[0] * cr - h[1] * srt, hy = h[0] * srt + h[1] * cr, hz = h[2];
          const dx = b1[0] * hx + b2[0] * hy + n[0] * hz;
          const dy = b1[1] * hx + b2[1] * hy + n[1] * hz;
          const dz = b1[2] * hx + b2[2] * hy + n[2] * hz;
          if (dz < -0.05) continue; // below horizon: ground
          end[0] = start[0] + dx * 6000; end[1] = start[1] + dy * 6000; end[2] = start[2] + dz * 6000;
          world.trace(start, end, ZERO, ZERO, MASK_SHOT, tr);
          if (tr.fraction >= 1) vis++;
        }
        const sv = vis / hemi.length;
        sky[o] = L.skyColor[0] * sv; sky[o + 1] = L.skyColor[1] * sv; sky[o + 2] = L.skyColor[2] * sv;
      }
    }
    done++;
    if (onProgress && (done & 63) === 0) onProgress(0.5 * done / total);
  }

  // ---- pass 2: one bounce of (direct + sky) light
  const out = new Float32Array(W * H * 3);
  const faceIndex = buildFaceIndex(faces);
  done = 0;
  const bounceN = Math.max(8, Math.floor(L.skySamples / 2));
  for (const f of faces) {
    const lm = f.lm;
    const n = f.n;
    const tA = Math.abs(n[2]) < 0.9 ? [0, 0, 1] : [1, 0, 0];
    const b1 = norm(cross(tA, n)), b2 = cross(n, b1);
    for (let j = 0; j < lm.h; j++) {
      for (let i = 0; i < lm.w; i++) {
        const o = ((lm.y + j) * W + (lm.x + i)) * 3;
        let r = 0, g = 0, b = 0;
        if (L.bounce > 0 && !f.brush.fullbright) {
          luxPos(f, i, j, 0, 0, P);
          start[0] = P[0] + n[0] * 0.5; start[1] = P[1] + n[1] * 0.5; start[2] = P[2] + n[2] * 0.5;
          const rot = rand() * Math.PI * 2, cr = Math.cos(rot), srt = Math.sin(rot);
          for (let k = 0; k < bounceN; k++) {
            const h = hemi[(k * 2 + (j & 1)) % hemi.length];
            const hx = h[0] * cr - h[1] * srt, hy = h[0] * srt + h[1] * cr, hz = h[2];
            const dx = b1[0] * hx + b2[0] * hy + n[0] * hz;
            const dy = b1[1] * hx + b2[1] * hy + n[1] * hz;
            const dz = b1[2] * hx + b2[2] * hy + n[2] * hz;
            end[0] = start[0] + dx * 3000; end[1] = start[1] + dy * 3000; end[2] = start[2] + dz * 3000;
            world.trace(start, end, ZERO, ZERO, MASK_SHOT, tr);
            if (tr.fraction >= 1 || !tr.brush) {
              if (dz < 0) { // looking down past the horizon into the void: assume sunlit sand
                r += 0.5; g += 0.42; b += 0.3;
              }
              continue;
            }
            const hit = tr.endpos;
            const hf = faceIndex.find(tr.brush.userData, tr.normal, hit);
            if (!hf) continue;
            const v = sampleFace(hf, hit, direct, sky, W);
            const al = albedo(hf.texName);
            r += v[0] * al[0]; g += v[1] * al[1]; b += v[2] * al[2];
          }
          const k = L.bounce / bounceN;
          r *= k; g *= k; b *= k;
        }
        out[o] = Math.max(L.ambientMin[0], direct[o] + sky[o] + r);
        out[o + 1] = Math.max(L.ambientMin[1], direct[o + 1] + sky[o + 1] + g);
        out[o + 2] = Math.max(L.ambientMin[2], direct[o + 2] + sky[o + 2] + b);
      }
    }
    done++;
    if (onProgress && (done & 63) === 0) onProgress(0.5 + 0.5 * done / total);
  }
  smoothFaces(faces, out, W);
  padBorders(faces, out, W);
  return out;
}

function buildFaceIndex(faces) {
  const byBrush = new Map();
  for (const f of faces) {
    let l = byBrush.get(f.brush);
    if (!l) byBrush.set(f.brush, l = []);
    l.push(f);
  }
  return {
    find(brush, n, p) {
      const l = byBrush.get(brush);
      if (!l) return null;
      let best = null, bestScore = -Infinity;
      for (const f of l) {
        const d = f.n[0] * n[0] + f.n[1] * n[1] + f.n[2] * n[2];
        if (d < 0.99) continue;
        // prefer the piece containing the point
        const s = dot3(p, f.lm.ax.s), t = dot3(p, f.lm.ax.t);
        const inside = pointInPoly(f.lm.st, s, t) ? 1 : 0;
        const score = inside;
        if (score > bestScore) { bestScore = score; best = f; }
      }
      return best;
    },
  };
}

function pointInPoly(st, s, t) {
  let sign = 0;
  for (let i = 0; i < st.length; i++) {
    const a = st[i], b = st[(i + 1) % st.length];
    const c = (b[0] - a[0]) * (t - a[1]) - (b[1] - a[1]) * (s - a[0]);
    if (Math.abs(c) < 1e-6) continue;
    const sg = c > 0 ? 1 : -1;
    if (sign === 0) sign = sg; else if (sg !== sign) return false;
  }
  return true;
}

const _sv = [0, 0, 0];
function sampleFace(f, p, direct, sky, W) {
  const lm = f.lm;
  const s = dot3(p, lm.ax.s) / lm.luxel - lm.s0, t = dot3(p, lm.ax.t) / lm.luxel - lm.t0;
  const i = Math.max(0, Math.min(lm.w - 1, Math.round(s)));
  const j = Math.max(0, Math.min(lm.h - 1, Math.round(t)));
  const o = ((lm.y + j) * W + (lm.x + i)) * 3;
  _sv[0] = direct[o] + sky[o]; _sv[1] = direct[o + 1] + sky[o + 1]; _sv[2] = direct[o + 2] + sky[o + 2];
  return _sv;
}

// light 3x3 blur inside each face rect to hide sampling noise
function smoothFaces(faces, buf, W) {
  for (const f of faces) {
    const lm = f.lm;
    if (lm.w < 2 && lm.h < 2) continue;
    const tmp = new Float32Array(lm.w * lm.h * 3);
    for (let j = 0; j < lm.h; j++) for (let i = 0; i < lm.w; i++) {
      let r = 0, g = 0, b = 0, wsum = 0;
      for (let dj = -1; dj <= 1; dj++) for (let di = -1; di <= 1; di++) {
        const ii = i + di, jj = j + dj;
        if (ii < 0 || jj < 0 || ii >= lm.w || jj >= lm.h) continue;
        const w = (di === 0 && dj === 0) ? 4 : (di === 0 || dj === 0) ? 1 : 0.5;
        const o = ((lm.y + jj) * W + (lm.x + ii)) * 3;
        r += buf[o] * w; g += buf[o + 1] * w; b += buf[o + 2] * w; wsum += w;
      }
      const t = (j * lm.w + i) * 3;
      tmp[t] = r / wsum; tmp[t + 1] = g / wsum; tmp[t + 2] = b / wsum;
    }
    for (let j = 0; j < lm.h; j++) for (let i = 0; i < lm.w; i++) {
      const o = ((lm.y + j) * W + (lm.x + i)) * 3, t = (j * lm.w + i) * 3;
      buf[o] = tmp[t]; buf[o + 1] = tmp[t + 1]; buf[o + 2] = tmp[t + 2];
    }
  }
}

function padBorders(faces, buf, W) {
  for (const f of faces) {
    const lm = f.lm;
    const copy = (dx, dy, sx, sy) => {
      const o = (dy * W + dx) * 3, s = (sy * W + sx) * 3;
      buf[o] = buf[s]; buf[o + 1] = buf[s + 1]; buf[o + 2] = buf[s + 2];
    };
    for (let i = -1; i <= lm.w; i++) {
      const sx = lm.x + Math.max(0, Math.min(lm.w - 1, i));
      copy(lm.x + i, lm.y - 1, sx, lm.y);
      copy(lm.x + i, lm.y + lm.h, sx, lm.y + lm.h - 1);
    }
    for (let j = 0; j < lm.h; j++) {
      copy(lm.x - 1, lm.y + j, lm.x, lm.y + j);
      copy(lm.x + lm.w, lm.y + j, lm.x + lm.w - 1, lm.y + j);
    }
  }
}

// Encode to RGBA8 with 2x headroom (stored = light / 2).
export function encodeLightmap(rgb, W, H) {
  const out = new Uint8Array(W * H * 4);
  for (let i = 0, n = W * H; i < n; i++) {
    out[i * 4] = Math.min(255, Math.round(rgb[i * 3] * 127.5));
    out[i * 4 + 1] = Math.min(255, Math.round(rgb[i * 3 + 1] * 127.5));
    out[i * 4 + 2] = Math.min(255, Math.round(rgb[i * 3 + 2] * 127.5));
    out[i * 4 + 3] = 255;
  }
  return out;
}

// Lightmap UV for a world point on face f (centre-of-luxel convention).
export function lightmapUV(f, v, W, H, out) {
  const lm = f.lm;
  const s = dot3(v, lm.ax.s) / lm.luxel - lm.s0;
  const t = dot3(v, lm.ax.t) / lm.luxel - lm.t0;
  out[0] = (lm.x + s + 0.5) / W;
  out[1] = (lm.y + t + 0.5) / H;
  return out;
}

function norm(v) { const l = Math.hypot(v[0], v[1], v[2]) || 1; v[0] /= l; v[1] /= l; v[2] /= l; return v; }
function cross(a, b) { return [a[1] * b[2] - a[2] * b[1], a[2] * b[0] - a[0] * b[2], a[0] * b[1] - a[1] * b[0]]; }
