// STUB — to be replaced by the Camera builder. Keep the public API.
import { UniversalCamera, Vector3 } from "@babylonjs/core";
import type { GameContext, ISystem, IVehicle } from "../core/types";

export class CameraRig implements ISystem {
  readonly camera: UniversalCamera;
  constructor(ctx: GameContext, private vehicle: IVehicle) {
    this.camera = new UniversalCamera("chaseCam", vehicle.position.add(new Vector3(0, 4, -10)), ctx.scene);
    this.camera.minZ = 0.1;
    this.camera.maxZ = 1500;
    ctx.scene.activeCamera = this.camera;
  }
  update(): void {
    this.camera.position.copyFrom(this.vehicle.position.add(new Vector3(0, 4, -10)));
    this.camera.setTarget(this.vehicle.position);
  }
  dispose(): void { this.camera.dispose(); }
}
