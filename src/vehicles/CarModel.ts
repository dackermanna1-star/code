// STUB — to be replaced by the Vehicle builder. Keep the public API.
import { MeshBuilder, TransformNode, type AbstractMesh, type Scene } from "@babylonjs/core";
import type { CarDef } from "../data/cars";
import type { Loadout } from "../data/parts";
import { toon } from "../fx/Materials";

/** Pure visual model of a car (no physics). Used by Vehicle and the garage preview. */
export interface CarModel {
  root: TransformNode;
  /** Body mesh(es) parent; origin = chassis center. */
  body: TransformNode;
  /** Wheel pivots in order FL, FR, RL, RR (spin about local X, steer about local Y). */
  wheels: TransformNode[];
  /** Set visual damage 0..1 (dents, missing panels, smoke anchor). */
  setDamage(level: number): void;
  /** Detach a random loose panel as a separate mesh for physics debris, or null. */
  detachPanel(): AbstractMesh | null;
  dispose(): void;
}

export function buildCarModel(scene: Scene, def: CarDef, _loadout: Loadout): CarModel {
  const root = new TransformNode(`car_${def.id}`, scene);
  const body = new TransformNode("body", scene);
  body.parent = root;
  const box = MeshBuilder.CreateBox("chassisVis", { width: def.size.width, height: def.size.height, depth: def.size.length }, scene);
  box.material = toon(scene, def.colors.body);
  box.parent = body;
  const wheels: TransformNode[] = [];
  for (let i = 0; i < 4; i++) {
    const w = new TransformNode(`wheel${i}`, scene);
    w.parent = root;
    const m = MeshBuilder.CreateCylinder("w", { diameter: def.wheelRadius * 2, height: 0.3 }, scene);
    m.rotation.z = Math.PI / 2;
    m.parent = w;
    m.material = toon(scene, "#222222");
    w.position.set((i % 2 ? 1 : -1) * def.track / 2, -def.size.height / 2, (i < 2 ? 1 : -1) * def.wheelBase / 2);
    wheels.push(w);
  }
  return { root, body, wheels, setDamage() {}, detachPanel: () => null, dispose: () => root.dispose() };
}
