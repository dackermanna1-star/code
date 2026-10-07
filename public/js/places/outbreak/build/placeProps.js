// Putting down everything that isn't a building: fences round the bases and
// farms, the airfield's runway, the port's cranes, containers and quay,
// wrecked cars along the roads, street lamps and power lines, bus stops,
// benches, hay bales, the bandits' camps - and the trees planted in town.
import { mat } from './kit.js';
import { rng, hashStr } from '../noise.js';
import { PLACES, ROADS } from '../world/layout.js';
import { fence, vehicle, sandbags, barrier, hedgehog, container, streetLamp, bench, bin, busStop, powerPole, dumpster, tyres, PROP_MATS } from './props.js';
import { crane, containerYard } from './industrial.js';
import { hay } from './houses.js';
import * as Fu from './furniture.js';

const TAU = Math.PI * 2;
const pick = (r, a) => a[Math.floor(r() * a.length)];

export function placeProps(K, T, plan) {
  const r = rng(9001);
  const trees = [];
  const camps = [];
  let seed = 1;
  const at = (x, z, yaw = 0, y) => { K.begin({ x, y: y ?? T.heightAt(x, z), z, yaw, seed: seed++, kind: 'prop' }); };
  const placeById = Object.fromEntries(PLACES.map((p) => [p.id, p]));
  for (const p of plan.props) {
    switch (p.kind) {
      case 'perimeter': perimeter(K, T, p, at, r); break;
      case 'vehicle': at(p.x, p.z, p.yaw); vehicle(K, 0, 0, 0, 0, p.vk || 'sedan', { loot: p.loot }); K.end(); break;
      case 'sandbagNest': {
        at(p.x, p.z, p.yaw);
        sandbags(K, -4, 3, 4, 3, 3, { green: true }); sandbags(K, -4.6, 2.6, -4.6, -3, 3, { green: true }); sandbags(K, 4.6, 2.6, 4.6, -3, 3, { green: true });
        if (r() < 0.6) Fu.ammoBox(K, 0, 0, 0, r(), { cat: 'military' });
        K.end(); break;
      }
      case 'containerStack': {
        at(p.x, p.z, p.yaw);
        for (let i = 0; i < (p.n || 1); i++) container(K, 0, i * 8.6, 0, (r() - 0.5) * 0.05, pick(r, [0x5a6248, 0x6a6a5a, 0x8a3a2a, 0x4a5a6a]), { open: i === 0 && r() < 0.5, loot: p.loot });
        K.end(); break;
      }
      case 'runway': runway(K, T, p, at); break;
      case 'apron': at(p.x, p.z, p.yaw); K.span(-p.hx, -0.5, -p.hz, p.hx, 0.32, p.hz, mat('concrete', 0xb0aca4, { scale: 16 }), { col: false, skip: 'ny' }); K.end(); T.clearGrass(p.x, p.z, p.hx, p.hz, p.yaw, 1); break;
      case 'tank': at(p.x, p.z); for (const sx of [-1, 1]) K.box(sx * 6, 1.6, 0, 0.6, 1.6, 3.5, mat('concrete', 0x9a968e), {}); K.cylAxis(0, 5.2, 0, 3.6, 18, mat('metal', 0xd8d8d0, { p: 4 }), { axis: 'x' }); K.end(); break;
      case 'planeWreck': planeWreck(K, p, at, r); break;
      case 'crane': at(p.x, p.z, p.yaw); crane(K, 0, 0, 0, 0); K.end(); break;
      case 'containerYard': at(p.x, p.z, p.yaw); containerYard(K, 0, 0, 0, 0, r, 'industrial'); K.end(); break;
      case 'quay': quay(K, T, p, at); break;
      case 'hay': at(p.x, p.z); hay(K, 0, 0, 0); K.end(); break;
      case 'campfire': {
        at(p.x, p.z);
        for (let i = 0; i < 9; i++) { const a = i / 9 * TAU; K.box(Math.cos(a) * 2.2, 0.3, Math.sin(a) * 2.2, 0.5, 0.35, 0.4, mat('stone', 0x8a8480), { yaw: a, col: false }); }
        for (let i = 0; i < 4; i++) K.cylAxis(0, 0.5, 0, 0.3, 3, mat('bark2', 0x5a4a3a), { axis: i % 2 ? 'x' : 'z', col: false });
        for (const a of [0.4, 2.4, 4.3]) { K.push(Math.cos(a) * 6, 0, Math.sin(a) * 6, a); K.cylAxis(0, 0.8, 0, 0.75, 6, mat('bark2'), { axis: 'x' }); K.pop(); }
        K.end();
        break;
      }
      case 'barricade': {
        at(p.x, p.z, p.yaw);
        if (r() < 0.5) sandbags(K, -5, 0, 5, 0, 3); else { for (let i = 0; i < 3; i++) Fu.pallet(K, -4 + i * 4.2, 0, 0, Math.PI / 2 + (r() - 0.5) * 0.3, {}); K.box(0, 2.5, 0.4, 6, 2.2, 0.15, mat('planks', 0x8a7a60), { yaw: 0.05 }); tyres(K, 5.5, 0, 1.5); }
        K.end(); break;
      }
      case 'crateLoot': at(p.x, p.z, p.yaw); Fu.crate(K, 0, 0, 0, 0, { loot: p.loot }); K.end(); break;
      case 'campMarker': camps.push({ id: p.id, x: p.x, z: p.z }); break;
      default: break;
    }
  }
  streets(K, T, plan, at, r, trees);
  roadWrecks(K, T, at, r);
  powerLines(K, T, at, r);
  void placeById;
  return { trees, camps };
}

/** A fence round a compound, with a gate on the side facing the nearest road. */
function perimeter(K, T, p, at, r) {
  const th = p.axis ?? 0, c = Math.cos(th), s = Math.sin(th);
  const hx = p.rect ? p.rect[0] : p.R, hz = p.rect ? p.rect[1] : p.R;
  const corner = (u, v) => [p.x + c * u - s * v, p.z + s * u + c * v];
  const sides = [[corner(-hx, -hz), corner(hx, -hz)], [corner(hx, -hz), corner(hx, hz)], [corner(hx, hz), corner(-hx, hz)], [corner(-hx, hz), corner(-hx, -hz)]];
  // the gate goes in the side whose middle is nearest a road
  let gate = 0, best = 1e9;
  sides.forEach(([a, b], i) => { const mx = (a[0] + b[0]) / 2, mz = (a[1] + b[1]) / 2; let d = 1e9; for (const rd of T.roads) for (let k = 0; k < rd.pts.length; k += 4) d = Math.min(d, Math.hypot(rd.pts[k].x - mx, rd.pts[k].z - mz)); if (d < best) { best = d; gate = i; } });
  sides.forEach(([a, b], i) => {
    const L = Math.hypot(b[0] - a[0], b[1] - a[1]);
    const n = Math.max(1, Math.ceil(L / 26));
    for (let k = 0; k < n; k++) {
      const f0 = k / n, f1 = (k + 1) / n;
      if (p.gate && i === gate && Math.abs((f0 + f1) / 2 - 0.5) < 0.5 / n + 1e-6) {
        // the gate: two posts and a barrier pole
        const mx = (a[0] + b[0]) / 2, mz = (a[1] + b[1]) / 2;
        at(mx, mz, Math.atan2(-(b[1] - a[1]), b[0] - a[0]));
        for (const sx of [-1, 1]) K.box(sx * (L / n / 2 - 0.4), 3, 0, 0.5, 3, 0.5, mat('concrete', 0x9a968e), {});
        K.box(0, 3.4, 0, L / n / 2 - 1, 0.18, 0.18, mat('metal', 0xe8e0d0, { p: 5 }), { col: false });
        if (p.fence === 'military') { const kk = r(); for (const sx of [-1, 1]) if (kk < 0.6) barrier(K, sx * 6, 0, 6, 0, { stripes: true }); }
        K.end();
        continue;
      }
      const x0 = a[0] + (b[0] - a[0]) * f0, z0 = a[1] + (b[1] - a[1]) * f0, x1 = a[0] + (b[0] - a[0]) * f1, z1 = a[1] + (b[1] - a[1]) * f1;
      const mx = (x0 + x1) / 2, mz = (z0 + z1) / 2;
      if (T.waterAt(mx, mz) > T.heightAt(mx, mz) - 1 || T.sample(T.roadW, mx, mz) > 0.5) continue;
      at(mx, mz, 0);
      fence(K, x0 - mx, z0 - mz, x1 - mx, z1 - mz, p.fence || 'wire', { gaps: p.gaps ?? 0.15 });
      K.end();
    }
  });
}

/** The runway: a long strip of concrete with its markings. */
function runway(K, T, p, at) {
  at(p.x, p.z, 0, T.heightAt(p.x, p.z));
  const m = mat('asphalt', 0x8a8884, { scale: 20 }), paint = mat('plaster', 0xe8e8e0, { p: 5 });
  K.span(-p.hx, -0.6, -p.hz, p.hx, 0.32, p.hz, m, { col: false, skip: 'ny' });
  for (let x = -p.hx + 60; x < p.hx - 60; x += 32) K.span(x, 0.32, -0.5, x + 16, 0.36, 0.5, paint, { col: false, skip: 'ny' });
  for (const sx of [-1, 1]) for (let i = 0; i < 8; i++) K.span(sx * (p.hx - 30) - 3, 0.32, -p.hz + 4 + i * 6, sx * (p.hx - 30) + 3, 0.36, -p.hz + 6.5 + i * 6, paint, { col: false, skip: 'ny' });
  for (const sz of [-1, 1]) K.span(-p.hx + 10, 0.32, sz * (p.hz - 1.5) - 0.3, p.hx - 10, 0.36, sz * (p.hz - 1.5) + 0.3, paint, { col: false, skip: 'ny' });
  K.end();
  T.clearGrass(p.x, p.z, p.hx, p.hz, 0, 1);
}

/** A crashed cargo plane by the runway: a broken fuselage, a wing, the tail. */
function planeWreck(K, p, at, r) {
  at(p.x, p.z, p.yaw);
  const body = mat('metal', 0x8a9088, { p: 4 }), dark = mat('metal', 0x3a3e3a, { p: 4 });
  K.cylAxis(-8, 4.6, 0, 4.6, 26, body, { axis: 'x', capMat: dark });
  K.push(18, 0, 3, 0.35); K.cylAxis(0, 4.2, 0, 4.4, 20, body, { axis: 'x', capMat: dark }); K.pop();
  K.span(-6, 6.5, -30, 4, 7.3, -4.6, body, {});
  K.span(-4, 0, 4.6, 6, 2.8, 22, body, { yaw: 0.2 });
  K.push(30, 0, 8, 0.35); K.span(-1, 4, -0.4, 6, 18, 0.4, body, {}); K.span(-2, 9, -7, 6, 9.8, 7, body, {}); K.pop();
  for (let i = 0; i < 2; i++) K.cylAxis(-4 + i * 4, 3.4, -18 + i * 7, 1.8, 6, dark, { axis: 'x' });
  K.indoors(0.4);
  Fu.crate(K, -10, 0.2, 0, 0.3, { loot: 'military' });
  K.lootAt(-14, 0.3, 1, 'military', { spread: 2 });
  K.outdoors();
  K.room(-21, -4, 5, 4, 0.2, 8, 'plane');
  K.end();
  void r;
}

/** The quay: a concrete edge along the port with bollards. */
function quay(K, T, p, at) {
  const q = p.pts;
  for (let i = 0; i < q.length - 1; i++) {
    const a = q[i], b = q[i + 1], tx = b[0] - a[0], tz = b[1] - a[1], L = Math.hypot(tx, tz) || 1;
    const nx = -tz / L, nz = tx / L, s = nz > 0 ? 1 : -1;
    const ex = (a[0] + b[0]) / 2 + nx * s * 66, ez = (a[1] + b[1]) / 2 + nz * s * 66;
    at(ex, ez, Math.atan2(-tz, tx));
    K.span(-L / 2 - 0.5, -9, -1.5, L / 2 + 0.5, 0.4, 1.5, mat('concrete', 0x9a968e), { skip: 'ny' });
    for (let k = 0; k < 3; k++) K.cyl(-L / 2 + L * (k + 0.5) / 3, 0.4, 0, 0.55, 1.2, mat('metal', 0x2a2a2a, { p: 4 }), {});
    K.end();
  }
}

/** Street lamps, benches, bins and bus stops in the towns; trees in the yards and parks. */
function streets(K, T, plan, at, r, trees) {
  for (const p of PLACES) {
    if (p.kind !== 'city' && p.kind !== 'town' && p.kind !== 'village') continue;
    const roads = T.roads.filter((rd) => rd.pts.some((q) => Math.hypot(q.x - p.x, q.z - p.z) < p.r));
    for (const rd of roads) {
      const lamps = p.kind !== 'village' && rd.style.tex === 'asphalt';
      const every = p.kind === 'city' ? 42 : 56;
      for (let k = 0, side = 1; k < rd.pts.length - 1; k += Math.max(1, Math.round(every / 6))) {
        const a = rd.pts[k], b = rd.pts[k + 1];
        if (Math.hypot(a.x - p.x, a.z - p.z) > p.r * 0.95 || a.bridge) continue;
        const L = Math.hypot(b.x - a.x, b.z - a.z) || 1, tx = (b.x - a.x) / L, tz = (b.z - a.z) / L;
        side = -side;
        const off = rd.w / 2 + 1.6;
        const x = a.x - tz * side * off, z = a.z + tx * side * off;
        if (plan.lots.hits({ x, z, hx: 1, hz: 1, yaw: 0 }, 0)) continue;
        if (lamps) { at(x, z, Math.atan2(tz * side, -tx * side) + Math.PI / 2); streetLamp(K, 0, 0, 0, 0); K.end(); }
        if (r() < (p.kind === 'city' ? 0.12 : 0.06)) { const x2 = a.x - tz * side * (off + 1.5) + tx * 4, z2 = a.z + tx * side * (off + 1.5) + tz * 4; at(x2, z2, Math.atan2(-tz * side, tx * side)); r() < 0.5 ? bench(K, 0, 0, 0, Math.PI) : dumpster(K, 0, 0, 0, 0); K.end(); }
      }
    }
    // a bus stop by the main road
    const main = roads.find((rd) => rd.type === 'highway' || rd.type === 'road');
    if (main) {
      let bk = 0, bd = 1e9;
      main.pts.forEach((q, k) => { const d = Math.hypot(q.x - p.x, q.z - p.z); if (d < bd && d > 30) { bd = d; bk = k; } });
      const a = main.pts[bk], b = main.pts[Math.min(main.pts.length - 1, bk + 1)];
      const L = Math.hypot(b.x - a.x, b.z - a.z) || 1, tx = (b.x - a.x) / L, tz = (b.z - a.z) / L;
      const x = a.x - tz * (main.w / 2 + 6), z = a.z + tx * (main.w / 2 + 6);
      if (!plan.lots.hits({ x, z, hx: 6, hz: 3, yaw: Math.atan2(-tz, tx) }, 0)) { at(x, z, Math.atan2(tz, -tx) + Math.PI); busStop(K, 0, 0, 0, 0); K.end(); }
    }
    // trees: in the yards and along the streets; a park or two in the city
    const n = p.kind === 'city' ? 420 : p.kind === 'town' ? 160 : 60;
    for (let i = 0; i < n * 3 && n > 0; i++) {
      const a = r() * TAU, d = Math.sqrt(r()) * p.r * 1.05, x = p.x + Math.cos(a) * d, z = p.z + Math.sin(a) * d;
      if (T.sample(T.roadW, x, z) > 0.05 || T.grassAt(x, z) < 0.1) continue;
      if (plan.lots.hits({ x, z, hx: 2.5, hz: 2.5, yaw: 0 }, 0)) {
        // inside a lot: only in yards (not on the building)
        if (!yardAt(plan, x, z)) continue;
      }
      if (T.sample(T.coast, x, z) < 40) continue;
      trees.push({ x, z, sp: r() < 0.55 ? 2 : r() < 0.6 ? 3 : 4, s: 0.7 + r() * 0.5 });
      if (trees.length > 3000) break;
    }
  }
}
function yardAt(plan, x, z) {
  for (const s of plan.sites) {
    if (!s.yard) continue;
    const dx = x - s.x, dz = z - s.z, c = Math.cos(s.yaw), sn = Math.sin(s.yaw);
    const lx = dx * c - dz * sn, lz = dx * sn + dz * c;
    const inHouse = Math.abs(lx) < s.w / 2 + 3 && Math.abs(lz) < s.d / 2 + 3;
    const inYard = Math.abs(lx) < s.w / 2 + s.yard.side && lz > -s.d / 2 - s.yard.back && lz < s.d / 2 + s.yard.front;
    if (inYard) return !inHouse;
  }
  return false;
}

/** Wrecked cars along the roads: the odd one off on the verge, more near the towns, a pile-up or two. */
function roadWrecks(K, T, at, r) {
  for (const rd of T.roads) {
    if (rd.type === 'track') continue;
    const town = rd.type === 'street';
    const every = town ? 90 : rd.type === 'highway' ? 220 : 300;
    for (let s = 40 + r() * every; s < rd.pts[rd.pts.length - 1].d - 20; s += every * (0.5 + r())) {
      let k = 0; while (k < rd.pts.length - 2 && rd.pts[k + 1].d < s) k++;
      const a = rd.pts[k], b = rd.pts[k + 1];
      if (a.bridge) continue;
      const L = Math.hypot(b.x - a.x, b.z - a.z) || 1, tx = (b.x - a.x) / L, tz = (b.z - a.z) / L;
      const n = r() < 0.15 ? 2 + Math.floor(r() * 3) : 1;
      for (let i = 0; i < n; i++) {
        const lane = (r() < 0.5 ? -1 : 1) * rd.w * (r() < 0.25 ? 0.62 : 0.25);
        const along = i * 9 + (r() - 0.5) * 4;
        const x = a.x - tz * lane + tx * along, z = a.z + tx * lane + tz * along;
        const off = Math.abs(lane) > rd.w / 2;
        const y = off ? T.heightAt(x, z) : a.y + 0.25;
        const yaw = Math.atan2(tx, tz) + (lane < 0 ? Math.PI : 0) + (r() - 0.5) * (n > 1 ? 1.4 : 0.5);
        at(x, z, yaw, y);
        const kind = r() < 0.55 ? 'sedan' : r() < 0.3 ? 'hatch' : r() < 0.4 ? 'van' : r() < 0.4 ? 'truck' : r() < 0.15 ? 'bus' : r() < 0.25 ? 'police' : 'sedan';
        vehicle(K, 0, 0, 0, 0, kind);
        K.end();
      }
    }
  }
}

/** Power poles along the main roads, with wires between them. */
function powerLines(K, T, at, r) {
  const wire = mat('plaster', 0x1a1a1a, { p: 5 });
  for (const rd of T.roads) {
    if (rd.type !== 'highway' && rd.type !== 'road') continue;
    let prev = null;
    for (let s = 20; s < rd.pts[rd.pts.length - 1].d; s += 115) {
      let k = 0; while (k < rd.pts.length - 2 && rd.pts[k + 1].d < s) k++;
      const a = rd.pts[k], b = rd.pts[k + 1];
      const L = Math.hypot(b.x - a.x, b.z - a.z) || 1, tx = (b.x - a.x) / L, tz = (b.z - a.z) / L;
      const off = rd.w / 2 + 10;
      const x = a.x + tz * off, z = a.z - tx * off;
      if (a.bridge || T.waterAt(x, z) > T.heightAt(x, z) - 1 || T.sample(T.roadW, x, z) > 0.3) { prev = null; continue; }
      const y = T.heightAt(x, z);
      const yaw = Math.atan2(tx, tz) + Math.PI / 2;
      at(x, z, yaw, y); powerPole(K, 0, 0, 0, 0); K.end();
      const cur = { x, y: y + 25.1, z, yaw };
      if (prev && Math.hypot(prev.x - x, prev.z - z) < 160) {
        // three wires, each a thin ribbon sagging in the middle
        at((prev.x + x) / 2, (prev.z + z) / 2, 0, 0);
        const ox = (prev.x + x) / 2, oz = (prev.z + z) / 2;
        K.details(() => { for (const o of [-2.8, 0, 2.8]) {
          const ax = prev.x + Math.cos(prev.yaw) * o - ox, az = prev.z - Math.sin(prev.yaw) * o - oz, bx = x + Math.cos(yaw) * o - ox, bz = z - Math.sin(yaw) * o - oz;
          const mx = (ax + bx) / 2, mz = (az + bz) / 2, my = (prev.y + cur.y) / 2 - 3;
          K.quad([ax, prev.y, az], [mx, my, mz], [mx, my + 0.09, mz], [ax, prev.y + 0.09, az], wire, { both: true });
          K.quad([mx, my, mz], [bx, cur.y, bz], [bx, cur.y + 0.09, bz], [mx, my + 0.09, mz], wire, { both: true });
        } });
        K.end();
      }
      prev = cur;
    }
  }
}

export { hashStr, ROADS, hedgehog, PROP_MATS };
