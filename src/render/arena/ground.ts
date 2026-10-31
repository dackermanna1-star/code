/**
 * The arena floor: a thin perspective surface band behind the fighters' feet (y ∈ [-SURF, 0]),
 * a glowing edge line at y = 0, and a perspective floor face below. Persistent decals
 * (craters that dent the edge line, glowing fissures, scorch marks), theme textures,
 * collapse fissures, and the boundary walls at ±halfWidth.
 */
import type { ArenaTheme } from '../../sim/arena';
import type { CameraView } from '../types';
import { Rng } from '../../core/rng';
import { clamp01 } from '../../core/math';
import { chunkShape, darken, drawSprite, glowSprite, jagged, lighten, mix, rgbaStr, strokeGlowLine, type Pt } from './util';

export const SURF = 20;

interface Crater { x: number; r: number; depth: number; age: number; dying: number; cracks: Pt[][]; rubble: { x: number; y: number; s: number; shape: number[] }[] }
interface GCrack { x: number; len: number; age: number; dying: number; lines: Pt[][] }
interface Scorch { x: number; r: number; color: string; age: number; dying: number }

export interface GroundEnv {
  t: number;
  flash: number;
  flashColor: string;
  darken: number;
  collapse: number;
  storm: number;
  timeStop: boolean;
}

const MAX_CRATERS = 8, MAX_CRACKS = 16, MAX_SCORCH = 12;

export class Ground {
  private craters: Crater[] = [];
  private cracks: GCrack[] = [];
  private scorches: Scorch[] = [];
  private rng: Rng;
  private P: ArenaTheme['palette'];
  private surfTop: string;
  private surfBottom: string;
  private faceTop: string;
  private faceBottom: string;
  private wallFill: string;
  private wallEdge: Pt[][] = [[], []];
  private wallRunes: { y: number; kind: number }[] = [];
  private strata: { y: number; slope: number; len: number; off: number }[] = [];
  private seams: Pt[][] = [];
  private circuits: Pt[][] = [];
  private fissures: { pts: Pt[]; start: number }[] = [];
  private tufts: { x: number; h: number; lean: number; ph: number }[] = [];
  private drifts: { x: number; w: number; h: number }[] = [];
  private puddles: { x: number; w: number }[] = [];

  private grads = new WeakMap<CanvasRenderingContext2D, Map<string, CanvasGradient>>();
  private grad(ctx: CanvasRenderingContext2D, key: string, make: () => CanvasGradient): CanvasGradient {
    let m = this.grads.get(ctx);
    if (!m) { m = new Map(); this.grads.set(ctx, m); }
    let g = m.get(key);
    if (!g) { g = make(); m.set(key, g); }
    return g;
  }

  constructor(private theme: ArenaTheme, private halfWidth: number, seed: number) {
    this.rng = new Rng(seed ^ 0x9e0d);
    const P = (this.P = theme.palette);
    this.surfTop = mix(P.ground, P.fog, 0.18);
    this.surfBottom = mix(P.ground, P.groundEdge, 0.22);
    this.faceTop = mix(P.ground, P.groundEdge, 0.12);
    this.faceBottom = darken(P.ground, 0.55);
    this.wallFill = mix(darken(mix(P.mid, P.ground, 0.4), 0.05), P.fog, 0.12);
    this.build();
  }

  private build(): void {
    const r = this.rng;
    const hw = this.halfWidth;
    // Boundary wall inner edges (jagged cliffs), mirrored for symmetry.
    for (let y = 400; y > -2800; y -= 46) {
      const off = Math.abs(Math.sin(y * 0.013)) * 10 + r.range(0, 16);
      this.wallEdge[0].push({ x: -hw - off, y });
      this.wallEdge[1].push({ x: hw + off, y });
    }
    for (let y = -60; y > -1400; y -= 74) this.wallRunes.push({ y, kind: r.int(0, 5) });
    for (let y = 20; y > -2700; y -= r.range(38, 90)) this.strata.push({ y, slope: r.range(-0.08, 0.08), len: r.range(120, 420), off: r.range(10, 160) });

    const id = this.theme.id;
    if (id === 'caldera') {
      for (let i = 0; i < 14; i++) {
        const x = r.range(-hw, hw);
        this.seams.push(jagged(r, x, -SURF * 0.4, x + r.range(-160, 160), r.range(40, 260), 7, 26));
      }
    }
    if (id === 'nexus') {
      for (let i = 0; i < 12; i++) {
        let x = r.range(-hw, hw), y = r.range(8, 30);
        const pts: Pt[] = [{ x, y }];
        for (let k = 0; k < 5; k++) {
          if (k % 2 === 0) x += r.sign() * r.range(40, 150);
          else y += r.range(18, 60);
          pts.push({ x, y });
        }
        this.circuits.push(pts);
      }
    }
    if (id === 'moonlit' || id === 'sanctum') {
      for (let x = -hw; x < hw; x += r.range(14, 34)) this.tufts.push({ x, h: r.range(5, id === 'moonlit' ? 16 : 9), lean: r.range(-0.4, 0.4), ph: r.range(0, 6.28) });
    }
    if (id === 'frostveil') {
      for (let x = -hw; x < hw; x += r.range(110, 260)) this.drifts.push({ x, w: r.range(60, 160), h: r.range(5, 12) });
    }
    if (id === 'stormpeak') {
      for (let i = 0; i < 9; i++) this.puddles.push({ x: r.range(-hw, hw), w: r.range(40, 120) });
    }
    // Collapse fissures (revealed late in the fight), mirrored pairs.
    for (let i = 0; i < 5; i++) {
      const x = r.range(80, hw - 80);
      const len = r.range(160, 360);
      const a = jagged(r, x, -SURF * 0.5, x + r.range(-len, len) * 0.5, r.range(60, 220), 8, 30);
      this.fissures.push({ pts: a, start: i * 0.14 });
      this.fissures.push({ pts: a.map((p) => ({ x: -p.x, y: p.y })), start: i * 0.14 + 0.07 });
    }
  }

  /* ---------------------------------------------------------- decals ---- */

  addCrater(x: number, radius: number): void {
    const r = this.rng;
    const cracks: Pt[][] = [];
    const n = 6 + Math.floor(Math.random() * 4);
    for (let i = 0; i < n; i++) {
      const side = i % 2 === 0 ? -1 : 1;
      const len = radius * (0.6 + Math.random() * 0.9);
      const sx = x + side * radius * (0.6 + Math.random() * 0.3);
      const ex = sx + side * len;
      const ey = Math.random() < 0.5 ? -SURF * Math.random() : Math.random() * radius * 0.7;
      cracks.push(jagged(r, sx, -SURF * 0.3 + Math.random() * 6, ex, ey, 5, radius * 0.12));
    }
    const rubble: Crater['rubble'] = [];
    for (let i = 0; i < 9; i++) {
      const s = radius * (0.05 + Math.random() * 0.09);
      rubble.push({ x: x + (Math.random() * 2 - 1) * radius * 1.25, y: -SURF * (0.2 + Math.random() * 0.8), s, shape: chunkShape(Math.random, 5) });
    }
    this.craters.push({ x, r: radius, depth: Math.min(radius * 0.2, 34), age: 0, dying: 0, cracks, rubble });
    this.evict(this.craters, MAX_CRATERS);
  }

  addCrack(x: number, length: number): void {
    const r = this.rng;
    const lines: Pt[][] = [];
    const main = jagged(r, x - length / 2, -SURF * (0.2 + Math.random() * 0.6), x + length / 2, -SURF * (0.2 + Math.random() * 0.6), 9, 8);
    lines.push(main);
    for (let i = 2; i < main.length - 2; i += 2) {
      if (Math.random() < 0.55) {
        const p = main[i];
        lines.push(jagged(r, p.x, p.y, p.x + (Math.random() - 0.5) * length * 0.4, p.y + 10 + Math.random() * 60, 4, 6));
      }
    }
    this.cracks.push({ x, len: length, age: 0, dying: 0, lines });
    this.evict(this.cracks, MAX_CRACKS);
  }

  addScorch(x: number, radius: number, color: string): void {
    this.scorches.push({ x, r: radius, color, age: 0, dying: 0 });
    this.evict(this.scorches, MAX_SCORCH);
  }

  private evict<T extends { dying: number }>(list: T[], max: number): void {
    let alive = list.filter((d) => d.dying === 0).length;
    for (const d of list) {
      if (alive <= max) break;
      if (d.dying === 0) {
        d.dying = 0.0001;
        alive--;
      }
    }
  }

  update(dt: number): void {
    const step = <T extends { age: number; dying: number }>(list: T[]): T[] => {
      for (const d of list) {
        d.age += dt;
        if (d.dying > 0) d.dying += dt;
      }
      return list.filter((d) => d.dying < 1);
    };
    this.craters = step(this.craters);
    this.cracks = step(this.cracks);
    this.scorches = step(this.scorches);
  }

  /** Surface height offset (positive = dips down) caused by craters at x. */
  private dip(x: number): number {
    let d = 0;
    for (const c of this.craters) {
      const u = (x - c.x) / c.r;
      if (u > -1 && u < 1) {
        const k = 1 - u * u;
        d += c.depth * k * Math.sqrt(k) * Math.min(1, c.age / 0.06) * (1 - c.dying);
      }
    }
    return d;
  }

  /* ------------------------------------------------------------ draw ---- */

  draw(ctx: CanvasRenderingContext2D, cam: CameraView, env: GroundEnv, lightDir: number): void {
    const P = this.P;
    cam.applyTransform(ctx, 1);
    const rect = cam.visibleWorldRect(1);
    const L = rect.left, R = rect.right, B = Math.max(rect.bottom, 50);
    if (rect.top > 2 || rect.bottom < -SURF - 40) return; // ground not visible
    const camX = cam.x;
    ctx.globalAlpha = 1;
    ctx.globalCompositeOperation = 'source-over';

    // Edge polyline (with crater dips).
    const step = 10;
    const edge: Pt[] = [];
    const x0 = Math.floor(L / step) * step, x1 = Math.ceil(R / step) * step;
    for (let x = x0; x <= x1; x += step) edge.push({ x, y: this.dip(x) });

    this.drawWalls(ctx, rect, env);

    // Surface band.
    const band = new Path2D();
    band.moveTo(x0, -SURF);
    band.lineTo(x1, -SURF);
    for (let i = edge.length - 1; i >= 0; i--) band.lineTo(edge[i].x, edge[i].y);
    band.closePath();
    ctx.fillStyle = this.grad(ctx, 'band', () => {
      const sg = ctx.createLinearGradient(0, -SURF, 0, 2);
      sg.addColorStop(0, this.surfTop);
      sg.addColorStop(1, this.surfBottom);
      return sg;
    });
    ctx.fill(band);

    // Floor face.
    const face = new Path2D();
    face.moveTo(edge[0].x, edge[0].y);
    for (const p of edge) face.lineTo(p.x, p.y);
    face.lineTo(x1, B + 40);
    face.lineTo(x0, B + 40);
    face.closePath();
    // Floor gradient with the horizon glow reflected as a sheen near the edge (single pass).
    ctx.fillStyle = this.grad(ctx, 'face', () => {
      const sheen = mix(P.fog, P.groundEdge, 0.3);
      const fg = ctx.createLinearGradient(0, 0, 0, 900);
      fg.addColorStop(0, mix(this.faceTop, sheen, 0.16));
      fg.addColorStop(0.12, mix(mix(this.faceTop, this.faceBottom, 0.3), sheen, 0.08));
      fg.addColorStop(0.27, mix(this.faceTop, this.faceBottom, 0.6));
      fg.addColorStop(1, this.faceBottom);
      return fg;
    });
    ctx.fill(face);

    this.drawTexture(ctx, rect, camX, env, x0, x1, B);
    this.drawDecals(ctx, env);

    // Edge line with glow.
    ctx.globalCompositeOperation = 'lighter';
    ctx.lineJoin = 'round';
    const edgeCol = env.flash > 0.2 ? mix(P.groundEdge, env.flashColor, 0.4) : P.groundEdge;
    const passes: [number, number][] = [[9, 0.05], [4, 0.13], [1.7, 0.75]];
    for (const [w, a] of passes) {
      ctx.strokeStyle = rgbaStr(edgeCol, a * (1 + env.flash * 0.6) * (1 - env.darken * 0.5));
      ctx.lineWidth = w;
      ctx.beginPath();
      ctx.moveTo(edge[0].x, edge[0].y);
      for (const p of edge) ctx.lineTo(p.x, p.y);
      ctx.stroke();
    }
    // Faint back edge of the surface band.
    ctx.strokeStyle = rgbaStr(P.groundEdge, 0.12);
    ctx.lineWidth = 1;
    ctx.beginPath();
    ctx.moveTo(x0, -SURF);
    ctx.lineTo(x1, -SURF);
    ctx.stroke();
    ctx.globalCompositeOperation = 'source-over';

    if (env.collapse > 0.01) this.drawFissures(ctx, env);
    this.drawEdgeDetails(ctx, rect, env, lightDir);

    // Lighting overlays restricted to the ground area.
    if (env.flash > 0.02) {
      ctx.globalCompositeOperation = 'lighter';
      ctx.fillStyle = rgbaStr(env.flashColor, env.flash * 0.22);
      ctx.fill(band);
      ctx.fillStyle = rgbaStr(env.flashColor, env.flash * 0.1);
      ctx.fill(face);
      ctx.globalCompositeOperation = 'source-over';
    }
    if (env.darken > 0.01) {
      ctx.fillStyle = rgbaStr('#000000', env.darken * 0.6);
      ctx.fill(band);
      ctx.fill(face);
    }
  }

  private drawWalls(ctx: CanvasRenderingContext2D, rect: { left: number; right: number; top: number; bottom: number }, env: GroundEnv): void {
    const P = this.P;
    const hw = this.halfWidth;
    for (let side = 0; side < 2; side++) {
      const sgn = side === 0 ? -1 : 1;
      if (sgn < 0 && rect.left > -hw + 60) continue;
      if (sgn > 0 && rect.right < hw - 60) continue;
      const pts = this.wallEdge[side];
      const outer = sgn * (hw + 2400);
      const path = new Path2D();
      path.moveTo(outer, pts[0].y);
      for (const p of pts) path.lineTo(p.x, p.y);
      path.lineTo(outer, pts[pts.length - 1].y);
      path.closePath();
      const g = ctx.createLinearGradient(sgn * hw, 0, sgn * (hw + 260), 0);
      g.addColorStop(0, mix(this.wallFill, P.ambient, 0.12));
      g.addColorStop(0.15, this.wallFill);
      g.addColorStop(1, darken(this.wallFill, 0.45));
      ctx.fillStyle = g;
      ctx.fill(path);
      // Rock strata and fissures.
      ctx.save();
      ctx.clip(path);
      ctx.strokeStyle = rgbaStr(darken(this.wallFill, 0.5), 0.55);
      ctx.lineWidth = 2;
      ctx.beginPath();
      for (const st of this.strata) {
        if (st.y < rect.top - 60 || st.y > rect.bottom + 60) continue;
        const xs = sgn * (hw + st.off);
        ctx.moveTo(xs, st.y);
        ctx.lineTo(xs + sgn * st.len, st.y + st.slope * st.len);
      }
      ctx.stroke();
      ctx.strokeStyle = rgbaStr(lighten(this.wallFill, 0.25), 0.18);
      ctx.lineWidth = 1;
      ctx.beginPath();
      for (const st of this.strata) {
        if (st.y < rect.top - 60 || st.y > rect.bottom + 60) continue;
        const xs = sgn * (hw + st.off);
        ctx.moveTo(xs, st.y + 2.5);
        ctx.lineTo(xs + sgn * st.len, st.y + 2.5 + st.slope * st.len);
      }
      ctx.stroke();
      // Atmospheric haze: lighter near the floor, fading upward.
      const hz = ctx.createLinearGradient(0, 0, 0, -700);
      hz.addColorStop(0, rgbaStr(P.fog, 0.32));
      hz.addColorStop(1, rgbaStr(P.fog, 0.06));
      ctx.fillStyle = hz;
      ctx.fillRect(sgn > 0 ? hw - 40 : -hw - 2600, Math.max(rect.top, -2800), 2640, Math.max(rect.top, -2800) * -1 + 40);
      ctx.restore();
      // Inner rim.
      ctx.globalCompositeOperation = 'lighter';
      ctx.strokeStyle = rgbaStr(P.groundEdge, 0.28 + env.flash * 0.3);
      ctx.lineWidth = 2;
      ctx.beginPath();
      ctx.moveTo(pts[0].x, pts[0].y);
      for (const p of pts) ctx.lineTo(p.x, p.y);
      ctx.stroke();
      // Energy barrier shimmer just inside the wall.
      const bw = 46;
      const bg = ctx.createLinearGradient(sgn * hw, 0, sgn * (hw - bw), 0);
      bg.addColorStop(0, rgbaStr(P.accent, 0.13));
      bg.addColorStop(1, rgbaStr(P.accent, 0));
      ctx.fillStyle = bg;
      const top = Math.max(rect.top, -2600);
      ctx.fillRect(sgn > 0 ? hw - bw : -hw, top, bw, -top);
      // Scanlines drifting upward.
      ctx.strokeStyle = rgbaStr(P.accent, 0.18);
      ctx.lineWidth = 1.5;
      ctx.beginPath();
      const off = (env.t * 60) % 90;
      for (let y = -off; y > top; y -= 90) {
        ctx.moveTo(sgn * hw, y);
        ctx.lineTo(sgn * (hw - 30), y);
      }
      ctx.stroke();
      // Runes.
      for (let i = 0; i < this.wallRunes.length; i++) {
        const rn = this.wallRunes[i];
        if (rn.y < rect.top - 40 || rn.y > rect.bottom + 40) continue;
        const wave = 0.3 + 0.7 * Math.max(0, Math.sin(env.t * 1.5 + i * 0.6));
        runeMark(ctx, rn.kind, sgn * (hw + 34), rn.y, 11, P.accent, 0.3 + 0.5 * wave);
      }
      ctx.globalCompositeOperation = 'source-over';
    }
  }

  private drawTexture(ctx: CanvasRenderingContext2D, rect: { left: number; right: number; top: number; bottom: number }, camX: number, env: GroundEnv, x0: number, x1: number, B: number): void {
    const P = this.P;
    const id = this.theme.id;
    const t = env.t;
    // Perspective tile lines on the band (converging toward the camera).
    const tile = id === 'celestial' || id === 'sanctum' ? 96 : id === 'moonlit' ? 120 : id === 'frostveil' ? 0 : 140;
    ctx.lineWidth = 1;
    if (tile > 0) {
      ctx.strokeStyle = rgbaStr(P.groundEdge, id === 'celestial' ? 0.2 : 0.1);
      ctx.beginPath();
      const s0 = Math.floor(x0 / tile) * tile;
      for (let x = s0; x <= x1; x += tile) {
        const xb = camX + (x - camX) * 0.9;
        ctx.moveTo(xb, -SURF);
        ctx.lineTo(x, 0);
      }
      ctx.moveTo(x0, -SURF * 0.45);
      ctx.lineTo(x1, -SURF * 0.45);
      ctx.stroke();
    }
    // Perspective floor face: radiating lines + receding horizontals.
    const fl = id === 'celestial' || id === 'sanctum' ? 96 : 150;
    ctx.strokeStyle = rgbaStr(P.groundEdge, id === 'celestial' ? 0.12 : 0.085);
    ctx.beginPath();
    const f0 = Math.floor((x0 - (x1 - x0)) / fl) * fl;
    const depth = Math.min(B, 700);
    for (let x = f0; x <= x1 + (x1 - x0); x += fl) {
      ctx.moveTo(x, 0);
      ctx.lineTo(camX + (x - camX) * (1 + depth / 110), depth);
    }
    for (let i = 1; i < 9; i++) {
      const y = 12 * (Math.pow(1.6, i) - 1);
      if (y > depth) break;
      ctx.moveTo(x0, y);
      ctx.lineTo(x1, y);
    }
    ctx.stroke();

    switch (id) {
      case 'celestial': {
        // Gold inlay.
        ctx.globalCompositeOperation = 'lighter';
        ctx.strokeStyle = rgbaStr(P.accent, 0.22);
        ctx.lineWidth = 1.4;
        ctx.beginPath();
        ctx.moveTo(x0, 9);
        ctx.lineTo(x1, 9);
        ctx.stroke();
        ctx.globalCompositeOperation = 'source-over';
        break;
      }
      case 'caldera': {
        ctx.globalCompositeOperation = 'lighter';
        for (let i = 0; i < this.seams.length; i++) {
          const s = this.seams[i];
          if (s[s.length - 1].x < rect.left - 200 && s[0].x < rect.left - 200) continue;
          if (s[0].x > rect.right + 200) continue;
          const pulse = 0.45 + 0.55 * Math.max(0, Math.sin(t * 1.3 + i * 1.7));
          strokeGlowLine(ctx, s, P.accent, '#ffd27a', 1.5, 0.45 * pulse);
        }
        ctx.globalCompositeOperation = 'source-over';
        break;
      }
      case 'nexus': {
        ctx.globalCompositeOperation = 'lighter';
        for (let i = 0; i < this.circuits.length; i++) {
          const c = this.circuits[i];
          ctx.strokeStyle = rgbaStr(P.groundEdge, 0.18);
          ctx.lineWidth = 1.5;
          ctx.beginPath();
          ctx.moveTo(c[0].x, c[0].y);
          for (const p of c) ctx.lineTo(p.x, p.y);
          ctx.stroke();
          // Travelling pulse of light.
          const u = (t * 0.35 + i * 0.37) % 1;
          const seg = Math.min(c.length - 2, Math.floor(u * (c.length - 1)));
          const f = u * (c.length - 1) - seg;
          const px = c[seg].x + (c[seg + 1].x - c[seg].x) * f;
          const py = c[seg].y + (c[seg + 1].y - c[seg].y) * f;
          drawSprite(ctx, glowSprite(P.accent), px, py, 12, 0.7);
          for (const p of c) {
            ctx.fillStyle = rgbaStr(P.groundEdge, 0.4);
            ctx.fillRect(p.x - 2, p.y - 2, 4, 4);
          }
        }
        ctx.globalCompositeOperation = 'source-over';
        break;
      }
      case 'frostveil': {
        // Glossy ice reflections.
        ctx.globalCompositeOperation = 'lighter';
        const g = ctx.createLinearGradient(0, -SURF, 0, 60);
        g.addColorStop(0, rgbaStr('#e8fbff', 0.1));
        g.addColorStop(0.3, rgbaStr('#bfefff', 0.05));
        g.addColorStop(1, rgbaStr('#bfefff', 0));
        ctx.fillStyle = g;
        ctx.fillRect(x0, -SURF, x1 - x0, SURF + 60);
        ctx.strokeStyle = rgbaStr('#e8fbff', 0.08);
        ctx.lineWidth = 3;
        ctx.beginPath();
        for (let x = Math.floor(x0 / 170) * 170; x < x1; x += 170) {
          const xx = x + ((camX * 0.15) % 170);
          ctx.moveTo(xx, 2);
          ctx.lineTo(xx + 40, 70);
        }
        ctx.stroke();
        ctx.globalCompositeOperation = 'source-over';
        break;
      }
      case 'stormpeak': {
        // Wet reflections: puddles mirror the sky, brighter in lightning.
        ctx.globalCompositeOperation = 'lighter';
        for (const p of this.puddles) {
          if (p.x < rect.left - 150 || p.x > rect.right + 150) continue;
          ctx.fillStyle = rgbaStr(P.ambient, 0.06 + env.storm * 0.3);
          ctx.beginPath();
          ctx.ellipse(p.x, -SURF * 0.45, p.w, SURF * 0.3, 0, 0, Math.PI * 2);
          ctx.fill();
        }
        ctx.strokeStyle = rgbaStr(P.ambient, 0.05 + env.storm * 0.18);
        ctx.lineWidth = 2;
        ctx.beginPath();
        for (let x = Math.floor(x0 / 90) * 90; x < x1; x += 90) {
          ctx.moveTo(x + 30, 4);
          ctx.lineTo(x + 30, 30 + (x % 3) * 10);
        }
        ctx.stroke();
        ctx.globalCompositeOperation = 'source-over';
        break;
      }
      default:
        break;
    }
  }

  private drawDecals(ctx: CanvasRenderingContext2D, env: GroundEnv): void {
    const P = this.P;
    // Scorch marks.
    for (const s of this.scorches) {
      const fade = 1 - s.dying;
      ctx.fillStyle = rgbaStr('#050304', 0.45 * fade);
      ctx.beginPath();
      ctx.ellipse(s.x, -SURF * 0.4, s.r, s.r * 0.22, 0, 0, Math.PI * 2);
      ctx.fill();
      const hot = clamp01(1 - s.age / 10);
      if (hot > 0) {
        ctx.globalCompositeOperation = 'lighter';
        const g = ctx.createRadialGradient(s.x, -SURF * 0.4, 0, s.x, -SURF * 0.4, s.r);
        g.addColorStop(0, rgbaStr(lighten(s.color, 0.4), 0.65 * hot * hot * fade));
        g.addColorStop(0.5, rgbaStr(s.color, 0.35 * hot * fade));
        g.addColorStop(1, rgbaStr(s.color, 0));
        ctx.fillStyle = g;
        ctx.save();
        ctx.translate(s.x, -SURF * 0.4);
        ctx.scale(1, 0.24);
        ctx.translate(-s.x, SURF * 0.4);
        ctx.beginPath();
        ctx.arc(s.x, -SURF * 0.4, s.r, 0, Math.PI * 2);
        ctx.fill();
        ctx.restore();
        ctx.globalCompositeOperation = 'source-over';
      }
    }
    // Cracks.
    ctx.lineJoin = 'round';
    ctx.lineCap = 'round';
    for (const c of this.cracks) {
      const fade = 1 - c.dying;
      const hot = clamp01(1 - c.age / 2.5);
      const grow = clamp01(c.age / 0.12);
      for (const ln of c.lines) {
        const n = Math.max(2, Math.ceil(ln.length * grow));
        ctx.strokeStyle = rgbaStr('#030204', 0.8 * fade);
        ctx.lineWidth = 2.4;
        ctx.beginPath();
        ctx.moveTo(ln[0].x, ln[0].y);
        for (let i = 1; i < n; i++) ctx.lineTo(ln[i].x, ln[i].y);
        ctx.stroke();
        if (hot > 0) {
          ctx.globalCompositeOperation = 'lighter';
          strokeGlowLine(ctx, ln.slice(0, n), P.groundEdge, '#ffffff', 1, hot * 0.7 * fade);
          ctx.globalCompositeOperation = 'source-over';
        }
      }
    }
    // Craters.
    for (const c of this.craters) {
      const fade = 1 - c.dying;
      const grow = Math.min(1, c.age / 0.06);
      const rx = c.r * grow;
      // Bowl.
      const g = ctx.createRadialGradient(c.x, -SURF * 0.25, 0, c.x, -SURF * 0.25, rx);
      g.addColorStop(0, rgbaStr('#020103', 0.9 * fade));
      g.addColorStop(0.75, rgbaStr(darken(P.ground, 0.4), 0.8 * fade));
      g.addColorStop(1, rgbaStr(P.ground, 0));
      ctx.fillStyle = g;
      ctx.save();
      ctx.translate(c.x, -SURF * 0.25);
      ctx.scale(1, (SURF * 0.6 + c.depth * 0.9) / Math.max(1, rx));
      ctx.beginPath();
      ctx.arc(0, 0, rx, 0, Math.PI * 2);
      ctx.fill();
      ctx.restore();
      // Back rim highlight.
      ctx.strokeStyle = rgbaStr(P.groundEdge, 0.35 * fade);
      ctx.lineWidth = 1.6;
      ctx.beginPath();
      ctx.ellipse(c.x, -SURF * 0.25, rx * 0.98, SURF * 0.55, 0, Math.PI * 1.08, Math.PI * 1.92);
      ctx.stroke();
      // Radial cracks.
      ctx.strokeStyle = rgbaStr('#040205', 0.75 * fade);
      ctx.lineWidth = 2;
      ctx.beginPath();
      for (const cr of c.cracks) {
        const n = Math.max(2, Math.ceil(cr.length * clamp01(c.age / 0.15)));
        ctx.moveTo(cr[0].x, cr[0].y);
        for (let i = 1; i < n; i++) ctx.lineTo(cr[i].x, cr[i].y);
      }
      ctx.stroke();
      // Rubble bits on the rim.
      ctx.fillStyle = rgbaStr(mix(P.ground, P.groundEdge, 0.25), fade);
      ctx.beginPath();
      for (const rb of c.rubble) {
        for (let i = 0; i < rb.shape.length; i += 2) {
          const x = rb.x + rb.shape[i] * rb.s, y = rb.y + rb.shape[i + 1] * rb.s * 0.6;
          if (i === 0) ctx.moveTo(x, y); else ctx.lineTo(x, y);
        }
        ctx.closePath();
      }
      ctx.fill();
      // Fresh impact heat.
      const hot = clamp01(1 - c.age / 2.2);
      if (hot > 0) {
        ctx.globalCompositeOperation = 'lighter';
        drawSprite(ctx, glowSprite(mix(P.groundEdge, '#ffffff', 0.3)), c.x, 0, c.r * 1.1, 0.55 * hot * hot);
        ctx.strokeStyle = rgbaStr(P.groundEdge, 0.6 * hot);
        ctx.lineWidth = 2;
        ctx.beginPath();
        for (const cr of c.cracks) {
          ctx.moveTo(cr[0].x, cr[0].y);
          for (let i = 1; i < cr.length; i++) ctx.lineTo(cr[i].x, cr[i].y);
        }
        ctx.stroke();
        ctx.globalCompositeOperation = 'source-over';
      }
    }
  }

  private drawFissures(ctx: CanvasRenderingContext2D, env: GroundEnv): void {
    ctx.globalCompositeOperation = 'lighter';
    for (let i = 0; i < this.fissures.length; i++) {
      const f = this.fissures[i];
      const reveal = clamp01((env.collapse - f.start) / 0.35);
      if (reveal <= 0) continue;
      const n = Math.max(2, Math.ceil(f.pts.length * reveal));
      const pulse = 0.6 + 0.4 * Math.sin(env.t * 3 + i * 1.3);
      strokeGlowLine(ctx, f.pts.slice(0, n), '#ff3a1e', '#ffd28a', 2, pulse * reveal);
    }
    ctx.globalCompositeOperation = 'source-over';
  }

  private drawEdgeDetails(ctx: CanvasRenderingContext2D, rect: { left: number; right: number }, env: GroundEnv, lightDir: number): void {
    const P = this.P;
    if (this.tufts.length) {
      ctx.strokeStyle = this.theme.id === 'moonlit' ? mix('#1a2e24', P.ambient, 0.12) : mix(P.ground, P.groundEdge, 0.3);
      ctx.lineWidth = 1.6;
      ctx.lineCap = 'round';
      ctx.beginPath();
      for (const tf of this.tufts) {
        if (tf.x < rect.left - 20 || tf.x > rect.right + 20) continue;
        const y = this.dip(tf.x) - 1;
        const sway = env.timeStop ? 0 : Math.sin(env.t * 1.6 + tf.ph) * 0.2;
        for (let k = -1; k <= 1; k++) {
          const a = tf.lean + sway + k * 0.35;
          ctx.moveTo(tf.x + k * 2, y);
          ctx.lineTo(tf.x + k * 2 + Math.sin(a) * tf.h, y - Math.cos(a) * tf.h);
        }
      }
      ctx.stroke();
    }
    if (this.drifts.length) {
      ctx.fillStyle = rgbaStr('#e8fbff', 0.55);
      ctx.beginPath();
      for (const d of this.drifts) {
        if (d.x < rect.left - 200 || d.x > rect.right + 200) continue;
        ctx.moveTo(d.x - d.w / 2, 1);
        ctx.quadraticCurveTo(d.x - d.w * 0.15 * lightDir, -d.h * 2, d.x + d.w / 2, 1);
        ctx.closePath();
      }
      ctx.fill();
    }
  }
}

function runeMark(ctx: CanvasRenderingContext2D, kind: number, x: number, y: number, s: number, col: string, a: number): void {
  ctx.strokeStyle = rgbaStr(col, Math.min(1, a));
  ctx.lineWidth = 2;
  ctx.beginPath();
  switch (kind % 6) {
    case 0: ctx.moveTo(x, y - s); ctx.lineTo(x, y + s); ctx.moveTo(x - s * 0.6, y - s * 0.4); ctx.lineTo(x + s * 0.6, y + s * 0.4); break;
    case 1: ctx.moveTo(x + s * 0.7, y); ctx.arc(x, y, s * 0.7, 0, Math.PI * 1.5); break;
    case 2: ctx.moveTo(x - s * 0.6, y + s); ctx.lineTo(x, y - s); ctx.lineTo(x + s * 0.6, y + s); break;
    case 3: ctx.moveTo(x - s * 0.6, y - s); ctx.lineTo(x + s * 0.6, y - s); ctx.lineTo(x - s * 0.6, y + s); ctx.lineTo(x + s * 0.6, y + s); break;
    case 4: ctx.moveTo(x, y - s); ctx.lineTo(x + s * 0.7, y); ctx.lineTo(x, y + s); ctx.lineTo(x - s * 0.7, y); ctx.closePath(); break;
    default: ctx.moveTo(x - s * 0.5, y - s); ctx.lineTo(x - s * 0.5, y + s); ctx.moveTo(x - s * 0.5, y); ctx.lineTo(x + s * 0.6, y - s * 0.6); break;
  }
  ctx.stroke();
}

