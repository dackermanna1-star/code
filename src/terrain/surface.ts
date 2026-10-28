/**
 * Planetary surface generator.
 *
 * A planet surface is a pure function of a unit direction (planet-fixed) and a
 * SurfaceParams record. SurfaceParams are *derived from the planet's physical
 * model* (see astro/planetgen.ts) – gravity sets relief, geological activity
 * sets crater retention and volcanism, atmosphere sets erosion and dunes,
 * temperature and volatiles set ice, liquids and climate. The generator is a
 * set of physically motivated modules mixed by those parameters, so worlds
 * differ in structure, not just colour.
 *
 * Everything here is worker-safe (no DOM / three.js) and deterministic.
 */
import { noise3, noised, D, fbm, ridged, erodedFbm, cellular3, CELL } from '../core/noise';
import { hash3i, mix32 } from '../core/rng';

export type LiquidKind = 'none' | 'water' | 'brine' | 'methane' | 'ammonia' | 'lava' | 'sulfur' | 'nitrogen';
export type RGB = [number, number, number];

export interface SurfacePalette {
  rockA: RGB;      // dominant bedrock
  rockB: RGB;      // secondary bedrock / strata
  regolith: RGB;   // loose fines / soil / dust
  sand: RGB;       // aeolian sediment
  highland: RGB;   // bright unit (anorthosite, ejecta, salt, frost)
  lowland: RGB;    // dark unit (basalt, maria, carbonaceous)
  ice: RGB;        // surface ice / snow
  veg1: RGB;       // primary vegetation pigment (if any)
  veg2: RGB;       // secondary vegetation pigment
  liquidShallow: RGB;
  liquidDeep: RGB;
  lineae: RGB;     // crack / streak colour on icy worlds
}

export interface SurfaceParams {
  seed: number;
  radius: number;          // m
  reliefScale: number;     // m, characteristic mountain height (∝ 1/g)
  oceanFraction: number;   // 0..1 desired coverage by liquid
  liquid: LiquidKind;
  bimodal: number;         // continental vs oceanic crust contrast
  dichotomy: number;       // hemispheric crustal dichotomy
  continentFreq: number;   // cycles per radius for continents
  plates: number;          // plate-boundary orogeny strength
  plateFreq: number;
  mountains: number;       // ridged mountain strength
  hills: number;           // eroded hill amplitude
  erosion: number;         // 0..1 fluvial/aeolian smoothing
  roughness: number;       // small-scale fractal amplitude multiplier
  craters: number;         // 0..1 crater density (surface age)
  craterDegradation: number; // 0 fresh .. 1 heavily degraded
  minCraterRadius: number; // m (atmosphere filters small impactors)
  volcanoes: number;
  dunes: number;
  canyons: number;
  terraces: number;
  iceCracks: number;
  maria: number;
  rivers: number;
  // climate
  tempEquator: number;     // K at sea level
  tempPole: number;
  lapseRate: number;       // K per m
  moisture: number;        // global humidity 0..1
  iceCap: number;          // 0..1 extra ice coverage
  tidallyLocked: boolean;
  substellar: [number, number, number]; // planet-fixed direction to star for locked worlds
  vegetation: number;      // 0..1 biosphere coverage potential
  lifeGlow: number;        // night bioluminescence 0..1
  lavaGlow: number;        // emissive molten material
  palette: SurfacePalette;
}

/** Vertex material channels written by sample(). */
export interface SampleOut {
  height: number;    // m relative to radius (includes liquid floor, not surface)
  rock: number;      // 0 loose sediment .. 1 exposed bedrock
  unit: number;      // 0 dark/low unit .. 1 bright/high unit
  moisture: number;  // 0..1
  temp: number;      // K
  special: number;   // lineae / streak intensity (icy shells)
  /** surface of a river/lake above this point (m relative to radius), or -Infinity */
  water: number;
}

const TAU = Math.PI * 2;

function sstep(a: number, b: number, x: number) {
  let t = (x - a) / (b - a);
  t = t < 0 ? 0 : t > 1 ? 1 : t;
  return t * t * (3 - 2 * t);
}

export class SurfaceGenerator {
  readonly p: SurfaceParams;
  readonly R: number;
  seaLevel = 0; // metres relative to R
  private s: number[] = [];
  private windX: number; private windY: number; private windZ: number;
  private dichX: number; private dichY: number; private dichZ: number;
  readonly out: SampleOut = { height: 0, rock: 0, unit: 0, moisture: 0, temp: 0, special: 0, water: -Infinity };
  /** freezing point of the surface liquid (K), for rivers */
  private freezeT: number;
  private boilT: number;

  constructor(params: SurfaceParams) {
    this.p = params;
    this.R = params.radius;
    let h = params.seed >>> 0;
    for (let i = 0; i < 32; i++) { h = mix32(h + 0x9e3779b9 + i); this.s.push(h & 0x7fffffff); }
    // prevailing dune-forming wind axis and dichotomy axis (deterministic)
    const a1 = (this.s[20] / 0x7fffffff) * TAU, z1 = (this.s[21] / 0x7fffffff) * 0.6 - 0.3;
    this.windX = Math.cos(a1) * Math.sqrt(1 - z1 * z1); this.windY = z1; this.windZ = Math.sin(a1) * Math.sqrt(1 - z1 * z1);
    const a2 = (this.s[22] / 0x7fffffff) * TAU, z2 = (this.s[23] / 0x7fffffff) * 2 - 1;
    this.dichX = Math.cos(a2) * Math.sqrt(1 - z2 * z2); this.dichY = z2; this.dichZ = Math.sin(a2) * Math.sqrt(1 - z2 * z2);
    this.seaLevel = params.oceanFraction > 0 ? this.computeSeaLevel(params.oceanFraction) : -1e9;
    const ft: Record<string, [number, number]> = { water: [271, 400], brine: [252, 400], methane: [91, 190], ammonia: [195, 300], nitrogen: [63, 78], lava: [0, 1e5], sulfur: [300, 1e4] };
    [this.freezeT, this.boilT] = ft[params.liquid] ?? [Infinity, -Infinity];
  }

  /** Hypsometric sea level: the height quantile matching the desired liquid coverage. */
  private computeSeaLevel(frac: number): number {
    if (frac >= 0.999) return this.p.reliefScale * 3; // global ocean
    const N = 3000;
    const hs = new Float64Array(N);
    const golden = Math.PI * (3 - Math.sqrt(5));
    for (let i = 0; i < N; i++) {
      const y = 1 - (2 * (i + 0.5)) / N;
      const r = Math.sqrt(1 - y * y);
      const t = golden * i;
      hs[i] = this.baseHeight(Math.cos(t) * r, y, Math.sin(t) * r);
    }
    hs.sort();
    return hs[Math.min(N - 1, Math.floor(frac * N))];
  }

  /** Large-scale crustal height (continents, dichotomy, basins) – cheap, used for sea level. */
  baseHeight(x: number, y: number, z: number): number {
    const p = this.p, s = this.s, R = p.reliefScale;
    const cf = p.continentFreq;
    // domain warp so coastlines are not noise-isotropic blobs
    const wx = fbm(x * 1.7 + 11.3, y * 1.7, z * 1.7, s[0], 2) * 0.35;
    const wy = fbm(x * 1.7, y * 1.7 + 7.1, z * 1.7, s[1], 2) * 0.35;
    const wz = fbm(x * 1.7, y * 1.7, z * 1.7 + 3.7, s[2], 2) * 0.35;
    const cont = fbm((x + wx) * cf, (y + wy) * cf, (z + wz) * cf, s[3], 6, 2.0, 0.52);
    // bimodal crust: continental platforms with steep shelves vs smooth ocean basins
    const plat = sstep(-0.06, 0.06, cont);
    let h = R * 0.35 * cont * (1 - p.bimodal) + p.bimodal * R * (plat * 0.45 - 0.55 + cont * 0.25);
    if (p.dichotomy > 0) {
      const d = x * this.dichX + y * this.dichY + z * this.dichZ + 0.25 * fbm(x * 2.3, y * 2.3, z * 2.3, s[4], 3);
      h += p.dichotomy * R * 0.5 * (sstep(-0.25, 0.25, d) - 0.5);
    }
    return h;
  }

  /**
   * Full surface sample at unit direction (x,y,z).
   * lambdaMin: smallest wavelength (m) worth generating at this LOD.
   */
  sample(x: number, y: number, z: number, lambdaMin: number): SampleOut {
    const p = this.p, s = this.s, Rp = this.R, Rr = p.reliefScale;
    const o = this.out;
    const fMax = Rp / Math.max(lambdaMin, 0.05); // highest useful frequency (cycles / radius)

    let h = this.baseHeight(x, y, z);
    let rock = 0.35, unit = 0.5, special = 0, vent = 0;

    // ---- tectonic plates: orogenic belts at convergent boundaries, rifts at divergent ones
    let orogeny = 0;
    if (p.plates > 0.01) {
      const pf = p.plateFreq;
      const wx = noise3(x * 3.1, y * 3.1, z * 3.1, s[5]) * 0.18;
      const wy = noise3(x * 3.1 + 5.2, y * 3.1, z * 3.1, s[6]) * 0.18;
      const wz = noise3(x * 3.1, y * 3.1 + 9.4, z * 3.1, s[7]) * 0.18;
      const c = cellular3((x + wx) * pf, (y + wy) * pf, (z + wz) * pf, s[8], 0.95);
      const edge = c.f2 - c.f1;
      const pair = mix32((c.id1 ^ c.id2) >>> 0);
      const kind = (pair & 255) / 255; // symmetric in id1/id2
      const belt = Math.exp(-(edge * edge) / 0.018);
      if (kind < 0.55) orogeny = belt * sstep(0.0, 0.25, 0.55 - kind) * 1.0;
      else if (kind < 0.8) h -= p.plates * Rr * 0.25 * Math.exp(-(edge * edge) / 0.002); // rift valley / spreading trough
      // plates slightly offset in elevation (continental blocks)
      h += p.plates * Rr * 0.08 * (((c.id1 & 1023) / 1023) - 0.5);
    }

    // ---- mountains: ridged multifractal masked by orogeny and by a broad noise field
    const mMask = Math.max(orogeny * p.plates, p.mountains > 0.01 ? p.mountains * sstep(0.05, 0.45, fbm(x * 2.2, y * 2.2, z * 2.2, s[9], 3)) : 0);
    if (mMask > 0.01) {
      const mf = 18;
      // fractional octave count: the finest octave fades in across LOD levels
      const oct = Math.min(7, Math.max(0, Math.log2(fMax / mf) - 0.0));
      if (oct > 0) {
        const r = ridged(x * mf, y * mf, z * mf, s[10], oct, 2.03, 0.5, 2.2);
        h += mMask * Rr * 1.15 * r * r;
        rock += mMask * r * 1.2;
      }
    }

    // ---- hills / eroded relief everywhere above the base
    if (p.hills > 0.001) {
      const hf = 60;
      const oct = Math.min(5, Math.max(0, Math.log2(fMax / hf)));
      if (oct > 0) {
        const e = erodedFbm(x * hf, y * hf, z * hf, s[11], oct, 1.2 + p.erosion * 3, 0.5);
        h += p.hills * Rr * 0.18 * e;
      }
    }

    // ---- maria: basaltic flooding of low basins (flat, dark)
    if (p.maria > 0.01) {
      const lvl = -Rr * 0.18 + Rr * 0.15 * fbm(x * 1.3, y * 1.3, z * 1.3, s[12], 2);
      const t = sstep(lvl + Rr * 0.04, lvl - Rr * 0.02, h) * p.maria;
      h = h + (lvl - h) * t * 0.92;
      unit -= t * 0.7;
      rock -= t * 0.2;
    }

    // ---- canyons: entrenched sinuous valley systems with stepped walls
    const canyonRegion = p.canyons > 0.01 ? sstep(0.0, 0.35, fbm(x * 1.6, y * 1.6, z * 1.6, s[15], 2) + p.canyons * 0.3 - 0.1) : 0;
    if (canyonRegion > 0) {
      const region = canyonRegion;
      const cf = 7;
      const wv = fbm(x * 4, y * 4, z * 4, s[13], 2) * 0.12;
      const n = Math.abs(fbm((x + wv) * cf, (y - wv) * cf, (z + wv) * cf, s[14], 4, 2.1, 0.45));
      const w = 0.035;
      if (n < w * 2.5) {
        const t = 1 - sstep(0, w, n - w * 0.25);
        const depth = Rr * 0.55 * p.canyons * region;
        let cut = depth * t;
        // stepped walls
        const step = depth * 0.18;
        if (step > 1) cut = Math.floor(cut / step) * step + step * sstep(0.3, 1, (cut / step) % 1);
        h -= cut;
        rock += t * region * 0.8;
        unit += t * region * 0.15;
      }
    }

    // ---- terraces / mesas in sedimentary regions
    if (p.terraces > 0.01) {
      const tm = sstep(0.1, 0.4, fbm(x * 3.3, y * 3.3, z * 3.3, s[16], 3)) * p.terraces;
      if (tm > 0.01) {
        const step = Rr * 0.06;
        const q = h / step;
        const fl = Math.floor(q);
        const fr = q - fl;
        const th = (fl + sstep(0.65, 0.95, fr)) * step;
        h += (th - h) * tm;
        rock += tm * sstep(0.6, 0.95, fr) * 0.8;
      }
    }

    // ---- shield volcanoes / stratovolcanoes (sparse)
    if (p.volcanoes > 0.01) {
      const vf = 3.2;
      const c = cellular3(x * vf, y * vf, z * vf, s[17], 0.8);
      const prob = ((c.id1 >>> 8) & 1023) / 1023;
      if (prob < p.volcanoes * 0.35) {
        const size = 0.12 + 0.25 * ((c.id1 & 255) / 255);
        const d = c.f1 / size;
        if (d < 1) {
          const H = Rr * (1.0 + 2.0 * ((c.id1 >>> 18) & 255) / 255);
          let v = H * Math.pow(1 - d, 1.6);
          // radial lava-flow ridges
          const ang = Math.atan2(y - c.cy / vf, x - c.cx / vf);
          v *= 1 + 0.08 * noise3(Math.cos(ang) * 6, Math.sin(ang) * 6, d * 3, s[18]);
          // caldera
          const cal = 0.09;
          if (d < cal * 1.4) v -= H * 0.18 * sstep(cal * 1.4, cal * 0.6, d);
          h += v;
          unit -= 0.4 * (1 - d);
          vent = Math.max(vent, p.lavaGlow * sstep(cal * 1.2, cal * 0.4, d));
          rock += 0.3 * (1 - d);
        }
      }
    }

    // ---- ice-shell fracturing: lineae / double ridges
    if (p.iceCracks > 0.01) {
      let lin = 0;
      for (let k = 0; k < 2; k++) {
        const f = k === 0 ? 4.5 : 13;
        const wx = fbm(x * 9, y * 9, z * 9, s[19] + k, 2) * 0.06;
        const c = cellular3((x + wx) * f, (y + wx) * f, (z - wx) * f, s[24] + k, 1.0);
        const e = c.f2 - c.f1;
        const l = Math.exp(-(e * e) / (k === 0 ? 0.0012 : 0.003));
        lin = Math.max(lin, l * (k === 0 ? 1 : 0.6));
        // double ridge: two crests flanking a central groove
        h += p.iceCracks * Rr * 0.12 * (Math.exp(-((e - 0.035) ** 2) / 0.0002) - 0.5 * Math.exp(-(e * e) / 0.0002)) * (k === 0 ? 1 : 0.4);
      }
      special = Math.max(special, lin * p.iceCracks);
    }

    // ---- impact craters: power-law size distribution across octaves
    if (p.craters > 0.03) {
      h += this.craters(x, y, z, fMax);
      unit += this.craterUnit + this.craterRay * 0.6;
    }

    // ---- dunes: aeolian bedforms in dry, low-lying sediment traps
    let duneAmt = 0;
    if (p.dunes > 0.01) {
      const basin = sstep(Rr * 0.25, -Rr * 0.1, h - this.seaLevelOr(0));
      const field = basin > 0 ? sstep(0.0, 0.3, fbm(x * 5, y * 5, z * 5, s[25], 3)) : 0;
      duneAmt = p.dunes * basin * field;
      if (duneAmt > 0.01) {
        const along = x * this.windX + y * this.windY + z * this.windZ;
        const wv = fbm(x * 40, y * 40, z * 40, s[26], 3);
        let dsum = 0;
        // large draa + mid dunes
        for (let i = 0; i < 2; i++) {
          const f = i === 0 ? Rp / 1400 : Rp / 260;
          const fadeD = sstep(lambdaMin * 2, lambdaMin * 4, Rp / f);
          if (fadeD <= 0) break;
          const ph = along * f + wv * (i === 0 ? 3 : 6) + noise3(x * f * 0.15, y * f * 0.15, z * f * 0.15, s[27] + i) * 2;
          const fr = ph - Math.floor(ph);
          const prof = fr < 0.75 ? fr / 0.75 : (1 - fr) / 0.25; // gentle stoss, steep lee
          dsum += (prof * prof * (3 - 2 * prof)) * (i === 0 ? 1 : 0.35) * (Rp / f) * 0.06 * fadeD;
        }
        h += dsum * duneAmt;
        rock -= duneAmt * 1.2;
      }
    }

    // ---- fine fractal detail down to lambdaMin (rock-weighted roughness)
    {
      const startF = 1920;
      let amp = Rr * 0.012 * 0.47 * p.roughness;
      let f = startF;
      let i = 0;
      const rockiness = Math.max(0.15, Math.min(1, rock));
      while (f < fMax && i < 18) {
        const fade = sstep(fMax, fMax * 0.5, f);
        const n = noised(x * f, y * f, z * f, s[28] + i * 31);
        // derivative-damped (eroded) detail
        const g = (D[0] * D[0] + D[1] * D[1] + D[2] * D[2]);
        h += amp * n * fade * rockiness / (1 + p.erosion * g * 0.5);
        amp *= 0.47;
        f *= 2.0;
        i++;
      }
    }

    // ---- climate
    const lat = y; // y = planet rotation axis (sin latitude)
    let tFactor: number;
    if (p.tidallyLocked) {
      const cosZ = x * p.substellar[0] + y * p.substellar[1] + z * p.substellar[2];
      tFactor = Math.max(0, cosZ) ** 0.5;
    } else {
      tFactor = Math.sqrt(Math.max(0, 1 - lat * lat));
    }
    const above = Math.max(0, h - Math.max(this.seaLevel, -Rr * 10));
    let temp = p.tempPole + (p.tempEquator - p.tempPole) * tFactor - p.lapseRate * above;
    temp += 6 * fbm(x * 3, y * 3, z * 3, s[29], 2);
    // moisture: Hadley-cell latitudinal pattern + noise + proximity to sea level
    const absLat = Math.abs(lat);
    const hadley = 0.6 + 0.4 * Math.cos(absLat * Math.PI * 3.2);
    let moist = p.moisture * (0.55 * hadley + 0.45 * (0.5 + 0.5 * fbm(x * 4, y * 4, z * 4, s[30], 3)));
    if (this.seaLevel > -1e8) moist *= 0.6 + 0.4 * sstep(Rr * 0.6, 0, h - this.seaLevel);
    moist = Math.max(0, Math.min(1, moist));

    // ---- rivers: channels along the zero set of a warped noise field, cut into
    // valleys; wide and deep near the sea, narrowing upstream toward the
    // highlands and drying out in arid or frozen regions. Not a drainage
    // simulation, but channels sit in carved valleys and descend with the land.
    o.water = -Infinity;
    if (p.rivers > 0.01 && this.seaLevel > -1e8 && temp > this.freezeT - 8 && temp < this.boilT) {
      const elev = h - this.seaLevel;
      const hi = Rr * 0.9;
      // lava and sulfur flow from vents regardless of "moisture"
      const molten = p.liquid === 'lava' || p.liquid === 'sulfur';
      const flow = molten ? Math.max(moist, 0.6) : moist;
      if (elev > -2 && elev < hi && flow > 0.12) {
        const F = Rp / 45000; // main rivers ~ every 30–60 km
        const wq = fbm(x * F * 0.35, y * F * 0.35, z * F * 0.35, s[31], 3) * 1.4;
        const n = noised(x * F + wq, y * F - wq, z * F + wq * 0.5, s[27]);
        // first-order distance to the river line (zero set), in metres
        const grad = Math.max(Math.hypot(D[0], D[1], D[2]), 0.45);
        const lowland = 1 - elev / hi;
        const wet = sstep(0.12, 0.45, flow) * p.rivers;
        const widthM = (6 + 140 * lowland * lowland) * wet;
        const an = (Math.abs(n) / grad) * (Rp / F);
        const w = widthM;
        const vw = Math.max(w * 7, 700 * lowland + 120);
        if (an < vw && widthM > 2) {
          // resolvable only once the mesh is finer than the river
          const vis = sstep(0.4, 1.5, widthM / Math.max(lambdaMin, 0.1));
          const vp = 1 - sstep(0, vw, an);                       // valley profile
          const valleyDepth = Math.min(Rr * 0.08, 6 + widthM * 0.25) * wet;
          const chDepth = (1.5 + widthM * 0.02) * vis;
          const cp = 1 - sstep(w * 0.6, w * 1.1, an);             // channel profile
          const floor = h - valleyDepth * vp * vp;
          h = floor - chDepth * cp;
          if (cp > 0.02 && vis > 0.05) o.water = floor - chDepth * 0.3;
          if (!molten) moist = Math.min(1, moist + 0.35 * vp);
          rock *= 1 - 0.6 * vp;
        }
      }
    }

    o.height = h;
    o.rock = Math.max(0, Math.min(1, rock));
    o.unit = Math.max(0, Math.min(1, unit));
    o.moisture = moist;
    // molten vents radiate: encode as local surface temperature (drives blackbody emission)
    o.temp = vent > 0 ? Math.max(temp, 700 + 900 * vent) : temp;
    o.special = Math.max(0, Math.min(1, special));
    return o;
  }

  private seaLevelOr(def: number) {
    return this.seaLevel > -1e8 ? this.seaLevel : def;
  }

  private craterUnit = 0;
  private craterRay = 0;

  /** Sum of crater profiles over size octaves. Cell size halves each octave. */
  private craters(x: number, y: number, z: number, fMax: number): number {
    const p = this.p, R = this.R;
    let total = 0;
    let unitAcc = 0, ray = 0;
    const density = p.craters;
    const minR = p.minCraterRadius;
    // cell sizes (unit-sphere units): from 0.6 rad down
    let cs = 0.6;
    for (let oct = 0; oct < 22; oct++, cs *= 0.5) {
      const cellM = cs * R;
      if (cellM * 0.28 < minR) break;            // atmosphere burns up small impactors
      // fade each size class in over one LOD level instead of switching it on abruptly
      const lodFade = 1 - sstep(fMax * 0.35, fMax * 0.7, 1 / cs);
      if (lodFade <= 0) break;
      const inv = 1 / cs;
      const gx = x * inv - 0.5, gy = y * inv - 0.5, gz = z * inv - 0.5;
      const bx = Math.floor(gx), by = Math.floor(gy), bz = Math.floor(gz);
      const prob = density * (oct < 3 ? 0.55 : 0.85);
      const seed = this.s[31] + oct * 977;
      for (let k = 0; k < 2; k++)
        for (let j = 0; j < 2; j++)
          for (let i = 0; i < 2; i++) {
            const cx = bx + i, cy = by + j, cz = bz + k;
            const hh = hash3i(cx, cy, cz, seed);
            if ((hh & 4095) / 4095 > prob) continue;
            const h2 = mix32(hh);
            const px = (cx + ((h2 & 1023) / 1023)) * cs;
            const py = (cy + (((h2 >>> 10) & 1023) / 1023)) * cs;
            const pz = (cz + (((h2 >>> 20) & 1023) / 1023)) * cs;
            // project crater centre onto the sphere surface; skip if the cell is far from it
            const pl = Math.sqrt(px * px + py * py + pz * pz);
            if (pl < 0.5) continue;
            const ux = px / pl, uy = py / pl, uz = pz / pl;
            const dx = x - ux, dy = y - uy, dz = z - uz;
            const dist = Math.sqrt(dx * dx + dy * dy + dz * dz);
            const h3 = mix32(h2 + 77);
            const r = cs * (0.08 + 0.2 * Math.pow((h3 & 1023) / 1023, 2));
            const d = dist / r;
            if (d > 2.2) continue;
            const rM = r * R;
            if (rM < minR) continue;
            // age: older craters are shallower with softened rims
            const age = Math.min(1, p.craterDegradation * (0.4 + 1.2 * (((h3 >>> 10) & 1023) / 1023)));
            const complex = rM > 8000;
            const depthRatio = complex ? 0.06 + 0.1 * Math.exp(-rM / 60000) : 0.2;
            const depth = 2 * rM * depthRatio * (1 - 0.75 * age);
            const rimH = depth * 0.22 * (1 - 0.6 * age);
            let c: number;
            if (d < 1) {
              const floor = complex ? 0.55 : 0.15;
              const bowl = d < floor ? -1 : -1 + sstep(floor, 1.0, d) ** 1.4;
              c = bowl * depth + rimH * sstep(0.75, 1.0, d);
              if (complex && d < 0.18) c += depth * 0.35 * (1 - d / 0.18) ** 2; // central peak
            } else {
              const e = d - 1;
              c = rimH * Math.exp(-e * e / 0.02) + rimH * 0.35 * Math.pow(1 / d, 3) * sstep(2.2, 1.6, d);
            }
            total += c * lodFade;
            const fresh = 1 - age;
            if (d < 1.2) unitAcc += 0.25 * fresh * sstep(1.2, 0.8, d);
            else if (fresh > 0.7 && oct > 2) {
              // bright ejecta rays from young craters
              const ang = Math.atan2(dy * uz - dz * uy, dx);
              const rays = Math.pow(Math.abs(Math.sin(ang * (5 + (h3 & 7)) + (h3 & 255))), 12);
              ray = Math.max(ray, rays * sstep(2.2, 1.2, d) * (fresh - 0.7) * 3.3);
            }
          }
    }
    this.craterUnit = unitAcc;
    this.craterRay = ray;
    return total;
  }

  /** Liquid surface height for this sample (sea level), or -Infinity if none. */
  liquidLevel(): number {
    return this.seaLevel > -1e8 ? this.seaLevel : -Infinity;
  }
}
