import * as THREE from 'three';
import { Fighter } from '../combat/fighter';
import { ClipEvent, getClip } from '../anim/clip';
import { HitInfo, HitResult } from '../combat/types';
import { ArchetypeCfg } from './archetypes';
import { ENEMY_ATTACKS, EnemyAttack } from '../combat/moves';
import { angleDiff, chance, clamp, damp, pick, rand, weightedPick, wrapAngle, yawFromDir } from '../core/math';
import { Ragdoll } from '../world/ragdoll';
import { B } from '../anim/skeleton';
import type { Game } from '../game';
import type { CharacterLibrary, Variant } from '../character/library';
import { Weapon } from '../combat/weapons';

export type EnemyState =
  | 'enter' | 'circle' | 'approach' | 'attack' | 'recover' | 'react' | 'stunned' | 'down' | 'getup' | 'paired' | 'dodge' | 'block' | 'taunt' | 'retreat' | 'grabbed';

const _v = new THREE.Vector3();

export class Enemy extends Fighter {
  team = 'enemy' as const;
  declare state: EnemyState;
  cfg: ArchetypeCfg;
  // brain
  token = false;
  tokenDelay = 0;
  attackDef: EnemyAttack | null = null;
  attackCombo = 0;
  attackCooldown = rand(1, 2.5);
  orbitDir = Math.random() < 0.5 ? -1 : 1;
  orbitTimer = rand(1.5, 4);
  ringR = rand(2.6, 4.2);
  enterX = 0;
  enterZ = 0;
  stunT = 0;
  downRag: Ragdoll | null = null;
  downT = 0;
  absorbed = 0;
  absorbT = 0;
  blocks = 0;
  hold = false;
  feinting = false;
  tauntCooldown = rand(4, 9);
  injured = false;
  phase = 1;
  speedMul = 1;
  lastHitBy = 0;
  scoreValue = 100;
  vaulted = 0;
  private clipEndState: EnemyState = 'circle';

  constructor(game: Game, lib: CharacterLibrary, variant: Variant, cfg: ArchetypeCfg) {
    super(game, lib, variant);
    this.cfg = cfg;
    this.hp = this.maxHp = cfg.hp;
    this.scoreValue = cfg.score;
    this.state = 'enter';
    this.anim.locoIn.style = cfg.style;
    this.model.uniforms.uRim.value.set(cfg.rim[0], cfg.rim[1], cfg.rim[2], cfg.boss ? 0.35 : 0.0);
    if (cfg.weapon) {
      const w = new Weapon(game, cfg.weapon);
      w.attach(this);
      game.weapons.push(w);
    }
  }

  // ------------------------------------------------------------------ token API (director)
  canTakeToken() {
    return (this.state === 'circle' || this.state === 'taunt') && !this.token && this.attackCooldown <= 0 && this.stun <= 0 && !this.paired;
  }
  grantToken(delay: number) {
    this.token = true;
    this.tokenDelay = delay;
  }
  holdAttack(dt: number) {
    if (this.clip && this.state === 'attack') {
      this.hold = true;
      this.clip.speed = 0.05;
    }
    void dt;
  }
  releaseHold() {
    if (this.hold && this.clip) {
      this.hold = false;
      this.clip.speed = this.cfg.attackSpeed * this.speedMul;
    }
  }

  get player() {
    return this.game.player;
  }

  // ------------------------------------------------------------------ think
  think(dt: number) {
    this.stateTime += dt;
    this.attackCooldown -= dt;
    this.tauntCooldown -= dt;
    this.invuln = Math.max(0, this.invuln - dt);
    this.absorbT -= dt;
    if (this.absorbT <= 0) this.absorbed = 0;
    this.vaulted = Math.max(0, this.vaulted - dt);
    // bleeding trail
    if (this.bleedRate > 0.2) {
      this.bleedTimer -= dt * this.bleedRate;
      if (this.bleedTimer <= 0) {
        this.bleedTimer = rand(0.6, 1.4);
        this.anim.boneWorld(chance(0.6) ? B.head : B.chest, _v);
        this.game.fx.bloodDrip(_v, 1);
      }
      this.bleedRate = Math.max(0, this.bleedRate - dt * 0.12);
    }
    this.injured = this.hp < this.maxHp * 0.35;
    const p = this.player;
    const li = this.anim.locoIn;
    li.hunch = this.injured ? 0.7 : 0;
    li.limp = this.injured || this.brokenLeg ? 0.8 : 0;
    li.holdSide = this.injured && !this.weapon ? -1 : 0;
    li.brokenArm = this.brokenArm;
    li.breath = this.injured ? 1 : 0.3;
    li.style = this.injured && !this.cfg.boss ? 'injured' : this.cfg.style;
    li.taunt = 0;

    switch (this.state) {
      case 'enter':
        this.doEnter(dt);
        break;
      case 'circle':
      case 'retreat':
        this.doCircle(dt);
        break;
      case 'approach':
        this.doApproach(dt);
        break;
      case 'stunned':
        this.stunT -= dt;
        if (this.anim.mode === 'clip' && this.clip && this.clip.done) this.toLoco();
        if (this.anim.mode === 'loco') {
          this.vx = damp(this.vx, 0, 8, dt);
          this.vz = damp(this.vz, 0, 8, dt);
          li.hunch = 0.6;
        }
        if (this.stunT <= 0) this.setState('circle');
        break;
      case 'down':
        this.doDown(dt);
        break;
      case 'attack':
      case 'recover':
      case 'react':
      case 'getup':
      case 'dodge':
      case 'block':
      case 'taunt':
        if (this.clip) {
          if (this.state === 'attack' && this.feinting && this.clip.time > this.clip.clip.hitT * 0.55) {
            // feint: abort before contact
            this.feinting = false;
            this.game.director.cancel(this);
            this.anim.toLoco(0.12);
            this.setState('circle');
            this.attackCooldown = rand(0.4, 1.0);
            break;
          }
          const recover = this.clip.clip.recoverT;
          if (this.clip.done || (this.clip.time >= recover && this.state !== 'attack')) {
            this.finishClip();
          } else if (this.state === 'attack' && this.clip.time >= recover) {
            this.finishClip();
          }
        } else if (this.anim.mode === 'loco') this.setState('circle');
        break;
      case 'paired':
      case 'grabbed':
        // a knocked-down body stays physical during ground takedowns
        if (this.downRag) {
          this.downRag.update(dt);
          this.downRag.rootPos(_v);
          this.x = _v.x;
          this.z = _v.z;
        }
        break;
    }
    if (this.anim.mode === 'loco') {
      // face player while circling
      const look = angleDiff(this.yaw, yawFromDir(p.x - this.x, p.z - this.z));
      li.look = clamp(look, -1.2, 1.2);
    }
    this.stun = Math.max(0, this.stun - dt);
  }

  setState(s: EnemyState) {
    this.state = s;
    this.stateTime = 0;
  }

  private toLoco(hl = 0.12) {
    this.anim.toLoco(hl);
  }

  private finishClip() {
    const next = this.clipEndState;
    if (this.state === 'attack') {
      this.game.director.cancel(this);
      // elite combos: chain next attack immediately
      if (this.attackCombo > 1 && this.player.alive && this.distTo(this.player) < 3.2 && !this.injured) {
        this.attackCombo--;
        this.startAttack(true);
        return;
      }
      this.token = false;
      this.attackCooldown = rand(1.2, 2.8) / this.game.director.aggression;
    }
    this.toLoco(0.12);
    this.setState(next === 'getup' ? 'circle' : next);
    this.clipEndState = 'circle';
  }

  private doEnter(dt: number) {
    this.ghostWalls = true;
    const dx = this.enterX - this.x, dz = this.enterZ - this.z;
    const d = Math.hypot(dx, dz);
    const sp = this.cfg.speed * 0.75;
    const tvx = d > 0.1 ? (dx / d) * sp : 0, tvz = d > 0.1 ? (dz / d) * sp : 0;
    this.vx = damp(this.vx, tvx, 6, dt);
    this.vz = damp(this.vz, tvz, 6, dt);
    this.faceTowards(this.x + this.vx, this.z + this.vz, 8, dt);
    this.anim.locoIn.guard = 0.4;
    if (d < 0.5 || this.stateTime > 6) {
      if (!this.game.arena.inside(this.x, this.z, 0.4)) {
        // safety: never leave anyone stuck outside the arena
        this.x = this.enterX;
        this.z = this.enterZ;
        this.anim.initAt(this.x, this.z, this.yaw);
      }
      this.ghostWalls = false;
      this.setState('circle');
    }
  }

  private doCircle(dt: number) {
    const p = this.player;
    const li = this.anim.locoIn;
    li.guard = 1;
    const toP = new THREE.Vector3(p.x - this.x, 0, p.z - this.z);
    const dist = toP.length();
    toP.normalize();
    // desired ring position
    this.orbitTimer -= dt;
    if (this.orbitTimer <= 0) {
      this.orbitTimer = rand(1.5, 4);
      if (chance(0.4)) this.orbitDir *= -1;
      this.ringR = this.injured ? rand(4.5, 6) : rand(2.6, 4.4);
    }
    const ang = Math.atan2(this.x - p.x, this.z - p.z) + this.orbitDir * 0.35;
    let tx = p.x + Math.sin(ang) * this.ringR;
    let tz = p.z + Math.cos(ang) * this.ringR;
    // separation from other enemies
    let sx = 0, sz = 0;
    for (const o of this.game.enemies()) {
      if (o === this || !o.alive) continue;
      const dx = this.x - o.x, dz = this.z - o.z;
      const d2 = dx * dx + dz * dz;
      if (d2 < 2.4 * 2.4 && d2 > 1e-4) {
        const d = Math.sqrt(d2);
        sx += (dx / d) * (2.4 - d);
        sz += (dz / d) * (2.4 - d);
      }
    }
    tx += sx * 1.2;
    tz += sz * 1.2;
    // keep inside arena
    tx = clamp(tx, -11.8, 11.8);
    tz = clamp(tz, -9.8, 9.8);
    const dx = tx - this.x, dz = tz - this.z;
    const d = Math.hypot(dx, dz);
    let sp = d > 2.5 ? this.cfg.speed * 0.8 : clamp(d * 1.1, 0, 1.5);
    if (this.injured) sp *= 0.6;
    if (this.brokenLeg) sp *= 0.45;
    sp *= this.speedMul;
    const tvx = d > 0.15 ? (dx / d) * sp : 0, tvz = d > 0.15 ? (dz / d) * sp : 0;
    this.vx = damp(this.vx, tvx, 5, dt);
    this.vz = damp(this.vz, tvz, 5, dt);
    // face player when close, travel direction when far
    if (dist < 7 || d < 2.5) this.faceTowards(p.x, p.z, 6, dt);
    else this.faceTowards(this.x + this.vx, this.z + this.vz, 6, dt);
    // taunt occasionally
    if (this.tauntCooldown <= 0 && dist > 3 && dist < 7 && !this.injured && chance(dt * 0.5)) {
      this.tauntCooldown = rand(6, 14);
      this.playState(chance(0.5) ? 'e_taunt' : 'e_taunt2', 'taunt', { halflife: 0.15 });
      return;
    }
    if (this.token) {
      this.tokenDelay -= dt;
      if (this.tokenDelay <= 0) this.setState('approach');
    }
  }

  private chooseAttack(): EnemyAttack {
    const list = this.cfg.attacks.map((k) => ENEMY_ATTACKS[k]).filter(Boolean);
    let usable = list.filter((a) => !a.weapon || (this.weapon && this.weapon.kind === a.weapon));
    if (usable.length === 0) usable = [ENEMY_ATTACKS.punch, ENEMY_ATTACKS.kick];
    if (this.brokenArm) usable = usable.filter((a) => a.kind === 'kick' || a.clip.includes('kick')).concat([ENEMY_ATTACKS.kick]);
    const dir = this.game.director;
    const d = this.distTo(this.player);
    return (
      weightedPick(usable, (a) => {
        let w = a.weight;
        if (a.unblockable) w *= 1 + dir.counterBias * 2.5 + (this.phase - 1) * 0.6;
        if (a.startRange > 4 && d < 3) w *= 0.2;
        if (a.startRange > 4 && d > 4) w *= 3;
        return w;
      }) ?? usable[0]
    );
  }

  private doApproach(dt: number) {
    const p = this.player;
    if (!this.attackDef) this.attackDef = this.chooseAttack();
    const a = this.attackDef;
    const d = this.distTo(p);
    if (d <= a.startRange || this.stateTime > 3.5) {
      this.attackCombo = Math.round(rand(this.cfg.comboHits[0], this.cfg.comboHits[1]));
      this.startAttack(false);
      return;
    }
    const sp = this.cfg.speed * (this.injured ? 0.7 : 1) * this.speedMul;
    const tvx = ((p.x - this.x) / d) * sp, tvz = ((p.z - this.z) / d) * sp;
    this.vx = damp(this.vx, tvx, 6, dt);
    this.vz = damp(this.vz, tvz, 6, dt);
    this.faceTowards(p.x, p.z, 8, dt);
    this.anim.locoIn.guard = 0.8;
  }

  startAttack(chained: boolean) {
    const p = this.player;
    const a = chained ? this.chooseAttack() : this.attackDef ?? this.chooseAttack();
    this.attackDef = a;
    const speed = this.cfg.attackSpeed * this.speedMul * (1 + (this.game.director.wave - 1) * 0.015) * (chained ? 1.15 : 1);
    const clip = getClip(a.clip);
    const cp = this.play(a.clip, { target: p, reach: a.reach, maxWarp: a.startRange > 4 ? 7 : 2.4, speed, halflife: 0.1 });
    cp.speed = speed;
    this.setState('attack');
    this.clipEndState = 'circle';
    // feints for tricky enemies (more if the player counters a lot)
    const feintChance = this.cfg.feint * (1 + this.game.director.counterBias * 2);
    this.feinting = !chained && !a.unblockable && chance(feintChance);
    // dodge-heavy players: delay the strike slightly
    const hitDelay = clip.hitT / speed;
    this.game.director.registerAttack(this, hitDelay, !a.unblockable, this.feinting);
    if (chance(0.35)) this.game.audio.play('grunt_attack', { pos: new THREE.Vector3(this.x, 1.6, this.z), vol: 0.6, delay: hitDelay * 0.4 });
  }

  private playState(name: string, state: EnemyState, opt: { halflife?: number; target?: Fighter | null; speed?: number; originYaw?: number } = {}) {
    this.play(name, { halflife: opt.halflife ?? 0.08, target: opt.target ?? null, speed: opt.speed, originYaw: opt.originYaw });
    this.setState(state);
  }

  // ------------------------------------------------------------------ events
  onEvent(ev: ClipEvent) {
    const g = this.game;
    if (ev.type === 'sfx') {
      g.audio.play(String(ev.name), { pos: _v.set(this.x, 1.3, this.z), vol: 0.8 });
      return;
    }
    if (ev.type === 'hit' && this.state === 'attack' && this.attackDef) {
      g.director.cancel(this);
      const p = this.player;
      const a = this.attackDef;
      const d = this.distTo(p);
      const facing = Math.abs(this.angleTo(p)) < 1.2;
      if (!p.alive || d > a.reach + 0.75 || !facing) {
        // whiff
        return;
      }
      const hit = g.combat.makeStrike(this, p, {
        limb: String(ev.limb ?? 'rh'),
        region: a.region,
        damage: a.damage * (1 + (g.director.wave - 1) * 0.04) * (this.phase > 1 ? 1.2 : 1),
        strength: a.strength,
        kind: a.kind,
        unblockable: a.unblockable,
        knockdown: !!a.knockdown,
        bleed: a.bleed ?? 0.3,
      });
      const res = p.takeHit(hit);
      g.combat.feedback(this, p, hit, res);
      if (res === 'dodged' || res === 'ignored') {
        // overextended: brief vulnerability
        if (res === 'dodged') this.stun = 0.4;
      }
      if (this.weapon && (res === 'hit' || res === 'blocked')) this.weapon.wear(0.5);
      if (ev.shockwave) {
        g.cam.addTrauma(0.4);
        g.fx.dust(new THREE.Vector3(this.x + Math.sin(this.yaw) * 0.8, 0, this.z + Math.cos(this.yaw) * 0.8), 2);
        g.audio.play('body_fall', { pos: _v.set(this.x, 0, this.z) });
      }
    }
  }

  // ------------------------------------------------------------------ being hit
  takeHit(h: HitInfo): HitResult {
    const g = this.game;
    if (!this.alive) return 'ignored';
    if (this.state === 'dodge' && this.invuln > 0) return 'dodged';
    const attacker = h.attacker as Fighter | null;
    const fromFront = attacker ? Math.abs(this.angleTo(attacker)) < 1.25 : true;
    const vulnerable = this.stun > 0 || this.state === 'stunned' || this.state === 'down' || this.state === 'paired' || this.state === 'grabbed';
    // ---- defensive options
    if (!vulnerable && !h.finisher && !h.unblockable && fromFront && this.state !== 'attack' && this.state !== 'react') {
      const guardBreak = h.strength >= 1.0 && (h.kind === 'kick' || h.kind === 'blunt');
      if (this.cfg.block > 0 && !guardBreak && chance(this.cfg.block * (this.injured ? 0.5 : 1))) {
        this.blocks++;
        this.playState('r_block', 'block', { target: attacker, halflife: 0.06 });
        g.director.note('strikes');
        if (this.blocks >= 2 && chance(0.7)) {
          // riposte
          this.blocks = 0;
          this.attackDef = ENEMY_ATTACKS.punch;
          this.attackCombo = 1;
          this.clipEndState = 'circle';
          setTimeout(() => {
            if (this.alive && this.state === 'block') this.startAttack(true);
          }, 120);
        }
        return 'blocked';
      }
    }
    // ---- damage
    let dmg = h.damage;
    if (vulnerable) dmg *= 1.25;
    const absorbs = this.cfg.needsStun && !vulnerable && !h.finisher && h.kind !== 'slam' && h.kind !== 'throw';
    if (absorbs) dmg *= 0.35;
    if (this.cfg.boss && h.finisher && h.damage >= 999) dmg = this.maxHp * 0.22; // bosses survive finishers until low
    this.hp -= dmg;
    this.lastHitBy = g.time;
    if (h.breakArm && !this.brokenArm) this.breakArm(h.breakArm as number);
    if (this.hp <= 0) {
      this.die(h);
      return 'killed';
    }
    g.director.note('strikes');
    // boss phase changes
    if (this.cfg.boss) g.bosses.onBossDamaged(this);
    if (h.noReact || this.state === 'paired' || this.state === 'grabbed') return 'hit';
    // ---- reactions
    if (absorbs) {
      this.absorbed++;
      this.absorbT = 2.5;
      this.anim.hitImpulse(h.dir, h.strength * 0.4, h.region);
      if (this.absorbed >= this.cfg.poise && this.state !== 'attack') {
        // retaliate immediately
        this.absorbed = 0;
        this.attackDef = ENEMY_ATTACKS[this.cfg.key === 'butcher' ? 'club_swing' : 'bruiser_punch'];
        this.attackCombo = 1;
        this.startAttack(true);
      }
      return 'hit';
    }
    g.director.cancel(this);
    if (this.state === 'attack') this.token = false;
    if (h.knockdown || (h.strength >= 1.15 && chance(0.55)) || (h.launch > 2.5 && chance(0.5))) {
      this.knockdown(h);
      return 'hit';
    }
    const clip = g.combat.reactionClip(this, h);
    const faceYaw = attacker ? yawFromDir(attacker.x - this.x, attacker.z - this.z) : this.yaw;
    this.playState(clip, 'react', { originYaw: faceYaw, halflife: 0.05 });
    this.stun = Math.max(this.stun, 0.35 + h.strength * 0.35 + h.stun);
    if (h.stun > 0.9) this.stunNow(h.stun);
    return 'hit';
  }

  stunNow(sec: number) {
    if (!this.alive || this.state === 'down' || this.state === 'paired') return;
    this.game.director.cancel(this);
    this.token = false;
    this.playState('r_stun', 'stunned', { halflife: 0.08 });
    this.stunT = sec;
    this.stun = sec;
    this.absorbed = 0;
  }

  breakArm(side: number) {
    this.brokenArm = side;
    const fa = side > 0 ? B.farmL : B.farmR;
    // hyper-extended elbow (wrong way) and limp wrist
    this.anim.postRot[fa] = new THREE.Quaternion().setFromAxisAngle(new THREE.Vector3(side > 0 ? 1 : -1, 0, side > 0 ? 0.6 : -0.6).normalize(), -0.9);
    if (this.weapon) this.weapon.drop(new THREE.Vector3(rand(-1, 1), 1.5, rand(-1, 1)));
    this.bleedRate += 1.5;
  }

  knockdown(h: HitInfo) {
    const g = this.game;
    g.director.cancel(this);
    this.token = false;
    const rag = new Ragdoll(g.physics, {
      def: this.def, fk: this.anim.fk, prevFk: this.anim.prevFk, dt: 1 / 60, rootX: this.x, rootZ: this.z, rootYaw: this.yaw, vel: new THREE.Vector3(this.vx, 0, this.vz).multiplyScalar(0.5), scale: this.scale,
    });
    const imp = g.combat.impulseFor(h, 70 * this.scale * this.scale);
    rag.impulse(imp.multiplyScalar(0.55), h.point);
    if (h.launch > 0) rag.launch(h.dir.clone().multiplyScalar(h.launch * 0.6).setY(h.launch * 0.25), 2);
    this.downRag = rag;
    this.ragdoll = rag;
    this.anim.toExternal(rag, 0.03);
    this.setState('down');
    this.down = true;
    this.downT = 0;
    this.solid = false;
    if (this.weapon && chance(0.6)) this.weapon.drop(new THREE.Vector3(rand(-1.5, 1.5), 2, rand(-1.5, 1.5)));
  }

  private doDown(dt: number) {
    this.downT += dt;
    const r = this.downRag;
    if (!r) return;
    r.update(dt);
    r.rootPos(_v);
    this.x = _v.x;
    this.z = _v.z;
    const minDown = this.cfg.boss ? 1.0 : 2.2;
    if ((r.settled && this.downT > minDown) || this.downT > 5) this.getUp();
  }

  getUp() {
    const r = this.downRag;
    if (!r) return;
    r.read();
    const pelvis = r.pos[0], head = r.pos[2];
    const up = r.faceUp();
    const yaw = up ? yawFromDir(pelvis.x - head.x, pelvis.z - head.z) : yawFromDir(head.x - pelvis.x, head.z - pelvis.z);
    this.x = pelvis.x;
    this.z = pelvis.z;
    this.yaw = yaw;
    // final ragdoll pose then hand over to clip
    this.anim.update(0, this.x, this.z, this.yaw);
    r.dispose();
    this.downRag = null;
    this.ragdoll = null;
    this.down = false;
    this.solid = true;
    this.play(up ? 'getup_back' : 'getup_front', { halflife: 0.2, originYaw: yaw });
    this.setState('getup');
    this.clipEndState = 'circle';
    this.invuln = 0.6;
  }

  die(h: HitInfo) {
    const g = this.game;
    g.director.cancel(this);
    this.token = false;
    const mass = 70 * this.scale * this.scale;
    const imp = g.combat.impulseFor(h, mass);
    const launch = h.launch > 0 ? h.dir.clone().multiplyScalar(h.launch).setY(h.launch * 0.35 + 1) : undefined;
    if (this.weapon) this.weapon.drop(new THREE.Vector3(rand(-1.5, 1.5) + h.dir.x * 2, 2.5, rand(-1.5, 1.5) + h.dir.z * 2));
    this.paired = null;
    if (this.downRag) {
      g.death.adopt(this, this.downRag, 'ground', imp.multiplyScalar(0.5), h.point);
      this.downRag = null;
    } else {
      g.death.kill(this, h.finisher ? 'finisher' : 'beaten', imp, h.point, launch);
    }
    g.onEnemyKilled(this, h);
  }

  /** The player vaulted over this enemy: disoriented briefly. */
  vaultedOver() {
    this.vaulted = 1.2;
    if (this.state === 'circle' || this.state === 'approach') {
      this.stun = 0.9;
      this.token = false;
      if (this.cfg.needsStun) this.stunNow(1.6);
    }
  }

  /** Agile/elite enemies may evade an incoming player strike. */
  tryEvade(attacker: Fighter): boolean {
    if (!this.alive || this.cfg.dodge <= 0) return false;
    if (this.state !== 'circle' && this.state !== 'approach' && this.state !== 'taunt') return false;
    if (this.stun > 0 || this.injured) return false;
    if (!chance(this.cfg.dodge * (1 + this.game.director.wave * 0.02))) return false;
    const side = chance(0.5);
    const yaw = yawFromDir(attacker.x - this.x, attacker.z - this.z);
    if (side) this.playState(chance(0.5) ? 'r_dodge_side' : 'r_dodge_side_m', 'dodge', { originYaw: yaw, halflife: 0.05 });
    else this.playState('r_dodge_back', 'dodge', { originYaw: yaw, halflife: 0.05 });
    this.invuln = 0.4;
    this.clipEndState = 'circle';
    return true;
  }

  /** Enter a paired animation controlled by the player. */
  enterPaired(attacker: Fighter) {
    this.game.director.cancel(this);
    this.token = false;
    this.paired = attacker;
    this.setState('paired');
    if (this.downRag) {
      // stay ragdolled (ground takedown)
      return;
    }
  }
  exitPaired(next: EnemyState = 'circle') {
    this.paired = null;
    if (!this.alive) return;
    if (this.downRag) {
      // still on the floor (e.g. survived a ground takedown): continue the get-up flow
      this.setState('down');
      return;
    }
    if (this.state === 'paired' || this.state === 'grabbed') {
      if (this.anim.mode === 'clip' && this.clip && !this.clip.done) {
        // let the victim track finish as a reaction
        this.setState('react');
        this.clipEndState = next;
      } else {
        this.toLoco(0.15);
        this.setState(next);
      }
    }
  }

  vulnerabilityForFinisher() {
    return this.state === 'stunned' || this.state === 'down';
  }

  update2() {
    void pick;
    void wrapAngle;
  }
}
