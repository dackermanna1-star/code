// Procedural 64x64 test textures (canvas) + quad/box geometry emitters used by the world-material probes.
import { flipRowsRGBA, canvasToLayer } from "./render-materials-worldmat.ts";

export const TEX = 64;

function canvas2d(size: number): [HTMLCanvasElement, CanvasRenderingContext2D] {
  const c = document.createElement("canvas");
  c.width = size;
  c.height = size;
  return [c, c.getContext("2d", { willReadFrequently: true })!];
}

/** Albedo layers: 0 checker+arrow, 1 bricks, 2 wood, 3 blue tiles, 4 white, 5 "F" test glyph. Alpha = roughness mult. */
export function makeAlbedoLayers(size = TEX): Uint8Array[] {
  const layers: Uint8Array[] = [];
  // 0: grey checker with a red up-arrow in the top-left cell (orientation/tiling check)
  {
    const [c, g] = canvas2d(size);
    const s = size / 8;
    for (let y = 0; y < 8; y++) for (let x = 0; x < 8; x++) {
      g.fillStyle = (x + y) % 2 ? "#d8d8d8" : "#8a8a8a";
      g.fillRect(x * s, y * s, s, s);
    }
    g.fillStyle = "#e01010";
    g.beginPath();
    g.moveTo(size * 0.25, size * 0.05);
    g.lineTo(size * 0.45, size * 0.3);
    g.lineTo(size * 0.05, size * 0.3);
    g.fill();
    g.fillRect(size * 0.2, size * 0.3, size * 0.1, size * 0.15);
    layers.push(canvasToLayer(c));
  }
  // 1: bricks
  {
    const [c, g] = canvas2d(size);
    g.fillStyle = "#cfc6b8";
    g.fillRect(0, 0, size, size);
    const bh = size / 4, bw = size / 2;
    for (let row = 0; row < 4; row++) {
      const off = row % 2 ? bw / 2 : 0;
      for (let k = -1; k < 3; k++) {
        const shade = 140 + ((row * 7 + k * 13) % 5) * 12;
        g.fillStyle = `rgb(${shade},${Math.round(shade * 0.42)},${Math.round(shade * 0.3)})`;
        g.fillRect(k * bw + off + 2, row * bh + 2, bw - 4, bh - 4);
      }
    }
    const l = canvasToLayer(c);
    for (let i = 3; i < l.length; i += 4) l[i] = 255; // roughness mult 1
    layers.push(l);
  }
  // 2: wood planks
  {
    const [c, g] = canvas2d(size);
    for (let x = 0; x < size; x++) {
      const t = Math.sin(x * 0.7) * 0.5 + Math.sin(x * 0.23 + 1) * 0.5;
      const v = 120 + t * 25;
      g.fillStyle = `rgb(${Math.round(v * 1.25)},${Math.round(v * 0.8)},${Math.round(v * 0.45)})`;
      g.fillRect(x, 0, 1, size);
    }
    g.fillStyle = "rgba(40,20,10,0.8)";
    g.fillRect(size / 2 - 1, 0, 2, size);
    layers.push(canvasToLayer(c));
  }
  // 3: blue ceramic tiles with white grout; roughness multiplier lower on tiles (alpha 80) than grout (255)
  {
    const [c, g] = canvas2d(size);
    g.fillStyle = "#f0f0f0";
    g.fillRect(0, 0, size, size);
    g.fillStyle = "#3a6fb0";
    const t = size / 2;
    for (let y = 0; y < 2; y++) for (let x = 0; x < 2; x++) g.fillRect(x * t + 2, y * t + 2, t - 4, t - 4);
    const l = canvasToLayer(c);
    for (let i = 0; i < l.length; i += 4) l[i + 3] = l[i + 2] > 200 && l[i] > 200 ? 255 : 80;
    layers.push(l);
  }
  // 4: white
  {
    const l = new Uint8Array(size * size * 4).fill(255);
    layers.push(l);
  }
  // 5: big asymmetric "F" on yellow (orientation check: F reads correctly when upright, not mirrored)
  {
    const [c, g] = canvas2d(size);
    g.fillStyle = "#f0d020";
    g.fillRect(0, 0, size, size);
    g.fillStyle = "#101010";
    g.fillRect(size * 0.25, size * 0.1, size * 0.15, size * 0.8); // stem
    g.fillRect(size * 0.25, size * 0.1, size * 0.5, size * 0.15); // top bar
    g.fillRect(size * 0.25, size * 0.45, size * 0.35, size * 0.12); // middle bar
    layers.push(canvasToLayer(c));
  }
  return layers;
}

/** Height field (image space: row 0 = top) -> OpenGL-style normal map bytes, rows flipped so top = v 1. */
export function heightToNormalLayer(h: Float32Array, size: number, strength: number): Uint8Array {
  const out = new Uint8Array(size * size * 4);
  const H = (x: number, y: number) => h[((y + size) % size) * size + ((x + size) % size)];
  for (let y = 0; y < size; y++) for (let x = 0; x < size; x++) {
    const dx = (H(x + 1, y) - H(x - 1, y)) * 0.5 * strength; // +x = right = +u
    const dyUp = (H(x, y - 1) - H(x, y + 1)) * 0.5 * strength; // +y = up (towards row 0) = +v after flip
    let nx = -dx, ny = -dyUp, nz = 1;
    const len = Math.hypot(nx, ny, nz);
    nx /= len; ny /= len; nz /= len;
    const o = (y * size + x) * 4;
    out[o] = Math.round((nx * 0.5 + 0.5) * 255);
    out[o + 1] = Math.round((ny * 0.5 + 0.5) * 255);
    out[o + 2] = Math.round((nz * 0.5 + 0.5) * 255);
    out[o + 3] = 255;
  }
  flipRowsRGBA(out, size, size);
  return out;
}

/** Normal layers: 0 flat, 1 bricks (mortar grooves, matches albedo layer 1), 2 domes (4x4 bumps), 3 tile grooves. */
export function makeNormalLayers(size = TEX): Uint8Array[] {
  const flat = new Uint8Array(size * size * 4);
  for (let i = 0; i < flat.length; i += 4) flat.set([128, 128, 255, 255], i);
  const bricks = new Float32Array(size * size);
  const bh = size / 4, bw = size / 2;
  for (let y = 0; y < size; y++) for (let x = 0; x < size; x++) {
    const row = Math.floor(y / bh);
    const off = row % 2 ? bw / 2 : 0;
    const lx = (((x - off) % bw) + bw) % bw, ly = y % bh;
    const edge = Math.min(lx, bw - 1 - lx, ly, bh - 1 - ly);
    bricks[y * size + x] = Math.min(1, Math.max(0, (edge - 1) / 2)) * 2.0;
  }
  const domes = new Float32Array(size * size);
  const cell = size / 4;
  for (let y = 0; y < size; y++) for (let x = 0; x < size; x++) {
    const cx = (x % cell) - cell / 2 + 0.5, cy = (y % cell) - cell / 2 + 0.5;
    const r = Math.hypot(cx, cy) / (cell * 0.42);
    domes[y * size + x] = r < 1 ? Math.sqrt(1 - r * r) * 3.0 : 0;
  }
  const tiles = new Float32Array(size * size);
  const t = size / 2;
  for (let y = 0; y < size; y++) for (let x = 0; x < size; x++) {
    const lx = x % t, ly = y % t;
    const edge = Math.min(lx, t - 1 - lx, ly, t - 1 - ly);
    tiles[y * size + x] = Math.min(1, Math.max(0, (edge - 1) / 2)) * 1.5;
  }
  return [flat, heightToNormalLayer(bricks, size, 1.0), heightToNormalLayer(domes, size, 1.0), heightToNormalLayer(tiles, size, 1.0)];
}

// ---------------------------------------------------------------------------------------------------
// Geometry emitter producing Babylon front-facing triangles (see winding probe):
//   face with outward normal N and in-plane "up" V:  U = N x V (standard cross product)
//   p0 = c-U-V, p1 = c+U-V, p2 = c+U+V, p3 = c-U+V ; indices (0,1,2) (0,2,3)
//   => cross(p1-p0, p2-p0) = -N * area  (Babylon front face = CLOCKWISE by the right-hand rule)
export type V3 = [number, number, number];
const cross = (a: V3, b: V3): V3 => [a[1] * b[2] - a[2] * b[1], a[2] * b[0] - a[0] * b[2], a[0] * b[1] - a[1] * b[0]];
const dot = (a: V3, b: V3) => a[0] * b[0] + a[1] * b[1] + a[2] * b[2];

export interface SurfAttrs {
  layer: number;
  normalLayer: number;
  rough: number;
  emissive: number;
  tint: V3; // already in the colour space the material expects
  metal: number;
  worldSize: number; // metres per texture repeat
}

export class GeomBuilder {
  positions: number[] = [];
  normals: number[] = [];
  uvs: number[] = [];
  colors: number[] = [];
  surf: number[] = [];
  indices: number[] = [];

  quad(c: V3, n: V3, v: V3, hu: number, hv: number, s: SurfAttrs): void {
    const u = cross(n, v);
    const base = this.positions.length / 3;
    const corners: Array<[number, number]> = [[-1, -1], [1, -1], [1, 1], [-1, 1]];
    for (const [a, b] of corners) {
      const p: V3 = [c[0] + u[0] * hu * a + v[0] * hv * b, c[1] + u[1] * hu * a + v[1] * hv * b, c[2] + u[2] * hu * a + v[2] * hv * b];
      this.positions.push(...p);
      this.normals.push(...n);
      // planar uv in metres along U and V, divided by the surface world size -> repeats
      this.uvs.push(dot(p, u) / s.worldSize, dot(p, v) / s.worldSize);
      this.colors.push(s.tint[0], s.tint[1], s.tint[2], s.metal);
      this.surf.push(s.layer, s.normalLayer, s.rough, s.emissive);
    }
    this.indices.push(base, base + 1, base + 2, base, base + 2, base + 3);
  }

  /**
   * Convex planar polygon with outward normal n (any vertex order): fan-triangulated, winding fixed so that
   * cross(b - a, c - a) . n < 0 (Babylon front face). uv = planar projection on (U = n x V, V).
   */
  polyFace(pts: V3[], n: V3, s: SurfAttrs): void {
    const base = this.positions.length / 3;
    const ax = Math.abs(n[1]) < 0.9 ? ([0, 1, 0] as V3) : ([0, 0, 1] as V3);
    const u = cross(n, ax);
    const ul = Math.hypot(...u);
    const U: V3 = [u[0] / ul, u[1] / ul, u[2] / ul];
    const V = cross(U, n);
    for (const p of pts) {
      this.positions.push(...p);
      this.normals.push(...n);
      this.uvs.push(dot(p, U) / s.worldSize, dot(p, V) / s.worldSize);
      this.colors.push(s.tint[0], s.tint[1], s.tint[2], s.metal);
      this.surf.push(s.layer, s.normalLayer, s.rough, s.emissive);
    }
    const sub = (a: V3, b: V3): V3 => [a[0] - b[0], a[1] - b[1], a[2] - b[2]];
    const flip = dot(cross(sub(pts[1], pts[0]), sub(pts[2], pts[0])), n) > 0; // RH-rule CCW around n -> reverse
    for (let i = 1; i < pts.length - 1; i++) {
      if (flip) this.indices.push(base, base + i + 1, base + i);
      else this.indices.push(base, base + i, base + i + 1);
    }
  }

  box(c: V3, half: V3, faceSurf: (face: number) => SurfAttrs): void {
    const [hx, hy, hz] = half;
    // +X, -X, +Y, -Y, +Z, -Z ; V = up for sides, +Z for top/bottom
    this.quad([c[0] + hx, c[1], c[2]], [1, 0, 0], [0, 1, 0], hz, hy, faceSurf(0));
    this.quad([c[0] - hx, c[1], c[2]], [-1, 0, 0], [0, 1, 0], hz, hy, faceSurf(1));
    this.quad([c[0], c[1] + hy, c[2]], [0, 1, 0], [0, 0, 1], hx, hz, faceSurf(2));
    this.quad([c[0], c[1] - hy, c[2]], [0, -1, 0], [0, 0, 1], hx, hz, faceSurf(3));
    this.quad([c[0], c[1], c[2] + hz], [0, 0, 1], [0, 1, 0], hx, hy, faceSurf(4));
    this.quad([c[0], c[1], c[2] - hz], [0, 0, -1], [0, 1, 0], hx, hy, faceSurf(5));
  }
}
