// Inline SVG icons drawn for Last Ferry (no image files). Weapons point LEFT,
// the way the Bosun fires. All shapes use currentColor; a second tone is
// drawn with `opacity` so one CSS colour drives the whole icon (locked /
// affordable / owned / selected states just change `color`).
import type { WeaponId, ZombieKind } from '../config/ids';

const svg = (vb: string, body: string, cls = '') =>
  `<svg class="lf-ico ${cls}" viewBox="${vb}" fill="currentColor" aria-hidden="true" focusable="false">${body}</svg>`;

/** Weapon silhouettes, viewBox 0 0 120 48, muzzle on the left. */
export const WEAPON_SVG: Record<WeaponId, string> = {
  // "Old Faithful": long barrel with front sight and ejector rod, fluted
  // cylinder, hammer spur, bird's-head grip.
  revolver: svg(
    '0 0 120 48',
    `<path d="M8 14.5h3.2v-3h3v3H60v7.2H16.5v2.6H9.6l-1.6-2.6z"/>
     <rect x="58" y="10.5" width="25" height="17.5" rx="3.2"/>
     <path d="M81 9.5h9.5l5.5-6.2 3.6 1.6-4.6 7.8 2 3.4v9.4H81z"/>
     <path d="M85 25.5c3 0 9.5-0.4 13.4 0.6 3.6 1 6.6 4.7 7.6 9.4l1.2 6.6c0.3 1.7-0.8 3-2.5 3.2l-7.3 0.6c-1.6 0.1-2.8-0.8-3.2-2.4l-2.2-8.4c-0.5-1.8-1.9-2.6-3.6-2.6H85z"/>
     <path d="M72.5 27.5h3.2c0.6 4.6 3.2 7.6 8.2 7.8l0.2 3.4c-7.2 0.2-11.2-4.6-11.6-11.2z"/>
     <path d="M80 27.8l3.4-0.3-1.2 5.2-2.1-0.3z"/>
     <g opacity="0.38" fill="#000"><rect x="61" y="13.2" width="19" height="1.7" rx="0.8"/><rect x="61" y="17.8" width="19" height="1.7" rx="0.8"/><rect x="61" y="22.4" width="19" height="1.7" rx="0.8"/></g>
     <circle cx="99" cy="33" r="1.3" opacity="0.4" fill="#000"/>`,
  ),
  // Pneumatic framing nailer: driver nose, cylinder head, handle with the air
  // fitting and a coiled hose stub, angled nail strip underneath.
  nailgun: svg(
    '0 0 120 48',
    `<path d="M10 23h14v15.5c0 1.6-1.2 2.8-2.8 2.8H13c-1.6 0-3-1.3-3-3z"/>
     <rect x="5.5" y="36.5" width="10" height="5" rx="1.6"/>
     <path d="M14 5.5h28c4.4 0 7.5 3.2 7.5 7.5v4.6c0 4-3.2 7.4-7.5 7.4H14c-2 0-3.4-1.5-3.4-3.4V9c0-2 1.5-3.5 3.4-3.5z"/>
     <path d="M48 11.5h42.5c2.4 0 4 1.8 4 4v3.6c0 2.2-1.7 4-4 4H48z"/>
     <rect x="93" y="12.4" width="7.5" height="9.8" rx="1.6"/>
     <path d="M100 15.2h4.4c6.4 0 10 4.6 9.2 10.4-0.6 4.4-4.4 7.4-9.4 7.2l0.2-3.2c3.2 0.1 5.6-1.6 6-4.4 0.5-3.8-1.9-6.8-6.2-6.8H100z"/>
     <path d="M57 23.2h5c0.4 3.6 2.2 6.4 5.6 7.2l-0.6 3c-5.6-1-9.4-5-10-10.2z"/>
     <path d="M20.5 36.6l55-11.8 1.9 6.6-55.4 11.2z"/>
     <g opacity="0.38" fill="#000"><path d="M27 37.6l1.2-0.3 1.2 4.5-1.2 0.3zM36 35.7l1.2-0.3 1.2 4.5-1.2 0.3zM45 33.8l1.2-0.3 1.2 4.5-1.2 0.3zM54 31.9l1.2-0.3 1.2 4.5-1.2 0.3zM63 30l1.2-0.3 1.2 4.5-1.2 0.3z"/>
     <rect x="16" y="9.4" width="27" height="2" rx="1"/><rect x="16" y="14.4" width="27" height="2" rx="1"/><rect x="16" y="19.4" width="27" height="2" rx="1"/></g>`,
  ),
  // Pump shotgun: barrel over the magazine tube, ribbed fore-end, receiver,
  // trigger guard and a straight stock with a recoil pad.
  shotgun: svg(
    '0 0 120 48',
    `<path d="M3 15.2h2.6v-2h2.4v2H64v5H3z"/>
     <rect x="10" y="20.2" width="56" height="4.4" rx="1.4"/>
     <rect x="20" y="18.4" width="27" height="9.6" rx="3.4"/>
     <path d="M62 13h22.5c1.4 0 2.5 1.1 2.5 2.5v11.6H65.4c-1.9 0-3.4-1.5-3.4-3.4z"/>
     <path d="M71.5 27h3c0.4 3.6 2.6 5.8 6.4 6l0.2 3c-5.6 0-9.2-3.6-9.6-9z"/>
     <path d="M78.5 27.2l3-0.3-0.8 4.8-2.2-0.2z"/>
     <path d="M86 14.2l24.5 1.6c1.6 0.1 2.8 1.4 2.8 3v14.6c0 1.6-1.4 2.9-3 2.8L99 35.4c-3.6-0.4-6.2-2-8.2-4.6l-4.8-3.8z"/>
     <rect x="111.5" y="15.6" width="4.6" height="21" rx="1.6"/>
     <g opacity="0.4" fill="#000"><rect x="24" y="19.8" width="1.8" height="6.8" rx="0.9"/><rect x="29" y="19.8" width="1.8" height="6.8" rx="0.9"/><rect x="34" y="19.8" width="1.8" height="6.8" rx="0.9"/><rect x="39" y="19.8" width="1.8" height="6.8" rx="0.9"/>
     <rect x="68" y="16" width="11" height="3.2" rx="1"/></g>`,
  ),
  // Flare pistol: fat, short break-action barrel with a muzzle ring, a chunky
  // frame and a big hammer; a stripe on the barrel.
  flare: svg(
    '0 0 120 48',
    `<rect x="18" y="9" width="44" height="17.5" rx="3.6"/>
     <rect x="13" y="7" width="8.5" height="21.5" rx="2.4"/>
     <path d="M60 9.5h18c2.8 0 5 2.2 5 5v8.6c0 2.6-2.2 4.6-4.8 4.6H60z"/>
     <path d="M76 9.6l6.2-6.6 3.6 2.4-5 8.4z"/>
     <path d="M72 26c4.6 0 11.4 0.2 14.8 3.6 2.6 2.6 3.6 6.4 4.2 10.4l0.4 3.2c0.2 1.6-1 3-2.6 3.1l-8 0.4c-1.6 0.1-2.9-1-3.1-2.6l-0.8-6.4c-0.3-2.4-1.6-3.6-4.2-3.6z"/>
     <path d="M60.5 27.5h3c0.6 4 3 6.4 7.2 6.6v3c-6-0.2-9.6-4-10.2-9.6z"/>
     <g opacity="0.42" fill="#000"><rect x="28" y="9" width="6" height="17.5"/><circle cx="17.2" cy="17.8" r="4.2"/><rect x="50" y="11.8" width="9" height="2.2" rx="1.1"/></g>`,
  ),
  // Harpoon gun: barbed bolt out of the barrel, a line spool under it, pistol
  // grip and a shoulder stock.
  harpoon: svg(
    '0 0 120 48',
    `<path d="M1.5 18.4L13 12.6v4.2h24v3.4H13v4.2z"/>
     <path d="M13 16.8l-4.4-6.6 2.6-0.4 5.2 7z" opacity="0.85"/>
     <path d="M13 20.2l-4.4 6.6 2.6 0.4 5.2-7z" opacity="0.85"/>
     <rect x="30" y="13.2" width="52" height="10.4" rx="3"/>
     <rect x="28" y="11.6" width="5" height="13.6" rx="1.6"/>
     <circle cx="62" cy="31" r="8.4"/>
     <path d="M80 13h10.5c1.6 0 2.8 1.2 2.8 2.8v7.4H80z"/>
     <path d="M80.5 23c3.4 0 6.6 0.2 8.4 2.2 1.6 1.8 2 4.4 2.4 7.4l0.8 8.4c0.2 1.6-1 3-2.6 3.1l-5.4 0.3c-1.6 0.1-2.9-1-3.1-2.6l-1-9c-0.2-2-1.2-3.2-3.2-3.2z"/>
     <path d="M93 14.6l18.6 1.8c1.6 0.2 2.8 1.5 2.8 3.1v10.6c0 1.7-1.5 3-3.2 2.9l-8.2-0.6c-3-0.2-5.4-1.6-7.2-3.8L93 24.6z"/>
     <g opacity="0.42" fill="#000"><circle cx="62" cy="31" r="4.2"/><rect x="38" y="16.6" width="38" height="2" rx="1"/></g>
     <circle cx="62" cy="31" r="1.6"/>`,
  ),
  // "Outboard": an outboard engine turned into a minigun — cowling with a
  // pull-start handle, tiller, the leg with its cavitation plate, and a
  // three-barrel cluster where the propeller should be.
  outboard: svg(
    '0 0 120 48',
    `<rect x="2" y="12.2" width="34" height="3.4" rx="1.2"/>
     <rect x="2" y="17.6" width="34" height="3.4" rx="1.2"/>
     <rect x="2" y="23" width="34" height="3.4" rx="1.2"/>
     <rect x="7" y="10" width="4.4" height="18.6" rx="1.4"/>
     <rect x="24" y="10" width="4.4" height="18.6" rx="1.4"/>
     <path d="M34 13.2h5l4 3.6v5l-4 3.6h-5z"/>
     <path d="M42 15.6h30v7.4H42z"/>
     <path d="M48 23h14l-3 5.2h-8z"/>
     <path d="M70 7.6c0-2.6 2-4.6 4.6-4.6h22.6c5 0 8.8 3.6 8.8 8.4v11.8c0 4.4-3.4 8-8 8H74.6c-2.6 0-4.6-2-4.6-4.6z"/>
     <path d="M104 22.4l11.6 6.2c1.6 0.9 2.2 2.8 1.4 4.4l-0.6 1c-0.9 1.6-2.8 2.2-4.4 1.4L102 29.8z"/>
     <path d="M100.6 4.6l3.2-1.8 5.2 2.4v2.6l-4.6-1.2z"/>
     <rect x="105.6" y="2.2" width="3.4" height="7.6" rx="1.4"/>
     <g opacity="0.4" fill="#000"><rect x="73.5" y="15.6" width="30" height="3" rx="1.5"/><rect x="5" y="13.4" width="2" height="12" rx="1"/><rect x="16" y="13.4" width="2" height="12" rx="1"/></g>`,
  ),
};

/** Side view of the ferry (boarding bar), viewBox 0 0 40 20. */
export const FERRY_SVG = svg(
  '0 0 40 20',
  `<path d="M1.6 11.4h36.8l-3.4 6.2c-0.4 0.8-1.2 1.2-2 1.2H7.6c-0.8 0-1.6-0.4-2-1.1z"/>
   <path d="M8 7.2h22.4l2.4 4.2H6.4z"/>
   <path d="M13 3.6h11.6l1.4 3.6H12z"/>
   <rect x="21.2" y="0.6" width="3.2" height="3.4" rx="0.6"/>
   <g opacity="0.45" fill="#000"><rect x="10" y="8.6" width="2.2" height="1.6" rx="0.4"/><rect x="14" y="8.6" width="2.2" height="1.6" rx="0.4"/><rect x="18" y="8.6" width="2.2" height="1.6" rx="0.4"/><rect x="22" y="8.6" width="2.2" height="1.6" rx="0.4"/><rect x="26" y="8.6" width="2.2" height="1.6" rx="0.4"/></g>`,
  'lf-ico-ferry',
);

/** Ship's wheel spokes and hub (Captain's Favour), viewBox 0 0 100 100. */
export const WHEEL_SVG = (() => {
  let spokes = '';
  for (let i = 0; i < 8; i++) {
    const a = (i * Math.PI) / 4;
    const c = Math.cos(a);
    const s = Math.sin(a);
    const x0 = 50 + c * 14;
    const y0 = 50 + s * 14;
    const x1 = 50 + c * 49;
    const y1 = 50 + s * 49;
    spokes += `<line x1="${x0.toFixed(2)}" y1="${y0.toFixed(2)}" x2="${x1.toFixed(2)}" y2="${y1.toFixed(2)}"/>`;
    // Handle knobs beyond the rim.
    spokes += `<circle cx="${(50 + c * 46).toFixed(2)}" cy="${(50 + s * 46).toFixed(2)}" r="3.6" stroke="none" fill="currentColor"/>`;
  }
  return `<svg class="lf-wheel-svg" viewBox="0 0 100 100" aria-hidden="true" focusable="false">
    <g class="lf-wheel-spokes" stroke="currentColor" stroke-width="3.4" stroke-linecap="round" fill="none">${spokes}
      <circle cx="50" cy="50" r="12.5" stroke-width="3"/></g>
    <circle class="lf-wheel-track" cx="50" cy="50" r="33" fill="none" stroke-width="7"/>
    <circle class="lf-wheel-fill" cx="50" cy="50" r="33" fill="none" stroke-width="7" pathLength="100" stroke-dasharray="0 100" transform="rotate(-90 50 50)"/>
  </svg>`;
})();

/** Ferry horn (H chip), viewBox 0 0 24 24. */
export const HORN_SVG = svg(
  '0 0 24 24',
  `<path d="M3 9.2h4.6L17.4 4c0.8-0.4 1.6 0.2 1.6 1v14c0 0.8-0.8 1.4-1.6 1L7.6 14.8H3c-0.6 0-1-0.4-1-1v-3.6c0-0.6 0.4-1 1-1z"/>
   <path d="M20.6 8.6c1.2 1 1.8 2.2 1.8 3.4s-0.6 2.4-1.8 3.4" fill="none" stroke="currentColor" stroke-width="1.6" stroke-linecap="round"/>
   <rect x="5.4" y="15.6" width="3" height="4.6" rx="1"/>`,
);

/** Crane hook (crane chip), viewBox 0 0 24 24. */
export const CRANE_SVG = svg(
  '0 0 24 24',
  `<rect x="11" y="1" width="2" height="7"/>
   <rect x="8.2" y="7" width="7.6" height="4.6" rx="1.2"/>
   <path d="M12 11.6v3.2c0 0.4 0 0.4 0 0.4c-2 0-3.8 1.6-3.8 3.8 0 2.2 1.8 3.8 4 3.8 2.6 0 4.4-1.8 4.4-4.4h-2.2c0 1.4-0.9 2.2-2.2 2.2-1 0-1.8-0.7-1.8-1.6 0-1 0.8-1.7 1.8-1.7h1V11.6z"/>`,
);

/** Small skull (boss bar), viewBox 0 0 24 24. */
export const SKULL_SVG = svg(
  '0 0 24 24',
  `<path d="M12 2.4c-5 0-8.6 3.4-8.6 8 0 2.8 1.4 4.8 3.2 6v2.8c0 0.8 0.6 1.4 1.4 1.4h1.2v-2h1.4v2h2.8v-2h1.4v2h1.2c0.8 0 1.4-0.6 1.4-1.4v-2.8c1.8-1.2 3.2-3.2 3.2-6 0-4.6-3.6-8-8.6-8z"/>
   <g fill="#000" opacity="0.7"><circle cx="8.6" cy="11.4" r="2.3"/><circle cx="15.4" cy="11.4" r="2.3"/><path d="M12 13.6l1.3 2.4h-2.6z"/></g>`,
);

/** Clock (chapter splash), viewBox 0 0 24 24. */
export const CLOCK_SVG = svg(
  '0 0 24 24',
  `<circle cx="12" cy="12" r="9.2" fill="none" stroke="currentColor" stroke-width="1.8"/>
   <path d="M12 6.4v6l4 2.4" fill="none" stroke="currentColor" stroke-width="1.8" stroke-linecap="round" stroke-linejoin="round"/>`,
);

/** Heart-ish cross (health), viewBox 0 0 24 24. */
export const CROSS_SVG = svg('0 0 24 24', `<path d="M9 3h6v6h6v6h-6v6H9v-6H3V9h6z"/>`);

/** Horde roster silhouettes (help screen), viewBox 0 0 64 64, walking right. */
export const ROSTER_SVG: Record<ZombieKind | 'crawler', string> = {
  shambler: svg(
    '0 0 64 64',
    `<circle cx="30" cy="11" r="6"/>
     <path d="M24 18.6c2.4-1.4 7.6-1.6 10.4 0l4.6 3.2 13.8 2.4c1.2 0.2 1.6 1.6 0.6 2.4-0.4 0.4-1 0.4-1.4 0.4l-12.6-1.4-2.6 1.6-0.4 9.8c0 1-0.4 1.6-1.2 2.4L35.6 41l3.4 17.4c0.2 1.2-0.6 2.2-1.8 2.2h-1.6c-0.8 0-1.6-0.6-1.8-1.4l-3.6-13.6-3.2 13.6c-0.2 0.8-1 1.4-1.8 1.4H23.4c-1.2 0-2-1-1.8-2.2l3-17.8-2.2-3.6V22z"/>
     <path d="M38 30.6l13.4 2.2c1.2 0.2 1.4 1.6 0.4 2.2-0.4 0.2-0.8 0.4-1.2 0.2L37.6 33.4z"/>`,
  ),
  jogger: svg(
    '0 0 64 64',
    `<circle cx="36" cy="10" r="5.6"/>
     <rect x="30.4" y="6.6" width="11.4" height="2.2" rx="1" opacity="0.5"/>
     <path d="M31.6 16.8c2.2-1 5.6-0.8 7.2 0.8l4 4.4 8.4 1.2c1.2 0.2 1.6 1.6 0.6 2.4l-0.6 0.4-9.6-0.8-3-2.4-1.6 9.6 7.2 6.2 1.4 12c0.2 1.2-0.8 2.2-2 2.2-1 0-1.8-0.6-2-1.6l-2.4-9.6-7.2-4.6-5.4 9.4-7.6 2.8c-1 0.4-2.2-0.2-2.4-1.4-0.2-0.8 0.2-1.6 1-2l5.6-2.6 4.8-12.4 1.6-9.6-4.8 3.4-4.2 6c-0.6 0.8-1.6 1-2.4 0.4-0.6-0.4-0.8-1.4-0.4-2l4.6-7.4z"/>
     <rect x="31" y="22" width="6" height="5" rx="0.8" opacity="0.45"/>`,
  ),
  bloater: svg(
    '0 0 64 64',
    `<circle cx="30" cy="10" r="5.4"/>
     <path d="M30 16.4c9.4 0 18.2 7 18.2 18.4 0 8-4.2 13-9.2 15.4l1.2 8.4c0.2 1.2-0.8 2.2-2 2.2h-1.4c-1 0-1.8-0.6-2-1.6l-1.6-7.2h-6.6l-1.6 7.2c-0.2 1-1 1.6-2 1.6h-1.4c-1.2 0-2.2-1-2-2.2l1.2-8.4C15.6 47.8 11.8 42.8 11.8 34.8 11.8 23.4 20.6 16.4 30 16.4z"/>
     <g opacity="0.45" fill="#000"><circle cx="36" cy="30" r="2.6"/><circle cx="24" cy="38" r="2"/><circle cx="38" cy="42" r="1.6"/></g>
     <path d="M44 26l9.4 1.8c1 0.2 1.4 1.4 0.6 2l-0.6 0.4-9.4-0.6z"/>`,
  ),
  medic: svg(
    '0 0 64 64',
    `<circle cx="14" cy="16" r="4.6"/><circle cx="50" cy="16" r="4.6"/>
     <path d="M10.6 22h7.2l1.6 12-1.6 1.4 1.6 21.4c0 1-0.8 1.8-1.8 1.8s-1.8-0.6-1.8-1.6L14 42l-1.6 15c0 1-0.8 1.6-1.8 1.6s-1.8-0.8-1.8-1.8L10.6 35.4 9 34z"/>
     <path d="M46.6 22h7.2l1.6 12-1.6 1.4 1.6 21.4c0 1-0.8 1.8-1.8 1.8s-1.8-0.6-1.8-1.6L50 42l-1.6 15c0 1-0.8 1.6-1.8 1.6s-1.8-0.8-1.8-1.8L46.6 35.4 45 34z"/>
     <rect x="6" y="30.4" width="52" height="3.2" rx="1.2"/>
     <path d="M20 30.4c0-2 1.4-3.6 3.6-3.6h17c2 0 3.6 1.6 3.6 3.6z" opacity="0.8"/>
     <circle cx="21.6" cy="26" r="3.4"/>
     <path d="M30 6.4h4v3.6h3.6v4H34v3.6h-4V14h-3.6v-4H30z" opacity="0.6"/>`,
  ),
  patient: '',
  riot: svg(
    '0 0 64 64',
    `<path d="M22.4 4.6c4.6-1.4 9.4 0.6 10.6 5.2l0.6 3.4H21.2l-1.2-4.4c0.4-2 1.2-3.6 2.4-4.2z"/>
     <rect x="20.6" y="12.6" width="13.4" height="2.4" rx="1" opacity="0.55"/>
     <path d="M19.4 17.2c3-1.2 9.6-1.2 13 0l2.4 3.2v15.6l-2 2.4 2.8 20c0.2 1.2-0.8 2-2 2h-1.4c-1 0-1.6-0.6-1.8-1.6L26.6 44l-3 15c-0.2 1-1 1.6-1.8 1.6h-1.6c-1.2 0-2-1-1.8-2.2l2.6-20-2.6-2.6z"/>
     <path d="M37.6 12.6l13.2 2.8c1.2 0.2 2 1.4 2 2.6v30c0 1.2-0.8 2.2-2 2.4l-13.2 2.8c-1 0.2-2-0.6-2-1.6V14.2c0-1 1-1.8 2-1.6z"/>
     <g opacity="0.45" fill="#000"><rect x="40" y="22" width="9.6" height="2.2" rx="1"/><rect x="21" y="21.6" width="11" height="10" rx="2"/></g>`,
  ),
  bigdave: svg(
    '0 0 64 64',
    `<circle cx="32" cy="8" r="5"/>
     <path d="M32 13.6c11.6 0 22.4 8.4 22.4 22.6 0 9.6-5 15.4-11 18.2l1.2 5.4c0.2 1-0.6 2-1.6 2h-3.4c-0.8 0-1.6-0.6-1.6-1.4l-0.8-4.8h-10.4l-0.8 4.8c0 0.8-0.8 1.4-1.6 1.4H21c-1 0-1.8-1-1.6-2l1.2-5.4c-6-2.8-11-8.6-11-18.2 0-14.2 10.8-22.6 22.4-22.6z"/>
     <path d="M24 24h16v22.4c-4.6 2-11.4 2-16 0z" opacity="0.45" fill="#000"/>`,
  ),
  crawler: svg(
    '0 0 64 64',
    `<circle cx="50.6" cy="40.6" r="5"/>
     <path d="M10 46.4c4-2.4 14.6-4 24.6-4 4.2 0 8 0.6 10.4 1.6l2.2 2.2-1.6 3.2-8.4 2.4 6.6 3.8c1 0.6 1.2 1.8 0.4 2.6-0.4 0.4-1 0.6-1.6 0.4l-10.4-3.4-11.8 0.6-9.6 4.6c-1 0.4-2.2 0-2.6-1-0.4-0.8 0-1.8 0.8-2.2l6.6-3.4-4.4-1.2C8.4 51.8 8 47.8 10 46.4z"/>
     <path d="M44.8 48.4l11.2 6c1 0.6 1 2 0 2.6-0.4 0.2-1 0.2-1.4 0l-11-4.4z"/>`,
  ),
};

/** Coin (money chip), viewBox 0 0 24 24. */
export const COIN_SVG = svg(
  '0 0 24 24',
  `<circle cx="12" cy="12" r="9"/><path d="M12.9 6.6v1.3c1.5 0.2 2.6 1 3 2.3l-1.9 0.7c-0.3-0.8-1-1.2-2-1.2-1.1 0-1.7 0.5-1.7 1.1 0 0.7 0.6 1 2.2 1.3 2.2 0.5 3.5 1.3 3.5 3.1 0 1.5-1.1 2.6-3.1 2.9v1.3h-1.8v-1.3c-1.7-0.2-2.9-1.1-3.3-2.6l2-0.6c0.3 0.9 1 1.4 2.2 1.4 1.2 0 1.9-0.5 1.9-1.2 0-0.7-0.6-1-2.1-1.3-2.4-0.5-3.6-1.3-3.6-3 0-1.4 1.1-2.5 2.9-2.8V6.6z" fill="#000" opacity="0.55"/>`,
);
