// Faction-level knowledge: enemy contacts reported by any friendly unit, a
// coarse threat map (where enemy firepower is concentrated) used to plan
// flanking routes, and clusters of known enemies for fire missions and air
// strikes.

import { clamp } from '../core/math.js';

const THREAT_RES = 64;

const THREAT_OF = {
  inf: { value: 1, radius: 350 },
  light: { value: 4, radius: 900 },
  armor: { value: 8, radius: 1300 },
  air: { value: 3, radius: 900 },
  drone: { value: 0.5, radius: 100 },
};

export class FactionIntel {
  constructor(world, faction) {
    this.world = world;
    this.faction = faction;
    this.contacts = new Map(); // enemy unit id -> contact
    const n = Math.ceil(world.terrain.size / THREAT_RES);
    this.threat = { grid: new Float32Array(n * n), n, res: THREAT_RES, weight: 0 };
    this.clusters = [];
    this.timer = 0;
    this.threatTimer = 0;
    this.clusterTimer = 0;
    this.knownArmor = 0;
    this.knownAir = 0;
    this.knownAA = [];
  }

  report(u, spotter) {
    const w = this.world;
    u.spotted[this.faction] = w.time + 5;
    let c = this.contacts.get(u.id);
    if (!c) {
      c = { unit: u, x: 0, y: 0, z: 0, t: 0, first: w.time, cls: u.tclass, by: spotter };
      this.contacts.set(u.id, c);
    }
    c.x = u.pos.x;
    c.y = u.pos.y;
    c.z = u.pos.z;
    c.t = w.time;
    c.by = spotter;
  }

  update(dt, world) {
    this.timer -= dt;
    this.threatTimer -= dt;
    this.clusterTimer -= dt;
    if (this.timer <= 0) {
      this.timer = 1;
      let armor = 0;
      let air = 0;
      this.knownAA.length = 0;
      for (const [id, c] of this.contacts) {
        const u = c.unit;
        if (!u.alive || u.dying || world.time - c.t > 45) {
          this.contacts.delete(id);
          continue;
        }
        // Keep tracking spotted units' positions while they stay spotted.
        if (u.spotted[this.faction] > world.time) {
          c.x = u.pos.x;
          c.y = u.pos.y;
          c.z = u.pos.z;
        }
        if (u.tclass === 'armor') armor++;
        if (u.cat === 'air' && u.aclass !== 'drone' && u.aclass !== 'uav') air++;
        if (u.type === 'spaag' || u.type === 'manpads') this.knownAA.push(c);
      }
      this.knownArmor = armor;
      this.knownAir = air;
    }
    if (this.threatTimer <= 0) {
      this.threatTimer = 3;
      this.rebuildThreat(world);
    }
    if (this.clusterTimer <= 0) {
      this.clusterTimer = 4;
      this.rebuildClusters(world);
    }
  }

  rebuildThreat(world) {
    const T = this.threat;
    const g = T.grid;
    g.fill(0);
    const half = world.terrain.half;
    for (const c of this.contacts.values()) {
      if (world.time - c.t > 30) continue;
      const th = THREAT_OF[c.cls] || THREAT_OF.inf;
      const r = th.radius;
      const cx0 = clamp(Math.floor((c.x - r + half) / T.res), 0, T.n - 1);
      const cx1 = clamp(Math.floor((c.x + r + half) / T.res), 0, T.n - 1);
      const cz0 = clamp(Math.floor((c.z - r + half) / T.res), 0, T.n - 1);
      const cz1 = clamp(Math.floor((c.z + r + half) / T.res), 0, T.n - 1);
      for (let cz = cz0; cz <= cz1; cz++) {
        const wz = (cz + 0.5) * T.res - half;
        for (let cx = cx0; cx <= cx1; cx++) {
          const wx = (cx + 0.5) * T.res - half;
          const d = Math.hypot(wx - c.x, wz - c.z);
          if (d < r) g[cz * T.n + cx] += th.value * (1 - d / r);
        }
      }
    }
  }

  threatAt(x, z) {
    const T = this.threat;
    const half = this.world.terrain.half;
    const cx = clamp(Math.floor((x + half) / T.res), 0, T.n - 1);
    const cz = clamp(Math.floor((z + half) / T.res), 0, T.n - 1);
    return T.grid[cz * T.n + cx];
  }

  // Threat-weighted path option for flanking manoeuvres. Each request gets
  // its own weight (requests are queued and solved later).
  threatOpts(weight) {
    const T = this.threat;
    return { threat: { grid: T.grid, n: T.n, res: T.res, weight }, heuristicWeight: 1.25, maxNodes: 30000 };
  }

  // Group recent contacts into 64 m cells, keep the densest cells.
  rebuildClusters(world) {
    const cells = new Map();
    const half = world.terrain.half;
    for (const c of this.contacts.values()) {
      if (world.time - c.t > 20 || c.unit.cat === 'air') continue;
      const cx = Math.floor((c.x + half) / 64);
      const cz = Math.floor((c.z + half) / 64);
      const key = cz * 64 + cx;
      let cell = cells.get(key);
      if (!cell) cells.set(key, (cell = { x: 0, z: 0, n: 0, inf: 0, veh: 0, armor: 0, value: 0, units: [] }));
      cell.x += c.x;
      cell.z += c.z;
      cell.n++;
      if (c.cls === 'inf') cell.inf++;
      else cell.veh++;
      if (c.cls === 'armor') cell.armor++;
      cell.value += c.cls === 'inf' ? 1 : c.cls === 'armor' ? 6 : 4;
      cell.units.push(c.unit);
    }
    const list = [];
    for (const cell of cells.values()) {
      cell.x /= cell.n;
      cell.z /= cell.n;
      list.push(cell);
    }
    list.sort((a, b) => b.value - a.value);
    this.clusters = list.slice(0, 12);
  }

  // Nearest known enemy to a point (optionally of a class).
  nearestContact(x, z, filter = null, maxAge = 25) {
    let best = null;
    let bd = Infinity;
    const t = this.world.time;
    for (const c of this.contacts.values()) {
      if (t - c.t > maxAge || !c.unit.alive) continue;
      if (filter && !filter(c.unit)) continue;
      const d = Math.hypot(c.x - x, c.z - z);
      if (d < bd) {
        bd = d;
        best = c;
      }
    }
    return best;
  }

  // Enemy presence summary around a point.
  enemiesNear(x, z, r, maxAge = 25) {
    let inf = 0;
    let veh = 0;
    let armor = 0;
    let cx = 0;
    let cz = 0;
    const t = this.world.time;
    for (const c of this.contacts.values()) {
      if (t - c.t > maxAge || !c.unit.alive || c.unit.cat === 'air') continue;
      const d = Math.hypot(c.x - x, c.z - z);
      if (d > r) continue;
      if (c.cls === 'inf') inf++;
      else veh++;
      if (c.cls === 'armor') armor++;
      cx += c.x;
      cz += c.z;
    }
    const n = inf + veh;
    return { inf, veh, armor, n, strength: inf + veh * 4 + armor * 4, x: n ? cx / n : x, z: n ? cz / n : z };
  }
}
