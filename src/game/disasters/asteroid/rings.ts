/**
 * Ring-by-ring column scheduling for the asteroid's shockwave (pure logic, unit tested).
 *
 * Columns around the impact are visited in rings of increasing integer radius
 * (ring r = every (dx,dz) with r <= hypot(dx,dz) < r+1). A ring is only processed once the
 * shock front has reached it, and each tick spends a strict budget of block edits and
 * milliseconds. A column is atomic, so a tick may overshoot the edit budget by at most one
 * column; the overshoot is carried as debt into the next tick so the long-run average never
 * exceeds the budget.
 */

/** Integer offsets (dx,dz) of ring r, flat [dx0,dz0,dx1,dz1,...]. Every offset belongs to exactly one ring. */
export function ringOffsets(r: number): Int32Array {
  const out: number[] = [];
  const lo2 = r * r, hi2 = (r + 1) * (r + 1);
  for (let dx = -r - 1; dx <= r + 1; dx++) {
    const a = lo2 - dx * dx, b = hi2 - dx * dx; // dz² in [a, b)
    if (b <= 0) continue;
    let zMin = a <= 0 ? 0 : Math.ceil(Math.sqrt(a));
    while (zMin > 0 && (zMin - 1) * (zMin - 1) >= a) zMin--; // float guard
    while (zMin * zMin < a) zMin++;
    let zMax = Math.floor(Math.sqrt(b - 1));
    while ((zMax + 1) * (zMax + 1) < b) zMax++;
    while (zMax >= 0 && zMax * zMax >= b) zMax--;
    for (let dz = zMin; dz <= zMax; dz++) {
      out.push(dx, dz);
      if (dz !== 0) out.push(dx, -dz);
    }
  }
  return Int32Array.from(out);
}

export interface TickBudget {
  /** Max block edits this tick (before debt). */
  edits: number;
  /** Max wall time (ms) this tick; checked between columns. */
  ms: number;
  /** Max columns visited per tick (cheap skips included). */
  columns?: number;
}

export interface RunResult {
  edits: number;
  columns: number;
  /** Columns that were visited (excluding skipped ones). */
  processed: number;
  /** Ring index the scheduler stopped at. */
  ring: number;
}

/**
 * Column callback: process (x,z) at integer ring radius r, return the number of edits it made
 * (0 for a cheap skip). Return -1 for an unloaded/skipped column (counts toward `columns` only).
 */
export type ColumnFn = (dx: number, dz: number, r: number) => number;

export class RingScheduler {
  ring: number;
  private offs: Int32Array;
  private i = 0;
  /** Edits spent beyond earlier budgets (carried forward). */
  debt = 0;
  /** Totals over the whole run. */
  totalEdits = 0;
  totalColumns = 0;
  /** Largest single-column edit count seen (for budget accounting / tests). */
  maxColumn = 0;

  /** Rings startRing..maxR (inclusive). */
  constructor(readonly maxR: number, private now: () => number = () => performance.now(), readonly startRing = 0) {
    this.ring = startRing;
    this.offs = ringOffsets(startRing);
  }

  get done() {
    return this.ring > this.maxR;
  }

  /** Fraction of rings completed (0..1). */
  get progress() {
    return Math.min(1, (this.ring - this.startRing) / (this.maxR + 1 - this.startRing));
  }

  /**
   * Process columns of every ring with index <= frontR, within the budget.
   */
  run(frontR: number, budget: TickBudget, fn: ColumnFn): RunResult {
    const t0 = this.now();
    const allow = budget.edits - this.debt;
    const maxCols = budget.columns ?? 50000;
    let edits = 0, columns = 0, processed = 0, unchecked = 0;
    while (!this.done && this.ring <= frontR) {
      if (this.i >= this.offs.length) {
        this.ring++;
        this.i = 0;
        if (this.done) break;
        this.offs = ringOffsets(this.ring);
        continue;
      }
      if (edits >= allow || columns >= maxCols) break;
      // time check every 8 columns, or after any heavy column (performance.now is not free)
      if ((columns & 7) === 7 || unchecked >= 48) {
        unchecked = 0;
        if (this.now() - t0 > budget.ms) break;
      }
      const dx = this.offs[this.i], dz = this.offs[this.i + 1];
      this.i += 2;
      columns++;
      const e = fn(dx, dz, this.ring);
      if (e >= 0) {
        processed++;
        edits += e;
        unchecked += e;
        if (e > this.maxColumn) this.maxColumn = e;
      }
    }
    // carry the overshoot; unused budget is not banked
    this.debt = Math.max(0, edits - allow);
    this.totalEdits += edits;
    this.totalColumns += columns;
    return { edits, columns, processed, ring: this.ring };
  }
}

/**
 * Shock-front radius (blocks) t seconds after impact: starts at `r0` (the crater, all due at
 * once) and decelerates like a blast wave.
 */
export function shockFront(t: number, r0: number): number {
  if (t <= 0) return r0;
  return r0 + 62 * Math.pow(t, 0.82);
}
