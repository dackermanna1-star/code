// The zombie mode's title lettering, drawn as SVG from hand-made glyphs (no font needed,
// so it looks the same on every machine): chamfered, condensed block capitals on a 9 x 16
// grid, sun-bleached at the top and bloodied at the foot, with worn edges, a few drips and
// a slight hand-cut wobble per letter.
//
//   el.innerHTML = titleSVG('DEAD OF DUST', { id: 'mm' });

const W = 9, H = 16, T = 3.2, C = 2, GAP = 1.5, SPACE = 4.2;
const MID0 = 6.4, MID1 = 9.6;

// a glyph = polygons (even-odd: an inner ring cuts the counter)
const GLYPHS = {
  D: [[[0, 0], [W - C, 0], [W, C], [W, H - C], [W - C, H], [0, H]], [[T, T], [W - T - 0.8, T], [W - T, T + 0.8], [W - T, H - T - 0.8], [W - T - 0.8, H - T], [T, H - T]]],
  E: [[[0, 0], [W, 0], [W, T], [T, T], [T, MID0], [W - 1.5, MID0], [W - 1.5, MID1], [T, MID1], [T, H - T], [W, H - T], [W, H], [0, H]]],
  A: [[[0, H], [0, C + 1], [C + 1, 0], [W - C - 1, 0], [W, C + 1], [W, H], [W - T, H], [W - T, 10], [T, 10], [T, H]], [[T, 7], [W - T, 7], [W - T, T + 0.8], [W - T - 0.8, T], [T + 0.8, T], [T, T + 0.8]]],
  O: [[[C, 0], [W - C, 0], [W, C], [W, H - C], [W - C, H], [C, H], [0, H - C], [0, C]], [[T + 0.8, T], [W - T - 0.8, T], [W - T, T + 0.8], [W - T, H - T - 0.8], [W - T - 0.8, H - T], [T + 0.8, H - T], [T, H - T - 0.8], [T, T + 0.8]]],
  F: [[[0, 0], [W, 0], [W, T], [T, T], [T, MID0], [W - 1.5, MID0], [W - 1.5, MID1], [T, MID1], [T, H], [0, H]]],
  U: [[[0, 0], [T, 0], [T, H - T - 0.8], [T + 0.8, H - T], [W - T - 0.8, H - T], [W - T, H - T - 0.8], [W - T, 0], [W, 0], [W, H - C], [W - C, H], [C, H], [0, H - C]]],
  S: [[[C, 0], [W, 0], [W, T], [T, T], [T, MID0], [W - C, MID0], [W, MID0 + C], [W, H - C], [W - C, H], [0, H], [0, H - T], [W - T, H - T], [W - T, MID1], [C, MID1], [0, MID1 - C], [0, C]]],
  T: [[[0, 0], [W, 0], [W, T], [W / 2 + T / 2, T], [W / 2 + T / 2, H], [W / 2 - T / 2, H], [W / 2 - T / 2, T], [0, T]]],
};

// drips: letter index -> [[x in the glyph, length]]
const DRIPS = { 0: [[1.6, 3.2]], 2: [[7.4, 2.2]], 6: [[4.5, 4.1]], 9: [[2.2, 2.6], [7.6, 1.6]] };

// a fixed wobble per letter (deg, y), so the title is the same every boot
const WOBBLE = [[-1.2, 0.2], [0.8, -0.3], [-0.6, 0.35], [1.4, -0.1], [0, 0], [-1, 0.25], [0.9, -0.2], [0, 0], [-1.3, 0.3], [0.7, -0.25], [-0.5, 0.1], [1.1, -0.3]];

const f = (v) => +v.toFixed(2);

/** The title as an SVG string (viewBox in glyph units; size it with CSS). */
export function titleSVG(text, { id = 't' } = {}) {
  let x = 0, li = 0;
  const parts = [], drips = [];
  for (const ch of text) {
    if (ch === ' ') { x += SPACE; continue; }
    const g = GLYPHS[ch];
    if (!g) continue;
    const [rot, dy] = WOBBLE[li % WOBBLE.length];
    const d = g.map((ring) => 'M' + ring.map(([px, py]) => `${f(px)} ${f(py)}`).join('L') + 'Z').join('');
    parts.push(`<path transform="translate(${f(x)} ${f(dy)}) rotate(${rot} ${W / 2} ${H / 2})" d="${d}"/>`);
    for (const [dx, len] of DRIPS[li] || []) {
      const px = x + dx, py = H + dy - 0.4;
      drips.push(`<path d="M${f(px - 0.55)} ${f(py)}L${f(px + 0.55)} ${f(py)}L${f(px + 0.32)} ${f(py + len)}A0.62 0.62 0 1 1 ${f(px - 0.32)} ${f(py + len)}Z"/>`);
    }
    x += W + GAP;
    li++;
  }
  const w = x - GAP;
  const vb = `-1 -1 ${f(w + 2)} ${H + 7}`;
  return `<svg class="fe-title-svg" viewBox="${vb}" xmlns="http://www.w3.org/2000/svg" role="img" aria-label="${text}">
<defs>
  <linearGradient id="${id}-fill" x1="0" y1="0" x2="0" y2="1">
    <stop offset="0" stop-color="#fbf1df"/><stop offset="0.48" stop-color="#e3c9a0"/>
    <stop offset="0.8" stop-color="#b9573a"/><stop offset="1" stop-color="#7e1414"/>
  </linearGradient>
  <filter id="${id}-rough" x="-5%" y="-10%" width="110%" height="130%">
    <feTurbulence type="fractalNoise" baseFrequency="1.3" numOctaves="2" seed="7" result="n"/>
    <feDisplacementMap in="SourceGraphic" in2="n" scale="0.32" xChannelSelector="R" yChannelSelector="G" result="d"/>
    <feTurbulence type="fractalNoise" baseFrequency="0.9 1.6" numOctaves="2" seed="4" result="w"/>
    <feColorMatrix in="w" type="matrix" values="0 0 0 0 0  0 0 0 0 0  0 0 0 0 0  -16 0 0 0 11.8" result="holes"/>
    <feComposite in="d" in2="holes" operator="in"/>
  </filter>
</defs>
<g filter="url(#${id}-rough)">
  <g fill="#120807" fill-rule="evenodd" transform="translate(0.45 0.6)">${parts.join('')}</g>
  <g fill="url(#${id}-fill)" fill-rule="evenodd" stroke="#2a0d08" stroke-width="0.18">${parts.join('')}</g>
  <g fill="#8e1512">${drips.join('')}</g>
</g>
</svg>`;
}
