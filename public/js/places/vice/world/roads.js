// The roads of Vice City, made from the plan's road graph: asphalt with lane
// markings and crosswalks (drawn in the shader), junctions, kerbs and
// sidewalks with corners, medians, bridge and expressway decks with barriers,
// railings, piers and pillars, traffic lights that work, and street lamps
// that come on at night.
//
//   const roads = new Roads(world, plan, ground, phys);
//   roads.lightState(nodeId, edgeId) -> 'green' | 'yellow' | 'red'   (traffic arriving on that edge)
//   roads.junction[nodeId] = { arms: [{edge, u: [ux, uz], s (setback), hw, walk}] }
//   roads.walkways: sidewalk centre lines [{ax, az, bx, bz, y, w, edge, side}]
//   roads.crossings: crosswalks [{ax, az, bx, bz, y, node, edge}]
//   roads.parking: kerbside parking spots [{x, y, z, heading, edge}]
//   roads.medians: points along boulevard medians for palms [{x, y, z}]
//   roads.update(dt, camera)
//
// Lanes: traffic keeps right. Along an edge a->b the right side is (-tz, tx).
import * as THREE from 'three';
import { V, K } from '../state.js';
import { viceTextures, TEX_LAYER } from './textures.js';
import { Chunks, surfaceMaterial, TBN_GLSL } from './surface.js';

const KERB = 0.5;          // kerb height
const LIFT = 0.06;         // asphalt above the ground
const LAMP_STEP = 96;      // street lamp spacing
const CYCLE = 30;          // traffic light cycle, s

const T = {
  walk: [0.93, 0.9, 0.86], kerb: [0.95, 0.94, 0.9], deck: [0.86, 0.85, 0.82], pillar: [0.9, 0.89, 0.86],
  barrier: [0.93, 0.92, 0.88], rail: [0.98, 0.97, 0.95], median: [0.62, 0.86, 0.5], pole: [0.32, 0.34, 0.36], signal: [0.1, 0.1, 0.1],
  head: [1.0, 0.92, 0.75],
};

export class Roads {
  constructor(world, plan, ground, phys) {
    this.world = world; this.plan = plan; this.ground = ground; this.phys = phys;
    this.tex = viceTextures(world.renderer);
    this.L = TEX_LAYER;
    this.glow = { value: 0 };
    this.walkways = []; this.crossings = []; this.parking = []; this.medians = []; this.lamps = []; this.signals = [];
    this.group = new THREE.Group(); this.group.name = 'roads';
    this.C = new Chunks();
    const t0 = performance.now();
    this._junctions();
    for (const e of plan.edges) this._edge(e);
    for (const n of plan.nodes) this._node(n);
    this._lampsAndSignals();
    // materials
    this.asphalt = asphaltMaterial(this.tex, this.L);
    this.surf = surfaceMaterial(this.tex, { glowUniform: this.glow, key: 'roads' });
    const meshes = this.C.meshes({ road: this.asphalt, surf: this.surf }, { shadow: new Set(['surf']), order: {} });
    for (const m of meshes) { if (m.userData.mat === 'road') m.castShadow = false; this.group.add(m); }
    this.meshCount = meshes.length;
    world.scene.add(this.group);
    this.buildMs = Math.round(performance.now() - t0);
  }

  // ---- junctions: where each road stops short of the crossing ones ----
  _junctions() {
    const P = this.plan;
    this.junction = new Array(P.nodes.length);
    for (const n of P.nodes) {
      const arms = [];
      for (const id of n.edges) {
        const e = P.edges[id], pts = e.pts, atA = e.a === n.id;
        // (a loop edge would appear twice; the graph has none)
        const p0 = atA ? pts[0] : pts[pts.length - 1], p1 = atA ? pts[1] : pts[pts.length - 2];
        const dx = p1.x - p0.x, dz = p1.z - p0.z, l = Math.hypot(dx, dz) || 1;
        arms.push({ edge: e, atA, u: [dx / l, dz / l], ang: Math.atan2(dz, dx), hw: e.width / 2, walk: e.walk || 0, s: 0, sPlus: 0, sMinus: 0 });
      }
      arms.sort((a, b) => a.ang - b.ang);
      for (const a of arms) {
        for (const b of arms) {
          if (a === b) continue;
          const cos = a.u[0] * b.u[0] + a.u[1] * b.u[1], th = Math.acos(Math.max(-1, Math.min(1, cos)));
          if (th > 2.6) continue; // carries straight on
          const t = Math.max(th, 0.35);
          a.s = Math.max(a.s, b.hw / Math.sin(t) + a.hw / Math.tan(t) + 0.5);
        }
      }
      // the sidewalk on each side starts beyond the corner piece
      for (let i = 0; i < arms.length && arms.length > 1; i++) {
        const a = arms[i], b = arms[(i + 1) % arms.length];
        let th = b.ang - a.ang; if (th <= 0) th += Math.PI * 2;
        a.next = b; a.thNext = th; b.prev = a; b.thPrev = th;
        if (th > 0.5 && th < 2.6 && a.walk && b.walk) {
          a.sPlus = b.walk / Math.sin(th);
          b.sMinus = a.walk / Math.sin(th);
        }
      }
      this.junction[n.id] = { node: n, arms };
    }
  }
  _arm(n, e) { return this.junction[n].arms.find((a) => a.edge === e); }

  // ---- one road: its asphalt, sidewalks, decks and barriers ----
  _edge(e) {
    const P = this.plan, L = this.L;
    const A = this._arm(e.a, e), B = this._arm(e.b, e);
    const d0 = A ? A.s : 0, d1 = e.len - (B ? B.s : 0);
    if (d1 - d0 < 0.5) return;
    const hw = e.width / 2, walk = e.walk || 0, R = e.R;
    const med = R.median, lanes = R.lanes, lw = R.lane;
    const nA = P.nodes[e.a], nB = P.nodes[e.b];
    const jA = nA.edges.length >= 3, jB = nB.edges.length >= 3;
    // crosswalks only where there are sidewalks to join
    const flags = (jA && walk ? 1 : 0) + (jB && walk ? 2 : 0) + (e.cls === 'hwy' ? 4 : 0) + (med ? 8 : 0) + (R.parking ? 16 : 0) + (nA.light ? 32 : 0) + (nB.light ? 64 : 0);
    const len = d1 - d0;
    const samples = sampleLine(e.pts, d0, d1);
    const raised = e.bridge || e.elevated;
    for (let i = 0; i < samples.length - 1; i++) {
      const a = samples[i], b = samples[i + 1];
      const ya = a.y + LIFT, yb = b.y + LIFT;
      const g = this.C.get('road', (a.x + b.x) / 2, (a.z + b.z) / 2);
      // asphalt: info = (u across, d along, length, flags); u is + to the right of a->b
      const ra = [a.rx, a.rz], rb = [b.rx, b.rz];
      const P0 = [a.x - ra[0] * hw, ya, a.z - ra[1] * hw], P1 = [a.x + ra[0] * hw, ya, a.z + ra[1] * hw];
      const P2 = [b.x + rb[0] * hw, yb, b.z + rb[1] * hw], P3 = [b.x - rb[0] * hw, yb, b.z - rb[1] * hw];
      const ia = a.d - d0, ib = b.d - d0;
      const lanesInfo = lanes + med * 16 + lw * 256; // packed: lanes, median, lane width
      g.quad(P0, P3, P2, P1, { lay: L.asphalt, scale: 26, normal: [0, 1, 0], info: [[-hw, ia, len, flags], [-hw, ib, len, flags], [hw, ib, len, flags], [hw, ia, len, flags]], tint: [1, 1, 1], rough: lanesInfo });
      // fix the quad's winding if it faces down (depends on direction)
      fixUp(g);
      // the median: a raised planter (boulevards) or a concrete barrier (expressway)
      if (med) {
        const mh = med / 2 - 0.4;
        if (e.cls === 'hwy') this._wall(a, b, 0, 0.6, 1.4, T.barrier, L.concrete, true);
        else this._strip(a, b, -mh, mh, KERB, T.median, L.lawn, 8, true, false);
      }
      // sidewalks (with kerbs), or barriers on decks without them
      if (walk) {
        for (const side of [1, -1]) {
          // trim the sidewalk at either end for the corner pieces
          const arm0 = A, arm1 = B;
          const t0 = side > 0 ? (arm0 ? arm0.sPlus : 0) : (arm0 ? arm0.sMinus : 0);
          const t1 = side > 0 ? (arm1 ? arm1.sMinus : 0) : (arm1 ? arm1.sPlus : 0);
          const s0 = Math.max(a.d, d0 + t0), s1 = Math.min(b.d, d1 - t1);
          if (s1 - s0 < 0.2) continue;
          const sa = lerpS(a, b, (s0 - a.d) / Math.max(1e-6, b.d - a.d)), sb = lerpS(a, b, (s1 - a.d) / Math.max(1e-6, b.d - a.d));
          this._strip(sa, sb, side > 0 ? hw : -hw - walk, side > 0 ? hw + walk : -hw, KERB, T.walk, side > 0 === (Math.abs(sa.rx) > 0.5) ? L.sidewalk : L.sidewalk, 14, true, raised);
          const mid = side * (hw + walk / 2);
          this.walkways.push({ ax: sa.x + sa.rx * mid, az: sa.z + sa.rz * mid, bx: sb.x + sb.rx * mid, bz: sb.z + sb.rz * mid, y: (sa.y + sb.y) / 2 + KERB, w: walk, edge: e.id, side });
          if (raised) this._rail(sa, sb, side * (hw + walk + 0.25), T.rail);
          // kerb collision (people step up, cars ride over)
          if (!raised) this._kerbBox(sa, sb, side > 0 ? hw : -hw - walk, side > 0 ? hw + walk : -hw);
        }
      } else if (raised || e.cls === 'hwy') {
        for (const side of [1, -1]) this._wall(a, b, side * (hw + 0.6), 0.6, 1.6, T.barrier, L.concrete, true);
      }
      // the deck: its sides and underside, and what holds it up
      if (raised) this._deck(a, b, hw + (walk ? walk + 0.5 : 1.2), e);
    }
    // parking along streets, palms along medians
    if (R.parking && !raised) {
      for (let d = d0 + 22; d < d1 - 22; d += 26) {
        const p = pointAt(e.pts, d);
        for (const side of [1, -1]) {
          const off = side * (hw - 3.6);
          this.parking.push({ x: p.x + p.rx * off, y: p.y, z: p.z + p.rz * off, heading: Math.atan2(p.tx * side, p.tz * side), edge: e.id });
        }
      }
    }
    if (med && e.cls === 'blvd' && !raised) for (let d = d0 + 14; d < d1 - 14; d += 34) { const p = pointAt(e.pts, d); this.medians.push({ x: p.x, y: p.y + KERB, z: p.z }); }
    // lamps along the sidewalks
    if (walk && !e.elevated) {
      for (const side of [1, -1]) {
        for (let d = d0 + 18 + (side > 0 ? 0 : LAMP_STEP / 2); d < d1 - 12; d += LAMP_STEP) {
          const p = pointAt(e.pts, d), off = side * (hw + 1.3);
          this.lamps.push({ x: p.x + p.rx * off, y: p.y + KERB, z: p.z + p.rz * off, ax: -p.rx * side, az: -p.rz * side, raised });
        }
      }
    }
  }

  /** A raised strip from u0 to u1 (across) between samples a and b: top plus kerb faces. */
  _strip(a, b, u0, u1, h, tint, lay, scale, kerbs = true, deep = false) {
    const g = this.C.get('surf', (a.x + b.x) / 2, (a.z + b.z) / 2);
    const P = (s, u, y) => [s.x + s.rx * u, y, s.z + s.rz * u];
    const ya = a.y + h, yb = b.y + h;
    const q = [P(a, u0, ya), P(b, u0, yb), P(b, u1, yb), P(a, u1, ya)];
    g.quad(q[0], q[3], q[2], q[1], { lay, tint, scale });
    fixUp(g);
    if (kerbs) {
      const lo = deep ? -0.2 : 0;
      // the two long faces (outward)
      faceOut(g, P(a, u0, a.y + lo), P(b, u0, b.y + lo), P(b, u0, yb), P(a, u0, ya), [-(a.rx), -(a.rz)], { lay: this.L.concrete, tint: T.kerb, scale: 6 });
      faceOut(g, P(a, u1, a.y + lo), P(b, u1, b.y + lo), P(b, u1, yb), P(a, u1, ya), [a.rx, a.rz], { lay: this.L.concrete, tint: T.kerb, scale: 6 });
    }
  }

  /** A wall/barrier centred at u across, thickness th, height h above the deck. */
  _wall(a, b, u, th, h, tint, lay, solid) {
    const g = this.C.get('surf', (a.x + b.x) / 2, (a.z + b.z) / 2);
    const P = (s, du, y) => [s.x + s.rx * (u + du), y, s.z + s.rz * (u + du)];
    const t = th / 2;
    const ya0 = a.y, yb0 = b.y, ya = a.y + h, yb = b.y + h;
    g.quad(P(a, -t, ya), P(a, t, ya), P(b, t, yb), P(b, -t, yb), { lay, tint, scale: 8 }); fixUp(g);
    faceOut(g, P(a, -t, ya0), P(b, -t, yb0), P(b, -t, yb), P(a, -t, ya), [-a.rx, -a.rz], { lay, tint, scale: 8 });
    faceOut(g, P(a, t, ya0), P(b, t, yb0), P(b, t, yb), P(a, t, ya), [a.rx, a.rz], { lay, tint, scale: 8 });
    if (solid) this._segBox(a, b, u, t + 0.2, h, 'concrete', { barrier: true });
  }

  /** A railing: posts and a top rail (drawn), solid for collision. */
  _rail(a, b, u, tint) {
    const g = this.C.get('surf', (a.x + b.x) / 2, (a.z + b.z) / 2);
    const P = (s, du, y) => [s.x + s.rx * (u + du), y, s.z + s.rz * (u + du)];
    const h = 2.6;
    // low wall + top rail
    g.quad(P(a, -0.25, a.y + h), P(a, 0.25, a.y + h), P(b, 0.25, b.y + h), P(b, -0.25, b.y + h), { lay: this.L.concrete, tint, scale: 8 }); fixUp(g);
    faceOut(g, P(a, -0.25, a.y), P(b, -0.25, b.y), P(b, -0.25, b.y + h), P(a, -0.25, a.y + h), [-a.rx, -a.rz], { lay: this.L.stucco, tint, scale: 8 });
    faceOut(g, P(a, 0.25, a.y), P(b, 0.25, b.y), P(b, 0.25, b.y + h), P(a, 0.25, a.y + h), [a.rx, a.rz], { lay: this.L.stucco, tint, scale: 8 });
    this._segBox(a, b, u, 0.45, h, 'concrete', { barrier: true });
  }

  /** Deck sides and underside, piers and pillars under raised roads. */
  _deck(a, b, half, e) {
    const g = this.C.get('surf', (a.x + b.x) / 2, (a.z + b.z) / 2);
    const P = (s, u, y) => [s.x + s.rx * u, y, s.z + s.rz * u];
    const th = e.elevated ? 3.2 : 2.4;
    const ya = a.y - th, yb = b.y - th;
    // underside
    g.quad(P(a, half, ya), P(a, -half, ya), P(b, -half, yb), P(b, half, yb), { lay: this.L.concrete, tint: T.deck, scale: 20 });
    fixDown(g);
    // sides
    for (const side of [1, -1]) faceOut(g, P(a, side * half, ya), P(b, side * half, yb), P(b, side * half, b.y + KERB), P(a, side * half, a.y + KERB), [side * a.rx, side * a.rz], { lay: this.L.concrete, tint: T.deck, scale: 10 });
    // supports every so often (by distance along the edge, so they don't bunch up)
    const step = e.elevated ? 84 : 72;
    const first = Math.ceil(a.d / step) * step;
    for (let d = first; d < b.d; d += step) {
      const s = lerpS(a, b, (d - a.d) / Math.max(1e-6, b.d - a.d));
      const top = s.y - th, gy = this.ground.heightAt(s.x, s.z);
      const clear = top - gy;
      if (clear < 2.5) continue;
      if (clear < 9 && e.elevated) {
        // low end of a ramp: a solid embankment wall underneath
        this._segBox(s, lerpS(a, b, Math.min(1, (d + step - a.d) / Math.max(1e-6, b.d - a.d))), 0, half, 0, 'concrete', { ramp: true }, gy);
        continue;
      }
      const cols = e.elevated ? [0] : [-half * 0.55, half * 0.55];
      const r = e.elevated ? 3.2 : 2.2;
      for (const u of cols) {
        const cx = s.x + s.rx * u, cz = s.z + s.rz * u;
        const head = Math.atan2(s.tx, s.tz);
        const gg = this.C.get('surf', cx, cz);
        gg.box(cx, (top + gy) / 2 - 0.5, cz, r, (top - gy) / 2 + 0.5, r, head, { lay: this.L.concrete, tint: T.pillar, scale: 12, top: false });
        this.phys.add(cx, (top + gy) / 2, cz, r, (top - gy) / 2, r, head, 'concrete', { pillar: true });
      }
      // the cap across under the deck
      const cx = s.x, cz = s.z, head = Math.atan2(s.tx, s.tz);
      g.box(cx, top - 1.2, cz, half * 0.92, 1.2, 2.6, head, { lay: this.L.concrete, tint: T.pillar, scale: 12, top: false, bottom: true });
    }
  }

  /** A collision box along a->b at offset u, half width hw, height h above the road (or from y0 up to the deck). */
  _segBox(a, b, u, hw, h, mat, extra, y0 = null) {
    const ax = a.x + a.rx * u, az = a.z + a.rz * u, bx = b.x + b.rx * u, bz = b.z + b.rz * u;
    const L = Math.hypot(bx - ax, bz - az);
    if (L < 0.1) return;
    const head = Math.atan2(bx - ax, bz - az);
    // sloped segments: split into a few boxes so they follow the slope
    const n = Math.max(1, Math.ceil(Math.abs(b.y - a.y) / 1.5));
    for (let i = 0; i < n; i++) {
      const t0 = i / n, t1 = (i + 1) / n, tm = (t0 + t1) / 2;
      const y = a.y + (b.y - a.y) * tm;
      const x = ax + (bx - ax) * tm, z = az + (bz - az) * tm;
      if (y0 != null) { const top = y - 3.2; this.phys.add(x, (top + y0) / 2, z, hw, Math.max(0.5, (top - y0) / 2), (L / n) / 2, head, mat, extra); }
      else this.phys.add(x, y + h / 2, z, hw, h / 2, (L / n) / 2 + 0.05, head, mat, extra);
    }
  }
  _kerbBox(a, b, u0, u1) {
    // sidewalks as low boxes, so people stand on them (cars' suspension rides up the kerb)
    const u = (u0 + u1) / 2, hw = Math.abs(u1 - u0) / 2;
    this._segBox(a, b, u, hw, KERB, 'concrete', { kerb: true, noBlock: true });
  }

  // ---- junction patches and corners ----
  _node(n) {
    const J = this.junction[n.id], arms = J.arms, L = this.L;
    if (arms.length < 2) {
      // dead end: a kerb across the end
      const a = arms[0]; if (!a) return;
      const e = a.edge, y = n.y;
      const ux = a.u[0], uz = a.u[1], rx = -uz, rz = ux;
      const g = this.C.get('surf', n.x, n.z);
      const W = a.hw + a.walk;
      const s = { x: n.x - ux * 0.0, z: n.z - uz * 0.0, y, rx, rz };
      const s2 = { x: n.x - ux * 3, z: n.z - uz * 3, y, rx, rz };
      if (!e.bridge && !e.elevated) this._strip(s2, s, -W, W, KERB, T.walk, L.sidewalk, 14, true, false);
      else this._wall(s2, s, 0, 0.6, 1.6, T.barrier, L.concrete, true);
      return;
    }
    const y = n.y + LIFT;
    // the asphalt patch
    if (arms.length >= 3 || arms.some((a) => a.s > 0.6)) {
      const poly = [];
      for (const a of arms) {
        const rx = -a.u[1], rz = a.u[0];
        poly.push([n.x + a.u[0] * a.s - rx * a.hw, y, n.z + a.u[1] * a.s - rz * a.hw]);
        poly.push([n.x + a.u[0] * a.s + rx * a.hw, y, n.z + a.u[1] * a.s + rz * a.hw]);
        if (a.thNext > 0.5 && a.thNext < 2.6) {
          const b = a.next;
          const c = lineX(n, a, a.hw, b, -b.hw);
          if (c) poly.push([c[0], y, c[1]]);
        }
      }
      sortAround(poly, n.x, n.z);
      const g = this.C.get('road', n.x, n.z);
      g.fan(poly, { lay: L.asphalt, scale: 26, info: [0, 0, 0, 128], rough: 0 });
    }
    // corners: between each pair of neighbouring arms that both have sidewalks
    for (const a of arms) {
      const b = a.next;
      if (!b || b === a || !a.walk || !b.walk) continue;
      const th = a.thNext;
      const g = this.C.get('surf', n.x, n.z);
      const ar = [-a.u[1], a.u[0]], br = [-b.u[1], b.u[0]];
      const yk = n.y + KERB;
      const at = (arm, r, d, off) => [n.x + arm.u[0] * d + r[0] * off, n.z + arm.u[1] * d + r[1] * off];
      if (th > 0.5 && th < 2.6) {
        const p6 = lineX(n, a, a.hw, b, -b.hw), p3 = lineX(n, a, a.hw + a.walk, b, -(b.hw + b.walk));
        if (!p6 || !p3) continue;
        const p1 = at(a, ar, a.s + a.sPlus, a.hw), p2 = at(a, ar, a.s + a.sPlus, a.hw + a.walk);
        const p5 = at(b, br, b.s + b.sMinus, -b.hw), p4 = at(b, br, b.s + b.sMinus, -(b.hw + b.walk));
        const poly = [p6, p1, p2, p3, p4, p5].map((p) => [p[0], yk, p[1]]);
        sortAround(poly, (p6[0] + p3[0]) / 2, (p6[1] + p3[1]) / 2);
        g.fan(poly, { lay: L.sidewalk, tint: T.walk, scale: 14 });
        // kerb faces along the curb lines (p5 -> p6 -> p1)
        for (const [p, q] of [[p5, p6], [p6, p1]]) {
          const dx = q[0] - p[0], dz = q[1] - p[1], l = Math.hypot(dx, dz);
          if (l < 0.05) continue;
          // outward normal points into the road: towards the node
          let nx = -dz / l, nz = dx / l;
          if ((n.x - p[0]) * nx + (n.z - p[1]) * nz < 0) { nx = -nx; nz = -nz; }
          faceOut(g, [p[0], n.y, p[1]], [q[0], n.y, q[1]], [q[0], yk, q[1]], [p[0], yk, p[1]], [nx, nz], { lay: L.concrete, tint: T.kerb, scale: 6 });
        }
        // collision
        const cx = (p6[0] + p3[0]) / 2, cz = (p6[1] + p3[1]) / 2, ext = Math.hypot(p3[0] - p6[0], p3[1] - p6[1]) / 2;
        this.phys.add(cx, n.y + KERB / 2, cz, ext * 0.7, KERB / 2, ext * 0.7, Math.atan2(a.u[0] + b.u[0], a.u[1] + b.u[1]), 'concrete', { kerb: true, noBlock: true });
        // crosswalk ends for the people: across arm a's mouth
      } else if (th >= 2.6 && th <= 3.7) {
        // a straight run of sidewalk across the junction mouth
        const p1 = at(a, ar, a.s + a.sPlus, a.hw), p2 = at(a, ar, a.s + a.sPlus, a.hw + a.walk);
        const p5 = at(b, br, b.s + b.sMinus, -b.hw), p4 = at(b, br, b.s + b.sMinus, -(b.hw + b.walk));
        const poly = [p1, p2, p4, p5].map((p) => [p[0], yk, p[1]]);
        sortAround(poly, (p1[0] + p4[0]) / 2, (p1[1] + p4[1]) / 2);
        g.fan(poly, { lay: L.sidewalk, tint: T.walk, scale: 14 });
        if (Math.hypot(p1[0] - p5[0], p1[1] - p5[1]) > 0.5) {
          let nx = -(p5[1] - p1[1]), nz = p5[0] - p1[0]; const l = Math.hypot(nx, nz); nx /= l; nz /= l;
          if ((n.x - p1[0]) * nx + (n.z - p1[1]) * nz < 0) { nx = -nx; nz = -nz; }
          faceOut(g, [p1[0], n.y, p1[1]], [p5[0], n.y, p5[1]], [p5[0], yk, p5[1]], [p1[0], yk, p1[1]], [nx, nz], { lay: L.concrete, tint: T.kerb, scale: 6 });
          const cx = (p1[0] + p4[0]) / 2, cz = (p1[1] + p4[1]) / 2;
          this.phys.add(cx, n.y + KERB / 2, cz, Math.hypot(p1[0] - p5[0], p1[1] - p5[1]) / 2, KERB / 2, a.walk / 2, Math.atan2(p5[0] - p1[0], p5[1] - p1[1]) + Math.PI / 2, 'concrete', { kerb: true, noBlock: true });
        }
      }
    }
    // crosswalks for people (across each arm's mouth) at junctions with sidewalks
    if (arms.length >= 3) {
      for (const a of arms) {
        if (!a.walk) continue;
        const rx = -a.u[1], rz = a.u[0], d = a.s + 4.5;
        this.crossings.push({ ax: n.x + a.u[0] * d - rx * (a.hw + a.walk / 2), az: n.z + a.u[1] * d - rz * (a.hw + a.walk / 2), bx: n.x + a.u[0] * d + rx * (a.hw + a.walk / 2), bz: n.z + a.u[1] * d + rz * (a.hw + a.walk / 2), y: n.y + KERB, node: n.id, edge: a.edge.id });
      }
    }
  }

  // ---- street lamps and traffic lights ----
  _lampsAndSignals() {
    const L = this.L;
    // lamps: a pole, an arm and a head, merged into the chunk buffers; the head glows at night
    for (const p of this.lamps) {
      const g = this.C.get('surf', p.x, p.z);
      const H = 21;
      g.box(p.x, p.y + H / 2, p.z, 0.35, H / 2, 0.35, 0, { lay: L.concrete, tint: T.pole, scale: 8, top: false });
      const hx = p.x + p.ax * 5.2, hz = p.z + p.az * 5.2, head = Math.atan2(p.ax, p.az);
      g.box(p.x + p.ax * 2.6, p.y + H - 0.4, p.z + p.az * 2.6, 0.18, 0.18, 2.8, head, { lay: L.concrete, tint: T.pole, scale: 8 });
      g.box(hx, p.y + H - 0.55, hz, 0.9, 0.3, 1.6, head, { lay: L.concrete, tint: T.pole, scale: 8, top: true, bottom: false });
      // the glowing lens underneath
      const c = Math.cos(head), s = Math.sin(head);
      const Q = (x, z) => [hx + x * c + z * s, p.y + H - 0.86, hz - x * s + z * c];
      g.quad(Q(0.8, -1.4), Q(-0.8, -1.4), Q(-0.8, 1.4), Q(0.8, 1.4), { lay: L.whiteTiles, tint: T.head, scale: 4, glow: 1, rough: 0.3 });
      fixDown(g);
      this.phys.add(p.x, p.y + H / 2, p.z, 0.4, H / 2, 0.4, 0, 'metal', { pole: true, lamp: true });
    }
    // light pools on the ground at night
    this._pools();
    // traffic lights at the junctions that have them
    const nodes = this.plan.nodes.filter((n) => n.light);
    this.lightNodes = nodes;
    let k = 0;
    const heads = [];
    for (const n of nodes) {
      const J = this.junction[n.id];
      n.lightOffset = ((n.x * 0.013 + n.z * 0.007) % CYCLE + CYCLE) % CYCLE;
      for (const a of J.arms) {
        if (a.edge.elevated) continue;
        const rx = -a.u[1], rz = a.u[0];
        // a pole on the near-right corner for traffic arriving along this arm, and a mast arm over its lanes
        const px = n.x + a.u[0] * (a.s + 2) - rx * (a.hw + 2.2), pz = n.z + a.u[1] * (a.s + 2) - rz * (a.hw + 2.2);
        const g = this.C.get('surf', px, pz), y = n.y + KERB;
        g.box(px, y + 10, pz, 0.5, 10, 0.5, 0, { lay: L.concrete, tint: T.pole, scale: 8, top: false });
        const reach = a.hw + 1.5, mx = px + rx * reach / 2, mz = pz + rz * reach / 2;
        g.box(mx, y + 19.2, mz, 0.3, 0.3, reach / 2, Math.atan2(rx, rz), { lay: L.concrete, tint: T.pole, scale: 8 });
        this.phys.add(px, y + 10, pz, 0.6, 10, 0.6, 0, 'metal', { pole: true });
        // one signal head over each incoming lane (arriving traffic is on the -r side of the arm)
        const lanes = a.edge.R.lanes, lw = a.edge.R.lane, med = a.edge.R.median;
        const heading = Math.atan2(a.u[0], a.u[1]); // facing out along the arm, towards the drivers
        for (let l = 0; l < lanes; l++) {
          const off = -(med / 2 + lw * (l + 0.5));
          const hx = n.x + a.u[0] * (a.s + 2) + rx * off, hz = n.z + a.u[1] * (a.s + 2) + rz * off;
          g.box(hx, y + 17, hz, 0.8, 2.3, 0.6, heading, { lay: L.concrete, tint: T.signal, scale: 4 });
          heads.push({ n, arm: a, x: hx + a.u[0] * 0.65, y: y + 17, z: hz + a.u[1] * 0.65, heading });
        }
      }
    }
    // the lamps of the signals: one instanced mesh, three discs per head
    const disc = new THREE.CircleGeometry(0.55, 12);
    const mat = new THREE.MeshBasicMaterial({ toneMapped: false });
    const im = new THREE.InstancedMesh(disc, mat, heads.length * 3);
    const m4 = new THREE.Matrix4(), q = new THREE.Quaternion(), sc = new THREE.Vector3(1, 1, 1), pos = new THREE.Vector3();
    heads.forEach((h, i) => {
      q.setFromAxisAngle(new THREE.Vector3(0, 1, 0), h.heading);
      for (let j = 0; j < 3; j++) {
        pos.set(h.x, h.y + 1.45 - j * 1.45, h.z);
        m4.compose(pos, q, sc);
        im.setMatrixAt(i * 3 + j, m4);
        im.setColorAt(i * 3 + j, new THREE.Color(0x111111));
      }
    });
    im.frustumCulled = false;
    this.signalMesh = im; this.heads = heads;
    this.group.add(im);
    this.signalStates = new Map(); // head index -> last state
  }

  _pools() {
    const n = this.lamps.length;
    const pos = new Float32Array(n * 4 * 3), uv = new Float32Array(n * 4 * 2), idx = new Uint32Array(n * 6);
    let v = 0, o = 0;
    for (const p of this.lamps) {
      const cx = p.x + p.ax * 5.2, cz = p.z + p.az * 5.2, r = 15, y = p.y + 0.12;
      const base = v;
      for (const [dx, dz, u, w] of [[-r, -r, 0, 0], [r, -r, 1, 0], [r, r, 1, 1], [-r, r, 0, 1]]) { pos[v * 3] = cx + dx; pos[v * 3 + 1] = y; pos[v * 3 + 2] = cz + dz; uv[v * 2] = u; uv[v * 2 + 1] = w; v++; }
      idx[o++] = base; idx[o++] = base + 2; idx[o++] = base + 1; idx[o++] = base; idx[o++] = base + 3; idx[o++] = base + 2;
    }
    const g = new THREE.BufferGeometry();
    g.setAttribute('position', new THREE.BufferAttribute(pos, 3)); g.setAttribute('uv', new THREE.BufferAttribute(uv, 2)); g.setIndex(new THREE.BufferAttribute(idx, 1));
    g.computeBoundingSphere();
    const mat = new THREE.ShaderMaterial({
      uniforms: { glow: this.glow },
      vertexShader: 'varying vec2 vUv; void main(){ vUv = uv; gl_Position = projectionMatrix * modelViewMatrix * vec4(position, 1.0); }',
      fragmentShader: 'uniform float glow; varying vec2 vUv; void main(){ float d = length(vUv - 0.5) * 2.0; float a = pow(max(0.0, 1.0 - d), 2.2) * glow * 0.55; gl_FragColor = vec4(vec3(1.0, 0.78, 0.48) * a, 1.0); }',
      transparent: true, depthWrite: false, blending: THREE.AdditiveBlending, polygonOffset: true, polygonOffsetFactor: -4, polygonOffsetUnits: -4,
    });
    const m = new THREE.Mesh(g, mat);
    m.renderOrder = 3; m.frustumCulled = false;
    this.pools = m;
    this.group.add(m);
  }

  // ---- traffic lights ----
  /** The light for traffic arriving at node `nodeId` along edge `edgeId`. */
  lightState(nodeId, edgeId) {
    const n = this.plan.nodes[nodeId];
    if (!n || !n.light) return 'green';
    const J = this.junction[nodeId], a = J.arms.find((x) => x.edge.id === edgeId);
    if (!a) return 'green';
    return phaseFor(a, ((this.time || 0) + n.lightOffset) % CYCLE);
  }

  update(dt, cam) {
    this.time = (this.time || 0) + dt;
    const night = V.sky?.state?.lamps ?? V.sky?.state?.night ?? 0;
    this.glow.value = night;
    // signal colours (only the ones that changed)
    const im = this.signalMesh;
    if (!im) return;
    let dirty = false;
    for (let i = 0; i < this.heads.length; i++) {
      const h = this.heads[i];
      const s = phaseFor(h.arm, (this.time + h.n.lightOffset) % CYCLE);
      if (this.signalStates.get(i) === s) continue;
      this.signalStates.set(i, s);
      im.setColorAt(i * 3, s === 'red' ? RED : OFF);
      im.setColorAt(i * 3 + 1, s === 'yellow' ? AMBER : OFF);
      im.setColorAt(i * 3 + 2, s === 'green' ? GREEN : OFF);
      dirty = true;
    }
    if (dirty) im.instanceColor.needsUpdate = true;
  }
}

const RED = new THREE.Color(3.2, 0.12, 0.08), AMBER = new THREE.Color(3.0, 1.5, 0.1), GREEN = new THREE.Color(0.15, 3.0, 1.1), OFF = new THREE.Color(0.05, 0.05, 0.05);

/** East-west arms go first, north-south second. */
function phaseFor(arm, t) {
  const ew = Math.abs(arm.u[0]) > Math.abs(arm.u[1]);
  const tt = ew ? t : (t + CYCLE / 2) % CYCLE;
  return tt < 11.5 ? 'green' : tt < 14.5 ? 'yellow' : 'red';
}

// ---- line helpers ----
/** Points along a polyline between distances d0 and d1, each with the tangent and the right vector. */
function sampleLine(pts, d0, d1) {
  const out = [];
  const at = (d) => pointAt(pts, d);
  out.push(at(d0));
  for (const p of pts) if (p.d > d0 + 0.5 && p.d < d1 - 0.5) out.push(at(p.d));
  out.push(at(d1));
  return out;
}
export function pointAt(pts, d) {
  let i = 1;
  while (i < pts.length - 1 && pts[i].d < d) i++;
  const a = pts[i - 1], b = pts[i], L = b.d - a.d || 1, t = Math.min(1, Math.max(0, (d - a.d) / L));
  let tx = (b.x - a.x) / L, tz = (b.z - a.z) / L;
  // at an interior point use the average direction (mitred joints)
  if (t > 0.999 && i < pts.length - 1) { const c = pts[i + 1], L2 = c.d - b.d || 1; tx = (tx + (c.x - b.x) / L2) / 2; tz = (tz + (c.z - b.z) / L2) / 2; }
  else if (t < 0.001 && i > 1) { const c = pts[i - 2], L2 = a.d - c.d || 1; tx = (tx + (a.x - c.x) / L2) / 2; tz = (tz + (a.z - c.z) / L2) / 2; }
  const l = Math.hypot(tx, tz) || 1; tx /= l; tz /= l;
  return { x: a.x + (b.x - a.x) * t, y: a.y + (b.y - a.y) * t, z: a.z + (b.z - a.z) * t, d, tx, tz, rx: -tz, rz: tx };
}
function lerpS(a, b, t) {
  return { x: a.x + (b.x - a.x) * t, y: a.y + (b.y - a.y) * t, z: a.z + (b.z - a.z) * t, d: a.d + (b.d - a.d) * t, tx: a.tx, tz: a.tz, rx: a.rx, rz: a.rz };
}
/** Where arm a's line at offset oa meets arm b's line at offset ob (offsets along each arm's right vector). */
function lineX(n, a, oa, b, ob) {
  const ar = [-a.u[1], a.u[0]], br = [-b.u[1], b.u[0]];
  const p = [n.x + ar[0] * oa, n.z + ar[1] * oa], q = [n.x + br[0] * ob, n.z + br[1] * ob];
  const den = a.u[0] * b.u[1] - a.u[1] * b.u[0];
  if (Math.abs(den) < 1e-6) return null;
  const t = ((q[0] - p[0]) * b.u[1] - (q[1] - p[1]) * b.u[0]) / den;
  return [p[0] + a.u[0] * t, p[1] + a.u[1] * t];
}
function sortAround(poly, cx, cz) { poly.sort((p, q) => Math.atan2(p[2] - cz, p[0] - cx) - Math.atan2(q[2] - cz, q[0] - cx)); }
/** Make the last quad of g face up (swap its winding if needed). */
function fixUp(g) { flipIf(g, (ny) => ny < 0); }
function fixDown(g) { flipIf(g, (ny) => ny > 0); }
function flipIf(g, test) {
  const n = g.idx.length, i0 = g.idx[n - 6], i1 = g.idx[n - 5], i2 = g.idx[n - 4];
  const P = g.pos;
  const ax = P[i1 * 3] - P[i0 * 3], ay = P[i1 * 3 + 1] - P[i0 * 3 + 1], az = P[i1 * 3 + 2] - P[i0 * 3 + 2];
  const bx = P[i2 * 3] - P[i0 * 3], by = P[i2 * 3 + 1] - P[i0 * 3 + 1], bz = P[i2 * 3 + 2] - P[i0 * 3 + 2];
  const ny = az * bx - ax * bz;
  if (!test(ny)) return;
  // swap the triangles' winding
  for (let k = n - 6; k < n; k += 3) { const t = g.idx[k + 1]; g.idx[k + 1] = g.idx[k + 2]; g.idx[k + 2] = t; }
  // and the normals
  for (let k = g.nor.length - 12; k < g.nor.length; k++) g.nor[k] = -g.nor[k];
}
/** A vertical-ish quad whose front faces direction (nx, nz). */
function faceOut(g, a, b, c, d, [nx, nz], o) {
  g.quad(a, b, c, d, o);
  const n = g.idx.length, i0 = g.idx[n - 6], i1 = g.idx[n - 5], i2 = g.idx[n - 4], P = g.pos;
  const ax = P[i1 * 3] - P[i0 * 3], ay = P[i1 * 3 + 1] - P[i0 * 3 + 1], az = P[i1 * 3 + 2] - P[i0 * 3 + 2];
  const bx = P[i2 * 3] - P[i0 * 3], by = P[i2 * 3 + 1] - P[i0 * 3 + 1], bz = P[i2 * 3 + 2] - P[i0 * 3 + 2];
  const cx = ay * bz - az * by, cz = ax * by - ay * bx;
  if (cx * nx + cz * nz < 0) {
    for (let k = n - 6; k < n; k += 3) { const t = g.idx[k + 1]; g.idx[k + 1] = g.idx[k + 2]; g.idx[k + 2] = t; }
    for (let k = g.nor.length - 12; k < g.nor.length; k++) g.nor[k] = -g.nor[k];
  }
}

// ---- the asphalt shader: photo asphalt, wear, lane markings, crosswalks and stop lines ----
function asphaltMaterial(tex, L) {
  const mat = new THREE.MeshStandardMaterial({ color: 0xffffff, roughness: 0.9, metalness: 0, polygonOffset: true, polygonOffsetFactor: -1, polygonOffsetUnits: -2 });
  const uni = { tCol: tex.col, tNor: tex.nor, wet: { value: 0 }, layA: { value: L.asphalt }, layW: { value: L.asphaltWorn } };
  mat.onBeforeCompile = (sh) => {
    Object.assign(sh.uniforms, uni);
    sh.vertexShader = sh.vertexShader
      .replace('#include <common>', '#include <common>\nattribute vec4 lay; attribute vec4 info;\nvarying vec4 vInfo; varying vec2 vSuv; varying vec3 vWp; varying float vLanes;')
      .replace('#include <begin_vertex>', `#include <begin_vertex>
vInfo = info; vSuv = uv; vLanes = lay.y; vWp = (modelMatrix * vec4(transformed, 1.0)).xyz;`);
    sh.fragmentShader = sh.fragmentShader
      .replace('#include <common>', `#include <common>
precision highp sampler2DArray;
uniform sampler2DArray tCol, tNor; uniform float wet, layA, layW;
varying vec4 vInfo; varying vec2 vSuv; varying vec3 vWp; varying float vLanes;
vec3 aNrm; float aPaint;
${TBN_GLSL}
float band(float x, float c, float w) { float fw = fwidth(x) * 0.75 + 1e-4; return smoothstep(c - w - fw, c - w + fw, x) - smoothstep(c + w - fw, c + w + fw, x); }
float h21(vec2 p) { return fract(sin(dot(p, vec2(127.1, 311.7))) * 43758.5453); }
float vnoise(vec2 p) { vec2 i = floor(p), f = fract(p); f = f * f * (3.0 - 2.0 * f); return mix(mix(h21(i), h21(i + vec2(1, 0)), f.x), mix(h21(i + vec2(0, 1)), h21(i + vec2(1, 1)), f.x), f.y); }`)
      .replace('#include <map_fragment>', `{
  vec3 c1 = texture(tCol, vec3(vSuv, layA)).rgb;
  vec3 c2 = texture(tCol, vec3(vSuv * 0.7 + 0.31, layW)).rgb;
  aNrm = texture(tNor, vec3(vSuv, layA)).xyz * 2.0 - 1.0;
  float patchy = smoothstep(0.55, 0.75, vnoise(vWp.xz / 37.0)) * 0.7;
  vec3 col = mix(c1 * vec3(0.92, 0.93, 0.97), c2 * 0.62, patchy * 0.5);
  col *= 0.86 + 0.14 * vnoise(vWp.xz / 5.0);
  // markings
  float u = vInfo.x, d = vInfo.y, len = vInfo.z, fl = floor(vInfo.w + 0.5);
  float packed = floor(vLanes + 0.5);
  float lanes = mod(packed, 16.0), med = mod(floor(packed / 16.0), 16.0), lw = floor(packed / 256.0);
  float paint = 0.0; vec3 pc = vec3(0.95, 0.95, 0.92);
  bool junction = fl >= 127.5;
  if (!junction && len > 0.0) {
    float au = abs(u), mh = med * 0.5;
    float hwy = mod(floor(fl / 4.0), 2.0), hasMed = mod(floor(fl / 8.0), 2.0), park = mod(floor(fl / 16.0), 2.0);
    float cwA = mod(fl, 2.0), cwB = mod(floor(fl / 2.0), 2.0);
    float edgeHalf = mh + lw * lanes;
    // centre: double yellow without a median, single yellow lines along a median
    float yel = 0.0;
    if (hasMed < 0.5) yel = band(au, 0.55, 0.16) ; else yel = band(au, mh + 0.55, 0.18);
    // lane lines: dashed white
    float dash = step(fract(d / 14.0), 0.42);
    float ln = 0.0;
    for (int k = 1; k < 3; k++) { if (float(k) < lanes) ln = max(ln, band(au, mh + lw * float(k), 0.17) * dash); }
    // edge lines (not on small streets, which have parking instead)
    float edge = (park < 0.5) ? band(au, edgeHalf - 0.9, 0.2) : 0.0;
    // near the junctions: crosswalks and stop lines (no centre dashes inside the crosswalk)
    float cw = 0.0, stop = 0.0;
    if (cwA > 0.5 && d < 9.5) { cw = step(1.2, d) * step(fract(u / 2.4), 0.5); }
    if (cwB > 0.5 && d > len - 9.5) { cw = max(cw, step(d, len - 1.2) * step(fract(u / 2.4), 0.5)); }
    if (cwA > 0.5) stop = max(stop, band(d, 11.0, 0.45) * step(u, -mh) * step(-edgeHalf, u));
    if (cwB > 0.5) stop = max(stop, band(d, len - 11.0, 0.45) * step(mh, u) * step(u, edgeHalf));
    float inCw = (cwA > 0.5 && d < 9.5) || (cwB > 0.5 && d > len - 9.5) ? 1.0 : 0.0;
    yel *= 1.0 - inCw; ln *= 1.0 - inCw;
    paint = max(max(ln, edge), max(cw, stop));
    if (yel > 0.01 && hwy < 0.5) { pc = mix(pc, vec3(0.98, 0.74, 0.12), yel / max(yel + paint, 1e-3)); paint = max(paint, yel); }
    if (hwy > 0.5) paint = max(paint, yel * 0.0);
    // tyre-darkened lanes
    float lc = mod(au - mh, lw) / lw;
    col *= 1.0 - 0.07 * (smoothstep(0.15, 0.3, lc) - smoothstep(0.3, 0.45, lc) + smoothstep(0.55, 0.7, lc) - smoothstep(0.7, 0.85, lc));
  }
  // worn paint
  float wear = smoothstep(0.3, 0.8, vnoise(vWp.xz / 2.3));
  paint *= 0.85 - 0.35 * wear;
  aPaint = paint;
  col = mix(col, pc, paint);
  diffuseColor.rgb *= col;
}`)
      .replace('#include <roughnessmap_fragment>', 'float roughnessFactor = mix(0.82, 0.55, aPaint); roughnessFactor = mix(roughnessFactor, 0.2, wet);')
      .replace('#include <normal_fragment_maps>', `#include <normal_fragment_maps>
{ mat3 tbn = vcTBN(normal, -vViewPosition, vSuv); normal = normalize(tbn * vec3(aNrm.xy * (0.55 - aPaint * 0.4), aNrm.z)); }`);
  };
  mat.customProgramCacheKey = () => 'vc-asphalt';
  mat.userData.uni = uni;
  return mat;
}
