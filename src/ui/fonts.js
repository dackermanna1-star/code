// UI font families + loading. The families themselves are declared in src/ui/fonts.json
// (dev: served as /__fonts.css; build: inlined as base64 @font-face by tools/build.mjs).
//
// Roles:
//   ui     — dialogue, menus, labels (pixel font; crisp at its native grid)
//   mono   — terminals, VHS timestamps, intercom text
//   typed  — typewritten / mimeographed documents, forms, index cards
//   hand   — casual handwriting (Tess's sketchbook, Walt, Leah, kids)
//   script — looser / older handwriting (Adair, Denise, Haupt, the Colonel)

export const FONT = {
  ui: 'Pixelify Sans',
  uiAlt: 'DotGothic16',
  mono: 'VT323',
  typed: 'Special Elite',
  hand: 'Patrick Hand',
  script: 'Caveat',
};

// One canvas-font spec per face we actually draw with; document.fonts.load() needs a size.
const LOAD_SPECS = [
  `400 24px "${FONT.ui}"`, `600 24px "${FONT.ui}"`, `400 16px "${FONT.uiAlt}"`,
  `400 20px "${FONT.mono}"`, `400 20px "${FONT.typed}"`, `400 20px "${FONT.hand}"`,
  `400 24px "${FONT.script}"`, `700 24px "${FONT.script}"`,
];

let loaded = false;

/** Load every UI face before the first draw (glyph rasters are cached, so a fallback
 *  face drawn too early would stick). Never rejects; gives up after `timeoutMs`. */
export async function loadFonts(timeoutMs = 4000) {
  if (loaded || typeof document === 'undefined' || !document.fonts) { loaded = true; return; }
  const all = Promise.all(LOAD_SPECS.map((s) => document.fonts.load(s, 'AaQq09').catch(() => null)));
  await Promise.race([all, new Promise((r) => setTimeout(r, timeoutMs))]);
  loaded = true;
}

export const fontsLoaded = () => loaded;
