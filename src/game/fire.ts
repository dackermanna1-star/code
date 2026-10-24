// Fire: burning voxels spread to flammable neighbours (faster upwards), char their surroundings,
// burn away (feeding structural collapse), set off explosives, and emit flames, smoke, embers and light.

import { Game } from './game';
import { VOXEL } from '../world/world';
import { PAL_FLAMMABLE, PAL_CHAR, PAL_MAT, Mat, MATERIALS } from '../world/materials';
import { PT } from '../render/particles';
import { Body } from '../physics/body';
import { Vec3 } from '../engine/math';

interface FireCell { x: number; y: number; z: number; t: number; life: number; body: Body | null }

const MAX_FIRES = 1800;
const tmp = new Vec3();

export class Fire {
  private cells = new Map<number, FireCell>();
  private bodyCells = new Map<Body, Map<number, FireCell>>();
  private acc = 0;
  private lightAcc = 0;
  /** stats */
  get count(): number { let n = this.cells.size; for (const m of this.bodyCells.values()) n += m.size; return n; }
  onBurnSound: ((x: number, y: number, z: number, intensity: number) => void) | null = null;

  constructor(readonly g: Game) {}

  private key(x: number, y: number, z: number): number { return x + 4096 * (z + 4096 * y); }

  /** Ignite a static world voxel (if flammable). */
  ignite(x: number, y: number, z: number, force = false): boolean {
    const v = this.g.world.get(x, y, z);
    if (!v || (!force && PAL_FLAMMABLE[v] <= 0)) return false;
    if (this.count >= MAX_FIRES) return false;
    const k = this.key(x, y, z);
    if (this.cells.has(k)) return false;
    const mat = MATERIALS[PAL_MAT[v]];
    const life = Math.max(1.5, mat.burnTime || 4) * (0.6 + Math.random() * 0.8);
    this.cells.set(k, { x, y, z, t: 0, life, body: null });
    if (PAL_MAT[v] === Mat.Explosive) { this.g.destruction.detonateAt(x, y, z); return true; }
    return true;
  }

  /** Ignite a voxel of a dynamic body (grid coordinates). */
  igniteBody(b: Body, x: number, y: number, z: number): boolean {
    const v = b.get(x, y, z);
    if (!v || PAL_FLAMMABLE[v] <= 0 || this.count >= MAX_FIRES) return false;
    let m = this.bodyCells.get(b);
    if (!m) { m = new Map(); this.bodyCells.set(b, m); }
    const k = x + 1024 * (z + 1024 * y);
    if (m.has(k)) return false;
    const mat = MATERIALS[PAL_MAT[v]];
    m.set(k, { x, y, z, t: 0, life: Math.max(1.5, mat.burnTime || 4) * (0.6 + Math.random() * 0.8), body: b });
    return true;
  }

  /** Ignite whatever flammable thing is near a world point (used by explosions and the torch). */
  igniteAt(px: number, py: number, pz: number, r = 0.3): void {
    const w = this.g.world;
    const R = Math.ceil(r * 10);
    const cx = Math.floor(px * 10), cy = Math.floor(py * 10), cz = Math.floor(pz * 10);
    for (let dy = -R; dy <= R; dy++) for (let dz = -R; dz <= R; dz++) for (let dx = -R; dx <= R; dx++) {
      const v = w.get(cx + dx, cy + dy, cz + dz);
      if (v && PAL_FLAMMABLE[v] > 0 && Math.random() < 0.35) this.ignite(cx + dx, cy + dy, cz + dz);
    }
    for (const b of this.g.physics.bodies) {
      const d = b.pos.distTo(tmp.set(px, py, pz));
      if (d > b.radius + r) continue;
      const c = b.worldToGrid(px, py, pz, new Vec3());
      for (let dy = -R; dy <= R; dy++) for (let dz = -R; dz <= R; dz++) for (let dx = -R; dx <= R; dx++) {
        if (Math.random() < 0.35) this.igniteBody(b, Math.floor(c.x) + dx, Math.floor(c.y) + dy, Math.floor(c.z) + dz);
      }
      if (b.explosive > 0) this.g.destruction.detonateBody(b);
    }
  }

  update(dt: number): void {
    this.acc += dt;
    // visual particles every frame for a subset of fires
    this.emit(dt);
    if (this.acc < 0.1) return;
    const step = this.acc;
    this.acc = 0;
    const w = this.g.world;
    const born: [number, number, number][] = [];
    const dead: number[] = [];
    for (const [k, f] of this.cells) {
      const v = w.get(f.x, f.y, f.z);
      if (!v) { dead.push(k); continue; }
      f.t += step;
      // spread
      const fl = PAL_FLAMMABLE[v];
      const tries = 2;
      for (let i = 0; i < tries; i++) {
        const dx = ((Math.random() * 3) | 0) - 1, dz = ((Math.random() * 3) | 0) - 1;
        const dy = Math.random() < 0.55 ? 1 : ((Math.random() * 3) | 0) - 1;
        const nv = w.get(f.x + dx, f.y + dy, f.z + dz);
        if (!nv) continue;
        const nf = PAL_FLAMMABLE[nv];
        if (nf <= 0) {
          if (PAL_MAT[nv] === Mat.Explosive && Math.random() < 0.05) born.push([f.x + dx, f.y + dy, f.z + dz]);
          continue;
        }
        const p = nf * step * (dy > 0 ? 1.4 : 0.45) * (0.5 + fl * 0.5);
        if (Math.random() < p) born.push([f.x + dx, f.y + dy, f.z + dz]);
      }
      // char a random neighbour surface
      if (Math.random() < step * 0.6) {
        const dx = ((Math.random() * 3) | 0) - 1, dy = ((Math.random() * 3) | 0) - 1, dz = ((Math.random() * 3) | 0) - 1;
        const nv = w.get(f.x + dx, f.y + dy, f.z + dz);
        const c = nv ? PAL_CHAR[nv] : 0;
        if (c && !this.cells.has(this.key(f.x + dx, f.y + dy, f.z + dz))) w.set(f.x + dx, f.y + dy, f.z + dz, c);
      }
      // burnt out
      if (f.t >= f.life) {
        dead.push(k);
        const c = PAL_CHAR[v];
        if (c && Math.random() < 0.3) w.set(f.x, f.y, f.z, c);
        else {
          this.g.stress.prepare(f.x, f.z);
          w.set(f.x, f.y, f.z, 0);
          this.g.structure.noteRemoved(f.x, f.y, f.z);
          if (Math.random() < 0.05) this.g.stress.request(f.x, f.y, f.z, 0.5);
          if (Math.random() < 0.3) this.g.particles.debris((f.x + 0.5) * VOXEL, (f.y + 0.5) * VOXEL, (f.z + 0.5) * VOXEL, 0, 0.3, 0, 0.06, c || v, 3);
        }
        w.noteChange(f.x, f.y, f.z, f.x, f.y, f.z);
      }
    }
    for (const k of dead) this.cells.delete(k);
    for (const [x, y, z] of born) this.ignite(x, y, z);
    // body fires
    for (const [b, m] of this.bodyCells) {
      if (b.removed) { this.bodyCells.delete(b); continue; }
      let changed = false;
      const bornB: [number, number, number][] = [];
      for (const [k, f] of m) {
        const v = b.get(f.x, f.y, f.z);
        if (!v) { m.delete(k); continue; }
        f.t += step;
        for (let i = 0; i < 2; i++) {
          const dx = ((Math.random() * 3) | 0) - 1, dy = ((Math.random() * 3) | 0) - 1, dz = ((Math.random() * 3) | 0) - 1;
          const nv = b.get(f.x + dx, f.y + dy, f.z + dz);
          if (nv && PAL_FLAMMABLE[nv] > 0 && Math.random() < PAL_FLAMMABLE[nv] * step * 0.8) bornB.push([f.x + dx, f.y + dy, f.z + dz]);
        }
        if (f.t >= f.life) {
          m.delete(k);
          const c = PAL_CHAR[v];
          b.vox[f.x + b.sx * (f.z + b.sz * f.y)] = c && Math.random() < 0.3 ? c : 0;
          changed = true;
        }
      }
      for (const [x, y, z] of bornB) this.igniteBody(b, x, y, z);
      if (changed) this.g.markBodyDirty(b);
      if (b.explosive > 0 && m.size > 0) this.g.destruction.detonateBody(b);
      if (m.size === 0) this.bodyCells.delete(b);
    }
  }

  private emit(dt: number): void {
    const P = this.g.particles;
    const w = this.g.world;
    const n = this.cells.size;
    // light clusters (2 m grid)
    this.lightAcc -= dt;
    const doLights = this.lightAcc <= 0;
    if (doLights) this.lightAcc = 0.1;
    const clusters = doLights ? new Map<number, { x: number; y: number; z: number; n: number }>() : null;
    const rate = Math.min(1, 140 / Math.max(1, n)) * dt * 18;
    for (const f of this.cells.values()) {
      const x = (f.x + 0.5) * VOXEL, y = (f.y + 0.5) * VOXEL, z = (f.z + 0.5) * VOXEL;
      if (clusters) {
        const ck = (f.x / 20 | 0) + 1000 * ((f.z / 20 | 0) + 1000 * (f.y / 20 | 0));
        const c = clusters.get(ck);
        if (c) { c.x += x; c.y += y; c.z += z; c.n++; } else clusters.set(ck, { x, y, z, n: 1 });
      }
      if (Math.random() > rate) continue;
      // only emit from voxels with air above or around
      if (w.get(f.x, f.y + 1, f.z) && w.get(f.x + 1, f.y, f.z) && w.get(f.x - 1, f.y, f.z) && w.get(f.x, f.y, f.z + 1) && w.get(f.x, f.y, f.z - 1)) continue;
      const k = Math.min(1, f.t / 1.5) * Math.min(1, (f.life - f.t) / 1.0 + 0.3);
      P.spawn(PT.Fire, x + (Math.random() - 0.5) * 0.1, y + 0.05, z + (Math.random() - 0.5) * 0.1, (Math.random() - 0.5) * 0.3, 1.2 + Math.random() * 1.2, (Math.random() - 0.5) * 0.3,
        0.12 + 0.12 * k, 0.35 + Math.random() * 0.4, 1, 1, 1, 0.8, { grow: 0.15, drag: 2, buoy: 1.5, emissive: 4 + k * 3 });
      if (Math.random() < 0.35) P.spawn(PT.Smoke, x, y + 0.3, z, (Math.random() - 0.5) * 0.3, 0.8 + Math.random() * 0.5, (Math.random() - 0.5) * 0.3,
        0.3 + Math.random() * 0.3, 4 + Math.random() * 4, 0.1, 0.095, 0.09, 0.6, { grow: 0.45, drag: 1, buoy: 0.9 });
      if (Math.random() < 0.05) P.spawn(PT.Ember, x, y + 0.1, z, (Math.random() - 0.5) * 0.8, 1.5 + Math.random() * 2, (Math.random() - 0.5) * 0.8, 0.025, 1.5 + Math.random() * 2, 1, 0.5, 0.1, 1, { emissive: 6, drag: 0.6, buoy: 0.5 });
    }
    for (const [b, m] of this.bodyCells) {
      for (const f of m.values()) {
        if (Math.random() > rate * 1.5) continue;
        b.gridToWorld(f.x + 0.5, f.y + 1, f.z + 0.5, tmp);
        P.spawn(PT.Fire, tmp.x, tmp.y, tmp.z, b.vel.x * 0.5, 1.2 + Math.random(), b.vel.z * 0.5, 0.15, 0.4 + Math.random() * 0.3, 1, 1, 1, 0.8, { grow: 0.15, drag: 2, buoy: 1.5, emissive: 6 });
        if (Math.random() < 0.3) P.spawn(PT.Smoke, tmp.x, tmp.y + 0.3, tmp.z, 0, 0.9, 0, 0.3, 4, 0.1, 0.1, 0.1, 0.55, { grow: 0.4, buoy: 0.8 });
        if (clusters) {
          const ck = -1 - b.id;
          const c = clusters.get(ck);
          if (c) { c.x += tmp.x; c.y += tmp.y; c.z += tmp.z; c.n++; } else clusters.set(ck, { x: tmp.x, y: tmp.y, z: tmp.z, n: 1 });
        }
      }
    }
    if (clusters) {
      for (const c of clusters.values()) {
        const s = Math.min(1, c.n / 12);
        this.g.flashLight(c.x / c.n, c.y / c.n + 0.4, c.z / c.n, 4 + s * 6, 9 * s + 1.5, 4.2 * s + 0.6, 1.0 * s + 0.15, 0.13, 0.35);
      }
      if (n > 0 && Math.random() < 0.3) {
        const f = this.cells.values().next().value as FireCell;
        this.onBurnSound?.((f.x + 0.5) * VOXEL, (f.y + 0.5) * VOXEL, (f.z + 0.5) * VOXEL, Math.min(1, n / 200));
      }
    }
  }
}
