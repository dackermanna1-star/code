// CG ending_present — Room 102 at dawn. Seen from the back of the room: desks in perfect rows, dust
// hanging in the shafts that come through the grimy east windows, and one red-haired girl in a
// light denim jacket sitting very straight at a desk, her back to us. The chalkboard, in fresh chalk:
// THERESA DOLAN — PRESENT. The clock above it has stopped at 1:45. Room tone only; the dust moves.
// Built with a tiny raycast (floor / walls / ceiling / far wall) so the perspective and the light are
// consistent; desks and Tess are projected boxes painted back to front.
import {
  W, H, PAL, mix, U, Buf, rampStops, shade, bay, h01, fbm, vnoise, clamp01, smooth, mixU,
  text57, text57Width, once, lazyGen, seeds,
} from './cg_kit.js';
import { LIGHT_COLORS } from './palette.js';
import { CAST } from './cg_cast.js';

const DAWN = LIGHT_COLORS.dawn;
const GREEN = rampStops([PAL.ink, PAL.green_dd, PAL.green_d, PAL.green, PAL.green_l, mix(PAL.mint, PAL.cream_l, 0.4)], 12);
const CREAM = rampStops([PAL.ink, mix(PAL.cream_d, PAL.g1, 0.6), mix(PAL.cream_d, PAL.g3, 0.4), PAL.cream_d, PAL.cream, PAL.cream_l, mix(PAL.cream_l, PAL.white, 0.5)], 12);
const SLATE = rampStops([PAL.ink, mix(PAL.slate, PAL.ink, 0.4), PAL.slate, PAL.slate_l, mix(PAL.slate_l, PAL.g4, 0.4)], 8);
const CHALK = rampStops([mix(PAL.slate_l, PAL.g4, 0.4), PAL.g5, PAL.g6, PAL.white], 6);
const WOOD = rampStops([PAL.ink, PAL.brown_dd, PAL.wood_d, PAL.wood, PAL.wood_l, PAL.maple, PAL.maple_l, mix(PAL.maple_l, PAL.cream_l, 0.5)], 12);
const STEEL = rampStops([PAL.ink, PAL.shadow, PAL.g1, PAL.g2, PAL.g3, PAL.g5], 8);
const GLASS = rampStops([mix(PAL.g3, DAWN, 0.4), mix(DAWN, PAL.cream_l, 0.3), mix(PAL.cream_l, PAL.skin_l, 0.3), mix(PAL.white, PAL.cream_l, 0.3)], 8);
const SUN = U(mix(PAL.yellow_l, PAL.skin_l, 0.45)), DUST = U(mix(PAL.cream_l, DAWN, 0.25));

// camera + room (metres): camera at the back of the room, eye 1.5 m, looking at the front wall
const VP = { x: 246, y: 118 }, F = 300, EYE = 1.5;
const ROOM = { x0: -4, x1: 4, h: 3.4, z: 8 };
const WINS = [[1.4, 2.7], [3.4, 4.7], [5.4, 6.7]];      // window bays on the left wall (z ranges)
const WIN_Y = [0.95, 2.95];
const SUN_D = [1, -0.36, -0.3];                           // a low dawn sun: right, a little down, toward us
const BOARD = { x0: -2.6, x1: 2.6, y0: 0.92, y1: 2.12 };
const ROWS = [3.0, 4.2, 5.4, 6.6], COLS = [-2.5, -0.85, 0.8, 2.45];
const TESS = { col: 2, row: 1 };

const proj = (X, Y, Z) => [VP.x + (F * X) / Z, VP.y + (F * (EYE - Y)) / Z];

// does a point in the room sit in sunlight? trace back along SUN_D to the window wall
function sunAt(X, Y, Z) {
  const t = (X - ROOM.x0) / SUN_D[0];
  const Yw = Y - SUN_D[1] * t, Zw = Z - SUN_D[2] * t;
  if (Yw < WIN_Y[0] || Yw > WIN_Y[1]) return 0;
  for (const [a, b] of WINS) if (Zw > a && Zw < b) {
    // mullions and the meeting rail cast thin shadow bars
    const u = (Zw - a) / (b - a), v = (Yw - WIN_Y[0]) / (WIN_Y[1] - WIN_Y[0]);
    if (Math.abs(u - 0.5) < 0.025 || Math.abs(v - 0.52) < 0.02) return 0.15;
    return 1;
  }
  return 0;
}

function paintRoom(b) {
  for (let y = 0; y < H; y++) for (let x = 0; x < W; x++) {
    const dx = (x + 0.5 - VP.x) / F, dy = (VP.y - y - 0.5) / F;
    // nearest surface along the ray (z is the ray parameter)
    let z = ROOM.z, surf = 'far';
    if (dy < 0) { const zf = EYE / -dy; if (zf < z) { z = zf; surf = 'floor'; } }
    if (dy > 0) { const zc = (ROOM.h - EYE) / dy; if (zc < z) { z = zc; surf = 'ceil'; } }
    if (dx < 0) { const zl = ROOM.x0 / dx; if (zl < z) { z = zl; surf = 'left'; } }
    if (dx > 0) { const zr = ROOM.x1 / dx; if (zr < z) { z = zr; surf = 'right'; } }
    const X = dx * z, Y = EYE + dy * z, Z = z;
    const fall = clamp01(1 - (Z - 1) / 14);                               // a little haze with depth
    let c;
    if (surf === 'floor') {
      // far tiles shrink below a few pixels: fade the checker out there instead of letting it alias
      const tsz = (0.3 * F) / Z;
      const tile = (Math.floor(X / 0.3) + Math.floor(Z / 0.3)) & 1;
      const ck = clamp01((tsz - 2) / 4);
      let v = (tile ? 0.36 : 0.32) * ck + 0.34 * (1 - ck) + (fbm(X * 3, Z * 3, 5, 2) - 0.5) * 0.1;
      const crack = Math.abs(vnoise(X * 2.2, Z * 2.2, 9) - 0.5) < 0.012;
      if (crack) v -= 0.14;
      const s = sunAt(X, 0, Z);
      v = v * (0.45 + 0.5 * s) + s * 0.22;
      c = shade(tile || ck < 0.5 ? CREAM : GREEN, clamp01(v * fall + 0.03), x, y);
      if (ck < 0.5 && !tile) c = mixU(c, shade(GREEN, clamp01(v * fall + 0.03), x, y), 0.5);
      if (s > 0.5) c = mixU(c, SUN, 0.3);
    } else if (surf === 'ceil') {
      const tileEdge = (X / 0.6 % 1 + 1) % 1 < 0.04 || (Z / 0.6 % 1 + 1) % 1 < 0.05;
      let v = 0.16 + (tileEdge ? -0.05 : 0) + (vnoise(X * 4, Z * 4, 3) - 0.5) * 0.04 + 0.06 * clamp01(-X / 4); // a bounce of light near the windows
      // dead fluorescent fixtures in two rows
      for (const fx of [-1.6, 1.6]) if (Math.abs(X - fx) < 0.3 && ((Z % 2.4) + 2.4) % 2.4 < 1.3) v = Math.abs(X - fx) < 0.22 ? 0.24 : 0.08;
      if (vnoise(X * 2, Z * 2, 5) > 0.7) v -= 0.04;                                           // water stains
      c = shade(CREAM, clamp01(v * (0.6 + 0.4 * fall)), x, y);
    } else if (surf === 'left') {
      c = leftWall(Y, Z, x, y, fall);
    } else if (surf === 'right') {
      c = rightWall(Y, Z, x, y, fall);
    } else {
      c = farWall(X, Y, x, y);
    }
    b.px(x, y, c);
  }
}
function wallPaint(Y, x, y, fall, lit = 0) {
  if (Y < 1.15) return shade(GREEN, clamp01((0.27 + lit) * fall + (vnoise(x / 2, y / 2, 7) - 0.5) * 0.04), x, y);
  if (Y < 1.21) return shade(WOOD, clamp01((0.3 + lit) * fall), x, y);                        // chair rail
  const peel = vnoise(x / 9, y / 5, 11) > 0.8 ? -0.06 : 0;                                       // peeling patches
  const stain = Math.max(0, vnoise(x / 30, 1, 12) - 0.6) * clamp01((Y - 2.4) * 2) * -0.3;      // water stains from the ceiling
  return shade(CREAM, clamp01((0.27 + lit + peel + stain) * fall + (vnoise(x / 2, y / 2, 8) - 0.5) * 0.03), x, y);
}
function leftWall(Y, Z, x, y, fall) {
  for (const [a, bb] of WINS) {
    if (Z > a - 0.08 && Z < bb + 0.08 && Y > WIN_Y[0] - 0.08 && Y < WIN_Y[1] + 0.08) {
      const inGlass = Z > a && Z < bb && Y > WIN_Y[0] && Y < WIN_Y[1];
      if (!inGlass) return shade(WOOD, 0.4 * fall + 0.1, x, y);
      const u = (Z - a) / (bb - a), v = (Y - WIN_Y[0]) / (WIN_Y[1] - WIN_Y[0]);
      if (Math.abs(u - 0.5) < 0.025 || Math.abs(v - 0.52) < 0.02) return shade(WOOD, 0.5, x, y);
      // grimy glass glowing with the dawn: brighter up top, streaked, a cracked pane
      const grime = fbm(u * 5, v * 9, 13 + a * 10, 3);
      let g = 0.55 + 0.35 * v - grime * 0.35 - (Math.abs(u - 0.25 - v * 0.1) < 0.01 && a > 3 ? 0.4 : 0);
      return shade(GLASS, clamp01(g), x, y);
    }
  }
  return wallPaint(Y, x, y, fall * 0.85);
}
function rightWall(Y, Z, x, y, fall) {
  // cork board with curling papers, then the hall door with its wired glass
  if (Z > 2.2 && Z < 4.4 && Y > 1.3 && Y < 2.3) {
    const paper = vnoise(Z * 6, Y * 6, 17) > 0.6;
    return paper ? shade(CREAM, 0.5 * fall + 0.1, x, y) : shade(WOOD, (0.38 + (h01(x, y, 3) < 0.2 ? -0.06 : 0)) * fall, x, y);
  }
  if (Z > 5.4 && Z < 6.4 && Y < 2.2) {
    if (Z > 5.6 && Z < 6.2 && Y > 1.3 && Y < 2.0) return shade(SLATE, 0.2, x, y);
    return shade(WOOD, (Z < 5.47 || Z > 6.33 ? 0.25 : 0.42) * fall, x, y);
  }
  return wallPaint(Y, x, y, fall * 0.8, -0.04);
}
function farWall(X, Y, x, y) {
  const { x0, x1, y0, y1 } = BOARD;
  if (X > x0 - 0.06 && X < x1 + 0.06 && Y > y0 - 0.12 && Y < y1 + 0.06) {
    if (X < x0 || X > x1 || Y > y1) return shade(WOOD, 0.45, x, y);                       // frame
    if (Y < y0) return shade(WOOD, Y > y0 - 0.05 ? 0.55 : 0.32, x, y);                    // chalk tray
    // slate with old erasures swirled into it
    const smear = fbm(X * 1.4, Y * 3, 21, 3);
    return shade(SLATE, clamp01(0.32 + (smear - 0.5) * 0.24), x, y);
  }
  // alphabet cards above the board
  if (Y > 2.24 && Y < 2.42 && X > -2.6 && X < 2.6) {
    const card = Math.floor((X + 2.6) / 0.2);
    const inCard = ((X + 2.6) % 0.2) > 0.02;
    if (inCard) return shade(CREAM, 0.4 + (card % 2 ? -0.04 : 0) + (vnoise(X * 40, Y * 40, card) > 0.66 ? -0.14 : 0), x, y);
  }
  return wallPaint(Y, x, y, 0.95);
}

// a projected box (axis-aligned) painted face by face, with sunlight on the top face
function box(b, X0, X1, Y0, Y1, Z0, Z1, ramp, base, { top = true } = {}) {
  const P = (X, Y, Z) => proj(X, Y, Z);
  const quad = (pts, fn) => b.poly(pts, fn);
  // front face (toward camera, Z0)
  quad([P(X0, Y1, Z0), P(X1, Y1, Z0), P(X1, Y0, Z0), P(X0, Y0, Z0)], (x, y) => shade(ramp, clamp01(base - 0.12), x, y));
  // top face
  if (top && Y1 < EYE) quad([P(X0, Y1, Z1), P(X1, Y1, Z1), P(X1, Y1, Z0), P(X0, Y1, Z0)], (x, y) => {
    const Z = (F * (EYE - Y1)) / (y + 0.5 - VP.y), X = ((x + 0.5 - VP.x) * Z) / F;
    const s = sunAt(X, Y1, Z);
    const c = shade(ramp, clamp01(base + 0.08 + 0.3 * s + (vnoise(X * 9, Z * 9, 4) - 0.5) * 0.06), x, y);
    return s > 0.5 ? mixU(c, SUN, 0.2) : c;
  });
  // the side facing the camera's axis
  if (X1 < 0) quad([P(X1, Y1, Z0), P(X1, Y1, Z1), P(X1, Y0, Z1), P(X1, Y0, Z0)], (x, y) => shade(ramp, clamp01(base - 0.2), x, y));
  if (X0 > 0) quad([P(X0, Y1, Z0), P(X0, Y1, Z1), P(X0, Y0, Z1), P(X0, Y0, Z0)], (x, y) => shade(ramp, clamp01(base - 0.24), x, y));
}
function leg(b, X, Z, Y1) {
  const [x0, y0] = proj(X, Y1, Z), [x1, y1] = proj(X, 0, Z);
  b.line(x0, y0, x1, y1, shade(STEEL, 0.25, 0, 0));
}
/** One student desk + attached chair, chair toward the camera. */
function desk(b, X, Z) {
  const w = 0.6, d = 0.42, top = 0.74;
  // chair: seat + back (the back faces us), steel frame
  leg(b, X - 0.2, Z - 0.5, 0.42); leg(b, X + 0.2, Z - 0.5, 0.42);
  box(b, X - 0.21, X + 0.21, 0.4, 0.43, Z - 0.62, Z - 0.3, WOOD, 0.5);
  leg(b, X - w / 2 + 0.04, Z + d - 0.04, top); leg(b, X + w / 2 - 0.04, Z + d - 0.04, top);
  leg(b, X - w / 2 + 0.04, Z + 0.02, top); leg(b, X + w / 2 - 0.04, Z + 0.02, top);
  box(b, X - w / 2, X + w / 2, top - 0.04, top, Z, Z + d, WOOD, 0.55);
  box(b, X - w / 2 + 0.02, X + w / 2 - 0.02, top - 0.16, top - 0.04, Z + 0.04, Z + d, STEEL, 0.3, { top: false }); // book box
  box(b, X - 0.2, X + 0.2, 0.52, 0.8, Z - 0.66, Z - 0.63, WOOD, 0.46);                   // chair back
  const [bx0, by] = proj(X - 0.2, 0.62, Z - 0.66), [bx1] = proj(X + 0.2, 0.62, Z - 0.66);
  b.hline(bx0, by, bx1 - bx0, shade(WOOD, 0.3, 0, 0));
}
function teacherDesk(b) {
  box(b, -3.3, -1.5, 0, 0.78, 6.9, 7.6, WOOD, 0.42);
  // papers + a gradebook on top; an apple core, dried
  const [px, py] = proj(-2.2, 0.79, 7.2);
  b.rect(px - 6, py - 1, 9, 2, shade(CREAM, 0.7, 0, 0)); b.rect(px + 5, py - 1, 6, 2, shade(GREEN, 0.4, 0, 0));
}

// Tess from behind, at her desk: copper hair spilling over the denim collar, the chair back in front.
// Drawn as a deliberate silhouette — head, tucked ear, falling hair with strand lines, collar, yoke,
// shoulders — lit gold from the windows on her left.
function paintTess(b) {
  const X = COLS[TESS.col], Z = ROWS[TESS.row] - 0.48;
  const [cx0, hy0] = proj(X, 1.22, Z);
  const cx = Math.round(cx0), hy = Math.round(hy0);         // head centre
  const HR = rampStops([PAL.hair_r_dd, PAL.hair_r_d, mix(PAL.hair_r_d, PAL.hair_r, 0.5), PAL.hair_r, PAL.hair_r_l, PAL.hair_r_ll], 10);
  const D = CAST.denim, OUTC = U('#0d0a0e');
  // jacket: shoulders, upper arms angled forward to the desk
  const sh = hy + 13;
  const jacket = [[cx - 6, hy + 9], [cx + 6, hy + 9], [cx + 15, sh + 1], [cx + 18, sh + 5], [cx + 18, sh + 22], [cx - 18, sh + 22], [cx - 18, sh + 5], [cx - 15, sh + 1]];
  b.poly(jacket, (x, y) => {
    const nx = (x - cx) / 18;
    let v = 0.55 - 0.3 * nx + (y < sh + 3 ? 0.08 : 0) + (vnoise(x / 1.4, y / 2.5, 4) - 0.5) * 0.06;
    const yoke = sh + 6 + Math.round(Math.abs(x - cx) * -0.25);                              // pointed western yoke
    if (y === yoke) v -= 0.22;
    if (y === yoke + 1) v += 0.06;
    if ((Math.abs(x - cx - 7) === 0 || Math.abs(x - cx + 7) === 0) && y > yoke + 1) v -= 0.12; // pleat seams
    if (Math.abs(x - cx) > 13 && y > sh + 4) v -= 0.12 + (Math.abs(x - cx) === 14 ? 0.1 : 0);  // arms, the crease where they go forward
    return shade(D, clamp01(v + (nx < -0.5 ? 0.12 : 0)), x, y);
  });
  for (const [x0, y0, x1, y1] of [[cx - 6, hy + 9, cx - 15, sh + 1], [cx - 15, sh + 1, cx - 18, sh + 5], [cx + 6, hy + 9, cx + 15, sh + 1], [cx + 15, sh + 1, cx + 18, sh + 5]]) b.line(x0, y0 - 1, x1, y1 - 1, OUTC);
  b.vline(cx - 19, sh + 5, 17, OUTC); b.vline(cx + 18, sh + 5, 17, OUTC);
  // the collar standing up round her neck
  b.poly([[cx - 8, hy + 8], [cx + 8, hy + 8], [cx + 9, hy + 12], [cx - 9, hy + 12]], (x, y) => shade(D, x < cx ? 0.62 : 0.4, x, y));
  // hair: round crown, the left side tucked behind her ear, the right side falling loose past the collar
  const left = (y) => (y < hy ? -Math.sqrt(Math.max(0, 81 - (y - hy) ** 2)) : y < hy + 6 ? -8 : -8 + (y - hy - 6) * 0.15);
  const right = (y) => (y < hy ? Math.sqrt(Math.max(0, 81 - (y - hy) ** 2)) : 9 + (y - hy) * 0.28);
  const bottom = (x) => hy + 14 + Math.round(2.4 * Math.sin((x - cx) * 1.3) + (x > cx ? 3 : 0) + vnoise(x * 0.8, 3, 7) * 2);
  for (let y = hy - 10; y < hy + 22; y++) for (let x = cx - 12; x < cx + 16; x++) {
    const dx = x + 0.5 - cx;
    if (dx < left(y) || dx > right(y) || y > bottom(x)) continue;
    // strands: curves fanning from the crown; alternate dark/mid, light on the window side
    const fan = dx / Math.max(3, y - (hy - 9));
    const lane = Math.floor(fan * 9 + 20 + Math.sin(y * 0.35) * 0.4);
    let v = 0.42 - 0.3 * (dx / 12) - 0.12 * clamp01((y - hy) / 18);
    if (lane % 3 === 0) v -= 0.16;
    if (lane % 3 === 1 && dx < 2) v += 0.12;
    if (dx < left(y) + 1.6) v += 0.32;                                                         // sunlit rim
    if (y < hy - 6 && dx < 2) v += 0.12;                                                       // crown highlight
    b.px(x, y, shade(HR, clamp01(v), x, y));
  }
  // outline the hair's silhouette (selective: not where it lies over the jacket's light)
  for (let y = hy - 10; y < hy + 22; y++) {
    const lx = Math.floor(cx + left(y)) - 1, rx = Math.ceil(cx + right(y));
    if (y <= bottom(lx + 1)) b.px(lx, y, OUTC);
    if (y <= bottom(rx - 1) && y < hy + 8) b.px(rx, y, OUTC);
  }
  for (let x = cx - 10; x < cx + 16; x++) { const yb = bottom(x); if (x - cx > right(yb) || x - cx < left(yb)) continue; b.px(x, yb + 1, shade(HR, 0.05, x, yb)); }
  b.hline(cx - 4, hy - 10, 9, OUTC);
  // her ear, the hair hooked behind it
  b.rect(cx - 10, hy + 1, 2, 4, (x, y) => shade(CAST.skin, x === cx - 10 ? 0.75 : 0.45, x, y));
  b.px(cx - 11, hy + 2, OUTC); b.px(cx - 11, hy + 3, OUTC); b.px(cx - 10, hy + 5, shade(CAST.skin, 0.2, 0, 0));
  b.line(cx - 9, hy, cx - 8, hy + 6, shade(HR, 0.75, 0, 0));
  // a few loose strands catching the light
  b.line(cx - 7, hy - 7, cx - 12, hy - 3, shade(HR, 0.85, 0, 0));
  b.line(cx + 10, hy + 2, cx + 14, hy + 9, shade(HR, 0.3, 0, 0));
  // chair back in front of her lower back
  box(b, X - 0.21, X + 0.21, 0.52, 0.8, Z - 0.18, Z - 0.15, WOOD, 0.5);
  const [bx0, by] = proj(X - 0.21, 0.62, Z - 0.18), [bx1] = proj(X + 0.21, 0.62, Z - 0.18);
  b.hline(bx0, by, bx1 - bx0, shade(WOOD, 0.3, 0, 0));
}

function paintFurniture(b) {
  // the flag on its staff and the clock stopped at 1:45, above the board
  const [ccx, ccy] = proj(0, 2.62, ROOM.z);
  b.ellipse(ccx, ccy, 7, 7, U(PAL.ink));
  b.ellipse(ccx, ccy, 6, 6, (x, y) => shade(CREAM, 0.62, x, y));
  b.line(ccx, ccy, ccx - 3, ccy - 2, U(PAL.ink));                        // hour hand near 2 (1:45)
  b.line(ccx, ccy, ccx - 5, ccy, U(PAL.ink));                            // minute hand at 9
  b.px(ccx, ccy, U(PAL.red_d));
  const [fx, fy] = proj(2.95, 2.3, ROOM.z);
  b.line(fx, fy, fx + 9, fy - 12, shade(WOOD, 0.4, 0, 0));
  for (let j = 0; j < 7; j++) for (let i = 0; i < 9; i++) {
    const x = fx + 1 + i, y = fy - 10 + j + Math.round(i * 0.15);
    const canton = i < 4 && j < 4;
    b.px(x, y, canton ? U(mix(PAL.navy, PAL.g3, 0.3)) : (j % 2 ? U(mix(PAL.paper, PAL.g4, 0.3)) : U(mix(PAL.red, PAL.g3, 0.3))));
  }
  teacherDesk(b);
  // desks, far to near; Tess's own desk before her, so she sits behind it
  for (let r = ROWS.length - 1; r >= 0; r--) for (const ci of [0, 3, 1, 2]) {
    desk(b, COLS[ci], ROWS[r]);
    if (r === TESS.row && ci === TESS.col) paintTess(b);
  }
}

// the chalk: THERESA DOLAN — PRESENT, fresh, a little uneven, dust under it
function paintChalk(b) {
  const msg = 'THERESA DOLAN — PRESENT';
  const [bx0, by0] = proj(BOARD.x0, BOARD.y1, ROOM.z), [bx1, by1] = proj(BOARD.x1, BOARD.y0, ROOM.z);
  const w = text57Width(msg, 1);
  const tx = Math.round((bx0 + bx1) / 2 - w / 2), ty = Math.round(by0 + (by1 - by0) * 0.32);
  text57(b, tx, ty, msg, (x, y) => (h01(x, y, 61) < 0.12 ? 0 : shade(CHALK, clamp01(0.7 + (h01(x, y, 62) - 0.5) * 0.5), x, y)),
    { track: 1, jitter: (k) => [0, (k * 7) % 5 === 0 ? -1 : 0] });
  // eraser smudges below it (somebody wiped the board clean for this)
  for (let y = ty + 10; y < by1 - 3; y++) for (let x = tx - 6; x < tx + w + 6; x++) {
    const sm = fbm(x / 16, y / 5, 66, 2);
    if (sm > 0.58 && bay(x, y) < (sm - 0.58) * 4) b.px(x, y, mixU(b.get(x, y), U(PAL.g4), 0.2));
  }
}

// volumetric shafts: march each view ray through the room, count sunlit samples
function shafts() {
  const g = new Float32Array(W * H);
  for (let y = 0; y < 200; y++) for (let x = 0; x < W; x++) {
    const dx = (x + 0.5 - VP.x) / F, dy = (VP.y - y - 0.5) / F;
    let zmax = ROOM.z;
    if (dy < 0) zmax = Math.min(zmax, EYE / -dy);
    if (dy > 0) zmax = Math.min(zmax, (ROOM.h - EYE) / dy);
    if (dx < 0) zmax = Math.min(zmax, ROOM.x0 / dx);
    if (dx > 0) zmax = Math.min(zmax, ROOM.x1 / dx);
    let acc = 0;
    for (let z = 0.8; z < zmax; z += 0.32) acc += sunAt(dx * z, EYE + dy * z, z) > 0.5 ? 1 : 0;
    g[y * W + x] = acc;
  }
  return g;
}

const layers = lazyGen(function* () {
  const b = new Buf();
  paintRoom(b); yield;
  paintFurniture(b); yield;
  // dawn grade: the shade goes cool violet, the room's far corners sink
  const COOLC = U(mix(PAL.blue_d, PAL.velvet_d, 0.45));
  b.map((c, x, y) => mixU(c, COOLC, 0.12 + 0.12 * clamp01((x - 300) / 180) + 0.1 * clamp01((40 - y) / 40)));
  paintChalk(b);                                              // fresh chalk, bright on the cool board
  yield;
  // shafts as a stepped value lift toward warm dust-light
  const g = shafts(); yield;
  const motes = [];
  for (let y = 0; y < 200; y++) for (let x = 0; x < W; x++) {
    const a = clamp01(g[y * W + x] * 0.05);
    if (a <= 0) continue;
    const lv = Math.floor(a * 4 + bay(x, y) - 0.4);
    if (lv > 0) b.px(x, y, mixU(b.get(x, y), DUST, 0.07 * lv));
    if (a > 0.3 && h01(x, y, 88) < 0.006) motes.push(x, y);
  }
  return { base: b.toCanvas(), motes: new Int16Array(motes), ms: seeds(motes.length / 2, 5) };
});

export const prepPresent = layers;

export const endingPresent = {
  draw(ctx, t = 0) {
    const L = layers();
    ctx.drawImage(L.base, 0, 0);
    // dust adrift in the shafts: each mote circles its home slowly and twinkles as it turns
    const m = L.motes, s = L.ms, n = m.length / 2;
    for (let i = 0; i < n; i++) {
      const ph = t * (0.15 + s[i * 4] * 0.2) + s[i * 4 + 1] * 6.28;
      const x = m[i * 2] + Math.round(Math.cos(ph) * (2 + s[i * 4 + 2] * 4));
      const y = m[i * 2 + 1] + Math.round(Math.sin(ph * 0.7) * 3 + ((t * (0.6 + s[i * 4 + 3])) % 6) - 3);
      const tw = Math.sin(t * (1 + s[i * 4 + 3] * 2) + i);
      if (tw < -0.3) continue;
      ctx.fillStyle = tw > 0.75 ? 'rgba(246,236,210,0.9)' : 'rgba(226,210,180,0.45)';
      ctx.fillRect(x, y, 1, 1);
    }
  },
};
