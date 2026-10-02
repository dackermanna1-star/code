/**
 * Carvers: classic worm caves and canyons (ravines), ported from Minecraft's `CaveWorldCarver` /
 * `CanyonWorldCarver`. Every source chunk within ±RANGE chunks may start carvers (seeded per source
 * chunk); their paths are simulated and the ellipsoid "segments" intersecting a 3x3-chunk box
 * around the target chunk are collected. The target chunk carves the segments intersecting it,
 * while features in neighbouring chunks can ask `isCarved()` against the same segment list — the
 * result is identical no matter which chunk asks (pure function of seed and position).
 */
import { Rng, seedFor } from '../../../core/rng';

/** Source chunks within this many chunks of the box can reach it (paths <= 112 blocks). */
const RANGE = 7;
/** Max path length; MAX_LEN + MAX_R + 1 must stay <= 112 so RANGE = 7 covers every source. */
const MAX_LEN = 94;
const MAX_R = 14;

const enum Kind {
  CAVE = 0,
  CANYON = 1,
}

/** One carving ellipsoid. */
export interface Segment {
  x: number;
  y: number;
  z: number;
  hr: number;
  vr: number;
  /** cave: floor level (relative y <= floor is kept); canyon: unused */
  floor: number;
  kind: number;
  /** canyon width factors per absolute y (index y), shared by one canyon */
  widths: Float32Array | null;
  minX: number;
  maxX: number;
  minY: number;
  maxY: number;
  minZ: number;
  maxZ: number;
}

export interface CarveBox {
  x0: number;
  z0: number;
  x1: number;
  z1: number;
}

function makeSeg(x: number, y: number, z: number, hr: number, vr: number, floor: number, kind: number, widths: Float32Array | null): Segment {
  if (hr > MAX_R) hr = MAX_R;
  return {
    x, y, z, hr, vr, floor, kind, widths,
    minX: Math.floor(x - hr) - 1, maxX: Math.floor(x + hr) + 1,
    minY: Math.max(1, Math.floor(y - vr) - 1), maxY: Math.min(247, Math.floor(y + vr) + 1),
    minZ: Math.floor(z - hr) - 1, maxZ: Math.floor(z + hr) + 1,
  };
}

/** Pure test: is block (bx, by, bz) inside the segment's carve shape? */
export function segmentContains(s: Segment, bx: number, by: number, bz: number): boolean {
  if (bx < s.minX || bx > s.maxX || by < s.minY || by > s.maxY || bz < s.minZ || bz > s.maxZ) return false;
  const rx = (bx + 0.5 - s.x) / s.hr;
  const ry = (by + 0.5 - s.y) / s.vr;
  const rz = (bz + 0.5 - s.z) / s.hr;
  if (s.kind === Kind.CAVE) {
    if (ry <= s.floor) return false;
    return rx * rx + ry * ry + rz * rz < 1;
  }
  const w = s.widths ? s.widths[by] : 1;
  return (rx * rx + rz * rz) * w + (ry * ry) / 6 < 1;
}

export class Carvers {
  private readonly cache = new Map<number, Segment[]>();
  constructor(readonly seed: number) {}

  /** All carve segments started by one source chunk (full paths, cached; pure). */
  source(sx: number, sz: number): Segment[] {
    const key = (sx + 0x100000) * 0x200000 + (sz + 0x100000);
    let out = this.cache.get(key);
    if (out) return out;
    if (this.cache.size > 800) this.cache.clear();
    out = [];
    const ctx = { out };
    // worm caves (Minecraft "cave": p = 0.15, y 8..180 -> ours 10..128)
    let r = new Rng(seedFor(this.seed, sx, sz, 0xca7e));
    if (r.next() < 0.14) this.caveSystem(ctx, r, sx, sz, 10, 128);
    // extra underground caves (p = 0.07, y 8..47 -> ours 10..48)
    r = new Rng(seedFor(this.seed, sx, sz, 0xca7f));
    if (r.next() < 0.07) this.caveSystem(ctx, r, sx, sz, 10, 48);
    // canyons (p = 0.01)
    r = new Rng(seedFor(this.seed, sx, sz, 0xca80));
    if (r.next() < 0.012) this.canyon(ctx, r, sx, sz);
    this.cache.set(key, out);
    return out;
  }

  /** All carve segments intersecting the given box (x/z inclusive block bounds). */
  segmentsFor(box: CarveBox): Segment[] {
    const out: Segment[] = [];
    const sx0 = Math.floor(box.x0 / 16) - RANGE, sx1 = Math.floor(box.x1 / 16) + RANGE;
    const sz0 = Math.floor(box.z0 / 16) - RANGE, sz1 = Math.floor(box.z1 / 16) + RANGE;
    for (let sz = sz0; sz <= sz1; sz++)
      for (let sx = sx0; sx <= sx1; sx++) {
        const list = this.source(sx, sz);
        for (let i = 0; i < list.length; i++) {
          const s = list[i];
          if (s.maxX < box.x0 || s.minX > box.x1 || s.maxZ < box.z0 || s.minZ > box.z1) continue;
          out.push(s);
        }
      }
    return out;
  }

  private emit(ctx: { out: Segment[] }, s: Segment): void {
    ctx.out.push(s);
  }

  private caveSystem(ctx: any, r: Rng, sx: number, sz: number, yMin: number, yMax: number): void {
    const count = r.int(r.int(r.int(15) + 1) + 1);
    for (let k = 0; k < count; k++) {
      const x = sx * 16 + r.int(16);
      const y = r.range(yMin, yMax);
      const z = sz * 16 + r.int(16);
      const hMul = r.float(0.7, 1.4);
      const vMul = r.float(0.8, 1.3);
      const floor = r.float(-1, -0.4);
      let tunnels = 1;
      if (r.int(4) === 0) {
        const yScale = r.float(0.1, 0.9);
        const radius = 1 + r.next() * 6;
        const d0 = 1.5 + radius;
        this.emit(ctx, makeSeg(x + 1, y, z, d0, d0 * yScale, floor, Kind.CAVE, null));
        tunnels += r.int(4);
      }
      for (let t = 0; t < tunnels; t++) {
        const yaw = r.next() * Math.PI * 2;
        const pitch = (r.next() - 0.5) / 4;
        let thick = r.next() * 2 + r.next();
        if (r.int(10) === 0) thick *= r.next() * r.next() * 3 + 1;
        const len = MAX_LEN - r.int(MAX_LEN / 4);
        this.tunnel(ctx, r.nextU32(), x, y, z, hMul, vMul, floor, thick, yaw, pitch, 0, len, 1);
      }
    }
  }

  private tunnel(ctx: any, seed: number, x: number, y: number, z: number, hMul: number, vMul: number, floor: number, thick: number, yaw: number, pitch: number, start: number, n: number, yScale: number): void {
    const r = new Rng(seed);
    const branchAt = r.int(Math.max(1, n >> 1)) + (n >> 2);
    const steep = r.int(6) === 0;
    let dYaw = 0, dPitch = 0;
    for (let j = start; j < n; j++) {
      const hr = 1.5 + Math.sin((Math.PI * j) / n) * thick;
      const vr = hr * yScale;
      const cp = Math.cos(pitch);
      x += Math.cos(yaw) * cp;
      y += Math.sin(pitch);
      z += Math.sin(yaw) * cp;
      pitch *= steep ? 0.92 : 0.7;
      pitch += dPitch * 0.1;
      yaw += dYaw * 0.1;
      dPitch *= 0.9;
      dYaw *= 0.75;
      dPitch += (r.next() - r.next()) * r.next() * 2;
      dYaw += (r.next() - r.next()) * r.next() * 4;
      if (j === branchAt && thick > 1) {
        this.tunnel(ctx, r.nextU32(), x, y, z, hMul, vMul, floor, r.next() * 0.5 + 0.5, yaw - Math.PI / 2, pitch / 3, j, n, 1);
        this.tunnel(ctx, r.nextU32(), x, y, z, hMul, vMul, floor, r.next() * 0.5 + 0.5, yaw + Math.PI / 2, pitch / 3, j, n, 1);
        return;
      }
      if (r.int(4) !== 0) {
        this.emit(ctx, makeSeg(x, y, z, hr * hMul, vr * vMul, floor, Kind.CAVE, null));
      }
    }
  }

  private canyon(ctx: any, r: Rng, sx: number, sz: number): void {
    let x = sx * 16 + r.int(16);
    let y = r.range(22, 67);
    let z = sz * 16 + r.int(16);
    let yaw = r.next() * Math.PI * 2;
    let pitch = r.float(-0.125, 0.125);
    const yScale = 3;
    // thickness: trapezoid 0..6 with plateau 2
    const thick = r.next() * 2 + r.next() * 2 + r.next() * 2;
    const n = Math.floor(MAX_LEN * r.float(0.75, 1.0));
    const rr = new Rng(r.nextU32());
    const widths = new Float32Array(256);
    let wf = 1;
    for (let i = 0; i < 256; i++) {
      if (i === 0 || rr.int(3) === 0) wf = 1 + rr.next() * rr.next();
      widths[i] = wf * wf;
    }
    let dYaw = 0, dPitch = 0;
    for (let i = 0; i < n; i++) {
      let hr = 1.5 + Math.sin((i * Math.PI) / n) * thick;
      let vr = hr * yScale;
      hr *= rr.float(0.75, 1.0);
      const f = 1 - Math.abs(0.5 - i / n) * 2;
      vr = (1.0 + 0 * f) * vr * rr.float(0.75, 1.0);
      const cp = Math.cos(pitch), sp = Math.sin(pitch);
      x += Math.cos(yaw) * cp;
      y += sp;
      z += Math.sin(yaw) * cp;
      pitch *= 0.7;
      pitch += dPitch * 0.05;
      yaw += dYaw * 0.05;
      dPitch *= 0.8;
      dYaw *= 0.5;
      dPitch += (rr.next() - rr.next()) * rr.next() * 2;
      dYaw += (rr.next() - rr.next()) * rr.next() * 4;
      if (rr.int(4) !== 0) {
        this.emit(ctx, makeSeg(x, y, z, hr, vr, 0, Kind.CANYON, widths));
      }
    }
  }
}

/** True if any segment contains the block. */
export function isCarved(segs: Segment[], x: number, y: number, z: number): boolean {
  for (let i = 0; i < segs.length; i++) if (segmentContains(segs[i], x, y, z)) return true;
  return false;
}
