// Props A — classroom: desk_student desk_teacher chair_teacher tiny_chair tiny_table bulletin_board
// flag_us poster cubbies drawings_wall alphabet_strip bookshelf_low globe projector trash_can
// radiator coat_hooks. (chalkboard / clock_wall live in props_a_dynamic.js.)
//
// Seats face the SITTER's direction. A seated character is drawn over the seat prop (engine sorts it
// after the seat), so seat art keeps desktops/backrests readable around a ~12-px body.
import { K, PAL, mix, lt, dk, OUT, SHADOW_SOFT, woodSet, steelSet, CHROME, BRASS, seedOf, paper, textW } from './props_a_kit.js';

// ---- shared seat colours (molded plastic, period hues pulled toward the palette) -------------
const SEAT = [
  [PAL.yellow, PAL.mustard, PAL.mustard_d],
  [mix(PAL.rust, PAL.tan, 0.4), PAL.rust, PAL.brown_d],
  [PAL.green_l, PAL.green, PAL.green_d],
  [PAL.denim, PAL.denim_d, mix(PAL.denim_d, PAL.ink, 0.45)],
  [PAL.tan, PAL.brown, PAL.brown_d],
];
function seatCol(v, clean) {
  const s = SEAT[v % SEAT.length];
  return clean ? { hi: lt(s[0], 0.1), md: s[1], dk: s[2] } : { hi: mix(s[0], PAL.g4, 0.35), md: mix(s[1], PAL.g3, 0.28), dk: mix(s[2], PAL.g2, 0.25) };
}
const lam = (clean) => (clean
  ? { hi: PAL.cream_l, md: mix(PAL.maple_l, PAL.cream_l, 0.35), dk: PAL.maple, edge: PAL.wood }
  : { hi: mix(PAL.cream_l, PAL.g5, 0.35), md: mix(PAL.maple, PAL.g4, 0.32), dk: mix(PAL.wood_l, PAL.g3, 0.3), edge: mix(PAL.wood_d, PAL.g2, 0.3) });
const legs = (clean) => (clean ? { hi: PAL.white, md: PAL.g5, dk: PAL.g3 } : { hi: PAL.g5, md: PAL.g4, dk: PAL.g2 });

// ---- desk_student -----------------------------------------------------------------------------
function deskTopItems(k, x, y, o, L) {
  const v = o.variant, clean = o.clean;
  if (v === 1 || (clean && v === 4)) paper(k, x + 3, y + 1, 6, 4, { clean, lines: PAL.g4, lineGap: 1 });
  if (v === 2 && !clean) { k.P(x + 11, y + 4, mix(PAL.skin_l, PAL.red_l, 0.3)); k.P(x + 12, y + 4, mix(PAL.skin, PAL.red, 0.3)); }
  if (v === 3) { k.R(x + 2, y + 1, 6, 4, clean ? PAL.blue : mix(PAL.blue, PAL.g3, 0.4)); k.H(x + 2, y + 1, 6, PAL.blue_l); k.V(x + 2, y + 1, 4, PAL.paper_d); k.P(x + 5, y + 3, PAL.yellow_l); }
  if (v === 4 && !clean) { k.L(x + 4, y + 4, x + 9, y + 3, PAL.yellow); k.P(x + 9, y + 3, PAL.skin_l); k.P(x + 3, y + 4, PAL.g2); }
  if (!clean && (v === 0 || v === 5 || v === 2)) {
    // carved initials / a heart, cut through the laminate to the brown core (kept off-centre and
    // asymmetric so a pair of nicks never reads as eyes)
    const c = mix(L.dk, PAL.brown_d, 0.55), hl = lt(L.md, 0.12);
    if (v === 5) { k.P(x + 9, y + 2, c); k.P(x + 11, y + 2, c); k.H(x + 9, y + 3, 3, c); k.P(x + 10, y + 4, c); k.L(x + 2, y + 4, x + 5, y + 4, hl); }
    else if (v === 0) { k.H(x + 2, y + 2, 4, c); k.P(x + 3, y + 3, c); k.H(x + 4, y + 4, 2, hl); }
    else { k.L(x + 7, y + 1, x + 11, y + 2, hl); k.H(x + 3, y + 4, 3, c); }
  }
}
function deskUp(k, o, { chair = true, desk = true } = {}) {
  const L = lam(o.clean), G = legs(o.clean), S = seatCol(o.variant, o.clean);
  if (desk) {
    // legs first (behind), then the top + T-molding lip + book box
    k.V(2, -1, 5, G.md); k.V(13, -1, 5, G.dk); k.P(2, 4, G.dk); k.P(13, 4, PAL.g1);
    k.R(1, -10, 14, 6, L.md); k.H(1, -10, 14, L.hi); k.V(1, -9, 5, L.hi); k.V(14, -9, 5, L.dk);
    k.H(1, -4, 14, L.edge); k.H(1, -5, 14, mix(L.md, L.dk, 0.5));
    k.R(2, -3, 12, 3, G.dk); k.H(3, -3, 10, PAL.ink); k.H(2, -1, 12, mix(G.dk, PAL.ink, 0.3)); k.P(2, -2, G.md);
    deskTopItems(k, 1, -10, o, L);
    if (!o.clean) { k.P(1, -4, PAL.brown_d); k.P(9, -4, L.hi); k.S(2, -9, 12, 4, mix(L.md, PAL.g3, 0.5), 0.06); }
  }
  if (chair) {
    // chair seen from behind: backrest shell, its two struts, the seat's rear lip, tubular legs
    k.V(3, 4, 8, G.md); k.V(12, 4, 8, G.dk); k.H(4, 9, 8, G.dk);
    k.P(3, 12, PAL.g1); k.P(12, 12, PAL.g1);
    k.R(3, 3, 10, 2, S.dk); k.H(4, 5, 8, mix(S.dk, PAL.ink, 0.3));
    k.R(4, -2, 8, 1, S.md); k.R(3, -1, 10, 4, S.md);
    k.H(4, -2, 8, S.hi); k.P(3, -1, S.hi); k.V(3, 0, 2, mix(S.md, S.hi, 0.5));
    k.H(3, 2, 10, S.dk); k.V(12, -1, 3, S.dk);
    if (!o.clean) { k.S(3, -1, 10, 4, mix(S.md, PAL.g2, 0.4), 0.08); k.P(5 + (o.variant % 5), 0, mix(S.hi, PAL.white, 0.2)); }
    k.shadow(2, 11, 13, 3);
    k.shadow(4, 13, 10, 1, SHADOW_SOFT);
  } else k.shadow(1, 3, 15, 3, SHADOW_SOFT);
}
function deskSide(k, o) {
  // facing LEFT: desk to the west, chair to the east (mirror for right)
  const L = lam(o.clean), G = legs(o.clean), S = seatCol(o.variant, o.clean);
  // desk legs + book box + top
  k.V(1, 1, 7, G.md); k.V(8, 1, 7, G.dk); k.P(1, 8, PAL.g1); k.P(8, 8, PAL.g1);
  k.R(1, -8, 8, 8, L.md); k.H(1, -8, 8, L.hi); k.V(1, -7, 7, L.hi); k.V(8, -7, 7, L.dk);
  k.H(1, 0, 8, L.edge); k.R(2, 1, 6, 2, G.dk); k.H(2, 3, 6, PAL.ink);
  if (o.variant === 1) paper(k, 2, -7, 5, 4, { clean: o.clean, lineGap: 1 });
  if (o.variant === 3) { k.R(2, -6, 5, 4, mix(PAL.blue, PAL.g3, o.clean ? 0 : 0.4)); k.H(2, -6, 5, PAL.blue_l); }
  if (!o.clean && o.variant !== 1) { const c = mix(L.dk, PAL.brown_d, 0.55); k.H(3, -4, 3, c); k.P(6, -3, c); }
  // connecting tube under the seat
  k.H(8, 7, 5, G.md);
  // chair: seat top, backrest in profile at the east edge, legs
  k.V(9, 6, 7, G.md); k.V(13, 6, 7, G.dk); k.P(9, 13, PAL.g1); k.P(13, 13, PAL.g1);
  k.R(9, 1, 5, 5, S.md); k.H(9, 1, 5, S.hi); k.H(9, 5, 5, S.dk); k.V(9, 2, 3, mix(S.md, S.hi, 0.5));
  k.R(13, -7, 2, 12, S.md); k.V(13, -7, 12, S.hi); k.V(14, -6, 11, S.dk); k.P(13, -7, lt(S.hi, 0.1));
  k.shadow(1, 8, 14, 3); k.shadow(2, 11, 13, 3, SHADOW_SOFT);
}
function deskOverturned(k, o) {
  // tipped over onto its top: the desk's underside faces up (gum, scuffs), its chrome legs stick up
  // into the air, the attached chair lies on its back beyond it
  const L = lam(o.clean), G = legs(o.clean), S = seatCol(o.variant, o.clean);
  const under = mix(PAL.wood_d, PAL.g2, 0.3);
  // the top, now on the floor: laminate edge toward us, underside up
  k.R(1, -2, 14, 6, under); k.H(1, -2, 14, mix(under, PAL.tan, 0.35)); k.V(14, -1, 5, dk(under, 0.3));
  k.H(1, 4, 14, L.md); k.H(1, 5, 14, L.edge);
  // the book box, upside down on it
  k.R(3, -4, 10, 3, G.dk); k.H(3, -4, 10, G.md); k.H(4, -2, 8, PAL.ink);
  for (const [gx, gy, c] of [[2, 1, PAL.skin_l], [12, 2, mix(PAL.g5, PAL.red_l, 0.25)], [7, 2, PAL.g5]]) k.P(gx, gy, c);
  // legs up in the air with their rubber feet, and the crossbar between them
  k.V(2, -12, 10, G.hi); k.V(3, -11, 9, G.dk); k.V(12, -12, 10, G.md); k.V(13, -11, 9, PAL.g2);
  k.R(2, -13, 2, 1, PAL.g1); k.R(12, -13, 2, 1, PAL.g1);
  k.H(4, -9, 8, G.md);
  // the chair on its back, legs sticking up and out
  k.R(4, 7, 9, 5, S.md); k.H(4, 7, 9, S.hi); k.H(4, 11, 9, S.dk); k.V(12, 8, 3, S.dk);
  k.L(5, 7, 4, 1, G.md); k.L(11, 7, 12, 1, G.dk); k.P(4, 0, PAL.g1); k.P(12, 0, PAL.g1);
  k.shadow(1, 5, 15, 2); k.shadow(3, 12, 11, 2, SHADOW_SOFT);
}
function deskStudent(o) {
  const k = new K(20, 32, -2, -15, seedOf('desk', o.state, o.dir, o.variant, o.clean));
  if (o.state === 'overturned') { if (o.variant & 1) k.mirror(16); deskOverturned(k, o); return k.done(); }
  if (o.state === 'scattered') {
    // knocked askew: the desk racked and shoved, the chair pulled out sideways
    if (o.variant & 1) k.mirror(16);
    deskUp(k, o, { chair: false });
    k.shiftCols(-1, -11, 18, 17, (i) => Math.round((i * 3) / 17), [0, 0, 0, 0]);
    const save = k.fw; if (!save) k.mirror(16); else k.mirror(0);
    const k2 = { ...o, variant: o.variant };
    k.x.save(); k.x.translate(3, 3);
    deskSideChairOnly(k, k2);
    k.x.restore(); k.mirror(save);
    return k.done();
  }
  if (o.dir === 'left' || o.dir === 'right') { if (o.dir === 'right') k.mirror(16); deskSide(k, o); return k.done(); }
  deskUp(k, o);
  return k.done();
}
function deskSideChairOnly(k, o) {
  const G = legs(o.clean), S = seatCol(o.variant, o.clean);
  k.V(9, 6, 7, G.md); k.V(13, 6, 7, G.dk);
  k.R(9, 1, 5, 5, S.md); k.H(9, 1, 5, S.hi); k.H(9, 5, 5, S.dk);
  k.R(13, -7, 2, 12, S.md); k.V(13, -7, 12, S.hi); k.V(14, -6, 11, S.dk);
  k.shadow(9, 12, 6, 2);
}

// ---- desk_teacher (2×1) -----------------------------------------------------------------------
function deskTeacher(o) {
  const { clean } = o;
  const k = new K(36, 30, -2, -12, seedOf('tdesk', o.dir, o.variant, clean));
  const S = steelSet(clean, 'green');
  const top = clean ? { hi: PAL.cream_l, md: mix(PAL.tan_l, PAL.cream, 0.4), dk: PAL.tan } : { hi: mix(PAL.cream, PAL.g5, 0.3), md: mix(PAL.tan, PAL.g4, 0.3), dk: mix(PAL.tan, PAL.g3, 0.5) };
  // body
  k.R(0, -2, 32, 15, S.md);
  k.V(0, -2, 15, S.lt); k.V(31, -2, 15, S.dk); k.H(0, 12, 32, S.dd);
  if (o.dir === 'up') {
    // teacher's side: pedestals of drawers either side of a dark kneehole
    k.R(11, 0, 10, 12, PAL.ink); k.H(11, 0, 10, S.dd); k.V(11, 1, 11, mix(S.dd, PAL.ink, 0.5));
    for (const [px0, rows] of [[1, [0, 4, 8]], [21, [0, 6]]]) {
      for (const ry of rows) {
        const h = rows.length === 2 && ry === 6 ? 6 : 4;
        k.R(px0, ry, 10, h - 1, S.md); k.H(px0, ry, 10, S.lt); k.H(px0, ry + h - 2, 10, S.dk);
        k.R(px0 + 3, ry + 1, 4, 1, CHROME.lt); k.H(px0 + 3, ry + 2, 4, CHROME.dk);
      }
    }
    if (!clean) { k.P(5, 9, PAL.ink); k.R(22, 7, 9, 1, PAL.ink); }
  } else {
    // student side: the modesty panel between two pedestal ends
    k.R(10, 0, 12, 11, S.dk); k.H(10, 0, 12, S.dd); k.V(21, 0, 11, S.lt);
    k.V(9, 0, 12, S.lt); k.V(22, 0, 12, S.dd);
    k.H(1, 5, 8, S.dk); k.H(23, 5, 8, S.dk);
  }
  k.P(1, 13, PAL.g1); k.P(30, 13, PAL.g1);
  // top + chrome edge
  k.R(0, -10, 32, 7, top.md); k.H(0, -10, 32, top.hi); k.V(0, -9, 6, top.hi); k.V(31, -9, 6, top.dk);
  k.H(0, -3, 32, CHROME.lt); k.H(0, -2, 32, CHROME.dk);
  // things on the desk
  const blot = clean ? PAL.green : mix(PAL.green_d, PAL.g2, 0.3);
  k.R(10, -9, 12, 5, blot); k.H(10, -9, 12, mix(blot, PAL.white, 0.15)); k.V(10, -9, 5, PAL.brown); k.V(21, -9, 5, PAL.brown);
  paper(k, 12, -8, 6, 3, { clean, lineGap: 1 });
  // paper stacks (left)
  k.R(2, -9, 6, 4, clean ? PAL.paper : PAL.paper_d); k.H(2, -6, 6, PAL.g4); k.H(2, -8, 6, PAL.g5); k.R(3, -10, 5, 2, clean ? PAL.white : PAL.paper); k.H(3, -10, 5, PAL.g6);
  if (!clean) { k.P(7, -8, PAL.g3); k.R(2, -5, 3, 1, PAL.paper_d); }
  // apple paperweight (glass, dull red) and a pencil cup
  k.R(25, -9, 3, 3, clean ? PAL.red : mix(PAL.red_d, PAL.g3, 0.25)); k.P(25, -9, clean ? PAL.red_l : PAL.red); k.P(26, -10, PAL.green); k.P(27, -7, PAL.blood_d);
  k.R(28, -11, 2, 4, CHROME.md); k.P(28, -12, PAL.yellow); k.P(29, -13, PAL.yellow_l); k.P(28, -11, CHROME.hi);
  if (!clean) { k.grime(0, -2, 32, 15, 1); k.rust(0, 8, 32, 5, 3); k.S(0, -10, 32, 7, mix(top.md, PAL.g3, 0.5), 0.05); }
  k.shadow(1, 13, 32, 2); k.shadow(30, 0, 3, 13, SHADOW_SOFT);
  return k.done();
}

// ---- chair_teacher (wooden swivel) ------------------------------------------------------------
function chairTeacher(o) {
  const { clean } = o;
  const k = new K(20, 30, -2, -15, seedOf('tchair', o.dir, clean));
  const W = woodSet(clean, 'oak');
  const I = clean ? { md: PAL.g3, dk: PAL.g2 } : { md: mix(PAL.g3, PAL.rust, 0.2), dk: PAL.g1 };
  const base = () => {
    // swivel column + four splayed feet with casters
    k.R(7, 3, 2, 6, I.md); k.V(7, 3, 6, PAL.g4);
    k.L(8, 9, 2, 12, I.md); k.L(8, 9, 14, 12, I.dk); k.L(8, 9, 5, 13, I.md); k.L(8, 9, 11, 13, I.dk);
    for (const [cx, cy] of [[2, 12], [14, 12], [5, 13], [11, 13]]) k.P(cx, cy + 1, PAL.ink);
    k.shadow(2, 12, 14, 3);
  };
  if (o.dir === 'left' || o.dir === 'right') {
    if (o.dir === 'right') k.mirror(16);
    base();
    k.R(3, -3, 10, 5, W.md); k.H(3, -3, 10, W.hi); k.H(3, 1, 10, W.dk); k.V(3, -2, 3, W.lt);
    k.R(12, -13, 2, 14, W.md); k.V(12, -13, 14, W.hi); k.V(13, -12, 13, W.dk); k.R(11, -13, 3, 2, W.lt);
    k.H(4, -7, 8, W.md); k.H(4, -6, 8, W.dk); k.V(4, -7, 4, W.dk); // arm
    return k.done();
  }
  base();
  if (o.dir === 'up') {
    // back toward camera: curved slat back hides the seat
    k.R(3, -3, 10, 5, W.dk);
    k.R(2, -11, 12, 9, W.md); k.H(2, -11, 12, W.hi); k.V(2, -10, 8, W.lt); k.V(13, -10, 8, W.dd);
    for (let x = 4; x < 13; x += 3) k.V(x, -9, 6, W.dk);
    k.H(2, -3, 12, W.dk); k.R(1, -6, 2, 5, W.lt); k.R(13, -6, 2, 5, W.dk);
  } else {
    // facing camera: slat back behind, saddle seat, arms
    k.R(3, -12, 10, 7, W.md); k.H(3, -12, 10, W.hi); k.H(3, -6, 10, W.dk);
    for (let x = 5; x < 12; x += 2) k.V(x, -10, 4, W.dk);
    k.R(2, -5, 12, 6, W.md); k.H(2, -5, 12, W.hi); k.V(2, -4, 5, W.lt); k.H(3, 1, 10, W.dk); k.H(2, 2, 12, W.dd);
    k.D(5, -3, 6, 3, W.lt, 0.3);
    k.R(1, -7, 2, 7, W.lt); k.V(1, -7, 7, W.hi); k.R(13, -7, 2, 7, W.dk); k.V(14, -7, 7, W.dd);
  }
  if (!clean) k.S(2, -12, 12, 14, PAL.g2, 0.04);
  return k.done();
}

// ---- tiny_chair -------------------------------------------------------------------------------
function tinyChair(o) {
  const { clean } = o;
  const k = new K(20, 24, -2, -9, seedOf('tiny', o.dir, o.variant, clean));
  const PR = [[PAL.red_l, PAL.red, PAL.red_d], [PAL.denim_l, PAL.denim, PAL.denim_d], [PAL.yellow_l, PAL.yellow, PAL.mustard], [PAL.mint, PAL.green_l, PAL.green]][o.variant % 4];
  const S = clean ? { hi: PR[0], md: PR[1], dk: PR[2] } : { hi: mix(PR[0], PAL.g5, 0.45), md: mix(PR[1], PAL.g4, 0.4), dk: mix(PR[2], PAL.g2, 0.35) };
  const W = woodSet(clean, 'maple');
  const legsAt = (xs, y0, y1) => xs.forEach((x, i) => { k.V(x, y0, y1 - y0, i % 2 ? W.dk : W.md); k.P(x, y1, PAL.wood_d); });
  if (o.dir === 'left' || o.dir === 'right') {
    if (o.dir === 'right') k.mirror(16);
    legsAt([4, 11], 5, 11);
    k.R(4, 1, 8, 4, W.md); k.H(4, 1, 8, W.hi); k.H(4, 4, 8, W.dk);
    k.R(11, -5, 2, 9, S.md); k.V(11, -5, 9, S.hi); k.V(12, -4, 8, S.dk);
    k.shadow(3, 10, 11, 3);
    return k.done();
  }
  if (o.dir === 'down') {
    legsAt([4, 11, 5, 10], 5, 11);
    k.R(4, -4, 8, 4, S.md); k.H(4, -4, 8, S.hi); k.H(4, -1, 8, S.dk);
    k.V(4, 0, 2, W.dk); k.V(11, 0, 2, W.dk);
    k.R(3, 1, 10, 4, W.md); k.H(3, 1, 10, W.hi); k.H(3, 4, 10, W.dk); k.V(3, 2, 2, W.lt);
  } else {
    legsAt([4, 11], 6, 11);
    k.R(4, 1, 8, 3, W.dk); k.H(4, 1, 8, W.md);
    k.R(4, -3, 8, 4, S.md); k.H(4, -3, 8, S.hi); k.H(4, 0, 8, S.dk); k.V(4, -2, 2, mix(S.md, S.hi, 0.5));
    k.V(5, 1, 3, S.dk); k.V(10, 1, 3, S.dk);
  }
  if (!clean) { k.S(3, -4, 10, 9, PAL.g3, 0.05); }
  k.shadow(3, 10, 10, 3);
  return k.done();
}

// ---- tiny_table (2×1) -------------------------------------------------------------------------
function tinyTable(o) {
  const { clean } = o;
  const k = new K(36, 26, -2, -10, seedOf('ttable', o.variant, clean));
  const top = clean ? { hi: PAL.cream_l, md: mix(PAL.maple_l, PAL.cream_l, 0.4), dk: PAL.maple } : { hi: mix(PAL.cream_l, PAL.g5, 0.4), md: mix(PAL.maple, PAL.g4, 0.3), dk: mix(PAL.wood_l, PAL.g3, 0.35) };
  const W = woodSet(clean, 'maple');
  for (const x of [1, 30]) { k.R(x, 5, 2, 7, x < 10 ? W.md : W.dk); k.P(x, 12, PAL.wood_d); }
  k.R(0, -7, 32, 12, top.md); k.H(0, -7, 32, top.hi); k.V(0, -6, 11, top.hi); k.V(31, -6, 11, top.dk);
  k.R(0, 5, 32, 2, W.md); k.H(0, 5, 32, W.lt); k.H(0, 6, 32, W.dk);
  // crayons, construction paper, scribbles (faded)
  const cr = [PAL.red_l, PAL.denim, PAL.yellow, PAL.green_l, PAL.orange_l, PAL.hair_r];
  const f = (c) => (clean ? c : mix(c, PAL.g4, 0.45));
  k.R(4, -5, 8, 6, f(PAL.denim_l)); k.H(4, -5, 8, lt(f(PAL.denim_l), 0.15));
  k.E(8, -2, 2, 1, f(PAL.yellow)); k.P(6, -4, f(PAL.red_l)); k.P(10, -4, f(PAL.green_l));
  k.R(20, -4, 6, 3, f(PAL.yellow)); k.H(20, -4, 6, f(PAL.yellow_l)); k.H(21, -2, 4, f(PAL.mustard));
  for (let i = 0; i < 5; i++) k.R(27, -5 + i, 3, 1, f(cr[i]));
  if (!clean) {
    for (let i = 0; i < 6; i++) { const x = k.ri(2, 28), y = k.ri(-6, 3); k.L(x, y, x + k.ri(1, 4), y + k.ri(-1, 1), mix(f(cr[i % cr.length]), top.md, 0.35)); }
    k.grime(0, -7, 32, 12, 0.5);
  }
  k.shadow(1, 12, 32, 2); k.shadow(0, 7, 32, 5, SHADOW_SOFT);
  return k.done();
}

// ---- bulletin_board (2×1 wall) ----------------------------------------------------------------
function cork(k, x, y, w, h, clean) {
  const c = clean ? PAL.tan : mix(PAL.tan, PAL.brown, 0.3);
  k.R(x, y, w, h, c);
  k.S(x, y, w, h, lt(c, 0.12), 0.15); k.S(x, y, w, h, dk(c, 0.18), 0.18);
}
const PIN = [PAL.red_l, PAL.yellow, PAL.denim_l, PAL.green_l];
function bulletin(o) {
  const { state, clean } = o;
  const k = new K(34, 24, -1, -15, seedOf('bb', state, clean));
  const F = woodSet(clean, 'oak');
  const bx = 0, by = -13, bw = 32, bh = 19;
  k.R(bx, by, bw, bh, F.md); k.H(bx, by, bw, F.hi); k.V(bx, by, bh, F.lt); k.V(bx + bw - 1, by, bh, F.dk); k.H(bx, by + bh - 1, bw, F.dd);
  cork(k, bx + 1, by + 1, bw - 2, bh - 2, clean);
  const f = (c) => (clean ? c : mix(c, PAL.paper_d, 0.4));
  const pinc = (i) => f(PIN[((i % PIN.length) + PIN.length) % PIN.length]);
  const sheet = (x, y, w, h, opts = {}) => paper(k, x, y, w, h, { clean, pin: pinc(x + y), curl: clean ? 0 : opts.curl ?? (x % 3 === 0 ? 1 : 0), ...opts });
  switch (state) {
    case 'bell_schedule': {
      sheet(3, -11, 13, 15, { lines: null, curl: 0 });
      k.R(4, -10, 11, 2, f(PAL.green_d));
      for (let j = 0; j < 6; j++) { k.H(5, -7 + j * 2, 4, PAL.g3); k.H(10, -7 + j * 2, 4, PAL.g3); }
      k.V(9, -7, 11, PAL.g5);
      // a clock face doodle + a second sheet
      sheet(19, -11, 10, 9, { lines: PAL.g4 });
      k.E(24, -7, 2, 2, PAL.g6); k.frame(22, -9, 5, 5, PAL.g3); k.P(24, -8, PAL.ink); k.P(25, -7, PAL.ink);
      sheet(18, -1, 9, 5, { col: PAL.yellow_l, lines: PAL.mustard_d });
      break;
    }
    case 'brood': {
      // Mr. Lutz's BROOD II board: cicada diagram, the emergence-years table, specimen card
      sheet(2, -11, 14, 12, { lines: null, curl: 0 });
      const am = f(PAL.amber), amd = f(PAL.amber_d);
      k.E(9, -5, 2, 4, am); k.V(9, -9, 8, amd); k.R(8, -9, 3, 2, amd);
      k.L(6, -6, 4, -8, f(PAL.moon)); k.L(12, -6, 14, -8, f(PAL.moon)); k.L(6, -4, 4, -2, f(PAL.moon)); k.L(12, -4, 14, -2, f(PAL.moon));
      k.P(8, -8, PAL.red); k.P(10, -8, PAL.red);
      sheet(18, -11, 11, 15, { lines: null, curl: clean ? 0 : 2 });
      k.R(19, -10, 9, 2, f(PAL.green_d));
      for (let j = 0; j < 5; j++) { k.H(19, -6 + j * 2, 3, PAL.g3); k.H(23, -6 + j * 2, 4, j === 4 ? PAL.red_d : PAL.g3); }
      sheet(4, 2, 8, 3, { col: PAL.cream_l, lines: null });
      k.P(6, 3, am); k.P(8, 3, am); k.P(10, 3, am);
      break;
    }
    case 'heritage': {
      // OUR PROUD HERITAGE: sepia photos of the breaker and miners, a pennant
      k.R(2, -12, 28, 4, f(PAL.green_d)); k.T(4, -12, 'OUR', f(PAL.yellow_l)); k.H(17, -10, 11, f(PAL.yellow));
      const sep = (x, y, w, h) => { k.R(x, y, w, h, f(PAL.paper)); k.R(x + 1, y + 1, w - 2, h - 3, mix(PAL.brown, PAL.tan, 0.3)); k.D(x + 1, y + 1, w - 2, h - 3, PAL.brown_d, 0.35); };
      sep(3, -7, 10, 9);
      k.poly([[5, 0], [7, -5], [9, -4], [10, -6], [11, 0]], PAL.brown_dd); k.V(8, -5, 4, PAL.ink);
      sep(15, -7, 8, 7);
      for (let i = 0; i < 3; i++) { k.R(16 + i * 2, -4, 1, 2, PAL.brown_dd); k.P(16 + i * 2, -5, PAL.tan_l); }
      sheet(24, -7, 6, 11, { lines: PAL.g4, lineGap: 1 });
      sep(15, 1, 7, 4);
      break;
    }
    case 'ourtown': {
      // OUR TOWN: theatre bill (white steeple on night blue), cast list, a program
      k.R(3, -12, 12, 16, f(PAL.blue_d)); k.H(3, -12, 12, f(PAL.blue));
      k.T(4, -11, 'OUR', f(PAL.cream_l));
      k.poly([[6, 2], [6, -3], [8, -5], [10, -3], [10, 2]], f(PAL.paper)); k.V(8, -8, 3, f(PAL.paper)); k.R(7, -2, 2, 2, f(PAL.yellow));
      k.H(3, 3, 12, f(PAL.yellow)); k.frame(3, -12, 12, 16, PAL.ink);
      sheet(18, -11, 11, 12, { lines: PAL.g4, curl: 1 });
      sheet(17, 2, 8, 3, { col: PAL.cream, lines: null });
      break;
    }
    case 'computers': {
      // COMPUTERS: TRS-80 sketch, green-screen printout, punch card
      sheet(2, -12, 15, 13, { lines: null, curl: 0 });
      k.R(4, -10, 9, 7, PAL.g3); k.R(5, -9, 7, 5, PAL.ink); k.H(6, -8, 4, f(PAL.crt)); k.H(6, -6, 3, f(PAL.crt));
      k.R(4, -3, 11, 2, PAL.g4); k.H(5, -2, 9, PAL.g2);
      // tractor-feed printout
      k.R(19, -12, 10, 17, f(PAL.white)); for (let j = -11; j < 5; j += 2) k.H(20, j, 8, f(PAL.green_l));
      k.V(19, -12, 17, PAL.g5); k.V(28, -12, 17, PAL.g5);
      for (let j = -12; j < 5; j += 3) { k.P(19, j, PAL.g3); k.P(28, j, PAL.g3); }
      sheet(4, 2, 12, 3, { col: PAL.cream_l, lines: null }); for (let i = 5; i < 15; i += 2) k.P(i, 3, PAL.g3);
      break;
    }
    case 'kinder': {
      // crayon drawings: suns, a house, stick people, a rainbow; ABC card
      const sheetK = (x, y, w, h) => { k.R(x, y, w, h, f(PAL.white)); k.H(x, y + h - 1, w, PAL.g5); k.P(x + (w >> 1), y, pinc(x)); };
      sheetK(2, -12, 9, 8); k.E(4, -10, 1, 1, f(PAL.yellow)); k.P(3, -8, f(PAL.yellow)); k.R(6, -8, 3, 3, f(PAL.red_l)); k.P(7, -9, f(PAL.red)); k.H(2, -6, 9, f(PAL.green_l));
      sheetK(12, -11, 8, 9); k.P(15, -9, f(PAL.hair_r)); k.V(15, -8, 3, f(PAL.denim)); k.P(14, -7, f(PAL.denim)); k.P(16, -7, f(PAL.denim)); k.P(14, -5, f(PAL.denim)); k.P(16, -5, f(PAL.denim));
      k.P(18, -9, f(PAL.hair_b)); k.V(18, -8, 3, f(PAL.red_l));
      sheetK(21, -12, 9, 8);
      for (let i = 0; i < 4; i++) for (let a = 0; a < 7; a++) k.P(22 + a + (a === 0 || a === 6 ? 0 : 0), -7 - i - (a > 0 && a < 6 ? 1 : 0), f([PAL.red_l, PAL.yellow, PAL.green_l, PAL.denim][i]));
      sheetK(4, -3, 8, 8); k.T(5, -2, 'AB', f(PAL.red_l));
      sheetK(15, -1, 12, 6); k.R(17, 1, 4, 3, f(PAL.orange_l)); k.H(16, 0, 6, f(PAL.brown)); k.P(24, 1, f(PAL.yellow));
      break;
    }
    default: {
      // generic: bake-sale flyer, notices, a curling photo, thumbtacks everywhere
      sheet(2, -12, 10, 12, { lines: PAL.g4, curl: 1 });
      k.R(3, -11, 8, 2, f(PAL.red_d));
      sheet(14, -11, 8, 7, { col: PAL.yellow_l, lines: PAL.mustard_d });
      sheet(24, -12, 6, 9, { lines: PAL.g4 });
      sheet(13, -2, 9, 6, { col: PAL.mint, lines: PAL.green_d, curl: 2 });
      sheet(24, -1, 6, 5, { lines: PAL.g4 });
      k.R(4, 1, 6, 4, PAL.g5); k.R(5, 2, 4, 2, f(PAL.denim_d));
      for (let i = 0; i < 6; i++) k.P(k.ri(3, 28), k.ri(-11, 4), pinc(i));
    }
  }
  if (!clean) { k.grime(bx + 1, by + 1, bw - 2, bh - 2, 0.7); if (state !== 'kinder') k.A(bx + 20, by + 1, 6, 9, 'rgba(110,80,40,0.18)'); }
  return k.done({ outline: false });
}

// ---- flag_us (wall) ---------------------------------------------------------------------------
function flagUS(o) {
  const { clean } = o;
  const k = new K(18, 22, -1, -17, seedOf('flag', clean));
  const red = clean ? PAL.red : mix(PAL.red_d, PAL.brown, 0.35), wht = clean ? PAL.paper : mix(PAL.paper_d, PAL.cream_d, 0.4);
  const blu = clean ? PAL.blue : mix(PAL.blue_d, PAL.g2, 0.3);
  // bracket + pole angled out from the wall
  k.R(2, -5, 3, 3, BRASS.dk); k.P(2, -5, BRASS.md);
  k.L(3, -5, 13, -14, clean ? BRASS.lt : BRASS.md); k.L(4, -5, 14, -14, BRASS.dk);
  k.R(13, -16, 2, 2, BRASS.lt); k.P(13, -16, BRASS.hi);
  // the flag hangs from the pole in folds: stripes slant with the pole, canton at the top
  for (let i = 0; i < 9; i++) {
    const x = 5 + i, y0 = -6 - Math.round(i * 0.9);
    const len = 11 - (i > 6 ? i - 6 : 0);
    for (let j = 0; j < len; j++) {
      const stripe = Math.floor((j + (i & 1)) / 2) % 2 === 0 ? red : wht;
      let c = stripe;
      if (i >= 4 && j < 6) c = blu;
      if ((i % 3) === 2) c = dk(c, 0.25);
      k.P(x, y0 + j, c);
    }
  }
  k.P(11, -12, wht); k.P(13, -10, wht); k.P(12, -8, wht);
  k.shadow(6, -3, 9, 2, 'rgba(6,5,10,0.25)');
  return k.done();
}

// ---- poster (wall) ----------------------------------------------------------------------------
function poster(o) {
  const { state, clean } = o;
  const k = new K(16, 20, 0, -17, seedOf('poster', state, clean));
  // word posters fill the sheet edge to edge so their 4-letter titles fit
  const wide = state === 'read' || state === 'band';
  const x = wide ? 0 : 1, y = -15, w = wide ? 16 : 14, h = 16;
  const f = (c) => (clean ? c : mix(c, PAL.paper_d, 0.42));
  const bgOf = { read: PAL.yellow_l, homecoming79: PAL.green_d, periodic: PAL.paper, foodgroups: PAL.paper, pa_map: PAL.moon_l, alphabet: PAL.paper,
    ourtown: PAL.blue_d, patrol: PAL.paper, computer: PAL.g2, band: PAL.green }[state] || PAL.paper;
  k.R(x, y, w, h, f(bgOf));
  switch (state) {
    case 'read':
      k.R(x, y, w, 7, f(PAL.red_d)); k.T(x + ((w - textW('READ')) >> 1), y + 1, 'READ', f(PAL.yellow_l));
      k.R(x + 2, y + 8, 8, 5, f(PAL.white)); k.V(x + 6, y + 8, 5, f(PAL.g4)); k.H(x + 3, y + 10, 2, PAL.g4); k.H(x + 7, y + 10, 2, PAL.g4);
      k.E(x + 6, y + 6, 2, 1, f(PAL.brown)); k.P(x + 5, y + 6, PAL.white); k.P(x + 7, y + 6, PAL.white);
      break;
    case 'homecoming79':
      // GO COLLIERS: a gold block C, the year in white
      k.T(x + 1, y + 1, 'GO', f(PAL.yellow_l));
      k.R(x + 9, y + 1, 4, 5, f(PAL.yellow)); k.R(x + 11, y + 2, 2, 3, f(PAL.green_d)); k.P(x + 9, y + 1, f(PAL.yellow_l));
      k.T(x + 2, y + 8, "'79", f(PAL.white));
      k.H(x, y + 14, w, f(PAL.yellow)); k.H(x, y + 6, w, f(PAL.green));
      break;
    case 'periodic':
      for (let r = 0; r < 6; r++) for (let c = 0; c < 10; c++) {
        if (r < 2 && c > 0 && c < 9) continue;
        const col = [PAL.red_l, PAL.yellow, PAL.mint, PAL.denim_l, PAL.tan_l][(c + (r > 3 ? 2 : 0)) % 5];
        k.P(x + 1 + c, y + 3 + r * 2, f(col)); k.P(x + 1 + c, y + 4 + r * 2, f(dk(col, 0.2)));
      }
      k.H(x + 1, y + 1, 6, PAL.g3);
      break;
    case 'foodgroups':
      k.E(x + 6, y + 8, 4, 4, f(PAL.white));
      k.poly([[x + 6, y + 8], [x + 6, y + 4], [x + 10, y + 8]], f(PAL.red_l)); k.poly([[x + 6, y + 8], [x + 10, y + 8], [x + 6, y + 12]], f(PAL.green_l));
      k.poly([[x + 6, y + 8], [x + 6, y + 12], [x + 2, y + 8]], f(PAL.yellow)); k.poly([[x + 6, y + 8], [x + 2, y + 8], [x + 6, y + 4]], f(PAL.denim_l));
      k.H(x + 2, y + 1, 8, PAL.g3); k.H(x + 3, y + 14, 6, PAL.g4);
      break;
    case 'pa_map':
      k.poly([[x + 1, y + 5], [x + 10, y + 5], [x + 11, y + 7], [x + 10, y + 9], [x + 11, y + 11], [x + 1, y + 11]], f(PAL.green_l));
      k.P(x + 9, y + 9, PAL.red); k.P(x + 4, y + 8, PAL.ink); k.P(x + 7, y + 7, PAL.ink);
      k.T(x + 1, y + 1, 'PA', f(PAL.blue_d)); k.H(x + 1, y + 13, 9, PAL.g4);
      break;
    case 'alphabet':
      k.T(x + 1, y + 1, 'AB', f(PAL.red_l)); k.T(x + 1, y + 7, 'CD', f(PAL.denim)); k.P(x + 10, y + 3, f(PAL.yellow)); k.P(x + 10, y + 9, f(PAL.green_l));
      k.H(x + 1, y + 13, 10, f(PAL.green_l));
      break;
    case 'ourtown':
      k.T(x + 1, y + 1, 'OUR', f(PAL.cream_l));
      k.poly([[x + 3, y + 14], [x + 3, y + 10], [x + 6, y + 7], [x + 9, y + 10], [x + 9, y + 14]], f(PAL.paper)); k.V(x + 6, y + 5, 2, f(PAL.paper));
      k.R(x + 5, y + 11, 2, 2, f(PAL.yellow)); k.P(x + 10, y + 7, f(PAL.white)); k.P(x + 1, y + 9, f(PAL.white));
      break;
    case 'patrol':
      // SAFETY PATROL: a kid in the orange belt, hand raised
      k.R(x, y, w, 3, f(PAL.blue)); k.H(x + 1, y + 1, 9, f(PAL.white));
      k.R(x + 4, y + 4, 4, 3, f(PAL.skin)); k.R(x + 4, y + 4, 4, 1, f(PAL.hair_b));
      k.R(x + 3, y + 7, 6, 6, f(PAL.blue)); k.L(x + 3, y + 7, x + 8, y + 12, f(PAL.orange)); k.H(x + 3, y + 10, 6, f(PAL.orange));
      k.V(x + 10, y + 4, 4, f(PAL.blue)); k.P(x + 10, y + 3, f(PAL.skin));
      k.R(x + 4, y + 13, 4, 2, f(PAL.g2));
      break;
    case 'computer':
      k.R(x + 2, y + 3, 8, 6, PAL.g4); k.R(x + 3, y + 4, 6, 4, PAL.ink); k.H(x + 4, y + 5, 3, f(PAL.crt)); k.P(x + 4, y + 6, f(PAL.crt));
      k.R(x + 1, y + 10, 10, 2, PAL.g5); k.H(x + 2, y + 11, 8, PAL.g3);
      k.H(x + 1, y + 1, 10, f(PAL.green_l)); k.H(x + 2, y + 14, 8, f(PAL.green_l));
      break;
    case 'band':
      k.T(x + ((w - textW('BAND')) >> 1), y + 1, 'BAND', f(PAL.yellow_l));
      k.L(x + 2, y + 13, x + 8, y + 7, f(PAL.gold)); k.R(x + 8, y + 6, 3, 3, f(PAL.gold)); k.P(x + 8, y + 6, f(PAL.gold_l));
      k.P(x + 4, y + 9, f(PAL.white)); k.P(x + 5, y + 8, f(PAL.white)); k.P(x + 6, y + 11, f(PAL.white)); k.V(x + 7, y + 9, 3, f(PAL.white));
      break;
  }
  // paper edge, tape, curling corner, decay
  k.V(x + w - 1, y + 1, h - 1, dk(f(bgOf), 0.12));
  if (!clean) {
    k.clear(x + w - 2, y + h - 2, 2, 2); k.P(x + w - 3, y + h - 2, lt(f(bgOf), 0.25)); k.P(x + w - 2, y + h - 3, lt(f(bgOf), 0.25)); k.P(x + w - 3, y + h - 3, dk(f(bgOf), 0.3));
    k.A(x, y + 9, 5, 7, 'rgba(110,80,40,0.22)');
    k.S(x, y, w, h, 'rgba(60,40,20,0.3)', 0.05);
    if (state === 'periodic' || state === 'pa_map') k.clear(x, y, 2, 1);
  }
  k.P(x, y, 'rgba(230,220,180,0.7)'); k.P(x + w - 1, y, 'rgba(230,220,180,0.7)');
  k.shadow(x + 1, y + h, w, 1, 'rgba(6,5,10,0.3)');
  return k.done({ outline: false });
}

// ---- cubbies (2×1) ----------------------------------------------------------------------------
function cubbies(o) {
  const { clean } = o;
  const k = new K(36, 34, -2, -19, seedOf('cubbies', clean));
  const W = woodSet(clean, 'maple');
  const f = (c) => (clean ? c : mix(c, PAL.g4, 0.4));
  k.R(0, -17, 32, 3, W.hi); k.H(0, -17, 32, lt(W.hi, 0.1)); k.H(0, -15, 32, W.lt);
  k.R(0, -14, 32, 26, W.md); k.V(0, -14, 26, W.lt); k.V(31, -14, 26, W.dk); k.H(0, 11, 32, W.dd);
  const names = [PAL.red_l, PAL.yellow, PAL.denim_l, PAL.green_l];
  for (let r = 0; r < 2; r++) for (let c = 0; c < 4; c++) {
    const cx = 2 + c * 7, cy = -12 + r * 11;
    k.R(cx, cy, 6, 8, PAL.ink); k.R(cx, cy, 6, 2, f(PAL.brown_dd)); k.V(cx, cy, 8, W.dd);
    k.R(cx, cy + 8, 6, 2, f(names[(r + c) % 4])); k.H(cx + 1, cy + 9, 3, f(PAL.white));
    if (r === 0 && c === 2) { k.R(cx + 1, cy + 4, 3, 4, f(PAL.red)); k.P(cx + 3, cy + 3, f(PAL.red)); k.H(cx + 1, cy + 7, 3, f(PAL.white)); } // the mitten
    if (r === 1 && c === 0) { k.R(cx + 1, cy + 3, 4, 5, f(PAL.yellow)); k.H(cx + 1, cy + 3, 4, f(PAL.yellow_l)); k.R(cx + 2, cy + 2, 2, 1, PAL.g3); } // lunchbox
    if (r === 0 && c === 0) { k.R(cx + 1, cy + 5, 4, 3, f(PAL.paper)); k.H(cx + 1, cy + 5, 4, PAL.white); }
  }
  if (!clean) { k.grime(0, -14, 32, 26, 0.8); k.S(0, -17, 32, 3, PAL.g4, 0.12); }
  k.shadow(1, 12, 32, 2);
  return k.done();
}

// ---- drawings_wall (2×1 wall) -----------------------------------------------------------------
function drawingsWall(o) {
  const { clean } = o;
  const k = new K(32, 22, 0, -16, seedOf('drawings', clean));
  const f = (c) => (clean ? c : mix(c, PAL.paper_d, 0.45));
  k.R(2, -15, 28, 7, f(PAL.yellow)); k.T(2 + ((28 - textW('GROW UP')) >> 1), -14, 'GROW UP', f(PAL.red_d)); k.H(2, -9, 28, dk(f(PAL.yellow), 0.2));
  const sheet = (x, y, w, h, draw) => { k.R(x, y, w, h, f(PAL.white)); k.H(x, y + h - 1, w, f(PAL.g5)); k.P(x + 1, y, 'rgba(230,220,180,0.7)'); k.P(x + w - 2, y, 'rgba(230,220,180,0.7)'); draw(x, y); };
  sheet(2, -7, 8, 10, (x, y) => { // fireman
    k.R(x + 3, y + 1, 3, 1, f(PAL.red)); k.P(x + 4, y + 2, f(PAL.skin)); k.V(x + 4, y + 3, 3, f(PAL.yellow)); k.P(x + 3, y + 6, f(PAL.ink)); k.P(x + 5, y + 6, f(PAL.ink)); k.L(x + 1, y + 8, x + 6, y + 3, f(PAL.red_l));
  });
  sheet(12, -6, 8, 9, (x, y) => { // a teacher at a board
    k.R(x + 1, y + 1, 6, 3, f(PAL.green_d)); k.P(x + 5, y + 5, f(PAL.hair_b)); k.V(x + 5, y + 6, 2, f(PAL.denim));
  });
  sheet(22, -7, 8, 10, (x, y) => { // "the school" — and something big in it
    k.R(x + 1, y + 3, 6, 5, f(PAL.brick_l)); k.poly([[x + 1, y + 3], [x + 4, y + 1], [x + 7, y + 3]], f(PAL.brick_d));
    k.R(x + 3, y + 5, 2, 3, f(PAL.navy)); k.P(x + 3, y + 5, f(PAL.flesh)); k.P(x + 1, y + 1, f(PAL.yellow));
  });
  if (!clean) { k.clear(29, -8, 1, 2); k.A(12, -6, 8, 4, 'rgba(110,80,40,0.2)'); }
  return k.done({ outline: false });
}

// ---- alphabet_strip (3×1 wall, high) ----------------------------------------------------------
function alphabetStrip(o) {
  const { clean } = o;
  const k = new K(48, 9, 0, -16, seedOf('abc', clean));
  const band = clean ? PAL.green : mix(PAL.green_d, PAL.g2, 0.2);
  k.R(0, -16, 48, 8, band); k.H(0, -16, 48, mix(band, PAL.mint, 0.3)); k.H(0, -9, 48, dk(band, 0.35));
  const letters = 'ABCDEFGH';
  for (let i = 0; i < 8; i++) {
    const x = 1 + i * 6;
    const card = clean ? PAL.paper : mix(PAL.paper_d, PAL.cream_d, 0.3);
    k.R(x, -15, 5, 6, card); k.H(x, -10, 5, dk(card, 0.15));
    k.H(x, -12, 5, clean ? mix(PAL.red_l, card, 0.4) : mix(PAL.red, card, 0.6));
    k.T(x + 1, -15, letters[i], clean ? PAL.green_d : mix(PAL.green_d, PAL.g3, 0.3));
  }
  if (!clean) { k.clear(43, -10, 5, 2); k.P(44, -11, PAL.g3); k.S(0, -16, 48, 8, 'rgba(40,30,20,0.3)', 0.06); }
  return k.done({ outline: false });
}

// ---- bookshelf_low (2×1) ----------------------------------------------------------------------
const BOOK = [PAL.red_d, PAL.blue_d, PAL.green_d, PAL.mustard, PAL.brown, PAL.velvet, PAL.slate_l, PAL.tan, PAL.denim_d, PAL.cream_d];
export function books(k, x, y, w, h, clean, { lean = 0.15, gaps = 0.08, fallen = 0 } = {}) {
  let cx = x;
  while (cx < x + w) {
    const bw = 1 + (k.r() < 0.35 ? 1 : 0);
    if (k.r() < gaps && cx > x + 1) { cx += 1 + (k.r() < 0.4 ? 1 : 0); continue; }
    const bh = h - k.ri(0, Math.min(3, h - 2));
    let c = BOOK[k.ri(0, BOOK.length - 1)];
    if (!clean) c = mix(c, PAL.g3, 0.3);
    const ww = Math.min(bw, x + w - cx);
    k.R(cx, y + h - bh, ww, bh, c);
    k.P(cx, y + h - bh, lt(c, 0.25));
    if (bh > 4) k.P(cx, y + h - bh + 2, mix(c, PAL.gold, 0.5));
    if (ww > 1) k.V(cx + ww - 1, y + h - bh + 1, bh - 1, dk(c, 0.3));
    cx += ww;
  }
}
function bookshelfLow(o) {
  const { clean } = o;
  const k = new K(36, 30, -2, -15, seedOf('bslow', o.variant, clean));
  const W = woodSet(clean, 'oak');
  k.R(0, -13, 32, 3, W.hi); k.H(0, -13, 32, lt(W.hi, 0.1));
  k.R(0, -10, 32, 22, W.md); k.V(0, -10, 22, W.lt); k.V(31, -10, 22, W.dk);
  k.R(2, -9, 28, 9, PAL.ink); k.R(2, 1, 28, 9, PAL.ink);
  books(k, 2, -9, 28, 9, clean);
  books(k, 2, 1, 28, 9, clean);
  k.H(1, 0, 30, W.lt); k.H(1, 10, 30, W.lt); k.H(0, 11, 32, W.dd);
  if (!clean) {
    // a few textbooks fallen over on the top and on their sides
    k.R(18, -9, 10, 3, mix(PAL.blue_d, PAL.g3, 0.3)); k.H(18, -9, 10, PAL.blue_l); k.R(20, -6, 8, 3, mix(PAL.red_d, PAL.g3, 0.3));
    k.R(4, -16, 9, 3, mix(PAL.green_d, PAL.g3, 0.3)); k.H(4, -16, 9, PAL.green_l); k.V(12, -16, 3, PAL.paper_d);
    k.grime(0, -10, 32, 22, 0.8);
  }
  k.shadow(1, 12, 32, 2);
  return k.done();
}

// ---- globe ------------------------------------------------------------------------------------
function globe(o) {
  const { clean } = o;
  const k = new K(20, 32, -2, -18, seedOf('globe', clean));
  const W = woodSet(clean, 'dark');
  // tripod stand
  k.L(8, 2, 3, 12, W.md); k.L(8, 2, 13, 12, W.dk); k.V(8, 2, 11, W.lt);
  k.P(3, 12, W.dd); k.P(13, 12, W.dd); k.P(8, 13, W.dd);
  k.R(7, -2, 3, 4, W.md); k.H(7, -2, 3, W.hi);
  // meridian ring and sphere
  const sea = clean ? mix(PAL.blue_l, PAL.green_l, 0.35) : mix(mix(PAL.blue_l, PAL.green_l, 0.4), PAL.g4, 0.3);
  const land = clean ? PAL.cream_l : mix(PAL.cream, PAL.tan, 0.35);
  k.E(8, -9, 6, 6, sea);
  k.poly([[4, -12], [7, -13], [8, -10], [6, -7], [5, -9]], land); k.poly([[9, -8], [12, -9], [12, -5], [10, -4]], land);
  k.P(10, -12, land); k.P(11, -13, land);
  // shading: top-left light, bottom-right shade
  k.D(8, -9, 7, 7, dk(sea, 0.35), 0.5); k.P(5, -13, lt(sea, 0.4)); k.P(4, -12, lt(sea, 0.3)); k.P(6, -14, lt(sea, 0.3));
  for (let a = -2.4; a < 0.9; a += 0.08) { const x = Math.round(8 + Math.cos(a) * 7.5), y = Math.round(-9 + Math.sin(a) * 7.5); k.P(x, y, clean ? BRASS.lt : BRASS.md); }
  k.P(12, -15, BRASS.hi); k.P(8, -16, BRASS.dk);
  if (!clean) k.S(2, -15, 12, 12, 'rgba(50,40,30,0.3)', 0.06);
  k.shadow(3, 12, 12, 2);
  return k.done();
}

// ---- projector (overhead on a cart) -----------------------------------------------------------
function projector(o) {
  const { clean } = o;
  const k = new K(20, 38, -2, -24, seedOf('proj', clean));
  const S = steelSet(clean, 'gray');
  const B = clean ? { hi: PAL.cream_l, md: PAL.cream, dk: PAL.cream_d } : { hi: mix(PAL.cream, PAL.g5, 0.4), md: mix(PAL.cream_d, PAL.g4, 0.4), dk: mix(PAL.cream_d, PAL.g3, 0.5) };
  // cart: two shelves, posts, casters
  for (const x of [1, 14]) k.V(x, -6, 18, x < 5 ? S.lt : S.dk);
  k.R(1, -7, 14, 3, S.md); k.H(1, -7, 14, S.hi); k.H(1, -5, 14, S.dk);
  k.R(1, 5, 14, 3, S.md); k.H(1, 5, 14, S.lt); k.H(1, 7, 14, S.dk);
  k.R(3, 3, 6, 2, PAL.g2); k.H(3, 3, 6, PAL.g3); // cord coil / transparencies box
  for (const x of [1, 14]) { k.P(x, 12, PAL.ink); k.P(x, 13, PAL.g1); }
  // projector body + stage glass + arm + head
  k.R(2, -12, 12, 6, B.md); k.H(2, -12, 12, B.hi); k.H(2, -7, 12, B.dk); k.V(13, -11, 4, B.dk);
  k.R(4, -12, 8, 2, mix(PAL.moon, PAL.g4, 0.4)); k.H(4, -12, 3, PAL.moon_l);
  k.V(12, -22, 11, S.lt); k.V(13, -22, 11, S.dk);
  k.R(8, -24, 6, 3, PAL.g2); k.H(8, -24, 6, PAL.g4); k.P(8, -22, PAL.moon);
  k.R(6, -9, 2, 1, PAL.g2);
  if (!clean) { k.grime(1, -12, 14, 20, 0.7); k.S(4, -12, 8, 2, PAL.g4, 0.3); }
  k.shadow(1, 12, 15, 2);
  return k.done();
}

// ---- trash_can --------------------------------------------------------------------------------
function trashCan(o) {
  const { clean } = o;
  const k = new K(18, 22, -1, -8, seedOf('trash', o.variant, clean));
  const S = steelSet(clean, o.variant & 1 ? 'tan' : 'green');
  k.R(3, -3, 10, 13, S.md);
  k.V(3, -3, 13, S.lt); k.V(4, -2, 12, S.hi); k.V(11, -2, 12, S.dk); k.V(12, -3, 13, S.dd);
  for (let x = 6; x < 11; x += 2) k.V(x, -1, 10, dk(S.md, 0.08));
  k.H(3, 9, 10, S.dd);
  k.E(8, -4, 5, 2, S.lt); k.E(8, -4, 4, 1, PAL.ink);
  // crumpled paper inside, one ball spilling over
  k.P(6, -5, PAL.paper); k.P(7, -5, PAL.paper_d); k.P(9, -4, PAL.paper); k.P(10, -5, PAL.g6);
  if (!clean) {
    // dent: lit rim above, shadow below
    k.P(8, 2, S.hi); k.P(9, 2, S.lt); k.P(8, 3, S.dd); k.P(9, 3, S.dk); k.P(10, 3, S.dk);
    k.rust(3, 4, 10, 6, 3);
    k.R(13, 9, 2, 2, PAL.paper_d); k.P(13, 9, PAL.paper);
  }
  k.shadow(3, 9, 11, 2);
  return k.done();
}

// ---- radiator (2×1) ---------------------------------------------------------------------------
function radiator(o) {
  const { clean } = o;
  const k = new K(36, 22, -2, -8, seedOf('rad', o.variant, clean));
  const P = clean ? { hi: PAL.white, lt: PAL.g6, md: PAL.g5, dk: PAL.g4 } : { hi: mix(PAL.cream_l, PAL.g5, 0.3), lt: mix(PAL.cream, PAL.g5, 0.35), md: mix(PAL.cream_d, PAL.g4, 0.4), dk: mix(PAL.g3, PAL.brown, 0.25) };
  // valve + pipe at the left
  k.V(1, 2, 9, PAL.g3); k.R(0, 0, 3, 2, P.dk); k.P(1, -1, clean ? PAL.red : PAL.red_d);
  // sections: rounded columns with gaps
  for (let i = 0; i < 13; i++) {
    const x = 3 + i * 2;
    k.R(x, -4, 2, 14, P.md);
    k.P(x, -4, P.hi); k.V(x, -3, 12, P.lt); k.V(x + 1, -3, 12, P.dk);
    k.P(x + 1, -4, P.lt);
  }
  k.H(3, -1, 26, P.dk); k.H(3, 7, 26, P.dk); // header bands
  k.H(3, 9, 26, PAL.g2);
  for (const x of [4, 27]) k.R(x, 10, 2, 2, PAL.g2);
  if (!clean) {
    // paint peeling to rust, a drip trail, dust on the tops
    k.rust(3, 0, 26, 10, 9);
    for (let i = 0; i < 6; i++) { const x = k.ri(3, 28), y = k.ri(-3, 6); k.P(x, y, mix(P.lt, PAL.white, 0.3)); k.P(x + 1, y, PAL.rust); }
    k.drip(18, 6, 4);
    k.S(3, -4, 26, 1, PAL.g4, 0.4);
  }
  k.shadow(3, 10, 27, 2);
  return k.done();
}

// ---- coat_hooks (2×1 wall) --------------------------------------------------------------------
function coatHooks(o) {
  const { clean } = o;
  const k = new K(32, 22, 0, -12, seedOf('hooks', clean));
  const W = woodSet(clean, 'oak');
  k.R(0, -9, 32, 3, W.md); k.H(0, -9, 32, W.hi); k.H(0, -7, 32, W.dk);
  const I = clean ? PAL.g4 : mix(PAL.g3, PAL.rust, 0.3);
  for (let x = 3; x < 32; x += 6) { k.V(x, -6, 3, I); k.P(x + 1, -4, I); k.P(x - 1, -7, PAL.g5); k.P(x, -8, PAL.g5); }
  // the scarf: a knit stripe hanging in a long loop from the third hook
  const s1 = clean ? PAL.red : mix(PAL.red_d, PAL.g3, 0.3), s2 = clean ? PAL.cream_l : mix(PAL.cream, PAL.g4, 0.35);
  for (let j = 0; j < 14; j++) {
    const c = Math.floor(j / 2) % 2 ? s1 : s2;
    k.R(14 - (j > 9 ? 1 : 0), -5 + j, 2, 1, c); if (j < 10) k.R(17, -5 + j, 2, 1, c);
  }
  k.H(13, 9, 3, s1); k.P(13, 10, s1); k.P(15, 10, s1);
  k.P(16, -5, s1);
  k.shadow(14, 0, 6, 9, 'rgba(6,5,10,0.22)');
  return k.done();
}

export const CLASSROOM = {
  desk_student: { build: deskStudent, variants: 6, facing: ['up', 'left', 'right'] },
  desk_teacher: { build: deskTeacher, variants: 2, facing: ['down', 'up'] },
  chair_teacher: { build: chairTeacher, facing: ['down', 'up', 'left', 'right'] },
  tiny_chair: { build: tinyChair, variants: 4, facing: ['up', 'down', 'left', 'right'] },
  tiny_table: { build: tinyTable, variants: 2 },
  bulletin_board: { build: bulletin },
  flag_us: { build: flagUS },
  poster: { build: poster },
  cubbies: { build: cubbies },
  drawings_wall: { build: drawingsWall },
  alphabet_strip: { build: alphabetStrip },
  bookshelf_low: { build: bookshelfLow, variants: 2 },
  globe: { build: globe },
  projector: { build: projector },
  trash_can: { build: trashCan, variants: 2 },
  radiator: { build: radiator },
  coat_hooks: { build: coatHooks },
};
