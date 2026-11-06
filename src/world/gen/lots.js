// Residential lot packing along streets.
import { OCC, RESIDENTIAL } from './plan.js';

/** Is the world rect free for a lot (no roads, sites, water, other lots)? */
export function rectFree(ctx, x0, z0, x1, z1) {
  const { SX, SZ, occ } = ctx;
  if (x0 < 34 || z0 < 34 || x1 >= SX - 34 || z1 >= SZ - 34) return false;
  for (let z = z0; z <= z1; z++) {
    const row = z * SX;
    for (let x = x0; x <= x1; x++) if (occ[row + x]) return false;
  }
  void SZ;
  return true;
}

export function fillOcc(ctx, x0, z0, x1, z1, v, flat = true) {
  const { SX } = ctx;
  for (let z = z0; z <= z1; z++) {
    for (let x = x0; x <= x1; x++) {
      const k = z * SX + x;
      ctx.occ[k] = v;
      if (flat) ctx.flat[k] = 1;
    }
  }
}

export function packLots(ctx) {
  const rng = ctx.rng.fork(101);
  const lots = [];
  for (const st of RESIDENTIAL) {
    const segs = ctx.roads.filter((r) => r.axis === st.axis && r.c === st.c && r.a1 >= st.a0 && r.a0 <= st.a1);
    if (!segs.length) continue;
    const e = Math.max(...segs.map((r) => r.hw + r.sw));
    for (const side of st.sides) {
      let a = st.a0;
      const p0 = st.c + side * (e + 3);
      while (a + 20 <= st.a1) {
        let W = rng.int(23, 31);
        if (a + W - 1 > st.a1) W = st.a1 - a + 1;
        if (W < 20) break;
        let placed = null;
        for (let D = rng.int(29, 34); D >= 22; D -= 2) {
          let r;
          if (st.axis === 'x') {
            r = side < 0 ? { x0: a, x1: a + W - 1, z0: p0 - D + 1, z1: p0 } : { x0: a, x1: a + W - 1, z0: p0, z1: p0 + D - 1 };
          } else {
            r = side < 0 ? { z0: a, z1: a + W - 1, x0: p0 - D + 1, x1: p0 } : { z0: a, z1: a + W - 1, x0: p0, x1: p0 + D - 1 };
          }
          if (rectFree(ctx, r.x0 - 1, r.z0 - 1, r.x1 + 1, r.z1 + 1)) { placed = r; break; }
        }
        if (placed) {
          // front facing toward the street
          const front = st.axis === 'x' ? (side < 0 ? 0 : 2) : (side < 0 ? 3 : 1);
          const lot = { ...placed, front, street: st.name, area: st.area, w: W, d: (st.axis === 'x' ? placed.z1 - placed.z0 : placed.x1 - placed.x0) + 1 };
          lots.push(lot);
          fillOcc(ctx, placed.x0, placed.z0, placed.x1, placed.z1, OCC.LOT);
          a += W + rng.int(0, 2);
        } else a += 2;
      }
    }
  }
  ctx.lots = lots;
  return lots;
}
