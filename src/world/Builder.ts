import * as THREE from 'three';
import { RoundedBoxGeometry } from 'three/examples/jsm/geometries/RoundedBoxGeometry.js';
import { mergeGeometries } from 'three/examples/jsm/utils/BufferGeometryUtils.js';

export interface PlaceOpts {
  rx?: number;
  ry?: number;
  rz?: number;
  sx?: number;
  sy?: number;
  sz?: number;
  cast?: boolean;
  receive?: boolean;
  name?: string;
  parent?: THREE.Object3D;
  /** exclude from static merging (animated / interactive) */
  dynamic?: boolean;
}

const geoCache = new Map<string, THREE.BufferGeometry>();
function cached(key: string, make: () => THREE.BufferGeometry): THREE.BufferGeometry {
  let g = geoCache.get(key);
  if (!g) {
    g = make();
    geoCache.set(key, g);
  }
  return g;
}

export const Geo = {
  box: (w: number, h: number, d: number) => cached(`box${w},${h},${d}`, () => new THREE.BoxGeometry(w, h, d)),
  rbox: (w: number, h: number, d: number, r: number, seg = 3) =>
    cached(`rbox${w},${h},${d},${r},${seg}`, () => new RoundedBoxGeometry(w, h, d, seg, Math.min(r, w / 2, h / 2, d / 2) * 0.999)),
  cyl: (rt: number, rb: number, h: number, seg = 24, open = false) =>
    cached(`cyl${rt},${rb},${h},${seg},${open}`, () => new THREE.CylinderGeometry(rt, rb, h, seg, 1, open)),
  sphere: (r: number, ws = 24, hs = 16) => cached(`sph${r},${ws},${hs}`, () => new THREE.SphereGeometry(r, ws, hs)),
  torus: (r: number, t: number, rs = 12, ts = 32, arc = Math.PI * 2) =>
    cached(`tor${r},${t},${rs},${ts},${arc}`, () => new THREE.TorusGeometry(r, t, rs, ts, arc)),
  plane: (w: number, h: number) => cached(`pl${w},${h}`, () => new THREE.PlaneGeometry(w, h)),
  capsule: (r: number, l: number, cs = 6, rs = 14) =>
    cached(`cap${r},${l},${cs},${rs}`, () => new THREE.CapsuleGeometry(r, l, cs, rs)),
  cone: (r: number, h: number, seg = 24, open = false) => cached(`cone${r},${h},${seg},${open}`, () => new THREE.ConeGeometry(r, h, seg, 1, open)),
  lathe: (key: string, pts: [number, number][], seg = 32) =>
    cached(`lathe${key}`, () => new THREE.LatheGeometry(pts.map(([x, y]) => new THREE.Vector2(x, y)), seg)),
  /** Plane whose UVs are scaled to world units (meters / texture period). */
  uvPlane: (w: number, h: number, px: number, py = px) =>
    cached(`uvpl${w},${h},${px},${py}`, () => {
      const g = new THREE.PlaneGeometry(w, h);
      const uv = g.attributes.uv as THREE.BufferAttribute;
      for (let i = 0; i < uv.count; i++) uv.setXY(i, (uv.getX(i) * w) / px, (uv.getY(i) * h) / py);
      return g;
    }),
  /** Box whose per-face UVs are scaled to world units. */
  uvBox: (w: number, h: number, d: number, px: number, py = px) =>
    cached(`uvbox${w},${h},${d},${px},${py}`, () => {
      const g = new THREE.BoxGeometry(w, h, d);
      const uv = g.attributes.uv as THREE.BufferAttribute;
      const dims: [number, number][] = [
        [d, h], [d, h], // px, nx
        [w, d], [w, d], // py, ny
        [w, h], [w, h], // pz, nz
      ];
      for (let f = 0; f < 6; f++) {
        const [fw, fh] = dims[f];
        for (let k = 0; k < 4; k++) {
          const i = f * 4 + k;
          uv.setXY(i, (uv.getX(i) * fw) / px, (uv.getY(i) * fh) / py);
        }
      }
      return g;
    }),
};

/** Convenience object placement helpers bound to a parent. */
export class Builder {
  constructor(public root: THREE.Object3D) {}

  mesh(geo: THREE.BufferGeometry, mat: THREE.Material, x = 0, y = 0, z = 0, o: PlaceOpts = {}): THREE.Mesh {
    const m = new THREE.Mesh(geo, mat);
    m.position.set(x, y, z);
    if (o.rx || o.ry || o.rz) m.rotation.set(o.rx ?? 0, o.ry ?? 0, o.rz ?? 0);
    if (o.sx !== undefined || o.sy !== undefined || o.sz !== undefined) m.scale.set(o.sx ?? 1, o.sy ?? 1, o.sz ?? 1);
    m.castShadow = o.cast ?? true;
    m.receiveShadow = o.receive ?? true;
    if (o.name) m.name = o.name;
    if (!o.dynamic) m.userData.static = true;
    (o.parent ?? this.root).add(m);
    return m;
  }

  box(w: number, h: number, d: number, mat: THREE.Material, x: number, y: number, z: number, o: PlaceOpts = {}) {
    return this.mesh(Geo.box(w, h, d), mat, x, y, z, o);
  }
  rbox(w: number, h: number, d: number, r: number, mat: THREE.Material, x: number, y: number, z: number, o: PlaceOpts = {}) {
    return this.mesh(Geo.rbox(w, h, d, r), mat, x, y, z, o);
  }
  /** Box with world-scaled UVs (texture period `p` meters). */
  tbox(w: number, h: number, d: number, p: number | [number, number], mat: THREE.Material, x: number, y: number, z: number, o: PlaceOpts = {}) {
    const [px, py] = typeof p === 'number' ? [p, p] : p;
    return this.mesh(Geo.uvBox(w, h, d, px, py), mat, x, y, z, o);
  }
  /** Plane with world-scaled UVs. */
  tplane(w: number, h: number, p: number | [number, number], mat: THREE.Material, x: number, y: number, z: number, o: PlaceOpts = {}) {
    const [px, py] = typeof p === 'number' ? [p, p] : p;
    return this.mesh(Geo.uvPlane(w, h, px, py), mat, x, y, z, { cast: false, ...o });
  }
  cyl(rt: number, rb: number, h: number, mat: THREE.Material, x: number, y: number, z: number, o: PlaceOpts & { seg?: number } = {}) {
    return this.mesh(Geo.cyl(rt, rb, h, o.seg ?? 24), mat, x, y, z, o);
  }
  sphere(r: number, mat: THREE.Material, x: number, y: number, z: number, o: PlaceOpts = {}) {
    return this.mesh(Geo.sphere(r), mat, x, y, z, o);
  }
  group(x = 0, y = 0, z = 0, ry = 0, parent?: THREE.Object3D): THREE.Group {
    const g = new THREE.Group();
    g.position.set(x, y, z);
    g.rotation.y = ry;
    (parent ?? this.root).add(g);
    return g;
  }
  at(g: THREE.Object3D): Builder {
    return new Builder(g);
  }
}

/**
 * Merge all static meshes below `root` into one mesh per (material, shadow
 * flags) bucket. Dramatically reduces draw calls for the environment.
 */
/**
 * Untextured, opaque, non-emissive standard materials differ only by colour:
 * such meshes are re-coloured through a vertex colour attribute and share one
 * material per roughness/metalness, which collapses dozens of draw calls.
 */
function plainColour(mat: THREE.Material): mat is THREE.MeshStandardMaterial {
  const m = mat as THREE.MeshStandardMaterial;
  return (
    m.type === 'MeshStandardMaterial' &&
    !m.map && !m.normalMap && !m.roughnessMap && !m.metalnessMap && !m.aoMap && !m.emissiveMap && !m.alphaMap && !m.bumpMap &&
    !m.transparent && m.opacity === 1 && !m.vertexColors && !m.flatShading && !m.wireframe && !m.alphaTest &&
    !m.polygonOffset && m.depthWrite && m.depthTest && m.colorWrite && !m.clippingPlanes?.length &&
    m.emissive.getHex() === 0 && !m.userData.noBatch
  );
}
const vcMats = new Map<string, THREE.MeshStandardMaterial>();

export function mergeStatic(root: THREE.Object3D): THREE.Group {
  root.updateMatrixWorld(true);
  const buckets = new Map<string, { mat: THREE.Material; cast: boolean; receive: boolean; geos: THREE.BufferGeometry[] }>();
  const remove: THREE.Mesh[] = [];
  const centre = new THREE.Vector3();
  root.traverse((o) => {
    const m = o as THREE.Mesh;
    if (!m.isMesh || !m.userData.static || Array.isArray(m.material)) return;
    // do not merge meshes that have dynamic ancestors
    let p: THREE.Object3D | null = m.parent;
    while (p && p !== root) {
      if (p.userData.dynamic) return;
      p = p.parent;
    }
    let mat = m.material as THREE.Material;
    let g = m.geometry;
    const vc = plainColour(mat);
    const attrs = Object.keys(g.attributes).sort().join(',');
    let key: string;
    if (vc) {
      const sm = mat as THREE.MeshStandardMaterial;
      // three coarse zones (kitchen / dining / outside) keep frustum culling
      // useful without fragmenting the batches
      if (!g.boundingSphere) g.computeBoundingSphere();
      centre.copy(g.boundingSphere!.center).applyMatrix4(m.matrixWorld);
      const cell = centre.z < -1.5 ? 'k' : centre.z < 6.2 ? 'd' : 'x';
      const mk = `${sm.roughness}|${sm.metalness}|${sm.envMapIntensity}|${sm.side}`;
      let shared = vcMats.get(mk);
      if (!shared) {
        shared = new THREE.MeshStandardMaterial({ vertexColors: true, roughness: sm.roughness, metalness: sm.metalness, envMapIntensity: sm.envMapIntensity, side: sm.side });
        shared.name = `vc_${mk}`;
        vcMats.set(mk, shared);
      }
      key = `vc|${mk}|${cell}|${m.castShadow}|${attrs}`;
      mat = shared;
    } else key = `${mat.uuid}|${m.castShadow}|${m.receiveShadow}|${attrs}`;
    let b = buckets.get(key);
    if (!b) {
      b = { mat, cast: m.castShadow, receive: m.receiveShadow, geos: [] };
      buckets.set(key, b);
    }
    b.receive ||= m.receiveShadow;
    g = g.index ? g.toNonIndexed() : g.clone();
    if (vc) {
      const c = (m.material as THREE.MeshStandardMaterial).color;
      const n = g.attributes.position.count;
      const col = new Float32Array(n * 3);
      for (let i = 0; i < n; i++) {
        col[i * 3] = c.r;
        col[i * 3 + 1] = c.g;
        col[i * 3 + 2] = c.b;
      }
      g.setAttribute('color', new THREE.BufferAttribute(col, 3));
    }
    g.applyMatrix4(m.matrixWorld);
    // flip winding for mirrored transforms
    if (m.matrixWorld.determinant() < 0) {
      const pos = g.attributes.position as THREE.BufferAttribute;
      for (let i = 0; i < pos.count; i += 3) {
        for (const a of Object.values(g.attributes)) {
          const attr = a as THREE.BufferAttribute;
          for (let c = 0; c < attr.itemSize; c++) {
            const t = attr.array[(i + 1) * attr.itemSize + c];
            (attr.array as any)[(i + 1) * attr.itemSize + c] = attr.array[(i + 2) * attr.itemSize + c];
            (attr.array as any)[(i + 2) * attr.itemSize + c] = t;
          }
        }
      }
    }
    g.morphAttributes = {};
    b.geos.push(g);
    remove.push(m);
  });
  for (const m of remove) m.parent?.remove(m);
  const out = new THREE.Group();
  out.name = 'static-merged';
  const inv = new THREE.Matrix4().copy(root.matrixWorld).invert();
  for (const b of buckets.values()) {
    const merged = mergeGeometries(b.geos, false);
    if (!merged) continue;
    merged.applyMatrix4(inv);
    merged.computeBoundingSphere();
    merged.computeBoundingBox();
    const mesh = new THREE.Mesh(merged, b.mat);
    mesh.castShadow = b.cast;
    mesh.receiveShadow = b.receive;
    mesh.matrixAutoUpdate = false;
    mesh.updateMatrix();
    out.add(mesh);
    for (const g of b.geos) g.dispose();
  }
  root.add(out);
  return out;
}

/** Tag a subtree so it is not merged (moving parts). */
export function markDynamic(o: THREE.Object3D): THREE.Object3D {
  o.userData.dynamic = true;
  return o;
}
