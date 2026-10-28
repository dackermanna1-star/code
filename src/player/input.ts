// Keyboard + mouse input for the first-person sandbox (implements InputSystem).
//
// * Pointer lock: `requestLock()` (call from a user gesture — the HUD's PLAY / RESUME click, or
//   a click on the canvas) asks for raw, un-accelerated mouse movement when the browser supports
//   it. When pointer lock is unavailable (no API, sandboxed iframe, repeated refusals) the input
//   switches to a drag-to-look FALLBACK: hold a mouse button and drag to turn; a short left
//   click still fires (tap = normal swing) and holding the left button still charges.
// * Keys are mapped by `KeyboardEvent.code` (layout independent; WASD stays WASD on AZERTY).
// * Edges: `pressed(a)` / `released(a)` are latched until read (consumed on read) so a press
//   between two fixed steps is never lost, and expire after EDGE_TTL_MS so nothing stale fires
//   after a pause. Down state is tracked per physical source (KeyC and ControlLeft can both hold
//   "crouch"). Everything is released on blur / tab switch / disable: no stuck keys.
// * `consumeLook()` returns the accumulated mouse delta in pixels, already scaled by the mouse
//   sensitivity setting and with invert-Y applied (positive dy = look down).
// * `consumeWheel()` returns wheel notches since the last call; positive = wheel rolled forward
//   (away from the user, DOM deltaY < 0).
//
// The HUD drives `setEnabled()` (menus disable game input) and listens to `onLockChange()` to
// open the pause menu when the lock is lost (Escape while locked never reaches the page as a
// keydown in Chrome; the lock loss latches a "pause" press instead).

import type { Action, InputSystem } from "../core/context.ts";
import type { Settings } from "../core/settings.ts";

/** Physical key (KeyboardEvent.code) → action. Movement keys are handled separately. */
const KEY_ACTIONS: Readonly<Record<string, Action>> = {
  Space: "jump",
  ShiftLeft: "sprint",
  ShiftRight: "sprint",
  KeyC: "crouch",
  ControlLeft: "crouch",
  KeyV: "alt",
  KeyE: "use",
  KeyF: "kick",
  KeyG: "stomp",
  KeyR: "rotate",
  KeyQ: "drop",
  Digit1: "slot1",
  Digit2: "slot2",
  Digit3: "slot3",
  Digit4: "slot4",
  Digit5: "slot5",
  Digit6: "slot6",
  Digit7: "slot7",
  Numpad1: "slot1",
  Numpad2: "slot2",
  Numpad3: "slot3",
  Numpad4: "slot4",
  Numpad5: "slot5",
  Numpad6: "slot6",
  Numpad7: "slot7",
  Escape: "pause",
  F3: "debug",
};

/** Movement keys → [axis, sign] (axis 0 = strafe x, 1 = forward y). */
const MOVE_KEYS: Readonly<Record<string, readonly [0 | 1, 1 | -1]>> = {
  KeyW: [1, 1],
  ArrowUp: [1, 1],
  KeyS: [1, -1],
  ArrowDown: [1, -1],
  KeyD: [0, 1],
  ArrowRight: [0, 1],
  KeyA: [0, -1],
  ArrowLeft: [0, -1],
};

/** Mouse button index → action (0 left = fire, 1 middle = alt, 2 right = grab/drop). */
const MOUSE_ACTIONS: readonly Action[] = ["fire", "alt", "grab"];

const ALL_ACTIONS: readonly Action[] = [
  "fire", "alt", "grab", "jump", "crouch", "sprint", "use", "kick", "stomp", "drop", "rotate", "pause", "debug",
  "slot1", "slot2", "slot3", "slot4", "slot5", "slot6", "slot7",
];

/** Unconsumed edges older than this are dropped (paused game, nobody reading). */
const EDGE_TTL_MS = 250;
/** Single mouse events larger than this are teleports/glitches (Chrome spikes, cursor warps). */
const MAX_MOUSE_EVENT_DELTA = 250;
/** Fallback mode: a left press that moves less than this (px) and is released quickly is a click. */
const DRAG_THRESHOLD_PX = 6;
/** Fallback mode: a still left press held longer than this becomes a held "fire" (charge). */
const HOLD_TO_FIRE_MS = 220;
/** A failed lock request this soon after the lock was exited is a browser cooldown, not "unsupported". */
const LOCK_COOLDOWN_MS = 1600;
/** DOM wheel pixels per notch (deltaMode 0). */
const WHEEL_PX_PER_NOTCH = 100;

type LockListener = (locked: boolean, info: { requested: boolean; fallback: boolean; error?: string }) => void;

interface PendingFire {
  x: number;
  y: number;
  moved: number;
  t: number;
  converted: boolean; // became a held "fire"
  drag: boolean; // became a look drag
}

export class Input implements InputSystem {
  readonly move = { x: 0, y: 0 };

  private readonly canvas: HTMLCanvasElement;
  private readonly settings: Settings;
  private _enabled = false;
  private _fallback = false;
  private lockRequested = false; // our own exitLock() in progress → don't report as user exit
  private lastLockExit = -1e9;
  private lockFailures = 0;
  private listeners: LockListener[] = [];

  /** Held physical sources (key codes, "Mouse0", "virt:<action>"). */
  private held = new Set<string>();
  /** Number of held sources per action. */
  private downCount = new Map<Action, number>();
  /** Latched edge timestamps (ms, 0 = none). */
  private pressedAt = new Map<Action, number>();
  private releasedAt = new Map<Action, number>();
  /** Virtual holds (tests / debug): action → release time (ms). */
  private virtualUntil = new Map<Action, number>();

  private lookDx = 0;
  private lookDy = 0;
  private wheel = 0;
  private readonly lookOut = { dx: 0, dy: 0 };
  private skipNextMove = false; // first movement event after locking can be a large spike
  private pendingFire: PendingFire | null = null;
  private dragButtons = 0; // fallback: bitmask of buttons currently dragging the view

  private readonly disposers: Array<() => void> = [];

  constructor(canvas: HTMLCanvasElement, settings: Settings) {
    this.canvas = canvas;
    this.settings = settings;
    for (const a of ALL_ACTIONS) {
      this.downCount.set(a, 0);
      this.pressedAt.set(a, 0);
      this.releasedAt.set(a, 0);
    }
    if (canvas.tabIndex < 0) canvas.tabIndex = 1; // focusable, so keyboard focus can land on the game
    this.listen(window, "keydown", (e) => this.onKeyDown(e as KeyboardEvent));
    this.listen(window, "keyup", (e) => this.onKeyUp(e as KeyboardEvent));
    this.listen(canvas, "mousedown", (e) => this.onMouseDown(e as MouseEvent));
    this.listen(window, "mouseup", (e) => this.onMouseUp(e as MouseEvent));
    this.listen(document, "mousemove", (e) => this.onMouseMove(e as MouseEvent));
    this.listen(canvas, "wheel", (e) => this.onWheel(e as WheelEvent), { passive: false });
    this.listen(canvas, "contextmenu", (e) => e.preventDefault());
    this.listen(canvas, "click", () => {
      // Click-to-lock (the HUD normally does this from its own buttons; this covers clicks that
      // land directly on the canvas while enabled but unlocked).
      if (this._enabled && !this.locked && !this._fallback) void this.requestLock();
    });
    this.listen(document, "pointerlockchange", () => this.handleLockChange());
    this.listen(window, "blur", () => this.releaseAll());
    this.listen(document, "visibilitychange", () => {
      if (document.visibilityState !== "visible") this.releaseAll();
    });
  }

  // ------------------------------------------------------------------ InputSystem
  get locked(): boolean {
    return typeof document !== "undefined" && document.pointerLockElement === this.canvas;
  }

  /** True while game input is accepted (playing, no menu open). */
  get enabled(): boolean {
    return this._enabled;
  }

  /** True when pointer lock is unavailable and drag-to-look is used instead. */
  get fallback(): boolean {
    return this._fallback;
  }

  down(a: Action): boolean {
    return (this.downCount.get(a) ?? 0) > 0;
  }

  pressed(a: Action): boolean {
    return this.takeEdge(this.pressedAt, a);
  }

  released(a: Action): boolean {
    return this.takeEdge(this.releasedAt, a);
  }

  consumeLook(): { dx: number; dy: number } {
    const s = this.settings.data;
    const sens = Number.isFinite(s.mouseSensitivity) ? Math.max(0.05, s.mouseSensitivity) : 1;
    this.lookOut.dx = this.lookDx * sens;
    this.lookOut.dy = this.lookDy * sens * (s.invertY ? -1 : 1);
    this.lookDx = 0;
    this.lookDy = 0;
    return this.lookOut;
  }

  consumeWheel(): number {
    const w = this.wheel;
    this.wheel = 0;
    return w;
  }

  /**
   * Request pointer lock (must run inside a user gesture). Resolves true when locked, or when the
   * drag-to-look fallback is in use; false when the request failed but may succeed later
   * (NotAllowedError: no user activation, or Chrome's ~1 s cooldown after the user pressed Escape).
   * Error handling follows docs/api-notes/input-loop-camera.md §5: `unadjustedMovement` is tried
   * first (NotSupportedError on Linux → plain retry); SecurityError (sandboxed iframe without
   * allow-pointer-lock) or a missing API → fallback; a late `pointerlockerror` from the failed
   * raw-input attempt is ignored when the retry succeeds.
   */
  requestLock(): Promise<boolean> {
    if (this.locked) return Promise.resolve(true);
    if (this._fallback) return Promise.resolve(true);
    const el = this.canvas as HTMLCanvasElement & { requestPointerLock?: (o?: unknown) => Promise<void> | void };
    if (typeof el.requestPointerLock !== "function") {
      this.enterFallback("Pointer lock API not available");
      return Promise.resolve(true);
    }
    return new Promise<boolean>((resolve) => {
      let settled = false;
      let promiseApi = false;
      const finish = (ok: boolean, errName?: string, msg?: string) => {
        if (settled) return;
        settled = true;
        document.removeEventListener("pointerlockchange", onChange);
        document.removeEventListener("pointerlockerror", onError);
        clearTimeout(timer);
        if (ok || this.locked) {
          this.lockFailures = 0;
          resolve(true);
          return;
        }
        this.lockFailures++;
        const sinceExit = performance.now() - this.lastLockExit;
        const hard = errName === "SecurityError" || (errName !== "NotAllowedError" && this.lockFailures >= 2 && sinceExit > LOCK_COOLDOWN_MS);
        if (hard) {
          this.enterFallback(msg ?? errName ?? "Pointer lock refused");
          resolve(true);
        } else {
          this.emitLock(false, { requested: true, fallback: false, error: msg ?? errName ?? "Pointer lock refused" });
          resolve(false);
        }
      };
      const onChange = () => {
        if (this.locked) finish(true);
      };
      // Only browsers without the promise API report failures through this event alone.
      const onError = () => {
        if (!promiseApi) setTimeout(() => finish(this.locked, "Error", "pointerlockerror"), 0);
      };
      document.addEventListener("pointerlockchange", onChange);
      document.addEventListener("pointerlockerror", onError);
      const timer = setTimeout(() => finish(this.locked, "Timeout", "Pointer lock timed out"), 1500);
      const attempt = (opts: unknown, allowRetry: boolean) => {
        let ret: Promise<void> | void;
        try {
          ret = el.requestPointerLock!(opts);
        } catch (e) {
          const name = (e as DOMException)?.name;
          if (allowRetry) attempt(undefined, false);
          else finish(false, name, String((e as Error)?.message ?? e));
          return;
        }
        if (ret && typeof (ret as Promise<void>).then === "function") {
          promiseApi = true;
          (ret as Promise<void>).then(
            () => finish(true),
            (e: DOMException) => {
              // raw (unadjusted) movement unsupported on this OS/browser → plain lock
              if (allowRetry && e?.name === "NotSupportedError") attempt(undefined, false);
              else finish(false, e?.name, `${e?.name ?? "Error"}: ${e?.message ?? ""}`);
            },
          );
        }
      };
      attempt({ unadjustedMovement: true }, true);
    });
  }

  exitLock(): void {
    if (!this.locked) return;
    this.lockRequested = true;
    try {
      document.exitPointerLock();
    } catch {
      this.lockRequested = false;
    }
  }

  /**
   * Per-frame (or per fixed step) bookkeeping: movement axes from held keys, virtual holds,
   * fallback hold-to-fire conversion, expiry of stale edges.
   */
  update(): void {
    const now = performance.now();
    // movement axes
    let x = 0;
    let y = 0;
    for (const code of this.held) {
      const m = MOVE_KEYS[code];
      if (!m) continue;
      if (m[0] === 0) x += m[1];
      else y += m[1];
    }
    this.move.x = x > 1 ? 1 : x < -1 ? -1 : x;
    this.move.y = y > 1 ? 1 : y < -1 ? -1 : y;
    // virtual holds (debug / tests)
    if (this.virtualUntil.size) {
      for (const [a, until] of this.virtualUntil) {
        if (now >= until) {
          this.virtualUntil.delete(a);
          this.sourceUp(`virt:${a}`, a, now);
        }
      }
    }
    // fallback: a still left press held long enough becomes a held "fire"
    const pf = this.pendingFire;
    if (pf && !pf.converted && !pf.drag && now - pf.t >= HOLD_TO_FIRE_MS) {
      pf.converted = true;
      this.sourceDown("Mouse0", "fire", now);
    }
    // expire stale edges
    for (const a of ALL_ACTIONS) {
      const p = this.pressedAt.get(a)!;
      if (p && now - p > EDGE_TTL_MS) this.pressedAt.set(a, 0);
      const r = this.releasedAt.get(a)!;
      if (r && now - r > EDGE_TTL_MS) this.releasedAt.set(a, 0);
    }
  }

  // ------------------------------------------------------------------ extras (HUD / debug / tests)
  /** Enable or disable game input (menus disable it). Disabling releases everything. */
  setEnabled(on: boolean): void {
    if (on === this._enabled) return;
    this._enabled = on;
    this.releaseAll();
    this.clearEdges();
    this.lookDx = this.lookDy = 0;
    this.wheel = 0;
  }

  /** Subscribe to pointer-lock changes. `requested` = caused by our own requestLock/exitLock. */
  onLockChange(fn: LockListener): () => void {
    this.listeners.push(fn);
    return () => {
      const i = this.listeners.indexOf(fn);
      if (i >= 0) this.listeners.splice(i, 1);
    };
  }

  /** Force the drag-to-look fallback (or leave it). */
  setFallback(on: boolean): void {
    if (on) this.enterFallback("forced");
    else this._fallback = false;
  }

  /** Simulate holding an action for `seconds` (press edge now, release edge later). */
  hold(a: Action, seconds: number): void {
    const now = performance.now();
    if (!this.virtualUntil.has(a)) this.sourceDown(`virt:${a}`, a, now);
    this.virtualUntil.set(a, now + Math.max(0, seconds) * 1000);
  }

  /** Simulate a quick press + release of an action. */
  tap(a: Action): void {
    const now = performance.now();
    this.pressedAt.set(a, now);
    this.releasedAt.set(a, now);
  }

  /** Inject a look delta in pixels (before sensitivity), e.g. from tests. */
  addLook(dx: number, dy: number): void {
    if (Number.isFinite(dx)) this.lookDx += dx;
    if (Number.isFinite(dy)) this.lookDy += dy;
  }

  /** Inject wheel notches (positive = forward). */
  addWheel(n: number): void {
    if (Number.isFinite(n)) this.wheel += n;
  }

  /** Release every held input (emits released edges for actions that were down). */
  releaseAll(): void {
    const now = performance.now();
    for (const src of Array.from(this.held)) {
      const a = this.actionOfSource(src);
      if (a) this.sourceUp(src, a, now);
      else this.held.delete(src);
    }
    this.held.clear();
    this.virtualUntil.clear();
    this.pendingFire = null;
    this.dragButtons = 0;
    this.move.x = this.move.y = 0;
  }

  dispose(): void {
    for (const d of this.disposers) d();
    this.disposers.length = 0;
    this.listeners.length = 0;
    this.releaseAll();
  }

  // ------------------------------------------------------------------ internals
  private listen(target: EventTarget, type: string, fn: (e: Event) => void, opts?: AddEventListenerOptions): void {
    target.addEventListener(type, fn, opts);
    this.disposers.push(() => target.removeEventListener(type, fn, opts));
  }

  private takeEdge(map: Map<Action, number>, a: Action): boolean {
    const t = map.get(a);
    if (!t) return false;
    map.set(a, 0);
    return performance.now() - t <= EDGE_TTL_MS;
  }

  private clearEdges(): void {
    for (const a of ALL_ACTIONS) {
      this.pressedAt.set(a, 0);
      this.releasedAt.set(a, 0);
    }
  }

  private actionOfSource(src: string): Action | null {
    if (src.startsWith("virt:")) return src.slice(5) as Action;
    if (src.startsWith("Mouse")) return MOUSE_ACTIONS[Number(src.slice(5))] ?? null;
    return KEY_ACTIONS[src] ?? null; // movement keys → null
  }

  private sourceDown(src: string, a: Action | null, now: number): void {
    if (this.held.has(src)) return;
    this.held.add(src);
    if (!a) return;
    const n = this.downCount.get(a) ?? 0;
    this.downCount.set(a, n + 1);
    if (n === 0) this.pressedAt.set(a, now);
  }

  private sourceUp(src: string, a: Action | null, now: number): void {
    if (!this.held.delete(src)) return;
    if (!a) return;
    const n = Math.max(0, (this.downCount.get(a) ?? 0) - 1);
    this.downCount.set(a, n);
    if (n === 0) this.releasedAt.set(a, now);
  }

  /** Game input is captured while enabled and either locked or in fallback mode. */
  private get capturing(): boolean {
    return this._enabled && (this.locked || this._fallback);
  }

  private onKeyDown(e: KeyboardEvent): void {
    if (!this.capturing) return;
    const code = e.code;
    const a = KEY_ACTIONS[code];
    const isMove = code in MOVE_KEYS;
    if (!a && !isMove) return;
    // Keep the browser out of game keys (page scroll, Ctrl+D/S/R while crouching, F3 find, ...).
    // Browser-reserved shortcuts such as Ctrl+W cannot be blocked; the HUD guards with beforeunload.
    e.preventDefault();
    if (e.repeat) return;
    this.sourceDown(code, a ?? null, performance.now());
  }

  private onKeyUp(e: KeyboardEvent): void {
    const code = e.code;
    if (!this.held.has(code)) return;
    e.preventDefault();
    this.sourceUp(code, KEY_ACTIONS[code] ?? null, performance.now());
  }

  private onMouseDown(e: MouseEvent): void {
    if (!this.capturing) return;
    const b = e.button;
    if (b < 0 || b > 2) return;
    e.preventDefault(); // middle-click autoscroll, text selection
    const now = performance.now();
    if (this._fallback && !this.locked) {
      if (this.dragButtons === 0) this.skipNextMove = true; // first move after a press can be a warp
      this.dragButtons |= 1 << b;
      if (b === 0) {
        // Decide later whether this is a click (fire), a hold (charge) or a look drag.
        this.pendingFire = { x: e.clientX, y: e.clientY, moved: 0, t: now, converted: false, drag: false };
        return;
      }
    }
    this.sourceDown(`Mouse${b}`, MOUSE_ACTIONS[b], now);
  }

  private onMouseUp(e: MouseEvent): void {
    const b = e.button;
    if (b < 0 || b > 2) return;
    const now = performance.now();
    this.dragButtons &= ~(1 << b);
    if (b === 0 && this.pendingFire) {
      const pf = this.pendingFire;
      this.pendingFire = null;
      if (pf.converted) this.sourceUp("Mouse0", "fire", now);
      else if (!pf.drag && this.capturing) this.tap("fire");
      return;
    }
    this.sourceUp(`Mouse${b}`, MOUSE_ACTIONS[b], now);
  }

  private onMouseMove(e: MouseEvent): void {
    if (!this.capturing) return;
    let dx = e.movementX || 0;
    let dy = e.movementY || 0;
    if (!Number.isFinite(dx) || !Number.isFinite(dy)) return;
    if (this.locked) {
      if (this.skipNextMove) {
        this.skipNextMove = false;
        return;
      }
      if (Math.abs(dx) > MAX_MOUSE_EVENT_DELTA || Math.abs(dy) > MAX_MOUSE_EVENT_DELTA) return;
      this.lookDx += dx;
      this.lookDy += dy;
      return;
    }
    if (!this._fallback || this.dragButtons === 0) return;
    // Drag-to-look fallback.
    if (this.skipNextMove) {
      this.skipNextMove = false;
      return;
    }
    const pf = this.pendingFire;
    if (pf && !pf.converted) {
      pf.moved += Math.abs(dx) + Math.abs(dy);
      if (pf.moved >= DRAG_THRESHOLD_PX) pf.drag = true;
    }
    if (Math.abs(dx) > MAX_MOUSE_EVENT_DELTA || Math.abs(dy) > MAX_MOUSE_EVENT_DELTA) return;
    this.lookDx += dx;
    this.lookDy += dy;
  }

  private onWheel(e: WheelEvent): void {
    if (!this.capturing) return;
    e.preventDefault(); // Ctrl (crouch) + wheel would zoom the page
    let d = e.deltaY;
    if (!Number.isFinite(d) || d === 0) return;
    if (e.deltaMode === 1) d *= 33; // lines → px
    else if (e.deltaMode === 2) d *= 400; // pages → px
    // One physical notch is ~100–120 px on most systems (touchpads send many small deltas, which
    // accumulate to fractional notches); clamp huge momentum bursts.
    const notches = -d / WHEEL_PX_PER_NOTCH;
    this.wheel += Math.max(-3, Math.min(3, notches));
  }

  private handleLockChange(): void {
    const locked = this.locked;
    const requested = this.lockRequested;
    this.lockRequested = false;
    if (locked) {
      this.skipNextMove = true;
      this._fallback = false;
      this.lockFailures = 0;
      this.canvas.focus({ preventScroll: true });
    } else {
      this.lastLockExit = performance.now();
      this.releaseAll();
      // The user left the lock (Escape / Alt+Tab / browser UI) → latch a pause press.
      if (!requested && this._enabled) this.pressedAt.set("pause", performance.now());
    }
    this.emitLock(locked, { requested, fallback: this._fallback });
  }

  private enterFallback(reason: string): void {
    if (this._fallback) return;
    this._fallback = true;
    this.releaseAll();
    this.emitLock(false, { requested: true, fallback: true, error: reason });
  }

  private emitLock(locked: boolean, info: { requested: boolean; fallback: boolean; error?: string }): void {
    for (const l of this.listeners.slice()) {
      try {
        l(locked, info);
      } catch (e) {
        console.error("input lock listener failed", e);
      }
    }
  }
}
