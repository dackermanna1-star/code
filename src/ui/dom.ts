/** Small DOM + colour helpers shared by the UI modules (no simulation imports). */

export function el<K extends keyof HTMLElementTagNameMap>(
  tag: K,
  cls?: string,
  parent?: HTMLElement | null,
  text?: string,
): HTMLElementTagNameMap[K] {
  const e = document.createElement(tag);
  if (cls) e.className = cls;
  if (text !== undefined) e.textContent = text;
  if (parent) parent.appendChild(e);
  return e;
}

/** Inline SVG element from markup (icons). */
export function svg(markup: string, cls = 'gl-ico'): SVGSVGElement {
  const wrap = document.createElement('div');
  wrap.innerHTML = `<svg class="${cls}" viewBox="0 0 24 24" aria-hidden="true">${markup}</svg>`;
  return wrap.firstElementChild as SVGSVGElement;
}

export function hexToRgb(hex: string): [number, number, number] {
  let h = (hex || '#ffffff').trim().replace('#', '');
  if (h.length === 3) h = h.split('').map((c) => c + c).join('');
  const n = parseInt(h.slice(0, 6), 16);
  if (!Number.isFinite(n)) return [255, 255, 255];
  return [(n >> 16) & 255, (n >> 8) & 255, n & 255];
}

export function rgbToHex(r: number, g: number, b: number): string {
  const c = (v: number) => Math.max(0, Math.min(255, Math.round(v))).toString(16).padStart(2, '0');
  return `#${c(r)}${c(g)}${c(b)}`;
}

/** Linear mix of two hex colours (t = 0 → a, 1 → b). */
export function mix(a: string, b: string, t: number): string {
  const ca = hexToRgb(a), cb = hexToRgb(b);
  return rgbToHex(ca[0] + (cb[0] - ca[0]) * t, ca[1] + (cb[1] - ca[1]) * t, ca[2] + (cb[2] - ca[2]) * t);
}

export function rgba(hex: string, a: number): string {
  const [r, g, b] = hexToRgb(hex);
  return `rgba(${r},${g},${b},${Math.max(0, Math.min(1, a))})`;
}

/** Sets --c / --cl / --cd / --cg custom properties for a fighter colour on an element. */
export function setFighterColors(e: HTMLElement, color: string, light?: string): void {
  e.style.setProperty('--c', color);
  e.style.setProperty('--cl', light || mix(color, '#ffffff', 0.45));
  e.style.setProperty('--cd', mix(color, '#05060c', 0.62));
  e.style.setProperty('--cg', rgba(color, 0.55));
}

export function fmtClock(sec: number): string {
  const s = Math.max(0, Math.floor(sec));
  const m = Math.floor(s / 60);
  return `${m.toString().padStart(2, '0')}:${(s % 60).toString().padStart(2, '0')}`;
}

export function fmtDuration(sec: number): string {
  const s = Math.max(0, Math.round(sec));
  return `${Math.floor(s / 60)}:${(s % 60).toString().padStart(2, '0')}`;
}

let fontsRequested = false;
/** Injects the Google Fonts stylesheet once (system fallbacks keep it looking right offline). */
export function ensureFonts(): void {
  if (fontsRequested || typeof document === 'undefined') return;
  fontsRequested = true;
  if (document.getElementById('gl-fonts')) return;
  const pre1 = document.createElement('link');
  pre1.rel = 'preconnect';
  pre1.href = 'https://fonts.googleapis.com';
  const pre2 = document.createElement('link');
  pre2.rel = 'preconnect';
  pre2.href = 'https://fonts.gstatic.com';
  pre2.crossOrigin = 'anonymous';
  const link = document.createElement('link');
  link.id = 'gl-fonts';
  link.rel = 'stylesheet';
  link.href = 'https://fonts.googleapis.com/css2?family=Bebas+Neue&family=Rajdhani:wght@500;600;700&display=swap';
  document.head.append(pre1, pre2, link);
  // Flag when the condensed display face is available (some layouts size up for it).
  const fonts = (document as Document & { fonts?: FontFaceSet }).fonts;
  if (fonts && typeof fonts.load === 'function') {
    const check = () =>
      fonts.load('400 64px "Bebas Neue"').then((faces) => {
        if (faces.length) document.documentElement.classList.add('gl-fonts-ok');
      }).catch(() => undefined);
    link.addEventListener('load', check);
    check();
  }
}

/** Marks the overlay root (position: fixed, pointer-events: none) — idempotent. */
export function prepareRoot(root: HTMLElement): void {
  root.classList.add('gl-root');
  ensureFonts();
}

/** Restart a CSS animation on an element by toggling a class. */
export function replayClass(e: HTMLElement, cls: string): void {
  e.classList.remove(cls);
  // Force style flush only on this element (cheap) so the animation restarts.
  void e.offsetWidth;
  e.classList.add(cls);
}

/** Escape text for safe innerHTML use. */
export function esc(s: string): string {
  return s.replace(/[&<>"']/g, (c) => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' })[c] as string);
}

export const SLOT_COLORS: Record<string, string> = {
  mobility: '#5fe8ff',
  ranged: '#ffa64d',
  special: '#c08bff',
  defense: '#5dffa0',
  ultimate: '#ffd34d',
};

export const SLOT_LABELS: Record<string, string> = {
  mobility: 'Mobility',
  ranged: 'Ranged',
  special: 'Special',
  defense: 'Defense',
  ultimate: 'Ultimate',
};

/** Colour for status chips by keyword (falls back to the fighter colour). */
export function statusColor(tag: string, fallback: string): string {
  const t = tag.toUpperCase();
  if (t.includes('ASCEND')) return '#ffd34d';
  if (t.includes('BURN')) return '#ff7a3a';
  if (t.includes('CHILL') || t.includes('FROZEN')) return '#7fe9ff';
  if (t.includes('SHIELD') || t.includes('AEGIS')) return '#8fd3ff';
  if (t.includes('REFLECT') || t.includes('WARD')) return '#e6ecff';
  if (t.includes('COUNTER')) return '#ffffff';
  if (t.includes('PHASE')) return '#b9a2ff';
  if (t.includes('LAST')) return '#ff3d5e';
  if (t.includes('BLIND')) return '#fff3a0';
  if (t.includes('BOUND') || t.includes('STUN')) return '#d0d4e0';
  if (t.includes('EMPOWER')) return '#ffcf5a';
  if (t.includes('REGEN') || t.includes('HEAL')) return '#6dffa8';
  if (t.includes('HASTE')) return '#9fffe0';
  return fallback;
}

/** Numeric value of a stat string ("312", "24%", "1.2s", "7 hits") or NaN. */
export function statNumber(s: string): number {
  const m = /-?\d+(?:[.,]\d+)?/.exec(s.replace(/,/g, ''));
  return m ? parseFloat(m[0]) : NaN;
}
