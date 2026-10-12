// Placeholder title screen.
export class TitleScreen {
  constructor(app) { this.app = app; }
  start() { this.app.game.state = 'title'; }
  tick() {}
  responder() { this.app.startNewGame(1, 2); }
  draw(r) { r.drawPatch('TITLEPIC', 0, 0); }
}
