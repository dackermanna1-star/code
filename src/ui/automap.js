// Placeholder automap.
export class Automap {
  constructor(app) { this.app = app; this.active = false; this.fullscreen = true; }
  reset() { this.active = false; }
  toggle() { this.active = !this.active; }
  tick() {}
  follow() {}
  responder() { return false; }
  draw() {}
}
