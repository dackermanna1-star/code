// The district styles: how each district cuts its blocks into lots (lots(block, info, r) -> blockLots
// options) and what it builds on a lot (build(C, lot, r)), plus what goes in a block's leftover yard.
import { M, WIN, GF, MID, NEAR, paint, flat, pick, rr, ri, parapet, roofKit, parkingLot, PASTEL, STUCCO_WARM, CARIB } from './parts.js';
import { decoHotel, decoShops } from './deco.js';
import { towerLot, resortLot, condoLot } from './towers.js';
import { lowriseLot, havanaLot, warehouseLot, suburbLot, villaLot } from './lowrise.js';

/** A plain building: a box of floors with windows, a parapet and rooftop plant. */
export function simpleBuilding(C, lot, r, o = {}) {
  const K = C.K;
  K.begin(lot.x, C.GROUND, lot.z, lot.yaw, lot.seed, { kind: o.kind || 'simple' });
  const hw = lot.w / 2 - (o.side ?? 1), sb = o.setback ?? 0;
  const fz = lot.d / 2 - sb, bz = -lot.d / 2 + (o.back ?? 1);
  const fh = o.fh ?? 11, g = o.g ?? 12, floors = o.floors ?? 2;
  const H = g + (floors - 1) * fh + (o.extraH ?? 0);
  const wall = o.wall || paint(pick(r, PASTEL));
  K.facade({ kind: o.win ?? WIN.punched, fh, bw: o.bw ?? rr(r, 8, 11), v0: g, gk: o.gk ?? GF.same, occ: o.occ ?? 0.4, variant: ri(r, 0, 15) });
  K.box(0, H / 2, (fz + bz) / 2, hw, H / 2, (fz - bz) / 2, wall, { top: M.roof });
  K.facade(null);
  if (o.parapet !== false) K.at(MID, () => parapet(K, -hw, bz, hw, fz, H, 2, 0.5, wall, o.cap ?? M.trim));
  roofKit(K, r, -hw + 2, bz + 2, hw - 2, fz - 2, H, o.roof || {});
  K.end();
  return { H, hw, fz, bz };
}

// the oceanfront between Collins and the sand: deep lots facing Collins
const OCEANFRONT = { single: true, prefer: 'w', dmin: 50, dmax: 400, wmin: 80, wmax: 170, gmin: 10, gmax: 26 };

const deco = {
  lots: (b, info) => {
    const ocean = /Ocean Drive/.test(info.streets.e?.name || '');
    return { dmin: 30, dmax: ocean ? 90 : 64, wmin: ocean ? 40 : 34, wmax: ocean ? 64 : 58, gmin: 3, gmax: 9, prefer: ocean ? 'e' : null };
  },
  build: (C, lot, r) => {
    const sname = lot.street?.name || '';
    if (/Washington|Lincoln/.test(sname) && r() < 0.45) return decoShops(C, lot, r);
    return decoHotel(C, lot, r);
  },
  trim: true,
};

export const DISTRICT_STYLES = {
  deco,
  resort: { lots: (b) => (b.x0 > 2630 ? OCEANFRONT : { dmin: 50, dmax: 120, wmin: 70, wmax: 140, gmin: 8, gmax: 20 }), build: resortLot, trim: true },
  condo: { lots: (b) => (b.x0 > 2630 ? OCEANFRONT : { dmin: 40, dmax: 90, wmin: 44, wmax: 90, gmin: 6, gmax: 16 }), build: condoLot, trim: true },
  tower: { lots: (b) => ({ dmin: 50, dmax: 200, wmin: Math.min(70, (Math.max(b.x1 - b.x0, b.z1 - b.z0)) / 2 - 4), wmax: 150, gmin: 8, gmax: 16, single: true }), build: towerLot, trim: true },
  lowrise: { lots: () => ({ dmin: 26, dmax: 56, wmin: 22, wmax: 44, gmin: 2, gmax: 8 }), build: lowriseLot, trim: true },
  havana: { lots: () => ({ dmin: 28, dmax: 56, wmin: 20, wmax: 40, gmin: 0, gmax: 6 }), build: havanaLot, trim: true },
  warehouse: { lots: () => ({ dmin: 40, dmax: 90, wmin: 40, wmax: 90, gmin: 4, gmax: 14 }), build: warehouseLot, trim: true },
  suburb: {
    lots: (b, info, r) => {
      // strip malls along the avenues, houses everywhere else
      const ave = ['w', 'e', 'n', 's'].find((s) => ['ave', 'blvd'].includes(info.streets[s]?.cls));
      if (ave && r() < 0.4) return { dmin: 70, dmax: 130, wmin: 100, wmax: 170, gmin: 8, gmax: 16, single: true, prefer: ave, mall: true };
      return { dmin: 50, dmax: 90, wmin: 36, wmax: 52, gmin: 0, gmax: 0 };
    },
    build: suburbLot, trim: true,
  },
  villa: { lots: () => ({ dmin: 50, dmax: 100, wmin: 50, wmax: 80, gmin: 0, gmax: 0 }), build: villaLot, trim: true },
  port: null, airport: null, park: null, mansion: null,
};

/** What goes in a block's middle: parking, a courtyard garden, or a pool deck (by district). */
export function buildYard(C, y, D, r, style) {
  const K = C.K;
  const cx = (y.x0 + y.x1) / 2, cz = (y.z0 + y.z1) / 2, w = y.x1 - y.x0, d = y.z1 - y.z0;
  if (w < 24 || d < 24) return;
  const st = D.style;
  K.begin(cx, C.GROUND, cz, 0, Math.round(cx * 7 + cz * 3), { kind: 'yard' });
  if (st === 'suburb' || st === 'villa') {
    // back gardens: hedges and a few trees
    for (let i = 0; i < 3; i++) C.palm(cx + rr(r, -w / 3, w / 3), cz + rr(r, -d / 3, d / 3), rr(r, 0.7, 1.1), rr(r, -0.1, 0.1));
  } else if (st === 'deco' || st === 'resort' || st === 'condo') {
    if (r() < 0.5 && w > 40 && d > 30) {
      K.at(MID, () => K.box(0, 0.2, 0, w / 2 - 2, 0.2, d / 2 - 2, M.pavers, { col: false, win: false }));
      const pw = Math.min(w / 2 - 8, 24), pd = Math.min(d / 2 - 8, 12);
      if (pw > 6 && pd > 4) { K.at(MID, () => { K.box(0, 0.45, 0, pw + 1.4, 0.05, pd + 1.4, M.poolEdge, { col: false, win: false }); K.box(0, 0.52, 0, pw, 0.03, pd, M.pool, { col: false, win: false, skip: 'ny' }); }); }
      for (const s of [-1, 1]) C.palm(cx + s * (w / 2 - 5), cz + rr(r, -d / 3, d / 3), rr(r, 0.8, 1.2), rr(r, -0.12, 0.12));
    } else parkingLot(C, K, -w / 2 + 2, -d / 2 + 2, w / 2 - 2, d / 2 - 2, 0);
  } else if (st === 'tower' || st === 'warehouse' || st === 'lowrise' || st === 'havana') {
    parkingLot(C, K, -w / 2 + 2, -d / 2 + 2, w / 2 - 2, d / 2 - 2, 0);
  }
  K.end();
}
export { flat, STUCCO_WARM, CARIB, MID, NEAR };
