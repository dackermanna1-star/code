import { Vec3, clamp, lerp, approach } from '../physics/math.js';

/**
 * First-person player: a capsule that walks, sprints, crouches, jumps and climbs (mantles) onto
 * ledges up to chest height, colliding with the level's boxes. It is not part of the ragdoll
 * physics (a player's own motion is better kept crisp), but it does push the zombies it walks into
 * (a body check through Sandbox.pushPerson), and zombies hit it through `damage`.
 *
 * pos is the point between the feet; the eye is `eyeHeight` above it.
 */
export const MOVE = {
  walk: 3.3, sprint: 5.6, crouch: 1.7, ads: 2.2, back: 0.8, // m/s (back: factor walking backwards)
  accel: 42, airAccel: 7, friction: 9, jump: 4.7, gravity: 12.5,
  height: 1.74, crouchHeight: 1.2, radius: 0.3, step: 0.36, mantle: 1.38,
};

export class FpsPlayer {
  constructor(opts = {}) {
    this.pos = new Vec3(opts.x ?? 0, opts.y ?? 0, opts.z ?? 0);
    this.vel = new Vec3();
    this.yaw = opts.yaw ?? 0; // 0 = looking along -z (three.js camera convention), + turns left
    this.pitch = 0;
    this.radius = MOVE.radius;
    this.height = MOVE.height;
    this.crouch = 0; // 0 standing .. 1 crouched (smoothed)
    this.maxHealth = 100;
    this.health = this.maxHealth;
    this.alive = true;
    this.stamina = 1;
    this.onGround = true;
    this.sprinting = false;
    this.ads = false;
    this.mantling = null;
    this.time = 0;
    this.lastHurt = -10;
    this.hurt = []; // recent hits {dir (yaw of the attacker, world), amount, t}
    this.landed = 0; // landing impact (m/s) for the camera dip
    this.events = [];
    this.speed = 0;
    this.stepPhase = 0; // walk cycle (for the bob and the footsteps)
    this.lastStep = 0;
  }

  get eyeHeight() {
    return lerp(MOVE.height, MOVE.crouchHeight, this.crouch) - 0.11;
  }

  eye(out = new Vec3()) {
    return out.set(this.pos.x, this.pos.y + this.eyeHeight, this.pos.z);
  }

  /** Look direction (world). */
  forward(out = new Vec3()) {
    const cp = Math.cos(this.pitch);
    return out.set(-Math.sin(this.yaw) * cp, Math.sin(this.pitch), -Math.cos(this.yaw) * cp);
  }

  damage(amount, from, kind = 'hit') {
    if (!this.alive) return;
    this.health -= amount;
    this.lastHurt = this.time;
    if (from) this.hurt.push({ yaw: Math.atan2(-(from.x - this.pos.x), -(from.z - this.pos.z)), amount, t: this.time, kind });
    if (this.hurt.length > 6) this.hurt.shift();
    // a heavy blow shoves the player back
    if (from && kind !== 'train') {
      const dx = this.pos.x - from.x, dz = this.pos.z - from.z, l = Math.hypot(dx, dz) || 1;
      const k = kind === 'smash' ? 5 : 1.6;
      this.vel.x += (dx / l) * k;
      this.vel.z += (dz / l) * k;
      if (kind === 'smash') this.vel.y = Math.max(this.vel.y, 1.5);
    }
    this.events.push({ type: 'hurt', amount, kind });
    if (this.health <= 0) {
      this.health = 0;
      this.alive = false;
      this.events.push({ type: 'died', kind });
    }
  }

  heal(amount) {
    if (this.alive) this.health = Math.min(this.maxHealth, this.health + amount);
  }

  /**
   * One frame. input: { move: {x (right), z (forward)}, look: {dx, dy} (rad), sprint, crouch, jump }
   * env: { boxes: [{min, max}], floorAt(x, z, fromY) -> y, people: [{x, z, r, person}], push(person, force) }
   */
  update(dt, input, env) {
    this.time += dt;
    this.events.length = 0;
    if (!this.alive) {
      // dead: slump to the floor
      this.crouch = approach(this.crouch, 1, dt * 2);
      this.vel.set(0, Math.min(this.vel.y, 0) - MOVE.gravity * dt, 0);
      this.pos.y = Math.max(this.groundHeight(env), this.pos.y + this.vel.y * dt);
      return;
    }
    // ---- look
    this.yaw += input.look.dx;
    this.pitch = clamp(this.pitch + input.look.dy, -1.45, 1.45);

    // ---- mantling: climbing onto a ledge takes over the motion
    if (this.mantling) {
      const m = this.mantling;
      m.t += dt;
      const u = Math.min(1, m.t / m.dur);
      // up first, then over the edge
      const up = Math.min(1, u / 0.6), over = Math.max(0, (u - 0.35) / 0.65);
      this.pos.set(lerp(m.from.x, m.to.x, over), lerp(m.from.y, m.to.y, 1 - (1 - up) * (1 - up)), lerp(m.from.z, m.to.z, over));
      this.vel.setZero();
      if (u >= 1) {
        this.mantling = null;
        this.onGround = true;
      }
      return;
    }

    // ---- stance
    const wantCrouch = input.crouch && this.onGround;
    if (!wantCrouch && this.crouch > 0.05 && this.headroom(env) < MOVE.height - 0.02) this.crouch = approach(this.crouch, 1, dt * 6);
    else this.crouch = approach(this.crouch, wantCrouch ? 1 : 0, dt * 6);
    const fwdIn = input.move.z, sideIn = input.move.x;
    const moving = Math.hypot(fwdIn, sideIn) > 0.1;
    this.sprinting = !!input.sprint && fwdIn > 0.3 && this.crouch < 0.3 && !this.ads && this.stamina > 0.05 && this.onGround;
    this.stamina = clamp(this.stamina + (this.sprinting ? -dt / 7 : dt / (moving ? 6 : 3.5)), 0, 1);
    if (this.stamina <= 0.05) this.tired = true;
    else if (this.stamina > 0.35) this.tired = false;
    if (this.tired) this.sprinting = false;
    let vmax = this.sprinting ? MOVE.sprint : MOVE.walk;
    vmax = lerp(vmax, MOVE.crouch, this.crouch);
    if (this.ads) vmax = Math.min(vmax, MOVE.ads);
    // hurt recently: a moment slower
    if (this.time - this.lastHurt < 0.4) vmax *= 0.6;

    // ---- horizontal motion (wish velocity in the look frame)
    const sy = Math.sin(this.yaw), cy = Math.cos(this.yaw);
    let wx = -sy * fwdIn + cy * sideIn, wz = -cy * fwdIn - sy * sideIn;
    const wl = Math.hypot(wx, wz);
    if (wl > 1) {
      wx /= wl;
      wz /= wl;
    }
    const backK = fwdIn < -0.1 ? MOVE.back : 1;
    wx *= vmax * backK;
    wz *= vmax * backK;
    const a = this.onGround ? MOVE.accel : MOVE.airAccel;
    const dvx = wx - this.vel.x, dvz = wz - this.vel.z, dl = Math.hypot(dvx, dvz);
    if (dl > 1e-6) {
      const k = Math.min(1, (a * dt) / dl) * (this.onGround || wl > 0.1 ? 1 : 0);
      this.vel.x += dvx * k;
      this.vel.z += dvz * k;
    }

    // ---- vertical: jump, climb, gravity
    if (input.jump && this.onGround && !this.jumpHeld) {
      if (!this.tryMantle(env)) {
        this.vel.y = MOVE.jump * (this.crouch > 0.5 ? 0.75 : 1);
        this.onGround = false;
        this.events.push({ type: 'jump' });
      }
    } else if (input.jump && !this.onGround && !this.jumpHeld) this.tryMantle(env);
    this.jumpHeld = !!input.jump;
    if (!this.onGround || this.vel.y > 0) this.vel.y -= MOVE.gravity * dt;

    // ---- integrate with collision: horizontal first (slide along boxes, push through people)
    this.moveHorizontal(this.vel.x * dt, this.vel.z * dt, env);
    const g = this.groundHeight(env);
    const vyBefore = this.vel.y;
    this.pos.y += this.vel.y * dt;
    if (this.pos.y <= g + 0.002 && this.vel.y <= 0) {
      if (!this.onGround && vyBefore < -2.5) {
        this.landed = -vyBefore;
        this.events.push({ type: 'land', speed: -vyBefore });
        if (vyBefore < -8) this.damage((-vyBefore - 8) * 9, null, 'fall');
      }
      this.pos.y = g;
      this.vel.y = 0;
      this.onGround = true;
    } else if (this.onGround && this.pos.y - g < MOVE.step && this.vel.y <= 0) {
      // walking down a step / off a kerb: stay on the floor
      this.pos.y = g;
      this.vel.y = 0;
    } else this.onGround = this.pos.y <= g + 0.002;
    // ceiling
    const head = this.headroom(env);
    if (this.pos.y + this.eyeHeight + 0.12 > head && this.vel.y > 0) this.vel.y = 0;

    // ---- walk cycle
    const hs = Math.hypot(this.vel.x, this.vel.z);
    this.speed = hs;
    if (this.onGround && hs > 0.4) {
      const stride = lerp(1.45, 0.9, this.crouch) * (this.sprinting ? 1.3 : 1);
      this.stepPhase += (hs * dt) / stride;
      if (Math.floor(this.stepPhase * 2) !== Math.floor(this.lastStep * 2)) this.events.push({ type: 'footstep', speed: hs, crouch: this.crouch });
    }
    this.lastStep = this.stepPhase;
    // recent hits fade
    this.hurt = this.hurt.filter((h) => this.time - h.t < 1.6);
  }

  /** Highest floor under the capsule (centre and a ring of samples). */
  groundHeight(env) {
    const r = this.radius * 0.7, from = this.pos.y + MOVE.step;
    let g = env.floorAt(this.pos.x, this.pos.z, from);
    for (let k = 0; k < 6; k++) {
      const a = (k / 6) * Math.PI * 2;
      g = Math.max(g, env.floorAt(this.pos.x + Math.cos(a) * r, this.pos.z + Math.sin(a) * r, from));
    }
    return g;
  }

  /** Lowest ceiling over the capsule (for standing up from a crouch). */
  headroom(env) {
    let top = Infinity;
    for (const b of env.boxes) {
      if (b.min.y < this.pos.y + 0.5) continue;
      if (this.pos.x > b.min.x - this.radius && this.pos.x < b.max.x + this.radius && this.pos.z > b.min.z - this.radius && this.pos.z < b.max.z + this.radius) top = Math.min(top, b.min.y);
    }
    return top;
  }

  moveHorizontal(dx, dz, env) {
    // sub-steps keep a fast sprint from tunnelling through thin walls
    const n = Math.max(1, Math.ceil(Math.hypot(dx, dz) / 0.12));
    for (let s = 0; s < n; s++) {
      this.pos.x += dx / n;
      this.pos.z += dz / n;
      this.resolve(env);
    }
  }

  /** Push the capsule out of boxes it overlaps (anything taller than a step), and out of people. */
  resolve(env) {
    const r = this.radius, y0 = this.pos.y + MOVE.step, y1 = this.pos.y + lerp(MOVE.height, MOVE.crouchHeight, this.crouch);
    for (let it = 0; it < 3; it++) {
      let moved = false;
      for (const b of env.boxes) {
        if (b.max.y <= y0 || b.min.y >= y1) continue;
        const cx = clamp(this.pos.x, b.min.x, b.max.x), cz = clamp(this.pos.z, b.min.z, b.max.z);
        let ox = this.pos.x - cx, oz = this.pos.z - cz;
        const d = Math.hypot(ox, oz);
        if (d >= r) continue;
        if (d < 1e-6) {
          // centre inside the box: out through the nearest face
          const e = [this.pos.x - b.min.x, b.max.x - this.pos.x, this.pos.z - b.min.z, b.max.z - this.pos.z];
          const k = e.indexOf(Math.min(...e));
          ox = k === 0 ? -1 : k === 1 ? 1 : 0;
          oz = k === 2 ? -1 : k === 3 ? 1 : 0;
          this.pos.x += ox * (e[k] + r);
          this.pos.z += oz * (e[k] + r);
        } else {
          this.pos.x += (ox / d) * (r - d);
          this.pos.z += (oz / d) * (r - d);
          // lose the velocity into the wall
          const nx = ox / d, nz = oz / d, vn = this.vel.x * nx + this.vel.z * nz;
          if (vn < 0) {
            this.vel.x -= vn * nx;
            this.vel.z -= vn * nz;
          }
        }
        moved = true;
      }
      if (!moved) break;
    }
    // people standing in the way: the player is held back, and shoulders them aside
    if (env.people) {
      for (const o of env.people) {
        const dx = this.pos.x - o.x, dz = this.pos.z - o.z, d = Math.hypot(dx, dz), min = r + o.r;
        if (d >= min || d < 1e-6) continue;
        const nx = dx / d, nz = dz / d, pen = min - d;
        this.pos.x += nx * pen * 0.7;
        this.pos.z += nz * pen * 0.7;
        const vn = this.vel.x * nx + this.vel.z * nz;
        if (vn < 0) {
          this.vel.x -= vn * nx * 0.8;
          this.vel.z -= vn * nz * 0.8;
        }
        if (env.push) env.push(o.person, new Vec3(-nx, 0, -nz).scale(Math.min(260, 900 * pen + 40 * Math.max(0, -vn))));
      }
    }
  }

  /** Climb onto a ledge in front (platform edge, a bench) if there is one within reach. */
  tryMantle(env) {
    const fx = -Math.sin(this.yaw), fz = -Math.cos(this.yaw);
    for (const reach of [0.35, 0.55, 0.75]) {
      const x = this.pos.x + fx * reach, z = this.pos.z + fz * reach;
      const top = env.floorAt(x, z, this.pos.y + MOVE.mantle + 0.05);
      const rise = top - this.pos.y;
      if (rise < MOVE.step + 0.05 || rise > MOVE.mantle) continue;
      // room to stand up there?
      const save = this.pos.clone();
      this.pos.set(x + fx * 0.2, top, z + fz * 0.2);
      const head = this.headroom(env);
      const clear = env.boxes.every((b) => b.max.y <= top + 0.05 || b.min.y >= top + MOVE.crouchHeight || this.pos.x < b.min.x - this.radius || this.pos.x > b.max.x + this.radius || this.pos.z < b.min.z - this.radius || this.pos.z > b.max.z + this.radius);
      const to = this.pos.clone();
      this.pos.copy(save);
      if (!clear || head < top + MOVE.crouchHeight) continue;
      this.mantling = { from: save, to, t: 0, dur: 0.35 + 0.25 * (rise / MOVE.mantle) };
      this.vel.setZero();
      this.events.push({ type: 'mantle', rise });
      return true;
    }
    return false;
  }
}
