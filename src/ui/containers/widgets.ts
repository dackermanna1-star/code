/**
 * Vector GUI sprites in Minecraft's shapes (drawn in GUI pixel units, crisp at any scale):
 * crafting/furnace arrows, furnace flame, brewing bubbles/arrow/fuel bar, empty-slot hints
 * (armour silhouettes, shield, lapis, bottle, blaze powder), anvil hammer, plus sign, red cross.
 */
const NS = 'http://www.w3.org/2000/svg';

export function svgEl(w: number, h: number, inner: string): SVGSVGElement {
  const s = document.createElementNS(NS, 'svg');
  s.setAttribute('viewBox', `0 0 ${w} ${h}`);
  s.setAttribute('width', String(w));
  s.setAttribute('height', String(h));
  s.innerHTML = inner;
  return s;
}

let uid = 0;
const id = (p: string) => `${p}${++uid}`;

/** Arrow pointing right (vanilla 22x15 / furnace 24x17). Returns svg + progress setter (0..1). */
export function arrowWidget(w = 22, h = 15): { svg: SVGSVGElement; set(p: number): void } {
  const mid = h / 2;
  const sh = Math.round(h * 0.34); // shaft half height
  const hx = w - Math.round(h * 0.62);
  const path = `M0.5 ${mid - sh / 2 - 0.5} H${hx} V0.5 L${w - 0.5} ${mid} L${hx} ${h - 0.5} V${mid + sh / 2 + 0.5} H0.5 Z`;
  const cid = id('arrowclip');
  const gid = id('arrowg');
  const svg = svgEl(w, h, `
    <defs>
      <clipPath id="${cid}"><rect x="0" y="0" width="0" height="${h}"/></clipPath>
      <linearGradient id="${gid}" x1="0" y1="0" x2="0" y2="1"><stop offset="0" stop-color="#ffffff"/><stop offset="1" stop-color="#e2e2e2"/></linearGradient>
    </defs>
    <path d="${path}" fill="#8b8b8b" stroke="#6f6f6f" stroke-width="0.8" stroke-linejoin="round"/>
    <path d="${path}" fill="none" stroke="#a9a9a9" stroke-width="0.5" transform="translate(0.4 0.4)" opacity="0.6"/>
    <path d="${path}" fill="url(#${gid})" stroke="#c9c9c9" stroke-width="0.6" stroke-linejoin="round" clip-path="url(#${cid})"/>`);
  const rect = svg.querySelector('clipPath rect') as SVGRectElement;
  return { svg, set: (p: number) => rect.setAttribute('width', String(Math.max(0, Math.min(1, p)) * w)) };
}

const FLAME_PATH = 'M7 0.6 C7.6 3 9.4 3.6 10.2 5.6 C10.9 4.6 10.8 3.8 10.6 2.9 C12.6 4.7 13.4 7 13.2 9 C13 11.8 10.6 13.4 7 13.4 C3.4 13.4 1 11.8 0.8 9 C0.6 6.6 1.8 5 3.2 3.6 C3.2 5 3.6 5.8 4.4 6.4 C4.4 3.8 5.4 2 7 0.6 Z';
/** Furnace flame 14x14 (burn time left, fills from the bottom). */
export function flameWidget(): { svg: SVGSVGElement; set(p: number): void } {
  const cid = id('flameclip'), gid = id('flameg'), gid2 = id('flamec');
  const svg = svgEl(14, 14, `
    <defs>
      <clipPath id="${cid}"><rect x="0" y="14" width="14" height="0"/></clipPath>
      <linearGradient id="${gid}" x1="0" y1="1" x2="0" y2="0"><stop offset="0" stop-color="#ff4d00"/><stop offset="0.45" stop-color="#ff9a00"/><stop offset="1" stop-color="#ffe066"/></linearGradient>
      <radialGradient id="${gid2}" cx="0.5" cy="0.78" r="0.42"><stop offset="0" stop-color="#fffbe0"/><stop offset="1" stop-color="#ffd23f" stop-opacity="0"/></radialGradient>
    </defs>
    <path d="${FLAME_PATH}" fill="#8b8b8b" stroke="#6f6f6f" stroke-width="0.7"/>
    <g clip-path="url(#${cid})"><path d="${FLAME_PATH}" fill="url(#${gid})" stroke="#c43a00" stroke-width="0.6"/><ellipse cx="7" cy="10.4" rx="3.6" ry="2.8" fill="url(#${gid2})"/></g>`);
  const rect = svg.querySelector('clipPath rect') as SVGRectElement;
  return {
    svg,
    set: (p: number) => {
      const hgt = Math.max(0, Math.min(1, p)) * 13 + (p > 0 ? 1 : 0);
      rect.setAttribute('y', String(14 - hgt));
      rect.setAttribute('height', String(hgt));
    },
  };
}

/** Brewing stand: bubbles (12x29), down arrow (9x28), blaze fuel bar (18x4). */
export function brewingWidgets() {
  const bid = id('bub'), aid = id('barr');
  const bubbles = svgEl(12, 29, `
    <defs><clipPath id="${bid}"><rect x="0" y="29" width="12" height="0"/></clipPath></defs>
    <g fill="none" stroke="#7a7a7a" stroke-width="1"><circle cx="6" cy="24" r="3.2"/><circle cx="3.5" cy="15" r="2.4"/><circle cx="8.5" cy="8" r="2"/><circle cx="4.5" cy="2.6" r="1.6"/></g>
    <g clip-path="url(#${bid})" fill="#f5f5ff" stroke="#c0c8ff" stroke-width="0.6"><circle cx="6" cy="24" r="3.2"/><circle cx="3.5" cy="15" r="2.4"/><circle cx="8.5" cy="8" r="2"/><circle cx="4.5" cy="2.6" r="1.6"/></g>`);
  const arrowPath = 'M2 0.5 H7 V18 H8.5 L4.5 27.5 L0.5 18 H2 Z';
  const arrow = svgEl(9, 28, `
    <defs><clipPath id="${aid}"><rect x="0" y="0" width="9" height="0"/></clipPath></defs>
    <path d="${arrowPath}" fill="#8b8b8b" stroke="#6f6f6f" stroke-width="0.7"/>
    <path d="${arrowPath}" fill="#ffffff" stroke="#d0d0d0" stroke-width="0.6" clip-path="url(#${aid})"/>`);
  const fuel = svgEl(18, 4, `<rect x="0" y="0" width="18" height="4" rx="0.8" fill="#2b1a0e"/><rect class="f" x="0.5" y="0.5" width="0" height="3" rx="0.6" fill="#f0a020"/><rect class="g" x="0.5" y="0.5" width="0" height="1.2" fill="#ffe08a"/>`);
  const bRect = bubbles.querySelector('clipPath rect') as SVGRectElement;
  const aRect = arrow.querySelector('clipPath rect') as SVGRectElement;
  const fRects = [fuel.querySelector('.f') as SVGRectElement, fuel.querySelector('.g') as SVGRectElement];
  return {
    bubbles, arrow, fuel,
    setBubbles(p: number) {
      const hh = p * 29;
      bRect.setAttribute('y', String(29 - hh));
      bRect.setAttribute('height', String(hh));
    },
    setArrow(p: number) {
      aRect.setAttribute('height', String(Math.max(0, Math.min(1, p)) * 28));
    },
    setFuel(p: number) {
      for (const r of fRects) r.setAttribute('width', String(Math.max(0, Math.min(1, p)) * 17));
    },
  };
}

/** Brewing stand frame art (the pipes between ingredient and bottles), drawn behind the slots. */
export function brewingFrame(): SVGSVGElement {
  return svgEl(176, 80, `
    <g fill="none" stroke-linecap="round" stroke-linejoin="round">
      <path d="M63 35 V45 Q63 50 58 50 M95 35 V45 Q95 50 100 50 M79 35 V56" stroke="#5a5a5a" stroke-width="4.2"/>
      <path d="M63 35 V45 Q63 50 58 50 M95 35 V45 Q95 50 100 50 M79 35 V56" stroke="#9a9a9a" stroke-width="2.2"/>
      <path d="M63 33 H95" stroke="#5a5a5a" stroke-width="4.2"/><path d="M63 33 H95" stroke="#9a9a9a" stroke-width="2.2"/>
      <path d="M26 35 V40 H60" stroke="#5a5a5a" stroke-width="2.6" opacity="0.55"/>
    </g>`);
}

/** Plus sign (anvil) and red cross (invalid combination). */
export function plusSign(): SVGSVGElement {
  return svgEl(13, 13, `<path d="M5 0.5 H8 V5 H12.5 V8 H8 V12.5 H5 V8 H0.5 V5 H5 Z" fill="#8b8b8b" stroke="#5c5c5c" stroke-width="0.7"/>`);
}
export function redCross(): SVGSVGElement {
  return svgEl(28, 21, `<g stroke-linecap="round"><path d="M8 4 L20 17 M20 4 L8 17" stroke="#3a0000" stroke-width="5"/><path d="M8 4 L20 17 M20 4 L8 17" stroke="#ff3030" stroke-width="3"/></g>`);
}
export function hammerIcon(): SVGSVGElement {
  return svgEl(16, 16, `<g transform="rotate(-35 8 8)"><rect x="7" y="5" width="2.2" height="10" rx="0.6" fill="#7a5230" stroke="#3d2814" stroke-width="0.5"/><rect x="3" y="1.5" width="10" height="4.5" rx="0.8" fill="#bdbdbd" stroke="#4a4a4a" stroke-width="0.6"/></g>`);
}

/** Empty-slot hint silhouettes (vanilla draws light outlines of the expected item). */
const HINTS: Record<string, string> = {
  helmet: 'M3 10 V7 C3 3.5 5.4 2 8 2 C10.6 2 13 3.5 13 7 V10 H11 V8 H5 V10 Z',
  chestplate: 'M4 2 H6.5 C6.5 3.4 7.2 4 8 4 C8.8 4 9.5 3.4 9.5 2 H12 L14.5 4.5 L13 7 L12 6.4 V14 H4 V6.4 L3 7 L1.5 4.5 Z',
  leggings: 'M3.5 2 H12.5 V14 H9.6 L8.6 6.5 H7.4 L6.4 14 H3.5 Z',
  boots: 'M2.5 7 H6.5 V11 H2 V13.5 H7 Z M9.5 7 H13.5 V13.5 H9 V11 H9.5 Z',
  shield: 'M3 2.5 H13 V8 C13 11 10.6 13 8 14 C5.4 13 3 11 3 8 Z',
  lapis: 'M8 2 L13 6 L11.5 12.5 H4.5 L3 6 Z',
  bottle: 'M6.5 1.5 H9.5 V4.5 C12 5.5 13 7.3 13 9.5 C13 12.4 10.8 14.5 8 14.5 C5.2 14.5 3 12.4 3 9.5 C3 7.3 4 5.5 6.5 4.5 Z',
  blaze_powder: 'M8 2 C9 4.5 12 5.5 12 9 C12 12 10 14 8 14 C6 14 4 12 4 9 C4 7.2 5 6 6 5 C6 6.5 6.6 7.2 7.3 7.4 C7 5.4 7.2 3.6 8 2 Z',
  fuel: 'M8 2 C9 4.5 12 5.5 12 9 C12 12 10 14 8 14 C6 14 4 12 4 9 C4 7.2 5 6 6 5 C6 6.5 6.6 7.2 7.3 7.4 C7 5.4 7.2 3.6 8 2 Z',
};
export function slotHint(kind: string): SVGSVGElement | null {
  const p = HINTS[kind];
  if (!p) return null;
  return svgEl(16, 16, `<path d="${p}" fill="#7a7a7a" stroke="#6b6b6b" stroke-width="0.6" stroke-linejoin="round"/><path d="${p}" fill="none" stroke="#a4a4a4" stroke-width="0.5" transform="translate(0.5 0.5)" opacity="0.55"/>`);
}

/** Small lapis/level badge for enchant buttons (1/2/3 dots). */
export function lapisBadge(n: number, enabled: boolean): SVGSVGElement {
  const fill = enabled ? '#3b62d9' : '#4b4b5a';
  const hi = enabled ? '#9ab4ff' : '#6a6a7a';
  return svgEl(16, 16, `<rect x="1" y="1" width="14" height="14" rx="2.5" fill="${enabled ? '#26355f' : '#2e2e33'}" stroke="#111" stroke-width="0.8"/>
    <path d="M8 2.8 L12.2 6.2 L10.9 11.8 H5.1 L3.8 6.2 Z" fill="${fill}" stroke="${hi}" stroke-width="0.6"/>
    <text x="11.6" y="14.4" font-size="6.4" font-weight="800" font-family="'Pixelify Sans','Inter Tight',system-ui,sans-serif" fill="${enabled ? '#80ff20' : '#5a6a50'}" stroke="#111" stroke-width="0.25" text-anchor="middle">${n}</text>`);
}

/** Open enchanting book (top-left of the enchanting window). */
export function enchantBook(): SVGSVGElement {
  return svgEl(42, 30, `
    <defs><linearGradient id="bkc" x1="0" y1="0" x2="1" y2="1"><stop offset="0" stop-color="#7a3f1d"/><stop offset="1" stop-color="#4a2410"/></linearGradient></defs>
    <path d="M2 7 L21 4 L40 7 L40 27 L21 24 L2 27 Z" fill="url(#bkc)" stroke="#2a1408" stroke-width="0.8"/>
    <path d="M4 7.5 L21 5.2 V22.6 L4 25 Z" fill="#efe4c4" stroke="#b8a77a" stroke-width="0.5"/>
    <path d="M38 7.5 L21 5.2 V22.6 L38 25 Z" fill="#f6edd2" stroke="#b8a77a" stroke-width="0.5"/>
    <g stroke="#8b7a55" stroke-width="0.6" opacity="0.8"><path d="M7 10 L18 8.6 M7 13 L18 11.6 M7 16 L16 14.8 M24 8.6 L35 10 M24 11.6 L35 13 M24 14.6 L33 15.8"/></g>
    <path d="M21 4.5 V24" stroke="#5a3a1a" stroke-width="0.8"/>`);
}
