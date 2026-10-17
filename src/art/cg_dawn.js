// CG ending_dawn — the friends on the school's front steps at gray-violet dawn. The rain has stopped;
// steam drifts off the walk; water still drips from the arch. Behind them the front doors stand open on
// the vestibule, and (params.uniform) the Colonel's empty navy coat lies slumped on its floor in the
// first light, the crimson sash across it — the last thing left behind. params.who picks who is
// there; each friend keeps a fixed place on the steps, so a smaller group leaves the steps emptier.
import {
  W, H, PAL, mix, U, Buf, rampStops, shade, bay, h01, fbm, vnoise, clamp01, smooth, mixU,
  text57, text57Width, makeVapor, makePlumes, once, seeds,
} from './cg_kit.js';
import { LIGHT_COLORS } from './palette.js';
import { CAST } from './cg_cast.js';
import { renderKid } from './cg_kids.js';

const DAWN = LIGHT_COLORS.dawn;          // '#c9b6c8' gray-violet
const SKY = rampStops([mix(PAL.g3, PAL.velvet_d, 0.3), mix(PAL.g4, PAL.velvet, 0.18), mix(PAL.g5, DAWN, 0.5), DAWN, mix(DAWN, PAL.cream_l, 0.5), mix(PAL.cream_l, PAL.white, 0.4)], 12);
const BRICK = rampStops([PAL.ink, mix(PAL.brick_d, PAL.night, 0.5), mix(PAL.brick_d, PAL.g2, 0.3), mix(PAL.brick, PAL.g3, 0.35), mix(PAL.brick_l, PAL.g4, 0.35), mix(PAL.brick_l, DAWN, 0.45)], 10);
const STONE = rampStops([PAL.ink, mix(PAL.g1, PAL.velvet_d, 0.2), mix(PAL.g2, PAL.blue_d, 0.15), mix(PAL.g3, DAWN, 0.15), mix(PAL.g4, DAWN, 0.3), mix(PAL.g5, DAWN, 0.4), mix(PAL.g6, PAL.white, 0.3)], 12);
const DARK = rampStops([PAL.ink, PAL.night, mix(PAL.shadow, PAL.velvet_d, 0.2), mix(PAL.g1, PAL.blue_d, 0.3), mix(PAL.g2, DAWN, 0.2), mix(PAL.g3, DAWN, 0.35)], 10);
const WOOD = rampStops([PAL.ink, PAL.brown_dd, PAL.wood_d, mix(PAL.wood, PAL.g3, 0.3), mix(PAL.wood_l, DAWN, 0.3)], 8);
const GLASS = rampStops([PAL.night, mix(PAL.g2, PAL.velvet_d, 0.3), mix(PAL.g4, DAWN, 0.5), mix(DAWN, PAL.skin_l, 0.35), mix(PAL.cream_l, PAL.white, 0.4)], 9);
const PINK = U(mix(PAL.skin_l, DAWN, 0.4)), COOL = U(mix(PAL.blue_d, PAL.velvet_d, 0.5));
const TINT = U(DAWN), RIM = U(mix(PAL.cream_l, PAL.skin_l, 0.4));
const LAWN = rampStops([PAL.ink, mix(PAL.green_dd, PAL.brown_dd, 0.5), mix(PAL.green_d, PAL.mustard_d, 0.5), mix(PAL.mustard_d, PAL.g3, 0.5), mix(PAL.tan, DAWN, 0.5)], 8);

// layout
const CX = 240;
const PAV = { x0: 130, x1: 350 };
const FRIEZE = { y0: 4, y1: 20 };
const DOOR = { x0: 192, x1: 288, apex: 30, spring: 40, sill: 122 };
const INNER = { x0: 214, x1: 266, y0: 50, y1: 94 };       // the vestibule's far wall (inner doors)
const STEP0 = 122, RISE = 11, TREAD = 3;
const WING_BASE = 136;
const tread = (k) => STEP0 + RISE * k;
const stepHalf = (k) => 86 + 9 * k;
// fixed places on the steps: [x centre, step the seat is on]
const SEATS = { leah: [174, 1], tess: [201, 1], danny: [282, 2], marcus: [310, 1] };
const ORDER = ['marcus', 'leah', 'tess', 'danny'];      // back to front

const mkR = (seed) => { let i = 0; return () => h01(i++, seed, 1023); };

function paintSkyAndWings(b) {
  for (let y = 0; y < 150; y++) for (let x = 0; x < W; x++) {
    const c = fbm(x / 80 + y / 160, y / 14, 31, 4);
    const v = 0.3 + 0.5 * (y / 60) + (c - 0.5) * 0.25 + 0.1 * Math.exp(-Math.abs(x - 60) / 120);
    b.px(x, y, shade(SKY, clamp01(v), x, y));
  }
  // the wings, set back from the pavilion: brick, a stone cornice, window groups
  for (const [x0, x1] of [[0, PAV.x0], [PAV.x1, W]]) {
    for (let y = 26; y < WING_BASE; y++) for (let x = x0; x < x1; x++) {
      const course = y % 3, cidx = (y / 3) | 0, joint = (x + (cidx & 1) * 3) % 7 === 0;
      let v = 0.42 + (vnoise(((x + (cidx & 1) * 3) / 7) | 0, cidx, 3) - 0.5) * 0.1 - (course === 0 || joint ? 0.08 : 0);
      v -= 0.08 + 0.1 * clamp01((y - 100) / 36);
      v += x < 130 ? 0.03 : -0.04;
      b.px(x, y, shade(BRICK, clamp01(v - 0.1 * fbm(x / 4, y / 20, 8, 2)), x, y));
    }
    for (let x = x0; x < x1; x++) { b.px(x, 24, shade(STONE, 0.75, x, 24)); b.px(x, 25, shade(STONE, 0.55, x, 25)); b.px(x, 26, shade(STONE, 0.3, x, 26)); b.px(x, 80, shade(STONE, 0.6, x, 80)); b.px(x, 81, shade(STONE, 0.35, x, 81)); }
    for (let gx = x0 === 0 ? 14 : 370; gx < x1 - 20; gx += 46) {
      for (const [wy, wh] of [[36, 32], [90, 36]]) {
        b.rect(gx - 2, wy - 2, 34, wh + 4, (x, y) => shade(STONE, 0.5 + (y === wy - 2 ? 0.15 : 0), x, y));
        for (let k = 0; k < 3; k++) {
          const wx = gx + k * 10;
          b.rect(wx, wy, 9, wh, (x, y) => {
            const refl = clamp01(1 - (x - wx + (y - wy) * 0.4) / 10);
            const tr = y === wy + 10;
            return tr ? shade(STONE, 0.45, x, y) : shade(GLASS, clamp01(0.15 + 0.5 * refl * (y < wy + 10 ? 1 : 0.5)), x, y);
          });
          if ((gx + k) % 3 === 0) b.rect(wx, wy + 11, 9, wh - 11, (x, y) => shade(WOOD, 0.35 + (((x - wx) >> 1) % 2) * 0.1, x, y)); // boarded
        }
        b.hline(gx - 3, wy + wh + 2, 36, shade(STONE, 0.8, 0, 0));
      }
    }
  }
}

function paintPavilion(b) {
  const lit = (x) => 0.48 - 0.06 * clamp01((x - PAV.x0) / (PAV.x1 - PAV.x0));
  for (let y = 0; y < STEP0 + 2; y++) for (let x = PAV.x0; x < PAV.x1; x++) {
    const course = y % 3, cidx = (y / 3) | 0, joint = (x + (cidx & 1) * 3) % 7 === 0;
    let v = lit(x) + (vnoise(((x + (cidx & 1) * 3) / 7) | 0, cidx, 5) - 0.5) * 0.1 - (course === 0 || joint ? 0.09 : 0);
    v -= 0.08 * fbm(x / 3, y / 16, 77, 2);                       // rain streaks down the brick
    b.px(x, y, shade(BRICK, clamp01(v), x, y));
  }
  // the great window's foot at the top of the frame
  b.rect(PAV.x0 + 16, 0, PAV.x1 - PAV.x0 - 32, 3, (x, y) => shade(STONE, 0.45 + (y === 2 ? -0.15 : 0), x, y));
  // buttresses
  for (const bx of [PAV.x0, PAV.x1 - 16]) {
    for (let y = 0; y < STEP0 + 4; y++) for (let x = bx; x < bx + 16; x++) {
      const side = x - bx;
      let v = 0.56 + (side < 2 ? 0.18 : side > 12 ? -0.16 : 0) - ((y % 14) === 0 ? 0.12 : 0);
      if (y > 70 && y < 76) v += y === 71 ? 0.2 : -0.1;              // a weathered set-off
      b.px(x, y, shade(STONE, clamp01(v + (vnoise(x / 2, y / 2, 13) - 0.5) * 0.08), x, y));
    }
  }
  // frieze + motto (carved: shadowed cut, lit lower lip)
  for (let y = FRIEZE.y0; y < FRIEZE.y1; y++) for (let x = PAV.x0 + 18; x < PAV.x1 - 18; x++) {
    b.px(x, y, shade(STONE, clamp01(0.62 + (y === FRIEZE.y0 ? 0.15 : 0) - (y === FRIEZE.y1 - 1 ? 0.25 : 0) + (vnoise(x / 2, y / 2, 3) - 0.5) * 0.08), x, y));
  }
  const motto = 'NEMO RELINQUATUR';
  const tx = CX - Math.floor(text57Width(motto, 2) / 2);
  text57(b, tx + 1, FRIEZE.y0 + 5, motto, (x, y) => shade(STONE, 0.86, x, y), { track: 2 });
  text57(b, tx, FRIEZE.y0 + 4, motto, (x, y) => shade(STONE, 0.18, x, y), { track: 2 });
  // door surround: a stone frame with a Tudor arch, label-moulding over it
  for (let y = 21; y < STEP0; y++) for (let x = DOOR.x0 - 10; x < DOOR.x1 + 10; x++) {
    b.px(x, y, shade(STONE, clamp01(0.6 + (x < DOOR.x0 - 7 ? 0.12 : 0) - (x > DOOR.x1 + 7 ? 0.1 : 0) - ((y - 21) % 12 === 0 ? 0.06 : 0) + (vnoise(x / 2, y / 2, 9) - 0.5) * 0.06), x, y));
  }
  b.hline(DOOR.x0 - 12, 21, DOOR.x1 - DOOR.x0 + 24, shade(STONE, 0.85, 0, 0));
  b.hline(DOOR.x0 - 12, 22, DOOR.x1 - DOOR.x0 + 24, shade(STONE, 0.35, 0, 0));
}

const archY = (x) => {
  const half = (DOOR.x1 - DOOR.x0) / 2, u = (x + 0.5 - CX) / half;
  return DOOR.spring - Math.round((DOOR.spring - DOOR.apex) * Math.sqrt(Math.max(0, 1 - u * u)) ** 0.7);
};
const inOpening = (x, y) => x >= DOOR.x0 && x < DOOR.x1 && y >= archY(x) && y < DOOR.sill;

function paintVestibule(b, uniform) {
  // perspective box: far wall (inner doors), floor, side walls; the dawn spills in across the floor
  for (let y = DOOR.apex; y < DOOR.sill; y++) for (let x = DOOR.x0; x < DOOR.x1; x++) {
    if (!inOpening(x, y)) continue;
    const t = clamp01((y - INNER.y1) / (DOOR.sill - INNER.y1));                   // 0 at far wall … 1 at sill
    const fx0 = INNER.x0 + (DOOR.x0 - INNER.x0) * t, fx1 = INNER.x1 + (DOOR.x1 - INNER.x1) * t;
    let v;
    if (y >= INNER.y1 && x >= fx0 && x < fx1) {
      // terrazzo floor: wet, the morning lying across it toward the door
      v = 0.1 + 0.62 * t ** 1.4 + (h01(x, y, 3) < 0.08 ? 0.06 : 0);
      if (((x - CX) * (1 - t * 0.5) | 0) % 13 === 0) v -= 0.04;
    } else if (x >= INNER.x0 && x < INNER.x1 && y >= INNER.y0 && y < INNER.y1) {
      // the inner doors: two dark leaves with glass, the lobby black beyond
      const ix = x - INNER.x0, iy = y - INNER.y0;
      const glass = iy > 6 && iy < 26 && ((ix > 4 && ix < 22) || (ix > 29 && ix < 48));
      v = glass ? 0.02 : 0.12 + (ix === 26 ? -0.08 : 0);
    } else {
      // side walls of the vestibule: plaster, the trophy case's glass on the left
      v = 0.1 + 0.08 * t;
      if (x < CX && y > 56 && y < 86 && x > fx0 - 8 && x < fx0 - 1) v = 0.26 + (((x + y) % 5) === 0 ? 0.15 : 0);
    }
    b.px(x, y, shade(DARK, clamp01(v), x, y));
  }
  // the inner doors' frame + the lit edge of the floor where the sill is
  b.hline(INNER.x0, INNER.y1, INNER.x1 - INNER.x0, shade(DARK, 0.3, 0, 0));
  // the front doors, swung wide inward: narrow leaves against the jambs
  for (const side of [0, 1]) {
    for (let y = DOOR.apex; y < DOOR.sill; y++) for (let i = 0; i < 12; i++) {
      const x = side ? DOOR.x1 - 1 - i : DOOR.x0 + i;
      const top = archY(side ? DOOR.x1 - 1 : DOOR.x0) + 4 + i * 0.6, bot = DOOR.sill - 1 - i * 0.9;
      if (y < top || y > bot) continue;
      const pane = i > 3 && i < 9 && y > top + 12 && y < top + 30;
      const v = pane ? 0.18 : (side ? 0.22 : 0.42) - i * 0.012 + (i === 0 ? 0.08 : 0);
      b.px(x, y, pane ? shade(GLASS, 0.3, x, y) : shade(WOOD, clamp01(v + (vnoise(i, y / 7, 4) - 0.5) * 0.08), x, y));
    }
  }
  // the threshold: worn brass strip
  b.hline(DOOR.x0, DOOR.sill - 1, DOOR.x1 - DOOR.x0, U(mix(PAL.brass, DAWN, 0.3)));
}

function paintUniform(b) {
  // the empty coat, collapsed on the vestibule floor: a long low heap of navy wool, one sleeve flung
  // out, the crimson sash across it, buttons and an epaulette catching the dawn; coal dust round it
  const cx = 242, cy = 106;
  const r = mkR(1911);
  for (let k = 0; k < 60; k++) { const x = cx - 30 + r() * 60, y = cy + 4 + r() * 8; b.px(x, y, shade(DARK, 0.04, x, y)); }
  b.ellipse(cx + 1, cy + 7, 26, 3, (x, y) => mixU(b.get(x, y), U(PAL.ink), 0.45));       // its shadow
  const heap = (x, y) => {
    const nx = (x - cx) / 22, ny = (y - cy) / 7;
    const top = ny < -0.25 && nx < 0.3;
    const v = 0.2 + (top ? 0.25 : 0) - 0.1 * clamp01(ny) + (vnoise(x / 2, y / 1.5, 6) - 0.5) * 0.14;
    return shade(CAST.navy, clamp01(v), x, y);
  };
  b.poly([[cx - 24, cy + 6], [cx - 18, cy - 2], [cx - 8, cy - 6], [cx + 6, cy - 5], [cx + 16, cy - 1], [cx + 22, cy + 3], [cx + 24, cy + 7]], heap);
  b.poly([[cx + 14, cy + 1], [cx + 26, cy + 4], [cx + 34, cy + 8], [cx + 30, cy + 9], [cx + 18, cy + 7]], heap);       // the sleeve
  b.poly([[cx - 22, cy + 4], [cx - 30, cy + 7], [cx - 26, cy + 9], [cx - 16, cy + 8]], heap);
  // folds
  for (const [x0, y0, x1, y1] of [[cx - 14, cy - 3, cx - 6, cy + 5], [cx + 2, cy - 4, cx + 8, cy + 6], [cx + 12, cy - 1, cx + 16, cy + 6]]) b.line(x0, y0, x1, y1, shade(CAST.navy, 0.05, 0, 0));
  // the sash: crimson, draped across and trailing its fringe onto the floor
  for (let i = 0; i < 34; i++) {
    const x = cx - 18 + i, y = cy - 4 + Math.round(i * 0.3 + Math.sin(i / 5) * 1.2);
    b.px(x, y, shade(CAST.sash, 0.75, x, y)); b.px(x, y + 1, shade(CAST.sash, 0.5, x, y)); b.px(x, y + 2, shade(CAST.sash, 0.25, x, y));
  }
  for (let i = 0; i < 6; i++) b.vline(cx + 16 + i, cy + 8, 2 + (i % 2), shade(CAST.sash, 0.5, 0, 0));
  // brass buttons, a medal, the gold fringe of an epaulette
  for (const [x, y] of [[cx - 6, cy - 1], [cx - 4, cy + 3], [cx - 9, cy + 4], [cx + 4, cy]]) { b.px(x, y, shade(CAST.brass, 0.75, x, y)); b.px(x + 1, y + 1, shade(CAST.brass, 0.2, x, y)); }
  for (let i = 0; i < 7; i++) b.px(cx - 20 + i, cy + 1 + (i & 1), shade(CAST.brass, i % 2 ? 0.45 : 0.7, 0, 0));
  b.rect(cx - 21, cy - 1, 8, 2, (x, y) => shade(CAST.brass, 0.55, x, y));
}

function paintSteps(b) {
  // the lawn and the wings' foundations either side; a dead hedge along the brick
  for (let y = WING_BASE; y < H; y++) for (let x = 0; x < W; x++) {
    let v;
    if (y < WING_BASE + 4) v = 0.62 - (y - WING_BASE) * 0.1;                      // water table
    else if (y < WING_BASE + 14) v = -1;                                            // hedge
    else v = -2;                                                                    // lawn
    if (v >= 0) b.px(x, y, shade(STONE, clamp01(v), x, y));
    else if (v === -1) {
      const n = fbm(x / 5, y / 4, 61, 3);
      b.px(x, y, shade(rampStops([PAL.ink, mix(PAL.green_dd, PAL.brown_dd, 0.5), mix(PAL.green_d, PAL.g3, 0.4), mix(PAL.mustard_d, DAWN, 0.4)], 6), clamp01(0.2 + n * 0.5 - (y - WING_BASE - 4) * 0.03), x, y));
    } else {
      // the walk runs straight out from the foot of the steps, widening toward us
      const half = 70 + (y - WING_BASE) * 0.6;
      if (Math.abs(x - CX) < half) {
        const v = 0.5 + (fbm(x / 14, y / 5, 4, 2) - 0.5) * 0.12 - ((y - 140) % 22 === 0 ? 0.12 : 0) + (vnoise(x / 30, y / 8, 9) > 0.66 ? 0.16 : 0);
        b.px(x, y, shade(STONE, clamp01(v), x, y));
        continue;
      }
      const n = vnoise(x * 0.7, y * 0.3, 62), m = fbm(x / 40, y / 16, 63, 2);
      b.px(x, y, shade(LAWN, clamp01(0.28 + (n - 0.5) * 0.16 + (m - 0.5) * 0.2 - 0.1 * clamp01((y - 150) / 80)), x, y));
    }
  }
  for (let k = 0; k < 10; k++) {
    const y0 = tread(k), half = stepHalf(k);
    for (let y = y0; y < y0 + RISE; y++) for (let x = CX - half; x < CX + half; x++) {
      const isTread = y < y0 + TREAD;
      let v = isTread ? 0.74 - (y - y0) * 0.06 : 0.4 - (y - y0 - TREAD) * 0.012;
      v += (vnoise(x / 3, y / 2, 20 + k) - 0.5) * 0.1;
      if (!isTread && (x - CX + 400) % 37 === 0) v -= 0.12;                       // joints between blocks
      if (isTread && Math.abs(x - CX) < half - 30 && vnoise(x / 12, k, 4) > 0.62) v = 0.86 - (y - y0) * 0.05; // puddled sky
      v -= 0.05 * clamp01((x - CX) / 120);
      b.px(x, y, shade(STONE, clamp01(v), x, y));
    }
    for (let x = CX - 30; x < CX + 30; x++) b.px(x, y0 + 1, shade(STONE, 0.62, x, y0 + 1));   // worn hollow
    // stepped cheek walls: a cap stone per step, the block face below it
    for (const side of [-1, 1]) for (let y = y0 - 5; y < y0 + RISE; y++) for (let i = 0; i < 12; i++) {
      const x = side < 0 ? CX - half - 1 - i : CX + half + i;
      const cap = y < y0 - 2;
      let v = cap ? 0.8 - (y - y0 + 5) * 0.12 : 0.5 + (i < 1 ? (side < 0 ? 0.12 : -0.15) : 0) - (y === y0 + RISE - 1 ? 0.15 : 0);
      if (!cap && i === 11) v -= 0.12;
      b.px(x, y, shade(STONE, clamp01(v + (vnoise(x / 3, y / 3, 33) - 0.5) * 0.08), x, y));
    }
  }
}

// the facade base where it meets the steps (behind the kids), wet and darker
function paintBase(b) {
  for (let y = STEP0 - 4; y < STEP0; y++) for (let x = PAV.x0; x < PAV.x1; x++) {
    if (inOpening(x, y)) continue;
    b.px(x, y, mixU(b.get(x, y), U(PAL.ink), 0.2));
  }
}

function kidLayer(who) {
  const b = new Buf();
  for (const id of ORDER) {
    if (!who.includes(id)) continue;
    const kid = renderKid(id, { tint: TINT, tintK: 0.1, rim: RIM });
    const [x, k] = SEATS[id];
    const feet = tread(k + 1) + 1;                       // feet on the tread below the seat
    const x0 = x - (kid.w >> 1), y0 = feet - kid.h;
    // a soft contact shadow on the steps
    for (let j = -1; j < 3; j++) for (let i = -9; i < 10; i++) b.px(x + i, tread(k) + 2 + j, (i + j) & 1 ? 0 : U(mix(PAL.g2, PAL.velvet_d, 0.3)));
    b.draw(kid, x0, y0);
  }
  return b.toCanvas();
}

// dawn grade: the low sun comes from the left — warm the lit side, cool the shade on the right
function grade(b) {
  b.map((c, x, y) => {
    const warm = clamp01(1 - x / 300) * 0.16 * (1 - clamp01((y - 120) / 150) * 0.5);
    const cool = clamp01((x - 260) / 220) * 0.14 + clamp01((y - 170) / 100) * 0.1;
    let o = c;
    if (warm > bay(x, y) * 0.3) o = mixU(o, PINK, warm);
    if (cool > 0.02) o = mixU(o, COOL, cool);
    return o;
  });
}
const base = once(() => {
  const b = new Buf();
  paintSkyAndWings(b); paintPavilion(b); paintVestibule(b, false); paintBase(b); paintSteps(b);
  const u = b.clone();
  paintUniform(u);
  grade(b); grade(u);
  return {
    plain: b.toCanvas(), uniform: u.toCanvas(),
    vapor: makeVapor(0, 40, W, 230, [mix(PAL.g4, DAWN, 0.5), mix(PAL.g5, DAWN, 0.6)]),
    plumes: makePlumes([
      { x: 430, y: 236, rise: 120, r0: 8, r1: 40, life: 16, a: 0.18, w: 24, wind: -90, spread: 10 },
      { x: 70, y: 240, rise: 110, r0: 8, r1: 36, life: 17, a: 0.15, w: 20, wind: 70, spread: 10 },
      { x: 380, y: 196, rise: 90, r0: 6, r1: 28, life: 14, a: 0.12, w: 16, wind: -60, spread: 8 },
    ], 7, 18),
    drips: seeds(8, 21),
  };
});
const kidCache = new Map();
function kids(who) {
  const key = ORDER.filter((id) => who.includes(id)).join(',');
  if (!kidCache.has(key)) kidCache.set(key, kidLayer(who));
  return kidCache.get(key);
}

export function prepDawn() { base(); kids(['tess', 'danny', 'leah', 'marcus']); }

export const endingDawn = {
  draw(ctx, t = 0, params = {}) {
    const B = base();
    const who = Array.isArray(params.who) ? params.who : ['tess', 'danny', 'leah', 'marcus'];
    ctx.drawImage(params.uniform ? B.uniform : B.plain, 0, 0);
    // water still dripping off the arch and the frieze
    const d = B.drips;
    ctx.fillStyle = 'rgba(232,226,236,0.8)';
    for (let i = 0; i < 8; i++) {
      const per = 1.6 + d[i * 4] * 2.2, ph = ((t + d[i * 4 + 1] * per) % per) / per;
      const x = [186, 197, 226, 251, 283, 296, 150, 330][i], y0 = [23, 34, 22, 22, 34, 23, 124, 124][i];
      if (ph < 0.55) { if (ph > 0.4) ctx.fillRect(x, y0, 1, 1); continue; }
      const y = y0 + (ph - 0.55) ** 2 * 520;
      if (y < tread(1)) ctx.fillRect(x, y | 0, 1, 2);
    }
    ctx.drawImage(kids(who), 0, 0);
    B.vapor.clear(); B.plumes(B.vapor, t + 30); B.vapor.render(ctx);
  },
};
