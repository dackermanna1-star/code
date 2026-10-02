import { ATMO } from './constants';

/**
 * CPU mirror of the atmosphere medium, used for per-frame light colours (no GPU readback).
 * Matches GLSL atmo_medium / the transmittance LUT integration.
 */
const RB = ATMO.bottomRadius;
const RT = ATMO.topRadius;

function extinction(h: number, out: Float64Array) {
  const hh = Math.max(h, 0);
  const dR = Math.exp(-hh / ATMO.rayleighScaleHeight);
  const dM = Math.exp(-hh / ATMO.mieScaleHeight);
  const dO = Math.max(0, 1 - Math.abs(hh - ATMO.ozoneCenter) / ATMO.ozoneHalfWidth);
  for (let i = 0; i < 3; i++) {
    out[i] = ATMO.rayleighScattering[i] * dR + ATMO.mieExtinction * dM + ATMO.ozoneAbsorption[i] * dO;
  }
}

/** Cosine of the geometric horizon seen from altitude h (km). */
export function horizonMu(h: number): number {
  return -Math.sqrt(Math.max(h * (2 * RB + h), 0)) / (RB + h);
}

/** Soft planet shadow (same as GLSL atmo_planetShadow). */
export function planetShadow(h: number, mu: number): number {
  const x = mu - horizonMu(h);
  const t = Math.min(Math.max((x + 0.008) / 0.016, 0), 1);
  return t * t * (3 - 2 * t);
}

const _ext = new Float64Array(3);
/** Transmittance from altitude h (km) along zenith cosine mu to the top of the atmosphere (no ground test). */
export function transmittance(h: number, muIn: number, out: number[] = [0, 0, 0]): number[] {
  const r = RB + h;
  const mu = Math.max(muIn, horizonMu(h)); // the GPU LUT clamps below-horizon rays to the horizon too
  const disc = r * r * mu * mu + (RT - r) * (RT + r);
  const d = Math.max(0, -r * mu + Math.sqrt(Math.max(disc, 0)));
  const N = 96;
  const od = [0, 0, 0];
  const rho2 = h * (2 * RB + h);
  for (let i = 0; i < N; i++) {
    const s0 = i / N, s1 = (i + 1) / N;
    const t0 = d * s0 * s0, t1 = d * s1 * s1;
    const t = 0.5 * (t0 + t1);
    const q = rho2 + 2 * r * mu * t + t * t;
    const hh = q / (Math.sqrt(q + RB * RB) + RB);
    extinction(hh, _ext);
    const dt = t1 - t0;
    od[0] += _ext[0] * dt;
    od[1] += _ext[1] * dt;
    od[2] += _ext[2] * dt;
  }
  out[0] = Math.exp(-od[0]);
  out[1] = Math.exp(-od[1]);
  out[2] = Math.exp(-od[2]);
  return out;
}
