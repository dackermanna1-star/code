// Shared helpers of level group 06 (shops, malls, kitchens...): texture painting helpers, small
// geometry helpers, and a few things that several levels use.
import { rasterText } from '../../gfx/font.js';
import { hr, cbox, owns, FACE } from './kit.js';

export { hr, cbox, owns, FACE };

export const pmod = (a, n) => ((a % n) + n) % n;
export const clamp = (v, a, b) => (v < a ? a : v > b ? b : v);
export const mix = (a, b, t) => [a[0] + (b[0] - a[0]) * t, a[1] + (b[1] - a[1]) * t, a[2] + (b[2] - a[2]) * t];
export const mulc = (c, m) => [c[0] * m, c[1] * m, c[2] * m];
export const pick = (arr, h) => arr[Math.floor(h * arr.length) % arr.length];

// width in texels of a string at horizontal scale sx
export const txtW = (str, sx = 1) => str.length * 6 * sx - sx;
// text with independent horizontal / vertical scale (5x7 font): textures are often stretched
export function txt(p, str, x, y, c, sx = 1, sy = sx, al = 1) {
  rasterText(str, 0, 0, 1, (px, py) => p.rect(x + px * sx, y + py * sy, sx, sy, c, al));
}
export function txtC(p, str, cx, y, c, sx = 1, sy = sx, al = 1) {
  txt(p, str, Math.round(cx - txtW(str, sx) / 2), y, c, sx, sy, al);
}
// alpha (cut-out) text
export function txtA(p, str, x, y, a, sx = 1, sy = sx) {
  rasterText(str, 0, 0, 1, (px, py) => p.rectA(x + px * sx, y + py * sy, sx, sy, a));
}

// mirror a painted texture left-right (colours and alpha)
export function flipX(p) {
  const T = 64;
  for (let y = 0; y < T; y++) {
    for (let x = 0; x < T / 2; x++) {
      const a = y * T + x, b = y * T + (T - 1 - x);
      for (const ch of [p.r, p.g, p.b, p.a]) { const t = ch[a]; ch[a] = ch[b]; ch[b] = t; }
    }
  }
  return p;
}

// a lit box with a darker right / bottom edge and lighter top / left (a flat packaged thing)
export function pack(p, x, y, w, h, c, edge = 0.2) {
  p.rect(x, y, w, h, c);
  p.rect(x + w - 1, y, 1, h, mulc(c, 1 - edge));
  p.rect(x, y + h - 1, w, 1, mulc(c, 1 - edge));
  p.rect(x, y, w - 1, 1, mulc(c, 1 + edge * 0.8));
  p.rect(x, y, 1, h - 1, mulc(c, 1 + edge * 0.5));
}

// a vertical strip of a texture painted as one big square sign: background, frame, text lines
export function signTexture(p, bg, fg, lines, opts = {}) {
  p.fill(bg);
  if (opts.noise !== 0) p.noise(4, opts.noise ?? 0.04, 2);
  if (opts.frame) { p.frame(1, 1, 62, 62, opts.frame); p.frame(2, 2, 60, 60, mulc(opts.frame, 0.7)); }
  const sy = opts.sy ?? 2, sx = opts.sx ?? 1;
  const total = lines.length * 7 * sy + (lines.length - 1) * 3;
  let y = Math.round((64 - total) / 2) + (opts.dy || 0);
  for (const ln of lines) {
    const s = typeof ln === 'string' ? ln : ln.t;
    const c = typeof ln === 'string' ? fg : ln.c || fg;
    const lsx = typeof ln === 'string' ? sx : ln.sx || sx;
    txtC(p, s, 32, y, c, lsx, sy);
    y += 7 * sy + 3;
  }
}

// iterate the cells of a zone with absolute coordinates
export function eachCell(zb, fn) {
  for (let z = zb.z0; z < zb.z1; z++) for (let x = zb.x0; x < zb.x1; x++) fn(x, z, zb.i(x, z));
}

// Make the whole zone nothing (all VOID) so a generator can carve what it needs.
export function voidZone(zb, CF) {
  zb.floor.fill(NaN);
  zb.ceil.fill(NaN);
  zb.flags.fill(CF.VOID);
  zb.noConnectivity = true;
}

// carve one cell: floor, ceiling, materials, clear VOID
export function carve(zb, CF, x, z, fh, ch, fm, cm, wm) {
  if (!zb.in(x, z)) return;
  const i = zb.i(x, z);
  zb.floor[i] = fh; zb.ceil[i] = ch;
  if (fm) zb.fmat[i] = fm;
  if (cm) zb.cmat[i] = cm;
  if (wm) zb.wmat[i] = wm;
  zb.flags[i] &= ~CF.VOID;
}

// Add a thin double-sided sign box (faces +z / -z or +x / -x carry the textures) hanging in space.
// axis 'x': board extends along x (faces toward +z and -z).
export function signBoard(zb, cx, y, cz, w, h, axis, matA, matB, matEdge, thick = 0.06) {
  const hw = w / 2;
  if (axis === 'x') zb.box(cx - hw, y, cz - thick / 2, cx + hw, y + h, cz + thick / 2, [matEdge, matEdge, matEdge, matEdge, matA, matB], { uv: 'fit', collide: false });
  else zb.box(cx - thick / 2, y, cz - hw, cx + thick / 2, y + h, cz + hw, [matA, matB, matEdge, matEdge, matEdge, matEdge], { uv: 'fit', collide: false });
}
