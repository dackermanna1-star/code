import { Rng } from '../core/rng';
import { clamp, pointSegDistSq } from '../core/math';
import type { BattleSetup } from './generator';
import { THEMES, type ArenaDef, type ArenaTheme, type PropState } from './arena';
import { C } from './constants';
import { Fighter } from './fighter';
import type { SimEvent } from './events';
import type {
  ActiveAction, Beam, Buff, Command, FightPhase, HitDef, Projectile, Side, WinMethod, Zone, ZoneKind,
} from './types';
import { DT, emptyCommand } from './types';
import { runCombat, type PendingHit } from './combat';
import { updateBeams, updateDecoys, updateProjectiles, updateZones } from './entities';
import {
  BlitzSeq, FinalClashSeq, LastStandSeq, TransformSeq, type Sequence,
} from './sequences';
import { chooseFinisher, FinisherSeq } from './finishers';
import { winProbability } from './winprob';

export interface Controller {
  decide(sim: Simulation, self: Fighter): Command;
  onEvents?(sim: Simulation, events: readonly SimEvent[]): void;
}

export interface SimOptions {
  controllers: [Controller, Controller];
  /** Ticks of pre-fight intro (0 for headless runs). */
  introTicks?: number;
  /** Record a win-probability timeline (results screen). */
  timeline?: boolean;
  /** Headless: skip cosmetic finishers (end immediately at KO). */
  headless?: boolean;
}

export interface Decoy {
  id: number;
  owner: Side;
  x: number;
  y: number;
  vx: number;
  t: number;
  maxT: number;
}

export interface KillInfo {
  attacker: Side | null;
  kind: PendingHit['kind'];
  source: string;
  counter: boolean;
  level: number;
  x: number;
  y: number;
  tick: number;
}

export interface TimelinePoint {
  t: number;
  p0: number;
  hp0: number;
  hp1: number;
}

export class Simulation {
  readonly setup: BattleSetup;
  readonly arena: ArenaDef;
  readonly theme: ArenaTheme;
  readonly fighters: [Fighter, Fighter];
  readonly controllers: [Controller, Controller];
  readonly rng: Rng;
  readonly headless: boolean;
  readonly introTicks: number;

  tick = 0;
  phase: FightPhase = 'intro';
  projectiles: Projectile[] = [];
  beams: Beam[] = [];
  zones: Zone[] = [];
  decoys: Decoy[] = [];
  props: PropState[];
  sequences: Sequence[] = [];
  /** Events produced since the last drain (presentation consumes them). */
  events: SimEvent[] = [];
  /** Events produced during the current tick (controllers' onEvents). */
  private tickEvents: SimEvent[] = [];
  pendingHits: PendingHit[] = [];
  timeStop: { by: Side; t: number } | null = null;
  winner: Side | null = null;
  over = false;
  koTick = -1;
  winMethod: WinMethod | null = null;
  finisherName = '';
  finisherKind = '';
  lastKill: [KillInfo | null, KillInfo | null] = [null, null];
  nextId = 1;
  private hazardTimer = 0;
  timeline: TimelinePoint[] = [];
  private recordTimeline: boolean;
  /** Latest win probability for fighter 0. */
  winProb0 = 0.5;
  /** Set once the decisive blow lands; the finisher sequence is cosmetic. */
  decided = false;
  /** Ticks after the finisher before the sim reports over. */
  private outroT = 0;

  constructor(setup: BattleSetup, opts: SimOptions) {
    this.setup = setup;
    this.arena = setup.arena;
    this.theme = THEMES[setup.arena.theme];
    this.controllers = opts.controllers;
    this.rng = new Rng(setup.rngSeeds.world);
    this.headless = opts.headless ?? false;
    this.introTicks = opts.introTicks ?? C.INTRO_TICKS;
    this.recordTimeline = opts.timeline ?? false;
    this.fighters = [new Fighter(0, setup.fighters[0]), new Fighter(1, setup.fighters[1])];
    for (const f of this.fighters) {
      const side = setup.startSide[f.side];
      f.x = side * C.START_X;
      f.y = 0;
      f.facing = side === -1 ? 1 : -1;
      f.state = this.introTicks > 0 ? 'intro' : 'idle';
      f.history = [];
    }
    this.props = setup.arena.props.map((def) => ({ def, hp: def.maxHp, broken: false, damage: 0, lastHitTick: -999, lastHitDir: 1 }));
    this.hazardTimer = 600 + this.rng.int(0, 360);
    if (this.introTicks === 0) this.phase = 'opening';
  }

  /** Seconds of fight time (excludes the intro). */
  get time(): number {
    return Math.max(0, this.tick - this.introTicks) / 60;
  }

  get inIntro(): boolean {
    return this.tick < this.introTicks;
  }

  emit(e: SimEvent): void {
    this.events.push(e);
    this.tickEvents.push(e);
  }

  /** Drain events for the presentation layer. */
  takeEvents(): SimEvent[] {
    const e = this.events;
    this.events = [];
    return e;
  }

  opponentOf(f: Fighter): Fighter {
    return this.fighters[f.side === 0 ? 1 : 0];
  }

  newId(): number {
    return this.nextId++;
  }

  /* ------------------------------------------------------------------ */
  /* Main loop                                                          */
  /* ------------------------------------------------------------------ */

  step(): void {
    if (this.over) return;
    this.tick++;
    this.tickEvents = [];
    const [f0, f1] = this.fighters;

    if (this.tick <= this.introTicks) {
      for (const f of this.fighters) f.stateT++;
      if (this.tick === this.introTicks) this.beginFight();
      return;
    }

    // Randomised processing order removes any systematic index bias.
    const order: [Fighter, Fighter] = this.rng.next() < 0.5 ? [f0, f1] : [f1, f0];

    // 1. Decide (both from the same snapshot).
    const cmds: [Command, Command] = [emptyCommand(), emptyCommand()];
    if (!this.decided) {
      for (const f of this.fighters) {
        if (f.timeFrozen) continue;
        cmds[f.side] = this.controllers[f.side].decide(this, f);
      }
    }
    // 2. Apply.
    for (const f of order) f.applyCommand(this, cmds[f.side]);

    // 3. Sequences.
    for (const s of this.sequences) if (!s.done) s.update(this);
    this.sequences = this.sequences.filter((s) => !s.done);

    // 4. Fighter state + physics.
    for (const f of order) f.update(this);
    for (const f of order) f.integrate(this);
    this.separate();
    this.propCollisions();

    // 5. Entities.
    updateProjectiles(this);
    updateBeams(this);
    updateZones(this);
    updateDecoys(this);

    // 6. Combat.
    runCombat(this);

    // 7. Deaths / victory.
    this.checkDeaths();

    // 8. Timers.
    if (this.timeStop) {
      this.timeStop.t--;
      if (this.timeStop.t <= 0) this.endTimeStop();
    }
    if (!this.decided) {
      this.updatePhase();
      this.updateHazards();
    }
    if (!this.decided && this.phase !== 'opening') {
      const pw = (C.WRATH_PASSIVE * (this.phase === 'escalation' ? 1 : 1.6) / 60) * this.wrathScale;
      for (const f of this.fighters) if (!f.scripted) f.gainWrath(pw);
    }
    for (const f of this.fighters) {
      f.recordHistory();
      if (f.hp < f.stats.lowestHp) f.stats.lowestHp = Math.max(0, f.hp);
    }
    if (!this.decided) {
      this.winProb0 = winProbability(this);
      const p0 = this.winProb0;
      f0.stats.minWinProb = Math.min(f0.stats.minWinProb, p0);
      f1.stats.minWinProb = Math.min(f1.stats.minWinProb, 1 - p0);
      if (this.recordTimeline && this.tick % 15 === 0) this.timeline.push({ t: this.time, p0, hp0: f0.hp, hp1: f1.hp });
    }

    if (this.decided && this.sequences.length === 0) {
      this.outroT++;
      if (this.outroT === 1) {
        const w = this.fighters[this.winner!];
        w.scripted = false;
        w.setState('victory');
        w.anim = null;
        this.emit({ type: 'victory', winner: this.winner! });
      }
      if (this.outroT > (this.headless ? 0 : 150)) this.over = true;
    }

    for (const c of this.controllers) c.onEvents?.(this, this.tickEvents);
  }

  private beginFight(): void {
    for (const f of this.fighters) {
      f.setState('idle');
      f.anim = null;
      f.scripted = false;
    }
    this.phase = 'opening';
    this.emit({ type: 'phase', phase: 'opening' });
  }

  /** Push-box separation, symmetric. */
  private separate(): void {
    const [a, b] = this.fighters;
    if (a.state === 'vanish' || b.state === 'vanish' || a.state === 'dead' || b.state === 'dead') return;
    if (a.scripted || b.scripted) return;
    if (a.action?.data.noPush || b.action?.data.noPush) return;
    if (a.hasBuff('phase') || b.hasBuff('phase')) return;
    if (a.state === 'knockdown' || b.state === 'knockdown' || a.state === 'getup' || b.state === 'getup') return;
    if (Math.abs(a.y - b.y) > 95) return;
    const dx = b.x - a.x;
    const w = C.PUSH_WIDTH;
    if (Math.abs(dx) >= w) return;
    const dir = dx !== 0 ? Math.sign(dx) : this.rng.sign();
    const overlap = w - Math.abs(dx);
    a.x -= (dir * overlap) / 2;
    b.x += (dir * overlap) / 2;
    const half = this.arena.halfWidth - 20;
    if (a.x < -half) { b.x += -half - a.x; a.x = -half; }
    if (a.x > half) { b.x -= a.x - half; a.x = half; }
    if (b.x < -half) { a.x += -half - b.x; b.x = -half; }
    if (b.x > half) { a.x -= b.x - half; b.x = half; }
  }

  /** Launched fighters crash into destructible props. */
  private propCollisions(): void {
    for (const f of this.fighters) {
      if (!(f.state === 'launched' || f.state === 'hitstun')) continue;
      if (Math.abs(f.vx) < 600) continue;
      for (const p of this.props) {
        if (p.broken) continue;
        const half = p.def.width / 2 + 16;
        if (Math.abs(f.x - p.def.x) > half) continue;
        if (f.y - 60 < -p.def.height) continue;
        // Only collide if moving toward the prop's centre.
        if (Math.sign(p.def.x - f.x) !== Math.sign(f.vx) && Math.abs(f.x - p.def.x) > 6) continue;
        const power = Math.abs(f.vx);
        const dir = Math.sign(f.vx);
        this.damageProp(p, power * 0.16, f.x, f.y - 60, dir);
        const attacker = this.opponentOf(f);
        const dmg = 22 * this.damageScale;
        if (f.hp > 1) {
          const d = Math.min(f.hp - 1, dmg);
          f.hp -= d;
          f.stats.damageTaken += d;
          attacker.stats.damageDealt += d;
        }
        if (p.broken) {
          f.vx *= 0.6;
        } else {
          f.vx = -f.vx * 0.3;
          f.vy = Math.min(f.vy, -300);
          f.x = p.def.x - dir * half;
        }
        this.emit({ type: 'wallSplat', side: f.side, x: f.x, y: f.y - 60, dir });
      }
    }
  }

  damageProp(p: PropState, amount: number, x: number, y: number, dir: number): void {
    if (p.broken) return;
    p.hp -= amount;
    p.damage = clamp(1 - p.hp / p.def.maxHp, 0, 1);
    p.lastHitTick = this.tick;
    p.lastHitDir = dir;
    this.emit({ type: 'propHit', propId: p.def.id, x, y, power: amount });
    if (p.hp <= 0) {
      p.broken = true;
      p.damage = 1;
      this.emit({ type: 'propBreak', propId: p.def.id, dir, x: p.def.x });
    }
  }

  /* ------------------------------------------------------------------ */
  /* Phases, escalation, hazards                                        */
  /* ------------------------------------------------------------------ */

  get damageScale(): number {
    switch (this.phase) {
      case 'collapse': return 1.3 * C.DAMAGE_MULT;
      case 'judgment': return 2.1 * C.DAMAGE_MULT;
      default: return C.DAMAGE_MULT;
    }
  }

  get wrathScale(): number {
    return this.phase === 'climax' || this.phase === 'collapse' || this.phase === 'judgment' ? 1.45 : 1;
  }

  get energyRegenMult(): number {
    return this.phase === 'collapse' || this.phase === 'judgment' ? 1.5 : 1;
  }

  private updatePhase(): void {
    const t = this.time;
    let next: FightPhase = this.phase;
    if (t >= C.T_JUDGMENT) next = 'judgment';
    else if (t >= C.T_COLLAPSE) next = 'collapse';
    else if (t >= C.T_CLIMAX) next = 'climax';
    else if (t >= C.T_ESCALATION) next = 'escalation';
    if (next !== this.phase) {
      this.phase = next;
      this.emit({ type: 'phase', phase: next });
    }
    if (t >= C.T_FINAL && !this.sequences.some((s) => s.kind === 'finalClash')) {
      this.startFinalClash('time');
    }
  }

  private updateHazards(): void {
    if (this.phase === 'opening' || this.timeStop) return;
    const kind = this.theme.hazard;
    const effective = kind === 'none' ? (this.phase === 'collapse' || this.phase === 'judgment' ? 'starfall' : 'none') : kind;
    if (effective === 'none') return;
    this.hazardTimer--;
    if (this.hazardTimer > 0) return;
    const late = this.phase === 'collapse' || this.phase === 'judgment';
    this.hazardTimer = late ? this.rng.int(200, 360) : this.rng.int(420, 760);
    // Target a random fighter's vicinity (symmetric).
    const target = this.fighters[this.rng.int(0, 1)];
    const x = clamp(target.x + this.rng.range(-160, 160), -this.arena.halfWidth + 80, this.arena.halfWidth - 80);
    const zk = `hazard_${effective}` as ZoneKind;
    this.spawnZone(null, {
      kind: zk, x, y: 0, r: effective === 'lava' ? 64 : 72, warn: 78, active: effective === 'lava' ? 26 : 8, interval: effective === 'lava' ? 9 : 0,
      hit: { damage: 52, guard: 20, hitstun: 26, blockstun: 14, kbx: 240, kby: -620, knockdown: true, level: 3 },
      source: zk, fullHeight: effective === 'lightning' || effective === 'voidrift', maxHeight: 600,
    });
    this.emit({ type: 'hazard', kind: zk, x });
  }

  /* ------------------------------------------------------------------ */
  /* Spawning API (used by abilities)                                   */
  /* ------------------------------------------------------------------ */

  spawnProjectile(owner: Fighter, p: Partial<Projectile> & { x: number; y: number; vx: number; vy: number; r: number; hit: HitDef; style: Projectile['style'] }): Projectile {
    const proj: Projectile = {
      id: this.newId(), owner: owner.side, aspect: owner.def.aspect, life: 120, age: 0, homing: 0, gravity: 0, power: 1,
      reflectable: true, slashable: true, grounded: false, pull: 0, explode: 0, dead: false, source: 'proj', frozen: false, rot: 0,
      orbitR: 0, orbitAng: 0, orbitSpeed: 0, releaseTick: -1, armedIn: 0,
      ...p,
    };
    this.projectiles.push(proj);
    owner.stats.projectilesFired++;
    this.emit({ type: 'projectile', side: owner.side, id: proj.id, style: proj.style, x: proj.x, y: proj.y, source: proj.source, aspect: proj.aspect });
    return proj;
  }

  spawnZone(owner: Fighter | null, z: Partial<Zone> & { kind: ZoneKind; x: number; y: number; r: number; warn: number; active: number; hit: HitDef; source: string }): Zone {
    const zone: Zone = {
      id: this.newId(), owner: owner ? owner.side : null, aspect: owner ? owner.def.aspect : null, age: 0, trackUntil: 0, trackSpeed: 0,
      interval: 0, hitSides: 0, dead: false, pull: 0, vx: 0, fullHeight: false, maxHeight: 9999, hitCount: 0,
      ...z,
    };
    this.zones.push(zone);
    if (zone.warn > 0) this.emit({ type: 'zoneWarn', id: zone.id, kind: zone.kind, x: zone.x, y: zone.y, r: zone.r, owner: zone.owner });
    return zone;
  }

  spawnBeam(owner: Fighter, b: { dirX: number; dirY: number; width: number; dps: number; life: number; source: string }): Beam {
    const h = owner.handPos();
    const beam: Beam = {
      id: this.newId(), owner: owner.side, aspect: owner.def.aspect, ox: h.x, oy: h.y, dirX: b.dirX, dirY: b.dirY,
      length: 0, maxLength: 2800, width: b.width, dps: b.dps, life: b.life, age: 0, firing: true, dead: false, struggling: false, source: b.source,
    };
    this.beams.push(beam);
    this.emit({ type: 'beamStart', side: owner.side, id: beam.id, aspect: owner.def.aspect });
    return beam;
  }

  spawnDecoy(owner: Fighter, x: number, y: number, vx: number, t: number): Decoy {
    const d: Decoy = { id: this.newId(), owner: owner.side, x, y, vx, t, maxT: t };
    this.decoys.push(d);
    this.emit({ type: 'decoy', side: owner.side, x, y, fooled: false });
    return d;
  }

  /** Immediate area attack (queued into this tick's combat resolution). */
  explode(owner: Fighter | null, x: number, y: number, r: number, hit: HitDef, source: string, opts: { selfSafe?: boolean; big?: boolean } = {}): void {
    this.emit({ type: 'explosion', x, y, r, aspect: owner ? owner.def.aspect : null, owner: owner ? owner.side : null, power: hit.level });
    for (const f of this.fighters) {
      if (owner && f === owner && opts.selfSafe) continue;
      const hb = f.hurtbox();
      if (!hb) continue;
      const d2 = pointSegDistSq(x, y, hb.ax, hb.ay, hb.bx, hb.by);
      const rr = r + hb.r;
      if (d2 > rr * rr) continue;
      const dirX = f.x === x ? (owner ? owner.facing : 1) : Math.sign(f.x - x);
      this.pendingHits.push({ attacker: owner ? owner.side : null, defender: f.side, hit, x: f.x, y: f.y - 60, dirX, source, kind: 'explosion', height: hit.unblockable ? 'unblockable' : 'mid' });
    }
    for (const p of this.props) {
      if (p.broken) continue;
      if (Math.abs(p.def.x - x) < r + p.def.width / 2 && y > -p.def.height - r) this.damageProp(p, hit.damage * (opts.big ? 2 : 0.8), p.def.x, Math.max(y, -p.def.height * 0.5), Math.sign(p.def.x - x) || 1);
    }
    if (opts.big || r >= 200) {
      for (const pr of this.projectiles) {
        if (owner && pr.owner === owner.side) continue;
        if ((pr.x - x) ** 2 + (pr.y - y) ** 2 < r * r) pr.dead = true;
      }
    }
  }

  queueHit(h: PendingHit): void {
    this.pendingHits.push(h);
  }

  clampToArena(x: number, y: number): { x: number; y: number } {
    return { x: clamp(x, -this.arena.halfWidth + 40, this.arena.halfWidth - 40), y: clamp(y, this.arena.ceiling + 60, 0) };
  }

  teleportTarget(f: Fighter, place: 'behind' | 'above' | 'away' | 'front' | 'flank'): { x: number; y: number } {
    const opp = this.opponentOf(f);
    const half = this.arena.halfWidth - 60;
    const side = Math.sign(opp.x - f.x) || 1; // direction from f to opp
    let x = opp.x, y = 0;
    switch (place) {
      case 'behind': {
        x = opp.x + side * 92;
        if (Math.abs(x) > half) x = opp.x - side * 92;
        y = opp.grounded ? 0 : Math.min(-20, opp.y);
        break;
      }
      case 'above':
        x = opp.x + (this.rng.next() - 0.5) * 60;
        y = Math.max(this.arena.ceiling + 80, Math.min(opp.y - 250, -250));
        break;
      case 'away': {
        x = f.x - side * 620;
        if (Math.abs(x) > half) x = opp.x + side * 620;
        x = clamp(x, -half, half);
        y = 0;
        break;
      }
      case 'front':
        x = opp.x - side * 105;
        y = opp.grounded ? 0 : Math.min(-20, opp.y);
        break;
      case 'flank': {
        const s = this.rng.sign();
        x = opp.x + s * 170;
        y = 0;
        break;
      }
    }
    return { x: clamp(x, -half, half), y };
  }

  /* ------------------------------------------------------------------ */
  /* Callbacks from fighters                                            */
  /* ------------------------------------------------------------------ */

  onAppear(f: Fighter): void {
    this.emit({ type: 'appear', side: f.side, x: f.x, y: f.y, source: f.tpSource });
  }

  onBurst(f: Fighter): void {
    this.emit({ type: 'burst', side: f.side, x: f.x, y: f.y - 60 });
    const opp = this.opponentOf(f);
    if (opp.intangible || opp.scripted) return;
    const dx = opp.x - f.x, dy = (opp.y - 60) - (f.y - 60);
    if (dx * dx + dy * dy < 270 * 270) {
      const dir = Math.sign(dx) || -f.facing;
      opp.action = null;
      opp.setState('launched');
      opp.stun = 26;
      opp.grounded = false;
      opp.y = Math.min(opp.y, -2);
      opp.vx = dir * 950;
      opp.vy = -420;
      opp.pendingKnockdown = true;
      if (opp.hp > 1) {
        const d = Math.min(opp.hp - 1, 20);
        opp.hp -= d;
        opp.stats.damageTaken += d;
        f.stats.damageDealt += d;
      }
    }
  }

  onBuffExpired(f: Fighter, b: Buff): void {
    switch (b.id) {
      case 'shield':
        this.domeBurst(f);
        break;
      case 'phase':
        f.addBuff('empowered', 60, 1);
        this.emit({ type: 'buff', side: f.side, id: 'phase', on: false });
        break;
      case 'ascended':
        this.emit({ type: 'transform', side: f.side, on: false });
        break;
      case 'reflect':
        this.emit({ type: 'buff', side: f.side, id: 'reflect', on: false });
        break;
      default:
        break;
    }
  }

  domeBurst(f: Fighter): void {
    f.removeBuff('shield');
    this.emit({ type: 'buff', side: f.side, id: 'shield', on: false });
    this.explode(f, f.x, f.y - 60, 150, { damage: 30, guard: 30, hitstun: 22, blockstun: 14, kbx: 760, kby: -420, launch: true, level: 2 }, 'ab.aegis', { selfSafe: true });
  }

  onWallSplat(f: Fighter, dir: number): void {
    f.setState('wallsplat');
    f.stun = C.WALLSPLAT_T;
    f.vx = 0;
    f.vy = 0;
    f.pendingWallBounce = false;
    f.lastHitDir = dir;
    const attacker = this.opponentOf(f);
    const d = 20 * this.damageScale;
    if (f.hp > 1) {
      const dd = Math.min(f.hp - 1, d);
      f.hp -= dd;
      f.stats.damageTaken += dd;
      attacker.stats.damageDealt += dd;
      f.comboDamage += dd;
    }
    this.emit({ type: 'wallSplat', side: f.side, x: f.x, y: f.y - 60, dir });
  }

  onHeavyLanding(f: Fighter, v: number): void {
    if (v > 1500) this.emit({ type: 'crater', x: f.x, r: clamp(v / 18, 50, 110) });
  }

  onSlamLanding(f: Fighter, v: number): void {
    this.emit({ type: 'land', side: f.side, x: f.x, y: 0, heavy: true });
    if (v > 900) this.emit({ type: 'crater', x: f.x, r: 60 });
  }

  universalStart(f: Fighter, a: ActiveAction): void {
    if (a.def.id === 'blitz') {
      const opp = this.opponentOf(f);
      const canAccept = opp.energy >= 18 && !opp.inHitstun && !opp.scripted && !opp.timeFrozen && opp.state !== 'knockdown' && opp.state !== 'dead' && !this.sequences.length;
      if (canAccept && this.rng.chance(0.85)) {
        opp.spendEnergy(18);
        this.startSequence(new BlitzSeq(this, f, opp));
      } else {
        const p = this.teleportTarget(f, 'behind');
        f.beginVanish(this, p.x, p.y, 'blitz', 7);
        f.addBuff('haste', 60, 1);
      }
    }
  }

  universalUpdate(f: Fighter, a: ActiveAction): void {
    if (a.def.id === 'beamAnswer') {
      if (!f.grounded) {
        a.data.float = 1;
        f.vy *= 0.85;
      }
      if (a.frame === a.def.startup + a.hold) {
        const opp = this.opponentOf(f);
        const h = f.handPos();
        const ang = Math.atan2(opp.centerY() - h.y, opp.x - h.x);
        this.spawnBeam(f, { dirX: Math.cos(ang), dirY: Math.sin(ang), width: 36, dps: 7.2, life: a.def.active, source: 'beamAnswer' });
      }
      return;
    }
    if (a.def.id === 'kiblast') {
      if (!f.grounded) {
        a.data.float = 1;
        f.vy *= 0.85;
      }
      if (a.frame === a.def.startup + a.hold) {
        const opp = this.opponentOf(f);
        const h = f.handPos();
        const ang = Math.atan2(opp.centerY() - h.y, opp.x - h.x);
        const sp = 980 * (f.def.aspect === 'tempest' ? 1.15 : 1);
        this.spawnProjectile(f, {
          x: h.x, y: h.y, vx: Math.cos(ang) * sp, vy: Math.sin(ang) * sp, r: 12, style: 'kiblast', life: 120, power: 0.7,
          hit: { damage: 26, guard: 8, hitstun: 15, blockstun: 10, kbx: 140, kby: -60, level: 1 }, source: 'kiblast',
        });
      }
    }
  }

  /* ------------------------------------------------------------------ */
  /* Sequences / special states                                         */
  /* ------------------------------------------------------------------ */

  startSequence(s: Sequence): void {
    this.sequences.push(s);
  }

  isLocked(f: Fighter): boolean {
    return f.scripted || f.state === 'locked';
  }

  startTimeStop(f: Fighter, ticks: number): void {
    const opp = this.opponentOf(f);
    if (opp.scripted) return;
    this.timeStop = { by: f.side, t: ticks };
    opp.timeFrozen = true;
    for (const p of this.projectiles) if (p.owner === opp.side) p.frozen = true;
    this.emit({ type: 'timeStop', side: f.side, on: true });
  }

  endTimeStop(): void {
    if (!this.timeStop) return;
    const by = this.timeStop.by;
    this.timeStop = null;
    for (const f of this.fighters) f.timeFrozen = false;
    for (const p of this.projectiles) p.frozen = false;
    this.emit({ type: 'timeStop', side: by, on: false });
  }

  startTransform(f: Fighter): void {
    this.startSequence(new TransformSeq(this, f));
  }

  startFinalClash(reason: 'time' | 'double'): void {
    if (this.decided) return;
    this.endTimeStop();
    for (const s of this.sequences) s.abort?.(this);
    this.sequences = [];
    this.clearEntities();
    this.startSequence(new FinalClashSeq(this, reason));
  }

  clearEntities(): void {
    for (const b of this.beams) if (!b.dead) this.emit({ type: 'beamEnd', side: b.owner, id: b.id });
    this.projectiles = [];
    this.beams = [];
    this.zones = [];
    this.decoys = [];
  }

  /* ------------------------------------------------------------------ */
  /* Death & victory                                                    */
  /* ------------------------------------------------------------------ */

  private checkDeaths(): void {
    if (this.decided) return;
    const dying = this.fighters.filter((f) => f.hp <= 0);
    if (dying.length === 0) return;
    if (dying.length === 2) {
      // Simultaneous knockout: nobody gets a draw. Both cling to life for a final clash.
      for (const f of dying) f.hp = 1;
      this.startFinalClash('double');
      return;
    }
    const loser = dying[0];
    const winner = this.opponentOf(loser);
    // Last Stand: once per fight, a chance (higher with wrath) to refuse death.
    if (!loser.lastStandUsed && this.phase !== 'judgment') {
      const p = C.LAST_STAND_BASE + loser.wrath / 300;
      loser.lastStandUsed = true;
      if (this.rng.chance(p)) {
        loser.hp = 45;
        this.endTimeStop();
        for (const s of this.sequences) s.abort?.(this);
        this.sequences = [];
        this.startSequence(new LastStandSeq(this, loser, winner));
        return;
      }
    }
    this.declareWinner(winner, loser);
  }

  /** Decide the fight. Called on a lethal blow (or by the final clash). */
  declareWinner(winner: Fighter, loser: Fighter, forcedMethod?: WinMethod, forcedSource?: string): void {
    if (this.decided) return;
    this.decided = true;
    this.winner = winner.side;
    this.winProb0 = winner.side === 0 ? 1 : 0;
    this.koTick = this.tick;
    loser.hp = 0;
    this.endTimeStop();
    for (const s of this.sequences) s.abort?.(this);
    this.sequences = [];
    const kill = this.lastKill[loser.side];
    const method: WinMethod = forcedMethod ?? inferMethod(kill);
    this.winMethod = method;
    this.emit({ type: 'ko', winner: winner.side, loser: loser.side, method, x: loser.x, y: loser.y - 60, source: forcedSource ?? kill?.source ?? '' });
    this.clearEntities();
    if (this.headless) {
      this.over = true;
      return;
    }
    const fin = chooseFinisher(this, winner, loser, method, kill);
    this.finisherKind = fin.kind;
    this.finisherName = fin.name;
    this.emit({ type: 'finisher', winner: winner.side, loser: loser.side, kind: fin.kind, name: fin.name });
    this.startSequence(new FinisherSeq(this, winner, loser, fin));
  }

  /** Helper for AI: the decoy (if any) owned by this side. */
  decoyOf(side: Side): Decoy | undefined {
    return this.decoys.find((d) => d.owner === side);
  }

  /** dt accessor for helpers. */
  get dt(): number {
    return DT;
  }
}

function inferMethod(k: KillInfo | null): WinMethod {
  if (!k) return 'combo';
  if (k.source.startsWith('hazard')) return 'hazard';
  if (k.source === 'counterSlash' || k.counter) return 'counter';
  if (k.source === 'bladeLock' || k.source === 'blitz') return 'clash';
  if (k.source === 'beamStruggle') return 'beam';
  switch (k.kind) {
    case 'beam': return 'beam';
    case 'throw': return 'throw';
    case 'projectile': return 'projectile';
    case 'zone': case 'explosion': {
      const ult = ['ab.supernova', 'ab.heavensLance', 'ab.blackHole', 'ab.colossus', 'ab.cataclysm', 'thousandCuts'];
      return ult.includes(k.source) ? 'ultimate' : 'ability';
    }
    case 'sequence':
      return k.source === 'thousandCuts' ? 'ultimate' : 'combo';
    default:
      return 'combo';
  }
}
