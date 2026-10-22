// Units and their physical behaviour. AI "brains" (src/ai) set intentions —
// paths, move targets, stance, facing, flight goals — and these classes turn
// them into motion each simulation tick.

import { Vector3, Quaternion, Euler } from 'three';
import { UNIT_DEFS, unitName, targetClassOf } from './unitdefs.js';
import { VEHICLE_SPECS, AIRCRAFT_SPECS, INFANTRY_SPEC } from './specs.js';
import { WeaponMount } from './mount.js';
import { MAT } from '../world/terrain.js';
import { clamp, approach, approachAngle, angleDiff, wrapAngle, damp, GRAVITY } from '../core/math.js';
import { rng } from '../core/rng.js';

let nextUnitId = 1;
export function resetUnitIds() {
  nextUnitId = 1;
}

const _v = new Vector3();
const _v2 = new Vector3();
const _q = new Quaternion();
const _e = new Euler(0, 0, 0, 'YXZ');
const _near = [];

export class Unit {
  constructor(def, faction, x, y, z) {
    this.id = nextUnitId++;
    this.def = typeof def === 'string' ? UNIT_DEFS[def] : def;
    this.type = this.def.id;
    this.cat = this.def.cat;
    this.tclass = targetClassOf(this.def);
    this.faction = faction;
    this.name = unitName(this.def, faction);
    this.callsign = '';
    this.pos = new Vector3(x, y, z);
    this.vel = new Vector3();
    this.yaw = 0;
    this.hp = this.def.hp;
    this.maxHp = this.def.hp;
    this.alive = true;
    this.deathTime = 0;
    this.squad = null;
    this.brain = null;
    this.weapons = [];
    this.target = null;
    this.nextThink = 0;
    this.kills = 0;
    this.status = 'Idle';
    this.lastFired = -100;
    this.lastHitTime = -100;
    this.spotted = [0, 0]; // per faction: time until which this unit is spotted
    this.visionRange = this.def.vision;
    this.hidden = false; // not rendered/simulated (inside a vehicle)
    this.removed = false;
    this.killer = null;
    this.spawnTime = 0;
    this.stats = { shots: 0, hits: 0 };
  }

  addWeapon(id, mount) {
    const w = new WeaponMount(id, this, mount);
    this.weapons.push(w);
    return w;
  }

  get isInfantry() {
    return this.cat === 'inf';
  }

  get isVehicle() {
    return this.cat === 'veh';
  }

  get isAir() {
    return this.cat === 'air';
  }

  // Default eye and centre heights; subclasses refine.
  eyePos(out) {
    return out.set(this.pos.x, this.pos.y + 1.6, this.pos.z);
  }

  centerPos(out) {
    return out.set(this.pos.x, this.pos.y + 1, this.pos.z);
  }

  forward(out) {
    return out.set(Math.sin(this.yaw), 0, Math.cos(this.yaw));
  }
}

// --------------------------------------------------------------- Soldier

export class Soldier extends Unit {
  constructor(def, faction, x, y, z) {
    super(def, faction, x, y, z);
    this.stance = 0; // 0 stand, 1 crouch, 2 prone (target)
    this.stanceT = 0; // blended for animation
    this.moveMode = 'run';
    this.path = null;
    this.pathIdx = 0;
    this.moveTarget = null; // {x, z} final destination of the current move
    this.arrived = true;
    this.speed = 0;
    this.suppression = 0;
    this.cover = null; // claimed cover point
    this.aimYaw = 0;
    this.aimPitch = 0;
    this.aiming = false;
    this.animPhase = rng.range(0, 6.28);
    this.fireT = 10; // time since last shot (recoil anim)
    this.deadT = 0;
    this.fallDir = 1;
    this.mounted = null; // vehicle or aircraft carrying this soldier
    this.seat = 0;
    this.para = null; // parachute state
    this.roof = null; // building whose roof we stand on
    this.climb = null;
    this.sepX = 0;
    this.sepZ = 0;
    this.grenades = 0;
    this.smokeGrenades = this.def.smokeGrenades || 0;
    this.drones = this.def.drones || 0;
    this.skill = rng.range(0.75, 1.25);
    this.wounded = false;
    this.faceYaw = null;
    this.throwT = 10;
    this.stuckT = 0;
  }

  heightNow() {
    const s = this.stanceT;
    return s < 1 ? 1.75 - 0.6 * s : 1.15 - 0.8 * (s - 1);
  }

  eyePos(out) {
    const e = INFANTRY_SPEC.eyeHeight;
    const h = this.stance === 0 ? e.stand : this.stance === 1 ? e.crouch : e.prone;
    return out.set(this.pos.x, this.pos.y + h, this.pos.z);
  }

  centerPos(out) {
    const h = this.stance === 0 ? 1.15 : this.stance === 1 ? 0.8 : 0.25;
    return out.set(this.pos.x, this.pos.y + h, this.pos.z);
  }

  muzzlePos(out) {
    const h = this.stance === 0 ? 1.42 : this.stance === 1 ? 0.98 : 0.3;
    const s = Math.sin(this.yaw);
    const c = Math.cos(this.yaw);
    const fwd = this.stance === 2 ? 0.9 : 0.7;
    return out.set(this.pos.x + s * fwd - c * 0.08, this.pos.y + h, this.pos.z + c * fwd + s * 0.08);
  }

  // Body axis segment for hit tests: writes [ax, ay, az, bx, by, bz] into arr.
  bodySegment(arr) {
    const p = this.pos;
    if (this.stance === 2 && this.stanceT > 1.5) {
      const s = Math.sin(this.yaw);
      const c = Math.cos(this.yaw);
      arr[0] = p.x - s * 0.85;
      arr[1] = p.y + 0.22;
      arr[2] = p.z - c * 0.85;
      arr[3] = p.x + s * 0.75;
      arr[4] = p.y + 0.26;
      arr[5] = p.z + c * 0.75;
    } else {
      arr[0] = p.x;
      arr[1] = p.y + 0.2;
      arr[2] = p.z;
      arr[3] = p.x;
      arr[4] = p.y + this.heightNow() - 0.2;
      arr[5] = p.z;
    }
    return arr;
  }

  setPath(path, mode = 'run') {
    this.path = path;
    this.pathIdx = path && path.length > 1 ? 1 : 0;
    this.moveMode = mode;
    this.arrived = !path || path.length === 0;
    if (path && path.length) this.moveTarget = path[path.length - 1];
  }

  moveDirect(x, z, mode = 'run') {
    this.path = [{ x: this.pos.x, z: this.pos.z }, { x, z }];
    this.pathIdx = 1;
    this.moveMode = mode;
    this.moveTarget = this.path[1];
    this.arrived = false;
  }

  stop() {
    this.path = null;
    this.arrived = true;
  }

  update(dt, world) {
    if (!this.alive) {
      this.deadT += dt;
      return;
    }
    for (let i = 0; i < this.weapons.length; i++) this.weapons[i].update(dt);
    this.fireT += dt;
    this.throwT += dt;
    if (this.suppression > 0) this.suppression = Math.max(0, this.suppression - dt * (this.cover ? 0.16 : 0.1));
    if (this.mounted) {
      this.pos.copy(this.mounted.pos);
      return;
    }
    if (this.para) {
      this.updateParachute(dt, world);
      return;
    }
    if (this.climb) {
      this.updateClimb(dt, world);
      return;
    }
    this.updateMovement(dt, world);
    this.stanceT = approach(this.stanceT, this.stance, dt * (this.stance > this.stanceT ? 2.8 : 2.2));
  }

  updateMovement(dt, world) {
    const terrain = world.terrain;
    const p = this.pos;
    let want = 0;
    let dirX = 0;
    let dirZ = 0;
    if (this.path && this.pathIdx < this.path.length) {
      let wp = this.path[this.pathIdx];
      let dx = wp.x - p.x;
      let dz = wp.z - p.z;
      let d = Math.hypot(dx, dz);
      const last = this.pathIdx === this.path.length - 1;
      if (d < (last ? 0.5 : 1.8)) {
        this.pathIdx++;
        if (this.pathIdx >= this.path.length) {
          this.path = null;
          this.arrived = true;
        } else {
          wp = this.path[this.pathIdx];
          dx = wp.x - p.x;
          dz = wp.z - p.z;
          d = Math.hypot(dx, dz);
        }
      }
      if (this.path && d > 1e-3) {
        const sp = this.def.speed;
        let base = this.moveMode === 'sprint' ? sp.sprint : this.moveMode === 'walk' ? sp.walk : sp.run;
        if (this.stance === 2) base = sp.crawl;
        else if (this.stance === 1) base = Math.min(base, sp.run * 0.62);
        if (this.wounded) base *= 0.55;
        if (this.roof) base = Math.min(base, 1.4);
        // Uphill is slower.
        const ahead = terrain.heightAt(p.x + (dx / d) * 2, p.z + (dz / d) * 2) - p.y;
        base *= clamp(1 - ahead * 0.12, 0.55, 1.1);
        // Slow down for the final approach.
        if (this.pathIdx === this.path.length - 1) base = Math.min(base, d * 1.8 + 0.4);
        want = base;
        dirX = dx / d;
        dirZ = dz / d;
      }
    }
    let dvx = dirX * want + this.sepX;
    let dvz = dirZ * want + this.sepZ;
    const k = damp(7, dt);
    this.vel.x += (dvx - this.vel.x) * k;
    this.vel.z += (dvz - this.vel.z) * k;
    const sp2 = this.vel.x * this.vel.x + this.vel.z * this.vel.z;
    if (sp2 < 0.0004 && want === 0) {
      this.vel.x = 0;
      this.vel.z = 0;
      this.speed = 0;
    } else {
      let nx = p.x + this.vel.x * dt;
      let nz = p.z + this.vel.z * dt;
      if (this.roof) {
        // Stay on the roof.
        const r = this.roof;
        const c = Math.cos(r.yaw);
        const s = Math.sin(r.yaw);
        let lx = (nx - r.x) * c - (nz - r.z) * s;
        let lz = (nx - r.x) * s + (nz - r.z) * c;
        lx = clamp(lx, -r.hx + 0.6, r.hx - 0.6);
        lz = clamp(lz, -r.hz + 0.6, r.hz - 0.6);
        nx = r.x + lx * c + lz * s;
        nz = r.z - lx * s + lz * c;
      } else {
        const res = world.resolveInfantryCollision(nx, nz, p.x, p.z);
        nx = res.x;
        nz = res.z;
      }
      const moved = Math.hypot(nx - p.x, nz - p.z);
      this.stuckT = want > 0.5 && moved < want * dt * 0.2 ? this.stuckT + dt : 0;
      p.x = nx;
      p.z = nz;
      this.speed = moved / Math.max(dt, 1e-4);
    }
    p.y = this.roof && !this.roof.destroyed ? this.roof.top : terrain.heightAt(p.x, p.z);
    if (this.roof && this.roof.destroyed) this.roof = null;
    // Facing.
    let targetYaw = this.yaw;
    if (this.aiming) targetYaw = this.aimYaw;
    else if (this.speed > 0.4) targetYaw = Math.atan2(this.vel.x, this.vel.z);
    else if (this.faceYaw !== null) targetYaw = this.faceYaw;
    this.yaw = approachAngle(this.yaw, targetYaw, dt * (this.stance === 2 ? 2.2 : 6));
    // Stride length ~1.4 m walking, ~2 m running.
    const stride = this.speed > 2.5 ? 2.1 : 1.4;
    this.animPhase += (this.speed * dt * Math.PI * 2) / stride;
  }

  updateParachute(dt, world) {
    const pa = this.para;
    const p = this.pos;
    pa.t += dt;
    const ground = world.terrain.heightAt(p.x, p.z);
    if (pa.phase === 'fall') {
      this.vel.y -= GRAVITY * dt;
      this.vel.x *= 1 - dt * 0.6;
      this.vel.z *= 1 - dt * 0.6;
      if (pa.t > pa.deployAt) {
        pa.phase = 'canopy';
        pa.t = 0;
        world.emit({ t: 'para_open', unit: this });
      }
    } else {
      // Canopy: steady descent, steer toward the landing point, drift with wind.
      const dx = pa.tx - p.x;
      const dz = pa.tz - p.z;
      const d = Math.hypot(dx, dz) || 1;
      const steer = Math.min(3.2, d * 0.1);
      this.vel.x += ((dx / d) * steer + world.weather.windX * 0.5 - this.vel.x) * damp(1.2, dt);
      this.vel.z += ((dz / d) * steer + world.weather.windZ * 0.5 - this.vel.z) * damp(1.2, dt);
      this.vel.y += (-5.2 - this.vel.y) * damp(2.5, dt);
      this.yaw = approachAngle(this.yaw, Math.atan2(this.vel.x, this.vel.z), dt);
    }
    p.x += this.vel.x * dt;
    p.y += this.vel.y * dt;
    p.z += this.vel.z * dt;
    if (p.y <= ground + 0.05) {
      p.y = ground;
      // Landing in a building or off the map is unhealthy.
      const hardLanding = pa.phase === 'fall' || world.structures.structureAt(p.x, p.z, 0.2);
      this.para = null;
      this.vel.set(0, 0, 0);
      this.stance = 1;
      this.stanceT = 1;
      world.emit({ t: 'para_land', unit: this });
      if (hardLanding) {
        const res = world.resolveInfantryCollision(p.x, p.z, p.x, p.z);
        p.x = res.x;
        p.z = res.z;
        p.y = world.terrain.heightAt(p.x, p.z);
        if (pa.phase === 'fall') world.damageSoldier(this, 200, null, null, false);
      }
    }
  }

  updateClimb(dt, world) {
    const c = this.climb;
    c.t += dt;
    this.hidden = true;
    if (c.t >= c.dur) {
      this.hidden = false;
      this.climb = null;
      if (c.up && !c.s.destroyed) {
        this.roof = c.s;
        this.pos.set(c.x, c.s.top, c.z);
      } else {
        this.roof = null;
        this.pos.set(c.x, world.terrain.heightAt(c.x, c.z), c.z);
      }
      this.stop();
    }
  }
}

// --------------------------------------------------------------- Vehicle

export class Vehicle extends Unit {
  constructor(def, faction, x, y, z) {
    super(def, faction, x, y, z);
    this.spec = VEHICLE_SPECS[this.type];
    this.quat = new Quaternion();
    this.pitch = 0;
    this.roll = 0;
    this.speed = 0;
    this.turretYaw = 0;
    this.gunPitch = 0;
    this.radarYaw = 0;
    this.path = null;
    this.pathIdx = 0;
    this.moveTarget = null;
    this.arrived = true;
    this.speedFactor = 1;
    this.faceYaw = null;
    this.reverse = false;
    this.passengers = [];
    this.smokeCharges = this.def.smoke || 0;
    this.burning = 0;
    this.fireT = 0;
    this.mobilityKill = false;
    this.firepowerKill = false;
    this.wreck = false;
    this.catastrophic = false;
    this.turretOff = null; // detached turret physics after an ammo explosion
    this.crew = this.def.crew || 3;
    this.dust = 0;
    this.engine = 0;
    this.stuckT = 0;
    this.lastSmoke = -100;
    this.aimTarget = null; // world point the turret tracks
    this.recoilT = 10;
    this.hull = { hx: this.spec.width / 2, hz: this.spec.length / 2, h: this.spec.height };
    this.radius = Math.hypot(this.hull.hx, this.hull.hz);
  }

  get canMove() {
    return !this.mobilityKill && !this.wreck;
  }

  eyePos(out) {
    return out.set(this.pos.x, this.pos.y + this.spec.height + 0.3, this.pos.z);
  }

  centerPos(out) {
    return out.set(this.pos.x, this.pos.y + this.spec.height * 0.55, this.pos.z);
  }

  // Transform a point from gun space (mount 'gun' etc.) to world.
  mountPoint(mount, out, extraZ = 0) {
    const s = this.spec;
    let x = 0;
    let y = 0;
    let z = 0;
    let inGun = true;
    let inTurret = true;
    if (mount === 'gun') {
      z = s.barrelLength + extraZ;
    } else if (mount === 'gun2') {
      x = -(s.twinGunOffsetX || 0);
      z = s.barrelLength;
    } else if (mount === 'gun1') {
      x = s.twinGunOffsetX || 0;
      z = s.barrelLength;
    } else if (mount === 'coax') {
      const c = s.coaxOffset || [0.3, 0, 0.5];
      x = c[0];
      y = c[1];
      z = c[2] + 0.3;
    } else if (mount === 'roof') {
      inGun = false;
      const r = s.roofMgPivot || [0, 0.9, 0];
      x = r[0];
      y = r[1] + 0.15;
      z = r[2] + 1.0;
    } else if (mount === 'atgm') {
      inGun = false;
      const r = s.atgmLauncher || [0.9, 0.5, 0];
      x = r[0];
      y = r[1];
      z = r[2] + 0.6;
    } else if (mount === 'turret') {
      inGun = false;
      y = 1.6;
      z = 0.2;
    } else if (mount === 'tube') {
      // MLRS: pick a tube mouth on the pod face.
      const tb = s.tubes;
      const i = Math.floor(extraZ) % (tb.cols * tb.rows);
      x = ((i % tb.cols) - (tb.cols - 1) / 2) * tb.spacing;
      y = (Math.floor(i / tb.cols) - (tb.rows - 1) / 2) * tb.spacing + s.podSize[1] / 2;
      z = s.podSize[2];
    } else {
      inGun = false;
      inTurret = false;
      y = s.height;
    }
    // gun -> turret
    if (inGun) {
      const cp = Math.cos(this.gunPitch);
      const sp = Math.sin(this.gunPitch);
      const ny = y * cp + z * sp;
      const nz = -y * sp + z * cp;
      x += s.gunPivot[0];
      y = ny + s.gunPivot[1];
      z = nz + s.gunPivot[2];
    }
    // turret -> hull
    if (inTurret) {
      const cy = Math.cos(this.turretYaw);
      const sy = Math.sin(this.turretYaw);
      const nx = x * cy + z * sy;
      const nz = -x * sy + z * cy;
      x = nx + s.turretPivot[0];
      y = y + s.turretPivot[1];
      z = nz + s.turretPivot[2];
    }
    out.set(x, y, z).applyQuaternion(this.quat).add(this.pos);
    return out;
  }

  // World direction of the gun barrel.
  gunDir(out) {
    const cp = Math.cos(this.gunPitch);
    const sp = Math.sin(this.gunPitch);
    const cy = Math.cos(this.turretYaw);
    const sy = Math.sin(this.turretYaw);
    out.set(sy * cp, sp, cy * cp).applyQuaternion(this.quat);
    return out;
  }

  // Turret yaw (relative to hull) and gun elevation needed to point at a world
  // point, ignoring ballistic drop. Returns [yaw, pitch, distance].
  aimAngles(px, py, pz, out) {
    _q.copy(this.quat).invert();
    const s = this.spec;
    _v.set(px - this.pos.x, py - this.pos.y, pz - this.pos.z).applyQuaternion(_q);
    _v.x -= s.turretPivot[0];
    _v.y -= s.turretPivot[1] + s.gunPivot[1];
    _v.z -= s.turretPivot[2];
    const hd = Math.hypot(_v.x, _v.z);
    out[0] = Math.atan2(_v.x, _v.z);
    out[1] = Math.atan2(_v.y, hd);
    out[2] = hd;
    return out;
  }

  setPath(path, speedFactor = 1) {
    this.path = path;
    this.pathIdx = path && path.length > 1 ? 1 : 0;
    this.speedFactor = speedFactor;
    this.arrived = !path || path.length === 0;
    if (path && path.length) this.moveTarget = path[path.length - 1];
    this.reverse = false;
  }

  stop() {
    this.path = null;
    this.arrived = true;
  }

  update(dt, world) {
    if (!this.alive) return this.updateWreck(dt, world);
    for (let i = 0; i < this.weapons.length; i++) this.weapons[i].update(dt);
    this.recoilT += dt;
    if (this.def.radar) this.radarYaw = wrapAngle(this.radarYaw + dt * 3.2);
    if (this.burning > 0) world.updateBurning(this, dt);
    if (!this.alive) return;
    this.updateMovement(dt, world);
    this.updateTurret(dt);
  }

  updateTurret(dt) {
    if (this.firepowerKill) return;
    const rate = this.def.turretRate;
    let ty = 0;
    let tp = 0;
    if (this.aimTarget) {
      const a = this.aimAngles(this.aimTarget.x, this.aimTarget.y, this.aimTarget.z, _aim);
      ty = a[0];
      tp = a[1] + (this.aimTarget.loft || 0);
    } else if (this.speed > 2) {
      ty = 0;
      tp = 0;
    } else {
      ty = this.turretYaw;
      tp = this.gunPitch * 0.98;
    }
    const el = this.def.elev;
    tp = clamp(tp, el[0], el[1]);
    this.turretYaw = approachAngle(this.turretYaw, ty, rate * dt);
    this.gunPitch = approach(this.gunPitch, tp, rate * 0.6 * dt);
  }

  // How well the gun currently points at the aim target (radians of error).
  aimError() {
    if (!this.aimTarget) return Math.PI;
    const a = this.aimAngles(this.aimTarget.x, this.aimTarget.y, this.aimTarget.z, _aim);
    const ey = Math.abs(angleDiff(this.turretYaw, a[0]));
    const ep = Math.abs(clamp(a[1] + (this.aimTarget.loft || 0), this.def.elev[0], this.def.elev[1]) - this.gunPitch);
    return Math.max(ey, ep);
  }

  updateMovement(dt, world) {
    const def = this.def;
    const terrain = world.terrain;
    const p = this.pos;
    let targetSpeed = 0;
    let yawRate = 0;
    const tracked = this.spec.kind === 'tracked';
    if (this.canMove && this.path && this.pathIdx < this.path.length) {
      let wp = this.path[this.pathIdx];
      let dx = wp.x - p.x;
      let dz = wp.z - p.z;
      let d = Math.hypot(dx, dz);
      const last = this.pathIdx === this.path.length - 1;
      if (!last && d < 7) {
        this.pathIdx++;
        wp = this.path[this.pathIdx];
        dx = wp.x - p.x;
        dz = wp.z - p.z;
        d = Math.hypot(dx, dz);
      }
      if (this.pathIdx === this.path.length - 1 && d < 2.5) {
        this.path = null;
        this.arrived = true;
      } else {
        const desired = Math.atan2(dx, dz);
        let err = angleDiff(this.yaw, desired);
        // Reverse to nearby targets behind us instead of a three-point turn.
        const back = Math.abs(err) > 2.2 && d < 30;
        this.reverse = back;
        if (back) err = angleDiff(this.yaw, wrapAngle(desired + Math.PI));
        const onRoad = terrain.materialAt(p.x, p.z) === MAT.ROAD;
        const vmax = back ? def.speed.reverse : onRoad ? def.speed.road : def.speed.offroad;
        targetSpeed = vmax * this.speedFactor * (1 - Math.min(1, Math.abs(err) / 1.1) * 0.75);
        if (this.pathIdx === this.path.length - 1) targetSpeed = Math.min(targetSpeed, d * 0.5 + 1);
        if (back) targetSpeed = -targetSpeed;
        yawRate = clamp(err * 1.8, -def.turnRate, def.turnRate);
      }
    } else if (this.canMove && this.faceYaw !== null && tracked) {
      yawRate = clamp(angleDiff(this.yaw, this.faceYaw) * 1.5, -def.turnRate * 0.6, def.turnRate * 0.6);
      if (Math.abs(yawRate) < 0.01) yawRate = 0;
    }
    if (!tracked) yawRate *= clamp(Math.abs(this.speed) / 5, 0, 1) * Math.sign(this.speed || 1);
    // Avoid other vehicles ahead.
    if (targetSpeed !== 0) {
      const fx = Math.sin(this.yaw) * Math.sign(targetSpeed);
      const fz = Math.cos(this.yaw) * Math.sign(targetSpeed);
      world.unitGrid.queryRadius(p.x + fx * 8, p.z + fz * 8, 7, _near);
      for (let i = 0; i < _near.length; i++) {
        const o = _near[i];
        if (o === this || o.cat !== 'veh') continue;
        const ox = o.pos.x - p.x;
        const oz = o.pos.z - p.z;
        const ahead = ox * fx + oz * fz;
        if (ahead > 0 && ahead < 14) {
          const lat = ox * fz - oz * fx;
          if (Math.abs(lat) < 4.5) {
            targetSpeed *= o.alive && o.speed > 1 && o.faction === this.faction ? 0.5 : 0.2;
            yawRate += (lat > 0 ? -0.35 : 0.35) * Math.sign(targetSpeed || 1);
          }
        }
      }
    }
    const accel = def.accel * (Math.abs(targetSpeed) < Math.abs(this.speed) ? 2.2 : 1);
    this.speed = approach(this.speed, targetSpeed, accel * dt);
    this.yaw = wrapAngle(this.yaw + yawRate * dt);
    const fwx = Math.sin(this.yaw);
    const fwz = Math.cos(this.yaw);
    let nx = p.x + fwx * this.speed * dt;
    let nz = p.z + fwz * this.speed * dt;
    if (Math.abs(this.speed) > 0.05) {
      const res = world.resolveVehicleCollision(this, nx, nz);
      if (res.blocked) this.speed *= 0.4;
      nx = res.x;
      nz = res.z;
      if (tracked) world.crushAt(this, nx, nz);
    }
    const moved = Math.hypot(nx - p.x, nz - p.z);
    this.stuckT = Math.abs(targetSpeed) > 1 && moved < Math.abs(targetSpeed) * dt * 0.15 ? this.stuckT + dt : Math.max(0, this.stuckT - dt);
    p.x = clamp(nx, -terrain.half + 20, terrain.half - 20);
    p.z = clamp(nz, -terrain.half + 20, terrain.half - 20);
    this.conformToTerrain(terrain, dt);
    this.vel.set(fwx * this.speed, 0, fwz * this.speed);
    const m = terrain.materialAt(p.x, p.z);
    this.dust = Math.abs(this.speed) > 3 && m !== MAT.ROAD && m !== MAT.CONCRETE ? Math.min(1, Math.abs(this.speed) / 12) : 0;
    this.engine = approach(this.engine, 0.25 + Math.min(1, Math.abs(targetSpeed) / 10) * 0.75, dt);
  }

  conformToTerrain(terrain, dt) {
    const p = this.pos;
    const s = this.spec;
    const fx = Math.sin(this.yaw);
    const fz = Math.cos(this.yaw);
    const hl = s.length * 0.42;
    const hw = s.width * 0.42;
    const hf = terrain.heightAt(p.x + fx * hl, p.z + fz * hl);
    const hb = terrain.heightAt(p.x - fx * hl, p.z - fz * hl);
    const hL = terrain.heightAt(p.x + fz * hw, p.z - fx * hw);
    const hR = terrain.heightAt(p.x - fz * hw, p.z + fx * hw);
    const pitch = Math.atan2(hf - hb, hl * 2);
    const roll = Math.atan2(hL - hR, hw * 2);
    const k = dt > 0 ? damp(8, dt) : 1;
    this.pitch += (pitch - this.pitch) * k;
    this.roll += (roll - this.roll) * k;
    const target = Math.max((hf + hb + hL + hR) / 4, terrain.heightAt(p.x, p.z) - 0.25);
    p.y += (target - p.y) * (dt > 0 ? damp(12, dt) : 1);
    _e.set(-this.pitch, this.yaw, this.roll, 'YXZ');
    this.quat.setFromEuler(_e);
  }

  updateWreck(dt, world) {
    this.deadT = (this.deadT || 0) + dt;
    if (this.burning > 0) {
      this.burning -= dt;
      if (this.burning < 0) this.burning = 0;
    }
    const t = this.turretOff;
    if (t && !t.rest) {
      t.vel.y -= GRAVITY * dt;
      t.pos.addScaledVector(t.vel, dt);
      _q.setFromAxisAngle(t.axis, t.spin * dt);
      t.quat.premultiply(_q);
      const g = world.terrain.heightAt(t.pos.x, t.pos.z);
      if (t.pos.y < g + 0.4 && t.vel.y < 0) {
        t.pos.y = g + 0.4;
        if (Math.abs(t.vel.y) < 3) {
          t.rest = true;
        } else {
          t.vel.y *= -0.25;
          t.vel.x *= 0.5;
          t.vel.z *= 0.5;
          t.spin *= 0.4;
          world.emit({ t: 'impact', kind: 'metal_heavy', x: t.pos.x, y: g, z: t.pos.z, size: 1.5 });
        }
      }
    }
  }
}

const _aim = [0, 0, 0];

// --------------------------------------------------------------- Aircraft

export class Aircraft extends Unit {
  constructor(def, faction, x, y, z) {
    super(def, faction, x, y, z);
    this.spec = AIRCRAFT_SPECS[this.type];
    this.aclass = this.def.aclass;
    this.quat = new Quaternion();
    this.pitch = 0;
    this.roll = 0;
    this.speed = 0;
    this.goal = new Vector3(x, y, z);
    this.goalSpeed = this.def.speed.cruise;
    this.faceTarget = null; // helicopters: point to face while hovering/strafing
    this.flares = this.def.flares || 0;
    this.lastFlare = -100;
    this.crashing = false;
    this.crashSpin = 0;
    this.rotor = rng.range(0, 6.28);
    this.passengers = [];
    this.throttle = 0.6;
    this.minAGL = this.aclass === 'drone' ? 2 : this.aclass === 'heli' ? 12 : this.aclass === 'uav' ? 150 : 140;
    this.landed = false;
    this.landing = false;
    this.leaving = false;
    this.radius = this.spec.radius;
    this.smoking = 0;
    this.gunYaw = 0;
    this.gunPitch = 0;
    this.podIdx = 0;
    this.battery = this.def.battery || 0;
    this.operator = null;
    this.diveTarget = null;
  }

  eyePos(out) {
    return out.copy(this.pos);
  }

  centerPos(out) {
    return out.copy(this.pos);
  }

  mountPoint(mount, out) {
    const s = this.spec;
    let m = null;
    if (mount === 'chin') m = s.gunPivot;
    else if (mount === 'gun') m = s.gun;
    else if (mount === 'pods') m = s.rocketPods[this.podIdx++ % 2];
    else if (mount === 'rails') m = s.missileRails[this.podIdx++ % 2];
    else if (mount === 'pylon') m = s.pylons[this.podIdx++ % s.pylons.length];
    else if (mount === 'door0') m = s.doorGuns[0];
    else if (mount === 'door1') m = s.doorGuns[1];
    if (!m) return out.copy(this.pos);
    return out.set(m[0], m[1], m[2]).applyQuaternion(this.quat).add(this.pos);
  }

  forward3(out) {
    return out.set(0, 0, 1).applyQuaternion(this.quat);
  }

  update(dt, world) {
    if (!this.alive) return;
    for (let i = 0; i < this.weapons.length; i++) this.weapons[i].update(dt);
    this.rotor += dt * (this.crashing ? 18 : 30);
    if (this.crashing) return this.updateCrash(dt, world);
    if (this.aclass === 'heli' || this.aclass === 'drone') this.updateRotorcraft(dt, world);
    else this.updateFixedWing(dt, world);
    if (this.battery > 0) {
      this.battery -= dt;
      if (this.battery <= 0) world.destroyAircraft(this, null, null, 'battery');
    }
  }

  groundClearance(world, x, z) {
    // Highest of terrain and structure tops near the point.
    let h = world.terrain.heightAt(x, z);
    if (this.aclass !== 'drone') {
      const ahead = world.terrain.heightAt(x + this.vel.x * 2, z + this.vel.z * 2);
      h = Math.max(h, ahead);
    }
    return h;
  }

  updateRotorcraft(dt, world) {
    const p = this.pos;
    const isDrone = this.aclass === 'drone';
    const ground = this.groundClearance(world, p.x, p.z);
    if (this.landed) {
      this.vel.set(0, 0, 0);
      this.speed = 0;
      p.y = ground + (this.spec.skidHeight || 1.2);
      this.throttle = approach(this.throttle, 0.45, dt);
      this.quatFromAngles(0, 0, dt);
      return;
    }
    const gx = this.goal.x - p.x;
    const gz = this.goal.z - p.z;
    const hd = Math.hypot(gx, gz);
    const maxS = this.goalSpeed;
    const sp = Math.min(maxS, hd * (isDrone ? 1.4 : 0.45));
    let dvx = hd > 0.1 ? (gx / hd) * sp : 0;
    let dvz = hd > 0.1 ? (gz / hd) * sp : 0;
    // Altitude: hold goal height but never below the minimum clearance.
    const minY = ground + (this.landing ? 0 : this.minAGL);
    const gy = Math.max(this.goal.y, minY);
    let dvy = clamp((gy - p.y) * (isDrone ? 2.5 : 0.8), -9, isDrone ? 14 : 10);
    if (p.y < minY && !this.landing) dvy = Math.max(dvy, 6);
    const a = this.def.accel;
    const k = Math.min(1, (a * dt) / Math.max(1, Math.hypot(dvx - this.vel.x, dvz - this.vel.z)));
    const ax = (dvx - this.vel.x) * k;
    const az = (dvz - this.vel.z) * k;
    this.vel.x += ax;
    this.vel.z += az;
    this.vel.y += (dvy - this.vel.y) * damp(isDrone ? 4 : 1.6, dt);
    p.addScaledVector(this.vel, dt);
    const ng = world.terrain.heightAt(p.x, p.z);
    if (p.y < ng + 0.5) {
      if (isDrone) {
        world.droneImpact(this);
        return;
      }
      p.y = ng + 0.5;
      this.vel.y = Math.max(0, this.vel.y);
    }
    this.speed = Math.hypot(this.vel.x, this.vel.z);
    // Facing: a target if strafing, otherwise the direction of travel.
    let wantYaw = this.yaw;
    if (this.faceTarget) wantYaw = Math.atan2(this.faceTarget.x - p.x, this.faceTarget.z - p.z);
    else if (this.speed > 4) wantYaw = Math.atan2(this.vel.x, this.vel.z);
    this.yaw = approachAngle(this.yaw, wantYaw, dt * this.def.turnRate * (isDrone ? 1.5 : 1));
    // Attitude from acceleration and speed: nose down when moving forward.
    const fx = Math.sin(this.yaw);
    const fz = Math.cos(this.yaw);
    const vf = this.vel.x * fx + this.vel.z * fz;
    const vr = this.vel.x * -fz + this.vel.z * fx;
    const af = (ax * fx + az * fz) / Math.max(dt, 1e-3);
    const ar = (ax * -fz + az * fx) / Math.max(dt, 1e-3);
    const tilt = isDrone ? 0.022 : 0.0045;
    const pitch = clamp(-vf * tilt - af * (isDrone ? 0.02 : 0.012), -0.6, 0.35);
    const roll = clamp(-vr * tilt * 0.8 - ar * (isDrone ? 0.02 : 0.01), -0.7, 0.7);
    this.quatFromAngles(pitch, roll, dt);
    this.throttle = clamp(0.5 + Math.hypot(ax, az) / Math.max(dt, 1e-3) / (a * 2) + this.speed / (maxS * 3) + Math.max(0, dvy) / 20, 0.3, 1);
  }

  quatFromAngles(pitch, roll, dt) {
    const k = damp(4, dt);
    this.pitch += (pitch - this.pitch) * k;
    this.roll += (roll - this.roll) * k;
    _e.set(-this.pitch, this.yaw, this.roll, 'YXZ');
    this.quat.setFromEuler(_e);
  }

  updateFixedWing(dt, world) {
    const p = this.pos;
    const def = this.def;
    this.speed = approach(this.speed, this.goalSpeed, def.accel * dt);
    // Desired direction toward the goal.
    _v.subVectors(this.goal, p);
    const ground = world.terrain.heightAt(p.x, p.z);
    const look = world.terrain.heightAt(p.x + this.vel.x * 3, p.z + this.vel.z * 3);
    const minY = Math.max(ground, look) + this.minAGL * (this.attackRun ? 0.35 : 1);
    if (p.y + _v.y < minY) _v.y = minY - p.y;
    _v.normalize();
    // Current forward.
    _v2.set(Math.sin(this.yaw) * Math.cos(this.pitch), Math.sin(this.pitch), Math.cos(this.yaw) * Math.cos(this.pitch));
    const wantYaw = Math.atan2(_v.x, _v.z);
    const wantPitch = clamp(Math.asin(clamp(_v.y, -1, 1)), -0.6, 0.6);
    const yawErr = angleDiff(this.yaw, wantYaw);
    const yawRate = clamp(yawErr * 1.2, -def.turnRate, def.turnRate);
    this.yaw = wrapAngle(this.yaw + yawRate * dt);
    let pitchTarget = wantPitch;
    if (p.y < minY) pitchTarget = Math.max(pitchTarget, 0.25);
    this.pitch = approach(this.pitch, pitchTarget, dt * def.turnRate * 0.8);
    // Coordinated turn bank angle.
    const bank = clamp(Math.atan((this.speed * yawRate) / GRAVITY), -1.25, 1.25);
    this.roll += (bank - this.roll) * damp(3, dt);
    const cp = Math.cos(this.pitch);
    this.vel.set(Math.sin(this.yaw) * cp * this.speed, Math.sin(this.pitch) * this.speed, Math.cos(this.yaw) * cp * this.speed);
    p.addScaledVector(this.vel, dt);
    if (p.y < world.terrain.heightAt(p.x, p.z) + 3) {
      world.destroyAircraft(this, null, null, 'terrain');
      return;
    }
    _e.set(-this.pitch, this.yaw, this.roll, 'YXZ');
    this.quat.setFromEuler(_e);
    this.throttle = clamp(0.55 + (this.goalSpeed - this.speed) / 60 + Math.max(0, this.pitch), 0.4, 1);
  }

  updateCrash(dt, world) {
    const p = this.pos;
    this.vel.y -= GRAVITY * dt * (this.aclass === 'heli' ? 0.8 : 1);
    this.vel.x *= 1 - dt * 0.15;
    this.vel.z *= 1 - dt * 0.15;
    p.addScaledVector(this.vel, dt);
    this.yaw = wrapAngle(this.yaw + this.crashSpin * dt);
    if (this.aclass === 'heli') {
      this.roll += dt * 0.6;
      this.pitch = approach(this.pitch, -0.4, dt * 0.3);
    } else {
      this.roll += dt * this.crashSpin * 0.8;
      this.pitch = Math.max(-1.2, this.pitch - dt * 0.35);
    }
    _e.set(-this.pitch, this.yaw, this.roll, 'YXZ');
    this.quat.setFromEuler(_e);
    const g = world.terrain.heightAt(p.x, p.z);
    if (p.y <= g + 1.5 || !world.terrain.inBounds(p.x, p.z, -400)) world.aircraftImpact(this);
  }
}
