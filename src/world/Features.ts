/**
 * On-road gameplay features: ramps (several themed variants), gap lips,
 * static wrecks to steer around and breakable barricades / barrel clusters.
 *
 * Ramp geometry is sampled in the road frame (it follows the curve and the
 * hills exactly) and its surface triangles go straight into the chunk's
 * collision mesh, so what you see is exactly what the wheels hit.
 */
import { mix, rgb, tint, Xf, type RGB } from "./Geo";
import { car, type CarKind } from "./Props";
import type { Deco } from "./Biomes";
import type { Debris, DebrisKind } from "./Debris";
import { Rng } from "./rng";
import { HW, type Feature } from "./Track";

/** Ramp profile: slightly concave so the lip kicks the car upward. */
const profile = (t: number) => 0.62 * t + 0.38 * t * t;

interface RampFrame {
  n: number;
  z: number[];
  xc: number[]; // lateral center
  y0: number[]; // road under the ramp
  top: number[]; // surface height
  hw: number;
}

function frame(k: Deco, f: Feature, n: number): RampFrame {
  const r: RampFrame = { n, z: [], xc: [], y0: [], top: [], hw: f.w / 2 };
  for (let i = 0; i <= n; i++) {
    const t = i / n;
    const z = f.z + t * f.len;
    const xc = k.track.laneX(z, f.lane) + f.u;
    const y0 = k.track.heightAt(xc, z);
    r.z.push(z);
    r.xc.push(xc);
    r.y0.push(y0);
    r.top.push(y0 + f.h * profile(t) - 0.02);
  }
  return r;
}

/**
 * Emit the wedge: top surface (visual + collision), side walls and back face.
 * `flare` widens the base for mound-like ramps; `showSides` false leaves the
 * sides open visually (plank ramps on barrels) but still collides.
 */
function wedge(k: Deco, r: RampFrame, topCol: (i: number, strip: number) => RGB, sideCol: RGB, o: { flare?: number; showSides?: boolean; strips?: number; sink?: number } = {}): void {
  const flare = o.flare ?? 0;
  const strips = o.strips ?? 1;
  const sink = o.sink ?? 0.35;
  const g = k.hero;
  for (let i = 0; i < r.n; i++) {
    const za = r.z[i], zb = r.z[i + 1];
    // top surface in strips across the width
    for (let s = 0; s < strips; s++) {
      const u0 = -r.hw + (2 * r.hw * s) / strips;
      const u1 = -r.hw + (2 * r.hw * (s + 1)) / strips;
      const gap = strips > 1 ? 0.03 : 0;
      g.poly([r.xc[i] + u0 + gap, r.top[i], za, r.xc[i + 1] + u0 + gap, r.top[i + 1], zb, r.xc[i + 1] + u1 - gap, r.top[i + 1], zb, r.xc[i] + u1 - gap, r.top[i], za], topCol(i, s));
    }
    const la = r.xc[i] - r.hw, lb = r.xc[i + 1] - r.hw, ra = r.xc[i] + r.hw, rb = r.xc[i + 1] + r.hw;
    const fa = flare * (r.top[i] - r.y0[i]), fb = flare * (r.top[i + 1] - r.y0[i + 1]);
    k.col.poly([la, r.top[i], za, la - fa, r.y0[i] - sink, za, lb - fb, r.y0[i + 1] - sink, zb, lb, r.top[i + 1], zb]);
    k.col.poly([ra, r.top[i], za, rb, r.top[i + 1], zb, rb + fb, r.y0[i + 1] - sink, zb, ra + fa, r.y0[i] - sink, za]);
    k.col.poly([la, r.top[i], za, lb, r.top[i + 1], zb, rb, r.top[i + 1], zb, ra, r.top[i], za]);
    if (o.showSides !== false) {
      g.poly([la, r.top[i], za, la - fa, r.y0[i] - sink, za, lb - fb, r.y0[i + 1] - sink, zb, lb, r.top[i + 1], zb], sideCol);
      g.poly([ra, r.top[i], za, rb, r.top[i + 1], zb, rb + fb, r.y0[i + 1] - sink, zb, ra + fa, r.y0[i] - sink, za], sideCol);
    }
  }
  // back face
  const n = r.n;
  const fl = flare * (r.top[n] - r.y0[n]);
  const back = [r.xc[n] - r.hw - fl, r.y0[n] - sink, r.z[n], r.xc[n] + r.hw + fl, r.y0[n] - sink, r.z[n], r.xc[n] + r.hw, r.top[n], r.z[n], r.xc[n] - r.hw, r.top[n], r.z[n]];
  k.col.poly(back);
  if (o.showSides !== false) g.poly(back, tint(sideCol, -0.1));
}

/** Transform at a point along the ramp (t = 0..1), lateral offset u. */
function along(k: Deco, f: Feature, t: number, u: number, dy = 0, yaw = 0): Xf {
  const z = f.z + t * f.len;
  const x = k.track.laneX(z, f.lane) + f.u + u;
  return Xf.trs(x, k.track.heightAt(x, z) + dy, z, yaw);
}

/** Point on the ramp surface at fraction t (0..1) and lateral offset u. */
function surf(r: RampFrame, t: number, u: number, lift = 0.03): [number, number, number] {
  const fi = Math.min(r.n - 1e-6, Math.max(0, t * r.n));
  const i = Math.floor(fi), a = fi - i;
  const z = r.z[i] + (r.z[i + 1] - r.z[i]) * a;
  const xc = r.xc[i] + (r.xc[i + 1] - r.xc[i]) * a;
  const y = r.top[i] + (r.top[i + 1] - r.top[i]) * a;
  return [xc + u, y + lift, z];
}

/** Painted arrow chevrons + edge stripe so ramps read from a distance. */
function markings(k: Deco, r: RampFrame, color: RGB, edge: RGB): void {
  const g = k.hero;
  const w = r.hw * 0.55;
  for (const t0 of [0.28, 0.6]) {
    const dt = 0.07, th = 0.09;
    for (const s of [-1, 1]) {
      const a = surf(r, t0 - dt, s * w), b = surf(r, t0 + dt, 0), c = surf(r, t0 + dt + th, 0), d = surf(r, t0 - dt + th, s * w);
      // keep the right-hand normal pointing up for both arms
      if (s < 0) g.poly([...a, ...d, ...c, ...b], color, 0);
      else g.poly([...a, ...b, ...c, ...d], color, 0);
    }
  }
  // stripe along the top lip
  const n = 8;
  for (let i = 0; i < n; i++) {
    const u0 = -r.hw + (2 * r.hw * i) / n, u1 = -r.hw + (2 * r.hw * (i + 1)) / n;
    const a = surf(r, 0.94, u0, 0.035), b = surf(r, 1, u0, 0.035), c = surf(r, 1, u1, 0.035), d = surf(r, 0.94, u1, 0.035);
    g.poly([...a, ...b, ...c, ...d], i % 2 ? edge : color, 0);
  }
}

export function buildRamp(k: Deco, f: Feature): void {
  const c = k.c;
  const rng = new Rng(f.seed);
  const g = k.hero;
  const v = f.variant;
  const n = Math.max(5, Math.round(f.len / 1.4));
  const r = frame(k, f, n);
  if (v !== "concrete") markings(k, r, c.hazard, c.dark);
  switch (v) {
    case "planks": {
      const woods = [c.wood, tint(c.wood, 0.12), tint(c.wood, -0.1), mix(c.wood, c.pal.propA, 0.3)];
      wedge(k, r, (_i, s) => woods[(s + f.seed) % woods.length], c.woodDark, { strips: 6, showSides: false });
      // under-structure: barrels at the high end, posts midway, cross beams
      const zEnd = 0.93;
      const hEnd = f.h * profile(zEnd);
      for (const u of [-r.hw + 0.55, 0, r.hw - 0.55]) {
        let stacked = 0;
        while (stacked + 1.1 < hEnd - 0.1) {
          g.at(along(k, f, zEnd, u, stacked), () => {
            g.cyl(0, 0, 0, 0.42, 0.42, 1.1, 9, stacked % 2.2 < 1 ? c.rust : c.red, { top: c.dark });
            g.cyl(0, 0.2, 0, 0.44, 0.44, 0.1, 9, c.dark);
          });
          stacked += 1.1;
        }
        const left = hEnd - stacked - 0.05;
        if (left > 0.15) g.at(along(k, f, zEnd, u, stacked), () => g.box(0, left / 2, 0, 0.8, left, 0.8, c.woodDark));
        g.at(along(k, f, 0.5, u), () => g.box(0, (f.h * profile(0.5)) / 2, 0, 0.2, f.h * profile(0.5), 0.2, c.woodDark));
      }
      g.at(along(k, f, zEnd, 0, hEnd - 0.12), () => g.box(0, 0, 0, f.w + 0.3, 0.2, 0.25, c.woodDark));
      g.at(along(k, f, 0.5, 0, f.h * profile(0.5) - 0.12), () => g.box(0, 0, 0, f.w + 0.2, 0.18, 0.22, c.woodDark));
      break;
    }
    case "dune":
    case "dirt":
    case "snow":
    case "rubble": {
      const base = v === "snow" ? c.pal.ground : v === "rubble" ? c.concrete : v === "dune" ? tint(c.pal.ground, -0.05) : tint(mix(c.pal.ground, c.trunk, 0.5), -0.1);
      const topC = v === "snow" ? mix(c.pal.ground, c.pal.sky, 0.35) : tint(base, 0.08);
      wedge(k, r, (i) => (i % 2 ? topC : tint(topC, -0.04)), tint(base, -0.08), { flare: 0.9, sink: 0.25 });
      // chunks on the flanks
      for (let i = 0; i < 6; i++) {
        const t = rng.range(0.2, 0.95);
        const side = rng.sign();
        const col = v === "rubble" ? tint(c.concrete, rng.range(-0.2, 0.1)) : v === "snow" ? tint(c.pal.ground, -0.05) : tint(base, -0.15);
        g.at(along(k, f, t, side * (r.hw + 0.5), 0, rng.range(0, 3)), () => {
          if (v === "rubble") g.box(0, 0.2, 0, rng.range(0.5, 1.1), rng.range(0.3, 0.6), rng.range(0.5, 1.1), col, { taper: 0.8 });
          else g.blob(0, 0.15, 0, rng.range(0.3, 0.6), rng.range(0.2, 0.4), rng.range(0.3, 0.6), col, 6, 3, 0.2, i);
        });
      }
      if (v === "rubble") {
        // rebar spikes off the back
        for (let i = 0; i < 5; i++) {
          const u = rng.range(-r.hw, r.hw);
          g.at(along(k, f, 1, u, f.h - 0.1), () => g.beam(0, 0, 0, rng.range(-0.3, 0.3), rng.range(0.3, 0.8), rng.range(0.2, 0.7), 0.05, 0.05, c.rust));
        }
      }
      break;
    }
    case "carRamp": {
      // sheet-metal plate over a crushed car
      const plate = mix(c.metal, c.rust, 0.35);
      wedge(k, r, (i) => (i % 3 === 0 ? tint(plate, -0.08) : plate), c.dark, { showSides: false, strips: 2 });
      const hEnd = f.h * profile(0.92);
      // car lying sideways under the high end, scaled to the ramp height
      const s = Math.min(1.25, Math.max(0.55, hEnd / 1.65));
      g.at(along(k, f, 0.82, 0, 0, Math.PI / 2).mul(Xf.trs(0, 0, 0, 0, [1, s, 1])), () => car(g, c, rng.pick(c.carColors), "sedan", rng));
      // support posts if the car is short of the plate
      for (const u of [-r.hw + 0.4, r.hw - 0.4]) g.at(along(k, f, 0.97, u), () => g.box(0, (f.h * profile(0.97)) / 2, 0, 0.25, f.h * profile(0.97), 0.25, c.metal));
      g.at(along(k, f, 0.45, 0), () => g.box(0, (f.h * profile(0.45)) / 2, 0, f.w * 0.6, f.h * profile(0.45), 0.25, c.rust));
      break;
    }
    case "trailer": {
      const body = mix(c.white, c.pal.propB, 0.35);
      wedge(k, r, (i) => (i === r.n - 1 ? c.dark : body), body, { sink: 0.1 });
      // stripe and rear doors
      for (let i = 0; i < r.n; i++) {
        for (const s of [-1, 1]) {
          const x0 = r.xc[i] + s * (r.hw + 0.02), x1 = r.xc[i + 1] + s * (r.hw + 0.02);
          const y0 = r.top[i] - 0.9, y1 = r.top[i + 1] - 0.9;
          if (y0 < r.y0[i] + 0.05) continue;
          if (s < 0) g.poly([x0, y0 + 0.35, r.z[i], x0, y0, r.z[i], x1, y1, r.z[i + 1], x1, y1 + 0.35, r.z[i + 1]], c.pal.propA, 0);
          else g.poly([x0, y0 + 0.35, r.z[i], x1, y1 + 0.35, r.z[i + 1], x1, y1, r.z[i + 1], x0, y0, r.z[i]], c.pal.propA, 0);
        }
      }
      // wheels on the raised rear end + support wreck
      const hEnd = f.h * profile(1);
      g.at(along(k, f, 0.9, 0, Math.max(0.5, hEnd - 2.2)), () => {
        for (const s of [-1, 1]) g.cylX(s * 1.4, 0, 0, 0.5, 0.35, 8, c.tire, c.metal);
      });
      if (hEnd > 2.3) g.at(along(k, f, 0.96, 0, 0, Math.PI / 2), () => g.box(0, (hEnd - 2.3) / 2, 0, 2.2, hEnd - 2.3, 1.2, c.rust));
      break;
    }
    case "sandbag": {
      const bag = mix(c.pal.ground, c.white, 0.25);
      wedge(k, r, (i, s) => tint(bag, ((i + s) % 2) * 0.06 - 0.03), tint(bag, -0.1), { strips: 4 });
      break;
    }
    case "concrete":
    default: {
      // concrete slab ramp with hazard stripes on the lip
      wedge(k, r, (i, s) => (i === r.n - 1 ? (s % 2 ? c.hazard : c.dark) : tint(c.concrete, (i % 2) * 0.05)), tint(c.concrete, -0.15), { strips: v === "concrete" ? 8 : 1 });
      for (let i = 0; i < 6; i++) {
        const u = rng.range(-r.hw + 0.3, r.hw - 0.3);
        g.at(along(k, f, 1, u, f.h - 0.05), () => g.beam(0, 0, 0, rng.range(-0.2, 0.2), rng.range(0.2, 0.6), rng.range(0.2, 0.6), 0.05, 0.05, c.rust));
      }
    }
  }
}

/** Full-width takeoff lip before a gap, with warning signs. */
export function buildLip(k: Deco, f: Feature): void {
  const c = k.c;
  const n = Math.max(5, Math.round(f.len / 1.2));
  const r = frame(k, f, n);
  wedge(k, r, (i, s) => (i === r.n - 1 ? (s % 2 ? c.hazard : c.dark) : tint(c.concrete, (i % 2) * 0.05 - 0.05)), tint(c.concrete, -0.2), { strips: 10 });
  const rng = new Rng(f.seed);
  for (let i = 0; i < 8; i++) {
    const u = rng.range(-r.hw + 0.3, r.hw - 0.3);
    k.hero.at(along(k, f, 1, u, f.h - 0.05), () => k.hero.beam(0, 0, 0, rng.range(-0.2, 0.2), rng.range(0.25, 0.7), rng.range(0.3, 0.8), 0.05, 0.05, c.rust));
  }
  // warning signs ahead of the lip on both shoulders
  for (const s of [-1, 1]) {
    const z = f.z - 30;
    const x = (s < 0 ? k.track.leftEdge(z) : k.track.rightEdge(z)) + s * 2.2;
    k.hero.at(Xf.trs(x, k.track.heightAt(x, z), z, Math.PI), () => {
      k.hero.box(0, 1.1, 0, 0.12, 2.2, 0.12, c.metal);
      k.hero.at(Xf.trs(0, 2.5, 0, 0, 1, 0, Math.PI / 4), () => k.hero.box(0, 0, 0, 1.2, 1.2, 0.08, c.hazard));
      k.hero.box(0, 2.5, -0.06, 0.18, 0.7, 0.04, c.dark);
    });
  }
  // the bottom of the gap: puddle (or ice) + rubble along the edges
  const dip = k.track.dips.find((d) => d.zc > f.z && d.zc - d.half - f.z - f.len < 3);
  if (dip) {
    const water = k.def.biome === "frozen" ? mix(k.c.pal.sky, rgb("#bfe9ff"), 0.6) : k.def.biome === "desert" ? tint(k.c.pal.ground, -0.25) : tint(mix(k.c.pal.skyTop, k.c.pal.road, 0.5), -0.1);
    const pts: number[] = [];
    const m = 12;
    for (let i = m - 1; i >= 0; i--) {
      const a = (i / m) * Math.PI * 2;
      const z = dip.zc + Math.sin(a) * dip.half * 0.38 * rng.range(0.8, 1.1);
      const x = k.track.laneX(z, f.lane) + Math.cos(a) * (HW + 1.5) * rng.range(0.85, 1);
      pts.push(x, k.track.heightAt(x, dip.zc) + 0.06, z);
    }
    k.decal.poly(pts, water, 0);
  }
  for (let i = 0; i < 8; i++) {
    const z = f.z + f.len + rng.range(1, 16);
    const side = rng.sign();
    const x = k.track.laneX(z, f.lane) + side * rng.range(HW - 0.6, HW + 4);
    k.lit.at(Xf.trs(x, k.track.heightAt(x, z) - 0.2, z, rng.range(0, 3)), () => k.lit.box(0, 0.2, 0, rng.range(0.6, 1.4), rng.range(0.3, 0.7), rng.range(0.6, 1.4), tint(c.concrete, rng.range(-0.25, 0)), { taper: 0.8 }));
  }
}

/** Static wreck that must be steered around. */
export function buildWreck(k: Deco, f: Feature): void {
  const c = k.c;
  const rng = new Rng(f.seed);
  const biome = k.def.biome;
  const kinds: Record<string, CarKind[]> = {
    desert: ["sedan", "pickup", "truck", "sedan"],
    suburbs: ["van", "sedan", "van", "pickup"],
    city: ["bus", "police", "sedan", "van"],
    frozen: ["pickup", "sedan", "truck"],
    military: ["truck", "pickup", "sedan"],
  };
  const kind = rng.pick(kinds[biome] ?? ["sedan"]);
  const z = f.z;
  const x = k.track.laneX(z, f.lane) + f.u;
  const y = k.track.heightAt(x, z);
  const L = kind === "bus" ? 10 : kind === "truck" ? 7.5 : kind === "van" ? 4.8 : 4.3;
  const W = kind === "bus" ? 2.5 : kind === "truck" ? 2.4 : 2;
  const H = kind === "bus" || kind === "truck" ? 3.6 : 1.9;
  // big vehicles lie roughly along the road, cars sit at an angle
  const yaw = kind === "bus" || kind === "truck" ? rng.range(-0.35, 0.35) : rng.sign() * rng.range(0.35, 1.3);
  const flipped = (kind === "sedan" || kind === "pickup") && rng.chance(0.3);
  const color = biome === "military" ? tint(c.pal.propA, -0.15) : rng.pick(c.carColors);
  if (flipped) {
    k.hero.at(Xf.trs(x, y + 1.62, z, yaw, 1, 0, Math.PI), () => car(k.hero, c, color, kind, rng));
  } else {
    k.hero.at(Xf.trs(x, y - 0.08, z, yaw, 1, 0, rng.range(-0.06, 0.06)), () => car(k.hero, c, color, kind, rng));
  }
  if (biome === "frozen") k.hero.at(Xf.trs(x, y + (flipped ? 1.65 : H - 0.05), z, yaw), () => k.hero.box(0, 0.1, 0, W * 0.8, 0.3, L * 0.5, c.pal.ground, { taper: 0.75 }));
  k.boxes.push({ x, y: y + H / 2, z, sx: W, sy: H, sz: L, yaw });
  // oil slick & glass under it
  k.decal.at(Xf.trs(x, y + 0.03, z + 0.5, yaw), () => k.decal.disc(0, 0, 0, L * 0.45, 8, tint(c.pal.road, -0.35)));
}

/** Spawns breakable pieces for barricades / crates / barrels. */
export function buildBreakables(k: Deco, f: Feature, debris: Debris): void {
  const rng = new Rng(f.seed);
  const t = k.track;
  const put = (kind: DebrisKind, u: number, dz: number, yaw: number, lift = 0) => {
    const z = f.z + dz;
    const x = t.laneX(z, f.lane) + f.u + u;
    debris.spawn(kind, x, t.heightAt(x, z) + debris.restHeight(kind) + 0.02 + lift, z, yaw, k.index);
  };
  const biome = k.def.biome;
  if (f.kind === "barricade") {
    const w = f.w;
    // two rows of sawhorses with planks across
    const n = Math.max(2, Math.round(w / 2));
    for (let i = 0; i < n; i++) put("sawhorse", -w / 2 + (i + 0.5) * (w / n), 0, rng.range(-0.08, 0.08));
    const planks = rng.int(2, 4);
    for (let i = 0; i < planks; i++) put("plank", rng.range(-w / 4, w / 4), 1.2 + rng.range(-0.4, 0.4), rng.range(-0.25, 0.25), i * 0.13);
    for (let i = 0; i < 4; i++) put("cone", rng.range(-w / 2 - 1, w / 2 + 1), rng.range(-3, -1.5), 0);
    if (biome === "military" || biome === "city") {
      for (let i = 0; i < 6; i++) put("sandbag", -w / 2 + rng.range(0, w), 1.8 + rng.range(-0.2, 0.2), rng.range(-0.3, 0.3), (i % 2) * 0.3);
    }
    if (biome === "suburbs") for (let i = 0; i < 2; i++) put("bin", rng.range(-w / 2, w / 2), rng.range(-1, 2), 0);
    if (rng.chance(0.5)) put("barrel", rng.sign() * (w / 2 + 0.8), 0.5, 0);
  } else if (f.kind === "crates") {
    // pyramid stack
    let row = 0;
    for (let count = 3; count > 0; count--, row++) {
      for (let i = 0; i < count; i++) put("crate", -((count - 1) * 0.95) / 2 + i * 0.95, rng.range(-0.05, 0.05), rng.range(-0.1, 0.1), row * 0.92);
    }
    put("crate", rng.range(-2, 2), rng.range(1.2, 2.2), rng.range(0, 1));
    if (rng.chance(0.4)) put("barrel", rng.range(-2.2, 2.2), rng.range(-1.8, -1), 0);
  } else if (f.kind === "barrels") {
    const n = rng.int(3, 6);
    for (let i = 0; i < n; i++) {
      const a = (i / n) * Math.PI * 2;
      put(i < 2 || rng.chance(0.4) ? "barrel" : "drum", Math.cos(a) * 1.1, Math.sin(a) * 1.1, rng.range(0, 3));
    }
    put("barrel", 0, 0, 0);
    for (let i = 0; i < 2; i++) put("cone", rng.range(-2.5, 2.5), rng.range(-3, -2), 0);
  }
}

/** Ice patch (frozen): low-friction slick drawn as a decal. */
export function buildIce(k: Deco, f: Feature): void {
  const rng = new Rng(f.seed);
  const ice = mix(k.c.pal.sky, rgb("#bfe9ff"), 0.6);
  const n = 10;
  const pts: number[] = [];
  for (let i = n - 1; i >= 0; i--) {
    const a = (i / n) * Math.PI * 2;
    const rx = (f.w / 2) * rng.range(0.75, 1);
    const rz = (f.len / 2) * rng.range(0.75, 1);
    const z = f.z + Math.sin(a) * rz;
    const x = k.track.laneX(z, f.lane) + f.u + Math.cos(a) * rx;
    pts.push(x, k.track.heightAt(x, z) + 0.035, z);
  }
  k.decal.poly(pts, ice, 0);
  // glints
  for (let i = 0; i < 4; i++) {
    const z = f.z + rng.range(-f.len / 3, f.len / 3);
    const x = k.track.laneX(z, f.lane) + f.u + rng.range(-f.w / 3, f.w / 3);
    k.decal.at(Xf.trs(x, k.track.heightAt(x, z) + 0.04, z, rng.range(0, 3)), () => k.decal.pad(0, 0, 0, 0.18, rng.range(1, 2.5), tint(ice, 0.5)));
  }
}
