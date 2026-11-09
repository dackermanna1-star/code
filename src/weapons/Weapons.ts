// STUB — to be replaced by the Weapons builder. Keep the public API.
import type { GameContext, ISystem, IVehicle, IZombies } from "../core/types";

export class Weapons implements ISystem {
  ammo = 0;
  maxAmmo = 0;
  constructor(_ctx: GameContext, _vehicle: IVehicle, _zombies: IZombies) {}
  update(): void {}
  dispose(): void {}
}
