import * as THREE from 'three';
import { Rig, SIDES, X, Y } from './Rig.js';
import { Locomotion, BASE_GAIT } from './Locomotion.js';
import { BodyLayer } from './BodyLayer.js';
import { MotionMatching } from './MotionMatching.js';
import { V3, Q, clamp, deg, wrapAngle } from './math.js';

const _q = Q(), _qi = Q(), _pole = V3(), _hip = V3();
const LEG_BONES = new Set(['thigh_l', 'calf_l', 'foot_l', 'ball_l', 'thigh_r', 'calf_r', 'foot_r', 'ball_r']);

/**
 * Ties everything together and writes the final pose.
 *
 * Walking is driven by motion matching over retargeted motion capture
 * (MotionMatching).  Standing, idle behaviour and turning on the spot use the
 * procedural layers (Locomotion + BodyLayer).  Starts and stops blend between
 * the two while planted feet stay locked to the floor.
 */
export class Animator {
  constructor(character) {
    this.c = character;
    this.rig = new Rig(character);
    this.loco = new Locomotion(this.rig);
    this.body = new BodyLayer(this.rig, this.loco, character);
    this.loco.teleport(V3(0, 0, 0), 0);
    this.gaitMods = {};
    this.hooks = [];
    this.mm = null;
    this.mmLegs = {
      l: { locked: false, lockBall: V3(), offset: V3(), ankle: V3(), footQ: Q(), ballQ: Q(), pole: V3(), ball: V3() },
      r: { locked: false, lockBall: V3(), offset: V3(), ankle: V3(), footQ: Q(), ballQ: Q(), pole: V3(), ball: V3() },
    };
    this.stopBlend = null;
  }

  setMocap(db) { this.mm = new MotionMatching(db); }

  /** Footwear / garment driven style (e.g. high heels). */
  setGaitModifiers(mods) {
    this.gaitMods = mods || {};
    const t = this.loco.targetGait;
    Object.assign(t, BASE_GAIT);
    for (const [k, v] of Object.entries(this.gaitMods)) {
      if (k in BASE_GAIT) {
        if (k.endsWith('Scale') || k === 'armSwing' || k === 'bounce') t[k] = BASE_GAIT[k] * v;
        else t[k] = v;
      }
    }
    // heel height must change instantly with the shoes (geometry), not blend
    this.loco.gait.heel = t.heel; this.loco.gait.sole = t.sole;
  }

  /** Ankle positions of the standing feet in the root frame (motion-matching query). */
  _idleFeet() {
    const L = this.loco;
    _qi.setFromAxisAngle(Y, -L.heading);
    const out = {};
    for (const s of SIDES) {
      const a = V3().copy(L.feet[s].ankle).sub(L.pos).applyQuaternion(_qi);
      out[s] = [a.x, a.y, a.z];
    }
    return out;
  }

  update(dt, input) {
    const L = this.loco, R = this.rig, c = this.c, M = this.mm;
    dt = Math.min(dt, 1 / 20);
    const wantWalk = input.speed > 0.05 && input.dir.lengthSq() > 1e-6;

    // ------------------------------------------------ walking (motion matching)
    if (M) {
      if (!M.active && wantWalk && !this.stopBlend) {
        const want = Math.atan2(input.dir.x, input.dir.z);
        // big direction changes from standing: turn on the spot first (procedural)
        if (Math.abs(wrapAngle(want - L.heading)) < 1.45 || L.speed > 0.2) {
          M.start(L.pos, L.heading, input, this._idleFeet());
          this._seedLocks();
          L.active = false; L.vel.set(0, 0, 0); L.speed = 0;
        }
      }
      if (M.active) {
        M.update(dt, input);
        if (!M.releasing) {
          const op = M.stopOpportunity();
          if (op) this._handover(op.stance);
        } else if (M.weight < 0.02) {
          M.stop();
          this.stopBlend = null;
        }
      }
    }
    const mmDriving = M && M.active && !M.releasing;
    const w = M && M.active ? clamp(M.weight, 0, 1) : 0;

    if (mmDriving) {
      L.pos.copy(M.root); L.heading = M.heading;
      L.vel.set(Math.sin(M.heading), 0, Math.cos(M.heading)).multiplyScalar(M.speedNow);
      L.speed = M.speedNow; L.angVel = 0; L.active = false;
      L.pelvis.y = M.P.y; L.pelvis.lat = 0;
    } else {
      // standing / turning on the spot; never start procedural walking while mocap exists
      const inp = M && wantWalk && !this.stopBlend ? { dir: input.dir, speed: 0.02, cameraYaw: input.cameraYaw, urgent: true } : (this.stopBlend ? { dir: V3(), speed: 0, cameraYaw: input.cameraYaw } : input);
      L.update(dt, M ? inp : input);
    }
    const rootPos = mmDriving ? M.root : L.pos;
    const heading = mmDriving ? M.heading : L.heading;
    c.root.position.set(rootPos.x, 0, rootPos.z);
    c.root.rotation.set(0, heading, 0);
    c.root.updateMatrixWorld();

    // ------------------------------------------------ procedural body (idle / gaze / hands / breath)
    R.reset();
    this.body.update(dt, input, this.gaitMods);
    _qi.setFromAxisAngle(Y, -heading);
    const toModel = (wv, out) => out.copy(wv).sub(rootPos).applyQuaternion(_qi);

    // procedural leg targets (model space)
    const proc = {};
    {
      const pelvisQ = R.Qm.pelvis;
      let drop = 0;
      for (const s of SIDES) {
        const f = L.feet[s];
        if (!f.stance || (L.active && f.u > 0.6)) continue;
        const hip = V3().copy(R.restLocal['thigh_' + s]).applyQuaternion(pelvisQ).add(R.pelvisPos);
        const a = toModel(f.ankle, V3());
        const dh2 = (hip.x - a.x) ** 2 + (hip.z - a.z) ** 2;
        const maxD = R.leg[s].len * 0.9975;
        drop = Math.max(drop, hip.y - (a.y + Math.sqrt(Math.max(0, maxD * maxD - dh2))));
      }
      if (drop > 0 && w < 0.999) R.pelvisPos.y -= drop * (1 - w);
      for (const s of SIDES) {
        const f = L.feet[s];
        const Lg = R.leg[s];
        _hip.copy(R.restLocal['thigh_' + s]).applyQuaternion(pelvisQ).add(R.pelvisPos);
        const ankleM = toModel(f.ankle, V3());
        if (f.stance && w < 0.5) {
          let alpha = f.alpha;
          for (let i = 0; i < 60 && ankleM.distanceTo(_hip) > Lg.len * 0.998; i++) {
            alpha += 1 * deg;
            f.toeBend = L.footPose(s, f.plantP, f.plantYaw, alpha, f.ankle, f.footQ);
            toModel(f.ankle, ankleM);
          }
        }
        const footQm = Q().copy(_qi).multiply(f.footQ);
        const footFwd = V3(0, 0, 1).applyQuaternion(footQm); footFwd.y = 0; footFwd.normalize();
        const pelvisFwd = V3(0, 0, 1).applyQuaternion(pelvisQ); pelvisFwd.y = 0; pelvisFwd.normalize();
        const pole = V3().copy(footFwd).multiplyScalar(0.7).addScaledVector(pelvisFwd, 0.3).add(V3(f.sign * 0.06, 0, 0)).normalize();
        // stop handover: the free foot lifts in a small arc as it comes to rest
        if (this.stopBlend && s !== this.stopBlend.stance) ankleM.y += 0.05 * Math.sin(Math.PI * clamp(1 - w, 0, 1)) * (w > 0.02 ? 1 : 0);
        const ballQ = Q().copy(footQm).multiply(Q().setFromAxisAngle(X, -f.toeBend));
        proc[s] = { ankle: ankleM, footQ: footQm, ballQ, pole };
      }
    }

    // ------------------------------------------------ blend in the motion-capture pose
    if (w > 0.001) {
      const B = M.db.bones;
      for (let k = 0; k < B.length; k++) {
        const b = B[k];
        if (LEG_BONES.has(b)) continue;
        R.Qm[b].slerp(M.Q[k], w); R.set[b] = true;
      }
      // gaze leads into turns on top of the captured head motion
      const look = this.body.headYaw * 0.6 * w;
      if (Math.abs(look) > 1e-4) {
        _q.setFromAxisAngle(Y, look);
        R.Qm.head.premultiply(_q);
        R.Qm.neck_01.slerp(Q().copy(_q).multiply(R.Qm.neck_01), 0.4);
      }
      const heelRaise = (this.loco.gait.heel + this.loco.gait.sole) * 0.45;
      R.pelvisPos.lerp(V3().copy(M.P).setY(M.P.y + heelRaise), w);
      // dependants of overridden bones (eyes follow the head, breasts the chest)
      if (this.body.eyeLocal) { R.setQ('eye_l', Q().copy(R.Qm.head).multiply(this.body.eyeLocal)); R.setQ('eye_r', Q().copy(R.Qm.head).multiply(this.body.eyeLocal)); }
      if (this.body.breastLocal) for (const s of SIDES) R.setQ('breast_' + s, Q().copy(R.Qm.spine_03).multiply(this.body.breastLocal));
      this._mmLegTargets(dt, M, rootPos, heading);
    }

    // ------------------------------------------------ legs
    const pelvisQ = R.Qm.pelvis;
    for (const s of SIDES) {
      _hip.copy(R.restLocal['thigh_' + s]).applyQuaternion(pelvisQ).add(R.pelvisPos);
      let { ankle, footQ, ballQ, pole } = proc[s];
      if (w > 0.001) {
        const m = this.mmLegs[s];
        ankle = V3().copy(ankle).lerp(toModel(m.ankle, V3()), w);
        footQ = Q().copy(footQ).slerp(Q().copy(_qi).multiply(m.footQ), w);
        ballQ = Q().copy(ballQ).slerp(Q().copy(_qi).multiply(m.ballQ), w);
        _pole.copy(pole).lerp(V3().copy(m.pole).applyQuaternion(_qi), w).normalize();
        pole = _pole;
      }
      R.solveLeg(s, _hip, ankle, pole, footQ, 0);
      R.Qm['ball_' + s].copy(ballQ);
    }
    for (const h of this.hooks) h(dt, this);
    R.apply();
  }

  /** Lock planted feet in place when walking starts (continuity with standing). */
  _seedLocks() {
    for (const s of SIDES) {
      const m = this.mmLegs[s];
      m.seed = this.loco.feet[s].ankle.clone(); m.locked = false; m.offset.set(0, 0, 0);
    }
  }

  /**
   * Foot targets from the captured legs: forward kinematics of the mocap leg,
   * foot locking during contacts (no sliding), floor contact and heel height.
   */
  _mmLegTargets(dt, M, rootPos, heading) {
    const R = this.rig, db = M.db, B = db.bones;
    const qRoot = Q().setFromAxisAngle(Y, heading);
    const pelvisQm = M.Q[B.indexOf('pelvis')];
    const H = this.loco.gait.heel, S = this.loco.gait.sole;
    const theta = Math.asin(clamp((H - S) / 0.13, 0, 0.95));
    for (const s of SIDES) {
      const m = this.mmLegs[s];
      const Qt = M.Q[B.indexOf('thigh_' + s)], Qc = M.Q[B.indexOf('calf_' + s)], Qf = M.Q[B.indexOf('foot_' + s)], Qb = M.Q[B.indexOf('ball_' + s)];
      const hip = V3().copy(R.restLocal['thigh_' + s]).applyQuaternion(pelvisQm).add(M.P);
      const knee = V3().copy(R.restLocal['calf_' + s]).applyQuaternion(Qt).add(hip);
      let ankle = V3().copy(R.restLocal['foot_' + s]).applyQuaternion(Qc).add(knee);
      let footQ = Q().copy(Qf);
      let ball = V3().copy(R.restLocal['ball_' + s]).applyQuaternion(footQ).add(ankle);
      // heels: pitch the foot about the ball, lift by the sole
      if (theta > 1e-3 || S > 0) {
        footQ = Q().copy(Qf).multiply(Q().setFromAxisAngle(X, theta));
        const ab = V3().copy(R.restLocal['ball_' + s]).negate().applyQuaternion(footQ);
        ankle = V3().copy(ball).add(ab);
        ankle.y += S; ball.y += S;
      }
      // to world
      const toW = (v) => v.applyQuaternion(qRoot).add(V3(rootPos.x, 0, rootPos.z));
      toW(ankle); toW(ball); toW(knee); toW(hip);
      const footQw = Q().copy(qRoot).multiply(footQ);
      const ballQw = Q().copy(qRoot).multiply(Qb);
      // floor: lowest of heel point and forefoot
      const heelPt = V3(0, -R.leg[s].a.y, R.leg[s].heelBack).applyQuaternion(footQw).add(ankle);
      const low = Math.min(ball.y - 0.011 - S, heelPt.y - (H > S ? H - S : 0) * 0.15);
      const c = s === 'l' ? M.contact.l : M.contact.r;
      let dy = c > 0.5 ? -low : Math.max(0, -low);
      dy = clamp(dy, -0.04, 0.06);
      ankle.y += dy; ball.y += dy;
      // foot locking on the ball (pivot of the stance foot)
      if (m.seed) {
        // walking just started: planted feet stay where they stood
        if (c > 0.5) { m.locked = true; m.lockBall.copy(ball).add(V3().subVectors(m.seed, ankle).setY(0)); }
        m.seed = null;
      }
      if (!m.locked && c > 0.6) { m.locked = true; m.lockBall.copy(ball); }
      if (m.locked && c < 0.4) { m.locked = false; m.offset.subVectors(m.lockBall, ball).setY(0); }
      let off;
      if (m.locked) off = V3().subVectors(m.lockBall, ball).setY(0);
      else { m.offset.multiplyScalar(Math.exp(-dt / 0.12)); off = m.offset; }
      // never drag a locked foot further than half a stride
      if (off.length() > 0.25) { m.lockBall.copy(ball); off.set(0, 0, 0); }
      m.ankle.copy(ankle).add(off);
      m.ball.copy(ball).add(off);
      m.footQ.copy(footQw);
      m.ballQ.copy(ballQw);
      // knee direction from the captured leg
      const mid = V3().addVectors(hip, ankle).multiplyScalar(0.5);
      m.pole.subVectors(knee, mid);
      if (m.pole.lengthSq() < 1e-6) m.pole.set(Math.sin(heading), 0, Math.cos(heading));
      m.pole.normalize();
    }
  }

  /** Hand over from walking to standing when one foot is planted and the other swings. */
  _handover(stance) {
    const M = this.mm, L = this.loco;
    const other = stance === 'l' ? 'r' : 'l';
    const ms = this.mmLegs[stance];
    L.pos.copy(M.root); L.heading = M.heading;
    L.vel.set(0, 0, 0); L.speed = 0; L.active = false;
    const fs = L.feet[stance], fo = L.feet[other];
    const yawOf = (q) => { const f = V3(0, 0, 1).applyQuaternion(q); return Math.atan2(f.x, f.z); };
    fs.plantP.set(ms.ankle.x, 0, ms.ankle.z);
    fs.plantYaw = yawOf(ms.footQ);
    fs.alpha = 0; fs.stance = true;
    const left = V3(Math.cos(M.heading), 0, -Math.sin(M.heading));
    const width = L.gait.standWidth;
    fo.plantP.copy(fs.plantP).addScaledVector(left, (fo.sign - fs.sign) * width / 2)
      .addScaledVector(V3(Math.sin(M.heading), 0, Math.cos(M.heading)), 0.02);
    fo.plantYaw = M.heading + fo.sign * L.gait.standToeOut;
    fo.alpha = 0; fo.stance = true;
    for (const f of [fs, fo]) f.toeBend = L.footPose(f.side, f.plantP, f.plantYaw, 0, f.ankle, f.footQ);
    L.pos.set((fs.plantP.x + fo.plantP.x) / 2, 0, (fs.plantP.z + fo.plantP.z) / 2).lerp(M.root, 0.4);
    L.idleShift = fs.sign * 0.5;
    L.pelvis.y = M.P.y; L.pelvis.lat = 0;
    this.body.idle.shiftTarget = L.idleShift;
    this.body.idle.next = 3 + Math.random() * 3;
    this.stopBlend = { stance };
    M.release();
  }
}
