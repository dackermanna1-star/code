// Ground surfaces and cliff rock.
import { Rng, fbm, voronoi, mod, clamp, smooth, lambert, cavity, castShadow, makeImg, finish, white, soften, shifted, F32 } from './core.js';
import { LIGHT, matchMean, partition } from './stone.js';

/** Scatter small shaded pebbles (tileable) onto img/height. */
function pebbles(img, hgt, W, H, rng, count, rmin, rmax, cols) {
  for (let p = 0; p < count; p++) {
    const cx = rng.range(0, W), cy = rng.range(0, H);
    const rx = rng.range(rmin, rmax), ry = rx * rng.range(0.6, 1);
    const ang = rng.range(0, Math.PI);
    const ca = Math.cos(ang), sa = Math.sin(ang);
    const col = rng.pick(cols), tone = rng.range(0.85, 1.12);
    const R = Math.ceil(rx + 2);
    for (let dy = -R; dy <= R; dy++)
      for (let dx = -R; dx <= R; dx++) {
        const px = Math.floor(cx) + dx, py = Math.floor(cy) + dy;
        const fx = px + 0.5 - cx, fy = py + 0.5 - cy;
        const u = (fx * ca + fy * sa) / rx, v = (-fx * sa + fy * ca) / ry;
        const q = u * u + v * v;
        const i = mod(py, H) * W + mod(px, W);
        if (q < 1) {
          const t = smooth(1, 0.7, q);
          img.r[i] += (col[0] * tone - img.r[i]) * t;
          img.g[i] += (col[1] * tone - img.g[i]) * t;
          img.b[i] += (col[2] * tone - img.b[i]) * t;
          hgt[i] = Math.max(hgt[i], Math.sqrt(1 - q) * rx * 0.35);
        } else if (q < 1.8) {
          // a little dark contact ring
          const t = (1 - (q - 1) / 0.8) * 0.12;
          img.r[i] *= 1 - t;
          img.g[i] *= 1 - t;
          img.b[i] *= 1 - t;
        }
      }
  }
}

function applyShade(img, sh, amb, extra = null, k = 0) {
  const n = img.w * img.h;
  for (let i = 0; i < n; i++) {
    let s = amb + (1 - amb) * sh[i];
    if (extra) s *= 1 - clamp(extra[i] * k, 0, 0.5);
    img.r[i] *= s;
    img.g[i] *= s;
    img.b[i] *= s;
  }
}

export function groundSand() {
  const W = 128, H = 128, N = W * H, S = 1201;
  const rng = new Rng(S);
  const big = fbm(W, H, { cx: 2, oct: 5, gain: 0.6, seed: S + 1 });
  const mid = fbm(W, H, { cx: 6, oct: 4, gain: 0.55, seed: S + 2 });
  const det = fbm(W, H, { cx: 32, oct: 2, seed: S + 3 });
  const warp = fbm(W, H, { cx: 3, oct: 3, seed: S + 4 });
  const hue = fbm(W, H, { cx: 4, oct: 3, seed: S + 5 });
  const wn = white(W, H, S + 6);
  const img = makeImg(W, H);
  const hgt = F32(N);
  const base = [198, 162, 106];
  for (let y = 0; y < H; y++)
    for (let x = 0; x < W; x++) {
      const i = y * W + x;
      // faint wind ripples (integer wave counts so it tiles)
      const ph = (y * 7) / H + (x * 1) / W + (warp[i] - 0.5) * 3;
      const rip = Math.sin(ph * Math.PI * 2);
      hgt[i] = rip * 0.12 + (mid[i] - 0.5) * 1.2 + (det[i] - 0.5) * 0.5 + (wn[i] - 0.5) * 0.35;
      let f = 1 + (big[i] - 0.5) * 0.16 + (mid[i] - 0.5) * 0.07 + (det[i] - 0.5) * 0.06;
      f *= 1 - smooth(0.62, 0.85, big[i]) * 0.05;
      const h = (hue[i] - 0.5) * 0.08;
      img.r[i] = base[0] * f * (1 + h);
      img.g[i] = base[1] * f;
      img.b[i] = base[2] * f * (1 - h * 1.5);
    }
  pebbles(img, hgt, W, H, rng, 18, 0.7, 1.6, [
    [170, 140, 100],
    [205, 185, 150],
    [140, 115, 85],
    [190, 160, 120],
  ]);
  pebbles(img, hgt, W, H, rng, 4, 1.6, 2.6, [
    [175, 150, 115],
    [200, 180, 145],
  ]);
  const sh = lambert(hgt, W, H, 0.8, LIGHT);
  applyShade(img, sh, 0.45);
  matchMean(img, [196, 160, 104]);
  finish(img, { grain: 9, chroma: 4, sharpen: 0.2, seed: S });
  return img;
}

export function groundStone() {
  const W = 256, H = 256, N = W * H, S = 1301;
  const rng = new Rng(S);
  const wxf = fbm(W, H, { cx: 8, oct: 3, seed: S + 1 });
  const wyf = shifted(wxf, W, H, 101, 57);
  const wx = F32(N), wy = F32(N);
  for (let i = 0; i < N; i++) {
    wx[i] = (wxf[i] - 0.5) * 10;
    wy[i] = (wyf[i] - 0.5) * 10;
  }
  // merge random neighbouring cells so the flagstones become irregular
  const CX = 7, CY = 7;
  const parent = new Int32Array(CX * CY).map((_, k) => k);
  const find = (a) => (parent[a] === a ? a : (parent[a] = find(parent[a])));
  const mrng = new Rng(S + 77);
  for (let j = 0; j < CY; j++)
    for (let i = 0; i < CX; i++) {
      const a = j * CX + i;
      if (mrng.chance(0.22)) parent[find(a)] = find(j * CX + ((i + 1) % CX));
      if (mrng.chance(0.22)) parent[find(a)] = find(((j + 1) % CY) * CX + i);
    }
  const group = new Int32Array(CX * CY).map((_, k) => find(k));
  const vor = voronoi(W, H, CX, CY, S + 3, 0.95, wx, wy, group);
  const cells = [];
  for (let k = 0; k < vor.n; k++)
    cells.push({
      tone: rng.gauss() * 0.07,
      tint: rng.pick([
        [1, 1, 1],
        [1.02, 0.99, 0.95],
        [0.98, 0.98, 1.0],
        [1.03, 0.99, 0.93],
      ]),
      lift: rng.gauss() * 0.4,
      crack: rng.chance(0.35),
      dirt: rng.next(),
      ox: rng.int(0, W - 1),
      oy: rng.int(0, H - 1),
    });
  const gapN = fbm(W, H, { cx: 12, oct: 3, seed: S + 4 });
  const big = fbm(W, H, { cx: 3, oct: 4, gain: 0.6, seed: S + 5 });
  const mid = fbm(W, H, { cx: 10, oct: 3, gain: 0.55, seed: S + 6 });
  const det = fbm(W, H, { cx: 48, oct: 2, gain: 0.6, seed: S + 7 });
  const mot = fbm(W, H, { cx: 20, oct: 3, gain: 0.6, seed: S + 8 });
  const crk = fbm(W, H, { cx: 6, oct: 3, seed: S + 9, turb: true });
  const stain = fbm(W, H, { cx: 5, oct: 4, gain: 0.6, seed: S + 10 });
  const hue = shifted(big, W, H, 77, 141);
  const drift = shifted(stain, W, H, 131, 29);
  const img = makeImg(W, H);
  const hgt = F32(N);
  const stoneC = [208, 184, 140], sandC = [166, 114, 66];
  for (let y = 0; y < H; y++)
    for (let x = 0; x < W; x++) {
      const i = y * W + x;
      const c = cells[group[vor.id[i]]];
      const j = ((y + c.oy) % H) * W + ((x + c.ox) % W);
      const gapW = 0.8 + (gapN[i] - 0.5) * 3.8;
      const inside = vor.edge[i] - gapW;
      const st = smooth(-0.6, 0.8, inside);
      const bev = smooth(-0.2, 4, inside);
      const cr = c.crack ? smooth(0.03, 0.0, crk[i]) * st : 0;
      hgt[i] = st * (1.2 * Math.sqrt(bev) + c.lift) + (mid[j] - 0.5) * 1.8 + (det[j] - 0.5) * 0.6 - cr * 1.0;
      // stone albedo: mottled sandstone with worn stains
      let f = 1 + c.tone + (big[i] - 0.5) * 0.16 + (mid[j] - 0.5) * 0.18 + (det[j] - 0.5) * 0.3;
      f *= 1 + (smooth(0.25, 0.75, mot[j]) - 0.5) * 0.3;
      f *= 1 - smooth(0.62, 0.7, det[i] * 0.5 + mot[i] * 0.5) * 0.18;
      // grey-brown weathered blotches inside the stones
      const j2 = ((y + c.oy + 35) % H) * W + ((x + c.ox + 40) % W);
      const bl = smooth(0.5, 0.75, mid[j] * 0.6 + mot[j2] * 0.4);
      const sn = smooth(0.55, 0.8, stain[i] + (c.dirt - 0.5) * 0.25);
      f *= 1 - sn * 0.2;
      f *= 1 - cr * 0.45;
      f *= 1 - (1 - smooth(0, 4, inside)) * 0.1;
      const h = (hue[i] - 0.5) * 0.1;
      f *= 1 - bl * 0.18;
      let sr = stoneC[0] * f * c.tint[0] * (1 + h + sn * 0.04),
        sg = stoneC[1] * f * c.tint[1],
        sb = stoneC[2] * f * c.tint[2] * (1 - h * 1.4 - sn * 0.08);
      const sl = (sr + sg + sb) / 3;
      sr += (sl - sr) * bl * 0.35;
      sg += (sl - sg) * bl * 0.35;
      sb += (sl * 0.95 - sb) * bl * 0.35;
      // packed orange sand in the gaps, darker in the middle of the gap
      const gd = 0.72 + 0.28 * smooth(-gapW, 0, inside) + (det[i] - 0.5) * 0.3 + (big[i] - 0.5) * 0.2;
      const gr = sandC[0] * gd, gg = sandC[1] * gd, gb = sandC[2] * gd;
      let r = gr + (sr - gr) * st, g = gg + (sg - gg) * st, b = gb + (sb - gb) * st;
      // wind-blown sand drifting over the paving
      const dr = smooth(0.62, 0.8, drift[i] + (det[i] - 0.5) * 0.15) * 0.65;
      r += (sandC[0] * 1.06 - r) * dr;
      g += (sandC[1] * 1.08 - g) * dr;
      b += (sandC[2] * 1.1 - b) * dr;
      hgt[i] *= 1 - dr * 0.7;
      img.r[i] = r;
      img.g[i] = g;
      img.b[i] = b;
    }
  const sh = lambert(hgt, W, H, 0.55, LIGHT);
  const cav = cavity(hgt, W, H, 3);
  applyShade(img, sh, 0.45, cav, 0.1);
  matchMean(img, [190, 158, 110]);
  finish(img, { grain: 12, chroma: 6, sharpen: 0.35, soft: 0.2, seed: S });
  return img;
}

export function groundDirt() {
  const W = 128, H = 128, N = W * H, S = 1401;
  const rng = new Rng(S);
  const big = fbm(W, H, { cx: 3, oct: 5, gain: 0.6, seed: S + 1 });
  const mid = fbm(W, H, { cx: 8, oct: 4, gain: 0.55, seed: S + 2 });
  const det = fbm(W, H, { cx: 32, oct: 2, seed: S + 3 });
  const clod = voronoi(W, H, 14, 14, S + 4, 1);
  const crk = fbm(W, H, { cx: 4, oct: 3, seed: S + 5, turb: true });
  const crkM = fbm(W, H, { cx: 3, oct: 2, seed: S + 6 });
  const hue = fbm(W, H, { cx: 5, oct: 3, seed: S + 7 });
  const wn = white(W, H, S + 8);
  const img = makeImg(W, H);
  const hgt = F32(N);
  const base = [156, 122, 82];
  for (let i = 0; i < N; i++) {
    const cr = smooth(0.03, 0, crk[i]) * smooth(0.5, 0.6, crkM[i]);
    const cl = smooth(0, 3, clod.edge[i]);
    hgt[i] = cl * 0.9 + (mid[i] - 0.5) * 1.6 + (det[i] - 0.5) * 0.6 + (wn[i] - 0.5) * 0.4 - cr * 1.2;
    let f = 1 + (big[i] - 0.5) * 0.24 + (mid[i] - 0.5) * 0.12 + (det[i] - 0.5) * 0.12;
    f *= 1 - cr * 0.35 - (1 - cl) * 0.06;
    const h = (hue[i] - 0.5) * 0.1;
    img.r[i] = base[0] * f * (1 + h);
    img.g[i] = base[1] * f;
    img.b[i] = base[2] * f * (1 - h * 1.5);
  }
  pebbles(img, hgt, W, H, rng, 26, 0.7, 2.0, [
    [150, 130, 105],
    [120, 98, 72],
    [175, 150, 115],
    [135, 120, 105],
  ]);
  const sh = lambert(hgt, W, H, 0.8, LIGHT);
  applyShade(img, sh, 0.4);
  matchMean(img, [150, 118, 80]);
  finish(img, { grain: 10, chroma: 4, sharpen: 0.25, seed: S });
  return img;
}

export function rock() {
  const W = 256, H = 256, N = W * H, S = 1501;
  const rng = new Rng(S);
  // strata: alternating hard ledges and softer eroded bands
  const layerHs = partition(H, 14, 56, rng);
  const pal = [
    [204, 166, 120],
    [168, 128, 106],
    [156, 124, 112],
    [196, 160, 122],
    [176, 134, 100],
    [148, 116, 104],
  ];
  const layers = [];
  let y0 = 0;
  layerHs.forEach((lh, li) => {
    layers.push({ y0, h: lh, prot: rng.gauss() * 1.2, col: pal[(li * 2 + rng.int(0, 1)) % pal.length], ledge: rng.range(0.12, 0.3), hard: rng.next() });
    y0 += lh;
  });
  const rowL = new Int16Array(H);
  layers.forEach((l, li) => {
    for (let y = l.y0; y < l.y0 + l.h; y++) rowL[y] = li;
  });
  const wyf = fbm(W, H, { cx: 2, oct: 4, gain: 0.5, seed: S + 1 });
  const big = fbm(W, H, { cx: 3, oct: 4, gain: 0.6, seed: S + 3 });
  const mid = fbm(W, H, { cx: 10, oct: 4, gain: 0.6, seed: S + 4 });
  const det = fbm(W, H, { cx: 40, oct: 2, seed: S + 5 });
  const vein = fbm(W, H, { cx: 3, cy: 20, oct: 3, seed: S + 8 });
  const vwx = F32(N), vwy = F32(N);
  for (let i = 0; i < N; i++) {
    vwx[i] = (mid[i] - 0.5) * 18;
    vwy[i] = (wyf[i] - 0.5) * 10;
  }
  // rounded boulder lumps, elongated along the bedding
  const vor = voronoi(W, H, 6, 10, S + 6, 0.9, vwx, vwy);
  const lumps = [];
  for (let k = 0; k < vor.n; k++) lumps.push({ a: rng.range(0.6, 1.6), t: rng.gauss() * 0.06, gy: rng.range(0, 0.12) });
  const img = makeImg(W, H);
  const hgt = F32(N);
  const cw = W / 6, chh = H / 10;
  for (let y = 0; y < H; y++)
    for (let x = 0; x < W; x++) {
      const i = y * W + x;
      const Y = mod(y + 0.5 + (wyf[i] - 0.5) * 40, H);
      const L = layers[rowL[Math.min(H - 1, Math.floor(Y))]];
      const v = (Y - L.y0) / L.h;
      const lp = lumps[vor.id[i]];
      const ex = vor.dx[i] / cw, ey = vor.dy[i] / chh;
      const lump = Math.max(0, 1 - (ex * ex + ey * ey) * 1.6) * lp.a + lp.gy * vor.dy[i] * 0.1;
      const seam = 1 - smooth(0, 2.5, vor.edge[i]);
      const prof = smooth(0, L.ledge, v) * (1 - 0.7 * v);
      hgt[i] = L.prot + prof * 4 * (0.4 + L.hard) + lump * 2.2 - seam * 0.8 + (mid[i] - 0.5) * 3.2 + (det[i] - 0.5) * 1.2;
      let f = 1 + lp.t + (big[i] - 0.5) * 0.3 + (mid[i] - 0.5) * 0.22 + (det[i] - 0.5) * 0.2;
      f *= 1 - seam * 0.1;
      const vn = smooth(0.7, 0.82, vein[i]) * 0.5;
      const c = L.col;
      const hb = (big[(y * W + ((x + 97) % W))] - 0.5) * 0.12;
      img.r[i] = c[0] * f * (1 + hb) + vn * 30;
      img.g[i] = c[1] * f + vn * 32;
      img.b[i] = c[2] * f * (1 - hb) + vn * 30;
    }
  const hs = soften(hgt, W, H, 1);
  const sh = lambert(hs, W, H, 0.45, [-0.35, -0.85, 0.5]);
  const shadow = castShadow(hs, W, H, -0.35, -1, 8, 0.55, 2.5);
  const cav = cavity(hs, W, H, 4);
  for (let i = 0; i < N; i++) {
    let s = 0.4 + 0.6 * sh[i];
    const sd = 1 - shadow[i];
    s *= 1 - sd * 0.32;
    s *= 1 - clamp(cav[i] * 0.08, 0, 0.3);
    // shadows lean towards mauve like the reference cliffs
    img.r[i] *= s * (1 - sd * 0.04);
    img.g[i] *= s * (1 - sd * 0.05);
    img.b[i] *= s * (1 + sd * 0.03);
  }
  matchMean(img, [172, 138, 108]);
  finish(img, { grain: 8, chroma: 4, sharpen: 0.3, soft: 0.4, seed: S });
  return img;
}
