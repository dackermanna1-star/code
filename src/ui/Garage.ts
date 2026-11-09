// STUB — to be replaced by the UI builder. Keep the public API.
import type { GameContext } from "../core/types";

export class GarageScreen {
  private el: HTMLDivElement;
  constructor(ctx: GameContext, onLaunch: (levelIndex: number) => void) {
    this.el = document.createElement("div");
    this.el.innerHTML = `<button style="position:absolute;left:50%;top:50%;font-size:32px">LAUNCH</button>`;
    this.el.querySelector("button")!.onclick = () => onLaunch(ctx.save.data.selectedLevel);
    ctx.uiRoot.appendChild(this.el);
  }
  update(_dt: number): void {}
  dispose(): void { this.el.remove(); }
}
