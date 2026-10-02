// Spawn director: paces the battle in build-up / peak / relax cycles that
// escalate over time, and brings enemies in through elevators, doors, vents,
// rooftop edges and street edges.

import { clamp } from '../core/math.js';
import { Fighter } from '../fighter/fighter.js';
import { EnemyBrain } from './enemyBrain.js';
import { makeEnemySpec } from './roster.js';

export class Director {
  constructor(sim) {
    this.sim = sim;
    this.phase = 'build';
    this.phaseT = 0;
    this.phaseDur = 16;
    this.level = 1;
    this.acc = 0.6;
    this.spawned = 0;
    this.wave = 0;
    this.queue = [];
    this.alarm = 0;
    this.scuffleT = 14;
  }

  get remaining() {
    const total = this.sim.settings.totalEnemies;
    return total > 0 ? Math.max(0, total - this.spawned - this.queue.length) : Infinity;
  }

  update(dt) {
    const sim = this.sim;
    const S = sim.settings;
    const rng = sim.rng;
    this.level = 1 + (sim.time / 60) * 0.24 * S.escalation;
    this.phaseT += dt;
    if (this.alarm > 0) this.alarm -= dt;
    if (this.phaseT > this.phaseDur) this.nextPhase();

    // queued group spawns (elevator loads, door rushes)
    for (let i = this.queue.length - 1; i >= 0; i--) {
      const q = this.queue[i];
      if (sim.time >= q.at) {
        this.queue.splice(i, 1);
        this.spawnOne(q.point);
      }
    }
    if (sim.over) return;
    // fights break out elsewhere on the map, not only around Onyx
    this.scuffleT -= dt;
    if (this.scuffleT <= 0) {
      this.scuffleT = rng.range(8, 17) / Math.sqrt(clamp(S.maxActive / 26, 0.5, 4));
      this.startScuffle();
    }
    const active = sim.enemiesAlive;
    // the crowd grows over the first couple of minutes: he gets to show
    // what he can do before the numbers start to tell
    const ramp = clamp(0.24 + sim.time / 150, 0.24, 1);
    const pf = this.phase === 'peak' ? 1.15 : this.phase === 'relax' ? 0.45 : 0.65 + 0.35 * clamp(this.phaseT / this.phaseDur, 0, 1);
    const target = Math.max(2, S.maxActive * ramp * pf);
    const rf = this.phase === 'peak' ? 2.2 : this.phase === 'relax' ? 0.35 : 1;
    const rate = 0.5 * S.spawnRate * Math.pow(this.level, 0.6) * rf * (0.75 + rng.next() * 0.5 * S.randomness);
    if (active + this.queue.length < target && this.remaining > 0) this.acc += rate * dt;
    while (this.acc >= 1) {
      this.acc -= 1;
      if (this.remaining <= 0) break;
      this.spawnGroup(1 + (rng.chance(0.25 + this.level * 0.08) ? rng.int(1, 2) : 0));
    }
  }

  nextPhase() {
    const sim = this.sim;
    const S = sim.settings;
    const rng = sim.rng;
    this.phaseT = 0;
    if (this.phase === 'build') {
      this.phase = 'peak';
      this.phaseDur = rng.range(9, 15) * S.randomness + 12 * (1 - S.randomness);
      this.wave++;
      const cap = Math.max(0, Math.round(S.maxActive * 1.1) - sim.enemiesAlive - this.queue.length);
      const early = clamp(0.55 + sim.time / 240, 0.55, 1);
      const n = Math.min(cap, Math.round((3 + this.level * 2.4 + S.maxActive * 0.18) * S.spawnRate * early), this.remaining);
      if (n > 0) {
        this.alarm = 4;
        sim.emit({ t: 'wave', n: this.wave, count: n });
        let left = n;
        let guard = 0;
        while (left > 0 && guard++ < 12) {
          const k = Math.min(left, rng.int(2, 5));
          this.spawnGroup(k, true);
          left -= k;
        }
      }
    } else if (this.phase === 'peak') {
      this.phase = 'relax';
      this.phaseDur = Math.max(3, rng.range(6, 11) / Math.sqrt(this.level));
    } else {
      this.phase = 'build';
      this.phaseDur = rng.range(14, 24);
    }
  }

  startScuffle() {
    const sim = this.sim;
    const S = sim.settings;
    const rng = sim.rng;
    const hero = sim.hero;
    let brawling = 0;
    const free = [];
    for (const e of sim.enemies) {
      if (e.dead || e.removed || !e.brain) continue;
      if (e.brain.foe) {
        brawling++;
        continue;
      }
      if (e.ragdolled || e.state === 'spawn' || e.state === 'held' || e.state === 'holding') continue;
      if (Math.abs(e.x - hero.x) + Math.abs(e.y - hero.y) * 1.5 < 400) continue;
      free.push(e);
    }
    if (brawling / 2 >= Math.max(2, Math.round(S.maxActive / 9))) return;
    const dur = rng.range(7, 15);
    // two idle ones close together get into it
    for (let tries = 0; tries < 6 && free.length > 1; tries++) {
      const a = free[rng.int(0, free.length - 1)];
      let b = null;
      let bd = 300;
      for (const o of free) {
        if (o === a || Math.abs(o.y - a.y) > 40) continue;
        const d = Math.abs(o.x - a.x);
        if (d < bd) {
          bd = d;
          b = o;
        }
      }
      if (!b) continue;
      a.brain.startBrawl(b, dur);
      b.brain.startBrawl(a, dur);
      sim.emit({ t: 'feed', text: `${a.name} and ${b.name} go at each other`, level: 1 });
      sim.emit({ t: 'brawl', a, b, x: (a.x + b.x) / 2, y: a.y });
      return;
    }
    // nobody handy: a pair arrives somewhere else already fighting
    if (this.remaining < 2 || sim.enemiesAlive + 2 > S.maxActive * 1.2) return;
    const pts = sim.level.spawnPoints.filter((p) => Math.abs(p.x - hero.x) + Math.abs(p.y - hero.y) * 1.4 > 650 && p.type !== 'vent');
    if (!pts.length) return;
    const p = rng.pick(pts);
    const a = this.spawnOne(p);
    const b = this.spawnOne(p);
    if (!a || !b) return;
    a.brain.startBrawl(b, dur);
    b.brain.startBrawl(a, dur);
    sim.emit({ t: 'feed', text: `A fight breaks out across the ${sim.level.outdoor ? 'roofs' : 'floor'}`, level: 1 });
    sim.emit({ t: 'brawl', a, b, x: p.x, y: p.y });
  }

  pickPoint(group) {
    const sim = this.sim;
    const rng = sim.rng;
    const hero = sim.hero;
    const pts = sim.level.spawnPoints;
    const items = [];
    for (const p of pts) {
      const d = Math.abs(p.x - hero.x) + Math.abs(p.y - hero.y) * 1.4;
      let w = 1;
      if (d < 230) w = 0.05;
      else if (d < 450) w = 0.6;
      else if (d < 1500) w = 1.4;
      else w = 0.8;
      if (p.type === 'elevator') w *= group ? 1.8 : 0.9;
      if (p.type === 'vent') w *= group ? 0.3 : 0.7;
      if (p.busyUntil && sim.time < p.busyUntil) w *= 0.2;
      items.push([p, w]);
    }
    return items.length ? rng.weighted(items) : null;
  }

  spawnGroup(n, wave) {
    const sim = this.sim;
    const p = this.pickPoint(n > 1 || wave);
    if (!p) return;
    const gap = p.type === 'vent' ? 0.55 : p.type === 'elevator' ? 0.32 : 0.42;
    const t0 = sim.time + (p.type === 'elevator' ? 0.7 : 0.1);
    for (let i = 0; i < n; i++) this.queue.push({ at: t0 + i * gap, point: p });
    p.busyUntil = t0 + n * gap + 0.8;
    if (p.decor) p.decor.openUntil = p.busyUntil + 0.4;
    if (p.type === 'elevator') sim.emit({ t: 'elevator', x: p.x, y: p.y, n });
  }

  spawnOne(p) {
    const sim = this.sim;
    const S = sim.settings;
    const rng = sim.rng;
    if (S.totalEnemies > 0 && this.spawned >= S.totalEnemies) return null;
    const spec = makeEnemySpec(rng, S, this.level, sim.nextId++);
    spec.name = sim.uniqueName(spec.name);
    const hero = sim.hero;
    const dirToHero = Math.sign(hero.x - p.x) || 1;
    let x = p.x;
    let y = p.y;
    const f = new Fighter(sim, { ...spec, x, y, facing: p.dir || dirToHero });
    f.brain = new EnemyBrain(f, sim, spec);
    if (spec.personality === 'weapon' && rng.chance(0.45)) {
      const kinds = ['pipe', 'bat', 'crowbar'];
      const kind = rng.pick(kinds);
      f.weapon = sim.props.makeWeapon(kind);
    }
    switch (p.type) {
      case 'elevator':
        x = p.x + rng.range(-34, 34);
        f.placeAt(x, y);
        f.spawning = { t: rng.range(0.35, 0.6), walk: true, dir: dirToHero };
        f.setState('spawn');
        break;
      case 'door':
        f.placeAt(x, y);
        f.spawning = { t: p.inside ? 0.45 : 0.9, walk: true, dir: p.dir || dirToHero };
        f.setState('spawn');
        break;
      case 'vent':
        f.placeAt(x, y + 40);
        f.grounded = false;
        f.vy = 60;
        f.fallStartY = y;
        f.setState('air');
        sim.emit({ t: 'vent', x, y });
        break;
      case 'climb': {
        const side = p.side || -1;
        f.placeAt(p.x + side * 50, p.y + 150);
        f.grounded = false;
        f.vy = -980;
        f.vx = -side * 170;
        f.facing = -side;
        f.fallStartY = p.y;
        f.setState('air');
        break;
      }
      default:
        f.placeAt(x, y);
        f.spawning = { t: 0.8, walk: true, dir: p.dir || dirToHero };
        f.setState('spawn');
    }
    sim.addFighter(f);
    this.spawned++;
    return f;
  }
}
