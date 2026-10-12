// Extrude a pixel sprite into a voxel mesh (one cube per opaque pixel, internal faces culled).
import * as THREE from 'three';
import { PixelImage } from './art/pixels';

export interface PixelGrid {
  w: number;
  h: number;
  colors: (string | null)[]; // row-major, top row first
}

export function gridFromImage(img: PixelImage): PixelGrid {
  const colors: (string | null)[] = [];
  for (let y = 0; y < img.h; y++) for (let x = 0; x < img.w; x++) colors.push(img.isOpaque(x, y) ? img.getHex(x, y) : null);
  return { w: img.w, h: img.h, colors };
}

const FACES: { n: [number, number, number]; v: [number, number, number][] }[] = [
  { n: [1, 0, 0], v: [[1, 0, 0], [1, 1, 0], [1, 1, 1], [1, 0, 1]] },
  { n: [-1, 0, 0], v: [[0, 0, 1], [0, 1, 1], [0, 1, 0], [0, 0, 0]] },
  { n: [0, 1, 0], v: [[0, 1, 1], [1, 1, 1], [1, 1, 0], [0, 1, 0]] },
  { n: [0, -1, 0], v: [[0, 0, 0], [1, 0, 0], [1, 0, 1], [0, 0, 1]] },
  { n: [0, 0, 1], v: [[1, 0, 1], [1, 1, 1], [0, 1, 1], [0, 0, 1]] },
  { n: [0, 0, -1], v: [[0, 0, 0], [0, 1, 0], [1, 1, 0], [1, 0, 0]] },
];

/**
 * Build geometry from a pixel grid: x -> +x, rows -> -y (top row highest), extruded `depth` pixels along z.
 * The result is centred on the sprite's centre; scale converts pixels to world units.
 */
export function extrudeGrid(g: PixelGrid, scale: number, depth = 1, shadeBySide = true): THREE.BufferGeometry {
  const pos: number[] = [], col: number[] = [], nor: number[] = [], idx: number[] = [];
  const at = (x: number, y: number) => (x < 0 || y < 0 || x >= g.w || y >= g.h ? null : g.colors[y * g.w + x]);
  const c = new THREE.Color();
  for (let y = 0; y < g.h; y++)
    for (let x = 0; x < g.w; x++) {
      const hex = at(x, y);
      if (!hex) continue;
      c.set(hex);
      for (let z = 0; z < depth; z++) {
        FACES.forEach((f, fi) => {
          // cull faces between neighbouring pixels
          if (fi === 0 && at(x + 1, y)) return;
          if (fi === 1 && at(x - 1, y)) return;
          if (fi === 2 && at(x, y - 1)) return;
          if (fi === 3 && at(x, y + 1)) return;
          if (fi === 4 && z < depth - 1) return;
          if (fi === 5 && z > 0) return;
          const base = pos.length / 3;
          const shade = shadeBySide ? (fi === 2 ? 1.1 : fi === 3 ? 0.6 : fi >= 4 ? 1 : 0.8) : 1;
          for (const v of f.v) {
            pos.push((x + v[0] - g.w / 2) * scale, (g.h - y - 1 + v[1] - g.h / 2) * scale, (z + v[2] - depth / 2) * scale);
            col.push(c.r * shade, c.g * shade, c.b * shade);
            nor.push(...f.n);
          }
          idx.push(base, base + 1, base + 2, base, base + 2, base + 3);
        });
      }
    }
  const geo = new THREE.BufferGeometry();
  geo.setAttribute('position', new THREE.Float32BufferAttribute(pos, 3));
  geo.setAttribute('color', new THREE.Float32BufferAttribute(col, 3));
  geo.setAttribute('normal', new THREE.Float32BufferAttribute(nor, 3));
  geo.setIndex(idx);
  geo.computeBoundingSphere();
  return geo;
}

/** Simple box of voxels with a palette (for arms, props). */
export function voxelBox(w: number, h: number, d: number, scale: number, colorFn: (x: number, y: number, z: number) => string | null): THREE.BufferGeometry {
  const pos: number[] = [], col: number[] = [], nor: number[] = [], idx: number[] = [];
  const c = new THREE.Color();
  const at = (x: number, y: number, z: number) => (x < 0 || y < 0 || z < 0 || x >= w || y >= h || z >= d ? null : colorFn(x, y, z));
  for (let z = 0; z < d; z++)
    for (let y = 0; y < h; y++)
      for (let x = 0; x < w; x++) {
        const hex = at(x, y, z);
        if (!hex) continue;
        c.set(hex);
        FACES.forEach((f, fi) => {
          const nx = x + f.n[0], ny = y + f.n[1], nz = z + f.n[2];
          if (at(nx, ny, nz)) return;
          const base = pos.length / 3;
          const shade = fi === 2 ? 1.1 : fi === 3 ? 0.6 : fi >= 4 ? 0.95 : 0.8;
          for (const v of f.v) {
            pos.push((x + v[0] - w / 2) * scale, (y + v[1] - h / 2) * scale, (z + v[2] - d / 2) * scale);
            col.push(c.r * shade, c.g * shade, c.b * shade);
            nor.push(...f.n);
          }
          idx.push(base, base + 1, base + 2, base, base + 2, base + 3);
        });
      }
  const geo = new THREE.BufferGeometry();
  geo.setAttribute('position', new THREE.Float32BufferAttribute(pos, 3));
  geo.setAttribute('color', new THREE.Float32BufferAttribute(col, 3));
  geo.setAttribute('normal', new THREE.Float32BufferAttribute(nor, 3));
  geo.setIndex(idx);
  geo.computeBoundingSphere();
  return geo;
}
