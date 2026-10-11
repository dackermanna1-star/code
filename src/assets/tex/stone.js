// Sandstone walls, carved trims and plaster.
import {
  Rng, fbm, mod, clamp, smooth, lambert, cavity, castShadow, makeImg, downsample, finish, F32,
} from './core.js';

/** Sunlight direction used for all baked relief: from above, slightly left. */
export const LIGHT = [-0.42, -0.82, 0.62];

/** Split `total` into integer runs in [min,max] (last run may stretch a bit). */
export function partition(total, min, max, rng) {
  const out = [];
  let rem = total;
  while (rem > 0) {
    if (rem <= max) {
      if (rem >= min || out.length === 0) out.push(rem);
      else out[out.length - 1] += rem;
      break;
    }
    let h = rng.int(min, max);
    if (rem - h < min) {
      if (rem - min < min) {
        // cannot split into two legal runs: one slightly oversized run
        out.push(rem);
        break;
      }
      h = rem - min;
    }
    out.push(h);
    rem -= h;
  }
  // shuffle so the stretched run is not always last
  for (let i = out.length - 1; i > 0; i--) {
    const j = Math.floor(rng.next() * (i + 1));
    [out[i], out[j]] = [out[j], out[i]];
  }
  return out;
}

/** Scale channels so the image mean hits `target` [r,g,b]. */
export function matchMean(img, target, amt = 1) {
  const n = img.w * img.h;
  for (const [c, t] of [['r', target[0]], ['g', target[1]], ['b', target[2]]]) {
    let s = 0;
    const a = img[c];
    for (let i = 0; i < n; i++) s += a[i];
    const m = s / n;
    const k = 1 + (t / Math.max(1, m) - 1) * amt;
    for (let i = 0; i < n; i++) a[i] *= k;
  }
  return img;
}

// ------------------------------------------------------------------ masonry

/**
 * Generic coursed-ashlar wall. Blocks are laid in courses with staggered
 * joints, then rendered as a height field (bevelled, chipped, pitted) and lit
 * from above, on top of a mottled photo-like albedo.
 */
export function masonry(W, H, P) {
  const rng = new Rng(P.seed);
  const S = P.seed * 31;
  // ---- layout
  const courseHs = partition(H, P.courseMin, P.courseMax, rng);
  const courses = [];
  let y0 = 0, prevJoints = null, firstJoints = null;
  courseHs.forEach((ch, ci) => {
    const widths = partition(W, P.blockMin, P.blockMax, rng);
    let best = null, bestScore = -1;
    for (let t = 0; t < 16; t++) {
      const off = rng.int(0, W - 1);
      const joints = [];
      let acc = 0;
      for (const bw of widths) {
        joints.push(mod(off + acc, W));
        acc += bw;
      }
      let sc = Infinity;
      const cmp = [prevJoints, ci === courseHs.length - 1 ? firstJoints : null];
      for (const pj of cmp) {
        if (!pj) continue;
        for (const j of joints)
          for (const q of pj) {
            const d = Math.abs(j - q);
            sc = Math.min(sc, d, W - d);
          }
      }
      if (sc > bestScore) {
        bestScore = sc;
        best = { off, joints };
      }
      if (sc >= P.blockMin * 0.35) break;
    }
    const blocks = [];
    let acc = 0;
    const col = new Int16Array(W);
    widths.forEach((bw, bi) => {
      blocks.push({
        x0: acc,
        w: bw,
        tone: rng.gauss() * P.tone,
        tint: P.tints[Math.floor(rng.next() * P.tints.length)],
        lift: rng.gauss() * 0.25,
        tilt: rng.gauss() * 0.15,
        dirt: rng.next(),
        por: rng.next(),
      });
      for (let x = acc; x < acc + bw; x++) col[x] = bi;
      acc += bw;
    });
    courses.push({ y0, h: ch, off: best.off, blocks, col });
    if (!firstJoints) firstJoints = best.joints;
    prevJoints = best.joints;
    y0 += ch;
  });
  const rowCourse = new Int16Array(H);
  courses.forEach((c, i) => {
    for (let y = c.y0; y < c.y0 + c.h; y++) rowCourse[y] = i;
  });

  // ---- noise fields
  const N = W * H;
  const k = W / 128; // scale factor for cell counts
  const warpF = fbm(W, H, { cx: 6 * k, oct: 3, seed: S + 1 });
  const chip = fbm(W, H, { cx: 14 * k, oct: 3, gain: 0.6, seed: S + 3 });
  const big = fbm(W, H, { cx: 3 * k, oct: 4, gain: 0.55, seed: S + 5 });
  // stone surface fields are sampled with a per-block offset so every block
  // has its own texture (they were cut from different parts of the quarry)
  const mid = fbm(W, H, { cx: 8 * k, oct: 3, gain: 0.55, seed: S + 6 });
  const det = fbm(W, H, { cx: 32 * k, oct: 2, gain: 0.6, seed: S + 7 });
  const blot = fbm(W, H, { cx: 10 * k, oct: 3, gain: 0.6, seed: S + 8 });
  const strata = fbm(W, H, { cx: 2 * k, cy: 22 * k, oct: 3, gain: 0.6, seed: S + 10 });
  const streak = fbm(W, H, { cx: 24 * k, cy: 3 * k, oct: 2, seed: S + 12 });
  for (const c of courses)
    for (const b of c.blocks) {
      b.ox = rng.int(0, W - 1);
      b.oy = rng.int(0, H - 1);
    }
  const sx2 = W >> 1, sy3 = Math.round(H / 3), sx5 = Math.round(W / 5), sy2 = H >> 1;
  // pits: randomly scattered (Poisson-like) and clustered where the stone is porous
  const pitMap = F32(N);
  const prng = new Rng(S + 9);
  const want = Math.round((N / 16384) * P.pits);
  for (let n = 0, tries = 0; n < want && tries < want * 20; tries++) {
    const px = prng.range(0, W), py = prng.range(0, H);
    const pi = Math.floor(py) * W + Math.floor(px);
    if (prng.next() > smooth(0.35, 0.75, blot[pi] * 0.6 + big[pi] * 0.4)) continue;
    n++;
    const r = prng.next() < 0.85 ? prng.range(0.45, 0.9) : prng.range(1.0, 1.9);
    const R = Math.ceil(r + 1);
    for (let dy = -R; dy <= R; dy++)
      for (let dx = -R; dx <= R; dx++) {
        const qx = Math.floor(px) + dx + 0.5 - px, qy = Math.floor(py) + dy + 0.5 - py;
        const d = Math.sqrt(qx * qx + qy * qy);
        const a = clamp(r + 0.5 - d, 0, 1);
        const j = mod(Math.floor(py) + dy, H) * W + mod(Math.floor(px) + dx, W);
        if (a > pitMap[j]) pitMap[j] = a;
      }
  }

  const height = F32(N);
  const img = makeImg(W, H);
  const [br, bg, bb] = P.base;
  const [mr, mg, mb] = P.mortar;
  const warp = P.warp * 2;
  for (let y = 0; y < H; y++) {
    const yw = ((y + sy3) % H) * W, yh = ((y + sy2) % H) * W;
    for (let x = 0; x < W; x++) {
      const i = y * W + x;
      const X = x + 0.5 + (warpF[i] - 0.5) * warp;
      const Y = mod(y + 0.5 + (warpF[yw + ((x + sx2) % W)] - 0.5) * warp, H);
      const course = courses[rowCourse[Math.min(H - 1, Math.floor(Y))]];
      const v = Y - course.y0;
      const xc = mod(X - course.off, W);
      const blk = course.blocks[course.col[Math.min(W - 1, Math.floor(xc))]];
      const u = xc - blk.x0;
      const j = ((y + blk.oy) % H) * W + ((x + blk.ox) % W);
      // rounded-rectangle SDF (negative inside)
      const hw = blk.w / 2, hh = course.h / 2, rc = P.corner;
      const qx = Math.abs(u - hw) - (hw - rc), qy = Math.abs(v - hh) - (hh - rc);
      const mx = qx > 0 ? qx : 0, my = qy > 0 ? qy : 0;
      let sdf = Math.sqrt(mx * mx + my * my) + Math.min(Math.max(qx, qy), 0) - rc;
      sdf += (chip[i] - 0.5) * P.chip + (det[j] - 0.5) * P.chip * 0.5;
      const inside = -sdf - P.joint;
      const stoneT = smooth(-0.5, 0.5, inside);
      const bev = smooth(-0.3, P.bevel, inside);
      const pd = pitMap[i] * stoneT * (0.5 + blk.por);
      height[i] =
        stoneT * (P.depth * Math.sqrt(bev) + blk.lift + blk.tilt * (v / course.h - 0.5)) +
        (mid[j] - 0.5) * P.surf + (det[j] - 0.5) * P.surf * 0.5 + (strata[j] - 0.5) * P.surf * 0.5 - pd * P.pitDepth;
      // albedo
      let f = 1 + blk.tone;
      f *= 1 + (big[i] - 0.5) * P.bigAmp;
      f *= 1 + (mid[j] - 0.5) * P.midAmp;
      f *= 1 + (det[j] - 0.5) * P.detAmp;
      f *= 1 + (strata[j] - 0.5) * P.strata;
      f *= 1 - pd * P.pitDark;
      f *= 1 - Math.max(0, streak[i] - 0.55) * P.streak;
      // soft grey-brown weathered patches
      const bl = smooth(P.blotThr, P.blotThr + 0.3, blot[j] + (blk.dirt - 0.5) * 0.15);
      f *= 1 - bl * P.blot;
      // grime gathering towards block edges and under each block
      f *= 1 - (1 - smooth(0, 3, inside)) * P.edgeDirt;
      f *= 1 - smooth(0.6, 1, v / course.h) * P.bottomDirt * blk.dirt;
      const t = blk.tint;
      const h1 = (big[yh + ((x + sx5) % W)] - 0.5) * P.hue;
      const sr = br * f * t[0] * (1 + h1), sg = bg * f * t[1], sb = bb * f * t[2] * (1 - h1 * 1.3);
      const grey = bl * P.blotGrey;
      const lum = (sr + sg + sb) / 3;
      const r0 = sr + (lum * 1.02 - sr) * grey, g0 = sg + (lum - sg) * grey, b0 = sb + (lum * 0.94 - sb) * grey;
      const mf = 1 + (det[i] - 0.5) * 0.3 + (mid[i] - 0.5) * 0.3;
      img.r[i] = mr * mf + (r0 - mr * mf) * stoneT;
      img.g[i] = mg * mf + (g0 - mg * mf) * stoneT;
      img.b[i] = mb * mf + (b0 - mb * mf) * stoneT;
    }
  }
  // ---- lighting
  const sh = lambert(height, W, H, P.light, LIGHT);
  const cav = cavity(height, W, H, 2);
  const shadow = P.cast ? castShadow(height, W, H, -0.45, -1, 3, 0.6, 1.2) : null;
  for (let i = 0; i < N; i++) {
    let s = P.amb + (1 - P.amb) * sh[i];
    s *= 1 - clamp(cav[i] * P.ao, 0, 0.5);
    if (shadow) s *= 1 - (1 - shadow[i]) * P.cast;
    img.r[i] *= s;
    img.g[i] *= s;
    img.b[i] *= s;
  }
  matchMean(img, P.target);
  finish(img, { grain: P.grain, chroma: P.grain * 0.5, sharpen: P.sharpen, soft: P.soft, seed: S + 99 });
  return img;
}

const TINTS_DUST = [
  [1, 1, 1],
  [1.03, 1.0, 0.94],
  [0.99, 0.99, 1.01],
  [1.05, 0.99, 0.88],
  [0.98, 0.98, 0.98],
  [1.02, 1.0, 0.95],
  [1.04, 0.98, 0.9],
];

const WALL_BASE = {
  tints: TINTS_DUST,
  tone: 0.085,
  hue: 0.1,
  joint: 0.35,
  pits: 140,
  pitDepth: 0.8,
  pitDark: 0.35,
  bigAmp: 0.18,
  midAmp: 0.22,
  detAmp: 0.22,
  strata: 0.1,
  streak: 0.22,
  blot: 0.22,
  blotGrey: 0.28,
  blotThr: 0.5,
  edgeDirt: 0.1,
  bottomDirt: 0.1,
  light: 0.4,
  amb: 0.45,
  ao: 0.12,
  cast: 0.25,
  grain: 8,
  sharpen: 0.25,
  soft: 0.35,
};

export function wallStone() {
  return masonry(128, 128, {
    ...WALL_BASE,
    seed: 11,
    courseMin: 14,
    courseMax: 22,
    blockMin: 24,
    blockMax: 60,
    base: [200, 178, 136],
    mortar: [128, 108, 80],
    target: [200, 176, 130],
    warp: 0.8,
    corner: 2,
    chip: 2.2,
    bevel: 1.8,
    depth: 1.3,
    surf: 1.2,
  });
}

export function wallStoneBig() {
  return masonry(256, 256, {
    ...WALL_BASE,
    seed: 23,
    courseMin: 26,
    courseMax: 44,
    blockMin: 48,
    blockMax: 116,
    base: [204, 182, 138],
    mortar: [124, 104, 76],
    target: [200, 176, 130],
    warp: 2,
    corner: 3.5,
    chip: 4,
    joint: 0.5,
    bevel: 3,
    depth: 2,
    surf: 2,
    light: 0.38,
    bottomDirt: 0.14,
  });
}

export function wallTunnel() {
  return masonry(128, 128, {
    ...WALL_BASE,
    seed: 37,
    courseMin: 14,
    courseMax: 22,
    blockMin: 24,
    blockMax: 56,
    base: [178, 165, 140],
    mortar: [108, 98, 82],
    target: [168, 156, 132],
    tints: [
      [1, 1, 1],
      [1.02, 1.0, 0.97],
      [0.98, 0.98, 1.01],
      [1.0, 0.99, 0.98],
    ],
    hue: 0.05,
    warp: 0.8,
    corner: 2,
    chip: 2,
    bevel: 1.8,
    depth: 1.2,
    surf: 1.1,
    streak: 0.3,
    blot: 0.25,
    edgeDirt: 0.14,
    bottomDirt: 0.16,
    grain: 8,
  });
}

// ------------------------------------------------------------------ carving helpers

/** Distance from p to segment a-b. */
function segDist(px, py, ax, ay, bx, by) {
  const dx = bx - ax, dy = by - ay;
  const t = clamp(((px - ax) * dx + (py - ay) * dy) / (dx * dx + dy * dy), 0, 1);
  const ex = px - ax - dx * t, ey = py - ay - dy * t;
  return Math.sqrt(ex * ex + ey * ey);
}
/** Cylindrical rib profile for distance d and half-width r. */
const rib = (d, r) => (d >= r ? 0 : Math.sqrt(1 - (d / r) * (d / r)));
/** Dome profile for an ellipse. */
function dome(px, py, cx, cy, rx, ry) {
  const q = ((px - cx) / rx) ** 2 + ((py - cy) / ry) ** 2;
  return q >= 1 ? 0 : Math.sqrt(1 - q);
}
/** Flat band with rounded edges between y0 and y1 (open edges if y0/y1 are null). */
function band(y, y0, y1, r) {
  const d = Math.min(y0 == null ? Infinity : y - y0, y1 == null ? Infinity : y1 - y);
  if (d <= 0) return 0;
  const t = Math.min(1, d / r);
  return Math.sqrt(1 - (1 - t) * (1 - t));
}

/** Signed distance to triangle a,b,c (negative inside). */
function triSdf(px, py, ax, ay, bx, by, cx, cy) {
  const d = Math.min(segDist(px, py, ax, ay, bx, by), segDist(px, py, bx, by, cx, cy), segDist(px, py, cx, cy, ax, ay));
  const s1 = (bx - ax) * (py - ay) - (by - ay) * (px - ax);
  const s2 = (cx - bx) * (py - by) - (cy - by) * (px - bx);
  const s3 = (ax - cx) * (py - cy) - (ay - cy) * (px - cx);
  const inside = (s1 >= 0 && s2 >= 0 && s3 >= 0) || (s1 <= 0 && s2 <= 0 && s3 <= 0);
  return inside ? -d : d;
}

/**
 * Render a carved relief: heightFn(x,y) in texel coordinates -> [0..~1].
 * Lit from the top-left, deep recesses darkened, light sandstone albedo.
 */
function carve(W, H, heightFn, P) {
  const SS = 3, w = W * SS, h = H * SS;
  const N = w * h;
  const hf = F32(N);
  // the relief is periodic along x: evaluate one (pixel-exact) period and copy
  let pcols = w;
  if (P.period) {
    for (let m = 1; m * P.period * SS <= w; m++) {
      const c = m * P.period * SS;
      if (Math.abs(c - Math.round(c)) < 1e-6) {
        pcols = Math.round(c);
        break;
      }
    }
  }
  for (let y = 0; y < h; y++)
    for (let x = 0; x < w; x++) hf[y * w + x] = x < pcols ? heightFn((x + 0.5) / SS, (y + 0.5) / SS) : hf[y * w + x - pcols];
  const S = P.seed;
  const ry = Math.max(1, Math.round(H / W * 16));
  // surface erosion: carvings are worn and pitted
  const ero = fbm(w, h, { cx: 16, cy: ry, oct: 4, gain: 0.6, seed: S + 1 });
  const ero2 = fbm(w, h, { cx: 64, cy: ry * 4, oct: 2, seed: S + 2 });
  for (let i = 0; i < N; i++) hf[i] += (ero[i] - 0.5) * P.erode + (ero2[i] - 0.5) * P.erode * 0.7;
  const sh = lambert(hf, w, h, P.depth * SS, [-0.55, -0.8, 0.6]);
  const shadow = castShadow(hf, w, h, -0.7, -1, 4 * SS, 0.3 / P.depth, 0.3);
  const cav = cavity(hf, w, h, 2 * SS);
  const big = fbm(w, h, { cx: 6, cy: Math.max(1, Math.round(ry / 2)), oct: 4, gain: 0.55, seed: S + 3 });
  const stain = fbm(w, h, { cx: 12, cy: Math.max(1, Math.round(ry * 0.75)), oct: 3, gain: 0.6, seed: S + 4 });
  const img = makeImg(w, h);
  const [br, bg, bb] = P.base;
  for (let i = 0; i < N; i++) {
    const hv = hf[i];
    // recess darkness: low areas are shadowed and dirty
    const depthDark = 0.5 + 0.5 * smooth(-0.05, 0.6, hv);
    let s = P.amb + (1 - P.amb) * sh[i];
    s *= 1 - (1 - shadow[i]) * 0.4;
    s *= depthDark;
    s *= 1 - clamp(cav[i] * 0.8, 0, 0.3);
    const f = 1 + (big[i] - 0.5) * 0.3 + (ero2[i] - 0.5) * 0.22;
    // rusty-brown weathering stains
    const st = smooth(0.62, 0.8, stain[i]);
    const r = br * f * (1 - st * 0.12), g = bg * f * (1 - st * 0.2), b = bb * f * (1 - st * 0.3);
    img.r[i] = r * s;
    img.g[i] = g * s;
    img.b[i] = b * s;
  }
  const out = downsample(img, SS);
  matchMean(out, P.target);
  finish(out, { grain: P.grain, chroma: P.grain * 0.4, sharpen: 0.2, soft: 0.2, seed: S + 9 });
  return out;
}

/** Carved recess: full height outside, falling to 0 inside sdf<0. */
const recess = (d, top) => top * smooth(-0.75, 0.35, d);

export function trimBand() {
  const PA = 8; // 16 slender arches per 128 units
  const PL = 16; // 8 dogtooth repeats per 128 units
  const heightFn = (x, y) => {
    // top fillet + groove
    if (y < 3.3) return band(y, null, 3.3, 0.8);
    if (y < 4.0) return 0.15;
    if (y < 15.2) {
      // arcade: light face with dark arch-shaped niches, a tongue in each
      const lx = mod(x, PA), c = PA / 2;
      const top = 0.85;
      let d;
      const ay = 7.4, R = 2.75;
      if (y < ay) d = Math.sqrt((lx - c) * (lx - c) + (y - ay) * (y - ay)) - R;
      else d = Math.max(Math.abs(lx - c) - R, y - 14.6);
      let h = recess(d, top);
      h = Math.max(h, 0.55 * dome(lx, y, c, 11.9, 1.35, 2.7));
      // dark spandrel pockets between the arch tops
      h = Math.min(h, recess(triSdf(lx, y, -1.7, 4.2, 1.7, 4.2, 0, 6.9), top));
      h = Math.min(h, recess(triSdf(lx, y, PA - 1.7, 4.2, PA + 1.7, 4.2, PA, 6.9), top));
      // soften top edge into the groove
      return h * smooth(4.0, 5.0, y) + 0.15 * (1 - smooth(4.0, 5.0, y));
    }
    if (y < 16.0) return 0.15;
    if (y < 18.6) return 0.15 + 0.8 * rib(Math.abs(y - 17.3), 1.3);
    if (y < 19.4) return 0.15;
    if (y < 29.4) {
      // dogtooth band: carved zigzag channel with triangular pockets
      const lx = mod(x, PL), c = PL / 2;
      const top = 0.85;
      const za = 21.4, zb = 27.4;
      const dz = Math.min(segDist(lx, y, 0, za, c, zb), segDist(lx, y, c, zb, PL, za));
      let h = recess(dz - 0.85, top);
      h = Math.min(h, recess(triSdf(lx, y, c - 3.2, 20.2, c + 3.2, 20.2, c, 24.8), top));
      h = Math.min(h, recess(triSdf(lx, y, -3.2, 28.6, 3.2, 28.6, 0, 24.0), top));
      h = Math.min(h, recess(triSdf(lx, y, PL - 3.2, 28.6, PL + 3.2, 28.6, PL, 24.0), top));
      // drilled holes in the solid lozenges
      for (const hx of [c * 0.5, c * 1.5]) {
        const dx = lx - hx, dy = y - 24.4;
        h = Math.min(h, recess(Math.sqrt(dx * dx + dy * dy) - 0.9, top));
      }
      h *= smooth(19.4, 20.2, y) * smooth(29.4, 28.6, y);
      return Math.max(h, 0.15);
    }
    if (y < 30.1) return 0.15;
    return band(y, 30.1, null, 0.8);
  };
  return carve(128, 32, heightFn, {
    seed: 501,
    period: PL,
    base: [216, 192, 146],
    target: [178, 154, 110],
    depth: 1.6,
    erode: 0.2,
    amb: 0.38,
    grain: 8,
  });
}

export function trimCap() {
  const PER = 16;
  const heightFn = (x, y) => {
    const lx = mod(x, PER);
    let h = 0.1;
    h = Math.max(h, band(y, null, 2.7, 0.8));
    if (y > 2.9 && y < 13) {
      // egg in a cup-shaped shell, darts between
      h = Math.max(h, 0.9 * dome(lx, y, 8, 7.7, 4.5, 4.0));
      const ex = (lx - 8) / 6.3, ey = (y - 6.6) / 5.4;
      if (y > 5.2) h = Math.max(h, 0.75 * rib(Math.abs(Math.sqrt(ex * ex + ey * ey) - 1) * 5.6, 1.05));
      const dl = Math.min(lx, PER - lx);
      if (y > 3.2 && y < 12.4) {
        const wdt = y < 8.6 ? 0.55 : 0.55 + 1.6 * Math.sin(((y - 8.6) / 3.8) * Math.PI) * (1 - (y - 8.6) / 3.8);
        h = Math.max(h, 0.65 * rib(dl, Math.max(0.2, wdt)));
      }
    }
    // bead row
    if (y > 12.6) {
      const bx = mod(x, 4);
      h = Math.max(h, 0.7 * dome(bx, y, 2, 14.6, 1.7, 1.35));
      h = Math.max(h, 0.35 * band(y, 15.6, null, 0.4));
    }
    return h;
  };
  return carve(64, 16, heightFn, {
    seed: 517,
    period: PER,
    base: [214, 194, 152],
    target: [184, 162, 120],
    depth: 1.5,
    erode: 0.12,
    amb: 0.4,
    grain: 7,
  });
}

// ------------------------------------------------------------------ plaster

export function wallPlaster() {
  const W = 128, H = 128, N = W * H, S = 801;
  const big = fbm(W, H, { cx: 3, oct: 5, gain: 0.55, seed: S + 1 });
  const mid = fbm(W, H, { cx: 8, oct: 4, gain: 0.5, seed: S + 2 });
  const det = fbm(W, H, { cx: 32, oct: 2, seed: S + 3 });
  const crk = fbm(W, H, { cx: 4, oct: 3, gain: 0.5, seed: S + 4, turb: true });
  const crk2 = fbm(W, H, { cx: 8, oct: 2, gain: 0.5, seed: S + 5, turb: true });
  const crkMask = fbm(W, H, { cx: 3, oct: 3, seed: S + 6 });
  const patch = fbm(W, H, { cx: 4, oct: 5, gain: 0.6, seed: S + 7 });
  const stone = fbm(W, H, { cx: 16, oct: 3, gain: 0.6, seed: S + 8 });
  const streak = fbm(W, H, { cx: 20, cy: 2, oct: 3, seed: S + 9 });
  const hgt = F32(N);
  const img = makeImg(W, H);
  const base = [204, 182, 142];
  for (let i = 0; i < N; i++) {
    // chipped plaster patches exposing stone underneath
    const pt = smooth(0.72, 0.77, patch[i] + (det[i] - 0.5) * 0.04);
    let c = smooth(0.03, 0.0, crk[i]) * smooth(0.45, 0.55, crkMask[i]);
    c = Math.max(c, smooth(0.025, 0.0, crk2[i]) * smooth(0.55, 0.65, crkMask[i]) * 0.8);
    let f = 1 + (big[i] - 0.5) * 0.22 + (mid[i] - 0.5) * 0.1 + (det[i] - 0.5) * 0.08;
    f *= 1 - Math.max(0, streak[i] - 0.55) * 0.3;
    f *= 1 - c * 0.45;
    let r = base[0] * f, g = base[1] * f, b = base[2] * f;
    if (pt > 0) {
      const sf = 0.82 + (stone[i] - 0.5) * 0.4;
      r += (base[0] * sf * 0.95 - r) * pt;
      g += (base[1] * sf * 0.88 - g) * pt;
      b += (base[2] * sf * 0.8 - b) * pt;
    }
    img.r[i] = r;
    img.g[i] = g;
    img.b[i] = b;
    hgt[i] = (mid[i] - 0.5) * 0.8 + (det[i] - 0.5) * 0.25 - pt * (0.9 + (stone[i] - 0.5) * 0.8) - c * 0.5;
  }
  const sh = lambert(hgt, W, H, 1.2, LIGHT);
  for (let i = 0; i < N; i++) {
    const s = 0.4 + 0.6 * sh[i];
    img.r[i] *= s;
    img.g[i] *= s;
    img.b[i] *= s;
  }
  matchMean(img, [200, 179, 140]);
  finish(img, { grain: 5, chroma: 2, sharpen: 0.2, soft: 0.2, seed: S });
  return img;
}

