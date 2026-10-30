import { Vec3, clamp, makeRng } from '../physics/math.js';
import { Sandbox } from './sandbox.js';
import { SubwayLevel, STATION, CAR } from './subway.js';
import { FlowField, freeTest } from './flowfield.js';
import { ZOMBIE_KINDS } from '../human/zombie.js';
import { FpsPlayer } from '../fps/player.js';
import { Arsenal } from '../fps/arsenal.js';

/**
 * Survival: the player holds out on the platform while the dead arrive by train. Each wave is a
 * number of zombies (more, and more of them runners, as the waves go on; every fifth wave brings a
 * brute or two) that come in on trains on either track; a train carries a car-load, lets them off
 * and leaves. At most `maxAlive` are up at a time - the rest wait for later trains. Between waves
 * the player gets ammunition back; health comes back slowly when nothing has hit for a while.
 *
 * Everything else is the ordinary simulation: zombies are ragdolls with muscles, shot by the
 * sandbox's ballistics, knocked about by the physics.
 */
export const SURVIVAL = { maxAlive: 10, maxCorpses: 14, breakTime: 12, firstDelay: 4, regenDelay: 5, regenRate: 8 };

/** Composition of wave n (1-based): counts per kind and the trains that bring them. */
export function waveSpec(n) {
  const boss = n % 5 === 0;
  const total = Math.round(5 + n * 2.6 + (n > 6 ? (n - 6) * 1.2 : 0));
  const runnerFrac = clamp((n - 1) * 0.09, 0, 0.55);
  const runners = n >= 2 ? Math.round(total * runnerFrac) : 0;
  const brutes = boss ? 1 + Math.floor(n / 10) : n > 7 && n % 3 === 0 ? 1 : 0;
  const walkers = Math.max(1, total - runners);
  const list = [];
  for (let i = 0; i < walkers; i++) list.push('walker');
  for (let i = 0; i < runners; i++) list.push('runner');
  return { n, boss, kinds: list, brutes, perTrain: clamp(4 + Math.floor(n / 2), 4, 9) };
}

export class SurvivalGame {
  constructor(opts = {}) {
    this.opts = { ...SURVIVAL, ...opts };
    this.rng = opts.rng || makeRng(opts.seed ?? (Date.now() % 100000));
    this.shape = opts.shape || null;
    this.sb = new Sandbox({ shape: this.shape, rng: this.rng, groundHalf: STATION.halfLen + STATION.tunnel });
    this.sb.settings.painReactions = false;
    this.level = new SubwayLevel(this.sb);
    const S = STATION;
    this.flow = new FlowField({ minX: -S.halfLen, maxX: S.halfLen, minZ: -S.W - CAR.width - 0.4, maxZ: S.W + CAR.width + 0.4 }, { res: 0.25 });
    this.sb.flow = this.flow;
    this.flowT = 0;
    this.player = new FpsPlayer({ x: 0, z: 2.0, yaw: Math.PI / 2 });
    this.arsenal = new Arsenal();
    this.sb.setPlayer(this.player);
    this.events = [];
    this.reset();
  }

  reset() {
    for (const p of [...this.sb.people]) this.sb.removePerson(p);
    for (const c of this.corpses || []) this.events.push({ type: 'corpseRemoved', person: c.person });
    this.level.reset();
    this.corpses = [];
    this.wave = 0;
    this.state = 'intro'; // intro | wave | break | over
    this.stateT = 0;
    this.queue = []; // zombies of the wave still to come (kinds)
    this.waveLeft = 0;
    this.kills = 0;
    this.headshots = 0;
    this.score = 0;
    this.time = 0;
    this.shots = 0;
    this.hits = 0;
    this.trainTimer = 0;
    this.nextSide = this.rng() < 0.5 ? 1 : -1;
    const pl = this.player;
    pl.pos.set(0, 0, 2.2);
    pl.vel.setZero();
    pl.yaw = Math.PI / 2;
    pl.pitch = 0;
    pl.health = pl.maxHealth;
    pl.alive = true;
    pl.stamina = 1;
    pl.mantling = null;
    this.arsenal = new Arsenal();
    this.events.push({ type: 'reset' });
  }

  get zombies() {
    return this.sb.people.filter((p) => p.zombie);
  }

  get alive() {
    return this.sb.people.filter((p) => p.zombie && p.ctl.alive);
  }

  // ------------------------------------------------------------------------------------------
  startWave() {
    this.wave++;
    const spec = waveSpec(this.wave);
    this.spec = spec;
    // shuffle the kinds, and put any brutes on the first trains (a boss wave is announced by it)
    const k = spec.kinds.slice();
    for (let i = k.length - 1; i > 0; i--) {
      const j = Math.floor(this.rng() * (i + 1));
      [k[i], k[j]] = [k[j], k[i]];
    }
    for (let b = 0; b < spec.brutes; b++) k.splice(Math.min(k.length, b * 3), 0, 'brute');
    this.queue = k;
    this.waveLeft = k.length;
    this.state = 'wave';
    this.stateT = 0;
    this.trainTimer = 1.5;
    this.events.push({ type: 'waveStart', wave: this.wave, boss: spec.boss, count: k.length });
  }

  /** Bring in a train with up to perTrain zombies from the queue. */
  dispatchTrain() {
    const side = this.nextSide;
    if (this.level.trains.some((t) => t.side === side && t.state !== 'departing' && t.state !== 'gone')) {
      // that track is busy: try the other one
      const other = -side;
      if (this.level.trains.some((t) => t.side === other && t.state !== 'departing' && t.state !== 'gone')) return false;
      this.nextSide = other;
      return this.dispatchTrain();
    }
    this.nextSide = -side;
    const room = this.opts.maxAlive - this.alive.length;
    const n = Math.min(this.spec.perTrain, this.queue.length, Math.max(0, room));
    if (n <= 0) return false;
    const load = this.queue.splice(0, n);
    const dir = this.rng() < 0.5 ? 1 : -1;
    const t = this.level.addTrain(side, dir, { speed: 13 + this.rng() * 4 });
    t.load = load;
    t.spawned = [];
    t.hold = (tr) => tr.load.length > 0 || tr.spawned.some((p) => p.ctl.alive && tr.inside(p.rd.pelvis.pos.x, p.rd.pelvis.pos.z) && p.ctl.mode === 'balance');
    t.holdUntil = 3.5;
    this.events.push({ type: 'trainIncoming', train: t, side, count: n, brute: load.includes('brute') });
    return true;
  }

  /** Zombies off a stopped train, one at a time through the open doors. */
  unloadTrains(dt) {
    for (const t of this.level.trains) {
      if (t.state !== 'stopped' || t.doorOpen < 0.85 || !t.load || !t.load.length) continue;
      t.spawnT = (t.spawnT ?? 0) - dt;
      if (t.spawnT > 0) continue;
      t.spawnT = 0.35 + this.rng() * 0.35;
      const doors = t.doors();
      // the doors nearest the player first (they have seen it), shuffled a little
      const pl = this.player.pos;
      doors.sort((a, b) => Math.abs(a.x - pl.x) - Math.abs(b.x - pl.x) + (this.rng() - 0.5) * 8);
      const free = doors.find((d) => this.sb.people.every((p) => Math.hypot(p.rd.pelvis.pos.x - d.inside.x, p.rd.pelvis.pos.z - d.inside.z) > 1.0));
      if (!free) continue;
      const kind = t.load.shift();
      const yaw = Math.atan2(0, -t.side); // facing the platform
      const z = this.sb.spawnZombie(new Vec3(free.inside.x + (this.rng() - 0.5) * 0.3, 0, free.inside.z), yaw, kind);
      z.zombie.replanT = 0;
      t.spawned.push(z);
      this.events.push({ type: 'zombieSpawned', person: z, kind, train: t });
    }
  }

  // ------------------------------------------------------------------------------------------
  /** Fire the current weapon from the player's eye along `dir` (world). Returns the paths. */
  fire(origin, dir) {
    const g = this.arsenal.gun;
    const paths = this.sb.fire(g.type, origin, dir, { spreadScale: this.arsenal.spreadScale(this.player), by: 'player' });
    this.shots++;
    let hitAny = false;
    for (const p of paths) {
      for (const h of p.hits) {
        if (!h.person.zombie) continue;
        hitAny = true;
        h.person.lastHit = { by: 'player', seg: h.seg, time: this.time, weapon: g.type, armor: !!h.armor };
      }
    }
    if (hitAny) this.hits++;
    return paths;
  }

  /** A shove (melee): the nearest zombie in front staggers back. */
  shove() {
    const pl = this.player, eye = pl.eye(), f = pl.forward();
    let best = null, bd = 1.7;
    for (const z of this.zombies) {
      if (!z.ctl.alive) continue;
      const c = z.rd.segments.chest.body.pos;
      const dx = c.x - eye.x, dz = c.z - eye.z, d = Math.hypot(dx, dz);
      const along = (dx * f.x + dz * f.z) / Math.max(d, 1e-3);
      if (d < bd && along > 0.6) {
        bd = d;
        best = z;
      }
    }
    if (!best) return null;
    const b = best.rd.segments.chest.body;
    const imp = new Vec3(f.x, 0.15, f.z).normalize().scale(best.zombie.kind === 'brute' ? 45 : 95);
    this.sb.shove(b, b.pos.clone(), imp, 0.1);
    best.lastHit = { by: 'player', seg: 'chest', time: this.time, weapon: 'shove' };
    return best;
  }

  // ------------------------------------------------------------------------------------------
  update(dt) {
    this.time += dt;
    this.stateT += dt;
    const pl = this.player;
    // the flow field toward the player (re-run a few times a second, and when trains change the layout)
    this.flowT -= dt;
    if (this.flow.version !== this.level.version) {
      const isFree = freeTest(this.level.colliders(), (x, z) => this.level.onPlatform(x, z) || this.level.trains.some((t) => t.state === 'stopped' && t.inside(x, z)), 0.32);
      this.flow.rebuild(isFree, this.level.version);
      this.flowT = 0;
    }
    if (this.flowT <= 0) {
      this.flowT = 0.25;
      this.flow.update(pl.pos);
    }
    // waves
    if (this.state === 'intro' && this.stateT > this.opts.firstDelay) this.startWave();
    else if (this.state === 'wave') {
      this.trainTimer -= dt;
      if (this.queue.length && this.trainTimer <= 0) {
        if (this.dispatchTrain()) this.trainTimer = 9 + this.rng() * 5;
        else this.trainTimer = 1.5;
      }
      this.unloadTrains(dt);
      const left = this.queue.length + this.level.trains.reduce((a, t) => a + (t.load ? t.load.length : 0), 0) + this.alive.length;
      this.waveLeft = left;
      if (left === 0) {
        this.state = 'break';
        this.stateT = 0;
        this.arsenal.restock(this.spec.boss ? 1 : 0.6);
        pl.heal(25);
        this.score += 250 * this.wave;
        this.events.push({ type: 'waveCleared', wave: this.wave, bonus: 250 * this.wave });
      }
    } else if (this.state === 'break' && this.stateT > this.opts.breakTime) this.startWave();
    if (this.state !== 'over' && !pl.alive) {
      this.state = 'over';
      this.stateT = 0;
      this.events.push({ type: 'gameOver', wave: this.wave, kills: this.kills, score: this.score });
    }
    // health comes back after a while unhurt
    if (pl.alive && pl.time - pl.lastHurt > this.opts.regenDelay) pl.heal(this.opts.regenRate * dt);

    this.level.update(dt);
    for (const e of this.level.drainEvents()) this.onLevelEvent(e);
    this.sb.step(dt);
    this.bookkeeping(dt);
  }

  onLevelEvent(e) {
    if (e.type === 'carriedOff') {
      // whoever is still aboard leaves with the train
      if (this.sb.people.includes(e.person)) this.sb.removePerson(e.person);
      if (e.person.zombie && e.person.ctl.alive && this.state === 'wave') this.queue.push(e.person.zombie.kind);
    }
    this.events.push(e);
  }

  /** Kills, corpses that have come to rest (frozen out of the simulation), score. */
  bookkeeping(dt) {
    for (const p of this.zombies) {
      if (!p.ctl.alive && !p.counted) {
        p.counted = true;
        p.diedAt = this.time;
        const lh = p.lastHit;
        const byPlayer = lh && lh.by === 'player' && this.time - lh.time < 3;
        const head = byPlayer && (lh.seg === 'head' || lh.seg === 'neck') && !lh.armor;
        const def = ZOMBIE_KINDS[p.zombie.kind];
        let pts = 0;
        if (byPlayer || p.trainHit) {
          this.kills++;
          if (head) this.headshots++;
          pts = Math.round(def.score * (head ? 1.5 : 1) * (1 + 0.1 * (this.wave - 1)));
          this.score += pts;
        }
        this.events.push({ type: 'kill', person: p, kind: p.zombie.kind, head, byPlayer, train: !!p.trainHit, points: pts, cause: p.injury.deathCause });
      }
      // a corpse that has stopped moving is taken out of the physics (kept as a still mesh)
      if (p.counted && this.time - p.diedAt > 2.5) {
        let still = true;
        for (const b of p.rd.allBodies()) if (b.vel.lengthSq() > 0.04) still = false;
        if (still || this.time - p.diedAt > 8) this.freeze(p);
      }
    }
    while (this.corpses.length > this.opts.maxCorpses) {
      const c = this.corpses.shift();
      this.events.push({ type: 'corpseRemoved', person: c.person });
    }
  }

  freeze(p) {
    this.sb.freezePerson(p);
    this.corpses.push({ person: p, t: this.time });
    this.events.push({ type: 'corpseFrozen', person: p });
  }

  drainEvents() {
    const e = this.events;
    this.events = [];
    return e;
  }

  /** The brute of the wave (for the boss health bar), or null. */
  boss() {
    return this.sb.people.find((p) => p.zombie && p.zombie.kind === 'brute' && p.ctl.alive) || null;
  }

  /** Player collision environment for FpsPlayer.update. */
  playerEnv() {
    const people = [];
    for (const z of this.sb.people) {
      if (z.ctl.mode !== 'balance' && z.ctl.mode !== 'getup') continue;
      const q = z.rd.pelvis.pos;
      people.push({ x: q.x, z: q.z, r: 0.27, person: z });
    }
    return {
      boxes: this.level.colliders(),
      floorAt: (x, z, from) => this.sb.world.surfaceAt(x, z, from),
      people,
      push: (person, force) => this.sb.pushPerson(person, force),
    };
  }
}
