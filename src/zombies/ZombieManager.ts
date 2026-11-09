// STUB — to be replaced by the Zombie builder. Keep the public API.
import type { Vector3 } from "@babylonjs/core";
import type { GameContext, ILevel, ITarget, IVehicle, IZombies } from "../core/types";

export class ZombieManager implements IZombies {
  aliveCount = 0;
  constructor(_ctx: GameContext, _level: ILevel, _vehicle: IVehicle) {}
  targetsNear(_from: Vector3, _range: number): ITarget[] { return []; }
  explode(_c: Vector3, _r: number, _p: number): void {}
  update(): void {}
  dispose(): void {}
}
