// Keyboard, mouse and gamepad → the Bosun's controls (DESIGN.md §3).
//
//   Move           W A S D / arrows / left stick / d-pad
//   Fire (hold)    Space / J / K / left mouse / pad A or RT
//                  (not Ctrl: with W A S D under the other hand, Ctrl+W
//                  closes the tab, Ctrl+S / D / A open browser dialogs)
//   Reload         R / pad X
//   Buy best       B or Enter / pad Y
//   Select or buy  1–6 / click a weapon tile
//   Cycle          Q / Tab / mouse wheel (both ways) / pad LB, RB
//   Stomp          E / Shift / right mouse / pad B
//   Ferry horn     H / pad L3 or Back
//   Cannon strike  F / pad LT or R3
//   Pause          P / Esc / pad Start
//
// Held state is rebuilt every frame (poll); one-shot verbs (stomp, horn,
// cannon) are latched per press so a tap shorter than a logic tick, or one
// made during a hit-stop, still reaches the next tick. Menu screens (src/ui
// Screens) swallow their own keydowns; while a menu is open the gamepad
// drives it through synthetic key events. While playing, every game key and
// every Ctrl / ⌘ combination has its browser default suppressed.
import { WEAPON_ORDER, type WeaponId } from '../config/ids';

export type Action =
  | { kind: 'reload' }
  | { kind: 'buyBest' }
  | { kind: 'slot'; id: WeaponId }
  | { kind: 'cycle'; dir: number }
  | { kind: 'pause' }
  /** Ctrl was pressed while playing (Seal Hunter's fire key): the app explains the fire keys once. */
  | { kind: 'ctrlHint' }
  /** A one-shot verb was pressed (it also reaches the logic via tickInput; this is for feedback). */
  | { kind: 'press'; verb: 'horn' | 'cannon' };

export interface HeldInput {
  left: boolean;
  right: boolean;
  up: boolean;
  down: boolean;
  fire: boolean;
  jump: boolean;
  horn: boolean;
  cannon: boolean;
}

type Verb = 'jump' | 'horn' | 'cannon';

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
const FIRE = new Set(['Space', 'KeyJ', 'KeyK']);
const VERBS: Record<string, Verb> = {
  KeyE: 'jump',
  ShiftLeft: 'jump',
  ShiftRight: 'jump',
  KeyH: 'horn',
  KeyF: 'cannon',
};
/** Other keys the game reads (their browser default is suppressed while playing). */
const KEYS = new Set(['Tab', 'KeyQ', 'KeyR', 'KeyB', 'Enter', 'NumpadEnter', 'Slash', 'Quote', 'Backspace']);
/** Game keys: scrolling, focus moves, quick-find and the like are suppressed while playing. */
const isGameKey = (code: string) => code in MOVE || FIRE.has(code) || code in VERBS || KEYS.has(code) || /^(?:Digit|Numpad)[1-6]$/.test(code);

/** Standard-mapping gamepad buttons. */
const PAD = { A: 0, B: 1, X: 2, Y: 3, LB: 4, RB: 5, LT: 6, RT: 7, BACK: 8, START: 9, L3: 10, R3: 11, UP: 12, DOWN: 13, LEFT: 14, RIGHT: 15 } as const;
const STICK = 0.4;

export class Input {
  readonly held: HeldInput = { left: false, right: false, up: false, down: false, fire: false, jump: false, horn: false, cannon: false };
  /** When false (menus, title, cut-scenes) gameplay input is ignored. */
  enabled = false;
  /** A menu is open: the gamepad navigates it (synthetic key events). */
  menuOpen: () => boolean = () => false;
  /** Any key / mouse / pad activity (unlocks audio). */
  onActivity: (() => void) | null = null;
  /** The window lost focus or the tab was hidden (auto-pause). */
  onFocusLost: (() => void) | null = null;
  /** Last device used ('keyboard' | 'pad'): hints can follow it. */
  device: 'keyboard' | 'pad' = 'keyboard';

  private keys = new Set<string>();
  private mouseFire = false;
  private mouseStomp = false;
  private actions: Action[] = [];
  private latched: Record<Verb, boolean> = { jump: false, horn: false, cannon: false };
  private padPrev: boolean[] = [];
  private padMuted: boolean[] = [];
  private padAxisPrev = { x: 0, y: 0 };
  private padRepeatAt = 0;
  private padHeld: HeldInput = { left: false, right: false, up: false, down: false, fire: false, jump: false, horn: false, cannon: false };

  constructor(private readonly target: HTMLElement) {
    window.addEventListener('keydown', (e) => this.onKey(e, true));
    window.addEventListener('keyup', (e) => this.onKey(e, false));
    window.addEventListener('blur', () => {
      this.clear();
      this.onFocusLost?.();
    });
    document.addEventListener('visibilitychange', () => {
      if (document.hidden) {
        this.clear();
        this.onFocusLost?.();
      }
    });
    const down = (e: MouseEvent) => {
      this.onActivity?.();
      this.device = 'keyboard';
      if (!this.enabled) return;
      // HUD tiles and menu screens stop their own events; anything else on the view is the deck.
      if ((e.target as HTMLElement | null)?.closest?.('.lf-tile, .lf-screen, .screen')) return;
      if (e.button === 0) this.mouseFire = true;
      else if (e.button === 2) {
        this.mouseStomp = true;
        this.latched.jump = true;
      }
    };
    target.addEventListener('mousedown', down);
    window.addEventListener('mouseup', (e) => {
      if (e.button === 0) this.mouseFire = false;
      else if (e.button === 2) this.mouseStomp = false;
    });
    target.addEventListener('contextmenu', (e) => e.preventDefault());
    target.addEventListener(
      'wheel',
      (e) => {
        if (!this.enabled || Math.abs(e.deltaY) < 1) return;
        e.preventDefault();
        this.actions.push({ kind: 'cycle', dir: e.deltaY > 0 ? 1 : -1 });
      },
      { passive: false },
    );
    target.addEventListener('pointerdown', () => this.onActivity?.());
    target.addEventListener('touchstart', () => this.onActivity?.(), { passive: true });
  }

  private onKey(e: KeyboardEvent, down: boolean): void {
    this.onActivity?.();
    this.device = 'keyboard';
    // Ctrl / ⌘ combinations (save, bookmark, select all, find …) never reach the browser mid-game
    // (pages can't stop Ctrl+W, which is why Ctrl isn't a fire key).
    if (this.enabled && (isGameKey(e.code) || e.ctrlKey || e.metaKey)) e.preventDefault();
    if (!down) {
      this.keys.delete(e.code);
      return;
    }
    if (e.repeat) return;
    this.keys.add(e.code);
    if (e.code === 'KeyP' || e.code === 'Escape') {
      this.actions.push({ kind: 'pause' });
      return;
    }
    if (!this.enabled) return;
    if (e.code === 'ControlLeft' || e.code === 'ControlRight') this.actions.push({ kind: 'ctrlHint' });
    const verb = VERBS[e.code];
    if (verb) {
      this.latched[verb] = true;
      if (verb !== 'jump') this.actions.push({ kind: 'press', verb });
    }
    if (e.code === 'KeyR') this.actions.push({ kind: 'reload' });
    else if (e.code === 'KeyB' || e.code === 'Enter' || e.code === 'NumpadEnter') this.actions.push({ kind: 'buyBest' });
    else if (e.code === 'KeyQ' || e.code === 'Tab') this.actions.push({ kind: 'cycle', dir: 1 });
    else {
      const m = /^(?:Digit|Numpad)([1-6])$/.exec(e.code);
      if (m) this.actions.push({ kind: 'slot', id: WEAPON_ORDER[Number(m[1]) - 1] });
    }
  }

  /** Rebuild held state from keys, mouse and gamepads. Call once per frame. */
  poll(now = performance.now()): void {
    const h = this.held;
    h.left = h.right = h.up = h.down = h.fire = h.jump = h.horn = h.cannon = false;
    if (this.enabled) {
      for (const k of this.keys) {
        const m = MOVE[k];
        if (m) h[m] = true;
        if (FIRE.has(k)) h.fire = true;
        const v = VERBS[k];
        if (v) h[v] = true;
      }
      if (this.mouseFire) h.fire = true;
      if (this.mouseStomp) h.jump = true;
    }
    this.pollPads(now);
  }

  private pollPads(now: number): void {
    const pads = typeof navigator !== 'undefined' && navigator.getGamepads ? navigator.getGamepads() : [];
    const ph = this.padHeld;
    ph.left = ph.right = ph.up = ph.down = ph.fire = ph.jump = ph.horn = ph.cannon = false;
    for (const pad of pads) {
      if (!pad || !pad.connected) continue;
      const n = pad.buttons.length;
      const now0: boolean[] = new Array(n);
      for (let i = 0; i < n; i++) now0[i] = !!pad.buttons[i]?.pressed || (pad.buttons[i]?.value ?? 0) > 0.5;
      const b = (i: number) => now0[i] ?? false;
      const edge = (i: number) => b(i) && !(this.padPrev[i] ?? false);
      const ax = pad.axes[0] ?? 0;
      const ay = pad.axes[1] ?? 0;
      if (now0.some(Boolean) || Math.abs(ax) > STICK || Math.abs(ay) > STICK) {
        this.device = 'pad';
        this.onActivity?.();
      }
      const left = ax < -STICK || b(PAD.LEFT);
      const right = ax > STICK || b(PAD.RIGHT);
      const up = ay < -STICK || b(PAD.UP);
      const down = ay > STICK || b(PAD.DOWN);

      // Buttons held while a menu was up (A on "Play", B to resume) stay muted until released.
      const live = this.enabled && !this.menuOpen();
      for (let i = 0; i < n; i++) this.padMuted[i] = now0[i] && (!live || (this.padMuted[i] ?? false));
      const g = (i: number) => b(i) && !this.padMuted[i];

      if (this.menuOpen()) {
        // Navigate menus with synthetic keys (Screens reads KeyboardEvent.code), with key repeat on hold.
        const dirX = left ? -1 : right ? 1 : 0;
        const dirY = up ? -1 : down ? 1 : 0;
        const changed = dirX !== this.padAxisPrev.x || dirY !== this.padAxisPrev.y;
        if ((dirX || dirY) && (changed || now >= this.padRepeatAt)) {
          this.padRepeatAt = now + (changed ? 380 : 140);
          if (dirY) synthKey(dirY < 0 ? 'ArrowUp' : 'ArrowDown');
          else synthKey(dirX < 0 ? 'ArrowLeft' : 'ArrowRight');
        }
        this.padAxisPrev.x = dirX;
        this.padAxisPrev.y = dirY;
        if (edge(PAD.A)) synthKey('Enter');
        if (edge(PAD.B) || edge(PAD.START)) synthKey('Escape');
      } else {
        this.padAxisPrev.x = this.padAxisPrev.y = 0;
        if (edge(PAD.START)) this.actions.push({ kind: 'pause' });
        if (this.enabled) {
          ph.left = left;
          ph.right = right;
          ph.up = up;
          ph.down = down;
          ph.fire = g(PAD.A) || g(PAD.RT);
          ph.jump = g(PAD.B);
          ph.horn = g(PAD.L3) || g(PAD.BACK);
          ph.cannon = g(PAD.LT) || g(PAD.R3);
          if (edge(PAD.B)) this.latched.jump = true;
          if (edge(PAD.L3) || edge(PAD.BACK)) {
            this.latched.horn = true;
            this.actions.push({ kind: 'press', verb: 'horn' });
          }
          if (edge(PAD.LT) || edge(PAD.R3)) {
            this.latched.cannon = true;
            this.actions.push({ kind: 'press', verb: 'cannon' });
          }
          if (edge(PAD.X)) this.actions.push({ kind: 'reload' });
          if (edge(PAD.Y)) this.actions.push({ kind: 'buyBest' });
          if (edge(PAD.RB)) this.actions.push({ kind: 'cycle', dir: 1 });
          if (edge(PAD.LB)) this.actions.push({ kind: 'cycle', dir: -1 });
        }
      }
      this.padPrev = now0;
      break;
    }
    const h = this.held;
    h.left ||= ph.left;
    h.right ||= ph.right;
    h.up ||= ph.up;
    h.down ||= ph.down;
    h.fire ||= ph.fire;
    h.jump ||= ph.jump;
    h.horn ||= ph.horn;
    h.cannon ||= ph.cannon;
  }

  /**
   * The input for one logic tick: held state plus any latched press (so a
   * press always reaches the logic as a rising edge). Call once per tick;
   * latches are consumed.
   */
  tickInput(out: HeldInput): HeldInput {
    const h = this.held;
    out.left = h.left;
    out.right = h.right;
    out.up = h.up;
    out.down = h.down;
    out.fire = h.fire;
    out.jump = h.jump || this.latched.jump;
    out.horn = h.horn || this.latched.horn;
    out.cannon = h.cannon || this.latched.cannon;
    this.latched.jump = this.latched.horn = this.latched.cannon = false;
    return out;
  }

  takeActions(): Action[] {
    const a = this.actions;
    this.actions = [];
    return a;
  }

  /** Forget everything held or queued (new game, menus, focus loss). */
  clear(): void {
    this.keys.clear();
    this.mouseFire = false;
    this.mouseStomp = false;
    this.actions.length = 0;
    this.latched.jump = this.latched.horn = this.latched.cannon = false;
  }

  /** The view element input is read from. */
  get element(): HTMLElement {
    return this.target;
  }
}

function synthKey(code: string): void {
  const key = code === 'Enter' ? 'Enter' : code === 'Escape' ? 'Escape' : code;
  window.dispatchEvent(new KeyboardEvent('keydown', { code, key, bubbles: true, cancelable: true }));
  window.dispatchEvent(new KeyboardEvent('keyup', { code, key, bubbles: true, cancelable: true }));
}
