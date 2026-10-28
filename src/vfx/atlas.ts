// Procedural particle atlases (canvas-generated at startup; no external assets).
//
//   puff atlas 512×512, 4×4 cells of 128 px:  0–7 dust puffs, 8–11 smoke wisps, 12–15 fibre tufts
//   bits atlas 256×256, 4×4 cells of 64 px:   0–3 chips, 4–5 splinters, 6–7 crumbs, 8–9 paper scraps,
//                                             10–11 feathers, 12 droplet, 13 spark streak, 14 star glint,
//                                             15 hot dot
// Shapes are white/grey (particle colours tint them) with straight alpha. Long shapes are drawn
// vertically: stretched billboards align the cell's V axis with the particle velocity.
// Cell 0 is the top-left of the canvas. The atlases are uploaded WITHOUT the usual Y flip:
// Babylon's animation-sheet shader indexes rows from v = 0 and samples v' = row + 1 − offset.y,
// so with invertY = false row 0 is the canvas top row and every cell is upright (verified by
// the atlas row in tests/probes/vfx-fx-bursts.probe.ts).

import { DynamicTexture, Texture, type Scene } from "@babylonjs/core";

export const PUFF_ATLAS_SIZE = 512;
export const BITS_ATLAS_SIZE = 256;
export const ATLAS_GRID = 4;

// ------------------------------------------------------------------ noise helpers
function hash2(ix: number, iy: number, seed: number): number {
  let h = (Math.imul(ix, 374761393) + Math.imul(iy, 668265263) + Math.imul(seed, 1442695041)) | 0;
  h = Math.imul(h ^ (h >>> 13), 1274126177);
  h ^= h >>> 16;
  return (h >>> 0) / 4294967296;
}

function valueNoise(x: number, y: number, seed: number): number {
  const ix = Math.floor(x),
    iy = Math.floor(y);
  const fx = x - ix,
    fy = y - iy;
  const sx = fx * fx * (3 - 2 * fx),
    sy = fy * fy * (3 - 2 * fy);
  const a = hash2(ix, iy, seed),
    b = hash2(ix + 1, iy, seed),
    c = hash2(ix, iy + 1, seed),
    d = hash2(ix + 1, iy + 1, seed);
  return a + (b - a) * sx + (c - a) * sy + (a - b - c + d) * sx * sy;
}

function fbm(x: number, y: number, seed: number, octaves: number): number {
  let sum = 0,
    amp = 0.5,
    f = 1,
    norm = 0;
  for (let o = 0; o < octaves; o++) {
    sum += valueNoise(x * f, y * f, seed + o * 17) * amp;
    norm += amp;
    amp *= 0.5;
    f *= 2.03;
  }
  return sum / norm;
}

function prng(seed: number): () => number {
  let s = seed >>> 0;
  return () => {
    let t = (s = (s + 0x6d2b79f5) >>> 0);
    t = Math.imul(t ^ (t >>> 15), t | 1);
    t ^= t + Math.imul(t ^ (t >>> 7), t | 61);
    return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
  };
}

const smoothstep = (a: number, b: number, x: number) => {
  const t = Math.min(1, Math.max(0, (x - a) / (b - a)));
  return t * t * (3 - 2 * t);
};

type Ctx = CanvasRenderingContext2D | OffscreenCanvasRenderingContext2D;

/** Pixel-shader style fill of one cell: fn(u, v) in [-1,1]² → [lum 0..1, alpha 0..1]. */
function shadeCell(img: ImageData, size: number, cell: number, cellPx: number, fn: (u: number, v: number) => [number, number]): void {
  const cx = (cell % ATLAS_GRID) * cellPx,
    cy = Math.floor(cell / ATLAS_GRID) * cellPx;
  const d = img.data;
  for (let y = 0; y < cellPx; y++) {
    for (let x = 0; x < cellPx; x++) {
      const u = ((x + 0.5) / cellPx) * 2 - 1,
        v = ((y + 0.5) / cellPx) * 2 - 1;
      const [l, a] = fn(u, v);
      const i = ((cy + y) * size + cx + x) * 4;
      const lum = Math.round(Math.min(1, Math.max(0, l)) * 255);
      d[i] = lum;
      d[i + 1] = lum;
      d[i + 2] = lum;
      d[i + 3] = Math.round(Math.min(1, Math.max(0, a)) * 255);
    }
  }
}

// ------------------------------------------------------------------ puff atlas
function dustPuff(seed: number): (u: number, v: number) => [number, number] {
  const r = prng(seed);
  // a few overlapping lobes make each puff a different cauliflower-ish shape
  const lobes: Array<[number, number, number]> = [];
  const n = 3 + Math.floor(r() * 3);
  for (let k = 0; k < n; k++) {
    const a = r() * Math.PI * 2,
      dist = 0.12 + r() * 0.28;
    lobes.push([Math.cos(a) * dist, Math.sin(a) * dist, 0.38 + r() * 0.22]);
  }
  lobes.push([0, 0, 0.55]);
  const nx = r() * 100,
    ny = r() * 100;
  return (u, v) => {
    let field = 0;
    for (const [lx, ly, lr] of lobes) {
      const dx = u - lx,
        dy = v - ly;
      const t = Math.max(0, 1 - (dx * dx + dy * dy) / (lr * lr));
      field = Math.max(field, t * t);
    }
    const n1 = fbm(u * 2.6 + nx, v * 2.6 + ny, seed, 4);
    const edge = Math.max(0, 1 - Math.hypot(u, v) / 0.98); // hard zero before the cell border
    const a = smoothstep(0.02, 0.75, field * (0.55 + 0.9 * n1)) * smoothstep(0, 0.25, edge);
    // top-left lit volume: brighter where light comes from (upper-left), darker below
    const shade = 0.82 + 0.18 * (-(u + v) * 0.5 + 0.5) - 0.12 * (n1 - 0.5);
    return [shade, a * 0.95];
  };
}

function smokeWisp(seed: number): (u: number, v: number) => [number, number] {
  const r = prng(seed);
  const nx = r() * 100,
    ny = r() * 100,
    rot = r() * Math.PI;
  const cs = Math.cos(rot),
    sn = Math.sin(rot);
  return (u, v) => {
    const ru = u * cs - v * sn,
      rv = u * sn + v * cs;
    const warp = fbm(ru * 1.7 + nx, rv * 1.7 + ny, seed + 3, 3) - 0.5;
    const d = Math.hypot(ru * 1.15 + warp * 0.6, rv + warp * 0.4);
    const n1 = fbm(ru * 3.2 + nx + warp * 2, rv * 3.2 + ny, seed, 5);
    const body = Math.max(0, 1 - d / 0.85);
    const a = smoothstep(0.05, 0.9, body * body * (0.3 + 1.2 * n1)) * smoothstep(0, 0.2, 1 - Math.hypot(u, v));
    return [0.75 + 0.25 * n1, a * 0.9];
  };
}

function fibreTuft(ctx: Ctx, cell: number, cellPx: number, seed: number): void {
  const r = prng(seed);
  const ox = (cell % ATLAS_GRID) * cellPx,
    oy = Math.floor(cell / ATLAS_GRID) * cellPx;
  const c = cellPx / 2;
  ctx.save();
  ctx.translate(ox + c, oy + c);
  ctx.lineCap = "round";
  // soft core
  const g = ctx.createRadialGradient(0, 0, 0, 0, 0, c * 0.6);
  g.addColorStop(0, "rgba(255,255,255,0.55)");
  g.addColorStop(1, "rgba(255,255,255,0)");
  ctx.fillStyle = g;
  ctx.beginPath();
  ctx.ellipse(0, 0, c * 0.62, c * 0.45, r() * Math.PI, 0, Math.PI * 2);
  ctx.fill();
  // tangled fibres
  for (let k = 0; k < 70; k++) {
    const a = r() * Math.PI * 2,
      len = c * (0.25 + r() * 0.55);
    const sx = (r() - 0.5) * c * 0.5,
      sy = (r() - 0.5) * c * 0.4;
    const ex = sx + Math.cos(a) * len,
      ey = sy + Math.sin(a) * len * 0.75;
    const mx = (sx + ex) / 2 + (r() - 0.5) * c * 0.4,
      my = (sy + ey) / 2 + (r() - 0.5) * c * 0.4;
    const shade = Math.round(200 + r() * 55);
    ctx.strokeStyle = `rgba(${shade},${shade},${shade},${0.25 + r() * 0.5})`;
    ctx.lineWidth = 0.6 + r() * 1.4;
    ctx.beginPath();
    ctx.moveTo(sx, sy);
    ctx.quadraticCurveTo(mx, my, Math.max(-c * 0.9, Math.min(c * 0.9, ex)), Math.max(-c * 0.9, Math.min(c * 0.9, ey)));
    ctx.stroke();
  }
  ctx.restore();
}

// ------------------------------------------------------------------ bits atlas
function irregularPoly(r: () => number, n: number, rx: number, ry: number): Array<[number, number]> {
  const pts: Array<[number, number]> = [];
  for (let k = 0; k < n; k++) {
    const a = ((k + (r() - 0.5) * 0.6) / n) * Math.PI * 2;
    const rr = 0.7 + r() * 0.3;
    pts.push([Math.cos(a) * rx * rr, Math.sin(a) * ry * rr]);
  }
  return pts;
}

function fillFacetedPoly(ctx: Ctx, pts: Array<[number, number]>, r: () => number, base: number): void {
  // facets: fan from an off-centre apex, each facet a different grey (lit from the upper left)
  const ax = (r() - 0.5) * 0.3 * Math.abs(pts[0][0]),
    ay = (r() - 0.5) * 0.3 * Math.abs(pts[0][1] || pts[1][1]);
  for (let k = 0; k < pts.length; k++) {
    const p = pts[k],
      q = pts[(k + 1) % pts.length];
    const mx = (p[0] + q[0]) / 2,
      my = (p[1] + q[1]) / 2;
    const facing = (-mx - my) / (Math.hypot(mx, my) + 1e-6); // towards upper-left = brighter
    const lum = Math.round(Math.min(255, Math.max(0, base + facing * 38 + (r() - 0.5) * 20)));
    ctx.fillStyle = `rgb(${lum},${lum},${lum})`;
    ctx.beginPath();
    ctx.moveTo(ax, ay);
    ctx.lineTo(p[0], p[1]);
    ctx.lineTo(q[0], q[1]);
    ctx.closePath();
    ctx.fill();
  }
  // darker rim
  ctx.strokeStyle = "rgba(90,90,90,0.55)";
  ctx.lineWidth = 1;
  ctx.beginPath();
  ctx.moveTo(pts[0][0], pts[0][1]);
  for (let k = 1; k < pts.length; k++) ctx.lineTo(pts[k][0], pts[k][1]);
  ctx.closePath();
  ctx.stroke();
}

function drawBitsCell(ctx: Ctx, cell: number, cellPx: number): void {
  const r = prng(0x1234 + cell * 977);
  const ox = (cell % ATLAS_GRID) * cellPx,
    oy = Math.floor(cell / ATLAS_GRID) * cellPx;
  const c = cellPx / 2;
  ctx.save();
  ctx.translate(ox + c, oy + c);
  if (cell <= 3) {
    // chips: faceted irregular polygons
    const pts = irregularPoly(r, 5 + (cell % 3), c * (0.72 + r() * 0.15), c * (0.55 + r() * 0.25));
    ctx.rotate(r() * Math.PI);
    fillFacetedPoly(ctx, pts, r, 205);
  } else if (cell <= 5) {
    // splinters: long jagged slivers along V with fibre lines
    const w = c * (cell === 4 ? 0.22 : 0.3),
      h = c * 0.92;
    const left: Array<[number, number]> = [],
      right: Array<[number, number]> = [];
    const steps = 6;
    for (let k = 0; k <= steps; k++) {
      const t = k / steps;
      const y = -h + t * 2 * h;
      const taper = Math.sin(Math.PI * Math.min(1, Math.max(0.04, t))) * (0.6 + r() * 0.4);
      left.push([-w * taper + (r() - 0.5) * 2, y]);
      right.push([w * taper + (r() - 0.5) * 2, y]);
    }
    ctx.beginPath();
    ctx.moveTo((r() - 0.5) * 4, -h - 2);
    for (const p of right) ctx.lineTo(p[0], p[1]);
    ctx.lineTo((r() - 0.5) * 4, h + 2);
    for (let k = left.length - 1; k >= 0; k--) ctx.lineTo(left[k][0], left[k][1]);
    ctx.closePath();
    const grad = ctx.createLinearGradient(-w, 0, w, 0);
    grad.addColorStop(0, "rgb(250,250,250)");
    grad.addColorStop(1, "rgb(170,170,170)");
    ctx.fillStyle = grad;
    ctx.fill();
    ctx.strokeStyle = "rgba(120,120,120,0.45)";
    ctx.lineWidth = 0.7;
    for (let k = 0; k < 4; k++) {
      const x = (r() - 0.5) * w;
      ctx.beginPath();
      ctx.moveTo(x, -h * 0.85);
      ctx.lineTo(x + (r() - 0.5) * 2, h * 0.85);
      ctx.stroke();
    }
  } else if (cell <= 7) {
    // crumbs: lumpy rounded blobs, lit from the upper left
    const pts = irregularPoly(r, 9, c * 0.62, c * 0.55);
    ctx.beginPath();
    for (let k = 0; k < pts.length; k++) {
      const p = pts[k],
        q = pts[(k + 1) % pts.length];
      const mx = (p[0] + q[0]) / 2,
        my = (p[1] + q[1]) / 2;
      if (k === 0) ctx.moveTo(mx, my);
      ctx.quadraticCurveTo(q[0], q[1], (q[0] + pts[(k + 2) % pts.length][0]) / 2, (q[1] + pts[(k + 2) % pts.length][1]) / 2);
    }
    ctx.closePath();
    const g = ctx.createRadialGradient(-c * 0.25, -c * 0.25, c * 0.05, 0, 0, c * 0.7);
    g.addColorStop(0, "rgb(255,255,255)");
    g.addColorStop(0.6, "rgb(200,200,200)");
    g.addColorStop(1, "rgb(130,130,130)");
    ctx.fillStyle = g;
    ctx.fill();
  } else if (cell <= 9) {
    // paper scraps: torn-edged quads; one printed with text lines, one folded
    const pts: Array<[number, number]> = [];
    const hw = c * 0.62,
      hh = c * 0.78;
    const edge = (x0: number, y0: number, x1: number, y1: number, jag: number) => {
      const n = 6;
      for (let k = 0; k < n; k++) {
        const t = k / n;
        pts.push([x0 + (x1 - x0) * t + (r() - 0.5) * jag, y0 + (y1 - y0) * t + (r() - 0.5) * jag]);
      }
    };
    edge(-hw, -hh, hw, -hh, 2);
    edge(hw, -hh, hw, hh, cell === 8 ? 6 : 2);
    edge(hw, hh, -hw, hh, 6);
    edge(-hw, hh, -hw, -hh, 2);
    ctx.rotate((r() - 0.5) * 0.5);
    ctx.beginPath();
    ctx.moveTo(pts[0][0], pts[0][1]);
    for (const p of pts) ctx.lineTo(p[0], p[1]);
    ctx.closePath();
    ctx.fillStyle = "rgb(248,248,246)";
    ctx.fill();
    if (cell === 8) {
      ctx.fillStyle = "rgba(60,60,60,0.55)";
      for (let k = 0; k < 7; k++) {
        const y = -hh * 0.75 + k * hh * 0.22;
        ctx.fillRect(-hw * 0.75, y, hw * (0.9 + r() * 0.5), 1.4);
      }
    } else {
      const g = ctx.createLinearGradient(-hw, 0, hw, 0);
      g.addColorStop(0, "rgba(0,0,0,0)");
      g.addColorStop(0.48, "rgba(0,0,0,0.12)");
      g.addColorStop(0.5, "rgba(0,0,0,0.25)");
      g.addColorStop(1, "rgba(0,0,0,0.05)");
      ctx.fillStyle = g;
      ctx.fill();
    }
  } else if (cell <= 11) {
    // feathers: curved shaft + soft vane with barbs
    const h = c * 0.9,
      w = c * (cell === 10 ? 0.42 : 0.34);
    const bend = (r() - 0.5) * c * 0.3;
    ctx.fillStyle = "rgba(255,255,255,0.85)";
    ctx.beginPath();
    ctx.moveTo(0, -h);
    ctx.bezierCurveTo(w * 1.3 + bend, -h * 0.4, w * 1.1 + bend, h * 0.5, bend * 0.5, h * 0.7);
    ctx.bezierCurveTo(-w * 1.1 + bend, h * 0.5, -w * 1.3 + bend, -h * 0.4, 0, -h);
    ctx.fill();
    ctx.strokeStyle = "rgba(170,170,170,0.5)";
    ctx.lineWidth = 0.8;
    for (let k = 0; k < 14; k++) {
      const t = -0.8 + k * 0.11;
      const y = t * h;
      ctx.beginPath();
      ctx.moveTo(bend * (0.5 + t * 0.3), y);
      ctx.lineTo(w * (0.9 - Math.abs(t) * 0.5) + bend, y + h * 0.12);
      ctx.moveTo(bend * (0.5 + t * 0.3), y);
      ctx.lineTo(-w * (0.9 - Math.abs(t) * 0.5) + bend, y + h * 0.12);
      ctx.stroke();
    }
    ctx.strokeStyle = "rgba(140,140,140,0.9)";
    ctx.lineWidth = 1.6;
    ctx.beginPath();
    ctx.moveTo(0, -h);
    ctx.quadraticCurveTo(bend, 0, bend * 0.5, h * 0.95);
    ctx.stroke();
  }
  ctx.restore();
}

function bitsPixelCells(img: ImageData): void {
  const S = BITS_ATLAS_SIZE,
    C = S / ATLAS_GRID;
  // 12 droplet: elongated soft drop with a bright core (V = travel direction)
  shadeCell(img, S, 12, C, (u, v) => {
    const d = Math.hypot(u / 0.42, v / 0.95);
    const a = smoothstep(1, 0.55, d);
    const core = Math.exp(-((u * u) / 0.02 + ((v + 0.3) * (v + 0.3)) / 0.08));
    return [0.82 + 0.18 * core, a * (0.65 + 0.35 * core)];
  });
  // 13 spark streak: thin bright line, soft along its length
  shadeCell(img, S, 13, C, (u, v) => {
    const across = Math.exp(-(u * u) / 0.012);
    const along = Math.max(0, 1 - v * v);
    const a = across * Math.pow(along, 0.7);
    return [1, a];
  });
  // 14 star glint: 4-point star + soft core
  shadeCell(img, S, 14, C, (u, v) => {
    const r2 = u * u + v * v;
    const core = Math.exp(-r2 / 0.03);
    const rays = Math.exp(-(u * u) / 0.0015) * Math.max(0, 1 - Math.abs(v)) + Math.exp(-(v * v) / 0.0015) * Math.max(0, 1 - Math.abs(u));
    const halo = Math.exp(-r2 / 0.18) * 0.25;
    return [1, Math.min(1, core + rays * 0.9 + halo)];
  });
  // 15 hot dot: small round dot with glow
  shadeCell(img, S, 15, C, (u, v) => {
    const r2 = u * u + v * v;
    return [1, Math.min(1, Math.exp(-r2 / 0.05) + Math.exp(-r2 / 0.4) * 0.3)];
  });
}

function makeDynamic(name: string, size: number, scene: Scene): DynamicTexture {
  const tex = new DynamicTexture(name, { width: size, height: size }, scene, true, Texture.TRILINEAR_SAMPLINGMODE);
  tex.hasAlpha = true;
  tex.wrapU = Texture.CLAMP_ADDRESSMODE;
  tex.wrapV = Texture.CLAMP_ADDRESSMODE;
  tex.anisotropicFilteringLevel = 1;
  return tex;
}

/** Soft puffs / smoke / fibres atlas. */
export function createPuffAtlas(scene: Scene): DynamicTexture {
  const S = PUFF_ATLAS_SIZE,
    C = S / ATLAS_GRID;
  const tex = makeDynamic("vfxPuffAtlas", S, scene);
  const ctx = tex.getContext() as Ctx;
  ctx.clearRect(0, 0, S, S);
  const img = ctx.getImageData(0, 0, S, S);
  for (let cell = 0; cell < 8; cell++) shadeCell(img, S, cell, C, dustPuff(101 + cell * 31));
  for (let cell = 8; cell < 12; cell++) shadeCell(img, S, cell, C, smokeWisp(501 + cell * 13));
  ctx.putImageData(img, 0, 0);
  for (let cell = 12; cell < 16; cell++) fibreTuft(ctx, cell, C, 901 + cell * 7);
  tex.update(false, false);
  return tex;
}

/** Chips / splinters / crumbs / paper / feathers / drops / sparks / glints atlas. */
export function createBitsAtlas(scene: Scene): DynamicTexture {
  const S = BITS_ATLAS_SIZE,
    C = S / ATLAS_GRID;
  const tex = makeDynamic("vfxBitsAtlas", S, scene);
  const ctx = tex.getContext() as Ctx;
  ctx.clearRect(0, 0, S, S);
  for (let cell = 0; cell < 12; cell++) drawBitsCell(ctx, cell, C);
  const img = ctx.getImageData(0, 0, S, S);
  bitsPixelCells(img);
  ctx.putImageData(img, 0, 0);
  tex.update(false, false);
  return tex;
}
