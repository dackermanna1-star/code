// Zone generation pipeline: generator -> border walls & gates -> vertical features ->
// connectivity repair.
import { ZoneBuilder, W, CF, W_BLOCKS } from './zonebuilder.js';
import { ZT } from './zonetypes.js';
import { LEVEL_H } from '../config.js';
import { applyVerticalFeatures } from './vertical.js';
export { applyVerticalFeatures };

export function generateZone(world, zone) {
  const zb = new ZoneBuilder(zone);
  zb.world = world;
  if (zone.type === 'claimed') {
    zb.floor.fill(NaN); zb.ceil.fill(NaN);
    zb.flags.fill(CF.VOID);
  }
  const segs = zone.type === 'claimed' ? world.zones.borders(zone) : world.zones.borders(zone);
  zb.segs = segs;
  zb.gates = gateCells(zb, segs);
  if (zone.type !== 'claimed') {
    const def = ZT[zone.type];
    try {
      def.gen(zb, world);
    } catch (e) {
      // a broken generator must not take the world down: fall back to an empty room
      console.error('[gen] zone generator failed:', zone.type, zone.key, e);
      return fallbackZone(world, zone, segs);
    }
  }
  applyBorders(zb, segs);
  if (zone.type !== 'claimed') {
    try { applyVerticalFeatures(world, zb); } catch (e) { console.error('[gen] vertical features failed', zone.key, e); }
    if (!zb.noConnectivity) ensureConnectivity(zb);
  }
  return zb;
}

function fallbackZone(world, zone, segs) {
  const zb = new ZoneBuilder(zone);
  zb.world = world;
  zb.segs = segs;
  zb.gates = gateCells(zb, segs);
  applyBorders(zb, segs);
  return zb;
}

function gateCells(zb, segs) {
  const out = [];
  for (const s of segs) {
    if (s.kind !== 'wall') continue;
    for (const g of s.gates) {
      for (let t = g.at; t < g.at + g.w; t++) {
        let x, z, dx = 0, dz = 0;
        if (s.side === 'W') { x = zb.x0; z = t; dx = 1; }
        else if (s.side === 'E') { x = zb.x1 - 1; z = t; dx = -1; }
        else if (s.side === 'N') { x = t; z = zb.z0; dz = 1; }
        else { x = t; z = zb.z1 - 1; dz = -1; }
        out.push({ x, z, dx, dz, side: s.side, style: g.style, seg: s, first: t === g.at, w: g.w });
      }
    }
  }
  return out;
}

function applyBorders(zb, segs) {
  const tall = (zone) => zone.spanUp > 0 || zone.type === 'claimed';
  for (const s of segs) {
    if (s.kind === 'open') continue;
    if (s.side !== 'W' && s.side !== 'N') continue;
    const ours = zb.params.wallMat;
    const theirs = s.nb.params ? s.nb.params.wallMat : ours;
    const gateAt = new Map();
    for (const g of s.gates) for (let t = g.at; t < g.at + g.w; t++) gateAt.set(t, g);
    const anyTall = tall(zb.zone) || tall(s.nb);
    for (let t = s.a; t < s.b; t++) {
      const x = s.side === 'W' ? zb.x0 : t, z = s.side === 'W' ? t : zb.z0;
      let type = s.kind === 'seal' ? W.FULL : W.WALL;
      const g = gateAt.get(t);
      if (g) {
        if (g.style === 'door') type = W.DOOR;
        else if (g.style === 'open') type = anyTall ? W.BIGDOOR : W.NONE;
        else type = anyTall ? W.ARCH : (g.w >= 3 ? W.ARCH : W.NONE);
      }
      zb.setWall(x, z, s.side, type, theirs, ours);
    }
  }
  // keep gate cells clear on every side
  for (const g of zb.gates) {
    for (let k = 0; k < 2; k++) {
      const x = g.x + g.dx * k, z = g.z + g.dz * k;
      if (!zb.in(x, z)) continue;
      const i = zb.i(x, z);
      zb.solid[i] = 0;
      if (Number.isNaN(zb.floor[i])) zb.floor[i] = 0;
      if (Number.isNaN(zb.ceil[i]) || zb.ceil[i] - zb.floor[i] < 2.2) zb.ceil[i] = Math.max(zb.floor[i] + 2.4, zb.params.ceilH ?? 3);
      zb.flags[i] |= CF.GATE;
      zb.flags[i] &= ~CF.VOID;
      // gate cells must not be blocked by internal thin walls toward the inside
      if (k === 0) {
        if (g.dx === 1 && W_BLOCKS.has(zb.getWall(x + 1, z, 'W'))) zb.setWall(x + 1, z, 'W', W.DOOR);
        if (g.dx === -1 && W_BLOCKS.has(zb.getWall(x, z, 'W'))) zb.setWall(x, z, 'W', W.DOOR);
        if (g.dz === 1 && W_BLOCKS.has(zb.getWall(x, z + 1, 'N'))) zb.setWall(x, z + 1, 'N', W.DOOR);
        if (g.dz === -1 && W_BLOCKS.has(zb.getWall(x, z, 'N'))) zb.setWall(x, z, 'N', W.DOOR);
      }
    }
  }
  if (!zb.gates.length) return;
  // remove props sitting in gate cells
  const gset = new Set(zb.gates.map((g) => g.x + ',' + g.z));
  zb.props = zb.props.filter((p) => !gset.has(Math.floor(p.x) + ',' + Math.floor(p.z)));
}

const walkable = (zb, i) => !zb.solid[i] && !(zb.flags[i] & CF.VOID) && !Number.isNaN(zb.floor[i]);

export function ensureConnectivity(zb) {
  const { w, d } = zb;
  const n = w * d;
  const comp = new Int32Array(n).fill(-1);
  const sizes = [];
  const q = new Int32Array(n);
  const DIRS = [[1, 0], [-1, 0], [0, 1], [0, -1]];
  let nc = 0;
  for (let s = 0; s < n; s++) {
    if (comp[s] >= 0 || !walkable(zb, s)) continue;
    let qh = 0, qt = 0;
    q[qt++] = s; comp[s] = nc;
    let size = 0;
    while (qh < qt) {
      const c = q[qh++];
      size++;
      const x = zb.x0 + (c % w), z = zb.z0 + Math.floor(c / w);
      for (const [dx, dz] of DIRS) {
        if (!zb.passable(x, z, dx, dz)) continue;
        const ni = zb.i(x + dx, z + dz);
        if (comp[ni] >= 0) continue;
        comp[ni] = nc;
        q[qt++] = ni;
      }
    }
    sizes.push(size);
    nc++;
  }
  if (nc <= 1) return;
  // components touching open borders count as connected to the outside world
  const good = new Uint8Array(nc);
  for (const s of zb.segs) {
    if (s.kind !== 'open') continue;
    for (let t = s.a; t < s.b; t++) {
      let x, z;
      if (s.side === 'W') { x = zb.x0; z = t; } else if (s.side === 'E') { x = zb.x1 - 1; z = t; }
      else if (s.side === 'N') { x = t; z = zb.z0; } else { x = t; z = zb.z1 - 1; }
      const c = comp[zb.i(x, z)];
      if (c >= 0) good[c] = 1;
    }
  }
  let main = -1;
  if (zb.gates.length) main = comp[zb.i(zb.gates[0].x, zb.gates[0].z)];
  if (main < 0) {
    let best = -1;
    for (let c = 0; c < nc; c++) if (good[c] && sizes[c] > best) { best = sizes[c]; main = c; }
    if (main < 0) { for (let c = 0; c < nc; c++) if (sizes[c] > best) { best = sizes[c]; main = c; } }
  }
  if (main < 0) return;
  good[main] = 1;
  // merge all good components into the main label
  for (let i = 0; i < n; i++) if (comp[i] >= 0 && good[comp[i]]) comp[i] = main;
  const gateComp = new Set(zb.gates.map((g) => comp[zb.i(g.x, g.z)]));
  for (let c = 0; c < nc; c++) {
    if (c === main || good[c]) continue;
    if (sizes[c] < 3 && !gateComp.has(c)) continue;
    carvePath(zb, comp, c, main);
  }
}

// Dial's algorithm from component `from` to any cell of `to`, carving solids & walls on the way.
function carvePath(zb, comp, from, to) {
  const { w, d } = zb;
  const n = w * d;
  const dist = new Float32Array(n).fill(Infinity);
  const prev = new Int32Array(n).fill(-1);
  const buckets = [];
  const push = (i, dd) => { const k = Math.floor(dd); (buckets[k] || (buckets[k] = [])).push(i); };
  for (let i = 0; i < n; i++) if (comp[i] === from) { dist[i] = 0; push(i, 0); }
  let target = -1;
  for (let k = 0; k < buckets.length && target < 0; k++) {
    const b = buckets[k];
    if (!b) continue;
    for (let bi = 0; bi < b.length; bi++) {
      const c = b[bi];
      if (dist[c] < k) continue;
      if (comp[c] === to) { target = c; break; }
      const x = zb.x0 + (c % w), z = zb.z0 + Math.floor(c / w);
      for (const [dx, dz] of [[1, 0], [-1, 0], [0, 1], [0, -1]]) {
        const nx = x + dx, nz = z + dz;
        if (!zb.in(nx, nz)) continue;
        const ni = zb.i(nx, nz);
        if (zb.flags[ni] & (CF.VOID | CF.KEEP) && zb.solid[ni]) continue;
        if (zb.flags[ni] & CF.VOID) continue;
        const fa = zb.floor[c], fb = zb.floor[ni];
        if (!zb.solid[ni] && Number.isNaN(fb)) continue;
        if (!zb.solid[ni] && !Number.isNaN(fa) && Math.abs(fb - fa) > 1.4) continue;
        let cost = 1;
        if (zb.solid[ni]) cost += 4;
        let wt;
        if (dx === 1) wt = zb.wallW[ni]; else if (dx === -1) wt = zb.wallW[c]; else if (dz === 1) wt = zb.wallN[ni]; else wt = zb.wallN[c];
        if (W_BLOCKS.has(wt)) cost += 6;
        const nd = dist[c] + cost;
        if (nd < dist[ni]) { dist[ni] = nd; prev[ni] = c; push(ni, nd); }
      }
    }
  }
  if (target < 0) return;
  // walk back and carve
  let c = target;
  while (prev[c] >= 0) {
    const p = prev[c];
    const cx = zb.x0 + (c % w), cz = zb.z0 + Math.floor(c / w);
    const px = zb.x0 + (p % w), pz = zb.z0 + Math.floor(p / w);
    if (zb.solid[c]) {
      zb.solid[c] = 0;
      const f = Number.isNaN(zb.floor[p]) ? 0 : zb.floor[p];
      zb.floor[c] = f;
      if (Number.isNaN(zb.ceil[c]) || zb.ceil[c] - f < 2.2) zb.ceil[c] = f + (zb.params.ceilH ?? 3);
    }
    if (zb.solid[p]) zb.solid[p] = 0;
    const dx = cx - px, dz = cz - pz;
    let ex, ez, side;
    if (dx === 1) { ex = cx; ez = cz; side = 'W'; } else if (dx === -1) { ex = px; ez = pz; side = 'W'; }
    else if (dz === 1) { ex = cx; ez = cz; side = 'N'; } else { ex = px; ez = pz; side = 'N'; }
    const wt = zb.getWall(ex, ez, side);
    if (W_BLOCKS.has(wt)) {
      const i = zb.i(ex, ez);
      const keepMats = side === 'W' ? zb.wmW[i] : zb.wmN[i];
      const nt = wt === W.WALL || wt === W.FULL || wt === W.GLASS ? W.DOOR : W.NONE;
      zb.setWall(ex, ez, side, nt, keepMats & 255, keepMats >> 8);
    }
    comp[c] = to;
    c = p;
  }
  for (let i = 0; i < w * d; i++) if (comp[i] === from) comp[i] = to;
  void LEVEL_H;
}
