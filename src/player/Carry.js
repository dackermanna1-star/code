// Picking litter up off the ground and throwing it. Q (pad X) crouches and
// takes the can, bottle or cup you are looking at (the spray can goes away
// first); hold the mouse button (Space, RT) to wind up and let go to throw;
// Q again crouches and sets it down. The held thing is the same rigid body
// that lay on the ground: it leaves the world into the hand and goes back
// with the hand's pose and the throw's velocity and spin.
import * as THREE from 'three';
import { heldTwin } from '../spray/heldItems.js';

const GRAB_AT = 0.3; // s into the crouch when the hand closes on it
const RISE_AT = 0.36;
const PICK_END = 0.72;
const RELEASE_AT = 0.07; // s into the throw when it leaves the hand
const THROW_END = 0.42;
const CHARGE_T = 0.7; // s to a full wind-up

export class Carry {
  constructor(engine) {
    this.engine = engine;
    this.state = 'idle';
    this.t = 0;
    this.body = null;
    this.target = null;
    this.charge = 0;
    this.throwK = 0;
    this.vmEquipped = false;
    this.item = null; // what the viewmodel hand shows: 'held' | 'none' | null (the spray can)
    this.trigPrev = false;
    this.padX = false;
    this._d = new THREE.Vector3();
    this._p = new THREE.Vector3();
    this._q = new THREE.Quaternion();
    this._s = new THREE.Vector3();
    this._v = new THREE.Vector3();
    this._w = new THREE.Vector3();
    this._r = new THREE.Vector3();
    addEventListener('keydown', (e) => {
      if (e.code !== 'KeyQ' || e.repeat || !this.usable()) return;
      this.interact();
    });
  }

  get busy() {
    return this.state !== 'idle';
  }

  get vm() {
    return this.engine.spray?.vm ?? null;
  }

  usable() {
    const e = this.engine;
    return !!e.player?.enabled && !e.spray?.paused && !e.spray?.menuOpen && !!e.litter;
  }

  interact() {
    if (this.state === 'idle') this.tryPick();
    else if (this.state === 'hold') this.startPlace();
  }

  tryPick() {
    const e = this.engine;
    const cam = e.camera;
    const dir = cam.getWorldDirection(this._d);
    const b = e.litter.pickTarget(cam.position, dir, 2.5, e.player.pos);
    if (!b) return false;
    if (e.spray?.equipped) e.spray.toggle(false);
    this.target = b;
    this.state = 'pick';
    this.t = 0;
    // squat lower for things right at her feet
    e.player.crouchTarget = 1;
    return true;
  }

  /** Crouch and put it down in front of her feet. */
  startPlace() {
    this.state = 'place';
    this.t = 0;
    this.engine.player.crouchTarget = 0.85;
  }

  /** Let go without ceremony (the can comes out, the menu opens...). */
  drop() {
    if (!this.body) return;
    const e = this.engine;
    const cam = e.camera;
    const fwd = cam.getWorldDirection(this._d);
    fwd.y = 0;
    fwd.normalize();
    this.handPose(this._p, this._q);
    this._v.copy(e.player.vel).addScaledVector(fwd, 0.5);
    this._v.y -= 0.2;
    this._w.set(Math.random() - 0.5, Math.random() - 0.5, Math.random() - 0.5).multiplyScalar(4);
    e.litter.release(this.body, this._p, this._q, this._v, this._w);
    this.finish();
  }

  /** Stop whatever the hand is doing with litter (the spray can wants it). */
  cancel() {
    if (this.body) this.drop();
    else if (this.state !== 'idle') {
      this.finish();
      this.item = null;
    }
  }

  finish() {
    this.engine.spray?.touch?.setCarrying?.(false);
    this.body = null;
    this.target = null;
    this.state = 'idle';
    this.charge = 0;
    this.throwK = 0;
    this.vmEquipped = false;
    this.item = 'none';
    this.engine.player.crouchTarget = 0;
  }

  /** World pose of the thing in the hand (its centre of mass), kept out of walls. */
  handPose(pos, quat) {
    const e = this.engine;
    const cam = e.camera;
    const held = this.vm?.held;
    if (held && held.parent) {
      held.updateWorldMatrix(true, false);
      held.matrixWorld.decompose(pos, quat, this._s);
    } else {
      pos.set(0.12, -0.1, -0.4).applyMatrix4(cam.matrixWorld);
      quat.copy(cam.quaternion);
    }
    // the hand reaches past the eye: never let it start inside a wall or a prop
    const ray = e.spray?.ray;
    if (ray) {
      const d = this._r.subVectors(pos, cam.position);
      const len = d.length();
      if (len > 1e-4) {
        d.divideScalar(len);
        const hit = ray.cast(cam.position, d, len + 0.12);
        if (hit) pos.copy(cam.position).addScaledVector(d, Math.max(0.05, hit.dist - 0.13));
      }
    }
    return pos;
  }

  pollPad() {
    const pads = navigator.getGamepads ? navigator.getGamepads() : [];
    let x = false;
    for (const p of pads) if (p?.buttons[2]?.pressed) x = true;
    if (x && !this.padX && this.usable()) this.interact();
    this.padX = x;
  }

  update(dt) {
    const e = this.engine;
    const sp = e.spray;
    const pl = e.player;
    if (!pl || !e.litter) return;
    this.pollPad();
    const trig = !!sp && !sp.menuOpen && !sp.paused && (sp.btn.mouse || sp.btn.space || sp.btn.touch || sp.btn.pad > 0.3);
    this.t += dt;
    switch (this.state) {
      case 'pick': {
        if (!this.body && this.t >= GRAB_AT) {
          const b = this.target;
          if (!b || !b.pool) {
            // it rolled away or broke meanwhile
            this.finish();
            this.item = null;
            break;
          }
          e.litter.take(b);
          this.body = b;
          this.vm?.setHeld(heldTwin(b.shape) ?? b.shape.geo, b.shape.grip, Math.random() * Math.PI * 2);
          this.item = 'held';
          this.vmEquipped = true;
          e.audio?.oneShot?.(b.k.snd, { position: { x: b.p.x, y: b.p.y, z: b.p.z }, strength: 0.12 });
        }
        if (this.t >= RISE_AT) pl.crouchTarget = 0;
        if (this.t >= PICK_END) {
          this.state = 'hold';
          e.spray?.touch?.setCarrying?.(true);
        }
        break;
      }
      case 'hold':
        if (trig && !this.trigPrev) {
          this.state = 'charge';
          this.t = 0;
        }
        break;
      case 'charge':
        this.charge = Math.min(1, this.t / CHARGE_T);
        if (!trig) {
          this.state = 'throw';
          this.power = 0.2 + 0.8 * this.charge;
          this.t = 0;
          e.audio?.oneShot?.('throwWhoosh', { position: e.camera.position, strength: 0.3 + 0.7 * this.power });
        }
        break;
      case 'throw':
        this.throwK = Math.min(1, this.t / THROW_END);
        this.charge = Math.max(0, this.charge - dt * 8);
        if (this.body && this.t >= RELEASE_AT) this.release();
        if (this.t >= THROW_END) {
          this.state = 'idle';
          this.throwK = 0;
          this.charge = 0;
        }
        break;
      case 'place':
        if (this.body && this.t >= 0.3) {
          const fwd = e.camera.getWorldDirection(this._d);
          fwd.y = 0;
          fwd.normalize();
          this.handPose(this._p, this._q);
          // down by her feet, a little ahead
          const gy = e.world.groundHeight(this._p.x, this._p.z);
          this._p.y = Math.max(gy + this.body.shape.brad + 0.02, Math.min(this._p.y, gy + 0.3));
          this._v.copy(fwd).multiplyScalar(0.25);
          this._v.y = -0.3;
          this._w.set(0, 0, 0);
          e.litter.release(this.body, this._p, this._q, this._v, this._w);
          this.body = null;
          this.vmEquipped = false;
          this.item = 'none';
        }
        if (this.t >= 0.36) pl.crouchTarget = 0;
        if (this.t >= 0.7) this.finish();
        break;
      default:
        // idle: once the empty hand has dropped out of view the spray can is back in it
        if (this.item === 'none' && !(this.vm?.visible ?? false)) this.item = null;
    }
    this.trigPrev = trig;
  }

  release() {
    const e = this.engine;
    const cam = e.camera;
    const b = this.body;
    this.handPose(this._p, this._q);
    const pw = this.power ?? 0.6;
    const fwd = cam.getWorldDirection(this._d);
    const speed = 3 + 11.5 * pw;
    this._v.copy(fwd).multiplyScalar(speed);
    this._v.y += 0.6 + 1.4 * pw;
    this._v.x += e.player.vel.x;
    this._v.z += e.player.vel.z;
    // tumbling end over end, top first, about the camera's right axis
    const right = this._r.set(1, 0, 0).transformDirection(cam.matrixWorld);
    this._w.copy(right).multiplyScalar(-(5 + 13 * pw) * (0.8 + 0.4 * Math.random()));
    this._w.x += (Math.random() - 0.5) * 3;
    this._w.y += (Math.random() - 0.5) * 3;
    this._w.z += (Math.random() - 0.5) * 3;
    e.litter.release(b, this._p, this._q, this._v, this._w);
    this.body = null;
    this.vmEquipped = false;
    this.item = 'none';
    e.spray?.touch?.setCarrying?.(false);
  }
}
