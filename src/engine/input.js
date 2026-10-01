// Input: keyboard + gamepad devices, per-player controllers, input history
// and fighting-game motion recognition (numpad notation, facing-relative).
(function () {
  'use strict';
  const root = typeof window !== 'undefined' ? window : globalThis;
  const JJK = root.JJK;

  const B = (JJK.BTN = { L: 1, M: 2, H: 4, SP: 8, SU: 16, UN: 32, START: 64, BACK: 128 });
  JJK.BTN_NAMES = { L: 'LIGHT', M: 'MEDIUM', H: 'HEAVY', SP: 'SPECIAL', SU: 'SUPER', UN: 'UNIQUE' };

  // Keyboard layouts. Macro keys map to several buttons at once.
  const KB1 = {
    up: ['KeyW'], down: ['KeyS'], left: ['KeyA'], right: ['KeyD'],
    L: ['KeyJ'], M: ['KeyK'], H: ['KeyL'], SP: ['KeyU'], SU: ['KeyI'], UN: ['KeyO'],
    THROW: ['KeyH'], PARRY: ['KeyY'], DASH: ['Space'],
    START: ['Escape', 'Enter'], BACK: ['Backspace'],
  };
  const KB2 = {
    up: ['ArrowUp'], down: ['ArrowDown'], left: ['ArrowLeft'], right: ['ArrowRight'],
    L: ['Numpad1', 'Comma'], M: ['Numpad2', 'Period'], H: ['Numpad3', 'Slash'],
    SP: ['Numpad4', 'Semicolon'], SU: ['Numpad5', 'Quote'], UN: ['Numpad6', 'BracketLeft'],
    THROW: ['Numpad0'], PARRY: ['NumpadDecimal'], DASH: ['ShiftRight'],
    START: ['NumpadEnter', 'Backslash'], BACK: ['NumpadSubtract'],
  };
  JJK.KB_LAYOUTS = [KB1, KB2];

  const keys = new Set();
  const keysPressed = new Set();
  JJK.keys = keys;
  if (typeof window !== 'undefined') {
    window.addEventListener('keydown', (e) => {
      if (!keys.has(e.code)) keysPressed.add(e.code);
      keys.add(e.code);
      if (JJK.Audio && JJK.Audio.unlock) JJK.Audio.unlock();
      // prevent page scroll / browser shortcuts for game keys
      if (/^(Arrow|Space|Numpad|Slash|Quote|Backspace|Tab|F1|F2|F3|F4)/.test(e.code)) e.preventDefault();
    });
    window.addEventListener('keyup', (e) => keys.delete(e.code));
    window.addEventListener('blur', () => keys.clear());
    window.addEventListener('pointerdown', () => JJK.Audio && JJK.Audio.unlock && JJK.Audio.unlock());
  }
  JJK.keyPressed = (code) => keysPressed.has(code);
  JJK.endInputFrame = () => keysPressed.clear();

  function padState(index) {
    if (index == null || index < 0 || typeof navigator === 'undefined' || !navigator.getGamepads) return null;
    const pads = navigator.getGamepads();
    const p = pads && pads[index];
    if (!p || !p.connected) return null;
    const b = (i) => !!(p.buttons[i] && p.buttons[i].pressed);
    const ax = p.axes[0] || 0, ay = p.axes[1] || 0;
    return {
      up: b(12) || ay < -0.5, down: b(13) || ay > 0.5, left: b(14) || ax < -0.5, right: b(15) || ax > 0.5,
      L: b(2), M: b(3), H: b(5), SP: b(0), SU: b(1), UN: b(7),
      THROW: b(4), PARRY: b(6), DASH: b(10), START: b(9), BACK: b(8),
      any: p.buttons.some((x) => x.pressed),
    };
  }
  JJK.padState = padState;

  // Converts up/down/left/right to an absolute numpad direction (6 = right).
  function toDir(u, d, l, r) {
    if (l && r) l = r = false; // SOCD: neutral
    if (u && d) d = false; // up wins
    const x = r ? 1 : l ? -1 : 0;
    const y = u ? 1 : d ? -1 : 0;
    return 5 + x + y * 3;
  }
  JJK.toDir = toDir;

  // Mirror a numpad direction horizontally.
  const MIRROR = [0, 3, 2, 1, 6, 5, 4, 9, 8, 7];
  JJK.mirrorDir = (d) => MIRROR[d];

  // A controller produces one frame of input per tick: { dir (absolute), held mask, pressed mask }.
  class Controller {
    constructor(kbLayout, padIndex) {
      this.kb = kbLayout;
      this.pad = padIndex;
      this.held = 0;
      this.prevHeld = 0;
      this.pressed = 0;
      this.dir = 5;
      this.dash = false;
      this.virtual = null; // AI / playback override: {dir, held}
      this.enabled = true;
    }
    poll() {
      let u = false, d = false, l = false, r = false, h = 0, dash = false;
      if (this.virtual) {
        this.dir = this.virtual.dir;
        h = this.virtual.held;
      } else if (this.enabled) {
        const k = this.kb;
        // a key tapped and released between two ticks still counts for one tick
        const any = (list) => list && list.some((c) => keys.has(c) || keysPressed.has(c));
        if (k) {
          u = any(k.up); d = any(k.down); l = any(k.left); r = any(k.right);
          if (any(k.L)) h |= B.L;
          if (any(k.M)) h |= B.M;
          if (any(k.H)) h |= B.H;
          if (any(k.SP)) h |= B.SP;
          if (any(k.SU)) h |= B.SU;
          if (any(k.UN)) h |= B.UN;
          if (any(k.THROW)) h |= B.L | B.M;
          if (any(k.PARRY)) h |= B.M | B.H;
          if (any(k.START)) h |= B.START;
          if (any(k.BACK)) h |= B.BACK;
          dash = dash || any(k.DASH);
        }
        const p = padState(this.pad);
        if (p) {
          u = u || p.up; d = d || p.down; l = l || p.left; r = r || p.right;
          if (p.L) h |= B.L;
          if (p.M) h |= B.M;
          if (p.H) h |= B.H;
          if (p.SP) h |= B.SP;
          if (p.SU) h |= B.SU;
          if (p.UN) h |= B.UN;
          if (p.THROW) h |= B.L | B.M;
          if (p.PARRY) h |= B.M | B.H;
          if (p.START) h |= B.START;
          if (p.BACK) h |= B.BACK;
          dash = dash || p.DASH;
        }
        this.dir = toDir(u, d, l, r);
      } else {
        this.dir = 5;
      }
      this.dash = dash;
      this.prevHeld = this.held;
      this.held = h;
      this.pressed = h & ~this.prevHeld;
      return this;
    }
  }
  JJK.Controller = Controller;

  // History of facing-relative input frames for motion detection.
  const HIST = 48;
  class InputBuffer {
    constructor() {
      this.d = new Uint8Array(HIST); // relative dir
      this.h = new Uint8Array(HIST);
      this.p = new Uint8Array(HIST);
      this.i = 0; // index of latest
      this.n = 0;
      this.dashKey = false;
      this.dashPressed = false;
    }
    push(dirRel, held, pressed, dashKey) {
      this.i = (this.i + 1) % HIST;
      this.d[this.i] = dirRel;
      this.h[this.i] = held;
      this.p[this.i] = pressed;
      this.n = Math.min(HIST, this.n + 1);
      this.dashPressed = dashKey && !this.dashKey;
      this.dashKey = dashKey;
    }
    // k = 0 latest, 1 = previous ...
    dir(k = 0) { return this.d[(this.i - k + HIST * 4) % HIST]; }
    held(k = 0) { return this.h[(this.i - k + HIST * 4) % HIST]; }
    pr(k = 0) { return this.p[(this.i - k + HIST * 4) % HIST]; }
    clear() { this.d.fill(5); this.h.fill(0); this.p.fill(0); this.n = 0; }

    // Was button mask pressed in the last `win` frames? (any of the bits when any=true)
    pressedWithin(mask, win = 1) {
      for (let k = 0; k < win; k++) if (this.pr(k) & mask) return true;
      return false;
    }
    // All bits of `mask` pressed within `win` frames of each other, last one within `recent` frames
    chordWithin(mask, win = 3, recent = 1) {
      let seen = 0, lastK = 99;
      for (let k = 0; k < win + recent; k++) {
        const p = this.pr(k) & mask;
        if (p) { seen |= p; lastK = Math.min(lastK, k); }
      }
      // allow "held already + newly pressed" chords
      const heldNow = this.held(0) & mask;
      return (seen | (heldNow && seen ? heldNow : 0)) === mask && lastK < recent;
    }

    // Match a motion sequence ending within `end` frames of now, total window `win`.
    // steps: array of {d:[dirs], opt?:bool}. Returns frame index (age) of the first step or -1.
    motion(steps, win = 16, end = 8) {
      let si = steps.length - 1;
      let k = 0;
      // last step must be found within `end` frames
      let found = -1;
      for (; k < Math.min(end, this.n); k++) {
        if (steps[si].d.includes(this.dir(k))) { found = k; break; }
      }
      if (found < 0) return -1;
      k = found;
      si--;
      let startAge = found;
      while (si >= 0) {
        const st = steps[si];
        let ok = false;
        const k0 = k;
        // search older frames for this step's direction
        for (; k < Math.min(win, this.n); k++) {
          if (st.d.includes(this.dir(k))) { ok = true; startAge = k; break; }
        }
        if (!ok) {
          if (st.opt) { k = k0; si--; continue; }
          return -1;
        }
        si--;
      }
      return startAge;
    }
  }
  JJK.InputBuffer = InputBuffer;

  JJK.MOTIONS = {
    '236': [{ d: [2] }, { d: [3], opt: true }, { d: [6] }],
    '214': [{ d: [2] }, { d: [1], opt: true }, { d: [4] }],
    '623': [{ d: [6] }, { d: [2, 1] }, { d: [3] }],
    '63214': [{ d: [6] }, { d: [3], opt: true }, { d: [2] }, { d: [1], opt: true }, { d: [4] }],
    '22': [{ d: [1, 2, 3] }, { d: [4, 5, 6, 7, 8, 9] }, { d: [1, 2, 3] }],
    '66': [{ d: [6] }, { d: [5, 4, 1, 2, 7, 8] }, { d: [6] }],
    '44': [{ d: [4] }, { d: [5, 6, 3, 2, 9, 8] }, { d: [4] }],
  };
  JJK.MOTION_WIN = { '236': 15, '214': 15, '623': 15, '63214': 24, '22': 16, '66': 12, '44': 12 };
})();
