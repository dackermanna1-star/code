import * as THREE from 'three';
import { Rig, SIDES, Y } from './Rig.js';
import { Locomotion, BASE_GAIT } from './Locomotion.js';
import { BodyLayer } from './BodyLayer.js';
import { V3, Q, clamp, deg } from './math.js';

const _p = V3(), _q = Q(), _qi = Q(), _pole = V3(), _hip = V3();

/** Ties locomotion + body layers together and writes the final pose. */
export class Animator {
  constructor(character) {
    this.c = character;
    this.rig = new Rig(character);
    this.loco = new Locomotion(this.rig);
    this.body = new BodyLayer(this.rig, this.loco, character);
    this.loco.teleport(V3(0, 0, 0), 0);
    this.gaitMods = {};
    this.hooks = [];
  }

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

  update(dt, input) {
    const L = this.loco, R = this.rig, c = this.c;
    dt = Math.min(dt, 1 / 20);
    L.update(dt, input);
    c.root.position.set(L.pos.x, 0, L.pos.z);
    c.root.rotation.set(0, L.heading, 0);
    c.root.updateMatrixWorld();

    R.reset();
    this.body.update(dt, input, this.gaitMods);
    // legs: world targets -> model space
    _qi.setFromAxisAngle(Y, -L.heading);
    const pelvisQ = R.Qm.pelvis;
    for (const s of SIDES) {
      const f = L.feet[s];
      const Lg = R.leg[s];
      _hip.copy(R.restLocal['thigh_' + s]).applyQuaternion(pelvisQ).add(R.pelvisPos);
      const toModel = (w, out) => out.copy(w).sub(L.pos).applyQuaternion(_qi);
      let ankleM = toModel(f.ankle, V3());
      // a planted foot never slides: if the leg can't reach, roll up onto the ball
      if (f.stance) {
        let alpha = f.alpha;
        for (let i = 0; i < 14 && ankleM.distanceTo(_hip) > Lg.len * 0.994; i++) {
          alpha += 3 * deg;
          f.toeBend = L.footPose(s, f.plantP, f.plantYaw, alpha, f.ankle, f.footQ);
          toModel(f.ankle, ankleM);
        }
        f.alphaReach = alpha;
      }
      const footQm = _q.copy(_qi).multiply(f.footQ);
      // knee points along the foot, a little outward
      const footFwd = V3(0, 0, 1).applyQuaternion(footQm); footFwd.y = 0; footFwd.normalize();
      const pelvisFwd = V3(0, 0, 1).applyQuaternion(pelvisQ); pelvisFwd.y = 0; pelvisFwd.normalize();
      _pole.copy(footFwd).multiplyScalar(0.7).addScaledVector(pelvisFwd, 0.3).add(V3(f.sign * 0.06, 0, 0)).normalize();
      R.solveLeg(s, _hip, ankleM, _pole, footQm, f.toeBend);
    }
    for (const h of this.hooks) h(dt, this);
    R.apply();
  }
}
