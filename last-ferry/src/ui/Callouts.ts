// Big centred callouts (NICE SHOT, MASSACRE, HEADSHOT ×3, TIDY, boss names)
// and smaller info / danger lines under the boarding bar.
//
// One "big" callout at a time: a new one knocks the current one out quickly.
// Info / danger lines stack (max 3) and expire on their own.
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
  private currentTimer = 0;
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
      window.setTimeout(() => prev.remove(), 200);
    }
    window.clearTimeout(this.currentTimer);
    const el = h('div', `lf-co k-${kind}`);
    el.appendChild(h('span', 'lf-co-text', text));
    this.big.appendChild(el);
    this.current = el;
    const ms = BIG_MS[kind] ?? 1500;
    this.currentTimer = window.setTimeout(() => {
      el.remove();
      if (this.current === el) this.current = null;
    }, ms + 40);
  }

  /** Remove everything (new game / title). */
  clear(): void {
    window.clearTimeout(this.currentTimer);
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
    while (this.lines.childElementCount > MAX_LINES) this.lines.firstElementChild?.remove();
    window.setTimeout(() => {
      el.classList.add('is-out');
      window.setTimeout(() => el.remove(), 280);
    }, LINE_MS);
  }
}
