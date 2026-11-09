/**
 * End-of-run results: headline, animated payout lines with count-up,
 * new-record banner, run stats, and Garage / Retry.
 */
import { audio } from "../audio/Audio";
import type { Payout } from "../core/Economy";
import type { RunEndReason } from "../core/Events";
import type { GameContext, RunStats } from "../core/types";

export interface ResultsData {
  reason: RunEndReason;
  stats: RunStats;
  payout: Payout;
  level: number;
}

const HEADLINES: Record<RunEndReason, [string, string]> = {
  fuel: ["OUT OF FUEL", "The tank's dry. Upgrade and go again."],
  wrecked: ["WRECKED!", "That's going to need more than duct tape."],
  evac: ["YOU MADE IT OUT!", "The chopper's waiting. Next stop: worse."],
};

export class ResultsScreen {
  private root: HTMLDivElement;
  private lines: HTMLElement[] = [];
  private amounts: number[] = [];
  private t = 0;
  private revealed = 0;
  private totalEl: HTMLElement;
  private shownTotal = 0;
  private keyHandler: (e: KeyboardEvent) => void;

  constructor(
    private ctx: GameContext,
    data: ResultsData,
    private actions: { onGarage: () => void; onRetry: () => void },
  ) {
    const [title, sub] = HEADLINES[data.reason];
    const s = data.stats;
    this.root = document.createElement("div");
    this.root.className = `results ${data.reason}`;
    this.root.innerHTML = `
      <div class="panel results-card">
        <h1>${title}</h1>
        <p class="sub">${sub}</p>
        ${data.payout.newRecord ? `<div class="record">NEW RECORD!</div>` : ""}
        <div class="pay-lines">${data.payout.lines
          .map((l) => `<div class="pay-line"><span>${l.label}</span><b>+$${l.amount.toLocaleString()}</b></div>`)
          .join("")}</div>
        <div class="pay-total"><span>TOTAL</span><b class="total">$0</b></div>
        <div class="run-stats">
          <div><b>${Math.floor(s.distance)} m</b><span>distance</span></div>
          <div><b>${s.kills}</b><span>zombies</span></div>
          <div><b>${Math.round(s.topSpeed * 3.6)}</b><span>top km/h</span></div>
          <div><b>${s.airTime.toFixed(1)}s</b><span>air time</span></div>
          <div><b>${s.flips}</b><span>flips</span></div>
        </div>
        <div class="bank">Bank: <b>$${ctx.save.data.cash.toLocaleString()}</b></div>
        <div class="results-btns">
          <button class="ghost" data-act="retry">RETRY <small>R</small></button>
          <button class="launch" data-act="garage">GARAGE <small>↵</small></button>
        </div>
      </div>`;
    ctx.uiRoot.appendChild(this.root);
    this.lines = [...this.root.querySelectorAll<HTMLElement>(".pay-line")];
    this.amounts = data.payout.lines.map((l) => l.amount);
    this.totalEl = this.root.querySelector(".total")!;
    this.root.querySelector('[data-act="garage"]')!.addEventListener("click", () => this.go("garage"));
    this.root.querySelector('[data-act="retry"]')!.addEventListener("click", () => this.go("retry"));
    this.keyHandler = (e) => {
      if (e.code === "Enter") this.go("garage");
      if (e.code === "KeyR") this.go("retry");
    };
    // Avoid an Enter held from driving instantly skipping the screen.
    setTimeout(() => window.addEventListener("keydown", this.keyHandler), 600);
  }

  private go(where: "garage" | "retry"): void {
    audio.ui("click");
    if (where === "garage") this.actions.onGarage();
    else this.actions.onRetry();
  }

  update(_dt: number): void {
    this.t += this.ctx.engine.getDeltaTime() / 1000;
    const due = Math.floor((this.t - 0.5) / 0.35) + 1;
    while (this.revealed < Math.min(due, this.lines.length)) {
      this.lines[this.revealed].classList.add("in");
      audio.ui("cash");
      this.revealed++;
    }
    const target = this.amounts.slice(0, this.revealed).reduce((a, b) => a + b, 0);
    if (this.shownTotal < target) {
      this.shownTotal = Math.min(target, this.shownTotal + Math.max(7, (target - this.shownTotal) * 0.12));
      this.totalEl.textContent = `$${Math.floor(this.shownTotal).toLocaleString()}`;
    }
  }

  dispose(): void {
    window.removeEventListener("keydown", this.keyHandler);
    this.root.remove();
  }
}
