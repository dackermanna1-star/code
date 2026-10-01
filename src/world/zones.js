// Deterministic infinite zone partition. Each level of each dimension is tiled by 256m
// super-blocks that are BSP-split (8m granularity) into rectangular zones of varied size.
import { SB, UNIT, SB_UNITS, LEVEL_H } from '../config.js';
import { RNG, hash4, hash3, hc, fbm2, strHash } from '../core/rng.js';
import { ZT, GATE_ORDER } from './zonetypes.js';

function bsp(rng, out, x, z, w, d, maxU) {
  const canX = w >= 4, canZ = d >= 4;
  let stop = !canX && !canZ;
  if (!stop && w <= maxU && d <= maxU) {
    const a = w * d;
    const pStop = a <= 6 ? 1 : a <= 12 ? 0.6 : a <= 25 ? 0.38 : a <= 49 ? 0.22 : a <= 100 ? 0.12 : 0.06;
    stop = rng.chance(pStop);
  }
  if (stop) { out.push({ x, z, w, d }); return; }
  let alongX = w > d ? true : w < d ? false : rng.chance(0.5);
  if (alongX && !canX) alongX = false;
  if (!alongX && !canZ) alongX = true;
  if (alongX) {
    const s = rng.int(2, w - 2);
    bsp(rng, out, x, z, s, d, maxU); bsp(rng, out, x + s, z, w - s, d, maxU);
  } else {
    const s = rng.int(2, d - 2);
    bsp(rng, out, x, z, w, s, maxU); bsp(rng, out, x, z + s, w, d - s, maxU);
  }
}

function subtractRect(r, c) {
  // r, c: {x,z,w,d} in units; returns pieces of r not covered by c
  const ix0 = Math.max(r.x, c.x), iz0 = Math.max(r.z, c.z);
  const ix1 = Math.min(r.x + r.w, c.x + c.w), iz1 = Math.min(r.z + r.d, c.z + c.d);
  if (ix0 >= ix1 || iz0 >= iz1) return [r];
  const out = [];
  if (iz0 > r.z) out.push({ x: r.x, z: r.z, w: r.w, d: iz0 - r.z });
  if (iz1 < r.z + r.d) out.push({ x: r.x, z: iz1, w: r.w, d: r.z + r.d - iz1 });
  if (ix0 > r.x) out.push({ x: r.x, z: iz0, w: ix0 - r.x, d: iz1 - iz0 });
  if (ix1 < r.x + r.w) out.push({ x: ix1, z: iz0, w: r.x + r.w - ix1, d: iz1 - iz0 });
  return out;
}

export class ZoneMap {
  constructor(world) {
    this.world = world;
    this.seed = world.seed;
    this.parts = new Map();
    this.dimDefs = new Map(); // dim -> {partition(level, sbx, sbz, zm) => [{x,z,w,d,type,params?,variant?}] }
  }

  key(dim, level, sbx, sbz) { return dim + ':' + level + ':' + sbx + ':' + sbz; }

  partition(dim, level, sbx, sbz) {
    const k = this.key(dim, level, sbx, sbz);
    let p = this.parts.get(k);
    if (p) return p;
    p = this.buildPartition(dim, level, sbx, sbz);
    this.parts.set(k, p);
    if (this.parts.size > 400) {
      // drop oldest entries
      const it = this.parts.keys();
      for (let i = 0; i < 100; i++) this.parts.delete(it.next().value);
    }
    return p;
  }

  buildPartition(dim, level, sbx, sbz) {
    const def = this.dimDefs.get(dim) || (dim !== 0 ? this.world.dimDef(dim) : null);
    const ox = sbx * SB, oz = sbz * SB;
    let leaves;
    if (def && def.partition) {
      leaves = def.partition(level, sbx, sbz, this);
    } else {
      const rng = new RNG(hash4(dim, level, sbx, sbz, this.seed));
      const raw = [];
      bsp(rng, raw, 0, 0, SB_UNITS, SB_UNITS, rng.chance(0.3) ? 16 : 12);
      leaves = raw;
      // the four super-blocks meeting at the origin reserve a 48m corner each, so the
      // start of the game is a large, calm yellow region
      if (dim === 0 && level === 0 && (sbx === 0 || sbx === -1) && (sbz === 0 || sbz === -1)) {
        const S = 6;
        const rr = { x: sbx === 0 ? 0 : SB_UNITS - S, z: sbz === 0 ? 0 : SB_UNITS - S, w: S, d: S };
        const next = [];
        for (const r of leaves) next.push(...subtractRect(r, rr));
        next.push(rr);
        leaves = next;
      }
      // odd levels: carve out space claimed by tall zones of the level below
      if (level % 2 !== 0) {
        const below = this.partition(dim, level - 1, sbx, sbz);
        const claims = below.zones.filter((z) => z.spanUp > 0);
        for (const c of claims) {
          const cr = { x: (c.x0 - ox) / UNIT, z: (c.z0 - oz) / UNIT, w: (c.x1 - c.x0) / UNIT, d: (c.z1 - c.z0) / UNIT };
          let next = [];
          for (const r of leaves) next.push(...subtractRect(r, cr));
          leaves = next;
          leaves.push({ ...cr, claimedBy: c });
        }
      }
    }
    const zones = [];
    const grid = new Int16Array(SB_UNITS * SB_UNITS).fill(-1);
    for (const lf of leaves) {
      const zone = this.makeZone(dim, level, ox + lf.x * UNIT, oz + lf.z * UNIT, ox + (lf.x + lf.w) * UNIT, oz + (lf.z + lf.d) * UNIT, lf);
      const zi = zones.length;
      zones.push(zone);
      for (let uz = lf.z; uz < lf.z + lf.d; uz++) for (let ux = lf.x; ux < lf.x + lf.w; ux++) grid[uz * SB_UNITS + ux] = zi;
    }
    return { zones, grid };
  }

  makeZone(dim, level, x0, z0, x1, z1, lf) {
    const seed = hash4(dim * 7919 + level, x0, z0, hc(x1, z1), this.seed);
    const zone = { dim, level, x0, z0, x1, z1, seed, type: null, params: null, spanUp: 0, claimedBy: null, key: dim + '/' + level + '/' + x0 + '/' + z0 };
    if (lf.claimedBy) {
      zone.type = 'claimed';
      zone.claimedBy = lf.claimedBy;
      zone.params = lf.claimedBy.params;
      return zone;
    }
    const rng = new RNG(seed);
    const ctx = this.typeContext(dim, level, x0, z0, x1, z1);
    zone.ctx = ctx;
    let type = lf.type;
    // debug hook (?force=<type>): every zone that can hold the type becomes it, except the start area
    if (!type && this.forceType && ZT[this.forceType] && dim === 0 && !(level === 0 && ctx.flatDist < 95)) {
      const t = ZT[this.forceType];
      if (ctx.w >= t.minW && ctx.d >= t.minD && ctx.w <= t.maxW && ctx.d <= t.maxD && (!t.tall || level % 2 === 0)) type = this.forceType;
    }
    if (!type) type = this.pickType(ctx, rng);
    zone.type = type;
    const def = ZT[type];
    zone.spanUp = def.tall && level % 2 === 0 ? def.tall : 0;
    zone.params = Object.assign({ variant: lf.variant }, def.params(zone, rng.fork('params'), ctx));
    return zone;
  }

  typeContext(dim, level, x0, z0, x1, z1) {
    const cx = (x0 + x1) / 2, cz = (z0 + z1) / 2;
    const s = this.seed + level * 101 + dim * 7;
    const flat = Math.hypot(cx, cz);
    return {
      dim, level, cx, cz, w: x1 - x0, d: z1 - z0,
      dist: flat + Math.abs(level) * 140,
      flatDist: flat,
      office: fbm2(cx / 420, cz / 420, s + 11, 2),
      ind: fbm2(cx / 380, cz / 380, s + 23, 2),
      odd: fbm2(cx / 300, cz / 300, s + 37, 2),
      seed: this.seed,
    };
  }

  pickType(ctx, rng) {
    const pairs = [];
    for (const name in ZT) {
      const t = ZT[name];
      if (name === 'claimed') continue;
      if (ctx.w < t.minW || ctx.d < t.minD || ctx.w > t.maxW || ctx.d > t.maxD) continue;
      if (t.tall && ctx.level % 2 !== 0) continue;
      if (t.dims && !t.dims.includes(ctx.dim)) continue;
      if (!t.dims && ctx.dim !== 0) continue;
      const w = t.weight(ctx);
      if (w > 0) pairs.push([name, w]);
    }
    if (!pairs.length) return 'yellow';
    return rng.weighted(pairs);
  }

  zoneAt(dim, level, x, z) {
    const sbx = Math.floor(x / SB), sbz = Math.floor(z / SB);
    const p = this.partition(dim, level, sbx, sbz);
    const ux = Math.floor((x - sbx * SB) / UNIT), uz = Math.floor((z - sbz * SB) / UNIT);
    return p.zones[p.grid[uz * SB_UNITS + ux]];
  }

  // Border segments of a zone with gates, shared deterministically with neighbours.
  borders(zone) {
    if (zone.borders) return zone.borders;
    const segs = [];
    const sides = [
      ['W', zone.z0, zone.z1, (t) => [zone.x0 - 1, t]],
      ['E', zone.z0, zone.z1, (t) => [zone.x1, t]],
      ['N', zone.x0, zone.x1, (t) => [t, zone.z0 - 1]],
      ['S', zone.x0, zone.x1, (t) => [t, zone.z1]],
    ];
    for (const [side, a, b, out] of sides) {
      let t = a;
      while (t < b) {
        const [ox, oz] = out(t + UNIT / 2);
        const nb = this.zoneAt(zone.dim, zone.level, ox, oz);
        let e = t + UNIT;
        while (e < b) {
          const [px, pz] = out(e + UNIT / 2);
          if (this.zoneAt(zone.dim, zone.level, px, pz) !== nb) break;
          e += UNIT;
        }
        segs.push(this.segment(zone, nb, side, t, e));
        t = e;
      }
    }
    zone.borders = segs;
    return segs;
  }

  segment(zone, nb, side, a, b) {
    const ta = ZT[zone.type], tb = ZT[nb.type];
    let kind;
    const zc = zone.type === 'claimed', nc = nb.type === 'claimed';
    if (zc && nc) kind = 'open';
    else if (zc || nc) kind = 'seal';
    else if (ta.border === 'open' && tb.border === 'open') kind = 'open';
    else kind = 'wall';
    const seg = { side, a, b, nb, kind, gates: [] };
    if (kind !== 'wall') return seg;
    const line = side === 'W' ? zone.x0 : side === 'E' ? zone.x1 : side === 'N' ? zone.z0 : zone.z1;
    const axis = side === 'W' || side === 'E' ? 1 : 2;
    const rng = new RNG(hash4(zone.dim * 31 + zone.level, axis * 1000003 + line, a, b, this.seed));
    const ga = ta.gateFor ? ta.gateFor(zone, nb) : ta.gate;
    const gb = tb.gateFor ? tb.gateFor(nb, zone) : tb.gate;
    const style = GATE_ORDER[ga] <= GATE_ORDER[gb] ? ga : gb;
    const len = b - a;
    let count = 1 + Math.floor(len / 26) + (rng.chance(0.35) ? 1 : 0);
    count = Math.max(1, Math.min(count, Math.floor(len / 6)));
    const used = [];
    for (let k = 0; k < count * 4 && seg.gates.length < count; k++) {
      const w = style === 'door' ? 1 : style === 'open' ? rng.int(1, 2) : rng.int(2, 4);
      const pos = rng.int(a + 1, Math.max(a + 1, b - 1 - w));
      if (pos + w > b - 1) continue;
      if (used.some((u) => pos < u[1] + 2 && pos + w > u[0] - 2)) continue;
      used.push([pos, pos + w]);
      seg.gates.push({ at: pos, w, style });
    }
    return seg;
  }
}
