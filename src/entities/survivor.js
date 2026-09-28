// Survivor: shared state + simulation for human players and bots.
// Movement physics, health / temporary health / incapacitation / revive,
// inventory (primary, secondary, throwable, medkit, pills), actions
// (heal, revive, use, throw, shove) and damage handling.
import * as THREE from 'three';
import { Weapon } from '../combat/weapon.js';
import { WEAPONS, THROWABLES } from '../combat/weaponDefs.js';
import { clamp, damp, lerp, randRange, pick } from '../core/math.js';

export const EYE_STAND = 1.62, EYE_CROUCH = 1.05, EYE_INCAP = 0.42;

export function newCmd() {
  return {
    mx: 0, my: 0, jump: false, crouch: false, sprint: false,
    fire: false, firePressed: false, shove: false, shoveHeld: false, reload: false, use: false, usePressed: false,
    zoom: false, slot: -1, lastWeapon: false, flashlight: false, drop: false,
  };
}

let SID = 0;
export class Survivor {
  constructor(game, char, opts = {}) {
    this.id = SID++;
    this.game = game;
    this.char = char;
    this.name = char.name;
    this.isHuman = !!opts.human;
    this.isBot = !opts.human;
    this.pos = new THREE.Vector3();
    this.phys = { x: 0, y: 0, z: 0, vx: 0, vy: 0, vz: 0, r: 0.36, h: 1.8, onGround: false, step: 0.46 };
    this.yaw = 0;
    this.pitch = 0;
    this.aimPitchOff = 0; // recoil climb (real aim offset)
    this.aimYawOff = 0;
    this.punchP = 0; // visual punch
    this.punchY = 0;
    this.cmd = newCmd();
    this.reset(true);
  }

  reset(full = false) {
    this.health = 100;
    this.temp = 0;
    this.incapped = false;
    this.incapHP = 300;
    this.incapCount = 0;
    this.dead = false;
    this.usingMounted = null;
    this.pinned = null;
    this.pinType = null;
    this.action = null;
    this.stamina = 1;
    this.crouchT = 0;
    this.crouching = false;
    this.bile = 0;
    this.burning = 0;
    this.slowT = 0;
    this.shoveCd = 0;
    this.shoveFatigue = 0;
    this.flashlight = true;
    this.hurtT = 0;
    this.lastHurtBy = null;
    this.lastDamageTime = -100;
    this.fallStartY = null;
    this.stunT = 0;
    this.knockT = 0;
    this.revivedBy = null;
    this.reviving = null;
    this.beingRevived = null;
    this.ledge = null;
    if (full) {
      this.inv = {
        primary: null,
        secondary: new Weapon('pistol'),
        throwable: null,
        medkit: false,
        pills: null,
      };
      this.slot = 1;
      this.lastSlot = 0;
      this.stats = { kills: 0, headshots: 0, specials: 0, ffDealt: 0, ffTaken: 0, dmgTaken: 0, incaps: 0, revives: 0, heals: 0, shots: 0, hits: 0, meleeKills: 0 };
    }
  }

  get alive() { return !this.dead; }
  get able() { return !this.dead && !this.incapped && !this.pinned; }
  get totalHealth() { return this.health + this.temp; }
  get blackAndWhite() { return this.incapCount >= 2; }
  get eyeHeight() {
    if (this.incapped) return EYE_INCAP;
    return lerp(EYE_STAND, EYE_CROUCH, this.crouchT);
  }
  eye(out = new THREE.Vector3()) {
    return out.set(this.pos.x, this.pos.y + this.eyeHeight, this.pos.z);
  }
  aimDir(out = new THREE.Vector3()) {
    const p = this.pitch + this.aimPitchOff, y = this.yaw + this.aimYawOff;
    const cp = Math.cos(p);
    return out.set(-Math.sin(y) * cp, Math.sin(p), -Math.cos(y) * cp);
  }
  get weapon() {
    if (this.usingMounted) return this.usingMounted.weapon;
    if (this.slot === 0) return this.inv.primary;
    if (this.slot === 1) return this.inv.secondary;
    return null;
  }
  get activeItem() {
    switch (this.slot) {
      case 0: return this.inv.primary ? this.inv.primary.type : null;
      case 1: return this.inv.secondary.type;
      case 2: return this.inv.throwable;
      case 3: return this.inv.medkit ? 'medkit' : null;
      case 4: return this.inv.pills;
    }
    return null;
  }
  hasSlot(s) {
    if (s === 0) return !!this.inv.primary;
    if (s === 1) return true;
    if (s === 2) return !!this.inv.throwable;
    if (s === 3) return this.inv.medkit;
    if (s === 4) return !!this.inv.pills;
    return false;
  }
  selectSlot(s) {
    if (s === this.slot || !this.hasSlot(s) || this.action) return false;
    if (this.incapped && s !== 1) return false;
    const w = this.weapon;
    if (w) { w.cancelReload(); w.zoomed = false; }
    this.lastSlot = this.slot;
    this.slot = s;
    const nw = this.weapon;
    if (nw) nw.drawT = nw.def.melee ? 0.45 : nw.def.kind === 'pistol' ? 0.35 : 0.6;
    this.drawT = 0.4;
    this.onEvent?.('draw', s);
    return true;
  }
  bestSlot() {
    if (this.inv.primary && (this.inv.primary.clip > 0 || this.inv.primary.reserve > 0)) return 0;
    return 1;
  }

  // ---------------------------------------------------------------- update --
  update(dt) {
    if (this.dead) return;
    const g = this.game;
    const c = this.cmd;
    this.hurtT = Math.max(0, this.hurtT - dt);
    this.slowT = Math.max(0, this.slowT - dt);
    this.shoveCd = Math.max(0, this.shoveCd - dt);
    this.shoveFatigue = Math.max(0, this.shoveFatigue - dt * 0.9);
    this.drawT = Math.max(0, (this.drawT || 0) - dt);
    this.stunT = Math.max(0, this.stunT - dt);
    if (this.bile > 0) this.bile -= dt;
    // temp health decay (L4D ~0.27/s)
    if (this.temp > 0) this.temp = Math.max(0, this.temp - dt * 0.27 * (g.settings?.tempDecay ?? 1));
    // Crouch smoothing
    const wantCrouch = (c.crouch && this.able) || false;
    this.crouching = wantCrouch;
    this.crouchT = damp(this.crouchT, wantCrouch ? 1 : 0, 12, dt);
    this.phys.h = this.incapped ? 0.7 : lerp(1.8, 1.2, this.crouchT);

    const netLocal = this.netLocal && g.net?.client; // co-op client: host owns health/actions
    if (this.incapped && !netLocal) this._updateIncap(dt);
    if (this.burning > 0) {
      this.burning -= dt;
      this.takeDamage(dt * 8, null, 'fire', true);
    }

    this._move(dt);

    if (this.dead) return;
    // Mounted gun: all input goes to the turret
    if (this.usingMounted) {
      const m = this.usingMounted;
      const canFire = m.control(this, dt);
      if (this.usingMounted) {
        const fire = c.fire;
        c.fire = canFire;
        m.weapon.update(dt, this, c, (wp) => g.combat.fireWeapon(this, wp));
        c.fire = fire;
        this.aimPitchOff *= 0.9;
        return;
      }
    }
    // Actions & weapons
    if (!this.pinned && this.stunT <= 0) {
      if (c.flashlight) { this.flashlight = !this.flashlight; this.onEvent?.('flashlight'); }
      if (c.slot >= 0 && !this.action) this.selectSlot(c.slot);
      if (c.lastWeapon && !this.action) this.selectSlot(this.lastSlot);
      if (!netLocal) this._updateAction(dt);
      if (!this.action) {
        if (c.shove && !this.incapped) this.shove();
        const w = this.weapon;
        if (w && !this.shoving) {
          if (c.zoom && w.def.zoom) { w.zoomed = !w.zoomed; this.onEvent?.('zoom', w.zoomed); }
          w.update(dt, this, c, (wp, kind) => {
            if (kind === 'melee') g.combat.melee(this, wp);
            else g.combat.fireWeapon(this, wp);
          });
        } else if (!w && !this.incapped && this.slot >= 2 && !netLocal) {
          this._updateItemUse(dt);
        }
      }
    }
    this.shoving = Math.max(0, (this.shoving || 0) - dt);
    // Recoil recovery
    const w = this.weapon;
    const rr = w ? w.def.recoilRecover ?? 8 : 8;
    const firingRecently = w && performance.now() - w.lastFire < 120;
    if (!firingRecently) {
      this.aimPitchOff = damp(this.aimPitchOff, 0, rr * 0.5, dt);
      this.aimYawOff = damp(this.aimYawOff, 0, rr * 0.5, dt);
    }
    this.punchP = damp(this.punchP, 0, 14, dt);
    this.punchY = damp(this.punchY, 0, 14, dt);
    // hazard volumes
    const lv = g.level;
    if (lv) {
      for (const h of lv.hazards) {
        if (h.on && lv.inBox(h.box, this.pos)) {
          if (h.type === 'fire') { if (this.burning <= 0) this.burning = 0.1; this.takeDamage(h.dps * dt, null, 'fire', true); }
          else this.takeDamage(h.dps * dt, null, h.type, true);
        }
      }
      for (const k of lv.killZones) if (lv.inBox(k, this.pos)) { this.die('fall'); return; }
    }
  }

  _move(dt) {
    const g = this.game;
    const c = this.cmd;
    const P = this.phys;
    let maxSpeed = 4.4;
    let wantX = 0, wantZ = 0;
    const canMove = !this.incapped && !this.pinned && this.stunT <= 0 && !(this.action && this.action.immobile) && !this.usingMounted;
    if (canMove) {
      const fx = -Math.sin(this.yaw), fz = -Math.cos(this.yaw);
      const rx = Math.cos(this.yaw), rz = -Math.sin(this.yaw);
      let mx = c.mx, my = c.my;
      const ml = Math.hypot(mx, my);
      if (ml > 1) { mx /= ml; my /= ml; }
      wantX = rx * mx + fx * my;
      wantZ = rz * mx + fz * my;
      const sprinting = c.sprint && my > 0.3 && this.stamina > 0.05 && !this.crouching && this.phys.onGround && !this.action;
      this.sprinting = sprinting;
      if (this.crouching) maxSpeed = 1.9;
      else if (sprinting) maxSpeed = 6.3;
      if (sprinting) this.stamina = Math.max(0, this.stamina - dt * 0.2);
      else this.stamina = Math.min(1, this.stamina + dt * (Math.hypot(mx, my) > 0.1 ? 0.12 : 0.22));
      if (this.totalHealth < 40 && !this.game.cheats?.god) maxSpeed *= this.totalHealth <= 1 ? 0.55 : 0.75;
      if (this.slowT > 0) maxSpeed *= 0.5;
      const w = this.weapon;
      if (w) maxSpeed *= w.def.moveMult ?? 1;
      if (w && w.zoomed) maxSpeed *= 0.6;
      if (this.action && this.action.slow) maxSpeed *= this.action.slow;
      if (this.bile > 0) maxSpeed *= 0.95;
    } else this.sprinting = false;
    const tvx = wantX * maxSpeed, tvz = wantZ * maxSpeed;
    if (P.onGround) {
      const accel = (wantX || wantZ) ? 42 : 30;
      const dvx = tvx - P.vx, dvz = tvz - P.vz;
      const dl = Math.hypot(dvx, dvz);
      const step = accel * dt;
      if (dl <= step) { P.vx = tvx; P.vz = tvz; }
      else { P.vx += (dvx / dl) * step; P.vz += (dvz / dl) * step; }
      if (canMove && c.jump && !this.crouching && this.jumpCd <= 0) {
        P.vy = 5.2;
        P.onGround = false;
        this.jumpCd = 0.35;
        this.onEvent?.('jump');
      }
    } else {
      // air control
      P.vx += (tvx - P.vx) * Math.min(1, dt * 1.6);
      P.vz += (tvz - P.vz) * Math.min(1, dt * 1.6);
    }
    this.jumpCd = (this.jumpCd || 0) - dt;
    // external knockback velocity (tank punches etc.)
    if (this.knock) {
      P.vx += this.knock.x; P.vz += this.knock.z; P.vy = Math.max(P.vy, this.knock.y);
      P.onGround = false;
      this.knock = null;
    }
    if (this.pinned && this.pinnedMove) {
      // pinned movement is driven by the special (dragging)
      P.vx = this.pinnedMove.x; P.vz = this.pinnedMove.z;
    }
    P.vy -= 16 * dt;
    if (P.vy < -40) P.vy = -40;
    const wasGround = P.onGround;
    const prevY = P.y;
    const col = g.level.col;
    // moving platform carry
    if (P.onGround && P.groundDyn && P.groundDyn.vel) {
      P.x += P.groundDyn.vel[0] * dt; P.y += P.groundDyn.vel[1] * dt; P.z += P.groundDyn.vel[2] * dt;
    }
    col.moveBody(P, dt);
    // fall damage
    if (!P.onGround && wasGround) this.fallStartY = prevY;
    if (!P.onGround && this.fallStartY != null && P.y > this.fallStartY) this.fallStartY = P.y;
    if (P.onGround && !wasGround) {
      const drop = this.fallStartY != null ? this.fallStartY - P.y : 0;
      this.fallStartY = null;
      this.onEvent?.('land', drop);
      if (drop > 4.5 && !this.game.cheats?.god) {
        const dmg = drop > 12 ? 999 : (drop - 4.5) * 14;
        this.takeDamage(dmg, null, 'fall');
      }
    }
    this.pos.set(P.x, P.y, P.z);
  }

  _updateIncap(dt) {
    if (this.pinned) return;
    if (this.beingRevived) return;
    this.incapHP -= dt * (this.game.settings?.bleedRate ?? 3);
    if (this.incapHP <= 0) this.die('bleed');
  }

  // ---------------------------------------------------------------- actions --
  shove() {
    if (this.shoveCd > 0 || this.action || this.incapped) return;
    const fat = this.shoveFatigue;
    this.shoveCd = fat > 3 ? 1.0 : fat > 2 ? 0.7 : 0.45;
    this.shoveFatigue += 1;
    this.shoving = 0.35;
    const w = this.weapon;
    if (w) w.cancelReload();
    this.onEvent?.('shove');
    this.game.combat.shove(this);
  }

  startAction(type, dur, opts = {}) {
    this.action = Object.assign({ type, t: 0, dur, immobile: false }, opts);
    const w = this.weapon;
    if (w) w.cancelReload();
    this.onEvent?.('actionStart', this.action);
  }
  cancelAction() {
    if (!this.action) return;
    const a = this.action;
    if (a.target) { a.target.beingRevived = null; a.target.beingHealed = null; }
    this.action = null;
    this.onEvent?.('actionCancel', a);
  }
  _updateAction(dt) {
    const a = this.action;
    if (!a) return;
    const c = this.cmd;
    // Holding requirement
    const held = a.hold === 'fire' ? c.fire : a.hold === 'shove' ? c.shoveHeld : a.hold === 'use' ? c.use : true;
    if (!held || this.pinned || (this.incapped && a.type !== 'selfRevive')) { this.cancelAction(); return; }
    if (a.target) {
      const t = a.target;
      const d = t.pos.distanceTo(this.pos);
      if (d > 2.4 || t.dead || (a.type === 'revive' && !t.incapped) || (a.type !== 'revive' && t.pinned)) { this.cancelAction(); return; }
    }
    a.t += dt;
    if (a.t >= a.dur) {
      this.action = null;
      this._completeAction(a);
    }
  }
  _completeAction(a) {
    const g = this.game;
    switch (a.type) {
      case 'heal': {
        const t = a.target || this;
        t.heal(0.8);
        this.inv.medkit = false;
        if (this.slot === 3) this.selectSlot(this.bestSlot());
        this.stats.heals++;
        if (a.target) { a.target.beingHealed = null; }
        g.onHeal?.(this, t);
        break;
      }
      case 'revive': {
        const t = a.target;
        t.beingRevived = null;
        t.revive();
        this.stats.revives++;
        g.onRevive?.(this, t);
        break;
      }
      case 'pills': {
        const t = a.target || this;
        const amt = this.inv.pills === 'adrenaline' ? 25 : 50;
        t.temp = Math.min(100 - t.health, t.temp + amt);
        if (this.inv.pills === 'adrenaline') t.adrenaline = 15;
        this.inv.pills = null;
        if (this.slot === 4) this.selectSlot(this.bestSlot());
        g.onPills?.(this, t);
        break;
      }
      case 'use': {
        if (a.usable && a.usable.onUse) a.usable.onUse(this);
        break;
      }
    }
    this.onEvent?.('actionDone', a);
  }
  // Items in slots 2..4
  _updateItemUse(dt) {
    const c = this.cmd;
    const g = this.game;
    if (this.slot === 2 && this.inv.throwable) {
      if (c.firePressed && !this.throwing) {
        this.throwing = 0.001;
        this.onEvent?.('throwWindup');
      }
      if (this.throwing) {
        this.throwing += dt;
        if (this.throwing > 0.35 && !c.fire) {
          const type = this.inv.throwable;
          this.inv.throwable = null;
          this.throwing = 0;
          g.combat.throwItem(this, type);
          this.onEvent?.('throw', type);
          this.selectSlot(this.bestSlot());
        }
      }
    } else if (this.slot === 3 && this.inv.medkit) {
      if (c.fire) {
        if (this.health >= 100) return;
        this.startAction('heal', 5, { hold: 'fire', immobile: true });
      } else if (c.shoveHeld) {
        const t = g.combat.lookedAtSurvivor(this, 1.8);
        if (t && !t.incapped && t.health < 100) {
          this.startAction('heal', 5, { hold: 'shove', immobile: true, target: t });
          t.beingHealed = this;
        }
      }
    } else if (this.slot === 4 && this.inv.pills) {
      if (c.firePressed) this.startAction('pills', 0.8, { hold: null, slow: 0.7 });
      else if (c.shove) {
        const t = g.combat.lookedAtSurvivor(this, 2);
        if (t && !t.inv.pills && !t.incapped) {
          t.inv.pills = this.inv.pills;
          this.inv.pills = null;
          this.selectSlot(this.bestSlot());
          g.onGive?.(this, t, 'pills');
        }
      }
    }
  }

  // ---------------------------------------------------------------- health --
  heal(frac) {
    const missing = 100 - this.health;
    this.health = Math.min(100, this.health + missing * frac);
    this.temp = 0;
    this.incapCount = 0;
    this.burning = 0;
  }
  takeDamage(amount, attacker = null, type = 'generic', silent = false) {
    if (this.dead || amount <= 0) return;
    if (this.game.cheats?.godAll || (this.game.cheats?.god && this.isHuman)) return;
    this.lastDamageTime = this.game.time;
    this.lastHurtBy = attacker;
    this.stats.dmgTaken += amount;
    if (this.incapped) {
      this.incapHP -= amount;
      if (this.incapHP <= 0) this.die(type);
      if (!silent) this.onEvent?.('hurt', { amount, attacker, type });
      return;
    }
    // temp health absorbs first
    const fromTemp = Math.min(this.temp, amount);
    this.temp -= fromTemp;
    amount -= fromTemp;
    this.health -= amount;
    this.hurtT = 0.3;
    if (!silent) this.onEvent?.('hurt', { amount: amount + fromTemp, attacker, type });
    if (this.health + this.temp <= 0) {
      this.health = 0;
      this.temp = 0;
      if (type === 'fall' && amount > 150) this.die('fall');
      else this.incap(type);
    }
  }
  incap(cause) {
    if (this.incapped || this.dead) return;
    if (this.game.cheats?.godAll || (this.game.cheats?.god && this.isHuman)) return;
    if (this.incapCount >= 2) { this.die(cause); return; }
    this.incapped = true;
    this.incapHP = 300;
    this.health = 0;
    this.temp = 0;
    this.stats.incaps++;
    this.cancelAction();
    if (this.slot !== 1) this.selectSlotForce(1);
    const w = this.inv.secondary;
    if (w.melee) {
      // melee users pull a pistol when down
      this._meleeStash = w;
      this.inv.secondary = new Weapon('pistol');
      this.slot = 1;
    }
    this.phys.vx = this.phys.vz = 0;
    this.onEvent?.('incap', cause);
    this.game.onIncap?.(this, cause);
  }
  selectSlotForce(s) {
    this.lastSlot = this.slot;
    this.slot = s;
  }
  revive() {
    this.incapped = false;
    this.incapCount++;
    this.health = 1;
    this.temp = 29;
    this.incapHP = 300;
    if (this._meleeStash) { this.inv.secondary = this._meleeStash; this._meleeStash = null; }
    this.onEvent?.('revived');
  }
  die(cause) {
    if (this.dead) return;
    this.dead = true;
    this.incapped = false;
    this.health = 0;
    this.temp = 0;
    this.cancelAction();
    if (this.pinned && this.pinned.release) this.pinned.release();
    this.pinned = null;
    this.onEvent?.('death', cause);
    this.game.onSurvivorDeath?.(this, cause);
  }
  // Respawn at chapter start (dead survivors come back with 50 hp)
  respawnForChapter() {
    if (this.dead) {
      this.reset(true);
      this.health = 50;
    } else if (this.incapped) {
      this.incapped = false;
      this.health = 30;
    }
    this.pinned = null;
    this.action = null;
    this.beingRevived = null;
    this.bile = 0;
    this.burning = 0;
    // temp health converts partially at chapter transitions
    if (this.temp > 0) { this.temp = Math.min(this.temp, 100 - this.health); }
  }
  teleport(x, y, z, yaw) {
    const P = this.phys;
    P.x = x; P.y = y; P.z = z; P.vx = P.vy = P.vz = 0;
    this.pos.set(x, y, z);
    if (yaw != null) this.yaw = yaw;
    this.pitch = 0;
  }
  giveWeapon(type, opts = {}) {
    const def = WEAPONS[type];
    if (!def) return false;
    if (def.slot === 0) {
      this.inv.primary = new Weapon(type, opts);
      this.selectSlotForce(0);
      this.inv.primary.drawT = 0.6;
    } else if (def.slot === 1) {
      if (type === 'pistol' && this.inv.secondary.type === 'pistol' && !this.inv.secondary.dual) {
        this.inv.secondary.dual = true;
        this.inv.secondary.clip = this.inv.secondary.maxClip;
      } else {
        this.inv.secondary = new Weapon(type, opts);
      }
      this.selectSlotForce(1);
      this.inv.secondary.drawT = 0.5;
    }
    this.onEvent?.('draw', this.slot);
    return true;
  }
}

export { pick, randRange, clamp };
