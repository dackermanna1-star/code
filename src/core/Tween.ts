import { Ease, clamp } from './math';

/**
 * Tiny tween/timeline system driven by the game loop (so pausing the game
 * pauses animations too). Every tween resolves a promise on completion which
 * makes scripted sequences (cinematics, serving, ratings) easy to write.
 */
export interface TweenHandle {
  cancel(): void;
  readonly done: Promise<void>;
  readonly active: boolean;
}

interface TweenEntry {
  t: number;
  delay: number;
  duration: number;
  ease: (t: number) => number;
  update: (e: number, raw: number) => void;
  resolve: () => void;
  cancelled: boolean;
  finished: boolean;
  group: string;
}

export class Tweens {
  private list: TweenEntry[] = [];
  private waits: { t: number; resolve: () => void; group: string }[] = [];

  /** Animate a value from 0..1 over `duration` seconds. */
  run(
    duration: number,
    update: (e: number, raw: number) => void,
    opts: { ease?: (t: number) => number; delay?: number; group?: string } = {},
  ): TweenHandle {
    let resolve!: () => void;
    const done = new Promise<void>((r) => (resolve = r));
    const entry: TweenEntry = {
      t: 0,
      delay: opts.delay ?? 0,
      duration: Math.max(1e-4, duration),
      ease: opts.ease ?? Ease.outCubic,
      update,
      resolve,
      cancelled: false,
      finished: false,
      group: opts.group ?? '',
    };
    this.list.push(entry);
    return {
      cancel: () => {
        if (!entry.finished) {
          entry.cancelled = true;
          entry.finished = true;
          resolve();
        }
      },
      done,
      get active() {
        return !entry.finished;
      },
    };
  }

  /** Tween numeric properties of an object. */
  to<T extends object>(
    target: T,
    props: Partial<Record<keyof T, number>>,
    duration: number,
    opts: { ease?: (t: number) => number; delay?: number; group?: string; onUpdate?: () => void } = {},
  ): TweenHandle {
    const from: Record<string, number> = {};
    const keys = Object.keys(props) as (keyof T)[];
    let started = false;
    return this.run(
      duration,
      (e) => {
        if (!started) {
          started = true;
          for (const k of keys) from[k as string] = (target as any)[k] as number;
        }
        for (const k of keys) {
          const a = from[k as string];
          const b = props[k] as number;
          (target as any)[k] = a + (b - a) * e;
        }
        opts.onUpdate?.();
      },
      opts,
    );
  }

  wait(seconds: number, group = ''): Promise<void> {
    return new Promise((resolve) => this.waits.push({ t: seconds, resolve, group }));
  }

  cancelGroup(group: string): void {
    for (const e of this.list) if (e.group === group && !e.finished) {
      e.cancelled = true;
      e.finished = true;
      e.resolve();
    }
    this.waits = this.waits.filter((w) => {
      if (w.group === group) {
        w.resolve();
        return false;
      }
      return true;
    });
  }

  update(dt: number): void {
    if (this.waits.length) {
      const remaining: typeof this.waits = [];
      for (const w of this.waits) {
        w.t -= dt;
        if (w.t <= 0) w.resolve();
        else remaining.push(w);
      }
      this.waits = remaining;
    }
    if (!this.list.length) return;
    const list = this.list;
    this.list = [];
    for (const e of list) {
      if (e.cancelled) continue;
      let step = dt;
      if (e.delay > 0) {
        e.delay -= dt;
        if (e.delay > 0) {
          this.list.push(e);
          continue;
        }
        step = -e.delay; // carry leftover time into the tween
        e.delay = 0;
      }
      e.t += step;
      const raw = clamp(e.t / e.duration);
      e.update(e.ease(raw), raw);
      if (raw >= 1) {
        e.finished = true;
        e.resolve();
      } else this.list.push(e);
    }
    // Tweens created during update were pushed onto this.list already.
  }
}

/** Critically damped spring for smooth, overshoot-free following of targets. */
export class Spring {
  value: number;
  velocity = 0;
  target: number;
  constructor(value = 0, public stiffness = 120, public damping = 2 * Math.sqrt(120)) {
    this.value = value;
    this.target = value;
  }
  update(dt: number): number {
    // semi-implicit Euler, sub-stepped for stability
    const steps = Math.max(1, Math.ceil(dt / (1 / 120)));
    const h = dt / steps;
    for (let i = 0; i < steps; i++) {
      const f = -this.stiffness * (this.value - this.target) - this.damping * this.velocity;
      this.velocity += f * h;
      this.value += this.velocity * h;
    }
    return this.value;
  }
  snap(v: number): void {
    this.value = v;
    this.target = v;
    this.velocity = 0;
  }
  kick(impulse: number): void {
    this.velocity += impulse;
  }
}
