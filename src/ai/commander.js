// Strategic AI for one faction: builds the army, deploys it, assigns
// objectives to squads and platoons, runs fire support, air support and
// air assaults, and sends reinforcement waves while tickets last.

import { rng } from '../core/rng.js';
import { dist2, clamp } from '../core/math.js';
import { MOVE_INF, MOVE_TRACK, MOVE_WHEEL } from '../world/nav.js';
import { SQUADS } from '../sim/unitdefs.js';
import { Squad, VehicleGroup } from './squad.js';
import { frontCenter } from './air.js';

export const DEFAULT_ARMY = { size: 600, infantry: 1, armor: 1, air: 1, artillery: 1, drones: 1, reinforcements: true };

export function computeBudget(s) {
  const N = s.size;
  const veh = Math.round(N * 0.065 * s.armor);
  const b = {
    mbt: Math.round(veh * 0.4),
    ifv: Math.round(veh * 0.28),
    apc: Math.round(veh * 0.14),
    scout: Math.round(veh * 0.08),
    spaag: s.air > 0 ? Math.max(1, Math.round(veh * 0.1)) : 0,
    spg: Math.round((N / 260) * s.artillery),
    mlrs: Math.round((N / 560) * s.artillery),
    attackHeli: Math.round((N / 330) * s.air),
    transportHeli: s.air > 0.3 ? 1 : 0,
    jets: s.air > 0.2,
    para: s.air > 0.5 && N >= 300,
    uav: s.air > 0 ? 1 : 0,
    droneTeams: Math.round((N / 150) * s.drones),
    aaTeams: Math.round((N / 260) * Math.max(0.3, s.air)),
    atgmTeams: Math.round((N / 170) * Math.max(0.5, s.armor)),
    sniperTeams: Math.max(1, Math.round(N / 220)),
  };
  const vehicles = b.mbt + b.ifv + b.apc + b.scout + b.spaag + b.spg + b.mlrs;
  const carried = b.ifv * 7 + b.apc * 8;
  const teams = (b.droneTeams + b.aaTeams + b.atgmTeams + b.sniperTeams) * 2;
  const footSoldiers = Math.max(16, (N - vehicles - b.attackHeli - carried - teams) * s.infantry);
  b.rifleSquads = Math.max(2, Math.round((footSoldiers * 0.6) / 8));
  b.assaultSquads = Math.max(1, Math.round((footSoldiers * 0.25) / 7));
  b.weaponsSquads = Math.max(1, Math.round((footSoldiers * 0.15) / 6));
  b.infantry = b.rifleSquads * 8 + b.assaultSquads * 7 + b.weaponsSquads * 6 + carried + teams;
  return b;
}

function gridRef(x, z) {
  const e = Math.floor((x + 1024) / 10);
  const n = Math.floor((1024 - z) / 10);
  return `${String(e).padStart(3, '0')} ${String(n).padStart(3, '0')}`;
}

const _tmp = [];

export class Commander {
  constructor(world, faction, settings = {}) {
    this.world = world;
    this.faction = faction;
    this.enemy = 1 - faction;
    this.s = { ...DEFAULT_ARMY, ...settings };
    const att = world.map.attacker;
    this.role = att === faction ? 'attack' : att === 1 - faction ? 'defend' : 'meeting';
    this.deploy = world.map.deploy[faction];
    this.intel = world.factions[faction].intel;
    this.budget = computeBudget(this.s);
    this.artillery = [];
    this.requests = [];
    this.overwatchCache = new Map();
    this.planT = 2;
    this.supportT = 8;
    this.airT = 6;
    this.reinforceT = 40;
    this.mergeT = 30;
    this.heliT = rng.range(60, 100);
    this.paraT = rng.range(140, 220);
    this.jetT = rng.range(35, 70);
    this.uavT = 3;
    this.attackHeliT = 4;
    this.barrageDone = this.role === 'defend';
    this.primary = null;
    this.secondary = null;
    const f = this.deploy;
    this.fwd = { x: Math.sin(f.yaw), z: Math.cos(f.yaw) };
    this.right = { x: Math.cos(f.yaw), z: -Math.sin(f.yaw) };
  }

  get fac() {
    return this.world.factions[this.faction];
  }

  // ------------------------------------------------------------ spawning

  spawnSquad(kind, x, z, yaw) {
    const w = this.world;
    const roles = SQUADS[kind];
    const members = roles.map((r, i) => {
      const a = (i / roles.length) * Math.PI * 2;
      const rr = i === 0 ? 0 : 2 + (i % 3) * 1.5;
      const px = x + Math.cos(a) * rr;
      const pz = z + Math.sin(a) * rr;
      const p = w.nav.nearestPassable(px, pz, MOVE_INF) || { x: px, z: pz };
      return w.spawnUnit(r, this.faction, p.x, p.z, { yaw });
    });
    return new Squad(w, this.faction, kind, members);
  }

  spawnMechSquad(vtype, x, z, yaw) {
    const w = this.world;
    const v = w.spawnUnit(vtype, this.faction, x, z, { yaw });
    const kind = vtype === 'ifv' ? 'assault' : 'rifle';
    const roles = SQUADS[kind].slice(0, v.def.capacity);
    const members = roles.map((r) => w.spawnUnit(r, this.faction, x, z, { yaw }));
    for (const m of members) w.mount(m, v);
    const sq = new Squad(w, this.faction, kind, members, { vehicle: v });
    sq.state = 'mounted';
    return sq;
  }

  spawnVehicles(type, n, x, z, yaw, kind, spacing = 24) {
    const w = this.world;
    const list = [];
    for (let i = 0; i < n; i++) {
      const k = i - (n - 1) / 2;
      const px = x + this.right.x * k * spacing;
      const pz = z + this.right.z * k * spacing;
      const cls = type === 'apc' || type === 'scout' || type === 'mlrs' ? MOVE_WHEEL : MOVE_TRACK;
      const p = w.nav.nearestPassable(px, pz, cls, 16) || { x: px, z: pz };
      const v = w.spawnUnit(type, this.faction, p.x, p.z, { yaw });
      if (v.def.artillery) this.artillery.push(v);
      list.push(v);
    }
    return new VehicleGroup(w, this.faction, kind, list);
  }

  // Point in the deployment zone: u = lateral (-1..1), depth = metres behind the front edge.
  zonePoint(u, depth) {
    const d = this.deploy;
    const fx = d.x + this.fwd.x * d.hd + this.right.x * u * d.hw;
    const fz = d.z + this.fwd.z * d.hd + this.right.z * u * d.hw;
    return { x: fx - this.fwd.x * depth, z: fz - this.fwd.z * depth };
  }

  deployInitial() {
    const b = this.budget;
    const yaw = this.deploy.yaw;
    const w = this.world;
    const defend = this.role === 'defend';
    // Armor and mechanised infantry up front (attack) or as a reserve (defend).
    const vehRow = defend ? 60 : 8;
    let lane = -0.9;
    const step = () => {
      const u = lane;
      lane += 0.32;
      if (lane > 0.95) lane = -0.8 + rng.range(0, 0.15);
      return u;
    };
    const tankPlatoons = Math.ceil(b.mbt / 3);
    for (let i = 0; i < tankPlatoons; i++) {
      const n = Math.min(3, b.mbt - i * 3);
      if (n <= 0) break;
      const p = this.zonePoint(step(), vehRow + rng.range(0, 10));
      this.spawnVehicles('mbt', n, p.x, p.z, yaw, 'armor');
    }
    for (let i = 0; i < b.ifv; i++) {
      const p = this.zonePoint(step(), vehRow + 30 + rng.range(0, 12));
      this.spawnMechSquad('ifv', p.x, p.z, yaw);
    }
    for (let i = 0; i < b.apc; i++) {
      const p = this.zonePoint(step(), vehRow + 55 + rng.range(0, 12));
      this.spawnMechSquad('apc', p.x, p.z, yaw);
    }
    if (b.scout > 0) {
      const p = this.zonePoint(rng.range(-0.6, 0.6), vehRow);
      this.spawnVehicles('scout', b.scout, p.x, p.z, yaw, 'recon', 30);
    }
    if (b.spaag > 0) {
      const p = this.zonePoint(rng.range(-0.3, 0.3), vehRow + 80);
      this.spawnVehicles('spaag', b.spaag, p.x, p.z, yaw, 'aa', 40);
    }
    // Artillery in the rear.
    const rear = this.deploy.rear;
    if (b.spg > 0) this.spawnVehicles('spg', b.spg, rear.x - this.right.x * 60, rear.z - this.right.z * 60, yaw, 'artillery', 28);
    if (b.mlrs > 0) this.spawnVehicles('mlrs', b.mlrs, rear.x + this.right.x * 90, rear.z + this.right.z * 90, yaw, 'artillery', 30);

    // Infantry.
    const kinds = [];
    for (let i = 0; i < b.rifleSquads; i++) kinds.push('rifle');
    for (let i = 0; i < b.assaultSquads; i++) kinds.push('assault');
    for (let i = 0; i < b.weaponsSquads; i++) kinds.push('weapons');
    rng.shuffle(kinds);
    const teams = [];
    for (let i = 0; i < b.atgmTeams; i++) teams.push('atgm_team');
    for (let i = 0; i < b.sniperTeams; i++) teams.push('sniper_team');
    for (let i = 0; i < b.aaTeams; i++) teams.push('aa_team');
    for (let i = 0; i < b.droneTeams; i++) teams.push('drone_team');

    if (defend) {
      this.deployDefenders(kinds, teams, yaw);
    } else {
      kinds.forEach((k, i) => {
        const p = this.zonePoint(-0.92 + ((i + 0.5) / kinds.length) * 1.84 + rng.range(-0.03, 0.03), 40 + (i % 3) * 22 + rng.range(0, 10));
        this.spawnSquad(k, p.x, p.z, yaw);
      });
      teams.forEach((k, i) => {
        const p = this.zonePoint(-0.9 + ((i + 0.5) / teams.length) * 1.8, 110 + rng.range(0, 25));
        this.spawnSquad(k, p.x, p.z, yaw);
      });
    }
    w.emitRadio(this.faction, this.role === 'defend' ? 'All units, hold your positions. Enemy attack expected from the south.' : 'All units, this is Actual. Begin the advance on my mark. Mark.', 2);
  }

  deployDefenders(kinds, teams, yaw) {
    const w = this.world;
    const objs = w.objectives.filter((o) => o.owner === this.faction);
    const fortified = w.map.defensePositions[this.faction] || [];
    // ~70% of squads garrison objectives, the rest form a reserve.
    const garrison = Math.ceil(kinds.length * 0.72);
    kinds.forEach((k, i) => {
      if (i < garrison && objs.length) {
        const o = objs[i % objs.length];
        const a = rng.range(0, Math.PI * 2);
        const r = rng.range(0, o.radius + 40);
        const p = w.nav.nearestPassable(o.x + Math.cos(a) * r, o.z + Math.sin(a) * r, MOVE_INF, 20) || { x: o.x, z: o.z };
        const sq = this.spawnSquad(k, p.x, p.z, yaw);
        sq.setOrder({ type: 'defend', obj: o, x: o.x, z: o.z, r: o.radius + 25, issued: 0 }, w);
      } else {
        const p = this.zonePoint(rng.range(-0.7, 0.7), 30 + rng.range(0, 40));
        this.spawnSquad(k, p.x, p.z, yaw);
      }
    });
    // Weapons teams in the fortified line or overwatching an objective.
    teams.forEach((k, i) => {
      let p;
      if (fortified.length && (k === 'atgm_team' || k === 'sniper_team') && i < fortified.length) {
        const fp = fortified[(i * 3) % fortified.length];
        p = { x: fp.x, z: fp.z };
      } else if (objs.length) {
        const o = objs[i % objs.length];
        p = { x: o.x + rng.range(-60, 60), z: o.z + rng.range(-60, 60) };
      } else p = this.zonePoint(rng.range(-0.5, 0.5), 50);
      const pp = w.nav.nearestPassable(p.x, p.z, MOVE_INF, 20) || p;
      const sq = this.spawnSquad(k, pp.x, pp.z, yaw);
      const o = objs.length ? objs[i % objs.length] : null;
      sq.setOrder({ type: 'defend', obj: o, x: pp.x, z: pp.z, r: 30, issued: 0 }, w);
    });
    // Fortified line gets a couple of extra rifle squads.
    for (let i = 0; i < Math.min(3, Math.floor(fortified.length / 6)); i++) {
      const fp = fortified[(i * 7) % fortified.length];
      const sq = this.spawnSquad('rifle', fp.x, fp.z, yaw);
      sq.setOrder({ type: 'defend', obj: null, x: fp.x, z: fp.z, r: 40, issued: 0 }, w);
    }
    // A few defensive tanks/IFVs at the objective edges facing the attack.
    for (const g of this.fac.squads) {
      if (!(g instanceof VehicleGroup) || g.kind !== 'armor' || !objs.length) continue;
      const o = objs[rng.int(0, objs.length - 1)];
      const ed = w.map.deploy[this.enemy];
      const dx = ed.x - o.x;
      const dz = ed.z - o.z;
      const d = Math.hypot(dx, dz) || 1;
      g.setOrder({ type: 'defend', obj: o, x: o.x + (dx / d) * (o.radius + 40), z: o.z + (dz / d) * (o.radius + 40), r: 40 }, w);
    }
  }

  // ------------------------------------------------------------ main loop

  update(dt, world) {
    if (world.over) return;
    this.planT -= dt;
    this.supportT -= dt;
    this.airT -= dt;
    this.reinforceT -= dt;
    this.mergeT -= dt;
    if (this.planT <= 0) {
      this.planT = 5 + rng.next() * 2;
      this.plan(world);
    }
    if (this.supportT <= 0) {
      this.supportT = 6 + rng.next() * 3;
      this.fireSupport(world);
    }
    if (this.airT <= 0) {
      this.airT = 5;
      this.airSupport(world);
    }
    if (this.reinforceT <= 0) {
      this.reinforceT = 28 + rng.next() * 12;
      this.reinforce(world);
    }
    if (this.mergeT <= 0) {
      this.mergeT = 20;
      this.mergeDepleted(world);
    }
  }

  objectiveStatus(world) {
    const home = this.deploy;
    return world.objectives.map((o) => {
      const enemy = this.intel.enemiesNear(o.x, o.z, o.radius + 160);
      let ours = 0;
      world.factionGrids[this.faction].queryRadius(o.x, o.z, o.radius + 160, _tmp);
      for (const u of _tmp) if (u.alive && u.cat !== 'air') ours += u.cat === 'veh' ? 4 : 1;
      return { o, enemy, ours, owned: o.owner === this.faction, d: dist2(o.x, o.z, home.x, home.z) };
    });
  }

  plan(world) {
    const st = this.objectiveStatus(world);
    const unowned = st.filter((s) => !s.owned).sort((a, b) => a.d - b.d);
    const owned = st.filter((s) => s.owned).sort((a, b) => b.enemy.strength - a.enemy.strength);
    const prevPrimary = this.primary;
    this.primary = unowned[0]?.o || null;
    this.secondary = unowned[1]?.o || null;
    if (this.primary && this.primary !== prevPrimary && this.role !== 'defend') {
      world.emitRadio(this.faction, `All units: main effort is objective ${this.primary.letter}, ${this.primary.name}.`, 1);
    }
    const squads = this.fac.squads;
    // How many squads already hold each owned objective.
    const holders = new Map();
    for (const sq of squads) {
      if (sq.order && sq.order.type === 'defend' && sq.order.obj) holders.set(sq.order.obj, (holders.get(sq.order.obj) || 0) + 1);
    }
    for (const sq of squads) {
      if (sq.disbanded || !sq.members.length) continue;
      if (sq instanceof VehicleGroup) {
        this.planVehicles(world, sq, st);
        continue;
      }
      if (sq.state === 'retreat' || sq.state === 'regroup' || sq.pendingOrder) continue;
      const o = sq.order;
      const t = world.time;
      let needs = !o || sq.state === 'idle';
      // Objective taken: garrison it or move on.
      if (o && o.type === 'attack' && o.obj && o.obj.owner === this.faction && t - (o.issued || 0) > 15) {
        const h = holders.get(o.obj) || 0;
        if (h < 2) {
          sq.setOrder({ type: 'defend', obj: o.obj, x: o.obj.x, z: o.obj.z, r: o.obj.radius + 20, issued: t }, world);
          holders.set(o.obj, h + 1);
          continue;
        }
        needs = true;
      }
      // Attack target no longer the focus (e.g. reassigned) — keep going unless idle.
      if (o && o.type === 'flank' && sq.state === 'holding') needs = true;
      if (o && o.type === 'defend' && o.obj && o.obj.owner !== this.faction && o.obj.owner !== -1 && this.role !== 'defend' && sq.state === 'holding' && t - (o.issued || 0) > 60) needs = true;
      if (o && (o.type === 'move' || o.type === 'escort') && t - (o.issued || 0) > 60) needs = true;
      if (!needs) continue;
      this.assignSquad(world, sq, st, unowned, owned, holders);
    }
  }

  assignSquad(world, sq, st, unowned, owned, holders) {
    const t = world.time;
    const kind = sq.kind;
    const team = sq.members.length <= 2 || kind.endsWith('_team');
    if (team && kind !== 'para' && kind !== 'heli_squad') {
      const focus = this.primary || (owned[0] && owned[0].o) || world.objectives[0];
      if (kind === 'aa_team' || kind === 'drone_team') {
        const fc = this.friendlyFront(world);
        const back = kind === 'drone_team' ? 380 : 260;
        const p = this.toward(fc, this.deploy, back);
        const pp = world.nav.nearestPassable(p.x + rng.range(-120, 120), p.z + rng.range(-40, 40), MOVE_INF) || p;
        sq.setOrder({ type: 'overwatch', x: pp.x, z: pp.z, r: 25, issued: t }, world);
      } else {
        const ow = this.overwatchPoint(world, focus);
        sq.setOrder({ type: 'overwatch', obj: focus, x: ow.x + rng.range(-30, 30), z: ow.z + rng.range(-30, 30), r: 25, issued: t }, world);
      }
      return;
    }
    if (this.role === 'defend') {
      // Reinforce the most threatened owned objective, or counterattack a lost one.
      const lost = st.filter((s) => !s.owned && s.o.owner === this.enemy && s.enemy.strength < 12).sort((a, b) => a.d - b.d)[0];
      if (lost && rng.chance(0.5)) {
        sq.setOrder({ type: 'attack', obj: lost.o, x: lost.o.x, z: lost.o.z, r: lost.o.radius, issued: t }, world);
        return;
      }
      const target = owned.find((s) => (holders.get(s.o) || 0) < 3) || owned[0];
      if (target) {
        sq.setOrder({ type: 'defend', obj: target.o, x: target.o.x, z: target.o.z, r: target.o.radius + 25, issued: t }, world);
        holders.set(target.o, (holders.get(target.o) || 0) + 1);
        return;
      }
    }
    // Attack / meeting: main effort with some on the secondary, some flanking.
    let obj = this.primary;
    if (this.secondary && rng.chance(0.3)) obj = this.secondary;
    if (!obj) {
      // Everything taken: defend what we have.
      const o = owned.length ? owned[rng.int(0, owned.length - 1)].o : world.objectives[0];
      sq.setOrder({ type: 'defend', obj: o, x: o.x, z: o.z, r: o.radius + 25, issued: t }, world);
      return;
    }
    const jx = rng.range(-obj.radius * 0.5, obj.radius * 0.5);
    const jz = rng.range(-obj.radius * 0.5, obj.radius * 0.5);
    if (rng.chance(0.25) && sq.members.length >= 5 && !sq.mounted) {
      // Flanking approach: come in from the side of the objective.
      const home = this.deploy;
      const dx = obj.x - home.x;
      const dz = obj.z - home.z;
      const d = Math.hypot(dx, dz) || 1;
      const side = rng.sign();
      const fx = obj.x - (dx / d) * 120 + (-dz / d) * side * 220;
      const fz = obj.z - (dz / d) * 120 + (dx / d) * side * 220;
      if (world.terrain.inBounds(fx, fz, 100)) {
        sq.setOrder({ type: 'flank', obj, x: fx, z: fz, r: 30, issued: t }, world);
        sq.goal = { x: obj.x + jx, z: obj.z + jz, r: obj.radius };
        sq.moveGoal = { x: fx, z: fz };
        return;
      }
    }
    sq.setOrder({ type: 'attack', obj, x: obj.x + jx, z: obj.z + jz, r: obj.radius, issued: t }, world);
  }

  planVehicles(world, g, st) {
    const t = world.time;
    if (g.kind === 'artillery') return;
    const o = g.order;
    if (o && t - (o.issued || 0) < (g.kind === 'aa' ? 45 : 70) && g.state !== 'idle') {
      // Re-issue attack orders when the objective changes hands.
      if (!(o.obj && o.type === 'attack' && o.obj.owner === this.faction)) return;
    }
    if (g.kind === 'aa') {
      const fc = this.friendlyFront(world);
      const p = this.toward(fc, this.deploy, 300);
      g.setOrder({ type: 'move', x: p.x + rng.range(-80, 80), z: p.z + rng.range(-40, 40), r: 60, issued: t }, world);
      return;
    }
    if (g.kind === 'recon') {
      const fc = this.friendlyFront(world);
      const ed = world.map.deploy[this.enemy];
      const p = this.toward(fc, ed, 300);
      g.setOrder({ type: 'move', x: p.x + rng.range(-200, 200), z: p.z, r: 80, issued: t }, world);
      return;
    }
    if (this.role === 'defend' && o && o.type === 'defend' && o.obj && o.obj.owner === this.faction) return;
    const obj = this.primary || world.objectives[rng.int(0, world.objectives.length - 1)];
    if (!obj) return;
    g.setOrder({ type: this.role === 'defend' && obj.owner === this.faction ? 'defend' : 'attack', obj, x: obj.x, z: obj.z, r: obj.radius, issued: t }, world);
  }

  // Centroid of our units nearest the enemy (rough front line).
  friendlyFront(world) {
    const ed = world.map.deploy[this.enemy];
    let best = [];
    for (const u of this.fac.units) {
      if (!u.alive || u.cat === 'air' || u.hidden) continue;
      best.push(u);
    }
    if (!best.length) return { x: this.deploy.x, z: this.deploy.z };
    best.sort((a, b) => dist2(a.pos.x, a.pos.z, ed.x, ed.z) - dist2(b.pos.x, b.pos.z, ed.x, ed.z));
    best = best.slice(0, Math.max(5, Math.floor(best.length * 0.2)));
    let x = 0;
    let z = 0;
    for (const u of best) {
      x += u.pos.x;
      z += u.pos.z;
    }
    return { x: x / best.length, z: z / best.length };
  }

  toward(a, b, d) {
    const dx = b.x - a.x;
    const dz = b.z - a.z;
    const l = Math.hypot(dx, dz) || 1;
    return { x: clamp(a.x + (dx / l) * d, -950, 950), z: clamp(a.z + (dz / l) * d, -950, 950) };
  }

  overwatchPoint(world, obj) {
    const key = obj.id;
    const c = this.overwatchCache.get(key);
    if (c) return c;
    const home = this.deploy;
    const dx = home.x - obj.x;
    const dz = home.z - obj.z;
    const dl = Math.hypot(dx, dz) || 1;
    const base = Math.atan2(dx / dl, dz / dl);
    let best = { x: obj.x + (dx / dl) * 400, z: obj.z + (dz / dl) * 400 };
    let bs = -Infinity;
    const t = world.terrain;
    for (const r of [300, 400, 500, 600]) {
      for (let k = -4; k <= 4; k++) {
        const a = base + k * 0.24;
        const x = obj.x + Math.sin(a) * r;
        const z = obj.z + Math.cos(a) * r;
        if (!t.inBounds(x, z, 80) || !world.nav.passable(x, z, MOVE_INF)) continue;
        const h = t.heightAt(x, z);
        const clear = t.lineClear(x, h + 1.6, z, obj.x, obj.y + 2, obj.z, 0.3) && !world.structures.blocksSight(x, h + 1.6, z, obj.x, obj.y + 2, obj.z);
        const score = (clear ? 30 : 0) + (h - obj.y) * 0.4 - Math.abs(k) * 1.5 - world.los.forestDensityAt(x, z) * 5;
        if (score > bs) {
          bs = score;
          best = { x, z };
        }
      }
    }
    this.overwatchCache.set(key, best);
    return best;
  }

  // ------------------------------------------------------------ fire support

  requestSupport(squad, x, z, enemy) {
    this.requests.push({ x, z, value: 6 + enemy.strength, t: this.world.time, by: squad });
    if (this.requests.length > 8) this.requests.shift();
  }

  dangerClose(world, x, z, r) {
    world.factionGrids[this.faction].queryRadius(x, z, r, _tmp);
    for (const u of _tmp) if (u.alive && u.cat !== 'air' && !u.hidden) return true;
    return false;
  }

  fireSupport(world) {
    const free = this.artillery.filter((v) => v.alive && v.brain && !v.brain.busy);
    if (!free.length) return;
    const t = world.time;
    const targets = [];
    // Opening barrage on enemy-held objectives.
    if (!this.barrageDone && t > 6) {
      this.barrageDone = true;
      for (const o of world.objectives) {
        if (o.owner === this.enemy) targets.push({ x: o.x + rng.range(-30, 30), z: o.z + rng.range(-30, 30), value: 20, barrage: true });
      }
      if (!targets.length) {
        const fc = frontCenter(world, this.faction);
        targets.push({ x: fc.x, z: fc.z, value: 15, barrage: true });
      }
      if (targets.length) world.emitRadio(this.faction, 'All batteries: preparatory fire, fire for effect!', 2);
    }
    for (const r of this.requests) if (t - r.t < 30) targets.push(r);
    for (const c of this.intel.clusters) if (c.value >= 3) targets.push({ x: c.x, z: c.z, value: c.value + c.armor * 2 });
    targets.sort((a, b) => b.value - a.value);
    for (const tg of targets) {
      if (!free.length) break;
      if (!tg.barrage && this.dangerClose(world, tg.x, tg.z, 120)) continue;
      // Pick the free gun that suits the target best (rockets for big clusters).
      free.sort((a, b) => dist2(a.pos.x, a.pos.z, tg.x, tg.z) - dist2(b.pos.x, b.pos.z, tg.x, tg.z));
      let idx = 0;
      if (tg.value >= 8) {
        const r = free.findIndex((v) => v.type === 'mlrs');
        if (r >= 0) idx = r;
      }
      const gun = free.splice(idx, 1)[0];
      const rocket = gun.type === 'mlrs';
      gun.brain.addMission({ x: tg.x, y: world.terrain.heightAt(tg.x, tg.z), z: tg.z, rounds: rocket ? 12 : tg.barrage ? 6 : 4, spread: rocket ? 45 : 22 });
      const idxReq = this.requests.indexOf(tg);
      if (idxReq >= 0) this.requests.splice(idxReq, 1);
      world.emitRadio(this.faction, `${gun.callsign}: fire mission, grid ${gridRef(tg.x, tg.z)}, ${rocket ? 'rocket salvo' : '4 rounds HE'}, over.`, 1);
      world.emit({ t: 'fire_mission', faction: this.faction, x: tg.x, z: tg.z, rocket });
    }
  }

  // ------------------------------------------------------------ air

  airSupport(world) {
    const t = world.time;
    const b = this.budget;
    const air = this.fac.units.filter((u) => u.cat === 'air' && u.alive && !u.dying);
    const count = (type) => air.filter((u) => u.type === type).length;
    const entry = this.deploy.airEntry;
    const fc = frontCenter(world, this.faction);
    // Recon drone overhead.
    if (b.uav && count('recon_uav') === 0 && t > this.uavT) {
      this.uavT = t + 90;
      const y = world.terrain.heightAt(entry.x, entry.z * 0.7) + 450;
      const u = world.spawnUnit('recon_uav', this.faction, entry.x, entry.z * 0.65, { y, speed: 34, yaw: this.deploy.yaw });
      u.brain.area = fc;
    }
    // Attack helicopters on station over the main effort.
    if (count('attack_heli') < b.attackHeli && t > this.attackHeliT) {
      this.attackHeliT = t + rng.range(70, 110) / Math.max(0.5, this.s.air);
      const x = entry.x + rng.range(-300, 300);
      const z = entry.z * 0.62;
      const u = world.spawnUnit('attack_heli', this.faction, x, z, { y: world.terrain.heightAt(x, z) + 80, speed: 60, yaw: this.deploy.yaw });
      u.callsign = this.faction === 0 ? `Reaper ${count('attack_heli') + 1}` : `Hunter-${count('attack_heli') + 1}`;
      world.emitRadio(this.faction, `${u.callsign}: on station, ready for tasking.`, 1);
    }
    for (const u of air) if (u.type === 'attack_heli' && u.brain.setArea) u.brain.setArea((this.primary || fc).x, (this.primary || fc).z);
    // Close air support sorties.
    if (b.jets && t > this.jetT && count('jet') < 2) {
      const tgt = this.pickStrikeTarget(world);
      if (tgt) {
        this.jetT = t + rng.range(70, 120) / Math.max(0.4, this.s.air);
        const x = entry.x + rng.range(-500, 500);
        const z = entry.z * 1.35;
        const yaw = Math.atan2(tgt.x - x, tgt.z - z);
        const j = world.spawnUnit('jet', this.faction, x, z, { y: 520, speed: 230, yaw });
        j.callsign = this.faction === 0 ? `Viper ${rng.int(1, 4)}-${rng.int(1, 2)}` : `Grach-${rng.int(10, 40)}`;
        j.brain.setMission({ x: tgt.x, z: tgt.z, unit: tgt.unit || null, passes: 2 });
        world.emitRadio(this.faction, `${j.callsign}, cleared hot on grid ${gridRef(tgt.x, tgt.z)}.`, 1);
      }
    }
    // Air assault by helicopter.
    if (b.transportHeli && this.role !== 'defend' && t > this.heliT && this.primary && this.fac.tickets > 30) {
      this.heliT = t + rng.range(110, 170);
      const lz = this.pickLZ(world, this.primary, 260);
      if (lz) {
        const x = entry.x + rng.range(-200, 200);
        const z = entry.z * 0.7;
        const h = world.spawnUnit('transport_heli', this.faction, x, z, { y: world.terrain.heightAt(x, z) + 70, speed: 60, yaw: this.deploy.yaw });
        const sq = this.spawnSquad('heli_squad', x, z, this.deploy.yaw);
        for (const m of sq.members) world.mount(m, h);
        sq.state = 'idle';
        sq.pendingOrder = { type: 'attack', obj: this.primary, x: this.primary.x, z: this.primary.z, r: this.primary.radius, issued: t };
        h.callsign = this.faction === 0 ? `Dustoff ${rng.int(1, 6)}` : `Vertolet-${rng.int(10, 60)}`;
        h.brain.setMission(lz);
        world.emitRadio(this.faction, `${h.callsign} inbound with ${sq.callsign}, LZ grid ${gridRef(lz.x, lz.z)}.`, 1);
      }
    }
    // Paradrop.
    if (b.para && t > this.paraT && this.primary && this.fac.tickets > 60) {
      this.paraT = t + rng.range(200, 300);
      const dz = this.pickLZ(world, this.primary, 330);
      if (dz) {
        const side = rng.sign();
        const ex = side * -2350;
        const exitX = side * 2750;
        const y = Math.max(world.terrain.heightAt(dz.x, dz.z) + 330, 300);
        const p = world.spawnUnit('transport_plane', this.faction, ex, dz.z, { y, speed: 105, yaw: Math.atan2(exitX - ex, 0) });
        const squads = [this.spawnSquad('para', ex, dz.z, p.yaw), this.spawnSquad('para', ex, dz.z, p.yaw)];
        for (const sq of squads) {
          for (const m of sq.members) world.mount(m, p);
          sq.state = 'idle';
          sq.pendingOrder = { type: 'attack', obj: this.primary, x: this.primary.x, z: this.primary.z, r: this.primary.radius, issued: t };
        }
        p.callsign = this.faction === 0 ? `Hauler ${rng.int(1, 9)}` : `Gruz-${rng.int(10, 90)}`;
        p.brain.setMission(dz, { x: exitX, z: dz.z });
        world.emitRadio(this.faction, `${p.callsign}: two minutes to drop zone, paratroopers stand by.`, 2);
      }
    }
  }

  pickStrikeTarget(world) {
    let best = null;
    let bs = 0;
    for (const c of this.intel.clusters) {
      if (this.dangerClose(world, c.x, c.z, 220)) continue;
      const s = c.value + c.armor * 4;
      if (s > bs) {
        bs = s;
        best = { x: c.x, z: c.z, unit: c.units.find((u) => u.tclass === 'armor' && u.alive) || c.units[0] };
      }
    }
    return bs >= 4 ? best : null;
  }

  // Landing zone near an objective, on our side, flat, clear and not too hot.
  pickLZ(world, obj, dist) {
    const home = this.deploy;
    const dx = home.x - obj.x;
    const dz = home.z - obj.z;
    const dl = Math.hypot(dx, dz) || 1;
    const base = Math.atan2(dx / dl, dz / dl);
    let best = null;
    let bs = Infinity;
    for (let k = 0; k < 24; k++) {
      const a = base + rng.range(-1.1, 1.1);
      const r = dist * rng.range(0.85, 1.25);
      const x = obj.x + Math.sin(a) * r;
      const z = obj.z + Math.cos(a) * r;
      if (!world.terrain.inBounds(x, z, 120)) continue;
      if (world.terrain.slopeAt(x, z) > 0.18) continue;
      if (world.structures.structureAt(x, z, 14)) continue;
      if (world.los.forestDensityAt(x, z) > 0.15) continue;
      const threat = this.intel.threatAt(x, z);
      if (threat < bs) {
        bs = threat;
        best = { x, z };
      }
    }
    return best;
  }

  // ------------------------------------------------------------ reinforcements

  reinforce(world) {
    const fac = this.fac;
    if (!this.s.reinforcements || fac.tickets <= 0 || world.over) return;
    const b = this.budget;
    let inf = 0;
    const veh = {};
    for (const u of fac.units) {
      if (!u.alive) continue;
      if (u.cat === 'inf') inf++;
      else if (u.cat === 'veh') veh[u.type] = (veh[u.type] || 0) + 1;
    }
    const yaw = this.deploy.yaw;
    const spawned = [];
    const back = 60;
    // Infantry.
    const missing = b.infantry * 0.9 - inf;
    const squads = clamp(Math.floor(missing / 8), 0, 3);
    for (let i = 0; i < squads; i++) {
      const p = this.zonePoint(rng.range(-0.8, 0.8), back + rng.range(0, 30));
      const kind = rng.weighted([['rifle', 5], ['assault', 3], ['weapons', 1.5], ['atgm_team', 0.6], ['aa_team', this.s.air > 0 ? 0.3 : 0], ['drone_team', 0.5 * this.s.drones]]);
      this.spawnSquad(kind, p.x, p.z, yaw);
      spawned.push(kind.replace('_', ' '));
    }
    // Vehicles: replace a few of the most-missing types.
    const want = [['mbt', b.mbt], ['ifv', b.ifv], ['apc', b.apc], ['spaag', b.spaag], ['scout', b.scout]];
    let budgetV = 2;
    for (const [type, n] of want) {
      if (budgetV <= 0) break;
      const have = veh[type] || 0;
      if (have >= n * 0.75 || n === 0) continue;
      const k = Math.min(type === 'mbt' ? 2 : 1, n - have, budgetV);
      const p = this.zonePoint(rng.range(-0.7, 0.7), back - 20);
      if (type === 'ifv' || type === 'apc') {
        for (let i = 0; i < k; i++) this.spawnMechSquad(type, p.x + i * 20 * this.right.x, p.z + i * 20 * this.right.z, yaw);
      } else this.spawnVehicles(type, k, p.x, p.z, yaw, type === 'mbt' ? 'armor' : type === 'spaag' ? 'aa' : 'recon');
      budgetV -= k;
      spawned.push(`${k} ${type.toUpperCase()}`);
    }
    if (veh.spg === undefined && b.spg > 0 && rng.chance(0.3)) {
      const r = this.deploy.rear;
      this.spawnVehicles('spg', 1, r.x, r.z, yaw, 'artillery');
    }
    if (spawned.length) {
      world.emit({ t: 'reinforcements', faction: this.faction, what: spawned });
      world.emitRadio(this.faction, `Reinforcements moving up: ${spawned.slice(0, 3).join(', ')}.`, 0);
    }
  }

  // Fold remnants of shattered squads into others.
  mergeDepleted(world) {
    const squads = this.fac.squads.filter((s) => s instanceof Squad && !s.disbanded && !s.mounted && !s.pendingOrder);
    for (const sq of squads) {
      if (sq.members.length > 2 || sq.kind.endsWith('_team') || sq.disbanded) continue;
      let best = null;
      let bd = 250;
      const c = sq.center;
      for (const o of squads) {
        if (o === sq || o.disbanded || o.members.length >= o.initialSize || o.kind.endsWith('_team') || o.mounted) continue;
        const oc = o.center;
        const d = dist2(c.x, c.z, oc.x, oc.z);
        if (d < bd) {
          bd = d;
          best = o;
        }
      }
      if (!best) continue;
      for (const m of sq.members) {
        m.squad = best;
        m.callsign = best.callsign;
        m.task = { type: 'follow', mode: 'run' };
        best.members.push(m);
      }
      sq.members.length = 0;
      sq.disband(world);
    }
  }
}
