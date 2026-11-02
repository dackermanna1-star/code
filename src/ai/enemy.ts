import * as THREE from 'three';
import { Fighter } from '../combat/fighter';
import { ClipEvent, getClip } from '../anim/clip';
import { HitInfo, HitResult, makeHit } from '../combat/types';
import { ArchetypeCfg } from './archetypes';
import { ENEMY_ATTACKS, EnemyAttack } from '../combat/moves';
import { angleDiff, chance, clamp, damp, lerp, pick, rand, weightedPick, wrapAngle, yawFromDir } from '../core/math';
import { DIFFICULTY } from '../core/settings';
import type { BossBrain } from './bossKits';
import type { RagdollLike } from '../world/ragdollTypes';
import { ActiveRagdoll } from '../world/euphoria/bridge';
import { B } from '../anim/skeleton';
import { MocapDriver } from '../anim/mocapLoco';
import type { Game } from '../game';
import type { CharacterLibrary, Variant } from '../character/library';
import { Weapon } from '../combat/weapons';

/** Share of the load-up (clip time) over which an attack accelerates into the strike. */
const WIND_RAMP = 0.3;
/**
 * Load-up speed so that clip time [0, wind] takes `dur` seconds when its last WIND_RAMP part ramps
 * linearly (in clip time) from that speed to the strike's `v2`: the hit lands exactly when the
 * warning said it would.
 */
function windupSpeed(wind: number, v2: number, dur: number) {
  const time = (v1: number) => {
    const ramp = wind * WIND_RAMP;
    const rampT = Math.abs(v2 - v1) < 1e-6 ? ramp / v1 : (ramp * Math.log(v2 / v1)) / (v2 - v1);
    return (wind - ramp) / v1 + rampT;
  };
  let lo = 0.01, hi = v2;
  if (time(hi) >= dur) return v2;
  for (let i = 0; i < 30; i++) {
    const mid = (lo + hi) / 2;
    if (time(mid) > dur) lo = mid;
    else hi = mid;
  }
  return (lo + hi) / 2;
}

export type EnemyState =
  | 'enter' | 'circle' | 'approach' | 'attack' | 'recover' | 'react' | 'stunned' | 'down' | 'getup' | 'paired' | 'dodge' | 'block' | 'taunt' | 'retreat' | 'grabbed'
  /** Physically stumbling (active ragdoll trying to keep its balance). */
  | 'stagger';

const _v = new THREE.Vector3();

export class Enemy extends Fighter {
  team = 'enemy' as const;
  declare state: EnemyState;
  cfg: ArchetypeCfg;
  // brain
  token = false;
  tokenDelay = 0;
  attackDef: EnemyAttack | null = null;
  /** A boss's scripted behaviour (null for the rank and file). */
  brain: BossBrain | null = null;
  /** Attacks still to come in the current scripted combo (bosses). */
  comboQueue: string[] = [];
  private comboLen = 0;
  /** One-off minimum warning for the next attack (s). */
  private tellOverride = 0;
  attackCombo = 0;
  attackCooldown = rand(1, 2.5);
  orbitDir = Math.random() < 0.5 ? -1 : 1;
  orbitTimer = rand(1.5, 4);
  ringR = rand(2.6, 4.2);
  enterX = 0;
  enterZ = 0;
  stunT = 0;
  downRag: RagdollLike | null = null;
  downT = 0;
  /** This knockdown ends with the active ragdoll struggling up by itself (hurt / random). */
  physGetUp = false;
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
  /** Side (+1 / -1) this enemy steps out of the camera's line of sight to the player, 0 = not in it. */
  private camSide = 0;

  constructor(game: Game, lib: CharacterLibrary, variant: Variant, cfg: ArchetypeCfg) {
    super(game, lib, variant);
    this.cfg = cfg;
    this.hp = this.maxHp = cfg.hp;
    this.scoreValue = cfg.score;
    this.state = 'enter';
    this.anim.locoIn.style = cfg.style;
    if (game.settings.mocap) {
      // motion-captured movement too, each with its own tempo; heavies bounce less
      const m = new MocapDriver();
      m.idleRate = rand(0.88, 1.12);
      m.bounce = cfg.style === 'heavy' ? 0.45 : cfg.style === 'brawl' ? 0.75 : cfg.style === 'agile' ? 1.15 : 1;
      this.anim.loco.mocap = m;
    }
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
      this.paceAttack();
    }
  }
  /**
   * Attack pacing: the load-up of a strike (the first half of the way to contact) can run slower
   * than the strike itself, so every attack - even a fighter's snapping jab late in the game -
   * shows its intent long enough to be countered or dodged; contact and recovery keep full speed.
   */
  private atkSpeed = 1;
  private windEnd = 0;
  private windSpeed = 1;
  private paceAttack() {
    if (!this.clip || this.state !== 'attack' || this.hold) return;
    // the last part of the load-up accelerates into the strike instead of switching speed in a frame
    const t = this.clip.time, r0 = this.windEnd * (1 - WIND_RAMP);
    this.clip.speed = t < r0 ? this.windSpeed : t < this.windEnd ? lerp(this.windSpeed, this.atkSpeed, (t - r0) / (this.windEnd * WIND_RAMP)) : this.atkSpeed;
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
    this.brain?.update(dt);
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
    if (this.lift !== 0 && this.state !== 'enter') {
      // knocked off the stairs mid-climb: back on the roof
      this.lift = 0;
      this.climbH = 0;
    }

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
      case 'stagger':
        this.doStagger(dt);
        break;
      case 'attack':
      case 'recover':
      case 'react':
      case 'getup':
      case 'dodge':
      case 'block':
      case 'taunt':
        if (this.clip) {
          this.paceAttack();
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
      // a boss's scripted combo runs to its end; elite combos chain while in reach
      if (this.comboQueue.length && this.player.alive) {
        this.attackCombo--;
        this.startAttack(true);
        return;
      }
      if (!this.brain && this.attackCombo > 1 && this.player.alive && this.distTo(this.player) < 3.2 && !this.injured) {
        this.attackCombo--;
        this.startAttack(true);
        return;
      }
      this.brain?.comboEnded(this.comboLen);
      this.comboLen = 0;
      // (the next approach picks its attack afresh: the first choice used to stick for good)
      this.attackDef = null;
      this.token = false;
      this.attackCooldown = rand(1.2, 2.8) / this.game.director.aggression;
    }
    this.toLoco(0.12);
    this.setState(next === 'getup' ? 'circle' : next);
    this.clipEndState = 'circle';
  }

  private climbH = 0;
  private climbFrom: [number, number] = [0, 0];
  /** Come in climbing: start `h` metres down the fire escape and rise over the first steps. */
  startClimb(h: number) {
    this.climbH = h;
    this.climbFrom = [this.x, this.z];
    this.lift = -h;
  }

  private doEnter(dt: number) {
    this.ghostWalls = true;
    if (this.climbH > 0) {
      const went = Math.hypot(this.x - this.climbFrom[0], this.z - this.climbFrom[1]);
      const k = Math.min(1, went / 1.3);
      this.lift = -this.climbH * (1 - k) * (1 - k * 0.3);
      if (k >= 1) {
        this.climbH = 0;
        this.lift = 0;
      }
    }
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
      this.climbH = 0;
      this.lift = 0;
      this.setState('circle');
    }
  }

  private doCircle(dt: number) {
    if (this.brain?.circle(dt)) return;
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
    let ang = Math.atan2(this.x - p.x, this.z - p.z) + this.orbitDir * 0.35;
    // keep out of the camera's line of sight to the player while sizing them up: a thug parked
    // between the lens and the player hides the fight (they still attack from anywhere)
    // (which way to step out is chosen on the way in and kept: deciding afresh each frame flipped
    // it whenever the thug stood right on the line, and he jittered)
    const fromCam = wrapAngle(ang - this.game.cam.yaw);
    if (Math.abs(fromCam) < 0.85) {
      if (this.camSide === 0) this.camSide = Math.abs(fromCam) > 0.12 ? Math.sign(fromCam) : this.orbitDir;
      ang += this.camSide * (0.85 - this.camSide * fromCam) * 1.2;
    } else if (Math.abs(fromCam) > 1.0) this.camSide = 0;
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
    if (!this.attackDef) {
      if (this.brain) this.brain.beginCombo();
      else this.attackDef = this.chooseAttack();
    }
    const a = this.attackDef!;
    const d = this.distTo(p);
    // a captured attack only lunges a real step: walk in that close before throwing it
    const ac = getClip(a.clip);
    const start = ac.footFromStart ? Math.min(a.startRange, a.reach * this.scale + ac.lunge * 0.9) : a.startRange;
    if (d <= start || this.stateTime > 3.5) {
      if (!this.brain) this.attackCombo = Math.round(rand(this.cfg.comboHits[0], this.cfg.comboHits[1]));
      this.comboLen = 0;
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

  /**
   * A boss's scripted attack, now: `queue` = the strikes that follow it, `tell` = a minimum
   * warning for this one.
   */
  bossAttack(key: string, opt: { queue?: string[]; tell?: number } = {}) {
    const a = ENEMY_ATTACKS[key];
    if (!a || !this.alive || this.paired || this.downRag) return;
    this.attackDef = a;
    this.comboQueue = opt.queue ? [...opt.queue] : [];
    this.attackCombo = this.comboQueue.length + 1;
    this.comboLen = 0;
    this.tellOverride = opt.tell ?? 0;
    this.token = true;
    this.startAttack(false);
  }
  /** Play a clip as a state (boss brains: dodges, blocks). */
  bossPlay(name: string, state: EnemyState) {
    this.game.director.cancel(this);
    this.comboQueue = [];
    this.playState(name, state, { originYaw: yawFromDir(this.player.x - this.x, this.player.z - this.z), halflife: 0.06 });
    this.clipEndState = 'circle';
  }

  startAttack(chained: boolean) {
    const p = this.player;
    const queued = chained && this.comboQueue.length ? ENEMY_ATTACKS[this.comboQueue.shift()!] : null;
    const a = queued ?? (chained ? this.chooseAttack() : this.attackDef ?? this.chooseAttack());
    this.attackDef = a;
    this.comboLen++;
    const dir = this.game.director;
    // strikes get snappier with the waves, within limits (it's the warning time below that keeps
    // late waves fair, not slower strikes)
    const speed = Math.min(1.3, this.cfg.attackSpeed * this.speedMul * (1 + Math.min(0.1, (dir.wave - 1) * 0.008))) * (chained ? 1.1 : 1);
    const clip = getClip(a.clip);
    const cp = this.play(a.clip, { target: p, reach: a.reach, maxWarp: a.startRange > 4 ? 7 : 2.4, speed, halflife: 0.1 });
    this.setState('attack');
    this.clipEndState = 'circle';
    // feints for tricky enemies (more if the player counters a lot)
    const feintChance = this.cfg.feint * (1 + dir.counterBias * 2);
    this.feinting = !chained && !a.unblockable && chance(feintChance);
    // warning time: from the first twitch to contact, never less than a human can read and answer
    // (a fighter's jab at full speed lands in 80 ms; the load-up stretches to fill the difference)
    const natural = clip.hitT / speed;
    const mods = DIFFICULTY[this.game.settings.difficulty] ?? DIFFICULTY.fighter;
    let tell = Math.max((this.cfg.boss ? (chained ? 0.38 : 0.46) : chained ? 0.42 : 0.52) * mods.tell, (a.tell ?? 0) * mods.tell, this.tellOverride * mods.tell);
    this.tellOverride = 0;
    // two attacks that can't both be countered never land together: this one waits its turn
    const now = this.game.time;
    for (const inc of dir.incoming) {
      if (inc.enemy === this || (inc.counterable && !a.unblockable)) continue;
      const gap = now + Math.max(tell, natural) - inc.hitTime;
      if (Math.abs(gap) < 0.32) tell = Math.max(tell, inc.hitTime - now + 0.32);
    }
    const extra = Math.max(0, tell - natural);
    this.atkSpeed = speed;
    this.windEnd = clip.hitT * 0.5;
    this.windSpeed = extra > 0 ? windupSpeed(this.windEnd, speed, this.windEnd / speed + extra) : speed;
    cp.speed = this.windSpeed;
    const hitDelay = natural + extra;
    dir.registerAttack(this, hitDelay, !a.unblockable, this.feinting);
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
      if (a.special) {
        this.brain?.special(a);
        return;
      }
      const d = this.distTo(p);
      const facing = Math.abs(this.angleTo(p)) < 1.2;
      if (!p.alive || d > a.reach + 0.75 || !facing) {
        // whiff
        return;
      }
      const hit = g.combat.makeStrike(this, p, {
        limb: String(ev.limb ?? 'rh'),
        region: a.region,
        // (harder-hitting as the waves go on, levelling off at +36% by wave 10)
        damage: a.damage * (1 + Math.min(0.36, (g.director.wave - 1) * 0.04)) * (this.phase > 1 ? 1.2 : 1) * (DIFFICULTY[g.settings.difficulty] ?? DIFFICULTY.fighter).damage,
        strength: a.strength,
        kind: a.kind,
        unblockable: a.unblockable,
        knockdown: !!a.knockdown,
        bleed: a.bleed ?? 0.3,
        venom: a.venom,
      });
      const res = p.takeHit(hit);
      g.combat.feedback(this, p, hit, res);
      this.brain?.landed(a, res);
      if (res === 'dodged' || res === 'ignored') {
        // overextended: brief vulnerability
        if (res === 'dodged') this.stun = 0.4;
      }
      if (this.weapon && !this.cfg.boss && (res === 'hit' || res === 'blocked')) this.weapon.wear(0.5);
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
    const vulnerable = this.stun > 0 || this.state === 'stunned' || this.state === 'down' || this.state === 'stagger' || this.state === 'paired' || this.state === 'grabbed';
    // ---- defensive options
    if (!vulnerable && !h.finisher && !h.unblockable && fromFront && this.state !== 'attack' && this.state !== 'react') {
      // (kicks and blunt weapons break a guard - not a grandmaster's)
      const guardBreak = h.strength >= 1.0 && (h.kind === 'kick' || h.kind === 'blunt') && !this.brain;
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
          g.later(0.12, () => {
            if (this.alive && this.state === 'block') this.startAttack(true);
          });
        }
        return 'blocked';
      }
    }
    // ---- damage
    let dmg = h.damage;
    if (vulnerable) dmg *= 1.25;
    const absorbs = this.cfg.needsStun && !vulnerable && !h.finisher && h.kind !== 'slam' && h.kind !== 'throw';
    if (absorbs) dmg *= 0.35;
    if (this.cfg.boss && h.finisher && h.damage >= 999) dmg = this.maxHp * (this.brain ? 0.09 : 0.16); // bosses survive finishers (a heavy blow, not a fifth of their life)
    this.hp -= dmg;
    this.lastHitBy = g.time;
    if (this.brain) this.brain.count(h.finisher ? 'dmgFinisher' : this.state === 'paired' ? 'dmgCounter' : this.state === 'stunned' ? 'dmgStunned' : this.state === 'attack' ? 'dmgArmour' : 'dmgStrike', dmg);
    if (h.breakArm && !this.brokenArm) this.breakArm(h.breakArm as number);
    if (this.hp <= 0) {
      this.die(h);
      return 'killed';
    }
    g.director.note('strikes');
    // boss phase changes
    if (this.cfg.boss) g.bosses.onBossDamaged(this);
    // a boss answers a flurry in its own way
    if (this.brain && !h.finisher && this.state !== 'paired' && this.brain.onHurt()) {
      g.director.cancel(this);
      return 'hit';
    }
    // ---- bodies under physics (down / staggering / ground takedown): the blow moves the body itself
    const phys = this.downRag instanceof ActiveRagdoll ? this.downRag : null;
    if (phys && (this.state === 'down' || this.state === 'stagger' || this.state === 'paired' || this.state === 'grabbed')) {
      const imp = g.combat.impulseFor(h, 70 * this.scale * this.scale).multiplyScalar(this.state === 'stagger' ? 0.3 : 0.32);
      phys.hit(imp, h.point, undefined, h.strength);
      this.applyCondition(phys);
      if (this.state === 'stagger' && (h.knockdown || h.strength >= 1.05 || h.launch > 1.5)) {
        phys.forceFall(h.dir);
        if (h.launch > 0) phys.launch(h.dir.clone().multiplyScalar(h.launch * 0.5).setY(h.launch * 0.2), 1.5);
        this.enterDown();
      }
      return 'hit';
    }
    if (h.noReact || this.state === 'paired' || this.state === 'grabbed') return 'hit';
    // a boss in the middle of a combo doesn't flinch out of it (hyper armour): the blow lands, the
    // body sways, the combo goes on - mashing through a boss's attacks is how you get hit
    if (this.brain && this.state === 'attack' && !h.finisher) {
      this.anim.hitImpulse(h.dir, h.strength * 0.45, h.region);
      return 'hit';
    }
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
    // (a boss only goes down when caught off balance - stunned or exhausted)
    if ((h.knockdown || (h.launch > 2.5 && chance(0.5))) && (!this.brain || this.state === 'stunned')) {
      this.knockdown(h);
      return 'hit';
    }
    // heavy blows: the body is thrown off balance and physics decides whether it stumbles or falls
    if (h.strength >= 1.15 && chance(0.55) && (!this.brain || this.state === 'stunned')) {
      if (this.canStagger()) this.physStagger(h, 0.5);
      else this.knockdown(h);
      return 'hit';
    }
    if (h.strength >= 0.8 && this.canStagger() && chance(this.injured ? 0.5 : 0.2)) {
      this.physStagger(h, 0.27);
      return 'hit';
    }
    const clip = g.combat.reactionClip(this, h);
    const faceYaw = attacker ? yawFromDir(attacker.x - this.x, attacker.z - this.z) : this.yaw;
    // (a blow on a body still reeling from the last flows on from where it is, rather than
    // snapping back into the opening of the next reaction)
    const chained = this.state === 'react' || this.state === 'stunned';
    this.playState(clip, 'react', { originYaw: faceYaw, halflife: chained ? 0.09 : 0.05 });
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

  /** Active ragdolls available for staggers (bosses keep their scripted reactions). */
  private canStagger() {
    const g = this.game;
    return !this.cfg.boss && g.settings.ragdolls === 'euphoria' && g.euphoria.capacity > 1;
  }

  /** Physiology for the active ragdoll: pain, weakened / broken limbs, painted wounds to clutch. */
  applyCondition(r: ActiveRagdoll) {
    const hpF = clamp(this.hp / this.maxHp, 0, 1);
    const pain = clamp(0.12 + (1 - hpF) * 0.68 + this.bleedRate * 0.04, 0, this.alive ? 0.8 : 1);
    const leg = this.injured ? 0.85 : 1;
    r.setCondition({
      pain,
      legL: this.brokenLeg > 0 ? 0.55 : leg,
      legR: this.brokenLeg < 0 ? 0.55 : leg,
      armL: this.brokenArm > 0 ? 0.04 : 1,
      armR: this.brokenArm < 0 ? 0.04 : 1,
      balance: this.injured ? 0.75 : 1,
    });
    r.setWounds(this.model.wounds);
  }

  /** Hand the body to the active ragdoll for a physical stumble; it either catches itself or goes down. */
  physStagger(h: HitInfo, impScale: number) {
    const g = this.game;
    g.director.cancel(this);
    this.token = false;
    const rag = g.makeRagdoll(this, 0.9);
    if (!(rag instanceof ActiveRagdoll)) {
      rag.dispose();
      this.knockdown(h);
      return;
    }
    this.applyCondition(rag);
    const imp = g.combat.impulseFor(h, 70 * this.scale * this.scale).multiplyScalar(impScale);
    rag.hit(imp, h.point, undefined, h.strength);
    g.euphoria.count('stagger');
    this.downRag = rag;
    this.ragdoll = rag;
    this.anim.toExternal(rag, 0.05);
    this.setState('stagger');
    this.down = false;
    this.downT = 0;
    this.solid = false;
  }

  private doStagger(dt: number) {
    const r = this.downRag;
    if (!(r instanceof ActiveRagdoll)) {
      this.setState('circle');
      return;
    }
    this.downT += dt;
    r.rootPos(_v);
    this.x = _v.x;
    this.z = _v.z;
    r.pelvisVel(_v);
    this.vx = _v.x;
    this.vz = _v.z;
    if (r.grounded) {
      this.enterDown();
      return;
    }
    if ((r.upright && this.downT > 0.5) || (this.downT > 3.5 && r.mode === 'balance')) this.recoverFromRagdoll();
  }

  private wantsPhysGetUp() {
    if (this.cfg.boss) return false;
    return this.injured || this.hp < this.maxHp * 0.55 ? chance(0.75) : chance(0.2);
  }

  /** A falling / flying body crashed into this standing enemy (impulse from the active-ragdoll world). */
  bodyBump(imp: THREE.Vector3) {
    if (!this.alive || this.downRag || this.paired || this.cfg.boss) return;
    if (this.state === 'enter' || this.state === 'getup' || this.state === 'dodge') return;
    const g = this.game;
    const mag = Math.hypot(imp.x, imp.z);
    const dir = new THREE.Vector3(imp.x, 0, imp.z).divideScalar(mag || 1);
    const point = new THREE.Vector3(this.x - dir.x * 0.15, 0.95 * this.scale, this.z - dir.z * 0.15);
    const h = makeHit({ dir, point, damage: Math.min(12, mag * 0.1), strength: clamp(mag / 70, 0.5, 1.4), kind: 'slam', region: 'chest', knockdown: mag > 85, attacker: g.player });
    g.director.cancel(this);
    if (h.knockdown || !this.canStagger()) {
      this.hp -= h.damage;
      if (this.hp <= 0) {
        this.die(h);
        return;
      }
      this.knockdown(h);
    } else {
      this.physStagger(h, 0);
      const r = this.downRag as RagdollLike | null;
      if (r instanceof ActiveRagdoll) r.hit(imp.clone().multiplyScalar(0.8), point, 'pelvis', h.strength);
    }
    g.audio.play('body_hit', { pos: point, vol: clamp(mag / 80, 0.3, 1) });
  }

  /** A paired move grabs a physically staggering enemy: hand the body straight back to animation. */
  releaseStagger() {
    const r = this.downRag;
    if (!(r instanceof ActiveRagdoll) || this.state !== 'stagger') return;
    r.pelvisPos(_v);
    this.x = _v.x;
    this.z = _v.z;
    this.yaw = r.heading();
    this.anim.update(0, this.x, this.z, this.yaw);
    r.dispose();
    this.downRag = null;
    this.ragdoll = null;
    this.down = false;
    this.solid = true;
    this.toLoco(0.12);
    this.setState('circle');
  }

  /** A physical stumble turned into a fall. */
  private enterDown() {
    if (this.state === 'down') return;
    if (this.state === 'stagger') this.game.euphoria.count('staggerFell');
    this.physGetUp = this.wantsPhysGetUp();
    this.setState('down');
    this.down = true;
    this.downT = 0;
    this.solid = false;
    if (this.weapon && chance(0.45)) this.weapon.drop(new THREE.Vector3(rand(-1.5, 1.5), 2, rand(-1.5, 1.5)));
  }

  knockdown(h: HitInfo) {
    const g = this.game;
    g.director.cancel(this);
    this.token = false;
    const imp = g.combat.impulseFor(h, 70 * this.scale * this.scale).multiplyScalar(0.55);
    // driven into the rooftop's parapet: over it (bosses keep their footing at the lip)
    const edge = this.cfg.boss ? null : g.edgeLaunch(this.x, this.z, h.dir, h.strength + h.launch * 0.15);
    const launch = edge ?? (h.launch > 0 ? h.dir.clone().multiplyScalar(h.launch * 0.6).setY(h.launch * 0.25) : null);
    if (this.downRag) {
      // already under physics (staggering / getting up): push it over
      const r = this.downRag;
      if (r instanceof ActiveRagdoll) {
        r.hit(imp, h.point, undefined, h.strength);
        r.forceFall(h.dir);
      } else r.impulse(imp, h.point);
      if (launch) r.launch(launch, 2);
      this.enterDown();
      return;
    }
    const rag = g.makeRagdoll(this, 0.5);
    if (rag instanceof ActiveRagdoll) {
      this.applyCondition(rag);
      rag.hit(imp, h.point, undefined, h.strength);
      rag.forceFall(h.dir);
      rag.buckle(0.8, 0.3);
    } else rag.impulse(imp, h.point);
    if (launch) rag.launch(launch, 2);
    this.downRag = rag;
    this.ragdoll = rag;
    this.anim.toExternal(rag, 0.03);
    this.physGetUp = rag instanceof ActiveRagdoll && this.wantsPhysGetUp();
    g.euphoria.count(rag instanceof ActiveRagdoll ? 'knockdown' : 'knockdownClassic');
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
    if (r instanceof ActiveRagdoll) {
      if (Math.floor(this.downT * 2) !== Math.floor((this.downT - dt) * 2)) this.applyCondition(r);
      if (r.upright && this.downT > minDown * 0.5) {
        this.recoverFromRagdoll();
        return;
      }
      if (this.physGetUp) {
        // hurt: the controller struggles up on its own (roll over, push up, kneel, rise) - slow and vulnerable
        r.ctl.autoGetUp = this.downT > minDown - 1.3;
        if ((this.downT > minDown + 5.5 && r.mode !== 'getup') || this.downT > minDown + 9) this.getUp();
      } else {
        // the fall, the tumble and the writhing are physical; the get-up itself is the animated one
        r.ctl.autoGetUp = false;
        if (this.downT > minDown && r.mode !== 'falling') this.getUp();
      }
      return;
    }
    if ((r.settled && this.downT > minDown) || this.downT > 5) this.getUp();
  }

  /** The active ragdoll is standing again: blend back into locomotion from its exact pose. */
  recoverFromRagdoll() {
    const r = this.downRag;
    if (!(r instanceof ActiveRagdoll)) return;
    this.game.euphoria.count(this.state === 'stagger' ? 'staggerRecovered' : 'physGetUp');
    r.pelvisPos(_v);
    this.x = _v.x;
    this.z = _v.z;
    this.yaw = r.heading();
    r.pelvisVel(_v);
    this.vx = _v.x * 0.5;
    this.vz = _v.z * 0.5;
    this.anim.update(0, this.x, this.z, this.yaw);
    r.dispose();
    this.downRag = null;
    this.ragdoll = null;
    this.down = false;
    this.solid = true;
    this.toLoco(0.22);
    this.setState('circle');
    this.invuln = 0.25;
    this.attackCooldown = Math.max(this.attackCooldown, rand(0.5, 1.1));
  }

  getUp() {
    const r = this.downRag;
    if (!r) return;
    this.game.euphoria.count(this.physGetUp ? 'physGetUpBailed' : 'animGetUp');
    const pelvis = r.pelvisPos(new THREE.Vector3()), head = r.headPos(new THREE.Vector3());
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
    const edge = h.strength >= 0.9 || h.launch > 0 || h.finisher ? g.edgeLaunch(this.x, this.z, h.dir, h.strength + h.launch * 0.15) : null;
    const launch = edge ?? (h.launch > 0 ? h.dir.clone().multiplyScalar(h.launch).setY(h.launch * 0.35 + 1) : undefined);
    if (this.weapon) this.weapon.drop(new THREE.Vector3(rand(-1.5, 1.5) + h.dir.x * 2, 2.5, rand(-1.5, 1.5) + h.dir.z * 2));
    this.paired = null;
    if (this.downRag) {
      g.death.adopt(this, this.downRag, 'ground', imp.multiplyScalar(0.5), h.point, h.region);
      if (edge) this.downRag.launch(edge.multiplyScalar(0.75), 2);
      this.downRag = null;
    } else {
      g.death.kill(this, h.finisher ? 'finisher' : 'beaten', imp, h.point, launch, h.region);
    }
    g.onEnemyKilled(this, h);
  }

  /** Over the rooftop's edge while under physics, still alive: no coming back from that. */
  fellOff() {
    const g = this.game;
    const rag = this.downRag;
    if (!this.alive || !rag) return;
    g.director.cancel(this);
    this.token = false;
    this.paired = null;
    if (this.weapon) this.weapon.drop(new THREE.Vector3(rand(-1, 1), 1, rand(-1, 1)));
    const at = rag.pelvisPos(new THREE.Vector3());
    // keep the body's own controller running: it flails all the way down
    g.death.adopt(this, rag, 'fell', undefined, undefined, undefined, false);
    this.downRag = null;
    const p = g.player;
    p.stats.kills++;
    p.stats.envKills++;
    p.addCombo(2, 'edge');
    const h = makeHit({ dir: new THREE.Vector3(0, -1, 0), point: at, damage: 999, strength: 1, kind: 'slam', region: 'chest', attacker: p, bleed: 0 });
    g.onEnemyKilled(this, h, 'edge');
    g.onOverEdge(this, true);
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
    this.brain?.onEvaded();
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
    if (this.brain && this.brain.stunAfterPaired > 0) {
      // a perfect counter on a boss: the opening that follows it
      const sec = this.brain.stunAfterPaired;
      this.brain.stunAfterPaired = 0;
      this.game.later(0.05, () => this.stunNow(sec));
    }
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
