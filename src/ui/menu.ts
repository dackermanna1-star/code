// Start screen, pause menu (settings / controls / credits) and the loading bar.
// Pure DOM; the HUD (hud.ts) owns the game-state logic (pointer lock, time scale, input enable)
// and passes callbacks in.

import type { QualityLevel, Settings, SettingsData } from "../core/settings.ts";
import { esc, h, setClass, setText } from "./dom.ts";

/** Key → action summary (shared by the start screen and the pause menu). */
export const CONTROLS: ReadonlyArray<readonly [string, string]> = [
  ["W A S D", "Move"],
  ["Mouse", "Look"],
  ["Space", "Jump"],
  ["Shift", "Sprint"],
  ["C / Ctrl", "Crouch"],
  ["LMB", "Swing — hold to charge"],
  ["RMB", "Grab / drop"],
  ["LMB (holding)", "Throw — hold to charge"],
  ["F (holding)", "Slam held object"],
  ["R + Mouse", "Rotate held object"],
  ["Wheel", "Hold distance / cycle tools"],
  ["V / MMB", "Pry (crowbar) · Spray (extinguisher)"],
  ["E", "Use — doors, drawers, switches, TV, taps"],
  ["F", "Kick"],
  ["G", "Stomp"],
  ["1 – 7", "Select tool"],
  ["Q", "Drop / holster"],
  ["Esc", "Pause"],
  ["F3", "Debug overlay"],
];

type RowDef =
  | { kind: "slider"; key: NumKey; label: string; min: number; max: number; step: number; fmt: (v: number) => string }
  | { kind: "toggle"; key: BoolKey; label: string }
  | { kind: "choice"; key: "quality"; label: string; options: ReadonlyArray<readonly [QualityLevel, string]> }
  | { kind: "heading"; label: string };

type NumKey = { [K in keyof SettingsData]: SettingsData[K] extends number ? K : never }[keyof SettingsData];
type BoolKey = { [K in keyof SettingsData]: SettingsData[K] extends boolean ? K : never }[keyof SettingsData];

const pct = (v: number) => `${Math.round(v * 100)}%`;
const QUALITY_OPTS: ReadonlyArray<readonly [QualityLevel, string]> = [
  ["low", "Low"],
  ["medium", "Med"],
  ["high", "High"],
  ["ultra", "Ultra"],
];

const SETTINGS_ROWS: readonly RowDef[] = [
  { kind: "heading", label: "Mouse" },
  { kind: "slider", key: "mouseSensitivity", label: "Sensitivity", min: 0.1, max: 4, step: 0.05, fmt: (v) => v.toFixed(2) },
  { kind: "toggle", key: "invertY", label: "Invert Y" },
  { kind: "heading", label: "Video" },
  { kind: "slider", key: "fov", label: "Field of view", min: 55, max: 100, step: 1, fmt: (v) => `${Math.round(v)}°` },
  { kind: "choice", key: "quality", label: "Quality", options: QUALITY_OPTS },
  { kind: "toggle", key: "ps2Mode", label: "PS2 mode" },
  { kind: "slider", key: "cameraShake", label: "Camera shake", min: 0, max: 1, step: 0.05, fmt: pct },
  { kind: "heading", label: "Audio" },
  { kind: "slider", key: "masterVolume", label: "Master volume", min: 0, max: 1, step: 0.01, fmt: pct },
  { kind: "slider", key: "sfxVolume", label: "Effects volume", min: 0, max: 1, step: 0.01, fmt: pct },
  { kind: "slider", key: "ambienceVolume", label: "Ambience volume", min: 0, max: 1, step: 0.01, fmt: pct },
  { kind: "heading", label: "Gameplay & HUD" },
  { kind: "toggle", key: "hitStop", label: "Hit-stop" },
  { kind: "toggle", key: "showStats", label: "Show stats" },
  { kind: "toggle", key: "showHints", label: "Show hints" },
  { kind: "toggle", key: "showTargetInfo", label: "Show target info" },
];

const START_ROWS: readonly RowDef[] = [
  { kind: "choice", key: "quality", label: "Quality", options: QUALITY_OPTS },
  { kind: "toggle", key: "ps2Mode", label: "PS2 mode" },
  { kind: "slider", key: "mouseSensitivity", label: "Sensitivity", min: 0.1, max: 4, step: 0.05, fmt: (v) => v.toFixed(2) },
];

const FALLBACK_CREDITS = [
  "Textures: ambientCG.com photo materials (CC0 1.0), downsampled to 256 px; procedural textures generated in-game.",
  "Sounds: Kenney.nl and OpenGameArt.org contributors (CC0 1.0), layered with sounds synthesised at startup.",
  "Engine: Babylon.js (Apache-2.0) with the Havok physics plugin (MIT).",
];

export interface MenuCallbacks {
  /** Start screen PLAY (user gesture). */
  onPlay(): void;
  /** Pause menu RESUME (user gesture). */
  onResume(): void;
  /** A setting was changed by the user. */
  onSetting<K extends keyof SettingsData>(key: K, value: SettingsData[K]): void;
}

type Pane = "settings" | "controls" | "credits";

export class Menus {
  readonly start: HTMLDivElement;
  readonly pause: HTMLDivElement;

  private readonly settings: Settings;
  private readonly cb: MenuCallbacks;
  private readonly syncers: Array<() => void> = [];
  private readonly playBtn: HTMLButtonElement;
  private readonly loading: HTMLDivElement;
  private readonly loadingLabel: HTMLDivElement;
  private readonly loadingFill: HTMLDivElement;
  private readonly startMsg: HTMLDivElement;
  private readonly pauseMsg: HTMLDivElement;
  private readonly pauseBill: HTMLElement;
  private readonly panes: Record<Pane, HTMLElement>;
  private readonly navButtons: Record<Pane, HTMLButtonElement>;
  private readonly startCredits: HTMLDivElement;
  private creditsLoaded = false;
  private ready = false;

  constructor(parent: HTMLElement, settings: Settings, cb: MenuCallbacks) {
    this.settings = settings;
    this.cb = cb;

    // ---------------------------------------------------------- start screen
    this.playBtn = h("button.ads-play", { type: "button", disabled: true, onclick: () => this.ready && cb.onPlay() }, "Loading…");
    this.loadingFill = h("div");
    this.loadingLabel = h("div.ads-loading-label", null, "Starting engine…");
    this.loading = h("div.ads-loading", null, this.loadingLabel, h("div.ads-loading-bar", null, this.loadingFill));
    this.startMsg = h("div.ads-msg");
    this.startCredits = h("div.ads-panel", { style: { display: "none", maxHeight: "34vh", overflowY: "auto" } });
    const creditsBtn = h("button.ads-link", { type: "button", onclick: () => this.toggleStartCredits() }, "Credits & licences");
    this.start = h(
      "div.ads-overlay.ads-start",
      null,
      h(
        "div.ads-start-inner",
        null,
        h(
          "div.ads-title-block",
          null,
          h("h1.ads-title", null, "Apartment", h("span", null, "Destruction Sim")),
          h("div.ads-title-stripe"),
          h("div.ads-tagline", null, "Unit 31C · two bedrooms · everything breaks"),
        ),
        h(
          "div.ads-start-left",
          null,
          this.loading,
          this.playBtn,
          this.startMsg,
          h("div.ads-panel", null, h("h3", null, "Controls"), this.controlsList(true)),
        ),
        h(
          "div.ads-start-right",
          null,
          h("div.ads-panel", null, h("h3", null, "Options"), this.rows(START_ROWS)),
          this.startCredits,
        ),
        h(
          "div.ads-credits-line",
          null,
          h("span", null, "CC0 textures from ambientCG · CC0 sounds from Kenney & OpenGameArt · Babylon.js + Havok"),
          creditsBtn,
        ),
      ),
    );
    // Clicking anywhere on the start screen background also starts the game (once loaded).
    this.start.addEventListener("click", (e) => {
      const t = e.target as HTMLElement;
      if (!this.ready || t.closest("button, input, .ads-panel, a")) return;
      cb.onPlay();
    });

    // ---------------------------------------------------------- pause menu
    this.pauseMsg = h("div.ads-msg");
    this.pauseBill = h("span.ads-bill-mini", null, "Repair bill ", h("b", null, "$0"));
    const settingsPane = h("div", null, this.rows(SETTINGS_ROWS), h("div.ads-pane-hint", null, "Settings are saved in this browser."));
    const controlsPane = h("div", null, this.controlsList(false));
    const creditsPane = h("div.ads-credits", null, h("ul", null, ...FALLBACK_CREDITS.map((c) => h("li", null, c))));
    this.panes = { settings: settingsPane, controls: controlsPane, credits: creditsPane };
    const nav = (p: Pane, label: string) =>
      h("button", { type: "button", onclick: () => this.showPane(p) }, label) as HTMLButtonElement;
    this.navButtons = { settings: nav("settings", "Settings"), controls: nav("controls", "Controls"), credits: nav("credits", "Credits") };
    const resume = h("button.ads-resume", { type: "button", onclick: () => cb.onResume() }, "Resume");
    const pane = h("div.ads-pane", null, settingsPane, controlsPane, creditsPane, this.pauseMsg);
    const box = h(
      "div.ads-pause-box",
      null,
      h("div.ads-pause-head", null, h("h2", null, "Paused"), this.pauseBill),
      h("div.ads-nav", null, resume, this.navButtons.settings, this.navButtons.controls, this.navButtons.credits),
      pane,
    );
    this.pause = h("div.ads-overlay.ads-pause", null, box);
    // click outside the box resumes
    this.pause.addEventListener("click", (e) => {
      if (!box.contains(e.target as Node)) cb.onResume();
    });
    this.showPane("settings");

    parent.appendChild(this.start);
    parent.appendChild(this.pause);
    this.refresh();
  }

  // ------------------------------------------------------------------ API
  showStart(on: boolean): void {
    setClass(this.start, "ads-on", on);
  }

  showPause(on: boolean): void {
    setClass(this.pause, "ads-on", on);
    if (on) {
      this.refresh();
      this.pauseMsg.textContent = "";
    }
  }

  setLoading(progress: number, label: string): void {
    const p = Number.isFinite(progress) ? Math.max(0, Math.min(1, progress)) : 0;
    this.loadingFill.style.width = `${(p * 100).toFixed(1)}%`;
    setText(this.loadingLabel, label || "Loading…");
    setClass(this.loading, "ads-done", false);
  }

  /** Loading finished: enable PLAY. */
  loadingDone(): void {
    this.ready = true;
    setClass(this.loading, "ads-done", true);
    this.playBtn.disabled = false;
    this.playBtn.textContent = "Click to play";
  }

  get isReady(): boolean {
    return this.ready;
  }

  setStartMessage(text: string): void {
    setText(this.startMsg, text);
  }

  setPauseMessage(text: string): void {
    setText(this.pauseMsg, text);
  }

  setPauseBill(text: string): void {
    const b = this.pauseBill.querySelector("b");
    if (b) setText(b, text);
  }

  /** Re-sync every control from the settings (after external changes). */
  refresh(): void {
    for (const s of this.syncers) s();
  }

  // ------------------------------------------------------------------ builders
  private showPane(p: Pane): void {
    for (const k of Object.keys(this.panes) as Pane[]) {
      this.panes[k].style.display = k === p ? "" : "none";
      setClass(this.navButtons[k], "ads-on", k === p);
    }
    if (p === "credits") void this.loadCredits(this.panes.credits);
  }

  private toggleStartCredits(): void {
    const el = this.startCredits;
    const show = el.style.display === "none";
    el.style.display = show ? "" : "none";
    if (show) void this.loadCredits(el);
  }

  private controlsList(twoColumns: boolean): HTMLElement {
    const dl = h(twoColumns ? "dl.ads-controls.ads-two" : "dl.ads-controls");
    const list = twoColumns ? CONTROLS.filter(([k]) => k !== "F3" && k !== "Esc") : CONTROLS;
    for (const [keys, what] of list) {
      const dt = h("dt");
      for (const k of keys.split(" / ")) dt.appendChild(h("kbd", null, k));
      dl.appendChild(dt);
      dl.appendChild(h("dd", null, what));
    }
    return dl;
  }

  private rows(defs: readonly RowDef[]): HTMLElement {
    const box = h("div.ads-rows");
    for (const d of defs) {
      if (d.kind === "heading") {
        box.appendChild(h("h3", { style: { margin: "0.7em 0 0.25em" } }, d.label));
        continue;
      }
      const label = h("label", null, d.label);
      const val = h("span.ads-val");
      let control: HTMLElement;
      if (d.kind === "slider") {
        const input = h("input", { type: "range", min: d.min, max: d.max, step: d.step }) as HTMLInputElement;
        const paint = (v: number) => {
          input.style.setProperty("--p", `${(((v - d.min) / (d.max - d.min)) * 100).toFixed(1)}%`);
          setText(val, d.fmt(v));
        };
        input.addEventListener("input", () => {
          const v = Number(input.value);
          if (!Number.isFinite(v)) return;
          paint(v);
          this.cb.onSetting(d.key, v as SettingsData[typeof d.key]);
        });
        this.syncers.push(() => {
          const v = Number(this.settings.data[d.key]);
          input.value = String(v);
          paint(v);
        });
        control = input;
      } else if (d.kind === "toggle") {
        const btn = h("button.ads-toggle", { type: "button", "aria-label": d.label }) as HTMLButtonElement;
        btn.addEventListener("click", () => {
          const v = !this.settings.data[d.key];
          this.cb.onSetting(d.key, v as SettingsData[typeof d.key]);
          this.refresh();
        });
        this.syncers.push(() => {
          const on = !!this.settings.data[d.key];
          setClass(btn, "ads-on", on);
          setText(val, on ? "On" : "Off");
        });
        control = btn;
      } else {
        const seg = h("div.ads-seg");
        const buttons = d.options.map(([q, name]) => {
          const b = h("button", { type: "button", onclick: () => { this.cb.onSetting("quality", q); this.refresh(); } }, name) as HTMLButtonElement;
          seg.appendChild(b);
          return [q, b] as const;
        });
        this.syncers.push(() => {
          for (const [q, b] of buttons) setClass(b, "ads-on", this.settings.data.quality === q);
          setText(val, "");
        });
        control = seg;
      }
      box.appendChild(h("div.ads-row", null, label, control, val));
    }
    return box;
  }

  /** Credits from the asset manifests (sources + licences), with a static fallback. */
  private async loadCredits(target: HTMLElement): Promise<void> {
    if (this.creditsLoaded && target.dataset.filled === "1") return;
    const base = ((import.meta as unknown as { env?: { BASE_URL?: string } }).env?.BASE_URL ?? "./").replace(/\/?$/, "/");
    const groups = new Map<string, Set<string>>();
    const add = (group: string, item: string) => {
      let g = groups.get(group);
      if (!g) groups.set(group, (g = new Set()));
      g.add(item);
    };
    const fetchJson = async (url: string): Promise<unknown> => {
      try {
        const r = await fetch(url);
        if (!r.ok) return null;
        return await r.json();
      } catch {
        return null;
      }
    };
    const rowsOf = (j: unknown): Array<Record<string, unknown>> => {
      if (Array.isArray(j)) return j as Array<Record<string, unknown>>;
      if (j && typeof j === "object") {
        for (const v of Object.values(j as Record<string, unknown>)) if (Array.isArray(v)) return v as Array<Record<string, unknown>>;
      }
      return [];
    };
    const [tex, snd] = await Promise.all([fetchJson(base + "assets/textures/manifest.json"), fetchJson(base + "assets/sounds/manifest.json")]);
    for (const r of rowsOf(tex)) {
      if (r.procedural === true || typeof r.source !== "string") continue;
      const lic = typeof r.license === "string" ? r.license.replace(/ Universal.*$/, "") : "CC0";
      const provider = r.source.split(" ")[0] || "Textures";
      add(`Textures — ${provider} (${lic})`, r.source.replace(provider + " ", ""));
    }
    for (const r of rowsOf(snd)) {
      if (typeof r.source !== "string") continue;
      const lic = typeof r.license === "string" ? r.license.replace(/ Universal.*$/, "") : "CC0";
      add(`Sounds (${lic})`, r.source);
    }
    const lis: string[] = [];
    for (const [g, items] of groups) lis.push(`<li><b>${esc(g)}:</b> ${esc(Array.from(items).sort().join(", "))}</li>`);
    if (!lis.length) for (const c of FALLBACK_CREDITS) lis.push(`<li>${esc(c)}</li>`);
    else lis.push(`<li>${esc(FALLBACK_CREDITS[2])}</li>`);
    target.innerHTML = `<h3>Credits</h3><ul class="ads-credits">${lis.join("")}</ul>`;
    target.dataset.filled = "1";
    this.creditsLoaded = true;
  }
}
