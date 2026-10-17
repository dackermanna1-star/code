// Props B — the Breaker (1894): chute picking_bench beam lamp_miner weigh_desk register_book
// shelf_ledgers pulley_wheel. A vast black wooden industrial structure, tarred timber and iron,
// lit red from below by the mine fire: every prop gets the same under-light pass (K.underlight),
// tops sink to near-black, undersides and lower faces catch fire-red with a hot rim.
// The Breaker ignores `clean` (it was buried in 1894; nobody has a cleaner memory of it).
import { K, PAL, mix, lt, dk, BRASS, IRON, seedOf, SHADOW, SHADOW_SOFT, COAL, OUT as OUTC } from './props_b_kit.js';

const TAR = { hi: mix(PAL.g3, PAL.brown, 0.35), lt: mix(PAL.g2, PAL.brown_d, 0.45), md: mix(PAL.g1, PAL.brown_dd, 0.5), dk: mix(PAL.shadow, PAL.brown_dd, 0.4), dd: PAL.ink };
const WORN = { hi: mix(PAL.tan, PAL.g4, 0.4), lt: mix(PAL.wood_l, PAL.g3, 0.45), md: mix(PAL.wood, PAL.g2, 0.5) };
const UL = (k, reach = 16, strength = 0.8) => k.underlight(PAL.fire, { reach, strength, rim: mix(PAL.fire, PAL.fire_l, 0.4), darkenTop: 0.3, floorY: 14 });

/** Tarred plank with end-grain, iron strap and a bolt. */
function plank(k, x, y, w, h, { vertical = false, strap = true } = {}) {
  k.R(x, y, w, h, TAR.md);
  if (!vertical) { k.H(x, y, w, TAR.lt); k.H(x, y + h - 1, w, TAR.dk); for (let i = x + 3; i < x + w; i += 7) k.P(i, y + 1 + (i % 2), TAR.dk); }
  else { k.V(x, y, h, TAR.lt); k.V(x + w - 1, y, h, TAR.dk); for (let j = y + 4; j < y + h; j += 9) k.P(x + 1 + (j % 2), j, TAR.dk); }
  if (strap && !vertical && w > 10) { const sx = x + (w >> 1); k.V(sx, y, h, IRON.dk); k.P(sx, y, IRON.lt); }
}

// ---------------------------------------------------------------------------- chute
function chute(o) {
  const side = o.dir === 'left' || o.dir === 'right';
  const k = new K(20, 36, -2, -18, seedOf('chute', o.dir, o.variant));
  k.shadowE(8, 14, 7, 2, SHADOW);
  if (!side) {
    // trestle under the trough
    for (const x of [1, 13]) plank(k, x, 4, 2, 10, { vertical: true });
    k.R(1, 9, 14, 2, TAR.dk);
    // trough running N–S: tarred side boards (lit top edges), inner walls, a floor worn smooth
    k.R(0, -17, 16, 18, TAR.md);
    k.V(0, -17, 18, TAR.lt); k.V(1, -17, 18, TAR.hi); k.V(14, -17, 18, TAR.hi); k.V(15, -17, 18, TAR.dk);
    k.R(2, -17, 2, 17, TAR.dd); k.R(12, -17, 2, 17, TAR.lt);       // inner walls
    k.R(4, -17, 8, 17, WORN.md);
    k.V(6, -17, 17, WORN.lt); k.V(7, -17, 17, WORN.hi); k.V(10, -17, 17, WORN.lt);
    for (let y = -15; y < 0; y += 6) k.H(4, y, 8, TAR.dk);          // plank joints
    // the near end in section: a U of plank ends, coal spilling over the lip
    k.R(0, 0, 16, 5, TAR.dk); k.R(0, 0, 4, 5, TAR.md); k.R(12, 0, 4, 5, TAR.md); k.R(4, 3, 8, 2, TAR.md);
    k.H(0, 0, 4, TAR.hi); k.H(12, 0, 4, TAR.hi); k.H(4, 3, 8, TAR.lt); k.R(4, 0, 8, 3, PAL.ink);
    k.R(5, 0, 3, 2, COAL[2]); k.P(5, 0, COAL[4]); k.P(9, 1, COAL[3]); k.P(7, 5, COAL[2]); k.P(8, 7, COAL[1]);
    const lumps = [[5, -14], [8, -10], [6, -6], [9, -15], [5, -3], [9, -2]];
    for (let i = 0; i < lumps.length - (o.variant % 3); i++) { const [x, y] = lumps[i]; k.R(x, y, 2, 2, COAL[2]); k.P(x, y, COAL[4]); k.P(x + 1, y + 1, COAL[0]); k.P(x, y - 1, 'rgba(10,10,14,0.5)'); }
  } else {
    // E–W runs tile seamlessly: no outline at the cell joins, trestles every other cell
    const s = o.dir === 'left' ? -1 : 1; // coal runs this way
    if (o.variant % 2 === 0) { plank(k, 6, 0, 3, 14, { vertical: true }); k.L(7, 13, 5, 15, TAR.dk); }
    k.R(0, -10, 16, 8, WORN.md);
    for (let y = -9; y < -2; y += 2) k.H(0, y, 16, y % 4 ? WORN.lt : WORN.md);
    k.H(0, -6, 16, WORN.hi);
    k.R(0, -12, 16, 2, TAR.lt); k.H(0, -12, 16, TAR.hi);          // far side board (top edge)
    k.R(0, -2, 16, 3, TAR.md); k.H(0, -2, 16, TAR.lt); k.H(0, 0, 16, TAR.dd); // near side board
    k.V((o.variant * 5) % 16, -2, 3, IRON.dk);
    for (const [x, y] of [[3, -8], [8, -6], [12, -8]]) { k.R(x + (s < 0 ? 1 : 0), y, 2, 2, COAL[2]); k.P(x, y, COAL[4]); k.P(x + 1, y + 1, COAL[0]); }
    UL(k, 18);
    k.H(0, -13, 16, OUTC); k.H(0, 1, 16, OUTC);
    return k.done({ outline: false });
  }
  UL(k, 18);
  return k.done();
}

// ---------------------------------------------------------------------------- picking_bench (3×1)
function pickingBench(o) {
  const k = new K(52, 26, -2, -10, seedOf('pbench', o.variant));
  k.shadow(1, 12, 46, 3, SHADOW);
  // trestle legs, footboard, the seat plank (polished where seventeen boys sat)
  for (const x of [2, 22, 42]) { plank(k, x, 6, 3, 8, { vertical: true }); k.L(x + 1, 13, x - 1, 15, TAR.dk); }
  plank(k, 0, 10, 48, 2, { strap: false });
  k.R(0, 3, 48, 3, WORN.md); k.H(0, 3, 48, WORN.lt);
  for (let x = 4; x < 48; x += 16) k.H(x, 4, 8, WORN.hi);
  k.R(0, 6, 48, 2, TAR.md); k.H(0, 7, 48, TAR.dd);
  // carved tallies and a name, worn into the plank
  for (let i = 0; i < 5; i++) k.V(30 + i * 2, 3, 2, TAR.dk);
  k.L(29, 4, 39, 3, TAR.dk);
  UL(k, 12);
  return k.done();
}

// ---------------------------------------------------------------------------- beam
function beam(o) {
  const k = new K(24, 82, -4, -66, seedOf('beam', o.variant));
  k.shadowE(8, 14, 7, 2, SHADOW);
  // the post: 10 px square, its lit face toward us, iron straps and through-bolts
  k.R(3, -64, 10, 78, TAR.md); k.V(3, -64, 78, TAR.lt); k.V(4, -64, 78, TAR.md); k.V(12, -64, 78, TAR.dd);
  for (let y = -60; y < 12; y += 6) { const x = 5 + ((y / 6) & 1) * 3; k.V(x, y, 4, TAR.dk); }
  for (const y of [-40, -8]) { k.R(3, y, 10, 2, IRON.dk); k.H(3, y, 10, IRON.lt); k.P(5, y, IRON.hi); k.P(10, y, IRON.hi); }
  // knee brace to one side, a crossbeam stub
  const s = o.variant % 2 ? 1 : -1;
  const bx = s > 0 ? 12 : 3;
  k.LT(bx, -30, bx + s * 8, -44, 3, TAR.md); k.L(bx, -31, bx + s * 8, -45, TAR.lt);
  k.R(-4, -64, 24, 4, TAR.md); k.H(-4, -64, 24, TAR.lt); k.H(-4, -61, 24, TAR.dd);
  // foot plate in the coal
  k.R(1, 12, 14, 2, IRON.dk); k.H(1, 12, 14, IRON.lt);
  UL(k, 30, 0.85);
  return k.done();
}

// ---------------------------------------------------------------------------- lamp_miner
function lampMiner(o) {
  const lit = o.state !== 'out';
  const k = new K(16, 22, 0, -10, seedOf('lamp', o.frame, o.state));
  const tin = { hi: mix(PAL.g5, PAL.brass, 0.3), md: mix(PAL.g3, PAL.brass_d, 0.4), dk: PAL.g1 };
  k.shadowE(7, 8, 3, 1, SHADOW_SOFT);
  // the little teapot-shaped oil lamp: font, lid, spout with the wick, hook handle
  k.R(4, 3, 6, 5, tin.md); k.H(4, 3, 6, tin.hi); k.V(9, 3, 5, tin.dk); k.H(4, 7, 6, tin.dk);
  k.R(5, 2, 4, 1, tin.lt); k.P(6, 1, tin.hi);
  k.L(10, 5, 12, 2, tin.md); k.P(12, 1, tin.dk);
  k.L(5, 2, 4, -3, tin.md); k.L(4, -3, 7, -4, tin.md); // hook
  if (lit) {
    const f = o.frame % 3;
    const fl = [[0, -1], [1, -2], [0, -2]][f];
    k.P(12, 0, PAL.ember); k.P(12 + fl[0] * 0, -1, PAL.yellow_l); k.P(12, fl[1] - 1, PAL.fire_l); if (f === 1) k.P(13, -2, PAL.fire_l);
    k.tint(9, 3, 6, 5, PAL.lamp_miner || PAL.ember, 0.4);
  }
  return k.done();
}

// ---------------------------------------------------------------------------- weigh_desk (2×1)
function weighDesk(o) {
  const k = new K(36, 42, -2, -26, seedOf('weigh', o.variant));
  k.shadow(0, 12, 32, 4, SHADOW);
  // tall legs with a foot rail
  for (const x of [1, 28]) plank(k, x, -2, 3, 16, { vertical: true });
  plank(k, 1, 8, 30, 2, { strap: false });
  // front panel and the slanted top (a high clerk's desk), a brass rail at the back
  plank(k, 0, -8, 32, 7);
  k.R(0, -16, 32, 8, TAR.lt); k.H(0, -16, 32, TAR.hi); k.H(0, -9, 32, TAR.dk);
  for (let x = 2; x < 32; x += 6) k.H(x, -13, 3, TAR.md);
  k.R(0, -19, 32, 2, BRASS.dk); k.H(0, -19, 32, BRASS.md); k.P(3, -19, BRASS.hi); k.P(29, -19, BRASS.hi);
  // the weigh-beam scale bolted to the side
  k.R(30, -24, 2, 18, IRON.md); k.H(24, -24, 10, IRON.lt); k.P(26, -23, BRASS.lt); k.V(33, -23, 6, IRON.dk); k.R(32, -17, 3, 2, IRON.md);
  UL(k, 20, 0.7);
  return k.done();
}

// ---------------------------------------------------------------------------- register_book
function registerBook(o) {
  // sits on the weigh_desk's slanted top; spans two cells to the right (place it on the desk's left cell)
  const k = new K(34, 20, -2, -22, seedOf('register', o.variant));
  const leather = mix(PAL.brown_dd, PAL.velvet_d, 0.45), leatherL = mix(PAL.brown, PAL.velvet, 0.4);
  // binding + thick page block (edges show), pages fanned
  k.R(0, -19, 30, 13, leather); k.H(0, -19, 30, leatherL); k.H(0, -7, 30, PAL.ink);
  const pg = mix(PAL.paper, PAL.cream_d, 0.25), pgD = mix(PAL.paper_d, PAL.brown, 0.2);
  k.R(1, -18, 13, 10, pg); k.R(16, -18, 13, 10, pg);
  k.V(14, -18, 2, PAL.brown_d); k.V(15, -18, 10, pgD); k.V(14, -16, 8, pgD);
  k.H(1, -9, 13, pgD); k.H(16, -9, 13, pgD); k.H(1, -8, 28, mix(PAL.paper_d, PAL.g3, 0.4)); // page edges
  // rules + columns, the founder's red line at the head of each page
  for (const px0 of [2, 17]) {
    k.H(px0, -17, 11, PAL.red); k.P(px0, -17, PAL.red_l);
    for (let y = -15; y < -9; y += 2) { k.H(px0, y, 11, mix(pg, PAL.blue_l, 0.35)); for (let i = 0; i < 7; i++) if ((i * 3 + y) % 5) k.P(px0 + i, y - 1, mix(PAL.brown_d, PAL.ink, 0.4)); }
    k.V(px0 + 8, -16, 7, mix(pg, PAL.red, 0.4));
  }
  // a ribbon marker hanging out
  k.V(22, -7, 4, PAL.crimson); k.P(22, -3, PAL.crimson_l);
  k.tint(15, -13, 16, 8, PAL.ember, 0.18);
  UL(k, 12, 0.45);
  return k.done();
}

// ---------------------------------------------------------------------------- shelf_ledgers (2×1)
function shelfLedgers(o) {
  const k = new K(34, 50, -1, -36, seedOf('ledgers', o.variant));
  k.shadow(1, 12, 31, 3, SHADOW);
  plank(k, 0, -34, 3, 48, { vertical: true }); plank(k, 29, -34, 3, 48, { vertical: true });
  k.R(3, -34, 26, 48, TAR.dd);
  const shelves = [-34, -20, -6, 8];
  for (const y of shelves) plank(k, 0, y, 32, 3, { strap: false });
  // black payroll ledgers, faded gilt bands on the spines
  for (let s = 0; s < 3; s++) {
    const y0 = shelves[s] + 3, y1 = shelves[s + 1];
    let x = 3;
    let i = 0;
    while (x < 28) {
      const w = 3 + ((i + s + o.variant) % 2);
      const lean = (s === 1 && i === 5) ? 1 : 0;
      const h = y1 - y0 - 1 - ((i * 7 + s) % 3);
      k.R(x, y1 - h, w, h, i % 3 ? PAL.g1 : PAL.shadow); k.V(x, y1 - h, h, PAL.g2);
      k.H(x, y1 - h + 2, w, BRASS.dk); k.H(x, y1 - 3, w, BRASS.dd);
      if (lean) k.P(x + w, y1 - h, PAL.g2);
      x += w + (lean ? 1 : 0); i++;
    }
  }
  // one ledger pulled half out
  k.R(14, -19, 4, 12, PAL.g1); k.H(14, -19, 4, PAL.g3); k.H(14, -17, 4, BRASS.md);
  UL(k, 24, 0.75);
  return k.done();
}

// ---------------------------------------------------------------------------- pulley_wheel (2×2 over)
function pulleyWheel(o) {
  const k = new K(36, 36, -2, -2, seedOf('pulley', o.variant));
  const cx = 16, cy = 14, R = 13;
  // bearing bracket
  k.R(cx - 2, -2, 4, cy + 2, TAR.md); k.V(cx - 2, -2, cy + 2, TAR.lt);
  // spokes, hub, the grooved rim
  for (let a = 0; a < 6; a++) { const t = (a / 6) * Math.PI * 2 + 0.3; k.L(cx, cy, Math.round(cx + Math.cos(t) * (R - 1)), Math.round(cy + Math.sin(t) * (R - 1)), IRON.md); }
  k.ring(cx, cy, R, R, IRON.md); k.ring(cx, cy, R - 1, R - 1, IRON.dk); k.ring(cx, cy, R + 1, R + 1, IRON.dd);
  k.E(cx, cy, 2, 2, IRON.lt); k.P(cx - 1, cy - 1, IRON.hi);
  // the cable over it, dropping into the dark
  k.V(cx + R + 1, cy, 20, mix(PAL.g3, PAL.brown, 0.3)); k.V(cx - R - 1, cy, 20, mix(PAL.g3, PAL.brown, 0.3));
  k.underlight(PAL.fire, { reach: 14, strength: 0.7, rim: PAL.fire_l, darkenTop: 0.35 });
  return k.done({ outline: false });
}

export const BREAKER = {
  chute: { build: chute, facing: ['down', 'left', 'right'], variants: 3, noClean: true, showFacing: ['down', 'left', 'right'] },
  picking_bench: { build: pickingBench, noClean: true },
  beam: { build: beam, variants: 2, noClean: true, showVariants: [0, 1] },
  lamp_miner: { build: lampMiner, states: ['lit', 'out'], frames: 3, fps: 6, animStates: ['lit'], noClean: true },
  weigh_desk: { build: weighDesk, noClean: true },
  register_book: { build: registerBook, noClean: true },
  shelf_ledgers: { build: shelfLedgers, noClean: true },
  pulley_wheel: { build: pulleyWheel, noClean: true },
};
