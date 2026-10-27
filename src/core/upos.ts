import { Vector3 } from 'three';

/**
 * Universe position: a hierarchical fixed/float coordinate.
 *
 * Space is divided into cubic cells of CELL metres (2^40 m ≈ 7.3 AU). A
 * position is an integer cell index per axis (stored exactly in a float64,
 * up to ±2^53 cells → ±10^28 m, larger than the observable universe) plus a
 * float64 local offset within the cell. Differences between two positions
 * are computed cell-first, so the relative vector between nearby objects is
 * accurate to well below a millimetre anywhere in the universe, while
 * galaxy-to-galaxy vectors keep full relative precision.
 *
 * Rendering never uses absolute positions: every frame, objects are placed at
 * (object − camera) in float64 and only then handed to the GPU as float32
 * (a floating origin that is re-based continuously).
 */
export const CELL = 1099511627776; // 2^40 metres

export class UPos {
  constructor(
    public cx = 0, public cy = 0, public cz = 0,
    public x = 0, public y = 0, public z = 0,
  ) {}

  static fromMeters(x: number, y: number, z: number): UPos {
    return new UPos().addXYZ(x, y, z);
  }

  clone(): UPos {
    return new UPos(this.cx, this.cy, this.cz, this.x, this.y, this.z);
  }

  copy(o: UPos): this {
    this.cx = o.cx; this.cy = o.cy; this.cz = o.cz;
    this.x = o.x; this.y = o.y; this.z = o.z;
    return this;
  }

  /** Add a metre offset. Large offsets are split into cell + remainder first. */
  addXYZ(dx: number, dy: number, dz: number): this {
    if (Math.abs(dx) >= CELL) { const k = Math.floor(dx / CELL); this.cx += k; dx -= k * CELL; }
    if (Math.abs(dy) >= CELL) { const k = Math.floor(dy / CELL); this.cy += k; dy -= k * CELL; }
    if (Math.abs(dz) >= CELL) { const k = Math.floor(dz / CELL); this.cz += k; dz -= k * CELL; }
    this.x += dx; this.y += dy; this.z += dz;
    return this.normalize();
  }

  add(v: { x: number; y: number; z: number }, scale = 1): this {
    return this.addXYZ(v.x * scale, v.y * scale, v.z * scale);
  }

  addUPos(o: UPos): this {
    this.cx += o.cx; this.cy += o.cy; this.cz += o.cz;
    this.x += o.x; this.y += o.y; this.z += o.z;
    return this.normalize();
  }

  normalize(): this {
    if (this.x < 0 || this.x >= CELL) { const k = Math.floor(this.x / CELL); this.cx += k; this.x -= k * CELL; }
    if (this.y < 0 || this.y >= CELL) { const k = Math.floor(this.y / CELL); this.cy += k; this.y -= k * CELL; }
    if (this.z < 0 || this.z >= CELL) { const k = Math.floor(this.z / CELL); this.cz += k; this.z -= k * CELL; }
    return this;
  }

  /** this − o, in metres (float64). */
  sub(o: UPos, out: Vector3 = new Vector3()): Vector3 {
    out.x = (this.cx - o.cx) * CELL + (this.x - o.x);
    out.y = (this.cy - o.cy) * CELL + (this.y - o.y);
    out.z = (this.cz - o.cz) * CELL + (this.z - o.z);
    return out;
  }

  distanceTo(o: UPos): number {
    const dx = (this.cx - o.cx) * CELL + (this.x - o.x);
    const dy = (this.cy - o.cy) * CELL + (this.y - o.y);
    const dz = (this.cz - o.cz) * CELL + (this.z - o.z);
    return Math.sqrt(dx * dx + dy * dy + dz * dz);
  }

  /** Approximate absolute position in metres (loses precision beyond ~10^15 m; display only). */
  toApproxMeters(out: Vector3 = new Vector3()): Vector3 {
    return out.set(this.cx * CELL + this.x, this.cy * CELL + this.y, this.cz * CELL + this.z);
  }

  equals(o: UPos): boolean {
    return this.cx === o.cx && this.cy === o.cy && this.cz === o.cz && this.x === o.x && this.y === o.y && this.z === o.z;
  }

  toJSON(): number[] {
    return [this.cx, this.cy, this.cz, this.x, this.y, this.z];
  }

  static fromJSON(a: number[]): UPos {
    return new UPos(a[0], a[1], a[2], a[3], a[4], a[5]);
  }
}
