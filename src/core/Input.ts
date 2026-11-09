/**
 * Keyboard + gamepad input mapped to abstract actions.
 * Analog axes are in [-1, 1]; buttons are booleans.
 */
export interface InputState {
  throttle: number; // 0..1 (forward)
  brake: number; // 0..1 (brake / reverse)
  steer: number; // -1 (left) .. 1 (right)
  pitch: number; // air control: -1 nose down .. 1 nose up
  roll: number; // air control: -1 roll left .. 1 roll right
  boost: boolean;
  fire: boolean;
  handbrake: boolean;
}

const KEYMAP: Record<string, keyof typeof KEY_ACTIONS> = {
  KeyW: "up",
  ArrowUp: "up",
  KeyS: "down",
  ArrowDown: "down",
  KeyA: "left",
  ArrowLeft: "left",
  KeyD: "right",
  ArrowRight: "right",
  ShiftLeft: "boost",
  ShiftRight: "boost",
  Space: "fire",
  KeyQ: "rollLeft",
  KeyE: "rollRight",
  ControlLeft: "handbrake",
  KeyC: "handbrake",
};

const KEY_ACTIONS = {
  up: false,
  down: false,
  left: false,
  right: false,
  boost: false,
  fire: false,
  rollLeft: false,
  rollRight: false,
  handbrake: false,
};

export class Input {
  readonly state: InputState = {
    throttle: 0,
    brake: 0,
    steer: 0,
    pitch: 0,
    roll: 0,
    boost: false,
    fire: false,
    handbrake: false,
  };
  private keys = { ...KEY_ACTIONS };
  private pressedOnce = new Set<string>();
  /** When false (menus), driving input reads as zero. */
  enabled = true;

  constructor(target: Window = window) {
    target.addEventListener("keydown", (e) => {
      const a = KEYMAP[e.code];
      if (a) {
        this.keys[a] = true;
        if (e.code.startsWith("Arrow") || e.code === "Space") e.preventDefault();
      }
      if (!e.repeat) this.pressedOnce.add(e.code);
    });
    target.addEventListener("keyup", (e) => {
      const a = KEYMAP[e.code];
      if (a) this.keys[a] = false;
    });
    target.addEventListener("blur", () => {
      for (const k of Object.keys(this.keys) as (keyof typeof KEY_ACTIONS)[]) this.keys[k] = false;
    });
  }

  /** True once per physical key press (for menu/debug toggles). Consumes the press. */
  consumePress(code: string): boolean {
    if (this.pressedOnce.has(code)) {
      this.pressedOnce.delete(code);
      return true;
    }
    return false;
  }

  /** Call once per frame before systems read `state`. */
  update(): void {
    const k = this.keys;
    let throttle = k.up ? 1 : 0;
    let brake = k.down ? 1 : 0;
    let steer = (k.right ? 1 : 0) - (k.left ? 1 : 0);
    // Air pitch shares the up/down keys (classic side-scroller feel);
    // A/D also roll in the air so Q/E are optional.
    let pitch = (k.up ? 1 : 0) - (k.down ? 1 : 0);
    let roll = (k.rollRight ? 1 : 0) - (k.rollLeft ? 1 : 0);
    let boost = k.boost;
    let fire = k.fire;
    let handbrake = k.handbrake;

    const pads = typeof navigator.getGamepads === "function" ? navigator.getGamepads() : [];
    for (const p of pads) {
      if (!p || !p.connected) continue;
      const dz = (v: number) => (Math.abs(v) < 0.15 ? 0 : v);
      const lx = dz(p.axes[0] ?? 0);
      const ly = dz(p.axes[1] ?? 0);
      const rx = dz(p.axes[2] ?? 0);
      const rt = p.buttons[7]?.value ?? 0;
      const lt = p.buttons[6]?.value ?? 0;
      throttle = Math.max(throttle, rt);
      brake = Math.max(brake, lt);
      if (lx !== 0) steer = lx;
      if (ly !== 0) pitch = -ly;
      if (rx !== 0) roll = rx;
      boost = boost || !!p.buttons[0]?.pressed || !!p.buttons[5]?.pressed;
      fire = fire || !!p.buttons[2]?.pressed || !!p.buttons[4]?.pressed;
      handbrake = handbrake || !!p.buttons[1]?.pressed;
      break;
    }

    const s = this.state;
    if (!this.enabled) {
      s.throttle = s.brake = s.steer = s.pitch = s.roll = 0;
      s.boost = s.fire = s.handbrake = false;
      return;
    }
    s.throttle = throttle;
    s.brake = brake;
    s.steer = steer;
    s.pitch = pitch;
    s.roll = roll;
    s.boost = boost;
    s.fire = fire;
    s.handbrake = handbrake;
  }
}
