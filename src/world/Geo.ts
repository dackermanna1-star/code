/**
 * Procedural low-poly geometry builder.
 *
 * Every static world prop is appended into a `Geo` (flat-shaded triangles with
 * per-face vertex colors) and each chunk ends up as a handful of merged meshes
 * that share one vertex-colored toon material. That gives one draw call per
 * chunk layer instead of one per prop, and the faceted "toy diorama" look.
 *
 * Polygon convention: points are listed so that the right-hand-rule normal
 * (Newell) points OUTWARD. Indices are emitted reversed, which is what
 * Babylon's left-handed front-face winding (and Havok's mesh import) expects.
 */
import { Color3, Mesh, VertexData, type Material, type Scene } from "@babylonjs/core";

export type RGB = readonly [number, number, number];

const rgbCache = new Map<string, RGB>();

/** Parse a hex color into a cached linear-ish RGB triple (0..1). */
export function rgb(hex: string): RGB {
  let c = rgbCache.get(hex);
  if (!c) {
    const col = Color3.FromHexString(hex.length === 4 ? `#${hex[1]}${hex[1]}${hex[2]}${hex[2]}${hex[3]}${hex[3]}` : hex);
    c = [col.r, col.g, col.b];
    rgbCache.set(hex, c);
  }
  return c;
}

export function mix(a: RGB, b: RGB, t: number): RGB {
  return [a[0] + (b[0] - a[0]) * t, a[1] + (b[1] - a[1]) * t, a[2] + (b[2] - a[2]) * t];
}

/** Lighten (+) / darken (-) an RGB color. */
export function tint(c: RGB, amount: number): RGB {
  return amount >= 0 ? mix(c, [1, 1, 1], amount) : mix(c, [0, 0, 0], -amount);
}

export function toHex(c: RGB): string {
  const h = (v: number) => Math.round(Math.min(1, Math.max(0, v)) * 255).toString(16).padStart(2, "0");
  return `#${h(c[0])}${h(c[1])}${h(c[2])}`;
}

/** Affine transform (3x4, row-major): x' = m0 x + m1 y + m2 z + m3 ... */
export class Xf {
  readonly m = new Float64Array([1, 0, 0, 0, 0, 1, 0, 0, 0, 0, 1, 0]);

  static identity(): Xf {
    return new Xf();
  }

  /** Translate * RotY * RotX * RotZ * Scale. */
  static trs(px: number, py: number, pz: number, ry = 0, s: number | readonly [number, number, number] = 1, rx = 0, rz = 0): Xf {
    const x = new Xf();
    const [sx, sy, sz] = typeof s === "number" ? [s, s, s] : s;
    const cy = Math.cos(ry), sny = Math.sin(ry);
    const cx = Math.cos(rx), snx = Math.sin(rx);
    const cz = Math.cos(rz), snz = Math.sin(rz);
    // R = Ry * Rx * Rz (Babylon's yaw-pitch-roll order)
    const r00 = cy * cz + sny * snx * snz, r01 = -cy * snz + sny * snx * cz, r02 = sny * cx;
    const r10 = cx * snz, r11 = cx * cz, r12 = -snx;
    const r20 = -sny * cz + cy * snx * snz, r21 = sny * snz + cy * snx * cz, r22 = cy * cx;
    const m = x.m;
    m[0] = r00 * sx; m[1] = r01 * sy; m[2] = r02 * sz; m[3] = px;
    m[4] = r10 * sx; m[5] = r11 * sy; m[6] = r12 * sz; m[7] = py;
    m[8] = r20 * sx; m[9] = r21 * sy; m[10] = r22 * sz; m[11] = pz;
    return x;
  }

  /** this * b (apply b first). */
  mul(b: Xf): Xf {
    const r = new Xf();
    const a = this.m, c = b.m, o = r.m;
    for (let i = 0; i < 3; i++) {
      const a0 = a[i * 4], a1 = a[i * 4 + 1], a2 = a[i * 4 + 2];
      o[i * 4] = a0 * c[0] + a1 * c[4] + a2 * c[8];
      o[i * 4 + 1] = a0 * c[1] + a1 * c[5] + a2 * c[9];
      o[i * 4 + 2] = a0 * c[2] + a1 * c[6] + a2 * c[10];
      o[i * 4 + 3] = a0 * c[3] + a1 * c[7] + a2 * c[11] + a[i * 4 + 3];
    }
    return r;
  }
}

/** A prebuilt piece of geometry that can be stamped many times. */
export interface Template {
  pos: Float32Array;
  nrm: Float32Array;
  col: Float32Array; // rgba
  idx: Uint32Array;
}

const TMP: number[] = [];

export class Geo {
  pos: number[] = [];
  nrm: number[] = [];
  col: number[] = [];
  idx: number[] = [];
  /** Per-face brightness variation (0..0.2) for the faceted look. */
  jitter = 0.05;
  /** Current transform applied to every primitive. */
  xf: Xf = new Xf();
  private stack: Xf[] = [];
  private seed = 1234567;

  get vertexCount(): number {
    return this.pos.length / 3;
  }

  /** Push a local transform (composed with the current one). */
  push(x: Xf): this {
    this.stack.push(this.xf);
    this.xf = this.xf.mul(x);
    return this;
  }

  pop(): this {
    this.xf = this.stack.pop() ?? new Xf();
    return this;
  }

  /** Run `fn` with a temporary transform. */
  at(x: Xf, fn: () => void): void {
    this.push(x);
    fn();
    this.pop();
  }

  private rand(): number {
    this.seed = (Math.imul(this.seed, 1664525) + 1013904223) >>> 0;
    return this.seed / 4294967296;
  }

  /**
   * Convex planar polygon from flat local xyz array, outward normal by the
   * right-hand rule. Points are transformed by the current transform.
   */
  poly(p: ArrayLike<number>, color: RGB, jitter = this.jitter): void {
    const n = p.length / 3;
    if (n < 3) return;
    const m = this.xf.m;
    const base = this.pos.length / 3;
    const w = TMP;
    w.length = 0;
    for (let i = 0; i < n; i++) {
      const x = p[i * 3], y = p[i * 3 + 1], z = p[i * 3 + 2];
      w.push(m[0] * x + m[1] * y + m[2] * z + m[3], m[4] * x + m[5] * y + m[6] * z + m[7], m[8] * x + m[9] * y + m[10] * z + m[11]);
    }
    // Newell normal
    let nx = 0, ny = 0, nz = 0;
    for (let i = 0; i < n; i++) {
      const j = (i + 1) % n;
      const ax = w[i * 3], ay = w[i * 3 + 1], az = w[i * 3 + 2];
      const bx = w[j * 3], by = w[j * 3 + 1], bz = w[j * 3 + 2];
      nx += (ay - by) * (az + bz);
      ny += (az - bz) * (ax + bx);
      nz += (ax - bx) * (ay + by);
    }
    const len = Math.hypot(nx, ny, nz);
    if (len < 1e-9) return; // degenerate
    nx /= len; ny /= len; nz /= len;
    const k = jitter > 0 ? 1 + (this.rand() - 0.5) * 2 * jitter : 1;
    const r = color[0] * k, g = color[1] * k, b = color[2] * k;
    for (let i = 0; i < n; i++) {
      this.pos.push(w[i * 3], w[i * 3 + 1], w[i * 3 + 2]);
      this.nrm.push(nx, ny, nz);
      this.col.push(r, g, b, 1);
    }
    for (let i = 1; i < n - 1; i++) this.idx.push(base, base + i + 1, base + i);
  }

  tri(ax: number, ay: number, az: number, bx: number, by: number, bz: number, cx: number, cy: number, cz: number, color: RGB, jitter = this.jitter): void {
    this.poly([ax, ay, az, bx, by, bz, cx, cy, cz], color, jitter);
  }

  /**
   * Axis-aligned box centered at (cx, cy, cz) with full sizes (sx, sy, sz).
   * `taper` shrinks the top face (x, z) for chunky trapezoid shapes.
   */
  box(cx: number, cy: number, cz: number, sx: number, sy: number, sz: number, color: RGB, o: BoxOpts = {}): void {
    const hx = sx / 2, hy = sy / 2, hz = sz / 2;
    const tx = o.taperX ?? o.taper ?? 1;
    const tz = o.taperZ ?? o.taper ?? 1;
    const c = (i: number): [number, number, number] => {
      const top = (i & 2) !== 0;
      const fx = top ? tx : 1;
      const fz = top ? tz : 1;
      return [cx + ((i & 1) ? hx : -hx) * fx + (top ? o.shiftX ?? 0 : 0), cy + (top ? hy : -hy), cz + ((i & 4) ? hz : -hz) * fz + (top ? o.shiftZ ?? 0 : 0)];
    };
    const C = [0, 1, 2, 3, 4, 5, 6, 7].map(c);
    const face = (a: number, b: number, d: number, e: number, col: RGB) => this.poly([...C[a], ...C[b], ...C[d], ...C[e]], col);
    const side = o.side ?? color;
    face(1, 3, 7, 5, side); // +X
    face(0, 4, 6, 2, side); // -X
    if (!o.noTop) face(2, 6, 7, 3, o.top ?? color); // +Y
    if (!o.noBottom) face(0, 1, 5, 4, o.bottom ?? tint(color, -0.3)); // -Y
    face(4, 5, 7, 6, o.front ?? color); // +Z
    face(0, 2, 3, 1, o.back ?? color); // -Z
  }

  /**
   * Cylinder / frustum / cone standing on y = by, height h, `sides` facets.
   */
  cyl(cx: number, by: number, cz: number, r0: number, r1: number, h: number, sides: number, color: RGB, o: CylOpts = {}): void {
    const a0 = o.angle ?? Math.PI / sides;
    const ring = (r: number, y: number) => {
      const pts: number[] = [];
      for (let k = 0; k < sides; k++) {
        const a = a0 + (k / sides) * Math.PI * 2;
        pts.push(cx + Math.cos(a) * r * (o.sx ?? 1), y, cz + Math.sin(a) * r * (o.sz ?? 1));
      }
      return pts;
    };
    const B = ring(r0, by);
    const T = ring(r1, by + h);
    for (let k = 0; k < sides; k++) {
      const j = (k + 1) % sides;
      if (r1 <= 1e-6) {
        this.poly([B[k * 3], B[k * 3 + 1], B[k * 3 + 2], cx, by + h, cz, B[j * 3], B[j * 3 + 1], B[j * 3 + 2]], color);
      } else {
        this.poly([B[k * 3], B[k * 3 + 1], B[k * 3 + 2], T[k * 3], T[k * 3 + 1], T[k * 3 + 2], T[j * 3], T[j * 3 + 1], T[j * 3 + 2], B[j * 3], B[j * 3 + 1], B[j * 3 + 2]], color);
      }
    }
    if (r1 > 1e-6 && o.capTop !== false) {
      const p: number[] = [];
      for (let k = sides - 1; k >= 0; k--) p.push(T[k * 3], T[k * 3 + 1], T[k * 3 + 2]);
      this.poly(p, o.top ?? color);
    }
    if (o.capBottom) {
      const p: number[] = [];
      for (let k = 0; k < sides; k++) p.push(B[k * 3], B[k * 3 + 1], B[k * 3 + 2]);
      this.poly(p, tint(color, -0.3));
    }
  }

  /** Cylinder lying along the local X axis (wheels, barrels on their side, logs). */
  cylX(cx: number, cy: number, cz: number, r: number, len: number, sides: number, color: RGB, cap?: RGB): void {
    this.at(Xf.trs(cx, cy, cz, 0, 1, 0, Math.PI / 2), () => this.cyl(0, -len / 2, 0, r, r, len, sides, color, { capBottom: true, top: cap }));
  }

  /** Cylinder lying along the local Z axis. */
  cylZ(cx: number, cy: number, cz: number, r: number, len: number, sides: number, color: RGB, cap?: RGB): void {
    this.at(Xf.trs(cx, cy, cz, 0, 1, Math.PI / 2, 0), () => this.cyl(0, -len / 2, 0, r, r, len, sides, color, { capBottom: true, top: cap }));
  }

  /**
   * Low-poly ellipsoid (rocks, bushes, canopies). `rough` displaces vertices
   * deterministically for a chiseled look.
   */
  blob(cx: number, cy: number, cz: number, rx: number, ry: number, rz: number, color: RGB, seg = 7, rings = 4, rough = 0, seed = 1, flatBottom = false): void {
    const P: number[][] = [];
    for (let i = 0; i <= rings; i++) {
      const v = i / rings;
      const phi = v * Math.PI;
      const row: number[] = [];
      for (let k = 0; k < seg; k++) {
        const th = (k / seg) * Math.PI * 2 + (i % 2) * (Math.PI / seg);
        let s = 1;
        if (rough > 0 && i > 0 && i < rings) {
          const hsh = Math.sin((i * 12.9898 + k * 78.233 + seed * 37.719) * 43758.5453);
          s = 1 + (hsh - Math.floor(hsh) - 0.5) * 2 * rough;
        }
        let y = Math.cos(phi) * ry;
        if (flatBottom && y < -ry * 0.35) y = -ry * 0.35;
        row.push(cx + Math.sin(phi) * Math.cos(th) * rx * s, cy + y, cz + Math.sin(phi) * Math.sin(th) * rz * s);
      }
      P.push(row);
    }
    for (let i = 0; i < rings; i++) {
      for (let k = 0; k < seg; k++) {
        const j = (k + 1) % seg;
        const a = P[i], b = P[i + 1];
        // outward: top-ring k, top-ring j, bottom-ring j, bottom-ring k (viewed from outside)
        if (i === 0) this.poly([a[k * 3], a[k * 3 + 1], a[k * 3 + 2], b[j * 3], b[j * 3 + 1], b[j * 3 + 2], b[k * 3], b[k * 3 + 1], b[k * 3 + 2]], color);
        else if (i === rings - 1) this.poly([a[k * 3], a[k * 3 + 1], a[k * 3 + 2], a[j * 3], a[j * 3 + 1], a[j * 3 + 2], b[k * 3], b[k * 3 + 1], b[k * 3 + 2]], color);
        else {
          this.poly([a[k * 3], a[k * 3 + 1], a[k * 3 + 2], a[j * 3], a[j * 3 + 1], a[j * 3 + 2], b[j * 3], b[j * 3 + 1], b[j * 3 + 2]], color);
          this.poly([a[k * 3], a[k * 3 + 1], a[k * 3 + 2], b[j * 3], b[j * 3 + 1], b[j * 3 + 2], b[k * 3], b[k * 3 + 1], b[k * 3 + 2]], color);
        }
      }
    }
  }

  /** Oriented box (beam) from point A to point B in local space; w = width, h = height. */
  beam(ax: number, ay: number, az: number, bx: number, by: number, bz: number, w: number, h: number, color: RGB): void {
    const dx = bx - ax, dy = by - ay, dz = bz - az;
    const len = Math.hypot(dx, dy, dz);
    if (len < 1e-4) return;
    const yaw = Math.atan2(dx, dz);
    const pitch = -Math.atan2(dy, Math.hypot(dx, dz));
    this.at(Xf.trs((ax + bx) / 2, (ay + by) / 2, (az + bz) / 2, yaw, 1, pitch), () => this.box(0, 0, 0, w, h, len, color));
  }

  /** Flat quad in the XZ plane facing up, used for decals/pads. */
  pad(cx: number, cy: number, cz: number, sx: number, sz: number, color: RGB): void {
    const x0 = cx - sx / 2, x1 = cx + sx / 2, z0 = cz - sz / 2, z1 = cz + sz / 2;
    this.poly([x0, cy, z0, x0, cy, z1, x1, cy, z1, x1, cy, z0], color, 0);
  }

  /** Flat disc facing up. */
  disc(cx: number, cy: number, cz: number, r: number, sides: number, color: RGB): void {
    const p: number[] = [];
    for (let k = sides - 1; k >= 0; k--) {
      const a = (k / sides) * Math.PI * 2;
      p.push(cx + Math.cos(a) * r, cy, cz + Math.sin(a) * r);
    }
    this.poly(p, color, 0);
  }

  /** Flat ring (annulus) facing up. */
  ring(cx: number, cy: number, cz: number, r0: number, r1: number, sides: number, color: RGB): void {
    for (let k = 0; k < sides; k++) {
      const a = (k / sides) * Math.PI * 2, b = ((k + 1) / sides) * Math.PI * 2;
      const ca = Math.cos(a), sa = Math.sin(a), cb = Math.cos(b), sb = Math.sin(b);
      this.poly([cx + ca * r0, cy, cz + sa * r0, cx + cb * r0, cy, cz + sb * r0, cx + cb * r1, cy, cz + sb * r1, cx + ca * r1, cy, cz + sa * r1], color, 0);
    }
  }

  /** Append a template through `x` (composed with the current transform). */
  stamp(t: Template, x: Xf, colorScale = 1): void {
    const m = this.xf.mul(x).m;
    const base = this.pos.length / 3;
    const n = t.pos.length / 3;
    for (let i = 0; i < n; i++) {
      const px = t.pos[i * 3], py = t.pos[i * 3 + 1], pz = t.pos[i * 3 + 2];
      this.pos.push(m[0] * px + m[1] * py + m[2] * pz + m[3], m[4] * px + m[5] * py + m[6] * pz + m[7], m[8] * px + m[9] * py + m[10] * pz + m[11]);
      const nx = t.nrm[i * 3], ny = t.nrm[i * 3 + 1], nz = t.nrm[i * 3 + 2];
      let ox = m[0] * nx + m[1] * ny + m[2] * nz, oy = m[4] * nx + m[5] * ny + m[6] * nz, oz = m[8] * nx + m[9] * ny + m[10] * nz;
      const l = Math.hypot(ox, oy, oz) || 1;
      ox /= l; oy /= l; oz /= l;
      this.nrm.push(ox, oy, oz);
      this.col.push(t.col[i * 4] * colorScale, t.col[i * 4 + 1] * colorScale, t.col[i * 4 + 2] * colorScale, 1);
    }
    for (let i = 0; i < t.idx.length; i++) this.idx.push(t.idx[i] + base);
  }

  toTemplate(): Template {
    return {
      pos: new Float32Array(this.pos),
      nrm: new Float32Array(this.nrm),
      col: new Float32Array(this.col),
      idx: new Uint32Array(this.idx),
    };
  }

  /** Build a Babylon mesh (null if empty). */
  toMesh(name: string, scene: Scene, material: Material | null): Mesh | null {
    if (this.idx.length === 0) return null;
    const mesh = new Mesh(name, scene);
    const vd = new VertexData();
    vd.positions = new Float32Array(this.pos);
    vd.normals = new Float32Array(this.nrm);
    vd.colors = new Float32Array(this.col);
    vd.indices = this.vertexCount > 65535 ? new Uint32Array(this.idx) : new Uint16Array(this.idx);
    vd.applyToMesh(mesh, false);
    mesh.material = material;
    mesh.isPickable = false;
    return mesh;
  }
}

export interface BoxOpts {
  taper?: number;
  taperX?: number;
  taperZ?: number;
  shiftX?: number;
  shiftZ?: number;
  top?: RGB;
  bottom?: RGB;
  side?: RGB;
  front?: RGB;
  back?: RGB;
  noTop?: boolean;
  noBottom?: boolean;
}

export interface CylOpts {
  capTop?: boolean;
  capBottom?: boolean;
  top?: RGB;
  angle?: number;
  sx?: number;
  sz?: number;
}

/** Collision-only triangle soup (shared vertices), fed to a PhysicsShapeMesh. */
export class ColGeo {
  pos: number[] = [];
  idx: number[] = [];

  vert(x: number, y: number, z: number): number {
    this.pos.push(x, y, z);
    return this.pos.length / 3 - 1;
  }

  /** Triangle with outward (right-hand) normal; emitted in Babylon winding. */
  tri(a: number, b: number, c: number): void {
    this.idx.push(a, c, b);
  }

  /** Convex polygon from flat xyz (outward right-hand normal). */
  poly(p: ArrayLike<number>): void {
    const n = p.length / 3;
    const base = this.pos.length / 3;
    for (let i = 0; i < p.length; i++) this.pos.push(p[i]);
    for (let i = 1; i < n - 1; i++) this.idx.push(base, base + i + 1, base + i);
  }

  toMesh(name: string, scene: Scene): Mesh | null {
    if (this.idx.length === 0) return null;
    const mesh = new Mesh(name, scene);
    const vd = new VertexData();
    vd.positions = new Float32Array(this.pos);
    vd.indices = new Uint32Array(this.idx);
    vd.applyToMesh(mesh, false);
    mesh.isVisible = false;
    mesh.isPickable = false;
    return mesh;
  }
}
