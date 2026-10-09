// South Beach: Art Deco hotels and apartments in pastel stucco with white trim - rounded corners
// with windows that wrap round them, eyebrow ledges over the windows, a central fin or pylon rising
// above a stepped parapet, racing stripes, porthole and glass-block details, front porches on
// Ocean Drive with café tables and umbrellas - and neon: the hotel's name in tubes, tubes along
// the parapet and up the fins, all glowing at night over walls washed in coloured light.
import { M, WIN, GF, MID, NEAR, BASE, paint, flat, neon, fabric, PASTEL, DECO_ACCENT, NEON, pick, rr, ri, parapet, roofKit, awning, canopy, tube, cafe, roundRect, lowWall, door, mat } from './parts.js';

export const HOTEL_NAMES = [
  'Flamingo Royale', 'Hotel Paloma', 'Coral Crest', 'The Starlite', 'Sunset Deco', 'Seabreeze', 'Moonglow', 'Aquamarine',
  'The Bellamy', 'Hotel Rivage', 'Neptune', 'Laguna', 'The Orchid', 'Hotel Esmeralda', 'Lido Star', 'Riviera Moon',
  'Casa Celeste', 'The Sandpiper', 'Starfish Inn', 'Hotel Amalfi', 'The Pelican Bay', 'Mirage', 'Hotel Solana', 'The Coralette',
  'Blue Lagoon', 'Hotel Vesper', 'Tropic Star', 'The Seville Deco', 'Marlin Bay', 'Hotel Capri', 'Ocean Pearl', 'The Gardenia',
];
const SHORT = ['HOTEL', 'PALOMA', 'CORAL', 'STARLITE', 'NEPTUNE', 'LAGUNA', 'ORCHID', 'MIRAGE', 'CAPRI', 'SOLANA', 'VESPER', 'LIDO', 'MARLIN', 'RIVAGE', 'AMALFI', 'CELESTE'];
const SHOPS = ['Pharmacy', 'Café Mambo', 'Surf Shop', 'Pizza', 'Liquors', 'Tattoo', 'Gelato', 'Sunglasses', 'Swimwear', 'Cuban Café', 'Bar & Grill', 'Souvenirs', 'Sushi', 'Burgers', 'Juice Bar', 'Cigars'];
const UMBRELLAS = [0xf4f0e6, 0xff7aa8, 0x2bb5b0, 0xffd06a, 0x6ac6ff, 0xf28a5a];

let nameIx = 0;
/** A deco hotel (or a deco apartment block, off the main streets) on a lot. o.name / o.safehouse for the landmark. */
export function decoHotel(C, lot, r, o = {}) {
  const K = C.K;
  const sname = lot.street?.name || '';
  const ocean = /Ocean Drive/.test(sname) || o.ocean;
  const main = ocean || /Collins|Washington/.test(sname) || o.main;
  K.begin(lot.x, C.GROUND, lot.z, lot.yaw, lot.seed, { kind: 'deco' });
  const W = lot.w, D = lot.d;
  const fh = 11, g = ocean ? 13 : 12;
  const floors = o.floors ?? (ocean ? ri(r, 3, 5) : main ? ri(r, 2, 5) : ri(r, 2, 3));
  const H = g + floors * fh;
  const wallHex = o.wall ?? pick(r, PASTEL), accHex = o.accent ?? pick(r, DECO_ACCENT);
  const n1 = o.neon ?? pick(r, NEON), n2 = pick(r, NEON);
  const lit = ocean ? 0.7 : main ? 0.45 : 0.25;
  const wall = paint(wallHex, lit, 0.15), acc = flat(accHex), trim = M.trim;
  const setback = o.setback ?? (ocean ? rr(r, 11, 16) : rr(r, 0, 2.5));
  const hw = W / 2 - 0.6, fz = D / 2 - setback, bz = -D / 2 + 1;
  const neonP = ocean ? 1 : main ? 0.65 : 0.25;
  const hasNeon = r() < neonP;
  const kind = o.win ?? (r() < 0.28 ? WIN.ribbon : r() < 0.12 ? WIN.porthole : WIN.punched);
  const spec = { kind, fh, bw: rr(r, 8.5, 10.5), v0: g, gk: ocean ? GF.lobby : main ? GF.shop : GF.same, occ: 0.55, variant: ri(r, 0, 15) };
  K.facade(spec);
  // ---- the mass: a rounded corner where there's a cross street ----
  const rad = (c) => (c ? rr(r, 7, Math.min(13, hw * 0.4)) : 0);
  const rl = rad(lot.cornerL), rrad = rad(lot.cornerR);
  const deep = fz - bz;
  const split = deep > 64 && r() < 0.8;
  const frontD = split ? rr(r, 38, Math.min(52, deep - 16)) : deep;
  const pts = roundRect(-hw, fz - frontD, hw, fz, [rl, rrad, 0, 0], 5);
  K.prism(pts, 0, H, wall, { fit: 'wall', col: true, top: M.membrane });
  if (split) {
    // the rear wing: a floor lower, a little narrower
    const rh = Math.max(g + fh, H - fh * ri(r, 1, 2)), inset = rr(r, 0, 4);
    K.box(0, rh / 2, (bz + fz - frontD) / 2, hw - inset, rh / 2, (fz - frontD - bz) / 2, wall, { skip: 'pz' });
    parapet(K, -hw + inset, bz, hw - inset, fz - frontD, rh, 2.2, 0.6, wall, trim);
    roofKit(K, r, -hw + inset + 2, bz + 2, hw - inset - 2, fz - frontD - 2, rh, { tank: 0.4 });
  }
  // the parapet round the front block (straight runs), a stepped centre on the front
  const pb = fz - frontD;
  K.facade(null);
  K.at(MID, () => {
    parapet(K, -hw + rl * 0.6, pb, hw - rrad * 0.6, fz, H, 2.4, 0.6, wall, trim);
    // racing stripes: two thin bands of the accent colour round the top
    for (const yy of [H - 2.6, H - 4.2]) {
      const sp = roundRect(-hw - 0.12, pb, hw + 0.12, fz + 0.12, [rl ? rl + 0.12 : 0, rrad ? rrad + 0.12 : 0, 0, 0], 5);
      K.prism(sp, yy - 0.35, yy + 0.35, acc, { win: false, top: false, closed: false });
    }
    // eyebrows over each floor's windows on the front (and round the corners)
    if (kind !== WIN.ribbon || r() < 0.5) {
      for (let i = 0; i < floors; i++) {
        const y = g + i * fh + fh * 0.84;
        K.box(0, y, fz + 1.1, hw - Math.max(rl, rrad) * 0.2 - 0.5, 0.22, 1.1, trim, { col: false, win: false });
      }
    }
    // corner pilasters
    if (!rl) K.box(-hw + 0.6, H / 2, fz + 0.3, 0.9, H / 2 + 0.6, 0.5, trim, { col: false, win: false });
    if (!rrad) K.box(hw - 0.6, H / 2, fz + 0.3, 0.9, H / 2 + 0.6, 0.5, trim, { col: false, win: false });
  });
  // ---- the centrepiece: a fin rising over a stepped parapet, or two pylons ----
  const centre = (lot.cornerL && !lot.cornerR) ? hw * 0.25 : (lot.cornerR && !lot.cornerL) ? -hw * 0.25 : 0;
  const style = o.crown ?? (W > 34 ? (r() < 0.55 ? 'fin' : r() < 0.6 ? 'ziggurat' : 'pylons') : 'ziggurat');
  const zw = Math.min(hw * 0.55, rr(r, 9, 16));
  let signY = H + 4, signW = Math.min(hw * 1.5, 34), signBack = fz;
  // the stepped parapet (every style has one)
  K.at(BASE, () => {
    K.box(centre, H + 3.5, fz - 1.2, zw, 3.5, 1.2, wall, { col: false, win: false });
    K.box(centre, H + 7.5, fz - 1.2, zw * 0.62, 0.5 + 1.0, 1.2, wall, { col: false, win: false });
  });
  K.at(MID, () => {
    K.box(centre, H + 7.05, fz - 1.2, zw + 0.25, 0.2, 1.4, trim, { col: false, win: false });
    K.box(centre, H + 9.2, fz - 1.2, zw * 0.62 + 0.25, 0.2, 1.4, trim, { col: false, win: false });
  });
  signY = H + 3.6; signW = zw * 1.8;
  if (style === 'fin') {
    const fw = rr(r, 2.2, 3.6), top = H + rr(r, 12, 24), fd = rr(r, 2.4, 4);
    K.at(BASE, () => K.box(centre, (g + top) / 2, fz + fd / 2 - 0.5, fw, (top - g) / 2, fd / 2 + 0.5, trim, { col: false, win: false }));
    K.at(MID, () => {
      // a stepped cap and a ball or spike
      K.box(centre, top + 1, fz + fd / 2 - 0.5, fw * 0.7, 1, fd / 2, acc, { col: false, win: false });
      if (r() < 0.5) K.lathe(centre, top + 2, fz + fd / 2 - 0.5, [[0.01, 0], [1.4, 1.2], [1.4, 1.6], [0.01, 2.8]], acc, { seg: 10 });
      else K.cyl(centre, fz + fd / 2 - 0.5, 0.25, top + 2, top + 8, M.steel, { seg: 6, win: false });
      // grooves down the fin
      for (const s of [-1, 1]) K.box(centre + s * fw * 0.55, (g + top) / 2, fz + fd, 0.18, (top - g) / 2, 0.12, acc, { col: false, win: false });
    });
    if (hasNeon) {
      for (const s of [-1, 1]) tube(K, [centre + s * (fw + 0.25), g + 1, fz + fd - 0.3], [centre + s * (fw + 0.25), top, fz + fd - 0.3], n1, 0.2);
      tube(K, [centre - fw, top + 0.2, fz + fd + 0.1], [centre + fw, top + 0.2, fz + fd + 0.1], n1, 0.2);
    }
    // the vertical name on the fin
    const vn = o.short || SHORT[(lot.seed >> 3) % SHORT.length];
    const vh = Math.min(top - g - 6, vn.length * 3.4);
    K.sign(centre, top - 3 - vh / 2, fz + fd + 0.05, fw * 1.5, vh, vn, hasNeon ? 'neonV' : 'lettersV', { color: hasNeon ? n2 : 0x2a3a4a });
  } else if (style === 'pylons') {
    for (const s of [-1, 1]) {
      const x = centre + s * zw * 0.9, top = H + rr(r, 6, 11);
      K.at(BASE, () => K.box(x, (g * 0.3 + top) / 2, fz + 0.9, 1.6, (top - g * 0.3) / 2, 1.4, trim, { col: false, win: false }));
      K.at(MID, () => {
        for (let k = 0; k < 3; k++) K.box(x, top + 0.4 + k * 0.9, fz + 0.9, 1.6 - k * 0.4, 0.4, 1.4 - k * 0.3, k % 2 ? trim : acc, { col: false, win: false });
      });
      if (hasNeon) tube(K, [x, g, fz + 2.45], [x, top, fz + 2.45], n2, 0.18);
    }
  } else {
    // glass block running up the middle
    K.at(MID, () => K.box(centre, (g + H) / 2, fz + 0.15, 2.6, (H - g) / 2, 0.3, trim, { col: false, win: K.spec({ kind: WIN.block, fh, bw: 5, v0: g, occ: 0.7 }) }));
  }
  // neon outline along the parapet top and down the corners, and the name across the top
  if (hasNeon) {
    tube(K, [-hw + rl, H + 2.75, fz + 0.15], [hw - rrad, H + 2.75, fz + 0.15], n1, 0.2);
    tube(K, [centre - zw, H + 7.35, fz + 0.15], [centre + zw, H + 7.35, fz + 0.15], n2, 0.2);
    if (!rl) tube(K, [-hw - 0.1, g, fz + 0.9], [-hw - 0.1, H + 2.6, fz + 0.9], n2, 0.16);
    if (!rrad) tube(K, [hw + 0.1, g, fz + 0.9], [hw + 0.1, H + 2.6, fz + 0.9], n2, 0.16);
  }
  const name = o.name || HOTEL_NAMES[(nameIx++ + lot.seed) % HOTEL_NAMES.length];
  if (main || hasNeon) K.sign(centre, signY, signBack + 0.08, Math.min(signW, name.length * 2.6), 4.6, name, hasNeon ? 'neon' : 'letters', { color: hasNeon ? n1 : 0x26323e, tier: MID });
  roofKit(K, r, -hw + 3, pb + 3, hw - 3, fz - 4, H, { tank: 0.3 });
  // ---- street level ----
  if (ocean) {
    // a raised porch with a low wall, tables and umbrellas
    const py = 1.1;
    K.at(BASE, () => K.box(0, py / 2, (fz + D / 2) / 2, hw, py / 2, (D / 2 - fz) / 2, { top: M.tiles, side: trim }, { win: false, col: true, extra: { noBlock: false } }));
    lowWall(K, -hw, D / 2 - 0.6, -4.5, D / 2 - 0.6, py, 2.2, 1.0, wall);
    lowWall(K, 4.5, D / 2 - 0.6, hw, D / 2 - 0.6, py, 2.2, 1.0, wall);
    K.at(NEAR, () => {
      for (const s of [-1, 1]) K.box(s * hw * 0.5, py + 2.3, D / 2 - 0.6, 3, 0.25, 0.7, M.hedge, { col: false, win: false });
      // steps
      K.box(0, py * 0.33, D / 2 + 0.3, 4.4, py * 0.33, 0.7, trim, { col: false, win: false });
    });
    cafe(K, r, -hw + 2, fz + 2, hw - 2, D / 2 - 2.5, py, UMBRELLAS);
    canopy(K, centre, g - 1, fz, Math.min(18, hw * 1.2), Math.min(7, D / 2 - fz - 1), trim, { glow: hasNeon ? n1 : 0xffd9a0, t: 0.5 });
    door(K, centre, py, fz, 7, 8.5, mat('whiteTiles', 0x2a3a44, { p: 8 }), trim);
    for (let x = -hw + 6; x < hw - 4; x += 12) C.ped(...K.world(x, 0, D / 2 - 4).filter((_, i) => i !== 1));
    if (r() < 0.6) { const p = K.world(-hw + 2, 0, D / 2 - 2); C.palm(p[0], p[2], rr(r, 0.8, 1.1), 0.05); }
  } else {
    // shopfronts under awnings, or an entrance with a canopy
    if (main) {
      const shops = Math.max(1, Math.round((2 * hw) / 22));
      for (let i = 0; i < shops; i++) {
        const x0 = -hw + (2 * hw * i) / shops + 1, x1 = -hw + (2 * hw * (i + 1)) / shops - 1;
        if (i === Math.floor(shops / 2) && shops > 1) { canopy(K, (x0 + x1) / 2, g - 1.2, fz, x1 - x0 - 2, 5, trim, { glow: 0xffe0b0 }); door(K, (x0 + x1) / 2, 0, fz, 6, 8.5, mat('whiteTiles', 0x2a3a44, { p: 8 }), trim); continue; }
        if (r() < 0.75) awning(K, (x0 + x1) / 2, g - 1.8, fz, x1 - x0 - 1.5, 5, 2, fabric(pick(r, [0x1d6e6a, 0xd8486a, 0x2a4e8a, 0xf2a03a, 0xf4f0e6, 0x6a3a8a])));
        K.sign((x0 + x1) / 2, g - 0.9, fz + 0.1, Math.min(x1 - x0 - 2, 16), 1.6, pick(r, SHOPS), r() < 0.5 ? 'box' : 'paint', { tier: NEAR, bg: '#' + pick(r, ['f4f0e6', '1d2a44', 'e8507a', '2bb5b0', 'ffe08a']).padStart(6, '0') });
      }
    } else {
      canopy(K, centre, g - 1.5, fz, 10, 4.5, trim);
      door(K, centre, 0, fz, 6, 8.5, mat('whiteTiles', 0x2a3a44, { p: 8 }), trim);
      // a front garden with a low wall where there's room
      if (setback > 1.5) lowWall(K, -hw, D / 2 - 0.5, hw, D / 2 - 0.5, 0, 1.8, 0.8, wall, { col: false });
    }
    C.ped(...K.world(centre, 0, D / 2 + 2).filter((_, i) => i !== 1));
  }
  // side windows get small awnings on the main streets, AC units on the walls everywhere
  K.at(NEAR, () => {
    for (let i = 0; i < floors; i++) for (const s of [-1, 1]) {
      if (r() < 0.45) continue;
      const z = fz - frontD + rr(r, 4, frontD - 4), y = g + i * fh + 2;
      K.box(s * (hw + 1.1), y, z, 1.1, 0.9, 1.5, M.ac, { col: false, win: false });
    }
  });
  K.end();
  return { H, fz, centre, name };
}

/** Deco shops: one or two floors of shops along a busy street (Washington Ave, Lincoln Road). */
export function decoShops(C, lot, r) {
  const K = C.K;
  K.begin(lot.x, C.GROUND, lot.z, lot.yaw, lot.seed, { kind: 'shops' });
  const hw = lot.w / 2 - 0.5, D = lot.d;
  const floors = ri(r, 1, 2), g = 13, H = floors === 1 ? 16 : 13 + 11;
  const wall = paint(pick(r, PASTEL), 0.3, 0.2), acc = flat(pick(r, DECO_ACCENT));
  K.facade({ kind: WIN.punched, fh: 11, bw: rr(r, 9, 12), v0: g, gk: GF.shop, occ: 0.4, variant: ri(r, 0, 15) });
  const fz = D / 2 - 0.5, bz = -D / 2 + 1 + rr(r, 0, Math.max(0, D - 50));
  K.box(0, H / 2, (fz + bz) / 2, hw, H / 2, (fz - bz) / 2, wall, { top: M.membrane });
  K.facade(null);
  K.at(MID, () => {
    parapet(K, -hw, bz, hw, fz, H, 2.6, 0.6, wall, M.trim);
    K.box(0, H - 1.2, fz + 0.15, hw + 0.15, 0.4, 0.2, acc, { col: false, win: false });
    // a stepped centre
    K.box(0, H + 4, fz - 0.6, Math.min(hw * 0.4, 8), 2, 0.6, wall, { col: false, win: false });
  });
  const n = Math.max(1, Math.round((2 * hw) / 20));
  for (let i = 0; i < n; i++) {
    const x0 = -hw + (2 * hw * i) / n + 0.8, x1 = -hw + (2 * hw * (i + 1)) / n - 0.8;
    if (r() < 0.8) awning(K, (x0 + x1) / 2, g - 1.8, fz, x1 - x0 - 1, 5.5, 2.2, fabric(pick(r, [0x1d6e6a, 0xd8486a, 0x2a4e8a, 0xf2a03a, 0xf4f0e6, 0x6a3a8a, 0x1a1a1a])));
    K.sign((x0 + x1) / 2, g - 0.6, fz + 0.15, Math.min(x1 - x0 - 2, 15), 1.8, pick(r, SHOPS), pick(r, ['box', 'shop', 'paint']), { tier: NEAR });
  }
  if (r() < 0.5) K.sign(0, H + 4, fz + 0.05, Math.min(hw * 0.75, 14), 2.6, pick(r, SHOPS).toUpperCase(), 'neonDeco', { color: pick(r, NEON) });
  roofKit(K, r, -hw + 2, bz + 2, hw - 2, fz - 2, H, { tank: 0.1, hut: 0.2 });
  for (let x = -hw + 5; x < hw; x += 14) { const p = K.world(x, 0, D / 2 + 2); C.ped(p[0], p[2]); }
  K.end();
}
