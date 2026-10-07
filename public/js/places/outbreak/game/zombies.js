// The infected. They gather where people used to be - thick in the city,
// fewer in a village, soldiers at the base, doctors at the hospital - and
// stand about swaying, or shuffle aimlessly. They see you if you're in front
// of them and not too far (less far at night, crouching, or lying down) and
// hear you running, a door, a shot (a long way off). Then they come: most
// run, a few can only stagger. They follow you through doorways and up the
// stairs, and batter on a door you've shut until it gives. Their claws make
// you bleed. A good hit staggers them; enough kills them.
import * as THREE from 'three';
import { O } from '../state.js';
import { ZOMBIE_OUTFITS, zombieKind } from './humanoid.js';
import { PLACES, POIS } from '../world/layout.js';
import { makeItem } from './inventory.js';

const TAU = Math.PI * 2;
let zid = 1;

class Zombie {
  constructor(x, y, z, outfit) {
    this.id = zid++;
    this.pos = new THREE.Vector3(x, y, z);
    this.vel = new THREE.Vector3();
    this.yaw = Math.random() * TAU;
    this.outfit = outfit;
    this.kind = zombieKind(outfit);
    this.walker = Math.random() < 0.28;
    this.runSpeed = 13.2 + Math.random() * 2.6;
    this.hp = this.kind === 'soldier' ? 140 : 100;
    this.state = Math.random() < 0.45 ? 'wander' : 'idle';
    this.t = Math.random() * 5;
    this.target = null; // where they're going
    this.route = [];
    this.attackT = 0; this.stagger = 0;
    this.dead = false; this.deadT = 0;
    this.grounded = true;
    this.seeT = Math.random() * 0.3;
    this.phase = Math.random() * TAU;
    this.groanT = 3 + Math.random() * 10;
    this.stuckT = 0; this.lastD = 1e9; this.detour = 0;
    this.person = { x, y, z, yaw: this.yaw, outfit, scale: 0.94 + Math.random() * 0.12, pose: { arms: 'zombie', walk: 0, stride: 0 }, owner: this };
    this.box = null;
  }

  /** Shot or struck. */
  hit(dmg, part, dir, by, o = {}) {
    if (this.dead) return;
    this.hp -= dmg;
    this.person.flash = 1;
    if (o.melee && (o.stagger || Math.random() < 0.3) || dmg > 40) { this.stagger = o.stagger ? 1.1 : 0.55; this.vel.x += dir.x * 10; this.vel.z += dir.z * 10; }
    if (this.hp <= 0) { this.die(dir, by, part); return; }
    // whoever hurt it has its attention
    if (by?.pos) this.chase(by);
    O.audio?.zombie('hurt', this.pos);
  }
  die(dir, by, part) {
    this.dead = true; this.deadT = 0; this.state = 'dead';
    // fall away from the blow
    const fwd = { x: Math.sin(this.yaw), z: Math.cos(this.yaw) };
    this.person.pose.fallDir = dir && (dir.x * fwd.x + dir.z * fwd.z) > 0 ? -1 : 1;
    O.audio?.zombie('die', this.pos);
    if (by === O.player) { O.stats.zombies++; }
    // a little something in their pockets
    const items = [];
    const r = Math.random();
    if (r < 0.12) items.push(makeItem('rag', { n: 1 + Math.floor(Math.random() * 3) }));
    else if (r < 0.18) items.push(makeItem(this.kind === 'soldier' ? 'mre' : 'beans'));
    else if (r < 0.22) items.push(makeItem(this.kind === 'police' ? 'ammo9x18' : this.kind === 'soldier' ? 'ammo762x39' : 'bandage', { n: 6 + Math.floor(Math.random() * 10) }));
    else if (r < 0.25) items.push(makeItem(this.kind === 'doctor' ? 'painkillers' : 'battery'));
    O.bodies.add({ x: this.pos.x, y: this.pos.y, z: this.pos.z, name: 'Infected', items, person: this.person, owner: this, t: 0, life: 150 });
    if (this.box) { O.phys.remove(this.box); this.box = null; }
  }
  chase(who) { if (this.dead) return; if (this.state !== 'chase') O.audio?.zombie('alert', this.pos); this.state = 'chase'; this.prey = who; this.t = 0; this.giveUp = 8; }
  alert(x, y, z) { if (this.dead || this.state === 'chase') return; this.state = 'alert'; this.target = new THREE.Vector3(x, y, z); this.t = 0; this.route = []; this._routeTo(this.target); if (Math.random() < 0.5) O.audio?.zombie('groan', this.pos); }
  _routeTo(p) { this.route = O.nav ? O.nav.route(this.pos.x, this.pos.y + 1, this.pos.z, p.x, p.y + 1, p.z) : []; this.routeT = 1.2; }
}

export class Zombies {
  constructor() {
    this.list = [];
    this.spawnT = 0;
    this.max = 40;
  }
  get active() { return this.list.filter((z) => !z.dead).length; }

  /** How many infected should be around a point, and what sort. */
  density(x, z) {
    let best = { n: 2, kinds: null, place: null };
    for (const p of PLACES) {
      const d = Math.hypot(x - p.x, z - p.z), R = p.r * 1.25 + 120;
      if (d > R) continue;
      const k = 1 - Math.max(0, d - p.r * 0.6) / (R - p.r * 0.6);
      const n = { city: 32, town: 22, village: 11, military: 18, airfield: 12 }[p.kind] * Math.max(0.25, k);
      if (n > best.n) best = { n, kinds: p.kind === 'military' || p.kind === 'airfield' ? 'soldier' : null, place: p };
    }
    for (const q of POIS) if ((q.kind === 'farm' || q.kind === 'gas') && Math.hypot(x - q.x, z - q.z) < 150) best.n = Math.max(best.n, 5);
    best.n *= O.settings?.zombieMul ?? 1;
    return best;
  }

  /** Bring infected in out of sight; send far ones away. */
  _spawn(dt) {
    const P = O.player;
    if (!P || !P.alive) return;
    this.spawnT -= dt;
    if (this.spawnT > 0) return;
    this.spawnT = 1.2;
    for (const z of this.list) {
      if (z.dead) continue;
      const d = Math.hypot(z.pos.x - P.pos.x, z.pos.z - P.pos.z);
      if (d > 280 && z.state !== 'chase') this._remove(z);
    }
    const want = this.density(P.pos.x, P.pos.z);
    const alive = this.active;
    if (alive >= Math.min(this.max, want.n)) return;
    // a spot: a room in a building nearby, or the street, not in plain sight
    for (let tries = 0; tries < 6; tries++) {
      const a = Math.random() * TAU, dist = 80 + Math.random() * 110;
      const x = P.pos.x + Math.cos(a) * dist, z = P.pos.z + Math.sin(a) * dist;
      let sx = x, sz = z, sy = O.terrain.heightAt(x, z);
      const rooms = O.nav?.rooms;
      if (rooms && Math.random() < 0.55) {
        // a room near there
        const R = O.nav.roomAt(x, sy + 1, z) || nearestRoom(x, z, 50);
        if (R && R.y < sy + 25) { const lx = (Math.random() - 0.5) * R.hx, lz = (Math.random() - 0.5) * R.hz; sx = R.x + lx * (R.c ?? 1) + lz * (R.s ?? 0); sz = R.z - lx * (R.s ?? 0) + lz * (R.c ?? 1); sy = R.y; }
      }
      if (O.terrain.waterAt(sx, sz) > sy - 1) continue;
      // in your view and close? try elsewhere
      const cam = O.world.camera, dx = sx - cam.position.x, dz = sz - cam.position.z;
      const f = new THREE.Vector3(0, 0, -1).applyQuaternion(cam.quaternion);
      const inView = (dx * f.x + dz * f.z) / Math.hypot(dx, dz) > 0.55;
      if (inView && Math.hypot(dx, dz) < 120 && O.phys.sees(cam.position.x, cam.position.y, cam.position.z, sx, sy + 3, sz)) continue;
      const pool = ZOMBIE_OUTFITS();
      let outfit = pool[Math.floor(Math.random() * pool.length)];
      if (want.kinds === 'soldier' && Math.random() < 0.7) outfit = pool.find((o) => zombieKind(o) === 'soldier') || outfit;
      const nearHospital = O.plan?.sites.some((s) => (s.tpl === 'hospital' || s.tpl === 'clinic') && Math.hypot(s.x - sx, s.z - sz) < 60);
      if (nearHospital && Math.random() < 0.5) outfit = pool.find((o) => zombieKind(o) === 'doctor') || outfit;
      const nearPolice = O.plan?.sites.some((s) => s.tpl === 'police' && Math.hypot(s.x - sx, s.z - sz) < 60);
      if (nearPolice && Math.random() < 0.5) outfit = pool.find((o) => zombieKind(o) === 'police') || outfit;
      this.add(sx, O.phys.groundAt(sx, sy + 3, sz, 0.6, 6), sz, outfit);
      break;
    }
  }
  add(x, y, z, outfit) {
    const zb = new Zombie(x, y, z, outfit || ZOMBIE_OUTFITS()[0]);
    if (!O.crowd.add(zb.person)) return null;
    this.list.push(zb);
    return zb;
  }
  _remove(z) {
    O.crowd.remove(z.person);
    const i = this.list.indexOf(z); if (i >= 0) this.list.splice(i, 1);
    if (z.box) O.phys.remove(z.box);
  }
  /** A noise: anyone in range wanders over to see. */
  hear(x, y, z, r, src) {
    for (const zb of this.list) {
      if (zb.dead) continue;
      const d = Math.hypot(zb.pos.x - x, zb.pos.z - z);
      if (d > r) continue;
      // close and loud enough: they know it's you
      if (src === O.player && d < r * 0.4) zb.chase(src);
      else zb.alert(x + (Math.random() - 0.5) * 8, y, z + (Math.random() - 0.5) * 8);
    }
  }

  update(dt) {
    this._spawn(dt);
    const P = O.player;
    for (let i = this.list.length - 1; i >= 0; i--) {
      const z = this.list[i];
      if (z.dead) { this._dead(z, dt); continue; }
      const far = Math.hypot(z.pos.x - P.pos.x, z.pos.z - P.pos.z);
      // far away ones think less often
      z.acc = (z.acc || 0) + dt;
      if (far > 150 && z.acc < 0.1) continue;
      const step = z.acc; z.acc = 0;
      this._think(z, step, far);
      this._move(z, step);
      this._pose(z, step);
    }
  }

  _think(z, dt, dist) {
    const P = O.player;
    z.t += dt;
    z.stagger = Math.max(0, z.stagger - dt);
    z.person.flash = Math.max(0, (z.person.flash || 0) - dt * 5);
    // groans now and then
    z.groanT -= dt;
    if (z.groanT <= 0) { z.groanT = 4 + Math.random() * 9; if (dist < 70) O.audio?.zombie(z.state === 'chase' ? 'chase' : 'idle', z.pos); }
    // senses
    z.seeT -= dt;
    if (z.seeT <= 0 && P.alive && z.state !== 'chase') {
      z.seeT = 0.3;
      const night = O.sky ? Math.max(0, Math.min(1, O.sky.state?.night ?? 0)) : 0;
      let range = (45 - night * 27) * (P.stance === 'crouch' ? 0.6 : P.stance === 'prone' ? 0.35 : 1);
      if (O.weapons?.light?.intensity > 0) range = Math.max(range, 55);
      if (P.indoors) range *= 0.8;
      if (dist < range) {
        const dx = P.pos.x - z.pos.x, dz = P.pos.z - z.pos.z;
        const facing = (dx * Math.sin(z.yaw) + dz * Math.cos(z.yaw)) / Math.max(0.01, dist);
        const close = dist < 7;
        if ((facing > -0.2 || close) && O.phys.sees(z.pos.x, z.pos.y + 4.4, z.pos.z, P.pos.x, P.pos.y + P.eye - 0.3, P.pos.z)) z.chase(P);
      }
      // your footsteps
      if (P.noise > 0 && dist < P.noise) { if (dist < P.noise * 0.5) z.chase(P); else z.alert(P.pos.x, P.pos.y, P.pos.z); }
    }
    // states
    if (z.state === 'chase') {
      const prey = z.prey || P;
      if (!prey.alive || prey.removed || prey.dead) { z.state = 'wander'; z.target = z.prey = null; return; }
      const can = O.phys.sees(z.pos.x, z.pos.y + 4.4, z.pos.z, prey.pos.x, prey.pos.y + 3, prey.pos.z);
      if (can) { z.lastSeen = prey.pos.clone(); z.giveUp = 8; } else { z.giveUp -= dt; if (z.giveUp <= 0) { z.state = 'alert'; z.target = z.lastSeen || prey.pos.clone(); z._routeTo(z.target); } }
      z.target = can ? prey.pos : (z.lastSeen || prey.pos);
      z.routeT = (z.routeT ?? 0) - dt;
      if (z.routeT <= 0) { z._routeTo(z.target); }
      // attack when close
      const d = Math.hypot(prey.pos.x - z.pos.x, prey.pos.z - z.pos.z), dy = Math.abs(prey.pos.y - z.pos.y);
      if (z.attackT > 0) {
        z.attackT += dt;
        if (!z.struck && z.attackT > 0.45) {
          z.struck = true;
          if (d < 3.6 && dy < 3 && O.phys.sees(z.pos.x, z.pos.y + 4.4, z.pos.z, prey.pos.x, prey.pos.y + 3, prey.pos.z)) {
            if (prey === P) {
              const blocking = O.weapons?.blocking && facingTo(P, z) > 0.6;
              const dmg = (6 + Math.random() * 8) * (blocking ? 0.25 : 1) * (z.kind === 'soldier' ? 1.2 : 1);
              O.survival.hurt(dmg, { bleed: blocking ? 0.05 : 0.33, part: Math.random() < 0.2 ? 'head' : 'torso', cause: 'the infected', blood: dmg * 0.25 });
              O.audio?.zombie('hit', z.pos);
              if (blocking) { z.stagger = 0.8; O.audio?.melee('blunt', true); }
              else { P.vel.x += (prey.pos.x - z.pos.x) / Math.max(0.1, d) * 6; P.vel.z += (prey.pos.z - z.pos.z) / Math.max(0.1, d) * 6; O.actions?.cancel(); }
            } else prey.hit?.(10, 'torso', new THREE.Vector3(prey.pos.x - z.pos.x, 0, prey.pos.z - z.pos.z).normalize(), z, { melee: true });
          }
        }
        if (z.attackT > 1.05) { z.attackT = 0; z.struck = false; }
      } else if (can && d < 2.9 && dy < 3 && z.stagger <= 0) { z.attackT = 0.0001; z.struck = false; O.audio?.zombie('attack', z.pos); }
    } else if (z.state === 'alert') {
      if (!z.target || z.t > 25) { z.state = 'wander'; z.target = null; }
      else if (Math.hypot(z.target.x - z.pos.x, z.target.z - z.pos.z) < 3) { z.state = 'idle'; z.t = 0; z.target = null; }
    } else if (z.state === 'wander') {
      if (!z.target || z.t > 14 || Math.hypot(z.target.x - z.pos.x, z.target.z - z.pos.z) < 2) {
        z.t = 0;
        if (Math.random() < 0.4) { z.state = 'idle'; z.target = null; }
        else if (z.home && Math.hypot(z.home.x - z.pos.x, z.home.z - z.pos.z) > 25) { z.target = new THREE.Vector3(z.home.x + (Math.random() - 0.5) * 20, z.pos.y, z.home.z + (Math.random() - 0.5) * 20); z.route = []; }
        else { const a = Math.random() * TAU; z.target = new THREE.Vector3(z.pos.x + Math.cos(a) * 14, z.pos.y, z.pos.z + Math.sin(a) * 14); z.route = []; }
      }
    } else if (z.state === 'idle') {
      if (z.t > 6 + Math.random() * 8) { z.state = 'wander'; z.t = 0; }
    }
  }

  _move(z, dt) {
    let speed = 0;
    let tx = null, tz = null, ty = null;
    if (z.target && z.attackT <= 0) {
      // follow the route through doorways; the last leg goes straight to the target
      let wp = z.route[0];
      while (wp && Math.hypot(wp.x - z.pos.x, wp.z - z.pos.z) < (wp.stairs ? 1.2 : 1.8) && Math.abs(wp.y - z.pos.y) < 3) { z.route.shift(); wp = z.route[0]; }
      const goal = wp || z.target;
      tx = goal.x; tz = goal.z; ty = goal.y;
      // a shut door: bash it
      if (wp?.door && wp.door.open < 0.3 && !wp.door.broken && Math.hypot(wp.x - z.pos.x, wp.z - z.pos.z) < 4) {
        z.bashT = (z.bashT || 0) + dt;
        speed = 0;
        if (z.bashT > 1.1) { z.bashT = 0; O.buildings?.damageDoor(wp.door, 9 + Math.random() * 6, true); O.audio?.bash(wp); z.person.pose.attack = 0.5; }
        z.yaw = Math.atan2(wp.x - z.pos.x, wp.z - z.pos.z);
      } else {
        const chasing = z.state === 'chase';
        speed = chasing ? (z.walker ? 5.2 : z.runSpeed) : z.state === 'alert' ? (z.walker ? 3.5 : 6) : 2.6;
      }
    }
    if (z.stagger > 0) speed = 0;
    if (tx !== null && speed > 0) {
      let dx = tx - z.pos.x, dz = tz - z.pos.z;
      const d = Math.hypot(dx, dz) || 1;
      dx /= d; dz /= d;
      // stuck against something? go round it for a bit
      if (z.detour > 0) { z.detour -= dt; const s = z.detourSide; const ndx = dx * 0.3 + -dz * s, ndz = dz * 0.3 + dx * s; dx = ndx; dz = ndz; }
      z.stuckT += dt;
      if (z.stuckT > 0.8) { if (d > z.lastD - 0.6 && d > 3) { z.detour = 0.9 + Math.random() * 0.8; z.detourSide = Math.random() < 0.5 ? 1 : -1; } z.lastD = d; z.stuckT = 0; }
      const want = Math.atan2(dx, dz);
      let da = want - z.yaw; while (da > Math.PI) da -= TAU; while (da < -Math.PI) da += TAU;
      z.yaw += da * Math.min(1, dt * (z.state === 'chase' ? 7 : 3));
      const acc = Math.min(1, dt * 6);
      z.vel.x += (dx * speed - z.vel.x) * acc; z.vel.z += (dz * speed - z.vel.z) * acc;
      void ty;
    } else {
      z.vel.x *= Math.exp(-dt * 6); z.vel.z *= Math.exp(-dt * 6);
      if (z.attackT > 0 && z.prey) { const want = Math.atan2(z.prey.pos.x - z.pos.x, z.prey.pos.z - z.pos.z); let da = want - z.yaw; while (da > Math.PI) da -= TAU; while (da < -Math.PI) da += TAU; z.yaw += da * Math.min(1, dt * 8); }
    }
    // keep out of each other a little
    for (const o of this.list) {
      if (o === z || o.dead) continue;
      const dx = z.pos.x - o.pos.x, dz = z.pos.z - o.pos.z, d2 = dx * dx + dz * dz;
      if (d2 < 3.2 && d2 > 1e-4) { const d = Math.sqrt(d2), k = (1.8 - d) * 2; z.vel.x += dx / d * k; z.vel.z += dz / d * k; }
    }
    // and out of your face: they close to arm's length, no nearer
    const P = O.player;
    if (P?.alive && Math.abs(z.pos.y - P.pos.y) < 4) {
      const dx = z.pos.x - P.pos.x, dz = z.pos.z - P.pos.z, d2 = dx * dx + dz * dz, R = 2.3;
      if (d2 < R * R && d2 > 1e-4) {
        const d = Math.sqrt(d2), nx = dx / d, nz = dz / d, into = -(z.vel.x * nx + z.vel.z * nz);
        if (into > 0) { z.vel.x += nx * into; z.vel.z += nz * into; }
        z.vel.x += nx * (R - d) * 5; z.vel.z += nz * (R - d) * 5;
      }
    }
    const res = O.phys.moveBody(z.pos, z.vel, dt, { r: 1.0, h: 5, step: 1.7, grounded: z.grounded });
    z.grounded = res.grounded;
    // fell in the water: drown slowly, really just keep them out
    if (O.terrain.waterAt(z.pos.x, z.pos.z) > z.pos.y + 4) { z.hp -= dt * 10; if (z.hp <= 0) z.die(null, null, 'torso'); }
    z.moving = Math.hypot(z.vel.x, z.vel.z);
  }

  _pose(z, dt) {
    const p = z.person, P = p.pose;
    const sp = z.moving || 0;
    z.phase += dt * sp * (z.walker ? 0.55 : 0.6) + dt * 0.4;
    P.walk = z.phase;
    P.stride = Math.min(1, sp / 9) * (z.walker ? 0.7 : 1);
    P.arms = z.attackT > 0 ? 'attack' : 'zombie';
    P.attack = z.attackT > 0 ? Math.min(1, z.attackT / 0.6) : 0;
    P.lean = (z.state === 'chase' ? 0.25 : 0.1) + (z.stagger > 0 ? -0.4 * z.stagger : 0);
    P.tilt = Math.sin(z.phase * 0.5 + z.id) * 0.08 + (z.walker ? 0.12 : 0);
    P.headTilt = Math.sin(z.id * 7.1) * 0.3;
    P.look = 0;
    p.x = z.pos.x; p.y = z.pos.y; p.z = z.pos.z; p.yaw = z.yaw + Math.sin(z.phase * 0.5) * 0.08 * (z.walker ? 2 : 1);
  }

  _dead(z, dt) {
    z.deadT += dt;
    const P = z.person.pose;
    P.dead = Math.min(1, z.deadT / 0.55);
    P.dead = P.dead * P.dead * (3 - 2 * P.dead);
    P.stride = 0; P.arms = 'zombie';
    // after a while they sink away (the body is gone from the list of things to loot too)
    if (z.deadT > 150) { z.person.y -= dt * 0.5; if (z.deadT > 156) { O.bodies.removeOwner(z); this._remove(z); } }
  }

  /** Remove everyone (new game). */
  clear() { for (const z of this.list.slice()) this._remove(z); }
}

function nearestRoom(x, z, R) {
  let best = null, bd = R;
  const l = O.nav.rooms;
  for (let i = 0; i < l.length; i += 1) { const r = l[i]; const d = Math.abs(r.x - x) + Math.abs(r.z - z); if (d < bd) { bd = d; best = r; } }
  return best;
}
function facingTo(P, z) {
  const dx = z.pos.x - P.pos.x, dz = z.pos.z - P.pos.z, d = Math.hypot(dx, dz) || 1;
  return (dx * -Math.sin(P.yaw) + dz * -Math.cos(P.yaw)) / d;
}

/** Dead people you can go through the pockets of. */
export class Bodies {
  constructor() { this.list = []; }
  add(b) {
    this.list.push(b);
    if (this.list.length > 60) {
      const i = this.list.findIndex((x) => !x.player);
      if (i >= 0) { const old = this.list.splice(i, 1)[0]; if (old.person && !old.owner?.squad && !O.zombies.list.includes(old.owner)) O.crowd.remove(old.person); }
    }
    return b;
  }
  removeOwner(o) { const i = this.list.findIndex((b) => b.owner === o); if (i >= 0) this.list.splice(i, 1); }
  /** The body you're looking at (near the line from e along d). */
  lookAt(e, d, reach) {
    let best = null, bs = 1e9;
    for (const b of this.list) {
      if (!b.items.length && !b.always) continue;
      const vx = b.x - e.x, vy = b.y + 0.6 - e.y, vz = b.z - e.z, dist = Math.hypot(vx, vy, vz);
      if (dist > reach + 2) continue;
      const along = (vx * d.x + vy * d.y + vz * d.z) / dist;
      if (along < 0.75) continue;
      const score = (1 - along) * dist;
      if (score < bs) { bs = score; best = b; }
    }
    return best;
  }
  near(p, r) { return this.list.filter((b) => Math.hypot(b.x - p.x, b.z - p.z) < r && Math.abs(b.y - p.y) < 5); }
  update(dt) { for (const b of this.list) b.t += dt; }
}
