/**
 * Low-poly zombie bodies built from 10 parts. Geometry is shared per
 * (type, part) through instancing; colors are baked as vertex colors so
 * every zombie uses one toon material (one draw call per part batch).
 *
 * Each part hangs off a joint node. A part's mesh is centered half its
 * length along the part's axis from the joint, which makes it trivial to
 * swap the same meshes over to ragdoll bodies.
 */
import {
  Color3,
  Color4,
  InstancedMesh,
  Mesh,
  MeshBuilder,
  TransformNode,
  Vector3,
  VertexBuffer,
  type Scene,
} from "@babylonjs/core";
import { ZOMBIES, type ZombieDef, type ZombieType } from "../data/zombies";
import { outline, toon } from "../fx/Materials";
import { Shadows } from "../fx/Shadows";

export type PartId =
  | "pelvis"
  | "chest"
  | "head"
  | "upperArmL"
  | "upperArmR"
  | "foreArmL"
  | "foreArmR"
  | "thighL"
  | "thighR"
  | "shinL"
  | "shinR";

/** Joint between a part and its parent (ragdoll constraint). */
export interface PartSpec {
  id: PartId;
  parent: PartId | null;
  /** Joint position relative to the parent's joint (in units of height). */
  joint: [number, number, number];
  /** Length along the part axis; dir +1 = up, -1 = down. */
  length: number;
  dir: 1 | -1;
  radius: number; // collision radius (units of height)
  mass: number; // fraction of total mass
}

// Proportions are fractions of zombie height; x widths are scaled by girth.
export const PARTS: PartSpec[] = [
  { id: "pelvis", parent: null, joint: [0, 0.5, 0], length: 0.1, dir: 1, radius: 0.09, mass: 0.15 },
  { id: "chest", parent: "pelvis", joint: [0, 0.08, 0], length: 0.26, dir: 1, radius: 0.12, mass: 0.3 },
  { id: "head", parent: "chest", joint: [0, 0.26, 0.02], length: 0.2, dir: 1, radius: 0.1, mass: 0.08 },
  { id: "upperArmL", parent: "chest", joint: [-0.17, 0.23, 0], length: 0.21, dir: -1, radius: 0.04, mass: 0.04 },
  { id: "upperArmR", parent: "chest", joint: [0.17, 0.23, 0], length: 0.21, dir: -1, radius: 0.04, mass: 0.04 },
  { id: "foreArmL", parent: "upperArmL", joint: [0, -0.21, 0], length: 0.23, dir: -1, radius: 0.035, mass: 0.03 },
  { id: "foreArmR", parent: "upperArmR", joint: [0, -0.21, 0], length: 0.23, dir: -1, radius: 0.035, mass: 0.03 },
  { id: "thighL", parent: "pelvis", joint: [-0.075, 0, 0], length: 0.25, dir: -1, radius: 0.055, mass: 0.1 },
  { id: "thighR", parent: "pelvis", joint: [0.075, 0, 0], length: 0.25, dir: -1, radius: 0.055, mass: 0.1 },
  { id: "shinL", parent: "thighL", joint: [0, -0.25, 0], length: 0.25, dir: -1, radius: 0.045, mass: 0.06 },
  { id: "shinR", parent: "thighR", joint: [0, -0.25, 0], length: 0.25, dir: -1, radius: 0.045, mass: 0.06 },
];

export const PART_INDEX: Record<PartId, number> = Object.fromEntries(PARTS.map((p, i) => [p.id, i])) as Record<PartId, number>;

/** A zombie's visual body: joint nodes + part instances. */
export interface ZombieBody {
  root: TransformNode; // at the feet, yaw = facing
  joints: TransformNode[]; // index matches PARTS
  meshes: InstancedMesh[]; // index matches PARTS; child of the joint node
  def: ZombieDef;
  scale: number; // height in meters
}

function paint(mesh: Mesh, hex: string): Mesh {
  const c = Color4.FromColor3(Color3.FromHexString(hex), 1);
  const n = mesh.getTotalVertices();
  const colors = new Float32Array(n * 4);
  for (let i = 0; i < n; i++) {
    colors[i * 4] = c.r;
    colors[i * 4 + 1] = c.g;
    colors[i * 4 + 2] = c.b;
    colors[i * 4 + 3] = 1;
  }
  mesh.setVerticesData(VertexBuffer.ColorKind, colors);
  return mesh;
}

function limb(scene: Scene, len: number, rTop: number, rBot: number, hex: string, dir: 1 | -1): Mesh {
  const m = MeshBuilder.CreateCylinder("l", { height: len, diameterTop: rTop * 2, diameterBottom: rBot * 2, tessellation: 6 }, scene);
  if (dir === -1) m.rotation.x = Math.PI; // wide end (diameterTop) at the joint
  m.position.y = (len / 2) * dir; // extend from the joint along the part axis
  m.bakeCurrentTransformIntoVertices();
  return paint(m, hex);
}

function box(scene: Scene, w: number, h: number, d: number, hex: string, at: [number, number, number], rot = 0): Mesh {
  const m = MeshBuilder.CreateBox("b", { width: w, height: h, depth: d }, scene);
  m.position.set(at[0], at[1], at[2]);
  m.rotation.z = rot;
  m.bakeCurrentTransformIntoVertices();
  return paint(m, hex);
}

function blob(scene: Scene, r: number, hex: string, at: [number, number, number], squash: [number, number, number] = [1, 1, 1]): Mesh {
  const m = MeshBuilder.CreateIcoSphere("s", { radius: r, subdivisions: 1, flat: true }, scene);
  m.position.set(at[0], at[1], at[2]);
  m.scaling.set(squash[0], squash[1], squash[2]);
  m.bakeCurrentTransformIntoVertices();
  return paint(m, hex);
}

function merge(pieces: Mesh[], name: string): Mesh {
  const m = Mesh.MergeMeshes(pieces, true, true)!;
  m.name = name;
  m.convertToFlatShadedMesh();
  return m;
}

/** Build source geometry for one part of one type at unit height (scaled per instance). */
function buildPart(scene: Scene, def: ZombieDef, p: PartSpec): Mesh {
  const g = def.girth;
  const { skin, shirt, pants } = def.color;
  const dark = Color3.FromHexString(skin).scale(0.55).toHexString();
  const L = p.length;
  const half = (L / 2) * p.dir;
  switch (p.id) {
    case "pelvis":
      return merge([box(scene, 0.26 * g, L, 0.16 * Math.min(g, 1.4), pants, [0, half * 0.6, 0])], p.id);
    case "chest": {
      const pieces = [
        limb(scene, L, 0.15 * g, 0.12 * g, shirt, 1),
        // torn shirt flap + exposed ribs
        box(scene, 0.07 * g, 0.08, 0.02, dark, [0.05 * g, L * 0.45, 0.1 * Math.min(g, 1.3)]),
        box(scene, 0.1 * g, 0.05, 0.03, shirt, [-0.06 * g, -0.01, 0.08 * Math.min(g, 1.3)], 0.4),
      ];
      // hunch: shoulders pushed forward
      pieces[0].position.z = 0;
      if (def.type === "bloater") {
        pieces.push(blob(scene, 0.16 * g * 0.6, skin, [0, L * 0.35, 0.05], [1.1, 1, 1.1]));
        pieces.push(blob(scene, 0.035, "#e0e86a", [0.07, L * 0.55, 0.15]));
        pieces.push(blob(scene, 0.03, "#e0e86a", [-0.09, L * 0.3, 0.16]));
      }
      if (def.type === "brute") pieces.push(box(scene, 0.42 * g * 0.75, 0.06, 0.18, shirt, [0, L * 0.95, 0]));
      if (def.type === "runner") pieces.push(blob(scene, 0.09, shirt, [0, L * 0.95, -0.08], [1.4, 0.8, 1])); // hood
      const m = merge(pieces, p.id);
      m.scaling.z = def.type === "bloater" ? 1 : 0.7;
      m.bakeCurrentTransformIntoVertices();
      return m;
    }
    case "head": {
      const hs = def.type === "brute" ? 0.75 : def.type === "climber" ? 0.95 : 1;
      const r = 0.105 * hs;
      const pieces = [
        blob(scene, r, skin, [0, r * 0.95, 0.01], [1, 1.08, 1]),
        box(scene, r * 1.3, r * 0.45, r * 1.1, dark, [0, r * 0.25, 0.04]), // jaw
        box(scene, r * 0.35, r * 0.3, 0.02, "#fff4a8", [-r * 0.38, r * 1.05, r * 0.95]), // eyes
        box(scene, r * 0.35, r * 0.3, 0.02, "#fff4a8", [r * 0.38, r * 1.05, r * 0.95]),
        box(scene, r * 0.18, r * 0.16, 0.02, "#2a0f12", [-r * 0.38, r * 1.03, r * 0.97]), // pupils
        box(scene, r * 0.18, r * 0.16, 0.02, "#2a0f12", [r * 0.38, r * 1.03, r * 0.97]),
        box(scene, r * 1.1, r * 0.14, 0.02, "#3a0d10", [0, r * 0.45, r * 1.0]), // mouth
        box(scene, r * 0.08, r * 0.18, 0.02, "#f2efe0", [-r * 0.25, r * 0.45, r * 1.02]), // teeth
        box(scene, r * 0.08, r * 0.18, 0.02, "#f2efe0", [r * 0.2, r * 0.45, r * 1.02]),
      ];
      if (def.type === "runner") pieces.push(blob(scene, r * 1.12, shirt, [0, r * 1.05, -r * 0.25], [1, 1, 0.9])); // hood
      if (def.type !== "runner") pieces.push(box(scene, r * 0.5, r * 0.25, r * 0.6, "#3b2b22", [r * 0.3, r * 1.85, -r * 0.1], 0.3)); // hair tuft
      return merge(pieces, p.id);
    }
    case "upperArmL":
    case "upperArmR":
      return merge([limb(scene, L, 0.045 * g, 0.038 * g, shirt, -1)], p.id);
    case "foreArmL":
    case "foreArmR":
      return merge(
        [
          limb(scene, L * 0.8, 0.035 * g, 0.03 * g, skin, -1),
          box(scene, 0.06 * g, 0.08, 0.035, skin, [0, -L * 0.85, 0.01]),
          box(scene, 0.012, 0.06, 0.012, dark, [0.02, -L * 1.0, 0.02]), // claws
          box(scene, 0.012, 0.06, 0.012, dark, [-0.01, -L * 1.0, 0.02]),
        ],
        p.id,
      );
    case "thighL":
    case "thighR":
      return merge([limb(scene, L, 0.06 * Math.min(g, 1.4), 0.048 * Math.min(g, 1.4), pants, -1)], p.id);
    case "shinL":
    case "shinR":
      return merge(
        [
          limb(scene, L * 0.9, 0.045 * Math.min(g, 1.4), 0.035 * Math.min(g, 1.4), def.type === "bloater" ? skin : pants, -1),
          box(scene, 0.07, 0.04, 0.13, "#2b2620", [0, -L * 0.95, 0.03]),
        ],
        p.id,
      );
  }
}

/** Shared source meshes per scene. */
export class ZombieFactory {
  private sources = new Map<ZombieType, Mesh[]>();
  private holder: TransformNode;

  constructor(private scene: Scene) {
    this.holder = new TransformNode("zombieSources", scene);
    const mat = toon(scene, "#ffffff");
    for (const t of Object.keys(ZOMBIES) as ZombieType[]) {
      const def = ZOMBIES[t];
      const list = PARTS.map((p) => {
        const m = buildPart(scene, def, p);
        m.material = mat;
        m.parent = this.holder;
        m.position.y = -500; // keep sources out of view (instances need them enabled)
        m.isPickable = false;
        outline(m, 0.012);
        m.alwaysSelectAsActiveMesh = false;
        return m;
      });
      this.sources.set(t, list);
    }
  }

  /** Create a zombie body at unit scale * def.height. */
  create(type: ZombieType): ZombieBody {
    const def = ZOMBIES[type];
    const H = def.height;
    const root = new TransformNode(`z_${type}`, this.scene);
    const joints: TransformNode[] = [];
    const meshes: InstancedMesh[] = [];
    const src = this.sources.get(type)!;
    PARTS.forEach((p, i) => {
      const j = new TransformNode(p.id, this.scene);
      j.parent = p.parent ? joints[PART_INDEX[p.parent]] : root;
      const gx = p.id.startsWith("upperArm") ? Math.max(def.girth, 0.9) : Math.min(def.girth, 1.3);
      j.position.set(p.joint[0] * H * gx, p.joint[1] * H, p.joint[2] * H);
      const inst = src[i].createInstance(`${p.id}_i`);
      inst.parent = j;
      // Instances copy the source transform (parked far below); reset it.
      inst.position.setAll(0);
      inst.rotation.setAll(0);
      inst.scaling.setAll(H);
      inst.isPickable = false;
      joints.push(j);
      meshes.push(inst);
    });
    // Unique silhouette tweaks
    if (type === "climber") joints[0].position.y *= 0.88;
    for (const m of meshes) Shadows.cast(m, false);
    return { root, joints, meshes, def, scale: H };
  }

  dispose(): void {
    this.holder.dispose();
  }
}

/** World-space center of a part (joint + half length along its axis). */
export function partCenter(body: ZombieBody, i: number, out: Vector3): Vector3 {
  const p = PARTS[i];
  const j = body.joints[i];
  Vector3.TransformCoordinatesFromFloatsToRef(0, (p.length / 2) * p.dir * body.scale, 0, j.getWorldMatrix(), out);
  return out;
}
