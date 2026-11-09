// STUB — to be replaced by the UI builder. Keep the public API.
import type { Payout } from "../core/Economy";
import type { RunEndReason } from "../core/Events";
import type { GameContext, RunStats } from "../core/types";

export interface ResultsData { reason: RunEndReason; stats: RunStats; payout: Payout; level: number }

export class ResultsScreen {
  private el: HTMLDivElement;
  constructor(ctx: GameContext, data: ResultsData, actions: { onGarage: () => void; onRetry: () => void }) {
    this.el = document.createElement("div");
    this.el.innerHTML = `<div style="position:absolute;left:40%;top:30%;font-size:24px">+$${data.payout.total} <button>Garage</button></div>`;
    this.el.querySelector("button")!.onclick = actions.onGarage;
    ctx.uiRoot.appendChild(this.el);
  }
  update(_dt: number): void {}
  dispose(): void { this.el.remove(); }
}
