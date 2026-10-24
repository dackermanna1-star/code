import * as THREE from 'three';
import { ctx } from '../game/ctx';
import { events } from '../game/events';
import type { AIManager } from './AIManager';
import type { Archetype } from './Archetypes';
import type { Character } from '../characters/Character';
import type { Combatant, HitInfo, HitResult } from '../game/Combat';
import type { Seat, Spot, Work } from '../world/BarLevel';
import type { Prop } from '../world/Props';
import type { WeaponSystem } from '../weapons/Weapons';
import { WEAPONS } from '../weapons/WeaponDefs';
import { P } from '../characters/Rig';
import { clamp, rand, chance, pick, weightedPick, angleDiff, wrapAngle } from '../core/math';
import { QG, CG, groups, GROUPS, RAPIER } from '../physics/Physics';

const SEATED_GROUPS = groups(CG.CHAR, CG.STATIC | CG.CHAR | CG.PLAYER);

export type BrainState = 'idle' | 'goto' | 'activity' | 'watch' | 'combat' | 'getWeapon' | 'flee' | 'cower' | 'down' | 'dead';

type ActivityKind = 'sit' | 'spot' | 'work' | 'wander';
interface Activity {
  kind: ActivityKind;
  seat?: Seat;
  spot?: Spot;
  work?: Work;
  pos: THREE.Vector3;
  yaw: number;
  until: number;
  started: boolean;
  t: number;
  patrolI: number;
  nextGesture: number;
}

const _v = new THREE.Vector3();
const _v2 = new THREE.Vector3();
const _v3 = new THREE.Vector3();
const _e = new THREE.Euler();
const PROP_GROUPS = groups(0xffff, CG.PROP);
const _near: Combatant[] = [];

const NPC_MOVES: Record<string, { dmg: number; force: number; reach: number; lift?: number; heavy?: boolean; kick?: boolean; arc?: number; stun?: number }> = {
  jabL: { dmg: 7, force: 120, reach: 1.3 },
  crossR: { dmg: 9, force: 170, reach: 1.35 },
  hookR: { dmg: 11, force: 230, reach: 1.25, arc: 22 },
  hookL: { dmg: 11, force: 230, reach: 1.25, arc: 22 },
  uppercutR: { dmg: 12, force: 270, reach: 1.2, lift: 0.8 },
  uppercutL: { dmg: 12, force: 270, reach: 1.2, lift: 0.8 },
  haymaker: { dmg: 18, force: 430, reach: 1.4, heavy: true, stun: 0.3 },
  kick: { dmg: 9, force: 520, reach: 1.55, kick: true, heavy: true },
  shove: { dmg: 3, force: 400, reach: 1.25, stun: 0.25 },
};

export class Brain {
  state: BrainState = 'idle';
  target: Combatant | null = null;
  readonly anger = new Map<Combatant, number>();
  fear = 0;
  group = 0;
  name: string;
  // navigation
  private path: THREE.Vector3[] | null = null;
  private pathI = 0;
  private pathGoal = new THREE.Vector3();
  private pathPending = false;
  private pathTime = -10;
  private moveGoal: THREE.Vector3 | null = null;
  private moveSpeed = 1.4;
  private arrive = 0.35;
  private chasePlayer = false;
  private stuckTimer = 0;
  private lastPos = new THREE.Vector3();
  // activity
  act: Activity | null = null;
  // combat
  private attackCD = rand(0.5, 1.5);
  private blockTimer = 0;
  private dodgeCD = 0;
  private strafeDir = chance(0.5) ? 1 : -1;
  private strafeTimer = 0;
  private throwCD = rand(2, 5);
  private tauntCD = rand(4, 8);
  private comboLeft = 0;
  private attacking = false;
  private weaponTarget: Prop | null = null;
  private lastThink = 0;
  private barkCD = 0;
  private calmTimer = 0;
  private hasToken = false;
  private fleeFrom = new THREE.Vector3();
  private watchPos: THREE.Vector3 | null = null;
  private lastSeenTarget = -10;
  private hitCount = 0;
  bubble: { text: string; until: number } | null = null;
  workKind: Work['kind'] | null = null;
  isBoss = false;
  awakeBoss = true;

  constructor(
    public ch: Character,
    public arch: Archetype,
    public mgr: AIManager,
    private weapons: WeaponSystem,
  ) {
    this.name = ch.name;
    ch.brain = this;
    (ch as any).brain = this;
    this.isBoss = !!arch.boss;
    if (arch.drunk) {
      ch.animator.drunk = arch.drunk;
      ch.setExpression('drunk');
    }
    ch.turnSpeed = 6 + arch.p.skill * 6;
  }

  get skill(): number {
    return this.arch.p.skill;
  }

  // ================================================================== events
  onAttacked(attacker: Combatant, damage: number, hit: HitInfo): void {
    if (!this.ch.alive || attacker === this.ch) return;
    this.hitCount++;
    const add = 1.0 + damage / 18;
    this.addAnger(attacker, add);
    // friends of the attacker? no: friends of mine get angry
    this.fear += (1 - this.arch.p.bravery) * 0.35 * (damage / 15);
    if (this.state === 'activity' || this.state === 'idle' || this.state === 'goto' || this.state === 'watch') this.leaveActivity();
    if (this.ch.upright) this.react(attacker);
    if (this.barkCD <= 0 && chance(0.5)) this.bark(this.state === 'flee' ? pick(['AAAH!', 'Help!', 'Stop!']) : pick(this.arch.barks));
    void hit;
  }

  onWitness(attacker: Combatant, victim: Combatant, severity: number, dist: number): void {
    if (!this.ch.alive) return;
    const p = this.arch.p;
    const vb = (victim as any).brain as Brain | undefined;
    const ab = (attacker as any).brain as Brain | undefined;
    const friendVictim = vb && vb.group === this.group && this.group !== 0;
    const friendAttacker = ab && ab.group === this.group && this.group !== 0;
    const closeness = clamp(1.4 - dist / 10, 0.2, 1.2);
    if (friendVictim) this.addAnger(attacker, 0.9 * p.loyalty * severity * closeness);
    else if (friendAttacker) this.addAnger(victim, 0.45 * p.loyalty * closeness);
    else {
      // random bar brawler logic: the more chaos the more people want in
      const k = (attacker.isPlayer ? 0.32 : 0.16) * p.aggression * (0.4 + this.mgr.intensity) * severity * closeness;
      this.addAnger(attacker, k);
    }
    // staff defends the bar
    if (this.workKind === 'bouncer' || this.workKind === 'bartender' || this.workKind === 'bartender2') this.addAnger(attacker, 0.7 * severity);
    this.fear += (1 - p.bravery) * 0.28 * severity * closeness;
    if (this.state === 'idle' || this.state === 'activity' || this.state === 'goto') {
      if (this.maxAnger() < 0.5 && this.fear < 0.6) {
        // curious: turn and watch
        this.startWatch(victim.position);
      }
    }
    this.evaluate();
  }

  onNoise(pos: THREE.Vector3, source: Combatant | null, kind: string): void {
    if (!this.ch.alive) return;
    if (this.state === 'activity' || this.state === 'idle') {
      if (kind === 'break' && chance(0.4)) this.ch.lookAt(pos.clone(), 1);
      if (kind === 'shout' && this.mgr.brawlStarted && chance(0.3)) this.startWatch(pos);
    }
    if (source && kind === 'shout') this.fear += (1 - this.arch.p.bravery) * 0.15;
  }

  addAnger(c: Combatant, a: number): void {
    if (c === this.ch || this.mgr.peaceful) return;
    if (this.isBoss && !this.awakeBoss) return;
    this.anger.set(c, Math.min(5, (this.anger.get(c) ?? 0) + a));
  }

  maxAnger(): number {
    let m = 0;
    for (const [c, v] of this.anger) if (c.alive && v > m) m = v;
    return m;
  }

  private react(attacker: Combatant): void {
    const p = this.arch.p;
    const hp = this.ch.healthFrac;
    const fearful = this.fear > 0.55 + p.bravery * 0.6 || (hp < 0.3 && p.bravery < 0.6 && chance(0.5));
    if (fearful && !this.isBoss) {
      this.startFlee(attacker.position);
    } else {
      this.enterCombat(attacker);
    }
  }

  private evaluate(): void {
    if (!this.ch.alive || !this.ch.upright) return;
    if (this.state === 'combat' || this.state === 'flee' || this.state === 'getWeapon') return;
    const m = this.maxAnger();
    if (this.fear > 0.65 + this.arch.p.bravery * 0.5 && !this.isBoss) {
      const threat = this.bestTarget() ?? null;
      this.startFlee(threat ? threat.position : this.ch.position);
      return;
    }
    if (m > 0.5) {
      const t = this.bestTarget();
      if (t) this.enterCombat(t);
    }
  }

  private bestTarget(): Combatant | null {
    let best: Combatant | null = null;
    let bs = 0;
    for (const [c, v] of this.anger) {
      if (!c.alive || v < 0.25) continue;
      const d = c.position.distanceTo(this.ch.position);
      const sameFloor = Math.abs(c.position.y - this.ch.position.y) < 1.5;
      const s = (v / (1 + d * 0.12)) * (sameFloor ? 1 : 0.6) * (c.upright ? 1 : 0.4) * (c.isPlayer ? 1.6 : 1);
      if (s > bs) {
        bs = s;
        best = c;
      }
    }
    return best;
  }

  // ================================================================== state transitions
  private leaveActivity(): void {
    const a = this.act;
    if (a) {
      if (a.seat) a.seat.taken = null;
      if (a.spot) a.spot.taken = null;
      this.act = null;
    }
    this.standUp();
    this.ch.animator.extra = null;
    this.ch.ambientStance = 'relaxed';
  }

  private standUp(): void {
    const ch = this.ch;
    if (ch.seatedOn) {
      ch.seatedOn = null;
      ch.collider.setCollisionGroups(GROUPS.CHAR);
      ch.body.setLinvel({ x: 0, y: 0, z: 0 }, true);
    }
    ch.animator.setFullBody(null);
  }

  enterCombat(t: Combatant): void {
    if (!this.ch.alive) return;
    if (this.state !== 'combat') {
      this.leaveActivity();
      if (this.barkCD <= 0) this.bark(pick(this.arch.barks));
      events.emit('vocal', { who: this.ch, kind: 'shout', pos: this.ch.position, pitch: this.ch.app.voicePitch });
    }
    this.state = 'combat';
    if (this.target !== t) {
      this.mgr.releaseToken(this, this.target);
      this.hasToken = false;
    }
    this.target = t;
    this.ch.combatMode = true;
    this.ch.setExpression('angry');
    this.calmTimer = 0;
    this.path = null;
  }

  private startFlee(from: THREE.Vector3): void {
    this.leaveActivity();
    this.mgr.releaseToken(this, this.target);
    this.hasToken = false;
    this.state = 'flee';
    this.fleeFrom.copy(from);
    this.ch.combatMode = false;
    this.ch.blocking = false;
    this.ch.ambientStance = 'flee';
    this.ch.setExpression('scared');
    this.bark(pick(['AAAAH!', 'Help!', 'Run!', 'He\'s crazy!', 'Call the cops!']));
    events.emit('vocal', { who: this.ch, kind: 'scream', pos: this.ch.position, pitch: this.ch.app.voicePitch });
    this.pickFleeGoal();
  }

  private pickFleeGoal(): void {
    const nav = this.mgr.nav;
    let best: THREE.Vector3 | null = null;
    let bestScore = -Infinity;
    for (let i = 0; i < 14; i++) {
      const n = nav.randomNodeNear(this.ch.position, 22);
      if (n < 0) continue;
      const p = nav.nodePos(n, new THREE.Vector3());
      const dThreat = p.distanceTo(this.fleeFrom);
      const dSelf = p.distanceTo(this.ch.position);
      const score = dThreat - dSelf * 0.3 + rand(0, 3);
      if (score > bestScore && dThreat > 6) {
        bestScore = score;
        best = p;
      }
    }
    if (best) this.goTo(best, this.ch.stats.speed * 1.05, 0.8);
  }

  private startWatch(pos: THREE.Vector3): void {
    if (this.state === 'combat') return;
    this.leaveActivity();
    this.state = 'watch';
    this.watchPos = pos.clone();
    this.calmTimer = rand(6, 14);
    this.ch.setExpression(chance(0.5) ? 'shock' : 'laugh', 2);
    const d = _v.subVectors(this.ch.position, pos);
    const dist = d.length();
    if (dist < 3.2 && dist > 0.01) {
      d.normalize().multiplyScalar(4);
      this.goTo(_v2.copy(pos).add(d), 1.6, 0.6);
    } else this.stopMoving();
    if (chance(0.35)) this.bark(pick(['Fight! Fight!', 'Ooooh!', 'Get him!', 'Whoa!', 'Somebody stop them!', 'Kick his ass!']));
  }

  private toIdle(): void {
    this.mgr.releaseToken(this, this.target);
    this.hasToken = false;
    this.target = null;
    this.state = 'idle';
    this.ch.combatMode = false;
    this.ch.blocking = false;
    this.ch.ambientStance = 'relaxed';
    this.ch.setExpression(this.arch.drunk ? 'drunk' : 'neutral');
    this.stopMoving();
  }

  // ================================================================== movement
  goTo(p: THREE.Vector3, speed: number, arrive = 0.35, chasePlayer = false): void {
    this.moveGoal = p.clone();
    this.moveSpeed = speed;
    this.arrive = arrive;
    this.chasePlayer = chasePlayer;
    if (chasePlayer) {
      this.path = null;
      return;
    }
    // same floor and walkable: go straight
    if (this.mgr.nav.walkableLine(this.ch.position, p)) {
      this.path = [p.clone()];
      this.pathI = 0;
      return;
    }
    const now = ctx.time.elapsed;
    if (this.path && this.pathGoal.distanceTo(p) < 1.0 && now - this.pathTime < 2.5) return;
    if (this.pathPending && this.pathGoal.distanceTo(p) < 1.0) return;
    this.pathGoal.copy(p);
    this.pathPending = true;
    this.mgr.requestPath(this, p, (pts) => {
      this.pathPending = false;
      this.pathTime = ctx.time.elapsed;
      if (pts && pts.length) {
        this.path = pts;
        this.pathI = Math.min(1, pts.length - 1);
      } else {
        this.path = [p.clone()];
        this.pathI = 0;
      }
    });
  }

  stopMoving(): void {
    this.moveGoal = null;
    this.path = null;
    this.ch.desiredVel.set(0, 0, 0);
  }

  private atGoal(): boolean {
    if (!this.moveGoal) return true;
    const dx = this.moveGoal.x - this.ch.position.x,
      dz = this.moveGoal.z - this.ch.position.z;
    return dx * dx + dz * dz < this.arrive * this.arrive && Math.abs(this.moveGoal.y - this.ch.position.y) < 1.2;
  }

  /** Called every physics step: steering into desiredVel. */
  fixedUpdate(dt: number): void {
    const ch = this.ch;
    if (!ch.alive || ch.state !== 'active' || ch.grabbedBy) {
      ch.desiredVel.set(0, 0, 0);
      return;
    }
    if (ch.seatedOn) {
      ch.desiredVel.set(0, 0, 0);
      return;
    }
    const pos = ch.position;
    let dirX = 0,
      dirZ = 0;
    let speed = 0;
    if (this.moveGoal && !this.atGoal()) {
      let tx = this.moveGoal.x,
        tz = this.moveGoal.z;
      if (this.chasePlayer && this.mgr.playerField) {
        const pl = ctx.player.position;
        if (Math.abs(pl.y - pos.y) < 0.6 && this.mgr.nav.walkableLine(pos, pl)) {
          tx = pl.x;
          tz = pl.z;
        } else {
          const n = this.mgr.nav.nearest(pos, 2);
          if (n >= 0) {
            let next = this.mgr.nav.descend(this.mgr.playerField, n);
            // look two steps ahead for smoother motion
            if (next >= 0) {
              const n2 = this.mgr.nav.descend(this.mgr.playerField, next);
              if (n2 >= 0) next = n2;
              tx = this.mgr.nav.nodeX[next];
              tz = this.mgr.nav.nodeZ[next];
            }
          }
        }
      } else if (this.path && this.path.length) {
        if (this.pathI >= this.path.length) this.pathI = this.path.length - 1;
        let wp = this.path[this.pathI];
        const dx = wp.x - pos.x,
          dz = wp.z - pos.z;
        if (dx * dx + dz * dz < 0.5 * 0.5 && Math.abs(wp.y - pos.y) < 1.0 && this.pathI < this.path.length - 1) {
          this.pathI++;
          wp = this.path[this.pathI];
        }
        tx = wp.x;
        tz = wp.z;
      }
      dirX = tx - pos.x;
      dirZ = tz - pos.z;
      const len = Math.hypot(dirX, dirZ);
      if (len > 1e-3) {
        dirX /= len;
        dirZ /= len;
      }
      // arrive slowdown on final approach
      const gdx = this.moveGoal.x - pos.x,
        gdz = this.moveGoal.z - pos.z;
      const gd = Math.hypot(gdx, gdz);
      speed = this.moveSpeed * clamp(gd / 1.2, 0.35, 1);
    }
    // separation from others
    const near = this.mgr.neighbors(pos, 1.1, _near);
    let sx = 0,
      sz = 0;
    for (const o of near) {
      if (o === ch) continue;
      const dx = pos.x - o.position.x,
        dz = pos.z - o.position.z;
      const d2 = dx * dx + dz * dz;
      if (d2 < 1e-4 || d2 > 1.21) continue;
      const d = Math.sqrt(d2);
      const w = (1.1 - d) / 1.1;
      sx += (dx / d) * w;
      sz += (dz / d) * w;
    }
    if (speed > 0.1) {
      // obstacle feeler for heavy props
      _v.set(pos.x, pos.y + 0.45, pos.z);
      _v2.set(dirX, 0, dirZ);
      const hit = ctx.physics.raycast(_v, _v2, 0.75, PROP_GROUPS);
      if (hit) {
        const prop = ctx.props.propOf(hit.collider);
        if (prop && (prop.def.mass > 12 || prop.fixed)) {
          // steer along the obstacle
          const side = this.strafeDir;
          const px = -dirZ * side,
            pz = dirX * side;
          dirX = dirX * 0.3 + px * 0.9;
          dirZ = dirZ * 0.3 + pz * 0.9;
        }
      }
    }
    let vx = dirX * speed + sx * 2.2;
    let vz = dirZ * speed + sz * 2.2;
    // combat strafing handled in think via moveGoal; extra lateral component
    const vlen = Math.hypot(vx, vz);
    const maxV = Math.max(this.moveSpeed, 1.5) * 1.1;
    if (vlen > maxV) {
      vx *= maxV / vlen;
      vz *= maxV / vlen;
    }
    ch.desiredVel.set(vx, 0, vz);
    // stuck detection
    if (speed > 0.5) {
      const moved = Math.hypot(pos.x - this.lastPos.x, pos.z - this.lastPos.z);
      if (moved < 0.008) this.stuckTimer += dt;
      else this.stuckTimer = Math.max(0, this.stuckTimer - dt * 2);
      if (this.stuckTimer > 1.0) {
        this.stuckTimer = 0;
        this.strafeDir *= -1;
        this.path = null;
        if (this.moveGoal && !this.chasePlayer) this.goTo(this.moveGoal, this.moveSpeed, this.arrive);
      }
    }
    this.lastPos.copy(pos);
  }

  // ================================================================== per-frame
  update(dt: number): void {
    const ch = this.ch;
    this.attackCD -= dt;
    this.blockTimer -= dt;
    this.dodgeCD -= dt;
    this.throwCD -= dt;
    this.tauntCD -= dt;
    this.barkCD -= dt;
    this.strafeTimer -= dt;
    if (this.bubble && ctx.time.elapsed > this.bubble.until) this.bubble = null;
    if (!ch.alive) {
      if (this.state !== 'dead') {
        this.state = 'dead';
        this.leaveActivity();
        this.mgr.releaseToken(this, this.target);
        this.ch.blocking = false;
      }
      return;
    }
    if (ch.blocking && this.blockTimer <= 0) ch.blocking = false;
    // facing
    if (ch.state === 'active' && !ch.seatedOn) {
      if (this.state === 'combat' && this.target) {
        ch.faceTowards(this.target.position);
        this.target.headPosition(_v);
        ch.lookAt(_v, 1);
      } else if (this.state === 'watch' && this.watchPos) {
        ch.faceTowards(this.watchPos);
        ch.lookAt(_v.copy(this.watchPos).setY(this.watchPos.y + 1.4), 1);
      } else if (ch.desiredVel.lengthSq() > 0.2) {
        ch.desiredYaw = Math.atan2(ch.desiredVel.x, ch.desiredVel.z);
        ch.lookAt(null);
      } else if (this.act && this.act.started) {
        ch.desiredYaw = this.act.yaw;
      }
    }
    // activity animation upkeep
    if (this.state === 'activity' && this.act) this.updateActivity(dt);
  }

  // ================================================================== thinking (~8 Hz)
  think(): void {
    const now = ctx.time.elapsed;
    const dt = Math.min(0.5, now - this.lastThink);
    this.lastThink = now;
    const ch = this.ch;
    if (!ch.alive) return;
    // decay
    for (const [c, v] of this.anger) {
      if (!c.alive) this.anger.delete(c);
      else if (this.state !== 'combat') this.anger.set(c, Math.max(0, v - dt * 0.03));
    }
    this.fear = Math.min(2, Math.max(0, this.fear - dt * 0.04));
    if (ch.state === 'ragdoll' || ch.state === 'gettingUp' || ch.state === 'dead') return;
    if (ch.grabbedBy) {
      if (chance(0.15)) this.bark(pick(['Lemme go!', 'Argh!', 'Get off me!', 'Help!']));
      return;
    }
    // brawl fever: idle people decide to join the chaos
    if ((this.state === 'idle' || this.state === 'activity' || this.state === 'watch') && this.mgr.brawlStarted && !this.isBoss) {
      const p = this.arch.p;
      if (chance(p.aggression * (this.mgr.intensity - 0.3) * 0.035 * dt * 8)) {
        const near = this.mgr.neighbors(ch.position, 9, _near).filter((c) => c !== ch && c.upright && c.alive);
        if (near.length) {
          const pl = near.find((c) => c.isPlayer);
          const t = pl && chance(0.6) ? pl : pick(near);
          const tb = (t as any).brain as Brain | undefined;
          if (!tb || tb.group !== this.group || this.group === 0) this.addAnger(t, 0.8);
        }
      }
    }
    switch (this.state) {
      case 'idle':
        this.thinkIdle();
        break;
      case 'goto':
        if (this.atGoal()) this.beginActivity();
        else if (this.act && this.act.seat && !this.mgr.seatValid(this.act.seat)) {
          this.leaveActivity();
          this.state = 'idle';
        }
        this.evaluate();
        break;
      case 'activity':
        if (this.act && now > this.act.until && this.act.kind !== 'work') {
          this.leaveActivity();
          this.state = 'idle';
        } else if (this.act?.seat && !this.mgr.seatValid(this.act.seat)) {
          this.leaveActivity();
          this.state = 'idle';
        }
        this.evaluate();
        break;
      case 'watch':
        this.calmTimer -= dt;
        if (this.calmTimer <= 0 || !this.mgr.brawlStarted) this.toIdle();
        else if (this.atGoal()) {
          this.stopMoving();
          if (chance(0.06)) ch.animator.play(pick(['cheer', 'point', 'laugh']));
        }
        this.evaluate();
        break;
      case 'combat':
        this.thinkCombat(dt);
        break;
      case 'getWeapon':
        this.thinkGetWeapon();
        break;
      case 'flee':
        this.thinkFlee(dt);
        break;
      case 'cower':
        this.thinkCower(dt);
        break;
    }
  }

  // ------------------------------------------------------------------ idle & activities
  private thinkIdle(): void {
    if (this.isBoss && !this.awakeBoss) {
      // the boss waits on his throne
      const w = this.mgr.level.work.find((w) => w.kind === 'boss');
      if (w && !this.act) this.assignWork(w);
      return;
    }
    if (this.workKind && !this.mgr.brawlStarted) {
      const w = this.mgr.level.work.find((w) => w.kind === this.workKind && !(w as any).owner) ?? this.mgr.level.work.find((w) => w.kind === this.workKind);
      if (w) {
        this.assignWork(w);
        return;
      }
    }
    this.pickActivity();
  }

  private assignWork(w: Work): void {
    (w as any).owner = this;
    this.act = { kind: 'work', work: w, pos: w.pos.clone(), yaw: w.yaw, until: Infinity, started: false, t: 0, patrolI: 0, nextGesture: ctx.time.elapsed + rand(2, 6) };
    this.state = 'goto';
    this.goTo(w.pos, 1.5, 0.3);
  }

  private pickActivity(): void {
    const likes = this.arch.likes;
    const keys = Object.keys(likes) as (keyof typeof likes)[];
    if (keys.length === 0) {
      this.wander();
      return;
    }
    const kind = weightedPick(keys, keys.map((k) => likes[k]!));
    const now = ctx.time.elapsed;
    const near = (p: THREE.Vector3) => p.distanceTo(this.ch.position);
    const choose = <T extends { pos: THREE.Vector3 }>(arr: T[]): T | null => {
      if (!arr.length) return null;
      // prefer nearby, same floor
      arr.sort((a, b) => near(a.pos) + Math.abs(a.pos.y - this.ch.position.y) * 6 - (near(b.pos) + Math.abs(b.pos.y - this.ch.position.y) * 6));
      return arr[Math.floor(Math.pow(Math.random(), 2) * Math.min(arr.length, 6))];
    };
    let act: Activity | null = null;
    const mk = (k: ActivityKind, pos: THREE.Vector3, yaw: number, dur: number, extra: Partial<Activity> = {}): Activity => ({
      kind: k,
      pos: pos.clone(),
      yaw,
      until: now + dur,
      started: false,
      t: 0,
      patrolI: 0,
      nextGesture: now + rand(2, 6),
      ...extra,
    });
    if (kind === 'sit') {
      const s = choose(this.mgr.freeSeats((s) => s.zone !== 'vip' || this.arch.id === 'boss'));
      if (s) {
        s.taken = this;
        act = mk('sit', s.pos, s.yaw, rand(25, 70), { seat: s });
      }
    } else if (kind === 'wander') {
      this.wander();
      return;
    } else {
      const map: Record<string, Spot['kind'][]> = {
        bar: ['bar'],
        stand: ['stand'],
        dance: ['dance'],
        pool: ['pool'],
        darts: ['darts'],
        arcade: ['arcade'],
        watch: ['watch'],
        jukebox: ['jukebox'],
        piss: ['piss'],
        vip: ['watch'],
      };
      const sp = choose(this.mgr.freeSpots(map[kind as string] ?? ['stand']));
      if (sp) {
        sp.taken = this;
        const dur = sp.kind === 'piss' ? rand(8, 14) : sp.kind === 'jukebox' ? rand(5, 8) : sp.kind === 'dance' ? rand(20, 45) : rand(18, 50);
        act = mk('spot', sp.pos, sp.yaw, dur, { spot: sp });
      }
    }
    if (!act) {
      this.wander();
      return;
    }
    this.act = act;
    this.state = 'goto';
    this.goTo(act.pos, this.ch.stats.walkSpeed * (this.arch.drunk ? 0.8 : 1), 0.3);
  }

  private wander(): void {
    const n = this.mgr.nav.randomNodeNear(this.ch.position, 10);
    if (n < 0) return;
    const p = this.mgr.nav.nodePos(n, new THREE.Vector3());
    this.act = { kind: 'wander', pos: p, yaw: 0, until: ctx.time.elapsed + rand(3, 8), started: false, t: 0, patrolI: 0, nextGesture: ctx.time.elapsed + 3 };
    this.state = 'goto';
    this.goTo(p, this.ch.stats.walkSpeed, 0.6);
  }

  private beginActivity(): void {
    const a = this.act;
    if (!a) {
      this.state = 'idle';
      return;
    }
    this.stopMoving();
    a.started = true;
    a.t = 0;
    this.state = 'activity';
    const ch = this.ch;
    const anim = ch.animator;
    ch.desiredYaw = a.yaw;
    if (a.kind === 'sit' && a.seat) {
      if (!this.mgr.seatValid(a.seat)) {
        this.leaveActivity();
        this.state = 'idle';
        return;
      }
      // sit: pin the capsule, ignore props so the chair isn't pushed away
      ch.seatedOn = a.seat;
      ch.collider.setCollisionGroups(SEATED_GROUPS);
      ch.teleport(new THREE.Vector3(a.seat.pos.x - Math.sin(a.yaw) * 0.05, a.seat.pos.y, a.seat.pos.z - Math.cos(a.yaw) * 0.05), a.yaw);
      anim.setFullBody(a.seat.kind === 'stool' ? 'sitStool' : a.seat.kind === 'couch' ? 'sitCouch' : 'sitChair');
    } else if (a.kind === 'spot' && a.spot) {
      const k = a.spot.kind;
      if (k === 'dance') {
        anim.danceStyle = Math.floor(Math.random() * 4) as 0 | 1 | 2 | 3;
        anim.danceTempo = 1.9 + Math.random() * 0.4;
        anim.setFullBody('dance');
      } else if (k === 'watch' || k === 'bar') {
        ch.ambientStance = chance(0.5) ? 'leanBar' : 'relaxed';
      } else if (k === 'arcade') {
        anim.extra = (pose, t) => {
          const s = Math.sin(t * 22) * 6;
          pose.setJoint(5, -62 + s, 0, -8);
          pose.setJoint(6, -48 - s, 0, 0);
          pose.setJoint(3, -60 - s, 0, 8);
          pose.setJoint(4, -46 + s, 0, 0);
          pose.setJoint(2, 18, 0, 0);
        };
      } else if (k === 'piss') {
        ch.ambientStance = 'hips';
      }
    } else if (a.kind === 'work' && a.work) {
      this.startWork(a.work);
    }
    if (a.kind === 'wander') {
      a.until = ctx.time.elapsed + rand(1, 3);
    }
  }

  private startWork(w: Work): void {
    const ch = this.ch;
    switch (w.kind) {
      case 'bouncer':
        ch.ambientStance = 'armsCrossed';
        break;
      case 'drummer':
        ch.animator.setFullBody('sitStool');
        ch.animator.extra = (pose, t) => {
          const s = Math.sin(t * 14);
          pose.setJoint(5, -50 + s * 18, 0, -14);
          pose.setJoint(6, -50 - s * 10, 0, 0);
          pose.setJoint(3, -50 - s * 18, 0, 14);
          pose.setJoint(4, -50 + s * 10, 0, 0);
        };
        break;
      case 'guitarist':
        ch.animator.extra = (pose, t) => {
          pose.setJoint(3, -55, 0, -10);
          pose.setJoint(4, -95, 0, 0);
          pose.setJoint(5, -25 + Math.sin(t * 16) * 12, 0, 18);
          pose.setJoint(6, -85, 0, 0);
          pose.setJoint(2, 8 + Math.sin(t * 4) * 8, 0, 0);
        };
        break;
      case 'singer':
        ch.animator.extra = (pose, t) => {
          pose.setJoint(5, -75, 0, -10);
          pose.setJoint(6, -120, 0, 0);
          pose.setJoint(3, -30 + Math.sin(t * 2.3) * 25, 0, 30);
          pose.setJoint(2, -8 + Math.sin(t * 3) * 6, Math.sin(t * 1.3) * 15, 0);
        };
        break;
      case 'boss':
        ch.seatedOn = w;
        ch.collider.setCollisionGroups(SEATED_GROUPS);
        ch.teleport(w.pos, w.yaw);
        ch.animator.setFullBody('sitCouch');
        break;
      default:
        break;
    }
  }

  private updateActivity(dt: number): void {
    const a = this.act!;
    a.t += dt;
    const ch = this.ch;
    const now = ctx.time.elapsed;
    if (now > a.nextGesture && !ch.animator.action) {
      a.nextGesture = now + rand(3, 9);
      const k = a.kind === 'spot' ? a.spot!.kind : a.kind;
      if (k === 'pool') {
        ch.animator.play('poolShot', {
          onEvent: (e) => {
            if (e === 'hit') this.strikePoolBall();
          },
        });
        a.nextGesture = now + rand(6, 12);
      } else if (k === 'darts') {
        ch.animator.play('dartThrow', { onEvent: (e) => e === 'release' && this.throwDart() });
      } else if (k === 'jukebox') {
        ch.animator.play('point');
        if (chance(0.7)) ctx.services.music?.nextSong?.();
      } else if (k === 'sit' || k === 'bar' || k === 'stand' || k === 'watch') {
        const r = Math.random();
        if (r < 0.35) ch.animator.play('gesture');
        else if (r < 0.55) {
          ch.animator.play('laugh');
          ch.setExpression('laugh', 1.2);
        } else if (r < 0.7) ch.animator.play('drink');
        else if (r < 0.78) ch.animator.play('shrug');
        else if (r < 0.84) ch.animator.play('point');
        // look at a nearby person
        const near = this.mgr.neighbors(ch.position, 3, _near).filter((c) => c !== ch);
        if (near.length) ch.lookAt(pick(near).headPosition(new THREE.Vector3()), 0.8);
      } else if (a.kind === 'work' && a.work) {
        this.workGesture(a);
      }
    }
    // patrol work
    if (a.kind === 'work' && a.work?.patrol && !ch.animator.action) {
      const p = a.work.patrol[a.patrolI % a.work.patrol.length];
      if (!this.moveGoal) {
        if (a.t > 4 + Math.random() * 4) {
          a.patrolI++;
          a.t = 0;
          this.goTo(a.work.patrol[a.patrolI % a.work.patrol.length], 1.2, 0.3);
        } else ch.desiredYaw = a.work.yaw;
      } else if (this.atGoal()) {
        this.stopMoving();
        void p;
      }
    }
  }

  private workGesture(a: Activity): void {
    const ch = this.ch;
    switch (a.work!.kind) {
      case 'bartender':
      case 'bartender2':
        ch.animator.play(chance(0.5) ? 'gesture' : 'drink');
        break;
      case 'cook':
        ch.animator.play(ch.weapon ? 'stab' : 'gesture');
        break;
      case 'bouncer':
        if (chance(0.3)) ch.animator.play('point');
        break;
      case 'waitress':
        ch.animator.play('gesture');
        break;
      default:
        break;
    }
  }

  private strikePoolBall(): void {
    // nudge the nearest pool ball in front of us
    const ch = this.ch;
    let best: Prop | null = null;
    let bd = 2.2;
    for (const p of ctx.props.props) {
      if (p.def.id !== 'pool_ball' || !p.body) continue;
      p.position(_v);
      const d = _v.distanceTo(ch.position);
      if (d < bd) {
        bd = d;
        best = p;
      }
    }
    if (best && best.body) {
      ch.forward(_v2);
      best.body.applyImpulse({ x: _v2.x * 0.5 + rand(-0.1, 0.1), y: 0, z: _v2.z * 0.5 + rand(-0.1, 0.1) }, true);
      events.emit('impact', { pos: best.position(new THREE.Vector3()), normal: _v2.clone(), material: 'ceramic', strength: 0.5 });
    }
  }

  private throwDart(): void {
    const ch = this.ch;
    ch.model.updateMatrices();
    const from = ch.model.gripWorld(new THREE.Vector3());
    const spot = this.act?.spot;
    if (!spot) return;
    const target = new THREE.Vector3(16.95, 1.73 + rand(-0.12, 0.12), spot.pos.z + rand(-0.12, 0.12));
    const dart = ctx.props.spawn('dart', from, 0, 0);
    const d = _v.subVectors(target, from);
    const t = d.length() / 12;
    const vel = d.multiplyScalar(1 / t);
    vel.y += 0.5 * 15 * t;
    if (dart.body) {
      dart.body.setLinvel({ x: vel.x, y: vel.y, z: vel.z }, true);
      const q = new THREE.Quaternion().setFromUnitVectors(new THREE.Vector3(0, -1, 0), d.normalize());
      dart.body.setRotation({ x: q.x, y: q.y, z: q.z, w: q.w }, true);
    }
    // darts embed in the board shortly after
    ctx.timers.after(t + 0.1, () => {
      if (dart.body && dart.state === 'free' && dart.position(_v3).x > 16.6) {
        dart.body.setBodyType(RAPIER.RigidBodyType.Fixed, false);
      }
    });
  }

  // ------------------------------------------------------------------ combat
  private thinkCombat(dt: number): void {
    const ch = this.ch;
    // re-target
    const best = this.bestTarget();
    if (best && best !== this.target && (!this.target || !this.target.alive || chance(0.15))) this.enterCombat(best);
    const t = this.target;
    if (!t || !t.alive) {
      this.anger.delete(t!);
      const nt = this.bestTarget();
      if (nt) this.enterCombat(nt);
      else {
        if (chance(0.5) && this.tauntCD <= 0 && t) {
          ch.animator.play(chance(0.5) ? 'taunt' : 'cheer');
          this.bark(pick(['Who\'s next?!', 'Hah!', 'Stay down!', 'Next!']));
          this.tauntCD = rand(5, 10);
        }
        this.calmTimer += dt;
        if (this.calmTimer > 2.5) this.toIdle();
      }
      return;
    }
    // fear / low health
    const p = this.arch.p;
    if (!this.isBoss && ch.healthFrac < 0.25 && chance((1 - p.bravery) * 0.08)) {
      this.startFlee(t.position);
      return;
    }
    const tpos = t.position;
    const dist = Math.hypot(tpos.x - ch.position.x, tpos.z - ch.position.z);
    const dy = tpos.y - ch.position.y;
    const sameFloor = Math.abs(dy) < 1.4;
    const weapon = ch.weapon as any;
    const wdef = weapon ? WEAPONS[weapon.weaponId] : null;
    const reach = wdef ? Math.min(wdef.reach, 2.0) * 0.92 : 1.32;
    // see target
    ch.headPosition(_v);
    t.chestPosition(_v2);
    const visible = dist < 2.5 || ctx.physics.lineOfSight(_v, _v2);
    if (visible) this.lastSeenTarget = ctx.time.elapsed;

    // weapon acquisition
    if (!weapon && !this.isBoss && dist > 2.8 && chance(p.greed * 0.25)) {
      const w = ctx.props.nearestWeapon(ch.position, 6, 0.35);
      if (w) {
        this.weaponTarget = w;
        w.reservedBy = this;
        this.state = 'getWeapon';
        this.mgr.releaseToken(this, t);
        this.hasToken = false;
        this.goTo(w.position(new THREE.Vector3()), ch.stats.speed, 0.6);
        return;
      }
    }
    // throwing when the target is far / unreachable (e.g. up on the balcony)
    if (this.throwCD <= 0 && visible && (dist > 4.5 || !sameFloor) && dist < 14) {
      const throwable = weapon && (wdef?.shatterOnThrow || wdef?.sticks || chance(0.25)) && wdef?.id !== 'sledgehammer';
      if (throwable && chance(p.throwy * 0.7)) {
        this.doThrow(t);
        return;
      }
      if (!weapon && chance(p.throwy * 0.35)) {
        const th = ctx.props.nearestThrowable(ch.position, 2.5);
        if (th) {
          th.reservedBy = this;
          this.weaponTarget = th;
          this.state = 'getWeapon';
          this.goTo(th.position(new THREE.Vector3()), ch.stats.speed, 0.6);
          return;
        }
      }
      this.throwCD = rand(1.5, 4);
    }
    // block / dodge reactions vs the player
    if (t.isPlayer && dist < 2.6 && this.blockTimer <= 0 && !this.attacking) {
      const pl = ctx.player;
      const facingMe = Math.abs(angleDiff(Math.atan2(-(ch.position.x - pl.position.x), -(ch.position.z - pl.position.z)), pl.ctrl.yaw)) < 0.6;
      if (facingMe && (pl.isAttacking || pl.isWindingUp)) {
        if (pl.isWindingUp && this.dodgeCD <= 0 && chance(this.skill * 0.35)) {
          // dodge back
          _v.subVectors(ch.position, pl.position).setY(0).normalize().multiplyScalar(5.5);
          ch.push(_v);
          this.dodgeCD = rand(2, 4);
        } else if (chance(this.skill * 0.55)) {
          ch.blocking = true;
          ch.blockStart = ctx.time.elapsed;
          this.blockTimer = rand(0.35, 0.9);
        }
      }
    }
    // movement & attacking
    const wantToken = dist < 4.5;
    if (wantToken && !this.hasToken) this.hasToken = this.mgr.requestToken(this, t);
    if (!wantToken && this.hasToken) {
      this.mgr.releaseToken(this, t);
      this.hasToken = false;
    }
    const engage = this.hasToken || !t.isPlayer;
    if (!sameFloor || dist > 2.6 || !visible) {
      // approach
      const run = dist > 4 ? ch.stats.speed : ch.stats.speed * 0.75;
      this.goTo(tpos, run, engage ? reach * 0.7 : 2.2, t.isPlayer);
    } else if (engage) {
      if (dist > reach + 0.15) {
        this.goTo(tpos, ch.stats.speed * 0.8, reach * 0.65, t.isPlayer);
      } else {
        this.stopMoving();
        if (dist < 0.8) {
          // too close: step back a little
          _v.subVectors(ch.position, tpos).setY(0).normalize().multiplyScalar(1.2).add(ch.position);
          this.goTo(_v, 2.0, 0.2);
        }
        if (this.attackCD <= 0 && ch.canAct && !ch.blocking && Math.abs(angleDiff(ch.yaw, ch.yawTo(tpos))) < 0.5) this.startAttack(t, wdef);
      }
    } else {
      // wait our turn: circle at a distance
      if (this.strafeTimer <= 0) {
        this.strafeTimer = rand(1, 2.5);
        if (chance(0.35)) this.strafeDir *= -1;
      }
      const ang = Math.atan2(ch.position.x - tpos.x, ch.position.z - tpos.z) + this.strafeDir * 0.5;
      const r = 2.4 + Math.sin(ctx.time.elapsed + this.ch.id) * 0.3;
      _v.set(tpos.x + Math.sin(ang) * r, ch.position.y, tpos.z + Math.cos(ang) * r);
      this.goTo(_v, 1.8, 0.3);
      if (this.tauntCD <= 0 && chance(0.25)) {
        ch.animator.play(chance(0.5) ? 'beckon' : 'taunt');
        this.bark(pick(['C\'mon!', 'Let me at him!', 'You\'re mine!', 'Get over here!']));
        this.tauntCD = rand(5, 9);
      }
    }
  }

  private startAttack(t: Combatant, wdef: (typeof WEAPONS)[string] | null): void {
    const ch = this.ch;
    let move: string;
    if (wdef) move = pick(wdef.npcMoves);
    else {
      const m = this.arch.moves;
      const keys = Object.keys(m);
      move = weightedPick(keys, keys.map((k) => m[k]));
    }
    this.attacking = true;
    const speed = ch.stats.attackSpeed * (0.9 + this.skill * 0.25) * rand(0.92, 1.08);
    events.emit('vocal', { who: ch, kind: move === 'haymaker' || wdef?.heavy ? 'effort' : 'grunt', pos: ch.position, pitch: ch.app.voicePitch });
    ch.animator.play(move, {
      speed,
      onEvent: (e) => {
        if (e === 'hit') this.attackHit(move, wdef, t);
      },
      onEnd: () => {
        this.attacking = false;
        // combos for skilled fighters
        if (this.comboLeft > 0 && this.state === 'combat' && ch.canAct) {
          this.comboLeft--;
          this.attackCD = 0.05;
        }
      },
    });
    const dur = (ch.animator.action?.def.duration ?? 0.6) / speed;
    ch.attackLock = dur * 0.85;
    this.attackCD = dur + rand(0.35, 1.3) * (1.4 - this.skill) / this.mgr.difficulty;
    if (this.comboLeft <= 0 && chance(this.skill * 0.5)) this.comboLeft = 1 + (chance(this.skill * 0.5) ? 1 : 0);
  }

  private attackHit(move: string, wdef: (typeof WEAPONS)[string] | null, intended: Combatant): void {
    const ch = this.ch;
    if (!ch.alive || ch.state !== 'active') return;
    const m = NPC_MOVES[move];
    const reach = wdef ? Math.min(wdef.reach, 2.1) : (m?.reach ?? 1.3);
    const origin = ch.chestPosition(new THREE.Vector3());
    origin.y += 0.15;
    // aim toward the intended target's head/chest with skill based error
    const aimAtHead = chance(0.55);
    const aimPt = aimAtHead ? intended.headPosition(new THREE.Vector3()) : intended.chestPosition(new THREE.Vector3());
    if (m?.kick) aimPt.y -= 0.25;
    const baseDir = aimPt.sub(origin);
    const flatDist = Math.hypot(baseDir.x, baseDir.z);
    let yaw = Math.atan2(baseDir.x, baseDir.z);
    // if the target slipped out of our facing cone, swing where we're facing
    if (Math.abs(angleDiff(ch.yaw, yaw)) > 0.6) yaw = ch.yaw;
    const pitch = Math.atan2(baseDir.y, Math.max(flatDist, 0.2));
    const err = (1 - this.skill) * 0.12;
    const arc = (wdef && !move.includes('stab') ? 28 : m?.arc ?? 10) * (Math.PI / 180);
    const rays = wdef ? 7 : 5;
    let hitDone: Combatant | null = null;
    let bestHit: { target: Combatant; hit: any } | null = null;
    for (let i = 0; i < rays; i++) {
      const off = rays > 1 ? -arc + (2 * arc * i) / (rays - 1) : 0;
      const yy = wrapAngle(yaw + off + rand(-err, err));
      const pp = pitch + rand(-err, err) * 0.5;
      _v.set(Math.sin(yy) * Math.cos(pp), Math.sin(pp), Math.cos(yy) * Math.cos(pp));
      const th = ctx.combat.rayHit(origin, _v, reach, 0.12, (c) => c === ch);
      if (th && (!bestHit || th.hit.dist < bestHit.hit.dist)) {
        // walls in the way?
        if (ctx.physics.raycast(origin, _v, th.hit.dist, QG.WORLD)) continue;
        bestHit = th;
      }
    }
    if (!bestHit) {
      events.emit('whiff', { attacker: ch, pos: origin.clone().add(new THREE.Vector3(Math.sin(yaw) * 0.8, 0, Math.cos(yaw) * 0.8)), heavy: !!(m?.heavy || wdef?.heavy) });
      return;
    }
    const target = bestHit.target;
    hitDone = target;
    // NPCs brawling among themselves hurt each other less, so the player stays the main event
    const dmgMul = ch.stats.damageMul * (0.85 + 0.15 * this.mgr.difficulty) * (target.isPlayer ? 1 : 0.32);
    const dir = new THREE.Vector3().subVectors(bestHit.hit.world, origin).normalize();
    const hit: HitInfo = wdef
      ? {
          attacker: ch,
          damage: wdef.damage * 0.75 * dmgMul,
          type: wdef.type,
          part: bestHit.hit.part,
          point: bestHit.hit.world.clone(),
          dir,
          force: wdef.force * 0.85,
          source: 'melee',
          local: bestHit.hit.local,
          face: bestHit.hit.face,
          weaponId: wdef.id,
          heavy: wdef.heavy,
          carve: wdef.carve,
          dismember: wdef.dismember * 0.7,
          bleed: wdef.bleed,
          stun: wdef.stun,
        }
      : {
          attacker: ch,
          damage: (m?.dmg ?? 7) * dmgMul,
          type: 'blunt',
          part: bestHit.hit.part,
          point: bestHit.hit.world.clone(),
          dir,
          force: (m?.force ?? 150) * (0.8 + 0.2 * dmgMul),
          source: 'melee',
          local: bestHit.hit.local,
          face: bestHit.hit.face,
          kick: m?.kick,
          heavy: m?.heavy,
          lift: m?.lift,
          stun: m?.stun,
          carve: 0.9,
        };
    const res: HitResult = target.receiveHit(hit);
    if (wdef && !res.parried) {
      if (this.weapons.characterWeaponHit(ch, hit.point, dir)) this.bark(pick(['My weapon!', 'Damn!']));
    }
    if (target.isPlayer) {
      ctx.time.hitStop(res.blocked ? 0.03 : 0.05);
    }
    // accidental hit on someone else: they get mad at us
    if (target !== intended && !target.isPlayer) {
      const tb = (target as any).brain as Brain | undefined;
      tb?.addAnger(ch, 1.2);
    }
    if (res.killed && this.tauntCD <= 0) {
      this.tauntCD = rand(3, 6);
      ctx.timers.after(0.6, () => {
        if (ch.alive && this.state === 'combat' && ch.canAct) {
          ch.animator.play('taunt');
          this.bark(pick(['Ha! Lights out!', 'Stay down!', 'Next!', 'Who\'s next?!']));
        }
      });
    }
    void hitDone;
  }

  private doThrow(t: Combatant): void {
    const ch = this.ch;
    if (!ch.weapon) return;
    this.throwCD = rand(2.5, 5);
    this.attacking = true;
    const heavy = (ch.weapon as any).def?.heavy;
    ch.animator.play(heavy ? 'throwHeavy' : 'throw', {
      onEvent: (e) => {
        if (e !== 'release' || !ch.alive || ch.state !== 'active') return;
        const tp = t.chestPosition(new THREE.Vector3());
        // lead the target a little
        if (t.isPlayer) tp.addScaledVector(ctx.player.ctrl.body.linvel() as any, 0.25);
        this.weapons.characterThrow(ch, tp);
        events.emit('vocal', { who: ch, kind: 'effort', pos: ch.position, pitch: ch.app.voicePitch });
      },
      onEnd: () => (this.attacking = false),
    });
    ch.attackLock = 0.8;
    if (chance(0.5)) this.bark(pick(['Catch!', 'Eat this!', 'Heads up!']));
  }

  private thinkGetWeapon(): void {
    const ch = this.ch;
    const w = this.weaponTarget;
    if (!w || w.state !== 'free' || !w.body || (w.reservedBy && w.reservedBy !== this) || ch.weapon) {
      if (w && w.reservedBy === this) w.reservedBy = null;
      this.weaponTarget = null;
      this.state = 'combat';
      return;
    }
    const wp = w.position(new THREE.Vector3());
    const d = Math.hypot(wp.x - ch.position.x, wp.z - ch.position.z);
    if (d < 0.95 && Math.abs(wp.y - ch.position.y) < 1.6) {
      this.stopMoving();
      ch.faceTowards(wp);
      if (!ch.animator.action) {
        ch.animator.play('pickup', {
          onEvent: (e) => {
            if (e === 'grab' && ch.alive && ch.state === 'active' && w.state === 'free') {
              this.weapons.characterPickUp(ch, w);
            }
          },
          onEnd: () => {
            this.weaponTarget = null;
            if (this.state === 'getWeapon') this.state = this.target ? 'combat' : 'idle';
          },
        });
      }
    } else this.goTo(wp, ch.stats.speed, 0.6);
  }

  private thinkFlee(dt: number): void {
    const ch = this.ch;
    // look for the nearest threat
    let threat: Combatant | null = null;
    let td = Infinity;
    for (const [c, v] of this.anger) {
      if (!c.alive || v < 0.2) continue;
      const d = c.position.distanceTo(ch.position);
      if (d < td) {
        td = d;
        threat = c;
      }
    }
    if (threat) this.fleeFrom.copy(threat.position);
    if (this.atGoal() || !this.moveGoal) {
      if (threat && td < 5) this.pickFleeGoal();
      else {
        this.state = 'cower';
        this.stopMoving();
        ch.ambientStance = 'relaxed';
        ch.animator.setFullBody('cower');
        this.calmTimer = rand(8, 18);
      }
    }
    // cornered: fight back
    if (threat && td < 1.6 && chance(0.3 + this.arch.p.aggression * 0.3)) {
      this.ch.animator.setFullBody(null);
      this.fear *= 0.5;
      this.enterCombat(threat);
    }
    if (chance(0.04 * dt * 8)) {
      this.bark(pick(['AAAH!', 'Help!', 'Please!', 'Somebody!']));
      events.emit('vocal', { who: ch, kind: 'scream', pos: ch.position, pitch: ch.app.voicePitch });
    }
  }

  private thinkCower(dt: number): void {
    const ch = this.ch;
    this.calmTimer -= dt;
    let threatNear: Combatant | null = null;
    for (const [c, v] of this.anger) {
      if (c.alive && v > 0.2 && c.position.distanceTo(ch.position) < 4) threatNear = c;
    }
    if (threatNear) {
      ch.animator.setFullBody(null);
      if (chance(0.4 + this.arch.p.aggression * 0.4)) this.enterCombat(threatNear);
      else this.startFlee(threatNear.position);
      return;
    }
    if (chance(0.03)) this.bark(pick(['Please...', 'Don\'t hurt me...', '*sob*', 'Is it over?']));
    if (this.calmTimer <= 0 && this.mgr.intensity < 0.3) {
      ch.animator.setFullBody(null);
      this.fear = 0.2;
      this.toIdle();
    }
  }

  // ================================================================== misc
  bark(text: string): void {
    this.bubble = { text, until: ctx.time.elapsed + 2.2 };
    this.barkCD = rand(2.5, 5);
    const kind = this.state === 'flee' || this.state === 'cower' ? 'scream' : /^(ha|heh|yee|woo)/i.test(text) ? 'laugh' : this.state === 'combat' ? 'taunt' : 'shout';
    events.emit('vocal', { who: this.ch, kind, pos: this.ch.position, pitch: this.ch.app.voicePitch });
  }

  onKnockdown(): void {
    this.leaveActivity();
    this.attacking = false;
    this.mgr.releaseToken(this, this.target);
    this.hasToken = false;
    this.stopMoving();
  }

  onGetUp(): void {
    if (!this.ch.alive) return;
    const t = this.bestTarget();
    if (this.fear > 0.8 && !this.isBoss) this.startFlee(t ? t.position : this.ch.position);
    else if (t) this.enterCombat(t);
    else this.toIdle();
  }

  onDeath(): void {
    this.leaveActivity();
    this.mgr.releaseToken(this, this.target);
    this.state = 'dead';
    if (this.weaponTarget?.reservedBy === this) this.weaponTarget.reservedBy = null;
    if (this.act?.work) (this.act.work as any).owner = null;
  }

  /** brain hook used by Character */
  onHit(_hit: HitInfo, _res: HitResult): void {}

  debugString(): string {
    return `${this.name} [${this.arch.id}] ${this.state} hp=${Math.round(this.ch.health)} anger=${this.maxAnger().toFixed(2)} fear=${this.fear.toFixed(2)}`;
  }
}

void _e;
