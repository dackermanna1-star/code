/**
 * Reference frames for anything that moves through the universe.
 *
 * A FramedPosition is expressed either
 *  - in a body's rotating (body-fixed) frame – the ground stays put under you,
 *  - in a body's non-rotating frame – co-moving with the body through space,
 *  - or in the universe frame (UPos) for interstellar/intergalactic travel.
 * Re-anchoring preserves the absolute position exactly; the orientation is
 * stored relative to the frame so a camera resting on a spinning planet turns
 * with it.
 */
import { Quaternion, Vector3 } from 'three';
import { UPos } from '../core/upos';
import type { Body } from '../astro/body';

export type FrameKind = 'universe' | 'inertial' | 'rotating';

const _q = new Quaternion();
const _v = new Vector3();
const _u = new UPos();

export class FramedPosition {
  kind: FrameKind = 'universe';
  body: Body | null = null;
  /** offset from body centre: universe axes (inertial) or body axes (rotating) */
  local = new Vector3();
  /** absolute position when kind === 'universe' */
  upos = new UPos();
  /** orientation relative to the frame axes */
  orient = new Quaternion();

  /** Absolute universe position. Requires the body's system to be updated for the current time. */
  toUPos(out = new UPos()): UPos {
    if (this.kind === 'universe' || !this.body) return out.copy(this.upos);
    const b = this.body;
    b.system.bodyUPos(b, out);
    if (this.kind === 'inertial') return out.add(this.local);
    b.system.bodyRotation(b, _q);
    return out.add(_v.copy(this.local).applyQuaternion(_q));
  }

  /** Frame-axes → universe-axes rotation. */
  frameRotation(out = new Quaternion()): Quaternion {
    if (this.kind === 'rotating' && this.body) return this.body.system.bodyRotation(this.body, out);
    return out.identity();
  }

  worldOrientation(out = new Quaternion()): Quaternion {
    return this.frameRotation(out).multiply(this.orient);
  }

  setWorldOrientation(q: Quaternion) {
    this.frameRotation(_q).invert();
    this.orient.copy(_q).multiply(q);
  }

  /** Offset from body centre in universe axes. */
  offsetWorld(out = new Vector3()): Vector3 {
    if (!this.body) return out.set(0, 0, 0);
    if (this.kind === 'inertial') return out.copy(this.local);
    if (this.kind === 'rotating') return out.copy(this.local).applyQuaternion(this.body.system.bodyRotation(this.body, _q));
    this.body.system.bodyUPos(this.body, _u);
    return this.upos.sub(_u, out);
  }

  /** Offset in the body-fixed frame. */
  offsetBodyFixed(out = new Vector3()): Vector3 {
    if (!this.body) return out.set(0, 0, 0);
    if (this.kind === 'rotating') return out.copy(this.local);
    this.offsetWorld(out);
    return out.applyQuaternion(this.body.system.bodyRotation(this.body, _q).invert());
  }

  /** Re-express in another frame without moving. */
  rebase(kind: FrameKind, body: Body | null) {
    if (kind === this.kind && body === this.body) return;
    const worldQ = this.worldOrientation(new Quaternion());
    const abs = this.toUPos(new UPos());
    // same body: convert directly for full precision
    if (body && body === this.body) {
      const off = this.offsetWorld(new Vector3());
      this.kind = kind;
      if (kind === 'inertial') this.local.copy(off);
      else if (kind === 'rotating') this.local.copy(off.applyQuaternion(body.system.bodyRotation(body, _q).invert()));
      else this.upos.copy(abs);
    } else {
      this.kind = kind;
      this.body = body;
      if (kind === 'universe' || !body) {
        this.kind = 'universe';
        this.body = null;
        this.upos.copy(abs);
      } else {
        body.system.bodyUPos(body, _u);
        abs.sub(_u, this.local);
        if (kind === 'rotating') this.local.applyQuaternion(body.system.bodyRotation(body, _q).invert());
      }
    }
    this.setWorldOrientation(worldQ);
  }

  /** Move by a universe-axes displacement (m). */
  translateWorld(d: Vector3) {
    if (this.kind === 'universe' || !this.body) this.upos.add(d);
    else if (this.kind === 'inertial') this.local.add(d);
    else this.local.add(_v.copy(d).applyQuaternion(this.body.system.bodyRotation(this.body, _q).invert()));
  }

  copy(o: FramedPosition): this {
    this.kind = o.kind;
    this.body = o.body;
    this.local.copy(o.local);
    this.upos.copy(o.upos);
    this.orient.copy(o.orient);
    return this;
  }
}
