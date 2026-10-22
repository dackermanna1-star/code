// Tactical units. A Squad is a group of soldiers (optionally carried by an
// IFV/APC) executing an order from its commander through a state machine:
//
//   mounted -> moving -> contact -> bounding / flank / assault -> holding
//                               \-> retreat -> regroup -> (new orders)
//
// The squad hands each member a task ({type, x, z, ...}); the member's brain
// carries it out (pathing, cover, stance, shooting). A VehicleGroup does the
// same for platoons of vehicles.

import { rng } from '../core/rng.js';
import { clamp, dist2 } from '../core/math.js';
import { MOVE_INF, MOVE_TRACK, MOVE_WHEEL } from '../world/nav.js';

// Slot offsets in metres (x right, z forward); spaced so one burst or shell
// does not catch the whole squad.
const FORMATIONS = {
  wedge: [[0, 0], [-6, -5], [6, -5], [-12, -10], [12, -10], [-18, -15], [18, -15], [-24, -20], [24, -20], [0, -12]],
  line: [[0, 0], [-7, -1], [7, -1], [-14, -2], [14, -2], [-21, -2], [21, -2], [-28, -3], [28, -3], [0, -7]],
  column: [[0, 0], [0.8, -4.5], [-0.8, -9], [0.8, -13.5], [-0.8, -18], [0.8, -22.5], [-0.8, -27], [0.8, -31.5], [-0.8, -36], [0, -40]],
};

const NATO = ['Alpha', 'Bravo', 'Charlie', 'Delta', 'Echo', 'Foxtrot', 'Golf', 'Hotel', 'India', 'Juliet', 'Kilo', 'Lima', 'Mike', 'Oscar', 'Romeo', 'Sierra', 'Tango', 'Victor', 'Whiskey', 'Yankee'];
const FED = ['Granit', 'Berkut', 'Volk', 'Grom', 'Sokol', 'Kedr', 'Shtorm', 'Taiga', 'Yastreb', 'Zubr', 'Vityaz', 'Rubin', 'Almaz', 'Kobra', 'Sever', 'Tigr', 'Orel', 'Buran', 'Kremen', 'Rassvet'];
const counters = [0, 0];

export function nextCallsign(faction) {
  const n = counters[faction]++;
  if (faction === 0) return `${NATO[n % NATO.length]} ${1 + Math.floor(n / NATO.length)}-${1 + (n % 3)}`;
  return `${FED[n % FED.length]}-${10 + Math.floor(n / FED.length) * 10 + (n % 9) + 1}`;
}

export function resetCallsigns() {
  counters[0] = 0;
  counters[1] = 0;
}

let squadIds = 1;

export class Squad {
  constructor(world, faction, kind, members, opts = {}) {
    this.id = squadIds++;
    this.world = world;
    this.faction = faction;
    this.kind = kind;
    this.members = members;
    this.initialSize = members.length;
    this.callsign = opts.callsign || nextCallsign(faction);
    for (const m of members) {
      m.squad = this;
      m.callsign = this.callsign;
    }
    this.leader = members[0];
    this.vehicle = opts.vehicle || null;
    if (this.vehicle) {
      this.vehicle.carrierOf = this;
      this.vehicle.callsign = this.callsign;
    }
    this.order = null;
    this.state = 'idle';
    this.stateT = 0;
    this.morale = 1;
    this.suppression = 0;
    this.goal = null;
    this.contact = null;
    this.lastContactT = -100;
    this.contactStart = -100;
    this.t = rng.range(0, 1);
    this.team = 0; // bounding team currently moving
    this.boundT = 0;
    this.flankDone = false;
    this.pathPending = false;
    this.disbanded = false;
    this.rally = null;
    this.supportRequestT = -100;
    this.formation = 'wedge';
    this.isTeam = members.length <= 2;
    this.lastProgressT = 0;
    this.lastGoalDist = Infinity;
    world.factions[faction].squads.push(this);
  }

  get alive() {
    return this.members.length;
  }

  // Roles the commander cares about.
  has(role) {
    return this.members.some((m) => m.def.role === role);
  }

  get mounted() {
    return !!(this.vehicle && this.vehicle.alive && this.members.some((m) => m.mounted === this.vehicle));
  }

  get center() {
    let x = 0;
    let z = 0;
    let n = 0;
    for (const m of this.members) {
      if (!m.alive) continue;
      x += m.pos.x;
      z += m.pos.z;
      n++;
    }
    return n ? { x: x / n, z: z / n } : { x: this.leader.pos.x, z: this.leader.pos.z };
  }

  onMemberDeath(u, world) {
    if (u === this.leader) this.leaderDied = world.time;
    this.morale = Math.max(0, this.morale - (u === this.leader ? 0.18 : 0.08));
  }

  setOrder(order, world) {
    this.order = order;
    this.goal = { x: order.x, z: order.z, r: order.r || 40 };
    this.flankDone = false;
    this.lastProgressT = world.time;
    this.lastGoalDist = Infinity;
    for (const m of this.members) if (m.cover && order.type !== 'defend') world.cover.release(m);
    if (this.mounted) {
      this.setState('mounted', world);
      return;
    }
    const d = dist2(this.leader.pos.x, this.leader.pos.z, order.x, order.z);
    if ((order.type === 'defend' || order.type === 'hold' || order.type === 'overwatch') && d < (order.r || 40)) {
      this.setState('holding', world);
    } else if (order.type === 'flank') {
      this.setState('flank', world);
      this.moveTo(world, order.x, order.z, 'run', true);
    } else {
      this.setState('moving', world);
      this.moveTo(world, order.x, order.z, order.type === 'defend' || order.type === 'move' ? 'run' : 'run', order.type === 'attack');
    }
  }

  setState(s, world) {
    if (this.state === s) return;
    this.state = s;
    this.stateT = world.time;
    if (s === 'holding' || s === 'contact' || s === 'regroup') this.assignAll(world, s === 'holding' ? 'hold' : 'fight');
  }

  assignAll(world, type) {
    for (const m of this.members) {
      if (!m.alive || m.mounted) continue;
      m.task = { type, t: world.time };
    }
  }

  // Path for the leader; members follow formation slots.
  moveTo(world, x, z, mode = 'run', threatAware = false) {
    const L = this.leader;
    if (!L || !L.alive) return;
    const intel = world.factions[this.faction].intel;
    const opts = threatAware ? intel.threatOpts(this.state === 'flank' ? 7 : 1.5) : { heuristicWeight: 1.4 };
    this.pathPending = true;
    this.moveGoal = { x, z };
    world.paths.request(this, L.pos.x, L.pos.z, x, z, MOVE_INF, opts, (path) => {
      this.pathPending = false;
      if (!L.alive || this.disbanded) return;
      if (path && path.length) {
        L.setPath(path, mode);
        L.task = { type: 'lead', mode };
        for (const m of this.members) if (m !== L && m.alive && !m.mounted) m.task = { type: 'follow', mode };
      }
    });
  }

  // Formation slot for a member (world position), offset ahead of the leader.
  slotFor(u) {
    const L = this.leader;
    let idx = 0;
    for (const m of this.members) {
      if (m === u) break;
      if (m !== L && m.alive && !m.mounted) idx++;
    }
    const f = FORMATIONS[this.formation];
    const off = f[(idx + 1) % f.length];
    const yaw = L.speed > 0.5 ? Math.atan2(L.vel.x, L.vel.z) : L.yaw;
    const c = Math.cos(yaw);
    const s = Math.sin(yaw);
    // Formation x is to the leader's right (= -X in model space).
    const ox = -off[0];
    const oz = off[1];
    const lead = Math.min(L.speed, 5) * 1.2;
    return { x: L.pos.x + ox * c + (oz + lead) * s, z: L.pos.z - ox * s + (oz + lead) * c };
  }

  update(dt, world) {
    this.t -= dt;
    if (this.t > 0) return;
    this.t = 0.8 + rng.next() * 0.4;
    // Prune the dead.
    const ms = this.members;
    for (let i = ms.length - 1; i >= 0; i--) if (!ms[i].alive || ms[i].removed) ms.splice(i, 1);
    if (ms.length === 0) {
      this.disband(world);
      return;
    }
    // Air assault / airborne squads get their orders once everyone is down.
    if (this.pendingOrder) {
      if (ms.some((m) => m.para || m.mounted)) return;
      const o = this.pendingOrder;
      this.pendingOrder = null;
      this.leader = ms.find((m) => m.def.role === 'leader') || ms[0];
      this.setOrder(o, world);
    }
    if (!this.leader.alive || ms.indexOf(this.leader) < 0) {
      this.leader = ms.find((m) => m.def.role === 'leader') || ms[0];
      if (this.state === 'moving' || this.state === 'flank' || this.state === 'retreat') {
        const g = this.moveGoal || this.goal;
        if (g && !this.mounted) this.moveTo(world, g.x, g.z, this.state === 'retreat' ? 'sprint' : 'run', this.state !== 'retreat');
      }
    }
    if (this.vehicle && !this.vehicle.alive) {
      this.vehicle.carrierOf = null;
      this.vehicle = null;
    }
    const intel = world.factions[this.faction].intel;
    // Contact assessment.
    let seen = 0;
    let cx = 0;
    let cz = 0;
    let supp = 0;
    let underFire = false;
    let hit = false;
    let active = 0;
    for (const m of ms) {
      if (m.mounted) continue;
      active++;
      supp += m.suppression;
      if (world.time - (m.lastShotAt || -100) < 4) underFire = true;
      if (world.time - m.lastHitTime < 4) hit = underFire = true;
      const t = m.target;
      if (t && t.alive && t.cat !== 'air') {
        seen++;
        cx += t.pos.x;
        cz += t.pos.z;
      }
    }
    this.suppression = active ? supp / active : 0;
    if (seen > 0) {
      this.contact = { x: cx / seen, z: cz / seen };
      if (world.time - this.lastContactT > 20) this.contactStart = world.time;
      this.lastContactT = world.time;
    } else if (underFire && !this.contact) {
      const src = ms.find((m) => m.threatSource && m.threatSource.alive)?.threatSource;
      if (src) {
        this.contact = { x: src.pos.x, z: src.pos.z };
        this.lastContactT = world.time;
      }
    }
    const inContact = world.time - this.lastContactT < 8;
    // Morale.
    const loss = 1 - ms.length / this.initialSize;
    let target = 1 - loss * 0.85 - this.suppression * 0.7 + (this.leader.def.role === 'leader' ? 0.1 : -0.05);
    if (this.nearFriendlyArmor(world)) target += 0.15;
    this.morale += (clamp(target, 0, 1) - this.morale) * 0.12;
    if (this.state === 'regroup') this.morale = Math.min(1, this.morale + 0.02);

    switch (this.state) {
      case 'idle':
        if (inContact) this.setState('contact', world);
        break;
      case 'mounted':
        this.updateMounted(world, inContact);
        break;
      case 'moving':
      case 'flank': {
        // Distant contact does not stop the advance; close contact or
        // effective fire (casualties, heavy suppression) does.
        if (inContact && (this.contactNear(world, 320) || hit || this.suppression > 0.32)) {
          this.setState('contact', world);
          break;
        }
        this.checkArrival(world);
        this.checkStuck(world);
        break;
      }
      case 'contact':
        this.updateContact(world, inContact, intel);
        break;
      case 'bounding':
        this.updateBounding(world, inContact);
        break;
      case 'assault':
        this.updateAssault(world, inContact);
        break;
      case 'holding':
        this.updateHolding(world, inContact);
        break;
      case 'retreat':
        if (this.leader.arrived && !this.pathPending) {
          this.setState('regroup', world);
        }
        break;
      case 'regroup':
        if (world.time - this.stateT > 25 && this.morale > 0.45) {
          this.order = null;
          this.setState('idle', world);
        } else if (inContact && world.time - this.stateT > 6) {
          this.assignAll(world, 'fight');
        }
        break;
    }
    // Broken squads fall back.
    if (this.morale < 0.28 && this.state !== 'retreat' && this.state !== 'regroup' && this.state !== 'mounted' && this.order?.type !== 'defend') {
      this.retreat(world);
    } else if (this.morale < 0.15 && this.state === 'holding' && ms.length <= 2 && inContact) {
      this.retreat(world);
    }
  }

  nearFriendlyArmor(world) {
    const L = this.leader;
    const near = world.factionGrids[this.faction].queryRadius(L.pos.x, L.pos.z, 120, _tmp);
    for (const u of near) if (u.cat === 'veh' && u.alive) return true;
    return false;
  }

  contactNear(world, r) {
    if (!this.contact) return false;
    const L = this.leader;
    return dist2(L.pos.x, L.pos.z, this.contact.x, this.contact.z) < r;
  }

  checkArrival(world) {
    const g = this.moveGoal || this.goal;
    if (!g) return;
    const L = this.leader;
    const d = dist2(L.pos.x, L.pos.z, g.x, g.z);
    if (d < this.lastGoalDist - 8) {
      this.lastGoalDist = d;
      this.lastProgressT = world.time;
    }
    const arriveR = this.goal ? Math.max(14, this.goal.r * 0.45) : 14;
    if (d < arriveR || (L.arrived && !this.pathPending && d < arriveR * 3)) {
      if (this.state === 'flank') {
        // Flank reached: now push into the objective / enemy from the side.
        this.flankDone = true;
        this.moveGoal = null;
        if (this.order && this.order.type !== 'flank') this.setState('bounding', world);
        else this.setState('bounding', world);
        return;
      }
      this.setState('holding', world);
    } else if (L.arrived && !this.pathPending) {
      this.moveTo(world, g.x, g.z, 'run', true);
    }
  }

  checkStuck(world) {
    if (world.time - this.lastProgressT > 45 && !this.pathPending) {
      this.lastProgressT = world.time;
      const g = this.moveGoal || this.goal;
      if (g) this.moveTo(world, g.x + rng.range(-25, 25), g.z + rng.range(-25, 25), 'run', true);
    }
  }

  updateMounted(world, inContact) {
    const v = this.vehicle;
    if (!v || !v.alive || !this.mounted) {
      this.setState('moving', world);
      if (this.goal) this.moveTo(world, this.goal.x, this.goal.z, 'run', true);
      return;
    }
    const g = this.goal;
    if (!g) return;
    const d = dist2(v.pos.x, v.pos.z, g.x, g.z);
    const attack = this.order && (this.order.type === 'attack' || this.order.type === 'flank');
    const dismountAt = attack ? 160 + g.r : g.r + 30;
    const hit = world.time - v.lastHitTime < 3;
    const threatened = world.projectiles.threatsTo(v) > 0;
    const stuck = v.arrived && d > dismountAt && world.time - this.stateT > 20;
    const enemyClose = this.contact && world.time - this.lastContactT < 6 && dist2(v.pos.x, v.pos.z, this.contact.x, this.contact.z) < 260;
    if (d < dismountAt || hit || threatened || v.mobilityKill || stuck || enemyClose) {
      v.stop();
      world.dismountAll(v);
      for (const m of this.members) m.task = { type: 'fight', t: world.time };
      world.emitRadio?.(this.faction, `${this.callsign}, dismounting${hit || enemyClose ? ' under fire' : ''}.`, 1);
      if (inContact || hit || enemyClose) this.setState('contact', world);
      else {
        this.setState('moving', world);
        this.moveTo(world, g.x, g.z, 'run', true);
      }
    }
  }

  onDismounted(world) {
    if (this.state === 'mounted') this.setState('contact', world);
  }

  updateContact(world, inContact, intel) {
    const elapsed = world.time - this.stateT;
    if (!inContact && elapsed > 6) {
      // Contact broken: resume the mission.
      if (this.goal && this.order && this.order.type !== 'defend' && this.order.type !== 'hold' && this.order.type !== 'overwatch') {
        this.setState(this.flankDone ? 'bounding' : 'moving', world);
        if (this.state === 'moving') this.moveTo(world, this.goal.x, this.goal.z, 'run', true);
      } else {
        this.setState('holding', world);
      }
      return;
    }
    if (elapsed < 3) return;
    const type = this.order ? this.order.type : 'hold';
    if (type === 'defend' || type === 'hold' || type === 'overwatch' || this.isTeam) {
      this.setState('holding', world);
      return;
    }
    // Attack-type orders: compare local strength.
    const c = this.contact;
    const enemy = c ? intel.enemiesNear(c.x, c.z, 140) : { strength: 0, armor: 0 };
    const ours = this.members.length * (1 - this.suppression * 0.6) + (this.nearFriendlyArmor(world) ? 6 : 0);
    if (elapsed > 8 && world.time - this.supportRequestT > 40 && enemy.strength > 3 && c) {
      this.supportRequestT = world.time;
      world.factions[this.faction].commander?.requestSupport(this, c.x, c.z, enemy);
    }
    if (enemy.armor > 0 && !this.has('at') && !this.nearFriendlyArmor(world) && elapsed > 10) {
      // Tanks and no AT weapons: hold in cover and wait for support.
      return;
    }
    if (ours > enemy.strength * 0.7 && this.suppression < 0.55) {
      this.setState('bounding', world);
    } else if (!this.flankDone && elapsed > 18 && this.members.length >= 4 && c && this.order) {
      this.startFlank(world, c);
    } else if (elapsed > 40 && this.suppression < 0.45) {
      this.setState('bounding', world);
    }
  }

  startFlank(world, c) {
    const L = this.leader;
    // Perpendicular to the line squad -> enemy, toward the less threatened side.
    const dx = c.x - L.pos.x;
    const dz = c.z - L.pos.z;
    const d = Math.hypot(dx, dz) || 1;
    const px = -dz / d;
    const pz = dx / d;
    const intel = world.factions[this.faction].intel;
    const off = clamp(d * 0.9, 120, 230);
    const ax = c.x + px * off - (dx / d) * 40;
    const az = c.z + pz * off - (dz / d) * 40;
    const bx = c.x - px * off - (dx / d) * 40;
    const bz = c.z - pz * off - (dz / d) * 40;
    const ta = intel.threatAt(ax, az) + (world.terrain.inBounds(ax, az, 80) ? 0 : 99);
    const tb = intel.threatAt(bx, bz) + (world.terrain.inBounds(bx, bz, 80) ? 0 : 99);
    const [fx, fz] = ta <= tb ? [ax, az] : [bx, bz];
    this.flankDone = false;
    this.moveGoal = { x: fx, z: fz };
    this.setState('flank', world);
    this.moveTo(world, fx, fz, 'run', true);
    world.emitRadio?.(this.faction, `${this.callsign}: pinned down, moving to flank ${ta <= tb ? 'left' : 'right'}.`, 1);
  }

  // Bounding overwatch: one team moves to cover nearer the goal while the
  // other suppresses; swap when the movers arrive.
  updateBounding(world, inContact) {
    const g = this.goal;
    if (!g) {
      this.setState('holding', world);
      return;
    }
    const target = this.flankDone && this.contact && world.time - this.lastContactT < 15 ? this.contact : g;
    const L = this.leader;
    const dGoal = dist2(L.pos.x, L.pos.z, g.x, g.z);
    if (dGoal < g.r * 0.6) {
      this.setState('holding', world);
      return;
    }
    // Close and the enemy is weakened: final assault.
    if (this.contact && dist2(L.pos.x, L.pos.z, this.contact.x, this.contact.z) < 60 && this.suppression < 0.35) {
      this.setState('assault', world);
      return;
    }
    if (!inContact && world.time - this.lastContactT > 12) {
      this.setState('moving', world);
      this.moveTo(world, g.x, g.z, 'run', true);
      return;
    }
    // Far from the enemy the bounds are long; close in they shorten.
    const dThreat = this.contact ? dist2(L.pos.x, L.pos.z, this.contact.x, this.contact.z) : dGoal;
    const stepMin = dThreat > 260 ? 55 : dThreat > 140 ? 35 : 22;
    const stepMax = dThreat > 260 ? 85 : dThreat > 140 ? 55 : 38;
    const movers = this.members.filter((m, i) => m.alive && !m.mounted && i % 2 === this.team);
    const done = movers.every((m) => !m.task || m.task.type !== 'bound' || m.arrived);
    if (world.time - this.boundT > 16 || (done && world.time - this.boundT > 1.5)) {
      this.team = 1 - this.team;
      this.boundT = world.time;
      const threat = this.contact || target;
      for (let i = 0; i < this.members.length; i++) {
        const m = this.members[i];
        if (!m.alive || m.mounted) continue;
        if (i % 2 === this.team) {
          // Next bound: a cover point 25-50 m closer to the target.
          const dx = target.x - m.pos.x;
          const dz = target.z - m.pos.z;
          const d = Math.hypot(dx, dz) || 1;
          const step = Math.min(d, rng.range(stepMin, stepMax));
          const gx = m.pos.x + (dx / d) * step;
          const gz = m.pos.z + (dz / d) * step;
          const cp = world.cover.find(m, threat.x, threat.z, 30, { gx, gz, goalRadius: 30, goalWeight: 1.4 });
          if (cp) {
            world.cover.claim(cp, m);
            m.task = { type: 'bound', x: cp.x, z: cp.z, cover: cp, t: world.time };
          } else {
            m.task = { type: 'bound', x: gx + rng.range(-5, 5), z: gz + rng.range(-5, 5), cover: null, t: world.time };
          }
        } else {
          m.task = { type: 'fight', t: world.time, stay: true };
        }
      }
    }
  }

  updateAssault(world, inContact) {
    const c = this.contact;
    if (!c || (!inContact && world.time - this.lastContactT > 10)) {
      if (this.goal) {
        this.setState('moving', world);
        this.moveTo(world, this.goal.x, this.goal.z, 'run', false);
      } else this.setState('holding', world);
      return;
    }
    if (world.time - this.stateT > 25 || this.suppression > 0.6) {
      this.setState('bounding', world);
      return;
    }
    for (const m of this.members) {
      if (!m.alive || m.mounted) continue;
      if (!m.task || m.task.type !== 'assault' || world.time - m.task.t > 6) {
        m.task = { type: 'assault', x: c.x + rng.range(-12, 12), z: c.z + rng.range(-12, 12), t: world.time };
      }
    }
  }

  updateHolding(world, inContact) {
    // (Re)assign defensive positions occasionally.
    if (world.time - (this.holdAssignT || -100) < 12) return;
    this.holdAssignT = world.time;
    const g = this.goal || { x: this.leader.pos.x, z: this.leader.pos.z, r: 30 };
    const intel = world.factions[this.faction].intel;
    let threat = this.contact && world.time - this.lastContactT < 30 ? this.contact : null;
    if (!threat) {
      const nc = intel.nearestContact(g.x, g.z, (u) => u.cat !== 'air', 60);
      if (nc) threat = { x: nc.x, z: nc.z };
    }
    if (!threat) {
      // Face the enemy's side of the map.
      const ed = world.map.deploy[1 - this.faction];
      threat = { x: ed.x, z: ed.z };
    }
    const overwatch = this.order && this.order.type === 'overwatch';
    for (const m of this.members) {
      if (!m.alive || m.mounted) continue;
      if (m.task && m.task.type === 'hold' && m.cover && m.cover.active && world.time - m.task.t < 40) {
        // Still valid if it covers the current threat direction.
        const p = m.cover;
        const tdx = threat.x - p.x;
        const tdz = threat.z - p.z;
        const tl = Math.hypot(tdx, tdz) || 1;
        if (p.nx === 0 && p.nz === 0) continue;
        if ((p.nx * tdx + p.nz * tdz) / tl > 0.3) continue;
      }
      const role = m.def.role;
      const allowRoof = !overwatch && (role === 'mg' || role === 'sniper' || role === 'atgm' || role === 'at' || (role === 'rifleman' && rng.chance(0.3)));
      const radius = overwatch ? 30 : Math.max(35, g.r + 15);
      const cp = world.cover.find(m, threat.x, threat.z, radius + dist2(m.pos.x, m.pos.z, g.x, g.z) * 0.3, {
        gx: g.x,
        gz: g.z,
        goalRadius: g.r,
        goalWeight: 1.0,
        allowRoof,
        roofBonus: role === 'sniper' || role === 'mg' ? 0.9 : 0.35,
      });
      if (cp) {
        world.cover.claim(cp, m);
        m.task = { type: 'hold', x: cp.x, z: cp.z, cover: cp, t: world.time, threat };
      } else {
        m.task = { type: 'hold', x: g.x + rng.range(-g.r * 0.5, g.r * 0.5), z: g.z + rng.range(-g.r * 0.5, g.r * 0.5), cover: null, t: world.time, threat };
      }
    }
    void inContact;
  }

  retreat(world) {
    const L = this.leader;
    const home = world.map.deploy[this.faction];
    const dx = home.x - L.pos.x;
    const dz = home.z - L.pos.z;
    const d = Math.hypot(dx, dz) || 1;
    const back = Math.min(d, 260);
    // Prefer a friendly-held objective behind us.
    let rx = L.pos.x + (dx / d) * back;
    let rz = L.pos.z + (dz / d) * back;
    for (const o of world.objectives) {
      if (o.owner !== this.faction) continue;
      const od = dist2(L.pos.x, L.pos.z, o.x, o.z);
      if (od < 350 && dist2(o.x, o.z, home.x, home.z) < d) {
        rx = o.x;
        rz = o.z;
        break;
      }
    }
    this.rally = { x: rx, z: rz };
    this.moveGoal = this.rally;
    for (const m of this.members) if (m.cover) world.cover.release(m);
    this.setState('retreat', world);
    this.moveTo(world, rx, rz, 'sprint', true);
    world.emitRadio?.(this.faction, `${this.callsign}: taking heavy casualties, falling back!`, 2);
  }

  disband(world) {
    this.disbanded = true;
    if (this.vehicle) this.vehicle.carrierOf = null;
    world.paths.cancel(this);
  }
}

const _tmp = [];

// ------------------------------------------------------------- vehicles

export class VehicleGroup {
  constructor(world, faction, kind, vehicles, opts = {}) {
    this.id = squadIds++;
    this.world = world;
    this.faction = faction;
    this.kind = kind; // 'armor' | 'recon' | 'aa' | 'artillery' | 'support'
    this.members = vehicles;
    this.initialSize = vehicles.length;
    this.callsign = opts.callsign || nextCallsign(faction);
    vehicles.forEach((v, i) => {
      v.group = this;
      v.squad = null;
      v.callsign = `${this.callsign}${faction === 0 ? `/${i + 1}` : `${i + 1}`}`;
    });
    this.leader = vehicles[0];
    this.order = null;
    this.state = 'idle';
    this.stateT = 0;
    this.goal = null;
    this.t = rng.range(0, 1);
    this.disbanded = false;
    this.contact = null;
    this.lastContactT = -100;
    this.pathPending = false;
    world.factions[faction].squads.push(this);
  }

  get alive() {
    return this.members.length;
  }

  get center() {
    let x = 0;
    let z = 0;
    for (const m of this.members) {
      x += m.pos.x;
      z += m.pos.z;
    }
    return { x: x / this.members.length, z: z / this.members.length };
  }

  onMemberDeath() {}

  setOrder(order, world) {
    this.order = order;
    this.goal = { x: order.x, z: order.z, r: order.r || 60 };
    this.state = 'moving';
    this.stateT = world.time;
    this.route(world);
  }

  route(world) {
    const L = this.leader;
    if (!L || !L.alive || !this.goal) return;
    const cls = L.spec.kind === 'wheeled' ? MOVE_WHEEL : MOVE_TRACK;
    const intel = world.factions[this.faction].intel;
    // Approach the objective edge, not its centre (stay out of AT ambush range).
    let gx = this.goal.x;
    let gz = this.goal.z;
    if (this.order && this.order.type === 'attack' && this.kind === 'armor') {
      const dx = gx - L.pos.x;
      const dz = gz - L.pos.z;
      const d = Math.hypot(dx, dz) || 1;
      const stand = Math.min(d, this.goal.r + 60);
      gx -= (dx / d) * stand * 0.6;
      gz -= (dz / d) * stand * 0.6;
    }
    this.pathPending = true;
    world.paths.request(this, L.pos.x, L.pos.z, gx, gz, cls, intel.threatOpts(0.6), (path) => {
      this.pathPending = false;
      if (!L.alive || this.disbanded) return;
      if (path) {
        L.setPath(path, this.order?.speed || 0.85);
        this.leaderPath = path;
      }
    });
  }

  // Slot in a line abreast behind/beside the leader.
  slotFor(v) {
    const L = this.leader;
    const i = this.members.indexOf(v);
    const k = i <= 0 ? 0 : Math.ceil(i / 2) * (i % 2 ? 1 : -1);
    const c = Math.cos(L.yaw);
    const s = Math.sin(L.yaw);
    const spacing = this.kind === 'artillery' ? 25 : 32;
    const ox = -k * spacing;
    const oz = -Math.abs(k) * 10;
    return { x: L.pos.x + ox * c + oz * s, z: L.pos.z - ox * s + oz * c };
  }

  update(dt, world) {
    this.t -= dt;
    if (this.t > 0) return;
    this.t = 1 + rng.next() * 0.4;
    const ms = this.members;
    for (let i = ms.length - 1; i >= 0; i--) if (!ms[i].alive) ms.splice(i, 1);
    if (!ms.length) {
      this.disbanded = true;
      world.paths.cancel(this);
      return;
    }
    if (!this.leader.alive || ms.indexOf(this.leader) < 0) {
      this.leader = ms.find((v) => v.canMove) || ms[0];
      if (this.goal) this.route(world);
    }
    let seen = 0;
    let cx = 0;
    let cz = 0;
    for (const v of ms) {
      if (v.target && v.target.alive && v.target.cat !== 'air') {
        seen++;
        cx += v.target.pos.x;
        cz += v.target.pos.z;
      }
    }
    if (seen) {
      this.contact = { x: cx / seen, z: cz / seen };
      this.lastContactT = world.time;
    }
    const L = this.leader;
    if (this.state === 'moving' && this.goal) {
      const d = dist2(L.pos.x, L.pos.z, this.goal.x, this.goal.z);
      if (L.arrived && !this.pathPending) {
        if (d < this.goal.r * 2.2 + 80) {
          this.state = 'holding';
          this.stateT = world.time;
        } else this.route(world);
      }
      if (L.stuckT > 8) {
        L.stuckT = 0;
        this.route(world);
      }
    }
  }
}
