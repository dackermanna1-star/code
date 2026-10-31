/**
 * ArenaRenderer — everything about the environment: parallax sky & scenery, destructible
 * props, the floor with persistent battle damage, environmental hazards, weather, fog,
 * lighting flashes and the late-fight "Divine Collapse".
 *
 * Recommended draw order per frame:
 *   drawBackground → drawGround → drawProps → [fighters, VFX] → drawHazards → drawForeground
 * (drawProps before drawGround also works; props sit on the floor surface band.)
 */
import type { ArenaDef, ArenaTheme, HazardKind, PropState } from '../sim/arena';
import { THEMES } from '../sim/arena';
import type { CameraView, HazardView, IArenaRenderer } from './types';
import { Rng } from '../core/rng';
import { clamp01, damp, smoothstep } from '../core/math';
import { Scenery, type SceneEnv } from './arena/scenery';
import { Ground, SURF } from './arena/ground';
import { PropRenderer, PROP_BASE_Y, type PropEnv } from './arena/props';
import { HazardFx } from './arena/hazards';
import { DebrisSystem, FxKind, FxSystem, WeatherLayer, type WeatherLook } from './arena/particles';
import { blobSprite, chunkShape, darken, drawSpriteEllipse, jagged, lighten, mix, rgbaStr, strokeGlowLine, type Pt } from './arena/util';

interface Flash { color: string; intensity: number; x: number | null; age: number }
interface SkyCrack { pts: Pt[]; start: number; width: number }
interface Rubble { x: number; y: number; s: number; rot: number; rotV: number; vy: number; shape: number[]; ph: number }
interface Streak { x: number; y: number; vx: number; vy: number; life: number }
interface FgClump { x: number; path: Path2D; glow: boolean }

const COLLAPSE_HOT = '#ff3b2a';
const COLLAPSE_CORE = '#ffd9a0';

export class ArenaRenderer implements IArenaRenderer {
  readonly def: ArenaDef;
  readonly theme: ArenaTheme;
  /** Optional hook: ambient sky lightning (stormpeak) — e.g. to play distant thunder. */
  onSkyLightning: ((intensity: number) => void) | null = null;

  private scenery: Scenery;
  private ground: Ground;
  private propR: PropRenderer;
  private hazardFx: HazardFx;
  private fx: FxSystem;
  private debris: DebrisSystem;
  private weatherNear: WeatherLayer;
  private weatherFar: WeatherLayer;

  private t = 0;
  private collapse = 0;
  private collapseShown = 0;
  private timeStop = false;
  private darkenTarget = 0;
  private darkenAmt = 0;
  private flashes: Flash[] = [];
  private storm = 0;
  private stormTimer = 4;
  private stormSeq: number[] = [];
  private stormSeqT = 0;

  private skyCracks: SkyCrack[] = [];
  private rubble: Rubble[] = [];
  private streaks: Streak[] = [];
  private streakTimer = 0;
  private fg: FgClump[] = [];
  private fgColor: string;
  private wisps: { x: number; y: number; w: number; sp: number; a: number }[] = [];
  private fogGrad: CanvasGradient | null = null;
  private fogGradCtx: CanvasRenderingContext2D | null = null;

  constructor(def: ArenaDef) {
    this.def = def;
    this.theme = THEMES[def.theme];
    const rng = new Rng(def.visualSeed);
    this.scenery = new Scenery(this.theme, rng.nextU32());
    this.ground = new Ground(this.theme, def.halfWidth, rng.nextU32());
    this.propR = new PropRenderer(this.theme, rng.nextU32());
    this.fx = new FxSystem(700, def.halfWidth);
    this.debris = new DebrisSystem(240, def.halfWidth);
    this.hazardFx = new HazardFx(this.theme, this.fx);

    const look = this.weatherLook();
    const nearCount = { rain: 170, snow: 150, embers: 60, ash: 120, motes: 55, petals: 40, leaves: 40, sparkles: 45 }[look.kind];
    const farCount = { rain: 230, snow: 220, embers: 90, ash: 160, motes: 110, petals: 55, leaves: 55, sparkles: 80 }[look.kind];
    this.weatherNear = new WeatherLayer(look, nearCount, 1, true);
    this.weatherFar = new WeatherLayer({ ...look, color: mix(look.color, this.theme.palette.fog, 0.35) }, farCount, 0.58, false);
    if (look.kind === 'rain') {
      this.weatherNear.onGroundHit = (x) => this.fx.spawn(FxKind.Splash, x, -1, 0, 0, 0.18, 4 + Math.random() * 4, lighten(this.theme.palette.ambient, 0.3));
    }

    this.fgColor = darken(mix(this.theme.palette.ground, this.theme.palette.mid, 0.5), 0.55);
    this.buildCollapse(rng.fork('collapse'));
    this.buildForeground(rng.fork('fg'));
    const wr = rng.fork('wisps');
    for (let i = 0; i < 10; i++) this.wisps.push({ x: wr.range(-1600, 1600), y: wr.range(-40, 10), w: wr.range(220, 520), sp: wr.range(8, 26) * (wr.next() < 0.5 ? -1 : 1), a: wr.range(0.05, 0.12) });
  }

  private weatherLook(): WeatherLook {
    const P = this.theme.palette;
    switch (this.theme.weather) {
      case 'rain': return { kind: 'rain', color: '#b8cce8', color2: '#ffffff', wind: -340 };
      case 'snow': return { kind: 'snow', color: '#f2fbff', color2: '#cfefff', wind: -40 };
      case 'embers': return { kind: 'embers', color: '#ff9a4a', color2: '#ffd27a', wind: 30 };
      case 'ash': return { kind: 'ash', color: '#8a7a74', color2: '#ff7a30', wind: 50 };
      case 'motes': return { kind: 'motes', color: P.accent, color2: '#b47aff', wind: 0 };
      case 'petals': return { kind: 'petals', color: '#ff9fbf', color2: '#ffd0e0', wind: 70 };
      case 'leaves': return { kind: 'leaves', color: '#6f9a4a', color2: '#b8a04a', wind: 60 };
      case 'sparkles': return { kind: 'sparkles', color: P.accent, color2: '#ffffff', wind: 10 };
    }
  }

  private buildCollapse(r: Rng): void {
    // Sky crack network (sky layer coordinates, ~720p screen offsets).
    for (let i = 0; i < 9; i++) {
      const sx = r.range(-820, 820), sy = r.range(-480, -60);
      const len = r.range(220, 520);
      const ang = r.range(0, Math.PI * 2);
      const main = jagged(r, sx, sy, sx + Math.cos(ang) * len, sy + Math.sin(ang) * len * 0.6, 10, 40);
      const start = r.range(0, 0.55);
      this.skyCracks.push({ pts: main, start, width: r.range(1.6, 3) });
      for (let k = 2; k < main.length - 2; k += 2) {
        if (r.next() < 0.5) {
          const p = main[k];
          const a2 = ang + r.sign() * r.range(0.5, 1.2);
          const l2 = len * r.range(0.2, 0.45);
          this.skyCracks.push({ pts: jagged(r, p.x, p.y, p.x + Math.cos(a2) * l2, p.y + Math.sin(a2) * l2, 5, 18), start: start + 0.1 + k * 0.02, width: r.range(0.9, 1.6) });
        }
      }
    }
    for (let i = 0; i < 22; i++) {
      this.rubble.push({ x: r.range(-1900, 1900), y: r.range(-700, 140), s: r.range(10, 34), rot: r.range(0, 6.28), rotV: r.range(-0.6, 0.6), vy: r.range(10, 26), shape: chunkShape(() => r.next(), 6), ph: r.range(0, 6.28) });
    }
  }

  private buildForeground(r: Rng): void {
    const id = this.theme.id;
    for (let i = 0; i < 16; i++) {
      const x = -2600 + (5200 * (i + r.range(0.1, 0.9))) / 16;
      const path = new Path2D();
      const base = 115;
      let glow = false;
      if (id === 'moonlit' || id === 'sanctum') {
        // Grass tufts / reeds.
        const n = r.int(5, 9);
        for (let k = 0; k < n; k++) {
          const bx = x + r.range(-30, 30), h = r.range(50, 120), lean = r.range(-0.5, 0.5);
          path.moveTo(bx - 3, base);
          path.quadraticCurveTo(bx + lean * h * 0.4, base - h * 0.6, bx + lean * h, base - h);
          path.quadraticCurveTo(bx + lean * h * 0.4 + 2, base - h * 0.6, bx + 3, base);
          path.closePath();
        }
      } else if (id === 'nexus' || id === 'frostveil') {
        glow = id === 'nexus';
        const n = r.int(2, 4);
        for (let k = 0; k < n; k++) {
          const bx = x + r.range(-40, 40), h = r.range(50, 130), w = r.range(18, 36), lean = r.range(-0.4, 0.4);
          path.moveTo(bx - w / 2, base);
          path.lineTo(bx + lean * h, base - h);
          path.lineTo(bx + w / 2, base);
          path.closePath();
        }
      } else {
        // Rocks / rubble.
        const n = r.int(1, 3);
        for (let k = 0; k < n; k++) {
          const cx = x + r.range(-50, 50), s = r.range(30, 70);
          const sh = chunkShape(() => r.next(), 7);
          for (let j = 0; j < sh.length; j += 2) {
            const px = cx + sh[j] * s * 1.3, py = base - s * 0.5 + sh[j + 1] * s * 0.8;
            if (j === 0) path.moveTo(px, py); else path.lineTo(px, py);
          }
          path.closePath();
        }
      }
      this.fg.push({ x, path, glow });
    }
  }

  /* ============================================================ update */

  update(dt: number, cam: CameraView, props: readonly PropState[], hazards: readonly HazardView[]): void {
    void props;
    // Smoothed state that should animate even during time stop.
    this.darkenAmt = damp(this.darkenAmt, this.darkenTarget, 10, dt);
    this.collapseShown = damp(this.collapseShown, this.collapse, 1.5, dt);
    for (const f of this.flashes) f.age += dt;
    this.flashes = this.flashes.filter((f) => f.age < 0.45);

    // Hazards are sim-driven; keep them responsive even if time is stopped (they'll be static).
    this.hazardFx.update(this.timeStop ? 0 : dt, hazards, cam);
    for (const req of this.hazardFx.flashRequests) this.lightFlash(req.color, req.intensity, req.x);
    this.hazardFx.flashRequests.length = 0;

    if (this.timeStop) return;
    this.t += dt;
    this.updateStorm(dt);
    const env = this.sceneEnv();
    this.scenery.update(dt, env);
    this.ground.update(dt);
    this.propR.update(dt);
    this.fx.update(dt);
    this.debris.update(dt);
    this.weatherNear.update(dt, cam);
    this.weatherFar.update(dt, cam);
    for (const w of this.wisps) {
      w.x += w.sp * dt;
      if (w.x > 1900) w.x -= 3800;
      if (w.x < -1900) w.x += 3800;
    }
    this.updateCollapse(dt);
  }

  private updateStorm(dt: number): void {
    if (this.theme.id !== 'stormpeak') return;
    this.stormTimer -= dt;
    if (this.stormTimer <= 0 && this.stormSeq.length === 0) {
      this.stormTimer = 2.5 + Math.random() * 5.5;
      // Flicker pattern (intensity per 50ms step).
      const big = Math.random() < 0.45;
      this.stormSeq = big ? [1, 0.25, 0.9, 0.6, 0.15, 0.4, 0.05] : [0.7, 0.15, 0.5, 0.05];
      this.stormSeqT = 0;
      if (this.onSkyLightning) this.onSkyLightning(big ? 1 : 0.6);
    }
    if (this.stormSeq.length) {
      this.stormSeqT += dt;
      const idx = Math.floor(this.stormSeqT / 0.05);
      if (idx >= this.stormSeq.length) {
        this.stormSeq = [];
        this.storm = 0;
      } else {
        this.storm = this.stormSeq[idx];
      }
    } else {
      this.storm = damp(this.storm, 0, 12, dt);
    }
  }

  private updateCollapse(dt: number): void {
    const c = this.collapseShown;
    if (c < 0.01) return;
    for (const r of this.rubble) {
      r.y -= r.vy * dt * (0.5 + c);
      r.rot += r.rotV * dt;
      if (r.y < -760) r.y = 160;
    }
    this.streakTimer -= dt * c * 2.6;
    if (this.streakTimer <= 0) {
      this.streakTimer = 0.4 + Math.random() * 0.8;
      this.streaks.push({ x: (Math.random() * 2 - 1) * 1400, y: -720, vx: (Math.random() - 0.5) * 160, vy: 520 + Math.random() * 260, life: 2.2 });
    }
    for (const s of this.streaks) {
      s.x += s.vx * dt;
      s.y += s.vy * dt;
      s.life -= dt;
    }
    this.streaks = this.streaks.filter((s) => s.life > 0 && s.y < 140);
  }

  private flashState(): { intensity: number; color: string; x: number | null } {
    let best: Flash | null = null;
    let bi = 0;
    for (const f of this.flashes) {
      const k = f.age < 0.03 ? 1 : Math.pow(Math.max(0, 1 - (f.age - 0.03) / 0.4), 2);
      const v = f.intensity * k;
      if (v > bi) {
        bi = v;
        best = f;
      }
    }
    return { intensity: clamp01(bi), color: best ? best.color : '#ffffff', x: best ? best.x : null };
  }

  private sceneEnv(): SceneEnv {
    const f = this.flashState();
    return { t: this.t, flash: f.intensity, flashColor: f.color, storm: this.storm, collapse: this.collapseShown, timeStop: this.timeStop };
  }

  /* ============================================================== draw */

  drawBackground(ctx: CanvasRenderingContext2D, cam: CameraView): void {
    const env = this.sceneEnv();
    ctx.save();
    // Everything below the floor's surface band is painted over by drawGround: clip it away
    // (saves a lot of fill on software-rasterised canvases).
    cam.applyTransform(ctx, 1);
    const wr = cam.visibleWorldRect(1);
    const clipY = -SURF + 4;
    if (wr.bottom > clipY) {
      ctx.beginPath();
      ctx.rect(wr.left - 50, wr.top - 50, wr.right - wr.left + 100, clipY - (wr.top - 50));
      ctx.clip();
    }
    this.scenery.drawSky(ctx, cam, env);
    if (this.collapseShown > 0.01) this.drawSkyCracks(ctx, cam);
    this.scenery.drawFar(ctx, cam, env);
    this.scenery.drawMid(ctx, cam, env);
    if (this.collapseShown > 0.01) this.drawCollapseMid(ctx, cam);
    this.weatherFar.draw(ctx, cam, 0.9);

    // Screen-space overlays over the whole background.
    ctx.setTransform(1, 0, 0, 1, 0, 0);
    const W = cam.width, H = cam.height;
    const fl = this.flashState();
    if (fl.intensity > 0.01) {
      ctx.globalCompositeOperation = 'lighter';
      if (fl.x !== null) {
        const sp = cam.worldToScreen(fl.x, -260);
        const g = ctx.createRadialGradient(sp.x, sp.y, 0, sp.x, sp.y, Math.max(W, H) * 0.9);
        g.addColorStop(0, rgbaStr(fl.color, 0.38 * fl.intensity));
        g.addColorStop(1, rgbaStr(fl.color, 0.08 * fl.intensity));
        ctx.fillStyle = g;
      } else {
        ctx.fillStyle = rgbaStr(fl.color, 0.25 * fl.intensity);
      }
      ctx.fillRect(0, 0, W, H);
    }
    if (this.storm > 0.02) {
      ctx.globalCompositeOperation = 'lighter';
      ctx.fillStyle = rgbaStr('#9fb8ff', this.storm * 0.16);
      ctx.fillRect(0, 0, W, H);
    }
    ctx.globalCompositeOperation = 'source-over';
    if (this.collapseShown > 0.01) {
      const c = this.collapseShown;
      const g = ctx.createLinearGradient(0, 0, 0, H);
      g.addColorStop(0, rgbaStr('#3a0012', 0.42 * c));
      g.addColorStop(0.6, rgbaStr('#2a0030', 0.2 * c));
      g.addColorStop(1, rgbaStr('#ff2a10', 0.08 * c));
      ctx.fillStyle = g;
      ctx.fillRect(0, 0, W, H);
    }
    if (this.timeStop) {
      ctx.globalCompositeOperation = 'saturation';
      ctx.fillStyle = 'rgba(128,128,128,0.85)';
      ctx.fillRect(0, 0, W, H);
      ctx.globalCompositeOperation = 'difference';
      ctx.fillStyle = 'rgba(40,60,120,0.18)';
      ctx.fillRect(0, 0, W, H);
      ctx.globalCompositeOperation = 'source-over';
    }
    if (this.darkenAmt > 0.01) {
      ctx.fillStyle = rgbaStr('#000000', this.darkenAmt * 0.68);
      ctx.fillRect(0, 0, W, H);
    }
    ctx.restore();
  }

  private drawSkyCracks(ctx: CanvasRenderingContext2D, cam: CameraView): void {
    cam.applyTransform(ctx, 0.03);
    ctx.globalCompositeOperation = 'lighter';
    const c = this.collapseShown;
    for (let i = 0; i < this.skyCracks.length; i++) {
      const k = this.skyCracks[i];
      const reveal = clamp01((c - k.start) / 0.45);
      if (reveal <= 0) continue;
      const n = Math.max(2, Math.ceil(k.pts.length * reveal));
      const pulse = 0.7 + 0.3 * Math.sin(this.t * 2.4 + i);
      strokeGlowLine(ctx, n === k.pts.length ? k.pts : k.pts.slice(0, n), COLLAPSE_HOT, COLLAPSE_CORE, k.width, pulse * Math.min(1, reveal * 1.5));
    }
    ctx.globalCompositeOperation = 'source-over';
  }

  private drawCollapseMid(ctx: CanvasRenderingContext2D, cam: CameraView): void {
    const c = this.collapseShown;
    // Falling burning debris in the distance.
    cam.applyTransform(ctx, 0.3);
    ctx.globalCompositeOperation = 'lighter';
    for (const s of this.streaks) {
      const g = ctx.createLinearGradient(s.x, s.y, s.x - s.vx * 0.25, s.y - s.vy * 0.25);
      g.addColorStop(0, rgbaStr(COLLAPSE_CORE, 0.9));
      g.addColorStop(1, rgbaStr(COLLAPSE_HOT, 0));
      ctx.strokeStyle = g;
      ctx.lineWidth = 3;
      ctx.beginPath();
      ctx.moveTo(s.x, s.y);
      ctx.lineTo(s.x - s.vx * 0.25, s.y - s.vy * 0.25);
      ctx.stroke();
    }
    ctx.globalCompositeOperation = 'source-over';
    // Levitating rubble.
    cam.applyTransform(ctx, 0.45);
    const n = Math.floor(this.rubble.length * c);
    const fill = darken(this.theme.palette.mid, 0.2);
    for (let i = 0; i < n; i++) {
      const r = this.rubble[i];
      const fade = smoothstep(-760, -600, r.y) * smoothstep(160, 60, r.y);
      if (fade <= 0) continue;
      const bob = Math.sin(this.t * 0.9 + r.ph) * 6;
      const cs = Math.cos(r.rot) * r.s, sn = Math.sin(r.rot) * r.s;
      ctx.beginPath();
      for (let j = 0; j < r.shape.length; j += 2) {
        const px = r.x + r.shape[j] * cs - r.shape[j + 1] * sn;
        const py = r.y + bob + r.shape[j] * sn + r.shape[j + 1] * cs;
        if (j === 0) ctx.moveTo(px, py); else ctx.lineTo(px, py);
      }
      ctx.closePath();
      ctx.globalAlpha = fade;
      ctx.fillStyle = fill;
      ctx.fill();
      ctx.strokeStyle = rgbaStr(COLLAPSE_HOT, 0.55 * c);
      ctx.lineWidth = 1.5;
      ctx.stroke();
    }
    ctx.globalAlpha = 1;
  }

  drawProps(ctx: CanvasRenderingContext2D, cam: CameraView, props: readonly PropState[]): void {
    ctx.save();
    cam.applyTransform(ctx, 1);
    const fl = this.flashState();
    const env: PropEnv = { t: this.t, flash: fl.intensity, flashColor: fl.color, darken: this.darkenAmt, lightDir: this.scenery.lightDir, timeStop: this.timeStop };
    const rect = cam.visibleWorldRect(1);
    const visible = props.filter((p) => p.def.x + p.def.width * 2 > rect.left && p.def.x - p.def.width * 2 < rect.right);
    this.propR.draw(ctx, visible, env);
    ctx.restore();
  }

  drawGround(ctx: CanvasRenderingContext2D, cam: CameraView): void {
    ctx.save();
    const fl = this.flashState();
    this.ground.draw(ctx, cam, { t: this.t, flash: fl.intensity, flashColor: fl.color, darken: this.darkenAmt, collapse: this.collapseShown, storm: this.storm, timeStop: this.timeStop }, this.scenery.lightDir);
    ctx.restore();
  }

  drawHazards(ctx: CanvasRenderingContext2D, cam: CameraView, hazards: readonly HazardView[]): void {
    ctx.save();
    this.hazardFx.draw(ctx, cam, hazards);
    ctx.restore();
  }

  drawForeground(ctx: CanvasRenderingContext2D, cam: CameraView): void {
    ctx.save();
    cam.applyTransform(ctx, 1);
    this.debris.draw(ctx, this.darkenAmt * 0.5);
    this.fx.draw(ctx);

    // Ground-hugging fog band + drifting wisps.
    const P = this.theme.palette;
    const rect = cam.visibleWorldRect(1);
    ctx.globalCompositeOperation = 'source-over';
    if (!this.fogGrad || this.fogGradCtx !== ctx) {
      const g = ctx.createLinearGradient(0, -110, 0, 90);
      g.addColorStop(0, rgbaStr(P.fog, 0));
      g.addColorStop(0.55, rgbaStr(P.fog, 0.12));
      g.addColorStop(1, rgbaStr(P.fog, 0.05));
      this.fogGrad = g;
      this.fogGradCtx = ctx;
    }
    ctx.fillStyle = this.fogGrad;
    ctx.globalAlpha = 1 - this.darkenAmt * 0.6;
    ctx.fillRect(rect.left, -110, rect.right - rect.left, 200);
    ctx.globalAlpha = 1;
    const wisp = blobSprite(lighten(P.fog, 0.15));
    for (const w of this.wisps) {
      if (w.x + w.w < rect.left || w.x - w.w > rect.right) continue;
      drawSpriteEllipse(ctx, wisp, w.x, w.y, w.w, 26, w.a * (1 - this.darkenAmt * 0.5));
    }
    ctx.globalAlpha = 1;

    this.weatherNear.draw(ctx, cam, 1);

    // Dark foreground silhouettes (only when the camera is close enough to read them as depth).
    const camZoom = cam.zoom / Math.max(1e-3, cam.height / 720);
    const fgA = smoothstep(0.78, 0.95, camZoom);
    if (fgA > 0.01) {
      cam.applyTransform(ctx, 1.25);
      ctx.globalAlpha = fgA;
      ctx.fillStyle = this.fgColor;
      const r2 = cam.visibleWorldRect(1.25);
      for (const c of this.fg) {
        if (c.x < r2.left - 150 || c.x > r2.right + 150) continue;
        ctx.fill(c.path);
        if (c.glow) {
          ctx.strokeStyle = rgbaStr(P.accent, 0.35);
          ctx.lineWidth = 1.5;
          ctx.stroke(c.path);
        }
      }
      ctx.globalAlpha = 1;
    }
    ctx.restore();
  }

  /* ======================================================== event hooks */

  onPropHit(prop: PropState, x: number, y: number, power: number): void {
    this.propR.onHit(prop, power);
    const mat = this.propR.materialColor(prop.def.kind);
    const dir = prop.lastHitDir || (x < prop.def.x ? -1 : 1);
    const n = 3 + Math.floor(power * 6);
    for (let i = 0; i < n; i++) {
      this.debris.spawn(x, y, -dir * (80 + Math.random() * 260) + (Math.random() - 0.5) * 120, -120 - Math.random() * 380, 2.5 + Math.random() * 4.5 * (0.5 + power), mat.fill, mat.edge, 4 + Math.random() * 3);
    }
    for (let i = 0; i < 2 + power * 3; i++) {
      this.fx.spawn(FxKind.Dust, x, y, -dir * (30 + Math.random() * 60), -20 - Math.random() * 40, 0.9, 14 + Math.random() * 14 * (0.5 + power), mix(this.theme.palette.fog, '#888888', 0.4), { grow: 30, drag: 2 });
    }
    for (let i = 0; i < 4 + power * 6; i++) {
      const a = Math.random() * Math.PI * 2;
      const sp = 200 + Math.random() * 400;
      this.fx.spawn(FxKind.Spark, x, y, Math.cos(a) * sp, Math.sin(a) * sp, 0.18 + Math.random() * 0.2, 1.4, '#fff1d0', { drag: 3 });
    }
  }

  onPropDestroyed(prop: PropState, dir: number): void {
    const d = prop.def;
    const mat = this.propR.materialColor(d.kind);
    const big = d.kind !== 'lantern' && d.kind !== 'bamboo';
    const count = Math.min(30, Math.max(12, Math.round(d.height / 18)));
    const s = dir || 1;
    for (let i = 0; i < count; i++) {
      const hy = PROP_BASE_Y - Math.random() * d.height;
      const hx = d.x + (Math.random() - 0.5) * d.width;
      const up = (1 - (hy - PROP_BASE_Y) / -d.height) * 0.5;
      const size = (big ? 5 : 3) + Math.random() * d.width * (big ? 0.28 : 0.2);
      this.debris.spawn(hx, hy, s * (120 + Math.random() * 520) + (Math.random() - 0.5) * 260, -(80 + Math.random() * 520) * (0.6 + up), size, Math.random() < 0.7 ? mat.fill : mix(mat.fill, mat.edge, 0.4), mat.edge);
    }
    const dust = mix(this.theme.palette.fog, '#7a7a7a', 0.45);
    for (let i = 0; i < 10; i++) {
      const hy = PROP_BASE_Y - Math.random() * d.height * 0.8;
      this.fx.spawn(FxKind.Dust, d.x + (Math.random() - 0.5) * d.width * 1.5, hy, s * (40 + Math.random() * 120), -20 - Math.random() * 60, 1.4 + Math.random() * 0.8, 26 + Math.random() * 30, dust, { grow: 45, drag: 1.6 });
    }
    for (let i = 0; i < 4; i++) this.fx.spawn(FxKind.Dust, d.x + (Math.random() - 0.5) * d.width * 3, -8, (Math.random() - 0.5) * 200, -10, 1.8, 30 + Math.random() * 20, dust, { grow: 60, drag: 2 });
    for (let i = 0; i < 12; i++) {
      const a = Math.random() * Math.PI * 2;
      const sp = 250 + Math.random() * 500;
      this.fx.spawn(FxKind.Spark, d.x, PROP_BASE_Y - d.height * Math.random(), Math.cos(a) * sp, Math.sin(a) * sp, 0.25 + Math.random() * 0.3, 1.6, d.kind === 'crystal' ? this.theme.palette.accent : '#ffe6b8', { gravity: 600, drag: 2 });
    }
    if (d.kind === 'crystal' || d.kind === 'lantern') this.lightFlash(d.kind === 'crystal' ? this.theme.palette.accent : '#ffb35a', 0.4, d.x);
    this.ground.addCrack(d.x, d.width * 3);
  }

  addCrater(x: number, radius: number): void {
    this.ground.addCrater(x, radius);
    const dust = mix(this.theme.palette.fog, '#6a6a6a', 0.5);
    for (let i = 0; i < 7; i++) this.fx.spawn(FxKind.Dust, x + (Math.random() - 0.5) * radius * 1.6, -SURF * 0.5, (Math.random() - 0.5) * 260, -30 - Math.random() * 90, 1.3, radius * (0.25 + Math.random() * 0.3), dust, { grow: radius * 0.6, drag: 1.8 });
    const mat = this.propR.materialColor('pillar');
    for (let i = 0; i < 8; i++) this.debris.spawn(x + (Math.random() - 0.5) * radius, -6, (Math.random() - 0.5) * 520, -200 - Math.random() * 420, 2 + Math.random() * radius * 0.07, darken(mat.fill, 0.2), mat.edge, 3 + Math.random() * 3);
  }

  addCrack(x: number, length: number): void {
    this.ground.addCrack(x, length);
  }

  addScorch(x: number, radius: number, color: string): void {
    this.ground.addScorch(x, radius, color);
  }

  lightFlash(color: string, intensity: number, x?: number): void {
    this.flashes.push({ color, intensity: clamp01(intensity), x: x ?? null, age: 0 });
    if (this.flashes.length > 5) this.flashes.shift();
  }

  setCollapse(level: number): void {
    this.collapse = clamp01(level);
  }

  setTimeStop(active: boolean): void {
    this.timeStop = active;
  }

  setDarken(amount: number): void {
    this.darkenTarget = clamp01(amount);
  }

  /** Clear transient particles (e.g. when restarting the same arena). */
  resetTransient(): void {
    this.fx.clear();
    this.debris.clear();
    this.hazardFx.reset();
    this.flashes = [];
  }

  /** Expose the weather/hazard kind for audio ambience decisions. */
  get hazardKind(): HazardKind {
    return this.theme.hazard;
  }
}

