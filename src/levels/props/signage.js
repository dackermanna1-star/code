// Signage: emergency exit signs, spray-painted safe-room graffiti, the hotel
// marquee and wet-floor A-frames.
import { PI, HP, R, rgb, defProp, box, panel, quad, quadUV, pushR, wp, lamp, canvasMat, beam } from './kit.js';

/** Illuminated EXIT sign. opts: color 'green'|'red', arrow 'left'|'right', mount 'wall'|'ceiling', height (2.3), light */
export const exit_sign = defProp('exit_sign', (L, o) => {
  const red = o.color === 'red';
  const reg = (red ? 'exitR' : 'exitG') + (o.arrow === 'left' ? 'L' : o.arrow === 'right' ? 'R' : '');
  const housing = red ? [0.85, 0.85, 0.82] : [0.85, 0.85, 0.82];
  const ceiling = o.mount === 'ceiling';
  const y = ceiling ? -0.45 : (o.height || 2.3);
  const z = ceiling ? 0 : 0.035;
  if (ceiling) { beam(L, [-0.1, -0.33, 0], [-0.1, 0, 0], 0.015, 0.015, 'metalDark', { ends: false }); beam(L, [0.1, -0.33, 0], [0.1, 0, 0], 0.015, 0.015, 'metalDark', { ends: false }); }
  box(L, -0.18, y - 0.11, z - 0.035, 0.18, y + 0.11, z + 0.035, 'p_plastic', { tint: housing });
  panel(L, 'p_decalLit', R(reg), 0, y, z + 0.036, 0.33, 0.17, 'pz');
  if (ceiling) panel(L, 'p_decalLit', R(reg), 0, y, z - 0.036, 0.33, 0.17, 'nz');
  if (o.light) lamp(L, o, [0, y - 0.1, z + 0.3], red ? 0xff4030 : 0x40ff70, 2.5, 0.5, { shadows: false });
  return {};
});

function graffitiMat(L, text, color, arrow) {
  return canvasMat(L, `graf:${text}:${color}:${arrow}`, 96, 48, (g) => {
    g.clear();
    const c = rgb(color);
    const col = `rgb(${(c[0] * 255) | 0},${(c[1] * 255) | 0},${(c[2] * 255) | 0})`;
    const lines = String(text).split('\n');
    lines.forEach((ln, i) => {
      g.ctx.save();
      g.ctx.translate(48 + (arrow === 'left' ? 8 : arrow === 'right' ? -8 : 0), 10 + i * 15 + (lines.length === 1 ? 8 : 0));
      g.ctx.rotate((g.r() - 0.5) * 0.14);
      g.text(ln, 0, 0, lines.length > 1 ? 15 : 20, col, { maxW: arrow ? 76 : 90, font: 'Impact, Arial Black, sans-serif', outline: col, outlineW: 1.5 });
      g.ctx.restore();
    });
    // drips
    for (let i = 0; i < 9; i++) { const x = 14 + g.r() * 68, y0 = 14 + g.r() * 16; g.rect(col, x, y0, 1, 3 + g.r() * 9); }
    if (arrow) {
      const y = 40, s = arrow === 'left' ? -1 : 1, x0 = 48 - s * 34, x1 = 48 + s * 36;
      g.line(col, x0, y, x1, y, 3); g.line(col, x1, y, x1 - s * 9, y - 6, 3); g.line(col, x1, y, x1 - s * 9, y + 6, 3);
    }
    g.crisp();
  }, { alphaTest: 0.5, polyOffset: true, clamp: true });
}
/** Spray-painted "SAFE ROOM" graffiti decal on a wall. opts: text, arrow 'left'|'right'|'', color, y (centre, 1.5), size (width, 1.8) */
export const safe_room_sign = defProp('safe_room_sign', (L, o) => {
  const text = o.text || 'SAFE ROOM';
  const arrow = o.arrow === undefined ? 'right' : o.arrow;
  const w = o.size || 2.2, y = o.y || 1.5;
  panel(L, graffitiMat(L, text, o.color !== undefined ? o.color : 0xc81e14, arrow), [0, 0, 1, 1], 0, y, 0.012, w, w / 2, 'pz');
  return {};
});

function marqueeMat(L, text, vertical) {
  const w = vertical ? 32 : 128, h = vertical ? 128 : 32;
  return canvasMat(L, `marquee:${text}:${vertical ? 'v' : 'h'}`, w, h, (g) => {
    g.fill(0x173a28);
    g.stroke(0xc8a040, 1, 1, w - 2, h - 2, 2);
    for (let i = 4; i < (vertical ? h : w) - 2; i += 6) {
      const on = (i / 6) % 2 < 1;
      const col = on ? 0xfff0b0 : 0xd8b860;
      if (vertical) { g.rect(col, 3, i, 2, 2); g.rect(col, w - 5, i, 2, 2); } else { g.rect(col, i, 3, 2, 2); g.rect(col, i, h - 5, 2, 2); }
    }
    if (vertical) {
      const letters = String(text).replace(/\s+/g, '').slice(0, 11).split('');
      letters.forEach((ch, i) => g.text(ch, w / 2, 12 + i * (h - 24) / Math.max(1, letters.length - 1), 13, 0xfff4d0, { font: 'Georgia, serif', outline: 0x6a4a10, outlineW: 2 }));
    } else {
      // magnolia blossom emblem
      for (let k = 0; k < 5; k++) { const a = k / 5 * PI * 2 - HP; g.circle(0xf4f0e8, 14 + Math.cos(a) * 4, 16 + Math.sin(a) * 4, 3.5); }
      g.circle(0xd8a030, 14, 16, 2);
      g.text(text, 72, 17, 15, 0xfff4d0, { maxW: 96, font: 'Georgia, serif', outline: 0x6a4a10, outlineW: 2 });
    }
  }, { unlit: true });
}
/** Hotel marquee sign (invented name). opts: text ('THE MAGNOLIA'), vertical (blade sign), height (centre, 4.0), light */
export const hotel_sign = defProp('hotel_sign', (L, o) => {
  const text = o.text || 'THE MAGNOLIA';
  const y = o.height || 4.0;
  if (o.vertical) {
    const h = 4.0, d = 1.0;
    box(L, -0.1, y - h / 2, 0, 0.1, y + h / 2, d, 'p_paint', { tint: [0.1, 0.22, 0.16] });
    for (const s of [-1, 1]) quadUV(L, s > 0 ? [0.102, y - h / 2 + 0.05, d - 0.05] : [-0.102, y - h / 2 + 0.05, 0.05], s > 0 ? [0.102, y - h / 2 + 0.05, 0.05] : [-0.102, y - h / 2 + 0.05, d - 0.05], s > 0 ? [0.102, y + h / 2 - 0.05, 0.05] : [-0.102, y + h / 2 - 0.05, d - 0.05], s > 0 ? [0.102, y + h / 2 - 0.05, d - 0.05] : [-0.102, y + h / 2 - 0.05, 0.05], marqueeMat(L, text, true), [0, 0, 1, 1]);
    for (const yy of [y - h / 2 + 0.3, y + h / 2 - 0.3]) beam(L, [0, yy, 0], [0, yy, 0.3], 0.06, 0.06, 'metalDark');
  } else {
    const w = 4.6, h = 1.15;
    box(L, -w / 2, y - h / 2, 0, w / 2, y + h / 2, 0.22, 'p_paint', { tint: [0.1, 0.22, 0.16] });
    panel(L, marqueeMat(L, text, false), [0, 0, 1, 1], 0, y, 0.222, w - 0.06, h - 0.06, 'pz');
    box(L, -w / 2 - 0.05, y - h / 2 - 0.08, 0, w / 2 + 0.05, y - h / 2, 0.3, 'p_brass');
    for (const s of [-1, 1]) beam(L, [s * (w / 2 - 0.4), y + h / 2, 0.22], [s * (w / 2 - 0.4), y + h / 2 + 0.6, 0], 0.04, 0.04, 'metalDark');
  }
  if (o.light) lamp(L, o, [0, y, 1.2], 0xffe0a0, 6, 0.9, { shadows: false });
  return {};
});

/** Yellow A-frame wet floor sign. */
export const wet_floor_sign = defProp('wet_floor_sign', (L, o) => {
  for (const s of [-1, 1]) {
    pushR(L, [0, 0.64, 0], s * 0.2, 0, 0);
    box(L, -0.15, -0.64, s > 0 ? 0 : -0.012, 0.15, 0, s > 0 ? 0.012 : 0, 'p_plastic', { tint: [0.95, 0.8, 0.1] });
    panel(L, 'p_decal', R('wetSign'), 0, -0.32, s * 0.014, 0.26, 0.5, s > 0 ? 'pz' : 'nz');
    L.pop();
  }
  box(L, -0.06, 0.64, -0.02, 0.06, 0.7, 0.02, 'p_plastic', { tint: [0.95, 0.8, 0.1] });
  return {};
});

export const SIGNS = { exit_sign, safe_room_sign, hotel_sign, wet_floor_sign };
export const SIGNS_MOUNT = { safe_room_sign: 'wall', hotel_sign: 'wall', exit_sign: 'wall' };
