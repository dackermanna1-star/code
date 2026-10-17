// STUB — replaced by the lighting agent. Full API: docs/TECH.md §8.
// Minimal behaviour: darkness with a soft hole at the flashlight so the engine is testable.
export const lighting = {
  flashlight: { on: true, x: 0, y: 0, angle: Math.PI / 2, power: 1, flicker: 0 },
  ambient: { color: '#000', level: 0.9 },
  init() {}, onMapLoad(map) { this.ambient.level = map?.data?.dark ?? 0.9; }, update() {},
  setAmbient(color, level) { this.ambient = { color, level }; },
  setGroup() {}, addLight(def) { return def; }, removeLight() {}, lightning() {},
  lightAt() { return 0.5; },
  render(ctx, cam) {
    const f = this.flashlight;
    const x = f.x - cam.x, y = f.y - cam.y;
    const g = ctx.createRadialGradient(x, y, 8, x, y, f.on ? 120 : 30);
    g.addColorStop(0, 'rgba(0,0,0,0)');
    g.addColorStop(1, `rgba(0,0,0,${this.ambient.level})`);
    ctx.fillStyle = g; ctx.fillRect(0, 0, 480, 270);
  },
};
export default lighting;
