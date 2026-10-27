/**
 * Stellar population libraries. For each population (young arm stars, thin
 * disk, bulge, halo) we draw a large deterministic sample from the Kroupa IMF
 * and the population's star-formation history, evolve each star to its age,
 * and sort by absolute visual magnitude. Sector generation then draws stars
 * of a given magnitude band in O(1) and knows each band's number fraction.
 */
import { Rng } from '../core/rng';
import { evolve, sampleIMF } from './stellar';
import { absMagV, visualEfficacy } from './photometry';

export type PopName = 'young' | 'disk' | 'bulge' | 'halo';

export interface LibStar {
  massInit: number; // M☉
  age: number;      // yr
  lum: number;      // L☉ (bolometric)
  lumV: number;     // L☉ visual
  temp: number;
  mv: number;       // absolute visual magnitude
  remnant: number;  // 0 none, 1 WD, 2 NS, 3 BH, 4 brown dwarf
}

const N = 24000;
const libs = new Map<PopName, LibStar[]>();

function ageFor(pop: PopName, rng: Rng): number {
  switch (pop) {
    case 'young': return rng.range(1e6, 3e8);
    case 'disk': return rng.range(1e8, 10e9);
    case 'bulge': return rng.range(8e9, 12e9);
    case 'halo': return rng.range(11e9, 13e9);
  }
}

export function library(pop: PopName): LibStar[] {
  let lib = libs.get(pop);
  if (lib) return lib;
  const rng = new Rng(pop === 'young' ? 101 : pop === 'disk' ? 202 : pop === 'bulge' ? 303 : 404);
  lib = [];
  for (let i = 0; i < N; i++) {
    // young populations oversample massive stars a little (arms are where OB stars live)
    const m = sampleIMF(rng, 0.015, pop === 'young' ? 90 : 60);
    const age = ageFor(pop, rng);
    const st = evolve(m, age, rng);
    const remnant = st.stage === 'white-dwarf' ? 1 : st.stage === 'neutron-star' ? 2 : st.stage === 'black-hole' ? 3 : st.stage === 'brown-dwarf' ? 4 : 0;
    const lumV = st.lumSun * visualEfficacy(st.temp);
    lib.push({ massInit: m, age, lum: st.lumSun, lumV, temp: st.temp, mv: remnant === 3 ? 99 : absMagV(st.lumSun, st.temp), remnant });
  }
  lib.sort((a, b) => a.mv - b.mv);
  libs.set(pop, lib);
  return lib;
}

/** Index range [i0, i1) of library stars with brightLimit ≤ M_V < faintLimit. */
export function bandRange(lib: LibStar[], brightLimit: number, faintLimit: number): [number, number] {
  const lower = (m: number) => {
    let lo = 0, hi = lib.length;
    while (lo < hi) {
      const mid = (lo + hi) >> 1;
      if (lib[mid].mv < m) lo = mid + 1;
      else hi = mid;
    }
    return lo;
  };
  return [lower(brightLimit), lower(faintLimit)];
}

/** Mean visual luminosity per star of a population (L☉), for the unresolved glow. */
export function meanLumV(pop: PopName): number {
  const lib = library(pop);
  let s = 0;
  for (const x of lib) s += x.lumV;
  return s / lib.length;
}

export const LIB_SIZE = N;
