/**
 * Procedural low-poly prop library. Every function builds a prop at the
 * origin of the Geo's current transform (ground at y = 0, facing +Z) so it can
 * be placed with `g.at(Xf.trs(...), () => prop(...))` or baked into a
 * Template and stamped many times.
 *
 * Colors come from `Colors` (derived from the level palette in Biomes.ts).
 */
import type { Palette } from "../data/levels";
import { Geo, mix, rgb, tint, Xf, type RGB } from "./Geo";
import type { Rng } from "./rng";

/** Level palette as RGB plus derived material colors. */
export interface Colors {
  pal: Record<keyof Palette, RGB>;
  wood: RGB;
  woodDark: RGB;
  metal: RGB;
  rust: RGB;
  concrete: RGB;
  dark: RGB;
  glass: RGB;
  tire: RGB;
  hazard: RGB; // yellow-ish stripe color
  red: RGB; // explosive / warning red
  white: RGB;
  foliage: RGB;
  foliage2: RGB;
  trunk: RGB;
  carColors: RGB[];
  glowWarm: RGB;
  glowCool: RGB;
}

export function makeColors(p: Palette): Colors {
  const pal = Object.fromEntries(Object.entries(p).map(([k, v]) => [k, rgb(v)])) as Record<keyof Palette, RGB>;
  const ground = pal.ground;
  return {
    pal,
    wood: tint(mix(ground, pal.propA, 0.35), -0.28),
    woodDark: tint(mix(ground, pal.propA, 0.3), -0.5),
    metal: mix(pal.propB, pal.road, 0.45),
    rust: tint(mix(pal.propA, ground, 0.35), -0.35),
    concrete: tint(mix(pal.fog, pal.road, 0.35), 0.12),
    dark: tint(pal.road, -0.45),
    glass: tint(mix(pal.skyTop, pal.road, 0.55), -0.1),
    tire: [0.09, 0.08, 0.1],
    hazard: mix(pal.roadLine, [1, 0.8, 0.1], 0.5),
    red: rgb("#d8322c"),
    white: tint(pal.roadLine, 0.4),
    foliage: tint(mix(pal.propC, ground, 0.25), -0.1),
    foliage2: tint(mix(pal.propC, ground, 0.45), 0.05),
    trunk: tint(mix(ground, pal.propA, 0.4), -0.45),
    carColors: [pal.propA, pal.propB, pal.propC, tint(pal.propA, -0.25), tint(pal.propC, 0.2), mix(pal.propB, pal.roadLine, 0.5)],
    glowWarm: mix(pal.roadLine, [1, 0.85, 0.5], 0.6),
    glowCool: mix(pal.propB, [0.6, 0.9, 1], 0.4),
  };
}

// ---------------------------------------------------------------- vehicles

export type CarKind = "sedan" | "van" | "pickup" | "bus" | "truck" | "police";

export function car(g: Geo, c: Colors, body: RGB, kind: CarKind, rng: Rng, wrecked = true): void {
  const L = kind === "bus" ? 10 : kind === "truck" ? 7.5 : kind === "van" ? 4.8 : 4.3;
  const W = kind === "bus" ? 2.5 : kind === "truck" ? 2.4 : 1.95;
  const wr = kind === "bus" || kind === "truck" ? 0.55 : 0.44;
  const rustK = wrecked ? 0.35 : 0;
  const paint = mix(body, c.rust, rustK * rng.range(0.3, 1));
  // wheels
  const axles = kind === "bus" ? [-L * 0.33, L * 0.3] : kind === "truck" ? [-L * 0.35, -L * 0.18, L * 0.32] : [-L * 0.31, L * 0.31];
  for (const az of axles) {
    for (const s of [-1, 1]) {
      if (wrecked && rng.chance(0.12)) continue; // missing wheel
      g.cylX(s * (W / 2 - 0.12), wr, az, wr, 0.34, 8, c.tire, c.metal);
    }
  }
  const sill = wr * 0.9;
  if (kind === "bus") {
    g.box(0, sill + 1.35, 0, W, 2.5, L, paint, { taper: 0.98, top: tint(paint, 0.15) });
    // window band
    g.box(0, sill + 1.9, 0, W + 0.04, 0.8, L - 1.2, c.glass);
    g.box(0, sill + 0.55, 0, W + 0.06, 0.18, L, c.hazard);
    g.box(0, sill + 1.9, L / 2 - 0.1, W - 0.3, 0.9, 0.12, c.glass);
    return;
  }
  if (kind === "truck") {
    // cab + box trailer
    g.box(0, sill + 0.95, L / 2 - 1.1, W, 1.7, 2.1, paint, { taper: 0.92, top: tint(paint, 0.15) });
    g.box(0, sill + 1.45, L / 2 - 0.25, W - 0.3, 0.7, 0.4, c.glass, { taper: 0.9 });
    g.box(0, sill + 1.5, -1, W + 0.1, 2.8, L - 2.4, tint(c.concrete, 0.1), { top: c.concrete });
    g.box(0, sill + 1.5, -1, W + 0.14, 0.35, L - 2.6, c.pal.propA);
    return;
  }
  const bodyH = kind === "van" ? 1.0 : 0.72;
  g.box(0, sill + bodyH / 2, 0, W, bodyH, L, paint, { taperZ: 0.94, top: tint(paint, 0.12) });
  // bumpers
  g.box(0, sill + 0.1, L / 2 + 0.02, W * 0.96, 0.26, 0.2, c.metal);
  g.box(0, sill + 0.1, -L / 2 - 0.02, W * 0.96, 0.26, 0.2, c.metal);
  // headlights / taillights
  g.box(-W * 0.32, sill + bodyH * 0.6, L / 2 + 0.03, 0.4, 0.16, 0.06, c.white);
  g.box(W * 0.32, sill + bodyH * 0.6, L / 2 + 0.03, 0.4, 0.16, 0.06, c.white);
  g.box(-W * 0.34, sill + bodyH * 0.6, -L / 2 - 0.03, 0.36, 0.16, 0.06, c.red);
  g.box(W * 0.34, sill + bodyH * 0.6, -L / 2 - 0.03, 0.36, 0.16, 0.06, c.red);
  if (kind === "pickup") {
    g.box(0, sill + bodyH + 0.42, 0.45, W * 0.9, 0.84, 1.7, c.glass, { taperZ: 0.8, taperX: 0.88, top: paint });
    g.box(0, sill + bodyH + 0.25, -1.3, W, 0.5, 1.7, tint(paint, -0.15), { noTop: true });
    g.box(0, sill + bodyH + 0.05, -1.3, W - 0.2, 0.1, 1.6, c.dark);
  } else {
    const cabL = kind === "van" ? L * 0.78 : L * 0.55;
    const cabZ = kind === "van" ? -L * 0.08 : -L * 0.05;
    const cabH = kind === "van" ? 0.95 : 0.66;
    g.box(0, sill + bodyH + cabH / 2, cabZ, W * 0.92, cabH, cabL, c.glass, { taperX: 0.86, taperZ: kind === "van" ? 0.92 : 0.7 });
    // roof slab
    g.box(0, sill + bodyH + cabH + 0.04, cabZ - 0.05, W * 0.8, 0.09, cabL * (kind === "van" ? 0.9 : 0.66), paint);
    // pillars (body colored stripes over the glass)
    g.box(0, sill + bodyH + cabH * 0.45, cabZ, W * 0.93, cabH * 0.9, 0.16, paint, { taperX: 0.88 });
    if (kind === "police") {
      g.box(0, sill + bodyH + cabH + 0.18, cabZ, 1.1, 0.16, 0.3, c.red);
      g.box(0.3, sill + bodyH + cabH + 0.18, cabZ, 0.5, 0.17, 0.31, c.glowCool);
      g.box(0, sill + bodyH * 0.5, 0, W + 0.04, 0.3, L * 0.5, c.white);
    }
  }
  if (wrecked) {
    // crumpled hood panel + scorch
    g.at(Xf.trs(rng.range(-0.3, 0.3), sill + bodyH + 0.04, L * 0.36, rng.range(-0.3, 0.3), 1, rng.range(-0.25, -0.05), rng.range(-0.2, 0.2)), () =>
      g.box(0, 0, 0, W * 0.8, 0.08, L * 0.24, tint(paint, -0.1)),
    );
    if (rng.chance(0.5)) g.box(rng.range(-0.4, 0.4), sill + bodyH + 0.02, -L * 0.3, 0.7, 0.05, 0.9, c.dark);
  }
}

// ------------------------------------------------------------- road junk

export function barrel(g: Geo, col: RGB, band: RGB, x = 0, y = 0, z = 0): void {
  g.cyl(x, y, z, 0.42, 0.42, 1.15, 9, col, { top: tint(col, -0.15) });
  g.cyl(x, y + 0.22, z, 0.44, 0.44, 0.12, 9, band);
  g.cyl(x, y + 0.82, z, 0.44, 0.44, 0.12, 9, band);
}

export function crate(g: Geo, c: Colors, s = 1, x = 0, y = 0, z = 0): void {
  g.box(x, y + 0.45 * s, z, 0.9 * s, 0.9 * s, 0.9 * s, c.wood, { top: tint(c.wood, 0.1) });
  g.box(x, y + 0.45 * s, z, 0.94 * s, 0.14 * s, 0.94 * s, c.woodDark);
  g.box(x, y + 0.45 * s, z, 0.14 * s, 0.94 * s, 0.94 * s, c.woodDark);
}

export function tire(g: Geo, c: Colors, x: number, y: number, z: number): void {
  g.at(Xf.trs(x, y + 0.14, z, 0, 1, 0, 0), () => {
    g.cyl(0, 0, 0, 0.5, 0.5, 0.28, 8, c.tire, { top: c.dark });
  });
}

export function cone(g: Geo, c: Colors, x = 0, y = 0, z = 0): void {
  g.box(x, y + 0.04, z, 0.5, 0.08, 0.5, c.dark);
  g.cyl(x, y + 0.08, z, 0.2, 0.04, 0.62, 6, rgb("#f26b1d"));
  g.cyl(x, y + 0.36, z, 0.135, 0.105, 0.12, 6, c.white);
}

export function jersey(g: Geo, c: Colors, len = 3, stripe = false): void {
  g.box(0, 0.22, 0, 0.75, 0.44, len, c.concrete);
  g.box(0, 0.62, 0, 0.36, 0.38, len, c.concrete, { taperX: 0.7, top: tint(c.concrete, 0.12) });
  if (stripe) g.box(0, 0.62, 0, 0.38, 0.12, len * 0.96, c.hazard, { taperX: 0.9 });
}

export function sandbags(g: Geo, c: Colors, len: number, rows: number, rng: Rng): void {
  const bag = mix(c.pal.ground, c.white, 0.25);
  for (let r = 0; r < rows; r++) {
    const n = Math.max(1, Math.round(len / 0.75));
    for (let i = 0; i < n; i++) {
      const z = -len / 2 + (i + 0.5 + (r % 2) * 0.5) * (len / n);
      if (z > len / 2) continue;
      g.box(rng.range(-0.04, 0.04), 0.14 + r * 0.26, z, 0.62, 0.28, 0.72, tint(bag, rng.range(-0.12, 0.06)), { taper: 0.88 });
    }
  }
}

// ---------------------------------------------------------- vegetation

export function rock(g: Geo, col: RGB, rng: Rng, s = 1): void {
  g.blob(0, s * 0.35, 0, s * rng.range(0.8, 1.3), s * rng.range(0.55, 0.9), s * rng.range(0.8, 1.2), col, 7, 4, 0.22, rng.int(1, 999), true);
}

export function cactus(g: Geo, c: Colors, rng: Rng): void {
  const col = c.pal.propC;
  const h = rng.range(2.6, 4.2);
  g.cyl(0, 0, 0, 0.32, 0.26, h, 7, col, { top: tint(col, 0.15) });
  g.blob(0, h, 0, 0.26, 0.2, 0.26, tint(col, 0.1), 7, 3);
  const arms = rng.int(1, 2);
  for (let i = 0; i < arms; i++) {
    const s = i === 0 ? 1 : -1;
    const ay = h * rng.range(0.35, 0.6);
    const ah = rng.range(0.8, 1.5);
    g.cylX(s * 0.55, ay, 0, 0.18, 0.75, 6, col);
    g.cyl(s * 0.85, ay - 0.1, 0, 0.2, 0.17, ah, 6, col, { top: tint(col, 0.15) });
  }
  // a pink flower
  if (rng.chance(0.4)) g.blob(0.1, h + 0.12, 0.1, 0.12, 0.08, 0.12, c.pal.propA, 5, 2);
}

export function deadPalm(g: Geo, c: Colors, rng: Rng): void {
  const segs = 6;
  const h = rng.range(6, 9);
  const lean = rng.range(0.08, 0.22);
  let x = 0, y = 0;
  for (let i = 0; i < segs; i++) {
    const nx = x + lean * (h / segs) * (i / segs) * 1.6;
    const ny = y + h / segs;
    g.beam(x, y, 0, nx, ny, 0, 0.42 - i * 0.03, 0.42 - i * 0.03, tint(c.trunk, (i % 2) * 0.08));
    x = nx; y = ny;
  }
  const frond = tint(mix(c.pal.ground, c.trunk, 0.5), -0.05);
  for (let k = 0; k < 7; k++) {
    const a = (k / 7) * Math.PI * 2 + rng.range(-0.2, 0.2);
    const len = rng.range(1.8, 2.6);
    const dx = Math.cos(a), dz = Math.sin(a);
    g.beam(x, y, 0, x + dx * len, y - rng.range(0.9, 1.8), dz * len, 0.32, 0.06, frond);
  }
}

export function roundTree(g: Geo, c: Colors, rng: Rng): void {
  const h = rng.range(2.2, 3.4);
  g.cyl(0, 0, 0, 0.26, 0.2, h, 6, c.trunk);
  const r = rng.range(1.6, 2.4);
  g.blob(0, h + r * 0.55, 0, r, r * 0.85, r, c.foliage, 8, 5, 0.12, rng.int(1, 999));
  g.blob(r * 0.5, h + r * 0.2, r * 0.2, r * 0.6, r * 0.5, r * 0.6, c.foliage2, 7, 4, 0.12, rng.int(1, 999));
}

export function pine(g: Geo, c: Colors, rng: Rng, snow: RGB | null): void {
  const h = rng.range(5, 9);
  const col = tint(mix(c.pal.propA, c.pal.propC, 0.15), -0.35);
  g.cyl(0, 0, 0, 0.3, 0.22, h * 0.25, 6, c.trunk);
  const tiers = 3;
  for (let i = 0; i < tiers; i++) {
    const t = i / tiers;
    const r = (1 - t * 0.6) * h * 0.26;
    const y0 = h * (0.15 + t * 0.26);
    g.cyl(0, y0, 0, r, 0, h * 0.42, 7, tint(col, i * 0.06), { angle: i * 0.4 });
    if (snow) g.cyl(0, y0 + h * 0.22, 0, r * 0.5, 0, h * 0.2, 7, snow, { angle: i * 0.4 });
  }
}

export function bush(g: Geo, col: RGB, rng: Rng, s = 1): void {
  g.blob(0, 0.45 * s, 0, s * 0.9, s * 0.6, s * 0.9, col, 7, 3, 0.15, rng.int(1, 999), true);
}

export function tumbleweed(g: Geo, c: Colors, rng: Rng): void {
  g.blob(0, 0.45, 0, 0.5, 0.45, 0.5, tint(c.trunk, 0.35), 6, 4, 0.3, rng.int(1, 999));
}

// --------------------------------------------------------- structures

export function billboard(g: Geo, c: Colors, rng: Rng): void {
  const w = rng.range(7, 10), h = rng.range(3, 4), post = rng.range(4, 6);
  for (const s of [-1, 1]) g.box(s * w * 0.3, post / 2, 0, 0.3, post, 0.3, c.woodDark);
  g.box(0, post + h / 2, 0, w + 0.3, h + 0.3, 0.3, c.woodDark);
  // stylized ad: color blocks
  const a = rng.pick(c.carColors), b = rng.pick([c.white, c.pal.roadLine, c.pal.sky]);
  g.box(0, post + h / 2, 0.18, w, h, 0.05, b);
  g.box(-w * 0.22, post + h * 0.55, 0.22, w * 0.45, h * 0.6, 0.05, a);
  g.box(w * 0.25, post + h * 0.68, 0.22, w * 0.35, h * 0.16, 0.05, c.dark);
  g.box(w * 0.25, post + h * 0.4, 0.22, w * 0.3, h * 0.12, 0.05, c.dark);
  // torn panel
  if (rng.chance(0.5)) g.at(Xf.trs(w * 0.3, post + h * 0.1, 0.3, 0, 1, 0.5, 0.3), () => g.box(0, 0, 0, w * 0.2, h * 0.3, 0.04, b));
  g.box(0, post - 0.1, 0.5, w, 0.1, 0.8, c.metal); // catwalk
}

export function mesa(g: Geo, c: Colors, rng: Rng, s: number): void {
  const base = mix(c.pal.propA, c.pal.ground, 0.35);
  const layers = rng.int(2, 4);
  let w = s * rng.range(1, 1.5), d = s * rng.range(0.8, 1.2), y = 0;
  for (let i = 0; i < layers; i++) {
    const h = s * rng.range(0.25, 0.45);
    const col = i % 2 ? tint(base, 0.12) : tint(base, -0.05 - i * 0.04);
    g.box(0, y + h / 2, 0, w, h, d, col, { taper: rng.range(0.72, 0.9), top: tint(c.pal.ground, -0.05) });
    y += h;
    w *= rng.range(0.6, 0.8);
    d *= rng.range(0.6, 0.85);
  }
}

export function house(g: Geo, c: Colors, rng: Rng): void {
  const w = rng.range(8, 11), d = rng.range(7, 9), h = rng.range(3, 3.6);
  const wall = rng.pick([c.pal.propA, c.pal.propB, c.pal.propC, c.white]);
  const roof = tint(rng.pick([c.pal.propA, c.pal.propC, c.pal.road]), -0.3);
  g.box(0, 0.25, 0, w + 0.6, 0.5, d + 0.6, c.concrete); // foundation
  g.box(0, 0.5 + h / 2, 0, w, h, d, wall, { top: tint(wall, -0.2) });
  // gable roof (prism along X)
  const rh = rng.range(2, 2.8);
  const ry = 0.5 + h;
  const ox = w / 2 + 0.4, oz = d / 2 + 0.5;
  g.poly([-ox, ry, -oz, -ox, ry + rh, 0, ox, ry + rh, 0, ox, ry, -oz], roof); // back slope
  g.poly([-ox, ry, oz, ox, ry, oz, ox, ry + rh, 0, -ox, ry + rh, 0], tint(roof, 0.08)); // front slope
  g.poly([-w / 2, ry, -d / 2, -w / 2, ry, d / 2, -w / 2, ry + rh * 0.9, 0], wall);
  g.poly([w / 2, ry, d / 2, w / 2, ry, -d / 2, w / 2, ry + rh * 0.9, 0], wall);
  g.poly([-ox, ry - 0.05, -oz, ox, ry - 0.05, -oz, ox, ry - 0.05, oz, -ox, ry - 0.05, oz], tint(roof, -0.3));
  // chimney
  if (rng.chance(0.6)) g.box(w * 0.28, ry + rh * 0.7, -d * 0.15, 0.7, 1.8, 0.7, tint(c.pal.propA, -0.2));
  // door + windows (front = +Z)
  g.box(-w * 0.15, 0.5 + 1.05, d / 2 + 0.03, 1.1, 2.1, 0.08, tint(roof, 0.1));
  for (const wx of [-w * 0.36, w * 0.2, w * 0.38]) {
    g.box(wx, 0.5 + h * 0.58, d / 2 + 0.03, 1.2, 1.1, 0.08, c.glass);
    g.box(wx, 0.5 + h * 0.58, d / 2 + 0.06, 1.4, 0.12, 0.08, c.white);
  }
  // porch
  g.box(-w * 0.15, 0.55, d / 2 + 0.8, 3, 0.15, 1.6, c.wood);
  // garage
  if (rng.chance(0.55)) {
    g.box(w / 2 + 2.2, 0.5 + 1.4, 0.5, 4, 2.8, d - 1, mix(wall, c.white, 0.3), { top: roof });
    g.box(w / 2 + 2.2, 0.5 + 1.2, d / 2 - 0.47, 3, 2.3, 0.08, c.white);
  }
}

export function pickets(g: Geo, c: Colors, len: number): void {
  const col = c.white;
  g.box(0, 0.45, 0, 0.06, 0.1, len, col);
  g.box(0, 0.85, 0, 0.06, 0.1, len, col);
  const n = Math.round(len / 0.32);
  for (let i = 0; i < n; i++) g.box(0, 0.55, -len / 2 + (i + 0.5) * (len / n), 0.08, 1.1, 0.14, col, { taperZ: 0.6 });
}

export function mailbox(g: Geo, c: Colors, rng: Rng): void {
  g.box(0, 0.55, 0, 0.12, 1.1, 0.12, c.woodDark);
  g.box(0, 1.2, 0, 0.36, 0.34, 0.6, rng.pick(c.carColors), { top: tint(c.white, -0.1) });
  g.box(0.2, 1.35, -0.1, 0.04, 0.3, 0.08, c.red);
}

export function streetLight(g: Geo, glow: Geo, c: Colors, side: number, h = 7, arm = 2.2): void {
  g.cyl(0, 0, 0, 0.2, 0.14, h, 6, c.metal);
  g.box(0, 0.3, 0, 0.5, 0.6, 0.5, c.metal);
  g.beam(0, h - 0.1, 0, -side * arm, h + 0.25, 0, 0.14, 0.14, c.metal);
  g.box(-side * arm, h + 0.12, 0, 0.9, 0.22, 0.45, c.dark);
  glow.box(-side * arm, h - 0.02, 0, 0.75, 0.08, 0.36, c.glowWarm);
}

export function trafficLight(g: Geo, glow: Geo, c: Colors, side: number): void {
  g.cyl(0, 0, 0, 0.16, 0.12, 5.6, 6, c.metal);
  g.beam(0, 5.4, 0, -side * 4, 5.4, 0, 0.14, 0.14, c.metal);
  g.box(-side * 3.5, 4.9, 0, 0.45, 1.3, 0.4, c.dark);
  glow.box(-side * 3.5, 5.3, 0.2, 0.24, 0.24, 0.05, c.red);
  glow.box(-side * 3.5, 4.5, 0.2, 0.24, 0.24, 0.05, mix(c.red, [1, 0.8, 0.1], 0.7));
}

export function utilityPole(g: Geo, c: Colors, h = 8): void {
  g.cyl(0, 0, 0, 0.18, 0.14, h, 6, c.woodDark);
  g.box(0, h - 0.6, 0, 2.4, 0.16, 0.16, c.woodDark);
  for (const x of [-1, 0.9]) g.cyl(x, h - 0.52, 0, 0.07, 0.07, 0.18, 5, c.white);
}

/** City tower: facade faces +Z (toward the road when placed). */
export function building(g: Geo, glow: Geo, c: Colors, rng: Rng, w: number, d: number, h: number, night: boolean): void {
  const wall = tint(rng.pick([c.pal.propC, c.pal.ground, c.pal.road, mix(c.pal.propB, c.pal.ground, 0.7)]), rng.range(-0.1, 0.15));
  g.box(0, h / 2, 0, w, h, d, wall, { top: tint(wall, -0.25) });
  // ground floor storefront
  g.box(0, 1.6, d / 2 + 0.05, w - 0.6, 3.2, 0.1, c.dark);
  const awning = rng.pick([c.pal.propA, c.pal.propB, c.pal.propC]);
  g.at(Xf.trs(0, 3.4, d / 2 + 0.7, 0, 1, 0.35), () => g.box(0, 0, 0, w - 0.4, 0.12, 1.5, awning));
  // window grid on front (+Z) and road-adjacent sides
  const fy = 4.5, rows = Math.floor((h - fy - 1.5) / 3.2), cols = Math.max(3, Math.floor(w / 1.9));
  const winW = (w / cols) * 0.5;
  const litCols = [c.glowWarm, c.glowWarm, c.glowCool, mix(c.glowWarm, c.pal.propA, 0.4)];
  for (let r = 0; r < rows; r++) {
    for (let k = 0; k < cols; k++) {
      const x = -w / 2 + (k + 0.5) * (w / cols);
      const y = fy + r * 3.2 + 1.2;
      const lit = night ? rng.chance(0.38) : false;
      if (lit) glow.box(x, y, d / 2 + 0.04, winW, 1.3, 0.06, rng.pick(litCols));
      else g.box(x, y, d / 2 + 0.04, winW, 1.3, 0.06, rng.chance(0.15) ? c.dark : c.glass);
    }
  }
  // side windows (only a column strip, cheap)
  for (const s of [-1, 1]) {
    for (let r = 0; r < rows; r += 1) {
      const y = fy + r * 3.2 + 1.2;
      const lit = night && rng.chance(0.3);
      (lit ? glow : g).box(s * (w / 2 + 0.03), y, d * 0.25, 0.06, 1.5, d * 0.25, lit ? c.glowWarm : c.glass);
    }
  }
  // roof details
  g.box(0, h + 0.35, 0, w + 0.3, 0.7, d + 0.3, tint(wall, -0.15), { noBottom: true });
  if (rng.chance(0.6)) {
    const tx = rng.range(-w / 4, w / 4), tz = rng.range(-d / 4, d / 4);
    for (const lx of [-0.8, 0.8]) for (const lz of [-0.8, 0.8]) g.box(tx + lx, h + 1.2, tz + lz, 0.15, 1.6, 0.15, c.woodDark);
    g.cyl(tx, h + 2, tz, 1.3, 1.3, 2.2, 8, c.wood, { top: c.woodDark });
    g.cyl(tx, h + 4.2, tz, 1.35, 0, 0.8, 8, c.woodDark);
  }
  if (rng.chance(0.5)) {
    g.box(-w / 4, h + 1.1, -d / 4, 2.2, 1.4, 1.6, c.metal);
  }
  if (rng.chance(0.4)) {
    g.cyl(w * 0.3, h + 0.7, 0, 0.08, 0.05, 6, 4, c.metal);
    glow.box(w * 0.3, h + 6.8, 0, 0.3, 0.3, 0.3, c.red);
  }
}

/** Vertical neon sign (glow). */
export function neon(g: Geo, glow: Geo, c: Colors, rng: Rng, h: number): void {
  const col = rng.pick([c.pal.propA, c.pal.propB, c.pal.propC, c.glowWarm]);
  const n = rng.int(3, 5);
  g.box(0, h, 0, 0.3, n * 1.1 + 0.4, 1.4, c.dark);
  for (let i = 0; i < n; i++) {
    glow.box(0.18, h - (n * 1.1) / 2 + 0.55 + i * 1.1, 0, 0.08, 0.8, 0.9, col);
  }
  glow.box(0.18, h + (n * 1.1) / 2 + 0.1, 0, 0.06, 0.08, 1.4, col);
  glow.box(0.18, h - (n * 1.1) / 2 - 0.1, 0, 0.06, 0.08, 1.4, col);
}

export function cabin(g: Geo, c: Colors, rng: Rng, snow: RGB): void {
  const w = rng.range(6, 8), d = rng.range(5, 6), h = 2.6;
  const log = tint(mix(c.pal.propC, c.pal.ground, 0.3), -0.45);
  for (let i = 0; i < 6; i++) {
    g.box(0, 0.25 + i * 0.44, 0, w, 0.46, d, tint(log, (i % 2) * 0.08), { noTop: i < 5, noBottom: i > 0 });
  }
  const ry = h + 0.1, rh = 2.2, ox = w / 2 + 0.5, oz = d / 2 + 0.6;
  g.poly([-ox, ry, -oz, -ox, ry + rh, 0, ox, ry + rh, 0, ox, ry, -oz], snow);
  g.poly([-ox, ry, oz, ox, ry, oz, ox, ry + rh, 0, -ox, ry + rh, 0], tint(snow, -0.04));
  g.poly([-w / 2, ry, -d / 2, -w / 2, ry, d / 2, -w / 2, ry + rh * 0.9, 0], log);
  g.poly([w / 2, ry, d / 2, w / 2, ry, -d / 2, w / 2, ry + rh * 0.9, 0], log);
  g.poly([-ox, ry - 0.05, -oz, ox, ry - 0.05, -oz, ox, ry - 0.05, oz, -ox, ry - 0.05, oz], log);
  g.box(0, 1.05, d / 2 + 0.05, 1, 2, 0.1, c.pal.propC);
  g.box(w * 0.28, 1.5, d / 2 + 0.05, 1, 0.9, 0.1, c.glowWarm);
  g.box(w * 0.3, ry + rh * 0.6, 0, 0.6, 1.8, 0.6, c.concrete);
  if (rng.chance(0.5)) for (let i = 0; i < 4; i++) g.cylX(-w / 2 - 0.8, 0.2 + i * 0.36, 0, 0.18, 1.2, 6, log);
}

export function watchtower(g: Geo, c: Colors): void {
  const leg = c.woodDark, h = 6;
  for (const x of [-1.2, 1.2]) for (const z of [-1.2, 1.2]) g.beam(x * 1.3, 0, z * 1.3, x, h, z, 0.22, 0.22, leg);
  g.beam(-1.5, 2.5, -1.5, 1.5, 2.5, 1.5, 0.12, 0.12, leg);
  g.beam(1.5, 2.5, -1.5, -1.5, 2.5, 1.5, 0.12, 0.12, leg);
  g.box(0, h + 0.1, 0, 3.4, 0.2, 3.4, c.wood);
  const bag = mix(c.pal.ground, c.white, 0.25);
  g.box(0, h + 0.6, 1.6, 3.4, 0.9, 0.3, bag);
  g.box(0, h + 0.6, -1.6, 3.4, 0.9, 0.3, bag);
  g.box(1.6, h + 0.6, 0, 0.3, 0.9, 3.4, bag);
  g.box(-1.6, h + 0.6, 0, 0.3, 0.9, 3.4, bag);
  for (const x of [-1.5, 1.5]) for (const z of [-1.5, 1.5]) g.box(x, h + 1.4, z, 0.14, 2.4, 0.14, leg);
  g.box(0, h + 2.7, 0, 4, 0.25, 4, c.pal.propA, { taper: 0.6 });
  // searchlight
  g.cylZ(1, h + 1.4, 1.4, 0.3, 0.6, 7, c.metal, c.glowWarm);
}

export function tank(g: Geo, c: Colors, rng: Rng): void {
  const col = mix(c.pal.propA, c.rust, rng.range(0, 0.3));
  for (const s of [-1, 1]) {
    g.box(s * 1.45, 0.55, 0, 0.9, 1.1, 6.6, c.dark, { taperZ: 0.85 });
    for (let i = 0; i < 5; i++) g.cylX(s * 1.45, 0.45, -2.4 + i * 1.2, 0.4, 0.95, 7, tint(c.dark, 0.1));
  }
  g.box(0, 1.25, 0, 3.2, 0.9, 6.4, col, { taperZ: 0.88, top: tint(col, 0.1) });
  g.at(Xf.trs(0, 1.7, -0.3, rng.range(-0.8, 0.8)), () => {
    g.box(0, 0.45, 0, 2.3, 0.9, 2.8, tint(col, 0.06), { taper: 0.75 });
    g.cylZ(0, 0.5, 2.9, 0.14, 3.6, 6, tint(col, -0.1));
    g.cyl(0.5, 0.9, -0.5, 0.35, 0.35, 0.3, 6, col);
  });
  // star decal
  g.box(0, 1.71, 1.5, 0.8, 0.02, 0.8, c.white);
}

export function tent(g: Geo, c: Colors, rng: Rng): void {
  const col = tint(c.pal.propA, rng.range(-0.1, 0.1));
  const w = rng.range(4, 5.5), l = rng.range(5, 7), h = 2.6;
  g.poly([-w / 2, 0, -l / 2, -w / 2, 0, l / 2, 0, h, l / 2, 0, h, -l / 2], col);
  g.poly([w / 2, 0, l / 2, w / 2, 0, -l / 2, 0, h, -l / 2, 0, h, l / 2], tint(col, 0.08));
  g.poly([-w / 2, 0, l / 2, w / 2, 0, l / 2, 0, h, l / 2], tint(col, -0.1));
  g.poly([w / 2, 0, -l / 2, -w / 2, 0, -l / 2, 0, h, -l / 2], tint(col, -0.1));
  g.box(0, 0.9, l / 2 + 0.01, 1, 1.8, 0.04, c.dark);
}

export function chainFence(g: Geo, c: Colors, len: number, wire = true): void {
  const post = c.metal;
  const n = Math.max(1, Math.round(len / 3));
  for (let i = 0; i <= n; i++) g.cyl(0, 0, -len / 2 + (i * len) / n, 0.07, 0.07, 2.6, 5, post);
  g.box(0, 2.5, 0, 0.06, 0.06, len, post);
  // mesh rendered as a lattice of thin bars
  const mesh = tint(post, 0.15);
  for (let k = 0; k < 5; k++) g.box(0, 0.3 + k * 0.5, 0, 0.03, 0.03, len, mesh);
  const m = Math.round(len / 0.5);
  for (let i = 0; i < m; i++) g.box(0, 1.3, -len / 2 + (i + 0.5) * (len / m), 0.03, 2.4, 0.03, mesh);
  if (wire) {
    // barbed wire coil
    for (let i = 0; i < m; i++) {
      const z = -len / 2 + (i + 0.5) * (len / m);
      g.at(Xf.trs(0, 2.85, z, 0, 1, 0.3 * (i % 2 ? 1 : -1)), () => g.box(0, 0, 0, 0.5, 0.5, 0.04, mesh, { noTop: true, noBottom: true }));
    }
  }
}

export function tWall(g: Geo, c: Colors, rng: Rng): void {
  const col = tint(c.concrete, rng.range(-0.08, 0.04));
  g.box(0, 0.4, 0, 1.6, 0.8, 1.45, col);
  g.box(0, 2.3, 0, 0.35, 3.8, 1.45, col, { top: tint(col, 0.1) });
  if (rng.chance(0.3)) g.box(0.19, 2.6, 0, 0.02, 0.5, 1.2, c.hazard);
}

export function hesco(g: Geo, c: Colors, len: number): void {
  const n = Math.max(1, Math.round(len / 1.1));
  const fill = mix(c.pal.ground, c.white, 0.15);
  for (let i = 0; i < n; i++) {
    const z = -len / 2 + (i + 0.5) * (len / n);
    g.box(0, 0.7, z, 1.05, 1.4, 1.05, mix(fill, c.pal.propA, 0.3), { top: fill });
  }
}

/** Hazard chevron sign (glow-ish stripe face). */
export function chevron(g: Geo, c: Colors, dir: number): void {
  g.box(0, 0.75, 0, 0.12, 1.5, 0.12, c.metal);
  g.box(0, 1.6, 0, 1.4, 0.9, 0.08, c.dark);
  for (let i = 0; i < 2; i++) {
    const x = -0.35 + i * 0.5;
    g.at(Xf.trs(x, 1.6, 0.05, 0, 1, 0, dir * 0.6), () => g.box(0, 0, 0, 0.16, 0.8, 0.04, c.hazard));
  }
}

export function snowman(g: Geo, c: Colors, snow: RGB): void {
  g.blob(0, 0.5, 0, 0.6, 0.55, 0.6, snow, 7, 4);
  g.blob(0, 1.25, 0, 0.42, 0.4, 0.42, snow, 7, 4);
  g.blob(0, 1.8, 0, 0.3, 0.3, 0.3, snow, 7, 4);
  g.cylZ(0, 1.8, 0.4, 0.05, 0.3, 4, c.pal.propC);
  g.box(0, 2.1, 0, 0.5, 0.06, 0.5, c.dark);
  g.box(0, 2.3, 0, 0.32, 0.4, 0.32, c.dark);
}

/** Czech hedgehog anti-tank obstacle (three crossed steel beams). */
export function hedgehog(g: Geo, c: Colors): void {
  const steel = tint(c.metal, -0.2);
  g.at(Xf.trs(0, 0.75, 0, 0, 1, 0.6, 0.6), () => g.box(0, 0, 0, 0.18, 2.2, 0.18, steel));
  g.at(Xf.trs(0, 0.75, 0, 0, 1, -0.6, 0.6), () => g.box(0, 0, 0, 0.18, 2.2, 0.18, steel));
  g.at(Xf.trs(0, 0.75, 0, Math.PI / 2, 1, 0.6, 0), () => g.box(0, 0, 0, 0.18, 2.2, 0.18, steel));
}

/** Red/white restricted-area sign on two posts. */
export function warningSign(g: Geo, c: Colors): void {
  g.box(-0.7, 0.9, 0, 0.1, 1.8, 0.1, c.metal);
  g.box(0.7, 0.9, 0, 0.1, 1.8, 0.1, c.metal);
  g.box(0, 1.7, 0.06, 1.8, 1, 0.06, c.white);
  g.box(0, 1.95, 0.1, 1.8, 0.35, 0.03, c.red);
  g.box(0, 1.5, 0.1, 1.3, 0.1, 0.03, c.dark);
  g.box(0, 1.35, 0.1, 1.0, 0.1, 0.03, c.dark);
}

/** Floodlight mast with glowing head. */
export function floodMast(g: Geo, glow: Geo, c: Colors, h = 9): void {
  g.box(0, h / 2, 0, 0.3, h, 0.3, c.metal);
  g.box(0, h + 0.4, 0, 2, 0.9, 0.4, c.dark);
  glow.box(0, h + 0.4, 0.22, 1.7, 0.6, 0.04, c.glowWarm);
}
