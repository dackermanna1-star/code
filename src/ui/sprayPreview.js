// Live spray-paint stroke preview for the paint menu (Canvas 2D, CPU).
//
// A sample stroke is simulated the way paint behaves on a wall:
//   - the nozzle travels a spline with a hand-like speed profile (a dwell at the
//     start, slower through the turns, a quick flick out at the end); paint laid
//     per unit length goes as flow / speed, so slow spots build up
//   - the deposit is blurred into a Gaussian spray cone (recursive Young-van
//     Vliet filter: the cost does not depend on the cone width) plus a wide,
//     faint overspray mist; the calligraphy cap deposits along a level flat fan
//   - coverage is sampled as droplets: each pixel catches a Poisson number of
//     droplets for the local film density, so thin paint (edges, overspray) is
//     grainy and speckled while thick paint goes solid, and the mean coverage
//     still follows 1 - exp(-film)
//   - sparse larger overspray droplets, and spits from the fat cap
//   - where paint pools (slow spots at high flow) thin runs slide down and end
//     in beads
//   - shading: a thin film follows the concrete's micro relief, only excess
//     paint (pools, runs, beads) stands up from the wall. Matte is flat and a
//     little chalky, gloss catches a lamp as a broad sheen with glitter on the
//     aggregate, chrome is tinted silver reflecting the alley, with metal flake
// Everything is composited in linear light over a procedural concrete wall.
// The density stage is cached, so colour and finish changes only re-shade.
import { hexToLinear, chromeBase } from './color.js';

const TAU = Math.PI * 2;
const SQRT_TAU = Math.sqrt(TAU);

// linear -> sRGB byte
const L2S_N = 4096;
const L2S = new Uint8ClampedArray(L2S_N + 1);
for (let i = 0; i <= L2S_N; i++) {
  const l = i / L2S_N;
  L2S[i] = Math.round((l <= 0.0031308 ? l * 12.92 : 1.055 * Math.pow(l, 1 / 2.4) - 0.055) * 255);
}
// droplets: each covers DROP_A of a pixel; mean coverage 1 - exp(-film)
const DROP_A = 0.62;
const INV_A = 1 / DROP_A;
const LAMBDA_MAX = 14;
const EXP_N = 2048, EXP_K = EXP_N / LAMBDA_MAX;
const EXPN = new Float32Array(EXP_N + 1);
for (let i = 0; i <= EXP_N; i++) EXPN[i] = Math.exp(-i / EXP_K);
const DROP_COV = new Float32Array(48);
for (let k = 0; k < 48; k++) DROP_COV[k] = 1 - Math.pow(1 - DROP_A, k);

function mulberry32(seed) {
  let a = seed | 0;
  return () => {
    a = (a + 0x6d2b79f5) | 0;
    let t = Math.imul(a ^ (a >>> 15), 1 | a);
    t = (t + Math.imul(t ^ (t >>> 7), 61 | t)) ^ t;
    return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
  };
}
const gaussian = (rnd) => (rnd() + rnd() + rnd() + rnd() - 2) * 1.7320508;
const smoothstep = (a, b, x) => {
  const t = Math.min(1, Math.max(0, (x - a) / (b - a)));
  return t * t * (3 - 2 * t);
};

function hash2(x, y, s) {
  let h = (Math.imul(x | 0, 374761393) + Math.imul(y | 0, 668265263) + Math.imul(s | 0, 1274126177)) | 0;
  h = Math.imul(h ^ (h >>> 13), 1103515245);
  h ^= h >>> 16;
  return (h >>> 0) / 4294967296;
}
function valueNoise(x, y, s) {
  const ix = Math.floor(x), iy = Math.floor(y), fx = x - ix, fy = y - iy;
  const sx = fx * fx * (3 - 2 * fx), sy = fy * fy * (3 - 2 * fy);
  const a = hash2(ix, iy, s), b = hash2(ix + 1, iy, s), c = hash2(ix, iy + 1, s), d = hash2(ix + 1, iy + 1, s);
  return a + (b - a) * sx + (c - a + (a - b - c + d) * sx) * sy;
}

// ── recursive Gaussian (Young & van Vliet 1995), zero boundaries ──
function yvv(sigma) {
  const q = sigma >= 2.5 ? 0.98711 * sigma - 0.9633 : 3.97156 - 4.14554 * Math.sqrt(1 - 0.26891 * sigma);
  const q2 = q * q, q3 = q2 * q;
  const b0 = 1.57825 + 2.44413 * q + 1.4281 * q2 + 0.422205 * q3;
  const b1 = 2.44413 * q + 2.85619 * q2 + 1.26661 * q3;
  const b2 = -(1.4281 * q2 + 1.26661 * q3);
  const b3 = 0.422205 * q3;
  return { B: 1 - (b1 + b2 + b3) / b0, a1: b1 / b0, a2: b2 / b0, a3: b3 / b0 };
}

function gaussianBlur(buf, W, H, sigma, tmp) {
  if (!(sigma >= 0.5)) return;
  const { B, a1, a2, a3 } = yvv(sigma);
  for (let y = 0; y < H; y++) {
    const o = y * W;
    let w1 = 0, w2 = 0, w3 = 0;
    for (let x = 0; x < W; x++) {
      const w = B * buf[o + x] + a1 * w1 + a2 * w2 + a3 * w3;
      tmp[x] = w;
      w3 = w2; w2 = w1; w1 = w;
    }
    w1 = w2 = w3 = 0;
    for (let x = W - 1; x >= 0; x--) {
      const w = B * tmp[x] + a1 * w1 + a2 * w2 + a3 * w3;
      buf[o + x] = w;
      w3 = w2; w2 = w1; w1 = w;
    }
  }
  for (let x = 0; x < W; x++) {
    let w1 = 0, w2 = 0, w3 = 0;
    for (let y = 0, i = x; y < H; y++, i += W) {
      const w = B * buf[i] + a1 * w1 + a2 * w2 + a3 * w3;
      tmp[y] = w;
      w3 = w2; w2 = w1; w1 = w;
    }
    w1 = w2 = w3 = 0;
    for (let y = H - 1, i = x + (H - 1) * W; y >= 0; y--, i -= W) {
      const w = B * tmp[y] + a1 * w1 + a2 * w2 + a3 * w3;
      buf[i] = w;
      w3 = w2; w2 = w1; w1 = w;
    }
  }
}

function splat(buf, W, H, x, y, a) {
  x -= 0.5;
  y -= 0.5;
  const x0 = Math.floor(x), y0 = Math.floor(y);
  if (x0 < 0 || y0 < 0 || x0 >= W - 1 || y0 >= H - 1) return;
  const fx = x - x0, fy = y - y0, i = y0 * W + x0;
  buf[i] += a * (1 - fx) * (1 - fy);
  buf[i + 1] += a * fx * (1 - fy);
  buf[i + W] += a * (1 - fx) * fy;
  buf[i + W + 1] += a * fx * fy;
}

/** Add a round droplet with an anti-aliased edge and a domed profile (r in buffer px). */
function dot(buf, W, H, cx, cy, r, amt) {
  const x0 = Math.max(0, Math.floor(cx - r - 1)), x1 = Math.min(W - 1, Math.ceil(cx + r + 1));
  const y0 = Math.max(0, Math.floor(cy - r - 1)), y1 = Math.min(H - 1, Math.ceil(cy + r + 1));
  const rr = Math.max(r, 0.35);
  const small = r < 0.5 ? r * 2 : 1;
  for (let y = y0; y <= y1; y++) {
    const dy = y + 0.5 - cy;
    for (let x = x0; x <= x1; x++) {
      const dx = x + 0.5 - cx;
      const d = Math.sqrt(dx * dx + dy * dy);
      const cov = rr + 0.5 - d;
      if (cov <= 0) continue;
      const k = d < rr ? Math.sqrt(1 - (d * d) / (rr * rr)) : 0;
      buf[y * W + x] += amt * (cov > 1 ? 1 : cov) * (0.4 + 0.6 * k) * small;
    }
  }
}

// ── stroke paths (normalised to the canvas box) ──
// The preview stroke: an S laid on its side with steep flanks, so the level
// calligraphy fan shows its thick-thin swing.
const PREVIEW_PATH = [[0.07, 0.6], [0.2, 0.2], [0.33, 0.21], [0.5, 0.44], [0.67, 0.67], [0.8, 0.66], [0.93, 0.24]];
const ICON_PATH = [[0.1, 0.66], [0.32, 0.34], [0.58, 0.62], [0.9, 0.34]];

function catmull(p0, p1, p2, p3, t) {
  const t2 = t * t, t3 = t2 * t;
  return 0.5 * (2 * p1 + (p2 - p0) * t + (2 * p0 - 5 * p1 + 4 * p2 - p3) * t2 + (3 * p1 - p0 - 3 * p2 + p3) * t3);
}

/** Resampled path with tangents and a hand speed profile. Units: buffer px. */
function buildPath(points, W, H, scale, kind) {
  const P = points.map(([u, v]) => [u * W, v * H]);
  const dense = [];
  const seg = 40;
  for (let i = 0; i < P.length - 1; i++) {
    const p0 = P[Math.max(0, i - 1)], p1 = P[i], p2 = P[i + 1], p3 = P[Math.min(P.length - 1, i + 2)];
    for (let k = 0; k < seg; k++) {
      const t = k / seg;
      dense.push(catmull(p0[0], p1[0], p2[0], p3[0], t), catmull(p0[1], p1[1], p2[1], p3[1], t));
    }
  }
  dense.push(P[P.length - 1][0], P[P.length - 1][1]);
  const nd = dense.length >> 1;
  const cum = new Float64Array(nd);
  for (let i = 1; i < nd; i++) cum[i] = cum[i - 1] + Math.hypot(dense[i * 2] - dense[i * 2 - 2], dense[i * 2 + 1] - dense[i * 2 - 1]);
  const L = cum[nd - 1];
  const step = 0.5; // buffer px between nozzle samples
  const n = Math.max(2, Math.ceil(L / step) + 1);
  const x = new Float32Array(n), y = new Float32Array(n), tx = new Float32Array(n), ty = new Float32Array(n), v = new Float32Array(n);
  let j = 1;
  for (let i = 0; i < n; i++) {
    const s = (i / (n - 1)) * L;
    while (j < nd - 1 && cum[j] < s) j++;
    const s0 = cum[j - 1], s1 = cum[j];
    const f = s1 > s0 ? (s - s0) / (s1 - s0) : 0;
    x[i] = dense[(j - 1) * 2] + (dense[j * 2] - dense[(j - 1) * 2]) * f;
    y[i] = dense[(j - 1) * 2 + 1] + (dense[j * 2 + 1] - dense[(j - 1) * 2 + 1]) * f;
  }
  for (let i = 0; i < n; i++) {
    const a = Math.max(0, i - 2), b = Math.min(n - 1, i + 2);
    const dx = x[b] - x[a], dy = y[b] - y[a], l = Math.hypot(dx, dy) || 1;
    tx[i] = dx / l;
    ty[i] = dy / l;
  }
  // curvature slows the hand (two-thirds power law, softened), plus a little tremor
  const rnd = mulberry32(911);
  const ph1 = rnd() * TAU, ph2 = rnd() * TAU;
  const ds = L / (n - 1);
  const R = 0.3 * (H / scale);
  for (let i = 0; i < n; i++) {
    const a = Math.max(0, i - 6), b = Math.min(n - 1, i + 6);
    let da = Math.atan2(ty[b], tx[b]) - Math.atan2(ty[a], tx[a]);
    if (da > Math.PI) da -= TAU;
    if (da < -Math.PI) da += TAU;
    const kappa = (Math.abs(da) / Math.max(1e-6, (b - a) * ds)) * scale;
    const t = i / (n - 1);
    let base;
    if (kind === 'icon') base = 0.75 + 0.25 * smoothstep(0, 0.2, t);
    else base = (0.3 + 0.7 * smoothstep(0, 0.07, t)) * (1 + 1.5 * smoothstep(0.86, 1, t));
    const wobble = 1 + 0.06 * Math.sin(t * 17 + ph1) + 0.04 * Math.sin(t * 41 + ph2);
    v[i] = base * Math.pow(1 + kappa * R, -1 / 3) * wobble;
  }
  return { n, x, y, tx, ty, v, ds, L };
}

// ── per-cap behaviour ──
// sigmaK: Gaussian sigma relative to the visible width; dens: paint amount
// multiplier (crisper caps lay more paint in a tighter cone); halo: overspray
// mist strength, haloK its width relative to the cone; speck: big droplet
// count; pool: how readily the cap's paint pools and runs.
const CAP_LOOK = {
  skinny: { sigmaK: 0.19, dens: 2.0, halo: 0.05, haloK: 2.6, speck: 0.45, pool: 0.85 },
  standard: { sigmaK: 0.22, dens: 1.0, halo: 0.085, haloK: 2.9, speck: 1.0, pool: 1.0 },
  fat: { sigmaK: 0.265, dens: 0.8, halo: 0.12, haloK: 3.0, speck: 1.5, pool: 1.25 },
  calligraphy: { sigmaK: 0.11, dens: 1.0, halo: 0.07, haloK: 0.45, speck: 0.7, pool: 1.1, fan: true },
};

// diffuse light (directional, upper left); the lamp for highlights is a point light
const LX = -0.42, LY = -0.66, LZ = 0.62;
const LN = Math.hypot(LX, LY, LZ);
const Lx = LX / LN, Ly = LY / LN, Lz = LZ / LN;

/**
 * Renders spray strokes into a canvas. opts.transparent: no wall, paint over
 * transparency (cap icons). opts.kind: 'preview' | 'icon'.
 */
export class SprayRenderer {
  constructor(canvas, { transparent = false, kind = 'preview' } = {}) {
    this.canvas = canvas;
    this.ctx = canvas ? canvas.getContext('2d') : null;
    this.transparent = transparent;
    this.kind = kind;
    this.W = 0;
    this.H = 0;
    this.scale = 1;
    this.densKey = '';
    this.lastMs = 0;
  }

  /** Size the internal buffers: css box w x h, `scale` buffer px per css px. */
  resize(cssW, cssH, scale = 1) {
    const W = Math.max(8, Math.round(cssW * scale)), H = Math.max(8, Math.round(cssH * scale));
    if (W === this.W && H === this.H) return false;
    this.W = W;
    this.H = H;
    this.cssW = cssW;
    this.cssH = cssH;
    this.scale = W / cssW;
    const N = W * H;
    this.line = new Float32Array(N);
    this.dens = new Float32Array(N);
    this.thick = new Float32Array(N);
    this.W2 = (W + 1) >> 1;
    this.H2 = (H + 1) >> 1;
    this.halo = new Float32Array(this.W2 * this.H2);
    this.tmp = new Float32Array(Math.max(W, H));
    // half-res -> full-res bilinear taps
    this.ux0 = new Int32Array(W);
    this.ufx = new Float32Array(W);
    for (let x = 0; x < W; x++) {
      const hx = Math.min(this.W2 - 1.001, Math.max(0, (x + 0.5) / 2 - 0.5));
      this.ux0[x] = Math.floor(hx);
      this.ufx[x] = hx - Math.floor(hx);
    }
    this.uy0 = new Int32Array(H);
    this.ufy = new Float32Array(H);
    for (let y = 0; y < H; y++) {
      const hy = Math.min(this.H2 - 1.001, Math.max(0, (y + 0.5) / 2 - 0.5));
      this.uy0[y] = Math.floor(hy);
      this.ufy[y] = hy - Math.floor(hy);
    }
    const rnd = mulberry32(4242);
    this.u = new Float32Array(N); // droplet lottery
    this.g2 = new Float32Array(N); // second noise: chalk, flake
    for (let i = 0; i < N; i++) {
      this.u[i] = rnd();
      this.g2[i] = rnd() - 0.5;
    }
    this.makeWall();
    this.path = buildPath(this.kind === 'icon' ? ICON_PATH : PREVIEW_PATH, W, H, this.scale, this.kind);
    if (this.canvas) {
      this.canvas.width = W;
      this.canvas.height = H;
      this.image = this.ctx.createImageData(W, H);
    } else {
      this.image = { data: new Uint8ClampedArray(N * 4), width: W, height: H };
    }
    this.out32 = new Uint32Array(this.image.data.buffer);
    this.densKey = '';
    return true;
  }

  /** Concrete: albedo, micro relief normals, its own shading, and the lamp's half vectors. */
  makeWall() {
    const { W, H, scale } = this;
    const N = W * H;
    const hgt = new Float32Array(N);
    const alb = new Float32Array(N);
    const rnd = mulberry32(99);
    for (let y = 0; y < H; y++) {
      for (let x = 0; x < W; x++) {
        const u = x / scale, v = y / scale; // css px
        const m = valueNoise(u / 46, v / 46, 1) * 0.6 + valueNoise(u / 17, v / 17, 2) * 0.3 + valueNoise(u / 6, v / 6, 3) * 0.1;
        const agg = valueNoise(u / 1.3, v / 1.3, 5);
        const fine = hash2(x, y, 7) - 0.5;
        const i = y * W + x;
        hgt[i] = 0.55 * agg + 0.22 * fine + 0.4 * m;
        alb[i] = 0.82 + 0.36 * m + 0.06 * fine + 0.05 * (agg - 0.5);
      }
    }
    // pits from air bubbles
    const nPits = Math.round(N / (scale * scale) / 700);
    for (let k = 0; k < nPits; k++) {
      const px = rnd() * W, py = rnd() * H, r = (0.45 + rnd() * 1.2) * scale, d = 0.3 + 0.45 * rnd();
      const x0 = Math.max(0, Math.floor(px - r - 1)), x1 = Math.min(W - 1, Math.ceil(px + r + 1));
      const y0 = Math.max(0, Math.floor(py - r - 1)), y1 = Math.min(H - 1, Math.ceil(py + r + 1));
      for (let y = y0; y <= y1; y++) {
        for (let x = x0; x <= x1; x++) {
          const c = Math.min(1, Math.max(0, r + 0.5 - Math.hypot(x + 0.5 - px, y + 0.5 - py)));
          if (c <= 0) continue;
          alb[y * W + x] *= 1 - d * c;
          hgt[y * W + x] -= 1.2 * c;
        }
      }
    }
    this.wgx = new Float32Array(N);
    this.wgy = new Float32Array(N);
    this.bg = new Float32Array(N * 3);
    this.bg32 = new Uint32Array(N);
    this.hx = new Float32Array(N);
    this.hy = new Float32Array(N);
    this.hz = new Float32Array(N);
    this.sky = new Float32Array(N);
    const bgBytes = new Uint8ClampedArray(this.bg32.buffer);
    const base = [0.064, 0.068, 0.075];
    const rough = 0.42 * scale; // slope per unit height step, normalised per css px
    // a lamp close to the wall: its mirror hot spot sits on the stroke's first hump
    const lpx = 0.24 * this.cssW, lpy = 0.16 * this.cssH, lpz = 0.2 * this.cssW;
    for (let y = 0; y < H; y++) {
      for (let x = 0; x < W; x++) {
        const i = y * W + x;
        const gx = ((x < W - 1 ? hgt[i + 1] : hgt[i]) - (x > 0 ? hgt[i - 1] : hgt[i])) * 0.5 * rough;
        const gy = ((y < H - 1 ? hgt[i + W] : hgt[i]) - (y > 0 ? hgt[i - W] : hgt[i])) * 0.5 * rough;
        this.wgx[i] = gx;
        this.wgy[i] = gy;
        const il = 1 / Math.sqrt(gx * gx + gy * gy + 1);
        const ndl = (-gx * Lx - gy * Ly + Lz) * il;
        const light = (1.12 - 0.3 * (y / H)) * (1 + 0.55 * (ndl - Lz));
        const vx = x / W - 0.5, vy = y / H - 0.5;
        const vig = 1 - 0.55 * (vx * vx * 1.2 + vy * vy * 1.6);
        const k = alb[i] * light * vig;
        const j = i * 3;
        this.bg[j] = base[0] * k;
        this.bg[j + 1] = base[1] * k;
        this.bg[j + 2] = base[2] * k;
        const o = i * 4;
        bgBytes[o] = L2S[Math.min(1, this.bg[j]) * L2S_N | 0];
        bgBytes[o + 1] = L2S[Math.min(1, this.bg[j + 1]) * L2S_N | 0];
        bgBytes[o + 2] = L2S[Math.min(1, this.bg[j + 2]) * L2S_N | 0];
        bgBytes[o + 3] = 255;
        // half vector toward the lamp (orthographic view)
        let lx = lpx - x / scale, ly = lpy - y / scale, lz = lpz;
        const ll = Math.hypot(lx, ly, lz);
        lx /= ll; ly /= ll; lz = lz / ll + 1;
        const hl = Math.hypot(lx, ly, lz);
        this.hx[i] = lx / hl;
        this.hy[i] = ly / hl;
        this.hz[i] = lz / hl;
        // broad light for metal: the open sky up and to the left
        const sx = x / W - 0.18, sy = y / H + 0.25;
        this.sky[i] = Math.exp(-(sx * sx * 1.6 + sy * sy * 1.2));
      }
    }
  }

  /**
   * Draw. p = { color, cap, flow, finish, drips, widthPx (visible width in css px), speckle=1 }.
   * Returns the time taken in ms.
   */
  render(p) {
    const t0 = performance.now();
    if (!this.W) return 0;
    const key = `${p.cap}|${p.widthPx.toFixed(3)}|${p.flow.toFixed(4)}|${p.drips ? 1 : 0}|${p.speckle ?? 1}`;
    if (key !== this.densKey) {
      this.deposit(p);
      this.densKey = key;
    }
    this.shade(p);
    if (this.ctx) this.ctx.putImageData(this.image, 0, 0);
    this.lastMs = performance.now() - t0;
    return this.lastMs;
  }

  deposit(p) {
    const { W, H, W2, H2, scale, path, line, dens, halo, thick, tmp } = this;
    const look = CAP_LOOK[p.cap] ?? CAP_LOOK.standard;
    const icon = this.kind === 'icon';
    const wpx = Math.max(0.6, p.widthPx) * scale; // visible width, buffer px
    const flow = Math.min(1, Math.max(0.05, p.flow));
    const Dt = 4.5 * flow * look.dens; // core film at reference speed
    const rnd = mulberry32(icon ? 77 : 1234);
    line.fill(0);

    // fan geometry (calligraphy): a level slit, as the can is held in the game
    const fanLen = wpx;
    const fanTh = Math.max(0.6 * scale, wpx * look.sigmaK);
    const sigma = look.fan ? fanTh : wpx * look.sigmaK;
    const lam = look.fan ? Dt * fanLen : Dt * SQRT_TAU * sigma; // paint per unit length at speed 1

    const { n, x, y, v, ds } = path;
    if (look.fan) {
      const m = Math.max(3, Math.ceil(fanLen / 0.7));
      const w = new Float32Array(m);
      let wsum = 0;
      for (let j = 0; j < m; j++) {
        const u = ((j + 0.5) / m) * 2 - 1;
        w[j] = 1 - Math.pow(Math.abs(u), 3);
        wsum += w[j];
      }
      for (let i = 0; i < n; i++) {
        const a = (lam * ds) / v[i] / wsum;
        for (let j = 0; j < m; j++) splat(line, W, H, x[i] + ((j + 0.5) / m - 0.5) * fanLen, y[i], a * w[j]);
      }
    } else {
      for (let i = 0; i < n; i++) splat(line, W, H, x[i], y[i], (lam * ds) / v[i]);
    }

    dens.set(line);
    gaussianBlur(dens, W, H, sigma, tmp);

    // overspray mist at half resolution
    halo.fill(0);
    for (let yy = 0; yy < H; yy++) {
      const o2 = (yy >> 1) * W2, o = yy * W;
      for (let xx = 0; xx < W; xx++) halo[o2 + (xx >> 1)] += line[o + xx];
    }
    const haloSigma = Math.min(look.fan ? fanLen * look.haloK + 2.5 * scale : sigma * look.haloK, 0.17 * H);
    gaussianBlur(halo, W2, H2, haloSigma / 2, tmp);
    // normalise so the mist peaks at look.halo x the core film whatever the cone geometry
    // (0.25: four pixels are summed into each half-res cell)
    const geo = look.fan ? Math.max(1, (SQRT_TAU * haloSigma) / fanLen) : haloSigma / sigma;
    const hk = (look.halo * geo * 0.25) / (1 + wpx / scale / 40); // the preview compresses wide sprays, so their mist too
    const { ux0, ufx, uy0, ufy } = this;
    for (let yy = 0; yy < H; yy++) {
      const r0 = uy0[yy] * W2, r1 = r0 + W2, fy = ufy[yy], o = yy * W;
      for (let xx = 0; xx < W; xx++) {
        const c0 = ux0[xx], fx = ufx[xx];
        const a = halo[r0 + c0] + (halo[r0 + c0 + 1] - halo[r0 + c0]) * fx;
        const b = halo[r1 + c0] + (halo[r1 + c0 + 1] - halo[r1 + c0]) * fx;
        dens[o + xx] += hk * (a + (b - a) * fy);
      }
    }

    // big overspray droplets, well outside the cone
    const spread = look.fan ? fanLen * 0.5 : sigma;
    const nSpeck = Math.round((icon ? 8 : 64) * look.speck * (0.35 + 0.65 * flow) * (p.speckle ?? 1) * (path.L / scale / (icon ? 60 : 330)));
    for (let k = 0; k < nSpeck; k++) {
      const i = Math.min(n - 1, Math.floor(rnd() * n));
      const g = Math.abs(gaussian(rnd));
      const side = rnd() < 0.5 ? -1 : 1;
      let ox, oy;
      if (look.fan) {
        ox = side * (spread * (1.08 + 0.45 * g)) + gaussian(rnd) * fanTh;
        oy = gaussian(rnd) * (fanTh * 2.5 + 1.5 * scale);
      } else {
        const off = side * spread * (2.4 + 2.2 * g);
        const along = gaussian(rnd) * spread;
        ox = -path.ty[i] * off + path.tx[i] * along;
        oy = path.tx[i] * off + path.ty[i] * along;
      }
      const u = rnd();
      const r = (0.32 + 0.45 * u * u) * scale * (icon ? 0.7 : 1);
      dot(dens, W, H, x[i] + ox, y[i] + oy, r, 1.4 + 2 * rnd());
    }
    // the fat cap spits now and then: a few larger droplets near the edge
    if (p.cap === 'fat' && !icon) {
      for (let k = 0; k < 3; k++) {
        const i = Math.floor((0.15 + 0.7 * rnd()) * n);
        const off = (rnd() < 0.5 ? -1 : 1) * sigma * (2.1 + 1.1 * rnd());
        dot(dens, W, H, x[i] - path.ty[i] * off, y[i] + path.tx[i] * off, (0.8 + 0.7 * rnd()) * scale, 4.5);
      }
    }

    // relief: a normal coat lies flat on the wall; only heavily pooled paint swells a little
    const film = (look.fan ? 5 : 2.1) * Dt + 0.4;
    for (let i = 0; i < W * H; i++) {
      const d = dens[i] - film;
      thick[i] = d > 0 ? (0.6 * d) / (1 + 0.6 * d) : 0;
    }

    // runs: where the hand dwelt with a lot of paint coming out
    this.runs = [];
    if (p.drips && !icon) {
      const thr = 1.12;
      const order = [];
      const pool = (i) => (flow * look.pool) / v[i];
      for (let i = 2; i < n - 2; i++) {
        const pi = pool(i);
        if (pi > thr && pi >= pool(i - 1) && pi >= pool(i + 1)) order.push(i);
      }
      if (pool(0) > thr) order.push(Math.min(n - 1, Math.round(n * 0.012)));
      order.sort((a, b) => pool(b) - pool(a));
      const picks = [];
      for (const i of order) {
        if (picks.length >= 3) break;
        if (picks.every((j) => Math.abs(x[j] - x[i]) > 0.16 * W)) picks.push(i);
      }
      const css = scale;
      const wcss = wpx / css;
      for (const i of picks) {
        const excess = pool(i) - thr;
        const x0 = x[i] + (rnd() - 0.5) * 0.2 * (look.fan ? fanLen : wpx);
        const y0 = y[i] + (look.fan ? 1.2 * fanTh : 0.26 * wpx);
        const below = (look.fan ? 1.5 * fanTh : 0.3 * wpx) + 10 * css; // clear of the stroke's lower edge
        const room = H - y0 - 5 * css;
        const len = Math.min(room, Math.max(below, (8 + excess * 17) * css * (0.85 + 0.3 * rnd()) * (0.8 + 0.2 * Math.sqrt(wcss / 14))));
        if (len < below) continue;
        const rw = (0.85 + 0.06 * wcss) * css;
        drawRun(dens, thick, W, H, x0, y0, len, rw, css, rnd);
        this.runs.push({ x0: x0 / css, y0: y0 / css, len: len / css });
      }
    }

  }

  shade(p) {
    const { W, H, dens, thick, u, g2, bg, bg32, out32, wgx, wgy, hx, hy, hz, sky, scale } = this;
    const out = this.image.data;
    const lin = hexToLinear(p.color);
    const mode = p.finish === 'matte' ? 0 : p.finish === 'chrome' ? 2 : 1;
    let pr = lin[0], pg = lin[1], pb = lin[2];
    if (mode === 0) {
      // matte: lighter and chalkier than the wet colour
      pr = pr * 0.9 + 0.02;
      pg = pg * 0.9 + 0.02;
      pb = pb * 0.9 + 0.02;
    } else if (mode === 2) {
      [pr, pg, pb] = chromeBase(lin, p.tint ?? 0.28);
    } else {
      // gloss: the wet colour reads a little deeper
      pr = Math.pow(pr, 1.07);
      pg = Math.pow(pg, 1.07);
      pb = Math.pow(pb, 1.07);
    }
    const bump = 0.32 * scale; // paint relief slope per unit of excess film per css px
    // how much of the wall's micro relief survives under a closed coat (gloss levels best)
    const level = mode === 0 ? 0.8 : mode === 1 ? 0.9 : 0.7;
    const transparent = this.transparent;
    for (let y = 0; y < H; y++) {
      const row = y * W;
      const up = y > 0 ? -W : 0, dn = y < H - 1 ? W : 0;
      for (let x = 0; x < W; x++) {
        const i = row + x;
        const D = dens[i];
        // droplet lottery: a Poisson number of droplets for this film density
        const lam = D * INV_A;
        let c;
        if (lam >= LAMBDA_MAX) c = 1;
        else {
          let pk = EXPN[(lam * EXP_K) | 0];
          const ui = u[i];
          if (ui < pk) {
            if (transparent) out32[i] = 0;
            else out32[i] = bg32[i];
            continue;
          }
          let F = pk, k = 0;
          while (ui >= F && k < 46) {
            k++;
            pk *= lam / k;
            F += pk;
          }
          c = DROP_COV[k];
        }
        // normal: the wall's micro relief, smoothed under thick paint, plus the paint's own relief
        const sm = 1 - level * (D > 5 ? 1 : D / 5);
        const gx = wgx[i] * sm + (thick[x < W - 1 ? i + 1 : i] - thick[x > 0 ? i - 1 : i]) * bump;
        const gy = wgy[i] * sm + (thick[i + dn] - thick[i + up]) * bump;
        const il = 1 / Math.sqrt(gx * gx + gy * gy + 1);
        const nx = -gx * il, ny = -gy * il, nz = il;
        const ndl = nx * Lx + ny * Ly + nz * Lz;
        let r, g, b;
        if (mode === 0) {
          const dif = (1 + 0.5 * (ndl - Lz)) * (1 + 0.08 * g2[i]);
          r = pr * dif;
          g = pg * dif;
          b = pb * dif;
        } else {
          let ndh = nx * hx[i] + ny * hy[i] + nz * hz[i];
          if (ndh < 0) ndh = 0;
          let h2 = ndh * ndh;
          let h8 = h2 * h2;
          h8 *= h8;
          let h32 = h8 * h8;
          h32 *= h32;
          if (mode === 1) {
            let dif = 1 + 0.55 * (ndl - Lz);
            if (dif < 0.45) dif = 0.45;
            // the lamp's hot spot, broken into glints by the wall's grain, slightly cool
            const h64 = h32 * h32;
            const spec = 0.01 * h8 + 0.42 * h64 * h64;
            r = pr * dif + spec;
            g = pg * dif + spec * 1.01;
            b = pb * dif + spec * 1.05;
          } else {
            // chrome: tinted silver mirroring the alley along the reflected ray:
            // bright sky above, a dark band of the far wall, the wet ground below
            const ry = 2 * nz * ny, rx = 2 * nz * nx;
            const hz2 = ry - 0.18;
            let env = 0.2 + 0.5 * sky[i] - 0.5 * ry - 0.06 * rx - 0.2 * Math.exp(-hz2 * hz2 * 24);
            if (env < 0.02) env = 0.02;
            const f = g2[i];
            const flake = f > 0.43 ? (f - 0.43) * 11 : 0;
            // single droplets of metallic paint read darker than a closed film
            const film = D > 2 ? 1 : 0.55 + 0.225 * D;
            const k = (0.05 + 0.85 * env + 0.3 * h8) * film;
            const glint = 0.55 * h32 * film;
            r = pr * k + glint + flake * 0.85;
            g = pg * k + glint + flake * 0.88;
            b = pb * k + glint * 1.04 + flake * 0.95;
          }
        }
        const o = i << 2;
        if (transparent) {
          out[o] = L2S[((r >= 1 ? 1 : r <= 0 ? 0 : r) * L2S_N) | 0];
          out[o + 1] = L2S[((g >= 1 ? 1 : g <= 0 ? 0 : g) * L2S_N) | 0];
          out[o + 2] = L2S[((b >= 1 ? 1 : b <= 0 ? 0 : b) * L2S_N) | 0];
          out[o + 3] = (c * 255 + 0.5) | 0;
        } else {
          const k = 1 - c;
          const j = i * 3;
          r = bg[j] * k + r * c;
          g = bg[j + 1] * k + g * c;
          b = bg[j + 2] * k + b * c;
          out[o] = L2S[((r >= 1 ? 1 : r <= 0 ? 0 : r) * L2S_N) | 0];
          out[o + 1] = L2S[((g >= 1 ? 1 : g <= 0 ? 0 : g) * L2S_N) | 0];
          out[o + 2] = L2S[((b >= 1 ? 1 : b <= 0 ? 0 : b) * L2S_N) | 0];
          out[o + 3] = 255;
        }
      }
    }
  }
}

/**
 * A paint run: a thin wobbling trickle, a little wider where it leaves the
 * stroke, ending in a bead. Adds paint to buf and a rounded relief to rel.
 */
function drawRun(buf, rel, W, H, x0, y0, len, rw, css, rnd) {
  const y1 = y0 + len;
  const ph = rnd() * TAU, wob = (0.3 + 0.35 * rnd()) * css;
  const xAt = (yy) => x0 + wob * Math.sin((yy - y0) * (0.1 / css) + ph) * Math.min(1, (yy - y0) / (6 * css));
  const ya = Math.max(0, Math.floor(y0 - 0.2 * len)), yb = Math.min(H - 1, Math.ceil(y1));
  for (let yy = ya; yy <= yb; yy++) {
    const yc = yy + 0.5;
    const t = (yc - y0) / len;
    if (t < -0.2 || t > 1) continue;
    const neck = Math.max(0, 1 - Math.max(0, t) / 0.2);
    const hw = rw * 0.5 * (1 + 0.5 * neck * neck) * (1 - 0.15 * Math.max(0, t));
    const xc = xAt(Math.max(y0, yc));
    const xa = Math.max(0, Math.floor(xc - hw - 1)), xb = Math.min(W - 1, Math.ceil(xc + hw + 1));
    const fade = smoothstep(-0.2, 0.15, t);
    for (let xx = xa; xx <= xb; xx++) {
      const dx = Math.abs(xx + 0.5 - xc);
      const cov = hw + 0.5 - dx;
      if (cov <= 0) continue;
      const prof = dx < hw ? Math.sqrt(1 - (dx * dx) / (hw * hw)) : 0;
      const a = fade * (cov > 1 ? 1 : cov);
      buf[yy * W + xx] += 6.5 * a * (0.3 + 0.7 * prof);
      rel[yy * W + xx] += 1.15 * a * prof * (hw / css);
    }
  }
  const br = rw * (0.78 + 0.22 * rnd());
  const bx = xAt(y1), by = y1 - br * 0.25;
  dot(buf, W, H, bx, by, br, 10);
  dot(rel, W, H, bx, by, br, 1.3 * (br / css));
}

/** Visible preview width (css px) for a real sprayed width in cm: compressive, so every setting fits. */
export function previewWidthPx(cm, maxPx) {
  return 2.2 + (maxPx - 2.2) * Math.pow(Math.min(cm, 27) / 27, 0.6);
}

/** Visible width (css px) of each cap in its selector icon. */
export const ICON_WIDTH = { skinny: 2.6, standard: 5.6, fat: 11, calligraphy: 12 };
