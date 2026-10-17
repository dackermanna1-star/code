// Props A — doors & passages: door_class door_double door_metal door_glass door_side door_front
// gate_accordion trapdoor stair_spiral coal_chute.
//
// North-wall doors fill the two face rows (16×32 per leaf; footprint y 0..15 = face_high, 16..31 =
// face_low; y 32+ is floor). Closed doors are y-sorted; 'open' doors are drawn in the wall layer, so
// their art is a dark doorway with the leaf swung inward (away from camera) on the hinge side.
// State cues: locked = papered/blinded glass + deadbolt or hasp; jammed = leaf skewed in a splintered
// frame with drag marks on the floor; chained = chain through the pulls + brass padlock.
import { K, PAL, mix, lt, dk, OUT, woodSet, steelSet, CHROME, BRASS, seedOf, SHADOW_SOFT } from './props_a_kit.js';

// ---- shared hardware --------------------------------------------------------------------------
export function padlock(k, x, y, { open = false, clean = false } = {}) {
  // shackle (2 px above body), body 3×4 brass
  const sh = clean ? PAL.g6 : PAL.g5;
  if (!open) { k.H(x, y, 3, sh); k.P(x, y + 1, sh); k.P(x + 2, y + 1, sh); }
  else { k.H(x + 1, y - 1, 3, sh); k.P(x + 3, y, sh); k.P(x + 2, y + 1, sh); }
  k.R(x - 1, y + 2, 5, 4, clean ? BRASS.lt : BRASS.md);
  k.H(x - 1, y + 2, 5, BRASS.hi);
  k.V(x + 3, y + 3, 3, BRASS.dk);
  k.H(x - 1, y + 5, 5, BRASS.dd);
  k.P(x + 1, y + 4, OUT);
}
/** Chain: alternating link pixels along a polyline of points. */
export function chain(k, pts, clean = false) {
  const a = clean ? PAL.g6 : PAL.g5, b = clean ? PAL.g4 : PAL.g3, s = PAL.g2;
  let n = 0;
  for (let i = 0; i + 1 < pts.length; i++) {
    const [x0, y0] = pts[i], [x1, y1] = pts[i + 1];
    const steps = Math.max(Math.abs(x1 - x0), Math.abs(y1 - y0));
    for (let t = 0; t <= steps; t++, n++) {
      const x = Math.round(x0 + ((x1 - x0) * t) / steps), y = Math.round(y0 + ((y1 - y0) * t) / steps);
      if (n % 3 === 2) { k.P(x, y, b); continue; }
      k.P(x, y, a); k.P(x, y + 1, s);
    }
  }
}
function knob(k, x, y, clean) {
  k.R(x, y, 2, 2, clean ? BRASS.lt : BRASS.md);
  k.P(x, y, BRASS.hi);
  k.P(x + 1, y + 1, BRASS.dk);
  k.P(x + 1, y + 2, 'rgba(0,0,0,0.35)');
}
function roomNumber(label) {
  const m = String(label || '').match(/\d+[A-Z]?/i);
  return m ? m[0].slice(0, 3).toUpperCase() : '';
}
/** Wired glass: dark cold pane, diamond wire mesh, a highlight streak. */
function wiredGlass(k, x, y, w, h, clean, seed = 0) {
  k.glass(x, y, w, h, { clean, seed });
  const wire = mix(PAL.g3, PAL.blue_d, 0.4);
  for (let j = 0; j < h; j++) for (let i = 0; i < w; i++) if (((i + j) % 3 === 0) || ((i - j + 30) % 3 === 0 && j % 2 === 0)) {
    if ((x + i + y + j) % 2 === 0) k.P(x + i, y + j, wire);
  }
  k.P(x + 1, y + 1, PAL.moon_l);
}
/** Dark doorway seen through an open door: black near the top, fading so the threshold shows. */
function doorway(k, x, y, w, h) {
  k.R(x, y, w, Math.floor(h * 0.45), PAL.ink);
  k.DV(x, y + Math.floor(h * 0.45), w, h - Math.floor(h * 0.45), PAL.ink, 0.95, 0.15);
  k.A(x, y, w, h, 'rgba(8,8,16,0.35)');
}
function casing(k, x, y, w, h, set, { top = true } = {}) {
  // 2-px moulded trim: dark reveal outside, lit bevel inside (top-left light)
  k.R(x, y, 2, h, set.md); k.V(x, y, h, set.dk); k.V(x + 1, y, h, set.lt);
  k.R(x + w - 2, y, 2, h, set.md); k.V(x + w - 1, y, h, set.dd); k.V(x + w - 2, y, h, set.dk);
  if (top) { k.R(x, y, w, 2, set.md); k.H(x, y, w, set.dk); k.H(x + 1, y + 1, w - 2, set.hi); }
}
function dragMarks(k, x, y, w, clean) {
  if (clean) return;
  const c = 'rgba(196,189,176,0.30)';
  for (let i = 0; i < w; i++) { const yy = y + Math.round(Math.sin((i / w) * Math.PI) * 2); k.P(x + i, yy, c); if (i % 3 === 0) k.P(x + i, yy + 1, c); }
}

// ---- door_class -------------------------------------------------------------------------------
function doorClass(o) {
  const { state, clean } = o;
  const k = new K(16, 36, 0, 0, seedOf('door_class', state, o.variant, clean));
  const W = woodSet(clean, 'oak');
  const T = woodSet(clean, 'dark');
  casing(k, 0, 0, 16, 32, T);
  if (state === 'open') {
    doorway(k, 2, 2, 12, 30);
    // leaf swung inward on the left hinge: a narrow shadowed slab, its far edge catching light
    k.poly([[2, 2], [6, 0], [6, 27], [2, 31]], dk(W.md, 0.45));
    k.V(6, 0, 27, dk(W.lt, 0.15));
    k.V(5, 4, 7, mix(PAL.blue_dd, PAL.ink, 0.3)); // window seen edge-on
    k.P(5, 17, BRASS.dk);
    k.H(2, 31, 12, dk(T.dd, 0.3));
    return k.done({ outline: false });
  }
  // leaf
  k.wood(2, 2, 12, 29, W.md, { dark: W.dk, light: W.lt, vertical: true, density: 0.9 });
  k.V(2, 2, 29, W.lt);
  k.V(13, 2, 29, W.dk);
  // lower recessed panel
  k.frame(4, 22, 8, 6, W.dk); k.H(4, 22, 8, W.dd); k.V(11, 23, 5, W.hi); k.H(5, 27, 7, W.hi);
  // kick plate
  k.R(2, 28, 12, 3, clean ? BRASS.md : mix(BRASS.dk, PAL.g3, 0.4)); k.H(2, 28, 12, clean ? BRASS.hi : BRASS.md);
  // number plate
  const num = roomNumber(o.label);
  k.R(3, 2, 10, 7, T.dd); k.H(3, 2, 10, T.dk); k.H(3, 8, 10, dk(T.dd, 0.4));
  if (num) k.T(3 + Math.max(0, Math.floor((10 - (num.length * 4 - 1)) / 2)), 3, num, clean ? PAL.gold_l : PAL.gold);
  else { k.H(5, 5, 6, BRASS.dk); }
  // window: narrow wired glass at head height
  k.frame(5, 9, 6, 11, W.dd); k.V(10, 10, 9, W.hi);
  if (state === 'locked') {
    // papered over from inside, taped
    k.R(6, 10, 4, 9, clean ? PAL.paper : mix(PAL.paper_d, PAL.cream_d, 0.5));
    k.L(6, 10, 9, 18, mix(PAL.cream_d, PAL.brown, 0.3)); k.L(9, 10, 6, 18, mix(PAL.cream_d, PAL.brown, 0.3));
    k.H(6, 10, 4, 'rgba(240,236,226,0.5)');
  } else wiredGlass(k, 6, 10, 4, 9, clean, o.variant);
  // knob + escutcheon (+ deadbolt when locked)
  k.V(12, 19, 4, BRASS.dk);
  knob(k, 11, 20, clean);
  if (state === 'locked') { k.R(11, 16, 2, 2, BRASS.lt); k.P(11, 16, BRASS.hi); k.P(12, 17, OUT); }
  if (!clean) {
    // worn varnish around the knob, scuffs low, initials scratched
    k.D(9, 18, 3, 5, lt(W.md, 0.1), 0.4);
    k.S(2, 23, 12, 8, dk(W.md, 0.3), 0.08);
    k.grime(2, 10, 12, 21, 0.8);
    if (o.variant % 3 === 1) { k.L(3, 13, 4, 15, lt(W.md, 0.2)); k.P(4, 13, lt(W.md, 0.2)); }
  }
  if (state === 'jammed') {
    // leaf dropped & skewed: black wedge at the top latch corner, gap down the latch side,
    // splintered casing, a split in the lower panel, and drag marks on the floor
    k.poly([[8, 2], [14, 2], [14, 7]], PAL.ink);
    k.V(13, 7, 20, PAL.ink);
    k.P(14, 13, PAL.tan_l); k.P(15, 14, PAL.tan_l); k.P(14, 15, PAL.maple_l); k.P(14, 17, PAL.tan_l); k.P(15, 18, W.hi);
    k.L(5, 23, 9, 27, W.dd);
    k.R(2, 31, 12, 1, W.dd);
    dragMarks(k, 2, 32, 12, clean);
  }
  k.H(2, 31, 12, dk(T.dd, 0.2));
  return k.done({ outline: false });
}

// ---- door_double ------------------------------------------------------------------------------
function doorDouble(o) {
  const { state, clean } = o;
  const k = new K(32, 36, 0, 0, seedOf('door_double', state, o.variant, clean));
  const S = steelSet(clean, 'gray');
  const B = { hi: mix(S.hi, PAL.moon, 0.15), lt: mix(S.lt, PAL.blue_l, 0.18), md: mix(S.md, PAL.blue, 0.15), dk: mix(S.dk, PAL.blue_d, 0.2), dd: mix(S.dd, PAL.blue_dd, 0.3) };
  const F = steelSet(clean, 'gray');
  casing(k, 0, 0, 32, 32, { hi: F.hi, lt: F.lt, md: F.md, dk: F.dk, dd: F.dd });
  if (state === 'open') {
    doorway(k, 2, 2, 28, 30);
    k.poly([[2, 2], [6, 0], [6, 27], [2, 31]], dk(B.md, 0.45)); k.V(6, 0, 27, B.lt);
    k.poly([[29, 2], [25, 0], [25, 27], [29, 31]], dk(B.md, 0.55)); k.V(25, 0, 27, B.md);
    k.V(5, 5, 6, mix(PAL.blue_dd, PAL.ink, 0.3)); k.V(26, 5, 6, mix(PAL.blue_dd, PAL.ink, 0.3));
    k.H(2, 31, 28, PAL.ink);
    return k.done({ outline: false });
  }
  for (const [lx, flip] of [[2, false], [16, true]]) {
    k.R(lx, 2, 14, 29, B.md);
    k.V(lx, 2, 29, B.lt); k.V(lx + 13, 2, 29, B.dk);
    k.H(lx, 2, 14, B.hi);
    // window
    const wx = lx + 4;
    k.frame(wx - 1, 5, 7, 9, B.dd); k.H(wx - 1, 13, 7, B.hi);
    if (state === 'locked' && !flip) {
      k.R(wx, 6, 5, 7, clean ? PAL.paper : PAL.paper_d);
      k.H(wx + 1, 8, 3, PAL.g3); k.H(wx + 1, 10, 2, PAL.g3);
    } else if (state === 'jammed') {
      wiredGlass(k, wx, 6, 5, 7, clean, lx);
      // the fallen bleachers' planks pressed against the glass
      k.L(wx, 12, wx + 4, 7, dk(PAL.wood, 0.3)); k.L(wx, 11, wx + 4, 6, PAL.wood_d);
    } else wiredGlass(k, wx, 6, 5, 7, clean, lx);
    // push bar
    const by = 18;
    k.R(lx + 1, by, 12, 3, CHROME.md); k.H(lx + 1, by, 12, CHROME.hi); k.H(lx + 1, by + 2, 12, CHROME.dd);
    k.R(flip ? lx + 11 : lx + 1, by - 1, 2, 5, CHROME.dk);
    // kick plate
    k.R(lx, 27, 14, 4, clean ? CHROME.lt : mix(CHROME.md, PAL.brown, 0.2)); k.H(lx, 27, 14, CHROME.hi);
    if (!clean) { k.grime(lx, 14, 14, 17, 1); k.S(lx, 26, 14, 5, PAL.g3, 0.15); k.rust(lx, 24, 14, 7, 2); }
  }
  // astragal (centre meeting stile)
  k.V(15, 2, 29, B.dd); k.V(16, 2, 29, B.lt);
  if (state === 'jammed') {
    k.V(15, 2, 29, PAL.ink); k.V(16, 2, 29, PAL.ink); k.P(15, 6, PAL.g1);
    // right push bar bent inward
    k.R(17, 18, 12, 3, B.md); k.L(17, 19, 22, 21, CHROME.md); k.L(22, 21, 28, 19, CHROME.md); k.L(17, 18, 22, 20, CHROME.hi);
    dragMarks(k, 4, 32, 24, clean);
  }
  if (state === 'chained') {
    chain(k, [[4, 19], [9, 22], [15, 21], [21, 23], [27, 19]], clean);
    chain(k, [[4, 21], [10, 19], [16, 19], [22, 19], [27, 21]], clean);
    padlock(k, 15, 21, { clean });
  }
  k.H(2, 31, 28, dk(F.dd, 0.3));
  return k.done({ outline: false });
}

// ---- door_metal -------------------------------------------------------------------------------
function doorMetal(o) {
  const { state, clean } = o;
  const k = new K(16, 36, 0, 0, seedOf('door_metal', state, o.variant, clean));
  const S = steelSet(clean, 'green');
  const F = steelSet(clean, 'gray');
  casing(k, 0, 0, 16, 32, F);
  if (state === 'open') {
    doorway(k, 2, 2, 12, 30);
    k.poly([[2, 2], [6, 0], [6, 27], [2, 31]], dk(S.md, 0.5)); k.V(6, 0, 27, S.lt);
    return k.done({ outline: false });
  }
  k.R(2, 2, 12, 29, S.md);
  k.V(2, 2, 29, S.lt); k.V(13, 2, 29, S.dk); k.H(2, 2, 12, S.hi);
  // stencil: room code from label, else a hazard tag
  const code = (String(o.label || '').match(/[A-Z0-9]{1,3}/i) || [''])[0].toUpperCase();
  const st = clean ? PAL.cream_l : mix(PAL.cream, S.md, 0.35);
  if (code) k.T(2 + Math.floor((12 - (code.length * 4 - 1)) / 2), 5, code, st);
  else { k.R(4, 4, 8, 5, clean ? PAL.yellow : PAL.mustard); for (let i = 0; i < 8; i += 2) k.L(4 + i, 8, 5 + i, 4, OUT); k.frame(4, 4, 8, 5, PAL.ink); }
  // louvre vent low
  for (let j = 0; j < 4; j++) { k.H(4, 22 + j * 2, 8, S.dd); k.H(4, 23 + j * 2, 8, S.lt); }
  // lever handle
  k.R(10, 15, 2, 4, CHROME.dk); k.H(8, 16, 4, CHROME.lt); k.P(8, 17, CHROME.dd);
  if (!clean) {
    // dents (light rim top-left, shadow bottom-right), rust bleeding from the bottom and the hinge side
    for (const [dx, dy] of [[5, 12], [9, 19]]) { k.P(dx, dy, S.hi); k.P(dx + 1, dy, S.lt); k.P(dx + 1, dy + 1, S.dd); k.P(dx + 2, dy + 1, S.dk); }
    k.rust(2, 26, 12, 5, 4); k.drip(3, 12, 6); k.drip(12, 20, 8);
    k.grime(2, 10, 12, 21, 1.2);
  }
  if (state === 'locked') {
    // hasp + padlock
    k.R(11, 11, 3, 2, CHROME.dk); k.R(9, 11, 2, 4, CHROME.md); k.P(9, 11, CHROME.hi);
    padlock(k, 10, 12, { clean });
  }
  k.H(2, 31, 12, PAL.ink);
  return k.done({ outline: false });
}

// ---- door_glass -------------------------------------------------------------------------------
function doorGlass(o) {
  const { state, clean } = o;
  const k = new K(16, 36, 0, 0, seedOf('door_glass', state, o.variant, clean));
  const W = woodSet(clean, 'dark');
  casing(k, 0, 0, 16, 32, woodSet(clean, 'walnut'));
  if (state === 'open') {
    doorway(k, 2, 2, 12, 30);
    k.poly([[2, 2], [6, 0], [6, 27], [2, 31]], dk(W.md, 0.45)); k.V(6, 0, 27, W.lt);
    k.V(4, 3, 12, mix(PAL.g4, PAL.moon, 0.3)); // frosted pane edge-on
    return k.done({ outline: false });
  }
  k.wood(2, 2, 12, 29, W.md, { dark: W.dk, light: W.lt, vertical: true, density: 0.8 });
  k.V(2, 2, 29, W.lt); k.V(13, 2, 29, W.dk);
  // frosted pane x4..11, y4..17
  const fx = 4, fy = 4, fw = 8, fh = 14;
  k.frame(fx - 1, fy - 1, fw + 2, fh + 2, W.dd); k.H(fx - 1, fy + fh, fw + 2, W.hi);
  const fr = clean ? PAL.moon_l : mix(PAL.moon, PAL.g5, 0.5);
  k.R(fx, fy, fw, fh, fr);
  k.D(fx, fy, fw, fh, clean ? PAL.white : PAL.g6, 0.3);
  k.D(fx, fy, fw, fh, mix(fr, PAL.blue_l, 0.4), 0.18);
  if (state === 'locked') {
    // venetian blind drawn behind the glass
    for (let j = 0; j < fh; j += 2) k.H(fx, fy + j, fw, mix(PAL.cream_d, PAL.g3, 0.5));
    k.V(fx + 6, fy, fh, PAL.g3);
  }
  // gold leaf: a word arc + rule (label shown when it is short enough to letter)
  const gold = clean ? PAL.gold : mix(PAL.gold, PAL.cream_d, 0.4), gd = clean ? PAL.brass : PAL.brass_d;
  const lab = String(o.label || '').toUpperCase().replace(/[^A-Z0-9 ]/g, '');
  if (lab && lab.length <= 2) k.T(fx + 1, fy + 3, lab, gold);
  else {
    for (let i = 0; i < 6; i++) { const yy = fy + 3 + (i === 0 || i === 5 ? 1 : 0); k.P(fx + 1 + i, yy, gold); if (i % 2 === 0) k.P(fx + 1 + i, yy + 1, gd); else k.P(fx + 1 + i, yy - 1, gold); }
    k.H(fx + 2, fy + 6, 4, gold); k.P(fx + 3, fy + 7, gd);
  }
  k.H(fx + 1, fy + 9, 6, gd);
  // lower panel, knob, kick
  k.frame(4, 21, 8, 6, W.dk); k.H(5, 26, 7, W.hi);
  knob(k, 11, 18, clean);
  k.R(2, 28, 12, 3, clean ? BRASS.md : BRASS.dk); k.H(2, 28, 12, BRASS.lt);
  if (!clean) { k.grime(2, 16, 12, 15, 0.9); k.S(fx, fy, fw, fh, mix(fr, PAL.brown, 0.4), 0.06); }
  k.H(2, 31, 12, PAL.ink);
  return k.done({ outline: false });
}

// ---- door_side --------------------------------------------------------------------------------
function doorSide(o) {
  const { state, clean } = o;
  const k = new K(16, 26, 0, -8, seedOf('door_side', state, clean));
  const W = woodSet(clean, 'oak');
  const T = woodSet(clean, 'dark');
  // jamb stops at both ends (the wall's cut faces)
  k.R(4, 0, 8, 2, T.dk); k.H(4, 0, 8, T.lt);
  k.R(4, 14, 8, 2, T.dk); k.H(4, 14, 8, T.lt); k.H(4, 15, 8, T.dd);
  if (state === 'open') {
    // leaf swung against the north jamb: its top edge and a sliver of face
    k.R(4, -6, 9, 6, dk(W.md, 0.4)); k.H(4, -6, 9, W.lt); k.V(12, -6, 6, W.dk);
    k.R(4, 2, 8, 2, 'rgba(6,6,12,0.45)');
    return k.done({ outline: false });
  }
  // the leaf seen edge-on: lit left face, top edge, shadowed right face
  k.R(6, -7, 4, 21, W.md);
  k.V(6, -7, 21, W.hi); k.V(7, -7, 21, W.lt); k.V(9, -7, 21, W.dk);
  k.H(6, -7, 4, W.hi);
  k.P(5, 6, BRASS.lt); k.P(10, 6, BRASS.md); k.P(5, 7, BRASS.dk); k.P(10, 7, BRASS.dk); // knobs both sides
  k.P(9, -3, PAL.g4); k.P(9, 10, PAL.g4); // hinges
  if (state === 'locked') padlock(k, 10, 3, { clean });
  if (!clean) k.grime(6, 4, 4, 10, 1);
  k.shadow(10, -6, 2, 20, SHADOW_SOFT);
  return k.done({ outline: OUT });
}

// ---- door_front -------------------------------------------------------------------------------
function doorFront(o) {
  const { state, clean } = o;
  const k = new K(32, 36, 0, 0, seedOf('door_front', state, clean));
  const W = woodSet(clean, 'walnut');
  const stone = clean ? [PAL.cream_l, PAL.cream, PAL.cream_d] : [mix(PAL.cream, PAL.g5, 0.4), mix(PAL.cream_d, PAL.g4, 0.4), mix(PAL.g3, PAL.cream_d, 0.3)];
  // limestone surround with a fanlight
  k.R(0, 0, 32, 32, stone[1]);
  k.H(0, 0, 32, stone[0]); k.V(0, 0, 32, stone[0]); k.V(31, 0, 32, stone[2]); k.V(1, 1, 31, stone[2]);
  for (let y = 4; y < 32; y += 6) { k.H(0, y, 2, stone[2]); k.H(30, y, 2, stone[2]); }
  k.R(3, 2, 26, 7, PAL.ink);
  const fan = (x, y) => { k.P(x, y, mix(PAL.blue_d, PAL.moon, 0.25)); };
  for (let i = 0; i < 24; i++) for (let j = 0; j < 6; j++) { const dx = i - 11.5, dy = 6 - j; if (dx * dx / 144 + dy * dy / 36 < 1) fan(4 + i, 3 + j); }
  for (const a of [0.2, 0.5, 0.8]) k.L(16, 8, Math.round(4 + 24 * a), 3 + (a === 0.5 ? 0 : 1), stone[2]);
  k.H(3, 8, 26, stone[0]); k.H(3, 9, 26, stone[2]);
  k.P(16, 1, stone[2]); k.P(15, 1, stone[2]); // keystone
  if (state === 'open') {
    doorway(k, 3, 10, 26, 22);
    k.poly([[3, 10], [7, 9], [7, 28], [3, 31]], dk(W.md, 0.3)); k.V(7, 9, 19, W.lt);
    k.poly([[28, 10], [24, 9], [24, 28], [28, 31]], dk(W.md, 0.45));
    return k.done({ outline: false });
  }
  for (const lx of [3, 16]) {
    k.wood(lx, 10, 13, 21, W.md, { dark: W.dk, light: W.lt, vertical: true, density: 1 });
    for (let x = lx + 3; x < lx + 13; x += 3) k.V(x, 10, 21, W.dk);
    k.V(lx, 10, 21, W.lt);
    // iron straps with rivets
    for (const sy of [12, 20, 27]) {
      k.H(lx, sy, 13, PAL.g1); k.H(lx, sy + 1, 13, PAL.ink);
      for (let x = lx + 1; x < lx + 13; x += 3) k.P(x, sy, PAL.g3);
    }
  }
  k.V(15, 10, 21, W.dd); k.V(16, 10, 21, W.dd);
  // ring pulls
  for (const rx of [12, 19]) { k.frame(rx, 16, 3, 4, PAL.g3); k.P(rx + 1, 15, PAL.g2); k.P(rx, 16, PAL.g4); }
  if (!clean) { k.grime(3, 10, 26, 21, 1.4); k.S(3, 26, 26, 5, PAL.g2, 0.2); k.drip(4, 2, 10); k.drip(27, 3, 12); }
  if (state === 'chained') {
    chain(k, [[13, 19], [11, 22], [13, 24], [18, 24], [21, 22], [20, 19]], clean);
    chain(k, [[13, 18], [16, 16], [20, 18]], clean);
    padlock(k, 15, 24, { clean });
  }
  k.H(3, 31, 26, PAL.ink);
  return k.done({ outline: false });
}

// ---- gate_accordion ---------------------------------------------------------------------------
function gateAccordion(o) {
  const { state, clean } = o;
  const k = new K(34, 34, -1, -21, seedOf('gate', state, clean));
  const M = clean ? { hi: PAL.g6, lt: PAL.g5, md: PAL.g4, dk: PAL.g3 } : { hi: PAL.g5, lt: PAL.g4, md: mix(PAL.g3, PAL.rust, 0.25), dk: PAL.g2 };
  const top = -19, bot = 9;
  // tracks
  k.R(0, top, 32, 2, M.dk); k.H(0, top, 32, M.lt);
  k.R(0, bot, 32, 2, M.dk); k.H(0, bot, 32, M.md);
  const span = state === 'open' ? 8 : 30;
  const n = state === 'open' ? 5 : 10;
  const step = span / (n - 1);
  const xs = [];
  for (let i = 0; i < n; i++) xs.push(1 + Math.round(i * step));
  for (const x of xs) { k.V(x, top + 2, bot - top - 2, M.md); k.V(x + 1, top + 2, bot - top - 2, M.dk); k.P(x, top + 2, M.hi); }
  // lattice: X straps between bars in three tiers
  for (let i = 0; i + 1 < xs.length; i++) {
    for (const [y0, y1] of [[top + 2, top + 10], [top + 10, top + 19], [top + 19, bot - 1]]) {
      k.L(xs[i] + 1, y0, xs[i + 1], y1, M.lt); k.L(xs[i] + 1, y1, xs[i + 1], y0, M.md);
    }
  }
  if (state === 'locked') {
    k.R(30, -6, 2, 3, M.dk);
    padlock(k, 29, -4, { clean });
    if (!clean) k.rust(0, top, 32, bot - top, 6);
  } else padlock(k, 4, 2, { clean, open: true });
  k.shadow(1, bot + 2, 32, 2);
  return k.done({ outline: OUT });
}

// ---- trapdoor (decal) -------------------------------------------------------------------------
function trapdoor(o) {
  const { state, clean } = o;
  const k = new K(32, 32, 0, 0, seedOf('trapdoor', state, clean));
  const W = woodSet(clean, 'oak');
  // frame of the opening
  k.R(2, 2, 28, 28, W.dd);
  if (state === 'open') {
    k.R(3, 3, 26, 26, PAL.ink);
    // ladder rungs dropping into the dark
    for (let i = 0; i < 6; i++) {
      const y = 6 + i * 4, a = 1 - i / 6;
      const c = mix(PAL.ink, W.lt, 0.7 * a);
      k.V(11, 3, 26, mix(PAL.ink, W.md, 0.5 * a + 0.1)); k.V(20, 3, 26, mix(PAL.ink, W.md, 0.5 * a + 0.1));
      k.H(11, y, 10, c);
    }
    k.DV(3, 16, 26, 13, PAL.ink, 0.2, 1);
    k.H(3, 3, 26, W.dk);
    // the leaf thrown back on its hinges, lying on the boards above
    k.R(3, -3, 26, 5, W.md); k.H(3, -3, 26, W.lt); k.H(3, 1, 26, W.dd);
    k.P(16, -1, PAL.g2); k.P(15, -1, PAL.g1);
    return k.done({ outline: false });
  }
  k.wood(3, 3, 26, 26, W.md, { dark: W.dk, light: W.lt });
  for (let y = 7; y < 29; y += 5) k.H(3, y, 26, W.dk);
  k.H(3, 3, 26, W.hi);
  // iron hinge straps (north edge) and the ring
  for (const hx of [6, 22]) { k.R(hx, 3, 4, 9, PAL.g2); k.V(hx, 3, 9, PAL.g3); k.P(hx + 2, 6, PAL.g4); k.P(hx + 2, 10, PAL.g4); }
  k.frame(14, 20, 4, 4, PAL.g3); k.P(14, 20, PAL.g5); k.H(15, 19, 2, PAL.g1);
  if (!clean) { k.S(3, 3, 26, 26, PAL.g2, 0.04); k.grime(3, 3, 26, 26, 0.6); }
  return k.done({ outline: false });
}

// ---- stair_spiral -----------------------------------------------------------------------------
function stairSpiral(o) {
  const { clean } = o;
  const k = new K(36, 88, -2, -56, seedOf('spiral', clean));
  const I = clean ? { hi: PAL.g5, lt: PAL.g4, md: PAL.g3, dk: PAL.g2, dd: PAL.g1 } : { hi: mix(PAL.g4, PAL.rust, 0.25), lt: PAL.g3, md: mix(PAL.g2, PAL.rust, 0.18), dk: PAL.g1, dd: PAL.shadow };
  const cx = 16, cy = 16, R = 14, Ry = 9, rise = 5;
  k.shadow(2, 22, 30, 9);
  k.shadow(4, 28, 26, 3);
  // treads from the top down so lower (nearer) treads overlap upper ones correctly
  const N = 14;
  const treads = [];
  for (let i = 0; i < N; i++) treads.push(i);
  // pole behind
  for (let i = N - 1; i >= 0; i--) {
    const a0 = (i * Math.PI) / 4.2 + Math.PI * 0.35, a1 = a0 + Math.PI / 3.6;
    const yo = cy - i * rise;
    const pts = [[cx, yo]];
    for (let s = 0; s <= 4; s++) { const a = a0 + ((a1 - a0) * s) / 4; pts.push([cx + Math.cos(a) * R, yo + Math.sin(a) * Ry]); }
    const front = Math.sin((a0 + a1) / 2) > 0;
    const fade = Math.min(1, i / (N - 1));
    const top = mix(front ? I.lt : I.md, PAL.ink, fade * 0.75);
    k.poly(pts, top);
    // nosing + riser (thickness) along the outer arc
    for (let s = 0; s <= 8; s++) {
      const a = a0 + ((a1 - a0) * s) / 8;
      const x = Math.round(cx + Math.cos(a) * R), y = Math.round(yo + Math.sin(a) * Ry);
      k.P(x, y, mix(I.hi, PAL.ink, fade * 0.8));
      k.P(x, y + 1, mix(I.dk, PAL.ink, fade * 0.6));
    }
    // diamond plate dots
    for (let s = 0; s < 3; s++) {
      const a = a0 + ((a1 - a0) * (s + 0.5)) / 3, rr = R * 0.6;
      k.P(Math.round(cx + Math.cos(a) * rr), Math.round(yo + Math.sin(a) * rr * (Ry / R)), mix(I.hi, PAL.ink, fade * 0.8));
    }
    // baluster from the outer end of the tread up to the rail
    const ax = Math.round(cx + Math.cos(a1) * (R - 1)), ay = Math.round(yo + Math.sin(a1) * (Ry - 1));
    k.V(ax, ay - 12, 12, mix(I.md, PAL.ink, fade * 0.7));
  }
  // central pole
  k.R(cx - 1, cy - N * rise - 8, 3, N * rise + 10, I.dk); k.V(cx - 1, cy - N * rise - 8, N * rise + 10, I.lt);
  k.DV(cx - 1, cy - N * rise - 8, 3, 30, PAL.ink, 0.9, 0);
  // handrail: helix over the outer edge
  let prev = null;
  for (let s = 0; s <= N * 10; s++) {
    const i = s / 10, a = (i * Math.PI) / 4.2 + Math.PI * 0.35 + Math.PI / 3.6;
    const x = Math.round(cx + Math.cos(a) * (R - 1)), y = Math.round(cy - i * rise + Math.sin(a) * (Ry - 1) - 12);
    const fade = Math.min(1, i / N);
    if (prev) k.L(prev[0], prev[1], x, y, mix(Math.sin(a) > 0 ? I.hi : I.md, PAL.ink, fade * 0.8));
    prev = [x, y];
  }
  // newel post at the foot
  k.R(28, 6, 3, 15, I.md); k.V(28, 6, 15, I.hi); k.R(27, 4, 5, 3, I.lt); k.H(27, 4, 5, I.hi);
  return k.done({ outline: OUT });
}

// ---- coal_chute (wall) ------------------------------------------------------------------------
function coalChute(o) {
  const { state, clean } = o;
  const k = new K(32, 34, 0, -18, seedOf('chute', state, clean));
  const I = clean ? { hi: PAL.g5, lt: PAL.g4, md: PAL.g3, dk: PAL.g2 } : { hi: mix(PAL.g4, PAL.rust, 0.3), lt: mix(PAL.g3, PAL.rust, 0.35), md: mix(PAL.g2, PAL.rust, 0.3), dk: PAL.g1 };
  // sheet-metal apron below the hatch, blackened by coal
  k.poly([[6, 0], [26, 0], [29, 15], [3, 15]], I.md);
  k.H(6, 0, 20, I.lt); k.L(6, 0, 3, 15, I.hi); k.L(26, 0, 29, 15, I.dk);
  k.D(4, 2, 24, 13, PAL.ink, 0.45);
  for (let i = 0; i < 9; i++) k.P(8 + k.ri(0, 16), 4 + k.ri(0, 10), PAL.g3);
  // iron frame
  k.R(2, -16, 28, 15, I.dk); k.frame(2, -16, 28, 15, OUT); k.H(3, -15, 26, I.hi); k.V(3, -15, 13, I.lt);
  for (const [rx, ry] of [[4, -14], [27, -14], [4, -4], [27, -4]]) k.P(rx, ry, I.hi);
  if (state === 'open') {
    // hatch swung up; gray predawn light pours through, coal dust on the sill
    k.R(5, -13, 22, 10, mix(PAL.moon, PAL.g4, 0.5));
    k.DV(5, -13, 22, 10, PAL.g5, 0.6, 0.1);
    k.DV(5, -13, 22, 10, PAL.moon_l, 0.25, 0);
    k.H(5, -4, 22, PAL.g1);
    k.R(5, -22, 22, 5, I.md); k.H(5, -22, 22, I.lt); for (let x = 7; x < 26; x += 3) k.V(x, -21, 4, I.dk);
    k.A(4, -2, 24, 3, 'rgba(151,175,203,0.18)');
  } else {
    // grate
    k.R(5, -13, 22, 10, PAL.ink);
    for (let x = 6; x < 27; x += 3) { k.V(x, -13, 10, I.lt); k.V(x + 1, -13, 10, I.md); }
    k.H(5, -9, 22, I.md); k.H(5, -8, 22, I.dk);
    // hasp
    k.R(25, -10, 4, 2, I.lt);
    if (state === 'locked') padlock(k, 26, -9, { clean });
    else { // cut: the shackle sheared, lock hanging by a twist of chain
      k.R(25, -6, 4, 4, BRASS.dk); k.H(25, -6, 4, BRASS.md); k.P(26, -8, PAL.g5); k.P(28, -7, PAL.g6);
    }
  }
  if (!clean) { k.drip(9, -2, 4); k.drip(22, -2, 6); k.rust(2, -16, 28, 15, 6); }
  return k.done({ outline: false });
}

export const DOORS = {
  door_class: { build: doorClass, variants: 4, label: true },
  door_double: { build: doorDouble, variants: 2 },
  door_metal: { build: doorMetal, variants: 2, label: true },
  door_glass: { build: doorGlass, label: true },
  door_side: { build: doorSide },
  door_front: { build: doorFront },
  gate_accordion: { build: gateAccordion },
  trapdoor: { build: trapdoor },
  stair_spiral: { build: stairSpiral },
  coal_chute: { build: coalChute },
};
