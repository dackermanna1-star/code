// Placeholder intermission.
export class Intermission {
  constructor(app) { this.app = app; }
  start(stats) { this.stats = stats; }
  tick() {}
  responder() { this.app.game.advance(); }
  draw(r) { r.drawPatch('INTERPIC', 0, 0); }
}
