/**
 * Keyboard / mouse input with pointer lock and rebindable actions (Minecraft defaults).
 */
export type Action =
  | 'forward' | 'back' | 'left' | 'right' | 'jump' | 'sneak' | 'sprint'
  | 'inventory' | 'drop' | 'swapHands' | 'perspective' | 'debug' | 'hideHud' | 'chat' | 'command' | 'pause'
  | 'hotbar1' | 'hotbar2' | 'hotbar3' | 'hotbar4' | 'hotbar5' | 'hotbar6' | 'hotbar7' | 'hotbar8' | 'hotbar9'
  | 'attack' | 'use' | 'pickBlock' | 'screenshot' | 'fullscreen' | 'zoom' | 'playerList'
  /** Vehicle pedals (helicopter yaw); only read while piloting. */
  | 'yawLeft' | 'yawRight';

export const DEFAULT_BINDINGS: Record<Action, string> = {
  forward: 'KeyW', back: 'KeyS', left: 'KeyA', right: 'KeyD', jump: 'Space', sneak: 'ShiftLeft', sprint: 'ControlLeft',
  inventory: 'KeyE', drop: 'KeyQ', swapHands: 'KeyF', perspective: 'F5', debug: 'F3', hideHud: 'F1', chat: 'KeyT', command: 'Slash', pause: 'Escape',
  hotbar1: 'Digit1', hotbar2: 'Digit2', hotbar3: 'Digit3', hotbar4: 'Digit4', hotbar5: 'Digit5', hotbar6: 'Digit6', hotbar7: 'Digit7', hotbar8: 'Digit8', hotbar9: 'Digit9',
  attack: 'Mouse0', use: 'Mouse2', pickBlock: 'Mouse1', screenshot: 'F2', fullscreen: 'F11', zoom: 'KeyC', playerList: 'Tab',
  yawLeft: 'KeyQ', yawRight: 'KeyE',
};

export class Input {
  bindings: Record<Action, string> = { ...DEFAULT_BINDINGS };
  private down = new Set<string>();
  private pressed = new Set<string>();
  private released = new Set<string>();
  private tickPressed = new Set<string>();
  mouseDX = 0;
  mouseDY = 0;
  wheel = 0;
  sensitivity = 0.5;
  invertY = false;
  locked = false;
  /** When false, game actions are ignored (a UI screen is open). */
  enabled = true;
  /** Raw key listeners (UI screens). */
  onKey: ((code: string, down: boolean, e: KeyboardEvent) => boolean | void) | null = null;
  private lastForwardTap = 0;
  doubleTapSprint = false;
  doubleTapJump = false;
  private lastJumpTap = 0;

  constructor(readonly element: HTMLElement) {
    window.addEventListener('keydown', (e) => {
      if (this.onKey && this.onKey(e.code, true, e) === true) return;
      if (e.code === 'Tab' || e.code.startsWith('F') && e.code.length <= 3 || (e.code === 'Space' && this.locked)) e.preventDefault();
      if (e.repeat) return;
      this.handleDown(e.code);
    });
    window.addEventListener('keyup', (e) => {
      if (this.onKey && this.onKey(e.code, false, e) === true) return;
      this.handleUp(e.code);
    });
    element.addEventListener('mousedown', (e) => {
      if (!this.locked) return;
      e.preventDefault();
      this.handleDown('Mouse' + e.button);
    });
    window.addEventListener('mouseup', (e) => this.handleUp('Mouse' + e.button));
    element.addEventListener('contextmenu', (e) => e.preventDefault());
    window.addEventListener('mousemove', (e) => {
      if (!this.locked) return;
      this.mouseDX += e.movementX;
      this.mouseDY += e.movementY;
    });
    element.addEventListener('wheel', (e) => {
      if (!this.locked) return;
      e.preventDefault();
      this.wheel += Math.sign(e.deltaY);
    }, { passive: false });
    document.addEventListener('pointerlockchange', () => {
      this.locked = document.pointerLockElement === this.element;
      if (!this.locked) this.releaseAll();
    });
    window.addEventListener('blur', () => this.releaseAll());
  }

  private handleDown(code: string) {
    if (!this.down.has(code)) {
      this.pressed.add(code);
      this.tickPressed.add(code);
      const now = performance.now();
      if (code === this.bindings.forward) {
        if (now - this.lastForwardTap < 280) this.doubleTapSprint = true;
        this.lastForwardTap = now;
      }
      if (code === this.bindings.jump) {
        if (now - this.lastJumpTap < 280) this.doubleTapJump = true;
        this.lastJumpTap = now;
      }
    }
    this.down.add(code);
  }
  private handleUp(code: string) {
    if (this.down.has(code)) this.released.add(code);
    this.down.delete(code);
  }
  releaseAll() {
    for (const c of this.down) this.released.add(c);
    this.down.clear();
  }

  requestLock() {
    if (this.locked) return;
    const p = (this.element as any).requestPointerLock?.({ unadjustedMovement: true });
    if (p && typeof p.catch === 'function') p.catch(() => (this.element as any).requestPointerLock?.());
  }
  exitLock() {
    if (document.pointerLockElement) document.exitPointerLock();
  }

  /** Held this frame (game actions only when enabled). */
  isDown(a: Action): boolean {
    return this.enabled && this.down.has(this.bindings[a]);
  }
  /** Went down since last `endFrame`. */
  wasPressed(a: Action): boolean {
    return this.enabled && this.pressed.has(this.bindings[a]);
  }
  /** Went down since the last game tick (use from 20 TPS logic). */
  wasPressedTick(a: Action): boolean {
    return this.enabled && this.tickPressed.has(this.bindings[a]);
  }
  endTick() {
    this.tickPressed.clear();
  }
  wasReleased(a: Action): boolean {
    return this.released.has(this.bindings[a]);
  }
  rawPressed(code: string) {
    return this.pressed.has(code);
  }
  rawDown(code: string) {
    return this.down.has(code);
  }
  consumeMouse(): [number, number] {
    const d: [number, number] = [this.mouseDX, this.mouseDY];
    this.mouseDX = this.mouseDY = 0;
    return d;
  }
  consumeWheel(): number {
    const w = this.wheel;
    this.wheel = 0;
    return w;
  }
  consumeDoubleTapSprint(): boolean {
    const v = this.doubleTapSprint;
    this.doubleTapSprint = false;
    return v;
  }
  consumeDoubleTapJump(): boolean {
    const v = this.doubleTapJump;
    this.doubleTapJump = false;
    return v;
  }
  endFrame() {
    this.pressed.clear();
    this.released.clear();
  }
}
