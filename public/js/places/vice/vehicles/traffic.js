// Traffic: AI drivers on the road graph. Cars keep to their lane on the
// right, pick a way at each junction, stop for red lights and for the car in
// front, slow for corners, brake for people in the road, honk when they're
// stuck, and floor it when there's shooting. Parked cars line the streets.
// Everything lives in a ring around the camera: spawned out of sight, let go
// when far away.
//
//   V.traffic = new Traffic()
//   route(fromX, fromZ, toX, toZ) -> {pts, edges, nodes, len} | null   (A* on the road graph)
//   drivers: Map veh -> AI state      count()      update(dt)
//   panic(pos, r)  every driver near pos flees (gunshots, explosions)
// A driver is a small object (isAI) until a Peds system gives cars real
// drivers: it answers exitVehicle(), knock(), flee() like a ped would.
import * as THREE from 'three';
import { V } from '../state.js';
import { MIX } from './vehicles.js';
import { route, nearestEdge } from '../core/route.js';

const RING_IN = 260, RING_OUT = 620, DROP = 820;
const MAX_CARS = 34, MAX_PARKED = 40;
const _v = new THREE.Vector3();

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
    this.t = 0; this.spawnT = 0;
    this.rng = 1;
    this.offs = [];
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
    this.t += dt;
    const cam = V.world.camera.position;
    // spawn and drop, a few times a second
    if ((this.spawnT -= dt) <= 0) {
      this.spawnT = 0.35;
      this._cull(cam);
      if (this.drivers.size < this._want(cam)) this._spawn(cam);
      if (this.parked.size < MAX_PARKED) this._park(cam);
    }
    for (const ai of this.drivers.values()) this._drive(ai, dt);
  }

  _want(cam) {
    const D = V.plan.districtAt(cam.x, cam.z);
    const h = V.time?.hour ?? 12, rush = (h > 7 && h < 10) || (h > 16 && h < 20) ? 1.2 : h > 1 && h < 6 ? 0.35 : 1;
    const busy = D ? 0.5 + (D.peds ?? 0.5) * 0.7 : 0.8;
    return Math.round(MAX_CARS * Math.min(1, busy * rush) * (V.settings?.quality === 'low' ? 0.6 : 1));
  }

  _visible(x, y, z) {
    const cam = V.world.camera;
    _v.set(x - cam.position.x, y - cam.position.y, z - cam.position.z);
    const d = _v.length();
    cam.getWorldDirection(_dir);
    return _v.dot(_dir) / d > 0.55 && d < 900;
  }

  _spawn(cam) {
    const P = V.plan;
    for (let tries = 0; tries < 12; tries++) {
      // a spot in the ring around the camera, on the nearest road
      const ang = this.rand() * Math.PI * 2, rad = RING_IN + this.rand() * (RING_OUT - RING_IN);
      const ne = nearestEdge(P, cam.x + Math.cos(ang) * rad, cam.z + Math.sin(ang) * rad, 160);
      if (!ne) continue;
      const e = ne.edge;
      if (e.len < 50) continue;
      const s = Math.min(e.len - 15, Math.max(15, ne.along));
      const p = pointOn(e, s);
      const d = Math.hypot(p.x - cam.x, p.z - cam.z);
      if (d < RING_IN || d > RING_OUT) continue;
      if (this._visible(p.x, p.y, p.z) && d < 500) continue;
      const dir = this.rand() < 0.5 ? 1 : -1, lane = Math.floor(this.rand() * e.R.lanes);
      const off = laneOffset(e, lane);
      const tx = p.tx * dir, tz = p.tz * dir, rx = -tz, rz = tx;
      const x = p.x + rx * off, z = p.z + rz * off;
      // room?
      if (V.vehicles.near(x, z, 16).length) continue;
      const type = pickMix(MIX.traffic, this.rand());
      const speed = Math.min(e.R.speed * 0.6, 40);
      const veh = V.vehicles.spawn(type, x, z, Math.atan2(tx, tz), { y: p.y, color: PAINT[Math.floor(this.rand() * PAINT.length)], speed });
      if (!veh) return;
      const ai = { veh, e, dir, lane, s: dir > 0 ? s : e.len - s, next: null, stuck: 0, panic: 0, honkT: 0, cruise: 0.75 + this.rand() * 0.3 };
      const drv = new Driver(this, veh); ai.driver = drv;
      veh.driver = drv;
      this._chooseNext(ai);
      this.drivers.set(veh, ai);
      return;
    }
  }

  _park(cam) {
    const spots = V.roads?.parking;
    if (!spots?.length) return;
    for (let tries = 0; tries < 6; tries++) {
      const sp = spots[Math.floor(this.rand() * spots.length)];
      const d = Math.hypot(sp.x - cam.x, sp.z - cam.z);
      if (d < 140 || d > 520 || (this._visible(sp.x, sp.y, sp.z) && d < 400)) continue;
      if (V.vehicles.near(sp.x, sp.z, 12).length) continue;
      const veh = V.vehicles.spawn(pickMix(MIX.parked, this.rand()), sp.x, sp.z, sp.heading, { y: sp.y, parked: true, color: PAINT[Math.floor(this.rand() * PAINT.length)] });
      if (veh) { veh.trafficParked = true; this.parked.add(veh); }
      return;
    }
  }

  _cull(cam) {
    for (const [veh, ai] of this.drivers) {
      if (veh.removed) { this.drivers.delete(veh); continue; }
      const d = Math.hypot(veh.pos.x - cam.x, veh.pos.z - cam.z);
      if ((d > DROP && !this._visible(veh.pos.x, veh.pos.y, veh.pos.z)) || d > DROP * 1.6) { this.drivers.delete(veh); V.vehicles.remove(veh); }
      else if (veh.dead) { this.drivers.delete(veh); }
      void ai;
    }
    for (const veh of this.parked) {
      if (veh.removed) { this.parked.delete(veh); continue; }
      const d = Math.hypot(veh.pos.x - cam.x, veh.pos.z - cam.z);
      if (d > 700 && !veh.driver && !this._visible(veh.pos.x, veh.pos.y, veh.pos.z)) { this.parked.delete(veh); V.vehicles.remove(veh); }
    }
  }

  /** A driver lost their car (got out, was pulled out, died): the car is just a car now. */
  _release(veh, abandoned) {
    const ai = this.drivers.get(veh);
    if (!ai) return;
    this.drivers.delete(veh);
    if (veh.ctl) { veh.ctl.throttle = 0; veh.ctl.brake = abandoned ? 0.3 : 0; veh.ctl.steer = 0; }
  }

  _chooseNext(ai) {
    const P = V.plan, e = ai.e;
    const nodeId = ai.dir > 0 ? e.b : e.a, n = P.nodes[nodeId];
    const opts = n.edges.filter((id) => id !== e.id);
    if (!opts.length) { ai.next = { e, dir: -ai.dir, node: nodeId, uturn: true }; return; }
    // prefer going straight on; avoid tiny dead ends
    const t = endTangent(e, ai.dir);
    let best = null, bw = -Infinity;
    for (const id of opts) {
      const ne = P.edges[id], nd = ne.a === nodeId ? 1 : -1;
      const nt = startTangent(ne, nd);
      const straight = t[0] * nt[0] + t[1] * nt[1];
      const deadEnd = P.nodes[nd > 0 ? ne.b : ne.a].edges.length === 1;
      const w = straight * 1.2 + this.rand() * 1.6 - (deadEnd ? 2 : 0) + (ne.cls === 'hwy' ? 0.4 : 0);
      if (w > bw) { bw = w; best = { e: ne, dir: nd, node: nodeId }; }
    }
    ai.next = best;
  }

  _drive(ai, dt) {
    const veh = ai.veh, c = veh.ctl;
    if (!veh.driver || veh.driver !== ai.driver || veh.dead) { this._release(veh, true); return; }
    const e = ai.e;
    // where are we along the edge (project the car on the lane's centre line)
    const sNow = projectS(e, veh.pos.x, veh.pos.z, ai.dir);
    ai.s = sNow;
    if (ai.s >= e.len - 2) {
      // into the next road
      if (!ai.next) this._chooseNext(ai);
      const nx = ai.next;
      ai.e = nx.e; ai.dir = nx.dir; ai.lane = Math.min(ai.lane, nx.e.R.lanes - 1);
      ai.s = projectS(ai.e, veh.pos.x, veh.pos.z, ai.dir);
      ai.next = null; this._chooseNext(ai);
      return this._drive(ai, dt);
    }
    const speed = veh.speed || 0;
    // the point to aim for: further ahead at speed, into the next road near the end
    const look = 9 + Math.abs(speed) * 0.45;
    let tgt = lanePoint(ai.e, ai.dir, ai.lane, ai.s + look);
    if (ai.s + look > ai.e.len && ai.next) {
      const over = ai.s + look - ai.e.len;
      const lane = Math.min(ai.lane, ai.next.e.R.lanes - 1);
      tgt = lanePoint(ai.next.e, ai.next.dir, lane, Math.min(ai.next.e.len, over));
    }
    const h = veh.heading ?? 0;
    const want = Math.atan2(tgt.x - veh.pos.x, tgt.z - veh.pos.z);
    let da = want - h; da = Math.atan2(Math.sin(da), Math.cos(da));
    c.steer = Math.max(-1, Math.min(1, -da * 2.2));
    // how fast: the road's limit, slower into turns, stop for lights, cars and people
    let vmax = ai.e.R.speed * ai.cruise * (ai.panic > 0 ? 1.35 : 1);
    const toEnd = ai.e.len - ai.s;
    if (ai.next && !ai.next.uturn) {
      const t0 = endTangent(ai.e, ai.dir), t1 = startTangent(ai.next.e, ai.next.dir);
      const turn = 1 - (t0[0] * t1[0] + t0[1] * t1[1]);   // 0 straight .. 2 reverse
      if (turn > 0.3) vmax = Math.min(vmax, Math.max(14, Math.sqrt(toEnd) * 4 + 12));
    } else if (ai.next?.uturn) vmax = Math.min(vmax, Math.max(5, toEnd * 0.5));
    // traffic lights (the stop line is ~12 studs before the junction)
    const nodeId = ai.dir > 0 ? ai.e.b : ai.e.a;
    const light = ai.panic > 0 ? 'green' : V.roads?.lightState?.(nodeId, ai.e.id) || 'green';
    const stopAt = toEnd - 14 - (V.roads?.junction?.[nodeId]?.arms?.find((a) => a.edge === ai.e)?.s || 0);
    if (light !== 'green' && stopAt > -2) {
      const canStop = speed * speed / (2 * 40) < stopAt + 2 || light === 'red';
      if (canStop) vmax = Math.min(vmax, Math.max(0, stopAt * 0.9));
    }
    // the car (or person, or player) ahead
    const gap = this._gapAhead(veh, h);
    if (gap < Infinity) vmax = Math.min(vmax, Math.max(0, (gap - 9) * 0.9));
    // controls
    const err = vmax - speed;
    c.throttle = err > 0 ? Math.min(1, err / 12 + 0.15) : 0;
    c.brake = err < -2 ? Math.min(1, -err / 15) : vmax < 0.5 ? 1 : 0;
    c.handbrake = false;
    // stuck behind something: honk, then go round (or give up and reverse a little)
    if (Math.abs(speed) < 1 && vmax < 0.5 && light === 'green') ai.stuck += dt; else ai.stuck = Math.max(0, ai.stuck - dt);
    if (ai.stuck > 2.5 && (ai.honkT -= dt) <= 0) { ai.honkT = 2 + Math.random() * 3; veh.horn?.(true); setTimeout(() => veh.horn?.(false), 400); }
    if (ai.stuck > 7) { c.throttle = -0.6; c.brake = 0; c.steer = 0.6; if (ai.stuck > 8.5) ai.stuck = 0; }
    if (ai.panic > 0) ai.panic -= dt;
  }

  /** Distance to whatever is in front of this car in its lane (cars, the player, people). */
  _gapAhead(veh, h) {
    const fx = Math.sin(h), fz = Math.cos(h), half = (veh.size?.l || 12) / 2;
    let best = Infinity;
    const test = (x, z, len) => {
      const dx = x - veh.pos.x, dz = z - veh.pos.z;
      const along = dx * fx + dz * fz;
      if (along <= 0 || along > 70) return;
      const side = Math.abs(dx * fz - dz * fx);
      if (side > 5.5) return;
      const g = along - half - len / 2;
      if (g < best) best = g;
    };
    for (const o of V.vehicles.near(veh.pos.x, veh.pos.z, 75)) if (o !== veh) test(o.pos.x, o.pos.z, o.size?.l || 12);
    const P = V.player;
    if (P?.pos && !P.vehicle && !P.dead) test(P.pos.x, P.pos.z, 2);
    if (V.peds?.near) for (const p of V.peds.near(veh.pos.x, veh.pos.z, 45)) if (!p.dead && !p.vehicle) test(p.pos.x, p.pos.z, 2);
    return best;
  }
}

const _dir = new THREE.Vector3();

// ---- lanes ----
function laneOffset(e, lane) { return e.R.median / 2 + e.R.lane * (lane + 0.5); }
/** Point at distance s along edge e (s from the a end), with its tangent. */
function pointOn(e, s) {
  const pts = e.pts;
  let i = 1;
  while (i < pts.length - 1 && pts[i].d < s) i++;
  const a = pts[i - 1], b = pts[i], L = b.d - a.d || 1, t = Math.min(1, Math.max(0, (s - a.d) / L));
  return { x: a.x + (b.x - a.x) * t, y: a.y + (b.y - a.y) * t, z: a.z + (b.z - a.z) * t, tx: (b.x - a.x) / L, tz: (b.z - a.z) / L };
}
/** The centre of `lane` for traffic going `dir` along e, at distance s in the travel direction. */
function lanePoint(e, dir, lane, s) {
  const p = pointOn(e, dir > 0 ? s : e.len - s);
  const tx = p.tx * dir, tz = p.tz * dir, off = laneOffset(e, lane);
  return { x: p.x - tz * off, y: p.y, z: p.z + tx * off };
}
function projectS(e, x, z, dir) {
  // nearest distance along the polyline
  let best = 0, bd = Infinity;
  const pts = e.pts;
  for (let i = 0; i < pts.length - 1; i++) {
    const a = pts[i], b = pts[i + 1], dx = b.x - a.x, dz = b.z - a.z, L2 = dx * dx + dz * dz || 1;
    const t = Math.min(1, Math.max(0, ((x - a.x) * dx + (z - a.z) * dz) / L2));
    const px = a.x + dx * t, pz = a.z + dz * t, d = (x - px) ** 2 + (z - pz) ** 2;
    if (d < bd) { bd = d; best = a.d + (b.d - a.d) * t; }
  }
  return dir > 0 ? best : e.len - best;
}
function startTangent(e, dir) { const p = pointOn(e, dir > 0 ? 1 : e.len - 1); return [p.tx * dir, p.tz * dir]; }
function endTangent(e, dir) { const p = pointOn(e, dir > 0 ? e.len - 1 : 1); return [p.tx * dir, p.tz * dir]; }
