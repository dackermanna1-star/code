// Props B — the Founder's Vault: sarcophagus wreath flag_regimental name_wall writing_desk candle
// husk_seated husk_kneeling. Cold veined marble, dead flowers, a regimental colour gone to rags,
// and the husks (props_b_husk.js). Clean = the vault as it stood sealed (no husks, no damage).
import { K, PAL, mix, lt, dk, BRASS, IRON, seedOf, woodSet, Blob, SHADOW, SHADOW_SOFT } from './props_b_kit.js';
import { drawHusk, drawKneeling, drawFlakes, huskVariant } from './props_b_husk.js';

const MARBLE = { hi: '#ece8e0', lt: '#cfcac0', md: '#aaa59c', dk: '#7e7a74', dd: '#55524f', vein: '#8d8a86', vein2: '#6c6a6a' };
const marbleOld = (c) => mix(c, PAL.cream_d, 0.12);

/** Veined marble fill: diagonal wandering veins + faint speckle. */
function marble(k, x, y, w, h, base, seed, { veins = 3, dirty = true } = {}) {
  k.R(x, y, w, h, base);
  const r = k.r;
  for (let v = 0; v < veins; v++) {
    let px = x + Math.floor(r() * w), py = y;
    const drift = r() < 0.5 ? 1 : -1;
    const col = v % 2 ? MARBLE.vein : MARBLE.vein2;
    while (py < y + h) {
      if (px >= x && px < x + w) k.P(px, py, mix(base, col, 0.55));
      py++; if (r() < 0.55) px += drift; if (r() < 0.15) px -= drift * 2;
    }
  }
  k.S(x, y, w, h, mix(base, MARBLE.dd, 0.3), 0.03);
  if (dirty) k.grime(x, y, w, h, 0.6, 'rgba(30,20,14,0.25)');
}

// ---------------------------------------------------------------------------- sarcophagus (4×2)
function sarcophagus(o) {
  const burst = o.state === 'burst' && !o.clean;
  const k = new K(92, 60, -14, -22, seedOf('sarc', o.state, o.clean));
  const M = o.clean ? MARBLE : Object.fromEntries(Object.entries(MARBLE).map(([a, c]) => [a, marbleOld(c)]));
  const base = { hi: mix(M.md, PAL.g3, 0.3), md: mix(M.dk, PAL.g2, 0.45), dk: mix(M.dd, PAL.g1, 0.5) };
  k.shadow(-6, 30, 76, 5, SHADOW);
  // two-step plinth of darker stone (separates the tomb from the checkered floor)
  k.R(-5, 24, 74, 7, base.md); k.H(-5, 24, 74, base.hi); k.H(-5, 30, 74, base.dk);
  k.R(-2, 19, 68, 6, base.md); k.H(-2, 19, 68, base.hi); k.V(-2, 19, 6, base.hi); k.H(-2, 24, 68, base.dk);
  // the chest: tall front face with a recessed inscription panel and wreath roundels
  const bx = 2, bw = 60;
  marble(k, bx, 2, bw, 17, M.md, 1, { veins: 4, dirty: !o.clean });
  k.H(bx, 2, bw, M.lt); k.V(bx, 2, 17, M.lt); k.V(bx + bw - 1, 2, 17, M.dk); k.H(bx, 18, bw, M.dk);
  k.R(bx + 14, 6, 32, 9, mix(M.md, M.dk, 0.35));
  k.H(bx + 14, 6, 32, M.dd); k.V(bx + 14, 6, 9, M.dd); k.H(bx + 14, 14, 32, M.lt); k.V(bx + 45, 6, 9, M.lt);
  k.text(bx + 17, 8, 'HALLOWELL', M.dd);
  for (const rx of [bx + 7, bx + bw - 8]) { k.ring(rx, 10, 3, 3, M.dd); k.P(rx - 2, 8, M.hi); k.P(rx, 10, M.dk); }
  if (!burst) {
    // gabled lid: lit back slope, ridge, front slope; corner acroteria; carved sword
    k.R(bx - 2, -12, bw + 4, 14, M.lt);
    marble(k, bx - 2, -12, bw + 4, 7, M.hi, 2, { veins: 3, dirty: !o.clean });
    marble(k, bx - 2, -5, bw + 4, 7, M.lt, 3, { veins: 3, dirty: !o.clean });
    k.H(bx - 2, -6, bw + 4, M.hi); k.H(bx - 2, -5, bw + 4, M.md); k.H(bx - 2, 1, bw + 4, M.dk);
    for (const ax of [bx - 2, bx + bw - 3]) { k.R(ax, -15, 5, 6, M.hi); k.R(ax, -9, 5, 2, M.md); k.P(ax + 4, -14, M.dk); k.P(ax, -15, '#f6f3ee'); }
    k.H(bx + 18, -3, 26, M.dd); k.H(bx + 18, -2, 24, M.lt); k.R(bx + 14, -4, 1, 4, M.dd); k.R(bx + 12, -3, 3, 2, M.dd);
    if (!o.clean) { k.L(bx + 30, -11, bx + 34, -6, M.dk); k.L(bx + 34, -6, bx + 33, 0, M.dk); k.H(bx + 8, 1, 10, 'rgba(10,8,12,0.6)'); }
    return k.done();
  }
  // ---- burst: broken OUTWARD from inside; the cavity is far too large for any man ----
  // jagged rim, splayed outward
  k.R(bx - 1, -6, bw + 2, 8, M.lt); k.H(bx - 1, -6, bw + 2, M.hi);
  // the cavity: black that keeps going — deeper than the tomb stands tall
  k.poly([[bx + 2, -4], [bx + bw - 2, -4], [bx + bw, 2], [bx + bw - 3, 4], [bx + 1, 4], [bx - 1, 1]], PAL.ink);
  k.DV(bx + 3, -4, bw - 6, 3, mix(M.dk, PAL.ink, 0.6), 0.7, 0.0);
  for (let i = 0; i < 10; i++) { const sx = bx + 7 + i * 5 + k.ri(-1, 1); k.V(sx, -4, k.ri(2, 3), mix(M.dk, PAL.ink, 0.45)); } // claw drags down the inside
  for (let x = bx; x < bx + bw; x += 3) k.P(x + k.ri(0, 1), -6 + k.ri(0, 1), PAL.ink); // broken teeth of the rim
  // the front blown out: a ragged hole into the same black, cracks radiating
  k.poly([[bx + 22, 2], [bx + 30, 1], [bx + 33, 8], [bx + 28, 13], [bx + 21, 9]], PAL.ink);
  k.L(bx + 28, 13, bx + 25, 18, M.dd); k.L(bx + 33, 8, bx + 42, 13, M.dd); k.L(bx + 21, 9, bx + 12, 14, M.dd);
  k.L(bx + 42, 13, bx + 46, 18, M.dd); k.L(bx + 12, 14, bx + 9, 18, M.dd); k.L(bx + 30, 1, bx + 36, -3, M.dd);
  k.P(bx + 29, 2, M.hi); k.P(bx + 22, 3, M.hi);
  // something dragged itself out over the front: a coal-black smear down the face and off the plinth
  k.poly([[bx + 27, 12], [bx + 33, 11], [bx + 38, 24], [bx + 46, 31], [bx + 36, 31], [bx + 30, 22]], 'rgba(8,8,12,0.55)');
  k.S(bx + 28, 14, 18, 17, 'rgba(10,10,14,0.6)', 0.12);
  // scraps of navy wool on the teeth, a smear of coal dust
  k.R(bx + 41, -7, 3, 2, PAL.navy); k.P(bx + 44, -6, PAL.navy_d); k.P(bx + 42, -5, PAL.navy_d);
  k.R(bx + 9, 1, 2, 3, PAL.navy_d); k.P(bx + 10, 4, PAL.navy);
  // lid slab A: slid off the front-left, propped on the plinth at an angle
  k.poly([[-12, 8], [22, -2], [27, 8], [-9, 20]], M.lt);
  marble(k, -8, 3, 30, 10, M.lt, 7, { veins: 2 });
  k.poly([[-12, 8], [22, -2], [22, -1], [-12, 9]], M.hi);
  k.poly([[-9, 20], [27, 8], [27, 10], [-9, 22]], M.dk);
  k.L(6, 3, 10, 16, M.dk); k.H(-2, 7, 14, M.dd); // its carved sword, upside down
  // lid slab B: flung right and broken in two on the floor
  k.poly([[56, -14], [76, -10], [78, -3], [60, -6]], M.hi);
  k.poly([[60, -6], [78, -3], [78, -1], [60, -4]], M.dk);
  k.L(66, -12, 69, -4, M.dk);
  k.poly([[66, 18], [76, 20], [74, 26], [64, 24]], M.lt); k.H(64, 25, 10, M.dk);
  // chips everywhere
  for (const [cx, cy] of [[30, 33], [38, 34], [14, 33], [50, 32], [60, 34], [70, 29], [-10, 26], [-4, 32], [74, 33]]) { k.P(cx, cy, M.hi); k.P(cx + 1, cy, M.dk); }
  return k.done();
}

// ---------------------------------------------------------------------------- wreath (1×1)
function wreath(o) {
  const k = new K(20, 34, -2, -20, seedOf('wreath', o.variant, o.clean));
  k.shadowE(8, 14, 6, 2, SHADOW_SOFT);
  // wire easel: three thin legs
  const leg = o.clean ? PAL.g3 : mix(PAL.g2, PAL.rust, 0.3);
  k.L(8, -6, 3, 14, leg); k.L(8, -6, 13, 14, leg); k.L(8, -6, 8, 12, dk(leg, 0.3));
  // ring of leaves (blob shaded), dead brown — 1979: still dark green with white lilies
  const b = new Blob(k.w, k.h, k.ox, k.oy);
  b.E(8, -8, 7, 7, 0, 1);
  for (let y = -11; y <= -5; y++) for (let x = 5; x <= 11; x++) if ((x - 8) ** 2 + (y + 8) ** 2 <= 9) b.erase(x, y);
  const leaves = o.clean ? [PAL.green_dd, PAL.green_d, PAL.green, PAL.green_l, PAL.mint] : [PAL.brown_dd, PAL.brown_d, PAL.wood, mix(PAL.tan, PAL.mustard_d, 0.4), PAL.tan];
  b.render(k, [leaves], { reach: 3, edge: 0.6, rim: 0.5 });
  // leaf texture: pointed leaf pixels breaking the silhouette
  const r = k.r;
  for (let a = 0; a < 18; a++) {
    const t = (a / 18) * Math.PI * 2, rr = 6 + (a % 2);
    const x = Math.round(8 + Math.cos(t) * rr), y = Math.round(-8 + Math.sin(t) * rr);
    k.P(x, y, a % 3 ? leaves[2] : leaves[1]);
    if (r() < 0.5) k.P(x + (Math.cos(t) > 0 ? 1 : -1), y, leaves[1]);
  }
  if (o.clean) for (const [x, y] of [[3, -11], [12, -4], [5, -3], [13, -10]]) { k.P(x, y, PAL.white); k.P(x + 1, y, PAL.paper); }
  else for (const [x, y] of [[3, -11], [12, -4]]) { k.P(x, y, PAL.paper_d); k.P(x + 1, y, mix(PAL.paper_d, PAL.brown, 0.4)); } // dead lilies
  // ribbon sash across, tails hanging (faded crimson; a ribbon from the town)
  const rib = o.clean ? PAL.crimson : mix(PAL.velvet, PAL.g2, 0.35), ribL = o.clean ? PAL.crimson_l : mix(PAL.velvet, PAL.tan, 0.3);
  k.L(2, -12, 12, -2, rib); k.L(3, -12, 13, -2, ribL);
  k.L(12, -2, 11, 4, rib); k.L(13, -2, 14, 5, rib); k.P(14, 6, ribL);
  if (!o.clean) { k.P(9, -6, 'rgba(0,0,0,0)'); k.S(0, -15, 16, 15, 'rgba(30,20,10,0.35)', 0.05); }
  return k.done();
}

// ---------------------------------------------------------------------------- flag_regimental (2×1 wall)
function flagRegimental(o) {
  const k = new K(40, 36, -4, -18, seedOf('flag', o.clean));
  const field = o.clean ? PAL.navy : mix(PAL.navy, PAL.g2, 0.28);
  const F = [dk(field, 0.45), dk(field, 0.22), field, lt(field, 0.12), lt(field, 0.25)];
  // staff on two iron hooks, brass spear-point finial
  k.R(-3, -14, 37, 2, o.clean ? PAL.wood_l : PAL.wood_d); k.H(-3, -14, 37, o.clean ? PAL.maple : PAL.wood);
  k.P(1, -12, IRON.lt); k.P(28, -12, IRON.lt);
  k.poly([[34, -16], [37, -13], [34, -11]], BRASS.md); k.P(34, -15, BRASS.hi);
  // the silk: hangs in soft folds from the staff; one fly corner rotted away, a long tattered hem
  const hem = (x) => {
    if (o.clean) return 12 + Math.round(Math.sin(x * 0.4));
    let b = 11 + Math.round(Math.sin(x * 1.3) * 1.5 + Math.sin(x * 0.45) * 2);
    if (x > 22) b -= Math.round((x - 22) * 0.9);          // the fly end rotted back
    if (x === 6 || x === 7 || x === 15) b += 4;           // strips hanging lower
    if (x === 11 || x === 19) b -= 4;                     // rips
    return b;
  };
  for (let x = 0; x < 32; x++) {
    const ph = (x + 2) % 6, c = F[[1, 2, 3, 4, 3, 2][ph]];
    const b = hem(x);
    if (b <= -11) continue;
    k.V(x, -12, b + 12, c);
    // the cloth sags lower in the middle: shade the lower third darker
    k.DV(x, Math.max(-12, b - 6), 1, Math.min(6, b + 12), F[0], 0, 0.6);
    if (!o.clean && x % 4 === 1 && b > 0) k.P(x, b, c);    // loose threads
  }
  // what's left of the gold fringe
  for (let x = 0; x < 32; x++) { const b = hem(x); if (o.clean || (x < 18 && x % 5 !== 3)) { k.P(x, b, x % 2 ? BRASS.md : BRASS.lt); if (x % 2 === 0) k.P(x, b + 1, BRASS.dk); } }
  // the state arms, faded into the silk: shield, eagle, rearing horses, red scroll "48 PA"
  const cx = 14, cy = -3, gold = o.clean ? PAL.gold : mix(PAL.gold, PAL.g4, 0.4);
  k.R(cx - 3, cy - 2, 6, 6, gold); k.P(cx - 3, cy + 3, F[2]); k.P(cx + 2, cy + 3, F[2]);
  k.H(cx - 2, cy - 1, 4, mix(PAL.blue_l, gold, 0.4)); k.H(cx - 2, cy + 1, 4, mix(PAL.brown, gold, 0.4));
  k.R(cx - 1, cy - 5, 2, 2, PAL.g5); k.P(cx - 2, cy - 5, PAL.g4); k.P(cx + 1, cy - 5, PAL.g4);
  for (const sg of [-1, 1]) { const hx = cx + sg * 5; k.V(hx, cy - 2, 4, mix(PAL.g6, F[2], 0.35)); k.P(hx + sg, cy - 3, mix(PAL.g6, F[2], 0.35)); }
  const scroll = o.clean ? PAL.red : mix(PAL.red_d, PAL.g2, 0.35);
  k.R(cx - 8, cy + 5, 17, 6, scroll); k.H(cx - 8, cy + 5, 17, lt(scroll, 0.2)); k.P(cx - 9, cy + 6, scroll); k.P(cx + 9, cy + 6, scroll);
  k.text(cx - 6, cy + 6, '48 PA', o.clean ? PAL.gold_l : mix(PAL.gold, PAL.g4, 0.4));
  if (!o.clean) {
    for (const [x, y] of [[4, -6], [5, -6], [25, -2], [9, 7], [20, -9], [27, -8]]) k.clear(x, y);
    k.S(0, -12, 32, 22, 'rgba(120,110,90,0.25)', 0.04);
  }
  return k.done();
}

// ---------------------------------------------------------------------------- name_wall (3×1 wall)
const ROLLS = [
  { years: ['1894'], rows: 17, special: null },
  { years: ['1911', '1928', '1945'], rows: 0, special: 'HALLOWELL C' },
  { years: ['1962', '1979'], rows: 0, special: null },
];
function nameWall(o) {
  const k = new K(48, 32, 0, -16, seedOf('names', o.variant, o.label));
  let v = o.variant;
  if (/1894/.test(o.label)) v = 0; else if (/1911|1928|1945/.test(o.label)) v = 1; else if (/1962|1979/.test(o.label)) v = 2;
  const M = o.clean ? MARBLE : Object.fromEntries(Object.entries(MARBLE).map(([a, c]) => [a, marbleOld(c)]));
  // panel with a moulded frame, set into the wall
  k.R(0, -15, 48, 30, M.dk);
  marble(k, 1, -14, 46, 28, M.md, 3, { veins: 4, dirty: !o.clean });
  k.H(1, -14, 46, M.hi); k.V(1, -14, 28, M.lt); k.H(1, 13, 46, M.dd); k.V(46, -14, 28, M.dd);
  k.frame(3, -12, 42, 24, mix(M.md, M.dd, 0.4));
  const groove = M.dd, groove2 = mix(M.md, M.dd, 0.55), lit = M.hi;
  const name = (x, y, w) => { // carved name: letter-ish strokes with lit lower edges
    for (let i = 0; i < w; i++) {
      const on = (hashStr2(x * 31 + i, y) % 5) !== 0 && i % 4 !== 3;
      if (!on) continue;
      k.P(x + i, y, groove2); if ((hashStr2(i, y + x) & 3) === 0) k.P(x + i, y + 1, groove2);
      k.P(x + i, y + 2, lit);
    }
  };
  if (v === 0) {
    k.text(18, -11, '1894', groove); k.H(18, -6, 15, lit);
    for (let i = 0; i < 17; i++) { const col = i % 3, row = Math.floor(i / 3); name(5 + col * 13, -3 + row * 2 + (row > 2 ? 0 : 0), 10 - ((i * 7) % 4)); }
  } else if (v === 1) {
    k.text(5, -11, '1911', groove); k.text(4, -5, 'HALLOWELL C', mix(PAL.red, M.dd, o.clean ? 0.2 : 0.4));
    k.text(5, 0, '1928', groove); name(24, 0, 14); name(24, 3, 10);
    k.text(5, 6, '1945', groove); name(24, 6, 12); name(24, 9, 9);
  } else {
    k.text(5, -11, '1962', groove); name(24, -10, 14); name(24, -7, 12); name(5, -4, 16); name(24, -4, 11);
    k.text(5, 0, '1979', groove);
    name(24, 1, 15); name(24, 4, 13); name(5, 6, 15); name(24, 6, 15); name(5, 9, 14); name(24, 9, 12);
    if (o.clean) { k.R(4, 0, 40, 11, M.md); k.text(5, 0, '1979', mix(M.md, M.dd, 0.25)); } // 1979 not yet carved
  }
  if (!o.clean) { k.drip(10, 13, 2, 'rgba(40,30,20,0.4)'); k.drip(37, 13, 3, 'rgba(40,30,20,0.4)'); k.L(40, -12, 44, -6, M.dk); }
  return k.done();
}
const hashStr2 = (a, b) => { let h = Math.imul(a + 7, 374761393) ^ Math.imul(b + 13, 668265263); h = Math.imul(h ^ (h >>> 13), 1274126177); return (h ^ (h >>> 16)) >>> 0; };

// ---------------------------------------------------------------------------- writing_desk (2×1)
function writingDesk(o) {
  const k = new K(36, 26, -2, -8, seedOf('wdesk', o.clean));
  const W = woodSet(o.clean, 'walnut');
  k.shadow(1, 14, 31, 3, SHADOW);
  // turned legs
  for (const lx of [2, 28]) { k.R(lx, 6, 2, 9, W.dk); k.P(lx, 6, W.md); k.R(lx - 1, 9, 4, 1, W.md); k.R(lx, 14, 2, 1, W.dd); }
  for (const lx of [5, 25]) { k.R(lx, 6, 2, 7, W.dd); }
  // top (leather inlay) + apron with a drawer and brass pull
  k.wood(0, -1, 32, 6, W.lt, { dark: W.md, light: W.hi, density: 0.4 });
  k.R(3, 0, 26, 4, o.clean ? mix(PAL.green_d, PAL.brown_d, 0.3) : mix(PAL.green_dd, PAL.brown_dd, 0.4));
  k.H(3, 0, 26, o.clean ? PAL.green_d : mix(PAL.green_dd, PAL.brown_d, 0.5));
  k.H(0, -1, 32, W.hi);
  k.wood(0, 5, 32, 5, W.md, { dark: W.dk, light: W.lt });
  k.H(0, 5, 32, W.lt); k.H(0, 9, 32, W.dd);
  k.frame(10, 6, 12, 3, W.dk); k.R(15, 7, 2, 1, BRASS.lt); k.P(15, 7, BRASS.hi);
  // inkwell + brass pen tray at the back right, Adair's note on the leather
  k.R(25, -4, 4, 4, PAL.ink); k.R(25, -4, 4, 1, mix(PAL.g3, PAL.blue_d, 0.3)); k.P(25, -3, PAL.moon); k.R(24, -1, 6, 1, BRASS.md);
  if (!o.clean) {
    k.R(10, -1, 9, 5, PAL.paper); k.V(18, -1, 5, PAL.paper_d); k.H(10, 3, 9, PAL.paper_d);
    for (let j = 0; j < 4; j += 1) k.H(11, j, j === 3 ? 4 : 7 - (j % 2), j % 2 ? mix(PAL.paper, PAL.red, 0.5) : mix(PAL.paper, PAL.red_l, 0.65));
    k.S(0, -1, 32, 10, 'rgba(120,110,95,0.35)', 0.06); // dust
  } else { k.R(6, 0, 7, 3, PAL.paper); k.H(7, 1, 5, PAL.g5); }
  return k.done();
}

// ---------------------------------------------------------------------------- candle (1×1)
function candle(o) {
  const lit = o.state === 'lit';
  const k = new K(16, 40, 0, -26, seedOf('candle', o.clean, o.frame));
  k.shadowE(8, 14, 5, 2, SHADOW_SOFT);
  const iron = o.clean ? { hi: PAL.g4, md: PAL.g2, dk: PAL.g1 } : { hi: mix(PAL.g3, PAL.rust, 0.3), md: mix(PAL.g2, PAL.rust, 0.15), dk: PAL.g1 };
  // tripod feet with scrolled toes
  k.L(8, 9, 3, 14, iron.md); k.L(8, 9, 13, 14, iron.md); k.L(8, 9, 8, 13, iron.dk);
  k.P(2, 14, iron.hi); k.P(14, 14, iron.dk); k.P(8, 14, iron.md);
  // shaft with knops
  k.R(7, -10, 2, 20, iron.md); k.V(7, -10, 20, iron.hi);
  k.R(6, 0, 4, 2, iron.md); k.P(6, 0, iron.hi); k.R(6, -9, 4, 2, iron.md);
  // drip pan
  k.R(3, -11, 10, 2, iron.md); k.H(3, -11, 10, iron.hi); k.H(3, -10, 10, iron.dk);
  // candle: thick ivory pillar, wax runs over the pan
  const wax = o.clean ? PAL.white : PAL.paper, waxD = o.clean ? PAL.paper : PAL.paper_d;
  const h = o.clean ? 10 : 7;
  k.R(6, -11 - h, 4, h, wax); k.V(9, -11 - h, h, waxD); k.V(6, -11 - h, h, lt(wax, 0.2));
  k.P(6, -11 - h, waxD);
  if (!o.clean) { k.V(5, -12, 3, wax); k.V(10, -12, 4, waxD); k.P(4, -10, wax); k.V(11, -10, 2, waxD); }
  const wickY = -12 - h;
  k.P(8, wickY, PAL.ink);
  if (lit) {
    const f = o.frame | 0, sway = [0, 0, -1, 1][f % 4], tall = [3, 4, 3, 5][f % 4];
    for (let i = 0; i < tall; i++) {
      const y = wickY - 1 - i;
      const x = 8 + (i > 1 ? sway : 0);
      k.P(x, y, i === 0 ? PAL.ember : i < tall - 1 ? PAL.yellow_l : PAL.fire_l);
      if (i < tall - 2) k.P(x - 1, y, i === 0 ? PAL.fire_l : PAL.ember);
    }
    k.P(8, wickY, PAL.fire_dd);
    k.tint(8, wickY + 2, 5, 4, PAL.ember, 0.55);
  }
  return k.done();
}

// ---------------------------------------------------------------------------- husks
function huskSeated(o) {
  const hv = huskVariant(o.params.husk ?? o.variantRaw ?? o.variant);
  const k = new K(26, 34, -5, -19, seedOf('husk', hv.key, o.dir, o.state));
  if (o.state === 'crumbled') {
    drawFlakes(k, 8, 13, hv.size, seedOf(hv.key));
    k.shadowE(8, 13, 7, 2, SHADOW_SOFT);
    return k.done({ outline: false });
  }
  k.shadowE(8, 13, 6, 2, SHADOW_SOFT);
  const turned = o.state === 'turned';
  const head = turned ? (o.dir === 'down' ? 'down' : 'down') : o.dir;
  drawHusk(k, { cx: 8, seatY: 7, floorY: 14, size: hv.size, view: o.dir, head, pose: hv.pose, boy: hv.boy, turned });
  return k.done({ outline: false });
}
function huskKneeling(o) {
  const k = new K(28, 40, -6, -18, seedOf('kneel', o.dir, o.state));
  const ground = o.dir === 'down' ? 20 : 14;
  if (o.dir !== 'down') k.shadowE(8, 13, 7, 2, SHADOW_SOFT);
  drawKneeling(k, { cx: 8, groundY: ground, view: o.dir, pen: o.state !== 'nopen' });
  return k.done({ outline: false });
}

const huskVar = (v) => { const h = huskVariant(v); return 'abcdefg'.indexOf(h.boy ? 'g' : h.key); };

export const VAULT = {
  sarcophagus: { build: sarcophagus },
  wreath: { build: wreath, variants: 2 },
  flag_regimental: { build: flagRegimental },
  name_wall: { build: nameWall, variants: 3, label: true, showVariants: [0, 1, 2] },
  writing_desk: { build: writingDesk },
  candle: { build: candle, frames: 4, fps: 8, animStates: ['lit'] },
  husk_seated: {
    build: (o) => huskSeated({ ...o, variantRaw: 'abcdefg'[o.variant] === 'g' ? 'boy' : 'abcdefg'[o.variant] }),
    facing: ['down', 'up', 'left', 'right'], variantOf: huskVar, noClean: true,
    showVariants: [0, 2, 5, 6], showFacing: ['down', 'up', 'left', 'right'],
  },
  husk_kneeling: { build: huskKneeling, facing: ['down', 'up', 'left', 'right'], showFacing: ['down', 'up', 'left', 'right'], noClean: true },
};
