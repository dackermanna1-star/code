// Base class for modal UI screens (menus, documents, special screens, title, game over).
// The UI manager owns the stack: it fades screens in/out, routes input to the focused one and
// resolves the promise returned by HW.ui.open() with the value passed to close().

export const Z_SPECIAL = 10;  // below dialogue (pa, safe, terminal, register, breath): scripts can talk over them
export const Z_MENU = 20;     // above dialogue (pause, inventory, sketchbook, documents, settings...)
export const Z_TOP = 30;      // title & game over (and anything opened from them)

export class Screen {
  constructor(ui, args = {}) {
    this.ui = ui;
    this.args = args || {};
    this.t = 0;              // seconds since open
    this.alpha = 0;          // fade (managed)
    this.fadeIn = 0.16;
    this.fadeOut = 0.14;
    this.closing = false;
    this.result = undefined;
    this.z = Z_MENU;
    this.pausesGame = false; // engine should pause play while open (menus)
    this.dimWorld = 0;       // how much the manager dims everything under this screen
    this._timers = [];
  }
  /** Run fn after `sec` seconds of UI time (pauses with the UI, unlike setTimeout). */
  after(sec, fn) { this._timers.push({ at: this.t + sec, fn }); }
  _tick() {
    if (!this._timers.length) return;
    const due = this._timers.filter((x) => this.t >= x.at);
    if (!due.length) return;
    this._timers = this._timers.filter((x) => this.t < x.at);
    for (const x of due) { try { x.fn(); } catch (e) { console.error('[ui] timer', e); } }
  }
  /** Called once after being pushed. */
  onOpen() {}
  /** dt in seconds; `input` is the UIInput when this screen has focus, else null. */
  update(dt, input) {} // eslint-disable-line no-unused-vars
  render(ctx) {} // eslint-disable-line no-unused-vars
  /** Begin closing; the manager resolves the open() promise after the fade. */
  close(result) {
    if (this.closing) return;
    this.closing = true;
    this.result = result;
    this.onClose?.();
  }
  /** Open a child screen on top (inherits this screen's z). */
  open(name, args) { return this.ui.open(name, args, this); }
}
