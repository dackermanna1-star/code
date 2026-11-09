// STUB — to be replaced by the World builder. Keep the public API.
import { DirectionalLight, HemisphericLight, MeshBuilder, PhysicsAggregate, PhysicsShapeType, Vector3, type Mesh } from "@babylonjs/core";
import type { LevelDef } from "../data/levels";
import { toon } from "../fx/Materials";
import type { GameContext, ILevel } from "../core/types";

export class Level implements ILevel {
  readonly spawn = { position: new Vector3(0, 1.5, 0), yaw: 0 };
  readonly sun: DirectionalLight;
  private ground: Mesh;
  constructor(private ctx: GameContext, readonly def: LevelDef) {
    const s = ctx.scene;
    new HemisphericLight("hemi", new Vector3(0, 1, 0), s).intensity = 0.7;
    this.sun = new DirectionalLight("sun", new Vector3(-0.4, -1, 0.5), s);
    this.ground = MeshBuilder.CreateBox("ground", { width: 40, height: 1, depth: def.length + 400 }, s);
    this.ground.position.set(0, -0.5, def.length / 2);
    this.ground.material = toon(s, def.palette.road);
    new PhysicsAggregate(this.ground, PhysicsShapeType.BOX, { mass: 0, friction: 0.9 }, s);
  }
  heightAt(_x: number, _z: number): number { return 0; }
  roadHalfWidth(_z: number): number { return 6; }
  roadCenterX(_z: number): number { return 0; }
  update(_dt: number, _carPos: Vector3): void {}
  dispose(): void { void this.ctx; }
}
