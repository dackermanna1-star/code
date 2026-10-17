// Props B — computer lab & science rooms: computer_desk printer lab_bench lab_stool fume_hood eyewash
// specimen_shelf chem_cabinet skeleton. TRS-80 silver-and-black, beige plastic, black epoxy, oak,
// formaldehyde yellow-green; the cicada nymph box is the only warm accent (amber).
import { K, PAL, mix, lt, dk, BRASS, CHROME, seedOf, woodSet, steelSet, SHADOW, SHADOW_SOFT, paper } from './props_b_kit.js';

const BEIGE = (clean) => clean
  ? { hi: PAL.white, lt: mix(PAL.paper, PAL.g6, 0.5), md: mix(PAL.cream, PAL.g5, 0.5), dk: mix(PAL.cream_d, PAL.g4, 0.5), dd: PAL.g3 }
  : { hi: mix(PAL.paper, PAL.cream, 0.5), lt: mix(PAL.cream_l, PAL.g5, 0.5), md: mix(PAL.cream_d, PAL.g4, 0.5), dk: mix(PAL.cream_d, PAL.g3, 0.6), dd: PAL.g2 };
const TRS = { hi: mix(PAL.g6, PAL.moon_l, 0.2), lt: PAL.g5, md: PAL.g4, dk: PAL.g1, dd: PAL.ink };

/** Small steel-frame computer table, top surface y -2..3. */
function smallTable(k, o) {
  const S = steelSet(o.clean, 'tan'), W = woodSet(o.clean, 'maple');
  k.shadow(1, 12, 14, 3, SHADOW_SOFT);
  for (const x of [1, 13]) { k.R(x, 4, 2, 10, S.md); k.V(x, 4, 10, S.hi); }
  k.R(1, 9, 14, 1, S.dk);
  k.R(0, -2, 16, 5, W.lt); k.H(0, -2, 16, W.hi); k.R(0, 3, 16, 2, W.dk); k.H(0, 4, 16, W.dd);
}

// ---------------------------------------------------------------------------- computer_desk (TRS-80 Model I)
function computerDesk(o) {
  const on = o.state === 'on';
  const k = new K(20, 36, -2, -20, seedOf('trs', o.state, o.clean, o.frame));
  smallTable(k, o);
  // cassette recorder (CTR-41) on the right
  k.R(11, -4, 6, 3, PAL.g1); k.H(11, -4, 6, PAL.g3); k.R(12, -3, 3, 1, PAL.g4); k.P(16, -3, PAL.red_d);
  // keyboard/computer unit in front: silver top, black key field
  k.R(1, -1, 12, 4, TRS.lt); k.H(1, -1, 12, TRS.hi); k.R(2, 0, 9, 2, TRS.dk);
  for (let x = 2; x < 11; x += 2) { k.P(x, 0, TRS.md); k.P(x + 1, 1, TRS.md); }
  k.H(1, 3, 12, TRS.dd);
  // monitor (modified RCA set): black case, silver-gray bezel
  k.R(2, -17, 11, 13, TRS.dk); k.H(2, -17, 11, PAL.g3); k.V(12, -17, 13, TRS.dd);
  k.R(3, -16, 9, 10, TRS.md); k.H(3, -16, 9, TRS.hi);
  const sx = 4, sy = -15, sw = 7, sh = 7;
  if (on) {
    k.R(sx, sy, sw, sh, mix(PAL.crt, PAL.green_d, 0.55));
    k.H(sx, sy, sw, mix(PAL.crt, PAL.green, 0.4));
    for (let y = sy + 1; y < sy + sh - 1; y += 2) k.H(sx + 1, y, 3 + ((y * 3) % 4), PAL.crt);
    if (!(o.frame % 2)) k.R(sx + 1, sy + sh - 2, 1, 1, PAL.white);
    k.P(sx, sy, PAL.fluor);
    k.tint(7, -10, 7, 6, PAL.crt, 0.22);
  } else {
    k.R(sx, sy, sw, sh, mix(PAL.blue_dd, PAL.g1, 0.4));
    k.P(sx + 1, sy + 1, PAL.moon); k.P(sx + 2, sy + 1, PAL.blue_l); k.P(sx + 1, sy + 2, PAL.blue_l); // reflection
    k.L(sx + 4, sy + 1, sx + 6, sy + 3, mix(PAL.blue_d, PAL.g2, 0.5));
  }
  k.R(5, -5, 5, 1, TRS.dk); k.P(10, -5, on ? PAL.red_l : PAL.g2); // power LED
  if (!o.clean) { k.S(2, -17, 11, 13, 'rgba(160,150,130,0.25)', 0.05); k.P(4, 2, PAL.g3); }
  return k.done();
}

// ---------------------------------------------------------------------------- printer (dot matrix)
function printer(o) {
  const k = new K(18, 34, -1, -18, seedOf('prn', o.clean));
  smallTable(k, o);
  const B = BEIGE(o.clean);
  // tractor-feed paper rising out the back
  const pc = o.clean ? PAL.white : PAL.paper;
  k.R(3, -10, 10, 4, pc); for (let y = -10; y < -6; y += 2) { k.P(3, y, PAL.g5); k.P(12, y, PAL.g5); } k.H(4, -9, 8, mix(pc, PAL.mint, 0.45));
  // body: low beige case, platen slot, smoked lid, status lights
  k.R(0, -6, 16, 6, B.md); k.H(0, -6, 16, B.hi); k.R(0, -5, 16, 2, B.lt); k.V(15, -6, 6, B.dk); k.H(0, -1, 16, B.dd);
  k.R(2, -5, 12, 1, PAL.ink); k.R(3, -4, 8, 1, mix(PAL.g2, PAL.amber_dd, 0.3)); k.P(12, -3, PAL.amber_l); k.P(14, -3, PAL.g3);
  // fanfold spilling over the front edge to the floor
  k.R(4, 0, 8, 4, pc); k.H(4, 3, 8, PAL.paper_d);
  k.R(5, 9, 8, 4, pc); k.H(5, 9, 8, PAL.paper_d); k.H(5, 11, 8, PAL.paper_d); k.H(5, 12, 8, dk(pc, 0.25));
  k.L(4, 4, 5, 8, pc);
  if (!o.clean) { k.S(1, -7, 14, 7, 'rgba(120,100,70,0.3)', 0.06); k.P(9, 10, PAL.brown); }
  return k.done();
}

// ---------------------------------------------------------------------------- lab_bench (2×1)
function labBench(o) {
  const k = new K(34, 30, -1, -14, seedOf('labb', o.clean));
  const W = woodSet(o.clean, 'oak');
  k.shadow(1, 13, 31, 3, SHADOW);
  // oak cabinets with doors
  k.R(1, 2, 30, 12, W.md); k.V(1, 2, 12, W.lt);
  for (let i = 0; i < 3; i++) { const x = 2 + i * 10; k.frame(x, 3, 9, 10, W.dk); k.P(x + 7, 7, BRASS.lt); }
  k.R(1, 13, 30, 1, W.dd);
  // black epoxy top with a sheen, sink well, gooseneck + brass gas taps
  const ep = PAL.g1, epL = mix(PAL.g2, PAL.blue_d, 0.4);
  k.R(0, -4, 32, 6, ep); k.H(0, -4, 32, epL); k.R(0, 2, 32, 1, PAL.ink);
  k.L(4, -3, 10, -3, mix(PAL.g3, PAL.blue_l, 0.3));
  k.R(20, -3, 8, 4, PAL.ink); k.H(20, 0, 8, PAL.g2); k.P(24, -1, PAL.g3);
  k.V(24, -9, 6, CHROME.md); k.H(24, -9, 3, CHROME.lt); k.P(26, -8, CHROME.lt); k.P(24, -9, CHROME.hi);
  for (const x of [8, 12]) { k.R(x, -6, 2, 2, BRASS.md); k.P(x, -6, BRASS.hi); k.P(x + 1, -7, BRASS.dk); }
  if (!o.clean) {
    // chemical stains, a scorch, initials carved in the cabinet
    for (const [x, y] of [[3, -2], [5, -1], [14, 0], [16, -2]]) k.P(x, y, mix(PAL.g4, PAL.paper, 0.3));
    k.E(15, -1, 2, 1, mix(PAL.g2, PAL.brown, 0.4));
    k.H(5, 9, 3, W.dd); k.P(6, 10, W.dd);
    k.S(1, 2, 30, 12, 'rgba(30,20,10,0.3)', 0.04);
  }
  return k.done();
}

// ---------------------------------------------------------------------------- lab_stool
function labStool(o) {
  const k = new K(16, 26, 0, -10, seedOf('stool', o.variant, o.clean));
  const W = woodSet(o.clean, 'oak');
  k.shadowE(8, 13, 6, 2, SHADOW_SOFT);
  // four splayed legs and a stretcher ring, then the round seat seen from above
  k.L(4, 2, 2, 13, W.md); k.L(11, 2, 13, 13, W.dk); k.L(6, 3, 6, 12, W.dk); k.L(9, 3, 10, 12, W.dd);
  k.H(3, 9, 10, W.md); k.H(4, 10, 8, W.dd);
  k.E(8, -1, 6, 3, W.lt); k.E(7, -2, 4, 1, W.hi); k.H(3, 2, 10, W.dk); k.H(4, 3, 8, W.dd);
  if (!o.clean && o.variant % 2) { k.P(9, -1, W.md); k.P(10, -1, W.md); k.P(10, 0, W.dk); } // carved
  return k.done();
}

// ---------------------------------------------------------------------------- fume_hood (2×1)
function fumeHood(o) {
  const k = new K(34, 50, -1, -36, seedOf('fume', o.clean));
  const S = o.clean ? steelSet(true, 'tan') : steelSet(false, 'tan');
  k.shadow(1, 13, 31, 3, SHADOW);
  // duct to the ceiling, hood housing
  k.R(12, -36, 8, 6, S.md); k.V(12, -36, 6, S.hi); k.V(19, -36, 6, S.dk);
  k.R(0, -30, 32, 7, S.lt); k.H(0, -30, 32, S.hi); k.text(10, -28, '', PAL.ink); k.R(9, -28, 14, 3, S.md);
  // sides
  k.R(0, -23, 3, 37, S.md); k.V(0, -23, 37, S.hi); k.R(29, -23, 3, 37, S.dk);
  // interior behind the sash: dark, stained, a flask on a ring stand
  k.R(3, -23, 26, 21, mix(PAL.g1, PAL.green_dd, 0.4));
  k.DV(3, -23, 26, 21, PAL.night, 0.6, 0.1);
  k.R(18, -12, 1, 10, PAL.g3); k.H(15, -9, 6, PAL.g3); k.E(17, -6, 3, 2, mix(PAL.moon, PAL.green_l, 0.4)); k.R(16, -11, 2, 3, mix(PAL.moon, PAL.green_l, 0.4));
  k.E(17, -5, 2, 1, o.clean ? PAL.lamp_green : mix(PAL.amber, PAL.green_d, 0.5));
  // glass sash (half raised): reflective pane + frame + handle
  k.glass(3, -23, 26, 12, { clean: o.clean, seed: 2 });
  k.A(3, -23, 26, 12, 'rgba(10,14,20,0.25)');
  k.H(3, -11, 26, S.lt); k.H(3, -10, 26, S.dk); k.H(8, -12, 16, CHROME.lt);
  // work surface + base cabinet
  k.R(3, -2, 26, 3, PAL.g1); k.H(3, -2, 26, PAL.g2);
  k.R(0, 1, 32, 13, S.md); k.frame(2, 2, 13, 11, S.dk); k.frame(17, 2, 13, 11, S.dk); k.P(13, 7, CHROME.lt); k.P(19, 7, CHROME.lt);
  k.R(0, 13, 32, 1, S.dd);
  if (!o.clean) { k.S(3, -23, 26, 21, 'rgba(120,110,60,0.3)', 0.05); k.drip(6, -20, 9, 'rgba(160,150,80,0.35)'); k.rust(0, 1, 32, 13, 2); }
  return k.done();
}

// ---------------------------------------------------------------------------- eyewash (wall)
function eyewash(o) {
  const k = new K(20, 32, -2, -16, seedOf('eyew', o.clean));
  const yel = o.clean ? PAL.yellow : mix(PAL.mustard, PAL.cream_d, 0.3);
  // sign
  k.R(0, -15, 16, 12, yel); k.frame(0, -15, 16, 12, mix(yel, PAL.brown_d, 0.5));
  k.text(3, -14, 'EYE', PAL.ink); k.text(1, -8, 'WASH', PAL.ink);
  // supply pipe, bowl with twin nozzles, push flag
  k.R(7, -3, 2, 5, CHROME.md); k.V(7, -3, 5, CHROME.hi);
  const bowl = o.clean ? PAL.green_l : mix(PAL.green, PAL.g3, 0.4);
  k.E(8, 4, 5, 2, bowl); k.E(8, 4, 3, 1, mix(bowl, PAL.ink, 0.5)); k.P(6, 3, CHROME.hi); k.P(10, 3, CHROME.hi);
  k.R(13, 1, 3, 3, yel); k.P(13, 1, PAL.white);
  k.R(7, 6, 2, 9, CHROME.md); k.V(7, 6, 9, CHROME.lt);
  if (!o.clean) { k.drip(8, 6, 4, 'rgba(135,70,40,0.5)'); k.S(0, -15, 16, 12, 'rgba(90,70,40,0.35)', 0.06); }
  return k.done();
}

// ---------------------------------------------------------------------------- specimen_shelf (2×1)
function specimenShelf(o) {
  const k = new K(34, 46, -1, -32, seedOf('spec', o.clean));
  const W = woodSet(o.clean, 'oak');
  k.shadow(1, 12, 31, 3, SHADOW);
  k.R(0, -30, 32, 44, W.dk); k.V(0, -30, 44, W.md); k.V(31, -30, 44, W.dd); k.H(0, -30, 32, W.lt);
  k.R(2, -28, 28, 40, mix(W.dd, PAL.night, 0.4));
  const shelves = [-17, -4, 9];
  for (const y of shelves) { k.R(1, y, 30, 2, W.md); k.H(1, y, 30, W.lt); }
  // jars of formaldehyde (yellow-green), labels, pale specimens inside
  const liq = o.clean ? mix(PAL.yellow_l, PAL.mint, 0.5) : mix(PAL.mustard, PAL.green_l, 0.45), liqD = dk(liq, 0.3);
  const jar = (x, y, w, h, spec) => {
    k.R(x, y - h, w, h, liq); k.V(x, y - h, h, lt(liq, 0.3)); k.V(x + w - 1, y - h, h, liqD);
    k.R(x, y - h - 1, w, 1, PAL.g4); k.H(x, y - h - 2, w, PAL.g2);
    k.R(x + 1, y - 4, w - 2, 2, o.clean ? PAL.white : PAL.paper_d);
    if (spec === 'frog') { k.R(x + 1, y - h + 2, w - 2, 2, mix(PAL.paper_d, PAL.g4, 0.3)); k.P(x + 1, y - h + 4, mix(PAL.paper_d, PAL.g4, 0.3)); }
    if (spec === 'coil') { k.ring(x + w / 2 | 0, y - h + 3, 1, 1, mix(PAL.paper_d, PAL.brown, 0.3)); }
    if (spec === 'blob') k.E(x + (w >> 1), y - h + 3, 1, 2, mix(PAL.flesh_d, PAL.paper_d, 0.5));
  };
  jar(3, -17, 5, 9, 'frog'); jar(10, -17, 4, 7, 'coil'); jar(16, -17, 6, 10, 'blob'); jar(24, -17, 4, 8, 'coil');
  jar(3, -4, 4, 7, 'blob'); jar(9, -4, 5, 9, 'frog');
  // the cicada nymph collection: a glass-topped box, rows of amber shells pinned
  k.R(16, -11, 13, 7, PAL.brown_d); k.R(17, -10, 11, 5, PAL.paper);
  for (let r = 0; r < 2; r++) for (let c = 0; c < 4; c++) { const x = 18 + c * 3, y = -9 + r * 2; k.P(x, y, PAL.amber); k.P(x + 1, y, PAL.amber_d); }
  k.P(17, -10, PAL.moon_l); k.L(18, -10, 21, -10, 'rgba(196,212,230,0.4)');
  // bottom: old textbooks
  for (let i = 0; i < 6; i++) { const c = [PAL.red_d, PAL.green_d, PAL.blue_d, PAL.brown, PAL.mustard_d, PAL.g3][i]; k.R(3 + i * 3, 2, 3, 7, o.clean ? c : mix(c, PAL.g2, 0.3)); k.H(3 + i * 3, 2, 3, lt(c, 0.2)); }
  k.R(22, 5, 7, 4, PAL.g4);
  if (!o.clean) { k.S(1, -30, 30, 44, 'rgba(150,140,120,0.25)', 0.03); k.R(27, -24, 2, 7, liqD); }
  return k.done();
}

// ---------------------------------------------------------------------------- chem_cabinet
function chemCabinet(o) {
  const k = new K(18, 42, -1, -28, seedOf('chem', o.clean));
  const S = steelSet(o.clean, 'gray');
  k.shadow(1, 12, 14, 3, SHADOW);
  k.R(0, -26, 16, 40, S.md); k.V(0, -26, 40, S.hi); k.V(15, -26, 40, S.dk); k.H(0, -26, 16, S.lt);
  // glass upper doors with bottles
  k.R(2, -24, 12, 16, PAL.night);
  const bottles = [[3, -15, PAL.brown], [5, -16, PAL.moon], [7, -15, PAL.brown_d], [10, -16, PAL.g4], [12, -15, PAL.amber_d], [4, -22, PAL.brown], [8, -22, PAL.moon], [11, -21, PAL.green_l]];
  for (const [x, y, c] of bottles) { k.R(x, y, 2, 5, o.clean ? c : mix(c, PAL.g2, 0.3)); k.P(x, y - 1, PAL.g3); k.P(x, y + 2, PAL.paper_d); }
  k.H(2, -17, 12, S.lt);
  for (const gx of [2, 8]) { k.A(gx, -24, 6, 16, 'rgba(40,60,90,0.18)'); k.L(gx + 4, -24, gx, -18, 'rgba(196,212,230,0.55)'); k.L(gx + 5, -21, gx + 2, -17, 'rgba(151,175,203,0.35)'); }
  k.V(7, -24, 16, S.md);
  // lower doors + NFPA diamonds
  k.frame(1, -6, 7, 18, S.dk); k.frame(8, -6, 7, 18, S.dk);
  const dia = (x, y) => { k.P(x, y - 2, PAL.red); k.P(x - 1, y - 1, PAL.blue); k.P(x + 1, y - 1, PAL.red); k.P(x, y - 1, PAL.white); k.P(x - 2, y, PAL.blue); k.P(x + 2, y, PAL.yellow); k.P(x - 1, y + 1, PAL.white); k.P(x + 1, y + 1, PAL.yellow); k.P(x, y + 2, PAL.white); k.P(x, y, PAL.g6); };
  dia(4, 0); dia(11, 0);
  k.P(7, 4, CHROME.lt); k.P(9, 4, CHROME.lt);
  if (!o.clean) { k.rust(0, -26, 16, 40, 3); k.L(9, -22, 12, -18, PAL.moon_l); k.P(10, -20, PAL.ink); } // a cracked pane
  return k.done();
}

// ---------------------------------------------------------------------------- skeleton
function skeleton(o) {
  const k = new K(18, 42, -1, -28, seedOf('skel', o.clean));
  const bone = o.clean ? PAL.white : mix(PAL.paper, PAL.cream_d, 0.45), boneD = o.clean ? PAL.g5 : mix(PAL.cream_d, PAL.brown, 0.3), boneDD = mix(boneD, PAL.brown_d, 0.5);
  const iron = PAL.g2;
  k.shadowE(8, 13, 6, 2, SHADOW_SOFT);
  // stand: wheeled base, pole, hook through the skull
  k.H(3, 13, 10, iron); k.P(3, 12, PAL.g3); k.P(12, 12, PAL.g3); k.R(7, 11, 2, 2, iron);
  k.V(8, -26, 38, iron); k.H(8, -26, 2, iron);
  // skull (slightly turned), jaw
  k.E(8, -21, 3, 3, bone); k.R(6, -18, 4, 2, bone); k.P(6, -21, PAL.ink); k.P(9, -21, PAL.ink); k.P(8, -19, boneDD); k.H(6, -17, 4, boneD);
  k.P(6, -23, PAL.white);
  // spine, ribcage, pelvis
  k.V(8, -16, 15, boneD);
  for (let i = 0; i < 4; i++) { const y = -14 + i * 2; k.H(5 + (i > 2 ? 1 : 0), y, 7 - (i > 2 ? 2 : 0), bone); k.P(8, y, boneDD); }
  k.R(5, -4, 7, 3, bone); k.P(7, -3, boneDD); k.P(10, -3, boneDD);
  // arms hanging (one hand drifted up, as if mid-gesture)
  k.L(5, -14, 3, -6, bone); k.L(3, -6, 3, 0, boneD); k.P(3, 1, bone); k.P(2, 1, boneD);
  k.L(11, -14, 13, -7, bone); k.L(13, -7, 14, -11, boneD); k.P(14, -12, bone);
  // legs
  k.L(6, -1, 6, 6, bone); k.L(6, 6, 6, 11, boneD); k.L(10, -1, 10, 6, bone); k.L(10, 6, 10, 11, boneD);
  k.P(5, 11, bone); k.P(11, 11, bone);
  if (!o.clean) { k.P(9, -12, PAL.g3); k.P(4, -7, PAL.g3); } // missing wire joints
  return k.done();
}

export const LAB = {
  computer_desk: { build: computerDesk, frames: 2, fps: 2, animStates: ['on'] },
  printer: { build: printer },
  lab_bench: { build: labBench },
  lab_stool: { build: labStool, variants: 2 },
  fume_hood: { build: fumeHood },
  eyewash: { build: eyewash },
  specimen_shelf: { build: specimenShelf },
  chem_cabinet: { build: chemCabinet },
  skeleton: { build: skeleton },
};
