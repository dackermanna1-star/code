import { Vec3, Quat, clamp, lerp, smoothstep, approach, noise1, wrapAngle } from '../physics/math.js';
import { DRIVE_RELATIVE, DRIVE_WORLD, DRIVE_PARENT_WORLD, RelativePointSpring } from '../physics/joints.js';
import { landmark, DIRS } from './anatomy.js';
import { twoBoneIK, makeIKResult, boneRotation } from './ik.js';

const G = 9.81;
const UP = new Vec3(0, 1, 0);
const FWD = new Vec3(0, 0, 1);
const LAT = new Vec3(1, 0, 0);
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
  constructor(ragdoll) {
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
    this.wounds = []; // [{segment, local: Vec3, normal: Vec3, priority}]
    this.threats = []; // incoming objects [{body}]
    this.events = [];
    this.debug = { cp: new Vec3(), com: new Vec3(), support: [], stepTarget: null };
    this.rng = Math.random;
    this.seed = Math.random() * 100;

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
      footContact: { L: false, R: false },
      footLoad: { L: 0, R: 0 },
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
  }

  setMode(m) {
    if (m === this.mode) return;
    this.events.push({ type: 'mode', from: this.mode, to: m, time: this.time });
    this.mode = m;
    this.modeTime = 0;
    if (m !== 'balance') this.step = null;
  }

  // ------------------------------------------------------------------------------------------
  sense() {
    const rd = this.rd, S = this.sens;
    rd.computeCOM(S.com);
    rd.computeCOMVelocity(S.comVel);
    const gy = this.world.groundY;
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
          if (_v1.y < gy + 0.03) pts.push({ x: _v1.x, z: _v1.z });
        }
      }
    }
    S.support = convexHull(pts);
    S.cpDist = polygonDistance(S.support, S.cp.x, S.cp.z, S.cpClosest);
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
    this.updateMode(dt);
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
        this.setMode('falling');
      }
    } else if (this.mode === 'falling') {
      const settled = S.torsoGround && this.rd.computeCOMVelocity(_v0).length() < 0.6;
      if (settled || this.modeTime > 2.5) this.setMode('ground');
    } else if (this.mode === 'ground') {
      // body back up somehow (e.g. dragged): resume balance attempt if feet are under it
      if (S.footContact.L && S.footContact.R && S.pelvisH > 0.8 && S.upTilt < 0.3) this.setMode('balance');
    } else if (this.mode === 'getup') {
      if (this.modeTime > 6) this.setMode('ground');
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

  // Drive the *parent* segment toward a world orientation (stance hip holding the pelvis upright).
  setParentWorld(name, q, k, d, tmax) {
    const c = this.cmd[name];
    if (!c) return;
    c.mode = DRIVE_PARENT_WORLD;
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
        const target = this.world.groundY + this.geo.pelvisBindY - 0.02;
        const fy = clamp((target - pel.pos.y) * 3000 - pel.vel.y * 300, 0, this.vAssist * this.rd.totalMass * G) * this.assist;
        pel.force.y += fy;
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
        const b = s.body;
        _v2.subVectors(b.pos, _v0);
        // torque = r x (m * g_up)
        _v1.x += -_v2.z * b.mass * G;
        _v1.z += _v2.x * b.mass * G;
        for (const c of s.children) stack.push(c);
        if (s.fractured) stack.push(...s.fractured.extra);
      }
      _v1.scale(str * 0.92);
      j.child.torque.add(_v1);
      j.parent.torque.sub(_v1);
    }
    // Stance legs: the upper body (pelvis and above) is carried at the hips. Vertical load is split
    // between the legs by the lever rule; the residual (sagittal) moment is held by the hip muscles
    // and passed down each leg, so the ankles only see the moments they can actually resist.
    if (this.mode === 'balance' || this.mode === 'getup') {
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
      // shin pitch < 0 (restoring a forward lean) loads the toes (~16 cm lever); > 0 loads the heel
      pitch = clamp(pitch, -fn * 0.16, fn * 0.05);
      roll = clamp(roll, -fn * 0.045, fn * 0.045);
      tau.set(_v2.x * pitch + _v3.x * roll, 0, _v2.z * pitch + _v3.z * roll).scale(str);
      shin.torque.add(tau);
      foot.torque.sub(tau);
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
    _q1.setFromEuler(lean * 0.5, 0, leanSide * 0.5, 'XYZ');
    _q2.multiplyQuats(_q0, _q1);
    this.setWorld('thoracic', _q2);
    this.gains('thoracic', k);
    this.setRel('neckBase', _q1.identity());
    this.gains('neckBase', k);
    // head stabilisation (vestibulo-collic reflex): keep it level, facing heading / look target
    let hy = yaw;
    let pitch = 0;
    if (this.lookTarget) {
      const hp = this.seg.head.body.pos;
      _v0.subVectors(this.lookTarget, hp);
      const yy = Math.atan2(_v0.x, _v0.z);
      const dy = clamp(wrapAngle(yy - yaw), -1.2, 1.2);
      hy = yaw + dy;
      pitch = clamp(-Math.atan2(_v0.y, Math.hypot(_v0.x, _v0.z)), -0.6, 0.6);
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
      const quiet = !this.step && S.footContact.L && S.footContact.R && Math.hypot(S.comVel.x, S.comVel.z) < 0.1;
      if (quiet) this.heading += clamp(wrapAngle(fy - this.heading), -0.35 * dt, 0.35 * dt);
    }

    // ---------------- stepping -----------------
    const dsup = S.footContact.L && S.footContact.R;
    this.recentStep = this.time - this.lastStepEnd < 0.6;
    const speed = Math.hypot(S.comVel.x, S.comVel.z);
    if (!this.step) {
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
    if (stanceSides.length === 1) {
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
    }
    const pelTarget = this._pelTarget || (this._pelTarget = new Vec3());
    if (this.step && this.step.kind !== 'settle') {
      // reactive single support: don't fight the pendulum; keep height & posture
      pelTarget.set(pel.pos.x + S.comVel.x * dt, 0, pel.pos.z + S.comVel.z * dt);
      pelTarget.x += (_v0.x - S.com.x) * 0.15;
      pelTarget.z += (_v0.z - S.com.z) * 0.15;
    } else {
      // COM servo (ankle/hip strategy): proportional + leaky integral on the COM error, damped by
      // COM velocity. Expressed as a pelvis displacement since the legs carry the pelvis.
      const kp = this.servo.kp, kd = this.servo.kd, ki = this.servo.ki;
      const ex = _v0.x - S.com.x, ez = _v0.z - S.com.z;
      this.comInt.x = clamp(this.comInt.x * (1 - 0.6 * dt) + ex * dt, -0.05, 0.05);
      this.comInt.z = clamp(this.comInt.z * (1 - 0.6 * dt) + ez * dt, -0.05, 0.05);
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
    const crouch = (this.step || this.recentStep ? 0.02 : 0.012) + 0.04 * this.startle + 0.03 * (1 - skill);
    // smoothed standing height; never follows a sagging pelvis down (that would make the stance
    // knee fold and pull the foot off the floor), but is capped above the current height so a
    // deep crouch is straightened gradually instead of launching the body
    let desiredY = this.world.groundY + g.pelvisBindY - crouch;
    // every stance leg must be able to reach its planted foot (wide stances lower the pelvis), and a
    // swing leg must be able to reach its landing spot (long catch steps become a lunge)
    const reachSides = this.step ? [this.step.stance, this.step.foot] : stanceSides;
    for (const s of reachSides) {
      if (this.step && s === this.step.foot) {
        if (this.step.t / this.step.duration < 0.35) continue;
        _v2.copy(this.step.target);
        _v2.y -= 0.01;
      } else this.ankleWorld(s, _v2);
      const hx = pelTarget.x + Math.cos(this.heading) * g['hipAnchor' + s].x - _v2.x;
      const hz = pelTarget.z - Math.sin(this.heading) * g['hipAnchor' + s].x - _v2.z;
      const Lmax = (g['L1' + s] + g['L2' + s]) * 0.985;
      const reachY = _v2.y + Math.sqrt(Math.max(Lmax * Lmax - hx * hx - hz * hz, 0.04)) - g['hipAnchor' + s].y;
      desiredY = Math.min(desiredY, reachY);
    }
    if (this.pelvisYTarget === undefined) this.pelvisYTarget = pel.pos.y;
    // descend promptly when needed, rise slowly
    this.pelvisYTarget = desiredY < this.pelvisYTarget ? approach(this.pelvisYTarget, desiredY, 0.8 * dt) : approach(this.pelvisYTarget, desiredY, 0.25 * dt);
    // just after a foot strike the legs absorb (yield) instead of pushing the body back up
    const sinceLand = this.time - this.lastStepEnd;
    const upCap = sinceLand < 0.25 && !this.step ? 0.005 : 0.045;
    if (sinceLand < 0.02 && !this.step) this.pelvisYTarget = Math.min(this.pelvisYTarget, pel.pos.y);
    // vertical damping: never let the legs throw the body upward
    pelTarget.y = Math.min(this.pelvisYTarget, pel.pos.y + upCap) - clamp((pel.vel.y - 0.15) * 0.1, 0, 0.05);
    // pelvis orientation: upright facing heading; hip strategy lean from CP error
    const pelRot = this._pelRot || (this._pelRot = new Quat());
    yawQuat(this.heading, pelRot);

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
          // capped near real hip-flexor strength (~150-200 N at the foot)
          spring.maxForce = (this.footSpringForce ?? 200) * this.legStrength[s] * this.tone;
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
        this.cmd['knee' + s].d *= 1.25;
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
        if (!S.footContact[s]) _v2.y = Math.max(Math.min(_v2.y - 0.02, this.world.groundY + 0.12), this.world.groundY + 0.075);
        _v3.set(Math.sin(this.heading), 0, Math.cos(this.heading));
        this.legIK(s, _v1, _v2, _v3, legOut);
        if (this.step) {
          // single support: the stance hip holds the pelvis/trunk upright in world space with the
          // reaction going into the planted leg (SIMBICON-style); knee and ankle place the pelvis
          this.setParentWorld('hip' + s, pelRot);
          this.gains('hip' + s, this.stanceHipGain ?? 1.6);
        } else {
          _q0.multiplyConjA(pelRot, legOut.thigh);
          this.setRel('hip' + s, _q0);
          this.gains('hip' + s, 1);
        }
        _q0.multiplyConjA(legOut.thigh, legOut.shin);
        this.setRel('knee' + s, _q0);
        this.gains('knee' + s, 1);
        // flat foot with its current yaw
        yawQuat(this.footYaw(s), _q1);
        _q0.multiplyConjA(legOut.shin, _q1);
        this.setRel('ankle' + s, _q0);
        this.gains('ankle' + s, 1);
      }
    }

    // ---------------- upper body -----------------
    // hip strategy: lean trunk against the capture-point error, arms out when threatened
    _v0.set(S.cp.x - S.cpClosest.x, 0, S.cp.z - S.cpClosest.z);
    const cpOut = Math.max(0, S.cpDist);
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
    lean += 0.12 * this.startle + 0.25 * this.painHunch();
    this.standingSpine(lean, leanSide, this.heading, 1);
    const flail = clamp(cpOut * 2.5, 0, 1);
    this.relaxedArms(1, 0);
    if (flail > 0.05) this.armsOut(flail);
  }

  painHunch() {
    return clamp(this.pain - 0.3, 0, 0.7);
  }

  soleCenter(s, out) {
    const fb = this.seg['foot' + s].body;
    out.set(0, 0, -0.012).applyQuat(fb.rot).add(fb.pos);
    out.y = this.world.groundY;
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
      const loaded = S.footLoad[stance] > 0.85 && off < 0.03 && speed < 0.06;
      if ((loaded && this.settleTime > 0.2) || this.settleTime > 1.6) {
        const f = this.settleFoot;
        this.settleFoot = null;
        this.beginStep(f, 'settle');
      } else if (speed > 0.35) this.settleFoot = null;
      return;
    }
    if (speed > 0.15 || this.time - this.lastStepEnd < 0.25) {
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
    this.planStepTarget(this.step.target);
    const dist = Math.hypot(this.step.target.x - start.x, this.step.target.z - start.z);
    if (kind === 'settle') {
      this.step.duration = clamp(0.3 + 0.35 * dist, 0.32, 0.5);
      this.step.lift = clamp(0.035 + 0.08 * dist, 0.04, 0.08);
    } else {
      this.step.duration = clamp(0.22 + 0.2 * dist, 0.24, 0.38);
      this.step.lift = clamp(0.05 + 0.1 * dist, 0.06, 0.12);
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
  stancePivot(stance, out) {
    const S = this.sens;
    const fb = this.seg['foot' + stance].body;
    const sh = fb.shapes[0];
    fb.worldToLocal(_v1.set(S.cp.x, fb.pos.y, S.cp.z), _v2);
    _v2.sub(sh.localPos);
    const ex = sh.halfExtents.x - 0.015, ez = sh.halfExtents.z - 0.02;
    _v2.x = clamp(_v2.x, -ex, ex);
    _v2.z = clamp(_v2.z, -ez, ez);
    _v2.y = 0;
    _v2.add(sh.localPos);
    fb.localToWorld(_v2, out);
    out.y = this.world.groundY;
    return out;
  }

  /**
   * Capture-point step target for `foot` while standing on `stance`, `remaining` seconds from now
   * (linear inverted pendulum about the reachable centre of pressure). Writes the ankle target and
   * returns a cost penalty: 0 for a normal step, > 0 for a crossover (foot passes the stance leg).
   */
  captureTarget(foot, stance, remaining, out) {
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
    const minW = 0.13, maxW = 0.55;
    let penalty = 0;
    if (side * left < minW) {
      if (side * left < 0.02) {
        // crossover step: allowed, but the foot must pass clear of the stance foot
        left = side * Math.max(side * left, -0.16);
        if (Math.abs(fwd) < 0.16) fwd = fwd >= -0.02 ? 0.16 : -0.16;
        penalty = 0.25 + Math.abs(side * left - minW);
      } else {
        left = side * minW;
      }
    } else if (side * left > maxW) left = side * maxW;
    fwd = clamp(fwd, -0.5, 0.75);
    const len = Math.hypot(fwd, left);
    if (len > 0.8) {
      fwd *= 0.8 / len;
      left *= 0.8 / len;
    }
    out.x = sc.x + hx * fwd + lx * left - hx * 0.058;
    out.z = sc.z + hz * fwd + lz * left - hz * 0.058;
    out.y = this.world.groundY + 0.085;
    return penalty;
  }

  planStepTarget(out) {
    const st = this.step;
    if (st.kind === 'settle') {
      // natural stance width beside the stance foot
      const p = this.soleCenter(st.stance, _v0);
      const hx = Math.sin(this.heading), hz = Math.cos(this.heading);
      const lx = hz, lz = -hx;
      const sd = st.foot === 'L' ? 1 : -1;
      out.set(p.x + lx * 0.21 * sd - hx * 0.058, this.world.groundY + 0.085, p.z + lz * 0.21 * sd - hz * 0.058);
      return out;
    }
    this.captureTarget(st.foot, st.stance, Math.max(0.05, st.duration - st.t), out);
    return out;
  }

  updateStep(dt) {
    const st = this.step, S = this.sens;
    st.t += dt;
    const phase = st.t / st.duration;
    if (phase < 0.8 && !st.planting) this.planStepTarget(st.target);
    st.prevAnkle.copy(st.ankleNow);
    // plant on arrival: once the real foot has reached its landing spot, stop travelling and put
    // it straight down (a swing that keeps going would overshoot and brake the body too hard)
    const cur = this.ankleWorld(st.foot, _v1);
    if (!st.planting && phase > 0.45 && st.kind !== 'settle') {
      const dx = st.target.x - st.start.x, dz = st.target.z - st.start.z;
      const len2 = dx * dx + dz * dz;
      if (len2 > 0.01) {
        const prog = ((cur.x - st.start.x) * dx + (cur.z - st.start.z) * dz) / len2;
        if (prog > 0.95) {
          st.planting = true;
          st.plantAt = cur.clone();
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
      const bulge = (tf >= 0 ? 1 : -1) * 0.14 * Math.sin(Math.PI * sx);
      st.ankleNow.x += hx * bulge;
      st.ankleNow.z += hz * bulge;
    }
    const liftPhase = clamp(phase / 0.9, 0, 1);
    st.ankleNow.y = lerp(st.start.y, st.target.y, sx) + st.lift * Math.pow(Math.sin(Math.PI * liftPhase), 0.7);
    if (phase > 0.9) st.ankleNow.y = st.target.y - Math.min(0.05, (phase - 0.9) * 0.25); // reach down until contact
    st.yaw = st.startYaw + wrapAngle(this.heading - st.startYaw) * sx;
    st.toePitch = phase < 0.75 ? -0.22 * smoothstep(0, 0.25, phase) : -0.22 * (1 - smoothstep(0.75, 0.95, phase));
    const contact = S.footContact[st.foot];
    const near = Math.hypot(this.ankleWorld(st.foot, _v1).x - st.target.x, _v1.z - st.target.z) < 0.07;
    if ((phase > 0.8 && contact) || (phase > 0.5 && contact && near) || phase > 1.5) this.endStep(st);
  }

  endStep(st) {
    this.step = null;
    this.lastStepEnd = this.time;
    this.lastStepFoot = st.foot;
    this.events.push({ type: 'land', foot: st.foot, time: this.time });
  }

  // ------------------------------------------------------------------------------------------
  doFalling(dt) {
    const S = this.sens;
    this.assist = 0;
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
    // head: tuck chin when falling backward, look up when forward
    const hs = this.seg.head.body;
    _q0.copy(this.seg.chest.body.rot);
    _q1.setFromEuler(along < 0 ? 0.55 : -0.35, 0, -left * 0.3, 'XYZ');
    _q0.multiply(_q1);
    this.setWorld('neckTop', _q0, 140, 6, 45);
    this.setRel('neckBase', _q1.setFromEuler(along < 0 ? 0.4 : -0.2, 0, 0, 'XYZ'), 160, 7, 60);
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
    this.braceArms(fd, along, left);
  }

  braceArms(fd, along, left) {
    const chest = this.seg.chest.body;
    for (const s of SIDES) {
      if (this.armTask[s] && this.armTask[s].priority > 2) continue;
      const sg = s === 'L' ? 1 : -1;
      // shoulder world position
      chest.localToWorld(this.geo['shoulderAnchor' + s], _v0);
      // hand target: ahead in fall direction, toward the ground, shoulder-width apart
      const lx = fd.z, lz = -fd.x; // left of fall direction
      const sideOffset = 0.22 * sg * (along >= 0 ? 1 : 1);
      _v1.copy(_v0);
      _v1.x += fd.x * 0.45 + lx * sideOffset * (along >= -0.3 ? 1 : 1.5);
      _v1.z += fd.z * 0.45 + lz * sideOffset * (along >= -0.3 ? 1 : 1.5);
      _v1.y = Math.max(this.world.groundY + 0.05, _v0.y - 0.55);
      // the arm on the side we fall toward reaches more
      const bias = 1 + clamp(left * sg, -0.6, 0.6);
      _v1.lerp(_v0, clamp(1 - bias, 0, 0.6));
      _v2.set(-fd.x, 0.6, -fd.z); // elbows bend back/up
      const arm = this._armOut || (this._armOut = { upper: new Quat(), fore: new Quat(), reach: 0 });
      this.armIK(s, _v0, _v1, _v2, arm);
      this.setWorld('shoulder' + s, arm.upper, 180, 10, 85);
      _q0.multiplyConjA(arm.upper, arm.fore);
      this.setRel('elbow' + s, _q0, 70, 3, 60);
      // wrist extended (palm toward ground)
      _q1.setFromEuler(0, 0, 0);
      this.setRel('wrist' + s, _q1, 10, 0.3, 12);
    }
  }

  // ------------------------------------------------------------------------------------------
  doGround(dt) {
    this.assist = 0;
    this.groundTime += dt;
    // on the ground: lowered tone, protective curl proportional to pain, slow procedural writhing
    const t = this.time;
    const pain = this.pain;
    const tone = clamp(0.25 + pain * 0.5, 0.25, 0.75);
    const wr = clamp(pain * 1.2, 0, 1); // writhe intensity
    const n = (f, o) => noise1(t * f + o, this.seed);
    const curl = 0.15 + 0.5 * wr * (0.6 + 0.4 * n(0.4, 1));
    // spine curls (relative), head lifts slightly
    this.setRel('lumbar', _q0.setFromEuler(curl * 0.6 + 0.2 * wr * n(0.7, 2), 0.2 * wr * n(0.5, 3), 0.25 * wr * n(0.6, 4), 'XYZ'));
    this.gains('lumbar', tone * 0.35);
    this.setRel('thoracic', _q0.setFromEuler(curl * 0.5, 0.25 * wr * n(0.45, 5), 0.2 * wr * n(0.55, 6), 'XYZ'));
    this.gains('thoracic', tone * 0.35);
    this.setRel('neckBase', _q0.setFromEuler(0.3 * curl + 0.2 * wr * n(0.8, 7), 0.3 * wr * n(0.3, 8), 0, 'XYZ'));
    this.gains('neckBase', tone * 0.6);
    this.setRel('neckTop', _q0.setFromEuler(0.2 * curl, 0.4 * wr * n(0.35, 9), 0, 'XYZ'));
    this.gains('neckTop', tone * 0.6);
    for (const s of SIDES) {
      const sg = s === 'L' ? 1 : -1;
      const o = s === 'L' ? 0 : 50;
      const legPain = clamp(wr + 0.2, 0, 1);
      const hipFlex = -0.4 - 0.9 * curl * legPain + 0.5 * wr * n(0.5, 10 + o);
      const knee = 0.5 + 1.2 * curl * legPain + 0.6 * wr * Math.max(0, n(0.6, 11 + o));
      this.setRel('hip' + s, _q0.setFromEuler(hipFlex, 0.15 * sg * n(0.3, 12 + o), -0.15 * sg, 'XYZ'));
      this.gains('hip' + s, tone * 0.12);
      this.setRel('knee' + s, _q0.setFromAxisAngle(LAT, knee));
      this.gains('knee' + s, tone * 0.12);
      this.setRel('ankle' + s, _q0.setFromEuler(0.3, 0, 0, 'XYZ'));
      this.gains('ankle' + s, tone * 0.15);
      // arms: protective, drawn toward the body
      _q0.setFromEuler(-0.6 - 0.4 * curl + 0.3 * wr * n(0.4, 13 + o), 0, -0.2 * sg, 'XYZ');
      this.setRel('shoulder' + s, _q0, 40 * tone, 4, 50);
      const axis = _v0.set(1, 0, 0);
      this.setRel('elbow' + s, _q1.setFromAxisAngle(axis, -1.2 - 0.4 * wr * Math.max(0, n(0.5, 14 + o))), 25 * tone, 1.5, 40);
      this.setRel('wrist' + s, _q2.setFromEuler(0, 0, 0.3 * sg, 'XYZ'), 6 * tone, 0.2, 8);
    }
  }

  doGetUp() {}

  doLimp() {
    this.assist = 0;
    // muscles off: commit() uses tone ~0 so joints become passive tissue only
    for (const j of this.rd.jointList) {
      this.cmd[j.name].mode = DRIVE_RELATIVE;
    }
  }

  // ------------------------------------------------------------------------------------------
  // Arm behaviour layer (wound holding, head protection) — overrides arm targets when active.
  applyArmTasks() {}
}
