/**
 * Destructible props on the fight plane: pillars, statues, obelisks, crystals, bamboo,
 * stone lanterns and monoliths. Each kind has its own silhouette, material shading and
 * details; damage grows deterministic crack networks; hits flash + wobble; broken props
 * leave a jagged stump and a rubble pile.
 */
import type { ArenaTheme, PropKind, PropState } from '../../sim/arena';
import { Rng } from '../../core/rng';
import { clamp01 } from '../../core/math';
import { addGuardian, addLeaf } from './shapes';
import { chunkShape, darken, drawSprite, glowSprite, jagged, lighten, mix, rgbaStr, type Pt } from './util';

/** Props stand slightly behind the fighters' plane, on the floor surface band. */
export const PROP_BASE_Y = -6;

interface Crack { pts: Pt[]; threshold: number; width: number }

interface PropVisual {
  id: number;
  kind: PropKind;
  w: number;
  h: number;
  body: Path2D;
  stump: Path2D;
  stumpH: number;
  cracks: Crack[];
  rubble: { x: number; y: number; s: number; shape: number[]; shade: number }[];
  hitT: number;
  hitPower: number;
  hitDir: number;
  phase: number;
  /** Kind-specific extra geometry. */
  extra: Path2D | null;
  crystals: { x: number; h: number; w: number; ang: number }[];
  glyphs: { y: number; kind: number }[];
}

export interface PropEnv {
  t: number;
  flash: number;
  flashColor: string;
  darken: number;
  lightDir: number;
  timeStop: boolean;
}

export class PropRenderer {
  private visuals = new Map<number, PropVisual>();
  private stone: string;
  private stoneDark: string;
  private stoneLit: string;

  private grads = new WeakMap<CanvasRenderingContext2D, Map<string, CanvasGradient>>();
  private grad(ctx: CanvasRenderingContext2D, key: string, make: () => CanvasGradient): CanvasGradient {
    let m = this.grads.get(ctx);
    if (!m) { m = new Map(); this.grads.set(ctx, m); }
    let g = m.get(key);
    if (!g) { g = make(); m.set(key, g); }
    return g;
  }

  constructor(private theme: ArenaTheme, private seed: number) {
    const P = theme.palette;
    this.stone = mix(mix(P.ground, P.mid, 0.5), P.ambient, 0.22);
    this.stoneDark = darken(this.stone, 0.45);
    this.stoneLit = mix(this.stone, P.ambient, 0.45);
  }

  private visual(p: PropState): PropVisual {
    let v = this.visuals.get(p.def.id);
    if (v) return v;
    v = this.build(p);
    this.visuals.set(p.def.id, v);
    return v;
  }

  private build(p: PropState): PropVisual {
    const d = p.def;
    // Mirror pairs share a shape seed so the layout stays visually symmetric.
    const r = new Rng((this.seed ^ Math.imul((d.id >> 1) + 1, 0x9e3779b1)) >>> 0);
    const w = d.width, h = d.height;
    const body = new Path2D();
    let extra: Path2D | null = null;
    const crystals: PropVisual['crystals'] = [];
    const glyphs: PropVisual['glyphs'] = [];
    switch (d.kind) {
      case 'pillar': {
        body.rect(-w * 0.75, -h * 0.045, w * 1.5, h * 0.045 + 6);
        body.rect(-w * 0.64, -h * 0.075, w * 1.28, h * 0.032);
        body.moveTo(-w / 2, -h * 0.075);
        body.lineTo(-w * 0.43, -h * 0.9);
        body.lineTo(w * 0.43, -h * 0.9);
        body.lineTo(w / 2, -h * 0.075);
        body.closePath();
        body.moveTo(-w * 0.45, -h * 0.9);
        body.lineTo(-w * 0.66, -h * 0.955);
        body.lineTo(w * 0.66, -h * 0.955);
        body.lineTo(w * 0.45, -h * 0.9);
        body.closePath();
        body.rect(-w * 0.74, -h, w * 1.48, h * 0.047);
        break;
      }
      case 'statue': {
        addGuardian(body, 0, 0, h, d.x < 0 ? 1 : -1);
        break;
      }
      case 'obelisk': {
        body.rect(-w * 0.8, -h * 0.05, w * 1.6, h * 0.05 + 6);
        body.moveTo(-w / 2, -h * 0.05);
        body.lineTo(-w * 0.36, -h * 0.9);
        body.lineTo(0, -h);
        body.lineTo(w * 0.36, -h * 0.9);
        body.lineTo(w / 2, -h * 0.05);
        body.closePath();
        const n = Math.floor((h * 0.75) / 26);
        for (let i = 0; i < n; i++) glyphs.push({ y: -h * 0.12 - i * 26, kind: r.int(0, 5) });
        break;
      }
      case 'crystal': {
        const n = r.int(3, 5);
        for (let i = 0; i < n; i++) {
          const main = i === Math.floor(n / 2);
          crystals.push({
            x: (i - (n - 1) / 2) * w * 0.32 + r.range(-6, 6),
            h: main ? h : h * r.range(0.4, 0.75),
            w: main ? w * 0.48 : w * r.range(0.26, 0.38),
            ang: main ? r.range(-0.05, 0.05) : (i - (n - 1) / 2) * r.range(0.14, 0.3),
          });
        }
        crystals.sort((a, b) => a.h - b.h);
        for (const c of crystals) crystalPath(body, c.x, c.h, c.w, c.ang);
        break;
      }
      case 'bamboo': {
        const hs = [h, h * r.range(0.78, 0.9), h * r.range(0.62, 0.74)];
        const xs = [0, -w * 1.25, w * 1.3];
        extra = new Path2D();
        for (let i = 0; i < 3; i++) {
          const sw = w * (i === 0 ? 1 : 0.8);
          body.rect(xs[i] - sw / 2, -hs[i], sw, hs[i] + 6);
          crystals.push({ x: xs[i], h: hs[i], w: sw, ang: r.range(0, 6.28) });
          for (let k = 0; k < 6; k++) {
            const side = k % 2 === 0 ? -1 : 1;
            addLeaf(extra, xs[i], -hs[i] + 10 + k * 4, (side < 0 ? Math.PI : 0) + side * r.range(0.2, 0.9) - Math.PI * 0.08, r.range(34, 58), r.range(4, 7));
          }
        }
        break;
      }
      case 'lantern': {
        body.rect(-w * 0.62, -h * 0.1, w * 1.24, h * 0.1 + 6);
        body.rect(-w * 0.16, -h * 0.5, w * 0.32, h * 0.42);
        body.rect(-w * 0.55, -h * 0.58, w * 1.1, h * 0.08);
        body.rect(-w * 0.42, -h * 0.8, w * 0.84, h * 0.22);
        body.moveTo(-w * 0.85, -h * 0.8);
        body.quadraticCurveTo(-w * 0.4, -h * 0.84, -w * 0.18, -h * 0.94);
        body.lineTo(w * 0.18, -h * 0.94);
        body.quadraticCurveTo(w * 0.4, -h * 0.84, w * 0.85, -h * 0.8);
        body.closePath();
        body.moveTo(w * 0.12, -h * 0.96);
        body.arc(0, -h * 0.97, w * 0.12, 0, Math.PI * 2);
        break;
      }
      case 'monolith': {
        const pts: Pt[] = [
          { x: -w / 2, y: 6 }, { x: -w * 0.52, y: -h * 0.4 }, { x: -w * 0.46, y: -h * 0.86 }, { x: -w * 0.3, y: -h },
          { x: w * 0.18, y: -h * r.range(0.95, 1.02) }, { x: w * 0.46, y: -h * 0.9 }, { x: w * 0.52, y: -h * 0.45 }, { x: w / 2, y: 6 },
        ];
        body.moveTo(pts[0].x, pts[0].y);
        for (const q of pts) body.lineTo(q.x + r.range(-3, 3), q.y);
        body.closePath();
        const n = Math.floor((h * 0.6) / 40);
        for (let i = 0; i < n; i++) glyphs.push({ y: -h * 0.2 - i * 40, kind: r.int(0, 5) });
        break;
      }
    }

    // Stump left behind when broken.
    const stumpH = d.kind === 'lantern' ? h * 0.12 : h * r.range(0.14, 0.3);
    const stump = new Path2D();
    if (d.kind === 'bamboo') {
      for (const c of crystals) {
        const sh = stumpH * r.range(0.6, 1.2);
        stump.moveTo(c.x - c.w / 2, 6);
        stump.lineTo(c.x - c.w / 2, -sh);
        stump.lineTo(c.x - c.w * 0.1, -sh - r.range(8, 22));
        stump.lineTo(c.x + c.w * 0.2, -sh + 4);
        stump.lineTo(c.x + c.w / 2, -sh - r.range(4, 14));
        stump.lineTo(c.x + c.w / 2, 6);
        stump.closePath();
      }
    } else if (d.kind === 'crystal') {
      for (const c of crystals) crystalPath(stump, c.x, Math.min(c.h, stumpH * r.range(0.7, 1.3)), c.w, c.ang);
    } else {
      const sw = d.kind === 'statue' ? w * 1.2 : d.kind === 'lantern' ? w * 1.24 : d.kind === 'monolith' ? w : w * 1.05;
      stump.moveTo(-sw / 2, 6);
      stump.lineTo(-sw / 2, -stumpH * r.range(0.7, 1));
      const teeth = 6;
      for (let i = 1; i < teeth; i++) stump.lineTo(-sw / 2 + (sw * i) / teeth, -stumpH * r.range(0.65, 1.25));
      stump.lineTo(sw / 2, -stumpH * r.range(0.6, 1));
      stump.lineTo(sw / 2, 6);
      stump.closePath();
    }

    // Crack network (reveals with damage).
    const cracks: Crack[] = [];
    const nCracks = d.kind === 'bamboo' ? 5 : 9;
    for (let i = 0; i < nCracks; i++) {
      const sx = r.range(-w * 0.32, w * 0.32);
      const sy = -r.range(h * 0.12, h * 0.85);
      const len = r.range(h * 0.08, h * 0.24);
      const ang = Math.PI / 2 + r.range(-0.9, 0.9) + (r.next() < 0.5 ? Math.PI : 0);
      const ex = clampAbs(sx + Math.cos(ang) * len * 0.45, w * 0.45);
      const ey = sy + Math.sin(ang) * len;
      const pts = jagged(r, sx, sy, ex, ey, 6, w * 0.12);
      cracks.push({ pts, threshold: 0.08 + (i / nCracks) * 0.75 + r.range(-0.05, 0.05), width: r.range(1.2, 2.4) });
      if (r.next() < 0.5) {
        const mid = pts[3];
        const b = jagged(r, mid.x, mid.y, clampAbs(mid.x + r.range(-w * 0.4, w * 0.4), w * 0.45), mid.y + r.range(-h * 0.1, h * 0.1), 4, w * 0.08);
        cracks.push({ pts: b, threshold: cracks[cracks.length - 1].threshold + 0.12, width: 1 });
      }
    }

    const rubble: PropVisual['rubble'] = [];
    const nR = d.kind === 'lantern' ? 5 : d.kind === 'bamboo' ? 6 : 9;
    for (let i = 0; i < nR; i++) {
      const s = r.range(w * 0.14, w * 0.34) * (d.kind === 'bamboo' ? 0.6 : 1);
      rubble.push({ x: r.range(-w * 1.4, w * 1.4), y: -s * 0.4, s, shape: chunkShape(() => r.next(), 5 + r.int(0, 2)), shade: r.range(-0.15, 0.2) });
    }

    return {
      id: d.id, kind: d.kind, w, h, body, stump, stumpH, cracks, rubble,
      hitT: 99, hitPower: 0, hitDir: 1, phase: r.range(0, 6.28), extra, crystals, glyphs,
    };
  }

  onHit(p: PropState, power: number): void {
    const v = this.visual(p);
    v.hitT = 0;
    v.hitPower = clamp01(power);
    v.hitDir = p.lastHitDir || 1;
  }

  update(dt: number): void {
    for (const v of this.visuals.values()) v.hitT += dt;
  }

  /** Material colour for a prop (used for debris chunks). */
  materialColor(kind: PropKind): { fill: string; edge: string } {
    const P = this.theme.palette;
    switch (kind) {
      case 'crystal': return { fill: mix(P.accent, '#ffffff', 0.25), edge: lighten(P.accent, 0.5) };
      case 'bamboo': return { fill: mix('#2f4a2c', P.mid, 0.3), edge: '#6f8f5a' };
      case 'obelisk': return { fill: darken(this.stone, 0.2), edge: this.stoneLit };
      default: return { fill: this.stone, edge: this.stoneLit };
    }
  }

  /** World-space top of a prop (for spawning debris). */
  shape(p: PropState): { w: number; h: number } {
    return { w: p.def.width, h: p.def.height };
  }

  draw(ctx: CanvasRenderingContext2D, props: readonly PropState[], env: PropEnv): void {
    for (const p of props) this.drawOne(ctx, p, env);
  }

  private drawOne(ctx: CanvasRenderingContext2D, p: PropState, env: PropEnv): void {
    const v = this.visual(p);
    const P = this.theme.palette;
    const t = env.t;
    ctx.save();
    // Hit wobble.
    let wob = 0;
    if (v.hitT < 0.6 && !p.broken) wob = Math.sin(v.hitT * 62) * Math.exp(-v.hitT * 9) * (2 + v.hitPower * 9) * v.hitDir;
    ctx.translate(p.def.x + wob, PROP_BASE_Y);
    if (v.kind === 'bamboo' && !p.broken) {
      // Gentle sway pivoting at the base.
      ctx.rotate(Math.sin(t * 1.1 + v.phase) * 0.012 + wob * 0.003);
    } else if (wob !== 0) {
      ctx.rotate(wob * 0.0025);
    }

    if (p.broken) {
      this.drawRubble(ctx, v, env);
      this.fillMaterial(ctx, v, v.stump, env, true);
      ctx.restore();
      return;
    }

    // Glow behind emissive props.
    if (v.kind === 'crystal' || v.kind === 'lantern') {
      ctx.globalCompositeOperation = 'lighter';
      const col = v.kind === 'crystal' ? P.accent : '#ffb35a';
      const pulse = v.kind === 'crystal' ? 0.75 + 0.25 * Math.sin(t * 1.6 + v.phase) : 0.8 + 0.2 * Math.sin(t * 7 + v.phase) * Math.sin(t * 3.1);
      const cy = v.kind === 'crystal' ? -v.h * 0.45 : -v.h * 0.69;
      drawSprite(ctx, glowSprite(col), 0, cy, (v.kind === 'crystal' ? v.h * 0.9 : v.w * 3.2), 0.3 * pulse * (1 - p.damage * 0.5));
      ctx.globalCompositeOperation = 'source-over';
      ctx.globalAlpha = 1;
    }

    this.fillMaterial(ctx, v, v.body, env, false);
    this.drawDetails(ctx, v, p, env);
    this.drawCracks(ctx, v, p.damage, env);

    // Hit flash.
    if (v.hitT < 0.16) {
      ctx.globalCompositeOperation = 'lighter';
      ctx.fillStyle = rgbaStr('#ffffff', (1 - v.hitT / 0.16) * (0.35 + v.hitPower * 0.4));
      ctx.fill(v.body);
      ctx.globalCompositeOperation = 'source-over';
    }
    ctx.restore();
  }

  private fillMaterial(ctx: CanvasRenderingContext2D, v: PropVisual, path: Path2D, env: PropEnv, stump: boolean): void {
    const P = this.theme.palette;
    const w = v.w;
    const ld = env.lightDir;
    let base = this.stone, dark = this.stoneDark, lit = this.stoneLit;
    if (v.kind === 'crystal') {
      base = mix(P.accent, P.mid, 0.55);
      dark = mix(P.accent, '#000000', 0.6);
      lit = lighten(P.accent, 0.35);
    } else if (v.kind === 'bamboo') {
      base = mix('#2c4630', P.mid, 0.25);
      dark = darken(base, 0.5);
      lit = mix(base, P.ambient, 0.4);
    } else if (v.kind === 'obelisk' || v.kind === 'monolith') {
      base = darken(this.stone, 0.18);
      dark = darken(this.stone, 0.55);
      lit = mix(base, P.ambient, 0.35);
    }
    const span = v.kind === 'bamboo' ? w * 2.2 : v.kind === 'statue' ? w * 0.7 : w * 0.8;
    ctx.fillStyle = this.grad(ctx, v.id + 'h' + ld, () => {
      const g = ctx.createLinearGradient(-span * ld, 0, span * ld, 0);
      g.addColorStop(0, lit);
      g.addColorStop(0.35, base);
      g.addColorStop(1, dark);
      return g;
    });
    ctx.globalAlpha = v.kind === 'crystal' ? 0.88 : 1;
    ctx.fill(path);
    ctx.globalAlpha = 1;
    // Vertical falloff: darker near the ground (ambient occlusion), lit top.
    ctx.fillStyle = this.grad(ctx, v.id + 'v' + (stump ? 's' : ''), () => {
      const vg = ctx.createLinearGradient(0, -v.h, 0, 0);
      vg.addColorStop(0, rgbaStr(P.ambient, stump ? 0 : 0.1));
      vg.addColorStop(0.7, 'rgba(0,0,0,0)');
      vg.addColorStop(1, 'rgba(0,0,0,0.35)');
      return vg;
    });
    ctx.fill(path);
    // Rim light on the key-light side.
    ctx.save();
    ctx.clip(path);
    ctx.strokeStyle = rgbaStr(lit, 0.6);
    ctx.lineWidth = 3;
    ctx.translate(-ld * 1.5, 0);
    ctx.stroke(path);
    ctx.restore();
    ctx.strokeStyle = rgbaStr(darken(dark, 0.4), 0.6);
    ctx.lineWidth = 1.2;
    ctx.stroke(path);
    if (env.flash > 0.02) {
      ctx.globalCompositeOperation = 'lighter';
      ctx.fillStyle = rgbaStr(env.flashColor, env.flash * 0.3);
      ctx.fill(path);
      ctx.globalCompositeOperation = 'source-over';
    }
    if (env.darken > 0.01) {
      ctx.fillStyle = rgbaStr('#000000', env.darken * 0.55);
      ctx.fill(path);
    }
  }

  private drawDetails(ctx: CanvasRenderingContext2D, v: PropVisual, p: PropState, env: PropEnv): void {
    const P = this.theme.palette;
    const w = v.w, h = v.h, t = env.t;
    switch (v.kind) {
      case 'pillar': {
        // Fluting.
        ctx.strokeStyle = rgbaStr(this.stoneDark, 0.55);
        ctx.lineWidth = 1.4;
        ctx.beginPath();
        for (let i = 1; i < 5; i++) {
          const fx = -w / 2 + (w * i) / 5;
          ctx.moveTo(fx * 1.0, -h * 0.085);
          ctx.lineTo(fx * 0.86, -h * 0.89);
        }
        ctx.stroke();
        ctx.strokeStyle = rgbaStr(this.stoneLit, 0.25);
        ctx.beginPath();
        for (let i = 1; i < 5; i++) {
          const fx = -w / 2 + (w * i) / 5 - env.lightDir * 2;
          ctx.moveTo(fx, -h * 0.085);
          ctx.lineTo(fx * 0.86, -h * 0.89);
        }
        ctx.stroke();
        // Faint carved band.
        ctx.fillStyle = rgbaStr(P.accent, 0.12 + env.flash * 0.2);
        ctx.fillRect(-w * 0.44, -h * 0.84, w * 0.88, 3);
        break;
      }
      case 'statue': {
        const s = h / 300;
        const eyeY = -46 * s - 10 * s - 234 * s;
        ctx.globalCompositeOperation = 'lighter';
        const pulse = 0.7 + 0.3 * Math.sin(t * 2 + v.phase);
        drawSprite(ctx, glowSprite(P.accent), 0, eyeY, 14 * s * 3, 0.35 * pulse);
        ctx.fillStyle = rgbaStr(lighten(P.accent, 0.4), 0.85 * pulse);
        ctx.fillRect(-9 * s, eyeY - 1.5 * s, 6 * s, 3 * s);
        ctx.fillRect(3 * s, eyeY - 1.5 * s, 6 * s, 3 * s);
        ctx.globalCompositeOperation = 'source-over';
        // Robe folds.
        ctx.strokeStyle = rgbaStr(this.stoneDark, 0.5);
        ctx.lineWidth = 1.5 * s * 2;
        ctx.beginPath();
        const fb = -56 * s;
        for (let i = -1; i <= 1; i++) {
          ctx.moveTo(i * 14 * s, fb);
          ctx.lineTo(i * 9 * s, fb - 140 * s);
        }
        ctx.stroke();
        break;
      }
      case 'obelisk':
      case 'monolith': {
        ctx.globalCompositeOperation = 'lighter';
        const col = P.accent;
        for (let i = 0; i < v.glyphs.length; i++) {
          const gph = v.glyphs[i];
          const wave = 0.35 + 0.65 * Math.max(0, Math.sin(t * 1.8 - i * 0.55 + v.phase));
          const a = (0.25 + wave * 0.6) * (1 - p.damage * 0.6);
          drawGlyph(ctx, gph.kind, 0, gph.y, v.kind === 'obelisk' ? w * 0.22 : w * 0.2, col, a);
        }
        drawSprite(ctx, glowSprite(col), 0, -h * 0.5, w * 1.1, 0.08);
        ctx.globalCompositeOperation = 'source-over';
        break;
      }
      case 'crystal': {
        ctx.globalCompositeOperation = 'lighter';
        ctx.strokeStyle = rgbaStr(lighten(P.accent, 0.6), 0.55);
        ctx.lineWidth = 1.4;
        ctx.beginPath();
        for (const c of v.crystals) {
          const s = Math.sin(c.ang), co = Math.cos(c.ang);
          // Central facet ridge.
          ctx.moveTo(c.x, 0);
          ctx.lineTo(c.x + c.h * s, -c.h * co);
          ctx.moveTo(c.x - c.w * 0.25 * co, -c.w * 0.25 * s);
          ctx.lineTo(c.x - c.w * 0.25 * co + c.h * 0.78 * s, -c.h * 0.78 * co);
        }
        ctx.stroke();
        const pulse = 0.6 + 0.4 * Math.sin(t * 2.2 + v.phase);
        for (const c of v.crystals) drawSprite(ctx, glowSprite(lighten(P.accent, 0.3)), c.x + c.h * 0.4 * Math.sin(c.ang), -c.h * 0.4, c.w * 1.1, 0.25 * pulse);
        ctx.globalCompositeOperation = 'source-over';
        break;
      }
      case 'bamboo': {
        // Node rings.
        ctx.strokeStyle = rgbaStr('#0b140c', 0.7);
        ctx.lineWidth = 2;
        ctx.beginPath();
        for (const c of v.crystals) {
          for (let y = -40; y > -c.h + 10; y -= 46) {
            ctx.moveTo(c.x - c.w / 2 - 1, y);
            ctx.lineTo(c.x + c.w / 2 + 1, y);
          }
        }
        ctx.stroke();
        if (v.extra) {
          ctx.fillStyle = mix('#2f5434', P.mid, 0.35);
          ctx.fill(v.extra);
          ctx.strokeStyle = rgbaStr(P.ambient, 0.15);
          ctx.lineWidth = 1;
          ctx.stroke(v.extra);
        }
        break;
      }
      case 'lantern': {
        const fl = 0.75 + 0.25 * Math.sin(t * 9 + v.phase) * Math.sin(t * 4.3 + v.phase * 2);
        ctx.fillStyle = rgbaStr('#ffcf7a', 0.9 * fl);
        ctx.fillRect(-w * 0.24, -h * 0.77, w * 0.48, h * 0.15);
        ctx.globalCompositeOperation = 'lighter';
        drawSprite(ctx, glowSprite('#ffb35a'), 0, -h * 0.69, w * 1.4, 0.55 * fl);
        ctx.globalCompositeOperation = 'source-over';
        ctx.strokeStyle = rgbaStr(this.stoneDark, 0.8);
        ctx.lineWidth = 2;
        ctx.beginPath();
        ctx.moveTo(0, -h * 0.78);
        ctx.lineTo(0, -h * 0.6);
        ctx.stroke();
        break;
      }
    }
  }

  private drawCracks(ctx: CanvasRenderingContext2D, v: PropVisual, damage: number, env: PropEnv): void {
    if (damage <= 0.02) return;
    ctx.lineJoin = 'round';
    ctx.lineCap = 'round';
    const hot = v.kind === 'crystal' || v.kind === 'obelisk' || v.kind === 'monolith';
    for (const c of v.cracks) {
      const reveal = clamp01((damage - c.threshold) * 4);
      if (reveal <= 0) continue;
      const n = Math.max(2, Math.ceil(c.pts.length * reveal));
      ctx.strokeStyle = rgbaStr('#050307', 0.85);
      ctx.lineWidth = c.width + damage * 1.5;
      ctx.beginPath();
      ctx.moveTo(c.pts[0].x, c.pts[0].y);
      for (let i = 1; i < n; i++) ctx.lineTo(c.pts[i].x, c.pts[i].y);
      ctx.stroke();
      ctx.strokeStyle = hot ? rgbaStr(this.theme.palette.accent, 0.5 * damage) : rgbaStr(this.stoneLit, 0.3);
      ctx.lineWidth = 0.8;
      ctx.beginPath();
      ctx.moveTo(c.pts[0].x + 1.2, c.pts[0].y + 1.2);
      for (let i = 1; i < n; i++) ctx.lineTo(c.pts[i].x + 1.2, c.pts[i].y + 1.2);
      ctx.stroke();
    }
    void env;
  }

  private drawRubble(ctx: CanvasRenderingContext2D, v: PropVisual, env: PropEnv): void {
    const col = this.materialColor(v.kind);
    for (const r of v.rubble) {
      ctx.beginPath();
      for (let i = 0; i < r.shape.length; i += 2) {
        const x = r.x + r.shape[i] * r.s, y = r.y + r.shape[i + 1] * r.s * 0.7;
        if (i === 0) ctx.moveTo(x, y); else ctx.lineTo(x, y);
      }
      ctx.closePath();
      ctx.fillStyle = r.shade > 0 ? mix(col.fill, col.edge, r.shade) : darken(col.fill, -r.shade);
      ctx.fill();
      ctx.strokeStyle = rgbaStr(darken(col.fill, 0.5), 0.8);
      ctx.lineWidth = 1;
      ctx.stroke();
      if (env.darken > 0.01) {
        ctx.fillStyle = rgbaStr('#000000', env.darken * 0.55);
        ctx.fill();
      }
    }
  }
}

function clampAbs(v: number, m: number): number {
  return v < -m ? -m : v > m ? m : v;
}

function crystalPath(path: Path2D, x: number, h: number, w: number, ang: number): void {
  const s = Math.sin(ang), c = Math.cos(ang);
  const pts = [[-w / 2, 4], [-w / 2, -h * 0.8], [-w * 0.12, -h], [w * 0.1, -h * 0.97], [w / 2, -h * 0.76], [w / 2, 4]];
  pts.forEach(([px, py], i) => {
    const rx = x + px * c - py * s;
    const ry = px * s + py * c;
    if (i === 0) path.moveTo(rx, ry); else path.lineTo(rx, ry);
  });
  path.closePath();
}

/** Small procedural rune glyph centred at (x, y) with size s. */
function drawGlyph(ctx: CanvasRenderingContext2D, kind: number, x: number, y: number, s: number, col: string, a: number): void {
  ctx.strokeStyle = rgbaStr(col, Math.min(1, a));
  ctx.lineWidth = Math.max(1.2, s * 0.16);
  ctx.lineCap = 'round';
  ctx.beginPath();
  switch (kind % 6) {
    case 0: ctx.moveTo(x, y - s); ctx.lineTo(x, y + s); ctx.moveTo(x - s * 0.7, y - s * 0.3); ctx.lineTo(x + s * 0.7, y + s * 0.3); break;
    case 1: ctx.moveTo(x + s * 0.8, y); ctx.arc(x, y, s * 0.8, 0, Math.PI * 1.6); break;
    case 2: ctx.moveTo(x - s * 0.7, y + s); ctx.lineTo(x, y - s); ctx.lineTo(x + s * 0.7, y + s); ctx.moveTo(x - s * 0.4, y + s * 0.2); ctx.lineTo(x + s * 0.4, y + s * 0.2); break;
    case 3: ctx.moveTo(x - s * 0.7, y - s); ctx.lineTo(x + s * 0.7, y - s); ctx.lineTo(x - s * 0.7, y + s); ctx.lineTo(x + s * 0.7, y + s); break;
    case 4: ctx.moveTo(x, y - s); ctx.lineTo(x + s * 0.8, y); ctx.lineTo(x, y + s); ctx.lineTo(x - s * 0.8, y); ctx.closePath(); ctx.moveTo(x, y - s * 0.3); ctx.lineTo(x, y + s * 0.3); break;
    default: ctx.moveTo(x - s * 0.6, y - s); ctx.lineTo(x - s * 0.6, y + s); ctx.moveTo(x - s * 0.6, y); ctx.lineTo(x + s * 0.7, y - s * 0.7); ctx.moveTo(x - s * 0.6, y); ctx.lineTo(x + s * 0.7, y + s * 0.7); break;
  }
  ctx.stroke();
}
