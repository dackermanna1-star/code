// Zombie base class: side-plane hit shapes (Seal Hunter's view-consistent hit
// rule), locomotion with the corpse barricade, burning, grabbing the hunter,
// damage and death (corpses, bounties, reanimation timers).
import type { DeathKind, HitPart, WeaponId, ZombieKind } from '../config/ids';
import { ESCAPE_X, HUNTER, LANE_MAX_Z, LANE_MIN_Z, TICK, TICK_RATE, leftEdgeX } from '../config/world';
import { ZOMBIES, type ZombieDef } from '../config/zombies';
import { BARRICADE, FIRE, GROAN_SECONDS, HUNTER_RULES } from '../config/rules';
import type { ZombieState, ZombieView } from './api';
import type { V3 } from './events';
import type { Player } from './Player';
import type { World } from './World';

/** Axis-aligned ellipse in the zombie's side plane: x relative to the zombie (facing +x), y absolute height. */
export interface HitShape {
  cx: number;
  cy: number;
  a: number;
  b: number;
  part: HitPart;
  /** Riot armour piece (PLATE_* flag) when part === 'plate'. */
  plate?: number;
}

/** What a gun line at a given height meets: the rightmost shape and the body's span. */
export interface SilhouetteHit {
  right: number;
  left: number;
  shape: HitShape;
}

export type DamageSource =
  | 'bullet'
  | 'pellet'
  | 'nail'
  | 'harpoon'
  | 'flare'
  | 'fire'
  | 'blast'
  | 'cannon'
  | 'crates'
  | 'kick'
  | 'stomp'
  | 'sea';

export interface DamageInfo {
  damage: number;
  part: HitPart;
  /** The shape that was hit (plates). */
  shape?: HitShape;
  point: V3;
  dirX: number;
  dirZ: number;
  source: DamageSource;
  player: Player | null;
  weapon: WeaponId | null;
  /** Distance from the muzzle (head-off range). */
  range?: number;
  /** Explosion near its centre: a kill tears the body apart. */
  gib?: boolean;
  /** Explicit displacement of the body if this blow kills (harpoon reel, kick). */
  push?: { x: number; z: number };
}

export interface ZombieOpts {
  x?: number;
  z?: number;
  boss?: boolean;
  look?: number;
  /** A corpse that got back up (crawler). */
  risen?: boolean;
  /** Override life (debug/tests). */
  life?: number;
  medal?: boolean;
}

const SOLID_STATES: ReadonlySet<ZombieState> = new Set<ZombieState>(['walk', 'run', 'burn', 'spawn']);

export abstract class Zombie implements ZombieView {
  readonly id: number;
  readonly kind: ZombieKind;
  readonly look: number;
  readonly def: ZombieDef;
  x = 0;
  y = 0;
  z = 0;
  vx = 0;
  vz = 0;
  facing = 1;
  state: ZombieState = 'spawn';
  stateTicks = 0;
  distance = 0;
  life: number;
  maxLife: number;
  isBoss: boolean;
  risen = false;
  burning = 0;
  plates = 0;
  nails = 0;
  stretcher?: { id: number; role: 'front' | 'back' | 'patient' };
  enraged?: boolean;
  /** The Marathon's 40th runner wears the gold medal. */
  medal?: boolean;
  dead = false;
  removed = false;

  // ---- logic internals -------------------------------------------------------
  bounty: number;
  /** Cruise speed (m/s) before corpse slowdown / panic. */
  speed: number;
  ticks = 0;
  lastHit: DamageInfo | null = null;
  /** Who set it on fire (bounty for fire kills). */
  burnBy: Player | null = null;
  /** The hunter it is holding on to. */
  grabbing: Player | null = null;
  /** Corpse slowdown factor applied this tick (1 = free). */
  slow = 1;
  /** Death kind and corpse once dead. */
  deathKind: DeathKind | null = null;
  corpseId: number | null = null;
  /** Kinds that pick their own lane changes (shamblers drift, joggers zig-zag); others settle back to straight. */
  protected steersLanes = false;
  /** Locomotion state to return to after timed states. */
  protected gait: ZombieState = 'walk';
  /** Length (ticks) of the current timed state. */
  protected stateLen = 0;
  private groanIn: number;
  protected readonly world: World;
  protected readonly shapeBuf: HitShape[] = [];

  constructor(world: World, kind: ZombieKind, opts: ZombieOpts = {}) {
    this.world = world;
    this.id = world.nextId('zombie');
    this.kind = kind;
    this.def = ZOMBIES[kind];
    this.look = opts.look ?? world.rng.int(0, 0x7fffffff);
    this.isBoss = !!opts.boss;
    const ch = Math.max(1, world.chapter);
    const life = opts.life ?? this.def.life + this.def.lifeInc * (ch - 1);
    this.life = this.maxLife = Math.max(1, life);
    this.bounty = this.def.bounty;
    const [s0, s1] = this.def.speed;
    this.speed = s0 === s1 ? s0 : world.rng.range(s0, s1);
    this.z = opts.z ?? world.rng.range(LANE_MIN_Z, LANE_MAX_Z);
    this.x = opts.x ?? world.spawnXFor(this.z, this.def.halfLength);
    if (opts.medal) this.medal = true;
    this.groanIn = Math.round(world.rng.range(1, GROAN_SECONDS[1]) * TICK_RATE);
  }

  get alive(): boolean {
    return !this.dead && this.life > 0;
  }

  /** Standing height for this pose (crawlers are low). */
  get height(): number {
    return this.def.height;
  }

  /** On screen (horn, cannon, groans). */
  get onScreen(): boolean {
    return this.x + this.def.halfLength > leftEdgeX(this.z);
  }

  /** Crawling / rising: low profile, gets kicked and stomped. */
  get crawling(): boolean {
    return this.state === 'crawl' || this.state === 'rise';
  }

  setState(s: ZombieState, lenSeconds = 0): void {
    this.state = s;
    this.stateTicks = 0;
    this.stateLen = Math.round(lenSeconds * TICK_RATE);
  }

  /** Locomotion state for the current situation. */
  protected locomotion(): ZombieState {
    if (this.burning > 0 && this.panics()) return 'burn';
    return this.gait;
  }

  /** Burning makes it run in panic (bosses and crawlers keep their gait). */
  protected panics(): boolean {
    return !this.isBoss && this.gait !== 'crawl';
  }

  /** Side-plane hit shapes for the current pose (facing +x). */
  abstract shapes(): HitShape[];

  /** Rightmost shape (and body span) crossed by a horizontal line at height y. */
  silhouetteAt(y: number): SilhouetteHit | null {
    let best: SilhouetteHit | null = null;
    let left = Infinity;
    for (const s of this.shapes()) {
      const dy = (y - s.cy) / s.b;
      if (dy < -1 || dy > 1) continue;
      const w = s.a * Math.sqrt(1 - dy * dy);
      const c = this.x + (this.facing >= 0 ? s.cx : -s.cx);
      if (c - w < left) left = c - w;
      if (!best || c + w > best.right) best = { right: c + w, left: 0, shape: s };
    }
    if (best) best.left = left;
    return best;
  }

  /** Broad-phase x extent. */
  get left(): number {
    return this.x - this.def.halfLength - 1.2;
  }
  get right(): number {
    return this.x + this.def.halfLength + 1.2;
  }

  // ------------------------------------------------------------------ per tick

  tick(): void {
    this.ticks++;
    this.stateTicks++;
    if (this.dead || this.removed) return;
    if (this.burning > 0) this.burnTick();
    if (this.dead || this.life <= 0) return;
    this.think();
    this.move();
    if (this.alive) this.contacts();
    if (this.alive && this.x - this.def.halfLength * 0.5 > ESCAPE_X) this.world.zombieEscaped(this);
    if (--this.groanIn <= 0) {
      this.groanIn = Math.round(this.world.rng.range(GROAN_SECONDS[0], GROAN_SECONDS[1]) * TICK_RATE);
      if (this.onScreen && this.alive) this.world.groan(this);
    }
  }

  /** Default behaviour: timed states, then cruise. Subclasses refine `cruise`. */
  protected think(): void {
    switch (this.state) {
      case 'stagger':
      case 'trip':
      case 'rise':
      case 'belch':
      case 'enrage':
        this.vx = this.state === 'stagger' ? Math.min(0, this.vx * 0.8) : 0;
        this.vz = 0;
        if (this.stateTicks >= this.stateLen) this.endTimedState();
        return;
      case 'grab':
        this.holdGrab();
        return;
      case 'spawn':
        if (this.stateTicks >= 20) this.setState(this.locomotion());
        break;
      case 'walk':
      case 'run':
      case 'crawl':
      case 'burn': {
        const want = this.locomotion();
        if (want !== this.state) this.setState(want);
        break;
      }
      default:
        break;
    }
    this.cruise();
  }

  protected endTimedState(): void {
    this.setState(this.locomotion());
  }

  /** Desired velocity (m/s) for the locomotion states. */
  protected cruise(): void {
    const panic = this.burning > 0 ? FIRE.panicSpeed : 1;
    this.vx = this.speed * panic * this.facing;
    if (this.state === 'burn') {
      // Flailing panic: lurch across lanes.
      if (this.ticks % 25 === 0) this.vz = this.world.rng.range(-1.6, 1.6);
    } else if (!this.steersLanes) {
      this.vz *= 0.9;
    }
  }

  /** Integrate with corpse slowdown, keep inside the lanes. */
  protected move(): void {
    let k = 1;
    if (this.def.slowedByCorpses && this.vx > 0.01 && this.state !== 'stagger') {
      const n = this.world.obstaclesAhead(this);
      k = 1 / (1 + BARRICADE.slowK * Math.min(BARRICADE.maxN, n));
    }
    this.slow = k;
    const dx = this.vx * k * TICK;
    const dz = this.vz * k * TICK;
    this.x += dx;
    this.z += dz;
    this.distance += Math.hypot(dx, dz);
    if (this.z < LANE_MIN_Z) {
      this.z = LANE_MIN_Z;
      this.vz = Math.abs(this.vz);
      this.onLaneBounce();
    } else if (this.z > LANE_MAX_Z) {
      this.z = LANE_MAX_Z;
      this.vz = -Math.abs(this.vz);
      this.onLaneBounce();
    }
  }

  protected onLaneBounce(): void {}

  /** Can this zombie grab the hunter right now? */
  protected canGrab(): boolean {
    return SOLID_STATES.has(this.state);
  }

  /** Grab the hunter when reaching him in his lane. */
  protected contacts(): void {
    if (!this.canGrab()) return;
    for (const p of this.world.players) {
      if (!p.alive || p.y > 0.6) continue;
      if (Math.abs(p.z - this.z) > HUNTER_RULES.grabReachZ) continue;
      const dx = p.x - this.x;
      if (dx < -0.25 || dx > this.def.halfLength + HUNTER.halfWidth + 0.05) continue;
      this.startGrab(p);
      return;
    }
  }

  startGrab(p: Player): void {
    this.grabbing = p;
    this.setState('grab');
    this.vx = this.vz = 0;
    p.addGrabber(this);
  }

  /** Hold on while the hunter is in reach; follow him a little, let go if he gets away. */
  protected holdGrab(): void {
    const p = this.grabbing;
    this.vz = 0;
    if (!p || !p.alive || p.y > 0.6) {
      this.releaseGrab();
      return;
    }
    const reach = this.def.halfLength + HUNTER.halfWidth;
    const dx = p.x - this.x;
    const dz = p.z - this.z;
    if (dx > reach + HUNTER_RULES.grabHoldX || dx < -0.6 || Math.abs(dz) > HUNTER_RULES.grabHoldZ) {
      this.releaseGrab();
      return;
    }
    // Shuffle after him (the hunter is dragged toward the ferry by grabbers).
    this.vx = dx > reach ? Math.min(this.speed * 1.5, (dx - reach) * 8) : 0;
    this.vz = dz * 4;
    p.grabTick(this);
  }

  releaseGrab(): void {
    const p = this.grabbing;
    this.grabbing = null;
    if (p) p.removeGrabber(this);
    if (this.state === 'grab') this.setState(this.locomotion());
  }

  /** Horn / shotgun / shake-off: stagger in place for `seconds`. */
  stagger(seconds: number, pushBack = 0): void {
    if (!this.alive) return;
    if (this.grabbing) this.releaseGrab();
    if (this.state === 'carried' || this.state === 'carry') return;
    if (pushBack) this.x -= pushBack;
    if (this.crawling) return;
    this.setState('stagger', seconds);
    this.vx = 0;
    this.world.events.emit('stagger', { zombieId: this.id });
  }

  // ------------------------------------------------------------------ fire

  ignite(by: Player | null): void {
    if (!this.alive) return;
    const was = this.burning > 0;
    this.burning = FIRE.burnSeconds;
    if (by) this.burnBy = by;
    if (!was) {
      this.world.events.emit('ignite', { zombieId: this.id, corpseId: null, x: this.x, z: this.z });
      this.onIgnite();
    }
  }

  protected onIgnite(): void {}

  private burnTick(): void {
    this.burning = Math.max(0, this.burning - TICK);
    this.life -= FIRE.dps * TICK;
    if (this.life <= 0) {
      if (!this.lastHit || this.lastHit.source !== 'fire') {
        this.lastHit = {
          damage: FIRE.dps * TICK,
          part: 'body',
          point: { x: this.x, y: this.def.height * 0.5, z: this.z },
          dirX: 1,
          dirZ: 0,
          source: 'fire',
          player: this.burnBy,
          weapon: null,
        };
      }
      return;
    }
    if (this.burning <= 0) {
      this.world.events.emit('extinguish', { zombieId: this.id, corpseId: null });
    }
  }

  // ------------------------------------------------------------------ damage

  /**
   * Apply a hit. Emits `hit`. Returns false when the blow was absorbed
   * without effect (stretcher). Deaths are resolved later by the world.
   */
  damage(info: DamageInfo): boolean {
    if (!this.alive) return false;
    this.applyDamage(info, info.damage);
    return true;
  }

  protected applyDamage(info: DamageInfo, lifeDamage: number): void {
    this.life -= lifeDamage;
    this.lastHit = info;
    this.world.events.emit('hit', {
      zombieId: this.id,
      kind: this.kind,
      part: info.part,
      point: info.point,
      dirX: info.dirX,
      dirZ: info.dirZ,
      damage: lifeDamage,
      bullet: info.source === 'bullet' || info.source === 'pellet' || info.source === 'nail',
      playerId: info.player?.id ?? null,
      weapon: info.weapon,
    });
    this.onDamaged(info);
  }

  protected onDamaged(_info: DamageInfo): void {}

  /** How this zombie dies from its last hit. */
  protected chooseDeath(): DeathKind {
    const h = this.lastHit;
    if (!h) return this.burning > 0 ? 'burn' : 'down';
    if (h.source === 'sea') return 'drown';
    if (h.gib || h.source === 'crates' || h.source === 'cannon') return 'gib';
    if (h.source === 'harpoon') return 'harpoon';
    if (h.source === 'stomp') return 'stomp';
    if (h.part === 'head' && (h.source === 'bullet' || h.source === 'pellet' || h.source === 'nail')) {
      const w = h.weapon;
      const r = h.range ?? Infinity;
      if ((w === 'shotgun' && r < 4.5) || (w === 'outboard' && r < 3.5)) return 'headoff';
      return 'headshot';
    }
    if (h.source === 'fire' || h.source === 'blast' || this.burning > 0) return 'burn';
    return 'down';
  }

  /** Called by World.resolveDeaths once life is gone. */
  die(): void {
    if (this.dead) return;
    this.dead = true;
    if (this.grabbing) this.releaseGrab();
    const kind = this.chooseDeath();
    this.deathKind = kind;
    const h = this.lastHit;
    const killer = h?.player ?? this.burnBy ?? null;
    this.beforeDeath(kind);
    const corpse = this.world.corpseFor(this, kind);
    this.corpseId = corpse?.id ?? null;
    this.world.events.emit('zombieDeath', {
      zombieId: this.id,
      kind: this.kind,
      deathKind: kind,
      boss: this.isBoss,
      risen: this.risen,
      point: h?.point ?? { x: this.x, y: this.def.height * 0.5, z: this.z },
      dirX: h?.dirX ?? 1,
      dirZ: h?.dirZ ?? 0,
      force: Math.max(0, -this.life) + (h?.damage ?? 0),
      corpseId: this.corpseId,
      playerId: killer?.id ?? null,
      weapon: h?.weapon ?? null,
    });
    this.world.onZombieKilled(this, kind, killer);
    this.afterDeath(kind);
    this.vx = this.vz = 0;
    this.removed = true;
  }

  /** Before the corpse is made (e.g. paramedics drop the stretcher). */
  protected beforeDeath(_kind: DeathKind): void {}
  /** After the death event (bloater pop: gas + crawlers). */
  protected afterDeath(_kind: DeathKind): void {}

  /** Knocked back by a blast / shotgun; returns true if it went into the sea. */
  shove(dx: number, dz: number): boolean {
    if (!this.alive) return false;
    this.x += dx;
    this.z += dz;
    if (Math.abs(this.z) > BARRICADE.seaZ) return true;
    this.z = Math.max(LANE_MIN_Z - 0.6, Math.min(LANE_MAX_Z + 0.6, this.z));
    return false;
  }
}

/** Small helper for shape tables. */
export function shape(cx: number, cy: number, a: number, b: number, part: HitPart, plate?: number): HitShape {
  return plate ? { cx, cy, a, b, part, plate } : { cx, cy, a, b, part };
}
