/**
 * Planet physical model → rendering parameters.
 *
 * Pipeline: composition & mass → radius/density/gravity → rotation & tidal
 * locking → equilibrium temperature → volatile retention (Jeans escape vs.
 * stellar XUV) → atmosphere mass & composition → greenhouse surface
 * temperature → stable liquids (phase limits) → geology (tectonics,
 * volcanism, tidal heating, surface age) → magnetic field & radiation →
 * habitability & life (rare by construction) → clouds → visual parameters.
 *
 * All formulas are order-of-magnitude astrophysics (documented inline); the
 * point is that visuals follow from physical state, e.g. a 0.3 g airless body
 * gets tall relief, saturated craters, Lommel–Seeliger regolith and a black
 * sky; a 92-bar CO₂ world gets an overcast, yellowish, crater-poor surface.
 */
import { Rng } from '../core/rng';
import { AU, EARTH_MASS, EARTH_RADIUS, G, JUPITER_MASS, JUPITER_RADIUS, K_B, AMU, SIGMA_SB, SOLAR_LUMINOSITY } from '../core/constants';
import type { AtmosphereInfo, GasGiantParams, LifeInfo, PlanetPhysics, RingInfo } from './types';
import type { LiquidKind, SurfaceParams, SurfacePalette, RGB } from '../terrain/surface';
import type { AtmosphereParams } from '../render/atmosphere';
import type { CloudParams } from '../render/clouds';

export type Formation = 'rocky' | 'icy' | 'gas-giant' | 'ice-giant' | 'mini-neptune' | 'asteroid';

export interface PlanetInput {
  seed: number;
  isMoon: boolean;
  mass: number;               // kg
  formation: Formation;
  starLum: number;            // W (current)
  starTemp: number;           // K
  starMass: number;           // kg
  starAge: number;            // yr
  starActivity: number;       // 0..1
  starIsRemnant: boolean;
  distance: number;           // m from the star (planet's a for moons)
  ecc: number;
  carbonRich: boolean;
  metallicity: number;
  lifeFrequency: number;      // multiplier on abiogenesis probability (setting)
  /** for moons: host planet */
  host?: { mass: number; radius: number; moonA: number; moonE: number; isGiant: boolean };
  /** nearby giant planets raise tidal/collisional activity */
  stellarFlux?: number;       // override W/m²
}

const MOLAR: Record<string, number> = { H2: 2.016, He: 4.003, CH4: 16.04, NH3: 17.03, H2O: 18.02, N2: 28.01, CO: 28.01, O2: 32.0, Ar: 39.95, CO2: 44.01, SO2: 64.07 };
// relative Rayleigh scattering cross-section per molecule (vs. Earth air)
const RAYLEIGH_REL: Record<string, number> = { H2: 0.22, He: 0.015, CH4: 2.2, NH3: 1.8, H2O: 0.75, N2: 1.07, CO: 1.2, O2: 0.86, Ar: 0.93, CO2: 2.45, SO2: 4.0 };

function clamp(x: number, a: number, b: number) { return x < a ? a : x > b ? b : x; }
function sstep(a: number, b: number, x: number) { const t = clamp((x - a) / (b - a), 0, 1); return t * t * (3 - 2 * t); }
function mixRGB(a: RGB, b: RGB, t: number): RGB { return [a[0] + (b[0] - a[0]) * t, a[1] + (b[1] - a[1]) * t, a[2] + (b[2] - a[2]) * t]; }
function scaleRGB(a: RGB, k: number): RGB { return [a[0] * k, a[1] * k, a[2] * k]; }
function srgb(r: number, g: number, b: number): RGB {
  const f = (c: number) => (c <= 0.04045 ? c / 12.92 : Math.pow((c + 0.055) / 1.055, 2.4));
  return [f(r), f(g), f(b)];
}
function jitter(rng: Rng, c: RGB, amt = 0.12): RGB {
  const k = 1 + rng.range(-amt, amt);
  return [clamp(c[0] * k * (1 + rng.range(-amt, amt) * 0.5), 0, 1), clamp(c[1] * k * (1 + rng.range(-amt, amt) * 0.5), 0, 1), clamp(c[2] * k * (1 + rng.range(-amt, amt) * 0.5), 0, 1)];
}

/** Boiling point of water (K) at pressure P (bar), Clausius–Clapeyron. */
function waterBoil(P: number) { return 1 / (1 / 373.15 - (8.314 / 40650) * Math.log(Math.max(P, 1e-4))); }

export interface PlanetOverrides {
  /** measured physical values that replace modelled ones before visuals are derived */
  physics?: Partial<PlanetPhysics>;
  atmosphere?: AtmosphereInfo | null;
  surface?: Partial<SurfaceParams>;
  palette?: Partial<SurfacePalette>;
  clouds?: Partial<CloudParams> | null;
  gasGiant?: Partial<GasGiantParams>;
  rings?: RingInfo | null;
}

export function generatePlanet(inp: PlanetInput, ov?: PlanetOverrides): PlanetPhysics {
  const rng = new Rng(inp.seed);
  const M = inp.mass;
  const Me = M / EARTH_MASS;
  const ageGyr = inp.starAge / 1e9;
  const flux = inp.stellarFlux ?? inp.starLum / (4 * Math.PI * inp.distance * inp.distance);
  const S = flux / 1361; // insolation relative to Earth

  // ---------- composition & bulk structure
  let iron = 0, silicate = 0, ice = 0, carbon = 0, gas = 0;
  let type: PlanetPhysics['type'];
  let R: number;
  const f = inp.formation;
  if (f === 'gas-giant') {
    type = 'gas-giant';
    gas = 0.9; ice = 0.05; silicate = 0.05;
    const mj = M / JUPITER_MASS;
    R = JUPITER_RADIUS * (mj < 1 ? Math.pow(mj, 0.11) * (mj < 0.3 ? 0.9 + 0.1 * mj / 0.3 : 1) : Math.pow(mj, -0.04));
    // hot Jupiter inflation
    if (S > 100) R *= 1 + 0.35 * sstep(100, 2000, S);
  } else if (f === 'ice-giant' || f === 'mini-neptune') {
    type = 'ice-giant';
    gas = f === 'mini-neptune' ? 0.05 : 0.15; ice = f === 'mini-neptune' ? 0.3 : 0.65; silicate = 1 - gas - ice;
    R = EARTH_RADIUS * (f === 'mini-neptune' ? 1.8 * Math.pow(Me / 5, 0.25) : 3.9 * Math.pow(Me / 15, 0.12));
  } else {
    type = f === 'asteroid' ? 'asteroid' : f === 'icy' ? 'icy' : 'rocky';
    if (inp.carbonRich) { carbon = rng.range(0.25, 0.55); }
    if (f === 'icy') { ice = rng.range(0.3, 0.6); iron = rng.range(0.05, 0.2); }
    else {
      // closer to the star → more refractory/iron-rich (Mercury); some iron worlds
      const closeness = clamp(Math.log10(0.4 / Math.max(inp.distance / AU / Math.sqrt(inp.starLum / SOLAR_LUMINOSITY), 0.01)), 0, 1);
      iron = clamp(0.25 + 0.3 * closeness + rng.normal(0, 0.07), 0.08, rng.chance(0.03) ? 0.8 : 0.65);
      ice = rng.chance(0.15) ? rng.range(0.02, 0.25) : rng.range(0, 0.02);
    }
    silicate = Math.max(0, 1 - iron - ice - carbon);
    // uncompressed density mixing, then self-compression with mass
    const rho0 = 1 / (iron / 7900 + silicate / 3300 + ice / 950 + carbon / 2600);
    const rho = rho0 * Math.pow(Math.max(Me, 1e-6), 0.18) * (Me < 0.01 ? 0.92 : 1);
    R = Math.cbrt((3 * M) / (4 * Math.PI * rho));
  }
  const density = M / ((4 / 3) * Math.PI * R ** 3);
  const g = (G * M) / (R * R);
  const vesc = Math.sqrt((2 * G * M) / R);

  // ---------- rotation & tidal locking
  // t_lock ≈ ω a⁶ I Q / (3 G m_p² k₂ R⁵)   (Gladman et al. 1996), I = 0.4 M R²
  const host = inp.host;
  const perturberMass = host ? host.mass : inp.starMass;
  const aOrb = host ? host.moonA : inp.distance;
  const omega0 = (2 * Math.PI) / (rng.range(8, 30) * 3600);
  const Q = type === 'gas-giant' || type === 'ice-giant' ? 1e5 : 100, k2 = type === 'gas-giant' ? 0.5 : 0.3;
  const tLock = (omega0 * aOrb ** 6 * 0.4 * M * R * R * Q) / (3 * G * perturberMass ** 2 * k2 * R ** 5) / (3.15576e7);
  const locked = tLock < inp.starAge || (inp.isMoon && rng.chance(0.9));

  // ---------- radiative balance
  let albedo = type === 'gas-giant' ? 0.35 : type === 'ice-giant' ? 0.3 : ice > 0.3 ? 0.55 : carbon > 0.2 ? 0.05 : 0.12;
  const Teq0 = (fl: number, A: number, redistribute: number) => Math.pow((fl * (1 - A)) / (redistribute * SIGMA_SB), 0.25);
  let Teq = Teq0(flux, albedo, 4);

  // ---------- volatile retention: Jeans parameter λ = v_esc² m / (2 k T_exo)
  // exospheric temperature boosted by stellar XUV (active M dwarfs, close-in orbits)
  const xuv = 1 + 6 * inp.starActivity * Math.min(S, 50) ** 0.5 + (inp.starIsRemnant ? 2 : 0);
  const Texo = Math.max(Teq, 50) * (1.5 + xuv);
  const retain = (gasName: string) => {
    const m = MOLAR[gasName] * AMU;
    const lam = (vesc * vesc * m) / (2 * K_B * Texo);
    return sstep(14, 32, lam);
  };

  // ---------- atmosphere
  let atmosphere: AtmosphereInfo | null = null;
  let Ts = Teq;
  let liquid: LiquidKind = 'none';
  let liquidCoverage = 0;
  let iceCoverage = 0;
  let waterInventory = 0; // 0..1 → ocean coverage potential
  const isGiant = type === 'gas-giant' || type === 'ice-giant';
  // internal heat & tidal heating (moons of giants with forced eccentricity → Io/Europa/Enceladus)
  let tidal = 0;
  if (host && host.isGiant) {
    const e = Math.max(host.moonE, 0.002);
    // heating ∝ M_host² R⁵ e² / a^7.5 (normalised so Io ≈ 1)
    const io = { M: 1.898e27, R: 1.8216e6, a: 4.217e8, e: 0.0041 };
    tidal = (host.mass / io.M) ** 2.5 * (R / io.R) ** 5 * (e / io.e) ** 2 * (io.a / host.moonA) ** 7.5;
    tidal = clamp(Math.log10(1 + tidal * 10) / 1.2, 0, 1.5);
  }
  const internalHeat = clamp(Math.pow(Me, 0.5) * Math.exp(-ageGyr / 6) * (type === 'icy' ? 0.5 : 1), 0, 2);
  let tectonics = 0, volcanism = 0;
  if (!isGiant && type !== 'asteroid') {
    volcanism = clamp(internalHeat * 0.6 + tidal * 0.9 + rng.range(-0.1, 0.15), 0, 1);
    tectonics = Me > 0.4 && Me < 6 ? clamp(internalHeat * 0.9 + rng.range(-0.4, 0.2), 0, 1) : 0;
  }

  if (isGiant) {
    const comp: Record<string, number> = type === 'gas-giant' ? { H2: 0.86, He: 0.135, CH4: 0.003, NH3: 0.0007 } : { H2: 0.8, He: 0.17, CH4: 0.03 };
    const mmm = Object.entries(comp).reduce((s, [k, v]) => s + v * MOLAR[k], 0);
    atmosphere = { pressure: 1, composition: comp, meanMolecularMass: mmm, scaleHeight: (K_B * Math.max(Teq, 60)) / (mmm * AMU * g), greenhouseK: 0, hazes: [] };
    Ts = Teq * 1.1 + (type === 'gas-giant' ? 15 : 5);
    albedo = type === 'gas-giant' ? (Teq < 200 ? 0.34 : Teq < 400 ? 0.8 : Teq < 900 ? 0.12 : 0.04) : 0.3;
  } else if (type !== 'asteroid') {
    // volatile inventory: wetter beyond the snow line, plus random delivery
    const snow = 2.7 * AU * Math.sqrt(inp.starLum / SOLAR_LUMINOSITY);
    const wet = clamp(ice * 3 + (inp.distance > snow * 0.7 ? 0.5 : 0) + rng.range(-0.2, 0.6), 0, 1);
    waterInventory = wet;
    const rN2 = retain('N2'), rCO2 = retain('CO2'), rH2O = retain('H2O'), rCH4 = retain('CH4');
    const outgas = clamp(0.3 + volcanism * 0.6 + rng.range(-0.25, 0.4), 0, 1.5);
    // base pressure scales with mass (gravity × inventory); log-normal scatter
    let P0 = Math.pow(Me, 1.3) * Math.exp(rng.normal(0, 1.4)) * outgas;
    P0 *= Math.max(rN2, rCO2 * 0.8);
    const comp: Record<string, number> = {};
    const hazes: string[] = [];
    const teqNoGH = Teq;
    if (P0 < 2e-4) {
      P0 = 0;
    } else if (teqNoGH > 320 && rCO2 > 0.4 && rng.chance(0.85)) {
      // runaway greenhouse: water lost, thick CO₂
      P0 = Math.max(P0, 1) * rng.logUniform(5, 100) * Math.min(Me, 2);
      comp.CO2 = 0.965; comp.N2 = 0.033; comp.SO2 = 0.00015;
      waterInventory = 0;
      hazes.push('sulfuric acid');
    } else if (teqNoGH < 130 && rCH4 > 0.3 && rN2 > 0.3) {
      // Titan/Triton class: cold N₂ with methane, tholin haze. Icy bodies carry
      // large N₂/CH₄ ice inventories, so thick cold atmospheres are possible.
      if (ice > 0.25 && rng.chance(0.3)) P0 *= rng.logUniform(30, 600);
      P0 = clamp(P0, 0, 6);
      comp.N2 = 0.95; comp.CH4 = rng.range(0.015, 0.06); comp.Ar = 0.001;
      if (P0 > 0.05) hazes.push('tholin');
      if (P0 < 0.01) P0 = rng.chance(0.4) ? rng.logUniform(1e-5, 2e-4) : 0; // collapsed frosts
    } else {
      comp.N2 = rng.range(0.6, 0.95);
      comp.CO2 = rCO2 * (wet > 0.3 ? rng.logUniform(2e-4, 0.05) : rng.range(0.02, 0.95));
      comp.Ar = 0.01;
      if (rH2O > 0.3 && wet > 0.2) comp.H2O = 0.01;
      if (comp.CO2 > 0.5) comp.N2 = Math.max(0.03, 1 - comp.CO2);
      if (S < 0.6 && wet < 0.4 && rng.chance(0.5)) hazes.push('dust');
      if (wet < 0.25 && P0 < 0.2) hazes.push('dust');
    }
    if (P0 > 0) {
      const tot = Object.values(comp).reduce((a, b) => a + b, 0);
      for (const k of Object.keys(comp)) comp[k] /= tot;
      const mmm = Object.entries(comp).reduce((s, [k, v]) => s + v * MOLAR[k], 0);
      atmosphere = { pressure: P0, composition: comp, meanMolecularMass: mmm, scaleHeight: 0, greenhouseK: 0, hazes };
    }
    // greenhouse: Ts = Teq (1 + 0.75 τ)^¼ ; τ fitted to Venus/Earth/Mars, water-vapour feedback
    const radiate = (A: number) => (locked && (!atmosphere || atmosphere.pressure < 0.3) ? 2 : 4);
    let tau = 0;
    for (let it = 0; it < 6; it++) {
      albedo = clamp(albedo, 0.03, 0.9);
      Teq = Teq0(flux, albedo, radiate(albedo));
      if (atmosphere) {
        const c = atmosphere.composition;
        const Pt = atmosphere.pressure;
        tau = 3.6 * Math.pow(Pt * (c.CO2 ?? 0), 0.82) + 2 * Math.sqrt(Pt * (c.CH4 ?? 0)) + 0.3 * Math.sqrt(Pt);
        if (waterInventory > 0.2 && Ts > 250 && Ts < 400) tau += 0.55 * Math.sqrt(Pt) * Math.exp((Ts - 288) / 25);
        if (atmosphere.hazes.includes('tholin')) tau *= 0.6; // anti-greenhouse haze
      }
      Ts = Teq * Math.pow(1 + 0.75 * tau, 0.25);
      // albedo feedback: ice, clouds
      if (atmosphere?.hazes.includes('sulfuric acid')) albedo = 0.75;
      else if (Ts < 260 && waterInventory > 0.3) albedo = 0.5;
      else if (atmosphere && waterInventory > 0.3) albedo = 0.3;
    }
    if (atmosphere) {
      atmosphere.greenhouseK = Ts - Teq;
      atmosphere.scaleHeight = (K_B * Ts) / (atmosphere.meanMolecularMass * AMU * g);
    }
    // ---------- liquids (phase limits)
    const Pl = atmosphere?.pressure ?? 0;
    if (Ts > 1150) {
      liquid = 'lava';
      liquidCoverage = clamp(0.4 + (Ts - 1150) / 800, 0.4, 0.95);
    } else if (waterInventory > 0.05 && Pl > 0.0061 && Ts > 273 && Ts < waterBoil(Pl)) {
      liquid = 'water';
      liquidCoverage = clamp(waterInventory * 1.15 - 0.05 + rng.range(-0.15, 0.15), 0.02, 1);
      if (waterInventory > 0.9 && rng.chance(0.5)) liquidCoverage = 1; // ocean world
    } else if (atmosphere?.composition.CH4 && Ts > 88 && Ts < 190 && Pl > 0.1) {
      // methane/ethane lakes over a water-ice crust (Titan)
      liquid = 'methane';
      liquidCoverage = rng.range(0.01, 0.12) * (Pl > 1 ? 1.5 : 1);
      iceCoverage = clamp(waterInventory, 0, 1);
    } else if (Pl > 0.03 && Ts > 64 && Ts < 77 && rng.chance(0.3)) {
      liquid = 'nitrogen';
      liquidCoverage = rng.range(0.01, 0.05);
      iceCoverage = clamp(waterInventory, 0, 1);
    } else if (waterInventory > 0.1 && Ts <= 273) {
      iceCoverage = clamp(waterInventory + (Ts < 230 ? 0.3 : 0), 0, 1);
      if (Pl > 0.0061 && Ts > 252 && rng.chance(0.5)) { liquid = 'brine'; liquidCoverage = rng.range(0.01, 0.06); }
    }
    if (type === 'icy') iceCoverage = Math.max(iceCoverage, Ts < 200 ? 0.9 : 0.4);
  }

  // ---------- surface age & magnetism & radiation
  const surfaceAge = clamp(ageGyr * (1 - clamp(volcanism * 0.9 + tectonics * 0.5 + (liquid === 'water' ? 0.3 : 0), 0, 0.97)) + rng.range(0, 0.2), 0.01, ageGyr);
  let magneticField = 0;
  if (isGiant) magneticField = rng.logUniform(20, 20000);
  else if (iron > 0.2 && Me > 0.3) magneticField = clamp(Math.pow(Me, 0.6) * (1.5 - ageGyr / 10) * (locked ? 0.15 : 1) * rng.range(0.4, 1.4), 0, 5);
  const P = atmosphere?.pressure ?? 0;
  const shielding = (1 + Math.min(P, 10) * 4) * (1 + magneticField * 3);
  const radiation = clamp((S * (0.3 + inp.starActivity * 3) * 4 + (host?.isGiant ? 30 * Math.pow(Math.max(0, 1 - host.moonA / (25 * host.radius)), 2) : 0)) / shielding, 0, 1e4);

  // ---------- life (rare by construction)
  const life: LifeInfo = { kind: 'none', biochemistry: '—', pigment: '—', coverage: 0, bioluminescence: 0, oxygenated: false, fossil: false, notes: 'No biosignatures detected.' };
  const anomalies: string[] = [];
  const habitable = liquid === 'water' && Ts > 255 && Ts < 335 && P > 0.05 && P < 60 && radiation < 30;
  if (habitable && ageGyr > 0.6 && rng.next() < 0.22 * inp.lifeFrequency) {
    const complexChance = clamp((ageGyr - 1.5) / 3, 0, 1) * 0.35;
    life.kind = rng.next() < complexChance ? 'complex' : rng.next() < 0.35 ? 'simple' : 'microbial';
    life.biochemistry = 'water / carbon';
    life.oxygenated = life.kind !== 'microbial' || rng.chance(0.3);
    const T = inp.starTemp;
    life.pigment = T < 3800 ? 'near-black (broadband absorber, red-dwarf light)' : T < 5000 ? 'red–orange (K-dwarf optimised)' : T < 6200 ? 'green (chlorophyll-like)' : 'blue–violet reflecting (F-star UV/blue rich)';
    life.coverage = life.kind === 'microbial' ? rng.range(0.05, 0.3) : life.kind === 'simple' ? rng.range(0.2, 0.6) : rng.range(0.4, 0.95);
    life.bioluminescence = rng.chance(T < 4000 ? 0.5 : 0.15) ? rng.range(0.3, 1) : 0;
    life.notes = life.kind === 'microbial' ? 'Microbial mats tint shallow seas and wet lowlands.' : life.kind === 'simple' ? 'Colonial organisms and low ground cover.' : 'Complex multicellular ecosystems with mobile fauna.';
    if (life.oxygenated && atmosphere) {
      atmosphere.composition.O2 = life.kind === 'complex' ? rng.range(0.12, 0.3) : rng.range(0.005, 0.05);
      const tot = Object.values(atmosphere.composition).reduce((a, b) => a + b, 0);
      for (const k of Object.keys(atmosphere.composition)) atmosphere.composition[k] /= tot;
    }
  } else if (liquid === 'methane' && rng.next() < 0.02 * inp.lifeFrequency) {
    life.kind = 'microbial';
    life.biochemistry = 'methane / azotosome (speculative)';
    life.pigment = 'none (chemotrophic)';
    life.coverage = 0.05;
    life.notes = 'SPECULATIVE: hypothetical non-water biochemistry in hydrocarbon seas.';
  } else if (type === 'icy' && tidal > 0.3 && rng.next() < 0.05 * inp.lifeFrequency) {
    life.kind = 'microbial';
    life.biochemistry = 'water / carbon (subsurface ocean)';
    life.pigment = 'none (chemotrophic, vent-based)';
    life.notes = 'Biosignatures in plume material from a subsurface ocean.';
  }
  if (life.kind === 'none' && P > 0.001 && P < 0.5 && !isGiant && waterInventory > 0.2 && Ts < 273 && Me < 0.6 && rng.next() < 0.06 * inp.lifeFrequency) {
    life.fossil = true;
    life.notes = 'Fossilised microbial structures in ancient sediments: an extinct biosphere.';
    anomalies.push('Fossil biosignatures');
  }
  if (type === 'icy' && tidal > 0.2) anomalies.push('Subsurface ocean (inferred from induced magnetic field)');
  if (rng.chance(0.015)) anomalies.push('Exceptionally large impact basin');
  if (rng.chance(0.01) && !isGiant) anomalies.push('Natural geomagnetic anomaly');
  if (rng.chance(0.008) && !isGiant) anomalies.push('Extensive subsurface lava-tube network');

  // ---------- classification label
  const label = classify(type, Me, Ts, P, liquid, liquidCoverage, iceCoverage, carbon, iron, locked, life, S, volcanism, inp, R);

  const phys: PlanetPhysics = {
    type, classLabel: label, mass: M, radius: R, density, gravity: g, escapeVelocity: vesc,
    composition: { iron, silicate, ice, carbon, gas }, albedo, tempEq: Teq, tempMean: Ts,
    tempMin: 0, tempMax: 0, atmosphere, liquid, liquidCoverage, iceCoverage, tectonics, volcanism,
    surfaceAge, magneticField, radiation, tidallyLocked: locked, life, anomalies,
  };
  // day/night & latitudinal spread: thin atmospheres → extreme contrasts
  const damp = atmosphere ? clamp(Math.log10(1 + P * 10) / 2.2, 0, 1) : 0;
  const spread = (locked ? 0.6 : 0.3) * (1 - damp * 0.85);
  phys.tempMax = Ts * (1 + spread * (locked ? 0.4 : 0.35));
  phys.tempMin = Ts * (1 - spread * (locked ? 0.9 : 0.6));

  if (ov) {
    if (ov.physics) Object.assign(phys, ov.physics);
    if (ov.atmosphere !== undefined) phys.atmosphere = ov.atmosphere;
  }
  // visuals are derived from the (possibly catalogue-overridden) physical state
  const Rf = phys.radius, gf = phys.gravity, Tf = phys.tempMean, atmf = phys.atmosphere, lockf = phys.tidallyLocked;
  if (isGiant) {
    phys.gasGiant = { ...gasGiantParams(rng, type, phys.tempEq, inp), ...(ov?.gasGiant ?? {}) };
    phys.atmosphereRender = giantAtmosphere(Rf, atmf!, gf, phys.tempEq, phys.gasGiant);
  } else if (type !== 'asteroid' || Rf > 2e5) {
    phys.surface = surfaceParams(rng, phys, inp, tidal, Rf, gf, Tf, lockf);
    if (atmf && atmf.pressure > 0.0005) {
      phys.atmosphereRender = rockyAtmosphere(Rf, atmf, Tf, phys, rng);
      phys.clouds = cloudParams(rng, phys);
    }
  } else {
    phys.surface = surfaceParams(rng, phys, inp, tidal, Rf, gf, Tf, lockf);
  }
  // rings: common and faint around giants; bright icy rings rarer
  if (isGiant && rng.chance(type === 'ice-giant' ? 0.6 : 0.35)) phys.rings = ringParams(rng, R, type, Teq);
  else if (!isGiant && R > 1.5e6 && rng.chance(0.015)) phys.rings = ringParams(rng, R, 'rocky', Teq);
  if (ov) {
    if (ov.rings !== undefined) phys.rings = ov.rings ?? undefined;
    if (phys.surface && (ov.surface || ov.palette)) {
      phys.surface = { ...phys.surface, ...(ov.surface ?? {}), palette: { ...phys.surface.palette, ...(ov.palette ?? {}) } };
    }
    if (ov.clouds === null) phys.clouds = undefined;
    else if (ov.clouds && phys.atmosphereRender) phys.clouds = { ...(phys.clouds ?? cloudParams(rng, phys) ?? defaultClouds()), ...ov.clouds };
  }
  return phys;
}

function classify(type: PlanetPhysics['type'], Me: number, Ts: number, P: number, liquid: LiquidKind, lc: number, ic: number,
  carbon: number, iron: number, locked: boolean, life: LifeInfo, S: number, volc: number, inp: PlanetInput, R: number): string {
  if (type === 'gas-giant') return S > 100 ? (Ts > 1500 ? 'Ultra-hot Jupiter' : 'Hot Jupiter') : Ts > 300 ? 'Warm gas giant' : Me > 3000 ? 'Super-Jupiter' : 'Gas giant';
  if (type === 'ice-giant') return Me < 8 ? 'Mini-Neptune' : 'Ice giant';
  if (type === 'asteroid') return 'Minor body';
  const size = Me < 0.01 ? 'Dwarf' : Me < 0.3 ? 'Small' : Me > 3 ? 'Super-' : '';
  let base: string;
  if (liquid === 'lava') base = 'lava world';
  else if (carbon > 0.25) base = 'carbon world';
  else if (iron > 0.6) base = 'iron world';
  else if (P > 20 && Ts > 500) base = 'greenhouse world';
  else if (liquid === 'water' && lc > 0.97) base = 'ocean world';
  else if (liquid === 'water') base = life.kind === 'complex' || life.kind === 'simple' ? 'living world' : lc > 0.5 ? 'terra' : 'arid terra';
  else if (liquid === 'methane') base = 'hydrocarbon-lake world';
  else if ((ic > 0.6 || type === 'icy') && volc > 0.6 && inp.host?.isGiant) base = 'cryovolcanic ice moon';
  else if (ic > 0.6 || type === 'icy') base = 'ice world';
  else if (volc > 0.85 && inp.host?.isGiant) base = 'volcanic moon';
  else if (P > 0.003) base = Ts < 260 ? 'cold desert' : 'desert';
  else base = 'barren rock';
  if (locked && !inp.isMoon && P > 0.05 && Ts < 400 && Ts > 200) base = base.replace('terra', 'eyeball terra');
  const s = (size === 'Super-' ? 'Super-' + base : (size ? size + ' ' + base : base[0].toUpperCase() + base.slice(1)));
  return R > 0 ? s : s;
}

// ------------------------------------------------------------------ surface
function surfaceParams(rng: Rng, p: PlanetPhysics, inp: PlanetInput, tidal: number, R: number, g: number, Ts: number, locked: boolean): SurfaceParams {
  const atm = p.atmosphere;
  const P = atm?.pressure ?? 0;
  const icy = p.type === 'icy' || p.composition.ice > 0.3;
  const wetHistory = p.liquid === 'water' || p.liquid === 'brine' || (P > 0.003 && p.iceCoverage > 0.2) || p.life.fossil;
  const rigidity = icy ? 0.55 : 1;
  const reliefScale = clamp(8500 * Math.pow(9.81 / g, 0.8) * rigidity * rng.range(0.7, 1.3), 400, 26000);
  const airless = P < 0.001;
  const erosion = clamp((p.liquid === 'water' ? 0.75 : 0) + (wetHistory ? 0.3 : 0) + Math.min(P, 5) * 0.08, 0, 1);
  const ageFrac = clamp(p.surfaceAge / 4.5, 0, 1);
  const craters = clamp((airless ? 0.9 : 0.6 - Math.min(P, 10) * 0.05) * Math.pow(ageFrac, 0.6) * (1 - erosion * 0.7), 0, 0.95);
  const minCraterRadius = airless ? 0.5 : 20 * Math.pow(Math.max(P, 0.001), 0.9) + 2;
  const lavaWorld = p.liquid === 'lava';
  const pal = palette(rng, p, inp, Ts, icy);
  const substellar: [number, number, number] = [1, 0, 0];
  const tempEq = p.tempMax * (locked ? 1 : 0.97);
  const tempPole = locked ? p.tempMin : p.tempMin * 1.05;
  const life = p.life;
  const vegetation = life.kind === 'complex' ? life.coverage : life.kind === 'simple' ? life.coverage * 0.6 : life.kind === 'microbial' && life.biochemistry.startsWith('water') ? life.coverage * 0.25 : 0;
  // small bodies are irregular: relief becomes a large fraction of the radius
  const irregular = R < 3.5e5;
  return {
    seed: (inp.seed * 7919) >>> 0,
    radius: R,
    reliefScale: irregular ? R * rng.range(0.1, 0.22) : reliefScale,
    oceanFraction: p.liquidCoverage,
    liquid: p.liquid,
    bimodal: p.tectonics > 0.3 && p.liquid === 'water' ? rng.range(0.55, 0.9) : rng.range(0, 0.3),
    dichotomy: rng.chance(0.25) && !icy ? rng.range(0.3, 1) : 0,
    continentFreq: irregular ? rng.range(0.6, 1.1) : rng.range(1.1, 2.4),
    plates: p.tectonics > 0.2 ? clamp(p.tectonics * rng.range(0.7, 1.1), 0, 1) : (rng.chance(0.25) ? rng.range(0.1, 0.4) : 0),
    plateFreq: rng.range(1.0, 2.2),
    mountains: clamp(p.volcanism * 0.3 + rng.range(0, 0.45) + (p.tectonics > 0 ? 0.2 : 0), 0, 1),
    hills: clamp(rng.range(0.35, 0.9) * (icy ? 0.6 : 1), 0, 1),
    erosion,
    roughness: rng.range(0.7, 1.2) * (icy ? 0.75 : 1),
    craters,
    craterDegradation: clamp(0.25 + erosion * 0.6 + (1 - ageFrac) * 0.2 + rng.range(-0.1, 0.1), 0.05, 1),
    minCraterRadius,
    volcanoes: clamp(p.volcanism * rng.range(0.6, 1.2) + (lavaWorld ? 0.4 : 0) + (rng.chance(0.2) ? 0.3 : 0), 0, 1),
    dunes: !airless && p.liquidCoverage < 0.5 && P < 30 ? clamp((1 - p.liquidCoverage) * rng.range(0.2, 1) * (P > 0.004 ? 1 : 0), 0, 1) : 0,
    canyons: !icy && (wetHistory || p.tectonics > 0.1 || rng.chance(0.2)) ? rng.range(0, 0.8) : icy && tidal > 0.3 ? rng.range(0, 0.4) : 0,
    terraces: wetHistory && P > 0.003 ? rng.range(0, 0.7) : 0,
    iceCracks: icy ? clamp(tidal * 0.9 + rng.range(0, 0.4), 0, 1) : 0,
    maria: airless && !icy && p.volcanism < 0.5 && p.surfaceAge > 1.5 ? rng.range(0.3, 1) : 0,
    rivers: p.liquid === 'water' || p.liquid === 'methane' ? rng.range(0.3, 1) : 0,
    tempEquator: tempEq,
    tempPole,
    lapseRate: atm ? clamp(g / 1000, 0.0005, 0.03) * (P > 0.05 ? 1 : 0.2) : 0,
    moisture: p.liquid === 'water' ? clamp(0.35 + p.liquidCoverage * 0.6, 0, 1) : p.iceCoverage > 0 ? 0.25 : p.liquid !== 'none' ? 0.3 : 0.02,
    iceCap: p.iceCoverage * 0.6 + (p.liquid === 'water' ? 0.05 : 0),
    tidallyLocked: locked && !inp.isMoon,
    substellar,
    vegetation,
    lifeGlow: life.bioluminescence,
    lavaGlow: lavaWorld ? 1 : icy ? 0 : clamp(p.volcanism * 1.3 - 0.3, 0, 1),
    palette: pal,
  };
}

function palette(rng: Rng, p: PlanetPhysics, inp: PlanetInput, Ts: number, icy: boolean): SurfacePalette {
  const atm = p.atmosphere;
  const oxidizing = !!atm && ((atm.composition.O2 ?? 0) > 0.01 || ((atm.composition.CO2 ?? 0) > 0.5 && p.composition.iron > 0.25));
  const basalt = srgb(0.17, 0.165, 0.16), basaltBrown = srgb(0.24, 0.2, 0.17);
  let rockA: RGB = basalt, rockB: RGB = basaltBrown, regolith: RGB = srgb(0.36, 0.34, 0.32), sand: RGB = srgb(0.62, 0.52, 0.38);
  let highland: RGB = srgb(0.62, 0.6, 0.57), lowland: RGB = srgb(0.16, 0.15, 0.14);
  let ice: RGB = srgb(0.92, 0.94, 0.97);
  let lineae: RGB = srgb(0.55, 0.36, 0.25);
  const iron = p.composition.iron;
  const carbon = p.composition.carbon;
  if (carbon > 0.2) {
    rockA = srgb(0.07, 0.07, 0.075); rockB = srgb(0.11, 0.105, 0.1); regolith = srgb(0.09, 0.085, 0.08); sand = srgb(0.14, 0.13, 0.12);
    highland = srgb(0.2, 0.2, 0.22); lowland = srgb(0.05, 0.05, 0.055);
  } else if (icy) {
    const dirty = rng.range(0, 1);
    rockA = mixRGB(srgb(0.85, 0.87, 0.9), srgb(0.55, 0.5, 0.46), dirty * 0.6);
    rockB = mixRGB(srgb(0.75, 0.8, 0.86), srgb(0.45, 0.42, 0.4), dirty * 0.7);
    regolith = mixRGB(srgb(0.8, 0.82, 0.85), srgb(0.5, 0.47, 0.44), dirty);
    sand = regolith;
    highland = srgb(0.93, 0.94, 0.96);
    lowland = mixRGB(srgb(0.6, 0.6, 0.62), srgb(0.35, 0.3, 0.26), dirty);
    lineae = rng.chance(0.6) ? srgb(0.55, 0.32, 0.2) : srgb(0.38, 0.33, 0.3);
    if (atm?.hazes.includes('tholin') || (Ts < 80 && rng.chance(0.5))) {
      // tholin-stained ices (Pluto/Titan/Triton)
      const t = srgb(0.7, 0.45, 0.28);
      rockA = mixRGB(rockA, t, 0.5); regolith = mixRGB(regolith, t, 0.6); lowland = mixRGB(lowland, srgb(0.35, 0.18, 0.1), 0.7);
      sand = mixRGB(sand, srgb(0.4, 0.28, 0.18), 0.7);
    }
  } else if (p.volcanism > 0.8 && inp.host?.isGiant) {
    // sulfur volcanism (Io): yellow, orange, white SO₂ frost, black silicate
    rockA = srgb(0.75, 0.62, 0.25); rockB = srgb(0.62, 0.42, 0.18); regolith = srgb(0.85, 0.78, 0.45); sand = srgb(0.8, 0.7, 0.4);
    highland = srgb(0.9, 0.88, 0.75); lowland = srgb(0.12, 0.1, 0.08);
  } else if (p.liquid === 'water' || p.life.kind !== 'none') {
    // weathered continental crust
    rockA = mixRGB(srgb(0.32, 0.29, 0.26), srgb(0.25, 0.24, 0.24), rng.next());
    rockB = srgb(0.4, 0.34, 0.28);
    regolith = srgb(0.38, 0.3, 0.22);
    sand = rng.chance(0.25) ? srgb(0.85, 0.82, 0.74) : srgb(0.76, 0.64, 0.46);
    highland = srgb(0.55, 0.52, 0.48); lowland = srgb(0.2, 0.19, 0.17);
  } else if (oxidizing || (iron > 0.28 && (p.life.fossil || p.iceCoverage > 0.2 || rng.chance(0.4)))) {
    // iron oxides (Mars-like rust)
    const h = rng.range(0, 1);
    rockA = mixRGB(srgb(0.32, 0.22, 0.17), srgb(0.25, 0.2, 0.18), h);
    rockB = srgb(0.45, 0.28, 0.18);
    regolith = mixRGB(srgb(0.62, 0.36, 0.2), srgb(0.55, 0.4, 0.3), h * 0.5);
    sand = mixRGB(srgb(0.66, 0.42, 0.24), srgb(0.72, 0.55, 0.38), h);
    highland = srgb(0.7, 0.52, 0.38); lowland = srgb(0.22, 0.16, 0.13);
  } else if (iron > 0.55) {
    rockA = srgb(0.3, 0.3, 0.32); rockB = srgb(0.38, 0.36, 0.35); regolith = srgb(0.35, 0.34, 0.34); sand = srgb(0.4, 0.38, 0.36);
  } else if (!atm) {
    // airless silicate: space-weathered grey regolith, anorthosite highlands, basaltic maria
    const warm = rng.range(-0.04, 0.06);
    regolith = srgb(0.42 + warm, 0.4, 0.38 - warm);
    rockA = srgb(0.3 + warm, 0.29, 0.28 - warm);
    rockB = srgb(0.38, 0.37, 0.36);
    highland = srgb(0.62, 0.6, 0.58);
    lowland = srgb(0.17, 0.165, 0.16);
    sand = regolith;
  } else {
    // generic desert worlds: many hues from mineralogy
    const pick = rng.int(0, 4);
    const sands: RGB[] = [srgb(0.74, 0.62, 0.44), srgb(0.6, 0.6, 0.58), srgb(0.55, 0.45, 0.4), srgb(0.78, 0.72, 0.6), srgb(0.36, 0.33, 0.32)];
    sand = sands[pick];
    regolith = mixRGB(sand, srgb(0.4, 0.38, 0.35), 0.4);
    rockA = mixRGB(srgb(0.28, 0.26, 0.24), sand, 0.25);
  }
  if (p.liquid === 'lava') {
    rockA = srgb(0.08, 0.075, 0.07); rockB = srgb(0.13, 0.11, 0.1); regolith = srgb(0.12, 0.11, 0.1); sand = srgb(0.1, 0.09, 0.09);
    lowland = srgb(0.05, 0.045, 0.04);
  }
  // atmospheric chemistry stains (Venus-like sulfur compounds)
  if (atm?.hazes.includes('sulfuric acid')) {
    rockA = mixRGB(rockA, srgb(0.35, 0.3, 0.22), 0.4);
    regolith = mixRGB(regolith, srgb(0.45, 0.38, 0.25), 0.4);
  }
  // vegetation pigment follows the star's spectrum (Kiang et al. 2007)
  const T = inp.starTemp;
  let veg1: RGB, veg2: RGB;
  if (T < 3800) { veg1 = srgb(0.06, 0.05, 0.07); veg2 = srgb(0.16, 0.08, 0.2); }
  else if (T < 5000) { veg1 = srgb(0.36, 0.14, 0.06); veg2 = srgb(0.55, 0.3, 0.08); }
  else if (T < 6200) { veg1 = srgb(0.12, 0.24, 0.08); veg2 = srgb(0.28, 0.32, 0.1); }
  else { veg1 = srgb(0.12, 0.22, 0.38); veg2 = srgb(0.38, 0.3, 0.12); }
  veg1 = jitter(rng, veg1, 0.2); veg2 = jitter(rng, veg2, 0.2);
  if (p.life.bioluminescence > 0) veg2 = mixRGB(veg2, srgb(0.2, 0.9, 0.8), 0.5);
  // liquids
  let liquidShallow: RGB = srgb(0.1, 0.35, 0.38), liquidDeep: RGB = srgb(0.01, 0.05, 0.12);
  switch (p.liquid) {
    case 'water':
      if (p.life.kind === 'microbial' && rng.chance(0.4)) { liquidShallow = srgb(0.25, 0.32, 0.12); liquidDeep = srgb(0.04, 0.08, 0.06); }
      else if (rng.chance(0.15)) { liquidShallow = srgb(0.3, 0.42, 0.35); liquidDeep = srgb(0.03, 0.08, 0.1); }
      break;
    case 'brine': liquidShallow = srgb(0.25, 0.22, 0.18); liquidDeep = srgb(0.08, 0.07, 0.06); break;
    case 'methane': liquidShallow = srgb(0.22, 0.14, 0.06); liquidDeep = srgb(0.04, 0.025, 0.015); break;
    case 'nitrogen': liquidShallow = srgb(0.5, 0.55, 0.6); liquidDeep = srgb(0.15, 0.17, 0.22); break;
    case 'lava': liquidShallow = srgb(0.1, 0.03, 0.02); liquidDeep = srgb(0.05, 0.015, 0.01); break;
    case 'sulfur': liquidShallow = srgb(0.35, 0.12, 0.05); liquidDeep = srgb(0.15, 0.05, 0.02); break;
  }
  return {
    rockA: jitter(rng, rockA), rockB: jitter(rng, rockB), regolith: jitter(rng, regolith), sand: jitter(rng, sand),
    highland: jitter(rng, highland), lowland: jitter(rng, lowland), ice: jitter(rng, ice, 0.03), veg1, veg2,
    liquidShallow, liquidDeep, lineae,
  };
}

// ------------------------------------------------------------------ atmosphere optics
function rockyAtmosphere(R: number, a: AtmosphereInfo, Ts: number, p: PlanetPhysics, rng: Rng): AtmosphereParams {
  const P = a.pressure;
  const H = clamp(a.scaleHeight, 2000, 120000);
  // number density relative to Earth sea level, cross-section weighted by composition
  const nRel = (P / 1.0) * (288 / Math.max(Ts, 40));
  let xs = 0;
  for (const [k, v] of Object.entries(a.composition)) xs += v * (RAYLEIGH_REL[k] ?? 1);
  const k = nRel * xs;
  const ray: [number, number, number] = [5.802e-6 * k, 13.558e-6 * k, 33.1e-6 * k];
  // aerosols
  let mieS = 3.0e-6 * Math.sqrt(P), mieAbs: [number, number, number] = [0.3e-6, 0.3e-6, 0.3e-6];
  // single-scattering albedo per channel (coloured aerosols scatter coloured light)
  let ssa: [number, number, number] = [0.9, 0.9, 0.9];
  let mieH = Math.min(1500, H * 0.2), g = 0.8;
  const absorb: [number, number, number] = [0, 0, 0];
  let absCenter = -1, absWidth = H;
  const hz = a.hazes;
  if (hz.includes('dust')) {
    // iron-oxide dust absorbs blue: butterscotch skies, blue sunsets (Mars)
    const tauDust = rng.range(0.15, 0.5);
    const Hd = H;
    mieS = tauDust / Hd;
    ssa = [0.97, 0.8, 0.55];
    mieAbs = [0, 0, 0];
    mieH = Hd; g = 0.65;
  }
  if (hz.includes('sulfuric acid')) {
    // thick bright acid haze: yellowish (UV/blue absorber)
    mieS = 6e-5 * Math.min(P, 100) / 10;
    ssa = [0.99, 0.97, 0.85];
    mieAbs = [0, 0, 0];
    mieH = H * 0.8; g = 0.72;
  }
  if (hz.includes('tholin')) {
    // organic haze: strong blue absorption → orange sky
    const tau = Math.min(P, 5) * rng.range(1.5, 4);
    mieS = tau / (H * 1.2);
    ssa = [0.92, 0.65, 0.3];
    mieAbs = [0, 0, 0];
    mieH = H * 1.2; g = 0.6;
  }
  const o2 = a.composition.O2 ?? 0;
  if (o2 > 0.01) {
    // ozone layer from photolysed O₂ (Chappuis band)
    const s = Math.min(1.5, o2 / 0.21);
    absorb[0] = 0.65e-6 * s; absorb[1] = 1.881e-6 * s; absorb[2] = 0.085e-6 * s;
    absCenter = 25000 * (H / 8500); absWidth = 15000 * (H / 8500);
  }
  const ch4 = a.composition.CH4 ?? 0;
  if (ch4 > 0.005) {
    // methane absorbs red/near-IR
    const s = ch4 * nRel;
    absorb[0] += 4e-6 * s; absorb[1] += 0.6e-6 * s; absorb[2] += 0.05e-6 * s;
    absCenter = -1; absWidth = H;
  }
  // top: where pressure drops ~10⁻⁶ relative or ~12 scale heights (and cap thickness)
  const top = R + Math.min(H * 12, R * 0.35);
  const ga = clamp(p.albedo, 0.05, 0.8);
  return {
    bottomRadius: R, topRadius: top, rayleigh: ray, rayleighH: H,
    mieScat: [mieS * ssa[0], mieS * ssa[1], mieS * ssa[2]], mieExt: [mieS + mieAbs[0], mieS + mieAbs[1], mieS + mieAbs[2]], mieH, mieG: g,
    absorb, absCenter, absWidth, groundAlbedo: [ga, ga, ga],
  };
}

function giantAtmosphere(R: number, a: AtmosphereInfo, g: number, Teq: number, gg: GasGiantParams): AtmosphereParams {
  const H = clamp(a.scaleHeight, 8000, 400000);
  // only the thin, cold gas above the visible cloud deck scatters (vertical τ_blue ≈ 0.05)
  const k = 0.05;
  const ch4 = a.composition.CH4 ?? 0;
  const ab: [number, number, number] = [ch4 * 2.5e-5, ch4 * 4e-6, ch4 * 2e-7];
  const hz = gg.haze;
  const ms = 0.6e-6 * (1 + hz * 4);
  // stratospheric haze tinted by its absorber (photochemical hydrocarbons absorb blue)
  const hc = gg.hazeColor;
  const abs = [(1 - hc[0]) * 0.6, (1 - hc[1]) * 0.6, (1 - hc[2]) * 0.6];
  return {
    bottomRadius: R, topRadius: R + H * 10,
    rayleigh: [5.8e-6 * k, 13.5e-6 * k, 33.1e-6 * k], rayleighH: H,
    mieScat: [ms, ms, ms], mieExt: [ms * (1 + abs[0]), ms * (1 + abs[1]), ms * (1 + abs[2])], mieH: H * 0.8, mieG: 0.7,
    absorb: ab, absCenter: -1, absWidth: H, groundAlbedo: [0.4, 0.4, 0.4],
  };
}

function defaultClouds(): CloudParams {
  return { bottom: 2000, top: 8000, coverage: 0.4, density: 0.03, scale: 7000, albedo: [0.95, 0.95, 0.95], windSpeed: 20, seed: 1, storminess: 0.4, bands: 0.1, overcast: 0 };
}

function cloudParams(rng: Rng, p: PlanetPhysics): CloudParams | undefined {
  const a = p.atmosphere!;
  const P = a.pressure;
  const H = a.scaleHeight;
  if (a.hazes.includes('sulfuric acid')) {
    return { bottom: 45000 * (H / 15900), top: 70000 * (H / 15900), coverage: 1, density: 0.004, scale: 40000, albedo: [0.92, 0.86, 0.68],
      windSpeed: 100, seed: rng.int(0, 1e6), storminess: 0.1, bands: 0.6, overcast: 1 };
  }
  if (p.liquid === 'water' || (p.iceCoverage > 0.3 && P > 0.05)) {
    const cov = clamp(0.25 + p.liquidCoverage * 0.4 + rng.range(-0.15, 0.2), 0.08, 0.9);
    return { bottom: clamp(H * 0.18, 600, 8000), top: clamp(H * 0.85, 4000, 30000), coverage: cov, density: 0.03, scale: 6000 * (H / 8500),
      albedo: [0.96, 0.96, 0.96], windSpeed: rng.range(10, 40), seed: rng.int(0, 1e6), storminess: rng.range(0.2, 0.8), bands: rng.range(0, 0.25), overcast: 0 };
  }
  if (p.liquid === 'methane' && P > 0.5) {
    return { bottom: 15000, top: 30000, coverage: 0.12, density: 0.004, scale: 30000, albedo: [0.9, 0.85, 0.75],
      windSpeed: 5, seed: rng.int(0, 1e6), storminess: 0.1, bands: 0.4, overcast: 0 };
  }
  if (a.hazes.includes('dust') && P > 0.003 && rng.chance(0.6)) {
    // thin water/CO₂-ice clouds
    return { bottom: H * 1.5, top: H * 3, coverage: 0.12, density: 0.002, scale: 20000, albedo: [0.9, 0.9, 0.92],
      windSpeed: 20, seed: rng.int(0, 1e6), storminess: 0.05, bands: 0.2, overcast: 0 };
  }
  return undefined;
}

function gasGiantParams(rng: Rng, type: PlanetPhysics['type'], Teq: number, inp: PlanetInput): GasGiantParams {
  let cols: [number, number, number][];
  let haze = 0.1, hazeColor: [number, number, number] = srgb(0.9, 0.85, 0.75);
  let glow = 0;
  if (type === 'ice-giant') {
    const deep = rng.chance(0.5);
    const base = deep ? srgb(0.22, 0.38, 0.75) : srgb(0.55, 0.78, 0.82);
    cols = [base, mixRGB(base, srgb(0.85, 0.9, 0.95), 0.25), mixRGB(base, srgb(0.1, 0.2, 0.45), 0.25), mixRGB(base, srgb(0.8, 0.88, 0.9), 0.1)];
    haze = rng.range(0.4, 0.9); hazeColor = mixRGB(base, srgb(1, 1, 1), 0.5);
  } else if (Teq < 160) {
    // Sudarsky class I: ammonia clouds – tans, ochres, whites
    cols = [srgb(0.84, 0.78, 0.66), srgb(0.72, 0.55, 0.38), srgb(0.9, 0.86, 0.78), srgb(0.6, 0.42, 0.3), srgb(0.78, 0.66, 0.5)];
    if (rng.chance(0.4)) cols = cols.map((c) => mixRGB(c, srgb(0.85, 0.8, 0.6), 0.45)); // Saturn-like muted
  } else if (Teq < 350) {
    // class II: water clouds – bright, white
    cols = [srgb(0.92, 0.92, 0.9), srgb(0.82, 0.84, 0.86), srgb(0.95, 0.94, 0.92), srgb(0.75, 0.77, 0.8)];
  } else if (Teq < 900) {
    // class III: cloudless – deep blue from Rayleigh & alkali absorption
    cols = [srgb(0.2, 0.3, 0.55), srgb(0.15, 0.22, 0.45), srgb(0.25, 0.35, 0.6), srgb(0.18, 0.25, 0.5)];
    haze = 0.2;
  } else if (Teq < 1500) {
    // class IV: alkali-metal absorption – very dark
    cols = [srgb(0.12, 0.1, 0.1), srgb(0.08, 0.07, 0.08), srgb(0.15, 0.12, 0.1), srgb(0.1, 0.09, 0.09)];
    glow = 0.3;
  } else {
    // class V: silicate clouds, thermal glow on the night side
    cols = [srgb(0.3, 0.25, 0.25), srgb(0.22, 0.18, 0.17), srgb(0.35, 0.3, 0.28)];
    glow = 1;
  }
  cols = cols.map((c) => jitter(rng, c, 0.08));
  return {
    seed: rng.int(0, 1e6), bandColors: cols, bandCount: rng.int(6, 22), turbulence: rng.range(0.3, 1),
    storms: rng.range(0.1, 0.9), greatSpot: rng.chance(0.35) ? rng.range(0.4, 1) : 0, haze, hazeColor, glow, glowTemp: Math.max(Teq * 1.2, 1000),
  };
}

function ringParams(rng: Rng, R: number, type: string, Teq: number): RingInfo {
  const icy = Teq < 150 && rng.chance(type === 'gas-giant' ? 0.5 : 0.25);
  const inner = R * rng.range(1.2, 1.6);
  const outer = inner * rng.range(1.3, icy ? 2.4 : 1.9);
  return {
    inner, outer,
    opacity: icy ? rng.range(0.4, 0.95) : rng.range(0.05, 0.3),
    color: icy ? srgb(0.86, 0.8, 0.7) : srgb(0.35, 0.32, 0.3),
    seed: rng.int(0, 1e6),
    composition: icy ? 'water ice' : 'dark carbonaceous dust',
  };
}
