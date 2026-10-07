// Where every building goes. First the streets: a grid of streets through
// the city and the towns (turned to line up with the main road), a couple of
// lanes off the road in each village, the roads inside the military base and
// the airfield. Then the lots: walking along every street and road through a
// place, both sides, a building of the right sort for that part of town is
// fitted in wherever there's room - not on a road, not in the water, not on
// a slope too steep to level - with its front to the street. The bases, the
// airfield, the port, the farms and the camps are laid out to their own plans.
//
// Plain data, like the terrain: sites are { tpl, x, z, yaw, w, d, ... } and are
// built later by the building kit.
import { PLACES, POIS, ROADS, RIVER, LAKE } from './layout.js';
import { rng, hashStr, clamp } from '../noise.js';
import { TEMPLATES } from '../build/index.js';

const TAU = Math.PI * 2;

/** The direction of the main road through a place (or a made-up one). */
function placeAxis(p) {
  let best = null, bd = 1e9;
  for (const def of ROADS) for (let i = 0; i < def.pts.length - 1; i++) {
    const a = def.pts[i], b = def.pts[i + 1];
    const d = segDist(p.x, p.z, a[0], a[1], b[0], b[1]);
    if (d < bd) { bd = d; best = Math.atan2(b[1] - a[1], b[0] - a[0]); }
  }
  return bd < (p.r || 100) ? best : (hashStr(p.id) % 628) / 100;
}
function segDist(px, pz, ax, az, bx, bz) {
  const dx = bx - ax, dz = bz - az, L2 = dx * dx + dz * dz || 1;
  const t = clamp(((px - ax) * dx + (pz - az) * dz) / L2);
  return Math.hypot(ax + dx * t - px, az + dz * t - pz);
}

/** Is this a good spot for a street? (before the roads are laid) */
function streetOK(T, p, x, z, R) {
  if (Math.hypot(x - p.x, z - p.z) > R) return false;
  if (!T.inside(x, z, 120)) return false;
  if (T.sample(T.coast, x, z) < (p.kind === 'city' ? 70 : 50)) return false;
  if (T.sample(T.riverD, x, z) < RIVER.w + 14) return false;
  if (Math.hypot((x - LAKE.x) / LAKE.rx, (z - LAKE.z) / LAKE.rz) < 1.3) return false;
  if (Math.abs(T.heightAt(x, z) - (p.level ?? T.heightAt(p.x, p.z))) > 16) return false;
  return true;
}

/** The longest stretches of a straight line (centre c, direction u, from -L to L) that pass streetOK. */
function runs(T, p, cx, cz, ux, uz, L, R, minLen = 70) {
  const out = [];
  let start = null, last = null;
  for (let t = -L; t <= L + 0.01; t += 8) {
    const x = cx + ux * t, z = cz + uz * t;
    if (streetOK(T, p, x, z, R)) { if (start === null) start = t; last = t; }
    else if (start !== null) { if (last - start >= minLen) out.push([start, last]); start = null; }
  }
  if (start !== null && last - start >= minLen) out.push([start, last]);
  return out;
}

/** The streets of every place (added to the roads before they're laid). */
export function planStreets(T) {
  const out = [];
  for (const p of PLACES) {
    const r = rng(hashStr(p.id) + 5);
    const th = placeAxis(p);
    p.axis = th;
    const ux = Math.cos(th), uz = Math.sin(th), vx = -uz, vz = ux;
    if (p.kind === 'city' || p.kind === 'town') {
      const S = p.kind === 'city' ? 104 : 96, n = p.kind === 'city' ? 4 : 2, R = p.r * (p.kind === 'city' ? 0.95 : 0.9);
      const lines = [];
      // the long streets (along the main road), whole
      for (let k = -n; k <= n; k++) {
        if (k === 0) continue; // the main road itself
        const cx = p.x + vx * k * S, cz = p.z + vz * k * S;
        for (const [a, b] of runs(T, p, cx, cz, ux, uz, R, R)) lines.push({ along: true, k, a, b, cx, cz });
      }
      // the cross streets, cut where they meet the long ones and the main road
      for (let k = -n; k <= n; k++) {
        const cx = p.x + ux * (k * S + S * 0.5 * (p.kind === 'town' ? 1 : 0)), cz = p.z + uz * (k * S + S * 0.5 * (p.kind === 'town' ? 1 : 0));
        for (const [a, b] of runs(T, p, cx, cz, vx, vz, R, R, 50)) {
          // cut at each long street (and the main road at offset 0), leaving a gap for the crossing
          const cuts = [0, ...lines.filter((q) => q.along).map((q) => q.k * S)].filter((c) => c > a && c < b).sort((x, y) => x - y);
          let s0 = a;
          for (const c of cuts) { if (c - 10 - s0 > 30) lines.push({ along: false, k, a: s0, b: c - 10, cx, cz }); s0 = c + 10; }
          if (b - s0 > 30) lines.push({ along: false, k, a: s0, b, cx, cz });
        }
      }
      for (const q of lines) {
        const dx = q.along ? ux : vx, dz = q.along ? uz : vz;
        const a = [q.cx + dx * q.a, q.cz + dz * q.a], b = [q.cx + dx * q.b, q.cz + dz * q.b];
        out.push({ type: 'street', place: p.id, pts: [a, [(a[0] + b[0]) / 2, (a[1] + b[1]) / 2], b] });
      }
      // the city's quay road along the bay
      if (p.kind === 'city') {
        const pts = [];
        for (let x = p.x - p.r * 0.75; x <= p.x + p.r * 0.75; x += 60) {
          // find the shore going south from the city, stay ~70 inland
          let z = p.z;
          for (; z < p.z + p.r * 1.2; z += 8) if (T.sample(T.coast, x, z) < 75) break;
          if (z < p.z + p.r * 1.15) pts.push([x, z - 10]);
        }
        if (pts.length > 3) { out.push({ type: 'street', place: p.id, quay: true, pts }); p.quay = pts; }
      }
    } else if (p.kind === 'village') {
      // a lane each side of the road, off at right angles, and maybe one along behind
      for (const s of [-1, 1]) {
        if (r() < 0.2) continue;
        const off = (r() - 0.5) * p.r * 0.6, len = 80 + r() * 70;
        const x0 = p.x + ux * off + vx * s * 14, z0 = p.z + uz * off + vz * s * 14;
        const bend = (r() - 0.5) * 30;
        const pts = [[x0, z0], [x0 + vx * s * len * 0.5 + ux * bend, z0 + vz * s * len * 0.5 + uz * bend], [x0 + vx * s * len + ux * bend * 1.6, z0 + vz * s * len + uz * bend * 1.6]];
        if (pts.every(([x, z]) => streetOK(T, p, x, z, p.r * 1.3))) out.push({ type: 'lane', place: p.id, pts });
      }
    } else if (p.kind === 'military') {
      // a square of concrete roads inside the fence
      const R = p.r * 0.55;
      const c = (a, b) => [p.x + ux * a + vx * b, p.z + uz * a + vz * b];
      out.push({ type: 'base', place: p.id, pts: [c(-R, -R), c(0, -R), c(R, -R)] });
      out.push({ type: 'base', place: p.id, pts: [c(-R, R), c(0, R), c(R, R)] });
      out.push({ type: 'base', place: p.id, pts: [c(-R, -R + 12), c(-R, 0), c(-R, R - 12)] });
      out.push({ type: 'base', place: p.id, pts: [c(R, -R + 12), c(R, 0), c(R, R - 12)] });
      out.push({ type: 'base', place: p.id, pts: [c(-R + 12, 0), c(0, 0), c(R - 12, 0)] });
    }
  }
  return out;
}

// --- lots -----------------------------------------------------------------------------------------------------------------------
class Lots {
  constructor() { this.grid = new Map(); this.all = []; }
  _keys(b) { const r = Math.hypot(b.hx, b.hz); const out = []; for (let i = Math.floor((b.x - r) / 64); i <= Math.floor((b.x + r) / 64); i++) for (let j = Math.floor((b.z - r) / 64); j <= Math.floor((b.z + r) / 64); j++) out.push(i * 10007 + j); return out; }
  add(b) { this.all.push(b); for (const k of this._keys(b)) { let l = this.grid.get(k); if (!l) this.grid.set(k, (l = [])); l.push(b); } }
  hits(b, margin = 2) {
    const seen = new Set();
    for (const k of this._keys({ ...b, hx: b.hx + margin, hz: b.hz + margin })) for (const o of this.grid.get(k) || []) { if (seen.has(o)) continue; seen.add(o); if (obbOverlap(b, o, margin)) return true; }
    return false;
  }
}
function obbOverlap(a, b, m) {
  const axes = [[Math.cos(a.yaw), -Math.sin(a.yaw)], [Math.sin(a.yaw), Math.cos(a.yaw)], [Math.cos(b.yaw), -Math.sin(b.yaw)], [Math.sin(b.yaw), Math.cos(b.yaw)]];
  const dx = b.x - a.x, dz = b.z - a.z;
  for (const [ax, az] of axes) {
    const ra = Math.abs((a.hx + m) * (Math.cos(a.yaw) * ax - Math.sin(a.yaw) * az)) + Math.abs((a.hz + m) * (Math.sin(a.yaw) * ax + Math.cos(a.yaw) * az));
    const rb = Math.abs(b.hx * (Math.cos(b.yaw) * ax - Math.sin(b.yaw) * az)) + Math.abs(b.hz * (Math.sin(b.yaw) * ax + Math.cos(b.yaw) * az));
    if (Math.abs(dx * ax + dz * az) > ra + rb) return false;
  }
  return true;
}

/** Can a lot (centre, half sizes, turn) go here? Returns the ground's range under it, or null. */
export const STATS = {};
const no = (why) => { STATS[why] = (STATS[why] || 0) + 1; return null; };
function lotOK(T, x, z, hx, hz, yaw, o = {}) {
  const c = Math.cos(yaw), s = Math.sin(yaw);
  const nx = Math.max(1, Math.ceil(hx / 5)), nz = Math.max(1, Math.ceil(hz / 5));
  let lo = Infinity, hi = -Infinity, sum = 0, n = 0;
  for (let i = -nx; i <= nx; i++) for (let j = -nz; j <= nz; j++) {
    const lx = (i / nx) * hx, lz = (j / nz) * hz;
    const px = x + lx * c + lz * s, pz = z - lx * s + lz * c;
    if (!T.inside(px, pz, 80)) return no('edge');
    // (the front edge faces its own road: the road map is coarse, so allow a little there)
    if (T.sample(T.roadW, px, pz) > (j === nz && !o.strict ? 0.45 : (o.road ?? 0.03))) return no('road');
    if (T.sample(T.coast, px, pz) < (o.coast ?? 30)) return no('coast');
    if (T.sample(T.riverD, px, pz) < RIVER.w * 0.75 + 8) return no('river');
    const h = T.heightAt(px, pz);
    if (T.waterAt(px, pz) > h - 1.5) return no('water');
    if (Math.hypot((px - LAKE.x) / LAKE.rx, (pz - LAKE.z) / LAKE.rz) < 1.15) return no('lake');
    lo = Math.min(lo, h); hi = Math.max(hi, h); sum += h; n++;
  }
  if (hi - lo > (o.drop ?? 11)) return no('drop');
  return { lo, hi, avg: sum / n };
}

/** What gets built where in each kind of place. */
const MIX = {
  village: { inner: [['house1', 5], ['house2', 2], ['cottage', 3]], outer: [['house1', 4], ['cottage', 3], ['barn', 1.5], ['shed', 1]], special: [['shop', 0.6], ['church', 0.4], ['bar', 0.3]] },
  town: {
    inner: [['shop', 3], ['apartment3', 3], ['house2', 2], ['office', 1], ['bar', 1], ['pharmacy', 0.8]],
    mid: [['house2', 4], ['apartment3', 2], ['house1', 2], ['garages', 1], ['shop', 1]],
    outer: [['house1', 4], ['house2', 2], ['cottage', 2], ['garages', 1], ['shed', 1], ['warehouse', 0.6], ['barn', 0.5]],
    special: [['police', 1], ['clinic', 1], ['church', 1], ['school', 1], ['fireStation', 0.6], ['gas', 0]],
  },
  city: {
    inner: [['shop', 3], ['apartment5', 4], ['office', 2], ['bar', 1], ['pharmacy', 1], ['supermarket', 0.6]],
    mid: [['apartment5', 4], ['apartment3', 2], ['shop', 2], ['house2', 1.5], ['garages', 1]],
    outer: [['house2', 3], ['house1', 2], ['garages', 2], ['warehouse', 1.5], ['factory', 0.6], ['apartment3', 1]],
    special: [['police', 1], ['hospital', 1], ['church', 1], ['school', 1], ['fireStation', 1], ['supermarket', 1], ['office', 1]],
  },
};
function weighted(r, list) { let t = 0; for (const [, w] of list) t += w; let x = r() * t; for (const [id, w] of list) { x -= w; if (x <= 0) return id; } return list[0][0]; }

/** Every building and prop site on the map. Call after the terrain (with its streets) is generated. */
export function planSites(T) {
  const lots = new Lots();
  const sites = [], props = [];
  // the roads first: nothing may be built on them (their stretch through each place is a frontage)
  for (const p of PLACES) {
    const r = rng(hashStr(p.id) + 11);
    if (p.kind === 'military') { militaryBase(T, p, r, lots, sites, props); continue; }
    if (p.kind === 'airfield') { airfield(T, p, r, lots, sites, props); continue; }
    const mix = MIX[p.kind];
    const specials = (mix.special || []).filter(([, w]) => r() < w).map(([id]) => id);
    if (p.id === 'lipovo') specials.push('police'); // the town's police station has the guns
    const roads = T.roads.filter((rd) => rd.pts.some((q) => Math.hypot(q.x - p.x, q.z - p.z) < p.r * 1.05));
    // the special buildings go nearest the middle: walk the frontages nearest first
    const fronts = [];
    for (const rd of roads) for (const side of [-1, 1]) fronts.push({ rd, side, d0: Math.min(...rd.pts.map((q) => Math.hypot(q.x - p.x, q.z - p.z))) });
    fronts.sort((a, b) => a.d0 - b.d0);
    for (const f of fronts) walkFrontage(T, p, f.rd, f.side, r, lots, sites, specials, mix);
    if (p.kind === 'city' && p.quay) port(T, p, r, lots, sites, props);
  }
  for (const q of POIS) poi(T, q, lots, sites, props);
  // level the ground under each building and keep the grass out of it
  for (const s of sites) {
    if (s.noFlatten) continue;
    T.flattenRect(s.x, s.z, s.w / 2 + 2.5, s.d / 2 + 2.5, s.yaw, s.y, s.blend ?? 9);
  }
  for (const s of sites) {
    if (s.noFlatten) { s.y = T.heightAt(s.x, s.z); continue; }
    const g = lotOK(T, s.x, s.z, s.w / 2, s.d / 2, s.yaw, { road: 9, coast: -1e9, drop: 1e9 });
    s.y = g ? Math.max(g.avg, g.hi - 1.0) : s.y;
    T.clearGrass(s.x, s.z, s.w / 2, s.d / 2, s.yaw, 1.5);
  }
  T.updateSlope?.();
  return { sites, props, lots };
}

/** Walk one side of a road through a place, fitting buildings in. */
function walkFrontage(T, p, rd, side, r, lots, sites, specials, mix) {
  const pts = rd.pts, n = pts.length;
  if (n < 2) return;
  const street = rd.type === 'street' || rd.type === 'lane';
  const R = p.r * (p.kind === 'village' ? 1.15 : 1.0);
  let k = 0, carry = 0;
  const at = (s) => {
    // the point a distance s along the road (and its direction)
    while (k < n - 2 && pts[k + 1].d < s) k++;
    while (k > 0 && pts[k].d > s) k--;
    const a = pts[k], b = pts[k + 1], t = clamp((s - a.d) / Math.max(1e-3, b.d - a.d));
    const L = Math.hypot(b.x - a.x, b.z - a.z) || 1;
    return { x: a.x + (b.x - a.x) * t, z: a.z + (b.z - a.z) * t, tx: (b.x - a.x) / L, tz: (b.z - a.z) / L };
  };
  void carry;
  const total = pts[n - 1].d;
  let s = 6 + r() * 8;
  let guard = 0;
  while (s < total - 6 && guard++ < 400) {
    const q = at(s);
    const dc = Math.hypot(q.x - p.x, q.z - p.z);
    if (dc > R) { s += 10; continue; }
    const zone = dc < p.r * 0.36 ? 'inner' : dc < p.r * 0.68 ? 'mid' : 'outer';
    let tpl;
    if (specials.length && (zone === 'inner' || zone === 'mid')) tpl = specials[0];
    else tpl = weighted(r, mix[zone] || mix.outer || mix.inner);
    const T0 = TEMPLATES[tpl] || TEMPLATES.house1;
    const sz = T0.size(r, p);
    const yard = p.kind === 'village' || (zone === 'outer' && /house|cottage/.test(tpl)) ? (sz.yard || null) : null;
    const lotW = sz.w + (yard ? yard.side * 2 : 2), lotD = sz.d + (yard ? yard.front + yard.back : 2);
    // the normal pointing away from the road on this side
    const nx = -q.tz * side, nz = q.tx * side;
    const set = rd.w / 2 + (rd.style?.shoulder ?? 5) + (street ? 2 : 4);
    const mid = at(s + lotW / 2);
    const lcx = mid.x + nx * (set + lotD / 2), lcz = mid.z + nz * (set + lotD / 2);
    const yaw = Math.atan2(-nx, -nz);
    const lot = { x: lcx, z: lcz, hx: lotW / 2, hz: lotD / 2, yaw };
    const hit = lots.hits(lot, 1.5);
    if (hit) no('overlap');
    const g = !hit && lotOK(T, lcx, lcz, lotW / 2, lotD / 2, yaw, { drop: sz.d > 30 ? 14 : 11 });
    if (g) {
      lots.add(lot);
      // the building sits at the front of its lot
      const front = yard ? yard.front : 1;
      const bx = mid.x + nx * (set + front + sz.d / 2), bz = mid.z + nz * (set + front + sz.d / 2);
      const site = { tpl, x: bx, z: bz, yaw, w: sz.w, d: sz.d, y: g.avg, seed: sites.length * 97 + hashStr(p.id), place: p.id, placeKind: p.kind, zone, yard, ...(sz.o || {}) };
      sites.push(site);
      if (specials[0] === tpl) specials.shift();
      s += lotW + (p.kind === 'village' ? 6 + r() * 14 : 3 + r() * 6);
    } else s += 7;
  }
}

/** A building at a spot of a compound's plan (local u, v from the centre along the axis). */
function compound(T, p, r, lots, sites, tpl, u, v, turn, o = {}) {
  const th = p.axis ?? 0, ux = Math.cos(th), uz = Math.sin(th), vx = -uz, vz = ux;
  const x = p.x + ux * u + vx * v, z = p.z + uz * u + vz * v;
  const T0 = TEMPLATES[tpl];
  if (!T0) return null;
  const sz = o.size || T0.size(r, p);
  // the building's own turn: the compound's axis turned by `turn` (in quarter turns)
  const yaw = Math.atan2(-vx, -vz) + turn * Math.PI / 2;
  const lot = { x, z, hx: sz.w / 2 + 1, hz: sz.d / 2 + 1, yaw };
  if (lots.hits(lot, 1)) return null;
  const g = lotOK(T, x, z, sz.w / 2, sz.d / 2, yaw, { drop: o.drop ?? 14, road: o.road ?? 0.03, coast: o.coast ?? 30 });
  if (!g) return null;
  lots.add(lot);
  const site = { tpl, x, z, yaw, w: sz.w, d: sz.d, y: g.avg, seed: sites.length * 97 + hashStr(p.id || p.kind), place: p.id, placeKind: p.kind, ...(sz.o || {}), ...(o.site || {}) };
  sites.push(site);
  return site;
}

function militaryBase(T, p, r, lots, sites, props) {
  const R = p.r * 0.55;
  // barracks in a row, the headquarters, garages, guard towers, tents, a bunker
  for (let i = 0; i < 3; i++) compound(T, p, r, lots, sites, 'barracks', -R * 0.5 + i * R * 0.5, -R * 0.55, 0);
  compound(T, p, r, lots, sites, 'hq', -R * 0.45, R * 0.5, 2);
  compound(T, p, r, lots, sites, 'garages', R * 0.45, R * 0.55, 2, { site: { military: true } });
  for (let i = 0; i < 6; i++) compound(T, p, r, lots, sites, 'tent', R * 0.15 + (i % 3) * 22, -R * 0.05 + Math.floor(i / 3) * 22 - 10, 0);
  compound(T, p, r, lots, sites, 'bunker', -R * 0.2, R * 0.12, 1);
  compound(T, p, r, lots, sites, 'bunker', R * 0.75, -R * 0.75, 0);
  for (const [a, b] of [[-1, -1], [1, -1], [-1, 1], [1, 1]]) compound(T, p, r, lots, sites, 'tower', a * (R + 30), b * (R + 30), 0, { road: 9 });
  props.push({ kind: 'perimeter', place: p.id, x: p.x, z: p.z, axis: p.axis, R: R + 40, fence: 'military', gate: true });
  // trucks and sandbags
  for (let i = 0; i < 5; i++) props.push({ kind: 'vehicle', vk: i < 3 ? 'military' : 'van', place: p.id, ...along(p, (r() - 0.5) * R * 1.6, (r() - 0.5) * R * 1.6), yaw: r() * TAU });
  for (let i = 0; i < 6; i++) props.push({ kind: 'sandbagNest', place: p.id, ...along(p, (r() - 0.5) * R * 2.2, (r() - 0.5) * R * 2.2), yaw: r() * TAU });
  for (let i = 0; i < 6; i++) props.push({ kind: 'containerStack', place: p.id, ...along(p, R * 0.8 + (r() - 0.5) * 20, (i - 3) * 26), yaw: (p.axis ?? 0) + Math.PI / 2, n: 1 + Math.floor(r() * 2), loot: 'military' });
}

function airfield(T, p, r, lots, sites, props) {
  // the runway runs along x (it's been levelled), the buildings north of it
  const ax = p.axis ?? 0;
  void ax;
  const cx = p.x, cz = p.z;
  props.push({ kind: 'runway', x: cx, z: cz - 10, hx: 600, hz: 26, yaw: 0, place: p.id });
  props.push({ kind: 'apron', x: cx - 120, z: cz - 120, hx: 170, hz: 50, yaw: 0, place: p.id });
  props.push({ kind: 'apron', x: cx - 120, z: cz - 50, hx: 12, hz: 24, yaw: 0, place: p.id });
  const at = (tpl, x, z, yaw, o) => {
    const T0 = TEMPLATES[tpl]; if (!T0) return null;
    const sz = T0.size(r, p);
    const lot = { x, z, hx: sz.w / 2, hz: sz.d / 2, yaw };
    if (lots.hits(lot, 1)) return null;
    const g = lotOK(T, x, z, sz.w / 2, sz.d / 2, yaw, { drop: 16, road: 9 });
    if (!g) return null;
    lots.add(lot);
    const site = { tpl, x, z, yaw, w: sz.w, d: sz.d, y: g.avg, seed: sites.length * 97 + 4242, place: p.id, placeKind: 'airfield', ...(sz.o || {}), ...(o || {}) };
    sites.push(site);
    return site;
  };
  for (let i = 0; i < 3; i++) at('hangar', cx - 260 + i * 95, cz - 215, Math.PI);
  at('controlTower', cx + 60, cz - 200, Math.PI);
  at('barracks', cx + 140, cz - 230, Math.PI);
  at('barracks', cx + 140, cz - 275, Math.PI);
  for (let i = 0; i < 4; i++) at('tent', cx + 220 + (i % 2) * 24, cz - 225 - Math.floor(i / 2) * 24, Math.PI);
  at('tower', cx - 420, cz - 140, 0);
  at('tower', cx + 360, cz - 150, 0);
  at('bunker', cx + 260, cz - 300, Math.PI);
  for (let i = 0; i < 3; i++) props.push({ kind: 'tank', x: cx - 380 + i * 18, z: cz - 250, place: p.id });
  for (let i = 0; i < 4; i++) props.push({ kind: 'vehicle', vk: i % 2 ? 'military' : 'truck', x: cx - 200 + r() * 300, z: cz - 140 - r() * 40, yaw: r() * TAU, place: p.id });
  props.push({ kind: 'planeWreck', x: cx + 150, z: cz - 110, yaw: 0.4, place: p.id });
  props.push({ kind: 'perimeter', place: p.id, x: cx, z: cz - 120, axis: 0, R: 0, rect: [700, 230], fence: 'wire', gate: true });
}

function port(T, p, r, lots, sites, props) {
  // warehouses and container yards between the quay road and the water, cranes on the quay
  const q = p.quay;
  // first build the quay out into the bay: a flat apron from the road to a straight edge
  for (let i = 0; i < q.length - 1; i++) {
    const a = q[i], b = q[i + 1], tx = b[0] - a[0], tz = b[1] - a[1], L = Math.hypot(tx, tz) || 1;
    const nx = -tz / L, ny = tx / L, sg = ny > 0 ? 1 : -1;
    const y = clamp(T.heightAt(a[0], a[1]), 3.2, 8);
    p.quayY = y;
    T.flattenRect((a[0] + b[0]) / 2 + nx * sg * 38, (a[1] + b[1]) / 2 + ny * sg * 38, L / 2 + 2, 29, Math.atan2(-tz, tx), y, 6);
  }
  for (let i = 1; i < q.length - 1; i++) {
    const a = q[i - 1], b = q[i + 1], x = q[i][0], z = q[i][1];
    const tx = b[0] - a[0], tz = b[1] - a[1], L = Math.hypot(tx, tz) || 1;
    const nx = -tz / L, nz = tx / L; // towards the water (south)
    const s = nz > 0 ? 1 : -1;
    const yaw = Math.atan2(nx * s, nz * s);
    const kind = i % 3 === 0 ? 'crane' : i % 3 === 1 ? 'containers' : 'warehouse';
    const off = kind === 'crane' ? 44 : 34;
    const px = x + nx * s * off, pz = z + nz * s * off;
    if (kind === 'warehouse') {
      const T0 = TEMPLATES.warehouse, sz = T0.size(r, p), lot = { x: px, z: pz, hx: sz.w / 2, hz: sz.d / 2, yaw: yaw + Math.PI };
      const g = !lots.hits(lot, 2) && lotOK(T, px, pz, sz.w / 2, sz.d / 2, yaw, { coast: -1e9, drop: 12 });
      if (g) { lots.add(lot); sites.push({ tpl: 'warehouse', x: px, z: pz, yaw: yaw + Math.PI, w: sz.w, d: sz.d, y: g.avg, seed: sites.length * 97 + 77, place: p.id, placeKind: 'port' }); }
    } else props.push({ kind: kind === 'crane' ? 'crane' : 'containerYard', x: px, z: pz, yaw, place: p.id });
  }
  props.push({ kind: 'quay', pts: q, place: p.id });
}

function poi(T, q, lots, sites, props) {
  const r = rng(hashStr(q.id) + 3);
  const P = { ...q, r: 60, axis: (hashStr(q.id) % 628) / 100 };
  if (q.kind === 'farm') {
    compound(T, P, r, lots, sites, 'house2', 0, 0, 0, { site: { rural: true, cat: 'farm' } }) || compound(T, P, r, lots, sites, 'house1', 0, 0, 0, { site: { rural: true } });
    compound(T, P, r, lots, sites, 'barn', 42, -10, 1);
    compound(T, P, r, lots, sites, 'barn', -40, -24, 0);
    compound(T, P, r, lots, sites, 'shed', 14, -36, 0);
    compound(T, P, r, lots, sites, 'silo', 30, 30, 0);
    props.push({ kind: 'vehicle', vk: 'tractor', ...along(P, -16, 30), yaw: r() * TAU });
    for (let i = 0; i < 6; i++) props.push({ kind: 'hay', ...along(P, -70 + r() * 140, 60 + r() * 30) });
    props.push({ kind: 'perimeter', x: q.x, z: q.z, axis: P.axis, R: 78, fence: 'boards', gate: true, gaps: 0.5 });
  } else if (q.kind === 'camp') {
    // tents round a fire, a watchtower, barricades
    for (let i = 0; i < 4; i++) { const a = i / 4 * TAU + r(); compound(T, P, r, lots, sites, 'tent', Math.cos(a) * 26, Math.sin(a) * 26, i, { site: { camp: true }, road: 9 }); }
    compound(T, P, r, lots, sites, 'tower', 36, 30, 0, { site: { camp: true }, road: 9 });
    props.push({ kind: 'campfire', x: q.x, z: q.z, place: q.id });
    for (let i = 0; i < 5; i++) { const a = r() * TAU; props.push({ kind: 'barricade', ...along(P, Math.cos(a) * 46, Math.sin(a) * 46), yaw: a + Math.PI / 2 }); }
    for (let i = 0; i < 4; i++) props.push({ kind: 'crateLoot', ...along(P, (r() - 0.5) * 30, (r() - 0.5) * 30), yaw: r() * TAU, loot: r() < 0.5 ? 'military' : 'hunting' });
    props.push({ kind: 'campMarker', x: q.x, z: q.z, id: q.id });
  } else if (q.kind === 'gas') compound(T, P, r, lots, sites, 'gas', 0, 0, 0, { road: 0.05 });
  else if (q.kind === 'castle') { const s = { tpl: 'castle', x: q.x, z: q.z, yaw: 0.3, w: 120, d: 100, y: T.heightAt(q.x, q.z), seed: 31, place: q.id, noFlatten: true }; sites.push(s); lots.add({ x: q.x, z: q.z, hx: 60, hz: 50, yaw: 0.3 }); }
  else if (q.kind === 'lighthouse') { compound(T, P, r, lots, sites, 'lighthouse', 0, 0, 0, { coast: -50, drop: 30 }); compound(T, P, r, lots, sites, 'house1', 30, -26, 0, { coast: -50, site: { rural: true } }); }
  else if (q.kind === 'radio') { compound(T, P, r, lots, sites, 'radio', 0, 0, 0, { drop: 30 }); props.push({ kind: 'perimeter', x: q.x, z: q.z, axis: P.axis, R: 50, fence: 'wire', gate: true }); }
}

function along(p, u, v) {
  const th = p.axis ?? 0, ux = Math.cos(th), uz = Math.sin(th);
  return { x: p.x + ux * u - uz * v, z: p.z + uz * u + ux * v };
}
