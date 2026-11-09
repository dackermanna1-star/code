// STUB — to be replaced by the UI builder. Keep the public API.
import type { GameContext, ILevel, ISystem, IVehicle, RunStats } from "../core/types";

export class HUD implements ISystem {
  private el: HTMLDivElement;
  constructor(ctx: GameContext, private vehicle: IVehicle, _level: ILevel, private stats: RunStats, _best: number) {
    this.el = document.createElement("div");
    this.el.style.cssText = "position:absolute;left:12px;top:12px;font:16px monospace";
    ctx.uiRoot.appendChild(this.el);
  }
  update(): void {
    this.el.textContent = `${(this.vehicle.forwardSpeed * 3.6).toFixed(0)} km/h  fuel ${this.vehicle.fuel.toFixed(0)}  ${this.stats.distance.toFixed(0)} m`;
  }
  dispose(): void { this.el.remove(); }
}
