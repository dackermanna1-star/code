// Traffic: AI drivers on the road graph. Cars keep to their lane on the
// right and drive a curved path through each junction (from their lane into
// the right lane of the next road), stop for red lights, give way to oncoming
// traffic when turning left and to whoever is already in an unsignalled
// junction, follow the car in front, brake for people in the road, honk,
// pull round stalled cars and back out when they're physically blocked.
// Cars that stay stuck out of sight are quietly removed. Everything lives in
// a ring around the camera: spawned out of sight, let go when far away; the
// expressway gets its own share. Parked cars line the streets.
//
//   V.traffic = new Traffic()
//   route(fromX, fromZ, toX, toZ) -> {pts, edges, nodes, len} | null   (A* on the road graph)
//   drivers: Map veh -> AI state      count()      update(dt)      stats {ms, stuck, removed}
//   panic(pos, r)  every driver near pos flees (gunshots, explosions)
// A driver is a small object (isAI) until a Peds system gives cars real
// drivers: it answers exitVehicle(), knock(), flee() like a ped would.
//
// Driving model: an AI's position is a distance X along its "path": the lane
// of its edge up to the junction entry (entryS), then a quadratic Bezier
// through the junction (curve), then the chosen lane of the next edge. It
// steers at a point `look` studs further along that path (pure pursuit).
import * as THREE from 'three';
import { V } from '../state.js';
import { MIX } from './vehicles.js';
import { route, nearestEdge } from '../core/route.js';

const RING_IN = 210, RING_OUT = 580, DROP = 780;
const MAX_CARS = 46, MAX_PARKED = 40;
const TURN_LEG = 14;          // shortest Bezier leg (studs): about a car's turning circle
const _v = new THREE.Vector3(), _dir = new THREE.Vector3();
const _near = [];
const _pt = { x: 0, y: 0, z: 0 }, _pt2 = { x: 0, y: 0, z: 0 };

function pickMix(mix, r) {
  let t = 0; for (const k in mix) t += mix[k];
  let x = r * t; for (const k in mix) { x -= mix[k]; if (x <= 0) return k; }
  return Object.keys(mix)[0];
}
const PAINT = ['#d9d9d6', '#1f1f22', '#8c1d1d', '#1d3f8c', '#e8e2c8', '#3c6e47', '#c26a1b', '#6e6e72', '#f2b6c6', '#7fd1d6', '#f4e04d', '#b0b3b8'];

/** The stand-in driver of an AI car (until real peds drive). */
class Driver {
  constructor(T, veh) { this.T = T; this.veh = veh; this.isAI = true; this.team = 'civ'; this.kind = 'civ'; this.hp = 100; this.dead = false; }
  exitVehicle() { const v = this.veh; if (v && v.driver === this) v.driver = null; this.T._release(v, true); V.peds?.fromDriver?.(this, v); }
  knock(vel) { V.peds?.knockDriver?.(this, vel); }
  flee() {}
  hit(dmg, part, dir, attacker) { this.killer = attacker; this.hp -= dmg; if (this.hp <= 0 && !this.dead) { this.dead = true; const v = this.veh; if (v) { v.driver = null; this.T._release(v, true); } } }
}

export class Traffic {
  constructor() {
    this.drivers = new Map();   // veh -> ai
    this.parked = new Set();
    this.loose = new Set();     // cars their drivers abandoned (fled, pulled out, shot)
    this.t = 0; this.spawnT = 0;
    this.rng = 1;
    this.offs = [];
    this.busy = new Map();      // unsignalled node -> {veh, t} (who is crossing it now)
    this.stats = { ms: 0, stuck: 0, removed: 0 };
    this.hwy = null;
  }
  ready() {
    const on = (n, f) => this.offs.push(V.events.on(n, f));
    on('noise', (e) => { if (e.kind === 'shot' || e.kind === 'explosion') this.panic(e.pos, e.r || 200); });
    on('vehicle:enter', (e) => { if (e.who?.isPlayer) { this.parked.delete(e.veh); this._release(e.veh, false); } });
  }
  rand() { this.rng = (this.rng * 16807) % 2147483647; return this.rng / 2147483647; }
  count() { return this.drivers.size; }
  route(ax, az, bx, bz) { return route(V.plan, ax, az, bx, bz); }

  panic(pos, r) {
    for (const ai of this.drivers.values()) if (ai.veh.pos.distanceTo(pos) < r) { ai.panic = 8 + Math.random() * 6; }
  }

  update(dt) {
    if (!V.vehicles?.list || !V.plan) return;
    const t0 = performance.now();
    this.t += dt;
    const cam = V.world.camera.position;
    // spawn and drop, a few times a second
    if ((this.spawnT -= dt) <= 0) {
      this.spawnT = 0.25;
      const ne = nearestEdge(V.plan, cam.x, cam.z, 60);
      this.onHwy = !!ne && ne.edge.cls === 'hwy' && ne.d < 40;
      this._cull(cam);
      if (this.drivers.size < this._want(cam)) this._spawn(cam);
      if (this.parked.size < MAX_PARKED) this._park(cam);
    }
    for (const ai of this.drivers.values()) this._drive(ai, dt);
    this.stats.ms = this.stats.ms * 0.9 + (performance.now() - t0) * 0.1;
  }

  _want(cam) {
    const D = V.plan.districtAt(cam.x, cam.z);
    const h = V.time?.hour ?? 12, rush = (h > 7 && h < 10) || (h > 16 && h < 20) ? 1.2 : h > 1 && h < 6 ? 0.45 : 1;
    const busy = D ? 0.6 + (D.peds ?? 0.5) * 0.6 : 0.85;
    return Math.round(MAX_CARS * Math.min(1, busy * rush) * (V.settings?.quality === 'low' ? 0.6 : 1));
  }

  _visible(x, y, z) {
    const cam = V.world.camera;
    _v.set(x - cam.position.x, y - cam.position.y, z - cam.position.z);
    const d = _v.length();
    cam.getWorldDirection(_dir);
    return _v.dot(_dir) / d > 0.55 && d < 900;
  }

  /** A spot to spawn on: usually the road nearest a random point in the ring; sometimes the expressway. */
  _spot(cam) {
    const P = V.plan;
    if (!this.hwy) this.hwy = P.edges.filter((e) => e.cls === 'hwy');
    if (this.hwy.length && this.rand() < (this.onHwy ? 0.7 : 0.3)) {
      // the expressway: a point along it, in the ring, ahead of or behind where the camera is level with it
      // (its edges are kilometres long: the nearest-road search rarely lands on them)
      const e = this.hwy[Math.floor(this.rand() * this.hwy.length)];
      const cs = projectS(e, cam.x, cam.z, 1);
      const s = cs + (this.rand() < 0.6 ? 1 : -1) * (RING_IN + this.rand() * (RING_OUT - RING_IN));
      if (s < 40 || s > e.len - 40) return null;
      const p = pointOn(e, s);
      const d = Math.hypot(p.x - cam.x, p.z - cam.z);
      if (d > RING_IN && d < RING_OUT) return { edge: e, along: s, hwy: true };
      return null;
    }
    const ang = this.rand() * Math.PI * 2, rad = RING_IN + this.rand() * (RING_OUT - RING_IN);
    return nearestEdge(P, cam.x + Math.cos(ang) * rad, cam.z + Math.sin(ang) * rad, 160);
  }

  _spawn(cam) {
    const P = V.plan;
    for (let tries = 0; tries < 12; tries++) {
      const ne = this._spot(cam);
      if (!ne) continue;
      const e = ne.edge;
      if (e.len < 50 || !this._clear(e)) continue;
      // not on a dead-end stub
      if ((P.nodes[e.a].edges.length === 1 || P.nodes[e.b].edges.length === 1) && e.len < 200) continue;
      const s = Math.min(e.len - 15, Math.max(15, ne.along));
      const p = pointOn(e, s);
      const d = Math.hypot(p.x - cam.x, p.z - cam.z);
      if (d < RING_IN || d > RING_OUT) continue;
      if (this._visible(p.x, p.y, p.z) && d < (ne.hwy ? 420 : 520)) continue;
      const dir = this.rand() < 0.5 ? 1 : -1, lane = Math.floor(this.rand() * e.R.lanes);
      const off = laneOffset(e, lane, dir);
      const tx = p.tx * dir, tz = p.tz * dir, rx = -tz, rz = tx;
      const x = p.x + rx * off, z = p.z + rz * off;
      // room?
      if (V.vehicles.near(x, z, 16, _near).length) continue;
      const type = pickMix(MIX.traffic, this.rand());
      const speed = Math.min(e.R.speed * 0.6, e.cls === 'hwy' ? 70 : 40);
      const veh = V.vehicles.spawn(type, x, z, Math.atan2(tx, tz), { y: p.y, color: PAINT[Math.floor(this.rand() * PAINT.length)], speed });
      if (!veh) return;
      const ai = { veh, e, dir, lane, s: dir > 0 ? s : e.len - s, X: 0, next: null, turn: false, u: 0, stuck: 0, block: 0, rev: 0, revSteer: 0, unstick: 0, lost: 0, swerve: 0, ignore: null, panic: 0, honkT: 0, cruise: 0.78 + this.rand() * 0.3 };
      const drv = new Driver(this, veh); ai.driver = drv;
      veh.driver = drv;
      this._chooseNext(ai);
      this.drivers.set(veh, ai);
      return;
    }
  }

  _park(cam) {
    if (!this.spots) {
      // only the spots on the right of a->b (see laneOffset)
      const P = V.plan;
      this.spots = (V.roads?.parking || []).filter((sp) => {
        const e = P.edges[sp.edge]; if (!e) return false;
        const p = pointOn(e, projectS(e, sp.x, sp.z, 1));
        return (sp.x - p.x) * -p.tz + (sp.z - p.z) * p.tx > 0;
      });
    }
    const spots = this.spots;
    if (!spots.length) return;
    for (let tries = 0; tries < 6; tries++) {
      const sp = spots[Math.floor(this.rand() * spots.length)];
      const d = Math.hypot(sp.x - cam.x, sp.z - cam.z);
      if (d < 140 || d > 520 || (this._visible(sp.x, sp.y, sp.z) && d < 400)) continue;
      if (V.vehicles.near(sp.x, sp.z, 12, _near).length) continue;
      const veh = V.vehicles.spawn(pickMix(MIX.parked, this.rand()), sp.x, sp.z, sp.heading, { y: sp.y, parked: true, color: PAINT[Math.floor(this.rand() * PAINT.length)] });
      if (veh) { veh.trafficParked = true; this.parked.add(veh); }
      return;
    }
  }

  _cull(cam) {
    for (const [veh, ai] of this.drivers) {
      if (veh.removed) { this.drivers.delete(veh); continue; }
      const d = Math.hypot(veh.pos.x - cam.x, veh.pos.z - cam.z);
      const vis = this._visible(veh.pos.x, veh.pos.y, veh.pos.z);
      if ((d > DROP && !vis) || d > DROP * 1.6) { this.drivers.delete(veh); V.vehicles.remove(veh); }
      else if (veh.dead) { this.drivers.delete(veh); this.loose.add(veh); }
      // hopelessly stuck (or lost off the road) and nobody's looking: tidy it away
      else if ((ai.lost > 20 || ai.unstick >= 3 || ai.stuck > 25) && (!vis || d > 300) && d > 70 && !veh.seats.some((w) => w?.isPlayer)) {
        this.drivers.delete(veh); V.vehicles.remove(veh); this.stats.removed++;
      }
    }
    for (const veh of this.parked) {
      if (veh.removed) { this.parked.delete(veh); continue; }
      const d = Math.hypot(veh.pos.x - cam.x, veh.pos.z - cam.z);
      if (d > 700 && !veh.driver && !this._visible(veh.pos.x, veh.pos.y, veh.pos.z)) { this.parked.delete(veh); V.vehicles.remove(veh); }
    }
    for (const veh of this.loose) {
      if (veh.removed || veh.driver || this.drivers.has(veh)) { this.loose.delete(veh); continue; }
      if (veh === V.player?.vehicle) continue;
      const d = Math.hypot(veh.pos.x - cam.x, veh.pos.z - cam.z);
      if (d > 380 && !this._visible(veh.pos.x, veh.pos.y, veh.pos.z)) { this.loose.delete(veh); V.vehicles.remove(veh); }
    }
    for (const [n, b] of this.busy) if (this.t - b.t > 0.5) this.busy.delete(n);
  }

  /** A driver lost their car (got out, was pulled out, died): the car is just a car now. */
  _release(veh, abandoned) {
    const ai = this.drivers.get(veh);
    if (!ai) return;
    this.drivers.delete(veh);
    if (veh.ctl) { veh.ctl.throttle = 0; veh.ctl.brake = abandoned ? 0.3 : 0; veh.ctl.steer = 0; }
    if (abandoned) this.loose.add(veh);   // left in the road: tidied away once nobody's looking
  }

  /** Can cars get along this edge? (false when a building sits across the carriageway: never route into it) */
  _clear(e) {
    const m = this.clearMap || (this.clearMap = new Map());
    let ok = m.get(e.id);
    if (ok !== undefined) return ok;
    ok = true;
    const ph = V.phys, n = Math.max(2, Math.ceil(e.len / 8));
    for (let i = 1; i < n && ok; i++) {
      const p = pointOn(e, (e.len * i) / n, _pt);
      for (const off of [laneOffset(e, 0, 1), -laneOffset(e, 0, -1)]) {
        const x = p.x - p.tz * off, z = p.z + p.tx * off, y = p.y;
        ph.query(x - 1, z - 1, x + 1, z + 1, (b) => {
          if (b.vehicle || b.kerb || b.noBlock || b.pole || b.prop || b.tree || b.solid === false) return;
          if (b.y - b.hy > y + 4.5 || b.y + b.hy < y + 0.8) return;   // overhead (a bridge, an awning) or flat
          const [lx, lz] = ph.local(b, x, z);
          if (Math.abs(lx) < b.hx && Math.abs(lz) < b.hz) { ok = false; return false; }
        });
        if (!ok) break;
      }
    }
    m.set(e.id, ok);
    return ok;
  }

  /** Pick the road after this one (straight on is likelier; never into a dead end if there's a choice), then plan the way through the junction. */
  _chooseNext(ai) {
    const P = V.plan, e = ai.e;
    const nodeId = ai.dir > 0 ? e.b : e.a, n = P.nodes[nodeId];
    const t = endTangent(e, ai.dir);
    let best = null, bw = -Infinity;
    for (const id of n.edges) {
      if (id === e.id) continue;
      const ne = P.edges[id], nd = ne.a === nodeId ? 1 : -1;
      const nt = startTangent(ne, nd);
      const straight = t[0] * nt[0] + t[1] * nt[1];
      if (straight < -0.85) continue;                       // a hairpin back the way we came
      if (!this._clear(ne)) continue;                       // blocked by a building
      const far = P.nodes[nd > 0 ? ne.b : ne.a];
      const deadEnd = far.edges.length === 1;
      const w = straight * 1.2 + this.rand() * 1.6 - (deadEnd ? 6 : 0) - (ne.len < 40 ? 1 : 0) + (ne.cls === 'hwy' ? 0.6 : 0) + (ne.cls === 'blvd' || ne.cls === 'ave' ? 0.2 : 0);
      if (w > bw) { bw = w; best = { e: ne, dir: nd, node: nodeId }; }
    }
    if (!best) best = { e, dir: -ai.dir, node: nodeId, uturn: true };
    ai.next = best;
    this._plan(ai);
  }

  /** The curve through the junction: from our lane's entry point to the chosen lane of the next road. */
  _plan(ai) {
    const e = ai.e, nx = ai.next, J = V.roads?.junction?.[nx.node];
    const t0 = endTangent(e, ai.dir), t1 = startTangent(nx.e, nx.dir);
    const cross = t0[0] * t1[1] - t0[1] * t1[0], dot = t0[0] * t1[0] + t0[1] * t1[1];
    const lanes = nx.e.R.lanes;
    // right turns end in the kerb lane, left turns in the inner lane, straight on keeps its lane
    const outLane = nx.uturn ? ai.lane : cross > 0.35 ? lanes - 1 : cross < -0.35 ? 0 : Math.min(ai.lane, lanes - 1);
    const armIn = J?.arms?.find((a) => a.edge === e)?.s ?? 8, armOut = J?.arms?.find((a) => a.edge === nx.e)?.s ?? 8;
    const C = nx.curve || (nx.curve = { ax: 0, az: 0, ay: 0, ix: 0, iz: 0, bx: 0, bz: 0, by: 0, len: 1, entryS: 0, outS: 0, vTurn: 99, stopS: 0, light: false });
    let sIn = Math.min(e.len * 0.5, armIn + 1), sOut = Math.min(nx.e.len * 0.5, armOut + 1);
    if (nx.uturn) { sIn = Math.min(e.len * 0.5, 16); sOut = sIn; }
    const A = lanePoint(e, ai.dir, ai.lane, e.len - sIn, 0, _pt);
    C.ax = A.x; C.az = A.z; C.ay = A.y;
    const B = lanePoint(nx.e, nx.dir, outLane, sOut, 0, _pt2);
    C.bx = B.x; C.bz = B.z; C.by = B.y;
    if (nx.uturn) {
      // swing out past the end of the road and come back on the other side
      C.ix = (A.x + B.x) / 2 + t0[0] * 18; C.iz = (A.z + B.z) / 2 + t0[1] * 18; C.vTurn = 7;
    } else if (Math.abs(cross) < 0.3 && dot > 0) {
      C.ix = (A.x + B.x) / 2; C.iz = (A.z + B.z) / 2; C.vTurn = 99;
    } else {
      // where the two lane lines meet; the legs at least a turning circle long
      const dx = B.x - A.x, dz = B.z - A.z, den = t0[0] * t1[1] - t0[1] * t1[0];
      let a = (dx * t1[1] - dz * t1[0]) / den;
      const ix = A.x + t0[0] * a, iz = A.z + t0[1] * a;
      let b = (B.x - ix) * t1[0] + (B.z - iz) * t1[1];
      if (!(a > -50 && a < 120 && b > -50 && b < 120)) { a = 0; b = 0; }
      if (a < TURN_LEG) { const m = TURN_LEG - a; C.ax -= t0[0] * m; C.az -= t0[1] * m; sIn += m; a = TURN_LEG; }
      if (b < TURN_LEG) { const m = TURN_LEG - b; C.bx += t1[0] * m; C.bz += t1[1] * m; sOut += m; b = TURN_LEG; }
      C.ix = ix; C.iz = iz;
      const th = Math.acos(Math.max(-1, Math.min(1, dot)));
      const R = Math.min(a, b) / Math.max(0.15, Math.tan(th / 2));
      C.vTurn = Math.max(8, Math.min(40, Math.sqrt(R * 20)));
    }
    C.cross = cross;
    C.outLane = outLane;
    C.entryS = Math.max(0, e.len - sIn);
    C.outS = Math.min(nx.e.len, sOut);
    // arc length
    let L = 0, px = C.ax, pz = C.az;
    for (let i = 1; i <= 8; i++) { bez(C, i / 8, _pt); L += Math.hypot(_pt.x - px, _pt.z - pz); px = _pt.x; pz = _pt.z; }
    C.len = Math.max(1, L);
    // the stop line (~14 studs before the junction mouth), never past the curve's start
    C.stopS = Math.min(C.entryS, e.len - armIn - 14);
    C.light = !!V.plan.nodes[nx.node]?.light;
  }

  /** The point `X` studs along this driver's path (lane, curve, next lane), with a sideways offset in the lanes. */
  _pathPoint(ai, X, out) {
    const C = ai.next.curve;
    if (X <= C.entryS) return lanePoint(ai.e, ai.dir, ai.lane, X, ai.swerve, out);
    const r = X - C.entryS;
    if (r <= C.len) { bez(C, r / C.len, out); out.y = C.ay + (C.by - C.ay) * (r / C.len); return out; }
    const nx = ai.next;
    return lanePoint(nx.e, nx.dir, C.outLane, Math.min(nx.e.len, C.outS + r - C.len), 0, out);
  }

  /** Into the next road: the curve is done. */
  _advance(ai) {
    const nx = ai.next, C = nx.curve;
    ai.e = nx.e; ai.dir = nx.dir; ai.lane = C.outLane;
    ai.turn = false; ai.u = 0; ai.swerve = 0; ai.ignore = null;
    ai.s = projectS(ai.e, ai.veh.pos.x, ai.veh.pos.z, ai.dir, C.outS);
    this._chooseNext(ai);
  }

  _drive(ai, dt) {
    const veh = ai.veh, c = veh.ctl;
    if (!veh.driver || veh.driver !== ai.driver || veh.dead) { this._release(veh, true); return; }
    if (!ai.next) this._chooseNext(ai);
    let C = ai.next.curve;
    // where are we along the path
    if (!ai.turn) {
      ai.s = projectS(ai.e, veh.pos.x, veh.pos.z, ai.dir, ai.s);
      ai.X = ai.s;
    } else {
      // progress along the curve (only forwards)
      let bu = ai.u, bd = Infinity;
      for (let i = 0; i <= 10; i++) {
        const u = Math.min(1, ai.u + i * 0.05);
        bez(C, u, _pt);
        const d = (_pt.x - veh.pos.x) ** 2 + (_pt.z - veh.pos.z) ** 2;
        if (d < bd) { bd = d; bu = u; }
      }
      ai.u = bu;
      ai.X = C.entryS + bu * C.len;
      if (bu >= 0.97) { this._advance(ai); C = ai.next.curve; ai.s = Math.max(ai.s, 0); ai.X = ai.s; }
    }
    // how far off our path are we (crashes, being pushed): lost for long = tidy away
    const nodeId = ai.next.node;
    const speed = veh.speed || 0, aspd = Math.abs(speed);
    const toEntry = C.entryS - ai.X;
    // traffic lights (only before the curve; once in, carry on)
    const light = ai.panic > 0 || ai.turn ? 'green' : C.light ? (V.roads?.lightState?.(nodeId, ai.e.id) || 'green') : 'green';
    const stopAt = C.stopS - ai.X;
    // in the junction now?
    if (!ai.turn && toEntry <= 0.5 && (light === 'green' || stopAt < -1.5)) {
      ai.turn = true; ai.u = 0;
    }
    // the point to aim for (shorter look-ahead in the turn, so we follow the curve)
    const look = ai.turn ? 5 + aspd * 0.3 : 8 + aspd * 0.42;
    const tgt = this._pathPoint(ai, ai.X + look, _pt);
    const h = veh.heading ?? 0;
    const want = Math.atan2(tgt.x - veh.pos.x, tgt.z - veh.pos.z);
    let da = want - h; da = Math.atan2(Math.sin(da), Math.cos(da));
    const steer = Math.max(-1, Math.min(1, -da * 2.2));
    // how fast: the road's limit, slower into turns, stop for lights, cars and people
    let vmax = ai.e.R.speed * ai.cruise * (ai.panic > 0 ? 1.35 : 1);
    if (ai.turn) vmax = Math.min(vmax, ai.u < 0.7 ? C.vTurn : C.vTurn + (ai.u - 0.7) * 40);
    else vmax = Math.min(vmax, Math.sqrt(C.vTurn * C.vTurn + 2 * 28 * Math.max(0, toEntry)));
    if (light !== 'green' && stopAt > -1.5) {
      const canStop = speed * speed / (2 * 40) < stopAt + 2 || light === 'red';
      if (canStop) vmax = Math.min(vmax, Math.max(0, stopAt * 0.9));
    }
    // give way: turning left across oncoming traffic, or someone's already in an unsignalled junction
    if (ai.panic <= 0 && (toEntry < 14 && (!ai.turn || ai.u < 0.25))) {
      let wait = false;
      if (!C.light && !ai.turn) { const b = this.busy.get(nodeId); if (b && b.veh !== veh && this.t - b.t < 0.25) wait = true; }
      if (!wait && C.cross < -0.35) wait = this._oncoming(veh, h);
      if (wait) vmax = Math.min(vmax, ai.turn ? 0 : Math.max(0, toEntry * 0.8));
    }
    if (ai.turn && !C.light) this.busy.set(nodeId, { veh, t: this.t });
    // the car (or person, or player) ahead
    const gap = this._gapAhead(veh, h, ai);
    ai.blk = this._blocker;
    if (gap < Infinity) vmax = Math.min(vmax, Math.max(0, (gap - 8) * 0.9));
    // controls
    const err = vmax - speed;
    c.throttle = err > 0 && vmax > 1 ? Math.min(1, err / 12 + 0.15) : 0;
    c.brake = err < -2 ? Math.min(1, -err / 15) : vmax < 0.5 ? 1 : 0;
    c.steer = steer;
    c.handbrake = false;
    // stuck behind something that won't move: honk, then pull round it
    if (aspd < 1 && vmax < 3 && light === 'green' && this._blocker) ai.stuck += dt; else ai.stuck = Math.max(0, ai.stuck - dt * 2);
    if (ai.stuck > 2.5 && (ai.honkT -= dt) <= 0) { ai.honkT = 2 + Math.random() * 3; veh.horn?.(true); setTimeout(() => veh.horn?.(false), 400); }
    const blk = this._blocker;
    if (ai.stuck > (blk?.def ? 5 : 8) && blk && !ai.ignore && this._stalled(blk)) {
      // round it: into the next lane over (or the oncoming one on a single-lane street); in a junction, nudge past
      if (!ai.turn) ai.swerve = -(ai.e.R.lane || 13);
      ai.ignore = blk; ai.swerveT = 7; ai.stuck = 0;
    }
    if (ai.ignore) {
      ai.swerveT -= dt;
      if (aspd > (ai.turn ? 7 : 16)) c.throttle = 0;
      const ig = ai.ignore;
      const past = ig.removed || ((ig.pos.x - veh.pos.x) * Math.sin(h) + (ig.pos.z - veh.pos.z) * Math.cos(h)) < -((ig.size?.l || 12) / 2 + 9);
      if (past || ai.swerveT <= 0) { ai.swerve = 0; ai.ignore = null; }
    }
    // physically blocked (a kerb, a pole, a wall, a wreck): wanting to go but not going. Back out and try again.
    if (ai.rev > 0) {
      ai.rev -= dt;
      c.throttle = -0.7; c.brake = 0; c.steer = ai.revSteer;
      if (ai.rev <= 0) ai.block = 0;
    } else {
      if (c.throttle > 0.12 && vmax > 3 && aspd < 1.2) ai.block += dt; else ai.block = Math.max(0, ai.block - dt * 2);
      if (ai.block > 1.5) {
        ai.rev = 1.3 + Math.random() * 0.6; ai.revSteer = -Math.sign(steer || 1) * 0.8; ai.unstick++;
        ai.block = 0;
      }
      if (aspd > 6) ai.unstick = Math.max(0, ai.unstick - dt * 0.2);
    }
    // off the road for long (pushed into a park, the sea...)
    const tgt2 = this._pathPoint(ai, ai.X, _pt2);
    const off = Math.hypot(tgt2.x - veh.pos.x, tgt2.z - veh.pos.z);
    if (off > 25 || veh.inWater) ai.lost += dt; else ai.lost = Math.max(0, ai.lost - dt);
    if (ai.panic > 0) ai.panic -= dt;
  }

  /** Has this thing stopped for good (parked, abandoned, wrecked, or an AI that's itself stuck)? */
  _stalled(o) {
    if (!o.def) return true;                                      // a person who won't move out of the way (we've honked): go round
    if (Math.abs(o.speed || 0) > 1) return false;
    const ai = this.drivers.get(o);
    if (!ai) return !!o.def;                                      // a parked/abandoned car or wreck
    return ai.stuck > 4 || ai.unstick > 0 || ai.lost > 3;
  }

  /** Is there oncoming traffic close enough that a left turn should wait? */
  _oncoming(veh, h) {
    const fx = Math.sin(h), fz = Math.cos(h);
    for (const o of V.vehicles.near(veh.pos.x, veh.pos.z, 70, _near)) {
      if (o === veh || o.dead || Math.abs(o.speed || 0) < 3) continue;
      const dx = o.pos.x - veh.pos.x, dz = o.pos.z - veh.pos.z;
      const along = dx * fx + dz * fz;
      if (along < 4 || along > 65) continue;
      const ofx = Math.sin(o.heading ?? 0), ofz = Math.cos(o.heading ?? 0);
      if (ofx * fx + ofz * fz > -0.75) continue;                 // not coming at us
      if (Math.abs(dx * fz - dz * fx) > 32) continue;
      return true;
    }
    return false;
  }

  /** Distance to whatever is in front of this car in its lane (cars, the player, people). Sets this._blocker. */
  _gapAhead(veh, h, ai) {
    const fx = Math.sin(h), fz = Math.cos(h), half = (veh.size?.l || 12) / 2, hw = (veh.size?.w || 8) / 2;
    // the corridor bends with the steering a little (follows the curve in turns)
    const ign = ai?.ignore;
    let best = Infinity, who = null;
    const test = (x, z, len, w, o) => {
      const dx = x - veh.pos.x, dz = z - veh.pos.z;
      const along = dx * fx + dz * fz;
      if (along <= 0 || along > 70) return;
      const side = Math.abs(dx * fz - dz * fx);
      if (side > (hw + w / 2) * 0.88 + (along < 20 ? 0.6 : 0)) return;
      const g = along - half - len / 2;
      if (g < best) { best = g; who = o; }
    };
    for (const o of V.vehicles.near(veh.pos.x, veh.pos.z, 75, _near)) {
      if (o === veh || o === ign) continue;
      // two drivers each waiting for the other (nose to nose in a junction): the one already turning, or else
      // the older car, goes first
      const oa = this.drivers.get(o);
      if (oa && oa.blk === veh && ai && (ai.turn && !oa.turn || (ai.turn === oa.turn && veh.id < o.id))) continue;
      // oncoming cars in the other lane aren't in the way; a head-on one very close is
      const dot = Math.sin(o.heading ?? 0) * fx + Math.cos(o.heading ?? 0) * fz;
      if (dot < -0.5 && Math.abs(o.speed || 0) > 2 && Math.hypot(o.pos.x - veh.pos.x, o.pos.z - veh.pos.z) > 26) continue;
      test(o.pos.x, o.pos.z, o.size?.l || 12, o.size?.w || 8, o);
    }
    const P = V.player;
    if (P?.pos && !P.vehicle && !P.dead) test(P.pos.x, P.pos.z, 2, 3, P);
    if (V.peds?.near) for (const p of V.peds.near(veh.pos.x, veh.pos.z, 45)) if (!p.dead && !p.vehicle) test(p.pos.x, p.pos.z, 2, 3, p);
    this._blocker = who;
    return best;
  }
}

// ---- lanes ----
// Small streets park on one side only (the right of a->b): our cars are 8 studs wide, a 28-stud street has room
// for two lanes and one row of parked cars. So that direction's lane hugs the centre line a little.
function laneOffset(e, lane, dir) { return e.R.parking ? (dir > 0 ? 2.4 : 6.6) : e.R.median / 2 + e.R.lane * (lane + 0.5); }
/** Point at distance s along edge e (s from the a end), with its tangent (binary search: highway edges are long). */
function pointOn(e, s, out = {}) {
  const pts = e.pts;
  let lo = 1, hi = pts.length - 1;
  while (lo < hi) { const m = (lo + hi) >> 1; if (pts[m].d < s) lo = m + 1; else hi = m; }
  const a = pts[lo - 1], b = pts[lo], L = b.d - a.d || 1, t = Math.min(1, Math.max(0, (s - a.d) / L));
  out.x = a.x + (b.x - a.x) * t; out.y = a.y + (b.y - a.y) * t; out.z = a.z + (b.z - a.z) * t; out.tx = (b.x - a.x) / L; out.tz = (b.z - a.z) / L;
  return out;
}
/** The centre of `lane` for traffic going `dir` along e, at distance s in the travel direction (extra: sideways, + = right). */
function lanePoint(e, dir, lane, s, extra, out) {
  const p = pointOn(e, dir > 0 ? s : e.len - s, out);
  const tx = p.tx * dir, tz = p.tz * dir, off = laneOffset(e, lane, dir) + (extra || 0);
  p.x -= tz * off; p.z += tx * off;
  return p;
}
/** Distance along the polyline (in the travel direction) nearest to (x, z); with a hint, only near it. */
function projectS(e, x, z, dir, hint) {
  let best = 0, bd = Infinity;
  const pts = e.pts;
  let i0 = 0, i1 = pts.length - 1;
  if (hint != null && pts.length > 8) {
    const h = dir > 0 ? hint : e.len - hint;
    while (i0 < pts.length - 2 && pts[i0 + 1].d < h - 80) i0++;
    i1 = i0; while (i1 < pts.length - 1 && pts[i1].d < h + 80) i1++;
  }
  for (let i = i0; i < i1; i++) {
    const a = pts[i], b = pts[i + 1], dx = b.x - a.x, dz = b.z - a.z, L2 = dx * dx + dz * dz || 1;
    const t = Math.min(1, Math.max(0, ((x - a.x) * dx + (z - a.z) * dz) / L2));
    const px = a.x + dx * t, pz = a.z + dz * t, d = (x - px) ** 2 + (z - pz) ** 2;
    if (d < bd) { bd = d; best = a.d + (b.d - a.d) * t; }
  }
  return dir > 0 ? best : e.len - best;
}
const _tp = {};
function startTangent(e, dir) { const p = pointOn(e, dir > 0 ? 1 : e.len - 1, _tp); return [p.tx * dir, p.tz * dir]; }
function endTangent(e, dir) { const p = pointOn(e, dir > 0 ? e.len - 1 : 1, _tp); return [p.tx * dir, p.tz * dir]; }
/** The junction curve (quadratic Bezier A -> I -> B) at u. */
function bez(C, u, out) {
  const a = (1 - u) * (1 - u), b = 2 * (1 - u) * u, c = u * u;
  out.x = C.ax * a + C.ix * b + C.bx * c; out.z = C.az * a + C.iz * b + C.bz * c;
  return out;
}
