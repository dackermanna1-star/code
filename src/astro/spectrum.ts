/**
 * Synthetic spectra for the science instruments, derived from the same
 * physical parameters as everything else:
 *
 *  - stars: a Planck continuum with the absorption lines that dominate at
 *    each temperature (He II in O stars, He I in B, Balmer peaking near
 *    9500 K, Ca II H & K, the G band, Mg b and Na D in cool stars, TiO
 *    bands in M dwarfs; broad Balmer wings in white dwarfs);
 *  - planets: reflected starlight shaped by Rayleigh scattering and the
 *    molecular bands of the atmosphere (depth ∝ 1 − exp(−k·column)), plus a
 *    vegetation "red edge" where a biosphere covers the land, shifted to the
 *    near infrared for pigments adapted to cool stars.
 *
 * Line strengths are schematic (not radiative transfer), but which features
 * appear, and where, follows the generated composition.
 */
import type { PlanetPhysics, StarPhysics } from './types';

export interface Spectrum {
  /** wavelength (nm) and relative flux, normalised to a maximum of 1 */
  wl: number[];
  flux: number[];
  marks: { wl: number; label: string }[];
  /** short reading of what the spectrum shows */
  findings: string[];
}

const planck = (lamNm: number, T: number) => {
  const l = lamNm * 1e-9;
  return 1 / (l ** 5 * (Math.exp(1.4388e-2 / (l * T)) - 1));
};
const gauss = (x: number, c: number, s: number) => Math.exp(-0.5 * ((x - c) / s) ** 2);

interface Line { wl: number; label: string; depth: number; width: number }

export function stellarSpectrum(s: StarPhysics): Spectrum | null {
  const T = s.temperature;
  if (!(T > 500) || s.stage === 'black-hole') return null;
  const lt = Math.log10(T);
  const wd = s.stage === 'white-dwarf';
  const balmer = 0.8 * Math.exp(-(((lt - 3.98) / 0.14) ** 2));
  const metals = (peak: number, w = 0.12) => Math.exp(-(((lt - peak) / w) ** 2));
  const lines: Line[] = [
    { wl: 656.3, label: 'Hα', depth: balmer, width: wd ? 6 : 1.2 + 2 * balmer },
    { wl: 486.1, label: 'Hβ', depth: balmer * 0.9, width: wd ? 6 : 1.2 + 2 * balmer },
    { wl: 434.0, label: 'Hγ', depth: balmer * 0.8, width: wd ? 5 : 1.1 + 2 * balmer },
    { wl: 410.2, label: 'Hδ', depth: balmer * 0.7, width: wd ? 5 : 1.0 + 2 * balmer },
    { wl: 393.4, label: 'Ca II K', depth: 0.85 * metals(3.74), width: 1.6 },
    { wl: 396.8, label: 'Ca II H', depth: 0.8 * metals(3.74), width: 1.6 },
    { wl: 430.8, label: 'G band', depth: 0.4 * metals(3.7), width: 1.5 },
    { wl: 516.7, label: 'Mg b', depth: 0.45 * metals(3.66), width: 1.4 },
    { wl: 589.3, label: 'Na D', depth: 0.6 * metals(3.58, 0.1), width: 1.2 },
    { wl: 447.1, label: 'He I', depth: 0.4 * metals(4.3, 0.1), width: 1 },
    { wl: 587.6, label: 'He I', depth: 0.3 * metals(4.3, 0.1), width: 1 },
    { wl: 468.6, label: 'He II', depth: 0.45 * metals(4.55, 0.08), width: 1 },
  ];
  // TiO bands in M dwarfs (molecules survive below ~3900 K)
  const tio = s.stage === 'main-sequence' || s.stage === 'red-giant' || s.stage === 'asymptotic-giant' || s.stage === 'brown-dwarf'
    ? Math.max(0, Math.min(1, (3900 - T) / 900)) : 0;
  if (tio > 0) for (const [wl, d] of [[476, 0.4], [496, 0.5], [517, 0.5], [545, 0.5], [616, 0.6], [710, 0.7], [760, 0.6], [845, 0.5]] as [number, number][]) lines.push({ wl, label: 'TiO', depth: d * tio, width: 8 });
  const wl: number[] = [], flux: number[] = [];
  const lo = 360, hi = 900, N = 360;
  let max = 0;
  for (let i = 0; i < N; i++) {
    const l = lo + ((hi - lo) * i) / (N - 1);
    let f = planck(l, T);
    for (const ln of lines) if (ln.depth > 0.02) f *= 1 - ln.depth * gauss(l, ln.wl, ln.width);
    wl.push(l);
    flux.push(f);
    max = Math.max(max, f);
  }
  for (let i = 0; i < N; i++) flux[i] /= max;
  const strong = lines.filter((l) => l.depth > 0.15);
  const seen = new Set<string>();
  const marks = strong.filter((l) => !seen.has(l.label) && seen.add(l.label)).map((l) => ({ wl: l.wl, label: l.label }));
  const peakNm = 2.898e6 / T;
  const findings = [
    `Continuum peaks near ${peakNm < 2000 ? peakNm.toFixed(0) + ' nm' : (peakNm / 1000).toFixed(1) + ' µm'} (T ≈ ${T.toFixed(0)} K)`,
    strong.length ? `Strongest lines: ${[...new Set(strong.sort((a, b) => b.depth - a.depth).map((l) => l.label))].slice(0, 4).join(', ')}` : 'Nearly featureless continuum',
  ];
  return { wl, flux, marks, findings };
}

interface Band { gas: string; label: string; wl: number; width: number; k: number }

const BANDS: Band[] = [
  { gas: 'H2O', label: 'H₂O', wl: 720, width: 8, k: 0.15 }, { gas: 'H2O', label: 'H₂O', wl: 820, width: 10, k: 0.25 },
  { gas: 'H2O', label: 'H₂O', wl: 940, width: 22, k: 0.6 }, { gas: 'H2O', label: 'H₂O', wl: 1130, width: 35, k: 0.8 },
  { gas: 'H2O', label: 'H₂O', wl: 1400, width: 60, k: 1.5 }, { gas: 'H2O', label: 'H₂O', wl: 1900, width: 75, k: 1.5 },
  { gas: 'CO2', label: 'CO₂', wl: 1580, width: 18, k: 0.3 }, { gas: 'CO2', label: 'CO₂', wl: 2010, width: 25, k: 0.8 },
  { gas: 'CO2', label: 'CO₂', wl: 2060, width: 18, k: 0.6 },
  { gas: 'CH4', label: 'CH₄', wl: 727, width: 7, k: 0.3 }, { gas: 'CH4', label: 'CH₄', wl: 890, width: 14, k: 0.7 },
  { gas: 'CH4', label: 'CH₄', wl: 1150, width: 35, k: 0.8 }, { gas: 'CH4', label: 'CH₄', wl: 1700, width: 55, k: 1.2 },
  { gas: 'CH4', label: 'CH₄', wl: 2300, width: 70, k: 1.2 },
  { gas: 'O2', label: 'O₂', wl: 688, width: 3, k: 0.4 }, { gas: 'O2', label: 'O₂ A', wl: 762, width: 5, k: 1.0 },
  { gas: 'O2', label: 'O₂', wl: 1270, width: 7, k: 0.4 },
  { gas: 'O3', label: 'O₃', wl: 600, width: 70, k: 200 }, // Chappuis band: ozone absorbs strongly per molecule
  { gas: 'NH3', label: 'NH₃', wl: 1520, width: 55, k: 0.9 }, { gas: 'NH3', label: 'NH₃', wl: 2000, width: 60, k: 0.9 },
  { gas: 'CO', label: 'CO', wl: 2350, width: 25, k: 0.7 },
  { gas: 'H2', label: 'H₂ (CIA)', wl: 2100, width: 160, k: 0.04 },
];

/** Reflected-light spectrum of a planet with an atmosphere (400–2500 nm). */
export function planetSpectrum(p: PlanetPhysics, starTemp: number): Spectrum | null {
  const atm = p.atmosphere;
  if (!atm || atm.pressure < 1e-4) return null;
  const P = atm.pressure;
  const comp: Record<string, number> = { ...atm.composition };
  // water vapour over surface water: Clausius–Clapeyron saturation at the mean temperature
  if (comp.H2O === undefined && p.liquid === 'water' && p.liquidCoverage > 0) {
    const T = Math.max(p.tempMean, 200);
    const eSat = 6.11e-3 * Math.exp((17.27 * (T - 273.15)) / (T - 35.86)); // bar
    comp.H2O = Math.min(0.1, (0.6 * Math.sqrt(p.liquidCoverage) * eSat) / P);
  }
  // ozone layer: photochemistry builds O₃ wherever there is free O₂ (≈0.4 ppm column-averaged on Earth)
  if (comp.O3 === undefined && (comp.O2 ?? 0) > 1e-3) comp.O3 = 4e-7 * Math.sqrt(comp.O2 / 0.21);
  // column abundance: fraction × pressure (bar); trace gases still leave marks
  const col = (gas: string) => (comp[gas] ?? 0) * P * 40;
  const veg = (p.life.kind === 'complex' || p.life.kind === 'simple') ? Math.min(1, p.life.coverage * (1 - p.liquidCoverage) * 1.5) : 0;
  const edge = starTemp < 4000 ? 1010 : starTemp < 5300 ? 760 : 705;
  const wl: number[] = [], flux: number[] = [];
  const lo = 400, hi = 2500, N = 420;
  let max = 0;
  const depthOf = new Map<string, { d: number; wl: number; label: string }>();
  for (let i = 0; i < N; i++) {
    const l = lo + ((hi - lo) * i) / (N - 1);
    let f = planck(l, starTemp);
    f *= 1 + 0.35 * Math.min(1, P) * (550 / l) ** 4;                 // Rayleigh blue excess
    if (veg > 0) f *= 1 - veg * 0.45 * (1 - 1 / (1 + Math.exp(-(l - edge) / 12))); // pigment absorbs below the edge
    for (const b of BANDS) {
      const c = col(b.gas);
      if (c <= 0) continue;
      const d = (1 - Math.exp(-b.k * Math.log1p(c * 50) * 0.6)) * gauss(l, b.wl, b.width);
      f *= 1 - Math.min(0.95, d);
      const best = depthOf.get(b.label + b.wl);
      if (!best || d > best.d) depthOf.set(b.label + b.wl, { d, wl: b.wl, label: b.label });
    }
    wl.push(l);
    flux.push(f);
    max = Math.max(max, f);
  }
  for (let i = 0; i < N; i++) flux[i] /= max;
  const marks: { wl: number; label: string }[] = [];
  const found = new Set<string>();
  for (const v of [...depthOf.values()].sort((a, b) => b.d - a.d)) {
    if (v.d < 0.08) continue;
    found.add(v.label.replace(' A', '').replace(' (CIA)', ''));
    if (!marks.some((m) => Math.abs(m.wl - v.wl) < 70)) marks.push({ wl: v.wl, label: v.label });
  }
  if (veg > 0.1) marks.unshift({ wl: edge, label: 'red edge' });
  const findings: string[] = [];
  findings.push(found.size ? `Absorbers: ${[...found].join(', ')}` : 'No strong molecular bands');
  if (P > 0.05) findings.push(`Rayleigh blue slope: ${P > 1 ? 'strong' : 'moderate'}`);
  const o2 = (comp.O2 ?? 0) > 1e-3, ch4 = (comp.CH4 ?? 0) > 1e-7;
  if (o2 && ch4) findings.push('O₂ with CH₄: chemical disequilibrium — a strong biosignature');
  else if (o2) findings.push('Free O₂ present (possibly biological; abiotic photolysis cannot be ruled out)');
  if (veg > 0.1) findings.push(`Surface reflectance rises sharply at ${edge} nm: a vegetation "red edge"`);
  return { wl, flux, marks, findings };
}
