// Props A — hallway & lobby: locker water_fountain trophy_case fire_extinguisher exit_sign bench
// portrait_colonel plaque banner motto_stone. (memorial_board / clock_hall: props_a_dynamic.js.)
import { K, PAL, mix, lt, dk, OUT, SHADOW_SOFT, woodSet, steelSet, CHROME, BRASS, porcelain, seedOf, paper, textW } from './props_a_kit.js';

// ---- locker -----------------------------------------------------------------------------------
// One tall olive locker standing against a north-wall face; a row of them reads as one bank.
function locker(o) {
  const { state, clean, variant: v } = o;
  const k = new K(26, 42, -8, -31, seedOf('locker', state, v, clean));
  const S = steelSet(clean, 'olive');
  const top = -28, fy = -25, by = 5;
  // cabinet: top face, side seams, base
  k.R(0, top, 16, 3, mix(S.lt, PAL.g5, 0.2)); k.H(0, top, 16, S.hi);
  k.R(0, fy, 16, by - fy + 1, S.md);
  k.V(0, fy, by - fy + 1, S.dd); k.V(15, fy, by - fy + 1, S.dd); k.V(1, fy, by - fy, S.lt);
  k.R(1, 2, 14, 4, S.dk); k.H(1, 2, 14, S.dd); k.H(1, 5, 14, PAL.ink);
  if (!clean) { k.S(0, top, 16, 3, PAL.g4, 0.25); }
  const doorX = 2, doorW = 12, doorY = fy + 1, doorH = 26;
  if (state === 'open') {
    // dark interior: hat shelf, coat hook, a forgotten jacket and books
    k.R(doorX, doorY, doorW, doorH, PAL.ink);
    k.R(doorX, doorY, doorW, 2, mix(S.dd, PAL.ink, 0.4));
    k.H(doorX, doorY + 6, doorW, S.dk); k.H(doorX, doorY + 7, doorW, PAL.g1);
    k.P(doorX + 6, doorY + 9, PAL.g3);
    const jk = v % 2 ? mix(PAL.denim_d, PAL.g2, 0.3) : mix(PAL.green_d, PAL.brown_d, 0.4);
    k.R(doorX + 3, doorY + 10, 7, 9, jk); k.V(doorX + 3, doorY + 10, 9, lt(jk, 0.12)); k.P(doorX + 6, doorY + 10, PAL.g3);
    k.R(doorX + 2, doorY + 22, 8, 3, mix(PAL.red_d, PAL.g2, 0.3)); k.H(doorX + 2, doorY + 22, 8, PAL.paper_d);
    // the door swung ~120°: we see its inside face, foreshortened, hanging off the hinge side
    const iF = dk(S.md, 0.18);
    k.poly([[1, doorY], [-6, doorY + 10], [-6, doorY + doorH + 10], [1, doorY + doorH]], iF);
    k.L(1, doorY, -6, doorY + 10, S.lt);
    k.L(-6, doorY + 10, -6, doorY + doorH + 9, S.dk);
    for (let j = 0; j < 4; j++) k.L(-1, doorY + 6 + j * 2 + 1, -4, doorY + 6 + j * 2 + 3, S.dd);
    paper(k, -4, doorY + 16, 3, 5, { clean, lines: null });
    k.shadow(-6, by + 2, 8, 3, SHADOW_SOFT);
  } else {
    // door: hinge knuckles, louvres top and bottom, number plate, lift handle
    k.R(doorX, doorY, doorW, doorH, S.md);
    k.H(doorX, doorY, doorW, S.hi); k.V(doorX, doorY, doorH, S.lt); k.V(doorX + doorW - 1, doorY, doorH, S.dk);
    for (const hy of [doorY + 3, doorY + 13, doorY + 22]) k.P(doorX, hy, S.hi);
    for (let j = 0; j < 3; j++) { k.H(doorX + 3, doorY + 5 + j * 2, 6, PAL.ink); k.H(doorX + 3, doorY + 6 + j * 2, 6, S.hi); }
    for (let j = 0; j < 3; j++) { k.H(doorX + 3, doorY + 19 + j * 2, 6, PAL.ink); k.H(doorX + 3, doorY + 20 + j * 2, 6, S.lt); }
    k.H(doorX + 1, doorY + 12, doorW - 2, mix(S.md, S.hi, 0.3)); k.H(doorX + 1, doorY + 13, doorW - 2, mix(S.md, S.dk, 0.4));
    k.R(doorX + 4, doorY + 2, 4, 2, clean ? BRASS.lt : BRASS.dk); k.P(doorX + 5, doorY + 2, PAL.ink); k.P(doorX + 6, doorY + 3, PAL.ink);
    k.R(doorX + 9, doorY + 14, 2, 4, CHROME.dk); k.V(doorX + 9, doorY + 14, 4, CHROME.lt); k.P(doorX + 10, doorY + 17, CHROME.hi);
    if (!clean) {
      if (v === 1) { // rust and peeling paint
        k.R(doorX + 1, doorY + 12, 3, 4, mix(PAL.g4, S.md, 0.4)); k.P(doorX + 3, doorY + 15, PAL.g5);
        k.rust(doorX, doorY + 16, doorW, 10, 7); k.drip(doorX + 8, doorY + 18, 7);
      }
      if (v === 2) { // period stickers: smiley, a rainbow, a star
        const f = (c) => mix(c, PAL.paper_d, 0.35);
        k.R(doorX + 2, doorY + 15, 3, 3, f(PAL.yellow)); k.P(doorX + 2, doorY + 16, f(PAL.mustard)); k.P(doorX + 3, doorY + 16, PAL.ink); k.P(doorX + 4, doorY + 16, f(PAL.mustard)); k.P(doorX + 3, doorY + 17, PAL.mustard_d);
        k.H(doorX + 5, doorY + 1, 4, f(PAL.red_l)); k.H(doorX + 5, doorY + 2, 4, f(PAL.yellow)); k.H(doorX + 5, doorY + 3, 4, f(PAL.denim_l));
        k.P(doorX + 6, doorY + 16, f(PAL.white)); k.H(doorX + 5, doorY + 17, 3, f(PAL.white)); k.P(doorX + 6, doorY + 18, f(PAL.white));
      }
      if (v === 3) { // masking-tape name label
        k.R(doorX + 2, doorY + 1, 7, 3, PAL.cream_l); k.H(doorX + 3, doorY + 2, 5, PAL.g2); k.P(doorX + 8, doorY + 3, PAL.cream_d);
      }
      if (v === 0) { k.L(doorX + 3, doorY + 14, doorX + 6, doorY + 16, mix(S.md, PAL.g5, 0.4)); }
      k.grime(doorX, doorY, doorW, doorH, 1);
      k.rust(1, 2, 14, 4, 2);
    }
    if (state === 'dented') {
      // a fist-sized crumple: lit rims on the upper-left, deep shadow in the fold; door sprung ajar
      k.P(doorX + 4, doorY + 9, S.hi); k.P(doorX + 5, doorY + 8, S.hi); k.H(doorX + 6, doorY + 8, 2, S.lt);
      k.R(doorX + 4, doorY + 10, 5, 3, S.dk); k.H(doorX + 5, doorY + 11, 3, S.dd); k.P(doorX + 6, doorY + 12, PAL.ink);
      k.P(doorX + 8, doorY + 13, S.hi); k.P(doorX + 3, doorY + 11, S.lt);
      k.V(doorX + doorW, doorY, doorH, PAL.ink); k.R(doorX + 8, doorY + 14, 3, 2, CHROME.dk);
    }
  }
  k.shadow(0, by + 1, 16, 2); k.shadow(1, by + 3, 15, 1, SHADOW_SOFT);
  return k.done();
}

// ---- water_fountain ---------------------------------------------------------------------------
function waterFountain(o) {
  const { clean } = o;
  const k = new K(18, 28, -1, -22, seedOf('fountain', clean));
  const P = porcelain(clean);
  // back splash plate on the wall
  k.R(3, -20, 10, 9, P.md); k.H(3, -20, 10, P.hi); k.V(3, -20, 9, P.lt); k.V(12, -20, 9, P.dk);
  // basin: top rim, bowl, curved apron
  k.R(2, -12, 12, 5, P.lt); k.H(2, -12, 12, P.hi); k.V(2, -11, 4, P.hi);
  k.R(4, -11, 8, 3, P.dk); k.H(4, -11, 8, P.dd); k.P(8, -9, PAL.g2);
  k.poly([[2, -7], [14, -7], [12, -2], [4, -2]], P.md); k.H(2, -7, 12, P.lt); k.L(13, -7, 11, -2, P.dk);
  // bubbler + push button
  k.R(9, -13, 2, 2, CHROME.lt); k.P(9, -13, CHROME.hi); k.P(10, -12, CHROME.dk);
  k.R(13, -10, 2, 2, CHROME.md); k.P(13, -10, CHROME.hi);
  // drain pipe + trap to the wall
  k.V(7, -2, 6, CHROME.dk); k.V(8, -2, 6, CHROME.md); k.H(7, 4, 3, CHROME.dk); k.P(9, 3, CHROME.lt);
  if (!clean) {
    // the rust stain "like a tongue" down from the bubbler, crazing, a chip
    const r1 = mix(PAL.rust, P.md, 0.35), r2 = mix(PAL.brown_d, P.md, 0.3);
    k.V(9, -11, 2, r2); k.R(8, -9, 2, 2, r1); k.V(8, -7, 3, r1); k.V(9, -7, 4, r2); k.P(8, -4, r1);
    k.L(4, -18, 6, -15, mix(P.md, PAL.g3, 0.5)); k.P(2, -8, PAL.g3);
    k.S(3, -20, 10, 9, mix(P.md, PAL.cream_d, 0.6), 0.1);
  }
  k.shadow(3, -1, 11, 2, SHADOW_SOFT); k.shadow(6, 4, 5, 1, SHADOW_SOFT);
  return k.done();
}

// ---- trophy_case (3×1, reflective) ------------------------------------------------------------
function trophy(k, x, y, kind, clean, i) {
  const g = clean ? [PAL.gold_l, PAL.gold, PAL.brass] : [mix(PAL.gold, PAL.g5, 0.3), mix(PAL.brass, PAL.g3, 0.3), mix(PAL.brass_d, PAL.green_d, 0.3)];
  const base = clean ? PAL.wood : PAL.wood_d;
  if (kind === 0) { // loving cup
    k.R(x, y, 5, 3, g[1]); k.P(x, y, g[0]); k.P(x + 1, y, g[0]); k.P(x - 1, y, g[2]); k.P(x + 5, y, g[2]);
    k.P(x - 1, y + 1, g[2]); k.P(x + 5, y + 1, g[2]); k.V(x + 2, y + 3, 2, g[1]); k.R(x + 1, y + 5, 3, 2, base); k.H(x + 1, y + 5, 3, lt(base, 0.2));
    if (!clean && i % 2) k.P(x + 3, y + 1, mix(PAL.mint, g[2], 0.4));
  } else if (kind === 1) { // figure on a column
    k.P(x + 1, y, g[0]); k.V(x + 1, y + 1, 2, g[1]); k.P(x, y + 1, g[1]); k.P(x + 2, y + 2, g[2]);
    k.R(x, y + 3, 3, 3, mix(PAL.white, PAL.g5, clean ? 0 : 0.4)); k.R(x - 1, y + 6, 5, 1, base);
  } else if (kind === 2) { // football
    k.R(x, y + 4, 4, 2, PAL.brown); k.H(x + 1, y + 3, 2, PAL.brown); k.H(x + 1, y + 6, 2, PAL.brown_d); k.P(x + 1, y + 4, PAL.white);
  } else { // plaque standing
    k.R(x, y + 1, 4, 6, base); k.R(x + 1, y + 2, 2, 3, g[1]); k.P(x + 1, y + 2, g[0]);
  }
}
function trophyCase(o) {
  const { clean } = o;
  const k = new K(52, 42, -2, -30, seedOf('trophy', o.variant, clean));
  const W = woodSet(clean, 'oak');
  // carcass: top, sides, lower cupboard
  k.R(0, -28, 48, 3, W.hi); k.H(0, -28, 48, lt(W.hi, 0.12)); k.H(0, -26, 48, W.lt);
  k.R(0, -25, 48, 35, W.md); k.V(0, -25, 35, W.lt); k.V(47, -25, 35, W.dk);
  // display: back felt, glass shelves, trophies
  const gx = 2, gy = -24, gw = 44, gh = 22;
  const felt = clean ? mix(PAL.green_d, PAL.blue_dd, 0.3) : mix(PAL.green_dd, PAL.shadow, 0.4);
  k.R(gx, gy, gw, gh, felt);
  k.R(gx, gy, gw, 3, mix(felt, PAL.ink, 0.5));
  // district pennant, 1978
  const pg = clean ? PAL.green : mix(PAL.green, PAL.g3, 0.3), py = clean ? PAL.yellow : mix(PAL.yellow, PAL.g4, 0.4);
  k.poly([[gx + 15, gy + 3], [gx + 31, gy + 3], [gx + 23, gy + 7]], pg); k.H(gx + 15, gy + 3, 16, py); k.H(gx + 19, gy + 4, 8, py);
  for (const sy of [gy + 9, gy + 16]) { k.H(gx, sy, gw, mix(PAL.moon, felt, 0.5)); k.H(gx, sy + 1, gw, mix(felt, PAL.ink, 0.4)); }
  const row1 = [[3, 0], [11, 1], [17, 0], [27, 3], [33, 1], [39, 0]], row2 = [[4, 2], [10, 0], [19, 1], [25, 0], [34, 3], [40, 1]];
  row1.forEach(([tx, kd], i) => trophy(k, gx + tx, gy + 2 + (kd === 1 ? 0 : 0), kd, clean, i));
  row2.forEach(([tx, kd], i) => trophy(k, gx + tx, gy + 10 - 1, kd, clean, i + 3));
  row2.length && trophy(k, gx + 30, gy + 15, 0, clean, 9);
  if (!clean) { // one fallen over, dust on the shelves
    k.R(gx + 22, gy + 14, 5, 2, mix(PAL.brass_d, PAL.g3, 0.3)); k.P(gx + 21, gy + 14, PAL.brass_d);
    k.S(gx, gy + 8, gw, 1, PAL.g4, 0.4); k.S(gx, gy + 15, gw, 1, PAL.g4, 0.4);
  }
  // glass: cold reflections over everything (reads as glass in the dark)
  k.A(gx, gy, gw, gh, 'rgba(120,150,190,0.10)');
  for (const [sx, wide] of [[gx + 6, 3], [gx + 26, 2], [gx + 37, 1]]) {
    for (let j = 0; j < gh; j++) { const x = sx + Math.floor((gh - j) * 0.45); for (let w = 0; w < wide; w++) if (x + w < gx + gw && x + w >= gx) k.P(x + w, gy + j, w === 0 ? 'rgba(196,212,230,0.55)' : 'rgba(151,175,203,0.35)'); }
  }
  k.H(gx, gy, gw, 'rgba(196,212,230,0.6)');
  // frame mullions
  k.V(gx + 21, gy, gh, W.dk); k.V(gx + 22, gy, gh, W.lt);
  k.H(gx - 1, gy + gh, gw + 2, W.dk);
  if (!clean) { k.L(gx + 30, gy + 2, gx + 36, gy + 8, 'rgba(220,230,240,0.5)'); k.L(gx + 33, gy + 5, gx + 35, gy + 11, 'rgba(220,230,240,0.35)'); }
  // lower cupboard doors
  for (const dx of [2, 25]) { k.R(dx, 0, 21, 8, W.md); k.frame(dx, 0, 21, 8, W.dk); k.H(dx + 1, 1, 19, W.hi); k.P(dx + (dx < 10 ? 19 : 1), 4, BRASS.lt); }
  k.H(0, 9, 48, W.dd); k.H(0, 10, 48, PAL.ink);
  if (!clean) k.grime(0, -25, 48, 35, 0.6);
  k.shadow(1, 11, 48, 2);
  return k.done();
}

// ---- fire_extinguisher (wall cabinet) ---------------------------------------------------------
function fireExtinguisher(o) {
  const { clean } = o;
  const k = new K(16, 22, 0, -18, seedOf('fext', clean));
  const fr = clean ? CHROME : { hi: PAL.g5, lt: PAL.g4, md: PAL.g3, dk: PAL.g2, dd: PAL.g1 };
  k.R(3, -16, 10, 17, fr.md); k.H(3, -16, 10, fr.hi); k.V(3, -16, 17, fr.lt); k.V(12, -16, 17, fr.dk); k.H(3, 0, 10, fr.dd);
  k.R(4, -15, 8, 15, PAL.ink);
  const red = clean ? PAL.red : mix(PAL.red_d, PAL.brown, 0.25), redl = clean ? PAL.red_l : PAL.red;
  k.R(6, -10, 4, 9, red); k.V(6, -10, 9, redl); k.V(9, -10, 9, PAL.blood_d); k.H(6, -11, 4, redl);
  k.R(7, -13, 2, 2, PAL.g2); k.H(6, -14, 4, CHROME.lt); k.P(9, -13, CHROME.md);
  k.V(10, -12, 6, PAL.ink); k.P(7, -7, PAL.paper); k.P(8, -7, PAL.g4);
  // glass with a glint + a red FIRE strip
  k.A(4, -15, 8, 15, 'rgba(120,150,190,0.12)');
  k.L(5, -14, 7, -12, 'rgba(196,212,230,0.6)'); k.P(10, -4, 'rgba(196,212,230,0.4)');
  k.R(4, -15, 8, 2, clean ? PAL.red_l : PAL.red_d); k.H(5, -14, 6, mix(PAL.white, red, 0.3));
  if (!clean) { k.L(8, -9, 11, -3, 'rgba(220,230,240,0.45)'); k.S(4, -13, 8, 13, 'rgba(60,50,40,0.35)', 0.06); }
  k.shadow(4, 1, 10, 1, 'rgba(6,5,10,0.3)');
  return k.done({ outline: false });
}

// ---- exit_sign (wall, high) -------------------------------------------------------------------
function exitSign(o) {
  const { state, clean } = o;
  const k = new K(20, 12, -2, -17, seedOf('exit', state, clean));
  const housing = clean ? PAL.g4 : PAL.g3;
  k.R(-1, -16, 18, 9, housing); k.H(-1, -16, 18, lt(housing, 0.2)); k.H(-1, -8, 18, PAL.g1); k.V(16, -16, 9, PAL.g2);
  k.R(0, -15, 16, 7, state === 'dead' ? PAL.g1 : mix(PAL.red_d, PAL.ink, 0.45));
  const lit = state === 'on' || state === 'flicker';
  const hot = clean ? '#ffd0c0' : '#ff8a72', dead = mix(PAL.red_d, PAL.g2, 0.4);
  'EXIT'.split('').forEach((L, i) => {
    const isLit = lit && !(state === 'flicker' && i >= 2);
    const col = isLit ? hot : state === 'flicker' ? mix(PAL.red_d, PAL.red, 0.4) : dead;
    if (isLit) k.T(i * 4 + 1, -13, L, PAL.red); // a red bloom under each lit letter
    k.T(i * 4, -14, L, col);
  });
  if (state === 'dead' && !clean) { k.L(2, -15, 7, -9, PAL.g3); k.S(0, -15, 16, 7, PAL.g3, 0.08); }
  if (!clean) k.S(-1, -16, 18, 1, PAL.g5, 0.3);
  return k.done({ outline: false });
}

// ---- bench (2×1 seat) -------------------------------------------------------------------------
function bench(o) {
  const { clean } = o;
  const k = new K(36, 30, -2, -18, seedOf('bench', o.dir, o.variant, clean));
  const W = woodSet(clean, 'oak');
  const slat = (y, h = 2, c = W.md) => { k.wood(1, y, 30, h, c, { dark: W.dk, light: W.lt, density: 0.6 }); k.H(1, y, 30, W.hi); k.H(1, y + h - 1, 30, W.dk); };
  if (o.dir === 'up') {
    // backrest toward the camera hides most of the seat
    k.R(1, -6, 30, 3, W.lt); k.H(1, -6, 30, W.hi);
    for (const x of [2, 29]) { k.V(x, -2, 10, W.dk); k.P(x, 8, PAL.wood_d); }
    k.H(2, 4, 28, W.dk);
    k.V(2, -15, 13, W.md); k.V(29, -15, 13, W.dk);
    slat(-14, 3); slat(-9, 3); k.H(1, -3, 30, W.dd);
    if (!clean) { k.L(8, -13, 11, -12, W.dd); k.P(12, -12, W.dd); k.S(1, -14, 30, 8, PAL.g3, 0.04); }
    k.shadow(1, 7, 31, 3);
    return k.done();
  }
  // facing camera: back slats against the wall, seat planks, front rail, legs + stretcher
  k.V(2, -15, 10, W.dk); k.V(29, -15, 10, W.dd);
  slat(-15, 3); slat(-10, 2);
  k.R(1, -6, 30, 6, W.md);
  for (let j = 0; j < 3; j++) { k.wood(1, -6 + j * 2, 30, 2, j === 0 ? W.lt : W.md, { dark: W.dk, light: W.hi, density: 0.5 }); k.H(1, -5 + j * 2, 30, mix(W.md, W.dk, 0.5)); }
  k.H(1, -6, 30, W.hi);
  k.R(1, 0, 30, 2, W.dk); k.H(1, 0, 30, W.lt);
  for (const x of [2, 29]) { k.R(x, 2, 2, 7, x < 10 ? W.md : W.dk); k.P(x, 8, PAL.wood_d); }
  k.H(4, 6, 25, W.dk);
  if (!clean) {
    // worn pale where people sat; carved initials; grime
    k.D(5, -6, 7, 3, mix(W.lt, PAL.tan_l, 0.5), 0.4); k.D(19, -6, 7, 3, mix(W.lt, PAL.tan_l, 0.5), 0.4);
    k.L(13, -14, 15, -13, W.dd); k.P(16, -14, W.dd);
    k.S(1, -15, 30, 17, PAL.g3, 0.03);
  }
  k.shadow(1, 8, 31, 3); k.shadow(3, 2, 27, 5, SHADOW_SOFT);
  return k.done();
}

// ---- portrait_colonel (3×1 wall): the founder in oils, seated in his carved chair ------------
function giltFrame(k, x, y, w, h, clean) {
  const g = clean ? [PAL.gold_l, PAL.gold, PAL.brass, PAL.brass_d] : [mix(PAL.gold, PAL.cream, 0.2), mix(PAL.brass, PAL.gold, 0.3), PAL.brass_d, mix(PAL.brass_d, PAL.ink, 0.4)];
  // 3-px moulding (outer lip, bead, inner sight edge) — the painting shows through the middle
  k.R(x, y, w, 3, g[2]); k.R(x, y + h - 3, w, 3, g[2]); k.R(x, y, 3, h, g[2]); k.R(x + w - 3, y, 3, h, g[2]);
  k.H(x, y, w, g[0]); k.V(x, y, h, g[0]); k.H(x, y + h - 1, w, g[3]); k.V(x + w - 1, y, h, g[3]);
  k.H(x + 1, y + 1, w - 2, g[1]); k.V(x + 1, y + 1, h - 2, g[1]);
  k.H(x + 2, y + h - 3, w - 4, g[3]); k.V(x + w - 3, y + 2, h - 4, g[3]);
  // bead ornament along the frame
  for (let i = x + 3; i < x + w - 3; i += 2) { k.P(i, y + 1, g[0]); k.P(i, y + h - 2, g[2]); }
  for (let j = y + 3; j < y + h - 3; j += 2) { k.P(x + 1, j, g[0]); k.P(x + w - 2, j, g[2]); }
  // corner cartouches
  for (const [cx, cy] of [[x, y], [x + w - 4, y], [x, y + h - 4], [x + w - 4, y + h - 4]]) { k.R(cx, cy, 4, 4, g[1]); k.P(cx + 1, cy + 1, g[0]); k.P(cx + 2, cy + 2, g[3]); }
  // name plate
  k.R(x + (w >> 1) - 5, y + h - 2, 10, 2, g[0]); k.H(x + (w >> 1) - 4, y + h - 1, 8, g[3]);
}
function portraitColonel(o) {
  const { state, clean } = o;
  const k = new K(48, 32, 0, -16, seedOf('portrait', state, clean));
  const X = 3, Y = -13, W = 42, H = 24; // painting area
  // varnished oil ground: warm umber, a light halo behind the sitter, vignette
  const v = (c) => (clean ? c : mix(c, PAL.amber_dd, 0.22));
  k.bands(X, Y, W, H, [v(PAL.brown_d), v(mix(PAL.brown_d, PAL.brown_dd, 0.5)), v(PAL.brown_dd)]);
  k.E(23, -7, 11, 7, v(mix(PAL.brown, PAL.brown_d, 0.4)));
  k.D(X, Y, W, H, v(PAL.brown_dd), 0.0);
  k.DH(X, Y, 6, H, v(PAL.ink), 0.5, 0); k.DH(X + W - 6, Y, 6, H, v(PAL.ink), 0, 0.5);
  // drape at the left, column at the right, a carpet underfoot
  k.R(X, Y, 6, H, v(mix(PAL.green_dd, PAL.brown_dd, 0.4))); for (let i = 0; i < 3; i++) k.V(X + 1 + i * 2, Y, H, v(mix(PAL.green_d, PAL.brown_d, 0.5)));
  k.R(X + W - 5, Y, 4, H, v(mix(PAL.brown_d, PAL.g2, 0.4))); k.V(X + W - 5, Y, H, v(PAL.brown));
  k.R(X, Y + H - 4, W, 4, v(mix(PAL.velvet_d, PAL.brown_dd, 0.4))); k.H(X, Y + H - 4, W, v(PAL.velvet_d));
  // the carved chair: tall back with a crest and gilt finials, arms, velvet seat
  const cw = v(PAL.wood_d), cl = v(PAL.wood), cd = v(PAL.brown_dd);
  k.R(12, -13, 23, 13, cw); k.H(12, -13, 23, cl); k.R(14, -12, 19, 10, v(PAL.velvet_d));
  for (let i = 14; i < 33; i += 3) k.P(i, -13, v(PAL.brass));
  k.R(11, -14, 2, 3, v(PAL.gold)); k.R(34, -14, 2, 3, v(PAL.gold));
  k.R(9, 0, 6, 2, cl); k.H(9, 0, 6, v(PAL.wood_l)); k.R(32, 0, 6, 2, cl); k.H(32, 0, 6, v(PAL.wood_l));
  k.V(10, 2, 7, cd); k.V(36, 2, 7, cd);
  if (state === 'empty') {
    // the chair, empty: velvet seat with a deep dent where he sat
    k.R(14, -2, 19, 5, v(PAL.velvet)); k.H(14, -2, 19, v(mix(PAL.velvet, PAL.red_l, 0.3)));
    k.E(23, 0, 6, 1, v(PAL.velvet_d)); k.H(19, 1, 9, v(mix(PAL.velvet_d, PAL.ink, 0.4)));
    k.R(14, 3, 19, 4, cw); k.H(14, 3, 19, cl); k.V(15, 7, 3, cd); k.V(31, 7, 3, cd);
  } else if (state === 'uniform') {
    // only the coat, slumped: collapsed navy folds over the seat and an arm, sash fallen, epaulette
    k.R(14, -2, 19, 5, v(PAL.velvet));
    const nv = v(PAL.navy), nl = v(PAL.navy_l), nd = v(PAL.navy_dd);
    k.poly([[13, -4], [22, -6], [30, -3], [34, 1], [33, 7], [16, 8], [12, 3]], nv);
    k.L(14, -4, 22, -6, nl); k.L(22, -6, 29, -3, nl); k.L(17, 0, 25, 3, nd); k.L(26, -1, 31, 4, nd); k.L(15, 4, 20, 6, nd);
    k.P(19, 2, v(PAL.gold)); k.P(22, 4, v(PAL.gold)); k.P(25, 5, v(PAL.brass)); k.P(28, 3, v(PAL.gold));
    k.R(13, -5, 3, 2, v(PAL.gold)); k.P(13, -3, v(PAL.brass)); k.P(14, -3, v(PAL.gold)); k.P(15, -3, v(PAL.brass));
    k.L(20, 6, 34, 9, v(PAL.crimson)); k.L(20, 7, 34, 10, v(PAL.velvet)); k.P(35, 10, v(PAL.crimson_l)); k.P(34, 11, v(PAL.crimson));
    k.P(8, 9, v(PAL.ink)); k.H(16, 8, 4, v(PAL.ink)); k.H(26, 8, 5, v(PAL.ink));
  } else {
    // seated: the vast navy mass spilling past the chair arms, sash, buttons sinking into folds,
    // epaulettes half swallowed, huge ringed hands — and the small serene face set too deep
    const nv = v(PAL.navy), nl = v(PAL.navy_l), nd = v(PAL.navy_dd), nd2 = v(PAL.navy_d);
    const fl = v(PAL.flesh_l), fm = v(PAL.flesh), fd = v(PAL.flesh_d), fdd = v(PAL.flesh_dd);
    // chair arms (under the hands)
    k.R(6, 0, 7, 2, cl); k.H(6, 0, 7, v(PAL.wood_l)); k.R(34, 0, 7, 2, cl); k.H(34, 0, 7, v(PAL.wood_l));
    // trousers + split cavalry boots under the coat skirt
    k.R(16, 5, 14, 3, nd2);
    k.R(16, 6, 6, 4, v(PAL.ink)); k.R(25, 6, 6, 4, v(PAL.ink)); k.H(16, 6, 6, v(PAL.g2)); k.H(25, 6, 6, v(PAL.g2)); k.P(19, 8, fd); k.P(28, 7, fdd);
    // body: shadow mass, mid mass, lit upper-left
    k.E(23, 1, 15, 6, nd); k.E(23, -4, 12, 3, nd);
    k.E(22, 0, 14, 5, nd2); k.E(22, -4, 11, 2, nv);
    k.E(21, -1, 12, 4, nv);
    k.E(16, -2, 5, 2, nl); k.H(15, -6, 11, nl); k.P(12, -1, nl); k.P(11, 0, nl);
    // belly folds
    k.L(14, 3, 20, 4, nd); k.L(20, 4, 29, 4, nd); k.L(29, 4, 33, 2, nd); k.L(17, 1, 27, 2, nd2);
    // high collar, jowls pressing over it, the small face (chops, half-lidded eyes, closed smile)
    k.R(19, -8, 9, 2, nd2); k.H(19, -8, 9, v(PAL.gold)); k.P(19, -7, v(PAL.brass)); k.P(27, -7, v(PAL.brass));
    k.H(20, -9, 7, fd); k.P(19, -9, fdd); k.P(27, -9, fdd);
    // the face: smooth, pale, too small; thin gray hair, mutton chops framing it
    k.R(21, -12, 5, 3, fl); k.H(21, -10, 5, fm);
    k.H(22, -13, 3, v(PAL.hair_g));
    k.V(20, -12, 3, v(PAL.hair_g)); k.V(26, -12, 3, v(PAL.hair_g_l)); k.P(21, -10, v(PAL.hair_g)); k.P(25, -10, v(PAL.hair_g));
    k.P(22, -11, fdd); k.P(24, -11, fdd);
    k.P(23, -10, fd);
    // epaulettes
    for (const ex of [9, 34]) { k.R(ex, -6, 4, 2, v(PAL.gold)); k.H(ex, -6, 4, v(PAL.gold_l)); for (let i = 0; i < 4; i++) k.P(ex + i, -4, i % 2 ? v(PAL.brass) : v(PAL.gold)); }
    // buttons following the belly's curve (some sunk into the folds)
    for (const [bx, by, sunk] of [[20, -5, 0], [26, -5, 0], [19, -3, 0], [27, -3, 1], [19, 0, 1], [27, 0, 0], [20, 2, 0], [26, 2, 1], [21, 4, 1], [25, 4, 0]]) k.P(bx, by, v(sunk ? PAL.brass_d : PAL.gold));
    // medals on the breast
    k.P(13, -4, v(PAL.gold)); k.P(14, -4, v(PAL.crimson_l)); k.P(15, -4, v(PAL.blue_l)); k.P(13, -3, v(PAL.brass)); k.P(15, -3, v(PAL.gold));
    // the crimson sash from shoulder to hip, fringe hanging
    for (let i = 0; i < 24; i++) { const x = 12 + i, y = -5 + Math.round(i * 0.45); k.P(x, y, v(PAL.crimson_l)); k.P(x, y + 1, v(PAL.crimson)); k.P(x, y + 2, v(PAL.velvet)); }
    k.P(36, 6, v(PAL.crimson)); k.P(37, 7, v(PAL.crimson_l)); k.P(36, 8, v(PAL.velvet)); k.P(35, 7, v(PAL.crimson));
    // hands on the chair arms: pale, heavy, ringed
    for (const hx of [6, 37]) {
      k.R(hx, -2, 5, 3, fm); k.H(hx, -2, 5, fl); k.H(hx, 0, 5, fd);
      k.P(hx + 1, 0, fdd); k.P(hx + 3, 0, fdd); k.P(hx + (hx < 20 ? 4 : 0), -1, fd);
      k.P(hx + 2, -1, v(PAL.gold_l));
    }
  }
  // craquelure + varnish bloom (decayed), glaze sheen
  if (!clean) {
    for (let i = 0; i < 7; i++) { const x = X + k.ri(2, W - 6), y = Y + k.ri(1, H - 4); k.L(x, y, x + k.ri(-3, 3), y + k.ri(1, 3), 'rgba(10,6,4,0.45)'); }
    k.A(X, Y, W, H, 'rgba(150,110,40,0.06)');
    k.S(X, Y, W, H, 'rgba(200,180,140,0.18)', 0.03);
  }
  k.P(X + 2, Y + 1, 'rgba(255,240,210,0.25)'); k.H(X + 3, Y + 1, 6, 'rgba(255,240,210,0.12)');
  giltFrame(k, 0, -16, 48, 29, clean);
  k.shadow(1, 13, 48, 1, 'rgba(6,5,10,0.4)');
  return k.done({ outline: false });
}

// ---- plaque (wall) ----------------------------------------------------------------------------
function plaque(o) {
  const { clean } = o;
  const k = new K(16, 18, 0, -16, seedOf('plaque', clean));
  const B = clean ? BRASS : { hi: mix(PAL.gold, PAL.g5, 0.3), lt: mix(PAL.brass, PAL.g4, 0.25), md: mix(PAL.brass_d, PAL.g3, 0.3), dk: PAL.brass_d, dd: mix(PAL.brass_d, PAL.ink, 0.5) };
  k.R(1, -14, 14, 12, B.md); k.H(1, -14, 14, B.hi); k.V(1, -14, 12, B.lt); k.H(1, -3, 14, B.dd); k.V(14, -14, 12, B.dk);
  k.frame(2, -13, 12, 10, B.dk); k.H(3, -12, 10, B.lt);
  k.H(4, -11, 8, B.dd); k.H(5, -9, 6, B.dk); k.H(4, -7, 8, B.dk); k.H(5, -5, 6, B.dk);
  k.P(2, -13, B.hi); k.P(13, -13, B.hi); k.P(2, -4, B.lt); k.P(13, -4, B.lt);
  if (!clean) {
    // verdigris blooms in the recesses and a weeping streak
    const vg = mix(PAL.mint, PAL.green_l, 0.4);
    for (const [x, y] of [[3, -10], [4, -6], [11, -8], [12, -5], [7, -4], [9, -12]]) { k.P(x, y, vg); k.P(x + 1, y, mix(vg, B.md, 0.5)); }
    k.V(8, -2, 4, 'rgba(110,160,120,0.35)');
  }
  k.shadow(2, -2, 14, 1, 'rgba(6,5,10,0.35)');
  return k.done({ outline: false });
}

// ---- banner (4×1 wall, high) ------------------------------------------------------------------
function banner(o) {
  const { state, clean } = o;
  const k = new K(64, 16, 0, -16, seedOf('banner', state, clean));
  const f = (c) => (clean ? c : mix(c, PAL.paper_d, 0.35));
  const spec = {
    colliers: { bg: PAL.green, fg: PAL.yellow_l, edge: PAL.yellow, text: 'GO COLLIERS!', bold: false },
    homecoming79: { bg: PAL.paper, fg: PAL.green_d, edge: PAL.green, text: "HOMECOMING '79", bold: false },
    founders: { bg: PAL.navy, fg: PAL.gold_l, edge: PAL.crimson, text: "FOUNDER'S DAY", bold: false },
  }[state] || { bg: PAL.green, fg: PAL.yellow_l, edge: PAL.yellow, text: 'GO COLLIERS!', bold: false };
  const y = -15, h = 11;
  k.R(0, y, 64, h, f(spec.bg));
  k.H(0, y, 64, f(spec.edge)); k.H(0, y + h - 1, 64, f(spec.edge)); k.H(0, y + h - 2, 64, dk(f(spec.bg), 0.2));
  const tw = textW(spec.text);
  k.T(Math.max(1, (64 - tw) >> 1), y + 3, spec.text, f(spec.fg));
  // paint drips under the letters, sag between the tape points
  for (let i = 0; i < 4; i++) k.P(8 + i * 14, y + 9, dk(f(spec.fg), 0.25));
  k.P(0, y, 'rgba(230,220,180,0.75)'); k.P(63, y, 'rgba(230,220,180,0.75)'); k.P(31, y, 'rgba(230,220,180,0.75)');
  if (!clean) {
    // torn: one end ripped and hanging (away from the lettering), a missing corner, water stain
    const tw2 = textW(spec.text), x0 = Math.max(1, (64 - tw2) >> 1);
    if (x0 + tw2 < 56) {
      k.clear(56, y, 8, 4); k.clear(60, y + 4, 4, 3);
      k.poly([[57, y + 4], [63, y + 7], [63, y + 11], [58, y + 11]], f(spec.bg));
      k.L(57, y + 4, 63, y + 7, dk(f(spec.bg), 0.3)); k.P(56, y + 3, f(spec.edge));
    } else { k.clear(0, y, 3, 5); k.clear(0, y + 5, 1, 2); k.L(3, y, 1, y + 6, dk(f(spec.bg), 0.3)); }
    k.clear(61, y + h - 2, 3, 2);
    k.A(20, y + 1, 9, 8, 'rgba(110,80,40,0.2)');
    k.S(0, y, 64, h, 'rgba(60,40,20,0.3)', 0.05);
  }
  k.shadow(1, y + h, 62, 1, 'rgba(6,5,10,0.3)');
  return k.done({ outline: false });
}

// ---- motto_stone (4×1 wall): carved limestone lintel ------------------------------------------
function mottoStone(o) {
  const { clean } = o;
  const k = new K(64, 18, 0, -16, seedOf('motto', clean));
  const S = clean ? [PAL.cream_l, PAL.cream, PAL.cream_d, PAL.g3] : [mix(PAL.cream, PAL.g5, 0.4), mix(PAL.cream_d, PAL.g4, 0.45), mix(PAL.g3, PAL.cream_d, 0.4), PAL.g2];
  const y = -16, h = 15;
  k.R(0, y, 64, h, S[1]);
  k.H(0, y, 64, S[0]); k.V(0, y, h, S[0]); k.H(0, y + h - 1, 64, S[3]); k.V(63, y, h, S[2]);
  k.H(1, y + 1, 62, mix(S[0], S[1], 0.5));
  k.S(1, y + 1, 62, h - 2, S[2], 0.08);
  // incised letters: shadow cut, lit lower lip
  const carve = (tx, ty, text) => { k.T(tx + 1, ty + 1, text, S[0]); k.T(tx, ty, text, S[3]); };
  carve((64 - textW('NEMO')) >> 1, y + 2, 'NEMO'); carve((64 - textW('RELINQUATUR')) >> 1, y + 8, 'RELINQUATUR');
  k.H(4, y + 7, 56, S[2]);
  if (!clean) {
    // soot and rain streaks run down from the cornice; a crack through the R
    for (const x of [6, 17, 38, 49, 58]) { const len = k.ri(3, 9); for (let j = 0; j < len; j++) if ((j & 1) === 0 || j < 2) k.P(x, y + h - 1 - j, 'rgba(40,36,34,0.22)'); }
    k.L(56, y + h - 1, 58, y + h - 5, S[2]);
    k.S(0, y, 64, h, 'rgba(30,30,30,0.25)', 0.05);
  }
  k.shadow(0, y + h, 64, 1, 'rgba(6,5,10,0.45)');
  return k.done({ outline: false });
}

export const HALL = {
  locker: { build: locker, variants: 4 },
  water_fountain: { build: waterFountain },
  trophy_case: { build: trophyCase },
  fire_extinguisher: { build: fireExtinguisher },
  exit_sign: { build: exitSign },
  bench: { build: bench, facing: ['down', 'up'] },
  portrait_colonel: { build: portraitColonel },
  plaque: { build: plaque },
  banner: { build: banner },
  motto_stone: { build: mottoStone },
};
