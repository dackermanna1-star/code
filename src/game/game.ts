// Central game state: owns the world, physics, bodies, renderer hooks and all gameplay systems.

import { World, VOXEL } from '../world/world';
import { RegionMeshes } from '../world/meshmanager';
import { Structure, DetachedPiece } from '../world/structure';
import { Stress, StressFailure } from '../world/stress';
import { Physics, ImpactEvent, DEBRIS_VOXELS } from '../physics/physics';
import { Body, trimGrid } from '../physics/body';
import { Renderer, Environment, PointLight } from '../render/renderer';
import { Particles } from '../render/particles';
import { BodyMeshes } from './bodymeshes';
import { Vec3 } from '../engine/math';
import type { Destruction } from './destruction';
import { PAL_FRICTION, PAL_RESTITUTION, PALETTE, PAL_RUBBLE, PAL_MAT, Mat, srgbToLinear } from '../world/materials';
import { PT } from '../render/particles';

export interface TimedLight extends PointLight { life: number; maxLife: number; flicker: number }

/** The part of the particle system the simulation talks to (a no-op stub is used headless). */
export interface ParticleSink {
  dn: number; bn: number;
  debris(x: number, y: number, z: number, vx: number, vy: number, vz: number, size: number, pal: number, life?: number, shape?: number): void;
  spawn(type: number, x: number, y: number, z: number, vx: number, vy: number, vz: number, size: number, life: number,
    r: number, g: number, b: number, a: number, opts?: { grow?: number; drag?: number; buoy?: number; emissive?: number; rotV?: number }): void;
  update(dt: number): void;
}

export class NullParticles implements ParticleSink {
  dn = 0; bn = 0;
  debris(): void { /* headless */ }
  spawn(): void { /* headless */ }
  update(): void { /* headless */ }
}

export class Game {
  readonly world: World;
  readonly meshes: RegionMeshes;
  readonly physics: Physics;
  readonly bodyMeshes: BodyMeshes;
  readonly particles: ParticleSink;
  readonly structure: Structure;
  readonly stress: Stress;
  destruction!: Destruction;
  /** hook: a structural link failed (for audio) */
  onCrumble: ((x: number, y: number, z: number, mat: number) => void) | null = null;
  env: Environment;
  time = 0;
  /** transient lights (explosions, muzzle flashes, fires) */
  lights: TimedLight[] = [];
  /** permanent lamps placed in the map: light + the voxel that emits it (destroying it switches it off) */
  lamps: { light: PointLight; vx: number; vy: number; vz: number; on: boolean }[] = [];
  /** bodies whose voxels changed and need remesh / split */
  private dirtyBodies = new Set<Body>();
  shake = 0;
  private crumbleDust = 0;
  stats = { bodies: 0, detached: 0, baked: 0 };
  /** ambient smoke / steam sources (chimneys, stacks); see emitAmbient */
  emitters: { x: number; y: number; z: number; kind: 'smoke' | 'steam'; rate: number; size: number; ax: number; ay: number; az: number; acc: number }[] = [];
  /** ground-level wind (m/s), shared with the particle system */
  get windX(): number { return (this.particles as { windX?: number }).windX ?? 0.6; }
  get windZ(): number { return (this.particles as { windZ?: number }).windZ ?? 0.25; }
  /** world position to keep clear when baking debris (the player) */
  keepClear: Vec3 | null = null;
  private bakeTimer = 0;
  onImpactHook: ((e: ImpactEvent) => void) | null = null;
  onBodySplit: ((parent: Body, child: Body) => void) | null = null;

  constructor(readonly renderer: Renderer | null, world: World, env: Environment, workers: number) {
    this.world = world;
    this.env = env;
    this.physics = new Physics(world);
    if (renderer) {
      this.meshes = new RegionMeshes(world, renderer.pool, workers);
      this.bodyMeshes = new BodyMeshes(renderer);
      const p = new Particles(renderer.gl, world);
      this.particles = p;
      renderer.geometryPasses.push(p);
      renderer.forwardPasses.push(p);
    } else {
      // headless simulation (tests): no GPU resources
      this.meshes = null as unknown as RegionMeshes;
      this.bodyMeshes = null as unknown as BodyMeshes;
      this.particles = new NullParticles();
    }
    this.structure = new Structure(world, (p) => this.onDetach(p));
    this.stress = new Stress(world);
    this.stress.onFail = (f) => this.crumble(f);
    this.physics.onRemove = (b) => this.removeBody(b);
    this.physics.onImpact = (e) => this.onImpactHook?.(e);
  }

  // ------------------------------------------------------------------ bodies
  /** Create a dynamic body from a voxel grid whose voxel (0,0,0) sits at world voxel (ox,oy,oz). */
  spawnGrid(vox: Uint8Array, sx: number, sy: number, sz: number, ox: number, oy: number, oz: number, vel?: Vec3, sleeping = false): Body | null {
    const t = trimGrid(vox, sx, sy, sz);
    if (!t) return null;
    const [g, nx, ny, nz, tx, ty, tz] = t;
    const b = new Body(nx, ny, nz, g);
    if (!b.computeMass()) return null;
    b.buildSamples();
    b.pos.set((ox + tx + b.com.x) * VOXEL, (oy + ty + b.com.y) * VOXEL, (oz + tz + b.com.z) * VOXEL);
    if (vel) b.vel.copy(vel);
    b.sleeping = sleeping;
    this.configureBody(b);
    this.physics.add(b);
    return b;
  }

  /** Material dependent friction/restitution from the most common voxel. */
  configureBody(b: Body): void {
    const counts = new Map<number, number>();
    const v = b.vox;
    const step = Math.max(1, (v.length / 512) | 0);
    for (let i = 0; i < v.length; i += step) if (v[i]) counts.set(v[i], (counts.get(v[i]) || 0) + 1);
    let best = 0, bc = -1;
    for (const [p, c] of counts) if (c > bc) { bc = c; best = p; }
    if (best) {
      b.friction = PAL_FRICTION[best];
      b.restitution = PAL_RESTITUTION[best];
    }
  }

  removeBody(b: Body): void {
    if (b.removed) return;
    this.physics.remove(b);
    this.bodyMeshes?.release(b);
    this.dirtyBodies.delete(b);
  }

  markBodyDirty(b: Body): void { this.dirtyBodies.add(b); b.meshDirty = true; }

  private onDetach(p: DetachedPiece): void {
    this.stats.detached++;
    if (p.count <= 12) {
      // tiny bits become debris particles
      for (let y = 0; y < p.sy; y++) for (let z = 0; z < p.sz; z++) for (let x = 0; x < p.sx; x++) {
        const v = p.vox[x + p.sx * (z + p.sz * y)];
        if (v) this.particles.debris((p.ox + x + 0.5) * VOXEL, (p.oy + y + 0.5) * VOXEL, (p.oz + z + 0.5) * VOXEL, 0, 0, 0, 0.1, v);
      }
      return;
    }
    const b = this.spawnGrid(p.vox, p.sx, p.sy, p.sz, p.ox, p.oy, p.oz);
    if (b) b.debris = true;
    if (b) {
      // a tiny nudge so perfectly balanced pieces still topple
      b.ang.set((Math.random() - 0.5) * 0.05, 0, (Math.random() - 0.5) * 0.05);
      b.age = 0;
    }
  }

  /** Re-evaluate a body after voxel removal: split into connected components, recompute mass. */
  private rebuildBody(b: Body): void {
    if (b.removed) return;
    const { sx, sy, sz, vox } = b;
    const n = sx * sy * sz;
    const label = new Int32Array(n);
    const stack: number[] = [];
    let comps = 0;
    const sizes: number[] = [0];
    for (let i = 0; i < n; i++) {
      if (!vox[i] || label[i]) continue;
      comps++;
      let size = 0;
      label[i] = comps; stack.push(i);
      while (stack.length) {
        const c = stack.pop()!;
        size++;
        const x = c % sx, r = (c - x) / sx, z = r % sz, y = (r - z) / sz;
        if (x > 0 && vox[c - 1] && !label[c - 1]) { label[c - 1] = comps; stack.push(c - 1); }
        if (x < sx - 1 && vox[c + 1] && !label[c + 1]) { label[c + 1] = comps; stack.push(c + 1); }
        if (z > 0 && vox[c - sx] && !label[c - sx]) { label[c - sx] = comps; stack.push(c - sx); }
        if (z < sz - 1 && vox[c + sx] && !label[c + sx]) { label[c + sx] = comps; stack.push(c + sx); }
        const sxz = sx * sz;
        if (y > 0 && vox[c - sxz] && !label[c - sxz]) { label[c - sxz] = comps; stack.push(c - sxz); }
        if (y < sy - 1 && vox[c + sxz] && !label[c + sxz]) { label[c + sxz] = comps; stack.push(c + sxz); }
      }
      sizes.push(size);
    }
    if (comps === 0) { this.removeBody(b); return; }
    // keep the largest component in b
    let keep = 1;
    for (let c = 2; c <= comps; c++) if (sizes[c] > sizes[keep]) keep = c;
    const oldCom = b.com.clone();
    const R = b.R;
    if (comps > 1) {
      for (let c = 1; c <= comps; c++) {
        if (c === keep) continue;
        // extract component c
        const sub = new Uint8Array(n);
        for (let i = 0; i < n; i++) if (label[i] === c) { sub[i] = vox[i]; vox[i] = 0; }
        if (sizes[c] <= 2) {
          for (let i = 0; i < n; i++) if (sub[i]) {
            const x = i % sx, r = (i - x) / sx, z = r % sz, y = (r - z) / sz;
            const p = b.gridToWorld(x + 0.5, y + 0.5, z + 0.5, new Vec3());
            const v = b.pointVel(p.x, p.y, p.z, new Vec3());
            this.particles.debris(p.x, p.y, p.z, v.x, v.y, v.z, 0.1, sub[i]);
          }
          continue;
        }
        const t = trimGrid(sub, sx, sy, sz);
        if (!t) continue;
        const [g, nx, ny, nz, tx, ty, tz] = t;
        const nb = new Body(nx, ny, nz, g);
        if (!nb.computeMass()) continue;
        nb.buildSamples();
        nb.rot.copy(b.rot);
        // COM of the new piece in b's grid coordinates
        const cx = nb.com.x + tx, cy = nb.com.y + ty, cz = nb.com.z + tz;
        const lx = (cx - oldCom.x) * VOXEL, ly = (cy - oldCom.y) * VOXEL, lz = (cz - oldCom.z) * VOXEL;
        nb.pos.set(b.pos.x + R[0] * lx + R[1] * ly + R[2] * lz, b.pos.y + R[3] * lx + R[4] * ly + R[5] * lz, b.pos.z + R[6] * lx + R[7] * ly + R[8] * lz);
        b.pointVel(nb.pos.x, nb.pos.y, nb.pos.z, nb.vel);
        nb.ang.copy(b.ang);
        nb.friction = b.friction; nb.restitution = b.restitution;
        nb.debris = true;
        this.physics.add(nb);
        this.onBodySplit?.(b, nb);
      }
    }
    // remaining piece: tiny -> particles
    if (sizes[keep] <= 2) {
      for (let i = 0; i < n; i++) if (vox[i]) {
        const x = i % sx, r = (i - x) / sx, z = r % sz, y = (r - z) / sz;
        const p = b.gridToWorld(x + 0.5, y + 0.5, z + 0.5, new Vec3());
        this.particles.debris(p.x, p.y, p.z, b.vel.x, b.vel.y, b.vel.z, 0.1, vox[i]);
      }
      this.removeBody(b);
      return;
    }
    // trim and recompute mass, keeping voxels in place
    const t = trimGrid(vox, sx, sy, sz)!;
    const [g, nx, ny, nz, tx, ty, tz] = t;
    b.vox = g; b.sx = nx; b.sy = ny; b.sz = nz;
    b.computeMass();
    b.buildSamples();
    b.pvox = null; b.wsStep = -1;
    const cx = b.com.x + tx, cy = b.com.y + ty, cz = b.com.z + tz;
    const lx = (cx - oldCom.x) * VOXEL, ly = (cy - oldCom.y) * VOXEL, lz = (cz - oldCom.z) * VOXEL;
    const npx = b.pos.x + R[0] * lx + R[1] * ly + R[2] * lz, npy = b.pos.y + R[3] * lx + R[4] * ly + R[5] * lz, npz = b.pos.z + R[6] * lx + R[7] * ly + R[8] * lz;
    b.pointVel(npx, npy, npz, b.vel);
    b.pos.set(npx, npy, npz);
    b.prevPos.copy(b.pos);
    b.updateDerived();
    b.meshDirty = true;
    b.wake();
    (b as any)._lastRows = undefined;
  }

  /** A structural link failed: the face layer of voxels between two cells crumbles away. */
  private crumble(f: StressFailure): void {
    const w = this.world, P = this.particles;
    const ax = f.dir >> 1; // 0 x, 1 y, 2 z
    const pos = (f.dir & 1) === 0 ? 3 : 0; // +dir -> far layer, -dir -> near layer
    let n = 0, mx = 0, my = 0, mz = 0, pal = 0;
    for (let a = 0; a < 4; a++) for (let b = 0; b < 4; b++) {
      for (let layer = 0; layer < 2; layer++) {
        const o = [0, 0, 0];
        o[ax] = layer === 0 ? pos : pos + ((f.dir & 1) === 0 ? 1 : -1);
        if (layer === 1 && Math.random() < 0.6) continue; // jagged crack into the neighbour
        o[(ax + 1) % 3] = a; o[(ax + 2) % 3] = b;
        const x = f.x + o[0], y = f.y + o[1], z = f.z + o[2];
        const v = w.get(x, y, z);
        if (!v || y < 2) continue;
        w.set(x, y, z, 0);
        this.structure.noteRemoved(x, y, z);
        n++; mx += x; my += y; mz += z; pal = v;
        if (Math.random() < 0.12) P.debris((x + 0.5) * VOXEL, (y + 0.5) * VOXEL, (z + 0.5) * VOXEL, (Math.random() - 0.5) * 1.5, Math.random(), (Math.random() - 0.5) * 1.5, 0.08, v, 6);
      }
    }
    if (n === 0) return;
    const cx = (mx / n + 0.5) * VOXEL, cy = (my / n + 0.5) * VOXEL, cz = (mz / n + 0.5) * VOXEL;
    w.noteChange(f.x - 2, f.y - 2, f.z - 2, f.x + 6, f.y + 6, f.z + 6);
    const e = PALETTE[pal];
    const r = Math.min(1, srgbToLinear(e.r) * 1.2 + 0.1), g = Math.min(1, srgbToLinear(e.g) * 1.2 + 0.1), b = Math.min(1, srgbToLinear(e.b) * 1.2 + 0.1);
    // dust budget per frame: big collapses produce hundreds of crumbles per second
    const nd = this.crumbleDust > 40 ? (Math.random() < 0.25 ? 1 : 0) : 2;
    this.crumbleDust += nd;
    for (let i = 0; i < nd; i++) P.spawn(PT.Dust, cx + (Math.random() - 0.5) * 0.4, cy, cz + (Math.random() - 0.5) * 0.4, (Math.random() - 0.5) * 0.8, -0.2, (Math.random() - 0.5) * 0.8,
      0.45 + Math.random() * 0.35, 3 + Math.random() * 3, r, g, b, 0.5, { grow: 0.45, drag: 1.5, buoy: 0.02 });
    this.onCrumble?.(cx, cy, cz, pal);
  }

  // ------------------------------------------------------------------ lights
  flashLight(x: number, y: number, z: number, radius: number, r: number, g: number, b: number, life: number, flicker = 0): TimedLight {
    const L: TimedLight = { x, y, z, radius, r, g, b, life, maxLife: life, flicker };
    this.lights.push(L);
    return L;
  }

  /** Lights to render this frame (most relevant first). */
  gatherLights(cx: number, cy: number, cz: number, max: number): PointLight[] {
    const out: { l: PointLight; s: number }[] = [];
    for (const L of this.lights) {
      const k = L.life / L.maxLife;
      const f = L.flicker > 0 ? 1 - L.flicker * (0.5 + 0.5 * Math.sin(this.time * 31 + L.x * 7) * Math.sin(this.time * 17.3 + L.z * 3)) : 1;
      const s = k * k * f;
      const pl = { x: L.x, y: L.y, z: L.z, radius: L.radius, r: L.r * s, g: L.g * s, b: L.b * s };
      const d = Math.hypot(L.x - cx, L.y - cy, L.z - cz);
      out.push({ l: pl, s: (L.r + L.g + L.b) * s / (1 + d * d * 0.01) + 1000 });
    }
    for (const lamp of this.lamps) {
      if (!lamp.on) continue;
      const L = lamp.light;
      const d = Math.hypot(L.x - cx, L.y - cy, L.z - cz);
      if (d > 90) continue;
      out.push({ l: L, s: (L.r + L.g + L.b) / (1 + d * d * 0.02) });
    }
    out.sort((a, b) => b.s - a.s);
    return out.slice(0, max).map((o) => o.l);
  }

  /** Run the ambient emitters for a while so plumes are already standing when play starts. */
  prewarmAmbient(seconds: number): void {
    for (let t = 0; t < seconds; t += 0.1) { this.emitAmbient(0.1); this.particles.update(0.1); }
  }

  /** Chimney smoke and stack steam, as long as the chimney / stack top still exists. */
  private emitAmbient(dt: number): void {
    const P = this.particles;
    for (let i = this.emitters.length - 1; i >= 0; i--) {
      const e = this.emitters[i];
      e.acc += dt * e.rate;
      if (e.acc < 1) continue;
      e.acc -= 1;
      if (!this.world.get(e.ax, e.ay, e.az)) { this.emitters.splice(i, 1); continue; }
      const x = (e.x + 0.5) * VOXEL + (Math.random() - 0.5) * e.size, y = (e.y + 0.5) * VOXEL, z = (e.z + 0.5) * VOXEL + (Math.random() - 0.5) * e.size;
      // plumes lean downwind: up there the wind is a few times stronger than at ground level
      const wx = this.windX * 2.5, wz = this.windZ * 2.5;
      if (e.kind === 'smoke') {
        const sh = 0.3 + Math.random() * 0.12;
        P.spawn(PT.Smoke, x, y, z, wx + (Math.random() - 0.5) * 0.4, 2.6 + Math.random(), wz + (Math.random() - 0.5) * 0.4,
          e.size * (0.8 + Math.random() * 0.4), 18 + Math.random() * 8, sh, sh * 0.98, sh * 0.95, 0.6, { grow: 0.55, drag: 0.15, buoy: 0.12 });
      } else {
        P.spawn(PT.Steam, x, y, z, wx + (Math.random() - 0.5) * 0.3, 3 + Math.random(), wz + (Math.random() - 0.5) * 0.3,
          e.size * (0.8 + Math.random() * 0.4), 6 + Math.random() * 3, 0.9, 0.9, 0.92, 0.5, { grow: 0.6, drag: 0.3, buoy: 0.15 });
      }
    }
  }

  /**
   * Small fragments that have rested for a while become part of the static world as rubble: debris keeps
   * accumulating (and stays destructible) without the physics cost of hundreds of sleeping bodies.
   */
  private bakeDebris(): void {
    const tmp = new Vec3();
    let baked = 0;
    const bodies = this.physics.bodies;
    for (let i = bodies.length - 1; i >= 0 && baked < 40; i--) {
      const b = bodies[i];
      if (!b.sleeping || !b.debris || b.held || b.kinematic || b.count > DEBRIS_VOXELS) continue;
      if (++b.restTicks < 4) continue;
      const k = this.keepClear;
      if (k && Math.abs(k.x - b.pos.x) < 1.2 && Math.abs(k.z - b.pos.z) < 1.2 && b.pos.y > k.y - 0.5 && b.pos.y < k.y + 2.4) continue;
      const cells: number[] = [];
      let supported = false;
      for (let y = 0; y < b.sy; y++) for (let z = 0; z < b.sz; z++) for (let x = 0; x < b.sx; x++) {
        const v = b.vox[x + b.sx * (z + b.sz * y)];
        if (!v || PAL_MAT[v] === Mat.Glass) continue;
        b.gridToWorld(x + 0.5, y + 0.5, z + 0.5, tmp);
        const gx = Math.floor(tmp.x * 10), gy = Math.floor(tmp.y * 10), gz = Math.floor(tmp.z * 10);
        if (!this.world.inBounds(gx, gy, gz) || this.world.get(gx, gy, gz)) continue;
        if (this.world.get(gx, gy - 1, gz)) supported = true;
        cells.push(gx, gy, gz, PAL_RUBBLE[v] || v);
      }
      // only fragments lying on the static world (not on another body) are baked
      if (!supported) continue;
      for (let c = 0; c < cells.length; c += 4) this.world.set(cells[c], cells[c + 1], cells[c + 2], cells[c + 3]);
      this.removeBody(b);
      this.stats.baked++;
      baked++;
    }
  }

  // ------------------------------------------------------------------ frame
  /** Fixed-step simulation. */
  prof: Record<string, number> = {};
  step(dt: number): void {
    this.time += dt;
    this.crumbleDust = Math.max(0, this.crumbleDust - dt * 120);
    let tt = performance.now();
    const lap = (k: string) => { const n = performance.now(); this.prof[k] = Math.max(this.prof[k] || 0, n - tt); tt = n; };
    this.physics.step(dt);
    lap('physics');
    // wake bodies near world modifications
    const cb = this.world.changeBoxes;
    for (let i = 0; i < cb.length; i += 6) {
      this.physics.wakeBox(cb[i] * VOXEL - 0.3, cb[i + 1] * VOXEL - 0.3, cb[i + 2] * VOXEL - 0.3, cb[i + 3] * VOXEL + 0.3, cb[i + 4] * VOXEL + 0.6, cb[i + 5] * VOXEL + 0.3);
    }
    cb.length = 0;
    lap('wake');
    this.structure.process();
    lap('structure');
    this.stress.update(dt);
    lap('stress');
    for (const b of this.dirtyBodies) this.rebuildBody(b);
    this.dirtyBodies.clear();
    lap('rebuild');
    this.particles.update(dt);
    lap('particles');
    this.bakeTimer += dt;
    if (this.bakeTimer >= 0.5) { this.bakeTimer = 0; this.bakeDebris(); }
    this.emitAmbient(dt);
    for (let i = this.lights.length - 1; i >= 0; i--) {
      this.lights[i].life -= dt;
      if (this.lights[i].life <= 0) this.lights.splice(i, 1);
    }
    // lamps: switch off if their emitter voxel is gone
    if (((this.time * 4) | 0) % 2 === 0) {
      for (const l of this.lamps) if (l.on && !this.world.get(l.vx, l.vy, l.vz)) l.on = false;
    }
    this.stats.bodies = this.physics.bodies.length;
  }
}
