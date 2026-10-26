// First-person player controller: movement, collisions, crouch/jump, head bob,
// footsteps, and "occupied" states (sitting, lying down, showering, peephole...).
import * as THREE from 'three';
import { G } from '../game.js';
import { clamp, damp, lerp, angleDamp } from '../core/utils.js';
import { roomAt } from '../world/apartment.js';
import { tween, Ease, wait } from '../core/tween.js';

const RADIUS = 0.28;
const EYE = 1.64;
const CROUCH_EYE = 1.05;

export class Player {
  constructor(camera) {
    this.camera = camera;
    this.pos = new THREE.Vector3(-0.6, 0, 3.6); // just inside the front door
    this.vel = new THREE.Vector3();
    this.yaw = Math.PI; // facing north (-z) toward the living room windows
    this.pitch = -0.05;
    this.eye = EYE;
    this.vy = 0;
    this.y = 0;
    this.grounded = true;
    this.bob = 0;
    this.stepDist = 0;
    this.mode = 'walk'; // walk | occupied
    this.occ = null;
    this.camPos = new THREE.Vector3();
    this.fovKick = 0;
    this.speedMult = 1;
    this.lookYawLimit = null;
    this.room = 'entry';
    camera.rotation.order = 'YXZ';
  }

  get forward() { return new THREE.Vector3(-Math.sin(this.yaw), 0, -Math.cos(this.yaw)); }

  update(dt) {
    const input = G.input;
    const canLook = input.locked && !G.ui.blocking && !G.hand.inspecting;
    if (canLook) {
      const s = 0.0022 * (G.state.settings.sensitivity || 1);
      this.yaw -= input.dx * s;
      this.pitch -= input.dy * s * (G.state.settings.invertY ? -1 : 1);
      this.pitch = clamp(this.pitch, -1.45, 1.45);
      if (this.occ?.yawLimit != null) {
        let d = ((this.yaw - this.occ.yaw + Math.PI) % (Math.PI * 2) + Math.PI * 2) % (Math.PI * 2) - Math.PI;
        d = clamp(d, -this.occ.yawLimit, this.occ.yawLimit);
        this.yaw = this.occ.yaw + d;
      }
    }
    if (this.mode === 'walk') this._walk(dt, canLook || input.locked);
    else this._occupied(dt);
    // camera
    const bobY = Math.sin(this.bob * 2) * 0.025 * this._bobAmt;
    const bobX = Math.cos(this.bob) * 0.018 * this._bobAmt;
    this.camera.position.set(this.camPos.x + Math.cos(this.yaw) * bobX, this.camPos.y + bobY, this.camPos.z - Math.sin(this.yaw) * bobX);
    this.camera.rotation.set(this.pitch, this.yaw, Math.sin(this.bob) * 0.004 * this._bobAmt);
    const baseFov = G.state.settings.fov || 72;
    this.fovKick = damp(this.fovKick, this._running ? 5 : 0, 6, dt);
    const fov = (this.occ?.fov || baseFov) + this.fovKick;
    if (Math.abs(this.camera.fov - fov) > 0.01) { this.camera.fov = damp(this.camera.fov, fov, 8, dt); this.camera.updateProjectionMatrix(); }
    // room tracking
    const r = roomAt(this.pos.x, this.pos.z);
    if (r !== this.room) {
      this.room = r; G.events.emit('roomChanged', r);
      if (r === 'corridor' && !G.state.flags.visitedHall) { G.state.flags.visitedHall = true; G.ui.toast('The hallway. Fresh(ish) air.', { icon: '🚪' }); }
      G.audio.setRoomReverb(r === 'bath' ? 0.35 : r === 'closet' ? 0.06 : r === 'corridor' ? 0.25 : 0.12);
    }
  }

  _walk(dt, active) {
    const input = G.input;
    const ui = G.ui.blocking;
    let mx = 0, mz = 0;
    if (active && !ui) {
      if (input.isDown('KeyW') || input.isDown('ArrowUp')) mz += 1;
      if (input.isDown('KeyS') || input.isDown('ArrowDown')) mz -= 1;
      if (input.isDown('KeyA') || input.isDown('ArrowLeft')) mx -= 1;
      if (input.isDown('KeyD') || input.isDown('ArrowRight')) mx += 1;
    }
    const crouch = active && !ui && (input.isDown('KeyC') || input.isDown('ControlLeft'));
    this._running = active && !ui && input.isDown('ShiftLeft') && mz > 0 && !crouch;
    let speed = (crouch ? 1.3 : this._running ? 4.6 : 2.8) * this.speedMult * (G.needs?.speedMult?.() ?? 1);
    const f = this.forward;
    const r = new THREE.Vector3(-f.z, 0, f.x);
    const wish = new THREE.Vector3().addScaledVector(f, mz).addScaledVector(r, mx);
    if (wish.lengthSq() > 0) wish.normalize().multiplyScalar(speed);
    const accel = this.grounded ? 12 : 3;
    this.vel.x = damp(this.vel.x, wish.x, accel, dt);
    this.vel.z = damp(this.vel.z, wish.z, accel, dt);
    // jump & gravity
    if (active && !ui && input.wasPressed('Space') && this.grounded) { this.vy = 3.6; this.grounded = false; }
    if (!this.grounded) {
      this.vy -= 11 * dt;
      this.y += this.vy * dt;
      if (this.y <= 0) { this.y = 0; this.vy = 0; this.grounded = true; this._footstep(0.8); }
    }
    // integrate with collision (sub-steps)
    const steps = 3;
    for (let i = 0; i < steps; i++) {
      this.pos.x += this.vel.x * dt / steps;
      this.pos.z += this.vel.z * dt / steps;
      this._collide();
    }
    const horiz = Math.hypot(this.vel.x, this.vel.z);
    this._bobAmt = damp(this._bobAmt || 0, this.grounded && horiz > 0.3 ? Math.min(1, horiz / 3) : 0, 8, dt);
    this.bob += horiz * dt * 3.6;
    if (this.grounded) {
      this.stepDist += horiz * dt;
      const stride = this._running ? 0.85 : 0.62;
      if (this.stepDist > stride) { this.stepDist = 0; this._footstep(crouch ? 0.4 : this._running ? 1 : 0.7); }
    }
    this.eye = damp(this.eye, crouch ? CROUCH_EYE : EYE, 10, dt);
    this.camPos.set(this.pos.x, this.y + this.eye, this.pos.z);
  }

  _collide() {
    const p = this.pos;
    for (const c of this._allColliders()) {
      if (!c.enabled) continue;
      const cx = clamp(p.x, c.minX, c.maxX), cz = clamp(p.z, c.minZ, c.maxZ);
      const dx = p.x - cx, dz = p.z - cz;
      const d2 = dx * dx + dz * dz;
      if (d2 < RADIUS * RADIUS) {
        if (d2 > 1e-8) {
          const d = Math.sqrt(d2);
          p.x = cx + (dx / d) * RADIUS; p.z = cz + (dz / d) * RADIUS;
        } else {
          // inside the box: push out along the smallest axis
          const pens = [[p.x - c.minX + RADIUS, -1, 0], [c.maxX - p.x + RADIUS, 1, 0], [p.z - c.minZ + RADIUS, 0, -1], [c.maxZ - p.z + RADIUS, 0, 1]];
          pens.sort((a, b) => a[0] - b[0]);
          p.x += pens[0][1] * pens[0][0]; p.z += pens[0][2] * pens[0][0];
        }
      }
    }
    // hard bounds: the apartment, or the hallway once you're through the front door
    if (p.z > 4.75) {
      p.x = clamp(p.x, -4.2 + RADIUS, 3.2 - RADIUS);
      p.z = Math.min(p.z, 7.5 - RADIUS);
    } else {
      p.x = clamp(p.x, -6.85 + 0.1, 6.85 - 0.1);
      p.z = Math.max(p.z, -4.85 + 0.1);
    }
  }

  _allColliders() {
    return G.items ? G.apartment.colliders.concat(G.items.colliders) : G.apartment.colliders;
  }

  _footstep(vol) {
    const surface = this._surfaceUnder();
    G.audio.play('step', { surface, volume: vol * 0.55, pos: new THREE.Vector3(this.pos.x, 0.1, this.pos.z) });
  }
  _surfaceUnder() {
    // rugs placed by the player change the footstep sound
    if (G.items) for (const it of G.items.rugs) {
      const b = it.footprint;
      if (b && this.pos.x > b.minX && this.pos.x < b.maxX && this.pos.z > b.minZ && this.pos.z < b.maxZ) return 'rug';
    }
    const room = this.room;
    return G.apartment.floorMeshes[room]?.userData.step || 'wood';
  }

  // ------------------------------------------------------------- occupy
  // Smoothly takes the camera to a pose (seat, bath, peephole...). Returns release().
  occupy({ pos, yaw, pitch = 0, eye = 1.1, yawLimit = null, fov = null, label = '', onRelease = null, exitPos = null }) {
    if (this.occ) this._releaseNow();
    const from = { pos: this.camPos.clone(), yaw: this.yaw, pitch: this.pitch };
    const occ = (this.occ = { pos: pos.clone(), yaw, eye, yawLimit, fov, label, onRelease, exitPos: exitPos || this.pos.clone(), t: 0, from, target: new THREE.Vector3(pos.x, pos.y + eye, pos.z) });
    this.mode = 'occupied';
    this.vel.set(0, 0, 0);
    tween({
      duration: 0.7, ease: Ease.inOutCubic,
      update: (t, e) => {
        if (this.occ !== occ) return;
        this.camPos.lerpVectors(from.pos, occ.target, e);
        this.yaw = from.yaw + shortAngle(from.yaw, yaw) * e;
        this.pitch = lerp(from.pitch, pitch, e);
      },
    });
    G.events.emit('occupy', label);
    return () => { if (this.occ === occ) this._releaseNow(); };
  }

  _releaseNow() {
    const occ = this.occ;
    if (!occ) return;
    this.occ = null;
    const from = this.camPos.clone();
    const ex = occ.exitPos;
    this.pos.copy(ex);
    this.mode = 'walk';
    this._collide();
    const target = new THREE.Vector3(this.pos.x, EYE, this.pos.z);
    this.mode = 'returning';
    tween({ duration: 0.5, ease: Ease.inOutCubic, update: (t, e) => { this.camPos.lerpVectors(from, target, e); }, done: () => { if (this.mode === 'returning') this.mode = 'walk'; } });
    occ.onRelease?.();
    G.events.emit('occupy', null);
  }

  release() { this._releaseNow(); }

  _occupied(dt) {
    if (this.mode === 'returning') return;
    if (!this.occ) return;
    this.occ.t += dt;
    this._bobAmt = 0;
    // stand up from seats with movement keys or E/Space
    if (this.occ.seat && this.occ.t > 0.4 && G.input.locked && !G.ui.blocking) {
      const i = G.input;
      if (['KeyW', 'KeyA', 'KeyS', 'KeyD', 'Space'].some((k) => i.wasPressed(k))) this._releaseNow();
    }
    if (this.occ?.seat) {
      this.occ.comfortT = (this.occ.comfortT || 0) + dt;
      if (this.occ.comfortT > 1) { this.occ.comfortT = 0; G.needs.add({ comfort: this.occ.comfortRate || 0.4, energy: this.occ.lying ? 0.15 : 0 }, { silent: true }); }
    }
  }

  get isSitting() { return !!this.occ?.seat; }

  sit({ pos, yaw, seatHeight = 0.45, name = 'seat', comfort = 0.5, lying = false, exitPos = null, onStand = null }) {
    const p = pos.clone(); p.y = seatHeight;
    const release = this.occupy({ pos: p, yaw, pitch: lying ? 0.9 : -0.05, eye: lying ? 0.25 : 0.72, yawLimit: lying ? 1.2 : 1.9, label: name, exitPos: exitPos || this._exitNear(pos), onRelease: onStand });
    this.occ.seat = name; this.occ.comfortRate = comfort; this.occ.lying = lying;
    G.audio.play('thud', { soft: true, pos, impact: 0.4 });
    G.events.emit('act', lying ? 'lieDown' : 'sit', { name });
    G.ui.hint('Move or press Space to get up', 3);
    return release;
  }

  _exitNear(pos) {
    // step back to where the player was standing before sitting (if still valid)
    const p = this.pos.clone();
    if (p.distanceTo(pos) > 2.2) p.copy(pos).add(new THREE.Vector3(0.6, 0, 0.6));
    return p;
  }

  async sleep({ pos, yaw, hours = null, bed = null }) {
    // lie down, fade out, fast-forward time, wake up refreshed
    const release = this.occupy({ pos: pos.clone().setY(0.55), yaw, pitch: 0.95, eye: 0.2, label: 'Sleeping', exitPos: this._exitNear(pos) });
    await wait(0.8);
    await G.ui.fadeOut(1.2);
    G.ui.sleepOverlay(true);
    const startEnergy = G.needs.v.energy;
    const target = hours != null ? G.clock.total + hours * 60 : nextMorning(G.clock.total);
    const mins = target - G.clock.total;
    // fast-forward in a few steps so systems (orders, weather, needs) catch up
    const steps = 12;
    for (let i = 0; i < steps; i++) {
      G.clock.speedMult = 1;
      G.state.time += mins / steps;
      G.needs.sleepTick(mins / steps, bed?.def?.use?.quality ?? 1);
      G.events.emit('timeSkip', mins / steps);
      await wait(0.12);
    }
    G.state.stats.slept++;
    G.ui.sleepOverlay(false);
    release();
    await G.ui.fadeIn(1.4);
    const gained = Math.round(G.needs.v.energy - startEnergy);
    G.events.emit('act', 'sleep', { hours: mins / 60 });
    G.needs.addBuff(mins >= 360 ? 'wellRested' : 'napped', mins >= 360 ? 480 : 120);
    G.ui.toast(`${G.clock.partOfDay() === 'morning' ? 'Good morning!' : 'You wake up.'} Slept ${G.clock.fmtDuration(mins)} · Energy +${gained}`, { icon: '😴', kind: 'good', duration: 4 });
    G.audio.play('chime');
  }

  peephole() {
    const door = G.apartment.doors.front;
    const p = door.pivot.position;
    const release = this.occupy({ pos: new THREE.Vector3(p.x - 0.5, 0, 5.2), yaw: Math.PI, pitch: -0.15, eye: 1.55, fov: 125, label: 'Peephole', yawLimit: 0.4, exitPos: new THREE.Vector3(p.x - 0.5, 0, 4.55) });
    G.ui.peephole(true);
    const stop = () => { G.ui.peephole(false); release(); window.removeEventListener('keydown', onKey); window.removeEventListener('mousedown', onKey); };
    const onKey = () => stop();
    setTimeout(() => { window.addEventListener('keydown', onKey); window.addEventListener('mousedown', onKey); }, 500);
  }

  admireMirror(mirror) {
    const wp = new THREE.Vector3(); mirror.group.getWorldPosition(wp);
    const n = new THREE.Vector3(0, 0, 1).applyQuaternion(mirror.group.getWorldQuaternion(new THREE.Quaternion()));
    const stand = wp.clone().addScaledVector(n, 1.25); stand.y = 0;
    const yaw = Math.atan2(n.x, n.z);
    const release = this.occupy({ pos: stand, yaw, pitch: -0.08, eye: 1.6, label: 'Mirror', yawLimit: 0.5, exitPos: stand.clone() });
    G.outfit.showStyleCard();
    G.events.emit('act', 'mirror');
    const onKey = (e) => { if (['KeyW', 'KeyA', 'KeyS', 'KeyD', 'Escape', 'KeyE', 'Space'].includes(e.code)) { release(); G.ui.hideStyleCard(); window.removeEventListener('keydown', onKey); } };
    setTimeout(() => window.addEventListener('keydown', onKey), 400);
    G.ui.hint('Strike a pose! Move to step away', 3);
  }

  teleport(x, z, yaw = this.yaw) {
    this.pos.set(x, 0, z); this.yaw = yaw; this.camPos.set(x, EYE, z);
  }
}

function shortAngle(a, b) {
  let d = ((b - a + Math.PI) % (Math.PI * 2) + Math.PI * 2) % (Math.PI * 2) - Math.PI;
  return d;
}
function nextMorning(total) {
  const day = Math.floor(total / 1440);
  let t = day * 1440 + 7.5 * 60;
  if (t <= total) t += 1440;
  if (t - total < 240) t = total + 480; // early bird: just get a full 8 hours
  return t;
}
export { angleDamp };
