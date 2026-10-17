// Item icons (24×24) and UI glyphs. Crisp pixel art, light from the top-left, a 1-px warm-black
// outline, values kept above the dark UI slots so every item reads at 1×, 2× and 4×.
// Exports: initIcons(), getIcon(itemId) → 24×24 canvas (+ 'unknown'), getGlyph(name) → small canvas.
import { PAL, mix } from './palette.js';
import { U, Buf, rampStops, shade, bay, h01, clamp01, text35, text35Width } from './cg_kit.js';
import { ITEMS } from '../data/items.js';

const S = 24;
const OUT = U('#0d0a0e');
const cache = new Map(), gcache = new Map();

// ---- materials (dark → light) -----------------------------------------------------------------
const M = {
  black: rampStops([PAL.shadow, PAL.g1, PAL.g2, PAL.g3, PAL.g5, PAL.g6], 6),
  steel: rampStops([PAL.g2, PAL.g3, PAL.g4, PAL.g5, PAL.g6, PAL.white], 6),
  brass: rampStops([PAL.brass_d, PAL.brass, PAL.gold, PAL.gold_l, mix(PAL.gold_l, PAL.white, 0.5)], 6),
  paper: rampStops([PAL.cream_d, PAL.paper_d, PAL.paper, mix(PAL.paper, PAL.white, 0.6)], 5),
  parch: rampStops([PAL.tan, PAL.cream_d, PAL.cream, PAL.cream_l, mix(PAL.cream_l, PAL.white, 0.5)], 5),
  red: rampStops([PAL.red_d, PAL.red, PAL.red_l, '#e06a5a', mix('#e06a5a', PAL.white, 0.4)], 5),
  crimson: rampStops([PAL.blood_d, PAL.crimson, PAL.crimson_l, PAL.red_l], 4),
  wood: rampStops([PAL.wood_d, PAL.wood, PAL.wood_l, PAL.maple, PAL.maple_l], 5),
  pink: rampStops([mix(PAL.crimson, PAL.red_l, 0.5), mix(PAL.crimson_l, PAL.white, 0.25), mix(PAL.crimson_l, PAL.white, 0.45), mix(PAL.crimson_l, PAL.white, 0.65)], 4),
  tape: rampStops([PAL.tan, PAL.tan_l, PAL.cream_l], 3),
  denim: rampStops([PAL.denim_d, PAL.denim, PAL.denim_l, PAL.denim_ll], 4),
  green: rampStops([PAL.green_d, PAL.green, PAL.green_l, PAL.mint], 4),
  copper: rampStops([PAL.rust, mix(PAL.rust, PAL.orange, 0.4), mix(PAL.orange_l, PAL.gold, 0.4), mix(PAL.gold_l, PAL.white, 0.3)], 4),
  glass: rampStops([PAL.blue_d, PAL.blue_l, PAL.moon, PAL.moon_l, PAL.white], 5),
  ink: rampStops([PAL.ink, PAL.night, PAL.g1], 3),
};
const c = (m, v) => M[m][Math.min(M[m].length - 1, Math.max(0, Math.round(v * (M[m].length - 1))))];
const d = (m, v, x, y) => shade(M[m], clamp01(v), x, y);

// ---- painting helpers ---------------------------------------------------------------------------
/**
 * A rod along an axis from (ax, ay) to (bx, by) with half-width profile w(u) (u in 0..len px).
 * fill(u, v, x, y) → packed color: u along the rod, v across it (negative = the top-left, lit side).
 */
function rod(b, ax, ay, bx, by, w, fill) {
  const dx = bx - ax, dy = by - ay, len = Math.hypot(dx, dy), ux = dx / len, uy = dy / len;
  for (let y = 0; y < b.h; y++) for (let x = 0; x < b.w; x++) {
    const px = x + 0.5 - ax, py = y + 0.5 - ay;
    const u = px * ux + py * uy, v = px * -uy + py * ux;
    // v sign: make negative v point up-left for rods running bottom-left → top-right
    if (u < 0 || u > len) continue;
    const hw = w(u);
    if (hw <= 0 || Math.abs(v) > hw) continue;
    const col = fill(u, v / hw, x, y);
    if (col) b.px(x, y, col);
  }
}
const disc = (b, cx, cy, r, f) => b.ellipse(cx, cy, r, r, f);
function finish(b, { outline = true } = {}) {
  if (outline) b.outline(OUT);
  return b.toCanvas();
}

// ---- the items ----------------------------------------------------------------------------------
const DRAW = {
  // Dad's black Maglite: knurled grip, flared head, the lens catching a glint
  flashlight(b) {
    const w = (u) => (u < 1.5 ? 2.2 : u < 12 ? 2.4 : u < 14.5 ? 2.4 + (u - 12) * 0.55 : 3.9);
    rod(b, 3.5, 20.5, 20, 4, w, (u, v, x, y) => {
      if (u > 20.8) return d('glass', 0.75 - v * 0.2, x, y);
      if (u > 20) return c('steel', 0.9);
      let k = 0.38 - v * 0.34;
      if (u > 3 && u < 11.5 && ((Math.round(u * 1.4) + Math.round(v * 2.2)) & 1)) k -= 0.18;   // knurling
      if (Math.abs(u - 12) < 0.6 || Math.abs(u - 2) < 0.5) k -= 0.2;
      if (v < -0.55) k += 0.28;                                                               // lit edge
      return d('black', k, x, y);
    });
    b.px(19, 4, c('steel', 1)); b.px(20, 5, c('glass', 1));
    b.px(7, 15, c('steel', 0.7)); b.px(8, 14, c('steel', 0.55));                                // the switch
    return finish(b);
  },
  // spiral sketchbook, dark cover with a sticker, a pencil across it
  sketchbook(b) {
    b.rect(5, 3, 15, 18, (x, y) => d('black', 0.42 + (x < 7 ? 0.12 : 0) - (y > 18 ? 0.1 : 0) + (x + y > 34 ? -0.06 : 0), x, y));
    b.vline(20, 4, 17, c('paper', 0.6)); b.vline(19, 4, 17, c('black', 0.25));                   // page edges
    b.rect(8, 6, 9, 5, (x, y) => (y === 6 ? c('paper', 1) : c('paper', 0.75)));
    b.line(9, 8, 15, 8, c('ink', 0.2)); b.line(9, 9, 13, 9, c('ink', 0.4));                       // her title scrawl
    for (let y = 4; y < 21; y += 2) { b.px(3, y, c('steel', 0.95)); b.px(4, y, c('steel', 0.6)); b.px(5, y, c('steel', 0.3)); }
    rod(b, 9, 21, 21, 9, (u) => (u < 1.5 ? 0.5 + u * 0.6 : 1.4), (u, v, x, y) => {
      if (u < 1.2) return c('black', 0.3);                                                      // graphite
      if (u < 2.8) return d('wood', 0.8, x, y);                                                   // sharpened wood
      if (u > 14.5) return d('pink', 0.6 - v * 0.3, x, y);                                       // eraser
      if (u > 13.3) return c('steel', 0.7);                                                       // ferrule
      return v < 0 ? c('brass', 0.85) : c('brass', 0.55);
    });
    return finish(b);
  },
  // Mom's compact, open: cracked mirror up, powder below, gold-tone rims
  compact(b) {
    // lying open, seen from above: the powder half bottom-left, the cracked mirror half top-right
    disc(b, 8, 15.5, 6.5, (x, y) => d('brass', 0.5 + (x + y < 20 ? 0.3 : 0) - (x + y > 27 ? 0.25 : 0), x, y));
    disc(b, 8, 15.5, 4.6, (x, y) => d('parch', 0.45 + (x + y < 22 ? 0.3 : 0), x, y));
    disc(b, 7, 14.5, 2.2, (x, y) => d('pink', 0.55 + (x + y < 20 ? 0.3 : 0), x, y));         // the puff
    b.rect(11, 11, 3, 3, c('brass', 0.3));                                                     // hinge
    disc(b, 15.5, 8, 6.5, (x, y) => d('brass', 0.55 + (x + y < 20 ? 0.3 : 0) - (x + y > 27 ? 0.25 : 0), x, y));
    disc(b, 15.5, 8, 4.8, (x, y) => d('glass', 0.66 + ((x - 15) - (y - 8)) * -0.05, x, y));
    for (const [x, y] of [[12, 5], [13, 6], [14, 7], [15, 8], [15, 9], [16, 10], [17, 11], [14, 9], [13, 10], [16, 7], [17, 6], [18, 6]]) b.px(x, y, c('steel', 1));
    for (const [x, y] of [[13, 7], [14, 8], [16, 11], [15, 10]]) b.px(x, y, c('glass', 0.1));
    return finish(b);
  },
  // PA Student Withdrawal/Transfer Form, folded, Mom's signature in blue
  transfer_form(b) {
    b.poly([[4, 3], [19, 2], [20, 21], [5, 22]], (x, y) => d('paper', 0.75 - (y > 12 ? 0.12 : 0), x, y));
    b.line(4, 12, 20, 11, c('paper', 0.05));                                                      // the fold
    b.line(5, 13, 20, 12, c('paper', 1));
    b.rect(6, 4, 12, 3, c('denim', 0.2));                                                         // header bar
    b.px(7, 5, c('paper', 1)); b.px(9, 5, c('paper', 1)); b.px(10, 5, c('paper', 1));
    for (const y of [8, 10, 15, 17]) b.line(6, y, 17, y - 1, c('paper', 0.2));
    b.rect(14, 8, 3, 2, c('paper', 0.05));                                                        // tick boxes
    b.line(7, 20, 9, 18, c('denim', 0.3)); b.line(9, 18, 11, 20, c('denim', 0.3)); b.line(11, 20, 15, 18, c('denim', 0.3)); // signature
    b.poly([[16, 18], [20, 17], [20, 21]], c('paper', 0.35));                                     // dog-ear
    return finish(b);
  },
  // TDK cassette, Leah's label: red band, handwriting, the window and hubs
  mixtape(b) {
    b.rect(2, 5, 20, 15, (x, y) => d('black', 0.3 + (y === 5 ? 0.25 : 0) + (x === 2 ? 0.1 : 0), x, y));
    b.poly([[5, 16], [18, 16], [17, 19], [6, 19]], c('black', 0.2));
    b.rect(4, 6, 16, 9, (x, y) => (y < 8 ? c('red', 0.45) : c('paper', 0.8)));
    b.line(5, 9, 11, 9, c('ink', 0.1)); b.line(12, 9, 15, 10, c('ink', 0.1));                    // FOR THE DRIVE, in her hand
    b.rect(7, 11, 10, 3, c('black', 0.05));
    b.px(8, 12, c('paper', 1)); b.px(15, 12, c('paper', 1)); b.rect(10, 12, 4, 1, c('wood', 0.2));
    for (const [x, y] of [[3, 6], [20, 6], [3, 18], [20, 18]]) b.px(x, y, c('steel', 0.8));
    b.px(7, 18, c('black', 0)); b.px(16, 18, c('black', 0));
    return finish(b);
  },
  // a pack of Big Red, one stick pulled out
  gum(b) {
    b.poly([[3, 9], [6, 6], [19, 6], [16, 9]], (x, y) => d('red', 0.75, x, y));                  // top face
    b.rect(3, 9, 14, 9, (x, y) => d('red', 0.45 - (y > 15 ? 0.15 : 0), x, y));                    // front
    b.poly([[17, 9], [19, 6], [19, 15], [17, 18]], (x, y) => d('red', 0.15, x, y));               // side
    // the white script logo
    for (const [x, y] of [[5, 11], [6, 12], [6, 11], [7, 13], [8, 12], [9, 12], [10, 13], [11, 12], [12, 12], [13, 13], [14, 12]]) b.px(x, y, c('paper', 1));
    b.hline(5, 15, 9, c('paper', 0.75));
    rod(b, 14, 8, 22, 4, () => 1.5, (u, v, x, y) => (u > 6 ? c('steel', 0.9) : v < 0 ? c('paper', 1) : c('paper', 0.6)));
    b.px(18, 5, c('red', 0.5));
    return finish(b);
  },
  // house key with a pink rubber cap on the bow
  house_key(b) {
    rod(b, 9, 13, 21, 20, (u) => (u < 11 ? 1.6 : 1.1), (u, v, x, y) => d('steel', 0.62 - v * 0.3, x, y));
    for (const [x, y] of [[13, 17], [15, 18], [17, 19], [19, 20]]) b.px(x, y + 1, c('steel', 0.6));  // teeth
    b.px(14, 18, c('steel', 0.2)); b.px(18, 20, c('steel', 0.2));
    b.ellipse(7, 9, 6, 6, (x, y) => d('pink', 0.55 + (x + y < 14 ? 0.35 : 0) - (x + y > 19 ? 0.3 : 0), x, y));
    disc(b, 5, 7, 1.6, c('black', 0));                                                          // the ring hole
    b.rect(10, 12, 3, 2, c('pink', 0.25));
    return finish(b);
  },
  // Danny's cheap red flashlight, masking tape label, still on
  danny_flashlight(b) {
    const w = (u) => (u < 1 ? 2 : u < 10 ? 2.4 : u < 13 ? 2.4 + (u - 10) * 0.5 : 3.9);
    rod(b, 4, 20, 18, 6, w, (u, v, x, y) => {
      if (u > 18.6) return d('paper', 0.95, x, y);
      if (u > 17.8) return c('steel', 0.8);
      if (u > 5 && u < 9.5) return u > 6 && u < 8.6 && Math.abs(v) < 0.45 && (Math.round(u * 2) & 1) ? c('ink', 0.2) : d('tape', 0.65 - v * 0.3, x, y); // DANNY K.
      return d('red', 0.5 - v * 0.38 + (v < -0.6 ? 0.25 : 0), x, y);
    });
    // its weak beam
    for (const [x, y] of [[21, 2], [22, 1], [20, 1], [22, 4], [21, 3]]) b.px(x, y, c('paper', 0.9));
    return finish(b);
  },
  // Uncle Frank's bolt cutters: short jaws, long handles, red grips
  bolt_cutters(b) {
    for (const [ex, ey] of [[2, 21], [7, 22]]) rod(b, 15, 8, ex, ey, () => 1.2, (u, v, x, y) => (u > 8 ? d('red', 0.6 - v * 0.3, x, y) : d('steel', 0.45 - v * 0.3, x, y)));
    rod(b, 14, 9, 21, 2, (u) => (u < 3 ? 2.6 : 2.4 - (u - 3) * 0.35), (u, v, x, y) => d('black', 0.5 - v * 0.3 + (Math.abs(v) < 0.15 ? -0.3 : 0), x, y));
    disc(b, 15, 8, 1.6, c('steel', 0.8)); b.px(15, 8, c('black', 0.1));
    return finish(b);
  },
  // Leah's dad's VHS-C camcorder, record LED on
  camcorder(b) {
    b.rect(7, 8, 13, 10, (x, y) => d('black', 0.42 + (y === 8 ? 0.2 : 0) - (y > 15 ? 0.1 : 0), x, y));
    b.rect(1, 9, 7, 7, (x, y) => d('black', 0.3 + (y === 9 ? 0.2 : 0), x, y));                    // lens barrel
    b.rect(1, 10, 1, 5, (x, y) => d('glass', 0.45 + (y < 12 ? 0.3 : 0), x, y));
    b.vline(4, 9, 7, c('black', 0.1));
    b.rect(13, 4, 8, 4, (x, y) => d('black', 0.35 + (y === 4 ? 0.2 : 0), x, y));                 // viewfinder
    b.rect(20, 5, 2, 3, c('black', 0.05));
    b.hline(9, 12, 8, c('steel', 0.6));                                                           // VHS-C badge
    b.rect(9, 14, 5, 2, c('black', 0.2));
    b.px(8, 10, U(PAL.exit_red)); b.px(9, 10, c('red', 0.4));
    b.rect(20, 10, 2, 6, c('black', 0.15));                                                       // hand strap
    return finish(b);
  },
  // the custodian's ring: two keys, one paper tag
  keyring(b) {
    for (let a = 0; a < Math.PI * 2; a += 0.08) b.px(Math.round(8 + Math.cos(a) * 5), Math.round(7 + Math.sin(a) * 5), a > 3.4 && a < 5.6 ? c('steel', 1) : c('steel', 0.45));
    rod(b, 11, 11, 20, 21, (u) => (u < 3 ? 2.2 : 1.1), (u, v, x, y) => d('steel', 0.6 - v * 0.3, x, y));
    b.px(17, 18, c('steel', 0.25)); b.px(19, 20, c('steel', 0.25));
    rod(b, 7, 12, 6, 22, (u) => (u < 3 ? 2.2 : 1.1), (u, v, x, y) => d('brass', 0.6 - v * 0.3, x, y));
    b.px(4, 18, c('brass', 0.4)); b.px(4, 20, c('brass', 0.4));
    b.poly([[13, 3], [21, 4], [20, 9], [12, 8]], (x, y) => d('parch', 0.6, x, y));                 // OFFICE tag
    b.line(14, 6, 19, 6, c('ink', 0.3)); b.px(13, 5, c('ink', 0.1));
    return finish(b);
  },
  // the hall pass: a brick of wood, stencilled, chewed at a corner
  hall_pass(b) {
    b.poly([[3, 8], [7, 4], [21, 4], [18, 8]], (x, y) => d('wood', 0.9, x, y));
    b.rect(3, 8, 16, 12, (x, y) => c('wood', 0.75 + (x === 3 ? 0.25 : 0) - ((y === 15 || (y === 9 && x > 12)) ? 0.25 : 0)));
    b.poly([[19, 8], [21, 4], [21, 16], [19, 20]], (x, y) => d('wood', 0.3, x, y));
    text35(b, 4, 9, 'PASS', c('wood', 0));
    text35(b, 6, 15, '206', c('wood', 0));
    for (const [x, y] of [[3, 19], [4, 19], [3, 18]]) b.d[y * S + x] = 0;                     // chewed
    b.px(5, 19, c('wood', 0.3));
    disc(b, 9, 6, 0.8, c('wood', 0.1));                                                          // hole for the cord
    return finish(b);
  },
  // the WITHDRAWN stamp and its ink pad
  withdrawn_stamp(b) {
    b.ellipse(16, 18, 6, 3.5, (x, y) => d('steel', 0.5 + (y < 17 ? 0.25 : 0), x, y));             // pad tin
    b.ellipse(16, 17.5, 4.5, 2.2, U(mix(PAL.velvet, PAL.navy, 0.25)));
    b.px(14, 17, U(mix(PAL.velvet, PAL.white, 0.25)));
    b.rect(3, 13, 10, 4, (x, y) => d('wood', 0.6 + (y === 13 ? 0.25 : 0), x, y));                // base block
    b.rect(3, 17, 10, 2, U(mix(PAL.velvet, PAL.navy, 0.25)));                                     // inked rubber
    b.rect(7, 6, 3, 7, (x, y) => d('wood', x === 7 ? 0.8 : 0.45, x, y));                          // stem
    b.ellipse(8, 5, 3.5, 3, (x, y) => d('wood', 0.55 + (x + y < 12 ? 0.35 : 0), x, y));           // knob
    return finish(b);
  },
  // the auditorium key: long brass bit key on a paper tag, AUD
  aud_key(b) {
    rod(b, 9, 9, 20, 20, () => 1.1, (u, v, x, y) => d('brass', 0.6 - v * 0.3, x, y));
    rod(b, 17, 21, 21, 17, () => 1.4, (u, v, x, y) => d('brass', 0.5 - v * 0.3, x, y));          // the bit
    for (let a = 0; a < Math.PI * 2; a += 0.1) b.px(Math.round(6 + Math.cos(a) * 3.5), Math.round(6 + Math.sin(a) * 3.5), a > 3.2 && a < 5.8 ? c('brass', 1) : c('brass', 0.4));
    b.line(4, 9, 3, 13, c('paper', 0.4));                                                        // string
    b.poly([[1, 13], [12, 13], [12, 19], [1, 19]], (x, y) => d('parch', 0.7, x, y));
    text35(b, 2, 14, 'AUD', c('ink', 0.1));
    return finish(b);
  },
  // the small brass key from the card catalog
  case_key(b) {
    disc(b, 8, 10, 4.5, (x, y) => d('brass', 0.6 + (x + y < 16 ? 0.3 : 0) - (x + y > 21 ? 0.2 : 0), x, y));
    rod(b, 12, 11, 20, 14, () => 1.2, (u, v, x, y) => d('brass', 0.6 - v * 0.3, x, y));
    b.px(16, 15, c('brass', 0.5)); b.px(18, 15, c('brass', 0.5)); b.px(19, 16, c('brass', 0.4));
    for (const [x, y] of [[6, 8], [7, 8], [6, 9], [7, 9]]) b.d[y * S + x] = 0;               // the ring hole
    return finish(b);
  },
  // the Founder's Charter, rolled, tied, sealed in red wax
  charter(b) {
    rod(b, 3, 11, 21, 11, () => 4, (u, v, x, y) => d('parch', 0.62 - v * 0.35 + (v < -0.6 ? 0.2 : 0), x, y));
    b.ellipse(3, 11, 1.5, 4, (x, y) => d('parch', 0.3, x, y)); b.px(3, 11, c('parch', 0));       // rolled end
    b.ellipse(21, 11, 1.5, 4, (x, y) => d('parch', 0.85, x, y)); b.px(21, 10, c('parch', 0.3)); b.px(21, 11, c('parch', 0.4));
    b.rect(12, 7, 2, 9, (x, y) => d('crimson', x === 12 ? 0.6 : 0.35, x, y));                    // ribbon
    b.line(12, 15, 10, 20, c('crimson', 0.5)); b.line(13, 15, 16, 19, c('crimson', 0.4));
    disc(b, 13, 18, 3.4, (x, y) => d('crimson', 0.45 + (x + y < 30 ? 0.3 : 0), x, y));         // seal
    b.px(12, 17, c('crimson', 0.1)); b.px(14, 17, c('crimson', 0.1)); b.px(12, 18, c('crimson', 0.1)); b.px(13, 18, c('crimson', 0.1)); b.px(14, 18, c('crimson', 0.1)); b.px(12, 19, c('crimson', 0.1)); b.px(14, 19, c('crimson', 0.1)); // H
    return finish(b);
  },
  // Ivy's photo of Denise: a white-bordered snapshot, faded greens and golds
  denise_photo(b) {
    b.poly([[3, 3], [20, 2], [21, 21], [4, 22]], (x, y) => d('paper', 0.82, x, y));
    b.poly([[5, 4], [19, 4], [19, 16], [5, 17]], (x, y) => d('parch', 0.25 + (y < 8 ? 0.1 : 0), x, y));      // faded backdrop
    disc(b, 12, 8, 2.3, (x, y) => U(x < 12 ? PAL.dskin_l : PAL.dskin));                            // her face
    b.rect(10, 5, 5, 2, U(PAL.hair_k));
    b.poly([[8, 17], [9, 12], [15, 12], [16, 17]], (x, y) => d('green', 0.4 + (x < 11 ? 0.2 : 0), x, y));     // band uniform
    b.line(10, 12, 15, 16, c('brass', 0.7));                                                      // gold braid
    b.px(11, 10, U(PAL.white)); b.px(12, 10, U(PAL.white));                                       // laughing
    b.line(6, 19, 12, 19, c('paper', 0.25));                                                      // pencil on the margin
    b.px(20, 3, c('paper', 0.4)); b.px(19, 3, c('paper', 0.6));                                  // a bent corner
    return finish(b);
  },
  // the torn diary page, Denise's hand leaning hard right
  diary_page(b) {
    b.poly([[6, 2], [20, 2], [20, 22], [6, 22]], (x, y) => d('paper', 0.8, x, y));
    for (let y = 2; y < 23; y++) { const t = (y * 7) % 5 < 2 ? 1 : 0; b.px(5 - t, y, c('paper', 0.6)); if (t) b.px(5, y, c('paper', 0.8)); }  // torn edge
    for (let y = 6; y < 22; y += 3) b.hline(7, y, 13, c('paper', 0.35));                       // faint rules
    for (let k = 0; k < 5; k++) {                                                                  // her hand, leaning right
      const y = 5 + k * 3, end = 19 - (k === 4 ? 6 : (k * 3) % 4);
      for (let x = 8; x < end; x++) b.px(x, y - ((x + k) % 3 === 0 ? 1 : 0), c('denim', 0.05));
    }
    return finish(b);
  },
  // Miss Adair's red felt-tip
  red_pen(b) {
    rod(b, 3.5, 20.5, 20.5, 3.5, (u) => (u < 1.2 ? 0.6 : u < 3 ? 0.6 + (u - 1.2) * 0.7 : 1.9), (u, v, x, y) => {
      if (u < 1.4) return c('red', 0.3);                                                         // the felt nib
      if (u < 3) return d('steel', 0.6 - v * 0.3, x, y);
      if (u > 15) return d('red', 0.35 - v * 0.3, x, y);                                          // cap
      return d('red', 0.6 - v * 0.35 + (v < -0.5 ? 0.25 : 0), x, y);
    });
    rod(b, 13, 9, 18, 4, () => 0.6, () => c('steel', 0.85));                                     // clip
    return finish(b);
  },
  // two D cells, copper tops
  battery(b) {
    const cell = (x0, y0) => {
      b.rect(x0, y0, 8, 15, (x, y) => (y < y0 + 5 ? d('copper', 0.55 + (x === x0 + 1 ? 0.35 : 0) - (x > x0 + 5 ? 0.3 : 0), x, y) : d('black', 0.45 + (x === x0 + 1 ? 0.35 : 0) - (x > x0 + 5 ? 0.25 : 0), x, y)));
      b.ellipse(x0 + 3.5, y0, 3.6, 1, (x, y) => d('copper', 0.9, x, y));
      b.rect(x0 + 3, y0 - 2, 2, 2, c('steel', 0.85));
      b.hline(x0, y0 + 5, 8, c('steel', 0.6));
      b.px(x0 + 3, y0 + 9, c('copper', 0.8)); b.px(x0 + 3, y0 + 10, c('copper', 0.8));
    };
    cell(3, 7); cell(12, 5);
    return finish(b);
  },
  unknown(b) {
    b.poly([[5, 4], [19, 3], [20, 20], [4, 21]], (x, y) => d('paper', 0.6, x, y));
    const q = ['.###.', '#...#', '....#', '..##.', '..#..', '.....', '..#..'];
    q.forEach((r, j) => [...r].forEach((ch, i) => { if (ch === '#') { b.px(10 + i, 8 + j, c('ink', 0.1)); } }));
    return finish(b);
  },
};

export async function initIcons() {
  for (const id of [...Object.keys(ITEMS), 'unknown']) getIcon(id);
  for (const g of GLYPH_NAMES) getGlyph(g);
}
export function getIcon(id) {
  if (cache.has(id)) return cache.get(id);
  const fn = DRAW[id] || DRAW.unknown;
  const canvas = fn(new Buf(S, S));
  cache.set(id, canvas);
  return canvas;
}

// ---- glyphs -------------------------------------------------------------------------------------
// Maps: 'o' outline, 'w' cream fill, 'l' light, 'k' dark, 'r' red accent, 'g' green, 'y' yellow, 'b' brass.
const GC = {
  o: OUT, w: U('#e8e0c8'), l: U('#fff6dc'), s: U('#a9a28c'), k: U(PAL.g1), r: U('#d0453c'), g: U(PAL.green_l),
  y: U(PAL.yellow), b: U(PAL.gold), m: U(PAL.mint),
};
const GLYPHS = {
  look: [
    '....ooooo....',
    '..oowwwwwoo..',
    '.owwwkkkwwwo.',
    'owwwkkskkwwwo',
    'owwwkkkkkwwwo',
    '.owwwkkkwwwo.',
    '..oowwwwwoo..',
    '....ooooo....',
  ],
  open: [
    'oooooooo....',
    'okkkkkkoo...',
    'okkkkkkowo..',
    'okkkkkkowwo.',
    'okkkkkkowwwo',
    'okkkkkkowwwo',
    'okkkkkkowwwo',
    'okkkkkkowwko',
    'okkkkkkowwwo',
    'okkkkkkowwwo',
    'okkkkkkowwwo',
    'okkkkkkowwo.',
    'okkkkkkowo..',
    'oooooooooo..',
  ],
  take: [
    '....oo.oo.oo..',
    '...owwowwowwo.',
    '...owwowwowwo.',
    '...owwowwowwo.',
    '..owowwowwowwo',
    '.owwowwwwwwwwo',
    '.owwwwwwwwwwwo',
    '..owwwwwwwwwso',
    '..owwwwwwwwwso',
    '...owwwwwwwso.',
    '....owwwwwso..',
    '....owwwwwo...',
    '....ooooooo...',
  ],
  sit: [
    'ooo.......',
    'owo.......',
    'owo.......',
    'owo.......',
    'owo.......',
    'owoooooooo',
    'owwwwwwwwo',
    'oooooooooo',
    'owo....owo',
    'owo....owo',
    'owo....owo',
    'ooo....ooo',
  ],
  hide: [
    'ooooooooo',
    'owwwwwwwo',
    'owkkkkkwo',
    'owwwwwwwo',
    'owkkkkkwo',
    'owwwwwwwo',
    'owkkkkkwo',
    'owwwwwwwo',
    'owwwwwkwo',
    'owwwwwkwo',
    'owwwwwwwo',
    'owwwwwwwo',
    'owwwwwwwo',
    'ooooooooo',
  ],
  talk: [
    '.ooooooooooo.',
    'owwwwwwwwwwwo',
    'owwwwwwwwwwwo',
    'owwkkwkkwkkwo',
    'owwwwwwwwwwwo',
    'owwwwwwwwwwwo',
    '.oowwoooooooo',
    '..owo........',
    '..oo.........',
  ],
  read: [
    '.ooo.....ooo.',
    'owwwoo.oowwwo',
    'owwwwwowwwwwo',
    'owkkkwowkkkwo',
    'owwwwwowwwwwo',
    'owkkkwowkkkwo',
    'owwwwwowwwwwo',
    'owkkwwowkkwwo',
    'owwwwwowwwwwo',
    'ooooowowooooo',
    '.....ooo.....',
  ],
  battery_full: [
    'ooooooooooooooo.',
    'owwwwwwwwwwwwwo.',
    'owgggoggggogggoo',
    'owgggoggggogggwo',
    'owgggoggggogggwo',
    'owgggoggggogggoo',
    'owwwwwwwwwwwwwo.',
    'ooooooooooooooo.',
  ],
  battery_mid: [
    'ooooooooooooooo.',
    'owwwwwwwwwwwwwo.',
    'owyyyoyyyyokkkoo',
    'owyyyoyyyyokkkwo',
    'owyyyoyyyyokkkwo',
    'owyyyoyyyyokkkoo',
    'owwwwwwwwwwwwwo.',
    'ooooooooooooooo.',
  ],
  battery_low: [
    'ooooooooooooooo.',
    'owwwwwwwwwwwwwo.',
    'owrrrokkkkokkkoo',
    'owrrrokkkkokkkwo',
    'owrrrokkkkokkkwo',
    'owrrrokkkkokkkoo',
    'owwwwwwwwwwwwwo.',
    'ooooooooooooooo.',
  ],
  compact_sparkle: [
    '....o....',
    '...owo...',
    '...owo...',
    '.oowlwoo.',
    'owwllllwo',
    '.oowlwoo.',
    '...owo...',
    '...owo...',
    '....o....',
  ],
  bell: [
    '.....oo.....',
    '....owwo....',
    '...owwwwo...',
    '..owlwwwwo..',
    '..owlwwwwo..',
    '..owwwwwwo..',
    '.owlwwwwwwo.',
    '.owwwwwwwwo.',
    'owwwwwwwwwwo',
    'oooooooooooo',
    '....owwo....',
    '.....oo.....',
  ],
  clock: [
    '...oooooo...',
    '..owwwwwwo..',
    '.owwwkwwwwo.',
    'owwwwkwwwwwo',
    'owwwwkwwwwwo',
    'owwwwkwwwwwo',
    'owkkkkwwwwwo',
    'owwwwwwwwwwo',
    'owwwwwwwwwwo',
    '.owwwwwwwwo.',
    '..owwwwwwo..',
    '...oooooo...',
  ],
  arrow: [
    '.....oo...',
    '.....owo..',
    'ooooooowo.',
    'owwwwwwwwo',
    'owwwwwwwwo',
    'ooooooowo.',
    '.....owo..',
    '.....oo...',
  ],
  cursor: [
    'oo.....',
    'oro....',
    'orro...',
    'orrro..',
    'orrrro.',
    'orrrro.',
    'orrro..',
    'orro...',
    'oro....',
    'oo.....',
  ],
  lock: [
    '...oooo...',
    '..owwwwo..',
    '.owoooowo.',
    '.owo..owo.',
    '.owo..owo.',
    'oooooooooo',
    'obbbbbbbbo',
    'obbbookbbo',
    'obbbookbbo',
    'obbbbkbbbo',
    'obbbbbbbbo',
    'oooooooooo',
  ],
  speaker: [
    '..oooooooooo..',
    '.owwwwwwwwwwo.',
    'owwwwwwwwwwwwo',
    'owkkkkkkkkkkwo',
    'owwwwwwwwwwwwo',
    'owkkkkkkkkkkwo',
    'owwwwwwwwwwwwo',
    'owkkkkkkkkkkwo',
    'owwwwwwwwwwwwo',
    'owkkkkkkkkkkwo',
    'owwwwwwwwwwwwo',
    'owwwwwwwwwwwwo',
    '.owwwwwwwwwwo.',
    '..oooooooooo..',
  ],
};
// 'use': a cog, drawn from polar coordinates so it stays symmetric
function useGlyph() {
  const n = 13, b = new Buf(n, n), cx = 6, cy = 6;
  for (let y = 0; y < n; y++) for (let x = 0; x < n; x++) {
    const dx = x - cx, dy = y - cy, r = Math.hypot(dx, dy), a = Math.atan2(dy, dx);
    const R = Math.cos(a * 8) > 0.2 ? 5.6 : 4.3;
    if (r <= R && r > 1.7) b.px(x, y, r > R - 1 ? GC.o : (dx + dy < -2 ? GC.l : GC.w));
    else if (r <= 1.7) b.px(x, y, GC.o);
  }
  return b;
}
export const GLYPH_NAMES = [...Object.keys(GLYPHS), 'use'];

export function getGlyph(name) {
  const key = String(name || '').toLowerCase();
  if (gcache.has(key)) return gcache.get(key);
  let canvas;
  if (key === 'use') canvas = useGlyph().toCanvas();
  else if (GLYPHS[key]) {
    const map = GLYPHS[key], w = Math.max(...map.map((r) => r.length)), h = map.length;
    const b = new Buf(w, h);
    map.forEach((row, y) => [...row].forEach((ch, x) => { if (GC[ch]) b.px(x, y, GC[ch]); }));
    canvas = b.toCanvas();
  } else canvas = getIcon('unknown');
  gcache.set(key, canvas);
  return canvas;
}
