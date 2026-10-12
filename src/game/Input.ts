// Keyboard, mouse and gamepad input mapped to game actions.
//
// First person adds mouse look through pointer lock (the game asks for the
// lock; a click on the view while playing captures the mouse, Esc releases it),
// the gamepad's right stick, an analog left stick and the V view toggle.
import type { WeaponId } from '../config/weapons';
import { HUD_WEAPONS } from '../config/weapons';

export type Action =
  | { kind: 'reload' }
  | { kind: 'buyBest' }
  | { kind: 'slot'; id: WeaponId }
  | { kind: 'cycle'; dir: number }
  | { kind: 'pause' }
  | { kind: 'toggleView' };

/** Gamepad stick dead zone (radial), rescaled so motion starts smoothly at the edge. */
const DEAD_ZONE = 0.16;

const MOVE: Record<string, 'left' | 'right' | 'up' | 'down'> = {
  KeyA: 'left',
  ArrowLeft: 'left',
  KeyD: 'right',
  ArrowRight: 'right',
  KeyW: 'up',
  ArrowUp: 'up',
  KeyS: 'down',
  ArrowDown: 'down',
};
const FIRE = new Set(['Space', 'ControlLeft', 'ControlRight']);
const JUMP = new Set(['KeyE', 'ShiftLeft', 'ShiftRight']);
const PREVENT = new Set(['Space', 'Tab', 'ArrowUp', 'ArrowDown', 'ArrowLeft', 'ArrowRight', 'ControlLeft', 'ControlRight']);

export class Input {
  readonly held = { left: false, right: false, up: false, down: false, fire: false, jump: false };
  /** Analog movement from the left stick (x right, y forward), -1..1; zero when keys drive movement. */
  readonly stick = { x: 0, y: 0 };
  /** Right-stick look (x right, y up), -1..1 after the dead zone. */
  readonly padLook = { x: 0, y: 0 };
  private keys = new Set<string>();
  private mouseFire = false;
  private actions: Action[] = [];
  private padPrev: boolean[] = [];
  private lookDX = 0;
  private lookDY = 0;
  private escGuardUntil = 0;
  private wantLock = false;
  /** When false (menus open), gameplay keys are ignored. */
  enabled = true;
  /**
   * First person: a click on the view captures the mouse (pointer lock) instead
   * of firing, and mouse movement is collected as look input while locked.
   */
  pointerLookMode = false;
  /** Any key/mouse activity (unlocks audio). */
  onActivity: (() => void) | null = null;
  /** The pointer lock ended without the game asking for it (Esc, focus loss). */
  onLockLost: (() => void) | null = null;

  constructor(private target: HTMLElement) {
    window.addEventListener('keydown', (e) => this.onKey(e, true));
    window.addEventListener('keyup', (e) => this.onKey(e, false));
    window.addEventListener('blur', () => {
      this.keys.clear();
      this.mouseFire = false;
    });
    target.addEventListener('mousedown', (e) => {
      this.onActivity?.();
      if (e.button !== 0 || !this.enabled) return;
      if (!this.locked && (e.target as HTMLElement).closest?.('[data-hud-slot], .hud, .screen, .sh-screen') != null) return;
      if (this.pointerLookMode && !this.locked) {
        // First click captures the mouse; it does not fire.
        this.requestLock();
        return;
      }
      this.mouseFire = true;
    });
    window.addEventListener('mouseup', (e) => {
      if (e.button === 0) this.mouseFire = false;
    });
    document.addEventListener('mousemove', (e) => {
      if (!this.locked) return;
      // Ignore the occasional bogus spike some browsers report right after locking.
      if (Math.abs(e.movementX) > 400 || Math.abs(e.movementY) > 400) return;
      this.lookDX += e.movementX;
      this.lookDY += e.movementY;
    });
    target.addEventListener(
      'wheel',
      (e) => {
        if (!this.locked || !this.enabled || Math.abs(e.deltaY) < 1) return;
        e.preventDefault();
        this.actions.push({ kind: 'cycle', dir: e.deltaY > 0 ? 1 : -1 });
      },
      { passive: false },
    );
    document.addEventListener('pointerlockchange', () => {
      if (this.locked) return;
      this.mouseFire = false;
      this.lookDX = this.lookDY = 0;
      if (this.wantLock) {
        // Lost without the game releasing it: the browser ate Esc (or focus left).
        this.wantLock = false;
        this.escGuardUntil = performance.now() + 400;
        this.onLockLost?.();
      }
    });
    document.addEventListener('pointerlockerror', () => {
      this.wantLock = false;
    });
    target.addEventListener('contextmenu', (e) => e.preventDefault());
  }

  /** True while the mouse is captured by the game view. */
  get locked(): boolean {
    return typeof document !== 'undefined' && document.pointerLockElement === this.target;
  }

  /** Capture the mouse (needs a recent user gesture; failures are ignored). */
  requestLock(): void {
    if (this.locked || typeof this.target.requestPointerLock !== 'function') return;
    this.wantLock = true;
    try {
      const r = this.target.requestPointerLock() as unknown;
      if (r && typeof (r as Promise<void>).catch === 'function') {
        (r as Promise<void>).catch(() => {
          this.wantLock = false;
        });
      }
    } catch {
      this.wantLock = false;
    }
  }

  /** Release the mouse (menus). Does not report onLockLost. */
  releaseLock(): void {
    this.wantLock = false;
    if (this.locked) document.exitPointerLock?.();
  }

  /** Mouse movement since the last call, CSS px (x right, y down). */
  takeLook(out = { x: 0, y: 0 }): { x: number; y: number } {
    out.x = this.lookDX;
    out.y = this.lookDY;
    this.lookDX = this.lookDY = 0;
    return out;
  }

  private onKey(e: KeyboardEvent, down: boolean): void {
    this.onActivity?.();
    if (PREVENT.has(e.code) && this.enabled) e.preventDefault();
    if (down) {
      if (e.repeat) return;
      this.keys.add(e.code);
      // Esc that just released the pointer lock already paused the game.
      if (e.code === 'Escape' && performance.now() < this.escGuardUntil) return;
      if (e.code === 'KeyP' || e.code === 'Escape') this.actions.push({ kind: 'pause' });
      if (!this.enabled) return;
      if (e.code === 'KeyV') this.actions.push({ kind: 'toggleView' });
      else if (e.code === 'KeyR') this.actions.push({ kind: 'reload' });
      else if (e.code === 'KeyB' || e.code === 'Enter' || e.code === 'NumpadEnter') this.actions.push({ kind: 'buyBest' });
      else if (e.code === 'KeyQ' || e.code === 'Tab') this.actions.push({ kind: 'cycle', dir: e.shiftKey ? -1 : 1 });
      else if (/^Digit[0-9]$/.test(e.code) || /^Numpad[0-9]$/.test(e.code)) {
        const n = Number(e.code.slice(-1));
        this.actions.push({ kind: 'slot', id: HUD_WEAPONS[(n + 9) % 10] });
      }
    } else {
      this.keys.delete(e.code);
    }
  }

  /** Poll gamepads and rebuild held state. Call once per frame. */
  poll(): void {
    const h = this.held;
    h.left = h.right = h.up = h.down = h.fire = h.jump = false;
    this.stick.x = this.stick.y = 0;
    this.padLook.x = this.padLook.y = 0;
    if (this.enabled) {
      for (const k of this.keys) {
        const m = MOVE[k];
        if (m) h[m] = true;
        if (FIRE.has(k)) h.fire = true;
        if (JUMP.has(k)) h.jump = true;
      }
      if (this.mouseFire) h.fire = true;
    }
    const pads = navigator.getGamepads ? navigator.getGamepads() : [];
    for (const pad of pads) {
      if (!pad) continue;
      const b = (i: number) => !!pad.buttons[i]?.pressed;
      const edge = (i: number) => {
        const now = b(i);
        const was = this.padPrev[i] ?? false;
        this.padPrev[i] = now;
        return now && !was;
      };
      if (edge(9)) this.actions.push({ kind: 'pause' });
      if (!this.enabled) continue;
      const ax = pad.axes[0] ?? 0;
      const ay = pad.axes[1] ?? 0;
      if (ax < -0.35 || b(14)) h.left = true;
      if (ax > 0.35 || b(15)) h.right = true;
      if (ay < -0.35 || b(12)) h.up = true;
      if (ay > 0.35 || b(13)) h.down = true;
      deadZone(ax, -ay, this.stick);
      deadZone(pad.axes[2] ?? 0, -(pad.axes[3] ?? 0), this.padLook);
      if (edge(10) || edge(8)) this.actions.push({ kind: 'toggleView' });
      if (b(0) || b(7)) h.fire = true;
      if (b(1)) h.jump = true;
      if (edge(2)) this.actions.push({ kind: 'reload' });
      if (edge(3)) this.actions.push({ kind: 'cycle', dir: 1 });
      if (edge(5)) this.actions.push({ kind: 'buyBest' });
      if (edge(4)) this.actions.push({ kind: 'cycle', dir: -1 });
      break;
    }
  }

  takeActions(): Action[] {
    const a = this.actions;
    this.actions = [];
    return a;
  }

  clear(): void {
    this.keys.clear();
    this.mouseFire = false;
    this.actions.length = 0;
    this.lookDX = this.lookDY = 0;
  }
}

/** Radial dead zone with rescaling; writes (x, y) into out. */
function deadZone(x: number, y: number, out: { x: number; y: number }): void {
  const m = Math.hypot(x, y);
  if (m < DEAD_ZONE) {
    out.x = out.y = 0;
    return;
  }
  const k = Math.min(1, (m - DEAD_ZONE) / (1 - DEAD_ZONE)) / m;
  out.x = x * k;
  out.y = y * k;
}
