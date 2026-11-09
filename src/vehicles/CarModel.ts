/**
 * Pure visual model of a car (no physics): body, wheels, loadout bolt-ons,
 * anchors and progressive damage. Used by Vehicle and by the garage preview.
 *
 * Origin = center of def.size (the physics chassis center), +Z forward.
 */
import {
  Mesh,
  MeshBuilder,
  TransformNode,
  VertexBuffer,
  type AbstractMesh,
  type InstancedMesh,
  type Scene,
} from "@babylonjs/core";
import type { CarDef } from "../data/cars";
import { computeStats, type CarStats, type Loadout } from "../data/parts";
import { shade } from "../fx/Materials";
import { wheelGeometry, type WheelGeometry } from "./CarGeometry";
import { BODIES, type Box3, type CarFrame } from "./CarBodies";
import { addArmor, addBooster, addFuel, addWeaponMount, buildWheel } from "./CarParts";
import { crackMaterial, Kit, type V3 } from "./ModelKit";

/** Pure visual model of a car (no physics). Used by Vehicle and the garage preview. */
export interface CarModel {
  root: TransformNode;
  /** Body mesh(es) parent; origin = chassis center. */
  body: TransformNode;
  /** Wheel pivots in order FL, FR, RL, RR (spin about local X, steer about local Y). */
  wheels: TransformNode[];
  /** Spinning child of each wheel pivot. */
  wheelSpin: TransformNode[];
  /** Effect / weapon anchors (children of `body`). */
  anchors: { smoke: TransformNode; boost: TransformNode; weapon: TransformNode; exhaust: TransformNode };
  /** Suspension / wheel geometry shared with the physics. */
  geometry: WheelGeometry;
  /** Where things bolt on (roof, hood, windows...). */
  frame: CarFrame;
  /** Physics collision boxes (chassis-local). */
  collision: Box3[];
  /** Every renderable mesh of the car (for shadows / visibility). */
  meshes: AbstractMesh[];
  /** Pose wheel i: suspension length (m), steer angle (rad), spin angle (rad). */
  setWheel(i: number, suspensionLength: number, steer: number, spin: number): void;
  /** Set visual damage 0..1 (dents, missing panels, smoke anchor). */
  setDamage(level: number): void;
  /** Detach a random loose panel as a separate mesh for physics debris, or null. */
  detachPanel(): AbstractMesh | null;
  dispose(): void;
}

interface Panel {
  name: string;
  threshold: number;
  mesh: Mesh;
  state: "attached" | "pending" | "detached";
}

/** Tiny deterministic RNG so dents look the same every run. */
function rng(seed: number): () => number {
  let s = seed % 2147483647 || 1;
  return () => (s = (s * 16807) % 2147483647) / 2147483647;
}

/** Re-center a merged mesh's geometry on its bounding box so it tumbles about its middle. */
function recenter(m: Mesh): void {
  const pos = m.getVerticesData(VertexBuffer.PositionKind);
  if (!pos) return;
  m.refreshBoundingInfo();
  const c = m.getBoundingInfo().boundingBox.center.clone();
  for (let i = 0; i < pos.length; i += 3) {
    pos[i] -= c.x;
    pos[i + 1] -= c.y;
    pos[i + 2] -= c.z;
  }
  m.setVerticesData(VertexBuffer.PositionKind, pos);
  m.refreshBoundingInfo();
  m.position.addInPlace(c);
}

export function buildCarModel(scene: Scene, def: CarDef, loadout: Loadout, stats?: CarStats): CarModel {
  const st = stats ?? computeStats(def, loadout);
  const geo = wheelGeometry(def, st.wheelRadius, loadout.tires);
  const root = new TransformNode(`car_${def.id}`, scene);
  const body = new TransformNode("body", scene);
  body.parent = root;

  // --- body + detachable panels --------------------------------------------
  const kit = new Kit(scene);
  const panelKits: { name: string; threshold: number; kit: Kit }[] = [];
  const frame = BODIES[def.id]({
    kit,
    def,
    wg: geo,
    panel(name, threshold) {
      const k = new Kit(scene);
      panelKits.push({ name, threshold, kit: k });
      return k;
    },
  });

  // --- loadout bolt-ons (merged with the body) -------------------------------
  addArmor(kit, frame, loadout.armor);
  addFuel(kit, frame, loadout.fuel, geo);
  const nozzle = addBooster(kit, frame, loadout.booster, def);
  const weaponAt = addWeaponMount(kit, frame, loadout.weapon);

  const meshes: AbstractMesh[] = [];
  meshes.push(...kit.build(body, "carBody", true, 0.03));

  const panels: Panel[] = [];
  for (const p of panelKits) {
    // One mesh per material (multi-material meshes and the ink outline don't
    // mix well); the biggest part is the root the others ride on.
    const parts = p.kit.build(body, `panel_${p.name}`, true, 0.025);
    if (!parts.length) continue;
    parts.sort((a, b) => b.getTotalVertices() - a.getTotalVertices());
    const m = parts[0];
    recenter(m);
    for (let i = 1; i < parts.length; i++) parts[i].setParent(m);
    panels.push({ name: p.name, threshold: p.threshold, mesh: m, state: "attached" });
    meshes.push(...parts);
  }

  // --- damage layers: dents, scorch, cracked glass ---------------------------
  const R = rng(def.id.length * 977 + def.mass);
  const dentKits = [new Kit(scene), new Kit(scene), new Kit(scene)];
  const dentThresholds = [0.15, 0.4, 0.68];
  const dentCol = shade(def.colors.body, -0.32);
  const s = frame.side;
  dentKits.forEach((dk, g) => {
    const count = 3 + g;
    for (let i = 0; i < count; i++) {
      const sx = R() < 0.5 ? -1 : 1;
      const z = s.z0 + R() * (s.z1 - s.z0);
      const y = s.y0 + 0.06 + R() * Math.max(0.01, s.y1 - s.y0 - 0.12);
      const h = 0.1 + R() * 0.16;
      const d = 0.16 + R() * 0.26;
      dk.box(dentCol, [0.025, h, d], [sx * (s.x + 0.045), y, z], [(R() - 0.5) * 0.8, 0, 0]);
    }
    // a dent / scrape on the hood
    const t = 0.15 + R() * 0.55;
    dk.slab(dentCol, frame.hood.p0, frame.hood.p1, 0.25 + R() * 0.3, 0.012, (R() - 0.5) * frame.hood.halfW, 0.06, t, t + 0.15);
    if (g === 2) {
      // scorch + bare-metal scratches
      for (let i = 0; i < 3; i++) {
        const sx = R() < 0.5 ? -1 : 1;
        dk.box("#2a2321", [0.02, 0.18 + R() * 0.2, 0.3 + R() * 0.3], [sx * (s.x + 0.05), s.y0 + R() * (s.y1 - s.y0), s.z0 + R() * (s.z1 - s.z0)]);
        dk.box("#b9b7ae", [0.02, 0.025, 0.5], [sx * (s.x + 0.052), s.y0 + R() * (s.y1 - s.y0), s.z0 + R() * (s.z1 - s.z0)], [0.25 * (R() - 0.5), 0, 0]);
      }
    }
  });
  const dentMeshes = dentKits.map((dk, i) => {
    const ms = dk.build(body, `dents${i}`, false);
    for (const m of ms) m.setEnabled(false);
    meshes.push(...ms);
    return ms;
  });

  const cracks: Mesh[] = [];
  {
    const ws = frame.windshield;
    const dz = ws.top[0] - ws.bottom[0];
    const dy = ws.top[1] - ws.bottom[1];
    const len = Math.hypot(dz, dy);
    let nz = -dy / len;
    let ny = dz / len;
    if (ny < 0 || (Math.abs(ny) < 1e-3 && nz < 0)) {
      nz = -nz;
      ny = -ny;
    }
    // windshield faces forward: make sure the normal points to +Z
    if (nz < 0) {
      nz = -nz;
      ny = -ny;
    }
    for (const heavy of [false, true]) {
      const p = MeshBuilder.CreatePlane("crack", { width: 2 * ws.halfW * 0.94, height: len * 0.9 }, scene);
      p.material = crackMaterial(scene, heavy);
      p.parent = body;
      p.position.set(0, (ws.bottom[1] + ws.top[1]) / 2 + ny * (0.05 + (heavy ? 0.005 : 0)), (ws.bottom[0] + ws.top[0]) / 2 + nz * (0.05 + (heavy ? 0.005 : 0)));
      p.rotation.x = Math.atan2(dz, dy);
      p.isPickable = false;
      p.setEnabled(false);
      cracks.push(p);
    }
  }

  // --- wheels -----------------------------------------------------------------
  const wheelSrc = buildWheel(new Kit(scene), geo, loadout.tires, def);
  const wheels: TransformNode[] = [];
  const wheelSpin: TransformNode[] = [];
  for (let i = 0; i < 4; i++) {
    const m = geo.mounts[i];
    const pivot = new TransformNode(`wheelPivot${i}`, scene);
    pivot.parent = root;
    pivot.position.set(m.x, m.y - geo.restLength, m.z);
    const spin = new TransformNode(`wheelSpin${i}`, scene);
    spin.parent = pivot;
    if (wheelSrc) {
      const w: Mesh | InstancedMesh = i === 0 ? wheelSrc : wheelSrc.createInstance(`wheel${i}`);
      w.parent = spin;
      w.isPickable = false;
      // the hub faces +X on the source; left wheels get turned around
      if (m.x < 0) w.rotation.y = Math.PI;
      meshes.push(w);
    }
    wheels.push(pivot);
    wheelSpin.push(spin);
  }

  // --- anchors ------------------------------------------------------------------
  const anchor = (name: string, p: V3) => {
    const t = new TransformNode(name, scene);
    t.parent = body;
    t.position.set(p[0], p[1], p[2]);
    return t;
  };
  const anchors = {
    smoke: anchor("anchorSmoke", frame.smoke),
    boost: anchor("anchorBoost", nozzle),
    weapon: anchor("anchorWeapon", weaponAt),
    exhaust: anchor("anchorExhaust", frame.exhaust),
  };

  let lastDamage = 0;
  const model: CarModel = {
    root,
    body,
    wheels,
    wheelSpin,
    anchors,
    geometry: geo,
    frame,
    collision: frame.collision,
    meshes,
    setWheel(i, len, steer, spinAngle) {
      const p = wheels[i];
      p.position.y = geo.mountY - len;
      p.rotation.y = steer;
      wheelSpin[i].rotation.x = spinAngle;
    },
    setDamage(level) {
      level = Math.max(0, Math.min(1, level));
      dentMeshes.forEach((ms, i) => {
        const on = level >= dentThresholds[i];
        for (const m of ms) m.setEnabled(on);
      });
      cracks[0].setEnabled(level >= 0.28 && level < 0.6);
      cracks[1].setEnabled(level >= 0.6);
      for (const p of panels) {
        if (p.state === "attached" && level >= p.threshold && level > lastDamage) p.state = "pending";
        else if (p.state === "pending" && level < p.threshold) p.state = "attached";
      }
      lastDamage = level;
    },
    detachPanel() {
      const p = panels.find((x) => x.state === "pending");
      if (!p) return null;
      p.state = "detached";
      p.mesh.computeWorldMatrix(true);
      p.mesh.setParent(null);
      for (const m of [p.mesh, ...p.mesh.getChildMeshes()]) {
        const idx = meshes.indexOf(m);
        if (idx >= 0) meshes.splice(idx, 1);
      }
      return p.mesh;
    },
    dispose() {
      root.dispose(false, false);
      for (const p of panels) if (p.state === "detached" && !p.mesh.isDisposed()) p.mesh.dispose();
    },
  };
  return model;
}

export type { Box3, CarFrame };
