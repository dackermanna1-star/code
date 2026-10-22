// Soldier brain. Squads assign tasks; this executes them: movement and
// pathing, cover selection, rooftop climbing, stance under fire, target
// selection and shooting, grenades, smoke and drone launches.

import { Vector3 } from 'three';
import { rng } from '../core/rng.js';
import { clamp, angleDiff, dist2, GRAVITY } from '../core/math.js';
import { MOVE_INF } from '../world/nav.js';
import { scan, pickTarget, aimAt, infantryDispersion } from './perception.js';

const _o = new Vector3();
const _d = new Vector3();

export class InfantryBrain {
  constructor(u) {
    this.u = u;
    this.scanT = rng.range(0, 0.8);
    this.coverT = -100;
    this.losOK = false;
    this.losT = -100;
    this.pathTarget = null;
    this.cowerT = 0;
    this.smokeT = -100;
    this.droneT = rng.range(5, 20);
    this.fleeing = false;
  }

  thinkInterval() {
    return 0.32 + rng.next() * 0.22;
  }

  think(world) {
    const u = this.u;
    if (u.para || u.mounted || u.climb) return;
    const t = world.time;
    if (t >= this.scanT) {
      scan(u, world, u.def.role === 'sniper' || u.def.role === 'manpads' ? 5 : 3);
      this.scanT = t + 0.7 + rng.next() * 0.5;
      pickTarget(u, world);
    } else if (u.target && (!u.target.alive || u.target.hidden)) {
      pickTarget(u, world);
    }
    if (u.target) {
      this.losOK = world.unitLOS(u, u.target, 1.2) > 0;
      this.losT = t;
      if (!this.losOK && t - (this.lostT || 0) > 4) {
        this.lostT = t;
        pickTarget(u, world);
      }
    }
    // Cowering under heavy suppression (machine gunners keep firing more often).
    if (u.suppression > 0.82 && rng.chance(u.def.role === 'mg' ? 0.25 : 0.6)) this.cowerT = t + rng.range(1.2, 3);

    let task = u.task || (u.squad ? null : this.selfTask(world));
    if (!task && (u.target || u.suppression > 0.2)) task = u.task = { type: 'fight', t };
    if (task) this.execute(task, world);
    this.chooseStance(world, task);
    this.special(world, task);
  }

  // Squadless soldiers (bailed-out crews, pilots): get to the rear.
  selfTask(world) {
    const u = this.u;
    const home = world.map.deploy[u.faction];
    if (!this.fleeing) {
      this.fleeing = true;
      u.task = { type: 'flee', x: home.x + rng.range(-150, 150), z: home.z + rng.range(-30, 30), t: world.time };
    }
    return u.task;
  }

  execute(task, world) {
    const u = this.u;
    const sq = u.squad;
    // Leave the roof unless the task keeps us there.
    if (u.roof && !(task.type === 'hold' && task.cover && task.cover.kind === 'roof' && task.cover.struct === u.roof) && task.type !== 'fight') {
      this.climbDown(world);
      return;
    }
    switch (task.type) {
      case 'lead':
        if (u.arrived && sq && sq.state !== 'moving' && sq.state !== 'flank' && sq.state !== 'retreat') u.task = { type: 'fight', t: world.time };
        if (u.stuckT > 4) {
          u.stuckT = 0;
          const g = sq?.moveGoal || sq?.goal;
          if (g) sq.moveTo(world, g.x, g.z, task.mode || 'run', true);
        }
        break;
      case 'follow': {
        if (!sq || !sq.leader.alive || sq.leader === u) break;
        const slot = sq.slotFor(u);
        const d = dist2(u.pos.x, u.pos.z, slot.x, slot.z);
        if (d > 2.5) {
          const mode = d > 16 ? 'sprint' : task.mode || 'run';
          this.goTo(world, slot.x, slot.z, mode, 40);
        } else if (sq.leader.arrived) {
          u.stop();
        }
        break;
      }
      case 'fight':
        this.fight(world, task);
        break;
      case 'hold': {
        const cp = task.cover;
        if (cp && cp.kind === 'roof') {
          if (u.roof === cp.struct) {
            const d = dist2(u.pos.x, u.pos.z, cp.x, cp.z);
            if (d > 0.8) u.moveDirect(cp.x, cp.z, 'walk');
            else u.stop();
          } else if (!cp.struct.destroyed) {
            this.climbUp(world, cp);
          } else {
            u.task = { type: 'fight', t: world.time };
          }
        } else {
          const d = dist2(u.pos.x, u.pos.z, task.x, task.z);
          if (d > 1.0) this.goTo(world, task.x, task.z, d > 25 ? 'run' : 'run', 30);
          else u.stop();
        }
        const th = task.threat;
        if (th && !u.target) u.faceYaw = Math.atan2(th.x - u.pos.x, th.z - u.pos.z);
        break;
      }
      case 'bound': {
        const d = dist2(u.pos.x, u.pos.z, task.x, task.z);
        if (d > 1.0) this.goTo(world, task.x, task.z, 'sprint', 60);
        else u.stop();
        break;
      }
      case 'assault': {
        const d = dist2(u.pos.x, u.pos.z, task.x, task.z);
        if (d > 3) this.goTo(world, task.x, task.z, 'run', 40);
        else u.stop();
        break;
      }
      case 'flee': {
        const d = dist2(u.pos.x, u.pos.z, task.x, task.z);
        if (d > 15) this.goTo(world, task.x, task.z, 'run', 30);
        else if (u.def.role === 'crew' || u.def.role === 'pilot') u.removed = true; // made it back to the rear
        break;
      }
    }
  }

  // Take cover near the current position against the current threat.
  fight(world, task) {
    const u = this.u;
    const t = world.time;
    if (u.roof) {
      // The parapet is our cover up here.
      u.stop();
      return;
    }
    const thr = u.target ? u.target.pos : u.squad?.contact || (u.threatSource && u.threatSource.alive ? u.threatSource.pos : null);
    if (task.stay && u.cover && dist2(u.pos.x, u.pos.z, u.cover.x, u.cover.z) < 1.2) {
      u.stop();
      return;
    }
    let good = false;
    if (u.cover && u.cover.active && thr) {
      const p = u.cover;
      const tdx = thr.x - p.x;
      const tdz = thr.z - p.z;
      const tl = Math.hypot(tdx, tdz) || 1;
      good = (p.nx === 0 && p.nz === 0) || (p.nx * tdx + p.nz * tdz) / tl > 0.3;
    } else if (u.cover && u.cover.active && !thr) good = true;
    if (!good && t - this.coverT > 2.5) {
      this.coverT = t;
      const cp = thr ? world.cover.find(u, thr.x, thr.z, 24, {}) : world.cover.find(u, null, null, 18, {});
      if (cp) {
        world.cover.claim(cp, u);
        good = true;
      } else if (u.cover) {
        world.cover.release(u);
      }
    }
    if (u.cover && good) {
      const d = dist2(u.pos.x, u.pos.z, u.cover.x, u.cover.z);
      if (d > 0.9) this.goTo(world, u.cover.x, u.cover.z, d > 6 ? 'sprint' : 'run', 30);
      else u.stop();
    } else if (!u.path || u.arrived) {
      u.stop();
    }
  }

  // Move to a point: direct if close and clear, otherwise ask for a path.
  goTo(world, x, z, mode, directMax = 35) {
    const u = this.u;
    const d = dist2(u.pos.x, u.pos.z, x, z);
    const pt = this.pathTarget;
    if (pt && dist2(pt.x, pt.z, x, z) < 3 && (u.path || world.paths.pending(u)) && u.stuckT < 3) {
      u.moveMode = mode;
      return;
    }
    if (d < directMax && u.stuckT < 2 && world.nav.lineWalkable(u.pos.x, u.pos.z, x, z, MOVE_INF, 45)) {
      u.moveDirect(x, z, mode);
      this.pathTarget = null;
      return;
    }
    this.pathTarget = { x, z };
    u.stuckT = 0;
    world.paths.request(u, u.pos.x, u.pos.z, x, z, MOVE_INF, { heuristicWeight: 1.5, maxNodes: 9000 }, (path) => {
      if (!u.alive) return;
      if (path && path.length) u.setPath(path, mode);
      else u.moveDirect(x, z, mode);
    });
  }

  climbUp(world, cp) {
    const u = this.u;
    const s = cp.struct;
    // Walk to the nearest point on the building's perimeter, then go up.
    const c = Math.cos(s.yaw);
    const sn = Math.sin(s.yaw);
    const rx = u.pos.x - s.x;
    const rz = u.pos.z - s.z;
    let lx = rx * c - rz * sn;
    let lz = rx * sn + rz * c;
    lx = clamp(lx, -s.hx, s.hx);
    lz = clamp(lz, -s.hz, s.hz);
    if (Math.abs(lx) < s.hx && Math.abs(lz) < s.hz) {
      if (s.hx - Math.abs(lx) < s.hz - Math.abs(lz)) lx = Math.sign(lx || 1) * s.hx;
      else lz = Math.sign(lz || 1) * s.hz;
    }
    const ex = lx + Math.sign(lx) * (Math.abs(lx) >= s.hx ? 0.9 : 0);
    const ez = lz + Math.sign(lz) * (Math.abs(lz) >= s.hz ? 0.9 : 0);
    const bx = s.x + ex * c + ez * sn;
    const bz = s.z - ex * sn + ez * c;
    const d = dist2(u.pos.x, u.pos.z, bx, bz);
    if (d > 1.6) {
      this.goTo(world, bx, bz, 'run', 30);
      return;
    }
    if (world.cover && u.cover !== cp) world.cover.claim(cp, u);
    u.stop();
    u.climb = { s, t: 0, dur: 2.5 + s.floors * 1.6, up: true, x: cp.x, z: cp.z };
  }

  climbDown(world) {
    const u = this.u;
    const s = u.roof;
    if (u.cover && u.cover.kind === 'roof') world.cover.release(u);
    // Exit on the side facing our own lines.
    const home = world.map.deploy[u.faction];
    const dx = home.x - s.x;
    const dz = home.z - s.z;
    const d = Math.hypot(dx, dz) || 1;
    const r = Math.max(s.hx, s.hz) + 1.5;
    let x = s.x + (dx / d) * r;
    let z = s.z + (dz / d) * r;
    const res = world.resolveInfantryCollision(x, z, s.x, s.z);
    x = res.x;
    z = res.z;
    u.roof = null;
    u.stop();
    u.climb = { s, t: 0, dur: 2 + s.floors * 1.2, up: false, x, z };
  }

  chooseStance(world, task) {
    const u = this.u;
    const role = u.def.role;
    const moving = u.path && !u.arrived;
    const supp = u.suppression;
    const tt = task ? task.type : 'none';
    let st = 0;
    if (moving) {
      st = supp > 0.55 && tt !== 'bound' && tt !== 'flee' ? 1 : 0;
    } else {
      const inCombat = u.target || supp > 0.15 || (u.squad && world.time - u.squad.lastContactT < 10);
      if (!inCombat) {
        st = tt === 'hold' ? 1 : 0;
        if (tt === 'hold' && (role === 'mg' || role === 'sniper' || role === 'atgm')) st = 2;
      } else {
        const cp = u.cover;
        if (cp) st = cp.high ? (supp > 0.5 ? 1 : 0) : 1;
        else st = 2;
        if (u.roof) st = supp > 0.45 ? 2 : 1;
        if (role === 'mg' || role === 'sniper' || role === 'atgm') st = cp && cp.high && !u.roof ? 1 : 2;
        if (supp > 0.72) st = 2;
        // Rockets and missiles are fired kneeling or standing.
        const w = u.weapon;
        if (w && (w.def.kind === 'rocket' || (w.def.kind === 'missile' && role !== 'atgm')) && u.target) st = role === 'manpads' ? 0 : 1;
        if (u.drones > 0 && u.activeDrone) st = 1;
      }
    }
    if (u.diveT > world.time) st = 2;
    u.stance = st;
  }

  special(world, task) {
    const u = this.u;
    const t = world.time;
    const role = u.def.role;
    // Heavy weapons: stop to take the shot.
    const w = u.weapon;
    if (w && u.target && this.losOK && (w.def.kind === 'rocket' || w.def.kind === 'missile') && (!task || task.type !== 'bound') && !u.arrived) {
      if (!task || task.type === 'fight' || task.type === 'hold' || task.type === 'assault') u.stop();
    }
    // Hand grenades at enemies in cover nearby.
    if (u.grenades > 0 && u.throwT > 9 && u.target && u.target.cat === 'inf' && this.losOK) {
      const d = dist2(u.pos.x, u.pos.z, u.target.pos.x, u.target.pos.z);
      if (d > 9 && d < 30 && (u.target.cover || u.target.stance === 2 || task?.type === 'assault') && rng.chance(0.35)) this.throwGrenade(world, u.target);
    }
    // Squad leaders screen movement with smoke.
    if (role === 'leader' && u.smokeGrenades > 0 && t - this.smokeT > 40 && u.squad) {
      const sq = u.squad;
      if ((sq.state === 'retreat' || sq.state === 'bounding' || sq.state === 'flank') && sq.contact && world.time - sq.lastContactT < 6) {
        const c = sq.contact;
        const dx = c.x - u.pos.x;
        const dz = c.z - u.pos.z;
        const d = Math.hypot(dx, dz);
        if (d > 40 && d < 350) {
          this.smokeT = t;
          u.smokeGrenades--;
          const k = Math.min(30, d * 0.4) / d;
          world.smokeGrenade(u, u.pos.x + dx * k, u.pos.z + dz * k);
        }
      }
    }
    // Drone operators send FPV drones at spotted vehicles or strongpoints.
    if (role === 'drone_op' && u.drones > 0 && !u.activeDrone && t > this.droneT) {
      this.droneT = t + rng.range(14, 26);
      const intel = world.factions[u.faction].intel;
      let best = null;
      let bs = 0;
      for (const c of intel.contacts.values()) {
        const e = c.unit;
        if (!e.alive || e.cat === 'air' || t - c.t > 15) continue;
        const d = dist2(u.pos.x, u.pos.z, c.x, c.z);
        if (d > 1700 || d < 60) continue;
        let s = e.cat === 'veh' ? (e.tclass === 'armor' ? 6 : 4) : e.def.role === 'mg' || e.def.role === 'atgm' || e.def.role === 'at' ? 1.6 : 0.6;
        if (e.cat === 'veh' && e.wreck) continue;
        s *= 1 - d / 2200;
        if (s > bs) {
          bs = s;
          best = e;
        }
      }
      if (best && bs > 0.5) world.launchDrone(u, best);
    }
  }

  throwGrenade(world, target) {
    const u = this.u;
    const w = u.weapons.find((x) => x.def.id === 'frag');
    if (!w || !w.ready) return;
    const n = w.pull(0.016);
    if (n <= 0) return;
    u.grenades--;
    u.throwT = 0;
    const dx = target.pos.x - u.pos.x;
    const dz = target.pos.z - u.pos.z;
    const hd = Math.hypot(dx, dz);
    const th = 0.68;
    const v = Math.sqrt((GRAVITY * hd) / Math.sin(2 * th)) * rng.range(0.92, 1.06);
    _o.set(u.pos.x, u.pos.y + 1.7, u.pos.z);
    _d.set((dx / hd) * Math.cos(th), Math.sin(th), (dz / hd) * Math.cos(th));
    world.fireRounds(u, w, _o, _d, 1, 0.05, target, 0.016, { speed: v, fuse: rng.range(3, 3.8) });
    world.emit({ t: 'grenade_throw', unit: u });
  }

  // Every tick: aim and fire at the current target.
  update(dt, world) {
    const u = this.u;
    const tg = u.target;
    const w = u.weapon;
    if (!tg || !w || !tg.alive || u.para || u.climb || u.mounted) {
      u.aiming = false;
      if (w) w.release();
      return;
    }
    const dx = tg.pos.x - u.pos.x;
    const dz = tg.pos.z - u.pos.z;
    const hd = Math.hypot(dx, dz);
    const yaw = Math.atan2(dx, dz);
    u.aiming = true;
    u.aimYaw = yaw;
    const ty = tg.cat === 'inf' ? tg.pos.y + 1 : tg.cat === 'veh' ? tg.pos.y + 1.5 : tg.pos.y;
    u.aimPitch = clamp(Math.atan2(ty - (u.pos.y + 1.4), hd), -0.8, 1.3);
    const moving = u.speed > 0.7;
    if (moving && (w.def.kind !== 'bullet' || (u.task && u.task.type === 'bound' && hd > 60))) {
      w.aimT = 0;
      return;
    }
    if (world.time < this.cowerT || !this.losOK) {
      w.release();
      return;
    }
    if (Math.abs(angleDiff(u.yaw, yaw)) > (u.stance === 2 ? 0.2 : 0.3)) return;
    w.aimT += dt * (moving ? 0.5 : 1);
    if (w.aimT < w.def.aimTime * (u.stance === 2 ? 0.9 : 1)) return;
    if (!w.ready) {
      if (w.mag <= 0) w.startReload();
      return;
    }
    const n = w.pull(dt);
    if (n <= 0) return;
    u.muzzlePos(_o);
    const dist = aimAt(u, w, tg, _o, _d, u.skill);
    if (dist < 0) {
      w.release();
      return;
    }
    const disp = w.def.kind === 'missile' ? 0 : infantryDispersion(u, w);
    world.fireRounds(u, w, _o, _d, n, disp, tg, dt, { guided: w.def.kind === 'missile' });
  }
}
