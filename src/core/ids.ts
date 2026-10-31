/**
 * Identifiers and palettes shared by every layer (simulation, AI, rendering, audio, UI).
 * Keep this file dependency-free.
 */

/** A fighter's divine Aspect: drives colour identity, ability flavour, VFX and SFX timbre. */
export type AspectId = 'inferno' | 'radiance' | 'verdant' | 'frost' | 'tempest' | 'void' | 'chrono';

export const ASPECTS: readonly AspectId[] = ['inferno', 'radiance', 'verdant', 'frost', 'tempest', 'void', 'chrono'];

export interface AspectPalette {
  /** Display name, e.g. "Inferno". */
  name: string;
  /** Main glow colour (hex). */
  primary: string;
  /** Lighter accent (hex). */
  secondary: string;
  /** Near-white hot core (hex). */
  core: string;
  /** Deep shadow tint (hex). */
  dark: string;
  /** Hue in degrees (used to keep the two fighters visually distinct). */
  hue: number;
  /** Short flavour line for UI. */
  blurb: string;
}

export const ASPECT_PALETTES: Record<AspectId, AspectPalette> = {
  inferno: { name: 'Inferno', primary: '#ff5a1f', secondary: '#ffa64d', core: '#fff1d6', dark: '#3a0b00', hue: 18, blurb: 'Strikes leave searing burns.' },
  radiance: { name: 'Radiance', primary: '#ffcc33', secondary: '#ffe9a0', core: '#fffbea', dark: '#3a2a00', hue: 46, blurb: 'Perfect parries blind and restore.' },
  verdant: { name: 'Verdant', primary: '#38f27c', secondary: '#a8ffc8', core: '#efffF4', dark: '#00301a', hue: 142, blurb: 'Every wound inflicted heals the wielder.' },
  frost: { name: 'Frost', primary: '#5fe8ff', secondary: '#c4f7ff', core: '#f4feff', dark: '#002a36', hue: 189, blurb: 'Hits chill the foe, slowing their motion.' },
  tempest: { name: 'Tempest', primary: '#4f7dff', secondary: '#a9c0ff', core: '#f2f5ff', dark: '#06103a', hue: 226, blurb: 'Lightning-quick movement and projectiles.' },
  void: { name: 'Void', primary: '#a64dff', secondary: '#d9a8ff', core: '#f8eeff', dark: '#1c0036', hue: 274, blurb: 'Space folds easily: cheap, swift teleports.' },
  chrono: { name: 'Chrono', primary: '#ff5ccf', secondary: '#ffb0ea', core: '#fff0fa', dark: '#3a0028', hue: 318, blurb: 'Time bends: abilities recharge faster.' },
};

/** Minimal circular hue distance in degrees. */
export function hueDistance(a: number, b: number): number {
  const d = Math.abs(a - b) % 360;
  return d > 180 ? 360 - d : d;
}

export type ArenaThemeId = 'sanctum' | 'stormpeak' | 'nexus' | 'caldera' | 'frostveil' | 'celestial' | 'moonlit';

export const ARENA_THEMES: readonly ArenaThemeId[] = ['sanctum', 'stormpeak', 'nexus', 'caldera', 'frostveil', 'celestial', 'moonlit'];

/** Parse "#rrggbb" into [r,g,b] 0..255. */
export function hexToRgb(hex: string): [number, number, number] {
  const h = hex.replace('#', '');
  const n = parseInt(h.length === 3 ? h.split('').map((c) => c + c).join('') : h, 16);
  return [(n >> 16) & 255, (n >> 8) & 255, n & 255];
}

/** "#rrggbb" + alpha -> "rgba(r,g,b,a)". */
export function rgba(hex: string, a: number): string {
  const [r, g, b] = hexToRgb(hex);
  return `rgba(${r},${g},${b},${a < 0 ? 0 : a > 1 ? 1 : a.toFixed(3)})`;
}

/** Mix two hex colours (t=0 -> a, t=1 -> b). */
export function mixHex(a: string, b: string, t: number): string {
  const ca = hexToRgb(a), cb = hexToRgb(b);
  const c = ca.map((v, i) => Math.round(v + (cb[i] - v) * t));
  return '#' + c.map((v) => v.toString(16).padStart(2, '0')).join('');
}
