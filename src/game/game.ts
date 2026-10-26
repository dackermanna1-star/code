// Central game state: owns the world, physics, bodies, renderer hooks and all gameplay systems.

import { World, VOXEL } from '../world/world';
import { RegionMeshes } from '../world/meshmanager';
import { Structure, DetachedPiece } from '../world/structure';
import { Physics, ImpactEvent, DEBRIS_VOXELS } from '../physics/physics';
import { Body, trimGrid } from '../physics/body';
import { Renderer, Environment, PointLight } from '../render/renderer';
import { Particles } from '../render/particles';
import { BodyMeshes, bodyUsesBlocks } from './bodymeshes';
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
  destruction!: Destruction;
  /** hook: a sizeable piece lost its last connection to the ground (for audio) */
  onBreakFree: ((x: number, y: number, z: number, count: number) => void) | null = null;
  env: Environment;
  time = 0;
  /** transient lights (explosions, muzzle flashes, fires) */
  lights: TimedLight[] = [];
  /** permanent lamps placed in the map: light + the voxel that emits it (destroying it switches it off) */
  lamps: { light: PointLight; vx: number; vy: number; vz: number; on: boolean }[] = [];
  /** bodies whose voxels changed and need remesh / split */
  private dirtyBodies = new Set<Body>();
  shake = 0;
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
      this.bodyMeshes = new BodyMeshes(renderer, this.meshes);
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

  /**
   * Voxels of a body changed (box: grid coords x0,y0,z0,x1,y1,z1 inclusive, omitted = anywhere; removed:
   * how many voxels went): the body is re-split, re-sampled and remeshed where it changed.
   */
  markBodyDirty(b: Body, box?: number[], removed = 0): void {
    const pending = this.dirtyBodies.has(b);
    b.damageBox = pending ? growBox(b.damageBox, box) : box ? box.slice() : null;
    b.damageRemoved = (pending ? b.damageRemoved : 0) + removed;
    this.dirtyBodies.add(b);
    this.touchMesh(b, box);
  }

  /** The mesh of b must be rebuilt within box (omitted: entirely). */
  private touchMesh(b: Body, box?: number[]): void {
    b.meshBox = b.meshDirty ? growBox(b.meshBox, box) : box ? box.slice() : null;
    b.meshDirty = true;
  }

  private onDetach(p: DetachedPiece): boolean {
    this.stats.detached++;
    if (p.count <= 24) {
      // tiny bits become debris particles
      for (let y = 0; y < p.sy; y++) for (let z = 0; z < p.sz; z++) for (let x = 0; x < p.sx; x++) {
        const v = p.vox[x + p.sx * (z + p.sz * y)];
        if (v) this.particles.debris((p.ox + x + 0.5) * VOXEL, (p.oy + y + 0.5) * VOXEL, (p.oz + z + 0.5) * VOXEL, 0, 0, 0, 0.1, v);
      }
      return false;
    }
    const b = this.spawnGrid(p.vox, p.sx, p.sy, p.sz, p.ox, p.oy, p.oz);
    if (b) b.debris = true;
    if (b && p.count > 200) this.onBreakFree?.(b.pos.x, b.pos.y, b.pos.z, p.count);
    if (b) {
      // a tiny nudge so perfectly balanced pieces still topple
      b.ang.set((Math.random() - 0.5) * 0.05, 0, (Math.random() - 0.5) * 0.05);
      b.age = 0;
    }
    // a big piece is meshed on the workers over a few frames: until then the world keeps drawing it
    if (b && this.bodyMeshes && bodyUsesBlocks(b)) {
      b.worldDirtyBox = [p.ox, p.oy, p.oz, p.ox + p.sx - 1, p.oy + p.sy - 1, p.oz + p.sz - 1];
      return true;
    }
    return false;
  }

  /** Re-evaluate a body after voxel removal: split into connected components, recompute mass. */
  /** A piece that came off body b (grid g placed at tx,ty,tz in b's grid) continues as its own body. */
  private spawnPiece(b: Body, g: Uint8Array, nx: number, ny: number, nz: number, tx: number, ty: number, tz: number, oldCom: Vec3): void {
    const nb = new Body(nx, ny, nz, g);
    if (!nb.computeMass()) return;
    nb.buildSamples();
    nb.rot.copy(b.rot);
    // COM of the new piece in b's grid coordinates
    const R = b.R;
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

  private markBuf = new Int32Array(0);
  private markId = 0;
  /**
   * Split check for a big body after local damage: bounded flood fills from the voxels around the damaged
   * box. A fill that ends before LIMIT voxels is a piece that came off; one that grows past it (or runs
   * into such a fill) is the main body. Returns false when that is ambiguous (two big parts?) and the
   * full check has to run. Mass and samples are updated locally, so the cost follows the damage, not the
   * body size.
   */
  private splitLocal(b: Body, box: number[], removed: number): boolean {
    const { sx, sy, sz, vox } = b;
    const n = sx * sy * sz, sxz = sx * sz;
    if (this.markBuf.length < n) { this.markBuf = new Int32Array(n); this.markId = 0; }
    if (this.markId > 2e9) { this.markBuf.fill(0); this.markId = 0; }
    const mark = this.markBuf, base = this.markId;
    const x0 = Math.max(0, box[0] - 1), y0 = Math.max(0, box[1] - 1), z0 = Math.max(0, box[2] - 1);
    const x1 = Math.min(sx - 1, box[3] + 1), y1 = Math.min(sy - 1, box[4] + 1), z1 = Math.min(sz - 1, box[5] + 1);
    // a fill counts as the main body once it holds several times the material around the damage: by then
    // it has spread well past the damaged box, so fills from elsewhere in the box run into it
    let solid = 0;
    for (let y = y0; y <= y1; y++) for (let z = z0; z <= z1; z++) {
      let i = x0 + sx * (z + sz * y);
      for (let x = x0; x <= x1; x++, i++) if (vox[i]) solid++;
    }
    // (a fill past half the body is the main body by definition)
    const LIMIT = Math.min(b.count * 0.5, Math.max(20000, solid * 2));
    // first fill from the solid voxel nearest the middle of the damage, so it spreads over the box evenly
    const mx = (x0 + x1) >> 1, my = (y0 + y1) >> 1, mz = (z0 + z1) >> 1;
    let first = -1;
    for (let rr = 0; first < 0 && rr <= Math.max(x1 - x0, y1 - y0, z1 - z0); rr++) {
      for (let y = Math.max(y0, my - rr); y <= Math.min(y1, my + rr) && first < 0; y++) for (let z = Math.max(z0, mz - rr); z <= Math.min(z1, mz + rr) && first < 0; z++) {
        for (let x = Math.max(x0, mx - rr); x <= Math.min(x1, mx + rr); x++) {
          if (Math.max(Math.abs(x - mx), Math.abs(y - my), Math.abs(z - mz)) !== rr) continue; // shell only
          const i = x + sx * (z + sz * y);
          if (vox[i]) { first = i; break; }
        }
      }
    }
    const pieces: number[][] = [];
    let bigs = 0;
    const q: number[] = [];
    /** Fill from voxel s0; false when this shows two big parts (the full check must decide). */
    const fill = (s0: number): boolean => {
      if (!vox[s0] || mark[s0] > base) return true;
      const id = ++this.markId;
      mark[s0] = id;
      q.length = 0; q.push(s0);
      let head = 0, main = false;
      // breadth first, so the visited set is a ball around the damage that later fills run into quickly
      while (head < q.length && !main) {
        if (q.length > LIMIT) { main = true; bigs++; break; }
        const c = q[head++];
        const cx = c % sx, r = (c - cx) / sx, cz = r % sz, cy = (r - cz) / sz;
        for (let k = 0; k < 6; k++) {
          let nbi: number;
          if (k === 0) { if (cx === 0) continue; nbi = c - 1; } else if (k === 1) { if (cx === sx - 1) continue; nbi = c + 1; }
          else if (k === 2) { if (cz === 0) continue; nbi = c - sx; } else if (k === 3) { if (cz === sz - 1) continue; nbi = c + sx; }
          else if (k === 4) { if (cy === 0) continue; nbi = c - sxz; } else { if (cy === sy - 1) continue; nbi = c + sxz; }
          if (!vox[nbi]) continue;
          const m = mark[nbi];
          if (m === id) continue;
          if (m > base) { main = true; break; } // reached an earlier fill that grew big: connected to the main body
          mark[nbi] = id;
          q.push(nbi);
        }
      }
      if (bigs > 1) return false;
      if (!main) pieces.push(q.slice());
      return true;
    };
    if (first >= 0 && !fill(first)) return false;
    for (let y = y0; y <= y1; y++) for (let z = z0; z <= z1; z++) for (let x = x0; x <= x1; x++) {
      if (!fill(x + sx * (z + sz * y))) return false;
    }
    // only small parts around the damage (the main body is elsewhere?): let the full check decide
    if (bigs === 0 && pieces.length > 0) return false;
    const oldCom = b.com.clone();
    let lost = removed;
    const mbox = box.slice();
    for (const list of pieces) {
      let px0 = sx, py0 = sy, pz0 = sz, px1 = 0, py1 = 0, pz1 = 0;
      for (const c of list) {
        const cx = c % sx, r = (c - cx) / sx, cz = r % sz, cy = (r - cz) / sz;
        if (cx < px0) px0 = cx; if (cx > px1) px1 = cx; if (cy < py0) py0 = cy; if (cy > py1) py1 = cy; if (cz < pz0) pz0 = cz; if (cz > pz1) pz1 = cz;
      }
      const nx = px1 - px0 + 1, ny = py1 - py0 + 1, nz = pz1 - pz0 + 1;
      const g = new Uint8Array(nx * ny * nz);
      for (const c of list) {
        const cx = c % sx, r = (c - cx) / sx, cz = r % sz, cy = (r - cz) / sz;
        g[(cx - px0) + nx * ((cz - pz0) + nz * (cy - py0))] = vox[c];
        vox[c] = 0;
      }
      lost += list.length;
      mbox[0] = Math.min(mbox[0], px0); mbox[1] = Math.min(mbox[1], py0); mbox[2] = Math.min(mbox[2], pz0);
      mbox[3] = Math.max(mbox[3], px1); mbox[4] = Math.max(mbox[4], py1); mbox[5] = Math.max(mbox[5], pz1);
      if (list.length <= 6) {
        for (const c of list) {
          const cx = c % sx, r = (c - cx) / sx, cz = r % sz, cy = (r - cz) / sz;
          const p = b.gridToWorld(cx + 0.5, cy + 0.5, cz + 0.5, new Vec3());
          const v = b.pointVel(p.x, p.y, p.z, new Vec3());
          this.particles.debris(p.x, p.y, p.z, v.x, v.y, v.z, 0.1, g[(cx - px0) + nx * ((cz - pz0) + nz * (cy - py0))]);
        }
      } else this.spawnPiece(b, g, nx, ny, nz, px0, py0, pz0, oldCom);
    }
    if (pieces.length) this.touchMesh(b, mbox);
    // mass properties: a few voxels off a huge body change nothing visible; recompute after real losses
    b.count = Math.max(1, b.count - lost);
    if (lost > b.count * 0.02) {
      b.computeMass();
      const R = b.R;
      const lx = (b.com.x - oldCom.x) * VOXEL, ly = (b.com.y - oldCom.y) * VOXEL, lz = (b.com.z - oldCom.z) * VOXEL;
      const npx = b.pos.x + R[0] * lx + R[1] * ly + R[2] * lz, npy = b.pos.y + R[3] * lx + R[4] * ly + R[5] * lz, npz = b.pos.z + R[6] * lx + R[7] * ly + R[8] * lz;
      b.pointVel(npx, npy, npz, b.vel);
      b.pos.set(npx, npy, npz);
      b.prevPos.copy(b.pos);
      b.updateDerived();
      (b as any)._lastRows = undefined;
    }
    b.refreshSamples(mbox[0], mbox[1], mbox[2], mbox[3], mbox[4], mbox[5]);
    b.pvox = null;
    b.wake();
    return true;
  }

  private rebuildBody(b: Body): void {
    if (b.removed) return;
    const box = b.damageBox, removed = b.damageRemoved;
    b.damageBox = null; b.damageRemoved = 0;
    if (box && b.count > 40000 && this.splitLocal(b, box, removed)) return;
    const { sx, sy, sz, vox } = b;
    const n = sx * sy * sz;
    const label = new Int32Array(n);
    const stack: number[] = [];
    let comps = 0;
    const sizes: number[] = [0];
    const boxes: number[] = [0, 0, 0, 0, 0, 0]; // per component: min x, y, z, max x, y, z
    for (let i = 0; i < n; i++) {
      if (!vox[i] || label[i]) continue;
      comps++;
      let size = 0;
      let bx0 = sx, by0 = sy, bz0 = sz, bx1 = 0, by1 = 0, bz1 = 0;
      label[i] = comps; stack.push(i);
      while (stack.length) {
        const c = stack.pop()!;
        size++;
        const x = c % sx, r = (c - x) / sx, z = r % sz, y = (r - z) / sz;
        if (x < bx0) bx0 = x; if (x > bx1) bx1 = x; if (y < by0) by0 = y; if (y > by1) by1 = y; if (z < bz0) bz0 = z; if (z > bz1) bz1 = z;
        if (x > 0 && vox[c - 1] && !label[c - 1]) { label[c - 1] = comps; stack.push(c - 1); }
        if (x < sx - 1 && vox[c + 1] && !label[c + 1]) { label[c + 1] = comps; stack.push(c + 1); }
        if (z > 0 && vox[c - sx] && !label[c - sx]) { label[c - sx] = comps; stack.push(c - sx); }
        if (z < sz - 1 && vox[c + sx] && !label[c + sx]) { label[c + sx] = comps; stack.push(c + sx); }
        const sxz = sx * sz;
        if (y > 0 && vox[c - sxz] && !label[c - sxz]) { label[c - sxz] = comps; stack.push(c - sxz); }
        if (y < sy - 1 && vox[c + sxz] && !label[c + sxz]) { label[c + sxz] = comps; stack.push(c + sxz); }
      }
      sizes.push(size);
      boxes.push(bx0, by0, bz0, bx1, by1, bz1);
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
        // extract component c from its bounding box (not the whole grid: a big body can shed many pieces)
        const tx = boxes[c * 6], ty = boxes[c * 6 + 1], tz = boxes[c * 6 + 2];
        const nx = boxes[c * 6 + 3] - tx + 1, ny = boxes[c * 6 + 4] - ty + 1, nz = boxes[c * 6 + 5] - tz + 1;
        const g = new Uint8Array(nx * ny * nz);
        for (let y = 0; y < ny; y++) for (let z = 0; z < nz; z++) {
          let i = tx + sx * ((z + tz) + sz * (y + ty)), o = nx * (z + nz * y);
          for (let x = 0; x < nx; x++, i++, o++) if (label[i] === c) { g[o] = vox[i]; vox[i] = 0; }
        }
        if (sizes[c] <= 6) {
          for (let o = 0; o < g.length; o++) if (g[o]) {
            const x = o % nx, r = (o - x) / nx, z = r % nz, y = (r - z) / nz;
            const p = b.gridToWorld(tx + x + 0.5, ty + y + 0.5, tz + z + 0.5, new Vec3());
            const v = b.pointVel(p.x, p.y, p.z, new Vec3());
            this.particles.debris(p.x, p.y, p.z, v.x, v.y, v.z, 0.1, g[o]);
          }
          continue;
        }
        this.spawnPiece(b, g, nx, ny, nz, tx, ty, tz, oldCom);
      }
    }
    // remaining piece: tiny -> particles
    if (sizes[keep] <= 6) {
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
    // the grid was trimmed: its coordinates moved, so everything is remeshed
    b.meshDirty = true; b.meshBox = null;
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
  private lightOut: PointLight[] = [];
  private lightCand: { l: PointLight; s: number }[] = [];
  private lightTmp: PointLight[] = [];
  /** Lights by priority (brightness at the camera); reuses its arrays, valid until the next call. */
  gatherLights(cx: number, cy: number, cz: number, max: number): PointLight[] {
    const cand = this.lightCand;
    let n = 0;
    const slot = (l: PointLight, s: number) => {
      let c = cand[n];
      if (!c) { c = { l, s }; cand[n] = c; } else { c.l = l; c.s = s; }
      n++;
    };
    let nd = 0;
    for (const L of this.lights) {
      const k = L.life / L.maxLife;
      const f = L.flicker > 0 ? 1 - L.flicker * (0.5 + 0.5 * Math.sin(this.time * 31 + L.x * 7) * Math.sin(this.time * 17.3 + L.z * 3)) : 1;
      const s = k * k * f;
      let pl = this.lightTmp[nd];
      if (!pl) { pl = { x: 0, y: 0, z: 0, radius: 0, r: 0, g: 0, b: 0 }; this.lightTmp[nd] = pl; }
      nd++;
      pl.x = L.x; pl.y = L.y; pl.z = L.z; pl.radius = L.radius; pl.r = L.r * s; pl.g = L.g * s; pl.b = L.b * s;
      const d2 = (L.x - cx) ** 2 + (L.y - cy) ** 2 + (L.z - cz) ** 2;
      // dynamic lights (fire, blasts, muzzle flashes) are favoured, but distant ones must not crowd out nearby lamps
      slot(pl, 2.5 * (L.r + L.g + L.b) * s * L.radius * L.radius / (L.radius * L.radius + d2));
    }
    for (const lamp of this.lamps) {
      if (!lamp.on) continue;
      const L = lamp.light;
      const d2 = (L.x - cx) ** 2 + (L.y - cy) ** 2 + (L.z - cz) ** 2;
      if (d2 > 90 * 90) continue;
      slot(L, (L.r + L.g + L.b) * L.radius * L.radius / (L.radius * L.radius + d2));
    }
    const top = cand.slice(0, n).sort((a, b) => b.s - a.s);
    const out = this.lightOut;
    out.length = 0;
    for (let i = 0; i < Math.min(max, n); i++) out.push(top[i].l);
    return out;
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
    // re-split damaged bodies within a time budget; the rest continue next step
    const tr = performance.now();
    for (const b of this.dirtyBodies) {
      this.dirtyBodies.delete(b);
      this.rebuildBody(b);
      if (performance.now() - tr > 4) break;
    }
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

/** Union of two grid boxes (x0,y0,z0,x1,y1,z1); null (= everything) if either is. */
function growBox(a: number[] | null, b: number[] | undefined | null): number[] | null {
  if (!a || !b) return null;
  return [Math.min(a[0], b[0]), Math.min(a[1], b[1]), Math.min(a[2], b[2]), Math.max(a[3], b[3]), Math.max(a[4], b[4]), Math.max(a[5], b[5])];
}
