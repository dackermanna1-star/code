// The horde (DESIGN.md §8): every zombie kind, the paramedic team and the
// risen crawler.
import type { DeathKind, ZombieKind } from '../config/ids';
import { PLATE_CHEST, PLATE_HELMET, PLATE_SHIELD } from '../config/ids';
import { TICK, TICK_RATE } from '../config/world';
import { BIG_DAVE, BOSS_BOUNTY, RIOT_PLATES, RIOT_SQUAD, STRETCHER, ZOMBIES } from '../config/zombies';
import { WEAPONS } from '../config/weapons';
import { BARRICADE, GAS, REANIMATION } from '../config/rules';
import type { ZombieState } from './api';
import { Zombie, shape, type DamageInfo, type HitShape, type ZombieOpts } from './Zombie';
import type { World } from './World';

const bobOf = (z: Zombie, k: number, amp: number) => Math.sin(z.distance * k) * amp;

// ------------------------------------------------------------------ shapes
function standingShapes(z: Zombie, out: HitShape[], armsOut: boolean): HitShape[] {
  out.length = 0;
  const b = bobOf(z, 4.4, 0.03);
  out.push(shape(0, 0.45, 0.2, 0.45, 'legs'));
  out.push(shape(0.06, 1.12 + b, 0.25, 0.36, 'body'));
  if (armsOut) out.push(shape(0.38, 1.25 + b, 0.22, 0.08, 'body'));
  out.push(shape(0.16, 1.6 + b, 0.14, 0.15, 'head'));
  return out;
}

/** Body lying on the deck (tripped jogger, dropped patient): low and long. */
function lyingShapes(out: HitShape[], y = 0): HitShape[] {
  out.length = 0;
  out.push(shape(0.15, y + 0.2, 0.8, 0.2, 'body'));
  out.push(shape(0.98, y + 0.2, 0.14, 0.14, 'head'));
  return out;
}

// ------------------------------------------------------------------ shambler
export class Shambler extends Zombie {
  private driftIn = 0;
  constructor(world: World, opts: ZombieOpts = {}, kind: ZombieKind = 'shambler') {
    super(world, kind, opts);
    this.gait = 'walk';
    this.steersLanes = true;
  }

  shapes(): HitShape[] {
    return standingShapes(this, this.shapeBuf, this.state !== 'burn');
  }

  protected cruise(): void {
    super.cruise();
    if (this.state === 'walk' && --this.driftIn <= 0) {
      this.driftIn = this.world.rng.int(80, 200);
      this.vz = this.world.rng.range(-0.18, 0.18);
    }
  }
}

// ------------------------------------------------------------------ jogger
export class Jogger extends Zombie {
  private zigIn = 0;
  /** Corpses already stepped over (one trip roll each). */
  private met = new Set<number>();
  constructor(world: World, opts: ZombieOpts = {}) {
    super(world, 'jogger', opts);
    this.gait = 'run';
    this.steersLanes = true;
  }

  shapes(): HitShape[] {
    const out = this.shapeBuf;
    if (this.state === 'trip') {
      // Falls flat for most of the trip, gets back up at the end.
      const t = this.stateTicks / Math.max(1, this.stateLen);
      if (t > 0.15 && t < 0.8) return lyingShapes(out);
    }
    out.length = 0;
    const b = bobOf(this, 2.4, 0.05);
    out.push(shape(0.02, 0.45, 0.32, 0.45, 'legs'));
    out.push(shape(0.12, 1.1 + b, 0.24, 0.34, 'body'));
    out.push(shape(0.24, 1.58 + b, 0.13, 0.14, 'head'));
    return out;
  }

  protected cruise(): void {
    super.cruise();
    if (this.state === 'run' && --this.zigIn <= 0) {
      this.zigIn = this.world.rng.int(25, 60);
      this.vz = this.world.rng.range(-1.5, 1.5);
    }
  }

  protected onLaneBounce(): void {
    this.zigIn = this.world.rng.int(25, 60);
  }

  protected move(): void {
    super.move();
    if (this.state !== 'run' && this.state !== 'burn') return;
    // Stepping over bodies: 35% chance to trip per new corpse underfoot.
    this.world.bodies.forEachIn(this.x, this.z, 0.45, 0.4, (c) => {
      if (this.state === 'trip' || this.met.has(c.id)) return;
      this.met.add(c.id);
      if (this.world.rng.chance(BARRICADE.tripChance)) {
        this.setState('trip', BARRICADE.tripSeconds);
        this.vx = this.vz = 0;
        this.world.events.emit('trip', { zombieId: this.id });
      }
    });
  }

  protected canGrab(): boolean {
    return this.state === 'run' || this.state === 'burn' || this.state === 'spawn';
  }
}

// ------------------------------------------------------------------ bloater
export class Bloater extends Zombie {
  constructor(world: World, opts: ZombieOpts = {}) {
    super(world, 'bloater', opts);
    this.gait = 'walk';
  }

  shapes(): HitShape[] {
    const out = this.shapeBuf;
    out.length = 0;
    const b = bobOf(this, 3.0, 0.04);
    out.push(shape(0, 0.38, 0.28, 0.38, 'legs'));
    out.push(shape(0.12, 1.05 + b, 0.62, 0.55, 'body'));
    out.push(shape(0, 1.45 + b, 0.38, 0.3, 'body'));
    out.push(shape(0.1, 1.79 + b, 0.16, 0.16, 'head'));
    return out;
  }

  protected chooseDeath(): DeathKind {
    return this.lastHit?.source === 'sea' ? 'drown' : 'pop';
  }

  protected afterDeath(kind: DeathKind): void {
    if (kind !== 'pop') return;
    const owner = this.lastHit?.player ?? this.burnBy;
    const gas = this.world.hazards.addGas(this.x, this.z, GAS.radius, GAS.seconds, owner);
    for (let i = 0; i < 2; i++) {
      const cx = this.x + this.world.rng.range(-0.5, 0.6);
      const cz = this.z + (i === 0 ? -0.45 : 0.45) + this.world.rng.range(-0.15, 0.15);
      this.world.spawnCrawler('shambler', cx, cz, (this.look * 31 + i * 977) & 0x7fffffff, 'bloater');
    }
    // A burning bloater goes up in flames the moment it bursts.
    if (this.burning > 0 || this.lastHit?.source === 'fire') this.world.hazards.igniteAndReward(gas, owner);
  }
}

// ------------------------------------------------------------------ paramedic team
/** Two medics carrying a stretcher with a patient (moves as one unit). */
export class Stretcher {
  readonly id: number;
  x: number;
  readonly z: number;
  readonly speed: number;
  dropped = false;
  constructor(
    readonly world: World,
    x: number,
    z: number,
    public front: Medic | null,
    public back: Medic | null,
    public patient: Patient | null,
  ) {
    this.id = world.nextId('stretcher');
    this.x = x;
    this.z = z;
    this.speed = ZOMBIES.medic.speed[0];
  }

  get members(): Zombie[] {
    return [this.front, this.back, this.patient].filter((m): m is Medic | Patient => !!m && m.alive);
  }

  /** Move the unit and place its members. */
  tick(): void {
    if (this.dropped) return;
    const f = this.front;
    const b = this.back;
    if (!f?.alive || !b?.alive) return;
    const hold = [f, b, this.patient].some((m) => m && m.alive && (m.state === 'stagger' || m.state === 'grab'));
    let step = 0;
    if (!hold) {
      const n = this.world.obstaclesAhead(f);
      const k = 1 / (1 + BARRICADE.slowK * Math.min(BARRICADE.maxN, n));
      f.slow = b.slow = k;
      step = this.speed * k * TICK;
    }
    this.x += step;
    const place = (m: Zombie | null, dx: number) => {
      if (!m || !m.alive) return;
      if (m.state === 'grab') return;
      m.x = this.x + dx;
      m.z = this.z;
      m.vx = step / TICK;
      m.vz = 0;
      m.distance += step;
    };
    place(f, STRETCHER.medicOffset);
    place(b, -STRETCHER.medicOffset);
    place(this.patient, 0);
  }

  /** A medic died or panicked: the stretcher hits the deck. */
  drop(by: Zombie): void {
    if (this.dropped) return;
    this.dropped = true;
    this.world.events.emit('stretcherDrop', { zombieId: by.id, x: this.x, z: this.z, stretcherId: this.id, patientId: this.patient?.id });
    for (const m of [this.front, this.back]) if (m && m.alive) m.leaveTeam();
    if (this.patient?.alive) this.patient.dropped();
    this.front = this.back = null;
    this.patient = null;
  }
}

export class Medic extends Zombie {
  team: Stretcher | null = null;
  constructor(world: World, opts: ZombieOpts = {}) {
    super(world, 'medic', opts);
    this.gait = 'walk';
  }

  join(team: Stretcher, role: 'front' | 'back'): void {
    this.team = team;
    this.gait = 'carry';
    this.stretcher = { id: team.id, role };
    this.setState('carry');
  }

  leaveTeam(): void {
    this.team = null;
    this.stretcher = undefined;
    this.gait = 'walk';
    this.speed = this.world.rng.range(1.0, 1.25);
    if (this.alive && (this.state === 'carry' || this.state === 'spawn')) this.setState(this.locomotion());
  }

  get onTeam(): boolean {
    return !!this.team && !this.team.dropped;
  }

  shapes(): HitShape[] {
    const out = standingShapes(this, this.shapeBuf, !this.onTeam && this.state !== 'burn');
    if (this.onTeam && this.stretcher?.role === 'back' && this.alive) {
      out.push(shape(STRETCHER.medicOffset, STRETCHER.height, STRETCHER.halfLength, 0.07, 'stretcher'));
    }
    return out;
  }

  protected panics(): boolean {
    return true;
  }

  protected think(): void {
    if (this.onTeam && this.state !== 'grab' && this.state !== 'stagger') {
      if (this.burning > 0) {
        this.team!.drop(this);
        return super.think();
      }
      if (this.state !== 'carry') this.setState('carry');
      return;
    }
    super.think();
  }

  protected move(): void {
    if (this.onTeam) return;
    super.move();
  }

  protected canGrab(): boolean {
    if (this.onTeam) return this.stretcher?.role === 'front' && this.state === 'carry';
    return super.canGrab();
  }

  stagger(seconds: number, pushBack = 0): void {
    if (this.onTeam) {
      if (this.grabbing) this.releaseGrab();
      this.team!.x -= pushBack;
      this.setState('stagger', seconds);
      this.world.events.emit('stagger', { zombieId: this.id });
      return;
    }
    super.stagger(seconds, pushBack);
  }

  protected endTimedState(): void {
    this.setState(this.onTeam ? 'carry' : this.locomotion());
  }

  protected beforeDeath(): void {
    if (this.onTeam) this.team!.drop(this);
    this.team = null;
    this.stretcher = undefined;
  }

  protected onIgnite(): void {
    if (this.onTeam) this.team!.drop(this);
  }
}

export class Patient extends Zombie {
  team: Stretcher | null = null;
  constructor(world: World, opts: ZombieOpts = {}) {
    super(world, 'patient', opts);
    this.gait = 'walk';
  }

  join(team: Stretcher): void {
    this.team = team;
    this.gait = 'carried';
    this.stretcher = { id: team.id, role: 'patient' };
    this.y = STRETCHER.height;
    this.setState('carried');
  }

  get onTeam(): boolean {
    return !!this.team && !this.team.dropped;
  }

  /** The stretcher was dropped: lie on the deck, then get up as a shambler. */
  dropped(): void {
    this.team = null;
    this.stretcher = undefined;
    this.y = 0.12;
    this.gait = 'walk';
    this.setState('carried', STRETCHER.dropGetUp);
    this.vx = this.vz = 0;
  }

  shapes(): HitShape[] {
    const out = this.shapeBuf;
    if (this.state === 'carried') {
      out.length = 0;
      const y = this.y;
      out.push(shape(0, y + 0.17, 0.78, 0.15, 'body'));
      out.push(shape(0.82, y + 0.2, 0.13, 0.12, 'head'));
      return out;
    }
    return standingShapes(this, out, this.state !== 'burn');
  }

  protected think(): void {
    if (this.state === 'carried') {
      this.vx = this.vz = 0;
      if (!this.onTeam && this.stateTicks >= this.stateLen) {
        this.y = 0;
        this.setState(this.locomotion());
      }
      return;
    }
    super.think();
  }

  protected move(): void {
    if (this.onTeam || this.state === 'carried') return;
    super.move();
  }

  protected canGrab(): boolean {
    return !this.onTeam && super.canGrab();
  }

  stagger(seconds: number, pushBack = 0): void {
    if (this.state === 'carried') return;
    super.stagger(seconds, pushBack);
  }

  protected beforeDeath(): void {
    if (this.team && !this.team.dropped) this.team.patient = null;
    this.team = null;
    this.stretcher = undefined;
    this.y = 0;
  }
}

// ------------------------------------------------------------------ riot brute
export class Riot extends Zombie {
  plateHp = { [PLATE_HELMET]: RIOT_PLATES.helmet, [PLATE_SHIELD]: RIOT_PLATES.shield, [PLATE_CHEST]: RIOT_PLATES.chest } as Record<number, number>;
  constructor(world: World, opts: ZombieOpts = {}) {
    super(world, 'riot', opts);
    this.gait = 'walk';
    this.plates = PLATE_HELMET | PLATE_SHIELD | PLATE_CHEST;
    if (this.isBoss) {
      this.bounty = BOSS_BOUNTY.riot;
      if (opts.life === undefined) this.life = this.maxLife = this.maxLife * RIOT_SQUAD.lifeMult;
      for (const k of Object.keys(this.plateHp)) this.plateHp[Number(k)] *= RIOT_SQUAD.plateMult;
      this.speed = RIOT_SQUAD.speed;
    }
  }

  shapes(): HitShape[] {
    const out = this.shapeBuf;
    out.length = 0;
    const b = bobOf(this, 3.6, 0.025);
    out.push(shape(0, 0.48, 0.26, 0.48, 'legs'));
    out.push(shape(0.05, 1.2 + b, 0.36, 0.42, 'body'));
    if (this.plates & PLATE_HELMET) out.push(shape(0.12, 1.76 + b, 0.19, 0.2, 'plate', PLATE_HELMET));
    else out.push(shape(0.12, 1.75 + b, 0.16, 0.17, 'head'));
    if (this.plates & PLATE_SHIELD) out.push(shape(0.47, 1.0 + b, 0.07, 0.75, 'plate', PLATE_SHIELD));
    return out;
  }

  /** Take a plate off (bullets, harpoon). */
  knockOff(plate: number, info: DamageInfo): void {
    if (!(this.plates & plate)) return;
    this.plates &= ~plate;
    this.plateHp[plate] = 0;
    this.world.events.emit('plateOff', { zombieId: this.id, plate, point: info.point, dirX: info.dirX, dirZ: info.dirZ });
  }

  damage(info: DamageInfo): boolean {
    if (!this.alive) return false;
    const bulletish = info.source === 'bullet' || info.source === 'pellet' || info.source === 'nail';
    if (info.source === 'harpoon') {
      // The harpoon goes straight through the armour and tears the shield off.
      if (this.plates & PLATE_SHIELD) this.knockOff(PLATE_SHIELD, info);
      this.applyDamage(info, info.damage);
      return true;
    }
    if (bulletish || info.source === 'flare') {
      const mult = info.weapon ? WEAPONS[info.weapon].plateMult : 1;
      const plate = info.shape?.plate ?? (info.part === 'head' && this.plates & PLATE_HELMET ? PLATE_HELMET : 0);
      if (plate && this.plates & plate) {
        this.plateHp[plate] -= info.damage * mult;
        this.applyDamage({ ...info, part: 'plate' }, 0);
        if (this.plateHp[plate] <= 0) this.knockOff(plate, info);
        return true;
      }
      if (info.part === 'body' && this.plates & PLATE_CHEST) {
        this.plateHp[PLATE_CHEST] -= info.damage * mult;
        this.applyDamage(info, info.damage * 0.5);
        if (this.plateHp[PLATE_CHEST] <= 0) this.knockOff(PLATE_CHEST, info);
        return true;
      }
    }
    this.applyDamage(info, info.damage);
    return true;
  }
}

// ------------------------------------------------------------------ Big Dave
export class BigDave extends Zombie {
  private belchIn: number;
  constructor(world: World, opts: ZombieOpts = {}) {
    super(world, 'bigdave', opts);
    this.gait = 'walk';
    this.enraged = false;
    this.belchIn = Math.round(BIG_DAVE.belchEvery * TICK_RATE);
  }

  shapes(): HitShape[] {
    const out = this.shapeBuf;
    out.length = 0;
    const b = bobOf(this, 2.0, 0.05);
    const lean = this.state === 'belch' ? -0.12 : 0;
    out.push(shape(0, 0.6, 0.5, 0.6, 'legs'));
    out.push(shape(0.18, 1.55 + b, 1.0, 0.9, 'body'));
    out.push(shape(0, 2.25 + b, 0.62, 0.45, 'body'));
    out.push(shape(0.22 + lean, 2.72 + b, 0.27, 0.27, 'head'));
    return out;
  }

  protected think(): void {
    if (!this.enraged && this.life <= this.maxLife * BIG_DAVE.enrageAt) {
      if (this.grabbing) this.releaseGrab();
      this.enraged = true;
      this.setState('enrage', BIG_DAVE.enrageSeconds);
      this.vx = this.vz = 0;
      this.world.events.emit('enrage', { zombieId: this.id });
      return;
    }
    if (this.state === 'enrage' && this.stateTicks >= this.stateLen) this.speed = BIG_DAVE.enragedSpeed;
    if (this.state === 'belch' && this.stateTicks === Math.round(this.stateLen / 2)) this.belch();
    // The belch timer runs all the time (one belch every BIG_DAVE.belchEvery s) except while he's held up.
    if (this.state !== 'enrage' && this.state !== 'stagger' && this.state !== 'spawn') this.belchIn--;
    if (this.state === 'walk' || this.state === 'grab') {
      if (this.belchIn <= 0) {
        this.belchIn += Math.round(BIG_DAVE.belchEvery * TICK_RATE);
        if (this.state === 'grab') this.releaseGrab();
        this.setState('belch', BIG_DAVE.belchSeconds);
        this.vx = this.vz = 0;
        return;
      }
    }
    super.think();
  }

  private belch(): void {
    const gx = this.x + BIG_DAVE.belchAhead * this.facing;
    this.world.events.emit('belch', { zombieId: this.id, x: gx, z: this.z });
    const gas = this.world.hazards.addGas(gx, this.z, GAS.radius, GAS.seconds, null);
    if (this.burning > 0) this.world.hazards.ignite(gas, this.burnBy);
  }

  protected panics(): boolean {
    return false;
  }

  stagger(seconds: number): void {
    // Too big to be pushed around: just a wobble.
    super.stagger(Math.min(seconds, 1.0), 0);
  }

  protected chooseDeath(): DeathKind {
    return 'pop';
  }

  protected afterDeath(): void {
    const owner = this.lastHit?.player ?? this.burnBy;
    this.world.hazards.addGas(this.x, this.z, BIG_DAVE.popGasRadius, GAS.seconds + 1, owner);
    // His crawlers spill out behind him (away from the gangway) and drag themselves along slowly.
    const rng = this.world.rng;
    const cx = this.x - BIG_DAVE.crawlersBehind;
    for (let i = 0; i < BIG_DAVE.popCrawlers; i++) {
      const a = (i / BIG_DAVE.popCrawlers) * Math.PI * 2;
      const speed = rng.range(BIG_DAVE.crawlerSpeed[0], BIG_DAVE.crawlerSpeed[1]);
      this.world.spawnCrawler('shambler', cx + Math.cos(a) * 1.0, this.z + Math.sin(a) * 1.0, (this.look * 17 + i * 7919) & 0x7fffffff, 'bigdave', speed);
    }
  }
}

// ------------------------------------------------------------------ risen crawler
export class Crawler extends Zombie {
  constructor(world: World, kind: ZombieKind, opts: ZombieOpts = {}) {
    const base = ZOMBIES[kind].life + ZOMBIES[kind].lifeInc * (Math.max(1, world.chapter) - 1);
    super(world, kind, { ...opts, life: opts.life ?? Math.max(REANIMATION.crawlerMinLife, Math.round(base * REANIMATION.crawlerLifeFrac)) });
    this.risen = true;
    this.gait = 'crawl';
    this.bounty = REANIMATION.crawlerBounty;
    this.speed = world.rng.range(REANIMATION.crawlSpeed[0], REANIMATION.crawlSpeed[1]);
    this.setState('rise', REANIMATION.riseSeconds);
  }

  get height(): number {
    return REANIMATION.crawlerHeight;
  }

  shapes(): HitShape[] {
    const out = this.shapeBuf;
    out.length = 0;
    if (this.state === 'rise') {
      const t = Math.min(1, this.stateTicks / Math.max(1, this.stateLen));
      const l = (a: number, b: number) => a + (b - a) * t;
      out.push(shape(l(-0.1, -0.05), l(0.15, 0.26), l(0.8, 0.62), l(0.15, 0.26), 'body'));
      out.push(shape(l(0.75, 0.6), l(0.15, 0.36), 0.15, l(0.13, 0.15), 'head'));
      return out;
    }
    const b = bobOf(this, 5, 0.03);
    out.push(shape(-0.05, 0.26 + b, 0.62, 0.26, 'body'));
    out.push(shape(0.6, 0.36 + b, 0.15, 0.15, 'head'));
    return out;
  }

  protected canGrab(): boolean {
    return false;
  }

  /** Crawlers gnaw at the hunter's boots when he can't kick them off. */
  protected contacts(): void {
    if (this.state !== 'crawl') return;
    for (const p of this.world.players) {
      if (!p.alive || p.y > 0.3) continue;
      if (Math.abs(p.z - this.z) > 0.5) continue;
      const dx = p.x - this.x;
      if (dx < -0.2 || dx > 0.95) continue;
      this.x = Math.min(this.x, p.x - 0.75);
      this.vx = 0;
      p.crawlerBite(this);
      return;
    }
  }

  protected chooseDeath(): DeathKind {
    const k = super.chooseDeath();
    return k === 'headoff' ? 'headshot' : k;
  }
}

export function createZombie(world: World, kind: ZombieKind, opts: ZombieOpts = {}): Zombie {
  if (opts.risen) return new Crawler(world, kind, opts);
  switch (kind) {
    case 'shambler':
      return new Shambler(world, opts);
    case 'jogger':
      return new Jogger(world, opts);
    case 'bloater':
      return new Bloater(world, opts);
    case 'medic':
      return new Medic(world, opts);
    case 'patient':
      return new Patient(world, opts);
    case 'riot':
      return new Riot(world, opts);
    case 'bigdave':
      return new BigDave(world, opts);
  }
}

export type { ZombieState };
