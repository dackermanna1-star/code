// Props B — gym: bleachers hoop hoop_stand scoreboard mat_stack ball_cart locker_bench court_circle
// court_line_h court_line_v. Yellowed maple, green-and-gold Colliers paint, scuffed steel.
// The gym mats share the Colonel's navy (the coal heap / "...Just gym mats.") on purpose.
import { K, PAL, mix, lt, dk, BRASS, CHROME, seedOf, woodSet, steelSet, Blob, SHADOW, SHADOW_SOFT, bay } from './props_b_kit.js';

const MAT = [PAL.navy_dd, mix(PAL.navy_dd, PAL.navy_d, 0.6), PAL.navy_d, mix(PAL.navy_d, PAL.navy, 0.6), mix(PAL.navy, PAL.g3, 0.35), mix(PAL.navy_l, PAL.g5, 0.4)];
const plankSet = (clean) => clean
  ? { hi: PAL.maple_l, lt: PAL.maple, md: mix(PAL.maple, PAL.wood_l, 0.5), dk: PAL.wood_l, dd: PAL.wood }
  : { hi: mix(PAL.maple, PAL.cream_d, 0.4), lt: mix(PAL.maple, PAL.g4, 0.35), md: mix(PAL.wood_l, PAL.g3, 0.35), dk: mix(PAL.wood, PAL.g2, 0.4), dd: mix(PAL.wood_d, PAL.g1, 0.4) };

// ---------------------------------------------------------------------------- bleachers (6×3)
function bleachers(o) {
  const k = new K(104, 80, -4, -30, seedOf('bleach', o.state, o.clean));
  const P = plankSet(o.clean), S = steelSet(o.clean, 'gray');
  const W = 96;
  if (o.state === 'out' || o.clean) {
    k.shadow(-2, 44, 100, 4, SHADOW);
    // back rail against the wall
    k.R(0, -27, W, 2, S.md); k.H(0, -27, W, S.hi);
    for (let x = 4; x < W; x += 23) k.V(x, -25, 9, S.dk);
    const tops = [-16, 8, 32]; // seat plank tops, back → front
    for (let i = 0; i < 3; i++) {
      const y = tops[i], next = i < 2 ? tops[i + 1] : 47;
      // closed riser below this tier's nose: horizontal boards, shadowed under the nose
      const ry = y + 6;
      for (let by = ry; by < next; by += 4) {
        const tone = ((by - ry) / 4) % 2 ? P.dk : mix(P.dk, P.md, 0.5);
        k.R(0, by, W, Math.min(4, next - by), tone);
        k.H(0, by, W, mix(tone, PAL.night, 0.35));
      }
      k.R(0, ry, W, 2, mix(P.dd, PAL.night, 0.5)); k.H(0, ry + 2, W, mix(P.dk, PAL.night, 0.3));
      for (let x = 7 + i * 5; x < W; x += 30) k.V(x, ry, next - ry, P.dd); // butt joints
      // seat plank: two boards seen from above + the rounded nose
      k.R(0, y, W, 5, P.lt); k.H(0, y, W, P.hi); k.H(0, y + 2, W, P.md); k.H(0, y + 3, W, P.lt);
      k.R(0, y + 5, W, 1, P.dd);
      for (let x = 20 + i * 7; x < W; x += 32) k.V(x, y, 5, P.dd);
      if (!o.clean) {
        // carved initials, gum, splits, scuffs on the risers
        k.S(0, y, W, 5, mix(P.lt, PAL.g2, 0.5), 0.02);
        const r = k.r;
        for (let n = 0; n < 3; n++) { const x = 4 + Math.floor(r() * (W - 10)); k.H(x, y + 1, 3, P.dd); k.P(x + 1, y + 3, P.dd); }
        k.P(30 + i * 20, y + 1, mix(PAL.red_l, PAL.paper, 0.45)); // gum
        k.S(0, ry, W, next - ry, 'rgba(20,14,10,0.35)', 0.015);
      }
    }
    // steel end frames
    for (const x of [0, W - 2]) { k.R(x, -27, 2, 74, S.md); k.V(x, -27, 74, S.hi); }
  } else if (o.state === 'folded') {
    // telescoped against the wall: a tall stack of board noses at the back row
    k.shadow(-2, 14, 100, 4, SHADOW);
    const top = -30, bot = 15;
    for (let y = top; y < bot; y += 5) { k.R(0, y, W, 3, P.md); k.H(0, y, W, P.lt); k.R(0, y + 3, W, 1, P.dd); k.R(0, y + 4, W, 1, mix(P.dd, PAL.night, 0.5)); }
    for (let x = 6; x < W; x += 15) k.V(x, top, bot - top, mix(S.dk, P.dd, 0.4));
    for (const x of [0, W - 2]) { k.R(x, top - 2, 2, bot - top + 2, S.md); k.V(x, top - 2, bot - top + 2, S.hi); }
    k.R(0, top - 2, W, 2, S.md); k.H(0, top - 2, W, S.hi);
    if (!o.clean) k.S(0, top, W, bot - top, 'rgba(150,140,120,0.25)', 0.04);
  } else {
    // fallen: the stack came down in a heap — tilted planks, a bent frame, splinters
    k.shadow(-4, 30, 104, 16, SHADOW);
    const planks = [
      [-2, 34, 40, 20, 4], [40, 38, 98, 30, 4], [6, 18, 60, 30, 3], [50, 12, 96, 22, 3], [0, 6, 44, 12, 3],
      [30, -2, 80, 10, 3], [-4, 26, 24, 44, 3], [70, 30, 100, 44, 3], [16, -8, 52, -2, 3], [56, -10, 92, 0, 3],
    ];
    // dark understructure jammed beneath
    k.poly([[-2, 10], [96, -4], [100, 44], [-4, 46]], mix(PAL.night, PAL.brown_dd, 0.3));
    for (const [x0, y0, x1, y1, t] of planks) {
      k.LT(x0, y0 + 2, x1, y1 + 2, t, P.dd);
      k.LT(x0, y0, x1, y1, t, P.md);
      k.L(x0, y0 - 1, x1, y1 - 1, P.hi);
    }
    // bent steel frame members sticking up
    k.LT(20, 40, 34, 4, 2, S.md); k.L(19, 40, 33, 4, S.hi);
    k.LT(74, 42, 66, 2, 2, S.md); k.L(73, 42, 65, 2, S.hi);
    k.LT(46, 20, 58, -14, 2, S.dk);
    // splinters and a snapped board end
    for (const [x, y] of [[12, 44], [36, 46], [62, 45], [88, 46], [50, 40]]) { k.H(x, y, 3, P.lt); k.P(x + 3, y - 1, P.md); }
    k.R(84, -12, 4, 14, P.md); k.V(84, -12, 14, P.hi); k.P(85, -13, P.hi); k.P(87, -13, P.lt);
    k.S(-2, -10, 100, 56, 'rgba(150,140,120,0.3)', 0.03);
  }
  return k.done();
}

// ---------------------------------------------------------------------------- hoop (2×1 wall)
function backboard(k, x, y, o) {
  const face = o.clean ? PAL.white : mix(PAL.paper_d, PAL.g4, 0.35), edge = o.clean ? PAL.g5 : PAL.g3;
  const sq = o.clean ? PAL.orange_d : mix(PAL.red_d, PAL.g3, 0.35);
  k.R(x, y, 26, 16, face); k.frame(x, y, 26, 16, edge); k.H(x, y, 26, o.clean ? PAL.white : PAL.paper);
  k.frame(x + 8, y + 7, 10, 8, sq);
  if (!o.clean) { k.S(x + 1, y + 1, 24, 14, 'rgba(60,50,40,0.35)', 0.08); k.DV(x + 1, y + 10, 24, 5, 'rgba(60,50,40,0.4)', 0, 0.5); k.L(x + 20, y + 2, x + 23, y + 6, edge); }
}
function rimNet(k, cx, y, o, torn) {
  const rim = o.clean ? PAL.orange : mix(PAL.orange_d, PAL.rust, 0.45), rimL = o.clean ? PAL.orange_l : mix(PAL.orange, PAL.rust, 0.4);
  const net = o.clean ? PAL.white : mix(PAL.paper_d, PAL.g4, 0.4);
  // net: diamond mesh tapering down
  for (let j = 0; j < 8; j++) {
    const w = 7 - Math.floor(j / 2);
    for (let i = -w; i <= w; i++) if (((i + j) & 1) === 0) {
      if (torn && j > 3 && i > 0) continue;
      k.P(cx + i, y + 2 + j, net);
    }
  }
  if (torn) { k.V(cx + 3, y + 6, 4, net); k.P(cx + 4, y + 10, net); }
  k.ring(cx, y, 7, 2, rim); k.H(cx - 6, y - 2, 13, rimL); k.H(cx - 5, y + 2, 11, dk(rim, 0.25));
}
function hoop(o) {
  const k = new K(32, 32, 0, -16, seedOf('hoop', o.clean));
  // wall bracket struts
  k.R(6, -2, 2, 8, PAL.g2); k.R(24, -2, 2, 8, PAL.g2); k.L(8, 6, 14, 2, PAL.g3);
  backboard(k, 3, -15, o);
  k.R(14, 0, 4, 3, PAL.g2); // rim mount plate
  rimNet(k, 16, 3, o, !o.clean);
  return k.done();
}

// ---------------------------------------------------------------------------- hoop_stand (2×1)
function hoopStand(o) {
  const dir = o.dir;
  const k = new K(48, 78, -8, -62, seedOf('hstand', dir, o.clean));
  const S = steelSet(o.clean, 'gray');
  const pad = o.clean ? PAL.navy : mix(PAL.navy_d, PAL.g2, 0.3);
  k.shadow(-2, 12, 36, 4, SHADOW);
  if (dir === 'left' || dir === 'right') {
    const s = dir === 'left' ? -1 : 1; // rim points this way
    const baseX = s > 0 ? 0 : 18;
    // weighted base box, padded front
    k.R(baseX, 2, 14, 12, S.md); k.H(baseX, 2, 14, S.hi); k.R(baseX, 8, 14, 6, pad); k.H(baseX, 8, 14, lt(pad, 0.2));
    // the pole rising, the arm reaching over the court, the backboard edge-on, rim + net
    const px = baseX + 6;
    k.R(px, -46, 3, 48, S.md); k.V(px, -46, 48, S.hi); k.V(px + 2, -46, 48, S.dk);
    const ax1 = px + s * 14;
    k.LT(px + 1, -44, ax1, -48, 2, S.md); k.LT(px + 1, -36, ax1, -46, 2, S.dk);
    const bx = ax1;
    k.R(bx - 1, -58, 3, 20, o.clean ? PAL.white : PAL.paper_d); k.V(bx + (s > 0 ? 1 : -1), -58, 20, PAL.g3);
    const rim = o.clean ? PAL.orange : mix(PAL.orange_d, PAL.rust, 0.45), net = o.clean ? PAL.white : mix(PAL.paper_d, PAL.g4, 0.4);
    const rx = bx + s * 8;
    k.ring(rx, -44, 6, 1, rim); k.H(rx - 5, -45, 11, lt(rim, 0.25));
    for (let j = 0; j < 7; j++) { const w = 5 - Math.floor(j / 2); for (let i = -w; i <= w; i += 2) k.P(rx + i + (j & 1), -42 + j, net); }
  } else {
    const facing = dir === 'down';
    // base at the bottom, the pole behind (up) or in front (down)
    k.R(4, 2, 24, 12, S.md); k.H(4, 2, 24, S.hi); k.R(4, 8, 24, 6, pad); k.H(4, 8, 24, lt(pad, 0.2));
    k.R(15, -40, 3, 44, S.md); k.V(15, -40, 44, S.hi); k.V(17, -40, 44, S.dk);
    if (facing) {
      backboard(k, 3, -58, o);
      rimNet(k, 16, -42, o, !o.clean);
    } else {
      // back of the board: steel bracing; the net just shows beneath it
      k.R(3, -58, 26, 16, S.dk); k.frame(3, -58, 26, 16, S.dd); k.L(4, -57, 28, -43, S.md); k.L(28, -57, 4, -43, S.md); k.H(3, -58, 26, S.md);
      const net = o.clean ? PAL.white : mix(PAL.paper_d, PAL.g4, 0.4);
      for (let i = -4; i <= 4; i += 2) { k.P(16 + i, -41, net); k.P(16 + i + 1, -40, net); }
    }
  }
  if (!o.clean) k.S(-8, -62, 48, 78, 'rgba(110,60,30,0.25)', 0.01);
  return k.done();
}

// ---------------------------------------------------------------------------- scoreboard (3×1 wall)
const SEG = { 0: 'abcdef', 1: 'bc', 2: 'abdeg', 3: 'abcdg', 4: 'bcfg', 5: 'acdfg', 6: 'acdefg', 7: 'abc', 8: 'abcdefg', 9: 'abcdfg' };
function digit(k, x, y, n, on, off) {
  const segs = SEG[n] || '';
  const S = { a: [[1, 0], [2, 0], [3, 0]], b: [[4, 1], [4, 2], [4, 3]], c: [[4, 5], [4, 6], [4, 7]], d: [[1, 8], [2, 8], [3, 8]], e: [[0, 5], [0, 6], [0, 7]], f: [[0, 1], [0, 2], [0, 3]], g: [[1, 4], [2, 4], [3, 4]] };
  for (const [key, px] of Object.entries(S)) for (const [dx, dy] of px) k.P(x + dx, y + dy, segs.includes(key) && on ? on : off);
}
function scoreboard(o) {
  const k = new K(48, 30, 0, -16, seedOf('score', o.state, o.clean));
  const on = o.state === 'on';
  const box = PAL.ink, panel = o.clean ? PAL.green_d : mix(PAL.green_dd, PAL.g1, 0.3);
  k.R(1, -15, 46, 24, box); k.frame(1, -15, 46, 24, o.clean ? PAL.g3 : PAL.g2); k.H(1, -15, 46, PAL.g3);
  // header band: COLLIERS in gold on green
  k.R(2, -14, 44, 7, panel); k.text(9, -13, 'COLLIERS', o.clean ? PAL.yellow : mix(PAL.mustard, PAL.g3, 0.4));
  const lbl = o.clean ? PAL.white : PAL.g5;
  k.text(4, -6, 'HOME', lbl); k.text(29, -6, 'GUEST', lbl);
  const lit = on ? PAL.ember : null, dim = on ? mix(PAL.fire_dd, PAL.g1, 0.5) : (o.clean ? PAL.g2 : PAL.g1);
  // HOME 19 — GUEST 79
  const home = on ? [1, 9] : [8, 8], guest = on ? [7, 9] : [8, 8];
  digit(k, 5, -0, home[0], lit, dim); digit(k, 11, 0, home[1], lit, dim);
  digit(k, 30, 0, guest[0], lit, dim); digit(k, 36, 0, guest[1], lit, dim);
  if (on) for (const [x, y] of [[5, 0], [11, 0], [30, 0], [36, 0]]) k.tint(x + 2, y + 4, 5, 6, PAL.fire_l, 0.25);
  // period / clock in the middle
  k.R(20, -1, 8, 7, PAL.night); k.P(22, 1, on ? PAL.ember : dim); k.P(25, 3, on ? PAL.ember : dim);
  if (!o.clean) { k.S(1, -15, 46, 24, 'rgba(120,110,95,0.25)', 0.03); k.drip(40, 9, 4, 'rgba(60,50,40,0.4)'); }
  return k.done();
}

// ---------------------------------------------------------------------------- mat_stack (2×1)
function matStack(o) {
  const k = new K(36, 30, -2, -14, seedOf('mats', o.variant, o.clean));
  k.shadow(0, 11, 32, 4, SHADOW);
  const n = 4;
  const ramp = o.clean ? MAT.map((c) => lt(c, 0.08)) : MAT;
  for (let i = 0; i < n; i++) {
    const y = 9 - i * 5, dx = [0, 1, -1, 1][i] + (o.variant % 2 ? 1 : 0);
    const b = new Blob(k.w, k.h, k.ox, k.oy);
    b.R(dx + 1, y - 2, 30, 7, 0, 1);
    b.render(k, [ramp], { reach: 4, vw: 0.8, edge: 0.4, rim: 0.4, dither: false });
    // folded panel seams (stitched), vinyl highlight
    for (const sx of [dx + 9, dx + 17, dx + 25]) { k.V(sx, y - 1, 5, ramp[0]); k.P(sx + 1, y - 1, ramp[4]); }
    k.H(dx + 2, y - 2, 28, ramp[4]);
    if (!o.clean && i === 2) { k.L(dx + 4, y, dx + 7, y + 2, ramp[0]); k.P(dx + 5, y + 1, PAL.cream_d); } // split vinyl, foam
  }
  if (!o.clean) k.S(0, -12, 32, 4, 'rgba(150,140,120,0.35)', 0.1);
  return k.done();
}

// ---------------------------------------------------------------------------- ball_cart
function ballCart(o) {
  const k = new K(20, 30, -2, -16, seedOf('balls', o.clean));
  const S = steelSet(o.clean, 'gray');
  k.shadow(0, 12, 16, 3, SHADOW_SOFT);
  // basketballs: deflated, slumped, orange-brown with seam lines
  const ball = o.clean ? [PAL.orange_d, PAL.orange, PAL.orange_l] : [mix(PAL.rust, PAL.brown_d, 0.4), PAL.rust, mix(PAL.rust, PAL.tan, 0.4)];
  const balls = o.clean ? [[4, -5, 3, 3], [10, -6, 3, 3], [7, -9, 3, 3], [13, -3, 3, 3]] : [[4, -4, 4, 2], [11, -5, 3, 2], [7, -7, 4, 2], [13, -3, 3, 2]];
  for (const [x, y, rx, ry] of balls) { k.E(x, y, rx, ry, ball[1]); k.E(x - 1, y - 1, Math.max(1, rx - 2), Math.max(1, ry - 1), ball[2]); k.H(x - rx, y, rx * 2, ball[0]); k.P(x + 1, y + ry, ball[0]); }
  // wire basket
  for (let x = 0; x <= 16; x += 2) k.V(x, -4, 12, S.md);
  k.H(0, -4, 17, S.hi); k.H(0, 7, 17, S.md); k.H(0, 2, 17, S.dk);
  for (const x of [1, 14]) { k.R(x, 9, 2, 2, PAL.g1); k.P(x, 9, PAL.g3); }
  return k.done();
}

// ---------------------------------------------------------------------------- locker_bench (3×1)
function lockerBench(o) {
  const k = new K(52, 24, -2, -8, seedOf('lbench', o.clean));
  const P = plankSet(o.clean), S = steelSet(o.clean, 'gray');
  k.shadow(1, 11, 46, 3, SHADOW_SOFT);
  for (const x of [5, 22, 39]) { k.R(x, 3, 3, 9, S.md); k.V(x, 3, 9, S.hi); k.R(x - 2, 11, 7, 2, S.dk); k.H(x - 2, 11, 7, S.md); }
  k.R(0, -1, 48, 4, P.lt); k.H(0, -1, 48, P.hi); k.R(0, 3, 48, 2, P.dk); k.H(0, 4, 48, P.dd);
  k.V(16, -1, 4, P.dd); k.V(32, -1, 4, P.dd);
  if (!o.clean) { k.H(9, 0, 4, P.dd); k.P(10, 1, P.dd); k.H(36, 1, 3, P.dd); k.S(0, -1, 48, 4, mix(P.lt, PAL.g2, 0.5), 0.08); }
  return k.done();
}

// ---------------------------------------------------------------------------- court decals
function paintMask(k, clean, seed) {
  // worn paint: dithered holes along the scuff paths
  if (clean) return;
  k.pixels((r, g, b, a, x, y) => {
    // scuffed patches (low-frequency) where feet wore the paint off, plus sparse chips
    const p = Math.sin(x * 0.21 + seed) + Math.sin(y * 0.17 + seed * 0.5) + Math.sin((x + y) * 0.09);
    if (p > 1.5 && bay(x, y) < 0.6) return [r, g, b, Math.round(a * 0.25)];
    if ((((x * 31 + y * 17 + seed) * 2654435761) >>> 27) === 0) return [r, g, b, 0];
    return null;
  });
}
function courtCircle(o) {
  const k = new K(64, 64, 0, 0, seedOf('ccircle', o.clean));
  const line = o.clean ? 'rgba(240,236,226,0.85)' : 'rgba(220,214,196,0.6)';
  k.ring(32, 32, 27, 27, line, 0.02); k.ring(32, 32, 26, 26, line, 0.02);
  // the Colliers "C": green field disc, gold rim, with a little coal pick through it
  const green = o.clean ? 'rgba(67,94,73,0.9)' : 'rgba(42,61,48,0.7)', gold = o.clean ? 'rgba(201,170,71,0.95)' : 'rgba(157,129,46,0.7)';
  k.E(32, 32, 14, 14, green);
  for (let y = -11; y <= 11; y++) for (let x = -11; x <= 11; x++) {
    const d = Math.sqrt(x * x + y * y), a = Math.atan2(y, x);
    if (d >= 6.5 && d <= 11 && !(a > -0.75 && a < 0.75)) k.P(32 + x, 32 + y, gold);
  }
  k.L(36, 24, 44, 40, gold); k.L(34, 26, 40, 22, gold); k.L(40, 22, 44, 26, gold); // pick
  paintMask(k, o.clean, 7);
  return k.done({ outline: false });
}
function courtLine(o, vertical) {
  const k = new K(16, 16, 0, 0, seedOf('cline', vertical, o.variant, o.clean));
  const line = o.clean ? 'rgba(240,236,226,0.85)' : 'rgba(220,214,196,0.6)';
  if (vertical) k.R(7, 0, 2, 16, line); else k.R(0, 7, 16, 2, line);
  paintMask(k, o.clean, o.variant * 13);
  return k.done({ outline: false });
}

export const GYM = {
  bleachers: { build: bleachers },
  hoop: { build: hoop },
  hoop_stand: { build: hoopStand, facing: ['down', 'up', 'left', 'right'], showFacing: ['up', 'down', 'left', 'right'] },
  scoreboard: { build: scoreboard },
  mat_stack: { build: matStack, variants: 2 },
  ball_cart: { build: ballCart },
  locker_bench: { build: lockerBench },
  court_circle: { build: courtCircle },
  court_line_h: { build: (o) => courtLine(o, false), variants: 4 },
  court_line_v: { build: (o) => courtLine(o, true), variants: 4 },
};
export { BRASS, CHROME };
