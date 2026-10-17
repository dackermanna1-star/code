// UI design tokens: colours and font presets. One place to retune the whole UI's look.
// Visual language: dark worn institutional steel + nicotine paper, muted greens/creams, red accents.
import { PAL } from '../art/palette.js';
import { FONT } from './fonts.js';
import { font } from './text.js';

export const W = 960, H = 540;

export const C = {
  // steel panels
  panel: 'rgba(9,10,13,0.88)', panelSolid: '#0c0d11', panelHi: '#4b4c57', panelMid: '#30313b',
  panelLo: '#17181e', rivet: '#7d7b84', rivetHi: '#a8a5a8', scuff: '#23242c',
  // text
  text: '#e8e0c8', textHi: '#fff6dc', textDim: '#9c9888', textMute: '#6c6a70',
  think: '#a9ae96', thinkHi: '#d4d8bf',
  red: '#d0453c', redDeep: PAL.red_d, redDark: '#3a0a10', crimson: PAL.crimson_l,
  dim: '#7d7a76',
  // paper & ink
  paper: '#d9cca6', paperHi: '#e7dcbc', paperLo: '#b9aa84', paperEdge: '#9b8c69', paperShadow: 'rgba(0,0,0,0.45)',
  rule: '#93a3b5', margin: '#c27466',
  pencil: '#4f4e55', pencilLt: '#7a7880', ink: '#1e1d23', inkBlue: '#23305c', inkBrown: '#3b2416',
  mimeo: '#5a3d86', stampRed: '#b3262c',
  // accents
  green: PAL.green, greenD: PAL.green_d, greenL: PAL.green_l, mint: PAL.mint,
  amber: PAL.amber_l, brass: PAL.brass, gold: PAL.gold,
  crt: '#a9cdb4', crtDim: '#5f7d68', crtBg: '#070a08',
};

// Font presets. DotGothic16 is drawn at 16 (1:1 dots) or 32 (2×, matching the 2-px art grid).
export const F = {
  get body() { return font({ family: FONT.uiAlt, size: 32, lineHeight: 36 }); },
  get bodyIt() { return font({ family: FONT.uiAlt, size: 32, lineHeight: 36, pixelItalic: 2 }); },
  get small() { return font({ family: FONT.uiAlt, size: 16, lineHeight: 20 }); },
  get smallIt() { return font({ family: FONT.uiAlt, size: 16, lineHeight: 20, pixelItalic: 1 }); },
  get mono() { return font({ family: FONT.mono, size: 32, lineHeight: 32 }); },
  get monoS() { return font({ family: FONT.mono, size: 24, lineHeight: 24 }); },
  get monoL() { return font({ family: FONT.mono, size: 40, lineHeight: 40 }); },
  get typed() { return font({ family: FONT.typed, size: 20, lineHeight: 28, threshold: 0.42 }); },
  get typedS() { return font({ family: FONT.typed, size: 16, lineHeight: 22, threshold: 0.42 }); },
  get typedL() { return font({ family: FONT.typed, size: 28, lineHeight: 34, threshold: 0.42 }); },
  get typedXL() { return font({ family: FONT.typed, size: 44, lineHeight: 50, threshold: 0.42 }); },
  get hand() { return font({ family: FONT.hand, size: 24, lineHeight: 30, threshold: 0.45 }); },
  get handS() { return font({ family: FONT.hand, size: 20, lineHeight: 24, threshold: 0.45 }); },
  get handL() { return font({ family: FONT.hand, size: 30, lineHeight: 36, threshold: 0.45 }); },
  get script() { return font({ family: FONT.script, size: 30, lineHeight: 34, threshold: 0.45 }); },
  get scriptL() { return font({ family: FONT.script, size: 36, lineHeight: 40, weight: 700, threshold: 0.45 }); },
};

/** Handwriting per document `hand` (TECH §16): face, size, ink colour, slant. */
export const HANDS = {
  walt:    { family: FONT.hand, size: 24, color: '#3d3a3e', skew: 0, lineHeight: 30 },        // carpenter's pencil
  adair:   { family: FONT.script, size: 30, color: '#23305c', skew: -0.08, lineHeight: 32 },  // neat blue-black ink
  leah:    { family: FONT.hand, size: 24, color: '#1b1a20', skew: 0, lineHeight: 30 },        // black felt-tip
  denise:  { family: FONT.script, size: 30, color: '#2b3f86', skew: -0.22, lineHeight: 32 },  // ballpoint, leans hard right
  haupt:   { family: FONT.script, size: 30, color: '#3b2416', skew: -0.05, lineHeight: 32, weight: 700 }, // fountain pen
  kid:     { family: FONT.hand, size: 30, color: '#a8382f', skew: 0.04, lineHeight: 38 },     // crayon
  colonel: { family: FONT.script, size: 32, color: '#4a1a12', skew: -0.12, lineHeight: 34, weight: 700 }, // sepia copperplate
  tess:    { family: FONT.hand, size: 24, color: '#4f4e55', skew: 0, lineHeight: 30 },        // graphite
  lutz:    { family: FONT.hand, size: 22, color: '#2f4f3a', skew: 0, lineHeight: 28 },        // green felt-tip
};
export const handFont = (hand) => {
  const h = HANDS[hand] || HANDS.tess;
  return { font: font({ family: h.family, size: h.size, lineHeight: h.lineHeight, skew: h.skew, weight: h.weight || 400, threshold: 0.45 }), color: h.color };
};

// Chapter titles (DESIGN §6) for the pause screen, sketchbook and save summaries.
export const CHAPTERS = [
  ['PROLOGUE', 'Kettle Run'], ['I', 'After Hours'], ['II', 'First Period'], ['III', 'Custodial'],
  ['IV', 'Attendance'], ['V', 'Upstairs'], ['VI', 'Passing Time'], ['VII', 'Assembly'],
  ['VIII', 'The Register'], ['EPILOGUE', ''],
];
export const chapterTitle = (n) => {
  const c = CHAPTERS[Math.max(0, Math.min(CHAPTERS.length - 1, n | 0))];
  return c[1] ? `${c[0]} — ${c[1]}` : c[0];
};
