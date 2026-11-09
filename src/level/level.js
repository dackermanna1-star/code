// Runtime representation of a level: static terrain bodies, terrain rendering with
// procedural textures, and scattered decoration.

import { Vec2, Chain } from 'planck';
import { CAT, MASK } from '../config.js';
import { LevelBuilder } from './builder.js';
import { THEMES } from './themes.js';
import { mulberry32 } from '../core/math.js';
import { drawDecor } from '../render/decor.js';

const BOTTOM_PAD = 40;
const patternCache = new Map();

function makePattern(ctx, key, painter) {
  if (patternCache.has(key)) return patternCache.get(key);
  const c = document.createElement('canvas');
  c.width = 256;
  c.height = 256;
  const g = c.getContext('2d');
  painter(g, 256);
  const pat = ctx.createPattern(c, 'repeat');
  patternCache.set(key, pat);
  return pat;
}

function groundPainter(gr, rnd) {
  return (g, S) => {
    g.fillStyle = gr.fill;
    g.fillRect(0, 0, S, S);
    if (gr.strata) {
      for (let y = 0; y < S; y += 32) {
        g.fillStyle = y % 64 ? gr.dark : gr.pebble;
        g.globalAlpha = 0.35;
        g.fillRect(0, y + rnd() * 6, S, 10 + rnd() * 8);
      }
      g.globalAlpha = 1;
    }
    if (gr.plates) {
      g.strokeStyle = gr.dark;
      g.lineWidth = 4;
      for (let y = 0; y < S; y += 64) for (let x = 0; x < S; x += 128) g.strokeRect(x + ((y / 64) % 2) * 64, y, 128, 64);
      g.fillStyle = gr.pebble;
      for (let y = 0; y < S; y += 64) for (let x = 0; x < S; x += 64) {
        g.beginPath();
        g.arc(x + 8, y + 8, 3, 0, Math.PI * 2);
        g.fill();
      }
      return;
    }
    for (let i = 0; i < 70; i++) {
      g.fillStyle = rnd() > 0.5 ? gr.pebble : gr.dark;
      g.globalAlpha = 0.5 + rnd() * 0.4;
      g.beginPath();
      g.ellipse(rnd() * S, rnd() * S, 3 + rnd() * 9, 2 + rnd() * 6, rnd() * 3, 0, Math.PI * 2);
      g.fill();
    }
    g.globalAlpha = 1;
    if (gr.lava) {
      g.strokeStyle = 'rgba(255,90,20,0.35)';
      g.lineWidth = 3;
      for (let i = 0; i < 6; i++) {
        g.beginPath();
        let x = rnd() * S;
        let y = rnd() * S;
        g.moveTo(x, y);
        for (let k = 0; k < 5; k++) {
          x += (rnd() - 0.5) * 60;
          y += rnd() * 40;
          g.lineTo(x, y);
        }
        g.stroke();
      }
    }
  };
}

function blockPainter(color, style, rnd) {
  return (g, S) => {
    g.fillStyle = color;
    g.fillRect(0, 0, S, S);
    if (style === 'metal') {
      g.strokeStyle = 'rgba(0,0,0,0.35)';
      g.lineWidth = 4;
      for (let y = 0; y < S; y += 64) for (let x = 0; x < S; x += 128) g.strokeRect(x, y, 128, 64);
      g.fillStyle = 'rgba(255,255,255,0.35)';
      for (let y = 0; y < S; y += 64) for (let x = 0; x < S; x += 128) {
        for (const [ox, oy] of [[10, 10], [118, 10], [10, 54], [118, 54]]) {
          g.beginPath();
          g.arc(x + ox, y + oy, 3, 0, Math.PI * 2);
          g.fill();
        }
      }
    } else if (style === 'wood') {
      g.strokeStyle = 'rgba(60,35,15,0.45)';
      g.lineWidth = 3;
      for (let y = 0; y < S; y += 32) {
        g.beginPath();
        g.moveTo(0, y);
        g.lineTo(S, y);
        g.stroke();
        g.beginPath();
        const x = ((y * 37) % S) + 10;
        g.moveTo(x, y);
        g.lineTo(x, y + 32);
        g.stroke();
      }
    } else if (style === 'concrete') {
      for (let i = 0; i < 200; i++) {
        g.fillStyle = rnd() > 0.5 ? 'rgba(0,0,0,0.12)' : 'rgba(255,255,255,0.1)';
        g.fillRect(rnd() * S, rnd() * S, 3, 3);
      }
      g.strokeStyle = 'rgba(0,0,0,0.2)';
      g.lineWidth = 3;
      for (let y = 0; y < S; y += 128) {
        g.beginPath();
        g.moveTo(0, y);
        g.lineTo(S, y);
        g.stroke();
      }
    } else {
      for (let i = 0; i < 40; i++) {
        g.fillStyle = rnd() > 0.5 ? 'rgba(0,0,0,0.15)' : 'rgba(255,255,255,0.08)';
        g.beginPath();
        g.ellipse(rnd() * S, rnd() * S, 6 + rnd() * 18, 4 + rnd() * 10, rnd() * 3, 0, Math.PI * 2);
        g.fill();
      }
    }
  };
}

export class Level {
  constructor(game, def) {
    this.game = game;
    this.def = def;
    this.theme = THEMES[def.theme] || THEMES.meadow;
    const b = new LevelBuilder(def);
    def.build(b);
    this.data = b.result();
    this.computeBounds();
    this.scatterDecor();
  }

  computeBounds() {
    let minX = Infinity;
    let maxX = -Infinity;
    let minY = Infinity;
    for (const p of this.data.paths) {
      for (const [x, y] of p) {
        minX = Math.min(minX, x);
        maxX = Math.max(maxX, x);
        minY = Math.min(minY, y);
      }
    }
    for (const bl of this.data.blocks) for (const [x, y] of bl.pts) minY = Math.min(minY, y);
    this.minX = minX;
    this.maxX = maxX;
    this.bottom = minY - BOTTOM_PAD;
    this.killY = minY - 25;
  }

  createPhysics(phys) {
    const filter = { filterCategoryBits: CAT.TERRAIN, filterMaskBits: MASK.TERRAIN };
    this.terrainBody = phys.body({ type: 'static' }, { kind: 'terrain', material: 'ground' });
    for (const p of this.data.paths) {
      const pts = [[p[0][0], this.bottom], ...p, [p[p.length - 1][0], this.bottom]];
      const verts = pts.map(([x, y]) => new Vec2(x, y));
      this.terrainBody.createFixture(new Chain(verts, false), { friction: 0.9, ...filter });
    }
    for (const bl of this.data.blocks) {
      const verts = bl.pts.map(([x, y]) => new Vec2(x, y));
      this.terrainBody.createFixture(new Chain(verts, true), { friction: 0.85, ...filter });
    }
  }

  groundAt(x) {
    let best = null;
    for (const p of this.data.paths) {
      for (let i = 0; i < p.length - 1; i++) {
        const [x0, y0] = p[i];
        const [x1, y1] = p[i + 1];
        if (x1 - x0 < 1e-6) continue;
        if (x >= x0 && x <= x1) {
          const y = y0 + ((y1 - y0) * (x - x0)) / (x1 - x0);
          if (best === null || y > best) best = { y, slope: (y1 - y0) / (x1 - x0) };
        }
      }
    }
    return best;
  }

  scatterDecor() {
    const th = this.theme;
    const rnd = mulberry32((this.def.seed || 7) * 9973 + 11);
    const out = [...this.data.decor.map((d) => ({ s: 1, v: 0.5, theme: this.def.theme, ...d }))];
    const avoid = this.data.objects.map((o) => o.x).filter((x) => x !== undefined);
    const noDecor = this.data.noDecor;
    for (const p of this.data.paths) {
      for (let i = 0; i < p.length - 1; i++) {
        const [x0, y0] = p[i];
        const [x1, y1] = p[i + 1];
        const len = x1 - x0;
        if (len <= 0.1) continue;
        const slope = Math.abs((y1 - y0) / len);
        if (slope > 0.5) continue;
        const count = len * th.density;
        let n = Math.floor(count) + (rnd() < count % 1 ? 1 : 0);
        for (let k = 0; k < n; k++) {
          const x = x0 + rnd() * len;
          if (avoid.some((ax) => Math.abs(ax - x) < 2.5)) continue;
          if (noDecor.some(([a, b]) => x > a && x < b)) continue;
          const y = y0 + ((y1 - y0) * (x - x0)) / len;
          const type = th.decor[Math.floor(rnd() * th.decor.length)];
          out.push({ type, x, y: y - 0.05, s: 0.7 + rnd() * 0.6, v: rnd(), flip: rnd() < 0.5, theme: this.def.theme });
        }
      }
    }
    out.sort((a, b) => (b.s || 1) - (a.s || 1));
    this.decor = out;
  }

  // ------------------------------------------------------------------ drawing

  ensureRender(ctx) {
    if (this.paths2d) return;
    const gr = this.theme.ground;
    const key = this.def.theme;
    const rnd = mulberry32(42);
    this.groundPat = makePattern(ctx, 'g:' + key, groundPainter(gr, rnd));
    this.blockPats = {};
    for (const [style, color] of Object.entries(this.theme.blocks)) {
      this.blockPats[style] = makePattern(ctx, `b:${key}:${style}`, blockPainter(color, style, mulberry32(7)));
    }
    this.paths2d = this.data.paths.map((p) => {
      const fill = new Path2D();
      fill.moveTo(p[0][0], this.bottom);
      for (const [x, y] of p) fill.lineTo(x, y);
      fill.lineTo(p[p.length - 1][0], this.bottom);
      fill.closePath();
      // grass/top surface only along walkable slopes (not up cliff faces)
      const top = new Path2D();
      let pen = false;
      for (let i = 0; i < p.length - 1; i++) {
        const [x0, y0] = p[i];
        const [x1, y1] = p[i + 1];
        const steep = Math.abs(y1 - y0) > Math.abs(x1 - x0) * 2.5;
        if (steep) {
          pen = false;
          continue;
        }
        if (!pen) top.moveTo(x0, y0);
        top.lineTo(x1, y1);
        pen = true;
      }
      return { fill, top, x0: p[0][0], x1: p[p.length - 1][0] };
    });
    this.blocks2d = this.data.blocks.map((b) => {
      const path = new Path2D();
      path.moveTo(b.pts[0][0], b.pts[0][1]);
      for (const [x, y] of b.pts) path.lineTo(x, y);
      path.closePath();
      const xs = b.pts.map((p) => p[0]);
      return { path, style: b.style, x0: Math.min(...xs), x1: Math.max(...xs), pts: b.pts };
    });
  }

  drawDecor(ctx, view, time) {
    for (const d of this.decor) {
      if (d.x < view.x0 - 5 || d.x > view.x1 + 5) continue;
      drawDecor(ctx, d, time);
    }
  }

  drawTerrain(ctx, view) {
    this.ensureRender(ctx);
    const gr = this.theme.ground;
    const k = 4 / 256;
    const m = new DOMMatrix([k, 0, 0, -k, 0, 0]);
    this.groundPat.setTransform(m);
    for (const p of this.paths2d) {
      if (p.x1 < view.x0 - 1 || p.x0 > view.x1 + 1) continue;
      ctx.fillStyle = this.groundPat;
      ctx.fill(p.fill);
      ctx.lineJoin = 'round';
      ctx.lineCap = 'round';
      ctx.strokeStyle = gr.topDark;
      ctx.lineWidth = 0.5;
      ctx.stroke(p.top);
      ctx.strokeStyle = gr.top;
      ctx.lineWidth = 0.32;
      ctx.stroke(p.top);
      if (gr.lava) {
        ctx.strokeStyle = 'rgba(255,200,80,0.6)';
        ctx.lineWidth = 0.08;
        ctx.stroke(p.top);
      }
      ctx.strokeStyle = 'rgba(0,0,0,0.55)';
      ctx.lineWidth = 0.05;
      ctx.stroke(p.fill);
    }
    for (const b of this.blocks2d) {
      if (b.x1 < view.x0 - 1 || b.x0 > view.x1 + 1) continue;
      let pat = this.blockPats[b.style];
      if (b.style === 'ground') pat = this.groundPat;
      if (pat) pat.setTransform(m);
      ctx.fillStyle = pat || '#777';
      ctx.fill(b.path);
      if (b.style === 'ground') {
        // grassy top edge on upward-facing segments
        ctx.strokeStyle = gr.top;
        ctx.lineWidth = 0.28;
        ctx.lineCap = 'round';
        ctx.beginPath();
        const pts = b.pts;
        for (let i = 0; i < pts.length; i++) {
          const a = pts[i];
          const c = pts[(i + 1) % pts.length];
          if (c[0] > a[0] + 0.05 && Math.abs((c[1] - a[1]) / (c[0] - a[0])) < 1.2) {
            ctx.moveTo(a[0], a[1]);
            ctx.lineTo(c[0], c[1]);
          }
        }
        ctx.stroke();
      }
      ctx.strokeStyle = 'rgba(0,0,0,0.6)';
      ctx.lineWidth = 0.05;
      ctx.stroke(b.path);
    }
  }
}
