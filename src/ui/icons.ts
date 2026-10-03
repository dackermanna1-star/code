// Friendly inline SVG icons for the HUD (stroke style, rounded).

const S = (body: string, vb = '0 0 48 48') =>
  `<svg viewBox="${vb}" fill="none" stroke="currentColor" stroke-width="3.2" stroke-linecap="round" stroke-linejoin="round" aria-hidden="true">${body}</svg>`;

export const ICONS: Record<string, string> = {
  back: S('<path d="M28 12 16 24l12 12"/><path d="M17 24h17"/>'),
  book: S('<path d="M8 10c6-2 11-1 16 3 5-4 10-5 16-3v26c-6-2-11-1-16 3-5-4-10-5-16-3z"/><path d="M24 13v26"/>'),
  music: S('<path d="M18 34V12l18-4v22"/><circle cx="14" cy="34" r="4.5"/><circle cx="32" cy="30" r="4.5"/>'),
  musicOff: S('<path d="M18 34V12l18-4v22"/><circle cx="14" cy="34" r="4.5"/><circle cx="32" cy="30" r="4.5"/><path d="M8 8l32 32"/>'),
  sound: S('<path d="M10 19h7l9-7v24l-9-7h-7z"/><path d="M32 18c2 2 3 4 3 6s-1 4-3 6"/><path d="M36 13c3.5 3 5 7 5 11s-1.5 8-5 11"/>'),
  soundOff: S('<path d="M10 19h7l9-7v24l-9-7h-7z"/><path d="M33 19l9 10M42 19l-9 10"/>'),
  reset: S('<path d="M38 24a14 14 0 1 1-4-10"/><path d="M36 8v8h-8"/>'),
  sparkle: S('<path d="M24 6l3 10 10 3-10 3-3 10-3-10-10-3 10-3z"/><path d="M38 32l1.5 4 4 1.5-4 1.5-1.5 4-1.5-4-4-1.5 4-1.5z"/>'),
  full: S('<path d="M9 18V9h9M30 9h9v9M39 30v9h-9M18 39H9v-9"/>'),
  fridge: S('<rect x="12" y="5" width="24" height="38" rx="6"/><path d="M12 19h24"/><path d="M17 11v4M17 24v7"/>'),
  spice: S('<rect x="9" y="18" width="11" height="22" rx="3"/><path d="M11 18v-4h7v4"/><rect x="27" y="14" width="13" height="26" rx="4"/><path d="M30 14v-5h7v5"/><path d="M13 12h1M16 10h1"/>'),
  knife: S('<path d="M7 34 33 8c4 5 3 12-3 17L18 34"/><path d="M7 34l-2 4 6-1 7-3"/>'),
  peeler: S('<path d="M24 40V24"/><rect x="18" y="8" width="12" height="16" rx="4"/><path d="M21 13h6"/>'),
  rollingPin: S('<rect x="11" y="18" width="26" height="12" rx="6"/><path d="M4 24h7M37 24h7"/>'),
  masher: S('<path d="M24 6v20"/><path d="M12 26h24l-3 14H15z"/><path d="M18 31v4M24 31v4M30 31v4"/>'),
  whisk: S('<path d="M24 26v16"/><path d="M24 26c-9-6-9-20 0-20s9 14 0 20z"/><path d="M24 26c-4-6-4-18 0-18s4 12 0 18z"/>'),
  flip: S('<path d="M14 30c-4-8 2-18 12-18 6 0 10 4 11 9"/><path d="M39 15l-2 6-6-2"/><ellipse cx="22" cy="35" rx="13" ry="4"/>'),
  spoon: S('<ellipse cx="18" cy="16" rx="8" ry="10"/><path d="M23 24l16 16"/>'),
  board: S('<rect x="6" y="14" width="32" height="22" rx="6"/><circle cx="34" cy="20" r="2"/><path d="M38 25h5"/>'),
  bowl: S('<path d="M6 22h36c0 10-8 18-18 18S6 32 6 22z"/><path d="M14 16c2-2 5-2 7 0M24 14c2-2 5-2 7 0"/>'),
  pan: S('<ellipse cx="20" cy="26" rx="14" ry="9"/><path d="M33 23l11-4"/><path d="M14 24c2-2 6-2 8 0"/>'),
  grill: S('<rect x="6" y="14" width="28" height="22" rx="5"/><path d="M12 14v22M18 14v22M24 14v22M30 14v22M34 22l10-3"/>'),
  pot: S('<path d="M10 18h28v16c0 4-3 6-7 6H17c-4 0-7-2-7-6z"/><path d="M6 20h4M38 20h4"/><path d="M18 12c0-2 2-3 2-5M26 12c0-2 2-3 2-5"/>'),
  oven: S('<rect x="7" y="7" width="34" height="34" rx="6"/><rect x="13" y="18" width="22" height="16" rx="3"/><circle cx="15" cy="12" r="1.5"/><circle cx="22" cy="12" r="1.5"/>'),
  blender: S('<path d="M15 8h18l-3 22H18z"/><rect x="14" y="30" width="20" height="11" rx="3"/><circle cx="24" cy="36" r="2"/><path d="M19 16h10"/>'),
  toaster: S('<rect x="7" y="16" width="34" height="22" rx="8"/><path d="M16 16v-6M26 16v-6"/><path d="M41 26h3"/>'),
  fryer: S('<rect x="8" y="20" width="32" height="20" rx="5"/><path d="M12 20V12h16v8"/><path d="M28 12l10-4"/><path d="M15 27c2 2 4 2 6 0s4-2 6 0"/>'),
  microwave: S('<rect x="5" y="11" width="38" height="26" rx="5"/><rect x="10" y="16" width="20" height="16" rx="3"/><path d="M36 17v2M36 23v2M36 29v2"/>'),
  freezer: S('<path d="M24 6v36M8 15l32 18M40 15 8 33"/><path d="M20 9l4 4 4-4M20 39l4-4 4 4"/>'),
  plate: S('<circle cx="24" cy="24" r="16"/><circle cx="24" cy="24" r="9"/>'),
  bell: S('<path d="M10 34h28"/><path d="M13 34c0-7 5-12 11-12s11 5 11 12"/><path d="M24 22v-4M21 18h6"/><path d="M8 38h32"/>'),
  trash: S('<path d="M10 14h28"/><path d="M19 14V9h10v5"/><path d="M13 14l2 26h18l2-26"/><path d="M20 20v14M28 20v14"/>'),
  close: S('<path d="M13 13l22 22M35 13 13 35"/>'),
  star: S('<path d="M24 6l5 11 12 1-9 8 3 12-11-6-11 6 3-12-9-8 12-1z"/>'),
  chef: S('<path d="M14 26c-5 0-8-4-7-8s5-6 9-4c1-5 5-8 8-8s7 3 8 8c4-2 8 0 9 4s-2 8-7 8v10H14z"/><path d="M14 32h20"/>'),
};

export function icon(name: string): string {
  return ICONS[name] ?? ICONS.sparkle;
}

/** Category tab icons drawn as simple shapes. */
export const TAB_COLORS: Record<string, string> = {
  fruit: '#ff7a7a',
  veg: '#7cc96a',
  meat: '#e8857a',
  seafood: '#6fb8e8',
  dairy: '#f2d06b',
  bakery: '#e0a565',
  sweets: '#f59ac2',
  pantry: '#b9a6f2',
};
