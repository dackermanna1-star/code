// Special infected: Boomer, Hunter, Smoker, Charger, Jockey, Spitter, Tank, Witch.
// Visual designs are original; behaviour follows the original game's mechanics.
import * as THREE from 'three';
import { SPECIAL, DIFFICULTY, HITGROUP, SURVIVOR, U } from './config.js';
import { Infected } from './infected.js';
import { buildSpecialModel } from './characters.js';
import * as A from './anim.js';
import { B } from './rig.js';
import { Projectile, AcidPool, spawnFire } from './items.js';
import { createPS1Material } from '../engine/ps1material.js';

const _v = new THREE.Vector3(), _v2 = new THREE.Vector3(), _v3 = new THREE.Vector3();
const sin = Math.sin, cos = Math.cos;
const rand = (a, b) => a + Math.random() * (b - a);

export function createSpecial(world, type, opts = {}) {
  switch (type) {
    case 'boomer': return new Boomer(world);
    case 'hunter': return new Hunter(world);
    case 'smoker': return new Smoker(world);
    case 'charger': return new Charger(world);
    case 'jockey': return new Jockey(world);
    case 'spitter': return new Spitter(world);
    case 'tank': return new Tank(world, opts);
    case 'witch': return new Witch(world, opts);
  }
  throw new Error('unknown special ' + type);
}

// ===================================================================== base
class Special extends Infected {
  constructor(world, type, hp, opts = {}) {
    super(world, { type, health: hp, radius: opts.radius || 0.38, height: opts.height || 1.8 });
    this.attachRig(buildSpecialModel(type));
    this.displayName = opts.name || type[0].toUpperCase() + type.slice(1);
    this.speed = opts.speed || 5.5;
    this.idleSoundT = rand(1, 4);
    this.idleSound = type + '_idle';
    this.victim = null;
    this.clawCd = 0;
    this.spawnTime = world.time;
    this.diff = DIFFICULTY[world.difficulty];
    this.reaction = 0;
    this.setState('approach');
  }
  get pinTarget() { return this.victim; }
  takeDamage(amount, info = {}) {
    if (!this.alive) return 0;
    if (info.type === 'bullet') amount *= this.type === 'tank' ? 1 : (HITGROUP[info.group] || 1);
    if (info.type === 'fire') amount *= 3 * 0.4;
    if (info.type === 'melee' && info.weapon && !info.weapon.chainsaw) amount = this.meleeDamage(info.weapon);
    const r = super.takeDamage(amount, info);
    if (this.alive && info.type !== 'fire') this.world.sound(this.type + '_idle', this.position, { volume: 0.4, randomPitch: 0.2, priority: 0 });
    return r;
  }
  meleeDamage(def) { return def.chainsaw ? def.dmg : this.maxHealth; }
  updateCommon(dt) {
    this.t += dt; this.stateT += dt;
    this.flinchT = Math.max(0, this.flinchT - dt);
    this.clawCd = Math.max(0, this.clawCd - dt);
    if (this.stagger > 0) this.stagger -= dt;
    if (this.burning > 0) {
      this.burning -= dt;
      this.takeDamage(this.type === 'tank' ? this.maxHealth / (this.diff === DIFFICULTY.expert ? 85 : this.diff === DIFFICULTY.advanced ? 80 : 75) * dt / 1.2 : 40 * dt, { type: 'fire', attacker: this.burnBy });
      if (Math.random() < dt * 10) this.world.effects.fireSprite(this.position.x + (Math.random() - 0.5) * 0.5, this.position.y + 0.5 + Math.random() * this.height * 0.8, this.position.z + (Math.random() - 0.5) * 0.5, 0.45, 0.8, { life: 0.4 });
    }
    this.idleSoundT -= dt;
    if (this.idleSoundT <= 0 && this.alive) {
      this.idleSoundT = rand(2.5, 5);
      this.world.sound(this.idleSound, this.position, { volume: 0.8, randomPitch: 0.1, priority: 1 });
    }
  }
  /** Generic approach towards the nearest survivor using the shared flow field. */
  approach(dt, speedMul = 1) {
    const w = this.world;
    if (!this.target || this.target.state === 'dead' || this.stateT > 3 && Math.random() < dt) this.target = this.pickTarget();
    if (!this.target) return false;
    const tp = this.target.body.pos;
    const d = tp.distanceTo(this.position);
    if (d < 3 && Math.abs(tp.y - this.position.y) < 1) return this.steerTo(tp.x, tp.z, this.speed * speedMul, dt);
    if (!this.followField(dt, w.fieldAll, this.speed * speedMul)) return this.steerTo(tp.x, tp.z, this.speed * speedMul * 0.5, dt);
    return true;
  }
  pickTarget() {
    let best = null, bd = Infinity;
    for (const s of this.world.survivors) {
      if (s.state === 'dead' || s.pinnedBy || s.state === 'ledge') continue;
      if (this.ignoreIncap && s.state === 'incap') continue;
      let d = s.body.pos.distanceTo(this.position);
      if (s.isPlayer) d *= 0.9;
      if (d < bd) { bd = d; best = s; }
    }
    return best;
  }
  claw(dt, dmg) {
    const t = this.target; if (!t || this.clawCd > 0) return;
    const d = t.body.pos.distanceTo(this.position);
    if (d < 1.4) {
      this.clawCd = 1; this.attackT = 0.01;
      t.takeDamage(dmg, { type: 'special', attacker: this, dir: _v.copy(t.body.pos).sub(this.position).normalize() });
      this.world.sound('zombie_hit_survivor', t.body.pos, { volume: 0.7 });
    }
  }
  pinVictim(s) {
    this.victim = s; s.pinnedBy = this;
    s.cancelAction();
    if (s.inv.carry) this.world.dropCarry(s, true);
    s.throwT = -1;
    this.world.events.emit('pinned', s, this);
    this.world.speak(s, 'pinned');
    this.world.message(`${s.name} is pinned by a ${this.displayName}!`, 'warn');
  }
  releaseVictim(byDeath = false) {
    const s = this.victim; if (!s) return;
    this.victim = null;
    if (s.pinnedBy === this) s.pinnedBy = null;
    s.tongueVictim = false;
    if (s.state === 'alive') { s.invuln = Math.max(s.invuln, 1.5); s.stunned = Math.max(s.stunned, 0.8); }
    this.world.events.emit('released', s, this);
  }
  die(info) {
    if (this.victim) {
      if (info.attacker && info.attacker.isSurvivor && info.attacker !== this.victim) { info.attacker.stats.protects++; this.world.message(`${info.attacker.name} protected ${this.victim.name}`, 'info'); }
      this.releaseVictim(true);
    }
    super.die(info);
    this.world.sound(this.type + '_death', this.position, { volume: 0.9 });
    if (this.type !== 'tank' && this.type !== 'witch' && info.type === 'explosion') {
      this.rig.mesh.visible = false;
      const c = this.center(_v2);
      for (let i = 0; i < 6; i++) this.world.effects.gibs.spawn(i < 2 ? 'arm' : i < 4 ? 'leg' : 'chunk', c, new THREE.Vector3((Math.random() - 0.5) * 8, 3 + Math.random() * 5, (Math.random() - 0.5) * 8), { bleed: true });
    }
  }
  remove() { if (this.victim) this.releaseVictim(true); super.remove(); }
  finishAnim(dt) {
    this.anim.apply(dt, 14);
    this.updateModelCommon(dt);
  }
  hasLOS(s, maxD) {
    const e = s.eyePos(_v); const me = _v2.set(this.position.x, this.position.y + this.height * 0.85, this.position.z);
    if (e.distanceTo(me) > maxD) return false;
    return !this.world.collision.blocked(me, e, { dynamic: false });
  }
}

// ===================================================================== Boomer
class Boomer extends Special {
  constructor(world) {
    super(world, 'boomer', SPECIAL.boomer.hp, { speed: SPECIAL.boomer.speed, radius: 0.48, name: 'Boomer' });
    this.vomitCd = 0; this.vomitT = 0; this.bodyRadius = 0.3;
  }
  update(dt) {
    if (!this.alive) { this.updateCorpse(dt); return; }
    this.updateCommon(dt);
    const w = this.world, C = SPECIAL.boomer;
    this.vomitCd = Math.max(0, this.vomitCd - dt);
    if (this.stagger > 0) { this.vel.multiplyScalar(0.9); this.vomitT = 0; this.integrate(dt); this.animate(dt); return; }
    if (this.vomitT > 0) {
      this.vomitT -= dt;
      this.vel.multiplyScalar(0.8);
      // spray particles & bile anybody in the cone
      const dir = _v3.set(sin(this.yaw), -0.15, cos(this.yaw)).normalize();
      const mouth = _v.set(this.position.x, this.position.y + 1.55, this.position.z).addScaledVector(dir, 0.3);
      for (let i = 0; i < 6; i++) w.effects.particles.spawn(mouth.x, mouth.y, mouth.z, dir.x * 9 + (Math.random() - 0.5) * 2, dir.y * 9 + Math.random() * 2, dir.z * 9 + (Math.random() - 0.5) * 2, 0.4, 0.55, 0.1, 1, 4, 0.8, 9.8, 0.3, w.effects.floorBelow(mouth));
      for (const s of w.survivors) {
        if (s.state === 'dead' || s.biled > 0) continue;
        const to = _v2.copy(s.eyePos(_v2)).sub(mouth); const d = to.length();
        if (d > C.vomitMax) continue;
        to.multiplyScalar(1 / d);
        if (to.dot(dir) > 0.82 && !w.collision.blocked(mouth, s.eyePos(new THREE.Vector3()), { dynamic: false })) w.bileSurvivor(s, this);
      }
      if (this.vomitT <= 0) { this.vomitCd = C.cooldown; this.setState('approach'); }
      this.integrate(dt); this.animate(dt); return;
    }
    this.approach(dt, 1);
    const t = this.target;
    if (t && this.vomitCd <= 0) {
      const d = t.body.pos.distanceTo(this.position);
      if (d < C.vomitRange && this.hasLOS(t, C.vomitRange + 1)) {
        this.reaction += dt;
        this.faceTo(t.body.pos.x - this.position.x, t.body.pos.z - this.position.z, dt, 8);
        if (this.reaction > this.diff.specialDelay * 0.7) {
          this.vomitT = C.vomitDuration; this.reaction = 0;
          w.sound('boomer_vomit', this.position, { volume: 1 });
        }
      } else this.reaction = Math.max(0, this.reaction - dt * 0.2);
    } else if (t) this.claw(dt, this.diff.claw);
    this.integrate(dt);
    this.animate(dt);
  }
  takeShove(attacker, dir) { if (!this.alive) return false; this.stagger = 1; this.vel.set(dir.x * 3, 0, dir.z * 3); this.vomitT = 0; return true; }
  die(info) {
    const w = this.world, C = SPECIAL.boomer;
    super.die(info);
    // burst: bile + knockback
    this.rig.mesh.visible = false;
    const c = this.center(new THREE.Vector3());
    w.sound('boomer_explode', c, { volume: 1 });
    w.effects.bileSplash(c, 60);
    for (let i = 0; i < 6; i++) w.effects.gibs.spawn(i < 2 ? 'chunk2' : i < 4 ? 'chunk' : 'bone', c, new THREE.Vector3((Math.random() - 0.5) * 8, 2 + Math.random() * 4, (Math.random() - 0.5) * 8), { bleed: true });
    const g = w.collision.groundAt(c.x, c.y, c.z, 3);
    if (g) w.effects.decals.add(new THREE.Vector3(c.x, g.y, c.z), g.normal, 3, 'bile');
    for (const s of w.survivors) {
      if (s.state === 'dead') continue;
      const d = s.body.pos.distanceTo(this.position);
      if (d < C.explodeInner) w.bileSurvivor(s, this);
      if (d < C.explodeOuter && s.state === 'alive' && !s.pinnedBy) { w.flingSurvivor(s, _v.copy(s.body.pos).sub(this.position).setY(0).normalize(), 3.5, 0.6); }
    }
    for (const z of w.infected) if (z.alive && z !== this && z.position.distanceTo(this.position) < C.explodeOuter) z.takeShove(null, _v.copy(z.position).sub(this.position).setY(0).normalize(), true);
  }
  animate(dt) {
    const a = this.anim, speed = Math.hypot(this.vel.x, this.vel.z);
    this.phase += speed * dt * 1.9;
    A.poseZombie(a, { phase: this.phase, speed: speed * 1.3, t: this.t, style: 1, stagger: this.stagger > 0 ? 1 - this.stagger : 0 });
    a.add('spine', -0.2, 0, 0); a.set('head', -0.1 + sin(this.t * 2) * 0.1, sin(this.t * 0.7) * 0.3, 0);
    a.set('upperArmL', -0.2 + sin(this.phase) * 0.3, 0, 0.6); a.set('upperArmR', -0.2 - sin(this.phase) * 0.3, 0, -0.6);
    if (this.vomitT > 0) { a.set('head', 0.5, 0, 0); a.set('neck', 0.3, 0, 0); a.add('spine', 0.4, 0, 0); a.set('upperArmL', -0.6, 0, 0.9); a.set('upperArmR', -0.6, 0, -0.9); }
    this.finishAnim(dt);
  }
}

// ===================================================================== Hunter
class Hunter extends Special {
  constructor(world) {
    super(world, 'hunter', SPECIAL.hunter.hp, { speed: SPECIAL.hunter.speed, name: 'Hunter' });
    this.idleSound = 'hunter_idle';
    this.pinPose = 'back'; this.controlsVictim = true;
    this.crouchT = 0; this.air = false; this.airVel = new THREE.Vector3(); this.shredT = 0; this.pounceCd = 0; this.dmgThisPounce = 0;
  }
  update(dt) {
    if (!this.alive) { this.updateCorpse(dt); return; }
    this.updateCommon(dt);
    const w = this.world, C = SPECIAL.hunter;
    this.pounceCd = Math.max(0, this.pounceCd - dt);
    if (this.air) { this.updateAir(dt); this.animate(dt); return; }
    if (this.victim) { this.updatePin(dt); this.animate(dt); return; }
    if (this.stagger > 0) { this.vel.multiplyScalar(0.9); this.integrate(dt); this.animate(dt); return; }
    const t = this.target;
    if (t && this.pounceCd <= 0) {
      const d = t.body.pos.distanceTo(this.position);
      if (d < C.readyRange && this.hasLOS(t, C.pounceRange)) {
        // crouch and get ready
        if (this.crouchT === 0) w.sound('hunter_idle', this.position, { volume: 1, pitch: 1.2 });
        this.crouchT += dt;
        this.vel.multiplyScalar(0.85);
        this.faceTo(t.body.pos.x - this.position.x, t.body.pos.z - this.position.z, dt, 10);
        if (this.crouchT > 0.5 + this.diff.specialDelay * 0.3) { this.pounce(t); this.crouchT = 0; }
        this.integrate(dt); this.animate(dt); return;
      }
    }
    this.crouchT = 0;
    this.approach(dt, 1);
    this.integrate(dt);
    this.animate(dt);
  }
  pounce(t) {
    const w = this.world, C = SPECIAL.hunter;
    const tp = _v.copy(t.body.pos).addScaledVector(t.body.vel, 0.25);
    const dx = tp.x - this.position.x, dz = tp.z - this.position.z, dy = tp.y - this.position.y;
    const dist = Math.hypot(dx, dz);
    const sp = Math.min(C.airSpeed, 6 + dist * 1.1);
    const tFlight = dist / sp;
    this.airVel.set(dx / dist * sp, Math.min(9, dy / Math.max(tFlight, 0.2) + 9.8 * 0.5 * tFlight + 1.2), dz / dist * sp);
    this.air = true; this.airT = 0; this.dmgThisPounce = 0;
    w.sound('hunter_scream', this.position, { volume: 1 });
    w.speak(t, 'spot_hunter', 0.3);
  }
  updateAir(dt) {
    const w = this.world;
    this.airT += dt;
    this.airVel.y -= 9.8 * dt;
    const step = _v.copy(this.airVel).multiplyScalar(dt);
    const len = step.length();
    // hit a survivor?
    for (const s of w.survivors) {
      if (s.state === 'dead' || s.pinnedBy || s.state === 'ledge') continue;
      const c = s.center(_v2);
      if (c.distanceTo(_v3.set(this.position.x, this.position.y + 0.6, this.position.z)) < 0.95) { this.land(); this.pinVictim(s); s.body.vel.set(0, 0, 0); return; }
    }
    const from = _v3.set(this.position.x, this.position.y + 0.5, this.position.z);
    const hit = w.collision.raycast(from, _v2.copy(step).normalize(), len + 0.3, { move: true });
    if (hit) {
      this.position.copy(hit.point).addScaledVector(hit.normal, 0.3); this.position.y -= 0.5;
      if (hit.normal.y > 0.6) { this.land(); return; }
      // bounce off walls (wall-jump-ish)
      this.airVel.addScaledVector(hit.normal, -1.2 * this.airVel.dot(hit.normal)).multiplyScalar(0.5);
    } else this.position.add(step);
    this.faceTo(this.airVel.x, this.airVel.z, dt, 20);
    const g = w.collision.groundAt(this.position.x, this.position.y + 0.6, this.position.z, 1);
    if (this.airVel.y < 0 && g && this.position.y <= g.y + 0.05) { this.position.y = g.y; this.land(); }
    if (this.airT > 3) this.land();
  }
  land() {
    this.air = false;
    this.node = this.world.nav.nearest(this.position.x, this.position.y + 0.3, this.position.z, 3);
    this.pounceCd = 0.3; this.vel.set(0, 0, 0);
  }
  takeDamage(amount, info) {
    if (this.air) this.dmgThisPounce += amount;
    const r = super.takeDamage(amount, info);
    if (this.alive && this.air && this.dmgThisPounce >= SPECIAL.hunter.interruptDamage) { this.airVel.multiplyScalar(0.2); }
    if (!this.alive && this.air && info.attacker && info.attacker.isSurvivor) this.world.message(`${info.attacker.name} skeeted a Hunter!`, 'kill');
    return r;
  }
  updatePin(dt) {
    const w = this.world, s = this.victim;
    if (!s || s.state === 'dead') { this.releaseVictim(); return; }
    this.position.copy(s.body.pos).addScaledVector(_v.set(sin(this.yaw), 0, cos(this.yaw)), 0.15);
    this.victimYaw = this.yaw + Math.PI;
    s.victimYaw = this.victimYaw;
    this.shredT -= dt;
    if (this.shredT <= 0) {
      this.shredT = SPECIAL.hunter.shredInterval;
      const dmg = this.diff.shred * (s.state === 'incap' ? 3 : 1);
      s.takeDamage(dmg, { type: 'special', attacker: this, interrupt: true });
      w.sound('hunter_shred', s.body.pos, { volume: 0.8, randomPitch: 0.1 });
      w.effects.blood(_v.set(s.body.pos.x, s.body.pos.y + 0.3, s.body.pos.z), _v2.set(Math.random() - 0.5, 1, Math.random() - 0.5), 0.5, { wall: false });
    }
  }
  onVictimShoved(by) { this.knockOff(by); }
  takeShove(attacker, dir) {
    if (!this.alive) return false;
    if (this.air) { this.airVel.set(dir.x * 2, 1, dir.z * 2); this.stagger = 1; return true; } // dead-stop
    if (this.victim) { this.knockOff(attacker); return true; }
    this.stagger = 1; this.vel.set(dir.x * 3, 0, dir.z * 3);
    return true;
  }
  knockOff(by) {
    const s = this.victim;
    this.releaseVictim();
    if (by && s && by !== s) { by.stats.protects++; this.world.message(`${by.name} saved ${s.name}`, 'info'); }
    this.position.addScaledVector(_v.set(-sin(this.yaw), 0, -cos(this.yaw)), 1.2);
    this.node = this.world.nav.nearest(this.position.x, this.position.y + 0.3, this.position.z, 3);
    this.stagger = 1.2; this.pounceCd = 1.2;
  }
  get noSeparate() { return !!this.victim || this.air; }
  animate(dt) {
    const a = this.anim, speed = Math.hypot(this.vel.x, this.vel.z);
    this.phase += speed * dt * 1.4;
    if (this.air) {
      a.reset(); a.set('spine', 0.9, 0, 0); a.set('upperArmL', -2.8, 0, 0.3); a.set('upperArmR', -2.8, 0, -0.3); a.set('thighL', 0.6, 0, 0); a.set('thighR', 0.4, 0, 0); a.set('shinL', 0.8, 0, 0); a.set('shinR', 1.0, 0, 0); a.set('head', -0.6, 0, 0);
    } else if (this.victim) {
      a.reset(); poseCrouchOn(a, this.t, 1);
    } else {
      A.poseZombie(a, { phase: this.phase, speed, t: this.t, style: 0, stagger: this.stagger > 0 ? 1 - this.stagger : 0 });
      const c = this.crouchT > 0 ? 1 : 0.65;
      a.add('thighL', -0.8 * c, 0, 0); a.add('thighR', -0.8 * c, 0, 0); a.add('shinL', 1.2 * c, 0, 0); a.add('shinR', 1.2 * c, 0, 0);
      a.add('spine', 0.6 * c, 0, 0); a.set('head', -0.6 * c, 0, 0); a.rootOffT.y -= 0.35 * c;
      if (this.crouchT > 0) { a.set('upperArmL', -0.4, 0, 0.3); a.set('upperArmR', -0.4, 0, -0.3); a.set('forearmL', -0.8, 0, 0); a.set('forearmR', -0.8, 0, 0); }
    }
    this.finishAnim(dt);
  }
}
function poseCrouchOn(a, t, k) {
  a.set('thighL', -1.4, 0, 0.4); a.set('thighR', -1.4, 0, -0.4); a.set('shinL', 2.0, 0, 0); a.set('shinR', 2.0, 0, 0);
  a.rootOffT.y = -0.65; a.set('spine', 1.0, 0, 0); a.set('chest', 0.3, 0, 0); a.set('head', -0.5, 0, 0);
  const s = sin(t * 16);
  a.set('upperArmL', -1.6 + s * 0.8, 0, 0.3); a.set('upperArmR', -1.6 - s * 0.8, 0, -0.3);
  a.set('forearmL', -0.6, 0, 0); a.set('forearmR', -0.6, 0, 0);
}

// ===================================================================== Smoker
class Smoker extends Special {
  constructor(world) {
    super(world, 'smoker', SPECIAL.smoker.hp, { speed: SPECIAL.smoker.speed, height: 2.0, name: 'Smoker' });
    this.pinPose = 'choke'; this.controlsVictim = true;
    this.tongueCd = rand(0, 3); this.tongue = null; this.chokeT = 0;
    // tongue visual: a thin chain of quads
    const geo = new THREE.BoxGeometry(0.05, 0.05, 1); geo.translate(0, 0, 0.5);
    const n = geo.getAttribute('position').count; const col = new Float32Array(n * 3).fill(1);
    geo.setAttribute('color', new THREE.BufferAttribute(col, 3));
    this.tongueMesh = new THREE.Mesh(geo, createPS1Material({ color: 0x8a2a3a, tint: true }));
    this.tongueMesh.visible = false;
    world.scene.add(this.tongueMesh);
  }
  update(dt) {
    if (!this.alive) { this.updateCorpse(dt); this.tongueMesh.visible = false; return; }
    this.updateCommon(dt);
    const w = this.world, C = SPECIAL.smoker;
    this.tongueCd = Math.max(0, this.tongueCd - dt);
    if (this.tongue) { this.updateTongue(dt); this.animate(dt); return; }
    if (this.stagger > 0) { this.vel.multiplyScalar(0.9); this.integrate(dt); this.animate(dt); return; }
    if (this.fleeT > 0) { this.fleeT -= dt; this.flee(dt); this.integrate(dt); this.animate(dt); return; }
    const t = this.target || (this.target = this.pickTarget());
    if (t && this.tongueCd <= 0) {
      const d = t.body.pos.distanceTo(this.position);
      if (d < C.tongueRange && d > 3 && this.hasLOS(t, C.tongueRange)) {
        this.reaction += dt;
        this.vel.multiplyScalar(0.8);
        this.faceTo(t.body.pos.x - this.position.x, t.body.pos.z - this.position.z, dt, 8);
        if (this.reaction > this.diff.specialDelay + 0.2) { this.shootTongue(t); this.reaction = 0; }
        this.integrate(dt); this.animate(dt); return;
      }
    }
    this.reaction = Math.max(0, this.reaction - dt);
    // keep some distance; approach until in range
    const d = t ? t.body.pos.distanceTo(this.position) : 99;
    if (d > C.tongueRange * 0.7 || this.tongueCd > 0 && d > 6) this.approach(dt, 0.9);
    else if (t && d < 6) this.claw(dt, this.diff.claw);
    else this.vel.multiplyScalar(0.85);
    this.integrate(dt);
    this.animate(dt);
  }
  flee(dt) {
    // move away from survivors along increasing field values
    const nav = this.world.nav, f = this.world.fieldAll;
    if (this.node < 0) return;
    let best = -1, bv = f[this.node];
    for (let d = 0; d < 8; d++) { const v = nav.link[this.node * 8 + d]; if (v >= 0 && nav.ltype[this.node * 8 + d] === 1 && f[v] > bv && f[v] < Infinity) { bv = f[v]; best = v; } }
    if (best >= 0) this.steerTo(nav.x[best], nav.z[best], this.speed, dt);
  }
  mouth(out) { const hb = this.updateHitboxes(); return out.copy(hb.head).add(_v.set(sin(this.yaw) * 0.12, -0.05, cos(this.yaw) * 0.12)); }
  shootTongue(t) {
    const w = this.world;
    this.tongue = { target: t, len: 0, state: 'fly', t: 0, progress: 0, lastDist: 99, noProgT: 0 };
    w.sound('smoker_tongue', this.position, { volume: 1 });
  }
  updateTongue(dt) {
    const w = this.world, C = SPECIAL.smoker, tg = this.tongue, s = tg.target;
    this.vel.multiplyScalar(0.7);
    const m = this.mouth(new THREE.Vector3());
    const tp = s.state === 'dead' ? m : _v3.set(s.body.pos.x, s.body.pos.y + 1.4, s.body.pos.z);
    const dist = m.distanceTo(tp);
    if (tg.state === 'fly') {
      tg.len += C.tongueSpeed * dt;
      if (s.state === 'dead' || s.pinnedBy || s.state === 'ledge') { this.missTongue(); return; }
      if (tg.len >= dist) {
        if (w.collision.blocked(m, tp, { dynamic: false }) || dist > C.tongueRange * 1.1) { this.missTongue(); return; }
        tg.state = 'pull'; this.pinVictim(s); s.tongueVictim = true;
        w.sound('smoker_drag', s.body.pos, { volume: 0.8 });
      }
      this.drawTongue(m, _v2.copy(m).add(_v.copy(tp).sub(m).normalize().multiplyScalar(Math.min(tg.len, dist))));
      return;
    }
    if (!s || s.state === 'dead' || s.pinnedBy !== this) { this.releaseTongue(); return; }
    this.drawTongue(m, tp);
    this.faceTo(s.body.pos.x - this.position.x, s.body.pos.z - this.position.z, dt, 6);
    const flat = Math.hypot(s.body.pos.x - this.position.x, s.body.pos.z - this.position.z);
    if (flat > 1.1 && tg.state === 'pull') {
      // drag the victim towards the smoker (using the victim's collision)
      const dir = _v.set(this.position.x - s.body.pos.x, 0, this.position.z - s.body.pos.z).normalize();
      s.body.vel.x = dir.x * C.dragSpeed; s.body.vel.z = dir.z * C.dragSpeed;
      if (this.position.y > s.body.pos.y + 0.5) s.body.vel.y = Math.max(s.body.vel.y, (this.position.y - s.body.pos.y) * 1.5);
      s.body.vel.y -= SURVIVOR.gravity * dt;
      if (s.state === 'alive') w.collision.moveCharacter(s.body, dt);
      // progress check -> snagged: choke in place
      if (tg.lastDist - flat < 0.25 * dt * 2) tg.noProgT += dt; else tg.noProgT = 0;
      tg.lastDist = flat;
      this.dragging = true;
      if (tg.noProgT > 0.5) { tg.state = 'choke'; }
    } else tg.state = 'choke';
    if (tg.state === 'choke') {
      this.dragging = false;
      s.body.vel.set(0, s.body.vel.y, 0);
      this.chokeT -= dt;
      if (this.chokeT <= 0) { this.chokeT = 1; s.takeDamage(this.diff.choke, { type: 'special', attacker: this }); w.sound('survivor_choke', s.body.pos, { volume: 0.6 }); }
    }
    this.victimYaw = Math.atan2(this.position.x - s.body.pos.x, this.position.z - s.body.pos.z) + Math.PI;
  }
  drawTongue(a, b) {
    const m = this.tongueMesh;
    m.visible = true;
    m.position.copy(a);
    m.lookAt(b);
    m.scale.set(1, 1, Math.max(0.01, a.distanceTo(b)));
  }
  missTongue() { this.tongue = null; this.tongueMesh.visible = false; this.tongueCd = SPECIAL.smoker.missCooldown; }
  releaseTongue() {
    this.tongue = null; this.tongueMesh.visible = false; this.tongueCd = SPECIAL.smoker.hitCooldown; this.dragging = false;
    this.releaseVictim();
    this.fleeT = 4;
  }
  onVictimShoved(by) { if (this.tongue && this.tongue.state !== 'fly') { by.stats.protects++; this.releaseTongue(); } }
  takeShove(attacker, dir) { if (!this.alive) return false; if (this.tongue) this.releaseTongue(); this.stagger = 1; this.vel.set(dir.x * 3, 0, dir.z * 3); return true; }
  onVictimIncapped() { }
  rayTest(o, d, maxT) {
    // the tongue itself can be shot
    if (this.tongue && this.tongue.state !== 'fly' && this.victim) {
      const a = this.mouth(_v), b = _v2.set(this.victim.body.pos.x, this.victim.body.pos.y + 1.4, this.victim.body.pos.z);
      const t = segTest(o, d, a, b, 0.12, maxT);
      if (t !== null) { const r = super.rayTest(o, d, maxT); if (!r || t < r.t) return { t, group: 'tongue' }; }
    }
    return super.rayTest(o, d, maxT);
  }
  takeDamage(amount, info = {}) {
    if (info.group === 'tongue') { if (info.attacker && info.attacker.isSurvivor) info.attacker.stats.protects++; this.releaseTongue(); return 0; }
    if (info.type === 'melee' && info.slash && this.tongue && this.tongue.state === 'fly') { this.missTongue(); }
    return super.takeDamage(amount, info);
  }
  die(info) {
    if (this.tongue) { this.tongue = null; this.tongueMesh.visible = false; }
    super.die(info);
    const w = this.world, c = this.center(new THREE.Vector3());
    for (let i = 0; i < 18; i++) w.effects.smokePuff(c.x + (Math.random() - 0.5) * 3, c.y + (Math.random() - 0.5), c.z + (Math.random() - 0.5) * 3, { size: 2.2, grow: 1.2, life: 8 + Math.random() * 4, r: 0.22, g: 0.26, b: 0.2, a: 0.7, vy: 0.15 });
    for (const s of w.survivors) if (s.state === 'alive' && s.body.pos.distanceTo(this.position) < SPECIAL.smoker.cloudRadius) w.sound('survivor_cough', s.body.pos, { volume: 0.6 });
  }
  remove() { this.world.scene.remove(this.tongueMesh); super.remove(); }
  animate(dt) {
    const a = this.anim, speed = Math.hypot(this.vel.x, this.vel.z);
    this.phase += speed * dt * 1.5;
    A.poseZombie(a, { phase: this.phase, speed: speed * 0.9, t: this.t, style: 0, stagger: this.stagger > 0 ? 1 - this.stagger : 0 });
    a.add('spine', 0.15, 0, 0);
    if (this.tongue) { a.set('head', -0.3, 0, 0); a.set('upperArmL', -1.0, 0, 0.6); a.set('upperArmR', -1.3, 0, -0.5); a.set('forearmL', -0.8, 0, 0); a.set('forearmR', -1.0, 0, 0); }
    if (this.reaction > 0 && !this.tongue) { a.set('head', -0.2, 0, 0); a.add('chest', -0.15, 0, 0); }
    this.finishAnim(dt);
  }
}
function segTest(o, d, a, b, r, maxT) {
  const ux = d.x, uy = d.y, uz = d.z;
  const vx = b.x - a.x, vy = b.y - a.y, vz = b.z - a.z;
  const wx = o.x - a.x, wy = o.y - a.y, wz = o.z - a.z;
  const B_ = ux * vx + uy * vy + uz * vz, C_ = vx * vx + vy * vy + vz * vz, D_ = ux * wx + uy * wy + uz * wz, E_ = vx * wx + vy * wy + vz * wz;
  const den = C_ - B_ * B_;
  let t = den > 1e-8 ? (E_ - B_ * D_) / den : 0; t = Math.max(0, Math.min(1, t));
  let s = B_ * t - D_; if (s < 0 || s > maxT) return null;
  const px = o.x + ux * s - (a.x + vx * t), py = o.y + uy * s - (a.y + vy * t), pz = o.z + uz * s - (a.z + vz * t);
  return px * px + py * py + pz * pz < r * r ? s : null;
}

// ===================================================================== Charger
class Charger extends Special {
  constructor(world) {
    super(world, 'charger', SPECIAL.charger.hp, { speed: SPECIAL.charger.speed, radius: 0.5, height: 1.95, name: 'Charger' });
    this.pinPose = 'carried'; this.controlsVictim = true;
    this.chargeCd = rand(0, 0.5); this.chargeT = 0; this.warm = 0; this.poundT = 0; this.heavy = true;
    this.chargeDir = new THREE.Vector3(); this.bodyRadius = 0.24; this.armRadiusMul = 2;
    this.hitSet = new Set();
  }
  meleeDamage(def) { return def.chainsaw ? def.dmg : 390; }
  update(dt) {
    if (!this.alive) { this.updateCorpse(dt); return; }
    this.updateCommon(dt);
    const w = this.world, C = SPECIAL.charger;
    this.chargeCd = Math.max(0, this.chargeCd - dt);
    if (this.state === 'charge') { this.updateCharge(dt); this.animate(dt); return; }
    if (this.state === 'pummel') { this.updatePummel(dt); this.animate(dt); return; }
    if (this.stagger > 0) { this.vel.multiplyScalar(0.9); this.integrate(dt); this.animate(dt); return; }
    if (this.warm > 0) {
      this.warm -= dt;
      const t = this.target;
      if (t) this.faceTo(t.body.pos.x - this.position.x, t.body.pos.z - this.position.z, dt, 12);
      this.vel.multiplyScalar(0.7);
      if (this.warm <= 0) this.startCharge();
      this.integrate(dt); this.animate(dt); return;
    }
    const t = this.target;
    if (t && this.chargeCd <= 0) {
      const d = t.body.pos.distanceTo(this.position);
      const knee = _v.set(this.position.x, this.position.y + 0.6, this.position.z), tk = _v2.set(t.body.pos.x, t.body.pos.y + 0.6, t.body.pos.z);
      if (d < 14 && d > 1.8 && Math.abs(t.body.pos.y - this.position.y) < 1 && this.hasLOS(t, 15) && !w.collision.blocked(knee, tk, { move: true, dynamic: false })) {
        this.reaction += dt;
        this.lining = true;
        if (this.reaction > this.diff.specialDelay * 0.6) { this.warm = C.warmup; this.reaction = 0; w.sound('charger_charge', this.position, { volume: 1 }); }
      } else this.lining = false;
    } else this.lining = false;
    if (t && t.body.pos.distanceTo(this.position) < 1.6) this.claw(dt, this.diff.chargerPunch);
    if (this.lining && t) { this.vel.multiplyScalar(0.8); this.faceTo(t.body.pos.x - this.position.x, t.body.pos.z - this.position.z, dt, 8); }
    else this.approach(dt, 1);
    this.integrate(dt);
    this.animate(dt);
  }
  startCharge() {
    this.setState('charge'); this.chargeT = 0; this.hitSet.clear();
    this.chargeDir.set(sin(this.yaw), 0, cos(this.yaw));
  }
  updateCharge(dt) {
    const w = this.world, C = SPECIAL.charger;
    this.chargeT += dt;
    const sp = C.speed + (C.chargeSpeed - C.speed) * Math.min(1, this.chargeT / 0.8);
    this.vel.set(this.chargeDir.x * sp, 0, this.chargeDir.z * sp);
    // impacts on survivors
    for (const s of w.survivors) {
      if (s.state !== 'alive' || s.pinnedBy || this.hitSet.has(s)) continue;
      const dx = s.body.pos.x - this.position.x, dz = s.body.pos.z - this.position.z;
      const d = Math.hypot(dx, dz);
      if (d < 1.1 && Math.abs(s.body.pos.y - this.position.y) < 1.2) {
        this.hitSet.add(s);
        if (!this.victim) { this.pinVictim(s); w.sound('charger_impact', s.body.pos); s.takeDamage(this.diff.chargerPunch, { type: 'special', attacker: this }); }
        else { s.takeDamage(this.diff.chargerPunch, { type: 'special', attacker: this }); const side = _v.set(dx, 0, dz).normalize(); w.flingSurvivor(s, side.addScaledVector(this.chargeDir, 0.6).normalize(), 7, 4); w.sound('charger_impact', s.body.pos); }
      }
    }
    // knock commons aside
    w.nearbyInfected(this.position.x, this.position.z, (z) => { if (z !== this && z.alive && z.type === 'common' && z.position.distanceTo(this.position) < 1.2) z.takeShove(null, _v.copy(z.position).sub(this.position).setY(0).normalize(), true); });
    const before = _v2.copy(this.position);
    this.integrate(dt);
    const moved = before.distanceTo(this.position);
    if (this.victim) {
      const s = this.victim;
      s.body.pos.set(this.position.x + this.chargeDir.x * 0.7, this.position.y + 0.25, this.position.z + this.chargeDir.z * 0.7);
      s.body.vel.set(0, 0, 0);
      this.victimYaw = this.yaw;
    }
    const blocked = moved < sp * dt * 0.3 && this.chargeT > 0.15;
    if (blocked || this.chargeT > C.chargeTime) {
      if (blocked) { w.sound('charger_impact', this.position, { volume: 1 }); w.events.emit('shake', this.position, 0.5); }
      if (this.victim) {
        if (blocked) this.victim.takeDamage(this.diff.chargerPunch, { type: 'special', attacker: this });
        this.setState('pummel'); this.poundT = 0.6;
      } else { this.setState('approach'); this.chargeCd = C.cooldown; if (blocked) this.stagger = 1.2; }
    }
  }
  updatePummel(dt) {
    const w = this.world, s = this.victim, C = SPECIAL.charger;
    if (!s || s.state === 'dead') { this.releaseVictim(); this.setState('approach'); this.chargeCd = C.cooldown; return; }
    this.vel.set(0, 0, 0);
    s.body.pos.set(this.position.x + sin(this.yaw) * 0.9, this.position.y, this.position.z + cos(this.yaw) * 0.9);
    // keep the victim on the floor
    const g = w.collision.groundAt(s.body.pos.x, s.body.pos.y + 0.6, s.body.pos.z, 2);
    if (g) s.body.pos.y = g.y;
    this.victimYaw = this.yaw;
    this.pinPose = 'back';
    this.poundT -= dt;
    if (this.poundT <= 0) {
      this.poundT = C.poundInterval; this.poundAnim = 0.01;
      s.takeDamage(C.poundDmg, { type: 'special', attacker: this });
      w.sound('charger_pummel', s.body.pos, { volume: 1 });
      w.events.emit('shake', s.body.pos, 0.3);
      w.effects.blood(_v.set(s.body.pos.x, s.body.pos.y + 0.2, s.body.pos.z), _v2.set(0, 1, 0), 0.4, { wall: false });
    }
    if (this.poundAnim > 0) { this.poundAnim += dt * 2.5; if (this.poundAnim > 1) this.poundAnim = 0; }
  }
  releaseVictim(byDeath) { this.pinPose = 'carried'; super.releaseVictim(byDeath); }
  takeShove() { return false; } // immune
  get noSeparate() { return !!this.victim; }
  animate(dt) {
    const a = this.anim, speed = Math.hypot(this.vel.x, this.vel.z);
    this.phase += speed * dt * 1.3;
    A.poseZombie(a, { phase: this.phase, speed, t: this.t, style: 0, stagger: this.stagger > 0 ? 1 - this.stagger / 1.2 : 0 });
    a.add('spine', 0.25, 0, 0); a.set('head', -0.3, 0, 0);
    a.set('upperArmR', -0.3 + sin(this.phase) * 0.5, 0, -0.35); a.set('forearmR', -0.5, 0, 0);
    if (this.state === 'charge' || this.warm > 0) { a.add('spine', 0.5, 0, 0); a.set('chest', 0.3, 0.4, 0); a.set('upperArmR', -0.9, 0, -0.2); a.set('upperArmL', 0.4, 0, 0.3); }
    if (this.state === 'pummel') {
      const k = this.poundAnim > 0 ? (this.poundAnim < 0.4 ? this.poundAnim / 0.4 : 1 - (this.poundAnim - 0.4) / 0.6) : 0;
      a.set('upperArmR', -2.8 * (1 - k) - 0.6 * k, 0, -0.2); a.set('upperArmL', -2.6 * (1 - k) - 0.5 * k, 0, 0.2); a.add('spine', 0.6 * k + 0.2, 0, 0);
    }
    this.finishAnim(dt);
  }
}

// ===================================================================== Jockey
class Jockey extends Special {
  constructor(world) {
    super(world, 'jockey', SPECIAL.jockey.hp, { speed: SPECIAL.jockey.speed, radius: 0.3, height: 1.3, name: 'Jockey' });
    this.pinPose = 'ride'; this.controlsVictim = false;
    this.leapCd = rand(0.5, 2); this.air = false; this.airVel = new THREE.Vector3(); this.rideT = 0; this.steer = new THREE.Vector3(); this.steerT = 0;
    this.hopT = 0;
  }
  update(dt) {
    if (!this.alive) { this.updateCorpse(dt); return; }
    this.updateCommon(dt);
    const w = this.world, C = SPECIAL.jockey;
    this.leapCd = Math.max(0, this.leapCd - dt);
    if (this.air) { this.updateAir(dt); this.animate(dt); return; }
    if (this.victim) { this.updateRide(dt); this.animate(dt); return; }
    if (this.stagger > 0) { this.vel.multiplyScalar(0.9); this.integrate(dt); this.animate(dt); return; }
    const t = this.target;
    if (t && this.leapCd <= 0 && t.state === 'alive' && !t.pinnedBy) {
      const d = t.body.pos.distanceTo(this.position);
      if (d < C.leapRange * 1.4 && this.hasLOS(t, 8)) {
        const dx = t.body.pos.x - this.position.x, dz = t.body.pos.z - this.position.z;
        const fl = Math.hypot(dx, dz);
        this.airVel.set(dx / fl * 8, 4.2, dz / fl * 8);
        this.air = true; this.airT = 0;
        w.sound('jockey_leap', this.position, { volume: 1 });
        this.animate(dt); return;
      }
    }
    // erratic hopping approach
    this.hopT -= dt;
    this.approach(dt, 1);
    if (this.hopT <= 0) { this.hopT = rand(0.3, 0.8); this.vel.x += (Math.random() - 0.5) * 4; this.vel.z += (Math.random() - 0.5) * 4; }
    if (t && t.body.pos.distanceTo(this.position) < 1.2) this.claw(dt, this.diff.claw);
    this.integrate(dt);
    this.animate(dt);
  }
  updateAir(dt) {
    const w = this.world;
    this.airT += dt;
    this.airVel.y -= 9.8 * dt;
    this.position.addScaledVector(this.airVel, dt);
    for (const s of w.survivors) {
      if (s.state !== 'alive' || s.pinnedBy) continue;
      if (s.center(_v2).distanceTo(_v3.set(this.position.x, this.position.y + 0.6, this.position.z)) < 0.9) { this.air = false; this.pinVictim(s); this.rideT = 1; w.sound('jockey_ride', s.body.pos, { volume: 1 }); return; }
    }
    const g = w.collision.groundAt(this.position.x, this.position.y + 0.8, this.position.z, 1.2);
    if ((this.airVel.y < 0 && g && this.position.y <= g.y + 0.02) || this.airT > 2) {
      if (g) this.position.y = g.y;
      this.air = false; this.leapCd = 0.4;
      this.node = w.nav.nearest(this.position.x, this.position.y + 0.3, this.position.z, 3);
    }
    const hit = w.collision.raycast(_v.set(this.position.x, this.position.y + 0.6, this.position.z), _v2.copy(this.airVel).normalize(), 0.4, { move: true });
    if (hit && hit.normal.y < 0.5) { this.airVel.x *= -0.3; this.airVel.z *= -0.3; }
  }
  updateRide(dt) {
    const w = this.world, s = this.victim;
    if (!s || s.state !== 'alive') { this.dismount(6); return; }
    // sit on the victim's head
    const hb = s.rig.bones;
    this.position.set(s.body.pos.x, s.body.pos.y + 1.15, s.body.pos.z);
    this.yaw = s.yaw + Math.PI;
    // damage over time
    this.rideT -= dt;
    if (this.rideT <= 0) { this.rideT = 1; s.takeDamage(this.diff.ride, { type: 'special', attacker: this }); }
    // steer: towards hazards / away from the team, re-evaluated every couple of seconds
    this.steerT -= dt;
    if (this.steerT <= 0) {
      this.steerT = rand(1.2, 2.5);
      let away = new THREE.Vector3();
      for (const o of w.survivors) if (o !== s && o.state !== 'dead') away.add(_v.copy(s.body.pos).sub(o.body.pos).setY(0));
      if (away.lengthSq() < 0.01) away.set(Math.random() - 0.5, 0, Math.random() - 0.5);
      away.normalize();
      // look for a hazard (fire, acid, ledge drop) nearby
      for (const h of w.hazards) if (h.pos.distanceTo(s.body.pos) < 15) { away.copy(h.pos).sub(s.body.pos).setY(0).normalize(); break; }
      this.steer.copy(away).applyAxisAngle(_v.set(0, 1, 0), (Math.random() - 0.5) * 1.2);
    }
    // the victim resists by pushing the opposite way (their own movement input)
    const it = s.intent;
    const fwd = _v.set(-sin(s.yaw), 0, -cos(s.yaw)), right = _v2.set(cos(s.yaw), 0, -sin(s.yaw));
    const wish = _v3.set(0, 0, 0).addScaledVector(fwd, it.moveY).addScaledVector(right, it.moveX);
    const resist = s.isBot ? 0.25 : 0.55;
    const dir = this.steer.clone().multiplyScalar(1).addScaledVector(wish, resist);
    if (dir.lengthSq() > 1e-4) dir.normalize();
    const sp = SURVIVOR.runSpeed * 0.75;
    s.body.vel.x = dir.x * sp; s.body.vel.z = dir.z * sp;
    s.body.vel.y -= SURVIVOR.gravity * dt;
    w.collision.moveCharacter(s.body, dt);
    // ledge? jockeyed survivors can be dragged off edges
    if (!s.body.grounded && s.body.vel.y < -2) { const g = w.collision.groundAt(s.body.pos.x, s.body.pos.y, s.body.pos.z, 7); if (!g || s.body.pos.y - g.y > 5) { this.dismount(3); s.lastGrounded.copy(s.body.pos); s.grabLedge(); return; } }
    s.phase += Math.hypot(s.body.vel.x, s.body.vel.z) * dt * 1.6;
    this.node = w.nav.nearest(this.position.x, s.body.pos.y + 0.3, this.position.z, 2);
  }
  dismount(cd) {
    const s = this.victim;
    this.releaseVictim();
    if (s) { this.position.copy(s.body.pos).add(_v.set((Math.random() - 0.5) * 2, 0, (Math.random() - 0.5) * 2)); }
    this.node = this.world.nav.nearest(this.position.x, this.position.y + 0.3, this.position.z, 3);
    if (this.node >= 0) this.position.y = this.world.nav.y[this.node];
    this.leapCd = cd; this.stagger = 0.8;
  }
  onVictimIncapped() { this.dismount(30); }
  onVictimShoved(by) { if (by) by.stats.protects++; this.dismount(5); }
  takeShove(attacker, dir) {
    if (!this.alive) return false;
    if (this.victim) { this.dismount(5); return true; }
    if (this.air) { this.airVel.set(dir.x * 2, 0, dir.z * 2); }
    this.stagger = 1; this.vel.set(dir.x * 3, 0, dir.z * 3); return true;
  }
  get noSeparate() { return !!this.victim || this.air; }
  animate(dt) {
    const a = this.anim, speed = Math.hypot(this.vel.x, this.vel.z);
    this.phase += speed * dt * 2.2;
    if (this.victim) {
      a.reset();
      a.set('thighL', -1.6, 0, 0.8); a.set('thighR', -1.6, 0, -0.8); a.set('shinL', 1.8, 0, 0); a.set('shinR', 1.8, 0, 0);
      a.set('upperArmL', -2.6 + sin(this.t * 12) * 0.3, 0, 0.3); a.set('upperArmR', -2.6 + cos(this.t * 11) * 0.3, 0, -0.3);
      a.set('forearmL', -1.4, 0, 0); a.set('forearmR', -1.4, 0, 0); a.set('spine', 0.5, 0, 0); a.set('head', sin(this.t * 8) * 0.3, sin(this.t * 5) * 0.5, 0);
      a.rootOffT.y = -0.1;
      this.rig.mesh.position.set(this.position.x, this.position.y, this.position.z);
    } else if (this.air) {
      a.reset(); a.set('upperArmL', -2.6, 0, 0.6); a.set('upperArmR', -2.6, 0, -0.6); a.set('thighL', -1.2, 0, 0.4); a.set('thighR', -1.2, 0, -0.4); a.set('shinL', 1.4, 0, 0); a.set('shinR', 1.4, 0, 0);
    } else {
      A.poseZombie(a, { phase: this.phase, speed: speed * 1.2, t: this.t, style: 2, stagger: this.stagger > 0 ? 1 - this.stagger : 0 });
      a.add('spine', 0.7, 0, 0); a.set('head', -0.8, 0, 0); a.add('thighL', -0.5, 0, 0); a.add('thighR', -0.5, 0, 0); a.add('shinL', 0.8, 0, 0); a.add('shinR', 0.8, 0, 0); a.rootOffT.y -= 0.15;
      a.rootOffT.y += Math.abs(sin(this.phase * 1.5)) * 0.15;
    }
    this.finishAnim(dt);
  }
}

// ===================================================================== Spitter
class Spitter extends Special {
  constructor(world) {
    super(world, 'spitter', SPECIAL.spitter.hp, { speed: SPECIAL.spitter.speed, name: 'Spitter' });
    this.spitCd = rand(0, 2); this.spitT = 0; this.fleeT = 0;
    this.glowLight = world.addLight(this.position, new THREE.Color(0.3, 0.9, 0.1), 3, 99, 0.5, { persist: true, follow: this });
  }
  update(dt) {
    if (!this.alive) { this.updateCorpse(dt); return; }
    this.updateCommon(dt);
    const w = this.world, C = SPECIAL.spitter;
    this.spitCd = Math.max(0, this.spitCd - dt);
    if (this.spitT > 0) {
      this.spitT -= dt; this.vel.multiplyScalar(0.7);
      if (this.target) this.faceTo(this.target.body.pos.x - this.position.x, this.target.body.pos.z - this.position.z, dt, 10);
      if (this.spitT <= 0) { this.spit(this.target); this.fleeT = 5; }
      this.integrate(dt); this.animate(dt); return;
    }
    if (this.stagger > 0) { this.vel.multiplyScalar(0.9); this.integrate(dt); this.animate(dt); return; }
    if (this.fleeT > 0) { this.fleeT -= dt; Smoker.prototype.flee.call(this, dt); this.integrate(dt); this.animate(dt); return; }
    const t = this.target || (this.target = this.pickTarget());
    if (t && this.spitCd <= 0) {
      const d = t.body.pos.distanceTo(this.position);
      if (d < C.range && this.hasLOS(t, C.range)) {
        this.reaction += dt;
        if (this.reaction > this.diff.specialDelay * 0.5 + 0.3) { this.spitT = 0.4; this.reaction = 0; w.sound('spitter_spit', this.position, { volume: 1 }); }
      }
    }
    if (!t || t.body.pos.distanceTo(this.position) > 10 || this.spitCd > 0) this.approach(dt, 1);
    else this.vel.multiplyScalar(0.8);
    if (t && t.body.pos.distanceTo(this.position) < 1.3) this.claw(dt, this.diff.claw);
    this.integrate(dt);
    this.animate(dt);
  }
  spit(t) {
    if (!t) return;
    const w = this.world;
    const from = new THREE.Vector3(this.position.x, this.position.y + 1.6, this.position.z);
    const to = t.body.pos.clone().addScaledVector(t.body.vel, 0.5);
    const dx = to.x - from.x, dz = to.z - from.z, dy = to.y - from.y;
    const dist = Math.hypot(dx, dz);
    const sp = Math.max(8, Math.min(SPECIAL.spitter.projSpeed, dist * 1.3));
    const tf = dist / sp;
    const vy = dy / tf + 0.5 * 13 * tf;
    const p = new Projectile(w, 'spit', from, new THREE.Vector3(dx / dist * sp, vy, dz / dist * sp), this);
    w.projectiles.push(p);
    this.spitCd = SPECIAL.spitter.cooldown;
  }
  die(info) {
    super.die(info);
    this.world.removeLight(this.glowLight);
    const w = this.world;
    const g = w.collision.groundAt(this.position.x, this.position.y + 0.5, this.position.z, 2);
    if (g) w.hazards.push(new AcidPool(w, new THREE.Vector3(this.position.x, g.y, this.position.z), this, { radius: 1.1, duration: 4 }));
  }
  remove() { this.world.removeLight(this.glowLight); super.remove(); }
  animate(dt) {
    const a = this.anim, speed = Math.hypot(this.vel.x, this.vel.z);
    this.phase += speed * dt * 1.6;
    A.poseZombie(a, { phase: this.phase, speed, t: this.t, style: 2, stagger: this.stagger > 0 ? 1 - this.stagger : 0 });
    a.set('head', -0.2 + sin(this.t * 3) * 0.15, sin(this.t * 1.3) * 0.4, 0);
    if (this.spitT > 0) { const k = 1 - this.spitT / 0.4; a.set('spine', -0.4 + k * 1.0, 0, 0); a.set('head', -0.5 + k, 0, 0); }
    this.finishAnim(dt);
  }
}

// ===================================================================== Tank
class Tank extends Special {
  constructor(world, opts = {}) {
    const diff = DIFFICULTY[world.difficulty];
    super(world, 'tank', diff.tankHp, { speed: SPECIAL.tank.speed, radius: 0.85, height: 2.3, name: 'Tank' });
    this.heavy = true; this.bodyRadius = 0.42; this.headRadius = 0.12; this.armRadiusMul = 2.8;
    this.punchCd = 0; this.windup = 0; this.throwCd = rand(4, 8); this.throwT = 0; this.tauntT = 0;
    this.noCull = true;
    this.aware = !!opts.aware;
    this.ignoreIncap = false;
    this.stepT = 0;
    this.lastHitTime = world.time;
    this.speedBase = SPECIAL.tank.speed;
    world.sound('tank_roar', this.position, { volume: 1 });
  }
  meleeDamage(def) { return def.chainsaw ? def.dmg : this.maxHealth * 0.05; }
  pickTarget() {
    // bile > closest; avoid pinned/incapped unless nothing else
    let best = null, bd = Infinity;
    for (const s of this.world.survivors) {
      if (s.state === 'dead' || s.state === 'ledge') continue;
      let d = s.body.pos.distanceTo(this.position);
      if (s.biled > 0) d *= 0.1;
      if (s.pinnedBy || s.state === 'incap') d *= 3;
      if (d < bd) { bd = d; best = s; }
    }
    return best;
  }
  update(dt) {
    if (!this.alive) { this.updateDeath(dt); return; }
    this.updateCommon(dt);
    const w = this.world, C = SPECIAL.tank;
    this.punchCd = Math.max(0, this.punchCd - dt);
    this.throwCd = Math.max(0, this.throwCd - dt);
    // footsteps & screen shake
    const speed = Math.hypot(this.vel.x, this.vel.z);
    this.stepT -= dt * speed;
    if (this.stepT <= 0) { this.stepT = 1.6; w.sound('step_tank', this.position, { volume: 1 }); w.events.emit('shake', this.position, 0.25); }
    if (!this.aware) {
      for (const s of w.survivors) if (s.state !== 'dead' && s.body.pos.distanceTo(this.position) < 25 && this.hasLOS(s, 26)) { this.aware = true; w.sound('tank_roar', this.position, { volume: 1 }); w.events.emit('tankAware', this); }
      this.vel.multiplyScalar(0.8); this.animate(dt); return;
    }
    if (this.throwT > 0) { this.updateThrow(dt); this.animate(dt); return; }
    if (this.windup > 0) {
      this.windup -= dt;
      this.vel.multiplyScalar(0.6);
      if (this.windup <= 0) this.punch();
      this.integrate(dt); this.animate(dt); return;
    }
    if (this.tauntT > 0) { this.tauntT -= dt; this.vel.multiplyScalar(0.8); this.animate(dt); return; }
    if (!this.target || this.target.state === 'dead' || this.stateT > 2) { this.target = this.pickTarget(); this.stateT = 0; }
    const t = this.target;
    if (!t) { this.vel.multiplyScalar(0.9); this.animate(dt); return; }
    const d = t.body.pos.distanceTo(this.position);
    if (d < C.punchRange && this.punchCd <= 0 && Math.abs(t.body.pos.y - this.position.y) < 1.6) { this.windup = C.windup * 0.6; this.punchDir = Math.atan2(t.body.pos.x - this.position.x, t.body.pos.z - this.position.z); }
    else if (d > C.throwMin && d < 40 && this.throwCd <= 0 && this.hasLOS(t, 40) && (w.fieldAll[this.node] > d * 1.4 || Math.random() < 0.3)) { this.throwT = 1.6; this.throwTarget = t; w.sound('tank_rock_rip', this.position, { volume: 1 }); }
    const sp = this.speedBase * (this.burning > 0 ? 0.85 : 1);
    if (d < 2.5 && Math.abs(t.body.pos.y - this.position.y) < 1) this.steerTo(t.body.pos.x, t.body.pos.z, sp, dt);
    else if (!this.followField(dt, w.fieldAll, sp)) this.steerTo(t.body.pos.x, t.body.pos.z, sp * 0.5, dt);
    // swat commons out of the way
    w.nearbyInfected(this.position.x, this.position.z, (z) => { if (z.alive && z.type === 'common' && z.position.distanceTo(this.position) < 1.3) z.takeDamage(z.health, { type: 'melee', dir: _v.copy(z.position).sub(this.position).setY(0).normalize(), weapon: { type: 'club', kind: 'melee' } }); });
    this.integrate(dt);
    this.animate(dt);
  }
  punch() {
    const w = this.world, C = SPECIAL.tank;
    this.punchAnim = 0.01;
    let hit = false;
    for (const s of w.survivors) {
      if (s.state === 'dead') continue;
      const dx = s.body.pos.x - this.position.x, dz = s.body.pos.z - this.position.z;
      const d = Math.hypot(dx, dz);
      const facing = (sin(this.yaw) * dx + cos(this.yaw) * dz) / Math.max(d, 0.01);
      if (d < C.punchRange + 0.4 && facing > -0.1 && Math.abs(s.body.pos.y - this.position.y) < 1.8) {
        hit = true;
        if (s.state === 'incap') { s.takeDamage(this.diff.tankPound, { type: 'tank', attacker: this }); }
        else {
          if (s.pinnedBy) s.pinnedBy.releaseVictim && s.pinnedBy.releaseVictim();
          s.takeDamage(this.diff.tankPunch, { type: 'tank', attacker: this, dir: _v.set(dx, 0, dz).normalize() });
          if (s.state === 'alive') w.flingSurvivor(s, _v.set(dx, 0, dz).normalize(), 9, 5);
        }
        w.sound('tank_punch', s.body.pos, { volume: 1 });
        w.events.emit('shake', s.body.pos, 0.8);
      }
    }
    this.punchCd = hit ? C.swingInterval : C.missInterval;
    if (hit) { this.lastHitTime = w.time; if (Math.random() < 0.4 && w.difficulty !== 'expert') this.tauntT = w.difficulty === 'easy' ? 2.5 : 1.2; this.target = this.pickTarget(); }
  }
  updateThrow(dt) {
    const w = this.world;
    this.throwT -= dt;
    this.vel.multiplyScalar(0.6);
    const t = this.throwTarget;
    if (t) this.faceTo(t.body.pos.x - this.position.x, t.body.pos.z - this.position.z, dt, 6);
    if (this.throwT <= 0.35 && !this.thrown && t) {
      this.thrown = true;
      const from = new THREE.Vector3(this.position.x, this.position.y + 2.6, this.position.z);
      const to = t.body.pos.clone().addScaledVector(t.body.vel, 0.5).add(_v.set(0, 1, 0));
      const dx = to.x - from.x, dz = to.z - from.z, dy = to.y - from.y;
      const dist = Math.hypot(dx, dz);
      const sp = Math.min(800 * U * 1.1, Math.max(12, dist * 1.4));
      const tf = dist / sp;
      const g = 9;
      const r = new Projectile(w, 'rock', from, new THREE.Vector3(dx / dist * sp, dy / tf + 0.5 * g * tf, dz / dist * sp), this);
      w.projectiles.push(r);
      w.sound('tank_rock_throw', this.position, { volume: 1 });
    }
    if (this.throwT <= 0) { this.thrown = false; this.throwCd = SPECIAL.tank.throwInterval + rand(0, 4); this.target = this.pickTarget(); }
  }
  takeShove() { return false; }
  takeDamage(amount, info = {}) {
    if (!this.aware && info.attacker) { this.aware = true; this.world.events.emit('tankAware', this); }
    if (info.type === 'explosion' && !info.noStumble) this.stagger = 0.6;
    return super.takeDamage(amount, info);
  }
  die(info) {
    super.die(info);
    this.world.sound('tank_death', this.position, { volume: 1 });
    this.world.director.tankAlive = null;
  }
  updateDeath(dt) {
    this.deathT += dt;
    if (this.deathT < 2.5) {
      const k = Math.min(1, this.deathT / 2);
      A.poseDeath(this.anim, this.deathDir, k * k, 1);
      this.anim.apply(dt, 6);
      this.rig.mesh.position.copy(this.position);
    }
  }
  get noSeparate() { return false; }
  animate(dt) {
    const a = this.anim, speed = Math.hypot(this.vel.x, this.vel.z);
    this.phase += speed * dt * 1.15;
    A.poseZombie(a, { phase: this.phase, speed: speed * 0.9, t: this.t, style: 0 });
    a.add('spine', 0.35, 0, 0); a.set('chest', 0.2, sin(this.phase) * 0.2, 0); a.set('head', -0.5, 0, 0);
    a.set('upperArmL', -0.25 + sin(this.phase) * 0.45, 0, 0.35); a.set('upperArmR', -0.25 - sin(this.phase) * 0.45, 0, -0.35);
    a.set('forearmL', -0.5, 0, 0); a.set('forearmR', -0.5, 0, 0);
    if (this.windup > 0 || this.punchAnim > 0) {
      if (this.punchAnim > 0) { this.punchAnim += dt * 4; if (this.punchAnim > 1) this.punchAnim = 0; }
      const k = this.windup > 0 ? 0 : this.punchAnim;
      a.set('upperArmR', -2.4 + k * 2.0, -0.4 + k * 1.2, -0.4); a.set('chest', 0.3, 0.6 - k * 1.2, 0); a.set('upperArmL', -0.6, 0, 0.6);
    }
    if (this.throwT > 0) {
      const k = 1 - this.throwT / 1.6;
      if (k < 0.75) { a.set('upperArmL', -2.9 * k / 0.75, 0, 0.3); a.set('upperArmR', -2.9 * k / 0.75, 0, -0.3); a.add('spine', -0.3 * k, 0, 0); }
      else { const t2 = (k - 0.75) / 0.25; a.set('upperArmL', -2.9 + t2 * 2.4, 0, 0.3); a.set('upperArmR', -2.9 + t2 * 2.4, 0, -0.3); a.add('spine', 0.5 * t2, 0, 0); }
    }
    if (this.tauntT > 0) { const s = sin(this.t * 10); a.set('upperArmL', -1.5 + s * 0.4, 0, 0.9); a.set('upperArmR', -1.5 - s * 0.4, 0, -0.9); a.set('forearmL', -1.6, 0, 0); a.set('forearmR', -1.6, 0, 0); a.set('head', 0.2, 0, 0); }
    this.finishAnim(dt);
  }
}

// ===================================================================== Witch
class Witch extends Special {
  constructor(world, opts = {}) {
    super(world, 'witch', SPECIAL.witch.hp, { speed: SPECIAL.witch.speed, radius: 0.32, name: 'Witch' });
    this.wandering = !!opts.wander;
    this.anger = 0; this.startled = false; this.screamT = 0; this.slashCd = 0; this.noCull = true;
    this.idleSound = null;
    this.cry = null;
    this.retreat = false;
    this.headRadius = 0.13;
    world.events.emit('witchSpawn', this);
  }
  pickTarget() { return this.target; }
  update(dt) {
    if (!this.alive) { this.updateCorpse(dt); if (this.cry) { this.cry.stop(1); this.cry = null; } return; }
    const w = this.world, C = SPECIAL.witch;
    this.t += dt; this.stateT += dt; this.flinchT = Math.max(0, this.flinchT - dt);
    this.slashCd = Math.max(0, this.slashCd - dt);
    if (this.burning > 0) {
      this.burning -= dt;
      this.takeDamage(C.hp / C.burnTime * dt, { type: 'fire', attacker: this.burnBy });
      if (Math.random() < dt * 10) w.effects.fireSprite(this.position.x, this.position.y + 0.5 + Math.random() * 1.2, this.position.z, 0.4, 0.7, { life: 0.4 });
      if (!this.alive) return;
    }
    if (!this.cry && !this.startled) this.cry = w.sound('witch_cry', this.position, { loop: true, volume: 1, follow: this });
    if (!this.startled) { this.updateCalm(dt); this.animate(dt); return; }
    if (this.cry) { this.cry.stop(0.3); this.cry = null; }
    if (this.screamT > 0) { this.screamT -= dt; this.vel.multiplyScalar(0.5); this.animate(dt); return; }
    const t = this.target;
    if (this.retreat || !t || t.state === 'dead' || (t.inSaferoom && w.saferoomLocked)) {
      this.retreat = true;
      Smoker.prototype.flee.call(this, dt);
      this.integrate(dt);
      // despawn when unseen
      if (this.stateT > 2 && !w.survivors.some((s) => s.state !== 'dead' && this.hasLOS(s, 40))) this.remove();
      this.animate(dt); return;
    }
    const d = t.body.pos.distanceTo(this.position);
    const sp = this.burning > 0 ? C.burnSpeed : C.speed;
    if (d < 1.2) {
      this.vel.multiplyScalar(0.5);
      this.faceTo(t.body.pos.x - this.position.x, t.body.pos.z - this.position.z, dt, 15);
      if (this.slashCd <= 0) {
        this.slashCd = t.state === 'incap' ? 0.5 : 1; this.slashAnim = 0.01;
        w.sound('witch_attack', t.body.pos, { volume: 1 });
        if (t.state === 'alive') {
          if (this.diff.witchKills) { t.takeDamage(1000, { type: 'witch', attacker: this }); if (t.state === 'incap') t.die({ type: 'witch' }); }
          else t.takeDamage(t.total + 1, { type: 'witch', attacker: this });
        } else if (t.state === 'incap') t.takeDamage(this.diff === DIFFICULTY.easy ? 15 : this.diff === DIFFICULTY.normal ? 30 : 65, { type: 'witch', attacker: this });
        w.effects.blood(t.center(_v), _v2.set(Math.random() - 0.5, 0.5, Math.random() - 0.5), 1.2);
      }
    } else {
      if (d < 3) this.steerTo(t.body.pos.x, t.body.pos.z, sp, dt, 20);
      else if (!this.followField(dt, w.fieldFor(t), sp)) this.steerTo(t.body.pos.x, t.body.pos.z, sp, dt);
    }
    if (this.slashAnim > 0) { this.slashAnim += dt * 3; if (this.slashAnim > 1) this.slashAnim = 0; }
    this.integrate(dt);
    this.animate(dt);
  }
  updateCalm(dt) {
    const w = this.world, C = SPECIAL.witch;
    let rate = 0, closest = null, cd = Infinity;
    for (const s of w.survivors) {
      if (s.state === 'dead') continue;
      const d = s.body.pos.distanceTo(this.position);
      if (d < cd) { cd = d; closest = s; }
      if (this.wandering) { if (d < C.wanderPersonal) rate += 1 / C.wanderTime; if (d < 0.9) rate += 10; continue; }
      if (d < C.personal) rate += 1 / this.diff.witchStartle * 1.4;
      else if (d < 7.6) rate += 0.03;
      if (s.flashlight && d < C.flashlight) {
        const toW = _v.set(this.position.x - s.body.pos.x, this.position.y + 0.8 - s.eyePos(_v2).y, this.position.z - s.body.pos.z).normalize();
        if (s.aimDir(_v3).dot(toW) > 0.93 && this.hasLOS(s, C.flashlight + 1)) rate += 1 / this.diff.witchStartle;
      }
      if (w.time - s.lastFire < 0.3 && d < 12) rate += 0.15;
    }
    if (rate > 0) this.anger += rate * dt; else this.anger = Math.max(0, this.anger - C.relaxRate * dt);
    this.annoyedSnd = (this.annoyedSnd || 0) - dt;
    if (this.anger > 0.35 && this.annoyedSnd <= 0) { this.annoyedSnd = 2.5; w.sound('witch_growl', this.position, { volume: 0.8 + this.anger * 0.3 }); }
    if (this.anger >= 1) this.startle(closest);
    if (this.wandering) {
      // slow aimless walk
      if (!this.wTarget || this.stateT > 8) { this.stateT = 0; const nav = w.nav; let n = this.node; for (let i = 0; i < 10 && n >= 0; i++) { const d = (Math.random() * 8) | 0; const v = nav.link[n * 8 + d]; if (v >= 0 && nav.ltype[n * 8 + d] === 1) n = v; } this.wTarget = n; }
      if (this.wTarget >= 0) this.steerTo(w.nav.x[this.wTarget], w.nav.z[this.wTarget], 0.7, dt, 2);
      this.integrate(dt);
    }
  }
  startle(by) {
    if (this.startled) return;
    const w = this.world;
    this.startled = true; this.target = by; this.screamT = this.wandering ? 1.0 : 0.6;
    this.setState('rage');
    w.sound('witch_scream', this.position, { volume: 1 });
    w.events.emit('witchStartled', this, by);
    if (by) { w.message(`${by.name} startled the Witch`, 'warn'); w.speak(by, 'witch_startled'); }
  }
  takeDamage(amount, info = {}) {
    if (!this.alive) return 0;
    if (info.type === 'bullet') {
      if (info.group === 'head') amount *= 4;
      else amount *= this.diff.bodyFactor;
    }
    if (info.type === 'fire') { this.health -= amount; if (this.health <= 0) { this.health = 0; this.die(info); } if (!this.startled && info.attacker && info.attacker.isSurvivor) this.startle(info.attacker); return amount; }
    if (info.type === 'melee' && info.weapon && !info.weapon.chainsaw) amount = 250;
    const was = this.startled;
    if (info.attacker && info.attacker.isSurvivor && !was) this.startle(info.attacker);
    const r = Infected.prototype.takeDamage.call(this, amount, info);
    if (this.alive && info.type === 'explosion') this.screamT = Math.max(this.screamT, 1.0);
    if (!this.alive && !was && info.attacker && info.attacker.isSurvivor) this.world.message(`${info.attacker.name} crowned the Witch!`, 'kill');
    return r;
  }
  ignite(by) { super.ignite(by); this.burning = SPECIAL.witch.burnTime; if (by && by.isSurvivor) { if (!this.startled) this.startle(by); else this.target = by; } }
  takeShove() { return false; }
  die(info) { if (this.cry) { this.cry.stop(0.2); this.cry = null; } super.die(info); this.world.events.emit('witchDead', this); }
  remove() { if (this.cry) { this.cry.stop(0.5); this.cry = null; } super.remove(); this.world.events.emit('witchGone', this); }
  animate(dt) {
    const a = this.anim, speed = Math.hypot(this.vel.x, this.vel.z);
    this.phase += speed * dt * 1.5;
    if (!this.startled) {
      a.reset();
      if (this.wandering) {
        A.poseLegs(a, this.phase, 0.3);
        a.set('spine', 0.35, 0, 0); a.set('head', 0.5, 0, 0);
      } else {
        // crouched on the floor, sobbing into her hands
        a.set('thighL', -2.0, 0, 0.3); a.set('thighR', -2.0, 0, -0.3); a.set('shinL', 2.4, 0, 0); a.set('shinR', 2.4, 0, 0);
        a.rootOffT.y = -0.75; a.set('spine', 0.6 + sin(this.t * 3.1) * 0.06 + this.anger * -0.3, 0, 0); a.set('head', 0.4 - this.anger * 0.6, this.anger * 0.3, 0);
        if (this.anger > 0.6) { a.rootOffT.y = -0.75 + (this.anger - 0.6) * 1.5; a.set('thighL', -1.2, 0, 0.2); a.set('thighR', -1.2, 0, -0.2); a.set('shinL', 1.4, 0, 0); a.set('shinR', 1.4, 0, 0); }
      }
      const sob = sin(this.t * 6.5) * 0.08;
      a.set('upperArmL', -1.9 + sob, 0, -0.35); a.set('upperArmR', -1.9 - sob, 0, 0.35);
      a.set('forearmL', -2.0, 0, 0); a.set('forearmR', -2.0, 0, 0);
      if (this.anger > 0.5) { a.set('upperArmL', -1.2, 0, 0.6); a.set('upperArmR', -1.2, 0, -0.6); a.set('forearmL', -0.4, 0, 0); a.set('forearmR', -0.4, 0, 0); }
    } else {
      A.poseZombie(a, { phase: this.phase, speed, t: this.t, style: 1, burning: this.burning > 0 });
      a.add('spine', 0.3, 0, 0);
      if (this.screamT > 0) { a.set('upperArmL', -2.6, 0, 0.9); a.set('upperArmR', -2.6, 0, -0.9); a.set('head', -0.7, 0, 0); a.set('spine', -0.3, 0, 0); }
      if (this.slashAnim > 0) { const k = this.slashAnim; a.set('upperArmR', -2.8 + k * 3, 0, -0.3); a.set('upperArmL', -2.4 + k * 2.6, 0, 0.3); a.add('spine', 0.4 * k, 0, 0); }
    }
    this.anim.apply(dt, 10);
    this.updateModelCommon(dt);
  }
}
