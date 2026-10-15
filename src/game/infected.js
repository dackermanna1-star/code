// Infected base class (nav-constrained movement, hitboxes, damage, gore) and Common Infected.
import * as THREE from 'three';
import { COMMON, DIFFICULTY, HITGROUP, U } from './config.js';
import { PoseAnimator, B } from './rig.js';
import { buildCommonModel } from './characters.js';
import * as A from './anim.js';
import { LINK } from '../engine/nav.js';

const _v = new THREE.Vector3(), _v2 = new THREE.Vector3(), _v3 = new THREE.Vector3();
const _a = new THREE.Vector3(), _b = new THREE.Vector3();
let NEXT_ID = 1;

// closest approach between ray (o + t d) and segment [a,b]; returns {t, dist2} or null
function raySegment(o, d, a, b, out) {
  const ux = d.x, uy = d.y, uz = d.z;
  const vx = b.x - a.x, vy = b.y - a.y, vz = b.z - a.z;
  const wx = o.x - a.x, wy = o.y - a.y, wz = o.z - a.z;
  const A_ = ux * ux + uy * uy + uz * uz, B_ = ux * vx + uy * vy + uz * vz, C_ = vx * vx + vy * vy + vz * vz;
  const D_ = ux * wx + uy * wy + uz * wz, E_ = vx * wx + vy * wy + vz * wz;
  const den = A_ * C_ - B_ * B_;
  let s, t;
  if (den < 1e-8) { s = 0; t = C_ > 0 ? E_ / C_ : 0; }
  else { s = (B_ * E_ - C_ * D_) / den; t = (A_ * E_ - B_ * D_) / den; }
  t = Math.max(0, Math.min(1, t));
  s = (B_ * t - D_) / A_;
  if (s < 0) s = 0;
  const px = o.x + ux * s - (a.x + vx * t), py = o.y + uy * s - (a.y + vy * t), pz = o.z + uz * s - (a.z + vz * t);
  out.t = s; out.d2 = px * px + py * py + pz * pz;
  return out;
}
const _rs = { t: 0, d2: 0 };

export class Infected {
  constructor(world, opts = {}) {
    this.world = world;
    this.id = NEXT_ID++;
    this.type = opts.type || 'common';
    this.position = new THREE.Vector3();
    this.vel = new THREE.Vector3();
    this.yaw = Math.random() * Math.PI * 2;
    this.health = opts.health || 50; this.maxHealth = this.health;
    this.alive = true;
    this.radius = opts.radius || COMMON.radius;
    this.height = opts.height || 1.8;
    this.node = -1;
    this.state = 'idle'; this.stateT = 0;
    this.t = Math.random() * 10;
    this.phase = Math.random() * 6;
    this.burning = 0; this.fireproof = false;
    this.stagger = 0; this.staggerDir = new THREE.Vector3();
    this.biled = 0;
    this.target = null;
    this.speedMul = 1;
    this.lastSeen = -99;
    this.removeT = 0;
    this.hitboxFrame = -1;
    this.hb = null;
    this.climb = null;
    this.deathT = 0; this.deathDir = 1;
    this.corpseVel = new THREE.Vector3();
    this.flinchT = 0;
    this.yOffset = 0;
    this.groundY = 0;
  }

  get isInfected() { return true; }
  center(out = new THREE.Vector3()) { return out.set(this.position.x, this.position.y + this.height * 0.55, this.position.z); }
  headPos(out = new THREE.Vector3()) {
    this.updateHitboxes();
    return out.copy(this.hb.head);
  }

  attachRig(rig) {
    this.rig = rig;
    this.anim = new PoseAnimator(rig);
    rig.mesh.userData.entity = this;
    this.world.scene.add(rig.mesh);
    this.scale = rig.mesh.userData.bindScale || 1;
  }

  place(pos, node = -1) {
    this.position.copy(pos);
    this.node = node >= 0 ? node : this.world.nav.nearest(pos.x, pos.y, pos.z, 3);
    if (this.node >= 0) this.position.y = this.world.nav.y[this.node];
    this.groundY = this.position.y;
    this.rig.mesh.position.copy(this.position);
  }

  // ------------------------------------------------------------ hitboxes
  updateHitboxes() {
    const w = this.world;
    if (this.hitboxFrame === w.frame && this.hb) return this.hb;
    this.hitboxFrame = w.frame;
    const m = this.rig.mesh;
    m.position.copy(this.position); m.position.y += this.yOffset;
    m.rotation.y = this.yaw;
    m.updateMatrixWorld(true);
    const bones = this.rig.bones, s = this.scale;
    const P = (name, out) => bones[B[name]].getWorldPosition(out);
    if (!this.hb) {
      this.hb = { head: new THREE.Vector3(), neck: new THREE.Vector3(), chest: new THREE.Vector3(), hips: new THREE.Vector3(), spine: new THREE.Vector3(),
        armL: [new THREE.Vector3(), new THREE.Vector3()], armR: [new THREE.Vector3(), new THREE.Vector3()], legL: [new THREE.Vector3(), new THREE.Vector3()], legR: [new THREE.Vector3(), new THREE.Vector3()] };
    }
    const hb = this.hb;
    P('head', hb.head);
    // head centre is above the head bone along the neck direction
    P('neck', hb.neck);
    hb.head.sub(hb.neck).multiplyScalar(2.4).add(hb.neck);
    P('chest', hb.chest); P('hips', hb.hips); P('spine', hb.spine);
    P('upperArmL', hb.armL[0]); P('handL', hb.armL[1]);
    P('upperArmR', hb.armR[0]); P('handR', hb.armR[1]);
    P('thighL', hb.legL[0]); P('footL', hb.legL[1]);
    P('thighR', hb.legR[0]); P('footR', hb.legR[1]);
    this.hbR = (this.bodyRadius || 0.17) * s;
    this.headR = (this.headRadius || 0.14) * s;
    return hb;
  }

  /** Ray test against hitboxes. Returns {t, group} or null. */
  rayTest(o, d, maxT) {
    // broadphase
    const cx = this.position.x - o.x, cy = this.position.y + this.height * 0.5 - o.y, cz = this.position.z - o.z;
    const tc = cx * d.x + cy * d.y + cz * d.z;
    if (tc < -1.5 || tc > maxT + 1.5) return null;
    const br = this.height * 0.75 + 0.6;
    const px = cx - d.x * tc, py = cy - d.y * tc, pz = cz - d.z * tc;
    if (px * px + py * py + pz * pz > br * br) return null;
    const hb = this.updateHitboxes();
    let best = null;
    const test = (a, b, r, group) => {
      raySegment(o, d, a, b, _rs);
      if (_rs.d2 < r * r) {
        const t = _rs.t - Math.sqrt(r * r - _rs.d2);
        if (t >= 0 && t <= maxT && (!best || t < best.t)) best = { t, group };
      }
    };
    test(hb.head, hb.head, this.headR, 'head');
    if (!this.headless || true) test(hb.chest, hb.neck, this.hbR, 'chest');
    test(hb.hips, hb.chest, this.hbR * 1.05, 'stomach');
    if (!this.lostArmL) test(hb.armL[0], hb.armL[1], 0.065 * this.scale * (this.armRadiusMul || 1), 'arm');
    if (!this.lostArmR) test(hb.armR[0], hb.armR[1], 0.065 * this.scale * (this.armRadiusMul || 1), 'arm');
    test(hb.legL[0], hb.legL[1], 0.085 * this.scale, 'leg');
    test(hb.legR[0], hb.legR[1], 0.085 * this.scale, 'leg');
    if (best) best.limb = best.group === 'arm' || best.group === 'leg' ? this._limbSide(o, d, best) : null;
    return best;
  }
  _limbSide(o, d, best) {
    const p = _v.copy(o).addScaledVector(d, best.t);
    const hb = this.hb;
    if (best.group === 'arm') return p.distanceToSquared(hb.armL[1]) + p.distanceToSquared(hb.armL[0]) < p.distanceToSquared(hb.armR[1]) + p.distanceToSquared(hb.armR[0]) ? 'L' : 'R';
    return p.distanceToSquared(hb.legL[1]) + p.distanceToSquared(hb.legL[0]) < p.distanceToSquared(hb.legR[1]) + p.distanceToSquared(hb.legR[0]) ? 'L' : 'R';
  }

  // ------------------------------------------------------------ damage
  /** info: {attacker, group, dir, weapon, special, type: 'bullet'|'melee'|'fire'|'explosion'|'shove', point} */
  takeDamage(amount, info = {}) {
    if (!this.alive) return 0;
    const w = this.world;
    this.lastDamage = info;
    if (info.attacker && info.attacker.isSurvivor) { this.lastAttacker = info.attacker; this.onAttacked(info.attacker); }
    const before = this.health;
    this.health -= amount;
    this.flinchT = 0.15;
    if (this.health <= 0) { this.health = 0; this.die(info); }
    return Math.min(before, amount);
  }
  onAttacked(attacker) { }
  takeMelee(attacker, def, dir) {
    const dmg = this.meleeDamage(def);
    this.takeDamage(dmg, { attacker, type: 'melee', dir, weapon: def, group: Math.random() < 0.3 ? 'head' : 'chest', slash: def.type === 'slash' });
    this.world.effects.blood(this.center(_v), dir, 1.2);
    if (this.alive) this.takeShove(attacker, dir, true);
  }
  meleeDamage(def) { return def.chainsaw ? def.dmg : this.maxHealth; }
  takeShove(attacker, dir, fromMelee = false) {
    if (!this.alive) return false;
    this.stagger = 1.25 * (this.staggerMul || 1);
    this.staggerDir.copy(dir);
    this.vel.set(dir.x * 3.5, 0, dir.z * 3.5);
    this.setState('stagger');
    return true;
  }
  ignite(by) {
    if (this.fireproof || !this.alive) return;
    if (this.burning <= 0) this.world.sound('zombie_burning', this.position, { volume: 0.7 });
    this.burning = 30;
    this.burnBy = by;
  }
  setState(s) { this.state = s; this.stateT = 0; }

  die(info) {
    if (!this.alive) return;
    this.alive = false;
    this.setState('dead');
    const w = this.world;
    this.deathT = 0;
    const d = info.dir || _v.set(Math.sin(this.yaw), 0, Math.cos(this.yaw)).negate();
    // fall away from the damage direction
    const fwd = _v2.set(Math.sin(this.yaw), 0, Math.cos(this.yaw));
    this.deathDir = fwd.dot(d) > 0 ? -1 : 1;
    const push = info.type === 'explosion' ? 7 : info.weapon && info.weapon.kind === 'shotgun' && info.close ? 4.5 : info.type === 'melee' && info.weapon && info.weapon.type === 'club' ? 4 : 1.2;
    this.corpseVel.set(d.x * push, 0, d.z * push);
    if (this.rig) this.rig.mesh.rotation.y = this.yaw;
    w.onInfectedKilled(this, info);
  }

  // ------------------------------------------------------------ movement helpers
  /** Move along the nav graph towards descending field values. Returns true if moving. */
  followField(dt, field, speed) {
    const nav = this.world.nav;
    if (this.node < 0) { this.node = nav.nearest(this.position.x, this.position.y, this.position.z, 4); if (this.node < 0) return false; }
    if (this.climb) return this.updateClimb(dt);
    const u = this.node;
    let next = nav.downhill(u, field, true, 1);
    if (next < 0) return false;
    const type = this.linkType(u, next);
    if (type === LINK.CLIMB || (type === LINK.DROP && nav.y[u] - nav.y[next] > 0.9)) { this.startClimb(u, next, type); return true; }
    // lookahead for smoother paths
    let aim = next;
    const n2 = nav.downhill(next, field, true, 1);
    if (n2 >= 0 && this.linkType(next, n2) === LINK.WALK) {
      const n3 = nav.downhill(n2, field, true, 1);
      aim = n3 >= 0 && this.linkType(n2, n3) === LINK.WALK ? n3 : n2;
    }
    const tx = nav.x[aim], tz = nav.z[aim];
    return this.steerTo(tx, tz, speed, dt);
  }
  linkType(u, v) {
    const nav = this.world.nav;
    for (let d = 0; d < 8; d++) if (nav.link[u * 8 + d] === v) return nav.ltype[u * 8 + d];
    return 0;
  }
  steerTo(tx, tz, speed, dt, accel = 14) {
    const dx = tx - this.position.x, dz = tz - this.position.z;
    const dist = Math.hypot(dx, dz);
    if (dist < 0.05) { this.vel.x *= 0.8; this.vel.z *= 0.8; return false; }
    const vx = dx / dist * speed, vz = dz / dist * speed;
    const k = Math.min(1, accel * dt);
    this.vel.x += (vx - this.vel.x) * k; this.vel.z += (vz - this.vel.z) * k;
    this.faceTo(dx, dz, dt, 10);
    return true;
  }
  faceTo(dx, dz, dt, rate = 8) {
    const target = Math.atan2(dx, dz);
    let diff = target - this.yaw;
    diff = Math.atan2(Math.sin(diff), Math.cos(diff));
    this.yaw += diff * Math.min(1, rate * dt);
  }
  startClimb(u, v, type) {
    const nav = this.world.nav;
    const dy = nav.y[v] - nav.y[u];
    this.climb = { from: u, to: v, t: 0, dur: type === LINK.CLIMB ? 0.35 + dy * 0.28 : 0.25 + Math.sqrt(Math.max(0, -dy) / 10), type, sx: this.position.x, sz: this.position.z, sy: this.position.y };
    this.vel.set(0, 0, 0);
    this.faceTo(nav.x[v] - this.position.x, nav.z[v] - this.position.z, 1, 100);
    if (type === LINK.CLIMB && Math.random() < 0.3) this.world.sound('zombie_climb', this.position, { volume: 0.5 });
  }
  updateClimb(dt) {
    const nav = this.world.nav, c = this.climb;
    c.t += dt / c.dur;
    const k = Math.min(1, c.t);
    const tx = nav.x[c.to], ty = nav.y[c.to], tz = nav.z[c.to];
    if (c.type === LINK.CLIMB) {
      // up first, then over
      const ky = Math.min(1, k / 0.7), kx = Math.max(0, (k - 0.55) / 0.45);
      this.position.y = c.sy + (ty - c.sy) * ky;
      this.position.x = c.sx + (tx - c.sx) * kx; this.position.z = c.sz + (tz - c.sz) * kx;
    } else {
      const kx = Math.min(1, k * 1.6);
      this.position.x = c.sx + (tx - c.sx) * kx; this.position.z = c.sz + (tz - c.sz) * kx;
      this.position.y = c.sy + (ty - c.sy) * k * k;
    }
    this.groundY = this.position.y;
    if (k >= 1) { this.node = c.to; this.climb = null; this.position.y = ty; }
    return true;
  }
  /** Integrate velocity, constrained to the nav graph. */
  integrate(dt) {
    if (this.climb) return;
    const nav = this.world.nav;
    const px = this.position.x, pz = this.position.z;
    let nx = px + this.vel.x * dt, nz = pz + this.vel.z * dt;
    // door blocking
    const door = this.world.doorBlocking(this, nx, nz);
    if (door) { this.blockedByDoor = door; this.vel.x *= 0.2; this.vel.z *= 0.2; return; }
    this.blockedByDoor = null;
    let n = this.resolveNode(nx, nz);
    if (n < 0) {
      // try sliding along axes
      n = this.resolveNode(nx, pz);
      if (n >= 0) { nz = pz; this.vel.z = 0; }
      else { n = this.resolveNode(px, nz); if (n >= 0) { nx = px; this.vel.x = 0; } }
    }
    if (n < 0) { this.vel.x *= 0.5; this.vel.z *= 0.5; return; }
    this.position.x = nx; this.position.z = nz;
    this.node = n;
    const ty = nav.y[n];
    const dy = ty - this.position.y;
    if (dy < -0.6) {
      // walked off something: fall
      this.position.y += Math.max(dy, -9 * dt * (1 + this.stateT));
    } else this.position.y += dy * Math.min(1, dt * 14);
    this.groundY = this.position.y;
  }
  resolveNode(x, z) {
    const nav = this.world.nav, u = this.node;
    if (u < 0) return nav.nearest(x, this.position.y, z, 2);
    const cs = nav.cs;
    const i = Math.floor((x - nav.minX) / cs), k = Math.floor((z - nav.minZ) / cs);
    const c = i + k * nav.nx;
    if (nav.col[u] === c) return u;
    // a node linked from u lying in column c?
    for (let d = 0; d < 8; d++) {
      const v = nav.link[u * 8 + d];
      if (v >= 0 && nav.col[v] === c && (nav.ltype[u * 8 + d] === LINK.WALK)) return v;
    }
    // two steps away (fast movement)
    if (Math.abs(nav.col[u] % nav.nx - i) <= 2 && Math.abs(((nav.col[u] / nav.nx) | 0) - k) <= 2) {
      for (let d = 0; d < 8; d++) {
        const v = nav.link[u * 8 + d]; if (v < 0 || nav.ltype[u * 8 + d] !== LINK.WALK) continue;
        for (let e = 0; e < 8; e++) { const w2 = nav.link[v * 8 + e]; if (w2 >= 0 && nav.col[w2] === c && nav.ltype[v * 8 + e] === LINK.WALK) return w2; }
      }
    }
    return -1;
  }

  // ------------------------------------------------------------ perception
  canSee(s, maxDist = 60) {
    const e = s.eyePos ? s.eyePos(_a) : _a.copy(s.position).setY(s.position.y + 1.5);
    const me = _b.set(this.position.x, this.position.y + this.height * 0.9, this.position.z);
    if (me.distanceToSquared(e) > maxDist * maxDist) return false;
    return !this.world.collision.blocked(me, e);
  }
  nearestSurvivor(maxDist = 999, needAlive = true) {
    let best = null, bd = maxDist * maxDist;
    for (const s of this.world.survivors) {
      if (needAlive && s.state === 'dead') continue;
      if (s.inSaferoom && this.world.saferoomLocked) continue;
      const d = s.body.pos.distanceToSquared(this.position);
      if (d < bd) { bd = d; best = s; }
    }
    return best;
  }

  // ------------------------------------------------------------ corpse
  updateCorpse(dt) {
    this.deathT += dt;
    if (this.corpseVel.lengthSq() > 0.01) {
      const nx = this.position.x + this.corpseVel.x * dt, nz = this.position.z + this.corpseVel.z * dt;
      const n = this.resolveNode(nx, nz);
      if (n >= 0) { this.position.x = nx; this.position.z = nz; this.node = n; this.position.y += (this.world.nav.y[n] - this.position.y) * Math.min(1, dt * 10); }
      else this.corpseVel.multiplyScalar(0.3);
      this.corpseVel.multiplyScalar(Math.max(0, 1 - dt * 4));
    } else if (this.node >= 0 && this.position.y > this.world.nav.y[this.node] + 0.05) {
      this.position.y = Math.max(this.world.nav.y[this.node], this.position.y - 9 * dt);
    }
    if (this.anim && this.deathT < 1.2) {
      A.poseDeath(this.anim, this.deathDir, Math.min(1, this.deathT * 1.7), this.id % 3);
      this.anim.apply(dt, 18);
    }
    if (this.rig) { this.rig.mesh.position.copy(this.position); }
  }

  updateModelCommon(dt) {
    const m = this.rig.mesh;
    m.position.set(this.position.x, this.position.y + this.yOffset, this.position.z);
    m.rotation.y = this.yaw;
    const w = this.world;
    // animation LOD by distance to camera
    const dc = w.camPos ? this.position.distanceTo(w.camPos) : 0;
    this.anim.stepRate = dc > 35 ? 8 : dc > 18 ? 15 : 0;
    m.visible = dc < w.drawDistance;
    if (w.probeAt && ((w.frame + this.id) % 6 === 0)) this.rig.material.uniforms.uAmbient.value.copy(w.probeAt(this.position, _tmpC));
    const fl = this.rig.material.uniforms.uFlash;
    fl.value = Math.max(0, this.flinchT * 2.5) * 0.5;
    if (this.burning > 0) { fl.value = 0.25 + Math.random() * 0.15; this.rig.material.uniforms.uFlashColor.value.setRGB(1, 0.5, 0.1); }
    else this.rig.material.uniforms.uFlashColor.value.setRGB(1, 0.3, 0.2);
  }

  remove() {
    if (this.rig) this.world.scene.remove(this.rig.mesh);
    this.removed = true;
  }
}
const _tmpC = new THREE.Color();

// ===================================================================== Common Infected
const IDLE_KINDS = ['stand', 'stand', 'stand', 'sit', 'lie', 'lean', 'vomit', 'wander'];

export class Common extends Infected {
  constructor(world, opts = {}) {
    const variant = opts.variant || 'civilian';
    const diff = DIFFICULTY[world.difficulty];
    super(world, { type: 'common', health: variant === 'hazmat' ? diff.hazmatHp : 50, radius: COMMON.radius });
    this.variant = variant;
    this.fireproof = variant === 'hazmat';
    this.seed = opts.seed || ((Math.random() * 1e9) | 0);
    this.attachRig(buildCommonModel(this.seed, variant));
    this.style = this.seed % 3;
    this.idleKind = opts.idle || IDLE_KINDS[this.seed % IDLE_KINDS.length];
    this.speed = COMMON.runSpeed * (0.92 + (this.seed % 17) / 100);
    this.attackT = 0; this.attackCd = Math.random() * 0.5; this.attackSide = 1;
    this.perceiveT = Math.random() * 0.3;
    this.alertT = 0;
    this.mob = !!opts.mob;
    this.lure = null;
    this.carriesBile = variant === 'hazmat' && Math.random() < 0.35;
    this.groanT = 2 + Math.random() * 8;
    if (opts.mob) { this.setState('chase'); }
    else this.setState('idle');
  }

  onAttacked(attacker) {
    if (this.state === 'idle' || this.state === 'alert' || this.state === 'wander') { this.target = attacker; this.setState('chase'); }
  }
  alert(source) {
    if (!this.alive) return;
    if (this.state === 'idle' || this.state === 'wander') { this.setState('alert'); this.alertT = 0.25 + Math.random() * 0.6; this.alertSource = source ? source.clone() : null; }
  }

  update(dt) {
    if (!this.alive) { this.updateCorpse(dt); return; }
    const w = this.world;
    this.t += dt; this.stateT += dt;
    this.flinchT = Math.max(0, this.flinchT - dt);
    this.attackCd = Math.max(0, this.attackCd - dt);
    if (this.burning > 0) {
      this.burning -= dt;
      this.takeDamage(28 * dt, { type: 'fire', attacker: this.burnBy });
      if (!this.alive) return;
      if (Math.random() < dt * 8) w.effects.fireSprite(this.position.x + (Math.random() - 0.5) * 0.4, this.position.y + 0.6 + Math.random() * 1.0, this.position.z + (Math.random() - 0.5) * 0.4, 0.35, 0.6, { life: 0.4 });
    }
    // groans
    this.groanT -= dt;
    if (this.groanT <= 0) {
      this.groanT = 3 + Math.random() * 7;
      const dcam = w.camPos ? this.position.distanceToSquared(w.camPos) : 0;
      if (dcam < 900) w.sound(this.state === 'chase' ? 'zombie_rage' : 'zombie_idle', this.position, { volume: 0.55, randomPitch: 0.15, priority: 0 });
    }
    switch (this.state) {
      case 'idle': case 'wander': this.updateIdle(dt); break;
      case 'alert': this.updateAlert(dt); break;
      case 'chase': this.updateChase(dt); break;
      case 'attack': this.updateAttack(dt); break;
      case 'stagger': this.updateStagger(dt); break;
      case 'lured': this.updateLured(dt); break;
    }
    if (this.state !== 'attack') this.integrate(dt);
    this.animate(dt);
  }

  perceive(dt) {
    this.perceiveT -= dt;
    if (this.perceiveT > 0) return;
    this.perceiveT = 0.25 + Math.random() * 0.15;
    const w = this.world;
    for (const s of w.survivors) {
      if (s.state === 'dead') continue;
      const d = s.body.pos.distanceTo(this.position);
      if (d > 40) continue;
      // near: always notice; otherwise need view cone + LOS
      const dx = s.body.pos.x - this.position.x, dz = s.body.pos.z - this.position.z;
      const facing = (Math.sin(this.yaw) * dx + Math.cos(this.yaw) * dz) / Math.max(d, 0.01);
      const near = d < 200 * U * 1.5;
      const asleep = this.idleKind === 'lie' || this.idleKind === 'sit';
      const range = asleep ? 8 : 25;
      if (near || (d < range && facing > (asleep ? -1 : 0.3))) {
        if (this.canSee(s, range + 2)) { this.target = s; this.alert(s.body.pos); return; }
      }
      // flashlight in face
      if (s.flashlight && d < 15) {
        const ad = s.aimDir(_v3);
        const toMe = _v.set(this.position.x - s.body.pos.x, this.position.y + 1.4 - s.eyePos(_v2).y, this.position.z - s.body.pos.z).normalize();
        if (ad.dot(toMe) > 0.95 && this.canSee(s, 16)) { this.target = s; this.alert(s.body.pos); return; }
      }
      // running survivors are heard
      if (d < 500 * U && Math.hypot(s.body.vel.x, s.body.vel.z) > 4 && !s.crouching) { this.target = s; this.alert(s.body.pos); return; }
    }
  }

  updateIdle(dt) {
    this.perceive(dt);
    this.vel.x *= 0.85; this.vel.z *= 0.85;
    if (this.idleKind === 'wander') {
      // amble to random neighbouring nodes
      if (!this.wanderTarget || this.stateT > 6) {
        const nav = this.world.nav;
        let n = this.node;
        for (let i = 0; i < 6 && n >= 0; i++) { const d = (Math.random() * 8) | 0; const v = nav.link[n * 8 + d]; if (v >= 0 && nav.ltype[n * 8 + d] === LINK.WALK) n = v; }
        this.wanderTarget = n; this.stateT = 0;
      }
      if (this.wanderTarget >= 0) {
        const nav = this.world.nav;
        this.steerTo(nav.x[this.wanderTarget], nav.z[this.wanderTarget], COMMON.walkSpeed * 0.5, dt, 3);
      }
    }
  }
  updateAlert(dt) {
    this.alertT -= dt;
    this.vel.x *= 0.7; this.vel.z *= 0.7;
    if (this.alertSource) this.faceTo(this.alertSource.x - this.position.x, this.alertSource.z - this.position.z, dt, 6);
    if (this.alertT <= 0) {
      this.setState('chase');
      if (Math.random() < 0.6) this.world.sound('zombie_alert', this.position, { volume: 0.8, randomPitch: 0.15 });
    }
  }
  updateChase(dt) {
    const w = this.world;
    if (this.lure && this.lure.active) { this.setState('lured'); return; }
    // pick nearest reachable survivor as target
    if (!this.target || this.target.state === 'dead' || (this.stateT > 2 && Math.random() < dt)) this.target = w.pickTargetFor(this);
    const tgt = this.target;
    if (!tgt) { this.vel.multiplyScalar(0.9); return; }
    const tp = tgt.isSurvivor ? tgt.body.pos : tgt.position;
    const dx = tp.x - this.position.x, dz = tp.z - this.position.z, dy = tp.y - this.position.y;
    const dist = Math.hypot(dx, dz);
    if (this.blockedByDoor) { this.attackDoor(dt, this.blockedByDoor); return; }
    if (dist < COMMON.attackRangeRun && Math.abs(dy) < 1.2) {
      this.setState('attack');
      this.attackT = 0;
      return;
    }
    // can't reach anybody for a while: give up and mill about (unreachable infected flail, then calm down)
    if (this.node >= 0 && w.fieldAll[this.node] === Infinity && dist > 3) { this.unreachT = (this.unreachT || 0) + dt; if (this.unreachT > 6) { this.unreachT = 0; this.target = null; this.idleKind = 'wander'; this.setState('idle'); return; } } else this.unreachT = 0;
    // remember whether we can actually see our target (used by the Director's intensity model)
    this.seeT = (this.seeT || 0) - dt;
    if (this.seeT <= 0) { this.seeT = 0.5; this.seesTarget = dist < 25 && this.canSee(tgt, 25); }
    const spd = this.speed * (this.burning > 0 ? 1.05 : 1) * this.speedMul;
    // direct approach when close with clear line
    if (dist < 4 && Math.abs(dy) < 0.8 && (this.world.frame + this.id) % 4 !== 0 ? this.directOk : (this.directOk = dist < 4 && Math.abs(dy) < 0.8 && w.nav.walkable(this.position.x, this.position.y, this.position.z, tp.x, tp.y, tp.z))) {
      this.steerTo(tp.x, tp.z, spd, dt);
    } else {
      const field = tgt.isSurvivor ? w.fieldFor(tgt) : w.fieldAll;
      if (!this.followField(dt, field, spd)) {
        // no path: flail in place, drift towards target
        this.steerTo(tp.x, tp.z, spd * 0.3, dt);
      }
    }
  }
  updateLured(dt) {
    const L = this.lure;
    if (!L || !L.active) { this.lure = null; this.setState('chase'); return; }
    const d = Math.hypot(L.pos.x - this.position.x, L.pos.z - this.position.z);
    if (d < 1.2) { this.vel.multiplyScalar(0.8); this.faceTo(L.pos.x - this.position.x, L.pos.z - this.position.z, dt); this.attackLure = true; if (this.attackCd <= 0) { this.attackCd = 1; this.attackT = 0.01; } if (this.attackT > 0) this.attackT += dt * 1.4; if (this.attackT > 1) this.attackT = 0; return; }
    if (!this.followField(dt, L.field, this.speed)) this.steerTo(L.pos.x, L.pos.z, this.speed, dt);
  }
  attackDoor(dt, door) {
    this.vel.x *= 0.5; this.vel.z *= 0.5;
    this.faceTo(door.center.x - this.position.x, door.center.z - this.position.z, dt);
    if (this.attackCd <= 0) {
      this.attackCd = COMMON.attackInterval; this.attackT = 0.01; this.attackSide = -this.attackSide;
      door.damage(COMMON.doorDamage * 0.5, this);
    }
    if (this.attackT > 0) { this.attackT += dt * 1.6; if (this.attackT >= 1) this.attackT = 0; }
  }
  updateAttack(dt) {
    const w = this.world, tgt = this.target;
    this.vel.x *= 0.6; this.vel.z *= 0.6;
    if (!tgt || tgt.state === 'dead' || (tgt.alive === false)) { this.setState('chase'); this.attackT = 0; return; }
    const tp = tgt.isSurvivor ? tgt.body.pos : tgt.position;
    const dx = tp.x - this.position.x, dz = tp.z - this.position.z;
    const dist = Math.hypot(dx, dz);
    this.faceTo(dx, dz, dt, 12);
    // keep pressing in
    if (dist > COMMON.attackRange * 0.8) { this.vel.x = dx / dist * 2.5; this.vel.z = dz / dist * 2.5; this.integrate(dt); }
    if (this.attackT <= 0 && this.attackCd <= 0) {
      if (dist > COMMON.attackRangeRun + 0.3) { this.setState('chase'); return; }
      this.attackT = 0.001; this.attackSide = -this.attackSide;
      this.attackCd = COMMON.attackInterval * (0.85 + Math.random() * 0.3);
      this.hitDone = false;
    }
    if (this.attackT > 0) {
      this.attackT += dt * 1.7;
      if (!this.hitDone && this.attackT > 0.4) {
        this.hitDone = true;
        if (dist < COMMON.attackRangeRun && Math.abs(tp.y - this.position.y) < 1.3) {
          if (tgt.isSurvivor) w.commonHitsSurvivor(this, tgt);
          else if (tgt.takeDamage) { tgt.takeDamage(tgt.type === 'tank' || tgt.type === 'witch' ? 25 : 15, { attacker: this, type: 'claw' }); }
        }
      }
      if (this.attackT >= 1) this.attackT = 0;
    } else if (dist > COMMON.attackRangeRun + 0.2) this.setState('chase');
  }
  updateStagger(dt) {
    this.stagger -= dt;
    this.vel.x *= Math.max(0, 1 - dt * 3); this.vel.z *= Math.max(0, 1 - dt * 3);
    if (this.stagger <= 0) this.setState(this.target ? 'chase' : 'idle');
  }
  takeShove(attacker, dir, fromMelee) {
    if (!this.alive) return false;
    // a shove from behind on an unaware common kills it
    if (!fromMelee && (this.state === 'idle' || this.state === 'wander')) {
      const facing = Math.sin(this.yaw) * dir.x + Math.cos(this.yaw) * dir.z;
      if (facing > 0.5) { this.takeDamage(this.health, { attacker, type: 'shove', dir }); return true; }
    }
    this.target = attacker;
    super.takeShove(attacker, dir);
    this.attackT = 0;
    if (!fromMelee) this.takeDamage(this.maxHealth * 0.12, { attacker, type: 'shove', dir });
    return true;
  }

  takeDamage(amount, info = {}) {
    if (!this.alive) return 0;
    const w = this.world;
    if (info.type === 'fire' && this.fireproof) return 0;
    if (info.type === 'bullet') {
      if (info.group === 'head') amount = Math.max(amount, this.variant === 'hazmat' ? Math.max(amount * 4, 150) : this.health);
      else amount *= DIFFICULTY[w.difficulty].bodyFactor * (info.group === 'stomach' ? 1.25 : info.group === 'leg' ? 0.75 : 1);
    }
    if (this.state === 'idle' || this.state === 'wander' || this.state === 'alert') { if (info.attacker) this.target = info.attacker.isSurvivor ? info.attacker : this.target; if (info.type !== 'fire') this.setState('chase'); }
    // shotguns at close range knock commons down
    if (info.weapon && info.weapon.kind === 'shotgun' && info.close && this.health - amount > 0 && this.state !== 'stagger') {
      this.takeShove(info.attacker, info.dir || _v.set(0, 0, 1), true);
    }
    return super.takeDamage(amount, info);
  }

  die(info) {
    super.die(info);
    const w = this.world;
    this.gore(info);
    if (this.carriesBile && Math.random() < 0.8) w.spawnPickup('bilejar', this.position.clone().add(_v.set(0, 0.1, 0)));
    if (Math.random() < 0.5) w.sound('zombie_death', this.position, { volume: 0.7, randomPitch: 0.15 });
  }

  gore(info) {
    const w = this.world, an = this.anim;
    const dir = info.dir || _v.set(0, 0, 1);
    const hb = this.updateHitboxes();
    const strong = (info.damage || 0) >= 40 || (info.weapon && (info.weapon.kind === 'shotgun' || info.weapon.kind === 'sniper' || info.weapon.kind === 'rifle'));
    if (info.type === 'explosion') {
      // blown apart
      this.rig.mesh.visible = false; this.gibbed = true;
      const c = this.center(_v2);
      for (let i = 0; i < 8; i++) w.effects.gibs.spawn(i < 2 ? 'arm' : i < 4 ? 'leg' : i === 4 ? 'head' : 'chunk', c, new THREE.Vector3((Math.random() - 0.5) * 9, 3 + Math.random() * 6, (Math.random() - 0.5) * 9), { bleed: true, life: 15 });
      w.effects.blood(c, new THREE.Vector3(0, 1, 0), 3);
      w.sound('gib_splat', c);
      return;
    }
    const slash = info.slash || (info.weapon && info.weapon.type === 'slash');
    if (info.group === 'head' && (strong || slash || Math.random() < 0.45)) {
      an.scaleT[B.head] = 0.0001; this.headless = true;
      const hp = hb.head.clone();
      if (slash || Math.random() < 0.4) w.effects.gibs.spawn('head', hp, new THREE.Vector3(dir.x * 3 + (Math.random() - 0.5), 3, dir.z * 3 + (Math.random() - 0.5)), { bleed: true });
      else for (let i = 0; i < 4; i++) w.effects.gibs.spawn(i % 2 ? 'chunk' : 'bone', hp, new THREE.Vector3(dir.x * 3 + (Math.random() - 0.5) * 3, 2 + Math.random() * 3, dir.z * 3 + (Math.random() - 0.5) * 3), { bleed: true });
      w.effects.blood(hp, dir, 2);
      this.neckFountain = 1.6;
      w.sound('headshot', hp, { volume: 0.8 });
    } else if ((info.group === 'arm' || info.group === 'leg') && (strong || slash) && Math.random() < 0.6 && info.limb) {
      const bone = info.group === 'arm' ? 'upperArm' + info.limb : 'thigh' + info.limb;
      const cut = info.group === 'arm' ? (Math.random() < 0.5 ? 'forearm' + info.limb : bone) : (Math.random() < 0.5 ? 'shin' + info.limb : bone);
      an.scaleT[B[cut]] = 0.0001;
      if (info.group === 'arm') this['lostArm' + info.limb] = true;
      const p = (info.group === 'arm' ? hb['arm' + info.limb][0] : hb['leg' + info.limb][0]).clone();
      w.effects.gibs.spawn(info.group, p, new THREE.Vector3(dir.x * 3, 2, dir.z * 3), { bleed: true });
      w.effects.blood(p, dir, 1.5);
    } else if (info.weapon && info.weapon.kind === 'shotgun' && info.close && Math.random() < 0.5) {
      // chunks blown out of the torso
      const c = hb.chest.clone();
      for (let i = 0; i < 3; i++) w.effects.gibs.spawn(i ? 'chunk2' : 'bone', c, new THREE.Vector3(dir.x * 4 + (Math.random() - 0.5) * 2, 1 + Math.random() * 2, dir.z * 4 + (Math.random() - 0.5) * 2), { bleed: true });
      w.effects.blood(c, dir, 2);
    }
  }

  animate(dt) {
    const a = this.anim;
    const speed = Math.hypot(this.vel.x, this.vel.z);
    this.phase += speed * dt * 1.55;
    if (this.climb) A.poseClimb(a, this.climb.t, this.t);
    else {
      const idle = this.state === 'idle' || this.state === 'alert' ? (this.idleKind === 'wander' ? 'stand' : this.idleKind) : 'stand';
      A.poseZombie(a, { phase: this.phase, speed, t: this.t, style: this.style, attack: this.attackT, attackSide: this.attackSide, stagger: this.state === 'stagger' ? 1 - this.stagger / 1.25 : 0, burning: this.burning > 0, idle });
      if (this.state === 'alert' && (this.idleKind === 'sit' || this.idleKind === 'lie')) { a.rootRotT.x *= 0.3; a.rootOffT.y *= 0.5; }
      if (this.flinchT > 0) { a.add('spine', -0.35, 0, 0); a.add('head', -0.4, 0, 0); }
    }
    a.apply(dt, this.state === 'stagger' ? 20 : 14);
    this.updateModelCommon(dt);
  }
}
