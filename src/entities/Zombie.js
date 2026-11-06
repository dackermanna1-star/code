// Zombie AI + body. Visuals come from entities/zombie/ZombieModel.js (createZombieVisual).
import * as THREE from 'three';
import { moveBody, boxFree } from '../core/physics.js';
import { findPath, groundAt } from './pathfind.js';
import { raycast } from '../world/raycast.js';
import { BLOCKS, B, IS_DOOR, SOLID } from '../world/blocks.js';
import { clamp, lerp } from '../core/rng.js';

export const VARIANTS = {
  walker: { hp: 100, walk: 0.85, chase: [1.6, 2.5], damage: 11, range: 1.35, cooldown: 1.25, windup: 0.42, sight: 1, hearing: 1, door: 9, knockResist: 1, h: 1.8, canJump: true },
  runner: { hp: 85, walk: 1.1, chase: [5.0, 5.8], damage: 9, range: 1.3, cooldown: 0.95, windup: 0.32, sight: 1.15, hearing: 1.25, door: 7, knockResist: 0.8, h: 1.8, canJump: true },
  crawler: { hp: 60, walk: 0.4, chase: [0.85, 1.15], damage: 10, range: 1.2, cooldown: 1.4, windup: 0.5, sight: 0.6, hearing: 1, door: 0, knockResist: 1.2, h: 0.65, canJump: false },
  brute: { hp: 380, walk: 0.8, chase: [2.3, 2.75], damage: 26, range: 1.75, cooldown: 1.8, windup: 0.65, sight: 0.9, hearing: 0.9, door: 45, knockResist: 4, h: 2.3, canJump: true },
  screamer: { hp: 70, walk: 0.9, chase: [2.1, 2.7], damage: 7, range: 1.3, cooldown: 1.2, windup: 0.4, sight: 1.3, hearing: 1.3, door: 5, knockResist: 0.8, h: 1.8, canJump: true, scream: true },
  bloater: { hp: 140, walk: 0.65, chase: [1.3, 1.7], damage: 12, range: 1.4, cooldown: 1.5, windup: 0.55, sight: 0.8, hearing: 1, door: 10, knockResist: 2, h: 1.9, canJump: true, explode: true },
};
const OUTFIT_ARMOR = {
  military: { head: 0.45, body: 0.65 }, police: { head: 1, body: 0.8 }, firefighter: { head: 0.7, body: 0.8 },
  worker: { head: 0.65, body: 1 },
};
export const OUTFIT_LOOT = {
  civilian: 'zombie_civilian', civilian_f: 'zombie_civilian', office: 'zombie_civilian', police: 'zombie_police',
  military: 'zombie_military', medic: 'zombie_medic', patient: 'zombie_patient', firefighter: 'zombie_firefighter',
  worker: 'zombie_worker', prisoner: 'zombie_prisoner', farmer: 'zombie_farmer', hunter: 'zombie_hunter', survivor: 'zombie_survivor',
};

const tmpV = new THREE.Vector3();
let NEXT_ID = 1;

// Zombie eyesight: like world sight, but closed wooden / metal doors, barricades and solid wooden fences block it
// (glass, bars and chain-link do not). Partial shapes are tested precisely, so an open door does not block.
function zSightFilter(id, d) {
  return d.opaque || (d.solid && d.pass === 'opaque' && d.render !== 'cross') || (d.door && d.mat !== 'glass' && id !== B.door_cell) ||
    id === B.barricade || id === B.fence_wood;
}
export function zombieSight(world, ax, ay, az, bx, by, bz) {
  const dx = bx - ax, dy = by - ay, dz = bz - az;
  const len = Math.hypot(dx, dy, dz);
  if (len < 0.001) return true;
  return !raycast(world, ax, ay, az, dx / len, dy / len, dz / len, len, zSightFilter);
}
// Physical reach for attacks: anything solid in between (glass, doors, fences, bars, walls) stops the hit.
function reachFilter(id, d) { return d.solid && d.render !== 'cross'; }
function canReach(world, zb, p) {
  const ay = zb.y + Math.min(1.3, zb.h * 0.75), by = p.y + (zb.h < 1 ? 0.5 : 1.1);
  const dx = p.x - zb.x, dy = by - ay, dz = p.z - zb.z;
  const len = Math.hypot(dx, dy, dz);
  if (len < 0.05) return true;
  return !raycast(world, zb.x, ay, zb.z, dx / len, dy / len, dz / len, len, reachFilter);
}
// timed states (the AI waits for the body animation; see zombie/animation.js keyframe timings)
const BUSY = new Set(['stagger', 'down', 'getup', 'scream', 'bash']);
const KNOCKDOWN_ANIM = 1.3; // fall + bounce + settle (animation.js poseKnockdown)
const GETUP_ANIM = 1.5; // sit up → kneel → stand (animation.js poseGetup)

export class Zombie {
  constructor(mgr, { x, y, z, variant = 'walker', outfit = 'civilian', seed = 0, state }) {
    this.id = NEXT_ID++;
    this.mgr = mgr;
    this.variant = variant;
    this.outfit = outfit;
    this.cfg = VARIANTS[variant] || VARIANTS.walker;
    this.armor = OUTFIT_ARMOR[outfit] || { head: 1, body: 1 };
    this.x = x; this.y = y; this.z = z;
    this.vx = 0; this.vy = 0; this.vz = 0;
    this.hw = variant === 'brute' ? 0.42 : 0.3;
    this.h = this.cfg.h;
    this.onGround = false; this.stepHeight = 0.55;
    this.yaw = Math.random() * Math.PI * 2;
    this.hp = this.cfg.hp * (0.85 + Math.random() * 0.3);
    this.maxHp = this.hp;
    this.legDamage = 0;
    this.crippled = variant === 'crawler';
    this.chaseSpeed = this.cfg.chase[0] + Math.random() * (this.cfg.chase[1] - this.cfg.chase[0]);
    this.state = state || 'idle';
    this.stateT = Math.random() * 4;
    this.stateDur = 0; // duration of timed states (stagger / down / search)
    this.target = null; // {x,y,z}
    this.targetPlayer = false; // the current investigate target came from the player (may break in to reach it)
    this.huntT = -1e9; // game clock of the last first-hand info about the player (sight / player noise)
    this.path = null; this.pathI = 0; this.pathT = 0;
    this.awareness = 0;
    this.lastSeen = null;
    this.seeT = Math.random() * 0.3; this.percAcc = 0;
    this.groanT = 2 + Math.random() * 10;
    this.attackT = 0; this.cooldownT = 0; this.didHit = false;
    this.bashTarget = null; this.bashT = 0;
    this.stuckT = 0; this.lastPos = { x, z }; this.unstickT = 0; this.sideStep = 0;
    this.cars = null; this.carsT = 0; this.visAcc = 0;
    this.burning = 0;
    this.dead = false; this.deadT = 0; this.ragdolling = false;
    this.lightT = 0;
    this.screamed = false;
    this.lod = 0; this.lodAcc = 0;
    this.knockT = 0;
    this.seed = seed || this.id * 7919;
    this.visual = mgr.createVisual({ variant, outfit, seed: this.seed });
    this.visual.root.position.set(x, y, z);
    mgr.scene.add(this.visual.root);
    this.anim = { state: 'idle', speed: 0, attackT: 0, aggro: 0 };
  }

  get game() { return this.mgr.game; }
  dist2To(x, z) { return (this.x - x) ** 2 + (this.z - z) ** 2; }

  /** Change state. `t` = initial elapsed time (used to desynchronise idle timers). */
  setState(s, t = 0) {
    this.state = s;
    this.stateT = t;
  }
  /** Enter a timed state lasting `dur` seconds. */
  setTimed(s, dur, t = 0) {
    this.state = s;
    this.stateT = t;
    this.stateDur = dur;
  }

  /** True while the zombie is after the player (only then does it break doors / windows to get in). */
  get hunting() {
    const s = this.state;
    if (s === 'chase' || s === 'attack' || s === 'bash') return true;
    return s === 'investigate' && this.targetPlayer && this.game.clock - this.huntT < 30;
  }

  /** Leave a timed state: back to the chase if the player was seen recently, else investigate / idle. */
  resume() {
    const g = this.game, ls = this.lastSeen;
    this.path = null; this.pathT = 0;
    if (ls && g.clock - ls.t < 9 && !g.player.dead) this.setState('chase');
    else if (ls && g.clock - ls.t < 60 && !g.player.dead && g.clock - this.huntT < 45) {
      // still on the player's trail: go where they were last seen
      this.target = { x: ls.x, y: ls.y, z: ls.z }; this.targetPlayer = true;
      this.setState('investigate');
    } else if (this.target) this.setState('investigate');
    else this.setState('idle');
  }

  /** React to a noise. */
  hear(n) {
    if (this.dead) return;
    const g = this.game, st = this.state;
    const dy = (this.y - n.y) * 2;
    const d = Math.sqrt((this.x - n.x) ** 2 + (this.z - n.z) ** 2 + dy * dy);
    let r = n.radius * this.cfg.hearing * (g.isNight ? 1.15 : 1);
    if (d > r) return;
    // quiet sounds are muffled by walls / floors
    if (n.radius <= 15 && d > r * 0.45 && !zombieSight(g.world, n.x, n.y + 0.6, n.z, this.x, this.y + 1.5, this.z)) {
      r *= 0.6;
      if (d > r) return;
    }
    if (st === 'chase' || st === 'attack' || st === 'bash') {
      // keep tracking the player by ear (footsteps, shots) while chasing / bashing
      if (n.player) {
        this.huntT = g.clock;
        const ls = this.lastSeen;
        if (st !== 'bash' && (!ls || g.clock - ls.t > 0.6)) this.lastSeen = { x: n.x, y: n.y, z: n.z, vx: 0, vz: 0, t: g.clock - 0.6 };
      }
      return;
    }
    if (st === 'down' || st === 'stagger' || st === 'getup' || st === 'scream') {
      if (n.player) { this.huntT = g.clock; this.target = { x: n.x, y: n.y, z: n.z }; this.targetPlayer = true; }
      return;
    }
    // loud nearby player noise -> immediate chase
    if (n.player && d < r * 0.4 && n.radius > 20) {
      this.startChase(true);
      return;
    }
    // a lone distant noise from something else does not override a player lead
    if (st === 'investigate' && this.targetPlayer && !n.player && !n.hunt && g.clock - this.huntT < 15) return;
    const spread = Math.min(6, d * 0.15);
    this.target = { x: n.x + (Math.random() - 0.5) * spread, y: n.y, z: n.z + (Math.random() - 0.5) * spread };
    this.targetPlayer = !!(n.player || n.hunt);
    if (n.player) this.huntT = g.clock;
    else if (n.hunt) this.huntT = Math.max(this.huntT, n.huntT ?? g.clock - 10);
    this.path = null;
    if (st !== 'investigate') this.mgr.playVoice(this, 'zombie_alert', 0.6);
    this.setState('investigate', 0);
  }

  /** Send the zombie to look at a position. fromPlayer: it is the player's position (it may break in to get there). */
  investigate(pos, fromPlayer = false) {
    if (this.dead) return;
    this.target = { x: pos.x, y: pos.y, z: pos.z };
    this.targetPlayer = !!fromPlayer;
    if (fromPlayer) this.huntT = this.game.clock;
    this.path = null; this.pathT = 0;
    if (!BUSY.has(this.state) && this.state !== 'chase' && this.state !== 'attack') this.setState('investigate');
  }

  startChase(alertOthers) {
    const g = this.game, p = g.player;
    this.lastSeen = { x: p.x, y: p.y, z: p.z, vx: p.vx || 0, vz: p.vz || 0, t: g.clock };
    this.awareness = 1;
    this.huntT = g.clock;
    const st = this.state;
    if (st === 'chase' || st === 'attack') return;
    // busy (staggering, on the ground, getting up, screaming, bashing): resume the chase when that ends
    if (BUSY.has(st)) return;
    this.mgr.playVoice(this, this.variant === 'runner' ? 'zombie_runner_shriek' : this.variant === 'brute' ? 'zombie_brute_roar' : 'zombie_alert', 1);
    if (this.cfg.scream && !this.screamed) {
      this.screamed = true;
      this.setState('scream', 0);
      return;
    }
    this.path = null; this.pathT = 0;
    this.setState('chase', 0);
    if (alertOthers) this.mgr.alertNear(this, 10);
  }

  takeDamage(amount, o = {}) {
    if (this.dead) return { killed: false };
    const part = o.part || 'torso';
    let mult = 1;
    if (part === 'head') mult = (o.headMult ?? 3) * (o.pierceArmor ? 1 : this.armor.head);
    else if (part === 'torso') mult = this.armor.body;
    else if (part === 'legL' || part === 'legR') mult = 0.7;
    else mult = 0.75;
    const dmg = amount * mult;
    this.hp -= dmg;
    const dir = o.dir || tmpV.set(0, 0, 0);
    this.visual.flash(0xff3322, 0.5);
    this.visual.hitReact?.(part, dir, clamp(amount / 40, 0.2, 1));
    if (o.wound !== false) this.visual.addWound?.(part, o.point);
    if (part === 'legL' || part === 'legR') this.legDamage += dmg;
    // knockback
    const kb = (o.knockback || 0) / this.cfg.knockResist;
    if (kb > 0) {
      this.vx += dir.x * kb * 4.5;
      this.vz += dir.z * kb * 4.5;
      if (this.onGround) this.vy = Math.max(this.vy, kb * 1.2);
    }
    // always notice the attacker (only the player hurts zombies on purpose)
    if (o.byPlayer !== false && o.notice !== false) this.startChase(false);
    if (this.hp <= 0) {
      this.die(o);
      return { killed: true, part };
    }
    // a heavy hit can take an arm off (blades, shotguns, big calibres) — fewer arms, weaker swipes
    if ((part === 'armL' || part === 'armR') && dmg >= 40 && this.visual.hasPart?.(part) && Math.random() < (dmg >= 70 ? 0.55 : 0.25)) {
      const stump = this.visual.dismember?.(part, dmg >= 70 ? 'upper' : 'lower');
      if (stump) {
        this.game.fx?.gore?.(stump, dir, 0.8);
        this.cfg = { ...this.cfg, damage: this.cfg.damage * 0.7 };
      }
    }
    // cripple: legs blown off -> crawler
    if (!this.crippled && this.legDamage > this.maxHp * 0.55 && Math.random() < 0.6) {
      this.crippled = true;
      this.visual.dismember?.(part === 'legL' ? 'legL' : 'legR');
      if (Math.random() < 0.5) this.visual.dismember?.(part === 'legL' ? 'legR' : 'legL');
      this.h = 0.65;
      this.mgr.game.fx?.blood(this.visual.getPartPosition?.(part, new THREE.Vector3()) || new THREE.Vector3(this.x, this.y + 0.5, this.z), dir, 1.5);
      this.bashTarget = null;
      this.setTimed('down', 1.4); // collapses, then crawls on
      return { killed: false, part, crippled: true };
    }
    // stagger / knockdown
    const kd = (o.knockdown || 0) / this.cfg.knockResist;
    const low = this.state === 'down' || (this.state === 'getup' && this.stateT < GETUP_ANIM * 0.66);
    if (Math.random() < kd && !this.crippled) {
      this.bashTarget = null;
      if (low) this.setTimed('down', KNOCKDOWN_ANIM + 1 + Math.random() * 1.2, KNOCKDOWN_ANIM); // already on the floor: stay down
      else this.setTimed('down', KNOCKDOWN_ANIM + 1.2 + Math.random() * 1.6);
      this.mgr.playVoice(this, 'zombie_hurt', 0.8);
    } else if (!low && this.state !== 'stagger' && Math.random() < (o.stagger ?? clamp(amount / 35, 0.15, 0.85)) / Math.sqrt(this.cfg.knockResist)) {
      if (this.state === 'attack') this.attackT = 0;
      if (this.state === 'bash') this.bashT = Math.max(this.bashT, 0.6);
      else this.bashTarget = null;
      this.setTimed('stagger', 0.45 + Math.random() * 0.35);
      if (Math.random() < 0.5) this.mgr.playVoice(this, 'zombie_hurt', 0.7);
    }
    return { killed: false, part };
  }

  die(o = {}) {
    if (this.dead) return;
    this.dead = true;
    this.hp = 0;
    this.state = 'dead';
    this.deadT = 0;
    this.ragdolling = true;
    const dir = (o.dir || tmpV.set(0, 0, 0)).clone();
    const imp = dir.multiplyScalar(2 + (o.knockback || 0.5) * 4 + (o.force || 0));
    imp.y += 1 + (o.force || 0) * 0.3;
    if (o.part === 'head' && o.gib) {
      const hp = this.visual.dismember?.('head');
      if (hp) this.game.fx?.gore(hp, dir, 1.2);
    }
    const w = this.game.world;
    this.visual.startRagdoll(imp, o.part || 'torso', (x, y, z) => SOLID[w.get(x, y, z)] === 1);
    this.mgr.playVoice(this, 'zombie_death', 1);
    this.mgr.onZombieKilled(this, o);
    if (this.cfg.explode) this.mgr.bloaterPop(this);
  }

  // ------------------------------------------------------------------ per frame
  update(dt) {
    const g = this.game;
    if (this.dead) {
      this.deadT += dt;
      if (this.ragdolling) {
        this.ragdolling = this.visual.updateRagdoll(dt) && this.deadT < 6;
      }
      this.updateLight(dt);
      return;
    }
    const p = g.player;
    const dxp = p.x - this.x, dzp = p.z - this.z;
    const distP = Math.sqrt(dxp * dxp + dzp * dzp);
    this.distP = distP;

    // LOD: far zombies think & move less often
    this.lod = distP > 70 ? 3 : distP > 40 ? 1 : 0;
    if (this.lod) {
      this.lodAcc += dt;
      if (this.lodAcc < (this.lod === 3 ? 0.3 : 0.07)) { this.visual.root.visible = distP < 110; return; }
      dt = Math.min(this.lodAcc, 0.5);
      this.lodAcc = 0;
    }
    this.visual.root.visible = distP < 120;

    this.stateT += dt;
    this.cooldownT -= dt;
    this.groanT -= dt;
    if (this.burning > 0) {
      this.burning -= dt;
      if (!this.fireFx && g.fx?.fire) this.fireFx = g.fx.fire(new THREE.Vector3(this.x, this.y + 1, this.z), { radius: 0.35, duration: 30, follow: true });
      this.fireFx?.setPos?.(new THREE.Vector3(this.x, this.y + 0.9, this.z));
      if (Math.random() < dt * 2) g.addFlashLight(new THREE.Vector3(this.x, this.y + 1.2, this.z), 0xff8030, 1.6, 7, 0.2);
      this.burnAcc = (this.burnAcc || 0) + (this.burnDps || 9) * dt;
      if (this.burnAcc >= 3) { this.takeDamage(this.burnAcc, { part: 'torso', wound: false, stagger: 0, notice: false }); this.burnAcc = 0; }
      if (this.dead || this.burning <= 0) { this.fireFx?.stop?.(); this.fireFx = null; }
      if (this.dead) return;
    }

    // ---- senses
    this.seeT -= dt;
    this.percAcc += dt;
    if (this.seeT <= 0 && !p.dead) {
      this.seeT = this.lod ? 0.5 : 0.22 + Math.random() * 0.1;
      this.perceive(distP, Math.min(this.percAcc, 1));
      this.percAcc = 0;
    }
    // groans
    if (this.groanT <= 0) {
      const chasing = this.state === 'chase' || this.state === 'attack';
      this.groanT = chasing ? 2 + Math.random() * 3 : 5 + Math.random() * 12;
      if (distP < 45) this.mgr.playVoice(this, chasing ? 'zombie_groan' : 'zombie_idle', chasing ? 0.9 : 0.6);
    }

    // ---- behaviour
    let moveTo = null, speed = 0;
    const cfg = this.cfg;
    const night = g.isNight ? (this.variant === 'runner' ? 1.06 : 1.18) : 1; // (runners stay just about outrunnable by a sprinting player)
    const dyP = Math.abs(p.y - this.y);
    switch (this.state) {
      case 'idle':
        if (this.stateT > 3 + (this.id % 7)) this.pickWander();
        break;
      case 'feed':
        if (this.stateT > 40) this.setState('idle');
        break;
      case 'wander':
        if (!this.target || this.dist2To(this.target.x, this.target.z) < 1 || this.stateT > 25) { this.setState('idle'); break; }
        moveTo = this.target; speed = this.crippled && this.variant !== 'crawler' ? 0.45 : cfg.walk;
        break;
      case 'investigate':
        if (!this.target || (this.dist2To(this.target.x, this.target.z) < 2.2 && Math.abs((this.target.y ?? this.y) - this.y) < 2) || this.stateT > 30) {
          this.setTimed('search', 5 + Math.random() * 5);
          break;
        }
        moveTo = this.target; speed = (this.crippled && this.variant !== 'crawler' ? 0.6 : cfg.walk * 1.6) * night;
        break;
      case 'search':
        // look around near the last target, then drift off
        this.yaw += Math.sin(this.stateT * 0.9 + this.id) * dt * 0.8;
        if (this.stateT > this.stateDur) { this.targetPlayer = false; this.pickWander(6); }
        break;
      case 'scream':
        if (!this.screamDone) {
          this.screamDone = true;
          this.mgr.playVoice(this, 'zombie_scream', 1.6, 120);
          g.noise(this.x, this.y, this.z, 60, 'scream', false, { target: { x: p.x, y: p.y, z: p.z }, hunt: true, huntT: g.clock });
        }
        this.yaw = turnToward(this.yaw, Math.atan2(dxp, dzp), dt * 4);
        if (this.stateT > 1.6) this.resume();
        break;
      case 'chase': {
        if (p.dead) { this.lastSeen = null; this.targetPlayer = false; this.pickWander(); break; }
        const seen = this.lastSeen;
        const sinceSeen = g.clock - (seen?.t ?? -1e9);
        if (sinceSeen > 9) {
          // lost the player: go where they were last seen, then search
          this.target = seen ? { x: seen.x, y: seen.y, z: seen.z } : null;
          this.targetPlayer = true;
          this.path = null;
          this.setState(this.target ? 'investigate' : 'idle');
          break;
        }
        const visible = sinceSeen < 0.6;
        let tgt;
        if (visible) tgt = p;
        else {
          // follow where the player was heading (round corners, through doorways)
          const k = Math.min(sinceSeen, 1.6);
          tgt = this._chaseTgt || (this._chaseTgt = { x: 0, y: 0, z: 0 });
          tgt.x = seen.x + (seen.vx || 0) * k; tgt.y = seen.y; tgt.z = seen.z + (seen.vz || 0) * k;
        }
        moveTo = tgt;
        // legless walkers drag themselves along; real crawlers use their own (slow) chase speed
        speed = (this.crippled && this.variant !== 'crawler' ? Math.min(1.2, 0.55 + cfg.chase[0] * 0.15) : this.chaseSpeed) * night;
        if (this.variant === 'walker' && g.isNight) speed *= 1.1;
        // in contact: stop pressing into the player (no bulldozing), keep facing them
        if (visible && distP < this.hw + p.hw + 0.35 && dyP < 1.5) {
          moveTo = null;
          this.yaw = turnToward(this.yaw, Math.atan2(dxp, dzp), dt * 8);
        }
        // attack range
        if (distP < cfg.range + 0.3 && dyP < 1.6 && this.cooldownT <= 0 && visible && canReach(g.world, this, p)) {
          this.setState('attack'); this.attackT = 0; this.didHit = false;
          this.mgr.playVoice(this, 'zombie_attack', 0.9);
          moveTo = null;
        }
        break;
      }
      case 'attack': {
        this.attackT += dt;
        // face the player
        this.yaw = turnToward(this.yaw, Math.atan2(dxp, dzp), dt * 8);
        const wind = cfg.windup;
        if (!this.didHit && this.attackT >= wind) {
          this.didHit = true;
          if (distP < cfg.range + 0.55 && dyP < 1.7 && canReach(g.world, this, p) && g.canHit(this)) g.zombieHitsPlayer(this);
        }
        if (this.attackT > wind + 0.45) { this.cooldownT = cfg.cooldown * (0.85 + Math.random() * 0.3); this.setState('chase'); }
        break;
      }
      case 'bash': {
        const bt = this.bashTarget;
        if (!bt || !this.mgr.isBashable(bt.x, bt.y, bt.z)) { this.bashTarget = null; this.path = null; this.pathT = 0; this.resume(); break; }
        this.yaw = turnToward(this.yaw, Math.atan2(bt.x + 0.5 - this.x, bt.z + 0.5 - this.z), dt * 6);
        this.bashT -= dt;
        if (this.bashT <= 0) {
          this.bashT = 1.15 + Math.random() * 0.45;
          this.mgr.bash(this, bt);
        }
        const sinceSeen = g.clock - (this.lastSeen?.t ?? -1e9);
        if (g.clock - this.huntT > 45 || p.dead) {
          // the trail went cold: give up on the door
          this.bashTarget = null; this.targetPlayer = false;
          this.setTimed('search', 4 + Math.random() * 4);
        } else if (this.stateT > 1 && sinceSeen < 0.6) {
          // the player is in plain reach on this side (or came out): go for them instead
          const bx = bt.x + 0.5 - this.x, bz = bt.z + 0.5 - this.z;
          if (bx * dxp + bz * dzp < 0 || (distP < 1.6 && canReach(g.world, this, p))) { this.bashTarget = null; this.setState('chase'); }
        }
        break;
      }
      case 'stagger':
        if (this.stateT > this.stateDur) this.resume();
        break;
      case 'down':
        if (this.stateT > this.stateDur) {
          if (this.crippled) this.resume();
          else this.setState('getup');
        }
        break;
      case 'getup':
        if (this.stateT > GETUP_ANIM) this.resume();
        break;
    }

    // ---- movement
    let wantVx = 0, wantVz = 0;
    if (moveTo && speed > 0) {
      const wp = this.navigate(moveTo, dt);
      if (wp) {
        let dx = wp.x - this.x, dz = wp.z - this.z;
        const d = Math.hypot(dx, dz);
        if (d > 0.05) {
          dx /= d; dz /= d;
          // brief sidestep when stuck against something
          if (this.unstickT > 0) {
            this.unstickT -= dt;
            const sx = -dz * this.sideStep, sz = dx * this.sideStep;
            dx = dx * 0.35 + sx; dz = dz * 0.35 + sz;
          }
          const slowDown = d < 0.6 && wp === moveTo ? Math.max(0.3, d / 0.6) : 1;
          wantVx = dx * speed * slowDown; wantVz = dz * speed * slowDown;
          this.yaw = turnToward(this.yaw, Math.atan2(dx, dz), dt * (this.state === 'chase' ? 7 : 3));
        }
      }
    }
    // separation from other zombies
    const sep = this.mgr.separation(this);
    wantVx += sep.x; wantVz += sep.z;
    const stop = this.state === 'attack' || this.state === 'stagger' || this.state === 'down' || this.state === 'getup' || this.state === 'scream' || this.state === 'bash' || this.state === 'feed';
    const accel = stop ? 6 : this.onGround ? 8 : 1.5;
    const k = 1 - Math.exp(-accel * dt);
    this.vx = lerp(this.vx, stop ? sep.x * 0.5 : wantVx, k);
    this.vz = lerp(this.vz, stop ? sep.z * 0.5 : wantVz, k);
    this.vy -= 26 * dt;
    if (this.vy < -50) this.vy = -50;
    const id = g.world.get(Math.floor(this.x), Math.floor(this.y + 0.3), Math.floor(this.z));
    const slow = BLOCKS[id].slow;
    if (slow < 1) { this.vx *= Math.pow(slow, dt * 10); this.vz *= Math.pow(slow, dt * 10); }
    if (BLOCKS[id].render === 'liquid') this.vy = Math.max(this.vy, -1.5);
    if (BLOCKS[id].damage > 0 && id === B.fire) this.burning = Math.max(this.burning, 6);
    // nearby vehicles (refreshed twice a second instead of testing every car in the county each frame)
    this.carsT -= dt;
    if (this.carsT <= 0) {
      this.carsT = 0.45 + Math.random() * 0.2;
      this.cars = g.vehicles?.nearColliders ? g.vehicles.nearColliders(this.x, this.z, 8) : g.vehicleColliders || null;
    }
    const res = moveBody(g.world, this, dt, this.cars);
    if ((res.hitX || res.hitZ) && !stop && moveTo) this.onBlocked(wantVx, wantVz);
    // keep bodies from overlapping the player: the zombie gives way, the player only gets nudged
    // (personal space a bit larger than the bodies so faces / arms don't clip into the camera)
    const minD = this.hw + p.hw + 0.2;
    if (distP < minD && dyP < 1.5 && distP > 0.01 && !p.dead) {
      const over = minD - distP, ux = dxp / distP, uz = dzp / distP;
      const zx = this.x - ux * over * 0.85, zz = this.z - uz * over * 0.85;
      if (boxFree(g.world, zx, this.y + 0.05, zz, this.hw, this.h - 0.1)) { this.x = zx; this.z = zz; }
      const real = this.hw + p.hw - distP; // true body overlap: nudge the player (brutes shove harder)
      if (real > 0) {
        const k = this.variant === 'brute' ? 0.6 : 0.3;
        const nx = p.x + ux * real * k, nz = p.z + uz * real * k;
        if (boxFree(g.world, nx, p.y + 0.05, nz, p.hw, (p.h || 1.8) - 0.1)) { p.x = nx; p.z = nz; }
      }
    }
    // stuck detection
    if (moveTo && !stop && speed > 0) {
      const moved = Math.hypot(this.x - this.lastPos.x, this.z - this.lastPos.z);
      if (moved < 0.3 * dt * speed) this.stuckT += dt; else this.stuckT = Math.max(0, this.stuckT - dt * 0.5);
      if (this.stuckT > 1.2 && this.unstickT <= 0) {
        // repath now and wiggle sideways; jump if there is a ledge
        this.path = null; this.pathT = 0;
        this.unstickT = 0.6; this.sideStep = Math.random() < 0.5 ? -1 : 1;
        if (this.onGround && this.cfg.canJump && !this.crippled) this.vy = Math.max(this.vy, 5.5);
      }
      if (this.stuckT > 5) {
        this.stuckT = 0;
        if (this.state === 'wander') this.setState('idle');
        else if (this.state === 'investigate') this.setTimed('search', 3 + Math.random() * 3);
      }
    } else this.stuckT = 0;
    this.lastPos.x = this.x; this.lastPos.z = this.z;
    if (this.y < -10) { this.hp = 0; this.dead = true; this.mgr.remove(this); return; }

    // ---- visual
    const hs = Math.hypot(this.vx, this.vz);
    const a = this.anim;
    a.speed = hs;
    a.aggro = lerp(a.aggro, this.state === 'chase' || this.state === 'attack' ? 1 : 0.25, 1 - Math.exp(-dt * 3));
    a.attackT = this.state === 'attack' ? clamp(this.attackT / (this.cfg.windup + 0.45), 0, 1) : 0;
    a.state = this.animState(hs);
    this.visual.root.position.set(this.x, this.y, this.z);
    this.visual.root.rotation.y = this.yaw;
    // animate only what the player can see (behind the camera: a few times a second, so poses stay fresh)
    this.visAcc += dt;
    if (this.visual.root.visible) {
      const yawP = p.yaw || 0;
      const inView = distP < 4 || (-Math.sin(yawP) * dxp - Math.cos(yawP) * dzp) / Math.max(distP, 0.01) < 0.25; // dxp points zombie → player
      if (inView || this.visAcc > 0.2 || this.state === 'attack') { this.visual.update(Math.min(this.visAcc, 0.25), a); this.visAcc = 0; }
    }
    this.updateLight(dt);
  }

  animState(hs) {
    switch (this.state) {
      case 'attack': return 'attack';
      case 'bash': return 'bash';
      case 'stagger': return 'stagger';
      case 'down': return this.crippled ? 'crawl' : this.stateT < KNOCKDOWN_ANIM ? 'knockdown' : 'down';
      case 'getup': return 'getup';
      case 'feed': return 'feed';
      case 'scream': return 'scream';
    }
    if (this.crippled) return 'crawl';
    if (hs < 0.15) return 'idle';
    return hs > 3.2 ? 'run' : 'walk';
  }

  updateLight(dt) {
    this.lightT -= dt;
    if (this.lightT > 0) return;
    this.lightT = 0.25;
    const w = this.game.world;
    const x = Math.floor(this.x), y = Math.floor(this.y + 1.2), z = Math.floor(this.z);
    this.visual.setLight(w.skyAt(x, y, z) / 15, Math.max(w.blockLightAt(x, y, z), this.burning > 0 ? 14 : 0) / 15);
  }

  /** Sight check (every ~0.25 s). `elapsed` = seconds since the last check. */
  perceive(distP, elapsed) {
    const g = this.game, p = g.player;
    if (distP > 75) { this.awareness = Math.max(0, this.awareness - 0.15 * elapsed); return; }
    const cfg = this.cfg;
    // base sight range depends on light at the player
    const light = g.playerLight; // 0..1 effective brightness at the player
    let range = lerp(9, 38, light) * cfg.sight;
    if (p.flashlightOn && g.isNight) range = Math.max(range, 30 * cfg.sight);
    if (p.crouching) range *= Math.max(0.3, 0.55 - p.skillLevel('sneaking') * 0.025);
    if (g.playerHidden) range *= 0.35;
    const wp = g.weather?.params || g.weatherSys?.params;
    if (wp) range *= 1 - (wp.fog || 0) * 0.5 - (wp.rain || 0) * 0.15;
    const dyP = p.y - this.y;
    // facing
    const dx = p.x - this.x, dz = p.z - this.z;
    const fx = Math.sin(this.yaw), fz = Math.cos(this.yaw);
    const dot = distP > 0.01 ? (dx * fx + dz * fz) / distP : 1;
    const inFov = dot > 0.2 || distP < (p.crouching ? 1.6 : 3);
    const chasing = this.state === 'chase' || this.state === 'attack' || this.state === 'bash';
    if (distP < range && (inFov || chasing) && Math.abs(dyP) < 12) {
      const vis = zombieSight(g.world, this.x, this.y + this.h * 0.9, this.z, p.x, p.y + p.eye, p.z);
      if (vis) {
        if (chasing) { this.startChase(false); return; }
        // time to recognise the player: near-instant up close, several seconds at the edge of sight
        const close = 1 - distP / range;
        let rate = 0.22 + 3.2 * close * close;
        const mv = clamp(p.moving01 ?? 1, 0, 1.5);
        rate *= 0.5 + 0.5 * mv; // standing still is hard to spot
        if (p.sprinting) rate *= 1.3;
        if (this.state === 'investigate' || this.state === 'search') rate *= 1.8;
        if (distP < 3.5) rate *= 3;
        this.awareness += rate * elapsed;
        if (this.awareness >= 1) {
          this.startChase(true);
        } else if (this.awareness > 0.5 && this.state !== 'investigate' && !BUSY.has(this.state)) {
          // "what was that?" — turn and shamble toward the movement
          this.target = { x: p.x, y: p.y, z: p.z };
          this.targetPlayer = false;
          this.path = null;
          this.mgr.playVoice(this, 'zombie_idle', 0.7);
          this.setState('investigate');
        }
        return;
      }
    }
    // bumping into the player in the dark / behind a corner still gives them away
    if (distP < 1.4 && Math.abs(dyP) < 1.6 && canReach(g.world, this, p)) { this.startChase(true); return; }
    this.awareness = Math.max(0, this.awareness - 0.15 * elapsed);
  }

  pickWander(radius = 10) {
    const w = this.game.world;
    for (let i = 0; i < 6; i++) {
      const tx = Math.floor(this.x + (Math.random() - 0.5) * radius * 2);
      const tz = Math.floor(this.z + (Math.random() - 0.5) * radius * 2);
      const ty = groundAt(w, tx, Math.floor(this.y + 0.2), tz);
      if (ty >= 0) {
        this.target = { x: tx + 0.5, y: ty, z: tz + 0.5 };
        this.targetPlayer = false;
        this.path = null;
        this.setState('wander');
        return;
      }
    }
    this.setState('idle');
  }

  /** Returns next waypoint toward goal (direct or via A*). */
  navigate(goal, dt) {
    const g = this.game;
    this.pathT -= dt;
    const dGoal = Math.hypot(goal.x - this.x, goal.z - this.z);
    const sameLevel = Math.abs((goal.y ?? this.y) - this.y) < 1.2;
    const chasing = this.state === 'chase';
    // direct steering if close and clear
    if (dGoal < 2.5 && sameLevel && (dGoal < 1.1 || this.mgr.directClear(this, goal))) { this.path = null; return goal; }
    const following = this.path && this.pathI < this.path.length;
    if (following) {
      const wp = this.path[this.pathI];
      if (Math.hypot(wp.x - this.x, wp.z - this.z) < 0.55 && Math.abs(wp.y - this.y) < 1.2) this.pathI++;
    }
    // re-plan when the path expired (or the goal moved well away from where it was when planned)
    let replan = this.pathT <= 0;
    const pg = this.pathGoal;
    if (!replan && following && pg && (pg.x - goal.x) ** 2 + (pg.z - goal.z) ** 2 > 16 && this.pathT < (chasing ? 0.9 : 3)) replan = true;
    if (!replan && this.path && this.pathI < this.path.length) return this.path[this.pathI];
    // direct line?
    if (sameLevel && (dGoal < 14 || !chasing) && this.mgr.directClear(this, goal)) {
      this.path = null;
      this.pathT = chasing ? 0.5 : 1.5; // re-check the direct line before planning again
      return goal;
    }
    if ((replan || this.pathT <= 0) && this.mgr.requestPath()) { // (a failed search is not retried until pathT runs out)
      this.pathT = chasing ? 1.2 + Math.random() * 0.6 : 4 + Math.random() * 2;
      const sx = Math.floor(this.x), sy = Math.floor(this.y + 0.2), sz = Math.floor(this.z);
      const tx = Math.floor(goal.x), tz = Math.floor(goal.z);
      const ty = Math.floor((goal.y ?? this.y) + 0.2);
      const t0 = performance.now();
      this.path = findPath(g.world, sx, sy, sz, tx, ty, tz, {
        canJump: this.cfg.canJump && !this.crippled, maxNodes: chasing ? 650 : 350, noBash: !this.hunting || this.cfg.door <= 0,
        cars: g.vehicles?.nearColliders ? g.vehicles.nearColliders(this.x, this.z, Math.min(40, dGoal + 6)) : null,
      });
      this.mgr.pathMs += performance.now() - t0;
      this.pathGoal = { x: goal.x, z: goal.z };
      this.pathI = 0;
      if (this.path && this.path.length) return this.path[0];
    }
    // no budget this frame: keep following the old path if there is one
    if (this.path && this.pathI < this.path.length) return this.path[this.pathI];
    return goal;
  }

  onBlocked(vx, vz) {
    const g = this.game, w = g.world;
    const len = Math.hypot(vx, vz) || 1;
    const dx = vx / len, dz = vz / len;
    const ax = Math.floor(this.x + dx * (this.hw + 0.45)), az = Math.floor(this.z + dz * (this.hw + 0.45));
    const fy = Math.floor(this.y + 0.2);
    // bashable obstacle ahead? (only when after the player — wanderers don't wreck the town)
    if (this.hunting && this.cfg.door > 0 && this.state !== 'bash') {
      for (const y of [fy, fy + 1]) {
        if (!this.mgr.isBashable(ax, y, az)) continue;
        // only worth it if the gap would be big enough to get through
        const other = y === fy ? fy + 1 : fy;
        const oid = w.get(ax, other, az);
        if (SOLID[oid] && !this.mgr.isBashable(ax, other, az) && !(IS_DOOR[oid] && (w.getMeta(ax, other, az) & 4))) continue;
        this.bashTarget = { x: ax, y, z: az };
        this.setState('bash', 0);
        this.bashT = 0.35 + Math.random() * 0.25;
        return;
      }
    }
    // jump up 1 block
    if (this.onGround && this.cfg.canJump && !this.crippled) {
      const a = w.get(ax, fy, az), b = w.get(ax, fy + 1, az), c = w.get(ax, fy + 2, az);
      if (SOLID[a] && !SOLID[b] && !SOLID[c] && !IS_DOOR[a] && !SOLID[w.get(Math.floor(this.x), fy + 2, Math.floor(this.z))]) this.vy = 7.6;
    }
  }

  dispose() {
    this.fireFx?.stop?.();
    this.mgr.scene.remove(this.visual.root);
    this.visual.dispose();
  }
}

function turnToward(cur, target, maxStep) {
  let d = target - cur;
  while (d > Math.PI) d -= Math.PI * 2;
  while (d < -Math.PI) d += Math.PI * 2;
  return cur + clamp(d, -maxStep, maxStep);
}
