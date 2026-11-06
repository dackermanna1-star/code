// Zombie AI + body. Visuals come from entities/zombie/ZombieModel.js (createZombieVisual).
import * as THREE from 'three';
import { moveBody } from '../core/physics.js';
import { findPath, groundAt } from './pathfind.js';
import { lineOfSight } from '../world/raycast.js';
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
    this.target = null; // {x,y,z}
    this.path = null; this.pathI = 0; this.pathT = 0;
    this.awareness = 0;
    this.lastSeen = null;
    this.seeT = Math.random() * 0.3;
    this.groanT = 2 + Math.random() * 10;
    this.attackT = 0; this.cooldownT = 0; this.didHit = false;
    this.bashTarget = null; this.bashT = 0;
    this.stuckT = 0; this.lastPos = { x, z };
    this.burning = 0;
    this.dead = false; this.deadT = 0; this.ragdolling = false;
    this.lightT = 0;
    this.screamed = false;
    this.lod = 0; this.lodAcc = 0;
    this.knockT = 0;
    this.visual = mgr.createVisual({ variant, outfit, seed: seed || this.id * 7919 });
    this.visual.root.position.set(x, y, z);
    mgr.scene.add(this.visual.root);
    this.anim = { state: 'idle', speed: 0, attackT: 0, aggro: 0 };
  }

  get game() { return this.mgr.game; }
  dist2To(x, z) { return (this.x - x) ** 2 + (this.z - z) ** 2; }

  setState(s, t = 0) {
    this.state = s;
    this.stateT = t;
  }

  /** React to a noise. */
  hear(n) {
    if (this.dead || this.crippledStun) return;
    if (this.state === 'chase' || this.state === 'attack' || this.state === 'down' || this.state === 'stagger') return;
    const d = Math.sqrt((this.x - n.x) ** 2 + (this.z - n.z) ** 2 + ((this.y - n.y) * 2) ** 2);
    const r = n.radius * this.cfg.hearing * (this.game.isNight ? 1.15 : 1);
    if (d > r) return;
    // loud nearby player noise -> immediate chase
    if (n.player && d < r * 0.4 && n.radius > 20) {
      this.startChase(true);
      return;
    }
    const spread = Math.min(6, d * 0.15);
    this.target = { x: n.x + (Math.random() - 0.5) * spread, y: n.y, z: n.z + (Math.random() - 0.5) * spread };
    this.path = null;
    if (this.state !== 'investigate') this.mgr.playVoice(this, 'zombie_alert', 0.6);
    this.setState('investigate', 0);
  }

  startChase(alertOthers) {
    const p = this.game.player;
    if (this.state !== 'chase' && this.state !== 'attack') {
      this.mgr.playVoice(this, this.variant === 'runner' ? 'zombie_runner_shriek' : this.variant === 'brute' ? 'zombie_brute_roar' : 'zombie_alert', 1);
      if (this.cfg.scream && !this.screamed) {
        this.screamed = true;
        this.setState('scream', 0);
        this.lastSeen = { x: p.x, y: p.y, z: p.z, t: this.game.clock };
        return;
      }
    }
    this.lastSeen = { x: p.x, y: p.y, z: p.z, t: this.game.clock };
    if (this.state !== 'attack') this.setState('chase', 0);
    this.awareness = 1;
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
    // always notice the attacker
    if (this.state !== 'down' && this.state !== 'dead') {
      if (this.state !== 'chase' && this.state !== 'attack') this.startChase(false);
    }
    if (this.hp <= 0) {
      this.die(o);
      return { killed: true, part };
    }
    // cripple: legs blown off -> crawler
    if (!this.crippled && this.legDamage > this.maxHp * 0.55 && Math.random() < 0.6) {
      this.crippled = true;
      this.visual.dismember?.(part === 'legL' ? 'legL' : 'legR');
      if (Math.random() < 0.5) this.visual.dismember?.(part === 'legL' ? 'legR' : 'legL');
      this.h = 0.65;
      this.mgr.game.fx?.blood(this.visual.getPartPosition?.(part, new THREE.Vector3()) || new THREE.Vector3(this.x, this.y + 0.5, this.z), dir, 1.5);
      this.setState('down', 1.2);
      return { killed: false, part, crippled: true };
    }
    // stagger / knockdown
    const kd = (o.knockdown || 0) / this.cfg.knockResist;
    if (Math.random() < kd && !this.crippled) {
      this.setState('down', 2.2 + Math.random() * 1.8);
      this.mgr.playVoice(this, 'zombie_hurt', 0.8);
    } else if (Math.random() < (o.stagger ?? clamp(amount / 35, 0.15, 0.85)) / Math.sqrt(this.cfg.knockResist)) {
      if (this.state === 'attack') this.attackT = 0;
      this.setState('stagger', 0.35 + Math.random() * 0.3);
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
      if (this.lodAcc < (this.lod === 3 ? 0.4 : 0.07)) { this.visual.root.visible = distP < 110; return; }
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
      this.takeDamage(9 * dt, { part: 'torso', wound: false, stagger: 0 });
      if (this.dead || this.burning <= 0) { this.fireFx?.stop?.(); this.fireFx = null; }
      if (this.dead) return;
    }

    // ---- senses
    this.seeT -= dt;
    if (this.seeT <= 0 && !p.dead) {
      this.seeT = this.lod ? 0.5 : 0.22 + Math.random() * 0.1;
      this.perceive(distP, dt);
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
    const night = g.isNight ? 1.18 : 1;
    switch (this.state) {
      case 'idle':
        if (this.stateT > 3 + (this.id % 7)) this.pickWander();
        break;
      case 'feed':
        if (this.stateT > 40) this.setState('idle');
        break;
      case 'wander':
        moveTo = this.target; speed = cfg.walk * (this.crippled ? 0.5 : 1);
        if (!this.target || this.dist2To(this.target.x, this.target.z) < 1 || this.stateT > 25) this.setState('idle');
        break;
      case 'investigate':
        moveTo = this.target; speed = cfg.walk * 1.6 * night * (this.crippled ? 0.6 : 1);
        if (!this.target || this.dist2To(this.target.x, this.target.z) < 2.2 || this.stateT > 30) {
          this.setState('search', 0);
        }
        break;
      case 'search':
        // look around near the last target
        if (this.stateT > 6 + Math.random() * 4) this.pickWander(6);
        break;
      case 'scream':
        if (!this.screamDone) {
          this.screamDone = true;
          this.mgr.playVoice(this, 'zombie_scream', 1.6, 120);
          g.noise(this.x, this.y, this.z, 60, 'scream', false, { target: { x: p.x, y: p.y, z: p.z } });
        }
        if (this.stateT > 1.6) this.setState('chase');
        break;
      case 'chase': {
        if (p.dead) { this.setState('wander'); break; }
        const seen = this.lastSeen;
        const sinceSeen = g.clock - (seen?.t || 0);
        if (sinceSeen > 9) { this.target = seen ? { ...seen } : null; this.setState('investigate'); break; }
        const tgt = sinceSeen < 0.6 ? { x: p.x, y: p.y, z: p.z } : seen;
        moveTo = tgt;
        speed = (this.crippled ? cfg.chase[0] * 0.5 : this.chaseSpeed) * night;
        if (this.variant === 'walker' && g.isNight) speed *= 1.1;
        // attack range
        const dy = Math.abs(p.y - this.y);
        if (distP < cfg.range + 0.3 && dy < 1.6 && this.cooldownT <= 0 && sinceSeen < 0.6) {
          this.setState('attack'); this.attackT = 0; this.didHit = false;
          this.mgr.playVoice(this, 'zombie_attack', 0.9);
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
          const dy = Math.abs(p.y - this.y);
          if (distP < cfg.range + 0.55 && dy < 1.7 && g.canHit(this)) g.zombieHitsPlayer(this);
        }
        if (this.attackT > wind + 0.45) { this.cooldownT = cfg.cooldown; this.setState('chase'); }
        break;
      }
      case 'bash': {
        const bt = this.bashTarget;
        if (!bt || !this.mgr.isBashable(bt.x, bt.y, bt.z)) { this.bashTarget = null; this.setState(this.lastSeen ? 'chase' : 'investigate'); break; }
        this.yaw = turnToward(this.yaw, Math.atan2(bt.x + 0.5 - this.x, bt.z + 0.5 - this.z), dt * 6);
        this.bashT -= dt;
        if (this.bashT <= 0) {
          this.bashT = 1.1 + Math.random() * 0.4;
          this.mgr.bash(this, bt);
        }
        // stop bashing if the player is reachable otherwise (e.g. came outside)
        if (this.stateT > 1 && distP < 1.6) this.setState('chase');
        break;
      }
      case 'stagger':
        if (this.stateT > 0.6) this.setState(this.lastSeen ? 'chase' : 'idle');
        break;
      case 'down':
        if (this.stateT > 2.5 && !this.crippled) this.setState('getup');
        else if (this.stateT > 1.2 && this.crippled) this.setState('chase');
        break;
      case 'getup':
        if (this.stateT > 1.5) this.setState(this.lastSeen ? 'chase' : 'idle');
        break;
    }

    // ---- movement
    let wantVx = 0, wantVz = 0;
    if (moveTo && speed > 0) {
      const wp = this.navigate(moveTo, dt);
      if (wp) {
        const dx = wp.x - this.x, dz = wp.z - this.z;
        const d = Math.hypot(dx, dz);
        if (d > 0.05) {
          wantVx = (dx / d) * speed; wantVz = (dz / d) * speed;
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
    this.vx = lerp(this.vx, stop ? 0 : wantVx, k);
    this.vz = lerp(this.vz, stop ? 0 : wantVz, k);
    this.vy -= 26 * dt;
    if (this.vy < -50) this.vy = -50;
    const id = g.world.get(Math.floor(this.x), Math.floor(this.y + 0.3), Math.floor(this.z));
    const slow = BLOCKS[id].slow;
    if (slow < 1) { this.vx *= Math.pow(slow, dt * 10); this.vz *= Math.pow(slow, dt * 10); }
    if (BLOCKS[id].render === 'liquid') this.vy = Math.max(this.vy, -1.5);
    if (BLOCKS[id].damage > 0 && id === B.fire) this.burning = Math.max(this.burning, 6);
    const res = moveBody(g.world, this, dt, g.vehicleColliders);
    if ((res.hitX || res.hitZ) && !stop && moveTo) this.onBlocked(wantVx, wantVz);
    // push the player (zombies are heavy-ish)
    if (distP < this.hw + p.hw + 0.05 && Math.abs(p.y - this.y) < 1.5 && distP > 0.01) {
      const push = (this.hw + p.hw + 0.05 - distP) * 0.5;
      p.x += (dxp / distP) * push; p.z += (dzp / distP) * push;
    }
    // stuck detection
    if (moveTo && !stop) {
      const moved = Math.hypot(this.x - this.lastPos.x, this.z - this.lastPos.z);
      if (moved < 0.15 * dt * speed * 6) this.stuckT += dt; else this.stuckT = Math.max(0, this.stuckT - dt);
      if (this.stuckT > 2.5) { this.path = null; this.stuckT = 0; if (this.state === 'wander') this.pickWander(); }
    }
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
    if (!this.lod || this.lod === 1) this.visual.update(dt, a);
    this.updateLight(dt);
  }

  animState(hs) {
    switch (this.state) {
      case 'attack': return 'attack';
      case 'bash': return 'bash';
      case 'stagger': return 'stagger';
      case 'down': return this.crippled ? 'crawl' : this.stateT < 0.65 ? 'knockdown' : 'down';
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

  perceive(distP, dt) {
    const g = this.game, p = g.player;
    if (distP > 70) return;
    const cfg = this.cfg;
    // base sight range depends on light at the player
    const light = g.playerLight; // 0..1 effective brightness at the player
    let range = lerp(9, 36, light) * cfg.sight;
    if (p.flashlightOn && g.isNight) range = Math.max(range, 30);
    if (p.crouching) range *= 0.6 - p.skillLevel('sneaking') * 0.02;
    if (g.playerHidden) range *= 0.35;
    range *= 1 - g.weather.params.fog * 0.5 - g.weather.params.rain * 0.15;
    // facing
    const dx = p.x - this.x, dz = p.z - this.z;
    const fx = Math.sin(this.yaw), fz = Math.cos(this.yaw);
    const dot = distP > 0.01 ? (dx * fx + dz * fz) / distP : 1;
    const inFov = dot > 0.2 || distP < 3.5;
    const prox = distP < 2.2 && Math.abs(p.y - this.y) < 2;
    if (prox) { this.startChase(true); return; }
    if (distP < range && inFov) {
      const vis = lineOfSight(g.world, this.x, this.y + this.h * 0.9, this.z, p.x, p.y + p.eye, p.z);
      if (vis) {
        const rate = (1.6 - distP / range) * (this.state === "investigate" ? 3 : 1.6) * (light * 0.6 + 0.4) * 0.55;
        this.awareness += rate * (dt + 0.25);
        if (this.state === 'chase' || this.state === 'attack' || this.awareness >= 1) {
          this.startChase(this.state !== 'chase');
        } else if (this.awareness > 0.45 && this.state !== 'investigate') {
          this.target = { x: p.x, y: p.y, z: p.z };
          this.setState('investigate');
        }
        return;
      }
    }
    this.awareness = Math.max(0, this.awareness - 0.1);
  }

  pickWander(radius = 10) {
    const w = this.game.world;
    for (let i = 0; i < 6; i++) {
      const tx = Math.floor(this.x + (Math.random() - 0.5) * radius * 2);
      const tz = Math.floor(this.z + (Math.random() - 0.5) * radius * 2);
      const ty = groundAt(w, tx, Math.floor(this.y + 0.2), tz);
      if (ty >= 0) {
        this.target = { x: tx + 0.5, y: ty, z: tz + 0.5 };
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
    if (dGoal < 2.5 && sameLevel) return goal;
    if (this.path && this.pathI < this.path.length && this.pathT > 0) {
      const wp = this.path[this.pathI];
      if (Math.hypot(wp.x - this.x, wp.z - this.z) < 0.55 && Math.abs(wp.y - this.y) < 1.2) this.pathI++;
      if (this.pathI < this.path.length) return this.path[this.pathI];
    }
    // direct line?
    if (sameLevel && (dGoal < 14 || !chasing) && this.mgr.directClear(this, goal)) {
      this.path = null;
      return goal;
    }
    if (this.pathT <= 0 && this.mgr.requestPath()) {
      this.pathT = chasing ? 1.2 + Math.random() * 0.6 : 4;
      const sx = Math.floor(this.x), sy = Math.floor(this.y + 0.2), sz = Math.floor(this.z);
      const tx = Math.floor(goal.x), tz = Math.floor(goal.z);
      let ty = Math.floor((goal.y ?? this.y) + 0.2);
      this.path = findPath(g.world, sx, sy, sz, tx, ty, tz, { canJump: this.cfg.canJump && !this.crippled, maxNodes: chasing ? 800 : 400 });
      this.pathI = 0;
      if (this.path && this.path.length) return this.path[0];
    }
    return goal;
  }

  onBlocked(vx, vz) {
    const g = this.game, w = g.world;
    const len = Math.hypot(vx, vz) || 1;
    const dx = vx / len, dz = vz / len;
    const ax = Math.floor(this.x + dx * (this.hw + 0.45)), az = Math.floor(this.z + dz * (this.hw + 0.45));
    const fy = Math.floor(this.y + 0.2);
    // bashable obstacle ahead?
    for (const y of [fy, fy + 1]) {
      if (this.mgr.isBashable(ax, y, az) && this.cfg.door > 0) {
        this.bashTarget = { x: ax, y, z: az };
        this.setState('bash', 0);
        this.bashT = 0.4;
        return;
      }
    }
    // jump up 1 block
    if (this.onGround && this.cfg.canJump && !this.crippled) {
      const a = w.get(ax, fy, az), b = w.get(ax, fy + 1, az), c = w.get(ax, fy + 2, az);
      if (SOLID[a] && !SOLID[b] && !SOLID[c] && !IS_DOOR[a]) this.vy = 7.6;
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
