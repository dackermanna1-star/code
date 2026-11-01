// Character: the shared state machine for the player, inmates, guards and staff. Controllers
// (player input or NPC brains) set intents and request actions; the character resolves them
// with consistent movement rules, combat timings, reactions and animation.
import { CONFIG } from '../config.js';
import { Animator } from './animator.js';
import { rigDims } from './body.js';
import { displayName, shortName } from './roster.js';
import { ATTACKS, chooseAttack, resolveAttack, tryGrapple, throwFromGrapple } from '../gameplay/combat.js';
import { clamp, damp, dampAngle, angleDiff, yawTo, lerp, wrapAngle } from '../core/mathutil.js';

const FREE_STATES = new Set(['free']);
const MOVE_STATES = new Set(['free', 'action', 'stagger', 'grapple']);

export class Character {
  constructor(game, def, app, opts = {}) {
    this.game = game;
    this.def = def;
    this.id = def.id;
    this.kind = def.kind;
    this.isPlayer = !!opts.isPlayer;
    this.isStaff = def.kind !== 'inmate';
    this.isGuard = def.kind === 'guard';
    this.name = opts.name || displayName(def);
    this.short = opts.short || shortName(def);
    this.app = app;
    this.dims = rigDims(app);
    this.anim = new Animator(this.dims, (def.seed || 7) % 1000);
    this.rig = null;
    // Transform & physics
    this.x = 0; this.z = 0; this.y = 0; this.yaw = 0;
    this.vx = 0; this.vz = 0; this.vy = 0;
    this.radius = 0.3 + (app.build.girth - 1) * 0.22;
    this.moveX = 0; this.moveZ = 0; this.moveSpeed = 0;
    this.faceYaw = null; this.turnRate = 0; this._prevYaw = 0; this._prevSpeed = 0; this.accel = 0;
    this.sprinting = false; this.walking = false;
    // Stats
    this.stats = { str: 30, agi: 30, tgh: 30, smt: 30, ...(def.stats || {}) };
    this.respect = def.respect ?? 10;
    this.hp = this.maxHp; this.stamina = CONFIG.stamina.max; this.poise = CONFIG.combat.poiseMax;
    this.energy = 80 + Math.random() * 20; this.hunger = 70 + Math.random() * 25;
    this.ramen = def.ramen ?? Math.floor(Math.random() * 12);
    this.held = null; this.pockets = [];
    // State
    this.state = 'free'; this.stateT = 0;
    this.act = null; this.queued = null; this.combo = 0; this.lastAttack = null; this.comboT = 0;
    this.blocking = false; this.blockT = 0; this.iframes = 0; this.hitstop = 0;
    this.downT = 0; this.downDir = 'back'; this.koUntil = 0;
    this.combatTarget = null; this.lockTarget = null; this.combatTimer = 0;
    this.grapple = null; this.spot = null; this.spotPhase = null; this.spotT = 0;
    this.talkPartner = null; this.speech = null;
    this.staminaDelay = 0; this.poiseDelay = 0; this.drunk = 0;
    this.lastHitBy = null; this.lastHitT = -99;
    this.expression = 'neutral'; this.exprUntil = 0;
    this.blinkT = 2 + Math.random() * 3;
    this.lookAt = null;
    this.counterWindow = 0;     // >0 while an incoming attack can be countered
    this.incoming = null;       // attacker currently winding up against us
    this.flags = {};
  }

  get maxHp() { return Math.round(60 + this.stats.tgh * 0.8); }
  get isDown() { return this.state === 'down' || this.state === 'ko' || this.state === 'thrown'; }
  get busy() { return this.state !== 'free'; }
  get alive() { return true; }
  get canFight() { return this.state === 'free' || (this.state === 'action' && this.act && this.act.type === 'attack'); }
  get speedStat() { return 0.92 + this.stats.agi / 400; }

  place(x, z, yaw = this.yaw) { this.x = x; this.z = z; this.yaw = yaw; this.vx = this.vz = 0; }

  /** Movement intent in world space. dir need not be normalized; speed in m/s. */
  setMove(dx, dz, speed) {
    const l = Math.hypot(dx, dz);
    if (l < 1e-4 || speed <= 0) { this.moveX = 0; this.moveZ = 0; this.moveSpeed = 0; return; }
    this.moveX = dx / l; this.moveZ = dz / l; this.moveSpeed = speed;
  }
  stop() { this.setMove(0, 0, 0); }

  /** Desired top speed given state, stamina, carry etc. */
  maxSpeed(kind = 'run') {
    const M = CONFIG.move;
    let v = kind === 'sprint' ? M.sprintSpeed : kind === 'walk' ? M.walkSpeed : M.runSpeed;
    v *= this.speedStat;
    if (this.held && this.held.def.heavy) v *= M.carryHeavyMult;
    if (this.energy < 15) v *= 0.85;
    if (this.hp < this.maxHp * 0.25) v *= 0.85;
    if (this.drunk > 0) v *= 0.9;
    return v;
  }

  // ------------------------------------------------------------------------------------ update
  update(dt) {
    const g = this.game;
    if (this.hitstop > 0) { this.hitstop -= dt; this._animate(dt * 0.08); return; }
    this.stateT += dt;
    this.iframes = Math.max(0, this.iframes - dt);
    this.combatTimer = Math.max(0, this.combatTimer - dt);
    this.comboT = Math.max(0, this.comboT - dt);
    if (this.comboT <= 0) this.combo = 0;
    this.counterWindow = Math.max(0, this.counterWindow - dt);
    this.drunk = Math.max(0, this.drunk - dt / 60);
    this._regen(dt);
    switch (this.state) {
      case 'free': this._updateFree(dt); break;
      case 'action': this._updateAction(dt); break;
      case 'stagger': if (this.stateT >= this.staggerT) this.setState('free'); this._physics(dt, 0.25); break;
      case 'down': this._updateDown(dt); break;
      case 'getup': if (this.stateT >= 0.85) this.setState('free'); this._physics(dt, 0); break;
      case 'ko': this._updateKO(dt); break;
      case 'thrown': this._updateThrown(dt); break;
      case 'grapple': this._updateGrapple(dt); break;
      case 'grappled': break; // positioned by the grappler
      case 'spot': this._updateSpot(dt); break;
      case 'talk': this._updateTalk(dt); break;
      case 'cuffed': this._physics(dt, 0.55); break;
      default: break;
    }
    this._animate(dt);
    void g;
  }

  setState(s) {
    const prev = this.state;
    this.state = s; this.stateT = 0;
    if (s === 'free') { this.anim.setPosture(null); }
    if (prev === 'spot' && s !== 'spot' && this.spot) this._releaseSpot();
  }

  _regen(dt) {
    const S = CONFIG.stamina;
    this.staminaDelay = Math.max(0, this.staminaDelay - dt);
    if (this.staminaDelay <= 0 && !this.blocking && !this.sprinting) {
      const k = 0.5 + Math.min(1, this.energy / 60) * 0.5;
      this.stamina = Math.min(S.max, this.stamina + S.regen * k * dt);
    }
    if (this.sprinting && this.moveSpeed > 0.5) { this.stamina = Math.max(0, this.stamina - S.sprintCost * dt); this.staminaDelay = S.regenDelay; }
    this.poiseDelay = Math.max(0, this.poiseDelay - dt);
    if (this.poiseDelay <= 0) this.poise = Math.min(CONFIG.combat.poiseMax, this.poise + CONFIG.combat.poiseRegen * dt);
    if (this.hp < this.maxHp && this.state !== 'ko' && this.combatTimer <= 0 && this.hunger > 20) this.hp = Math.min(this.maxHp, this.hp + 0.15 * dt);
  }
  useStamina(n) { this.stamina = Math.max(0, this.stamina - n); this.staminaDelay = CONFIG.stamina.regenDelay; }

  // ------------------------------------------------------------------------------------ free
  _updateFree(dt) {
    if (this.blocking) {
      this.blockT += dt;
      if (this.stamina <= 0) this.setBlock(false);
    }
    this._physics(dt, this.blocking ? 0.45 : 1);
  }

  /** Core locomotion: accelerate toward the intent, turn smoothly, collide. */
  _physics(dt, mult = 1, opts = {}) {
    const M = CONFIG.move;
    let speed = this.moveSpeed * mult;
    const lock = this.lockTarget && !this.lockTarget.isDown && this.state !== 'thrown' ? this.lockTarget : null;
    if (lock && !this.sprinting) speed = Math.min(speed, M.strafeSpeed * this.speedStat * mult);
    const dvx = this.moveX * speed, dvz = this.moveZ * speed;
    const cur = Math.hypot(this.vx, this.vz), des = Math.hypot(dvx, dvz);
    const rate = des > cur + 0.05 ? M.accel : M.decel;
    const k = 1 - Math.exp(-rate * dt);
    this.vx += (dvx - this.vx) * k; this.vz += (dvz - this.vz) * k;
    if (opts.extraVX) { this.vx += opts.extraVX; this.vz += opts.extraVZ; }
    // Facing
    let target = null;
    if (this.faceYaw != null) target = this.faceYaw;
    else if (lock && this.state !== 'stagger') target = yawTo(lock.x - this.x, lock.z - this.z);
    else if (des > 0.15) target = Math.atan2(dvx, dvz);
    if (target != null && !opts.noTurn) {
      const diff = Math.abs(angleDiff(this.yaw, target));
      const tr = diff > 2.0 ? M.pivotTurnRate : M.turnRate;
      this.yaw = dampAngle(this.yaw, target, tr * (opts.turnMult || 1), dt);
    }
    this._integrate(dt);
  }

  _integrate(dt) {
    const g = this.game;
    this.x += this.vx * dt; this.z += this.vz * dt;
    if (g.world) {
      const res = g.world.colliders.resolveCircle(this.x, this.z, this.radius, this.y + 0.1, this.y + 1.7, this._colFilter || (this._colFilter = (b) => this._collides(b)));
      if (res.hit) {
        this.x = res.x; this.z = res.z;
        const dot = this.vx * res.nx + this.vz * res.nz;
        if (dot < 0) { this.vx -= dot * res.nx; this.vz -= dot * res.nz; }
        this.wallHit = res;
      } else this.wallHit = null;
    }
  }
  _collides(b) {
    if (b.kind === 'door' && b.ref && (b.ref.amount > 0.7 || (b.ref.canPass(this) && !b.ref.locked && b.ref.amount > 0.3))) return false;
    return true;
  }

  // ------------------------------------------------------------------------------------ actions
  /** Begin a timed action. data: {type, dur, anim, moveMult, ...} */
  startAction(data) {
    this.act = { t: 0, moveMult: 0.3, ...data };
    this.setState('action');
    if (data.anim) this.anim.play(data.anim, data.animDur || data.dur, { mirror: data.mirror, full: data.full });
    return this.act;
  }
  endAction() {
    this.act = null;
    if (this.state === 'action') this.setState('free');
  }

  attack(kind = 'light') {
    if (this.state === 'grapple') return this._grappleAttack(kind);
    if (this.act && this.act.type === 'attack') {
      // Combo chaining: queue the follow-up; it fires once the current strike lands.
      this.queued = kind;
      return true;
    }
    if (this.state !== 'free' || this.blocking && this.blockT < 0.08) return false;
    if (this.stamina <= 2) { this.game.events.emit('tooTired', { c: this }); return false; }
    return this._startAttack(kind, this.lastAttack && this.comboT > 0 ? this.lastAttack : null);
  }
  _startAttack(kind, prev) {
    const name = chooseAttack(this, kind, prev);
    const atk = ATTACKS[name];
    if (!atk) return false;
    this.setBlock(false);
    const tgt = this.combatTarget && !this.combatTarget.isDown || (this.combatTarget && atk.ground) ? this.combatTarget : null;
    const speedK = clamp(0.85 + this.stats.agi / 300, 0.85, 1.18) * (this.stamina < CONFIG.stamina.exhaustedThreshold ? 0.82 : 1);
    const dur = atk.dur / speedK;
    this.startAction({ type: 'attack', atk, name, dur, hitAt: atk.hitAt / speedK, anim: atk.anim, mirror: atk.mirror, full: atk.anim === 'kick' || atk.anim === 'stomp' || atk.anim === 'knee', target: tgt, moveMult: 0.18, hit: false });
    this.useStamina(atk.stam);
    this.lastAttack = name; this.combatTimer = 6; this.lastAttackT = this.game.time;
    if (tgt) { tgt.notifyIncoming(this, this.act); }
    this.game.events.emit('swing', { c: this, atk });
    return true;
  }
  /** Warn a defender that an attack is coming (drives counter prompts and NPC defence). */
  notifyIncoming(att, act) {
    this.incoming = { att, act, at: this.game.time };
    const window = (act.hitAt || 0.2);
    if (this.canFight) this.counterWindow = window + 0.06;
  }

  _updateAction(dt) {
    const a = this.act;
    if (!a) { this.setState('free'); return; }
    a.t += dt;
    let extraVX = 0, extraVZ = 0;
    if (a.type === 'attack') {
      const tgt = a.target;
      // Magnetism / short motion warp toward the target during the wind-up.
      if (tgt && !a.hit && a.t < a.hitAt) {
        const dx = tgt.x - this.x, dz = tgt.z - this.z, d = Math.hypot(dx, dz);
        const want = (a.atk.range || 1.2) * 0.8 + tgt.radius * 0.5;
        const desiredYaw = yawTo(dx, dz);
        this.yaw = dampAngle(this.yaw, desiredYaw, 30, dt);
        if (d > want && d < want + (a.atk.lunge || 0.3) + 1.0) {
          const step = Math.min(d - want, CONFIG.combat.lungeMax) / Math.max(0.05, a.hitAt);
          extraVX = (dx / d) * step * dt * 2.2; extraVZ = (dz / d) * step * dt * 2.2;
        }
      }
      if (!a.hit && a.t >= a.hitAt) {
        a.hit = true;
        const n = resolveAttack(this.game, this, a);
        if (n > 0) { this.combo++; this.comboT = 1.1; } else { this.combo = 0; }
      }
      // Chain into the queued follow-up once the strike has landed.
      const chainAt = Math.max(a.hitAt + 0.05, a.dur * 0.6);
      if (this.queued && a.hit && a.t >= chainAt) {
        const q = this.queued; this.queued = null;
        if (this.stamina > 2) { this.act = null; this.state = 'free'; this._startAttack(q, this.lastAttack); return; }
      }
      if (a.t >= a.dur) { this.queued = null; this.endAction(); return; }
      this._physics(dt, a.t < a.hitAt ? 0.3 : 0.15, { extraVX: extraVX / Math.max(dt, 1e-4) * dt, extraVZ: extraVZ / Math.max(dt, 1e-4) * dt, noTurn: !!a.target });
      return;
    }
    if (a.type === 'dodge') {
      if (a.t < 0.24) { this.vx = a.dx * a.speed; this.vz = a.dz * a.speed; }
      this.iframes = a.t > 0.02 && a.t < 0.26 ? 0.05 : this.iframes;
      this._integrate(dt);
      this.vx *= 0.82; this.vz *= 0.82;
      if (a.t >= a.dur) this.endAction();
      return;
    }
    if (a.type === 'grab') {
      if (!a.done && a.t >= a.grabAt) { a.done = true; if (tryGrapple(this.game, this, a.target)) return; }
      if (a.t >= a.dur) this.endAction();
      this._physics(dt, 0.2);
      return;
    }
    if (a.update) { if (a.update(this, dt, a) === 'done') { this.endAction(); return; } }
    if (a.t >= a.dur) { if (a.onEnd) a.onEnd(this, a); if (this.act === a) this.endAction(); return; }
    this._physics(dt, a.moveMult ?? 0.3, { noTurn: a.noTurn });
  }

  /** Cancel the current action if allowed (dodging out of recovery, etc). */
  canCancel() {
    const a = this.act;
    if (!a) return true;
    if (a.type === 'attack') return a.hit && a.t > a.hitAt + 0.06;
    return !!a.cancelable;
  }

  dodge(dx, dz) {
    if (this.state === 'action' && !this.canCancel()) return false;
    if (this.state !== 'free' && this.state !== 'action') return false;
    if (this.stamina < CONFIG.stamina.dodgeCost * 0.5) { this.game.events.emit('tooTired', { c: this }); return false; }
    let l = Math.hypot(dx, dz);
    if (l < 0.1) { dx = -Math.sin(this.yaw); dz = -Math.cos(this.yaw); l = 1; }
    dx /= l; dz /= l;
    this.setBlock(false);
    this.queued = null;
    const local = angleDiff(this.yaw, Math.atan2(dx, dz));
    this.startAction({ type: 'dodge', dur: 0.42, dx, dz, speed: 6.6 * this.speedStat, anim: 'dodge', full: true, mirror: local < 0 });
    this.useStamina(CONFIG.stamina.dodgeCost);
    this.game.events.emit('dodge', { c: this });
    return true;
  }
  setBlock(on) {
    if (on && (this.state !== 'free' || this.stamina <= 0)) return false;
    if (on !== this.blocking) { this.blocking = on; this.blockT = 0; if (on) this.combatTimer = Math.max(this.combatTimer, 3); }
    return true;
  }
  grab(target = null) {
    if (this.state !== 'free' || this.held) return false;
    this.setBlock(false);
    this.startAction({ type: 'grab', dur: 0.42, grabAt: 0.17, anim: 'grabReach', target: target || this.combatTarget, moveMult: 0.2 });
    this.useStamina(5);
    return true;
  }
  /** Counter an incoming strike inside its window: parry and riposte. */
  counter() {
    const inc = this.incoming;
    if (!inc || this.counterWindow <= 0 || !inc.att || inc.att.state !== 'action' || inc.att.act !== inc.act) return false;
    if (this.state !== 'free' && !(this.state === 'action' && this.canCancel())) return false;
    if (this.stamina < 8) return false;
    const att = inc.att;
    this.act = null; this.state = 'free';
    att.act = null; att.setState('stagger'); att.staggerT = 0.55; att.anim.play('stagger', 0.6);
    this.combatTarget = att;
    this.counterWindow = 0;
    this.useStamina(6);
    this.yaw = yawTo(att.x - this.x, att.z - this.z);
    this.startAction({ type: 'attack', atk: ATTACKS.counter, name: 'counter', dur: ATTACKS.counter.dur, hitAt: ATTACKS.counter.hitAt, anim: 'cross', target: att, moveMult: 0.2, hit: false });
    this.game.events.emit('counter', { c: this, att });
    return true;
  }

  // ------------------------------------------------------------------------------------ reactions
  takeHit(att, info) {
    if (this.iframes > 0 || this.state === 'thrown' && !info.ground) return 'dodged';
    if (this.state === 'ko' && !info.ground) return 'dodged';
    this.lastHitBy = att; this.lastHitT = this.game.time; this.combatTimer = 8;
    if (!this.combatTarget || this.combatTarget.isDown) this.combatTarget = att;
    this.flags.hurtBy = att.id;
    const facing = Math.abs(angleDiff(this.yaw, yawTo(att.x - this.x, att.z - this.z)));
    if (this.blocking && facing < CONFIG.combat.blockArc / 2 && !info.ground) {
      const cost = CONFIG.stamina.blockHitCost * (info.heavy ? 1.8 : 1);
      this.useStamina(cost);
      if (info.guardBreak && this.stamina < 25 || this.stamina <= 0) {
        this.setBlock(false); this.stagger(0.6); this.game.events.emit('guardBreak', { c: this, att });
        return 'guardbreak';
      }
      this.hp -= info.dmg * (1 - CONFIG.combat.blockReduction);
      this.anim.play('blockHit', 0.25);
      this.vx += info.dirX * 1.2; this.vz += info.dirZ * 1.2;
      att.hitstop = Math.max(att.hitstop, 0.05);
      return 'blocked';
    }
    this.hp -= info.dmg;
    this.poise -= info.poise; this.poiseDelay = 1.0;
    this.anim.hitReact(info.dirX, info.dirZ, info.heavy ? 1.4 : 0.8);
    this.setExpression('hurt', 0.8);
    if (this.state === 'grapple' || this.state === 'grappled') { if (info.heavy || this.hp <= 0) this.endGrapple('broken'); }
    if (this.spot) this.leaveSpot(true);
    if (this.talkPartner) this.game.endConversation?.(this, 'interrupted');
    if (this.hp <= 0) { this.hp = 0; this.knockOut(info.dirX, info.dirZ); return 'ko'; }
    if (this.isDown) { this.downT = Math.min(this.downT + 0.3, 3); return 'hit'; }
    if (this.poise <= 0 || (info.knock && this.poise < 45)) { this.poise = CONFIG.combat.poiseMax; this.knockDown(info.dirX, info.dirZ, facing < Math.PI / 2 ? 'back' : 'front'); return 'knockdown'; }
    if (info.push) { this.vx += info.dirX * info.push; this.vz += info.dirZ * info.push; this.stagger(0.45); return 'hit'; }
    if (info.heavy) { this.stagger(0.5); this.vx += info.dirX * 2.2; this.vz += info.dirZ * 2.2; return 'hit'; }
    this.flinch(info);
    return 'hit';
  }
  flinch(info) {
    if (this.act && this.act.type === 'attack' && !this.act.hit) this.act = null;
    this.setBlock(false);
    this.setState('stagger'); this.staggerT = 0.26;
    this.anim.play(info.region === 'gut' ? 'flinchBody' : 'flinch', 0.32);
    this.vx += info.dirX * 1.4; this.vz += info.dirZ * 1.4;
  }
  stagger(t) {
    this.act = null; this.queued = null; this.setBlock(false);
    this.setState('stagger'); this.staggerT = t;
    this.anim.play('stagger', Math.max(0.5, t));
  }
  knockDown(dx, dz, dir = 'back', time = null) {
    this.act = null; this.queued = null; this.setBlock(false);
    if (this.grapple) this.endGrapple('broken');
    if (this.spot) this.leaveSpot(true);
    this.dropHeld(0.5);
    this.downDir = dir;
    const tgh = this.stats.tgh / 100;
    this.downT = time ?? lerp(CONFIG.combat.knockdownTime[1], CONFIG.combat.knockdownTime[0], tgh);
    this.setState('down');
    this.anim.play(dir === 'back' ? 'fallBack' : 'fallFront', 0.6, { full: true, hold: true });
    this.anim.setPosture(dir === 'back' ? 'lieBack' : 'lieFront');
    this.vx = dx * 2.5; this.vz = dz * 2.5;
    this.game.events.emit('knockdown', { c: this });
  }
  knockOut(dx = 0, dz = 0) {
    this.act = null; this.queued = null; this.setBlock(false);
    if (this.grapple) this.endGrapple('broken');
    if (this.spot) this.leaveSpot(true);
    this.dropHeld(1);
    this.setState('ko');
    this.koUntil = this.game.clock ? this.game.clock.total + CONFIG.combat.koMinutes : this.game.time + 20;
    this.anim.play('fallBack', 0.6, { full: true, hold: true });
    this.anim.setPosture('ko');
    this.setExpression('ko', 9999);
    this.vx = dx * 2.5; this.vz = dz * 2.5;
    this.game.events.emit('ko', { c: this, by: this.lastHitBy });
  }
  _updateDown(dt) {
    this.vx *= Math.max(0, 1 - 5 * dt); this.vz *= Math.max(0, 1 - 5 * dt);
    this._integrate(dt);
    if (this.stateT > 0.6 && this.anim.action && this.anim.action.hold) this.anim.stop(0.3);
    if (this.stateT >= this.downT) this.getUp();
  }
  /** Players can mash to get up sooner. */
  struggleUp() { if (this.state === 'down') this.downT = Math.max(this.stateT + 0.15, this.downT - 0.18); }
  getUp() {
    this.anim.setPosture(null);
    this.anim.play(this.downDir === 'back' ? 'getUpBack' : 'getUpFront', 0.85, { full: true });
    this.setState('getup');
    this.iframes = CONFIG.combat.getUpInvuln;
    this.setExpression('angry', 2);
  }
  _updateKO(dt) {
    this.vx *= Math.max(0, 1 - 5 * dt); this.vz *= Math.max(0, 1 - 5 * dt);
    this._integrate(dt);
    if (this.stateT > 0.6 && this.anim.action && this.anim.action.hold) this.anim.stop(0.3);
    const now = this.game.clock ? this.game.clock.total : this.game.time;
    if (now >= this.koUntil && !this.flags.holdKO) {
      this.hp = Math.max(this.hp, this.maxHp * 0.3);
      this.downDir = 'back';
      this.setExpression('hurt', 4);
      this.getUp();
      this.game.events.emit('wake', { c: this });
    }
  }
  launch(vx, vy, vz, by) {
    this.act = null; this.queued = null; this.setBlock(false);
    if (this.spot) this.leaveSpot(true);
    this.dropHeld(0.7);
    this.vx = vx; this.vz = vz; this.vy = vy; this.thrownBy = by; this.thrownHit = new Set([this.id, by && by.id]);
    this.setState('thrown');
    this.yaw = Math.atan2(-vx, -vz);
    this.anim.play('thrown', 0.7, { full: true, hold: true });
  }
  _updateThrown(dt) {
    const g = this.game;
    this.vy -= 18 * dt;
    this.y = Math.max(0, this.y + this.vy * dt);
    const pvx = this.vx, pvz = this.vz;
    this._integrate(dt);
    // Smack into walls: extra damage and a hard stop.
    if (this.wallHit && Math.hypot(pvx, pvz) > 3) {
      this.hp -= 5; this.vx *= -0.2; this.vz *= -0.2;
      g.events.emit('wallSlam', { c: this, speed: Math.hypot(pvx, pvz) });
    }
    // Bowl over anyone in the way.
    for (const o of g.characters) {
      if (this.thrownHit.has(o.id) || o.isDown || o.state === 'spot') continue;
      if (Math.hypot(o.x - this.x, o.z - this.z) < this.radius + o.radius) {
        this.thrownHit.add(o.id);
        const d = Math.hypot(this.vx, this.vz) || 1;
        o.takeHit(this.thrownBy || this, { dmg: 4, poise: 200, dirX: this.vx / d, dirZ: this.vz / d, heavy: true, region: 'chest' });
        this.vx *= 0.5; this.vz *= 0.5;
      }
    }
    if (this.y <= 0 && this.vy < 0 && this.stateT > 0.15) {
      this.y = 0; this.vy = 0;
      this.hp -= 6;
      g.events.emit('land', { c: this });
      if (this.hp <= 0) { this.hp = 0; this.knockOut(this.vx * 0.2, this.vz * 0.2); }
      else this.knockDown(this.vx * 0.3, this.vz * 0.3, 'back', 1.6);
    }
  }

  // ------------------------------------------------------------------------------------ grapple
  beginGrapple(v) {
    this.endAction();
    this.grapple = { partner: v, role: 'attacker', t: 0 };
    v.grapple = { partner: this, role: 'victim', t: 0, struggle: 0 };
    v.act = null; v.queued = null; v.setBlock(false);
    if (v.spot) v.leaveSpot(true);
    this.setState('grapple'); v.setState('grappled');
    this.anim.play('grappleHold', 1, { loop: true });
    v.anim.play('grappled', 0.8, { loop: true, full: true });
    v.setExpression('shock', 2);
    this.combatTimer = v.combatTimer = 8;
  }
  endGrapple(reason) {
    const gpl = this.grapple;
    if (!gpl) return;
    const other = gpl.partner;
    this.grapple = null;
    if (other && other.grapple) other.grapple = null;
    const att = gpl.role === 'attacker' ? this : other;
    const vic = gpl.role === 'attacker' ? other : this;
    if (att && att.state === 'grapple') { att.anim.stop(0.15); att.setState('free'); }
    if (vic && vic.state === 'grappled') {
      vic.anim.stop(0.15);
      if (reason === 'escape') { vic.stagger(0.3); att.stagger(0.45); }
      else if (reason === 'release' || reason === 'timeout') { const d = Math.hypot(vic.x - att.x, vic.z - att.z) || 1; vic.vx = (vic.x - att.x) / d * 3.2; vic.vz = (vic.z - att.z) / d * 3.2; vic.stagger(0.5); }
      else if (reason !== 'throw') vic.setState('free');
    }
  }
  _grappleAttack(kind) {
    if (this.act) return false;
    const atk = kind === 'heavy' ? ATTACKS.headbutt : ATTACKS.knee;
    this.act = { type: 'gattack', atk, t: 0, hitAt: atk.hitAt, dur: atk.dur, hit: false };
    this.anim.play(atk.anim, atk.dur, { full: atk.anim === 'knee' });
    this.useStamina(atk.stam);
    return true;
  }
  grappleThrow(dx, dz) {
    if (this.state !== 'grapple' || this.act) return false;
    let l = Math.hypot(dx, dz);
    if (l < 0.1) { dx = Math.sin(this.yaw); dz = Math.cos(this.yaw); l = 1; }
    this.act = { type: 'gthrow', t: 0, dur: 0.6, dx: dx / l, dz: dz / l };
    this.anim.play('throwToss', 0.6, { full: true });
    this.useStamina(10);
    return true;
  }
  grappleRelease() { if (this.state === 'grapple') { this.anim.play('shove', 0.45); this.endGrapple('release'); return true; } return false; }
  /** Victim mashing to break free. */
  struggle(amount = 0.12) {
    if (this.state !== 'grappled' || !this.grapple) return;
    this.grapple.struggle += amount;
  }
  _updateGrapple(dt) {
    const gp = this.grapple;
    if (!gp || !gp.partner || gp.partner.state !== 'grappled') { this.grapple = null; this.setState('free'); this.anim.stop(0.2); return; }
    gp.t += dt;
    const v = gp.partner;
    // Victim struggle (NPC victims struggle automatically; players mash).
    const vg = v.grapple;
    if (vg) {
      if (!v.isPlayer) vg.struggle += dt * clamp(0.22 + (v.stats.str - this.stats.str) / 220, 0.06, 0.6);
      if (vg.struggle >= 1) { this.game.events.emit('grappleEscape', { att: this, vic: v }); this.endGrapple('escape'); return; }
    }
    if (gp.t > CONFIG.combat.grappleMaxTime && !this.act) { this.endGrapple('timeout'); return; }
    // Grapple strikes / throw
    const a = this.act;
    if (a) {
      a.t += dt;
      if (a.type === 'gattack' && !a.hit && a.t >= a.hitAt) { a.hit = true; resolveAttack(this.game, this, a); }
      if (a.type === 'gthrow' && !a.hit && a.t >= 0.32) { a.hit = true; this.act = null; throwFromGrapple(this.game, this, a.dx, a.dz); return; }
      if (a.t >= a.dur) { this.act = null; if (this.state === 'grapple') this.anim.play('grappleHold', 1, { loop: true }); }
    }
    // Drag the victim along slowly.
    this._physics(dt, 0.35, { turnMult: 0.5 });
    const fx = Math.sin(this.yaw), fz = Math.cos(this.yaw);
    v.x = this.x + fx * 0.72; v.z = this.z + fz * 0.72; v.yaw = wrapAngle(this.yaw + Math.PI);
    v.vx = this.vx; v.vz = this.vz;
  }

  // ------------------------------------------------------------------------------------ items
  pickUp(item) {
    if (this.state !== 'free' || !item || item.holder || item.pocketOf) return false;
    const d = Math.hypot(item.x - this.x, item.z - this.z);
    if (d > CONFIG.interact.reach + 0.3) return false;
    this.setBlock(false);
    const high = item.y > 0.6;
    this.faceYaw = yawTo(item.x - this.x, item.z - this.z);
    this.startAction({ type: 'pickup', dur: high ? 0.38 : 0.5, anim: high ? 'dropItem' : 'pickup', full: !high, item, moveMult: 0.15,
      update: (c, dt, a) => {
        if (!a.done && a.t >= (high ? 0.16 : 0.22)) {
          a.done = true; c.faceYaw = null;
          if (!item.holder && !item.pocketOf && Math.hypot(item.x - c.x, item.z - c.z) < CONFIG.interact.reach + 0.5) c.game.giveItem(c, item);
          else c.game.events.emit('pickupFail', { c, item });
        }
        c._physics(dt, 0.15);
      },
      onEnd: (c) => { c.faceYaw = null; } });
    return true;
  }
  dropHeld(chanceOrForce = 1) {
    if (!this.held) return null;
    if (chanceOrForce < 1 && Math.random() > chanceOrForce) return null;
    const it = this.held;
    this.held = null;
    const fx = Math.sin(this.yaw), fz = Math.cos(this.yaw);
    this.game.items.release(it, this.x + fx * 0.45, this.y + 0.9, this.z + fz * 0.45, this.vx * 0.5 + fx * 0.6, 0.5, this.vz * 0.5 + fz * 0.6);
    this.game.events.emit('dropItem', { c: this, item: it });
    return it;
  }
  drop() {
    if (!this.held || this.state !== 'free') return false;
    this.startAction({ type: 'drop', dur: 0.3, anim: 'dropItem', moveMult: 0.5, update: (c, dt, a) => { if (!a.done && a.t > 0.12) { a.done = true; c.dropHeld(1); } c._physics(dt, 0.5); } });
    return true;
  }
  throwHeld(target = null, dirX = null, dirZ = null) {
    if (!this.held || this.state !== 'free') return false;
    this.setBlock(false);
    if (target) { this.faceYaw = yawTo(target.x - this.x, target.z - this.z); }
    else if (dirX != null) this.faceYaw = Math.atan2(dirX, dirZ);
    this.startAction({ type: 'throw', dur: 0.5, anim: 'throwItem', moveMult: 0.2, target,
      update: (c, dt, a) => {
        if (!a.done && a.t >= 0.24) {
          a.done = true; c.faceYaw = null;
          const it = c.held; if (!it) return;
          c.held = null;
          const fx = Math.sin(c.yaw), fz = Math.cos(c.yaw);
          let vx = fx * 13, vz = fz * 13, vy = 3.2;
          if (target) {
            const dx = target.x - c.x, dz = target.z - c.z, d = Math.hypot(dx, dz) || 1;
            const t = clamp(d / 13, 0.12, 0.9);
            vx = dx / t; vz = dz / t; vy = (1.15 - 1.55) / t + 0.5 * 18 * t;
          }
          c.game.items.release(it, c.x + fx * 0.5, c.y + 1.55, c.z + fz * 0.5, vx, vy, vz, c);
          c.useStamina(6);
          c.game.events.emit('throwItem', { c, item: it });
        }
        c._physics(dt, 0.25);
      }, onEnd: (c) => { c.faceYaw = null; } });
    return true;
  }
  useHeld() {
    const it = this.held;
    if (!it || this.state !== 'free' || !it.def.use) return false;
    const kind = it.def.use;
    if (kind === 'eat' && it.def.mealItem && !it.filled) { this.game.events.emit('emptyTray', { c: this }); return false; }
    this.startAction({ type: 'use', dur: kind === 'read' ? 3.0 : 1.3, anim: kind === 'read' ? 'read' : kind === 'drink' ? 'drink' : 'eat', moveMult: 0.35, cancelable: true,
      onEnd: (c) => c.game.consumeItem(c, it) });
    return true;
  }

  // ------------------------------------------------------------------------------------ spots
  useSpot(spot) {
    if (this.state !== 'free' || !spot || (spot.occupant && spot.occupant !== this)) return false;
    this.setBlock(false);
    spot.occupant = this; spot.reservedBy = null;
    this.spot = spot; this.spotPhase = 'enter'; this.spotT = 0;
    this.spotFrom = [this.x, this.z, this.yaw, this.y];
    this.setState('spot');
    this.vx = this.vz = 0;
    this.game.events.emit('spotEnter', { c: this, spot });
    return true;
  }
  leaveSpot(force = false) {
    if (!this.spot) return;
    if (force) { this._releaseSpot(); if (this.state === 'spot') this.setState('free'); this.y = 0; return; }
    if (this.spotPhase !== 'leave') { this.spotPhase = 'leave'; this.spotT = 0; this.anim.setPosture(null); this.anim.stop(0.2); }
  }
  _releaseSpot() {
    const s = this.spot;
    if (!s) return;
    if (s.occupant === this) s.occupant = null;
    this.spot = null;
    this.anim.setPosture(null);
    this.game.events.emit('spotLeave', { c: this, spot: s });
  }
  _updateSpot(dt) {
    const s = this.spot;
    if (!s) { this.setState('free'); return; }
    this.spotT += dt;
    const ENTER = s.snap ? 0.25 : 0.4;
    if (this.spotPhase === 'enter') {
      const t = Math.min(1, this.spotT / ENTER), e = t * t * (3 - 2 * t);
      const [fx, fz, fyaw, fy] = this.spotFrom;
      this.x = lerp(fx, s.x, e); this.z = lerp(fz, s.z, e); this.y = lerp(fy, this._spotY(s), e);
      this.yaw = fyaw + angleDiff(fyaw, s.yaw) * e;
      const posture = POSTURE_FOR[s.pose];
      if (posture) this.anim.setPosture(posture);
      if (t >= 1) { this.spotPhase = 'use'; this.spotT = 0; this.game.activityStart?.(this, s); }
    } else if (this.spotPhase === 'use') {
      this.x = s.x; this.z = s.z; this.y = this._spotY(s); this.yaw = s.yaw;
      this.game.activityTick?.(this, s, dt);
    } else if (this.spotPhase === 'leave') {
      const LEAVE = 0.35;
      const t = Math.min(1, this.spotT / LEAVE), e = t * t * (3 - 2 * t);
      this.x = lerp(s.x, s.ax, e); this.z = lerp(s.z, s.az, e); this.y = lerp(this._spotY(s), 0, e);
      if (t >= 1) { this.y = 0; this._releaseSpot(); this.setState('free'); }
    }
  }

  /** Root height while using a spot: seats keep the feet on the floor (posture lowers the pelvis). */
  _spotY(s) { return s.pose === 'sit' ? Math.max(0, s.y - 0.46) : s.y; }

  // ------------------------------------------------------------------------------------ social
  _updateTalk(dt) {
    const p = this.talkPartner;
    if (p) this.faceYaw = yawTo(p.x - this.x, p.z - this.z);
    this._physics(dt, this.isPlayer ? 0 : 0);
  }
  say(text, dur = 3, opts = {}) {
    this.speech = { text, until: this.game.time + dur, mood: opts.mood || 'neutral' };
    this.talkingUntil = this.game.time + Math.min(dur, 0.35 + text.length * 0.045);
    if (opts.expr) this.setExpression(opts.expr, dur);
    this.game.events.emit('say', { c: this, text, opts });
  }
  setExpression(e, dur = 2) { this.expression = e; this.exprUntil = this.game.time + dur; }

  // ------------------------------------------------------------------------------------ animation
  _animate(dt) {
    const sp = Math.hypot(this.vx, this.vz);
    const fx = Math.sin(this.yaw), fz = Math.cos(this.yaw);
    const vf = this.vx * fx + this.vz * fz, vs = this.vx * fz - this.vz * fx;
    const yawRate = dt > 0 ? angleDiff(this._prevYaw, this.yaw) / dt : 0;
    this._prevYaw = this.yaw;
    this.accel = dt > 0 ? (sp - this._prevSpeed) / dt : 0; this._prevSpeed = sp;
    const inCombat = (this.combatTimer > 0 || this.blocking || !!this.lockTarget) && !this.held && this.state !== 'spot' && this.state !== 'talk';
    let lookYaw = 0;
    const look = this.lookAt || (this.talkPartner) || (this.combatTarget && this.combatTimer > 0 ? this.combatTarget : null);
    if (look && !this.isDown) lookYaw = clamp(angleDiff(this.yaw, yawTo(look.x - this.x, look.z - this.z)), -1.1, 1.1);
    const moving = this.state === 'free' || this.state === 'action' || this.state === 'stagger' || this.state === 'grapple' || this.state === 'cuffed';
    const treadmill = this.spot && this.spot.activity === 'treadmill' && this.spotPhase === 'use' ? 3.6 : 0;
    this.anim.update(dt, {
      speed: moving ? sp : treadmill, vf: moving ? vf : treadmill, vs: moving ? vs : 0, turnRate: yawRate, accel: this.accel,
      combat: inCombat && moving, block: this.blocking, carry: this.held ? this.held.def.carry : null,
      lookYaw, sprint: this.sprinting && sp > 4.5, exhausted: this.stamina < CONFIG.stamina.exhaustedThreshold || this.energy < 10,
    });
    if (this.anim.events.length && this.game.onAnimEvent) for (const ev of this.anim.events) this.game.onAnimEvent(this, ev);
    // Face expression timing, blinking and mouth movement are visual-only.
    if (this.rig) {
      if (this.game.time > this.exprUntil && this.expression !== 'neutral' && this.state !== 'ko') this.expression = this.state === 'down' ? 'hurt' : 'neutral';
      const sleeping = this.spot && this.spot.activity === 'sleep' && this.spotPhase === 'use';
      this.rig.setExpression(sleeping ? 'sleep' : this.expression);
      this.blinkT -= dt;
      if (this.blinkT < 0) { this.rig.setBlink(true); if (this.blinkT < -0.12) { this.rig.setBlink(false); this.blinkT = 2.5 + Math.random() * 3.5; } }
      const talking = this.talkingUntil && this.game.time < this.talkingUntil;
      this.rig.setMouth(talking ? Math.sin(this.game.time * 22) > 0 : false);
    }
  }
}

export const POSTURE_FOR = { sit: 'sit', lie: 'lie', benchPress: 'benchPress', squat: 'squat', pullup: 'pullup', situps: 'situps', treadmill: null, stand: null };
