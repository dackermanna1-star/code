// Towers: Downtown's and Brickell's glass skyscrapers and concrete condo towers on podiums of shops
// and lobbies, with setbacks, rounded or chamfered corners, balconies that wrap round them, and
// crowns - LED bands, spires, helipads, sloped glass tops - that light up at night. Also Mid
// Beach's curved resort towers over their pool decks and North Beach's condos and MiMo motels.
import { M, WIN, GF, MID, NEAR, BASE, paint, flat, neon, glassOf, metalOf, fabric, pick, rr, ri, parapet, roofKit, canopy, tube, pool, roundRect, balconies, cafe, awning, parkingLot, door, PASTEL, NEON, GLASS_T, STUCCO_WARM, mat } from './parts.js';

const CORES = [
  { x: 180, z: -880, R: 650, k: 1 },    // downtown, round Flagler and Biscayne
  { x: 330, z: 520, R: 560, k: 0.9 },   // Brickell
  { x: 800, z: 215, R: 160, k: 0.85 },  // Brickell Key
  { x: -120, z: -1350, R: 380, k: 0.55 }, // Government Center
];
/** How tall the towers want to be here (0..1). */
export function towerHeight(x, z, r) {
  let f = 0;
  for (const c of CORES) { const d = Math.hypot(x - c.x, z - c.z) / c.R; f = Math.max(f, c.k * Math.exp(-d * d)); }
  return Math.max(0, Math.min(1, f * (0.55 + 0.6 * r)));
}

const CROWN_COLS = [0x40c8ff, 0xff40b0, 0xffffff, 0x7a60ff, 0x40ffd0, 0xffb040];

/** Rings of slab round an outline every floor (wrap-around balconies), with glass rails. */
function slabRings(K, pts, y0, fh, n, out, o = {}) {
  const ring = offsetPoly(pts, out);
  K.at(o.tier ?? MID, () => {
    for (let i = 0; i < n; i++) {
      const y = y0 + i * fh;
      K.prism(ring, y, y + 0.7, o.slab || M.slab, { win: false, bottom: true });
      if (o.rail !== false) K.prism(offsetPoly(pts, out - 0.2), y + 0.7, y + 3.9, o.rail || M.glass, { win: false, top: false });
    }
  });
}
/** Offset a convex-ish outline (anticlockwise from above) outwards by d. */
export function offsetPoly(pts, d) {
  const n = pts.length, out = [];
  for (let i = 0; i < n; i++) {
    const p = pts[(i - 1 + n) % n], c = pts[i], q = pts[(i + 1) % n];
    const e1 = norm(c[0] - p[0], c[1] - p[1]), e2 = norm(q[0] - c[0], q[1] - c[1]);
    // outward normals of the edges: (-dz, dx)
    const n1 = [-e1[1], e1[0]], n2 = [-e2[1], e2[0]];
    const m = norm(n1[0] + n2[0], n1[1] + n2[1]);
    const k = d / Math.max(0.35, m[0] * n1[0] + m[1] * n1[1]);
    out.push([c[0] + m[0] * k, c[1] + m[1] * k]);
  }
  return out;
}
const norm = (x, z) => { const l = Math.hypot(x, z) || 1; return [x / l, z / l]; };
function chamfer(x0, z0, x1, z1, c) {
  return [[x0 + c, z1], [x1 - c, z1], [x1, z1 - c], [x1, z0 + c], [x1 - c, z0], [x0 + c, z0], [x0, z0 + c], [x0, z1 - c]];
}
function circle(cx, cz, r, n = 20) { const p = []; for (let i = 0; i < n; i++) { const a = (i / n) * Math.PI * 2; p.push([cx + Math.cos(a) * r, cz - Math.sin(a) * r]); } return p; }

/**
 * A tower on a lot: podium, shaft (and setbacks), crown. o: {H, type, shape, crown, name}
 * type: 'glass' | 'resi' | 'office'; shape: 'box' | 'chamfer' | 'round' | 'cyl' | 'setback'.
 */
export function tower(C, lot, r, o = {}) {
  const K = C.K;
  K.begin(lot.x, C.GROUND, lot.z, lot.yaw, lot.seed, { kind: 'tower' });
  const hw = lot.w / 2 - 1, hd = lot.d / 2 - 1;
  const type = o.type ?? (r() < 0.45 ? 'glass' : r() < 0.65 ? 'resi' : 'office');
  const H = o.H;
  // podium
  const pf = o.podium ?? (H > 200 ? ri(r, 1, 4) : ri(r, 0, 2));
  const g = 15, pH = g + pf * 11;
  const podWall = type === 'glass' ? mat('cladding', pick(r, [0xd8d4cc, 0xbab6b0, 0xe8e4dc, 0x9a9890])) : type === 'resi' ? paint(pick(r, [0xf4f2ec, 0xe8e2d4, 0xd8d4cc]), 0.15) : mat('concrete', pick(r, [0xe0dcd2, 0xc8c2b8, 0xd4ccc0]));
  K.facade({ kind: WIN.office, fh: 11, bw: rr(r, 9, 12), v0: g, gk: r() < 0.5 ? GF.lobby : GF.shop, occ: 0.35, variant: ri(r, 0, 15) });
  K.box(0, pH / 2, 0, hw, pH / 2, hd, podWall, { top: M.membrane });
  K.facade(null);
  K.at(MID, () => parapet(K, -hw, -hd, hw, hd, pH, 1.6, 0.5, podWall, null));
  canopy(K, 0, g - 2, hd, Math.min(30, hw), 7, metalOf(0x3a3e44), { glow: 0xfff0d8, t: 0.8 });
  door(K, 0, 0, hd, 10, 10, glassOf(0x24323c), M.steel);
  // the shaft
  const sw = Math.max(16, Math.min(hw * rr(r, 0.62, 0.92), H * 0.28)), sd = Math.max(16, Math.min(hd * rr(r, 0.62, 0.92), H * 0.28));
  const ox = pf ? rr(r, -1, 1) * (hw - sw) * 0.5 : 0, oz = pf ? rr(r, -0.2, 1) * (hd - sd) * 0.5 : 0;
  let shape = o.shape ?? pick(r, ['box', 'box', 'chamfer', 'round', 'round', 'cyl', 'setback', 'setback']);
  if (shape === 'cyl' && Math.abs(sw - sd) > Math.min(sw, sd) * 0.35) shape = 'round';
  const fh = type === 'resi' ? 10.5 : 12;
  const tint = o.tint ?? pick(r, GLASS_T);
  const glassWall = glassOf(tint);
  const wallM = type === 'glass' ? mat('whiteTiles', tint, { p: 5, r: 0.25 }) : type === 'resi' ? paint(pick(r, [0xf6f4ee, 0xece6d8, 0xf2ece4, 0xdfe6ea, 0xe6dccc]), 0.1, 0.25) : mat('cladding', pick(r, [0xd0ccc4, 0xb8b4ac, 0xe4ded2, 0x8e9aa4]));
  const spec = type === 'glass' ? { kind: WIN.curtain, fh, bw: rr(r, 5, 7.5), v0: pH, occ: rr(r, 0.3, 0.55) }
    : type === 'resi' ? { kind: WIN.resi, fh, bw: rr(r, 8, 12), v0: pH, occ: rr(r, 0.3, 0.5) }
    : { kind: WIN.office, fh, bw: rr(r, 6, 9), v0: pH, occ: rr(r, 0.3, 0.5) };
  K.facade({ ...spec, variant: ri(r, 0, 15) });
  const x0 = ox - sw, x1 = ox + sw, z0 = oz - sd, z1 = oz + sd;
  let top = H, outline, tierTop = [];
  if (shape === 'setback') {
    // two or three stacked boxes, each smaller
    const n = ri(r, 2, 3);
    let y = pH, cw = sw, cd = sd;
    for (let i = 0; i < n; i++) {
      const yt = i === n - 1 ? H : pH + (H - pH) * (i + 1) * rr(r, 0.4, 0.55) / (n - 1 || 1) * (n === 3 ? 0.85 : 1);
      const yy = Math.min(yt, H);
      K.box(ox, (y + yy) / 2, oz, cw, (yy - y) / 2, cd, wallM, { top: M.membrane });
      tierTop.push({ y: yy, w: cw, d: cd });
      if (i < n - 1) K.at(MID, () => parapet(K, ox - cw, oz - cd, ox + cw, oz + cd, yy, 1.4, 0.5, mat('cladding', 0xd8d4cc), null));
      y = yy; cw *= rr(r, 0.7, 0.85); cd *= rr(r, 0.7, 0.85);
    }
    outline = [[ox - cw, oz + cd], [ox + cw, oz + cd], [ox + cw, oz - cd], [ox - cw, oz - cd]];
    top = H;
    const last = tierTop[tierTop.length - 1];
    outline = [[ox - last.w, oz + last.d], [ox + last.w, oz + last.d], [ox + last.w, oz - last.d], [ox - last.w, oz - last.d]];
  } else {
    if (shape === 'box') outline = [[x0, z1], [x1, z1], [x1, z0], [x0, z0]];
    else if (shape === 'chamfer') outline = chamfer(x0, z0, x1, z1, Math.min(sw, sd) * rr(r, 0.18, 0.32));
    else if (shape === 'round') { const rad = Math.min(sw, sd) * rr(r, 0.3, 0.9); outline = roundRect(x0, z0, x1, z1, [rad, r() < 0.5 ? rad : 0, rad, r() < 0.5 ? rad : 0], 5); }
    else outline = circle(ox, oz, (sw + sd) / 2, 22);
    K.prism(outline, pH, H, wallM, { smooth: 0.9, col: 'inset', top: M.membrane, fit: shape === 'box' || shape === 'chamfer' ? 'wall' : undefined });
  }
  K.facade(null);
  if (shape === 'setback') K.solid(ox, (pH + H) / 2, oz, sw * 0.85, (H - pH) / 2, sd * 0.85);
  // balconies on condo towers: slabs right round, or rows on the long faces
  const floors = Math.floor((H - pH) / fh);
  if (type === 'resi' && shape !== 'setback') {
    if (r() < 0.6) slabRings(K, outline, pH + fh, fh, floors - 1, rr(r, 2.5, 4.5), { rail: r() < 0.7 ? M.glass : mat('stucco', 0xf8f6f0, { p: 5 }) });
    else { balconies(K, x0 + 2, x1 - 2, z1, pH + fh, fh, floors - 1, { depth: 4 }); K.push(0, 0, 0, Math.PI); balconies(K, -x1 + 2, -x0 + 2, -z0, pH + fh, fh, floors - 1, { depth: 4 }); K.pop(); }
  }
  // fins on glass towers: vertical lines of metal up the corners
  if (type === 'glass' && shape === 'box' && r() < 0.5) {
    K.at(MID, () => { for (const [x, z] of [[x0, z1], [x1, z1], [x1, z0], [x0, z0]]) K.box(x, (pH + H) / 2, z, 0.6, (H - pH) / 2, 0.6, metalOf(0xb8bcc0), { col: false, win: false }); });
  }
  // ---- the crown ----
  const crown = o.crown ?? pick(r, H > 300 ? ['led', 'spire', 'helipad', 'slope', 'led', 'mech'] : ['led', 'mech', 'helipad', 'mech', 'led']);
  const cc = pick(r, CROWN_COLS);
  const cw = shape === 'setback' ? tierTop[tierTop.length - 1].w : sw, cd = shape === 'setback' ? tierTop[tierTop.length - 1].d : sd;
  if (crown === 'led') {
    // a glass crown box with bands of light round it
    const ch = rr(r, 10, 24);
    K.prism(offsetPoly(outline, -1.5), top, top + ch, glassOf(tint), { win: false, top: M.membrane, smooth: 0.9 });
    K.at(MID, () => {
      const nb = ri(r, 1, 3);
      for (let i = 0; i < nb; i++) { const y = top + ch - 0.6 - i * 3.2; K.prism(offsetPoly(outline, -1.2), y - 0.3, y + 0.3, neon(cc), { win: false, top: false, smooth: 0.9 }); }
      K.prism(outline, top - 0.4, top + 0.4, neon(cc), { win: false, top: false, smooth: 0.9 });
    });
  } else if (crown === 'spire') {
    const ch = rr(r, 8, 14);
    K.prism(offsetPoly(outline, -3), top, top + ch, wallM, { win: false, top: M.membrane, smooth: 0.9 });
    const sh = rr(r, 40, 110);
    K.at(BASE, () => { K.cyl(ox, oz, 2.4, top + ch, top + ch + sh * 0.35, metalOf(0xd0d4d8), { seg: 8, win: false }); K.cyl(ox, oz, 0.8, top + ch + sh * 0.35, top + ch + sh, metalOf(0xd0d4d8), { seg: 6, win: false }); });
    K.at(MID, () => K.box(ox, top + ch + sh + 0.6, oz, 0.7, 0.7, 0.7, neon(0xff2020), { col: false, win: false }));
  } else if (crown === 'helipad') {
    const rad = Math.min(cw, cd) * 0.8;
    K.at(BASE, () => K.cyl(ox, oz, rad, top + 2, top + 3.2, mat('concrete', 0x5a5e62, { p: 5 }), { seg: 16, win: false }));
    for (const [a, b] of [[-0.6, -0.8], [-0.6, 0.8], [0.6, -0.8], [0.6, 0.8]]) K.box(ox + a * rad * 0.5, top + 1, oz + b * rad * 0.5, 0.8, 1, 0.8, M.steel, { col: false, win: false });
    K.at(MID, () => {
      const hs = rad * 0.35, m = flat(0xf4d020);
      K.box(ox - hs * 0.6, top + 3.25, oz, hs * 0.12, 0.05, hs, m, { col: false, win: false });
      K.box(ox + hs * 0.6, top + 3.25, oz, hs * 0.12, 0.05, hs, m, { col: false, win: false });
      K.box(ox, top + 3.25, oz, hs * 0.6, 0.05, hs * 0.12, m, { col: false, win: false });
      K.prism(circle(ox, oz, rad - 0.6, 16), top + 3.2, top + 3.35, neon(0x40ff80, 0.6), { win: false, top: false });
    });
  } else if (crown === 'slope') {
    const ch = Math.min(cw, cd) * rr(r, 0.8, 1.4);
    const a = [ox - cw, top, oz + cd], b = [ox + cw, top, oz + cd], c = [ox + cw, top + ch, oz - cd], d = [ox - cw, top + ch, oz - cd];
    K.at(BASE, () => {
      K.quad(a, b, c, d, glassOf(tint));
      K.tri([ox + cw, top, oz + cd], [ox + cw, top, oz - cd], [ox + cw, top + ch, oz - cd], glassOf(tint));
      K.tri([ox - cw, top, oz - cd], [ox - cw, top, oz + cd], [ox - cw, top + ch, oz - cd], glassOf(tint));
      K.quad([ox + cw, top, oz - cd], [ox - cw, top, oz - cd], [ox - cw, top + ch, oz - cd], [ox + cw, top + ch, oz - cd], wallM);
    });
    K.at(MID, () => { tube(K, [ox - cw, top + 0.2, oz + cd + 0.2], [ox + cw, top + 0.2, oz + cd + 0.2], cc, 0.3); tube(K, [ox - cw, top + ch, oz - cd - 0.2], [ox + cw, top + ch, oz - cd - 0.2], cc, 0.3); });
  } else {
    // mechanical penthouse with louvres
    const mh = rr(r, 8, 14);
    K.box(ox, top + mh / 2, oz, cw * 0.6, mh / 2, cd * 0.6, mat('metalSheet', 0xa8acb0, { p: 9, r: 0.5 }), { col: false, win: false });
    K.at(MID, () => parapet(K, ox - cw, oz - cd, ox + cw, oz + cd, top, 2.5, 0.5, wallM, null));
    roofKit(K, r, ox - cw + 2, oz - cd + 2, ox + cw - 2, oz + cd - 2, top, { tank: 0, hut: 0 });
  }
  // a red light on top of the tall ones (for the aircraft)
  if (H > 250) K.at(MID, () => K.box(ox + cw * 0.8, top + 0.8, oz + cd * 0.8, 0.5, 0.5, 0.5, neon(0xff2020, 0.8), { col: false, win: false }));
  // the name on the podium or the crown
  if (o.name) K.sign(0, pH - 3, hd + 0.12, Math.min(hw * 1.4, o.name.length * 2.6), 3.4, o.name, 'letters', { color: 0xe8e4dc });
  // peds at the door
  const p = K.world(0, 0, hd + 6); C.ped(p[0], p[2]);
  K.end();
  return { H, pH };
}

/** A mid-rise office or apartment block (6-14 floors) or a parking garage, for the tower districts' smaller lots. */
function midrise(C, lot, r) {
  const K = C.K;
  K.begin(lot.x, C.GROUND, lot.z, lot.yaw, lot.seed, { kind: 'midrise' });
  const hw = lot.w / 2 - 1, hd = lot.d / 2 - 1, g = 14;
  if (r() < 0.25) {
    // a parking garage: open decks with low walls
    const n = ri(r, 4, 7), fh = 10, H = n * fh;
    const m = mat('concrete', 0xd8d2c8, { grime: 0.6 });
    for (let i = 0; i <= n; i++) K.box(0, i * fh + 0.5, 0, hw, 0.5, hd, m, { col: i === 0 ? false : true, win: false });
    K.at(MID, () => { for (let i = 1; i <= n; i++) { const y = i * fh - fh + 1; K.box(0, y + 1.6, hd - 0.3, hw, 1.6, 0.3, m, { col: false, win: false }); K.box(0, y + 1.6, -hd + 0.3, hw, 1.6, 0.3, m, { col: false, win: false }); K.box(hw - 0.3, y + 1.6, 0, 0.3, 1.6, hd, m, { col: false, win: false }); K.box(-hw + 0.3, y + 1.6, 0, 0.3, 1.6, hd, m, { col: false, win: false }); } });
    for (const [x, z] of [[-1, -1], [1, -1], [1, 1], [-1, 1], [0, -1], [0, 1]]) K.box(x * (hw - 1.5), H / 2, z * (hd - 1.5), 1.2, H / 2, 1.2, m, { col: true, win: false });
    K.box(0, H / 2, 0, Math.min(hw - 20, 8), H / 2, Math.min(hd - 10, 8), m, { col: true, win: false });
    K.sign(0, fh * 1.5, hd + 0.2, 16, 3.2, 'PARKING', 'box', { tier: MID, bg: '#1d4e89', fg: '#ffffff' });
    for (let x = -hw + 12; x < hw - 10; x += 14) { const p = K.world(x, 0, hd - 12); C.park(p[0], p[2], lot.yaw); }
    K.end();
    return;
  }
  const n = ri(r, 5, 13), fh = 11, H = g + (n - 1) * fh;
  const wall = r() < 0.5 ? mat('cladding', pick(r, [0xd8d4cc, 0xe4ded2, 0xbcb6ac])) : paint(pick(r, STUCCO_WARM), 0.1);
  K.facade({ kind: r() < 0.5 ? WIN.office : WIN.punched, fh, bw: rr(r, 7, 10), v0: g, gk: GF.shop, occ: 0.45, variant: ri(r, 0, 15) });
  const sb = rr(r, 0, 3);
  K.box(0, H / 2, -sb / 2, hw, H / 2, hd - sb / 2, wall, { top: M.membrane });
  K.facade(null);
  K.at(MID, () => parapet(K, -hw, -hd, hw, hd - sb, H, 2.2, 0.5, wall, M.trim));
  roofKit(K, r, -hw + 3, -hd + 3, hw - 3, hd - 3, H, {});
  for (let x = -hw + 6; x < hw - 6; x += 18) awning(K, x + 6, g - 2, hd - sb, 10, 4, 1.8, fabric(pick(r, [0x1d2a44, 0x2a6e5a, 0x9a2a2a, 0x3a3a3a])));
  const p = K.world(0, 0, hd + 4); C.ped(p[0], p[2]);
  K.end();
}

/** Downtown, Brickell, Brickell Key: towers, mid-rises and garages. */
export function towerLot(C, lot, r) {
  const D = lot.district;
  const t = towerHeight(lot.x, lot.z, r());
  const H = D.h[0] + (D.h[1] - D.h[0]) * Math.pow(t, 1.25);
  if (t < 0.22 && r() < 0.6 || lot.w < 40 || lot.d < 40) return midrise(C, lot, r);
  return tower(C, lot, r, { H: Math.max(90, H) });
}

// ---- Mid Beach: resorts ------------------------------------------------------------------------------------------
/** A curved resort tower facing the sea, its pool deck and cabanas; or a condo tower off the beach. */
export function resortLot(C, lot, r) {
  const ocean = lot.x0 > 2620;
  if (!ocean) {
    if (r() < 0.55) return tower(C, lot, r, { H: rr(r, 90, 260), type: 'resi', shape: pick(r, ['round', 'box', 'chamfer']) });
    return condoBlock(C, lot, r, { floors: ri(r, 5, 10) });
  }
  const K = C.K;
  // the resort's front is Collins (west); its back, the beach (east)
  K.begin(lot.x, C.GROUND, lot.z, lot.yaw, lot.seed, { kind: 'resort' });
  const hw = lot.w / 2 - 2, hd = lot.d / 2 - 1;
  const H = rr(r, 110, 330), fh = 10.5, g = 16;
  const wall = paint(pick(r, [0xf6f2ea, 0xf2e8dc, 0xeef2f0, 0xf8ece4]), 0.35, 0.15);
  // the crescent: an arc of tower bowed towards the sea
  const R = Math.max(hw * 1.15, 80), th = rr(r, 22, 30);
  const cz = -hd + rr(r, 30, 50) - R; // centre of the arc, behind the front
  const span = Math.min(1.25, (hw * 2) / R);
  const outer = [], inner = [];
  const n = 18;
  for (let i = 0; i <= n; i++) {
    const a = -span / 2 + (span * i) / n;
    outer.push([Math.sin(a) * R, cz + Math.cos(a) * R]);
    inner.push([Math.sin(a) * (R - th), cz + Math.cos(a) * (R - th)]);
  }
  // outline anticlockwise from above: outer arc left->right is... check: x from -..+ with z on the far (sea) side
  const pts = [...outer.slice().reverse(), ...inner];
  // make sure it winds anticlockwise (positive area in x, -z)
  let area = 0; for (let i = 0; i < pts.length; i++) { const p = pts[i], q = pts[(i + 1) % pts.length]; area += p[0] * (-q[1]) - q[0] * (-p[1]); }
  const poly = area > 0 ? pts : pts.reverse();
  K.facade({ kind: WIN.resi, fh, bw: rr(r, 9, 11), v0: g, gk: GF.lobby, occ: 0.5, variant: ri(r, 0, 15) });
  K.prism(poly, 0, H, wall, { smooth: 0.5, top: M.membrane });
  K.facade(null);
  // collision: boxes along the arc
  for (let i = 0; i < n; i += 3) {
    const a = -span / 2 + (span * (i + 1.5)) / n, mr = R - th / 2;
    K.push(Math.sin(a) * mr, 0, cz + Math.cos(a) * mr, a);
    K.solid(0, H / 2, 0, (R * span) / n * 1.6, H / 2, th / 2 - 1);
    K.pop();
  }
  // balconies along both faces: slab rings round the whole crescent
  slabRings(K, poly, g + fh, fh, Math.floor((H - g) / fh) - 1, 3.2, { rail: mat('stucco', 0xffffff, { p: 5 }) });
  // a crown: the name in lights
  const name = pick(r, ['THE FONTANA', 'EDEN ROC MAR', 'BELLE AIRE', 'SEA ISLE', 'THE SORRENTINO', 'DIPLOMAT BAY', 'GOLDEN SANDS', 'CASABLANCA']);
  K.sign(0, H - 5, cz + R + 0.6, Math.min(R * 0.9, name.length * 4.5), 7, name, 'neonDeco', { color: pick(r, [0xffe8c0, 0x60d8ff, 0xff70c0]), tier: MID });
  K.sign(0, H - 5, cz + R - th - 0.6, Math.min(R * 0.9, name.length * 4.5), 7, name, 'neonDeco', { color: 0xffe8c0, tier: MID, yaw: Math.PI });
  K.at(MID, () => K.prism(offsetPoly(poly, 0.3), H - 0.5, H + 0.5, neon(0xffd8a0, 0.7), { win: false, top: false, smooth: 0.5 }));
  // the lobby wing and porte-cochère towards Collins
  const lw = Math.min(hw * 0.7, 40);
  K.facade({ kind: WIN.punched, fh: 11, bw: 10, v0: g, gk: GF.lobby, occ: 0.6 });
  K.box(0, g / 2 + 5, hd - 18, lw, g / 2 + 5, 14, wall, { top: M.membrane });
  K.facade(null);
  canopy(K, 0, g - 1, hd - 4, 34, 12, paint(0xffffff, 0.2), { glow: 0xffe0b0, cols: true, t: 1.2 });
  // the pool deck between the tower and the beach
  const deckZ0 = cz - R + th - 6 > -hd ? -hd + 2 : -hd + 2;
  const dz0 = -hd + 2, dz1 = Math.min(cz + R - th - 10, -hd + 70);
  if (dz1 - dz0 > 20) {
    K.at(MID, () => K.box(0, 0.6, (dz0 + dz1) / 2, hw, 0.6, (dz1 - dz0) / 2, { top: M.tiles, side: M.white }, { col: false, win: false }));
    pool(K, rr(r, -hw * 0.3, hw * 0.3), (dz0 + dz1) / 2, Math.min(hw * 0.5, 30), Math.min((dz1 - dz0) / 2 - 6, 12), 1.2);
    cafe(K, r, -hw + 4, dz0 + 2, -hw * 0.45, dz1 - 2, 1.2, [0xffffff, 0x2bb5b0, 0xff7aa8]);
    cafe(K, r, hw * 0.45, dz0 + 2, hw - 4, dz1 - 2, 1.2, [0xffffff, 0xffd06a]);
    for (let k = 0; k < 6; k++) { const p = K.world(rr(r, -hw + 4, hw - 4), 0, rr(r, dz0 + 3, dz1 - 3)); C.palm(p[0], p[2], rr(r, 0.9, 1.3), rr(r, -0.15, 0.15)); }
    void deckZ0;
  }
  for (let x = -hw + 8; x < hw; x += 16) { const p = K.world(x, 0, hd + 3); C.ped(p[0], p[2]); }
  const pp = K.world(-lw - 10, 0, hd - 10); C.park(pp[0], pp[2], lot.yaw);
  K.end();
}

/** A slab of condos with balconies (5-14 floors) on a lot. */
export function condoBlock(C, lot, r, o = {}) {
  const K = C.K;
  K.begin(lot.x, C.GROUND, lot.z, lot.yaw, lot.seed, { kind: 'condo' });
  const hw = lot.w / 2 - 2, hd = Math.min(lot.d / 2 - 2, 26), fz = lot.d / 2 - rr(r, 4, 14);
  const floors = o.floors ?? ri(r, 5, 12), fh = 10.5, g = 13, H = g + (floors - 1) * fh;
  const wall = paint(pick(r, [0xf6f4ee, ...PASTEL.slice(0, 6), 0xece6d8]), 0.15, 0.25);
  const z0 = fz - hd * 2;
  K.facade({ kind: r() < 0.6 ? WIN.resi : WIN.punched, fh, bw: rr(r, 8, 11), v0: g, gk: GF.lobby, occ: 0.45, variant: ri(r, 0, 15) });
  const rad = r() < 0.4 ? Math.min(hd, 12) : 0;
  K.prism(roundRect(-hw, z0, hw, fz, [rad, rad, rad, rad], 5), 0, H, wall, { col: true, top: M.membrane, fit: rad ? undefined : 'wall' });
  K.facade(null);
  balconies(K, -hw + 3, hw - 3, fz, g, fh, floors - 1, { depth: rr(r, 3, 5), rail: r() < 0.5 ? M.glass : mat('stucco', 0xffffff, { p: 5 }) });
  K.push(0, 0, 0, Math.PI); balconies(K, -hw + 3, hw - 3, -z0, g, fh, floors - 1, { depth: 3 }); K.pop();
  K.at(MID, () => parapet(K, -hw + rad * 0.3, z0, hw - rad * 0.3, fz, H, 2, 0.5, wall, M.trim));
  roofKit(K, r, -hw + 3, z0 + 3, hw - 3, fz - 3, H, { tank: 0.2 });
  canopy(K, 0, g - 2, fz, 16, 6, M.white, { glow: 0xfff0d0 });
  if (lot.d / 2 - fz > 6) for (const s of [-1, 1]) { const p = K.world(s * hw * 0.6, 0, (fz + lot.d / 2) / 2); C.palm(p[0], p[2], rr(r, 0.8, 1.1), 0.08); }
  const p = K.world(0, 0, lot.d / 2 + 2); C.ped(p[0], p[2]);
  K.end();
}

/** A MiMo motel: two floors round a car park, open walkways, a tall angled sign. */
function mimoMotel(C, lot, r) {
  const K = C.K;
  K.begin(lot.x, C.GROUND, lot.z, lot.yaw, lot.seed, { kind: 'motel' });
  const hw = lot.w / 2 - 1, hd = lot.d / 2 - 1;
  const wall = paint(pick(r, [0xf4f0e6, 0xfff0d0, 0xe8f4f0, 0xf6e0e8]), 0.25, 0.3), acc = flat(pick(r, [0x2bb5b0, 0xf08a3c, 0xe8507a, 0x5a7ae0, 0xf2c14e]));
  const g = 11, fh = 10, H = g + fh;
  // an L of rooms along the back and one side
  const bz = -hd, dz = Math.min(26, hd);
  K.facade({ kind: WIN.punched, fh, bw: 9, v0: g, gk: GF.same, occ: 0.4, variant: 3 });
  K.box(0, H / 2, bz + dz / 2, hw, H / 2, dz / 2, wall, { top: M.membrane });
  K.box(-hw + 12, H / 2, (bz + dz + hd - 8) / 2, 12, H / 2, (hd - 8 - bz - dz) / 2, wall, { top: M.membrane, skip: 'nz' });
  K.facade(null);
  // walkway and its rail, the angled roof edge
  K.at(MID, () => {
    K.box(12, g, bz + dz + 3, hw - 12, 0.5, 3, M.slab, { col: false, win: false });
    K.box(12, g + 3.2, bz + dz + 5.8, hw - 12, 0.15, 0.15, acc, { col: false, win: false });
    for (let x = -hw + 26; x < hw; x += 6) K.box(x, g + 1.6, bz + dz + 5.8, 0.1, 1.6, 0.1, acc, { col: false, win: false });
    for (let x = -hw + 26; x < hw; x += 14) K.box(x, g / 2, bz + dz + 5.6, 0.4, g / 2, 0.4, acc, { col: false, win: false });
    K.quad([-hw, H + 0.5, bz + dz + 7], [hw, H + 0.5, bz + dz + 7], [hw, H + 3.5, bz], [-hw, H + 3.5, bz], acc, { both: true });
  });
  parkingLot(C, K, -hw + 26, bz + dz + 8, hw - 2, hd - 2, 0);
  // the sign: a tall angled pylon with the name, and a lit arrow
  const name = pick(r, ['Starlite Motel', 'Sea Breeze Motel', 'Blue Marlin', 'Driftwood Inn', 'Sun & Surf', 'Tropicaire', 'Coral Reef Motel', 'Palm Grove']);
  const px = hw - 6, pz = hd - 3;
  K.at(BASE, () => K.box(px, 14, pz, 1.2, 14, 1.2, M.steel, { col: true, win: false, yaw: 0.25 }));
  K.at(MID, () => { K.box(px, 22, pz, 8, 5, 0.7, acc, { col: false, win: false, yaw: 0.25 }); });
  const c = pick(r, NEON);
  K.sign(px - Math.sin(0.25) * 0.8, 22, pz + Math.cos(0.25) * 0.8, 15, 4.5, name, 'neon', { color: c, yaw: 0.25 });
  K.sign(px, 15, pz + 0.5, 11, 2.4, 'VACANCY', 'neonDeco', { color: 0xff3a3a, yaw: 0.25 });
  K.end();
}

/** North Beach: condos, motels and low shops. */
export function condoLot(C, lot, r) {
  const main = /Collins/.test(lot.street?.name || '');
  const ocean = lot.x0 > 2620;
  if (ocean) return r() < 0.5 ? tower(C, lot, r, { H: rr(r, 80, 170), type: 'resi', shape: pick(r, ['round', 'box']) }) : condoBlock(C, lot, r, { floors: ri(r, 6, 14) });
  if (main && r() < 0.4) return mimoMotel(C, lot, r);
  if (r() < 0.45) return condoBlock(C, lot, r, { floors: ri(r, 3, 8) });
  const K = C.K;
  // low shops
  K.begin(lot.x, C.GROUND, lot.z, lot.yaw, lot.seed, { kind: 'shops' });
  const hw = lot.w / 2 - 1, hd = Math.min(lot.d / 2 - 1, 22), fz = lot.d / 2 - 1, H = 15;
  const wall = paint(pick(r, PASTEL), 0.25, 0.3);
  K.facade({ kind: WIN.punched, fh: 11, bw: 10, v0: 13, gk: GF.shop, occ: 0.5 });
  K.box(0, H / 2, fz - hd, hw, H / 2, hd, wall, { top: M.membrane });
  K.facade(null);
  K.at(MID, () => parapet(K, -hw, fz - 2 * hd, hw, fz, H, 2.2, 0.5, wall, M.trim));
  for (let x = -hw + 10; x < hw - 6; x += 20) awning(K, x, 11, fz, 16, 5, 2, fabric(pick(r, [0x1d6e6a, 0xd8486a, 0x2a4e8a, 0xf2a03a])));
  K.sign(0, H - 1.5, fz + 0.12, Math.min(hw * 1.5, 20), 2.6, pick(r, ['Liquors', 'Laundromat', 'Deli', 'Bakery', 'Pizza', 'Farmacia', 'Dive Shop', 'Bait & Tackle']), pick(r, ['box', 'shop']), { tier: MID });
  const p = K.world(0, 0, lot.d / 2 + 2); C.ped(p[0], p[2]);
  K.end();
}
export { cafe, door, tube, flat, NEAR };
