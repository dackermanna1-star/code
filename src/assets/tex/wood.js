// Wooden crates, doors, shutters, beams, planks and painted metal.
import { Rng, fbm, sample, mod, clamp, smooth, lambert, castShadow, cavity, makeImg, downsample, finish, soften, F32 } from './core.js';
import { matchMean, partition } from './stone.js';

let grainCache = null;
/** Shared grain fields (streaks run along field-y). */
function grain() {
  if (!grainCache) {
    grainCache = {
      // copied out of the recycling pool: this cache outlives a single texture
      g1: Float32Array.from(fbm(128, 128, { cx: 20, cy: 2, oct: 4, gain: 0.6, seed: 9001 })),
      g2: Float32Array.from(fbm(128, 128, { cx: 48, cy: 4, oct: 2, gain: 0.5, seed: 9002 })),
      g3: Float32Array.from(fbm(128, 128, { cx: 8, cy: 2, oct: 3, gain: 0.5, seed: 9003 })),
    };
  }
  return grainCache;
}

/** Distance-based anti-aliased line stamped into a scalar field (with wrap). */
export function stampLine(f, w, h, x0, y0, x1, y1, r, val, wrap = true) {
  const minx = Math.floor(Math.min(x0, x1) - r - 1), maxx = Math.ceil(Math.max(x0, x1) + r + 1);
  const miny = Math.floor(Math.min(y0, y1) - r - 1), maxy = Math.ceil(Math.max(y0, y1) + r + 1);
  const dx = x1 - x0, dy = y1 - y0, l2 = dx * dx + dy * dy || 1;
  for (let y = miny; y <= maxy; y++)
    for (let x = minx; x <= maxx; x++) {
      if (!wrap && (x < 0 || y < 0 || x >= w || y >= h)) continue;
      const px = x + 0.5, py = y + 0.5;
      const t = clamp(((px - x0) * dx + (py - y0) * dy) / l2, 0, 1);
      const ex = px - x0 - dx * t, ey = py - y0 - dy * t;
      const d = Math.sqrt(ex * ex + ey * ey);
      const a = clamp(r + 0.5 - d, 0, 1);
      if (a <= 0) continue;
      const i = mod(y, h) * w + mod(x, w);
      f[i] = Math.max(f[i], a * val);
    }
}

/**
 * Render a set of overlapping planks (rects or diagonal bars) as a lit relief.
 * Each plank: {x0,y0,x1,y1,vert} or {ax,ay,bx,by,hw}; plus level, col, tone.
 */
function woodScene(W, H, planks, P) {
  const SS = P.ss ?? 2, w = W * SS, h = H * SS, N = w * h;
  const { g1, g2, g3 } = grain();
  const S = P.seed;
  const rng = new Rng(S);
  // normalise every plank into one fixed object shape (keeps property access monomorphic)
  const list = planks.map((q, k) => {
    const bar = q.ax !== undefined;
    let len = 0, dx = 0, dy = 0;
    if (bar) {
      const ex = q.bx - q.ax, ey = q.by - q.ay;
      len = Math.sqrt(ex * ex + ey * ey);
      dx = ex / len;
      dy = ey / len;
    }
    const nk = rng.chance(0.5) ? 1 : 0;
    return {
      idx: k,
      bar,
      x0: bar ? 0 : q.x0,
      y0: bar ? 0 : q.y0,
      x1: bar ? 0 : q.x1,
      y1: bar ? 0 : q.y1,
      vert: !!q.vert,
      ax: bar ? q.ax : 0,
      ay: bar ? q.ay : 0,
      hw: bar ? q.hw : 0,
      len,
      dx,
      dy,
      level: q.level,
      cr: q.col[0],
      cg: q.col[1],
      cb: q.col[2],
      iron: q.mat === 'iron',
      ox: rng.range(0, 128),
      oy: rng.range(0, 128),
      tone: q.tone ?? rng.gauss() * (P.toneVar ?? 0.07),
      knot: nk > 0,
      ka: rng.range(0.15, 0.85),
      kc: rng.range(0.3, 0.7),
      kr: rng.range(1, 1.8),
    };
  });
  const sorted = list.slice().sort((a, b) => b.level - a.level);
  const np = sorted.length;
  const big = fbm(w, h, { cx: 3, oct: 4, gain: 0.6, seed: S + 1 });
  const dirt = fbm(w, h, { cx: 5, oct: 4, gain: 0.6, seed: S + 2 });
  const fine = fbm(w, h, { cx: 32, oct: 2, seed: S + 3 });
  const img = makeImg(w, h);
  const hgt = F32(N);
  const gap = P.gap;
  const gs = P.gscale ?? 1.4, PG = P.grain, PL = P.lines, LV = P.lv, BEV = P.bev, EL = P.edgeLight, GRIME = P.grime;
  for (let y = 0; y < h; y++)
    for (let x = 0; x < w; x++) {
      const i = y * w + x;
      const X = (x + 0.5) / SS, Y = (y + 0.5) / SS;
      let hit = null, along = 0, across = 0, ed = 0, len = 1, wid = 1;
      for (let q = 0; q < np; q++) {
        const p = sorted[q];
        if (!p.bar) {
          if (X >= p.x0 && X < p.x1 && Y >= p.y0 && Y < p.y1) {
            hit = p;
            along = p.vert ? Y - p.y0 : X - p.x0;
            across = p.vert ? X - p.x0 : Y - p.y0;
            len = p.vert ? p.y1 - p.y0 : p.x1 - p.x0;
            wid = p.vert ? p.x1 - p.x0 : p.y1 - p.y0;
            ed = Math.min(X - p.x0, p.x1 - X, Y - p.y0, p.y1 - Y);
            break;
          }
        } else {
          const rx = X - p.ax, ry = Y - p.ay;
          const t = rx * p.dx + ry * p.dy, sv = -rx * p.dy + ry * p.dx;
          const as = sv < 0 ? -sv : sv;
          if (as < p.hw && t >= -p.hw && t <= p.len + p.hw) {
            hit = p;
            along = t;
            across = sv + p.hw;
            len = p.len;
            wid = p.hw * 2;
            ed = p.hw - as;
            break;
          }
        }
      }
      if (!hit) {
        const gf = 0.75 + 0.5 * big[i];
        img.r[i] = gap[0] * gf;
        img.g[i] = gap[1] * gf;
        img.b[i] = gap[2] * gf;
        hgt[i] = -1.2;
        continue;
      }
      if (hit.iron) {
        const rs = smooth(0.55, 0.75, dirt[i]);
        const f = 1 + (fine[i] - 0.5) * 0.35 + (big[i] - 0.5) * 0.2;
        img.r[i] = (hit.cr + rs * 45) * f;
        img.g[i] = (hit.cg + rs * 22) * f;
        img.b[i] = (hit.cb + rs * 5) * f;
        hgt[i] = hit.level * LV + Math.sqrt(smooth(0, 1.2, ed)) * 0.9 + (fine[i] - 0.5) * 0.3;
        continue;
      }
      const fx = across * gs + hit.ox, fy = along * 0.45 + hit.oy;
      const gv = sample(g1, 128, 128, fx, fy);
      const g2v = sample(g2, 128, 128, fx * 1.3, fy * 1.6);
      const g3v = sample(g3, 128, 128, fx * 0.5, fy);
      let f = 1 + hit.tone + (gv - 0.5) * PG + (g2v - 0.5) * PG * 0.6 + (g3v - 0.5) * 0.18;
      f -= smooth(0.58, 0.72, gv) * PL;
      if (hit.knot) {
        const ka = (along - hit.ka * len) / (hit.kr * 1.8), kc = (across - hit.kc * wid) / hit.kr;
        const kd = Math.sqrt(ka * ka + kc * kc);
        if (kd < 1.6) f *= 1 - smooth(1.6, 0.4, kd) * 0.45;
      }
      // weathering: lighter worn edges, grime patches
      f *= 1 + (1 - smooth(0, 1.6, ed)) * EL;
      const gr = smooth(0.55, 0.8, dirt[i]) * GRIME;
      f *= 1 + (big[i] - 0.5) * 0.25;
      let r = hit.cr * f, g = hit.cg * f, b = hit.cb * f;
      // grime goes grey-brown like the reference crates
      const lum = (r + g + b) / 3;
      r += (lum * 0.9 - r) * gr;
      g += (lum * 0.86 - g) * gr;
      b += (lum * 0.74 - b) * gr;
      img.r[i] = r;
      img.g[i] = g;
      img.b[i] = b;
      hgt[i] = hit.level * LV + Math.sqrt(smooth(0, BEV, ed)) * 0.9 + (gv - 0.5) * 0.5 + (g2v - 0.5) * 0.25;
    }
  // nails / studs
  for (const n of P.nails || []) {
    const cx = n[0] * SS, cy = n[1] * SS, r = (n[2] || 0.9) * SS;
    const R = Math.ceil(r + 1);
    for (let y = Math.floor(cy) - R; y <= Math.ceil(cy) + R; y++)
      for (let x = Math.floor(cx) - R; x <= Math.ceil(cx) + R; x++) {
        if (x < 0 || y < 0 || x >= w || y >= h) continue;
        const ddx = x + 0.5 - cx, ddy = y + 0.5 - cy;
        const d = Math.sqrt(ddx * ddx + ddy * ddy) / r;
        if (d >= 1) continue;
        const i = y * w + x;
        const t = smooth(1, 0.75, d);
        const nc = P.nailCol || [70, 62, 52];
        img.r[i] += (nc[0] - img.r[i]) * t;
        img.g[i] += (nc[1] - img.g[i]) * t;
        img.b[i] += (nc[2] - img.b[i]) * t;
        hgt[i] += Math.sqrt(1 - d * d) * (n[3] || 0.8) * t;
      }
  }
  const hs = SS > 1 ? soften(hgt, w, h, 1, false) : hgt;
  const sh = lambert(hs, w, h, ((P.relief ?? 1) / SS) * 1.6, [-0.55, -0.7, 0.55], false);
  const shadow = castShadow(hs, w, h, -1, -1, 4 * SS, 0.5 / SS, 0.5, false);
  const cav = cavity(hs, w, h, 3 * SS, false);
  for (let i = 0; i < N; i++) {
    let s = 0.42 + 0.58 * sh[i];
    s *= 0.55 + 0.45 * shadow[i];
    s *= 1 - clamp(cav[i] * 0.18, 0, 0.3);
    img.r[i] *= s;
    img.g[i] *= s;
    img.b[i] *= s;
  }
  const out = downsample(img, SS);
  if (P.post) P.post(out);
  matchMean(out, P.target);
  finish(out, { grain: P.grainNoise ?? 7, chroma: 3, sharpen: 0.3, seed: S + 7, wrap: false });
  return out;
}

function crateLayout(horizontalInfill, seed) {
  const W = 64, F = 7.5;
  const rng = new Rng(seed);
  const frameCol = [178, 146, 100];
  const braceCol = [172, 140, 94];
  const infillCol = [118, 92, 62];
  const planks = [
    { x0: 0, y0: 0, x1: F, y1: W, vert: true, level: 3, col: frameCol },
    { x0: W - F, y0: 0, x1: W, y1: W, vert: true, level: 3, col: frameCol },
    { x0: F, y0: 0, x1: W - F, y1: F, vert: false, level: 2.9, col: frameCol },
    { x0: F, y0: W - F, x1: W - F, y1: W, vert: false, level: 2.9, col: frameCol },
    { ax: F - 2, ay: F - 2, bx: W - F + 2, by: W - F + 2, hw: 3.6, level: 2, col: braceCol },
    { ax: F - 2, ay: W - F + 2, bx: W - F + 2, by: F - 2, hw: 3.6, level: 1.9, col: braceCol },
  ];
  const widths = partition(W - 2 * F, 6, 9, rng);
  let acc = F;
  for (const pw of widths) {
    if (horizontalInfill) planks.push({ x0: F, y0: acc + 0.45, x1: W - F, y1: acc + pw - 0.45, vert: false, level: 0, col: infillCol });
    else planks.push({ x0: acc + 0.45, y0: F, x1: acc + pw - 0.45, y1: W - F, vert: true, level: 0, col: infillCol });
    acc += pw;
  }
  const nails = [];
  for (const [x, y] of [
    [F / 2, 2.5],
    [F / 2, W - 2.5],
    [W - F / 2, 2.5],
    [W - F / 2, W - 2.5],
    [F / 2, F + 3],
    [W - F / 2, F + 3],
    [F / 2, W - F - 3],
    [W - F / 2, W - F - 3],
    [F + 3.5, F / 2],
    [W - F - 3.5, F / 2],
    [F + 3.5, W - F / 2],
    [W - F - 3.5, W - F / 2],
    [W / 2, W / 2],
  ])
    nails.push([x, y, 0.75, 0.6]);
  return { planks, nails };
}

export function crate() {
  const { planks, nails } = crateLayout(false, 2001);
  return woodScene(64, 64, planks, {
    seed: 2001,
    gap: [46, 34, 22],
    lv: 1.0,
    bev: 1.5,
    grain: 0.42,
    lines: 0.22,
    edgeLight: 0.12,
    grime: 0.45,
    nails,
    ss: 2,
    target: [146, 117, 78],
  });
}

export function crateB() {
  const { planks, nails } = crateLayout(true, 2101);
  for (const p of planks) p.col = p.level > 1 ? [166, 142, 108] : [112, 94, 72];
  return woodScene(64, 64, planks, {
    seed: 2101,
    gap: [40, 34, 26],
    lv: 1.0,
    bev: 1.5,
    grain: 0.42,
    lines: 0.22,
    edgeLight: 0.12,
    grime: 0.55,
    nails,
    ss: 2,
    target: [130, 110, 84],
  });
}

export function door() {
  const W = 128, H = 256, S = 2201;
  const rng = new Rng(S);
  const planks = [];
  const widths = partition(W, 22, 29, rng);
  let acc = 0;
  for (const pw of widths) {
    planks.push({ x0: acc + 0.5, y0: 0, x1: acc + pw - 0.5, y1: H, vert: true, level: 0, col: [146, 126, 100] });
    acc += pw;
  }
  const iron = [74, 68, 62];
  const straps = [
    [30, 42],
    [212, 224],
  ];
  const nails = [];
  for (const [a, b] of straps) {
    planks.push({ x0: 0, y0: a, x1: W, y1: b, vert: false, level: 2, col: iron, mat: 'iron' });
    acc = 0;
    for (const pw of widths) {
      nails.push([acc + pw / 2, (a + b) / 2, 2.4, 1.2]);
      acc += pw;
    }
  }
  acc = 0;
  for (const pw of widths) {
    nails.push([acc + pw / 2, 128, 1.8, 1]);
    nails.push([acc + pw / 2, 8, 1.4, 0.8]);
    nails.push([acc + pw / 2, 248, 1.4, 0.8]);
    acc += pw;
  }
  return woodScene(W, H, planks, {
    seed: S,
    gap: [38, 32, 26],
    lv: 1.2,
    bev: 1.8,
    grain: 0.45,
    lines: 0.25,
    edgeLight: 0.08,
    grime: 0.5,
    nails,
    nailCol: [62, 56, 50],
    gscale: 1.1,
    ss: 1,
    target: [128, 110, 88],
  });
}

export function shutter() {
  const W = 64, H = 128, S = 2301;
  const rng = new Rng(S);
  const planks = [];
  const widths = partition(W, 14, 18, rng);
  const wood = [134, 114, 92];
  let acc = 0;
  for (const pw of widths) {
    planks.push({ x0: acc + 0.4, y0: 0, x1: acc + pw - 0.4, y1: H, vert: true, level: 0, col: wood });
    acc += pw;
  }
  // horizontal battens (kept below the arch so they survive the arched frame)
  planks.push({ x0: 0, y0: 30, x1: W, y1: 38, vert: false, level: 1.2, col: [138, 118, 96] });
  planks.push({ x0: 0, y0: 98, x1: W, y1: 106, vert: false, level: 1.2, col: [138, 118, 96] });
  const nails = [];
  acc = 0;
  for (const pw of widths) {
    nails.push([acc + pw / 2, 34, 0.8, 0.6]);
    nails.push([acc + pw / 2, 102, 0.8, 0.6]);
    acc += pw;
  }
  return woodScene(W, H, planks, {
    seed: S,
    gap: [70, 60, 50],
    lv: 1.0,
    bev: 1.4,
    grain: 0.3,
    lines: 0.12,
    edgeLight: 0.1,
    grime: 0.6,
    nails,
    nailCol: [78, 70, 62],
    gscale: 1.2,
    target: [120, 100, 78],
  });
}

// ------------------------------------------------------------------ tileable wood

export function woodBeam() {
  const W = 64, H = 64, N = W * H, S = 2401;
  const rng = new Rng(S);
  const g1 = fbm(W, H, { cx: 2, cy: 14, oct: 4, gain: 0.6, seed: S + 1 });
  const g2 = fbm(W, H, { cx: 4, cy: 32, oct: 2, seed: S + 2 });
  const big = fbm(W, H, { cx: 2, oct: 4, gain: 0.6, seed: S + 5 });
  const fine = fbm(W, H, { cx: 32, oct: 2, seed: S + 6 });
  // long drying checks running along the grain
  const chk = F32(N);
  for (let k = 0; k < 7; k++) {
    let x = rng.range(0, W), y = rng.range(0, H);
    const l = rng.range(14, 40), wob = rng.range(-0.08, 0.08);
    for (let t = 0; t < l; t += 1) {
      const x1 = x + 1, y1 = y + wob + rng.range(-0.15, 0.15);
      stampLine(chk, W, H, x, y, x1, y1, 0.35 * Math.sin((t / l) * Math.PI) + 0.1, 1);
      x = x1;
      y = y1;
    }
  }
  const img = makeImg(W, H);
  const hgt = F32(N);
  const c = [114, 86, 60];
  for (let i = 0; i < N; i++) {
    const ck = chk[i];
    let f = 1 + (g1[i] - 0.5) * 0.45 + (g2[i] - 0.5) * 0.2 + (big[i] - 0.5) * 0.25 + (fine[i] - 0.5) * 0.06;
    f -= smooth(0.58, 0.72, g1[i]) * 0.22;
    f *= 1 - ck * 0.65;
    const wth = smooth(0.45, 0.8, big[i]) * 0.35;
    let r = c[0] * f, g = c[1] * f, b = c[2] * f;
    const lum = (r + g + b) / 3;
    r += (lum * 1.02 - r) * wth;
    g += (lum - g) * wth;
    b += (lum * 0.92 - b) * wth;
    img.r[i] = r;
    img.g[i] = g;
    img.b[i] = b;
    hgt[i] = (g1[i] - 0.5) * 1.2 + (g2[i] - 0.5) * 0.5 - ck * 1.4;
  }
  const sh = lambert(hgt, W, H, 1, [-0.4, -0.8, 0.6]);
  for (let i = 0; i < N; i++) {
    const s = 0.45 + 0.55 * sh[i];
    img.r[i] *= s;
    img.g[i] *= s;
    img.b[i] *= s;
  }
  matchMean(img, [100, 76, 54]);
  finish(img, { grain: 5, chroma: 2, sharpen: 0.3, soft: 0.2, seed: S });
  return img;
}

export function woodPlanks() {
  const W = 128, H = 128, N = W * H, S = 2501, BH = 16;
  const rng = new Rng(S);
  const g1 = fbm(W, H, { cx: 2, cy: 24, oct: 4, gain: 0.6, seed: S + 1 });
  const g2 = fbm(W, H, { cx: 4, cy: 48, oct: 2, seed: S + 2 });
  const big = fbm(W, H, { cx: 3, oct: 4, gain: 0.6, seed: S + 3 });
  const dirt = fbm(W, H, { cx: 6, oct: 3, seed: S + 4 });
  const boards = [];
  for (let b = 0; b < H / BH; b++) {
    const nj = rng.int(1, 2);
    const joints = [];
    const start = rng.range(0, W);
    for (let k = 0; k < nj; k++) joints.push(mod(start + (k * W) / nj + rng.range(-12, 12), W));
    joints.sort((p, q) => p - q);
    boards.push({ joints, tones: joints.map(() => rng.gauss() * 0.11), offs: joints.map(() => rng.range(0, H)) });
  }
  const img = makeImg(W, H);
  const hgt = F32(N);
  const c = [140, 110, 78];
  const nailF = F32(N);
  for (let y = 0; y < H; y++)
    for (let x = 0; x < W; x++) {
      const i = y * W + x;
      const bi = Math.floor(y / BH), v = y + 0.5 - bi * BH;
      const bd = boards[bi];
      // which segment between joints (wrapping)
      let seg = bd.joints.length - 1;
      for (let k = 0; k < bd.joints.length; k++) if (x + 0.5 >= bd.joints[k]) seg = k;
      const j0 = bd.joints[seg];
      let jd = Infinity;
      for (const j of bd.joints) {
        const d = Math.abs(x + 0.5 - j);
        jd = Math.min(jd, d, W - d);
      }
      const ed = Math.min(v, BH - v, jd);
      const gy = mod(v + bd.offs[seg], H);
      const gv = sample(g1, W, H, x + 0.5, gy), g2v = sample(g2, W, H, x + 0.5, gy);
      let f = 1 + bd.tones[seg] + (gv - 0.5) * 0.45 + (g2v - 0.5) * 0.25 + (big[i] - 0.5) * 0.2;
      f -= smooth(0.6, 0.74, gv) * 0.2;
      const gapT = smooth(0.3, 1.1, ed);
      const gr = smooth(0.45, 0.8, dirt[i]) * 0.45;
      let r = c[0] * f, g = c[1] * f, b = c[2] * f;
      const lum = (r + g + b) / 3;
      r += (lum * 0.95 - r) * gr;
      g += (lum * 0.88 - g) * gr;
      b += (lum * 0.74 - b) * gr;
      img.r[i] = 40 + (r - 40) * gapT;
      img.g[i] = 30 + (g - 30) * gapT;
      img.b[i] = 20 + (b - 20) * gapT;
      hgt[i] = Math.sqrt(smooth(0, 1.6, ed)) * 1.2 + (gv - 0.5) * 0.5;
      // nails near joints
      const nx = Math.abs(x + 0.5 - j0) < W / 2 ? j0 : j0;
      const nxd = mod(x + 0.5 - nx - 3 + W / 2, W) - W / 2;
      const nd1 = Math.sqrt(nxd * nxd + (v - 4) * (v - 4));
      const nd2 = Math.sqrt(nxd * nxd + (v - 12) * (v - 12));
      const nd = Math.min(nd1, nd2);
      if (nd < 1) nailF[i] = 1 - nd;
    }
  for (let i = 0; i < N; i++)
    if (nailF[i] > 0) {
      const t = smooth(0, 0.4, nailF[i]);
      img.r[i] += (60 - img.r[i]) * t;
      img.g[i] += (54 - img.g[i]) * t;
      img.b[i] += (48 - img.b[i]) * t;
      hgt[i] += nailF[i] * 0.6;
    }
  const sh = lambert(hgt, W, H, 1, [-0.45, -0.75, 0.6]);
  for (let i = 0; i < N; i++) {
    const s = 0.45 + 0.55 * sh[i];
    img.r[i] *= s;
    img.g[i] *= s;
    img.b[i] *= s;
  }
  matchMean(img, [128, 102, 72]);
  finish(img, { grain: 6, chroma: 3, sharpen: 0.3, seed: S });
  return img;
}

// ------------------------------------------------------------------ metal

export function metal() {
  const W = 64, H = 64, N = W * H, S = 2601;
  const rng = new Rng(S);
  const big = fbm(W, H, { cx: 2, oct: 4, gain: 0.6, seed: S + 1 });
  const mid = fbm(W, H, { cx: 8, oct: 3, seed: S + 2 });
  const fine = fbm(W, H, { cx: 32, oct: 2, seed: S + 3 });
  const rust = fbm(W, H, { cx: 4, oct: 4, gain: 0.65, seed: S + 4 });
  const scr = F32(N);
  for (let k = 0; k < 22; k++) {
    const x = rng.range(0, W), y = rng.range(0, H), a = rng.range(0, Math.PI), l = rng.range(3, 12);
    stampLine(scr, W, H, x, y, x + Math.cos(a) * l, y + Math.sin(a) * l, 0.25, rng.range(0.4, 1));
  }
  const img = makeImg(W, H);
  const hgt = F32(N);
  const c = [122, 128, 110];
  for (let i = 0; i < N; i++) {
    let f = 1 + (big[i] - 0.5) * 0.18 + (mid[i] - 0.5) * 0.1 + (fine[i] - 0.5) * 0.08;
    const rs = smooth(0.66, 0.8, rust[i]);
    let r = c[0] * f, g = c[1] * f, b = c[2] * f;
    r += (128 * f - r) * rs;
    g += (88 * f - g) * rs;
    b += (60 * f - b) * rs;
    r += scr[i] * 40;
    g += scr[i] * 40;
    b += scr[i] * 36;
    img.r[i] = r;
    img.g[i] = g;
    img.b[i] = b;
    hgt[i] = (mid[i] - 0.5) * 0.6 + rs * 0.3 - scr[i] * 0.2;
  }
  const sh = lambert(hgt, W, H, 1, [-0.45, -0.75, 0.6]);
  for (let i = 0; i < N; i++) {
    const s = 0.5 + 0.5 * sh[i];
    img.r[i] *= s;
    img.g[i] *= s;
    img.b[i] *= s;
  }
  matchMean(img, [118, 122, 106]);
  finish(img, { grain: 5, chroma: 2, sharpen: 0.2, seed: S });
  return img;
}

export function crateGreen() {
  const W = 64, H = 64, SS = 2, w = W * SS, h = H * SS, N = w * h, S = 2701;
  const rng = new Rng(S);
  const big = fbm(w, h, { cx: 3, oct: 4, gain: 0.6, seed: S + 1 });
  const mid = fbm(w, h, { cx: 10, oct: 3, seed: S + 2 });
  const fine = fbm(w, h, { cx: 48, oct: 2, seed: S + 3 });
  const chip = fbm(w, h, { cx: 14, oct: 3, gain: 0.6, seed: S + 4 });
  const scr = F32(N);
  for (let k = 0; k < 30; k++) {
    const x = rng.range(4, w - 4), y = rng.range(4, h - 4), a = rng.range(0, Math.PI), l = rng.range(4, 18);
    stampLine(scr, w, h, x, y, x + Math.cos(a) * l, y + Math.sin(a) * l, 0.35, rng.range(0.3, 0.8), false);
  }
  const img = makeImg(w, h);
  const hgt = F32(N);
  const green = [142, 152, 110], dark = [102, 112, 82], yellow = [214, 172, 48], black = [40, 38, 32];
  const ribs = [12, 24, 40, 52];
  const latches = [18, 46];
  for (let y = 0; y < h; y++)
    for (let x = 0; x < w; x++) {
      const i = y * w + x;
      const X = (x + 0.5) / SS, Y = (y + 0.5) / SS;
      let col = green, ht = 0, paint = 1;
      const rim = Math.min(X, W - X, Y);
      if (Y > 57.5) {
        // dark bottom skid rail
        col = [70, 74, 62];
        ht = 1.6 * Math.sqrt(smooth(57.5, 59, Y));
        paint = 0.6;
      } else if (Y > 47.5) {
        // hazard stripe band
        const st = mod(X + Y, 9) < 4.5;
        col = st ? yellow : black;
        ht = 0.6 * Math.sqrt(smooth(47.5, 48.6, Y) * smooth(57.5, 56.5, Y));
      } else {
        if (rim < 2.6) {
          col = dark;
          ht = 1.2 * Math.sqrt(smooth(0, 1, rim)) * smooth(2.6, 2, rim) + 0.6;
        }
        // horizontal lid seam
        if (Math.abs(Y - 5.5) < 0.6) ht -= 0.6;
        for (const rx of ribs) {
          const d = Math.abs(X - rx);
          if (d < 1.6 && Y > 6.5) ht = Math.max(ht, 1.0 * Math.sqrt(1 - (d / 1.6) ** 2));
        }
        for (const lx of latches) {
          // carry handle: an iron rod bent into an arch, with two base plates
          const dx = X - lx, cy = 11;
          const dd = Y < cy ? Math.abs(Math.sqrt(dx * dx + (Y - cy) * (Y - cy)) - 3.4) : Y < 13.6 ? Math.abs(Math.abs(dx) - 3.4) : 9;
          if (dd < 0.85) {
            col = [70, 74, 60];
            ht = Math.max(ht, 1.2 + 0.6 * Math.sqrt(1 - (dd / 0.85) ** 2));
          }
          if (Y > 12.8 && Y < 15.2 && Math.abs(Math.abs(dx) - 3.4) < 1.6) {
            col = dark;
            ht = Math.max(ht, 1.0);
          }
        }
      }
      let f = 1 + (big[i] - 0.5) * 0.18 + (mid[i] - 0.5) * 0.1 + (fine[i] - 0.5) * 0.1;
      // paint chips show dark primer / bare metal
      const ch = smooth(0.76, 0.8, chip[i] + (1 - smooth(0, 4, rim)) * 0.12) * paint;
      let r = col[0] * f, g = col[1] * f, b = col[2] * f;
      r += (72 - r) * ch * 0.8;
      g += (66 - g) * ch * 0.8;
      b += (54 - b) * ch * 0.8;
      r += scr[i] * 50;
      g += scr[i] * 50;
      b += scr[i] * 40;
      // dust settles on the lower part
      const du = smooth(30, 64, Y) * 0.25 * (0.6 + 0.8 * big[i]);
      r += (176 - r) * du;
      g += (152 - g) * du;
      b += (110 - b) * du;
      img.r[i] = r;
      img.g[i] = g;
      img.b[i] = b;
      hgt[i] = ht + (mid[i] - 0.5) * 0.25 - ch * 0.15;
    }
  const sh = lambert(hgt, w, h, 0.9, [-0.55, -0.7, 0.55], false);
  const shadow = castShadow(hgt, w, h, -1, -1, 6, 0.25, 0.4, false);
  for (let i = 0; i < N; i++) {
    let s = 0.45 + 0.55 * sh[i];
    s *= 0.6 + 0.4 * shadow[i];
    img.r[i] *= s;
    img.g[i] *= s;
    img.b[i] *= s;
  }
  const out = downsample(img, SS);
  matchMean(out, [136, 142, 104], 0.6);
  finish(out, { grain: 6, chroma: 2, sharpen: 0.3, seed: S, wrap: false });
  return out;
}

