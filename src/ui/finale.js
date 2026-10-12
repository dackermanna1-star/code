// Placeholder finale.
export class Finale {
  constructor(app) { this.app = app; }
  start(f) { this.f = f; }
  tick() {}
  responder() { this.app.game.finaleDone(); }
  draw() {}
}
