// Placeholder HUD (replaced by the full status bar implementation).
export class Hud {
  constructor(app) { this.app = app; }
  reset() {}
  tick() {}
  message() {}
  draw(r, rect) {
    if (this.app.settings.get('hud') === 'classic') r.drawPatch('STBAR', 0, 168);
  }
}
