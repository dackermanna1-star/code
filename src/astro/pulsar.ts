/**
 * Pulsar emission seen by an observer. The beams themselves are invisible
 * from the side (nothing scatters them); a pulsar is seen as a star that
 * flashes each time a beam sweeps across the observer.
 *
 * Spin-down power L_sd = 4π² I Ṗ / P³ (I = 10³⁸ kg m²), with Ṗ from the
 * dipole field B ≈ 3.2×10¹⁹ √(P Ṗ) gauss; only a small fraction (~2×10⁻⁵,
 * as for the Crab) emerges as pulsed optical light, so only young, fast
 * pulsars are optically visible. Two beams of half-width ~8° sit on a
 * magnetic axis inclined by α to the spin axis.
 */
import { Quaternion, Vector3 } from 'three';
import type { Body } from './body';
import { seedOf, Rng } from '../core/rng';

const I_NS = 1e38;
const OPTICAL_EFFICIENCY = 2e-5;
const BEAM_W = (8 * Math.PI) / 180;

export interface PulsarModel {
  period: number;    // s
  pdot: number;      // s/s
  lsd: number;       // W, spin-down power
  lOpt: number;      // W, pulsed optical (beam-averaged over 4π as if isotropic)
  alpha: number;     // rad, magnetic inclination
  phase0: number;    // rad
}

export function pulsarModel(b: Body): PulsarModel | null {
  const s = b.star;
  if (!s || b.kind !== 'neutron-star' || !s.pulsarPeriod) return null;
  const P = s.pulsarPeriod;
  const Bg = (s.magneticField ?? 1e8) * 1e4; // tesla → gauss
  const pdot = (Bg / 3.2e19) ** 2 / P;
  const lsd = (4 * Math.PI * Math.PI * I_NS * pdot) / (P * P * P);
  const rng = new Rng(seedOf(7, b.id));
  return { period: P, pdot, lsd, lOpt: lsd * OPTICAL_EFFICIENCY, alpha: rng.range(0.2, 1.4), phase0: rng.range(0, Math.PI * 2) };
}

/**
 * Pulsed flux factor for an observer: multiplies lOpt/(4πd²). toObs: unit
 * vector from the pulsar to the observer (world); spinQ: body orientation
 * (spin axis = +Y). Pulses faster than ~10 Hz are averaged over a rotation.
 */
export function pulseFactor(m: PulsarModel, toObs: Vector3, spinQ: Quaternion, time: number): number {
  const axis = new Vector3(0, 1, 0).applyQuaternion(spinQ);
  const zeta = Math.acos(Math.max(-1, Math.min(1, toObs.dot(axis)))); // angle between line of sight and spin axis
  // the beam cone sweeps colatitudes α (north beam) and π − α (south beam)
  const latN = Math.exp(-0.5 * ((zeta - m.alpha) / BEAM_W) ** 2);
  const latS = Math.exp(-0.5 * ((zeta - (Math.PI - m.alpha)) / BEAM_W) ** 2);
  const lat = latN + latS;
  if (lat < 0.002) return 0;
  // beamed into a cone of solid angle ≈ 2π·2w·sinα (both beams sweep); flux in-beam is boosted by 4π / that
  const boost = (4 * Math.PI) / (2 * Math.PI * 2 * BEAM_W * Math.max(Math.sin(m.alpha), 0.2));
  if (m.period < 0.1) {
    // averaged over a rotation: duty cycle ≈ 2w / (2π sin ζ)
    return lat * boost * Math.min(1, (2 * BEAM_W) / (2 * Math.PI * Math.max(Math.sin(zeta), 0.05)));
  }
  // resolved pulses: azimuth of the magnetic axis around the spin axis
  // (the observer sits at azimuth 0; the south beam trails by half a turn)
  const phi = m.phase0 + (2 * Math.PI * time) / m.period;
  const wrap = (a: number) => Math.abs(((a % (2 * Math.PI)) + 3 * Math.PI) % (2 * Math.PI) - Math.PI);
  const w = BEAM_W / Math.max(Math.sin(zeta), 0.05);
  return boost * (latN * Math.exp(-0.5 * (wrap(phi) / w) ** 2) + latS * Math.exp(-0.5 * (wrap(phi + Math.PI) / w) ** 2));
}
