/**
 * Free spectator camera: 6-DOF, speed scaled by distance to the nearest
 * surface (so the same controls work from 1 m to 1 Mpc), smooth acceleration,
 * terrain collision, automatic frame anchoring (body-fixed near a surface,
 * co-moving further out) and smooth "go to" travel to any object.
 */
import { Quaternion, Vector3 } from 'three';
import type { World } from './world';
import type { Input } from './input';
import type { Body } from '../astro/body';
import { UPos } from '../core/upos';

const _v = new Vector3();
const _v2 = new Vector3();
const _q = new Quaternion();
const _q2 = new Quaternion();
const _u = new UPos();
const X = new Vector3(1, 0, 0), Yv = new Vector3(0, 1, 0), Z = new Vector3(0, 0, 1);

export interface TravelTarget {
  /** returns current universe position of the target */
  position: (out: UPos) => UPos;
  /** desired stand-off distance from the target centre */
  standoff: number;
  body?: Body | null;
  name: string;
}

export class SpectatorController {
  readonly velocity = new Vector3();
  speedMul = 1;
  horizonLock = true;
  minAltitude = 1.7;
  lastSpeed = 0;
  altitude = Infinity;
  nearestBody: Body | null = null;
  travel: {
    target: TravelTarget;
    t: number;
    duration: number;
    startOffset: Vector3;
    startQ: Quaternion;
  } | null = null;
  private angVel = new Vector3();
  /** external hook to supply a speed reference beyond star systems (interstellar distances) */
  farSpeedRef: () => number = () => 1e12;

  constructor(readonly world: World, readonly input: Input) {}

  update(dt: number) {
    const w = this.world;
    const view = w.view;
    const input = this.input;

    // nearest body & altitude (precise when anchored)
    const p = view.toUPos(_u);
    const near = w.nearest(p);
    this.nearestBody = near.body;
    this.altitude = near.body ? (view.body === near.body ? w.altitudeAbove(view, near.body) : near.altitude) : Infinity;

    if (this.travel) {
      this.updateTravel(dt);
      this.anchor();
      return;
    }

    // ---- orientation
    const look = input.look();
    const roll = input.axis('rollLeft', 'rollRight');
    const k = 1 - Math.exp(-dt * 14);
    this.angVel.x += (look.pitch / Math.max(dt, 1e-3) - this.angVel.x) * k;
    this.angVel.y += (look.yaw / Math.max(dt, 1e-3) - this.angVel.y) * k;
    this.angVel.z += (roll * 1.2 - this.angVel.z) * (1 - Math.exp(-dt * 6));
    const wq = view.worldOrientation(_q);
    _q2.setFromAxisAngle(Yv, this.angVel.y * dt);
    wq.multiply(_q2);
    _q2.setFromAxisAngle(X, this.angVel.x * dt);
    wq.multiply(_q2);
    _q2.setFromAxisAngle(Z, this.angVel.z * dt);
    wq.multiply(_q2);
    // horizon lock: near a body, keep the camera's roll level with the local horizon
    if (this.horizonLock && near.body && view.body === near.body && this.altitude < near.body.radius * 0.5 && Math.abs(roll) < 0.01) {
      const up = view.offsetWorld(_v).normalize();
      const fwd = _v2.set(0, 0, -1).applyQuaternion(wq);
      if (Math.abs(fwd.dot(up)) < 0.98) {
        const right = new Vector3().crossVectors(fwd, up).normalize();
        const camUp = new Vector3().crossVectors(right, fwd);
        const curRight = new Vector3(1, 0, 0).applyQuaternion(wq);
        const ang = Math.atan2(curRight.dot(camUp), curRight.dot(right));
        _q2.setFromAxisAngle(Z, -ang * (1 - Math.exp(-dt * 3)));
        wq.multiply(_q2);
      }
    }
    wq.normalize();
    view.setWorldOrientation(wq);

    // ---- translation
    if (input.wheel !== 0) this.speedMul = Math.min(1e6, Math.max(1e-4, this.speedMul * Math.pow(1.35, -input.wheel)));
    const ref = near.body ? Math.max(this.altitude, 0.5) : this.farSpeedRef();
    let speed = Math.min(ref, this.farSpeedRef() * 3) * 0.75 * this.speedMul;
    if (input.held('boost')) speed *= 10;
    if (input.held('slow')) speed *= 0.1;
    const dir = _v.set(input.axis('right', 'left') + input.gamepadAxes[0], input.axis('up', 'down'), -input.axis('forward', 'back') + input.gamepadAxes[1]);
    if (dir.lengthSq() > 1) dir.normalize();
    dir.applyQuaternion(wq).multiplyScalar(speed);
    const ka = 1 - Math.exp(-dt * 5);
    this.velocity.lerp(dir, ka);
    if (dir.lengthSq() === 0 && this.velocity.length() < speed * 0.001) this.velocity.set(0, 0, 0);
    // don't fly into the ground: limit descent rate by altitude
    if (near.body && view.body === near.body) {
      const up = view.offsetWorld(_v2).normalize();
      const vDown = -this.velocity.dot(up);
      const maxDown = Math.max(this.altitude - this.minAltitude, 0) * 3 + 0.5;
      if (vDown > maxDown) this.velocity.addScaledVector(up, vDown - maxDown);
    }
    this.lastSpeed = this.velocity.length();
    view.translateWorld(_v2.copy(this.velocity).multiplyScalar(dt));
    // terrain collision
    if (near.body && view.body === near.body && near.body.hasSurface) {
      const local = view.offsetBodyFixed(_v);
      const ground = w.surfaceRadius(near.body, local);
      const r = local.length();
      if (r < ground + this.minAltitude) {
        const lift = ground + this.minAltitude - r;
        view.translateWorld(view.offsetWorld(_v2).normalize().multiplyScalar(lift));
      }
    }
    this.anchor();
  }

  /** Choose the reference frame from the nearest body. */
  anchor() {
    const w = this.world;
    const view = w.view;
    const b = this.nearestBody;
    if (!b || !w.system) {
      view.rebase('universe', null);
      return;
    }
    const d = w.distanceToBody(view.toUPos(_u), b);
    const R = b.radius;
    if (b.isStarLike) {
      view.rebase(d < R * 200 ? 'inertial' : 'inertial', w.system.root);
      return;
    }
    if (d < R * 3.5) view.rebase('rotating', b);
    else if (d < Math.max(R * 50, Math.min(b.soi, R * 2000))) view.rebase('inertial', b);
    else view.rebase('inertial', w.system.root);
  }

  /** Smooth logarithmic travel toward a target (no FTL needed in spectator mode). */
  goTo(target: TravelTarget, duration?: number) {
    const view = this.world.view;
    const cur = view.toUPos(new UPos());
    const tp = target.position(new UPos());
    const off = cur.sub(tp, new Vector3());
    const dist = off.length();
    if (dist < 1e-6) off.set(0, 0, 1);
    const ratio = Math.max(1, dist / Math.max(target.standoff, 1));
    const dur = duration ?? Math.min(12, 2.5 + Math.log10(ratio) * 0.9);
    this.travel = { target, t: 0, duration: dur, startOffset: off, startQ: view.worldOrientation(new Quaternion()) };
    this.velocity.set(0, 0, 0);
  }

  cancelTravel() {
    this.travel = null;
  }

  private updateTravel(dt: number) {
    const tr = this.travel!;
    const view = this.world.view;
    tr.t += dt;
    const s = Math.min(1, tr.t / tr.duration);
    const e = s < 0.5 ? 4 * s * s * s : 1 - Math.pow(-2 * s + 2, 3) / 2; // ease in-out cubic
    const d0 = tr.startOffset.length();
    const d1 = tr.target.standoff;
    const logd = Math.log(Math.max(d0, 1e-3)) + (Math.log(Math.max(d1, 1e-3)) - Math.log(Math.max(d0, 1e-3))) * e;
    const dist = Math.exp(logd);
    // keep the approach direction, gently rotating toward the lit side is left to the caller
    const dir = _v.copy(tr.startOffset).normalize();
    const tp = tr.target.position(new UPos());
    const pos = tp.clone().add(dir, dist);
    // place in universe frame first, then re-anchor
    if (tr.target.body && tr.target.body.system) {
      view.rebase('inertial', tr.target.body);
      view.local.copy(dir).multiplyScalar(dist);
    } else {
      view.rebase('universe', null);
      view.upos.copy(pos);
    }
    // look toward target
    const look = _v2.copy(dir).negate();
    const m = new Quaternion().setFromUnitVectors(new Vector3(0, 0, -1), look);
    const sOri = Math.min(1, s * 2.5);
    const q = tr.startQ.clone().slerp(m, sOri);
    view.setWorldOrientation(q);
    if (s >= 1) this.travel = null;
  }
}
