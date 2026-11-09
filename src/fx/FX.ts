// STUB — to be replaced by the FX builder. Keep the public API.
import type { Camera } from "@babylonjs/core";
import type { GameContext, ISystem, IVehicle } from "../core/types";

export class FX implements ISystem {
  constructor(_ctx: GameContext, _vehicle: IVehicle, _camera: Camera) {}
  update(): void {}
  dispose(): void {}
}
