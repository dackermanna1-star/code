// Props B — cafeteria & kitchen: caf_table serving_line tray_rack stove mixer freezer_door dumbwaiter
// sink_big shelf_pantry vending_machine milk_cooler. Stainless gone milky, Hobart gray, brown
// fiberglass trays, rusted #10 cans; the walk-in is warm and full of cicada shells.
import { K, PAL, mix, lt, dk, BRASS, CHROME, seedOf, woodSet, steelSet, stainless, SHADOW, SHADOW_SOFT } from './props_b_kit.js';

const TRAY = (clean) => clean ? { hi: PAL.tan_l, lt: PAL.tan, md: PAL.brown, dk: PAL.brown_d } : { hi: mix(PAL.tan, PAL.g4, 0.3), lt: mix(PAL.brown, PAL.tan, 0.4), md: PAL.brown, dk: PAL.brown_d };
const FORMICA = (clean) => clean ? { hi: PAL.cream_l, md: PAL.cream, dk: PAL.cream_d, fleck: PAL.tan } : { hi: mix(PAL.cream_l, PAL.g5, 0.4), md: mix(PAL.cream, PAL.g4, 0.35), dk: mix(PAL.cream_d, PAL.g3, 0.4), fleck: PAL.brown };

function tray(k, x, y, o, { food = false, tilt = false } = {}) {
  const T = TRAY(o.clean);
  k.R(x, y, 9, 6, T.lt); k.H(x, y, 9, T.hi); k.V(x + 8, y, 6, T.dk); k.H(x, y + 5, 9, T.dk);
  k.R(x + 1, y + 1, 4, 3, T.md); k.R(x + 6, y + 1, 2, 2, T.md); k.R(x + 6, y + 4, 2, 1, T.md);
  if (food) { k.P(x + 2, y + 2, PAL.mustard); k.P(x + 3, y + 2, mix(PAL.brown, PAL.green_d, 0.5)); k.P(x + 7, y + 1, PAL.cream_d); }
  if (tilt) k.P(x + 9, y + 2, T.dk);
}
function milkCarton(k, x, y, clean, fallen = false) {
  if (fallen) { k.R(x, y, 4, 2, clean ? PAL.white : PAL.paper_d); k.P(x, y, PAL.red); k.P(x + 4, y + 1, 'rgba(240,236,226,0.5)'); return; }
  k.R(x, y, 3, 4, clean ? PAL.white : PAL.paper_d); k.P(x + 1, y - 1, clean ? PAL.white : PAL.paper_d); k.H(x, y + 1, 3, PAL.red); k.V(x + 2, y, 4, PAL.g5);
}

// ---------------------------------------------------------------------------- caf_table (4×2)
function cafTable(o) {
  const k = new K(68, 42, -2, -6, seedOf('caf', o.variant, o.clean));
  const F = FORMICA(o.clean), S = steelSet(o.clean, 'gray');
  const bench = o.clean ? { hi: PAL.yellow, md: PAL.mustard, dk: PAL.mustard_d } : { hi: mix(PAL.yellow, PAL.g4, 0.45), md: mix(PAL.mustard, PAL.g3, 0.4), dk: mix(PAL.mustard_d, PAL.g2, 0.4) };
  k.shadow(0, 28, 64, 4, SHADOW);
  // far bench (seen from above, beyond the table)
  k.R(2, -2, 60, 4, bench.md); k.H(2, -2, 60, bench.hi); k.H(2, 1, 60, bench.dk);
  // table top
  k.R(0, 4, 64, 16, F.md); k.H(0, 4, 64, F.hi); k.R(0, 20, 64, 2, F.dk); k.H(0, 21, 64, dk(F.dk, 0.3));
  k.S(0, 5, 64, 14, F.fleck, 0.04); k.H(1, 5, 62, lt(F.md, 0.08));
  // folding frame + near bench, legs
  for (const x of [8, 54]) { k.R(x, 22, 2, 8, S.md); k.V(x, 22, 8, S.hi); }
  k.R(14, 22, 36, 2, S.dk);
  k.R(2, 24, 60, 4, bench.md); k.H(2, 24, 60, bench.hi); k.H(2, 27, 60, bench.dk);
  for (const x of [4, 59]) { k.R(x, 28, 2, 3, S.dk); }
  // what was left on it
  const v = o.variant;
  if (o.clean) { tray(k, 6, 8, o); tray(k, 40, 9, o); milkCarton(k, 18, 8, true); }
  else {
    tray(k, 4 + v * 3, 7, o, { food: true }); tray(k, 30, 10, o, { food: true, tilt: true }); if (v % 2) tray(k, 48, 6, o, {});
    milkCarton(k, 18, 8, false); milkCarton(k, 42, 14, false, true);
    k.P(26, 15, PAL.g5); k.P(27, 16, PAL.g5); // spork
    k.S(0, 4, 64, 16, 'rgba(90,70,40,0.35)', 0.03);
    k.H(56, 12, 4, F.dk); // carved
  }
  return k.done();
}

// ---------------------------------------------------------------------------- serving_line (4×1)
function servingLine(o) {
  const k = new K(66, 38, -1, -22, seedOf('serve', o.clean));
  const X = stainless(o.clean);
  k.shadow(0, 13, 64, 3, SHADOW);
  // sneeze guard: glass on chrome posts
  for (const x of [4, 30, 58]) { k.V(x, -20, 18, X.lt); k.V(x + 1, -20, 18, X.dk); }
  k.A(2, -20, 60, 9, 'rgba(151,175,203,0.22)'); k.H(2, -20, 60, X.hi); k.H(2, -11, 60, 'rgba(196,212,230,0.5)');
  k.L(8, -19, 12, -12, 'rgba(240,244,250,0.45)'); k.L(36, -19, 39, -13, 'rgba(240,244,250,0.35)');
  // counter top with steam wells
  k.R(0, -4, 64, 7, X.lt); k.H(0, -4, 64, X.hi);
  for (let i = 0; i < 4; i++) { const x = 4 + i * 15; k.R(x, -3, 12, 4, mix(X.dd, PAL.night, 0.4)); k.H(x, 0, 12, X.md); if (!o.clean && i === 2) k.R(x + 2, -2, 8, 2, mix(PAL.mustard_d, PAL.brown_d, 0.5)); }
  // front: brushed panels + tray slide (three tubes)
  k.R(0, 3, 64, 10, X.md);
  for (let x = 2; x < 64; x += 3) k.V(x, 4, 8, mix(X.md, X.lt, 0.4));
  for (let i = 0; i < 4; i++) k.V(i * 16, 3, 10, X.dk);
  k.H(0, 5, 64, X.hi); k.H(0, 6, 64, X.dk); k.H(0, 8, 64, X.hi); k.H(0, 9, 64, X.dk);
  k.R(0, 13, 64, 1, X.dd);
  if (!o.clean) { k.S(0, -4, 64, 17, 'rgba(90,80,60,0.3)', 0.04); k.rust(0, 9, 64, 4, 4); }
  return k.done();
}

// ---------------------------------------------------------------------------- tray_rack
function trayRack(o) {
  const k = new K(18, 28, -1, -12, seedOf('trays', o.clean));
  const T = TRAY(o.clean), S = steelSet(o.clean, 'gray');
  k.shadow(1, 12, 14, 3, SHADOW_SOFT);
  k.R(1, 9, 14, 3, S.md); k.H(1, 9, 14, S.hi); for (const x of [2, 12]) { k.R(x, 12, 2, 2, PAL.g1); }
  for (let i = 0; i < 9; i++) { const y = 8 - i * 2, dx = (i * 3) % 2; k.H(1 + dx, y, 13, i % 2 ? T.md : T.dk); k.H(1 + dx, y - 1, 13, T.lt); }
  tray(k, 2, -12, o);
  if (!o.clean) k.S(1, -12, 14, 20, 'rgba(150,140,120,0.3)', 0.04);
  return k.done();
}

// ---------------------------------------------------------------------------- stove (2×1)
function stove(o) {
  const k = new K(34, 34, -1, -18, seedOf('stove', o.clean));
  const X = stainless(o.clean);
  const blk = { hi: PAL.g3, md: PAL.g1, dk: PAL.shadow, dd: PAL.ink };
  k.shadow(1, 13, 31, 3, SHADOW);
  // backsplash + high shelf
  k.R(0, -16, 32, 9, X.md); k.H(0, -16, 32, X.hi); k.R(0, -16, 32, 2, X.lt); k.H(0, -14, 32, X.dk);
  // cooktop: six burner grates
  k.R(0, -7, 32, 9, blk.md); k.H(0, -7, 32, blk.hi);
  for (let r = 0; r < 2; r++) for (let c = 0; c < 3; c++) { const x = 5 + c * 11, y = -5 + r * 4; k.ring(x, y, 3, 1, PAL.g3); k.P(x, y, PAL.g2); k.P(x - 2, y - 1, PAL.g4); }
  // knob rail, oven doors with chrome bar handles
  k.R(0, 2, 32, 2, X.lt); for (let x = 3; x < 32; x += 5) { k.P(x, 2, PAL.ink); k.P(x, 3, X.hi); }
  k.R(0, 4, 32, 10, blk.md); k.frame(1, 4, 15, 9, blk.hi); k.frame(16, 4, 15, 9, blk.hi);
  k.H(3, 6, 11, X.hi); k.H(18, 6, 11, X.hi);
  k.R(4, 8, 9, 3, mix(PAL.night, PAL.g1, 0.5)); k.R(19, 8, 9, 3, mix(PAL.night, PAL.g1, 0.5)); // oven windows
  k.R(0, 13, 32, 1, blk.dd);
  if (!o.clean) { k.S(0, -7, 32, 9, 'rgba(110,60,30,0.4)', 0.06); k.rust(0, -16, 32, 8, 3); k.P(12, -4, PAL.amber_d); k.P(13, -4, PAL.amber); } // a cicada shell on the burner
  return k.done();
}

// ---------------------------------------------------------------------------- mixer (Hobart)
function mixer(o) {
  const k = new K(18, 44, -1, -30, seedOf('mixer', o.clean));
  const G = o.clean ? { hi: mix(PAL.g6, PAL.mint, 0.3), lt: mix(PAL.g5, PAL.mint, 0.3), md: mix(PAL.g4, PAL.green_l, 0.25), dk: mix(PAL.g3, PAL.green_d, 0.3), dd: PAL.g2 }
    : { hi: mix(PAL.g5, PAL.mint, 0.2), lt: mix(PAL.g4, PAL.green_l, 0.2), md: mix(PAL.g3, PAL.green, 0.25), dk: mix(PAL.g2, PAL.green_d, 0.3), dd: PAL.g1 };
  const X = stainless(o.clean);
  k.shadow(1, 12, 14, 3, SHADOW);
  // base
  k.R(1, 8, 14, 5, G.md); k.H(1, 8, 14, G.hi); k.H(1, 12, 14, G.dd);
  // column at the back, head reaching forward over the bowl
  k.R(9, -24, 6, 32, G.md); k.V(9, -24, 32, G.lt); k.V(14, -24, 32, G.dk);
  k.R(1, -28, 14, 7, G.lt); k.H(1, -28, 14, G.hi); k.H(1, -22, 14, G.dk); k.V(1, -28, 7, G.hi);
  k.R(3, -26, 3, 2, PAL.red_d); k.P(12, -26, PAL.ink); // badge + switch
  // beater + stainless bowl on its arms
  k.R(6, -21, 2, 6, X.md); k.V(6, -21, 6, X.hi);
  k.R(1, -14, 10, 9, X.md); k.V(1, -14, 9, X.hi); k.V(2, -14, 9, X.lt); k.V(10, -14, 9, X.dk); k.H(1, -14, 10, X.hi); k.H(1, -6, 10, X.dd);
  k.E(6, -14, 4, 1, X.dd);
  k.R(9, -10, 3, 2, G.dk); // bowl arm
  if (!o.clean) { k.S(1, -28, 14, 7, 'rgba(160,150,130,0.35)', 0.08); k.rust(1, 8, 14, 5, 2); k.drip(11, -4, 6, 'rgba(90,80,60,0.4)'); }
  return k.done();
}

// ---------------------------------------------------------------------------- freezer_door (1×2 door)
function freezerDoor(o) {
  const open = o.state === 'open';
  const k = new K(18, 34, -1, 0, seedOf('freezer', o.state, o.clean));
  const X = stainless(o.clean);
  // heavy frame
  k.R(0, 1, 16, 31, X.dk); k.V(0, 1, 31, X.lt); k.H(0, 1, 16, X.hi);
  if (!open) {
    k.R(1, 2, 14, 30, X.md);
    for (let x = 2; x < 15; x += 3) k.V(x, 3, 28, mix(X.md, X.lt, 0.5));
    k.V(1, 2, 30, X.hi); k.V(14, 2, 30, X.dk);
    // chrome lever latch + hinges
    k.R(11, 14, 4, 3, CHROME.lt); k.H(11, 14, 4, CHROME.hi); k.R(12, 17, 2, 4, CHROME.md); k.P(12, 17, CHROME.hi);
    k.R(1, 6, 2, 3, CHROME.md); k.R(1, 24, 2, 3, CHROME.md);
    k.R(4, 7, 6, 3, o.clean ? PAL.white : PAL.paper_d); k.H(5, 8, 4, PAL.blue_d); // WALK-IN label
    k.R(1, 30, 14, 2, PAL.g2);
    if (!o.clean) { k.S(1, 2, 14, 30, 'rgba(90,80,60,0.3)', 0.04); k.rust(1, 26, 14, 6, 3); k.drip(12, 21, 6, 'rgba(90,70,40,0.4)'); }
  } else {
    // warm dark inside: strip curtain, shelves, cicada shells heaped on the floor
    k.R(1, 2, 14, 30, PAL.ink);
    k.DV(1, 14, 14, 18, mix(PAL.night, PAL.brown_dd, 0.5), 0.0, 0.8);
    for (let x = 2; x < 15; x += 3) { k.V(x, 2, 18, 'rgba(196,212,230,0.12)'); k.P(x, 2, 'rgba(196,212,230,0.4)'); }
    k.H(2, 12, 12, mix(PAL.g2, PAL.night, 0.5)); k.H(2, 20, 12, mix(PAL.g2, PAL.night, 0.5));
    if (!o.clean) {
      const shells = [[3, 29], [5, 30], [7, 29], [9, 30], [11, 29], [12, 30], [4, 27], [8, 27], [10, 28], [6, 28], [3, 19], [7, 19], [10, 11], [5, 11]];
      for (const [x, y] of shells) { k.P(x, y, PAL.amber_d); k.P(x + 1, y, mix(PAL.amber, PAL.amber_d, 0.5)); }
      k.P(6, 28, PAL.amber); k.P(9, 29, PAL.amber);
    }
    // the door leaf swung inward against the hinge side (seen edge-on)
    k.R(1, 2, 3, 30, X.md); k.V(1, 2, 30, X.hi); k.V(3, 2, 30, X.dk);
  }
  return k.done();
}

// ---------------------------------------------------------------------------- dumbwaiter (wall)
function dumbwaiter(o) {
  const open = o.state === 'open';
  const k = new K(16, 28, 0, -14, seedOf('dumb', o.state, o.clean));
  const X = stainless(o.clean), W = woodSet(o.clean, 'oak');
  // frame set into the wall at counter height
  k.R(1, -10, 14, 15, W.md); k.H(1, -10, 14, W.hi); k.V(14, -10, 15, W.dk); k.R(1, 4, 14, 2, W.lt); k.H(1, 5, 14, W.dk); // sill
  if (!open) {
    k.R(3, -8, 10, 11, X.md); k.H(3, -8, 10, X.hi); k.V(12, -8, 11, X.dk);
    k.H(3, -3, 10, X.dk); k.H(3, -2, 10, X.lt); k.R(7, 0, 3, 1, CHROME.hi); // guillotine door, pull
  } else {
    k.R(3, -8, 10, 11, PAL.ink);
    k.DV(3, -8, 10, 11, mix(PAL.night, PAL.g1, 0.5), 0.5, 0);
    k.V(11, -8, 11, mix(PAL.tan, PAL.g3, 0.4)); k.V(12, -8, 11, mix(PAL.brown, PAL.g2, 0.4)); // the rope
    k.R(3, -9, 10, 1, X.md); // raised door edge
  }
  k.R(5, -13, 6, 2, o.clean ? PAL.white : PAL.paper_d); k.H(6, -12, 4, PAL.g3); // little bell + label
  if (!o.clean) k.S(1, -10, 14, 15, 'rgba(60,40,20,0.3)', 0.05);
  return k.done();
}

// ---------------------------------------------------------------------------- sink_big (2×1)
function sinkBig(o) {
  const k = new K(34, 34, -1, -18, seedOf('sinkb', o.clean));
  const X = stainless(o.clean);
  k.shadow(1, 13, 31, 3, SHADOW);
  // backsplash with two tall goosenecks
  k.R(0, -10, 32, 6, X.md); k.H(0, -10, 32, X.hi);
  for (const x of [9, 23]) { k.V(x, -17, 9, CHROME.md); k.V(x - 1, -17, 9, CHROME.hi); k.H(x, -17, 4, CHROME.lt); k.P(x + 3, -16, CHROME.md); k.P(x - 3, -7, CHROME.lt); k.P(x + 2, -7, CHROME.lt); }
  // basins
  k.R(0, -4, 32, 7, X.lt); k.H(0, -4, 32, X.hi);
  for (const x of [2, 17]) { k.R(x, -3, 13, 5, mix(X.dd, PAL.night, 0.3)); k.H(x, -3, 13, PAL.night); k.P(x + 6, 0, PAL.g3); }
  if (!o.clean) { k.R(18, -1, 11, 2, mix(PAL.g2, PAL.brown_d, 0.4)); k.P(22, -1, PAL.g3); } // gray standing water
  // legs + bottom shelf + front apron
  k.R(0, 3, 32, 2, X.md); k.H(0, 4, 32, X.dk);
  for (const x of [1, 15, 29]) { k.R(x, 5, 2, 9, X.md); k.V(x, 5, 9, X.hi); }
  k.R(1, 10, 30, 2, X.dk); k.H(1, 10, 30, X.lt);
  if (!o.clean) { k.rust(0, -10, 32, 15, 4); k.drip(5, 5, 6, 'rgba(135,70,40,0.5)'); }
  return k.done();
}

// ---------------------------------------------------------------------------- shelf_pantry (2×1)
function shelfPantry(o) {
  const k = new K(34, 46, -1, -32, seedOf('pantry', o.variant, o.clean));
  const S = steelSet(o.clean, 'gray');
  k.shadow(1, 12, 31, 3, SHADOW);
  for (const x of [0, 30]) { k.R(x, -30, 2, 44, S.md); k.V(x, -30, 44, S.hi); }
  const shelves = [-29, -16, -3, 10];
  for (const y of shelves) { k.R(0, y, 32, 2, S.lt); k.H(0, y, 32, S.hi); k.H(0, y + 1, 32, S.dk); }
  const labels = [PAL.red_d, PAL.green, PAL.yellow, PAL.orange_d, PAL.blue, PAL.red];
  const can = (x, y, c, dent) => {
    const cc = o.clean ? c : mix(c, PAL.g3, 0.4);
    k.R(x, y - 7, 5, 7, CHROME.md); k.V(x, y - 7, 7, CHROME.hi); k.V(x + 4, y - 7, 7, CHROME.dk);
    k.R(x, y - 5, 5, 3, cc); k.H(x, y - 5, 5, lt(cc, 0.2)); k.H(x, y - 7, 5, CHROME.lt);
    if (!o.clean) { k.P(x + 1 + (dent ? 2 : 0), y - 1, PAL.rust); k.P(x + 3, y - 7, PAL.rust); if (dent) k.P(x + 4, y - 4, CHROME.dd); }
  };
  for (let s = 0; s < 3; s++) {
    for (let i = 0; i < 5; i++) {
      if (!o.clean && (s * 5 + i + o.variant) % 7 === 3) continue; // gaps
      can(2 + i * 6, shelves[s + 1], labels[(s * 2 + i + o.variant) % labels.length], (i + s) % 4 === 1);
    }
  }
  // a fallen can on its side + flour sacks at the bottom
  if (!o.clean) { k.R(20, -6, 7, 4, CHROME.md); k.R(22, -6, 3, 4, PAL.red_d); k.E(26, -4, 1, 2, CHROME.lt); }
  for (let i = 0; i < 2; i++) { const x = 3 + i * 13; k.R(x, 6, 11, 4, o.clean ? PAL.paper : PAL.paper_d); k.H(x, 6, 11, PAL.white); k.H(x + 2, 8, 6, PAL.g4); }
  if (!o.clean) k.S(0, -30, 32, 44, 'rgba(140,90,50,0.25)', 0.02);
  return k.done();
}

// ---------------------------------------------------------------------------- vending_machine
function vending(o) {
  const k = new K(18, 46, -1, -32, seedOf('vend', o.clean));
  const body = o.clean ? { hi: mix(PAL.red_l, PAL.paper, 0.55), md: mix(PAL.red_l, PAL.paper, 0.25), dk: PAL.red_d } : { hi: mix(PAL.red_l, PAL.paper_d, 0.55), md: mix(PAL.red, PAL.g4, 0.45), dk: mix(PAL.red_d, PAL.g2, 0.5) };
  k.shadow(1, 12, 14, 3, SHADOW);
  k.R(0, -30, 16, 43, body.md); k.V(0, -30, 43, body.hi); k.V(15, -30, 43, body.dk); k.H(0, -30, 16, body.hi);
  // big front panel: TAB on pink, a lime FRESCA band
  k.R(2, -28, 9, 22, o.clean ? mix(PAL.red_l, PAL.white, 0.45) : mix(PAL.red_l, PAL.paper_d, 0.55));
  k.text(3, -25, 'TAB', o.clean ? PAL.crimson : mix(PAL.crimson, PAL.g3, 0.4));
  k.R(2, -17, 9, 5, o.clean ? mix(PAL.yellow, PAL.green_l, 0.5) : mix(PAL.yellow, PAL.g4, 0.45)); k.H(3, -15, 7, o.clean ? PAL.green_d : PAL.g3);
  k.R(3, -11, 7, 3, o.clean ? PAL.white : PAL.paper_d); k.H(4, -10, 5, PAL.g3);
  // selection buttons, coin slot, coin return, delivery chute
  const sel = [PAL.red_l, PAL.yellow, PAL.orange, PAL.green_l, PAL.red_l, PAL.blue_l];
  for (let i = 0; i < 6; i++) { k.R(12, -27 + i * 3, 3, 2, o.clean ? sel[i] : mix(sel[i], PAL.g3, 0.5)); k.P(12, -27 + i * 3, o.clean ? PAL.white : PAL.g5); }
  k.R(12, -8, 3, 3, CHROME.md); k.P(13, -7, PAL.ink);
  k.R(3, 3, 10, 6, PAL.ink); k.H(3, 3, 10, CHROME.lt);
  k.R(0, 12, 16, 1, PAL.g1);
  if (!o.clean) {
    k.text(4, -4, '', PAL.ink); k.R(3, -4, 9, 3, PAL.paper); k.H(4, -3, 7, PAL.ink); // OUT OF ORDER tape
    k.S(0, -30, 16, 43, 'rgba(60,50,40,0.3)', 0.04); k.rust(0, 6, 16, 6, 3);
  }
  return k.done();
}

// ---------------------------------------------------------------------------- milk_cooler (2×1)
function milkCooler(o) {
  const k = new K(34, 26, -1, -10, seedOf('milk', o.clean));
  const body = o.clean ? { hi: PAL.white, md: PAL.g6, dk: PAL.g5, dd: PAL.g4 } : { hi: mix(PAL.paper, PAL.g5, 0.3), md: mix(PAL.paper_d, PAL.g4, 0.35), dk: mix(PAL.cream_d, PAL.g3, 0.4), dd: PAL.g3 };
  k.shadow(1, 13, 31, 3, SHADOW);
  // sliding glass lids, cartons visible inside
  k.R(0, -6, 32, 8, body.dk); k.H(0, -6, 32, body.hi);
  k.R(2, -5, 28, 6, mix(PAL.blue_dd, PAL.g1, 0.4));
  if (o.clean) for (let r = 0; r < 2; r++) for (let c = 0; c < 9; c++) { const x = 3 + c * 3, y = -4 + r * 3; k.R(x, y, 2, 2, PAL.white); k.P(x, y + 1, PAL.red); }
  else for (const [x, y] of [[4, -4], [7, -4], [13, -1], [22, -4], [25, -1]]) { k.R(x, y, 2, 2, PAL.paper_d); k.P(x, y + 1, PAL.red_d); }
  k.V(16, -5, 6, body.md); k.L(5, -5, 9, -1, 'rgba(196,212,230,0.4)'); k.L(20, -5, 24, -1, 'rgba(196,212,230,0.3)');
  // front: MILK in red on white
  k.R(0, 2, 32, 11, body.md); k.V(0, 2, 11, body.hi); k.V(31, 2, 11, body.dd); k.H(0, 12, 32, body.dd);
  k.R(9, 4, 14, 7, o.clean ? PAL.white : PAL.paper_d); k.text(10, 5, 'MILK', o.clean ? PAL.red : mix(PAL.red, PAL.g3, 0.35));
  if (!o.clean) { k.rust(0, 9, 32, 4, 4); k.L(26, 4, 29, 8, body.dd); k.S(0, 2, 32, 11, 'rgba(90,80,60,0.3)', 0.04); }
  return k.done();
}

export const KITCHEN = {
  caf_table: { build: cafTable, variants: 3 },
  serving_line: { build: servingLine },
  tray_rack: { build: trayRack },
  stove: { build: stove },
  mixer: { build: mixer },
  freezer_door: { build: freezerDoor },
  dumbwaiter: { build: dumbwaiter },
  sink_big: { build: sinkBig },
  shelf_pantry: { build: shelfPantry, variants: 3 },
  vending_machine: { build: vending },
  milk_cooler: { build: milkCooler },
};
export { BRASS };
