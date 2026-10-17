// Input adapter for the UI. Uses the engine's HW.input when it exists (down/pressed/released per
// action + text mode) and falls back to its own keyboard listener otherwise (preview harness,
// or an engine that hasn't wired input yet). Also provides menu auto-repeat and "any key".
import { HW } from '../engine/hw.js';

export const ACTIONS = ['up', 'down', 'left', 'right', 'confirm', 'cancel', 'run', 'flashlight',
  'inventory', 'sketchbook', 'compact', 'pause'];

// Fallback bindings (KeyboardEvent.code) — the same keymap as engine/input.js.
export const DEFAULT_KEYS = {
  up: ['ArrowUp', 'KeyW'], down: ['ArrowDown', 'KeyS'], left: ['ArrowLeft', 'KeyA'], right: ['ArrowRight', 'KeyD'],
  confirm: ['KeyZ', 'Enter', 'Space'], cancel: ['KeyX', 'Backspace', 'Escape'],
  run: ['ShiftLeft', 'ShiftRight'], flashlight: ['KeyF'], inventory: ['KeyI', 'Tab'],
  sketchbook: ['KeyM'], compact: ['KeyQ'], pause: ['Escape'],
};

const REPEAT_DELAY = 0.34, REPEAT_RATE = 0.075;

export class UIInput {
  constructor() {
    this._down = new Set(); this._pressed = new Set(); this._released = new Set();
    this._typed = []; this._any = false; this._textMode = false; this._listening = false;
    this._hold = Object.create(null); this._rep = Object.create(null);
    this._codeToActions = new Map();
    for (const [a, codes] of Object.entries(DEFAULT_KEYS)) for (const c of codes) {
      if (!this._codeToActions.has(c)) this._codeToActions.set(c, []);
      this._codeToActions.get(c).push(a);
    }
    this._mouse = { x: 0, y: 0, clicked: false };
  }
  /** Pointer state in UI-buffer px ({ x, y, clicked }); the engine's when it has one. */
  get mouse() { return this.engine?.mouse || this._mouse; }

  /** The engine input, if it implements the action API. */
  get engine() { const i = HW.input; return i && typeof i.pressed === 'function' ? i : null; }

  /** Attach DOM listeners (always: they're passive and only used as a fallback / for any-key). */
  attach(target = typeof window !== 'undefined' ? window : null) {
    if (this._listening || !target) return;
    this._listening = true;
    target.addEventListener('keydown', (e) => {
      this._any = true;
      if (e.key === 'Escape') this._esc = true;
      if (this._textMode) {
        const printable = e.key.length === 1 || e.key === 'Backspace' || e.key === 'Enter';
        if (!this.engineText && (printable || e.key === 'Escape')) this._typed.push(e.key);
        if (printable) { if (e.key === 'Backspace' || e.key === ' ') e.preventDefault?.(); return; } // typing never fires actions
      }
      if (e.repeat) return;
      const acts = this._codeToActions.get(e.code);
      if (acts) for (const a of acts) { if (!this._down.has(a)) this._pressed.add(a); this._down.add(a); }
    });
    target.addEventListener('keyup', (e) => {
      const acts = this._codeToActions.get(e.code);
      if (acts) for (const a of acts) { this._down.delete(a); this._released.add(a); }
    });
    target.addEventListener('pointerdown', () => { this._any = true; this._mouse.clicked = true; });
    target.addEventListener('blur', () => { for (const a of this._down) this._released.add(a); this._down.clear(); });
  }

  get engineText() { const e = this.engine; return !!(e && typeof e.beginText === 'function'); }

  pressed(a) { const e = this.engine; return e ? !!e.pressed(a) : this._pressed.has(a); }
  down(a) { const e = this.engine; return e ? !!e.down?.(a) : this._down.has(a); }
  released(a) { const e = this.engine; return e ? !!e.released?.(a) : this._released.has(a); }
  /** Pressed, or held long enough to auto-repeat (menu navigation). */
  repeat(a) {
    const e = this.engine;
    if (e && typeof e.repeat === 'function') return !!e.repeat(a);
    return this.pressed(a) || !!this._rep[a];
  }
  /** Any key / click this frame (title screen "Press any key"). */
  anyPressed() {
    const e = this.engine;
    if (e && typeof e.anyPressed === 'function' && e.anyPressed()) return true;
    if (this._any) return true;
    for (const a of ACTIONS) if (this.pressed(a)) return true;
    return false;
  }

  beginText() { this._textMode = true; this._typed.length = 0; this.engine?.beginText?.(); }
  endText() { this._textMode = false; this._typed.length = 0; this.engine?.endText?.(); }
  /** Keys typed this frame as strings: single characters, 'Backspace', 'Enter', 'Escape'. */
  typed() {
    if (this.engineText) {
      // engine/input.js accumulates keys in a typed[] array until someone takes them
      const t = typeof this.engine.typed === 'function' ? this.engine.typed() : this.engine.typed;
      if (!t) return [];
      const arr = Array.isArray(t) ? t.splice(0) : String(t).split('');
      return arr.map((k) => (k === '\b' ? 'Backspace' : k === '\n' || k === '\r' ? 'Enter' : k === '\x1b' ? 'Escape' : k));
    }
    return this._typed.slice();
  }

  /** Call once per UI update, before reading input. */
  update(dt) {
    for (const a of ACTIONS) {
      if (this.down(a)) {
        const h = (this._hold[a] || 0) + dt;
        this._hold[a] = h;
        this._rep[a] = false;
        if (h > REPEAT_DELAY) {
          const n0 = Math.floor((h - dt - REPEAT_DELAY) / REPEAT_RATE), n1 = Math.floor((h - REPEAT_DELAY) / REPEAT_RATE);
          this._rep[a] = n1 > n0 || h - dt <= REPEAT_DELAY;
        }
      } else { this._hold[a] = 0; this._rep[a] = false; }
    }
  }
  /** How long an action has been held (s). */
  held(a) { const e = this.engine; return e?.holdTime ? e.holdTime(a) : this._hold[a] || 0; }

  /** Call once per UI update, after everything consumed input (clears fallback edges). */
  endFrame() {
    this._pressed.clear(); this._released.clear(); this._typed.length = 0; this._any = false; this._esc = false; this._mouse.clicked = false;
  }
  /** Escape was pressed this frame (seen by our own listener even when the engine owns input). */
  escPressed() { return !!this._esc; }

  /** Human label for the first key bound to an action ('Z', 'ESC', '←'; pad buttons on a gamepad). */
  keyLabel(a) {
    const e = this.engine;
    if (e?.lastDevice === 'gamepad' && PAD_LABELS[a]) return PAD_LABELS[a];
    let code = e?.keyName?.(a) ?? e?.bindings?.[a]?.[0] ?? e?.keys?.[a]?.[0] ?? DEFAULT_KEYS[a]?.[0] ?? a;
    return prettyKey(code);
  }
}

// Standard-mapping pad buttons as engine/input.js binds them.
const PAD_LABELS = { confirm: 'A', cancel: 'B', flashlight: 'X', inventory: 'Y', compact: 'LB', run: 'RB',
  sketchbook: 'SELECT', pause: 'START', up: '↑', down: '↓', left: '←', right: '→' };

export function prettyKey(code) {
  const s = String(code);
  const map = { ArrowUp: '↑', ArrowDown: '↓', ArrowLeft: '←', ArrowRight: '→', Escape: 'ESC', Enter: 'ENTER',
    Space: 'SPACE', ' ': 'SPACE', ShiftLeft: 'SHIFT', ShiftRight: 'SHIFT', Shift: 'SHIFT', Backspace: 'BKSP', Tab: 'TAB' };
  if (map[s]) return map[s];
  if (/^Key[A-Z]$/.test(s)) return s.slice(3);
  if (/^Digit\d$/.test(s)) return s.slice(5);
  return s.length === 1 ? s.toUpperCase() : s.toUpperCase();
}
