// Procedural stand-ins for every photo texture name used by src/render/surfaces.ts. They are
// used when public/assets/textures (CC0 photos) is missing or a file fails to load, so the game
// always looks decent. Each mimics the corresponding photo spec in
// scripts/assets/fetch_textures.py: same orientation rules (wood grain / brushing along U =
// image X), neutral grey for tintable textures (paint_wall, plastic, fabrics, carpet), similar
// mean colours and world scale.

import {
  SIZE,
  PIX,
  type Channel,
  type TexOutput,
  Img,
  Prng,
  channel,
  noise,
  fbm,
  ridged,
  cells,
  blur,
  warp,
  whiteNoise,
  gradientLUT,
  hex,
  mixRGB,
  css,
  smooth,
  fract,
  clamp01,
  makeCanvas,
  readRGBA,
  putImg,
  wrapDraw,
  rgbaChannel,
  type RGB,
} from "./kit.ts";

// ------------------------------------------------------------------ wood

interface WoodOpts {
  light: number;
  dark: number;
  /** Growth-ring lines across the tile (integer keeps it seamless). */
  rings: number;
  /** Large sweeping "cathedral" displacement (in rings). */
  sweep: number;
  /** Small wiggle displacement (in rings). */
  wiggle: number;
  seed: number;
  /** Fraction of each ring that is dark latewood. */
  late?: number;
  fiber?: number;
  pores?: number;
  knots?: number;
  contrast?: number;
  bump?: number;
}

/**
 * Flat-sawn board: growth rings run along U (image X) as thin dark latewood lines, displaced
 * by smooth low-frequency noise (cathedral arches) and per-ring tone variation, with fibre
 * streaks, optional open pores (oak/walnut) and knots (pine).
 */
function wood(o: WoodOpts): TexOutput {
  const rng = new Prng(o.seed);
  const sweep = noise(1, 2, o.seed); // one smooth arch system across the tile
  const sweep2 = noise(2, 3, o.seed + 3);
  const wig = noise(3, 10, o.seed + 5);
  const fiber = noise(2, 256, o.seed + 9);
  const fiber2 = noise(8, 256, o.seed + 13);
  const tone = fbm(2, 2, 3, o.seed + 21);
  const pores = o.pores ? noise(48, 256, o.seed + 31) : null;
  const knots: Array<{ x: number; y: number; r: number }> = [];
  for (let k = 0; k < (o.knots ?? 0); k++) knots.push({ x: rng.range(0, SIZE), y: rng.range(0, SIZE), r: rng.range(6, 10) });
  const late = o.late ?? 0.14;
  const contrast = o.contrast ?? 1;
  const lw = channel();
  const t = channel();
  let i = 0;
  for (let y = 0; y < SIZE; y++) {
    for (let x = 0; x < SIZE; x++, i++) {
      let v = (y / SIZE) * o.rings + (sweep[i] - 0.5) * o.sweep + (sweep2[i] - 0.5) * o.sweep * 0.35 + (wig[i] - 0.5) * o.wiggle;
      for (const k of knots) {
        let dx = x - k.x,
          dy = y - k.y;
        dx -= Math.round(dx / SIZE) * SIZE;
        dy -= Math.round(dy / SIZE) * SIZE;
        // rings flow around the knot: concentric ellipses near it, deflected lines further out
        const d2 = (dx * dx) / (k.r * k.r * 5) + (dy * dy) / (k.r * k.r);
        v += 2.2 * Math.exp(-d2 * 0.6);
      }
      const ring = fract(v);
      const ringId = Math.floor(v);
      // dark latewood: soft leading edge, sharp trailing edge
      const lv = smooth(1 - late, 1 - late * 0.3, ring) * (1 - smooth(0.97, 1, ring));
      lw[i] = lv;
      const ringTone = ((ringId * 2654435761) >>> 0) / 4294967296 - 0.5; // per-ring tone jitter
      t[i] = lv * 0.7 * contrast + (fiber[i] - 0.5) * (o.fiber ?? 0.3) + (fiber2[i] - 0.5) * 0.12 + (tone[i] - 0.5) * 0.22 + ringTone * 0.1;
    }
  }
  if (pores) for (let j = 0; j < PIX; j++) if (pores[j] > 0.82) t[j] += (pores[j] - 0.82) * 2.5;
  for (const k of knots) {
    for (let y = -k.r; y <= k.r; y++)
      for (let x = -k.r * 2; x <= k.r * 2; x++) {
        const d = (x * x) / 4 + y * y;
        if (d > k.r * k.r) continue;
        const px = (Math.round(k.x + x) + SIZE * 4) % SIZE,
          py = (Math.round(k.y + y) + SIZE * 4) % SIZE;
        const w = 1 - Math.sqrt(d) / k.r;
        t[py * SIZE + px] += w * 0.8;
      }
  }
  const lut = gradientLUT([
    [0, o.light],
    [0.6, o.dark],
    [1, darkenHex(o.dark, 0.55)],
  ]);
  const tt = channel();
  for (let j = 0; j < PIX; j++) tt[j] = clamp01(0.18 + t[j] * 0.85);
  const img = Img.fromGradient(tt, lut);
  const h = channel();
  for (let j = 0; j < PIX; j++) h[j] = 0.55 - lw[j] * 0.22 + fiber[j] * 0.25 + fiber2[j] * 0.1;
  const rough = channel();
  for (let j = 0; j < PIX; j++) rough[j] = 1.06 - lw[j] * 0.15 + (fiber[j] - 0.5) * 0.12;
  return { rgba: img.toRGBA(), height: h, bump: o.bump ?? 1.6, rough };
}

function darkenHex(h: number, k: number): number {
  const c = hex(h);
  return (Math.round(c[0] * k * 255) << 16) | (Math.round(c[1] * k * 255) << 8) | Math.round(c[2] * k * 255);
}

function woodFiber(): TexOutput {
  const a = noise(2, 256, 401),
    b = noise(6, 256, 402),
    c = ridged(1, 48, 4, 403);
  const tone = fbm(2, 4, 3, 404);
  const t = channel();
  for (let i = 0; i < PIX; i++) t[i] = clamp01(a[i] * 0.45 + b[i] * 0.25 + (1 - c[i]) * 0.45 + (tone[i] - 0.5) * 0.3 - 0.05);
  const lut = gradientLUT([
    [0, 0xdcc196],
    [0.55, 0xb48f5c],
    [0.85, 0x7a5a34],
    [1, 0x4a3420],
  ]);
  const img = Img.fromGradient(t, lut);
  const h = channel();
  for (let i = 0; i < PIX; i++) h[i] = 1 - t[i];
  return { rgba: img.toRGBA(), height: h, bump: 4, rough: 1 };
}

function plywood(): TexOutput {
  // rotary-cut birch veneer: wide, wavy, low-contrast figure
  return wood({ light: 0xe2c79d, dark: 0xc79e6a, rings: 5, sweep: 3.2, wiggle: 0.5, seed: 501, late: 0.35, fiber: 0.22, contrast: 0.5, bump: 1 });
}

function mdf(): TexOutput {
  const n = blur(whiteNoise(601), 1, 1);
  const f = fbm(6, 6, 3, 602);
  const img = Img.solid(hex(0xa67a4e));
  img.modulate(n, 0.08).modulate(f, 0.05);
  const h = channel();
  for (let i = 0; i < PIX; i++) h[i] = n[i] * 0.7 + f[i] * 0.3;
  return { rgba: img.toRGBA(), height: h, bump: 1.2, rough: 1 };
}

function particleboard(): TexOutput {
  const c = makeCanvas();
  const rng = new Prng(701);
  c.g.fillStyle = "#8a6a42";
  c.g.fillRect(0, 0, SIZE, SIZE);
  const pal = [0xc8a46e, 0xb8925c, 0xd9b886, 0xa07a48, 0x8a6a40, 0xe3c899, 0x9c7a4c];
  for (let k = 0; k < 2600; k++) {
    const x = rng.range(0, SIZE),
      y = rng.range(0, SIZE);
    const len = rng.range(2, 10),
      wid = rng.range(1, 3.5),
      ang = rng.range(0, Math.PI);
    const col = hex(pal[rng.int(0, pal.length - 1)]);
    const shade = rng.range(0.85, 1.1);
    c.g.fillStyle = css([col[0] * shade, col[1] * shade, col[2] * shade]);
    wrapDraw(x, y, len, (dx, dy) => {
      c.g.save();
      c.g.translate(x + dx, y + dy);
      c.g.rotate(ang);
      c.g.fillRect(-len / 2, -wid / 2, len, wid);
      c.g.restore();
    });
  }
  const d = readRGBA(c);
  const img = Img.fromRGBA(d);
  img.modulate(noise(64, 64, 702), 0.06);
  const h = img.luma();
  return { rgba: img.toRGBA(), height: h, bump: 2.5, rough: 1 };
}

// ------------------------------------------------------------------ walls & masonry

function paintWall(): TexOutput {
  // neutral off-white roller finish (tinted per room by geometry)
  const peel = noise(96, 96, 801),
    peel2 = noise(192, 192, 802),
    blot = fbm(3, 3, 3, 803);
  const h = channel();
  for (let i = 0; i < PIX; i++) h[i] = peel[i] * 0.6 + peel2[i] * 0.4;
  const img = Img.solid([0.875, 0.875, 0.87]);
  img.modulate(h, 0.025).modulate(blot, 0.025);
  const rough = channel();
  for (let i = 0; i < PIX; i++) rough[i] = 0.95 + h[i] * 0.1;
  // smooth painted drywall: the roller texture is barely perceptible
  return { rgba: img.toRGBA(), height: h, bump: 0.45, rough };
}

function damaskMotif(g: OffscreenCanvasRenderingContext2D | CanvasRenderingContext2D, cx: number, cy: number, s: number): void {
  // symmetric ornamental motif drawn as the left half + its mirror image
  for (const side of [-1, 1]) {
    g.save();
    g.translate(cx, cy);
    g.scale(side * s, s);
    g.beginPath();
    // central teardrop
    g.moveTo(0, -50);
    g.bezierCurveTo(-9, -36, -16, -14, -11, 2);
    g.bezierCurveTo(-7, 14, -3, 22, 0, 30);
    g.lineTo(0, -50);
    g.fill();
    // outward scroll
    g.beginPath();
    g.moveTo(-6, -8);
    g.bezierCurveTo(-30, -26, -50, -12, -44, 8);
    g.bezierCurveTo(-40, 22, -24, 24, -22, 12);
    g.bezierCurveTo(-21, 4, -30, 2, -32, 8);
    g.bezierCurveTo(-30, -4, -16, -6, -6, 2);
    g.closePath();
    g.fill();
    // lower leaf
    g.beginPath();
    g.moveTo(-3, 26);
    g.bezierCurveTo(-18, 30, -30, 44, -34, 58);
    g.bezierCurveTo(-20, 54, -8, 44, -3, 26);
    g.fill();
    // upper leaf
    g.beginPath();
    g.moveTo(-4, -40);
    g.bezierCurveTo(-18, -46, -26, -58, -24, -64);
    g.bezierCurveTo(-14, -58, -8, -50, -4, -40);
    g.fill();
    // dots
    g.beginPath();
    g.arc(-20, -26, 3.2, 0, Math.PI * 2);
    g.arc(-38, 34, 2.6, 0, Math.PI * 2);
    g.fill();
    g.restore();
  }
}

function wallpaper(): TexOutput {
  const c = makeCanvas();
  c.g.fillStyle = "#fff";
  c.g.fillRect(0, 0, SIZE, SIZE);
  c.g.fillStyle = "#000";
  // half-drop repeat: large motifs + small fillers
  for (const [x, y] of [
    [64, 64],
    [192, 192],
  ])
    wrapDraw(x, y, 70, (dx, dy) => damaskMotif(c.g, x + dx, y + dy, 0.95));
  for (const [x, y] of [
    [192, 64],
    [64, 192],
  ])
    wrapDraw(x, y, 40, (dx, dy) => damaskMotif(c.g, x + dx, y + dy, 0.42));
  const m = rgbaChannel(readRGBA(c), 0); // 1 = background, 0 = ornament
  blur(m, 1, 1);
  const paper = noise(128, 128, 902),
    fib = noise(4, 160, 903);
  const bg: RGB = hex(0xcfc3a4),
    orn: RGB = hex(0xae9b74);
  const img = new Img();
  for (let i = 0; i < PIX; i++) {
    const t = m[i];
    img.r[i] = orn[0] + (bg[0] - orn[0]) * t;
    img.g[i] = orn[1] + (bg[1] - orn[1]) * t;
    img.b[i] = orn[2] + (bg[2] - orn[2]) * t;
  }
  img.modulate(paper, 0.03).modulate(fib, 0.02);
  const h = channel();
  for (let i = 0; i < PIX; i++) h[i] = (1 - m[i]) * 0.5 + paper[i] * 0.3;
  const rough = channel();
  for (let i = 0; i < PIX; i++) rough[i] = 0.85 + m[i] * 0.25;
  return { rgba: img.toRGBA(), height: h, bump: 1.5, rough };
}

function gypsum(): TexOutput {
  const cl = cells(36, 1001);
  const g1 = noise(64, 64, 1002),
    g2 = noise(160, 160, 1003),
    blot = fbm(4, 4, 3, 1004);
  const h = channel();
  const img = Img.solid(hex(0xd8d3c8));
  for (let i = 0; i < PIX; i++) {
    const pit = cl.id[i] > 0.35 ? smooth(0.2, 0.08, cl.f1[i]) : 0;
    h[i] = 0.6 + g1[i] * 0.2 + g2[i] * 0.2 - pit * 0.6;
    const k = 1 - pit * 0.25 + (g2[i] - 0.5) * 0.08 + (blot[i] - 0.5) * 0.06;
    img.r[i] *= k;
    img.g[i] *= k;
    img.b[i] *= k * 0.99;
  }
  return { rgba: img.toRGBA(), height: h, bump: 3, rough: 1 };
}

function plasterCeiling(): TexOutput {
  // knock-down plaster: flattened splotches with soft shadows between them
  const cl = cells(10, 1101);
  const wx = fbm(8, 8, 3, 1104),
    wy = fbm(8, 8, 3, 1105);
  const f1 = warp(cl.f1, wx, wy, 26);
  const id = warp(cl.id, wx, wy, 26);
  const wn = noise(24, 24, 1102),
    fine = noise(128, 128, 1103);
  const h = channel();
  for (let i = 0; i < PIX; i++) {
    const r = 0.5 + id[i] * 0.14 + (wn[i] - 0.5) * 0.2;
    const plate = smooth(r + 0.05, r - 0.04, f1[i]);
    h[i] = plate * (0.5 + id[i] * 0.15) + fine[i] * 0.12 + wn[i] * 0.08;
  }
  const img = Img.solid(hex(0xebe9e4));
  img.modulate(h, 0.035);
  return { rgba: img.toRGBA(), height: h, bump: 2.2, rough: 1 };
}

function concrete(): TexOutput {
  const mott = fbm(5, 5, 5, 1201);
  const grain = noise(128, 128, 1202);
  const grain2 = whiteNoise(1203);
  const holes = cells(22, 1204);
  const lut = gradientLUT([
    [0, 0x858379],
    [0.5, 0x9c9a93],
    [1, 0xb1afa8],
  ]);
  const img = Img.fromGradient(mott, lut);
  const h = channel();
  for (let i = 0; i < PIX; i++) {
    const hole = holes.id[i] > 0.55 ? smooth(0.11, 0.04, holes.f1[i]) : 0;
    const k = 1 + (grain[i] - 0.5) * 0.08 + (grain2[i] - 0.5) * 0.05 - hole * 0.45;
    img.r[i] *= k;
    img.g[i] *= k;
    img.b[i] *= k;
    h[i] = 0.5 + mott[i] * 0.15 + grain[i] * 0.15 + grain2[i] * 0.05 - hole * 0.7;
  }
  return { rgba: img.toRGBA(), height: h, bump: 2.2, rough: 1 };
}

function concreteBroken(): TexOutput {
  // fractured concrete: rounded aggregate pebbles of mixed size/colour embedded in a rough,
  // pitted cement matrix
  const big = cells(12, 1301),
    small = cells(26, 1305),
    voids = cells(40, 1306);
  const wx = noise(16, 16, 1307),
    wy = noise(16, 16, 1308);
  const sand = whiteNoise(1302),
    sand2 = noise(96, 96, 1303),
    tone = fbm(3, 3, 3, 1304);
  const img = new Img();
  const h = channel();
  const matrix: RGB = hex(0x9a968d);
  const stones: RGB[] = [hex(0x8a8580), hex(0x6f6a64), hex(0xa8a196), hex(0x7d7266), hex(0xbab3a7), hex(0x5d5954), hex(0x8f7d6a)];
  for (let i = 0; i < PIX; i++) {
    const jit = (wx[i] - 0.5) * 0.12 + (wy[i] - 0.5) * 0.08;
    let stone = 0,
      sid = 0,
      dome = 0;
    if (big.id[i] > 0.42) {
      const r = 0.3 + big.id[i] * 0.16;
      const s = smooth(r + 0.03, r - 0.03, big.f1[i] + jit);
      if (s > stone) {
        stone = s;
        sid = big.id[i];
        dome = 1 - (big.f1[i] / r) ** 2;
      }
    }
    if (small.id[i] > 0.55) {
      const r = 0.26 + small.id[i] * 0.14;
      const s = smooth(r + 0.04, r - 0.04, small.f1[i] + jit);
      if (s > stone) {
        stone = s;
        sid = small.id[i];
        dome = 1 - (small.f1[i] / r) ** 2;
      }
    }
    const sc = stones[Math.floor(sid * 977) % stones.length];
    const voidPit = voids.id[i] > 0.82 ? smooth(0.16, 0.06, voids.f1[i]) : 0;
    const k = (1 + (sand[i] - 0.5) * 0.22 + (sand2[i] - 0.5) * 0.12) * (0.92 + tone[i] * 0.16) * (1 - voidPit * 0.5);
    const rim = stone * (1 - stone) * 4; // dark seam around pebbles
    img.r[i] = (matrix[0] + (sc[0] - matrix[0]) * stone) * k * (1 - rim * 0.25);
    img.g[i] = (matrix[1] + (sc[1] - matrix[1]) * stone) * k * (1 - rim * 0.25);
    img.b[i] = (matrix[2] + (sc[2] - matrix[2]) * stone) * k * (1 - rim * 0.25);
    h[i] = stone * (0.35 + Math.max(0, dome) * 0.45) + sand[i] * 0.15 + sand2[i] * 0.12 - voidPit * 0.5;
  }
  return { rgba: img.toRGBA(), height: h, bump: 4, rough: 1 };
}

function insulation(): TexOutput {
  const base = fbm(6, 6, 5, 1401);
  const wx = fbm(4, 4, 3, 1402),
    wy = fbm(4, 4, 3, 1403);
  const fluff = warp(base, wx, wy, 40);
  const c = makeCanvas();
  const lut = gradientLUT([
    [0, 0xb86a66],
    [0.45, 0xdc928c],
    [1, 0xf3c3bb],
  ]);
  putImg(c, Img.fromGradient(fluff, lut));
  // loose glass fibres
  const rng = new Prng(1404);
  c.g.lineWidth = 0.6;
  for (let k = 0; k < 420; k++) {
    const x = rng.range(0, SIZE),
      y = rng.range(0, SIZE),
      len = rng.range(10, 40),
      a = rng.range(0, Math.PI * 2);
    c.g.strokeStyle = rng.chance(0.6) ? "rgba(255,226,220,0.35)" : "rgba(150,80,76,0.3)";
    wrapDraw(x, y, len, (dx, dy) => {
      c.g.beginPath();
      c.g.moveTo(x + dx, y + dy);
      c.g.quadraticCurveTo(x + dx + Math.cos(a + 0.8) * len * 0.5, y + dy + Math.sin(a + 0.8) * len * 0.5, x + dx + Math.cos(a) * len, y + dy + Math.sin(a) * len);
      c.g.stroke();
    });
  }
  const d = readRGBA(c);
  const h = rgbaChannel(d, 4);
  return { rgba: d, height: h, bump: 3, rough: 1 };
}

// ------------------------------------------------------------------ ceramics & stone

function tilePorcelain(): TexOutput {
  const sp = whiteNoise(1501),
    m = fbm(6, 6, 3, 1502),
    f = noise(96, 96, 1503);
  const img = Img.solid(hex(0xcfcbc3));
  for (let i = 0; i < PIX; i++) {
    let k = 1 + (m[i] - 0.5) * 0.06 + (f[i] - 0.5) * 0.04;
    if (sp[i] > 0.985) k -= 0.28;
    else if (sp[i] < 0.012) k += 0.12;
    img.r[i] *= k;
    img.g[i] *= k;
    img.b[i] *= k;
  }
  const h = channel();
  for (let i = 0; i < PIX; i++) h[i] = f[i] * 0.3 + m[i] * 0.2;
  return { rgba: img.toRGBA(), height: h, bump: 0.6, rough: 1 };
}

function tileGlazedWhite(): TexOutput {
  const wave = fbm(3, 3, 3, 1601),
    pin = whiteNoise(1602),
    f = noise(64, 64, 1603);
  const img = Img.solid(hex(0xf1f0eb));
  const h = channel();
  for (let i = 0; i < PIX; i++) {
    const p = pin[i] > 0.997 ? 1 : 0;
    const k = 1 + (wave[i] - 0.5) * 0.02 - p * 0.15;
    img.r[i] *= k;
    img.g[i] *= k;
    img.b[i] *= k;
    h[i] = wave[i] * 0.6 + f[i] * 0.1 - p * 0.4;
  }
  return { rgba: img.toRGBA(), height: h, bump: 0.8, rough: 1 };
}

function grout(): TexOutput {
  const s = whiteNoise(1701),
    s2 = noise(128, 128, 1702),
    m = fbm(4, 4, 3, 1703);
  const img = Img.solid(hex(0x8f8b84));
  const h = channel();
  for (let i = 0; i < PIX; i++) {
    const k = 1 + (s[i] - 0.5) * 0.22 + (s2[i] - 0.5) * 0.1 + (m[i] - 0.5) * 0.08;
    img.r[i] *= k;
    img.g[i] *= k;
    img.b[i] *= k;
    h[i] = s[i] * 0.5 + s2[i] * 0.5;
  }
  return { rgba: img.toRGBA(), height: h, bump: 2.5, rough: 1 };
}

function ceramicGlaze(): TexOutput {
  const m = fbm(3, 3, 3, 1801),
    f = noise(48, 48, 1802);
  const img = Img.solid(hex(0xf4f3ef));
  img.modulate(m, 0.012);
  const h = channel();
  for (let i = 0; i < PIX; i++) h[i] = m[i] * 0.5 + f[i] * 0.1;
  return { rgba: img.toRGBA(), height: h, bump: 0.5, rough: 1 };
}

function ceramicBisque(): TexOutput {
  const g = whiteNoise(1901),
    g2 = noise(100, 100, 1902),
    m = fbm(4, 4, 3, 1903);
  const img = Img.solid(hex(0xd3cabc));
  const h = channel();
  for (let i = 0; i < PIX; i++) {
    const k = 1 + (g[i] - 0.5) * 0.1 + (g2[i] - 0.5) * 0.08 + (m[i] - 0.5) * 0.05;
    img.r[i] *= k;
    img.g[i] *= k;
    img.b[i] *= k;
    h[i] = g[i] * 0.4 + g2[i] * 0.6;
  }
  return { rgba: img.toRGBA(), height: h, bump: 2.2, rough: 1 };
}

function granite(): TexOutput {
  // dark salt-and-pepper granite: mineral grains of different colours
  const a = cells(46, 2001),
    b = cells(90, 2002);
  const m = fbm(4, 4, 3, 2003);
  const mins: Array<[number, RGB]> = [
    [0.5, hex(0x1b1b1d)],
    [0.78, hex(0x3d3d41)],
    [0.9, hex(0x6b6a6c)],
    [0.96, hex(0xb4b0aa)],
    [1.01, hex(0x7c6058)],
  ];
  const pick = (v: number): RGB => {
    for (const [t, c] of mins) if (v < t) return c;
    return mins[0][1];
  };
  const img = new Img();
  for (let i = 0; i < PIX; i++) {
    const big = pick(a.id[i]);
    const small = pick(b.id[i]);
    const useSmall = b.id[i] > 0.6 ? 0.55 : 0;
    const c = mixRGB(big, small, useSmall);
    const k = 0.92 + m[i] * 0.16;
    img.r[i] = c[0] * k;
    img.g[i] = c[1] * k;
    img.b[i] = c[2] * k;
  }
  const h = channel();
  for (let i = 0; i < PIX; i++) h[i] = smooth(0, 0.08, a.f2[i] - a.f1[i]) * 0.3;
  return { rgba: img.toRGBA(), height: h, bump: 0.5, rough: 1 };
}

function marble(): TexOutput {
  // Carrara-like: warm white ground, soft cloudy grey drifts, thin branching grey veins with a
  // faint halo; veins run diagonally and vary in strength along their length
  const f = fbm(2, 2, 5, 2101),
    f2 = fbm(4, 4, 4, 2102),
    cloud = fbm(2, 2, 4, 2103),
    strength = fbm(3, 3, 3, 2104),
    fine = ridged(6, 6, 3, 2105);
  const img = new Img();
  const base: RGB = hex(0xeeebe5),
    drift: RGB = hex(0xcfcac2),
    vein: RGB = hex(0x7f7b77);
  const veinMask = channel();
  let i = 0;
  for (let y = 0; y < SIZE; y++)
    for (let x = 0; x < SIZE; x++, i++) {
      const a = ((x + y * 2) / SIZE) * Math.PI * 2;
      const v = Math.abs(Math.sin(a + f[i] * 5.0 + f2[i] * 1.5));
      const v2 = Math.abs(Math.sin(((x * 3 - y) / SIZE) * Math.PI * 2 + f2[i] * 6));
      const st = smooth(0.35, 0.75, strength[i]);
      veinMask[i] = Math.max(smooth(0.05, 0.0, v) * (0.35 + st * 0.65), smooth(0.03, 0.0, v2) * 0.35 * st, smooth(0.93, 0.99, fine[i]) * 0.25);
    }
  const halo = blur(Float32Array.from(veinMask), 3, 2);
  for (let j = 0; j < PIX; j++) {
    let c = mixRGB(base, drift, smooth(0.45, 0.85, cloud[j]) * 0.6 + halo[j] * 0.5);
    c = mixRGB(c, vein, veinMask[j]);
    img.r[j] = c[0];
    img.g[j] = c[1];
    img.b[j] = c[2];
  }
  return { rgba: img.toRGBA(), height: null, rough: 1 };
}

// ------------------------------------------------------------------ metals

function steelBrushed(): TexOutput {
  const a = noise(2, 256, 2201),
    b = noise(6, 256, 2202),
    c = noise(1, 64, 2203),
    sm = fbm(3, 3, 3, 2204);
  const img = Img.solid(hex(0xa9abae));
  const h = channel();
  const rough = channel();
  for (let i = 0; i < PIX; i++) {
    const s = a[i] * 0.5 + b[i] * 0.35 + c[i] * 0.15;
    const k = 1 + (s - 0.5) * 0.16 + (sm[i] - 0.5) * 0.05;
    img.r[i] *= k;
    img.g[i] *= k;
    img.b[i] *= k * 1.01;
    h[i] = s;
    rough[i] = 0.9 + s * 0.2 + (sm[i] - 0.5) * 0.15;
  }
  return { rgba: img.toRGBA(), height: h, bump: 0.8, rough };
}

function metalPainted(): TexOutput {
  const p = noise(64, 64, 2301),
    p2 = noise(128, 128, 2302),
    m = fbm(3, 3, 3, 2303);
  const img = Img.solid(hex(0xf0efea));
  img.modulate(m, 0.012);
  const h = channel();
  for (let i = 0; i < PIX; i++) h[i] = p[i] * 0.6 + p2[i] * 0.4;
  return { rgba: img.toRGBA(), height: h, bump: 0.7, rough: 1 };
}

function metalRaw(): TexOutput {
  // galvanised / mill-finish steel: spangle crystals + smudges
  const sp = cells(9, 2401),
    smudge = fbm(3, 3, 4, 2402),
    fine = noise(128, 128, 2403);
  const img = new Img();
  const rough = channel();
  let i = 0;
  for (let y = 0; y < SIZE; y++)
    for (let x = 0; x < SIZE; x++, i++) {
      const id = sp.id[i];
      // directional sheen per crystal, periodic over the tile (integer wave numbers) so the
      // texture stays seamless
      const dir = id * Math.PI * 2;
      const kx = Math.round(Math.cos(dir) * 6),
        ky = Math.round(Math.sin(dir) * 6);
      const grad = Math.sin(((x * kx + y * ky) / SIZE) * Math.PI * 2 + id * 10) * 0.5 + 0.5;
      const base = 0.52 + id * 0.16 + grad * 0.05;
      const k = base * (0.92 + smudge[i] * 0.14) + (fine[i] - 0.5) * 0.03;
      img.r[i] = k;
      img.g[i] = k * 1.005;
      img.b[i] = k * 1.02;
      rough[i] = 0.8 + id * 0.3 + (smudge[i] - 0.5) * 0.4;
    }
  return { rgba: img.toRGBA(), height: fine, bump: 0.4, rough };
}

function aluminum(): TexOutput {
  const a = noise(4, 256, 2501),
    f = noise(128, 128, 2502),
    m = fbm(3, 3, 3, 2503);
  const img = Img.solid(hex(0xc3c6c9));
  const rough = channel();
  for (let i = 0; i < PIX; i++) {
    const k = 1 + (a[i] - 0.5) * 0.06 + (f[i] - 0.5) * 0.03 + (m[i] - 0.5) * 0.04;
    img.r[i] *= k;
    img.g[i] *= k;
    img.b[i] *= k;
    rough[i] = 0.92 + (a[i] - 0.5) * 0.2 + (m[i] - 0.5) * 0.15;
  }
  return { rgba: img.toRGBA(), height: a, bump: 0.5, rough };
}

function copper(): TexOutput {
  // tarnished copper: warm metal with darker oxidised drifts, fingerprint smudges, fine scratches
  const t = fbm(3, 3, 5, 2601),
    f = noise(96, 96, 2602),
    smudge = fbm(6, 6, 3, 2603),
    scratch = noise(2, 256, 2604);
  const lut = gradientLUT([
    [0, 0x7a4630],
    [0.45, 0xae6b48],
    [0.8, 0xc8845e],
    [1, 0xd69670],
  ]);
  const img = Img.fromGradient(t, lut);
  const rough = channel();
  for (let i = 0; i < PIX; i++) {
    const sm = smooth(0.6, 0.85, smudge[i]);
    const k = 1 + (f[i] - 0.5) * 0.05 + (scratch[i] - 0.5) * 0.06 - sm * 0.08;
    img.r[i] *= k;
    img.g[i] *= k;
    img.b[i] *= k;
    rough[i] = 0.85 + (1 - t[i]) * 0.25 + sm * 0.5 + (scratch[i] - 0.5) * 0.2;
  }
  return { rgba: img.toRGBA(), height: scratch, bump: 0.4, rough };
}

// ------------------------------------------------------------------ plastics, rubber

function plastic(): TexOutput {
  // neutral, finely stippled moulded plastic (tinted by geometry)
  const s = noise(128, 128, 2701),
    s2 = whiteNoise(2702),
    m = fbm(3, 3, 3, 2703);
  const img = Img.solid([0.81, 0.81, 0.81]);
  img.modulate(m, 0.015).modulate(s, 0.015);
  const h = channel();
  for (let i = 0; i < PIX; i++) h[i] = s[i] * 0.7 + s2[i] * 0.3;
  return { rgba: img.toRGBA(), height: h, bump: 0.9, rough: 1 };
}

function rubber(): TexOutput {
  const s = whiteNoise(2801),
    s2 = noise(80, 80, 2802),
    m = fbm(4, 4, 3, 2803);
  const img = Img.solid(hex(0x2c2c2c));
  img.modulate(s2, 0.12).modulate(m, 0.1);
  const h = channel();
  for (let i = 0; i < PIX; i++) h[i] = s[i] * 0.4 + s2[i] * 0.6;
  return { rgba: img.toRGBA(), height: h, bump: 1.5, rough: 1 };
}

// ------------------------------------------------------------------ soft goods

/** Woven cloth: `threads` threads across the tile, plain (1/1) or twill (2/2) weave. */
function weave(threads: number, twill: boolean, base: number, contrast: number, seed: number, fuzz: number): TexOutput {
  const cw = SIZE / threads;
  const slubX = noise(threads, 4, seed),
    slubY = noise(4, threads, seed + 1);
  const fz = blur(whiteNoise(seed + 2), 1, 1);
  const tone = fbm(3, 3, 3, seed + 3);
  const h = channel();
  const img = Img.solid([base, base, base]);
  let i = 0;
  for (let y = 0; y < SIZE; y++) {
    const cy = Math.floor(y / cw);
    const fy = (y % cw) / cw;
    for (let x = 0; x < SIZE; x++, i++) {
      const cx = Math.floor(x / cw);
      const fx = (x % cw) / cw;
      // plain weave alternates every thread; 2/2 twill shifts a 2-over-2-under run per row
      const over = twill ? ((cx + cy) & 3) < 2 : ((cx + cy) & 1) === 0;
      // thread cross-section profile
      const warpProf = Math.sin(fx * Math.PI);
      const weftProf = Math.sin(fy * Math.PI);
      const prof = over ? warpProf : weftProf;
      const slub = over ? slubX[i] : slubY[i];
      h[i] = prof * 0.8 + (fz[i] - 0.5) * fuzz;
      const k = 1 - (1 - prof) * contrast + (slub - 0.5) * 0.12 + (fz[i] - 0.5) * fuzz * 0.5 + (tone[i] - 0.5) * 0.05;
      img.r[i] *= k;
      img.g[i] *= k;
      img.b[i] *= k;
    }
  }
  return { rgba: img.toRGBA(), height: h, bump: 2.2, rough: 1 };
}

function carpet(): TexOutput {
  const w = whiteNoise(3001);
  const tuft = blur(whiteNoise(3002), 1, 1);
  const clump = fbm(16, 16, 3, 3003),
    wear = fbm(3, 3, 3, 3004);
  const img = Img.solid([0.77, 0.77, 0.77]);
  const h = channel();
  for (let i = 0; i < PIX; i++) {
    const v = tuft[i] * 0.6 + w[i] * 0.2 + clump[i] * 0.2;
    const k = 0.8 + v * 0.35 + (wear[i] - 0.5) * 0.06;
    img.r[i] *= k;
    img.g[i] *= k;
    img.b[i] *= k;
    h[i] = v;
  }
  return { rgba: img.toRGBA(), height: h, bump: 3, rough: 1 };
}

function leather(): TexOutput {
  const p = cells(52, 3101),
    crease = ridged(4, 4, 4, 3102),
    tone = fbm(3, 3, 4, 3103);
  const lut = gradientLUT([
    [0, 0x4a2d1b],
    [0.5, 0x6d4529],
    [1, 0x8a5c38],
  ]);
  const img = Img.fromGradient(tone, lut);
  const h = channel();
  const rough = channel();
  for (let i = 0; i < PIX; i++) {
    const edge = p.f2[i] - p.f1[i];
    const pebble = smooth(0, 0.25, edge);
    const cr = smooth(0.82, 0.98, crease[i]);
    const k = 0.82 + pebble * 0.22 - cr * 0.25;
    img.r[i] *= k;
    img.g[i] *= k;
    img.b[i] *= k;
    h[i] = pebble * 0.7 - cr * 0.5;
    rough[i] = 1.15 - pebble * 0.3 + cr * 0.2;
  }
  return { rgba: img.toRGBA(), height: h, bump: 2.5, rough };
}

function foam(): TexOutput {
  const a = cells(96, 3201),
    b = cells(44, 3202),
    m = fbm(4, 4, 3, 3203);
  const img = Img.solid(hex(0xd0a64c));
  const h = channel();
  for (let i = 0; i < PIX; i++) {
    const pore = smooth(0.36, 0.12, a.f1[i]) * 0.6 + smooth(0.3, 0.08, b.f1[i]) * 0.45;
    const k = 1 - pore * 0.28 + (m[i] - 0.5) * 0.08;
    img.r[i] *= k;
    img.g[i] *= k * 0.98;
    img.b[i] *= k * 0.9;
    h[i] = 1 - pore;
  }
  return { rgba: img.toRGBA(), height: h, bump: 3.5, rough: 1 };
}

function paper(): TexOutput {
  const f1 = noise(3, 256, 3301),
    f2 = noise(256, 3, 3302),
    g = whiteNoise(3303),
    m = fbm(4, 4, 3, 3304);
  const img = Img.solid(hex(0xeeeae0));
  const h = channel();
  for (let i = 0; i < PIX; i++) {
    const fib = (f1[i] + f2[i]) * 0.5;
    const k = 1 + (fib - 0.5) * 0.04 + (g[i] - 0.5) * 0.025 + (m[i] - 0.5) * 0.03;
    img.r[i] *= k;
    img.g[i] *= k;
    img.b[i] *= k;
    h[i] = fib * 0.6 + g[i] * 0.4;
  }
  return { rgba: img.toRGBA(), height: h, bump: 1, rough: 1 };
}

function cardboard(): TexOutput {
  const f1 = noise(2, 256, 3401),
    f2 = noise(256, 2, 3402),
    specks = whiteNoise(3403),
    m = fbm(4, 4, 4, 3404);
  const img = Img.solid(hex(0xb18a5b));
  const h = channel();
  let i = 0;
  for (let y = 0; y < SIZE; y++)
    for (let x = 0; x < SIZE; x++, i++) {
      const flute = Math.sin((x / SIZE) * Math.PI * 2 * 48) * 0.5 + 0.5;
      const fib = f1[i] * 0.5 + f2[i] * 0.5;
      let k = 1 + (fib - 0.5) * 0.1 + (m[i] - 0.5) * 0.08 + (flute - 0.5) * 0.025;
      if (specks[i] > 0.992) k -= 0.3;
      img.r[i] *= k;
      img.g[i] *= k;
      img.b[i] *= k;
      h[i] = flute * 0.5 + fib * 0.3 + specks[i] * 0.2;
    }
  return { rgba: img.toRGBA(), height: h, bump: 1.4, rough: 1 };
}

function soil(): TexOutput {
  const cl = cells(18, 3501),
    peb = cells(30, 3502),
    g = whiteNoise(3503),
    m = fbm(5, 5, 4, 3504);
  const img = new Img();
  const h = channel();
  const dirt: RGB = hex(0x3b2a1e),
    dirt2: RGB = hex(0x2a1d14),
    pebble: RGB = hex(0x8a7a66),
    bark: RGB = hex(0x7a4a2a),
    perlite: RGB = hex(0xe6e2d8);
  for (let i = 0; i < PIX; i++) {
    const clump = 1 - cl.f1[i];
    let c = mixRGB(dirt2, dirt, clump * 0.8 + m[i] * 0.4);
    let hh = clump * 0.5 + g[i] * 0.2;
    const pid = peb.id[i];
    const pin = smooth(0.32, 0.22, peb.f1[i]);
    if (pid > 0.93) {
      c = mixRGB(c, perlite, pin);
      hh += pin * 0.4;
    } else if (pid > 0.85) {
      c = mixRGB(c, pebble, pin);
      hh += pin * 0.5;
    } else if (pid > 0.78) {
      c = mixRGB(c, bark, pin * 0.8);
      hh += pin * 0.3;
    }
    const k = 0.85 + g[i] * 0.3;
    img.r[i] = c[0] * k;
    img.g[i] = c[1] * k;
    img.b[i] = c[2] * k;
    h[i] = hh;
  }
  return { rgba: img.toRGBA(), height: h, bump: 3.5, rough: 1 };
}

function foliage(): TexOutput {
  // leaf blade: midrib along U with lateral veins, waxy surface
  const c = makeCanvas();
  const base = fbm(3, 3, 4, 3601);
  const lut = gradientLUT([
    [0, 0x2c5220],
    [0.5, 0x416e2c],
    [1, 0x5a8a3a],
  ]);
  putImg(c, Img.fromGradient(base, lut));
  const g = c.g;
  for (const yc of [64, 192]) {
    g.strokeStyle = "rgba(170,205,120,0.85)";
    g.lineWidth = 3;
    g.beginPath();
    g.moveTo(0, yc);
    g.lineTo(SIZE, yc);
    g.stroke();
    g.lineWidth = 1.3;
    g.strokeStyle = "rgba(150,190,105,0.6)";
    for (let x = -32; x < SIZE + 32; x += 22) {
      for (const s of [-1, 1]) {
        g.beginPath();
        g.moveTo(x, yc);
        g.quadraticCurveTo(x + 18, yc + s * 26, x + 44, yc + s * 58);
        g.stroke();
      }
    }
  }
  const d = readRGBA(c);
  const img = Img.fromRGBA(d);
  img.modulate(noise(96, 96, 3602), 0.05);
  const h = img.luma();
  const rough = channel();
  for (let i = 0; i < PIX; i++) rough[i] = 0.9 + (1 - h[i]) * 0.2;
  return { rgba: img.toRGBA(), height: h, bump: 1.6, rough };
}

function asphalt(): TexOutput {
  const g = whiteNoise(3701),
    st = cells(40, 3702),
    m = fbm(4, 4, 4, 3703);
  const img = Img.solid(hex(0x3a3a3c));
  const h = channel();
  for (let i = 0; i < PIX; i++) {
    const stone = st.id[i] > 0.7 ? smooth(0.35, 0.2, st.f1[i]) : 0;
    const k = 0.85 + g[i] * 0.25 + stone * 0.35 + (m[i] - 0.5) * 0.15;
    img.r[i] *= k;
    img.g[i] *= k;
    img.b[i] *= k;
    h[i] = g[i] * 0.4 + stone * 0.6;
  }
  return { rgba: img.toRGBA(), height: h, bump: 2.5, rough: 1 };
}

/** Generic fallback for unknown texture names (neutral grey grain, seeded by name). */
export function genericTexture(name: string): TexOutput {
  let seed = 7;
  for (let k = 0; k < name.length; k++) seed = (Math.imul(seed, 31) + name.charCodeAt(k)) | 0;
  const m = fbm(4, 4, 4, seed),
    g = noise(96, 96, seed + 1);
  const img = Img.solid([0.7, 0.7, 0.7]);
  img.modulate(m, 0.08).modulate(g, 0.05);
  const h = channel();
  for (let i = 0; i < PIX; i++) h[i] = m[i] * 0.5 + g[i] * 0.5;
  return { rgba: img.toRGBA(), height: h, bump: 1, rough: 1 };
}

/** Procedural fallback generators keyed by manifest texture name. */
export const MATERIAL_GENERATORS: Readonly<Record<string, () => TexOutput>> = {
  wood_oak: () => wood({ light: 0xc9a06a, dark: 0x8d6339, rings: 15, sweep: 2.6, wiggle: 0.5, seed: 101, late: 0.16, pores: 1, bump: 1.6 }),
  wood_walnut: () => wood({ light: 0x7c5437, dark: 0x40271a, rings: 12, sweep: 3.2, wiggle: 0.7, seed: 201, late: 0.22, pores: 1, contrast: 1.05, bump: 1.4 }),
  wood_pine: () => wood({ light: 0xdcb97e, dark: 0xa8743d, rings: 9, sweep: 2.2, wiggle: 0.4, seed: 301, late: 0.24, knots: 1, contrast: 1.2, bump: 1.8 }),
  wood_fiber: woodFiber,
  plywood,
  mdf,
  particleboard,
  paint_wall: paintWall,
  wallpaper,
  gypsum,
  plaster_ceiling: plasterCeiling,
  concrete,
  concrete_broken: concreteBroken,
  insulation,
  tile_porcelain: tilePorcelain,
  tile_glazed_white: tileGlazedWhite,
  grout,
  ceramic_glaze: ceramicGlaze,
  ceramic_bisque: ceramicBisque,
  granite,
  marble,
  steel_brushed: steelBrushed,
  metal_painted: metalPainted,
  metal_raw: metalRaw,
  aluminum,
  copper,
  plastic,
  rubber,
  fabric_upholstery: () => weave(64, true, 0.77, 0.16, 3801, 0.3),
  fabric_cotton: () => weave(85, false, 0.86, 0.18, 3901, 0.18),
  carpet,
  leather,
  foam,
  paper,
  cardboard,
  soil,
  foliage,
  asphalt,
};
