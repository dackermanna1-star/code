// Procedural printed / decorative textures: book covers and page blocks, paintings, poster,
// photo print, persian rug, clock face, food and bottle labels, printed paper. Each one fills
// a whole tile so a face mapped to exactly one tile (part uvOffset = half the face size and a
// surface worldSize equal to the face size) shows the complete artwork; partial faces show a
// plausible crop.

import {
  SIZE,
  PIX,
  type TexOutput,
  type Ctx2D,
  Img,
  Prng,
  channel,
  noise,
  fbm,
  blur,
  whiteNoise,
  hex,
  makeCanvas,
  readRGBA,
  putImg,
  fitText,
  FONT_SANS,
  FONT_SERIF,
  FONT_COND,
} from "./kit.ts";
import { roundRect } from "./tech.ts";

/** Finish a canvas artwork: optional painterly/print texture and paper/canvas relief. */
function finish(
  c: { g: Ctx2D; canvas: unknown },
  o: { grain?: number; brush?: number; weave?: number; seed: number; rough?: number },
): TexOutput {
  const d = readRGBA(c as never);
  const img = Img.fromRGBA(d);
  const h = channel();
  if (o.brush) {
    const b1 = noise(6, 48, o.seed),
      b2 = noise(48, 6, o.seed + 1);
    for (let i = 0; i < PIX; i++) {
      const v = (b1[i] + b2[i]) * 0.5;
      const k = 1 + (v - 0.5) * o.brush;
      img.r[i] *= k;
      img.g[i] *= k;
      img.b[i] *= k;
      h[i] += v * 0.5;
    }
  }
  if (o.weave) {
    let i = 0;
    for (let y = 0; y < SIZE; y++)
      for (let x = 0; x < SIZE; x++, i++) {
        const wv = (Math.sin(x * Math.PI * 0.5) * Math.sin(y * Math.PI * 0.5)) * 0.5 + 0.5;
        h[i] += wv * o.weave;
      }
  }
  if (o.grain) {
    const g = whiteNoise(o.seed + 7);
    img.jitter(g, o.grain);
    for (let i = 0; i < PIX; i++) h[i] += g[i] * 0.1;
  }
  return { rgba: img.toRGBA(), height: h, bump: 1.2, rough: o.rough ?? 1 };
}

/** Cloth-bound cover base: colour + fine weave + subtle wear. */
function clothBase(col: number, seed: number): Img {
  const img = Img.solid(hex(col));
  const w1 = noise(128, 4, seed),
    w2 = noise(4, 128, seed + 1),
    wear = fbm(3, 3, 4, seed + 2);
  for (let i = 0; i < PIX; i++) {
    const k = 1 + ((w1[i] + w2[i]) * 0.5 - 0.5) * 0.12 + (wear[i] - 0.5) * 0.1;
    img.r[i] *= k;
    img.g[i] *= k;
    img.b[i] *= k;
  }
  return img;
}

// ------------------------------------------------------------------ books

function bookCover(variant: number): TexOutput {
  const c = makeCanvas();
  const g = c.g;
  if (variant === 0) {
    putImg(c, clothBase(0x6e1f1d, 7001));
    g.strokeStyle = "#d4af5a";
    g.lineWidth = 2;
    g.strokeRect(14, 14, SIZE - 28, SIZE - 28);
    g.lineWidth = 1;
    g.strokeRect(20, 20, SIZE - 40, SIZE - 40);
    g.fillStyle = "#d9b462";
    fitText(g, "THE OLD", 128, 82, 190, 30, FONT_SERIF, "bold");
    fitText(g, "HOUSE", 128, 116, 190, 30, FONT_SERIF, "bold");
    g.beginPath();
    g.moveTo(128, 140);
    g.lineTo(138, 150);
    g.lineTo(128, 160);
    g.lineTo(118, 150);
    g.closePath();
    g.fill();
    fitText(g, "M. A. HOLLOWAY", 128, 205, 170, 13, FONT_SERIF, "normal");
  } else if (variant === 1) {
    putImg(c, clothBase(0x1f2d4f, 7101));
    g.fillStyle = "#e07a2e";
    g.fillRect(0, 120, SIZE, 18);
    g.fillStyle = "#f2c94c";
    g.fillRect(0, 140, SIZE, 5);
    g.fillStyle = "#f4f4f0";
    fitText(g, "SYSTEMS", 128, 70, 200, 36, FONT_SANS, "bold");
    fitText(g, "DESIGN & PRACTICE", 128, 100, 200, 14, FONT_SANS, "normal");
    fitText(g, "SECOND EDITION", 128, 172, 200, 11, FONT_SANS, "bold");
    fitText(g, "R. OKAFOR · L. BRANDT", 128, 222, 200, 12, FONT_SANS, "normal");
  } else if (variant === 2) {
    putImg(c, clothBase(0x2f4a35, 7201));
    g.fillStyle = "#e9dfc4";
    roundRect(g, 34, 46, 188, 150, 6);
    g.fill();
    g.strokeStyle = "#2f4a35";
    g.lineWidth = 1.5;
    roundRect(g, 40, 52, 176, 138, 4);
    g.stroke();
    g.fillStyle = "#2f4a35";
    fitText(g, "A FIELD GUIDE", 128, 78, 160, 16, FONT_SERIF, "bold");
    fitText(g, "TO BIRDS", 128, 100, 160, 22, FONT_SERIF, "bold");
    // bird silhouette on a branch
    g.fillStyle = "#3c3226";
    g.beginPath();
    g.ellipse(128, 150, 20, 11, -0.25, 0, Math.PI * 2);
    g.fill();
    g.beginPath();
    g.arc(146, 140, 7, 0, Math.PI * 2);
    g.fill();
    g.beginPath();
    g.moveTo(152, 139);
    g.lineTo(160, 141);
    g.lineTo(152, 143);
    g.fill();
    g.beginPath();
    g.moveTo(110, 152);
    g.lineTo(88, 164);
    g.lineTo(108, 158);
    g.fill();
    g.strokeStyle = "#5a4630";
    g.lineWidth = 2.5;
    g.beginPath();
    g.moveTo(80, 166);
    g.lineTo(180, 160);
    g.stroke();
    g.fillStyle = "#e9dfc4";
    fitText(g, "NORTH AMERICA", 128, 226, 170, 12, FONT_SERIF, "normal");
  } else {
    putImg(c, clothBase(0xd9a43a, 7301));
    g.fillStyle = "#1c1c1c";
    fitText(g, "COOKING", 128, 52, 200, 34, FONT_COND, "bold");
    fitText(g, "AT HOME", 128, 86, 200, 26, FONT_COND, "bold");
    g.fillStyle = "#f6f1e4";
    g.beginPath();
    g.arc(128, 160, 50, 0, Math.PI * 2);
    g.fill();
    g.fillStyle = "#c2352b";
    g.beginPath();
    g.arc(118, 165, 22, 0, Math.PI * 2);
    g.fill();
    g.beginPath();
    g.arc(146, 152, 16, 0, Math.PI * 2);
    g.fill();
    g.fillStyle = "#3b7a2e";
    g.beginPath();
    g.ellipse(120, 142, 8, 3, 0.4, 0, Math.PI * 2);
    g.fill();
    g.fillStyle = "#1c1c1c";
    fitText(g, "120 SIMPLE RECIPES", 128, 232, 200, 12, FONT_SANS, "bold");
  }
  return finish(c, { seed: 7400 + variant, grain: 0.03, rough: 1 });
}

function bookPages(): TexOutput {
  // fore-edge of a page block: tightly stacked sheets → fine lines along V
  const lines = noise(256, 2, 7501),
    lines2 = noise(128, 3, 7502),
    m = fbm(3, 3, 3, 7503);
  const img = Img.solid(hex(0xf6f1e4));
  const h = channel();
  for (let i = 0; i < PIX; i++) {
    const l = lines[i] * 0.6 + lines2[i] * 0.4;
    const k = 0.9 + l * 0.12 + (m[i] - 0.5) * 0.05;
    img.r[i] *= k;
    img.g[i] *= k;
    img.b[i] *= k * 0.98;
    h[i] = l;
  }
  return { rgba: img.toRGBA(), height: h, bump: 2, rough: 1 };
}

// ------------------------------------------------------------------ art

/** Smooth 1D random profile (sum of sines). */
function profile(rng: Prng, n = 5): (x: number) => number {
  const f: Array<[number, number, number]> = [];
  for (let k = 0; k < n; k++) f.push([rng.range(0.6, 1.4) * (k + 1) * 0.012, rng.range(0, Math.PI * 2), 1 / (k + 1)]);
  return (x: number) => {
    let s = 0;
    for (const [fr, ph, a] of f) s += Math.sin(x * fr * Math.PI * 2 + ph) * a;
    return s;
  };
}

function painting0(): TexOutput {
  // impressionistic evening landscape: sky, clouds, mountains, lake, meadow, trees
  const c = makeCanvas();
  const g = c.g;
  const rng = new Prng(7601);
  const sky = g.createLinearGradient(0, 0, 0, 140);
  sky.addColorStop(0, "#5f7fae");
  sky.addColorStop(0.55, "#c9a3a0");
  sky.addColorStop(1, "#f3c58a");
  g.fillStyle = sky;
  g.fillRect(0, 0, SIZE, 150);
  // clouds
  for (let k = 0; k < 9; k++) {
    const x = rng.range(-20, 270),
      y = rng.range(15, 85),
      r = rng.range(14, 30);
    g.fillStyle = `rgba(255,${rng.int(214, 236)},${rng.int(200, 220)},0.55)`;
    for (let j = 0; j < 5; j++) {
      g.beginPath();
      g.ellipse(x + rng.range(-r, r), y + rng.range(-r * 0.25, r * 0.25), r * rng.range(0.6, 1.1), r * 0.45, 0, 0, Math.PI * 2);
      g.fill();
    }
  }
  // sun glow
  const sg = g.createRadialGradient(190, 125, 2, 190, 125, 50);
  sg.addColorStop(0, "rgba(255,240,200,0.95)");
  sg.addColorStop(1, "rgba(255,200,140,0)");
  g.fillStyle = sg;
  g.fillRect(130, 70, 120, 90);
  // mountain ranges (far → near)
  const ranges: Array<[string, number, number]> = [
    ["#8e8fae", 112, 30],
    ["#6d7598", 124, 24],
    ["#4f6a73", 138, 16],
  ];
  for (const [col, base, amp] of ranges) {
    const p = profile(rng);
    g.fillStyle = col;
    g.beginPath();
    g.moveTo(0, SIZE);
    // ridged profile: sharp peaks where the smooth profile crosses zero, rounded valleys
    for (let x = 0; x <= SIZE; x += 3) g.lineTo(x, base - (1 - Math.min(1, Math.abs(p(x)) / 1.6)) * amp);
    g.lineTo(SIZE, SIZE);
    g.closePath();
    g.fill();
  }
  // lake
  const lake = g.createLinearGradient(0, 150, 0, 190);
  lake.addColorStop(0, "#d7b28a");
  lake.addColorStop(1, "#5f7fa0");
  g.fillStyle = lake;
  g.fillRect(0, 150, SIZE, 36);
  g.strokeStyle = "rgba(255,235,200,0.5)";
  g.lineWidth = 1;
  for (let k = 0; k < 18; k++) {
    const y = rng.range(152, 184),
      x = rng.range(120, 250);
    g.beginPath();
    g.moveTo(x, y);
    g.lineTo(x + rng.range(6, 22), y);
    g.stroke();
  }
  // meadow
  const mg = g.createLinearGradient(0, 180, 0, SIZE);
  mg.addColorStop(0, "#6d8a3e");
  mg.addColorStop(1, "#3c5a22");
  g.fillStyle = mg;
  g.beginPath();
  g.moveTo(0, 184);
  const pm = profile(rng, 3);
  for (let x = 0; x <= SIZE; x += 4) g.lineTo(x, 186 + pm(x) * 5);
  g.lineTo(SIZE, SIZE);
  g.lineTo(0, SIZE);
  g.fill();
  // flowers
  for (let k = 0; k < 160; k++) {
    g.fillStyle = rng.pick(["#f0d060", "#e8e2d0", "#d86a5a", "#c0a0d8"]);
    g.fillRect(rng.range(0, SIZE), rng.range(196, SIZE), 2, 2);
  }
  // trees
  for (const [tx, ty, s] of [
    [40, 196, 1.1],
    [64, 192, 0.8],
    [222, 200, 1.3],
  ] as const) {
    g.fillStyle = "#3a2a1c";
    g.fillRect(tx - 2, ty - 6, 4, 20 * s);
    for (let j = 0; j < 7; j++) {
      g.fillStyle = rng.pick(["#2c4a24", "#365a2a", "#24401e", "#43692f"]);
      g.beginPath();
      g.arc(tx + rng.range(-12, 12) * s, ty - 18 * s + rng.range(-12, 10) * s, rng.range(8, 13) * s, 0, Math.PI * 2);
      g.fill();
    }
  }
  return finish(c, { seed: 7602, brush: 0.18, weave: 0.25 });
}

function painting1(): TexOutput {
  // geometric abstraction on an off-white ground
  const c = makeCanvas();
  const g = c.g;
  g.fillStyle = "#ebe3d0";
  g.fillRect(0, 0, SIZE, SIZE);
  g.fillStyle = "#1f4e8c";
  g.beginPath();
  g.arc(92, 96, 58, 0, Math.PI * 2);
  g.fill();
  g.fillStyle = "#e2b53e";
  g.beginPath();
  g.arc(170, 170, 46, Math.PI, 0);
  g.fill();
  g.fillStyle = "#c8372d";
  g.beginPath();
  g.moveTo(150, 30);
  g.lineTo(236, 120);
  g.lineTo(140, 128);
  g.closePath();
  g.fill();
  g.strokeStyle = "#151515";
  g.lineWidth = 4;
  g.beginPath();
  g.moveTo(10, 200);
  g.lineTo(246, 40);
  g.stroke();
  g.lineWidth = 2;
  g.beginPath();
  g.moveTo(30, 20);
  g.lineTo(120, 240);
  g.stroke();
  // concentric rings
  for (let r = 22; r > 0; r -= 5) {
    g.strokeStyle = r % 10 === 2 ? "#151515" : "#d0602d";
    g.lineWidth = 2.5;
    g.beginPath();
    g.arc(60, 200, r, 0, Math.PI * 2);
    g.stroke();
  }
  // small checker grid
  for (let i = 0; i < 4; i++)
    for (let j = 0; j < 4; j++) {
      g.fillStyle = (i + j) % 2 ? "#151515" : "#2f8a6a";
      g.fillRect(196 + i * 9, 196 + j * 9, 9, 9);
    }
  g.fillStyle = "#2f8a6a";
  g.beginPath();
  g.arc(215, 70, 12, 0, Math.PI * 2);
  g.fill();
  return finish(c, { seed: 7701, brush: 0.14, weave: 0.25 });
}

function poster0(): TexOutput {
  // retro travel poster
  const c = makeCanvas();
  const g = c.g;
  g.fillStyle = "#efe6d2";
  g.fillRect(0, 0, SIZE, SIZE);
  const x0 = 12,
    y0 = 12,
    w = SIZE - 24,
    h = SIZE - 24;
  g.save();
  g.beginPath();
  g.rect(x0, y0, w, h);
  g.clip();
  const sky = g.createLinearGradient(0, y0, 0, y0 + h * 0.7);
  sky.addColorStop(0, "#f2a154");
  sky.addColorStop(1, "#f6d38a");
  g.fillStyle = sky;
  g.fillRect(x0, y0, w, h);
  g.fillStyle = "#fbe9b8";
  g.beginPath();
  g.arc(160, 120, 34, 0, Math.PI * 2);
  g.fill();
  const layers: Array<[string, number, Array<[number, number]>]> = [
    ["#9c5a7a", 150, [[0, 150], [40, 100], [80, 132], [120, 84], [170, 140], [210, 96], [256, 128]]],
    ["#5c3f6e", 175, [[0, 170], [30, 140], [70, 162], [110, 120], [150, 168], [200, 130], [256, 160]]],
    ["#2c3456", 205, [[0, 196], [50, 172], [100, 198], [160, 168], [220, 192], [256, 180]]],
  ];
  for (const [col, , pts] of layers) {
    g.fillStyle = col;
    g.beginPath();
    g.moveTo(0, SIZE);
    for (const [x, y] of pts) g.lineTo(x, y);
    g.lineTo(SIZE, SIZE);
    g.closePath();
    g.fill();
  }
  // snow caps
  g.fillStyle = "#fbf3e2";
  for (const [x, y] of [
    [120, 84],
    [40, 100],
    [210, 96],
  ] as const) {
    g.beginPath();
    g.moveTo(x, y);
    g.lineTo(x - 12, y + 12);
    g.lineTo(x - 4, y + 9);
    g.lineTo(x + 3, y + 13);
    g.lineTo(x + 12, y + 11);
    g.closePath();
    g.fill();
  }
  g.fillStyle = "#1c1f2e";
  g.fillRect(x0, y0 + h - 44, w, 44);
  g.restore();
  g.fillStyle = "#2c3456";
  fitText(g, "ALPINE", 128, 46, 200, 38, FONT_COND, "bold");
  fitText(g, "EXPRESS", 128, 80, 200, 26, FONT_COND, "bold");
  g.fillStyle = "#f6d38a";
  fitText(g, "VISIT THE MOUNTAINS · 1962", 128, SIZE - 34, 210, 12, FONT_SANS, "bold");
  return finish(c, { seed: 7801, grain: 0.04 });
}

function photo0(): TexOutput {
  // glossy holiday photo print with a white border
  const c = makeCanvas();
  const g = c.g;
  g.fillStyle = "#f8f6f0";
  g.fillRect(0, 0, SIZE, SIZE);
  const x0 = 14,
    y0 = 14,
    w = SIZE - 28,
    h = SIZE - 52;
  g.save();
  g.beginPath();
  g.rect(x0, y0, w, h);
  g.clip();
  const sky = g.createLinearGradient(0, y0, 0, y0 + h * 0.5);
  sky.addColorStop(0, "#5aa0d8");
  sky.addColorStop(1, "#bfe0f0");
  g.fillStyle = sky;
  g.fillRect(x0, y0, w, h);
  g.fillStyle = "#2a78a8";
  g.fillRect(x0, y0 + h * 0.48, w, h * 0.2);
  g.fillStyle = "#e7d2a2";
  g.fillRect(x0, y0 + h * 0.66, w, h * 0.4);
  g.strokeStyle = "rgba(255,255,255,0.8)";
  g.lineWidth = 2;
  g.beginPath();
  g.moveTo(x0, y0 + h * 0.66);
  g.bezierCurveTo(80, y0 + h * 0.64, 160, y0 + h * 0.69, SIZE, y0 + h * 0.65);
  g.stroke();
  // umbrella
  g.fillStyle = "#d83a3a";
  g.beginPath();
  g.arc(70, y0 + h * 0.62, 28, Math.PI, 0);
  g.fill();
  g.fillStyle = "#f4f0e8";
  g.beginPath();
  g.moveTo(70, y0 + h * 0.62);
  g.arc(70, y0 + h * 0.62, 28, Math.PI * 1.25, Math.PI * 1.5);
  g.fill();
  g.strokeStyle = "#5a4a3a";
  g.lineWidth = 2;
  g.beginPath();
  g.moveTo(70, y0 + h * 0.62);
  g.lineTo(70, y0 + h * 0.85);
  g.stroke();
  // two figures
  for (const [fx, col] of [
    [150, "#3a2a20"],
    [172, "#6a3a2a"],
  ] as const) {
    g.fillStyle = col;
    g.beginPath();
    g.arc(fx, y0 + h * 0.6, 6, 0, Math.PI * 2);
    g.fill();
    g.fillRect(fx - 6, y0 + h * 0.63, 12, 26);
    g.fillRect(fx - 5, y0 + h * 0.63 + 26, 4, 18);
    g.fillRect(fx + 1, y0 + h * 0.63 + 26, 4, 18);
  }
  // vignette
  const vg = g.createRadialGradient(128, 110, 40, 128, 110, 170);
  vg.addColorStop(0, "rgba(0,0,0,0)");
  vg.addColorStop(1, "rgba(30,20,10,0.35)");
  g.fillStyle = vg;
  g.fillRect(x0, y0, w, h);
  g.restore();
  g.fillStyle = "#8a8578";
  fitText(g, "JULY '98", SIZE - 50, SIZE - 20, 80, 11, FONT_SANS, "normal");
  return finish(c, { seed: 7901, grain: 0.035, rough: 1 });
}

function rug(): TexOutput {
  // persian-style rug: navy border with rosettes, ivory guards, red field, central medallion
  const c = makeCanvas();
  const g = c.g;
  const red = "#8a2226",
    navy = "#1e2a4c",
    ivory = "#e4d8bc",
    gold = "#c99a3e",
    teal = "#2f6b6a";
  g.fillStyle = navy;
  g.fillRect(0, 0, SIZE, SIZE);
  // outer guard
  g.strokeStyle = ivory;
  g.lineWidth = 3;
  g.strokeRect(6, 6, SIZE - 12, SIZE - 12);
  // border rosettes
  const rosette = (x: number, y: number, r: number): void => {
    g.fillStyle = red;
    for (let k = 0; k < 8; k++) {
      const a = (k / 8) * Math.PI * 2;
      g.beginPath();
      g.ellipse(x + Math.cos(a) * r * 0.55, y + Math.sin(a) * r * 0.55, r * 0.42, r * 0.22, a, 0, Math.PI * 2);
      g.fill();
    }
    g.fillStyle = gold;
    g.beginPath();
    g.arc(x, y, r * 0.35, 0, Math.PI * 2);
    g.fill();
    g.fillStyle = ivory;
    g.beginPath();
    g.arc(x, y, r * 0.15, 0, Math.PI * 2);
    g.fill();
  };
  for (let k = 0; k < 8; k++) {
    const t = 20 + k * 31;
    rosette(t, 20, 9);
    rosette(t, SIZE - 20, 9);
    rosette(20, t, 9);
    rosette(SIZE - 20, t, 9);
  }
  // inner guard + zigzag band
  g.fillStyle = ivory;
  g.fillRect(34, 34, SIZE - 68, SIZE - 68);
  g.fillStyle = teal;
  g.fillRect(38, 38, SIZE - 76, SIZE - 76);
  g.fillStyle = gold;
  g.beginPath();
  for (let x = 38; x < SIZE - 38; x += 8) {
    g.moveTo(x, 38);
    g.lineTo(x + 4, 44);
    g.lineTo(x + 8, 38);
    g.moveTo(x, SIZE - 38);
    g.lineTo(x + 4, SIZE - 44);
    g.lineTo(x + 8, SIZE - 38);
  }
  for (let y = 38; y < SIZE - 38; y += 8) {
    g.moveTo(38, y);
    g.lineTo(44, y + 4);
    g.lineTo(38, y + 8);
    g.moveTo(SIZE - 38, y);
    g.lineTo(SIZE - 44, y + 4);
    g.lineTo(SIZE - 38, y + 8);
  }
  g.fill();
  // field
  g.fillStyle = red;
  g.fillRect(48, 48, SIZE - 96, SIZE - 96);
  // small field motifs on a lattice
  for (let i = 0; i < 6; i++)
    for (let j = 0; j < 6; j++) {
      const x = 62 + i * 26.4,
        y = 62 + j * 26.4;
      if (Math.hypot(x - 128, y - 128) < 58) continue;
      g.fillStyle = (i + j) % 2 ? navy : ivory;
      g.beginPath();
      g.moveTo(x, y - 6);
      g.lineTo(x + 5, y);
      g.lineTo(x, y + 6);
      g.lineTo(x - 5, y);
      g.closePath();
      g.fill();
      g.fillStyle = gold;
      g.fillRect(x - 1, y - 1, 2, 2);
    }
  // medallion
  const med = (r: number, col: string, pts: number): void => {
    g.fillStyle = col;
    g.beginPath();
    for (let k = 0; k <= pts * 2; k++) {
      const a = (k / (pts * 2)) * Math.PI * 2;
      const rr = k % 2 ? r * 0.78 : r;
      g.lineTo(128 + Math.cos(a) * rr, 128 + Math.sin(a) * rr * 1.0);
    }
    g.closePath();
    g.fill();
  };
  med(58, ivory, 16);
  med(50, navy, 16);
  med(40, gold, 12);
  med(30, red, 12);
  med(18, ivory, 8);
  g.fillStyle = navy;
  g.beginPath();
  g.arc(128, 128, 8, 0, Math.PI * 2);
  g.fill();
  // corner spandrels
  for (const [cx, cy] of [
    [48, 48],
    [SIZE - 48, 48],
    [48, SIZE - 48],
    [SIZE - 48, SIZE - 48],
  ] as const) {
    g.fillStyle = navy;
    g.beginPath();
    g.arc(cx, cy, 26, 0, Math.PI * 2);
    g.fill();
    g.fillStyle = gold;
    g.beginPath();
    g.arc(cx, cy, 12, 0, Math.PI * 2);
    g.fill();
  }
  // pile: tufts + wear
  const d = readRGBA(c);
  const img = Img.fromRGBA(d);
  const tuft = blur(whiteNoise(8002), 1, 1),
    wear = fbm(3, 3, 4, 8003);
  const h = channel();
  for (let i = 0; i < PIX; i++) {
    const k = 0.86 + tuft[i] * 0.24 + (wear[i] - 0.5) * 0.12;
    img.r[i] *= k;
    img.g[i] *= k;
    img.b[i] *= k;
    h[i] = tuft[i];
  }
  return { rgba: img.toRGBA(), height: h, bump: 2.5, rough: 1 };
}

function clockFace(): TexOutput {
  const c = makeCanvas();
  const g = c.g;
  g.fillStyle = "#f7f6f1";
  g.fillRect(0, 0, SIZE, SIZE);
  const cx = 128,
    cy = 128,
    R = 118;
  g.strokeStyle = "#222";
  g.lineWidth = 3;
  g.beginPath();
  g.arc(cx, cy, R, 0, Math.PI * 2);
  g.stroke();
  for (let k = 0; k < 60; k++) {
    const a = (k / 60) * Math.PI * 2;
    const major = k % 5 === 0;
    g.lineWidth = major ? 4 : 1.5;
    g.strokeStyle = "#1a1a1a";
    const r0 = major ? R - 18 : R - 10;
    g.beginPath();
    g.moveTo(cx + Math.sin(a) * r0, cy - Math.cos(a) * r0);
    g.lineTo(cx + Math.sin(a) * (R - 4), cy - Math.cos(a) * (R - 4));
    g.stroke();
  }
  g.fillStyle = "#1a1a1a";
  for (let k = 1; k <= 12; k++) {
    const a = (k / 12) * Math.PI * 2;
    fitText(g, String(k), cx + Math.sin(a) * (R - 36), cy - Math.cos(a) * (R - 36), 34, 22, FONT_SANS, "bold");
  }
  fitText(g, "QUARTZ", cx, cy + 40, 60, 10, FONT_SANS, "bold");
  // hands at 10:09:36
  const hand = (a: number, len: number, w: number, col: string, tail = 14): void => {
    g.strokeStyle = col;
    g.lineWidth = w;
    g.lineCap = "round";
    g.beginPath();
    g.moveTo(cx - Math.sin(a) * tail, cy + Math.cos(a) * tail);
    g.lineTo(cx + Math.sin(a) * len, cy - Math.cos(a) * len);
    g.stroke();
  };
  const hours = 10 + 9 / 60,
    mins = 9.6;
  hand((hours / 12) * Math.PI * 2, 58, 7, "#151515");
  hand((mins / 60) * Math.PI * 2, 88, 5, "#151515");
  hand((36 / 60) * Math.PI * 2, 96, 1.6, "#c0281e", 22);
  g.fillStyle = "#151515";
  g.beginPath();
  g.arc(cx, cy, 6, 0, Math.PI * 2);
  g.fill();
  g.fillStyle = "#c0281e";
  g.beginPath();
  g.arc(cx, cy, 2.5, 0, Math.PI * 2);
  g.fill();
  return finish(c, { seed: 8101, grain: 0.015 });
}

function labelFood(): TexOutput {
  // breakfast cereal / tin label: horizontal bands read well even when cropped in strips
  const c = makeCanvas();
  const g = c.g;
  g.fillStyle = "#f4c430";
  g.fillRect(0, 0, SIZE, SIZE);
  g.fillStyle = "#c62828";
  g.fillRect(0, 0, SIZE, 74);
  g.fillStyle = "#ffffff";
  fitText(g, "CRUNCHOS", 128, 34, 230, 40, FONT_COND, "bold");
  fitText(g, "HONEY OAT FLAKES", 128, 62, 200, 12, FONT_SANS, "bold");
  // bowl illustration
  g.fillStyle = "#f8f8f4";
  g.beginPath();
  g.ellipse(128, 150, 74, 20, 0, 0, Math.PI * 2);
  g.fill();
  g.beginPath();
  g.moveTo(54, 150);
  g.bezierCurveTo(62, 200, 194, 200, 202, 150);
  g.fill();
  const rng = new Prng(8201);
  for (let k = 0; k < 70; k++) {
    g.fillStyle = rng.pick(["#d98a2b", "#e8a443", "#c27522", "#f0bf62"]);
    g.save();
    g.translate(128 + rng.range(-62, 62), 146 + rng.range(-12, 8));
    g.rotate(rng.range(0, Math.PI));
    g.fillRect(-5, -3, 10, 6);
    g.restore();
  }
  g.fillStyle = "#c62828";
  g.beginPath();
  g.ellipse(212, 100, 26, 18, -0.3, 0, Math.PI * 2);
  g.fill();
  g.fillStyle = "#fff";
  fitText(g, "NEW!", 212, 100, 40, 14, FONT_SANS, "bold");
  g.fillStyle = "#ffffff";
  g.fillRect(0, 204, SIZE, 52);
  g.fillStyle = "#555";
  for (let r = 0; r < 4; r++) {
    let x = 10;
    while (x < 180) {
      const w = rng.range(8, 26);
      g.fillRect(x, 212 + r * 9, w, 3);
      x += w + 4;
    }
  }
  g.fillStyle = "#222";
  fitText(g, "NET WT 500 g", 220, 240, 64, 10, FONT_SANS, "bold");
  return finish(c, { seed: 8202, grain: 0.03 });
}

function labelBottle(): TexOutput {
  const c = makeCanvas();
  const g = c.g;
  g.fillStyle = "#efe6cf";
  g.fillRect(0, 0, SIZE, SIZE);
  g.strokeStyle = "#7a1f24";
  g.lineWidth = 3;
  g.strokeRect(10, 10, SIZE - 20, SIZE - 20);
  g.lineWidth = 1;
  g.strokeRect(16, 16, SIZE - 32, SIZE - 32);
  // crest
  g.fillStyle = "#7a1f24";
  g.beginPath();
  g.moveTo(108, 34);
  g.lineTo(148, 34);
  g.lineTo(148, 62);
  g.quadraticCurveTo(148, 80, 128, 88);
  g.quadraticCurveTo(108, 80, 108, 62);
  g.closePath();
  g.fill();
  g.fillStyle = "#d9b462";
  g.beginPath();
  g.moveTo(128, 44);
  g.lineTo(136, 60);
  g.lineTo(128, 76);
  g.lineTo(120, 60);
  g.closePath();
  g.fill();
  g.fillStyle = "#2a1a14";
  fitText(g, "CHÂTEAU", 128, 112, 200, 20, FONT_SERIF, "bold");
  fitText(g, "VERNAY", 128, 140, 200, 30, FONT_SERIF, "bold");
  g.fillStyle = "#7a1f24";
  fitText(g, "GRAND VIN · 2016", 128, 172, 200, 13, FONT_SERIF, "normal");
  g.fillStyle = "#4a3a30";
  fitText(g, "Appellation Contrôlée", 128, 198, 200, 11, FONT_SERIF, "normal");
  fitText(g, "75 cl   13,5 % vol", 128, 222, 200, 10, FONT_SANS, "normal");
  return finish(c, { seed: 8301, grain: 0.03 });
}

function paperPrinted(): TexOutput {
  // printed page: heading, two text columns of word blocks, a picture box, page number
  const c = makeCanvas();
  const g = c.g;
  g.fillStyle = "#f3f0e8";
  g.fillRect(0, 0, SIZE, SIZE);
  const rng = new Prng(8401);
  g.fillStyle = "#1e1e1e";
  fitText(g, "MONDAY EDITION", 128, 20, 220, 18, FONT_SERIF, "bold");
  g.fillRect(14, 32, SIZE - 28, 2);
  const textCol = (x0: number, y0: number, w: number, lines: number): void => {
    for (let r = 0; r < lines; r++) {
      let x = x0;
      const end = r % 7 === 6 ? x0 + w * rng.range(0.3, 0.7) : x0 + w;
      while (x < end - 4) {
        const ww = Math.min(rng.range(4, 16), end - x);
        g.fillStyle = `rgba(40,40,40,${rng.range(0.55, 0.8)})`;
        g.fillRect(x, y0 + r * 6, ww, 2.2);
        x += ww + 2.5;
      }
    }
  };
  g.fillStyle = "#b9b4a8";
  g.fillRect(14, 42, 110, 70);
  g.fillStyle = "#8a8578";
  g.beginPath();
  g.arc(50, 78, 14, 0, Math.PI * 2);
  g.fill();
  g.fillRect(70, 70, 40, 34);
  textCol(14, 120, 110, 22);
  g.fillStyle = "#1e1e1e";
  fitText(g, "City Council Approves", 190, 50, 112, 11, FONT_SERIF, "bold", "center");
  fitText(g, "New Tower Project", 190, 64, 112, 11, FONT_SERIF, "bold", "center");
  textCol(134, 76, 108, 29);
  g.fillStyle = "#555";
  fitText(g, "— 3 —", 128, 250, 40, 8, FONT_SERIF, "normal");
  return finish(c, { seed: 8402, grain: 0.02 });
}

export const PRINTED_GENERATORS: Readonly<Record<string, () => TexOutput>> = {
  book_cover_0: () => bookCover(0),
  book_cover_1: () => bookCover(1),
  book_cover_2: () => bookCover(2),
  book_cover_3: () => bookCover(3),
  book_pages: bookPages,
  painting_0: painting0,
  painting_1: painting1,
  poster_0: poster0,
  photo_0: photo0,
  rug_pattern: rug,
  clock_face: clockFace,
  label_food: labelFood,
  label_bottle: labelBottle,
  paper_printed: paperPrinted,
};
