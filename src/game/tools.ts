// Player tools: sledgehammer, shotgun, rifle, pipe bomb, bomb, rocket launcher, blowtorch, grab.

import { Game } from './game';
import { Player } from './player';
import { Input } from '../engine/input';
import { Vec3, Quat } from '../engine/math';
import { raycastAll, RayHit } from '../physics/raycast';
import { Body } from '../physics/body';
import { PAL_MAT, PAL_HARD, Mat, P, PAL_FLAMMABLE } from '../world/materials';
import { PT } from '../render/particles';
import { VOXEL } from '../world/world';
import { CarveOpts } from './destruction';

export const enum Tool { Hammer = 0, Shotgun, Rifle, PipeBomb, Bomb, Rocket, Torch, Grab, COUNT }

export const TOOL_NAMES = ['Sledgehammer', 'Shotgun', 'Rifle', 'Pipe bomb', 'Bomb', 'Rocket launcher', 'Blowtorch', 'Grab'];
export const TOOL_KEYS = ['Digit1', 'Digit2', 'Digit3', 'Digit4', 'Digit5', 'Digit6', 'Digit7', 'Digit8'];

interface Rocket { pos: Vec3; vel: Vec3; life: number; trail: number }
interface Fuse { body: Body; t: number; power: number; blink: number }

const hit = new RayHit();

export class Tools {
  current: Tool = Tool.Hammer;
  ammo = [Infinity, 60, 40, 30, 12, 20, Infinity, Infinity];
  infiniteAmmo = true;
  cooldown = 0;
  /** 0..1 animation phase of the current swing/recoil */
  anim = 0;
  rockets: Rocket[] = [];
  fuses: Fuse[] = [];
  held: Body | null = null;
  private heldDist = 2.5;
  private heldLocal = new Vec3();
  private torchTimer = 0;
  private torchHeat = new Map<Body, number>();
  torchActive = false;
  /** callbacks for audio */
  onSound: ((name: string, x: number, y: number, z: number, vol: number) => void) | null = null;
  onIgnite: ((x: number, y: number, z: number) => void) | null = null;
  recoil = 0;
  private queuedFire = 0;

  constructor(readonly g: Game, readonly player: Player) {}

  select(t: Tool): void {
    if (t === this.current) return;
    this.release();
    this.current = t;
    this.anim = 0;
    this.cooldown = Math.max(this.cooldown, 0.25);
    this.onSound?.('switch', 0, 0, 0, 0.5);
  }

  /** eye position and view direction */
  private ray(out: { ox: number; oy: number; oz: number; dx: number; dy: number; dz: number }): void {
    const p = this.player;
    out.ox = p.pos.x; out.oy = p.eyeY; out.oz = p.pos.z;
    const cp = Math.cos(p.pitch);
    out.dx = -Math.sin(p.yaw) * cp; out.dy = Math.sin(p.pitch); out.dz = -Math.cos(p.yaw) * cp;
  }

  update(dt: number, input: Input, enabled: boolean): void {
    this.cooldown = Math.max(0, this.cooldown - dt);
    this.anim = Math.max(0, this.anim - dt * 2.5);
    this.recoil *= Math.max(0, 1 - dt * 8);
    if (enabled) {
      for (let i = 0; i < Tool.COUNT; i++) if (input.wasPressed(TOOL_KEYS[i])) this.select(i as Tool);
      if (input.wheel !== 0) this.select(((this.current + (input.wheel > 0 ? 1 : -1) + Tool.COUNT) % Tool.COUNT) as Tool);
      if (input.wasPressed('KeyE')) { if (this.held) this.release(); else this.tryGrab(); }
    }
    const fire = enabled && input.mouseDown(0);
    // a click shortly before the tool is ready (switching, reloading) is kept and fires when it is
    if (enabled && input.mousePressed(0)) this.queuedFire = 0.35;
    else this.queuedFire = Math.max(0, this.queuedFire - dt);
    const firePressed = enabled && this.queuedFire > 0 && this.cooldown <= 0;
    if (firePressed) this.queuedFire = 0;
    this.torchActive = false;
    if (this.held) {
      this.updateHeld(dt);
      if (firePressed) this.throwHeld();
    } else if (enabled) {
      switch (this.current) {
        case Tool.Hammer: if (fire && this.cooldown <= 0) this.hammer(); break;
        case Tool.Shotgun: if (firePressed && this.cooldown <= 0 && this.use()) this.shotgun(); break;
        case Tool.Rifle: if (firePressed && this.cooldown <= 0 && this.use()) this.rifle(); break;
        case Tool.PipeBomb: if (firePressed && this.cooldown <= 0 && this.use()) this.throwBomb(false); break;
        case Tool.Bomb: if (firePressed && this.cooldown <= 0 && this.use()) this.throwBomb(true); break;
        case Tool.Rocket: if (firePressed && this.cooldown <= 0 && this.use()) this.rocket(); break;
        case Tool.Torch: if (fire) this.torch(dt); break;
        case Tool.Grab: if (firePressed) this.tryGrab(); break;
      }
    }
    this.updateRockets(dt);
    this.updateFuses(dt);
  }

  private use(): boolean {
    if (this.infiniteAmmo) return true;
    if (this.ammo[this.current] <= 0) { this.onSound?.('empty', 0, 0, 0, 0.6); this.cooldown = 0.3; return false; }
    this.ammo[this.current]--;
    return true;
  }

  // ------------------------------------------------------------------ hammer
  private hammer(): void {
    this.cooldown = 0.42;
    this.anim = 1;
    const r = { ox: 0, oy: 0, oz: 0, dx: 0, dy: 0, dz: 0 };
    this.ray(r);
    if (!raycastAll(this.g.world, this.g.physics.bodies, r.ox, r.oy, r.oz, r.dx, r.dy, r.dz, 2.8, hit)) { this.onSound?.('swing', r.ox, r.oy, r.oz, 0.4); return; }
    const mat = PAL_MAT[hit.pal];
    const px = hit.x - hit.nx * 0.05, py = hit.y - hit.ny * 0.05, pz = hit.z - hit.nz * 0.05;
    const opts: CarveOpts = { maxHard: 2, blast: false, debris: 0.45, speed: 2.5, noise: 0.35, dust: 0.7, fromX: hit.x + hit.nx, fromY: hit.y + hit.ny, fromZ: hit.z + hit.nz };
    this.g.shake = Math.max(this.g.shake, 0.08);
    if (hit.body) {
      const b = hit.body;
      if (PAL_HARD[hit.pal] <= 2) this.g.destruction.carveBody(b, px, py, pz, 0.32, opts);
      b.updateDerived();
      b.applyImpulse(r.dx * 260, r.dy * 260, r.dz * 260, hit.x, hit.y, hit.z);
      b.wake();
    } else if (PAL_HARD[hit.pal] <= 2) {
      this.g.destruction.carveWorld(px, py, pz, 0.36, opts);
    } else if (mat === Mat.Metal) {
      this.dent(hit, r.dx, r.dy, r.dz);
    }
    this.onSound?.(mat === Mat.Metal || mat === Mat.HeavyMetal ? 'clang' : mat === Mat.Wood ? 'wood' : mat === Mat.Glass ? 'glass' : 'thud', hit.x, hit.y, hit.z, 1);
    if (mat === Mat.Metal || mat === Mat.HeavyMetal) this.sparks(hit.x, hit.y, hit.z, hit.nx, hit.ny, hit.nz, 12);
  }

  /** Bend thin metal: push surface voxels one voxel away from the hit. */
  private dent(h: RayHit, dx: number, dy: number, dz: number): void {
    const w = this.g.world;
    // dominant axis of the surface normal
    const ax = Math.abs(h.nx) > Math.abs(h.ny) ? (Math.abs(h.nx) > Math.abs(h.nz) ? 0 : 2) : (Math.abs(h.ny) > Math.abs(h.nz) ? 1 : 2);
    const sgn = (ax === 0 ? h.nx : ax === 1 ? h.ny : h.nz) > 0 ? -1 : 1; // push into the surface
    const cx = h.vx, cy = h.vy, cz = h.vz;
    let moved = 0;
    for (let a = -2; a <= 2; a++) for (let b = -2; b <= 2; b++) {
      if (a * a + b * b > 5) continue;
      const c = [cx, cy, cz];
      const o = ax === 0 ? [0, a, b] : ax === 1 ? [a, 0, b] : [a, b, 0];
      c[0] += o[0]; c[1] += o[1]; c[2] += o[2];
      // walk to the far side of the sheet (thin sheets only: up to 2 voxels thick)
      const v = w.get(c[0], c[1], c[2]);
      if (!v || PAL_MAT[v] !== Mat.Metal) continue;
      const n1 = [c[0], c[1], c[2]]; n1[ax] += sgn;
      const v1 = w.get(n1[0], n1[1], n1[2]);
      let tx = n1, thick = 1;
      if (v1) { const n2 = [n1[0], n1[1], n1[2]]; n2[ax] += sgn; if (w.get(n2[0], n2[1], n2[2])) continue; tx = n2; thick = 2; }
      if (a * a + b * b > 2 && Math.random() < 0.5) continue;
      // move the column: front voxel goes to the back
      w.set(tx[0], tx[1], tx[2], thick === 2 ? v1 : v);
      if (thick === 2) w.set(n1[0], n1[1], n1[2], v);
      w.set(c[0], c[1], c[2], 0);
      this.g.structure.noteRemoved(c[0], c[1], c[2]);
      moved++;
    }
    if (moved) w.noteChange(cx - 3, cy - 3, cz - 3, cx + 3, cy + 3, cz + 3);
  }

  private sparks(x: number, y: number, z: number, nx: number, ny: number, nz: number, n: number): void {
    const P2 = this.g.particles;
    for (let i = 0; i < n; i++) {
      const sp = 2 + Math.random() * 6;
      P2.spawn(PT.Spark, x, y, z, (nx + (Math.random() - 0.5) * 1.6) * sp, (ny + Math.random() * 0.8) * sp, (nz + (Math.random() - 0.5) * 1.6) * sp,
        0.02, 0.3 + Math.random() * 0.5, 1, 0.7, 0.3, 1, { emissive: 6, drag: 0.5 });
    }
  }

  // ------------------------------------------------------------------ guns
  private muzzle(r: { ox: number; oy: number; oz: number; dx: number; dy: number; dz: number }, strength: number): void {
    const x = r.ox + r.dx * 0.8, y = r.oy + r.dy * 0.8 - 0.15, z = r.oz + r.dz * 0.8;
    this.g.flashLight(x, y, z, 7, 14 * strength, 9 * strength, 4 * strength, 0.07);
    this.g.particles.spawn(PT.Flash, x, y, z, 0, 0, 0, 0.25 * strength, 0.06, 1, 0.8, 0.5, 1, { emissive: 8 });
    for (let i = 0; i < 4; i++) this.g.particles.spawn(PT.Smoke, x, y, z, r.dx * 2 + (Math.random() - 0.5), r.dy * 2 + 0.3, r.dz * 2 + (Math.random() - 0.5),
      0.12, 1.2 + Math.random(), 0.5, 0.5, 0.5, 0.35, { grow: 0.6, drag: 2, buoy: 0.3 });
  }

  private bullet(ox: number, oy: number, oz: number, dx: number, dy: number, dz: number, range: number, radius: number, impulse: number, penetrate: number): void {
    const g = this.g;
    let sx = ox, sy = oy, sz = oz, left = range;
    for (let pass = 0; pass <= penetrate; pass++) {
      if (!raycastAll(g.world, g.physics.bodies, sx, sy, sz, dx, dy, dz, left, hit)) return;
      const mat = PAL_MAT[hit.pal];
      const hard = PAL_HARD[hit.pal];
      const px = hit.x + dx * 0.03, py = hit.y + dy * 0.03, pz = hit.z + dz * 0.03;
      const opts: CarveOpts = { maxHard: 2, blast: false, debris: 0.6, speed: 3, noise: 0.25, dust: 0.35, fromX: hit.x - dx, fromY: hit.y - dy, fromZ: hit.z - dz };
      if (hit.body) {
        if (hard <= 2) g.destruction.carveBody(hit.body, px, py, pz, radius, opts);
        if (!hit.body.removed) {
          hit.body.updateDerived();
          hit.body.applyImpulse(dx * impulse, dy * impulse, dz * impulse, hit.x, hit.y, hit.z);
          hit.body.wake();
        }
      } else if (hard <= 2) g.destruction.carveWorld(px, py, pz, radius, opts);
      if (mat === Mat.Metal || mat === Mat.HeavyMetal || hard >= 3) this.sparks(hit.x, hit.y, hit.z, hit.nx, hit.ny, hit.nz, 6);
      else {
        // impact puff
        g.particles.spawn(PT.Dust, hit.x, hit.y, hit.z, hit.nx * 1.5, hit.ny * 1.5 + 0.3, hit.nz * 1.5, 0.12, 1.2, 0.6, 0.58, 0.55, 0.6, { grow: 0.5, drag: 2 });
      }
      if (mat === Mat.Explosive) g.destruction.schedule(hit.x, hit.y, hit.z, 1.2, 0.05);
      if (PAL_FLAMMABLE[hit.pal] > 0.5 && Math.random() < 0.05) this.onIgnite?.(hit.vx, hit.vy, hit.vz);
      this.onSound?.('impact_' + (mat === Mat.Metal || mat === Mat.HeavyMetal ? 'metal' : mat === Mat.Wood ? 'wood' : mat === Mat.Glass ? 'glass' : 'soft'), hit.x, hit.y, hit.z, 0.5);
      // penetrate soft materials
      if (!(mat === Mat.Wood || mat === Mat.Plaster || mat === Mat.Glass || mat === Mat.Foliage || mat === Mat.Fabric || mat === Mat.Plastic)) return;
      sx = hit.x + dx * 0.35; sy = hit.y + dy * 0.35; sz = hit.z + dz * 0.35;
      left -= hit.dist + 0.35;
      if (left <= 0) return;
    }
  }

  private shotgun(): void {
    this.cooldown = 0.85;
    this.anim = 1;
    this.recoil = 0.09;
    const r = { ox: 0, oy: 0, oz: 0, dx: 0, dy: 0, dz: 0 };
    this.ray(r);
    for (let i = 0; i < 10; i++) {
      const s = 0.055;
      let dx = r.dx + (Math.random() - 0.5) * s * 2, dy = r.dy + (Math.random() - 0.5) * s * 2, dz = r.dz + (Math.random() - 0.5) * s * 2;
      const l = Math.hypot(dx, dy, dz); dx /= l; dy /= l; dz /= l;
      this.bullet(r.ox, r.oy, r.oz, dx, dy, dz, 70, 0.14, 45, 0);
    }
    this.muzzle(r, 1.2);
    this.g.shake = Math.max(this.g.shake, 0.12);
    this.onSound?.('shotgun', r.ox, r.oy, r.oz, 1);
  }

  private rifle(): void {
    this.cooldown = 0.32;
    this.anim = 0.6;
    this.recoil = 0.035;
    const r = { ox: 0, oy: 0, oz: 0, dx: 0, dy: 0, dz: 0 };
    this.ray(r);
    this.bullet(r.ox, r.oy, r.oz, r.dx, r.dy, r.dz, 250, 0.11, 70, 3);
    this.muzzle(r, 0.8);
    this.g.shake = Math.max(this.g.shake, 0.05);
    this.onSound?.('rifle', r.ox, r.oy, r.oz, 1);
  }

  // ------------------------------------------------------------------ explosives
  private throwBomb(big: boolean): void {
    this.cooldown = 0.6;
    this.anim = 1;
    const r = { ox: 0, oy: 0, oz: 0, dx: 0, dy: 0, dz: 0 };
    this.ray(r);
    let vox: Uint8Array, sx: number, sy: number, sz: number;
    if (!big) {
      // pipe bomb: grey pipe with caps
      sx = 2; sy = 2; sz = 6;
      vox = new Uint8Array(sx * sy * sz).fill(P.steelDark);
      for (let i = 0; i < 4; i++) { vox[i] = P.paintBlack; vox[sx * sy * sz - 1 - i] = P.paintBlack; }
    } else {
      sx = 4; sy = 4; sz = 4;
      vox = new Uint8Array(64).fill(P.tnt);
      vox[1 + 4 * (0 + 4 * 3)] = P.paintBlack; vox[2 + 4 * (3 + 4 * 3)] = P.lampRed;
    }
    const ox = Math.floor((r.ox + r.dx * 0.7) * 10) - (sx >> 1), oy = Math.floor((r.oy + r.dy * 0.7 - 0.2) * 10) - (sy >> 1), oz = Math.floor((r.oz + r.dz * 0.7) * 10) - (sz >> 1);
    const sp = big ? 7 : 13;
    const b = this.g.spawnGrid(vox, sx, sy, sz, ox, oy, oz, new Vec3(r.dx * sp + this.player.vel.x, r.dy * sp + 2.5 + this.player.vel.y * 0.5, r.dz * sp + this.player.vel.z));
    if (!b) return;
    b.rot.setAxisAngle(0, 1, 0, -this.player.yaw).normalize();
    b.ang.set((Math.random() - 0.5) * 6, (Math.random() - 0.5) * 6, (Math.random() - 0.5) * 6);
    b.explosive = 0; // detonated by its fuse
    this.fuses.push({ body: b, t: big ? 5 : 3, power: big ? 9 : 1.8, blink: 0 });
    this.onSound?.('throw', r.ox, r.oy, r.oz, 0.6);
  }

  private updateFuses(dt: number): void {
    for (let i = this.fuses.length - 1; i >= 0; i--) {
      const f = this.fuses[i];
      f.t -= dt;
      if (f.body.removed) { this.fuses.splice(i, 1); continue; }
      f.blink -= dt;
      if (f.blink <= 0) {
        f.blink = Math.max(0.08, f.t * 0.15);
        this.g.flashLight(f.body.pos.x, f.body.pos.y + 0.2, f.body.pos.z, 3, 6, 0.6, 0.3, 0.06);
        this.onSound?.('beep', f.body.pos.x, f.body.pos.y, f.body.pos.z, 0.5);
        // smoking fuse
        this.g.particles.spawn(PT.Smoke, f.body.pos.x, f.body.pos.y + 0.15, f.body.pos.z, 0, 0.6, 0, 0.06, 1.5, 0.4, 0.4, 0.4, 0.4, { grow: 0.25, buoy: 0.4 });
      }
      if (f.t <= 0) {
        this.fuses.splice(i, 1);
        const b = f.body;
        const x = b.pos.x, y = b.pos.y, z = b.pos.z;
        this.g.removeBody(b);
        this.g.destruction.explode(x, y, z, f.power);
      }
    }
  }

  private rocket(): void {
    this.cooldown = 1.1;
    this.anim = 1;
    this.recoil = 0.06;
    const r = { ox: 0, oy: 0, oz: 0, dx: 0, dy: 0, dz: 0 };
    this.ray(r);
    this.rockets.push({ pos: new Vec3(r.ox + r.dx * 0.9, r.oy + r.dy * 0.9 - 0.12, r.oz + r.dz * 0.9), vel: new Vec3(r.dx * 38, r.dy * 38, r.dz * 38), life: 8, trail: 0 });
    this.muzzle(r, 1);
    this.onSound?.('rocket', r.ox, r.oy, r.oz, 1);
  }

  private updateRockets(dt: number): void {
    const g = this.g;
    for (let i = this.rockets.length - 1; i >= 0; i--) {
      const rk = this.rockets[i];
      rk.life -= dt;
      rk.vel.y -= 1.5 * dt;
      const sp = rk.vel.len();
      const dx = rk.vel.x / sp, dy = rk.vel.y / sp, dz = rk.vel.z / sp;
      const step = sp * dt;
      if (raycastAll(g.world, g.physics.bodies, rk.pos.x, rk.pos.y, rk.pos.z, dx, dy, dz, step, hit) || rk.life <= 0) {
        const x = rk.life <= 0 ? rk.pos.x : hit.x - dx * 0.15, y = rk.life <= 0 ? rk.pos.y : hit.y - dy * 0.15, z = rk.life <= 0 ? rk.pos.z : hit.z - dz * 0.15;
        this.rockets.splice(i, 1);
        g.destruction.explode(x, y, z, 4.5);
        continue;
      }
      rk.pos.addScaled(rk.vel, dt);
      // trail
      rk.trail += dt;
      while (rk.trail > 0.012) {
        rk.trail -= 0.012;
        const t = Math.random();
        g.particles.spawn(PT.Smoke, rk.pos.x - dx * step * t, rk.pos.y - dy * step * t, rk.pos.z - dz * step * t, (Math.random() - 0.5) * 0.4, 0.2, (Math.random() - 0.5) * 0.4,
          0.18, 2.5 + Math.random() * 2, 0.75, 0.74, 0.72, 0.55, { grow: 0.45, drag: 1.5, buoy: 0.15 });
      }
      g.particles.spawn(PT.Fire, rk.pos.x - dx * 0.2, rk.pos.y - dy * 0.2, rk.pos.z - dz * 0.2, -dx * 3, -dy * 3, -dz * 3, 0.16, 0.08, 1, 1, 1, 1, { emissive: 8 });
      g.flashLight(rk.pos.x, rk.pos.y, rk.pos.z, 6, 10, 6, 2, 0.03);
    }
  }

  // ------------------------------------------------------------------ blowtorch
  private torch(dt: number): void {
    const g = this.g;
    const r = { ox: 0, oy: 0, oz: 0, dx: 0, dy: 0, dz: 0 };
    this.ray(r);
    this.torchActive = true;
    const fx = r.ox + r.dx * 0.6, fy = r.oy + r.dy * 0.6 - 0.12, fz = r.oz + r.dz * 0.6;
    g.particles.spawn(PT.Fire, fx, fy, fz, r.dx * 3 + (Math.random() - 0.5) * 0.3, r.dy * 3 + 0.2, r.dz * 3 + (Math.random() - 0.5) * 0.3, 0.05, 0.12, 1, 1, 1, 1, { emissive: 4, drag: 2 });
    g.flashLight(fx, fy, fz, 4, 3, 2.4, 3.6, 0.05, 0.4);
    this.torchTimer -= dt;
    if (!raycastAll(g.world, g.physics.bodies, r.ox, r.oy, r.oz, r.dx, r.dy, r.dz, 1.9, hit)) return;
    if (Math.random() < 0.6) this.sparks(hit.x, hit.y, hit.z, hit.nx, hit.ny, hit.nz, 2);
    if (this.torchTimer > 0) return;
    this.torchTimer = 0.07;
    const hard = PAL_HARD[hit.pal];
    // harder materials cut slower
    if (Math.random() > [1, 0.9, 0.55, 0.45, 0.22, 0][Math.min(5, hard)]) return;
    const px = hit.x - hit.nx * 0.04, py = hit.y - hit.ny * 0.04, pz = hit.z - hit.nz * 0.04;
    const opts: CarveOpts = { maxHard: 4, blast: true, debris: 0.15, speed: 1, noise: 0.2, dust: 0.15 };
    if (hit.body) {
      g.destruction.carveBody(hit.body, px, py, pz, 0.09, opts);
      if (hit.body.explosive > 0) {
        const h = (this.torchHeat.get(hit.body) || 0) + 0.07;
        this.torchHeat.set(hit.body, h);
        if (h > 0.8) g.destruction.detonateBody(hit.body);
      }
    } else g.destruction.carveWorld(px, py, pz, 0.09, opts);
    if (PAL_FLAMMABLE[hit.pal] > 0 && Math.random() < 0.25) this.onIgnite?.(hit.vx, hit.vy, hit.vz);
    // glowing hot spot
    g.particles.spawn(PT.Ember, hit.x, hit.y, hit.z, hit.nx * 0.3, hit.ny * 0.3 + 0.2, hit.nz * 0.3, 0.05, 0.6, 1, 0.45, 0.1, 1, { emissive: 6, drag: 3 });
    this.onSound?.('torch', hit.x, hit.y, hit.z, 0.4);
  }

  // ------------------------------------------------------------------ grab
  private tryGrab(): void {
    const r = { ox: 0, oy: 0, oz: 0, dx: 0, dy: 0, dz: 0 };
    this.ray(r);
    if (!raycastAll(this.g.world, this.g.physics.bodies, r.ox, r.oy, r.oz, r.dx, r.dy, r.dz, 3.5, hit) || !hit.body) return;
    const b = hit.body;
    if (b.mass > 350) { this.onSound?.('deny', 0, 0, 0, 0.5); return; }
    this.held = b;
    b.held = true;
    b.wake();
    this.heldDist = Math.max(1.4, hit.dist);
    // grab point in local grid coordinates
    b.worldToGrid(hit.x, hit.y, hit.z, this.heldLocal);
    this.onSound?.('grab', hit.x, hit.y, hit.z, 0.5);
  }

  private updateHeld(dt: number): void {
    const b = this.held!;
    if (b.removed) { this.held = null; return; }
    const r = { ox: 0, oy: 0, oz: 0, dx: 0, dy: 0, dz: 0 };
    this.ray(r);
    const tx = r.ox + r.dx * this.heldDist, ty = r.oy + r.dy * this.heldDist, tz = r.oz + r.dz * this.heldDist;
    const gp = b.gridToWorld(this.heldLocal.x, this.heldLocal.y, this.heldLocal.z, new Vec3());
    // drive the grab point towards the target with a critically damped velocity target
    const k = 12;
    const vx = (tx - gp.x) * k, vy = (ty - gp.y) * k, vz = (tz - gp.z) * k;
    const pv = b.pointVel(gp.x, gp.y, gp.z, new Vec3());
    const m = Math.min(b.mass, 120);
    b.updateDerived();
    b.applyImpulse((vx - pv.x) * m * 0.35, (vy - pv.y) * m * 0.35 + 9.81 * dt * b.mass, (vz - pv.z) * m * 0.35, gp.x, gp.y, gp.z);
    b.ang.scale(0.9);
    b.wake();
    if (Math.hypot(tx - gp.x, ty - gp.y, tz - gp.z) > 2.5) this.release();
  }

  private throwHeld(): void {
    const b = this.held!;
    const r = { ox: 0, oy: 0, oz: 0, dx: 0, dy: 0, dz: 0 };
    this.ray(r);
    this.release();
    const sp = Math.min(18, 2200 / Math.max(b.mass, 10));
    b.vel.set(r.dx * sp, r.dy * sp + 1, r.dz * sp);
    this.onSound?.('throw', b.pos.x, b.pos.y, b.pos.z, 0.6);
  }

  release(): void {
    if (this.held) { this.held.held = false; this.held = null; }
  }
}

export { Quat };
