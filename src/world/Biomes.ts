/**
 * Per-biome dressing: terrain colors, roadside boundary visuals and scattered
 * props for each streamed chunk. All placement is seeded per chunk so the
 * scenery is the same every run.
 */
import type { BiomeId, LevelDef } from "../data/levels";
import { ColGeo, Geo, mix, tint, Xf, type RGB, type Template } from "./Geo";
import {
  billboard, building, bush, cabin, cactus, car, chainFence, crate, deadPalm, hesco, house, jersey, mailbox, mesa,
  neon, pickets, pine, rock, roundTree, sandbags, snowman, streetLight, tank, tent, trafficLight, tumbleweed,
  utilityPole, watchtower, barrel, tire, hedgehog, warningSign, floodMast, type CarKind, type Colors,
} from "./Props";
import { Rng, clamp, hash2, noise2 } from "./rng";
import { SHOULDER, type Track } from "./Track";

/** Static box collider (world space). */
export interface BoxCol {
  x: number; y: number; z: number;
  sx: number; sy: number; sz: number;
  yaw: number;
}

/** Everything a chunk decorator can write into. */
export interface Deco {
  track: Track;
  def: LevelDef;
  c: Colors;
  tpl: Templates;
  rng: Rng;
  index: number;
  z0: number;
  z1: number;
  lit: Geo; // vertex-colored toon props
  glow: Geo; // emissive props (windows, neon, lamps)
  hero: Geo; // outlined road props (ramps, wrecks, gates)
  decal: Geo; // flat overlays on the road (z-offset material)
  far: Geo; // distant props: same material, no shadow casting
  /** Light pools to draw on the ground: x, z, radius, r, g, b per entry. */
  pools: number[];
  col: ColGeo; // extra collision triangles
  boxes: BoxCol[];
  /** 0 low, 1 medium, 2 high. */
  q: number;
}

/** Reusable prop variants built once per level. */
export interface Templates {
  small: Template[]; // rocks / bushes
  tall: Template[]; // cacti / trees / pines
  extra: Template[]; // palms, snowy rocks, ...
}

export function buildTemplates(biome: BiomeId, c: Colors, seed: number): Templates {
  const rng = new Rng(seed ^ 0x51ed);
  const make = (fn: (g: Geo, r: Rng) => void, n: number): Template[] => {
    const out: Template[] = [];
    for (let i = 0; i < n; i++) {
      const g = new Geo();
      g.jitter = 0.06;
      fn(g, rng);
      out.push(g.toTemplate());
    }
    return out;
  };
  const snow = c.pal.ground;
  switch (biome) {
    case "desert":
      return {
        small: make((g, r) => rock(g, mix(c.pal.propA, c.pal.ground, r.range(0.3, 0.7)), r, 1), 5),
        tall: make((g, r) => cactus(g, c, r), 4),
        extra: make((g, r) => (r.chance(0.5) ? deadPalm(g, c, r) : tumbleweed(g, c, r)), 3),
      };
    case "suburbs":
      return {
        small: make((g, r) => bush(g, r.chance(0.5) ? c.foliage : c.foliage2, r, r.range(0.8, 1.3)), 4),
        tall: make((g, r) => roundTree(g, c, r), 4),
        extra: make((g, r) => mailbox(g, c, r), 2),
      };
    case "city":
      return {
        small: make((g, r) => { crate(g, c, 0.8); if (r.chance(0.5)) crate(g, c, 0.6, 0.2, 0.72, 0.1); }, 2),
        tall: make((g, r) => roundTree(g, c, r), 2),
        extra: make((g, r) => { barrel(g, c.rust, c.dark); if (r.chance(0.6)) tire(g, c, 0.9, 0, 0.3); }, 2),
      };
    case "frozen":
      return {
        small: make((g, r) => { rock(g, mix(c.pal.propB, c.pal.propA, r.range(0.2, 0.6)), r, 1); g.blob(0, 0.72, 0, 0.75, 0.22, 0.7, snow, 6, 3); }, 5),
        tall: make((g, r) => pine(g, c, r, snow), 5),
        extra: make((g, r) => bush(g, tint(snow, -0.04), r, r.range(1, 1.8)), 3),
      };
    case "military":
      return {
        small: make((g, r) => rock(g, mix(c.pal.propB, c.pal.ground, r.range(0.3, 0.7)), r, 1), 4),
        tall: make((g, r) => roundTree(g, { ...c, foliage: tint(c.pal.propA, -0.15), foliage2: c.pal.propA }, r), 3),
        extra: make((g, r) => { crate(g, { ...c, wood: c.pal.propA, woodDark: tint(c.pal.propA, -0.3) }, 1); if (r.chance(0.6)) crate(g, { ...c, wood: c.pal.propA, woodDark: tint(c.pal.propA, -0.3) }, 0.9, 0.95, 0, 0.1); }, 2),
      };
  }
}

// -------------------------------------------------------------- terrain color

/** Face color for a terrain triangle at distance d beyond the road edge. */
export function groundColor(biome: BiomeId, c: Colors, d: number, slope: number, x: number, z: number, h: number, seed: number): RGB {
  const g = c.pal.ground;
  const n = noise2(x / 18, z / 18, seed + 31) * 0.5 + 0.5;
  const fine = hash2(Math.floor(x * 0.7), Math.floor(z * 0.7), seed) - 0.5;
  switch (biome) {
    case "desert": {
      if (d < 0.95) return mix(c.pal.road, g, 0.55);
      let col = mix(g, tint(g, -0.12), n);
      if (slope < 0.8) col = mix(col, mix(g, c.pal.propA, 0.5), clamp((0.8 - slope) * 3, 0, 1));
      // sand ripples / color bands with height
      col = tint(col, Math.sin(h * 1.3) * 0.04 + fine * 0.05);
      return col;
    }
    case "suburbs": {
      if (d < 0.95) return tint(c.concrete, 0.05);
      if (d < 2.6) return tint(c.concrete, 0.2 + fine * 0.05);
      let col = mix(g, tint(g, 0.1), n);
      if (slope < 0.85) col = mix(col, tint(mix(g, c.pal.propA, 0.3), -0.3), 0.6);
      return tint(col, fine * 0.06);
    }
    case "city": {
      if (d < SHOULDER + 1) {
        const tile = (Math.floor(z / 2.5) + Math.floor((x + 100) / 2.5)) % 2 === 0 ? 0.05 : 0;
        return tint(mix(g, c.concrete, 0.45), tile + fine * 0.03);
      }
      return tint(g, fine * 0.08 - 0.05);
    }
    case "frozen": {
      if (d < 0.95) return mix(c.pal.road, g, 0.6);
      let col = mix(g, mix(g, c.pal.propB, 0.35), n * 0.8);
      if (slope < 0.72) col = mix(col, tint(c.pal.propA, -0.1), clamp((0.72 - slope) * 3.5, 0, 0.85));
      return tint(col, fine * 0.04);
    }
    case "military": {
      if (d < 0.95) return mix(c.pal.road, g, 0.5);
      let col = mix(g, mix(g, c.pal.propA, 0.6), n);
      if (fine > 0.42) col = tint(col, -0.25); // scorch spots
      if (slope < 0.8) col = mix(col, tint(g, -0.2), 0.5);
      return tint(col, fine * 0.06);
    }
  }
}

// ----------------------------------------------------------------- helpers

/** Point at distance d beyond the road edge on `side` at z. */
function edgeX(t: Track, z: number, side: number, d: number): number {
  return side < 0 ? t.leftEdge(z) - d : t.rightEdge(z) + d;
}

/** Transform for a prop beyond the road edge, its +Z facing the road. */
function outside(k: Deco, z: number, side: number, d: number, yawJitter = 0, scale: number | [number, number, number] = 1, sink = 0): Xf {
  const x = edgeX(k.track, z, side, d);
  const y = k.track.heightAt(x, z) - sink;
  return Xf.trs(x, y, z, -side * (Math.PI / 2) + yawJitter, scale);
}

/** Lowest ground height under a footprint (so props never float). */
function minGround(t: Track, x: number, z: number, r: number): number {
  return Math.min(t.heightAt(x - r, z - r), t.heightAt(x + r, z - r), t.heightAt(x - r, z + r), t.heightAt(x + r, z + r), t.heightAt(x, z));
}

/** Run along the boundary on one side at distance d, calling fn per segment. */
function alongEdge(k: Deco, side: number, d: number, step: number, fn: (x0: number, y0: number, z0: number, x1: number, y1: number, z1: number, i: number) => void): void {
  const n = Math.max(1, Math.round((k.z1 - k.z0) / step));
  const t = k.track;
  let px = edgeX(t, k.z0, side, d), pz = k.z0, py = t.heightAt(px, pz);
  for (let i = 1; i <= n; i++) {
    const z = k.z0 + (i * (k.z1 - k.z0)) / n;
    const x = edgeX(t, z, side, d);
    const y = t.heightAt(x, z);
    fn(px, py, pz, x, y, z, i);
    px = x; py = y; pz = z;
  }
}

function stampOutside(k: Deco, tpl: Template, z: number, side: number, d: number, s: number): void {
  const x = edgeX(k.track, z, side, d);
  const y = minGround(k.track, x, z, 0.6 * s);
  (d > FAR_D ? k.far : k.lit).stamp(tpl, Xf.trs(x, y, z, k.rng.range(0, Math.PI * 2), s));
}

/** Scatter `n` template props per side in a distance band. */
function scatter(k: Deco, list: Template[], n: number, dMin: number, dMax: number, sMin: number, sMax: number): void {
  for (const side of [-1, 1]) {
    for (let i = 0; i < n; i++) {
      const z = k.rng.range(k.z0, k.z1);
      const d = k.rng.range(dMin, dMax);
      stampOutside(k, k.rng.pick(list), z, side, d, k.rng.range(sMin, sMax));
    }
  }
}

const SIDES = [-1, 1] as const;
/** Props further than this from the road edge go into the non-shadow layer. */
const FAR_D = 34;

// ------------------------------------------------------------------ biomes

export function decorateChunk(k: Deco): void {
  switch (k.def.biome) {
    case "desert": return desert(k);
    case "suburbs": return suburbs(k);
    case "city": return city(k);
    case "frozen": return frozen(k);
    case "military": return military(k);
  }
}

function guardRail(k: Deco, side: number): void {
  const c = k.c;
  const rail = mix(c.metal, c.white, 0.35);
  alongEdge(k, side, SHOULDER + 0.3, 2.5, (x0, y0, z0, x1, y1, z1, i) => {
    k.lit.box(x1, y1 + 0.4, z1, 0.16, 0.9, 0.16, c.metal);
    // occasional dented / missing piece for character
    const h = hash2(k.index, i * 3 + side, 7);
    if (h < 0.06) return;
    const dent = h < 0.14 ? 0.25 : 0;
    k.lit.beam(x0, y0 + 0.7 - dent, z0, x1, y1 + 0.7, z1, 0.12, 0.34, rail);
  });
}

function desert(k: Deco): void {
  const { c, rng, tpl } = k;
  for (const side of SIDES) guardRail(k, side);
  // cacti, rocks, palms
  scatter(k, tpl.tall, 2 + k.q, 12.5, 70, 0.8, 1.3);
  scatter(k, tpl.small, 3 + k.q * 2, 11.5, 90, 0.6, 2.4);
  scatter(k, tpl.extra, 1, 13, 50, 0.9, 1.2);
  // tumbleweeds/rocks on the shoulder (tiny, visual only)
  for (let i = 0; i < 2; i++) stampOutside(k, tpl.small[0], rng.range(k.z0, k.z1), rng.sign(), rng.range(2, 8), rng.range(0.25, 0.4));
  // big rocks at the wall
  for (const side of SIDES) {
    if (rng.chance(0.5)) stampOutside(k, rng.pick(tpl.small), rng.range(k.z0, k.z1), side, rng.range(12, 15), rng.range(2.5, 4));
  }
  // utility poles along the right side
  for (let z = Math.ceil(k.z0 / 45) * 45; z < k.z1; z += 45) k.lit.at(outside(k, z, 1, 14), () => utilityPole(k.lit, c, 9));
  // billboards
  if (rng.chance(0.4)) {
    const side = rng.sign();
    k.lit.at(outside(k, rng.range(k.z0 + 5, k.z1 - 5), side, rng.range(16, 22), rng.range(-0.4, 0.4)), () => billboard(k.lit, c, rng));
  }
  // roadside wrecks beyond the rail
  if (rng.chance(0.35)) {
    const side = rng.sign();
    k.lit.at(outside(k, rng.range(k.z0, k.z1), side, rng.range(13, 20), rng.range(-1, 1), 1, 0.15), () => car(k.lit, c, rng.pick(c.carColors), rng.pick<CarKind>(["sedan", "pickup", "van"]), rng));
  }
  // mesas on the horizon
  if (rng.chance(0.55)) {
    const side = rng.sign();
    k.far.at(outside(k, rng.range(k.z0, k.z1), side, rng.range(75, 130), rng.range(0, 6), 1, 2), () => mesa(k.far, c, rng, rng.range(22, 45)));
  }
}

function suburbs(k: Deco): void {
  const { c, tpl } = k;
  for (const side of SIDES) {
    // picket fence with hedges
    alongEdge(k, side, SHOULDER + 0.3, 5, (x0, y0, z0, x1, y1, z1, i) => {
      const len = Math.hypot(x1 - x0, z1 - z0);
      const yaw = Math.atan2(x1 - x0, z1 - z0);
      const h = hash2(k.index, i + side * 17, 3);
      k.lit.at(Xf.trs((x0 + x1) / 2, Math.min(y0, y1), (z0 + z1) / 2, yaw), () => {
        if (h < 0.25) k.lit.box(0, 0.6, 0, 1.1, 1.2, len, c.foliage, { taper: 0.85, top: c.foliage2 });
        else pickets(k.lit, c, len);
      });
    });
    // houses facing the road
    for (let z = Math.floor(k.z0 / 26) * 26 + 13; z < k.z1; z += 26) {
      if (z < k.z0) continue;
      const hr = new Rng(Math.floor(z) * 31 + side * 7 + k.track.seed);
      const d = hr.range(21, 27);
      k.lit.at(outside(k, z, side, d, 0, 1, 0.2), () => house(k.lit, c, hr));
      // driveway + parked minivan
      if (hr.chance(0.5)) {
        k.lit.at(outside(k, z + 6, side, 15.5, hr.range(-0.2, 0.2), 1, 0.05), () => car(k.lit, c, hr.pick(c.carColors), hr.pick<CarKind>(["van", "sedan", "pickup"]), hr, hr.chance(0.5)));
      }
      k.lit.stamp(tpl.extra[hr.int(0, tpl.extra.length - 1)], outside(k, z + 3, side, 11.6));
      // yard trees & bushes
      stampOutside(k, hr.pick(tpl.tall), z - 9, side, hr.range(14, 19), hr.range(0.9, 1.2));
      stampOutside(k, hr.pick(tpl.small), z + 9, side, hr.range(13, 17), hr.range(0.8, 1.3));
    }
    // street lamps inside the fence
    for (let z = Math.ceil(k.z0 / 40) * 40 + (side > 0 ? 20 : 0); z < k.z1; z += 40) {
      k.lit.at(outside(k, z, side, SHOULDER - 0.6), () => streetLight(k.lit, k.glow, c, 1, 6.5, 1.6));
    }
  }
  scatter(k, tpl.tall, 2 + k.q, 32, 80, 1, 1.5);
}

function city(k: Deco): void {
  const { c, rng } = k;
  const night = k.def.night;
  for (const side of SIDES) {
    // jersey barriers along the curb line
    alongEdge(k, side, SHOULDER + 0.4, 3.2, (x0, y0, z0, x1, y1, z1, i) => {
      if (hash2(k.index, i + side * 5, 11) < 0.08) return;
      const yaw = Math.atan2(x1 - x0, z1 - z0);
      k.lit.at(Xf.trs((x0 + x1) / 2, Math.min(y0, y1), (z0 + z1) / 2, yaw), () => jersey(k.lit, c, 3, i % 3 === 0));
    });
    // continuous row of towers
    let z = Math.floor(k.z0 / 20) * 20;
    while (z < k.z1) {
      const br = new Rng(Math.floor(z) * 131 + side * 977 + k.track.seed);
      const w = br.range(13, 22);
      const zc = z + w / 2;
      if (zc >= k.z0 && zc < k.z1) {
        const d0 = br.range(15, 18);
        const depth = br.range(14, 22);
        const h = br.range(16, 30 + 25 * (k.q / 2)) * (br.chance(0.15) ? 1.6 : 1);
        k.lit.push(outside(k, zc, side, d0 + depth / 2, 0, 1, 0.3));
        k.glow.push(k.lit.xf.mul(new Xf()));
        building(k.lit, k.glow, c, br, w - 1.2, depth, h, night);
        k.lit.pop();
        k.glow.pop();
        // neon blade sign on the facade
        if (br.chance(0.55)) {
          k.lit.push(outside(k, zc + br.range(-w / 3, w / 3), side, d0 - 0.6, Math.PI / 2));
          k.glow.push(k.lit.xf.mul(new Xf()));
          neon(k.lit, k.glow, c, br, br.range(6, 10));
          k.lit.pop();
          k.glow.pop();
        }
      }
      z += w;
    }
    // streetlights on the sidewalk
    for (let zz = Math.ceil(k.z0 / 30) * 30 + (side > 0 ? 15 : 0); zz < k.z1; zz += 30) {
      k.lit.push(outside(k, zz, side, SHOULDER - 0.8));
      k.glow.push(k.lit.xf.mul(new Xf()));
      streetLight(k.lit, k.glow, c, 1, 8, 2.6);
      k.lit.pop();
      k.glow.pop();
      if (night) k.pools.push(edgeX(k.track, zz, side, SHOULDER - 4.6), zz, 8, ...c.glowWarm);
    }
    // sidewalk clutter
    for (let i = 0; i < 2; i++) stampOutside(k, rng.pick(k.tpl.extra), rng.range(k.z0, k.z1), side, rng.range(11.5, 14), 1);
    if (rng.chance(0.3)) stampOutside(k, rng.pick(k.tpl.small), rng.range(k.z0, k.z1), side, rng.range(11.5, 14), 1);
  }
  // traffic light every few chunks, a parked or burning car
  if (k.index % 3 === 0) {
    const side = k.index % 2 ? 1 : -1;
    k.lit.push(outside(k, k.z0 + 10, side, 9.6));
    k.glow.push(k.lit.xf.mul(new Xf()));
    trafficLight(k.lit, k.glow, c, 1);
    k.lit.pop();
    k.glow.pop();
  }
  if (rng.chance(0.5)) {
    const side = rng.sign();
    const zz = rng.range(k.z0, k.z1);
    k.lit.at(outside(k, zz, side, rng.range(3, 7), rng.range(-0.6, 0.6) + Math.PI / 2, 1, 0.1), () => car(k.lit, c, rng.pick(c.carColors), rng.pick<CarKind>(["sedan", "police", "van"]), rng));
    // fire on it (glow cones)
    if (night && rng.chance(0.6)) {
      k.glow.at(outside(k, zz, side, rng.range(3, 7), 0, 1, -1.1), () => {
        k.glow.cyl(0, 0, 0, 0.7, 0, 1.6, 5, [1, 0.45, 0.1]);
        k.glow.cyl(0.4, 0, 0.3, 0.45, 0, 1.1, 5, [1, 0.8, 0.2]);
      });
    }
  }
}

function frozen(k: Deco): void {
  const { c, rng, tpl } = k;
  const snow = c.pal.ground;
  for (const side of SIDES) {
    // log fence + snowbank along the boundary
    alongEdge(k, side, SHOULDER + 0.4, 4, (x0, y0, z0, x1, y1, z1, i) => {
      k.lit.box(x1, y1 + 0.55, z1, 0.22, 1.3, 0.22, c.woodDark);
      if (hash2(k.index, i + side * 13, 5) > 0.1) {
        k.lit.beam(x0, y0 + 0.95, z0, x1, y1 + 0.95, z1, 0.16, 0.16, c.wood);
        k.lit.beam(x0, y0 + 0.5, z0, x1, y1 + 0.5, z1, 0.16, 0.16, c.wood);
      }
      k.lit.blob((x0 + x1) / 2 + side * 0.8, Math.min(y0, y1) + 0.1, (z0 + z1) / 2, 1.4, 0.7, 2.6, tint(snow, -0.03), 6, 3, 0.15, i);
    });
    // rock walls behind
    for (let i = 0; i < 2 + k.q; i++) stampOutside(k, rng.pick(tpl.small), rng.range(k.z0, k.z1), side, rng.range(12, 16), rng.range(1.8, 3.5));
  }
  // dense pines
  scatter(k, tpl.tall, 5 + k.q * 3, 13, 95, 0.8, 1.5);
  scatter(k, tpl.small, 2 + k.q, 16, 70, 1, 2.5);
  scatter(k, tpl.extra, 2, 11.5, 30, 0.8, 1.4);
  // snow piles on the shoulders (plowed snow), visual only, low
  for (let i = 0; i < 3; i++) {
    const side = rng.sign();
    const z = rng.range(k.z0, k.z1);
    const x = edgeX(k.track, z, side, rng.range(2.5, 7));
    k.lit.blob(x, k.track.heightAt(x, z) - 0.05, z, rng.range(0.6, 1.2), 0.3, rng.range(1, 2), tint(snow, -0.02), 6, 3, 0.2, i, true);
  }
  if (rng.chance(0.25)) {
    const side = rng.sign();
    k.lit.at(outside(k, rng.range(k.z0, k.z1), side, rng.range(20, 32), rng.range(-0.3, 0.3), 1, 0.3), () => cabin(k.lit, c, rng, snow));
  }
  if (rng.chance(0.08)) k.lit.at(outside(k, rng.range(k.z0, k.z1), rng.sign(), rng.range(3, 8)), () => snowman(k.lit, c, snow));
  if (rng.chance(0.25)) {
    const side = rng.sign();
    k.lit.at(outside(k, rng.range(k.z0, k.z1), side, rng.range(12, 16), rng.range(-1, 1), 1, 0.3), () => {
      car(k.lit, c, rng.pick(c.carColors), rng.pick<CarKind>(["pickup", "sedan", "van"]), rng);
      k.lit.box(0, 2.0, 0, 2.2, 0.35, 3.6, snow, { taper: 0.8 });
    });
  }
}

function military(k: Deco): void {
  const { c, rng, tpl } = k;
  for (const side of SIDES) {
    // alternating T-walls / chain-link / HESCO by 10m sections
    alongEdge(k, side, SHOULDER + 0.6, 10, (x0, y0, z0, x1, y1, z1, i) => {
      const len = Math.hypot(x1 - x0, z1 - z0);
      const yaw = Math.atan2(x1 - x0, z1 - z0);
      const sec = Math.floor(hash2(Math.floor(z0 / 30), side, k.track.seed) * 3);
      k.lit.at(Xf.trs((x0 + x1) / 2, Math.min(y0, y1) - 0.05, (z0 + z1) / 2, yaw), () => {
        if (sec === 0) {
          const n = Math.round(len / 1.5);
          for (let j = 0; j < n; j++) k.lit.at(Xf.trs(0, 0, -len / 2 + (j + 0.5) * (len / n), side > 0 ? 0 : Math.PI), () => tWall(k, j));
        } else if (sec === 1) chainFence(k.lit, c, len, true);
        else hesco(k.lit, c, len);
      });
      void i;
    });
    // sandbag nests on the shoulder near the wall
    if (rng.chance(0.4)) {
      k.lit.at(outside(k, rng.range(k.z0, k.z1), side, rng.range(7.5, 9.2), rng.range(-0.3, 0.3)), () => sandbags(k.lit, c, rng.range(3, 6), rng.int(2, 3), rng));
    }
  }
  scatter(k, tpl.small, 2 + k.q, 13, 80, 0.8, 2.2);
  scatter(k, tpl.tall, 1 + k.q, 25, 90, 1, 1.4);
  // anti-tank hedgehogs in clusters beyond the walls
  for (const side of SIDES) {
    if (!rng.chance(0.6)) continue;
    const z = rng.range(k.z0, k.z1 - 10);
    const d = rng.range(13, 22);
    for (let i = 0; i < rng.int(3, 6); i++) k.lit.at(outside(k, z + i * 2.6, side, d + rng.range(-1.5, 1.5), rng.range(0, 3)), () => hedgehog(k.lit, c));
  }
  // restricted-area signs on the inside of the wall
  if (rng.chance(0.5)) k.lit.at(outside(k, rng.range(k.z0, k.z1), rng.sign(), SHOULDER - 0.6, 0), () => warningSign(k.lit, c));
  // floodlight masts
  if (k.index % 2 === 0) {
    const side = k.index % 4 === 0 ? 1 : -1;
    k.lit.push(outside(k, k.z0 + 12, side, 13));
    k.glow.push(k.lit.xf.mul(new Xf()));
    floodMast(k.lit, k.glow, c);
    k.lit.pop();
    k.glow.pop();
  }
  if (rng.chance(0.4)) stampOutside(k, rng.pick(tpl.extra), rng.range(k.z0, k.z1), rng.sign(), rng.range(12, 18), 1);
  // watchtower every ~3 chunks
  if (k.index % 3 === 1) k.lit.at(outside(k, k.z0 + 25, k.index % 2 ? 1 : -1, 14), () => watchtower(k.lit, c));
  if (rng.chance(0.4)) k.lit.at(outside(k, rng.range(k.z0, k.z1), rng.sign(), rng.range(18, 30), rng.range(-0.8, 0.8), 1, 0.2), () => tank(k.lit, c, rng));
  if (rng.chance(0.4)) {
    const side = rng.sign();
    const z = rng.range(k.z0, k.z1 - 12);
    for (let i = 0; i < 3; i++) k.lit.at(outside(k, z + i * 7, side, rng.range(22, 30), rng.range(-0.2, 0.2), 1, 0.2), () => tent(k.lit, c, rng));
  }
  if (rng.chance(0.3)) {
    const side = rng.sign();
    k.lit.at(outside(k, rng.range(k.z0, k.z1), side, rng.range(13, 20), rng.range(-1, 1), 1, 0.2), () => car(k.lit, { ...c }, tint(c.pal.propA, -0.2), rng.pick<CarKind>(["truck", "pickup"]), rng));
  }
}

function tWall(k: Deco, j: number): void {
  const c = k.c;
  const col = tint(c.concrete, ((j * 37) % 7) * 0.01 - 0.03);
  k.lit.box(0, 0.4, 0, 1.6, 0.8, 1.45, col);
  k.lit.box(0, 2.3, 0, 0.35, 3.8, 1.45, col, { top: tint(col, 0.1) });
  if (j % 4 === 1) k.lit.box(0.19, 2.6, 0, 0.02, 0.5, 1.2, c.hazard);
}
