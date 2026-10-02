// A fighter: character controller + state machine + procedural animation +
// active ragdoll. The brain (AI) writes `intent`; everything else here turns
// intent into physically plausible motion.

import { clamp, lerp, damp, dampAngle, wrapAngle, smoothstep, Ease, approach } from '../core/math.js';
import {
  makeDims, fk, ik2, poseFromJoints, copyPose, lerpPose, NP, ANGLE_CHANNELS,
  ROT, TORSO, HEADA, SA, EA, SB, EB, HA, KA, HB, KB, PX, PY,
  HEAD, NECK, PELVIS, ELB_A, HAND_A, ELB_B, HAND_B, KNEE_A, FOOT_A, KNEE_B, FOOT_B, NJ,
} from './skeleton.js';
import { Ragdoll } from './ragdoll.js';
import {
  MOVES, GUARD, RELAXED, TIRED, BLOCK, RUN, AIR_UP, AIR_DOWN, LAND, STAGGER, TAUNT, HELD, HOLDING,
  WEAPON_GUARD, FLINCH_HIGH, FLINCH_LOW, FLINCH,
} from './moves.js';

const tmpList = [];
const scratchPose = new Float64Array(NP);
const scratchPose2 = new Float64Array(NP);
const fkOut = new Float64Array(NJ * 2);

class Foot {
  constructor() {
    this.x = 0;
    this.y = 0;
    this.planted = true;
    this.t = 1;
    this.dur = 0.2;
    this.sx = 0;
    this.sy = 0;
    this.tx = 0;
    this.ty = 0;
    this.lift = 8;
  }
}

export class Fighter {
  constructor(sim, spec) {
    this.sim = sim;
    this.id = spec.id;
    this.isHero = !!spec.hero;
    this.team = this.isHero ? 0 : 1;
    this.name = spec.name || 'Fighter';
    this.color = spec.color;
    this.colorFar = spec.colorFar || spec.color;
    this.scale = spec.scale || 1;
    this.dims = makeDims(this.scale);
    const s = this.scale;

    // Stats (all multipliers around 1 unless noted).
    this.maxHp = spec.hp;
    this.hp = spec.hp;
    this.injury = 0;
    this.maxStaminaBase = spec.stamina || 100;
    this.stamina = this.maxStaminaBase;
    this.fatigue = 0;
    this.strength = spec.strength || 1;
    this.runSpeed = spec.runSpeed || 300;
    this.walkSpeed = spec.walkSpeed || 120;
    this.agility = spec.agility || 1;
    this.skill = spec.skill || 0.5;
    this.reaction = spec.reaction || 0.3;
    this.intelligence = spec.intelligence || 0.5;
    this.aggression = spec.aggression || 0.5;
    this.toughness = spec.toughness || 1;
    this.moveSpeed = spec.moveSpeed || 1;
    this.jumpSpeed = spec.jumpSpeed || 720;
    this.personality = spec.personality || 'brawler';
    this.style = spec.style || 'balanced';
    this.maxPoise = 30 * this.toughness * (this.isHero ? 1.35 : 1) * Math.max(0.7, s);
    this.poise = this.maxPoise;

    // Controller.
    this.x = spec.x || 0;
    this.y = spec.y || 0;
    this.vx = 0;
    this.vy = 0;
    this.facing = spec.facing || 1;
    this.grounded = false;
    this.wasGrounded = false;
    this.groundSolid = null;
    this.surface = -1;
    this.lastSurface = -1;
    this.w = 22 * s;
    this.hStand = 90 * s;
    this.dropT = 0;
    this.jumped = false;
    this.blockedX = 0;
    this.blockedSolid = null;
    this.landSpeed = 0;
    this.airTime = 0;
    this.fallStartY = this.y;

    // State machine.
    this.state = 'ground';
    this.stateT = 0;
    this.move = null;
    this.mt = 0;
    this.moveFacing = 1;
    this.moveRate = 1;
    this.moveFired = 0;
    this.moveHit = false;
    this.hitSet = new Set();
    this.victim = null;
    this.holdTarget = null;
    this.grabbedBy = null;
    this.stun = 0;
    this.blockStun = 0;
    this.freeze = 0;
    this.frozen = false;
    this.invuln = 0;
    this.muscle = 1;
    this.muscleRate = 4;
    this.downT = 0;
    this.restT = 0;
    this.zapT = 0;
    this.dead = false;
    this.defeated = false;
    this.removed = false;
    this.koTime = 0;
    this.koCause = null;
    this.lastHitBy = null;
    this.lastHitTime = -10;
    this.lastDamageTime = -10;
    this.knock = null; // chain-reaction attribution { by, chainId, depth, time }
    this.passT = 0;
    this.stance = 'guard';
    this.lookTarget = null;
    this.spawning = null;

    // Animation.
    this.pose = Float64Array.from(GUARD);
    this.target = new Float64Array(NP);
    this.jt = new Float64Array(NJ * 2);
    this.feet = [new Foot(), new Foot()];
    this.legW = [0, 0];
    this.squash = 0;
    this.squashV = 0;
    this.flinch = 0;
    this.flinchLow = false;
    this.flinchType = 'head';
    this.flinchRate = 4.5;
    this.bob = (spec.id * 1.3) % 6.28;
    this.flash = 0;
    this.breath = (spec.id * 0.37) % 6.28;
    this.poseRate = 16;
    this.snap = null;
    this.trail = [];
    this.trailJoint = -1;
    this.swingT = 0;

    // Body.
    this.rag = new Ragdoll(this.dims);
    this.mass = this.rag.mass;

    // Equipment & AI.
    this.weapon = null;
    this.ammo = spec.ammo || 0;
    this.brain = null;
    this.intent = { mx: 0, run: false, face: 0, jump: false, action: null, block: false, climb: false, drop: false, target: null };
    this.stats = { hits: 0, taken: 0, blocks: 0, dodges: 0, kos: 0 };

    this.placeAt(this.x, this.y);
  }

  // ------------------------------------------------------------------ helpers
  get alive() {
    return !this.dead;
  }

  get ragdolled() {
    return this.state === 'ragdoll' || this.state === 'down' || this.state === 'ko' || this.state === 'zap';
  }

  get busy() {
    return this.state !== 'ground' || !this.grounded;
  }

  get pelvisX() {
    return this.rag.p[PELVIS].x;
  }

  get pelvisY() {
    return this.rag.p[PELVIS].y;
  }

  get headX() {
    return this.rag.p[HEAD].x;
  }

  get headY() {
    return this.rag.p[HEAD].y;
  }

  maxStamina() {
    return this.maxStaminaBase * (1 - this.fatigue * 0.45);
  }

  placeAt(x, y) {
    this.x = x;
    this.y = y;
    const s = this.dims.s;
    copyPose(this.pose, this.isHero ? GUARD : RELAXED);
    this.feet[0].x = x + this.facing * 13 * s;
    this.feet[1].x = x - this.facing * 15 * s;
    this.feet[0].y = this.feet[1].y = y;
    this.feet[0].planted = this.feet[1].planted = true;
    this.computeJoints(0);
    this.rag.setFromJoints(this.jt);
  }

  setState(st) {
    if (this.state === st) return;
    this.state = st;
    this.stateT = 0;
  }

  emit(e) {
    this.sim.emit(e);
  }

  // Effective animation speed: skill, fatigue, low stamina.
  computeMoveRate(move) {
    let r = this.moveSpeed * (1 - this.fatigue * 0.22);
    if (this.stamina < 15) r *= 0.85;
    if (move.type === 'getup') r *= this.isHero ? 1.5 - this.fatigue * 0.45 : 0.85 + this.toughness * 0.1;
    return r;
  }

  canAct() {
    if (this.dead || this.frozen) return false;
    if (this.state === 'ground' && this.grounded) return true;
    if (this.state === 'block') return true;
    if (this.state === 'move' && this.move && this.mt >= this.move.cancel && this.grounded) return true;
    return false;
  }

  // ---------------------------------------------------------------- actions
  startMove(id, target) {
    const m = MOVES[id];
    if (!m) return false;
    if (m.weapon && !this.weapon) return false;
    if (this.state === 'move' && this.move && this.move.type === 'throw') return false;
    this.move = m;
    this.mt = 0;
    this.moveStartT = this.sim.time;
    this.moveFacing = this.facing;
    this.moveRate = this.computeMoveRate(m);
    this.moveFired = 0;
    this.moveHit = false;
    this.hitSet.clear();
    this.moveTarget = target || this.intent.target || null;
    this.trail.length = 0;
    this.setState('move');
    const cost = m.stamina || 0;
    this.stamina -= cost;
    if (this.stamina < -20) this.stamina = -20;
    this.fatigue = Math.min(1, this.fatigue + cost * (this.isHero ? 0.00042 : 0.0006));
    if (m.type === 'strike' || m.type === 'grab') {
      if (this.sim.rng.chance(this.isHero ? 0.12 : 0.22)) this.emit({ t: 'vocal', kind: 'attack', x: this.x, y: this.y - 70, f: this });
    }
    if (m.hits.length && m.hits[0].kind !== 'body') this.emit({ t: 'whoosh', x: this.x, y: this.y - 50, power: m.power, delay: m.windup / this.moveRate, f: this });
    return true;
  }

  endMove() {
    const m = this.move;
    this.move = null;
    this.victim = null;
    if (this.state === 'move') this.setState(this.grounded ? 'ground' : 'air');
    // re-plant feet where the animation left them
    this.replantFeet();
    if (m && m.overcommit && !this.moveHit && this.sim.rng.chance(0.55 - this.skill * 0.4)) {
      this.stumble(this.facing, 0.45);
    }
  }

  jump(vx, vy) {
    this.vy = -(vy || this.jumpSpeed);
    if (vx !== undefined) this.vx = vx;
    this.grounded = false;
    this.jumped = true;
    this.fallStartY = this.y;
    if (this.state !== 'move') this.setState('air');
    this.emit({ t: 'step', x: this.x, y: this.y, power: 0.6, f: this });
  }

  turn(f) {
    if (f === 0 || f === this.facing) return;
    this.facing = f;
    // Swap feet so the stance mirrors in place instead of crossing over.
    const a = this.feet[0];
    this.feet[0] = this.feet[1];
    this.feet[1] = a;
  }

  // ---------------------------------------------------------------- damage
  // Small reactions keep the fighter on its feet; muscles slacken briefly.
  hitstun(dur, kvx, kvy, low, react, heavy) {
    if (this.dead) return;
    if (this.state === 'move' && this.move) {
      if (this.move.type === 'throw' && this.victim) this.releaseVictim(false);
      this.move = null;
    }
    this.setState('hitstun');
    this.stun = Math.max(this.stun, dur);
    this.vx = kvx;
    if (kvy < -200 && this.grounded) {
      this.vy = kvy * 0.4;
      this.grounded = false;
      this.jumped = true;
    }
    this.muscle = Math.min(this.muscle, 0.35);
    this.muscleRate = 3.2;
    this.flinch = 1;
    this.flinchLow = !!low;
    this.flinchType = react || (low ? 'gut' : 'head');
    // big shots hold the reaction pose longer
    this.flinchRate = clamp(1.5 / Math.max(0.2, dur), 2.2, 6);
    if (heavy && !this.isHero) {
      // reeling: arms windmilling, stumbling back
      this.staggered = true;
      this.stun = Math.max(this.stun, dur * 1.35);
    }
    this.replantFeet();
  }

  // Killed on his feet by a blow that did not launch him: he folds.
  dieOnFeet(kind) {
    if (this.ragdolled || this.state === 'grabbed' || this.state === 'held' || !this.grounded) return false;
    if (this.holdTarget) this.releaseHold();
    if (this.state === 'move' && this.move && this.move.type === 'throw' && this.victim) this.releaseVictim(false);
    this.snap = copyPose(new Float64Array(NP), this.pose);
    this.vx *= 0.3;
    this.staggered = false;
    this.flinch = 0;
    this.move = null;
    this.dropWeapon(this.facing * 40, -120);
    return this.startMove(kind);
  }

  stumble(dir, dur) {
    if (this.dead || this.ragdolled) return;
    this.setState('hitstun');
    this.stun = dur;
    this.vx = dir * 180;
    this.flinch = 0.6;
    this.flinchLow = false;
    this.muscle = Math.min(this.muscle, 0.5);
    this.muscleRate = 2.5;
    this.staggered = true;
  }

  // Full ragdoll. Velocity is added on top of the current motion.
  knockdown(vx, vy, opts = {}) {
    const h = this.sim.h;
    if (this.state === 'move' && this.move && this.move.type === 'throw' && this.victim) this.releaseVictim(false);
    if (this.holdTarget) this.releaseHold();
    if (this.grabbedBy) {
      const g = this.grabbedBy;
      this.grabbedBy = null;
      if (g.holdTarget === this) g.holdTarget = null;
      if (g.victim === this) g.victim = null;
    }
    this.move = null;
    this.rag.f = this.facing;
    this.setState('ragdoll');
    this.muscle = 0;
    this.restT = 0;
    this.rag.sleeping = false;
    this.rag.sleepT = 0;
    this.rag.maxImpact = 0;
    this.rag.addVel(vx, vy, h);
    if (opts.spin) this.rag.addSpin(opts.spin, h);
    if (opts.joint !== undefined) this.rag.addVelAt(opts.joint, opts.jx || 0, opts.jy || 0, h);
    this.grounded = false;
    this.dropWeapon(vx * 0.4, vy * 0.4 - 120);
    this.knockT = this.sim.time;
  }

  damage(amount, by, cause) {
    if (this.dead) return 0;
    if (this.sim.godHero && this.isHero) amount = 0;
    this.hp -= amount;
    this.lastDamageTime = this.sim.time;
    this.injury += amount * 0.45;
    this.stats.taken += amount;
    if (by) {
      this.lastHitBy = by;
      this.lastHitTime = this.sim.time;
    }
    if (this.hp <= 0) {
      this.hp = 0;
      this.dead = true;
      this.koCause = cause || 'beaten';
      this.koBy = by || null;
      this.koTime = this.sim.time;
      if (!this.ragdolled && !this.pendingDeath) this.knockdown(0, 0);
      this.sim.onKO(this, by, cause);
    }
    return amount;
  }

  electrocute(dur, dmg) {
    if (this.zapT > 0) return;
    if (!this.ragdolled) this.knockdown(0, -60);
    this.setState('zap');
    this.zapT = dur;
    this.zapDmg = dmg / dur;
    this.flash = 1;
  }

  dropWeapon(vx, vy) {
    if (!this.weapon) return;
    const w = this.weapon;
    this.weapon = null;
    this.sim.props.dropWeapon(w, this, vx, vy);
  }

  // ------------------------------------------------------------ grabs/throws
  attachVictim(v, moveId) {
    this.victim = v;
    v.grabbedBy = this;
    v.move = null;
    v.rag.f = v.facing;
    v.setState('grabbed');
    v.muscle = 0;
    v.dropWeapon(0, -50);
    this.startMove(moveId, v);
    this.victim = v;
    this.emit({ t: 'grab', x: v.x, y: v.y - 50, a: this, b: v });
  }

  releaseVictim(thrown) {
    const v = this.victim;
    this.victim = null;
    if (!v) return;
    v.grabbedBy = null;
    if (v.state === 'grabbed') {
      v.setState('ragdoll');
      v.restT = 0;
      v.muscle = 0;
    }
    if (thrown) v.thrownBy = this;
  }

  // Grappler holding a victim in place (enemy bear hug on the hero).
  beginHold(v) {
    this.holdTarget = v;
    this.holdT = 0;
    v.grabbedBy = this;
    v.move = null;
    v.setState('held');
    v.holdStruggle = 0;
    v.dropWeapon(0, -60);
    this.setState('holding');
    this.emit({ t: 'grab', x: v.x, y: v.y - 50, a: this, b: v, hold: true });
  }

  releaseHold() {
    const v = this.holdTarget;
    this.holdTarget = null;
    if (this.state === 'holding') this.setState('ground');
    if (v && v.grabbedBy === this) {
      v.grabbedBy = null;
      if (v.state === 'held') v.setState('ground');
    }
  }

  // ----------------------------------------------------------------- update
  updateLogic(dt) {
    if (this.removed || this.baked) return;
    if (this.dead && this.state === 'ko' && this.rag.sleeping) return; // a body at rest
    if (this.freeze > 0) {
      this.freeze--;
      this.frozen = true;
      return;
    }
    this.frozen = false;
    this.stateT += dt;
    this.jumped = false;
    this.wasGrounded = this.grounded;
    if (this.dropT > 0) this.dropT -= dt;
    if (this.passT > 0) this.passT -= dt;
    if (this.invuln > 0) this.invuln -= dt;
    if (this.flash > 0) this.flash = Math.max(0, this.flash - dt * 6);
    if (this.flinch > 0) this.flinch = Math.max(0, this.flinch - dt * this.flinchRate);

    this.updateVitals(dt);

    switch (this.state) {
      case 'ground':
        this.stateGround(dt);
        break;
      case 'air':
        this.stateAir(dt);
        break;
      case 'move':
        this.stateMove(dt);
        break;
      case 'block':
        this.stateBlock(dt);
        break;
      case 'hitstun':
        this.stateHitstun(dt);
        break;
      case 'ragdoll':
      case 'down':
      case 'ko':
      case 'zap':
        this.stateRagdoll(dt);
        break;
      case 'grabbed':
        this.stateGrabbed(dt);
        break;
      case 'held':
        this.stateHeld(dt);
        break;
      case 'holding':
        this.stateHolding(dt);
        break;
      case 'spawn':
        this.stateSpawn(dt);
        break;
    }

    if (!this.ragdolled && this.state !== 'grabbed') this.moveController(dt);
    if (this.muscle < 1 && !this.ragdolled && this.state !== 'grabbed') {
      this.muscle = Math.min(1, this.muscle + this.muscleRate * dt);
    }
  }

  updateVitals(dt) {
    if (this.dead) return;
    const ms = this.maxStamina();
    const exert = this.state === 'move' || this.state === 'block' || this.state === 'hitstun';
    // a trained fighter breathes through the exchanges
    const regen = (exert ? (this.isHero ? 10 : 6) : this.stance === 'tired' ? 34 : this.isHero ? 26 : 22) * (1 - this.fatigue * 0.55);
    this.stamina = Math.min(ms, this.stamina + regen * dt);
    if (this.isHero) {
      // fatigue creeps up while fighting; very slowly eases when calm
      const engaged = this.brain && this.brain.engaged > 0;
      const k = this.sim.settings.heroEndurance;
      if (engaged) this.fatigue = Math.min(1, this.fatigue + dt * 0.0011 / k);
      else this.fatigue = Math.max(0, this.fatigue - dt * 0.0016 * k);
      // light recovery when untouched for a while; injuries cap it
      if (this.sim.time - this.lastDamageTime > 6 && !engaged) {
        const cap = this.maxHp - this.injury;
        if (this.hp < cap) this.hp = Math.min(cap, this.hp + dt * 2.2);
      }
    }
    if (this.sim.time - this.lastHitTime > 0.7) this.poise = Math.min(this.maxPoise, this.poise + dt * this.maxPoise * 0.7);
  }

  // Locomotion & action dispatch.
  stateGround(dt) {
    if (!this.grounded) {
      this.setState('air');
      this.fallStartY = this.y;
      return;
    }
    const it = this.intent;
    if (it.face) this.turn(it.face);
    if (it.drop) {
      it.drop = false;
      if (this.groundSolid && this.groundSolid.oneWay) {
        this.dropT = 0.3;
        this.grounded = false;
        this.setState('air');
        return;
      }
    }
    if (it.jump) {
      it.jump = false;
      this.startMove('jumpsquat');
      this.pendingJump = { vx: it.mx * (it.run ? this.runSpeed : this.walkSpeed) * 1.05, vy: it.jumpVy || this.jumpSpeed };
      return;
    }
    if (it.action) {
      const a = it.action;
      it.action = null;
      if (this.startMove(a, it.target)) return;
    }
    if (it.block) {
      this.setState('block');
      return;
    }
    const speed = it.run ? this.runSpeed : this.walkSpeed;
    let target = it.mx * speed * this.speedFactor();
    const accel = (it.mx !== 0 ? 1900 : 1500) * this.agility * this.sim.level.friction;
    this.vx = approach(this.vx, target, accel * dt);
  }

  speedFactor() {
    let k = 1 - this.fatigue * 0.28;
    if (this.hp < this.maxHp * 0.3) k *= 0.9;
    return k;
  }

  stateAir(dt) {
    if (this.grounded) {
      this.onLand();
      return;
    }
    this.airTime += dt;
    const it = this.intent;
    const target = it.mx * this.runSpeed * 0.9;
    this.vx = approach(this.vx, target, 520 * dt);
    if (it.action && MOVES[it.action] && MOVES[it.action].air && this.airTime < 0.25) {
      const a = it.action;
      it.action = null;
      this.startMove(a, it.target);
    }
  }

  onLand() {
    const v = this.landSpeed;
    const fall = this.y - this.fallStartY;
    this.airTime = 0;
    this.replantFeet();
    // he drops off catwalks on purpose and lands like a cat; others fold up
    const hard = this.isHero && this.state !== 'hitstun' ? 1600 : 1250;
    const hurt = this.isHero && this.state !== 'hitstun' ? 1150 : 760;
    if (v > hard || (v > 1000 && this.state === 'hitstun')) {
      // hard landing: crumple
      const dmg = (v - 900) * 0.045;
      this.knockdown(this.vx * 0.5, 0, { spin: 0 });
      this.damage(dmg, this.knock ? this.knock.by : null, 'fall');
      this.emit({ t: 'thud', x: this.x, y: this.y, power: 1.2 });
      return;
    }
    if (v > hurt - 60) {
      const dmg = Math.max(0, (v - hurt) * 0.02);
      if (dmg > 0) this.damage(dmg, null, 'fall');
    }
    this.squashV += v * 0.09;
    if (this.state === 'air') this.setState('ground');
    this.emit({ t: 'land', x: this.x, y: this.y, power: Math.min(1.5, v / 700), f: this });
    void fall;
  }

  stateBlock(dt) {
    const it = this.intent;
    if (this.blockStun > 0) this.blockStun -= dt;
    if (!this.grounded) {
      this.setState('air');
      return;
    }
    if (it.face && this.blockStun <= 0) this.turn(it.face);
    this.vx = approach(this.vx, it.mx * this.walkSpeed * 0.45, 1400 * dt);
    if (!it.block && this.blockStun <= 0) {
      this.setState('ground');
      if (it.action) {
        const a = it.action;
        it.action = null;
        this.startMove(a, it.target);
      }
    }
  }

  stateHitstun(dt) {
    this.stun -= dt;
    const fr = (this.grounded ? 1100 : 200) * this.sim.level.friction;
    this.vx = approach(this.vx, 0, fr * dt);
    if (this.stun <= 0) {
      this.staggered = false;
      this.setState(this.grounded ? 'ground' : 'air');
    }
  }

  stateMove(dt) {
    const m = this.move;
    if (!m) {
      this.setState('ground');
      return;
    }
    const prev = this.mt;
    let rate = this.moveRate;
    // sloppy fighters telegraph: slower wind-up
    if (!this.isHero && this.mt < m.windup) rate *= 0.62 + this.skill * 0.38;
    this.mt += dt * rate;
    const t = this.mt;

    // facing flips authored into the move
    for (let i = 0; i < m.flips.length; i++) {
      const ft = m.flips[i];
      if (prev < ft && t >= ft) this.facing = -this.facing;
    }
    // root motion (with a matching step so the feet keep up with lunges)
    let driven = false;
    for (let i = 0; i < m.motion.length; i++) {
      const [t0, t1, v] = m.motion[i];
      if (!m.steps && prev < t0 && t >= t0 && this.grounded && !m.legs.A.length && Math.abs(v) * (t1 - t0) > 6) {
        const dist = Math.abs(v) * (t1 - t0) * 1.1 + 6 * this.dims.s;
        if (v > 0) this.forceStep(0, dist, (t1 - t0) / this.moveRate);
        else this.forceStep(1, -dist, (t1 - t0) / this.moveRate);
      }
      if (t >= t0 && t < t1) {
        const gf = this.grounded ? 1 : 0.4;
        this.vx = lerp(this.vx, this.moveFacing * v * (0.85 + 0.15 * this.moveRate), gf);
        driven = true;
      }
    }
    if (!driven && this.grounded && !m.keepVel) this.vx = approach(this.vx, 0, 1300 * this.sim.level.friction * dt);
    // planned steps
    if (m.steps) {
      for (const st of m.steps) {
        if (prev < st.t && t >= st.t) this.forceStep(st.foot, st.dx * this.dims.s, st.dur);
      }
    }
    // jump impulse
    if (m.air && prev < m.air.t && t >= m.air.t) {
      this.jump(this.moveFacing * m.air.vx * (0.85 + 0.15 * this.agility), m.air.vy);
    }
    if (m.id === 'jumpsquat' && t >= m.dur && this.pendingJump) {
      const pj = this.pendingJump;
      this.pendingJump = null;
      this.move = null;
      this.jump(pj.vx, pj.vy);
      this.setState('air');
      return;
    }
    // events
    if (m.event && prev < m.event[0] && t >= m.event[0]) this.sim.moveEvent(this, m.event[1]);
    if (m.iframes) this.iframe = t >= m.iframes[0] && t < m.iframes[1];
    else this.iframe = false;
    if (m.pass && t >= m.pass[0] && t < m.pass[1]) this.passT = 0.05;
    // throws: victim follows the path, then flies
    if (m.type === 'throw' && this.victim) this.updateThrow(prev, t);
    // grab attempts are resolved by the combat system (needs other fighters)
    if (m.endOnLand !== undefined && t > m.endOnLand && this.grounded && !this.jumped) {
      this.endMove();
      this.onLandFromMove();
      return;
    }
    if (m.type === 'death' && (t >= m.dur || !this.grounded)) {
      const fl = m.fall;
      this.move = null;
      this.pendingDeath = false;
      this.knockdown(this.facing * fl[0], fl[1], { spin: this.facing * fl[2] });
      return;
    }
    if (t >= m.dur) {
      if (m.air && !this.grounded) {
        // keep falling in the last pose until landing
        this.mt = m.dur;
        if (this.stateT > 2.5) this.endMove();
        return;
      }
      this.endMove();
    }
  }

  onLandFromMove() {
    this.squashV += Math.min(this.landSpeed, 900) * 0.07;
    this.emit({ t: 'land', x: this.x, y: this.y, power: Math.min(1.5, this.landSpeed / 700), f: this });
  }

  updateThrow(prev, t) {
    const m = this.move;
    const v = this.victim;
    if (!v || v.removed) {
      this.victim = null;
      return;
    }
    const s = this.dims.s;
    const path = m.victim;
    // sample path
    let a = path[0];
    let b = path[0];
    let u = 0;
    for (let i = 1; i < path.length; i++) {
      if (t <= path[i][0]) {
        a = path[i - 1];
        b = path[i];
        u = Ease.inOutQuad((t - a[0]) / (b[0] - a[0]));
        break;
      }
      a = b = path[i];
      u = 0;
    }
    const f = this.moveFacing;
    const px = this.rag.p[PELVIS].x;
    const py = this.rag.p[PELVIS].y;
    v.pinNeck = [px + f * lerp(a[1], b[1], u) * s, py + lerp(a[2], b[2], u) * s];
    v.pinPelvis = [px + f * lerp(a[3], b[3], u) * s, py + lerp(a[4], b[4], u) * s];
    // blows landed while holding him (knees in the clinch)
    if (m.strikes) {
      for (const [st, dmg] of m.strikes) {
        if (prev < st && t >= st) {
          const hp = v.rag.p[HEAD];
          const d = dmg * this.strength * this.sim.rng.range(0.9, 1.1);
          v.damage(d, this, 'beaten');
          v.flash = 1;
          v.rag.addVelAt(HEAD, f * 120, -260, this.sim.h, 0.5);
          this.moveHit = true;
          this.stats.hits++;
          this.freeze = v.freeze = 3;
          if (this.isHero) this.sim.hitstop(2);
          this.emit({ t: 'hit', kind: 'kick', x: hp.x, y: hp.y, power: d / 9, down: false, a: this, b: v, part: 'head', move: m.id });
        }
      }
    }
    if (prev < m.release[0] && t >= m.release[0]) {
      const h = this.sim.h;
      const rv = this.sim.settings.physicsIntensity;
      v.pinNeck = v.pinPelvis = null;
      this.releaseVictim(true);
      const k = (0.8 + this.strength * 0.2) * rv;
      v.rag.addVel(f * m.release[1] * k, m.release[2] * k, h);
      v.rag.addSpin(f * (m.dir > 0 ? 7 : -7), h);
      v.knock = { by: this, chainId: this.sim.newChain(this), depth: 0, time: this.sim.time, kind: 'throw' };
      v.damage(m.throwDmg * this.strength * (this.isHero ? 1 : 0.8), this, 'throw');
      this.moveHit = true;
      this.stats.hits++;
      this.emit({ t: 'throw', x: v.pelvisX, y: v.pelvisY, a: this, b: v, move: m.id });
    }
  }

  stateRagdoll(dt) {
    const h = this.sim.h;
    const p = this.rag.p[PELVIS];
    // controller follows the body
    this.x = p.x;
    this.y = this.rag.lowestY();
    this.vx = (p.x - p.px) / h;
    this.vy = (p.y - p.py) / h;
    if (this.state === 'zap') {
      this.zapT -= dt;
      this.damage(this.zapDmg * dt, this.knock ? this.knock.by : null, 'electric');
      this.flash = Math.max(this.flash, 0.6);
      if (this.zapT <= 0) this.setState(this.dead ? 'ko' : 'ragdoll');
      return;
    }
    const sp = this.rag.maxSpeed(h);
    const core = this.rag.coreSpeed(h);
    // resting on the floor or on top of other bodies both count
    const resting = core < 75;
    if (resting) this.restT += dt;
    else this.restT = Math.max(0, this.restT - dt * 2);
    if (this.state === 'ragdoll') {
      if (this.dead) {
        if (this.restT > 0.3) this.setState('ko');
        return;
      }
      if ((this.restT > 0.15 && this.stateT > 0.3) || (this.stateT > 1.8 && core < 260)) {
        this.setState('down');
        const base = this.isHero ? 0.2 + this.fatigue * 0.8 : 0.3 + Math.max(0, 1 - this.toughness) * 0.4;
        this.downT = base + this.sim.rng.range(0, this.isHero ? 0.3 : 0.6) + (1 - this.hp / this.maxHp) * (this.isHero ? 0.5 : 0.9);
      }
    } else if (this.state === 'down') {
      if (this.dead) {
        this.setState('ko');
        return;
      }
      if (!resting && sp > 320) {
        this.setState('ragdoll');
        return;
      }
      this.downT -= dt;
      // the hero scrambles up fast when someone is standing over him
      if (this.isHero && this.brain && this.brain.threatClose) this.downT = Math.min(this.downT, 0.2 + this.fatigue * 0.4);
      if (this.downT <= 0) this.beginGetup();
    }
  }

  beginGetup(forceId) {
    const L = this.sim.level;
    const s = this.dims.s;
    const pts = this.rag.p;
    const pel = pts[PELVIS];
    const neck = pts[NECK];
    // which way is the body lying? torso normal in its own frame
    const tx = neck.x - pel.x;
    const ty = neck.y - pel.y;
    const f0 = this.rag.f;
    // front normal = torso rotated 90° towards facing
    const nx = -ty * f0;
    const ny = tx * f0;
    const supine = ny < 0;
    // face towards the feet when sitting up, towards the head when pushing up
    const feetX = (pts[FOOT_A].x + pts[FOOT_B].x) * 0.5;
    let f = supine ? Math.sign(feetX - pel.x) || f0 : Math.sign(neck.x - pel.x) || f0;
    const g = L.groundUnder(pel.x - 4, pel.x + 4, this.y - 30 * s, 90 * s, true, false);
    const gy = g ? g.y : this.y;
    this.x = pel.x;
    this.y = gy;
    this.vx = 0;
    this.vy = 0;
    this.grounded = true;
    this.groundSolid = g;
    this.facing = f;
    // snapshot joints into a pose (start key of the get-up)
    const j = fkOut;
    for (let i = 0; i < NJ; i++) {
      j[i * 2] = pts[i].x;
      j[i * 2 + 1] = pts[i].y;
    }
    this.snap = poseFromJoints(j, f, this.x, gy, this.dims, new Float64Array(NP));
    copyPose(this.pose, this.snap);
    let id = supine ? 'getupBack' : 'getupFront';
    if (this.isHero && supine && this.stamina > 25 && this.sim.rng.chance(0.75 - this.fatigue * 0.7)) id = 'kipup';
    if (forceId) id = forceId;
    this.startMove(id);
    this.muscle = 0.15;
    this.muscleRate = 5;
    // a trained fighter protects himself while rising
    if (this.isHero) this.invuln = 0.45 + this.skill * 0.2 - this.fatigue * 0.3;
    this.emit({ t: 'getup', f: this });
  }

  stateGrabbed() {
    // pinned by the thrower; physics happens in the ragdoll step
    const p = this.rag.p[PELVIS];
    this.x = p.x;
    this.y = this.rag.lowestY();
    if (!this.grabbedBy) {
      this.setState('ragdoll');
      this.restT = 0;
    }
  }

  stateHeld(dt) {
    const g = this.grabbedBy;
    if (!g || g.state !== 'holding' || g.dead) {
      this.grabbedBy = null;
      this.setState('ground');
      return;
    }
    this.vx = 0;
    const s = this.dims.s;
    // locked in front of the grappler, facing the same way (held from behind)
    const tx = g.x + g.facing * 16 * s;
    this.x = lerp(this.x, tx, 0.5);
    this.holdStruggle += dt * (0.6 + this.strength * 0.4) * (this.stamina > 10 ? 1 : 0.5);
  }

  stateHolding(dt) {
    this.holdT += dt;
    const v = this.holdTarget;
    if (!v || v.state !== 'held' || v.grabbedBy !== this) {
      this.releaseHold();
      return;
    }
    this.vx = 0;
  }

  stateSpawn(dt) {
    const sp = this.spawning;
    if (!sp) {
      this.setState('ground');
      return;
    }
    sp.t -= dt;
    if (sp.walk) {
      this.vx = approach(this.vx, sp.dir * this.walkSpeed * 1.1, 900 * dt);
      this.facing = sp.dir;
    }
    if (sp.t <= 0) {
      this.spawning = null;
      this.setState(this.grounded ? 'ground' : 'air');
    }
  }

  // ------------------------------------------------------------- controller
  moveController(dt) {
    const L = this.sim.level;
    const s = this.dims.s;
    const hw = this.w * 0.5;
    const crouch = this.pose[PY] < 30;
    const h = crouch ? this.hStand * 0.6 : this.hStand;
    if (!this.grounded) {
      this.vy += this.sim.gravity * dt;
      if (this.vy > 1900) this.vy = 1900;
      if (L.wind && this.sim.windNow) this.vx += this.sim.windNow * dt * 0.35;
    }
    // heavy boxes in the way slow the walker down
    if (this.boxPush > 0) {
      if (Math.sign(this.vx) === this.boxPushDir) {
        const cap = 150 / Math.sqrt(this.boxPush);
        if (Math.abs(this.vx) > cap) this.vx = this.boxPushDir * cap;
      }
      this.boxPush = 0;
    }
    // ---- horizontal
    let nx = this.x + this.vx * dt;
    this.blockedX = 0;
    let list = L.queryRect(nx - hw - 1, this.y - h, nx + hw + 1, this.y - 2, tmpList);
    for (let i = 0; i < list.length; i++) {
      const sd = list[i];
      if (sd.oneWay) continue;
      if (sd.y + sd.h <= this.y - h + 1 || sd.y >= this.y - 1.5) continue;
      if (nx + hw <= sd.x || nx - hw >= sd.x + sd.w) continue;
      const impact = Math.abs(this.vx);
      if (sd.breakable && impact > sd.breakSpeed * 0.75) {
        this.sim.breakSolid(sd, nx, this.y - 50, impact);
        continue;
      }
      if (this.x <= sd.x + sd.w * 0.5) nx = Math.min(nx, sd.x - hw);
      else nx = Math.max(nx, sd.x + sd.w + hw);
      this.blockedX = sd.x + sd.w * 0.5 > this.x ? 1 : -1;
      this.blockedSolid = sd;
      if (impact > 430 && this.state === 'hitstun') {
        // slammed into a wall
        this.wallSlam(impact);
        return;
      }
      this.vx = 0;
    }
    this.x = nx;
    // ---- vertical
    const prevY = this.y;
    let ny = this.y + this.vy * dt;
    const wasG = this.grounded;
    this.grounded = false;
    let landed = null;
    list = L.queryRect(this.x - hw + 1, Math.min(prevY, ny) - h, this.x + hw - 1, Math.max(prevY, ny) + 1, tmpList);
    for (let i = 0; i < list.length; i++) {
      const sd = list[i];
      if (this.x + hw - 1 <= sd.x || this.x - hw + 1 >= sd.x + sd.w) continue;
      if (sd.oneWay) {
        if (this.vy < 0) continue;
        if (this.dropT > 0) continue;
        if (prevY <= sd.y + 0.5 && ny >= sd.y && (!landed || sd.y < landed.y)) landed = sd;
      } else if (this.vy >= 0 && prevY <= sd.y + 0.5 && ny >= sd.y) {
        if (!landed || sd.y < landed.y) landed = sd;
      } else if (this.vy < 0 && prevY - h >= sd.y + sd.h - 0.5 && ny - h < sd.y + sd.h) {
        ny = sd.y + sd.h + h;
        this.vy = 0;
      }
    }
    if (landed) {
      ny = landed.y;
      this.landSpeed = this.vy;
      this.vy = 0;
      this.grounded = true;
      this.groundSolid = landed;
    }
    this.y = ny;
    // ---- stairs: step up while climbing
    if (this.grounded && this.intent.climb && Math.abs(this.vx) > 4) {
      const lst = L.queryRect(this.x - hw, this.y - 26 * s, this.x + hw, this.y - 1, tmpList);
      let up = null;
      for (let i = 0; i < lst.length; i++) {
        const sd = lst[i];
        if (!sd.step) continue;
        if (sd.y >= this.y - 1 || sd.y < this.y - 25 * s) continue;
        if (this.x + hw * 0.7 < sd.x || this.x - hw * 0.7 > sd.x + sd.w) continue;
        if (!up || sd.y < up.y) up = sd;
      }
      if (up) {
        this.y = up.y;
        this.groundSolid = up;
      }
    }
    // ---- snap down onto ground when walking off small steps / down stairs
    if (!this.grounded && wasG && this.vy >= 0 && !this.jumped) {
      const g = L.groundUnder(this.x - hw + 2, this.x + hw - 2, this.y, 24 * s, this.dropT <= 0, false);
      if (g) {
        this.y = g.y;
        this.vy = 0;
        this.grounded = true;
        this.groundSolid = g;
      }
    }
    if (this.grounded) {
      const S = this.sim.nav.surfaceOf(this.groundSolid, this.x);
      this.surface = S ? S.id : -1;
      if (this.surface >= 0) this.lastSurface = this.surface;
    } else {
      this.surface = -1;
      if (wasG) this.fallStartY = this.y;
    }
    if (this.y > L.killY) this.sim.outOfBounds(this);
  }

  wallSlam(impact) {
    const dir = this.vx > 0 ? 1 : -1;
    this.vx = -dir * 80;
    this.knockdown(-dir * 120, -120);
    this.damage(impact * 0.018, this.knock ? this.knock.by : this.lastHitBy, 'wall');
    this.emit({ t: 'thud', x: this.x + dir * 12, y: this.y - 50, power: impact / 500, wall: true });
  }

  // --------------------------------------------------------------- feet
  groundAtFoot(x) {
    const s = this.dims.s;
    const onStairs = this.groundSolid && this.groundSolid.step;
    const g = this.sim.level.groundUnder(x - 2, x + 2, this.y - 24 * s, 64 * s, true, !onStairs && !this.intent.climb);
    return g ? g.y : this.y;
  }

  replantFeet() {
    for (let i = 0; i < 2; i++) {
      const ft = this.feet[i];
      const j = i === 0 ? FOOT_A : FOOT_B;
      ft.x = this.jt[j * 2] || this.x;
      ft.y = this.grounded ? this.groundAtFoot(ft.x) : this.jt[j * 2 + 1];
      ft.planted = true;
      ft.t = 1;
    }
  }

  forceStep(i, dx, dur) {
    const ft = this.feet[i];
    ft.planted = false;
    ft.t = 0;
    ft.dur = dur || 0.12;
    ft.sx = ft.x;
    ft.sy = ft.y;
    ft.tx = ft.x + this.facing * dx;
    ft.ty = this.groundAtFoot(ft.tx);
    ft.lift = 6 * this.dims.s;
  }

  updateFeet(dt) {
    const s = this.dims.s;
    const f = this.facing;
    const feet = this.feet;
    const speed = Math.abs(this.vx);
    const relaxed = this.stance === 'relaxed';
    const look = this.vx * 0.1;
    const homes = [this.x + f * (relaxed ? 8 : 14) * s + look, this.x - f * (relaxed ? 8 : 16) * s + look];
    const running = speed > 210;
    const stepDur = clamp(0.25 - speed * 0.00032, 0.112, 0.25) / (0.85 + 0.15 * this.agility);
    const thresh = speed > 40 ? clamp(speed * 0.085, 12 * s, 40 * s) : 11 * s;
    let swing = 0;
    for (let i = 0; i < 2; i++) {
      const ft = feet[i];
      if (ft.planted) continue;
      if (this.legW[i] > 0.5) continue; // FK-driven leg
      ft.t += dt / ft.dur;
      if (ft.t >= 1) {
        ft.planted = true;
        ft.t = 1;
        ft.x = ft.tx;
        ft.y = ft.ty;
        if (speed > 60 || this.state === 'hitstun') this.emit({ t: 'step', x: ft.x, y: ft.y, power: Math.min(1, speed / 380), f: this });
      } else {
        const e = Ease.inOutSine(ft.t);
        ft.x = lerp(ft.sx, ft.tx, e);
        ft.y = lerp(ft.sy, ft.ty, ft.t) - ft.lift * Math.sin(Math.PI * Math.min(1, ft.t * 1.15));
        swing = Math.max(swing, Math.sin(Math.PI * ft.t));
      }
    }
    this.swingT = swing;
    // pick the most displaced planted foot whose partner supports the body
    let pick = -1;
    let best = 0;
    for (let i = 0; i < 2; i++) {
      const ft = feet[i];
      if (!ft.planted || this.legW[i] > 0.01) continue;
      const other = feet[1 - i];
      const otherOK = other.planted || this.legW[1 - i] > 0.5 || (running && other.t > 0.5);
      if (!otherOK) continue;
      const err = Math.abs(ft.x - homes[i]);
      if (err > thresh && err > best) {
        best = err;
        pick = i;
      }
    }
    if (pick >= 0) {
      const ft = feet[pick];
      const maxStep = (running ? 80 : 48) * s;
      const tx = clamp(homes[pick] + this.vx * stepDur * 0.55, ft.x - maxStep, ft.x + maxStep);
      ft.planted = false;
      ft.t = 0;
      ft.dur = stepDur;
      ft.sx = ft.x;
      ft.sy = ft.y;
      ft.tx = tx;
      ft.ty = this.groundAtFoot(tx);
      ft.lift = (running ? 20 : speed > 60 ? 11 : 6) * s;
    }
    // planted feet follow vanishing ground (e.g. a broken skylight)
    for (let i = 0; i < 2; i++) {
      const ft = feet[i];
      if (ft.planted && Math.abs(ft.y - this.y) > 40 * s) ft.y = this.groundAtFoot(ft.x);
    }
  }

  // ------------------------------------------------------------- animation
  updateBody(dt) {
    if (this.removed || this.frozen) return;
    if (this.ragdolled || this.state === 'grabbed') return;
    this.computeTarget(dt);
    // smooth pose towards target
    const rate = this.poseRate;
    const k = 1 - Math.exp(-rate * dt);
    const p = this.pose;
    const tg = this.target;
    for (let i = 0; i < ANGLE_CHANNELS; i++) p[i] = wrapAngle(p[i] + wrapAngle(tg[i] - p[i]) * k);
    p[PX] += (tg[PX] - p[PX]) * k;
    p[PY] += (tg[PY] - p[PY]) * k;
    // landing squash spring
    this.squashV += (-this.squash * 220 - this.squashV * 18) * dt;
    this.squash += this.squashV * dt;
    this.computeJoints(dt);
    // trail of the striking limb during hit windows
    this.recordTrail();
  }

  computeTarget(dt) {
    const tg = this.target;
    const s = this.dims.s;
    this.breath += dt * (1.6 + this.fatigue * 2.2 + (this.stance === 'tired' ? 1.4 : 0));
    const st = this.state;
    if (st === 'move' && this.move) {
      this.sampleMove(this.move, this.mt, tg);
      this.poseRate = this.move.type === 'getup' ? 22 : 34;
      if (this.weapon && !this.move.weapon && this.move.type === 'strike') {
        // keep the weapon arm sensible during unarmed strikes
      }
      this.legsFromMove(dt);
      return;
    }
    this.legW[0] = this.legW[1] = 0;
    if (st === 'air') {
      const up = this.vy < 0;
      copyPose(tg, up ? AIR_UP : AIR_DOWN);
      if (this.hitAir) tg[TORSO] -= 0.3;
      this.poseRate = 10;
      this.legW[0] = this.legW[1] = 1;
      return;
    }
    if (st === 'block') {
      copyPose(tg, BLOCK);
      if (this.blockStun > 0) {
        tg[TORSO] -= 0.25;
        tg[HEADA] += 0.2;
      }
      this.poseRate = 30;
      return;
    }
    if (st === 'held') {
      copyPose(tg, HELD);
      const w = Math.sin(this.stateT * 22) * 0.18;
      tg[TORSO] += w;
      tg[SA] += w * 2;
      tg[SB] -= w * 2;
      this.poseRate = 20;
      return;
    }
    if (st === 'holding') {
      copyPose(tg, HOLDING);
      this.poseRate = 18;
      return;
    }
    // locomotion / idle / hitstun
    let base;
    if (this.staggered) base = STAGGER;
    else if (this.weapon) base = WEAPON_GUARD;
    else if (this.stance === 'tired') base = TIRED;
    else if (this.stance === 'relaxed') base = RELAXED;
    else if (this.stance === 'taunt') base = TAUNT;
    else base = GUARD;
    copyPose(tg, base);
    const speed = Math.abs(this.vx);
    const runK = st === 'hitstun' ? 0 : smoothstep(160, 330, speed);
    if (runK > 0) {
      // arm pumping in sync with the feet
      const fa = this.feet[0];
      const fb = this.feet[1];
      const sw = clamp(((fb.x - fa.x) * this.facing) / (40 * s), -1.2, 1.2);
      const armA = 28 + 52 * sw;
      const armB = 28 - 52 * sw;
      lerpPose(scratchPose, tg, RUN, runK);
      copyPose(tg, scratchPose);
      if (!this.weapon) {
        tg[SA] = lerp(tg[SA], (armA * Math.PI) / 180, runK);
        tg[SB] = lerp(tg[SB], (armB * Math.PI) / 180, runK);
        tg[EA] = lerp(tg[EA], 1.6 - 0.25 * sw, runK);
        tg[EB] = lerp(tg[EB], 1.6 + 0.25 * sw, runK);
      }
    }
    // lean into motion (forward when running towards facing)
    const rel = (this.vx * this.facing) / 400;
    tg[TORSO] += clamp(rel, -0.6, 1) * (0.12 + 0.12 * runK);
    // breathing and fatigue
    const br = Math.sin(this.breath);
    tg[TORSO] += br * (0.015 + this.fatigue * 0.03);
    tg[SA] += br * 0.03;
    tg[SB] -= br * 0.025;
    tg[PY] += br * (0.35 + this.fatigue * 0.6);
    if (this.fatigue > 0.2 && base === GUARD) {
      const fk2 = (this.fatigue - 0.2) * 1.25;
      tg[TORSO] += fk2 * 0.16;
      tg[HEADA] += fk2 * 0.1;
      tg[SA] -= fk2 * 0.3;
      tg[EA] -= fk2 * 0.35;
      tg[SB] -= fk2 * 0.22;
      tg[EB] -= fk2 * 0.3;
      tg[PY] -= fk2 * 2;
    }
    // head tracks the look target
    if (this.lookTarget && !this.lookTarget.removed) {
      const dy = this.lookTarget.headY - this.headY;
      const dx = Math.abs(this.lookTarget.headX - this.headX) + 40;
      tg[HEADA] += clamp(Math.atan2(dy, dx), -0.5, 0.5) * 0.7;
    }
    // hit flinch (additive, by where and how he was hit)
    if (this.flinch > 0) {
      const fl = FLINCH[this.flinchType] || (this.flinchLow ? FLINCH_LOW : FLINCH_HIGH);
      const k = Ease.outQuad(this.flinch);
      for (let i = 0; i < NP; i++) tg[i] += fl[i] * k;
    }
    if (this.staggered && st === 'hitstun') {
      // reeling: arms windmill for balance, knees soft
      const w = this.stateT * 15;
      tg[SA] += Math.sin(w) * 1.1;
      tg[SB] += Math.sin(w + 2.4) * 1.1;
      tg[EA] -= 0.6;
      tg[EB] -= 0.6;
      tg[HEADA] += Math.sin(w * 0.7) * 0.25;
      tg[PY] -= 3;
    } else if (st === 'ground' && speed < 50 && (base === GUARD || base === WEAPON_GUARD) && (this.isHero || this.style === 'boxer' || this.style === 'kicker')) {
      // fighters bounce on the balls of their feet
      this.bob += dt * (this.isHero ? 7.5 : 6.5);
      const b = Math.sin(this.bob);
      tg[PY] += b * 1.3 - 0.6;
      tg[SA] += Math.sin(this.bob + 0.6) * 0.06;
      tg[SB] += Math.sin(this.bob + 1.4) * 0.05;
      tg[TORSO] += Math.cos(this.bob) * 0.02;
    }
    // squat before a jump / after landing
    this.poseRate = st === 'hitstun' ? 26 : this.stance === 'tired' ? 7 : 15;
  }

  sampleMove(m, t, out) {
    const keys = m.keys;
    const n = keys.length;
    const first = (m.type === 'getup' || m.fromCurrent) && this.snap ? this.snap : keys[0].pose;
    if (t <= keys[0].t) return copyPose(out, first);
    for (let i = 1; i < n; i++) {
      const k = keys[i];
      if (t <= k.t) {
        const k0 = keys[i - 1];
        const u = (t - k0.t) / Math.max(1e-6, k.t - k0.t);
        const e = Ease[k.ease](u);
        const p0 = i === 1 ? first : k0.pose;
        for (let c = 0; c < NP; c++) out[c] = p0[c] + (k.pose[c] - p0[c]) * e;
        return out;
      }
    }
    return copyPose(out, keys[n - 1].pose);
  }

  // Leg FK weights for the current move (with short blends at the edges).
  legsFromMove() {
    const m = this.move;
    const t = this.mt;
    for (let leg = 0; leg < 2; leg++) {
      const ivs = leg === 0 ? m.legs.A : m.legs.B;
      let w = 0;
      for (let i = 0; i < ivs.length; i++) {
        const [t0, t1] = ivs[i];
        if (t >= t0 && t <= t1) {
          w = Math.max(w, Math.min(1, (t - t0) / 0.045, (t1 - t) / 0.045));
          if (t0 <= 0.001) w = Math.max(w, Math.min(1, (t1 - t) / 0.045));
        }
      }
      if (!this.grounded) w = 1;
      const prevW = this.legW[leg];
      this.legW[leg] = w;
      if (prevW > 0.5 && w <= 0.5 && this.grounded) {
        // the leg comes back down: plant it where it is
        const ft = this.feet[leg];
        const j = leg === 0 ? FOOT_A : FOOT_B;
        ft.x = this.jt[j * 2];
        ft.y = this.groundAtFoot(ft.x);
        ft.planted = true;
        ft.t = 1;
      }
    }
  }

  computeJoints(dt) {
    const s = this.dims.s;
    const d = this.dims;
    const f = this.facing;
    const pose = this.pose;
    const grounded = this.grounded && this.state !== 'air';
    if (grounded && dt > 0) this.updateFeet(dt);
    const px = this.x + f * pose[PX] * s;
    let py = this.y - pose[PY] * s + this.squash;
    if (grounded) {
      py -= this.swingT * (Math.abs(this.vx) > 210 ? 3.5 : 1.0) * s;
      // hips must reach the planted feet: drop a little, then let a trailing
      // foot slide along the floor rather than sinking into a split
      const reach = d.leg * 0.985;
      const pyLimit = py + 7 * s;
      for (let i = 0; i < 2; i++) {
        if (this.legW[i] > 0.5) continue;
        const ft = this.feet[i];
        const vdy = ft.y - d.footR - pyLimit;
        const dxMax = Math.sqrt(Math.max(0, reach * reach - vdy * vdy));
        const dx0 = ft.x - px;
        if (Math.abs(dx0) > dxMax) {
          ft.x = px + Math.sign(dx0) * dxMax;
          if (!ft.planted) ft.tx = ft.x;
        }
        const dx = ft.x - px;
        const up = Math.sqrt(Math.max(0, reach * reach - dx * dx));
        const minY = ft.y - d.footR - up;
        if (py < minY) py = minY;
      }
    } else {
      // airborne: pelvis above the controller's feet line
      const drop = 42 * s;
      py = this.y - Math.max(drop * 0.8, pose[PY] * s);
    }
    fk(pose, f, px, py, d, this.jt);
    if (grounded && this.state === 'move' && this.move && this.move.autoGround) {
      // rolls and get-ups: rest the lowest point of the body on the floor
      const jt = this.jt;
      let low = -1e9;
      for (let i = 0; i < NJ; i++) {
        const r = i === HEAD ? d.headR : i === FOOT_A || i === FOOT_B ? d.footR : 4 * s;
        const yy = jt[i * 2 + 1] + r;
        if (yy > low) low = yy;
      }
      const shift = this.y - low;
      for (let i = 0; i < NJ; i++) jt[i * 2 + 1] += shift;
      py += shift;
    }
    if (grounded) {
      for (let i = 0; i < 2; i++) {
        const w = this.legW[i];
        if (w >= 0.999) continue;
        const ft = this.feet[i];
        const r = ik2(px, py, ft.x, ft.y - d.footR, d.thigh, d.shin, f, 1);
        const kj = i === 0 ? KNEE_A : KNEE_B;
        const fj = i === 0 ? FOOT_A : FOOT_B;
        const jt = this.jt;
        jt[kj * 2] = lerp(r.jx, jt[kj * 2], w);
        jt[kj * 2 + 1] = lerp(r.jy, jt[kj * 2 + 1], w);
        jt[fj * 2] = lerp(r.ex, jt[fj * 2], w);
        jt[fj * 2 + 1] = lerp(r.ey, jt[fj * 2 + 1], w);
      }
    }
  }

  recordTrail() {
    const m = this.state === 'move' ? this.move : null;
    let joint = -1;
    if (m && m.hits.length) {
      const hd = m.hits[0];
      if (this.mt >= hd.t0 - 0.05 && this.mt <= hd.t1 + 0.04) joint = hd.joint;
    }
    if (joint !== this.trailJoint) {
      this.trail.length = 0;
      this.trailJoint = joint;
    }
    if (joint === -1 && !(m && m.weapon)) return;
    let x;
    let y;
    if (joint < 0) {
      const tip = this.weaponTip();
      if (!tip) return;
      x = tip[0];
      y = tip[1];
    } else {
      x = this.jt[joint * 2];
      y = this.jt[joint * 2 + 1];
    }
    this.trail.push(x, y);
    if (this.trail.length > 16) this.trail.splice(0, 2);
  }

  // Held weapon geometry: grip at the lead hand along the forearm direction.
  weaponTip() {
    const w = this.weapon;
    if (!w) return null;
    const p = this.rag.p;
    const hx = p[HAND_A].x;
    const hy = p[HAND_A].y;
    const ex = p[ELB_A].x;
    const ey = p[ELB_A].y;
    let dx = hx - ex;
    let dy = hy - ey;
    const l = Math.sqrt(dx * dx + dy * dy) || 1;
    dx /= l;
    dy /= l;
    // weapons are held angled slightly forward of the forearm
    const a = -0.35 * this.facing;
    const c = Math.cos(a);
    const sn = Math.sin(a);
    const rx = dx * c - dy * sn;
    const ry = dx * sn + dy * c;
    return [hx + rx * w.len * this.scale, hy + ry * w.len * this.scale, hx - rx * 6, hy - ry * 6];
  }

  // Called by the simulation before the physics step.
  drivePhysics() {
    if (this.removed) return;
    if (this.baked) {
      this.kinematic = false;
      return;
    }
    if (this.state === 'held' || (!this.ragdolled && this.state !== 'grabbed' && this.muscle >= 1)) {
      this.rag.drive(this.jt, this.sim.sub);
      this.rag.sleeping = false;
      this.kinematic = true;
    } else {
      this.kinematic = false;
    }
  }
}
