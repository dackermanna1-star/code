// The player: movement, camera feel, melee combat state machine, blocking/parrying, dodging,
// kicking, consumables, abilities, inventory and progression.
import * as THREE from 'three';
import { ViewModel, arcDir } from './viewmodel.js';
import { computeStats } from '../items/stats.js';
import { WEAPONS, RELICS, CLASSES, BOONS, ABILITIES, CONSUMABLES } from '../items/data.js';
import { makeWeapon, makeArmor } from '../items/loot.js';
import { clamp, damp, lerp, noise1, rand, easeInOutCubic } from '../core/math.js';
import { traceRay, playerHitsEnemy, explode, chainLightning } from '../game/combat.js';
import { TILE } from '../world/constants.js';
import { C } from '../world/constants.js';

const _v = new THREE.Vector3();
const _v2 = new THREE.Vector3();
const _fwd = new THREE.Vector3();
const _right = new THREE.Vector3();
const _q = new THREE.Quaternion();
const _e = new THREE.Euler(0, 0, 0, 'YXZ');
const EYE = 1.62;
const RADIUS = 0.38;

export class Player {
  constructor(game, classId, rng) {
    this.game = game;
    this.audio = game.audio;
    this.input = game.input;
    this.camera = game.renderer.camera;
    this.vm = new ViewModel(game.renderer);
    this.pos = new THREE.Vector3();
    this.vel = new THREE.Vector3();
    this.yaw = 0;
    this.pitch = 0;
    this.onGround = true;
    this.radius = RADIUS;
    this.dead = false;
    this.time = 0;

    // inventory
    const cls = CLASSES[classId] || CLASSES.wanderer;
    this.classId = classId;
    this.hpMod = cls.hpMod || 0;
    this.weapons = [makeWeapon(rng, cls.weapon, 0, 1, cls.unique || null), null];
    if (!cls.unique) this.weapons[0].name = { sword: 'Rusty Sword', dagger: 'Chipped Dagger', hammer: 'Iron Maul', spear: 'Old Spear' }[cls.weapon] || this.weapons[0].name;
    this.weaponIdx = 0;
    this.armor = makeArmor(rng, cls.armor || 'leather', 0, 1);
    this.trinkets = [null, null];
    this.relics = {};
    this.relicOrder = [];
    this.boons = [];
    this.buffs = {};
    this.potions = cls.potions ?? 2;
    this.bombs = cls.bombs ?? 1;
    this.elixirs = [];
    this.keys = 0;
    this.gold = 0;
    this.ability = cls.ability ? { id: cls.ability, cd: 0 } : null;
    this.xp = 0;
    this.level = 1;
    this.xpNext = 25;
    for (const r of cls.relics || []) this.addRelic(r, true);

    this.stats = computeStats(this);
    this.hp = this.stats.maxHp;
    this.stamina = this.stats.maxStamina;
    this.staminaDelay = 0;
    this.vm.setWeapon(this.weapon);

    // combat state
    this.atk = { state: 'idle', t: 0, move: null, dur: null, theta: 0, prevTheta: 0, hitSet: new Set(), hits: 0, combo: 0, comboWindow: 0, buffered: false, pressAge: 0, holding: false, charge: 0, heavy: false, bounced: false, attackCount: 0 };
    this.blocking = false;
    this.blockStart = 0;
    this.dodgeT = -1;
    this.dodgeDir = new THREE.Vector3();
    this.dodgeSide = 0;
    this.iframes = 0;
    this.dodgeCd = 0;
    this.dodgeCritReady = 0;
    this.kickT = -1;
    this.kickCd = 0;
    this.drinkT = -1;
    this.throwT = -1;
    this.healPool = 0;
    this.stun = 0;
    this.interactCd = 0;
    this.abilityState = null;

    // camera feel
    this.trauma = 0;
    this.bob = 0;
    this.bobAmt = 0;
    this.landDip = 0;
    this.kickRot = new THREE.Vector3();
    this.kickRotVel = new THREE.Vector3();
    this.fovKick = 0;
    this.roll = 0;
    this.lastStep = 0;
    this.lookDX = 0;
    this.lookDY = 0;
    this.lastSafe = new THREE.Vector3();
    this.safeTimer = 0;
    this.heartbeat = 0;
    this.deathT = 0;
    this.orbit = [];
    this.orbitHit = new Map();
    this.hurtFlash = 0;
    this.burnT = 0;
  }

  get weapon() {
    return this.weapons[this.weaponIdx];
  }

  refreshStats() {
    const oldMax = this.stats.maxHp;
    this.stats = computeStats(this);
    if (this.stats.maxHp > oldMax) this.hp += this.stats.maxHp - oldMax;
    this.hp = Math.min(this.hp, this.stats.maxHp);
    this.stamina = Math.min(this.stamina, this.stats.maxStamina);
    this._syncOrbit();
  }

  spawnAt(x, z, yaw = 0) {
    this.pos.set(x, 0, z);
    this.vel.set(0, 0, 0);
    this.yaw = yaw;
    this.pitch = 0;
    this.lastSafe.copy(this.pos);
    this._syncOrbit();
  }

  // ------------------------------------------------------------ inventory
  equip(item) {
    // returns the item that was displaced (to drop on the floor) or null
    let old = null;
    if (item.kind === 'weapon') {
      if (!this.weapons[1]) {
        this.weapons[1] = item;
        this.weaponIdx = 1;
      } else {
        old = this.weapons[this.weaponIdx];
        this.weapons[this.weaponIdx] = item;
      }
      this.vm.swap(item);
    } else if (item.kind === 'armor') {
      old = this.armor;
      this.armor = item;
    } else if (item.kind === 'trinket') {
      const slot = this.trinkets[0] ? (this.trinkets[1] ? 0 : 1) : 0;
      old = this.trinkets[slot];
      this.trinkets[slot] = item;
    } else if (item.kind === 'ability') {
      if (this.ability) old = { kind: 'ability', id: this.ability.id, name: `Tome: ${ABILITIES[this.ability.id].name}`, rarity: 2, uid: Math.random() };
      this.ability = { id: item.id, cd: 0 };
    }
    this.audio.equip();
    this.refreshStats();
    return old;
  }

  addRelic(id, silent = false) {
    this.relics[id] = (this.relics[id] || 0) + 1;
    if (!this.relicOrder.includes(id)) this.relicOrder.push(id);
    const R = RELICS[id];
    if (R && R.onPickup) R.onPickup(this);
    this.refreshStats && this.stats && this.refreshStats();
    if (!silent && this.game.ui) this.game.ui.relicBanner(id);
  }

  addBombs(n) {
    this.bombs = Math.min(9, this.bombs + n);
  }

  addBuff(id, dur, stats, maxStacks = 1) {
    const b = this.buffs[id];
    if (b) {
      b.t = dur;
      if (b.stacks < maxStacks) {
        b.stacks++;
        b.stats = Object.fromEntries(Object.entries(stats).map(([k, v]) => [k, v * b.stacks]));
      }
    } else this.buffs[id] = { t: dur, max: dur, stats: { ...stats }, stacks: 1 };
    this.refreshStats();
  }

  applyBoon(boon) {
    this.boons.push(boon);
    if (boon.potion) this.potions++;
    if (boon.relic) {
      const r = this.game.rollRelicId();
      this.addRelic(r);
    }
    this.refreshStats();
    if (boon.heal) this.hp = this.stats.maxHp;
  }

  gainXp(n) {
    this.xp += n;
    while (this.xp >= this.xpNext) {
      this.xp -= this.xpNext;
      this.level++;
      this.xpNext = Math.round(25 * Math.pow(1.32, this.level - 1));
      this.game.queueLevelUp();
    }
  }

  heal(n, quiet = false) {
    if (this.dead || n <= 0) return;
    const before = this.hp;
    this.hp = Math.min(this.stats.maxHp, this.hp + n);
    if (!quiet && this.hp - before >= 1) this.game.fx.numbers.add(this.camera.position.clone().add(_v.set(0, -0.3, 0).applyQuaternion(this.camera.quaternion)).addScaledVector(this.forward(_v2), 1.2), `+${Math.round(this.hp - before)}`, 'heal');
  }

  forward(out = new THREE.Vector3()) {
    return out.set(0, 0, -1).applyQuaternion(this.camera.quaternion);
  }

  eyePos(out = new THREE.Vector3()) {
    return out.set(this.pos.x, this.pos.y + EYE, this.pos.z);
  }

  chestPos(out = new THREE.Vector3()) {
    return out.set(this.pos.x, this.pos.y + 1.2, this.pos.z);
  }

  horizSpeed() {
    return Math.hypot(this.vel.x, this.vel.z);
  }

  addTrauma(t) {
    this.trauma = Math.min(1, this.trauma + t);
  }

  camKick(pitch, yaw, roll = 0) {
    this.kickRotVel.x += pitch;
    this.kickRotVel.y += yaw;
    this.kickRotVel.z += roll;
  }

  // ------------------------------------------------------------ damage intake
  takeDamage(info) {
    const game = this.game;
    if (this.dead || game.godMode) return { blocked: false, damage: 0 };
    if (this.iframes > 0 && !info.unavoidable) {
      if (info.source && info.source.melee) game.fx.numbers.add(this.chestPos().addScaledVector(this.forward(_v), 1), 'DODGE', 'dodge');
      return { dodged: true, damage: 0 };
    }
    const s = this.stats;
    const fwd = this.forward(_fwd).setY(0).normalize();
    const facing = info.dir ? -(info.dir.x * fwd.x + info.dir.z * fwd.z) / (Math.hypot(info.dir.x, info.dir.z) || 1) : 1;
    const attacker = info.attacker || null;
    if (this.blocking && !info.unblockable && facing > 0.25) {
      const since = this.time - this.blockStart;
      if (since <= s.parryWindow && !info.noParry) {
        // PARRY
        const p = this.eyePos(_v).addScaledVector(fwd, 0.7);
        p.y -= 0.25;
        game.fx.sparks(p, _v2.copy(fwd).negate().add(new THREE.Vector3(0, 0.4, 0)).normalize(), 40, 0xfff0a0, 9);
        game.renderer.flash(p, 0xfff2c0, 30, 8, 0.25);
        this.audio.parry(p);
        this.vm.parry();
        this.addTrauma(0.3);
        game.post.flash = 0.35;
        game.slowmo(0.25, 0.3 + s.parrySlow * 0.35);
        this.stamina = Math.min(s.maxStamina, this.stamina + 15);
        game.stats.parries++;
        game.fx.numbers.add(p.clone().add(new THREE.Vector3(0, 0.4, 0)), 'PARRY!', 'parry big');
        if (attacker && attacker.parried) attacker.parried(game);
        if (info.projectile) info.projectile.reflect(game);
        if (s.parryNova) {
          game.fx.ring(this.pos, 0xffe080, 4.5, 0.4, 0.9);
          for (const e of game.level.enemies) {
            if (e.dead || e.pos.distanceTo(this.pos) > 4.5) continue;
            const d = _v.subVectors(e.pos, this.pos).setY(0).normalize().clone();
            playerHitsEnemy(game, e, { base: s.weaponDamage * 1.2, dir: d, knockback: 8, stagger: 60, point: e.chestPos(), source: 'player', melee: false });
          }
        }
        return { parried: true, damage: 0 };
      }
      // BLOCK
      const cost = info.amount * 1.3 * (1 - s.blockEff) + 5;
      const p = this.eyePos(_v).addScaledVector(fwd, 0.6);
      p.y -= 0.3;
      if (this.stamina >= cost || s.infiniteStamina) {
        if (!s.infiniteStamina) this.stamina -= cost;
        this.staminaDelay = 0.6;
        game.fx.sparks(p, _v2.copy(fwd).negate().setY(0.3).normalize(), 14, 0xffd080, 6);
        this.audio.block(p);
        this.vm.blockHit(1);
        this.addTrauma(0.15);
        if (info.dir) this.vel.addScaledVector(_v2.copy(info.dir).setY(0).normalize(), 3.5 * (info.knock ? 1.5 : 1));
        const chip = Math.round(info.amount * 0.12);
        if (chip > 0) this._applyDamage(chip, info, true);
        if (info.projectile && s.reflect) info.projectile.reflect(game);
        return { blocked: true, damage: chip };
      }
      // guard break
      this.stamina = 0;
      this.staminaDelay = 1.2;
      this.blocking = false;
      this.stun = 0.7;
      this.audio.clang(p, 0.7, 1.2);
      game.fx.sparks(p, fwd.clone().negate(), 24, 0xffaa60, 7);
      game.fx.numbers.add(p, 'GUARD BREAK', 'neg big');
      this.vm.hurt(1.5);
      this._applyDamage(Math.round(info.amount * 0.6), info);
      return { blocked: false, guardBreak: true };
    }
    const dmg = this._applyDamage(info.amount, info);
    if (attacker && s.thorns && info.melee && !attacker.dead) {
      const t = Math.max(1, Math.round(info.amount * s.thorns));
      attacker.takeDamage(game, { amount: t, dir: _v.subVectors(attacker.pos, this.pos).normalize().clone(), knockback: 2, stagger: 10, point: attacker.chestPos(), source: 'reflect' });
      game.fx.numbers.add(attacker.headPos(), String(t), 'thorns');
    }
    return { damage: dmg };
  }

  _applyDamage(amount, info, chip = false) {
    if (this.dead) return 0;
    const game = this.game;
    const s = this.stats;
    let dmg = amount * (1 - s.armor) * s.damageTaken;
    if (this.buffs.iron) dmg *= 0.6;
    dmg = Math.max(1, Math.round(dmg));
    this.hp -= dmg;
    game.stats.damageTaken += dmg;
    game.onPlayerHurt(dmg);
    if (!chip) {
      this.audio.playerHurt(Math.min(1.5, dmg / 15));
      this.vm.hurt(Math.min(1.5, 0.5 + dmg / 20));
      this.addTrauma(Math.min(0.6, 0.18 + dmg / 50));
      const side = info.dir ? Math.sign(info.dir.x * Math.cos(this.yaw) - info.dir.z * Math.sin(this.yaw)) : 0;
      this.camKick(0.6, side * 0.4, side * 0.8);
      this.hurtFlash = Math.min(1, 0.4 + dmg / 30);
      if (info.dir && info.knock) {
        this.vel.x += info.dir.x * info.knock;
        this.vel.z += info.dir.z * info.knock;
        if (info.knock > 6) this.vel.y = Math.max(this.vel.y, 3);
      }
      // a bit of our own blood
      if (game.fx.gore > 0 && dmg > 4) {
        const p = this.eyePos(_v).addScaledVector(this.forward(_v2), 0.5);
        p.y -= 0.5;
        game.fx.blood(p, new THREE.Vector3(rand(-1, 1), 0.5, rand(-1, 1)).normalize(), 0.4);
      }
    }
    if (this.hp <= 0) {
      if (s.revive && this.relics.phoenix) {
        this.relics.phoenix--;
        if (!this.relics.phoenix) { delete this.relics.phoenix; this.relicOrder = this.relicOrder.filter((r) => r !== 'phoenix'); }
        this.refreshStats();
        this.hp = Math.round(this.stats.maxHp * 0.5);
        this.iframes = 2;
        game.fx.levelUp(this.pos);
        game.fx.explosion(this.chestPos(), 3, 0xffaa33);
        explode(game, this.chestPos(), 4, 40 + game.floor * 10, { hurtsPlayer: false, color: 0xffaa33, fire: true });
        game.ui.banner('PHOENIX REBIRTH', 'The feather burns away...');
        this.audio.relic();
        return dmg;
      }
      this.hp = 0;
      this.die(info);
    }
    return dmg;
  }

  die(info) {
    this.dead = true;
    this.deathT = 0;
    this.blocking = false;
    this.audio.death();
    this.game.onPlayerDeath(info);
  }

  // ------------------------------------------------------------ main update
  update(dt, realDt) {
    const input = this.input;
    this.time += dt;
    const game = this.game;
    // ---- look (uses real time so hitstop never eats mouse input)
    const [mdx, mdy] = input.active ? input.consumeMouse() : [0, 0];
    const sens = 0.0022 * (this.atk.state === 'charge' ? 0.75 : 1);
    if (!this.dead) {
      this.yaw -= mdx * sens;
      this.pitch -= mdy * sens * (game.settings.invertY ? -1 : 1);
      if (input.action('turnLeft')) this.yaw += 2.4 * realDt;
      if (input.action('turnRight')) this.yaw -= 2.4 * realDt;
      this.pitch = clamp(this.pitch, -1.45, 1.45);
    }
    this.lookDX = damp(this.lookDX, mdx / Math.max(realDt, 0.001) * 0.016, 20, realDt);
    this.lookDY = damp(this.lookDY, mdy / Math.max(realDt, 0.001) * 0.016, 20, realDt);

    if (this.dead) {
      this._deathCam(dt);
      return;
    }
    if (dt <= 0) { this._updateCamera(realDt, 0); return; }

    const s = this.stats;
    // ---- timers
    this.iframes = Math.max(0, this.iframes - dt);
    this.dodgeCd = Math.max(0, this.dodgeCd - dt);
    this.kickCd = Math.max(0, this.kickCd - dt);
    this.stun = Math.max(0, this.stun - dt);
    this.interactCd = Math.max(0, this.interactCd - dt);
    this.dodgeCritReady = Math.max(0, this.dodgeCritReady - dt);
    this.hurtFlash = Math.max(0, this.hurtFlash - dt * 2.5);
    if (this.ability && this.ability.cd > 0) this.ability.cd = Math.max(0, this.ability.cd - dt);
    let buffsChanged = false;
    for (const k in this.buffs) {
      this.buffs[k].t -= dt;
      if (this.buffs[k].t <= 0) { delete this.buffs[k]; buffsChanged = true; }
    }
    if (buffsChanged) this.refreshStats();
    if (this.buffs.poisoned) {
      this.poisonT = (this.poisonT ?? 0.8) - dt;
      if (this.poisonT <= 0) {
        this.poisonT = 0.8;
        this._applyDamage(1 + Math.ceil(this.game.floor * 0.5), { type: 'poison' }, true);
      }
    }
    if (this.buffs.burning) {
      this.burnT -= dt;
      if (this.burnT <= 0) {
        this.burnT = 0.5;
        this._applyDamage(2 + this.game.floor, { type: 'fire' }, true);
      }
      if (Math.random() < 0.3) this.game.fx.fire(this.chestPos(_v).addScaledVector(this.forward(_v2), 0.4), 0.5, 0.3);
    }

    // ---- regen
    if (this.healPool > 0) {
      const h = Math.min(this.healPool, dt * this.stats.maxHp * 0.5);
      this.healPool -= h;
      this.hp = Math.min(s.maxHp, this.hp + h);
    }
    if (s.regen) this.hp = Math.min(s.maxHp, this.hp + s.regen * dt);
    this.staminaDelay -= dt;
    if (s.infiniteStamina) this.stamina = s.maxStamina;
    else if (this.staminaDelay <= 0) this.stamina = Math.min(s.maxStamina, this.stamina + s.staminaRegen * dt * (this.blocking ? 0.35 : 1));

    // low health heartbeat
    if (this.hp / s.maxHp < 0.3) {
      this.heartbeat -= dt;
      if (this.heartbeat <= 0) { this.audio.heartbeat(1 - this.hp / s.maxHp); this.heartbeat = 0.85; }
    }

    this._movement(dt);
    this._combat(dt);
    this._consumables(dt);
    this._updateOrbit(dt);
    this._updateCamera(realDt, dt);
  }

  // ------------------------------------------------------------ movement
  _movement(dt) {
    const game = this.game;
    const world = game.world;
    const input = this.input;
    const s = this.stats;
    let ix = 0, iz = 0;
    if (input.active || input.lockFailed) {
      if (input.action('forward')) iz -= 1;
      if (input.action('back')) iz += 1;
      if (input.action('left')) ix -= 1;
      if (input.action('right')) ix += 1;
    }
    const il = Math.hypot(ix, iz);
    if (il > 0) { ix /= il; iz /= il; }
    const sy = Math.sin(this.yaw), cy = Math.cos(this.yaw);
    // world-space wish direction
    const wx = ix * cy + iz * sy;
    const wz = -ix * sy + iz * cy;

    // dodge
    if (input.actionPressed('dodge') && this.dodgeT < 0 && this.dodgeCd <= 0 && this.stun <= 0 && (this.stamina >= s.dodgeCost * 0.5 || s.infiniteStamina)) {
      const canCancel = !(this.atk.state === 'swing' && this.atk.t / this.atk.dur[1] < 0.5);
      if (canCancel) {
        if (il > 0) this.dodgeDir.set(wx, 0, wz);
        else this.dodgeDir.set(sy, 0, cy); // backwards
        this.dodgeSide = il > 0 ? ix : 0;
        this.dodgeT = 0;
        this.iframes = 0.32;
        this.dodgeCd = 0.38;
        if (!s.infiniteStamina) { this.stamina -= s.dodgeCost; this.staminaDelay = 0.55; }
        this.fovKick += 9;
        this.audio.dodge();
        this.dodgeCritReady = s.dodgeCrit ? 1.0 : 0;
        if (this.atk.state !== 'idle' && this.atk.state !== 'swing') this._resetAttack();
        this.blocking = false;
        if (this.drinkT >= 0 && this.drinkT < 0.4) { this.drinkT = -1; this.vm.left = null; this.vm.potion.visible = false; }
        game.fx.dust(_v.set(this.pos.x, this.pos.y + 0.1, this.pos.z), 3, 0x6a6058, 0.3);
      }
    }

    const water = world.isWater(this.pos.x, this.pos.z) && this.pos.y < 0.3;
    let speed = s.moveSpeed;
    if (this.blocking) speed *= 0.5;
    if (this.atk.state === 'charge') speed *= 0.55;
    else if (this.atk.state === 'swing' || this.atk.state === 'windup') speed *= 0.8;
    if (this.drinkT >= 0) speed *= 0.55;
    if (water) speed *= 0.82;
    if (this.stun > 0) speed *= 0.3;

    if (this.dodgeT >= 0) {
      this.dodgeT += dt;
      const f = this.dodgeT / 0.26;
      if (f >= 1) { this.dodgeT = -1; }
      else {
        const sp = 15.5 * (1 - f * f) + 2;
        this.vel.x = this.dodgeDir.x * sp;
        this.vel.z = this.dodgeDir.z * sp;
      }
    } else {
      const accel = this.onGround ? 13 : 2.5;
      this.vel.x = damp(this.vel.x, wx * speed, accel, dt);
      this.vel.z = damp(this.vel.z, wz * speed, accel, dt);
    }

    // jump
    if (input.actionPressed('jump') && this.onGround && this.stun <= 0) {
      this.vel.y = 6.2;
      this.onGround = false;
      this.audio.jump();
    }
    this.vel.y -= 22 * dt;
    const prevY = this.pos.y;
    this.pos.addScaledVector(this.vel, dt);

    // collisions
    world.collideCircle(this.pos, RADIUS);
    game.level.collideObstacles(this.pos, RADIUS);
    for (const e of game.level.enemies) {
      if (e.dead || e.flying) continue;
      const dx = this.pos.x - e.pos.x, dz = this.pos.z - e.pos.z;
      const rr = RADIUS + e.radius;
      const d2 = dx * dx + dz * dz;
      if (d2 < rr * rr && Math.abs(this.pos.y - e.pos.y) < 1.5) {
        const d = Math.sqrt(d2) || 0.01;
        const push = (rr - d);
        const share = e.def.mass > 2 ? 0.85 : 0.5;
        this.pos.x += (dx / d) * push * share;
        this.pos.z += (dz / d) * push * share;
        e.pos.x -= (dx / d) * push * (1 - share);
        e.pos.z -= (dz / d) * push * (1 - share);
      }
    }
    world.collideCircle(this.pos, RADIUS);
    game.physics.pushFrom(this.pos.x, this.pos.y, this.pos.z, RADIUS, this.vel.x, this.vel.z, this.dodgeT >= 0 ? 2 : 1);
    game.level.pushCorpses(this.pos, RADIUS, this.vel);

    // floor / ceiling
    const fy = world.floorAt(this.pos.x, this.pos.z);
    const wasGround = this.onGround;
    if (this.pos.y <= fy && (prevY >= fy - 0.4 || fy === 0)) {
      if (!wasGround && this.vel.y < -4) {
        const p = Math.min(1, -this.vel.y / 14);
        this.landDip = Math.min(0.3, p * 0.3);
        this.audio.land(p);
        if (this.vel.y < -12 && fy === 0) this._applyDamage(Math.round((-this.vel.y - 12) * 4), { type: 'fall' });
      }
      this.pos.y = fy;
      this.vel.y = Math.max(0, this.vel.y);
      this.onGround = true;
    } else {
      this.onGround = this.pos.y <= fy + 0.01;
    }
    const ceil = world.ceilAt(this.pos.x, this.pos.z);
    if (this.pos.y + 1.8 > ceil) { this.pos.y = ceil - 1.8; this.vel.y = Math.min(0, this.vel.y); }

    // pits & lava
    const cell = world.cellAt(this.pos.x, this.pos.z);
    if (cell === C.PIT && this.pos.y < -1.6) this._fallOut('pit');
    else if (cell === C.LAVA && this.pos.y <= fy + 0.05) this._fallOut('lava');
    if (this.onGround && cell === C.FLOOR) {
      this.safeTimer += dt;
      if (this.safeTimer > 0.3 && this._safeSpot()) { this.lastSafe.copy(this.pos); this.safeTimer = 0; }
    }

    // footsteps & bob
    const hs = this.horizSpeed();
    this.bobAmt = damp(this.bobAmt, this.onGround ? Math.min(1, hs / 5.5) : 0, 10, dt);
    if (this.onGround && hs > 0.5) {
      this.bob += dt * hs * 1.85;
      if (Math.floor(this.bob / Math.PI) !== this.lastStep) {
        this.lastStep = Math.floor(this.bob / Math.PI);
        this.audio.footstep(water ? 'water' : 'stone', Math.min(1, hs / 5));
        if (water) game.fx.puff(_v.set(this.pos.x, 0.15, this.pos.z), _v2.set(0, 0.6, 0), 0x88bbcc, 0.5, 0.2, 0.6, 0.3);
      }
    }
  }

  _safeSpot() {
    const w = this.game.world;
    for (const [dx, dz] of [[0.8, 0], [-0.8, 0], [0, 0.8], [0, -0.8]]) {
      const c = w.cellAt(this.pos.x + dx, this.pos.z + dz);
      if (c === C.PIT || c === C.LAVA) return false;
    }
    return true;
  }

  _fallOut(kind) {
    const game = this.game;
    if (kind === 'lava') {
      game.fx.explosion(this.pos.clone().setY(-0.3), 1.2, 0xff6020);
      this.audio.fire(this.pos, true);
    }
    const dmg = Math.round(this.stats.maxHp * (kind === 'lava' ? 0.22 : 0.15) + 5);
    this.pos.copy(this.lastSafe);
    this.vel.set(0, 0, 0);
    this.iframes = 0;
    this._applyDamage(dmg, { type: kind });
    this.iframes = 1.0;
    game.ui.toast(kind === 'lava' ? 'Scorched by lava!' : 'You fell into a spike pit!', 'neg');
  }

  // ------------------------------------------------------------ combat
  _resetAttack() {
    const a = this.atk;
    a.state = 'idle';
    a.t = 0;
    a.buffered = false;
    a.charge = 0;
    a.heavy = false;
  }

  _moveDurations(move, heavy) {
    const sp = this.stats.attackSpeed * (this.buffs.rage ? 1.3 : 1);
    return move.t.map((x, i) => (heavy && i === 0 ? x : x / sp));
  }

  _startAttack(heavy = false, charge = 0) {
    const a = this.atk;
    const W = this.stats.weaponDef;
    const move = heavy ? W.heavy : W.combo[a.combo % W.combo.length];
    a.move = move;
    a.heavy = heavy;
    a.charge = charge;
    a.dur = this._moveDurations(move, heavy);
    a.hitSet = new Set();
    a.hits = 0;
    a.bounced = false;
    a.t = 0;
    a.state = heavy ? 'swing' : 'windup';
    if (heavy) this._beginSwing();
  }

  _beginSwing() {
    const a = this.atk;
    const s = this.stats;
    const W = s.weaponDef;
    a.state = 'swing';
    a.t = 0;
    a.theta = a.prevTheta = a.move.kind === 'thrust' ? 0 : a.move.from;
    const cost = (a.heavy ? W.stamina * 1.8 : W.stamina);
    if (!s.infiniteStamina) {
      this.stamina -= cost;
      this.staminaDelay = 0.5;
    }
    this.audio.swing(W.weight * (a.heavy ? 1.4 : 1), a.heavy ? 0.85 : 1);
    a.attackCount++;
    // lunge
    const lunge = a.move.lunge || (a.heavy ? 3.5 : 1.6);
    const f = this.forward(_v).setY(0).normalize();
    this.vel.x += f.x * lunge;
    this.vel.z += f.z * lunge;
    if (a.heavy) { this.fovKick += 4; this.camKick(-0.25, 0, 0); }
    // knife fan
    if (s.knifeFan && a.attackCount % 4 === 0) this.game.throwKnives(3);
  }

  _combat(dt) {
    const input = this.input;
    const a = this.atk;
    const s = this.stats;
    const game = this.game;
    const lmbPressed = input.mouse.pressed[0] && input.active;
    const lmbDown = input.mouse.buttons[0] && input.active;
    const rmbDown = input.mouse.buttons[2] && input.active;
    const busy = this.drinkT >= 0 || this.throwT >= 0 || this.stun > 0 || this.abilityState;

    if (a.comboWindow > 0) { a.comboWindow -= dt; if (a.comboWindow <= 0) a.combo = 0; }

    // blocking
    const canBlock = !busy && (a.state === 'idle' || (a.state === 'recover' && a.t > a.dur[2] * 0.25) || a.state === 'block');
    if (rmbDown && canBlock && this.dodgeT < 0) {
      if (!this.blocking) { this.blocking = true; this.blockStart = this.time; }
      a.state = 'block';
    } else if (this.blocking && (!rmbDown || busy)) {
      this.blocking = false;
      if (a.state === 'block') a.state = 'idle';
    }

    if (lmbPressed) { a.pressAge = 0; a.holding = true; }
    if (a.holding) { a.pressAge += dt; if (!lmbDown) a.holding = false; }

    switch (a.state) {
      case 'idle':
      case 'block': {
        if (lmbPressed && !busy && (this.stamina > 2 || s.infiniteStamina)) {
          if (this.blocking) { this.blocking = false; }
          this._startAttack(false);
        }
        break;
      }
      case 'windup': {
        a.t += dt;
        if (a.holding && a.pressAge >= 0.2 && (this.stamina > 5 || s.infiniteStamina)) {
          a.state = 'charge';
          a.t = 0;
          a.charge = 0;
          a.move = s.weaponDef.heavy;
          this.audio.ui('hover');
        } else if (a.t >= a.dur[0] && (!a.holding || a.pressAge >= 0.2)) {
          this._beginSwing();
        }
        break;
      }
      case 'charge': {
        a.t += dt;
        a.charge = Math.min(1, (a.t * s.chargeSpeed) / 0.65);
        if (a.charge >= 1 && !a.fullCharged) {
          a.fullCharged = true;
          this.audio.clang(null, 1.6, 0.4, 0.3);
          this.addTrauma(0.08);
        }
        if (!lmbDown || a.t > 3) {
          a.fullCharged = false;
          const charge = a.charge;
          a.combo = 0;
          this._startAttack(true, charge);
        }
        break;
      }
      case 'swing': {
        a.t += dt;
        const prog = Math.min(1, a.t / a.dur[1]);
        a.prevTheta = a.theta;
        if (a.move.kind !== 'thrust') {
          const e = prog < 0.5 ? 2 * prog * prog : 1 - Math.pow(-2 * prog + 2, 2) / 2;
          a.theta = a.move.from + (a.move.to - a.move.from) * e;
        }
        this._sweep(prog);
        if (lmbPressed) a.buffered = true;
        if (a.state === 'swing' && prog >= 1) {
          a.state = 'recover';
          a.t = 0;
          if (a.move.slam) this._slam(a.move.slam * (a.heavy ? 1 : 0.6));
          if (a.heavy && s.echoWave) game.spawnWave();
          if (a.heavy && s.unique.heavyFlame) game.flameCone();
        }
        break;
      }
      case 'recover': {
        a.t += dt;
        if (lmbPressed) a.buffered = true;
        const p = a.t / a.dur[2];
        if (a.buffered && p >= 0.3 && !busy) {
          a.combo = a.heavy ? 0 : a.combo + 1;
          a.buffered = false;
          this._startAttack(false);
        } else if (p >= 1) {
          a.state = 'idle';
          a.comboWindow = 0.45;
          if (!a.heavy) a.combo++;
          else a.combo = 0;
          a.heavy = false;
        }
        break;
      }
      case 'bounce': {
        a.t += dt;
        if (a.t > 0.28) { a.state = 'idle'; a.combo = 0; }
        break;
      }
      default:
    }

    // kick
    if (input.actionPressed('kick') && this.kickT < 0 && this.kickCd <= 0 && !busy && (a.state === 'idle' || a.state === 'block' || a.state === 'recover')) {
      this.kickT = 0;
      this.kickCd = 0.55;
      this.blocking = false;
      if (a.state === 'block') a.state = 'idle';
      if (!s.infiniteStamina) { this.stamina -= 10; this.staminaDelay = 0.5; }
      this.vm.kick();
      this.audio.kick(null, false);
      this.camKick(-0.12, 0, 0);
    }
    if (this.kickT >= 0) {
      const before = this.kickT;
      this.kickT += dt;
      if (before < 0.13 && this.kickT >= 0.13) this._doKick();
      if (this.kickT > 0.42) this.kickT = -1;
    }

    // ability
    if (input.actionPressed('ability') && this.ability && this.ability.cd <= 0 && !busy && a.state !== 'swing') {
      game.castAbility(this.ability.id);
      this.ability.cd = ABILITIES[this.ability.id].cd * (1 - s.cooldown);
    }

    // weapon swap
    if ((input.actionPressed('swap') || input.mouse.wheel !== 0) && this.weapons[1] && a.state === 'idle' && this.vm.swapT < 0) {
      this.weaponIdx = 1 - this.weaponIdx;
      this.vm.swap(this.weapon);
      this.refreshStats();
      this.audio.equip();
      a.combo = 0;
    }

    // viewmodel
    this.vm.update(dt, {
      state: a.state === 'bounce' ? 'bounce' : this.blocking ? 'block' : a.state,
      move: a.move || s.weaponDef.combo[0],
      progress: a.state === 'swing' ? Math.min(1, a.t / a.dur[1]) : a.state === 'recover' ? Math.min(1, a.t / a.dur[2]) : a.state === 'windup' ? Math.min(1, a.t / a.dur[0]) : 0,
      theta: a.theta,
      charge: a.charge,
      speed: this.bobAmt,
      bob: this.bob,
      lookDX: this.lookDX,
      lookDY: this.lookDY,
      onGround: this.onGround,
      dodge: this.dodgeT >= 0 ? this.dodgeT / 0.26 : 0,
      dodgeSide: this.dodgeSide,
    });
  }

  // Sweep the current arc segment for hits.
  _sweep(prog) {
    const a = this.atk;
    const s = this.stats;
    const game = this.game;
    const W = s.weaponDef;
    const eye = this.eyePos(new THREE.Vector3());
    const camQ = this.camera.quaternion;
    const reach = s.reach * (a.heavy ? 1.1 : 1);
    const maxHits = a.heavy ? W.cleave + 2 : W.cleave;
    const dirs = [];
    if (a.move.kind === 'thrust') {
      if (prog > 0.85 && a.thrustDone) return;
      a.thrustDone = prog > 0.85;
      for (const off of [0, -4, 4, -8, 8]) dirs.push(arcDir(off, 0, new THREE.Vector3()).applyQuaternion(camQ));
    } else {
      const from = a.prevTheta, to = a.theta;
      const steps = Math.max(1, Math.ceil(Math.abs(to - from) / 3));
      // the swing is a slab, not a line: extra rays either side of the swing plane forgive aim
      const r = a.move.roll * Math.PI / 180;
      const n = new THREE.Vector3(-Math.sin(r), Math.cos(r), 0);
      const thick = Math.tan((a.heavy ? 9 : 7) * Math.PI / 180);
      for (let i = 1; i <= steps; i++) {
        const th = from + ((to - from) * i) / steps;
        const d = arcDir(th, a.move.roll, new THREE.Vector3());
        dirs.push(d.clone().applyQuaternion(camQ));
        dirs.push(d.clone().addScaledVector(n, thick).normalize().applyQuaternion(camQ));
        dirs.push(d.clone().addScaledVector(n, -thick).normalize().applyQuaternion(camQ));
      }
    }
    const swingTan = new THREE.Vector3();
    if (a.move.kind === 'thrust') this.forward(swingTan);
    else {
      const sign = Math.sign(a.move.to - a.move.from);
      const t = a.theta * Math.PI / 180, r = a.move.roll * Math.PI / 180;
      swingTan.set(Math.cos(t) * Math.cos(r) * sign, Math.cos(t) * Math.sin(r) * sign, Math.sin(t) * sign).applyQuaternion(camQ).normalize();
    }
    let firstHit = false;
    for (const d of dirs) {
      if (a.hits >= maxHits && !W.pierce) break;
      const { hits, wall } = traceRay(game, eye, d, reach, a.heavy ? 0.28 : 0.2);
      for (const h of hits) {
        if (a.hitSet.has(h.target)) continue;
        if (a.hits >= maxHits && !(W.pierce && a.move.kind === 'thrust')) break;
        a.hitSet.add(h.target);
        if (h.target.isEnemy || h.target.isCorpse || h.target.isProp) a.hits += h.target.isEnemy ? 1 : 0;
        firstHit = this._applyMeleeHit(h, swingTan, prog) || firstHit;
        if (!W.pierce || a.move.kind !== 'thrust') { if (h.target.isEnemy && a.hits >= maxHits) break; }
      }
      // wall clank: only if the swing has not connected with anything and the wall is close
      if (wall && !a.bounced && a.hits === 0 && prog > 0.1 && prog < 0.9) {
        const physLen = 0.55 + (this.vm.weapon ? this.vm.weapon.length : 1) * 0.55;
        if (wall.dist < physLen) {
          a.bounced = true;
          const p = new THREE.Vector3(wall.x, wall.y, wall.z);
          const n = new THREE.Vector3(wall.nx, wall.ny, wall.nz);
          // secret walls take damage from strikes
          if (wall.cx !== undefined) game.level.hitWallCell(wall.cx, wall.cz, p, a.heavy ? 2 : 1);
          if (wall.obstacle && wall.obstacle.onHit) wall.obstacle.onHit(game, p);
          game.fx.sparks(p, n, 18, 0xffd890, 6);
          game.fx.dust(p, 2, 0x8a8070, 0.15);
          this.audio.wallHit(p);
          this.addTrauma(0.18);
          this.camKick(0.15, (Math.random() - 0.5) * 0.2, 0);
          this.vm.impact(Math.sign(a.move.to - a.move.from), 1.2);
          game.hitstop(0.05);
          if (!a.heavy) { a.state = 'bounce'; a.t = 0; }
          return;
        }
      }
    }
    if (firstHit) {
      const heavy = a.heavy;
      game.hitstop(heavy ? 0.1 : 0.055);
      this.addTrauma(heavy ? 0.32 : 0.14);
      const side = a.move.kind === 'thrust' ? 0 : Math.sign(a.move.to - a.move.from);
      this.camKick(heavy ? 0.12 : 0.04, -side * (heavy ? 0.16 : 0.07), -side * 0.1);
      this.vm.impact(side, heavy ? 1.4 : 0.7);
    }
  }

  _applyMeleeHit(h, swingTan, prog) {
    const game = this.game;
    const a = this.atk;
    const s = this.stats;
    const W = s.weaponDef;
    const t = h.target;
    const knockDir = _v.copy(swingTan).multiplyScalar(0.5).add(this.forward(_v2).multiplyScalar(0.8)).setY(0).normalize().clone();
    if (a.heavy) knockDir.y = a.move.overhead ? -0.1 : 0.35;
    if (t.isEnemy) {
      const mult = a.move.mult * (a.heavy ? (0.55 + 0.45 * a.charge) * s.heavyDamage : 1);
      const info = {
        base: s.weaponDamage * mult, dir: knockDir, point: h.point, swingDir: swingTan.clone(), heavy: a.heavy, melee: true, shieldBreak: !!s.weaponDef.shieldBreak,
        knockback: s.knockback * (a.heavy ? 1.9 + a.charge * 0.6 : 1) * (a.move.mult > 1.2 ? 1.3 : 1),
        stagger: s.stagger * (a.heavy ? 2.2 : 1) * a.move.mult, source: 'player', head: h.part === 'head',
        dismember: (W.dismember || 1) * (a.heavy ? 1.6 : 1), overhead: !!a.move.overhead,
      };
      const res = playerHitsEnemy(game, t, info);
      this.vm.addBlood(t.def.blood === 'blood' ? 0.15 : 0.05);
      if (s.echoHit && Math.random() < s.echoHit) {
        game.schedule(0.14, () => {
          if (t.dead) return;
          game.fx.magic(t.chestPos(), 0x9ab0ff, 10, 2);
          playerHitsEnemy(game, t, { ...info, base: info.base * 0.6, knockback: 1, stagger: 5, noLeech: true });
        });
      }
      return true;
    }
    if (t.isCorpse || t.isProp) {
      const power = s.knockback * (a.heavy ? 2.2 : 1);
      t.onMeleeHit(game, h, knockDir, power, a.heavy ? 3 : 1);
      return t.isProp ? t.solidHit : false;
    }
    return false;
  }

  _slam(power) {
    const game = this.game;
    const f = this.forward(_v).setY(0).normalize();
    const p = new THREE.Vector3(this.pos.x + f.x * 1.8, 0.05, this.pos.z + f.z * 1.8);
    if (game.world.solidAt(p.x, p.z)) return;
    game.fx.ring(p, 0xd8c8a8, power * 1.2, 0.35, 0.7);
    game.fx.dust(p, 8, 0x8a8070, 0.8);
    game.fx.debris(p, 'stone', 6, 3);
    this.audio.land(1.2);
    this.addTrauma(0.25 + power * 0.04);
    const r = power;
    const thunder = this.stats.unique.slamLightning && this.atk.heavy;
    for (const e of game.level.enemies) {
      if (e.dead || e.pos.distanceTo(p) > r) continue;
      if (thunder) {
        game.fx.lightning(e.chestPos().add(new THREE.Vector3(0, 6, 0)), e.chestPos(), 0xaaccff);
      }
      const d = _v.subVectors(e.pos, p).setY(0).normalize().clone();
      d.y = 0.7;
      playerHitsEnemy(game, e, { base: this.stats.weaponDamage * (thunder ? 1.2 : 0.4), dir: d.normalize(), knockback: 7, stagger: 50, point: e.chestPos(), source: 'player', melee: false, type: thunder ? 'shock' : 'phys' });
    }
    if (thunder) this.audio.zap(p);
  }

  _doKick() {
    const game = this.game;
    const s = this.stats;
    const eye = this.eyePos(new THREE.Vector3());
    eye.y -= 0.7;
    const hitSet = new Set();
    let any = false;
    const f = this.forward(new THREE.Vector3());
    for (const ang of [0, -18, 18, -32, 32]) {
      const d = arcDir(ang, 0, new THREE.Vector3()).applyQuaternion(this.camera.quaternion);
      d.y = Math.max(-0.3, d.y * 0.5);
      d.normalize();
      const { hits } = traceRay(game, eye, d, 2.1, 0.3);
      for (const h of hits) {
        if (hitSet.has(h.target)) continue;
        hitSet.add(h.target);
        any = true;
        const kd = new THREE.Vector3(f.x, 0, f.z).normalize();
        kd.y = 0.32;
        if (h.target.isEnemy) {
          const power = 11 * s.kickPower;
          playerHitsEnemy(game, h.target, { base: 4 * s.kickPower * (s.wallSlam ? 1.5 : 1), dir: kd, point: h.point, knockback: power, stagger: 70 * s.kickPower, kick: true, source: 'player', melee: false, wallSlam: s.wallSlam });
          h.target.kicked = 0.6;
        } else if (h.target.onKick) {
          h.target.onKick(game, h, kd, 12 * s.kickPower);
        } else if (h.target.onMeleeHit) {
          h.target.onMeleeHit(game, h, kd, 12 * s.kickPower, 2);
        }
      }
    }
    // doors are handled as level kick targets
    if (game.level.kickDoors(eye, f, s.kickPower)) any = true;
    if (any) {
      this.audio.kick(null, true);
      game.hitstop(0.06);
      this.addTrauma(0.2);
      this.camKick(0.1, 0, 0);
    }
  }

  // ------------------------------------------------------------ consumables
  _consumables(dt) {
    const input = this.input;
    const game = this.game;
    const a = this.atk;
    const ready = a.state === 'idle' || a.state === 'block';
    if (input.actionPressed('potion') && this.drinkT < 0 && ready) {
      if (this.potions <= 0) { game.ui.toast('No potions!', 'neg'); this.audio.ui('deny'); }
      else if (this.hp >= this.stats.maxHp) { game.ui.toast('Already at full health', 'neg'); }
      else {
        this.drinkT = 0;
        this.blocking = false;
        this.vm.drink(0.95);
      }
    }
    if (this.drinkT >= 0) {
      const before = this.drinkT;
      this.drinkT += dt;
      if (before < 0.4 && this.drinkT >= 0.4) {
        this.potions--;
        this.audio.potion();
        this.healPool += this.stats.maxHp * 0.45 * this.stats.potionPower;
        game.fx.magic(this.chestPos().addScaledVector(this.forward(_v), 0.6), 0xff4466, 14, 1.5);
        game.stats.potions++;
      }
      if (this.drinkT > 0.95) this.drinkT = -1;
    }
    if (input.actionPressed('throw') && this.throwT < 0 && ready && this.drinkT < 0) {
      if (this.bombs <= 0) { game.ui.toast('No bombs!', 'neg'); this.audio.ui('deny'); }
      else {
        this.throwT = 0;
        this.vm.throwItem();
      }
    }
    if (this.throwT >= 0) {
      const before = this.throwT;
      this.throwT += dt;
      if (before < 0.18 && this.throwT >= 0.18) {
        this.bombs--;
        game.throwBomb();
      }
      if (this.throwT > 0.4) this.throwT = -1;
    }
    if (input.actionPressed('slot3') && ready && this.elixirs.length) {
      const id = this.elixirs.shift();
      const C2 = CONSUMABLES[id];
      const stats = { rage: { damage: 0.4, attackSpeed: 0.4 }, iron: {}, swift: { moveSpeed: 0.35 } }[C2.buff];
      this.addBuff(C2.buff, C2.dur, stats);
      this.audio.potion();
      this.vm.drink(0.8);
      game.ui.toast(`${C2.name}!`, 'buff');
    }
  }

  // ------------------------------------------------------------ orbiting blades
  _syncOrbit() {
    const n = (this.stats && this.stats.orbitBlades) || 0;
    const scene = this.game.renderer.scene;
    while (this.orbit.length < n) {
      const m = new THREE.Mesh(new THREE.OctahedronGeometry(0.16, 0), new THREE.MeshBasicMaterial({ color: 0x9ab8ff, transparent: true, opacity: 0.85, blending: THREE.AdditiveBlending }));
      m.scale.set(0.5, 2.2, 0.5);
      scene.add(m);
      this.orbit.push(m);
    }
    while (this.orbit.length > n) this.orbit.pop().removeFromParent();
  }

  _updateOrbit(dt) {
    const n = this.orbit.length;
    if (!n) return;
    const game = this.game;
    for (const [e, t] of this.orbitHit) { if (t - dt <= 0) this.orbitHit.delete(e); else this.orbitHit.set(e, t - dt); }
    for (let i = 0; i < n; i++) {
      const a = this.time * 3.2 + (i / n) * Math.PI * 2;
      const m = this.orbit[i];
      m.position.set(this.pos.x + Math.cos(a) * 1.7, this.pos.y + 1.1, this.pos.z + Math.sin(a) * 1.7);
      m.rotation.set(Math.PI / 2, 0, -a);
      if (Math.random() < 0.3) game.fx.spark(m.position, new THREE.Vector3(), 0x9ab8ff, 0.25, 0.08, { grav: 0, floor: false });
      for (const e of game.level.enemies) {
        if (e.dead || this.orbitHit.has(e)) continue;
        if (e.pos.distanceTo(_v.set(m.position.x, e.pos.y, m.position.z)) < e.radius + 0.35 && Math.abs(e.pos.y + 1 - m.position.y) < 1.2) {
          this.orbitHit.set(e, 0.45);
          const d = _v.set(-Math.sin(a), 0.1, Math.cos(a)).clone();
          playerHitsEnemy(game, e, { base: this.stats.weaponDamage * 0.45, dir: d, point: m.position.clone(), knockback: 2.5, stagger: 10, source: 'player', melee: false });
          this.audio.hitFlesh(m.position, 0.4);
        }
      }
    }
  }

  // ------------------------------------------------------------ camera
  _updateCamera(realDt, dt) {
    const cam = this.camera;
    const settings = this.game.settings;
    // spring for camera kicks
    this.kickRotVel.addScaledVector(this.kickRot, -160 * realDt);
    this.kickRotVel.multiplyScalar(Math.exp(-14 * realDt));
    this.kickRot.addScaledVector(this.kickRotVel, realDt);
    this.trauma = Math.max(0, this.trauma - realDt * 1.5);
    this.landDip = damp(this.landDip, 0, 8, realDt);
    this.fovKick = damp(this.fovKick, 0, 6, realDt);
    const strafe = this.vel.x * Math.cos(this.yaw) - this.vel.z * Math.sin(this.yaw);
    const dodgeRoll = this.dodgeT >= 0 ? Math.sin((this.dodgeT / 0.26) * Math.PI) * -this.dodgeSide * 0.07 : 0;
    this.roll = damp(this.roll, -strafe * 0.004 + dodgeRoll, 10, realDt);

    const sh = this.trauma * this.trauma * (settings.shake ?? 1);
    const t = this.time * 22;
    const bobY = Math.sin(this.bob * 2) * 0.045 * this.bobAmt;
    const bobX = Math.sin(this.bob) * 0.03 * this.bobAmt;
    const sy = Math.sin(this.yaw), cy = Math.cos(this.yaw);
    cam.position.set(
      this.pos.x + cy * bobX + noise1(t) * 0.06 * sh,
      this.pos.y + EYE + bobY - this.landDip + noise1(t + 30) * 0.06 * sh - (this.kickT >= 0 ? Math.sin(Math.min(1, this.kickT / 0.42) * Math.PI) * 0.06 : 0),
      this.pos.z - sy * bobX + noise1(t + 60) * 0.06 * sh,
    );
    _e.set(
      this.pitch + this.kickRot.x * 0.12 + noise1(t + 90) * 0.035 * sh,
      this.yaw + this.kickRot.y * 0.12 + noise1(t + 120) * 0.035 * sh,
      this.roll + this.kickRot.z * 0.1 + noise1(t + 150) * 0.05 * sh,
      'YXZ',
    );
    cam.quaternion.setFromEuler(_e);
    const fov = (settings.fov || 78) + this.fovKick + (this.atk.state === 'charge' ? -this.atk.charge * 5 : 0);
    if (Math.abs(cam.fov - fov) > 0.05) { cam.fov = fov; cam.updateProjectionMatrix(); }
    this.game.audio.setListener(cam.position, this.yaw);
  }

  _deathCam(dt) {
    this.deathT += dt;
    const cam = this.camera;
    const f = Math.min(1, this.deathT / 1.2);
    const e = easeInOutCubic(f);
    cam.position.set(this.pos.x, this.pos.y + lerp(EYE, 0.3, e), this.pos.z);
    _e.set(lerp(this.pitch, 0.3, e), this.yaw, lerp(0, 1.3, e), 'YXZ');
    cam.quaternion.setFromEuler(_e);
    this.vm.root.visible = false;
  }
}

export { EYE, TILE, BOONS, WEAPONS };
