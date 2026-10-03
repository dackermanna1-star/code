// Adaptive quality: watches the frame time and steps quality down (or back up) to stay smooth.

import type { Game } from './Game';

const LEVELS = [
  { pixelRatio: 2, shadows: true, shadowSize: 2048, fx: 1 },
  { pixelRatio: 1.5, shadows: true, shadowSize: 2048, fx: 1 },
  { pixelRatio: 1.25, shadows: true, shadowSize: 1024, fx: 0.8 },
  { pixelRatio: 1, shadows: true, shadowSize: 1024, fx: 0.6 },
  { pixelRatio: 0.85, shadows: false, shadowSize: 512, fx: 0.5 },
];

export class Quality {
  level = 0;
  private acc = 0;
  private frames = 0;
  private slowFor = 0;
  private fastFor = 0;
  private settleT = 3;

  constructor(private game: Game) {
    const dpr = Math.min(window.devicePixelRatio || 1, 2);
    // start at a level that matches the screen
    this.level = dpr >= 2 ? 1 : 2;
    const q = new URLSearchParams(location.search).get('quality');
    if (q !== null) this.level = Math.max(0, Math.min(LEVELS.length - 1, parseInt(q, 10) || 0));
    this.apply();
  }

  private apply() {
    const L = LEVELS[this.level];
    const g = this.game;
    g.renderer.setPixelRatio(Math.min(window.devicePixelRatio || 1, L.pixelRatio));
    // Toggle the light (not renderer.shadowMap.enabled): a lights-state change makes three.js
    // recompile programs, whereas flipping the renderer flag leaves stale shadow samplers bound.
    const sun = g.lights.sun;
    sun.castShadow = L.shadows;
    if (sun.shadow.mapSize.x !== L.shadowSize) {
      sun.shadow.mapSize.set(L.shadowSize, L.shadowSize);
      if (sun.shadow.map) {
        sun.shadow.map.dispose();
        sun.shadow.map = null;
      }
    }
    g.fx.quality = L.fx;
    g.resize();
  }

  update(dt: number) {
    if (dt <= 0) return;
    this.settleT -= dt;
    this.acc += dt;
    this.frames++;
    if (this.acc < 1) return;
    const avg = this.acc / this.frames;
    this.acc = 0;
    this.frames = 0;
    if (this.settleT > 0) return;
    if (avg > 1 / 40) {
      this.slowFor++;
      this.fastFor = 0;
    } else if (avg < 1 / 58) {
      this.fastFor++;
      this.slowFor = 0;
    } else {
      this.slowFor = Math.max(0, this.slowFor - 1);
    }
    if (this.slowFor >= 3 && this.level < LEVELS.length - 1) {
      this.level++;
      this.slowFor = 0;
      this.settleT = 2;
      this.apply();
    } else if (this.fastFor >= 12 && this.level > 0) {
      this.level--;
      this.fastFor = 0;
      this.settleT = 4;
      this.apply();
    }
  }
}
