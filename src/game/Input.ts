// Keyboard, mouse and gamepad input mapped to game actions.
import type { WeaponId } from '../config/weapons';
import { HUD_WEAPONS } from '../config/weapons';

export type Action =
  | { kind: 'reload' }
  | { kind: 'buyBest' }
  | { kind: 'slot'; id: WeaponId }
  | { kind: 'cycle'; dir: number }
  | { kind: 'pause' };

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
  private keys = new Set<string>();
  private mouseFire = false;
  private actions: Action[] = [];
  private padPrev: boolean[] = [];
  /** When false (menus open), gameplay keys are ignored. */
  enabled = true;
  /** Any key/mouse activity (unlocks audio). */
  onActivity: (() => void) | null = null;

  constructor(target: HTMLElement) {
    window.addEventListener('keydown', (e) => this.onKey(e, true));
    window.addEventListener('keyup', (e) => this.onKey(e, false));
    window.addEventListener('blur', () => {
      this.keys.clear();
      this.mouseFire = false;
    });
    target.addEventListener('mousedown', (e) => {
      this.onActivity?.();
      if (e.button === 0 && this.enabled && (e.target as HTMLElement).closest?.('[data-hud-slot], .hud, .screen') == null) {
        this.mouseFire = true;
      }
    });
    window.addEventListener('mouseup', (e) => {
      if (e.button === 0) this.mouseFire = false;
    });
    target.addEventListener('contextmenu', (e) => e.preventDefault());
  }

  private onKey(e: KeyboardEvent, down: boolean): void {
    this.onActivity?.();
    if (PREVENT.has(e.code) && this.enabled) e.preventDefault();
    if (down) {
      if (e.repeat) return;
      this.keys.add(e.code);
      if (e.code === 'KeyP' || e.code === 'Escape') this.actions.push({ kind: 'pause' });
      if (!this.enabled) return;
      if (e.code === 'KeyR') this.actions.push({ kind: 'reload' });
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
  }
}
