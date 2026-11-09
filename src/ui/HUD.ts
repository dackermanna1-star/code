/**
 * In-run HUD: speed, fuel, boost, health, route progress (checkpoint, evac,
 * best-run ghost), run cash, kill combos, stunt popups, controls hint and
 * end-of-run banners. DOM writes happen only when values change.
 */
import { Time } from "../core/Time";
import type { GameContext, ILevel, ISystem, IVehicle, RunStats } from "../core/types";

function el<K extends keyof HTMLElementTagNameMap>(tag: K, cls: string, parent?: HTMLElement, html = ""): HTMLElementTagNameMap[K] {
  const e = document.createElement(tag);
  e.className = cls;
  if (html) e.innerHTML = html;
  parent?.appendChild(e);
  return e;
}

export class HUD implements ISystem {
  private root: HTMLDivElement;
  private speedNum: HTMLElement;
  private fuelFill: HTMLElement;
  private fuelBox: HTMLElement;
  private boostFill: HTMLElement;
  private boostBox: HTMLElement;
  private hpFill: HTMLElement;
  private progCar: HTMLElement;
  private distText: HTMLElement;
  private cashText: HTMLElement;
  private comboEl: HTMLElement;
  private popups: HTMLElement;
  private banner: HTMLElement;
  private hint: HTMLElement;
  private last: Record<string, string | number> = {};
  private combo = 0;
  private comboTimer = 0;
  private bannerShown = "";
  private unsubs: (() => void)[] = [];
  private shownCash = 0;
  private t = 0;

  constructor(
    ctx: GameContext,
    private vehicle: IVehicle,
    private level: ILevel,
    private stats: RunStats,
    best: number,
  ) {
    const len = level.def.length;
    this.root = el("div", "hud", ctx.uiRoot);

    // Top: route progress.
    const top = el("div", "hud-top", this.root);
    const bar = el("div", "hud-route", top);
    el("div", "hud-route-fill", bar);
    const cp = el("div", "hud-route-mark cp", bar, "<span>⛽</span>");
    cp.style.left = `${(level.def.checkpointAt / len) * 100}%`;
    const evac = el("div", "hud-route-mark evac", bar, "<span>🚁</span>");
    evac.style.left = "100%";
    if (best > 1) {
      const g = el("div", "hud-route-mark ghost", bar, `<span>${Math.floor(best)}m</span>`);
      g.style.left = `${Math.min(100, (best / len) * 100)}%`;
    }
    this.progCar = el("div", "hud-route-car", bar, "🚗");
    this.distText = el("div", "hud-dist", top);

    // Top-right: cash.
    this.cashText = el("div", "hud-cash", this.root, "$0");
    this.comboEl = el("div", "hud-combo", this.root);
    this.popups = el("div", "hud-popups", this.root);

    // Bottom-left: gauges.
    const gauges = el("div", "hud-gauges", this.root);
    const speed = el("div", "hud-speed", gauges);
    this.speedNum = el("div", "hud-speed-num", speed, "0");
    el("div", "hud-speed-unit", speed, "KM/H");
    const meters = el("div", "hud-meters", gauges);
    this.fuelBox = el("div", "hud-meter fuel", meters, `<label>FUEL</label>`);
    this.fuelFill = el("div", "hud-meter-fill", el("div", "hud-meter-track", this.fuelBox));
    this.boostBox = el("div", "hud-meter boost", meters, `<label>BOOST</label>`);
    this.boostFill = el("div", "hud-meter-fill", el("div", "hud-meter-track", this.boostBox));
    if (vehicle.stats.boostCapacity <= 0) this.boostBox.style.display = "none";
    const hp = el("div", "hud-meter hp", meters, `<label>CAR</label>`);
    this.hpFill = el("div", "hud-meter-fill", el("div", "hud-meter-track", hp));

    this.banner = el("div", "hud-banner", this.root);
    this.hint = el(
      "div",
      "hud-hint",
      this.root,
      `<b>W/↑</b> gas · <b>S/↓</b> brake · <b>A/D</b> steer · <b>Shift</b> boost · <b>Space</b> fire<br><small>In the air: W/S pitch · A/D roll</small>`,
    );

    const ev = ctx.events;
    this.unsubs.push(
      ev.on("stunt", (e) => this.popup(`${e.name}`, `+$${e.bonus}`, "stunt")),
      ev.on("zombieHit", (e) => {
        if (!e.killed) return;
        this.combo++;
        this.comboTimer = 1.6;
      }),
      ev.on("survivor", () => this.popup("Survivor rescued!", "+$400", "stunt")),
    );
  }

  private popup(title: string, value: string, cls: string): void {
    const p = el("div", `hud-pop ${cls}`, this.popups, `<span>${title}</span><b>${value}</b>`);
    setTimeout(() => p.remove(), 1600);
  }

  private set(key: string, value: string | number, apply: () => void): void {
    if (this.last[key] === value) return;
    this.last[key] = value;
    apply();
  }

  update(_dt: number): void {
    const dt = Time.realDt;
    this.t += dt;
    const v = this.vehicle;
    const s = this.stats;
    const len = this.level.def.length;

    const kmh = Math.round(Math.hypot(v.velocity.x, v.velocity.z) * 3.6);
    this.set("speed", kmh, () => (this.speedNum.textContent = String(kmh)));

    const fuelPct = Math.max(0, Math.min(100, (v.fuel / v.stats.fuel) * 100));
    const fp = Math.round(fuelPct);
    this.set("fuel", fp, () => {
      this.fuelFill.style.transform = `scaleX(${fp / 100})`;
      this.fuelBox.classList.toggle("low", fp < 22 && fp > 0);
      this.fuelBox.classList.toggle("empty", fp <= 0);
    });
    if (v.stats.boostCapacity > 0) {
      const bp = Math.round((v.boost / v.stats.boostCapacity) * 100);
      this.set("boost", bp, () => (this.boostFill.style.transform = `scaleX(${Math.max(0, bp) / 100})`));
    }
    const hp = Math.round(Math.max(0, (v.health / v.stats.health) * 100));
    this.set("hp", hp, () => {
      this.hpFill.style.transform = `scaleX(${hp / 100})`;
      this.hpFill.parentElement!.parentElement!.classList.toggle("low", hp < 30);
    });

    const prog = Math.min(1, s.distance / len);
    const pp = Math.round(prog * 1000);
    this.set("prog", pp, () => (this.progCar.style.left = `${pp / 10}%`));
    const left = Math.max(0, Math.ceil(len - s.distance));
    this.set("dist", left, () => (this.distText.textContent = left > 0 ? `${left} m to evac` : "EVAC!"));

    // Cash ticks up smoothly.
    const cash = Math.round(s.killCash + s.stuntCash);
    if (this.shownCash < cash) this.shownCash = Math.min(cash, this.shownCash + Math.max(1, (cash - this.shownCash) * dt * 8));
    const shown = Math.floor(this.shownCash);
    this.set("cash", shown, () => {
      this.cashText.textContent = `$${shown}`;
      this.cashText.classList.remove("bump");
      void this.cashText.offsetWidth;
      this.cashText.classList.add("bump");
    });

    // Combo.
    this.comboTimer -= dt;
    if (this.comboTimer <= 0) this.combo = 0;
    const combo = this.combo >= 2 ? this.combo : 0;
    this.set("combo", combo, () => {
      this.comboEl.textContent = combo ? `${combo}× SMASH!` : "";
      this.comboEl.classList.remove("bump");
      void this.comboEl.offsetWidth;
      if (combo) this.comboEl.classList.add("bump");
    });

    // Banners.
    let banner = "";
    if (s.distance >= len) banner = "EVAC REACHED!";
    else if (v.wrecked) banner = "WRECKED!";
    else if (v.fuel <= 0) banner = "OUT OF FUEL";
    if (banner !== this.bannerShown) {
      this.bannerShown = banner;
      this.banner.textContent = banner;
      this.banner.className = `hud-banner ${banner ? "show" : ""} ${banner === "EVAC REACHED!" ? "good" : ""}`;
    }

    if (this.t > 7 || s.distance > 60) this.hint.classList.add("hide");
  }

  dispose(): void {
    for (const u of this.unsubs) u();
    this.root.remove();
  }
}
