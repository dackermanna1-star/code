/**
 * Runtime rig for a model definition: a three.js hierarchy of joints (animated) and bone
 * bodies (box centres), meshes in REST space, per-instance materials, attachment points,
 * wounds and the ragdoll description.
 *
 * Hierarchy (per bone B with parent P):
 *   P.obj ── B.joint (position = B.pivot - P.centre, rotation = animation, order ZYX)
 *              └─ B.obj (position = B.centre - B.pivot; origin = centre of B's box)
 *                    ├─ mesh(es) (position = -B.centre  => mesh local space == model rest space)
 *                    └─ child joints ...
 * Root bones hang off `rig.body` (child of `rig.root` = entity.model).
 *
 * Wound API coordinates: model REST space (metres, feet centre origin, +Y up, facing -Z),
 * i.e. exactly the local space of every part mesh: `mesh.worldToLocal(worldHitPoint)` for the
 * mesh that was hit (any part mesh works for points on that part).
 *
 * Ragdoll API (`model.userData.bones`, parent-first order): `{ name, obj, size, parent, pivot,
 * mass, center }` where `obj` is the bone body (origin = box centre, so a cuboid collider of
 * `size` centred on `obj` matches the part), `pivot` = joint position in the PARENT bone's obj
 * space, `center` = box centre in rest space. `size` is in world units for the current model
 * scale. Drive bodies either with `model.userData.setBoneWorld(obj, position, quaternion)`
 * (process bones in array order), or by writing `obj.matrixWorld` directly after setting
 * `obj.matrixAutoUpdate = obj.matrixWorldAutoUpdate = false`.
 */
import * as THREE from 'three';
import type { ModelDef, PrimDef, V3 } from './def';
import { primBounds, primMesh, type MeshArrays } from './prims';
import { layoutAtlas, type AtlasLayout } from './paint/atlas';
import { createMobMaterial } from './material';
import type { TexHandle } from './textures';

export interface RagdollBone {
  name: string;
  obj: THREE.Object3D;
  size: [number, number, number];
  parent: string | null;
  pivot: THREE.Vector3;
  mass: number;
  center: THREE.Vector3;
  /** `mass` was set explicitly by the model definition (otherwise ragdolls re-derive it from volume). */
  massFixed?: boolean;
}

export class RigBone {
  readonly joint = new THREE.Object3D();
  readonly obj = new THREE.Object3D();
  readonly restJoint = new THREE.Vector3();
  parent: RigBone | null = null;
  constructor(readonly name: string, readonly pivot: V3, readonly center: V3, readonly size: V3) {
    this.joint.rotation.order = 'ZYX';
    this.joint.name = name + ':joint';
    this.obj.name = name;
  }
  /** Set the joint rotation (radians, Minecraft-style ZYX order). */
  rot(x: number, y = 0, z = 0) {
    this.joint.rotation.set(x, y, z);
  }
  /** Offset the joint from its rest position (rest-space metres). */
  move(x: number, y: number, z: number) {
    this.joint.position.set(this.restJoint.x + x, this.restJoint.y + y, this.restJoint.z + z);
  }
  reset() {
    this.joint.rotation.set(0, 0, 0);
    this.joint.position.copy(this.restJoint);
    this.joint.scale.set(1, 1, 1);
  }
}

interface GeoSet {
  layout: AtlasLayout;
  /** per bone -> per slot geometry */
  geos: Map<string, Map<string, THREE.BufferGeometry>>;
  boxes: Map<string, [V3, V3]>;
}
const geoCache = new Map<string, GeoSet>();

function toGeometry(a: MeshArrays): THREE.BufferGeometry {
  const g = new THREE.BufferGeometry();
  g.setAttribute('position', new THREE.Float32BufferAttribute(a.pos, 3));
  g.setAttribute('normal', new THREE.Float32BufferAttribute(a.nrm, 3));
  g.setAttribute('uv', new THREE.Float32BufferAttribute(a.uv, 2));
  g.setIndex(a.pos.length / 3 > 65535 ? new THREE.Uint32BufferAttribute(a.idx, 1) : new THREE.Uint16BufferAttribute(a.idx, 1));
  g.computeBoundingSphere();
  g.computeBoundingBox();
  return g;
}

/** Build (cached) geometry for a model definition. */
export function modelGeometry(def: ModelDef): GeoSet {
  let gs = geoCache.get(def.key);
  if (gs) return gs;
  const layout = layoutAtlas(def);
  const arrays = new Map<string, Map<string, MeshArrays>>();
  const boxes = new Map<string, [V3, V3]>();
  for (const p of def.prims) {
    const slot = p.mat ?? 'main';
    let bm = arrays.get(p.bone);
    if (!bm) arrays.set(p.bone, (bm = new Map()));
    let a = bm.get(slot);
    if (!a) bm.set(slot, (a = { pos: [], nrm: [], uv: [], idx: [] }));
    const rects = layout.uv[p.id] ?? fullRects(p);
    primMesh(p, rects, layout.mirror[p.id] ?? false, a);
    if (!p.noBounds) {
      const [mn, mx] = primBounds(p);
      const b = boxes.get(p.bone);
      if (!b) boxes.set(p.bone, [mn, mx]);
      else for (let i = 0; i < 3; i++) { b[0][i] = Math.min(b[0][i], mn[i]); b[1][i] = Math.max(b[1][i], mx[i]); }
    }
  }
  const geos = new Map<string, Map<string, THREE.BufferGeometry>>();
  for (const [bone, bm] of arrays) {
    const m = new Map<string, THREE.BufferGeometry>();
    for (const [slot, a] of bm) m.set(slot, toGeometry(a));
    geos.set(bone, m);
  }
  gs = { layout, geos, boxes };
  geoCache.set(def.key, gs);
  return gs;
}

function fullRects(p: PrimDef) {
  const r: Record<string, [number, number, number, number]> = {};
  for (const f of ['front', 'back', 'left', 'right', 'top', 'bottom', 'surf']) r[f] = [0, 0, 1, 1];
  return r;
}

const _m = new THREE.Matrix4(), _p = new THREE.Vector3(), _q = new THREE.Quaternion(), _s = new THREE.Vector3();

export class Rig {
  /** entity.model: positioned/rotated by the entity. */
  readonly root = new THREE.Group();
  /** Pose root (scale, death tilt, whole-body offsets). */
  readonly body = new THREE.Group();
  readonly bones = new Map<string, RigBone>();
  readonly list: RigBone[] = [];
  readonly materials: THREE.RawShaderMaterial[] = [];
  readonly slots: Record<string, THREE.RawShaderMaterial> = {};
  readonly meshes: THREE.Mesh[] = [];
  readonly attach: Record<string, THREE.Object3D> = {};
  readonly ragdoll: RagdollBone[] = [];
  readonly wounds: THREE.Vector4[] = [];
  private woundCursor = 0;
  private scale = 1;

  constructor(readonly def: ModelDef, tex: TexHandle, totalMass = 70) {
    this.root.add(this.body);
    this.body.rotation.order = 'ZYX';
    const gs = modelGeometry(def);
    // materials
    const mainMat = createMobMaterial({
      map: tex.albedo, pbrMap: tex.pbr, extraMap: tex.extra, sssFromAlpha: !def.alphaTest, sss: def.sss ?? 0,
      bloodType: def.blood ?? 0, normalScale: 1, tint: true, alphaTest: def.alphaTest ?? 0,
      side: THREE.FrontSide,
    });
    this.slots.main = mainMat;
    this.materials.push(mainMat);
    for (const [name, s] of Object.entries(def.slots ?? {})) {
      if (name === 'main') continue;
      const m = s.kind === 'atlas'
        ? createMobMaterial({ map: tex.albedo, pbrMap: tex.pbr, extraMap: tex.extra, sssFromAlpha: !def.alphaTest, sss: s.sss ?? def.sss ?? 0, bloodType: def.blood ?? 0, tint: true, alphaTest: s.alphaTest ?? def.alphaTest ?? 0, side: s.doubleSided ? THREE.DoubleSide : THREE.FrontSide })
        : createMobMaterial({ color: s.color ?? 0xffffff, roughness: s.roughness ?? 0.6, metalness: s.metalness ?? 0, emissive: s.emissive ?? 0, sss: s.sss ?? 0, bloodType: def.blood ?? 0, tint: true, side: s.doubleSided ? THREE.DoubleSide : THREE.FrontSide });
      this.slots[name] = m;
      this.materials.push(m);
    }
    if (!tex.ready) tex.listeners.push((h) => this.setTextures(h));
    // bones (parents must precede children in def.bones)
    const vols: number[] = [];
    for (const bd of def.bones) {
      const box = bd.box ?? gs.boxes.get(bd.name) ?? [[bd.pivot[0] - 0.05, bd.pivot[1] - 0.05, bd.pivot[2] - 0.05], [bd.pivot[0] + 0.05, bd.pivot[1] + 0.05, bd.pivot[2] + 0.05]];
      const center: V3 = [(box[0][0] + box[1][0]) / 2, (box[0][1] + box[1][1]) / 2, (box[0][2] + box[1][2]) / 2];
      const size: V3 = [box[1][0] - box[0][0], box[1][1] - box[0][1], box[1][2] - box[0][2]];
      const b = new RigBone(bd.name, bd.pivot, center, size);
      const parent = bd.parent ? this.bones.get(bd.parent) ?? null : null;
      b.parent = parent;
      if (parent) {
        b.restJoint.set(bd.pivot[0] - parent.center[0], bd.pivot[1] - parent.center[1], bd.pivot[2] - parent.center[2]);
        parent.obj.add(b.joint);
      } else {
        b.restJoint.set(bd.pivot[0], bd.pivot[1], bd.pivot[2]);
        this.body.add(b.joint);
      }
      b.joint.position.copy(b.restJoint);
      b.obj.position.set(center[0] - bd.pivot[0], center[1] - bd.pivot[1], center[2] - bd.pivot[2]);
      b.joint.add(b.obj);
      const g = gs.geos.get(bd.name);
      if (g) {
        for (const [slot, geo] of g) {
          const mat = this.slots[slot] ?? mainMat;
          const mesh = new THREE.Mesh(geo, mat);
          mesh.position.set(-center[0], -center[1], -center[2]);
          mesh.name = `${bd.name}:${slot}`;
          mesh.userData.restSpace = true;
          if (def.slots?.[slot]?.noShadow) mesh.userData.noShadow = true;
          b.obj.add(mesh);
          this.meshes.push(mesh);
        }
      }
      this.bones.set(bd.name, b);
      this.list.push(b);
      vols.push(bd.mass ?? Math.max(1e-4, size[0] * size[1] * size[2]));
    }
    // ragdoll description (mass distributed by volume unless given)
    const explicit = def.bones.some((b) => b.mass !== undefined);
    const vsum = vols.reduce((a, b) => a + b, 0);
    this.list.forEach((b, i) => {
      const bd = def.bones[i];
      const mass = explicit && bd.mass !== undefined ? bd.mass : (vols[i] / vsum) * totalMass;
      const piv = b.parent ? new THREE.Vector3(b.pivot[0] - b.parent.center[0], b.pivot[1] - b.parent.center[1], b.pivot[2] - b.parent.center[2]) : new THREE.Vector3(...b.pivot);
      this.ragdoll.push({ name: b.name, obj: b.obj, size: [b.size[0], b.size[1], b.size[2]], parent: b.parent?.name ?? null, pivot: piv, mass, center: new THREE.Vector3(...b.center), massFixed: explicit && bd.mass !== undefined });
    });
    // attachment points
    for (const [name, a] of Object.entries(def.attach ?? {})) {
      const b = this.bones.get(a.bone);
      if (!b) continue;
      const o = new THREE.Object3D();
      o.name = 'attach:' + name;
      o.position.set(a.pos[0] - b.center[0], a.pos[1] - b.center[1], a.pos[2] - b.center[2]);
      if (a.rot) o.rotation.set(a.rot[0], a.rot[1], a.rot[2], 'ZYX');
      b.obj.add(o);
      this.attach[name] = o;
    }
    for (let i = 0; i < 8; i++) this.wounds.push(new THREE.Vector4());
    this.root.userData.bones = this.ragdoll;
    this.root.userData.rig = this;
    this.root.userData.setBoneWorld = (obj: THREE.Object3D, pos: THREE.Vector3, quat: THREE.Quaternion) => setBoneWorld(obj, pos, quat);
  }

  bone(name: string): RigBone {
    const b = this.bones.get(name);
    if (!b) throw new Error(`rig ${this.def.key}: no bone ${name}`);
    return b;
  }
  has(name: string) {
    return this.bones.has(name);
  }

  setTextures(h: TexHandle) {
    for (const m of this.materials) {
      const u = m.uniforms;
      if (u.u_map && u.u_hasMap.value > 0.5) u.u_map.value = h.albedo;
      if (u.u_pbrMap && u.u_pbrMap.value) u.u_pbrMap.value = h.pbr;
      if (u.u_extraMap && u.u_extraMap.value) u.u_extraMap.value = h.extra;
    }
  }

  /** Uniform model scale (babies); keeps ragdoll sizes in world units. */
  setScale(s: number) {
    if (s === this.scale) return;
    this.scale = s;
    this.body.scale.setScalar(s);
    this.list.forEach((b, i) => {
      const r = this.ragdoll[i];
      r.size = [b.size[0] * s, b.size[1] * s, b.size[2] * s];
    });
  }

  resetPose() {
    for (const b of this.list) b.reset();
  }

  /** Add a wound in rest space (see file header). Keeps the 8 most recent. */
  addWound(local: THREE.Vector3, severity: number) {
    const sev = Math.max(0, Math.min(10, Math.floor(Math.max(0, severity) * 10)));
    const w = this.wounds[this.woundCursor % 8];
    w.set(local.x, local.y, local.z, sev + Math.random() * 0.999);
    this.woundCursor++;
    const n = Math.min(8, this.woundCursor);
    for (const m of this.materials) {
      const arr = m.uniforms.u_wounds.value as THREE.Vector4[];
      for (let i = 0; i < 8; i++) arr[i].copy(this.wounds[i]);
      m.uniforms.u_woundCount.value = n;
    }
  }

  /** Wound at a world point: picks the nearest part mesh and converts to rest space. */
  addWoundWorld(world: THREE.Vector3, severity: number) {
    this.root.updateWorldMatrix(true, true);
    let best: THREE.Mesh | null = null, bd = Infinity;
    const lp = new THREE.Vector3();
    for (const m of this.meshes) {
      const g = m.geometry;
      if (!g.boundingBox) g.computeBoundingBox();
      lp.copy(world);
      m.worldToLocal(lp);
      const d = g.boundingBox!.distanceToPoint(lp);
      if (d < bd) { bd = d; best = m; }
    }
    if (!best) return;
    lp.copy(world);
    best.worldToLocal(lp);
    // snap onto the surface box
    best.geometry.boundingBox!.clampPoint(lp, lp);
    this.addWound(lp, severity);
  }

  /**
   * Nearest part mesh to a world point; writes the rest-space point (snapped onto the part's
   * box) to `out`. Returns the mesh (name `bone:slot`) or null when the rig has no meshes.
   */
  locate(world: THREE.Vector3, out: THREE.Vector3): THREE.Mesh | null {
    this.root.updateWorldMatrix(true, true);
    let best: THREE.Mesh | null = null, bd = Infinity;
    for (const m of this.meshes) {
      const g = m.geometry;
      if (!g.boundingBox) g.computeBoundingBox();
      out.copy(world);
      m.worldToLocal(out);
      const d = g.boundingBox!.distanceToPoint(out);
      if (d < bd) { bd = d; best = m; }
    }
    if (!best) return null;
    out.copy(world);
    best.worldToLocal(out);
    best.geometry.boundingBox!.clampPoint(out, out);
    return best;
  }

  /** Upload externally managed wounds (typed: position+code, direction+growth) to every material. */
  setWounds(pos: THREE.Vector4[], dir: THREE.Vector4[], count: number) {
    const n = Math.min(8, count);
    for (const m of this.materials) {
      const a = m.uniforms.u_wounds.value as THREE.Vector4[];
      const b = m.uniforms.u_woundDir?.value as THREE.Vector4[] | undefined;
      for (let i = 0; i < n; i++) {
        a[i].copy(pos[i]);
        b?.[i].copy(dir[i]);
      }
      m.uniforms.u_woundCount.value = n;
    }
  }

  /** Fade (1 = opaque .. 0 = gone, dithered) the whole model. */
  setFade(f: number) {
    for (const m of this.materials) if (m.uniforms.u_fade) m.uniforms.u_fade.value = f;
  }

  clearWounds() {
    this.woundCursor = 0;
    for (const m of this.materials) m.uniforms.u_woundCount.value = 0;
  }

  /** Bone body world transform → local transform (for ragdoll drivers). */
  setBoneWorld(obj: THREE.Object3D, pos: THREE.Vector3, quat: THREE.Quaternion) {
    setBoneWorld(obj, pos, quat);
  }

  dispose() {
    for (const m of this.materials) m.dispose();
  }
}

export function setBoneWorld(obj: THREE.Object3D, pos: THREE.Vector3, quat: THREE.Quaternion) {
  const parent = obj.parent;
  obj.matrixWorld.decompose(_p, _q, _s);
  _m.compose(pos, quat, _s);
  if (parent) {
    parent.updateWorldMatrix(true, false);
    _m.premultiply(new THREE.Matrix4().copy(parent.matrixWorld).invert());
  }
  _m.decompose(obj.position, obj.quaternion, obj.scale);
  obj.updateMatrixWorld(true);
}
