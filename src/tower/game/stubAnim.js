// A stand-in for the animation player (same API as src/tower/anim/animPlayer.js): the bind pose
// carried along the root with a little bob. Used until the retargeted clips are in, and by tests.
import { Vec3, Quat } from '../../physics/math.js';

const UP = new Vec3(0, 1, 0);
const _q = new Quat();
const _v = new Vec3();

export const STUB_CLIP_INFO = {
  walk: { speed: 0.9, duration: 1.2, loop: true }, walk2: { speed: 1.1, duration: 1.1, loop: true },
  jog: { speed: 2.6, duration: 0.8, loop: true }, sprint: { speed: 4.5, duration: 0.6, loop: true },
  crawl: { speed: 0.45, duration: 1.6, loop: true }, limpL: { speed: 0.6, duration: 1.4, loop: true },
  limpR: { speed: 0.6, duration: 1.4, loop: true }, idle: { speed: 0, duration: 2, loop: true },
  attack: { speed: 0, duration: 1.4, loop: true }, push: { speed: 0, duration: 1.2, loop: true },
  climb: { speed: 0.75, duration: 1.2, loop: true }, vault: { speed: 1.2, duration: 1.3, loop: false },
  getup: { speed: 0, duration: 2.2, loop: false },
};

export class StubAnimPlayer {
  constructor(ragdoll) {
    this.rd = ragdoll;
    this.name = 'idle';
    this.t = 0;
    this.rate = 1;
    this.events = [];
    this.blend = 0;
  }

  get clip() {
    return this.name;
  }

  get time() {
    return this.t;
  }

  play(name, opts = {}) {
    if (name !== this.name) this.t = opts.phase ?? 0;
    this.name = name;
    if (opts.rate !== undefined) this.rate = opts.rate;
  }

  setRate(r) {
    this.rate = r;
  }

  blendFromPhysics() {}

  /** Root of the current physical pose: the ground point under the pelvis and the trunk's heading. */
  rootFromBodies(out) {
    const p = this.rd.segments.pelvis.body;
    out.pos.set(p.pos.x, 0, p.pos.z);
    _v.set(0, 0, 1).applyQuat(this.rd.segments.chest.body.rot);
    out.yaw = Math.atan2(_v.x, _v.z);
    return out;
  }

  update(dt, root) {
    this.events.length = 0;
    this.t += dt * this.rate;
    _q.setFromAxisAngle(UP, root.yaw);
    const crawl = this.name === 'crawl';
    const bob = this.name === 'idle' ? 0 : Math.abs(Math.sin(this.t * 5)) * 0.02;
    for (const seg of this.rd.segList) {
      const b = seg.body;
      b.framePos.copy(b.pos);
      b.frameRot.copy(b.rot);
      if (crawl) {
        // lying prone, head first (a 90 degree pitch about the body's left axis)
        _v.set(seg.bindPos.x, 0.12, -seg.bindPos.y + 0.95);
        const qp = new Quat().setFromAxisAngle(new Vec3(1, 0, 0), Math.PI / 2);
        _v.applyQuat(_q).add(root.pos);
        b.pos.copy(_v);
        b.rot.multiplyQuats(_q, qp);
      } else {
        _v.copy(seg.bindPos).applyQuat(_q).add(root.pos);
        _v.y += bob;
        b.pos.copy(_v);
        b.rot.copy(_q);
      }
      if (dt > 1e-6) {
        b.vel.subVectors(b.pos, b.framePos).scale(1 / dt);
        b.angVel.setZero();
      }
    }
  }
}
