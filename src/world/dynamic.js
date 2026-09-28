// Interactive world objects: hinged doors (breakable by infected, safe-room
// doors), glass panes, free physics props (pushable, kicked, blown around),
// explosive props (propane / gas can / oxygen), alarmed cars and Tank
// "hittables". All register colliders with the level's CollisionWorld.
import * as THREE from 'three';
import { F_SOLID, F_SHOOT, F_SIGHT, F_DEFAULT } from './collision.js';
import { materials } from '../render/materials.js';
import { getTexture } from '../render/textures.js';
import { clamp, damp, randRange } from '../core/math.js';
import { DF } from '../render/decals.js';

const _v = new THREE.Vector3();

// ------------------------------------------------------------------ Door --
// axis: 'x' (door plane along X, opening swings in Z) or 'z'.
// (x,z) is the centre of the doorway; y floor height.
export class Door {
  constructor(level, x, y, z, axis = 'x', opts = {}) {
    this.level = level;
    this.game = level.game;
    this.idx = level.doors.length;
    level.doors.push(this);
    this.axis = axis;
    this.w = opts.width ?? 1.0;
    this.h = opts.height ?? 2.15;
    this.t = 0.06;
    this.cx = x; this.cy = y; this.cz = z;
    this.safe = !!opts.safe;
    this.hp = opts.hp ?? (this.safe ? Infinity : 300);
    this.open = !!opts.open;
    this.broken = false;
    this.locked = !!opts.locked;
    this.angle = this.open ? Math.PI / 2 : 0;
    this.targetAngle = this.angle;
    this.dirSign = 1;
    this.hingeSign = opts.hinge ?? 1;
    this.onClose = opts.onClose || null;
    this.onOpen = opts.onOpen || null;
    this.label = opts.label;
    this.useCd = 0;
    // mesh
    const g = new THREE.Group();
    const mat = this.safe ? materials.get('paintedRed') : materials.get(opts.material ?? 'woodDark');
    const panel = new THREE.Mesh(new THREE.BoxGeometry(this.w, this.h, this.t), mat);
    panel.geometry.translate(this.w / 2, this.h / 2, 0);
    // flip geometry origin to hinge
    if (this.hingeSign < 0) panel.geometry.translate(-this.w, 0, 0);
    panel.castShadow = true; panel.receiveShadow = true;
    // vertex colours required by level materials
    const cnt = panel.geometry.attributes.position.count;
    panel.geometry.setAttribute('color', new THREE.BufferAttribute(new Float32Array(cnt * 3).fill(1), 3));
    g.add(panel);
    // handle
    const hm = new THREE.Mesh(new THREE.BoxGeometry(0.14, 0.03, 0.05), materials.get('chrome'));
    hm.geometry.setAttribute('color', new THREE.BufferAttribute(new Float32Array(hm.geometry.attributes.position.count * 3).fill(1), 3));
    hm.position.set(this.hingeSign * (this.w - 0.12), 1.0, 0.06);
    g.add(hm);
    const hm2 = hm.clone(); hm2.position.z = -0.06; g.add(hm2);
    if (this.safe) {
      // small barred window + frame
      const win = new THREE.Mesh(new THREE.BoxGeometry(0.3, 0.25, this.t + 0.02), materials.get('glassDirty'));
      win.geometry.setAttribute('color', new THREE.BufferAttribute(new Float32Array(win.geometry.attributes.position.count * 3).fill(1), 3));
      win.position.set(this.hingeSign * this.w * 0.5, 1.55, 0);
      g.add(win);
    }
    g.position.set(this.hingeX(), y, this.hingeZ());
    if (axis === 'z') g.rotation.y = -Math.PI / 2;
    this.mesh = g;
    level.addObject(g);
    // frame (static)
    const fm = 'woodDark';
    if (axis === 'x') {
      level.box(x - this.w / 2 - 0.08, y, z - 0.1, x - this.w / 2, y + this.h + 0.08, z + 0.1, fm, { collide: false });
      level.box(x + this.w / 2, y, z - 0.1, x + this.w / 2 + 0.08, y + this.h + 0.08, z + 0.1, fm, { collide: false });
      level.box(x - this.w / 2, y + this.h, z - 0.1, x + this.w / 2, y + this.h + 0.08, z + 0.1, fm, { collide: false });
    } else {
      level.box(x - 0.1, y, z - this.w / 2 - 0.08, x + 0.1, y + this.h + 0.08, z - this.w / 2, fm, { collide: false });
      level.box(x - 0.1, y, z + this.w / 2, x + 0.1, y + this.h + 0.08, z + this.w / 2 + 0.08, fm, { collide: false });
      level.box(x - 0.1, y + this.h, z - this.w / 2, x + 0.1, y + this.h + 0.08, z + this.w / 2, fm, { collide: false });
    }
    this.collider = level.col.addDynamic([0, 0, 0], [0, 0, 0], { flags: F_DEFAULT, surf: this.safe ? 'metal' : 'wood', owner: this });
    this.updateCollider();
    level.dynamics.push(this);
    this.usable = {
      door: this,
      pos: new THREE.Vector3(x, y + 1.1, z),
      radius: 1.8,
      get prompt() { return this.door.open ? 'Close door' : 'Open door'; },
      enabled: true,
      onUse: (s) => this.use(s),
    };
    this.game.usables.push(this.usable);
  }
  hingeX() { return this.axis === 'x' ? this.cx - this.hingeSign * this.w / 2 : this.cx; }
  hingeZ() { return this.axis === 'z' ? this.cz - this.hingeSign * this.w / 2 : this.cz; }
  blocksInfected() { return !this.open && !this.broken && this.angle < 0.3; }
  canUse(s) { return !this.broken && !this.locked && this.useCd <= 0; }
  use(s) {
    if (!this.canUse(s)) {
      if (this.locked) this.game.audio.play('doorBang', { pos: this.usable.pos, vol: 0.4 });
      return;
    }
    this.useCd = 0.5;
    if (this.open) {
      // don't close onto someone standing in the swing
      this.open = false;
      this.targetAngle = 0;
      this.game.audio.play(this.safe ? 'safeDoorClose' : 'doorClose', { pos: this.usable.pos, vol: 1 });
      this.onClose?.(s, this);
    } else {
      this.open = true;
      // open away from the user
      const toUser = this.axis === 'x' ? s.pos.z - this.cz : s.pos.x - this.cx;
      const su = toUser > 0 ? 1 : -1;
      this.dirSign = this.axis === 'x' ? -su * this.hingeSign : su * this.hingeSign;
      this.targetAngle = Math.PI / 2 * 0.95;
      this.game.audio.play(this.safe ? 'safeDoorOpen' : 'doorOpen', { pos: this.usable.pos, vol: 1 });
      this.onOpen?.(s, this);
    }
  }
  damage(amount, by) {
    if (this.broken || this.open) return;
    this.game.audio.play('doorBang', { pos: this.usable.pos, vol: 0.9 });
    this.shakeT = 0.15;
    if (this.safe) return;
    this.hp -= amount;
    if (this.hp <= 0) this.breakDoor(by);
  }
  breakDoor(by) {
    this.broken = true;
    this.collider.enabled = false;
    this.usable.enabled = false;
    this.game.audio.play('doorBreak', { pos: this.usable.pos, vol: 1 });
    this.game.fx.chips(this.cx, this.cy + 1, this.cz, 0, 0.5, 0, [0.3, 0.2, 0.12], 20);
    this.game.fx.dust(this.cx, this.cy + 1, this.cz, 0, 0.3, 0, [0.4, 0.35, 0.3], 6, 0.6);
    // door falls flat
    this.fall = { t: 0, dir: by ? Math.sign((this.axis === 'x' ? this.cz - by.pos.z : this.cx - by.pos.x)) || 1 : 1 };
  }
  onShot(x, y, z, dir, shooter) {
    this.game.fx.chips(x, y, z, -dir.x, -dir.y, -dir.z, [0.3, 0.2, 0.12], 3);
  }
  bindNav(nav) {
    // mark doorway nodes
    const hw = this.w / 2 + 0.1;
    const x0 = this.axis === 'x' ? this.cx - hw : this.cx - 0.3, x1 = this.axis === 'x' ? this.cx + hw : this.cx + 0.3;
    const z0 = this.axis === 'z' ? this.cz - hw : this.cz - 0.3, z1 = this.axis === 'z' ? this.cz + hw : this.cz + 0.3;
    for (let x = x0; x <= x1; x += nav.cs * 0.5) {
      for (let z = z0; z <= z1; z += nav.cs * 0.5) {
        const n = nav.nodeAt(x, this.cy, z);
        if (n >= 0 && Math.abs(nav.nodeY[n] - this.cy) < 0.6) nav.doorOf[n] = this.idx;
      }
    }
  }
  updateCollider() {
    const d = this.collider;
    if (this.broken) { d.enabled = false; return; }
    const a = this.angle * this.dirSign;
    const hx = this.hingeX(), hz = this.hingeZ();
    // door rectangle from hinge along its width direction rotated by angle
    let ux, uz;
    if (this.axis === 'x') { ux = Math.cos(a) * this.hingeSign; uz = Math.sin(a) * this.hingeSign; }
    else { ux = -Math.sin(a) * this.hingeSign; uz = Math.cos(a) * this.hingeSign; }
    const ex = hx + ux * this.w, ez = hz + uz * this.w;
    const pad = 0.05;
    d.min[0] = Math.min(hx, ex) - pad; d.max[0] = Math.max(hx, ex) + pad;
    d.min[2] = Math.min(hz, ez) - pad; d.max[2] = Math.max(hz, ez) + pad;
    d.min[1] = this.cy; d.max[1] = this.cy + this.h;
    // when partially open, collider bounding box would block the doorway; only collide when nearly closed or open
    d.enabled = this.angle < 0.25 || this.angle > 1.3;
  }
  update(dt) {
    this.useCd = Math.max(0, this.useCd - dt);
    if (this.fall) {
      this.fall.t += dt;
      const k = Math.min(1, this.fall.t / 0.6);
      const e = k * k;
      if (this.axis === 'x') this.mesh.rotation.x = e * Math.PI / 2 * this.fall.dir;
      else this.mesh.rotation.z = -e * Math.PI / 2 * this.fall.dir;
      if (k >= 1 && !this.fall.done) { this.fall.done = true; this.game.audio.play('woodBreak', { pos: this.usable.pos, vol: 0.8 }); }
      return;
    }
    const prev = this.angle;
    this.angle = damp(this.angle, this.targetAngle, 7, dt);
    let shake = 0;
    if (this.shakeT > 0) { this.shakeT -= dt; shake = Math.sin(this.shakeT * 90) * 0.03; }
    const a = this.angle * this.dirSign + shake;
    this.mesh.rotation.y = this.axis === 'x' ? -a : -Math.PI / 2 - a;
    if (Math.abs(prev - this.angle) > 1e-4) this.updateCollider();
  }
}

// ------------------------------------------------------------ WindowPane --
export class WindowPane {
  constructor(level, x0, y0, z0, x1, y1, z1, opts = {}) {
    this.level = level;
    this.game = level.game;
    this.box = [Math.min(x0, x1), Math.min(y0, y1), Math.min(z0, z1), Math.max(x0, x1), Math.max(y0, y1), Math.max(z0, z1)];
    const w = this.box[3] - this.box[0], h = this.box[4] - this.box[1], d = this.box[5] - this.box[2];
    const geo = new THREE.BoxGeometry(w, h, d);
    geo.setAttribute('color', new THREE.BufferAttribute(new Float32Array(geo.attributes.position.count * 3).fill(1), 3));
    this.mesh = new THREE.Mesh(geo, materials.get(opts.dirty ? 'glassDirty' : 'glass'));
    this.mesh.position.set((this.box[0] + this.box[3]) / 2, (this.box[1] + this.box[4]) / 2, (this.box[2] + this.box[5]) / 2);
    this.mesh.renderOrder = 3;
    level.addObject(this.mesh);
    this.collider = level.col.addDynamic([this.box[0], this.box[1], this.box[2]], [this.box[3], this.box[4], this.box[5]], { flags: F_SOLID | F_SHOOT, surf: 'glass', owner: this });
    this.broken = false;
    (level.windows || (level.windows = [])).push(this);
  }
  onShot(x, y, z, dir) { this.shatter(dir); }
  shatter(dir = _v.set(0, 0, 1)) {
    if (this.broken) return;
    this.broken = true;
    this.collider.enabled = false;
    this.mesh.visible = false;
    const b = this.box;
    const cx = (b[0] + b[3]) / 2, cy = (b[1] + b[4]) / 2, cz = (b[2] + b[5]) / 2;
    const g = this.game;
    for (let i = 0; i < 30; i++) {
      g.fx.alpha.spawn({ x: b[0] + Math.random() * (b[3] - b[0]), y: b[1] + Math.random() * (b[4] - b[1]), z: b[2] + Math.random() * (b[5] - b[2]),
        vx: dir.x * 3 + (Math.random() - 0.5) * 2, vy: Math.random() * 2, vz: dir.z * 3 + (Math.random() - 0.5) * 2, life: 1 + Math.random(), size: 0.03 + Math.random() * 0.04,
        frame: 8, color: [0.7, 0.8, 0.8], alpha: 0.7, alpha1: 0.5, grav: 12, rv: 12 });
    }
    g.audio.play('glassBreak', { pos: _v.set(cx, cy, cz), vol: 1 });
  }
}

// -------------------------------------------------------------- PhysProp --
// Lightweight rigid body: sphere collision against the world, visual rotation.
export class PhysProp {
  constructor(level, obj, x, y, z, opts = {}) {
    this.level = level;
    this.game = level.game;
    this.obj = obj;
    this.pos = new THREE.Vector3(x, y, z);
    this.vel = new THREE.Vector3();
    this.q = new THREE.Quaternion().setFromEuler(new THREE.Euler(0, opts.yaw ?? Math.random() * 6.28, 0));
    this.av = new THREE.Vector3();
    this.r = opts.radius ?? 0.25;
    this.mass = opts.mass ?? 1;
    this.surf = opts.surf ?? 'metal';
    this.sleep = true;
    this.explosive = opts.explosive || null; // 'propane' | 'gascan' | 'oxygen' | 'fireworks'
    this.hp = opts.hp ?? 20;
    this.dead = false;
    this.upright = opts.upright ?? true;
    this.bottom = opts.bottom ?? this.r; // distance from centre to ground when upright
    obj.position.copy(this.pos);
    obj.quaternion.copy(this.q);
    obj.traverse((o) => { if (o.isMesh) { o.castShadow = true; o.receiveShadow = true; } });
    level.addObject(obj);
    this.tmp = { x: 0, y: 0, z: 0 };
    this.contact = { nx: 0, ny: 0, nz: 0 };
    this.fuse = -1;
  }
  wake() { this.sleep = false; this.sleepT = 0; }
  impulse(x, y, z) {
    this.vel.x += x / this.mass; this.vel.y += y / this.mass; this.vel.z += z / this.mass;
    this.av.set((Math.random() - 0.5) * 8, (Math.random() - 0.5) * 8, (Math.random() - 0.5) * 8).multiplyScalar(Math.min(3, Math.hypot(x, y, z) / (this.mass * 3)));
    this.wake();
  }
  onShot(x, y, z, dir, shooter) {
    this.impulse(dir.x * 2, 0.8, dir.z * 2);
    if (this.explosive) {
      this.hp -= 10;
      this.lastAttacker = shooter;
      if (this.explosive === 'oxygen' && this.fuse < 0) { this.fuse = 2.2; this.hiss = this.game.audio.loop('oxygenHiss', { pos: this.pos, vol: 0.8 }); }
      else if (this.hp <= 0) this.detonate(shooter);
    }
  }
  detonate(by) {
    if (this.dead) return;
    this.dead = true;
    const g = this.game;
    this.obj.visible = false;
    this.hiss?.stop(0.1);
    const { x, y, z } = this.pos;
    if (this.explosive === 'gascan') {
      g.combat.startFire(x, y, z, 4.5, 16, by);
      g.audio.play('gasCanIgnite', { pos: this.pos, vol: 1 });
      g.fx.explosion(x, y + 0.2, z, 0.5);
    } else if (this.explosive === 'fireworks') {
      g.combat.startFire(x, y, z, 3.5, 10, by);
      for (let i = 0; i < 6; i++) setTimeout(() => g.fx.sparks(x, y + 1, z, 0, 1, 0, 30, [Math.random(), Math.random(), 1], 12), i * 250);
      g.audio.play('explosion', { pos: this.pos, vol: 0.6 });
    } else {
      g.combat.explode(x, y + 0.3, z, this.explosive === 'oxygen' ? 6.5 : 7.5, 1500, by, { survivorDamage: 30 });
      g.audio.play('propaneExplode', { pos: this.pos, vol: 1 });
    }
  }
  update(dt) {
    if (this.dead) return;
    if (this.fuse > 0) {
      this.fuse -= dt;
      if (Math.random() < 0.5) this.game.fx.dust(this.pos.x, this.pos.y + 0.5, this.pos.z, 0, 1, 0, [0.8, 0.8, 0.8], 1, 0.15);
      if (this.fuse <= 0) this.detonate(this.lastAttacker);
    }
    if (this.sleep) return;
    const col = this.level.col;
    this.vel.y -= 16 * dt;
    this.pos.addScaledVector(this.vel, dt);
    const t = this.tmp;
    t.x = this.pos.x; t.y = this.pos.y; t.z = this.pos.z;
    let grounded = false;
    if (col.collideSphere(t, this.r, this.contact)) {
      this.pos.set(t.x, t.y, t.z);
      const c = this.contact;
      const nl = Math.hypot(c.nx, c.ny, c.nz) || 1;
      const nx = c.nx / nl, ny = c.ny / nl, nz = c.nz / nl;
      const vn = this.vel.x * nx + this.vel.y * ny + this.vel.z * nz;
      if (vn < 0) {
        this.vel.x -= 1.35 * vn * nx; this.vel.y -= 1.35 * vn * ny; this.vel.z -= 1.35 * vn * nz;
        if (vn < -3) this.game.audio.play('metalImpact', { pos: this.pos, vol: Math.min(1, -vn / 10) });
      }
      if (ny > 0.5) {
        grounded = true;
        this.vel.x *= Math.max(0, 1 - dt * 4); this.vel.z *= Math.max(0, 1 - dt * 4);
        this.av.multiplyScalar(Math.max(0, 1 - dt * 3));
      }
    }
    const w = this.av.length();
    if (w > 0.01) {
      const dq = new THREE.Quaternion().setFromAxisAngle(_v.copy(this.av).divideScalar(w), w * dt);
      this.q.premultiply(dq);
    }
    // settle upright props back to their base when slow
    if (grounded && this.upright && w < 0.5 && this.vel.lengthSq() < 0.3) {
      const e = new THREE.Euler().setFromQuaternion(this.q, 'YXZ');
      const tq = new THREE.Quaternion().setFromEuler(new THREE.Euler(0, e.y, 0));
      this.q.slerp(tq, Math.min(1, dt * 3));
    }
    this.obj.position.set(this.pos.x, this.pos.y - (this.upright ? this.bottom - this.r : 0), this.pos.z);
    this.obj.quaternion.copy(this.q);
    if (grounded && this.vel.lengthSq() < 0.02 && w < 0.1) {
      this.sleepT = (this.sleepT || 0) + dt;
      if (this.sleepT > 0.6) this.sleep = true;
    }
    if (this.pos.y < -200) this.dead = true;
  }
}

// ------------------------------------------------------------ PropManager --
export class PropManager {
  constructor(game) {
    this.game = game;
    this.props = [];
    this.cars = [];
  }
  clear() { this.props = []; this.cars = []; }
  add(p) { this.props.push(p); return p; }
  traceProps(ox, oy, oz, dx, dy, dz, maxT, out) {
    for (const p of this.props) {
      if (p.dead) continue;
      const mx = p.pos.x - ox, my = p.pos.y - oy, mz = p.pos.z - oz;
      const b = mx * dx + my * dy + mz * dz;
      if (b < 0 || b > maxT + p.r) continue;
      const c = mx * mx + my * my + mz * mz - p.r * p.r;
      const disc = b * b - c;
      if (disc < 0) continue;
      const t = b - Math.sqrt(disc);
      if (t >= 0 && t < maxT) out.push({ ent: p, prop: p, t });
    }
    for (const car of this.cars) {
      if (!car.alarm || car.triggered) continue;
      // bullets hitting an alarmed car set it off (box test)
      const bb = car.box;
      let tmin = 0, tmax = maxT;
      const o = [ox, oy, oz], d = [dx, dy, dz];
      let hit = true;
      for (let a = 0; a < 3; a++) {
        if (Math.abs(d[a]) < 1e-8) { if (o[a] < bb[a] || o[a] > bb[a + 3]) { hit = false; break; } continue; }
        let t1 = (bb[a] - o[a]) / d[a], t2 = (bb[a + 3] - o[a]) / d[a];
        if (t1 > t2) [t1, t2] = [t2, t1];
        tmin = Math.max(tmin, t1); tmax = Math.min(tmax, t2);
        if (tmin > tmax) { hit = false; break; }
      }
      if (hit) car.trigger();
    }
  }
  shoveProps(s, fx, fz) {
    for (const p of this.props) {
      if (p.dead) continue;
      const dx = p.pos.x - s.pos.x, dz = p.pos.z - s.pos.z;
      const d = Math.hypot(dx, dz);
      if (d < 1.6 && (dx * fx + dz * fz) / (d || 1) > 0.3 && Math.abs(p.pos.y - s.pos.y - 0.5) < 1.5) p.impulse(fx * 4, 1.5, fz * 4);
    }
  }
  explosionImpulse(x, y, z, r, power) {
    for (const p of this.props) {
      if (p.dead) continue;
      const d = p.pos.distanceTo(_v.set(x, y, z));
      if (d > r) continue;
      const k = 1 - d / r;
      p.impulse((p.pos.x - x) / (d || 1) * power * k, power * 0.7 * k, (p.pos.z - z) / (d || 1) * power * k);
      if (p.explosive && d < r * 0.6 && !p.dead) setTimeout(() => p.detonate(null), 120 + Math.random() * 200);
    }
  }
  update(dt) {
    const g = this.game;
    // survivors kick small props they walk into
    for (const p of this.props) {
      if (p.dead) continue;
      if (p.mass < 3) {
        for (const s of g.survivors) {
          if (s.dead) continue;
          const dx = p.pos.x - s.pos.x, dz = p.pos.z - s.pos.z;
          const d = Math.hypot(dx, dz);
          if (d < p.r + 0.35 && Math.abs(p.pos.y - s.pos.y - p.r) < 0.8) {
            const sp = Math.hypot(s.phys.vx, s.phys.vz);
            if (sp > 0.5) p.impulse(dx / (d || 1) * sp * 0.6, 0.6, dz / (d || 1) * sp * 0.6);
          }
        }
      }
      p.update(dt);
    }
    for (const c of this.cars) c.update(dt);
  }
}

// -------------------------------------------------------------- Car alarm --
export class AlarmCar {
  constructor(level, box, lights) {
    this.level = level;
    this.game = level.game;
    this.box = box;
    this.alarm = true;
    this.triggered = false;
    this.lights = lights; // virtual lights to flash
    this.t = 0;
  }
  trigger() {
    if (this.triggered) return;
    this.triggered = true;
    const g = this.game;
    const b = this.box;
    this.snd = g.audio.loop('carAlarm', { pos: new THREE.Vector3((b[0] + b[3]) / 2, b[1] + 1, (b[2] + b[5]) / 2), vol: 1 });
    g.director?.panic('carAlarm', { waves: 2 });
    g.onCarAlarm?.(this);
  }
  update(dt) {
    if (!this.triggered) {
      // bumping into the car triggers it
      for (const s of this.game.survivors) {
        if (s.dead) continue;
        const b = this.box;
        if (s.pos.x > b[0] - 0.45 && s.pos.x < b[3] + 0.45 && s.pos.z > b[2] - 0.45 && s.pos.z < b[5] + 0.45 && s.pos.y < b[4] + 0.2) {
          if (s.pos.y > b[4] - 0.2 || Math.hypot(s.phys.vx, s.phys.vz) > 3) this.trigger();
        }
      }
      return;
    }
    this.t += dt;
    const on = Math.floor(this.t * 2.5) % 2 === 0 && this.t < 30;
    for (const L of this.lights) L.on = on;
    if (this.t > 30 && this.snd) { this.snd.stop(1); this.snd = null; }
  }
}

// ------------------------------------------------------- MovingPlatform --
// A solid box that travels between two points (elevators, scissor lifts,
// drawbridges). Survivors standing on it are carried (collision groundDyn.vel).
// The visual `obj` (any Object3D) is moved with it. min/max are the collider
// extents at the start position.
export class MovingPlatform {
  constructor(level, obj, min, max, opts = {}) {
    this.level = level;
    this.game = level.game;
    this.obj = obj;
    if (obj) level.addObject(obj);
    this.base = obj ? obj.position.clone() : new THREE.Vector3();
    this.col = level.col.addDynamic(min, max, { flags: F_DEFAULT, surf: opts.surf ?? 'metal', owner: this });
    this.min0 = [...min];
    this.max0 = [...max];
    this.offset = new THREE.Vector3();
    this.from = new THREE.Vector3();
    this.to = new THREE.Vector3(...(opts.to || [0, 0, 0])); // target offset
    this.duration = opts.duration ?? 10;
    this.t = 0;
    this.moving = false;
    this.done = false;
    this.onArrive = opts.onArrive || null;
    this.onUpdate = opts.onUpdate || null;
    this.sound = opts.sound || null;
    this.snd = null;
    this.pauses = opts.pauses || []; // [{at: 0..1, dur}] stop points
    this.pauseT = 0;
    this.extra = []; // extra colliders moving with the platform {d, min, max}
    level.dynamics.push(this);
  }
  attachCollider(min, max, opts = {}) {
    const d = this.level.col.addDynamic(min, max, { flags: opts.flags ?? F_DEFAULT, surf: opts.surf ?? 'metal', owner: this });
    this.extra.push({ d, min: [...min], max: [...max] });
    return d;
  }
  start(duration) {
    if (duration) this.duration = duration;
    this.from.copy(this.offset);
    this.t = 0;
    this.moving = true;
    this.done = false;
    if (this.sound && !this.snd) this.snd = this.game.audio.loop(this.sound, { pos: this.center(), vol: 1 });
  }
  moveTo(offset, duration) {
    this.to.set(offset[0], offset[1], offset[2]);
    this.start(duration);
  }
  center(out = new THREE.Vector3()) {
    return out.set((this.col.min[0] + this.col.max[0]) / 2, this.col.max[1], (this.col.min[2] + this.col.max[2]) / 2);
  }
  // Is a survivor/agent standing on or inside the platform footprint?
  contains(p, pad = 0.1) {
    return p.x > this.col.min[0] - pad && p.x < this.col.max[0] + pad && p.z > this.col.min[2] - pad && p.z < this.col.max[2] + pad && p.y > this.col.max[1] - 0.6 && p.y < this.col.max[1] + 2.5;
  }
  apply() {
    const o = this.offset;
    for (let i = 0; i < 3; i++) { this.col.min[i] = this.min0[i] + o.getComponent(i); this.col.max[i] = this.max0[i] + o.getComponent(i); }
    for (const e of this.extra) for (let i = 0; i < 3; i++) { e.d.min[i] = e.min[i] + o.getComponent(i); e.d.max[i] = e.max[i] + o.getComponent(i); }
    if (this.obj) this.obj.position.copy(this.base).add(o);
  }
  update(dt) {
    const v = this.col.vel;
    if (!this.moving) { v[0] = v[1] = v[2] = 0; for (const e of this.extra) e.d.vel = v; return; }
    if (this.pauseT > 0) { this.pauseT -= dt; v[0] = v[1] = v[2] = 0; return; }
    const prevK = this.t / this.duration;
    this.t = Math.min(this.duration, this.t + dt);
    const k = this.t / this.duration;
    for (const p of this.pauses) if (!p.hit && prevK < p.at && k >= p.at) { p.hit = true; this.pauseT = p.dur; p.onPause?.(); }
    const prev = this.offset.clone();
    this.offset.lerpVectors(this.from, this.to, k);
    this.apply();
    v[0] = (this.offset.x - prev.x) / dt; v[1] = (this.offset.y - prev.y) / dt; v[2] = (this.offset.z - prev.z) / dt;
    for (const e of this.extra) e.d.vel = v;
    this.onUpdate?.(k, dt);
    if (this.snd) this.snd.set({ pos: this.center() });
    if (k >= 1) {
      this.moving = false;
      this.done = true;
      v[0] = v[1] = v[2] = 0;
      if (this.snd) { this.snd.stop(0.5); this.snd = null; }
      this.onArrive?.();
    }
  }
}
