// Shared helpers for the 2D UI: design layers, a tiny element factory and
// defensive localStorage access.
//
// All UI is laid out in 1280x720 design pixels (config/view.ts) inside layers
// scaled by `--k` (CSS px per design px). Stage sets --k on #game-view when it
// resizes the letterboxed 16:9 frame; prepareView() keeps it in sync for
// hosts that are not a Stage (previews). The browser rasterises text, SVG and
// borders at the final size, so everything stays crisp at any window size.
//
// A "fluid" layer covers the whole view: viewW/k x viewH/k design px. In the
// 16:9 game frame that is exactly 1280x720; in any other host the content
// still anchors to the real view edges.
import { DESIGN_H, DESIGN_W } from '../config/view';
import '../style.css';
import './ferry.css';

export { DESIGN_H, DESIGN_W };

const tracked = new WeakSet<HTMLElement>();

/** Design scale of a view: CSS px per design px. */
export function viewScale(w: number, h: number): number {
  return w > 0 && h > 0 ? Math.min(w / DESIGN_W, h / DESIGN_H) : 1;
}

/** Make sure `view` is a positioned container and keeps `--k` in sync with its size. */
export function prepareView(view: HTMLElement): void {
  if (tracked.has(view)) return;
  tracked.add(view);
  if (getComputedStyle(view).position === 'static') view.style.position = 'absolute';
  view.classList.add('lf-view');
  const apply = () => {
    const w = view.clientWidth;
    const hgt = view.clientHeight;
    if (w > 0 && hgt > 0) {
      const k = String(viewScale(w, hgt));
      if (view.style.getPropertyValue('--k') !== k) view.style.setProperty('--k', k);
    }
  };
  apply();
  if (typeof ResizeObserver !== 'undefined') new ResizeObserver(apply).observe(view);
}

/** Create a layer covering the whole view, laid out in design px. */
export function fluidLayer(view: HTMLElement, className: string): HTMLDivElement {
  prepareView(view);
  const layer = h('div', `lf-layer ${className}`);
  view.appendChild(layer);
  return layer;
}

/** Tiny element factory. */
export function h<K extends keyof HTMLElementTagNameMap>(
  tag: K,
  className = '',
  text?: string,
): HTMLElementTagNameMap[K] {
  const e = document.createElement(tag);
  if (className) e.className = className;
  if (text !== undefined) e.textContent = text;
  return e;
}

/** Element from trusted, static markup (our own inline SVG icons). */
export function fromHtml<T extends Element = HTMLElement>(html: string): T {
  const t = document.createElement('template');
  t.innerHTML = html.trim();
  return t.content.firstElementChild as T;
}

/** localStorage wrappers that never throw. */
export function storageGet<T>(key: string): T | null {
  try {
    const raw = window.localStorage.getItem(key);
    return raw ? (JSON.parse(raw) as T) : null;
  } catch {
    return null;
  }
}

export function storageSet(key: string, value: unknown): void {
  try {
    window.localStorage.setItem(key, JSON.stringify(value));
  } catch {
    /* private mode / quota / disabled storage */
  }
}

export const clamp01 = (v: number) => (v < 0 ? 0 : v > 1 ? 1 : v);
export const fmtInt = (n: number) => Math.round(n).toLocaleString('en-US');
export const fmtTime = (sec: number) => {
  const s = Math.max(0, Math.floor(sec));
  return `${Math.floor(s / 60)}:${String(s % 60).padStart(2, '0')}`;
};

/** Restart a CSS animation class on an element (cheap "pulse" triggers). */
export function retrigger(el: HTMLElement, cls: string): void {
  el.classList.remove(cls);
  // Force a style flush so the animation restarts.
  void el.offsetWidth;
  el.classList.add(cls);
}
