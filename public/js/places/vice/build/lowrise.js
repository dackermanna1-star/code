// The low city: Overtown and Little Haiti's painted concrete-block shops and apartments with metal
// shutters, hand-painted signs and chain-link; Little Havana's Spanish-colonial shops with arcades,
// terracotta and awnings along Calle Ocho, and its domino park; Wynwood's warehouses covered in
// murals, its galleries and rooftop bars; Hialeah's little houses with yards, carports and fences
// and the strip malls on its avenues; Coral Gables' Mediterranean villas with barrel-tile roofs,
// loggias, towers, hedges, pools and docks on the canals.
import { M, WIN, GF, MID, NEAR, BASE, paint, flat, neon, fabric, glassOf, metalOf, pick, rr, ri, parapet, roofKit, awning, canopy, cafe, pool, parkingLot, lowWall, fence, door, tube, CARIB, PASTEL, STUCCO_WARM, NEON, mat } from './parts.js';
import { MURALS } from './materials.js';

const HAITI = ['Botanica', 'Marché Kreyòl', 'Bonjou Market', 'Barbershop', 'Restaurant Lakay', 'Tropical Bakery', 'Money Transfer', 'Beauty Salon', 'Kreyòl Kitchen', 'Botanica St. Jak', 'Variety Store', 'Fish & Conch'];
const OVERTOWN = ['Soul Food', 'Barber Shop', 'Laundromat', 'Corner Store', 'Fish Market', 'Wings & Things', 'Check Cashing', 'Liquors', 'Tire Shop', 'Beauty Supply', 'Cell Phones', 'Records'];
const SPANISH = ['Café La Esquina', 'Farmacia', 'Botánica', 'Tabaquería', 'Panadería', 'Joyería', 'Mercado', 'Ferretería', 'Restaurante', 'Frutería', 'Peluquería', 'Cafetería Ocho', 'Librería', 'Ventanita', 'Dulcería', 'Zapatería', 'Floristería', 'Lavandería'];
const GALLERIES = ['GALLERY 21', 'ARTE VIVO', 'THE WAREHOUSE', 'COLOR LAB', 'STUDIO 305', 'NEON GALLERY', 'MURAL HOUSE', 'PRIMARY'];

// ---- Overtown and Little Haiti -------------------------------------------------------------------------------------
export function lowriseLot(C, lot, r) {
  const K = C.K;
  const haiti = lot.district.id === 'littlehaiti';
  const busy = ['ave', 'blvd'].includes(lot.street?.cls);
  const kind = busy ? (r() < 0.75 ? 'shop' : 'apt') : (r() < 0.45 ? 'house' : r() < 0.6 ? 'apt' : 'shop');
  K.begin(lot.x, C.GROUND, lot.z, lot.yaw, lot.seed, { kind: 'lowrise' });
  const colHex = pick(r, CARIB), trimHex = pick(r, [0xffffff, 0xfff4d8, 0x1d2a44, 0x2a2a2a, ...CARIB]);
  const wall = mat('blockWall', colHex, { p: 4, grime: 0.6 }), trim = paint(trimHex, 0, 0.4);
  const hw = lot.w / 2 - 0.8;
  if (kind === 'house') {
    const sb = rr(r, 10, 18), fz = lot.d / 2 - sb, dd = Math.min(lot.d - sb - 6, rr(r, 26, 36));
    const H = 11.5;
    K.facade({ kind: WIN.shutters, fh: 11, bw: rr(r, 9, 12), v0: 0, gk: GF.same, occ: 0.4, variant: ri(r, 0, 15) });
    K.box(0, H / 2, fz - dd / 2, hw - 2, H / 2, dd / 2, wall, { top: M.roof });
    K.facade(null);
    if (r() < 0.6) K.gableRoof(0, H, fz - dd / 2, hw - 2, dd / 2, rr(r, 4, 6), mat('metalSheet', pick(r, [0x9aa4ac, 0x6a2617, 0x2a6a8a, 0xc0c4c8]), { p: 9, r: 0.55, grime: 0.6 }), wall, { ov: 1.2 });
    else K.at(MID, () => parapet(K, -hw + 2, fz - dd, hw - 2, fz, H, 1.4, 0.5, wall, trim));
    door(K, rr(r, -hw * 0.4, hw * 0.4), 0.6, fz, 4.5, 7.6, mat('deck', pick(r, [0x7a4a2a, 0xf4f0e6, 0x2a4a6a])), trim);
    K.at(NEAR, () => K.box(0, 0.3, fz + 3, 5, 0.3, 3, M.concrete, { col: false, win: false }));
    fence(K, -hw, lot.d / 2 - 0.5, -2.5, lot.d / 2 - 0.5, 0, 5);
    fence(K, 2.5, lot.d / 2 - 0.5, hw, lot.d / 2 - 0.5, 0, 5);
    if (r() < 0.5) { const p = K.world(rr(r, -hw + 4, hw - 4), 0, lot.d / 2 - sb / 2); C.palm(p[0], p[2], rr(r, 0.6, 0.9), rr(r, -0.15, 0.15)); }
    K.end();
    return;
  }
  const floors = kind === 'apt' ? ri(r, 2, lot.district.h[1] > 40 ? 4 : 3) : ri(r, 1, 2);
  const g = 12, fh = 10.5, H = g + (floors - 1) * fh + (floors === 1 ? 3 : 0);
  const sb = kind === 'shop' ? rr(r, 0, 1.5) : rr(r, 3, 8);
  const fz = lot.d / 2 - sb, dd = Math.min(lot.d - sb - 2, rr(r, 26, 48));
  K.facade({ kind: kind === 'apt' ? (r() < 0.5 ? WIN.shutters : WIN.punched) : WIN.punched, fh, bw: rr(r, 8, 11), v0: g, gk: kind === 'shop' ? (r() < 0.55 ? GF.shutter : GF.shop) : GF.same, occ: 0.45, variant: ri(r, 0, 15) });
  K.box(0, H / 2, fz - dd / 2, hw, H / 2, dd / 2, wall, { top: M.roof });
  K.facade(null);
  K.at(MID, () => {
    parapet(K, -hw, fz - dd, hw, fz, H, rr(r, 1.2, 3), 0.5, wall, trim);
    // a painted band and a cornice
    K.box(0, g - 0.6, fz + 0.1, hw + 0.1, 0.6, 0.15, trim, { col: false, win: false });
  });
  if (kind === 'shop') {
    const name = pick(r, haiti ? HAITI : OVERTOWN);
    const bg = '#' + pick(r, CARIB.concat([0xffffff, 0x1d2a44])).toString(16).padStart(6, '0');
    K.sign(0, g + 1.6, fz + 0.12, Math.min(hw * 1.8, name.length * 1.7 + 4), 2.8, name, 'paint', { tier: MID, bg, fg: bg === '#ffffff' || bg === '#fee440' || bg === '#ffd23f' ? '#1d2a44' : '#ffffff' });
    if (r() < 0.5) awning(K, 0, g - 1.5, fz, Math.min(hw * 1.8, 20), 4, 1.6, fabric(pick(r, CARIB)));
    C.ped(...K.world(0, 0, lot.d / 2 + 2).filter((_, i) => i !== 1));
  } else {
    door(K, rr(r, -hw * 0.5, hw * 0.5), 0, fz, 4.6, 8, mat('deck', 0x5a3a24), trim);
    if (sb > 3) { fence(K, -hw, lot.d / 2 - 0.5, -3, lot.d / 2 - 0.5, 0, 5); fence(K, 3, lot.d / 2 - 0.5, hw, lot.d / 2 - 0.5, 0, 5); }
  }
  // a mural or a painted ad on a side wall
  if (r() < (haiti ? 0.25 : 0.18) && dd > 20) {
    const s = r() < 0.5 ? -1 : 1, w = Math.min(dd - 4, H * 2.2), h = Math.min(H - 2, w * 0.7);
    K.decal(s * (hw + 0.05), h / 2 + 1, fz - dd / 2, w, h, ri(r, 0, MURALS - 1), s * Math.PI / 2);
  }
  // window AC units
  K.at(NEAR, () => { for (let i = 1; i < floors; i++) if (r() < 0.6) K.box(rr(r, -hw + 4, hw - 4), g + (i - 1) * fh + 3, fz + 1, 1.3, 1, 1, M.ac, { col: false, win: false }); });
  roofKit(K, r, -hw + 2, fz - dd + 2, hw - 2, fz - 2, H, { tank: 0.1, hut: 0.3, extra: 1 });
  K.end();
}

// ---- Little Havana ---------------------------------------------------------------------------------------------------
let dominoDone = false;
export function havanaLot(C, lot, r) {
  const K = C.K;
  const ocho = /Calle Ocho/.test(lot.street?.name || '');
  const busy = ocho || ['ave', 'blvd'].includes(lot.street?.cls);
  // the domino park, once, on Calle Ocho
  if (ocho && !dominoDone && lot.x > -1700 && lot.x < -1100 && lot.w > 30) { dominoDone = true; return dominoPark(C, lot, r); }
  K.begin(lot.x, C.GROUND, lot.z, lot.yaw, lot.seed, { kind: 'havana' });
  const colHex = pick(r, [...STUCCO_WARM, ...CARIB.slice(0, 6), 0xf7b6c8, 0xffd3b0, 0xa8e6cf]);
  const wall = paint(colHex, busy ? 0.25 : 0.1, 0.45), trim = paint(pick(r, [0xffffff, 0xf4ead8, 0x7a1f1a, 0x1d4e3a]), 0, 0.3);
  const hw = lot.w / 2 - 0.4;
  const floors = busy ? ri(r, 1, 2) : (r() < 0.6 ? 1 : 2);
  const g = 12, fh = 10.5, H = g + (floors - 1) * fh + (floors === 1 ? 2 : 0);
  const arcade = busy && floors === 2 && r() < 0.65;
  const sb = busy ? 0 : rr(r, 6, 14);
  const fz = lot.d / 2 - sb, dd = Math.min(lot.d - sb - 2, rr(r, 26, 44));
  const ad = arcade ? 8 : 0;
  if (!busy) {
    // a house: one floor, a hipped tile roof, a porch
    K.facade({ kind: WIN.shutters, fh: 11, bw: rr(r, 9, 11), v0: 0, gk: GF.same, occ: 0.4, variant: ri(r, 0, 15) });
    K.box(0, H / 2, fz - dd / 2, hw - 1.5, H / 2, dd / 2, wall, { top: M.roof });
    K.facade(null);
    K.hipRoof(0, H, fz - dd / 2, hw - 1.5, dd / 2, rr(r, 4.5, 6.5), M.roofTiles, { ov: 1.6 });
    door(K, 0, 0.5, fz, 4.6, 7.8, mat('deck', 0x6a3a1a), trim);
    lowWall(K, -hw, lot.d / 2 - 0.5, -3, lot.d / 2 - 0.5, 0, 3, 0.8, trim);
    lowWall(K, 3, lot.d / 2 - 0.5, hw, lot.d / 2 - 0.5, 0, 3, 0.8, trim);
    if (r() < 0.5) { const p = K.world(rr(r, -hw + 4, hw - 4), 0, lot.d / 2 - sb / 2); C.palm(p[0], p[2], rr(r, 0.6, 0.95), rr(r, -0.15, 0.15)); }
    K.end();
    return;
  }
  // shops: the ground floor set back behind an arcade on two-floor buildings
  K.facade({ kind: WIN.shutters, fh, bw: rr(r, 8, 10), v0: g, gk: arcade ? GF.arcade : GF.shop, occ: 0.5, variant: ri(r, 0, 15) });
  if (arcade) {
    K.box(0, g / 2, fz - ad - (dd - ad) / 2, hw, g / 2, (dd - ad) / 2, wall, { top: M.roof });
    K.box(0, (g + H) / 2, fz - dd / 2, hw, (H - g) / 2, dd / 2, wall, { top: M.roof, bottom: true });
  } else K.box(0, H / 2, fz - dd / 2, hw, H / 2, dd / 2, wall, { top: M.roof });
  K.facade(null);
  K.at(MID, () => {
    if (arcade) {
      // columns and the arches' soffit
      const n = Math.max(2, Math.round((2 * hw) / 9));
      for (let i = 0; i <= n; i++) {
        const x = -hw + 0.8 + ((2 * hw - 1.6) * i) / n;
        K.box(x, g / 2, fz - 0.9, 0.8, g / 2, 0.8, trim, { col: true, win: false });
        K.box(x, g - 1.4, fz - 0.9, 1.3, 0.35, 1.1, trim, { col: false, win: false });
      }
      K.box(0, g - 0.6, fz - 0.3, hw, 0.6, 0.3, trim, { col: false, win: false });
    }
    // a pent roof of tiles along the front parapet, or a moulded cornice
    if (r() < 0.6) {
      const y = H + 0.3;
      K.quad([-hw - 0.3, y, fz + 2.4], [hw + 0.3, y, fz + 2.4], [hw + 0.3, y + 3.2, fz - 1.2], [-hw - 0.3, y + 3.2, fz - 1.2], M.roofTiles);
      K.box(0, y + 1.6, fz - 1.4, hw, 1.8, 0.3, wall, { col: false, win: false });
      parapet(K, -hw, fz - dd, hw, fz - 1.2, H, 1.6, 0.5, wall, trim);
    } else {
      parapet(K, -hw, fz - dd, hw, fz, H, 2.6, 0.5, wall, trim);
      K.box(0, H + 1.2, fz + 0.35, hw + 0.4, 0.5, 0.4, trim, { col: false, win: false });
      // a curvy Mission parapet in the middle
      K.lathe(0, H + 2.6, fz - 0.2, [[3.5, 0], [3.2, 1.8], [1.2, 3.4], [0.01, 3.7]], wall, { seg: 12 });
    }
    // iron balconies on the upper floor
    if (floors === 2 && r() < 0.6) for (let x = -hw + 6; x < hw - 4; x += rr(r, 9, 14)) {
      K.box(x, g + 2.6, fz + 1.2, 2.4, 0.2, 1.2, trim, { col: false, win: false });
      K.box(x, g + 4.2, fz + 2.3, 2.4, 1.4, 0.06, mat('metalSheet', 0x1a1a1a, { p: 9 }), { col: false, win: false, skip: 'ny py' });
    }
  });
  // signs and awnings
  const name = pick(r, SPANISH);
  K.sign(0, g + (arcade ? 1.5 : 1.6), fz + (arcade ? 0.7 : 0.12), Math.min(hw * 1.8, name.length * 1.6 + 5), 2.8, name, 'havana', { tier: MID });
  if (!arcade) awning(K, 0, g - 1.8, fz, Math.min(hw * 1.9, 24), 5, 2, fabric(pick(r, [0x1d6e4a, 0xc8322a, 0xe0a030, 0x1d4e89, 0xf4f0e6, 0x8a2a4a])));
  if (r() < 0.25) K.sign(hw - 2, g + 5, fz + 2, 6, 2, pick(r, ['ABIERTO', 'CAFÉ', 'CUBANO']), 'neon', { color: pick(r, [0xff3a3a, 0x3affd0, 0xffd23a]), tier: NEAR });
  // a little cafe window (ventanita) with stools
  if (ocho && r() < 0.35) K.at(NEAR, () => { for (let i = 0; i < 3; i++) K.cyl(-hw + 4 + i * 2.5, fz + 1.6, 0.6, 0, 2.6, M.metalDark, { seg: 6, win: false }); });
  C.ped(...K.world(0, 0, lot.d / 2 + 2).filter((_, i) => i !== 1));
  roofKit(K, r, -hw + 2, fz - dd + 2, hw - 2, fz - 4, H, { tank: 0.15, hut: 0.2 });
  K.end();
}

/** The domino park: a plaza under a pergola, tables and benches, a mural of the Americas' presidents (just colour here). */
function dominoPark(C, lot, r) {
  const K = C.K;
  K.begin(lot.x, C.GROUND, lot.z, lot.yaw, lot.seed, { kind: 'domino' });
  const hw = lot.w / 2 - 1, hd = lot.d / 2 - 1;
  K.at(MID, () => K.box(0, 0.25, 0, hw, 0.25, hd, M.herring, { col: false, win: false }));
  // the pergola: columns and a tiled roof
  const pw = Math.min(hw - 3, 22), pd = Math.min(hd - 4, 12);
  for (const x of [-pw, -pw / 3, pw / 3, pw]) for (const z of [-pd, pd]) K.box(x, 6, z, 0.7, 6, 0.7, M.trim, { col: true, win: false });
  K.hipRoof(0, 12, 0, pw + 1, pd + 1, 4, M.roofTiles, { ov: 1.5, soffit: M.wood });
  // tables
  K.at(NEAR, () => {
    for (let x = -pw + 4; x <= pw - 4; x += 7) for (const z of [-pd / 2, pd / 2]) {
      K.box(x, 2.6, z, 1.6, 0.15, 1.6, mat('marble', 0xfafafa), { col: false, win: false });
      K.box(x, 1.25, z, 0.3, 1.25, 0.3, M.metalDark, { col: false, win: false });
      for (const [a, b] of [[2.4, 0], [-2.4, 0], [0, 2.4], [0, -2.4]]) K.box(x + a, 1.4, z + b, 0.6, 0.1, 0.6, M.wood, { col: false, win: false });
    }
  });
  // a wall at the back with a mural, the sign over the gate
  K.box(0, 5, -hd + 0.5, hw, 5, 0.5, paint(0xf4ead8), { win: false });
  K.decal(0, 5, -hd + 1.05, Math.min(hw * 2 - 4, 40), 8, 6);
  K.sign(0, 13.5, pd + 1.6, 22, 2.4, 'Parque del Dominó', 'havana', { tier: MID });
  for (let i = 0; i < 6; i++) { const p = K.world(rr(r, -pw, pw), 0, rr(r, -pd, pd)); C.ped(p[0], p[2]); }
  for (const s of [-1, 1]) { const p = K.world(s * (hw - 3), 0, hd - 3); C.palm(p[0], p[2], 1, 0.05); }
  C.place('domino', { x: lot.x, z: lot.z, kind: 'park', name: 'Domino Park', door: { x: lot.x + Math.sin(lot.yaw) * lot.d / 2, z: lot.z + Math.cos(lot.yaw) * lot.d / 2, heading: lot.yaw + Math.PI } });
  K.end();
}

// ---- Wynwood -----------------------------------------------------------------------------------------------------------
export function warehouseLot(C, lot, r) {
  const K = C.K;
  K.begin(lot.x, C.GROUND, lot.z, lot.yaw, lot.seed, { kind: 'warehouse' });
  const hw = lot.w / 2 - 0.8, sb = rr(r, 0, 3), fz = lot.d / 2 - sb, dd = Math.min(lot.d - sb - 1, rr(r, 40, 80));
  const kind = r() < 0.15 ? 'gallery' : r() < 0.2 ? 'loft' : 'shed';
  const floors = kind === 'loft' ? ri(r, 3, 5) : ri(r, 1, 2);
  const g = 16, fh = 12, H = g + (floors - 1) * fh + (kind === 'shed' ? rr(r, 4, 10) : 0);
  const baseHex = pick(r, [0xf2f0ea, 0xd8d4cc, 0xbcb8b0, 0x8a8e94, 0x2a2c30, 0xe8e0d0]);
  const wall = kind === 'loft' ? mat('brick', pick(r, [0xffffff, 0xd8c8b8, 0xb8a090])) : mat(r() < 0.6 ? 'blockWall' : 'concrete', baseHex, { p: 4, grime: 0.5 });
  K.facade({ kind: kind === 'loft' ? WIN.punched : WIN.high, fh: kind === 'loft' ? fh : H - 2, bw: kind === 'loft' ? rr(r, 8, 10) : rr(r, 12, 18), v0: kind === 'loft' ? g : 0, gk: kind === 'gallery' ? GF.lobby : kind === 'loft' ? GF.shop : GF.garage, occ: 0.4, variant: ri(r, 0, 15) });
  K.box(0, H / 2, fz - dd / 2, hw, H / 2, dd / 2, wall, { top: M.roof });
  K.facade(null);
  // sawtooth roof on some sheds
  if (kind === 'shed' && r() < 0.35 && dd > 30) {
    K.at(MID, () => {
      const n = Math.floor(dd / 14);
      for (let i = 0; i < n; i++) {
        const z0 = fz - dd + i * (dd / n), z1 = z0 + dd / n;
        K.quad([-hw, H, z1], [hw, H, z1], [hw, H + 6, z0 + 0.5], [-hw, H + 6, z0 + 0.5], mat('metalSheet', 0xb0b4b8, { p: 9, grime: 0.5 }));
        K.quad([hw, H, z0], [-hw, H, z0], [-hw, H + 6, z0 + 0.5], [hw, H + 6, z0 + 0.5], glassOf(0x8aa0aa));
      }
    });
  } else K.at(MID, () => parapet(K, -hw, fz - dd, hw, fz, H, 1.8, 0.6, wall, null));
  // murals: the front, and the side walls that show
  const muralP = kind === 'gallery' ? 0.3 : 0.92;
  if (r() < muralP) K.decal(0, H / 2 + 0.5, fz + 0.02, Math.min(2 * hw - 2, 90), H - 1.5, ri(r, 0, MURALS - 1));
  for (const s of [-1, 1]) if (r() < 0.55) K.decal(s * (hw + 0.02), H / 2 + 0.5, fz - dd / 2, Math.min(dd - 2, 80), H - 1.5, ri(r, 0, MURALS - 1), s * Math.PI / 2);
  if (kind === 'gallery') K.sign(0, H - 3.5, fz + 0.12, Math.min(hw * 1.6, 26), 3.2, pick(r, GALLERIES), 'letters', { color: 0x1a1a1a, tier: MID });
  // a rooftop bar: deck, pergola and strings of lights
  if (r() < 0.22 && floors <= 2) {
    const x0 = -hw + 3, x1 = hw - 3, z0 = fz - Math.min(dd, 30) + 2, z1 = fz - 3;
    K.at(MID, () => {
      K.box((x0 + x1) / 2, H + 0.4, (z0 + z1) / 2, (x1 - x0) / 2, 0.4, (z1 - z0) / 2, M.deck, { col: false, win: false });
      for (const x of [x0 + 1, x1 - 1]) for (const z of [z0 + 1, z1 - 1]) K.box(x, H + 5, z, 0.3, 4.6, 0.3, M.wood, { col: false, win: false });
      for (let z = z0 + 1; z <= z1 - 1; z += 3) K.box((x0 + x1) / 2, H + 9.4, z, (x1 - x0) / 2 - 1, 0.2, 0.3, M.wood, { col: false, win: false });
    });
    for (let z = z0 + 2; z <= z1 - 2; z += 4) tube(K, [x0 + 1, H + 8.6, z], [x1 - 1, H + 8.6, z], 0xffd890, 0.08, NEAR);
    cafe(K, r, x0 + 2, z0 + 2, x1 - 2, z1 - 2, H + 0.8, [0xff3a8a, 0x2af0ff, 0xffd23a]);
    K.sign(0, H + 11, fz - 1, 12, 2.6, pick(r, ['ROOFTOP', 'SKY BAR', 'LA AZOTEA', 'HIGH TIDE']), 'neonDeco', { color: pick(r, NEON) });
  }
  roofKit(K, r, -hw + 3, fz - dd + 3, hw - 3, fz - 3, H, { tank: 0.3, hut: 0.2 });
  // the loading yard behind
  if (lot.d - dd - sb > 24) { const p = K.world(rr(r, -hw + 8, hw - 8), 0, fz - dd - 10); C.park(p[0], p[2], lot.yaw + Math.PI); }
  C.ped(...K.world(0, 0, lot.d / 2 + 2).filter((_, i) => i !== 1));
  K.end();
}

// ---- Hialeah ----------------------------------------------------------------------------------------------------------
export function suburbLot(C, lot, r) {
  if (lot.mall) return stripMall(C, lot, r);
  const K = C.K;
  K.begin(lot.x, C.GROUND, lot.z, lot.yaw, lot.seed, { kind: 'house' });
  const hw = lot.w / 2, sb = rr(r, 18, 28), fz = lot.d / 2 - sb;
  const dd = Math.min(lot.d - sb - 10, rr(r, 26, 34));
  const hx = hw - rr(r, 8, 12) / 2 - 4, cxh = -rr(r, 0, 5);
  const H = rr(r, 11, 12.5);
  const wall = paint(pick(r, [...STUCCO_WARM, ...PASTEL.slice(0, 8), 0xffffff]), 0, 0.35);
  K.facade({ kind: r() < 0.5 ? WIN.shutters : WIN.punched, fh: 11, bw: rr(r, 9, 12), v0: 0, gk: GF.same, occ: 0.45, variant: ri(r, 0, 15) });
  K.box(cxh, H / 2, fz - dd / 2, hx, H / 2, dd / 2, wall, { top: M.roof });
  K.facade(null);
  const tile = r() < 0.6;
  K.hipRoof(cxh, H, fz - dd / 2, hx, dd / 2, rr(r, 4, 6.5), tile ? pick(r, [M.roofTiles, M.roofTilesDark]) : mat('concrete', pick(r, [0x8a8e94, 0xa8a49c, 0x6a6e74]), { grime: 0.6 }), { ov: 1.6 });
  door(K, cxh + rr(r, -hx * 0.4, hx * 0.4), 0.4, fz, 4.4, 7.6, mat('deck', pick(r, [0xf4f0e6, 0x7a4a2a, 0x2a4a6a, 0x9a2a2a])), M.trim);
  // the carport and the driveway (a car spot)
  const cx = cxh + hx + 6;
  if (cx + 5 < hw) {
    K.at(MID, () => {
      K.box(cx, H - 1.5, fz - 10, 5.5, 0.35, 10, M.white, { col: false, win: false });
      for (const z of [fz - 19, fz - 1]) K.box(cx + 4.8, (H - 1.8) / 2, z, 0.3, (H - 1.8) / 2, 0.3, M.white, { col: false, win: false });
    });
    K.at(MID, () => K.quad([cx - 5, 0.12, lot.d / 2], [cx + 5, 0.12, lot.d / 2], [cx + 5, 0.12, fz - 20], [cx - 5, 0.12, fz - 20], M.concrete));
    const p = K.world(cx, 0, fz - 8); C.park(p[0], p[2], lot.yaw + (r() < 0.5 ? Math.PI : 0));
  }
  // front: a low wall or a fence, a path, a palm or two
  const ft = r();
  if (ft < 0.4) { lowWall(K, -hw + 0.5, lot.d / 2 - 0.5, cx - 6, lot.d / 2 - 0.5, 0, 3, 0.8, wall); }
  else if (ft < 0.7) fence(K, -hw + 0.5, lot.d / 2 - 0.5, cx - 6, lot.d / 2 - 0.5, 0, 4.5);
  K.at(NEAR, () => K.quad([cxh - 1.5, 0.1, lot.d / 2 - 0.5], [cxh + 1.5, 0.1, lot.d / 2 - 0.5], [cxh + 1.5, 0.1, fz], [cxh - 1.5, 0.1, fz], M.concrete));
  if (r() < 0.65) { const p = K.world(rr(r, -hw + 4, cxh - 4), 0, lot.d / 2 - rr(r, 4, sb - 4)); C.palm(p[0], p[2], rr(r, 0.65, 1), rr(r, -0.15, 0.15)); }
  if (r() < 0.5) { const p = K.world(-hw + 3, 0, fz + 2); C.bush(p[0], p[2], rr(r, 0.8, 1.3)); }
  K.end();
}

/** A strip mall on an avenue: a row of shops behind its car park. */
function stripMall(C, lot, r) {
  const K = C.K;
  K.begin(lot.x, C.GROUND, lot.z, lot.yaw, lot.seed, { kind: 'mall' });
  const hw = lot.w / 2 - 2, dd = Math.min(lot.d * 0.45, 40), bz = -lot.d / 2 + 2, fz = bz + dd, H = 17;
  const wall = paint(pick(r, [0xf4ead8, 0xece6da, 0xf6f0e4, 0xe8dcc8]), 0.25, 0.3), band = flat(pick(r, [0x1d4e89, 0xb8322a, 0x2a7a5a, 0xd88a2a]));
  K.facade({ kind: WIN.none, fh: 11, bw: 14, v0: 14, gk: GF.shop, occ: 0.6 });
  K.box(0, H / 2, (fz + bz) / 2, hw, H / 2, dd / 2, wall, { top: M.roof });
  K.facade(null);
  K.at(MID, () => {
    K.box(0, H - 1.6, fz + 0.3, hw + 0.4, 1.6, 0.6, band, { col: false, win: false });
    parapet(K, -hw, bz, hw, fz, H, 2, 0.5, wall, null);
  });
  canopy(K, 0, 13.4, fz, hw * 2, 6, wall, { cols: true });
  const shops = ['Supermercado', 'Farmacia', 'Pizza', 'Nails', 'Dollar Store', 'Laundry', 'Cafetería', 'Barber', 'Tax Service', 'Mattress', 'Pawn Shop', 'Insurance'];
  const n = Math.max(2, Math.round((2 * hw) / 26));
  for (let i = 0; i < n; i++) {
    const x = -hw + (2 * hw * (i + 0.5)) / n;
    K.sign(x, H - 1.6, fz + 0.95, Math.min((2 * hw) / n - 3, 18), 2.4, pick(r, shops), 'box', { tier: MID, bg: '#f6f1e4', fg: pick(r, ['#b3141c', '#1d4e89', '#2a7a5a', '#1a1a1a']) });
  }
  parkingLot(C, K, -hw, fz + 8, hw, lot.d / 2 - 2, 0);
  // the pylon sign by the road
  K.at(BASE, () => K.box(hw - 6, 12, lot.d / 2 - 4, 1, 12, 1, M.steel, { col: true, win: false }));
  K.sign(hw - 6, 22, lot.d / 2 - 3, 12, 6, pick(r, ['PLAZA PALMAS', 'HIALEAH CENTER', 'WESTLAND PLAZA', 'PALM SPRINGS MILE']), 'box', { tier: MID, bg: '#1d4e89', fg: '#ffffff', both: true });
  for (let x = -hw + 8; x < hw; x += 16) C.ped(...K.world(x, 0, fz + 4).filter((_, i) => i !== 1));
  K.end();
}

// ---- Coral Gables --------------------------------------------------------------------------------------------------------
export function villaLot(C, lot, r) {
  const K = C.K;
  K.begin(lot.x, C.GROUND, lot.z, lot.yaw, lot.seed, { kind: 'villa' });
  const hw = lot.w / 2, sb = rr(r, 14, 24), fz = lot.d / 2 - sb;
  const dd = Math.min(lot.d - sb - 12, rr(r, 30, 42));
  const wall = paint(pick(r, [0xf3e3c3, 0xf0d6b0, 0xe8c9a0, 0xf6e7d0, 0xf5dcc8, 0xe9d3a8, 0xf8efe0, 0xf2d8c4]), 0.1, 0.25);
  const roof = pick(r, [M.roofTiles, M.roofTilesDark, mat('roofTiles', 0xf0b090)]);
  const trim = M.trim;
  const two = r() < 0.75, g = 12, fh = 11, H = two ? g + fh : 13;
  const mw = hw - rr(r, 8, 14);
  K.facade({ kind: WIN.shutters, fh, bw: rr(r, 10, 13), v0: two ? g : 0, gk: two ? GF.same : GF.same, occ: 0.5, variant: ri(r, 0, 15) });
  // the main block, and a wing coming forward (an L)
  const mx = -rr(r, 0, 4);
  K.box(mx, H / 2, fz - dd / 2, mw, H / 2, dd / 2, wall, { top: M.roof });
  K.hipRoof(mx, H, fz - dd / 2, mw, dd / 2, rr(r, 5, 7), roof, { ov: 1.8 });
  const wingL = r() < 0.5 ? -1 : 1, ww = rr(r, 9, 13), wd = rr(r, 8, 14);
  const wx = mx + wingL * (mw - ww);
  K.box(wx, (H - 2) / 2, fz + wd / 2, ww, (H - 2) / 2, wd / 2, wall, { top: M.roof, skip: 'nz' });
  K.hipRoof(wx, H - 2, fz + wd / 2, ww, wd / 2, rr(r, 4, 5.5), roof, { ov: 1.6 });
  // a tower
  if (two && r() < 0.35) {
    const tx = mx - wingL * (mw - 6), th = H + rr(r, 8, 12);
    K.box(tx, th / 2, fz - 6, 6, th / 2, 6, wall, { top: M.roof });
    K.hipRoof(tx, th, fz - 6, 6, 6, 6, roof, { ov: 1.2 });
  }
  K.facade(null);
  // a loggia: arches (columns and a beam) in front of the main block
  const lx0 = wingL > 0 ? mx - mw + 2 : wx + ww + 1, lx1 = wingL > 0 ? wx - ww - 1 : mx + mw - 2;
  if (lx1 - lx0 > 10) K.at(MID, () => {
    const n = Math.max(2, Math.round((lx1 - lx0) / 7));
    for (let i = 0; i <= n; i++) K.box(lx0 + ((lx1 - lx0) * i) / n, 4.5, fz + 5, 0.6, 4.5, 0.6, trim, { col: true, win: false });
    K.box((lx0 + lx1) / 2, 9.6, fz + 5, (lx1 - lx0) / 2 + 0.6, 0.6, 0.8, trim, { col: false, win: false });
    K.box((lx0 + lx1) / 2, 10.4, fz + 2.6, (lx1 - lx0) / 2 + 0.6, 0.2, 2.8, roof, { col: false, win: false });
    for (let i = 0; i < n; i++) K.lathe((lx0 + (lx1 - lx0) * (i + 0.5) / n), 6.6, fz + 5, [[((lx1 - lx0) / n) / 2 - 0.6, 0], [((lx1 - lx0) / n) / 2 - 1.4, 1.8], [0.01, 2.6]], trim, { seg: 6 });
  });
  door(K, (lx0 + lx1) / 2, 0.4, fz, 5, 9, mat('deck', 0x5a3418), trim);
  // hedges along the front, a gate, a driveway
  const hx = hw - 0.6;
  K.at(NEAR, () => {
    K.box(-hx / 2 - 4, 2, lot.d / 2 - 1.5, hx / 2 - 4, 2, 1.2, M.hedge, { col: false, win: false });
    K.box(hx / 2 + 4, 2, lot.d / 2 - 1.5, hx / 2 - 4, 2, 1.2, M.hedge, { col: false, win: false });
  });
  K.solid(-hx / 2 - 4, 2, lot.d / 2 - 1.5, hx / 2 - 4, 2, 1.2, 'foliage');
  K.solid(hx / 2 + 4, 2, lot.d / 2 - 1.5, hx / 2 - 4, 2, 1.2, 'foliage');
  K.at(MID, () => K.quad([-4, 0.1, lot.d / 2], [4, 0.1, lot.d / 2], [4, 0.1, fz + 6], [-4, 0.1, fz + 6], M.pavers));
  const pp = K.world(0, 0, fz + 12); C.park(pp[0], pp[2], lot.yaw + Math.PI);
  // the back garden: a pool, palms; a dock on the canal
  const back = fz - dd, room = back + lot.d / 2;
  if (room > 18 && r() < 0.7) pool(K, rr(r, -hw * 0.3, hw * 0.3), back - room / 2, Math.min(hw * 0.4, 12), Math.min(room / 2 - 4, 6), 0);
  for (let k = 0; k < ri(r, 1, 3); k++) { const p = K.world(rr(r, -hw + 3, hw - 3), 0, rr(r, -lot.d / 2 + 3, fz - dd - 3)); C.palm(p[0], p[2], rr(r, 0.8, 1.25), rr(r, -0.12, 0.12)); }
  const bp = K.world(0, 0, -lot.d / 2 - 14);
  if (C.plan.canalAt(bp[0], bp[2], 0) && !C.plan.isLand(bp[0], bp[2])) {
    K.at(MID, () => {
      K.box(0, 2.6, -lot.d / 2 - 6, 6, 0.4, 6.5, M.deck, { col: true, win: false });
      for (const x of [-5.5, 5.5]) for (const z of [-lot.d / 2 - 1, -lot.d / 2 - 11.5]) K.box(x, 0, z, 0.5, 3, 0.5, M.wood, { col: false, win: false });
    });
    C.city.docks = C.city.docks || [];
    const dp = K.world(0, 0, -lot.d / 2 - 16); C.city.docks.push({ x: dp[0], z: dp[2], heading: lot.yaw + Math.PI / 2 });
  }
  K.end();
}

export { canopy, flat, neon, metalOf };
