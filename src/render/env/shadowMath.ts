// Pure helpers for the layered (static + live) shadow caches in lighting.ts / shadowCache.ts
// (no Babylon): cube-face culling of bounding spheres, a bound on how far a box moves between
// two world matrices, texel rectangles (footprints on the orthographic sun map and on cube
// faces) and the small set of dirty rectangles a cached map is redrawn in.
//
// Matrices use Babylon's layout (Float32Array(16), row vectors): m[0..2], m[4..6], m[8..10]
// are the images of the local X, Y, Z axes and m[12..14] the translation, so a local point p
// maps to p.x·row0 + p.y·row1 + p.z·row2 + row3.

/** Every face of a cube shadow map. */
export const ALL_CUBE_FACES = 0x3f;

/**
 * Axis (0 = x, 1 = y, 2 = z) and sign of each cube shadow face in Babylon's PointLight order:
 * +X, −X, −Y, +Y, +Z, −Z (PointLight.getShadowDirection swaps the two Y faces relative to GL).
 */
export const CUBE_FACE_AXES: ReadonlyArray<readonly [number, number]> = [
  [0, 1],
  [0, -1],
  [1, -1],
  [1, 1],
  [2, 1],
  [2, -1],
];

/**
 * Faces of a cube shadow map whose 90° frustum a sphere overlaps. (dx, dy, dz) is the sphere
 * centre relative to the light, r its radius. Conservative (plane tests against the four side
 * planes and the apex): it never misses a face the sphere touches.
 */
export function cubeFaceMask(dx: number, dy: number, dz: number, r: number): number {
  if (!(r >= 0) || !Number.isFinite(dx + dy + dz)) return ALL_CUBE_FACES;
  if (dx * dx + dy * dy + dz * dz <= r * r) return ALL_CUBE_FACES; // encloses the light
  const k = r * Math.SQRT2; // side planes have normals (axis ± other)/√2
  const ax = Math.abs(dx),
    ay = Math.abs(dy),
    az = Math.abs(dz);
  let mask = 0;
  // ±X: c = ±dx, others y, z
  if (dx >= -r && dx - ay >= -k && dx - az >= -k) mask |= 1;
  if (-dx >= -r && -dx - ay >= -k && -dx - az >= -k) mask |= 2;
  // −Y (face 2), +Y (face 3)
  if (-dy >= -r && -dy - ax >= -k && -dy - az >= -k) mask |= 4;
  if (dy >= -r && dy - ax >= -k && dy - az >= -k) mask |= 8;
  // ±Z
  if (dz >= -r && dz - ax >= -k && dz - ay >= -k) mask |= 16;
  if (-dz >= -r && -dz - ax >= -k && -dz - ay >= -k) mask |= 32;
  return mask;
}

/**
 * Upper bound (m) of how far any point of a local box (centre c, half extents e) moves when its
 * world matrix changes from `prev` to `cur`: |Δ(centre)| + Σ e_i·|Δaxis_i|.
 */
export function boxDisplacement(
  prev: ArrayLike<number>,
  cur: ArrayLike<number>,
  cx: number,
  cy: number,
  cz: number,
  ex: number,
  ey: number,
  ez: number,
): number {
  const a0 = cur[0] - prev[0],
    a1 = cur[1] - prev[1],
    a2 = cur[2] - prev[2];
  const b0 = cur[4] - prev[4],
    b1 = cur[5] - prev[5],
    b2 = cur[6] - prev[6];
  const c0 = cur[8] - prev[8],
    c1 = cur[9] - prev[9],
    c2 = cur[10] - prev[10];
  const dx = cx * a0 + cy * b0 + cz * c0 + (cur[12] - prev[12]);
  const dy = cx * a1 + cy * b1 + cz * c1 + (cur[13] - prev[13]);
  const dz = cx * a2 + cy * b2 + cz * c2 + (cur[14] - prev[14]);
  const d =
    Math.sqrt(dx * dx + dy * dy + dz * dz) +
    Math.abs(ex) * Math.sqrt(a0 * a0 + a1 * a1 + a2 * a2) +
    Math.abs(ey) * Math.sqrt(b0 * b0 + b1 * b1 + b2 * b2) +
    Math.abs(ez) * Math.sqrt(c0 * c0 + c1 * c1 + c2 * c2);
  return d === d ? d : Infinity; // NaN (corrupt matrix) counts as a move
}

/** Integer texel rectangle [x0, x1) × [y0, y1); empty when x0 >= x1 or y0 >= y1. */
export interface TexelRect {
  x0: number;
  y0: number;
  x1: number;
  y1: number;
}

export function emptyRect(): TexelRect {
  return { x0: 0, y0: 0, x1: 0, y1: 0 };
}

export function rectIsEmpty(r: TexelRect): boolean {
  return r.x0 >= r.x1 || r.y0 >= r.y1;
}

export function clearRect(r: TexelRect): void {
  r.x0 = r.y0 = r.x1 = r.y1 = 0;
}

/** Grow `r` to contain [x0, x1) × [y0, y1) (ignores empty input). */
export function unionRect(r: TexelRect, x0: number, y0: number, x1: number, y1: number): void {
  if (x0 >= x1 || y0 >= y1) return;
  if (rectIsEmpty(r)) {
    r.x0 = x0;
    r.y0 = y0;
    r.x1 = x1;
    r.y1 = y1;
    return;
  }
  if (x0 < r.x0) r.x0 = x0;
  if (y0 < r.y0) r.y0 = y0;
  if (x1 > r.x1) r.x1 = x1;
  if (y1 > r.y1) r.y1 = y1;
}

/**
 * Texels of an orthographic shadow map (`size`² texels, light-space origin (minX, minY), texels
 * of `tx` × `ty` m — the light-space box is rarely square) covered by a light-space circle
 * (lx, ly, r), padded by `pad` texels and clamped to the map, grown into `out`. Returns false
 * when the circle misses the map.
 */
export function addCircleTexels(out: TexelRect, lx: number, ly: number, r: number, minX: number, minY: number, tx: number, ty: number, size: number, pad: number): boolean {
  if (!(tx > 0) || !(ty > 0) || !Number.isFinite(lx + ly + r)) {
    unionRect(out, 0, 0, size, size);
    return true;
  }
  const x0 = Math.max(0, Math.floor((lx - r - minX) / tx) - pad);
  const y0 = Math.max(0, Math.floor((ly - r - minY) / ty) - pad);
  const x1 = Math.min(size, Math.ceil((lx + r - minX) / tx) + pad);
  const y1 = Math.min(size, Math.ceil((ly + r - minY) / ty) + pad);
  if (x0 >= x1 || y0 >= y1) return false;
  unionRect(out, x0, y0, x1, y1);
  return true;
}

/** Does a light-space circle overlap a texel rectangle (same mapping as addCircleTexels, no pad)? */
export function circleHitsRect(rect: TexelRect, lx: number, ly: number, r: number, minX: number, minY: number, tx: number, ty: number): boolean {
  if (rectIsEmpty(rect)) return false;
  if (!(tx > 0) || !(ty > 0) || !Number.isFinite(lx + ly + r)) return true;
  const x0 = minX + rect.x0 * tx,
    x1 = minX + rect.x1 * tx,
    y0 = minY + rect.y0 * ty,
    y1 = minY + rect.y1 * ty;
  return lx + r >= x0 && lx - r <= x1 && ly + r >= y0 && ly - r <= y1;
}

/**
 * A few dirty texel rectangles of a 2D shadow map. Rectangles that overlap or nearly touch
 * (within `slack` texels) are merged; past `max` rectangles the new one joins the rectangle it
 * grows least. Redrawing a handful of small regions instead of their bounding box keeps two
 * changes at opposite ends of the map from redrawing everything between them.
 */
export class RectSet {
  readonly rects: TexelRect[] = [];
  /** Rectangles in use (`rects[0 .. count)`). */
  count = 0;
  readonly max: number;
  readonly slack: number;

  constructor(max = 12, slack = 8) {
    this.max = Math.max(1, max | 0);
    this.slack = Math.max(0, slack);
  }

  get empty(): boolean {
    return this.count === 0;
  }

  clear(): void {
    this.count = 0;
  }

  add(x0: number, y0: number, x1: number, y1: number): void {
    if (!(x0 < x1 && y0 < y1)) return;
    const s = this.slack;
    for (let i = 0; i < this.count; i++) {
      const r = this.rects[i];
      if (x0 <= r.x1 + s && x1 >= r.x0 - s && y0 <= r.y1 + s && y1 >= r.y0 - s) {
        unionRect(r, x0, y0, x1, y1);
        this.coalesce(i);
        return;
      }
    }
    if (this.count < this.max) {
      const r = this.rects[this.count] ?? (this.rects[this.count] = emptyRect());
      r.x0 = x0;
      r.y0 = y0;
      r.x1 = x1;
      r.y1 = y1;
      this.count++;
      return;
    }
    let best = 0,
      bestGrow = Infinity;
    for (let i = 0; i < this.count; i++) {
      const r = this.rects[i];
      const grow = (Math.max(r.x1, x1) - Math.min(r.x0, x0)) * (Math.max(r.y1, y1) - Math.min(r.y0, y0)) - (r.x1 - r.x0) * (r.y1 - r.y0);
      if (grow < bestGrow) {
        bestGrow = grow;
        best = i;
      }
    }
    unionRect(this.rects[best], x0, y0, x1, y1);
    this.coalesce(best);
  }

  addRect(r: TexelRect): void {
    this.add(r.x0, r.y0, r.x1, r.y1);
  }

  addAll(o: RectSet): void {
    for (let i = 0; i < o.count; i++) this.addRect(o.rects[i]);
  }

  /** Bounding rectangle of the set (empty rect when empty). */
  bounds(out: TexelRect): TexelRect {
    clearRect(out);
    for (let i = 0; i < this.count; i++) {
      const r = this.rects[i];
      unionRect(out, r.x0, r.y0, r.x1, r.y1);
    }
    return out;
  }

  /** Total texels covered (overlaps counted once per rectangle; rectangles never overlap after coalescing). */
  area(): number {
    let a = 0;
    for (let i = 0; i < this.count; i++) {
      const r = this.rects[i];
      a += (r.x1 - r.x0) * (r.y1 - r.y0);
    }
    return a;
  }

  /** Does a texel rectangle overlap any rectangle of the set? */
  hitsRect(x0: number, y0: number, x1: number, y1: number): boolean {
    for (let i = 0; i < this.count; i++) {
      const r = this.rects[i];
      if (x0 < r.x1 && x1 > r.x0 && y0 < r.y1 && y1 > r.y0) return true;
    }
    return false;
  }

  /** Does a light-space circle overlap any rectangle (mapping as in addCircleTexels, no pad)? */
  hitsCircle(lx: number, ly: number, r: number, minX: number, minY: number, tx: number, ty: number): boolean {
    for (let i = 0; i < this.count; i++) if (circleHitsRect(this.rects[i], lx, ly, r, minX, minY, tx, ty)) return true;
    return false;
  }

  /** Merge rectangle i with every other it now overlaps (repeat until stable). */
  private coalesce(i: number): void {
    const s = this.slack;
    let merged = true;
    while (merged) {
      merged = false;
      const a = this.rects[i];
      for (let j = 0; j < this.count; j++) {
        if (j === i) continue;
        const b = this.rects[j];
        if (b.x0 <= a.x1 + s && b.x1 >= a.x0 - s && b.y0 <= a.y1 + s && b.y1 >= a.y0 - s) {
          unionRect(a, b.x0, b.y0, b.x1, b.y1);
          // remove j (swap with last); keep `i` pointing at the merged rectangle
          const last = this.count - 1;
          if (j !== last) {
            const t = this.rects[j];
            this.rects[j] = this.rects[last];
            this.rects[last] = t;
            if (i === last) i = j;
          }
          this.count--;
          merged = true;
          break;
        }
      }
    }
  }
}

/**
 * Texels of one face of a cube shadow map (90° perspective, `size`² texels) covered by a world
 * AABB [x0,x1]×[y0,y1]×[z0,z1], written to `out` (replaced, not grown) padded by `pad` texels.
 * `view` is that face's view matrix (Babylon layout: the generator's LookAtLH for the face).
 * Tighter than the bounding sphere for flat or long casters next to the light (a fan's blade
 * disc right above the bulb only touches the upper band of the side faces). Corners in front of
 * the near plane are projected; when the box straddles the near plane, the clipped part lies at
 * depth ≥ near with view x/y inside the corners' range, so (range / near) bounds its
 * projection. Returns false when the box misses the face.
 */
export function projectBoxToFace(
  view: ArrayLike<number>,
  x0: number,
  y0: number,
  z0: number,
  x1: number,
  y1: number,
  z1: number,
  size: number,
  near: number,
  pad: number,
  out: TexelRect,
): boolean {
  let nx0 = Infinity,
    nx1 = -Infinity,
    ny0 = Infinity,
    ny1 = -Infinity;
  let vxMin = Infinity,
    vxMax = -Infinity,
    vyMin = Infinity,
    vyMax = -Infinity;
  let front = 0,
    behind = 0;
  for (let i = 0; i < 8; i++) {
    const x = i & 1 ? x1 : x0,
      y = i & 2 ? y1 : y0,
      z = i & 4 ? z1 : z0;
    const vx = x * view[0] + y * view[4] + z * view[8] + view[12];
    const vy = x * view[1] + y * view[5] + z * view[9] + view[13];
    const vz = x * view[2] + y * view[6] + z * view[10] + view[14];
    if (!Number.isFinite(vx + vy + vz)) {
      out.x0 = out.y0 = 0;
      out.x1 = out.y1 = size;
      return true;
    }
    if (vx < vxMin) vxMin = vx;
    if (vx > vxMax) vxMax = vx;
    if (vy < vyMin) vyMin = vy;
    if (vy > vyMax) vyMax = vy;
    if (vz > near) {
      front++;
      const px = vx / vz,
        py = vy / vz;
      if (px < nx0) nx0 = px;
      if (px > nx1) nx1 = px;
      if (py < ny0) ny0 = py;
      if (py > ny1) ny1 = py;
    } else behind++;
  }
  if (front === 0) return false;
  if (behind > 0) {
    // the part clipped at the near plane: depth near, view x/y within the corners' range
    nx0 = Math.min(nx0, vxMin / near);
    nx1 = Math.max(nx1, vxMax / near);
    ny0 = Math.min(ny0, vyMin / near);
    ny1 = Math.max(ny1, vyMax / near);
  }
  if (nx0 > 1 || nx1 < -1 || ny0 > 1 || ny1 < -1) return false;
  const h = size * 0.5;
  out.x0 = Math.max(0, Math.floor((Math.max(-1, nx0) + 1) * h) - pad);
  out.y0 = Math.max(0, Math.floor((Math.max(-1, ny0) + 1) * h) - pad);
  out.x1 = Math.min(size, Math.ceil((Math.min(1, nx1) + 1) * h) + pad);
  out.y1 = Math.min(size, Math.ceil((Math.min(1, ny1) + 1) * h) + pad);
  return out.x0 < out.x1 && out.y0 < out.y1;
}
