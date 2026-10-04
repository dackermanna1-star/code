/**
 * Progressive terrain destruction for the hero's punches, done within a per-tick edit/time budget
 * so even world-ending blows never freeze the game:
 *
 *  - `cone`: a punch shockwave travelling along a direction, hollowing a ragged, widening tunnel
 *    (the front advances at the wave's speed; slices behind it are cut as budget allows).
 *  - `sphere`: an impact blast.
 *  - `crater`: the planet-breaker. A ring front expands from ground zero to the edge of the
 *    loaded world: inside it every column is cut down to a bowl (deep at the centre, flattening
 *    everything above the impact height further out), with radial fissures that go to the bottom
 *    of the world and fill with lava.
 *
 * Edits go through an `EditSink` (BulkEdit in game, the world directly in tests).
 */
import * as THREE from 'three';
import { BLOCKS, BLOCK_BY_NAME } from '../../world/blocks/registry';

export interface EditSink {
  get(x: number, y: number, z: number): number;
  set(x: number, y: number, z: number, state: number): boolean;
  /** Highest non-air y of a column (approximate is fine; -1 when empty). */
  top(x: number, z: number): number;
  /** A block was destroyed (debris / dust / drops). `dir` = blast direction at the block. */
  destroyed?(x: number, y: number, z: number, state: number, dir: THREE.Vector3, job: CarveJob): void;
}

const UNBREAKABLE = new Set(['bedrock', 'barrier', 'end_portal_frame', 'command_block']);
function breakable(st: number) {
  return st !== 0 && !UNBREAKABLE.has(BLOCKS[st >>> 4]?.name ?? '');
}

/** Cheap hash noise in [0,1). */
function h3(x: number, y: number, z: number) {
  let h = (x * 374761393 + y * 668265263 + z * 1274126177) | 0;
  h = Math.imul(h ^ (h >>> 13), 1274126177);
  return ((h ^ (h >>> 16)) >>> 0) / 4294967296;
}

export interface CarveJob {
  kind: 'cone' | 'sphere' | 'crater';
  /** 0..1 progress of the front. */
  readonly front: number;
  done: boolean;
  /** User data (effects). */
  tag?: string;
  /** How many blocks it destroyed so far. */
  count: number;
}

interface Cone extends CarveJob {
  kind: 'cone';
  o: THREE.Vector3;
  d: THREE.Vector3;
  u: THREE.Vector3;
  v: THREE.Vector3;
  length: number;
  r0: number;
  r1: number;
  speed: number;
  /** distance the wave front has reached / distance carved so far */
  reach: number;
  cut: number;
  seed: number;
  front: number;
}
interface Sphere extends CarveJob {
  kind: 'sphere';
  c: THREE.Vector3;
  r: number;
  y: number; // next layer to cut (top-down)
  front: number;
}
interface Crater extends CarveJob {
  kind: 'crater';
  c: THREE.Vector3;
  R: number;
  depth: number;
  speed: number;
  reach: number;
  /** columns sorted by distance, cut in order */
  cols: Int32Array;
  next: number;
  fissures: number[];
  lava: number;
  front: number;
}

export class Carver {
  readonly jobs: CarveJob[] = [];
  private tmp = new THREE.Vector3();

  constructor(private sink: EditSink) {}

  get busy() {
    return this.jobs.length > 0;
  }

  /** A punch shockwave: tunnel from `o` along `d`, radius r0 → r1 over `length`, front speed m/s. */
  cone(o: THREE.Vector3, d: THREE.Vector3, length: number, r0: number, r1: number, speed: number, tag?: string): CarveJob {
    const dir = d.clone().normalize();
    const u = Math.abs(dir.y) < 0.9 ? new THREE.Vector3(0, 1, 0).cross(dir).normalize() : new THREE.Vector3(1, 0, 0).cross(dir).normalize();
    const v = new THREE.Vector3().crossVectors(dir, u);
    const j: Cone = { kind: 'cone', o: o.clone(), d: dir, u, v, length, r0, r1, speed, reach: 0, cut: 0, seed: Math.floor(Math.random() * 1e6), front: 0, done: false, tag, count: 0 };
    this.jobs.push(j);
    return j;
  }

  sphere(c: THREE.Vector3, r: number, tag?: string): CarveJob {
    const j: Sphere = { kind: 'sphere', c: c.clone(), r, y: Math.floor(c.y + r), front: 0, done: false, tag, count: 0 };
    this.jobs.push(j);
    return j;
  }

  /** The planet-breaker crater (radius R, centre depth `depth`), ring front speed m/s. */
  crater(c: THREE.Vector3, R: number, depth: number, speed: number, tag?: string): CarveJob {
    const cx = Math.floor(c.x), cz = Math.floor(c.z);
    const Ri = Math.ceil(R);
    const list: number[] = [];
    for (let dz = -Ri; dz <= Ri; dz++) for (let dx = -Ri; dx <= Ri; dx++) if (dx * dx + dz * dz <= R * R) list.push(dx, dz);
    // sort by distance (index sort)
    const n = list.length / 2;
    const idx = new Int32Array(n);
    for (let i = 0; i < n; i++) idx[i] = i;
    const d2 = new Float32Array(n);
    for (let i = 0; i < n; i++) d2[i] = list[i * 2] ** 2 + list[i * 2 + 1] ** 2;
    idx.sort((a, b) => d2[a] - d2[b]);
    const cols = new Int32Array(n * 2);
    for (let i = 0; i < n; i++) { cols[i * 2] = list[idx[i] * 2] + cx; cols[i * 2 + 1] = list[idx[i] * 2 + 1] + cz; }
    const fissures: number[] = [];
    const nf = 7 + Math.floor(Math.random() * 4);
    for (let i = 0; i < nf; i++) fissures.push((i / nf) * Math.PI * 2 + (Math.random() - 0.5) * 0.5);
    const lava = (BLOCK_LAVA ??= stateOf('lava'));
    const j: Crater = { kind: 'crater', c: c.clone(), R, depth, speed, reach: 0, cols, next: 0, fissures, lava, front: 0, done: false, tag, count: 0 };
    this.jobs.push(j);
    return j;
  }

  /** Advance wave fronts by dt (s). */
  advance(dt: number) {
    for (const j of this.jobs) {
      if (j.kind === 'cone') {
        const c = j as Cone;
        c.reach = Math.min(c.length, c.reach + c.speed * dt);
        c.front = c.reach / c.length;
      } else if (j.kind === 'crater') {
        const c = j as Crater;
        c.reach = Math.min(c.R, c.reach + c.speed * dt);
        c.front = c.reach / c.R;
      }
    }
  }

  /** Cut blocks behind the fronts within `maxEdits` / `maxMs`. Returns edits done. */
  work(maxEdits: number, maxMs: number): number {
    const t0 = performance.now();
    let edits = 0;
    for (let k = 0; k < this.jobs.length && edits < maxEdits; k++) {
      const j = this.jobs[k];
      if (j.kind === 'cone') edits += this.workCone(j as Cone, maxEdits - edits, t0, maxMs);
      else if (j.kind === 'sphere') edits += this.workSphere(j as Sphere, maxEdits - edits);
      else edits += this.workCrater(j as Crater, maxEdits - edits, t0, maxMs);
      if (performance.now() - t0 > maxMs) break;
    }
    for (let i = this.jobs.length - 1; i >= 0; i--) if (this.jobs[i].done) this.jobs.splice(i, 1);
    return edits;
  }

  /** Run everything to completion (tests). */
  finish() {
    for (let i = 0; i < 100000 && this.jobs.length; i++) {
      this.advance(1);
      this.work(1e9, 1e9);
    }
  }

  private kill(x: number, y: number, z: number, dir: THREE.Vector3, j: CarveJob): number {
    if (y < 1 || y > 255) return 0;
    const st = this.sink.get(x, y, z);
    if (!breakable(st)) return 0;
    if (!this.sink.set(x, y, z, 0)) return 0;
    j.count++;
    this.sink.destroyed?.(x, y, z, st, dir, j);
    return 1;
  }

  private workCone(c: Cone, budget: number, t0: number, maxMs: number): number {
    let edits = 0;
    const step = 0.55;
    const p = this.tmp;
    while (c.cut < c.reach && edits < budget) {
      const t = c.cut;
      const k = t / c.length;
      // radius widens along the tunnel, ragged by noise
      const r = c.r0 + (c.r1 - c.r0) * Math.sqrt(k);
      const rings = Math.ceil(r / step);
      for (let ri = 0; ri <= rings; ri++) {
        const rr = ri * step;
        const nA = Math.max(1, Math.ceil((2 * Math.PI * rr) / step));
        for (let ai = 0; ai < nA; ai++) {
          const a = (ai / nA) * Math.PI * 2;
          const ca = Math.cos(a), sa = Math.sin(a);
          const n = h3(Math.floor(a * 6), Math.floor(t * 0.5), c.seed);
          const edge = r * (0.82 + 0.3 * n);
          if (rr > edge) continue;
          p.copy(c.o).addScaledVector(c.d, t).addScaledVector(c.u, ca * rr).addScaledVector(c.v, sa * rr);
          edits += this.kill(Math.floor(p.x), Math.floor(p.y), Math.floor(p.z), c.d, c);
        }
      }
      c.cut += step;
      if (performance.now() - t0 > maxMs) break;
    }
    if (c.cut >= c.length) c.done = true;
    return edits;
  }

  private workSphere(s: Sphere, budget: number): number {
    let edits = 0;
    const r = s.r, cx = s.c.x, cy = s.c.y, cz = s.c.z;
    const dir = this.tmp;
    while (s.y >= Math.floor(cy - r) && edits < budget) {
      const y = s.y;
      const dy = y + 0.5 - cy;
      const rr = r * r - dy * dy;
      if (rr > 0) {
        const rc = Math.sqrt(rr);
        for (let x = Math.floor(cx - rc); x <= Math.ceil(cx + rc); x++)
          for (let z = Math.floor(cz - rc); z <= Math.ceil(cz + rc); z++) {
            const dx = x + 0.5 - cx, dz = z + 0.5 - cz;
            const d2 = dx * dx + dy * dy + dz * dz;
            if (d2 > r * r * (0.8 + 0.25 * h3(x, y, z))) continue;
            dir.set(dx, dy, dz).normalize();
            edits += this.kill(x, y, z, dir, s);
          }
      }
      s.y--;
      s.front = 1 - (s.y - (cy - r)) / (2 * r);
    }
    if (s.y < Math.floor(cy - r)) s.done = true;
    return edits;
  }

  private workCrater(c: Crater, budget: number, t0: number, maxMs: number): number {
    let edits = 0;
    const n = c.cols.length / 2;
    const cx = c.c.x, cz = c.c.z, gy = Math.floor(c.c.y);
    const dir = this.tmp;
    while (c.next < n && edits < budget) {
      const x = c.cols[c.next * 2], z = c.cols[c.next * 2 + 1];
      const dx = x + 0.5 - cx, dz = z + 0.5 - cz;
      const d = Math.hypot(dx, dz);
      if (d > c.reach) break;
      c.next++;
      const k = d / c.R;
      // bowl: deep in the middle, a gentle slope to the impact height near the edge
      let floor = Math.round(gy - c.depth * Math.pow(Math.max(0, 1 - k), 1.6) - 2 * (1 - k));
      // radial fissures to the bottom of the world
      const ang = Math.atan2(dz, dx);
      let fissure = false;
      for (const fa of c.fissures) {
        let da = Math.abs(ang - fa);
        if (da > Math.PI) da = Math.PI * 2 - da;
        const w = (2.2 - 1.6 * k) / Math.max(1, d) + 0.004;
        if (da < w && k < 0.85) { fissure = true; break; }
      }
      if (fissure) floor = 2;
      floor = Math.max(1, floor);
      const top = this.sink.top(x, z);
      dir.set(dx, 0, dz).normalize();
      dir.y = 0.6;
      for (let y = top; y > floor; y--) edits += this.kill(x, y, z, dir, c);
      if (fissure && floor <= 3) {
        this.sink.set(x, floor, z, c.lava);
      }
      if (performance.now() - t0 > maxMs) break;
    }
    if (c.next >= n) c.done = true;
    return edits;
  }
}

let BLOCK_LAVA: number | undefined;
function stateOf(name: string) {
  const b = BLOCK_BY_NAME.get(name);
  return b ? b.id << 4 : 0;
}
