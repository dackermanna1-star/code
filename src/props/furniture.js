// Timber furniture and the office chair.
import * as THREE from 'three';
import * as F from '../core/fracture.js';
import { PropBuilder } from './builder.js';
import { bookSurface, tinted, surface } from '../core/materials.js';
import { boxUV, fitUV } from '../core/geometry.js';
import { roundedBox, addRevolved } from './parts.js';
import { addSmallVase, addMug, addPlant } from './fragile.js';
import { getTexture } from '../render/textures.js';

const BOOK_COLORS = [0x7a1f1f, 0x1f3d6b, 0x2f5d3a, 0x8a6a1e, 0x4a2d5e, 0x1d1d22, 0xa34b1c, 0x245a5f, 0x6b1f3d, 0x3b4a23, 0xb9b09a, 0x5a3320, 0x2a2f52, 0x8c2f2f];

function addBook(b, rnd, x, y, z, w, h, d, upright = true) {
  const color = BOOK_COLORS[(rnd() * BOOK_COLORS.length) | 0];
  const s = bookSurface(color);
  b.body('book', {});
  if (upright) {
    // spine faces +z; covers are the ±x faces; the other three faces are page edges
    const part = b.box('book', [w, h, d], [x, y + h / 2, z], s, {
      fracturable: false, uv: boxUV(h, 1, rnd(), 0.5), grain: 1,
    });
    part.poly = F.boxPoly(w / 2, h / 2, d / 2, [0, 0, 1, 1, 0, 1]);
  } else {
    // lying flat: spine faces +z, covers are ±y
    const part = b.box('book', [h, w, d], [x, y + w / 2, z], s, {
      fracturable: false, uv: boxUV(h, 0, rnd(), 0.5), grain: 0,
    });
    part.poly = F.boxPoly(h / 2, w / 2, d / 2, [1, 1, 0, 0, 0, 1]);
  }
}

/** 6. Bookshelf, fully loaded. Every book and ornament is its own rigid body. */
export function buildBookshelf() {
  const b = new PropBuilder('bookshelf', 'Bookshelf');
  const rnd = F.makeRng((Math.random() * 1e9) | 0);
  const W = 0.9, H = 1.9, D = 0.3, T = 0.02;
  const wood = 'pine';
  const main = b.cur;
  b.box('side', [T, H, D], [-(W / 2 - T / 2), H / 2, 0], wood, { grain: 1, hollow: true });
  b.box('side', [T, H, D], [W / 2 - T / 2, H / 2, 0], wood, { grain: 1, hollow: true });
  const iw = W - 2 * T;
  b.box('kick', [iw, 0.06, T], [0, 0.03, D / 2 - 0.03], wood, { grain: 0 });
  b.box('bottom', [iw, T, D], [0, 0.07, 0], wood, { grain: 0, hollow: true });
  b.box('top', [iw, T, D], [0, H - T / 2, 0], wood, { grain: 0, hollow: true });
  const levels = [0.08];
  const gap = (H - T - 0.08) / 5;
  for (let i = 1; i <= 4; i++) {
    const y = 0.07 + i * gap;
    b.box('shelf', [iw, T, D - 0.02], [0, y, 0.01], wood, { grain: 0, hollow: true });
    levels.push(y + T / 2);
  }
  // thin back panel in three strips
  const bh = (H - 0.06) / 3;
  for (let i = 0; i < 3; i++) b.box('back', [W - 0.004, bh, 0.005], [0, 0.06 + bh * (i + 0.5), -D / 2 + 0.0025], 'hardboard', { grain: 1, bond: 0.5 });

  const left = -iw / 2 + 0.004, right = iw / 2 - 0.004;
  const clear = gap - T - 0.012;
  const fillBooks = (lvl, x0, x1, lean) => {
    let x = x0;
    const y = levels[lvl] + 0.0008;
    while (true) {
      const w = 0.022 + rnd() * 0.034;
      if (x + w > x1) break;
      const h = Math.min(clear, 0.2 + rnd() * 0.1);
      const d = 0.15 + rnd() * 0.06;
      addBook(b, rnd, x + w / 2, y, -D / 2 + 0.012 + d / 2 + rnd() * 0.012, w, h, d, true);
      x += w + 0.0035;
    }
    return x;
  };
  // level 0 (bottom): packed with big books + a storage box
  fillBooks(0, left, 0.14);
  b.body('box', {});
  b.box('storage_box', [0.24, 0.16, 0.2], [0.29, levels[0] + 0.081, 0], 'cardboard', { fracturable: false, mass: 1.4 });
  // level 1: books, then a small vase
  fillBooks(1, left, 0.2);
  b.body('vase', {});
  addSmallVase(b, 'small_vase', [0.32, levels[1] + 0.0008, 0.0], 'ceramic_blue', 1.15);
  // level 2: flat stack + picture frame + books
  {
    let y = levels[2] + 0.0008;
    for (let i = 0; i < 3; i++) {
      const w = 0.03 + rnd() * 0.02;
      addBook(b, rnd, left + 0.14, y, 0.0, w, 0.22 + rnd() * 0.04, 0.16 + rnd() * 0.03, false);
      y += w + 0.0008;
    }
    b.body('trophy', {});
    b.at([left + 0.14, y, 0.0], 0, () => {
      // weighted base so it stands firmly on the stack of books
      b.cyl('trophy_base', 0.044, 0.022, [0, 0.011, 0], 'walnut', { segs: 12, fracturable: false, mass: 0.55 });
      b.cyl('trophy_stem', 0.008, 0.05, [0, 0.046, 0], 'brass', { segs: 8, hull: true, mass: 0.05 });
      b.cyl('trophy_cup', 0.032, 0.06, [0, 0.1, 0], 'brass', { segs: 12, hull: true, mass: 0.16 });
    });
    fillBooks(2, -0.1, 0.22);
    b.body('frame', {});
    b.at([0.33, levels[2] + 0.001, -0.02], -0.3, () => {
      b.box('frame', [0.19, 0.24, 0.014], [0, 0.12, 0], 'walnut', { grain: 1 });
      const pic = new THREE.MeshStandardMaterial({ map: getTexture('picture'), roughness: 0.6 });
      b.box('picture', [0.15, 0.2, 0.002], [0, 0.12, 0.008], 'cardboard', { mats: [pic, pic, pic], fracturable: false, uv: fitUV(0, 1, -0.075, -0.1, 0.15, 0.2), mass: 0.02 });
      b.box('frame_glass', [0.155, 0.205, 0.003], [0, 0.12, 0.0105], 'glass', { strength: 0.8, castShadow: false });
      b.box('frame_stand', [0.02, 0.14, 0.012], [0, 0.07, -0.035], 'walnut', { grain: 1, rot: [0.45, 0, 0], fracturable: false, mass: 0.05 });
    });
  }
  // level 3: globe, books, plant
  b.body('globe', {});
  b.at([left + 0.1, levels[3] + 0.0008, 0.0], 0, () => {
    b.cyl('globe_base', 0.05, 0.018, [0, 0.009, 0], 'plastic_black', { segs: 12, hull: true, fracturable: false, mass: 0.2 });
    b.cyl('globe_stem', 0.007, 0.07, [0, 0.05, 0], 'brass', { segs: 6, hull: true, mass: 0.04 });
    b.ball('globe', 0.085, [0, 0.14, 0], tinted('plastic_white', 0x2d6ea8, { roughness: 0.3 }), { mass: 0.35 });
  });
  fillBooks(3, left + 0.2, 0.18);
  b.body('plant', {});
  addPlant(b, 'plant', [0.31, levels[3] + 0.0008, 0.0]);
  // level 4 (top shelf): books and two mugs
  fillBooks(4, left, -0.02);
  b.body('mug', {});
  addMug(b, 'mug', [0.14, levels[4] + 0.0008, 0.02], 'ceramic_white', 0.6);
  b.body('mug', {});
  addMug(b, 'mug', [0.3, levels[4] + 0.0008, -0.02], 'ceramic_blue', 2.2);
  b.use(main);
  return b.build();
}

/** 5. Panelled timber door hung in its frame on three hinges, held shut by a latch. */
export function buildDoor() {
  const b = new PropBuilder('door', 'Wooden Door');
  const frameW = 'whitewood', doorW = 'oak';
  const DW = 0.9, DH = 2.05, DT = 0.04, gap = 0.004, y0 = 0.036;
  const JT = 0.045, JD = 0.1;
  // heavy floor plate keeps the unit standing
  b.box('floor_plate', [1.3, 0.03, 0.8], [0, 0.015, 0], 'darksteel', { mass: 34 });
  const jx = DW / 2 + gap + JT / 2;
  const jh = DH + gap + (y0 - 0.03);
  const jambL = b.box('jamb', [JT, jh, JD], [-jx, 0.03 + jh / 2, 0], frameW, { grain: 1 });
  const jambR = b.box('jamb', [JT, jh, JD], [jx, 0.03 + jh / 2, 0], frameW, { grain: 1 });
  b.box('header', [2 * jx + JT, JT, JD], [0, 0.03 + jh + JT / 2, 0], frameW, { grain: 0 });
  // stops the door closes against (it opens towards +z)
  b.box('stop', [0.012, jh - 0.01, 0.014], [jx - JT / 2 - 0.006, 0.03 + jh / 2, -0.029], frameW, { grain: 1, bond: 0.5 });
  b.box('stop', [2 * (jx - JT / 2) - 0.03, 0.012, 0.014], [0, 0.03 + jh - 0.006, -0.029], frameW, { grain: 0, bond: 0.5 });
  // let into the jamb; purely visual so it cannot foul the swing of the door edge
  b.box('strike_plate', [0.003, 0.09, 0.03], [jx - JT / 2 + 0.001, 1.0, 0.0], 'steel', { mass: 0.05 }).ghost = true;

  // --- the leaf -----------------------------------------------------------
  b.body('leaf', {});
  const sw = 0.11;
  const cy = y0 + DH / 2;
  const stileL = b.box('stile', [sw, DH, DT], [-(DW / 2 - sw / 2), cy, 0], doorW, { grain: 1 });
  const stileR = b.box('stile', [sw, DH, DT], [DW / 2 - sw / 2, cy, 0], doorW, { grain: 1 });
  const rw = DW - 2 * sw;
  const topH = 0.11, midH = 0.16, botH = 0.2;
  const yTop = y0 + DH - topH / 2, yMid = 1.0, yBot = y0 + botH / 2;
  b.box('rail', [rw, topH, DT], [0, yTop, 0], doorW, { grain: 0 });
  b.box('rail', [rw, midH, DT], [0, yMid, 0], doorW, { grain: 0 });
  b.box('rail', [rw, botH, DT], [0, yBot, 0], doorW, { grain: 0 });
  const mw = 0.1;
  const upLo = yMid + midH / 2, upHi = yTop - topH / 2;
  const loLo = yBot + botH / 2, loHi = yMid - midH / 2;
  b.box('muntin', [mw, upHi - upLo, DT], [0, (upHi + upLo) / 2, 0], doorW, { grain: 1 });
  b.box('muntin', [mw, loHi - loLo, DT], [0, (loHi + loLo) / 2, 0], doorW, { grain: 1 });
  const pw = (rw - mw) / 2;
  for (const sx of [-1, 1]) {
    const px = sx * (mw / 2 + pw / 2);
    b.box('panel', [pw + 0.02, upHi - upLo + 0.02, 0.014], [px, (upHi + upLo) / 2, 0], doorW, { grain: 1, bond: 0.6 });
    b.box('panel', [pw + 0.02, loHi - loLo + 0.02, 0.014], [px, (loHi + loLo) / 2, 0], doorW, { grain: 1, bond: 0.6 });
  }
  // lever handles both sides
  const hx = DW / 2 - 0.06;
  for (const sz of [-1, 1]) {
    b.cyl('rosette', 0.026, 0.008, [hx, yMid, sz * (DT / 2 + 0.004)], 'chrome', { axis: 2, segs: 14, mass: 0.08 });
    b.cyl('handle_neck', 0.009, 0.04, [hx, yMid, sz * (DT / 2 + 0.026)], 'chrome', { axis: 2, segs: 8, hull: true, mass: 0.06 });
    b.box('handle', [0.13, 0.018, 0.016], [hx - 0.05, yMid, sz * (DT / 2 + 0.046)], 'chrome', { mass: 0.18 });
  }
  // hinge knuckles (visual; the actual hinges are ball joints on the same line)
  const hingeX = -(DW / 2 + gap / 2);
  const hingeYs = [y0 + 0.22, y0 + DH / 2, y0 + DH - 0.22];
  for (const hy of hingeYs) {
    b.cyl('hinge', 0.008, 0.1, [hingeX, hy, DT / 2 + 0.006], 'steel', { axis: 1, segs: 8, mass: 0.12 }).ghost = true;
    b.hinge(stileL, jambL, [hingeX, hy, DT / 2], { strength: 78, axis: [0, 1, 0], span: DW });
  }
  b.latch(stileR, jambR, [DW / 2 + gap / 2, yMid, 0], 16);
  return b.build();
}

/** 10. Sideboard cabinet with two hinged doors, shelves and crockery inside. */
export function buildCabinet() {
  const b = new PropBuilder('cabinet', 'Wooden Cabinet');
  const wood = 'walnut';
  const W = 1.0, D = 0.45, T = 0.02, legH = 0.1, CH = 0.88;
  const main = b.cur;
  for (const sx of [-1, 1]) for (const sz of [-1, 1]) b.box('leg', [0.045, legH, 0.045], [sx * (W / 2 - 0.045), legH / 2, sz * (D / 2 - 0.045)], wood, { grain: 1 });
  const yb = legH + T / 2;
  b.box('bottom', [W, T, D], [0, yb, 0], wood, { grain: 0, hollow: true });
  const sideH = CH - T;
  const ys = legH + T + sideH / 2;
  const sideL = b.box('side', [T, sideH, D], [-(W / 2 - T / 2), ys, 0], wood, { grain: 1, hollow: true });
  const sideR = b.box('side', [T, sideH, D], [W / 2 - T / 2, ys, 0], wood, { grain: 1, hollow: true });
  const yTop = legH + T + sideH + 0.0125;
  const top = b.box('top', [W + 0.04, 0.025, D + 0.03], [0, yTop, 0.005], wood, { grain: 0, hollow: true });
  const divider = b.box('divider', [T, sideH, D - 0.03], [0, ys, -0.005], wood, { grain: 1, hollow: true });
  b.box('back', [W - 2 * T + 0.01, sideH, 0.006], [0, ys, -D / 2 + 0.003], 'hardboard', { grain: 1, bond: 0.5 });
  const cw = (W - 3 * T) / 2;
  const shelfY = legH + T + sideH * 0.5;
  for (const sx of [-1, 1]) b.box('shelf', [cw, 0.018, D - 0.06], [sx * (T / 2 + cw / 2), shelfY, -0.02], wood, { grain: 0, hollow: true });

  // doors
  const dw = W / 2 - 0.003, dh = sideH + T - 0.006, dt = 0.02;
  const dz = D / 2 + 0.002 + dt / 2;
  const dy = legH + 0.003 + dh / 2;
  for (const sx of [-1, 1]) {
    b.body('door', {});
    const door = b.box('door', [dw, dh, dt], [sx * (dw / 2 + 0.0015), dy, dz], wood, { grain: 1, hollow: true });
    b.cyl('knob_stem', 0.006, 0.018, [sx * 0.045, dy + 0.1, dz + dt / 2 + 0.008], 'brass', { axis: 2, segs: 8, hull: true, mass: 0.02 });
    b.ball('knob', 0.015, [sx * 0.045, dy + 0.1, dz + dt / 2 + 0.024], 'brass', { mass: 0.07 });
    const hx = sx * (W / 2 + 0.001); // pivot just outside the door edge so the door clears the carcass
    for (const hy of [dy - dh / 2 + 0.12, dy + dh / 2 - 0.12]) {
      b.cyl('hinge', 0.007, 0.07, [sx * (W / 2 + 0.004), hy, dz - dt / 2 + 0.002], 'steel', { axis: 1, segs: 8, mass: 0.06 }).ghost = true;
      b.hinge(door, sx < 0 ? sideL : sideR, [hx, hy, D / 2 + 0.001], { strength: 46, axis: [0, 1, 0], span: dw });
    }
    b.latch(door, top, [sx * 0.03, dy + dh / 2 - 0.02, D / 2 + 0.001], 7);
  }
  b.use(main);

  // --- contents (all loose) ------------------------------------------------
  const floorY = legH + T + 0.0008;
  const sy = shelfY + 0.009 + 0.0008;
  const lx = -(T / 2 + cw / 2), rx = T / 2 + cw / 2;
  // stack of plates
  for (let i = 0; i < 6; i++) {
    b.body('plate', {});
    b.cyl('plate', 0.125, 0.012, [lx - 0.02, floorY + 0.006 + i * 0.0128, -0.02], 'ceramic_white', { segs: 16, pattern: 'chunky', minRefracture: 0.06, strength: 1.2, thick: 0.006, mass: 0.55 });
  }
  // serving bowl
  b.body('bowl', {});
  addRevolved(b, 'bowl', {
    profile: [[0, 0.034], [0.018, 0.058], [0.045, 0.074], [0.064, 0.08]], th: 0.005, baseTh: 0.006, sectors: 8, rings: 2,
    surf: 'ceramic_blue', pos: [lx + 0.15, floorY, 0.11], rng: F.makeRng((Math.random() * 1e9) | 0), jitter: 0.2,
  });
  // mugs on the left shelf
  for (let i = 0; i < 3; i++) {
    b.body('mug', {});
    addMug(b, 'mug', [lx - 0.13 + i * 0.13, sy, -0.02 + (i % 2) * 0.05], i === 1 ? 'ceramic_blue' : 'ceramic_white', 0.9 + i);
  }
  // cooking pot + boxes on the right
  b.body('pot', {});
  b.at([rx - 0.05, floorY, -0.01], 0, () => {
    b.cyl('pot', 0.12, 0.13, [0, 0.065, 0], 'steel', { segs: 16, mass: 1.6, hollow: true });
    b.box('pot_handle', [0.05, 0.012, 0.03], [0.14, 0.11, 0], 'blacksteel', { mass: 0.05 });
    b.box('pot_handle', [0.05, 0.012, 0.03], [-0.14, 0.11, 0], 'blacksteel', { mass: 0.05 });
    b.cyl('pot_lid', 0.123, 0.01, [0, 0.135, 0], 'steel', { segs: 16, mass: 0.4, hull: true });
    b.ball('pot_knob', 0.016, [0, 0.154, 0], 'plastic_black', { mass: 0.02 });
  });
  // drinking glasses on the right shelf
  for (let i = 0; i < 5; i++) {
    b.body('tumbler', {});
    b.cyl('tumbler', 0.034, 0.105, [rx - 0.15 + (i % 3) * 0.1, sy + 0.0525, i < 3 ? -0.06 : 0.05], 'glass', {
      segs: 12, pattern: 'chunky', minRefracture: 0.04, strength: 0.9, thick: 0.003, mass: 0.22, castShadow: false,
    });
  }
  b.body('box', {});
  b.box('tin_box', [0.16, 0.09, 0.12], [rx + 0.12, sy + 0.0455, 0.08], tinted('plastic_white', 0x8f2d2d, { roughness: 0.35, metalness: 0.4 }), { fracturable: false, mass: 0.5 });
  b.use(main);
  return b.build();
}

/** 7. Office chair: five-star base on casters, gas lift, tilt mechanism, seat, back and arms. */
export function buildChair() {
  const b = new PropBuilder('chair', 'Office Chair');
  const metal = 'blacksteel';
  b.cyl('hub', 0.042, 0.07, [0, 0.105, 0], metal, { segs: 12, mass: 0.9 });
  for (let i = 0; i < 5; i++) {
    const a = (i / 5) * Math.PI * 2 + 0.3;
    const c = Math.cos(a), s = Math.sin(a);
    // spokes slope gently down towards the casters
    b.box('spoke', [0.3, 0.028, 0.046], [c * 0.17, 0.092, s * 0.17], 'aluminium', { rot: [0, -a, 0], mass: 0.55 });
    b.box('caster_fork', [0.034, 0.045, 0.03], [c * 0.305, 0.064, s * 0.305], 'plastic_black', { rot: [0, -a, 0], fracturable: false, mass: 0.05, bond: 3 });
    for (const off of [-0.014, 0.014]) {
      b.cyl('wheel', 0.027, 0.02, [c * 0.305 - s * off, 0.027, s * 0.305 + c * off], 'plastic_gloss', {
        axis: 2, rot: [0, -a, 0], segs: 12, fracturable: false, mass: 0.05, bond: 3,
      });
    }
  }
  b.cyl('lift', 0.026, 0.2, [0, 0.23, 0], metal, { segs: 12, mass: 1.3 });
  b.cyl('piston', 0.015, 0.14, [0, 0.375, 0], 'chrome', { segs: 10, mass: 0.6 });
  const mech = b.box('mechanism', [0.2, 0.03, 0.22], [0, 0.455, 0], metal, { mass: 1.6 });
  b.box('lever', [0.012, 0.012, 0.16], [0.13, 0.452, 0.04], metal, { rot: [0, 0.5, 0], mass: 0.08 });
  // seat
  b.box('seat_pan', [0.44, 0.014, 0.42], [0, 0.477, 0.01], 'plastic_black', { thick: 0.004, mass: 0.9 });
  b.box('seat', [0.48, 0.07, 0.46], [0, 0.519, 0.01], 'fabric', { geometry: roundedBox(0.48, 0.07, 0.46, 0.03, 0.18), mass: 2.4, fracturable: false });
  // backrest
  b.box('back_arm', [0.06, 0.012, 0.2], [0, 0.444, -0.2], metal, { mass: 0.4 });
  b.box('back_bar', [0.06, 0.4, 0.012], [0, 0.63, -0.305], metal, { rot: [-0.1, 0, 0], mass: 0.7 });
  b.at([0, 0.86, -0.315], [-0.1, 0, 0], () => {
    b.box('back_shell', [0.44, 0.5, 0.014], [0, 0, -0.012], 'plastic_black', { thick: 0.004, mass: 0.9 });
    b.box('back_pad', [0.42, 0.48, 0.05], [0, 0, 0.02], 'fabric', { geometry: roundedBox(0.42, 0.48, 0.05, 0.022, 0.18), mass: 1.3, fracturable: false });
  });
  // armrests
  for (const sx of [-1, 1]) {
    b.box('arm_bracket', [0.2, 0.012, 0.05], [sx * 0.19, 0.452, 0], metal, { mass: 0.3 });
    b.box('arm_post', [0.03, 0.2, 0.05], [sx * 0.275, 0.555, 0], 'plastic_black', { thick: 0.006, mass: 0.3 });
    b.box('arm_pad', [0.06, 0.026, 0.25], [sx * 0.275, 0.668, 0.0], 'plastic_black', { geometry: roundedBox(0.06, 0.026, 0.25, 0.011, 0.25), mass: 0.25, fracturable: false });
  }
  void mech;
  return b.build();
}

/** Plain desk used by the PC setup. Returns the top surface height. */
export function addDesk(b) {
  const wood = 'oak';
  const W = 1.5, D = 0.72, H = 0.75, T = 0.03;
  b.box('desk_top', [W, T, D], [0, H - T / 2, 0], wood, { grain: 0, hollow: true });
  b.box('desk_side', [0.03, H - T, D - 0.06], [-(W / 2 - 0.045), (H - T) / 2, 0], wood, { grain: 1, hollow: true });
  b.box('desk_side', [0.03, H - T, D - 0.06], [W / 2 - 0.045, (H - T) / 2, 0], wood, { grain: 1, hollow: true });
  b.box('desk_modesty', [W - 0.12, 0.4, 0.018], [0, H - T - 0.2, -D / 2 + 0.06], wood, { grain: 0, hollow: true });
  // cable tray under the top
  b.box('desk_tray', [0.5, 0.012, 0.1], [0, H - T - 0.1, -D / 2 + 0.12], 'darksteel', { mass: 0.8 });
  b.box('desk_tray_arm', [0.012, 0.1, 0.012], [-0.24, H - T - 0.05, -D / 2 + 0.12], 'darksteel', { mass: 0.1 });
  b.box('desk_tray_arm', [0.012, 0.1, 0.012], [0.24, H - T - 0.05, -D / 2 + 0.12], 'darksteel', { mass: 0.1 });
  return H;
}

export { surface };
