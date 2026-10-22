// Automatic cinematic camera. Picks interesting moments (units that are
// firing, aircraft attacking, the hottest firefight, drone runs) and frames
// them with varied shot types, cutting every few seconds.

import * as THREE from 'three';
import { damp, clamp } from '../core/math.js';

const TYPE_INTEREST = { mbt: 3, ifv: 2.2, apc: 1.6, scout: 1.4, spaag: 2.4, spg: 2, mlrs: 3, attack_heli: 4.5, transport_heli: 3.2, jet: 5, transport_plane: 4, fpv_drone: 3.5, recon_uav: 0.5 };
const ROLE_INTEREST = { mg: 1.6, at: 2, atgm: 2.4, sniper: 1.8, leader: 1.3, manpads: 2, drone_op: 1.2 };

const _v = new THREE.Vector3();
const _look = new THREE.Vector3();
const _trees = [];

// Can a camera at p see l without sitting in a tree or building or looking
// through a wall, hillside or wood?
function clearShot(world, px, py, pz, lx, ly, lz) {
  const s = world.structures.structureAt(px, pz, 2.5);
  if (s && py < s.top + 2) return false;
  world.map.trees.grid.queryRadius(px, pz, 7, _trees);
  for (const t of _trees) {
    if (t.alive && t.fall < 0.5 && Math.hypot(t.x - px, t.z - pz) < 6 && py < world.terrain.heightAt(t.x, t.z) + 15 * t.scale) return false;
  }
  if (!world.terrain.lineClear(px, py, pz, lx, ly, lz, 0.4)) return false;
  if (world.structures.blocksSight(px, py, pz, lx, ly, lz, null, null)) return false;
  return world.los.forestTransmittance(px, py, pz, lx, ly, lz) > 0.3;
}

export class Director {
  constructor() {
    this.shot = null;
    this.t = 0;
    this.pos = new THREE.Vector3();
    this.look = new THREE.Vector3();
    this.lastTypes = [];
  }

  start(world) {
    this.shot = null;
    this.next(world);
  }

  interest(u, world) {
    if (!u.alive || u.hidden || u.dying) return 0;
    let s = u.cat === 'inf' ? ROLE_INTEREST[u.def.role] ?? 1 : TYPE_INTEREST[u.type] ?? 1;
    if (world.time - u.lastFired < 2) s *= 2.5;
    if (u.cat === 'air' && u.aclass !== 'uav') s *= 1.3;
    const h = this.heatAt(world, u.pos.x, u.pos.z);
    s *= 1 + Math.min(4, h * 0.15);
    return s * (0.6 + Math.random() * 0.8);
  }

  heatAt(world, x, z) {
    const cx = clamp(Math.floor((x + 1024) / 64), 0, 31);
    const cz = clamp(Math.floor((z + 1024) / 64), 0, 31);
    return world.combatHeat[cz * 32 + cx];
  }

  hotspot(world) {
    let best = 0;
    let bi = -1;
    const h = world.combatHeat;
    for (let i = 0; i < h.length; i++) {
      const v = h[i] * (0.7 + Math.random() * 0.6);
      if (v > best) {
        best = v;
        bi = i;
      }
    }
    if (bi < 0) {
      const o = world.objectives[Math.floor(Math.random() * world.objectives.length)];
      return { x: o.x, z: o.z, heat: 0 };
    }
    return { x: (bi % 32) * 64 - 1024 + 32, z: Math.floor(bi / 32) * 64 - 1024 + 32, heat: best };
  }

  pickInteresting(world, filter = null) {
    const units = world.units;
    if (!units.length) return null;
    let best = null;
    let bs = 0;
    const n = Math.min(260, units.length);
    for (let k = 0; k < n; k++) {
      const u = units[Math.floor(Math.random() * units.length)];
      if (filter && !filter(u)) continue;
      const s = this.interest(u, world);
      if (s > bs) {
        bs = s;
        best = u;
      }
    }
    // Aircraft are rare; always consider them.
    for (const f of [0, 1]) {
      for (const a of world.airUnits[f]) {
        if (filter && !filter(a)) continue;
        const s = this.interest(a, world);
        if (s > bs) {
          bs = s;
          best = a;
        }
      }
    }
    return best;
  }

  next(world) {
    const types = [
      ['track', 4],
      ['orbit', 2.5],
      ['ground', 2.5],
      ['air', world.airUnits[0].length + world.airUnits[1].length > 0 ? 3 : 0],
      ['flyby', world.airUnits[0].some((a) => a.aclass === 'jet' || a.aclass === 'heli') || world.airUnits[1].some((a) => a.aclass === 'jet' || a.aclass === 'heli') ? 1.5 : 0],
      ['aerial', 1.2],
      ['fpv', world.airUnits[0].some((a) => a.aclass === 'drone') || world.airUnits[1].some((a) => a.aclass === 'drone') ? 2 : 0],
    ].filter(([t, w]) => w > 0 && !this.lastTypes.slice(-1).includes(t));
    let total = 0;
    for (const [, w] of types) total += w;
    let r = Math.random() * total;
    let type = 'orbit';
    for (const [t, w] of types) {
      r -= w;
      if (r <= 0) {
        type = t;
        break;
      }
    }
    const shot = { type, t: 0, dur: 6 + Math.random() * 6, target: null, fov: 55 };
    const hs = this.hotspot(world);
    switch (type) {
      case 'track':
        shot.target = this.pickInteresting(world, (u) => u.cat !== 'air');
        shot.side = Math.random() < 0.5 ? 1 : -1;
        shot.dist = shot.target && shot.target.cat === 'veh' ? 14 + Math.random() * 12 : 5 + Math.random() * 5;
        shot.height = shot.target && shot.target.cat === 'veh' ? 2 + Math.random() * 4 : 0.6 + Math.random() * 1.6;
        shot.fov = 45 + Math.random() * 20;
        break;
      case 'air':
        shot.target = this.pickInteresting(world, (u) => u.cat === 'air' && u.aclass !== 'uav' && u.aclass !== 'drone');
        shot.side = Math.random() < 0.5 ? 1 : -1;
        shot.fov = 50;
        break;
      case 'flyby': {
        const a = this.pickInteresting(world, (u) => u.cat === 'air' && (u.aclass === 'jet' || u.aclass === 'heli'));
        shot.target = a;
        if (a) {
          const lead = a.aclass === 'jet' ? 5 : 6;
          const side = Math.random() < 0.5 ? 1 : -1;
          const vx = a.vel.x;
          const vz = a.vel.z;
          const vl = Math.hypot(vx, vz) || 1;
          const px = a.pos.x + vx * lead - (vz / vl) * side * (a.aclass === 'jet' ? 70 : 35);
          const pz = a.pos.z + vz * lead + (vx / vl) * side * (a.aclass === 'jet' ? 70 : 35);
          const g = world.terrain.heightAt(px, pz);
          shot.fixed = new THREE.Vector3(px, Math.max(g + 2, a.pos.y - 25 + Math.random() * 20), pz);
          shot.dur = 5;
          shot.fov = 40;
        }
        break;
      }
      case 'ground': {
        // Low camera at the edge of a firefight looking across it, from a
        // spot with a clear view.
        const ly = world.terrain.heightAt(hs.x, hs.z) + 4;
        for (let k = 0; k < 12 && !shot.fixed; k++) {
          const a = Math.random() * Math.PI * 2;
          const r = 35 + Math.random() * 55;
          const px = hs.x + Math.cos(a) * r;
          const pz = hs.z + Math.sin(a) * r;
          const py = world.terrain.heightAt(px, pz) + 1.2 + Math.random() * 1.2;
          if (clearShot(world, px, py, pz, hs.x, ly, hs.z)) shot.fixed = new THREE.Vector3(px, py, pz);
        }
        if (!shot.fixed) {
          shot.fallback = true;
          break;
        }
        shot.lookAt = new THREE.Vector3(hs.x, ly, hs.z);
        shot.fov = 50 + Math.random() * 15;
        shot.pan = (Math.random() - 0.5) * 0.04;
        break;
      }
      case 'orbit':
        shot.center = new THREE.Vector3(hs.x, world.terrain.heightAt(hs.x, hs.z), hs.z);
        shot.radius = 70 + Math.random() * 90;
        shot.height = 18 + Math.random() * 40;
        shot.a0 = Math.random() * Math.PI * 2;
        shot.speed = (Math.random() < 0.5 ? 1 : -1) * (0.05 + Math.random() * 0.05);
        shot.fov = 50;
        break;
      case 'aerial':
        shot.center = new THREE.Vector3(hs.x, world.terrain.heightAt(hs.x, hs.z), hs.z);
        shot.a0 = Math.random() * Math.PI * 2;
        shot.radius = 380 + Math.random() * 200;
        shot.height = 220 + Math.random() * 200;
        shot.speed = 0.02;
        shot.fov = 55;
        shot.dur = 9;
        break;
      case 'fpv':
        shot.target = this.pickInteresting(world, (u) => u.aclass === 'drone');
        shot.dur = 30;
        shot.fov = 92;
        break;
    }
    if (((type === 'track' || type === 'air' || type === 'flyby' || type === 'fpv') && !shot.target) || shot.fallback) {
      shot.type = 'orbit';
      shot.center = new THREE.Vector3(hs.x, world.terrain.heightAt(hs.x, hs.z), hs.z);
      shot.radius = 90;
      shot.height = 30;
      shot.a0 = Math.random() * 6.28;
      shot.speed = 0.06;
    }
    this.shot = shot;
    this.lastTypes.push(shot.type);
    if (this.lastTypes.length > 4) this.lastTypes.shift();
    this.cut = true;
  }

  update(dt, world, ctrl) {
    if (!this.shot) this.next(world);
    const s = this.shot;
    s.t += dt;
    const cam = ctrl.camera;
    const tg = s.target;
    const lost = tg && (!tg.alive || tg.removed || tg.hidden) && !tg.dying;
    if (s.t > s.dur || (lost && s.t > 1.5 && (s.lostT = (s.lostT || 0) + dt) > 2.5)) {
      this.next(world);
      return this.update(0, world, ctrl);
    }
    ctrl.fov = s.fov;
    let want;
    let look;
    switch (s.type) {
      case 'track': {
        const yaw = tg.yaw + (s.side > 0 ? 1.2 : -1.2) + Math.sin(s.t * 0.15) * 0.3;
        want = _v.set(tg.pos.x + Math.sin(yaw) * s.dist, tg.pos.y + s.height, tg.pos.z + Math.cos(yaw) * s.dist);
        look = _look.set(tg.pos.x + Math.sin(tg.yaw) * 6, tg.pos.y + (tg.cat === 'veh' ? 1.8 : 1.2), tg.pos.z + Math.cos(tg.yaw) * 6);
        break;
      }
      case 'air': {
        const vx = tg.vel.x;
        const vz = tg.vel.z;
        const vl = Math.hypot(vx, vz) || 1;
        const back = tg.aclass === 'jet' ? 55 : tg.aclass === 'plane' ? 90 : 30;
        want = _v.set(tg.pos.x - (vx / vl) * back + (-vz / vl) * s.side * back * 0.4, tg.pos.y + back * 0.18, tg.pos.z - (vz / vl) * back + (vx / vl) * s.side * back * 0.4);
        look = _look.set(tg.pos.x + vx * 0.5, tg.pos.y, tg.pos.z + vz * 0.5);
        break;
      }
      case 'flyby':
        want = _v.copy(s.fixed);
        look = _look.copy(tg.pos);
        break;
      case 'ground': {
        want = _v.copy(s.fixed);
        s.lookAt.x += s.pan * 30 * dt;
        look = _look.copy(s.lookAt);
        break;
      }
      case 'orbit':
      case 'aerial': {
        const a = s.a0 + s.t * s.speed;
        want = _v.set(s.center.x + Math.cos(a) * s.radius, s.center.y + s.height, s.center.z + Math.sin(a) * s.radius);
        look = _look.set(s.center.x, s.center.y + 3, s.center.z);
        break;
      }
      case 'fpv':
        ctrl.target = tg;
        ctrl.updateEyes(dt, world.terrain);
        ctrl.fpvActive = true;
        this.cut = false;
        return;
    }
    // Tracking and orbiting cameras dodge obstructions: swap sides, then rise.
    if (s.type === 'track' || s.type === 'orbit') {
      s.checkT = (s.checkT || 0) - dt;
      if (s.checkT <= 0) {
        s.checkT = 0.5;
        if (!clearShot(world, want.x, want.y, want.z, look.x, look.y, look.z)) {
          if (s.type === 'track' && !s.flipped) {
            s.side = -s.side;
            s.flipped = true;
          } else s.height = Math.min(s.height + 4, s.type === 'track' ? 24 : 90);
        }
      }
    }
    const g = world.terrain.heightAt(want.x, want.z) + 0.8;
    if (want.y < g) want.y = g;
    if (this.cut) {
      this.pos.copy(want);
      this.look.copy(look);
      this.cut = false;
    } else {
      this.pos.lerp(want, damp(s.type === 'air' ? 4 : 2.5, dt));
      this.look.lerp(look, damp(5, dt));
    }
    cam.position.copy(this.pos);
    cam.lookAt(this.look);
  }
}
