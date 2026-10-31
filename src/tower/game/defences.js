// LAST LOOKOUT — placed defences: barbed wire (trips the walking dead into physics), landmines,
// fuel barrels (shoot them), floodlights (night), and the sentry gun at the gate.
import { Vec3, clamp } from '../../physics/math.js';
import { DEFENCES } from '../catalog.js';

const _v = new Vec3();

export class Defences {
  constructor(game) {
    this.game = game;
    this.wires = []; // { id, a: Vec3, b: Vec3, hp }
    this.mines = []; // { id, pos }
    this.barrels = []; // { id, pos, spot }
    this.floodlights = new Set(); // mount ids
    this.sentry = null; // { pos, ammo, cool, target }
    this.nextId = 1;
  }

  /** Serialisable state (saved with the run). */
  save() {
    return {
      wires: this.wires.map((w) => ({ a: [w.a.x, w.a.z], b: [w.b.x, w.b.z], hp: w.hp })),
      mines: this.mines.map((m) => [m.pos.x, m.pos.z]),
      barrels: this.barrels.map((b) => b.spot),
      floodlights: [...this.floodlights],
      sentry: this.sentry ? { ammo: this.sentry.ammo } : null,
    };
  }

  load(s) {
    if (!s) return;
    for (const w of s.wires || []) this.addWire(new Vec3(w.a[0], 0, w.a[1]), new Vec3(w.b[0], 0, w.b[1]), w.hp);
    for (const m of s.mines || []) this.addMine(new Vec3(m[0], 0, m[1]));
    for (const i of s.barrels || []) this.addBarrel(i);
    for (const id of s.floodlights || []) this.addFloodlight(id);
    if (s.sentry) this.addSentry(s.sentry.ammo);
  }

  inTrapZone(x, z) {
    return this.game.layout.trapZones.some((r) => x > r.minX && x < r.maxX && z > r.minZ && z < r.maxZ);
  }

  // ---- placement
  addWire(a, b, hp = 6) {
    const w = { id: this.nextId++, kind: 'wire', a: a.clone(), b: b.clone(), hp };
    this.wires.push(w);
    this.game.emit({ type: 'trapPlaced', trap: w });
    return w;
  }

  addMine(pos) {
    const m = { id: this.nextId++, kind: 'mine', pos: pos.clone(), armed: true };
    this.mines.push(m);
    this.game.emit({ type: 'trapPlaced', trap: m });
    return m;
  }

  addBarrel(spotIndex) {
    const s = this.game.layout.barrelSpots[spotIndex];
    if (!s || this.barrels.some((b) => b.spot === spotIndex)) return null;
    const b = { id: this.nextId++, kind: 'barrel', spot: spotIndex, pos: new Vec3(s[0], 0.45, s[1]) };
    this.barrels.push(b);
    this.game.emit({ type: 'trapPlaced', trap: b });
    return b;
  }

  addFloodlight(id) {
    if (this.floodlights.has(id)) return false;
    this.floodlights.add(id);
    this.game.emit({ type: 'floodlight', id, on: true });
    return true;
  }

  addSentry(ammo = DEFENCES.sentry.ammo) {
    if (this.sentry) {
      this.sentry.ammo += ammo;
      return this.sentry;
    }
    const m = this.game.layout.sentryMount;
    this.sentry = { kind: 'sentry', pos: new Vec3(m.pos[0], m.pos[1] + 0.5, m.pos[2]), ammo, cool: 0, target: null, yaw: 0, burst: 0 };
    this.game.emit({ type: 'trapPlaced', trap: this.sentry });
    return this.sentry;
  }

  // ---- triggers (animated zombies walking over things)
  checkZombie(z) {
    const p = z.root.pos;
    for (const m of this.mines) {
      if (!m.armed) continue;
      const dx = p.x - m.pos.x, dz = p.z - m.pos.z;
      if (dx * dx + dz * dz < 0.8 * 0.8) {
        m.armed = false;
        this.game.explode(new Vec3(m.pos.x, 0.15, m.pos.z), { radius: DEFENCES.mine.radius, power: 1.25, kind: 'mine', by: 'mine' });
        this.mines = this.mines.filter((x) => x !== m);
        this.game.emit({ type: 'trapRemoved', trap: m });
        return;
      }
    }
    if (z.mode === 'crawl') return;
    for (const w of this.wires) {
      if (w.hp <= 0) continue;
      // crossing the wire's line this step
      const ax = w.b.x - w.a.x, az = w.b.z - w.a.z;
      const L2 = ax * ax + az * az;
      const u = ((p.x - w.a.x) * ax + (p.z - w.a.z) * az) / L2;
      if (u < -0.02 || u > 1.02) continue;
      const qx = w.a.x + ax * u - p.x, qz = w.a.z + az * u - p.z;
      if (qx * qx + qz * qz > 0.3 * 0.3) continue;
      this.trip(z, w);
      return;
    }
  }

  /** The wire catches the shins: the body pitches forward over it, physically. */
  trip(z, w) {
    const game = this.game;
    w.hp--;
    if (!game.horde.wake(z, { cause: 'wire', mode: 'balance' })) return;
    const rd = z.person.rd;
    const fx = Math.sin(z.facing), fz = Math.cos(z.facing);
    const sp = Math.max(z.speed(), 0.8);
    // the feet stop dead, the trunk carries on
    for (const s of ['L', 'R']) {
      for (const n of ['shin', 'foot']) {
        const b = rd.segments[n + s].body;
        b.vel.x -= fx * sp * 0.9;
        b.vel.z -= fz * sp * 0.9;
      }
    }
    for (const n of ['chest', 'head', 'abdomen']) {
      const b = rd.segments[n].body;
      b.vel.x += fx * (0.8 + sp * 0.5);
      b.vel.z += fz * (0.8 + sp * 0.5);
    }
    z.lastHit = { ...(z.lastHit || {}), wire: game.time };
    game.emit({ type: 'tripped', zombie: z, wire: w });
    if (w.hp <= 0) {
      this.wires = this.wires.filter((x) => x !== w);
      game.emit({ type: 'trapRemoved', trap: w });
    }
  }

  // ---- barrels
  raycastBarrels(origin, dir, len) {
    let best = null;
    for (const b of this.barrels) {
      // vertical cylinder r 0.3, h 0.9
      const ox = origin.x - b.pos.x, oz = origin.z - b.pos.z;
      const A = dir.x * dir.x + dir.z * dir.z;
      if (A < 1e-9) continue;
      const B = 2 * (ox * dir.x + oz * dir.z), C = ox * ox + oz * oz - 0.3 * 0.3;
      const disc = B * B - 4 * A * C;
      if (disc < 0) continue;
      const t = (-B - Math.sqrt(disc)) / (2 * A);
      if (t < 0 || t > len) continue;
      const y = origin.y + dir.y * t;
      if (y < 0 || y > 0.92) continue;
      if (!best || t < best.t) best = { t, barrel: b };
    }
    return best;
  }

  detonateBarrel(b, by) {
    if (!this.barrels.includes(b)) return;
    this.barrels = this.barrels.filter((x) => x !== b);
    this.game.emit({ type: 'trapRemoved', trap: b });
    this.game.explode(new Vec3(b.pos.x, 0.5, b.pos.z), { radius: DEFENCES.barrel.radius, power: DEFENCES.barrel.power, kind: 'barrel', by: by || 'barrel', fire: true });
  }

  // ---- the sentry
  step(dt) {
    const S = this.sentry;
    if (!S || S.ammo <= 0) return;
    const game = this.game;
    S.cool -= dt;
    // nearest living zombie within 60 m of the compound, preferring those at the gate
    if (!S.target || !S.target.alive || S.target.state === 'frozen' || S.retarget-- <= 0) {
      S.target = null;
      S.retarget = 20;
      let bd = 60 * 60;
      for (const z of game.horde.list) {
        if (!z.alive || z.state === 'frozen' || z.state === 'dead') continue;
        const p = z.animated ? z.root.pos : z.person.rd.pelvis.pos;
        const d2 = p.x * p.x + p.z * p.z - (z.state === 'attack' ? 400 : 0);
        if (d2 < bd) {
          bd = d2;
          S.target = z;
        }
      }
    }
    const z = S.target;
    if (!z || S.cool > 0) return;
    const aim = z.person.rd.segments.chest.body.pos;
    _v.subVectors(aim, S.pos);
    const d = _v.length();
    _v.scale(1 / d);
    S.yaw = Math.atan2(_v.x, _v.z);
    // bursts of 4, a short pause between them
    S.burst = (S.burst + 1) % 5;
    S.cool = S.burst === 0 ? 0.45 : 0.1;
    if (S.burst === 0) return;
    S.ammo--;
    const dir = _v.clone();
    dir.x += (game.rng() - 0.5) * 0.02;
    dir.y += (game.rng() - 0.5) * 0.02;
    dir.z += (game.rng() - 0.5) * 0.02;
    dir.normalize();
    // (close range: hitscan through the engine's ballistics; wake anyone on the line first)
    game.wakeAlong(S.pos, dir, d + 2);
    const paths = game.sb.fire('rifle', S.pos, dir, { spreadScale: 0.5, by: 'sentry' });
    game.registerSentry(paths);
    game.emit({ type: 'sentryFire', pos: S.pos.clone(), dir, ammo: S.ammo });
    if (S.ammo <= 0) game.emit({ type: 'sentryEmpty' });
  }

  clear() {
    for (const t of [...this.wires, ...this.mines, ...this.barrels]) this.game.emit({ type: 'trapRemoved', trap: t });
    if (this.sentry) this.game.emit({ type: 'trapRemoved', trap: this.sentry });
    for (const id of this.floodlights) this.game.emit({ type: 'floodlight', id, on: false });
    this.wires = [];
    this.mines = [];
    this.barrels = [];
    this.floodlights.clear();
    this.sentry = null;
  }
}

export { clamp };
