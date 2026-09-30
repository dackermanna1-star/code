import * as THREE from 'three';
import { mergeGeometries } from 'three/examples/jsm/utils/BufferGeometryUtils.js';
import { makeDetailNoise } from '../render/textures';
import { mulberry32 } from '../core/math';

export const C = {
  STEEL: 0x4c5158,
  DARK: 0x3b3e44,
  BLACK: 0x2b2d31,
  BLUED: 0x37404e,
  GUNMETAL: 0x42464d,
  WOOD: 0x4f3829,
  WOOD_L: 0x6a4d33,
  WOOD_D: 0x36261b,
  BRASS: 0xc99a3e,
  POLY: 0x35383c,
  OD: 0x4d5a33,
  TAN: 0xa99064,
  RED: 0xa3221c,
  CHROME: 0xb9bdc2,
  ORANGE: 0xe07a20,
  GLOW_R: 0xff4030,
  GLOW_B: 0x40c8ff,
  GLOW_G: 0x70ff60,
  GLASS: 0x2c4c62,
  RUBBER: 0x2d2d2d,
  /** Tritium / paint dots on sights. */
  DOT: 0xd8f0c8,
  BORE: 0x0c0c0e,
  SKIN: 0xc58f6a,
  SLEEVE: 0x484a40,
  SLEEVE_D: 0x35372f,
  GLOVE: 0x6a5e4c,
  GLOVE_L: 0x4a4239,
  GLOVE_D: 0x262626,
  PALM: 0x3a3530,
};

/**
 * Surface finish of a weapon part: drives specular response and the detail
 * texture (brushed metal, polymer stipple, wood grain, fabric weave...).
 */
export type Finish = 'metal' | 'polish' | 'poly' | 'wood' | 'rubber' | 'fabric' | 'leather' | 'skin' | 'glass' | 'glow';

const FINISH: Record<Finish, { spec: number; shin: number }> = {
  metal: { spec: 0x4a4e54, shin: 34 },
  polish: { spec: 0x9a9ea4, shin: 70 },
  poly: { spec: 0x1e1e1e, shin: 16 },
  wood: { spec: 0x2c241a, shin: 22 },
  rubber: { spec: 0x0c0c0c, shin: 6 },
  fabric: { spec: 0x000000, shin: 1 },
  leather: { spec: 0x18140f, shin: 10 },
  skin: { spec: 0x1c1410, shin: 10 },
  glass: { spec: 0xffffff, shin: 90 },
  glow: { spec: 0x000000, shin: 1 },
};

const KNOWN: Record<number, Finish> = {
  [C.STEEL]: 'metal',
  [C.DARK]: 'metal',
  [C.BLACK]: 'metal',
  [C.BLUED]: 'metal',
  [C.GUNMETAL]: 'metal',
  [C.WOOD]: 'wood',
  [C.WOOD_L]: 'wood',
  [C.WOOD_D]: 'wood',
  [C.BRASS]: 'polish',
  [C.CHROME]: 'polish',
  [C.POLY]: 'poly',
  [C.OD]: 'poly',
  [C.TAN]: 'poly',
  [C.RED]: 'poly',
  [C.RUBBER]: 'rubber',
  [C.GLASS]: 'glass',
  [C.BORE]: 'rubber',
  [C.DOT]: 'poly',
  [C.SKIN]: 'skin',
  [C.SLEEVE]: 'fabric',
  [C.SLEEVE_D]: 'fabric',
  [C.GLOVE]: 'leather',
  [C.GLOVE_L]: 'leather',
  [C.GLOVE_D]: 'rubber',
  [C.PALM]: 'leather',
};

const _hsl = { h: 0, s: 0, l: 0 };
function guessFinish(color: number, emissive: number): Finish {
  if (emissive) return 'glow';
  const k = KNOWN[color];
  if (k) return k;
  new THREE.Color(color).getHSL(_hsl);
  if (_hsl.s < 0.12) return _hsl.l > 0.72 ? 'poly' : 'metal';
  if (_hsl.h > 0.02 && _hsl.h < 0.12 && _hsl.s > 0.4 && _hsl.l < 0.45) return 'wood';
  return 'poly';
}

// ------------------------------------------------------------ detail textures
const TEX = 64;
function dataTex(fn: (x: number, y: number, rnd: () => number) => number, seed: number) {
  const rnd = mulberry32(seed);
  const d = new Uint8Array(TEX * TEX * 4);
  for (let y = 0; y < TEX; y++)
    for (let x = 0; x < TEX; x++) {
      const v = Math.max(0, Math.min(255, Math.round(fn(x, y, rnd) * 255)));
      const i = (y * TEX + x) * 4;
      d[i] = d[i + 1] = d[i + 2] = v;
      d[i + 3] = 255;
    }
  const t = new THREE.DataTexture(d, TEX, TEX, THREE.RGBAFormat);
  t.wrapS = t.wrapT = THREE.RepeatWrapping;
  t.magFilter = THREE.NearestFilter;
  t.minFilter = THREE.NearestMipmapLinearFilter;
  t.generateMipmaps = true;
  t.anisotropy = 4;
  t.needsUpdate = true;
  return t;
}
// tileable value noise (period TEX / cell)
function tnoise(x: number, y: number, cell: number, salt: number) {
  const P = TEX / cell;
  const fx = x / cell;
  const fy = y / cell;
  const x0 = Math.floor(fx);
  const y0 = Math.floor(fy);
  const tx = fx - x0;
  const ty = fy - y0;
  const h = (a: number, b: number) => {
    const n = Math.sin(((a % P) + P) % P * 127.1 + (((b % P) + P) % P) * 311.7 + salt * 74.7) * 43758.5453;
    return n - Math.floor(n);
  };
  const sx = tx * tx * (3 - 2 * tx);
  const sy = ty * ty * (3 - 2 * ty);
  const a = h(x0, y0) + (h(x0 + 1, y0) - h(x0, y0)) * sx;
  const b = h(x0, y0 + 1) + (h(x0 + 1, y0 + 1) - h(x0, y0 + 1)) * sx;
  return a + (b - a) * sy;
}
const texCache = new Map<Finish, THREE.Texture>();
function finishTex(f: Finish): THREE.Texture {
  let t = texCache.get(f);
  if (t) return t;
  switch (f) {
    case 'metal': // fine grit plus faint machining streaks along the part (u)
      t = dataTex((x, y, r) => 0.9 + r() * 0.07 + (tnoise(x, y, 16, 1) - 0.5) * 0.04 + (tnoise(0, y, 2, 2) - 0.5) * 0.05, 3);
      break;
    case 'polish':
      t = dataTex((x, y, r) => 0.95 + r() * 0.04 + (tnoise(0, y, 4, 3) - 0.5) * 0.04, 4);
      break;
    case 'poly': // molded stipple
      t = dataTex((x, y, r) => {
        const s = r();
        return (s < 0.14 ? 0.84 : s > 0.93 ? 1 : 0.94) + (tnoise(x, y, 16, 5) - 0.5) * 0.05;
      }, 5);
      break;
    case 'rubber':
      t = dataTex((x, y, r) => (r() < 0.3 ? 0.8 : 0.95) + (tnoise(x, y, 8, 6) - 0.5) * 0.06, 6);
      break;
    case 'wood': // grain runs along u (the length of the part)
      t = dataTex((x, y, r) => {
        const warp = tnoise(x, y, 16, 7) * 5 + tnoise(x, y, 32, 8) * 3;
        const band = Math.sin((y / TEX) * Math.PI * 2 * 7 + warp) * 0.5 + 0.5;
        const ring = Math.pow(band, 3);
        return 0.7 + (1 - ring) * 0.26 + (r() - 0.5) * 0.05 - (r() < 0.004 ? 0.25 : 0);
      }, 7);
      break;
    case 'fabric': // twill weave with mottling
      t = dataTex((x, y, r) => {
        const tw = (x + y) % 4 < 2 ? 1 : 0.9;
        return tw * (0.86 + tnoise(x, y, 16, 9) * 0.12) + (r() - 0.5) * 0.05;
      }, 9);
      break;
    case 'leather':
      t = dataTex((x, y, r) => 0.84 + tnoise(x, y, 4, 10) * 0.12 + (r() - 0.5) * 0.06, 10);
      break;
    case 'skin':
      t = dataTex((x, y, r) => 0.93 + tnoise(x, y, 8, 11) * 0.06 + (r() - 0.5) * 0.02, 11);
      break;
    default:
      t = dataTex(() => 1, 12);
  }
  texCache.set(f, t);
  return t;
}

let noiseTex: THREE.Texture | null = null;
const matCache = new Map<string, THREE.MeshLambertMaterial>();

/** Matte voxel material (world props, defenses). */
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

const gunCache = new Map<string, THREE.MeshPhongMaterial>();
/** Weapon / viewmodel material with a finish-specific sheen and detail texture. */
export function gunMat(color: number, emissive = 0, finish?: Finish): THREE.MeshPhongMaterial {
  const f = finish ?? guessFinish(color, emissive);
  const key = color + ':' + emissive + ':' + f;
  let m = gunCache.get(key);
  if (!m) {
    const F = FINISH[f];
    m = new THREE.MeshPhongMaterial({
      color,
      map: f === 'glow' || f === 'glass' ? null : finishTex(f),
      specular: F.spec,
      shininess: F.shin,
      emissive: emissive ? new THREE.Color(emissive) : new THREE.Color(0),
    });
    if (f === 'glass') m.emissive.setHex(color).multiplyScalar(0.12);
    gunCache.set(key, m);
  }
  return m;
}

// ------------------------------------------------------------ geometry
const UVK = 10; // 1 uv unit per 10 cm

/** Planar UVs by dominant normal axis; the part's length (z) always maps to u. */
function projectUV(pos: number[], nor: number[], uv: number[]) {
  for (let i = 0; i < pos.length / 3; i++) {
    const nx = Math.abs(nor[i * 3]);
    const ny = Math.abs(nor[i * 3 + 1]);
    const nz = Math.abs(nor[i * 3 + 2]);
    const x = pos[i * 3];
    const y = pos[i * 3 + 1];
    const z = pos[i * 3 + 2];
    if (nx >= ny && nx >= nz) uv.push(z * UVK, y * UVK);
    else if (ny >= nz) uv.push(z * UVK, x * UVK);
    else uv.push(x * UVK, y * UVK);
  }
}

function polysToGeo(polys: number[][][]) {
  const pos: number[] = [];
  const nor: number[] = [];
  const a = new THREE.Vector3();
  const b = new THREE.Vector3();
  const c = new THREE.Vector3();
  const n = new THREE.Vector3();
  const ctr = new THREE.Vector3();
  for (const p of polys) {
    ctr.set(0, 0, 0);
    for (const q of p) ctr.add(n.fromArray(q));
    ctr.multiplyScalar(1 / p.length);
    a.fromArray(p[0]);
    b.fromArray(p[1]).sub(a);
    c.fromArray(p[2]).sub(a);
    n.crossVectors(b, c).normalize();
    const pts = n.dot(ctr) < 0 ? [...p].reverse() : p;
    if (n.dot(ctr) < 0) n.negate();
    for (let i = 1; i < pts.length - 1; i++) {
      for (const q of [pts[0], pts[i], pts[i + 1]]) {
        pos.push(q[0], q[1], q[2]);
        nor.push(n.x, n.y, n.z);
      }
    }
  }
  const uv: number[] = [];
  projectUV(pos, nor, uv);
  const g = new THREE.BufferGeometry();
  g.setAttribute('position', new THREE.Float32BufferAttribute(pos, 3));
  g.setAttribute('normal', new THREE.Float32BufferAttribute(nor, 3));
  g.setAttribute('uv', new THREE.Float32BufferAttribute(uv, 2));
  return g;
}

const geoCache = new Map<string, THREE.BufferGeometry>();
/**
 * Box with 45 degree chamfers on every edge. The thin bevels catch light
 * and read as machined/molded edges, which a plain box never does.
 */
export function chamferBox(w: number, h: number, d: number, e?: number): THREE.BufferGeometry {
  const minD = Math.min(w, h, d);
  const ch = e ?? Math.min(0.0032, minD * 0.2);
  const key = `${w.toFixed(4)},${h.toFixed(4)},${d.toFixed(4)},${ch.toFixed(5)}`;
  let g = geoCache.get(key);
  if (g) return g;
  const a = w / 2;
  const b = h / 2;
  const c = d / 2;
  const polys: number[][][] = [];
  if (ch < 0.0006) {
    for (const s of [-1, 1]) {
      polys.push([[s * a, -b, -c], [s * a, b, -c], [s * a, b, c], [s * a, -b, c]]);
      polys.push([[-a, s * b, -c], [a, s * b, -c], [a, s * b, c], [-a, s * b, c]]);
      polys.push([[-a, -b, s * c], [a, -b, s * c], [a, b, s * c], [-a, b, s * c]]);
    }
  } else {
    const A = a - ch;
    const B = b - ch;
    const Cc = c - ch;
    for (const s of [-1, 1]) {
      polys.push([[s * a, -B, -Cc], [s * a, B, -Cc], [s * a, B, Cc], [s * a, -B, Cc]]);
      polys.push([[-A, s * b, -Cc], [A, s * b, -Cc], [A, s * b, Cc], [-A, s * b, Cc]]);
      polys.push([[-A, -B, s * c], [A, -B, s * c], [A, B, s * c], [-A, B, s * c]]);
    }
    for (const sx of [-1, 1])
      for (const sy of [-1, 1]) {
        polys.push([[sx * a, sy * B, -Cc], [sx * a, sy * B, Cc], [sx * A, sy * b, Cc], [sx * A, sy * b, -Cc]]);
        polys.push([[sx * a, -B, sy * Cc], [sx * a, B, sy * Cc], [sx * A, B, sy * c], [sx * A, -B, sy * c]]);
        polys.push([[-A, sx * b, sy * Cc], [A, sx * b, sy * Cc], [A, sx * B, sy * c], [-A, sx * B, sy * c]]);
        for (const sz of [-1, 1]) polys.push([[sx * a, sy * B, sz * Cc], [sx * A, sy * b, sz * Cc], [sx * A, sy * B, sz * c]]);
      }
  }
  g = polysToGeo(polys);
  geoCache.set(key, g);
  return g;
}

/**
 * Cylinder along Y with chamfered rims and smooth sides.
 * `r2` tapers the top (+Y) end.
 */
export function chamferCyl(r: number, len: number, seg: number, e?: number, r2 = r): THREE.BufferGeometry {
  const ch = e ?? Math.min(0.0025, Math.min(r, r2) * 0.25, len * 0.2);
  const key = `c${r.toFixed(4)},${r2.toFixed(4)},${len.toFixed(4)},${seg},${ch.toFixed(5)}`;
  let g = geoCache.get(key);
  if (g) return g;
  const h = len / 2;
  const slope = (r - r2) / len;
  const sn = Math.hypot(1, slope);
  // profile: [r0, y0, r1, y1, normal radial, normal y, smooth]
  const prof: [number, number, number, number, number, number][] =
    ch > 0.0004
      ? [
          [0, h, r2 - ch, h, 0, 1],
          [r2 - ch, h, r2, h - ch, 0.7071, 0.7071],
          [r2, h - ch, r, -h + ch, 1 / sn, slope / sn],
          [r, -h + ch, r - ch, -h, 0.7071, -0.7071],
          [r - ch, -h, 0, -h, 0, -1],
        ]
      : [
          [0, h, r2, h, 0, 1],
          [r2, h, r, -h, 1 / sn, slope / sn],
          [r, -h, 0, -h, 0, -1],
        ];
  const pos: number[] = [];
  const nor: number[] = [];
  const uv: number[] = [];
  const P = (rr: number, y: number, ang: number) => [Math.cos(ang) * rr, y, Math.sin(ang) * rr];
  for (const [r0, y0, r1, y1, nr, ny] of prof) {
    const cap = nr === 0;
    for (let i = 0; i < seg; i++) {
      const a0 = (i / seg) * Math.PI * 2;
      const a1 = ((i + 1) / seg) * Math.PI * 2;
      const q = [P(r0, y0, a0), P(r1, y1, a0), P(r1, y1, a1), P(r0, y0, a1)];
      const ang = [a0, a0, a1, a1];
      const tris = [
        [0, 1, 2],
        [0, 2, 3],
      ];
      for (const t of tris) {
        // skip degenerate triangles at the cap centers
        const A = q[t[0]];
        const B = q[t[1]];
        const Cq = q[t[2]];
        const ux = B[0] - A[0], uy = B[1] - A[1], uz = B[2] - A[2];
        const vx = Cq[0] - A[0], vy = Cq[1] - A[1], vz = Cq[2] - A[2];
        const cx = uy * vz - uz * vy, cy = uz * vx - ux * vz, cz = ux * vy - uy * vx;
        const cl = Math.hypot(cx, cy, cz);
        if (cl < 1e-12) continue;
        // outward = along the profile normal at the middle angle
        const am = (a0 + a1) / 2;
        const ox = nr * Math.cos(am), oy = ny, oz = nr * Math.sin(am);
        const order = cx * ox + cy * oy + cz * oz >= 0 ? t : [t[0], t[2], t[1]];
        for (const k of order) {
          const v = q[k];
          pos.push(v[0], v[1], v[2]);
          const an = ang[k];
          if (cap) nor.push(0, ny, 0);
          else nor.push(nr * Math.cos(an), ny, nr * Math.sin(an));
          if (cap) uv.push(v[0] * UVK, v[2] * UVK);
          else uv.push(v[1] * UVK, an * Math.max(r, r2) * UVK);
        }
      }
    }
  }
  g = new THREE.BufferGeometry();
  g.setAttribute('position', new THREE.Float32BufferAttribute(pos, 3));
  g.setAttribute('normal', new THREE.Float32BufferAttribute(nor, 3));
  g.setAttribute('uv', new THREE.Float32BufferAttribute(uv, 2));
  geoCache.set(key, g);
  return g;
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

/**
 * Builds hierarchical box/cylinder models. 'voxel' style = plain boxes with a
 * matte material (world props); 'gun' style = chamfered geometry with
 * finish-aware materials, merged per part after building.
 */
export class ModelBuilder {
  readonly root = new THREE.Group();
  readonly parts: Record<string, THREE.Object3D> = {};
  readonly anchors: Record<string, THREE.Object3D> = {};

  constructor(readonly style: 'voxel' | 'gun' = 'voxel') {
    this.parts.root = this.root;
  }

  private parentOf(p?: string | THREE.Object3D) {
    if (!p) return this.root;
    if (typeof p === 'string') return this.parts[p] ?? this.root;
    return p;
  }

  private material(color: number, emissive: number, finish?: Finish) {
    return this.style === 'gun' ? gunMat(color, emissive, finish) : mat(color, emissive);
  }

  part(name: string, pos: V3 = [0, 0, 0], parent?: string | THREE.Object3D) {
    const g = new THREE.Group();
    g.name = name;
    g.position.set(...pos);
    this.parentOf(parent).add(g);
    this.parts[name] = g;
    return g;
  }

  /** Static sub-frame for building rotated assemblies; flattened into its parent by finalize(). */
  frame(pos: V3 = [0, 0, 0], rot: V3 = [0, 0, 0], parent?: string | THREE.Object3D) {
    const g = new THREE.Group();
    g.userData.frame = true;
    g.position.set(...pos);
    g.rotation.set(...rot);
    this.parentOf(parent).add(g);
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

  box(size: V3, pos: V3, color: number, parent?: string | THREE.Object3D, rot?: V3, emissive = 0, finish?: Finish) {
    let g: THREE.BufferGeometry;
    if (this.style === 'gun') g = chamferBox(...size);
    else {
      g = new THREE.BoxGeometry(...size);
      worldUV(g, ...size);
    }
    const m = new THREE.Mesh(g, this.material(color, emissive, finish));
    m.position.set(...pos);
    if (rot) m.rotation.set(...rot);
    this.parentOf(parent).add(m);
    return m;
  }

  /** Box with an explicit finish (gun style). */
  fbox(size: V3, pos: V3, color: number, finish: Finish, parent?: string | THREE.Object3D, rot?: V3) {
    return this.box(size, pos, color, parent, rot, 0, finish);
  }

  /** Cylinder along the given axis. */
  cyl(r: number, len: number, pos: V3, color: number, parent?: string | THREE.Object3D, axis: 'x' | 'y' | 'z' = 'z', seg = 8, emissive = 0, finish?: Finish, r2 = r) {
    let g: THREE.BufferGeometry;
    if (this.style === 'gun') {
      g = chamferCyl(r, len, Math.max(seg, 10), undefined, r2).clone();
    } else g = new THREE.CylinderGeometry(r2, r, len, seg, 1);
    if (axis === 'z') g.rotateX(-Math.PI / 2);
    else if (axis === 'x') g.rotateZ(-Math.PI / 2);
    const m = new THREE.Mesh(g, this.material(color, emissive, finish));
    m.position.set(...pos);
    this.parentOf(parent).add(m);
    return m;
  }

  /** Tapered/angled box helper for grips/stocks. */
  wedge(size: V3, pos: V3, color: number, angleX: number, parent?: string | THREE.Object3D) {
    return this.box(size, pos, color, parent, [angleX, 0, 0]);
  }

  /**
   * Merge the static meshes under each group by material (one draw call per
   * material per animated part). Groups named in `keep` are left alone.
   */
  finalize(keep: string[] = []) {
    mergeByMaterial(this.root, keep);
  }
}

/**
 * Flattens build frames and merges sibling meshes that share a material.
 * Meshes flagged `userData.keep` and groups named in `keep` stay separate.
 */
export function mergeByMaterial(root: THREE.Object3D, keep: string[] = []) {
  const skip = new Set(keep);
  const flatten = (node: THREE.Object3D) => {
    for (const ch of [...node.children]) {
      if (!ch.userData.frame) continue;
      flatten(ch);
      ch.updateMatrix();
      for (const g of [...ch.children]) {
        g.applyMatrix4(ch.matrix);
        node.add(g);
      }
      node.remove(ch);
    }
  };
  const walk = (node: THREE.Object3D) => {
    flatten(node);
    for (const ch of [...node.children]) if (!(ch as THREE.Mesh).isMesh) walk(ch);
    if (skip.has(node.name)) return;
    const groups = new Map<THREE.Material, THREE.Mesh[]>();
    for (const ch of node.children) {
      const m = ch as THREE.Mesh;
      if (!m.isMesh || m.userData.keep) continue;
      const mm = m.material as THREE.Material;
      let l = groups.get(mm);
      if (!l) groups.set(mm, (l = []));
      l.push(m);
    }
    for (const [mm, list] of groups) {
      if (list.length < 2) continue;
      const geos = list.map((m) => {
        m.updateMatrix();
        const g = m.geometry.index ? m.geometry.toNonIndexed() : m.geometry.clone();
        for (const k of Object.keys(g.attributes)) if (k !== 'position' && k !== 'normal' && k !== 'uv') g.deleteAttribute(k);
        g.applyMatrix4(m.matrix);
        return g;
      });
      const merged = mergeGeometries(geos, false);
      for (const g of geos) g.dispose();
      if (!merged) continue;
      const mesh = new THREE.Mesh(merged, mm);
      mesh.visible = list.every((m) => m.visible);
      node.add(mesh);
      for (const m of list) node.remove(m);
    }
  };
  walk(root);
}
