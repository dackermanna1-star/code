// Props A — library & restrooms: bookshelf_tall card_catalog reading_table chair_library
// librarian_desk display_case lamp_banker microfiche book_cart yearbook_pile | stall sink mirror
// urinal hand_dryer shower_head.
import { K, PAL, mix, lt, dk, OUT, SHADOW_SOFT, woodSet, steelSet, CHROME, BRASS, porcelain, seedOf, paper, textW } from './props_a_kit.js';
import { books } from './props_a_class.js';

const TABLE_H = 12; // things that sit on a table (lamp, yearbooks) are raised by the table's height

// ---- bookshelf_tall (2×1, opaque) -------------------------------------------------------------
function bookshelfTall(o) {
  const { clean } = o;
  const k = new K(36, 56, -2, -40, seedOf('bstall', o.variant, clean));
  const W = woodSet(clean, 'oak');
  const top = -24;
  // top face + crown
  k.R(0, top - 8, 32, 6, W.lt); k.H(0, top - 8, 32, W.hi); k.S(0, top - 8, 32, 6, clean ? W.hi : PAL.g4, clean ? 0.05 : 0.2);
  k.R(-1, top - 2, 34, 2, W.md); k.H(-1, top - 2, 34, W.hi); k.H(-1, top - 1, 34, W.dk);
  // carcass front
  k.R(0, top, 32, 40, W.md); k.V(0, top, 40, W.lt); k.V(1, top, 40, W.md); k.V(31, top, 40, W.dd); k.V(30, top, 40, W.dk);
  const shelves = 5, sh = 7;
  for (let i = 0; i < shelves; i++) {
    const sy = top + 1 + i * sh;
    k.R(2, sy, 28, sh - 1, PAL.ink);
    books(k, 2, sy, 28, sh - 1, clean, { gaps: clean ? 0.03 : 0.1 });
    // the shelf board, sagging in the middle under the weight
    const sag = clean ? 0 : 1;
    for (let x = 2; x < 30; x++) { const d = x > 9 && x < 23 ? sag : 0; k.P(x, sy + sh - 1 + d, W.lt); if (d) k.P(x, sy + sh - 1, PAL.ink); }
  }
  k.H(0, 15, 32, W.dd); k.R(1, 14, 30, 1, W.dk);
  if (!clean) {
    // a book pulled half out and one fallen flat; dust on the top
    k.R(12, top + 8, 2, 6, mix(PAL.velvet, PAL.g3, 0.3)); k.P(12, top + 8, PAL.red_l);
    k.R(20, top + 1 + 3 * sh + 3, 7, 2, mix(PAL.green_d, PAL.g3, 0.3)); k.H(20, top + 1 + 3 * sh + 3, 7, PAL.green_l);
    k.grime(0, top, 32, 40, 0.5);
  }
  k.shadow(1, 16, 32, 2);
  return k.done();
}

// ---- card_catalog (2×1) -----------------------------------------------------------------------
function cardCatalog(o) {
  const { clean } = o;
  const k = new K(36, 34, -2, -22, seedOf('catalog', clean));
  const W = woodSet(clean, 'oak');
  // turned legs + stretcher
  for (const x of [1, 29]) { k.R(x, 0, 2, 10, x < 10 ? W.md : W.dk); k.P(x, 4, W.hi); k.P(x, 10, PAL.wood_d); }
  k.H(3, 7, 26, W.dk);
  k.R(0, -20, 32, 3, W.hi); k.H(0, -20, 32, lt(W.hi, 0.15)); k.H(0, -18, 32, W.lt);
  k.R(0, -17, 32, 18, W.md); k.V(0, -17, 18, W.lt); k.V(31, -17, 18, W.dd); k.H(0, 0, 32, W.dd);
  // 6 × 5 = 30 small drawers with brass label frames and pulls
  for (let r = 0; r < 5; r++) for (let c = 0; c < 6; c++) {
    const x = 1 + c * 5, y = -16 + r * 3 + Math.floor(r / 5);
    k.R(x, y, 5, 3, W.md); k.H(x, y, 5, W.lt); k.V(x + 4, y, 3, W.dd);
    k.H(x + 1, y + 1, 2, clean ? BRASS.lt : BRASS.md); k.P(x + 3, y + 1, BRASS.dk);
    if (!clean && (r * 6 + c) % 7 === 3) k.P(x + 1, y + 2, PAL.paper_d);
  }
  // the HA–HE drawer, pulled out a little
  if (o.variant === 1 || !clean) { const x = 1 + 2 * 5, y = -16 + 2 * 3; k.R(x, y, 5, 4, W.lt); k.H(x, y + 3, 5, PAL.ink); k.H(x + 1, y + 1, 2, BRASS.hi); }
  if (!clean) k.grime(0, -17, 32, 18, 0.6);
  k.shadow(1, 10, 31, 2);
  return k.done();
}

// ---- reading_table (2×2) ----------------------------------------------------------------------
function readingTable(o) {
  const { clean } = o;
  const k = new K(36, 48, -2, -14, seedOf('rtable', o.variant, clean));
  const W = woodSet(clean, 'oak');
  // legs (front pair long, back pair peeking), stretcher
  for (const x of [2, 28]) { k.R(x, 18, 2, 12, x < 10 ? W.md : W.dk); k.P(x, 30, PAL.wood_d); }
  for (const x of [3, 27]) k.R(x, 6, 2, 3, W.dd);
  // top: long boards running east–west, lit bevel at the front-left, apron + shadowed underside
  const T = { hi: W.hi, lt: mix(W.lt, W.hi, 0.35), md: W.lt, dk: W.md };
  k.wood(0, -12, 32, 29, T.md, { dark: T.dk, light: T.lt, density: 0.55 });
  for (let y = -6; y < 17; y += 6) k.H(1, y, 30, mix(T.md, W.dk, 0.55));
  k.H(0, -12, 32, T.hi); k.V(0, -11, 28, T.hi); k.V(31, -11, 28, W.dk); k.H(1, 16, 30, T.lt);
  k.R(0, 17, 32, 3, W.md); k.H(0, 17, 32, W.lt); k.H(0, 19, 32, W.dd);
  k.R(4, 20, 24, 8, 'rgba(6,5,10,0.35)');
  if (!clean) {
    // ring stains, scratched initials, dust
    for (const [cx, cy] of [[7, -4], [22, 8]]) for (let a = 0; a < 6.3; a += 0.5) k.P(Math.round(cx + Math.cos(a) * 2), Math.round(cy + Math.sin(a) * 1.5), mix(W.md, W.dd, 0.4));
    k.L(17, -6, 19, -4, W.dd); k.P(20, -6, W.dd);
    k.S(0, -12, 32, 29, 'rgba(150,140,120,0.2)', 0.03);
  }
  k.shadow(1, 30, 32, 2); k.shadow(0, 20, 32, 10, SHADOW_SOFT);
  return k.done();
}

// ---- chair_library ----------------------------------------------------------------------------
function chairLibrary(o) {
  const { clean } = o;
  const k = new K(20, 30, -2, -16, seedOf('lchair', o.dir, clean));
  const W = woodSet(clean, 'oak');
  if (o.dir === 'left' || o.dir === 'right') {
    if (o.dir === 'right') k.mirror(16);
    k.V(4, 2, 9, W.md); k.V(11, 2, 9, W.dk); k.H(4, 7, 8, W.dk);
    k.R(3, -2, 10, 4, W.md); k.H(3, -2, 10, W.hi); k.H(3, 1, 10, W.dk);
    k.R(11, -14, 2, 15, W.md); k.V(11, -14, 15, W.hi); k.R(10, -14, 3, 2, W.lt);
    k.shadow(3, 10, 11, 3);
    return k.done();
  }
  for (const x of [3, 12]) { k.V(x, 2, 9, x < 8 ? W.md : W.dk); k.P(x, 11, PAL.wood_d); }
  k.H(4, 7, 8, W.dk);
  if (o.dir === 'up') {
    k.R(3, -2, 10, 4, W.dk);
    k.R(2, -13, 12, 2, W.lt); k.H(2, -13, 12, W.hi);
    k.V(2, -11, 12, W.md); k.V(13, -11, 12, W.dk);
    for (let x = 5; x < 12; x += 2) k.V(x, -11, 10, x % 4 === 1 ? W.md : W.lt);
    k.H(2, -1, 12, W.dd);
  } else {
    k.V(3, -13, 12, W.md); k.V(12, -13, 12, W.dk);
    k.R(3, -14, 10, 2, W.lt); k.H(3, -14, 10, W.hi);
    for (let x = 5; x < 12; x += 2) k.V(x, -12, 9, W.dk);
    k.R(2, -3, 12, 5, W.md); k.H(2, -3, 12, W.hi); k.V(2, -2, 4, W.lt); k.H(2, 1, 12, W.dk); k.H(2, 2, 12, W.dd);
  }
  if (!clean) k.S(2, -14, 12, 16, PAL.g2, 0.03);
  k.shadow(2, 10, 13, 3);
  return k.done();
}

// ---- librarian_desk (3×1): circulation desk -----------------------------------------------------
function librarianDesk(o) {
  const { clean } = o;
  const k = new K(52, 34, -2, -18, seedOf('circ', clean));
  const W = woodSet(clean, 'oak');
  const top = clean ? { hi: PAL.cream_l, md: mix(PAL.tan_l, PAL.cream, 0.5), dk: PAL.tan } : { hi: mix(PAL.cream, PAL.g5, 0.3), md: mix(PAL.tan, PAL.g4, 0.25), dk: mix(PAL.tan, PAL.g3, 0.45) };
  k.R(0, -12, 48, 7, top.md); k.H(0, -12, 48, top.hi); k.V(0, -11, 6, top.hi); k.H(0, -5, 48, top.dk);
  k.R(0, -4, 48, 15, W.md); k.V(0, -4, 15, W.lt); k.V(47, -4, 15, W.dd); k.H(0, 10, 48, W.dd); k.H(0, -4, 48, W.hi);
  for (let x = 2; x < 46; x += 11) { k.frame(x, -2, 10, 11, W.dk); k.H(x + 1, -1, 8, W.lt); }
  // brass CIRCULATION plate
  k.R(2, 1, 45, 8, W.md); k.H(2, 1, 45, W.dk); k.H(2, 8, 45, W.hi);
  const cx0 = 2 + ((45 - textW('CIRCULATION')) >> 1);
  k.T(cx0 + 1, 3, 'CIRCULATION', W.lt); k.T(cx0, 2, 'CIRCULATION', clean ? BRASS.md : mix(W.dd, PAL.ink, 0.3));
  // date stamp on its rack, card trays, ink pad, a QUIET sign
  k.R(4, -14, 5, 3, PAL.g2); k.H(4, -14, 5, PAL.g4); k.V(6, -17, 3, PAL.wood); k.R(5, -18, 3, 1, PAL.wood_l);
  for (const tx of [14, 22]) { k.R(tx, -11, 7, 4, W.dk); k.H(tx, -11, 7, W.lt); for (let i = 1; i < 6; i++) k.V(tx + i, -12, 2, i % 2 ? PAL.paper : PAL.cream_l); }
  k.R(31, -10, 4, 2, PAL.navy_d); k.H(31, -10, 4, PAL.g3);
  k.R(38, -16, 8, 5, clean ? PAL.paper : PAL.paper_d); k.H(38, -16, 8, PAL.white); k.T(38, -16, 'SH', PAL.g1); k.L(39, -11, 37, -10, PAL.wood_d); k.L(44, -11, 46, -10, PAL.wood_d);
  if (!clean) { k.grime(0, -4, 48, 15, 0.8); k.S(0, -12, 48, 7, 'rgba(150,140,120,0.2)', 0.05); }
  k.shadow(1, 11, 48, 2);
  return k.done();
}

// ---- display_case (2×1, reflective): KETTLE RUN HISTORICAL COLLECTION ------------------------
function displayCase(o) {
  const { state, clean } = o;
  const k = new K(36, 36, -2, -22, seedOf('display', state, clean));
  const W = woodSet(clean, 'walnut');
  for (const x of [1, 29]) { k.R(x, 1, 2, 10, x < 10 ? W.md : W.dk); k.P(x, 11, PAL.ink); }
  k.H(3, 8, 26, W.dk);
  // box: felt bed seen through the glass top
  const felt = clean ? PAL.velvet_d : mix(PAL.velvet_d, PAL.g1, 0.35);
  k.R(0, -12, 32, 9, W.md); k.R(2, -11, 28, 7, felt);
  // the exhibits: miner's lamp, breaker boy's cap, the Charter
  k.R(4, -9, 3, 3, PAL.g2); k.P(5, -10, PAL.g3); k.P(4, -9, BRASS.md); k.P(7, -8, PAL.g1); k.P(5, -8, PAL.amber_l); // lamp
  k.E(12, -7, 3, 1, mix(PAL.g2, PAL.brown_d, 0.4)); k.H(10, -6, 5, PAL.g1); k.P(11, -8, PAL.g3); // cap
  if (state === 'empty') {
    k.frame(17, -10, 11, 6, mix(felt, PAL.paper_d, 0.25)); // where the document lay (dust outline)
  } else {
    const pc = clean ? PAL.paper : mix(PAL.paper_d, PAL.cream_d, 0.3);
    k.R(17, -10, 11, 6, pc); for (let j = -9; j < -5; j++) k.H(18, j, j === -9 ? 6 : 9, mix(pc, PAL.brown_d, 0.6));
    k.P(26, -6, PAL.red); k.P(25, -6, PAL.red_d); // wax seal
  }
  // front rail with brass plate + lock
  k.R(0, -3, 32, 4, W.md); k.H(0, -3, 32, W.lt); k.H(0, 0, 32, W.dd);
  k.R(8, -2, 16, 2, clean ? BRASS.lt : BRASS.dk); for (let x = 9; x < 23; x += 2) k.P(x, -2, BRASS.dd);
  k.P(28, -2, BRASS.hi); k.P(28, -1, PAL.ink);
  // frame edges of the lid
  k.H(0, -12, 32, W.hi); k.V(0, -12, 9, W.lt); k.V(31, -12, 9, W.dd); k.H(0, -4, 32, W.dk);
  if (state === 'locked') {
    // closed glass lid: cold streaks across the exhibits (reads as glass in the dark)
    k.A(2, -11, 28, 7, 'rgba(120,150,190,0.15)');
    for (const sx of [6, 20]) for (let j = 0; j < 7; j++) { k.P(sx + 6 - j, -11 + j, 'rgba(196,212,230,0.6)'); k.P(sx + 7 - j, -11 + j, 'rgba(151,175,203,0.35)'); }
    k.H(2, -11, 28, 'rgba(196,212,230,0.5)');
    if (!clean) k.S(2, -11, 28, 7, 'rgba(180,170,150,0.25)', 0.08);
  } else {
    // the lid raised on its hinges at the back: a pane standing up, streaked
    k.R(1, -20, 30, 8, 'rgba(120,150,190,0.16)');
    k.H(1, -20, 30, W.lt); k.V(1, -20, 8, W.md); k.V(30, -20, 8, W.dk);
    for (let j = 0; j < 7; j++) { k.P(8 + Math.floor(j / 2), -19 + j, 'rgba(196,212,230,0.55)'); k.P(21 + Math.floor(j / 2), -19 + j, 'rgba(196,212,230,0.4)'); }
    k.P(2, -13, PAL.g4); k.P(29, -13, PAL.g4);
  }
  if (!clean) k.grime(0, -3, 32, 4, 0.6);
  k.shadow(1, 11, 31, 2);
  return k.done();
}

// ---- lamp_banker (on a table cell) ------------------------------------------------------------
function lampBanker(o) {
  const { state, clean } = o;
  const k = new K(14, 18, 1, -18 - 0, seedOf('lamp', state, clean));
  const b = -TABLE_H + 8; // base sits on the table top
  const on = state === 'on';
  // light pooled on the table under the shade
  if (on) { k.A(3, b - 1, 10, 3, 'rgba(255,230,160,0.28)'); k.A(4, b, 8, 2, 'rgba(255,230,160,0.25)'); }
  k.R(5, b - 1, 6, 2, BRASS.md); k.H(5, b - 1, 6, BRASS.hi); k.H(5, b, 6, BRASS.dk);
  k.V(8, b - 6, 5, BRASS.lt); k.P(7, b - 3, BRASS.dk);
  // green glass shade (emissive when on)
  const sg = on ? ['#c9f0b8', '#8fd27e', PAL.lamp_green] : clean ? [PAL.mint, PAL.green_l, PAL.green] : [PAL.green_l, PAL.green, PAL.green_d];
  k.R(3, b - 10, 10, 3, sg[1]); k.H(4, b - 11, 8, sg[0]); k.H(3, b - 8, 10, sg[2]);
  k.P(4, b - 10, sg[0]); k.P(12, b - 9, sg[2]);
  if (on) { k.H(4, b - 7, 8, '#fff1c8'); k.P(8, b - 7, '#ffffff'); } else k.H(4, b - 7, 8, PAL.g1);
  k.P(11, b - 6, BRASS.lt); k.P(11, b - 5, BRASS.dk); // pull chain
  return k.done();
}

// ---- microfiche reader ------------------------------------------------------------------------
function microfiche(o) {
  const { clean } = o;
  const k = new K(20, 40, -2, -28, seedOf('fiche', clean));
  const S = steelSet(clean, 'tan');
  for (const x of [1, 14]) { k.V(x, -6, 17, S.dk); k.P(x, 11, PAL.ink); }
  k.R(0, -8, 16, 3, S.lt); k.H(0, -8, 16, S.hi); k.H(1, 4, 14, S.dk);
  // the reader: hooded screen leaning back, base with the fiche carrier
  k.R(1, -13, 14, 5, S.md); k.H(1, -13, 14, S.hi); k.R(3, -11, 10, 2, PAL.g2); k.H(3, -11, 10, PAL.g4);
  k.R(2, -25, 12, 12, S.md); k.H(2, -25, 12, S.hi); k.V(2, -24, 11, S.lt); k.V(13, -24, 11, S.dk);
  k.R(3, -23, 10, 9, PAL.ink); k.R(4, -22, 8, 7, mix(PAL.slate, PAL.blue_dd, 0.5));
  k.L(5, -21, 7, -19, 'rgba(196,212,230,0.5)'); k.P(10, -17, 'rgba(151,175,203,0.4)');
  k.P(12, -13, PAL.g2); k.P(11, -13, CHROME.lt);
  if (!clean) { k.grime(1, -25, 14, 17, 0.7); k.S(4, -22, 8, 7, PAL.g3, 0.06); }
  k.shadow(1, 11, 15, 2);
  return k.done();
}

// ---- book_cart --------------------------------------------------------------------------------
function bookCart(o) {
  const { clean } = o;
  const k = new K(20, 34, -2, -20, seedOf('cart', o.variant, clean));
  const W = woodSet(clean, 'oak');
  for (const x of [1, 14]) k.V(x, -16, 26, x < 5 ? W.lt : W.dk);
  k.R(1, -17, 14, 2, W.hi);
  for (const [sy, slope] of [[-15, 1], [-6, 1], [3, 0]]) {
    k.R(2, sy, 12, 7, PAL.ink);
    books(k, 2, sy, 12, 6, clean, { gaps: 0.12 });
    k.H(1, sy + 6, 14, W.md); k.H(1, sy + 7, 14, W.dk);
    if (slope) k.P(2, sy + 5, W.dk);
  }
  for (const x of [1, 14]) { k.P(x, 11, PAL.g2); k.P(x, 12, PAL.ink); }
  if (!clean) k.S(1, -17, 14, 28, PAL.g3, 0.03);
  k.shadow(1, 12, 15, 2);
  return k.done();
}

// ---- yearbook_pile (on a table) ---------------------------------------------------------------
function yearbookPile(o) {
  const { clean } = o;
  const k = new K(20, 22, -2, -22, seedOf('yb', o.variant, clean));
  const b = -TABLE_H + 8;
  const covers = [[PAL.navy, PAL.navy_l], [PAL.green_d, PAL.green], [PAL.brown_d, PAL.brown], [PAL.navy_d, PAL.navy_l]];
  // two stacks: four thick volumes and an open one on top of the second
  for (let i = 0; i < 4; i++) {
    const [c, cl] = covers[(i + o.variant) % 4].map((x) => (clean ? x : mix(x, PAL.g3, 0.25)));
    const y = b - 3 - i * 3, x = 1 + (i % 2);
    k.R(x, y, 9, 3, c); k.H(x, y, 9, cl); k.V(x, y, 3, dk(c, 0.3)); k.P(x + 2, y + 1, clean ? PAL.gold : PAL.brass); k.P(x + 4, y + 1, clean ? PAL.gold : PAL.brass);
    k.H(x + 1, y + 2, 8, PAL.paper_d);
  }
  k.R(11, b - 3, 7, 3, covers[1][0]); k.H(11, b - 3, 7, covers[1][1]);
  k.R(10, b - 6, 9, 3, clean ? PAL.paper : PAL.paper_d); k.V(14, b - 6, 3, PAL.g4);
  k.R(11, b - 5, 2, 2, PAL.g3); k.R(16, b - 5, 2, 2, PAL.g3);
  k.shadow(1, b, 18, 1, SHADOW_SOFT);
  return k.done();
}

// ---- stall (1×2) ------------------------------------------------------------------------------
function stall(o) {
  const { clean, variant: v } = o;
  const k = new K(20, 62, -2, -28, seedOf('stall', v, clean));
  const S = steelSet(clean, 'mustard');
  const P = porcelain(clean);
  const front = 31, topH = 24, gap = 4;
  // the toilet at the back, seen over the door: tank against the wall, bowl and seat
  k.R(5, -10, 7, 7, P.md); k.H(5, -10, 7, P.hi); k.V(11, -9, 6, P.dk); k.R(4, -11, 9, 1, P.lt);
  k.E(8, 0, 4, 3, P.lt); k.E(8, 0, 3, 2, mix(PAL.g3, P.dk, 0.3)); k.E(8, 0, 2, 1, PAL.g2); k.H(5, -3, 7, P.hi);
  if (!clean) { k.P(9, 1, mix(PAL.amber_d, PAL.g2, 0.4)); k.drip(10, -3, 3); }
  // partitions: the left panel's top rail runs north to the wall, its inner face catches a little
  // light; the right one is the neighbour's (a thin rail), pilasters + headrail across the front
  const back = -4, railY = front - topH;
  k.poly([[0, back - topH + 6], [2, back - topH + 6], [2, railY], [0, railY]], S.md);
  k.V(0, back - topH + 6, railY - back + topH - 6, S.hi);
  k.V(2, back - topH + 6, railY - back + topH - 6, dk(S.md, 0.25));
  k.V(15, back - topH + 6, railY - back + topH - 6, S.lt);
  k.R(0, railY, 2, topH - gap, S.md); k.V(0, railY, topH - gap, S.hi);
  k.R(15, railY, 1, topH - gap, S.dk);
  k.R(0, railY - 1, 16, 2, CHROME.lt); k.H(0, railY - 1, 16, CHROME.hi);
  const dx = 2, dy = front - topH + 2, dw = 13, dh = topH - gap - 3;
  if (v === 1) {
    // door hanging ajar into the stall: dark gap, the door edge on the hinge side
    k.R(dx, dy, dw, dh, PAL.ink);
    k.R(dx + 4, dy + 2, 6, 9, mix(P.md, PAL.ink, 0.6));
    k.poly([[dx, dy], [dx + 6, dy - 3], [dx + 6, dy + dh - 3], [dx, dy + dh]], dk(S.md, 0.35)); k.V(dx + 6, dy - 3, dh, S.lt);
  } else {
    k.R(dx, dy, dw, dh, S.md);
    k.H(dx, dy, dw, S.hi); k.V(dx, dy, dh, S.lt); k.V(dx + dw - 1, dy, dh, S.dk); k.H(dx, dy + dh - 1, dw, S.dd);
    // latch (occupancy slot) + coat hook + hinges
    k.R(dx + 9, dy + 9, 3, 2, CHROME.md); k.P(dx + 10, dy + 9, clean ? PAL.green_l : PAL.red_d);
    k.P(dx + 1, dy + 3, CHROME.lt); k.P(dx + 1, dy + dh - 4, CHROME.lt);
    if (v === 2) { paper(k, dx + 3, dy + 4, 7, 6, { clean, lines: PAL.g3, lineGap: 2 }); k.H(dx + 4, dy + 5, 5, PAL.red_d); } // OUT OF ORDER
    if (!clean) {
      // scratched graffiti and rust bleeding at the foot
      const sc = mix(S.md, PAL.g5, 0.45);
      k.L(dx + 3, dy + 13, dx + 6, dy + 12, sc); k.P(dx + 8, dy + 13, sc); k.L(dx + 2, dy + 16, dx + 4, dy + 15, sc);
      if (v === 3) { k.T(dx + 1, dy + 3, 'KR', mix(PAL.ink, S.md, 0.35)); k.L(dx + 2, dy + 10, dx + 10, dy + 11, PAL.ink); }
      k.rust(dx, dy + dh - 5, dw, 5, 4);
      k.grime(dx, dy, dw, dh, 1);
    }
  }
  // the gap under the door: the stall floor in shadow, a glimpse of the bowl's foot
  k.A(1, front - gap, 14, gap, 'rgba(6,6,10,0.45)');
  k.R(7, front - gap + 1, 3, 2, mix(P.md, PAL.g2, 0.6));
  k.shadow(0, front, 16, 1);
  return k.done();
}

// ---- sink -------------------------------------------------------------------------------------
function sink(o) {
  const { clean } = o;
  const k = new K(18, 26, -1, -18, seedOf('sink', o.variant, clean));
  const P = porcelain(clean);
  // exposed supply lines + P-trap to the wall
  k.V(6, -1, 7, CHROME.dk); k.V(10, -1, 7, CHROME.md); k.H(6, 5, 5, CHROME.dk); k.P(8, 6, CHROME.lt); k.V(8, 0, 5, CHROME.md);
  // basin: rim (lit top-left), bowl, apron
  k.R(1, -9, 14, 7, P.lt); k.H(1, -9, 14, P.hi); k.V(1, -8, 6, P.hi); k.V(14, -8, 6, P.dk);
  k.R(3, -7, 10, 4, P.dk); k.H(3, -7, 10, P.dd); k.E(8, -5, 4, 1, mix(P.dk, P.md, 0.5)); k.P(8, -4, PAL.g2);
  k.R(1, -2, 14, 2, P.md); k.H(1, -1, 14, P.dk);
  // taps
  for (const tx of [4, 11]) { k.R(tx, -11, 2, 2, CHROME.lt); k.P(tx, -11, CHROME.hi); k.P(tx + 1, -10, CHROME.dk); }
  k.R(7, -11, 3, 2, CHROME.md); k.P(8, -9, CHROME.dd);
  if (!clean) {
    // rust ring at the drain, a tap drip stain, crazing
    k.P(8, -5, PAL.rust); k.P(9, -5, mix(PAL.rust, P.dk, 0.5)); k.V(8, -9, 3, mix(PAL.rust, P.lt, 0.5));
    k.L(2, -8, 4, -7, P.dd); k.S(1, -9, 14, 9, mix(P.md, PAL.cream_d, 0.5), 0.06);
  }
  k.shadow(2, 0, 13, 2, SHADOW_SOFT); k.shadow(5, 6, 6, 1, SHADOW_SOFT);
  return k.done();
}

// ---- mirror (wall, reflective) ----------------------------------------------------------------
function mirror(o) {
  const { state, clean } = o;
  const k = new K(16, 22, 0, -18, seedOf('mirror', state, clean));
  const x = 2, y = -16, w = 12, h = 14;
  const fr = clean ? CHROME : { hi: PAL.g5, lt: PAL.g4, md: PAL.g3, dk: PAL.g2, dd: PAL.g1 };
  k.R(x - 1, y - 1, w + 2, h + 2, fr.md); k.H(x - 1, y - 1, w + 2, fr.hi); k.V(x - 1, y - 1, h + 2, fr.lt); k.H(x - 1, y + h, w + 2, fr.dd); k.V(x + w, y - 1, h + 2, fr.dk);
  // the dark room reflected: deep cold glass, a faint band where the opposite wall catches light
  const base = mix(PAL.blue_dd, PAL.navy_d, 0.4);
  k.bands(x, y, w, h, [mix(base, PAL.blue_d, 0.6), base, mix(base, PAL.ink, 0.3)]);
  k.H(x, y + 9, w, mix(base, PAL.slate_l, 0.5));
  const streaks = (a1, a2) => {
    for (let j = 0; j < h; j++) {
      const sx = x + 3 + Math.floor((h - j) * 0.55);
      if (sx < x + w) k.P(sx, y + j, a1);
      if (sx + 1 < x + w) k.P(sx + 1, y + j, a2);
      const s2 = sx + 4; if (s2 < x + w && (j & 1) === 0) k.P(s2, y + j, a2);
    }
  };
  if (state === 'fogged') {
    streaks(PAL.moon, PAL.blue_l);
    // condensation: a pale breath-fog over most of the glass, clear trickle lines
    const fog = mix(PAL.moon_l, PAL.g6, 0.5), fog2 = mix(PAL.moon, PAL.g5, 0.4);
    k.R(x, y, w, h - 2, fog2); k.S(x, y, w, h - 2, fog, 0.55); k.S(x + 1, y + 1, w - 2, h - 5, mix(PAL.moon_l, PAL.white, 0.4), 0.25);
    k.S(x, y + h - 4, w, 4, fog2, 0.6);
    // where droplets ran, the dark glass shows through
    for (const tx of [x + 2, x + 6, x + 9]) { const y0 = y + k.ri(3, 7); for (let j = y0; j < y + h; j++) k.P(tx + (j > y0 + 3 ? 1 : 0), j, mix(base, PAL.blue_d, 0.5)); }
  } else {
    streaks(clean ? PAL.moon_l : mix(PAL.moon_l, PAL.g4, 0.3), clean ? PAL.moon : mix(PAL.moon, PAL.g3, 0.4));
    k.P(x, y, PAL.white);
    if (state === 'grimy') {
      // a brown-gray film, desilvering creeping in from the corners
      k.D(x, y, w, h, mix(PAL.brown_d, PAL.g3, 0.5), 0.35);
      k.S(x, y, w, h, mix(PAL.brown, PAL.g4, 0.4), 0.12);
      for (const [cx, cy] of [[x, y + h - 1], [x + w - 1, y + h - 1], [x + w - 1, y]]) { k.P(cx, cy, PAL.ink); k.P(cx + (cx === x ? 1 : -1), cy, PAL.g1); k.P(cx, cy + (cy === y ? 1 : -1), PAL.g1); }
      k.R(x, y + h - 3, 3, 2, PAL.g1); k.P(x + w - 2, y + h - 2, PAL.ink);
    }
    if (state === 'cracked') {
      // impact at the upper right: radial cracks, one shard gone
      const ix = x + 9, iy = y + 3, cr = PAL.moon_l;
      for (const [ex, ey] of [[x, y + 6], [x + 2, y + h - 1], [x + 7, y + h - 1], [x + w - 1, y + 10], [x + 4, y], [x + w - 1, y + 1]]) k.L(ix, iy, ex, ey, cr);
      k.poly([[ix, iy], [ix + 2, iy + 3], [ix + 3, iy - 1]], PAL.ink);
      k.L(ix - 1, iy + 1, x + 1, y + 7, mix(base, PAL.ink, 0.5));
      k.P(ix, iy, PAL.white);
    }
    if (!clean && state === 'clean') k.S(x, y, w, h, mix(base, PAL.g4, 0.4), 0.03);
  }
  // shelf lip under the mirror
  k.R(x - 1, y + h + 1, w + 2, 1, fr.lt);
  return k.done({ outline: false });
}

// ---- urinal -----------------------------------------------------------------------------------
function urinal(o) {
  const { clean } = o;
  const k = new K(18, 40, -1, -28, seedOf('urinal', clean));
  const P = porcelain(clean);
  // flush valve and pipe from the wall
  k.V(8, -26, 8, CHROME.md); k.V(9, -26, 8, CHROME.dk); k.R(6, -20, 5, 2, CHROME.lt); k.P(11, -20, CHROME.hi); k.H(10, -21, 3, CHROME.md);
  // tall floor-standing trough: rounded top, deep recess, lip
  k.R(2, -17, 12, 22, P.md); k.R(3, -18, 10, 1, P.lt); k.H(2, -17, 12, P.hi); k.V(2, -16, 21, P.hi); k.V(13, -16, 21, P.dk);
  k.R(4, -15, 8, 17, P.dk); k.V(4, -15, 17, P.dd); k.R(5, -13, 6, 14, mix(P.dk, PAL.g3, 0.3));
  k.R(2, 3, 12, 2, P.lt); k.H(2, 5, 12, P.dk);
  k.E(8, 1, 2, 0, PAL.g2);
  if (!clean) {
    // mineral stain down the back, a crack, rust at the drain
    k.V(7, -14, 14, mix(PAL.amber_d, P.dk, 0.5)); k.V(8, -10, 10, mix(PAL.amber_d, P.dk, 0.6));
    k.L(3, -6, 4, -2, PAL.g3); k.P(8, 1, PAL.rust);
  }
  k.shadow(2, 6, 13, 2);
  return k.done();
}

// ---- hand_dryer (wall) ------------------------------------------------------------------------
function handDryer(o) {
  const { clean } = o;
  const k = new K(16, 16, 0, -14, seedOf('dryer', clean));
  const E = clean ? { hi: PAL.white, md: PAL.g6, dk: PAL.g5 } : { hi: mix(PAL.paper, PAL.g5, 0.4), md: mix(PAL.paper_d, PAL.g4, 0.4), dk: PAL.g4 };
  k.R(3, -12, 10, 7, E.md); k.H(3, -12, 10, E.hi); k.V(3, -11, 6, E.hi); k.V(12, -11, 6, E.dk); k.H(3, -6, 10, E.dk);
  k.R(5, -5, 4, 2, CHROME.md); k.H(5, -5, 4, CHROME.hi); k.P(6, -3, PAL.ink); k.P(7, -3, PAL.g2); // nozzle
  k.R(9, -10, 2, 2, PAL.g2); k.P(9, -10, PAL.g4); // push button
  k.R(4, -10, 4, 2, CHROME.lt); k.H(4, -9, 3, PAL.g3); // instruction plate
  if (!clean) { k.S(3, -12, 10, 7, 'rgba(70,60,50,0.35)', 0.08); k.drip(6, -2, 3, 'rgba(110,90,60,0.4)'); }
  k.shadow(4, -5, 9, 1, 'rgba(6,5,10,0.3)');
  return k.done({ outline: false });
}

// ---- shower_head (wall) -----------------------------------------------------------------------
function showerHead(o) {
  const { clean } = o;
  const k = new K(16, 30, 0, -18, seedOf('shower', clean));
  const C = clean ? CHROME : { hi: PAL.g5, lt: PAL.g4, md: mix(PAL.g3, PAL.rust, 0.2), dk: PAL.g2, dd: PAL.g1 };
  // supply pipe up the wall, arm, head angled down
  k.V(7, -12, 9, C.md); k.V(8, -12, 9, C.dk);
  k.R(6, -14, 6, 2, C.lt); k.H(6, -14, 6, C.hi);
  k.R(10, -13, 4, 3, C.md); k.H(10, -13, 4, C.hi); k.H(10, -11, 4, C.dd);
  for (let i = 0; i < 3; i++) k.P(11 + i, -10, PAL.ink);
  // valve handles low on the wall
  k.R(4, -3, 3, 2, C.lt); k.P(4, -3, C.hi); k.R(9, -3, 3, 2, C.lt); k.P(9, -3, C.hi); k.H(5, -2, 6, C.dk);
  k.P(5, -4, clean ? PAL.red_l : PAL.red_d); k.P(10, -4, clean ? PAL.blue_l : PAL.blue);
  if (!clean) {
    // the rust drip: a long streak from the head down the tile, beading at the bottom
    k.V(12, -9, 18, 'rgba(135,70,40,0.55)'); k.V(13, -9, 10, 'rgba(135,70,40,0.35)'); k.P(12, 9, PAL.rust); k.P(12, 10, 'rgba(135,70,40,0.6)');
    k.rust(10, -13, 4, 3, 2);
  }
  return k.done({ outline: false });
}

export const LIBRARY = {
  bookshelf_tall: { build: bookshelfTall, variants: 3 },
  card_catalog: { build: cardCatalog, variants: 2 },
  reading_table: { build: readingTable },
  chair_library: { build: chairLibrary, facing: ['down', 'up', 'left', 'right'] },
  librarian_desk: { build: librarianDesk },
  display_case: { build: displayCase },
  lamp_banker: { build: lampBanker },
  microfiche: { build: microfiche },
  book_cart: { build: bookCart, variants: 2 },
  yearbook_pile: { build: yearbookPile, variants: 2 },
  stall: { build: stall, variants: 4 },
  sink: { build: sink },
  mirror: { build: mirror },
  urinal: { build: urinal },
  hand_dryer: { build: handDryer },
  shower_head: { build: showerHead },
};
