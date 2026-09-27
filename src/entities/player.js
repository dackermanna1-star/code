// Local human controller: turns input into survivor commands, handles mouse
// look, and drives the first-person camera (bob, punch, shake, crouch, landing,
// incapacitated / pinned / zoom views).
import * as THREE from 'three';
import { clamp, damp, lerp } from '../core/math.js';

export class PlayerController {
  constructor(game, survivor) {
    this.game = game;
    this.s = survivor;
    this.look = { dx: 0, dy: 0 };
    this.bobT = 0;
    this.shake = 0;
    this.roll = 0;
    this.fov = 75;
    this.deathCam = 0;
    this.spectate = null;
  }
  buildCmd(dt) {
    const g = this.game;
    const inp = g.input;
    const s = this.s;
    const c = s.cmd;
    const active = inp.locked && !g.paused && !g.uiBlocking;
    const m = active ? inp.consumeMouse() : (inp.consumeMouse(), { dx: 0, dy: 0 });
    // zoom sensitivity
    const w = s.weapon;
    const zk = w && w.zoomed ? (w.def.zoom / this.fov) : 1;
    this.look.dx = m.dx * zk;
    this.look.dy = m.dy * zk;
    if (!s.dead) {
      s.yaw -= m.dx * zk;
      s.pitch = clamp(s.pitch - m.dy * zk, -1.5, 1.5);
      // counter recoil by moving mouse down: reduce aimPitchOff first
      if (m.dy > 0 && s.aimPitchOff > 0) {
        const take = Math.min(s.aimPitchOff, m.dy * zk * 0.5);
        s.aimPitchOff -= take;
        s.pitch += take;
      }
    }
    if (g.testCmd) {
      Object.assign(c, { mx: 0, my: 0, jump: false, fire: false, firePressed: false, shove: false, shoveHeld: false, reload: false, use: false, usePressed: false, zoom: false, slot: -1, lastWeapon: false, flashlight: false, sprint: false, crouch: false }, g.testCmd);
      if (g.testCmd.once) { g.testCmd = null; }
      return;
    }
    if (!active) {
      Object.assign(c, { mx: 0, my: 0, jump: false, fire: false, firePressed: false, shove: false, shoveHeld: false, reload: false, use: false, usePressed: false, zoom: false, slot: -1, lastWeapon: false, flashlight: false, sprint: false, crouch: c.crouch && false });
      return;
    }
    const mv = inp.moveAxis();
    c.mx = mv.x; c.my = mv.y;
    c.jump = inp.actionPressed('jump');
    c.crouch = inp.action('crouch');
    c.sprint = inp.action('sprint');
    c.fire = inp.action('fire');
    c.firePressed = inp.actionPressed('fire');
    c.shove = inp.actionPressed('shove');
    c.shoveHeld = inp.action('shove');
    c.reload = inp.actionPressed('reload');
    c.use = inp.action('use');
    c.usePressed = inp.actionPressed('use');
    c.zoom = inp.actionPressed('zoom');
    c.flashlight = inp.actionPressed('flashlight');
    c.lastWeapon = inp.actionPressed('lastWeapon');
    c.drop = inp.actionPressed('drop');
    c.slot = -1;
    for (let i = 0; i < 5; i++) if (inp.actionPressed('slot' + (i + 1))) c.slot = i;
    if (inp.wheel !== 0) {
      // cycle through available slots
      let sl = s.slot;
      for (let k = 0; k < 5; k++) {
        sl = (sl + (inp.wheel > 0 ? 1 : -1) + 5) % 5;
        if (s.hasSlot(sl)) break;
      }
      c.slot = sl;
    }
  }

  updateCamera(dt) {
    const g = this.game;
    const s = this.s;
    const cam = g.renderer.camera;
    let target = s;
    if (s.dead) {
      // spectate a living teammate
      this.deathCam += dt;
      const alive = g.survivors.filter((o) => !o.dead && o !== s);
      if (alive.length) {
        if (!this.spectate || this.spectate.dead || g.input.actionPressed('fire')) {
          const i = alive.indexOf(this.spectate);
          this.spectate = alive[(i + 1) % alive.length];
        }
        target = this.spectate;
        // third person chase cam
        const ex = target.pos.x + Math.sin(target.yaw) * 2.6, ez = target.pos.z + Math.cos(target.yaw) * 2.6;
        const ey = target.pos.y + 2.1;
        cam.position.set(ex, ey, ez);
        const col = g.level.col;
        const dir = new THREE.Vector3(ex - target.pos.x, ey - (target.pos.y + 1.6), ez - target.pos.z);
        const len = dir.length(); dir.normalize();
        const h = col.raycast(target.pos.x, target.pos.y + 1.6, target.pos.z, dir.x, dir.y, dir.z, len);
        if (h) cam.position.set(h.x - dir.x * 0.2, h.y - dir.y * 0.2, h.z - dir.z * 0.2);
        cam.lookAt(target.pos.x, target.pos.y + 1.4, target.pos.z);
        g.camPos.copy(cam.position);
        return;
      }
    }
    const P = s.phys;
    const sp = Math.hypot(P.vx, P.vz);
    if (P.onGround) this.bobT += dt * sp * 1.9;
    const bobK = P.onGround ? clamp(sp / 4.4, 0, 1.5) : 0;
    let eye = s.eyeHeight;
    eye += -Math.abs(Math.sin(this.bobT)) * 0.035 * bobK;
    const bobX = Math.cos(this.bobT) * 0.02 * bobK;
    this.shake = Math.max(0, this.shake - dt * 1.4);
    const sh = this.shake * this.shake;
    const t = g.time;
    const shakeP = (Math.sin(t * 37) + Math.sin(t * 53)) * 0.02 * sh;
    const shakeY = (Math.sin(t * 41 + 1) + Math.sin(t * 29)) * 0.02 * sh;
    // strafe roll
    const rx = Math.cos(s.yaw), rz = -Math.sin(s.yaw);
    const side = (P.vx * rx + P.vz * rz) / 6;
    this.roll = damp(this.roll, -side * 0.035 + (s.incapped ? 0.25 : 0), 6, dt);
    let pitch = s.pitch + s.aimPitchOff + s.punchP + shakeP;
    let yaw = s.yaw + s.aimYawOff + s.punchY + shakeY;
    if (s.pinned) {
      // pinned: shaky, forced view
      pitch += Math.sin(t * 20) * 0.03;
      yaw += Math.sin(t * 17) * 0.03;
      if (s.pinType === 'hunter') { pitch = lerp(pitch, 0.9, 0.5); eye = 0.4; }
      if (s.pinType === 'smoker') eye = Math.min(eye, 1.2);
    }
    const lx = s.pos.x + rx * bobX, lz = s.pos.z + rz * bobX;
    cam.position.set(lx, s.pos.y + eye, lz);
    cam.rotation.set(pitch, yaw, this.roll, 'YXZ');
    // fov
    const w = s.weapon;
    const baseFov = g.settings.fov;
    let fovT = baseFov + (s.sprinting ? 5 : 0);
    if (w && w.zoomed && w.def.zoom) fovT = w.def.zoom;
    this.fov = damp(this.fov, fovT, w && w.zoomed ? 25 : 10, dt);
    if (Math.abs(cam.fov - this.fov) > 0.01) { cam.fov = this.fov; cam.updateProjectionMatrix(); }
    g.camPos.copy(cam.position);
  }
  addShake(v) { this.shake = Math.min(1.2, this.shake + v); }
}
