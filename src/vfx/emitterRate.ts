// Continuous-emitter rate → strength (PURE MODULE — no Babylon imports, unit-tested).
//
// Contract unit (VfxSystem.emitter `rate`, EmitterHandle.setRate): a STRENGTH multiplier,
// 1 = the kind's nominal effect (burst mains pipe ≈ 0.25 L/s spray, extinguisher at full blast),
// 0 = paused, capped at MAX_EMITTER_STRENGTH.
//
// Compatibility: a value above PER_SECOND_THRESHOLD cannot be a strength (the cap is 2.5), so it
// is read as a caller-side particle rate. Particle counts are internal to VFX, so the only
// meaningful reading is relative: the first such value an emitter receives is the caller's
// nominal (strength 1) and later values scale linearly from it — e.g. the tools module creates
// the extinguisher with 220 "particles/s" at full pressure and calls setRate(220 × pressure),
// which becomes strength = pressure. Within one emitter the mapping is continuous and monotonic.
// A one-time console warning flags the legacy usage.

export const MAX_EMITTER_STRENGTH = 2.5;
/** Rates above this are taken as caller particle rates (see header). */
export const PER_SECOND_THRESHOLD = 8;

let warned = false;

/** Per-emitter rate interpreter. */
export class EmitterRate {
  /** Caller rate that means strength 1 (0 = plain strength mode). */
  private ref = 0;
  private readonly warn: ((msg: string) => void) | null;

  constructor(warn: ((msg: string) => void) | null = (m) => console.warn(m)) {
    this.warn = warn;
  }

  /** True once the emitter interprets rates as caller particle rates. */
  get perSecond(): boolean {
    return this.ref > 0;
  }

  /** Strength for a caller rate, in [0, MAX_EMITTER_STRENGTH]. */
  resolve(kind: string, rate: number): number {
    if (!Number.isFinite(rate) || rate <= 0) return 0;
    let s: number;
    if (this.ref > 0) s = rate / this.ref;
    else if (rate > PER_SECOND_THRESHOLD) {
      this.ref = rate;
      s = 1;
      if (!warned && this.warn) {
        warned = true;
        this.warn(`[vfx] emitter("${kind}") rate ${rate} read as particles/s (= strength 1, later rates scale from it); pass a strength (1 = nominal) instead`);
      }
    } else s = rate;
    return Math.min(MAX_EMITTER_STRENGTH, s);
  }
}

/** Stateless strength for a single value (no per-emitter reference): plain strengths only. */
export function emitterStrength(rate: number): number {
  if (!Number.isFinite(rate) || rate <= 0) return 0;
  return Math.min(MAX_EMITTER_STRENGTH, rate > PER_SECOND_THRESHOLD ? 1 : rate);
}
