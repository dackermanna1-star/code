// Third-person camera: mouse/stick orbit, smoothed pivot, wall avoidance (pull in fast, ease
// out slowly), ceiling clamp, lock-on and conversation framing, and light screen shake.
import { BABYLON } from './babylon.js';
import { CONFIG } from '../config.js';
import { clamp, damp, dampAngle, yawTo, angleDiff } from '../core/mathutil.js';

export class CameraRig {
  constructor(scene, world) {
    this.scene = scene; this.world = world;
    const cam = new BABYLON.UniversalCamera('playerCam', new BABYLON.Vector3(0, 3, -5), scene);
    cam.inputs.clear();
    cam.minZ = 0.08; cam.maxZ = 900; cam.fov = CONFIG.camera.fov;
    this.camera = cam;
    this.yaw = 0; this.pitch = CONFIG.camera.pitch; this.dist = CONFIG.camera.distance; this.curDist = this.dist;
    this.pivot = new BABYLON.Vector3(0, 1.5, 0);
    this.shakeAmt = 0; this.shakeT = 0;
    this.idleLook = 0;
    this.sensitivity = 1; this.invertY = false; this.autoFollow = true;
    this._tgt = new BABYLON.Vector3();
    this.first = true;
  }
  shake(amount) { this.shakeAmt = Math.min(0.35, this.shakeAmt + amount); }
  snapBehind(c) { this.yaw = c.yaw; }

  update(dt, input, player, ctx = {}) {
    const C = CONFIG.camera;
    const look = input ? input.lookVector(dt) : { x: 0, y: 0 };
    const sens = C.sensitivity * this.sensitivity;
    if (look.x || look.y) this.idleLook = 0; else this.idleLook += dt;
    this.yaw += look.x * sens;
    this.pitch = clamp(this.pitch + look.y * sens * (this.invertY ? -1 : 1), C.minPitch, C.maxPitch);
    if (input && input.wheel) this.dist = clamp(this.dist + input.wheel * 0.45, C.minDistance, C.maxDistance);
    if (input) { if (input.isDown('camUp')) this.dist = clamp(this.dist - 4 * dt, C.minDistance, C.maxDistance); if (input.isDown('camDown')) this.dist = clamp(this.dist + 4 * dt, C.minDistance, C.maxDistance); }
    // Framing modes
    let pivotX = player.x, pivotZ = player.z, pivotY = player.y + player.dims.H * 1.5;
    let wantDist = this.dist;
    if (ctx.talkPartner) {
      const p = ctx.talkPartner;
      pivotX = player.x * 0.62 + p.x * 0.38; pivotZ = player.z * 0.62 + p.z * 0.38; pivotY -= 0.05;
      const toPartner = yawTo(p.x - player.x, p.z - player.z);
      this.yaw = dampAngle(this.yaw, toPartner + 0.55, 3.5, dt);
      this.pitch = damp(this.pitch, 0.16, 3, dt);
      wantDist = Math.min(this.dist, 2.7);
    } else if (ctx.lockTarget) {
      const t = ctx.lockTarget;
      const toT = yawTo(t.x - player.x, t.z - player.z);
      this.yaw = dampAngle(this.yaw, toT, 5, dt);
      this.pitch = damp(this.pitch, 0.3, 3, dt);
      pivotX = player.x * 0.8 + t.x * 0.2; pivotZ = player.z * 0.8 + t.z * 0.2;
      wantDist = Math.max(this.dist, 4.2);
    } else if (this.autoFollow && ctx.followInput && this.idleLook > 1.6) {
      // Analog sticks only: drift in behind the runner while the stick points mostly forward.
      // Keys and sideways/backward input never turn the camera, because movement is
      // camera-relative and a swinging camera would bend the path the player is steering.
      const m = ctx.followInput;
      const diff = angleDiff(this.yaw, player.yaw);
      if (m.mag > 0.3 && m.y > 0.5 && Math.abs(diff) < 1.2) this.yaw = dampAngle(this.yaw, player.yaw, 0.6, dt);
    }
    if (player.isDown) pivotY = player.y + 0.6;
    const k = this.first ? 1 : 1 - Math.exp(-20 * dt), kv = this.first ? 1 : 1 - Math.exp(-11 * dt);
    this.pivot.x += (pivotX - this.pivot.x) * k; this.pivot.z += (pivotZ - this.pivot.z) * k; this.pivot.y += (pivotY - this.pivot.y) * kv;
    // Ceiling clamp for the pivot itself
    const ceilP = this.world.ceilingAt(this.pivot.x, this.pivot.z);
    if (ceilP != null) this.pivot.y = Math.min(this.pivot.y, ceilP - 0.35);
    // Desired camera direction (behind the pivot)
    const cp = Math.cos(this.pitch), sp = Math.sin(this.pitch);
    const dx = -Math.sin(this.yaw) * cp, dy = sp, dz = -Math.cos(this.yaw) * cp;
    // Collision: cast from the pivot toward the camera.
    let hit = this.world.colliders.raycast(this.pivot.x, this.pivot.y, this.pivot.z, dx, dy, dz, wantDist + 0.3, (b) => b.blocksCamera !== false && b.maxY > 0.6);
    let safe = Math.max(0.45, hit - 0.25);
    const target = Math.min(wantDist, safe);
    const rate = target < this.curDist ? 28 : 3.2;
    this.curDist = this.first ? target : damp(this.curDist, target, rate, dt);
    if (this.curDist > safe) this.curDist = safe;
    let cx = this.pivot.x + dx * this.curDist, cy = this.pivot.y + dy * this.curDist, cz = this.pivot.z + dz * this.curDist;
    const ceil = this.world.ceilingAt(cx, cz);
    if (ceil != null) cy = Math.min(cy, ceil - 0.22);
    cy = Math.max(cy, (player.y || 0) + 0.35);
    // Shake
    if (this.shakeAmt > 0.001) {
      this.shakeT += dt * 40;
      cx += Math.sin(this.shakeT * 1.3) * this.shakeAmt * 0.12; cy += Math.sin(this.shakeT * 1.7 + 1) * this.shakeAmt * 0.1;
      this.shakeAmt = Math.max(0, this.shakeAmt - dt * 1.6);
    }
    this.camera.position.set(cx, cy, cz);
    this._tgt.set(this.pivot.x, this.pivot.y, this.pivot.z);
    this.camera.setTarget(this._tgt);
    this.first = false;
  }
  /** Camera-relative basis on the ground plane. */
  basis() { const f = [Math.sin(this.yaw), Math.cos(this.yaw)]; return { fx: f[0], fz: f[1], rx: f[1], rz: -f[0] }; }
}
