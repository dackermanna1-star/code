import * as THREE from 'three';
import { tileUV, T } from './PropAtlas';

type FaceKey = 'px' | 'nx' | 'py' | 'ny' | 'pz' | 'nz';
export interface FaceOpt {
  tile?: number;
  color?: THREE.ColorRepresentation;
  emissive?: boolean;
}
export interface BoxOpts {
  size: [number, number, number];
  pos?: [number, number, number];
  rot?: [number, number, number];
  tile?: number;
  color?: THREE.ColorRepresentation;
  faces?: Partial<Record<FaceKey, FaceOpt>>;
  /** meters per full tile; faces smaller than this use a sub-rect of the tile */
  uvScale?: number;
  /** stretch whole tile over every face */
  stretch?: boolean;
}
export interface CylOpts {
  radius: number;
  radiusTop?: number;
  height: number;
  segments?: number;
  pos?: [number, number, number];
  rot?: [number, number, number];
  tile?: number;
  color?: THREE.ColorRepresentation;
  capTile?: number;
  capColor?: THREE.ColorRepresentation;
  /** wrap tile horizontally this many times around */
  wrap?: number;
}

const FACES: { key: FaceKey; n: [number, number, number]; corners: number[][] }[] = [
  { key: 'px', n: [1, 0, 0], corners: [[1, 0, 1], [1, 0, 0], [1, 1, 0], [1, 1, 1]] },
  { key: 'nx', n: [-1, 0, 0], corners: [[0, 0, 0], [0, 0, 1], [0, 1, 1], [0, 1, 0]] },
  { key: 'py', n: [0, 1, 0], corners: [[0, 1, 1], [1, 1, 1], [1, 1, 0], [0, 1, 0]] },
  { key: 'ny', n: [0, -1, 0], corners: [[0, 0, 0], [1, 0, 0], [1, 0, 1], [0, 0, 1]] },
  { key: 'pz', n: [0, 0, 1], corners: [[0, 0, 1], [1, 0, 1], [1, 1, 1], [0, 1, 1]] },
  { key: 'nz', n: [0, 0, -1], corners: [[1, 0, 0], [0, 0, 0], [0, 1, 0], [1, 1, 0]] },
];
// uv corner order matches FACES corners: (0,0) (1,0) (1,1) (0,1)
const UVC = [
  [0, 0],
  [1, 0],
  [1, 1],
  [0, 1],
];
const FACE_SHADE: Record<FaceKey, number> = { px: 0.92, nx: 0.92, py: 1.0, ny: 0.7, pz: 0.96, nz: 0.96 };

const _m = new THREE.Matrix4();
const _q = new THREE.Quaternion();
const _e = new THREE.Euler();
const _v = new THREE.Vector3();
const _n = new THREE.Vector3();
const _s = new THREE.Vector3(1, 1, 1);
const _c = new THREE.Color();
const _p = new THREE.Vector3();
const D2R = Math.PI / 180;

/** Builds blocky prop geometry with atlas UVs and baked per-face shading. */
export class GeoBuilder {
  pos: number[] = [];
  nor: number[] = [];
  uv: number[] = [];
  col: number[] = [];
  idx: number[] = [];
  emissive: number[] = [];
  hasEmissive = false;

  private transform(o: { pos?: [number, number, number]; rot?: [number, number, number] }): THREE.Matrix4 {
    _e.set((o.rot?.[0] ?? 0) * D2R, (o.rot?.[1] ?? 0) * D2R, (o.rot?.[2] ?? 0) * D2R, 'YXZ');
    _q.setFromEuler(_e);
    _p.set(o.pos?.[0] ?? 0, o.pos?.[1] ?? 0, o.pos?.[2] ?? 0);
    return _m.compose(_p, _q, _s);
  }

  box(o: BoxOpts): this {
    const [w, h, d] = o.size;
    const m = this.transform(o).clone();
    const nm = new THREE.Matrix3().getNormalMatrix(m);
    const scale = o.uvScale ?? 0.5;
    for (const f of FACES) {
      const fo = o.faces?.[f.key];
      const tile = fo?.tile ?? o.tile ?? T.WHITE;
      _c.set(fo?.color ?? o.color ?? 0xffffff);
      const shade = FACE_SHADE[f.key];
      const cr = _c.r * shade,
        cg = _c.g * shade,
        cb = _c.b * shade;
      const em = fo?.emissive ? 1 : 0;
      if (em) this.hasEmissive = true;
      const uvr = tileUV(tile);
      // face dimensions for sub-rect UVs
      let fw: number, fh: number;
      if (f.key === 'px' || f.key === 'nx') {
        fw = d;
        fh = h;
      } else if (f.key === 'py' || f.key === 'ny') {
        fw = w;
        fh = d;
      } else {
        fw = w;
        fh = h;
      }
      const fu = o.stretch ? 1 : Math.min(1, fw / scale);
      const fv = o.stretch ? 1 : Math.min(1, fh / scale);
      const base = this.pos.length / 3;
      _n.set(f.n[0], f.n[1], f.n[2]).applyMatrix3(nm).normalize();
      for (let k = 0; k < 4; k++) {
        const cc = f.corners[k];
        _v.set((cc[0] - 0.5) * w, (cc[1] - 0.5) * h, (cc[2] - 0.5) * d).applyMatrix4(m);
        this.pos.push(_v.x, _v.y, _v.z);
        this.nor.push(_n.x, _n.y, _n.z);
        const u = uvr.u0 + (uvr.u1 - uvr.u0) * UVC[k][0] * fu;
        const v = uvr.v0 + (uvr.v1 - uvr.v0) * UVC[k][1] * fv;
        this.uv.push(u, v);
        this.col.push(cr, cg, cb);
        this.emissive.push(em);
      }
      this.idx.push(base, base + 1, base + 2, base, base + 2, base + 3);
    }
    return this;
  }

  cyl(o: CylOpts): this {
    const seg = o.segments ?? 8;
    const r0 = o.radius;
    const r1 = o.radiusTop ?? o.radius;
    const h = o.height;
    const m = this.transform(o).clone();
    const nm = new THREE.Matrix3().getNormalMatrix(m);
    const uvr = tileUV(o.tile ?? T.WHITE);
    _c.set(o.color ?? 0xffffff);
    const cr = _c.r,
      cg = _c.g,
      cb = _c.b;
    const wrap = o.wrap ?? 1;
    // sides (flat shaded per segment for the blocky look)
    for (let i = 0; i < seg; i++) {
      const a0 = (i / seg) * Math.PI * 2;
      const a1 = ((i + 1) / seg) * Math.PI * 2;
      const am = (a0 + a1) / 2;
      _n.set(Math.cos(am), (r0 - r1) / h, Math.sin(am)).applyMatrix3(nm).normalize();
      const shade = 0.82 + 0.18 * Math.max(0, Math.cos(am - 0.8));
      const base = this.pos.length / 3;
      const pts = [
        [Math.cos(a1) * r0, -h / 2, Math.sin(a1) * r0],
        [Math.cos(a0) * r0, -h / 2, Math.sin(a0) * r0],
        [Math.cos(a0) * r1, h / 2, Math.sin(a0) * r1],
        [Math.cos(a1) * r1, h / 2, Math.sin(a1) * r1],
      ];
      const ua = (((i + 1) / seg) * wrap) % 1 || (i + 1 === seg ? 1 : 0);
      const ub = ((i / seg) * wrap) % 1;
      const us = [ua < ub ? 1 : ua, ub, ub, ua < ub ? 1 : ua];
      for (let k = 0; k < 4; k++) {
        _v.set(pts[k][0], pts[k][1], pts[k][2]).applyMatrix4(m);
        this.pos.push(_v.x, _v.y, _v.z);
        this.nor.push(_n.x, _n.y, _n.z);
        this.uv.push(uvr.u0 + (uvr.u1 - uvr.u0) * us[k], k < 2 ? uvr.v0 : uvr.v1);
        this.col.push(cr * shade, cg * shade, cb * shade);
        this.emissive.push(0);
      }
      this.idx.push(base, base + 1, base + 2, base, base + 2, base + 3);
    }
    // caps
    const capUV = tileUV(o.capTile ?? o.tile ?? T.WHITE);
    _c.set(o.capColor ?? o.color ?? 0xffffff);
    for (const top of [true, false]) {
      const y = top ? h / 2 : -h / 2;
      const r = top ? r1 : r0;
      if (r <= 0.0001) continue;
      _n.set(0, top ? 1 : -1, 0).applyMatrix3(nm).normalize();
      const shade = top ? 1 : 0.7;
      const center = this.pos.length / 3;
      _v.set(0, y, 0).applyMatrix4(m);
      this.pos.push(_v.x, _v.y, _v.z);
      this.nor.push(_n.x, _n.y, _n.z);
      this.uv.push((capUV.u0 + capUV.u1) / 2, (capUV.v0 + capUV.v1) / 2);
      this.col.push(_c.r * shade, _c.g * shade, _c.b * shade);
      this.emissive.push(0);
      for (let i = 0; i <= seg; i++) {
        const a = (i / seg) * Math.PI * 2;
        _v.set(Math.cos(a) * r, y, Math.sin(a) * r).applyMatrix4(m);
        this.pos.push(_v.x, _v.y, _v.z);
        this.nor.push(_n.x, _n.y, _n.z);
        this.uv.push(capUV.u0 + (capUV.u1 - capUV.u0) * (0.5 + Math.cos(a) * 0.5), capUV.v0 + (capUV.v1 - capUV.v0) * (0.5 + Math.sin(a) * 0.5));
        this.col.push(_c.r * shade, _c.g * shade, _c.b * shade);
        this.emissive.push(0);
      }
      for (let i = 0; i < seg; i++) {
        if (top) this.idx.push(center, center + 2 + i, center + 1 + i);
        else this.idx.push(center, center + 1 + i, center + 2 + i);
      }
    }
    return this;
  }

  /** Low-poly flat-shaded sphere. */
  sphere(o: { radius: number; pos?: [number, number, number]; tile?: number; color?: THREE.ColorRepresentation; lat?: number; lon?: number; bandColor?: THREE.ColorRepresentation }): this {
    const lat = o.lat ?? 5;
    const lon = o.lon ?? 8;
    const m = this.transform(o).clone();
    const uvr = tileUV(o.tile ?? T.WHITE);
    const col = new THREE.Color(o.color ?? 0xffffff);
    const band = o.bandColor ? new THREE.Color(o.bandColor) : null;
    const r = o.radius;
    const pt = (i: number, j: number, out: THREE.Vector3) => {
      const th = (i / lat) * Math.PI;
      const ph = (j / lon) * Math.PI * 2;
      return out.set(Math.sin(th) * Math.cos(ph) * r, Math.cos(th) * r, Math.sin(th) * Math.sin(ph) * r);
    };
    const a = new THREE.Vector3(),
      b = new THREE.Vector3(),
      c = new THREE.Vector3(),
      d = new THREE.Vector3();
    for (let i = 0; i < lat; i++)
      for (let j = 0; j < lon; j++) {
        pt(i, j, a);
        pt(i + 1, j, b);
        pt(i + 1, j + 1, c);
        pt(i, j + 1, d);
        _n.copy(a).add(b).add(c).add(d).normalize();
        const shade = 0.78 + 0.22 * Math.max(0, _n.y * 0.5 + 0.5);
        const cc = band && i > 0 && i < lat - 1 && (i === Math.floor(lat / 2) || i === Math.floor(lat / 2) - 1) ? band : col;
        const base = this.pos.length / 3;
        for (const p of [a, b, c, d]) {
          _v.copy(p).applyMatrix4(m);
          this.pos.push(_v.x, _v.y, _v.z);
          this.nor.push(_n.x, _n.y, _n.z);
          this.uv.push((uvr.u0 + uvr.u1) / 2, (uvr.v0 + uvr.v1) / 2);
          this.col.push(cc.r * shade, cc.g * shade, cc.b * shade);
          this.emissive.push(0);
        }
        this.idx.push(base, base + 2, base + 1, base, base + 3, base + 2);
      }
    return this;
  }

  get vertexCount(): number {
    return this.pos.length / 3;
  }

  build(): THREE.BufferGeometry {
    const g = new THREE.BufferGeometry();
    g.setAttribute('position', new THREE.Float32BufferAttribute(this.pos, 3));
    g.setAttribute('normal', new THREE.Float32BufferAttribute(this.nor, 3));
    g.setAttribute('uv', new THREE.Float32BufferAttribute(this.uv, 2));
    g.setAttribute('color', new THREE.Float32BufferAttribute(this.col, 3));
    g.setAttribute('aGlow', new THREE.Float32BufferAttribute(this.emissive, 1));
    g.setIndex(this.idx);
    g.computeBoundingBox();
    g.computeBoundingSphere();
    return g;
  }
}
