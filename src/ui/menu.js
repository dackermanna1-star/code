// Placeholder menu.
export class Menu {
  constructor(app) { this.app = app; this.active = false; }
  open() { this.active = true; }
  close() { this.active = false; }
  responder(code) { if (code === 'Escape') this.close(); return true; }
  tick() {}
  draw() {}
}
