// Aircraft brains: attack helicopters, transport helicopters (air assault),
// strike jets (bombs, missiles, strafing), transport planes (paradrops),
// reconnaissance UAVs and FPV kamikaze drones.

import { Vector3 } from 'three';
import { rng } from '../core/rng.js';
import { clamp, dist2, angleDiff, GRAVITY } from '../core/math.js';
import { scan, pickTarget, aimAt } from './perception.js';

const _o = new Vector3();
const _d = new Vector3();
const THINK_DT = 0.1; // jets think at 10 Hz; weapon pulls advance by this much

function exitPoint(world, faction) {
  const d = world.map.deploy[faction];
  return { x: d.airEntry.x, z: d.airEntry.z };
}

function countermeasures(a, world) {
  if (a.flares > 0 && world.projectiles.threatsTo(a) > 0 && world.time - a.lastFlare > 1.3) {
    world.popFlares(a);
    return true;
  }
  return false;
}

// Front line estimate: midpoint between both sides' nearest contested objective.
export function frontCenter(world, faction) {
  let best = null;
  let bd = Infinity;
  const home = world.map.deploy[faction];
  for (const o of world.objectives) {
    if (o.owner === faction && !o.contested) continue;
    const d = dist2(o.x, o.z, home.x, home.z);
    if (d < bd) {
      bd = d;
      best = o;
    }
  }
  if (!best) best = world.objectives[0];
  return { x: best.x, z: best.z };
}

// ------------------------------------------------------------ attack helicopter

export class AttackHeliBrain {
  constructor(a) {
    this.a = a;
    this.state = 'transit';
    this.area = null;
    this.scanT = 0;
    this.repoT = 0;
    this.side = rng.range(-0.6, 0.6);
    this.losOK = false;
    this.patrolA = rng.range(0, Math.PI * 2);
  }

  thinkInterval() {
    return 0.25;
  }

  setArea(x, z) {
    this.area = { x, z };
  }

  think(world) {
    const a = this.a;
    const t = world.time;
    if (t > this.scanT) {
      this.scanT = t + 0.5;
      scan(a, world, 6);
      pickTarget(a, world);
    }
    if (a.target) this.losOK = world.unitLOS(a, a.target, 0.8) > 0;
    if (countermeasures(a, world)) {
      // Break: dash sideways and drop low.
      this.side = -this.side + rng.range(-0.3, 0.3);
      this.repoT = t + 6;
    }
    const empty = a.weapons.every((w) => w.empty);
    if (this.state !== 'rtb' && (a.hp < a.maxHp * 0.3 || empty)) {
      this.state = 'rtb';
      world.emitRadio(a.faction, `${a.callsign}: ${empty ? 'Winchester, returning to rearm' : 'taking damage, breaking off'}.`, 1);
    }
    const ground = world.terrain.heightAt(a.pos.x, a.pos.z);
    if (this.state === 'rtb') {
      const e = exitPoint(world, a.faction);
      a.goal.set(e.x, ground + 80, e.z);
      a.goalSpeed = a.def.speed.cruise;
      a.faceTarget = null;
      if (dist2(a.pos.x, a.pos.z, e.x, e.z) < 150) a.removed = true;
      return;
    }
    const area = this.area || frontCenter(world, a.faction);
    const tg = a.target;
    if (t > this.repoT) {
      this.repoT = t + rng.range(16, 28);
      this.side = rng.range(-0.8, 0.8);
      this.alt = rng.range(35, 70);
    }
    const alt = this.alt || 50;
    if (tg && tg.alive) {
      const w = a.weapon;
      const sd = w && w.def.kind === 'missile' ? 1500 : w && w.def.kind === 'rocket' ? 1050 : 750;
      // Stand off on the side facing our own lines.
      const home = world.map.deploy[a.faction];
      let dx = home.x - tg.pos.x;
      let dz = home.z - tg.pos.z;
      const dl = Math.hypot(dx, dz) || 1;
      dx /= dl;
      dz /= dl;
      const c = Math.cos(this.side);
      const s = Math.sin(this.side);
      const rx = dx * c - dz * s;
      const rz = dx * s + dz * c;
      const gx = clamp(tg.pos.x + rx * sd, -1200, 1200);
      const gz = clamp(tg.pos.z + rz * sd, -1200, 1200);
      a.goal.set(gx, world.terrain.heightAt(gx, gz) + alt, gz);
      a.goalSpeed = dist2(a.pos.x, a.pos.z, gx, gz) > 200 ? a.def.speed.cruise : a.def.speed.attack;
      a.faceTarget = tg.pos;
      this.state = 'attack';
    } else {
      // Patrol a racetrack over our side of the area.
      this.patrolA += 0.04;
      const home = world.map.deploy[a.faction];
      const dx = home.x - area.x;
      const dz = home.z - area.z;
      const dl = Math.hypot(dx, dz) || 1;
      const cx = area.x + (dx / dl) * 650;
      const cz = area.z + (dz / dl) * 650;
      const gx = cx + Math.cos(this.patrolA) * 350;
      const gz = cz + Math.sin(this.patrolA) * 200;
      a.goal.set(gx, world.terrain.heightAt(gx, gz) + 70, gz);
      a.goalSpeed = a.def.speed.attack + 10;
      a.faceTarget = null;
      this.state = 'transit';
    }
  }

  update(dt, world) {
    const a = this.a;
    const tg = a.target;
    const w = a.weapon;
    if (!tg || !w || !tg.alive || !this.losOK) {
      if (w) w.release();
      return;
    }
    const yawTo = Math.atan2(tg.pos.x - a.pos.x, tg.pos.z - a.pos.z);
    const err = Math.abs(angleDiff(a.yaw, yawTo));
    const d = dist2(a.pos.x, a.pos.z, tg.pos.x, tg.pos.z);
    const kind = w.def.kind;
    const needAlign = kind === 'rocket' ? 0.07 : kind === 'missile' ? 0.5 : 1.6;
    if (err > needAlign || d > w.def.range || d < (w.def.minRange || 0)) {
      w.aimT = 0;
      return;
    }
    w.aimT += dt;
    if (w.aimT < w.def.aimTime || !w.ready) return;
    const n = w.pull(dt);
    for (let k = 0; k < n; k++) {
      a.mountPoint(w.mount, _o);
      if (aimAt(a, w, tg, _o, _d) < 0) return;
      world.fireRounds(a, w, _o, _d, 1, kind === 'missile' ? 0 : w.def.spread, tg, dt / Math.max(1, n), { guided: kind === 'missile' });
    }
  }
}

// ------------------------------------------------------------ transport helicopter

export class TransportHeliBrain {
  constructor(a) {
    this.a = a;
    this.state = 'inbound';
    this.mission = null;
    this.scanT = 0;
    this.stateT = 0;
    this.losOK = false;
  }

  thinkInterval() {
    return 0.25;
  }

  setMission(lz) {
    this.mission = { lz };
    this.state = 'inbound';
  }

  think(world) {
    const a = this.a;
    const t = world.time;
    if (t > this.scanT) {
      this.scanT = t + 0.6;
      scan(a, world, 4);
      pickTarget(a, world);
    }
    if (a.target) this.losOK = world.unitLOS(a, a.target, 0.8) > 0;
    countermeasures(a, world);
    const m = this.mission;
    if (!m) {
      this.state = 'outbound';
    }
    const ground = world.terrain.heightAt(a.pos.x, a.pos.z);
    switch (this.state) {
      case 'inbound': {
        const lz = m.lz;
        const home = world.map.deploy[a.faction];
        const dx = home.x - lz.x;
        const dz = home.z - lz.z;
        const dl = Math.hypot(dx, dz) || 1;
        const ax = lz.x + (dx / dl) * 140;
        const az = lz.z + (dz / dl) * 140;
        a.goal.set(ax, world.terrain.heightAt(ax, az) + 55, az);
        a.goalSpeed = a.def.speed.cruise;
        if (dist2(a.pos.x, a.pos.z, ax, az) < 60) this.setState('approach', t);
        if (a.hp < a.maxHp * 0.35) this.setState('outbound', t);
        break;
      }
      case 'approach': {
        const lz = m.lz;
        a.goal.set(lz.x, world.terrain.heightAt(lz.x, lz.z) + 18, lz.z);
        a.goalSpeed = 16;
        if (dist2(a.pos.x, a.pos.z, lz.x, lz.z) < 10) this.setState('landing', t);
        break;
      }
      case 'landing': {
        const lz = m.lz;
        a.landing = true;
        a.goal.set(lz.x, world.terrain.heightAt(lz.x, lz.z) + a.spec.skidHeight, lz.z);
        a.goalSpeed = 4;
        if (a.pos.y - ground < a.spec.skidHeight + 1.2 || t - this.stateT > 14) {
          a.landed = true;
          this.setState('unload', t);
          const sq = a.passengers[0]?.squad;
          world.dismountAll(a);
          if (sq) world.emitRadio(a.faction, `${sq.callsign}: on the ground, moving out.`, 1);
        }
        break;
      }
      case 'unload':
        if (t - this.stateT > 3.5) {
          a.landed = false;
          a.landing = false;
          this.setState('takeoff', t);
        }
        break;
      case 'takeoff':
        a.goal.set(a.pos.x, ground + 70, a.pos.z);
        a.goalSpeed = 10;
        if (a.pos.y - ground > 40) this.setState('outbound', t);
        break;
      case 'outbound': {
        a.landing = false;
        a.landed = false;
        const e = exitPoint(world, a.faction);
        a.goal.set(e.x, ground + 70, e.z);
        a.goalSpeed = a.def.speed.cruise;
        if (dist2(a.pos.x, a.pos.z, e.x, e.z) < 150) a.removed = true;
        break;
      }
    }
    a.faceTarget = null;
  }

  setState(s, t) {
    this.state = s;
    this.stateT = t;
  }

  update(dt, world) {
    // Door gunners fire at whatever they can see on either side.
    const a = this.a;
    const tg = a.target;
    if (!tg || !tg.alive || !this.losOK || a.landed) return;
    for (const w of a.weapons) {
      if (!w.ready) continue;
      w.aimT += dt;
      if (w.aimT < w.def.aimTime) continue;
      a.mountPoint(w.mount, _o);
      // Only the gunner on the target's side can engage.
      const rx = Math.cos(a.yaw);
      const rz = -Math.sin(a.yaw);
      const side = (tg.pos.x - a.pos.x) * rx + (tg.pos.z - a.pos.z) * rz;
      if ((w.mount === 'door0') !== side > 0) continue;
      const n = w.pull(dt);
      if (n <= 0) continue;
      if (aimAt(a, w, tg, _o, _d) < 0) continue;
      world.fireRounds(a, w, _o, _d, n, w.def.spread * 1.5, tg, dt);
    }
  }
}

// ------------------------------------------------------------ strike jet

export class JetBrain {
  constructor(a) {
    this.a = a;
    this.state = 'ingress';
    this.mission = null;
    this.passes = 2;
    this.stateT = 0;
    this.released = false;
    this.ip = null;
  }

  thinkInterval() {
    return THINK_DT;
  }

  setMission(m) {
    this.mission = m;
    this.passes = m.passes ?? 2;
    this.state = 'ingress';
    this.computeIP();
  }

  get targetPoint() {
    const m = this.mission;
    if (!m) return null;
    if (m.unit && m.unit.alive && !m.unit.dying) {
      m.x = m.unit.pos.x;
      m.z = m.unit.pos.z;
    }
    return m;
  }

  computeIP() {
    const m = this.mission;
    const a = this.a;
    const dx = a.pos.x - m.x;
    const dz = a.pos.z - m.z;
    const d = Math.hypot(dx, dz) || 1;
    this.ip = { x: m.x + (dx / d) * 3200 + rng.range(-500, 500), z: m.z + (dz / d) * 3200 + rng.range(-500, 500) };
  }

  setState(s, t) {
    this.state = s;
    this.stateT = t;
  }

  think(world) {
    const a = this.a;
    const t = world.time;
    if (countermeasures(a, world)) a.goal.y += 150;
    const m = this.targetPoint;
    if (!m) {
      this.state = 'egress';
    }
    const ty = m ? world.terrain.heightAt(m.x, m.z) : 0;
    a.attackRun = false;
    switch (this.state) {
      case 'ingress': {
        a.goal.set(this.ip.x, Math.max(ty + 450, 300), this.ip.z);
        a.goalSpeed = a.def.speed.cruise;
        if (dist2(a.pos.x, a.pos.z, this.ip.x, this.ip.z) < 700) this.setState('run', t);
        break;
      }
      case 'run': {
        const w = this.chooseWeapon(m);
        const d = dist2(a.pos.x, a.pos.z, m.x, m.z);
        a.goalSpeed = a.def.speed.attack;
        a.attackRun = true;
        if (!w) {
          this.setState('egress', t);
          break;
        }
        if (w.def.kind === 'bomb') {
          // Level run at ~300 m, release on the continuously computed impact point.
          a.goal.set(m.x, ty + 300, m.z);
          const h = a.pos.y - ty;
          const vy = a.vel.y;
          const tf = (vy + Math.sqrt(Math.max(0, vy * vy + 2 * GRAVITY * h))) / GRAVITY;
          const ix = a.pos.x + a.vel.x * tf;
          const iz = a.pos.z + a.vel.z * tf;
          const err = dist2(ix, iz, m.x, m.z);
          if ((err < 22 || this.released) && w.ready) {
            const n = w.pull(THINK_DT);
            for (let k = 0; k < n; k++) {
              a.mountPoint('pylon', _o);
              _d.copy(a.vel).normalize();
              world.fireRounds(a, w, _o, _d, 1, 0.002, null, 0, { speed: a.speed, targetPoint: { x: ix, y: ty, z: iz }, whistleAt: Math.max(0.5, tf - 3) });
            }
            this.released = true;
            if (w.burstLeft <= 0) this.finishPass(world, t);
          } else if (d < 250 && !this.released) this.finishPass(world, t);
        } else if (w.def.kind === 'missile') {
          a.goal.set(m.x, ty + 450, m.z);
          const yawTo = Math.atan2(m.x - a.pos.x, m.z - a.pos.z);
          if (d < 5200 && Math.abs(angleDiff(a.yaw, yawTo)) < 0.35 && w.ready && m.unit && m.unit.alive) {
            w.pull(0.016);
            a.mountPoint('pylon', _o);
            _d.set(m.x - a.pos.x, ty - a.pos.y, m.z - a.pos.z).normalize();
            world.fireRounds(a, w, _o, _d, 1, 0, m.unit, 0, { guided: true, speed: a.speed + 60 });
            this.finishPass(world, t);
          } else if (d < 1200) this.finishPass(world, t);
        } else {
          // Strafing dive with the cannon.
          a.goal.set(m.x, ty + 2, m.z);
          if (d < 1500 && d > 380) {
            const tgtUnit = m.unit && m.unit.alive ? m.unit : null;
            a.mountPoint('gun', _o);
            _d.set(m.x - a.pos.x, ty + 1 - a.pos.y, m.z - a.pos.z).normalize();
            const fwd = a.forward3(new Vector3());
            if (fwd.dot(_d) > 0.985 && w.ready) {
              const n = w.pull(THINK_DT);
              if (n > 0) world.fireRounds(a, w, _o, fwd, n, w.def.spread, tgtUnit, THINK_DT);
            }
          }
          if (d < 380 || a.pos.y - ty < 90) this.finishPass(world, t);
        }
        break;
      }
      case 'pull': {
        const fx = Math.sin(a.yaw);
        const fz = Math.cos(a.yaw);
        a.goal.set(a.pos.x + fx * 2000, Math.max(ty + 650, 500), a.pos.z + fz * 2000);
        a.goalSpeed = a.def.speed.max;
        if (t - this.stateT > 7) {
          if (this.passes > 0 && this.chooseWeapon(m) && a.hp > a.maxHp * 0.4) {
            this.computeIP();
            this.setState('ingress', t);
          } else this.setState('egress', t);
        }
        break;
      }
      case 'egress': {
        const e = exitPoint(world, a.faction);
        a.goal.set(e.x, 700, e.z * 1.6);
        a.goalSpeed = a.def.speed.max;
        if (Math.abs(a.pos.x) > 2300 || Math.abs(a.pos.z) > 2300) a.removed = true;
        break;
      }
    }
  }

  finishPass(world, t) {
    this.passes--;
    this.released = false;
    this.setState('pull', t);
  }

  chooseWeapon(m) {
    const a = this.a;
    const byId = (id) => a.weapons.find((w) => w.def.id === id && !w.empty);
    const armor = m && m.unit && m.unit.tclass === 'armor';
    if (armor) return byId('agm') || byId('bomb') || byId('jet_cannon');
    return byId('bomb') || byId('jet_cannon') || byId('agm');
  }

  update() {}
}

// ------------------------------------------------------------ transport plane

export class PlaneBrain {
  constructor(a) {
    this.a = a;
    this.mission = null;
    this.dropT = 0;
    this.door = 0;
  }

  thinkInterval() {
    return 0.1;
  }

  setMission(dz, exit) {
    this.mission = { dz, exit };
  }

  think(world) {
    const a = this.a;
    const m = this.mission;
    countermeasures(a, world);
    if (!m) return;
    const dzY = world.terrain.heightAt(m.dz.x, m.dz.z);
    a.goal.set(m.exit.x, dzY + 330, m.exit.z);
    a.goalSpeed = a.def.speed.cruise;
    // Distance along track to the drop zone.
    const fx = Math.sin(a.yaw);
    const fz = Math.cos(a.yaw);
    const along = (m.dz.x - a.pos.x) * fx + (m.dz.z - a.pos.z) * fz;
    if (a.passengers.length && along < 260 && along > -180 && world.time > this.dropT) {
      this.dropT = world.time + 0.42;
      this.dropOne(world, m.dz);
    }
    if (Math.abs(a.pos.x) > 2400 || Math.abs(a.pos.z) > 2400) a.removed = true;
  }

  dropOne(world, dz) {
    const a = this.a;
    const s = a.passengers.shift();
    if (!s) return;
    if (!s.alive) return;
    const door = a.spec.jumpDoors[this.door++ % 2];
    _o.set(door[0], door[1], door[2]).applyQuaternion(a.quat).add(a.pos);
    s.mounted = null;
    s.hidden = false;
    s.pos.copy(_o);
    s.vel.set(a.vel.x * 0.8, -2, a.vel.z * 0.8);
    s.yaw = a.yaw;
    s.para = { phase: 'fall', t: 0, deployAt: 0.9, tx: dz.x + rng.range(-70, 70), tz: dz.z + rng.range(-70, 70) };
    world.emit({ t: 'para_jump', unit: s });
  }

  update() {}
}

// ------------------------------------------------------------ recon UAV

export class UavBrain {
  constructor(a) {
    this.a = a;
    this.theta = rng.range(0, Math.PI * 2);
    this.area = null;
    this.scanT = 0;
  }

  thinkInterval() {
    return 0.5;
  }

  think(world) {
    const a = this.a;
    const t = world.time;
    if (t > this.scanT) {
      this.scanT = t + 1;
      scan(a, world, 8);
    }
    const area = this.area || frontCenter(world, a.faction);
    this.theta += 0.035;
    const gx = area.x + Math.cos(this.theta) * 420;
    const gz = area.z + Math.sin(this.theta) * 420;
    a.goal.set(gx, world.terrain.heightAt(gx, gz) + 430, gz);
    a.goalSpeed = a.def.speed.cruise;
  }

  update() {}
}

// ------------------------------------------------------------ FPV drone

export class DroneBrain {
  constructor(a) {
    this.a = a;
    this.phase = 'cruise';
  }

  thinkInterval() {
    return 0.12;
  }

  setTarget(t) {
    this.a.diveTarget = t;
  }

  retarget(world) {
    const a = this.a;
    const intel = world.factions[a.faction].intel;
    const c =
      intel.nearestContact(a.pos.x, a.pos.z, (u) => u.cat === 'veh' && !u.wreck, 20) ||
      intel.nearestContact(a.pos.x, a.pos.z, (u) => u.cat === 'inf', 15);
    if (c && dist2(a.pos.x, a.pos.z, c.x, c.z) < 800) {
      a.diveTarget = c.unit;
      this.phase = 'cruise';
      return true;
    }
    return false;
  }

  think(world) {
    const a = this.a;
    let tg = a.diveTarget;
    if (!tg || !tg.alive || tg.dying || tg.hidden) {
      if (!this.retarget(world)) {
        // Nothing to hit: ditch where it is.
        a.landing = true;
        a.goal.set(a.pos.x, world.terrain.heightAt(a.pos.x, a.pos.z) - 2, a.pos.z);
        a.goalSpeed = 10;
        return;
      }
      tg = a.diveTarget;
    }
    const tx = tg.pos.x;
    const tz = tg.pos.z;
    const ty = tg.cat === 'veh' ? tg.pos.y + tg.spec.height : tg.pos.y + 0.9;
    const hd = dist2(a.pos.x, a.pos.z, tx, tz);
    if (this.phase === 'cruise' && hd < 150) {
      this.phase = 'dive';
      world.emit({ t: 'drone_dive', unit: a });
    }
    if (this.phase === 'cruise') {
      const ground = Math.max(world.terrain.heightAt(a.pos.x, a.pos.z), world.terrain.heightAt(tx, tz));
      a.goal.set(tx, ground + 32, tz);
      a.goalSpeed = a.def.speed.cruise;
      a.landing = false;
    } else {
      const d3 = Math.hypot(hd, ty - a.pos.y);
      const tof = d3 / 40;
      a.landing = true;
      a.goal.set(tx + tg.vel.x * tof, ty, tz + tg.vel.z * tof);
      a.goalSpeed = a.def.speed.attack;
      const hitR = tg.cat === 'veh' ? tg.radius * 0.6 + 1.2 : 1.5;
      if (d3 < hitR) world.droneImpact(a, true);
    }
  }

  update() {}
}
