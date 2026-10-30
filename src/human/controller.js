import { Vec3, Quat, clamp, lerp, smoothstep, approach, noise1, wrapAngle } from '../physics/math.js';
import { DRIVE_RELATIVE, DRIVE_WORLD, RelativePointSpring } from '../physics/joints.js';
import { landmark, DIRS } from './anatomy.js';
import { twoBoneIK, makeIKResult, boneRotation } from './ik.js';
import { Locomotion } from './locomotion.js';

const G = 9.81;
const UP = new Vec3(0, 1, 0);
const FWD = new Vec3(0, 0, 1);
const LAT = new Vec3(1, 0, 0);
// settling face down: trunk roll stiffness (N*m per unit of side tilt) and torque bound (N*m)
const TILT_K = 120, TILT_MAX = 80;
const SIDES = ['L', 'R'];

const _v0 = new Vec3();
const _v1 = new Vec3();
const _v2 = new Vec3();
const _v3 = new Vec3();
const _q0 = new Quat();
const _q1 = new Quat();
const _q2 = new Quat();

function yawQuat(yaw, out = new Quat()) {
  return out.setFromAxisAngle(UP, yaw);
}

function yawOf(q) {
  _v0.set(0, 0, 1).applyQuat(q);
  return Math.atan2(_v0.x, _v0.z);
}

// 2D convex hull (x,z) — monotone chain. pts: array of {x,z}
function convexHull(pts) {
  if (pts.length < 3) return pts.slice();
  const p = pts.slice().sort((a, b) => a.x - b.x || a.z - b.z);
  const cross = (o, a, b) => (a.x - o.x) * (b.z - o.z) - (a.z - o.z) * (b.x - o.x);
  const lower = [];
  for (const q of p) {
    while (lower.length >= 2 && cross(lower[lower.length - 2], lower[lower.length - 1], q) <= 0) lower.pop();
    lower.push(q);
  }
  const upper = [];
  for (let i = p.length - 1; i >= 0; i--) {
    const q = p[i];
    while (upper.length >= 2 && cross(upper[upper.length - 2], upper[upper.length - 1], q) <= 0) upper.pop();
    upper.push(q);
  }
  upper.pop();
  lower.pop();
  return lower.concat(upper);
}

// Signed distance from point to convex polygon (negative inside) + closest point.
function polygonDistance(poly, x, z, closest) {
  if (poly.length === 0) return Infinity;
  if (poly.length === 1) {
    closest.x = poly[0].x;
    closest.z = poly[0].z;
    return Math.hypot(x - poly[0].x, z - poly[0].z);
  }
  let inside = poly.length >= 3;
  let best = Infinity;
  for (let i = 0; i < poly.length; i++) {
    const a = poly[i], b = poly[(i + 1) % poly.length];
    const ex = b.x - a.x, ez = b.z - a.z;
    const len2 = ex * ex + ez * ez || 1e-12;
    let t = ((x - a.x) * ex + (z - a.z) * ez) / len2;
    t = clamp(t, 0, 1);
    const cx = a.x + ex * t, cz = a.z + ez * t;
    const d = Math.hypot(x - cx, z - cz);
    if (d < best) {
      best = d;
      closest.x = cx;
      closest.z = cz;
    }
    // CCW hull: inside if left of every edge
    if (ex * (z - a.z) - ez * (x - a.x) < 0) inside = false;
  }
  return inside ? -best : best;
}

/**
 * Procedural, physics-driven motor control for the ragdoll (no canned animation). Every frame it
 * senses the body (COM, capture point, contacts), picks behaviours (balance, reactive stepping,
 * protective falling, bracing, wound holding, writhing, limpness), turns them into target poses
 * via IK, and drives the joints with muscle-like implicit PD springs whose strength depends on
 * consciousness, pain and injuries.
 */
export class HumanController {
  constructor(ragdoll, opts = {}) {
    this.rd = ragdoll;
    this.world = ragdoll.world;
    this.seg = ragdoll.segments;
    this.jt = ragdoll.joints;
    this.time = 0;
    this.mode = 'balance';
    this.modeTime = 0;
    this.tone = 1; // global muscle tone 0..1
    this.toneTarget = 1;
    this.legStrength = { L: 1, R: 1 };
    this.armStrength = { L: 1, R: 1 };
    this.spineStrength = 1;
    this.neckStrength = 1;
    this.balanceSkill = 1; // reduced by concussion / blood loss
    this.autoGetUp = true; // get back up after a fall when able
    this.respiration = 1; // breathing depth (set by the injury model)
    // Balance assist (Euphoria-style helper forces): an upright torque on pelvis and chest plus
    // partial weight support while the character is in control. It fades out as soon as balance is
    // judged lost, so falls stay fully physical. Exposed as a slider in the UI.
    this.assistGain = 1.0;
    this.stepAssist = 1.0;
    this.vAssist = 0.3;
    this.chestAssist = 1.0;
    this.assist = 1;
    this.alive = true;
    this.conscious = true;
    this.pain = 0;
    this.fear = 0;
    this.startle = 0;
    this.lookTarget = null;
    this.armTask = { L: null, R: null }; // behaviour override per arm
    this.wounds = []; // [{body, segment, local: Vec3, normal: Vec3 (outward), priority}] from the injury model
    this.threat = null; // incoming object {point, from, tti, miss} set by the perception layer
    this.flinch = { amount: 0, kind: 'torso', side: 0, time: -1 };
    this.dodge = new Vec3();
    this.holding = { L: null, R: null };
    this.events = [];
    this.debug = { cp: new Vec3(), com: new Vec3(), support: [], stepTarget: null };
    this.rng = opts.rng ?? Math.random;
    this.seed = this.rng() * 100;

    this.initGeometry();
    // swing-foot end-effector springs (leg muscles pulling the foot relative to the pelvis)
    this.footSpring = {};
    for (const s of SIDES) {
      const sp = new RelativePointSpring(this.seg['foot' + s].body, this.geo['ankleInFoot' + s], this.seg.pelvis.body, this.geo['hipAnchor' + s], {
        compliance: 1 / 2500,
        maxForce: 200,
        damping: 5,
      });
      this.footSpring[s] = sp;
      this.world.addConstraint(sp);
    }
    this.loco = new Locomotion(this);
    this.nav = null; // walking route: { path, goals, start, i, done, status, ... }
    this.crowd = null; // other people nearby (set by the sandbox) for walking around them
    this.cmd = {};
    for (const j of ragdoll.jointList) {
      const def = j.userData.def;
      this.cmd[j.name] = { mode: DRIVE_RELATIVE, target: new Quat(), k: def.k, d: def.d, tmax: def.tmax, act: 1 };
    }
    this.step = null;
    this.lastStepEnd = -1;
    this.stepCount = 0;
    this.fallDir = new Vec3(0, 0, 1);
    this.heading = 0;
    this.groundTime = 0;
    this.sens = {
      com: new Vec3(),
      comVel: new Vec3(),
      cp: new Vec3(),
      cpB: new Vec3(), // capture point without the swing leg (see sense)
      footContact: { L: false, R: false },
      footLoad: { L: 0, R: 0 },
      footFloor: { L: 0, R: 0 }, // height of the surface each foot stands on (or is above)
      floorY: 0,
      support: [],
      cpDist: 0,
      cpClosest: { x: 0, z: 0 },
      upTilt: 0,
      chestTilt: 0,
      pelvisH: 0,
      headH: 0,
      groundParts: 0,
    };
    this.resetState();
  }

  initGeometry() {
    const rd = this.rd;
    const g = {};
    for (const s of SIDES) {
      const hip = landmark('hip' + s), knee = landmark('knee' + s), ankle = landmark('ankle' + s);
      const sh = landmark('shoulder' + s), el = landmark('elbow' + s), wr = landmark('wrist' + s);
      g['L1' + s] = hip.distanceTo(knee);
      g['L2' + s] = knee.distanceTo(ankle);
      g['A1' + s] = sh.distanceTo(el);
      g['A2' + s] = el.distanceTo(wr);
      g['thighDir' + s] = new Vec3().subVectors(knee, hip).normalize();
      g['shinDir' + s] = new Vec3().subVectors(ankle, knee).normalize();
      g['uarmDir' + s] = new Vec3().subVectors(el, sh).normalize();
      g['farmDir' + s] = new Vec3().subVectors(wr, el).normalize();
      // hinge axes in the IK convention (pole x boneDir)
      g['legAxis' + s] = new Vec3().crossVectors(FWD, new Vec3().subVectors(ankle, hip).normalize()).normalize();
      g['armAxis' + s] = new Vec3().crossVectors(new Vec3(0, 0, -1), new Vec3().subVectors(wr, sh).normalize()).normalize();
      // anchors
      const pel = rd.segments.pelvis, chest = rd.segments.chest;
      g['hipAnchor' + s] = new Vec3().subVectors(hip, pel.bindPos);
      g['shoulderAnchor' + s] = new Vec3().subVectors(sh, chest.bindPos);
      const foot = rd.segments['foot' + s];
      g['ankleInFoot' + s] = new Vec3().subVectors(ankle, foot.bindPos); // ankle relative to foot COM
      const hand = rd.segments['hand' + s];
      g['wristInHand' + s] = new Vec3().subVectors(wr, hand.bindPos);
      g['palmInHand' + s] = new Vec3(s === 'L' ? -0.02 : 0.02, -0.01, 0.005); // palm surface (medial side in bind)
      // hand frame in the bind pose: fingers along the forearm, palm facing the thigh
      const fdir = new Vec3().subVectors(wr, el).normalize();
      const eW = new Vec3(0, 0, 1).addScaled(fdir, -fdir.z).normalize();
      const palm = new Vec3().crossVectors(fdir, eW).normalize();
      if (s === 'R') palm.negate();
      g['handBasis' + s] = new Quat().setFromBasis(palm, fdir, new Vec3().crossVectors(palm, fdir));
    }
    g.pelvisBindY = rd.segments.pelvis.bindPos.y;
    g.chestBind = rd.segments.chest.bindPos.clone();
    g.headBind = rd.segments.head.bindPos.clone();
    this.geo = g;
  }

  resetState() {
    this.mode = 'balance';
    this.modeTime = 0;
    this.tone = 1;
    this.toneTarget = 1;
    this.assist = 1;
    this.step = null;
    this.stepCount = 0;
    this.lastStepEnd = -1;
    this.groundTime = 0;
    this.startle = 0;
    this.heading = yawOf(this.rd.pelvis.rot);
    this.recover = 0;
    this.comInt = new Vec3();
    this.servo = { kp: 0.6, kd: 0.4, ki: 0.4 };
    this.settleFoot = null;
    this.settleTime = 0;
    this.awkwardTime = 0;
    this.resetGetUp();
  }

  setMode(m) {
    if (m === this.mode) return;
    this.events.push({ type: 'mode', from: this.mode, to: m, time: this.time });
    this.mode = m;
    this.modeTime = 0;
    if (m !== 'balance') {
      this.step = null;
      // standing reactions do not carry over into a fall or a get-up (and from there back into
      // the next stand): no windmilling arms or head snap left over from before
      this.wmAmount = 0;
      if (this.wmDir) this.wmDir.setZero();
      if (this.snap) this.snap.t0 = -9;
      if (this.attention) this.attention.until = 0;
    }
    if (m === 'getup') {
      this.gu = null;
      this.guReplans = 0;
    }
  }

  // ------------------------------------------------------------------------------------------
  // Walking orders (the route comes from the sandbox's planner; see locomotion.js for the gait)
  walkTo(path, goals = null, opts = {}) {
    if (!path || !path.length) return;
    const pel = this.seg.pelvis.body.pos;
    this.nav = {
      path: path.map((p) => p.clone()),
      goals: (goals || [path[path.length - 1]]).map((g) => g.clone()),
      goalEnds: opts.goalEnds || null,
      goalIndex: 0,
      start: new Vec3(pel.x, 0, pel.z),
      i: 0,
      done: false,
      status: 'walking',
      needsReplan: false,
      speed: opts.speed,
    };
    this.loco.begin();
  }

  /** New route for the current walk (after a re-plan); keeps the gait going. */
  updateRoute(path, goalEnds = null) {
    if (!this.nav || !path || !path.length) return;
    const pel = this.seg.pelvis.body.pos;
    this.nav.path = path.map((p) => p.clone());
    this.nav.start = new Vec3(pel.x, 0, pel.z);
    this.nav.i = 0;
    if (goalEnds) this.nav.goalEnds = goalEnds;
  }

  stopWalk(status = 'stopped') {
    if (!this.nav || this.nav.done) return;
    this.loco.finish(status);
  }

  get walking() {
    return !!this.nav && !this.nav.done && this.loco.active;
  }

  /** Back to standing balance after a dip (fresh balance-controller state from the current pose). */
  resumeBalance() {
    const pel = this.seg.pelvis.body;
    this.heading = yawOf(pel.rot);
    this.cdes = null;
    this.pelvisYTarget = pel.pos.y;
    this.comInt.setZero();
    this.settleFoot = null;
    this.kneel = null;
    this.setMode('balance');
  }

  // ------------------------------------------------------------------------------------------
  sense() {
    const rd = this.rd, S = this.sens;
    rd.computeCOM(S.com);
    rd.computeCOMVelocity(S.comVel);
    // the floor under each foot: where its sole touches (the floor, a step, a kerb), else the
    // surface straight below it
    let floor = Infinity;
    for (const s of SIDES) {
      const fb = this.seg['foot' + s].body;
      let y;
      if (fb.groundContactUsed) {
        y = 0;
        for (let k = 0; k < fb.groundContactUsed; k++) y += fb.groundContactPoints[k].y;
        y /= fb.groundContactUsed;
      } else y = this.world.surfaceAt(fb.pos.x, fb.pos.z, fb.pos.y + 0.02);
      S.footFloor[s] = y;
      if (fb.groundContact) floor = Math.min(floor, y);
    }
    // standing height reference: the lower of the supporting feet, else what is below the pelvis
    const pb = this.seg.pelvis.body;
    if (floor === Infinity) floor = this.world.surfaceAt(pb.pos.x, pb.pos.z, pb.pos.y);
    S.floorY = floor;
    const gy = floor;
    const h = Math.max(0.3, S.com.y - gy);
    const w0 = Math.sqrt(G / h);
    S.w0 = w0;
    S.cp.set(S.com.x + S.comVel.x / w0, gy, S.com.z + S.comVel.z / w0);
    const weight = rd.totalMass * G / 60;
    const pts = [];
    for (const s of SIDES) {
      const fb = this.seg['foot' + s].body;
      const load = fb.groundImpulse / weight;
      S.footLoad[s] = load;
      S.footContact[s] = fb.groundContact && load > 0.03;
      // base of support: sole corners of a grounded foot that are close to the floor
      if (fb.groundContact) {
        const sh = fb.shapes[0];
        const e = sh.halfExtents;
        for (let i = 0; i < 4; i++) {
          _v0.set(i & 1 ? e.x : -e.x, -e.y - sh.radius, i & 2 ? e.z + sh.radius * 0.5 : -e.z - sh.radius * 0.5).add(sh.localPos);
          fb.localToWorld(_v0, _v1);
          if (_v1.y < S.footFloor[s] + 0.03) pts.push({ x: _v1.x, z: _v1.z });
        }
      }
    }
    S.support = convexHull(pts);
    S.cpDist = polygonDistance(S.support, S.cp.x, S.cp.z, S.cpClosest);
    // capture point of the body the stance leg carries: a swinging leg's own fast motion (internal,
    // ~16% of the mass at up to 4 m/s) makes the whole-body capture point surge and fall back
    // within one swing, so foot placement is planned from the rest of the body
    if (this.step) {
      const sw = this.step.foot;
      let m = 0;
      _v2.setZero();
      _v3.setZero();
      for (const sg of rd.segList) {
        const n = sg.name;
        if (n.endsWith(sw) && (n.startsWith('thigh') || n.startsWith('shin') || n.startsWith('foot'))) continue;
        for (let k = -1; k < (sg.fractured ? sg.fractured.extra.length : 0); k++) {
          const b = k < 0 ? sg.body : sg.fractured.extra[k];
          _v2.addScaled(b.pos, b.mass);
          _v3.addScaled(b.vel, b.mass);
          m += b.mass;
        }
      }
      _v2.scale(1 / m);
      _v3.scale(1 / m);
      S.cpB.set(_v2.x + _v3.x / w0, gy, _v2.z + _v3.z / w0);
    } else S.cpB.copy(S.cp);
    S.comDist = polygonDistance(S.support, S.com.x, S.com.z, {});
    const pel = this.seg.pelvis.body, chest = this.seg.chest.body, head = this.seg.head.body;
    _v0.set(0, 1, 0).applyQuat(pel.rot);
    S.upTilt = Math.acos(clamp(_v0.y, -1, 1));
    _v0.set(0, 1, 0).applyQuat(chest.rot);
    S.chestTilt = Math.acos(clamp(_v0.y, -1, 1));
    S.pelvisH = pel.pos.y - gy;
    S.headH = head.pos.y - gy;
    let gp = 0;
    for (const seg of this.rd.segList) {
      if (seg.name.startsWith('foot')) continue;
      if (seg.body.groundContact) gp++;
    }
    S.groundParts = gp;
    S.torsoGround = this.seg.chest.body.groundContact || this.seg.pelvis.body.groundContact || this.seg.abdomen.body.groundContact;
    this.debug.cp.copy(S.cp);
    this.debug.com.copy(S.com);
    this.debug.support = S.support;
  }

  // ------------------------------------------------------------------------------------------
  update(dt) {
    this.time += dt;
    this.modeTime += dt;
    this.events.length = 0;
    this.sense();
    for (const s of SIDES) this.footSpring[s].enabled = false;
    this.startle = Math.max(0, this.startle - dt * 2.5);
    if (this.threat) this.lastThreatTime = this.time;
    this.flinch.amount *= Math.exp(-dt / 0.35);
    // breathing: ~13/min at rest, faster with exertion, pain and blood loss; none without drive
    if (this.alive && this.respiration > 0) {
      const rate = clamp(13 + 10 * this.pain + (this.respRateBoost || 0), 8, 40);
      this.breathPhase = (this.breathPhase || 0) + dt * (rate / 60) * Math.PI * 2;
    }
    this.breath = this.alive && this.respiration > 0 ? Math.sin(this.breathPhase || 0) * this.respiration : 0;
    this.updateMode(dt);
    this.loco.update(dt);
    // global tone dynamics: muscles relax over ~0.3 s on death / knockout, recover slower
    const rate = this.toneTarget < this.tone ? 3.5 : 1.2;
    this.tone = approach(this.tone, this.toneTarget, rate * dt);

    switch (this.mode) {
      case 'balance':
        this.doBalance(dt);
        break;
      case 'falling':
        this.doFalling(dt);
        break;
      case 'ground':
        this.doGround(dt);
        break;
      case 'getup':
        this.doGetUp(dt);
        break;
      default:
        this.doLimp(dt);
    }
    this.applyArmTasks(dt);
    this.commit();
    this.applyGravityCompensation();
  }

  updateMode(dt) {
    const S = this.sens;
    if (!this.alive) {
      this.toneTarget = 0;
      this.setMode('dead');
      return;
    }
    if (!this.conscious) {
      this.toneTarget = 0.04;
      this.setMode('unconscious');
      return;
    }
    this.toneTarget = 1;
    const legsOk = Math.min(this.legStrength.L, this.legStrength.R) > 0.35 && this.legStrength.L + this.legStrength.R > 1.0;
    if (this.mode === 'unconscious' || this.mode === 'dead') {
      if (this.mode === 'unconscious') this.wokeAt = this.time; // dazed for a while after coming round
      this.setMode('ground');
    }
    if (this.mode === 'balance') {
      this.airborne = !S.footContact.L && !S.footContact.R ? (this.airborne || 0) + dt : 0;
      const lost =
        S.upTilt > 0.62 ||
        S.chestTilt > 0.8 ||
        S.pelvisH < 0.55 ||
        (this.airborne > 0.3 && S.com.y < 0.85) ||
        (S.cpDist > 0.75 && S.cpDist < 1e3 && this.step === null) ||
        !legsOk;
      if (lost && (this.modeTime > 0.25 || !legsOk)) {
        this.fallDir.set(S.comVel.x, 0, S.comVel.z);
        if (this.fallDir.lengthSq() < 0.01) {
          _v0.set(0, 1, 0).applyQuat(this.seg.chest.body.rot);
          this.fallDir.set(_v0.x, 0, _v0.z);
        }
        this.fallDir.normalize();
        // legs giving way under a body that is not being thrown anywhere: the knees fold and the
        // person drops onto them (Euphoria's "fall to knees") instead of toppling like a pole
        this.fallCause = !legsOk && Math.hypot(S.comVel.x, S.comVel.z) < 0.7 && S.upTilt < 0.45 ? 'legs' : 'balance';
        this.kneel = null;
        this.setMode('falling');
      }
    } else if (this.mode === 'falling') {
      const k = this.fallCause === 'legs' ? this.kneel : null;
      // a momentary buckle: legs that come back early in the drop catch the dip (the knee
      // extensors brake it while the body is still high over its feet; the soles may be all but
      // unloaded while it drops); later the knees are going to the floor anyway, and someone in
      // severe pain (a gut shot) lets them go rather than fighting to stay up
      const feet = this.seg.footL.body.groundContact && this.seg.footR.body.groundContact;
      if (k && k.phase === 'drop' && legsOk && this.pain < 0.8 && S.pelvisH > 0.74 && this.seg.pelvis.body.vel.y > -1.0 && feet && S.upTilt < 0.35) {
        this.resumeBalance();
        return;
      }
      // down on hands and knees and fit to get up: that is where a get-up starts from
      if (k && k.ready === 'getup' && this.ableToGetUp()) {
        this.setMode('getup');
        return;
      }
      // landed only once the head has come to rest too: the bracing arms and the neck keep
      // protecting it until then (releasing them as the chest touches drops the face on the floor)
      let settled = S.torsoGround && this.rd.computeCOMVelocity(_v0).length() < 0.6 && this.seg.head.body.vel.length() < 0.5;
      // going down from the knees, the arms let the chest down slowly: it is only over once the
      // chest itself rests on the floor and the head is low (softening the neck and arms while
      // they still hold the chest up would drop the face onto the concrete)
      if (k) settled = settled && this.seg.chest.body.groundContact && this.seg.head.body.pos.y - this.world.groundY < 0.22;
      // a fall to the knees runs its own course (kneeling, going down onto the hands)
      if (settled || this.modeTime > (k ? 12 : 2.5)) this.setMode('ground');
    } else if (this.mode === 'ground') {
      // body back up somehow (e.g. dragged): resume balance attempt if feet are under it
      if (S.footContact.L && S.footContact.R && S.pelvisH > 0.8 && S.upTilt < 0.3) this.standUp();
      else if (this.wantsToGetUp(dt)) this.setMode('getup');
    } else if (this.mode === 'getup') {
      if (this.modeTime > 14) this.failGetUp('timeout');
      else if (!this.ableToGetUp(true)) this.failGetUp('unable');
      else if (this.getUpToppling()) this.failGetUp('toppled');
    }
  }

  // ------------------------------------------------------------------------------------------
  // Commands
  setRel(name, q, k, d, tmax) {
    const c = this.cmd[name];
    if (!c) return;
    c.mode = DRIVE_RELATIVE;
    c.target.copy(q);
    if (k !== undefined) c.k = k;
    if (d !== undefined) c.d = d;
    if (tmax !== undefined) c.tmax = tmax;
  }

  setWorld(name, q, k, d, tmax) {
    const c = this.cmd[name];
    if (!c) return;
    c.mode = DRIVE_WORLD;
    c.target.copy(q);
    if (k !== undefined) c.k = k;
    if (d !== undefined) c.d = d;
    if (tmax !== undefined) c.tmax = tmax;
  }

  // Target angular velocity from the change of a world-space target (feed-forward for tracking).
  feedForward(name, target, dt) {
    const c = this.cmd[name];
    if (!c.prevTarget) c.prevTarget = new Quat().copy(target);
    _q2.multiplyConjB(target, c.prevTarget).toRotVec(c.ffVel || (c.ffVel = new Vec3()));
    c.ffVel.scale(1 / dt);
    if (c.ffVel.length() > 20) c.ffVel.setZero();
    c.prevTarget.copy(target);
    c.ff = true;
  }

  gains(name, scale = 1) {
    const def = this.jt[name].userData.def;
    const c = this.cmd[name];
    c.k = def.k * scale;
    c.d = def.d * Math.sqrt(scale);
    c.tmax = def.tmax;
    return c;
  }

  regionStrength(name) {
    const last = name[name.length - 1];
    if (name.startsWith('hip') || name.startsWith('knee') || name.startsWith('ankle')) return this.legStrength[last];
    if (name.startsWith('shoulder') || name.startsWith('elbow') || name.startsWith('wrist')) return this.armStrength[last];
    if (name.startsWith('neck')) return this.neckStrength;
    return this.spineStrength;
  }

  commit() {
    const tone = this.tone;
    for (const j of this.rd.jointList) {
      const c = this.cmd[j.name];
      const str = this.regionStrength(j.name);
      const act = tone * str * c.act;
      // passive tissue: weak spring toward the commanded pose + viscous damping
      const kp = 3, dp = 0.9, tp = 12;
      j.driveMode = act < 0.02 ? DRIVE_RELATIVE : c.mode;
      if (act < 0.02) {
        // fully limp: hold current relative pose softly (no muscle target)
        j.relativeRotation(j.target);
        j.stiffness = kp;
      } else {
        j.target.copy(c.target);
        j.stiffness = c.k * act + kp;
      }
      j.damping = c.d * Math.sqrt(act) + dp;
      j.maxTorque = c.tmax * act + tp;
      j.worldDamping = j.driveMode === DRIVE_WORLD;
      if (c.ff && j.worldDamping) j.targetAngVel.copy(c.ffVel);
      else j.targetAngVel.setZero();
      if (!c.ff) c.prevTarget = null;
      c.ff = false;
      c.act = 1;
    }
    // stabilising assist on the pelvis while balanced (fades with lost balance / injuries)
    if (this.mode === 'balance' && this.assist > 0.01) {
      const pel = this.seg.pelvis.body;
      _v0.set(0, 1, 0).applyQuat(pel.rot);
      _v1.crossVectors(_v0, UP); // axis to rotate up-vector back to vertical
      const s = _v1.length();
      const ang = Math.asin(clamp(s, 0, 1));
      const kp = 420 * this.assistGain * this.assist, kd = 55 * this.assistGain * this.assist;
      if (s > 1e-6) _v1.scale((kp * ang) / s);
      else _v1.setZero();
      _v2.copy(pel.angVel);
      _v2.y = 0;
      _v1.addScaled(_v2, -kd);
      const lim = 160 * this.assist;
      const l = _v1.length();
      if (l > lim) _v1.scale(lim / l);
      pel.torque.add(_v1);
      // vertical support (experimental): holds the pelvis near standing height
      if (this.vAssist) {
        const target = (this.standFloor ?? this.world.groundY) + this.geo.pelvisBindY - 0.02;
        const fy = clamp((target - pel.pos.y) * 3000 - pel.vel.y * 300, 0, this.vAssist * this.rd.totalMass * G) * this.assist;
        pel.force.y += fy;
      }
      // walking: a gentle helper force toward the commanded speed along the route (like the
      // upright torques it fades out with lost balance, so trips and stumbles stay physical)
      const lo = this.loco;
      if (lo.stepping && (lo.speed > 0.05 || this.sens.comVel.length() > 0.2)) {
        const v = this.sens.comVel, d = lo.dir, M = this.rd.totalMass;
        const along = v.x * d.x + v.z * d.z;
        const F = clamp((lo.speed - along) * 1.5 * M, -0.05 * M * G, 0.07 * M * G) * this.assistGain * this.assist;
        pel.force.x += d.x * F;
        pel.force.z += d.z * F;
      }
      if (this.chestAssist) {
        const ch = this.seg.chest.body;
        _v0.set(0, 1, 0).applyQuat(ch.rot);
        _v1.crossVectors(_v0, UP);
        const s2 = _v1.length();
        const a2 = Math.asin(clamp(s2, 0, 1));
        if (s2 > 1e-6) _v1.scale((300 * this.chestAssist * a2) / s2);
        _v2.copy(ch.angVel);
        _v2.y = 0;
        _v1.addScaled(_v2, -40 * this.chestAssist);
        const l2 = _v1.length(), lim2 = 150 * this.chestAssist * this.assist;
        if (l2 > lim2) _v1.scale(lim2 / l2);
        ch.torque.add(_v1);
      }
    }
  }

  // Joint torques that cancel gravity on the supported chains (feed-forward muscle effort).
  applyGravityCompensation() {
    const tone = this.tone;
    if (tone < 0.02) return;
    const rd = this.rd;
    // upper body: each joint carries the weight of everything distal to it
    const upper = ['lumbar', 'thoracic', 'neckBase', 'neckTop', 'shoulderL', 'elbowL', 'wristL', 'shoulderR', 'elbowR', 'wristR'];
    for (const name of upper) {
      const j = this.jt[name];
      const seg = j.userData.segment;
      const modeF = this.mode === 'balance' || this.mode === 'getup' ? 1 : this.mode === 'falling' ? 0.6 : 0.3;
      const str = this.regionStrength(name) * tone * modeF * (this.cmd[name].gc ?? 1);
      if (str < 0.02) continue;
      j.worldAnchor(_v0);
      _v1.setZero();
      const stack = [seg];
      while (stack.length) {
        const s = stack.pop();
        // torque = r x (m * g_up), including the distal fragment of a broken bone
        for (let k = -1; k < (s.fractured ? s.fractured.extra.length : 0); k++) {
          const b = k < 0 ? s.body : s.fractured.extra[k];
          _v2.subVectors(b.pos, _v0);
          _v1.x += -_v2.z * b.mass * G;
          _v1.z += _v2.x * b.mass * G;
        }
        for (const c of s.children) stack.push(c);
      }
      _v1.scale(str * 0.92);
      j.child.torque.add(_v1);
      j.parent.torque.sub(_v1);
    }
    // Stance legs: the upper body (pelvis and above) is carried at the hips. Vertical load is split
    // between the legs by the lever rule; the residual (sagittal) moment is held by the hip muscles
    // and passed down each leg, so the ankles only see the moments they can actually resist.
    if (this.mode === 'balance') {
      this.applyLegSupport(tone);
      if (this.step) this.applySwingLegCompensation(this.step.foot, tone);
    }
  }

  applySwingLegCompensation(side, tone) {
    const str = tone * this.legStrength[side] * 0.95;
    const chain = ['hip' + side, 'knee' + side, 'ankle' + side];
    for (let i = 0; i < 3; i++) {
      const j = this.jt[chain[i]];
      j.worldAnchor(_v0);
      _v1.setZero();
      let seg = j.userData.segment;
      while (seg) {
        const b = seg.body;
        _v2.subVectors(b.pos, _v0);
        _v1.x += -_v2.z * b.mass * G;
        _v1.z += _v2.x * b.mass * G;
        if (seg.fractured) for (const eb of seg.fractured.extra) {
          _v2.subVectors(eb.pos, _v0);
          _v1.x += -_v2.z * eb.mass * G;
          _v1.z += _v2.x * eb.mass * G;
        }
        seg = seg.children[0] || null;
      }
      _v1.scale(str);
      j.child.torque.add(_v1);
      j.parent.torque.sub(_v1);
    }
  }

  applyLegSupport(tone) {
    const S = this.sens, seg = this.seg;
    let Mu = 0;
    const cu = _v3.setZero();
    const swingSide = this.step ? this.step.foot : null;
    for (const sg of this.rd.segList) {
      const n = sg.name;
      const isLeg = n.startsWith('thigh') || n.startsWith('shin') || n.startsWith('foot');
      // in single support the stance leg also carries the lifted leg
      if (isLeg && !(swingSide && n.endsWith(swingSide))) continue;
      cu.addScaled(sg.body.pos, sg.body.mass);
      Mu += sg.body.mass;
    }
    cu.scale(1 / Mu);
    const hipL = this.jt.hipL.worldAnchor(this._hL || (this._hL = new Vec3()));
    const hipR = this.jt.hipR.worldAnchor(this._hR || (this._hR = new Vec3()));
    let sL, sR;
    const P = this._P || (this._P = new Vec3());
    if (this.step) {
      sL = this.step.stance === 'L' ? 1 : 0;
      sR = 1 - sL;
      P.copy(sL ? hipL : hipR);
    } else {
      // static load sharing follows the feet (where the forces enter the ground), not the hips
      const fL = this.soleCenter('L', this._fL || (this._fL = new Vec3()));
      const fR = this.soleCenter('R', this._fR || (this._fR = new Vec3()));
      const dx = fR.x - fL.x, dz = fR.z - fL.z;
      const len2 = dx * dx + dz * dz || 1e-6;
      const t = clamp(((S.com.x - fL.x) * dx + (S.com.z - fL.z) * dz) / len2, 0, 1);
      sL = (1 - t) * (S.footContact.L ? 1 : 0.3);
      sR = t * (S.footContact.R ? 1 : 0.3);
      const tot = sL + sR || 1;
      sL /= tot;
      sR /= tot;
      P.lerpVectors(hipL, hipR, sR);
    }
    // load is transferred between legs over ~0.15 s (a freshly planted foot is not loaded at once)
    if (!this.shareL) this.shareL = sL;
    const rate = 6 * (1 / 60);
    this.shareL = clamp(approach(this.shareL, sL, rate), 0, 1);
    if (this.step) this.shareL = sL; // single support: the stance leg carries everything immediately
    sL = this.shareL;
    sR = 1 - sL;
    if (!this.step) P.lerpVectors(hipL, hipR, sR);
    const Wu = Mu * G;
    // residual moment of the upper body weight about P: (cu - P) x (0, Wu, 0)
    const rx = cu.x - P.x, rz = cu.z - P.z;
    const mx = -rz * Wu, mz = rx * Wu;
    const k = tone * 0.9;
    const tau = this._tau || (this._tau = new Vec3());
    const r = this._r || (this._r = new Vec3());
    for (const side of SIDES) {
      const sh = side === 'L' ? sL : sR;
      if (sh <= 0) continue;
      const str = k * this.legStrength[side];
      const hip = side === 'L' ? hipL : hipR;
      const thigh = seg['thigh' + side].body, shin = seg['shin' + side].body, foot = seg['foot' + side].body;
      const knee = this.jt['knee' + side].worldAnchor(_v0);
      const ankle = this.jt['ankle' + side].worldAnchor(_v1);
      // Vertical support of this leg's share of the upper body. The resulting ankle moment is
      // clamped below to what the foot's centre of pressure can deliver; beyond that the leg
      // behaves as a passive strut (inverted pendulum), exactly like a real stance leg.
      const Fm = sh * Wu, cosv = 1;
      const fx = 0, fy = Fm, fz = 0;
      // hip: residual moment on the pelvis
      tau.set(mx * sh, 0, mz * sh).scale(str);
      seg.pelvis.body.torque.add(tau);
      thigh.torque.sub(tau);
      // knee: hip moment + strut force about the knee + thigh weight
      r.subVectors(hip, knee);
      let ax = mx * sh + (r.y * fz - r.z * fy);
      let ay = r.z * fx - r.x * fz;
      let az = mz * sh + (r.x * fy - r.y * fx);
      r.subVectors(thigh.pos, knee);
      ax += -r.z * thigh.mass * G;
      az += r.x * thigh.mass * G;
      tau.set(ax, ay, az).scale(str);
      thigh.torque.add(tau);
      shin.torque.sub(tau);
      // ankle: hip moment + support force about the ankle + segment weights, clamped to what the
      // foot can resist through its centre of pressure
      r.subVectors(hip, ankle);
      ax = mx * sh - r.z * Fm;
      az = mz * sh + r.x * Fm;
      r.subVectors(thigh.pos, ankle);
      ax += -r.z * thigh.mass * G;
      az += r.x * thigh.mass * G;
      r.subVectors(shin.pos, ankle);
      ax += -r.z * shin.mass * G;
      az += r.x * shin.mass * G;
      const fn = Fm * cosv + (thigh.mass + shin.mass) * G;
      // project onto foot axes: pitch (about lateral) and roll (about forward)
      foot.localDirToWorld(LAT, _v2);
      foot.localDirToWorld(FWD, _v3);
      let pitch = ax * _v2.x + az * _v2.z;
      let roll = ax * _v3.x + az * _v3.z;
      // shin pitch < 0 (restoring a forward lean) loads the toes (~16 cm lever); > 0 loads the heel.
      // Walking, the stance leg is a strut the body vaults over (the centre of pressure rolls from
      // the heel to the forefoot, it is not held at the toes against the fall: that would brake
      // every step)
      const walkStance = this.loco.stepping && (this.step ? this.step.kind === 'walk' : Math.hypot(S.comVel.x, S.comVel.z) > 0.3);
      pitch = walkStance ? clamp(pitch, -fn * 0.07, fn * 0.04) : clamp(pitch, -fn * 0.16, fn * 0.05);
      roll = clamp(roll, -fn * 0.045, fn * 0.045);
      tau.set(_v2.x * pitch + _v3.x * roll, 0, _v2.z * pitch + _v3.z * roll).scale(str);
      shin.torque.add(tau);
      // Reaction of the ankle moment. A flat, loaded foot passes it straight to the floor through a
      // shift of its centre of pressure; only the part its *measured* load cannot carry acts on the
      // foot itself (and can tip it onto toes or heel). Putting the whole reaction on the 1 kg foot
      // makes the rigid sole contacts fight it every substep (invisible 600 Hz rocking that shows
      // up as phantom foot velocities of ~0.5 rad/s).
      const fnMeas = S.footContact[side] ? S.footLoad[side] * this.rd.totalMass * G : 0;
      const pg = clamp(pitch, -fnMeas * 0.16, fnMeas * 0.05);
      const rg = clamp(roll, -fnMeas * 0.045, fnMeas * 0.045);
      const pr = pitch - pg, rr = roll - rg;
      if (pr !== 0 || rr !== 0) {
        r.set(_v2.x * pr + _v3.x * rr, 0, _v2.z * pr + _v3.z * rr).scale(str);
        foot.torque.sub(r);
      }
    }
  }

  // ------------------------------------------------------------------------------------------
  // Pose helpers
  ankleWorld(s, out) {
    return this.seg['foot' + s].body.localToWorld(this.geo['ankleInFoot' + s], out);
  }

  footYaw(s) {
    return yawOf(this.seg['foot' + s].body.rot);
  }

  /** Leg IK: from hip world position to ankle target. Returns world thigh/shin rotations. */
  legIK(s, hipPos, anklePos, poleDir, out) {
    const g = this.geo;
    const r = twoBoneIK(hipPos, anklePos, g['L1' + s], g['L2' + s], poleDir, this._ik || (this._ik = makeIKResult()), 0.06);
    boneRotation(g['thighDir' + s], g['legAxis' + s], r.dir1, r.axis, out.thigh);
    boneRotation(g['shinDir' + s], g['legAxis' + s], r.dir2, r.axis, out.shin);
    out.reach = r.reach;
    return out;
  }

  armIK(s, shoulderPos, wristPos, poleDir, out) {
    const g = this.geo;
    const r = twoBoneIK(shoulderPos, wristPos, g['A1' + s], g['A2' + s], poleDir, this._ik2 || (this._ik2 = makeIKResult()), 0.08);
    boneRotation(g['uarmDir' + s], g['armAxis' + s], r.dir1, r.axis, out.upper);
    boneRotation(g['farmDir' + s], g['armAxis' + s], r.dir2, r.axis, out.fore);
    out.reach = r.reach;
    return out;
  }

  // Relaxed arm hanging pose relative to the chest.
  relaxedArms(scale = 1, swing = 0) {
    for (const s of SIDES) {
      const sg = s === 'L' ? 1 : -1;
      _q0.setFromEuler(-0.1 + swing * sg, 0, -0.1 * sg, 'XYZ');
      this.setRel('shoulder' + s, _q0, 55 * scale, 5 * scale, 60);
      _v0.copy(DIRS.upperArmDirL);
      const axis = new Vec3().crossVectors(FWD, s === 'L' ? DIRS.upperArmDirL : new Vec3(-DIRS.upperArmDirL.x, DIRS.upperArmDirL.y, DIRS.upperArmDirL.z)).normalize();
      _q1.setFromAxisAngle(axis, -0.28);
      this.setRel('elbow' + s, _q1, 28 * scale, 1.4 * scale, 40);
      _q2.setFromEuler(0, 0, 0);
      this.setRel('wrist' + s, _q2, 8 * scale, 0.25 * scale, 10);
    }
  }

  standingSpine(lean = 0, leanSide = 0, yaw = this.heading, k = 1) {
    // torso world orientation: upright with optional lean (rad) in heading frame
    yawQuat(yaw, _q0);
    _q1.setFromEuler(lean, 0, leanSide, 'XYZ');
    _q2.multiplyQuats(_q0, _q1);
    this.setWorld('lumbar', _q2);
    this.gains('lumbar', k);
    _q1.setFromEuler(lean * 0.5 - 0.018 * this.breath, 0, leanSide * 0.5, 'XYZ');
    _q2.multiplyQuats(_q0, _q1);
    this.setWorld('thoracic', _q2);
    this.gains('thoracic', k);
    this.setRel('neckBase', _q1.identity());
    this.gains('neckBase', k);
    // head stabilisation (vestibulo-collic reflex): keep it level, facing heading / look target
    let hy = yaw;
    let pitch = 0;
    // a fresh hit takes the attention: the head turns toward the shooter / the struck spot
    const look = this.attention && this.time < this.attention.until ? this.attention.point : this.lookTarget;
    if (look) {
      const hp = this.seg.head.body.pos;
      _v0.subVectors(look, hp);
      const yy = Math.atan2(_v0.x, _v0.z);
      const dy = clamp(wrapAngle(yy - yaw), -1.2, 1.2);
      hy = yaw + dy;
      pitch = clamp(-Math.atan2(_v0.y, Math.hypot(_v0.x, _v0.z)), -0.6, 0.6);
    }
    if (this.threat && this.threat.tti < 0.6) {
      // eyes shut, chin tucked, face turned away from the incoming object
      pitch = 0.45;
      const away = Math.atan2(this.dodge.x, this.dodge.z);
      hy = yaw + clamp(wrapAngle(away - yaw), -0.7, 0.7);
    }
    yawQuat(hy, _q0);
    _q1.setFromEuler(pitch, 0, 0, 'XYZ');
    _q2.multiplyQuats(_q0, _q1);
    this.setWorld('neckTop', _q2);
    this.gains('neckTop', k);
  }

  // ------------------------------------------------------------------------------------------
  doBalance(dt) {
    const S = this.sens, g = this.geo;
    const pel = this.seg.pelvis.body;
    const skill = this.balanceSkill;
    // assist fades when the capture point is far out or the trunk tilts (we are no longer "balanced")
    const threat = clamp((S.cpDist - 0.05) / 0.35, 0, 1);
    const tilt = clamp((S.upTilt - 0.12) / 0.35, 0, 1);
    const assistGoal = Math.max(clamp(1 - Math.max(threat, tilt), 0, 1), this.step || this.recentStep ? (this.stepAssist ?? 0.45) * (1 - tilt) : 0) * Math.min(this.legStrength.L, this.legStrength.R) * skill;
    this.assist = approach(this.assist, assistGoal, dt * 4);

    // intended facing direction: it only drifts toward the feet while quietly standing, so a body
    // twisted by a step or an impact is turned back instead of the heading chasing the twist
    {
      const yL = this.footYaw('L'), yR = this.footYaw('R');
      const fy = Math.atan2(Math.sin(yL) + Math.sin(yR), Math.cos(yL) + Math.cos(yR));
      const quiet = !this.step && !this.loco.active && S.footContact.L && S.footContact.R && Math.hypot(S.comVel.x, S.comVel.z) < 0.1;
      if (quiet) this.heading += clamp(wrapAngle(fy - this.heading), -0.35 * dt, 0.35 * dt);
    }

    // ---------------- stepping -----------------
    const dsup = S.footContact.L && S.footContact.R;
    this.recentStep = this.time - this.lastStepEnd < 0.6;
    const speed = Math.hypot(S.comVel.x, S.comVel.z);
    const walk = this.loco.stepping;
    if (!this.step && walk && this.loco.gait(dt)) {
      // walking: the gait starts the steps (and shifts the weight before the first one)
      this.settleFoot = null;
    } else if (!this.step) {
      // reactive (catch) step when the capture point leaves the base of support
      const outward = S.cpDist > 0 && (S.cp.x - S.cpClosest.x) * S.comVel.x + (S.cp.z - S.cpClosest.z) * S.comVel.z > 0;
      const supported = S.cpDist < 1e3;
      const urgent = supported && ((S.cpDist > 0.03 + 0.03 * (1 - skill) && outward && speed > 0.1) || S.cpDist > 0.09);
      if (urgent && this.time - this.lastStepEnd > 0.08 && this.modeTime > 0.15) {
        this.settleFoot = null;
        this.beginStep(this.chooseCatchFoot(), 'catch');
      } else {
        this.updateSettle(dt, speed);
      }
    }
    if (this.step) this.updateStep(dt);

    // ---------------- pelvis target -----------------
    const stanceSides = this.step ? [this.step.stance] : this.settleFoot ? [this.settleFoot === 'L' ? 'R' : 'L'] : SIDES;
    _v0.setZero();
    let wsum = 0;
    for (const s of stanceSides) {
      const w = 0.3 + this.legStrength[s];
      this.soleCenter(s, _v1);
      _v0.addScaled(_v1, w);
      wsum += w;
    }
    _v0.scale(1 / wsum); // desired COM ground position (support centre)
    const shifting = !this.step && this.loco.shiftTarget(_v0);
    if (stanceSides.length === 1 && !shifting) {
      // standing on one foot: aim slightly inside its centre (toward the body midline)
      const o = this.soleCenter(stanceSides[0] === 'L' ? 'R' : 'L', _v1);
      const dx = o.x - _v0.x, dz = o.z - _v0.z, dl = Math.hypot(dx, dz) || 1;
      _v0.x += (dx / dl) * 0.012;
      _v0.z += (dz / dl) * 0.012;
    }
    // move the desired COM point smoothly (deliberate weight shifts take ~0.4 s, like people do)
    if (!this.cdes) this.cdes = _v0.clone();
    if (this.step && this.step.kind !== 'settle') this.cdes.copy(_v0);
    else {
      // eased approach (fast start, gentle arrival) capped at 0.35 m/s
      const ddx = _v0.x - this.cdes.x, ddz = _v0.z - this.cdes.z, dl = Math.hypot(ddx, ddz);
      const mv = Math.min(dl * (1 - Math.exp(-dt / 0.18)), 0.35 * dt);
      if (dl > 1e-6) {
        this.cdes.x += (ddx / dl) * mv;
        this.cdes.z += (ddz / dl) * mv;
      }
      _v0.copy(this.cdes);
      if (!this.step && !this.settleFoot) this.posturalSway(dt, speed, _v0);
    }
    const pelTarget = this._pelTarget || (this._pelTarget = new Vec3());
    // walking along (stepping or between steps, not while shifting the weight to set off): the
    // body vaults over the stance leg, nothing holds it back
    const vaulting = walk && !shifting && (this.step ? this.step.kind === 'walk' : speed > 0.3);
    if (vaulting) {
      pelTarget.set(pel.pos.x + S.comVel.x * dt, 0, pel.pos.z + S.comVel.z * dt);
      // only sideways toward the stance foot (a little): the next foothold does the rest
      const lx = Math.cos(this.heading), lz = -Math.sin(this.heading);
      const e = ((_v0.x - S.com.x) * lx + (_v0.z - S.com.z) * lz) * (this.step ? 0.1 : 0);
      pelTarget.x += lx * e;
      pelTarget.z += lz * e;
      this.comInt.setZero();
      if (this.cdes) this.cdes.set(S.com.x, 0, S.com.z);
    } else if (this.step && this.step.kind !== 'settle') {
      // reactive single support: don't fight the pendulum; keep height & posture
      pelTarget.set(pel.pos.x + S.comVel.x * dt, 0, pel.pos.z + S.comVel.z * dt);
      pelTarget.x += (_v0.x - S.com.x) * 0.15;
      pelTarget.z += (_v0.z - S.com.z) * 0.15;
    } else {
      // COM servo (ankle/hip strategy): proportional + leaky integral on the COM error, damped by
      // COM velocity. Expressed as a pelvis displacement since the legs carry the pelvis.
      const kp = this.servo.kp, kd = this.servo.kd, ki = this.servo.ki;
      const ex = _v0.x - S.com.x, ez = _v0.z - S.com.z;
      // the integral only trims small residual errors (anti-windup): integrating a large
      // correction makes the COM overshoot and creep back over seconds. A deliberate weight shift
      // onto one foot (before a settle step) that has stalled is the exception: the compliant legs
      // meet a steady resistance there (a lateral lunge over the stance knee), and without the
      // integral the shift stops several cm short; it only integrates once the COM has slowed
      const slow = Math.hypot(S.comVel.x, S.comVel.z) < 0.05;
      const near = Math.hypot(ex, ez) < 0.02 || (this.settleFoot && slow) ? 1 : 0;
      const iMax = this.settleFoot ? 0.08 : 0.05;
      this.comInt.x = clamp(this.comInt.x * (1 - (near ? 0.6 : 3) * dt) + ex * dt * near, -iMax, iMax);
      this.comInt.z = clamp(this.comInt.z * (1 - (near ? 0.6 : 3) * dt) + ez * dt * near, -iMax, iMax);
      // bounded displacement: the IK must keep producing reachable, natural leg configurations
      let dx = ex * kp + this.comInt.x * ki - S.comVel.x * kd;
      let dz = ez * kp + this.comInt.z * ki - S.comVel.z * kd;
      const dl = Math.hypot(dx, dz), maxD = 0.06;
      if (dl > maxD) {
        dx *= maxD / dl;
        dz *= maxD / dl;
      }
      pelTarget.set(pel.pos.x + dx, 0, pel.pos.z + dz);
    }
    // weakening legs (wounds, blood loss) sag: the knees bend more and more before they give way
    const weakLegs = clamp((0.85 - Math.min(this.legStrength.L, this.legStrength.R)) / 0.45, 0, 1);
    const crouch = (this.step || this.recentStep ? 0.02 : 0.012) + 0.025 * this.startle + 0.03 * (1 - skill) + 0.07 * weakLegs;
    // smoothed standing height; never follows a sagging pelvis down (that would make the stance
    // knee fold and pull the foot off the floor), but is capped above the current height so a
    // deep crouch is straightened gradually instead of launching the body
    // standing on a step or a kerb: the height is measured from the (higher) stance surface; the
    // reach limits below keep a leg planted lower down extended, not lifted off
    let floorBase = -Infinity;
    for (const s of stanceSides) floorBase = Math.max(floorBase, S.footFloor[s]);
    if (!S.footContact.L && !S.footContact.R) floorBase = S.floorY;
    this.standFloor = floorBase;
    let desiredY = floorBase + g.pelvisBindY - crouch - (walk ? 0.012 : 0);
    // every stance leg must be able to reach its planted foot (wide stances lower the pelvis), and a
    // swing leg must be able to reach its landing spot (long catch steps become a lunge). That
    // includes a foot about to be unloaded for a settle step: during the weight shift it is the far
    // leg that pushes the body over the other foot, and a leg already at full stretch cannot push
    const reachSides = this.step ? [this.step.stance, this.step.foot] : SIDES;
    for (const s of reachSides) {
      // the swing leg has to reach its landing spot from where the hip will be at touchdown (the
      // body keeps travelling during the swing), not from where it is now: judging it from the
      // current hip turns every long catch step into a needlessly deep lunge
      let lead = 0;
      if (this.step && s === this.step.foot) {
        if (this.step.t / this.step.duration < 0.35) continue;
        _v2.copy(this.step.target);
        _v2.y -= 0.01;
        lead = Math.max(0, this.step.duration - this.step.t);
      } else this.ankleWorld(s, _v2);
      const hx = pelTarget.x + S.comVel.x * lead + Math.cos(this.heading) * g['hipAnchor' + s].x - _v2.x;
      const hz = pelTarget.z + S.comVel.z * lead - Math.sin(this.heading) * g['hipAnchor' + s].x - _v2.z;
      const Lmax = (g['L1' + s] + g['L2' + s]) * 0.985;
      const reachY = _v2.y + Math.sqrt(Math.max(Lmax * Lmax - hx * hx - hz * hz, 0.04)) - g['hipAnchor' + s].y;
      desiredY = Math.min(desiredY, reachY);
    }
    if (this.pelvisYTarget === undefined) this.pelvisYTarget = pel.pos.y;
    // descend promptly when needed, rise slowly (walking up a step: as fast as the climb needs)
    // (going up: the stance surface is higher than the one the trailing foot left)
    const climb = walk && this.loco.speed > 0.1 && floorBase - Math.min(S.footFloor.L, S.footFloor.R, this.lowFloor ?? floorBase) > 0.04;
    this.lowFloor = this.step ? Math.min(S.footFloor[this.step.stance], this.lowFloor ?? 9) : Math.min(S.footFloor.L, S.footFloor.R);
    this.pelvisYTarget = desiredY < this.pelvisYTarget ? approach(this.pelvisYTarget, desiredY, 0.8 * dt) : approach(this.pelvisYTarget, desiredY, (climb ? 0.55 : 0.25) * dt);
    // just after a foot strike the legs absorb (yield) instead of pushing the body back up
    const sinceLand = this.time - this.lastStepEnd;
    // in single support the stance leg only holds height: extending it hard mid-swing hops the
    // body off the floor and the unloaded stance foot then skids (going up stairs it has to lift
    // the body by the height of the step, though)
    const rising = climb && this.pelvisYTarget > pel.pos.y + 0.02;
    const upCap = rising ? 0.03 : sinceLand < 0.25 && !this.step ? 0.005 : this.step ? 0.012 : 0.045;
    if (sinceLand < 0.02 && !this.step) this.pelvisYTarget = Math.min(this.pelvisYTarget, pel.pos.y);
    // vertical damping: never let the legs throw the body upward
    pelTarget.y = Math.min(this.pelvisYTarget, pel.pos.y + upCap) - clamp((pel.vel.y - 0.15) * 0.1, 0, 0.05);
    // ...and let them yield along a descent (eccentric knee/hip work) instead of stopping it dead:
    // a stiff strut arrests a 0.5 m/s landing within a frame and bounces the whole body off the floor
    // (bounded: at most ~6 cm below the standing height target, otherwise a fast descent keeps
    // lowering its own target and the body sits down)
    if (!this.step && sinceLand < 0.25 && pel.vel.y < -0.12) {
      const y = pelTarget.y + Math.max((pel.vel.y + 0.12) * 0.12, -0.05);
      pelTarget.y = Math.min(pelTarget.y, Math.max(y, this.pelvisYTarget - 0.06));
    }
    // pelvis orientation: upright facing heading; hip strategy lean from CP error
    const pelRot = this._pelRot || (this._pelRot = new Quat());
    yawQuat(this.heading + (walk ? this.loco.pelvisYaw() : 0), pelRot);

    // ---------------- legs -----------------
    const legOut = this._legOut || (this._legOut = { thigh: new Quat(), shin: new Quat(), reach: 0 });
    for (const s of SIDES) {
      const swing = this.step && this.step.foot === s;
      const fb = this.seg['foot' + s].body;
      const spring = this.footSpring[s];
      spring.enabled = false;
      if (swing) {
        // world-frame swing leg from actual pelvis
        pel.localToWorld(g['hipAnchor' + s], _v1);
        const st = this.step;
        if (this.useFootSpring !== false) {
          spring.enabled = true;
          spring.offset.subVectors(st.ankleNow, _v1);
          // capped near real hip-flexor strength (~150-200 N at the foot); eased off for the
          // touchdown so the leg places the foot instead of ramming it into the floor
          const late = st.planting || st.t / st.duration > 0.85;
          spring.maxForce = (this.footSpringForce ?? 200) * this.legStrength[s] * this.tone * (late ? 0.45 : 1);
        }
        // knee points along the pelvis' own facing (blended with the intended heading) so the
        // swing hip never has to twist the thigh hard against the pelvis
        pel.localDirToWorld(FWD, _v3);
        _v3.y = 0;
        _v3.normalize();
        _v3.x += Math.sin(this.heading);
        _v3.z += Math.cos(this.heading);
        _v3.normalize();
        _v3.y = 0.15;
        this.legIK(s, _v1, st.ankleNow, _v3, legOut);
        this.setWorld('hip' + s, legOut.thigh);
        const ph = st.t / st.duration;
        // swing leg: high-bandwidth tracking (fast leg muscles) with velocity feed-forward early and
        // extra damping late so the foot stops on its target instead of overshooting
        const sg = this.swingGain ?? 0.8;
        this.gains('hip' + s, sg);
        this.cmd['hip' + s].d *= 1.25;
        this.cmd['hip' + s].tmax = 160; // hip flexor/extensor strength of a swinging leg
        if (ph < 0.7 && !st.planting) this.feedForward('hip' + s, legOut.thigh, dt);
        else this.cmd['hip' + s].d *= st.planting ? 2.5 : 1.6;
        _q0.multiplyConjA(legOut.thigh, legOut.shin);
        this.setRel('knee' + s, _q0);
        this.gains('knee' + s, sg * 0.75);
        // terminal swing: the hamstrings brake the shin (otherwise the knee snaps straight late
        // in the swing and whips the foot 15 cm past its landing spot at 6-7 m/s)
        this.cmd['knee' + s].d *= ph > 0.55 || st.planting ? 2.6 : 1.25;
        yawQuat(st.yaw, _q1);
        _q2.setFromEuler(st.toePitch, 0, 0, 'XYZ');
        _q1.multiply(_q2);
        _q0.multiplyConjA(legOut.shin, _q1);
        this.setRel('ankle' + s, _q0);
        this.gains('ankle' + s, 0.35);
      } else {
        // stance leg: relative targets from desired pelvis frame to the planted foot
        _v1.copy(g['hipAnchor' + s]).applyQuat(pelRot).add(pelTarget);
        this.ankleWorld(s, _v2);
        // a stance foot that lost the floor reaches back down for it
        if (!S.footContact[s]) _v2.y = Math.max(Math.min(_v2.y - 0.02, S.footFloor[s] + 0.12), S.footFloor[s] + 0.075);
        _v3.set(Math.sin(this.heading), 0, Math.cos(this.heading));
        this.legIK(s, _v1, _v2, _v3, legOut);
        // The stance hip holds the thigh-pelvis angle the IK asks for (pelvis upright over the planted
        // foot), in single support too. Driving only the pelvis' world orientation with the reaction
        // dumped into the thigh (SIMBICON-style) leaves the leg's own geometry uncontrolled: the
        // swing leg's reaction then rotates the stance leg and lifts the planted foot off the
        // floor, so the body drops in free fall mid-step and bounces on touchdown.
        _q0.multiplyConjA(pelRot, legOut.thigh);
        this.setRel('hip' + s, _q0);
        this.gains('hip' + s, this.step ? this.stanceHipGain ?? 1.2 : 1);
        _q0.multiplyConjA(legOut.thigh, legOut.shin);
        this.setRel('knee' + s, _q0);
        // a leg that has just landed absorbs the impact: knee and hip extensors work eccentrically
        // (softer, more damped) for ~0.2 s, instead of a stiff strut that bounces the body
        const absorb = !this.step && s === this.lastStepFoot ? clamp(1 - sinceLand / 0.2, 0, 1) : 0;
        this.gains('knee' + s, 1 - 0.45 * absorb);
        this.cmd['knee' + s].d *= 1 + 1.2 * absorb;
        if (absorb > 0 && !this.step) {
          this.cmd['hip' + s].k *= 1 - 0.3 * absorb;
          this.cmd['hip' + s].d *= 1 + 0.8 * absorb;
        }
        // flat foot with its current yaw
        yawQuat(this.footYaw(s), _q1);
        _q0.multiplyConjA(legOut.shin, _q1);
        this.setRel('ankle' + s, _q0);
        // walking over it, the shin rolls forward over the planted foot: a stiff ankle servo would
        // hold it back (and with it the whole body, through a centre of pressure under the toes)
        this.gains('ankle' + s, vaulting ? 0.3 : 1);
      }
    }

    // ---------------- upper body -----------------
    // hip strategy: lean trunk against the capture-point error, arms out when threatened
    _v0.set(S.cp.x - S.cpClosest.x, 0, S.cp.z - S.cpClosest.z);
    // walking runs with the capture point ahead of the feet: only what goes beyond that is a threat
    const cpOut = Math.max(0, S.cpDist - (walk ? 0.12 + 0.3 * speed : 0));
    let lean = 0, leanSide = 0;
    if (cpOut > 0 && cpOut < 1) {
      _v0.normalize();
      // into heading frame
      const c = Math.cos(-this.heading), sn = Math.sin(-this.heading);
      const fx = _v0.x * c + _v0.z * sn;
      const fz = -_v0.x * sn + _v0.z * c;
      lean = clamp(fz * cpOut * 1.2, -0.25, 0.25);
      leanSide = clamp(-fx * cpOut * 1.2, -0.2, 0.2);
    }
    lean += 0.06 * this.startle + 0.25 * this.painHunch();
    if (walk) {
      // walking posture: a slight forward lean that grows with speed; over a hurt leg the trunk
      // leans toward it while it carries the weight (less load on the painful hip: a limp)
      lean += 0.03 + 0.035 * Math.min(speed, 1.4);
      if (this.step) {
        const st = this.step.stance, hurt = clamp((0.92 - this.legStrength[st]) / 0.4, 0, 1);
        leanSide += (st === 'L' ? -1 : 1) * 0.09 * hurt;
      }
    }
    // hit reaction: double over around a torso wound, sag toward a wounded leg
    const fl = this.flinch;
    if (fl.amount > 0.02) {
      if (fl.kind === 'gut') lean += 0.32 * fl.amount;
      else if (fl.kind === 'torso') lean += 0.1 * fl.amount;
      else if (fl.kind === 'leg') leanSide += 0.14 * fl.amount * fl.side;
      else if (fl.kind === 'arm') leanSide += 0.06 * fl.amount * fl.side;
      else if (fl.kind === 'head') lean -= 0.12 * fl.amount;
    }
    // shot snap (decays in ~0.15 s): the trunk jerks along the bullet's path; the balance
    // controller then deals with the shifted centre of mass (a stagger step if needed)
    if (this.snap && this.time - this.snap.t0 < 0.6) {
      const e = this.snap.amp * Math.exp(-(this.time - this.snap.t0) / 0.15);
      const c = Math.cos(-this.heading), sn = Math.sin(-this.heading);
      const d = this.snap.dir;
      lean += (-d.x * sn + d.z * c) * e;
      leanSide += -(d.x * c + d.z * sn) * e;
    }
    // dodge: lean the trunk away from an incoming object's path
    if (this.threat && this.threat.tti < 0.6) {
      const c = Math.cos(-this.heading), sn = Math.sin(-this.heading);
      const fx = this.dodge.x * c + this.dodge.z * sn;
      const fz = -this.dodge.x * sn + this.dodge.z * c;
      lean += clamp(fz * 0.3, -0.25, 0.25);
      leanSide += clamp(-fx * 0.3, -0.25, 0.25);
    }
    this.standingSpine(lean, leanSide, this.heading, 1);
    const flail = clamp(cpOut * 2.5, 0, 1);
    this.flail = flail;
    this.relaxedArms(1, walk ? this.loco.armSwing() : 0);
    // Toppling: windmill the arms (the shoulder torques that spin them in the direction of the
    // fall rotate the trunk back the other way) - only while the trunk is actually rotating away,
    // since steady circling stores no extra angular momentum and would just shift the COM about
    // during an ordinary stagger. A little out of balance: arms out wide.
    const cw = this.seg.chest.body.angVel;
    _v1.set(cw.x, 0, cw.z);
    const spin = _v1.length();
    const wm = cpOut > 0.1 && cpOut < 1 ? clamp((spin - 1.5) / 1.2, 0, 1) : 0;
    // the head moves along spin x up: circle the arms so their tops move that way; once started,
    // the arms carry on round (a circle takes ~0.6 s) rather than flicking for a few frames
    if (wm > 0.05 && spin > 0.2) (this.wmDir || (this.wmDir = new Vec3())).crossVectors(_v1, UP);
    this.wmAmount = approach(this.wmAmount || 0, wm, dt * (wm > (this.wmAmount || 0) ? 6 : 0.7));
    if (this.wmAmount > 0.05 && this.wmDir) this.windmill(dt, this.wmAmount, _v0.copy(this.wmDir));
    else if (flail > 0.05) this.armsOut(flail);
  }

  /**
   * Arm windmilling (Euphoria's balancer): both arms circle in the vertical plane of the fall,
   * the top of each circle moving toward the fall. The angular momentum given to the arms is taken
   * from the rest of the body, which is rotated back toward upright.
   */
  windmill(dt, amount, dir) {
    if (dir.lengthSq() < 1e-8) return;
    dir.normalize();
    this.wmPhase = (this.wmPhase || 0) + dt * (7 + 3 * amount);
    const chest = this.seg.chest.body;
    const lat = chest.localDirToWorld(LAT, new Vec3());
    const arm = this._armOut || (this._armOut = { upper: new Quat(), fore: new Quat(), reach: 0 });
    for (const s of SIDES) {
      if (this.armStrength[s] < 0.3) continue;
      const sg = s === 'L' ? 1 : -1;
      const sh = chest.localToWorld(this.geo['shoulderAnchor' + s], new Vec3());
      const r = (this.geo['A1' + s] + this.geo['A2' + s]) * (0.55 + 0.3 * amount);
      // the arms circle out to the side a little so they clear the head and trunk
      const c = sh.clone().addScaled(lat, sg * 0.12);
      const ph = this.wmPhase + (s === 'L' ? 0 : 0.6);
      const tgt = c.addScaled(dir, -Math.cos(ph) * r).addScaled(UP, Math.sin(ph) * r * 0.9 + 0.05);
      const pole = new Vec3(0, -1, 0).addScaled(lat, sg * 0.7);
      this.armIK(s, sh, tgt, pole, arm);
      this.setWorld('shoulder' + s, arm.upper, 120 * (0.6 + 0.4 * amount), 8, 85);
      this.feedForward('shoulder' + s, arm.upper, dt);
      _q0.multiplyConjA(arm.upper, arm.fore);
      this.setRel('elbow' + s, _q0, 50, 2.5, 50);
    }
  }

  /**
   * Quiet standing is never still. Sensorimotor noise makes the centre of mass wander slowly and
   * irregularly (~0.1-0.5 Hz, a few mm, a little more front-to-back than sideways), and after
   * standing for a while people shift their weight onto one leg for a few seconds (Duarte &
   * Zatsiorsky 1999: shifts every ~30 s or so in prolonged standing). Applied as an offset of the
   * COM target, so the body sways by its own muscle actions. Writes into `target` (ground point).
   */
  posturalSway(dt, speed, target) {
    const S = this.sens;
    const calm = speed < 0.1 && S.cpDist < 0 && this.time - this.lastStepEnd > 1.5 && !this.threat;
    this.quietTime = calm ? (this.quietTime || 0) + dt : 0;
    const settle = smoothstep(0.5, 2.5, this.quietTime);
    const n = (f, o) => noise1(this.time * f + o, this.seed);
    const hx = Math.sin(this.heading), hz = Math.cos(this.heading);
    const ap = 0.004 * (0.7 * n(0.21, 3.1) + 0.3 * n(0.57, 7.7)) * settle;
    const ml = 0.0025 * (0.7 * n(0.16, 11.3) + 0.3 * n(0.43, 5.2)) * settle;
    target.x += hx * ap + hz * ml;
    target.z += hz * ap - hx * ml;
    // occasional weight shift: the load moves onto one leg (to ~70%) over ~2 s, stays a while,
    // and comes back; only after ~25 s of quiet standing
    const w = this.wshift || (this.wshift = { next: 25 + 10 * this.rng(), t: -1, side: 'L', hold: 5 });
    if (w.t < 0) {
      if (this.quietTime > w.next) {
        w.t = 0;
        // onto either leg - but a hurt or weaker leg is the one that gets unloaded (antalgic)
        const dL = this.legStrength.L - this.legStrength.R;
        w.side = Math.abs(dL) > 0.08 ? (dL > 0 ? 'L' : 'R') : this.rng() < 0.5 ? 'L' : 'R';
        w.hold = 4 + 6 * this.rng();
      }
    } else {
      w.t += dt;
      const amt = smoothstep(0, 2, w.t) * (1 - smoothstep(2 + w.hold, 4 + w.hold, w.t));
      if (!calm && w.t < 2 + w.hold) w.t = 2 + w.hold; // disturbed: come back to both legs
      if (w.t > 4 + w.hold) {
        w.t = -1;
        w.next = 20 + 25 * this.rng();
        this.quietTime = 0;
      }
      const f = this.soleCenter(w.side, _v3);
      target.x += (f.x - target.x) * 0.4 * amt;
      target.z += (f.z - target.z) * 0.4 * amt;
    }
  }

  // ------------------------------------------------------------------------------------------
  // Reflexes

  /** Called by the injury model when the body is struck (bullet or blunt impact). */
  onHit(info) {
    if (!this.alive || !this.conscious) return;
    const s = info.strength;
    // a blow that was seen coming finds the body braced: much less of a startle
    const braced = info.kind !== 'bullet' && this.time - (this.lastThreatTime ?? -9) < 0.5;
    this.startle = Math.min(1.2, this.startle + (braced ? 0.15 + 0.3 * s : 0.4 + 0.6 * s));
    const name = info.segment;
    const side = name.endsWith('L') ? 1 : name.endsWith('R') ? -1 : 0;
    // 'gut': a blow or wound to the belly or pelvis doubles the body over; 'torso' (chest) only
    // guards it a little; legs and arms make the body shy away from the hurt limb
    const kind = /^(abdomen|pelvis)$/.test(name) ? 'gut' : name === 'chest' ? 'torso' : /^(thigh|shin|foot)/.test(name) ? 'leg' : /^(upperArm|forearm|hand)/.test(name) ? 'arm' : 'head';
    const fl = this.flinch;
    const amt = Math.min(1.2, (0.35 + 0.9 * s) * (braced ? 0.6 : 1));
    if (amt >= fl.amount * 0.8) {
      fl.amount = amt;
      fl.kind = kind;
      fl.side = side;
      fl.time = this.time;
    }
    const hb = this.seg[name] ? this.seg[name].body : null;
    if (info.dir && hb) {
      // look toward where it came from (a shot: the shooter; a blow: the struck spot)
      const a = this.attention || (this.attention = { point: new Vec3(), until: 0 });
      if (info.kind === 'bullet') a.point.copy(hb.pos).addScaled(info.dir, -6);
      else a.point.copy(hb.pos).addScaled(info.dir, -0.6);
      a.until = this.time + (info.kind === 'bullet' ? 1.4 : 0.8);
      if (info.kind === 'bullet' && /^(chest|abdomen|pelvis|neck)$/.test(name)) {
        // shot "snap": the trunk muscles jerk in the bullet's direction for a moment
        const sn = this.snap || (this.snap = { dir: new Vec3(), t0: -9, amp: 0 });
        sn.dir.set(info.dir.x, 0, info.dir.z);
        if (sn.dir.lengthSq() > 1e-6) sn.dir.normalize();
        sn.t0 = this.time;
        sn.amp = Math.min(0.35, 0.12 + 0.2 * s);
      }
    }
    this.events.push({ type: 'hit', segment: name, strength: s, time: this.time });
  }

  painHunch() {
    return clamp(this.pain - 0.3, 0, 0.7);
  }

  soleCenter(s, out) {
    const fb = this.seg['foot' + s].body;
    out.set(0, 0, -0.012).applyQuat(fb.rot).add(fb.pos);
    out.y = this.sens.footFloor[s];
    return out;
  }

  armsOut(amount) {
    for (const s of SIDES) {
      const sg = s === 'L' ? 1 : -1;
      _q0.setFromEuler(-0.35 * amount, 0, (0.9 * amount - 0.1) * sg, 'XYZ');
      this.setRel('shoulder' + s, _q0, 90, 7, 80);
    }
  }

  // Pick the swing foot for a reactive step: cheapest feasible capture step.
  chooseCatchFoot() {
    const S = this.sens;
    let best = null, bestCost = Infinity;
    for (const f of SIDES) {
      const st = f === 'L' ? 'R' : 'L';
      if (!S.footContact[st] && S.footContact[f]) continue; // cannot stand on an airborne foot
      const penalty = this.captureTarget(f, st, 0.3, _v2);
      this.ankleWorld(f, _v3);
      let cost = Math.hypot(_v2.x - _v3.x, _v2.z - _v3.z) + penalty;
      if (this.legStrength[st] < 0.5) cost += 1;
      cost += 0.12 * S.footLoad[f];
      if (this.lastStepFoot === f && this.time - this.lastStepEnd < 0.4) cost += 0.5;
      if (cost < bestCost) {
        bestCost = cost;
        best = f;
      }
    }
    return best || (S.footLoad.L < S.footLoad.R ? 'L' : 'R');
  }

  // After the body has come to rest, tidy up an awkward stance: shift weight, then step.
  updateSettle(dt, speed) {
    const S = this.sens;
    if (this.settleFoot) {
      this.settleTime += dt;
      const stance = this.settleFoot === 'L' ? 'R' : 'L';
      this.soleCenter(stance, _v1);
      const off = Math.hypot(S.com.x - _v1.x, S.com.z - _v1.z);
      // the foot can come up once it carries (almost) nothing: judged by its share of what the
      // feet carry together (the balance assist takes a part of the weight off both)
      const share = S.footLoad[stance] / Math.max(S.footLoad.L + S.footLoad.R, 1e-3);
      const loaded = share > 0.85 && off < 0.035 && speed < 0.08;
      if ((loaded && this.settleTime > 0.2) || (this.settleTime > 1.6 && off < 0.05)) {
        const f = this.settleFoot;
        this.settleFoot = null;
        this.beginStep(f, 'settle');
      } else if (speed > 0.35 || this.settleTime > 1.6) {
        // pushed, or the weight did not get across: lifting a foot that still carries the body
        // would start a new stagger, so stay in the stance for now and think again later (after
        // a second failure, only after a good while)
        this.settleFoot = null;
        this.settleFails = (this.settleFails || 0) + 1;
        this.settleBlock = this.time + (this.settleFails >= 2 ? 8 : 2.5);
      }
      return;
    }
    if (speed > 0.15 || this.time - this.lastStepEnd < 0.25 || this.time < (this.settleBlock ?? -1)) {
      this.awkwardTime = 0;
      return;
    }
    const awk = this.stanceAwkwardness();
    this.awkwardTime = awk.score > 0 ? (this.awkwardTime || 0) + dt : 0;
    if (this.awkwardTime > 0.3) {
      this.settleFoot = awk.foot;
      this.settleTime = 0;
      this.awkwardTime = 0;
    }
  }

  stanceAwkwardness() {
    const S = this.sens;
    const hx = Math.sin(this.heading), hz = Math.cos(this.heading);
    const lx = hz, lz = -hx;
    this.soleCenter('L', _v1);
    this.soleCenter('R', _v2);
    const dx = _v2.x - _v1.x, dz = _v2.z - _v1.z;
    const fore = dx * hx + dz * hz;
    const width = -(dx * lx + dz * lz);
    let score = 0;
    if (Math.abs(fore) > 0.17) score += Math.abs(fore) - 0.17;
    if (width < 0.12) score += 0.12 - width;
    if (width > 0.38) score += width - 0.38;
    if (!S.footContact.L || !S.footContact.R) score += 0.1;
    const dL = Math.hypot(S.com.x - _v1.x, S.com.z - _v1.z);
    const dR = Math.hypot(S.com.x - _v2.x, S.com.z - _v2.z);
    let foot = dL > dR ? 'L' : 'R';
    const other = (f) => (f === 'L' ? 'R' : 'L');
    if (this.legStrength[other(foot)] < 0.5 && this.legStrength[foot] >= 0.5) foot = other(foot);
    if (!S.footContact[other(foot)] && S.footContact[foot]) foot = other(foot);
    return { foot, score };
  }

  beginStep(foot, kind = 'catch') {
    const stance = foot === 'L' ? 'R' : 'L';
    const start = this.ankleWorld(foot, new Vec3());
    this.step = {
      foot,
      stance,
      kind,
      t: 0,
      duration: 0.32,
      start,
      ankleNow: start.clone(),
      target: start.clone(),
      prevAnkle: start.clone(),
      yaw: this.footYaw(foot),
      startYaw: this.footYaw(foot),
      toePitch: 0,
      lift: 0.08,
    };
    if (kind === 'walk') this.loco.setupStep(this.step);
    this.planStepTarget(this.step.target);
    const dist = Math.hypot(this.step.target.x - start.x, this.step.target.z - start.z);
    if (this.step.kind === 'walk') {
      // over an obstacle the swing takes a little longer (the foot goes up and over)
      this.loco.buildProfile(this.step);
      if (this.step.profile) this.step.duration += clamp(0.35 * this.step.profileTop, 0, 0.14);
    } else if (kind === 'settle') {
      this.step.duration = clamp(0.3 + 0.35 * dist, 0.32, 0.5);
      this.step.lift = clamp(0.035 + 0.08 * dist, 0.04, 0.08);
    } else {
      const P = this.stepParams || {};
      // quick, low reactive steps: a fast placement matters more than foot clearance
      this.step.duration = clamp((P.t0 ?? 0.18) + (P.t1 ?? 0.15) * dist, P.tmin ?? 0.2, 0.36);
      this.step.lift = clamp(0.05 + 0.1 * dist, P.liftMin ?? 0.06, P.liftMax ?? 0.09);
    }
    // crossover: route the swing foot around the front (or back) of the stance foot
    const sc = this.soleCenter(stance, _v1);
    const lx = Math.cos(this.heading), lz = -Math.sin(this.heading);
    const side = foot === 'L' ? 1 : -1;
    const tl = (this.step.target.x - sc.x) * lx + (this.step.target.z - sc.z) * lz;
    const sl = (start.x - sc.x) * lx + (start.z - sc.z) * lz;
    this.step.cross = side * tl < 0.06 && side * sl > 0.06;
    this.stepCount++;
    this.comInt.setZero();
    this.settleFails = 0;
    this.settleBlock = -1;
    this.events.push({ type: 'step', foot, kind, time: this.time });
  }

  /**
   * Capture-point step target for `foot` while standing on `stance`, `remaining` seconds from now
   * (linear inverted pendulum about the stance foot). Writes the ankle target; returns how far the
   * raw target had to be pulled back to avoid crossing the stance foot (feasibility measure).
   */
  /**
   * Point of the stance foot's sole the centre of pressure can reach that is closest to the capture
   * point (inset from the edges). Used as the inverted-pendulum pivot during single support.
   */
  stancePivot(stance, out, walking = false) {
    const S = this.sens;
    const fb = this.seg['foot' + stance].body;
    const sh = fb.shapes[0];
    const cp = walking ? S.cpB : S.cp;
    fb.worldToLocal(_v1.set(cp.x, fb.pos.y, cp.z), _v2);
    _v2.sub(sh.localPos);
    const ex = sh.halfExtents.x - 0.015, ez = sh.halfExtents.z - 0.02;
    _v2.x = clamp(_v2.x, -ex, ex);
    // a walking stance foot is not used to brake (see applyLegSupport): pivot around mid-foot
    _v2.z = walking ? clamp(_v2.z, -0.03, 0.02) : clamp(_v2.z, -ez, ez);
    _v2.y = 0;
    _v2.add(sh.localPos);
    fb.localToWorld(_v2, out);
    out.y = this.sens.footFloor[stance];
    return out;
  }

  /**
   * Capture-point step target for `foot` while standing on `stance`, `remaining` seconds from now
   * (linear inverted pendulum about the reachable centre of pressure). Writes the ankle target and
   * returns a cost penalty: 0 for a normal step, > 0 for a crossover (foot passes the stance leg).
   */
  captureTarget(foot, stance, remaining, out, crossSign = 0) {
    const S = this.sens;
    const p = this.stancePivot(stance, _v0);
    const e = 1 + (Math.exp(S.w0 * remaining) - 1) * (this.cpScale ?? 1);
    out.set(p.x + (S.cp.x - p.x) * e, 0, p.z + (S.cp.z - p.z) * e);
    // land a little beyond the predicted capture point (along the motion) to leave braking margin
    const vx = S.comVel.x, vz = S.comVel.z, vl = Math.hypot(vx, vz);
    if (vl > 0.05) {
      const off = clamp(0.03 + 0.06 * vl, 0.03, 0.1);
      out.x += (vx / vl) * off;
      out.z += (vz / vl) * off;
    }
    const sc = this.soleCenter(stance, _v1);
    const hx = Math.sin(this.heading), hz = Math.cos(this.heading);
    const lx = hz, lz = -hx;
    let fwd = (out.x - sc.x) * hx + (out.z - sc.z) * hz;
    let left = (out.x - sc.x) * lx + (out.z - sc.z) * lz;
    const side = foot === 'L' ? 1 : -1;
    // land with the capture point over the inner half of the new foot rather than its centre: the
    // body then comes to rest inside a base of normal width instead of on a tightrope stance
    left += side * 0.035;
    const minW = 0.15, maxW = (this.stepParams && this.stepParams.maxW) ?? 0.7;
    let penalty = 0;
    this._crossSign = 0;
    if (side * left < minW) {
      if (side * left < 0.02) {
        // crossover step: allowed, but the foot must pass clear in front of (sgn 1) or behind
        // (sgn -1) the stance foot; the side is kept for the whole swing once chosen, otherwise a
        // re-planned target can flip from front to back and the foot loops around the stance leg
        left = side * Math.max(side * left, -0.16);
        const sgn = crossSign || (fwd >= -0.02 ? 1 : -1);
        if (sgn * fwd < 0.16) fwd = sgn * 0.16;
        this._crossSign = sgn;
        penalty = 0.25 + Math.abs(side * left - minW);
      } else {
        left = side * minW;
      }
    } else if (side * left > maxW) left = side * maxW;
    fwd = clamp(fwd, -0.5, 0.75);
    const len = Math.hypot(fwd, left);
    const maxL = (this.stepParams && this.stepParams.maxL) ?? 0.8;
    if (len > maxL) {
      fwd *= maxL / len;
      left *= maxL / len;
    }
    out.x = sc.x + hx * fwd + lx * left - hx * 0.058;
    out.z = sc.z + hz * fwd + lz * left - hz * 0.058;
    out.y = this.floorAt(out.x + hx * 0.06, out.z + hz * 0.06, sc.y) + 0.085;
    return penalty;
  }

  /** Surface height for a foot placed around (x, z), seen from about the stance foot's level. */
  floorAt(x, z, ref = this.sens.floorY) {
    return this.world.surfaceAt(x, z, Math.max(ref, this.sens.floorY) + 0.45);
  }

  planStepTarget(out) {
    const st = this.step;
    if (st.kind === 'walk') return this.loco.planTarget(st, out);
    if (st.kind === 'settle') {
      // natural stance width beside the stance foot
      const p = this.soleCenter(st.stance, _v0);
      const hx = Math.sin(this.heading), hz = Math.cos(this.heading);
      const lx = hz, lz = -hx;
      const sd = st.foot === 'L' ? 1 : -1;
      out.set(p.x + lx * 0.21 * sd - hx * 0.058, 0, p.z + lz * 0.21 * sd - hz * 0.058);
      out.y = this.floorAt(out.x + hx * 0.06, out.z + hz * 0.06, p.y) + 0.085;
      return out;
    }
    this.captureTarget(st.foot, st.stance, Math.max(0.05, st.duration - st.t), out, st.crossSign || 0);
    if (!st.crossSign && this._crossSign) st.crossSign = this._crossSign;
    return out;
  }

  updateStep(dt) {
    const st = this.step, S = this.sens;
    st.t += dt;
    if (st.t / st.duration < 0.8 && !st.planting) {
      _v2.copy(st.target);
      this.planStepTarget(st.target);
      if (st.kind === 'walk') {
        if (!st.profileAt || _v2.distanceTo(st.target) > 0.03) {
          this.loco.buildProfile(st);
          st.profileAt = true;
        }
      } else if (st.kind !== 'settle') {
        // the swing time follows the step length as the landing spot is re-planned (a step that
        // has to grow from 0.25 to 0.6 m cannot keep the timing of the short one: the foot would
        // be flung at 3 m/s and overshoot)
        const P = this.stepParams || {};
        const d = Math.hypot(st.target.x - st.start.x, st.target.z - st.start.z);
        st.duration = Math.max(st.duration, clamp((P.t0 ?? 0.18) + (P.t1 ?? 0.15) * d, P.tmin ?? 0.2, 0.36));
      }
    }
    const phase = st.t / st.duration;
    st.prevAnkle.copy(st.ankleNow);
    // plant on arrival: once the real foot has reached its landing spot, stop travelling and put
    // it straight down (a swing that keeps going would overshoot and brake the body too hard)
    const cur = this.ankleWorld(st.foot, _v1);
    // (not for walking steps: their swing is timed to arrive, and an early plant jumps the
    // reference ahead and flings the foot 15-20 cm past the spot)
    if (!st.planting && phase > 0.45 && st.kind !== 'settle' && st.kind !== 'walk') {
      const dx = st.target.x - st.start.x, dz = st.target.z - st.start.z;
      const len2 = dx * dx + dz * dz;
      if (len2 > 0.01) {
        // progress the foot will have made by touchdown (it is still travelling while it comes down)
        const fv = this.seg['foot' + st.foot].body.vel;
        const tDown = Math.max(0, cur.y - st.target.y) / 0.9 + 0.03;
        const pk = 0.6, px = cur.x + fv.x * tDown * pk, pz = cur.z + fv.z * tDown * pk;
        const prog = ((px - st.start.x) * dx + (pz - st.start.z) * dz) / len2;
        // a crossover swing bulges around the stance foot: it has only arrived when it is near
        // the landing spot, not merely past it along the straight line
        const near = !st.cross || Math.hypot(cur.x - st.target.x, cur.z - st.target.z) < 0.08;
        if (prog > 0.95 && near) {
          st.planting = true;
          // put it down on the planned spot: the foot is still travelling at 2-3 m/s here, and
          // freezing the reference where it happens to be lets it run on 5-12 cm past the target
          st.plantAt = st.target.clone();
          st.plantAt.y = cur.y;
          st.plantT = 0;
        }
      }
    }
    if (st.planting) {
      st.plantT += dt;
      st.ankleNow.set(st.plantAt.x, Math.max(st.target.y - 0.02, st.plantAt.y - st.plantT * 0.9), st.plantAt.z);
      st.toePitch = 0;
      const contact = S.footContact[st.foot];
      if ((contact && st.plantT > 0.03) || st.plantT > 0.3) this.endStep(st);
      return;
    }
    // horizontal: fast early, settle late (minimum-jerk-like); vertical: lift then plant
    const sx = smoothstep(0.05, 0.85, phase);
    st.ankleNow.lerpVectors(st.start, st.target, sx);
    if (st.cross) {
      // bulge the path forward/backward so the legs do not scissor into each other
      const hx = Math.sin(this.heading), hz = Math.cos(this.heading);
      const sc = this.soleCenter(st.stance, _v1);
      const tf = (st.target.x - sc.x) * hx + (st.target.z - sc.z) * hz;
      const bulge = (st.crossSign || (tf >= 0 ? 1 : -1)) * 0.14 * Math.sin(Math.PI * sx);
      st.ankleNow.x += hx * bulge;
      st.ankleNow.z += hz * bulge;
    }
    const liftPhase = clamp(phase / 0.9, 0, 1);
    st.ankleNow.y = lerp(st.start.y, st.target.y, sx) + st.lift * Math.pow(Math.sin(Math.PI * liftPhase), 0.7);
    // over an obstacle: never below the clearance profile (the whole sole passes above it)
    if (st.kind === 'walk' && st.profile && phase < 0.95) st.ankleNow.y = Math.max(st.ankleNow.y, this.loco.profileAt(st, sx));
    // reach down gently until contact (a deep target below the floor makes the leg kick off it)
    if (phase > 0.9) st.ankleNow.y = Math.min(st.ankleNow.y, st.target.y - Math.min(0.02, (phase - 0.9) * 0.15));
    st.yaw = st.startYaw + wrapAngle(this.heading - st.startYaw) * sx;
    if (st.kind === 'walk') {
      // toe-off (toes down), toes up through the swing for clearance, heel strike at touchdown
      st.toePitch = phase < 0.18 ? lerp(0.32, -0.1, phase / 0.18) : phase < 0.7 ? -0.1 : lerp(-0.1, -0.24, smoothstep(0.7, 0.95, phase));
    } else st.toePitch = phase < 0.75 ? -0.22 * smoothstep(0, 0.25, phase) : -0.22 * (1 - smoothstep(0.75, 0.95, phase));
    const contact = S.footContact[st.foot];
    const near = Math.hypot(this.ankleWorld(st.foot, _v1).x - st.target.x, _v1.z - st.target.z) < 0.07;
    if ((phase > 0.8 && contact) || (phase > 0.5 && contact && near) || phase > 1.5) this.endStep(st);
  }

  endStep(st) {
    this.step = null;
    this.lastStepEnd = this.time;
    this.lastStepFoot = st.foot;
    if (st.kind !== 'settle' && this.cdes) {
      // After a catch step the body comes to rest where its capture point is (the new base of
      // support was chosen around it), not over the middle of a long split stance: aiming the
      // COM servo at the old stance foot would drive the momentum straight back and topple the
      // body the other way. The weight shift to the middle happens later, deliberately.
      const S = this.sens;
      const a = this.soleCenter('L', _v1), b = this.soleCenter('R', _v2);
      const dx = b.x - a.x, dz = b.z - a.z;
      const t = clamp(((S.cp.x - a.x) * dx + (S.cp.z - a.z) * dz) / (dx * dx + dz * dz || 1e-6), 0.1, 0.9);
      this.cdes.set(a.x + dx * t, 0, a.z + dz * t);
      this.comInt.setZero();
    }
    this.events.push({ type: 'land', foot: st.foot, time: this.time });
  }

  // ------------------------------------------------------------------------------------------
  doFalling(dt) {
    const S = this.sens;
    this.assist = 0;
    if (this.fallCause === 'legs') {
      this.doKneelFall(dt);
      return;
    }
    // update predicted fall direction from COM velocity
    _v0.set(S.comVel.x, 0, S.comVel.z);
    if (_v0.lengthSq() > 0.04) this.fallDir.lerp(_v0.normalize(), clamp(dt * 6, 0, 1)).normalize();
    const fd = this.fallDir;
    const heading = this.heading;
    const fwdx = Math.sin(heading), fwdz = Math.cos(heading);
    const along = fd.x * fwdx + fd.z * fwdz; // + falling forward
    const left = fd.x * fwdz - fd.z * fwdx; // + falling to the character's left
    // trunk: protective flexion; legs soften
    const tone = 0.55;
    this.standingSpine(along > -0.3 ? 0.25 : 0.35, 0, yawOf(this.seg.pelvis.body.rot), tone);
    // head: protect it from the floor. With the back toward the floor (falling or rolling back)
    // the chin is tucked hard so the shoulders land first and the back of the head stays off
    // the concrete; face toward the floor: the head is lifted and turned aside. Judged from how
    // the trunk actually lies, not from the COM velocity, which flips while sitting down/rolling.
    const chestFwdY = this.seg.chest.body.localDirToWorld(FWD, _v3).y;
    const supine = chestFwdY > 0.25 || (chestFwdY > -0.25 && along < 0);
    _q0.copy(this.seg.chest.body.rot);
    _q1.setFromEuler(supine ? 0.6 : -0.35, 0, -left * 0.3, 'XYZ');
    _q0.multiply(_q1);
    this.setWorld('neckTop', _q0, 150, 7, 45);
    this.setRel('neckBase', _q1.setFromEuler(supine ? 0.5 : -0.2, 0, 0, 'XYZ'), 170, 8, 65);
    // legs: knees bend, hips flex — collapse with some control
    for (const s of SIDES) {
      this.setRel('hip' + s, _q0.setFromEuler(-0.5, 0, 0, 'XYZ'));
      this.gains('hip' + s, 0.18);
      this.setRel('knee' + s, _q0.setFromAxisAngle(LAT, 0.8));
      this.gains('knee' + s, 0.15);
      this.setRel('ankle' + s, _q0.identity());
      this.gains('ankle' + s, 0.2);
    }
    // arms: brace toward the impact zone (Euphoria-style catch fall)
    this.braceArms(fd, along, left, dt);
  }

  /**
   * The legs give way (a leg or gut wound, a broken leg, blood loss): the knee extensors can no
   * longer hold the body, so the knees fold and the person drops onto them with the trunk still
   * upright - Euphoria's "fall to knees" rather than a pole fall. Then, physically and in phases:
   *  drop  - deep knee flexion with weak gains lets gravity do the descent; bounded helper forces
   *          keep the trunk over the knees. Legs that come back before the knees reach the floor
   *          catch the dip and balance resumes (updateMode).
   *  kneel - upright on the knees, clutching the wound, for as long as the trunk and hip
   *          extensors and the pain allow (a fit person only pauses).
   *  hands - a controlled lean forward onto the hands: the hip and trunk extensors lower the trunk
   *          eccentrically at a bounded rate while the arms reach for the floor ahead of the
   *          knees; the head is lifted and turned aside. Toppling freely from an upright kneel
   *          rotates the whole body about the knees (~4 m/s at the hands) and arms that are still
   *          ~0.5 m above the floor cannot catch it: that is how faces hit concrete. Someone fit
   *          enough gets up from hands and knees (where a get-up starts); otherwise
   *  lower - the arms yield slowly and let the chest down onto the floor, face turned aside.
   */
  doKneelFall(dt) {
    const sg = this.seg, S = this.sens;
    const pel = sg.pelvis.body, ch = sg.chest.body;
    if (!this.kneel) this.braceLatch = this.kneelReach = null;
    const k = this.kneel || (this.kneel = { t: 0, down: -1, phase: 'drop', pt: 0, topple: 0, pitch: 0, both: 0, yaw: yawOf(pel.rot), spot: null, ready: null, turn: this.rng() < 0.5 ? 1 : -1 });
    k.t += dt;
    k.pt += dt;
    const toPhase = (p) => {
      k.phase = p;
      k.pt = 0;
    };
    // knees on the floor (the knee is the end of both the thigh and the shin capsule; with a broken
    // femur or tibia the knee end may belong to the distal fragment)
    const touches = (seg) => seg.body.groundContact || (seg.fractured ? seg.fractured.extra.some((b) => b.groundContact) : false);
    if (k.down < 0 && (touches(sg.shinL) || touches(sg.shinR) || touches(sg.thighL) || touches(sg.thighR))) {
      k.down = k.t;
      toPhase('kneel');
    }
    // Toppling instead of dropping (no helper forces, or a body pitched by the shot): the trunk
    // tipping well over before the knees are down, pitching fast, or the head travelling fast
    // sideways - the protective fall (arms braced at the floor, chin tucked or face turned) takes
    // over in the direction the body is actually going. A straight vertical drop onto the knees
    // does not trigger it.
    if (k.phase === 'drop' || k.phase === 'hands') {
      const cw = ch.angVel, hv = sg.head.body.vel;
      const tipRate = Math.hypot(cw.x, cw.z);
      const headSide = Math.hypot(hv.x, hv.z);
      if ((k.down < 0 && S.chestTilt > 0.6) || tipRate > 2.2 || (headSide > 1.4 && sg.head.body.pos.y - this.world.groundY > 0.3)) {
        this.fallCause = 'balance';
        const v = this.sens.comVel;
        this.fallDir.set(v.x + hv.x, 0, v.z + hv.z);
        if (this.fallDir.lengthSq() < 0.01) this.fallDir.set(Math.sin(k.yaw), 0, Math.cos(k.yaw));
        this.fallDir.normalize();
        this.modeTime = 0;
        this.kneel = null;
        this.doFalling(dt);
        return;
      }
    }
    // knocked over while on the knees (a shove, a blow, toppling backward): an ordinary protective
    // fall in the direction it is actually going takes over
    if (k.down >= 0 && k.phase !== 'lower') {
      const v = this.sens.comVel;
      const back = -(ch.localDirToWorld(UP, _v0).x * Math.sin(k.yaw) + _v0.z * Math.cos(k.yaw));
      if (Math.hypot(v.x, v.z) > 1.0 || (back > 0.35 && k.phase === 'kneel')) {
        this.fallCause = 'balance';
        this.fallDir.set(v.x, 0, v.z);
        if (this.fallDir.lengthSq() < 0.01) this.fallDir.set(-Math.sin(k.yaw), 0, -Math.cos(k.yaw));
        this.fallDir.normalize();
        this.modeTime = 0;
        this.kneel = null;
        this.doFalling(dt);
        return;
      }
    }
    const minLeg = Math.min(this.legStrength.L, this.legStrength.R);
    // what is left to hold the trunk up on the knees: trunk and hip extensors, inhibited by pain
    const vigor = clamp(Math.min(this.spineStrength, 0.4 + minLeg) - 0.45 * this.pain, 0, 1);
    const able = this.ableToGetUp() && this.autoGetUp && this.assistGain >= 0.25;
    if (k.phase === 'kneel') {
      const hold = able ? 0.7 : 0.4 + 2.6 * vigor;
      k.hold = hold;
      // tipping over regardless (pushed, or sagging back onto the heels): hands down at once
      if (k.pt > hold || S.chestTilt > 0.7 || S.pelvisH < 0.3) {
        toPhase('hands');
        this.braceLatch = { L: null, R: null };
        k.pitch = Math.min(S.chestTilt, 0.6);
      }
    }
    const fx = Math.sin(k.yaw), fz = Math.cos(k.yaw);
    const down = k.phase === 'hands' || k.phase === 'lower';
    k.topple = down ? 1 : 0; // applyArmTasks: the wound is clutched only while upright
    // where the knees are (or will land: ahead of the feet, under the dropping pelvis)
    let kneeX, kneeZ;
    if (k.down >= 0) {
      this.jt.kneeL.worldAnchor(_v1);
      this.jt.kneeR.worldAnchor(_v2);
      kneeX = (_v1.x + _v2.x) / 2;
      kneeZ = (_v1.z + _v2.z) / 2;
    } else {
      if (!k.spot) {
        const aL = this.ankleWorld('L', _v1), aR = this.ankleWorld('R', _v2);
        k.spot = new Vec3((aL.x + aR.x) / 2 + fx * 0.3, 0, (aL.z + aR.z) / 2 + fz * 0.3);
      }
      kneeX = k.spot.x;
      kneeZ = k.spot.z;
    }
    // ---- trunk pitch plan (rad from upright) ----
    let lw = 0;
    if (k.phase === 'hands') {
      const planted = (this.braceLatch.L ? 1 : 0) + (this.braceLatch.R ? 1 : 0);
      k.both = planted === 2 ? k.both + dt : 0;
      // lowered at <= 0.9 rad/s until a hand is on the floor, then held where it is
      // (the last few centimetres: past ~75 deg the trunk keeps going slowly until a hand touches)
      // (the lean waits for the hands: while they are still well above the floor the trunk goes
      // forward slowly, so it never outruns the arms reaching down)
      const handLow = Math.min(sg.handL.body.pos.y, sg.handR.body.pos.y) - this.world.groundY < 0.22;
      if (!planted) k.pitch = k.pitch < 1.3 ? approach(k.pitch, 1.3, (handLow ? 1.1 : 0.55) * dt) : approach(k.pitch, 1.62, 0.5 * dt);
      else k.pitch = approach(k.pitch, clamp(S.chestTilt, 0.9, 1.6), 0.6 * dt);
      const settled = this.rd.computeCOMVelocity(_v0).length() < 0.25;
      if ((k.both > 0.3 || (planted && k.pt > 1.6)) && settled) {
        if (able) k.ready = 'getup';
        else {
          k.ready = null;
          toPhase('lower');
        }
      } else if (k.pt > 2.8) toPhase('lower'); // never got a hand down (useless arms): let it down
    }
    if (k.phase === 'lower') {
      lw = smoothstep(0, 1.6, k.pt);
      k.pitch = approach(k.pitch, 1.5, 0.5 * dt);
    }
    // ---- legs ----
    for (const s of SIDES) {
      if (!down) {
        // hips keep the thighs in line with the trunk; the knees yield under the body weight with
        // what strength is left; once kneeling they stop folding (sitting back on the heels would
        // tip the body backward)
        this.setRel('hip' + s, _q0.setFromEuler(-0.1, 0, 0, 'XYZ'));
        this.gains('hip' + s, 0.5);
        if (k.down >= 0) {
          this.setRel('knee' + s, _q0.setFromAxisAngle(LAT, 1.75));
          this.gains('knee' + s, 0.35);
        } else {
          // dropping: the knee extensors give way eccentrically with what is left of them - the
          // target leads the current flexion a little and the damping brakes the fold, so legs with
          // some strength let the body down onto the knees while dead legs just fold
          const give = clamp((0.6 - this.legStrength[s]) / 0.5, 0, 1);
          this.jt['knee' + s].relativeRotation(_q0);
          const th = 2 * Math.atan2(_q0.x, _q0.w);
          this.setRel('knee' + s, _q0.setFromAxisAngle(LAT, Math.min(2.0, Math.max(th, 0) + 0.05 + 0.45 * give)));
          this.gains('knee' + s, 0.45);
          this.cmd['knee' + s].d *= 1 + 4 * (1 - give);
        }
      } else {
        // the trunk hinges forward at the hips over the kneeling thighs, sitting back a little
        // toward the heels; letting the body down, the legs slide back out behind
        this.setRel('hip' + s, _q0.setFromEuler(-0.1 - 0.85 * k.pitch * (1 - 0.7 * lw), 0, 0, 'XYZ'));
        this.gains('hip' + s, 0.45 - 0.25 * lw);
        this.setRel('knee' + s, _q0.setFromAxisAngle(LAT, 1.75 + 0.3 * clamp(k.pitch / 1.3, 0, 1) * (1 - lw) - 1.1 * lw));
        this.gains('knee' + s, 0.35 - 0.2 * lw);
      }
      // compliant ankles: the shins tip over the feet; a firm calf would push the body over
      this.setRel('ankle' + s, _q0.setFromAxisAngle(LAT, down ? 0.4 : -0.3));
      this.gains('ankle' + s, 0.05);
    }
    // ---- trunk ----
    const weakL = this.legStrength.L < this.legStrength.R;
    const asym = clamp(Math.abs(this.legStrength.L - this.legStrength.R) * 2, 0, 1);
    if (!down) {
      // upright on the way down and while kneeling, hunched a little over a painful wound
      this.standingSpine(0.12 + 0.15 * this.painHunch(), (weakL ? -1 : 1) * 0.06, k.yaw, 0.75);
      _q0.setFromEuler(0.25, 0, 0, 'XYZ'); // looking down at the wound
      this.setRel('neckTop', _q0, 60, 3, 30);
    } else {
      // a straight back hinging forward
      yawQuat(k.yaw, _q0);
      _q1.setFromEuler(k.pitch * 0.85, 0, (weakL ? -1 : 1) * 0.1 * asym, 'XYZ');
      _q2.multiplyQuats(_q0, _q1);
      this.setWorld('lumbar', _q2);
      this.gains('lumbar', 0.8);
      _q1.setFromEuler(k.pitch, 0, 0, 'XYZ');
      _q2.multiplyQuats(_q0, _q1);
      this.setWorld('thoracic', _q2);
      this.gains('thoracic', 0.8);
      // face toward the floor: the head is lifted (neck extended) and turned to one side, more so
      // the lower it gets, so the chest and arms take the floor and not the face
      this.setRel('neckBase', _q1.setFromEuler(-0.25, 0, 0, 'XYZ'), 170, 8, 65);
      _q0.copy(ch.rot);
      _q1.setFromEuler(-0.5, k.turn * (0.25 + 0.7 * lw), 0, 'XYZ');
      _q0.multiply(_q1);
      this.setWorld('neckTop', _q0, 150, 7, 45);
    }
    // ---- helper forces ----
    // Euphoria-style assistance (scaled by assistGain), standing in for the hip extensors and the
    // trunk control that hold a kneeling person up and lower them under control: the pelvis is kept
    // over the knees (sitting back a little as the trunk goes forward) and pelvis and chest track the
    // planned pitch. A weaker body is helped less and goes down faster.
    const a = this.assistGain * (k.down >= 0 ? 0.6 + 0.4 * vigor : 1) * (1 - lw);
    if (a > 0.01) {
      const back = down ? 0.04 + 0.08 * Math.min(k.pitch, 1.2) : 0;
      pel.force.x += clamp((kneeX - fx * back - pel.pos.x) * 500 - pel.vel.x * 120, -180, 180) * a;
      pel.force.z += clamp((kneeZ - fz * back - pel.pos.z) * 500 - pel.vel.z * 120, -180, 180) * a;
      yawQuat(k.yaw, _q0);
      for (const [b, kp, lim, f] of [[pel, 320, 150, 0.6], [ch, 260, 120, 1]]) {
        _q1.setFromEuler(down ? k.pitch * f : 0, 0, 0, 'XYZ');
        _q2.multiplyQuats(_q0, _q1);
        _q2.multiplyConjB(_q2, b.rot).toRotVec(_v1);
        _v1.y = 0; // pitch and roll only: the heading is the legs' business
        _v1.scale(kp);
        _v2.copy(b.angVel);
        _v2.y = 0;
        _v1.addScaled(_v2, -0.12 * kp);
        const l = _v1.length();
        if (l > lim) _v1.scale(lim / l);
        b.torque.addScaled(_v1, a);
      }
    }
    const M = this.rd.totalMass * G;
    if (k.phase === 'drop') {
      // what the weakened legs can still brake (eccentric quadriceps in the deepening squat, where
      // the knee moment soon exceeds what is left of them): the descent is slowed in proportion
      // to the strength remaining, so dead legs drop the body onto the knees (~2.5 m/s) and
      // half-strength ones let it down at about 1 m/s
      const brake = clamp((this.legStrength.L + this.legStrength.R) / 2, 0, 0.6);
      pel.force.y += clamp((-(0.7 + 2.5 * (0.6 - brake)) - pel.vel.y) * 400, 0, brake * 0.6 * M) * this.assistGain;
    }
    if (k.phase === 'lower') {
      // eccentric triceps and chest muscles (and hip extensors, as the legs slide back): chest and
      // pelvis come down at <= 0.3 m/s
      ch.force.y += clamp((-0.3 - ch.vel.y) * 260, 0, 0.4 * M) * this.assistGain;
      pel.force.y += clamp((-0.3 - pel.vel.y) * 260, 0, 0.3 * M) * this.assistGain;
    }
    // ---- arms ----
    // late in the kneel (about to go forward), or when the trunk starts tipping during the drop,
    // the hands already reach down toward the floor ahead of the knees
    const preReach = (k.phase === 'kneel' && k.pt > 0.5 * (k.hold || 0.7)) || (k.phase === 'drop' && S.chestTilt > 0.35);
    if (preReach) k.topple = 1;
    if (down || preReach) {
      this.fallDir.set(fx, 0, fz);
      this.kneelArms(k, dt, lw);
    } else this.relaxedArms(0.8, 0);
  }

  /**
   * Arms going down to the floor from the knees: each wrist reaches for a spot ahead of the knees,
   * a little wider than the shoulders, at a human arm speed; a hand that touches stays planted and
   * the arm becomes a compliant strut. `lower` (0..1) lets the shoulders down by bending the elbows.
   */
  kneelArms(k, dt, lower) {
    const ch = this.seg.chest.body;
    const gy = this.world.groundY;
    const fx = Math.sin(k.yaw), fz = Math.cos(k.yaw), lx = fz, lz = -fx;
    if (!this.braceLatch) this.braceLatch = { L: null, R: null };
    if (!this.kneelReach) this.kneelReach = { L: null, R: null };
    const arm = this._armOut || (this._armOut = { upper: new Quat(), fore: new Quat(), reach: 0 });
    this.jt.kneeL.worldAnchor(_v1);
    this.jt.kneeR.worldAnchor(_v2);
    const kx = (_v1.x + _v2.x) / 2, kz = (_v1.z + _v2.z) / 2;
    const pole = new Vec3();
    for (const s of SIDES) {
      if (this.armStrength[s] < 0.15) continue; // a useless arm just hangs
      if (this.armTask[s] && this.armTask[s].priority > 2) continue;
      const sg = s === 'L' ? 1 : -1;
      const sh = ch.localToWorld(this.geo['shoulderAnchor' + s], new Vec3());
      const hand = this.seg['hand' + s].body;
      if (!this.braceLatch[s] && hand.groundContact) this.braceLatch[s] = hand.pos.clone();
      const latch = this.braceLatch[s];
      pole.set(-fx + lx * sg * 0.5, 0.3, -fz + lz * sg * 0.5); // elbows back and out
      if (latch) {
        _v1.copy(latch);
        _v1.y = gy + 0.05;
        this.armIK(s, sh, _v1, pole, arm);
        // letting the body down: the arms soften and the elbows bend under the weight (eccentric
        // triceps; the descent itself is rate-limited in doKneelFall)
        const soft = 1 - 0.65 * lower;
        this.setWorld('shoulder' + s, arm.upper, 280 * soft, 16, 150 * soft);
        _q0.multiplyConjA(arm.upper, arm.fore);
        this.setRel('elbow' + s, _q0, 150 * soft, 9, 115 * soft);
        this.cmd['elbow' + s].gc = 1.6 * soft;
        this.palmDown(s, this.fallDir);
        continue;
      }
      _v1.set(kx + fx * 0.34 + lx * sg * 0.17, gy + 0.03, kz + fz * 0.34 + lz * sg * 0.17);
      // nearly straight but never locked, so the elbows can yield as the hands land
      const reachMax = (this.geo['A1' + s] + this.geo['A2' + s]) * 0.95;
      _v0.subVectors(_v1, sh);
      if (_v0.length() > reachMax) _v1.copy(sh).addScaled(_v0, reachMax / _v0.length());
      let rr = this.kneelReach[s];
      if (!rr) rr = this.kneelReach[s] = hand.localToWorld(this.geo['wristInHand' + s], new Vec3()).sub(sh);
      _v0.subVectors(_v1, sh).sub(rr);
      const step = 2.5 * dt, dl = _v0.length();
      rr.addScaled(_v0, dl > step ? step / dl : 1);
      _v1.addVectors(sh, rr);
      this.armIK(s, sh, _v1, pole, arm);
      this.setWorld('shoulder' + s, arm.upper, 200, 13, 120);
      this.feedForward('shoulder' + s, arm.upper, dt);
      _q0.multiplyConjA(arm.upper, arm.fore);
      this.setRel('elbow' + s, _q0, 110, 5, 95);
      this.palmDown(s, this.fallDir);
    }
  }

  braceArms(fd, along, left, dt = 1 / 60) {
    const chest = this.seg.chest.body;
    const S = this.sens;
    const gy = this.world.groundY;
    if (!this.braceLatch || this.modeTime < 0.02) this.braceLatch = { L: null, R: null };
    for (const s of SIDES) {
      if (this.armTask[s] && this.armTask[s].priority > 2) continue;
      const sg = s === 'L' ? 1 : -1;
      chest.localToWorld(this.geo['shoulderAnchor' + s], _v0);
      const hand = this.seg['hand' + s].body;
      // a hand that reached the floor stays planted: the arm becomes a strut that yields under load
      if (!this.braceLatch[s] && hand.groundContact) this.braceLatch[s] = hand.pos.clone();
      const latch = this.braceLatch[s];
      if (latch) {
        _v1.copy(latch);
        _v1.y = gy + 0.05;
        _v2.subVectors(_v0, chest.pos);
        _v2.y = 0.3;
        const arm = this._armOut || (this._armOut = { upper: new Quat(), fore: new Quat(), reach: 0 });
        this.armIK(s, _v0, _v1, _v2, arm);
        this.setWorld('shoulder' + s, arm.upper, 280, 16, 150);
        _q0.multiplyConjA(arm.upper, arm.fore);
        // eccentric triceps: stiff but compliant enough to soak up the landing
        this.setRel('elbow' + s, _q0, 150, 9, 115);
        this.cmd['elbow' + s].gc = 1.6;
        this.palmDown(s, fd);
        continue;
      }
      // where will this shoulder be when the body lands? (ballistic guess from the COM motion)
      const vy = Math.min(S.comVel.y, -0.5);
      const tImp = clamp((_v0.y - gy - 0.15) / -vy, 0.05, 0.6);
      const px = _v0.x + S.comVel.x * tImp, pz = _v0.z + S.comVel.z * tImp;
      // hands go to the floor ahead of the shoulders, a bit wider than shoulder width, arms
      // nearly straight: they touch first and the elbows then yield
      const lx = fd.z, lz = -fd.x;
      const back = along < -0.3; // falling backward: hands reach back and to the side
      const ahead = back ? 0.05 : 0.22;
      const wide = back ? 0.32 : 0.12;
      _v1.set(px + fd.x * ahead + lx * sg * wide, gy + 0.04, pz + fd.z * ahead + lz * sg * wide);
      // the arm on the side we fall toward reaches more
      const bias = clamp(1 + left * sg, 0.4, 1.6);
      _v1.lerp(_v0, clamp((1 - bias) * 0.5, 0, 0.3));
      _v2.set(-fd.x, 0.4, -fd.z).addScaled(new Vec3(lx, 0, lz), sg * 0.5); // elbows back and out
      // the reach is a human arm movement (~2.5 m/s relative to the shoulder): chasing the
      // predicted landing spot with stiff, feed-forward driven arms slams the hands into the floor
      // at up to 10 m/s, which is how forearms get broken
      if (!this.braceReach) this.braceReach = { L: null, R: null };
      let rr = this.braceReach[s];
      if (!rr || this.modeTime < 0.02) rr = this.braceReach[s] = this.seg['hand' + s].body.localToWorld(this.geo['wristInHand' + s], new Vec3()).sub(_v0);
      // never reach to full extension: elbows stay a little bent so they can yield on impact
      // instead of driving a straight strut into the floor
      const reachMax = (this.geo['A1' + s] + this.geo['A2' + s]) * 0.88;
      _v3.subVectors(_v1, _v0);
      if (_v3.length() > reachMax) _v1.copy(_v0).addScaled(_v3, reachMax / _v3.length());
      _v3.subVectors(_v1, _v0).sub(rr);
      const step = 2.5 * dt, dl = _v3.length();
      rr.addScaled(_v3, dl > step ? step / dl : 1);
      _v1.addVectors(_v0, rr);
      const arm = this._armOut || (this._armOut = { upper: new Quat(), fore: new Quat(), reach: 0 });
      this.armIK(s, _v0, _v1, _v2, arm);
      this.setWorld('shoulder' + s, arm.upper, 200, 13, 120);
      this.feedForward('shoulder' + s, arm.upper, dt);
      _q0.multiplyConjA(arm.upper, arm.fore);
      this.setRel('elbow' + s, _q0, 110, 5, 95);
      this.palmDown(s, fd);
    }
  }

  /**
   * Wrist extended so the palm faces the floor and the heel of the hand meets it first, fingers
   * pointing along `dir`; with a neutral wrist the hand and the end of the forearm strike edge-on.
   */
  palmDown(s, dir) {
    const X = _v2.set(0, -1, 0);
    const Y = _v3.set(dir.x, 0, dir.z);
    if (Y.lengthSq() < 1e-6) Y.set(Math.sin(this.heading), 0, Math.cos(this.heading));
    Y.normalize();
    const Z = new Vec3().crossVectors(X, Y);
    _q1.setFromBasis(X, Y, Z);
    _q2.copy(this.geo['handBasis' + s]).conjugate();
    _q1.multiply(_q2);
    this.setWorld('wrist' + s, _q1, 16, 0.5, 16);
  }

  // ------------------------------------------------------------------------------------------
  // Whole-body statics: the muscle torques that carry the body on whatever touches the floor.

  /** Scratch vectors/quaternions of the ground and get-up behaviours (never aliased elsewhere). */
  guScratch() {
    if (!this._gs) {
      const V = () => new Vec3(), Q = () => new Quat();
      this._gs = {
        a: V(), b: V(), c: V(), d: V(), e: V(), f: V(), h: V(), k: V(), F: V(), com: V(), tau: V(), an: V(), ra: V(), rb: V(), ct: V(), la: V(), lb: V(),
        q: Q(), r: Q(), pelRot: Q(), chestRot: Q(), palm: Q(),
        arm: { upper: Q(), fore: Q(), reach: 0 }, leg: { thigh: Q(), shin: Q(), reach: 0 },
        pool: [], st: {}, ls: new Map(), cw: new Map(), load: new Map(), loadTotal: 0,
      };
    }
    return this._gs;
  }

  /** Minimum-jerk ease 0..1: deliberate human movements start and arrive smoothly. */
  ease(x) {
    x = clamp(x, 0, 1);
    return x * x * x * (10 - 15 * x + 6 * x * x);
  }

  /**
   * Split a desired ground reaction `F` (world, N) over support contacts so that its line of action
   * passes through `c` (centre of mass of the carried bodies). Vertical shares come from the
   * weighted least-norm solution of the force and moment balance, re-solved without any contact
   * that would have to pull (the floor only pushes); horizontal shares follow the vertical ones and
   * are limited by friction. cands: [{ point, w }] -> each gets .f (N, up) and .hx/.hz (N).
   */
  distributeSupport(cands, F, c, mu = 0.7) {
    if (!cands.length || F.y <= 1) return false;
    const ax = clamp(F.x / F.y, -0.1, 0.1), az = clamp(F.z / F.y, -0.1, 0.1);
    for (const k of cands) {
      // forces applied at the floor, below the COM: the horizontal part shifts the lever arms
      const dy = k.point.y - c.y;
      k.dx = k.point.x - c.x - dy * ax;
      k.dz = k.point.z - c.z - dy * az;
      k.wa = k.w;
      k.f = k.hx = k.hz = 0;
    }
    for (let it = 0; it <= cands.length; it++) {
      let a = 0, b = 0, cc = 0, d = 0, e = 0, f = 0;
      for (const k of cands) {
        if (k.wa <= 0) continue;
        a += k.wa;
        b += k.wa * k.dx;
        cc += k.wa * k.dz;
        d += k.wa * k.dx * k.dx;
        e += k.wa * k.dx * k.dz;
        f += k.wa * k.dz * k.dz;
      }
      if (a <= 0) return false;
      // regularised moment rows: collinear supports (two knees, one foot) leave that moment free
      d += a * 4e-4;
      f += a * 4e-4;
      const c11 = d * f - e * e, c21 = cc * e - b * f, c31 = b * e - cc * d;
      const det = a * c11 + b * c21 + cc * c31;
      if (Math.abs(det) < 1e-14) return false;
      const l0 = (F.y * c11) / det, l1 = (F.y * c21) / det, l2 = (F.y * c31) / det;
      let worst = null, wf = 0;
      for (const k of cands) {
        k.f = k.wa > 0 ? k.wa * (l0 + l1 * k.dx + l2 * k.dz) : 0;
        if (k.f < wf) {
          wf = k.f;
          worst = k;
        }
      }
      if (!worst) break;
      worst.wa = 0;
    }
    for (const k of cands) {
      if (k.f <= 0) {
        k.f = 0;
        continue;
      }
      let hx = k.f * ax, hz = k.f * az;
      const hl = Math.hypot(hx, hz), lim = mu * k.f;
      if (hl > lim) {
        hx *= lim / hl;
        hz *= lim / hl;
      }
      k.hx = hx;
      k.hz = hz;
    }
    return true;
  }

  /**
   * Inverse statics on the segment tree: every joint gets the torque that balances gravity on all
   * the segments beyond it plus the support forces entering there (J^T F of a limb pushing on the
   * floor), capped by the strength of the muscles crossing it. The torques are internal (equal and
   * opposite on both segments), so the body is only carried as far as its limbs really push on the
   * ground. Bodies resting on the floor that are not supports carry their own weight (ls).
   */
  holdTorques(cands, gScale = 0.95, cap = 0.8) {
    const gs = this.guScratch();
    const segs = this.rd.segList, st = gs.st, ls = gs.ls;
    const add = (acc, p, fx, fy, fz) => {
      acc.F.x += fx;
      acc.F.y += fy;
      acc.F.z += fz;
      acc.M.x += p.y * fz - p.z * fy;
      acc.M.y += p.z * fx - p.x * fz;
      acc.M.z += p.x * fy - p.y * fx;
    };
    for (const sg of segs) {
      const acc = st[sg.name] || (st[sg.name] = { F: new Vec3(), M: new Vec3() });
      acc.F.setZero();
      acc.M.setZero();
      const n = sg.fractured ? sg.fractured.extra.length : 0;
      for (let i = -1; i < n; i++) {
        const b = i < 0 ? sg.body : sg.fractured.extra[i];
        add(acc, b.pos, 0, -b.mass * G * gScale * (1 - (ls.get(b) || 0)), 0);
      }
    }
    for (const k of cands) if (k.f > 0) add(st[k.body.userData.segment.name], k.point, k.hx, k.f, k.hz);
    const tau = gs.tau, an = gs.an;
    for (let i = segs.length - 1; i >= 0; i--) {
      const sg = segs[i];
      if (!sg.parent) continue;
      const acc = st[sg.name], j = sg.joint;
      // torque on the child = -sum (x - anchor) x F = anchor x F - M
      j.worldAnchor(an);
      tau.set(an.y * acc.F.z - an.z * acc.F.y - acc.M.x, an.z * acc.F.x - an.x * acc.F.z - acc.M.y, an.x * acc.F.y - an.y * acc.F.x - acc.M.z);
      const lim = cap * j.userData.def.tmax * this.regionStrength(j.name) * this.tone;
      const l = tau.length();
      if (l > lim) tau.scale(lim / l);
      j.child.torque.add(tau);
      j.parent.torque.sub(tau);
      const pa = st[sg.parent.name];
      pa.F.add(acc.F);
      pa.M.add(acc.M);
    }
  }

  /**
   * Muscular support of the posture this frame: bodies lying on the floor carry themselves, the
   * rest of the weight (plus an optional horizontal centre-of-mass servo pushing through the
   * contacts) is shared by the support candidates and turned into joint torques.
   */
  applySupport(cands, dt, opts = {}) {
    const gs = this.guScratch(), S = this.sens, ls = gs.ls;
    const gScale = opts.gScale ?? 0.95;
    const com = gs.com.setZero();
    let m = 0;
    for (const b of this.rd.allBodies()) {
      let cand = false;
      for (const k of cands) if (k.body === b) cand = true;
      // a body pressed on the floor is carried by it; the share fades in/out over ~0.1 s
      const v = approach(ls.get(b) ?? 0, b.groundContact && !cand ? 1 : 0, dt * 10);
      ls.set(b, v);
      const mf = b.mass * (1 - v);
      com.addScaled(b.pos, mf);
      m += mf;
    }
    if (m > 1e-6) com.scale(1 / m);
    // only limbs that really touch the floor can carry the body: with too little contact, the
    // muscles only hold the limbs themselves
    let wsum = 0;
    for (const k of cands) wsum += k.w;
    const carry = clamp(wsum / 0.6, 0, 1);
    const F = gs.F.set(0, (m * G * gScale + (opts.lift || 0)) * carry, 0);
    if (opts.comTarget) {
      // centre of mass servo through the feet/hands/knees (ankle-strategy-like), bounded
      const kp = opts.kp ?? 500, kd = opts.kd ?? 260, fmax = (opts.fmax ?? 0.12) * this.rd.totalMass * G;
      F.x = clamp((opts.comTarget.x - S.com.x) * kp - S.comVel.x * kd, -fmax, fmax) * carry;
      F.z = clamp((opts.comTarget.z - S.com.z) * kp - S.comVel.z * kd, -fmax, fmax) * carry;
    }
    if (!this.distributeSupport(cands, F, com)) for (const k of cands) k.f = k.hx = k.hz = 0;
    // deliberate pushes against the floor (e.g. a foot rolling the body over) on top of the support
    if (opts.extra) for (const e of opts.extra) cands.push(e);
    this.holdTorques(cands, gScale, opts.cap ?? 0.8);
    if (opts.extra) cands.length -= opts.extra.length;
    // remember how the weight was shared (phases read it next frame)
    gs.load.clear();
    let tot = 0;
    for (const k of cands) {
      gs.load.set(k.body, (gs.load.get(k.body) || 0) + k.f);
      tot += k.f;
    }
    gs.loadTotal = tot;
  }

  /**
   * Balance feedback on the posture: move a pelvis target against the centre-of-mass error
   * (target ground point - COM, damped by the COM velocity), like the stance legs' COM servo in
   * standing balance. Without it the posture holds the pelvis where it was planned even while the
   * weight drifts off the supports.
   */
  comFeedback(pelT, comTarget, gain = 0.8, lim = 0.08) {
    const S = this.sens;
    let dx = (comTarget.x - S.com.x) * gain - S.comVel.x * 0.25;
    let dz = (comTarget.z - S.com.z) * gain - S.comVel.z * 0.25;
    const l = Math.hypot(dx, dz);
    if (l > lim) {
      dx *= lim / l;
      dz *= lim / l;
    }
    pelT.x += dx;
    pelT.z += dz;
    return pelT;
  }

  /** Centroid of a body's floor contacts (or below its centre), on the floor. */
  supportPointOf(body, out) {
    const n = body.groundContactUsed;
    if (n > 0) {
      out.setZero();
      for (let i = 0; i < n; i++) out.add(body.groundContactPoints[i]);
      out.scale(1 / n);
    } else out.copy(body.pos);
    out.y = this.world.groundY;
    return out;
  }

  /** Add a support candidate (a hand, knee or foot expected to carry weight) for this frame. */
  addCand(list, body, w, fallback = null) {
    if (w <= 0.005) return null;
    const gs = this.guScratch();
    let c = gs.pool[list.length];
    if (!c) gs.pool.push((c = { body: null, point: new Vec3(), w: 0, f: 0, hx: 0, hz: 0 }));
    c.body = body;
    // only a limb at the floor can carry weight (one resting within ~2 cm counts: contact flickers
    // while a foot is being loaded); load is taken up (and given up) over ~0.1 s
    const prev = gs.cw.get(body);
    const w0 = prev && prev.frame >= this.frameNo - 1 ? prev.w : 0;
    let touching = body.groundContact;
    if (!touching && w0 > 0.05) {
      body.computeAABB(0, 0);
      touching = body.aabbMin.y < this.world.groundY + 0.02;
    }
    const wt = touching ? w : 0;
    const wn = w0 + (wt - w0) * Math.min(1, this.dtLast / 0.1);
    gs.cw.set(body, { w: wn, frame: this.frameNo });
    if (wn < 0.02) return null;
    c.w = wn;
    const n = body.groundContactUsed;
    if (n > 0) {
      c.point.setZero();
      for (let i = 0; i < n; i++) c.point.add(body.groundContactPoints[i]);
      c.point.scale(1 / n);
    } else c.point.copy(fallback || body.pos);
    c.point.y = this.world.groundY;
    c.f = c.hx = c.hz = 0;
    list.push(c);
    return c;
  }

  /** Switch the generic upper-body gravity compensation off (the statics above replace it). */
  setUpperGC(v) {
    for (const n of ['lumbar', 'thoracic', 'neckBase', 'neckTop', 'shoulderL', 'elbowL', 'wristL', 'shoulderR', 'elbowR', 'wristR']) this.cmd[n].gc = v;
  }

  // ------------------------------------------------------------------------------------------
  // Pose primitives for lying, crawling and getting up (world-space IK, muscle drives)

  /** World orientation of a trunk segment: facing `psi`, pitched forward by `pitch` (pi/2 = face down). */
  trunkRot(psi, pitch, roll, out) {
    yawQuat(psi, out);
    return out.multiply(_q2.setFromEuler(pitch, 0, roll, 'XYZ'));
  }

  /** Forward pitch of a body's long axis (0 = upright, pi/2 = lying face down), in the facing plane. */
  pitchOf(body, psi) {
    const u = body.localDirToWorld(UP, this.guScratch().k);
    return Math.atan2(u.x * Math.sin(psi) + u.z * Math.cos(psi), u.y);
  }

  /** Spine between desired pelvis and chest orientations; head pitch (+ = chin down) and turn. */
  trunkPose(pelRot, chestRot, k, headPitch = 0, headYaw = 0) {
    const gs = this.guScratch();
    gs.q.multiplyConjA(pelRot, chestRot);
    gs.r.identity().slerp(gs.q, 0.5);
    this.setRel('lumbar', gs.r);
    this.gains('lumbar', k);
    this.setRel('thoracic', gs.r);
    this.gains('thoracic', k);
    this.setRel('neckBase', _q0.setFromEuler(headPitch * 0.5 - 0.02 * this.breath, headYaw * 0.4, 0, 'XYZ'));
    this.gains('neckBase', 0.8 * k);
    this.setRel('neckTop', _q0.setFromEuler(headPitch * 0.5, headYaw * 0.6, 0, 'XYZ'));
    this.gains('neckTop', 0.8 * k);
  }

  /** Hand orientation with the palm facing `palmDir` and the fingers along `fingers` (world). */
  palmRot(s, palmDir, fingers, out) {
    const gs = this.guScratch();
    const Y = gs.h.copy(fingers).addScaled(palmDir, -fingers.dot(palmDir)).normalize();
    const Z = gs.k.crossVectors(palmDir, Y);
    out.setFromBasis(palmDir, Y, Z);
    return out.multiply(_q2.copy(this.geo['handBasis' + s]).conjugate());
  }

  /** Palm-down hand on the floor, fingers forward and a little outward. */
  floorPalm(s, psi, out) {
    const sg = s === 'L' ? 1 : -1, a = psi + 0.35 * sg;
    return this.palmRot(s, _v3.set(0, -1, 0), this.guScratch().e.set(Math.sin(a), 0, Math.cos(a)), out);
  }

  /**
   * Arm propping the trunk on a planted hand: IK from where the shoulder should be to the hand.
   * `reach` (m) is the wrist-shoulder distance to push out to along the arm's current line (the
   * triceps extend the elbow); null keeps the current distance.
   */
  propArm(s, wristAt, reach, chestRot, psi, k = 1, shift = null) {
    const gs = this.guScratch();
    const sg = s === 'L' ? 1 : -1;
    const sh = this.seg.chest.body.localToWorld(this.geo['shoulderAnchor' + s], gs.a);
    if (reach !== null) {
      const d = gs.ra.subVectors(sh, wristAt), dl = Math.max(d.length(), 1e-6);
      // never push the shoulder down through the floor line, straight arm at most
      sh.copy(wristAt).addScaled(d, clamp(reach, 0.2, 0.55) / dl);
    }
    // weight shift: the shoulders travel over the supporting hand
    if (shift) sh.add(shift);
    const fx = Math.sin(psi), fz = Math.cos(psi);
    // elbows out and a little back, as in a push-up
    const pole = gs.b.set(-0.5 * fx + fz * sg, 0.35, -0.5 * fz - fx * sg);
    this.armIK(s, sh, wristAt, pole, gs.arm);
    gs.q.multiplyConjA(chestRot, gs.arm.upper);
    this.setRel('shoulder' + s, gs.q, 220 * k, 13 * k, 95);
    gs.q.multiplyConjA(gs.arm.upper, gs.arm.fore);
    this.setRel('elbow' + s, gs.q, 130 * k, 6 * k, 70);
    this.setWorld('wrist' + s, this.floorPalm(s, psi, gs.palm), 14, 0.5, 16);
  }

  /** Free arm reaching its wrist toward a world point (elbow toward `pole`). */
  reachArm(s, wristT, pole, k = 1, palm = null) {
    const gs = this.guScratch();
    const sh = this.seg.chest.body.localToWorld(this.geo['shoulderAnchor' + s], gs.a);
    // the elbow cannot fold the wrist closer than ~0.18 m to the shoulder (flexion limit ~145 deg)
    const d = gs.ra.subVectors(wristT, sh), dl = d.length();
    if (dl < 0.19) wristT = gs.rb.copy(sh).addScaled(d, 0.19 / Math.max(dl, 1e-6));
    this.armIK(s, sh, wristT, pole, gs.arm);
    this.setWorld('shoulder' + s, gs.arm.upper, 170 * k, 11 * k, 90);
    gs.q.multiplyConjA(gs.arm.upper, gs.arm.fore);
    this.setRel('elbow' + s, gs.q, 80 * k, 3.5 * k, 60);
    if (palm) this.setWorld('wrist' + s, palm, 12, 0.4, 14);
    else this.setRel('wrist' + s, _q1.identity(), 10, 0.3, 12);
  }

  /** One arm hanging relaxed (same pose as relaxedArms, for a single side). */
  relaxArm(s, scale = 1) {
    const sg = s === 'L' ? 1 : -1;
    this.setRel('shoulder' + s, _q0.setFromEuler(-0.1, 0, -0.1 * sg, 'XYZ'), 55 * scale, 5 * scale, 60);
    const dir = s === 'L' ? DIRS.upperArmDirL : _v3.set(-DIRS.upperArmDirL.x, DIRS.upperArmDirL.y, DIRS.upperArmDirL.z);
    this.setRel('elbow' + s, _q1.setFromAxisAngle(_v2.crossVectors(FWD, dir).normalize(), -0.28), 28 * scale, 1.4 * scale, 40);
    this.setRel('wrist' + s, _q2.identity(), 8 * scale, 0.25 * scale, 10);
  }

  /** Injured arm held against the trunk (guarding): elbow flexed, forearm across the belly. */
  guardArm(s, k = 1) {
    const sg = s === 'L' ? 1 : -1;
    this.setRel('shoulder' + s, _q0.setFromEuler(-0.35, 0.25 * sg, -0.18 * sg, 'XYZ'), 60 * k, 5, 40);
    const dir = s === 'L' ? DIRS.upperArmDirL : _v3.set(-DIRS.upperArmDirL.x, DIRS.upperArmDirL.y, DIRS.upperArmDirL.z);
    const axis = _v2.crossVectors(FWD, dir).normalize();
    this.setRel('elbow' + s, _q1.setFromAxisAngle(axis, -1.6), 40 * k, 2.5, 35);
    this.setRel('wrist' + s, _q2.identity(), 6, 0.2, 8);
  }

  /** Knee joint centre when kneeling on that spot (the knee rests ~6.5 cm above the floor). */
  kneeFloor(s, out) {
    this.jt['knee' + s].worldAnchor(out);
    out.y = this.world.groundY + 0.065;
    return out;
  }

  /**
   * Kneeling leg: knee on the floor at `kneeT`, shin sloping back to the ankle; hip at `hipT`.
   * `ankleBend` + plantarflexes the foot (instep down), - tucks the toes under (ready to push off).
   */
  kneelLegTo(s, hipT, pelRot, kneeT, psi, k = 1, ankleBend = 0.6) {
    const gs = this.guScratch(), g = this.geo;
    const fx = Math.sin(psi), fz = Math.cos(psi);
    // the shin slopes up to the ankle so the foot clears the floor: plantarflexion is limited
    // (~50 deg), and with the toes tucked the foot stands almost upright under the ankle
    const slope = ankleBend < 0 ? 0.34 : 0.27;
    // bones built directly (not by two-bone IK, which would leave the knee wherever the triangle
    // puts it): thigh from the hip toward the knee spot, shin from there back along the floor
    const lat = gs.d.set(fz, 0, -fx); // knee hinge axis (character's left)
    const thighDir = gs.c.subVectors(kneeT, hipT);
    if (thighDir.lengthSq() < 1e-6) thighDir.set(0, -1, 0);
    thighDir.normalize();
    boneRotation(g['thighDir' + s], g['legAxis' + s], thighDir, lat, gs.leg.thigh);
    const shinDir = gs.c.set(-fx * Math.cos(slope), Math.sin(slope), -fz * Math.cos(slope));
    boneRotation(g['shinDir' + s], g['legAxis' + s], shinDir, lat, gs.leg.shin);
    gs.q.multiplyConjA(pelRot, gs.leg.thigh);
    this.setRel('hip' + s, gs.q);
    this.gains('hip' + s, k);
    gs.q.multiplyConjA(gs.leg.thigh, gs.leg.shin);
    this.setRel('knee' + s, gs.q);
    this.gains('knee' + s, k);
    this.setRel('ankle' + s, _q1.setFromAxisAngle(LAT, ankleBend));
    this.gains('ankle' + s, 0.35 * k);
  }

  /**
   * Stance leg with a planted foot: hip at `hipT`, foot flat facing `psi` (or bent by `toeBend`).
   * `down` points the knee downward: a trailing leg in a split stance bends its knee toward the
   * floor (heel up), which keeps the hip inside its ~27 deg of extension.
   */
  standLegTo(s, hipT, pelRot, ankle, psi, k = 1, toeBend = null, down = 0) {
    const gs = this.guScratch();
    this.legIK(s, hipT, ankle, gs.d.set(Math.sin(psi), -down, Math.cos(psi)), gs.leg);
    gs.q.multiplyConjA(pelRot, gs.leg.thigh);
    this.setRel('hip' + s, gs.q);
    this.gains('hip' + s, k);
    gs.q.multiplyConjA(gs.leg.thigh, gs.leg.shin);
    this.setRel('knee' + s, gs.q);
    this.gains('knee' + s, k);
    if (toeBend !== null) this.setRel('ankle' + s, _q1.setFromAxisAngle(LAT, toeBend));
    else {
      yawQuat(this.footYaw(s), _q1);
      gs.q.multiplyConjA(gs.leg.shin, _q1);
      this.setRel('ankle' + s, gs.q);
    }
    this.gains('ankle' + s, k);
  }

  /**
   * Swing leg carrying the ankle along `ankleT` (hip flexors via the foot spring + IK). `down`
   * tilts the knee's pole downward: a leg coming up from kneeling has its ankle behind the hip,
   * opposite a forward pole, where the IK would be ill-conditioned and fling the knee sideways.
   */
  swingLegTo(s, ankleT, psi, k = 0.9, force = 220, down = 0) {
    const gs = this.guScratch();
    const hip = this.seg.pelvis.body.localToWorld(this.geo['hipAnchor' + s], gs.a);
    const spring = this.footSpring[s];
    spring.enabled = true;
    spring.offset.subVectors(ankleT, hip);
    spring.maxForce = force * this.legStrength[s] * this.tone;
    this.legIK(s, hip, ankleT, gs.d.set(Math.sin(psi), 0.1 - down, Math.cos(psi)), gs.leg);
    this.setWorld('hip' + s, gs.leg.thigh);
    this.gains('hip' + s, k);
    gs.q.multiplyConjA(gs.leg.thigh, gs.leg.shin);
    this.setRel('knee' + s, gs.q);
    this.gains('knee' + s, k);
    yawQuat(psi, _q1);
    gs.q.multiplyConjA(gs.leg.shin, _q1);
    this.setRel('ankle' + s, gs.q);
    this.gains('ankle' + s, 0.5 * k);
  }

  /** Helper force/torque pulling a body toward a height and a world orientation (bounded, logged). */
  assistBody(body, height, rot, kp, kd, fmax, tk, tmax) {
    const a = this.assistGain;
    if (a <= 0) return;
    if (height !== null) {
      const fy = clamp((height - body.pos.y) * kp - body.vel.y * kd, -fmax * 0.3, fmax) * a;
      body.force.y += fy;
      if (this.guLog && fy > 0) this.guLog.liftNow += fy;
    }
    if (rot) {
      _q0.multiplyConjB(rot, body.rot).toRotVec(_v0);
      _v0.scale(tk);
      _v0.addScaled(body.angVel, -tk * 0.12);
      const l = _v0.length();
      if (l > tmax) _v0.scale(tmax / l);
      body.torque.addScaled(_v0, a);
    }
  }

  // ------------------------------------------------------------------------------------------
  // Getting up
  //
  // The way up depends on how the body lies, as with people: face down, the hands go under the
  // shoulders and push up to hands and knees; face up, the body first rolls onto its front (far
  // knee bent and pushing, far arm reaching across, shoulders leading); on a side it rolls the
  // rest of the way over. From hands and knees: kneel up pushing off the floor, bring one foot
  // forward (half kneel), push up off the front knee with a hand, then step the back foot up.
  // Every phase is muscle driven: supporting limbs get the joint torques that carry their share of
  // the weight (statics above, over the measured floor contacts), IK posture targets shape the
  // motion, and only a small assistGain-scaled helper remains (Euphoria-style assistance).

  /** Forget any get-up / lying-down state (fresh controller, or one reset mid-attempt). */
  resetGetUp() {
    this.gu = null;
    this.groundState = null;
    this.getUpFails = 0;
    this.lastGetUpFail = undefined;
    this.restTime = 0;
    this.wokeAt = undefined;
    // (a get-up switches the generic upper-body gravity compensation off)
    if (this.cmd) this.setUpperGC(1);
  }

  /** Disorientation after waking from a knockout (1 -> 0 over ~15 s). */
  daze() {
    return this.wokeAt === undefined ? 0 : Math.exp(-(this.time - this.wokeAt) / 15);
  }

  /** A broken humerus or forearm (the bone physically split): that arm cannot prop the body. */
  armBroken(s) {
    return !!(this.seg['upperArm' + s].fractured || this.seg['forearm' + s].fractured);
  }

  /**
   * Strict to start a get-up, lenient to keep going (hysteresis). Continuing still requires the
   * legs to pass balance mode's own test (legsOk in updateMode), or the dummy would finish standing
   * up only to be declared fallen on the next frame.
   */
  ableToGetUp(continuing = false) {
    const k = continuing ? 0.7 : 1;
    return (
      Math.min(this.legStrength.L, this.legStrength.R) > 0.5 * k &&
      this.legStrength.L + this.legStrength.R > 1.0 + (continuing ? 0.02 : 0.1) &&
      Math.max(...SIDES.map((s) => (this.armBroken(s) ? 0 : this.armStrength[s]))) > 0.3 * k &&
      this.spineStrength > 0.45 * k &&
      this.balanceSkill > 0.4 * k &&
      this.pain < (continuing ? 0.97 : 0.88)
    );
  }

  /**
   * Lying still and able to: try to get back up after a while. People take a moment after a fall,
   * longer when it hurts, when dazed after a knockout and after a failed attempt.
   */
  wantsToGetUp(dt) {
    if (!this.autoGetUp || this.assistGain < 0.25) return false;
    const calm = this.sens.comVel.length() < 0.35;
    this.restTime = calm ? (this.restTime || 0) + dt : Math.max(0, (this.restTime || 0) - 2 * dt);
    const wait = 1.4 + 4 * smoothstep(0.3, 0.9, this.pain) + 7 * this.daze() + 1.5 * Math.min(this.getUpFails || 0, 4);
    return this.restTime > wait && this.ableToGetUp() && this.time - (this.lastGetUpFail ?? -100) > 3;
  }

  /**
   * Give up this attempt. Still up off the floor (kneeling, half kneeling, rising), the body goes
   * down as in any fall: the protective reflexes brace the arms toward the floor and tuck the chin
   * (a collapse from there without them can knock the dummy out); low down it just lies down.
   */
  failGetUp(reason = '') {
    const S = this.sens;
    this.lastGetUpFail = this.time;
    this.getUpFails = (this.getUpFails || 0) + 1;
    this.restTime = 0;
    this.events.push({ type: 'getupFail', phase: this.gu ? this.gu.phase : null, reason, time: this.time });
    this.setUpperGC(1);
    if (S.com.y - this.world.groundY > 0.42) {
      this.fallDir.set(S.comVel.x, 0, S.comVel.z);
      if (this.fallDir.lengthSq() < 0.01) {
        _v0.set(0, 1, 0).applyQuat(this.seg.chest.body.rot);
        this.fallDir.set(_v0.x, 0, _v0.z);
      }
      if (this.fallDir.lengthSq() < 1e-6) this.fallDir.set(Math.sin(this.heading), 0, Math.cos(this.heading));
      this.fallDir.normalize();
      this.setMode('falling');
    } else this.setMode('ground');
  }

  /**
   * Losing it while up on the knees or feet: the weight dropping fast, rushing off sideways, or the
   * trunk toppling over. (A get-up never moves like that when it goes well.)
   */
  getUpToppling() {
    const g = this.gu, S = this.sens;
    if (!g || g.t < 0.2 || !g.start || !/^(kneel|lunge|rise|stepup)$/.test(g.phase)) return false;
    if (S.com.y - this.world.groundY < 0.4) return false;
    // (generous: a quickly swinging leg alone moves the whole-body COM at ~0.5 m/s)
    if (S.comVel.y < -0.8 || Math.hypot(S.comVel.x, S.comVel.z) > 1.1) return true;
    // upright (kneeling up, half kneeling, rising): the trunk tipping over well past where it is
    // meant to be, caught early, while there is still time to get the hands out (from a tall
    // kneel the face reaches the floor in ~0.4 s)
    if (g.phase === 'kneel' && (g.start.q || 0) < 0.9) return false;
    const ch = this.seg.chest.body;
    const meant = g.phase === 'rise' ? 0.45 : 0.15;
    // (rate of tipping: angular velocity about the axis that would turn the chest back upright)
    const ax = _v1.crossVectors(_v0.set(0, 1, 0).applyQuat(ch.rot), UP), al = ax.length();
    const tipRate = al > 1e-4 ? -ch.angVel.dot(ax) / al : 0;
    return S.chestTilt > meant + 0.6 || (S.chestTilt > meant + 0.35 && tipRate > 1.5);
  }

  /**
   * Speed of the attempt: slower when weak, dizzy, dazed or in pain. (Pain enters through the
   * balance skill, which the injury model already lowers with it, and through the weakness of a
   * hurting limb; it is not counted a second time here.)
   */
  getUpPace() {
    const legs = Math.min(this.legStrength.L, this.legStrength.R);
    return clamp(1 - 0.45 * (1 - this.balanceSkill) - 0.4 * (1 - legs) - 0.35 * this.daze(), 0.4, 1);
  }

  beginGetUp() {
    const chest = this.seg.chest.body, pel = this.seg.pelvis.body;
    const front = chest.localDirToWorld(FWD, new Vec3());
    const left = chest.localDirToWorld(LAT, new Vec3());
    const ax = new Vec3().subVectors(chest.pos, pel.pos);
    ax.y = 0;
    if (ax.lengthSq() < 1e-4) ax.set(Math.sin(this.heading), 0, Math.cos(this.heading));
    ax.normalize();
    let kind = front.y < -0.5 ? 'prone' : front.y > 0.5 ? 'supine' : left.y > 0 ? 'sideR' : 'sideL';
    const useArm = { L: this.armStrength.L > 0.3 && !this.armBroken('L'), R: this.armStrength.R > 0.3 && !this.armBroken('R') };
    // Already up on the knees (e.g. dropped onto them when the legs gave way, then onto the hands):
    // the get-up carries on from there, as people do, rather than lying down first.
    const gy = this.world.groundY, sg = this.seg;
    const kneesDown = (sg.thighL.body.groundContact || sg.shinL.body.groundContact) && (sg.thighR.body.groundContact || sg.shinR.body.groundContact);
    let phase = kind === 'prone' ? 'flat' : 'roll';
    if (kneesDown && pel.pos.y - gy > 0.33 && chest.pos.y - gy > 0.3) {
      kind = 'kneeling';
      phase = this.sens.chestTilt < 0.7 ? 'kneel' : 'quad';
      // facing from the knees toward the chest
      _v0.set(0.5 * (sg.thighL.body.pos.x + sg.thighR.body.pos.x), 0, 0.5 * (sg.thighL.body.pos.z + sg.thighR.body.pos.z));
      ax.set(chest.pos.x - _v0.x, 0, chest.pos.z - _v0.z);
      if (ax.lengthSq() < 1e-4) ax.set(Math.sin(this.heading), 0, Math.cos(this.heading));
      ax.normalize();
    }
    const g = {
      kind, phase, t: 0, T: 0, pt: 0, psi: Math.atan2(ax.x, ax.z), start: null,
      useArm, hand: { L: null, R: null }, pace: this.getUpPace(), cands: [], rollTo: 'L', front: 'R',
    };
    // hands already on the floor stay where they are; one still in the air goes down beside its
    // shoulder
    if (phase === 'quad') {
      for (const s of SIDES) {
        if (!useArm[s]) continue;
        if (sg['hand' + s].body.groundContact) {
          const wr = this.jt['wrist' + s].worldAnchor(new Vec3());
          wr.y = Math.min(wr.y, gy + 0.06);
          g.hand[s] = { planted: true, at: wr };
        } else this.planHand(g, s, useArm.L !== useArm.R, true);
      }
    }
    // roll toward the side already lower; face up with one bad arm, roll onto the good side so
    // that arm ends up underneath, ready to push, and the injured one stays on top
    if (kind === 'sideL') g.rollTo = 'L';
    else if (kind === 'sideR') g.rollTo = 'R';
    else if (useArm.L !== useArm.R) g.rollTo = useArm.L ? 'L' : 'R';
    else g.rollTo = left.y > 0.08 ? 'R' : left.y < -0.08 ? 'L' : this.rng() < 0.5 ? 'L' : 'R';
    // step forward with the stronger leg
    const dl = this.legStrength.L - this.legStrength.R;
    g.front = dl > 0.05 ? 'L' : dl < -0.05 ? 'R' : this.rng() < 0.5 ? 'L' : 'R';
    this.events.push({ type: 'getup', phase: g.phase, kind, time: this.time });
    return g;
  }

  getUpPhase(g, phase) {
    g.phase = phase;
    g.t = 0;
    g.start = null;
    this.events.push({ type: 'getup', phase, time: this.time });
  }

  doGetUp(dt) {
    this.assist = 0;
    if (!this.gu) this.gu = this.beginGetUp();
    const g = this.gu;
    // the phase clock runs slower when weak, dizzy or dazed
    g.pace = approach(g.pace, this.getUpPace(), dt * 0.5);
    g.t += dt * g.pace;
    g.T += dt;
    // an arm that gives out during the attempt is no longer leaned on: it is guarded against the
    // body and the attempt carries on one-armed (or ends below). A broken arm bone is dropped at
    // once; plain weakness only after it has lasted a moment, so a transient flinch (a hit
    // reaction recovers within ~0.5 s) does not cost the arm for the rest of the attempt.
    for (const s of SIDES) {
      if (!g.useArm[s]) continue;
      const broken = this.armBroken(s);
      g.weakT = g.weakT || { L: 0, R: 0 };
      g.weakT[s] = this.armStrength[s] < 0.3 ? g.weakT[s] + dt : 0;
      if (broken || g.weakT[s] > 0.35) {
        g.useArm[s] = false;
        g.hand[s] = null;
        // a hand that was being walked to its shoulder is not any more
        if (g.start && g.start.moving === s) g.start.moving = null;
      }
    }
    // the floor phases are pushed up from with the arms: with neither left, give up
    if (!g.useArm.L && !g.useArm.R && /^(flat|push|quad)$/.test(g.phase)) {
      this.failGetUp('no usable arm');
      return;
    }
    // rolled over onto the side or back while pushing up (a lopsided push, a hand slipping): stop
    // pushing at once and re-plan from the way the body now lies, as a person would, instead of
    // holding a push-up posture that no longer fits until the phase times out
    if ((g.phase === 'push' || g.phase === 'quad') && g.t > 0.25) {
      const fy = this.seg.chest.body.localDirToWorld(FWD, _v0).y;
      // (a lopsided moment on the way up is normal and is levelled again: only a chest that stays
      // turned onto its side, or ends up facing the sky, counts as rolled over)
      g.sideT = fy > -0.2 ? (g.sideT || 0) + dt : 0;
      if (fy > 0.25 || g.sideT > 0.4) {
        this.guReplans = (this.guReplans || 0) + 1;
        if (this.guReplans > 2) {
          this.failGetUp('rolled over');
          return;
        }
        this.events.push({ type: 'getupReplan', phase: g.phase, time: this.time });
        this.gu = this.beginGetUp();
        return;
      }
    }
    g.dt = dt;
    this.frameNo = (this.frameNo || 0) + 1;
    this.dtLast = dt;
    this.heading = g.psi;
    // both hands are needed to get up: no wound clutching meanwhile
    this.wounds = [];
    this.setUpperGC(0);
    if (!this.guLog) this.guLog = { liftNow: 0 };
    this.guLog.liftNow = 0;
    g.cands.length = 0;
    g.support = { comTarget: null, lift: 0 };
    switch (g.phase) {
      case 'roll':
        this.guRoll(g, dt);
        break;
      case 'flat':
        this.guFlat(g, dt);
        break;
      case 'push':
        this.guPush(g, dt);
        break;
      case 'quad':
        this.guQuad(g, dt);
        break;
      case 'kneel':
        this.guKneel(g, dt);
        break;
      case 'lunge':
        this.guLunge(g, dt);
        break;
      case 'rise':
        this.guRise(g, dt);
        break;
      case 'stepup':
        this.guStepUp(g, dt);
        break;
    }
    if (this.mode !== 'getup') return;
    // muscles engage over ~0.4 s from the slack lying posture (activation dynamics): no snapping
    // into the first target pose
    const act = lerp(0.2, 1, this.ease(g.T / 0.45));
    if (act < 1) for (const j of this.rd.jointList) this.cmd[j.name].act = act;
    g.support.cap = 0.8 * act;
    this.applySupport(g.cands, dt, g.support);
  }

  /**
   * Roll from the back or side onto the front, toward side g.rollTo (log roll): the near arm goes
   * up overhead out of the way, the far leg pushes off the floor, then lies long and crosses over.
   */
  guRoll(g, dt) {
    const gs = this.guScratch();
    const chest = this.seg.chest.body, pel = this.seg.pelvis.body;
    const N = g.rollTo, F = N === 'L' ? 'R' : 'L';
    const rs = N === 'L' ? 1 : -1, sgN = rs, sgF = -rs;
    const front = chest.localDirToWorld(FWD, gs.e);
    if (!g.start) g.start = { front: front.y, still: 0 };
    const t = g.t;
    // progress 0 (face up) .. 1 (face down)
    const p = clamp((1 - front.y) / 1.6, 0, 1);
    // shoulders lead: the chest twists toward the roll, the head turns and lifts a little
    const lead = this.ease(t / 0.35);
    this.setRel('thoracic', _q0.setFromEuler(0.12 * lead, 0.45 * rs * lead * (1 - p), 0, 'XYZ'));
    this.gains('thoracic', 0.8);
    this.setRel('lumbar', _q0.setFromEuler(0.1 * lead, 0.18 * rs * lead * (1 - p), 0, 'XYZ'));
    this.gains('lumbar', 0.8);
    this.setRel('neckBase', _q0.setFromEuler(0.2 * lead, 0.35 * rs * lead, 0, 'XYZ'));
    this.gains('neckBase', 0.6);
    this.setRel('neckTop', _q0.setFromEuler(0.1 * lead, 0.45 * rs * lead, 0, 'XYZ'));
    this.gains('neckTop', 0.6);
    // near arm straight up overhead, close beside the head: it lies along the roll axis, so the
    // body turns over it without trapping it (along the side or out to the side, the body would
    // end up lying on it); lying on the side it slides up along the floor
    let armUp = true;
    if (g.useArm[N]) {
      this.setRel('shoulder' + N, _q0.setFromEuler(-3.0 * lead, 0, 0.15 * sgN, 'XYZ'), 90, 6, 70);
      this.setRel('elbow' + N, _q1.identity(), 25, 2, 30);
      this.setRel('wrist' + N, _q2.identity(), 6, 0.2, 8);
      const up = chest.localDirToWorld(UP, gs.k);
      const wr = this.jt['wrist' + N].worldAnchor(gs.a), sh = chest.localToWorld(this.geo['shoulderAnchor' + N], gs.b);
      gs.c.subVectors(wr, sh);
      armUp = gs.c.dot(up) > 0.3 && gs.c.dot(front) < 0.25;
    } else this.guardArm(N);
    if (g.useArm[F]) {
      // reach across in front of the chest toward the near side, held off the floor (a straight
      // arm on the floor would prop the chest and block the roll); past the side it goes slack
      const lat = chest.localDirToWorld(LAT, gs.c).scale(sgN);
      const tgt = gs.d.copy(chest.pos).addScaled(front, 0.28).addScaled(lat, 0.22).addScaled(chest.localDirToWorld(UP, gs.k), 0.12);
      tgt.y = Math.max(this.world.groundY + 0.12, tgt.y);
      this.reachArm(F, tgt, gs.f.copy(front).addScaled(lat, -0.8), (0.8 * lead + 0.2) * (1 - 0.6 * smoothstep(0.42, 0.62, p)));
    } else this.guardArm(F);
    // far leg: knee up with the foot planted near the buttock, then it pushes down on the floor
    // (hip and knee extensors) and drives the knee across, lifting that hip over; past the side it
    // lies long again, crossing a little over the other (bent forward, its knee would prop the body
    // on its side as in the recovery position); the near leg stays long
    const push = this.ease((t - 0.3) / 0.5);
    const over = smoothstep(0.42, 0.6, p);
    if (over > 0) {
      this.setRel('hip' + F, _q0.setFromEuler(-0.3, 0, -sgF * 0.1, 'XYZ'));
      this.gains('hip' + F, 0.7 * over + 0.2);
      this.setRel('knee' + F, _q0.setFromAxisAngle(LAT, 0.3));
      this.gains('knee' + F, 0.7 * over + 0.2);
      this.setRel('ankle' + F, _q0.setFromAxisAngle(LAT, 0.5));
      this.gains('ankle' + F, 0.3);
    } else {
      // foot drawn up flat on the floor beside the other knee, knee pointing up; as the push
      // goes on, the knee is driven across toward the roll
      const hipW = pel.localToWorld(this.geo['hipAnchor' + F], gs.a).clone();
      const toFeet = gs.b.subVectors(pel.pos, chest.pos);
      toFeet.y = 0;
      toFeet.normalize();
      const latN = chest.localDirToWorld(LAT, gs.c).scale(sgN);
      latN.y = 0;
      const draw = this.ease(t / 0.35);
      const footT = gs.k.copy(hipW).addScaled(toFeet, lerp(0.75, 0.32, draw)).addScaled(latN, 0.06 * push);
      footT.y = this.world.groundY + 0.09;
      const pole = gs.f.set(latN.x * 0.8 * push, 1, latN.z * 0.8 * push);
      this.legIK(F, hipW, footT, pole, gs.leg);
      this.setWorld('hip' + F, gs.leg.thigh);
      this.gains('hip' + F, 0.8);
      gs.q.multiplyConjA(gs.leg.thigh, gs.leg.shin);
      this.setRel('knee' + F, gs.q);
      this.gains('knee' + F, 0.8);
      this.setRel('ankle' + F, _q0.identity());
      this.gains('ankle' + F, 0.3);
    }
    const footF = this.seg['foot' + F].body;
    if (footF.groundContact && push > 0 && p < 0.45) {
      const e = gs.rollPush || (gs.rollPush = { body: footF, point: new Vec3(), f: 0, hx: 0, hz: 0 });
      e.body = footF;
      this.supportPointOf(footF, e.point);
      // ~35% of body weight through the leg, as in a bridging push
      e.f = 0.35 * this.rd.totalMass * G * push * this.legStrength[F];
      g.support.extra = [e];
    }
    this.setRel('hip' + N, _q0.setFromEuler(-0.15, 0, 0.1 * sgN, 'XYZ'));
    this.gains('hip' + N, 0.35);
    this.setRel('knee' + N, _q0.setFromAxisAngle(LAT, 0.25));
    this.gains('knee' + N, 0.35);
    this.setRel('ankle' + N, _q0.identity());
    this.gains('ankle' + N, 0.25);
    // helper roll torque about the long axis toward a ~1.8 rad/s roll (the momentum carries the
    // body over its side), once the near arm is up out of the way
    const A = gs.h.subVectors(chest.pos, pel.pos).normalize();
    const w = 0.5 * (chest.angVel.dot(A) + pel.angVel.dot(A)) * rs;
    if (armUp || t > 1.5) g.start.go = true;
    const wT = g.start.go ? 2.3 * g.pace * lead : 0;
    const tq = clamp(25 * (wT - w), -30, 45) * this.assistGain;
    chest.torque.addScaled(A, tq * rs * 0.6);
    pel.torque.addScaled(A, tq * rs * 0.4);
    // done when face down, or when the roll has come to rest three-quarters over (propped on the
    // lower arm): settling face down sorts that out
    g.start.still = Math.abs(w) < 0.3 ? g.start.still + dt : 0;
    if (front.y < -0.55 || (front.y < -0.3 && g.start.still > 0.3)) {
      g.psi = Math.atan2(A.x, A.z);
      this.getUpPhase(g, 'flat');
    } else if (t > 3) this.failGetUp('roll');
  }

  /**
   * Face down (rolled over, or lying so from the start): before pushing up, lie flat with the legs
   * straight and side by side and the arms along the sides, which is where the push-up starts
   * from. An arm overhead sweeps out sideways along the floor and down (straight down it would
   * pass under the chest); for one trapped under the chest the body tips a little onto the other
   * side, which takes the weight off it, and it is drawn out.
   */
  guFlat(g, dt) {
    const gs = this.guScratch();
    const chest = this.seg.chest.body, pel = this.seg.pelvis.body;
    if (!g.start) g.start = { arm: {} };
    // heading follows the body's long axis while it settles
    const ax = gs.k.subVectors(chest.pos, pel.pos);
    g.psi = Math.atan2(ax.x, ax.z);
    const fx = Math.sin(g.psi), fz = Math.cos(g.psi);
    const flat = this.trunkRot(g.psi, Math.PI / 2, 0, gs.pelRot);
    this.trunkPose(flat, flat, 0.6, -0.2, 0);
    for (const s of SIDES) {
      this.setRel('hip' + s, _q0.identity());
      this.gains('hip' + s, 0.6);
      this.setRel('knee' + s, _q0.setFromAxisAngle(LAT, 0.15));
      this.gains('knee' + s, 0.35);
      this.setRel('ankle' + s, _q0.setFromAxisAngle(LAT, 0.4));
      this.gains('ankle' + s, 0.25);
    }
    // where each wrist is: ahead of its shoulder, and out to its own side of the chest
    const st = g.start.arm, at = {};
    for (const s of SIDES) {
      const sg = s === 'L' ? 1 : -1;
      const wr = this.jt['wrist' + s].worldAnchor(gs.e), sh = chest.localToWorld(this.geo['shoulderAnchor' + s], gs.f);
      at[s] = { ahead: (wr.x - sh.x) * fx + (wr.z - sh.z) * fz, lat: ((wr.x - chest.pos.x) * fz - (wr.z - chest.pos.z) * fx) * sg };
      if (!g.useArm[s]) st[s] = 'guard';
      else if (st[s] !== 'side' || at[s].ahead > 0.15) {
        // overhead (ahead of the shoulder), or under the chest (on the far side of its midline)
        st[s] = at[s].ahead > 0.05 ? 'out' : at[s].lat < 0.05 ? 'trapped' : st[s] === 'trapped' && at[s].lat < 0.12 ? 'trapped' : 'side';
        if (st[s] === 'out' && at[s].lat > 0.22) st[s] = 'side';
      }
    }
    let ready = true, propped = true;
    for (const s of SIDES) {
      // a hand already on the floor beside the chest, about level with or a little ahead of its
      // shoulder (e.g. propped up on the forearms after rolling over), is where a push-up starts:
      // it stays there (about where a push-up puts it: just outside the shoulder, not under the
      // chest, not so far out that the arm would push sideways and slide away)
      const usable = this.seg['hand' + s].body.groundContact && at[s].lat > 0.16 && at[s].lat < 0.36 && at[s].ahead > -0.1 && at[s].ahead < 0.3;
      if (g.useArm[s] && !usable) propped = false;
    }
    // (a lone arm always goes to its own spot, further ahead and nearer the middle)
    if (g.useArm.L !== g.useArm.R) propped = false;
    // Propped up on an arm that is not in a push-up spot (say on one forearm, the other hand behind):
    // the arms first give way and let the chest down onto the floor, from where they can be
    // brought to the sides (an arm carrying the chest cannot be moved, and pushing up from a
    // lopsided prop rolls the body over).
    const chestUp = chest.pos.y - this.world.groundY;
    if (!propped && chestUp > 0.2) g.start.letDown = true;
    else if (chestUp < 0.165) g.start.letDown = false;
    for (const s of SIDES) {
      const sg = s === 'L' ? 1 : -1;
      if (st[s] === 'guard') {
        this.guardArm(s);
        continue;
      }
      const ka = g.start.letDown ? 0.2 : 1;
      if (st[s] === 'out') this.setRel('shoulder' + s, _q0.setFromEuler(-0.2, 0, 1.45 * sg, 'XYZ'), 140 * ka, 10 * ka, 90);
      else this.setRel('shoulder' + s, _q0.setFromEuler(0.1, 0, (st[s] === 'trapped' ? 0.35 : 0.12) * sg, 'XYZ'), 140 * ka, 10 * ka, 90);
      this.setRel('elbow' + s, _q1.identity(), 50 * ka * ka, 3 * ka, 50);
      this.setRel('wrist' + s, _q2.identity(), 6, 0.2, 8);
      // (by the side, out to the side or overhead all do, as long as the hand is clear of the
      // chest: the push-up carries each hand round the outside of its shoulder to its spot)
      if (at[s].lat < 0.12 || st[s] === 'trapped') ready = false;
    }
    // trunk muscles settle the body level, or, with an arm trapped under the chest, tipped a little
    // onto the other side, lifting that side of the chest off the arm
    const w = this.levelTrunk(dt, st.L === 'trapped' && st.R !== 'trapped' ? 0.45 : st.R === 'trapped' && st.L !== 'trapped' ? -0.45 : 0);
    // legs straight and side by side under the hips (the push-up kneels on them)
    const kl = this.jt.kneeL.worldAnchor(gs.a), kr = this.jt.kneeR.worldAnchor(gs.b);
    const lx = fz, lz = -fx;
    const al = this.ankleWorld('L', gs.c), ar = this.ankleWorld('R', gs.d);
    const off = (a, b) => Math.abs((0.5 * (a.x + b.x) - pel.pos.x) * lx + (0.5 * (a.z + b.z) - pel.pos.z) * lz);
    // (and in line with the trunk: legs swept off to one side would kneel up skewed)
    const legsOk = off(kl, kr) < 0.1 && off(al, ar) < 0.15 && (kl.x - kr.x) * lx + (kl.z - kr.z) * lz > 0.1;
    const fy = chest.localDirToWorld(FWD, gs.d).y, tilt = Math.abs(chest.localDirToWorld(LAT, gs.d).y);
    // Push off from here when lying face down with the arms ready (or propped on hands already
    // placed for it). The arms and legs need not be tidy: after a while the push-up starts from
    // wherever they are (the hands are planned from where they lie, a pinned one is drawn out
    // round the shoulder), rather than giving up and rolling over again.
    const faceDown = fy < -0.55 && tilt < 0.45;
    const go = g.t > 0.3 && Math.abs(w) < 0.4 && ((fy < -0.8 && ready && (legsOk || g.t > 1)) || (faceDown && propped && g.t > 0.4) || (faceDown && g.t > 2));
    if (go) {
      for (const s of SIDES) {
        g.hand[s] = null;
        if (!propped || !g.useArm[s]) continue;
        // the propped hands are planted where they are
        const wr = this.jt['wrist' + s].worldAnchor(new Vec3());
        wr.y = Math.min(wr.y, this.world.groundY + 0.06);
        g.hand[s] = { planted: true, at: wr };
      }
      this.getUpPhase(g, 'push');
    } else if (g.t > 3) this.failGetUp('flat');
  }

  /**
   * Trunk muscles (obliques, back) holding a body that lies or crawls face down level about its
   * long axis: bounded damping of the spin and a pull toward side tilt `tiltT` (LAT.y of the
   * chest; about the head-ward axis a positive turn lifts the left side). Returns the spin rate.
   */
  levelTrunk(dt, tiltT) {
    const gs = this.guScratch();
    const chest = this.seg.chest.body, pel = this.seg.pelvis.body;
    const A = gs.la.subVectors(chest.pos, pel.pos).normalize();
    const w = 0.5 * (chest.angVel.dot(A) + pel.angVel.dot(A));
    const tilt = chest.localDirToWorld(LAT, gs.lb).y;
    const tq = clamp(-30 * w - TILT_K * (tilt - tiltT), -TILT_MAX, TILT_MAX) * this.assistGain;
    chest.torque.addScaled(A, tq * 0.6);
    pel.torque.addScaled(A, tq * 0.4);
    return w;
  }

  /**
   * How much arm `s` should shorten (m, negative = push out further) to keep a trunk propped on
   * both hands level about its long axis: the side tipping down pushes harder, the other side
   * gives (proportional to the side tilt and its rate; internal arm work, no helper).
   */
  rollFix(g, s) {
    const gs = this.guScratch();
    const chest = this.seg.chest.body, pel = this.seg.pelvis.body;
    const A = gs.la.subVectors(chest.pos, pel.pos).normalize();
    const w = 0.5 * (chest.angVel.dot(A) + pel.angVel.dot(A));
    const tilt = chest.localDirToWorld(LAT, gs.lb).y;
    return (s === 'L' ? 1 : -1) * (0.3 * tilt + 0.06 * w);
  }

  /**
   * Plan where hand `s` goes: face down, a little ahead of and wider than the shoulder as for a
   * push-up (mostly shoulder flexion: the elbow cannot fold the hand right under a shoulder only
   * ~12 cm off the floor, nor does the shoulder extend that far back); on hands and knees, right
   * under the shoulder. A lone hand pushing up goes further ahead (under the head), so that it
   * and the knees make a long tripod that the trunk leans into; on hands and knees it comes in
   * nearer the midline.
   */
  planHand(g, s, one, quad = false) {
    const chest = this.seg.chest.body;
    const sg = s === 'L' ? 1 : -1;
    const fx = Math.sin(g.psi), fz = Math.cos(g.psi), lx = fz, lz = -fx;
    const sh = chest.localToWorld(this.geo['shoulderAnchor' + s], new Vec3());
    // still half on the side after rolling over: plan from where this shoulder will be once the
    // chest lies flat (the upper one is now high above the middle of the chest)
    if (g.phase === 'flat') sh.set(chest.pos.x + fx * 0.17 + fz * sg * 0.18, chest.pos.y, chest.pos.z + fz * 0.17 - fx * sg * 0.18);
    const wide = quad ? (one ? -0.07 : 0.03) : one ? 0.05 : 0.12;
    const ahead = quad ? 0.05 : one ? 0.25 : 0.1;
    const palm = new Vec3(sh.x + fx * ahead + lx * sg * wide, this.world.groundY, sh.z + fz * ahead + lz * sg * wide);
    const a = g.psi + 0.35 * sg;
    const to = new Vec3(palm.x - Math.sin(a) * 0.075, this.world.groundY + 0.035, palm.z - Math.cos(a) * 0.075);
    const from = this.jt['wrist' + s].worldAnchor(new Vec3());
    // the hand travels on an arc around the shoulder (polar about its floor point), clear of it
    const ang = (p) => Math.atan2(p.x - sh.x, p.z - sh.z);
    const rad = (p) => Math.hypot(p.x - sh.x, p.z - sh.z);
    // ... and round the outside of the shoulder, never under the chest
    const a0 = ang(from), aOut = Math.atan2(lx * sg, lz * sg);
    let da = wrapAngle(ang(to) - a0);
    if (Math.cos(a0 + 0.5 * da - aOut) < -0.2) da -= Math.sign(da) * 2 * Math.PI;
    const a1 = a0 + da;
    const d = Math.abs(a1 - a0) * 0.3 + Math.abs(rad(to) - rad(from));
    g.hand[s] = { from, to, sh: sh.clone(), a0, a1, r0: rad(from), r1: rad(to), t: 0, dur: clamp(0.2 + d * 0.6, 0.25, 0.5), planted: false, at: new Vec3() };
  }

  /** Wrist-shoulder distance of arm `s` now. */
  armReach(s) {
    const sh = this.seg.chest.body.localToWorld(this.geo['shoulderAnchor' + s], _v3);
    return this.jt['wrist' + s].worldAnchor(_v2).distanceTo(sh);
  }

  /** Carry hand `s` to its spot (lift, move, put down), then prop the trunk on it. */
  handToFloor(g, s, dt, reach, chestRot, k = 1, shift = null) {
    const h = g.hand[s];
    const gs = this.guScratch();
    if (h.planted) {
      this.propArm(s, h.at, reach, chestRot, g.psi, k, shift);
      return true;
    }
    h.t += dt * g.pace;
    const x = h.t / h.dur;
    const p = this.ease(x), bump = Math.sin(Math.PI * clamp(x, 0, 1));
    const an = lerp(h.a0, h.a1, p), r = Math.max(lerp(h.r0, h.r1, p) + 0.06 * bump, 0.12);
    const tgt = gs.f.set(h.sh.x + Math.sin(an) * r, lerp(h.from.y, h.to.y, p) + 0.06 * bump - Math.max(0, x - 1) * 0.15, h.sh.z + Math.cos(an) * r);
    const fx = Math.sin(g.psi), fz = Math.cos(g.psi), sg = s === 'L' ? 1 : -1;
    // elbow out to the side and a little up/back
    this.reachArm(s, tgt, gs.b.set(-0.4 * fx + fz * sg, 0.5, -0.4 * fz - fx * sg), 1, this.floorPalm(s, g.psi, gs.palm));
    const hand = this.seg['hand' + s].body;
    const wr = this.jt['wrist' + s].worldAnchor(gs.c);
    // a hand that cannot quite get to its spot goes down where it is, but not under the chest
    // (one put down under the body would tip the push-up over)
    const ch = this.seg.chest.body.pos;
    const sideOk = g.phase !== 'flat' || ((wr.x - ch.x) * fz - (wr.z - ch.z) * fx) * sg > 0.1;
    if (hand.groundContact && ((x > 0.6 && Math.hypot(wr.x - h.to.x, wr.z - h.to.z) < 0.1) || (x > 1.6 && sideOk))) {
      h.planted = true;
      h.at.copy(wr);
      h.at.y = Math.min(h.at.y, this.world.groundY + 0.06);
    }
    return false;
  }

  /** Face down -> hands and knees: hands under the shoulders, push the chest up, knees under hips. */
  guPush(g, dt) {
    const gs = this.guScratch();
    const chest = this.seg.chest.body, pel = this.seg.pelvis.body, gy = this.world.groundY;
    const fx = Math.sin(g.psi), fz = Math.cos(g.psi);
    const one = g.useArm.L !== g.useArm.R;
    if (!g.start) {
      g.start = { pel: pel.pos.clone(), knee: { L: this.kneeFloor('L', new Vec3()), R: this.kneeFloor('R', new Vec3()) }, planted: -1, reach: null };
      // hands already placed after rolling over stay where they are
      for (const s of SIDES) if (g.useArm[s] && !(g.hand[s] && g.hand[s].planted)) this.planHand(g, s, one);
    }
    const t = g.t;
    let planted = true;
    for (const s of SIDES) if (g.useArm[s] && !g.hand[s].planted) planted = false;
    if (planted && g.start.planted < 0) {
      g.start.planted = t;
      g.start.reach = { L: this.armReach('L'), R: this.armReach('R') };
    }
    // once the hands are down the arms straighten (push-up), then the hips go back and up over
    // the knees: the knees are the pivots (they carry ~60% of the weight here, too much to slide
    // them in under the hips, which is also why people rock back rather than drag their knees)
    const t0 = g.start.planted < 0 ? Infinity : g.start.planted;
    const pa = this.ease((t - t0) / 0.5), pp = this.ease((t - t0 - 0.1) / 0.7);
    const kn = g.start.knee;
    const L1 = this.geo.L1L;
    if (g.start.arc === undefined) {
      const kx = 0.5 * (kn.L.x + kn.R.x), kz = 0.5 * (kn.L.z + kn.R.z);
      const hx = (g.start.pel.x - kx) * fx + (g.start.pel.z - kz) * fz;
      g.start.arc = Math.atan2(Math.max(g.start.pel.y - gy - 0.05, 0.02), Math.max(hx, 0.05));
    }
    const arc = lerp(g.start.arc, 1.3, pp); // thigh angle above the floor: lying -> ~15 deg short of vertical
    const ca = Math.cos(arc), sa = Math.sin(arc);
    // trunk: pelvis level, the spine follows what the arms do (compliant)
    const pelRot = this.trunkRot(g.psi, Math.PI / 2 - 0.08 * pp, 0, gs.pelRot);
    const up = Math.atan2(chest.pos.y - pel.pos.y, 0.45);
    const chestRot = this.trunkRot(g.psi, Math.PI / 2 - clamp(up, -0.2, 0.7) - 0.05, 0, gs.chestRot);
    this.trunkPose(pelRot, chestRot, 0.8, -0.45, 0);
    for (const s of SIDES) {
      if (!g.useArm[s]) {
        this.guardArm(s);
        continue;
      }
      const h = g.hand[s];
      // as the hips go back the palms slide back along the floor (the arms drag them against the
      // friction), so the hands end up under the shoulders of a normal hands-and-knees position
      if (h.planted) {
        if (!h.slideFrom) h.slideFrom = h.at.clone();
        const sg = s === 'L' ? 1 : -1;
        const kx = 0.5 * (kn.L.x + kn.R.x), kz = 0.5 * (kn.L.z + kn.R.z);
        // (straight back along the body: sideways they stay where they went down, under their
        // shoulders, so that the arms stay upright)
        const wide = ((h.slideFrom.x - kx) * fz - (h.slideFrom.z - kz) * fx) * sg;
        const ex = kx + fx * 0.56 + fz * sg * wide, ez = kz + fz * 0.56 - fx * sg * wide;
        const along = (h.slideFrom.x - ex) * fx + (h.slideFrom.z - ez) * fz;
        if (along > 0) {
          const k = this.ease((pp - 0.1) / 0.8);
          h.at.x = lerp(h.slideFrom.x, ex, k);
          h.at.z = lerp(h.slideFrom.z, ez, k);
        }
      }
      // the trunk is kept level by the arms: one tipping toward its side pushes harder (extends),
      // the other gives a little (a lopsided push would roll the chest over onto one hand)
      const reach0 = g.start.reach ? lerp(g.start.reach[s], 0.54, pa) : null;
      const reach = reach0 === null || one ? reach0 : reach0 + clamp(-this.rollFix(g, s), -0.08, 0.08);
      if (this.handToFloor(g, s, dt, reach, chestRot, 1)) this.addCand(g.cands, this.seg['hand' + s].body, this.armStrength[s] ** 2);
    }
    let hipY = 0;
    for (const s of SIDES) {
      const hip = gs.k.set(kn[s].x + fx * L1 * ca, kn[s].y + L1 * sa, kn[s].z + fz * L1 * ca).clone();
      hipY += hip.y * 0.5;
      this.kneelLegTo(s, hip, pelRot, kn[s], g.psi, 0.9, 0.7);
      // the knee rests on the end of the thigh (wider than the shin)
      this.addCand(g.cands, this.seg['thigh' + s].body, this.legStrength[s] ** 2);
      this.addCand(g.cands, this.seg['shin' + s].body, 0.5 * this.legStrength[s] ** 2);
    }
    const M = this.rd.totalMass * G;
    this.assistBody(pel, hipY + 0.02, pelRot, 800, 110, 0.08 * M, 80, 40);
    // pushing up on one hand, the trunk muscles keep the chest from tipping toward the other side
    if (one) this.levelTrunk(dt, 0);
    // hips back over the knees (where the knees are now: they may have slid a little)
    const back = SIDES.every((s) => {
      const hp2 = pel.localToWorld(this.geo['hipAnchor' + s], gs.a), kw = this.jt['knee' + s].worldAnchor(gs.b);
      return (hp2.x - kw.x) * fx + (hp2.z - kw.z) * fz < 0.22;
    });
    if (pp > 0.9 && pel.pos.y - gy > 0.38 && back) this.getUpPhase(g, 'quad');
    else if (t > 3.2) this.failGetUp('push');
  }

  /** Is ground point `c` inside triangle (a, b, d) by at least `margin` (xz plane)? */
  insideTripod(a, b, d, c, margin = 0) {
    const edge = (p, q, r) => {
      // signed distance of c from edge p-q, positive on the side of r
      const ex = q.x - p.x, ez = q.z - p.z, l = Math.hypot(ex, ez) || 1e-9;
      const sc = (ex * (c.z - p.z) - ez * (c.x - p.x)) / l, sr = ex * (r.z - p.z) - ez * (r.x - p.x);
      return sr >= 0 ? sc : -sc;
    };
    return Math.min(edge(a, b, d), edge(b, d, a), edge(d, a, b)) > margin;
  }

  /** Kneeling legs on planted knees with hips at `hip(s)`; adds the knees as supports. */
  kneelBoth(g, kn, pelRot, hipOf, ankleBend, k = 1) {
    for (const s of SIDES) {
      this.kneelLegTo(s, hipOf(s), pelRot, kn[s], g.psi, k, ankleBend);
      // the knee rests on the end of the thigh (wider than the shin)
      this.addCand(g.cands, this.seg['thigh' + s].body, this.legStrength[s] ** 2);
      this.addCand(g.cands, this.seg['shin' + s].body, 0.5 * this.legStrength[s] ** 2);
    }
  }

  /** On hands and knees: walk the hands back under the shoulders one at a time, weight settled. */
  guQuad(g, dt) {
    const gs = this.guScratch();
    const chest = this.seg.chest.body, pel = this.seg.pelvis.body, gy = this.world.groundY;
    const fx = Math.sin(g.psi), fz = Math.cos(g.psi), lx = fz, lz = -fx;
    const one = g.useArm.L !== g.useArm.R;
    if (!g.start) g.start = { knee: { L: this.kneeFloor('L', new Vec3()), R: this.kneeFloor('R', new Vec3()) }, moving: null, moves: 0 };
    const kn = g.start.knee, L1 = this.geo.L1L;
    const pelRot = this.trunkRot(g.psi, Math.PI / 2 - 0.1, 0, gs.pelRot);
    const up = Math.atan2(chest.pos.y - pel.pos.y, 0.45);
    const chestRot = this.trunkRot(g.psi, Math.PI / 2 - clamp(up, -0.2, 0.6) - 0.05, 0, gs.chestRot);
    this.trunkPose(pelRot, chestRot, 0.9, -0.4, 0);
    const ca = Math.cos(1.35), sa = Math.sin(1.35);
    // a hand far out of place (e.g. after rolling over) is walked to its shoulder (worst first);
    // never the only one there is (lifting it would drop the chest: kneeling up takes the weight
    // off it first)
    if (!g.start.moving && g.t > 0.1 && !one) {
      let worst = null, wd = 0.5;
      for (const s of SIDES) {
        const h = g.hand[s];
        if (!g.useArm[s] || !h || !h.planted) continue;
        const sh = chest.localToWorld(this.geo['shoulderAnchor' + s], gs.a);
        const d = (h.at.x - sh.x) * fx + (h.at.z - sh.z) * fz;
        const w = Math.abs((h.at.x - sh.x) * lx + (h.at.z - sh.z) * lz);
        const off = Math.max(d - 0.05, w - 0.2);
        if (off > wd) {
          wd = off;
          worst = s;
        }
      }
      if (worst && g.start.moves < 4) {
        g.start.moving = worst;
        g.start.shift = 0;
        g.start.moves++;
      }
    }
    // before a hand comes off the floor the weight goes onto the other three supports
    if (g.start.moving && !g.hand[g.start.moving]) g.start.moving = null; // that arm gave out
    const mv = g.start.moving;
    let lifting = false;
    if (mv) {
      const h = g.hand[mv];
      if (h.planted) {
        g.start.shift += dt * g.pace;
        const o = mv === 'L' ? 'R' : 'L';
        const inside = !g.useArm[o] || !g.hand[o] || this.insideTripod(g.hand[o].at, kn.L, kn.R, this.sens.com, 0.025);
        if ((inside && g.start.shift > 0.3) || g.start.shift > 0.9) this.planHand(g, mv, one, true);
      } else lifting = true;
    }
    // centre of all supports and of the ones that stay down; hips and shoulders travel toward the latter
    const all = gs.h.set(0, 0, 0), tri = gs.f.set(0, 0, 0);
    let na = 0, nt = 0;
    for (const s of SIDES) {
      const h = g.hand[s];
      if (!g.useArm[s] || !h || !h.planted) continue;
      all.add(h.at);
      na++;
      if (s !== mv) {
        tri.add(h.at);
        nt++;
      }
    }
    all.add(kn.L).add(kn.R).scale(1 / (na + 2));
    tri.add(kn.L).add(kn.R).scale(1 / (nt + 2));
    const shiftAmt = mv ? smoothstep(0, 0.3, g.start.shift) : 0;
    const shift = gs.c.set((tri.x - all.x) * shiftAmt, 0, (tri.z - all.z) * shiftAmt).clone();
    // centre of mass over the middle of the supports (the tripod while a hand is moving)
    g.support.comTarget = gs.ct.set(all.x + shift.x, gy, all.z + shift.z);
    this.kneelBoth(g, kn, pelRot, (s) => gs.k.set(kn[s].x + fx * L1 * ca + shift.x * 0.8, kn[s].y + L1 * sa, kn[s].z + fz * L1 * ca + shift.z * 0.8).clone(), 0.7);
    for (const s of SIDES) {
      if (!g.useArm[s]) {
        this.guardArm(s);
        continue;
      }
      if (this.handToFloor(g, s, dt, null, chestRot, 1, s === mv ? null : shift)) {
        if (mv === s && lifting) g.start.moving = null;
        const unload = mv === s ? smoothstep(0.1, 0.3, g.start.shift) : 0;
        this.addCand(g.cands, this.seg['hand' + s].body, this.armStrength[s] ** 2 * (1 - unload));
      }
    }
    const M = this.rd.totalMass * G;
    this.assistBody(pel, kn.L.y + L1 * sa + 0.02, pelRot, 800, 110, 0.08 * M, 80, 40);
    if (!g.start.moving && g.t > 0.3) this.getUpPhase(g, 'kneel');
    else if (g.t > 3) this.failGetUp('quad');
  }

  /** Hands and knees -> tall kneel: push the weight back over the knees, then raise the trunk. */
  guKneel(g, dt) {
    const gs = this.guScratch(), S = this.sens;
    const chest = this.seg.chest.body, pel = this.seg.pelvis.body, gy = this.world.groundY;
    if (!g.start) {
      // kneel up facing along the line from the knees to the shoulders (the trunk may have turned
      // a little on the way; sitting back and rising straight along it keeps the weight over the
      // knees rather than off to one side)
      const kL = this.kneeFloor('L', gs.a), kR = this.kneeFloor('R', gs.b);
      const sL = chest.localToWorld(this.geo.shoulderAnchorL, gs.c), sR = chest.localToWorld(this.geo.shoulderAnchorR, gs.d);
      const dx = 0.5 * (sL.x + sR.x - kL.x - kR.x), dz = 0.5 * (sL.z + sR.z - kL.z - kR.z);
      if (Math.hypot(dx, dz) > 0.15) g.psi = Math.atan2(dx, dz);
    }
    const fx = Math.sin(g.psi), fz = Math.cos(g.psi);
    if (!g.start) {
      g.start = { pelPitch: this.pitchOf(pel, g.psi), chestPitch: this.pitchOf(chest, g.psi), pel: pel.pos.clone(), knee: { L: this.kneeFloor('L', new Vec3()), R: this.kneeFloor('R', new Vec3()) }, released: false };
    }
    const kn = g.start.knee;
    const kmx = 0.5 * (kn.L.x + kn.R.x), kmz = 0.5 * (kn.L.z + kn.R.z);
    const t = g.t;
    // how far the centre of mass still is in front of the knees (where they are now: they may have
    // slid since the phase began)
    const kL = this.jt.kneeL.worldAnchor(gs.a), kR = this.jt.kneeR.worldAnchor(gs.b);
    const ahead = (S.com.x - 0.5 * (kL.x + kR.x)) * fx + (S.com.z - 0.5 * (kL.z + kR.z)) * fz;
    // 1) sit back toward the heels: the weight comes back over the knees and shins
    const sb = this.ease(t / 0.45);
    // 2) raise the trunk pushing off the floor, hips forward over the knees; not while the weight
    //    is still well in front of the knees
    const r = this.ease((t - 0.3) / 0.75) * clamp(1.5 - 4 * ahead, 0.2, 1);
    g.start.q = Math.max(g.start.q || 0, r);
    const q = g.start.q;
    const pelRot = this.trunkRot(g.psi, lerp(g.start.pelPitch, 0.08, q), 0, gs.pelRot);
    const chestRot = this.trunkRot(g.psi, lerp(g.start.chestPitch, 0.06, q), 0, gs.chestRot);
    this.trunkPose(pelRot, chestRot, 1.05, lerp(-0.4, 0.05, q), 0);
    // knees stay where they are; the hips go back behind them, then up over them
    // (upright, the hips end a little behind the knees: kneeling, the weight sits over the shins)
    const off = lerp(lerp((g.start.pel.x - kmx) * fx + (g.start.pel.z - kmz) * fz, -0.12, sb), -0.07, q);
    const pelT = new Vec3(kmx + fx * off, gy + lerp(lerp(g.start.pel.y - gy, 0.47, sb), 0.53, q), kmz + fz * off);
    g.support.comTarget = gs.ct.set(kmx - fx * 0.09, gy, kmz - fz * 0.09);
    // On one hand: until it lets go, the weight stays inside the tripod it makes with the knees
    // (toward the hand's side), and the trunk muscles keep the chest from tipping over the side
    // without an arm.
    const s1 = g.useArm.L !== g.useArm.R ? (g.useArm.L ? 'L' : 'R') : null, h1 = s1 ? g.hand[s1] : null;
    if (h1 && h1.planted && !g.start.released) {
      const lx = fz, lz = -fx;
      const lat = clamp((h1.at.x - kmx) * lx + (h1.at.z - kmz) * lz, -0.3, 0.3) / 3;
      g.support.comTarget.x += lx * lat;
      g.support.comTarget.z += lz * lat;
      this.levelTrunk(dt, 0);
    }
    // the hips follow the weight: kneeling on a base only as wide as the knees, a sideways drift
    // (e.g. leaning toward the side without a supporting arm) is caught by moving the hips back
    // over the knees
    this.comFeedback(pelT, g.support.comTarget, 0.5, 0.08);
    this.kneelBoth(g, kn, pelRot, (s) => gs.k.copy(this.geo['hipAnchor' + s]).applyQuat(pelRot).add(pelT).clone(), lerp(0.7, -0.25, q));
    for (const s of SIDES) this.addCand(g.cands, this.seg['foot' + s].body, (0.2 + 0.3 * q) * this.legStrength[s]);
    // hands come off the floor once the weight is over the knees (or out of reach); hands that
    // have already left it are not reached for again (straining toward a floor point that has
    // gone out of reach would pull the trunk forward, off the knees)
    const handsDown = SIDES.some((s) => g.useArm[s] && g.hand[s] && g.hand[s].planted && this.seg['hand' + s].body.groundContact);
    g.start.handsOff = handsDown ? 0 : (g.start.handsOff || 0) + dt;
    if (!g.start.released && ((ahead < 0.04 && q > 0.25) || q > 0.7 || (q > 0.2 && g.start.handsOff > 0.2))) g.start.released = true;
    for (const s of SIDES) {
      const h = g.hand[s];
      if (!g.useArm[s]) this.guardArm(s);
      else if (h && h.planted && !g.start.released) {
        this.propArm(s, h.at, 0.56, chestRot, g.psi, 1);
        this.addCand(g.cands, this.seg['hand' + s].body, this.armStrength[s] ** 2);
      } else {
        if (h) h.planted = false;
        this.relaxArm(s, 0.8);
      }
    }
    const M = this.rd.totalMass * G;
    this.assistBody(pel, pelT.y, pelRot, 900, 120, 0.1 * M, 110, 55);
    this.assistBody(chest, null, chestRot, 0, 0, 0, 110, 55);
    if (q >= 0.98 && pel.pos.y - gy > 0.44 && S.chestTilt < 0.5) this.getUpPhase(g, 'lunge');
    else if (g.t > 2.6) this.failGetUp('kneel');
  }

  /** Tall kneel -> half kneel: weight onto the back knee, the front foot steps forward. */
  guLunge(g, dt) {
    const gs = this.guScratch();
    const pel = this.seg.pelvis.body, chest = this.seg.chest.body, gy = this.world.groundY;
    const F = g.front, B = F === 'L' ? 'R' : 'L';
    const sgF = F === 'L' ? 1 : -1;
    const fx = Math.sin(g.psi), fz = Math.cos(g.psi), lx = fz, lz = -fx;
    if (!g.start) {
      const hipF = pel.localToWorld(this.geo['hipAnchor' + F], new Vec3());
      const kneeB = this.kneeFloor(B, new Vec3());
      // half kneel: front foot ~0.3 m ahead of its hip (shin ~15 deg forward of vertical) and a
      // stance width (~0.2 m) to the side of the back knee: standing up, the feet are then a
      // normal stance apart (in line, the stance would be a tightrope)
      const side = (hipF.x - kneeB.x) * lx + (hipF.z - kneeB.z) * lz;
      const w = sgF * Math.max(0.2, side * sgF) - side;
      g.start = {
        ank: this.ankleWorld(F, new Vec3()),
        kneeB,
        pel: pel.pos.clone(),
        target: new Vec3(hipF.x + fx * 0.31 + lx * w, gy + 0.085, hipF.z + fz * 0.31 + lz * w),
        planted: -1,
      };
    }
    const t = g.t;
    const S = this.sens;
    // shift the weight over the back knee; only then swing the front leg through, quickly
    const shift = this.ease(t / 0.3);
    const kb = g.start.kneeB;
    const latOff = Math.abs((S.com.x - kb.x) * lx + (S.com.z - kb.z) * lz);
    if (g.start.swing === undefined && t > 0.2 && (latOff < 0.045 || t > 0.55)) {
      g.start.swing = t;
      // the swing starts from where the foot is now (the hips have moved across meanwhile)
      this.ankleWorld(F, g.start.ank);
    }
    const sw = g.start.swing === undefined ? 0 : clamp((t - g.start.swing) / 0.42, 0, 1);
    // pelvis right over the back knee (a little beyond it, to balance the free leg on the other
    // side) and a little behind it, over the shin
    const bx = kb.x - fx * 0.05, bz = kb.z - fz * 0.05;
    const pelT = gs.f.set(lerp(g.start.pel.x, bx, shift), gy + 0.53, lerp(g.start.pel.z, bz, shift));
    // once the front foot is down the weight moves back to between the knee and the foot
    if (g.start.planted >= 0) {
      const st = smoothstep(0, 0.3, t - g.start.planted) * 0.5;
      const a = this.ankleWorld(F, gs.a);
      pelT.x = lerp(pelT.x, 0.5 * (kb.x + a.x) - fx * 0.12, st);
      pelT.z = lerp(pelT.z, 0.5 * (kb.z + a.z) - fz * 0.12, st);
    }
    // centre of mass over the back knee during the swing, then between knee and front foot
    const settle = g.start.planted >= 0 ? smoothstep(0, 0.3, t - g.start.planted) : 0;
    const ankF = this.ankleWorld(F, gs.a);
    g.support.comTarget = gs.ct.set(lerp(lerp(g.start.pel.x, kb.x - fx * 0.07, shift), 0.5 * (kb.x + ankF.x), settle), gy, lerp(lerp(g.start.pel.z, kb.z - fz * 0.07, shift), 0.5 * (kb.z + ankF.z), settle));
    this.comFeedback(pelT, g.support.comTarget, 0.7, 0.06);
    const pelRot = this.trunkRot(g.psi, 0.06, 0, gs.pelRot);
    const chestRot = this.trunkRot(g.psi, 0.1, 0, gs.chestRot);
    this.trunkPose(pelRot, chestRot, 1.1, 0.1, 0);
    const hipB = gs.k.copy(this.geo['hipAnchor' + B]).applyQuat(pelRot).add(pelT).clone();
    this.kneelLegTo(B, hipB, pelRot, kb, g.psi, 1.3, -0.25);
    this.addCand(g.cands, this.seg['thigh' + B].body, 1);
    this.addCand(g.cands, this.seg['shin' + B].body, 0.5);
    this.addCand(g.cands, this.seg['foot' + B].body, 0.35);
    // front leg: knee lifts, foot travels forward and plants flat in front of the hip
    const tgt = g.start.target;
    const now = gs.h.lerpVectors(g.start.ank, tgt, this.ease(sw));
    now.y = lerp(g.start.ank.y, tgt.y, this.ease(sw)) + 0.12 * Math.sin(Math.PI * sw);
    const footF = this.seg['foot' + F].body;
    if (sw >= 1) now.y = tgt.y - Math.min(0.04, (t - g.start.swing - 0.42) * 0.3);
    // a toe brushing the floor on the way is not a plant: the foot has to arrive near its spot
    if (g.start.planted < 0 && sw > 0.85 && footF.groundContact) {
      const a = this.ankleWorld(F, gs.c);
      if (a.y < gy + 0.12 && (Math.hypot(a.x - tgt.x, a.z - tgt.z) < 0.1 || t - g.start.swing > 0.75)) {
        g.start.planted = t;
        // the leg holds the foot where it landed (a lightly loaded foot would otherwise wander)
        g.start.plantAt = new Vec3(a.x, gy + 0.085, a.z);
      }
    }
    if (g.start.planted >= 0) {
      this.standLegTo(F, pel.localToWorld(this.geo['hipAnchor' + F], gs.a).clone(), pelRot, g.start.plantAt, g.psi, 0.9);
      this.addCand(g.cands, footF, smoothstep(0, 0.25, t - g.start.planted));
    } else if (g.start.swing === undefined) {
      // still kneeling on both knees while the weight moves across; this knee unloads
      if (!g.start.kneeF) g.start.kneeF = this.kneeFloor(F, new Vec3());
      const hipF = gs.k.copy(this.geo['hipAnchor' + F]).applyQuat(pelRot).add(pelT).clone();
      this.kneelLegTo(F, hipF, pelRot, g.start.kneeF, g.psi, 1, -0.25);
      this.addCand(g.cands, this.seg['thigh' + F].body, 1 - shift);
    } else this.swingLegTo(F, now, g.psi, 0.9, 220, 1.5 * (1 - smoothstep(0.1, 0.5, sw)));
    // arms: out a little for balance; the front-side hand comes to the front knee once it is up
    this.relaxedArms(0.9, 0);
    this.armsOut(0.25);
    if (sw > 0.5 && g.useArm[F]) {
      const knee = this.jt['knee' + F].worldAnchor(gs.c);
      this.reachArm(F, gs.d.copy(knee).addScaled(gs.e.set(fx, 0, fz), -0.02).add(_v3.set(lx * sgF * 0.01, 0.07, lz * sgF * 0.01)), gs.e.set(lx * sgF, -0.2, lz * sgF), 0.9);
    }
    if (!g.useArm.L) this.guardArm('L');
    if (!g.useArm.R) this.guardArm('R');
    const M = this.rd.totalMass * G;
    this.assistBody(pel, pelT.y, pelRot, 900, 120, 0.1 * M, 130, 60);
    this.assistBody(chest, null, chestRot, 0, 0, 0, 120, 55);
    if (g.start.planted >= 0 && t - g.start.planted > 0.12) {
      g.plantF = g.start.plantAt;
      this.getUpPhase(g, 'rise');
    } else if (t > 2.2 || (t > 0.4 && pel.pos.y - gy < 0.3)) this.failGetUp('lunge');
  }

  /** Half kneel -> standing: lean over the front foot, push off the front knee with the hand and rise. */
  guRise(g, dt) {
    const gs = this.guScratch(), S = this.sens;
    const pel = this.seg.pelvis.body, chest = this.seg.chest.body, gy = this.world.groundY;
    const F = g.front, B = F === 'L' ? 'R' : 'L';
    const sgF = F === 'L' ? 1 : -1;
    const fx = Math.sin(g.psi), fz = Math.cos(g.psi), lx = fz, lz = -fx;
    if (!g.start) {
      const ankF = g.plantF ? g.plantF.clone() : this.ankleWorld(F, new Vec3());
      g.start = { pel: pel.pos.clone(), ankF, toeB: this.ankleWorld(B, new Vec3()), kneeB: this.kneeFloor(B, new Vec3()), up: -1 };
    }
    const t = g.t;
    const ankF = g.start.ankF, ankB = g.start.toeB;
    // 1) lean forward and bring the weight onto the front foot (its knee travels over the toes);
    // 2) only then push up off the front leg, the back knee leaving the floor
    const tr = this.ease(t / 0.4);
    const fwdOf = (p) => (p.x - ankF.x) * fx + (p.z - ankF.z) * fz;
    const onFront = fwdOf(S.com) > -0.13;
    if (g.start.up < 0 && t > 0.25 && (onFront || t > 0.7)) g.start.up = t;
    const p = g.start.up < 0 ? 0 : this.ease((t - g.start.up) / 0.65);
    // (nearly upright at the top: the balance controller straightens the trunk, and a body handed
    // over still leaning would have its weight pushed back toward the heels)
    const lean = lerp(0.42 * tr, 0.05, p);
    const pelRot = this.trunkRot(g.psi, lean * 0.6, 0, gs.pelRot);
    const chestRot = this.trunkRot(g.psi, lean, 0, gs.chestRot);
    this.trunkPose(pelRot, chestRot, 1, 0.15, 0);
    // the hips stay ~0.3 m behind the front ankle while low (a shin leaning further forward would
    // need more ankle dorsiflexion than the ~20 deg available, and the foot would roll onto its
    // heel), coming over the feet as the legs straighten; the trunk lean carries the weight forward
    const latF = (ankF.x - g.start.pel.x) * fz - (ankF.z - g.start.pel.z) * fx;
    const latB = (ankB.x - g.start.pel.x) * fz - (ankB.z - g.start.pel.z) * fx;
    // as the front leg straightens the hips come over the front foot (the trunk carried on it
    // alone, so that the back foot can then be brought up beside it)
    const lat = lerp(lerp(latF, latB, 0.4), latF, p), back = lerp(0.3, 0.06, p);
    const px = ankF.x - fx * back + fz * (lat - latF), pz = ankF.z - fz * back - fx * (lat - latF);
    // height: the legs extend at a bounded rate (peak ~0.5 m/s, like a sit-to-stand); thrown up
    // faster, the body would coast on upward after the push and unload its feet at the hand-over
    const yGoal = lerp(lerp(g.start.pel.y - gy, 0.55, tr), 0.88, p);
    if (g.start.yT === undefined) g.start.yT = pel.pos.y - gy;
    g.start.yT = yGoal > g.start.yT ? approach(g.start.yT, yGoal, 0.5 * dt * g.pace) : yGoal;
    const pelT = gs.f.set(lerp(g.start.pel.x, px, tr), gy + g.start.yT, lerp(g.start.pel.z, pz, tr));
    // weight on the line from the back knee to the front foot (75% of the way) during the transfer,
    // then all onto the front foot (the middle of its sole) as the body comes up
    const kb2 = g.start.kneeB;
    const sole = this.soleCenter(F, gs.b);
    const cx = lerp(lerp(ankF.x, kb2.x, 0.25), sole.x + fx * 0.02, p), cz = lerp(lerp(ankF.z, kb2.z, 0.25), sole.z + fz * 0.02, p);
    g.support.comTarget = gs.ct.set(cx, gy, cz);
    this.comFeedback(pelT, g.support.comTarget, 0.7, 0.08);
    // both planted feet must stay reachable (the back one with the heel coming up onto the toes,
    // which raises its ankle ~10 cm, and its toes may drag forward a little as the hips rise)
    for (const s of SIDES) {
      const a = s === F ? ankF : this.ankleWorld(B, gs.a);
      const hip = gs.k.copy(this.geo['hipAnchor' + s]).applyQuat(pelRot).add(pelT);
      const dx = hip.x - a.x, dz = hip.z - a.z, L = (this.geo['L1' + s] + this.geo['L2' + s]) * 0.975 + (s === F ? 0 : 0.1);
      pelT.y = Math.min(pelT.y, a.y + Math.sqrt(Math.max(L * L - dx * dx - dz * dz, 0.04)) + (pelT.y - hip.y));
    }
    const hipF = gs.k.copy(this.geo['hipAnchor' + F]).applyQuat(pelRot).add(pelT).clone();
    this.standLegTo(F, hipF, pelRot, ankF, g.psi, 1.1);
    // back leg: kneeling until the push starts, then the knee comes off the floor, pushing from
    // the tucked toes (which stay on the floor: the foot only leaves it to step up)
    const hipB = gs.k.copy(this.geo['hipAnchor' + B]).applyQuat(pelRot).add(pelT).clone();
    if (g.start.up < 0) this.kneelLegTo(B, hipB, pelRot, g.start.kneeB, g.psi, 1, -0.25);
    else {
      const ankBnow = this.ankleWorld(B, gs.b).clone();
      ankBnow.y = clamp(ankBnow.y - 0.01, gy + 0.08, gy + 0.11);
      this.standLegTo(B, hipB, pelRot, ankBnow, g.psi, 0.9, -0.2 + 0.2 * p, 2.5);
    }
    this.addCand(g.cands, this.seg['foot' + F].body, 1);
    this.addCand(g.cands, this.seg['foot' + B].body, 0.45 * (1 - p) + 0.05);
    this.addCand(g.cands, this.seg['thigh' + B].body, 1 - p);
    this.addCand(g.cands, this.seg['shin' + B].body, 0.5 * (1 - p));
    // the hand pushes down on the front knee while the trunk is still bent over it
    this.relaxedArms(1, 0);
    if (g.useArm[F] && p < 0.7) {
      const knee = this.jt['knee' + F].worldAnchor(gs.c);
      this.reachArm(F, gs.d.copy(knee).add(_v3.set(lx * sgF * 0.01 - fx * 0.02, 0.06 - 0.03 * p, lz * sgF * 0.01 - fz * 0.02)), gs.e.set(lx * sgF, -0.2, lz * sgF), 1);
    }
    if (!g.useArm.L) this.guardArm('L');
    if (!g.useArm.R) this.guardArm('R');
    g.support.kp = 600;
    const M = this.rd.totalMass * G;
    this.assistBody(pel, pelT.y, pelRot, 1000, 140, 0.12 * M, 140, 70);
    this.assistBody(chest, null, chestRot, 0, 0, 0, 130, 60);
    // Once the weight is over the front foot and the hips are up off the back knee, the back foot
    // steps up beside it while the front leg straightens (people do not first stand up fully in
    // the split stance: with the back toes ~0.8 m behind, the hips cannot rise far over the front
    // foot anyway, and waiting there lets the weight drift off sideways). The weight need not be
    // exactly over the middle of the sole; after a moment it goes from anywhere over the foot.
    const off = Math.hypot(S.com.x - cx, S.com.z - cz);
    const vf = S.comVel.x * fx + S.comVel.z * fz;
    const quiet = Math.hypot(S.comVel.x, S.comVel.z) < 0.25 && Math.abs(S.comVel.y) < 0.3 && vf > -0.08;
    const up = p >= 0.6 && pel.pos.y - gy > 0.58;
    if (up && g.start.top === undefined) g.start.top = t;
    // (still a little toward the back foot's side is fine: the step lands on that side and takes
    // the weight; outward of the front foot it is not)
    const offF = (S.com.x - cx) * fx + (S.com.z - cz) * fz, offL = ((S.com.x - cx) * lx + (S.com.z - cz) * lz) * -sgF;
    const waited = g.start.top !== undefined && t - g.start.top > 0.6 && Math.abs(offF) < 0.12 && offL > -0.05 && offL < 0.18 && Math.abs(S.comVel.y) < 0.3;
    if (up && S.footLoad[F] > 0.4 && ((off < 0.08 && quiet) || waited)) {
      g.plantF = this.ankleWorld(F, new Vec3());
      this.getUpPhase(g, 'stepup');
    }
    // slumped back down to the floor: give up this attempt, rest and try again
    else if (t > 4.5 || (t > 0.4 && pel.pos.y - gy < 0.33)) this.failGetUp('rise');
  }

  /**
   * Standing on the front leg, the back foot steps up beside it (the end of a rise from a half
   * kneel): one deliberate step, its landing spot nudged toward where the weight is drifting, as in
   * a balance step, while the front leg finishes straightening. As soon as both feet are down in
   * a normal stance the balance controller takes over (it never inherits the long split stance of
   * the half kneel, which it can only leave by a run of catch steps).
   */
  guStepUp(g, dt) {
    const gs = this.guScratch(), S = this.sens;
    const pel = this.seg.pelvis.body, gy = this.world.groundY;
    const F = g.front, B = F === 'L' ? 'R' : 'L';
    const sgB = B === 'L' ? 1 : -1;
    if (!g.start) {
      // the step is made facing where the pelvis faces now (turning it back to the original heading
      // while on one foot would twist the stance foot on the floor)
      g.psi = yawOf(pel.rot);
      g.start = { from: this.ankleWorld(B, new Vec3()), target: new Vec3(), yT: pel.pos.y - gy, planted: -1, plantAt: new Vec3(), ci: new Vec3() };
    }
    const fx = Math.sin(g.psi), fz = Math.cos(g.psi), lx = fz, lz = -fx;
    const t = g.t, st = g.start;
    const ankF = this.ankleWorld(F, gs.h).clone();
    const solF = this.soleCenter(F, gs.a).clone();
    const solB = this.soleCenter(B, gs.b);
    // the weight stays over the stance foot (a little inside and ahead of the middle of its sole:
    // the trunk straightening up and the leg swinging through both pull it back) during the swing,
    // then moves toward the middle of the feet
    const q = st.planted < 0 ? 0 : this.ease((t - st.planted) / 0.4) * 0.7;
    const ix = lx * sgB * 0.015 + fx * 0.03, iz = lz * sgB * 0.015 + fz * 0.03;
    const ct = gs.ct.set(lerp(solF.x + ix, 0.5 * (solF.x + solB.x), q), gy, lerp(solF.z + iz, 0.5 * (solF.z + solB.z), q));
    g.support.comTarget = ct;
    g.support.kp = 600;
    const dur = 0.5;
    const ph = clamp(t / dur, 0, 2);
    // landing spot: a stance width beside the front foot, placed so that the middle of the two
    // soles comes under the capture point (where the weight is heading), updated while the swing is
    // young; never closer than ~13 cm beside the stance foot (the legs would collide, and the base
    // would stay a tightrope)
    if (st.planted < 0 && ph < 0.7) {
      // (fore-aft within ~12 cm of the other foot: a stance staggered more than that is one the
      // balance controller would soon tidy up with another step)
      const cpF = clamp((S.cp.x - solF.x) * fx + (S.cp.z - solF.z) * fz, -0.06, 0.06);
      const cpL = clamp(((S.cp.x - solF.x) * lx + (S.cp.z - solF.z) * lz) * sgB, -0.05, 0.12);
      // (ankle ~6 cm behind the middle of its sole)
      const along = 2 * cpF - 0.058, side = Math.max(0.13, 0.2 + cpL);
      st.target.set(solF.x + fx * along + lx * sgB * side, gy + 0.085, solF.z + fz * along + lz * sgB * side);
    }
    // trunk held in world space by the spine muscles (as when standing), straightening from the
    // rise's forward lean over ~0.6 s (straightened at once, the upper body would swing back and
    // carry the weight back off the stance foot)
    if (st.lean0 === undefined) st.lean0 = clamp(this.pitchOf(this.seg.chest.body, g.psi), 0, 0.5);
    this.standingSpine(lerp(st.lean0, 0.03, this.ease(t / 0.6)), 0, g.psi, 1);
    const pelRot = yawQuat(g.psi, gs.pelRot);
    // pelvis: moved against the weight's error like the stance legs' COM servo in standing balance
    // (proportional + slow integral, damped by the COM velocity, bounded); it rises gently toward
    // standing height, and the legs never throw the body upward (a stance leg that overshot would
    // unload its foot at the top, and the swinging leg would then spin it on the floor)
    st.yT = approach(st.yT, this.geo.pelvisBindY - 0.03, 0.4 * dt);
    st.yT = Math.min(st.yT, pel.pos.y - gy + 0.03) - clamp((pel.vel.y - 0.15) * 0.1, 0, 0.04);
    const ex = ct.x - S.com.x, ez = ct.z - S.com.z;
    st.ci.x = clamp(st.ci.x + ex * dt, -0.05, 0.05);
    st.ci.z = clamp(st.ci.z + ez * dt, -0.05, 0.05);
    let dx = ex * 0.7 + st.ci.x * 0.5 - S.comVel.x * 0.35, dz = ez * 0.7 + st.ci.z * 0.5 - S.comVel.z * 0.35;
    const dl = Math.hypot(dx, dz);
    if (dl > 0.07) {
      dx *= 0.07 / dl;
      dz *= 0.07 / dl;
    }
    const pelT = gs.f.set(pel.pos.x + dx, gy + st.yT, pel.pos.z + dz);
    // the planted feet must stay reachable
    for (const s of st.planted < 0 ? [F] : SIDES) {
      const a = s === F ? ankF : st.plantAt;
      const hip = gs.k.copy(this.geo['hipAnchor' + s]).applyQuat(pelRot).add(pelT);
      const hx = hip.x - a.x, hz = hip.z - a.z, L = (this.geo['L1' + s] + this.geo['L2' + s]) * 0.975;
      pelT.y = Math.min(pelT.y, a.y + Math.sqrt(Math.max(L * L - hx * hx - hz * hz, 0.04)) + (pelT.y - hip.y));
    }
    const hipF = gs.k.copy(this.geo['hipAnchor' + F]).applyQuat(pelRot).add(pelT).clone();
    this.standLegTo(F, hipF, pelRot, ankF, g.psi, 1.1);
    this.addCand(g.cands, this.seg['foot' + F].body, 1);
    const footB = this.seg['foot' + B].body;
    if (st.planted < 0) {
      // single support. (The stance hip keeps driving the thigh relative to the pelvis, rotation
      // included: driving the pelvis' world orientation instead, as in walking, leaves the stance
      // leg free to twist, and the swing leg's reaction then spins it on its foot whenever that is
      // lightly loaded.)
      // swing: heel up and forward, the foot travelling low, then put down flat
      const e = this.ease(Math.min(ph, 1));
      const now = gs.e.lerpVectors(st.from, st.target, e);
      now.y = lerp(st.from.y, st.target.y, e) + 0.07 * Math.sin(Math.PI * Math.min(ph, 1));
      if (ph >= 1) now.y = st.target.y - Math.min(0.04, (ph - 1) * dur * 0.3);
      this.swingLegTo(B, now, g.psi, 0.9, 220, 1.2 * (1 - smoothstep(0.1, 0.5, ph)));
      const a = this.ankleWorld(B, gs.c);
      const near = Math.hypot(a.x - st.target.x, a.z - st.target.z) < 0.07;
      if ((footB.groundContact && ph > 0.5 && (near || ph > 0.9)) || ph > 1.6) {
        st.planted = t;
        st.plantAt.set(a.x, gy + 0.085, a.z);
      }
    } else {
      const hipB = gs.k.copy(this.geo['hipAnchor' + B]).applyQuat(pelRot).add(pelT).clone();
      this.standLegTo(B, hipB, pelRot, st.plantAt, g.psi, 1);
      this.addCand(g.cands, footB, smoothstep(0, 0.15, t - st.planted));
    }
    this.relaxedArms(1, 0);
    this.armsOut(st.planted < 0 ? 0.15 : 0);
    if (!g.useArm.L) this.guardArm('L');
    if (!g.useArm.R) this.guardArm('R');
    // the same upright help the balance controller gives a standing body (Euphoria-style balance
    // assistance): it is what the step hands over to
    const M = this.rd.totalMass * G;
    this.assistBody(pel, pelT.y, pelRot, 1000, 140, 0.1 * M, 300, 110);
    // standing on both feet in a normal stance: the balance controller takes over at once (it
    // centres the weight, and catches it with a step if need be, better than a prolonged get-up
    // posture could)
    if (st.planted >= 0 && ((S.footContact.L && S.footContact.R) || t - st.planted > 0.25)) this.standUp();
    else if (t > 3.5 || pel.pos.y - gy < 0.45) this.failGetUp('stepup');
  }

  /** Hand over to the balance controller, standing and settled. */
  standUp(settleFoot = null) {
    const pel = this.seg.pelvis.body;
    if (this.mode === 'getup' && this.gu) this.heading = this.gu.psi;
    this.cdes = null;
    this.pelvisYTarget = pel.pos.y;
    this.comInt.setZero();
    this.step = null;
    // a foot still trailing behind is brought up by the balance controller's own settle step
    // (weight onto the other foot first, then the step)
    this.settleFoot = settleFoot;
    this.settleTime = 0;
    this.awkwardTime = 0;
    this.lastStepEnd = this.time;
    // the balance assistance takes over where the get-up helpers leave off (no sudden drop)
    this.assist = 0.8;
    this.getUpFails = 0;
    // (a later fall starts a new rest on the floor before the next attempt)
    this.restTime = 0;
    this.setUpperGC(1);
    this.setMode('balance');
  }

  // ------------------------------------------------------------------------------------------
  /**
   * Conscious on the floor. Lying calm when it hardly hurts; as the pain grows the body tenses,
   * curls up and writhes (slow, irregular; the arms clutch wounds through the arm layer). Unable
   * to get up and in bad pain on the back, people turn onto their side, away from the injured
   * side, and curl up (protective fetal position); they lie back again as the pain eases. (Someone
   * about to get up does not curl up first.)
   */
  doGround(dt) {
    this.assist = 0;
    this.groundTime += dt;
    this.frameNo = (this.frameNo || 0) + 1;
    this.dtLast = dt;
    const t = this.time;
    const pain = this.pain;
    const tone = clamp(0.25 + pain * 0.5, 0.25, 0.75);
    // writhing only with real pain: none below ~0.25, full at ~0.9
    const wr = smoothstep(0.25, 0.9, pain);
    const n = (f, o) => noise1(t * f + o, this.seed);
    this.setUpperGC(1);
    const chest = this.seg.chest.body, pel = this.seg.pelvis.body;
    // roll angle about the long axis: 0 face down, +-pi face up, +pi/2 on the right side (left side
    // up), -pi/2 on the left side
    const fwd = chest.localDirToWorld(FWD, _v1), lat = chest.localDirToWorld(LAT, _v2);
    const phi = Math.atan2(lat.y, -fwd.y);
    const gs = this.groundState || (this.groundState = { side: 0 });
    if (!this.conscious || this.tone < 0.3 || this.modeTime < 0.1) gs.side = 0;
    else if (gs.side === 0 && pain > 0.5 && Math.abs(phi) > 2.0 && this.modeTime > 1.5 && !this.ableToGetUp()) {
      // turn away from the worst wound on one side (no weight on it); else toward the side the
      // body already leans to
      let w = 0;
      for (const wd of this.wounds) {
        const nm = wd.segment.name;
        if (nm.endsWith('L')) w -= 1;
        else if (nm.endsWith('R')) w += 1;
      }
      // (a broken or badly hurt limb counts too)
      w += 2 * Math.sign(Math.round(4 * (this.legStrength.L - this.legStrength.R + 0.5 * (this.armStrength.L - this.armStrength.R))) / 4);
      // wound on the left: lie on the right side (phi -> +pi/2)
      gs.side = w < 0 ? 1 : w > 0 ? -1 : phi > 0 ? 1 : -1;
    } else if (gs.side !== 0 && pain < 0.35) gs.side = 0;
    const fetal = gs.side !== 0 ? smoothstep(0.6, 1.3, Math.abs(phi) < 2.4 ? 1.4 - Math.abs(Math.abs(phi) - Math.PI / 2) : 0.5) : 0;
    if (gs.side !== 0) {
      // the top leg and arm push the body over (a bounded helper standing in for that push,
      // scaled with muscle tone), then it rests on its side, propped mainly by the curled-up
      // posture (the top knee drawn forward onto the floor, as in the recovery position) with only
      // a light hold
      const A = _v3.subVectors(chest.pos, pel.pos).normalize();
      const w = 0.5 * (chest.angVel.dot(A) + pel.angVel.dot(A));
      const err = wrapAngle(gs.side * Math.PI / 2 - phi);
      const cap = Math.abs(err) > 0.6 ? 80 : 10;
      const tq = clamp(80 * err - 20 * w, -cap, cap) * this.assistGain * smoothstep(0.3, 0.6, this.tone);
      chest.torque.addScaled(A, tq * 0.6);
      pel.torque.addScaled(A, tq * 0.4);
    }
    const curl = 0.1 + 0.55 * wr * (0.6 + 0.4 * n(0.4, 1)) + 0.35 * fetal;
    // spine curls (relative), head tucks a little
    this.setRel('lumbar', _q0.setFromEuler(curl * 0.6 + 0.2 * wr * n(0.7, 2), 0.2 * wr * n(0.5, 3), 0.25 * wr * n(0.6, 4), 'XYZ'));
    this.gains('lumbar', tone * 0.35);
    this.setRel('thoracic', _q0.setFromEuler(curl * 0.5 - 0.03 * this.breath, 0.25 * wr * n(0.45, 5), 0.2 * wr * n(0.55, 6), 'XYZ'));
    this.gains('thoracic', tone * 0.35);
    this.setRel('neckBase', _q0.setFromEuler(0.3 * curl + 0.2 * wr * n(0.8, 7), 0.3 * wr * n(0.3, 8), 0, 'XYZ'));
    this.gains('neckBase', tone * 0.6);
    this.setRel('neckTop', _q0.setFromEuler(0.2 * curl, 0.4 * wr * n(0.35, 9), 0, 'XYZ'));
    this.gains('neckTop', tone * 0.6);
    for (const s of SIDES) {
      const sg = s === 'L' ? 1 : -1;
      const o = s === 'L' ? 0 : 50;
      const legPain = clamp(wr + 0.2, 0, 1);
      // knees drawn up (more so curled on the side, the upper leg a little further forward)
      const top = gs.side !== 0 && (gs.side > 0) === (s === 'L') ? 0.25 : 0;
      const hipFlex = -0.3 - 0.9 * curl * legPain - (0.6 + top) * fetal + 0.5 * wr * n(0.5, 10 + o);
      const knee = 0.4 + 1.2 * curl * legPain + 0.6 * fetal + 0.6 * wr * Math.max(0, n(0.6, 11 + o));
      // (the top thigh also crosses over toward the floor in front: its knee is the prop)
      const cross = top ? 0.35 * fetal * sg : 0;
      this.setRel('hip' + s, _q0.setFromEuler(hipFlex, 0.15 * sg * wr * n(0.3, 12 + o), -0.12 * sg + cross, 'XYZ'));
      this.gains('hip' + s, tone * (0.12 + 0.3 * fetal));
      this.setRel('knee' + s, _q0.setFromAxisAngle(LAT, knee));
      this.gains('knee' + s, tone * (0.12 + 0.2 * fetal));
      this.setRel('ankle' + s, _q0.setFromEuler(0.3, 0, 0, 'XYZ'));
      this.gains('ankle' + s, tone * 0.15);
      // arms drawn in to the body (protective); wound clutching overrides them
      _q0.setFromEuler(-0.5 - 0.4 * curl + 0.3 * wr * n(0.4, 13 + o), 0, -0.2 * sg, 'XYZ');
      this.setRel('shoulder' + s, _q0, 40 * tone, 4, 50);
      const dir = s === 'L' ? DIRS.upperArmDirL : _v0.set(-DIRS.upperArmDirL.x, DIRS.upperArmDirL.y, DIRS.upperArmDirL.z);
      this.setRel('elbow' + s, _q1.setFromAxisAngle(_v0.crossVectors(FWD, dir).normalize(), -0.9 - 0.5 * curl - 0.4 * wr * Math.max(0, n(0.5, 14 + o))), 25 * tone, 1.5, 40);
      this.setRel('wrist' + s, _q2.setFromEuler(0, 0, 0.3 * sg, 'XYZ'), 6 * tone, 0.2, 8);
    }
  }

  doLimp() {
    this.assist = 0;
    // muscles off: commit() uses tone ~0 so joints become passive tissue only
    for (const j of this.rd.jointList) {
      this.cmd[j.name].mode = DRIVE_RELATIVE;
    }
    // breathing goes on while unconscious (brain-stem drive): the diaphragm and intercostals lift
    // the rib cage against the abdomen each breath - deeper and jerky as agonal gasps near death
    if (this.alive && this.breath) {
      const ch = this.seg.chest.body, ab = this.seg.abdomen.body;
      ch.localDirToWorld(LAT, _v0).scale(-7 * this.breath);
      ch.torque.add(_v0);
      ab.torque.sub(_v0);
    }
  }

  // ------------------------------------------------------------------------------------------
  // Arm behaviour layer (protective blocking, wound holding) — overrides arm targets when active.
  applyArmTasks(dt) {
    this.holding.L = this.holding.R = null;
    if (!this.alive || !this.conscious || this.tone < 0.3) return;
    const mode = this.mode;
    if (mode !== 'balance' && mode !== 'falling' && mode !== 'ground' && mode !== 'getup') return;
    // 1) protective reflex: forearm(s) between the body and an incoming object. Only the arm on
    // the threatened side guards an off-centre object; a central one gets both. Arms that are
    // windmilling for balance are left alone (staying upright matters more).
    const th = this.threat;
    if (th && th.tti < 0.65 && mode !== 'ground' && !(mode === 'balance' && (this.flail || 0) > 0.5)) {
      const chest = this.seg.chest.body;
      const lat = chest.localDirToWorld(LAT, _v3);
      const off = (th.point.x - chest.pos.x) * lat.x + (th.point.z - chest.pos.z) * lat.z; // + toward the left
      for (const s of SIDES) {
        const sg = s === 'L' ? 1 : -1;
        if (this.armStrength[s] > 0.2 && off * sg > -0.1) this.blockWithArm(s, th, dt);
        else if (this.guard) this.guard[s] = null;
      }
      return;
    }
    if (this.guard) this.guard.L = this.guard.R = null;
    // 2) clutch wounds (direct pressure); keep the arms for balance while stumbling or bracing
    if (!this.wounds.length) return;
    const busy = { L: false, R: false };
    if (mode === 'balance' && (this.flail || 0) > 0.4) return;
    // falling: the protective bracing reflex wins over clutching a wound (except while still
    // kneeling upright after the legs gave way)
    if (mode === 'falling' && !(this.fallCause === 'legs' && this.kneel && this.kneel.topple < 0.05)) return;
    for (const w of this.wounds) {
      const segName = w.segment.name;
      // which hands can reach it (not the wounded arm itself)
      let best = null, bestD = Infinity;
      for (const s of SIDES) {
        if (busy[s] || this.armStrength[s] < 0.25) continue;
        if (segName.endsWith(s) && /^(upperArm|forearm|hand)/.test(segName)) continue;
        const chest = this.seg.chest.body;
        const sh = chest.localToWorld(this.geo['shoulderAnchor' + s], _v0);
        const p = w.body.localToWorld(w.local, _v1);
        const d = sh.distanceTo(p);
        // prefer the hand on the same side for the torso, the opposite one for arm wounds
        const pref = /^(upperArm|forearm|hand)/.test(segName) ? 0 : segName.endsWith(s) ? -0.08 : 0;
        if (d + pref < bestD) {
          bestD = d + pref;
          best = s;
        }
      }
      if (!best || bestD > 0.68) continue;
      if (this.holdWound(best, w, 0)) {
        busy[best] = true;
        this.holding[best] = w;
        // a bad torso/neck wound gets both hands
        const other = best === 'L' ? 'R' : 'L';
        const severeCore = /^(chest|abdomen|pelvis|neck|head)$/.test(segName) && this.pain > 0.65;
        if (severeCore && !busy[other] && this.armStrength[other] > 0.25 && this.holdWound(other, w, 1)) {
          busy[other] = true;
          this.holding[other] = w;
        }
      }
      if (busy.L && busy.R) break;
    }
  }

  /** Put the palm of hand `s` on a wound (`layer` 1 = second hand stacked beside the first). */
  holdWound(s, w, layer) {
    const chest = this.seg.chest.body;
    const sh = chest.localToWorld(this.geo['shoulderAnchor' + s], new Vec3());
    const p = w.body.localToWorld(w.local, new Vec3());
    const n = w.body.localDirToWorld(w.normal, new Vec3());
    if (n.lengthSq() < 1e-8) return false;
    n.normalize();
    // fingers point away from the shoulder along the skin
    const t = new Vec3().subVectors(sh, p);
    t.addScaled(n, -t.dot(n));
    if (t.lengthSq() < 1e-6) t.set(0, 1, 0).addScaled(n, -n.y);
    t.normalize();
    const b = new Vec3().crossVectors(n, t);
    const palm = p.clone().addScaled(n, 0.024);
    if (layer) palm.addScaled(b, (s === 'L' ? 1 : -1) * 0.045).addScaled(t, 0.02);
    const wrist = palm.clone().addScaled(t, 0.07);
    if (wrist.distanceTo(sh) > 0.62) return false;
    // elbow drops down and out
    const pole = new Vec3().subVectors(sh, this.seg.chest.body.pos);
    pole.y = 0;
    pole.normalize();
    pole.y = -1.2;
    const arm = this._armOut || (this._armOut = { upper: new Quat(), fore: new Quat(), reach: 0 });
    this.armIK(s, sh, wrist, pole, arm);
    const k = 0.8 + 0.6 * this.pain;
    this.setWorld('shoulder' + s, arm.upper, 150 * k, 9 * k, 85);
    _q0.multiplyConjA(arm.upper, arm.fore);
    this.setRel('elbow' + s, _q0, 70 * k, 3 * k, 65);
    // hand: palm onto the wound, fingers along -t
    const X = n.clone().negate();
    const Y = t.clone().negate();
    const Z = new Vec3().crossVectors(X, Y);
    _q1.setFromBasis(X, Y, Z);
    _q2.copy(this.geo['handBasis' + s]).conjugate();
    _q1.multiply(_q2);
    this.setWorld('wrist' + s, _q1, 14, 0.4, 14);
    return true;
  }

  /**
   * Protective block: forearm brought into the path of an incoming object. Head-high objects get
   * the classic forearm guard in front of the face; lower ones are fended off with the forearm in
   * front of the torso. The wrist target moves at a human arm speed (~2.5 m/s, a ~0.2 s guard
   * movement): flinging both arms up at 4-5 m/s makes their deceleration at the top lift the whole
   * body off the floor.
   */
  blockWithArm(s, th, dt = 1 / 60) {
    const chest = this.seg.chest.body;
    const head = this.seg.head.body.pos;
    const sh = chest.localToWorld(this.geo['shoulderAnchor' + s], new Vec3());
    const sg = s === 'L' ? 1 : -1;
    const lat = chest.localDirToWorld(LAT, new Vec3());
    const high = th.point.y > chest.pos.y + 0.12;
    // guard point: between the threatened point and the object, biased toward the face if high
    const guard = high ? new Vec3().lerpVectors(th.point, head, 0.5) : th.point.clone();
    guard.addScaled(th.from, high ? -0.26 : -0.3);
    guard.addScaled(lat, sg * (high ? 0.075 : 0.1));
    guard.y += high ? 0.04 : 0.02;
    const d = guard.distanceTo(sh);
    if (d > 0.55) guard.sub(sh).scale(0.55 / d).add(sh);
    if (!this.guard) this.guard = { L: null, R: null };
    if (!this.guard[s]) this.guard[s] = this.seg['hand' + s].body.localToWorld(this.geo['wristInHand' + s], new Vec3());
    const gp = this.guard[s];
    const dl = gp.distanceTo(guard), vmax = 2.5 * dt;
    if (dl > vmax) gp.lerp(guard, vmax / dl);
    else gp.copy(guard);
    const pole = new Vec3(0, -1, 0).addScaled(lat, sg * 0.6);
    const arm = this._armOut || (this._armOut = { upper: new Quat(), fore: new Quat(), reach: 0 });
    this.armIK(s, sh, gp, pole, arm);
    const str = 1.2;
    this.setWorld('shoulder' + s, arm.upper, 160 * str, 10 * str, 95);
    this.feedForward('shoulder' + s, arm.upper, dt);
    _q0.multiplyConjA(arm.upper, arm.fore);
    this.setRel('elbow' + s, _q0, 80 * str, 3.5 * str, 70);
    this.setRel('wrist' + s, _q1.identity(), 10, 0.3, 12);
  }
}
