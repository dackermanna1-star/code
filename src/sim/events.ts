/**
 * Transient cosmic events, generated deterministically per galaxy and per
 * simulated year at physically motivated rates, so they are rare in real
 * time (as in nature) and appear when time is accelerated:
 *
 *  - core-collapse supernovae  ~1.5 per century in a Milky-Way-mass galaxy,
 *    scaled by star formation; young (arm) population; peak M_V ≈ −17
 *  - type Ia supernovae        ~0.4 per century; old population; M_V ≈ −19.3
 *  - classical novae           ~35 per year; M_V ≈ −8, fast decline
 *  - tidal disruption events   ~1e−4 per year at the central black hole
 *  - kilonovae (NS mergers)    ~1e−5 per year; M_V ≈ −15, days
 *
 * Light curves are simple analytic templates (rise, peak, decline in
 * magnitudes per day); positions follow the galaxy's stellar populations.
 * Light-travel time is ignored (events appear when they "happen").
 */
import { Vector3 } from 'three';
import type { GalaxyParams } from '../astro/galaxy';
import { densities, type PopDensity } from '../astro/galaxy';
import { Rng, seedOf } from '../core/rng';
import { YEAR, DAY } from '../core/constants';

export type EventKind = 'supernova-cc' | 'supernova-ia' | 'nova' | 'tde' | 'kilonova';

export interface CosmicEvent {
  id: string;
  kind: EventKind;
  name: string;
  galaxy: GalaxyParams;
  /** galaxy-local position (ly) */
  local: Vector3;
  /** simulation time of explosion (s) */
  t0: number;
  /** peak absolute visual magnitude */
  peakMag: number;
  /** colour temperature near peak (K) */
  temp: number;
}

const LABEL: Record<EventKind, string> = {
  'supernova-cc': 'Core-collapse supernova',
  'supernova-ia': 'Type Ia supernova',
  nova: 'Classical nova',
  tde: 'Tidal disruption event',
  kilonova: 'Kilonova (neutron-star merger)',
};

export function eventLabel(k: EventKind) {
  return LABEL[k];
}

/** Absolute visual magnitude at time t (s) after explosion; +Infinity when invisible. */
export function eventMag(e: CosmicEvent, t: number): number {
  const d = (t - e.t0) / DAY;
  if (d < -20) return Infinity;
  switch (e.kind) {
    case 'supernova-cc': {
      if (d < 0) return Infinity;
      if (d < 12) return e.peakMag + 4 * (1 - d / 12) ** 2;          // rise
      if (d < 100) return e.peakMag + 0.006 * (d - 12);                // plateau (II-P)
      if (d < 130) return e.peakMag + 0.5 + 0.06 * (d - 100);          // drop off the plateau
      return e.peakMag + 2.3 + 0.0098 * (d - 130);                      // ⁵⁶Co decay
    }
    case 'supernova-ia': {
      if (d < -18) return Infinity;
      if (d < 0) return e.peakMag + 3.5 * (d / 18) ** 2;
      if (d < 30) return e.peakMag + 0.1 * d;
      return e.peakMag + 3 + 0.015 * (d - 30);
    }
    case 'nova':
      if (d < -2) return Infinity;
      if (d < 0) return e.peakMag + 5 * (d / 2) ** 2;
      return e.peakMag + 0.12 * d;
    case 'kilonova':
      if (d < 0) return Infinity;
      return e.peakMag + (d < 1 ? 0 : 1.0 * (d - 1));
    case 'tde':
      if (d < -30) return Infinity;
      if (d < 0) return e.peakMag + 2.5 * (d / 30) ** 2;
      return e.peakMag + 2.5 * (5 / 3) * Math.log10(1 + d / 30);       // L ∝ t^−5/3
  }
}

/** Visual luminosity (L☉) at time t; 0 when invisible. */
export function eventLumV(e: CosmicEvent, t: number): number {
  const m = eventMag(e, t);
  if (!isFinite(m) || m > 6) return 0;
  return Math.pow(10, -0.4 * (m - 4.83));
}

/** Deterministic pool of positions following a stellar population (cached per galaxy). */
const pools = new Map<string, Vector3[]>();
function poolFor(g: GalaxyParams, pop: 'young' | 'old'): Vector3[] {
  const key = `${g.id}|${pop}`;
  let pool = pools.get(key);
  if (pool) return pool;
  const rng = new Rng(seedOf(g.seed, 'event-pool', pop));
  const w = pop === 'young' ? (d: PopDensity) => d.young : (d: PopDensity) => d.disk + d.bulge + d.halo * 0.5;
  pool = Array.from({ length: 256 }, () => samplePosition(g, rng, w));
  pools.set(key, pool);
  if (pools.size > 64) pools.delete(pools.keys().next().value!);
  return pool;
}

function samplePosition(g: GalaxyParams, rng: Rng, weight: (d: PopDensity) => number): Vector3 {
  const pd: PopDensity = { young: 0, disk: 0, bulge: 0, halo: 0 };
  densities(g, 0, 0, 0, pd);
  const ref = Math.max(weight(pd), 1e-12) * 1.2;
  const R = g.radius;
  const flat = g.type === 'elliptical' ? Math.min(1, g.ellipAxes[1] / Math.max(g.ellipAxes[0], 1e-3)) : 0.08;
  let best = new Vector3();
  let bw = -1;
  for (let i = 0; i < 400; i++) {
    const p = new Vector3(rng.range(-R, R), rng.range(-R * flat, R * flat), rng.range(-R, R));
    densities(g, p.x, p.y, p.z, pd);
    const w = weight(pd);
    if (w > bw) { bw = w; best = p; }
    if (rng.next() * ref < w) return p;
  }
  return best;
}

export class EventSystem {
  private cache = new Map<string, CosmicEvent[]>();
  /** events that started during this session (for notifications) */
  private announced = new Set<string>();
  onEvent: (e: CosmicEvent) => void = () => {};

  /** Events of one galaxy in one simulated year (deterministic). */
  eventsInYear(g: GalaxyParams, year: number): CosmicEvent[] {
    const key = `${g.id}|${year}`;
    let ev = this.cache.get(key);
    if (ev) return ev;
    ev = [];
    const rng = new Rng(seedOf(g.seed, 'events', year));
    const m = g.stellarMass / 6e10;
    const rates: [EventKind, number][] = [
      ['supernova-cc', 0.015 * m * (0.2 + 1.6 * g.starFormation)],
      ['supernova-ia', 0.004 * m],
      ['nova', 35 * m],
      ['tde', g.bhMass > 1e5 ? 1e-4 : 0],
      ['kilonova', 1e-5 * m],
    ];
    for (const [kind, rate] of rates) {
      const n = rng.poisson(Math.min(rate, 200));
      for (let i = 0; i < n; i++) {
        const t0 = (year + rng.next()) * YEAR;
        let local: Vector3;
        if (kind === 'tde') local = new Vector3();
        else {
          const pool = poolFor(g, kind === 'supernova-cc' ? 'young' : 'old');
          const j = Math.max(30, g.radius * 0.01);
          local = pool[rng.int(0, pool.length - 1)].clone().add(new Vector3(rng.normal(0, j), rng.normal(0, j * 0.2), rng.normal(0, j)));
        }
        const peak = kind === 'supernova-cc' ? rng.normal(-17, 0.8) : kind === 'supernova-ia' ? rng.normal(-19.3, 0.2) : kind === 'nova' ? rng.normal(-8, 0.8) : kind === 'tde' ? rng.normal(-19, 1) : rng.normal(-15.5, 0.5);
        const temp = kind === 'nova' ? 9000 : kind === 'kilonova' ? 3500 : kind === 'tde' ? 30000 : kind === 'supernova-ia' ? 11000 : 7000;
        const yr = 2000 + year;
        const designation = kind.startsWith('supernova') ? `SN ${yr.toFixed(0)}${String.fromCharCode(97 + (i % 26))}` : kind === 'nova' ? `Nova ${yr.toFixed(0)}-${i + 1}` : kind === 'tde' ? `TDE ${yr.toFixed(0)}` : `KN ${yr.toFixed(0)}`;
        ev.push({ id: `${g.id}/ev/${year}/${kind}/${i}`, kind, name: `${designation} (${g.name})`, galaxy: g, local, t0, peakMag: peak, temp });
      }
    }
    this.cache.set(key, ev);
    if (this.cache.size > 400) this.cache.delete(this.cache.keys().next().value!);
    return ev;
  }

  /**
   * Visible events around time t in the given galaxies (current galaxy first).
   * Novae are only tracked in the current galaxy (too faint elsewhere).
   */
  visible(galaxies: GalaxyParams[], current: GalaxyParams | null, t: number): { e: CosmicEvent; lumV: number }[] {
    const out: { e: CosmicEvent; lumV: number }[] = [];
    const year = Math.floor(t / YEAR);
    for (const g of galaxies) {
      for (let y = year - 2; y <= year; y++) {
        for (const e of this.eventsInYear(g, y)) {
          if (e.kind === 'nova' && g !== current) continue;
          const L = eventLumV(e, t);
          if (L <= 0) continue;
          out.push({ e, lumV: L });
          if (!this.announced.has(e.id) && t - e.t0 < 30 * DAY && t >= e.t0 - 5 * DAY) {
            this.announced.add(e.id);
            if (e.kind !== 'nova' || L > 1e4) this.onEvent(e);
          }
        }
      }
    }
    return out;
  }

  /** Mark everything currently visible as already announced (on start / teleport). */
  silence(galaxies: GalaxyParams[], t: number) {
    const year = Math.floor(t / YEAR);
    for (const g of galaxies) for (let y = year - 2; y <= year; y++) for (const e of this.eventsInYear(g, y)) if (e.t0 <= t) this.announced.add(e.id);
  }
}
