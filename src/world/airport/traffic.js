// =============================================================================
// AI traffic built with app.exterior.createAircraft (degrades to nothing if the
// exterior module is a stub):
//   * parked aircraft at def.occupiedGates (+ one in the open hangar)
//   * taxiing aircraft following layout paths (buildPath fillets) with a
//     curvature / stop speed profile and simple separation from our aircraft
//   * departure airport: an arrival taxiing into B12 during boarding, a
//     follower behind us on the way to A1, and a LANDING aircraft on runway 09
//     timed to cross the threshold a few seconds into our hold at A1
//   * arrival airport: an aircraft holding at A1 that lines up and takes off
//     on 09 while we taxi in, a second one taxiing out behind it
// =============================================================================
import * as THREE from 'three';
import { AIRCRAFT, DEG } from '../../core/constants.js';
import { RUNWAY, GATE_STAND_Z, TAXILANE_Z, TAXIWAY_A_Z, HOLD_SHORT_Z, buildPath, samplePath, gateById } from '../layout.js';
import { clamp, clamp01, smoothstep, mulberry, lerp } from './util.js';

const GH = AIRCRAFT.groundHeight;
const AIRBORNE_LATER = new Set(['climb', 'cruise', 'descent', 'approach', 'landing', 'taxi_in', 'arrived']);
const ARR_PHASES = new Set(['approach', 'landing', 'taxi_in', 'arrived']);
const EARLY = new Set(['cruise', 'climb', 'descent', 'gate', 'pushback', 'taxi_out']);
const STRETCH = { '737-800': 0, '737-900': 1.32, '737-700': -1.45 };
const _q = new THREE.Quaternion(), _e = new THREE.Euler(), _v = new THREE.Vector3();

function liveries(app) {
  const l = app.exterior?.liveries;
  return Array.isArray(l) && l.length ? l : ['halcyon'];
}

function makeAircraft(app, opts) {
  try {
    const ac = app.exterior?.createAircraft?.(opts);
    if (ac && ac.group) return ac;
  } catch (e) { console.warn('[airport] createAircraft failed', e); }
  return null;
}

/** Speed limits along a path: lateral acceleration on curves + braking before the end. */
function speedProfile(path, vmax, { alat = 0.9, decel = 0.7, stopAtEnd = true } = {}) {
  const S = path.samples, n = S.length;
  const lim = new Float32Array(n);
  for (let i = 0; i < n; i++) {
    const a = S[Math.max(0, i - 3)], b = S[Math.min(n - 1, i + 3)];
    let dh = b.heading - a.heading; while (dh > 180) dh -= 360; while (dh < -180) dh += 360;
    const ds = Math.max(0.1, b.s - a.s);
    const k = Math.abs(dh * DEG) / ds;            // curvature 1/m
    lim[i] = Math.min(vmax, k > 1e-4 ? Math.sqrt(alat / k) : vmax);
  }
  if (stopAtEnd) lim[n - 1] = 0;
  // backward pass: braking distance
  for (let i = n - 2; i >= 0; i--) {
    const ds = S[i + 1].s - S[i].s;
    lim[i] = Math.min(lim[i], Math.sqrt(lim[i + 1] * lim[i + 1] + 2 * decel * ds));
  }
  return (s) => {
    let lo = 0, hi = n - 1;
    while (hi - lo > 1) { const m = (lo + hi) >> 1; if (S[m].s <= s) lo = m; else hi = m; }
    return lim[lo];
  };
}

/** An AI aircraft moving along a ground path. */
class Mover {
  constructor(ac, path, { vmax = 9, accel = 0.5, decel = 0.7, stopAtEnd = true, s0 = 0 } = {}) {
    this.ac = ac; this.path = path; this.s = s0; this.v = 0; this.accel = accel;
    this.vlim = speedProfile(path, vmax, { decel: decel * 0.8, stopAtEnd });
    this.decel = decel;
    this.hold = false;
  }
  get done() { return this.s >= this.path.length - 0.05; }
  step(dt) {
    const tgt = this.hold ? 0 : this.vlim(this.s);
    this.v = this.v < tgt ? Math.min(tgt, this.v + this.accel * dt) : Math.max(tgt, this.v - this.decel * dt);
    this.s = Math.min(this.path.length, this.s + this.v * dt);
    const p = samplePath(this.path, this.s);
    return p;
  }
}

function setPose(ac, x, y, z, headingDeg, pitch = 0, roll = 0) {
  ac.group.position.set(x, y, z);
  _e.set(pitch, -headingDeg * DEG, -roll, 'YXZ');
  ac.group.quaternion.setFromEuler(_e);
}

export class Traffic {
  constructor(app, airport) {
    this.app = app;
    this.airport = airport;
    this.def = airport.def;
    this.group = new THREE.Group();
    this.group.name = 'ai-traffic';
    this.parked = [];
    this.actors = [];
    this.ok = !!app.exterior?.createAircraft;
    this.rnd = mulberry(this.def.seed + 991);
    this.isDep = this.def.id === 'departure';
    this.built = false;
  }

  /** Build lazily (exterior factory must exist; called on app:ready or first update). */
  build() {
    if (this.built) return;
    this.built = true;
    const app = this.app, def = this.def;
    if (!app.exterior?.createAircraft) return;
    const L = liveries(app);
    const pick = (i) => L[(i + (this.isDep ? 1 : 2)) % L.length];
    // parked aircraft
    this.airport.parked.forEach((p, i) => {
      const ac = makeAircraft(app, { livery: pick(i), seed: def.seed + i * 13, variant: p.variant, castShadow: true });
      if (!ac) return;
      setPose(ac, p.gate.x, GH, p.gate.z, 0);
      ac.update?.(0, { n1: 0, gear: 1, flaps: 0, lights: { nav: true, beacon: false, strobe: false, landing: false, taxi: false, logo: false } });
      this.group.add(ac.group);
      this.parked.push(ac);
    });
    // aircraft inside the open hangar
    const hs = this.airport.buildings?.hangarSpots?.[0];
    if (hs) {
      const ac = makeAircraft(app, { livery: pick(5), seed: def.seed + 400, variant: '737-700', castShadow: true });
      if (ac) {
        setPose(ac, hs.x, GH, hs.z, hs.heading);
        ac.update?.(0, { n1: 0, gear: 1, flaps: 15, lights: { nav: false, beacon: false, strobe: false, landing: false, taxi: false, logo: false } });
        this.group.add(ac.group);
        this.parked.push(ac);
      }
    }
    // moving actors
    const mk = (i, variant = '737-800') => {
      const ac = makeAircraft(app, { livery: pick(i + 3), seed: def.seed + 700 + i * 31, variant, castShadow: true });
      if (ac) { ac.group.visible = false; this.group.add(ac.group); }
      return ac;
    };
    if (this.isDep) {
      this.inbound = { ac: mk(0), state: 'wait' };
      this.follower = { ac: mk(1, '737-900'), state: 'wait' };
      this.lander = { ac: mk(2), state: 'wait' };
    } else {
      this.departer = { ac: mk(0), state: 'wait' };
      this.taxier = { ac: mk(1, '737-700'), state: 'wait' };
    }
  }

  reset() {
    for (const k of ['inbound', 'follower', 'lander', 'departer', 'taxier']) {
      const a = this[k];
      if (!a) continue;
      a.state = 'wait'; a.mover = null;
      if (a.ac) a.ac.group.visible = false;
    }
  }

  // ---------------------------------------------------------------- per frame
  update(dt) {
    if (!this.built) this.build();
    const st = this.app.flight?.state;
    if (!st) return;
    const night = this.airport.nightLevel || 0;
    // parked aircraft: logo lights at night (cheap: only when it changes)
    const logo = night > 0.5;
    if (this._logo !== logo) { this._logo = logo; for (const ac of this.parked) ac.update?.(0, { lights: { logo } }); }
    const me = _v.copy(st.position).sub(this.airport.group.position);
    if (this.isDep) this.updateDeparture(dt, st, me);
    else this.updateArrival(dt, st, me);
  }

  // drive a taxiing actor: returns pose
  taxi(a, dt, me, { lights = {}, n1 = 24 } = {}) {
    const m = a.mover;
    // separation: stop if our aircraft is ahead within 120 m
    const p0 = samplePath(m.path, m.s);
    const hx = Math.sin(p0.heading * DEG), hz = -Math.cos(p0.heading * DEG);
    const dx = me.x - p0.x, dz = me.z - p0.z;
    const ahead = dx * hx + dz * hz, side = Math.abs(dx * hz - dz * hx);
    m.hold = (ahead > 0 && ahead < 125 && side < 40) || !!a.holdExtra;
    const p = m.step(dt);
    setPose(a.ac, p.x, GH, p.z, p.heading);
    a.ac.update?.(dt, { n1: m.v > 0.3 || m.hold ? n1 : n1 * 0.9, gear: 1, flaps: a.flaps ?? 0, lights: { nav: true, beacon: true, strobe: false, landing: false, taxi: true, logo: true, ...lights } });
    return p;
  }

  updateDeparture(dt, st, me) {
    const phase = st.phase;
    // --- inbound aircraft taxiing into B12 while we board
    const ib = this.inbound;
    if (ib?.ac) {
      if (ib.state === 'wait' && phase === 'gate' && st.phaseTime > 20) {
        const g = gateById(this.def, 'B12');
        const path = buildPath([[1500, -60], [1500, TAXIWAY_A_Z], [700, TAXIWAY_A_Z], [700, TAXILANE_Z], [g.x, TAXILANE_Z], [g.x, g.z]], 45, { step: 1 });
        ib.mover = new Mover(ib.ac, path, { vmax: 9 });
        ib.state = 'taxi'; ib.ac.group.visible = true;
      }
      if (ib.state === 'taxi') {
        this.taxi(ib, dt, me);
        if (ib.mover.done && ib.mover.v < 0.01) { ib.state = 'parked'; ib.t = 0; }
      } else if (ib.state === 'parked') {
        ib.t += dt;
        ib.ac.update?.(dt, { n1: Math.max(0, 22 - ib.t * 1.5), lights: { taxi: false, beacon: ib.t < 25, logo: this._logo } });
      }
      if (ib.state === 'wait' && phase !== 'gate' && phase !== 'pushback') {
        // jumped past the gate phase: just show it parked at B12
        const g = gateById(this.def, 'B12');
        setPose(ib.ac, g.x, GH, g.z, 0); ib.ac.group.visible = true; ib.state = 'parked'; ib.t = 99;
      }
    }
    // --- follower behind us during taxi-out
    const fo = this.follower;
    if (fo?.ac) {
      if (fo.state === 'wait' && phase === 'taxi_out' && me.x < -60 && Math.abs(me.z - TAXILANE_Z) < 20) {
        const path = buildPath([[700, TAXILANE_Z], [-700, TAXILANE_Z], [-700, TAXIWAY_A_Z], [-1500, TAXIWAY_A_Z], [-1500, HOLD_SHORT_Z - 150]], 45, { step: 1 });
        fo.mover = new Mover(fo.ac, path, { vmax: 8.5 });
        fo.state = 'taxi'; fo.ac.group.visible = true;
      }
      if (fo.state === 'taxi') this.taxi(fo, dt, me, { n1: 23 });
      if (fo.state === 'taxi' && AIRBORNE_LATER.has(phase)) { fo.state = 'wait'; fo.ac.group.visible = false; }
    }
    // --- landing aircraft crossing the 09 threshold a few seconds into our hold at A1
    const ld = this.lander;
    if (ld?.ac) this.updateLander(ld, dt, st, me);
  }

  updateLander(ld, dt, st, me) {
    const phase = st.phase;
    const atA1 = Math.abs(me.x - RUNWAY.x0) < 30 && me.z > TAXIWAY_A_Z + 20 && me.z < -40;
    const dir = this.app.flight?.director;
    if (ld.state === 'wait' && phase === 'taxi_out') {
      // estimate our time to the hold-short point
      const rem = dir?.ground?.remaining ?? (Math.abs(me.x - RUNWAY.x0) + Math.abs(me.z - HOLD_SHORT_Z));
      const v = Math.max(3, st.groundSpeed || 0);
      if (rem < 900 || atA1) {
        const eta = atA1 && (st.groundSpeed || 0) < 0.3 ? 0 : rem / Math.min(v, 9) + 8;
        ld.tThr = this.app.time + eta + 7;          // threshold crossing time
        ld.state = 'approach';
        ld.d = 72 * (ld.tThr - this.app.time);      // distance to the threshold (m)
        ld.v = 72;
        ld.ac.group.visible = true;
      }
    }
    if (ld.state === 'approach' || ld.state === 'flare') {
      // converge on the planned threshold time by small speed changes
      if (atA1 && (st.groundSpeed || 0) < 0.2 && !ld.syncHold) { ld.syncHold = true; const want = this.app.time + 6; if (ld.d / 72 > 14) ld.tThr = want; }
      const want = 72 * Math.max(0, ld.tThr - this.app.time);
      ld.v = clamp(72 + (ld.d - want) * 0.08, 64, 80);
      ld.d -= ld.v * dt;
      const x = RUNWAY.x0 - ld.d;
      const aimX = RUNWAY.x0 + 300, tdX = RUNWAY.x0 + 370;
      let y = GH + Math.tan(3 * DEG) * Math.max(0, aimX - x);
      // flare: from 15 m wheel height, ease onto the runway at the touchdown point
      const fl = smoothstep(RUNWAY.x0 - 120, tdX, x);
      const yFlare = GH + 9 * (1 - fl) * (1 - fl);
      if (x > RUNWAY.x0 - 120) y = Math.min(y, yFlare);
      const pitch = lerp(2.5, 5.5, smoothstep(RUNWAY.x0 - 120, RUNWAY.x0 + 200, x)) * DEG;
      setPose(ld.ac, x, Math.max(GH, y), 0, 90, pitch);
      ld.ac.update?.(dt, { n1: 55, gear: 1, flaps: 30, lights: { nav: true, beacon: true, strobe: true, landing: true, taxi: true, logo: true } });
      if (x >= tdX) {
        ld.state = 'rollout';
        const path = buildPath([[tdX, 0], [-20, 0], [0, -30], [0, TAXIWAY_A_Z], [700, TAXIWAY_A_Z], [700, TAXILANE_Z], [100, TAXILANE_Z], [100, GATE_STAND_Z]], 45, { step: 1 });
        ld.mover = new Mover(ld.ac, path, { vmax: 16, accel: 0.6, decel: 2.0 });
        ld.mover.v = ld.v * 0.97;
        ld.rwyLen = -20 - tdX;
        ld.pitch = 5.5;
        ld.tRoll = 0;
      }
    }
    if (ld.state === 'rollout') {
      ld.tRoll += dt;
      const m = ld.mover;
      // deceleration on the runway (reversers / brakes), then taxi speed limits
      const onRwy = m.s < ld.rwyLen;
      const lim = m.vlim(m.s);
      const tgt = onRwy ? Math.min(lim, Math.max(14, m.v - 2.1 * dt)) : lim;
      m.v = Math.max(0, m.v > tgt ? Math.max(tgt, m.v - 2.4 * dt) : Math.min(tgt, m.v + 0.5 * dt));
      // separation with us is irrelevant here (we are at A1 behind it)
      m.s = Math.min(m.path.length, m.s + m.v * dt);
      const p = samplePath(m.path, m.s);
      ld.pitch = Math.max(0, ld.pitch - dt * 1.6);
      setPose(ld.ac, p.x, GH, p.z, p.heading, ld.pitch * DEG);
      const rev = onRwy && m.v > 30 && ld.tRoll > 2;
      ld.ac.update?.(dt, { n1: rev ? 70 : 25, gear: 1, flaps: onRwy ? 30 : Math.max(0, 30 - ld.tRoll * 2), lights: { nav: true, beacon: true, strobe: onRwy, landing: onRwy, taxi: true, logo: true } });
      if (m.done && m.v < 0.05) { ld.state = 'parked'; ld.t = 0; }
    }
    if (ld.state === 'parked') { ld.t += dt; ld.ac.update?.(dt, { n1: Math.max(0, 22 - ld.t * 1.5), lights: { taxi: false, beacon: ld.t < 25 } }); }
    // reset when the flight restarts / jumps back
    if (phase === 'gate' && ld.state !== 'wait') { ld.state = 'wait'; ld.syncHold = false; ld.ac.group.visible = false; }
  }

  updateArrival(dt, st, me) {
    const phase = st.phase;
    const dp = this.departer;
    if (dp?.ac) {
      if (dp.state === 'wait' && ARR_PHASES.has(phase)) {
        // holding short at A1, ready for departure
        setPose(dp.ac, RUNWAY.x0, GH, HOLD_SHORT_Z, 180);
        dp.ac.group.visible = true; dp.state = 'holding';
        dp.ac.update?.(0, { n1: 22, gear: 1, flaps: 5, lights: { nav: true, beacon: true, taxi: true, logo: true } });
      }
      if (dp.state === 'holding') {
        dp.ac.update?.(dt, { n1: 22, flaps: 5, lights: { nav: true, beacon: true, taxi: true, strobe: false, logo: true } });
        if (phase === 'taxi_in' || phase === 'arrived') {
          dp.wait = (dp.wait || 0) + dt;
          if (dp.wait > 6) {
            const path = buildPath([[RUNWAY.x0, HOLD_SHORT_Z], [RUNWAY.x0, 0], [RUNWAY.x0 + 70, 0]], 40, { step: 1 });
            dp.mover = new Mover(dp.ac, path, { vmax: 6, accel: 0.5 });
            dp.state = 'lineup';
          }
        }
      }
      if (dp.state === 'lineup') {
        const p = dp.mover.step(dt);
        setPose(dp.ac, p.x, GH, p.z, p.heading);
        dp.ac.update?.(dt, { n1: 26, flaps: 5, lights: { nav: true, beacon: true, taxi: true, strobe: true, landing: true, logo: true } });
        if (dp.mover.done && dp.mover.v < 0.05) { dp.state = 'roll'; dp.x = RUNWAY.x0 + 70; dp.v = 0; dp.y = GH; dp.pitch = 0; dp.t = 0; }
      }
      if (dp.state === 'roll' || dp.state === 'climb') {
        dp.t += dt;
        const spool = smoothstep(2, 9, dp.t);
        if (dp.state === 'roll') {
          dp.v += (spool * 2.1) * dt;
          if (dp.v > 75) { dp.pitch = Math.min(15, dp.pitch + dt * 3); }
          if (dp.pitch > 7.5) { dp.state = 'climb'; dp.vy = 0; }
        } else {
          dp.v = Math.min(95, dp.v + 0.9 * dt);
          dp.vy = Math.min(dp.v * Math.sin(9 * DEG), dp.vy + 2.2 * dt);
          dp.y += dp.vy * dt;
          dp.pitch = Math.min(15, dp.pitch + dt * 1.5);
        }
        dp.x += dp.v * dt;
        setPose(dp.ac, dp.x, dp.y, 0, 90, dp.pitch * DEG);
        dp.ac.update?.(dt, { n1: lerp(26, 94, spool), gear: dp.y > GH + 25 ? 0 : 1, flaps: 5, lights: { nav: true, beacon: true, strobe: true, landing: true, taxi: dp.y < 50, logo: true } });
        if (dp.y > 2500 || dp.x > 40000) { dp.state = 'gone'; dp.ac.group.visible = false; }
      }
      if (EARLY.has(phase) && dp.state !== 'wait') { dp.state = 'wait'; dp.wait = 0; dp.ac.group.visible = false; }
    }
    // second aircraft taxiing out from the west part of the apron to A1
    const tx = this.taxier;
    if (tx?.ac) {
      if (tx.state === 'wait' && (phase === 'landing' || phase === 'taxi_in')) {
        const path = buildPath([[-180, TAXILANE_Z], [-300, TAXILANE_Z], [-300, TAXIWAY_A_Z], [-1500, TAXIWAY_A_Z], [-1500, HOLD_SHORT_Z - 60]], 45, { step: 1 });
        tx.mover = new Mover(tx.ac, path, { vmax: 8.5 });
        tx.state = 'taxi'; tx.ac.group.visible = true;
      }
      if (tx.state === 'taxi') this.taxi(tx, dt, me, { n1: 23 });
      if (EARLY.has(phase) && tx.state !== 'wait') { tx.state = 'wait'; tx.ac.group.visible = false; }
    }
  }
}

export { STRETCH, clamp01 };
