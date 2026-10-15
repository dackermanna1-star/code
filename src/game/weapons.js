// Weapon state, firing (hitscan with spread, pellets, penetration, range falloff),
// melee swings and shoving.
import * as THREE from 'three';
import { WEAPONS, MELEE, U } from './config.js';

const _dir = new THREE.Vector3();
const _right = new THREE.Vector3();
const _up = new THREE.Vector3();
const DEG = Math.PI / 180;

export function weaponDef(id) { return WEAPONS[id] || MELEE[id]; }

export class WeaponState {
  constructor(id) {
    this.id = id;
    this.def = weaponDef(id);
    if (!this.def) throw new Error('Unknown weapon ' + id);
    this.clip = this.def.clip || 0;
    this.reserve = this.def.reserve !== undefined ? this.def.reserve : 0;
    this.cooldown = 0;
    this.reloading = 0;        // >0 while reloading (seconds remaining for mag reloads)
    this.reloadTotal = 0;
    this.shellReload = false;  // shotgun shell-by-shell
    this.burstLeft = 0;
    this.burstTimer = 0;
    this.spread = this.def.spread ? this.def.spread[0] : 0;
    this.upgrade = null;       // {type:'incendiary'|'explosive', rounds}
    this.laser = false;
    this.fuel = this.def.fuel || 0;
    this.pumpTimer = 0;
    this.triggerHeld = false;
  }
  get isMelee() { return !!this.def.melee; }
  get kind() { return this.def.kind; }
  get canReload() {
    const d = this.def;
    if (d.melee || d.noReload) return false;
    if (this.clip >= d.clip) return false;
    if (this.reserve <= 0 && this.reserve !== Infinity) return false;
    return true;
  }
  startReload(speedMul = 1) {
    if (!this.canReload || this.reloading > 0) return false;
    if (this.def.reloadShell) {
      this.shellReload = true;
      this.reloading = 0.35 / speedMul + this.def.reloadShell / speedMul; // start anim + first shell
      this.reloadTotal = this.reloading;
    } else {
      this.reloading = this.def.reload / speedMul;
      this.reloadTotal = this.reloading;
    }
    this.burstLeft = 0;
    return true;
  }
  /** Advance reload; returns event string when something happens ('shell'|'done'|null). */
  updateReload(dt, speedMul = 1) {
    if (this.reloading <= 0) return null;
    this.reloading -= dt;
    if (this.reloading > 0) return null;
    const d = this.def;
    if (this.shellReload) {
      if (this.clip < d.clip && this.reserve > 0) {
        this.clip++; this.reserve--;
        if (this.clip < d.clip && this.reserve > 0) { this.reloading = d.reloadShell / speedMul; this.reloadTotal = this.reloading; return 'shell'; }
      }
      this.shellReload = false; this.reloading = 0;
      return 'done';
    }
    const need = d.clip - this.clip;
    const take = this.reserve === Infinity ? need : Math.min(need, this.reserve);
    this.clip += take;
    if (this.reserve !== Infinity) this.reserve -= take;
    this.reloading = 0;
    return 'done';
  }
  cancelReload() {
    if (this.shellReload && this.reloading > 0) { this.reloading = 0; this.shellReload = false; return true; }
    return false;
  }
  maxReserve() { return this.def.reserve; }
}

/** Compute current spread in degrees for a shooter. */
export function currentSpread(ws, shooter) {
  const s = ws.def.spread;
  if (!s) return 0;
  let base = shooter.crouching ? s[1] : s[0];
  const speed = Math.hypot(shooter.body.vel.x, shooter.body.vel.z);
  if (!shooter.body.grounded) base = Math.max(base, s[5] * 2);
  else if (speed > 0.5) base = Math.max(base, s[5] * Math.min(1, speed / 5));
  let sp = Math.min(s[2], base + ws.spread);
  if (ws.laser) sp *= 0.4;
  if (shooter.incapped && ws.id !== 'magnum') sp += 3;
  if (shooter.tongueVictim) sp += 2;
  return sp;
}

/** Random direction within a cone of half-angle `deg` around dir. */
export function spreadDir(dir, deg, out = new THREE.Vector3(), yawDeg = null) {
  _up.set(0, 1, 0);
  if (Math.abs(dir.y) > 0.99) _up.set(1, 0, 0);
  _right.crossVectors(dir, _up).normalize();
  _up.crossVectors(_right, dir).normalize();
  const r = Math.sqrt(Math.random());
  const a = Math.random() * Math.PI * 2;
  const px = Math.cos(a) * r * Math.tan((yawDeg !== null ? yawDeg : deg) * DEG);
  const py = Math.sin(a) * r * Math.tan(deg * DEG);
  return out.copy(dir).addScaledVector(_right, px).addScaledVector(_up, py).normalize();
}

/**
 * Fire one trigger pull worth of shots. origin = eye position, dir = aim direction.
 * muzzle = world position for tracers/flash. Returns true if a shot happened.
 */
export function fireWeapon(world, shooter, ws, origin, dir, muzzle) {
  const d = ws.def;
  if (ws.clip <= 0) return false;
  ws.clip--;
  const special = ws.upgrade && ws.upgrade.rounds > 0 ? ws.upgrade.type : null;
  if (special) { ws.upgrade.rounds--; if (ws.upgrade.rounds <= 0) ws.upgrade = null; }
  if (d.projectile) {
    world.spawnGrenade(muzzle || origin, dir, shooter, special);
  } else {
    const spreadDeg = currentSpread(ws, shooter);
    const pellets = special === 'explosive' && d.kind === 'shotgun' ? 1 : d.pellets;
    for (let p = 0; p < pellets; p++) {
      let sdir;
      if (d.scatter && pellets > 1) sdir = spreadDir(_dir.copy(dir), d.scatter[0] * 0.5 + spreadDeg * 0.3, new THREE.Vector3(), d.scatter[1] * 0.5 + spreadDeg * 0.3);
      else sdir = spreadDir(_dir.copy(dir), spreadDeg, new THREE.Vector3());
      world.traceBullet(origin, sdir, {
        damage: special === 'explosive' && pellets === 1 && d.pellets > 1 ? d.dmg * d.pellets * 0.6 : d.dmg,
        rangeMod: d.rangeMod, pen: special ? 0 : d.pen, shooter, weapon: d, special, muzzle, tracer: p === 0 || Math.random() < 0.3,
      });
    }
  }
  // spread accumulation
  if (d.spread) ws.spread = Math.min(d.spread[2], ws.spread + d.spread[3]);
  ws.cooldown = d.cycle;
  world.onWeaponFired(shooter, ws, muzzle || origin);
  return true;
}

/** Melee swing resolution. Returns number of things hit. */
export function meleeHit(world, attacker, def, origin, dir) {
  const reach = def.reach || 1.8;
  const arc = def.arc || 1.0; // radians half-angle-ish
  let hits = 0;
  const cosArc = Math.cos(arc);
  for (const z of world.infected) {
    if (!z.alive) continue;
    const c = z.center();
    const dx = c.x - origin.x, dy = c.y - origin.y, dz = c.z - origin.z;
    const dist = Math.hypot(dx, dz);
    if (dist > reach + z.radius || Math.abs(dy) > 1.6) continue;
    const dot = (dx * dir.x + dz * dir.z) / (Math.max(dist, 0.01) * Math.hypot(dir.x, dir.z) || 1);
    if (dot < cosArc && dist > 0.6) continue;
    if (world.collision.blocked(origin, c)) continue;
    z.takeMelee(attacker, def, _dir.set(dx, 0, dz).normalize());
    hits++;
  }
  world.breakNear(origin, dir, reach);
  return hits;
}

/** Shove: stagger commons/specials in front, free pinned teammates. */
export function shove(world, attacker, origin, dir) {
  const range = 75 * U * 1.25;
  let hits = 0;
  for (const z of world.infected) {
    if (!z.alive) continue;
    const c = z.position;
    const dx = c.x - origin.x, dz = c.z - origin.z;
    const dist = Math.hypot(dx, dz);
    if (dist > range + z.radius || Math.abs(c.y + 1 - origin.y) > 1.6) continue;
    const dot = (dx * dir.x + dz * dir.z) / Math.max(dist, 0.01);
    if (dot < 0.45 && dist > 0.7) continue;
    if (z.takeShove(attacker, _dir.set(dx, 0, dz).normalize())) hits++;
  }
  world.breakNear(origin, dir, range);
  // shoving a pinned teammate frees them from hunters/jockeys/tongues
  for (const s of world.survivors) {
    if (s === attacker || !s.alive) continue;
    const dx = s.body.pos.x - origin.x, dz = s.body.pos.z - origin.z;
    const dist = Math.hypot(dx, dz);
    if (dist > range + 0.4) continue;
    const dot = (dx * dir.x + dz * dir.z) / Math.max(dist, 0.01);
    if (dot < 0.5) continue;
    if (s.pinnedBy && s.pinnedBy.onVictimShoved) { s.pinnedBy.onVictimShoved(attacker); hits++; }
    else if (!s.pinnedBy && !s.incapped) { s.body.vel.x += dx / dist * 2; s.body.vel.z += dz / dist * 2; }
  }
  return hits;
}
