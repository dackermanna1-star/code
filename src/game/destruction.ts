// Destruction: carving voxels out of the world and bodies, explosions with fragments and shockwaves,
// material-specific effects (dust, splinters, glass shards, sparks) and chained explosives.

import { Game } from './game';
import { VOXEL } from '../world/world';
import { PAL_MAT, PAL_HARD, PAL_BLAST, PALETTE, Mat, MATERIALS, srgbToLinear, PAL_FLAMMABLE, PAL_TRANSPARENT } from '../world/materials';
import { Body } from '../physics/body';
import { PT } from '../render/particles';
import { hash3, Vec3, Rng } from '../engine/math';

export interface CarveOpts {
  /** maximum hardness that can be removed */
  maxHard: number;
  /** use per-material blast factors (explosions) instead of tool hardness falloff */
  blast: boolean;
  /** probability that a removed voxel becomes a flying debris cube */
  debris: number;
  /** outward debris speed (m/s) */
  speed: number;
  /** boundary noise (0..1) */
  noise: number;
  /** dust amount multiplier */
  dust: number;
  /** origin of the blast/hit for particle directions (defaults to center) */
  fromX?: number; fromY?: number; fromZ?: number;
}

interface PendingBlast { x: number; y: number; z: number; power: number; t: number }

const rng = new Rng(4242);
const tmpV = new Vec3();

/** Linear RGB of a palette entry (for tinting dust). */
export function palLinear(p: number): [number, number, number] {
  const e = PALETTE[p];
  return [srgbToLinear(e.r), srgbToLinear(e.g), srgbToLinear(e.b)];
}

export class Destruction {
  pending: PendingBlast[] = [];
  /** hook: explosion happened (for audio / player damage) */
  onExplosion: ((x: number, y: number, z: number, power: number) => void) | null = null;
  /** hook: voxels destroyed by material (for sound) */
  onBreak: ((x: number, y: number, z: number, mat: Mat, count: number) => void) | null = null;
  /** hook: ignite flammable voxel */
  ignite: ((x: number, y: number, z: number) => void) | null = null;
  totalRemoved = 0;

  constructor(readonly g: Game) {}

  // ------------------------------------------------------------------ world carving
  /**
   * Remove voxels within radius r (meters) of (cx,cy,cz) from the static world.
   * Returns number of removed voxels; explosive voxels removed schedule chained blasts.
   */
  carveWorld(cx: number, cy: number, cz: number, r: number, o: CarveOpts): number {
    const w = this.g.world, st = this.g.structure, P = this.g.particles;
    this.g.stress.prepare(Math.floor(cx * 10), Math.floor(cz * 10));
    // glass is handled by shatterGlassNear, so the scan box only needs the largest non-glass factor
    const maxF = o.blast ? 1.35 : 1.6;
    const R = r * maxF * (1 + o.noise * 0.5);
    const x0 = Math.floor((cx - R) * 10), x1 = Math.floor((cx + R) * 10);
    const y0 = Math.max(2, Math.floor((cy - R) * 10)), y1 = Math.floor((cy + R) * 10);
    const z0 = Math.floor((cz - R) * 10), z1 = Math.floor((cz + R) * 10);
    const fx = o.fromX ?? cx, fy = o.fromY ?? cy, fz = o.fromZ ?? cz;
    let removed = 0;
    let ex = 0, ey = 0, ez = 0, en = 0;
    const matCount = new Float32Array(Mat.COUNT);
    const matPal = new Uint8Array(Mat.COUNT);
    const matPos = new Float32Array(Mat.COUNT * 3);
    const removedList: number[] = [];
    const R2 = R * R;
    let tq = performance.now();
    const lapc = (k: string) => { const n = performance.now(); this.prof['c_' + k] = (this.prof['c_' + k] || 0) + n - tq; tq = n; };
    w.forEachSolid(x0, y0, z0, x1, y1, z1, (x, y, z, v) => {
      const wx = (x + 0.5) * VOXEL - cx, wy = (y + 0.5) * VOXEL - cy, wz = (z + 0.5) * VOXEL - cz;
      const d2 = wx * wx + wy * wy + wz * wz;
      if (d2 > R2) return;
      const hard = PAL_HARD[v];
      if (hard > o.maxHard) return;
      let f: number;
      if (o.blast) f = Math.min(maxF, PAL_BLAST[v]);
      else f = hard <= 0 ? 1.6 : hard === 1 ? 1.0 : hard === 2 ? 0.62 : hard === 3 ? 0.4 : 0.25;
      const nz = o.noise > 0 ? 1 + o.noise * ((hash3(x, y, z) & 1023) / 1023 - 0.5) : 1;
      const rr = r * f * nz;
      if (d2 > rr * rr) return;
      removedList.push(x, y, z, v);
    }, false, { cx: cx * 10, cy: cy * 10, cz: cz * 10, r: R * 10 });
    lapc('scan');
    for (let i = 0; i < removedList.length; i += 4) {
      const x = removedList[i], y = removedList[i + 1], z = removedList[i + 2], v = removedList[i + 3];
      w.set(x, y, z, 0);
      removed++;
      const m = PAL_MAT[v];
      matCount[m]++; matPal[m] = v;
      matPos[m * 3] += x; matPos[m * 3 + 1] += y; matPos[m * 3 + 2] += z;
      if (m === Mat.Explosive) { ex += x; ey += y; ez += z; en++; }
      // flying debris cube
      if (Math.random() < o.debris * (m === Mat.Glass ? 2.5 : 1)) {
        const px = (x + 0.5) * VOXEL, py = (y + 0.5) * VOXEL, pz = (z + 0.5) * VOXEL;
        let dx = px - fx, dy = py - fy, dz = pz - fz;
        const dl = Math.hypot(dx, dy, dz) || 1;
        dx /= dl; dy /= dl; dz /= dl;
        const sp = o.speed * (0.4 + Math.random() * 0.9);
        const size = m === Mat.Glass ? 0.03 + Math.random() * 0.04 : (Math.random() < 0.6 ? 0.1 : 0.05 + Math.random() * 0.04);
        P.debris(px, py, pz, dx * sp + (Math.random() - 0.5) * 2, dy * sp + Math.random() * 2.5, dz * sp + (Math.random() - 0.5) * 2, size, v, 8);
      }
    }
    lapc('set');
    if (removed === 0) return 0;
    for (let i = 0; i < removedList.length; i += 4) st.noteRemoved(removedList[i], removedList[i + 1], removedList[i + 2]);
    this.g.stress.request(Math.floor(cx * 10), Math.floor(cy * 10), Math.floor(cz * 10), o.blast ? 0.15 : 0.3);
    lapc('note');
    w.noteChange(x0, y0, z0, x1, y1, z1);
    this.totalRemoved += removed;
    this.materialEffects(matCount, matPal, matPos, o, fx, fy, fz);
    lapc('fx');
    if (en > 0) this.schedule((ex / en + 0.5) * VOXEL, (ey / en + 0.5) * VOXEL, (ez / en + 0.5) * VOXEL, 0.6 + en * 0.012, 0.08 + Math.random() * 0.15);
    // glass connected to the hole shatters
    if (matCount[Mat.Glass] > 0 || o.blast) this.shatterGlassNear(cx, cy, cz, r * (o.blast ? 2.4 : 1.5));
    lapc('glass');
    return removed;
  }

  /** Dust clouds, sparks, splinters per material of removed voxels. */
  private materialEffects(cnt: Float32Array, pal: Uint8Array, pos: Float32Array, o: CarveOpts, fx: number, fy: number, fz: number): void {
    const P = this.g.particles;
    for (let m = 1; m < Mat.COUNT; m++) {
      const n = cnt[m];
      if (n === 0) continue;
      const x = (pos[m * 3] / n + 0.5) * VOXEL, y = (pos[m * 3 + 1] / n + 0.5) * VOXEL, z = (pos[m * 3 + 2] / n + 0.5) * VOXEL;
      this.onBreak?.(x, y, z, m as Mat, n);
      const [lr, lg, lb] = palLinear(pal[m]);
      const def = MATERIALS[m];
      // dust: lighter tint of the material
      const dustN = Math.min(40, Math.ceil(Math.sqrt(n) * 0.9 * o.dust));
      if (def.debris === 0 || def.debris === 1 || m === Mat.Wood) {
        for (let i = 0; i < dustN; i++) {
          const s = 0.25 + Math.random() * 0.5 + Math.sqrt(n) * 0.012;
          const vx = (Math.random() - 0.5) * 1.5, vy = Math.random() * 1.2, vz = (Math.random() - 0.5) * 1.5;
          const k = m === Mat.Wood ? 0.8 : 1.15;
          P.spawn(PT.Dust, x + (Math.random() - 0.5) * 0.5, y + (Math.random() - 0.5) * 0.4, z + (Math.random() - 0.5) * 0.5, vx, vy, vz,
            s, 2.5 + Math.random() * 3.5, Math.min(1, lr * k + 0.08), Math.min(1, lg * k + 0.08), Math.min(1, lb * k + 0.08), 0.55,
            { grow: 0.35 + Math.random() * 0.3, drag: 1.6, buoy: 0.05 });
        }
      }
      if (def.debris === 4 || m === Mat.Metal || m === Mat.HeavyMetal) {
        const sn = Math.min(30, 4 + n * 2);
        for (let i = 0; i < sn; i++) {
          const dx = x - fx, dy = y - fy, dz = z - fz;
          const dl = Math.hypot(dx, dy, dz) || 1;
          const sp = 3 + Math.random() * 7;
          P.spawn(PT.Spark, x, y, z, (dx / dl) * sp + (Math.random() - 0.5) * 5, (dy / dl) * sp + Math.random() * 4, (dz / dl) * sp + (Math.random() - 0.5) * 5,
            0.025, 0.4 + Math.random() * 0.6, 1.0, 0.65, 0.25, 1, { emissive: 6, drag: 0.4 });
        }
      }
      if (m === Mat.Wood) {
        // splinters: thin fast debris
        for (let i = 0; i < Math.min(12, n * 0.3); i++) {
          P.debris(x, y, z, (Math.random() - 0.5) * 6, Math.random() * 4, (Math.random() - 0.5) * 6, 0.03 + Math.random() * 0.03, pal[m], 4);
        }
      }
      if (m === Mat.Foliage) {
        for (let i = 0; i < Math.min(30, n); i++) {
          P.debris(x + (Math.random() - 0.5), y + (Math.random() - 0.5), z + (Math.random() - 0.5), (Math.random() - 0.5) * 2, Math.random() * 2, (Math.random() - 0.5) * 2, 0.05, pal[m], 5);
        }
      }
    }
  }

  /** Breaks glass panes connected to glass voxels near a point (flood fill limited by radius). */
  shatterGlassNear(cx: number, cy: number, cz: number, r: number): void {
    const w = this.g.world, P = this.g.particles;
    const R = Math.min(r, 6);
    const x0 = Math.floor((cx - R) * 10), x1 = Math.floor((cx + R) * 10);
    const y0 = Math.floor((cy - R) * 10), y1 = Math.floor((cy + R) * 10);
    const z0 = Math.floor((cz - R) * 10), z1 = Math.floor((cz + R) * 10);
    const seeds: number[] = [];
    const R2 = (R * 10) ** 2, ccx = cx * 10, ccy = cy * 10, ccz = cz * 10;
    w.forEachSolid(x0, y0, z0, x1, y1, z1, (x, y, z, v) => {
      if (PAL_MAT[v] !== Mat.Glass) return;
      if ((x - ccx) ** 2 + (y - ccy) ** 2 + (z - ccz) ** 2 > R2) return;
      seeds.push(x, y, z);
    }, true, { cx: ccx, cy: ccy, cz: ccz, r: R * 10 });
    if (seeds.length === 0) return;
    const seen = new Set<number>();
    const stack: number[] = [];
    let broken = 0;
    const key = (x: number, y: number, z: number) => x + 4096 * (z + 4096 * y);
    const lim = 12; // extra reach beyond the radius (voxels) so whole panes break
    for (let s = 0; s < seeds.length; s += 3) {
      stack.push(seeds[s], seeds[s + 1], seeds[s + 2]);
      while (stack.length && broken < 6000) {
        const z = stack.pop()!, y = stack.pop()!, x = stack.pop()!;
        const k = key(x, y, z);
        if (seen.has(k)) continue;
        seen.add(k);
        const v = w.get(x, y, z);
        if (!v || PAL_MAT[v] !== Mat.Glass) continue;
        if (x < x0 - lim || x > x1 + lim || y < y0 - lim || y > y1 + lim || z < z0 - lim || z > z1 + lim) continue;
        w.set(x, y, z, 0);
        this.g.structure.noteRemoved(x, y, z);
        broken++;
        if (Math.random() < 0.35) {
          const px = (x + 0.5) * VOXEL, py = (y + 0.5) * VOXEL, pz = (z + 0.5) * VOXEL;
          let dx = px - cx, dz = pz - cz;
          const dl = Math.hypot(dx, dz) || 1;
          dx /= dl; dz /= dl;
          P.debris(px, py, pz, dx * (1 + Math.random() * 3), Math.random() * 1.5, dz * (1 + Math.random() * 3), 0.025 + Math.random() * 0.04, v, 3 + Math.random() * 3);
        }
        stack.push(x + 1, y, z, x - 1, y, z, x, y + 1, z, x, y - 1, z, x, y, z + 1, x, y, z - 1);
      }
      stack.length = 0;
    }
    if (broken > 0) {
      w.noteChange(x0 - lim, y0 - lim, z0 - lim, x1 + lim, y1 + lim, z1 + lim);
      this.onBreak?.(cx, cy, cz, Mat.Glass, broken);
    }
  }

  // ------------------------------------------------------------------ body carving
  /** Remove voxels from a body within radius r (meters) around a world point. */
  carveBody(b: Body, cx: number, cy: number, cz: number, r: number, o: CarveOpts): number {
    const P = this.g.particles;
    const c = b.worldToGrid(cx, cy, cz, tmpV);
    const maxF = o.blast ? 2.3 : 1;
    const R = r * maxF * 10;
    const x0 = Math.max(0, Math.floor(c.x - R)), x1 = Math.min(b.sx - 1, Math.floor(c.x + R));
    const y0 = Math.max(0, Math.floor(c.y - R)), y1 = Math.min(b.sy - 1, Math.floor(c.y + R));
    const z0 = Math.max(0, Math.floor(c.z - R)), z1 = Math.min(b.sz - 1, Math.floor(c.z + R));
    let removed = 0, expl = 0;
    const matCount = new Float32Array(Mat.COUNT);
    const matPal = new Uint8Array(Mat.COUNT);
    const matPos = new Float32Array(Mat.COUNT * 3);
    const wp = new Vec3();
    for (let y = y0; y <= y1; y++) for (let z = z0; z <= z1; z++) for (let x = x0; x <= x1; x++) {
      const i = x + b.sx * (z + b.sz * y);
      const v = b.vox[i];
      if (!v) continue;
      const hard = PAL_HARD[v];
      if (hard > o.maxHard) continue;
      const f = o.blast ? PAL_BLAST[v] : hard <= 0 ? 1.6 : hard === 1 ? 1.0 : hard === 2 ? 0.62 : hard === 3 ? 0.4 : 0.25;
      const nz = o.noise > 0 ? 1 + o.noise * ((hash3(x, y, z + b.id * 977) & 1023) / 1023 - 0.5) : 1;
      const rr = r * f * nz * 10;
      const dx = x + 0.5 - c.x, dy = y + 0.5 - c.y, dz = z + 0.5 - c.z;
      if (dx * dx + dy * dy + dz * dz > rr * rr) continue;
      b.vox[i] = 0;
      removed++;
      const m = PAL_MAT[v];
      if (m === Mat.Explosive) expl++;
      b.gridToWorld(x + 0.5, y + 0.5, z + 0.5, wp);
      matCount[m]++; matPal[m] = v;
      matPos[m * 3] += wp.x * 10 - 0.5; matPos[m * 3 + 1] += wp.y * 10 - 0.5; matPos[m * 3 + 2] += wp.z * 10 - 0.5;
      if (Math.random() < o.debris * (m === Mat.Glass ? 2.5 : 1)) {
        let ddx = wp.x - (o.fromX ?? cx), ddy = wp.y - (o.fromY ?? cy), ddz = wp.z - (o.fromZ ?? cz);
        const dl = Math.hypot(ddx, ddy, ddz) || 1;
        const sp = o.speed * (0.4 + Math.random() * 0.9);
        P.debris(wp.x, wp.y, wp.z, b.vel.x + (ddx / dl) * sp, b.vel.y + (ddy / dl) * sp + 1, b.vel.z + (ddz / dl) * sp, 0.08, v, 6);
      }
    }
    if (removed === 0) return 0;
    this.totalRemoved += removed;
    this.g.markBodyDirty(b);
    b.wake();
    this.materialEffects(matCount, matPal, matPos, o, o.fromX ?? cx, o.fromY ?? cy, o.fromZ ?? cz);
    if (expl > 0 || (b.explosive > 0 && removed > 0)) this.detonateBody(b);
    return removed;
  }

  /** An explosive body blows up (after a short fuse); its explosive voxels are consumed. */
  detonateBody(b: Body): void {
    if ((b as any)._detonating) return;
    (b as any)._detonating = true;
    const n = b.explosive;
    if (n <= 0) return;
    const power = 0.8 + n * 0.012;
    const delay = 0.12 + Math.random() * 0.35;
    this.pending.push({ x: b.pos.x, y: b.pos.y, z: b.pos.z, power, t: delay });
    (this.pending[this.pending.length - 1] as any).body = b;
  }

  schedule(x: number, y: number, z: number, power: number, delay: number): void {
    // merge with a nearby pending blast
    for (const p of this.pending) {
      if (Math.hypot(p.x - x, p.y - y, p.z - z) < 1.0) { p.power = Math.max(p.power, power) + power * 0.25; return; }
    }
    this.pending.push({ x, y, z, power, t: delay });
  }

  update(dt: number): void {
    for (let i = this.pending.length - 1; i >= 0; i--) {
      const p = this.pending[i];
      p.t -= dt;
      const body = (p as any).body as Body | undefined;
      if (body && !body.removed) { p.x = body.pos.x; p.y = body.pos.y; p.z = body.pos.z; }
      if (p.t <= 0) {
        this.pending.splice(i, 1);
        if (body && !body.removed) {
          // remove the explosive voxels of the body before the blast
          for (let k = 0; k < body.vox.length; k++) if (PAL_MAT[body.vox[k]] === Mat.Explosive) body.vox[k] = 0;
          this.g.markBodyDirty(body);
        }
        this.explode(p.x, p.y, p.z, p.power);
      }
    }
  }

  // ------------------------------------------------------------------ impacts
  /** Energy (J) needed before an impact starts breaking a material. */
  static toughness(pal: number): number {
    switch (PAL_MAT[pal]) {
      case Mat.Glass: return 25;
      case Mat.Foliage: return 40;
      case Mat.Char: return 60;
      case Mat.Plaster: return 400;
      case Mat.Fabric: return 300;
      case Mat.Rubble: return 350;
      case Mat.Wood: return 900;
      case Mat.Plastic: return 900;
      case Mat.Dirt: case Mat.Grass: case Mat.Gravel: return 2500;
      case Mat.Brick: return 3500;
      case Mat.Asphalt: return 5000;
      case Mat.Concrete: return 6000;
      case Mat.Rubber: return 8000;
      case Mat.Explosive: return 900;
      case Mat.Light: return 30;
      case Mat.Rock: return 15000;
      case Mat.Metal: return 25000;
      case Mat.HeavyMetal: return 150000;
      default: return 1e12;
    }
  }

  /** Collision damage between a falling body and what it hits. */
  impact(a: Body, b: Body | null, x: number, y: number, z: number, nx: number, ny: number, nz: number, speed: number, meff: number, palB: number): void {
    if (a.age < 6 || a.damageCooldown > 0) return;
    const E = 0.5 * meff * speed * speed;
    if (E < 20) return;
    a.damageCooldown = 0.2;
    const opts: CarveOpts = { maxHard: 4, blast: true, debris: 0.25, speed: Math.min(6, speed * 0.4), noise: 0.5, dust: 0.9, fromX: x + nx, fromY: y + ny, fromZ: z + nz };
    // the thing that was hit
    const eB = Destruction.toughness(palB);
    if (E > eB) {
      const r = Math.min(0.85, 0.09 * Math.cbrt(E / eB));
      if (b) { if (b.age > 6) this.carveBody(b, x - nx * 0.05, y - ny * 0.05, z - nz * 0.05, r, opts); }
      else this.carveWorld(x - nx * 0.05, y - ny * 0.05, z - nz * 0.05, r, opts);
    }
    // the falling body itself (voxel nearest to the contact)
    const c = a.worldToGrid(x + nx * 0.05, y + ny * 0.05, z + nz * 0.05, tmpV);
    const vx = Math.min(a.sx - 1, Math.max(0, Math.floor(c.x))), vy = Math.min(a.sy - 1, Math.max(0, Math.floor(c.y))), vz = Math.min(a.sz - 1, Math.max(0, Math.floor(c.z)));
    let palA = a.get(vx, vy, vz);
    if (!palA) palA = a.vox.find((v) => v !== 0) || 0;
    if (palA) {
      const eA = Destruction.toughness(palA);
      if (E > eA) {
        const r = Math.min(0.9, 0.1 * Math.cbrt(E / eA));
        opts.fromX = x - nx; opts.fromY = y - ny; opts.fromZ = z - nz;
        this.carveBody(a, x + nx * 0.05, y + ny * 0.05, z + nz * 0.05, r, opts);
      }
      if (a.explosive > 0 && E > 600) this.detonateBody(a);
    }
    if (b && b.explosive > 0 && E > 600) this.detonateBody(b);
    this.onImpactSound?.(x, y, z, palA || palB, palB, E);
  }
  onImpactSound: ((x: number, y: number, z: number, palA: number, palB: number, energy: number) => void) | null = null;

  // ------------------------------------------------------------------ explosions
  prof: Record<string, number> = {};
  explode(x: number, y: number, z: number, power: number): void {
    const g = this.g, P = g.particles;
    let tt = performance.now();
    const lap = (k: string) => { const n = performance.now(); this.prof[k] = (this.prof[k] || 0) + n - tt; tt = n; };
    const r = 1.35 * Math.cbrt(power) + 0.25;
    const carve: CarveOpts = { maxHard: 4, blast: true, debris: 0.07, speed: 9 + power * 1.5, noise: 0.55, dust: 1.6, fromX: x, fromY: y, fromZ: z };
    g.world.noteChange(Math.floor((x - r * 3) * 10), Math.floor((y - r * 3) * 10), Math.floor((z - r * 3) * 10), Math.ceil((x + r * 3) * 10), Math.ceil((y + r * 3) * 10), Math.ceil((z + r * 3) * 10));
    this.carveWorld(x, y, z, r, carve);
    lap('carve');
    // fragments: chunks loosened from the crater rim fly outwards as rigid bodies
    this.fragments(x, y, z, r, power);
    lap('fragments');
    // bodies: carve + shockwave impulse
    const bodies = g.physics.bodies.slice();
    for (const b of bodies) {
      const dx = b.pos.x - x, dy = b.pos.y - y, dz = b.pos.z - z;
      const d = Math.hypot(dx, dy, dz);
      if (d - b.radius > r * 4) continue;
      if (d - b.radius < r * 2.3) this.carveBody(b, x, y, z, r, carve);
      if (b.removed) continue;
      const dd = Math.max(d, 0.6);
      // impulse from overpressure on the exposed area, capped per mass
      const area = Math.min(b.count, 2500) * 0.004 + 0.3;
      let J = power * 900 * area / (dd * dd);
      J = Math.min(J, b.mass * 28);
      const nx = dx / (d || 1), ny = dy / (d || 1) + 0.25, nz = dz / (d || 1);
      // apply slightly off-center to add spin
      const ox = (Math.random() - 0.5) * b.radius * 0.5, oy = (Math.random() - 0.5) * b.radius * 0.5, oz = (Math.random() - 0.5) * b.radius * 0.5;
      b.updateDerived();
      b.applyImpulse(nx * J, ny * J, nz * J, b.pos.x + ox, b.pos.y + oy, b.pos.z + oz);
      b.wake();
      if (b.explosive > 0 && d - b.radius < r * 1.6) this.detonateBody(b);
    }
    lap('bodies');
    // ignite flammables around
    if (this.ignite) {
      for (let i = 0; i < 18 * Math.cbrt(power); i++) {
        const a = Math.random() * 6.283, b2 = Math.acos(Math.random() * 2 - 1), rr = r * (0.9 + Math.random() * 0.6);
        const px = x + Math.sin(b2) * Math.cos(a) * rr, py = y + Math.cos(b2) * rr, pz = z + Math.sin(b2) * Math.sin(a) * rr;
        const vx = Math.floor(px * 10), vy = Math.floor(py * 10), vz = Math.floor(pz * 10);
        const v = g.world.get(vx, vy, vz);
        if (v && PAL_FLAMMABLE[v] > 0.3 && Math.random() < PAL_FLAMMABLE[v]) this.ignite(vx, vy, vz);
      }
    }
    // ---- visuals
    g.flashLight(x, y + 0.5, z, 10 + power * 3, 60 * Math.cbrt(power), 34 * Math.cbrt(power), 12 * Math.cbrt(power), 0.45 + power * 0.03);
    g.flashLight(x, y + 1.5, z, 7 + power * 2, 8, 4, 1.2, 2.5 + power * 0.2, 0.3);
    P.spawn(PT.Flash, x, y, z, 0, 0, 0, r * 2.2, 0.18, 1, 0.85, 0.6, 1, { emissive: 14 });
    const fireN = Math.min(90, 14 + power * 10);
    for (let i = 0; i < fireN; i++) {
      const a = Math.random() * 6.283, el = Math.random() * 1.4 - 0.2, sp = (2 + Math.random() * 6) * Math.cbrt(power);
      P.spawn(PT.Fire, x, y + 0.2, z, Math.cos(a) * Math.cos(el) * sp, Math.sin(el) * sp + 1.5, Math.sin(a) * Math.cos(el) * sp,
        r * (0.35 + Math.random() * 0.45), 0.35 + Math.random() * 0.55, 1, 1, 1, 1, { grow: 1.2, drag: 3.5, buoy: 3, emissive: 7 });
    }
    const smokeN = Math.min(140, 20 + power * 14);
    for (let i = 0; i < smokeN; i++) {
      const a = Math.random() * 6.283, el = Math.random() * 1.5 - 0.15, sp = (1 + Math.random() * 4.5) * Math.cbrt(power);
      const shade = 0.12 + Math.random() * 0.14;
      P.spawn(PT.Smoke, x + (Math.random() - 0.5) * r, y + Math.random() * r * 0.6, z + (Math.random() - 0.5) * r,
        Math.cos(a) * Math.cos(el) * sp, Math.sin(el) * sp + 1.2, Math.sin(a) * Math.cos(el) * sp,
        r * (0.45 + Math.random() * 0.5), 6 + Math.random() * 9, shade, shade * 0.95, shade * 0.9, 0.85,
        { grow: 0.55 + Math.random() * 0.4, drag: 1.4, buoy: 0.55 + Math.random() * 0.4 });
    }
    // ground dust ring
    for (let i = 0; i < 24 + power * 3; i++) {
      const a = (i / (24 + power * 3)) * 6.283;
      P.spawn(PT.Dust, x + Math.cos(a) * r * 0.8, y - r * 0.4, z + Math.sin(a) * r * 0.8, Math.cos(a) * (6 + power), 0.3, Math.sin(a) * (6 + power),
        r * 0.5, 3 + Math.random() * 3, 0.55, 0.5, 0.45, 0.5, { grow: 0.8, drag: 2.2, buoy: 0.2 });
    }
    // sparks / embers
    for (let i = 0; i < 30 + power * 8; i++) {
      const a = Math.random() * 6.283, el = Math.random() * 1.5 - 0.3, sp = 8 + Math.random() * 18;
      P.spawn(PT.Spark, x, y, z, Math.cos(a) * Math.cos(el) * sp, Math.sin(el) * sp, Math.sin(a) * Math.cos(el) * sp,
        0.03, 0.6 + Math.random() * 1.2, 1, 0.7, 0.3, 1, { emissive: 8, drag: 0.6 });
    }
    for (let i = 0; i < 12 + power * 4; i++) {
      P.spawn(PT.Ember, x + (Math.random() - 0.5) * r, y + Math.random() * r, z + (Math.random() - 0.5) * r,
        (Math.random() - 0.5) * 3, 2 + Math.random() * 4, (Math.random() - 0.5) * 3, 0.04, 2 + Math.random() * 3, 1, 0.5, 0.15, 1, { emissive: 5, drag: 0.8, buoy: 0.6 });
    }
    lap('fx');
    this.onExplosion?.(x, y, z, power);
  }

  /** Loosen chunks around the crater rim and throw them out as rigid bodies. */
  private fragments(cx: number, cy: number, cz: number, r: number, power: number): void {
    const g = this.g, w = g.world;
    const n = Math.min(26, Math.round(5 + power * 2.5));
    for (let i = 0; i < n; i++) {
      // random direction, march outward from inside the crater until we hit material
      const a = rng.next() * 6.283, el = Math.asin(rng.range(-0.95, 0.95));
      const dx = Math.cos(el) * Math.cos(a), dy = Math.sin(el), dz = Math.cos(el) * Math.sin(a);
      let hx = 0, hy = 0, hz = 0, found = false;
      for (let t = r * 0.5; t < r * 1.9; t += 0.05) {
        const vx = Math.floor((cx + dx * t) * 10), vy = Math.floor((cy + dy * t) * 10), vz = Math.floor((cz + dz * t) * 10);
        const v = w.get(vx, vy, vz);
        if (v && PAL_HARD[v] <= 4 && vy >= 2) { hx = vx; hy = vy; hz = vz; found = true; break; }
      }
      if (!found) continue;
      // irregular blob around the hit
      const br = rng.range(1.2, 2.2 + power * 0.25);
      const B = Math.ceil(br) + 1;
      const S = B * 2 + 1;
      const vox = new Uint8Array(S * S * S);
      let cnt = 0;
      for (let y = -B; y <= B; y++) for (let z = -B; z <= B; z++) for (let x = -B; x <= B; x++) {
        const d = Math.sqrt(x * x + y * y + z * z) * (0.8 + 0.4 * ((hash3(hx + x, hy + y, hz + z) & 255) / 255));
        if (d > br) continue;
        const wx = hx + x, wy = hy + y, wz = hz + z;
        if (wy < 3) continue;
        const v = w.get(wx, wy, wz);
        if (!v || PAL_HARD[v] > 4 || PAL_TRANSPARENT[v]) continue;
        vox[(x + B) + S * ((z + B) + S * (y + B))] = v;
        w.set(wx, wy, wz, 0);
        g.structure.noteRemoved(wx, wy, wz);
        cnt++;
      }
      if (cnt < 3) continue;
      const sp = (7 + power * 1.8) * rng.range(0.5, 1.2) / Math.max(1, Math.hypot(hx * 0.1 - cx, hy * 0.1 - cy, hz * 0.1 - cz) / r);
      const vel = new Vec3(dx * sp, dy * sp + 2.5, dz * sp);
      const b = g.spawnGrid(vox, S, S, S, hx - B, hy - B, hz - B, vel);
      if (b) {
        b.ang.set(rng.range(-8, 8), rng.range(-8, 8), rng.range(-8, 8));
        b.age = 0;
      }
    }
  }
}
