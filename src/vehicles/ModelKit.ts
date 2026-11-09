/**
 * Small procedural modeling kit for the stylized cars.
 *
 * Parts are created in chassis-local space (no parent), dropped into buckets
 * keyed by material, and at the end each bucket is merged into ONE mesh so a
 * whole car body costs a handful of draw calls. Rounded shapes are
 * "chamfered prisms": a convex side profile (z, y) extruded across X with
 * bevelled edges, flat-shaded for the faceted toy look.
 */
import {
  Color3,
  DynamicTexture,
  Mesh,
  MeshBuilder,
  Quaternion,
  StandardMaterial,
  TransformNode,
  Vector3,
  VertexData,
  type Material,
  type Scene,
} from "@babylonjs/core";
import { outline, toon, type ToonOptions } from "../fx/Materials";

/** A 2D point in the car's side profile: [z, y]. */
export type P2 = [number, number];
export type V3 = [number, number, number];

export class Kit {
  /** material key -> parts sharing that material */
  private buckets = new Map<string, { mat: Material; meshes: Mesh[]; ink: boolean }>();

  /** While false, new parts go to buckets without the ink outline (decals). */
  private ink = true;

  constructor(readonly scene: Scene) {}

  /**
   * Build thin surface details (stripes, rivets, grille bars...) without the
   * ink outline: the outline shell is thicker than they are and would paint
   * them black.
   */
  decals(fn: () => void): void {
    const prev = this.ink;
    this.ink = false;
    try {
      fn();
    } finally {
      this.ink = prev;
    }
  }

  /** Register an already-built mesh under a toon color. */
  add(mesh: Mesh, hex: string, opts?: ToonOptions): Mesh {
    const key = `${hex}|${opts?.emissive ?? 0}|${opts?.unlit ? 1 : 0}|${this.ink ? 1 : 0}`;
    let b = this.buckets.get(key);
    if (!b) {
      b = { mat: toon(this.scene, hex, opts), meshes: [], ink: this.ink };
      this.buckets.set(key, b);
    }
    mesh.material = b.mat;
    b.meshes.push(mesh);
    return mesh;
  }

  /** Register a mesh with a custom (non-toon) material; flat decals get no ink outline. */
  addCustom(mesh: Mesh, mat: Material, key: string, ink = false): Mesh {
    let b = this.buckets.get(key);
    if (!b) {
      b = { mat, meshes: [], ink };
      this.buckets.set(key, b);
    }
    mesh.material = mat;
    b.meshes.push(mesh);
    return mesh;
  }

  box(hex: string, size: V3, pos: V3, rot?: V3, opts?: ToonOptions): Mesh {
    const m = MeshBuilder.CreateBox("p", { width: size[0], height: size[1], depth: size[2] }, this.scene);
    m.position.set(pos[0], pos[1], pos[2]);
    if (rot) m.rotation.set(rot[0], rot[1], rot[2]);
    return this.add(m, hex, opts);
  }

  /** Cylinder; by default its axis is +Y. */
  cyl(
    hex: string,
    o: { d: number; h: number; dTop?: number; tess?: number },
    pos: V3,
    rot?: V3,
    opts?: ToonOptions,
  ): Mesh {
    const m = MeshBuilder.CreateCylinder(
      "p",
      { diameterBottom: o.d, diameterTop: o.dTop ?? o.d, height: o.h, tessellation: o.tess ?? 10 },
      this.scene,
    );
    m.position.set(pos[0], pos[1], pos[2]);
    if (rot) m.rotation.set(rot[0], rot[1], rot[2]);
    m.convertToFlatShadedMesh();
    return this.add(m, hex, opts);
  }

  sphere(hex: string, d: number, pos: V3, scale?: V3, opts?: ToonOptions, segments = 4): Mesh {
    const m = MeshBuilder.CreateSphere("p", { diameter: d, segments }, this.scene);
    m.position.set(pos[0], pos[1], pos[2]);
    if (scale) m.scaling.set(scale[0], scale[1], scale[2]);
    m.convertToFlatShadedMesh();
    return this.add(m, hex, opts);
  }

  /** Chamfered convex prism from a side profile, extruded across X (centered on `x`). */
  prism(hex: string, profile: P2[], width: number, bevel: number, x = 0, opts?: ToonOptions): Mesh {
    const m = chamferPrism(this.scene, profile, width, bevel);
    m.position.x = x;
    return this.add(m, hex, opts);
  }

  /**
   * A slab lying on the profile edge p0 -> p1 (e.g. a hood or a racing
   * stripe), offset outward by `lift`. `t0..t1` trims the edge (0..1).
   */
  slab(hex: string, p0: P2, p1: P2, width: number, thick: number, x = 0, lift = 0.02, t0 = 0, t1 = 1, opts?: ToonOptions): Mesh {
    const m = MeshBuilder.CreateBox("p", { width, height: thick, depth: 1 }, this.scene);
    placeOnEdge(m, p0, p1, thick, x, lift, t0, t1);
    return this.add(m, hex, opts);
  }

  /** Thin box along a segment between two 3D points (pillars, bars, pipes). */
  bar(hex: string, a: V3, b: V3, thick: number, opts?: ToonOptions, round = false): Mesh {
    const A = new Vector3(...a);
    const B = new Vector3(...b);
    const len = Vector3.Distance(A, B);
    const m = round
      ? MeshBuilder.CreateCylinder("p", { diameter: thick, height: len, tessellation: 6 }, this.scene)
      : MeshBuilder.CreateBox("p", { width: thick, height: len, depth: thick }, this.scene);
    m.position.copyFrom(A.add(B).scaleInPlace(0.5));
    alignY(m, B.subtract(A));
    if (round) m.convertToFlatShadedMesh();
    return this.add(m, hex, opts);
  }

  get empty(): boolean {
    return this.buckets.size === 0;
  }

  /**
   * Merge every bucket into one mesh per material and parent them to `parent`.
   * Returns the merged meshes.
   */
  build(parent: TransformNode | null, name: string, ink = true, inkWidth = 0.03): Mesh[] {
    const out: Mesh[] = [];
    for (const [, b] of this.buckets) {
      if (!b.meshes.length) continue;
      const merged = b.meshes.length === 1 ? b.meshes[0] : Mesh.MergeMeshes(b.meshes, true, true);
      if (!merged) continue;
      merged.name = name;
      merged.material = b.mat;
      merged.parent = parent;
      merged.isPickable = false;
      if (ink && b.ink) outline(merged, inkWidth);
      out.push(merged);
    }
    this.buckets.clear();
    return out;
  }

  /** Merge everything into ONE multi-material mesh (for detachable panels / wheels). */
  buildSingle(parent: TransformNode | null, name: string, ink = true, inkWidth = 0.03): Mesh | null {
    const parts = this.build(null, name, false);
    if (!parts.length) return null;
    const m = parts.length === 1 ? parts[0] : Mesh.MergeMeshes(parts, true, true, undefined, false, true);
    if (!m) return null;
    m.name = name;
    m.parent = parent;
    m.isPickable = false;
    if (ink) outline(m, inkWidth);
    return m;
  }
}

/** Rotate a mesh so its local +Y axis points along `dir`. */
export function alignY(m: TransformNode, dir: Vector3): void {
  const d = dir.normalizeToNew();
  const up = Vector3.Up();
  const axis = Vector3.Cross(up, d);
  const s = axis.length();
  const c = Vector3.Dot(up, d);
  if (s < 1e-6) {
    m.rotationQuaternion = null;
    m.rotation.set(c < 0 ? Math.PI : 0, 0, 0);
    return;
  }
  axis.scaleInPlace(1 / s);
  m.rotationQuaternion = Quaternion.RotationAxis(axis, Math.atan2(s, c));
}

/** Place a unit-depth box (depth along Z) on the profile edge p0->p1. */
export function placeOnEdge(m: Mesh, p0: P2, p1: P2, thick: number, x: number, lift: number, t0 = 0, t1 = 1): void {
  const a: P2 = [p0[0] + (p1[0] - p0[0]) * t0, p0[1] + (p1[1] - p0[1]) * t0];
  const b: P2 = [p0[0] + (p1[0] - p0[0]) * t1, p0[1] + (p1[1] - p0[1]) * t1];
  const dz = b[0] - a[0];
  const dy = b[1] - a[1];
  const len = Math.hypot(dz, dy);
  // Outward normal of an edge on the top of a profile: rotate the edge by 90deg toward +y.
  let nz = -dy / len;
  let ny = dz / len;
  if (ny < 0) {
    nz = -nz;
    ny = -ny;
  }
  const off = lift + thick / 2;
  m.scaling.z = len;
  m.position.set(x, (a[1] + b[1]) / 2 + ny * off, (a[0] + b[0]) / 2 + nz * off);
  // Box depth axis (+Z) must follow the edge: rotate about X by -atan2(dy, dz).
  m.rotation.x = -Math.atan2(dy, dz);
}

/**
 * Chamfered prism: convex profile in the (z, y) plane, extruded along X from
 * -width/2 to +width/2; the side edges are bevelled by `bevel`.
 */
export function chamferPrism(scene: Scene, profile: P2[], width: number, bevel: number): Mesh {
  // Ensure counter-clockwise order in (z, y).
  let area = 0;
  for (let i = 0; i < profile.length; i++) {
    const a = profile[i];
    const b = profile[(i + 1) % profile.length];
    area += a[0] * b[1] - b[0] * a[1];
  }
  const P = area < 0 ? profile.slice().reverse() : profile.slice();
  const n = P.length;
  const b = Math.min(bevel, width * 0.45);
  const inset = insetPolygon(P, b);
  const hw = width / 2;
  // Rings: [x, polygon]
  const rings: [number, P2[]][] =
    b > 0.001
      ? [
          [-hw, inset],
          [-hw + b, P],
          [hw - b, P],
          [hw, inset],
        ]
      : [
          [-hw, P],
          [hw, P],
        ];

  const pos: number[] = [];
  const nrm: number[] = [];
  const idx: number[] = [];
  let cz = 0;
  let cy = 0;
  for (const p of P) {
    cz += p[0] / n;
    cy += p[1] / n;
  }
  const center = new Vector3(0, cy, cz);
  const tmpA = new Vector3();
  const tmpB = new Vector3();
  const tmpN = new Vector3();

  /** Add a planar convex polygon face (vertices in any winding), oriented outward. */
  const face = (verts: Vector3[]) => {
    const base = pos.length / 3;
    // Face normal via Newell's method.
    tmpN.setAll(0);
    const c = new Vector3();
    for (let i = 0; i < verts.length; i++) {
      const v = verts[i];
      const w = verts[(i + 1) % verts.length];
      tmpN.x += (v.y - w.y) * (v.z + w.z);
      tmpN.y += (v.z - w.z) * (v.x + w.x);
      tmpN.z += (v.x - w.x) * (v.y + w.y);
      c.addInPlace(v);
    }
    c.scaleInPlace(1 / verts.length);
    if (tmpN.lengthSquared() < 1e-12) return;
    tmpN.normalize();
    const outward = c.subtract(center);
    if (Vector3.Dot(tmpN, outward) < 0) tmpN.scaleInPlace(-1);
    for (const v of verts) {
      pos.push(v.x, v.y, v.z);
      nrm.push(tmpN.x, tmpN.y, tmpN.z);
    }
    // Fan triangulation; Babylon's front face: (p0-p1) x (p2-p1) points along the normal.
    for (let i = 1; i < verts.length - 1; i++) {
      const p0 = verts[0];
      const p1 = verts[i];
      const p2 = verts[i + 1];
      p0.subtractToRef(p1, tmpA);
      p2.subtractToRef(p1, tmpB);
      const cr = Vector3.Cross(tmpA, tmpB);
      if (Vector3.Dot(cr, tmpN) >= 0) idx.push(base, base + i, base + i + 1);
      else idx.push(base, base + i + 1, base + i);
    }
  };

  // Side bands between consecutive rings.
  for (let r = 0; r < rings.length - 1; r++) {
    const [x0, A] = rings[r];
    const [x1, B] = rings[r + 1];
    for (let i = 0; i < n; i++) {
      const j = (i + 1) % n;
      face([
        new Vector3(x0, A[i][1], A[i][0]),
        new Vector3(x0, A[j][1], A[j][0]),
        new Vector3(x1, B[j][1], B[j][0]),
        new Vector3(x1, B[i][1], B[i][0]),
      ]);
    }
  }
  // End caps.
  const capL = rings[0];
  const capR = rings[rings.length - 1];
  face(capL[1].map((p) => new Vector3(capL[0], p[1], p[0])));
  face(capR[1].map((p) => new Vector3(capR[0], p[1], p[0])));

  const mesh = new Mesh("prism", scene);
  const vd = new VertexData();
  vd.positions = pos;
  vd.normals = nrm;
  vd.indices = idx;
  // planar UVs (z, y) so prisms merge with builder meshes (which all carry UVs)
  const uvs: number[] = [];
  for (let i = 0; i < pos.length; i += 3) uvs.push(pos[i + 2], pos[i + 1]);
  vd.uvs = uvs;
  vd.applyToMesh(mesh);
  return mesh;
}

/** Offset a CCW convex polygon inward by d (miter joins). */
function insetPolygon(P: P2[], d: number): P2[] {
  const n = P.length;
  const out: P2[] = [];
  for (let i = 0; i < n; i++) {
    const prev = P[(i - 1 + n) % n];
    const cur = P[i];
    const next = P[(i + 1) % n];
    // Inward normals of CCW edges = rotate edge dir by +90deg: (-dy, dz).
    const e1z = cur[0] - prev[0];
    const e1y = cur[1] - prev[1];
    const l1 = Math.hypot(e1z, e1y) || 1;
    const e2z = next[0] - cur[0];
    const e2y = next[1] - cur[1];
    const l2 = Math.hypot(e2z, e2y) || 1;
    const n1z = -e1y / l1;
    const n1y = e1z / l1;
    const n2z = -e2y / l2;
    const n2y = e2z / l2;
    let mz = n1z + n2z;
    let my = n1y + n2y;
    const ml = Math.hypot(mz, my) || 1;
    mz /= ml;
    my /= ml;
    const k = d / Math.max(0.25, mz * n1z + my * n1y);
    out.push([cur[0] + mz * k, cur[1] + my * k]);
  }
  return out;
}

/** Regular polygon profile (for wheels / round parts) around (cz, cy). */
export function ngon(n: number, r: number, cz = 0, cy = 0, phase = 0): P2[] {
  const out: P2[] = [];
  for (let i = 0; i < n; i++) {
    const a = phase + (i / n) * Math.PI * 2;
    out.push([cz + Math.cos(a) * r, cy + Math.sin(a) * r]);
  }
  return out;
}

// ---------------------------------------------------------------------------
// Textured materials (cached per scene)

const texCache = new WeakMap<Scene, Map<string, StandardMaterial>>();

function cached(scene: Scene, key: string, make: () => StandardMaterial): StandardMaterial {
  let m = texCache.get(scene);
  if (!m) {
    m = new Map();
    texCache.set(scene, m);
  }
  let mat = m.get(key);
  if (!mat) {
    mat = make();
    m.set(key, mat);
  }
  return mat;
}

/** License plate / sign texture with bold text. */
export function textMaterial(scene: Scene, text: string, bg: string, fg: string, w = 256, h = 96): StandardMaterial {
  return cached(scene, `txt|${text}|${bg}|${fg}`, () => {
    const tex = new DynamicTexture(`txt_${text}`, { width: w, height: h }, scene, true);
    const ctx = tex.getContext() as unknown as CanvasRenderingContext2D;
    ctx.fillStyle = bg;
    ctx.fillRect(0, 0, w, h);
    ctx.strokeStyle = fg;
    ctx.lineWidth = 6;
    ctx.strokeRect(5, 5, w - 10, h - 10);
    ctx.fillStyle = fg;
    ctx.font = `900 ${Math.floor(h * 0.62)}px Arial Black, Impact, sans-serif`;
    ctx.textAlign = "center";
    ctx.textBaseline = "middle";
    ctx.fillText(text, w / 2, h / 2 + 3);
    tex.update();
    const m = new StandardMaterial(`txtm_${text}`, scene);
    m.diffuseTexture = tex;
    m.emissiveColor = new Color3(0.35, 0.35, 0.35);
    m.specularColor = Color3.Black();
    return m;
  });
}

/** Spider-web crack overlay for the windshield (transparent background). */
export function crackMaterial(scene: Scene, heavy: boolean): StandardMaterial {
  return cached(scene, `crack|${heavy}`, () => {
    const S = 256;
    const tex = new DynamicTexture(`crack${heavy}`, { width: S, height: S }, scene, true);
    tex.hasAlpha = true;
    const ctx = tex.getContext() as unknown as CanvasRenderingContext2D;
    ctx.clearRect(0, 0, S, S);
    ctx.strokeStyle = "rgba(235,245,255,0.95)";
    ctx.lineCap = "round";
    let seed = heavy ? 7 : 3;
    const rnd = () => ((seed = (seed * 16807) % 2147483647) / 2147483647);
    const centers = heavy ? [[0.3, 0.45], [0.72, 0.6]] : [[0.62, 0.42]];
    for (const [cx, cy] of centers) {
      const ox = cx * S;
      const oy = cy * S;
      const rays = heavy ? 11 : 8;
      for (let i = 0; i < rays; i++) {
        const a = (i / rays) * Math.PI * 2 + rnd() * 0.5;
        let x = ox;
        let y = oy;
        ctx.lineWidth = 3;
        ctx.beginPath();
        ctx.moveTo(x, y);
        const segs = 4 + Math.floor(rnd() * 3);
        for (let s = 0; s < segs; s++) {
          const len = 14 + rnd() * 26;
          const aa = a + (rnd() - 0.5) * 0.7;
          x += Math.cos(aa) * len;
          y += Math.sin(aa) * len;
          ctx.lineTo(x, y);
        }
        ctx.stroke();
      }
      // concentric rings
      ctx.lineWidth = 2;
      for (const r of heavy ? [16, 34, 58] : [14, 30]) {
        ctx.beginPath();
        for (let i = 0; i <= 9; i++) {
          const a = (i / 9) * Math.PI * 2;
          const rr = r * (0.8 + rnd() * 0.4);
          const px = ox + Math.cos(a) * rr;
          const py = oy + Math.sin(a) * rr;
          if (i === 0) ctx.moveTo(px, py);
          else ctx.lineTo(px, py);
        }
        ctx.stroke();
      }
    }
    tex.update();
    const m = new StandardMaterial(`crackm${heavy}`, scene);
    m.diffuseTexture = tex;
    m.useAlphaFromDiffuseTexture = true;
    m.disableLighting = true;
    m.emissiveColor = new Color3(1, 1, 1);
    m.backFaceCulling = false;
    m.specularColor = Color3.Black();
    return m;
  });
}
