// Money pop-ups that stay readable in a crowd. The logic emits one 'money'
// event per payment (bounty, headshot bonus, nice-shot bonus, tidy stomp);
// a shotgun blast into a pack can pay a dozen in one tick. Collected per
// frame and flushed as few, meaningful pop-ups:
//
//  - payments from the same body (bounty + headshot bonus) merge into one
//    ("+$45 HEADSHOT");
//  - several bodies paid in the same frame merge into one cluster pop-up at
//    their centre;
//  - while many pop-ups are already on screen, small ordinary payments are
//    folded into the next one instead of spawning their own;
//  - a nice-shot bonus always gets its own (big) pop-up.
// Pure (no DOM).

export type MoneyPopReason = 'bounty' | 'headshot' | 'nice' | 'tidy';

export interface MoneyPop {
  x: number;
  y: number;
  z: number;
  amount: number;
  reason: MoneyPopReason;
}

const RANK: Record<MoneyPopReason, number> = { bounty: 0, tidy: 1, headshot: 2, nice: 3 };

/** Payments closer than this (m, in x and z) belong to the same body. */
export const SAME_BODY_M = 0.8;
/** This many separate bodies paid in one frame merge into one cluster pop-up. */
export const CLUSTER_AT = 3;
/** Pop-ups counted as "on screen" for this long (s). */
export const BUSY_WINDOW_S = 0.9;
/** With this many pop-ups on screen, small ones are folded into the next. */
export const BUSY_AT = 4;
/** "Small" ordinary payments (bounty / tidy) below this are folded while busy. */
export const SMALL_AMOUNT = 30;
/** Hard cap of pop-ups inside the window (nice shots excepted). */
export const MAX_IN_WINDOW = 6;

export class MoneyPops {
  private pending: MoneyPop[] = [];
  private shown: number[] = [];
  /** Folded payments waiting to ride along with the next pop-up. */
  private carry = 0;
  /** Debug counters. */
  readonly stats = { events: 0, pops: 0, folded: 0 };

  add(amount: number, reason: MoneyPopReason, x: number, y: number, z: number): void {
    if (!amount) return;
    this.stats.events++;
    this.pending.push({ x, y, z, amount, reason });
  }

  clear(): void {
    this.pending = [];
    this.shown = [];
    this.carry = 0;
  }

  /** Emit this frame's pop-ups. `now` in seconds (any monotonic clock). */
  flush(now: number, emit: (p: MoneyPop) => void): void {
    this.shown = this.shown.filter((t) => now - t < BUSY_WINDOW_S);
    if (!this.pending.length) {
      // Folded money with nothing to ride on goes out on its own once things calm down.
      if (this.carry > 0 && this.shown.length === 0) this.carry = 0;
      return;
    }
    const nice: MoneyPop[] = [];
    const bodies: MoneyPop[] = [];
    for (const e of this.pending) {
      if (e.reason === 'nice') {
        nice.push({ ...e });
        continue;
      }
      const same = bodies.find((b) => Math.abs(b.x - e.x) < SAME_BODY_M && Math.abs(b.z - e.z) < SAME_BODY_M);
      if (same) {
        same.amount += e.amount;
        same.y = Math.max(same.y, e.y);
        if (RANK[e.reason] > RANK[same.reason]) same.reason = e.reason;
      } else bodies.push({ ...e });
    }
    this.pending = [];

    let out: MoneyPop[] = bodies;
    if (bodies.length >= CLUSTER_AT) out = [merge(bodies)];
    const busy = this.shown.length >= BUSY_AT;
    const result: MoneyPop[] = [];
    for (const p of out) {
      const small = (p.reason === 'bounty' || p.reason === 'tidy') && p.amount < SMALL_AMOUNT;
      if ((busy && small) || this.shown.length + result.length >= MAX_IN_WINDOW) {
        this.carry += p.amount;
        this.stats.folded++;
        continue;
      }
      result.push(p);
    }
    if (this.carry > 0) {
      const host = result[0] ?? nice[0];
      if (host) {
        host.amount += this.carry;
        this.carry = 0;
      }
    }
    for (const p of [...result, ...nice]) {
      this.shown.push(now);
      this.stats.pops++;
      emit(p);
    }
  }
}

function merge(list: MoneyPop[]): MoneyPop {
  let a = 0;
  let x = 0;
  let z = 0;
  let y = 0;
  let reason: MoneyPopReason = 'bounty';
  for (const p of list) {
    a += p.amount;
    x += p.x * p.amount;
    z += p.z * p.amount;
    y = Math.max(y, p.y);
    if (RANK[p.reason] > RANK[reason]) reason = p.reason;
  }
  return { x: a ? x / a : list[0].x, y, z: a ? z / a : list[0].z, amount: a, reason };
}
