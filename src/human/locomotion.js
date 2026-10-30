import { Vec3, clamp, lerp, smoothstep, approach, wrapAngle } from '../physics/math.js';

const SIDES = ['L', 'R'];
const other = (s) => (s === 'L' ? 'R' : 'L');
const _a = new Vec3();
const _b = new Vec3();
const _c = new Vec3();
const _p = new Vec3();

const ANKLE_H = 0.085; // ankle joint above the sole
const BALL = new Vec3(0, -0.03, 0.09); // ball of the foot (sole, under the toe joints) in the foot frame
const HEEL = 0.06, TOE = 0.2; // sole extent behind / ahead of the ankle
const MAX_RISE = 0.25; // highest step up (or down) a foot is put on
// sole samples [ahead of the ankle, left of it] (m): heel to toes with a margin (the heel may hang
// a little over a stair's edge)
const FOOT_SAMPLES = [[-0.07, 0], [0.04, 0.06], [0.04, -0.06], [0.12, 0], [0.2, 0.04], [0.2, -0.04], [0.24, 0], [0.27, 0]];

/**
 * Goal-directed walking on top of the balance controller. Nothing here plays back a gait cycle:
 * every step is a balance step whose landing spot follows from the measured capture point (DCM),
 * offset so that the body keeps travelling at the wanted speed:
 *
 *   x_td   = p + (xi - p) e^(w t)          capture point at touchdown (LIPM about the stance CoP)
 *   foot   = x_td - b * forward + side * beta * lateral
 *   b      = v T / (e^(w T) - 1)           -> the next step is again one step length ahead
 *   beta   = W / (1 + e^(w T))             -> the body sways from foot to foot within width W
 *
 * so a push, a slip or a hit simply moves the next footholds (and a hard one turns the step into a
 * catch step). Speed, heading and step timing come from the route; the swing foot clears obstacles
 * found by looking at the terrain along its path, and footholds are moved off edges and logs.
 */
export class Locomotion {
  constructor(ctl) {
    this.ctl = ctl;
    this.maxSpeed = 1.25; // m/s, comfortable walking speed of a healthy adult
    this.width = 0.17; // step width (between the ankles; the feet pass each other closely)
    this.look = new Vec3();
    this.dir = new Vec3(0, 0, 1);
    this.violation = new Vec3(); // how far the planned foothold was pulled in (world, m)
    this.reset();
  }

  reset() {
    this.state = 'idle'; // idle | walk | stop
    this.speed = 0; // commanded speed along the route (ramped)
    this.nextFoot = null;
    this.ds = 0;
    this.shift = null;
    this.pause = 0;
    this.interrupted = false;
    this.progressT = 0;
    this.progressD = Infinity;
    this.stuck = 0;
    this.remaining = Infinity;
    this.obstacleAhead = null;
    this.crossTrack = 0;
  }

  get active() {
    return this.state !== 'idle';
  }

  /** Walking (or stopping) and in charge of the stepping right now. */
  get stepping() {
    return this.active && this.ctl.mode === 'balance' && this.pause <= 0;
  }

  // ------------------------------------------------------------------------------------------
  /** How fast this person can walk now (wounded legs, blood loss, concussion, pain). */
  fitness() {
    const c = this.ctl;
    const leg = Math.min(c.legStrength.L, c.legStrength.R);
    const f = clamp((leg - 0.45) / 0.45, 0, 1);
    return f * clamp(1 - 0.45 * c.pain, 0.4, 1) * clamp(c.balanceSkill, 0.3, 1);
  }

  /** Swing time of a step at walking speed v (s). */
  swingTime(v) {
    return clamp(0.5 - 0.065 * v, 0.41, 0.5);
  }

  /** Double support between steps (s). */
  dsTime(v) {
    return clamp(0.16 - 0.05 * v, 0.09, 0.16);
  }

  begin() {
    if (this.state === 'idle') {
      this.state = 'walk';
      this.speed = 0;
      this.nextFoot = null;
      this.ds = 0;
      this.shift = null;
      this.progressT = 0;
      this.progressD = Infinity;
      this.stuck = 0;
    } else this.state = 'walk';
  }

  finish(status = 'arrived') {
    this.planted = null;
    const nav = this.ctl.nav;
    if (nav && !nav.done) {
      nav.done = true;
      nav.status = status;
      this.ctl.events.push({ type: 'walkEnd', status, time: this.ctl.time });
    }
    const wasActive = this.state !== 'idle';
    this.state = 'idle';
    this.shift = null;
    this.speed = 0;
    if (wasActive && this.ctl.mode === 'balance') {
      // hand the body back to standing balance: aim the COM servo where the body will come to rest
      const c = this.ctl, S = c.sens;
      const a = c.soleCenter('L', _a), b = c.soleCenter('R', _b);
      const dx = b.x - a.x, dz = b.z - a.z;
      const t = clamp(((S.cp.x - a.x) * dx + (S.cp.z - a.z) * dz) / (dx * dx + dz * dz || 1e-6), 0.15, 0.85);
      if (c.cdes) c.cdes.set(a.x + dx * t, 0, a.z + dz * t);
      c.comInt.setZero();
    }
  }

  // ------------------------------------------------------------------------------------------
  /** Per frame, after sensing: route following, speed and heading. */
  update(dt) {
    const c = this.ctl, nav = c.nav, S = c.sens;
    if (!nav || nav.done) {
      if (this.state !== 'idle') this.finish(nav ? nav.status : 'stopped');
      return;
    }
    if (this.state === 'idle') this.begin();
    if (c.mode !== 'balance') {
      // knocked over or getting up: the route waits; it is re-planned once back on the feet
      this.interrupted = true;
      this.speed = 0;
      this.nextFoot = null;
      this.shift = null;
      if (c.mode === 'dead' || c.mode === 'unconscious') this.finish(c.mode);
      return;
    }
    if (this.interrupted) {
      this.interrupted = false;
      nav.needsReplan = true;
      this.pause = Math.max(this.pause, 1.0);
      this.progressT = 0;
      this.progressD = Infinity;
    }
    this.pause = Math.max(0, this.pause - dt);
    const fit = this.fitness();
    if (fit <= 0.02) {
      this.finish('too injured');
      return;
    }

    // ---- where to: pure pursuit along the route
    const path = nav.path;
    const P = _a.set(S.com.x, 0, S.com.z);
    let i = clamp(nav.i || 0, 0, path.length - 1);
    // advance past waypoints that are behind us (or reached)
    for (;;) {
      const w = path[i];
      const prev = i > 0 ? path[i - 1] : nav.start;
      const dx = w.x - prev.x, dz = w.z - prev.z, l2 = dx * dx + dz * dz;
      const t = l2 > 1e-6 ? ((P.x - prev.x) * dx + (P.z - prev.z) * dz) / l2 : 1;
      const d = Math.hypot(w.x - P.x, w.z - P.z);
      if (i < path.length - 1 && (t > 1 || d < 0.35)) i++;
      else break;
    }
    nav.i = i;
    let remaining = Math.hypot(path[i].x - P.x, path[i].z - P.z);
    for (let k = i + 1; k < path.length; k++) remaining += Math.hypot(path[k].x - path[k - 1].x, path[k].z - path[k - 1].z);
    this.remaining = remaining;
    // goal index (multi-goal routes): which of the ordered goals is the current waypoint heading to
    if (nav.goalEnds) {
      let g = 0;
      while (g < nav.goalEnds.length - 1 && i >= nav.goalEnds[g]) g++;
      nav.goalIndex = g;
    }
    const v = Math.hypot(S.comVel.x, S.comVel.z);
    {
      // how far the capture point is to the left of the current route leg (m)
      const w = path[i], prev = i > 0 ? path[i - 1] : nav.start;
      const dx = w.x - prev.x, dz = w.z - prev.z, l = Math.hypot(dx, dz);
      this.crossTrack = l > 0.05 ? clamp(((S.cp.x - prev.x) * dz - (S.cp.z - prev.z) * dx) / l, -0.4, 0.4) : 0;
      // ...measured across the leg (left = +x for a route along +z), as the footholds are
      if (l <= 0.05 || remaining < 0.6) this.crossTrack = 0;
    }
    const look = 0.55 + 0.45 * v;
    const carrot = this.pointAlong(path, i, P, look, _b);
    this.dir.set(carrot.x - P.x, 0, carrot.z - P.z);
    if (this.dir.lengthSq() < 1e-6) this.dir.set(Math.sin(c.heading), 0, Math.cos(c.heading));
    this.dir.normalize();
    // crowd: steer around other people (moving discs), slow down behind someone in the way
    let crowdSlow = 1;
    if (c.crowd && c.crowd.length) {
      let sx = 0, sz = 0;
      for (const o of c.crowd) {
        const rx = P.x - o.x, rz = P.z - o.z, d = Math.hypot(rx, rz) || 1e-3;
        const ahead = -(rx * this.dir.x + rz * this.dir.z);
        if (ahead < -0.2) continue;
        const reach = 0.45 + o.r;
        if (d > reach + 0.9) continue;
        const w = clamp((reach + 0.9 - d) / 0.9, 0, 1.5);
        // sideways, toward the side the other person is not on
        const side = this.dir.x * rz - this.dir.z * rx > 0 ? 1 : -1;
        sx += -this.dir.z * side * w + (rx / d) * w * 0.5;
        sz += this.dir.x * side * w + (rz / d) * w * 0.5;
        if (ahead > 0 && Math.abs(this.dir.x * rz - this.dir.z * rx) < reach) crowdSlow = Math.min(crowdSlow, clamp((d - reach) / 1.0, 0, 1));
      }
      this.dir.x += sx * 0.8;
      this.dir.z += sz * 0.8;
      this.dir.normalize();
    }

    // ---- speed: accelerate gently, arrive (decelerate to the goal), turn on the spot when the goal is behind
    const desiredYaw = Math.atan2(this.dir.x, this.dir.z);
    const err = wrapAngle(desiredYaw - c.heading);
    const vmax = (nav.speed ?? this.maxSpeed) * (0.35 + 0.65 * fit);
    const vArrive = Math.sqrt(2 * 0.75 * Math.max(0, remaining - 0.12));
    // a sharp turn is mostly made first, in a few slow turning steps
    const turn = clamp(1 - (Math.abs(err) - 0.3) / 0.6, 0, 1);
    // people slow down to step over or onto something
    const obstacleSlow = this.obstacleAhead ? 0.7 : 10;
    let vt = Math.min(vmax, vArrive, obstacleSlow) * turn * crowdSlow;
    if (this.pause > 0) vt = 0;
    this.speed = approach(this.speed, vt, (vt > this.speed ? 0.8 : 1.6) * dt);

    // ---- heading: people turn with their steps - each walking step lands the foot turned toward
    // the way to go (up to ~0.6 rad on the spot, ~0.35 at walking pace), and the body turns along
    // with that swing; between steps it holds
    const st = c.step;
    if (st && st.kind === 'walk' && st.turnTo !== undefined) c.heading = approach(c.heading, c.heading + wrapAngle(st.turnTo - c.heading), 3.0 * dt);
    this.err = err;

    // ---- arrival / stopping (close enough is there: nobody turns round for the last 40 cm)
    const last = nav.goalIndex === undefined || !nav.goals || nav.goalIndex >= nav.goals.length - 1;
    if (last && (remaining < 0.25 || (remaining < 0.5 && (v < 0.2 || Math.abs(err) > 1.2)))) this.state = 'stop';
    else if (this.state === 'stop' && remaining > 0.8) this.state = 'walk';
    this.stopT = this.state === 'stop' ? (this.stopT || 0) + dt : 0;
    if (this.state === 'stop' && ((!c.step && v < 0.12 && S.footContact.L && S.footContact.R && this.pause <= 0) || this.stopT > 2.5)) {
      this.finish('arrived');
      return;
    }

    // ---- stuck (blocked, keeps tripping): re-plan, then give up
    this.progressT += dt;
    if (remaining < this.progressD - 0.3) {
      this.progressD = remaining;
      this.progressT = 0;
    } else if (this.progressT > 6) {
      this.progressT = 0;
      this.progressD = remaining;
      if (++this.stuck > 2) {
        this.finish('stuck');
        return;
      }
      nav.needsReplan = true;
    }

    // ---- gaze: where the feet are going - down at an obstacle coming up, else along the route
    this.obstacleAhead = this.scanAhead(P, 2.2);
    if (!c.threat) {
      if (this.obstacleAhead) this.look.set(this.obstacleAhead.x, this.obstacleAhead.y + 0.1, this.obstacleAhead.z);
      else {
        const lp = this.pointAlong(path, i, P, 3.0, _c);
        this.look.set(lp.x, S.floorY + 1.15, lp.z);
      }
      c.lookTarget = this.look;
    }
  }

  meanFootYaw() {
    const a = this.plantYaw('L'), b = this.plantYaw('R');
    return Math.atan2(Math.sin(a) + Math.sin(b), Math.cos(a) + Math.cos(b));
  }

  /** Yaw a foot was put down with (the stance ankle keeps it), else its current yaw. */
  plantYaw(s) {
    const p = this.planted;
    return p && p[s] !== null ? p[s] : this.ctl.footYaw(s);
  }

  /** A walking step has landed: remember the yaw the foot was put down with. */
  onLand(st) {
    const p = this.planted || (this.planted = { L: null, R: null });
    p[st.foot] = this.active ? st.yaw : null;
  }

  /** Point `dist` metres further along the route from the projection of P on the current leg. */
  pointAlong(path, i, P, dist, out) {
    const nav = this.ctl.nav;
    let prev = i > 0 ? path[i - 1] : nav.start;
    let w = path[i];
    let dx = w.x - prev.x, dz = w.z - prev.z;
    const l2 = dx * dx + dz * dz;
    const t = l2 > 1e-6 ? clamp(((P.x - prev.x) * dx + (P.z - prev.z) * dz) / l2, 0, 1) : 1;
    let x = prev.x + dx * t, z = prev.z + dz * t;
    let left = dist;
    let k = i;
    for (;;) {
      const sx = path[k].x - x, sz = path[k].z - z, sl = Math.hypot(sx, sz);
      if (sl >= left || k === path.length - 1) {
        const f = sl > 1e-6 ? Math.min(1, left / sl) : 0;
        return out.set(x + sx * f, path[k].y, z + sz * f);
      }
      left -= sl;
      x = path[k].x;
      z = path[k].z;
      k++;
    }
  }

  /** First spot ahead along the walking direction where the floor height changes (an obstacle). */
  scanAhead(P, range) {
    const c = this.ctl, S = c.sens;
    const base = S.floorY;
    for (let d = 0.4; d < range; d += 0.1) {
      const x = P.x + this.dir.x * d, z = P.z + this.dir.z * d;
      const y = c.floorAt(x, z, base);
      if (Math.abs(y - base) > 0.03) return _p.set(x, y, z);
    }
    return null;
  }

  // ------------------------------------------------------------------------------------------
  /**
   * Called by the balance controller between steps. Returns true when the gait handles stepping
   * this frame (it may start a step), false to leave it to the reactive balance (catch/settle).
   */
  gait(dt) {
    const c = this.ctl, S = c.sens;
    if (!this.stepping) return false;
    const v = Math.hypot(S.comVel.x, S.comVel.z);
    if (this.state === 'stop' && this.speed < 0.15 && v < 0.25 && S.cpDist < 0.02) {
      // nearly stopped inside the base of support: standing balance squares up the feet
      return false;
    }
    this.ds += dt;
    const foot = (this.nextFoot = this.chooseFoot()); // keep the choice while the weight shifts
    const stance = other(foot);
    if (!S.footContact[stance]) return false;
    // shuffle-free start and slow turning: shift the weight onto the stance foot before lifting
    // (anticipatory postural adjustment); at walking speed the sway from step to step does that
    if (v < 0.35) {
      if (!this.shift || this.shift.foot !== foot) this.shift = { foot, t: 0 };
      this.shift.t += dt;
      const sc = c.soleCenter(stance, _a), sw = c.soleCenter(foot, _b);
      const ax = sw.x - sc.x, az = sw.z - sc.z, al = Math.hypot(ax, az) || 1;
      const toward = ((S.cp.x - sc.x) * ax + (S.cp.z - sc.z) * az) / al;
      // (turning on the spot, the steps are small: a partial shift will do)
      const turning = Math.abs(this.err || 0) > 0.6;
      const ready = toward < (turning ? 0.07 : 0.05) || this.shift.t > (turning ? 0.4 : 0.7);
      if (!ready || this.shift.t < 0.1) return true;
    } else if (this.ds < this.dsTime(this.speed)) return true;
    this.shift = null;
    c.beginStep(foot, 'walk');
    this.nextFoot = stance;
    this.ds = 0;
    return true;
  }

  /** COM target while shifting weight before a step (overrides the support centre), or null. */
  shiftTarget(out) {
    if (!this.shift || !this.stepping) return false;
    const c = this.ctl;
    const st = c.soleCenter(other(this.shift.foot), _a), sw = c.soleCenter(this.shift.foot, _b);
    out.set(lerp(sw.x, st.x, 0.85), 0, lerp(sw.z, st.z, 0.85));
    out.x += this.dir.x * 0.03;
    out.z += this.dir.z * 0.03;
    return true;
  }

  chooseFoot() {
    const c = this.ctl, S = c.sens;
    if (this.nextFoot && S.footContact[other(this.nextFoot)]) return this.nextFoot;
    // starting off: into a turn the inside foot goes first (an open step, no crossing); straight
    // on, the trailing foot
    const err = wrapAngle(Math.atan2(this.dir.x, this.dir.z) - c.heading);
    if (Math.abs(err) > 0.45) return err > 0 ? 'L' : 'R';
    const a = c.soleCenter('L', _a), b = c.soleCenter('R', _b);
    const fL = a.x * this.dir.x + a.z * this.dir.z, fR = b.x * this.dir.x + b.z * this.dir.z;
    if (Math.abs(fL - fR) > 0.05) return fL < fR ? 'L' : 'R';
    if (Math.abs(err) > 0.2) return err > 0 ? 'L' : 'R';
    return S.footLoad.L < S.footLoad.R ? 'L' : 'R';
  }

  // ------------------------------------------------------------------------------------------
  /** Step parameters at the start of a walking step. */
  setupStep(st) {
    const c = this.ctl;
    const v = this.speed;
    // the turn this step makes (from where the stance foot points)
    const want = Math.atan2(this.dir.x, this.dir.z);
    const maxTurn = lerp(0.6, 0.35, clamp(v / 1.0, 0, 1));
    const from = this.plantYaw(st.stance);
    st.turnTo = from + clamp(wrapAngle(want - from), -maxTurn, maxTurn);
    // (a turn away from the swinging foot's side is limited: the legs would cross)
    const side = st.foot === 'L' ? 1 : -1;
    const tw = wrapAngle(st.turnTo - from);
    if (tw * side < -0.25) st.turnTo = from - side * 0.25;
    st.walkV = v;
    st.duration = this.swingTime(v);
    // antalgic gait: weight is taken off a hurt leg quickly (short stance on it, short swing of
    // the good leg over it)
    const hurt = c.legStrength[st.stance];
    if (hurt < 0.9) st.duration *= lerp(0.8, 1, clamp((hurt - 0.5) / 0.4, 0, 1));
    st.lift = 0.045 + 0.02 * v;
    st.terrainSide = 0;
    st.profile = null;
  }

  /** Landing spot of a walking step (ankle position), re-planned every frame of the swing. */
  planTarget(st, out) {
    const c = this.ctl, S = c.sens;
    const rem = Math.max(0.04, st.duration - st.t);
    const p = c.stancePivot(st.stance, _a, true);
    const w = S.w0;
    const e = Math.exp(w * rem);
    let xx = p.x + (S.cpB.x - p.x) * e, xz = p.z + (S.cpB.z - p.z) * e;
    // in the frame the foot will land in (turned with this step)
    const yaw = st.turnTo ?? c.heading;
    const hx = Math.sin(yaw), hz = Math.cos(yaw), lx = hz, lz = -hx;
    const v = this.state === 'stop' ? 0 : Math.min(this.speed, (st.walkV ?? this.speed) + 0.35);
    const T = this.swingTime(v) + this.dsTime(v);
    const eT = Math.exp(w * T);
    // speed feedback: the real body loses more to its joints and feet than the pendulum model, so
    // a walker that is slower than wanted puts the foot a little further behind the capture point
    const vAlong = S.comVel.x * this.dir.x + S.comVel.z * this.dir.z;
    const b = (v * T) / (eT - 1) + (v > 0.05 ? clamp(0.14 * (v - vAlong), -0.06, 0.08) : 0);
    const side = st.foot === 'L' ? 1 : -1;
    // stopping: the last step brings the capture point to the middle of the feet
    // (with a margin: the pendulum prediction is only so good, and a capture point that ends up
    // outside the stance foot could only be caught by crossing the legs)
    // (turning on the spot keeps the sway going, like walking in place: no new weight shift needed)
    const beta = this.state === 'stop' ? Math.max(0.09, this.width * 0.5) : Math.max(this.width / (1 + eT), 0.05);
    // walk along the route direction (the feet turn with the heading); drifted off the route
    // line, every foothold moves toward the drift so the body sways back onto it
    const ct = this.crossTrack;
    xx += -this.dir.x * b + lx * side * beta + this.dir.z * ct * 0.15;
    xz += -this.dir.z * b + lz * side * beta - this.dir.x * ct * 0.15;
    // relative to the stance foot, in the heading frame
    const sc = c.soleCenter(st.stance, _b);
    let fwd = (xx - sc.x) * hx + (xz - sc.z) * hz;
    let lat = (xx - sc.x) * lx + (xz - sc.z) * lz;
    const rawF = fwd, rawL = lat;
    // the feet are ~10 cm wide: side by side they need that much room (a foot well ahead or
    // behind may come closer to the midline)
    const minLat = lerp(0.13, 0.08, smoothstep(0.25, 0.45, Math.abs(fwd)));
    lat = side * clamp(side * lat, minLat, 0.42);
    fwd = clamp(fwd, -0.4, 0.85);
    const len = Math.hypot(fwd, lat);
    if (len > 0.92) {
      fwd *= 0.92 / len;
      lat *= 0.92 / len;
    }
    // what the foothold had to give up (it is clamped to a natural stride): the balance helper
    // nudges the body back so the steps stay feasible (see HumanController.commit)
    const vf = rawF - fwd, vl = rawL - lat;
    this.violation.set(hx * vf + lx * vl, 0, hz * vf + lz * vl);
    // a shove or a hit asks for more than a walking step can give: this one becomes a catch step
    // (crossovers allowed) and walking resumes once the balance is back
    // (around obstacles the footholds are deliberately off the pendulum's choice: only a big miss)
    if (Math.hypot(vf, vl) > (this.obstacleAhead ? 0.35 : 0.2) && st.t > 0.03) {
      this.violation.setZero();
      if (globalThis.__walkDebug) console.log('toCatch', st.foot, 'raw', rawF.toFixed(2), rawL.toFixed(2), 'clamped', fwd.toFixed(2), lat.toFixed(2), 'phase', (st.t / st.duration).toFixed(2));
      st.kind = 'catch';
      this.pause = Math.max(this.pause, 0.8);
      this.nextFoot = null;
      return c.planStepTarget(out);
    }
    // ankle sits behind the sole centre
    out.x = sc.x + hx * fwd + lx * lat - hx * 0.058;
    out.z = sc.z + hz * fwd + lz * lat - hz * 0.058;
    this.terrainAdjust(st, out, hx, hz, sc.y);
    return out;
  }

  /**
   * Sole outline samples of a foot with its ankle at (ax, az): lo/hi of the surface under the sole
   * (with a few cm to spare: the foot never lands exactly where it was sent) and `front`, the
   * highest surface a little in front of the toes.
   */
  footprint(ax, az, hx, hz, ref, res) {
    const lx = hz, lz = -hx;
    let lo = Infinity, hi = -Infinity, front = -Infinity;
    for (const [f, l] of FOOT_SAMPLES) {
      const y = this.ctl.floorAt(ax + hx * f + lx * l, az + hz * f + lz * l, ref);
      if (y < lo) lo = y;
      if (y > hi) hi = y;
    }
    for (const f of [TOE + 0.08, TOE + 0.11]) front = Math.max(front, this.ctl.floorAt(ax + hx * f, az + hz * f, ref));
    // ...and whether that is somewhere to stand (a stair tread, a platform: it stays up for a
    // foot's length) rather than something to step over (a plank, a log, a narrow kerb)
    let standable = true;
    if (front > hi + 0.02) {
      for (let f = TOE + 0.1; f <= TOE + 0.34 && standable; f += 0.06) if (this.ctl.floorAt(ax + hx * f, az + hz * f, ref) < front - 0.02) standable = false;
    }
    res.lo = lo;
    res.hi = hi;
    res.front = front;
    res.standable = standable;
    return res;
  }

  /**
   * Keep footholds flat and reachable: a spot on an edge, on top of a log or up a step that is too
   * high is moved along the walking direction to the nearest good one (keeping the side chosen
   * before, so the plan does not flip between in front of and behind an obstacle). Sets out.y.
   */
  terrainAdjust(st, out, hx, hz, ref) {
    const res = this._fp || (this._fp = { lo: 0, hi: 0 });
    // a good foothold: flat under the sole, reachable, and not right in front of something to be
    // stepped over (the next swing needs room to get the toes up and over it); right in front of a
    // stair or a platform is fine - that is where one steps up from
    const ok = (x, z) => {
      this.footprint(x, z, hx, hz, ref, res);
      return res.hi - res.lo < 0.03 && Math.abs(res.hi - ref) <= MAX_RISE && (res.front - res.hi < 0.02 || (res.standable && res.front - res.hi < MAX_RISE));
    };
    if (!this.ctl.world.staticBodies.length) {
      out.y = this.ctl.world.groundY + ANKLE_H;
      return out;
    }
    if (ok(out.x, out.z)) {
      out.y = res.hi + ANKLE_H;
      return out;
    }
    const x0 = out.x, z0 = out.z;
    // which way to move it: the side chosen before; a swing already set to cross something keeps
    // crossing; otherwise past the obstacle if that is still a normal stride (people lengthen the
    // step rather than stop short and then have to cross from right in front of it)
    let pref = st.terrainSide || (st.profile ? 1 : 0);
    if (!pref) {
      const sc = this.ctl.soleCenter(st.stance, _c);
      const len = (x0 - sc.x) * hx + (z0 - sc.z) * hz;
      pref = len < 0.45 ? 1 : -1;
    }
    let found = false;
    for (let k = 1; k <= 10 && !found; k++) {
      const d = k * 0.035;
      const order = pref > 0 ? [d, -d] : [-d, d];
      for (const s of order) {
        if (ok(x0 + hx * s, z0 + hz * s)) {
          out.x = x0 + hx * s;
          out.z = z0 + hz * s;
          if (!st.terrainSide) st.terrainSide = Math.sign(s);
          found = true;
          break;
        }
      }
    }
    if (!found) {
      // nothing good nearby: a shorter step onto anything flat and reachable (never a spot the foot
      // cannot get to - say the top of a flight of stairs - nor one up in the air)
      const flat = (x, z) => {
        this.footprint(x, z, hx, hz, ref, res);
        return res.hi - res.lo < 0.03 && Math.abs(res.hi - ref) <= MAX_RISE;
      };
      for (let k = 11; k <= 22 && !found; k++) {
        if (flat(x0 - hx * k * 0.035, z0 - hz * k * 0.035)) {
          out.x = x0 - hx * k * 0.035;
          out.z = z0 - hz * k * 0.035;
          found = true;
        }
      }
      if (!found) {
        this.footprint(x0, z0, hx, hz, ref, res);
        res.hi = Math.min(res.hi, ref + MAX_RISE);
      }
    }
    out.y = res.hi + ANKLE_H;
    return out;
  }

  /**
   * Swing height profile: the lowest the ankle may be at each fraction of the swing so that the
   * whole sole (heel to toe) clears what is under it with a margin, spread out at a climb angle the
   * leg can follow. Rebuilt whenever the landing spot moves.
   */
  buildProfile(st) {
    const c = this.ctl;
    if (!c.world.staticBodies.length) {
      st.profile = null;
      return;
    }
    const N = 20;
    const prof = st.profile || (st.profile = new Float32Array(N + 1));
    const sx = st.start.x, sz = st.start.z, tx = st.target.x, tz = st.target.z;
    const dx = tx - sx, dz = tz - sz, D = Math.hypot(dx, dz) || 1e-3;
    const ux = dx / D, uz = dz / D;
    const ref = Math.max(st.start.y, st.target.y) - ANKLE_H;
    let any = false;
    for (let k = 0; k <= N; k++) {
      const u = k / N;
      const ax = sx + dx * u, az = sz + dz * u;
      let hi = -Infinity;
      for (const f of [-HEEL - 0.03, 0, 0.08, 0.15, TOE, TOE + 0.05]) hi = Math.max(hi, c.floorAt(ax + ux * f, az + uz * f, ref));
      const base = lerp(st.start.y, st.target.y, u) - ANKLE_H;
      if (hi > base + 0.015) any = true;
      // (the toes hang below the ankle-heel line when the foot is not lifted level: some margin)
      prof[k] = hi + ANKLE_H + 0.065;
    }
    if (!any) {
      st.profile = null;
      return;
    }
    // climb-angle limit: the foot rises (and drops) at most ~1.3 m per metre of travel
    const tmp = this._tmp || (this._tmp = new Float32Array(N + 1));
    for (let k = 0; k <= N; k++) {
      let m = prof[k];
      for (let j = 0; j <= N; j++) m = Math.max(m, prof[j] - 1.3 * Math.abs(k - j) / N * D);
      tmp[k] = m;
    }
    prof.set(tmp);
    st.profileTop = Math.max(...tmp) - Math.max(st.start.y, st.target.y);
  }

  /** Furthest swing progress (0..1) the foot may make with its ankle at height `ay`. */
  progressGate(st, ay) {
    const prof = st.profile;
    if (!prof) return 1;
    const N = prof.length - 1;
    for (let k = Math.ceil((st.u || 0) * N); k <= N; k++) if (prof[k] > ay + 0.05) return Math.max(0, (k - 1) / N);
    return 1;
  }

  /**
   * Ankle height to aim for at swing progress u (0..1): the clearance needed over the next stretch
   * (the foot rises ahead of what it has to clear), or -Infinity without a profile.
   */
  profileAt(st, u, ahead = 0.2) {
    const prof = st.profile;
    if (!prof) return -Infinity;
    const N = prof.length - 1;
    const f = clamp(u, 0, 1) * N, k = Math.min(N - 1, Math.floor(f)), t = f - k;
    let m = prof[k] * (1 - t) + prof[k + 1] * t;
    for (let j = k + 1; j <= Math.min(N, Math.ceil((u + ahead) * N)); j++) m = Math.max(m, prof[j]);
    return m;
  }

  /**
   * Heel-off of the trailing stance foot: in late stance the foot rolls onto its ball, which lifts
   * the ankle and keeps that leg long (without it a long stride forces the pelvis down into a
   * crouch, and a crouched stance leg brakes every step), and the calf pushes the body on. Writes
   * the ankle position for the rolled foot into `ankleOut`; returns the foot pitch (rad, toes down).
   */
  heelOff(s, dt, ankleOut) {
    const c = this.ctl, S = c.sens;
    const heel = this.heel || (this.heel = { L: 0, R: 0 });
    const hx = Math.sin(c.heading), hz = Math.cos(c.heading);
    const a = c.ankleWorld(s, ankleOut);
    const o = c.ankleWorld(other(s), _b);
    const pel = c.seg.pelvis.body.pos;
    const back = -((a.x - pel.x) * hx + (a.z - pel.z) * hz);
    const lead = (o.x - a.x) * hx + (o.z - a.z) * hz;
    if (c.step && c.step.foot === s) {
      // swinging: the next stance starts flat-footed
      heel[s] = 0;
      return 0;
    }
    let goal = 0;
    if (this.stepping && S.footContact[s] && lead > 0.12) goal = clamp((back - 0.06) * 2.0, 0, 0.6);
    heel[s] = approach(heel[s], goal, (goal > heel[s] ? 3.5 : 6) * dt);
    const th = heel[s];
    if (th < 0.01) return 0;
    // roll about the ball of the foot, where it is now
    const fb = c.seg['foot' + s].body;
    const ball = fb.localToWorld(BALL, _c);
    const rel = _p.subVectors(c.geo['ankleInFoot' + s], BALL);
    // rotate the foot-frame offset by (foot yaw) * (pitch toes down)
    const yaw = c.footYaw(s), cy = Math.cos(yaw), sy = Math.sin(yaw), cp = Math.cos(th), sp = Math.sin(th);
    const ry = rel.y * cp - rel.z * sp, rz = rel.y * sp + rel.z * cp;
    ankleOut.set(ball.x + rel.x * cy + rz * sy, Math.max(ball.y, S.footFloor[s]) + ry, ball.z - rel.x * sy + rz * cy);
    return th;
  }

  /** Arm swing (shoulder flexion, rad) from where the feet are: each arm swings with the opposite leg. */
  armSwing() {
    const c = this.ctl, S = c.sens;
    const v = Math.hypot(S.comVel.x, S.comVel.z);
    if (v < 0.15 && !c.step) return 0;
    const hx = Math.sin(c.heading), hz = Math.cos(c.heading);
    const a = c.ankleWorld('L', _a), b = c.ankleWorld('R', _b);
    const d = (b.x - a.x) * hx + (b.z - a.z) * hz; // > 0: right foot ahead
    return -clamp(d * 0.55, -0.42, 0.42) * clamp(v / 0.8, 0, 1);
  }

  /** Pelvic rotation (yaw, rad): the hip of the forward leg comes forward with it. */
  pelvisYaw() {
    const c = this.ctl, S = c.sens;
    const v = Math.hypot(S.comVel.x, S.comVel.z);
    const hx = Math.sin(c.heading), hz = Math.cos(c.heading);
    const a = c.ankleWorld('L', _a), b = c.ankleWorld('R', _b);
    const d = (b.x - a.x) * hx + (b.z - a.z) * hz;
    return clamp(d * 0.14, -0.09, 0.09) * clamp(v / 0.8, 0, 1);
  }
}

export { SIDES };
