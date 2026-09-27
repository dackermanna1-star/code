// Common infected + infected manager (spawning, sensing, flow fields, spatial
// hashing, hit tracing, corpses). Commons idle (stand / wander / sit / lie /
// feed), react to sight & noise, chase along a multi-source flow field, climb
// ledges, drop down, break doors, surround and attack survivors, stumble when
// shoved, burn, lose limbs and die into Verlet ragdolls.
import * as THREE from 'three';
import { Agent } from './agent.js';
import { Body, Ragdoll, J, PART, PARTS, PROPS, SEVER_CHILDREN, animateHumanoid, poseLying } from './body.js';
import { CrowdRenderer } from './crowd.js';
import { LINK_CLIMB, LINK_DROP } from '../world/nav.js';
import { rayCapsule, raySphere, clamp, damp, randRange, pick, chance, wrapAngle, dampAngle } from '../core/math.js';
import { DF } from '../render/decals.js';

const S_IDLE = 0, S_ALERT = 1, S_CHASE = 2, S_ATTACK = 3, S_STUMBLE = 4, S_BURN = 5, S_BREAK = 6, S_GETUP = 7, S_LURED = 8;
const _v = new THREE.Vector3();

export class Common extends Agent {
  constructor(mgr) {
    super(mgr);
    this.slot = -1;
  }
  spawn(x, y, z, opts = {}) {
    this.dead = false;
    this.isCorpse = false;
    this.ragdoll = null;
    this.body = new Body(randRange(0.92, 1.06), randRange(0.9, 1.12));
    this.body.bloodAmt = 0.2;
    this.hp = 50;
    this.placeAt(x, y, z);
    this.yaw = opts.yaw ?? Math.random() * 6.28;
    this.state = opts.chase ? S_CHASE : S_IDLE;
    this.idle = opts.idle || pick(['stand', 'stand', 'wander', 'wander', 'sit', 'lie', 'eat']);
    if (opts.chase) this.idle = 'stand';
    this.stateT = 0;
    this.speed = randRange(4.5, 5.6) * (this.mgr.game.difficulty.commonSpeed ?? 1);
    this.curSpeed = opts.chase ? this.speed * 0.6 : 0;
    this.attackT = 0;
    this.attackCd = 0;
    this.target = null;
    this.thinkT = Math.random() * 0.3;
    this.senseT = Math.random() * 0.5;
    this.ang = Math.random() * Math.PI * 2;
    this.burning = 0;
    this.stumble = null;
    this.climb = null;
    this.falling = false;
    this.deadT = 0;
    this.wanderT = randRange(2, 6);
    this.wanderGoal = null;
    this.alertDelay = 0;
    this.slowT = 0;
    this.lastHitBy = null;
    this.biled = 0;
    this.horde = !!opts.horde;
    this.outfit = opts.outfit || this.mgr.outfit;
    this.hitS = this.hitF = this.hitVS = this.hitVF = 0;
    this.visible = true;
    this.slot = this.mgr.crowd.alloc(this.body, this.outfit);
    if (this.slot < 0) return false;
    this.animate(0.016, true);
    this.body.storePrev();
    this.vocT = randRange(1, 6);
    return true;
  }

  // ------------------------------------------------------------ sensing --
  alert(delay = 0, target = null) {
    if (this.dead || this.state === S_BURN) return;
    if (this.state === S_IDLE) {
      this.state = S_ALERT;
      this.alertDelay = delay + (this.idle === 'lie' || this.idle === 'sit' ? 0.2 : 0);
      this.stateT = 0;
      if (target) this.target = target;
      if (Math.random() < 0.3) this.mgr.game.audio.play('zAlert', { pos: this.pos, vol: 0.8 });
    }
  }

  update(dt) {
    const g = this.game;
    if (this.dead) {
      this.deadT += dt;
      if (this.ragdoll && !this.ragdoll.asleep) {
        const rd = this.ragdoll;
        rd.step(dt, g.level.col);
        // corpse center position for queries
        this.pos.set(this.body.jx(J.PELVIS), this.body.jy(J.PELVIS), this.body.jz(J.PELVIS));
        this.dirty = true;
      }
      return;
    }
    this.stateT += dt;
    this.slowT = Math.max(0, this.slowT - dt);
    this.biled = Math.max(0, this.biled - dt);
    this.hitReact(dt);
    const survivors = this.mgr.targets;

    if (this.burning > 0) {
      this.burning -= dt;
      this.hp -= dt * 30;
      if (Math.random() < 0.6) g.fx.fire(this.pos.x + (Math.random() - 0.5) * 0.3, this.pos.y + 0.5 + Math.random(), this.pos.z + (Math.random() - 0.5) * 0.3, 0.5);
      if (this.hp <= 0) { this.die({ dir: _v.set(0, 0, 0), kind: 'fire', attacker: this.burnBy, knockback: 0 }); return; }
    }

    // vocalisations
    this.vocT -= dt;
    if (this.vocT <= 0) {
      this.vocT = this.state === S_IDLE ? randRange(4, 12) : randRange(1.5, 4);
      g.audio.play(this.state === S_IDLE ? 'zIdle' : 'zChase', { pos: this.pos, vol: this.state === S_IDLE ? 0.5 : 0.7 });
    }

    if (this.climb) {
      if (this.updateClimb(dt)) { /* done */ }
      this.animate(dt);
      return;
    }
    if (this.falling) {
      if (this.updateFall(dt, this.speed * 0.6)) { this.stumbleFor(0.25, 0, 0, 0); }
      this.animate(dt);
      return;
    }

    switch (this.state) {
      case S_IDLE: this.updateIdle(dt, survivors); break;
      case S_ALERT:
        this.alertDelay -= dt;
        if (this.target) this.faceTowards(this.target.pos.x, this.target.pos.z, 6, dt);
        if (this.alertDelay <= 0) {
          if (this.idle === 'lie' || this.idle === 'sit' || this.idle === 'eat') {
            this.body.takeSnapshot(this.idle === 'lie' ? 0.9 : 0.6);
            this.state = S_GETUP;
            this.stateT = 0;
            this.idle = 'stand';
          } else { this.state = S_CHASE; this.stateT = 0; }
        }
        break;
      case S_GETUP:
        if (this.stateT > 0.55) { this.state = S_CHASE; this.stateT = 0; }
        break;
      case S_CHASE: this.updateChase(dt, survivors); break;
      case S_ATTACK: this.updateAttack(dt); break;
      case S_STUMBLE: this.updateStumble(dt); break;
      case S_BURN: this.updateChase(dt, survivors); break;
      case S_BREAK: this.updateBreak(dt); break;
      case S_LURED: this.updateLured(dt); break;
    }
    this.followY(dt);
    this.animate(dt);
  }

  updateIdle(dt, survivors) {
    const g = this.game;
    // sensing (staggered)
    this.senseT -= dt;
    if (this.senseT <= 0) {
      this.senseT = 0.35 + Math.random() * 0.3;
      let best = null, bd = 1e9;
      for (const s of survivors) {
        const d = s.pos.distanceTo(this.pos);
        if (d < bd) { bd = d; best = s; }
      }
      if (best) {
        const alertD = this.idle === 'lie' || this.idle === 'sit' || this.idle === 'eat' ? 6 : 9;
        let sees = false;
        if (bd < 2.8) sees = true;
        else if (bd < 22) {
          // vision cone + light
          const dx = best.pos.x - this.pos.x, dz = best.pos.z - this.pos.z;
          const fx = -Math.sin(this.yaw), fz = -Math.cos(this.yaw);
          const dot = (dx * fx + dz * fz) / (Math.hypot(dx, dz) || 1);
          const lit = best.flashlight && bd < 14;
          const noisy = best.sprinting && bd < 12;
          if ((bd < alertD && dot > -0.2) || (lit && dot > 0.3) || noisy) {
            sees = g.level.col.lineOfSight(this.pos.x, this.pos.y + 1.6, this.pos.z, best.pos.x, best.pos.y + 1.4, best.pos.z);
          }
        }
        if (sees) { this.alert(Math.random() * 0.3, best); this.mgr.alertNeighbours(this, 5); }
      }
    }
    // idle behaviours
    if (this.idle === 'wander') {
      this.wanderT -= dt;
      if (this.wanderT <= 0 || !this.wanderGoal) {
        this.wanderT = randRange(3, 8);
        const a = Math.random() * 6.28, r = randRange(2, 6);
        this.wanderGoal = { x: this.pos.x + Math.cos(a) * r, z: this.pos.z + Math.sin(a) * r, pause: Math.random() < 0.4 };
      }
      if (!this.wanderGoal.pause) {
        const dx = this.wanderGoal.x - this.pos.x, dz = this.wanderGoal.z - this.pos.z;
        const dl = Math.hypot(dx, dz);
        if (dl > 0.4) {
          this.faceTowards(this.wanderGoal.x, this.wanderGoal.z, 2, dt);
          const sp = 0.85;
          const fx = -Math.sin(this.yaw), fz = -Math.cos(this.yaw);
          if (!this.moveOnNav(fx * sp * dt, fz * sp * dt)) this.wanderGoal = null;
          this.curSpeed = sp;
        } else { this.curSpeed = 0; this.wanderGoal.pause = true; }
      } else this.curSpeed = damp(this.curSpeed, 0, 5, dt);
    } else this.curSpeed = 0;
  }

  pickTarget(survivors) {
    let best = null, bd = 1e9;
    for (const s of survivors) {
      let d = s.pos.distanceTo(this.pos);
      if (s.bile > 0) d *= 0.15; // biled survivors are magnets
      if (s.incapped) d *= 0.9;
      if (d < bd) { bd = d; best = s; }
    }
    return best;
  }

  updateChase(dt, survivors) {
    const g = this.game;
    this.thinkT -= dt;
    if (this.thinkT <= 0 || !this.target || this.target.dead) {
      this.thinkT = 0.25 + Math.random() * 0.25;
      this.target = this.pickTarget(survivors);
      if (this.mgr.lureActive && this.pos.distanceTo(this.mgr.lurePos) < this.mgr.lureRadius && !(this.target && this.target.bile > 0)) {
        this.state = S_LURED; this.stateT = 0; return;
      }
    }
    const t = this.target;
    if (!t) { this.curSpeed = damp(this.curSpeed, 0, 4, dt); return; }
    const dx = t.pos.x - this.pos.x, dz = t.pos.z - this.pos.z, dy = t.pos.y - this.pos.y;
    const dist = Math.hypot(dx, dz);
    const burn = this.state === S_BURN;
    if (!burn && dist < 1.05 + (t.incapped ? 0.2 : 0) && Math.abs(dy) < 1.3) {
      this.state = S_ATTACK;
      this.stateT = 0;
      this.attackT = Math.random() * 0.3;
      this.attackCd = 0.25 + Math.random() * 0.2;
      return;
    }
    // Steering
    let gx = t.pos.x, gz = t.pos.z;
    let useDirect = false;
    if (dist < 7 && Math.abs(dy) < 0.8) {
      // spread around the target
      if (dist < 3.5) {
        const off = 0.7;
        gx = t.pos.x + Math.cos(this.ang) * off;
        gz = t.pos.z + Math.sin(this.ang) * off;
      }
      useDirect = this.mgr.directOK(this, t);
    }
    let sp = this.speed;
    if (this.slowT > 0) sp *= 0.45;
    if (burn) sp *= 1.1;
    this.curSpeed = damp(this.curSpeed, sp, 5, dt);
    let mx = 0, mz = 0;
    if (useDirect) {
      const ex = gx - this.pos.x, ez = gz - this.pos.z;
      const el = Math.hypot(ex, ez) || 1;
      mx = ex / el; mz = ez / el;
    } else {
      const ft = this.flowTarget(this.mgr.flowField(), 3);
      if (ft) {
        if (ft.link === LINK_CLIMB) { this.startClimb(ft.next); return; }
        if (ft.link === LINK_DROP) { this.startDrop(ft.next); return; }
        const ex = ft.x - this.pos.x, ez = ft.z - this.pos.z;
        const el = Math.hypot(ex, ez) || 1;
        mx = ex / el; mz = ez / el;
      } else if (dist < 30) {
        const el = dist || 1;
        mx = dx / el; mz = dz / el;
      }
    }
    if (mx || mz) {
      const ty = Math.atan2(-mx, -mz);
      this.yaw = dampAngle(this.yaw, ty, 10, dt);
      // move along facing blended with desired dir for smooth turning
      const moved = this.moveOnNav(mx * this.curSpeed * dt, mz * this.curSpeed * dt);
      if (!moved && this.blockedByDoor) {
        this.state = S_BREAK; this.stateT = 0; this.breakDoor = this.blockedByDoor; this.attackT = 0;
      }
      this.stuckT = moved ? 0 : (this.stuckT || 0) + dt;
    }
  }

  updateLured(dt) {
    const m = this.mgr;
    if (!m.lureActive || (this.target && this.target.bile > 0)) { this.state = S_CHASE; return; }
    const ft = m.lureField ? this.flowTarget(m.lureField, 3) : null;
    const dx = m.lurePos.x - this.pos.x, dz = m.lurePos.z - this.pos.z;
    const dist = Math.hypot(dx, dz);
    this.curSpeed = damp(this.curSpeed, this.speed, 5, dt);
    if (dist < 1.2) { this.curSpeed = 0; this.faceTowards(m.lurePos.x, m.lurePos.z, 5, dt); this.attackT += dt * 1.5; return; }
    let mx = dx / (dist || 1), mz = dz / (dist || 1);
    if (ft) {
      if (ft.link === LINK_CLIMB) { this.startClimb(ft.next); return; }
      if (ft.link === LINK_DROP) { this.startDrop(ft.next); return; }
      const ex = ft.x - this.pos.x, ez = ft.z - this.pos.z;
      const el = Math.hypot(ex, ez) || 1;
      mx = ex / el; mz = ez / el;
    }
    this.yaw = dampAngle(this.yaw, Math.atan2(-mx, -mz), 10, dt);
    this.moveOnNav(mx * this.curSpeed * dt, mz * this.curSpeed * dt);
  }

  updateAttack(dt) {
    const g = this.game;
    const t = this.target;
    if (!t || t.dead) { this.state = S_CHASE; return; }
    const dx = t.pos.x - this.pos.x, dz = t.pos.z - this.pos.z;
    const dist = Math.hypot(dx, dz);
    this.faceTowards(t.pos.x, t.pos.z, 8, dt);
    this.curSpeed = damp(this.curSpeed, 0, 8, dt);
    // keep pressing in slightly
    if (dist > 0.75) this.moveOnNav(dx / dist * 1.5 * dt, dz / dist * 1.5 * dt);
    if (dist > 1.6 || Math.abs(t.pos.y - this.pos.y) > 1.4) { this.state = S_CHASE; this.stateT = 0; return; }
    this.attackCd -= dt;
    const prev = this.attackT;
    this.attackT += dt * 1.25;
    // Hit at mid-swing (two arms alternate -> hits at .45 and .95)
    const hitPoints = [0.45, 0.95];
    for (const hp of hitPoints) {
      if (prev < hp && this.attackT >= hp && this.attackCd <= 0) {
        this.attackCd = 0.35;
        const dmg = g.difficulty.commonDmg * (t.incapped ? 1.5 : 1);
        if (!t.pinned || t.pinType !== 'hunter') t.takeDamage(dmg, this, 'claw');
        t.slowT = Math.max(t.slowT, 0.35);
        if (t.isHuman) g.onPlayerClawed?.(this);
        g.audio.play('zHit', { pos: t.pos, vol: 0.8 });
        g.fx.blood(t.pos.x, t.pos.y + 1.2, t.pos.z, dx / (dist || 1), 0, dz / (dist || 1), 0.3, false);
      }
    }
    if (this.attackT >= 1) this.attackT -= 1;
  }

  updateBreak(dt) {
    const d = this.breakDoor;
    if (!d || !d.blocksInfected()) { this.state = S_CHASE; this.breakDoor = null; return; }
    this.faceTowards(d.cx, d.cz, 6, dt);
    this.curSpeed = 0;
    const prev = this.attackT;
    this.attackT += dt * 1.1;
    if (prev < 0.45 && this.attackT >= 0.45) d.damage(12, this);
    if (prev < 0.95 && this.attackT >= 0.95) d.damage(12, this);
    if (this.attackT >= 1) this.attackT -= 1;
    if (this.stateT > 20) { this.state = S_CHASE; }
  }

  stumbleFor(dur, dirX, dirZ, power) {
    this.state = S_STUMBLE;
    this.stateT = 0;
    this.stumble = { t: dur, vx: dirX * power, vz: dirZ * power };
  }
  updateStumble(dt) {
    const s = this.stumble;
    if (!s) { this.state = S_CHASE; return; }
    s.t -= dt;
    this.moveOnNav(s.vx * dt, s.vz * dt);
    s.vx *= Math.max(0, 1 - dt * 5);
    s.vz *= Math.max(0, 1 - dt * 5);
    this.curSpeed = Math.hypot(s.vx, s.vz) * 0.6;
    if (s.t <= 0) { this.stumble = null; this.state = this.burning > 0 ? S_BURN : S_CHASE; this.stateT = 0; }
  }

  // ---------------------------------------------------------- reactions --
  onShoved(s, fx, fz) {
    if (this.dead) return;
    this.alert(0, s);
    this.target = s;
    this.stumbleFor(0.9 + Math.random() * 0.3, fx, fz, 4.2);
    this.pushReaction(fx, fz, 2.6);
    this.mgr.game.audio.play('zShoved', { pos: this.pos, vol: 0.6 });
  }
  ignite(owner) {
    if (this.dead) return;
    if (this.burning <= 0) this.mgr.game.audio.play('zBurn', { pos: this.pos, vol: 0.7 });
    this.burning = 4;
    this.burnBy = owner;
    this.state = S_BURN;
    this.target = this.pickTarget(this.mgr.targets);
  }

  takeHit(h) {
    if (this.dead) {
      // shooting corpses pushes them around
      if (this.ragdoll) {
        const k = h.kind === 'explosion' ? 1 : 0.6;
        const jn = PARTS[h.part >= 0 ? h.part : 0][2];
        this.ragdoll.impulse(jn, h.dir.x * h.knockback * 3 * k, h.dir.y * h.knockback * 2 * k + 0.5, h.dir.z * h.knockback * 3 * k);
        if (h.kind === 'bullet' && h.damage > 30 && h.part > 1 && Math.random() < 0.25) this.sever(h.part, h.dir, 3);
        if (h.explosion && h.gib) this.gibAll(h.dir, 9);
      }
      return;
    }
    const g = this.game;
    let mult = 1;
    if (h.zone === 'head') mult = 4;
    else if (h.zone !== 'torso') mult = 0.75;
    const dmg = h.damage * mult;
    this.hp -= dmg;
    this.lastHitBy = h.attacker;
    this.body.bloodAmt = Math.min(1, (this.body.bloodAmt || 0.2) + dmg / 120);
    g.infected.crowd.setBlood(this.slot, this.body.bloodAmt);
    // alert on damage
    if (this.state === S_IDLE || this.state === S_ALERT || this.state === S_GETUP) {
      this.state = S_CHASE; this.idle = 'stand';
      this.target = h.attacker && h.attacker.pos ? h.attacker : this.target;
      this.mgr.alertNeighbours(this, 6);
    }
    if (this.hp <= 0) {
      this.die(h, dmg);
      return;
    }
    // survived: flinch / stagger
    const kb = h.knockback || 1;
    this.pushReaction(h.dir.x, h.dir.z, 1.2 + kb * 0.5);
    this.slowT = Math.max(this.slowT, 0.25 + kb * 0.08);
    if (kb > 2 || h.kind === 'melee') this.stumbleFor(0.4 + kb * 0.05, h.dir.x, h.dir.z, kb * 1.3);
    // limb loss on survivable heavy hits
    if (h.zone.startsWith('arm') && dmg > 28 && Math.random() < 0.45) this.sever(h.part, h.dir, 3);
  }

  die(h, dmg = 50) {
    const g = this.game;
    this.dead = true;
    this.isCorpse = true;
    this.deadT = 0;
    this.climb = null;
    this.falling = false;
    this.burning = 0;
    this.mgr.onKilled(this, h);
    // gore decisions
    const kb = h.knockback || 1;
    const dir = h.dir || _v.set(0, 0, 0);
    let gibbed = false;
    if (h.explosion && h.gib) {
      if (Math.random() < 0.55) { this.gibAll(dir, 10); gibbed = true; }
      else {
        // lose limbs
        for (const p of [PART.uarmL, PART.uarmR, PART.thighL, PART.thighR, PART.head]) if (Math.random() < 0.45) this.sever(p, dir, 7);
      }
    } else if (h.zone === 'head' && (dmg >= 100 || h.decap || (h.kind === 'bullet' && h.weapon && h.weapon.def.kind === 'shotgun' && h.pellets >= 3))) {
      this.sever(PART.head, dir, 4, true);
    } else if (h.kind === 'melee' && h.decap && Math.random() < 0.7) {
      this.sever(PART.head, dir, 3, true);
    } else if (h.kind === 'melee' && Math.random() < 0.45) {
      this.sever(pick([PART.uarmL, PART.uarmR, PART.farmL, PART.farmR]), dir, 4);
    } else if (h.zone !== 'torso' && h.zone !== 'head' && (dmg >= 30 || h.pellets >= 3) && Math.random() < 0.6) {
      this.sever(h.part, dir, 4);
    } else if (h.kind === 'bullet' && h.weapon?.def.kind === 'shotgun' && h.pellets >= 6 && Math.random() < 0.35) {
      this.sever(pick([PART.uarmL, PART.uarmR]), dir, 5);
    }
    if (gibbed) return;
    // ragdoll
    this.body.storePrev();
    const bv = this.curSpeed || 0;
    const fx = -Math.sin(this.yaw) * bv, fz = -Math.cos(this.yaw) * bv;
    // prev joints from last frame are in body.prev already (animate stores); construct ragdoll
    this.ragdoll = new Ragdoll(this.body, fx * 0.5, 0, fz * 0.5);
    this.body.ragdoll = this.ragdoll;
    const jn = PARTS[h.part >= 0 ? h.part : 0][2];
    const power = Math.min(14, 2 + kb * (h.kind === 'explosion' ? 1.2 : 1.6));
    this.ragdoll.impulse(jn, dir.x * power * 2.2, (dir.y + 0.15) * power * 1.2, dir.z * power * 2.2);
    this.ragdoll.impulse(J.CHEST, dir.x * power, 0, dir.z * power);
    if (h.kind === 'explosion') this.ragdoll.impulseAll(dir.x * power * 1.2, power * 0.9, dir.z * power * 1.2);
    // Blood pool later
    this.poolT = 0.8 + Math.random() * 0.8;
    this.mgr.corpses.push(this);
  }

  sever(part, dir, power = 4, headExplode = false) {
    if (part < 0) return;
    const g = this.game;
    const parts = SEVER_CHILDREN[part] || [part];
    let any = false;
    for (const p of parts) {
      if (this.body.severed & (1 << p)) continue;
      this.body.severed |= 1 << p;
      any = true;
      const [, a, b] = PARTS[p];
      const mx = (this.body.jx(a) + this.body.jx(b)) / 2, my = (this.body.jy(a) + this.body.jy(b)) / 2, mz = (this.body.jz(a) + this.body.jz(b)) / 2;
      const look = this.body.look;
      if (p === PART.head) {
        if (headExplode || Math.random() < 0.5) {
          // pulped head
          g.gibs.burst(mx, my - 0.8, mz, look, 3, 5);
          g.fx.blood(mx, my + 0.05, mz, dir.x, 0.8, dir.z, 3.2);
        } else {
          g.gibs.spawn('head', this.body.jx(J.HEAD), this.body.jy(J.HEAD), this.body.jz(J.HEAD), dir.x * power + (Math.random() - 0.5), 2 + Math.random() * 2, dir.z * power, look?.skin || [0.5, 0.45, 0.4]);
          g.fx.blood(mx, my, mz, dir.x, 0.6, dir.z, 2.5);
        }
        this.neckSpurt = 2.5;
      } else {
        const type = p === PART.uarmL || p === PART.uarmR ? 'uarm' : p === PART.farmL || p === PART.farmR ? 'farm' : p === PART.thighL || p === PART.thighR ? 'thigh' : 'shin';
        const isCloth = (type === 'thigh' || type === 'shin') || (look && look.sleeve > 0.5);
        const color = isCloth ? (type === 'thigh' || type === 'shin' ? look?.pants : look?.cloth) : look?.skin;
        // orient gib along the limb
        const q = new THREE.Quaternion();
        const ax = this.body.jx(b) - this.body.jx(a), ay = this.body.jy(b) - this.body.jy(a), az = this.body.jz(b) - this.body.jz(a);
        q.setFromUnitVectors(new THREE.Vector3(0, 1, 0), new THREE.Vector3(ax, ay, az).normalize());
        g.gibs.spawn(type, mx, my, mz, dir.x * power + (Math.random() - 0.5) * 2, 1.5 + Math.random() * 2.5, dir.z * power + (Math.random() - 0.5) * 2, color || [0.4, 0.35, 0.3], this.body.scale, q);
        g.fx.blood(mx, my, mz, dir.x, 0.3, dir.z, 2);
        this.limbSpurt = 1.5;
        this.spurtJoint = a;
      }
      if (this.ragdoll) this.ragdoll.sever(a, b);
    }
    if (any) g.audio.play(part === PART.head ? 'headshot' : 'dismember', { pos: this.pos, vol: 0.9 });
    // lost a leg -> alive zombies crawl? we keep it simple: they fall and die slower
    if (!this.dead && (part === PART.thighL || part === PART.thighR || part === PART.shinL || part === PART.shinR)) {
      this.hp = 0;
      this.die({ dir, kind: 'bullet', knockback: 1, part, zone: 'legL' });
    }
    if (!this.dead && part === PART.head) {
      this.hp = 0;
      this.die({ dir, kind: 'bullet', knockback: 1, part, zone: 'head' });
    }
  }

  gibAll(dir, power) {
    const g = this.game;
    const look = this.body.look;
    for (const p of [PART.head, PART.uarmL, PART.uarmR, PART.thighL, PART.thighR]) this.sever(p, dir, power);
    g.gibs.burst(this.body.jx(J.PELVIS), this.body.jy(J.PELVIS) - 0.4, this.body.jz(J.PELVIS), look, power, 8);
    this.body.visible = false;
    g.decals.add(this.pos.x, this.pos.y + 0.02, this.pos.z, 0, 1, 0, 1.6, DF.SPLAT_BIG);
    this.gibbed = true;
  }

  // ----------------------------------------------------------- animation --
  animate(dt, force = false) {
    const g = this.game;
    const b = this.body;
    // LOD: skip far bodies some frames
    const cam = g.camPos;
    const dx = this.pos.x - cam.x, dz = this.pos.z - cam.z;
    const d2 = dx * dx + dz * dz;
    this.lodSkip = (this.lodSkip || 0) + 1;
    const every = d2 > 3600 ? 4 : d2 > 900 ? 2 : 1;
    this.animDt = (this.animDt || 0) + dt;
    if (!force && this.lodSkip < every) return;
    this.lodSkip = 0;
    const adt = this.animDt;
    this.animDt = 0;
    b.storePrev();
    const sp = this.curSpeed;
    this.phase += adt * (sp / (0.9 + sp * 0.12)) * 2.2;
    const P = PROPS;
    this.poser.frame(this.pos.x, this.pos.y, this.pos.z, this.yaw);
    const a = this._anim || (this._anim = {});
    a.time = g.time + this.seed;
    a.seed = this.seed;
    a.speed = sp;
    a.phase = this.phase;
    a.crouch = 0; a.lean = 0.12; a.hunch = 0; a.sink = 0; a.legs = null; a.headPitch = 0;
    a.hitS = this.hitS; a.hitF = this.hitF;
    a.twitch = 0.3;
    a.sway = 0.03;
    a.runLean = 1.3;
    a.footS = 0; a.footF = 0;
    let arms = 'hang';
    if (this.climb) { arms = 'climb'; a.legs = 'climb'; a.lean = 0.3; a.speed = 2; a.phase = g.time * 8; }
    else if (this.falling) { arms = 'flail'; a.legs = 'air'; }
    else switch (this.state) {
      case S_IDLE:
      case S_ALERT:
        if (this.idle === 'sit') { a.legs = 'sit'; a.sink = 0.55; arms = 'hang'; a.lean = -0.1; a.headPitch = 0.4; }
        else if (this.idle === 'eat') { a.legs = 'kneel'; a.sink = 0.45; arms = 'eat'; a.lean = 0.7; a.headPitch = 0.6; }
        else if (this.idle === 'lie') { poseLying(b, P, this.poser, true, g.time * 0.5 + this.seed); this.finishPose(adt); return; }
        else { arms = sp > 0.3 ? 'swing' : 'hang'; a.lean = 0.18; a.hunch = 0.1; a.twitch = 0.6; }
        break;
      case S_CHASE:
      case S_LURED:
        arms = sp > 3 ? (this.seed % 3 < 1 ? 'reach' : 'swing') : 'swing';
        a.lean = 0.12 + (sp > 3 ? 0.18 : 0);
        break;
      case S_ATTACK: arms = 'attack'; a.attackT = this.attackT; a.lean = 0.25; break;
      case S_BREAK: arms = 'attack'; a.attackT = this.attackT; a.lean = 0.2; break;
      case S_STUMBLE: arms = 'flail'; a.lean = -0.25; a.twitch = 1; a.speed = Math.max(sp, 1.5); break;
      case S_BURN: arms = 'flail'; a.twitch = 1.5; break;
      case S_GETUP: arms = 'hang'; break;
    }
    a.arms = arms;
    animateHumanoid(b, P, this.poser, a);
    this.finishPose(adt);
  }
  finishPose(dt) {
    const b = this.body;
    b.applyBlend(dt);
    // stump spurts
    const g = this.game;
    if (this.neckSpurt > 0) { this.neckSpurt -= dt; if (Math.random() < 0.7) g.fx.bloodSpurt(b.jx(J.CHEST), b.jy(J.CHEST) + 0.2, b.jz(J.CHEST), (Math.random() - 0.5) * 0.3, 1, (Math.random() - 0.5) * 0.3); }
    if (this.limbSpurt > 0) { this.limbSpurt -= dt; if (Math.random() < 0.5) g.fx.bloodSpurt(b.jx(this.spurtJoint), b.jy(this.spurtJoint), b.jz(this.spurtJoint), (Math.random() - 0.5), 0.3, (Math.random() - 0.5)); }
    this.dirty = true;
  }
}

// ======================================================================
export class InfectedManager {
  constructor(game) {
    this.game = game;
    this.crowd = new CrowdRenderer(game.scene, game.quality.maxCommons + game.quality.maxCorpses + 8);
    this.commons = []; // alive commons
    this.corpses = [];
    this.specials = [];
    this.pool = [];
    this.targets = [];
    this.hash = new Map();
    this.flowT = 0;
    this.outfit = 'civilian';
    this.lureActive = false;
    this.lurePos = new THREE.Vector3();
    this.lureRadius = 0;
    this.lureField = null;
    this.killCount = 0;
    this.maxCorpses = game.quality.maxCorpses;
  }
  get aliveCount() { return this.commons.length; }
  clear() {
    for (const c of this.commons) this.crowd.release(c.slot);
    for (const c of this.corpses) if (c.slot >= 0) this.crowd.release(c.slot);
    for (const s of this.specials) s.dispose?.();
    this.commons = [];
    this.corpses = [];
    this.specials = [];
    this.hash.clear();
  }
  flowField() {
    return this.game.level.nav.flow.cur;
  }
  spawnCommon(x, y, z, opts = {}) {
    if (this.commons.length >= this.game.quality.maxCommons) return null;
    if (this.corpses.length + this.commons.length >= this.crowd.cap - 2) this.removeOldestCorpse();
    const c = this.pool.pop() || new Common(this);
    if (!c.spawn(x, y, z, opts)) { this.pool.push(c); return null; }
    this.commons.push(c);
    return c;
  }
  removeOldestCorpse() {
    const c = this.corpses.shift();
    if (!c) return;
    this.crowd.release(c.slot);
    c.slot = -1;
    this.pool.push(c);
  }
  onKilled(c, h) {
    const i = this.commons.indexOf(c);
    if (i >= 0) this.commons.splice(i, 1);
    this.killCount++;
    const g = this.game;
    const att = h.attacker;
    if (att && att.stats) {
      att.stats.kills++;
      if (h.zone === 'head') att.stats.headshots++;
      if (h.kind === 'melee') att.stats.meleeKills++;
    }
    g.director?.onKill(c, h);
    g.onInfectedKilled?.(c, h);
    if (Math.random() < 0.7) g.audio.play('zDeath', { pos: c.pos, vol: 0.6 });
  }
  hearNoise(x, y, z, r, source) {
    const r2 = r * r;
    for (const c of this.commons) {
      if (c.state !== S_IDLE) continue;
      const dx = c.pos.x - x, dy = c.pos.y - y, dz = c.pos.z - z;
      const d2 = dx * dx + dy * dy * 4 + dz * dz;
      if (d2 > r2) continue;
      // through walls sound travels less
      if (d2 > r2 * 0.25 && !this.game.level.col.lineOfSight(x, y, z, c.pos.x, c.pos.y + 1.5, c.pos.z)) continue;
      c.alert(0.15 + Math.random() * 0.5);
    }
    for (const s of this.specials) s.hearNoise?.(x, y, z, r);
  }
  alertNeighbours(c, r) {
    this.forEachNear(c.pos.x, c.pos.z, r, (o) => {
      if (o !== c && !o.dead && !o.special && o.state === S_IDLE) o.alert(0.2 + Math.random() * 0.6, c.target);
    });
  }
  lure(x, y, z, r) {
    if (!this.lureActive || this.lurePos.distanceToSquared(_v.set(x, y, z)) > 1) {
      this.lurePos.set(x, y, z);
      const nav = this.game.level.nav;
      // compute a local field towards the lure (bounded)
      const f = new Float32Array(nav.N).fill(1e9);
      const n = nav.nearestNode(x, y, z, 3);
      if (n >= 0) {
        nav.heap.clear();
        f[n] = 0;
        nav.heap.push(n, 0);
        nav._dijkstra(f, nav.heap, 60000, false, r + 10);
      }
      this.lureField = f;
    }
    this.lureActive = true;
    this.lureRadius = r;
    this.lureTime = 0.3;
    for (const c of this.commons) {
      if (c.pos.distanceTo(this.lurePos) < r && c.state !== S_LURED && c.state !== S_BURN && c.state !== S_STUMBLE && !(c.target && c.target.bile > 0)) {
        if (c.state === S_IDLE) c.alert(0.1);
        else { c.state = S_LURED; c.stateT = 0; }
      }
    }
  }
  bileAt(x, y, z, r, dur) {
    // a bile jar acts as a long-lived lure
    this.lure(x, y, z, 30);
    this.lureTime = dur;
    for (const c of this.commons) {
      if (c.pos.distanceTo(this.lurePos) < r) { c.biled = dur; c.body.bloodAmt = 1; }
    }
  }
  corpseImpulse(x, y, z, r, power) {
    for (const c of this.corpses) {
      if (!c.ragdoll) continue;
      const d = Math.hypot(c.pos.x - x, c.pos.z - z);
      if (d > r) continue;
      const k = 1 - d / r;
      c.ragdoll.asleep = false;
      c.ragdoll.sleep = 0;
      c.ragdoll.age = Math.min(c.ragdoll.age, 6);
      c.ragdoll.impulseAll((c.pos.x - x) / (d || 1) * power * k, power * 0.6 * k, (c.pos.z - z) / (d || 1) * power * k);
    }
  }
  // Direct steering allowed when a clear walkable straight line exists.
  directOK(c, t) {
    const nav = this.game.level.nav;
    // cache per agent for a short time
    c.directCache = c.directCache || { t: -1, ok: false };
    if (this.game.time - c.directCache.t < 0.3) return c.directCache.ok;
    const ok = nav.walkable(c.pos.x, c.pos.y, c.pos.z, t.pos.x, t.pos.y, t.pos.z);
    c.directCache.t = this.game.time;
    c.directCache.ok = ok;
    return ok;
  }

  buildHash() {
    const h = this.hash;
    for (const arr of h.values()) arr.length = 0;
    const add = (e) => {
      const k = (Math.floor(e.pos.x / 2) + 5000) * 10000 + (Math.floor(e.pos.z / 2) + 5000);
      let a = h.get(k);
      if (!a) { a = []; h.set(k, a); }
      a.push(e);
    };
    for (const c of this.commons) add(c);
    for (const c of this.corpses) if (c.ragdoll && !c.gibbed) add(c);
    for (const s of this.specials) if (!s.removed) add(s);
  }
  forEachNear(x, z, r, fn) {
    const x0 = Math.floor((x - r) / 2), x1 = Math.floor((x + r) / 2);
    const z0 = Math.floor((z - r) / 2), z1 = Math.floor((z + r) / 2);
    for (let cx = x0; cx <= x1; cx++) {
      for (let cz = z0; cz <= z1; cz++) {
        const a = this.hash.get((cx + 5000) * 10000 + (cz + 5000));
        if (!a) continue;
        for (let i = 0; i < a.length; i++) {
          const e = a[i];
          const dx = e.pos.x - x, dz = e.pos.z - z;
          if (dx * dx + dz * dz <= r * r) fn(e);
        }
      }
    }
  }

  // Ray vs all infected bodies (alive, specials and ragdoll corpses).
  traceBodies(ox, oy, oz, dx, dy, dz, maxT, out) {
    const test = (e) => {
      const b = e.body;
      if (!b || !b.visible) return;
      // broadphase sphere around chest/pelvis
      const cx = (b.jx(J.PELVIS) + b.jx(J.CHEST)) * 0.5, cy = (b.jy(J.PELVIS) + b.jy(J.CHEST)) * 0.5, cz = (b.jz(J.PELVIS) + b.jz(J.CHEST)) * 0.5;
      const br = 1.25 * b.scale * (e.hitScale || 1);
      const ts = raySphere(ox, oy, oz, dx, dy, dz, cx, cy, cz, br);
      if (ts < 0 || ts > maxT) return;
      let best = -1, bt = 1e9;
      const j = b.j;
      const hs = e.hitScale || 1;
      for (let p = 0; p < PARTS.length; p++) {
        if (b.severed & (1 << p)) continue;
        const [, ja, jb, rad] = PARTS[p];
        let ax = j[ja * 3], ay = j[ja * 3 + 1], az = j[ja * 3 + 2];
        let bx = j[jb * 3], by = j[jb * 3 + 1], bz = j[jb * 3 + 2];
        let r = rad * b.scale * hs;
        if (p === 1) { // head sphere
          const t = raySphere(ox, oy, oz, dx, dy, dz, bx, by + 0.04 * b.scale, bz, 0.13 * b.scale * (e.headScale || 1));
          if (t >= 0 && t < bt) { bt = t; best = p; }
          continue;
        }
        if (p === 0) r *= b.build * (e.torsoScale || 1);
        const t = rayCapsule(ox, oy, oz, dx, dy, dz, ax, ay, az, bx, by, bz, r);
        if (t >= 0 && t < bt) { bt = t; best = p; }
      }
      if (best >= 0 && bt <= maxT) out.push({ ent: e, t: bt, part: best, zone: PARTS[best][4].replace(/[LR]$/, (m) => m) });
    };
    // Coarse filter by segment AABB via hash cells along the ray
    const len = Math.min(maxT, 150);
    const steps = Math.ceil(len / 2);
    const seen = this._seen || (this._seen = new Set());
    seen.clear();
    for (let i = 0; i <= steps; i++) {
      const t = (i / steps) * len;
      const px = ox + dx * t, pz = oz + dz * t;
      const cx = Math.floor(px / 2), cz = Math.floor(pz / 2);
      for (let ax = -1; ax <= 1; ax++) {
        for (let az = -1; az <= 1; az++) {
          const k = (cx + ax + 5000) * 10000 + (cz + az + 5000);
          if (seen.has(k)) continue;
          seen.add(k);
          const a = this.hash.get(k);
          if (a) for (const e of a) test(e);
        }
      }
    }
  }

  update(dt) {
    const g = this.game;
    const nav = g.level.nav;
    // targets (survivors that can be attacked)
    this.targets.length = 0;
    for (const s of g.survivors) if (!s.dead) this.targets.push(s);
    // flow field refresh
    const flow = nav.flow;
    this.flowT -= dt;
    if (!flow.building && this.flowT <= 0) {
      this.flowT = 0.35;
      const src = [];
      for (const s of this.targets) {
        const n = nav.nearestNode(s.pos.x, s.pos.y, s.pos.z, 2);
        if (n >= 0) src.push(n);
      }
      flow.start(src);
    }
    flow.step(g.quality.flowBudget);
    // lure decay
    if (this.lureActive) {
      this.lureTime -= dt;
      if (this.lureTime <= 0) this.lureActive = false;
    }
    this.buildHash();
    for (let i = this.commons.length - 1; i >= 0; i--) {
      const c = this.commons[i];
      c.update(dt);
    }
    for (let i = this.specials.length - 1; i >= 0; i--) {
      const s = this.specials[i];
      s.update(dt);
      if (s.removed) this.specials.splice(i, 1);
    }
    // corpses
    let active = 0;
    for (let i = this.corpses.length - 1; i >= 0; i--) {
      const c = this.corpses[i];
      if (c.ragdoll && !c.ragdoll.asleep) {
        active++;
        if (active > g.quality.maxRagdolls) c.ragdoll.asleep = true; // freeze extras
      }
      c.update(dt);
      if (c.poolT > 0 && c.ragdoll) {
        c.poolT -= dt;
        if (c.poolT <= 0 && !c.gibbed) {
          const b = c.body;
          const px = b.jx(J.CHEST), py = b.jy(J.CHEST), pz = b.jz(J.CHEST);
          const gy = g.level.col.groundHeight(px, py + 0.3, pz, 1.5);
          if (gy > -1e8) g.decals.add(px, gy + 0.005, pz, 0, 1, 0, 1.1 + Math.random() * 0.6, DF.POOL, { grow: 6 });
        }
      }
      // cull far corpses & over limit
      if (c.gibbed && c.deadT > 3) { this.crowd.release(c.slot); c.slot = -1; this.corpses.splice(i, 1); this.pool.push(c); continue; }
    }
    while (this.corpses.length > this.maxCorpses) this.removeOldestCorpse();
    // separation + survivor blocking
    this.separate(dt);
    // write render matrices
    for (const c of this.commons) if (c.dirty) { this.crowd.writeBody(c.slot, c.body); c.dirty = false; }
    for (const c of this.corpses) if (c.dirty && c.slot >= 0) { this.crowd.writeBody(c.slot, c.body); c.dirty = false; }
  }

  separate(dt) {
    const g = this.game;
    const R = 0.34;
    for (const c of this.commons) {
      if (c.climb || c.falling) continue;
      let px = 0, pz = 0;
      this.forEachNear(c.pos.x, c.pos.z, R * 2, (o) => {
        if (o === c || o.dead || o.climb || o.falling) return;
        if (Math.abs(o.pos.y - c.pos.y) > 1) return;
        const dx = c.pos.x - o.pos.x, dz = c.pos.z - o.pos.z;
        let d = Math.hypot(dx, dz);
        const rr = R + (o.radius || R) - 0.05;
        if (d < rr) {
          if (d < 1e-4) { px += Math.random() - 0.5; pz += Math.random() - 0.5; return; }
          const k = (rr - d) / d * 0.5;
          px += dx * k; pz += dz * k;
        }
      });
      for (const s of g.survivors) {
        if (s.dead) continue;
        const dx = c.pos.x - s.pos.x, dz = c.pos.z - s.pos.z;
        if (Math.abs(s.pos.y - c.pos.y) > 1.2) continue;
        const d = Math.hypot(dx, dz);
        const rr = R + 0.3;
        if (d < rr && d > 1e-4) {
          const k = (rr - d) / d;
          px += dx * k * 0.8; pz += dz * k * 0.8;
          // crowd pushes survivors a little
          if (!s.incapped && !s.pinned) { s.phys.x -= dx * k * 0.15; s.phys.z -= dz * k * 0.15; s.pos.x = s.phys.x; s.pos.z = s.phys.z; }
        }
      }
      if (px || pz) {
        const pl = Math.hypot(px, pz);
        const mx = Math.min(pl, 3 * dt + 0.02);
        c.moveOnNav(px / pl * mx, pz / pl * mx);
      }
    }
  }

  // Remove commons far behind the survivors that are out of sight (director recycling).
  cullFar(maxDist = 70) {
    const g = this.game;
    for (let i = this.commons.length - 1; i >= 0; i--) {
      const c = this.commons[i];
      let near = false;
      for (const s of this.targets) {
        if (s.pos.distanceTo(c.pos) < maxDist) { near = true; break; }
      }
      if (!near) {
        this.commons.splice(i, 1);
        this.crowd.release(c.slot);
        c.slot = -1;
        this.pool.push(c);
      }
    }
  }
}

export { S_IDLE, S_CHASE };
