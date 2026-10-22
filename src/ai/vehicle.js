// Ground vehicle brains: combat vehicles (tanks, IFVs, APCs, scouts, SPAAG)
// and artillery (self-propelled howitzers, rocket launchers).

import { Vector3 } from 'three';
import { rng } from '../core/rng.js';
import { dist2, GRAVITY } from '../core/math.js';
import { MOVE_TRACK, MOVE_WHEEL } from '../world/nav.js';
import { scan, pickTarget, vehicleAimPoint, vehicleDispersion, aimAt } from './perception.js';

const _o = new Vector3();
const _d = new Vector3();

export class VehicleBrain {
  constructor(v) {
    this.v = v;
    this.scanT = rng.range(0, 0.6);
    this.aimPt = { x: 0, y: 0, z: 0, loft: 0 };
    this.losOK = false;
    this.haltUntil = 0;
    this.evadeUntil = 0;
    this.repathT = 0;
    this.secTarget = null;
    this.secLos = false;
    this.followT = 0;
    this.lastSlot = null;
    this.supportT = 0;
  }

  thinkInterval() {
    return 0.3 + rng.next() * 0.15;
  }

  get cls() {
    return this.v.spec.kind === 'wheeled' ? MOVE_WHEEL : MOVE_TRACK;
  }

  think(world) {
    const v = this.v;
    const t = world.time;
    if (t >= this.scanT) {
      scan(v, world, v.def.radar ? 7 : 5);
      this.scanT = t + 0.55 + rng.next() * 0.3;
      if (!v.firepowerKill) {
        pickTarget(v, world, { only: (w) => w.mount !== 'roof' && w.mount !== 'coax' });
        this.pickSecondary(world);
      }
    }
    if (v.target) {
      this.losOK = world.unitLOS(v, v.target, 1) > 0;
      if (!this.losOK && t - (this.reselT || 0) > 3) {
        this.reselT = t;
        pickTarget(v, world, { only: (w) => w.mount !== 'roof' && w.mount !== 'coax' });
      }
    }
    if (this.secTarget) this.secLos = this.secTarget.alive && world.unitLOS(v, this.secTarget, 1.2) > 0;
    this.reactToThreats(world);
    if (v.firepowerKill && !v.mobilityKill) {
      // Can't fight: withdraw.
      if (!v.path) this.driveTo(world, world.map.deploy[v.faction].x + rng.range(-100, 100), world.map.deploy[v.faction].z, 1);
      return;
    }
    this.move(world);
  }

  pickSecondary(world) {
    const v = this.v;
    const sec = v.weapons.find((w) => w.mount === 'roof' || w.mount === 'coax');
    if (!sec) {
      this.secTarget = null;
      return;
    }
    let best = null;
    let bd = sec.def.range;
    for (const c of v.visible || []) {
      if (!c.alive || (c.cat !== 'inf' && c.aclass !== 'drone')) continue;
      const d = dist2(v.pos.x, v.pos.z, c.pos.x, c.pos.z);
      if (d < bd) {
        bd = d;
        best = c;
      }
    }
    this.secTarget = best;
  }

  reactToThreats(world) {
    const v = this.v;
    const t = world.time;
    const missiles = world.projectiles.threatsTo(v);
    const recentlyHit = t - v.lastHitTime < 1.5;
    if ((missiles > 0 || recentlyHit) && v.smokeCharges > 0 && t - v.lastSmoke > 12) {
      world.popSmoke(v);
    }
    if ((missiles > 0 || (recentlyHit && v.threatSource && v.threatSource.cat === 'inf')) && t > this.evadeUntil && v.canMove) {
      // Back off out of the engagement or dodge sideways.
      this.evadeUntil = t + rng.range(6, 10);
      const src = v.threatSource && v.threatSource.alive ? v.threatSource.pos : null;
      let dx;
      let dz;
      if (src) {
        dx = v.pos.x - src.x;
        dz = v.pos.z - src.z;
      } else {
        dx = -Math.sin(v.yaw);
        dz = -Math.cos(v.yaw);
      }
      const d = Math.hypot(dx, dz) || 1;
      const side = rng.sign() * 0.6;
      const ex = v.pos.x + ((dx - dz * side) / d) * 45;
      const ez = v.pos.z + ((dz + dx * side) / d) * 45;
      if (world.nav.passable(ex, ez, this.cls)) v.setPath([{ x: v.pos.x, z: v.pos.z }, { x: ex, z: ez }], 1);
    }
  }

  driveTo(world, x, z, speedFactor = 0.85) {
    const v = this.v;
    const cls = this.cls;
    if (dist2(v.pos.x, v.pos.z, x, z) < 25 && world.nav.lineWalkable(v.pos.x, v.pos.z, x, z, cls, 60)) {
      v.setPath([{ x: v.pos.x, z: v.pos.z }, { x, z }], speedFactor);
      return;
    }
    world.paths.request(v, v.pos.x, v.pos.z, x, z, cls, { heuristicWeight: 1.4, maxNodes: 20000 }, (p) => {
      if (p && v.alive) v.setPath(p, speedFactor);
    });
  }

  move(world) {
    const v = this.v;
    const t = world.time;
    if (!v.canMove || t < this.evadeUntil) return;
    // Short halts to fire accurately (tanks can also shoot on the move).
    const main = v.weapon;
    if (v.target && this.losOK && main && (main.def.kind === 'shell' || main.def.kind === 'missile') && main.ready && t > this.haltUntil - 4) {
      if (t > this.haltUntil) this.haltUntil = t + rng.range(4, 7);
    }
    const halted = t < this.haltUntil && v.target && this.losOK;
    v.speedFactor = halted ? 0 : v.def.vclass === 'armor' && v.target ? 0.55 : 0.85;
    if (halted) {
      // Present the frontal armor to the target.
      if (v.def.vclass === 'armor') v.faceYaw = Math.atan2(v.target.pos.x - v.pos.x, v.target.pos.z - v.pos.z);
    } else if (!v.path) v.faceYaw = null;
    // Carrier for a squad.
    const sq = v.carrierOf;
    if (sq && !sq.disbanded) {
      if (sq.mounted) {
        const g = sq.goal;
        if (g && (!v.moveTarget || dist2(v.moveTarget.x, v.moveTarget.z, g.x, g.z) > 30 || (v.arrived && dist2(v.pos.x, v.pos.z, g.x, g.z) > 40)) && t > this.repathT) {
          this.repathT = t + 5;
          this.driveTo(world, g.x, g.z, 0.9);
        }
      } else if (t > this.supportT) {
        // Overwatch behind the dismounts.
        this.supportT = t + 8;
        const c = sq.center;
        const home = world.map.deploy[v.faction];
        const dx = home.x - c.x;
        const dz = home.z - c.z;
        const d = Math.hypot(dx, dz) || 1;
        const sx = c.x + (dx / d) * 55 + rng.range(-20, 20);
        const sz = c.z + (dz / d) * 55 + rng.range(-20, 20);
        if (dist2(v.pos.x, v.pos.z, sx, sz) > 35) this.driveTo(world, sx, sz, 0.7);
      }
      return;
    }
    const grp = v.group;
    if (grp && !grp.disbanded && grp.leader !== v && grp.leader.alive) {
      if (t > this.followT) {
        this.followT = t + 3;
        const slot = grp.slotFor(v);
        if (!this.lastSlot || dist2(this.lastSlot.x, this.lastSlot.z, slot.x, slot.z) > 12 || v.arrived) {
          this.lastSlot = slot;
          if (dist2(v.pos.x, v.pos.z, slot.x, slot.z) > 10) this.driveTo(world, slot.x, slot.z, grp.leader.path ? 1 : 0.7);
        }
      }
      return;
    }
    // Group leader / standalone vehicle: unstick if needed.
    if (v.stuckT > 6) {
      v.stuckT = 0;
      const g = v.moveTarget;
      if (g) {
        // Reverse a bit, then re-route.
        const bx = v.pos.x - Math.sin(v.yaw) * 12;
        const bz = v.pos.z - Math.cos(v.yaw) * 12;
        v.setPath([{ x: v.pos.x, z: v.pos.z }, { x: bx, z: bz }], 0.6);
        this.repathT = t + 3;
        this.pendingGoal = g;
      }
    }
    if (this.pendingGoal && t > this.repathT && v.arrived) {
      const g = this.pendingGoal;
      this.pendingGoal = null;
      this.driveTo(world, g.x, g.z, 0.85);
    }
  }

  update(dt, world) {
    const v = this.v;
    if (v.firepowerKill) {
      v.aimTarget = null;
      return;
    }
    const tg = v.target;
    const w = v.weapon;
    if (tg && w && tg.alive && !tg.dying) {
      if (w.ammoType !== undefined && w.def.ammoTypes) w.selectAmmo(tg.tclass);
      vehicleAimPoint(v, w, tg, this.aimPt);
      v.aimTarget = this.aimPt;
      const err = v.aimError();
      const tol = w.def.kind === 'shell' ? 0.012 : w.def.kind === 'missile' ? 0.12 : 0.03;
      if (err < 0.25) w.aimT += dt;
      const canMoveFire = v.def.vclass === 'armor' || w.def.kind === 'bullet';
      if (this.losOK && err < tol && w.aimT > w.def.aimTime && w.ready && (canMoveFire || Math.abs(v.speed) < 1.5)) {
        const n = w.pull(dt);
        if (n > 0) {
          const twin = w.def.twin;
          for (let k = 0; k < n; k++) {
            const mount = twin ? (w.shots - k) % 2 ? 'gun1' : 'gun2' : w.mount;
            v.mountPoint(mount, _o);
            v.gunDir(_d);
            world.fireRounds(v, w, _o, _d, 1, vehicleDispersion(v, w), tg, dt / n, { guided: w.def.kind === 'missile' });
          }
        }
      } else if (!this.losOK) w.release();
      // Coaxial MG follows the main gun at infantry targets.
      if (tg.cat === 'inf' && this.losOK && err < 0.04) this.fireCoax(dt, world, tg);
    } else {
      v.aimTarget = null;
      if (w) w.release();
    }
    // Commander's MG / coax at a secondary infantry target.
    const st = this.secTarget;
    if (st && st.alive && this.secLos && st !== tg) this.fireRoof(dt, world, st);
  }

  fireCoax(dt, world, tg) {
    const v = this.v;
    const w = v.weapons.find((x) => x.mount === 'coax');
    if (!w || !w.ready) return;
    const n = w.pull(dt);
    if (n <= 0) return;
    v.mountPoint('coax', _o);
    v.gunDir(_d);
    world.fireRounds(v, w, _o, _d, n, vehicleDispersion(v, w) * 1.5, tg, dt);
  }

  fireRoof(dt, world, tg) {
    const v = this.v;
    const w = v.weapons.find((x) => x.mount === 'roof');
    if (!w || !w.ready) return;
    const d = dist2(v.pos.x, v.pos.z, tg.pos.x, tg.pos.z);
    if (d > w.def.range) return;
    w.aimT += dt;
    if (w.aimT < w.def.aimTime) return;
    const n = w.pull(dt);
    if (n <= 0) return;
    v.mountPoint('roof', _o);
    if (aimAt(v, w, tg, _o, _d) < 0) return;
    world.fireRounds(v, w, _o, _d, n, vehicleDispersion(v, w) * 1.4, tg, dt);
  }
}

// ------------------------------------------------------------ artillery

export class ArtilleryBrain {
  constructor(v) {
    this.v = v;
    this.missions = [];
    this.current = null;
    this.relocateT = 0;
    this.home = null;
    this.aimPt = { x: 0, y: 0, z: 0, loft: 0 };
  }

  thinkInterval() {
    return 0.4;
  }

  get busy() {
    return !!this.current || this.missions.length > 0;
  }

  addMission(m) {
    this.missions.push(m);
  }

  think(world) {
    const v = this.v;
    if (!this.home) this.home = { x: v.pos.x, z: v.pos.z };
    if (!this.current && this.missions.length) {
      this.current = this.missions.shift();
      this.current.fired = 0;
      this.current.started = world.time;
      v.stop();
    }
    if (!this.current && this.relocate && v.arrived) {
      this.relocate = false;
    }
  }

  // Launch velocity for a shell to land at (tx, ty, tz) after T seconds.
  solution(origin, tx, ty, tz, T, out) {
    const vx = (tx - origin.x) / T;
    const vz = (tz - origin.z) / T;
    const vy = (ty - origin.y + 0.5 * GRAVITY * T * T) / T;
    out.set(vx, vy, vz);
    return out;
  }

  update(dt, world) {
    const v = this.v;
    const m = this.current;
    const w = v.weapons[0];
    if (!m || !w) {
      v.aimTarget = null;
      return;
    }
    const isRocket = w.def.kind === 'rocket';
    const d = dist2(v.pos.x, v.pos.z, m.x, m.z);
    // Flight time from a fixed launch elevation (rockets flatter than shells).
    const theta = isRocket ? 0.73 : 0.96;
    const T = Math.max(6, Math.sqrt((2 * d * Math.tan(theta)) / GRAVITY));
    // Lay the gun: turret toward the target, barrel at the launch angle.
    v.mountPoint('gun', _o);
    this.solution(_o, m.x, m.y, m.z, T, _d);
    const elev = Math.atan2(_d.y, Math.hypot(_d.x, _d.z));
    this.aimPt.x = m.x;
    this.aimPt.y = v.pos.y + 2;
    this.aimPt.z = m.z;
    this.aimPt.loft = elev;
    v.aimTarget = this.aimPt;
    if (v.aimError() > 0.04 || !w.ready) return;
    const n = w.pull(dt);
    for (let k = 0; k < n; k++) {
      const spread = m.spread * (isRocket ? 1.4 : 1);
      const a = rng.range(0, Math.PI * 2);
      const r = Math.sqrt(rng.next()) * spread;
      const tx = m.x + Math.cos(a) * r;
      const tz = m.z + Math.sin(a) * r;
      const ty = world.terrain.heightAt(tx, tz);
      if (isRocket) v.mountPoint('tube', _o, w.shots - k);
      else v.mountPoint('gun', _o);
      const tt = T * rng.range(0.98, 1.02);
      this.solution(_o, tx, ty, tz, tt, _d);
      const speed = _d.length();
      _d.multiplyScalar(1 / speed);
      world.fireRounds(v, w, _o, _d, 1, 0, null, 0, { speed, targetPoint: { x: tx, y: ty, z: tz }, whistleAt: Math.max(0.5, tt - 2.8), life: tt + 4, gravity: 1, noThrust: true });
      m.fired++;
    }
    if (m.fired >= m.rounds) {
      this.current = null;
      world.emitRadio(v.faction, `${v.callsign || 'Battery'}: rounds complete.`, 0);
      // Shoot and scoot: displace after firing.
      if (this.home && rng.chance(0.6)) {
        const nx = this.home.x + rng.range(-90, 90);
        const nz = this.home.z + rng.range(-25, 25);
        const cls = v.spec.kind === 'wheeled' ? MOVE_WHEEL : MOVE_TRACK;
        if (world.nav.passable(nx, nz, cls)) v.setPath([{ x: v.pos.x, z: v.pos.z }, { x: nx, z: nz }], 0.7);
      }
    }
  }
}
