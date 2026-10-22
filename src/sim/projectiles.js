// Projectile simulation: integration (gravity, quadratic drag, rocket thrust,
// guidance), continuous collision against units, structures and terrain,
// near-miss suppression, flyby detection for audio, and hit dispatch to the
// damage model.

import { segSegClosest, segOBB, raySphere, segClosestT, clamp, GRAVITY } from '../core/math.js';
import { rng } from '../core/rng.js';
import { hitSoldier, hitVehicle, hitAircraft, hitStructure, explode } from './damage.js';

const _cand = [];
const _body = [0, 0, 0, 0, 0, 0];
const _hit = { structure: null, t: 0, nx: 0, ny: 0, nz: 0 };

export class Projectile {
  constructor() {
    this.active = false;
    this.id = 0;
  }
}

export class ProjectileSystem {
  constructor(world) {
    this.world = world;
    this.pool = [];
    this.active = [];
    this.nextId = 1;
    this.spawned = 0;
  }

  spawn(o) {
    const p = this.pool.pop() || new Projectile();
    const def = o.def;
    const ap = o.ap || def;
    p.active = true;
    p.id = this.nextId++;
    p.kind = o.kind || def.kind;
    p.def = def;
    p.ap = ap;
    p.owner = o.owner || null;
    p.faction = o.faction ?? (o.owner ? o.owner.faction : -1);
    p.x = p.px = p.ox = o.x;
    p.y = p.py = p.oy = o.y;
    p.z = p.pz = p.oz = o.z;
    p.vx = o.vx;
    p.vy = o.vy;
    p.vz = o.vz;
    p.age = 0;
    p.life = o.life ?? def.life ?? (p.kind === 'bullet' ? 4.5 : p.kind === 'shell' ? 6 : p.kind === 'grenade' ? 12 : p.kind === 'artillery' ? 90 : p.kind === 'bomb' ? 40 : p.kind === 'flare' ? 6 : 15);
    p.drag = ap.drag ?? def.drag ?? 0;
    p.gravity = o.gravity ?? (p.kind === 'missile' ? 0.15 : 1);
    p.thrustT = def.thrust && !o.noThrust ? def.thrust.burn : 0;
    p.accel = def.thrust ? def.thrust.accel : 0;
    p.sustain = def.thrust ? def.thrust.sustain : 0;
    p.maxSpeed = def.maxSpeed || 0;
    p.fuse = o.fuse ?? def.fuse ?? 0;
    p.armDist = def.impact ? 22 : 0;
    p.dist = 0;
    p.ricochet = false;
    p.flyby = false;
    p.whistleAt = o.whistleAt ?? -1;
    p.target = o.target || null;
    p.targetPoint = o.targetPoint || null;
    p.ignore = o.ignore || null;
    p.decoy = null;
    p.phase = 0;
    p.tracer = !!o.tracer;
    p.visual = o.visual || (p.tracer ? 'tracer' : p.kind);
    p.bounces = 0;
    p.launcher = o.launcher || null;
    p.loft = def.loft || def.topAttack || false;
    p.cruiseAlt = o.cruiseAlt || 0;
    this.active.push(p);
    this.spawned++;
    return p;
  }

  remove(i) {
    const p = this.active[i];
    p.active = false;
    const last = this.active.pop();
    if (i < this.active.length) this.active[i] = last;
    this.pool.push(p);
  }

  update(dt) {
    const world = this.world;
    for (let i = this.active.length - 1; i >= 0; i--) {
      const p = this.active[i];
      if (!p.active) {
        this.remove(i);
        continue;
      }
      p.age += dt;
      if (p.age > p.life) {
        if (p.def.explosive && (p.kind === 'missile' || p.kind === 'rocket' || p.kind === 'grenade')) {
          explode(world, p.x, p.y, p.z, p.def.explosive, p.owner, p.faction, p.def, { air: p.y > world.terrain.heightAt(p.x, p.z) + 3 });
        }
        this.remove(i);
        continue;
      }
      if (this.step(p, dt)) this.remove(i);
    }
  }

  // Returns true when the projectile is finished.
  step(p, dt) {
    const world = this.world;
    if (p.kind === 'missile') this.guide(p, dt);
    // Motor.
    if (p.thrustT > 0 || p.sustain > 0) {
      const sp = Math.hypot(p.vx, p.vy, p.vz) || 1;
      let a = 0;
      if (p.thrustT > 0) {
        p.thrustT -= dt;
        a = p.accel;
      } else if (p.sustain > 0 && p.kind === 'missile' && sp < p.maxSpeed) {
        a = p.sustain;
      }
      if (a > 0 && (!p.maxSpeed || sp < p.maxSpeed)) {
        const k = (a * dt) / sp;
        p.vx += p.vx * k;
        p.vy += p.vy * k;
        p.vz += p.vz * k;
      }
    }
    p.vy -= GRAVITY * p.gravity * dt;
    if (p.drag > 0) {
      const sp = Math.hypot(p.vx, p.vy, p.vz);
      const k = Math.max(0.3, 1 - p.drag * sp * dt);
      p.vx *= k;
      p.vy *= k;
      p.vz *= k;
    }
    p.px = p.x;
    p.py = p.y;
    p.pz = p.z;
    p.x += p.vx * dt;
    p.y += p.vy * dt;
    p.z += p.vz * dt;
    const segLen = Math.hypot(p.x - p.px, p.y - p.py, p.z - p.pz);
    p.dist += segLen;

    // Incoming whistle for artillery / bombs, timed before impact.
    if (p.whistleAt > 0 && p.age >= p.whistleAt) {
      p.whistleAt = -1;
      world.emit({ t: 'incoming', kind: p.kind, x: p.targetPoint ? p.targetPoint.x : p.x, y: p.targetPoint ? p.targetPoint.y : p.y, z: p.targetPoint ? p.targetPoint.z : p.z });
    }

    // Flyby past the camera.
    if (!p.flyby && world.listener && p.kind !== 'grenade' && p.kind !== 'flare' && segLen > 0) {
      const L = world.listener;
      const t = segClosestT(p.px, p.py, p.pz, p.x, p.y, p.z, L.x, L.y, L.z);
      const cx = p.px + (p.x - p.px) * t;
      const cy = p.py + (p.y - p.py) * t;
      const cz = p.pz + (p.z - p.pz) * t;
      const d = Math.hypot(cx - L.x, cy - L.y, cz - L.z);
      if (d < (p.kind === 'bullet' ? 7 : 25) && p.dist > 15) {
        p.flyby = true;
        const big = p.kind !== 'bullet' || (p.ap.pen || 0) > 20;
        world.emit({ t: 'flyby', kind: p.kind === 'bullet' ? (big ? 'heavy' : 'bullet') : p.kind === 'rocket' || p.kind === 'missile' ? 'rocket' : 'shell', x: cx, y: cy, z: cz, speed: segLen / dt, dist: d });
      }
    }

    if (p.kind === 'flare') return false;

    // ---- collision
    let bestT = 2;
    let hitUnit = null;
    let hitInfo = 0;
    const minY = Math.min(p.py, p.y);
    const maxY = Math.max(p.py, p.y);
    const canHitUnits = !p.ricochet || p.kind !== 'bullet';
    const sameFactionSafe = p.dist < 40;
    world.unitGrid.querySegment(p.px, p.pz, p.x, p.z, 8, _cand);
    const suppress = p.kind === 'bullet' && !p.ricochet && p.def.suppression > 0;
    for (let k = 0; k < _cand.length; k++) {
      const u = _cand[k];
      if (!u.alive || u === p.owner || u === p.ignore || u.hidden) continue;
      if (u.faction === p.faction && sameFactionSafe) continue;
      if (u.cat === 'inf') {
        if (maxY < u.pos.y - 0.5 || minY > u.pos.y + 2.5) continue;
        u.bodySegment(_body);
        const r = segSegClosest(p.px, p.py, p.pz, p.x, p.y, p.z, _body[0], _body[1], _body[2], _body[3], _body[4], _body[5]);
        const rad = 0.3;
        if (canHitUnits && r.d2 < rad * rad && r.s < bestT) {
          if (u.faction === p.faction && rng.chance(0.75)) continue;
          bestT = r.s;
          hitUnit = u;
          hitInfo = r.t; // position along the body axis (0 feet .. 1 head)
        } else if (suppress && u.faction !== p.faction && r.d2 < 16) {
          const d = Math.sqrt(r.d2);
          u.suppression = Math.min(1, u.suppression + p.def.suppression * (1 - d / 4) * (u.cover ? 0.55 : 1) / Math.max(0.6, u.skill));
          u.lastShotAt = world.time;
          u.threatSource = p.owner;
        }
      } else if (u.cat === 'veh') {
        if (!canHitUnits) continue;
        const s = u.spec;
        if (minY > u.pos.y + s.height + 1 || maxY < u.pos.y - 1) continue;
        const h = segOBB(p.px, p.py, p.pz, p.x - p.px, p.y - p.py, p.z - p.pz, u.pos.x, u.pos.y + s.height * 0.5, u.pos.z, s.width * 0.5, s.height * 0.5, s.length * 0.5, u.yaw);
        if (h && h.t < bestT) {
          bestT = h.t;
          hitUnit = u;
          hitInfo = h.axis * 2 + (h.sign > 0 ? 1 : 0);
        }
        if (suppress && u.faction !== p.faction) u.lastShotAt = world.time;
      } else if (u.cat === 'air') {
        if (!canHitUnits) continue;
        const rad = u.aclass === 'drone' ? 0.45 : u.aclass === 'heli' ? u.radius * 0.5 : u.radius * 0.42;
        const t = raySphere(p.px, p.py, p.pz, p.x - p.px, p.y - p.py, p.z - p.pz, u.pos.x, u.pos.y, u.pos.z, rad, 1);
        if (t >= 0 && t < bestT) {
          bestT = t;
          hitUnit = u;
        }
        // Proximity fuse against aircraft.
        if (p.def.proximity && !hitUnit && u.faction !== p.faction && (p.def.antiAir || p.def.twin)) {
          const tt = segClosestT(p.px, p.py, p.pz, p.x, p.y, p.z, u.pos.x, u.pos.y, u.pos.z);
          const cx = p.px + (p.x - p.px) * tt;
          const cy = p.py + (p.y - p.py) * tt;
          const cz = p.pz + (p.z - p.pz) * tt;
          const d = Math.hypot(cx - u.pos.x, cy - u.pos.y, cz - u.pos.z);
          const fuseR = p.def.proximity * (u.aclass === 'drone' ? 0.6 : 1);
          if (d < fuseR && tt < bestT && (p.kind === 'missile' ? p.target === u || !p.target : true)) {
            bestT = tt;
            hitUnit = u;
            hitInfo = -1; // proximity detonation
          }
        }
      }
    }
    // Structures.
    let hitStruct = null;
    if (world.structures.segmentHit(p.px, p.py, p.pz, p.x, p.y, p.z, _hit, null) && _hit.t < bestT) {
      const s = _hit.structure;
      // Soft cover lets some rounds through.
      const stop = s.type === 'hedge' ? 0.25 : s.type === 'fence' ? 0.15 : s.type === 'crates' ? 0.6 : s.type === 'car' ? (p.ap.pen > 20 ? 0.3 : 0.75) : 1;
      if (p.kind !== 'bullet' || rng.next() < stop) {
        bestT = _hit.t;
        hitStruct = s;
        hitUnit = null;
      }
    }
    // Terrain.
    let hitGround = false;
    if (minY < world.terrain.maxHeight + 2) {
      const t = world.terrain.segmentHit(p.px, p.py, p.pz, p.x, p.y, p.z, segLen > 20 ? 4 : 2);
      if (t >= 0 && t < bestT) {
        bestT = t;
        hitGround = true;
        hitUnit = null;
        hitStruct = null;
      }
    }
    if (bestT > 1) {
      // Out of bounds.
      if (Math.abs(p.x) > 2600 || Math.abs(p.z) > 2600 || p.y < -200 || p.y > 4000) return true;
      // Fused grenades in flight (airburst / timed).
      if (p.kind === 'grenade' && p.fuse > 0 && p.age >= p.fuse) {
        explode(world, p.x, p.y, p.z, p.def.explosive, p.owner, p.faction, p.def, {});
        return true;
      }
      return false;
    }
    const hx = p.px + (p.x - p.px) * bestT;
    const hy = p.py + (p.y - p.py) * bestT;
    const hz = p.pz + (p.z - p.pz) * bestT;

    if (hitUnit) {
      if (hitUnit.cat === 'inf') return hitSoldier(world, hitUnit, p, hx, hy, hz, hitInfo);
      if (hitUnit.cat === 'veh') return hitVehicle(world, hitUnit, p, hx, hy, hz, hitInfo);
      return hitAircraft(world, hitUnit, p, hx, hy, hz, hitInfo === -1);
    }
    if (hitStruct) return hitStructure(world, hitStruct, p, hx, hy, hz, _hit.nx, _hit.ny, _hit.nz);
    if (hitGround) return this.hitGround(p, hx, hy, hz);
    return false;
  }

  hitGround(p, x, y, z) {
    const world = this.world;
    const def = p.def;
    // Hand grenades bounce and roll until the fuse burns down.
    if (p.kind === 'grenade' && p.fuse > 0) {
      if (p.age < p.fuse) {
        const n = world.terrain.normalAt(x, z, { x: 0, y: 0, z: 0 });
        const dot = p.vx * n.x + p.vy * n.y + p.vz * n.z;
        p.vx = (p.vx - 2 * dot * n.x) * 0.35;
        p.vy = (p.vy - 2 * dot * n.y) * 0.3;
        p.vz = (p.vz - 2 * dot * n.z) * 0.35;
        p.x = x;
        p.y = y + 0.08;
        p.z = z;
        if (Math.hypot(p.vx, p.vy, p.vz) < 0.6) {
          p.vx = p.vy = p.vz = 0;
          p.gravity = 0;
        }
        return false;
      }
      explode(world, x, y + 0.1, z, def.explosive, p.owner, p.faction, def, {});
      return true;
    }
    const ex = p.ap.explosive || def.explosive;
    if (ex && (p.dist >= p.armDist || p.kind !== 'grenade')) {
      explode(world, x, y + 0.15, z, ex, p.owner, p.faction, def, { ground: true });
      return true;
    }
    // Kinetic impact.
    const steep = Math.abs(p.vy) / (Math.hypot(p.vx, p.vy, p.vz) || 1);
    const big = (p.ap.pen || 0) > 100 || p.kind === 'shell';
    world.emit({ t: 'impact', kind: world.terrain.isWater(x, z) ? 'water' : 'dirt', x, y, z, size: big ? 2.5 : p.ap.pen > 20 ? 1.2 : 0.6, nx: 0, ny: 1, nz: 0, mat: world.terrain.materialAt(x, z) });
    // Shallow kinetic hits skip off the ground sometimes.
    if (p.kind === 'bullet' && steep < 0.12 && !p.ricochet && rng.chance(0.4)) {
      p.ricochet = true;
      p.vy = Math.abs(p.vy) * rng.range(0.4, 1.2) + rng.range(2, 12);
      p.vx *= 0.55;
      p.vz *= 0.55;
      p.x = x;
      p.y = y + 0.05;
      p.z = z;
      return false;
    }
    return true;
  }

  // Missile guidance.
  guide(p, dt) {
    const world = this.world;
    const def = p.def;
    let tx;
    let ty;
    let tz;
    let tvx = 0;
    let tvy = 0;
    let tvz = 0;
    if (p.decoy) {
      if (!p.decoy.active) {
        p.decoy = null;
        p.target = null;
        return;
      }
      tx = p.decoy.x;
      ty = p.decoy.y;
      tz = p.decoy.z;
    } else if (p.target) {
      if (!p.target.alive || p.target.hidden) {
        p.targetPoint = p.targetPoint || { x: p.target.pos.x, y: p.target.pos.y + 1, z: p.target.pos.z };
        p.target = null;
        return this.guide(p, dt);
      }
      // Wire / laser guidance needs the launcher alive.
      if ((p.def.seeker === 'saclos' || p.def.seeker === 'laser') && p.launcher && !p.launcher.alive) {
        p.target = null;
        p.targetPoint = null;
        return;
      }
      const u = p.target;
      tx = u.pos.x;
      ty = u.cat === 'veh' ? u.pos.y + u.spec.height * 0.6 : u.pos.y + (u.cat === 'inf' ? 1 : 0);
      tz = u.pos.z;
      tvx = u.vel.x;
      tvy = u.vel.y || 0;
      tvz = u.vel.z;
    } else if (p.targetPoint) {
      tx = p.targetPoint.x;
      ty = p.targetPoint.y;
      tz = p.targetPoint.z;
    } else {
      return;
    }
    const dx = tx - p.x;
    const dy = ty - p.y;
    const dz = tz - p.z;
    const hd = Math.hypot(dx, dz);
    const dist = Math.hypot(hd, dy);
    const sp = Math.hypot(p.vx, p.vy, p.vz) || 1;
    // Lead the target.
    const tLead = Math.min(dist / Math.max(sp, 60), 4);
    let ax = dx + tvx * tLead;
    let ay = dy + tvy * tLead;
    let az = dz + tvz * tLead;
    // Top-attack / lofted profile: climb, then dive onto the roof.
    if (p.loft && p.phase === 0) {
      const cruise = def.topAttack ? Math.min(160, hd * 0.35) : Math.min(90, hd * 0.12);
      if (hd > Math.max(60, cruise * 1.3)) {
        const ground = world.terrain.heightAt(p.x + p.vx * 0.5, p.z + p.vz * 0.5);
        ay = Math.max(ay, ground + cruise - p.y);
      } else {
        p.phase = 1;
      }
    }
    // SACLOS missiles fly a slightly wobbly path (operator corrections).
    if (def.seeker === 'saclos') {
      ax += Math.sin(p.age * 7 + p.id) * 0.8;
      ay += Math.cos(p.age * 5 + p.id) * 0.5;
    }
    const al = Math.hypot(ax, ay, az) || 1;
    ax /= al;
    ay /= al;
    az /= al;
    const vx = p.vx / sp;
    const vy = p.vy / sp;
    const vz = p.vz / sp;
    const dot = clamp(vx * ax + vy * ay + vz * az, -1, 1);
    const ang = Math.acos(dot);
    const maxTurn = (def.turnRate || 1) * dt * (p.age < 0.3 ? 0.3 : 1);
    const f = ang > 1e-4 ? Math.min(1, maxTurn / ang) : 1;
    let nx = vx + (ax - vx) * f;
    let ny = vy + (ay - vy) * f;
    let nz = vz + (az - vz) * f;
    const nl = Math.hypot(nx, ny, nz) || 1;
    nx /= nl;
    ny /= nl;
    nz /= nl;
    p.vx = nx * sp;
    p.vy = ny * sp + GRAVITY * p.gravity * dt; // guidance holds altitude
    p.vz = nz * sp;
    // Missiles chasing flares or lost targets detonate near the decoy.
    if (p.decoy && dist < 8) p.age = p.life + 1;
  }

  // Aircraft flares seduce IR missiles that are tracking it.
  decoyMissiles(aircraft, flare) {
    for (const p of this.active) {
      if (p.kind !== 'missile' || p.target !== aircraft || p.decoy) continue;
      const seeker = p.def.seeker;
      const chance = seeker === 'ir' ? 0.42 : seeker === 'radar' ? 0.12 : 0;
      if (chance > 0 && rng.chance(chance)) p.decoy = flare;
    }
  }

  // Missiles currently inbound on a unit (for countermeasure decisions).
  threatsTo(unit) {
    let n = 0;
    for (const p of this.active) if (p.kind === 'missile' && p.target === unit && !p.decoy) n++;
    return n;
  }
}
