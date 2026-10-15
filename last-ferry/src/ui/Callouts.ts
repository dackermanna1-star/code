// Big centred callouts (NICE SHOT, MASSACRE, HEADSHOT ×3, TIDY, boss names)
// and smaller info / danger lines under the boarding bar.
//
// One "big" callout at a time: a new one knocks the current one out quickly.
// Info / danger lines stack (max 3) and expire on their own.
//
// Lifetimes run on UI time, not wall-clock timers: the app calls tick(dt,
// rate) every frame with rate 0 while paused (and the ?speed factor
// otherwise), so a callout or a one-time teach line shown just before a pause
// is still there after Resume. The CSS animations follow the same rate
// (Web Animations playbackRate), so what is drawn matches what is alive. A
// host that never calls tick() (a preview page) gets wall-clock timers.
import { fluidLayer, h } from './dom';
import type { CalloutKind } from './hudTypes';

const BIG_MS: Record<string, number> = {
  nice: 1500,
  massacre: 1800,
  headshot: 1500,
  tidy: 1100,
  boss: 2600,
};
const LINE_MS = 2600;
const MAX_LINES = 3;

export class Callouts {
  private readonly root: HTMLDivElement;
  private readonly big: HTMLDivElement;
  private readonly lines: HTMLDivElement;
  private current: HTMLDivElement | null = null;
  private currentTimer: Timer | null = null;
  /** UI seconds (advanced by tick). */
  private clock = 0;
  /** Playback rate of the callout animations (0 = paused). */
  private rate = 1;
  private timers: Timer[] = [];
  /** Earliest timer (tick() does nothing before it). */
  private nextAt = Infinity;
  /** tick() drives the timers (else they are wall-clock timeouts). */
  private driven = false;
  /** Debug: every callout shown (text, kind). */
  readonly history: Array<{ text: string; kind: CalloutKind; t: number }> = [];

  constructor(view: HTMLElement) {
    this.root = fluidLayer(view, 'lf-callouts');
    this.big = h('div', 'lf-co-big');
    this.lines = h('div', 'lf-co-lines');
    this.root.append(this.big, this.lines);
  }

  setVisible(v: boolean): void {
    this.root.style.display = v ? '' : 'none';
  }

  /** Show a callout. Big kinds replace each other; info/danger lines stack. */
  show(text: string, kind: CalloutKind = 'info'): void {
    this.history.push({ text, kind, t: performance.now() });
    if (this.history.length > 50) this.history.shift();
    if (kind === 'info' || kind === 'danger') {
      this.line(text, kind);
      return;
    }
    const prev = this.current;
    if (prev) {
      prev.classList.add('is-out');
      this.follow(prev);
      this.after(200, () => prev.remove());
    }
    this.cancel(this.currentTimer);
    const el = h('div', `lf-co k-${kind}`);
    el.appendChild(h('span', 'lf-co-text', text));
    this.big.appendChild(el);
    this.follow(el);
    this.current = el;
    const ms = BIG_MS[kind] ?? 1500;
    this.currentTimer = this.after(ms + 40, () => {
      el.remove();
      if (this.current === el) this.current = null;
    });
  }

  /**
   * Advance UI time by `dt` seconds (0 while paused). `rate`: how fast the
   * callout animations play (0 paused, 1 normal, the ?speed factor in tests).
   */
  tick(dt: number, rate = 1): void {
    this.driven = true;
    this.clock += Math.max(0, dt);
    if (rate !== this.rate) {
      this.rate = rate;
      this.follow(this.root);
    }
    if (this.clock < this.nextAt) return;
    const due = this.timers.filter((t) => t.at <= this.clock);
    this.timers = this.timers.filter((t) => t.at > this.clock);
    this.nextAt = this.timers.reduce((m, t) => Math.min(m, t.at), Infinity);
    for (const t of due) t.fn();
  }

  /** Remove everything (new game / title). */
  clear(): void {
    this.timers = [];
    this.nextAt = Infinity;
    this.currentTimer = null;
    this.current = null;
    this.big.replaceChildren();
    this.lines.replaceChildren();
  }

  private line(text: string, kind: 'info' | 'danger'): void {
    // Same text already showing: refresh it instead of stacking duplicates.
    for (const c of Array.from(this.lines.children) as HTMLElement[]) {
      if (c.textContent === text && !c.classList.contains('is-out')) c.remove();
    }
    const el = h('div', `lf-line lf-glass k-${kind}`, text);
    this.lines.appendChild(el);
    this.follow(el);
    while (this.lines.childElementCount > MAX_LINES) this.lines.firstElementChild?.remove();
    this.after(LINE_MS, () => {
      if (!el.isConnected) return;
      el.classList.add('is-out');
      this.follow(el);
      this.after(280, () => el.remove());
    });
  }

  private after(ms: number, fn: () => void): Timer {
    const t: Timer = { at: this.clock + ms / 1000, fn };
    if (!this.driven) {
      t.timeout = window.setTimeout(fn, ms);
      return t;
    }
    this.timers.push(t);
    this.nextAt = Math.min(this.nextAt, t.at);
    return t;
  }

  private cancel(t: Timer | null): void {
    if (!t) return;
    if (t.timeout !== undefined) window.clearTimeout(t.timeout);
    this.timers = this.timers.filter((x) => x !== t);
  }

  /** Make the element's CSS animations and transitions run at the current rate. */
  private follow(el: Element): void {
    if (this.rate === 1 && el !== this.root) return;
    if (typeof el.getAnimations !== 'function') return;
    for (const a of el.getAnimations({ subtree: true })) a.playbackRate = this.rate;
  }
}

interface Timer {
  at: number;
  fn: () => void;
  /** Wall-clock fallback (no tick() driver). */
  timeout?: number;
}
