// In-game HUD + menu orchestration (implements HudSystem).
//
// Layers (HTML over the canvas): the HUD (crosshair with states, charge meter, target info,
// repair-bill/stats panel, tool hotbar, holding panel, toasts, F3 debug overlay) never takes
// pointer events; the start screen and pause menu (menu.ts) do.
//
// Game state: "start" (title, loading bar, PLAY) → "playing" ⇄ "paused".
//  * PLAY / RESUME are user gestures: they resume audio and request pointer lock; the game runs
//    once the lock is held (or immediately in the drag-to-look fallback when lock is unavailable).
//  * Losing the lock while playing (Escape, Alt+Tab, browser UI) opens the pause menu; in the
//    fallback mode Escape does. Menus pause the simulation (time.scale = 0), disable game input
//    and release the lock; resuming restores all three.
//  * While playing, closing the tab asks for confirmation (Ctrl is the crouch key and Ctrl+W
//    can't be intercepted by pages).

import "./hud.css";
import { SceneInstrumentation, type PhysicsBody } from "@babylonjs/core";
import type { GameContext, HudSystem, TargetInfo, ToolId } from "../core/context.ts";
import { QUALITY, type SettingsData } from "../core/settings.ts";
import { h, money, setClass, setText } from "./dom.ts";
import { TOOL_NAMES, toolIcon } from "./icons.ts";
import { Menus } from "./menu.ts";

export type HudState = "start" | "playing" | "paused";

const TOOL_ORDER: readonly ToolId[] = ["hands", "hammer", "sledgehammer", "crowbar", "bat", "axe", "extinguisher"];

/** What the HUD reads from the player (duck-typed: the real Player has all of it). */
interface PlayerView {
  readonly tool: ToolId;
  readonly target: TargetInfo | null;
  readonly holding: PhysicsBody | null;
  readonly crosshair?: string;
  readonly charge?: number;
  readonly speed?: number;
  readonly grounded?: boolean;
  readonly crouched?: boolean;
  readonly position?: { x: number; y: number; z: number };
  readonly velocity?: { x: number; y: number; z: number };
  readonly tools?: { readonly defs?: Readonly<Record<string, { name?: string }>> } | null;
  readonly interaction?: {
    readonly heldMass: number;
    readonly canLift: boolean;
    readonly holdMode: "dynamic" | "static" | null;
    readonly handForce: number;
    readonly targetDistance: number;
  };
}

/** Extra Input capabilities used by the HUD (duck-typed on ctx.input). */
interface InputExtras {
  setEnabled?(on: boolean): void;
  onLockChange?(fn: (locked: boolean, info: { requested: boolean; fallback: boolean; error?: string }) => void): () => void;
  readonly fallback?: boolean;
  setFallback?(on: boolean): void;
}

interface HintState {
  playTime: number;
  holding: boolean;
  targetGrabbable: boolean;
  targetUsable: boolean;
}

const HINTS: ReadonlyArray<{ id: string; html: string; when: (s: HintState) => boolean }> = [
  { id: "move", html: "<b>WASD</b> move · <b>Shift</b> sprint · <b>Space</b> jump · <b>C</b> crouch", when: (s) => s.playTime > 1.2 },
  { id: "swing", html: "Hold <b>LMB</b> to charge a swing", when: (s) => s.playTime > 6 },
  { id: "grab", html: "<b>RMB</b> to grab", when: (s) => s.targetGrabbable && s.playTime > 3 },
  { id: "throw", html: "Hold <b>LMB</b> to throw · <b>F</b> slam · <b>Wheel</b> distance · <b>R</b> rotate", when: (s) => s.holding },
  { id: "use", html: "<b>E</b> opens doors and drawers, flips switches, taps and the TV", when: (s) => s.targetUsable },
  { id: "tools", html: "<b>1–7</b> switch tools — the sledgehammer is on <b>3</b>", when: (s) => s.playTime > 24 },
  { id: "kick", html: "<b>F</b> kick · <b>G</b> stomp", when: (s) => s.playTime > 42 },
  { id: "walls", html: "Throw things at the walls", when: (s) => s.playTime > 70 },
];
const HINT_KEY = "apartment-destruction-hints-v1";
const HINT_GAP = 7; // s between hints

const USE_VERB: Readonly<Record<string, string>> = { door: "Open / close", drawer: "Open / close", switch: "Switch", tv: "TV on / off", faucet: "Tap" };

export class Hud implements HudSystem {
  private readonly ctx: GameContext;
  private readonly root: HTMLDivElement;
  private readonly layer: HTMLDivElement;
  private readonly menus: Menus;
  private _state: HudState = "start";
  private savedScale = 1;
  private playTime = 0;

  // HUD elements
  private readonly crosshair: HTMLDivElement;
  private readonly chargeBox: HTMLDivElement;
  private readonly chargeFill: HTMLDivElement;
  private readonly target: HTMLDivElement;
  private readonly targetName: HTMLDivElement;
  private readonly targetFill: HTMLDivElement;
  private readonly targetDamage: HTMLSpanElement;
  private readonly targetMass: HTMLSpanElement;
  private readonly targetKeys: HTMLDivElement;
  private readonly stats: HTMLDivElement;
  private readonly bill: HTMLDivElement;
  private readonly statDestroyed: HTMLElement;
  private readonly statDebris: HTMLElement;
  private readonly statBodies: HTMLElement;
  private readonly statFps: HTMLElement;
  private readonly popups: HTMLDivElement;
  private readonly hotbar: HTMLDivElement;
  private readonly holdingBox: HTMLDivElement;
  private readonly holdingTitle: HTMLDivElement;
  private readonly holdingKeys: HTMLDivElement;
  private readonly toasts: HTMLDivElement;
  private readonly debugBox: HTMLDivElement;
  private slots: Array<{ id: ToolId; el: HTMLDivElement }> = [];
  private slotsBuiltFor: unknown = null;

  // state
  private billTotal = 0;
  private billShown = 0;
  private popupAcc = 0;
  private popupTimer = 0;
  private statsTimer = 0;
  private debugTimer = 0;
  private debugOn = false;
  private instr: SceneInstrumentation | null = null;
  private fps = 0;
  private hitFlash = 0;
  private lastCrosshair = "";
  private lastSelTool: ToolId | null = null;
  private lastTargetKey = "";
  private lastHoldKey = "";
  private hintsSeen = new Set<string>();
  private hintTimer = 0;
  private readonly unsubs: Array<() => void> = [];
  private readonly beforeUnload = (e: BeforeUnloadEvent) => {
    if (this._state !== "playing") return;
    e.preventDefault();
    e.returnValue = "";
  };

  constructor(ctx: GameContext) {
    this.ctx = ctx;
    this.root = h("div.ads-ui", { id: "ads-ui" });

    // ---------------------------------------------------------- HUD layer
    this.crosshair = h(
      "div.ads-crosshair",
      { dataset: { state: "default" } },
      h("i.ch-dot"),
      h("i.ch-t.ch-n"),
      h("i.ch-t.ch-s"),
      h("i.ch-t.ch-e"),
      h("i.ch-t.ch-w"),
      h("i.ch-b.ch-tl"),
      h("i.ch-b.ch-tr"),
      h("i.ch-b.ch-bl"),
      h("i.ch-b.ch-br"),
      h("i.ch-ring"),
      h("i.ch-lever"),
      h("i.ch-fulcrum"),
    );
    this.chargeFill = h("div");
    this.chargeBox = h("div.ads-charge", null, this.chargeFill);
    this.targetName = h("div.ads-target-name");
    this.targetFill = h("div");
    this.targetDamage = h("span");
    this.targetMass = h("span");
    this.targetKeys = h("div.ads-target-keys");
    this.target = h(
      "div.ads-target",
      null,
      this.targetName,
      h("div.ads-target-bar", null, this.targetFill),
      h("div.ads-target-sub", null, this.targetDamage, this.targetMass),
      this.targetKeys,
    );
    this.bill = h("div.ads-bill", null, "$0");
    this.statDestroyed = h("b", null, "0%");
    this.statDebris = h("b", null, "0");
    this.statBodies = h("b", null, "0");
    this.statFps = h("b", null, "–");
    const row = (label: string, v: HTMLElement) => h("div.ads-stat-row", null, h("span", null, label), v);
    this.stats = h(
      "div.ads-stats",
      null,
      h("div.ads-bill-label", null, "Repair bill"),
      this.bill,
      row("Destroyed", this.statDestroyed),
      row("Debris pieces", this.statDebris),
      row("Active bodies", this.statBodies),
      row("FPS", this.statFps),
    );
    this.popups = h("div.ads-popups");
    this.hotbar = h("div.ads-hotbar");
    this.holdingTitle = h("div.ads-holding-title");
    this.holdingKeys = h("div.ads-holding-keys");
    this.holdingBox = h("div.ads-holding", null, this.holdingTitle, this.holdingKeys);
    this.toasts = h("div.ads-toasts");
    this.debugBox = h("div.ads-debug");
    this.layer = h(
      "div.ads-hud.ads-hidden",
      null,
      this.crosshair,
      this.chargeBox,
      this.target,
      this.stats,
      this.popups,
      this.holdingBox,
      this.hotbar,
      this.toasts,
      this.debugBox,
    );
    this.root.appendChild(this.layer);

    // ---------------------------------------------------------- menus
    this.menus = new Menus(this.root, ctx.settings, {
      onPlay: () => this.play(),
      onResume: () => this.resume(),
      onSetting: (k, v) => this.applySetting(k, v),
    });
    this.menus.showStart(true);
    document.body.appendChild(this.root);

    // ---------------------------------------------------------- wiring
    try {
      const raw = globalThis.localStorage?.getItem(HINT_KEY);
      if (raw) for (const id of JSON.parse(raw) as string[]) this.hintsSeen.add(id);
    } catch {
      /* storage unavailable */
    }
    this.unsubs.push(
      ctx.events.on("damage", (e) => {
        const v = Number(e.valueLost);
        if (Number.isFinite(v) && v > 0) {
          this.billTotal += v;
          this.popupAcc += v;
        }
      }),
    );
    this.unsubs.push(
      ctx.events.on("toolHit", () => {
        this.hitFlash = 0.09;
      }),
    );
    const onKey = (e: KeyboardEvent) => this.onMenuKey(e);
    window.addEventListener("keydown", onKey);
    this.unsubs.push(() => window.removeEventListener("keydown", onKey));
    this.attachInput();
  }

  // ------------------------------------------------------------------ HudSystem
  get menuOpen(): boolean {
    return this._state !== "playing";
  }

  get state(): HudState {
    return this._state;
  }

  setLoading(progress: number, label: string): void {
    this.menus.setLoading(progress, label);
  }

  hideLoading(): void {
    this.menus.loadingDone();
  }

  toast(text: string, seconds = 3): void {
    this.showToast(h("div.ads-toast", null, String(text)), seconds);
  }

  /** Toast with trusted markup (internal hints use <b> for key names). */
  private toastHtml(html: string, seconds: number): void {
    this.showToast(h("div.ads-toast", { html }), seconds);
  }

  private showToast(el: HTMLDivElement, seconds: number): void {
    this.toasts.appendChild(el);
    while (this.toasts.children.length > 4) this.toasts.firstElementChild?.remove();
    const ms = Math.max(0.8, Number.isFinite(seconds) ? seconds : 3) * 1000;
    setTimeout(() => {
      el.classList.add("ads-out");
      setTimeout(() => el.remove(), 400);
    }, ms);
  }

  update(dt: number): void {
    if (!(dt >= 0) || !Number.isFinite(dt)) dt = 0;
    dt = Math.min(dt, 0.25);
    const input = this.ctx.input;
    if (this._state === "playing" && input) {
      if (input.pressed("pause")) {
        this.pause();
        return;
      }
      if (input.pressed("debug")) this.setDebug(!this.debugOn);
      this.playTime += dt;
    }
    this.updateFps(dt);
    if (this._state !== "start") {
      this.updatePlayerHud(dt);
      this.updateStats(dt);
      this.updateHints(dt);
    }
    if (this.debugOn) this.updateDebug(dt);
  }

  // ------------------------------------------------------------------ state machine
  /** Start screen PLAY (must run inside a user gesture). */
  play(): void {
    if (this._state !== "start" || !this.menus.isReady) return;
    void this.ctx.audio?.resume?.().catch(() => undefined);
    this.acquire((ok, msg) => {
      if (ok) this.enterPlaying();
      else this.menus.setStartMessage(msg);
    });
  }

  /** Pause menu RESUME (must run inside a user gesture). */
  resume(): void {
    if (this._state !== "paused") return;
    void this.ctx.audio?.resume?.().catch(() => undefined);
    this.acquire((ok, msg) => {
      if (ok) this.enterPlaying();
      else this.menus.setPauseMessage(msg);
    });
  }

  /** Open the pause menu. */
  pause(): void {
    if (this._state !== "playing") return;
    this._state = "paused";
    this.setInputEnabled(false);
    const input = this.ctx.input;
    if (input?.locked) input.exitLock();
    const t = this.ctx.time;
    if (t) {
      this.savedScale = t.scale > 0 ? t.scale : 1;
      t.scale = 0;
    }
    this.menus.setPauseBill(money(this.billTotal));
    this.menus.showPause(true);
  }

  /** Enter play without pointer lock (tests / automation). */
  forcePlay(): void {
    if (this._state === "playing") return;
    this.menus.loadingDone();
    this.enterPlaying();
  }

  dispose(): void {
    for (const u of this.unsubs) u();
    this.unsubs.length = 0;
    window.removeEventListener("beforeunload", this.beforeUnload);
    this.instr?.dispose();
    this.root.remove();
  }

  // ------------------------------------------------------------------ internals
  private attachInput(): void {
    const ex = this.ctx.input as unknown as InputExtras | undefined;
    if (!ex?.onLockChange) return;
    this.unsubs.push(
      ex.onLockChange((locked, info) => {
        if (!locked && !info.requested && this._state === "playing") this.pause();
        if (info.fallback && info.error && info.error !== "forced") {
          this.toast("Mouse lock unavailable — hold a mouse button and drag to look", 6);
        }
      }),
    );
  }

  private acquire(done: (ok: boolean, msg: string) => void): void {
    const input = this.ctx.input;
    if (!input) {
      done(true, "");
      return;
    }
    let res: unknown;
    try {
      res = input.requestLock();
    } catch {
      res = false;
    }
    Promise.resolve(res as Promise<boolean> | undefined).then(
      (ok) => done(ok === undefined ? true : !!ok, ok === false ? "The browser needs a moment — click again to capture the mouse." : ""),
      () => done(false, "Couldn't capture the mouse — click again."),
    );
  }

  private enterPlaying(): void {
    this._state = "playing";
    this.menus.showStart(false);
    this.menus.showPause(false);
    this.menus.setStartMessage("");
    setClass(this.layer, "ads-hidden", false);
    const t = this.ctx.time;
    if (t && t.scale === 0) t.scale = this.savedScale > 0 ? this.savedScale : 1;
    this.setInputEnabled(true);
    window.removeEventListener("beforeunload", this.beforeUnload);
    window.addEventListener("beforeunload", this.beforeUnload);
  }

  private setInputEnabled(on: boolean): void {
    (this.ctx.input as unknown as InputExtras | undefined)?.setEnabled?.(on);
  }

  private onMenuKey(e: KeyboardEvent): void {
    if (this._state === "playing") return; // game keys go through Input
    if (e.code === "F3") {
      e.preventDefault();
      this.setDebug(!this.debugOn);
    } else if (e.code === "Escape" && this._state === "paused") {
      // Escape can't re-capture the mouse (not a user activation); without pointer lock it resumes.
      const ex = this.ctx.input as unknown as InputExtras | undefined;
      if (ex?.fallback) this.resume();
    }
  }

  private applySetting<K extends keyof SettingsData>(key: K, value: SettingsData[K]): void {
    const s = this.ctx.settings;
    s.set(key, value);
    try {
      if (key === "quality") this.ctx.render?.applyQuality(QUALITY[value as SettingsData["quality"]] ?? QUALITY.high);
      else if (key === "ps2Mode") this.ctx.render?.setPS2Mode(!!value);
      else if (key === "masterVolume") this.ctx.audio?.setMasterVolume(Number(value));
    } catch (e) {
      console.warn("applying setting failed", key, e);
    }
    if (key === "showStats" || key === "showTargetInfo") this.lastTargetKey = "";
  }

  private setDebug(on: boolean): void {
    this.debugOn = on;
    setClass(this.debugBox, "ads-on", on);
    if (on && !this.instr && this.ctx.scene) {
      try {
        this.instr = new SceneInstrumentation(this.ctx.scene);
        this.instr.captureFrameTime = true;
      } catch {
        this.instr = null;
      }
    }
    this.debugTimer = 0;
  }

  private updateFps(dt: number): void {
    const e = this.ctx.engine;
    if (!e) return;
    const f = e.getFps();
    if (Number.isFinite(f) && f > 0 && f < 2000) this.fps = this.fps ? this.fps + (f - this.fps) * Math.min(1, dt * 4) : f;
  }

  private get player(): PlayerView | null {
    return (this.ctx.player as unknown as PlayerView | undefined) ?? null;
  }

  private buildHotbar(p: PlayerView): void {
    const defs = p.tools?.defs ?? null;
    if (this.slotsBuiltFor === (defs ?? p) && this.slots.length) return;
    this.slotsBuiltFor = defs ?? p;
    this.hotbar.textContent = "";
    this.slots = TOOL_ORDER.map((id, i) => {
      const name = defs?.[id]?.name ?? TOOL_NAMES[id];
      const el = h("div.ads-slot", { dataset: { tool: id } }, h("span.ads-key", null, String(i + 1)), h("span", { html: toolIcon(id) }), h("span.ads-name", null, name));
      this.hotbar.appendChild(el);
      return { id, el };
    });
    this.lastSelTool = null;
  }

  private updatePlayerHud(dt: number): void {
    const p = this.player;
    if (!p) return;
    const s = this.ctx.settings.data;
    this.buildHotbar(p);

    // crosshair
    const ch = p.crosshair ?? (p.holding ? "hold" : "default");
    if (ch !== this.lastCrosshair) {
      this.crosshair.dataset.state = ch;
      this.lastCrosshair = ch;
    }
    if (this.hitFlash > 0) this.hitFlash -= dt;
    setClass(this.crosshair, "ads-hit", this.hitFlash > 0);

    // charge meter
    const c = typeof p.charge === "number" ? p.charge : -1;
    setClass(this.chargeBox, "ads-on", c >= 0);
    if (c >= 0) {
      this.chargeFill.style.width = `${(Math.max(0, Math.min(1, c)) * 100).toFixed(1)}%`;
      setClass(this.chargeBox, "ads-full", c >= 0.999);
    } else setClass(this.chargeBox, "ads-full", false);

    // hotbar selection
    const tool = p.tool;
    if (tool !== this.lastSelTool) {
      for (const sl of this.slots) setClass(sl.el, "ads-sel", sl.id === tool);
      this.lastSelTool = tool;
    }
    setClass(this.hotbar, "ads-dim", !!p.holding);

    // holding panel
    const it = p.interaction;
    if (p.holding && it) {
      const name = p.target?.assemblyName || p.target?.assemblyType || "Object";
      const mass = it.heldMass;
      const key = `${name}|${Math.round(mass)}|${it.holdMode}|${it.canLift}|${it.holdMode === "static" ? Math.round(it.handForce / 25) : 0}`;
      if (key !== this.lastHoldKey) {
        this.lastHoldKey = key;
        if (it.holdMode === "static") {
          this.holdingTitle.innerHTML = `Pulling <em>${escapeHtml(name)}</em> · ${Math.round(it.handForce)} N`;
          this.holdingKeys.innerHTML = "<span>Pull back to rip it loose</span><span><kbd>RMB</kbd> let go</span>";
        } else {
          const heavy = !it.canLift ? " · <em>too heavy to lift</em>" : "";
          this.holdingTitle.innerHTML = `Holding <em>${escapeHtml(name)}</em> · ${formatMass(mass)}${heavy}`;
          this.holdingKeys.innerHTML =
            "<span><kbd>LMB</kbd> throw</span><span><kbd>F</kbd> slam</span><span><kbd>R</kbd> rotate</span><span><kbd>Wheel</kbd> distance</span><span><kbd>RMB</kbd> drop</span>";
        }
      }
      setClass(this.holdingBox, "ads-on", true);
    } else {
      setClass(this.holdingBox, "ads-on", false);
      this.lastHoldKey = "";
    }

    // target info
    const t = p.target;
    const showTarget = s.showTargetInfo && !!t && !p.holding;
    setClass(this.target, "ads-on", showTarget);
    if (showTarget && t) {
      const dmg = Math.max(0, Math.min(1, Number.isFinite(t.damage) ? t.damage : 0));
      const crowbar = tool === "crowbar" && (it?.targetDistance ?? 99) <= 1.3;
      const key = `${t.assemblyId}|${t.partName}|${Math.round(dmg * 100)}|${t.grabbable}|${t.usable}|${t.isStatic}|${crowbar}`;
      if (key !== this.lastTargetKey) {
        this.lastTargetKey = key;
        setText(this.targetName, t.assemblyName || t.assemblyType || "Unknown");
        this.targetFill.style.width = `${(dmg * 100).toFixed(1)}%`;
        this.targetFill.style.backgroundPosition = "0 0";
        setText(this.targetDamage, dmg > 0.001 ? `${Math.round(dmg * 100)}% damaged` : "Intact");
        setText(this.targetMass, t.isStatic ? "Anchored" : formatMass(t.mass));
        const keys: string[] = [];
        if (t.usable) keys.push(`<span><kbd>E</kbd> ${USE_VERB[t.usable] ?? "Use"}</span>`);
        if (t.grabbable) keys.push(`<span><kbd>RMB</kbd> ${t.isStatic ? "Pull" : "Grab"}</span>`);
        if (crowbar) keys.push(`<span><kbd>V</kbd> Pry</span>`);
        this.targetKeys.innerHTML = keys.join("");
      }
    } else this.lastTargetKey = "";
  }

  private updateStats(dt: number): void {
    const show = this.ctx.settings.data.showStats;
    this.stats.style.display = show ? "" : "none";
    this.popups.style.display = show ? "" : "none";
    // animated bill count-up
    if (this.billShown !== this.billTotal) {
      const diff = this.billTotal - this.billShown;
      this.billShown = Math.abs(diff) < 1 ? this.billTotal : this.billShown + diff * Math.min(1, dt * 7);
      setText(this.bill, money(this.billShown));
    }
    this.popupTimer -= dt;
    if (this.popupAcc >= 1 && this.popupTimer <= 0) {
      this.popupTimer = 0.35;
      if (show) {
        const el = h("div.ads-popup", null, "+" + money(this.popupAcc));
        this.popups.appendChild(el);
        while (this.popups.children.length > 4) this.popups.firstElementChild?.remove();
        setTimeout(() => el.remove(), 1150);
        this.bill.classList.remove("ads-bump");
        void this.bill.offsetWidth; // restart the bump animation
        this.bill.classList.add("ads-bump");
      }
      this.popupAcc = 0;
    }
    this.statsTimer -= dt;
    if (this.statsTimer > 0 || !show) return;
    this.statsTimer = 0.25;
    let destroyed = 0;
    let debris = 0;
    try {
      const ds = this.ctx.destruction?.stats();
      if (ds) {
        destroyed = ds.totalValue > 0 ? ds.valueDestroyed / ds.totalValue : 0;
        debris = (ds.debrisIslands || 0) + (ds.consolidated || 0);
      }
    } catch {
      /* destruction not ready */
    }
    let awake = 0;
    try {
      awake = this.ctx.physics?.stats().awake ?? 0;
    } catch {
      /* physics not ready */
    }
    setText(this.statDestroyed, `${(Math.max(0, Math.min(1, destroyed)) * 100).toFixed(destroyed < 0.1 ? 1 : 0)}%`);
    setText(this.statDebris, String(debris));
    setText(this.statBodies, String(awake));
    setText(this.statFps, this.fps > 0 ? String(Math.round(this.fps)) : "–");
  }

  private updateHints(dt: number): void {
    if (this._state !== "playing" || !this.ctx.settings.data.showHints) return;
    this.hintTimer -= dt;
    if (this.hintTimer > 0) return;
    const p = this.player;
    const t = p?.target ?? null;
    const st: HintState = {
      playTime: this.playTime,
      holding: !!p?.holding,
      targetGrabbable: !!t?.grabbable && !t.isStatic,
      targetUsable: !!t?.usable,
    };
    for (const hint of HINTS) {
      if (this.hintsSeen.has(hint.id) || !hint.when(st)) continue;
      this.hintsSeen.add(hint.id);
      try {
        globalThis.localStorage?.setItem(HINT_KEY, JSON.stringify(Array.from(this.hintsSeen)));
      } catch {
        /* ignore */
      }
      this.toastHtml(hint.html, 4.5);
      this.hintTimer = HINT_GAP;
      return;
    }
    this.hintTimer = 0.5;
  }

  private updateDebug(dt: number): void {
    this.debugTimer -= dt;
    if (this.debugTimer > 0) return;
    this.debugTimer = 0.25;
    const c = this.ctx;
    const L: string[] = [];
    const f1 = (x: number) => (Number.isFinite(x) ? x.toFixed(1) : "–");
    const f2 = (x: number) => (Number.isFinite(x) ? x.toFixed(2) : "–");
    const frameMs = this.instr ? this.instr.frameTimeCounter.lastSecAverage : NaN;
    const draws = this.instr ? this.instr.drawCallsCounter.current : NaN;
    let meshes = "–";
    let verts = "–";
    try {
      meshes = `${c.scene.getActiveMeshes().length}/${c.scene.meshes.length}`;
      verts = `${(c.scene.getTotalVertices() / 1000).toFixed(0)}k`;
    } catch {
      /* ignore */
    }
    L.push(`<b>RENDER</b>  fps ${f1(this.fps)}  frame ${f2(frameMs)} ms  draws ${Number.isFinite(draws) ? draws : "–"}  meshes ${meshes}  verts ${verts}`);
    try {
      const ps = c.physics.stats();
      L.push(`<b>PHYSICS</b> bodies ${ps.bodies}  awake ${ps.awake}  constraints ${ps.constraints}  step ${f2(ps.stepMs)} ms`);
    } catch {
      L.push("<b>PHYSICS</b> –");
    }
    try {
      const d = c.destruction.stats();
      L.push(`<b>DESTRUCT</b> asm ${d.assemblies}  islands ${d.islands} (dyn ${d.dynamicIslands})  parts ${d.parts}`);
      L.push(`         fractures ${d.fractures}  bonds broken ${d.bondsBroken}  debris ${d.debrisIslands}  merged ${d.consolidated}  step ${f2(d.msLastStep)} ms`);
      L.push(`         value ${money(d.valueDestroyed)} / ${money(d.totalValue)}`);
    } catch {
      L.push("<b>DESTRUCT</b> –");
    }
    try {
      L.push(`<b>AUDIO</b>   voices ${c.audio.activeVoices}`);
    } catch {
      L.push("<b>AUDIO</b>   –");
    }
    try {
      L.push(`<b>VFX</b>     particles ${c.vfx.particleCount}  micro ${c.vfx.microCount}`);
    } catch {
      L.push("<b>VFX</b>     –");
    }
    const p = this.player;
    if (p) {
      const pos = p.position, v = p.velocity;
      L.push(
        `<b>PLAYER</b>  pos ${pos ? `${f2(pos.x)} ${f2(pos.y)} ${f2(pos.z)}` : "–"}  speed ${f2(p.speed ?? NaN)}  vy ${v ? f2(v.y) : "–"}  ` +
          `${p.grounded ? "grounded" : "air"}${p.crouched ? " crouched" : ""}  tool ${p.tool}${p.holding ? "  holding" : ""}`,
      );
      const t = p.target;
      if (t) L.push(`<b>TARGET</b>  ${escapeHtml(t.assemblyName)} / ${escapeHtml(t.partName)} [${t.mat}]  dmg ${Math.round(t.damage * 100)}%  ${t.isStatic ? "static" : f1(t.mass) + " kg"}`);
    }
    const time = c.time;
    if (time) L.push(`<b>TIME</b>    sim ${f1(time.simTime)} s  steps ${time.step}  scale ${f2(time.scale)}`);
    this.debugBox.innerHTML = L.join("\n");
  }
}

function formatMass(m: number): string {
  if (!Number.isFinite(m) || m <= 0) return "–";
  return m < 1 ? `${Math.round(m * 1000)} g` : m < 10 ? `${m.toFixed(1)} kg` : `${Math.round(m)} kg`;
}

function escapeHtml(s: string): string {
  return String(s).replace(/[&<>"']/g, (c) => ({ "&": "&amp;", "<": "&lt;", ">": "&gt;", '"': "&quot;", "'": "&#39;" })[c] as string);
}
