// First-person walker: slow, deliberate movement with eased acceleration,
// gait phase driving head bob / sway / roll, heel+toe footstep events placed
// at the planted foot, collision sliding, mouse / keyboard / gamepad / touch.
import * as THREE from 'three';

const TAU = Math.PI * 2;
const smooth01 = (a, b, x) => {
  const t = Math.min(1, Math.max(0, (x - a) / (b - a)));
  return t * t * (3 - 2 * t);
};

export class Player {
  constructor(engine, opts = {}) {
    this.engine = engine;
    this.camera = engine.camera;
    this.pos = new THREE.Vector3(opts.x ?? 0.15, 0, opts.z ?? 1.2);
    this.vel = new THREE.Vector3();
    this.yaw = opts.yaw ?? 0;
    this.pitch = opts.pitch ?? -0.02;
    this.yawT = this.yaw;
    this.pitchT = this.pitch;
    this.radius = 0.24;
    this.eyeHeight = 1.62;
    this.keys = new Set();
    this.enabled = false;
    this.phase = 0; // counts steps; integer = heel strike
    this.stepIndex = 0;
    this.speed = 0;
    this.groundY = 0;
    this.listeners = [];
    this.pending = []; // scheduled toe events
    this.feetYaw = this.yaw;
    this.shuffle = 0;
    this.time = 0;
    this.lookDX = 0;
    this.lookDY = 0;
    this.stride = { L: new THREE.Vector3(), R: new THREE.Vector3() };
    this.rhythm = 1;
    this.gait = { phase: 0, speed: 0, stepLen: 0.6, plantL: new THREE.Vector3(), plantR: new THREE.Vector3(), bodyYaw: this.yaw };
    this.touch = { move: null, look: null };
    this.bindInput();
  }

  onStep(cb) {
    this.listeners.push(cb);
  }

  emitStep(e) {
    for (const l of this.listeners) l(e);
  }

  bindInput() {
    const el = this.engine.canvas;
    addEventListener('keydown', (e) => {
      this.keys.add(e.code);
      if (e.code === 'KeyF' && this.enabled) {
        if (!document.fullscreenElement) document.documentElement.requestFullscreen?.().catch(() => {});
        else document.exitFullscreen?.();
      }
    });
    addEventListener('keyup', (e) => this.keys.delete(e.code));
    addEventListener('blur', () => this.keys.clear());
    addEventListener('mousemove', (e) => {
      if (!this.enabled) return;
      if (document.pointerLockElement === el || this.dragLook) {
        this.lookDX += e.movementX;
        this.lookDY += e.movementY;
      }
    });
    el.addEventListener('mousedown', () => {
      if (this.enabled && document.pointerLockElement !== el) this.dragLook = true;
    });
    addEventListener('mouseup', () => (this.dragLook = false));
    // touch: left half = walk stick, right half = look
    el.addEventListener('touchstart', (e) => {
      for (const t of e.changedTouches) {
        if (t.clientX < innerWidth * 0.45 && !this.touch.move) this.touch.move = { id: t.identifier, x0: t.clientX, y0: t.clientY, x: t.clientX, y: t.clientY };
        else if (!this.touch.look) this.touch.look = { id: t.identifier, x: t.clientX, y: t.clientY };
      }
      e.preventDefault();
    }, { passive: false });
    el.addEventListener('touchmove', (e) => {
      for (const t of e.changedTouches) {
        if (this.touch.move?.id === t.identifier) {
          this.touch.move.x = t.clientX;
          this.touch.move.y = t.clientY;
        } else if (this.touch.look?.id === t.identifier) {
          this.lookDX += (t.clientX - this.touch.look.x) * 2.2;
          this.lookDY += (t.clientY - this.touch.look.y) * 2.2;
          this.touch.look.x = t.clientX;
          this.touch.look.y = t.clientY;
        }
      }
      e.preventDefault();
    }, { passive: false });
    const end = (e) => {
      for (const t of e.changedTouches) {
        if (this.touch.move?.id === t.identifier) this.touch.move = null;
        if (this.touch.look?.id === t.identifier) this.touch.look = null;
      }
    };
    el.addEventListener('touchend', end);
    el.addEventListener('touchcancel', end);
  }

  readInput() {
    const k = this.keys;
    let f = 0, s = 0;
    if (k.has('KeyW') || k.has('ArrowUp')) f += 1;
    if (k.has('KeyS') || k.has('ArrowDown')) f -= 1;
    if (k.has('KeyD') || k.has('ArrowRight')) s += 1;
    if (k.has('KeyA') || k.has('ArrowLeft')) s -= 1;
    let brisk = k.has('ShiftLeft') || k.has('ShiftRight');
    if (this.touch.move) {
      const dx = (this.touch.move.x - this.touch.move.x0) / 60, dy = (this.touch.move.y - this.touch.move.y0) / 60;
      f -= Math.max(-1, Math.min(1, dy));
      s += Math.max(-1, Math.min(1, dx));
    }
    const pads = navigator.getGamepads ? navigator.getGamepads() : [];
    for (const p of pads) {
      if (!p) continue;
      const dz = (v) => (Math.abs(v) < 0.15 ? 0 : v);
      s += dz(p.axes[0] ?? 0);
      f -= dz(p.axes[1] ?? 0);
      this.lookDX += dz(p.axes[2] ?? 0) * 14;
      this.lookDY += dz(p.axes[3] ?? 0) * 10;
      if (p.buttons[10]?.pressed || p.buttons[4]?.pressed) brisk = true;
    }
    return { f: Math.max(-1, Math.min(1, f)), s: Math.max(-1, Math.min(1, s)), brisk };
  }

  update(dt) {
    this.time += dt;
    const world = this.engine.world;
    const inp = this.enabled ? this.readInput() : { f: 0, s: 0, brisk: false };

    // ── look (slightly weighted) ──
    const sens = 0.0019;
    this.yawT -= this.lookDX * sens;
    this.pitchT -= this.lookDY * sens;
    this.lookDX = this.lookDY = 0;
    this.pitchT = Math.max(-1.32, Math.min(1.25, this.pitchT));
    const lk = 1 - Math.exp(-dt / 0.045);
    const prevYaw = this.yaw;
    this.yaw += (this.yawT - this.yaw) * lk;
    this.pitch += (this.pitchT - this.pitch) * lk;
    // lean very slightly into turns (more when walking)
    const yawRate = dt > 0 ? (this.yaw - prevYaw) / dt : 0;
    const leanT = Math.max(-1, Math.min(1, yawRate * 0.35)) * THREE.MathUtils.degToRad(0.7) * (0.35 + 0.65 * Math.min(1, this.speed));
    this.lean = (this.lean ?? 0) + (leanT - (this.lean ?? 0)) * (1 - Math.exp(-dt / 0.25));

    // ── movement ──
    const len = Math.hypot(inp.f, inp.s);
    const fwdSpeed = inp.brisk ? 1.65 : 1.18;
    let wishX = 0, wishZ = 0;
    if (len > 0.01) {
      const nf = inp.f / Math.max(1, len), ns = inp.s / Math.max(1, len);
      const sp = nf >= 0 ? fwdSpeed : 0.72;
      const fx = -Math.sin(this.yaw), fz = -Math.cos(this.yaw);
      const rx = Math.cos(this.yaw), rz = -Math.sin(this.yaw);
      // walking backwards / sideways is slower and more careful
      const spd = sp * (Math.abs(ns) > Math.abs(nf) ? 0.72 : 1) * Math.min(1, len);
      wishX = (fx * nf + rx * ns) * spd;
      wishZ = (fz * nf + rz * ns) * spd;
    }
    const accel = Math.hypot(wishX, wishZ) > this.speed ? 0.5 : 0.36;
    const a = 1 - Math.exp(-dt / accel);
    this.vel.x += (wishX - this.vel.x) * a;
    this.vel.z += (wishZ - this.vel.z) * a;
    const coll = world.collision;
    if (coll) {
      const np = coll.move(this.pos.x, this.pos.z, this.vel.x * dt, this.vel.z * dt, this.radius);
      const mx = (np.x - this.pos.x) / Math.max(dt, 1e-5), mz = (np.z - this.pos.z) / Math.max(dt, 1e-5);
      this.pos.x = np.x;
      this.pos.z = np.z;
      // lose velocity into walls
      this.vel.x = mx;
      this.vel.z = mz;
    } else {
      this.pos.x += this.vel.x * dt;
      this.pos.z += this.vel.z * dt;
    }
    this.speed = Math.hypot(this.vel.x, this.vel.z);

    // ── ground ──
    const gy = world.groundHeight ? world.groundHeight(this.pos.x, this.pos.z) : 0;
    this.groundY += (gy - this.groundY) * (1 - Math.exp(-dt / 0.12));

    // ── gait ──
    // small natural irregularity in rhythm
    this.rhythm += (1 + 0.06 * Math.sin(this.time * 0.37) * Math.sin(this.time * 0.11) - this.rhythm) * dt;
    const stepLen = (0.54 + 0.12 * smooth01(0.6, 1.7, this.speed)) * this.rhythm;
    const prevPhase = this.phase;
    if (this.speed > 0.07) {
      this.phase += (this.speed * dt) / stepLen;
      this.settling = true;
    } else if (this.settling) {
      // finish the current step so feet come together
      const frac = this.phase - Math.floor(this.phase);
      if (frac > 0.02) this.phase += dt * 1.6;
      else this.settling = false;
    }
    // turning on the spot: shuffle steps
    let yawDiff = this.yaw - this.feetYaw;
    yawDiff = Math.atan2(Math.sin(yawDiff), Math.cos(yawDiff));
    if (this.speed > 0.2) this.feetYaw = this.yaw;
    else if (Math.abs(yawDiff) > 0.7 && !this.settling) {
      this.feetYaw += yawDiff * 0.55;
      this.shuffle = 2;
    }
    if (this.shuffle > 0 && !this.settling) {
      this.phase += dt * 2.4;
      if (Math.floor(this.phase) > Math.floor(prevPhase)) this.shuffle--;
    }
    if (Math.floor(this.phase) > Math.floor(prevPhase)) this.heelStrike(stepLen);

    // scheduled toe contacts
    for (let i = this.pending.length - 1; i >= 0; i--) {
      const p = this.pending[i];
      p.t -= dt;
      if (p.t <= 0) {
        this.emitStep(p.e);
        this.pending.splice(i, 1);
      }
    }

    // ── camera ──
    const s = this.phase - Math.floor(this.phase);
    const strideP = ((Math.floor(this.phase) % 2) + s) / 2;
    const amp = smooth01(0.04, 1.2, this.speed) + (this.shuffle > 0 ? 0.25 : 0);
    let bobY = -0.017 * amp * Math.cos(TAU * s) - 0.005 * amp * Math.exp(-s * 22);
    const swayX = 0.012 * amp * Math.sin(TAU * strideP);
    const roll = THREE.MathUtils.degToRad(0.32) * amp * Math.sin(TAU * strideP);
    const nod = THREE.MathUtils.degToRad(0.35) * amp * (Math.exp(-s * 18) - 0.12);
    const idle = 1 - smooth01(0.0, 0.4, this.speed);
    bobY += idle * 0.0028 * Math.sin(this.time * 1.55);
    const idleSway = idle * 0.002 * Math.sin(this.time * 0.43);

    const cam = this.camera;
    const pitch = this.pitch + nod;
    // neck pivot: eyes sit forward/above the pivot, so looking down moves them forward
    const neckY = this.groundY + this.eyeHeight - 0.11 + bobY;
    // looking down, the head also tilts forward on the neck, bringing the eyes past the chest
    const down = Math.max(0, -Math.sin(pitch));
    const eyeFwd = 0.085 + 0.11 * down * down, eyeUp = 0.11;
    const cy = Math.cos(pitch), sy = Math.sin(pitch);
    const ox = 0, oy = eyeUp * cy + eyeFwd * sy, oz = -eyeFwd * cy + eyeUp * sy;
    const sinY = Math.sin(this.yaw), cosY = Math.cos(this.yaw);
    const lat = swayX + idleSway;
    cam.position.set(
      this.pos.x + cosY * lat + (ox * cosY + oz * sinY),
      neckY + oy,
      this.pos.z - sinY * lat + (-ox * sinY + oz * cosY),
    );
    cam.rotation.set(pitch, this.yaw, roll + (this.lean ?? 0), 'YXZ');
    cam.updateMatrixWorld();

    this.gait.phase = this.phase;
    this.gait.speed = this.speed;
    this.gait.stepLen = stepLen;
    this.gait.bodyYaw = this.feetYaw;
    this.gait.bobY = bobY;
  }

  heelStrike(stepLen) {
    this.stepIndex++;
    const foot = this.stepIndex % 2 === 0 ? 'L' : 'R';
    const side = foot === 'L' ? -1 : 1;
    const fwdX = -Math.sin(this.feetYaw), fwdZ = -Math.cos(this.feetYaw);
    const rx = Math.cos(this.feetYaw), rz = -Math.sin(this.feetYaw);
    // the planted foot lands roughly half a step ahead of the hips
    const ahead = this.speed > 0.07 ? stepLen * 0.45 : 0.05;
    const px = this.pos.x + fwdX * ahead + rx * side * 0.085;
    const pz = this.pos.z + fwdZ * ahead + rz * side * 0.085;
    const surface = this.engine.world.surfaceAt ? this.engine.world.surfaceAt(px, pz) : 'asphalt';
    const intensity = Math.min(1, 0.35 + this.speed * 0.5) * (this.shuffle > 0 || !this.speed ? 0.55 : 1);
    const position = { x: px, y: this.groundY, z: pz };
    (foot === 'L' ? this.gait.plantL : this.gait.plantR).set(px, this.groundY, pz);
    this.emitStep({ foot, part: 'heel', surface, intensity, position, speed: this.speed });
    const cadence = Math.max(1.2, this.speed / Math.max(0.3, stepLen));
    this.pending.push({ t: 0.085 + 0.06 / cadence + Math.random() * 0.012, e: { foot, part: 'toe', surface, intensity: intensity * 0.7, position, speed: this.speed } });
  }
}
