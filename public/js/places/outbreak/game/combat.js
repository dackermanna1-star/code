// Bullets and blows. A bullet is a little projectile with a muzzle velocity,
// dropping under gravity and slowing with drag, so a long shot needs leading
// and holding over; each frame its path is tested against everything solid
// and, limb by limb, against everyone. What it hits decides what happens:
// a head, a chest, an arm; a wall (a hole and dust), metal (sparks), glass
// (which breaks), the ground, the water. Shots are loud: everything with ears
// within range hears them.
import * as THREE from 'three';
import { O } from '../state.js';

const GRAV = 30; // studs/s^2 (about 9.8 m/s^2)
export const PART_MULT = { head: 3.2, torso: 1, armL: 0.6, armR: 0.6, legL: 0.65, legR: 0.65 };
const _o = new THREE.Vector3(), _d = new THREE.Vector3();

export class Combat {
  constructor() {
    this.bullets = [];
    this.noises = []; // recent loud events { x, y, z, r, t, src }
  }

  /**
   * Fire a round from (o) in direction (d). b: { dmg, vel (studs/s), shooter (owner), pellets, spread, armorPierce, range }
   */
  shoot(o, d, b) {
    const n = b.pellets || 1;
    for (let i = 0; i < n; i++) {
      const dir = new THREE.Vector3().copy(d);
      if (b.spread) spread(dir, b.spread);
      this.bullets.push({ x: o.x, y: o.y, z: o.z, vx: dir.x * b.vel, vy: dir.y * b.vel, vz: dir.z * b.vel, v0: b.vel, dmg: b.dmg, shooter: b.shooter, life: 2.4, dist: 0, pierce: b.armorPierce || 0, whizzed: false, first: true });
    }
  }

  /** A loud noise somewhere: the infected and bandits within r may come. */
  noise(x, y, z, r, src = null) {
    this.noises.push({ x, y, z, r, t: 0, src });
    O.zombies?.hear(x, y, z, r, src);
    O.bandits?.hear(x, y, z, r, src);
  }

  update(dt) {
    for (let i = this.noises.length - 1; i >= 0; i--) { this.noises[i].t += dt; if (this.noises[i].t > 3) this.noises.splice(i, 1); }
    const cam = O.world.camera.position;
    for (let i = this.bullets.length - 1; i >= 0; i--) {
      const b = this.bullets[i];
      // a few sub-steps for fast rounds
      let t = dt, alive = true;
      while (t > 1e-5 && alive) {
        const st = Math.min(t, 1 / 90); t -= st;
        const sp = Math.hypot(b.vx, b.vy, b.vz);
        // drag: lose speed over distance
        const k = Math.exp(-st * 0.12);
        b.vx *= k; b.vz *= k; b.vy = b.vy * k - GRAV * st;
        const nx = b.x + b.vx * st, ny = b.y + b.vy * st, nz = b.z + b.vz * st;
        const L = Math.hypot(nx - b.x, ny - b.y, nz - b.z);
        _o.set(b.x, b.y, b.z); _d.set((nx - b.x) / L, (ny - b.y) / L, (nz - b.z) / L);
        // the world (glass breaks and lets it through)
        const shooterB = b.shooter?.box;
        const hw = O.phys.ray(b.x, b.y, b.z, _d.x, _d.y, _d.z, L, { skip: (bx) => bx === shooterB || bx.broken || (bx.glass && bx.brokenGlass) });
        // people
        const hp = O.crowd.ray(_o, _d, hw ? hw.d : L, (p) => p.owner === b.shooter || (p.owner?.dead && p.owner?.deadT > 1.5));
        if (hp) {
          const factor = Math.max(0.35, sp / b.v0);
          this._hitPerson(b, hp, factor);
          alive = false; break;
        }
        if (hw) {
          if (hw.box?.glass && !hw.box.brokenGlass) {
            hw.box.brokenGlass = true; O.buildings?.breakGlass?.(hw.box, hw);
            O.audio?.glass(hw); O.fx.impact(hw.x, hw.y, hw.z, -_d.x, -_d.y, -_d.z, 'glass');
            this.noise(hw.x, hw.y, hw.z, 35);
            b.x = hw.x + _d.x * 0.3; b.y = hw.y + _d.y * 0.3; b.z = hw.z + _d.z * 0.3; b.vx *= 0.85; b.vy *= 0.85; b.vz *= 0.85;
            continue;
          }
          const mat = hw.kind === 'terrain' ? (O.terrain.waterAt(hw.x, hw.z) > hw.y ? 'water' : 'dirt') : hw.mat;
          O.fx.impact(hw.x, hw.y, hw.z, hw.nx, hw.ny, hw.nz, mat);
          if (hw.kind !== 'terrain' && mat !== 'glass' && mat !== 'cloth') O.fx.decal(hw.x, hw.y, hw.z, hw.nx, hw.ny, hw.nz, mat === 'metal' ? 0.22 : 0.3);
          if (Math.hypot(hw.x - cam.x, hw.z - cam.z) < 120) O.audio?.impact(mat, hw);
          if (hw.box?.door) O.buildings?.damageDoor?.(hw.box.door, b.dmg * 0.4);
          alive = false; break;
        }
        // water: it stops a bullet in a few studs
        const wl = O.terrain.waterAt(nx, nz);
        if (wl > ny) { O.fx.impact(nx, wl, nz, 0, 1, 0, 'water'); alive = false; break; }
        // past your head: a crack and a whizz
        if (!b.whizzed && b.shooter !== O.player) {
          const dx = cam.x - nx, dy = cam.y - ny, dz = cam.z - nz;
          if (dx * dx + dy * dy + dz * dz < 36) { b.whizzed = true; O.audio?.whiz(); O.weapons?.suppress(0.4); }
        }
        b.x = nx; b.y = ny; b.z = nz; b.dist += L;
      }
      b.life -= dt;
      if (!alive || b.life <= 0 || b.y < -50) this.bullets.splice(i, 1);
    }
  }

  _hitPerson(b, hp, factor) {
    const owner = hp.p.owner;
    const mult = PART_MULT[hp.part] ?? 1;
    const dmg = b.dmg * mult * factor;
    owner?.hit?.(dmg, hp.part, _d.clone(), b.shooter, { bullet: true, pierce: b.pierce });
    O.fx.blood(hp.point.x, hp.point.y, hp.point.z, { x: _d.x, y: _d.y * 0.3 + 0.2, z: _d.z }, hp.part === 'head');
    if (b.shooter === O.player) { O.hud?.hitmark(hp.part === 'head', owner?.dead); O.audio?.hitmark(hp.part === 'head'); }
    O.audio?.flesh(hp.point);
  }

  /**
   * A melee swing from (o) facing (d): hits the first person within reach and a cone. Returns what it hit.
   * w: { dmg, reach, shooter, kind, stagger }
   */
  swing(o, d, w) {
    let best = null, bd = w.reach;
    for (const p of O.crowd.people) {
      const ow = p.owner;
      if (!ow || ow === w.shooter || ow.dead || p.hidden && !p.hittable) continue;
      const dx = p.x - o.x, dz = p.z - o.z, dy = (p.y + (p.pose?.prone ? 0.5 : p.pose?.crouch ? 2 : 3)) - o.y;
      const dist = Math.hypot(dx, dz);
      if (dist > w.reach + 1.2 || Math.abs(dy) > 4.5) continue;
      const along = (dx * d.x + dz * d.z) / Math.max(0.01, dist * Math.hypot(d.x, d.z));
      if (along < 0.55 && dist > 1.6) continue;
      if (dist < bd + 1.2) { bd = dist; best = p; }
    }
    // a wall in the way?
    if (best) {
      const dx = best.x - o.x, dz = best.z - o.z, L = Math.hypot(dx, dz);
      const h = O.phys.ray(o.x, o.y, o.z, dx / L, 0, dz / L, Math.max(0, L - 1), { terrain: false, skip: (b) => b === w.shooter?.box });
      if (h) best = null;
    }
    if (best) {
      // the head if you're aiming high enough at it
      const headY = best.y + 4.6 * (best.scale || 1) - (best.pose?.crouch ? 1.3 : 0);
      const part = Math.abs(o.y + d.y * bd - headY) < 0.9 ? 'head' : 'torso';
      const dmg = w.dmg * (part === 'head' ? 1.6 : 1);
      best.owner.hit?.(dmg, part, new THREE.Vector3(d.x, 0, d.z).normalize(), w.shooter, { melee: true, stagger: w.stagger, kind: w.kind });
      O.fx.blood(best.x, best.y + 3.2, best.z, { x: d.x, y: 0.3, z: d.z }, w.kind === 'chop');
      O.audio?.melee(w.kind, true);
      return best;
    }
    // hit a wall?
    const h = O.phys.ray(o.x, o.y, o.z, d.x, d.y, d.z, w.reach, { terrain: true, skip: (b) => b === w.shooter?.box });
    if (h) { O.fx.impact(h.x, h.y, h.z, h.nx, h.ny, h.nz, h.mat); O.audio?.melee(w.kind, false, h.mat); if (h.box?.door) O.buildings?.damageDoor?.(h.box.door, w.dmg * 0.5); return { wall: h }; }
    O.audio?.swish();
    return null;
  }
}

/** Turn a direction by a random amount within `deg` degrees. */
export function spread(dir, deg) {
  const a = (deg * Math.PI / 180) * Math.sqrt(Math.random()), t = Math.random() * Math.PI * 2;
  const up = Math.abs(dir.y) > 0.95 ? new THREE.Vector3(1, 0, 0) : new THREE.Vector3(0, 1, 0);
  const r = new THREE.Vector3().crossVectors(dir, up).normalize(), u = new THREE.Vector3().crossVectors(r, dir);
  dir.addScaledVector(r, Math.cos(t) * Math.tan(a)).addScaledVector(u, Math.sin(t) * Math.tan(a)).normalize();
  return dir;
}
