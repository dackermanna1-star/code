// Contact-event aggregation → impacts (pure, no Babylon; unit-tested in tests/unit/physics-impacts.test.ts).
//
// Measured Havok semantics this module is built around (docs/api-notes/physics-events-queries.md §2):
//  * one event PER CONTACT POINT per world step (a flat box = 4), impulse = that point's normal impulse (N·s);
//  * the impact impulse arrives on STARTED (often a small speculative contact) and/or on the following
//    CONTINUED step(s): a 1 m drop of 1 kg gives STARTED Σ0.28 then CONTINUED Σ4.34; a restitution bounce
//    delivers its rebound impulse one step later; heavy-on-light hits spread over up to ~5 steps;
//  * resting contacts report ≈ (supported weight)·dt every awake step, sleeping bodies report nothing and
//    CONTINUED (not STARTED) resumes when an island wakes.
//
// Model per body pair:
//  IDLE ──STARTED──▶ EPISODE ──impulse decays / separation / max steps──▶ CONTACT (or IDLE if separated)
//  * EPISODE merges the impulse of a contact start over consecutive steps and emits ONE `started` impact
//    with impulse = Σ(step impulse − resting level) ≈ (1+e)·μ·v when the episode ends: on separation (resting
//    level 0 — bounces, corner hits that rotate and leave), when the per-step impulse has become steady (that
//    steady level is the resting load: 2 steady steps below endFraction·peak, or 3 when there is no distinct
//    peak, e.g. a heavy box spawned in contact), or after maxEpisodeSteps. A low step right after the peak is
//    NOT taken as the resting level by itself: it may be the rebound or a second corner hitting.
//  * CONTACT tracks a resting baseline (asymmetric EMA) and emits `started:false` impacts for spikes above
//    max(minImpulse, spikeFactor·baseline) — sustained crushing, sliding slams, things landing on a pile.
//  * Every emission must also pass the Δv gate: impulse / (lightest DYNAMIC mass of the pair) ≥ minDeltaV,
//    which rejects resting/spawn loads (a 30 kg box spawned in contact).
// Events of all substeps of one fixed step accumulate into that step; (A,B)/(B,A) duplicates share one pair.

export const EV_STARTED = 1;
export const EV_CONTINUED = 2;
export const EV_FINISHED = 4;

/** A body as seen by the aggregator (the physics system's body record implements this). */
export interface ImpactSide {
  /** Unique, never reused id (Havok reuses body ids immediately, so these must not be Havok ids). */
  readonly serial: number;
  /** kg for DYNAMIC bodies; Infinity for static / animated / unknown. */
  mass: number;
  /** Impacts involving this body are suppressed while stepIndex < muteUntil. */
  muteUntil: number;
  disposed: boolean;
}

export interface ImpactConfig {
  /** Absolute floor (N·s) for an emitted impulse. */
  minImpulse: number;
  /** Emitted impulse / lightest dynamic mass must reach this (m/s). */
  minDeltaV: number;
  /** A contact spike must exceed spikeFactor × resting baseline. */
  spikeFactor: number;
  /** A steady per-step impulse ≤ endFraction × the episode peak ends the episode after 2 steps (else 3). */
  endFraction: number;
  /** Two step impulses a, b are "steady" when |a − b| ≤ steadyTolerance·max(a, b) (+ a tiny absolute slack). */
  steadyTolerance: number;
  /** Episodes are cut after this many steps (heavy-on-light hits spread over ~5, plus 2 steady steps). */
  maxEpisodeSteps: number;
  /**
   * A STARTED contact whose impulse is still below minImpulse is an approach (speculative contact before
   * touching): the episode waits up to this many steps for the real impact before becoming a plain contact.
   */
  maxApproachSteps: number;
  /** A pair silent for more than this many steps is considered separated. */
  idleSteps: number;
  /** Pair state is dropped after this many silent steps (sleeping pairs report nothing). */
  forgetSteps: number;
  /** Baseline EMA rates when the step impulse is above / below the baseline. */
  baselineUp: number;
  baselineDown: number;
}

export const DEFAULT_IMPACT_CONFIG: Readonly<ImpactConfig> = {
  minImpulse: 0.02,
  minDeltaV: 0.25,
  spikeFactor: 3,
  endFraction: 0.25,
  steadyTolerance: 0.2,
  maxEpisodeSteps: 8,
  maxApproachSteps: 30,
  idleSteps: 1,
  forgetSteps: 240,
  baselineUp: 0.05,
  baselineDown: 0.3,
};

/** One aggregated impact (pooled: valid until the next endStep()). Normal points from a to b. */
export interface ImpactOut<S extends ImpactSide> {
  a: S;
  b: S;
  /** Impulse-weighted contact point (midpoint between the two surfaces), world. */
  px: number;
  py: number;
  pz: number;
  /** Unit normal from a towards b. */
  nx: number;
  ny: number;
  nz: number;
  /** Normal impulse (N·s): merged episode excess (started) or spike excess over the baseline (continued). */
  impulse: number;
  started: boolean;
  /** Largest single-step pair impulse inside the episode (or this step's impulse for spikes). */
  peak: number;
  /** Steps merged into this impact. */
  steps: number;
  /** Contact points reported in the peak step. */
  contacts: number;
}

const IDLE = 0;
const EPISODE = 1;
const CONTACT = 2;

class Pair<S extends ImpactSide> {
  a: S;
  b: S;
  phase = IDLE;
  /** Last step with STARTED/CONTINUED events (−∞ = never). */
  lastContactStep = -1e9;
  /** Last step in which the pair received any event (used to build the per-step touched list once). */
  touchedStep = -1e9;
  // ---- this step's accumulators
  sImp = 0;
  sW = 0;
  sPx = 0;
  sPy = 0;
  sPz = 0;
  sNx = 0;
  sNy = 0;
  sNz = 0;
  sContacts = 0;
  sStarted = false;
  sHasContact = false;
  // ---- episode accumulators
  eImp = 0;
  ePeak = 0;
  eSteps = 0;
  eW = 0;
  ePx = 0;
  ePy = 0;
  ePz = 0;
  eNx = 0;
  eNy = 0;
  eNz = 0;
  eContacts = 0;
  /** Steps since the episode's STARTED (approach + impact). */
  eAge = 0;
  /** The previous two step impulses inside the episode (−1 = none). */
  ePrev = -1;
  ePrev2 = -1;
  inEpisodeList = false;
  /** Resting impulse per step (EMA) while in CONTACT. */
  baseline = 0;
  /** Last raw normal (fallback if the weighted sum cancels). */
  lnx = 0;
  lny = 1;
  lnz = 0;

  constructor(a: S, b: S) {
    this.a = a;
    this.b = b;
  }

  reset(a: S, b: S): void {
    this.a = a;
    this.b = b;
    this.phase = IDLE;
    this.lastContactStep = -1e9;
    this.touchedStep = -1e9;
    this.baseline = 0;
    this.inEpisodeList = false;
    this.eImp = this.ePeak = this.eW = this.ePx = this.ePy = this.ePz = this.eNx = this.eNy = this.eNz = 0;
    this.eSteps = this.eContacts = 0;
  }
}

export class ImpactAggregator<S extends ImpactSide> {
  readonly cfg: ImpactConfig;
  /** Pairs keyed lo-serial → hi-serial (nested maps: no key arithmetic limits, no string allocation). */
  private readonly pairs = new Map<number, Map<number, Pair<S>>>();
  private readonly touched: Pair<S>[] = [];
  private readonly episodes: Pair<S>[] = [];
  private readonly pool: Pair<S>[] = [];
  private readonly outPool: ImpactOut<S>[] = [];
  private step = 0;
  private pairCount = 0;
  // events of one pair arrive consecutively (one per contact point): cache the last lookup
  private lastA: S | null = null;
  private lastB: S | null = null;
  private lastPair: Pair<S> | null = null;
  /** Raw contact events seen in the current step (stats). */
  events = 0;

  constructor(cfg: Partial<ImpactConfig> = {}) {
    this.cfg = { ...DEFAULT_IMPACT_CONFIG, ...cfg };
  }

  get size(): number {
    return this.pairCount;
  }

  /** Start accumulating events for fixed step `step` (monotonic). */
  beginStep(step: number): void {
    this.step = step;
    this.lastPair = null;
    this.lastA = this.lastB = null;
    this.events = 0;
  }

  /**
   * One raw contact-point event. `pa`/`pb` are the contact points on A's / B's surface, `n` the unit normal
   * from A towards B (Havok convention: from collider to collidedAgainst). FINISHED events carry no geometry.
   */
  add(
    sa: S,
    sb: S,
    type: number,
    pax: number,
    pay: number,
    paz: number,
    pbx: number,
    pby: number,
    pbz: number,
    nx: number,
    ny: number,
    nz: number,
    impulse: number,
  ): void {
    if (sa === sb) return;
    this.events++;
    let p: Pair<S>;
    if (this.lastPair !== null && ((sa === this.lastA && sb === this.lastB) || (sa === this.lastB && sb === this.lastA))) {
      p = this.lastPair;
    } else {
      p = this.lookup(sa, sb);
      this.lastPair = p;
      this.lastA = sa;
      this.lastB = sb;
    }
    if (p.touchedStep !== this.step) {
      p.touchedStep = this.step;
      p.sImp = p.sW = p.sPx = p.sPy = p.sPz = p.sNx = p.sNy = p.sNz = 0;
      p.sContacts = 0;
      p.sStarted = p.sHasContact = false;
      this.touched.push(p);
    }
    if (type === EV_FINISHED) return;
    if (!(impulse >= 0)) impulse = 0; // NaN / negative guard
    // orient so the normal points from pair.a to pair.b
    const s = sa === p.a ? 1 : -1;
    const w = impulse > 1e-6 ? impulse : 1e-6;
    p.sImp += impulse;
    p.sW += w;
    p.sPx += (pax + pbx) * 0.5 * w;
    p.sPy += (pay + pby) * 0.5 * w;
    p.sPz += (paz + pbz) * 0.5 * w;
    p.sNx += nx * s * w;
    p.sNy += ny * s * w;
    p.sNz += nz * s * w;
    p.lnx = nx * s;
    p.lny = ny * s;
    p.lnz = nz * s;
    p.sContacts++;
    p.sHasContact = true;
    if (type === EV_STARTED) p.sStarted = true;
  }

  /**
   * Close the step: run every touched pair's state machine. Emitted impacts are written into `out`
   * (pooled objects, valid until the next endStep); returns how many were written.
   */
  endStep(out: ImpactOut<S>[]): number {
    const step = this.step;
    const cfg = this.cfg;
    let n = 0;
    // 1) episodes whose pair reported no contact this step: the bodies separated → finish (no resting load)
    for (let i = this.episodes.length - 1; i >= 0; i--) {
      const p = this.episodes[i];
      if (p.phase !== EPISODE) {
        this.dropEpisode(i);
        continue;
      }
      if (p.touchedStep === step && p.sHasContact) continue;
      if (!p.a.disposed && !p.b.disposed) n = this.finishEpisode(p, 0, out, n);
      p.phase = IDLE;
      this.dropEpisode(i);
    }
    // 2) pairs with events this step
    for (let i = 0; i < this.touched.length; i++) {
      const p = this.touched[i];
      if (p.a.disposed || p.b.disposed) continue; // swept later
      if (!p.sHasContact) {
        // only FINISHED events: contact ended (an EPISODE was already closed in pass 1)
        if (p.phase === CONTACT) p.phase = IDLE;
        continue;
      }
      const gap = step - p.lastContactStep;
      p.lastContactStep = step;
      switch (p.phase) {
        case IDLE:
          if (p.sStarted) this.startEpisode(p);
          else {
            // contact resumed without STARTED (island woke up, or state was forgotten): learn the load only
            p.phase = CONTACT;
            p.baseline = p.sImp;
          }
          break;
        case CONTACT:
          if (gap > cfg.idleSteps) {
            // we never saw them separate (no FINISHED) or the pair slept in between
            if (p.sStarted) this.startEpisode(p);
            else p.baseline = p.sImp;
            break;
          }
          n = this.contactStep(p, out, n);
          break;
        case EPISODE: {
          p.eAge++;
          if (p.ePeak < cfg.minImpulse) {
            // nothing significant yet: still approaching inside the speculative margin (or a feather-light
            // placement). Restart the episode on this step so the impact is measured from its real start.
            if (p.eAge > cfg.maxApproachSteps) {
              p.phase = CONTACT;
              p.baseline = p.sImp;
            } else {
              this.resetEpisode(p);
              this.accumulateEpisode(p);
            }
            break;
          }
          this.accumulateEpisode(p);
          const cur = p.sImp;
          const prev = p.ePrev;
          if (this.steady(prev, cur)) {
            const level = 0.5 * (prev + cur);
            if (level <= cfg.endFraction * p.ePeak || (p.eSteps >= 3 && this.steady(p.ePrev2, prev))) {
              // still touching with a steady load: that load is the resting level
              n = this.finishEpisode(p, level, out, n);
              p.phase = CONTACT;
              p.baseline = level;
              break;
            }
          }
          if (p.eSteps >= cfg.maxEpisodeSteps) {
            n = this.finishEpisode(p, Math.min(prev, cur), out, n);
            p.phase = CONTACT;
            p.baseline = cur;
            break;
          }
          p.ePrev2 = prev;
          p.ePrev = cur;
          break;
        }
      }
    }
    this.touched.length = 0;
    this.lastPair = null;
    this.lastA = this.lastB = null;
    if ((step & 63) === 0) this.sweep();
    return n;
  }

  /** Drop all state (e.g. world reset). */
  clear(): void {
    for (const m of this.pairs.values()) for (const p of m.values()) this.pool.push(p);
    this.pairs.clear();
    this.pairCount = 0;
    this.touched.length = 0;
    this.episodes.length = 0;
    this.lastPair = null;
    this.lastA = this.lastB = null;
  }

  // ------------------------------------------------------------------ internals
  private lookup(sa: S, sb: S): Pair<S> {
    const lo = sa.serial < sb.serial ? sa : sb;
    const hi = lo === sa ? sb : sa;
    let m = this.pairs.get(lo.serial);
    if (m === undefined) {
      m = new Map();
      this.pairs.set(lo.serial, m);
    }
    let p = m.get(hi.serial);
    if (p === undefined) {
      const pooled = this.pool.pop();
      if (pooled) {
        pooled.reset(lo, hi);
        p = pooled;
      } else p = new Pair(lo, hi);
      m.set(hi.serial, p);
      this.pairCount++;
    }
    return p;
  }

  private startEpisode(p: Pair<S>): void {
    p.phase = EPISODE;
    p.eAge = 0;
    this.resetEpisode(p);
    this.accumulateEpisode(p);
    if (!p.inEpisodeList) {
      p.inEpisodeList = true;
      this.episodes.push(p);
    }
  }

  private resetEpisode(p: Pair<S>): void {
    p.eImp = p.ePeak = p.eW = p.ePx = p.ePy = p.ePz = p.eNx = p.eNy = p.eNz = 0;
    p.eSteps = p.eContacts = 0;
    p.ePrev = p.ePrev2 = -1;
  }

  /** Episode accumulation; the first step of an episode becomes ePrev for the steadiness test. */
  private accumulateEpisode(p: Pair<S>): void {
    if (p.eSteps === 0) p.ePrev = p.sImp;
    p.eImp += p.sImp;
    if (p.sImp >= p.ePeak) {
      p.ePeak = p.sImp;
      p.eContacts = p.sContacts;
    }
    p.eSteps++;
    p.eW += p.sW;
    p.ePx += p.sPx;
    p.ePy += p.sPy;
    p.ePz += p.sPz;
    p.eNx += p.sNx;
    p.eNy += p.sNy;
    p.eNz += p.sNz;
  }

  private dropEpisode(i: number): void {
    const p = this.episodes[i];
    p.inEpisodeList = false;
    const last = this.episodes.pop()!;
    if (i < this.episodes.length) this.episodes[i] = last;
  }

  private steady(a: number, b: number): boolean {
    if (a < 0 || b < 0) return false;
    return Math.abs(a - b) <= this.cfg.steadyTolerance * Math.max(a, b) + 0.25 * this.cfg.minImpulse;
  }

  private lightMass(p: Pair<S>): number {
    const ma = p.a.mass > 0 ? p.a.mass : Infinity; // NaN / 0 / negative → treat as immovable
    const mb = p.b.mass > 0 ? p.b.mass : Infinity;
    return ma < mb ? ma : mb;
  }

  private passes(p: Pair<S>, impulse: number): boolean {
    if (!(impulse >= this.cfg.minImpulse) || impulse <= 0) return false;
    if (this.step < p.a.muteUntil || this.step < p.b.muteUntil) return false;
    const m = this.lightMass(p);
    return m === Infinity || impulse >= this.cfg.minDeltaV * m;
  }

  /** Close an episode; `rest` = resting impulse per step during it (0 if the bodies separated). */
  private finishEpisode(p: Pair<S>, rest: number, out: ImpactOut<S>[], n: number): number {
    const excess = p.eImp - p.eSteps * rest;
    if (!this.passes(p, excess)) return n;
    const o = this.outAt(out, n);
    const w = p.eW > 0 ? 1 / p.eW : 0;
    o.a = p.a;
    o.b = p.b;
    o.px = p.ePx * w;
    o.py = p.ePy * w;
    o.pz = p.ePz * w;
    this.normalInto(o, p.eNx, p.eNy, p.eNz, p);
    o.impulse = excess;
    o.started = true;
    o.peak = p.ePeak;
    o.steps = p.eSteps;
    o.contacts = p.eContacts;
    return n + 1;
  }

  private contactStep(p: Pair<S>, out: ImpactOut<S>[], n: number): number {
    const cfg = this.cfg;
    const base = p.baseline;
    const imp = p.sImp;
    if (imp > cfg.minImpulse && imp > cfg.spikeFactor * base) {
      const excess = imp - base;
      if (this.passes(p, excess)) {
        const o = this.outAt(out, n);
        const w = p.sW > 0 ? 1 / p.sW : 0;
        o.a = p.a;
        o.b = p.b;
        o.px = p.sPx * w;
        o.py = p.sPy * w;
        o.pz = p.sPz * w;
        this.normalInto(o, p.sNx, p.sNy, p.sNz, p);
        o.impulse = excess;
        o.started = false;
        o.peak = imp;
        o.steps = 1;
        o.contacts = p.sContacts;
        n++;
      }
    }
    p.baseline = base + (imp - base) * (imp > base ? cfg.baselineUp : cfg.baselineDown);
    return n;
  }

  private normalInto(o: ImpactOut<S>, x: number, y: number, z: number, p: Pair<S>): void {
    const l = Math.sqrt(x * x + y * y + z * z);
    if (l > 1e-9) {
      o.nx = x / l;
      o.ny = y / l;
      o.nz = z / l;
    } else {
      o.nx = p.lnx;
      o.ny = p.lny;
      o.nz = p.lnz;
    }
  }

  private outAt(out: ImpactOut<S>[], n: number): ImpactOut<S> {
    let o = out[n];
    if (o === undefined) {
      o = this.outPool[n];
      if (o === undefined) {
        o = { a: null as unknown as S, b: null as unknown as S, px: 0, py: 0, pz: 0, nx: 0, ny: 1, nz: 0, impulse: 0, started: false, peak: 0, steps: 0, contacts: 0 };
        this.outPool[n] = o;
      }
      out[n] = o;
    }
    return o;
  }

  /** Forget silent pairs and pairs of disposed bodies (sleeping pairs report nothing, so state is re-learned). */
  private sweep(): void {
    const limit = this.step - this.cfg.forgetSteps;
    for (const [lo, m] of this.pairs) {
      for (const [hi, p] of m) {
        if (p.a.disposed || p.b.disposed || (p.phase !== EPISODE && p.lastContactStep < limit && p.touchedStep < limit)) {
          if (p.inEpisodeList) {
            const i = this.episodes.indexOf(p);
            if (i >= 0) this.dropEpisode(i);
          }
          m.delete(hi);
          this.pairCount--;
          p.a = p.b = null as unknown as S; // release references for GC
          this.pool.push(p);
        }
      }
      if (m.size === 0) this.pairs.delete(lo);
    }
  }
}
