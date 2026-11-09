// STUB — to be replaced by the Audio builder. Keep the public API.
import type { Save } from "../core/Save";
import type { IVehicle } from "../core/types";

export type AudioMode = "garage" | "run" | "results";

class AudioSystem {
  /** Called once at boot so audio can read volume settings. */
  configure(_save: Save): void {}
  attachVehicle(_v: IVehicle): void {}
  detachVehicle(): void {}
  setMode(_m: AudioMode): void {}
  update(_dt: number): void {}
  /** UI click / cash sounds for menus. */
  ui(_sound: "click" | "buy" | "deny" | "cash" | "launch"): void {}
}

export const audio = new AudioSystem();
