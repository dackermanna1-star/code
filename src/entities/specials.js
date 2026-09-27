// Special infected: Hunter (pounce & pin), Smoker (tongue drag), Boomer
// (bile vomit & explosion), Tank (boss: punches, rock throws, hittables) and
// Witch (startle meter, instant incap). Each has its own rig/silhouette,
// audio tells and state machine built on the shared nav Agent.
import * as THREE from 'three';
import { Agent } from './agent.js';
import { Body, Ragdoll, J, PART, PROPS, animateHumanoid, poseLying } from './body.js';
import { buildHumanoid, RigModel } from './rig.js';
import { LINK_CLIMB, LINK_DROP } from '../world/nav.js';
import { clamp, damp, dampAngle, randRange, pick, wrapAngle } from '../core/math.js';
import { DF } from '../render/decals.js';

const _v = new THREE.Vector3(), _w = new THREE.Vector3();
const GRAV = 16;

function skinMat(color, rough = 0.65) {
  return new THREE.MeshStandardMaterial({ color, roughness: rough, metalness: 0 });
}

export class SpecialInfected extends Agent {
  constructor(mgr, kind, look, opts = {}) {
    super(mgr);
    this.kind = kind;
    this.special = true;
    this.body = new Body(opts.scale ?? 1, opts.build ?? 1);
    this.rig = new RigModel(mgr.game.scene, buildHumanoid(look), { name: kind });
    this.hp = this.maxHp = opts.hp ?? 250;
    this.speed = opts.speed ?? 5;
    this.height = opts.height ?? 1.75;
    this.radius = opts.radius ?? 0.35;
    this.hitScale = opts.hitScale ?? 1;
    this.headScale = opts.headScale ?? 1;
    this.torsoScale = opts.torsoScale ?? 1;
    this.state = 'stalk';
    this.stateT = 0;
    this.target = null;
    this.curSpeed = 0;
    this.anim = {};
    this.deadT = 0;
    this.removed = false;
    this.vocT = randRange(1, 3);
    this.pinning = null;
    this.shoveable = false;
    this.burning = 0;
    this.lastAttacker = null;
    this.explosiveMult = 1;
    this.stumble = null;
    this.thinkT = 0;
  }
  spawnAt(x, y, z) {
    this.placeAt(x, y, z);
    this.yaw = Math.random() * 6.28;
    this.animate(0.016);
    this.body.storePrev();
    return this;
  }
  get game() { return this.mgr.game; }
  set game(v) { /* Agent sets game */ }

  pickTarget() {
    let best = null, bd = 1e9;
    for (const s of this.mgr.targets) {
      if (s.pinned && s.pinned !== this) continue;
      let d = s.pos.distanceTo(this.pos);
      // prefer isolated survivors
      let mates = 0;
      for (const o of this.mgr.targets) if (o !== s && o.pos.distanceTo(s.pos) < 6) mates++;
      d *= 1 + mates * 0.15;
      if (s.incapped) d *= 1.8;
      if (d < bd) { bd = d; best = s; }
    }
    return best;
  }
  canSee(s, fromH = 1.5) {
    return this.game.level.col.lineOfSight(this.pos.x, this.pos.y + fromH, this.pos.z, s.pos.x, s.pos.y + 1.2, s.pos.z);
  }
  // Move towards target via flow field / direct line. Returns distance.
  chase(dt, speed, t = this.target) {
    if (!t) return 1e9;
    const dx = t.pos.x - this.pos.x, dz = t.pos.z - this.pos.z;
    const dist = Math.hypot(dx, dz);
    this.curSpeed = damp(this.curSpeed, speed, 5, dt);
    let mx = 0, mz = 0;
    const direct = dist < 10 && Math.abs(t.pos.y - this.pos.y) < 0.8 && this.mgr.directOK(this, t);
    if (direct) { mx = dx / (dist || 1); mz = dz / (dist || 1); }
    else {
      const ft = this.flowTarget(this.mgr.flowField(), 3);
      if (ft) {
        if (ft.link === LINK_CLIMB) { this.startClimb(ft.next); return dist; }
        if (ft.link === LINK_DROP) { this.startDrop(ft.next); return dist; }
        const ex = ft.x - this.pos.x, ez = ft.z - this.pos.z;
        const el = Math.hypot(ex, ez) || 1;
        mx = ex / el; mz = ez / el;
      } else if (dist < 40) { mx = dx / (dist || 1); mz = dz / (dist || 1); }
    }
    if (mx || mz) {
      this.yaw = dampAngle(this.yaw, Math.atan2(-mx, -mz), 8, dt);
      const moved = this.moveOnNav(mx * this.curSpeed * dt, mz * this.curSpeed * dt);
      if (!moved && this.blockedByDoor) this.blockedByDoor.damage(this.kind === 'tank' ? 999 : 30, this);
    }
    return dist;
  }
  // Move away from survivors (ascend flow field)
  retreat(dt, speed) {
    const nav = this.nav;
    const f = this.mgr.flowField();
    if (this.node < 0) return;
    let best = -1, bv = f[this.node];
    for (let d = 0; d < 8; d++) {
      const v = nav.links[this.node * 8 + d];
      if (v < 0 || nav.ltype[this.node * 8 + d] !== 0) continue;
      if (f[v] > bv && f[v] < 1e8) { bv = f[v]; best = v; }
    }
    this.curSpeed = damp(this.curSpeed, speed, 5, dt);
    if (best >= 0) {
      const ex = nav.nodeX(best) - this.pos.x, ez = nav.nodeZ(best) - this.pos.z;
      const el = Math.hypot(ex, ez) || 1;
      this.yaw = dampAngle(this.yaw, Math.atan2(-ex, -ez), 8, dt);
      this.moveOnNav(ex / el * this.curSpeed * dt, ez / el * this.curSpeed * dt);
    }
  }
  hearNoise() {}
  onShoved(s, fx, fz) {
    this.pushReaction(fx, fz, 2);
  }
  ignite(owner) {
    this.burning = 6;
    this.lastAttacker = owner || this.lastAttacker;
  }
  takeHit(h) {
    if (this.dead) {
      if (this.ragdoll) this.ragdoll.impulse(J.CHEST, h.dir.x * (h.knockback || 1) * 2, 1, h.dir.z * (h.knockback || 1) * 2);
      return;
    }
    let mult = h.zone === 'head' ? (this.headMult ?? 2) : h.zone === 'torso' ? 1 : 0.8;
    if (h.kind === 'melee') mult = this.meleeMult ?? 1;
    if (h.kind === 'explosion') mult = this.explosiveMult;
    const dmg = h.damage * mult;
    this.hp -= dmg;
    this.lastAttacker = h.attacker || this.lastAttacker;
    this.pushReaction(h.dir.x, h.dir.z, 0.5 + (h.knockback || 0) * 0.2);
    this.onDamaged?.(h, dmg);
    this.game.fx.blood(h.x, h.y, h.z, h.dir.x * 0.5, 0.2, h.dir.z * 0.5, 0.8);
    if (this.hp <= 0) this.die(h);
  }
  releasePin() {
    const v = this.pinning;
    if (v) {
      if (v.pinned === this) { v.pinned = null; v.pinType = null; v.pinnedMove = null; }
      this.pinning = null;
      this.game.onPinReleased?.(v, this);
    }
  }
  die(h) {
    if (this.dead) return;
    this.dead = true;
    this.deadT = 0;
    this.releasePin();
    this.climb = null; this.falling = false;
    const g = this.game;
    const att = h?.attacker;
    if (att && att.stats) { att.stats.specials++; att.stats.kills++; if (h.zone === 'head') att.stats.headshots++; }
    g.director?.onSpecialKilled(this, h);
    g.onSpecialKilled?.(this, h);
    this.onDeath?.(h);
    if (!this.noRagdoll) {
      const dir = h?.dir || _v.set(0, 0, 0);
      this.ragdoll = new Ragdoll(this.body, dir.x * 2, 0, dir.z * 2);
      this.body.ragdoll = this.ragdoll;
      const k = Math.min(10, 2 + (h?.knockback || 1) * 1.5);
      this.ragdoll.impulse(J.CHEST, dir.x * k, 1 + dir.y * k, dir.z * k);
    }
  }
  remove() {
    this.removed = true;
    this.releasePin();
    this.rig.dispose();
    this.onRemove?.();
  }
  dispose() { if (!this.removed) this.remove(); }

  update(dt) {
    const g = this.game;
    if (this.dead) {
      this.deadT += dt;
      if (this.ragdoll) this.ragdoll.step(dt, g.level.col);
      this.pos.set(this.body.jx(J.PELVIS), this.body.jy(J.PELVIS), this.body.jz(J.PELVIS));
      this.rig.update(this.body);
      if (this.deadT > 40) this.remove();
      return;
    }
    this.stateT += dt;
    this.hitReact(dt);
    if (this.burning > 0) {
      this.burning -= dt;
      this.hp -= dt * (this.burnDps ?? 60);
      if (Math.random() < 0.7) g.fx.fire(this.pos.x + (Math.random() - 0.5) * 0.4, this.pos.y + 0.5 + Math.random() * this.height * 0.7, this.pos.z + (Math.random() - 0.5) * 0.4, 0.6);
      if (this.hp <= 0) { this.die({ dir: _v.set(0, 0, 0), kind: 'fire', attacker: this.lastAttacker }); return; }
    }
    this.vocT -= dt;
    if (this.vocT <= 0) { this.vocT = this.vocalInterval?.() ?? randRange(2, 5); this.vocalize?.(); }
    if (this.climb) { this.updateClimb(dt); this.animate(dt); return; }
    if (this.falling) { this.updateFall(dt, this.speed * 0.5); this.animate(dt); return; }
    if (this.stumble) {
      const s = this.stumble;
      s.t -= dt;
      this.moveOnNav(s.vx * dt, s.vz * dt);
      s.vx *= Math.max(0, 1 - dt * 4); s.vz *= Math.max(0, 1 - dt * 4);
      if (s.t <= 0) this.stumble = null;
      this.followY(dt);
      this.animate(dt);
      return;
    }
    this.think(dt);
    if (!this.airborne) this.followY(dt);
    this.animate(dt);
  }
  think() {}
  animParams(a) {}
  animate(dt) {
    const b = this.body;
    b.storePrev();
    const sp = this.curSpeed;
    this.phase += dt * (sp / (0.9 + sp * 0.12)) * 2.2;
    this.poser.frame(this.pos.x, this.pos.y, this.pos.z, this.yaw);
    const a = this.anim;
    a.time = this.game.time + this.seed; a.seed = this.seed;
    a.speed = sp; a.phase = this.phase;
    a.crouch = 0; a.lean = 0.1; a.hunch = 0; a.sink = 0; a.legs = null; a.headPitch = 0;
    a.hitS = this.hitS; a.hitF = this.hitF; a.twitch = 0.2; a.sway = 0.02; a.runLean = 1; a.twist = 0;
    a.arms = 'hang'; a.footS = 0; a.footF = 0;
    if (this.climb) { a.arms = 'climb'; a.legs = 'climb'; a.speed = 2; a.phase = this.game.time * 8; }
    else if (this.falling || this.airborne) { a.arms = 'flail'; a.legs = 'air'; }
    else if (this.stumble) { a.arms = 'flail'; a.lean = -0.2; a.speed = 1.5; }
    else if (this.animParams(a) === false) { this.rig.update(b); return; }
    animateHumanoid(b, PROPS, this.poser, a);
    this.rig.update(b);
  }
}

// ================================================================= HUNTER ==
export class Hunter extends SpecialInfected {
  constructor(mgr) {
    super(mgr, 'hunter', {
      skin: 0x8a8278, shirt: 0x2a3038, pants: 0x1e2230, shoes: 0x151515, hair: null, bald: true, sleeves: 'long',
      face: { skin: 0x8a8278, hair: null, dirt: true }, bulk: 0.95,
    }, { hp: 250, speed: 6.2, height: 1.4 });
    // hood
    const hood = new THREE.Mesh(new THREE.SphereGeometry(0.13, 12, 10, 0, Math.PI * 2, 0, Math.PI * 0.62), skinMat(0x2a3038, 0.9));
    hood.scale.set(1, 1.15, 1.12);
    hood.position.set(0, 0.06, 0.015);
    hood.rotation.x = 0.25;
    this.rig.parts.head.add(hood);
    // taped forearms
    for (const s of ['farmL', 'farmR']) {
      const tape = new THREE.Mesh(new THREE.CylinderGeometry(0.05, 0.05, 0.25, 8), skinMat(0x9a968a, 0.8));
      tape.position.y = 0.7;
      this.rig.parts[s].add(tape);
    }
    this.pounceCd = 1.5;
    this.shoveable = true;
    this.airborne = false;
  }
  vocalInterval() { return this.state === 'pin' ? 0.35 : randRange(1.5, 3.5); }
  vocalize() {
    const g = this.game;
    if (this.state === 'pin') g.audio.play('hunterShred', { pos: this.pos, vol: 0.9 });
    else g.audio.play('hunterGrowl', { pos: this.pos, vol: 0.9 });
  }
  think(dt) {
    const g = this.game;
    this.pounceCd -= dt;
    switch (this.state) {
      case 'stalk': {
        this.thinkT -= dt;
        if (this.thinkT <= 0 || !this.target || this.target.dead) { this.thinkT = 0.5; this.target = this.pickTarget(); }
        const t = this.target;
        if (!t) return;
        const dist = this.chase(dt, 5.8, t);
        if (this.pounceCd <= 0 && dist < 20 && dist > 2.5 && Math.abs(t.pos.y - this.pos.y) < 6 && this.canSee(t, 0.9)) {
          this.state = 'prep'; this.stateT = 0;
          g.audio.play('hunterScream', { pos: this.pos, vol: 1 });
        }
        break;
      }
      case 'prep': {
        const t = this.target;
        this.curSpeed = damp(this.curSpeed, 0, 10, dt);
        if (t) this.faceTowards(t.pos.x, t.pos.z, 12, dt);
        if (this.stateT > 0.35 && t) this.leap(t);
        break;
      }
      case 'leap': this.updateLeap(dt); break;
      case 'pin': {
        const v = this.pinning;
        if (!v || v.dead) { this.releasePin(); this.state = 'stalk'; this.pounceCd = 2; break; }
        this.pos.set(v.pos.x + Math.sin(this.yaw) * 0.25, v.pos.y + 0.15, v.pos.z + Math.cos(this.yaw) * 0.25);
        this.targetY = this.pos.y;
        this.shredT = (this.shredT || 0) - dt;
        if (this.shredT <= 0) {
          this.shredT = 0.25;
          v.takeDamage(2.5 * g.difficulty.siDmg * (v.incapped ? 1.2 : 1), this, 'hunter', true);
          g.fx.blood(v.pos.x, v.pos.y + 0.4, v.pos.z, (Math.random() - 0.5), 1, (Math.random() - 0.5), 0.6);
        }
        break;
      }
    }
  }
  leap(t) {
    const g = this.game;
    this.state = 'leap'; this.stateT = 0;
    const tx = t.pos.x + t.phys.vx * 0.25, ty = t.pos.y + 0.6, tz = t.pos.z + t.phys.vz * 0.25;
    const dx = tx - this.pos.x, dz = tz - this.pos.z, dy = ty - this.pos.y;
    const dist = Math.hypot(dx, dz);
    const T = clamp(dist / 15, 0.3, 1.1);
    this.vel.set(dx / T, (dy + 0.5 * GRAV * T * T) / T + 1.2, dz / T);
    this.airborne = true;
    this.yaw = Math.atan2(-dx, -dz);
    this.leapStart = this.pos.clone();
    g.audio.play('hunterPounce', { pos: this.pos, vol: 1 });
  }
  updateLeap(dt) {
    const g = this.game;
    const col = g.level.col;
    this.vel.y -= GRAV * dt;
    const sp = this.vel.length();
    const step = sp * dt;
    // world collision
    const h = col.raycast(this.pos.x, this.pos.y + 0.6, this.pos.z, this.vel.x / sp, this.vel.y / sp, this.vel.z / sp, step + 0.3);
    if (h && h.ny < 0.5) {
      // hit a wall: drop
      this.vel.x *= -0.2; this.vel.z *= -0.2;
    }
    this.pos.addScaledVector(this.vel, dt);
    // survivors
    for (const s of this.mgr.targets) {
      if (s.pinned || s.dead) continue;
      const d = Math.hypot(s.pos.x - this.pos.x, s.pos.y + 0.9 - (this.pos.y + 0.6), s.pos.z - this.pos.z);
      if (d < 1.05) { this.pin(s); return; }
    }
    // landing
    const gy = col.groundHeight(this.pos.x, this.pos.y + 0.5, this.pos.z, 30, 0.2);
    if (this.vel.y < 0 && this.pos.y <= gy + 0.02) {
      this.pos.y = gy;
      this.airborne = false;
      this.node = this.nav.nearestNode(this.pos.x, this.pos.y, this.pos.z, 2);
      if (this.node >= 0) { this.pos.y = this.nav.nodeY[this.node]; this.targetY = this.pos.y; }
      this.state = 'stalk';
      this.pounceCd = 1.2;
      this.stumble = { t: 0.3, vx: this.vel.x * 0.1, vz: this.vel.z * 0.1 };
    }
    if (this.stateT > 3 || this.pos.y < -100) { this.airborne = false; this.state = 'stalk'; this.placeAt(this.pos.x, this.pos.y, this.pos.z); }
  }
  pin(s) {
    const g = this.game;
    this.airborne = false;
    this.state = 'pin';
    this.stateT = 0;
    this.pinning = s;
    s.pinned = this;
    s.pinType = 'hunter';
    s.cancelAction();
    const dist = this.leapStart ? this.leapStart.distanceTo(this.pos) : 0;
    const dmg = (1 + Math.min(24, dist * 1.2)) * g.difficulty.siDmg;
    s.takeDamage(dmg, this, 'hunter');
    this.yaw = Math.atan2(-(s.pos.x - this.pos.x), -(s.pos.z - this.pos.z));
    g.audio.play('hunterShred', { pos: this.pos, vol: 1 });
    g.onPinned?.(s, this);
  }
  onShoved(s, fx, fz) {
    const g = this.game;
    if (this.state === 'leap') {
      // deadstop / skeet
      this.airborne = false;
      this.state = 'stalk'; this.pounceCd = 2;
      this.vel.set(0, 0, 0);
      this.placeAt(this.pos.x, this.pos.y, this.pos.z);
      this.stumble = { t: 1.0, vx: fx * 3, vz: fz * 3 };
      g.onSkeet?.(s, this);
    } else if (this.state === 'pin') {
      this.releasePin();
      this.state = 'stalk'; this.pounceCd = 2.5;
      this.placeAt(this.pos.x + fx, this.pos.y, this.pos.z + fz);
      this.stumble = { t: 1.1, vx: fx * 4, vz: fz * 4 };
    } else {
      this.stumble = { t: 0.8, vx: fx * 3.5, vz: fz * 3.5 };
      this.pounceCd = Math.max(this.pounceCd, 1);
    }
  }
  animParams(a) {
    a.crouch = 0.6; a.lean = 0.55; a.hunch = 0.2; a.runLean = 0.6;
    a.arms = this.curSpeed > 2 ? 'reach' : 'hang';
    if (this.state === 'prep') { a.crouch = 0.9; a.lean = 0.7; a.arms = 'reach'; }
    if (this.state === 'pin') { a.crouch = 0.85; a.lean = 0.95; a.arms = 'attack'; a.attackT = (this.game.time * 4) % 1; a.legs = 'kneel'; a.sink = 0.3; }
  }
}

// ================================================================= SMOKER ==
export class Smoker extends SpecialInfected {
  constructor(mgr) {
    super(mgr, 'smoker', {
      skin: 0x6a7058, shirt: 0x4a3a2a, pants: 0x2e2a24, shoes: 0x1a1612, hair: 0x2a2620, sleeves: 'short',
      face: { skin: 0x6a7058, hair: 0x2a2620, dirt: true }, bulk: 0.8, fat: 0.85,
    }, { hp: 250, speed: 4.4, scale: 1.13, build: 0.85, height: 2.0 });
    // boils on the face/neck
    const boilMat = skinMat(0x7a6a40, 0.4);
    for (let i = 0; i < 6; i++) {
      const b = new THREE.Mesh(new THREE.SphereGeometry(0.02 + Math.random() * 0.02, 6, 5), boilMat);
      const a = Math.random() * 6.28;
      b.position.set(Math.cos(a) * 0.09, -0.02 + Math.random() * 0.1, Math.sin(a) * 0.1);
      this.rig.parts.head.add(b);
    }
    // tongue (segmented tube rebuilt each frame)
    this.tonguePts = [];
    for (let i = 0; i < 16; i++) this.tonguePts.push(new THREE.Vector3());
    this.tongueGeo = new THREE.BufferGeometry();
    this.tongueGeo.setAttribute('position', new THREE.BufferAttribute(new Float32Array(16 * 3), 3));
    this.tongueMesh = new THREE.Line(this.tongueGeo, new THREE.LineBasicMaterial({ color: 0x6a2a2a }));
    this.tongueTube = null;
    this.tongueMat = new THREE.MeshStandardMaterial({ color: 0x7a3434, roughness: 0.4 });
    this.tongueCd = randRange(1, 3);
    this.tongueLen = 0;
    this.tongueEnd = new THREE.Vector3();
    this.shoveable = true;
    this.losLost = 0;
  }
  vocalInterval() { return randRange(2, 4.5); }
  vocalize() { this.game.audio.play(this.state === 'pull' ? 'smokerChoke' : 'smokerCough', { pos: this.pos, vol: 0.9 }); }
  mouth(out) { return out.set(this.body.jx(J.HEAD), this.body.jy(J.HEAD) - 0.05, this.body.jz(J.HEAD)); }
  think(dt) {
    const g = this.game;
    this.tongueCd -= dt;
    switch (this.state) {
      case 'stalk': {
        this.thinkT -= dt;
        if (this.thinkT <= 0 || !this.target || this.target.dead) { this.thinkT = 0.6; this.target = this.pickTarget(); }
        const t = this.target;
        if (!t) return;
        const d = this.pos.distanceTo(t.pos);
        const sees = this.canSee(t, 1.8);
        if (sees && d < 32 && this.tongueCd <= 0) { this.state = 'aim'; this.stateT = 0; g.audio.play('smokerCough', { pos: this.pos, vol: 1 }); break; }
        if (d < 7 && sees) this.retreat(dt, 4);
        else if (!sees || d > 30) this.chase(dt, 4.2, t);
        else this.curSpeed = damp(this.curSpeed, 0, 5, dt);
        break;
      }
      case 'aim': {
        const t = this.target;
        this.curSpeed = damp(this.curSpeed, 0, 10, dt);
        if (!t || t.dead) { this.state = 'stalk'; break; }
        this.faceTowards(t.pos.x, t.pos.z, 10, dt);
        if (this.stateT > 0.6) {
          this.state = 'shoot'; this.stateT = 0; this.tongueLen = 0;
          this.mouth(_v);
          this.tongueDir = new THREE.Vector3(t.pos.x - _v.x, t.pos.y + 1.1 - _v.y, t.pos.z - _v.z).normalize();
          g.audio.play('smokerTongue', { pos: this.pos, vol: 1 });
        }
        break;
      }
      case 'shoot': {
        this.tongueLen += dt * 38;
        this.mouth(_v);
        const end = this.tongueEnd.copy(_v).addScaledVector(this.tongueDir, this.tongueLen);
        // hit survivors
        for (const s of this.mgr.targets) {
          if (s.pinned || s.dead) continue;
          const d = Math.hypot(s.pos.x - end.x, Math.max(0, Math.abs(s.pos.y + 1 - end.y) - 0.6), s.pos.z - end.z);
          if (d < 0.7) { this.grab(s); return; }
        }
        const wh = g.level.col.raycast(_v.x, _v.y, _v.z, this.tongueDir.x, this.tongueDir.y, this.tongueDir.z, this.tongueLen);
        if (wh || this.tongueLen > 38) { this.state = 'retract'; this.stateT = 0; this.tongueCd = 3; }
        break;
      }
      case 'retract':
        this.tongueLen -= dt * 45;
        if (this.tongueLen <= 0) { this.tongueLen = 0; this.state = 'stalk'; }
        break;
      case 'pull': {
        const v = this.pinning;
        if (!v || v.dead) { this.release(); break; }
        this.mouth(_v);
        this.faceTowards(v.pos.x, v.pos.z, 8, dt);
        this.curSpeed = 0;
        const dx = this.pos.x - v.pos.x, dz = this.pos.z - v.pos.z;
        const d = Math.hypot(dx, dz);
        this.tongueEnd.set(v.pos.x, v.pos.y + 1.4, v.pos.z);
        // tongue snaps if line blocked for too long
        if (!g.level.col.lineOfSight(_v.x, _v.y, _v.z, v.pos.x, v.pos.y + 1.2, v.pos.z)) this.losLost += dt; else this.losLost = 0;
        if (this.losLost > 1.2 || this.stateT > 40) { this.release(); break; }
        this.dmgT = (this.dmgT || 0) - dt;
        if (d > 1.3) {
          v.pinnedMove = { x: dx / d * 3.2, z: dz / d * 3.2 };
          if (this.dmgT <= 0) { this.dmgT = 0.5; v.takeDamage(1 * g.difficulty.siDmg, this, 'smoker', true); }
        } else {
          v.pinnedMove = { x: 0, z: 0 };
          if (this.dmgT <= 0) { this.dmgT = 0.33; v.takeDamage(2 * g.difficulty.siDmg, this, 'smoker', true); }
        }
        break;
      }
      case 'flee':
        this.retreat(dt, 4.5);
        if (this.stateT > 3) this.state = 'stalk';
        break;
    }
    this.updateTongue();
  }
  grab(s) {
    const g = this.game;
    this.state = 'pull'; this.stateT = 0;
    this.pinning = s;
    s.pinned = this; s.pinType = 'smoker';
    s.cancelAction();
    s.takeDamage(2 * g.difficulty.siDmg, this, 'smoker');
    g.audio.play('smokerTongue', { pos: s.pos, vol: 1 });
    g.onPinned?.(s, this);
  }
  release() {
    this.releasePin();
    this.state = 'flee'; this.stateT = 0;
    this.tongueLen = 0;
    this.tongueCd = randRange(10, 16);
  }
  onShoved(s, fx, fz) {
    if (this.state === 'pull') { this.release(); return; }
    this.stumble = { t: 0.8, vx: fx * 3, vz: fz * 3 };
  }
  updateTongue() {
    const g = this.game;
    const show = this.state === 'shoot' || this.state === 'pull' || this.state === 'retract';
    if (!show) { if (this.tongueTube) this.tongueTube.visible = false; return; }
    this.mouth(_v);
    const end = this.state === 'pull' ? this.tongueEnd : _w.copy(_v).addScaledVector(this.tongueDir || _w.set(0, 0, 1), this.tongueLen);
    const pts = this.tonguePts;
    const len = _v.distanceTo(end);
    const sag = this.state === 'pull' ? Math.min(0.6, len * 0.02) : 0.05;
    for (let i = 0; i < pts.length; i++) {
      const t = i / (pts.length - 1);
      pts[i].lerpVectors(_v, end, t);
      pts[i].y -= Math.sin(t * Math.PI) * sag + Math.sin(g.time * 20 + t * 9) * 0.015;
    }
    const curve = new THREE.CatmullRomCurve3(pts);
    const geo = new THREE.TubeGeometry(curve, 20, 0.022, 5, false);
    if (!this.tongueTube) {
      this.tongueTube = new THREE.Mesh(geo, this.tongueMat);
      this.tongueTube.frustumCulled = false;
      g.scene.add(this.tongueTube);
    } else {
      this.tongueTube.geometry.dispose();
      this.tongueTube.geometry = geo;
    }
    this.tongueTube.visible = true;
  }
  onDeath() {
    const g = this.game;
    if (this.tongueTube) this.tongueTube.visible = false;
    const b = this.body;
    g.fx.cloud(b.jx(J.CHEST), b.jy(J.CHEST) - 0.6, b.jz(J.CHEST), 3.2, [0.4, 0.42, 0.38], 28, 7);
    g.audio.play('smokerDeath', { pos: this.pos, vol: 1 });
    g.smokeClouds = g.smokeClouds || [];
    g.smokeClouds.push({ x: b.jx(J.CHEST), y: b.jy(J.CHEST), z: b.jz(J.CHEST), r: 3.5, t: 7 });
  }
  onRemove() { if (this.tongueTube) { this.game.scene.remove(this.tongueTube); this.tongueTube.geometry.dispose(); } }
  animParams(a) {
    a.lean = 0.15; a.hunch = 0.15; a.arms = this.curSpeed > 1 ? 'swing' : 'hang';
    if (this.state === 'aim' || this.state === 'shoot') { a.headPitch = -0.3; a.arms = 'up'; }
    if (this.state === 'pull') { a.arms = 'custom'; a.handL = [-0.3, 1.3, 0.4]; a.handR = [0.3, 1.3, 0.4]; a.lean = -0.15; }
  }
}

// ================================================================= BOOMER ==
export class Boomer extends SpecialInfected {
  constructor(mgr) {
    const skin = 0x9a9868;
    super(mgr, 'boomer', {
      skin, shirt: skin, shirtMat: skinMat(skin, 0.45), pants: 0x3a3428, shoes: 0x1a1612, hair: null, bald: true, sleeves: 'none',
      face: { skin, hair: null, dirt: true }, fat: 2.1, bulk: 1.5, belt: false,
    }, { hp: 50, speed: 3.3, build: 1.5, height: 1.75, torsoScale: 1.6 });
    const boilMat = skinMat(0x8a7040, 0.3);
    for (let i = 0; i < 14; i++) {
      const b = new THREE.Mesh(new THREE.SphereGeometry(0.025 + Math.random() * 0.035, 6, 5), boilMat);
      const a = Math.random() * 6.28;
      b.position.set(Math.cos(a) * 0.2, 0.1 + Math.random() * 0.8, Math.sin(a) * 0.15);
      this.rig.parts.torso.add(b);
    }
    this.vomitCd = randRange(0, 2);
    this.shoveable = true;
    this.noRagdoll = true;
  }
  vocalInterval() { return randRange(1.2, 3); }
  vocalize() { this.game.audio.play('boomerGurgle', { pos: this.pos, vol: 0.9 }); }
  think(dt) {
    const g = this.game;
    this.vomitCd -= dt;
    switch (this.state) {
      case 'stalk': {
        this.thinkT -= dt;
        if (this.thinkT <= 0 || !this.target || this.target.dead) { this.thinkT = 0.6; this.target = this.pickTarget(); }
        const t = this.target;
        if (!t) return;
        const d = this.chase(dt, this.vomitCd > 0 ? 2.6 : 3.4, t);
        if (d < 5 && this.vomitCd <= 0 && this.canSee(t, 1.5)) { this.state = 'vomit'; this.stateT = 0; g.audio.play('boomerVomit', { pos: this.pos, vol: 1 }); }
        if (this.vomitCd > 0 && d < 4) { this.state = 'back'; this.stateT = 0; }
        break;
      }
      case 'back':
        this.retreat(dt, 2.8);
        if (this.stateT > 3) this.state = 'stalk';
        break;
      case 'vomit': {
        const t = this.target;
        this.curSpeed = 0;
        if (t) this.faceTowards(t.pos.x, t.pos.z, 4, dt);
        const hx = this.body.jx(J.HEAD), hy = this.body.jy(J.HEAD) - 0.05, hz = this.body.jz(J.HEAD);
        const fx = -Math.sin(this.yaw), fz = -Math.cos(this.yaw);
        if (this.stateT < 1.0) {
          g.fx.bileSpray(hx, hy, hz, fx, -0.1, fz);
          for (const s of this.mgr.targets) {
            if (s.bile > 0) continue;
            const dx = s.pos.x - this.pos.x, dz = s.pos.z - this.pos.z;
            const d = Math.hypot(dx, dz);
            if (d > 5.5) continue;
            const dot = (dx * fx + dz * fz) / (d || 1);
            if (dot > 0.8 && g.level.col.lineOfSight(hx, hy, hz, s.pos.x, s.pos.y + 1.4, s.pos.z)) this.biled(s);
          }
        }
        if (this.stateT > 1.4) { this.state = 'back'; this.stateT = 0; this.vomitCd = 20; }
        break;
      }
    }
  }
  biled(s) {
    const g = this.game;
    s.bile = 15;
    g.audio.play('boomerBile', { pos: s.pos, vol: 1, owner: s });
    g.director?.bileMob(s);
    g.onBiled?.(s, this);
  }
  onShoved(s, fx, fz) {
    this.stumble = { t: 1.2, vx: fx * 4, vz: fz * 4 };
    this.state = 'stalk';
    this.vomitCd = Math.max(this.vomitCd, 1.2);
  }
  onDeath(h) {
    const g = this.game;
    const b = this.body;
    const x = b.jx(J.CHEST), y = b.jy(J.CHEST), z = b.jz(J.CHEST);
    g.audio.play('boomerExplode', { pos: this.pos, vol: 1.1 });
    g.gibs.burst(x, y - 0.8, z, { skin: [0.35, 0.34, 0.2], cloth: [0.2, 0.2, 0.15] }, 7, 14);
    g.fx.cloud(x, y - 0.6, z, 2.5, [0.35, 0.42, 0.1], 18, 3);
    g.fx.bileSpray(x, y, z, 0, 1, 0);
    g.decals.add(this.pos.x, this.pos.y + 0.02, this.pos.z, 0, 1, 0, 3.5, DF.BILE);
    for (const s of this.mgr.targets) {
      const d = Math.hypot(s.pos.x - x, s.pos.z - z);
      if (d < 3.6 && Math.abs(s.pos.y - this.pos.y) < 2 && s.bile <= 0) this.biled(s);
      if (d < 3) s.knock = { x: (s.pos.x - x) / (d || 1) * 3, y: 1.5, z: (s.pos.z - z) / (d || 1) * 3 };
    }
    g.infected.corpseImpulse(x, y, z, 4, 6);
    this.body.visible = false;
    this.rig.setVisible(false);
    this.deadT = 35;
  }
  animParams(a) {
    a.lean = -0.12; a.legs = 'wide'; a.arms = 'swing'; a.sway = 0.05; a.twitch = 0.1;
    a.speed = Math.min(a.speed, 1.6); // waddle
    if (this.state === 'vomit') { a.headPitch = -0.2; a.lean = 0.1; a.arms = 'hang'; }
  }
}

// =================================================================== TANK ==
export class Tank extends SpecialInfected {
  constructor(mgr) {
    const skin = 0xa08070;
    super(mgr, 'tank', {
      skin, shirt: skin, shirtMat: skinMat(skin, 0.55), pants: 0x2a2a30, shoes: 0x1a1612, hair: null, bald: true, sleeves: 'none',
      face: { skin, hair: null, dirt: true, scar: true }, armBulk: 2.6, legBulk: 1.4, chest: 1.55, headScale: 0.82, belt: false,
    }, { hp: mgr.game.difficulty.tankHp, speed: 5.6, scale: 1.3, build: 1.7, height: 2.3, radius: 0.7, hitScale: 1.4, torsoScale: 1.3, headScale: 0.9 });
    this.burnDps = mgr.game.difficulty.tankHp / 60;
    this.punchCd = 0;
    this.rockCd = 5;
    this.meleeMult = 0.15;
    this.explosiveMult = 1.2;
    this.stepT = 0;
    this.rock = null;
    this.frustration = 0;
    this.penCost = 4;
    // rock mesh (shared)
    const rg = new THREE.IcosahedronGeometry(0.42, 1);
    const p = rg.attributes.position;
    for (let i = 0; i < p.count; i++) { const k = 0.75 + Math.random() * 0.4; p.setXYZ(i, p.getX(i) * k, p.getY(i) * k, p.getZ(i) * k); }
    rg.computeVertexNormals();
    this.rockMesh = new THREE.Mesh(rg, new THREE.MeshStandardMaterial({ color: 0x6a6660, roughness: 0.9 }));
    this.rockMesh.castShadow = true;
    this.rockMesh.visible = false;
    mgr.game.scene.add(this.rockMesh);
  }
  spawnAt(x, y, z) {
    super.spawnAt(x, y, z);
    this.game.audio.play('tankRoar', { pos: this.pos, vol: 1.3 });
    return this;
  }
  vocalInterval() { return randRange(3, 6); }
  vocalize() { this.game.audio.play('tankRoar', { pos: this.pos, vol: 1 }); }
  onDamaged(h) {
    if (h.attacker && h.attacker.pos && Math.random() < 0.1) this.target = h.attacker;
  }
  think(dt) {
    const g = this.game;
    this.punchCd -= dt;
    this.rockCd -= dt;
    this.frustration += dt;
    // footsteps & shake
    this.stepT -= dt * (this.curSpeed / 2.5);
    if (this.stepT <= 0 && this.curSpeed > 0.5) {
      this.stepT = 1;
      g.audio.play('tankStep', { pos: this.pos, vol: 1 });
      const pd = g.player ? g.player.pos.distanceTo(this.pos) : 99;
      if (pd < 20) g.shake(0.25 * (1 - pd / 20));
    }
    switch (this.state) {
      case 'stalk': {
        this.thinkT -= dt;
        if (this.thinkT <= 0 || !this.target || this.target.dead) {
          this.thinkT = 1;
          // nearest (visible preferred)
          let best = null, bd = 1e9;
          for (const s of this.mgr.targets) {
            let d = s.pos.distanceTo(this.pos);
            if (s.incapped) d *= 2.5;
            if (d < bd) { bd = d; best = s; }
          }
          this.target = best;
        }
        const t = this.target;
        if (!t) return;
        const sp = this.burning > 0 ? 6.3 : 5.6;
        const d = this.chase(dt, sp, t);
        if (d < 2.4 && Math.abs(t.pos.y - this.pos.y) < 1.6 && this.punchCd <= 0) { this.state = 'punch'; this.stateT = 0; this.hitDone = false; break; }
        // hittable object between us and the target?
        if (d < 16 && this.punchCd <= 0) {
          const hb = this.findHittable(t);
          if (hb) { this.state = 'hitObj'; this.stateT = 0; this.hitObj = hb; this.hitDone = false; break; }
        }
        if (d > 12 && d < 45 && this.rockCd <= 0 && this.canSee(t, 2)) { this.state = 'rock'; this.stateT = 0; this.rockThrown = false; g.audio.play('tankRock', { pos: this.pos, vol: 1 }); }
        break;
      }
      case 'punch': {
        const t = this.target;
        this.curSpeed = damp(this.curSpeed, 0, 6, dt);
        if (t) this.faceTowards(t.pos.x, t.pos.z, 6, dt);
        if (this.stateT > 0.35 && !this.hitDone) {
          this.hitDone = true;
          const fx = -Math.sin(this.yaw), fz = -Math.cos(this.yaw);
          let hitAny = false;
          for (const s of this.mgr.targets) {
            const dx = s.pos.x - this.pos.x, dz = s.pos.z - this.pos.z;
            const d = Math.hypot(dx, dz);
            if (d > 2.8 || Math.abs(s.pos.y - this.pos.y) > 1.8) continue;
            if ((dx * fx + dz * fz) / (d || 1) < 0.2) continue;
            hitAny = true;
            s.takeDamage(24 * g.difficulty.siDmg * (s.incapped ? 1.3 : 1), this, 'tank');
            if (!s.incapped && !s.dead) s.knock = { x: dx / (d || 1) * 9 + fx * 3, y: 6, z: dz / (d || 1) * 9 + fz * 3 };
            if (s.isHuman) g.shake(1);
            g.fx.blood(s.pos.x, s.pos.y + 1.2, s.pos.z, fx, 0.4, fz, 1.5);
          }
          // swat commons too
          g.infected.forEachNear(this.pos.x, this.pos.z, 2.8, (e) => { if (!e.special && !e.dead) e.takeHit({ damage: 999, part: 0, zone: 'torso', x: e.pos.x, y: e.pos.y + 1, z: e.pos.z, dir: _v.set(fx, 0.5, fz), kind: 'explosion', knockback: 12, attacker: this }); });
          g.audio.play(hitAny ? 'tankPunch' : 'swing', { pos: this.pos, vol: hitAny ? 1.3 : 0.8 });
          if (hitAny) this.frustration = 0;
        }
        if (this.stateT > 0.9) { this.state = 'stalk'; this.punchCd = 1.1; }
        break;
      }
      case 'hitObj': {
        const o = this.hitObj;
        this.curSpeed = damp(this.curSpeed, 4, 5, dt);
        const dx = o.pos.x - this.pos.x, dz = o.pos.z - this.pos.z;
        const d = Math.hypot(dx, dz);
        if (d > 2.2) { this.moveOnNav(dx / d * 4.5 * dt, dz / d * 4.5 * dt); this.faceTowards(o.pos.x, o.pos.z, 6, dt); }
        else if (!this.hitDone) {
          this.hitDone = true;
          const t = this.target;
          if (t && o.launch) o.launch(t.pos, this);
          g.audio.play('tankPunch', { pos: this.pos, vol: 1.3 });
          this.stateT = 0;
          this.punchCd = 3;
        }
        if ((this.hitDone && this.stateT > 0.6) || this.stateT > 4) this.state = 'stalk';
        break;
      }
      case 'rock': {
        const t = this.target;
        this.curSpeed = damp(this.curSpeed, 0, 6, dt);
        if (t) this.faceTowards(t.pos.x, t.pos.z, 5, dt);
        if (this.stateT > 0.4 && this.stateT < 1.1) {
          // rock appears above head
          this.rockMesh.visible = true;
          this.rockMesh.position.set(this.body.jx(J.HEAD), this.body.jy(J.HEAD) + 0.6, this.body.jz(J.HEAD));
          if (this.stateT < 0.6) g.fx.chips(this.pos.x, this.pos.y + 0.1, this.pos.z, 0, 1, 0, [0.3, 0.3, 0.28], 3);
        }
        if (this.stateT > 1.1 && !this.rockThrown && t) {
          this.rockThrown = true;
          const sx = this.body.jx(J.HEAD), sy = this.body.jy(J.HEAD) + 0.5, sz = this.body.jz(J.HEAD);
          const tx = t.pos.x + t.phys.vx * 0.5, ty = t.pos.y + 1, tz = t.pos.z + t.phys.vz * 0.5;
          const dist = Math.hypot(tx - sx, tz - sz);
          const T = clamp(dist / 22, 0.4, 2);
          this.rock = { pos: new THREE.Vector3(sx, sy, sz), vel: new THREE.Vector3((tx - sx) / T, (ty - sy + 0.5 * GRAV * T * T) / T, (tz - sz) / T), t: 0 };
          g.audio.play('throw', { pos: this.pos, vol: 1.2 });
        }
        if (this.stateT > 1.5) { this.state = 'stalk'; this.rockCd = randRange(7, 11); }
        break;
      }
    }
    this.updateRock(dt);
  }
  updateRock(dt) {
    const r = this.rock;
    if (!r) { if (this.state !== 'rock') this.rockMesh.visible = false; return; }
    const g = this.game;
    r.t += dt;
    r.vel.y -= GRAV * dt;
    const sp = r.vel.length();
    const h = g.level.col.raycast(r.pos.x, r.pos.y, r.pos.z, r.vel.x / sp, r.vel.y / sp, r.vel.z / sp, sp * dt + 0.4);
    r.pos.addScaledVector(r.vel, dt);
    this.rockMesh.visible = true;
    this.rockMesh.position.copy(r.pos);
    this.rockMesh.rotation.x += dt * 5; this.rockMesh.rotation.z += dt * 3;
    let hit = !!h || r.t > 4;
    for (const s of this.mgr.targets) {
      const d = Math.hypot(s.pos.x - r.pos.x, s.pos.y + 0.9 - r.pos.y, s.pos.z - r.pos.z);
      if (d < 1.1) {
        s.takeDamage(24 * g.difficulty.siDmg, this, 'tankRock');
        if (!s.incapped) s.knock = { x: r.vel.x * 0.3, y: 4, z: r.vel.z * 0.3 };
        if (s.isHuman) g.shake(1);
        hit = true;
      }
    }
    if (hit) {
      g.audio.play('tankRockHit', { pos: r.pos, vol: 1.2 });
      g.fx.chips(r.pos.x, r.pos.y, r.pos.z, 0, 1, 0, [0.35, 0.34, 0.32], 20);
      g.fx.dust(r.pos.x, r.pos.y, r.pos.z, 0, 1, 0, [0.4, 0.38, 0.35], 8, 0.8);
      g.infected.forEachNear(r.pos.x, r.pos.z, 2, (e) => { if (!e.special) e.takeHit({ damage: 500, part: 0, zone: 'torso', x: e.pos.x, y: e.pos.y + 1, z: e.pos.z, dir: r.vel.clone().normalize(), kind: 'explosion', knockback: 8 }); });
      this.rock = null;
      this.rockMesh.visible = false;
    }
  }
  findHittable(t) {
    const list = this.game.hittables || [];
    let best = null, bd = 1e9;
    for (const o of list) {
      if (o.flying || o.used) continue;
      const d = o.pos.distanceTo(this.pos);
      if (d > 7) continue;
      // object roughly between tank and target
      const ox = o.pos.x - this.pos.x, oz = o.pos.z - this.pos.z;
      const tx = t.pos.x - this.pos.x, tz = t.pos.z - this.pos.z;
      const tl = Math.hypot(tx, tz) || 1;
      const along = (ox * tx + oz * tz) / tl;
      if (along < 0 || along > tl) continue;
      if (d < bd) { bd = d; best = o; }
    }
    return best;
  }
  onShoved() { /* immune */ }
  onDeath() {
    const g = this.game;
    g.audio.play('tankDeath', { pos: this.pos, vol: 1.3 });
    this.rockMesh.visible = false;
    this.rock = null;
  }
  onRemove() { this.game.scene.remove(this.rockMesh); }
  animParams(a) {
    a.lean = 0.45; a.hunch = 0.35; a.runLean = 0.5; a.twitch = 0.05; a.sway = 0.03;
    a.arms = 'swing';
    a.footS = 0.08;
    if (this.state === 'punch') { a.arms = 'attack'; a.attackT = clamp(this.stateT / 0.9, 0, 1) * 0.5; }
    if (this.state === 'hitObj' && this.hitDone) { a.arms = 'attack'; a.attackT = 0.45; }
    if (this.state === 'rock') {
      if (this.stateT < 1.1) { a.arms = 'up'; a.crouch = this.stateT < 0.5 ? 0.6 : 0.1; }
      else { a.arms = 'attack'; a.attackT = 0.45 + (this.stateT - 1.1); }
    }
  }
}

// ================================================================== WITCH ==
export class Witch extends SpecialInfected {
  constructor(mgr) {
    const skin = 0xc8c0b8;
    super(mgr, 'witch', {
      skin, shirt: 0xb8a8a0, pants: 0x9a8a88, shoes: 0x9a8a88, hair: 0xe8e8e0, sleeves: 'none',
      face: { skin, hair: 0xe8e8e0, eyeColor: '#ff3010' }, fat: 0.8, bulk: 0.72, belt: false,
    }, { hp: 1000, speed: 8.5, scale: 0.95, build: 0.78, height: 1.6 });
    // long hair strands covering the face
    const hairMat = skinMat(0xe0ddd4, 0.7);
    for (let i = 0; i < 16; i++) {
      const a = (i / 16) * Math.PI * 2;
      const len = 0.25 + Math.random() * 0.25;
      const st = new THREE.Mesh(new THREE.BoxGeometry(0.035, len, 0.015), hairMat);
      st.position.set(Math.sin(a) * 0.09, 0.08 - len / 2, Math.cos(a) * 0.09 - 0.01);
      st.rotation.y = a;
      this.rig.parts.head.add(st);
    }
    // claws
    const clawMat = skinMat(0x3a3028, 0.4);
    for (const side of ['farmL', 'farmR']) {
      for (let k = 0; k < 4; k++) {
        const c = new THREE.Mesh(new THREE.ConeGeometry(0.006, 0.12, 4), clawMat);
        c.position.set(-0.02 + k * 0.013, 1.3, -0.01);
        c.scale.y = 1 / 0.3; // counter the part Y scale (~0.3m forearm)
        this.rig.parts[side].add(c);
      }
    }
    this.rage = 0;
    this.state = 'sit';
    this.enraged = false;
    this.contrib = new Map();
    this.cryLoop = null;
    this.slashCd = 0;
    this.meleeMult = 1;
    this.eyeLight = null;
  }
  spawnAt(x, y, z) {
    super.spawnAt(x, y, z);
    this.cryLoop = this.game.audio.loop('witchCry', { pos: this.pos, vol: 1 });
    return this;
  }
  hearNoise(x, y, z, r) {
    if (this.enraged) return;
    const d = Math.hypot(this.pos.x - x, this.pos.z - z);
    if (d < Math.min(12, r * 0.5)) this.rage += 0.12 * (1 - d / 12);
  }
  vocalInterval() { return this.enraged ? randRange(0.8, 1.6) : randRange(2, 4); }
  vocalize() {
    if (this.enraged) this.game.audio.play('witchGrowl', { pos: this.pos, vol: 1 });
    else if (this.rage > 0.3) this.game.audio.play('witchGrowl', { pos: this.pos, vol: 0.5 + this.rage * 0.5 });
  }
  onDamaged(h) {
    if (!this.enraged) {
      this.rage = 1;
      if (h.attacker && h.attacker.pos) this.contrib.set(h.attacker, 99);
    }
  }
  think(dt) {
    const g = this.game;
    if (!this.enraged) {
      // startle meter
      for (const s of this.mgr.targets) {
        const d = s.pos.distanceTo(this.pos);
        let add = 0;
        if (d < 11) add += dt * ((11 - d) / 11) * 0.45 * (s.crouching ? 0.5 : 1);
        if (s.flashlight && d < 22) {
          const e = s.eye(_v);
          const dir = s.aimDir(_w);
          const tx = this.pos.x - e.x, ty = this.pos.y + 0.8 - e.y, tz = this.pos.z - e.z;
          const tl = Math.hypot(tx, ty, tz);
          if ((tx * dir.x + ty * dir.y + tz * dir.z) / tl > 0.93) add += dt * 0.5 * (1 - d / 22);
        }
        if (add > 0) { this.rage += add; this.contrib.set(s, (this.contrib.get(s) || 0) + add); }
      }
      this.rage = Math.max(0, this.rage - dt * 0.04);
      if (this.cryLoop) this.cryLoop.set({ pos: this.pos, vol: 1 });
      if (this.rage >= 1) this.startle();
      return;
    }
    // enraged
    const t = this.target;
    if (!t || t.dead) { this.state = 'flee'; }
    if (this.state === 'attack') {
      const d = this.chase(dt, 8.5, t);
      this.slashCd -= dt;
      if (d < 1.4 && Math.abs(t.pos.y - this.pos.y) < 1.5 && this.slashCd <= 0) {
        this.slashCd = 0.6;
        g.audio.play('witchSlash', { pos: this.pos, vol: 1.2 });
        g.fx.blood(t.pos.x, t.pos.y + 1, t.pos.z, 0, 0.5, 0, 2);
        if (!t.incapped && g.difficulty.witchIncap) t.incap('witch');
        else t.takeDamage(g.difficulty.witchDmg * (t.incapped ? 0.25 : 1), this, 'witch');
        if (t.isHuman) g.shake(0.8);
      }
    } else if (this.state === 'flee') {
      this.retreat(dt, 7);
      if (this.stateT > 8) this.remove();
    }
  }
  startle() {
    const g = this.game;
    this.enraged = true;
    this.state = 'attack';
    this.stateT = 0;
    let best = null, bv = -1;
    for (const [s, v] of this.contrib) if (!s.dead && v > bv) { bv = v; best = s; }
    this.target = best || this.pickTarget();
    if (this.cryLoop) { this.cryLoop.stop(0.2); this.cryLoop = null; }
    g.audio.play('witchScream', { pos: this.pos, vol: 1.4 });
    g.onWitchStartled?.(this, this.target);
  }
  onShoved(s, fx, fz) { if (!this.enraged) { this.rage = 1; this.contrib.set(s, 99); } }
  onDeath() {
    if (this.cryLoop) { this.cryLoop.stop(0.3); this.cryLoop = null; }
    this.game.onWitchKilled?.(this);
  }
  onRemove() { if (this.cryLoop) { this.cryLoop.stop(0.3); this.cryLoop = null; } }
  animParams(a) {
    if (!this.enraged) {
      const r = this.rage;
      if (r < 0.7) {
        a.legs = 'sit'; a.sink = 0.6; a.lean = 0.55 - r * 0.4; a.headPitch = 0.7 - r * 0.8; a.speed = 0;
        a.arms = 'custom';
        const sob = Math.sin(this.game.time * 5) * 0.02;
        a.handL = [-0.07, 0.95 + sob - r * 0.2, 0.25]; a.handR = [0.07, 0.95 + sob - r * 0.2, 0.25];
        a.twitch = 0.1 + r; a.sway = 0.02;
      } else {
        a.crouch = 0.3; a.lean = 0.3; a.arms = 'reach'; a.twitch = 1; a.speed = 0;
      }
      return;
    }
    a.lean = 0.45; a.hunch = 0.2; a.arms = this.state === 'attack' && this.target && this.target.pos.distanceTo(this.pos) < 2 ? 'attack' : 'reach';
    a.attackT = (this.game.time * 2.2) % 1;
    a.twitch = 0.5;
  }
}

export const SPECIAL_CLASSES = { hunter: Hunter, smoker: Smoker, boomer: Boomer, tank: Tank, witch: Witch };
