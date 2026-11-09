// Draws one frame: parallax background, decor, terrain, decals, entities, characters,
// particles, and full-screen effects (flash, hurt vignette, darkness).

import { drawBackground } from './background.js';

export class Renderer {
  constructor(game) {
    this.game = game;
  }

  render() {
    const g = this.game;
    const ctx = g.ctx;
    const cam = g.camera;
    const W = g.canvas.width;
    const H = g.canvas.height;
    cam.resize(W, H);
    if (!g.level) {
      ctx.setTransform(1, 0, 0, 1, 0, 0);
      ctx.fillStyle = '#1b1712';
      ctx.fillRect(0, 0, W, H);
      return;
    }
    const theme = g.level.theme;
    drawBackground(ctx, theme, cam, g.time);

    cam.apply(ctx);
    const view = cam.view();
    ctx.lineJoin = 'round';
    ctx.lineCap = 'round';

    g.level.drawDecor(ctx, view, g.time);
    for (const e of g.entities) if (e.layer === 'back' && !e.dead) e.draw(ctx, view);
    g.level.drawTerrain(ctx, view);
    g.particles.drawStaticDecals(ctx, view);
    for (const e of g.entities) if (e.layer === 'mid' && !e.dead && e.kind !== 'debris') e.draw(ctx, view);
    for (const c of g.corpses) c.draw(ctx);
    for (const e of g.entities) if (e.kind === 'debris' && !e.dead) e.draw(ctx, view);
    if (g.player) g.player.draw(ctx);
    for (const e of g.entities) if (e.layer === 'front' && !e.dead) e.draw(ctx, view);
    g.particles.draw(ctx, view);

    // screen-space overlays
    ctx.setTransform(1, 0, 0, 1, 0, 0);
    if (theme.dark) {
      const vg = ctx.createRadialGradient(W / 2, H / 2, H * 0.3, W / 2, H / 2, H * 0.95);
      vg.addColorStop(0, 'rgba(0,0,0,0)');
      vg.addColorStop(1, 'rgba(0,0,0,0.45)');
      ctx.fillStyle = vg;
      ctx.fillRect(0, 0, W, H);
    }
    if (g.hurtFlash > 0) {
      const vg = ctx.createRadialGradient(W / 2, H / 2, H * 0.25, W / 2, H / 2, H * 0.85);
      vg.addColorStop(0, 'rgba(160,0,0,0)');
      vg.addColorStop(1, `rgba(160,0,0,${0.55 * g.hurtFlash})`);
      ctx.fillStyle = vg;
      ctx.fillRect(0, 0, W, H);
    }
    if (g.flash > 0) {
      ctx.fillStyle = `rgba(255,236,190,${0.6 * g.flash})`;
      ctx.fillRect(0, 0, W, H);
    }
    if (g.state === 'dead' && !g.attract) {
      ctx.fillStyle = 'rgba(40,0,0,0.18)';
      ctx.fillRect(0, 0, W, H);
    }
    if (g.timeScale < 1 && g.state !== 'paused') {
      ctx.fillStyle = 'rgba(0,0,0,0.12)';
      ctx.fillRect(0, 0, W, H * 0.06);
      ctx.fillRect(0, H * 0.94, W, H * 0.06);
    }
  }
}
