import * as THREE from 'three';
import { ctx } from '../game/ctx';
import { events } from '../game/events';
import type { NavGrid } from './NavGrid';
import type { Brain } from './Brain';
import type { Combatant } from '../game/Combat';
import type { LevelInfo, Seat, Spot } from '../world/BarLevel';
import type { Character } from '../characters/Character';

const _v = new THREE.Vector3();

interface PathReq {
  brain: Brain;
  goal: THREE.Vector3;
  cb: (pts: THREE.Vector3[] | null) => void;
}

/** Shared AI services: perception routing, navigation budget, tokens, crowd state. */
export class AIManager {
  readonly brains: Brain[] = [];
  private grid = new Map<number, Combatant[]>();
  private readonly cellSize = 2.0;
  playerField: Float32Array | null = null;
  private playerFieldNode = -1;
  private playerFieldTimer = 0;
  private pathQueue: PathReq[] = [];
  private tokens = new Map<Combatant, Set<Brain>>();
  /** 0..1 how chaotic the bar is */
  intensity = 0;
  /** has the brawl started (anyone fought) */
  brawlStarted = false;
  brawlStartTime = -1;
  maxPlayerAttackers = 2;
  difficulty = 1;
  /** from the difficulty setting; survival scales `difficulty` from this */
  baseDifficulty = 1;
  private thinkCursor = 0;
  time = 0;
  peaceful = false;

  constructor(
    public nav: NavGrid,
    public level: LevelInfo,
  ) {
    events.on('hit', ({ target, hit, result }) => {
      if (result.damage <= 0 && !result.blocked) return;
      this.bumpIntensity(hit.attacker?.isPlayer ? 0.022 : 0.006);
      if (!this.brawlStarted && hit.attacker) this.startBrawl();
      const victimBrain = (target as any).brain as Brain | undefined;
      if (victimBrain && hit.attacker) victimBrain.onAttacked(hit.attacker, result.damage, hit);
      // witnesses
      if (hit.attacker) this.broadcastViolence(hit.attacker, target, hit.point, 13, result.killed ? 1.6 : 1);
    });
    events.on('death', ({ victim, hit }) => {
      this.bumpIntensity(0.035);
      const killer = hit?.attacker ?? (victim as Character).killedBy ?? null;
      if (killer) this.broadcastViolence(killer, victim, victim.position, 16, 2);
      this.releaseTokens(victim);
    });
    events.on('noise', (e) => {
      if (e.kind === 'break' || e.kind === 'shout') {
        this.bumpIntensity(0.01);
        for (const b of this.brains) {
          if (!b.ch.alive) continue;
          const d = b.ch.position.distanceTo(e.pos);
          if (d < e.radius) b.onNoise(e.pos, e.source, e.kind);
        }
      }
    });
  }

  add(b: Brain): void {
    this.brains.push(b);
  }

  remove(b: Brain): void {
    const i = this.brains.indexOf(b);
    if (i >= 0) this.brains.splice(i, 1);
    this.releaseAllTokens(b);
  }

  startBrawl(): void {
    if (this.brawlStarted) return;
    this.brawlStarted = true;
    this.brawlStartTime = ctx.time.elapsed;
    events.emit('noise', { pos: ctx.player.position.clone(), radius: 30, kind: 'shout', source: null });
  }

  bumpIntensity(a: number): void {
    this.intensity = Math.min(1, this.intensity + a);
  }

  /** Tell nearby NPCs someone got hurt. */
  private broadcastViolence(attacker: Combatant, victim: Combatant, pos: THREE.Vector3, radius: number, severity: number): void {
    const r2 = radius * radius;
    for (const b of this.brains) {
      const ch = b.ch;
      if (!ch.alive || ch === victim || ch === attacker) continue;
      const d2 = ch.position.distanceToSquared(pos);
      if (d2 > r2) continue;
      // need to see it (or be very close)
      ch.headPosition(_v);
      const sees = d2 < 9 || ctx.physics.lineOfSight(_v, pos.clone().setY(pos.y + 0.2));
      if (!sees) continue;
      b.onWitness(attacker, victim, severity, Math.sqrt(d2));
    }
  }

  // ------------------------------------------------------------------ spatial hash
  private key(x: number, z: number): number {
    return ((Math.floor(x / this.cellSize) + 512) << 10) | (Math.floor(z / this.cellSize) + 512);
  }

  rebuildGrid(): void {
    this.grid.clear();
    for (const c of ctx.combat.list) {
      if (!c.upright) continue;
      const k = this.key(c.position.x, c.position.z);
      let l = this.grid.get(k);
      if (!l) this.grid.set(k, (l = []));
      l.push(c);
    }
  }

  neighbors(pos: THREE.Vector3, radius: number, out: Combatant[]): Combatant[] {
    out.length = 0;
    const r = Math.ceil(radius / this.cellSize);
    const cx = Math.floor(pos.x / this.cellSize),
      cz = Math.floor(pos.z / this.cellSize);
    for (let dz = -r; dz <= r; dz++)
      for (let dx = -r; dx <= r; dx++) {
        const l = this.grid.get(((cx + dx + 512) << 10) | (cz + dz + 512));
        if (!l) continue;
        for (const c of l) {
          const ddx = c.position.x - pos.x,
            ddz = c.position.z - pos.z;
          if (ddx * ddx + ddz * ddz <= radius * radius && Math.abs(c.position.y - pos.y) < 2) out.push(c);
        }
      }
    return out;
  }

  // ------------------------------------------------------------------ navigation
  requestPath(brain: Brain, goal: THREE.Vector3, cb: (pts: THREE.Vector3[] | null) => void): void {
    // replace existing request from the same brain
    const i = this.pathQueue.findIndex((r) => r.brain === brain);
    if (i >= 0) this.pathQueue.splice(i, 1);
    this.pathQueue.push({ brain, goal: goal.clone(), cb });
  }

  private processPaths(): void {
    let budget = 4;
    while (budget-- > 0 && this.pathQueue.length) {
      const r = this.pathQueue.shift()!;
      if (!r.brain.ch.alive) continue;
      const a = this.nav.nearest(r.brain.ch.position);
      const b = this.nav.nearest(r.goal);
      const nodes = this.nav.path(a, b);
      r.cb(nodes ? this.nav.smooth(nodes) : null);
    }
  }

  private updatePlayerField(dt: number): void {
    this.playerFieldTimer -= dt;
    if (this.playerFieldTimer > 0) return;
    this.playerFieldTimer = 0.3;
    const n = this.nav.nearest(ctx.player.position);
    if (n < 0 || (n === this.playerFieldNode && this.playerField)) return;
    this.playerFieldNode = n;
    this.playerField = this.nav.flowField(n, 90, this.playerField ?? undefined);
  }

  // ------------------------------------------------------------------ attack tokens
  requestToken(b: Brain, target: Combatant): boolean {
    if (!target.isPlayer) return true;
    let set = this.tokens.get(target);
    if (!set) this.tokens.set(target, (set = new Set()));
    if (set.has(b)) return true;
    // drop stale holders
    for (const h of set) if (!h.ch.alive || h.target !== target || !h.ch.upright) set.delete(h);
    const max = this.maxPlayerAttackers + Math.floor(this.intensity * this.difficulty);
    if (set.size < max) {
      set.add(b);
      return true;
    }
    return false;
  }

  releaseToken(b: Brain, target: Combatant | null): void {
    if (!target) return;
    this.tokens.get(target)?.delete(b);
  }

  private releaseAllTokens(b: Brain): void {
    for (const s of this.tokens.values()) s.delete(b);
  }

  private releaseTokens(target: Combatant): void {
    this.tokens.delete(target);
  }

  attackersOn(target: Combatant): number {
    return this.tokens.get(target)?.size ?? 0;
  }

  // ------------------------------------------------------------------ activities
  freeSeats(filter?: (s: Seat) => boolean): Seat[] {
    return this.level.seats.filter((s) => !s.taken && (!filter || filter(s)) && this.seatValid(s));
  }

  seatValid(s: Seat): boolean {
    if (!s.prop) return true;
    const p = s.prop;
    if (p.state !== 'free' || !p.body) return false;
    const t = p.body.translation();
    const r = p.body.rotation();
    // upright and not moved much
    const upY = 1 - 2 * (r.x * r.x + r.z * r.z);
    if (upY < 0.9) return false;
    const dx = t.x - s.pos.x,
      dz = t.z - s.pos.z;
    return dx * dx + dz * dz < 0.25 * 0.25 && Math.abs(t.y - s.pos.y) < 0.2;
  }

  freeSpots(kind?: Spot['kind'] | Spot['kind'][]): Spot[] {
    const kinds = kind ? (Array.isArray(kind) ? kind : [kind]) : null;
    return this.level.spots.filter((s) => !s.taken && (!kinds || kinds.includes(s.kind)));
  }

  // ------------------------------------------------------------------ update
  fixedUpdate(dt: number): void {
    this.rebuildGrid();
    for (const b of this.brains) b.fixedUpdate(dt);
  }

  update(dt: number): void {
    this.time += dt;
    this.intensity = Math.max(0, this.intensity - dt * (this.brawlStarted ? 0.012 : 0.03));
    this.updatePlayerField(dt);
    this.processPaths();
    // staggered thinking: each brain thinks ~8x per second
    const n = this.brains.length;
    if (n > 0) {
      const perFrame = Math.max(1, Math.ceil(n * 8 * dt));
      for (let i = 0; i < perFrame; i++) {
        this.thinkCursor = (this.thinkCursor + 1) % n;
        const b = this.brains[this.thinkCursor];
        b.think();
      }
    }
    for (const b of this.brains) b.update(dt);
  }
}
