// Props B — the Founder's Vault: sarcophagus wreath flag_regimental name_wall writing_desk candle
// husk_seated husk_kneeling. Cold veined marble, dead flowers, a regimental colour gone to rags,
// and the husks (props_b_husk.js). Clean = the vault as it stood sealed (no husks, no damage).
import { K, PAL, mix, lt, dk, OUT, BRASS, IRON, seedOf, woodSet, Blob, SHADOW, SHADOW_SOFT, glowDot, bay } from './props_b_kit.js';
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
  const k = new K(80, 52, -8, -14, seedOf('sarc', o.state, o.clean));
  const M = o.clean ? MARBLE : Object.fromEntries(Object.entries(MARBLE).map(([a, c]) => [a, marbleOld(c)]));
  k.shadow(-2, 26, 68, 6, SHADOW);
  k.shadow(-4, 30, 72, 3, SHADOW_SOFT);
  // plinth
  k.box(-1, 22, 66, 3, 6, { top: M.lt, front: M.dk, under: M.dd });
  // body: front face y 8..24, top rim at y 2..8
  const bx = 2, bw = 60;
  marble(k, bx, 8, bw, 15, M.md, 1, { veins: 4, dirty: !o.clean });
  k.H(bx, 8, bw, M.lt);
  k.V(bx, 8, 15, M.lt); k.V(bx + bw - 1, 8, 15, M.dk);
  k.H(bx, 22, bw, M.dk);
  // carved front: recessed inscription panel flanked by wreath roundels
  k.R(bx + 14, 11, 32, 9, mix(M.md, M.dk, 0.35));
  k.H(bx + 14, 11, 32, M.dd); k.V(bx + 14, 11, 9, M.dd); k.H(bx + 14, 19, 32, M.lt); k.V(bx + 45, 11, 9, M.lt);
  k.text(bx + 17, 13, 'HALLOWELL', M.dd);
  k.H(bx + 17, 18, 26, mix(M.md, M.dd, 0.5));
  for (const rx of [bx + 6, bx + bw - 7]) { k.ring(rx, 15, 3, 3, M.dd); k.P(rx - 2, 13, M.hi); k.P(rx, 15, M.dk); }
  if (!burst) {
    // gabled lid: back slope (lit), ridge, front slope, corner acroteria
    k.R(bx - 1, -4, bw + 2, 13, M.lt);
    marble(k, bx - 1, -4, bw + 2, 6, M.hi, 2, { veins: 3, dirty: !o.clean });
    marble(k, bx - 1, 2, bw + 2, 6, M.lt, 3, { veins: 3, dirty: !o.clean });
    k.H(bx - 1, 1, bw + 2, M.hi); k.H(bx - 1, 2, bw + 2, M.md);
    k.H(bx - 1, 8, bw + 2, M.dk);
    for (const ax of [bx - 1, bx + bw - 4]) { k.R(ax, -6, 5, 5, M.hi); k.R(ax, -1, 5, 2, M.md); k.P(ax + 4, -5, M.dk); k.P(ax, -6, '#f6f3ee'); }
    // carved sword on the lid, point toward the feet
    k.H(bx + 18, 3, 26, M.dd); k.H(bx + 18, 4, 24, M.lt); k.R(bx + 14, 2, 1, 4, M.dd); k.R(bx + 12, 3, 3, 2, M.dd);
    if (!o.clean) { // hairline cracks and a dark seep at the seam
      k.L(bx + 30, -3, bx + 34, 1, M.dk); k.L(bx + 34, 1, bx + 33, 6, M.dk);
      k.H(bx + 8, 8, 10, 'rgba(10,8,12,0.6)');
    }
  } else {
    // ---- burst: the lid broke OUTWARD; the cavity is far too large for any man ----
    // rim of the box, jagged and splayed
    k.R(bx, 1, bw, 8, M.lt);
    // the cavity: a pit that keeps going (deeper than the box stands tall)
    k.R(bx + 3, 3, bw - 6, 7, PAL.ink);
    k.poly([[bx + 3, 3], [bx + bw - 3, 3], [bx + bw - 1, 9], [bx + 1, 9]], PAL.ink);
    k.DV(bx + 3, 3, bw - 6, 4, mix(M.dd, PAL.ink, 0.5), 0.6, 0.0);
    // inner back wall, scraped from inside (long claw-drags downward)
    for (let i = 0; i < 9; i++) { const sx = bx + 8 + i * 5 + k.ri(-1, 1); k.V(sx, 3, k.ri(2, 4), mix(M.dk, PAL.ink, 0.3)); }
    // bulged, cracked front: chunks pushed out and missing
    k.poly([[bx + 20, 8], [bx + 27, 8], [bx + 29, 13], [bx + 24, 16], [bx + 19, 12]], PAL.ink);
    k.L(bx + 24, 16, bx + 22, 22, M.dd); k.L(bx + 29, 13, bx + 36, 18, M.dd); k.L(bx + 19, 12, bx + 12, 17, M.dd);
    k.L(bx + 36, 18, bx + 40, 22, M.dd); k.L(bx + 12, 17, bx + 9, 21, M.dd);
    k.P(bx + 26, 9, M.hi); k.P(bx + 20, 9, M.hi);
    // rim teeth
    for (let x = bx; x < bx + bw; x += 3) k.P(x + k.ri(0, 1), 1 + k.ri(0, 1), PAL.ink);
    // scraps of navy wool caught on the edges, a smear of coal, one brass button in the dust
    k.R(bx + 40, 2, 3, 2, PAL.navy); k.P(bx + 43, 3, PAL.navy_d); k.P(bx + 41, 4, PAL.navy_d);
    k.R(bx + 10, 8, 2, 3, PAL.navy_d); k.P(bx + 11, 11, PAL.navy);
    k.S(bx + 4, 9, 20, 4, 'rgba(10,10,14,0.5)', 0.25);
    // lid slab A: slid off to the front-left, tilted against the plinth
    k.poly([[-6, 12], [22, 6], [26, 14], [-3, 22]], M.lt);
    marble(k, -2, 10, 22, 8, M.lt, 7, { veins: 2 });
    k.poly([[-6, 12], [22, 6], [22, 7], [-6, 13]], M.hi);
    k.poly([[-3, 22], [26, 14], [26, 16], [-3, 24]], M.dk);
    k.L(8, 9, 12, 19, M.dk); // crack through the slab
    // lid slab B: flung right, broken in two on the floor
    k.poly([[44, -6], [66, -2], [70, 6], [50, 4]], M.hi);
    k.poly([[50, 4], [70, 6], [70, 8], [50, 6]], M.dk);
    k.L(57, -4, 60, 5, M.dk);
    k.R(66, 20, 5, 3, M.lt); k.R(66, 23, 5, 1, M.dk); k.R(-6, 25, 3, 2, M.lt); k.P(70, 27, M.md);
    // chips scattered on the plinth/floor
    for (const [cx, cy] of [[30, 26], [36, 27], [14, 27], [47, 25], [58, 27]]) { k.P(cx, cy, M.hi); k.P(cx + 1, cy, M.dk); }
  }
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
  const k = new K(36, 34, -2, -16, seedOf('flag', o.clean));
  const field = o.clean ? PAL.navy : mix(PAL.navy, PAL.g2, 0.3), fieldD = dk(field, 0.35), fieldL = lt(field, 0.15);
  // staff on two brackets, eagle-ish finial
  k.R(-1, -12, 34, 2, o.clean ? PAL.wood_l : PAL.wood_d); k.H(-1, -12, 34, o.clean ? PAL.maple : PAL.wood);
  k.R(2, -11, 2, 3, IRON.lt); k.R(28, -11, 2, 3, IRON.lt);
  k.R(32, -14, 3, 3, BRASS.md); k.P(32, -14, BRASS.hi);
  // the silk: hangs from the staff in soft vertical folds; tattered lower edge
  const top = -10, bottom = o.clean ? 12 : 10;
  for (let x = 0; x < 32; x++) {
    const fold = Math.sin(x * 0.55) ;
    const c = fold > 0.45 ? fieldL : fold < -0.45 ? fieldD : field;
    let b = bottom + (o.clean ? 0 : Math.round(Math.sin(x * 1.7) * 2 + Math.sin(x * 0.6) * 2));
    if (!o.clean && (x === 7 || x === 8 || x === 21)) b -= 5; // torn strips
    k.V(x, top, b - top, c);
    if (!o.clean && x % 5 === 2) k.P(x, b, c); // threads
  }
  // gold fringe (what's left of it)
  for (let x = 0; x < 32; x += 1) { if (!o.clean && (x % 4 === 1 || (x > 12 && x < 19))) continue; k.P(x, bottom + (o.clean ? 0 : 1), x % 2 ? BRASS.md : BRASS.lt); }
  // PA arms: shield (ship / plough / sheaves), eagle crest, two horses, red scroll
  const cx = 16, cy = -1;
  k.R(cx - 4, cy - 3, 8, 7, o.clean ? PAL.gold : mix(PAL.gold, PAL.g4, 0.35));
  k.H(cx - 3, cy - 2, 6, PAL.blue_l); k.P(cx - 1, cy - 2, PAL.white);      // ship band
  k.H(cx - 3, cy, 6, PAL.brown); k.P(cx + 1, cy, PAL.g2);                  // plough
  k.P(cx - 2, cy + 2, PAL.yellow); k.P(cx + 1, cy + 2, PAL.yellow); k.P(cx - 2, cy + 3, PAL.mustard); k.P(cx + 1, cy + 3, PAL.mustard);
  k.R(cx - 2, cy + 4, 4, 1, o.clean ? PAL.gold : mix(PAL.gold, PAL.g4, 0.35));
  k.R(cx - 2, cy - 6, 4, 2, PAL.g5); k.P(cx - 3, cy - 6, PAL.g5); k.P(cx + 2, cy - 6, PAL.g5); k.P(cx, cy - 7, PAL.g6); // eagle
  for (const s of [-1, 1]) { const hx = cx + s * 7; k.R(hx - 1, cy - 3, 3, 4, PAL.g6); k.P(hx + s, cy - 4, PAL.g6); k.P(hx - s, cy + 1, PAL.g5); k.P(hx + s, cy + 1, PAL.g5); }
  const scroll = o.clean ? PAL.red : mix(PAL.red_d, PAL.g2, 0.3);
  k.R(cx - 9, cy + 6, 18, 6, scroll); k.H(cx - 9, cy + 6, 18, lt(scroll, 0.2));
  k.text(cx - 7, cy + 7, '48 PA', o.clean ? PAL.gold_l : mix(PAL.gold, PAL.g4, 0.4));
  if (!o.clean) {
    // moth holes, shot holes, a long rip, dust
    for (const [x, y] of [[4, -4], [5, -4], [25, 2], [26, 3], [10, 6], [28, -6], [20, 8]]) k.clear(x, y);
    k.L(23, 4, 27, 10, fieldD);
    k.S(0, -10, 32, 20, 'rgba(120,110,90,0.25)', 0.05);
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
    k.text(18, -10, '1894', groove); k.H(18, -5, 15, lit);
    for (let i = 0; i < 17; i++) { const col = i < 9 ? 0 : 1, row = i < 9 ? i : i - 9; name(6 + col * 20, -3 + row * 2 - (row > 4 ? 0 : 0), 14 - ((i * 7) % 5)); }
  } else if (v === 1) {
    k.text(5, -10, '1911', groove); k.text(5, -4, 'HALLOWELL C', mix(PAL.red, M.dd, o.clean ? 0.2 : 0.4));
    k.text(5, 2, '1928', groove); name(24, 3, 14); name(24, 6, 10);
    k.text(5, 8, '1945', groove); name(24, 8, 12); name(24, 10, 9);
  } else {
    k.text(5, -10, '1962', groove); name(24, -10, 14); name(24, -7, 12); name(5, -4, 16); name(24, -4, 11);
    k.text(5, 1, '1979', groove);
    for (let i = 0; i < 9; i++) name(o.clean ? 24 : 24, 1 + i * 1.2 | 0, 0); // placeholder spacing
    for (let i = 0; i < 4; i++) name(24 - (i % 2) * 19, 1 + Math.floor(i / 2) * 4 + (i % 2 ? 6 : 0), 13 - i);
    name(5, 7, 15); name(24, 7, 15); name(5, 10, 14); name(24, 10, 12);
    if (o.clean) { k.R(4, 1, 40, 12, M.md); k.text(5, 1, '1979', mix(M.md, M.dd, 0.25)); } // 1979 not yet carved
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
  const k = new K(28, 40, -6, -18, seedOf('kneel', o.dir));
  const ground = o.dir === 'down' ? 20 : 14;
  if (o.dir !== 'down') k.shadowE(8, 13, 7, 2, SHADOW_SOFT);
  drawKneeling(k, { cx: 8, groundY: ground, view: o.dir });
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
export { bay, OUT };
