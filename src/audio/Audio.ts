// STUB — to be replaced by the Audio builder. Keep the public API.
import type { IVehicle } from "../core/types";

export type AudioMode = "garage" | "run" | "results";

class AudioSystem {
  attachVehicle(_v: IVehicle): void {}
  detachVehicle(): void {}
  setMode(_m: AudioMode): void {}
  update(_dt: number): void {}
  /** UI click / cash sounds for menus. */
  ui(_sound: "click" | "buy" | "deny" | "cash" | "launch"): void {}
}

export const audio = new AudioSystem();
