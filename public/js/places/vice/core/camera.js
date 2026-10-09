// The camera: GTA-style. On foot it orbits behind you (mouse), pulls in when
// a wall is in the way, and moves over your shoulder when you aim. In a
// vehicle it chases from behind, swings round to follow the car when you
// leave the mouse alone, and pulls back and widens with speed. Cinematic
// shots for cutscenes, and shake.
//
//   V.cam = new CameraRig(camera)
//   cam.yaw, cam.pitch      (camera convention: looks along (-sin yaw, -cos yaw))
//   cam.mode                'foot' | 'aim' | 'vehicle' | 'cinematic' (chosen each frame from the player)
//   cam.update(dt, input)
//   cam.shake(amount)       cam.kick(pitch, yaw)  (recoil)
//   cam.cinematic([{from: Vector3, to?: Vector3, look: Vector3, look2?: Vector3, secs, fov?}], onDone)
//   cam.aimRay() -> { origin, dir }   the ray through the crosshair
//   cam.heading             the camera's facing as a heading (yaw + PI)
import * as THREE from 'three';
import { V } from '../state.js';

const _p = new THREE.Vector3(), _q = new THREE.Vector3(), _d = new THREE.Vector3(), _r = new THREE.Vector3(), _t = new THREE.Vector3();
const SENS = 0.0022;

export class CameraRig {
  constructor(camera) {
    this.camera = camera;
    this.yaw = 0; this.pitch = -0.12;
    this.dist = 9; this.side = 0.8; this.lift = 4.4; this.fov = 62;
    this.mode = 'foot';
    this.pos = new THREE.Vector3(0, 30, 0);
    this.idle = 0;        // seconds since the mouse last moved
    this.shakeA = 0; this.shakeT = 0;
    this.kickP = 0; this.kickY = 0;
    this.shots = null;
    this._origin = new THREE.Vector3(); this._dir = new THREE.Vector3();
    this.smoothPivot = new THREE.Vector3();
    this.first = true;
  }

  get heading() { return this.yaw + Math.PI; }

  shake(a) { this.shakeA = Math.min(3, Math.max(this.shakeA, a)); }
  kick(p, y = 0) { this.kickP += p; this.kickY += y; }

  cinematic(shots, onDone) { this.shots = shots.map((s) => ({ ...s })); this.shotT = 0; this.shotI = 0; this.onShotsDone = onDone || null; }
  endCinematic() { const f = this.onShotsDone; this.shots = null; this.onShotsDone = null; f?.(); }

  /** The ray through the middle of the screen. */
  aimRay() {
    this.camera.getWorldDirection(this._dir);
    this._origin.copy(this.camera.position);
    return { origin: this._origin, dir: this._dir };
  }

  update(dt, inp) {
    const cam = this.camera, P = V.player;
    if (this.shots) return this._cinematic(dt);
    // mouse look
    const mx = inp?.mx || 0, my = inp?.my || 0;
    if (mx || my) this.idle = 0; else this.idle += dt;
    const sens = SENS * (V.settings?.mouse ?? 1) * (this.mode === 'aim' ? 0.6 * (this.zoom || 1) : 1);
    this.yaw -= mx * sens;
    this.pitch = Math.max(-1.25, Math.min(0.95, this.pitch - my * sens * (V.settings?.invertY ? -1 : 1)));
    // recoil settles back
    this.pitch += this.kickP; this.yaw += this.kickY;
    this.kickP = 0; this.kickY = 0;
    if (!P || !P.pos) return;
    const veh = P.vehicle;
    let pivot, dist, side, fov, colR = 0.5;
    if (veh) {
      this.mode = 'vehicle';
      const L = veh.size?.l || 14, H = veh.size?.h || 6;
      const spd = Math.abs(veh.speed || 0);
      const air = veh.kind === 'heli' || veh.kind === 'plane';
      // follow the vehicle round when the mouse is left alone (and we're moving)
      if (this.idle > 1.1 && (spd > 4 || air)) {
        const want = (veh.heading ?? 0) + Math.PI;
        let dy = want - this.yaw; dy = Math.atan2(Math.sin(dy), Math.cos(dy));
        this.yaw += dy * Math.min(1, dt * (air ? 1.6 : 2.6));
        const wantP = air ? -0.24 : -0.16;
        this.pitch += (wantP - this.pitch) * Math.min(1, dt * 1.5);
      }
      pivot = _p.set(veh.pos.x, veh.pos.y + H * 0.85 + (air ? 3 : 1.5), veh.pos.z);
      dist = L * 0.75 + 11 + Math.min(14, spd * 0.07) + (air ? 14 : 0);
      side = 0;
      fov = 62 + Math.min(16, spd * 0.09);
      colR = 1.2;
    } else {
      const aiming = !!V.weapons?.aiming;
      this.mode = aiming ? 'aim' : 'foot';
      // GTA framing: you fill about a quarter of the screen height, a little left of centre, the street ahead
      // and the horizon above your shoulders; aiming moves over the right shoulder with you in the left third
      pivot = _p.set(P.pos.x, P.pos.y + (P.swimming ? 3 : aiming ? 5.4 : 5.1), P.pos.z);
      dist = aiming ? 10.5 : P.swimming ? 13 : (P.sprinting ? 15.5 : 13.5);
      side = aiming ? 3.7 : 1.2;
      fov = aiming ? (V.weapons?.zoomFov || 48) : 62;
    }
    // ease the rig parameters
    const k = Math.min(1, dt * (this.mode === 'aim' ? 14 : 6));
    this.dist += (dist - this.dist) * k;
    this.side += (side - this.side) * k;
    this.fov += (fov - this.fov) * Math.min(1, dt * 5);
    // a little lag on the pivot in vehicles (it feels like speed), none on foot
    if (this.first) { this.smoothPivot.copy(pivot); this.first = false; }
    if (veh) this.smoothPivot.lerp(pivot, Math.min(1, dt * 14)); else this.smoothPivot.copy(pivot);
    const pv = this.smoothPivot;
    // place the camera behind the pivot
    const cp = Math.cos(this.pitch), sp = Math.sin(this.pitch);
    const fx = -Math.sin(this.yaw) * cp, fy = sp, fz = -Math.cos(this.yaw) * cp;   // look direction
    const rx = Math.cos(this.yaw), rz = -Math.sin(this.yaw);                          // right
    _q.set(pv.x + rx * this.side, pv.y, pv.z + rz * this.side);
    _d.set(-fx, -fy, -fz);
    // pull in if something's between us and the pivot
    let d = this.dist;
    const hit = V.phys?.ray(_q.x, _q.y, _q.z, _d.x, _d.y, _d.z, d + colR, { skip: (b) => b.vehicle === veh || b.vehicle === P || b.kerb || b.pole || b.prop });
    if (hit) d = Math.max(0.6, hit.d - colR);
    // never inside a palm's crown (the fronds aren't colliders): come in until we're clear of it
    if (d > 4) d = this._clearCanopy(_q, _d, d);
    _t.copy(_q).addScaledVector(_d, d);
    // keep above the ground and the water
    const g = V.ground?.heightAt(_t.x, _t.z) ?? -1e9;
    if (_t.y < g + 0.8) _t.y = g + 0.8;
    if (_t.y < 0.5 && (V.ground?.waterAt(_t.x, _t.z) ?? -Infinity) === 0) _t.y = 0.5;
    // shake
    if (this.shakeA > 0.001) {
      this.shakeT += dt * 31;
      const a = this.shakeA * 0.35;
      _t.x += Math.sin(this.shakeT * 1.3) * a; _t.y += Math.sin(this.shakeT * 1.7 + 1) * a; _t.z += Math.sin(this.shakeT * 1.1 + 2) * a;
      this.shakeA *= Math.exp(-dt * 6);
    }
    this.pos.copy(_t);
    cam.position.copy(_t);
    this._fadeNear(_t, pv);
    cam.rotation.set(this.pitch, this.yaw, 0, 'YXZ');
    if (Math.abs(cam.fov - this.fov) > 0.01) { cam.fov = this.fov; cam.updateProjectionMatrix(); }
    cam.updateMatrixWorld();
  }

  /** Pull d in until the camera is out of any palm crown near it (crowns: ~22-60 studs over the trunk's foot, r ~12). */
  _clearCanopy(o, dir, d) {
    const ph = V.phys;
    if (!ph?.query) return d;
    const x = o.x + dir.x * d, y = o.y + dir.y * d, z = o.z + dir.z * d;
    const g = V.ground?.heightAt(x, z) ?? 0;
    if (y - g < 16) return d;                 // crowns are high up: nothing to do near the ground
    const trees = this._trees || (this._trees = []);
    trees.length = 0;
    ph.query(Math.min(o.x, x) - 13, Math.min(o.z, z) - 13, Math.max(o.x, x) + 13, Math.max(o.z, z) + 13, (b) => { if (b.tree) trees.push(b); });
    if (!trees.length) return d;
    for (; d > 4; d -= 1.5) {
      const cx = o.x + dir.x * d, cy = o.y + dir.y * d, cz = o.z + dir.z * d;
      let inside = false;
      for (const b of trees) {
        const foot = b.y - b.hy, dy = cy - foot;
        if (dy < 22 || dy > 60) continue;
        if ((cx - b.x) ** 2 + (cz - b.z) ** 2 < 144) { inside = true; break; }
      }
      if (!inside) break;
    }
    return d;
  }

  /** People right in front of the lens dissolve (the crowd's fade), so a passer-by never fills the screen. */
  _fadeNear(c, pv) {
    const figs = V.peds?.crowd?.figs, faded = this._faded || (this._faded = new Set());
    for (const f of faded) {
      if (f.owner?.dead) { faded.delete(f); continue; }  // the dead are the peds' to fade
      f.fade = 1; faded.delete(f);
    }
    if (!figs || this.mode === 'cinematic') return;
    const lx = pv.x - c.x, lz = pv.z - c.z, L = Math.hypot(lx, lz) || 1;
    for (let i = 0; i < figs.length; i++) {
      const f = figs[i];
      if (f.hidden || f.owner?.dead || f.owner?.isPlayer || f.owner?.vehicle) continue;
      const dx = f.x - c.x, dz = f.z - c.z;
      if (Math.abs(dx) > 7 || Math.abs(dz) > 7) continue;
      if (f.y + 6 < c.y - 3 || f.y > c.y + 3) continue;
      // along the line to the player (between us and them) and close to it
      const along = (dx * lx + dz * lz) / L, side = Math.abs(dx * lz - dz * lx) / L;
      const dist = Math.hypot(dx, dz);
      const k = dist < 3.2 ? (dist - 1.6) / 1.6 : along > 0 && along < L - 2 && side < 2.2 ? 0.25 + side * 0.2 : 1;
      if (k < 1) { f.fade = Math.max(0.12, Math.min(f.fade ?? 1, k)); faded.add(f); }
    }
  }

  _cinematic(dt) {
    const cam = this.camera, s = this.shots[this.shotI];
    if (!s) return this.endCinematic();
    this.shotT += dt;
    const t = Math.min(1, this.shotT / (s.secs || 3));
    const e = t * t * (3 - 2 * t);
    const from = typeof s.from === 'function' ? s.from() : s.from, to = s.to ? (typeof s.to === 'function' ? s.to() : s.to) : from;
    const look = typeof s.look === 'function' ? s.look() : s.look, look2 = s.look2 ? (typeof s.look2 === 'function' ? s.look2() : s.look2) : look;
    cam.position.lerpVectors(from, to, e);
    _t.lerpVectors(look, look2, e);
    cam.lookAt(_t);
    const fov = s.fov || 55;
    if (cam.fov !== fov) { cam.fov = fov; cam.updateProjectionMatrix(); }
    cam.updateMatrixWorld();
    // keep the rig's yaw/pitch in step so the hand-back is smooth
    const dir = _d.subVectors(_t, cam.position).normalize();
    this.yaw = Math.atan2(-dir.x, -dir.z); this.pitch = Math.asin(Math.max(-1, Math.min(1, dir.y)));
    if (t >= 1) { this.shotI++; this.shotT = 0; if (this.shotI >= this.shots.length) this.endCinematic(); }
  }
}
