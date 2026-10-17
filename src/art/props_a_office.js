// Props A — main office & nurse: counter office_desk office_chair filing_cabinet mailboxes cot
// eye_chart pa_console master_clock portrait_small coat_rack water_cooler plant_dead shelf_med.
import { K, PAL, mix, lt, dk, OUT, SHADOW_SOFT, woodSet, steelSet, CHROME, BRASS, porcelain, seedOf, paper } from './props_a_kit.js';

// ---- counter (3×1): reception counter with a sliding glass window ------------------------------
function counter(o) {
  const { clean } = o;
  const k = new K(52, 46, -2, -32, seedOf('counter', o.variant, clean));
  const W = woodSet(clean, 'oak');
  const top = clean ? { hi: PAL.cream_l, md: mix(PAL.tan_l, PAL.cream, 0.5), dk: PAL.tan } : { hi: mix(PAL.cream, PAL.g5, 0.3), md: mix(PAL.tan, PAL.g4, 0.25), dk: mix(PAL.tan, PAL.g3, 0.45) };
  // glass partition above the counter (aluminium frame, three panes, the middle one slid open)
  const fr = clean ? CHROME : { hi: PAL.g5, lt: PAL.g4, md: PAL.g3, dk: PAL.g2, dd: PAL.g1 };
  const gy = -30, gh = 20;
  for (const [px0, open] of [[1, false], [17, true], [32, false]]) {
    const pw = 15;
    if (!open) k.glass(px0, gy + 1, pw, gh - 1, { clean, seed: px0, streak: mix(PAL.moon, PAL.blue_l, 0.4), faint: mix(PAL.blue_l, PAL.blue_d, 0.5) });
    else { k.R(px0, gy + 1, pw, gh - 1, 'rgba(8,8,14,0.0)'); }
  }
  k.H(0, gy, 48, fr.hi); k.H(0, gy + 1, 48, fr.md);
  for (const x of [0, 16, 31, 47]) { k.V(x, gy, gh, fr.lt); }
  k.V(17, gy + 1, gh - 1, fr.md);
  // the open pane slid behind its neighbour (visible as a doubled frame edge)
  k.V(29, gy + 1, gh - 1, fr.md); k.V(30, gy + 1, gh - 1, fr.dk);
  // counter top + front panel
  k.R(0, -10, 48, 6, top.md); k.H(0, -10, 48, top.hi); k.V(0, -9, 5, top.hi); k.H(0, -5, 48, top.dk);
  k.R(0, -4, 48, 15, W.md);
  for (let x = 1; x < 47; x += 8) { k.frame(x + 1, -2, 6, 11, W.dk); k.H(x + 2, -1, 4, W.lt); k.V(x + 6, -1, 9, W.hi); }
  k.V(0, -4, 15, W.lt); k.V(47, -4, 15, W.dd); k.H(0, 10, 48, W.dd); k.H(0, -4, 48, W.hi);
  // bell, sign-in clipboard, a nameplate, a pen on a chain
  k.R(30, -11, 3, 2, clean ? BRASS.lt : BRASS.md); k.P(31, -12, BRASS.hi); k.H(29, -9, 5, BRASS.dk);
  k.R(8, -10, 7, 5, PAL.wood_d); k.R(9, -9, 5, 4, clean ? PAL.white : PAL.paper); k.H(10, -10, 3, CHROME.lt);
  for (let j = -8; j < -5; j++) k.H(10, j, 3, PAL.g4);
  k.R(38, -11, 6, 2, PAL.wood_d); k.H(39, -11, 4, BRASS.md);
  k.L(16, -8, 20, -7, PAL.g2);
  if (!clean) { k.grime(0, -4, 48, 15, 1); k.S(0, -10, 48, 6, mix(top.md, PAL.g3, 0.5), 0.05); k.L(36, gy + 3, 40, gy + 9, 'rgba(220,230,240,0.45)'); }
  k.shadow(1, 11, 48, 2);
  return k.done();
}

// ---- office_desk (2×1) ------------------------------------------------------------------------
function officeDesk(o) {
  const { clean } = o;
  const k = new K(36, 30, -2, -14, seedOf('odesk', o.dir, o.variant, clean));
  const W = woodSet(clean, 'walnut');
  const WL = woodSet(clean, 'oak');
  k.R(0, -3, 32, 15, W.md); k.V(0, -3, 15, W.lt); k.V(31, -3, 15, W.dd); k.H(0, 11, 32, W.dd);
  if (o.dir === 'up') {
    k.R(11, -1, 10, 12, PAL.ink);
    for (const px0 of [1, 21]) for (let j = 0; j < 3; j++) { k.R(px0, -1 + j * 4, 10, 3, W.md); k.H(px0, -1 + j * 4, 10, W.lt); k.H(px0, 1 + j * 4, 10, W.dk); k.R(px0 + 4, j * 4, 2, 1, BRASS.md); }
  } else {
    for (const px0 of [1, 21]) { k.frame(px0 + 1, -1, 8, 11, W.dk); k.V(px0 + 8, 0, 9, W.lt); }
    k.R(11, -1, 10, 11, W.dk); k.frame(11, -1, 10, 11, W.dd);
  }
  k.wood(0, -11, 32, 8, WL.md, { dark: WL.dk, light: WL.lt });
  k.H(0, -11, 32, WL.hi); k.V(0, -10, 7, WL.hi); k.V(31, -10, 7, WL.dk);
  k.H(0, -3, 32, WL.dk); k.H(0, -4, 32, mix(WL.md, WL.dk, 0.5));
  // blotter + things
  const blot = clean ? PAL.green_d : mix(PAL.green_dd, PAL.g2, 0.3);
  k.R(9, -10, 13, 6, blot); k.V(9, -10, 6, PAL.wood_d); k.V(21, -10, 6, PAL.wood_d);
  paper(k, 12, -9, 6, 4, { clean, lineGap: 1 });
  if (o.variant % 2 === 0) {
    // typewriter (two-tone office gray)
    k.R(23, -12, 8, 6, PAL.g4); k.H(23, -12, 8, PAL.g5); k.R(24, -9, 6, 2, PAL.g1); for (let x = 24; x < 30; x += 1) if (x % 2) k.P(x, -9, PAL.g5);
    k.R(24, -14, 6, 2, clean ? PAL.white : PAL.paper_d); k.H(23, -12, 8, PAL.g3);
  } else {
    // rotary phone, beige
    k.R(24, -10, 6, 4, PAL.cream); k.H(24, -10, 6, PAL.cream_l); k.R(23, -12, 8, 2, PAL.cream_d); k.H(23, -12, 8, PAL.cream);
    k.E(27, -8, 1, 1, PAL.g4); k.P(27, -8, PAL.ink); k.L(30, -7, 33, -3, PAL.g3);
  }
  k.R(2, -10, 5, 4, clean ? PAL.paper : PAL.paper_d); k.H(2, -10, 5, PAL.white); k.H(2, -8, 5, PAL.g5);
  if (!clean) { k.grime(0, -3, 32, 15, 0.8); k.P(4, -6, PAL.paper_d); }
  k.shadow(1, 12, 32, 2);
  return k.done();
}

// ---- office_chair (vinyl, chrome sled base) ---------------------------------------------------
function officeChair(o) {
  const { clean } = o;
  const k = new K(20, 28, -2, -14, seedOf('ochair', o.dir, o.variant, clean));
  const V = [[PAL.brown, PAL.brown_d, PAL.brown_dd], [mix(PAL.red_d, PAL.brown, 0.5), PAL.velvet, PAL.velvet_d], [PAL.green, PAL.green_d, PAL.green_dd]][o.variant % 3];
  const S = clean ? { hi: lt(V[0], 0.15), md: V[0], dk: V[1] } : { hi: mix(V[0], PAL.g4, 0.2), md: mix(V[1], V[0], 0.5), dk: V[2] };
  const C = clean ? CHROME : { hi: PAL.g5, lt: PAL.g4, md: PAL.g3, dk: PAL.g2, dd: PAL.g1 };
  const cracks = (x, y, w, h) => { if (!clean) { k.L(x + 1, y + 1, x + 3, y + 2, mix(S.md, PAL.paper_d, 0.4)); k.P(x + w - 3, y + h - 2, PAL.paper_d); } };
  if (o.dir === 'left' || o.dir === 'right') {
    if (o.dir === 'right') k.mirror(16);
    k.L(3, 11, 13, 11, C.md); k.V(4, 2, 9, C.lt); k.V(12, 2, 9, C.dk);
    k.R(3, -1, 10, 4, S.md); k.H(3, -1, 10, S.hi); k.H(3, 2, 10, S.dk);
    k.R(11, -11, 3, 12, S.md); k.V(11, -11, 12, S.hi); k.V(13, -10, 11, S.dk);
    cracks(3, -1, 10, 4);
    k.shadow(2, 10, 13, 3);
    return k.done();
  }
  // sled legs
  k.V(3, 2, 9, C.lt); k.V(12, 2, 9, C.md); k.H(3, 11, 2, C.dk); k.H(11, 11, 2, C.dk);
  if (o.dir === 'up') {
    k.R(3, -2, 10, 4, S.dk);
    k.R(2, -12, 12, 11, S.md); k.H(2, -12, 12, S.hi); k.V(2, -11, 10, mix(S.md, S.hi, 0.5)); k.V(13, -11, 10, S.dk); k.H(2, -2, 12, S.dk);
    k.V(7, -11, 9, mix(S.md, S.dk, 0.5)); k.H(3, -4, 10, C.lt); k.H(3, -3, 10, C.dk); k.P(4, -4, C.hi); k.P(11, -4, C.hi);
    cracks(2, -12, 12, 11);
  } else {
    k.R(3, -12, 10, 8, S.md); k.H(3, -12, 10, S.hi); k.H(3, -5, 10, S.dk); k.V(3, -11, 6, mix(S.md, S.hi, 0.4));
    k.P(5, -9, S.dk); k.P(10, -9, S.dk); // button tufts
    k.V(2, -6, 5, C.lt); k.V(13, -6, 5, C.md);
    k.R(2, -3, 12, 5, S.md); k.H(2, -3, 12, S.hi); k.H(2, 1, 12, S.dk); k.V(2, -2, 3, mix(S.md, S.hi, 0.5));
    cracks(2, -3, 12, 5);
  }
  k.shadow(2, 10, 13, 3);
  return k.done();
}

// ---- filing_cabinet ---------------------------------------------------------------------------
function filingCabinet(o) {
  const { clean } = o;
  const k = new K(18, 40, -1, -27, seedOf('file', o.variant, clean));
  const S = steelSet(clean, o.variant % 2 ? 'tan' : 'gray');
  k.R(1, -25, 14, 3, S.hi); k.H(1, -25, 14, lt(S.hi, 0.15));
  k.R(1, -22, 14, 29, S.md); k.V(1, -22, 29, S.lt); k.V(14, -22, 29, S.dd); k.H(1, 6, 14, S.dd);
  const open = 1; // the second drawer hangs open
  for (let i = 0; i < 4; i++) {
    const dy = -21 + i * 7;
    if (i === open) continue;
    k.R(2, dy, 12, 6, S.md); k.H(2, dy, 12, S.hi); k.H(2, dy + 5, 12, S.dk); k.V(13, dy, 6, S.dk);
    k.R(5, dy + 1, 6, 2, CHROME.dk); k.R(6, dy + 1, 4, 1, PAL.paper_d); // label holder + card
    k.R(6, dy + 3, 4, 1, CHROME.lt); k.H(6, dy + 4, 4, CHROME.dd);
  }
  // open drawer pulled toward the camera: its top shows hanging folders
  const dy = -21 + open * 7;
  k.R(2, dy, 12, 6, PAL.ink);
  k.R(1, dy + 3, 14, 6, S.md); k.H(1, dy + 3, 14, S.hi); k.H(1, dy + 8, 14, S.dk); k.V(14, dy + 3, 6, S.dd);
  k.R(2, dy - 1, 12, 4, mix(PAL.ink, S.dd, 0.3));
  for (let x = 3; x < 13; x += 2) { k.V(x, dy - 2, 4, x % 4 === 1 ? PAL.mustard : PAL.cream_d); k.P(x, dy - 2, lt(PAL.cream, 0.1)); }
  k.R(6, dy + 4, 4, 1, CHROME.lt); k.R(5, dy + 6, 6, 1, CHROME.dk);
  if (!clean) { k.grime(1, -22, 14, 29, 1); k.rust(1, 2, 14, 5, 3); k.L(3, -15, 5, -14, S.dd); k.P(7, -12, PAL.paper); k.P(8, -13, PAL.paper_d); }
  k.shadow(1, 7, 15, 2);
  return k.done();
}

// ---- mailboxes (3×1 wall) ---------------------------------------------------------------------
function mailboxes(o) {
  const { clean } = o;
  const k = new K(48, 26, 0, -18, seedOf('mail', clean));
  const W = woodSet(clean, 'oak');
  k.R(0, -17, 48, 21, W.md); k.H(0, -17, 48, W.hi); k.V(0, -17, 21, W.lt); k.V(47, -17, 21, W.dd); k.H(0, 3, 48, W.dd);
  for (let r = 0; r < 3; r++) for (let c = 0; c < 6; c++) {
    const x = 2 + c * 7 + (c >= 3 ? 1 : 0), y = -15 + r * 6;
    k.R(x, y, 6, 4, PAL.ink); k.H(x, y, 6, W.dd);
    k.R(x, y + 4, 6, 1, clean ? PAL.paper : PAL.paper_d); k.H(x + 1, y + 4, 3, PAL.g3);
    const fill = (r * 6 + c) % 5;
    if (fill === 1) { k.R(x + 1, y + 1, 4, 3, clean ? PAL.white : PAL.paper); k.H(x + 1, y + 1, 4, PAL.g6); }
    if (fill === 3) { k.R(x + 1, y + 2, 3, 2, PAL.cream_d); k.P(x + 4, y + 1, PAL.paper); }
    if (r === 0 && c === 0) { k.R(x, y + 1, 6, 3, PAL.paper); k.P(x + 5, y, PAL.paper); } // ADAIR: the note sticks out
  }
  if (!clean) k.grime(0, -17, 48, 21, 0.6);
  k.shadow(1, 4, 47, 1, 'rgba(6,5,10,0.35)');
  return k.done({ outline: false });
}

// ---- cot (2×1) --------------------------------------------------------------------------------
function cot(o) {
  const { clean } = o;
  const k = new K(36, 22, -2, -8, seedOf('cot', o.variant, clean));
  const F = clean ? CHROME : { hi: PAL.g4, lt: PAL.g3, md: PAL.g3, dk: PAL.g2, dd: PAL.g1 };
  for (const x of [1, 30]) { k.V(x, 3, 7, F.md); k.P(x, 10, PAL.ink); }
  k.L(2, 9, 29, 9, F.dk);
  // mattress (thin, striped ticking) and the gray blanket thrown over two-thirds
  const mt = clean ? PAL.paper : mix(PAL.paper_d, PAL.cream_d, 0.4);
  k.R(0, -5, 32, 8, mt); k.H(0, -5, 32, lt(mt, 0.12)); k.H(0, 2, 32, dk(mt, 0.25));
  for (let x = 2; x < 32; x += 3) k.V(x, -4, 6, mix(mt, PAL.denim_l, 0.25));
  const bl = clean ? PAL.g4 : mix(PAL.g3, PAL.brown_d, 0.15);
  k.poly([[11, -6], [32, -6], [32, 4], [10, 4], [12, 0]], bl); k.H(12, -6, 20, lt(bl, 0.15));
  k.L(13, -3, 30, -2, dk(bl, 0.25)); k.L(16, 1, 28, 2, dk(bl, 0.25)); k.H(10, 4, 22, dk(bl, 0.35));
  // pillow
  k.R(1, -5, 8, 4, clean ? PAL.white : PAL.paper); k.H(1, -5, 8, PAL.white); k.H(1, -2, 8, PAL.g5);
  k.R(0, 3, 32, 1, F.lt);
  if (!clean) { k.A(4, -3, 6, 4, 'rgba(110,80,40,0.2)'); k.S(0, -5, 32, 8, 'rgba(60,50,40,0.25)', 0.05); }
  k.shadow(1, 10, 32, 2); k.shadow(0, 4, 32, 5, SHADOW_SOFT);
  return k.done();
}

// ---- eye_chart (wall) -------------------------------------------------------------------------
function eyeChart(o) {
  const { clean } = o;
  const k = new K(16, 22, 0, -18, seedOf('eye', clean));
  const p = clean ? PAL.white : mix(PAL.paper, PAL.cream_d, 0.4);
  k.R(3, -17, 10, 17, p); k.V(12, -16, 16, dk(p, 0.12)); k.H(3, -1, 10, dk(p, 0.2));
  k.R(6, -16, 4, 4, PAL.ink); k.R(7, -15, 3, 1, p); k.R(7, -13, 3, 1, p); // the big E
  k.H(5, -10, 2, PAL.ink); k.H(8, -10, 2, PAL.ink);
  k.H(4, -8, 2, PAL.g1); k.H(7, -8, 1, PAL.g1); k.H(9, -8, 2, PAL.g1);
  for (let x = 4; x < 12; x += 2) k.P(x, -6, PAL.g2);
  k.H(4, -6, 1, clean ? PAL.red : PAL.red_d); k.H(4, -6, 8, mix(PAL.g3, p, 0.3));
  for (let x = 4; x < 12; x += 2) k.P(x, -4, PAL.g3);
  for (let x = 5; x < 12; x += 2) k.P(x, -3, PAL.g4);
  k.P(3, -17, 'rgba(230,220,180,0.7)'); k.P(12, -17, 'rgba(230,220,180,0.7)');
  if (!clean) { k.clear(11, -2, 2, 2); k.P(11, -2, lt(p, 0.2)); k.A(3, -10, 5, 9, 'rgba(110,80,40,0.18)'); }
  return k.done({ outline: false });
}

// ---- pa_console (2×1): Rauland intercom on its stand -------------------------------------------
function paConsole(o) {
  const { clean } = o;
  const k = new K(36, 38, -2, -24, seedOf('pa', clean));
  const S = steelSet(clean, 'tan');
  const W = woodSet(clean, 'walnut');
  // stand (a small steel table)
  for (const x of [1, 30]) { k.V(x, -2, 12, S.dk); k.P(x, 10, PAL.ink); }
  k.H(2, 6, 28, S.dk);
  // console cabinet: walnut sides, sloped panel facing the operator (we see its back slope + top)
  k.R(0, -10, 32, 9, W.md); k.V(0, -10, 9, W.lt); k.V(31, -10, 9, W.dd); k.H(0, -2, 32, W.dd);
  k.R(0, -1, 32, 2, S.md); k.H(0, -1, 32, S.hi);
  k.poly([[0, -10], [32, -10], [30, -17], [2, -17]], S.md);
  k.H(2, -17, 28, S.hi); k.H(0, -10, 32, S.lt);
  // VU meter, toggle rows, room-name strip, red power LED
  k.R(3, -16, 7, 5, PAL.cream_l); k.frame(3, -16, 7, 5, PAL.g2); k.L(6, -12, 8, -15, PAL.ink); k.H(4, -15, 5, mix(PAL.cream_l, PAL.g4, 0.4)); k.P(8, -15, PAL.red);
  for (let r = 0; r < 2; r++) for (let c = 0; c < 8; c++) {
    const x = 12 + c * 2, y = -16 + r * 3;
    k.P(x, y, CHROME.hi); k.P(x, y + 1, PAL.ink); k.P(x + 1, y + 1, PAL.g2);
  }
  k.H(12, -11, 16, clean ? PAL.paper : PAL.paper_d); for (let x = 12; x < 28; x += 2) k.P(x, -11, PAL.g3);
  k.P(29, -15, PAL.exit_red); k.P(29, -16, '#ff8a72'); k.P(30, -15, PAL.red_d);
  // gooseneck microphone
  k.L(25, -18, 24, -21, PAL.g3); k.L(24, -21, 21, -22, PAL.g3); k.R(18, -23, 4, 2, PAL.g1); k.H(18, -23, 4, PAL.g4); k.R(24, -18, 3, 1, PAL.g2);
  if (!clean) { k.S(0, -17, 32, 7, mix(S.md, PAL.g3, 0.5), 0.06); k.grime(0, -10, 32, 9, 0.8); }
  k.shadow(1, 10, 31, 2);
  return k.done();
}

// ---- master_clock: tall bell-program cabinet ---------------------------------------------------
function masterClock(o) {
  const { clean } = o;
  const k = new K(18, 52, -1, -38, seedOf('master', clean));
  const W = woodSet(clean, 'walnut');
  k.R(1, -36, 14, 3, W.lt); k.H(1, -36, 14, W.hi); k.R(0, -37, 16, 1, W.md); k.P(7, -38, W.hi); k.P(8, -38, W.lt);
  k.R(1, -33, 14, 41, W.md); k.V(1, -33, 41, W.lt); k.V(14, -33, 41, W.dd); k.H(1, 7, 14, PAL.ink);
  // dial
  k.E(8, -27, 5, 5, BRASS.dk); k.E(8, -27, 4, 4, clean ? PAL.white : PAL.paper);
  for (let i = 0; i < 12; i++) { const a = (i / 12) * Math.PI * 2; k.P(Math.round(8 + Math.sin(a) * 3.4), Math.round(-27 - Math.cos(a) * 3.4), i % 3 ? PAL.g4 : PAL.ink); }
  k.L(8, -27, 8, -30, PAL.ink); k.L(8, -27, 10, -26, PAL.ink); // 1:45 forever
  // pendulum window: glass, brass bob
  k.R(4, -20, 8, 16, PAL.ink); k.frame(3, -21, 10, 18, W.dk);
  k.V(8, -20, 11, BRASS.md); k.E(8, -8, 2, 2, clean ? BRASS.lt : BRASS.md); k.P(7, -9, BRASS.hi);
  k.L(5, -19, 7, -16, 'rgba(196,212,230,0.55)'); k.P(10, -7, 'rgba(196,212,230,0.4)');
  // program drum door + bell wire
  k.frame(3, -2, 10, 8, W.dk); k.H(4, -1, 8, W.hi); k.P(11, 2, BRASS.lt);
  k.V(15, -30, 30, PAL.g2);
  if (!clean) { k.grime(1, -33, 14, 41, 0.8); k.S(1, -36, 14, 3, PAL.g4, 0.25); }
  k.shadow(1, 8, 15, 2);
  return k.done();
}

// ---- portrait_small (wall, closed/open → wall safe) ---------------------------------------------
function portraitSmall(o) {
  const { state, clean } = o;
  const k = new K(20, 22, -2, -18, seedOf('psmall', state, clean));
  const g = clean ? [PAL.gold_l, PAL.gold, PAL.brass] : [mix(PAL.gold, PAL.g5, 0.25), PAL.brass, PAL.brass_d];
  const v = (c) => (clean ? c : mix(c, PAL.amber_dd, 0.22));
  const paint = (x) => {
    k.R(x, -16, 12, 14, g[1]); k.H(x, -16, 12, g[0]); k.V(x, -16, 14, g[0]); k.H(x, -3, 12, g[2]); k.V(x + 11, -16, 14, g[2]);
    k.R(x + 2, -14, 8, 10, v(PAL.brown_dd)); k.E(x + 6, -10, 3, 3, v(PAL.brown_d));
    // head and shoulders: navy mass, tiny face with gray chops, a slash of crimson
    k.E(x + 6, -5, 4, 2, v(PAL.navy)); k.R(x + 2, -6, 8, 2, v(PAL.navy)); k.P(x + 3, -6, v(PAL.navy_l)); k.P(x + 4, -7, v(PAL.navy_l));
    k.R(x + 5, -10, 3, 3, v(PAL.flesh)); k.P(x + 5, -10, v(PAL.flesh_l)); k.P(x + 4, -9, v(PAL.hair_g_l)); k.P(x + 8, -9, v(PAL.hair_g)); k.H(x + 5, -11, 3, v(PAL.hair_g));
    k.P(x + 5, -9, v(PAL.flesh_dd)); k.P(x + 7, -9, v(PAL.flesh_dd));
    k.L(x + 3, -6, x + 8, -4, v(PAL.crimson)); k.P(x + 4, -7, v(PAL.gold)); k.P(x + 8, -7, v(PAL.gold));
  };
  if (state === 'open') {
    // the portrait swung out on its hinges (seen edge-on at the left), the gray safe behind
    const sf = clean ? steelSet(true, 'gray') : steelSet(false, 'gray');
    k.R(2, -16, 12, 14, PAL.g1); k.frame(2, -16, 12, 14, PAL.ink);
    k.R(3, -15, 10, 12, sf.md); k.H(3, -15, 10, sf.hi); k.V(3, -15, 12, sf.lt); k.V(12, -15, 12, sf.dk); k.H(3, -4, 10, sf.dd);
    k.E(8, -10, 2, 2, PAL.g2); k.P(8, -10, PAL.g5); k.P(7, -11, PAL.g4); k.R(10, -8, 2, 1, CHROME.lt);
    k.poly([[2, -16], [-1, -14], [-1, -1], [2, -3]], g[2]); k.L(2, -16, -1, -14, g[0]); k.V(-1, -14, 13, g[1]);
    return k.done({ outline: false });
  }
  paint(2);
  if (!clean) k.S(4, -14, 8, 10, 'rgba(200,180,140,0.18)', 0.05);
  k.shadow(3, -2, 12, 1, 'rgba(6,5,10,0.35)');
  return k.done({ outline: false });
}

// ---- coat_rack (bentwood) ---------------------------------------------------------------------
function coatRack(o) {
  const { clean } = o;
  const k = new K(20, 50, -2, -36, seedOf('rack', clean));
  const W = woodSet(clean, 'dark');
  // splayed feet, pole, crown of curled hooks
  k.L(8, 9, 3, 12, W.md); k.L(8, 9, 13, 12, W.dk); k.L(8, 9, 6, 13, W.md); k.L(8, 9, 10, 13, W.dk);
  k.V(7, -32, 42, W.md); k.V(8, -32, 42, W.dk); k.V(7, -32, 42, W.lt);
  k.R(6, -34, 4, 2, W.lt); k.P(7, -35, W.hi);
  for (const [dx, dir] of [[-4, -1], [4, 1]]) { k.L(8, -30, 8 + dx, -28, W.md); k.P(8 + dx + dir, -29, W.md); k.P(8 + dx + dir, -30, W.lt); }
  k.H(5, -2, 6, W.dk); k.P(5, -3, W.md); k.P(10, -3, W.md); // umbrella ring
  // one raincoat hanging from the right hook: tan trench, belt, collar
  const rc = clean ? PAL.tan : mix(PAL.tan, PAL.g3, 0.35), rcd = clean ? PAL.brown : mix(PAL.brown, PAL.g2, 0.3), rcl = clean ? PAL.tan_l : mix(PAL.tan_l, PAL.g4, 0.35);
  k.poly([[10, -29], [14, -27], [15, -10], [13, -6], [9, -6], [8, -12], [8, -27]], rc);
  k.L(10, -29, 14, -27, rcl); k.V(9, -26, 18, rcl); k.H(8, -17, 7, rcd); k.P(12, -16, BRASS.dk);
  k.L(12, -25, 13, -8, rcd); k.H(9, -6, 5, dk(rcd, 0.2));
  k.shadow(3, 12, 11, 2);
  return k.done();
}

// ---- water_cooler -----------------------------------------------------------------------------
function waterCooler(o) {
  const { clean } = o;
  const k = new K(18, 44, -1, -32, seedOf('cooler', clean));
  const S = clean ? { hi: PAL.white, lt: PAL.cream_l, md: PAL.cream, dk: PAL.cream_d } : { hi: mix(PAL.cream_l, PAL.g5, 0.3), lt: mix(PAL.cream, PAL.g5, 0.3), md: mix(PAL.cream_d, PAL.g4, 0.35), dk: mix(PAL.cream_d, PAL.g3, 0.5) };
  k.R(3, -14, 10, 22, S.md); k.V(3, -14, 22, S.lt); k.V(12, -14, 22, S.dk); k.H(3, 7, 10, PAL.g2);
  k.R(3, -16, 10, 2, S.hi);
  k.R(5, -11, 6, 3, PAL.g2); k.P(6, -11, CHROME.hi); k.P(9, -11, clean ? PAL.blue_l : PAL.blue); k.P(6, -10, clean ? PAL.red_l : PAL.red_d);
  for (let j = 0; j < 4; j++) k.H(5, 0 + j * 2, 6, S.dk); // grille
  // the jug: pale blue glass, empty, cloudy, a ring of scale
  const gl = clean ? mix(PAL.moon_l, PAL.denim_ll, 0.5) : mix(PAL.moon, PAL.g4, 0.4);
  k.R(4, -27, 8, 10, gl); k.R(5, -28, 6, 1, gl); k.R(6, -30, 4, 2, mix(gl, PAL.blue_l, 0.3)); k.R(6, -17, 4, 1, mix(gl, PAL.blue_l, 0.3));
  k.H(4, -23, 8, mix(gl, PAL.white, 0.25)); k.H(4, -21, 8, mix(gl, PAL.blue_l, 0.25));
  k.V(5, -26, 7, PAL.white); k.V(11, -26, 8, mix(gl, PAL.blue_d, 0.4));
  if (clean) { k.R(5, -24, 6, 6, mix(PAL.blue_l, PAL.moon, 0.5)); k.H(5, -24, 6, PAL.moon_l); }
  else { k.S(4, -27, 8, 10, PAL.g5, 0.12); k.H(5, -19, 6, mix(gl, PAL.cream_d, 0.5)); k.grime(3, -14, 10, 22, 1); }
  k.shadow(3, 8, 11, 2);
  return k.done();
}

// ---- plant_dead -------------------------------------------------------------------------------
function plantDead(o) {
  const { clean } = o;
  const k = new K(20, 32, -2, -20, seedOf('plant', o.variant, clean));
  const pot = clean ? [PAL.tan_l, PAL.rust, PAL.brown] : [mix(PAL.tan, PAL.g4, 0.3), mix(PAL.rust, PAL.brown_d, 0.35), PAL.brown_d];
  k.poly([[3, -3], [13, -3], [12, 8], [4, 8]], pot[1]); k.R(2, -5, 12, 2, pot[0]); k.H(2, -5, 12, lt(pot[0], 0.2)); k.V(4, -2, 9, lt(pot[1], 0.15)); k.L(13, -3, 12, 8, pot[2]);
  k.H(3, -4, 10, PAL.brown_dd);
  if (clean) {
    // 1979: a healthy rubber plant
    const g = [PAL.green_l, PAL.green, PAL.green_d];
    k.V(8, -18, 14, PAL.green_d);
    for (const [x, y, d] of [[4, -10, -1], [11, -12, 1], [5, -15, -1], [10, -17, 1], [8, -19, 0]]) { k.E(x, y, 2, 1, g[1]); k.P(x - d, y - 1, g[0]); k.P(x + d, y + 1, g[2]); }
  } else {
    // dead: brittle brown stalks bent over, curled leaves dropped on the soil and floor
    const st = mix(PAL.brown, PAL.g3, 0.3), lf = mix(PAL.tan, PAL.brown, 0.4);
    k.L(8, -5, 7, -16, st); k.L(7, -16, 4, -18, st); k.L(9, -5, 11, -13, st); k.L(11, -13, 14, -12, st); k.L(8, -5, 5, -9, st);
    for (const [x, y] of [[3, -18], [14, -11], [4, -9], [12, -13]]) { k.P(x, y, lf); k.P(x + 1, y + 1, PAL.brown_d); }
    k.P(5, -4, lf); k.P(10, -4, PAL.brown_d); k.P(15, 7, lf); k.P(1, 8, PAL.brown_d);
  }
  k.shadow(3, 8, 11, 2);
  return k.done();
}

// ---- shelf_med (2×1): nurse's shelf ------------------------------------------------------------
function shelfMed(o) {
  const { clean } = o;
  const k = new K(36, 42, -2, -30, seedOf('med', clean));
  const S = clean ? { hi: PAL.white, lt: PAL.g6, md: PAL.g5, dk: PAL.g4 } : { hi: mix(PAL.cream_l, PAL.g5, 0.3), lt: mix(PAL.cream, PAL.g5, 0.3), md: mix(PAL.cream_d, PAL.g4, 0.4), dk: PAL.g3 };
  k.R(0, -28, 32, 2, S.hi);
  k.R(0, -26, 32, 34, S.md); k.V(0, -26, 34, S.lt); k.V(31, -26, 34, S.dk); k.H(0, 7, 32, PAL.g2);
  const shelves = [-25, -15, -5];
  for (const sy of shelves) { k.R(1, sy, 30, 9, mix(S.dk, PAL.ink, 0.45)); k.H(1, sy + 9, 30, S.hi); }
  // top shelf: gauze rolls, boxes, brown bottles
  const s1 = shelves[0] + 9;
  k.R(2, s1 - 5, 4, 5, PAL.white); k.H(2, s1 - 5, 4, PAL.g6); k.R(7, s1 - 4, 4, 4, PAL.white); k.V(9, s1 - 4, 4, PAL.g6);
  k.R(13, s1 - 6, 6, 6, clean ? PAL.denim_l : mix(PAL.denim_l, PAL.g4, 0.4)); k.H(13, s1 - 6, 6, PAL.white);
  for (const bx of [21, 24, 27]) { k.R(bx, s1 - 5, 2, 5, PAL.brown); k.P(bx, s1 - 6, PAL.g2); k.P(bx, s1 - 4, PAL.tan_l); }
  // middle shelf: the jar of cicada shells, BROOD II — 1979
  const s2 = shelves[1] + 9;
  const jar = clean ? 'rgba(196,212,230,0.35)' : 'rgba(170,180,170,0.30)';
  k.R(9, s2 - 8, 8, 8, PAL.ink); k.R(9, s2 - 9, 8, 1, PAL.g4); k.R(10, s2 - 10, 6, 1, PAL.g3);
  for (const [x, y] of [[10, -1], [12, -2], [14, -1], [11, -3], [13, -4], [15, -3], [10, -5], [12, -6]]) { k.P(x, s2 + y, PAL.amber_l); k.P(x + 1, s2 + y, PAL.amber); k.P(x, s2 + y + 1, PAL.amber_d); }
  k.A(9, s2 - 8, 8, 8, jar); k.V(10, s2 - 8, 6, 'rgba(230,236,240,0.45)');
  k.R(10, s2 - 5, 6, 2, PAL.paper); k.H(11, s2 - 4, 4, PAL.g2);
  k.R(2, s2 - 4, 5, 4, PAL.cream_l); k.H(3, s2 - 3, 3, PAL.red_l); k.V(4, s2 - 4, 3, PAL.red_l); // first-aid tin
  k.R(20, s2 - 7, 9, 7, clean ? PAL.paper : PAL.paper_d); k.H(20, s2 - 7, 9, PAL.white); k.H(21, s2 - 4, 7, PAL.g4);
  // bottom: towels, a basin
  const s3 = shelves[2] + 9;
  k.R(2, s3 - 4, 10, 4, PAL.g6); k.H(2, s3 - 4, 10, PAL.white); k.H(2, s3 - 2, 10, PAL.g5);
  k.R(16, s3 - 3, 10, 3, PAL.g5); k.H(16, s3 - 3, 10, PAL.white);
  if (!clean) { k.grime(0, -26, 32, 34, 0.6); k.S(1, -25, 30, 30, 'rgba(150,140,120,0.15)', 0.04); }
  k.shadow(1, 8, 32, 2);
  return k.done();
}

export const OFFICE = {
  counter: { build: counter },
  office_desk: { build: officeDesk, variants: 2, facing: ['down', 'up'] },
  office_chair: { build: officeChair, variants: 3, facing: ['down', 'up', 'left', 'right'] },
  filing_cabinet: { build: filingCabinet, variants: 2 },
  mailboxes: { build: mailboxes },
  cot: { build: cot },
  eye_chart: { build: eyeChart },
  pa_console: { build: paConsole },
  master_clock: { build: masterClock },
  portrait_small: { build: portraitSmall },
  coat_rack: { build: coatRack },
  water_cooler: { build: waterCooler },
  plant_dead: { build: plantDead },
  shelf_med: { build: shelfMed },
};
