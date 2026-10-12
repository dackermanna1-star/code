// Shared helpers for the 2D UI: font registration and "design layers".
//
// All UI is laid out in the original 640x480 design pixels inside a layer that
// is scaled by `--k` (CSS px per design px, set on #game-view by Stage). The
// browser rasterises text and borders at the final size, so everything stays
// crisp at any window size.
//
// --k is min(viewW / 640, viewH / 480): in the classic 4:3 frame both are
// equal; a wider (first-person) view keeps the design scale of its height.
// Classic layers stay a 640x480 box (centred in a wider view); "fluid" layers
// (the modern UI) cover the whole view, viewW/k x viewH/k design px, so their
// content can anchor to the real view edges.
import './ui.css';
import './modern.css';
import { embeddedDataUrl } from '../core/embedded';

export const DESIGN_W = 640;
export const DESIGN_H = 480;

let fontsInjected = false;

/** Register the original game fonts (public/fonts) once. */
export function ensureFonts(): void {
  if (fontsInjected || typeof document === 'undefined') return;
  fontsInjected = true;
  const base = import.meta.env?.BASE_URL ?? './';
  const faces: Array<[family: string, file: string]> = [
    ['SH Trebuchet', 'trebuc.ttf'],
    ['SH Default', 'default.ttf'],
    ['SH Kinifed', 'kinifed.ttf'],
    ['SH Kroftsmann', 'Kroftsmann.ttf'],
  ];
  const css = faces
    .map(
      ([family, file]) =>
        `@font-face{font-family:'${family}';src:url('${embeddedDataUrl(`fonts/${file}`, 'font/ttf') ?? `${base}fonts/${file}`}') format('truetype');font-display:swap;}`,
    )
    .join('\n');
  const style = document.createElement('style');
  style.setAttribute('data-sh-fonts', '');
  style.textContent = css;
  document.head.appendChild(style);
  // Kick off loading right away so the first HUD frame uses the right metrics.
  try {
    for (const [family] of faces) void document.fonts?.load(`16px '${family}'`).catch(() => undefined);
  } catch {
    /* FontFaceSet unavailable */
  }
}

const tracked = new WeakSet<HTMLElement>();

/** Design scale of a view: CSS px per design px. */
export function viewScale(w: number, h: number): number {
  return w > 0 && h > 0 ? Math.min(w / DESIGN_W, h / DESIGN_H) : 1;
}

/** Make sure `view` is a positioned container and keeps `--k` in sync with its size. */
export function prepareView(view: HTMLElement): void {
  if (tracked.has(view)) return;
  tracked.add(view);
  // Stage positions the view with left/top, i.e. it expects position:absolute.
  if (getComputedStyle(view).position === 'static') view.style.position = 'absolute';
  view.classList.add('sh-view');
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

/** Create a 640x480 design-pixel layer inside the view. */
export function designLayer(view: HTMLElement, className: string): HTMLDivElement {
  ensureFonts();
  prepareView(view);
  const layer = h('div', `sh-layer ${className}`);
  view.appendChild(layer);
  return layer;
}

/** Create a layer covering the whole view in design px (modern UI). */
export function fluidLayer(view: HTMLElement, className: string): HTMLDivElement {
  prepareView(view);
  const layer = h('div', `shm-layer ${className}`);
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
