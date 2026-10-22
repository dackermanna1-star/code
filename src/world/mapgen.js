// Procedural battlefield generation. Each scenario shapes the terrain, lays
// roads, places towns/bases/farms/forests and defines objectives and
// deployment zones for both factions. Faction 0 (Coalition) deploys in the
// south (+Z), faction 1 (Federation) in the north (-Z).

import { Terrain, MAT } from './terrain.js';
import { Noise2D } from './noise.js';
import { RNG } from '../core/rng.js';
import { StaticGrid } from '../core/grid.js';
import { smoothstep, clamp, lerp } from '../core/math.js';
import { Structure, StructureSet } from './structures.js';

export const SCENARIOS = {
  town: {
    id: 'town',
    name: 'Town Assault',
    blurb: 'Coalition armor and infantry push north into a fortified market town held by the Federation.',
    attacker: 0,
  },
  base: {
    id: 'base',
    name: 'Airbase Strike',
    blurb: 'An all-out assault on a Federation forward airbase: hangars, command post and fuel depot.',
    attacker: 0,
  },
  ridge: {
    id: 'ridge',
    name: 'Hill 305',
    blurb: 'Both armies race for a forested ridge and the village beneath it. Whoever holds the high ground holds the valley.',
    attacker: -1,
  },
  valley: {
    id: 'valley',
    name: 'Crossroads',
    blurb: 'A massive meeting engagement across open farmland. Armor, air power and artillery decide the day.',
    attacker: -1,
  },
};

const FACADES = [0xcfc4ae, 0xd9cfb8, 0xb9a88c, 0xc8b79a, 0xe0d7c3, 0xa99a82, 0xbfae96, 0xd4c2a4, 0xc4b6a0, 0x9e9384];
const ROOFS = [0x7d3a2b, 0x8a4430, 0x6b3326, 0x5d5a55, 0x494846, 0x7a5040, 0x8f5b3e];
const BRICK = [0x9c5a42, 0x8c4f3a, 0xa86450];
const CAR_VARIANTS = 6;

export class TreeSet {
  constructor(terrain) {
    this.list = [];
    this.grid = new StaticGrid(-terrain.half, -terrain.half, terrain.size, 16);
  }

  add(t) {
    t.id = this.list.length;
    t.alive = true;
    t.fall = 0; // 0 standing -> 1 fully fallen
    t.fallYaw = 0;
    t.version = 0;
    t.pos = { x: t.x, z: t.z };
    this.list.push(t);
    this.grid.insertPoint(t, t.x, t.z);
    return t;
  }
}

export function generateMap(scenarioId, seed = 1) {
  const scenario = SCENARIOS[scenarioId] || SCENARIOS.town;
  const ctx = new MapContext(scenario, seed);
  const builders = { town: buildTownScenario, base: buildBaseScenario, ridge: buildRidgeScenario, valley: buildValleyScenario };
  builders[scenario.id](ctx);
  ctx.finish();
  return ctx.result();
}

class MapContext {
  constructor(scenario, seed) {
    this.scenario = scenario;
    this.seed = seed;
    this.rng = new RNG(seed * 7919 + 13);
    this.noise = new Noise2D(seed);
    this.noise2 = new Noise2D(seed + 101);
    this.terrain = new Terrain(2048, 2, 128);
    this.structures = new StructureSet(this.terrain);
    this.trees = new TreeSet(this.terrain);
    this.decorations = [];
    this.roads = [];
    this.objectives = [];
    this.deploy = [null, null];
    this.helipads = [];
    this.fields = [];
    this.pads = []; // building pads to flatten: {x,z,hx,hz,yaw}
    this.noTree = []; // circles {x,z,r} kept clear of forest
    this.roadMask = new Uint8Array(this.terrain.n * this.terrain.n);
    this.urban = new Uint8Array(this.terrain.n * this.terrain.n); // areas with no forest
    this.defensePositions = [[], []];
  }

  // ---------------------------------------------------------------- terrain
  baseTerrain({ macro = 22, meso = 7, micro = 0.7, edge = 1, base = 40 } = {}) {
    const t = this.terrain;
    const { noise, noise2 } = this;
    for (let iz = 0; iz < t.n; iz++) {
      const z = t.worldZ(iz);
      for (let ix = 0; ix < t.n; ix++) {
        const x = t.worldX(ix);
        let h = noise.fbm(x / 950 + 3.1, z / 950 - 1.7, 4) * macro;
        h += noise2.fbm(x / 300 + 17, z / 300 - 9, 4) * meso;
        h += noise.fbm(x / 55 - 40, z / 55 + 22, 3) * micro;
        const e = Math.max(Math.abs(x), Math.abs(z));
        const em = smoothstep(780, 1024, e) * edge;
        if (em > 0) h += em * (35 + noise2.ridged(x / 320, z / 320, 4) * 70);
        t.h[iz * t.n + ix] = base + h;
      }
    }
  }

  stamp(x0, z0, x1, z1, fn) {
    const t = this.terrain;
    const ix0 = clamp(Math.floor(t.gx(x0)), 0, t.n - 1);
    const ix1 = clamp(Math.ceil(t.gx(x1)), 0, t.n - 1);
    const iz0 = clamp(Math.floor(t.gz(z0)), 0, t.n - 1);
    const iz1 = clamp(Math.ceil(t.gz(z1)), 0, t.n - 1);
    for (let iz = iz0; iz <= iz1; iz++) {
      const z = t.worldZ(iz);
      for (let ix = ix0; ix <= ix1; ix++) {
        const i = iz * t.n + ix;
        t.h[i] = fn(t.worldX(ix), z, t.h[i], i);
      }
    }
  }

  averageHeight(x, z, r) {
    let sum = 0;
    let cnt = 0;
    for (let a = 0; a < 16; a++) {
      for (const k of [0.3, 0.7, 1]) {
        sum += this.terrain.heightAt(x + Math.cos(a * 0.3927) * r * k, z + Math.sin(a * 0.3927) * r * k);
        cnt++;
      }
    }
    return sum / cnt;
  }

  flattenCircle(cx, cz, r, falloff, target = null, strength = 1) {
    const th = target ?? this.averageHeight(cx, cz, r);
    const R = r + falloff;
    this.stamp(cx - R, cz - R, cx + R, cz + R, (x, z, h) => {
      const d = Math.hypot(x - cx, z - cz);
      if (d >= R) return h;
      const w = (d <= r ? 1 : 1 - smoothstep(r, R, d)) * strength;
      return lerp(h, th, w);
    });
    return th;
  }

  flattenRect(cx, cz, hx, hz, yaw, falloff, target = null) {
    const th = target ?? this.averageHeight(cx, cz, Math.min(hx, hz));
    const c = Math.cos(yaw);
    const s = Math.sin(yaw);
    const R = Math.hypot(hx, hz) + falloff;
    this.stamp(cx - R, cz - R, cx + R, cz + R, (x, z, h) => {
      const rx = x - cx;
      const rz = z - cz;
      const lx = Math.abs(rx * c - rz * s) - hx;
      const lz = Math.abs(rx * s + rz * c) - hz;
      const d = Math.max(lx, lz, 0) === 0 ? 0 : Math.hypot(Math.max(lx, 0), Math.max(lz, 0));
      if (d >= falloff) return h;
      const w = d <= 0 ? 1 : 1 - smoothstep(0, falloff, d);
      return lerp(h, th, w);
    });
    return th;
  }

  addHill(cx, cz, rx, rz, height, yaw = 0, sharp = 1) {
    const c = Math.cos(yaw);
    const s = Math.sin(yaw);
    const R = Math.max(rx, rz) * 2.6;
    this.stamp(cx - R, cz - R, cx + R, cz + R, (x, z, h) => {
      const dx = x - cx;
      const dz = z - cz;
      const lx = (dx * c - dz * s) / rx;
      const lz = (dx * s + dz * c) / rz;
      const d2 = lx * lx + lz * lz;
      const n = this.noise2.fbm(x / 140, z / 140, 3) * 0.18;
      return h + height * Math.exp(-Math.pow(d2, sharp) * 1.1) * (1 + n);
    });
  }

  paintRect(cx, cz, hx, hz, yaw, mat, onlyIf = null) {
    const t = this.terrain;
    const c = Math.cos(yaw);
    const s = Math.sin(yaw);
    const R = Math.hypot(hx, hz);
    this.stamp(cx - R, cz - R, cx + R, cz + R, (x, z, h, i) => {
      const rx = x - cx;
      const rz = z - cz;
      if (Math.abs(rx * c - rz * s) <= hx && Math.abs(rx * s + rz * c) <= hz) {
        if (onlyIf === null || onlyIf(t.mat[i])) t.mat[i] = mat;
        this.urban[i] = 1;
      }
      return h;
    });
  }

  paintCircle(cx, cz, r, mat, noiseAmt = 0) {
    const t = this.terrain;
    this.stamp(cx - r * 1.3, cz - r * 1.3, cx + r * 1.3, cz + r * 1.3, (x, z, h, i) => {
      const d = Math.hypot(x - cx, z - cz) / r + this.noise.noise(x / 18, z / 18) * noiseAmt;
      if (d <= 1) {
        const m = t.mat[i];
        if (mat === MAT.CONCRETE || (m !== MAT.ROAD && m !== MAT.CONCRETE)) t.mat[i] = mat;
        this.urban[i] = 1;
      }
      return h;
    });
  }

  // Lay a road along a polyline: smooth its grade, flatten the corridor and
  // paint asphalt (or dirt) with shoulders.
  road(points, width = 9, { surface = MAT.ROAD, shoulder = 7, main = false } = {}) {
    const t = this.terrain;
    // Resample the polyline every 4 m.
    const pts = [];
    for (let i = 0; i < points.length - 1; i++) {
      const [ax, az] = points[i];
      const [bx, bz] = points[i + 1];
      const len = Math.hypot(bx - ax, bz - az);
      const steps = Math.max(1, Math.ceil(len / 4));
      for (let k = 0; k < steps; k++) pts.push([ax + ((bx - ax) * k) / steps, az + ((bz - az) * k) / steps]);
    }
    pts.push(points[points.length - 1]);
    // Smoothed height profile.
    const raw = pts.map(([x, z]) => t.heightAt(x, z));
    const prof = raw.map((_, i) => {
      let sum = 0;
      let cnt = 0;
      for (let k = -10; k <= 10; k++) {
        const j = clamp(i + k, 0, raw.length - 1);
        sum += raw[j];
        cnt++;
      }
      return sum / cnt;
    });
    const half = width / 2;
    const R = half + shoulder;
    // Distance field per sample: nearest resampled segment.
    const best = new Map();
    for (let i = 0; i < pts.length - 1; i++) {
      const [ax, az] = pts[i];
      const [bx, bz] = pts[i + 1];
      const x0 = Math.min(ax, bx) - R;
      const x1 = Math.max(ax, bx) + R;
      const z0 = Math.min(az, bz) - R;
      const z1 = Math.max(az, bz) + R;
      const ix0 = clamp(Math.floor(t.gx(x0)), 0, t.n - 1);
      const ix1 = clamp(Math.ceil(t.gx(x1)), 0, t.n - 1);
      const iz0 = clamp(Math.floor(t.gz(z0)), 0, t.n - 1);
      const iz1 = clamp(Math.ceil(t.gz(z1)), 0, t.n - 1);
      const dx = bx - ax;
      const dz = bz - az;
      const l2 = dx * dx + dz * dz || 1;
      for (let iz = iz0; iz <= iz1; iz++) {
        for (let ix = ix0; ix <= ix1; ix++) {
          const x = t.worldX(ix);
          const z = t.worldZ(iz);
          const u = clamp(((x - ax) * dx + (z - az) * dz) / l2, 0, 1);
          const d = Math.hypot(ax + dx * u - x, az + dz * u - z);
          if (d > R) continue;
          const idx = iz * t.n + ix;
          const prev = best.get(idx);
          if (prev === undefined || d < prev[0]) best.set(idx, [d, lerp(prof[i], prof[i + 1], u)]);
        }
      }
    }
    for (const [idx, [d, rh]] of best) {
      const w = d <= half + 1 ? 1 : 1 - smoothstep(half + 1, R, d);
      t.h[idx] = lerp(t.h[idx], rh - (d <= half ? 0.08 : 0), w);
      if (d <= half) {
        if (t.mat[idx] !== MAT.CONCRETE) t.mat[idx] = surface;
        this.roadMask[idx] = main ? 2 : 1;
        this.urban[idx] = 1;
      } else if (d <= half + 1.6 && t.mat[idx] !== MAT.ROAD && t.mat[idx] !== MAT.CONCRETE) {
        t.mat[idx] = MAT.DIRT;
        this.roadMask[idx] = Math.max(this.roadMask[idx], 3);
      }
    }
    this.roads.push({ points: points.map((p) => [p[0], p[1]]), width, surface, main });
  }

  onRoad(x, z, pad = 0) {
    const t = this.terrain;
    const r = Math.ceil(pad / t.res);
    const cx = Math.round(t.gx(x));
    const cz = Math.round(t.gz(z));
    for (let dz = -r; dz <= r; dz++) {
      for (let dx = -r; dx <= r; dx++) {
        const ix = clamp(cx + dx, 0, t.n - 1);
        const iz = clamp(cz + dz, 0, t.n - 1);
        const m = this.roadMask[iz * t.n + ix];
        if (m === 1 || m === 2) return true;
      }
    }
    return false;
  }

  // ------------------------------------------------------------- structures
  footprintFree(x, z, hx, hz, yaw, pad = 1.5) {
    const t = this.terrain;
    if (!t.inBounds(x, z, 60)) return false;
    const c = Math.cos(yaw);
    const s = Math.sin(yaw);
    // Sample the footprint for roads.
    for (let u = -1; u <= 1; u += 0.5) {
      for (let v = -1; v <= 1; v += 0.5) {
        const lx = u * (hx + pad);
        const lz = v * (hz + pad);
        if (this.onRoad(x + lx * c + lz * s, z - lx * s + lz * c)) return false;
      }
    }
    const near = this.structures.queryRadius(x, z, Math.hypot(hx, hz) + 30, []);
    for (const o of near) {
      if (obbOverlap(x, z, hx + pad, hz + pad, yaw, o.x, o.z, o.hx, o.hz, o.yaw)) return false;
    }
    return true;
  }

  building(type, x, z, w, d, yaw, o = {}) {
    const floors = o.floors ?? 1;
    const h = o.h ?? floors * 3.1 + 0.4;
    const s = new Structure({
      kind: 'building',
      type,
      x,
      z,
      yaw,
      hx: w / 2,
      hz: d / 2,
      h,
      floors,
      roof: o.roof ?? 'flat',
      roofH: o.roofH ?? 0,
      color: o.color ?? this.rng.pick(FACADES),
      roofColor: o.roofColor ?? this.rng.pick(ROOFS),
      variant: this.rng.int(0, 1000),
    });
    this.structures.add(s);
    this.pads.push({ x, z, hx: w / 2, hz: d / 2, yaw });
    return s;
  }

  tryBuilding(type, x, z, w, d, yaw, o = {}) {
    if (!this.footprintFree(x, z, w / 2, d / 2, yaw, o.pad ?? 1.2)) return null;
    return this.building(type, x, z, w, d, yaw, o);
  }

  wall(type, ax, az, bx, bz, h, thick, o = {}) {
    const len = Math.hypot(bx - ax, bz - az);
    if (len < 0.5) return null;
    const yaw = Math.atan2(bx - ax, bz - az);
    const s = new Structure({
      kind: 'wall',
      type,
      x: (ax + bx) / 2,
      z: (az + bz) / 2,
      yaw,
      hx: thick / 2,
      hz: len / 2,
      h,
      color: o.color ?? (type === 'hedge' ? 0x3d4f25 : type === 'concrete_wall' ? 0xa7a49b : type === 'fence' ? 0x6e5a42 : 0x8f8676),
      crushable: type === 'hedge' || type === 'fence',
      blocksMove: true,
    });
    this.structures.add(s);
    return s;
  }

  // Segmented wall along a line with optional gaps (gap probability per segment).
  wallLine(type, ax, az, bx, bz, h, thick, segLen = 10, gapChance = 0.12) {
    const len = Math.hypot(bx - ax, bz - az);
    const n = Math.max(1, Math.round(len / segLen));
    for (let i = 0; i < n; i++) {
      if (this.rng.chance(gapChance)) continue;
      const t0 = i / n;
      const t1 = (i + 1) / n;
      this.wall(type, lerp(ax, bx, t0), lerp(az, bz, t0), lerp(ax, bx, t1), lerp(az, bz, t1), h * this.rng.range(0.9, 1.1), thick);
    }
  }

  prop(propKind, x, z, yaw, o = {}) {
    const dims = PROP_DIMS[propKind];
    if (!dims) return null;
    if (o.check !== false && !this.footprintFree(x, z, dims[0], dims[1], yaw, 0.4)) return null;
    const s = new Structure({
      kind: 'prop',
      type: o.type ?? propKind,
      propKind,
      x,
      z,
      yaw,
      hx: dims[0],
      hz: dims[1],
      h: dims[2],
      variant: o.variant ?? this.rng.int(0, CAR_VARIANTS - 1),
      blocksMove: dims[3] !== false,
      crushable: propKind === 'crates' || propKind === 'fuel_drums' || propKind === 'car' || propKind === 'car_wreck',
    });
    this.structures.add(s);
    return s;
  }

  decoration(kind, x, z, yaw) {
    this.decorations.push({ kind, x, z, y: 0, yaw });
  }

  objective(letter, name, x, z, radius, owner = -1) {
    this.objectives.push({ id: this.objectives.length, letter, name, x, z, radius, owner });
    this.noTree.push({ x, z, r: radius + 15 });
  }

  // ------------------------------------------------------------ vegetation
  forest({ threshold = 0.18, scale = 360, spacing = 7.5, pineBias = 0, density = 1, maxTrees = 9000 } = {}) {
    const t = this.terrain;
    const rng = this.rng;
    const lim = 960;
    const candidates = [];
    for (let z = -lim; z < lim; z += spacing) {
      for (let x = -lim; x < lim; x += spacing) {
        const px = x + rng.range(-0.45, 0.45) * spacing;
        const pz = z + rng.range(-0.45, 0.45) * spacing;
        const m = this.noise2.fbm(px / scale + 50, pz / scale - 31, 4) + 0.08 * this.noise.noise(px / 40, pz / 40);
        let p = 0;
        if (m > threshold) p = density;
        else if (m > threshold - 0.07) p = 0.12 * density;
        else if (m > threshold - 0.2) p = 0.012;
        if (p <= 0 || !rng.chance(p)) continue;
        candidates.push([px, pz, m]);
      }
    }
    // Uniform subsample when over budget so forests cover the whole map.
    rng.shuffle(candidates);
    let placed = 0;
    for (const [px, pz, m] of candidates) {
      if (placed >= maxTrees) break;
      if (!this.treeAllowed(px, pz)) continue;
      if (t.slopeAt(px, pz) > 1.1) continue;
      const pineN = this.noise.noise(px / 500 - 7, pz / 500 + 3) + pineBias + (t.heightAt(px, pz) - 60) / 120;
      let kind = pineN > 0 ? 0 : 1;
      if (m < threshold) kind = rng.chance(0.5) ? 3 : kind;
      if (rng.next() < 0.03) kind = 2;
      this.trees.add({ x: px, z: pz, y: 0, kind, scale: rng.range(0.75, 1.25), yaw: rng.range(0, Math.PI * 2), variant: rng.int(0, 3) });
      placed++;
    }
    this.treeCandidates = candidates.length;
  }

  treeAllowed(x, z, fields = this.fields) {
    const t = this.terrain;
    if (!t.inBounds(x, z, 40)) return false;
    const ix = clamp(Math.round(t.gx(x)), 0, t.n - 1);
    const iz = clamp(Math.round(t.gz(z)), 0, t.n - 1);
    if (this.urban[iz * t.n + ix]) return false;
    if (this.onRoad(x, z, 6)) return false;
    if (t.heightAt(x, z) < t.waterLevel + 0.5) return false;
    for (const c of this.noTree) if (Math.hypot(x - c.x, z - c.z) < c.r) return false;
    for (const f of fields) {
      if (pointInRect(x, z, f.x, f.z, f.hx - 2, f.hz - 2, f.yaw)) return false;
    }
    for (const d of this.deploy) {
      if (d && Math.abs(x - d.x) < d.hw + 30 && Math.abs(z - d.z) < d.hd + 30) return false;
    }
    if (this.structures.structureAt(x, z, 3)) return false;
    return true;
  }

  tree(x, z, kind = 1, scale = 1) {
    if (!this.treeAllowed(x, z)) return null;
    return this.trees.add({ x, z, y: 0, kind, scale, yaw: this.rng.range(0, Math.PI * 2), variant: this.rng.int(0, 3) });
  }

  rocks(count, { minSlope = 0.25, area = 900 } = {}) {
    const t = this.terrain;
    let placed = 0;
    for (let k = 0; k < count * 8 && placed < count; k++) {
      const x = this.rng.range(-area, area);
      const z = this.rng.range(-area, area);
      if (t.slopeAt(x, z) < minSlope && !this.rng.chance(0.15)) continue;
      if (!this.treeAllowed(x, z)) continue;
      const s = this.prop('rock', x, z, this.rng.range(0, 6.28), { variant: this.rng.int(0, 7) });
      if (s) placed++;
    }
  }

  // Farm fields with hedgerow / stone wall borders.
  farmland(cx, cz, w, d, yaw, { cols = 3, rows = 2, hedgeChance = 0.6, wallChance = 0.25 } = {}) {
    const c = Math.cos(yaw);
    const s = Math.sin(yaw);
    const fw = w / cols;
    const fd = d / rows;
    for (let i = 0; i < cols; i++) {
      for (let j = 0; j < rows; j++) {
        const lx = -w / 2 + fw * (i + 0.5);
        const lz = -d / 2 + fd * (j + 0.5);
        const x = cx + lx * c + lz * s;
        const z = cz - lx * s + lz * c;
        if (!this.terrain.inBounds(x, z, 80)) continue;
        const f = { x, z, hx: fw / 2 - 2, hz: fd / 2 - 2, yaw };
        this.fields.push(f);
        const mat = this.rng.chance(0.55) ? MAT.FIELD : MAT.DRYGRASS;
        this.paintRect(x, z, f.hx, f.hz, yaw, mat, (m) => m !== MAT.ROAD && m !== MAT.CONCRETE);
      }
    }
    // Borders along grid lines.
    for (let i = 0; i <= cols; i++) {
      const lx = -w / 2 + fw * i;
      const kind = this.rng.chance(hedgeChance) ? 'hedge' : this.rng.chance(wallChance / (1 - hedgeChance + 1e-6)) ? 'stone_wall' : null;
      if (!kind) continue;
      const a = [cx + lx * c + (-d / 2) * s, cz - lx * s + (-d / 2) * c];
      const b = [cx + lx * c + (d / 2) * s, cz - lx * s + (d / 2) * c];
      this.borderLine(kind, a, b);
    }
    for (let j = 0; j <= rows; j++) {
      const lz = -d / 2 + fd * j;
      const kind = this.rng.chance(hedgeChance) ? 'hedge' : this.rng.chance(wallChance / (1 - hedgeChance + 1e-6)) ? 'stone_wall' : null;
      if (!kind) continue;
      const a = [cx + (-w / 2) * c + lz * s, cz - (-w / 2) * s + lz * c];
      const b = [cx + (w / 2) * c + lz * s, cz - (w / 2) * s + lz * c];
      this.borderLine(kind, a, b);
    }
  }

  borderLine(kind, a, b) {
    const len = Math.hypot(b[0] - a[0], b[1] - a[1]);
    const seg = kind === 'hedge' ? 9 : 7;
    const n = Math.max(1, Math.round(len / seg));
    for (let i = 0; i < n; i++) {
      if (this.rng.chance(0.14)) continue;
      const ax = lerp(a[0], b[0], i / n);
      const az = lerp(a[1], b[1], i / n);
      const bx = lerp(a[0], b[0], (i + 1) / n);
      const bz = lerp(a[1], b[1], (i + 1) / n);
      const mx = (ax + bx) / 2;
      const mz = (az + bz) / 2;
      if (this.onRoad(mx, mz, 3) || !this.terrain.inBounds(mx, mz, 70)) continue;
      if (this.structures.structureAt(mx, mz, 2)) continue;
      if (kind === 'hedge') {
        this.wall('hedge', ax, az, bx, bz, this.rng.range(1.6, 2.4), 1.4);
        if (this.rng.chance(0.25)) this.tree(mx + this.rng.range(-2, 2), mz + this.rng.range(-2, 2), 1, this.rng.range(0.8, 1.1));
      } else {
        this.wall('stone_wall', ax, az, bx, bz, this.rng.range(0.9, 1.15), 0.6);
      }
    }
  }

  // A farmstead: farmhouse, barn, shed, a few trees and a fence.
  farmstead(cx, cz, yaw) {
    const c = Math.cos(yaw);
    const s = Math.sin(yaw);
    const at = (lx, lz) => [cx + lx * c + lz * s, cz - lx * s + lz * c];
    this.flattenCircle(cx, cz, 34, 22);
    this.paintCircle(cx, cz, 30, MAT.DIRT, 0.25);
    let p = at(-10, 4);
    this.tryBuilding('farmhouse', p[0], p[1], 12, 9, yaw, { floors: 2, roof: 'gable', roofH: 3.4, color: this.rng.pick(FACADES) });
    p = at(12, -6);
    this.tryBuilding('barn', p[0], p[1], 18, 11, yaw + Math.PI / 2, { floors: 1, h: 6, roof: 'gable', roofH: 4.2, color: 0x7b4a33, roofColor: 0x5f5d58 });
    p = at(-12, -14);
    this.tryBuilding('garage', p[0], p[1], 7, 6, yaw, { floors: 1, h: 3.2, roof: 'gable', roofH: 1.6, color: 0x9a8f7c });
    for (let k = 0; k < 5; k++) {
      p = at(this.rng.range(-26, 26), this.rng.range(14, 28));
      this.tree(p[0], p[1], 1, this.rng.range(0.9, 1.2));
    }
    if (this.rng.chance(0.6)) {
      p = at(2, 12);
      this.prop(this.rng.chance(0.5) ? 'car' : 'car_wreck', p[0], p[1], yaw + this.rng.range(-0.4, 0.4));
    }
    p = at(4, -18);
    this.prop('fuel_drums', p[0], p[1], yaw);
    const a = at(-28, -24);
    const b = at(28, -24);
    this.wallLine('fence', a[0], a[1], b[0], b[1], 1.2, 0.15, 6, 0.15);
  }

  // ------------------------------------------------------------------ town
  // Grid town: plaza, church, apartment core, houses, industrial district.
  town(cx, cz, radius, yaw, { industrialSide = -1, fortify = 1 } = {}) {
    const rng = this.rng;
    const c = Math.cos(yaw);
    const s = Math.sin(yaw);
    const toW = (u, v) => [cx + u * c + v * s, cz - u * s + v * c];
    const block = 66;
    const K = Math.ceil(radius / block) + 1;
    const offsU = [];
    const offsV = [];
    for (let i = -K; i <= K + 1; i++) {
      offsU[i + K] = i * block + (i === 0 ? 0 : rng.range(-7, 7));
      offsV[i + K] = i * block + (i === 0 ? 0 : rng.range(-7, 7));
    }
    const radiusAt = (u, v) => radius * (0.92 + 0.16 * this.noise.noise(u / 120 + 9, v / 120 - 4));
    const inTown = (u, v, k = 1) => Math.hypot(u, v) < radiusAt(u, v) * k;

    // Base plate: flatten the town area gently.
    const baseH = this.flattenCircle(cx, cz, radius * 0.95, 120, null, 0.85);
    this.flattenCircle(cx, cz, radius * 0.55, 60, baseH, 0.6);

    // Streets.
    for (let i = -K; i <= K + 1; i++) {
      const u = offsU[i + K];
      const main = i === 0;
      const segs = [];
      for (let v = -radius * 1.3; v <= radius * 1.3; v += 8) {
        if (inTown(u, v, main ? 1.25 : 1.02)) segs.push(toW(u, v));
      }
      if (segs.length > 2) this.road(segs, main ? 13 : 9, { main });
    }
    for (let j = -K; j <= K + 1; j++) {
      const v = offsV[j + K];
      const main = j === 0;
      const segs = [];
      for (let u = -radius * 1.3; u <= radius * 1.3; u += 8) {
        if (inTown(u, v, main ? 1.25 : 1.02)) segs.push(toW(u, v));
      }
      if (segs.length > 2) this.road(segs, main ? 13 : 9, { main });
    }
    this.paintCircle(cx, cz, radius * 1.02, MAT.GRASS, 0.12);

    const blocks = [];
    for (let i = -K; i <= K; i++) {
      for (let j = -K; j <= K; j++) {
        const u0 = offsU[i + K] + 6;
        const u1 = offsU[i + K + 1] - 6;
        const v0 = offsV[j + K] + 6;
        const v1 = offsV[j + K + 1] - 6;
        const mu = (u0 + u1) / 2;
        const mv = (v0 + v1) / 2;
        if (!inTown(mu, mv, 1.05)) continue;
        const dn = Math.hypot(mu, mv) / radius;
        blocks.push({ i, j, u0, u1, v0, v1, mu, mv, dn });
      }
    }

    // Special blocks: plaza (i=0,j=0), church (i=-1,j=0), industrial side.
    const special = new Map();
    special.set('0,0', 'plaza');
    special.set('-1,-1', 'church');
    for (const b of blocks) {
      if (b.dn > 0.45 && Math.sign(b.mu) === industrialSide && Math.abs(b.mv) < radius * 0.5 && !special.has(`${b.i},${b.j}`)) {
        special.set(`${b.i},${b.j}`, 'industrial');
      }
    }

    const placeAlongEdge = (b, edge, depthRange, lenRange, type, opts) => {
      // edge: 0 = v0 side (north), 1 = v1 side, 2 = u0 side, 3 = u1 side.
      const alongU = edge < 2;
      const a0 = alongU ? b.u0 : b.v0;
      const a1 = alongU ? b.u1 : b.v1;
      let pos = a0 + rng.range(0, 3);
      while (pos < a1 - 6) {
        const L = rng.range(lenRange[0], lenRange[1]);
        const D = rng.range(depthRange[0], depthRange[1]);
        if (pos + L > a1) break;
        const setback = opts.setback ? rng.range(opts.setback[0], opts.setback[1]) : 0.6;
        let u;
        let v;
        let byaw;
        if (alongU) {
          u = pos + L / 2;
          v = edge === 0 ? b.v0 + setback + D / 2 : b.v1 - setback - D / 2;
          byaw = yaw + (edge === 0 ? Math.PI : 0);
        } else {
          v = pos + L / 2;
          u = edge === 2 ? b.u0 + setback + D / 2 : b.u1 - setback - D / 2;
          byaw = yaw + (edge === 2 ? -Math.PI / 2 : Math.PI / 2);
        }
        const [wx, wz] = toW(u, v);
        const skip = opts.skipChance && rng.chance(opts.skipChance);
        if (!skip) {
          // Footprint: width along the street = L, depth = D. Building local
          // +Z faces the street, so hx = L/2, hz = D/2.
          const floors = rng.int(opts.floors[0], opts.floors[1]);
          const roof = typeof opts.roof === 'function' ? opts.roof() : opts.roof;
          const st = this.tryBuilding(type, wx, wz, L, D, byaw, {
            floors,
            roof,
            roofH: roof === 'gable' || roof === 'hip' ? rng.range(2.4, 3.6) : 0,
            color: opts.colors ? rng.pick(opts.colors) : undefined,
            pad: opts.pad ?? 0.4,
          });
          if (st && opts.yard && rng.chance(0.55)) {
            // Tree or car in the yard behind.
            const back = alongU ? (edge === 0 ? 1 : -1) : edge === 2 ? 1 : -1;
            const [tx, tz] = alongU ? toW(u + rng.range(-3, 3), v + back * (D / 2 + rng.range(4, 9))) : toW(u + back * (D / 2 + rng.range(4, 9)), v + rng.range(-3, 3));
            if (rng.chance(0.75)) this.tree(tx, tz, 1, rng.range(0.7, 1.05));
            else this.prop('car', tx, tz, byaw + rng.range(-0.5, 0.5));
          }
        }
        pos += L + rng.range(opts.gap[0], opts.gap[1]);
      }
    };

    for (const b of blocks) {
      const key = `${b.i},${b.j}`;
      const kind = special.get(key);
      if (kind === 'plaza') {
        const [px, pz] = toW(b.mu, b.mv);
        this.paintRect(px, pz, (b.u1 - b.u0) / 2 + 4, (b.v1 - b.v0) / 2 + 4, yaw, MAT.CONCRETE);
        // Town hall on the north side of the plaza.
        const [hx, hz] = toW(b.mu, b.v0 + 10);
        this.building('townhall', hx, hz, 30, 17, yaw + Math.PI, { floors: 3, roof: 'hip', roofH: 4.5, color: 0xd8cdb4, roofColor: 0x5a5753 });
        const [tx, tz] = toW(b.mu, b.v0 + 10);
        this.building('tower', tx, tz, 6, 6, yaw, { floors: 1, h: 20, roof: 'spire', roofH: 6, color: 0xd8cdb4, roofColor: 0x445046 });
        // Fountain / monument as a low prop (jersey barrier as stand-in is wrong; use stone wall ring).
        const [mx, mz] = toW(b.mu, b.mv + 6);
        for (let a = 0; a < 6; a++) {
          const a0 = (a / 6) * Math.PI * 2;
          const a1 = ((a + 1) / 6) * Math.PI * 2;
          this.wall('stone_wall', mx + Math.cos(a0) * 4, mz + Math.sin(a0) * 4, mx + Math.cos(a1) * 4, mz + Math.sin(a1) * 4, 0.8, 0.5, { color: 0xb0a898 });
        }
        for (let k = 0; k < 6; k++) {
          const [lx, lz] = toW(b.u0 + 3 + ((b.u1 - b.u0 - 6) * k) / 5, b.v1 - 3);
          this.decoration('street_lamp', lx, lz, yaw);
        }
        continue;
      }
      if (kind === 'church') {
        const [px, pz] = toW(b.mu, b.mv);
        this.paintRect(px, pz, (b.u1 - b.u0) / 2, (b.v1 - b.v0) / 2, yaw, MAT.GRASS);
        this.building('church', px, pz + 0, 13, 27, yaw, { floors: 1, h: 10, roof: 'gable', roofH: 6, color: 0xcbc3b2, roofColor: 0x50504c });
        const [tx, tz] = toW(b.mu, b.mv - 16.5);
        this.building('tower', tx, tz, 6.5, 6.5, yaw, { floors: 1, h: 24, roof: 'spire', roofH: 9, color: 0xcbc3b2, roofColor: 0x3f4a42 });
        for (let k = 0; k < 6; k++) {
          const [gx, gz] = toW(b.u0 + rng.range(3, 10), b.v0 + rng.range(5, b.v1 - b.v0 - 5));
          this.tree(gx, gz, 1, rng.range(0.8, 1.0));
        }
        this.wallLine('stone_wall', ...toW(b.u0 + 1, b.v1 - 1), ...toW(b.u1 - 1, b.v1 - 1), 1.1, 0.5, 6, 0.1);
        continue;
      }
      if (kind === 'industrial') {
        const [px, pz] = toW(b.mu, b.mv);
        this.paintRect(px, pz, (b.u1 - b.u0) / 2 + 3, (b.v1 - b.v0) / 2 + 3, yaw, MAT.CONCRETE);
        const big = rng.chance(0.5);
        if (big) {
          this.tryBuilding('factory', px, pz, Math.min(44, b.u1 - b.u0 - 6), Math.min(30, b.v1 - b.v0 - 8), yaw, { floors: 3, h: 10, roof: 'flat', color: rng.pick([0x9e9a90, 0xa39b8a, 0x8d8a82]) });
          const [sx, sz] = toW(b.u1 - 6, b.v1 - 6);
          this.prop('fuel_tank', sx, sz, yaw + Math.PI / 2);
        } else {
          for (let k = 0; k < 2; k++) {
            const [wx, wz] = toW(b.mu, b.v0 + 12 + k * 26);
            this.tryBuilding('warehouse', wx, wz, Math.min(40, b.u1 - b.u0 - 6), 18, yaw, { floors: 2, h: 8, roof: 'gable', roofH: 2.2, color: rng.pick([0x8c8f88, 0x9aa09a, 0x7f857e]), roofColor: 0x6a6f6d });
          }
        }
        for (let k = 0; k < 4; k++) {
          const [cx2, cz2] = toW(rng.range(b.u0 + 3, b.u1 - 3), rng.range(b.v0 + 3, b.v1 - 3));
          this.prop(rng.chance(0.5) ? 'crates' : 'fuel_drums', cx2, cz2, rng.range(0, 6.28));
        }
        continue;
      }
      if (b.dn < 0.42) {
        // Dense core: contiguous apartment blocks and shops.
        const opts = { floors: [3, 5], roof: 'flat', gap: [0.2, 1.5], setback: [0.5, 1.5], skipChance: 0.08 };
        placeAlongEdge(b, 0, [11, 14], [14, 28], 'apartment', opts);
        placeAlongEdge(b, 1, [11, 14], [14, 28], 'apartment', opts);
        placeAlongEdge(b, 2, [10, 13], [10, 16], 'shop', { ...opts, floors: [2, 3] });
        placeAlongEdge(b, 3, [10, 13], [10, 16], 'shop', { ...opts, floors: [2, 3] });
        // Courtyard clutter.
        for (let k = 0; k < 2; k++) {
          const [qx, qz] = toW(b.mu + rng.range(-8, 8), b.mv + rng.range(-8, 8));
          if (rng.chance(0.5)) this.tree(qx, qz, 1, rng.range(0.6, 0.9));
          else this.prop('car', qx, qz, rng.range(0, 6.28));
        }
      } else {
        // Residential: detached houses with yards.
        const opts = {
          floors: [1, 2],
          roof: () => (rng.chance(0.8) ? 'gable' : 'hip'),
          gap: [4, 9],
          setback: [3, 6],
          skipChance: b.dn > 0.85 ? 0.35 : 0.12,
          yard: true,
          pad: 1.5,
        };
        placeAlongEdge(b, 0, [8, 10], [8, 12], 'house', opts);
        placeAlongEdge(b, 1, [8, 10], [8, 12], 'house', opts);
        placeAlongEdge(b, 2, [8, 10], [8, 11], 'house', opts);
        placeAlongEdge(b, 3, [8, 10], [8, 11], 'house', opts);
      }
    }

    // Street furniture: lamps, parked cars, power poles.
    for (const r of this.roads.slice(-2 * (2 * K + 2))) {
      const pts = r.points;
      for (let k = 2; k < pts.length - 2; k += 3) {
        const [ax, az] = pts[k];
        const [bx, bz] = pts[k + 1];
        const dx = bx - ax;
        const dz = bz - az;
        const l = Math.hypot(dx, dz) || 1;
        const nx = -dz / l;
        const nz = dx / l;
        const side = k % 2 === 0 ? 1 : -1;
        const off = r.width / 2 + 1.2;
        const ly = Math.atan2(dx, dz);
        if (Math.hypot(ax - cx, az - cz) < radius * 0.95 && rng.chance(0.55)) this.decoration('street_lamp', ax + nx * off * side, az + nz * off * side, ly);
        if (rng.chance(0.16)) {
          const cxp = ax + nx * (r.width / 2 - 1.3) * -side;
          const czp = az + nz * (r.width / 2 - 1.3) * -side;
          this.prop(rng.chance(0.18) ? 'car_wreck' : 'car', cxp, czp, ly + (rng.chance(0.5) ? 0 : Math.PI), { check: false });
        }
      }
    }
    this.noTree.push({ x: cx, z: cz, r: radius * 1.05 });
    return { toW, baseH };
  }

  // Fortifications: sandbag positions and hesco in an arc facing `facingYaw`.
  fortifyLine(cx, cz, facingYaw, width, faction, { sandbags = 6, hesco = 3, traps = 4, barriers = 3 } = {}) {
    const rng = this.rng;
    const fx = Math.sin(facingYaw);
    const fz = Math.cos(facingYaw);
    const rx = fz;
    const rz = -fx;
    const place = (kind, n, depth) => {
      for (let k = 0; k < n; k++) {
        const t = (k + 0.5) / n - 0.5 + rng.range(-0.04, 0.04);
        const x = cx + rx * t * width + fx * (depth + rng.range(-4, 4));
        const z = cz + rz * t * width + fz * (depth + rng.range(-4, 4));
        const s = this.prop(kind, x, z, facingYaw + rng.range(-0.25, 0.25));
        if (s && (kind === 'sandbags' || kind === 'hesco')) this.defensePositions[faction].push({ x: x - fx * 1.2, z: z - fz * 1.2, yaw: facingYaw, kind });
      }
    };
    place('sandbags', sandbags, 0);
    place('hesco', hesco, -6);
    place('tank_trap', traps, 25);
    place('jersey_barrier', barriers, 12);
  }

  // ----------------------------------------------------------------- base
  militaryBase(cx, cz, w, d, yaw) {
    const rng = this.rng;
    const c = Math.cos(yaw);
    const s = Math.sin(yaw);
    const toW = (u, v) => [cx + u * c + v * s, cz - u * s + v * c];
    const baseH = this.flattenRect(cx, cz, w / 2 + 25, d / 2 + 25, yaw, 70);
    this.paintRect(cx, cz, w / 2 + 6, d / 2 + 6, yaw, MAT.DIRT);
    this.paintRect(cx, cz, w / 2 - 4, d / 2 - 4, yaw, MAT.CONCRETE);
    // Internal roads.
    this.road([toW(-w / 2 - 120, 0), toW(w / 2 + 120, 0)], 12, { main: true });
    this.road([toW(0, -d / 2 - 260), toW(0, d / 2 + 30)], 12, { main: true });
    // Perimeter: hesco with gates at road crossings, towers at corners.
    const gate = 16;
    const perim = (u0, v0, u1, v1) => {
      const len = Math.hypot(u1 - u0, v1 - v0);
      const n = Math.round(len / 3.3);
      for (let k = 0; k < n; k++) {
        const t = (k + 0.5) / n;
        const u = lerp(u0, u1, t);
        const v = lerp(v0, v1, t);
        if (Math.abs(u) < gate && Math.abs(v) > d / 2 - 2) continue;
        if (Math.abs(v) < gate && Math.abs(u) > w / 2 - 2) continue;
        const [x, z] = toW(u, v);
        const segYaw = yaw + Math.atan2(u1 - u0, v1 - v0) + Math.PI / 2;
        this.prop('hesco', x, z, segYaw, { check: false });
      }
    };
    perim(-w / 2, -d / 2, w / 2, -d / 2);
    perim(-w / 2, d / 2, w / 2, d / 2);
    perim(-w / 2, -d / 2, -w / 2, d / 2);
    perim(w / 2, -d / 2, w / 2, d / 2);
    for (const [u, v] of [[-w / 2 + 4, -d / 2 + 4], [w / 2 - 4, -d / 2 + 4], [-w / 2 + 4, d / 2 - 4], [w / 2 - 4, d / 2 - 4], [gate + 6, d / 2 - 5], [-gate - 6, d / 2 - 5]]) {
      const [x, z] = toW(u, v);
      this.prop('guard_tower', x, z, yaw, { check: false });
    }
    // HQ / command post.
    const [hx, hz] = toW(-32, -d / 4);
    const hq = this.building('hq', hx, hz, 36, 18, yaw, { floors: 3, roof: 'flat', color: 0xa9a596 });
    const [mx, mz] = toW(-62, -d / 4 - 12);
    this.prop('radio_mast', mx, mz, yaw, { check: false });
    // Hangars along the east side.
    const hangars = [];
    for (let k = 0; k < 3; k++) {
      const [ax, az] = toW(w / 2 - 42, -d / 2 + 38 + k * 48);
      hangars.push(this.building('hangar', ax, az, 40, 34, yaw + Math.PI / 2, { floors: 1, h: 7, roof: 'arch', roofH: 7, color: 0x8e9389, roofColor: 0x7d837c }));
    }
    const [ctx2, ctz] = toW(w / 2 - 95, -d / 2 + 30);
    this.building('control_tower', ctx2, ctz, 8, 8, yaw, { floors: 5, h: 16, roof: 'flat', color: 0xc9c5b9 });
    // Barracks rows on the west side.
    for (let k = 0; k < 5; k++) {
      const [bx, bz] = toW(-w / 2 + 40, -d / 2 + 38 + k * 26);
      this.building('barracks', bx, bz, 32, 10, yaw, { floors: 1, h: 4.4, roof: 'gable', roofH: 1.8, color: 0xa8a493, roofColor: 0x5d6158 });
    }
    // Fuel depot (south-west quadrant).
    const fuel = toW(-w / 4 + 10, d / 4 + 10);
    for (let k = 0; k < 4; k++) {
      const [fx, fz] = toW(-w / 4 + (k % 2) * 16, d / 4 + Math.floor(k / 2) * 12);
      this.prop('fuel_tank', fx, fz, yaw + Math.PI / 2, { check: false });
    }
    for (let k = 0; k < 6; k++) {
      const [fx, fz] = toW(-w / 4 + rng.range(-20, 40), d / 4 + rng.range(-16, 30));
      this.prop('fuel_drums', fx, fz, rng.range(0, 6.28));
    }
    this.wallLine('concrete_wall', ...toW(-w / 4 - 16, d / 4 - 10), ...toW(-w / 4 + 34, d / 4 - 10), 2.4, 0.4, 5, 0.1);
    // Bunkers.
    for (const [u, v] of [[-w / 2 + 22, -d / 2 + 18], [w / 2 - 22, d / 2 - 18], [-w / 2 + 22, d / 2 - 18], [30, d / 2 - 22], [-30, -d / 2 + 22]]) {
      const [x, z] = toW(u, v);
      this.building('bunker', x, z, 9, 7, yaw + rng.range(-0.2, 0.2), { floors: 1, h: 2.4, roof: 'flat', color: 0x8d8b82 });
    }
    // Helipads (centre-east) and vehicle park.
    for (let k = 0; k < 3; k++) {
      const [px, pz] = toW(30 + k * 34, 40);
      this.paintCircle(px, pz, 11, MAT.CONCRETE);
      this.helipads.push({ x: px, z: pz });
    }
    for (let k = 0; k < 8; k++) {
      const [vx, vz] = toW(20 + rng.range(0, 90), d / 2 - 50 + rng.range(-10, 10));
      this.prop(rng.chance(0.5) ? 'crates' : 'jersey_barrier', vx, vz, yaw + rng.range(-0.3, 0.3));
    }
    // Runway south of the base.
    const [rx, rz] = toW(0, d / 2 + 110);
    this.flattenRect(rx, rz, 420, 22, yaw, 60, baseH - 0.5);
    this.paintRect(rx, rz, 410, 16, yaw, MAT.CONCRETE);
    this.noTree.push({ x: rx, z: rz, r: 140 }, { x: rx + 300 * c, z: rz - 300 * s, r: 120 }, { x: rx - 300 * c, z: rz + 300 * s, r: 120 });
    this.noTree.push({ x: cx, z: cz, r: Math.hypot(w, d) / 2 + 40 });
    return { toW, hq, hangars, fuel, baseH };
  }

  // A small village cluster around a point.
  village(cx, cz, count, radius, yaw) {
    const rng = this.rng;
    this.flattenCircle(cx, cz, radius, 60, null, 0.7);
    this.paintCircle(cx, cz, radius, MAT.GRASS, 0.2);
    this.paintCircle(cx, cz, radius * 0.35, MAT.DIRT, 0.3);
    let placed = 0;
    for (let k = 0; k < count * 10 && placed < count; k++) {
      const a = rng.range(0, Math.PI * 2);
      const r = Math.sqrt(rng.next()) * radius;
      const x = cx + Math.cos(a) * r;
      const z = cz + Math.sin(a) * r;
      const by = yaw + Math.round(rng.range(-2, 2)) * (Math.PI / 2) + rng.range(-0.1, 0.1);
      const big = rng.chance(0.2);
      const st = this.tryBuilding(big ? 'shop' : 'house', x, z, big ? rng.range(11, 15) : rng.range(8, 11), big ? rng.range(9, 12) : rng.range(8, 10), by, {
        floors: big ? 2 : rng.int(1, 2),
        roof: rng.chance(0.85) ? 'gable' : 'hip',
        roofH: rng.range(2.4, 3.4),
        pad: 3,
      });
      if (st) {
        placed++;
        if (rng.chance(0.5)) this.tree(x + rng.range(-12, 12), z + rng.range(-12, 12), 1, rng.range(0.8, 1.1));
        if (rng.chance(0.25)) this.prop(rng.chance(0.7) ? 'car' : 'car_wreck', x + rng.range(-9, 9), z + rng.range(-9, 9), rng.range(0, 6.28));
      }
    }
    this.noTree.push({ x: cx, z: cz, r: radius + 10 });
  }

  // Power line poles alongside a road polyline (decoration only).
  polesAlong(points, spacing = 42, offset = 9) {
    let acc = 0;
    for (let i = 0; i < points.length - 1; i++) {
      const [ax, az] = points[i];
      const [bx, bz] = points[i + 1];
      const len = Math.hypot(bx - ax, bz - az);
      const dx = (bx - ax) / (len || 1);
      const dz = (bz - az) / (len || 1);
      for (let d = 0; d < len; d += 4) {
        acc += 4;
        if (acc < spacing) continue;
        acc = 0;
        const x = ax + dx * d - dz * offset;
        const z = az + dz * d + dx * offset;
        if (!this.terrain.inBounds(x, z, 50) || this.structures.structureAt(x, z, 2)) continue;
        this.decoration('power_pole', x, z, Math.atan2(dx, dz) + Math.PI / 2);
      }
    }
  }

  setDeploy(faction, x, z, hw, hd, yaw, extra = {}) {
    this.deploy[faction] = {
      faction,
      x,
      z,
      hw,
      hd,
      yaw,
      rear: extra.rear || { x, z: z + Math.cos(yaw) * -110 },
      airEntry: extra.airEntry || { x: x * 0.6, z: z + Math.cos(yaw) * -900, yaw },
      forward: extra.forward || null,
    };
    // Keep deployment areas clear and drivable.
    this.flattenRect(x, z, hw, hd, 0, 80, null);
  }

  // ------------------------------------------------------------ finishing
  flattenPads() {
    for (const p of this.pads) this.flattenRect(p.x, p.z, p.hx + 1.5, p.hz + 1.5, p.yaw, 5, null);
  }

  paintNatural() {
    const t = this.terrain;
    const { noise, noise2 } = this;
    for (let iz = 0; iz < t.n; iz++) {
      const z = t.worldZ(iz);
      for (let ix = 0; ix < t.n; ix++) {
        const i = iz * t.n + ix;
        if (this.urban[i]) continue;
        const m = t.mat[i];
        if (m === MAT.ROAD || m === MAT.CONCRETE || m === MAT.FIELD || m === MAT.DRYGRASS || m === MAT.MUD) continue;
        const x = t.worldX(ix);
        const slope = t.slopeAt(x, z);
        const h = t.h[i];
        const n = noise.noise(x / 70, z / 70) * 0.5 + noise2.noise(x / 23, z / 23) * 0.25;
        if (slope > 0.75 + n * 0.2) t.mat[i] = MAT.ROCK;
        else if (slope > 0.48 + n * 0.15) t.mat[i] = MAT.DIRT;
        else if (h > t.minHeight + (t.maxHeight - t.minHeight) * 0.78 + n * 8) t.mat[i] = MAT.DRYGRASS;
        else if (n > 0.32) t.mat[i] = MAT.DRYGRASS;
        else if (n < -0.42) t.mat[i] = MAT.DIRT;
        else if (m !== MAT.DIRT) t.mat[i] = MAT.GRASS;
      }
    }
  }

  // Forest floor under trees and the forest density raster (8 m cells).
  computeForestDensity() {
    const t = this.terrain;
    const res = 8;
    const n = Math.ceil(t.size / res);
    const dens = new Float32Array(n * n);
    for (const tr of this.trees.list) {
      if (tr.kind === 3) continue;
      const cx = clamp(Math.floor((tr.x + t.half) / res), 0, n - 1);
      const cz = clamp(Math.floor((tr.z + t.half) / res), 0, n - 1);
      dens[cz * n + cx] += 0.75;
    }
    for (let i = 0; i < dens.length; i++) dens[i] = Math.min(1, dens[i]);
    // 3x3 blur so isolated trees don't read as forest.
    const blurred = new Float32Array(n * n);
    for (let z = 0; z < n; z++) {
      for (let x = 0; x < n; x++) {
        let sum = 0;
        for (let dz = -1; dz <= 1; dz++) {
          for (let dx = -1; dx <= 1; dx++) {
            const xx = clamp(x + dx, 0, n - 1);
            const zz = clamp(z + dz, 0, n - 1);
            sum += dens[zz * n + xx] * (dx === 0 && dz === 0 ? 2 : 1);
          }
        }
        blurred[z * n + x] = sum / 10;
      }
    }
    dens.set(blurred);
    // Paint forest floor where dense.
    for (let iz = 0; iz < t.n; iz++) {
      for (let ix = 0; ix < t.n; ix++) {
        const i = iz * t.n + ix;
        const m = t.mat[i];
        if (m !== MAT.GRASS && m !== MAT.DRYGRASS && m !== MAT.DIRT) continue;
        const cx = clamp(Math.floor((t.worldX(ix) + t.half) / res), 0, n - 1);
        const cz = clamp(Math.floor((t.worldZ(iz) + t.half) / res), 0, n - 1);
        if (dens[cz * n + cx] > 0.5) t.mat[i] = MAT.FOREST;
      }
    }
    this.forest = { res, n, dens };
  }

  finish() {
    this.flattenPads();
    const t = this.terrain;
    t.computeRange();
    this.paintNatural();
    // Settle structures, trees and decorations on the ground.
    for (const s of this.structures.list) {
      let lo = Infinity;
      const c = Math.cos(s.yaw);
      const sn = Math.sin(s.yaw);
      for (const [u, v] of [[-1, -1], [1, -1], [-1, 1], [1, 1], [0, 0]]) {
        const lx = u * s.hx;
        const lz = v * s.hz;
        lo = Math.min(lo, t.heightAt(s.x + lx * c + lz * sn, s.z - lx * sn + lz * c));
      }
      s.y = lo - (s.kind === 'building' ? 0.35 : 0.05);
    }
    for (const tr of this.trees.list) tr.y = t.heightAt(tr.x, tr.z) - 0.1;
    for (const d of this.decorations) d.y = t.heightAt(d.x, d.z);
    for (const o of this.objectives) o.y = t.heightAt(o.x, o.z);
    this.computeForestDensity();
    t.computeRange();
    t.dirtyChunks.clear();
  }

  result() {
    return {
      scenario: this.scenario,
      seed: this.seed,
      terrain: this.terrain,
      structures: this.structures,
      trees: this.trees,
      decorations: this.decorations,
      roads: this.roads,
      objectives: this.objectives,
      deploy: this.deploy,
      helipads: this.helipads,
      forest: this.forest,
      defensePositions: this.defensePositions,
      attacker: this.scenario.attacker,
    };
  }
}

// Prop footprint half-extents and height: [hx, hz, h, blocksMove].
export const PROP_DIMS = {
  sandbags: [1.5, 0.4, 0.95],
  hesco: [1.65, 0.55, 1.4],
  jersey_barrier: [1.5, 0.35, 0.8],
  tank_trap: [0.8, 0.8, 1.4],
  crates: [1.0, 1.0, 1.9],
  fuel_drums: [1.1, 1.1, 0.95],
  fuel_tank: [4.2, 1.5, 3.1],
  radio_mast: [1.2, 1.2, 30],
  guard_tower: [1.8, 1.8, 8],
  car: [0.92, 2.25, 1.45],
  car_wreck: [0.92, 2.25, 1.3],
  rock: [1.0, 1.0, 1.4],
};

function obbOverlap(ax, az, ahx, ahz, ayaw, bx, bz, bhx, bhz, byaw) {
  // Separating axis test for two Y-rotated rectangles.
  const axes = [
    [Math.cos(ayaw), -Math.sin(ayaw)],
    [Math.sin(ayaw), Math.cos(ayaw)],
    [Math.cos(byaw), -Math.sin(byaw)],
    [Math.sin(byaw), Math.cos(byaw)],
  ];
  const dx = bx - ax;
  const dz = bz - az;
  const aU = axes[0];
  const aV = axes[1];
  const bU = axes[2];
  const bV = axes[3];
  for (const [nx, nz] of axes) {
    const ra = ahx * Math.abs(aU[0] * nx + aU[1] * nz) + ahz * Math.abs(aV[0] * nx + aV[1] * nz);
    const rb = bhx * Math.abs(bU[0] * nx + bU[1] * nz) + bhz * Math.abs(bV[0] * nx + bV[1] * nz);
    if (Math.abs(dx * nx + dz * nz) > ra + rb) return false;
  }
  return true;
}

function pointInRect(px, pz, cx, cz, hx, hz, yaw) {
  const c = Math.cos(yaw);
  const s = Math.sin(yaw);
  const rx = px - cx;
  const rz = pz - cz;
  return Math.abs(rx * c - rz * s) <= hx && Math.abs(rx * s + rz * c) <= hz;
}

// ------------------------------------------------------------- scenarios

function commonRoads(ctx, through = [[0, 1000], [0, -1000]]) {
  const pts = [];
  const [a, b] = through;
  for (let k = 0; k <= 40; k++) {
    const t = k / 40;
    const x = lerp(a[0], b[0], t) + ctx.noise.noise(t * 3, 7) * 60 * smoothstep(0.1, 0.3, Math.abs(t - 0.5));
    const z = lerp(a[1], b[1], t);
    pts.push([x, z]);
  }
  return pts;
}

function buildTownScenario(ctx) {
  const rng = ctx.rng;
  ctx.baseTerrain({ macro: 20, meso: 6 });
  // Gentle rise north of town for defenders, hills on the flanks.
  ctx.addHill(-560, -80, 230, 160, 26, 0.3);
  ctx.addHill(600, 120, 260, 170, 22, -0.4);
  ctx.addHill(80, -560, 300, 140, 18, 0.1);
  ctx.setDeploy(0, 0, 860, 420, 70, Math.PI, { rear: { x: 0, z: 940 } });
  ctx.setDeploy(1, 0, -820, 380, 70, 0, { rear: { x: 0, z: -930 } });
  // Main N-S highway and E-W road through town.
  ctx.road(commonRoads(ctx, [[30, 1010], [-20, -1010]]), 11, { main: true });
  const ew = [];
  for (let k = 0; k <= 40; k++) ew.push([-1010 + k * 50.5, 30 * Math.sin(k * 0.35) + 20]);
  ctx.road(ew, 9);
  ctx.polesAlong(ew.filter((p) => Math.abs(p[0]) > 290));
  const town = ctx.town(0, 0, 250, 0.03, { industrialSide: -1 });
  // Objectives: town square, church district, industrial yard.
  const [ax, az] = town.toW(33, 33);
  ctx.objective('A', 'Town Square', ax, az, 42, 1);
  const [bx, bz] = town.toW(150, -40);
  ctx.objective('B', 'Market District', bx, bz, 50, 1);
  const [cx, cz] = town.toW(-160, 30);
  ctx.objective('C', 'Factory', cx, cz, 55, 1);
  // Farmland and farmsteads south of town (the attack approach) and north.
  ctx.farmland(-380, 470, 520, 280, 0.12, { cols: 4, rows: 2 });
  ctx.farmland(380, 450, 500, 300, -0.08, { cols: 4, rows: 2 });
  ctx.farmland(-420, -470, 420, 240, 0.2, { cols: 3, rows: 2 });
  ctx.farmstead(-520, 260, 0.3);
  ctx.farmstead(470, 300, -0.5);
  ctx.farmstead(560, -380, 1.2);
  // Federation defences on the southern edge of town.
  ctx.fortifyLine(0, 300, 0, 360, 1, { sandbags: 10, hesco: 4, traps: 8, barriers: 5 });
  ctx.fortifyLine(-280, 210, -0.45, 120, 1, { sandbags: 4, hesco: 2, traps: 2, barriers: 1 });
  ctx.fortifyLine(280, 200, 0.45, 120, 1, { sandbags: 4, hesco: 2, traps: 2, barriers: 1 });
  ctx.forest({ threshold: 0.16, spacing: 7.5 });
  ctx.rocks(80);
  for (let k = 0; k < 40; k++) ctx.tree(rng.range(-900, 900), rng.range(-900, 900), 1, rng.range(0.8, 1.2));
}

function buildBaseScenario(ctx) {
  ctx.baseTerrain({ macro: 24, meso: 7 });
  ctx.addHill(-650, 300, 260, 200, 30, 0.6);
  ctx.addHill(700, 380, 220, 200, 26, -0.3);
  ctx.setDeploy(0, 0, 870, 420, 70, Math.PI, { rear: { x: 0, z: 945 } });
  ctx.setDeploy(1, 0, -860, 380, 60, 0, { rear: { x: 0, z: -940 } });
  ctx.road(commonRoads(ctx, [[-40, 1010], [20, -1010]]), 10, { main: true });
  const base = ctx.militaryBase(0, -170, 470, 330, 0);
  const [ax, az] = [base.hq.x, base.hq.z];
  ctx.objective('A', 'Command Post', ax, az + 20, 45, 1);
  const hg = base.hangars[1];
  ctx.objective('B', 'Hangars', hg.x - 10, hg.z, 55, 1);
  ctx.objective('C', 'Fuel Depot', base.fuel[0], base.fuel[1], 45, 1);
  // Village south of the base on the approach route.
  ctx.village(-60, 420, 14, 110, 0.15);
  ctx.objective('D', 'Village', -60, 420, 60, 1);
  ctx.farmland(-430, 560, 380, 220, -0.15, { cols: 3, rows: 2 });
  ctx.farmland(420, 560, 380, 220, 0.12, { cols: 3, rows: 2 });
  ctx.farmstead(380, 180, 0.4);
  ctx.fortifyLine(0, 40, 0, 420, 1, { sandbags: 12, hesco: 5, traps: 10, barriers: 6 });
  ctx.fortifyLine(-60, 330, 0, 160, 1, { sandbags: 5, hesco: 2, traps: 3, barriers: 2 });
  ctx.forest({ threshold: 0.14, spacing: 7.5 });
  ctx.rocks(70);
}

function buildRidgeScenario(ctx) {
  ctx.baseTerrain({ macro: 16, meso: 6, base: 30 });
  // East-west ridge with a summit at x=0.
  ctx.stamp(-1024, -400, 1024, 400, (x, z, h) => {
    const z0 = 55 * Math.sin(x / 380) - 10;
    const prof = 0.55 + 0.45 * Math.exp(-(x * x) / (2 * 380 * 380));
    const along = smoothstep(980, 700, Math.abs(x));
    const n = ctx.noise2.fbm(x / 160, z / 160, 3) * 0.12;
    return h + 58 * prof * along * Math.exp(-((z - z0) * (z - z0)) / (2 * 115 * 115)) * (1 + n);
  });
  ctx.addHill(0, -10, 90, 70, 16, 0.2);
  ctx.setDeploy(0, 0, 860, 420, 70, Math.PI, { rear: { x: 0, z: 945 } });
  ctx.setDeploy(1, 0, -860, 420, 70, 0, { rear: { x: 0, z: -945 } });
  // Roads skirting around the ridge plus a track over the saddle.
  ctx.road(commonRoads(ctx, [[-640, 1010], [-560, -1010]]), 9);
  ctx.road(commonRoads(ctx, [[660, 1010], [600, -1010]]), 9);
  const track = [];
  for (let k = 0; k <= 30; k++) {
    const t = k / 30;
    track.push([-250 + 60 * Math.sin(t * 6), lerp(980, -980, t)]);
  }
  ctx.road(track, 6, { surface: MAT.DIRT });
  // Summit position.
  const sy = 55 * Math.sin(0 / 380) - 10;
  ctx.flattenCircle(0, sy, 22, 18, null, 0.9);
  ctx.prop('radio_mast', 6, sy - 6, 0, { check: false });
  ctx.building('bunker', -8, sy + 6, 9, 7, 0.3, { floors: 1, h: 2.4, color: 0x8d8b82 });
  for (let a = 0; a < 8; a++) {
    const ang = (a / 8) * Math.PI * 2;
    ctx.prop('sandbags', Math.cos(ang) * 26, sy + Math.sin(ang) * 26, Math.PI / 2 - ang, { check: false });
  }
  const wx = -440;
  const wz = 55 * Math.sin(wx / 380) - 10;
  ctx.objective('A', 'West Spur', wx, wz, 50, -1);
  ctx.objective('B', 'Hill 305', 0, sy, 50, -1);
  for (let a = 0; a < 5; a++) ctx.prop('sandbags', wx + ctx.rng.range(-25, 25), wz + ctx.rng.range(-25, 25), ctx.rng.range(0, 6.28));
  ctx.village(470, 210, 16, 100, -0.2);
  ctx.objective('C', 'Kessel Village', 470, 210, 60, -1);
  ctx.farmland(-200, 560, 640, 260, 0.05, { cols: 5, rows: 2 });
  ctx.farmland(150, -580, 640, 260, -0.06, { cols: 5, rows: 2 });
  ctx.farmstead(-620, 300, 0.2);
  ctx.farmstead(640, -330, -0.6);
  ctx.forest({ threshold: 0.1, spacing: 7.5, pineBias: 0.3 });
  ctx.rocks(140, { minSlope: 0.3 });
}

function buildValleyScenario(ctx) {
  ctx.baseTerrain({ macro: 14, meso: 5, base: 25 });
  ctx.addHill(-720, -40, 210, 380, 34, 0.1);
  ctx.addHill(740, 40, 200, 400, 30, -0.1);
  ctx.setDeploy(0, 0, 860, 450, 70, Math.PI, { rear: { x: 0, z: 945 } });
  ctx.setDeploy(1, 0, -860, 450, 70, 0, { rear: { x: 0, z: -945 } });
  ctx.road(commonRoads(ctx, [[0, 1010], [0, -1010]]), 10, { main: true });
  const ew = [];
  for (let k = 0; k <= 40; k++) ew.push([-1010 + k * 50.5, 25 * Math.sin(k * 0.4)]);
  ctx.road(ew, 9, { main: true });
  ctx.polesAlong(ew.filter((p) => Math.abs(p[0]) > 120));
  ctx.village(0, 0, 18, 95, 0);
  ctx.objective('A', 'Crossroads', 0, 0, 55, -1);
  ctx.farmstead(-450, -60, 0.25);
  ctx.objective('B', 'Mill Farm', -450, -60, 50, -1);
  // Grain silos.
  ctx.flattenCircle(450, 80, 40, 30, null);
  ctx.paintCircle(450, 80, 34, MAT.CONCRETE, 0.1);
  for (let k = 0; k < 3; k++) ctx.building('silo', 438 + k * 11, 70, 9, 9, 0, { floors: 1, h: 18, roof: 'flat', color: 0xbdb7a8 });
  ctx.building('warehouse', 456, 100, 30, 14, 0, { floors: 2, h: 7, roof: 'gable', roofH: 2, color: 0x8f938c, roofColor: 0x6a6f6d });
  ctx.objective('C', 'Grain Silos', 450, 80, 50, -1);
  ctx.farmland(-300, 400, 600, 320, 0.08, { cols: 5, rows: 3 });
  ctx.farmland(330, -400, 600, 320, -0.05, { cols: 5, rows: 3 });
  ctx.farmland(-320, -420, 520, 260, 0.1, { cols: 4, rows: 2 });
  ctx.farmland(340, 420, 520, 260, -0.12, { cols: 4, rows: 2 });
  ctx.farmstead(-640, 520, 0.4);
  ctx.farmstead(650, -560, 0.1);
  ctx.forest({ threshold: 0.24, spacing: 8 });
  ctx.rocks(60);
}
