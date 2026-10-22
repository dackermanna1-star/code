// The battle simulation: owns the map, units, projectiles, smoke, weather,
// objectives and factions, and advances everything each tick. Rendering and
// audio consume `events` produced here; AI brains are attached through
// `brainFactory` so the simulation itself has no AI dependency.

import { Vector3, Quaternion } from 'three';
import { SpatialGrid } from '../core/grid.js';
import { rng } from '../core/rng.js';
import { clamp } from '../core/math.js';
import { NavGrid, PathService } from '../world/nav.js';
import { LineOfSight } from '../world/los.js';
import { Structure } from '../world/structures.js';
import { ProjectileSystem } from './projectiles.js';
import { SmokeSystem } from './smoke.js';
import { Weather } from './weather.js';
import { Objective } from './objectives.js';
import { Soldier, Vehicle, Aircraft, resetUnitIds } from './unit.js';
import { UNIT_DEFS } from './unitdefs.js';
import { WEAPONS } from './weapons.js';
import { explode, damageStructure } from './damage.js';

export const FACTION_INFO = [
  { id: 0, name: 'Coalition', short: 'COA', color: '#5aa9ff', tracer: 0xff5a3c },
  { id: 1, name: 'Federation', short: 'FED', color: '#ff5d4d', tracer: 0x7dff6a },
];

export class Faction {
  constructor(id, tickets) {
    this.id = id;
    this.info = FACTION_INFO[id];
    this.name = this.info.name;
    this.units = [];
    this.squads = [];
    this.tickets = tickets;
    this.startTickets = tickets;
    this.losses = { inf: 0, veh: 0, air: 0 };
    this.kills = 0;
    this.commander = null;
    this.intel = null;
    this.spawned = 0;
  }
}

const _tmp = [];
const _v = new Vector3();
const _v2 = new Vector3();
const _res = { x: 0, z: 0, blocked: false };

export class World {
  constructor(map, opts = {}) {
    resetUnitIds();
    this.map = map;
    this.opts = opts;
    this.terrain = map.terrain;
    this.structures = map.structures;
    this.trees = map.trees;
    this.time = 0;
    this.tick = 0;
    this.units = [];
    this.dead = [];
    this.events = [];
    const tickets = opts.tickets ?? 1500;
    this.factions = [new Faction(0, tickets), new Faction(1, tickets)];
    this.objectives = map.objectives.map((o) => new Objective(o));
    const half = this.terrain.half;
    this.unitGrid = new SpatialGrid(-half, -half, this.terrain.size, 16);
    this.factionGrids = [new SpatialGrid(-half, -half, this.terrain.size, 64), new SpatialGrid(-half, -half, this.terrain.size, 64)];
    this.airUnits = [[], []];
    this.weather = new Weather(opts.weather || {});
    this.smoke = new SmokeSystem(this);
    this.projectiles = new ProjectileSystem(this);
    this.los = new LineOfSight(map, this.smoke);
    this.nav = new NavGrid(map, 4);
    this.nav.build();
    this.paths = new PathService(this.nav);
    this.burningStructures = new Set();
    this.listener = null; // camera position (flyby detection)
    this.brainFactory = null;
    this.cover = null; // set by AI module
    this.losCache = new Map();
    this.losBudget = 0;
    this.losPerTick = opts.losPerTick ?? 700;
    this.combatHeat = new Float32Array(32 * 32); // where the fighting is (for the camera director)
    this.over = false;
    this.winner = -1;
    this.endless = !!opts.endless;
    this.bleedTimer = 0;
    this.stats = { shots: 0, explosions: 0 };
    this.unitById = new Map();
    this.radioT = [-100, -100];
    this.dt = 0.016;
  }

  emit(e) {
    this.events.push(e);
  }

  enemyOf(f) {
    return 1 - f;
  }

  // ------------------------------------------------------------ spawning

  spawnUnit(type, faction, x, z, opts = {}) {
    const def = UNIT_DEFS[type];
    const y = opts.y ?? this.terrain.heightAt(x, z);
    let u;
    if (def.cat === 'inf') u = new Soldier(def, faction, x, y, z);
    else if (def.cat === 'veh') u = new Vehicle(def, faction, x, y, z);
    else u = new Aircraft(def, faction, x, y, z);
    u.yaw = opts.yaw ?? (faction === 0 ? Math.PI : 0);
    u.spawnTime = this.time;
    for (const wdef of def.weapons) {
      if (typeof wdef === 'object' && !Array.isArray(wdef)) u.addWeapon(wdef.w, wdef.mount);
      else u.addWeapon(Array.isArray(wdef) ? wdef[faction] : wdef, 'hand');
    }
    if (u.cat === 'veh') {
      u.conformToTerrain(this.terrain, 0);
    }
    if (u.cat === 'air') {
      u.speed = opts.speed ?? 0;
      u.goal.set(x, y, z);
      u.goalSpeed = u.def.speed.cruise;
      const cp = Math.cos(u.pitch);
      u.vel.set(Math.sin(u.yaw) * u.speed * cp, 0, Math.cos(u.yaw) * u.speed * cp);
      u.quatFromAngles(0, 0, 1);
    }
    if (u.cat === 'inf') {
      u.grenades = u.weapons.find((w) => w.def.id === 'frag') ? 2 : 0;
    }
    this.units.push(u);
    this.unitById.set(u.id, u);
    const fac = this.factions[faction];
    fac.units.push(u);
    fac.spawned++;
    if (this.brainFactory) u.brain = this.brainFactory(u, this);
    return u;
  }

  // Put a soldier inside a vehicle or aircraft.
  mount(soldier, carrier) {
    soldier.mounted = carrier;
    soldier.hidden = true;
    soldier.seat = carrier.passengers.length;
    carrier.passengers.push(soldier);
    soldier.pos.copy(carrier.pos);
    if (soldier.cover) this.cover?.release(soldier);
    soldier.stop();
  }

  // Disembark all passengers around an exit point.
  dismountAll(carrier) {
    const out = carrier.passengers.slice();
    carrier.passengers.length = 0;
    const back = carrier.cat === 'veh' ? (carrier.spec.dismount || [0, 0, -carrier.spec.length / 2 - 1]) : [0, 0, 0];
    let i = 0;
    for (const s of out) {
      if (!s.alive) continue;
      _v.set(back[0] + ((i % 3) - 1) * 1.4, 0, back[2] - Math.floor(i / 3) * 1.3 - 1);
      if (carrier.cat === 'air') _v.set(((i % 2) * 2 - 1) * 2.4, 0, ((i >> 1) - 2) * 1.6);
      _v.applyAxisAngle(_up, carrier.yaw);
      const x = carrier.pos.x + _v.x;
      const z = carrier.pos.z + _v.z;
      const res = this.resolveInfantryCollision(x, z, carrier.pos.x, carrier.pos.z);
      s.mounted = null;
      s.hidden = false;
      s.pos.set(res.x, this.terrain.heightAt(res.x, res.z), res.z);
      s.yaw = carrier.yaw + Math.PI + rng.range(-0.6, 0.6);
      s.stance = 1;
      s.stanceT = 1;
      s.vel.set(0, 0, 0);
      i++;
    }
    if (out.length) this.emit({ t: 'dismount', unit: carrier, count: i });
    return out;
  }

  // ------------------------------------------------------------ main update

  update(dt) {
    this.dt = dt;
    this.time += dt;
    this.tick++;
    this.losBudget = this.losPerTick;
    this.weather.update(dt);
    // Grids.
    this.unitGrid.rebuild(this.units, isActive);
    this.factionGrids[0].rebuild(this.factions[0].units, isActive);
    this.factionGrids[1].rebuild(this.factions[1].units, isActive);
    this.airUnits[0].length = 0;
    this.airUnits[1].length = 0;
    for (let i = 0; i < this.units.length; i++) {
      const u = this.units[i];
      if (u.cat === 'air' && u.alive && !u.dying) this.airUnits[u.faction].push(u);
    }
    this.paths.update(this.opts.pathBudgetMs ?? 3);
    // Strategic and squad AI.
    for (const f of this.factions) {
      if (f.intel) f.intel.update(dt, this);
      if (f.commander) f.commander.update(dt, this);
      for (let i = f.squads.length - 1; i >= 0; i--) {
        const sq = f.squads[i];
        if (sq.disbanded) {
          f.squads.splice(i, 1);
          continue;
        }
        sq.update(dt, this);
      }
    }
    // Separation between soldiers (staggered over 3 ticks).
    this.updateSeparation();
    // Units.
    const units = this.units;
    for (let i = 0; i < units.length; i++) {
      const u = units[i];
      if (!u.alive) continue;
      const b = u.brain;
      if (b && !u.hidden && !u.dying) {
        if (this.time >= u.nextThink) {
          b.think(this);
          u.nextThink = this.time + b.thinkInterval();
        }
        b.update(dt, this);
      }
      u.update(dt, this);
    }
    // Remove units that died this tick from the live list.
    for (let i = units.length - 1; i >= 0; i--) {
      const u = units[i];
      if (!u.alive || u.removed) {
        units[i] = units[units.length - 1];
        units.pop();
        const fl = this.factions[u.faction].units;
        const k = fl.indexOf(u);
        if (k >= 0) {
          fl[k] = fl[fl.length - 1];
          fl.pop();
        }
        if (!u.removed) this.dead.push(u);
        else this.unitById.delete(u.id);
      }
    }
    this.projectiles.update(dt);
    this.smoke.update(dt);
    this.updateFires(dt);
    this.updateFallingTrees(dt);
    for (const o of this.objectives) o.update(dt, this);
    this.updateTickets(dt);
    this.cleanupDead();
    if (this.tick % 30 === 0) this.decayHeat();
    if (this.tick % 120 === 0) this.pruneLosCache();
  }

  updateSeparation() {
    const phase = this.tick % 3;
    for (let i = phase; i < this.units.length; i += 3) {
      const u = this.units[i];
      if (u.cat !== 'inf' || !u.alive || u.hidden || u.para || u.climb) continue;
      let sx = 0;
      let sz = 0;
      this.unitGrid.queryRadius(u.pos.x, u.pos.z, 6, _tmp);
      for (let k = 0; k < _tmp.length; k++) {
        const o = _tmp[k];
        if (o === u || !o.alive || o.hidden) continue;
        const dx = u.pos.x - o.pos.x;
        const dz = u.pos.z - o.pos.z;
        const d2 = dx * dx + dz * dz;
        if (o.cat === 'inf') {
          if (d2 < 1.4 && d2 > 1e-6 && Math.abs(o.pos.y - u.pos.y) < 2) {
            const d = Math.sqrt(d2);
            sx += (dx / d) * (1.2 - d) * 2.2;
            sz += (dz / d) * (1.2 - d) * 2.2;
          }
        } else if (o.cat === 'veh') {
          // Get out of the way of vehicles.
          const r = o.radius + 1.2;
          if (d2 < r * r && d2 > 1e-6) {
            const d = Math.sqrt(d2);
            sx += (dx / d) * (r - d) * 1.6;
            sz += (dz / d) * (r - d) * 1.6;
          }
        }
      }
      u.sepX = clamp(sx, -4, 4);
      u.sepZ = clamp(sz, -4, 4);
    }
  }

  // ------------------------------------------------------------ perception helpers

  // Cached line-of-sight between two units; respects a per-tick budget.
  // Returns visibility 0..1 or -1 if over budget (try again later).
  unitLOS(a, b, maxAge = 0.9) {
    const ka = a.id < b.id ? a.id : b.id;
    const kb = a.id < b.id ? b.id : a.id;
    const key = ka * 131072 + kb;
    const c = this.losCache.get(key);
    if (c !== undefined && this.time - c.t < maxAge) return c.v;
    if (this.losBudget <= 0) return c !== undefined ? c.v : -1;
    this.losBudget--;
    a.eyePos(_v);
    b.centerPos(_v2);
    const v = this.los.visibility(_v.x, _v.y, _v.z, _v2.x, _v2.y, _v2.z, a.roof || null, b.roof || null);
    if (c !== undefined) {
      c.v = v;
      c.t = this.time;
    } else this.losCache.set(key, { v, t: this.time });
    return v;
  }

  pruneLosCache() {
    const t = this.time;
    for (const [k, c] of this.losCache) if (t - c.t > 3) this.losCache.delete(k);
  }

  blastExposed(ax, ay, az, bx, by, bz) {
    if (!this.terrain.lineClear(ax, ay, az, bx, by, bz, 0.1)) return false;
    return !this.structures.blocksSight(ax, ay, az, bx, by, bz);
  }

  noteCombat(x, z, w) {
    const cx = clamp(Math.floor((x + 1024) / 64), 0, 31);
    const cz = clamp(Math.floor((z + 1024) / 64), 0, 31);
    this.combatHeat[cz * 32 + cx] += w;
  }

  decayHeat() {
    const h = this.combatHeat;
    for (let i = 0; i < h.length; i++) h[i] *= 0.82;
  }

  // ------------------------------------------------------------ firing

  // Fire `n` rounds from a weapon mount. `dir` is the aim direction (unit),
  // `origin` the muzzle. Dispersion (radians std) is applied per round.
  fireRounds(unit, mount, origin, dir, n, dispersion, target, dt, extra = {}) {
    const def = mount.def;
    const ap = def.ammoTypes ? def.ammoTypes[mount.ammoType] : def;
    const speed = extra.speed ?? ap.speed ?? def.speed;
    for (let k = 0; k < n; k++) {
      let dx = dir.x;
      let dy = dir.y;
      let dz = dir.z;
      if (dispersion > 0) {
        _scatter(dx, dy, dz, dispersion, _sd);
        dx = _sd.x;
        dy = _sd.y;
        dz = _sd.z;
      }
      // Stagger rounds fired within one tick along the flight path.
      const lead = n > 1 ? (k / n) * dt : 0;
      const tracer = def.tracer ? (mount.shots - k) % def.tracer === 0 : !!ap.tracerGlow;
      this.projectiles.spawn({
        def,
        ap,
        owner: unit,
        faction: unit.faction,
        x: origin.x + dx * speed * lead,
        y: origin.y + dy * speed * lead,
        z: origin.z + dz * speed * lead,
        vx: dx * speed,
        vy: dy * speed,
        vz: dz * speed,
        tracer,
        target: extra.guided ? target : null,
        targetPoint: extra.targetPoint || null,
        ignore: unit.mounted || null,
        launcher: unit,
        fuse: extra.fuse,
        whistleAt: extra.whistleAt,
        gravity: extra.gravity,
        life: extra.life,
        noThrust: extra.noThrust,
      });
    }
    this.stats.shots += n;
    unit.lastFired = this.time;
    unit.stats.shots += n;
    if (unit.cat === 'inf') unit.fireT = 0;
    else if (unit.cat === 'veh' && mount.mount === 'gun') unit.recoilT = 0;
    // Weapons like rotary cannons play one sound per burst (with its duration).
    const sound = !def.oneSoundPerBurst || mount.newBurst;
    const duration = def.oneSoundPerBurst ? ((mount.burstLeft + n) / def.rpm) * 60 : 0;
    mount.newBurst = false;
    this.emit({ t: 'fire', unit, weapon: def, mount: mount.mount, x: origin.x, y: origin.y, z: origin.z, dx: dir.x, dy: dir.y, dz: dir.z, n, ammo: mount.ammoType, sound, duration });
    this.noteCombat(origin.x, origin.z, def.kind === 'bullet' ? 0.05 * n : 1);
  }

  // ------------------------------------------------------------ battlefield actions

  // Radio traffic for the HUD/audio, throttled per faction by priority.
  emitRadio(faction, text, priority = 0) {
    const now = this.time;
    const gap = priority >= 2 ? 0.8 : priority === 1 ? 2.5 : 5;
    if (now - this.radioT[faction] < gap) return;
    this.radioT[faction] = now;
    this.emit({ t: 'radio', faction, text, priority });
  }

  smokeGrenade(u, x, z) {
    const y = this.terrain.heightAt(x, z);
    this.smoke.add(x, y + 2, z, 11, 45, 0.28, 'screen');
    this.emit({ t: 'smoke_screen', x, y, z, r: 11, unit: u, kind: 'grenade' });
  }

  // Vehicle smoke dischargers: a wall of smoke 25-30 m toward the turret's front.
  popSmoke(v) {
    if (v.smokeCharges <= 0) return;
    v.smokeCharges--;
    v.lastSmoke = this.time;
    const yaw = v.yaw + v.turretYaw;
    for (let i = -2; i <= 2; i++) {
      const a = yaw + i * 0.32;
      const x = v.pos.x + Math.sin(a) * 27;
      const z = v.pos.z + Math.cos(a) * 27;
      const y = this.terrain.heightAt(x, z);
      this.smoke.add(x, y + 2.5, z, 9, 40, 0.32, 'screen');
      this.emit({ t: 'smoke_screen', x, y, z, r: 9, unit: v, kind: 'launcher', fromX: v.pos.x, fromY: v.pos.y + 2.4, fromZ: v.pos.z });
    }
    this.emit({ t: 'smoke_launch', unit: v, x: v.pos.x, y: v.pos.y + 2.4, z: v.pos.z });
  }

  // Countermeasure flares; each may seduce IR missiles tracking the aircraft.
  popFlares(a) {
    if (a.flares <= 0) return;
    a.flares = Math.max(0, a.flares - 4);
    a.lastFlare = this.time;
    for (let i = 0; i < 4; i++) {
      const side = i % 2 ? 1 : -1;
      const rx = Math.cos(a.yaw) * side;
      const rz = -Math.sin(a.yaw) * side;
      const f = this.projectiles.spawn({
        def: FLARE_DEF,
        kind: 'flare',
        owner: a,
        x: a.pos.x,
        y: a.pos.y - 1,
        z: a.pos.z,
        vx: a.vel.x * 0.6 + rx * rng.range(10, 22),
        vy: rng.range(-6, 4),
        vz: a.vel.z * 0.6 + rz * rng.range(10, 22),
        life: rng.range(3.5, 5),
        gravity: 0.3,
      });
      this.projectiles.decoyMissiles(a, f);
    }
    this.emit({ t: 'flares', unit: a, x: a.pos.x, y: a.pos.y, z: a.pos.z });
  }

  launchDrone(op, target) {
    const d = this.spawnUnit('fpv_drone', op.faction, op.pos.x + Math.sin(op.yaw) * 1.5, op.pos.z + Math.cos(op.yaw) * 1.5, { y: op.pos.y + 1.3, yaw: op.yaw });
    d.operator = op;
    d.callsign = op.callsign;
    op.drones--;
    op.activeDrone = d;
    if (d.brain && d.brain.setTarget) d.brain.setTarget(target);
    this.emit({ t: 'drone_launch', unit: d });
    return d;
  }

  // ------------------------------------------------------------ damage & death

  damageSoldier(s, dmg, killer, def, head) {
    if (!s.alive) return;
    s.hp -= dmg;
    s.lastHitTime = this.time;
    s.suppression = Math.min(1, s.suppression + 0.35);
    if (killer) s.threatSource = killer;
    if (s.hp <= 0) this.killSoldier(s, killer, def, head);
    else if (s.hp < 45) s.wounded = true;
  }

  killSoldier(s, killer, def, head = false) {
    if (!s.alive) return;
    s.alive = false;
    s.hp = 0;
    s.deathTime = this.time;
    s.deadT = 0;
    s.fallDir = rng.chance(0.5) ? 1 : -1;
    s.killer = killer;
    if (s.cover && this.cover) this.cover.release(s);
    if (s.mounted) {
      const m = s.mounted;
      const i = m.passengers.indexOf(s);
      if (i >= 0) m.passengers.splice(i, 1);
      s.removed = true; // died inside a vehicle: no body to render
    }
    if (s.para) s.para = null;
    if (s.roof && s.roof.destroyed) s.roof = null;
    this.onDeath(s, killer, def, head);
  }

  onDeath(u, killer, def, head) {
    const f = this.factions[u.faction];
    f.losses[u.cat]++;
    if (!this.endless) f.tickets = Math.max(0, f.tickets - Math.max(1, u.def.cost));
    if (killer && killer.faction !== u.faction) {
      killer.kills++;
      this.factions[killer.faction].kills++;
    }
    if (u.squad) u.squad.onMemberDeath(u, this);
    this.emit({ t: 'death', unit: u, head });
    this.emit({ t: 'kill', killer, victim: u, weapon: def });
    this.noteCombat(u.pos.x, u.pos.z, u.cat === 'inf' ? 1 : 5);
  }

  igniteVehicle(v, attacker, def) {
    if (!v.alive || v.burning > 0) return;
    v.burning = rng.range(14, 32);
    v.burnAttacker = attacker;
    v.burnDef = def;
    v.mobilityKill = true;
    v.firepowerKill = true;
    this.emit({ t: 'vehicle_fire', unit: v });
    // Crew and passengers bail out of a burning vehicle.
    this.bailOut(v, 0.8);
  }

  updateBurning(v, dt) {
    v.burning -= dt;
    v.hp -= dt * 8;
    if (v.burning <= 0 || v.hp <= 0) this.destroyVehicle(v, v.burnAttacker, v.burnDef, rng.chance(0.55));
  }

  bailOut(v, survival) {
    if (v.passengers.length) {
      for (const p of v.passengers) if (rng.next() > survival) this.killSoldier(p, v.burnAttacker || null, null);
      const out = this.dismountAll(v);
      for (const s of out) if (s.alive && s.squad) s.squad.onDismounted?.(this);
    }
    const crew = Math.round(v.crew * survival * rng.range(0.7, 1));
    v.crew = 0;
    for (let i = 0; i < crew; i++) {
      _v.set(rng.range(-2.5, 2.5), 0, rng.range(-2, 2)).applyAxisAngle(_up, v.yaw);
      const s = this.spawnUnit('crew', v.faction, v.pos.x + _v.x + (i - 1) * 1.2, v.pos.z + _v.z, { yaw: v.yaw + Math.PI });
      s.bailedFrom = v;
      s.stance = 1;
    }
    if (crew > 0) this.emit({ t: 'bailout', unit: v, count: crew });
  }

  destroyVehicle(v, killer, def, catastrophic) {
    if (!v.alive) return;
    if (!catastrophic && v.crew > 0) this.bailOut(v, 0.75);
    else if (v.passengers.length) this.bailOut(v, catastrophic ? 0.1 : 0.6);
    v.alive = false;
    v.wreck = true;
    v.catastrophic = catastrophic;
    v.hp = 0;
    v.deathTime = this.time;
    v.deadT = 0;
    v.speed = 0;
    v.aimTarget = null;
    v.burning = catastrophic ? rng.range(60, 140) : rng.range(30, 90);
    if (catastrophic) {
      const s = v.spec;
      const tp = new Vector3(s.turretPivot[0], s.turretPivot[1], s.turretPivot[2]).applyQuaternion(v.quat).add(v.pos);
      const q = v.quat.clone().multiply(new Quaternion().setFromAxisAngle(_up, v.turretYaw));
      v.turretOff = {
        pos: tp,
        quat: q,
        vel: new Vector3(rng.range(-5, 5), rng.range(12, 24), rng.range(-5, 5)),
        axis: new Vector3(rng.range(-1, 1), rng.range(-0.3, 0.3), rng.range(-1, 1)).normalize(),
        spin: rng.range(2, 6),
        rest: false,
      };
      if (v.type !== 'mbt' && v.type !== 'spaag' && v.type !== 'spg') v.turretOff.vel.y *= 0.5;
    }
    const ex = { radius: catastrophic ? 9 : 5, damage: catastrophic ? 160 : 60, blastPen: 5, suppression: 1, size: catastrophic ? 'huge' : 'large', crater: 0 };
    explode(this, v.pos.x, v.pos.y + 1.5, v.pos.z, ex, killer, killer ? killer.faction : -1, def, { exclude: v });
    this.emit({ t: 'vehicle_destroyed', unit: v, catastrophic });
    // The wreck becomes cover and an obstacle.
    const sp = v.spec;
    const wreck = new Structure({ kind: 'wreck', type: 'car_wreck', x: v.pos.x, z: v.pos.z, y: v.pos.y, yaw: v.yaw, hx: sp.width / 2, hz: sp.length / 2, h: catastrophic ? sp.hullHeight : sp.height * 0.9, hp: 1e9 });
    wreck.unit = v;
    wreck.noRender = true;
    this.structures.add(wreck);
    v.wreckStructure = wreck;
    this.nav.markObstacle(v.pos.x, v.pos.z, Math.max(sp.width, sp.length) * 0.55);
    if (this.cover) this.cover.addAround(wreck);
    this.onDeath(v, killer, def, false);
  }

  destroyAircraft(a, killer, def, reason) {
    if (!a.alive || a.crashing) {
      if (a.crashing && reason !== 'shot') this.aircraftImpact(a);
      return;
    }
    if (a.aclass === 'drone') {
      this.droneImpact(a, reason !== 'battery');
      return;
    }
    if (reason === 'terrain') {
      this.onDeath(a, killer, def, false);
      a.crashing = true;
      this.aircraftImpact(a);
      return;
    }
    a.crashing = true;
    a.crashSpin = (rng.chance(0.5) ? 1 : -1) * (a.aclass === 'heli' ? rng.range(2.5, 4.5) : rng.range(0.6, 1.5));
    a.smoking = 1;
    this.emit({ t: 'aircraft_hit', unit: a });
    this.emit({ t: 'explosion', x: a.pos.x, y: a.pos.y, z: a.pos.z, size: 'large', radius: 8, air: true });
    // Passengers in a stricken helicopter are lost; jet pilots may eject.
    for (const p of a.passengers) this.killSoldier(p, killer, def);
    a.passengers.length = 0;
    if ((a.aclass === 'jet' || a.aclass === 'plane') && rng.chance(0.65)) {
      const pilot = this.spawnUnit('pilot', a.faction, a.pos.x, a.pos.z, { y: a.pos.y + 3 });
      pilot.para = { phase: 'fall', t: 0, deployAt: 1.2, tx: a.pos.x + a.vel.x * 2, tz: a.pos.z + a.vel.z * 2 };
      pilot.vel.set(a.vel.x * 0.3, 18, a.vel.z * 0.3);
    }
    this.onDeath(a, killer, def, false);
    // Stays in `units` (alive=false is filtered) until impact: keep it simulated.
    a.alive = true;
    a.dying = true;
  }

  aircraftImpact(a) {
    if (a.impacted) return;
    a.impacted = true;
    const g = this.terrain.heightAt(a.pos.x, a.pos.z);
    const y = Math.max(a.pos.y, g);
    const big = a.aclass === 'plane' || a.aclass === 'jet';
    const ex = { radius: big ? 16 : 10, damage: big ? 300 : 200, blastPen: 10, suppression: 1.4, size: 'huge', crater: big ? 2.2 : 1.2 };
    explode(this, a.pos.x, y + 0.5, a.pos.z, ex, null, -1, null, {});
    a.pos.y = g;
    a.alive = false;
    a.wreck = true;
    a.dying = false;
    a.deathTime = this.time;
    a.burning = rng.range(40, 100);
    a.crashing = false;
    a.vel.set(0, 0, 0);
    this.emit({ t: 'aircraft_crash', unit: a });
    if (a.aclass === 'heli' || a.aclass === 'plane') {
      const wreck = new Structure({ kind: 'wreck', type: 'car_wreck', x: a.pos.x, z: a.pos.z, y: g, yaw: a.yaw, hx: a.spec.width * 0.3, hz: a.spec.length * 0.4, h: 2.5, hp: 1e9 });
      wreck.unit = a;
      wreck.noRender = true;
      this.structures.add(wreck);
      if (this.cover) this.cover.addAround(wreck);
    } else {
      a.removeAfter = this.time + 30;
    }
  }

  droneImpact(d, detonate = true) {
    if (!d.alive) return;
    d.alive = false;
    d.removed = true;
    if (detonate) {
      const def = WEAPONS[d.def.warhead] || WEAPONS.drone_warhead;
      // Shaped charge: if right on a vehicle, hit it from above.
      const tgt = d.diveTarget;
      if (tgt && tgt.alive && tgt.cat === 'veh' && d.pos.distanceTo(tgt.pos) < tgt.radius + 2.5) {
        const armor = tgt.def.armor.top;
        const pen = def.pen * rng.range(0.85, 1.1);
        if (pen > armor) {
          this.emit({ t: 'impact', kind: 'penetration', x: d.pos.x, y: d.pos.y, z: d.pos.z, size: 1.6, nx: 0, ny: 1, nz: 0 });
          const dmg = def.vehicleDamage * rng.range(0.8, 1.2);
          tgt.hp -= dmg;
          tgt.lastHitTime = this.time;
          tgt.threatSource = d.operator;
          if (rng.chance(0.3)) this.igniteVehicle(tgt, d.operator, def);
          if (rng.chance(0.18) || tgt.hp <= 0) this.destroyVehicle(tgt, d.operator, def, rng.chance(0.5));
          else if (rng.chance(0.35)) tgt.mobilityKill = true;
        }
      }
      explode(this, d.pos.x, d.pos.y, d.pos.z, def.explosive, d.operator, d.faction, def, { exclude: tgt && tgt.cat === 'veh' ? tgt : null });
    }
    this.emit({ t: 'drone_down', unit: d });
    if (d.operator && d.operator.activeDrone === d) d.operator.activeDrone = null;
  }

  destroyStructure(s, source) {
    if (s.destroyed) return;
    s.destroyed = true;
    s.hp = 0;
    s.damage = 1;
    s.version++;
    const b = s.bounds();
    if (s.kind === 'building') {
      this.emit({ t: 'building_collapse', s });
      this.smoke.add(s.x, s.y + 4, s.z, Math.max(s.hx, s.hz) * 1.6, 25, 0.08, 'dust');
      // Anyone on the roof or hugging the walls gets hurt.
      this.unitGrid.queryRadius(s.x, s.z, s.radius + 4, _tmp);
      for (const u of _tmp) {
        if (u.cat !== 'inf' || !u.alive) continue;
        if (u.roof === s) {
          u.roof = null;
          this.damageSoldier(u, rng.range(60, 200), source, null, false);
          if (u.alive) u.pos.y = this.terrain.heightAt(u.pos.x, u.pos.z);
        } else if (this.structures.structureAt(u.pos.x, u.pos.z, 1.5) === s && rng.chance(0.5)) {
          this.damageSoldier(u, rng.range(30, 120), source, null, false);
        }
      }
      if (s.burning <= 0 && rng.chance(0.4)) {
        s.burning = rng.range(40, 120);
        this.burningStructures.add(s);
      }
    } else {
      this.emit({ t: 'structure_destroyed', s });
      if (s.type === 'fuel_tank' || s.type === 'fuel_drums') {
        const big = s.type === 'fuel_tank';
        const ex = { radius: big ? 18 : 8, damage: big ? 250 : 120, blastPen: 5, suppression: 1.2, size: big ? 'huge' : 'large', crater: 0 };
        explode(this, s.x, s.y + 1.5, s.z, ex, source, -1, null, {});
        s.burning = big ? 180 : 60;
        this.burningStructures.add(s);
      }
    }
    this.nav.rebuildStructures(b[0] - 4, b[1] - 4, b[2] + 4, b[3] + 4);
    if (this.cover) this.cover.onStructureDestroyed(s);
  }

  updateFires(dt) {
    for (const s of this.burningStructures) {
      s.burning -= dt;
      if (s.burning <= 0) {
        s.burning = 0;
        s.version++;
        this.burningStructures.delete(s);
        continue;
      }
      s.fireT = (s.fireT || 0) - dt;
      if (s.fireT <= 0) {
        s.fireT = rng.range(2.5, 4);
        this.smoke.add(s.x + rng.range(-3, 3), s.top + 4, s.z + rng.range(-3, 3), 9, 16, 0.05, 'fire');
        if (!s.destroyed && s.kind === 'building') damageStructure(this, s, s.maxHp * 0.004, null);
      }
    }
    // Burning wrecks also drop smoke clouds.
    if (this.tick % 20 === 0) {
      for (const u of this.dead) {
        if (u.burning > 5 && (u.cat === 'veh' || u.cat === 'air')) {
          this.smoke.add(u.pos.x, u.pos.y + 6, u.pos.z, 7, 14, 0.045, 'fire');
        }
      }
    }
  }

  // ------------------------------------------------------------ trees

  fellTree(t, dirYaw) {
    if (!t.alive) return;
    t.alive = false;
    t.fallYaw = dirYaw;
    t.fall = 0.001;
    t.version++;
    this.fallingTrees = this.fallingTrees || [];
    this.fallingTrees.push(t);
    this.emit({ t: 'tree_fall', tree: t });
  }

  updateFallingTrees(dt) {
    const list = this.fallingTrees;
    if (!list || !list.length) return;
    for (let i = list.length - 1; i >= 0; i--) {
      const t = list[i];
      t.fall = Math.min(1, t.fall + dt * (0.4 + t.fall * 2.5));
      t.version++;
      if (t.fall >= 1) list.splice(i, 1);
    }
  }

  // ------------------------------------------------------------ collisions

  // Push a soldier position out of solid structures. Low walls are vaulted.
  resolveInfantryCollision(nx, nz, ox, oz) {
    this.structures.grid.queryRect(nx - 3, nz - 3, nx + 3, nz + 3, _tmp);
    for (let i = 0; i < _tmp.length; i++) {
      const s = _tmp[i];
      if (!s.blocksMove || (s.destroyed && s.kind !== 'building')) continue;
      if (s.destroyed) continue; // rubble is walkable
      if (s.solidH < 1.3 || s.type === 'hedge' || s.type === 'fence' || s.type === 'tank_trap') continue;
      const c = Math.cos(s.yaw);
      const sn = Math.sin(s.yaw);
      const rx = nx - s.x;
      const rz = nz - s.z;
      let lx = rx * c - rz * sn;
      let lz = rx * sn + rz * c;
      const ex = s.hx + 0.35;
      const ez = s.hz + 0.35;
      if (Math.abs(lx) < ex && Math.abs(lz) < ez) {
        const px = ex - Math.abs(lx);
        const pz = ez - Math.abs(lz);
        if (px < pz) lx = Math.sign(lx || 1) * ex;
        else lz = Math.sign(lz || 1) * ez;
        nx = s.x + lx * c + lz * sn;
        nz = s.z - lx * sn + lz * c;
      }
    }
    _res.x = clamp(nx, -1000, 1000);
    _res.z = clamp(nz, -1000, 1000);
    _res.blocked = false;
    return _res;
  }

  resolveVehicleCollision(v, nx, nz) {
    _res.blocked = false;
    const r = v.radius + 2;
    this.structures.grid.queryRect(nx - r, nz - r, nx + r, nz + r, _tmp);
    const vc = Math.cos(v.yaw);
    const vs = Math.sin(v.yaw);
    const hx = v.hull.hx * 0.92;
    const hz = v.hull.hz * 0.92;
    const tracked = v.spec.kind === 'tracked';
    for (let i = 0; i < _tmp.length; i++) {
      const s = _tmp[i];
      if (!s.blocksMove || s === v.wreckStructure) continue;
      if (s.destroyed) continue;
      if (s.crushable && (tracked || s.type !== 'hedge')) continue;
      if (tracked && s.type === 'stone_wall') continue;
      // Separating axis test between two rectangles; push along the axis of least overlap.
      const pen = rectPenetration(nx, nz, hx, hz, v.yaw, vc, vs, s.x, s.z, s.hx, s.hz, s.yaw);
      if (pen) {
        nx += pen.x;
        nz += pen.z;
        _res.blocked = true;
      }
    }
    // Other vehicles (alive or wrecked): circle push.
    this.unitGrid.queryRadius(nx, nz, v.radius * 2 + 2, _tmp);
    for (let i = 0; i < _tmp.length; i++) {
      const o = _tmp[i];
      if (o === v || o.cat !== 'veh') continue;
      const dx = nx - o.pos.x;
      const dz = nz - o.pos.z;
      const d = Math.hypot(dx, dz);
      const min = (v.radius + o.radius) * 0.62;
      if (d < min && d > 1e-3) {
        nx += (dx / d) * (min - d) * 0.5;
        nz += (dz / d) * (min - d) * 0.5;
        _res.blocked = true;
      }
    }
    _res.x = nx;
    _res.z = nz;
    return _res;
  }

  // Tracked vehicles flatten trees, fences, hedges, cars and stone walls.
  crushAt(v, x, z) {
    if (this.tick % 2 !== v.id % 2) return;
    const fx = Math.sin(v.yaw);
    const fz = Math.cos(v.yaw);
    const px = x + fx * v.hull.hz * 0.8;
    const pz = z + fz * v.hull.hz * 0.8;
    this.trees.grid.queryRadius(px, pz, 4, _tmp);
    for (const t of _tmp) {
      if (t.alive && t.kind !== 3 && Math.hypot(t.x - px, t.z - pz) < v.hull.hx + 0.8) this.fellTree(t, v.yaw + rng.range(-0.5, 0.5));
    }
    this.structures.grid.queryRect(px - 3, pz - 3, px + 3, pz + 3, _tmp);
    for (const s of _tmp) {
      if (s.destroyed || !(s.crushable || s.type === 'stone_wall')) continue;
      const c = Math.cos(s.yaw);
      const sn = Math.sin(s.yaw);
      const lx = (px - s.x) * c - (pz - s.z) * sn;
      const lz = (px - s.x) * sn + (pz - s.z) * c;
      if (Math.abs(lx) < s.hx + v.hull.hx && Math.abs(lz) < s.hz + 1.5) {
        this.emit({ t: 'crush', s, unit: v });
        this.destroyStructure(s, v);
      }
    }
  }

  onCrater(x, z, r) {
    this.emit({ t: 'crater', x, z, r });
    if (this.cover && r > 2.5) this.cover.addCrater(x, z, r);
  }

  // ------------------------------------------------------------ tickets & end

  updateTickets(dt) {
    if (this.over || this.endless) return;
    this.bleedTimer += dt;
    if (this.bleedTimer >= 4) {
      this.bleedTimer = 0;
      const own = [0, 0];
      for (const o of this.objectives) if (o.owner >= 0) own[o.owner]++;
      const diff = own[0] - own[1];
      if (diff > 0) this.factions[1].tickets = Math.max(0, this.factions[1].tickets - diff * 2);
      if (diff < 0) this.factions[0].tickets = Math.max(0, this.factions[0].tickets + diff * 2);
    }
    for (const f of this.factions) {
      if (f.tickets <= 0 && f.units.filter((u) => u.cat !== 'air').length < 8) {
        this.over = true;
        this.winner = 1 - f.id;
        this.emit({ t: 'battle_over', winner: this.winner });
        return;
      }
    }
  }

  cleanupDead() {
    if (this.tick % 60 !== 0) return;
    const maxBodies = this.opts.maxBodies ?? 1800;
    let bodies = 0;
    for (const u of this.dead) if (u.cat === 'inf') bodies++;
    const now = this.time;
    for (let i = this.dead.length - 1; i >= 0; i--) {
      const u = this.dead[i];
      let rm = false;
      if (u.cat === 'inf' && bodies > maxBodies && now - u.deathTime > 20) {
        rm = true;
        bodies--;
      }
      if (u.removeAfter && now > u.removeAfter) rm = true;
      if (u.removed) rm = true;
      if (rm) {
        u.removed = true;
        this.dead[i] = this.dead[this.dead.length - 1];
        this.dead.pop();
        this.unitById.delete(u.id);
      }
    }
  }

  // Counts for the HUD.
  strength(f) {
    let inf = 0;
    let veh = 0;
    let air = 0;
    for (const u of this.factions[f].units) {
      if (!u.alive || u.dying) continue;
      if (u.cat === 'inf') inf++;
      else if (u.cat === 'veh') veh++;
      else if (u.aclass !== 'drone') air++;
    }
    return { inf, veh, air };
  }
}

const _up = new Vector3(0, 1, 0);
const _sd = { x: 0, y: 0, z: 0 };
const FLARE_DEF = { id: 'flare', kind: 'flare', drag: 0.004, life: 5 };

function isActive(u) {
  return u.alive && !u.hidden;
}

function _scatter(dx, dy, dz, spread, out) {
  // Gaussian deflection in two perpendicular directions.
  let ux;
  let uy;
  let uz;
  if (Math.abs(dy) < 0.95) {
    ux = -dz;
    uy = 0;
    uz = dx;
  } else {
    ux = 1;
    uy = 0;
    uz = 0;
  }
  let l = Math.hypot(ux, uy, uz);
  ux /= l;
  uy /= l;
  uz /= l;
  const vx = dy * uz - dz * uy;
  const vy = dz * ux - dx * uz;
  const vz = dx * uy - dy * ux;
  const a = rng.gauss() * spread;
  const b = rng.gauss() * spread;
  out.x = dx + ux * a + vx * b;
  out.y = dy + uy * a + vy * b;
  out.z = dz + uz * a + vz * b;
  l = Math.hypot(out.x, out.y, out.z);
  out.x /= l;
  out.y /= l;
  out.z /= l;
}

const _pen = { x: 0, z: 0 };

// Minimum translation to separate rectangle A (centre ax,az, half hx,hz,
// rotation yaw) from rectangle B. Returns null if not overlapping.
function rectPenetration(ax, az, ahx, ahz, ayaw, ac, as, bx, bz, bhx, bhz, byaw) {
  const bc = Math.cos(byaw);
  const bs = Math.sin(byaw);
  // Local X axis of a yaw is (cos, -sin), local Z is (sin, cos).
  const axes = [
    [ac, -as],
    [as, ac],
    [bc, -bs],
    [bs, bc],
  ];
  const dx = ax - bx;
  const dz = az - bz;
  let best = Infinity;
  let bnx = 0;
  let bnz = 0;
  for (let i = 0; i < 4; i++) {
    const nx = axes[i][0];
    const nz = axes[i][1];
    const ra = ahx * Math.abs(ac * nx - as * nz) + ahz * Math.abs(as * nx + ac * nz);
    const rb = bhx * Math.abs(bc * nx - bs * nz) + bhz * Math.abs(bs * nx + bc * nz);
    const dist = dx * nx + dz * nz;
    const overlap = ra + rb - Math.abs(dist);
    if (overlap <= 0) return null;
    if (overlap < best) {
      best = overlap;
      const sg = dist >= 0 ? 1 : -1;
      bnx = nx * sg;
      bnz = nz * sg;
    }
  }
  _pen.x = bnx * best;
  _pen.z = bnz * best;
  return _pen;
}
