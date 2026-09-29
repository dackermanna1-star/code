import * as THREE from 'three';
import { makeDetailNoise } from '../render/textures';

export const C = {
  STEEL: 0x4c5158,
  DARK: 0x3b3e44,
  BLACK: 0x2b2d31,
  BLUED: 0x37404e,
  GUNMETAL: 0x42464d,
  WOOD: 0x7a4624,
  WOOD_L: 0x9b6233,
  WOOD_D: 0x55301a,
  BRASS: 0xd9a843,
  POLY: 0x35383c,
  OD: 0x4d5a33,
  TAN: 0xa99064,
  RED: 0xa3221c,
  CHROME: 0xb9bdc2,
  ORANGE: 0xe07a20,
  GLOW_R: 0xff4030,
  GLOW_B: 0x40c8ff,
  GLOW_G: 0x70ff60,
  GLASS: 0x3a6a8a,
  RUBBER: 0x2d2d2d,
  SKIN: 0xd6a078,
  SLEEVE: 0x6b7648,
  SLEEVE_D: 0x4c5433,
  GLOVE: 0x7a6549,
  GLOVE_L: 0x5a4a36,
};

let noiseTex: THREE.Texture | null = null;
const matCache = new Map<string, THREE.MeshLambertMaterial>();

export function mat(color: number, emissive = 0): THREE.MeshLambertMaterial {
  const key = color + ':' + emissive;
  let m = matCache.get(key);
  if (!m) {
    if (!noiseTex) noiseTex = makeDetailNoise(77, 16, 0.22);
    m = new THREE.MeshLambertMaterial({ color, map: noiseTex, emissive: emissive ? new THREE.Color(emissive) : new THREE.Color(0) });
    matCache.set(key, m);
  }
  return m;
}

/** Scales box UVs so the grit texture has ~1 texel per 6mm on every face. */
function worldUV(g: THREE.BufferGeometry, w: number, h: number, d: number) {
  const uv = g.getAttribute('uv') as THREE.BufferAttribute;
  const k = 1 / 0.1;
  // BoxGeometry face order: +x, -x, +y, -y, +z, -z (4 verts each)
  const dims: [number, number][] = [
    [d, h], [d, h], [w, d], [w, d], [w, h], [w, h],
  ];
  for (let f = 0; f < 6; f++) {
    for (let v = 0; v < 4; v++) {
      const i = f * 4 + v;
      uv.setXY(i, uv.getX(i) * dims[f][0] * k, uv.getY(i) * dims[f][1] * k);
    }
  }
}

export type V3 = [number, number, number];

export class ModelBuilder {
  readonly root = new THREE.Group();
  readonly parts: Record<string, THREE.Object3D> = {};
  readonly anchors: Record<string, THREE.Object3D> = {};

  constructor() {
    this.parts.root = this.root;
  }

  private parentOf(p?: string | THREE.Object3D) {
    if (!p) return this.root;
    if (typeof p === 'string') return this.parts[p] ?? this.root;
    return p;
  }

  part(name: string, pos: V3 = [0, 0, 0], parent?: string | THREE.Object3D) {
    const g = new THREE.Group();
    g.name = name;
    g.position.set(...pos);
    this.parentOf(parent).add(g);
    this.parts[name] = g;
    return g;
  }

  anchor(name: string, pos: V3, parent?: string | THREE.Object3D, rot?: V3) {
    const o = new THREE.Object3D();
    o.name = name;
    o.position.set(...pos);
    if (rot) o.rotation.set(...rot);
    this.parentOf(parent).add(o);
    this.anchors[name] = o;
    return o;
  }

  box(size: V3, pos: V3, color: number, parent?: string | THREE.Object3D, rot?: V3, emissive = 0) {
    const g = new THREE.BoxGeometry(...size);
    worldUV(g, ...size);
    const m = new THREE.Mesh(g, mat(color, emissive));
    m.position.set(...pos);
    if (rot) m.rotation.set(...rot);
    this.parentOf(parent).add(m);
    return m;
  }

  /** Cylinder along the given axis. */
  cyl(r: number, len: number, pos: V3, color: number, parent?: string | THREE.Object3D, axis: 'x' | 'y' | 'z' = 'z', seg = 8, emissive = 0) {
    const g = new THREE.CylinderGeometry(r, r, len, seg, 1);
    if (axis === 'z') g.rotateX(Math.PI / 2);
    else if (axis === 'x') g.rotateZ(Math.PI / 2);
    const m = new THREE.Mesh(g, mat(color, emissive));
    m.position.set(...pos);
    this.parentOf(parent).add(m);
    return m;
  }

  /** Tapered/angled box helper for grips/stocks. */
  wedge(size: V3, pos: V3, color: number, angleX: number, parent?: string | THREE.Object3D) {
    return this.box(size, pos, color, parent, [angleX, 0, 0]);
  }
}
