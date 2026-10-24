// Central game state: owns the world, physics, bodies, renderer hooks and all gameplay systems.

import { World, VOXEL } from '../world/world';
import { RegionMeshes } from '../world/meshmanager';
import { Structure, DetachedPiece } from '../world/structure';
import { Physics, ImpactEvent } from '../physics/physics';
import { Body, trimGrid } from '../physics/body';
import { Renderer, Environment, PointLight } from '../render/renderer';
import { Particles } from '../render/particles';
import { BodyMeshes } from './bodymeshes';
import { Vec3 } from '../engine/math';
import type { Destruction } from './destruction';
import { PAL_FRICTION, PAL_RESTITUTION } from '../world/materials';

export interface TimedLight extends PointLight { life: number; maxLife: number; flicker: number }

export class Game {
  readonly world: World;
  readonly meshes: RegionMeshes;
  readonly physics: Physics;
  readonly bodyMeshes: BodyMeshes;
  readonly particles: Particles;
  readonly structure: Structure;
  destruction!: Destruction;
  env: Environment;
  time = 0;
  /** transient lights (explosions, muzzle flashes, fires) */
  lights: TimedLight[] = [];
  /** permanent lamps placed in the map: light + the voxel that emits it (destroying it switches it off) */
  lamps: { light: PointLight; vx: number; vy: number; vz: number; on: boolean }[] = [];
  /** bodies whose voxels changed and need remesh / split */
  private dirtyBodies = new Set<Body>();
  shake = 0;
  stats = { bodies: 0, detached: 0 };
  onImpactHook: ((e: ImpactEvent) => void) | null = null;
  onBodySplit: ((parent: Body, child: Body) => void) | null = null;

  constructor(readonly renderer: Renderer, world: World, env: Environment, workers: number) {
    this.world = world;
    this.env = env;
    this.meshes = new RegionMeshes(world, renderer.pool, workers);
    this.physics = new Physics(world);
    this.bodyMeshes = new BodyMeshes(renderer);
    this.particles = new Particles(renderer.gl, world);
    renderer.geometryPasses.push(this.particles);
    renderer.forwardPasses.push(this.particles);
    this.structure = new Structure(world, (p) => this.onDetach(p));
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
    this.bodyMeshes.release(b);
    this.dirtyBodies.delete(b);
  }

  markBodyDirty(b: Body): void { this.dirtyBodies.add(b); b.meshDirty = true; }

  private onDetach(p: DetachedPiece): void {
    this.stats.detached++;
    if (p.count <= 2) {
      // tiny bits become debris particles
      for (let y = 0; y < p.sy; y++) for (let z = 0; z < p.sz; z++) for (let x = 0; x < p.sx; x++) {
        const v = p.vox[x + p.sx * (z + p.sz * y)];
        if (v) this.particles.debris((p.ox + x + 0.5) * VOXEL, (p.oy + y + 0.5) * VOXEL, (p.oz + z + 0.5) * VOXEL, 0, 0, 0, 0.1, v);
      }
      return;
    }
    const b = this.spawnGrid(p.vox, p.sx, p.sy, p.sz, p.ox, p.oy, p.oz);
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

  // ------------------------------------------------------------------ frame
  /** Fixed-step simulation. */
  prof: Record<string, number> = {};
  step(dt: number): void {
    this.time += dt;
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
    for (const b of this.dirtyBodies) this.rebuildBody(b);
    this.dirtyBodies.clear();
    lap('rebuild');
    this.particles.update(dt);
    lap('particles');
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
