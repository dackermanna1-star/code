// Screen-space post effects on the 480×270 world buffer (TECH §9).
//   PixelPass  — one getImageData/putImageData round trip, only while distort / chroma / VHS are
//                active: per-row horizontal displacement (scanline wave, VHS jitter and tracking
//                band), RGB split and VHS chroma bleed, noise, black lift.
//   overlays   — cached canvases for grain, vignette (wide + tight), CRT scanlines, edge pulses.
const W = 480;
const H = 270;

function makeCanvas(w, h) {
  const c = document.createElement('canvas');
  c.width = w;
  c.height = h;
  return c;
}

export class PixelPass {
  constructor() {
    this.out = null;
    this.o32 = null;
    this.rowShift = new Int16Array(H);
    this.rowNoise = new Float32Array(H);
  }

  /**
   * @param p { distort (px), chroma (px), vhs (0..1), t (s), rand () => [0,1), reduce (bool) }
   */
  run(ctx, p) {
    const img = ctx.getImageData(0, 0, W, H);
    const s32 = new Uint32Array(img.data.buffer);
    if (!this.out) {
      this.out = ctx.createImageData(W, H);
      this.o32 = new Uint32Array(this.out.data.buffer);
    }
    const o32 = this.o32;
    const rs = this.rowShift;
    const rn = this.rowNoise;
    const { distort = 0, chroma = 0, vhs = 0, t = 0, rand } = p;

    // Per-row displacement and noise.
    const band = vhs ? ((t * 26) % (H + 60)) - 30 : -999; // rolling tracking band
    for (let y = 0; y < H; y++) {
      let sh = 0;
      let nz = 0;
      if (distort) sh += distort * Math.sin(y * 0.105 + t * 7.3) * (0.65 + 0.35 * Math.sin(y * 0.031 - t * 2.3));
      if (vhs) {
        if (rand() < 0.025 * vhs) sh += rand() < 0.5 ? -1 : 1;
        const db = y - band;
        if (db >= 0 && db < 9) {
          const k = Math.sin((db / 9) * Math.PI);
          sh += (rand() - 0.3) * 9 * k * vhs * (p.reduce ? 0.4 : 1);
          nz = 0.3 * k * vhs;
        }
        if (y >= H - 5) { sh += (y - (H - 6)) * 2.5 * vhs; nz = Math.max(nz, 0.22 * vhs); } // head-switching
      }
      rs[y] = Math.round(sh);
      rn[y] = nz;
    }

    const cr = Math.round(chroma) + (vhs ? 2 : 0);       // red reads from the right…
    const cb = Math.round(chroma * 0.75) + (vhs ? 1 : 0); // …blue from the left
    const lift = vhs ? 7 * vhs : 0;
    const desat = vhs ? 0.18 * vhs : 0;
    const split = cr !== 0 || cb !== 0 || vhs;
    for (let y = 0; y < H; y++) {
      const row = y * W;
      const sh = rs[y];
      const nz = rn[y];
      if (!split && !nz) {
        // Pure displacement: shifted row copy with clamped edges.
        for (let x = 0; x < W; x++) {
          let sx = x - sh;
          sx = sx < 0 ? 0 : sx >= W ? W - 1 : sx;
          o32[row + x] = s32[row + sx];
        }
        continue;
      }
      for (let x = 0; x < W; x++) {
        let gx = x - sh;
        gx = gx < 0 ? 0 : gx >= W ? W - 1 : gx;
        let rx = gx + cr;
        rx = rx >= W ? W - 1 : rx < 0 ? 0 : rx;
        let bx = gx - cb;
        bx = bx < 0 ? 0 : bx >= W ? W - 1 : bx;
        const pg = s32[row + gx];
        let r = s32[row + rx] & 255;
        let g = (pg >> 8) & 255;
        let b = (s32[row + bx] >> 16) & 255;
        if (vhs) {
          // Chroma bleed: red smears to the right over a few px.
          const r2 = s32[row + (rx + 2 >= W ? W - 1 : rx + 2)] & 255;
          r = (r * 2 + r2) / 3;
          const l = 0.3 * r + 0.59 * g + 0.11 * b;
          r = r + (l - r) * desat + lift;
          g = g + (l - g) * desat + lift;
          b = b + (l - b) * desat + lift * 1.3;
        }
        if (nz) {
          const n = (rand() - 0.5) * 255 * nz;
          r += n;
          g += n;
          b += n;
        }
        r = r < 0 ? 0 : r > 255 ? 255 : r;
        g = g < 0 ? 0 : g > 255 ? 255 : g;
        b = b < 0 ? 0 : b > 255 ? 255 : b;
        o32[row + x] = 0xff000000 | (b << 16) | (g << 8) | r;
      }
    }
    ctx.putImageData(this.out, 0, 0);
  }
}

/** Grain tiles: gray noise centred on 50 % (neutral under 'overlay'). */
export function makeGrainTiles(rand, n = 3, size = 96) {
  const tiles = [];
  for (let k = 0; k < n; k++) {
    const c = makeCanvas(size, size);
    const x = c.getContext('2d');
    const img = x.createImageData(size, size);
    const d = img.data;
    for (let i = 0; i < d.length; i += 4) {
      // Mostly near-neutral with occasional strong specks: film, not TV snow.
      const u = rand() - 0.5;
      const v = 128 + Math.sign(u) * Math.pow(Math.abs(u) * 2, 1.6) * 110;
      d[i] = d[i + 1] = d[i + 2] = v;
      d[i + 3] = 255;
    }
    x.putImageData(img, 0, 0);
    tiles.push(c);
  }
  return tiles;
}

/** Radial vignette: transparent centre → black edges. inner/outer as fractions of the half-diagonal. */
export function makeVignette(inner, outer, maxAlpha = 1, color = '0,0,0') {
  const c = makeCanvas(W, H);
  const x = c.getContext('2d');
  const R = Math.hypot(W / 2, H / 2);
  // Slightly oval (wider than tall) to follow the 16:9 frame.
  x.translate(W / 2, H / 2);
  x.scale(1, 0.82);
  const g = x.createRadialGradient(0, 0, R * inner, 0, 0, R * outer);
  const N = 8;
  for (let i = 0; i <= N; i++) {
    const u = i / N;
    g.addColorStop(u, `rgba(${color},${(maxAlpha * u * u * (3 - 2 * u)).toFixed(3)})`);
  }
  x.fillStyle = g;
  x.fillRect(-W, -H, W * 2, H * 2);
  return c;
}

/** CRT: alternate-row scanlines + rounded-corner falloff (settings.crt). */
export function makeCrt() {
  const c = makeCanvas(W, H);
  const x = c.getContext('2d');
  x.fillStyle = 'rgba(0,0,0,0.2)';
  for (let y = 1; y < H; y += 2) x.fillRect(0, y, W, 1);
  // Phosphor mask hint: every third column a touch darker.
  x.fillStyle = 'rgba(0,0,0,0.05)';
  for (let i = 2; i < W; i += 3) x.fillRect(i, 0, 1, H);
  x.drawImage(makeVignette(0.62, 1.02, 0.75), 0, 0);
  // Tube corners.
  x.fillStyle = '#000';
  const r = 7;
  for (const [cx, cy, sx, sy] of [[0, 0, 1, 1], [W, 0, -1, 1], [0, H, 1, -1], [W, H, -1, -1]]) {
    for (let j = 0; j < r; j++) {
      const w = Math.round(r - Math.sqrt(Math.max(0, r * r - (r - j) * (r - j))));
      x.fillRect(sx > 0 ? cx : cx - w, sy > 0 ? cy + j : cy - j - 1, w, 1);
    }
  }
  return c;
}

/** Edge glow for pulse(color): transparent centre, color at the rim. */
export function makeEdgeGlow(color) {
  const c = makeCanvas(W, H);
  const x = c.getContext('2d');
  const R = Math.hypot(W / 2, H / 2);
  x.translate(W / 2, H / 2);
  x.scale(1, 0.8);
  const g = x.createRadialGradient(0, 0, R * 0.5, 0, 0, R * 1.05);
  g.addColorStop(0, 'rgba(0,0,0,0)');
  g.addColorStop(1, color);
  x.fillStyle = g;
  x.globalAlpha = 1;
  x.fillRect(-W, -H, W * 2, H * 2);
  return c;
}
