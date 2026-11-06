// Melee weapon viewmodel models (cm). Model space: handle along +Y, origin = right hand grip centre,
// striking edge / face toward -Z.
import { ModelBuilder, shade } from './builder.js';
import { M } from './material.js';
import { C } from './palette.js';

const PI = Math.PI;

function meleeMeta(extra) {
  const two = !!extra.twoHanded;
  return Object.assign({
    kind: 'melee', weight: two ? 0.7 : 0.3,
    hip: two
      ? { pos: [0.17, -0.15, -0.42], rot: [-0.45, 0.25, 0.42] }
      : { pos: [0.2, -0.22, -0.37], rot: [-0.12, 0.3, 0.48] },
    sprint: two
      ? { pos: [0.19, -0.2, -0.3], rot: [0.75, 0.1, 0.55] }
      : { pos: [0.19, -0.22, -0.31], rot: [0.55, 0.15, 0.3] },
    hands: { R: 'handR', L: two ? 'handL' : null },
    swing: 'blunt',
  }, extra);
}

/** straight handle along Y from y0..y1 */
function handle(b, y0, y1, w, d, col, mat) {
  b.box(0, (y0 + y1) / 2, 0, w, y1 - y0, d, col, mat);
}

/** Thin blade in the YZ plane (thin in X): spine at +Z side. widths = [[y, width], ...] */
function blade(b, segs, spineZ, thick, col, mat = M.STEEL, edgeCol = null) {
  for (let i = 0; i < segs.length - 1; i++) {
    const [y0, w0] = segs[i];
    const [y1] = segs[i + 1];
    const zc = spineZ - w0 / 2;
    b.box(0, (y0 + y1) / 2, zc, thick, y1 - y0, w0, col, mat);
    if (edgeCol != null) b.box(0, (y0 + y1) / 2, spineZ - w0 + 0.3, thick + 0.04, y1 - y0, 0.6, edgeCol, M.STEEL);
  }
}

export function knife() {
  const b = new ModelBuilder({ texel: 0.5 });
  handle(b, -5.2, 5.4, 1.4, 2.3, 0x1c1c1c, M.POLY);
  for (const y of [-3, 0.2, 3.2]) for (const s of [-1, 1]) b.box(s * 0.72, y, 0, 0.06, 0.5, 0.5, C.steel, M.STEEL);
  b.box(0, 5.8, -0.1, 1.5, 0.8, 2.6, C.steelLight, M.STEEL);
  blade(b, [[6.2, 3.3], [10, 3.1], [14, 2.8], [17.5, 2.3], [20.5, 1.7], [22.6, 1.0], [24, 0]], 1.3, 0.28, C.steelLight, M.STEEL, 0xe6ebf0);
  b.point('handR', [0, 0, 0]);
  b.point('tip', [0, 24, 0.8]);
  return { b, meta: meleeMeta({ swing: 'stab', weight: 0.1, hip: { pos: [0.17, -0.2, -0.34], rot: [-0.95, 0.25, 0.35] } }) };
}

export function knifeHunting() {
  const b = new ModelBuilder({ texel: 0.5 });
  for (let i = 0; i < 10; i++) b.box(0, -5 + i * 1.05 + 0.5, 0, 1.9, 1.0, 2.7, i % 3 === 2 ? 0x2a1c12 : C.woodDark, i % 3 === 2 ? M.RUBBER : M.WOOD);
  b.box(0, -5.6, 0, 2.2, 1.0, 3.0, C.brass, M.BRASS);
  b.box(0, 5.7, 0, 1.4, 0.7, 5.0, C.brass, M.BRASS);
  blade(b, [[6, 3.7], [10, 3.7], [14, 3.5], [17, 3.0], [19.5, 2.2], [21.2, 1.2], [22.4, 0]], 1.6, 0.4, 0x8d949c, M.STEEL, 0xd8dde3);
  b.box(0.22, 12, 0.8, 0.05, 10, 0.6, 0x6d737a, M.STEEL); // fuller
  b.box(0, 19.8, 1.6, 0.36, 2.4, 0.5, 0x8d949c, M.STEEL, { r: [0.5, 0, 0] }); // clip
  b.point('handR', [0, 0, 0]);
  return { b, meta: meleeMeta({ swing: 'blade', weight: 0.15, hip: { pos: [0.17, -0.2, -0.34], rot: [-0.9, 0.25, 0.35] } }) };
}

export function bat(nails = false) {
  const b = new ModelBuilder({ texel: 0.9 });
  const W = C.ash;
  b.box(0, -13.0, 0, 3.6, 1.2, 3.6, W, M.WOOD);
  b.box(0, -12.2, 0, 3.0, 0.6, 3.0, W, M.WOOD);
  b.box(0, -3.5, 0, 2.7, 18, 2.7, 0x1a1a1a, M.TAPE);
  const segs = [[5.5, 2.6], [18, 3.2], [28, 4.0], [38, 4.9], [48, 5.7], [58, 6.3], [70, 6.5], [72, 5.8]];
  for (let i = 0; i < segs.length - 1; i++) {
    const [y0, w] = segs[i];
    const [y1] = segs[i + 1];
    b.box(0, (y0 + y1) / 2, 0, w, y1 - y0, w, W, M.WOOD);
    if (w > 3) b.box(0, (y0 + y1) / 2, 0, w * 0.74, y1 - y0, w * 1.08, W, M.WOOD);
  }
  b.box(0, 72.6, 0, 5.2, 1.2, 5.2, shade(W, 0.9), M.WOOD);
  b.box(3.02, 47, 0, 0.06, 5, 3.0, 0x2a2a2a, M.PLAIN);
  if (nails) {
    let k = 7;
    const rnd = () => ((k = (k * 16807) % 2147483647) / 2147483647);
    for (let i = 0; i < 16; i++) {
      const y = 40 + rnd() * 30;
      const a = rnd() * PI * 2;
      const r = 3.0 + (y - 40) * 0.03;
      const x = Math.cos(a) * r, z = Math.sin(a) * r;
      b.box(x * 1.35, y, z * 1.35, 0.32, 0.32, 3.6, 0x80868c, M.METAL, { r: [rnd() * 0.6 - 0.3, -a + PI / 2, 0] });
      b.box(x * 0.98, y, z * 0.98, 0.7, 0.7, 0.2, 0x6a6f75, M.METAL, { r: [0, -a + PI / 2, 0] });
    }
    for (let i = 0; i < 6; i++) {
      const y = 44 + rnd() * 24, s = rnd() < 0.5 ? -1 : 1;
      b.box(s * 3.0, y, rnd() * 2 - 1, 0.1, 1.5 + rnd() * 3, 1.5 + rnd() * 2, C.blood, M.PLAIN);
    }
  }
  b.point('handR', [0, 0, 0]);
  b.point('handL', [0, 9.0, 0]);
  return { b, meta: meleeMeta({ twoHanded: true, swing: 'blunt', weight: 0.6, scale: 0.8 }) };
}

export function crowbar() {
  const b = new ModelBuilder({ texel: 0.7 });
  const R = 0x9a1b16;
  b.box(0, 16, 0, 1.8, 54, 1.8, R, M.PAINT);
  b.box(0, 16, 0, 1.3, 54, 2.2, R, M.PAINT);
  // goose neck at the top
  b.push([0, 43, 0]);
  for (let i = 0; i < 5; i++) {
    b.push([0, 1.6, 0], [-0.42, 0, 0]);
    b.box(0, 1.2, 0, 1.8, 2.6, 1.9, R, M.PAINT);
  }
  b.push([0, 2.6, 0]);
  b.box(-0.55, 1.4, 0, 0.7, 2.8, 1.4, C.steelDark, M.METAL);
  b.box(0.55, 1.4, 0, 0.7, 2.8, 1.4, C.steelDark, M.METAL);
  for (let i = 0; i < 7; i++) b.pop();
  // chisel end
  b.push([0, -11, 0], [0.35, 0, 0]);
  b.box(0, -1.6, 0, 2.3, 3.4, 0.9, C.steelDark, M.METAL);
  b.pop();
  b.point('handR', [0, 0, 0]);
  return { b, meta: meleeMeta({ swing: 'blunt', weight: 0.4 }) };
}

export function hammer() {
  const b = new ModelBuilder({ texel: 0.5 });
  handle(b, -6, 24, 2.2, 3.0, C.woodLight, M.WOOD);
  b.box(0, -4, 0, 2.6, 6, 3.4, 0x1c3a6e, M.RUBBER);
  b.box(0, 26.2, 0.2, 2.6, 3.4, 5.4, C.gunLight, M.METAL);
  b.box(0, 26.2, -3.8, 3.0, 3.0, 2.8, C.steel, M.STEEL);
  b.box(0, 26.2, -5.3, 2.4, 2.4, 0.4, C.steelLight, M.STEEL);
  for (const s of [-1, 1]) {
    b.box(s * 0.65, 26.8, 4.3, 0.9, 1.9, 3.6, C.gunLight, M.METAL, { r: [-0.35, 0, 0] });
    b.box(s * 0.65, 25.4, 6.9, 0.8, 1.2, 2.4, C.gunLight, M.METAL, { r: [-0.9, 0, 0] });
  }
  b.point('handR', [0, 0, 0]);
  return { b, meta: meleeMeta({ swing: 'blunt', weight: 0.3 }) };
}

function axeHead(b, y, red, big) {
  const k = big ? 1 : 0.75;
  const col = red ? 0xb3261e : C.gunLight;
  b.box(0, y, 0, 3.0 * k, 6 * k, 4.6 * k, col, red ? M.PAINT : M.METAL);
  b.box(0, y, -5.2 * k, 1.3 * k, 8 * k, 6.5 * k, col, red ? M.PAINT : M.METAL);
  b.box(0, y, -9.0 * k, 0.8 * k, 10.5 * k, 1.8 * k, C.steelLight, M.STEEL);
  b.box(0, y + 4.6 * k, -9.0 * k, 0.6 * k, 1.4 * k, 1.2 * k, C.steelLight, M.STEEL);
  b.box(0, y - 4.6 * k, -9.0 * k, 0.6 * k, 1.4 * k, 1.2 * k, C.steelLight, M.STEEL);
  if (red) {
    b.box(0, y + 0.3, 5.0, 1.7, 2.4, 6.0, col, M.PAINT);
    b.box(0, y + 0.1, 9.0, 1.0, 1.3, 3.0, C.gunLight, M.METAL);
  } else {
    b.box(0, y, 2.9 * k, 2.6 * k, 3.6 * k, 1.6 * k, C.gunLight, M.METAL);
  }
}

export function axeFire() {
  const b = new ModelBuilder({ texel: 0.9 });
  handle(b, -30, 46, 2.6, 3.6, 0xc9a05a, M.WOOD);
  b.box(0, -31.5, 0, 3.2, 3.0, 4.2, 0xc9a05a, M.WOOD);
  b.box(0, -24, 0, 2.9, 10, 3.9, 0x1d1d1d, M.RUBBER);
  axeHead(b, 46, true, true);
  b.point('handR', [0, 0, 0]);
  b.point('handL', [0, 15, 0]);
  return { b, meta: meleeMeta({ twoHanded: true, swing: 'heavy', weight: 0.85, scale: 0.8 }) };
}

export function hatchet() {
  const b = new ModelBuilder({ texel: 0.6 });
  handle(b, -6.5, 27, 2.3, 3.0, C.woodLight, M.WOOD);
  b.box(0, -6.8, 0.4, 2.5, 1.4, 3.6, C.woodLight, M.WOOD);
  axeHead(b, 27, false, false);
  b.point('handR', [0, 0, 0]);
  return { b, meta: meleeMeta({ swing: 'blade', weight: 0.3 }) };
}

export function machete() {
  const b = new ModelBuilder({ texel: 0.6 });
  handle(b, -5.5, 6, 2.0, 3.0, 0x1b1b1b, M.RUBBER);
  b.box(0, -6.0, 0.6, 2.2, 1.4, 3.6, 0x1b1b1b, M.RUBBER);
  for (const y of [-2, 3]) for (const s of [-1, 1]) b.box(s * 1.02, y, 0, 0.06, 0.55, 0.55, C.brass, M.BRASS);
  b.box(0, 6.4, -0.3, 2.2, 0.8, 3.8, 0x1b1b1b, M.RUBBER);
  blade(b, [[6.6, 4.2], [20, 4.4], [34, 4.7], [46, 5.0], [52, 4.4], [55, 2.6], [56.5, 0]], 1.6, 0.36, 0x3a3d40, M.METAL, 0xc8cdd3);
  b.point('handR', [0, 0, 0]);
  return { b, meta: meleeMeta({ swing: 'blade', weight: 0.35 }) };
}

export function golfClub() {
  const b = new ModelBuilder({ texel: 0.6 });
  b.box(0, 2, 0, 1.8, 24, 1.8, 0x1a1a1a, M.RUBBER);
  b.box(0, 52, 0, 0.9, 76, 0.9, C.steelLight, M.STEEL);
  b.box(0, 90, -0.6, 1.2, 2.6, 1.2, C.steelLight, M.STEEL, { r: [0.3, 0, 0] });
  b.box(0, 91.5, -3.6, 1.8, 2.8, 6.6, C.steelLight, M.STEEL, { r: [0.25, 0, 0] });
  for (let i = 0; i < 4; i++) b.box(-0.93, 91.2 + (i - 1.5) * 0.6, -3.6, 0.05, 0.12, 5.4, C.steelDark, M.METAL, { r: [0.25, 0, 0] });
  b.point('handR', [0, 0, 0]);
  b.point('handL', [0, 8, 0]);
  return { b, meta: meleeMeta({ twoHanded: true, swing: 'blunt', weight: 0.35, scale: 0.9 }) };
}

export function pan() {
  const b = new ModelBuilder({ texel: 0.7 });
  const I = 0x2a2b2e;
  handle(b, -8, 15, 1.9, 1.4, I, M.METAL);
  b.box(0, 15.5, 0.6, 2.6, 3.0, 1.0, I, M.METAL);
  const R = 12.5, cy = 28;
  for (let y = -R; y < R; y += 1.6) {
    const yy = y + 0.8;
    const hw = Math.sqrt(Math.max(0, R * R - yy * yy));
    b.box(0, cy + yy, 0, hw * 2, 1.62, 0.9, I, M.METAL);
    // rim (raised toward +Z)
    if (Math.abs(yy) > R - 2.2) b.box(0, cy + yy, 1.4, hw * 2, 1.62, 2.4, I, M.METAL);
    else for (const s of [-1, 1]) b.box(s * (hw - 0.6), cy + yy, 1.4, 1.2, 1.62, 2.4, I, M.METAL);
  }
  b.box(0, cy, 0.5, 18, 18, 0.15, 0x1d1e20, M.METAL, { skip: 'nz' });
  b.point('handR', [0, 0, 0]);
  return { b, meta: meleeMeta({ swing: 'blunt', weight: 0.4, hip: { pos: [0.17, -0.22, -0.38], rot: [-0.6, 0.55, 0.35] } }) };
}

export function pipe() {
  const b = new ModelBuilder({ texel: 0.7 });
  const P = 0x6d7176;
  b.tubeY(0, 19, 0, 3.0, 58, P, M.METAL);
  b.tubeY(0, -9.5, 0, 3.6, 2.6, shade(P, 0.85), M.METAL);
  b.tubeY(0, 46, 0, 4.2, 5, shade(P, 0.9), M.METAL);
  b.tubeX(0, 47, 0, 3.6, 7, shade(P, 0.9), M.METAL);
  b.box(0, -2, 0, 3.3, 10, 3.3, 0x5a5e63, M.TAPE);
  for (const [y, z] of [[22, 1.55], [31, -1.55], [12, -1.55], [38, 1.55]]) b.box(0, y, z, 2.2, 3.4, 0.08, C.rust, M.PLAIN);
  b.point('handR', [0, 0, 0]);
  return { b, meta: meleeMeta({ swing: 'blunt', weight: 0.45 }) };
}

export function sledgehammer() {
  const b = new ModelBuilder({ texel: 0.9 });
  handle(b, -30, 58, 3.0, 3.8, 0xd9a520, M.POLY);
  b.box(0, -24, 0, 3.4, 12, 4.2, 0x1a1a1a, M.RUBBER);
  b.box(0, 52, 0, 3.6, 8, 4.4, 0x1a1a1a, M.RUBBER);
  b.box(0, 62, 0, 7.0, 7.0, 16, C.gunLight, M.METAL);
  b.box(0, 62, 0, 7.6, 5.6, 14, C.gunLight, M.METAL);
  for (const s of [-1, 1]) b.box(0, 62, s * 8.3, 6.0, 6.0, 0.8, C.steel, M.STEEL);
  b.point('handR', [0, 0, 0]);
  b.point('handL', [0, 16, 0]);
  return { b, meta: meleeMeta({ twoHanded: true, swing: 'heavy', weight: 1.0, scale: 0.8 }) };
}

export function shovel() {
  const b = new ModelBuilder({ texel: 0.9 });
  handle(b, -30, 60, 2.6, 2.6, C.woodLight, M.WOOD);
  b.box(0, -33.5, 0, 9, 1.5, 2.2, 0x1a1a1a, M.POLY);
  for (const s of [-1, 1]) b.box(s * 3.9, -31.5, 0, 1.2, 4, 2.2, 0x1a1a1a, M.POLY, { r: [0, 0, s * 0.35] });
  b.box(0, 62, 0, 3.2, 7, 3.2, 0x3e4a3a, M.PAINT);
  const G = 0x3e4a3a;
  b.box(0, 72, -0.6, 19, 12, 0.6, G, M.PAINT);
  b.box(0, 79, -0.6, 16, 3, 0.6, G, M.PAINT);
  b.box(0, 81.6, -0.6, 10, 2.4, 0.6, G, M.PAINT);
  b.box(0, 83.2, -0.6, 4.4, 1.2, 0.6, C.steelDark, M.METAL);
  b.box(0, 66.2, 0.2, 19.6, 1.0, 1.4, G, M.PAINT);
  b.point('handR', [0, 0, 0]);
  b.point('handL', [0, 17, 0]);
  return { b, meta: meleeMeta({ twoHanded: true, swing: 'heavy', weight: 0.8, scale: 0.88 }) };
}

export function katana() {
  const b = new ModelBuilder({ texel: 0.6 });
  // tsuka with diamond wrap
  b.box(0, -1.5, 0, 2.3, 25, 3.1, 0xd8d0bc, M.CLOTH);
  for (let i = 0; i < 8; i++) {
    const y = -12.5 + i * 3.1;
    for (const s of [-1, 1]) {
      b.box(s * 1.17, y, 0, 0.08, 2.0, 3.1, 0x141414, M.CLOTH, { r: [s * 0.6, 0, 0] });
      b.box(s * 1.17, y, 0, 0.08, 2.0, 3.1, 0x141414, M.CLOTH, { r: [-s * 0.6, 0, 0] });
    }
  }
  b.box(0, -14.6, 0, 2.6, 1.2, 3.4, 0x2a2a2a, M.METAL);
  b.box(0, 11.6, 0, 7.0, 0.8, 7.6, 0x2a2622, M.METAL);
  b.box(0, 11.6, 0, 6.0, 0.8, 6.0, 0x2a2622, M.METAL, { r: [0, PI / 4, 0] });
  b.box(0, 13.1, 0, 1.3, 2.2, 3.3, C.brass, M.BRASS);
  // curved blade
  b.push([0, 14, 0]);
  for (let i = 0; i < 10; i++) {
    b.box(0, 3.5, 0.0, 0.55, 7.05, 3.0 - i * 0.06, C.steelLight, M.STEEL);
    b.box(0, 3.5, -1.45 + i * 0.03, 0.6, 7.05, 0.5, 0xeef2f5, M.STEEL);
    b.push([0, 7.0, 0], [0.025, 0, 0]);
  }
  b.box(0, 1.6, 0.4, 0.5, 3.4, 2.0, C.steelLight, M.STEEL, { r: [-0.35, 0, 0] });
  b.box(0, 3.0, 0.7, 0.45, 2.0, 1.0, C.steelLight, M.STEEL, { r: [-0.6, 0, 0] });
  for (let i = 0; i < 11; i++) b.pop();
  b.point('handR', [0, 0, 0]);
  b.point('handL', [0, 7.6, 0]);
  return { b, meta: meleeMeta({ twoHanded: true, swing: 'blade', weight: 0.45, scale: 0.8 }) };
}

export function spear() {
  const b = new ModelBuilder({ texel: 0.9 });
  handle(b, -70, 84, 2.4, 2.4, 0x8a6a42, M.WOOD);
  for (let i = 0; i < 4; i++) b.box(0, 80 + i * 2.2, 0, 2.9, 1.6, 2.9, C.tape, M.TAPE);
  b.box(0, 85.5, 0, 1.2, 4, 2.8, 0x1b1b1b, M.RUBBER);
  blade(b, [[87, 3.2], [94, 3.0], [99, 2.2], [102, 1.2], [104, 0]], 1.6, 0.35, C.steelLight, M.STEEL, 0xe6ebf0);
  b.point('handR', [0, 0, 0]);
  b.point('handL', [0, 30, 0]);
  return {
    b,
    meta: meleeMeta({
      twoHanded: true, swing: 'stab', weight: 0.5, scale: 0.9,
      hip: { pos: [0.11, -0.17, -0.26], rot: [-1.42, 0.13, 0.12] },
      sprint: { pos: [0.18, -0.2, -0.24], rot: [-0.6, 0.6, 0.4] },
    }),
  };
}

export function baton() {
  const b = new ModelBuilder({ texel: 0.6 });
  b.box(0, 2, 0, 2.8, 24, 2.8, 0x161616, M.RUBBER);
  for (let i = 0; i < 9; i++) b.box(0, -8.5 + i * 2.4, 0, 3.0, 0.6, 3.0, 0x0f0f0f, M.RUBBER);
  b.box(0, -10.5, 0, 3.2, 1.4, 3.2, 0x1e1e1e, M.METAL);
  b.box(0, 23, 0, 2.0, 18, 2.0, 0x2a2b2e, M.METAL);
  b.box(0, 40, 0, 1.5, 16, 1.5, 0x34363a, M.METAL);
  b.box(0, 48.6, 0, 2.2, 2.0, 2.2, 0x1e1e1e, M.METAL);
  b.point('handR', [0, 0, 0]);
  return { b, meta: meleeMeta({ swing: 'blunt', weight: 0.25 }) };
}

export function wrench() {
  const b = new ModelBuilder({ texel: 0.6 });
  const R = 0xb8331c;
  b.box(0, 10, 0, 1.6, 36, 3.6, R, M.PAINT);
  b.box(0, 10, 0, 2.2, 36, 1.4, R, M.PAINT);
  b.box(0, -8.4, 0, 2.4, 1.6, 3.2, R, M.PAINT);
  b.box(0, 30.5, -0.4, 2.6, 6, 4.2, C.steelDark, M.METAL);
  b.box(0, 35, -3.0, 2.6, 2.4, 7.6, C.steelDark, M.METAL);
  b.box(0, 31.8, -5.0, 2.6, 2.0, 3.2, C.steelDark, M.METAL);
  for (let i = 0; i < 4; i++) b.box(0, 33.6, -5.6 + i * 0.8, 2.62, 0.4, 0.4, C.steel, M.STEEL);
  b.tubeZ(0, 30.2, 2.8, 3.0, 2.6, C.steel, M.STEEL);
  b.point('handR', [0, 0, 0]);
  return { b, meta: meleeMeta({ swing: 'blunt', weight: 0.4 }) };
}

export function pitchfork() {
  const b = new ModelBuilder({ texel: 0.9 });
  handle(b, -60, 70, 2.4, 2.4, 0x9a7a4a, M.WOOD);
  b.box(0, 72, 0, 3.0, 5, 3.0, C.steelDark, M.METAL);
  b.box(0, 75.5, 0, 13, 1.8, 1.4, C.steelDark, M.METAL);
  for (const x of [-5.6, 0, 5.6]) {
    b.box(x, 87, 0, 0.9, 22, 0.9, C.steelDark, M.METAL);
    b.box(x, 99, -0.5, 0.7, 3, 0.7, C.steel, M.STEEL, { r: [-0.25, 0, 0] });
  }
  for (const s of [-1, 1]) b.box(s * 6.0, 76.5, 0, 1.2, 3.5, 1.4, C.steelDark, M.METAL, { r: [0, 0, s * 0.4] });
  b.point('handR', [0, 0, 0]);
  b.point('handL', [0, 30, 0]);
  return {
    b,
    meta: meleeMeta({
      twoHanded: true, swing: 'stab', weight: 0.6, scale: 0.88,
      hip: { pos: [0.11, -0.17, -0.26], rot: [-1.42, 0.13, 0.12] },
      sprint: { pos: [0.18, -0.2, -0.24], rot: [-0.6, 0.6, 0.4] },
    }),
  };
}

export function club() {
  const b = new ModelBuilder({ texel: 0.9 });
  const W = 0x6b4a2a;
  const segs = [[-9, 3.2], [6, 3.6], [16, 4.4], [26, 5.4], [36, 6.3], [46, 6.8], [50, 6.0]];
  for (let i = 0; i < segs.length - 1; i++) {
    const [y0, w] = segs[i];
    const [y1] = segs[i + 1];
    b.box(0, (y0 + y1) / 2, 0, w, y1 - y0, w * 0.92, W, M.WOOD, { r: [0, i * 0.35, (i % 2 ? 1 : -1) * 0.03] });
  }
  b.box(0, 50.2, 0, 5.4, 0.6, 5.0, 0xc29a6a, M.WOOD);
  for (const [y, x, z] of [[20, 2.4, 0.5], [32, -2.9, -1], [41, 1, 3.2], [28, 0.5, -2.8]]) b.box(x, y, z, 1.4, 1.6, 1.4, shade(W, 0.8), M.WOOD);
  b.box(0, -2, 0, 3.5, 7, 3.4, 0x3d3226, M.TAPE);
  b.point('handR', [0, 0, 0]);
  return { b, meta: meleeMeta({ swing: 'blunt', weight: 0.5 }) };
}

export function screwdriver() {
  const b = new ModelBuilder({ texel: 0.4 });
  const Y = 0xd9a81e;
  b.box(0, 0.5, 0, 2.8, 11, 2.8, Y, M.POLY);
  b.box(0, 0.5, 0, 2.2, 11, 3.2, Y, M.POLY);
  b.box(0, 0.5, 0, 3.2, 11, 2.2, Y, M.POLY);
  b.box(0, -4.8, 0, 2.6, 0.8, 2.6, 0x1a1a1a, M.RUBBER);
  b.box(0, 6.4, 0, 1.6, 0.8, 1.6, 0x1a1a1a, M.RUBBER);
  b.box(0, 14, 0, 0.6, 15, 0.6, C.steelLight, M.STEEL);
  b.box(0, 21.8, 0, 0.9, 1.2, 0.24, C.steelLight, M.STEEL);
  b.point('handR', [0, 0, 0]);
  return { b, meta: meleeMeta({ swing: 'stab', weight: 0.08, hip: { pos: [0.17, -0.2, -0.34], rot: [-0.95, 0.25, 0.35] } }) };
}
