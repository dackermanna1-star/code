// Keyboard + touch input mapped to abstract actions.

const KEYMAP = {
  ArrowUp: 'up', KeyW: 'up',
  ArrowDown: 'down', KeyS: 'down',
  ArrowLeft: 'left', KeyA: 'left',
  ArrowRight: 'right', KeyD: 'right',
  Space: 'primary',
  ShiftLeft: 'secondary', ShiftRight: 'secondary', KeyX: 'secondary',
  KeyZ: 'eject',
  Enter: 'respawn', NumpadEnter: 'respawn',
  KeyR: 'restart',
  Escape: 'pause', KeyP: 'pause',
  KeyM: 'mute',
};

const BLOCK_DEFAULT = new Set(['ArrowUp', 'ArrowDown', 'ArrowLeft', 'ArrowRight', 'Space']);

export class Input {
  constructor() {
    this.keys = Object.create(null);
    this.virtual = Object.create(null);
    this.pressedSet = new Set();
    this.auto = null; // autopilot override: object of action -> bool
    this.enabled = true;

    window.addEventListener('keydown', (e) => {
      const tag = (e.target && e.target.tagName) || '';
      if (tag === 'INPUT' || tag === 'SELECT' || tag === 'TEXTAREA') return;
      const a = KEYMAP[e.code];
      if (BLOCK_DEFAULT.has(e.code)) e.preventDefault();
      if (!a) return;
      if (!e.repeat && !this.keys[a]) this.pressedSet.add(a);
      this.keys[a] = true;
    });
    window.addEventListener('keyup', (e) => {
      const a = KEYMAP[e.code];
      if (a) this.keys[a] = false;
    });
    window.addEventListener('blur', () => {
      for (const k in this.keys) this.keys[k] = false;
    });
  }

  isDown(a) {
    if (this.auto) return !!this.auto[a];
    return !!(this.keys[a] || this.virtual[a]);
  }

  pressed(a) {
    if (this.auto) return false;
    return this.pressedSet.has(a);
  }

  /** Pressed-edge for gameplay actions also honours autopilot one-shots. */
  gamePressed(a) {
    if (this.auto) return !!(this.auto._edges && this.auto._edges.has(a));
    return this.pressedSet.has(a);
  }

  setVirtual(a, v) {
    if (v && !this.virtual[a]) this.pressedSet.add(a);
    this.virtual[a] = v;
  }

  endFrame() {
    this.pressedSet.clear();
    if (this.auto && this.auto._edges) this.auto._edges.clear();
  }
}
