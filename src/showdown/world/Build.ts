import * as THREE from 'three';

const _m = new THREE.Matrix4();
const _q = new THREE.Quaternion();
const _e = new THREE.Euler();
const _s = new THREE.Vector3();
const _p = new THREE.Vector3();

/**
 * Accumulates coloured primitives into one merged, vertex-coloured geometry
 * (props, cars, street furniture).
 */
export class Builder {
  private pos: number[] = [];
  private nor: number[] = [];
  private col: number[] = [];
  private idx: number[] = [];

  add(g: THREE.BufferGeometry, color: THREE.ColorRepresentation, x = 0, y = 0, z = 0, rx = 0, ry = 0, rz = 0, sx = 1, sy = 1, sz = 1) {
    const c = new THREE.Color(color);
    _m.compose(_p.set(x, y, z), _q.setFromEuler(_e.set(rx, ry, rz)), _s.set(sx, sy, sz));
    return this.addM(g, c, _m);
  }

  addM(g: THREE.BufferGeometry, c: THREE.Color, m: THREE.Matrix4) {
    const src = g.index ? g : g;
    const p = src.getAttribute('position') as THREE.BufferAttribute;
    const n = src.getAttribute('normal') as THREE.BufferAttribute;
    const nm = new THREE.Matrix3().getNormalMatrix(m);
    const base = this.pos.length / 3;
    const v = new THREE.Vector3();
    for (let i = 0; i < p.count; i++) {
      v.fromBufferAttribute(p, i).applyMatrix4(m);
      this.pos.push(v.x, v.y, v.z);
      v.fromBufferAttribute(n, i).applyMatrix3(nm).normalize();
      this.nor.push(v.x, v.y, v.z);
      this.col.push(c.r, c.g, c.b);
    }
    if (src.index) for (let i = 0; i < src.index.count; i++) this.idx.push(base + src.index.getX(i));
    else for (let i = 0; i < p.count; i++) this.idx.push(base + i);
    return this;
  }

  box(w: number, h: number, d: number, color: THREE.ColorRepresentation, x = 0, y = 0, z = 0, rx = 0, ry = 0, rz = 0) {
    return this.add(BOX, color, x, y, z, rx, ry, rz, w, h, d);
  }

  cyl(rTop: number, rBot: number, h: number, color: THREE.ColorRepresentation, x = 0, y = 0, z = 0, rx = 0, ry = 0, rz = 0, seg = 8) {
    const g = cylGeo(seg);
    // the unit cylinder is r=1, h=1: scale x/z by radius, tapering via a cached tapered variant
    if (Math.abs(rTop - rBot) < 1e-6) return this.add(g, color, x, y, z, rx, ry, rz, rTop, h, rTop);
    return this.add(taperGeo(seg, rTop / rBot), color, x, y, z, rx, ry, rz, rBot, h, rBot);
  }

  sphere(r: number, color: THREE.ColorRepresentation, x = 0, y = 0, z = 0, sx = 1, sy = 1, sz = 1) {
    return this.add(SPHERE, color, x, y, z, 0, 0, 0, r * sx, r * sy, r * sz);
  }

  get empty() {
    return this.pos.length === 0;
  }

  build() {
    const g = new THREE.BufferGeometry();
    g.setAttribute('position', new THREE.Float32BufferAttribute(this.pos, 3));
    g.setAttribute('normal', new THREE.Float32BufferAttribute(this.nor, 3));
    g.setAttribute('color', new THREE.Float32BufferAttribute(this.col, 3));
    g.setIndex(this.idx);
    g.computeBoundingSphere();
    g.computeBoundingBox();
    return g;
  }
}

export const BOX = new THREE.BoxGeometry(1, 1, 1);
export const SPHERE = new THREE.SphereGeometry(1, 12, 8);
const cylCache = new Map<number, THREE.BufferGeometry>();
function cylGeo(seg: number) {
  let g = cylCache.get(seg);
  if (!g) cylCache.set(seg, (g = new THREE.CylinderGeometry(1, 1, 1, seg)));
  return g;
}
const taperCache = new Map<string, THREE.BufferGeometry>();
function taperGeo(seg: number, k: number) {
  const key = `${seg},${k.toFixed(3)}`;
  let g = taperCache.get(key);
  if (!g) taperCache.set(key, (g = new THREE.CylinderGeometry(k, 1, 1, seg)));
  return g;
}

/** Canvas texture helper. */
export function canvasTex(w: number, h: number, draw: (c: CanvasRenderingContext2D) => void, srgb = true) {
  const cv = document.createElement('canvas');
  cv.width = w;
  cv.height = h;
  const c = cv.getContext('2d')!;
  draw(c);
  const t = new THREE.CanvasTexture(cv);
  if (srgb) t.colorSpace = THREE.SRGBColorSpace;
  t.anisotropy = 4;
  t.needsUpdate = true;
  return t;
}
