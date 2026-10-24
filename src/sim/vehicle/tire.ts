// Combined-slip tire model: normalized Pacejka "magic formula" with the
// similarity method, driven by first-order relaxation (contact patch
// deflection) states. The deflection states give static friction at
// standstill and smooth transients at speed.

import type { TireDef } from './defs.ts';

export interface TireOutput {
  fx: number;
  fy: number;
  /** normalized combined slip (1 = peak) */
  rho: number;
  /** effective longitudinal slip ratio */
  kappa: number;
  /** effective slip angle tangent */
  alpha: number;
}

export class TireModel {
  readonly def: TireDef;
  private B: number;
  private C: number;
  private E: number;
  readonly slope0: number;

  constructor(def: TireDef) {
    this.def = def;
    this.C = def.shapeC;
    this.E = def.shapeE;
    // choose B so that the peak of sin(C atan(B x - E(Bx - atan(Bx)))) is at x = 1
    let lo = 0.1, hi = 20;
    for (let i = 0; i < 60; i++) {
      const mid = (lo + hi) / 2;
      // derivative sign at x=1 via finite difference
      const f1 = this.raw(mid, 1.0);
      const f2 = this.raw(mid, 1.001);
      if (f2 > f1) lo = mid; // still rising at 1 → need larger B
      else hi = mid;
    }
    this.B = (lo + hi) / 2;
    this.slope0 = (this.raw(this.B, 0.001) - this.raw(this.B, 0)) / 0.001;
  }

  private raw(B: number, x: number): number {
    const bx = B * x;
    return Math.sin(this.C * Math.atan(bx - this.E * (bx - Math.atan(bx))));
  }

  /** Normalized force curve: 0 at 0, 1 at x = 1. */
  curve(x: number): number {
    return this.raw(this.B, x);
  }

  /**
   * Compute forces from deflection-derived slips. `mu` already includes
   * surface and load sensitivity. Positive fx pushes forward, fy to the left.
   */
  forces(kappa: number, tanAlpha: number, fz: number, mu: number, out: TireOutput): TireOutput {
    const d = this.def;
    const kn = kappa / d.kappaPeak;
    const an = tanAlpha / Math.tan(d.alphaPeak);
    const rho = Math.sqrt(kn * kn + an * an);
    out.rho = rho;
    out.kappa = kappa;
    out.alpha = tanAlpha;
    if (rho < 1e-9 || fz <= 0) {
      out.fx = 0;
      out.fy = 0;
      return out;
    }
    const f = this.curve(rho) * mu * fz;
    out.fx = (f * kn) / rho;
    out.fy = (f * an) / rho;
    return out;
  }
}
