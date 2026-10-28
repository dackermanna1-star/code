/** Keyboard / mouse / gamepad input with remappable bindings. */

export type Action =
  | 'forward' | 'back' | 'left' | 'right' | 'up' | 'down' | 'rollLeft' | 'rollRight'
  | 'boost' | 'slow' | 'gotoTarget' | 'frameTarget' | 'select' | 'jump' | 'interact'
  | 'throttleUp' | 'throttleDown' | 'throttleFull' | 'throttleCut' | 'flightAssist' | 'gear'
  | 'warp' | 'hyperjump' | 'brake' | 'autopilot' | 'land' | 'cameraView' | 'spawnShip'
  | 'map' | 'menu' | 'help' | 'hideUI' | 'screenshot' | 'timeFaster' | 'timeSlower' | 'timeReal' | 'timePause'
  | 'search' | 'catalog' | 'bookmark' | 'orbits' | 'info' | 'mouseLook' | 'run' | 'orbitCam' | 'scan' | 'labels'
  | 'cinema' | 'pathAdd' | 'pathPlay' | 'dock' | 'shuttle';

export const ACTION_LABELS: Record<Action, string> = {
  forward: 'Move forward / thrust forward', back: 'Move back / thrust back', left: 'Strafe left', right: 'Strafe right',
  up: 'Move up', down: 'Move down', rollLeft: 'Roll left', rollRight: 'Roll right', boost: 'Speed boost ×10',
  slow: 'Precision ×0.1', gotoTarget: 'Travel to selected object', frameTarget: 'Look at selected object',
  select: 'Select object under cursor', jump: 'Jump', interact: 'Enter / exit ship', throttleUp: 'Throttle up',
  throttleDown: 'Throttle down', throttleFull: 'Full throttle', throttleCut: 'Cut throttle', flightAssist: 'Toggle flight assist',
  gear: 'Toggle landing gear', warp: 'Toggle warp drive (speculative)', hyperjump: 'Hyperspace jump to target (speculative)', brake: 'Brake / match target velocity',
  autopilot: 'Autopilot: approach target', land: 'Autopilot: land', cameraView: 'Cockpit / external view',
  spawnShip: 'Spawn / board spacecraft', map: 'Star map', menu: 'Menu / settings', help: 'Controls help', hideUI: 'Hide interface',
  screenshot: 'Screenshot', timeFaster: 'Time ×10', timeSlower: 'Time ÷10', timeReal: 'Real-time', timePause: 'Pause time',
  search: 'Search', catalog: 'Discovery catalog', bookmark: 'Bookmark location', orbits: 'Toggle orbit lines',
  info: 'Toggle info panel', mouseLook: 'Toggle mouse look', run: 'Run', orbitCam: 'Orbit camera around target', scan: 'Scientific scan', labels: 'Toggle labels',
  cinema: 'Cinematic camera paths', pathAdd: 'Add camera keyframe', pathPlay: 'Play / stop camera path',
  dock: 'Auto-dock / undock', shuttle: 'Launch / stow shuttle',
};

export const DEFAULT_BINDINGS: Record<Action, string[]> = {
  forward: ['KeyW'], back: ['KeyS'], left: ['KeyA'], right: ['KeyD'], up: ['KeyR', 'Space'], down: ['KeyF', 'KeyC'],
  rollLeft: ['KeyQ'], rollRight: ['KeyE'], boost: ['ShiftLeft', 'ShiftRight'], slow: ['AltLeft', 'AltRight'],
  gotoTarget: ['KeyG'], frameTarget: ['KeyH'], select: ['Mouse0'], jump: ['Space'], interact: ['KeyX'],
  throttleUp: ['Equal', 'NumpadAdd'], throttleDown: ['Minus', 'NumpadSubtract'], throttleFull: ['KeyZ'], throttleCut: ['Backspace'],
  flightAssist: ['KeyT'], gear: ['KeyL'], warp: ['KeyJ'], hyperjump: ['KeyY'], brake: ['KeyB'], autopilot: ['KeyU'], land: ['KeyK'],
  cameraView: ['KeyV'], spawnShip: ['KeyN'], map: ['KeyM'], menu: ['Escape'], help: ['F1'], hideUI: ['F2'], screenshot: ['F9', 'KeyP'],
  timeFaster: ['Period'], timeSlower: ['Comma'], timeReal: ['Slash'], timePause: ['Pause', 'Backquote'],
  search: ['F3'], catalog: ['F4'], bookmark: ['F5'], orbits: ['KeyO'], info: ['KeyI'], mouseLook: ['Tab'], run: ['ShiftLeft'],
  orbitCam: ['F6'], scan: ['F7'], labels: ['F8'],
  cinema: ['F10'], pathAdd: ['BracketLeft'], pathPlay: ['BracketRight'],
  dock: ['Semicolon'], shuttle: ['Backslash'],
};

export class Input {
  bindings: Record<Action, string[]> = structuredClone(DEFAULT_BINDINGS);
  private down = new Set<string>();
  private pressedQ = new Set<string>();
  mouseDX = 0;
  mouseDY = 0;
  wheel = 0;
  mouseX = 0;
  mouseY = 0;
  dragging = false;
  private dragDist = 0;
  clicked = false;
  pointerLocked = false;
  invertY = false;
  sensitivity = 1;
  /** When true, keys are not processed (text input focused). */
  suspended = false;
  gamepadAxes: number[] = [0, 0, 0, 0];

  constructor(private el: HTMLElement) {
    window.addEventListener('keydown', (e) => {
      if (this.isTyping(e)) return;
      if (['Tab', 'F1', 'F2', 'F3', 'F4', 'F5', 'F6', 'F7', 'F8', 'F9', 'F10', 'Space', 'Backquote', 'Slash'].includes(e.code)) e.preventDefault();
      if (!this.down.has(e.code)) this.pressedQ.add(e.code);
      this.down.add(e.code);
    });
    window.addEventListener('keyup', (e) => this.down.delete(e.code));
    window.addEventListener('blur', () => this.down.clear());
    el.addEventListener('mousedown', (e) => {
      const code = `Mouse${e.button}`;
      this.down.add(code);
      this.dragDist = 0;
      if (e.button === 0 || e.button === 2) this.dragging = true;
    });
    window.addEventListener('mouseup', (e) => {
      const code = `Mouse${e.button}`;
      if (this.down.has(code) && e.button === 0 && this.dragDist < 5 && e.target === this.el) {
        this.pressedQ.add(code);
        this.clicked = true;
      }
      this.down.delete(code);
      this.dragging = false;
    });
    el.addEventListener('contextmenu', (e) => e.preventDefault());
    window.addEventListener('mousemove', (e) => {
      this.mouseX = e.clientX;
      this.mouseY = e.clientY;
      if (this.pointerLocked || this.dragging) {
        this.mouseDX += e.movementX;
        this.mouseDY += e.movementY;
        this.dragDist += Math.abs(e.movementX) + Math.abs(e.movementY);
      }
    });
    el.addEventListener('wheel', (e) => {
      this.wheel += Math.sign(e.deltaY);
      e.preventDefault();
    }, { passive: false });
    document.addEventListener('pointerlockchange', () => {
      this.pointerLocked = document.pointerLockElement === this.el;
    });
  }

  private isTyping(e: KeyboardEvent) {
    const t = e.target as HTMLElement | null;
    return this.suspended || (!!t && (t.tagName === 'INPUT' || t.tagName === 'TEXTAREA' || t.tagName === 'SELECT' || t.isContentEditable));
  }

  requestPointerLock() {
    if (!this.pointerLocked) this.el.requestPointerLock?.();
  }
  exitPointerLock() {
    if (this.pointerLocked) document.exitPointerLock?.();
  }

  held(a: Action): boolean {
    if (this.suspended) return false;
    for (const k of this.bindings[a]) if (this.down.has(k)) return true;
    return false;
  }

  pressed(a: Action): boolean {
    if (this.suspended) return false;
    for (const k of this.bindings[a]) if (this.pressedQ.has(k)) return true;
    return false;
  }

  axis(pos: Action, neg: Action): number {
    return (this.held(pos) ? 1 : 0) - (this.held(neg) ? 1 : 0);
  }

  /** Mouse look delta in radians (consumed). */
  look(): { yaw: number; pitch: number } {
    const k = 0.0022 * this.sensitivity;
    const r = { yaw: -this.mouseDX * k, pitch: -this.mouseDY * k * (this.invertY ? -1 : 1) };
    return r;
  }

  pollGamepad() {
    const pads = navigator.getGamepads?.() ?? [];
    const gp = pads.find((p) => p);
    if (!gp) {
      this.gamepadAxes = [0, 0, 0, 0];
      return;
    }
    const dz = (v: number) => (Math.abs(v) < 0.12 ? 0 : v);
    this.gamepadAxes = [dz(gp.axes[0] ?? 0), dz(gp.axes[1] ?? 0), dz(gp.axes[2] ?? 0), dz(gp.axes[3] ?? 0)];
    this.mouseDX += this.gamepadAxes[2] * 12;
    this.mouseDY += this.gamepadAxes[3] * 12;
  }

  /** Call at end of frame. */
  endFrame() {
    this.pressedQ.clear();
    this.mouseDX = 0;
    this.mouseDY = 0;
    this.wheel = 0;
    this.clicked = false;
  }

  injectPress(code: string) {
    this.pressedQ.add(code);
  }
  setHeld(code: string, on: boolean) {
    if (on) this.down.add(code);
    else this.down.delete(code);
  }
}
