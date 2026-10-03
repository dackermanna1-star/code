/**
 * Status effect icons (18x18 vector glyphs in the effect's colour on a dark orb) + list widgets
 * used by the inventory screen and the HUD.
 */
import { effectInfo, formatDuration } from '../../game/brewing/potions';
import { roman } from '../../game/enchant/enchantments';

const GLYPH: Record<string, string> = {
  speed: 'M3 12 L9 12 L7 15 L15 9 L9 9 L11 4 L3 10 Z',
  slowness: 'M4 13 C4 9 7 6 11 6 C14 6 15 8.5 13.5 10.5 C12.5 12 10 12 9.5 10.5 C9 9 10.5 8.3 11.3 9 M4 13 H15',
  haste: 'M4 5 C7 3 11 3 14 5 L13 7 C10.5 5.6 7.5 5.6 5 7 Z M8.2 6.5 H9.8 V15 H8.2 Z',
  mining_fatigue: 'M4 5 C7 3 11 3 14 5 L13 7 C10.5 5.6 7.5 5.6 5 7 Z M8.2 6.5 H9.8 V10 L11 11.5 L9.8 12.5 V15 H8.2 Z',
  strength: 'M12.5 3 L15 3 L15 5.5 L8 12.5 L9.5 14 L8 15.5 L6.5 14 L4.5 16 L2 13.5 L4 11.5 L2.5 10 L4 8.5 L5.5 10 Z',
  weakness: 'M12.5 3 L15 3 L15 5.5 L11.5 9 L10 7.5 Z M9 10 L8 12.5 L9.5 14 L8 15.5 L6.5 14 L4.5 16 L2 13.5 L4 11.5 L2.5 10 L4 8.5 L5.5 10 L7 8.5 Z',
  instant_health: 'M9 15 L3.5 9.5 C1.8 7.8 2.5 4 5.5 4 C7 4 8.2 5 9 6.2 C9.8 5 11 4 12.5 4 C15.5 4 16.2 7.8 14.5 9.5 Z',
  regeneration: 'M9 15 L3.5 9.5 C1.8 7.8 2.5 4 5.5 4 C7 4 8.2 5 9 6.2 C9.8 5 11 4 12.5 4 C15.5 4 16.2 7.8 14.5 9.5 Z M8 7 H10 V8.5 H11.5 V10.5 H10 V12 H8 V10.5 H6.5 V8.5 H8 Z',
  health_boost: 'M9 15 L3.5 9.5 C1.8 7.8 2.5 4 5.5 4 C7 4 8.2 5 9 6.2 C9.8 5 11 4 12.5 4 C15.5 4 16.2 7.8 14.5 9.5 Z',
  absorption: 'M9 15 L3.5 9.5 C1.8 7.8 2.5 4 5.5 4 C7 4 8.2 5 9 6.2 C9.8 5 11 4 12.5 4 C15.5 4 16.2 7.8 14.5 9.5 Z',
  instant_damage: 'M9 15 L3.5 9.5 C1.8 7.8 2.5 4 5.5 4 C7 4 8.2 5 9 6.2 L7.5 8.5 L10 10 L8.5 12.5 L11 9.8 L8.8 8.4 L10.2 5.6 C11 4.6 11.6 4 12.5 4 C15.5 4 16.2 7.8 14.5 9.5 Z',
  jump_boost: 'M9 2.5 L14.5 8.5 H11 V15.5 H7 V8.5 H3.5 Z',
  levitation: 'M9 2.5 L14 7.5 H11 V10 H7 V7.5 H4 Z M7 11.5 H11 V13 H7 Z M7 14.2 H11 V15.5 H7 Z',
  slow_falling: 'M14 3 C8 4 4.5 8 4 15 C6 11 8.5 9 11 8 C9.3 9.5 8 11.2 7.2 13 C11.5 11 14 8 14 3 Z',
  nausea: 'M9 9 m-1 0 a1 1 0 1 0 2 0 a2.5 2.5 0 1 0 -5 0 a4 4 0 1 0 8 0 a5.5 5.5 0 1 0 -11 0',
  resistance: 'M9 2.5 L15 4.5 V9 C15 12.3 12.3 14.6 9 15.8 C5.7 14.6 3 12.3 3 9 V4.5 Z',
  fire_resistance: 'M9 2 C10 5 13.5 6 13.5 10 C13.5 13.2 11.4 15.5 9 15.5 C6.6 15.5 4.5 13.2 4.5 10 C4.5 8 5.6 6.6 6.8 5.6 C6.8 7.3 7.4 8.1 8.2 8.4 C7.8 6.2 8.1 4 9 2 Z',
  water_breathing: 'M9 9 m-5 0 a5 5 0 1 0 10 0 a5 5 0 1 0 -10 0 M6.5 7.5 a1.4 1.4 0 1 0 2.8 0 a1.4 1.4 0 1 0 -2.8 0',
  invisibility: 'M2 9 C4.5 5 7 4 9 4 C11 4 13.5 5 16 9 C13.5 13 11 14 9 14 C7 14 4.5 13 2 9 Z M3 15 L15 3',
  night_vision: 'M2 9 C4.5 5 7 4 9 4 C11 4 13.5 5 16 9 C13.5 13 11 14 9 14 C7 14 4.5 13 2 9 Z M9 9 m-2.5 0 a2.5 2.5 0 1 0 5 0 a2.5 2.5 0 1 0 -5 0',
  blindness: 'M2 8 C4.5 11 7 12 9 12 C11 12 13.5 11 16 8 M4 10.5 L3 12.5 M9 12 V14.5 M14 10.5 L15 12.5',
  darkness: 'M2 8 C4.5 11 7 12 9 12 C11 12 13.5 11 16 8 M4 10.5 L3 12.5 M9 12 V14.5 M14 10.5 L15 12.5',
  hunger: 'M11 2.5 C14 2.5 15.5 5 14.5 7.5 C13.5 10 10.5 10.5 9 9 L5.5 12.5 C6.3 13.6 5.6 15.3 4.3 15.2 C3.4 15.1 3 14.4 3.1 13.7 C2.2 13.8 1.5 13 1.8 12.1 C2.2 11 3.8 10.7 4.6 11.5 L8 8 C6.5 6.5 7.2 3.3 9.6 2.7 Z',
  saturation: 'M11 2.5 C14 2.5 15.5 5 14.5 7.5 C13.5 10 10.5 10.5 9 9 L5.5 12.5 C6.3 13.6 5.6 15.3 4.3 15.2 C3.4 15.1 3 14.4 3.1 13.7 C2.2 13.8 1.5 13 1.8 12.1 C2.2 11 3.8 10.7 4.6 11.5 L8 8 C6.5 6.5 7.2 3.3 9.6 2.7 Z',
  poison: 'M9 2 C11 6 14 8.5 14 11.5 C14 14 11.8 16 9 16 C6.2 16 4 14 4 11.5 C4 8.5 7 6 9 2 Z',
  wither: 'M9 2.5 C12.6 2.5 15 4.8 15 8 C15 10 14 11.4 12.5 12.2 V15 H5.5 V12.2 C4 11.4 3 10 3 8 C3 4.8 5.4 2.5 9 2.5 Z M6.3 7.2 h2 v2 h-2 Z M9.7 7.2 h2 v2 h-2 Z',
  glowing: 'M9 2 L10.8 7.2 L16 9 L10.8 10.8 L9 16 L7.2 10.8 L2 9 L7.2 7.2 Z',
  luck: 'M9 8.5 C7 4.5 4 5.5 4.5 8 C5 10 8 9 9 8.5 C11 4.5 14 5.5 13.5 8 C13 10 10 9 9 8.5 C7 12.5 10 14 9 8.5 M9 8.5 C11 12.5 8 14 9 8.5 M9 9 V16',
  unluck: 'M9 8.5 C7 4.5 4 5.5 4.5 8 C5 10 8 9 9 8.5 C11 4.5 14 5.5 13.5 8 C13 10 10 9 9 8.5 M9 9 V16',
  conduit_power: 'M9 3 L14.5 6 V12 L9 15 L3.5 12 V6 Z',
  dolphins_grace: 'M2.5 11 C5 6 10 4.5 15.5 6 C13 7 12.5 8.5 13.5 10.5 C11 9 7 9.5 4.5 13 Z',
  bad_omen: 'M4 2.5 H14 V15.5 L9 12.5 L4 15.5 Z',
  hero_of_the_village: 'M9 2.5 L13.5 7 L9 15.5 L4.5 7 Z',
};

const cache = new Map<string, string>();
/** Data URL of an effect icon. */
export function effectIconURL(id: string): string {
  let u = cache.get(id);
  if (u) return u;
  const info = effectInfo(id);
  const col = '#' + info.color.toString(16).padStart(6, '0');
  const p = GLYPH[id] ?? 'M9 9 m-4.5 0 a4.5 4.5 0 1 0 9 0 a4.5 4.5 0 1 0 -9 0';
  const stroked = ['speed', 'slowness', 'nausea', 'invisibility', 'blindness', 'darkness', 'luck', 'unluck', 'water_breathing'].includes(id);
  const lighter = brighten(info.color, 1.35);
  const svg = `<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 18 18">
    <defs><radialGradient id="g" cx="0.4" cy="0.35" r="0.75"><stop offset="0" stop-color="${lighter}"/><stop offset="1" stop-color="${col}"/></radialGradient></defs>
    <path d="${p}" fill="${stroked ? 'none' : 'url(#g)'}" stroke="${stroked ? lighter : '#141414'}" stroke-width="${stroked ? 1.7 : 0.9}" stroke-linejoin="round" stroke-linecap="round"/>
    ${stroked ? `<path d="${p}" fill="none" stroke="#141414" stroke-width="0.5" stroke-linejoin="round" opacity="0.7"/>` : ''}
  </svg>`;
  u = `data:image/svg+xml;utf8,${encodeURIComponent(svg)}`;
  cache.set(id, u);
  return u;
}

function brighten(c: number, f: number) {
  const r = Math.min(255, Math.round(((c >> 16) & 255) * f + 30)), g = Math.min(255, Math.round(((c >> 8) & 255) * f + 30)), b = Math.min(255, Math.round((c & 255) * f + 30));
  return `rgb(${r},${g},${b})`;
}

export function effectLabel(id: string, amplifier: number): string {
  const n = effectInfo(id).name;
  return amplifier > 0 ? `${n} ${roman(amplifier + 1)}` : n;
}

export function effectTime(duration: number): string {
  return duration < 0 ? '∞' : formatDuration(duration);
}
