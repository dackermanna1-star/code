// Props B — basement: boiler pipe_h pipe_v breaker_panel coal_heap janitor_desk pegboard mop_bucket
// shelf_metal desk_pile water_heater valve_wheel calendar cage_bulb cobweb.
// Sweating concrete, rust, soot and anthracite; the boiler is lit (impossible) and the coal heap is
// occupied: at first glance old gym mats or a tarp under the coal — navy wool, one glint of brass,
// a pale fold of flesh — breathing very slowly (frames).
import { K, PAL, mix, lt, dk, BRASS, IRON, CHROME, seedOf, woodSet, steelSet, Blob, SHADOW, SHADOW_SOFT, COAL, NAVY, rivets, glowDot, bay, paper } from './props_b_kit.js';

const ironSet = (clean) => clean
  ? { hi: mix(PAL.g4, PAL.green_l, 0.2), lt: mix(PAL.g3, PAL.green, 0.25), md: mix(PAL.g2, PAL.green_d, 0.35), dk: mix(PAL.g1, PAL.green_dd, 0.4), dd: PAL.night }
  : { hi: mix(PAL.g4, PAL.rust, 0.25), lt: mix(PAL.g3, PAL.rust, 0.18), md: mix(PAL.g2, PAL.brown_d, 0.25), dk: mix(PAL.g1, PAL.brown_dd, 0.3), dd: PAL.night };

// ---------------------------------------------------------------------------- boiler (4×3)
function boiler(o) {
  const k = new K(72, 82, -4, -34, seedOf('boiler', o.clean));
  const I = ironSet(o.clean);
  const f = o.frame | 0;
  k.shadow(0, 44, 64, 4, SHADOW);
  // brick setting
  const brick = o.clean ? PAL.brick : mix(PAL.brick_d, PAL.g1, 0.25), brickL = o.clean ? PAL.brick_l : mix(PAL.brick, PAL.g2, 0.3), mort = o.clean ? PAL.mortar : mix(PAL.mortar, PAL.g1, 0.5);
  k.R(2, 4, 60, 16, mix(brick, PAL.g1, 0.3)); // top of the setting (sooty)
  k.R(2, 20, 60, 26, brick);
  for (let y = 20; y < 46; y += 3) { k.H(2, y, 60, mort); for (let x = 2 + ((y / 3) % 2 ? 0 : 3); x < 62; x += 6) k.V(x, y + 1, 2, mort); }
  k.H(2, 20, 60, brickL); k.V(2, 20, 26, brickL); k.V(61, 20, 26, dk(brick, 0.3));
  if (!o.clean) { k.DV(2, 20, 60, 10, 'rgba(10,8,8,0.55)', 0.6, 0.0); k.S(2, 20, 60, 26, 'rgba(10,8,8,0.4)', 0.08); }
  // iron front plate across the setting with fire doors + ash doors
  k.R(10, 24, 44, 21, I.md); k.frame(10, 24, 44, 21, I.dk); k.H(10, 24, 44, I.hi);
  rivets(k, 12, 26, 10, 4, { hi: I.hi, md: I.lt, dd: I.dd });
  rivets(k, 12, 42, 10, 4, { hi: I.hi, md: I.lt, dd: I.dd });
  // fire doors (left one ajar → the glow)
  const doors = [[15, 29], [35, 29]];
  const flick = [0.75, 0.9, 0.65, 1][f % 4];
  for (let i = 0; i < 2; i++) {
    const [dx, dy] = doors[i];
    k.R(dx, dy, 14, 9, I.dk); k.frame(dx, dy, 14, 9, I.dd); k.H(dx + 1, dy, 12, I.lt);
    // draft slots, lit from inside
    for (let s = 0; s < 4; s++) { const sx = dx + 3 + s * 3; k.V(sx, dy + 2, 1, PAL.fire_d); k.V(sx, dy + 3, 1, s % 2 === f % 2 ? PAL.fire_l : PAL.fire); }
    k.R(dx + 6, dy + 6, 2, 1, I.hi); // latch
  }
  // the gap of the ajar door: coal bed glowing
  const gx = 28, gy = 30;
  k.R(gx, gy, 3, 8, PAL.fire_d);
  for (let y = 0; y < 8; y++) k.P(gx + 1, gy + y, (y + f) % 3 ? PAL.fire_l : PAL.ember);
  k.P(gx, gy + 2 + (f % 3), PAL.yellow_l);
  // ash pit doors
  k.R(18, 39, 10, 4, I.dd); k.R(36, 39, 10, 4, I.dd); k.H(18, 39, 10, I.dk); k.H(36, 39, 10, I.dk);
  k.P(22, 41, PAL.fire_d); if (f % 2) k.P(40, 41, PAL.fire_d);
  // ---- the shell: a horizontal riveted drum running away from us; its round front end plate
  const cx = 32, cy = 4, R = 19;
  // drum top surface running north
  for (let x = cx - R; x <= cx + R; x++) {
    const u = (x - cx) / R; // -1..1
    const shade = u < -0.55 ? I.lt : u < -0.15 ? I.hi : u < 0.35 ? I.lt : u < 0.75 ? I.md : I.dk;
    const top = cy - 30 + Math.round((1 - Math.sqrt(Math.max(0, 1 - u * u))) * 6);
    k.V(x, top, cy - top, shade);
  }
  for (let y = cy - 28; y < cy - 2; y += 7) for (let x = cx - R + 2; x < cx + R - 1; x += 3) k.P(x, y + Math.round(Math.abs(x - cx) / R * 2), I.dd); // rivet seams
  // front plate
  k.E(cx, cy, R, R, I.md);
  k.E(cx - 2, cy - 2, R - 4, R - 4, I.lt);
  k.E(cx + 1, cy + 1, R - 5, R - 5, I.md);
  k.ring(cx, cy, R, R, I.dk);
  for (let a = 0; a < 32; a++) { const t = (a / 32) * Math.PI * 2; const x = Math.round(cx + Math.cos(t) * (R - 2)), y = Math.round(cy + Math.sin(t) * (R - 2)); k.P(x, y, t > Math.PI * 0.75 && t < Math.PI * 1.75 ? I.hi : I.dd); }
  // pressure gauge (white dial) + steam pipe up to the ceiling
  const gx0 = cx + 9, gy0 = cy - 11;
  k.R(gx0 - 1, cy - 34, 3, 20, I.md); k.V(gx0 - 1, cy - 34, 20, I.hi);
  k.E(gx0, gy0, 3, 3, BRASS.md); k.E(gx0, gy0, 2, 2, o.clean ? PAL.white : PAL.paper_d);
  k.L(gx0, gy0, gx0 - 2, gy0 - 1, PAL.red_d); k.P(gx0, gy0, PAL.ink);
  // main steam line rising off the drum to the ceiling
  k.R(cx - 8, cy - 36, 5, 12, I.md); k.V(cx - 8, cy - 36, 12, I.hi); k.V(cx - 4, cy - 36, 12, I.dk); k.R(cx - 9, cy - 26, 7, 2, I.lt);
  // water gauge glass on the right of the plate
  k.R(cx + 12, cy - 4, 3, 12, BRASS.dk); k.V(cx + 13, cy - 3, 10, o.clean ? PAL.moon : PAL.g3); k.V(cx + 13, cy + 2, 5, mix(PAL.blue_l, PAL.amber, o.clean ? 0 : 0.4)); k.P(cx + 12, cy - 4, BRASS.hi);
  // manhole / handhole with a yoke
  k.R(cx - 13, cy + 4, 9, 6, I.dk); k.frame(cx - 13, cy + 4, 9, 6, I.dd); k.H(cx - 13, cy + 4, 9, I.hi); k.R(cx - 10, cy + 6, 3, 2, I.hi);
  // stay-bolt rows across the plate
  for (let yy = cy - 8; yy <= cy + 2; yy += 5) for (let xx = cx - 10; xx <= cx + 8; xx += 3) k.P(xx, yy, I.dk);
  // safety valve + whistle on top, side pipe with a valve wheel
  k.R(cx + 8, cy - 33, 3, 6, BRASS.md); k.P(cx + 8, cy - 33, BRASS.hi);
  k.R(cx - R - 2, cy - 6, 3, 30, I.md); k.V(cx - R - 2, cy - 6, 30, I.hi); k.ring(cx - R - 1, cy - 2, 3, 3, PAL.red_d); k.P(cx - R - 1, cy - 2, PAL.red);
  if (!o.clean) {
    k.rust(cx - R, cy - R, R * 2, R * 2, 9);
    for (const x of [cx - 12, cx + 5, cx + 15]) k.drip(x, cy + 6, 8);
    k.S(cx - R, cy - 30, R * 2, 30, 'rgba(140,70,40,0.35)', 0.05);
    k.DV(10, 24, 44, 6, 'rgba(10,8,8,0.5)', 0.5, 0); // soot over the doors
  } else { k.P(cx - 8, cy - 8, PAL.white); k.P(cx - 9, cy - 7, I.hi); }
  // firelight on the floor and the plate edge (crisp, dithered)
  k.tint(28, 34, 22, 12, PAL.fire_l, 0.32 * flick);
  return k.done();
}

// ---------------------------------------------------------------------------- pipes (over)
function pipe(o, vertical) {
  const k = new K(16, 16, 0, 0, seedOf('pipe', vertical, o.variant, o.clean));
  const v = o.variant;
  const lag = v === 3; // asbestos-lagged steam line
  const I = lag ? { hi: PAL.cream_l, lt: PAL.cream, md: PAL.cream_d, dk: mix(PAL.cream_d, PAL.brown_d, 0.5), dd: PAL.brown_d } : ironSet(o.clean);
  const t = lag ? 5 : 4;
  if (!vertical) {
    const y0 = 3;
    k.R(0, y0, 16, t, I.md); k.H(0, y0, 16, I.hi); k.H(0, y0 + 1, 16, I.lt); k.H(0, y0 + t - 1, 16, I.dk);
    k.A(0, y0 + t, 16, 1, 'rgba(0,0,0,0.25)');
    if (lag) { for (let x = 2; x < 16; x += 6) k.V(x, y0, t, I.dk); if (!o.clean) { k.R(9, y0 + 1, 3, 3, mix(PAL.cream_d, PAL.g2, 0.4)); k.P(10, y0 + 4, PAL.paper); } }
    if (v === 1) { k.R(7, y0 - 1, 3, t + 2, I.lt); k.V(7, y0 - 1, t + 2, I.hi); k.V(9, y0 - 1, t + 2, I.dk); k.P(8, y0 - 1, I.dd); k.P(8, y0 + t, I.dd); } // flange
    if (v === 2) { k.R(6, y0 - 2, 4, 2, I.lt); k.ring(8, y0 - 3, 2, 1, PAL.red_d); } // valve + wheel
    if (!o.clean && !lag) { k.rust(0, y0, 16, t, 2); if (v !== 1) { k.P(11, y0 + t, 'rgba(120,150,170,0.6)'); k.P(11, y0 + t + 2, 'rgba(120,150,170,0.35)'); } }
  } else {
    const x0 = 6;
    k.R(x0, 0, t, 16, I.md); k.V(x0, 0, 16, I.hi); k.V(x0 + 1, 0, 16, I.lt); k.V(x0 + t - 1, 0, 16, I.dk);
    k.A(x0 + t, 0, 1, 16, 'rgba(0,0,0,0.25)');
    if (lag) for (let y = 3; y < 16; y += 6) k.H(x0, y, t, I.dk);
    if (v === 1) { k.R(x0 - 1, 7, t + 2, 3, I.lt); k.H(x0 - 1, 7, t + 2, I.hi); k.H(x0 - 1, 9, t + 2, I.dk); }
    if (v === 2) { k.R(x0 + t, 6, 2, 4, I.lt); k.ring(x0 + t + 2, 8, 1, 2, PAL.red_d); }
    if (!o.clean && !lag) k.rust(x0, 0, t, 16, 2);
  }
  return k.done({ outline: false });
}

// ---------------------------------------------------------------------------- breaker_panel (wall)
function breakerPanel(o) {
  const k = new K(18, 30, -1, -16, seedOf('panel', o.clean));
  const S = o.clean ? steelSet(true, 'gray') : steelSet(false, 'gray');
  // conduit up to the ceiling
  k.R(5, -16, 2, 4, S.md); k.V(5, -16, 4, S.hi); k.R(9, -16, 2, 4, S.md); k.V(9, -16, 4, S.hi);
  // box, door swung open on the left, rows of breakers inside
  k.R(2, -12, 12, 20, S.dk); k.frame(2, -12, 12, 20, S.dd); k.H(2, -12, 12, S.hi);
  k.R(3, -11, 10, 18, mix(S.dd, PAL.night, 0.3));
  for (let r = 0; r < 6; r++) for (let c = 0; c < 2; c++) {
    const x = 4 + c * 5, y = -10 + r * 3;
    k.R(x, y, 3, 2, S.md); k.P(x + (r % 3 === 1 ? 2 : 0), y, PAL.g6); k.P(x + 3, y, o.clean ? PAL.paper : PAL.paper_d);
  }
  k.R(0, -12, 2, 20, S.md); k.V(0, -12, 20, S.lt); k.H(0, -10, 2, S.dd); // the door, seen edge-on
  // main knife switch on the right with a red handle (the CLUNK)
  k.R(14, -8, 3, 12, S.dk); k.frame(14, -8, 3, 12, S.dd);
  k.R(15, -11, 1, 6, S.hi); k.R(14, -12, 3, 2, o.clean ? PAL.red : PAL.red_d); k.P(14, -12, PAL.red_l);
  // stenciled warning + hand-written labels
  k.R(4, 9, 8, 3, o.clean ? PAL.yellow : PAL.mustard); k.text(5, 9, '', PAL.ink); k.H(5, 10, 6, PAL.ink);
  if (!o.clean) { k.rust(2, -12, 12, 20, 3); k.drip(4, 8, 4); k.drip(12, 8, 6); }
  return k.done();
}

// ---------------------------------------------------------------------------- coal_heap (4×3 decal)
/** Coal: a dark bed of fines, then faceted lumps in painter's order (lit top facet, dark flank). */
function coalLumps(k, x0, y0, w, h, inside, { density = 0.08, height = null } = {}) {
  const r = k.r;
  // bed: coarse clusters rather than per-pixel noise
  for (let y = y0; y < y0 + h; y++) for (let x = x0; x < x0 + w; x++) {
    if (!inside(x, y)) continue;
    const hh = height ? height(x, y) : 0.5;
    const n = (((x >> 1) * 7 + (y >> 1) * 13 + ((x >> 2) ^ (y >> 2)) * 5) & 7) / 7;
    k.P(x, y, n + hh * 0.4 > 0.95 ? COAL[2] : n > 0.45 ? COAL[1] : COAL[0]);
  }
  const lumps = [];
  const n = Math.round(w * h * density);
  for (let i = 0; i < n; i++) {
    const x = x0 + Math.floor(r() * w), y = y0 + Math.floor(r() * h);
    if (!inside(x, y) || !inside(x + 3, y + 2)) continue;
    lumps.push([x, y, r() < 0.3 ? 4 : r() < 0.6 ? 3 : 2, r()]);
  }
  lumps.sort((a, b) => a[1] - b[1]);
  for (const [x, y, s, q] of lumps) {
    const hh = height ? height(x, y) : 0.5;
    // flank + top facet + rim light on the upper-left edge
    k.R(x, y + 1, s + 1, s - 1 || 1, COAL[1]);
    k.R(x, y, s, Math.max(1, s - 1), hh > 0.55 ? COAL[3] : COAL[2]);
    k.H(x, y, Math.max(1, s - 1), COAL[3]);
    if (q < 0.5) k.P(x, y, COAL[4]);
    if (q < 0.06 + hh * 0.06) k.P(x, y, COAL[5]);
    k.H(x + 1, y + s, s, COAL[0]);
  }
}
function coalHeap(o) {
  const st = o.state;
  const k = new K(72, 62, -4, -12, seedOf('coal', st, o.clean));
  const W = 64, Hh = 48;
  // heap outline (screen space): a mound against the back wall, toe spilling forward
  const flat = st === 'flat' || o.clean;
  const peakY = flat ? 8 : -4;
  const inside = (x, y) => {
    if (x < -2 || x > 65 || y > 46) return false;
    const u = (x - 30) / 36, base = 46 - Math.round(4 * u * u * 3) - (x < 6 ? 2 : 0);
    const top = peakY + Math.round(Math.abs(u) * (flat ? 18 : 26) + Math.sin(x * 0.7) * 1.2);
    return y >= top && y <= base;
  };
  const height = (x, y) => { const u = Math.abs((x - 30) / 36); const v = (y - peakY) / (46 - peakY); return Math.max(0, Math.min(1, 1 - v * 0.9 - u * 0.3)); };
  // soft dark bed under the heap
  k.shadowE(31, 44, 34, 4, SHADOW);
  coalLumps(k, -4, -12, 72, 62, inside, { density: 0.1, height });
  // loose lumps rolled out onto the floor
  for (let i = 0; i < 26; i++) { const x = k.ri(-2, 64), y = k.ri(42, 48); if (inside(x, y)) continue; k.R(x, y, 2, 1, COAL[2]); k.P(x, y, COAL[4]); }
  // coal dust skirt
  k.D(-2, 44, 68, 4, 'rgba(10,10,14,0.5)', 0.35);

  if (st === 'occupied' && !o.clean) {
    // ---- something enormous lies in it: at a glance, old gym mats under a tarp ----
    const sw = [0, 0, 1, 1, 2, 2, 1, 1][o.frame % 8];
    const b = new Blob(k.w, k.h, k.ox, k.oy);
    // three slab-like folds of wool, mat-straight edges, rounded corners; the middle one swells
    b.poly([[4, 18], [10, 9 - sw], [30, 5 - sw], [33, 22], [8, 30]], 0, 1);
    b.poly([[28, 4 - sw], [47, 3 - sw], [58, 12 - sw], [57, 27], [31, 24]], 0, 2);
    b.poly([[14, -1 - sw], [30, -6 - sw], [44, -4 - sw], [40, 5 - sw], [18, 8 - sw]], 0, 3, 0.1);
    // the pale fold of flesh, pinched between two folds
    b.poly([[25, 9 - sw], [31, 7 - sw], [37, 8 - sw], [35, 11 - sw], [28, 12 - sw]], 1, 4);
    const WOOL = [PAL.navy_dd, mix(PAL.navy_dd, PAL.navy_d, 0.6), PAL.navy_d, mix(PAL.navy_d, PAL.navy, 0.6), mix(PAL.navy, PAL.g3, 0.35)];
    const flesh = [PAL.flesh_dd, PAL.flesh_dd, PAL.flesh_d, PAL.flesh, PAL.flesh_l];
    b.render(k, [WOOL, flesh], { reach: 8, vw: 0.75, edge: 0.35, rim: 0.55, dither: true });
    // mat-like seams and stitching along the slabs, worn nap, a mended tear
    k.L(11, 11 - sw, 29, 7 - sw, PAL.navy_dd); for (let x = 12; x < 29; x += 3) k.P(x, 12 - sw - Math.round((x - 12) / 4.5), mix(PAL.navy, PAL.g4, 0.4));
    k.L(33, 9 - sw, 55, 14 - sw, PAL.navy_dd); for (let x = 35; x < 55; x += 3) k.P(x, 11 - sw + Math.round((x - 35) / 4), mix(PAL.navy, PAL.g4, 0.4));
    k.L(31, 23, 33, 12 - sw, PAL.ink); k.H(27, 12 - sw, 8, PAL.navy_dd);
    k.S(6, -4 - sw, 50, 30, 'rgba(60,72,104,0.35)', 0.03);
    // one glint of brass: a button sunk in a fold
    k.P(46, 8 - sw, PAL.gold_l); k.P(47, 8 - sw, PAL.brass); k.P(46, 9 - sw, PAL.brass_d);
    // coal heaped over it: drifts across the lower body and both ends, lumps resting on top
    const over = (x, y) => inside(x, y) && ((y >= 22 + Math.round(Math.sin(x * 0.3) * 3)) || x < 8 || x > 56 || ((x - 22) ** 2 / 50 + (y - 1 + sw) ** 2 / 10 < 1));
    coalLumps(k, -4, -12, 72, 62, over, { density: 0.16, height });
    for (const [x, y] of [[18, 12], [40, 8], [50, 18], [36, 14], [12, 20], [26, 0]]) { k.R(x, y - sw, 3, 2, COAL[2]); k.H(x, y - sw, 2, COAL[3]); k.H(x + 1, y + 2 - sw, 3, COAL[0]); }
  } else if (st === 'hollow' && !o.clean) {
    // ---- a body-shaped dent: something huge lay here and got up ----
    const dent = (x, y) => ((x - 33) ** 2 / 360 + (y - 13) ** 2 / 100 < 1) || ((x - 11) ** 2 / 20 + (y - 7) ** 2 / 14 < 1) || ((x - 48) ** 2 / 90 + (y - 26) ** 2 / 10 < 1 && x > 40) || ((x - 22) ** 2 / 60 + (y - 25) ** 2 / 8 < 1);
    // inner floor of the hollow: deeper coal shadow, crushed fine (fewer lumps)
    for (let y = -6; y < 34; y++) for (let x = 4; x < 62; x++) {
      if (!dent(x, y)) continue;
      const rim = !dent(x, y - 2) || !dent(x - 2, y);
      const low = !dent(x, y + 2) || !dent(x + 2, y);
      k.P(x, y, rim ? PAL.ink : low ? COAL[2] : COAL[0]);
      if (low && ((x * 7 + y * 3) % 5 === 0)) k.P(x, y, COAL[3]);
      if (!rim && !low && ((x * 13 + y * 7) % 23 === 0)) k.P(x, y, COAL[1]);
    }
    // wool nap pressed into the coal, a lost brass button, drag marks toward the front
    k.S(12, 6, 40, 20, 'rgba(35,46,82,0.6)', 0.03);
    k.P(30, 17, PAL.gold); k.P(31, 17, PAL.brass_d); k.P(30, 16, PAL.gold_l);
    for (let i = 0; i < 2; i++) { const x = 42 + i * 6; k.L(x, 31, x + 2, 44, COAL[0]); k.L(x + 1, 31, x + 3, 44, COAL[2]); }
    // displaced coal heaped up around the rim
    coalLumps(k, -4, -12, 72, 62, (x, y) => !dent(x, y) && inside(x, y) && (dent(x, y + 3) || dent(x + 3, y) || dent(x - 3, y) || dent(x, y - 3)), { density: 0.35, height: () => 0.9 });
  }
  return k.done({ outline: false });
}

// ---------------------------------------------------------------------------- janitor_desk (2×1)
function janitorDesk(o) {
  const k = new K(36, 34, -2, -18, seedOf('jdesk', o.clean));
  const S = steelSet(o.clean, 'green'), W = woodSet(o.clean, 'oak');
  k.shadow(1, 13, 31, 3, SHADOW);
  k.R(1, 4, 30, 10, S.md); k.H(1, 4, 30, S.lt); k.V(1, 4, 10, S.lt); k.V(30, 4, 10, S.dk);
  k.R(3, 6, 10, 3, S.dk); k.R(3, 10, 10, 3, S.dk); k.P(8, 7, CHROME.lt); k.P(8, 11, CHROME.lt); // drawers
  k.R(15, 6, 14, 8, mix(S.dd, PAL.night, 0.4)); // knee hole
  k.R(0, -2, 32, 6, W.lt); k.wood(0, -2, 32, 6, W.lt, { dark: W.md, light: W.hi }); k.H(0, -2, 32, W.hi); k.H(0, 3, 32, W.dk);
  if (!o.clean) { k.L(4, 0, 12, 1, W.dk); k.L(20, -1, 27, 2, W.dk); k.P(14, 1, W.dd); k.text(22, -2, '', PAL.ink); } // carved
  // transistor radio: leatherette box, round dial, antenna
  k.R(2, -7, 8, 6, o.clean ? PAL.brown : PAL.brown_d); k.H(2, -7, 8, PAL.tan); k.E(7, -4, 1, 1, PAL.paper_d); k.P(7, -4, PAL.red_d);
  for (let y = -5; y < -2; y++) k.H(3, y, 2, PAL.brown_dd);
  k.L(9, -7, 13, -15, CHROME.lt); k.P(13, -15, CHROME.hi);
  // coffee can of screws
  k.R(14, -6, 5, 6, o.clean ? PAL.red : mix(PAL.red_d, PAL.g3, 0.4)); k.H(14, -6, 5, CHROME.md); k.P(15, -6, CHROME.hi); k.P(16, -6, CHROME.lt); k.H(14, -3, 5, PAL.yellow);
  // mug + papers + ashtray
  k.R(26, -5, 4, 5, o.clean ? PAL.white : PAL.paper_d); k.H(26, -5, 4, PAL.brown_d); k.P(30, -3, PAL.paper_d);
  k.R(20, -2, 6, 3, PAL.paper); k.H(21, -1, 4, PAL.g4);
  if (!o.clean) { k.E(22, 1, 2, 1, PAL.g3); k.P(22, 1, PAL.g1); k.rust(1, 4, 30, 10, 3); k.S(0, -2, 32, 6, 'rgba(60,40,20,0.3)', 0.06); }
  return k.done();
}

// ---------------------------------------------------------------------------- pegboard (2×1 wall)
function pegboard(o) {
  const k = new K(32, 30, 0, -16, seedOf('peg', o.state, o.clean));
  const pb = o.clean ? PAL.tan : mix(PAL.tan, PAL.brown, 0.35), pbD = dk(pb, 0.25);
  k.R(1, -13, 30, 22, pb); k.frame(1, -13, 30, 22, PAL.wood_d); k.H(1, -13, 30, PAL.wood_l);
  for (let y = -11; y < 8; y += 2) for (let x = 3; x < 30; x += 2) k.P(x, y, pbD);
  // painted tool outlines (most tools gone), hooks with tape labels
  const outline = o.clean ? PAL.red_d : mix(PAL.red_d, PAL.brown, 0.4);
  k.frame(4, -11, 3, 8, outline); k.frame(9, -11, 6, 3, outline);
  if (o.clean) { k.R(4, -11, 3, 8, PAL.g3); k.R(9, -11, 6, 3, PAL.g4); }
  const hooks = [[18, -10], [22, -10], [26, -10], [18, -2], [22, -2], [26, -2]];
  for (const [x, y] of hooks) { k.P(x, y, CHROME.md); k.P(x, y + 1, CHROME.lt); k.R(x - 1, y + 3, 3, 2, o.clean ? PAL.white : PAL.paper_d); k.P(x, y + 3, PAL.g3); }
  // the key ring (OFFICE, 2F GATE) on its hook
  if (o.state === 'keys') {
    const [x, y] = hooks[1];
    k.ring(x, y + 3, 1, 1, CHROME.lt); k.R(x - 1, y + 4, 1, 3, BRASS.lt); k.P(x - 1, y + 4, BRASS.hi); k.R(x + 1, y + 4, 1, 3, CHROME.lt); k.P(x, y + 7, PAL.paper);
  }
  if (o.clean) { k.R(4, -1, 2, 7, PAL.wood_l); k.R(3, -1, 4, 2, PAL.g4); } // a hammer, in 1979
  if (!o.clean) k.S(1, -13, 30, 22, 'rgba(40,25,15,0.35)', 0.05);
  return k.done();
}

// ---------------------------------------------------------------------------- mop_bucket
function mopBucket(o) {
  const k = new K(18, 34, -1, -20, seedOf('mop', o.clean));
  const Y = o.clean ? steelSet(true, 'mustard') : steelSet(false, 'mustard');
  k.shadowE(7, 13, 6, 2, SHADOW_SOFT);
  // mop handle leaning against the wringer, string mop head in the bucket
  k.L(12, -18, 8, 2, o.clean ? PAL.maple : PAL.wood_l); k.L(13, -18, 9, 2, PAL.wood);
  // bucket body with casters
  k.R(1, 2, 13, 9, Y.md); k.H(1, 2, 13, Y.hi); k.V(1, 2, 9, Y.lt); k.V(13, 2, 9, Y.dk); k.H(1, 10, 13, Y.dk);
  k.R(2, 1, 11, 2, mix(PAL.g2, PAL.brown_d, o.clean ? 0.1 : 0.5)); // gray water
  if (!o.clean) k.P(5, 1, PAL.g4);
  for (const x of [2, 11]) { k.R(x, 11, 2, 2, PAL.g1); k.P(x, 11, PAL.g3); }
  // wringer press on top
  k.R(7, -4, 6, 6, Y.dk); k.H(7, -4, 6, Y.lt); k.R(12, -8, 2, 5, Y.md); k.L(13, -8, 16, -11, PAL.g3);
  k.R(4, -1, 4, 3, o.clean ? PAL.paper : PAL.paper_d); k.P(5, 0, PAL.g5); k.P(6, 1, PAL.g4); // mop strings
  if (!o.clean) { k.rust(1, 2, 13, 9, 2); k.drip(4, 10, 3, 'rgba(60,60,60,0.4)'); }
  return k.done();
}

// ---------------------------------------------------------------------------- shelf_metal (2×1)
function shelfMetal(o) {
  const k = new K(34, 46, -1, -32, seedOf('shelfm', o.variant, o.clean));
  const S = steelSet(o.clean, 'gray');
  k.shadow(1, 12, 31, 3, SHADOW);
  // uprights + 4 shelves
  for (const x of [0, 30]) { k.R(x, -30, 2, 44, S.md); k.V(x, -30, 44, S.hi); for (let y = -28; y < 13; y += 3) k.P(x + 1, y, S.dd); }
  const shelves = [-29, -17, -5, 7];
  for (const y of shelves) { k.R(0, y, 32, 3, S.lt); k.H(0, y, 32, S.hi); k.H(0, y + 2, 32, S.dk); }
  const r = k.r;
  // shelf 1: boxes of fluorescent tubes, a roll of something
  k.R(2, -25, 18, 4, o.clean ? PAL.paper : PAL.paper_d); k.H(2, -25, 18, PAL.white); k.text(3, -24, '', PAL.ink); k.H(4, -23, 10, PAL.blue_d);
  k.R(22, -26, 6, 5, PAL.cream_d); k.H(22, -26, 6, PAL.cream);
  // shelf 2: paint cans with drips
  const cans = [PAL.green, PAL.cream, PAL.red_d, PAL.blue_d, PAL.green_l];
  for (let i = 0; i < 5; i++) {
    const x = 2 + i * 6, c = cans[(i + o.variant) % 5];
    k.R(x, -14 + (i % 2), 5, 5, CHROME.md); k.H(x, -14 + (i % 2), 5, CHROME.hi); k.R(x, -12 + (i % 2), 5, 3, o.clean ? c : mix(c, PAL.g3, 0.35));
    if (!o.clean) k.V(x + 1 + (i % 3), -14 + (i % 2), 3, mix(c, PAL.g4, 0.2));
  }
  // shelf 3: cleaning drum + rags
  k.R(3, -3 - 1, 9, 10, o.clean ? PAL.blue : mix(PAL.blue_d, PAL.g2, 0.3)); k.H(3, -4, 9, PAL.blue_l); k.H(3, 0, 9, PAL.g6); k.H(3, 2, 9, PAL.g6);
  k.R(16, 1, 10, 3, o.clean ? PAL.paper_d : mix(PAL.paper_d, PAL.brown, 0.3)); k.P(18, 1, PAL.red_d); k.P(23, 2, PAL.g4);
  // bottom: a bucket, a coil of extension cord
  k.R(4, 9, 6, 4, PAL.g3); k.H(4, 9, 6, PAL.g5);
  k.ring(20, 11, 4, 2, o.clean ? PAL.orange_d : mix(PAL.orange_d, PAL.g3, 0.5));
  if (!o.clean) { k.rust(0, -30, 32, 44, 5); k.S(0, -30, 32, 44, 'rgba(150,140,120,0.25)', 0.03); void r; }
  return k.done();
}

// ---------------------------------------------------------------------------- desk_pile (3×2)
function deskPile(o) {
  const k = new K(56, 78, -4, -46, seedOf('pile', o.clean));
  k.shadow(-2, 26, 52, 6, SHADOW);
  const top = o.clean ? PAL.maple : mix(PAL.maple, PAL.g3, 0.3), topD = dk(top, 0.3), leg = o.clean ? PAL.g5 : PAL.g4, legD = PAL.g2;
  // a combo desk at an angle: top slab + tubular legs
  const desk = (x, y, w, flip, ang) => {
    const pts = [[x, y], [x + w, y + ang], [x + w, y + ang + 4], [x, y + 4]];
    if (flip) { // upside down: legs up
      for (const lx of [x + 2, x + w - 3]) { k.V(lx, y - 9 + (lx > x + 4 ? ang : 0), 9, leg); k.V(lx + 1, y - 9 + (lx > x + 4 ? ang : 0), 9, legD); }
      k.H(x + 2, y - 9, w - 4, leg);
    }
    k.poly(pts, top); k.L(x, y, x + w, y + ang, lt(top, 0.2)); k.L(x, y + 4, x + w, y + ang + 4, topD);
    if (!flip) { for (const lx of [x + 2, x + w - 3]) { k.V(lx, y + 5 + (lx > x + 4 ? ang : 0), 7, leg); k.V(lx + 1, y + 5 + (lx > x + 4 ? ang : 0), 7, legD); } k.R(x + 3, y + 5, w - 6, 2, PAL.g2); }
    if (!o.clean) { k.L(x + 4, y + 1, x + 8, y + 2, topD); }
  };
  if (o.clean) {
    // 1979: a neat stack, three high, two wide
    for (let row = 0; row < 3; row++) for (let c = 0; c < 2; c++) desk(2 + c * 22, 14 - row * 13, 20, row > 0, 0);
  } else {
    desk(-1, 16, 22, false, 2); desk(24, 15, 22, false, -1);
    desk(4, 4, 20, true, -3); desk(22, 2, 22, true, 4);
    desk(0, -12, 18, false, 5); desk(16, -14, 24, true, -2);
    desk(8, -27, 20, true, 3); desk(26, -30, 16, false, -4);
    // a chair wedged in the gap, a leg sticking out sideways
    k.R(38, -2, 8, 2, top); k.V(39, 0, 6, leg); k.V(44, 0, 6, leg); k.L(40, -2, 47, -10, leg);
    k.L(-2, 1, 6, -4, leg); k.L(-2, 2, 6, -3, legD);
    k.S(0, -32, 46, 50, 'rgba(150,140,120,0.3)', 0.04);
  }
  return k.done();
}

// ---------------------------------------------------------------------------- water_heater
function waterHeater(o) {
  const k = new K(18, 44, -1, -30, seedOf('wh', o.clean));
  const E = o.clean ? { hi: PAL.white, lt: PAL.g6, md: PAL.g5, dk: PAL.g4 } : { hi: mix(PAL.paper, PAL.g5, 0.4), lt: mix(PAL.paper_d, PAL.g4, 0.4), md: mix(PAL.cream_d, PAL.g3, 0.5), dk: PAL.g3 };
  k.shadowE(8, 13, 7, 2, SHADOW);
  // cylinder: vertical bands of shade
  const cols = [E.lt, E.hi, E.hi, E.lt, E.lt, E.md, E.md, E.md, E.dk, E.dk, dk(E.dk, 0.2), dk(E.dk, 0.35)];
  for (let i = 0; i < 12; i++) k.V(2 + i, -20, 33, cols[i]);
  k.E(8, -20, 6, 2, E.hi); k.E(8, -20, 4, 1, E.lt); // top dome
  // pipes on top, T&P valve, discharge pipe down the side
  k.R(4, -27, 2, 7, CHROME.md); k.V(4, -27, 7, CHROME.hi); k.R(10, -27, 2, 7, mix(PAL.rust, PAL.g3, 0.4)); k.V(10, -27, 7, PAL.tan);
  k.R(13, -14, 3, 2, BRASS.md); k.V(15, -12, 22, CHROME.md);
  // burner access, data plate, label
  k.R(5, 6, 6, 4, PAL.g1); k.frame(5, 6, 6, 4, PAL.g3); k.P(7, 8, o.clean ? PAL.blue_l : PAL.g2); // pilot (out)
  k.R(4, -10, 5, 3, CHROME.lt); k.H(5, -9, 3, PAL.g3);
  k.R(2, 12, 12, 1, PAL.g2);
  if (!o.clean) { k.rust(2, -20, 12, 32, 6); k.drip(6, 2, 8); k.drip(10, -4, 12); k.DV(2, 4, 12, 9, 'rgba(110,60,30,0.5)', 0, 0.6); }
  return k.done();
}

// ---------------------------------------------------------------------------- valve_wheel (wall)
function valveWheel(o) {
  const k = new K(16, 32, 0, -16, seedOf('valve', o.clean));
  const I = ironSet(o.clean);
  k.R(6, -16, 4, 32, I.md); k.V(6, -16, 32, I.hi); k.V(9, -16, 32, I.dk); // pipe down the wall
  k.R(4, -2, 8, 6, I.lt); k.H(4, -2, 8, I.hi); k.H(4, 3, 8, I.dk); // valve body
  k.R(7, -6, 2, 4, I.lt);
  const red = o.clean ? PAL.red : mix(PAL.red_d, PAL.rust, 0.35), redL = o.clean ? PAL.red_l : mix(PAL.red, PAL.rust, 0.3);
  k.ring(8, -8, 5, 3, red); k.ring(8, -9, 5, 3, redL);
  k.L(3, -8, 13, -8, red); k.L(8, -11, 8, -5, red); k.R(7, -9, 3, 2, I.hi);
  if (!o.clean) { k.rust(4, -2, 8, 6, 3); k.drip(8, 4, 6); }
  return k.done();
}

// ---------------------------------------------------------------------------- calendar (wall)
function calendar(o) {
  const k = new K(16, 26, 0, -14, seedOf('cal', o.clean));
  const pc = o.clean ? PAL.paper : PAL.paper_d;
  k.P(8, -13, PAL.g3); // nail
  k.R(1, -12, 14, 22, pc); k.V(14, -12, 22, dk(pc, 0.12)); k.H(1, 9, 14, dk(pc, 0.2));
  // picture: a red barn under a mustard sky (Kettle Run Hardware)
  k.R(2, -11, 12, 7, o.clean ? PAL.yellow : mix(PAL.mustard, PAL.cream_d, 0.4));
  k.R(2, -7, 12, 3, o.clean ? PAL.green : mix(PAL.green_d, PAL.cream_d, 0.3));
  k.R(5, -9, 5, 4, o.clean ? PAL.red : mix(PAL.red_d, PAL.cream_d, 0.3)); k.P(7, -10, o.clean ? PAL.red : PAL.red_d); k.P(7, -8, PAL.cream_l);
  k.R(2, -4, 12, 2, PAL.ink); k.H(3, -3, 10, pc); // OCTOBER band
  k.H(3, -3, 3, PAL.ink); k.P(7, -3, PAL.ink); k.H(9, -3, 2, PAL.ink);
  // day grid: Oct 1 1979 = Monday → the 19th is the Friday of the third week, circled in red
  for (let r = 0; r < 5; r++) for (let c = 0; c < 7; c++) { const d = r * 7 + c; if (d < 1 || d > 31) continue; k.P(2 + c * 2, -1 + r * 2, d % 7 === 0 ? PAL.red_d : PAL.g3); }
  const cx = 2 + 5 * 2, cy = -1 + 2 * 2;
  k.P(cx - 1, cy, PAL.red); k.P(cx + 1, cy, PAL.red); k.P(cx, cy - 1, PAL.red); k.P(cx, cy + 1, PAL.red);
  if (!o.clean) { k.P(14, -12, 'rgba(0,0,0,0)'); k.clear(14, 9); k.P(13, 8, lt(pc, 0.1)); k.S(1, -12, 14, 22, 'rgba(110,80,40,0.3)', 0.06); }
  return k.done();
}

// ---------------------------------------------------------------------------- cage_bulb (wall)
function cageBulb(o) {
  const on = o.state !== 'off';
  const k = new K(16, 30, 0, -18, seedOf('cage', o.state, o.clean));
  const I = ironSet(o.clean);
  k.R(7, -18, 2, 6, I.md); k.V(7, -18, 6, I.hi); // conduit
  k.R(5, -12, 6, 4, I.dk); k.H(5, -12, 6, I.lt); // junction box / socket
  // bulb
  const glass = on ? [PAL.white, PAL.yellow_l, PAL.ember] : [mix(PAL.g4, PAL.paper_d, 0.3), PAL.g3, PAL.g2];
  k.E(8, -5, 3, 3, glass[1]); k.E(7, -6, 1, 1, glass[0]); k.P(9, -3, glass[2]);
  if (on) { k.DE(8, -5, 6, 6, 'rgba(255,213,154,0.35)', 1, 0.1); k.P(8, -5, PAL.white); }
  // wire cage
  for (const x of [4, 8, 12]) k.V(x, -9, 8, I.lt);
  k.H(5, -1, 7, I.lt); k.ring(8, -5, 4, 4, I.md);
  if (!o.clean && !on) k.P(7, -4, PAL.g1);
  return k.done();
}

// ---------------------------------------------------------------------------- cobweb (over)
function cobweb(o) {
  const k = new K(16, 16, 0, 0, seedOf('web', o.dir, o.variant));
  const right = o.dir === 'right' || (o.dir !== 'left' && o.variant % 2 === 1);
  const sx = right ? 15 : 0, sgn = right ? -1 : 1;
  const thread = 'rgba(214,210,196,0.45)', thick = 'rgba(230,226,212,0.6)';
  const spokes = [[13, 0], [12, 5], [9, 10], [4, 13], [0, 13]];
  for (const [ex, ey] of spokes) k.L(sx, 0, sx + sgn * ex, ey, thread);
  // sagging rings between spokes
  for (const rr of [4, 8, 11]) {
    for (let i = 0; i + 1 < spokes.length; i++) {
      const [ax, ay] = spokes[i], [bx, by] = spokes[i + 1];
      const la = Math.hypot(ax, ay), lb = Math.hypot(bx, by);
      const p0 = [sx + sgn * ax * rr / la, ay * rr / la], p1 = [sx + sgn * bx * rr / lb, by * rr / lb];
      k.L(p0[0], p0[1], (p0[0] + p1[0]) / 2 + sgn * -1, (p0[1] + p1[1]) / 2 - 1, rr === 8 ? thick : thread);
      k.L((p0[0] + p1[0]) / 2 + sgn * -1, (p0[1] + p1[1]) / 2 - 1, p1[0], p1[1], rr === 8 ? thick : thread);
    }
  }
  if (o.variant % 3 === 0) { k.L(sx + sgn * 6, 7, sx + sgn * 7, 15, thread); k.P(sx + sgn * 7, 15, thick); } // a strand hanging down
  k.P(sx + sgn * 3, 2, 'rgba(20,16,12,0.7)'); // husk of a fly
  return k.done({ outline: false });
}

export const BASEMENT = {
  boiler: { build: boiler, frames: 4, fps: 6 },
  pipe_h: { build: (o) => pipe(o, false), variants: 4, showVariants: [0, 1, 2, 3] },
  pipe_v: { build: (o) => pipe(o, true), variants: 4, showVariants: [0, 1, 2, 3] },
  breaker_panel: { build: breakerPanel },
  coal_heap: { build: coalHeap, frames: 8, fps: 2, animStates: ['occupied'] },
  janitor_desk: { build: janitorDesk },
  pegboard: { build: pegboard },
  mop_bucket: { build: mopBucket },
  shelf_metal: { build: shelfMetal, variants: 3 },
  desk_pile: { build: deskPile },
  water_heater: { build: waterHeater },
  valve_wheel: { build: valveWheel },
  calendar: { build: calendar },
  cage_bulb: { build: cageBulb },
  cobweb: { build: cobweb, facing: ['down', 'left', 'right'], variants: 6, noClean: true, showFacing: ['left', 'right'] },
};
export { glowDot, paper };
