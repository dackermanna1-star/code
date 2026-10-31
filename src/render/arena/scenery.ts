/**
 * Parallax scenery for every arena theme: sky (gradient, stars, celestial bodies, nebula,
 * aurora, god rays, storm clouds), far silhouettes and mid-ground structures.
 *
 * Layer coordinates: for parallax p the camera transform scales by lerp(1, zoom, p) and
 * translates by camera * p, so for small p one layer unit ≈ one 720p screen pixel offset
 * from the screen centre. Silhouettes are cached Path2D objects (crisp at any zoom);
 * soft elements (clouds, nebula, glows) are cached bitmaps.
 */
import type { ArenaTheme } from '../../sim/arena';
import type { CameraView } from '../types';
import { Rng } from '../../core/rng';
import { clamp01, smoothstep } from '../../core/math';
import {
  blobSprite, cloudSprite, ctxOf, darken, drawSprite, glowSprite, lighten, makeBolt, makeCanvas, mix, rgbaStr,
  strokeGlowLine, type Bolt, type Pt,
} from './util';
import { LayerCache, type LayerRect } from './layerCache';
import {
  addArch, addBamboo, addColumn, addCrystalCluster, addGuardian, addLeaf, addPagoda, addRotRect, addSpire, addTower,
  islandPath, mountainRange, rimPath,
} from './shapes';

export interface SceneEnv {
  /** Animation clock (frozen during time stop). */
  t: number;
  /** 0..1 global light flash (explosions, beams, lightning). */
  flash: number;
  flashColor: string;
  /** 0..1 storm lightning intensity (stormpeak ambient). */
  storm: number;
  collapse: number;
  timeStop: boolean;
}

type Rect = { left: number; right: number; top: number; bottom: number };
type DrawFn = (ctx: CanvasRenderingContext2D, env: SceneEnv, rect: Rect) => void;

interface SubLayer {
  p: number;
  fills: { path: Path2D; color: string; alpha?: number }[];
  rim?: { path: Path2D; color: string; width: number; alpha: number; flashBoost: number };
  fog?: { top: number; mid: number; color: string; a: number; aBelow: number };
  pre?: DrawFn;
  post?: DrawFn;
  /** Static decoration (after rim, before fog), e.g. snow caps. */
  staticPost?: DrawFn;
  /** Replaces `fills` (e.g. bobbing islands). */
  custom?: DrawFn;
  sway?: { base: number; amount: number; speed: number };
}

interface CloudInst { x: number; y: number; w: number; h: number; sprite: HTMLCanvasElement; speed: number; alpha: number; flip: boolean }
interface CloudLayer { p: number; items: CloudInst[]; wrap: number; stormLit: boolean; bake: HTMLCanvasElement | null; bakeY: number; bakeH: number; offset: number; speed: number }

interface Celestial {
  kind: 'sun' | 'moon' | 'voidsun' | 'redsun' | 'smallmoon' | 'goldsun' | 'hidden';
  x: number;
  y: number;
  r: number;
}

interface Star { x: number; y: number; s: number; b: number; ph: number; sp: number }

interface Puff { x: number; y: number; r: number; age: number; life: number; vx: number; vy: number }

const SKY_P = 0.03;

class GradCache {
  private maps = new WeakMap<CanvasRenderingContext2D, Map<string, CanvasGradient>>();
  get(ctx: CanvasRenderingContext2D, key: string, make: (c: CanvasRenderingContext2D) => CanvasGradient): CanvasGradient {
    let map = this.maps.get(ctx);
    if (!map) {
      map = new Map();
      this.maps.set(ctx, map);
    }
    let g = map.get(key);
    if (!g) {
      g = make(ctx);
      map.set(key, g);
    }
    return g;
  }
}

export class Scenery {
  readonly theme: ArenaTheme;
  /** -1 = key light from the left, 1 = from the right. */
  lightDir: -1 | 1 = -1;
  private pal: ArenaTheme['palette'];
  private rng: Rng;
  private grads = new GradCache();
  private skyCache = new LayerCache(SKY_P, 120, 0.012, true);

  private stars: Star[] = [];
  private celestial: Celestial = { kind: 'hidden', x: 0, y: 0, r: 0 };
  private clouds: CloudLayer[] = [];
  private far: SubLayer[] = [];
  private mid: SubLayer[] = [];

  // Theme specials.
  private nebula: HTMLCanvasElement | null = null;
  private auroraStrip: HTMLCanvasElement | null = null;
  private godRays: { a: number; w: number; len: number; alpha: number; sp: number }[] = [];
  private stormBolt: Bolt | null = null;
  private stormBoltX = 0;
  private puffs: Puff[] = [];
  private puffTimer = 0;
  private volcano: { x: number; y: number; p: number } | null = null;
  private moonDetail: { x: number; y: number; r: number; a: number }[] = [];

  constructor(theme: ArenaTheme, seed: number) {
    this.theme = theme;
    this.pal = theme.palette;
    this.rng = new Rng(seed ^ 0x5a17);
    this.build();
  }

  /* ================================================================ build */

  private build(): void {
    const id = this.theme.id;
    switch (id) {
      case 'sanctum': this.buildSanctum(); break;
      case 'stormpeak': this.buildStormpeak(); break;
      case 'nexus': this.buildNexus(); break;
      case 'caldera': this.buildCaldera(); break;
      case 'frostveil': this.buildFrostveil(); break;
      case 'celestial': this.buildCelestial(); break;
      case 'moonlit': this.buildMoonlit(); break;
    }
  }

  private makeStars(count: number, yMax: number, tint: string): void {
    const r = this.rng.fork('stars');
    for (let i = 0; i < count; i++) {
      const big = r.next() < 0.08;
      this.stars.push({
        x: r.range(-1000, 1000),
        y: r.range(-560, yMax),
        s: big ? r.range(1.4, 2.2) : r.range(0.5, 1.2),
        b: big ? r.range(0.7, 1) : r.range(0.25, 0.75),
        ph: r.range(0, Math.PI * 2),
        sp: r.range(0.6, 3.2),
      });
    }
    void tint;
  }

  private makeClouds(p: number, count: number, y0: number, y1: number, width: [number, number], alpha: [number, number], speed: [number, number], lit: string, shade: string, o: { flat?: number; flip?: boolean; puffs?: number; stormLit?: boolean; aspect?: [number, number] } = {}): void {
    const r = this.rng.fork('clouds' + p);
    const sprites: HTMLCanvasElement[] = [];
    const variants = Math.min(4, count);
    for (let i = 0; i < variants; i++) sprites.push(cloudSprite(r, lit, shade, { flat: o.flat ?? 0.55, puffs: o.puffs ?? 24 }));
    const wrap = 1400;
    const items: CloudInst[] = [];
    for (let i = 0; i < count; i++) {
      const w = r.range(width[0], width[1]);
      items.push({
        x: -wrap + (2 * wrap * (i + r.next() * 0.8)) / count,
        y: r.range(y0, y1),
        w,
        h: w * r.range(o.aspect?.[0] ?? 0.32, o.aspect?.[1] ?? 0.46),
        sprite: sprites[i % variants],
        speed: r.range(speed[0], speed[1]),
        alpha: r.range(alpha[0], alpha[1]),
        flip: o.flip ?? false,
      });
    }
    // Draw far-to-near (higher clouds first).
    items.sort((a, b) => a.y - b.y);
    const L: CloudLayer = { p, items, wrap, stormLit: o.stormLit ?? false, bake: null, bakeY: 0, bakeH: 0, offset: 0, speed: 0 };
    this.bakeClouds(L);
    this.clouds.push(L);
  }

  /** Composite a whole cloud layer into one seamless, horizontally tiling bitmap (cuts overdraw). */
  private bakeClouds(L: CloudLayer): void {
    const K = 0.6; // px per layer unit
    let minY = Infinity, maxY = -Infinity, sp = 0;
    for (const c of L.items) {
      minY = Math.min(minY, c.y - c.h / 2);
      maxY = Math.max(maxY, c.y + c.h / 2);
      sp += c.speed;
    }
    const P = L.wrap * 2;
    const cv = makeCanvas(P * K, (maxY - minY) * K + 4);
    const g = ctxOf(cv);
    g.scale(K, K);
    g.translate(L.wrap, -minY + 2 / K);
    for (const c of L.items) {
      for (const shift of [-P, 0, P]) {
        const x = c.x + shift;
        if (x + c.w / 2 < -L.wrap || x - c.w / 2 > L.wrap) continue;
        g.globalAlpha = c.alpha;
        if (c.flip) {
          g.save();
          g.translate(x, c.y);
          g.scale(1, -1);
          g.drawImage(c.sprite, -c.w / 2, -c.h / 2, c.w, c.h);
          g.restore();
        } else {
          g.drawImage(c.sprite, x - c.w / 2, c.y - c.h / 2, c.w, c.h);
        }
      }
    }
    L.bake = cv;
    L.bakeY = minY - 2 / K;
    L.bakeH = cv.height / K;
    L.speed = sp / Math.max(1, L.items.length);
  }

  private fogColor(t: number, base: string): string {
    return mix(base, this.pal.fog, t);
  }

  /* -------------------------------------------------------------- sanctum */
  private buildSanctum(): void {
    const P = this.pal, R = this.rng;
    this.lightDir = -1;
    this.celestial = { kind: 'sun', x: -330, y: 96, r: 98 };
    this.makeStars(70, -260, '#ffe6d0');
    this.makeClouds(0.05, 7, -400, -230, [380, 640], [0.35, 0.55], [3, 7], mix(P.skyHorizon, P.celestial, 0.5), darken(P.skyMid, 0.25), { flat: 0.85, puffs: 30, aspect: [0.16, 0.24] });
    this.makeClouds(0.1, 6, -250, -70, [300, 520], [0.4, 0.6], [5, 10], mix(P.skyHorizon, '#ffd0b0', 0.4), darken(P.skyMid, 0.1), { flat: 0.8, puffs: 30, aspect: [0.2, 0.28] });

    const a = mountainRange(R.fork('fa'), { x0: -1500, x1: 1500, base: 170, amp: 220, freq: 0.0016, sharp: 0.15 });
    const b = mountainRange(R.fork('fb'), { x0: -1500, x1: 1500, base: 175, amp: 270, freq: 0.0023, sharp: 0.32 });
    this.far.push({ p: 0.07, fills: [{ path: a.path, color: mix(P.far, P.skyHorizon, 0.55) }], rim: { path: rimPath(a.top, -1), color: P.celestial, width: 1.6, alpha: 0.35, flashBoost: 0.4 }, fog: { top: 0, mid: 175, color: P.fog, a: 0.3, aBelow: 0.45 } });
    this.far.push({ p: 0.13, fills: [{ path: b.path, color: mix(P.far, P.fog, 0.22) }], rim: { path: rimPath(b.top, -1), color: P.ambient, width: 1.4, alpha: 0.3, flashBoost: 0.4 }, fog: { top: 40, mid: 180, color: P.fog, a: 0.35, aBelow: 0.55 } });

    // Mid back: colonnade + temple facade.
    const back = new Path2D();
    const backRim = new Path2D();
    const rb = R.fork('colonnade');
    let x = -1950;
    let prevTop: { x: number; y: number; intact: boolean } | null = null;
    while (x < 1950) {
      const w = rb.range(30, 42);
      const h = rb.range(230, 340);
      const broken = rb.next() < 0.38 ? rb.range(0.35, 0.85) : null;
      const res = addColumn(back, rb, x, 70, w, h, broken);
      backRim.rect(x - w / 2, res.topY + 8, 3, 70 - res.topY - 14);
      if (prevTop && prevTop.intact && broken === null && rb.next() < 0.7 && Math.abs(prevTop.y - res.topY) < 60) {
        const y = Math.min(prevTop.y, res.topY);
        back.rect(prevTop.x - 20, y - 22, x - prevTop.x + 40, 24);
      }
      prevTop = { x, y: res.topY, intact: broken === null };
      x += rb.range(140, 210);
    }
    // Temple facade.
    const fx = -980;
    for (let i = 0; i < 6; i++) addColumn(back, rb, fx - 250 + i * 100, 70, 40, 340, null);
    back.rect(fx - 300, 70 - 372, 600, 34);
    back.moveTo(fx - 315, 70 - 372);
    back.lineTo(fx - 40, 70 - 372 - 120);
    back.lineTo(fx + 60, 70 - 372 - 96);
    back.lineTo(fx + 90, 70 - 372 - 60);
    back.lineTo(fx + 150, 70 - 372 - 66);
    back.lineTo(fx + 315, 70 - 372);
    back.closePath();
    addArch(back, 520, 700, 70, 300, 30, 1);
    addArch(back, 1180, 1330, 70, 270, 26, -1);
    this.mid.push({
      p: 0.3,
      fills: [{ path: back, color: this.fogColor(0.38, P.mid) }],
      rim: { path: backRim, color: P.ambient, width: 0, alpha: 0.22, flashBoost: 0.3 },
      fog: { top: -120, mid: 70, color: P.fog, a: 0.42, aBelow: 0.62 },
    });

    // Mid front: huge broken columns, fallen drums, giant statue head.
    const front = new Path2D();
    const frontRim = new Path2D();
    const rf = R.fork('front');
    const xs = [-1650, -1080, -430, 380, 980, 1560];
    for (const cx of xs) {
      const px = cx + rf.range(-120, 120);
      const w = rf.range(58, 78);
      const h = rf.range(260, 470);
      const res = addColumn(front, rf, px, 80, w, h, rf.next() < 0.75 ? rf.range(0.45, 0.9) : null);
      frontRim.rect(px - w / 2, res.topY + 10, 4, 80 - res.topY - 18);
      if (rf.next() < 0.6) addRotRect(front, px + rf.sign() * rf.range(90, 160), 80 - 22, rf.range(70, 110), w * 0.85, rf.range(-0.15, 0.15));
    }
    // Giant statue head lying on its side.
    const hx = 1250, hy = 80;
    front.moveTo(hx + 120, hy);
    front.ellipse(hx, hy - 70, 120, 86, -0.25, 0, Math.PI * 2);
    front.rect(hx - 150, hy - 26, 300, 30);
    this.mid.push({
      p: 0.46,
      fills: [{ path: front, color: this.fogColor(0.12, P.mid) }],
      rim: { path: frontRim, color: P.ambient, width: 0, alpha: 0.28, flashBoost: 0.4 },
      fog: { top: -170, mid: 80, color: P.fog, a: 0.4, aBelow: 0.7 },
      post: (ctx, env) => {
        // Faint carved eyes on the fallen head catch the light.
        ctx.globalCompositeOperation = 'lighter';
        drawSprite(ctx, glowSprite(P.accent), hx - 30, hy - 96, 18, 0.18 + env.flash * 0.3);
        ctx.globalCompositeOperation = 'source-over';
      },
    });
  }

  /* ------------------------------------------------------------ stormpeak */
  private buildStormpeak(): void {
    const P = this.pal, R = this.rng;
    this.lightDir = 1;
    this.celestial = { kind: 'hidden', x: -300, y: -260, r: 40 };
    this.makeClouds(0.035, 9, -520, -300, [620, 980], [0.85, 1], [14, 28], lighten(P.skyMid, 0.12), darken(P.skyTop, 0.2), { flat: 0.3, puffs: 30, stormLit: true });
    this.makeClouds(0.07, 9, -420, -190, [520, 860], [0.8, 0.95], [22, 40], lighten(P.skyHorizon, 0.08), darken(P.skyMid, 0.35), { flat: 0.35, puffs: 28, stormLit: true });
    this.makeClouds(0.12, 7, -300, -120, [420, 700], [0.6, 0.8], [30, 55], lighten(P.skyHorizon, 0.15), darken(P.skyMid, 0.2), { flat: 0.5, puffs: 24, stormLit: true });

    const a = mountainRange(R.fork('fa'), { x0: -1500, x1: 1500, base: 170, amp: 300, freq: 0.0021, sharp: 0.9 });
    const b = mountainRange(R.fork('fb'), { x0: -1500, x1: 1500, base: 175, amp: 340, freq: 0.0029, sharp: 0.85 });
    this.far.push({ p: 0.07, fills: [{ path: a.path, color: mix(P.far, P.fog, 0.45) }], rim: { path: rimPath(a.top, 1), color: '#dfe9ff', width: 1.6, alpha: 0.06, flashBoost: 0.9 }, fog: { top: -20, mid: 170, color: P.fog, a: 0.35, aBelow: 0.5 }, staticPost: this.snowCaps(a, 0.16) });
    this.far.push({ p: 0.13, fills: [{ path: b.path, color: mix(P.far, P.fog, 0.2) }], rim: { path: rimPath(b.top, 1), color: '#dfe9ff', width: 1.5, alpha: 0.05, flashBoost: 0.9 }, fog: { top: 20, mid: 180, color: P.fog, a: 0.4, aBelow: 0.55 }, staticPost: this.snowCaps(b, 0.1) });

    const crag = mountainRange(R.fork('crag'), { x0: -2000, x1: 2000, base: 70, amp: 360, freq: 0.0042, sharp: 1, step: 10 });
    this.mid.push({ p: 0.3, fills: [{ path: crag.path, color: this.fogColor(0.3, P.mid) }], rim: { path: rimPath(crag.top, 1), color: '#e6efff', width: 1.6, alpha: 0.05, flashBoost: 1 }, fog: { top: -100, mid: 70, color: P.fog, a: 0.45, aBelow: 0.65 } });

    const front = new Path2D();
    const rf = R.fork('spires');
    const tops: Pt[][] = [];
    for (const cx of [-1500, -820, -60, 760, 1480]) {
      const px = cx + rf.range(-160, 160);
      const central = Math.abs(cx) < 200;
      tops.push(addSpire(front, rf, px, 80, rf.range(110, 190) * (central ? 0.8 : 1), rf.range(380, 640) * (central ? 0.62 : 1)));
    }
    // Ruined watchtower atop the middle spire's flank.
    const tx = -60 + 120;
    front.rect(tx - 26, 80 - 330, 52, 250);
    front.moveTo(tx - 30, 80 - 330);
    front.lineTo(tx - 22, 80 - 372);
    front.lineTo(tx - 6, 80 - 352);
    front.lineTo(tx + 10, 80 - 384);
    front.lineTo(tx + 30, 80 - 330);
    front.closePath();
    const rimP = new Path2D();
    for (const t of tops) for (let i = Math.floor(t.length / 2); i < t.length - 1; i++) { rimP.moveTo(t[i].x, t[i].y); rimP.lineTo(t[i + 1].x, t[i + 1].y); }
    this.mid.push({
      p: 0.46,
      fills: [{ path: front, color: this.fogColor(0.2, P.mid) }],
      rim: { path: rimP, color: '#f0f6ff', width: 2, alpha: 0.05, flashBoost: 1 },
      fog: { top: -150, mid: 80, color: P.fog, a: 0.42, aBelow: 0.7 },
      post: (ctx, env) => {
        // A faint signal fire in the tower window.
        ctx.globalCompositeOperation = 'lighter';
        const fl = 0.55 + 0.45 * Math.sin(env.t * 7) * Math.sin(env.t * 3.3);
        drawSprite(ctx, glowSprite('#ffb060'), tx, 80 - 290, 26, 0.35 * fl);
        ctx.globalCompositeOperation = 'source-over';
      },
    });
  }

  /* ---------------------------------------------------------------- nexus */
  private buildNexus(): void {
    const P = this.pal, R = this.rng;
    this.lightDir = 1;
    this.celestial = { kind: 'voidsun', x: 330, y: -215, r: 60 };
    this.makeStars(300, 160, '#ffffff');
    this.nebula = this.makeNebula();

    // Megastructure ring + distant islands.
    const ringR = 560;
    const ringSegs: [number, number][] = [];
    const rr = R.fork('ring');
    let ang = 0;
    while (ang < Math.PI * 2) {
      const len = rr.range(0.3, 0.9);
      ringSegs.push([ang, Math.min(Math.PI * 2, ang + len)]);
      ang += len + rr.range(0.08, 0.3);
    }
    const isl = R.fork('farisl');
    const farIslands: { path: Path2D; x: number; y: number; ph: number }[] = [];
    for (let i = 0; i < 13; i++) {
      const w = isl.range(60, 170);
      farIslands.push({ path: islandPath(isl, w, w * isl.range(0.5, 0.9)).path, x: isl.range(-1400, 1400), y: isl.range(-260, 120), ph: isl.range(0, 6.28) });
    }
    this.far.push({
      p: 0.05,
      fills: [],
      custom: (ctx, env) => {
        ctx.save();
        ctx.translate(-120, -60);
        ctx.rotate(env.t * 0.012);
        ctx.lineCap = 'butt';
        ctx.strokeStyle = rgbaStr(mix(P.far, P.skyHorizon, 0.55), 0.7);
        ctx.lineWidth = 11;
        ctx.beginPath();
        for (const [a0, a1] of ringSegs) { ctx.moveTo(Math.cos(a0) * ringR, Math.sin(a0) * ringR); ctx.arc(0, 0, ringR, a0, a1); }
        ctx.stroke();
        ctx.strokeStyle = rgbaStr(P.accent, 0.28);
        ctx.lineWidth = 1.5;
        ctx.beginPath();
        for (const [a0, a1] of ringSegs) { ctx.moveTo(Math.cos(a0) * (ringR - 3), Math.sin(a0) * (ringR - 3)); ctx.arc(0, 0, ringR - 3, a0, a1); }
        ctx.stroke();
        ctx.globalCompositeOperation = 'lighter';
        const g = glowSprite(P.accent);
        for (let i = 0; i < ringSegs.length; i++) {
          const [a0] = ringSegs[i];
          const pulse = 0.4 + 0.6 * Math.max(0, Math.sin(env.t * 1.3 + i * 1.7));
          drawSprite(ctx, g, Math.cos(a0 + 0.05) * ringR, Math.sin(a0 + 0.05) * ringR, 16, 0.4 * pulse);
        }
        ctx.globalCompositeOperation = 'source-over';
        ctx.restore();
      },
    });
    this.far.push({
      p: 0.11,
      fills: [],
      custom: (ctx, env) => {
        ctx.fillStyle = mix(P.far, P.skyHorizon, 0.2);
        for (const f of farIslands) {
          ctx.save();
          ctx.translate(f.x, f.y + Math.sin(env.t * 0.35 + f.ph) * 6);
          ctx.fill(f.path);
          ctx.restore();
        }
      },
      fog: { top: 40, mid: 220, color: P.fog, a: 0.25, aBelow: 0.4 },
    });

    this.mid.push(this.islandLayer(R.fork('isl1'), 0.3, 7, [150, 280], [-330, -40], this.fogColor(0.32, P.mid), 0.55));
    this.mid.push(this.islandLayer(R.fork('isl2'), 0.46, 5, [240, 420], [-300, -60], this.fogColor(0.08, P.mid), 0.8));
    // Void glow welling up from below.
    this.mid[1].fog = { top: -60, mid: 120, color: P.fog, a: 0.4, aBelow: 0.75 };
    this.mid[0].fog = { top: -40, mid: 120, color: P.fog, a: 0.3, aBelow: 0.6 };
  }

  private islandLayer(r: Rng, p: number, count: number, wRange: [number, number], yRange: [number, number], color: string, crystalAlpha: number): SubLayer {
    const P = this.pal;
    const items: { path: Path2D; crystals: Path2D; anchors: Pt[]; x: number; y: number; ph: number; amp: number; rot: number; w: number }[] = [];
    for (let i = 0; i < count; i++) {
      const w = r.range(wRange[0], wRange[1]);
      const isl = islandPath(r, w, w * r.range(0.45, 0.75));
      const crystals = new Path2D();
      for (const c of isl.crystals) addCrystalCluster(crystals, r, c.x, c.y + 2, w * r.range(0.12, 0.22));
      items.push({
        path: isl.path, crystals, anchors: isl.crystals,
        x: -1900 + (3800 * (i + r.range(0.1, 0.9))) / count,
        y: r.range(yRange[0], yRange[1]),
        ph: r.range(0, 6.28), amp: r.range(8, 20), rot: r.range(-0.06, 0.06), w,
      });
    }
    const rimCol = lighten(P.ambient, 0.1);
    return {
      p,
      fills: [],
      custom: (ctx, env) => {
        const glow = glowSprite(P.accent);
        for (const it of items) {
          ctx.save();
          ctx.translate(it.x, it.y + Math.sin(env.t * 0.45 + it.ph) * it.amp);
          ctx.rotate(it.rot + Math.sin(env.t * 0.3 + it.ph) * 0.015);
          ctx.fillStyle = color;
          ctx.fill(it.path);
          ctx.strokeStyle = rgbaStr(rimCol, 0.18 + env.flash * 0.3);
          ctx.lineWidth = 1.5;
          ctx.stroke(it.path);
          ctx.fillStyle = rgbaStr(mix(P.accent, '#ffffff', 0.2), crystalAlpha);
          ctx.fill(it.crystals);
          ctx.globalCompositeOperation = 'lighter';
          for (let k = 0; k < it.anchors.length; k++) {
            const a = it.anchors[k];
            const pulse = 0.6 + 0.4 * Math.sin(env.t * 1.7 + it.ph + k);
            drawSprite(ctx, glow, a.x, a.y - it.w * 0.08, it.w * 0.32, 0.35 * pulse * crystalAlpha);
          }
          ctx.globalCompositeOperation = 'source-over';
          ctx.restore();
        }
      },
    };
  }

  private makeNebula(): HTMLCanvasElement {
    const P = this.pal;
    const W = 1100, H = 700;
    const c = makeCanvas(W, H);
    const g = ctxOf(c);
    const r = this.rng.fork('nebula');
    const cols = [P.fog, P.accent, P.celestial, '#3a6aff', P.skyHorizon];
    g.globalCompositeOperation = 'lighter';
    for (let i = 0; i < 70; i++) {
      // Concentrate along a diagonal band.
      const t = r.next();
      const x = W * t + r.gaussian(0, 90);
      const y = H * (0.75 - 0.5 * t) + r.gaussian(0, 70);
      const rad = r.range(40, 190);
      const col = cols[r.int(0, cols.length - 1)];
      const grad = g.createRadialGradient(x, y, 0, x, y, rad);
      const a = r.range(0.04, 0.13);
      grad.addColorStop(0, rgbaStr(col, a));
      grad.addColorStop(0.6, rgbaStr(col, a * 0.35));
      grad.addColorStop(1, rgbaStr(col, 0));
      g.fillStyle = grad;
      g.fillRect(x - rad, y - rad, rad * 2, rad * 2);
    }
    g.globalCompositeOperation = 'source-over';
    for (let i = 0; i < 26; i++) {
      const t = r.next();
      const x = W * t + r.gaussian(0, 60);
      const y = H * (0.75 - 0.5 * t) + r.gaussian(0, 40);
      const rad = r.range(30, 110);
      const grad = g.createRadialGradient(x, y, 0, x, y, rad);
      grad.addColorStop(0, 'rgba(2,0,8,0.45)');
      grad.addColorStop(1, 'rgba(2,0,8,0)');
      g.fillStyle = grad;
      g.fillRect(x - rad, y - rad, rad * 2, rad * 2);
    }
    // Embedded bright stars.
    for (let i = 0; i < 90; i++) {
      g.fillStyle = `rgba(255,255,255,${r.range(0.3, 0.9).toFixed(2)})`;
      const s = r.range(0.6, 1.8);
      g.fillRect(r.range(0, W), r.range(0, H), s, s);
    }
    return c;
  }

  /* -------------------------------------------------------------- caldera */
  private buildCaldera(): void {
    const P = this.pal, R = this.rng;
    this.lightDir = 1;
    this.celestial = { kind: 'redsun', x: 380, y: -150, r: 76 };
    this.makeStars(30, -380, '#ffd0c0');
    this.makeClouds(0.04, 8, -560, -360, [560, 900], [0.75, 0.95], [6, 12], mix(P.skyHorizon, P.accent, 0.3), darken(P.skyTop, 0.3), { flat: 0.4, flip: true, puffs: 30, aspect: [0.3, 0.4] });
    this.makeClouds(0.09, 6, -380, -230, [420, 700], [0.5, 0.75], [9, 16], mix(P.skyHorizon, '#ff9a60', 0.3), darken(P.skyMid, 0.4), { flat: 0.45, flip: true, puffs: 28, aspect: [0.26, 0.36] });

    const a = mountainRange(R.fork('fa'), { x0: -1500, x1: 1500, base: 170, amp: 240, freq: 0.0024, sharp: 0.75 });
    this.far.push({ p: 0.07, fills: [{ path: a.path, color: mix(P.far, P.skyHorizon, 0.3) }], rim: { path: rimPath(a.top, 1), color: P.accent, width: 1.4, alpha: 0.16, flashBoost: 0.4 }, fog: { top: 0, mid: 170, color: P.fog, a: 0.25, aBelow: 0.4 } });

    // Volcano.
    const vx = 260, vb = 180, vh = 420, vw = 1000, cw = 110;
    const vr = R.fork('volcano');
    const vol = new Path2D();
    vol.moveTo(vx - vw / 2 - 300, vb + 3000);
    vol.lineTo(vx - vw / 2 - 300, vb);
    const steps = 18;
    const lavaPaths: Pt[][] = [];
    for (let i = 0; i <= steps; i++) {
      const t = i / steps;
      const xx = vx - vw / 2 - 300 + (vw / 2 + 300 - cw / 2) * t;
      const yy = vb - vh * Math.pow(t, 1.7) + vr.range(-8, 8) * (1 - t);
      vol.lineTo(xx, yy);
    }
    vol.lineTo(vx - cw / 4, vb - vh + 16);
    vol.lineTo(vx + cw / 4, vb - vh + 12);
    for (let i = steps; i >= 0; i--) {
      const t = i / steps;
      const xx = vx + vw / 2 + 300 - (vw / 2 + 300 - cw / 2) * t;
      const yy = vb - vh * Math.pow(t, 1.7) + vr.range(-8, 8) * (1 - t);
      vol.lineTo(xx, yy);
    }
    vol.lineTo(vx + vw / 2 + 300, vb + 3000);
    vol.closePath();
    for (let k = 0; k < 4; k++) {
      const side = k % 2 === 0 ? -1 : 1;
      const pts: Pt[] = [];
      let px = vx + side * vr.range(5, 40), py = vb - vh + 20;
      for (let i = 0; i < 14; i++) {
        pts.push({ x: px, y: py });
        py += vr.range(20, 34);
        px += side * vr.range(8, 34) * (0.6 + i / 14);
      }
      lavaPaths.push(pts);
    }
    this.volcano = { x: vx, y: vb - vh + 8, p: 0.11 };
    this.far.push({
      p: 0.11,
      fills: [{ path: vol, color: mix(P.far, P.fog, 0.12) }],
      fog: { top: 30, mid: 180, color: P.fog, a: 0.32, aBelow: 0.5 },
      pre: (ctx, env) => this.drawPuffs(ctx, env, true),
      post: (ctx, env) => {
        ctx.globalCompositeOperation = 'lighter';
        drawSprite(ctx, glowSprite(P.accent), vx, vb - vh + 10, 150, 0.55 + 0.1 * Math.sin(env.t * 2));
        drawSprite(ctx, glowSprite('#ffe080'), vx, vb - vh + 14, 50, 0.7);
        for (let k = 0; k < lavaPaths.length; k++) {
          const pts = lavaPaths[k];
          const pulse = 0.55 + 0.45 * Math.sin(env.t * 1.4 + k * 1.3);
          strokeGlowLine(ctx, pts, P.accent, '#ffe9a0', 2.2, 0.55 * pulse);
        }
        ctx.globalCompositeOperation = 'source-over';
        this.drawPuffs(ctx, env, false);
      },
    });

    // Mid back: volcanic spires with lava rivers.
    const back = new Path2D();
    const rb = R.fork('spires');
    const rivers: Pt[][] = [];
    let x = -2000;
    while (x < 2000) {
      const h = rb.range(200, 430);
      const w = rb.range(90, 170);
      const pts = addSpire(back, rb, x, 70, w, h);
      if (rb.next() < 0.45) {
        const half = Math.floor(pts.length / 2);
        const seg = pts.slice(half - 3, half + 1).map((p) => ({ x: p.x + 6, y: p.y }));
        rivers.push(seg.reverse());
      }
      x += rb.range(120, 230);
    }
    this.mid.push({
      p: 0.3,
      fills: [{ path: back, color: this.fogColor(0.28, P.mid) }],
      fog: { top: -100, mid: 70, color: P.fog, a: 0.45, aBelow: 0.75 },
      post: (ctx, env) => {
        ctx.globalCompositeOperation = 'lighter';
        for (let k = 0; k < rivers.length; k++) {
          const pulse = 0.5 + 0.5 * Math.sin(env.t * 1.1 + k * 2.1);
          strokeGlowLine(ctx, rivers[k], P.accent, '#ffd27a', 2.6, 0.5 * pulse);
        }
        ctx.globalCompositeOperation = 'source-over';
      },
    });

    const front = new Path2D();
    const rf = R.fork('front');
    const seams: Pt[][] = [];
    for (const cx of [-1600, -900, -150, 640, 1350, 1900]) {
      const pts = addSpire(front, rf, cx + rf.range(-150, 150), 80, rf.range(140, 230), rf.range(300, 560));
      const mid = Math.floor(pts.length / 2);
      seams.push([pts[mid], { x: (pts[mid].x + pts[mid + 2].x) / 2, y: (pts[mid].y + pts[1].y) / 2 }, { x: pts[1].x + 20, y: 76 }]);
    }
    this.mid.push({
      p: 0.46,
      fills: [{ path: front, color: this.fogColor(0.06, P.mid) }],
      fog: { top: -150, mid: 80, color: P.fog, a: 0.45, aBelow: 0.78 },
      post: (ctx, env) => {
        ctx.globalCompositeOperation = 'lighter';
        for (let k = 0; k < seams.length; k++) {
          const pulse = 0.4 + 0.6 * Math.max(0, Math.sin(env.t * 0.9 + k * 1.9));
          strokeGlowLine(ctx, seams[k], P.accent, '#ffcf70', 1.6, 0.4 * pulse);
        }
        ctx.globalCompositeOperation = 'source-over';
      },
    });
  }

  private drawPuffs(ctx: CanvasRenderingContext2D, env: SceneEnv, behind: boolean): void {
    if (!this.volcano) return;
    const smoke = blobSprite(behind ? darken(this.pal.far, 0.2) : mix(this.pal.far, '#3a2a28', 0.5));
    const lit = glowSprite(this.pal.accent);
    for (let i = behind ? 0 : 1; i < this.puffs.length; i += 2) {
      const p = this.puffs[i];
      const f = p.age / p.life;
      const a = smoothstep(0, 0.12, f) * (1 - smoothstep(0.55, 1, f));
      drawSprite(ctx, smoke, p.x, p.y, p.r, a * 0.75);
      if (f < 0.35) {
        ctx.globalCompositeOperation = 'lighter';
        drawSprite(ctx, lit, p.x, p.y + p.r * 0.3, p.r * 0.8, (0.35 - f) * 0.5);
        ctx.globalCompositeOperation = 'source-over';
      }
    }
    ctx.globalAlpha = 1;
    void env;
  }

  /* ------------------------------------------------------------ frostveil */
  private buildFrostveil(): void {
    const P = this.pal, R = this.rng;
    this.lightDir = 1;
    this.celestial = { kind: 'smallmoon', x: 440, y: -300, r: 30 };
    this.makeStars(240, 80, '#e8fbff');
    this.makeClouds(0.06, 5, -330, -160, [380, 620], [0.18, 0.3], [4, 9], lighten(P.skyHorizon, 0.3), P.skyMid, { flat: 0.85, puffs: 28, aspect: [0.16, 0.24] });
    this.auroraStrip = this.makeAuroraStrip();

    const a = mountainRange(R.fork('fa'), { x0: -1500, x1: 1500, base: 170, amp: 290, freq: 0.002, sharp: 0.8 });
    const b = mountainRange(R.fork('fb'), { x0: -1500, x1: 1500, base: 175, amp: 330, freq: 0.0027, sharp: 0.7 });
    this.far.push({ p: 0.07, fills: [{ path: a.path, color: mix(P.far, P.fog, 0.4) }], rim: { path: rimPath(a.top, 1), color: '#ffffff', width: 1.4, alpha: 0.25, flashBoost: 0.4 }, fog: { top: 0, mid: 170, color: P.fog, a: 0.28, aBelow: 0.45 }, staticPost: this.snowCaps(a, 0.55) });
    this.far.push({ p: 0.13, fills: [{ path: b.path, color: mix(P.far, P.fog, 0.15) }], rim: { path: rimPath(b.top, 1), color: '#ffffff', width: 1.4, alpha: 0.22, flashBoost: 0.4 }, fog: { top: 30, mid: 180, color: P.fog, a: 0.32, aBelow: 0.5 }, staticPost: this.snowCaps(b, 0.45) });

    // Ice citadel.
    const back = new Path2D();
    const rimB = new Path2D();
    const wins: Pt[] = [];
    const rb = R.fork('citadel');
    const keepX = 360;
    const towers: [number, number, number, number][] = [
      [keepX, 120, 430, 150], [keepX - 150, 70, 330, 120], [keepX + 150, 70, 350, 120], [keepX - 260, 48, 250, 90], [keepX + 280, 52, 270, 95],
    ];
    for (let i = 0; i < 9; i++) towers.push([rb.range(-1900, 1900), rb.range(40, 70), rb.range(160, 300), rb.range(60, 110)]);
    back.rect(keepX - 300, 70 - 150, 600, 160);
    back.rect(-1950, 70 - 70, 3900, 80);
    for (const [tx, tw, th, rh] of towers) {
      const w = addTower(back, tx, 70, tw, th, rh);
      for (const p of w) if (rb.next() < 0.55) wins.push(p);
      rimB.rect(tx + tw / 2 - 3, 70 - th, 3, th);
    }
    this.mid.push({
      p: 0.3,
      fills: [{ path: back, color: this.fogColor(0.3, P.mid) }],
      rim: { path: rimB, color: '#d8f6ff', width: 0, alpha: 0.2, flashBoost: 0.3 },
      fog: { top: -110, mid: 70, color: P.fog, a: 0.42, aBelow: 0.65 },
      post: (ctx, env) => {
        ctx.globalCompositeOperation = 'lighter';
        const g = glowSprite(P.accent);
        ctx.fillStyle = rgbaStr(lighten(P.accent, 0.5), 0.75);
        for (let i = 0; i < wins.length; i++) {
          const w = wins[i];
          const fl = 0.7 + 0.3 * Math.sin(env.t * 0.8 + i * 2.3);
          ctx.globalAlpha = fl;
          ctx.fillRect(w.x - 3, w.y - 7, 6, 14);
          drawSprite(ctx, g, w.x, w.y, 16, 0.25 * fl);
        }
        ctx.globalAlpha = 1;
        ctx.globalCompositeOperation = 'source-over';
      },
    });

    const front = new Path2D();
    const rf = R.fork('icefront');
    for (const cx of [-1700, -1150, -520, 520, 1150, 1700]) {
      const px = cx + rf.range(-120, 120);
      // Ice shard formations.
      const n = rf.int(2, 4);
      for (let k = 0; k < n; k++) {
        const h = rf.range(140, 380), w = rf.range(40, 80);
        const lean = rf.range(-0.35, 0.35);
        const bx = px + (k - n / 2) * w * 0.7;
        front.moveTo(bx - w / 2, 90);
        front.lineTo(bx + lean * h - w * 0.12, 80 - h * 0.85);
        front.lineTo(bx + lean * h, 80 - h);
        front.lineTo(bx + lean * h + w * 0.16, 80 - h * 0.82);
        front.lineTo(bx + w / 2, 90);
        front.closePath();
      }
    }
    addTower(front, -880, 80, 70, 300, 0, true);
    addTower(front, 920, 80, 60, 240, 0, true);
    this.mid.push({
      p: 0.46,
      fills: [{ path: front, color: this.fogColor(0.1, P.mid) }],
      fog: { top: -150, mid: 80, color: P.fog, a: 0.4, aBelow: 0.7 },
      post: (ctx, env) => {
        ctx.strokeStyle = rgbaStr('#e0fbff', 0.16 + env.flash * 0.3);
        ctx.lineWidth = 1.5;
        ctx.stroke(front);
      },
    });
  }

  private makeAuroraStrip(): HTMLCanvasElement {
    const P = this.pal;
    const W = 32, H = 256;
    const c = makeCanvas(W, H);
    const g = ctxOf(c);
    const grad = g.createLinearGradient(0, 0, 0, H);
    grad.addColorStop(0, rgbaStr('#b07aff', 0));
    grad.addColorStop(0.25, rgbaStr('#b07aff', 0.22));
    grad.addColorStop(0.62, rgbaStr(P.accent, 0.5));
    grad.addColorStop(0.86, rgbaStr(lighten(P.accent, 0.4), 0.85));
    grad.addColorStop(1, rgbaStr(P.accent, 0));
    g.fillStyle = grad;
    g.fillRect(0, 0, W, H);
    // Soft horizontal falloff so overlapping columns blend into smooth curtains.
    g.globalCompositeOperation = 'destination-in';
    const hg = g.createLinearGradient(0, 0, W, 0);
    hg.addColorStop(0, 'rgba(0,0,0,0)');
    hg.addColorStop(0.5, 'rgba(0,0,0,1)');
    hg.addColorStop(1, 'rgba(0,0,0,0)');
    g.fillStyle = hg;
    g.fillRect(0, 0, W, H);
    return c;
  }

  /* ------------------------------------------------------------ celestial */
  private buildCelestial(): void {
    const P = this.pal, R = this.rng;
    this.lightDir = -1;
    this.celestial = { kind: 'goldsun', x: -380, y: 70, r: 104 };
    this.makeStars(60, -300, '#fff6dd');
    const rr = R.fork('rays');
    for (let i = 0; i < 16; i++) this.godRays.push({ a: rr.range(0, Math.PI * 2), w: rr.range(0.03, 0.08), len: rr.range(600, 1200), alpha: rr.range(0.04, 0.1), sp: rr.range(-0.02, 0.02) });
    this.makeClouds(0.06, 7, -380, -170, [320, 520], [0.55, 0.8], [5, 10], '#fff4e0', mix(P.skyMid, P.skyHorizon, 0.4), { flat: 0.5, puffs: 24 });

    // Distant cloud banks (far) + snowy peaks poking through.
    const peaks = mountainRange(R.fork('peaks'), { x0: -1500, x1: 1500, base: 170, amp: 380, freq: 0.0019, sharp: 0.8 });
    this.far.push({ p: 0.08, fills: [{ path: peaks.path, color: mix(P.far, P.skyHorizon, 0.45) }], rim: { path: rimPath(peaks.top, -1), color: '#fff3d6', width: 1.6, alpha: 0.45, flashBoost: 0.3 }, staticPost: this.snowCaps(peaks, 0.5) });
    const bankR = R.fork('bank');
    const bankSprites = [0, 1, 2].map(() => cloudSprite(bankR, '#fff1dc', mix(P.far, P.skyHorizon, 0.5), { flat: 0.35, puffs: 30 }));
    const bank: { x: number; y: number; w: number; s: HTMLCanvasElement }[] = [];
    for (let i = 0; i < 12; i++) bank.push({ x: -1500 + i * 270 + bankR.range(-60, 60), y: bankR.range(70, 130), w: bankR.range(520, 760), s: bankSprites[i % 3] });
    this.far.push({
      p: 0.12,
      fills: [],
      custom: (ctx, env) => {
        for (const b of bank) {
          const drift = Math.sin(env.t * 0.05 + b.x) * 10;
          ctx.globalAlpha = 0.95;
          ctx.drawImage(b.s, b.x - b.w / 2 + drift, b.y - b.w * 0.3, b.w, b.w * 0.44);
        }
        ctx.globalAlpha = 1;
      },
      fog: { top: 60, mid: 200, color: '#fff0dc', a: 0.25, aBelow: 0.55 },
    });

    // Marble arches & colonnades rising from the cloud sea.
    const back = new Path2D();
    const rb = R.fork('marble');
    const rimB = new Path2D();
    let x = -1900;
    while (x < 1900) {
      if (rb.next() < 0.45) {
        const span = rb.range(120, 200);
        addArch(back, x, x + span, 80, rb.range(280, 380), 26, rb.next() < 0.2 ? 1 : 0);
        rimB.rect(x - 26, 80 - 300, 3, 300);
        x += span + rb.range(110, 220);
      } else {
        const res = addColumn(back, rb, x, 80, rb.range(30, 40), rb.range(260, 400), rb.next() < 0.25 ? rb.range(0.5, 0.9) : null);
        rimB.rect(x - 16, res.topY + 8, 3, 80 - res.topY - 14);
        x += rb.range(110, 190);
      }
    }
    const sea1 = this.cloudRow(R.fork('sea1'), 14, 60, [380, 560], '#fff6e6', mix(P.mid, P.fog, 0.4));
    this.mid.push({
      p: 0.3,
      fills: [{ path: back, color: this.fogColor(0.42, P.mid) }],
      rim: { path: rimB, color: '#fff2cf', width: 0, alpha: 0.35, flashBoost: 0.2 },
      fog: { top: -120, mid: 60, color: P.fog, a: 0.25, aBelow: 0.4 },
      post: (ctx, env) => this.drawCloudRow(ctx, env, sea1, 0.9),
    });

    const front = new Path2D();
    const rf = R.fork('statues');
    const eyes: Pt[] = [];
    for (const cx of [-1550, -820, 820, 1550]) eyes.push(addGuardian(front, cx + rf.range(-100, 100), 90, rf.range(330, 420), cx < 0 ? 1 : -1));
    for (const cx of [-1200, -300, 380, 1200]) {
      const px = cx + rf.range(-120, 120);
      // Tall needle obelisks.
      front.moveTo(px - 24, 96);
      front.lineTo(px - 18, 90 - 420);
      front.lineTo(px, 90 - 470);
      front.lineTo(px + 18, 90 - 420);
      front.lineTo(px + 24, 96);
      front.closePath();
    }
    const sea2 = this.cloudRow(R.fork('sea2'), 12, 96, [460, 700], '#fffaf0', mix(P.mid, P.fog, 0.55));
    this.mid.push({
      p: 0.46,
      fills: [{ path: front, color: this.fogColor(0.18, P.mid) }],
      fog: { top: -160, mid: 90, color: P.fog, a: 0.28, aBelow: 0.5 },
      post: (ctx, env) => {
        ctx.globalCompositeOperation = 'lighter';
        for (const e of eyes) drawSprite(ctx, glowSprite(P.accent), e.x, e.y, 10, 0.5);
        ctx.globalCompositeOperation = 'source-over';
        this.drawCloudRow(ctx, env, sea2, 0.95);
      },
    });
  }

  private cloudRow(r: Rng, n: number, y: number, w: [number, number], lit: string, shade: string): { x: number; y: number; w: number; s: HTMLCanvasElement; ph: number }[] {
    const sprites = [0, 1, 2].map(() => cloudSprite(r, lit, shade, { flat: 0.3, puffs: 26 }));
    const out: { x: number; y: number; w: number; s: HTMLCanvasElement; ph: number }[] = [];
    for (let i = 0; i < n; i++) out.push({ x: -2100 + (4200 * (i + r.next() * 0.6)) / n, y: y + r.range(-12, 12), w: r.range(w[0], w[1]), s: sprites[i % 3], ph: r.range(0, 6.28) });
    return out;
  }

  private drawCloudRow(ctx: CanvasRenderingContext2D, env: SceneEnv, row: { x: number; y: number; w: number; s: HTMLCanvasElement; ph: number }[], alpha: number): void {
    ctx.globalAlpha = alpha;
    for (const c of row) {
      const dx = Math.sin(env.t * 0.08 + c.ph) * 18;
      const h = c.w * 0.42;
      ctx.drawImage(c.s, c.x - c.w / 2 + dx, c.y - h * 0.62, c.w, h);
    }
    ctx.globalAlpha = 1;
  }

  /* -------------------------------------------------------------- moonlit */
  private buildMoonlit(): void {
    const P = this.pal, R = this.rng;
    this.lightDir = 1;
    this.celestial = { kind: 'moon', x: 250, y: -150, r: 205 };
    this.makeStars(230, 60, '#f4f1de');
    const md = R.fork('moon');
    for (let i = 0; i < 11; i++) this.moonDetail.push({ x: md.range(-0.6, 0.6), y: md.range(-0.6, 0.6), r: md.range(0.08, 0.3), a: md.range(0.05, 0.14) });
    this.makeClouds(0.05, 6, -300, -60, [420, 700], [0.22, 0.38], [6, 12], lighten(P.skyHorizon, 0.4), P.skyMid, { flat: 0.9, puffs: 28, aspect: [0.14, 0.22] });

    const ranges = [
      { p: 0.05, base: 150, amp: 200, freq: 0.0019, fog: 0.62 },
      { p: 0.09, base: 160, amp: 240, freq: 0.0024, fog: 0.42 },
      { p: 0.14, base: 170, amp: 260, freq: 0.0031, fog: 0.22 },
    ];
    let pagodaWin: Pt = { x: 0, y: 0 };
    for (let i = 0; i < ranges.length; i++) {
      const rg = ranges[i];
      const m = mountainRange(R.fork('ink' + i), { x0: -1500, x1: 1500, base: rg.base, amp: rg.amp, freq: rg.freq, sharp: 0.1 });
      const fills = [{ path: m.path, color: mix(P.far, P.fog, rg.fog) }];
      if (i === 2) {
        // Pagoda on the nearest far ridge.
        const px = -520;
        let topY = rg.base;
        for (const pt of m.top) if (Math.abs(pt.x - px) < 10) topY = pt.y;
        const pg = new Path2D();
        pagodaWin = addPagoda(pg, px, topY + 6, 0.55);
        fills.push({ path: pg, color: mix(P.far, P.fog, rg.fog * 0.5) });
      }
      this.far.push({
        p: rg.p,
        fills,
        rim: { path: rimPath(m.top, 1), color: P.celestial, width: 1.3, alpha: 0.18, flashBoost: 0.3 },
        fog: { top: rg.base - rg.amp * 0.5, mid: rg.base, color: P.fog, a: 0.3, aBelow: 0.45 },
        post: i === 2 ? (ctx, env) => {
          ctx.globalCompositeOperation = 'lighter';
          const fl = 0.75 + 0.25 * Math.sin(env.t * 5) * Math.sin(env.t * 2.3);
          drawSprite(ctx, glowSprite('#ffb070'), pagodaWin.x, pagodaWin.y, 14, 0.7 * fl);
          ctx.globalCompositeOperation = 'source-over';
        } : undefined,
      });
    }

    this.mid.push(this.bambooLayer(R.fork('bam1'), 0.3, 46, [260, 520], [6, 10], this.fogColor(0.45, P.mid), 70));
    this.mid.push(this.bambooLayer(R.fork('bam2'), 0.46, 22, [380, 720], [10, 16], this.fogColor(0.1, P.mid), 80));
    this.mid[0].fog = { top: -200, mid: 70, color: P.fog, a: 0.4, aBelow: 0.62 };
    this.mid[1].fog = { top: -200, mid: 80, color: P.fog, a: 0.38, aBelow: 0.7 };
  }

  private bambooLayer(r: Rng, p: number, n: number, h: [number, number], w: [number, number], color: string, base: number): SubLayer {
    const stalks = new Path2D();
    const leaves = new Path2D();
    for (let i = 0; i < n; i++) {
      // Clumps with gaps (a path through the grove).
      const x = -2000 + (4000 * (i + r.next() * 0.9)) / n;
      if (Math.abs(x) < 160 && r.next() < 0.7) continue;
      const hh = r.range(h[0], h[1]);
      const lean = r.range(-0.08, 0.08);
      const res = addBamboo(stalks, r, x, base, hh, r.range(w[0], w[1]), lean);
      for (let k = 0; k < res.nodes.length; k++) {
        if (k < 3 || r.next() < 0.5) continue;
        const nd = res.nodes[k];
        const cnt = r.int(2, 4);
        for (let j = 0; j < cnt; j++) {
          const side = r.sign();
          addLeaf(leaves, nd.x, nd.y, (side < 0 ? Math.PI : 0) + side * r.range(0.25, 0.7), r.range(26, 54) * (w[1] / 12), r.range(3, 6));
        }
      }
      for (let j = 0; j < 5; j++) addLeaf(leaves, res.tip.x, res.tip.y + 8, -Math.PI / 2 + r.range(-1.3, 1.3), r.range(30, 58) * (w[1] / 12), r.range(3, 6));
    }
    return {
      p,
      fills: [{ path: stalks, color }, { path: leaves, color }],
      sway: { base, amount: 0.012, speed: 0.55 + p },
      rim: { path: stalks, color: this.pal.celestial, width: -1, alpha: 0.08, flashBoost: 0.2 },
    };
  }

  /** Snow / light caps on the tallest peaks of a range. */
  private snowCaps(range: { path: Path2D; minY: number }, strength: number): DrawFn {
    const key = 'snow' + range.minY.toFixed(1) + strength;
    return (ctx) => {
      const g = this.grads.get(ctx, key, (c) => {
        const gr = c.createLinearGradient(0, range.minY, 0, range.minY + 150);
        gr.addColorStop(0, rgbaStr('#ffffff', 0.55 * strength));
        gr.addColorStop(0.5, rgbaStr('#e6f4ff', 0.25 * strength));
        gr.addColorStop(1, 'rgba(255,255,255,0)');
        return gr;
      });
      ctx.fillStyle = g;
      ctx.fill(range.path);
    };
  }

  /* =============================================================== update */

  update(dt: number, env: SceneEnv): void {
    if (env.timeStop) return;
    for (const L of this.clouds) L.offset = (L.offset + L.speed * dt) % (L.wrap * 2);
    if (this.volcano) {
      this.puffTimer -= dt;
      while (this.puffTimer <= 0) {
        this.puffTimer += 0.22;
        this.puffs.push({ x: this.volcano.x + (Math.random() - 0.5) * 30, y: this.volcano.y, r: 30 + Math.random() * 20, age: 0, life: 9 + Math.random() * 4, vx: 6 + Math.random() * 8, vy: -(24 + Math.random() * 14) });
      }
      for (const p of this.puffs) {
        p.age += dt;
        p.x += p.vx * dt;
        p.y += p.vy * dt;
        p.vy *= Math.exp(-0.05 * dt);
        p.r += 9 * dt;
      }
      this.puffs = this.puffs.filter((p) => p.age < p.life);
    }
    if (this.theme.id === 'stormpeak' && env.storm > 0.6 && (!this.stormBolt || Math.random() < 0.15)) {
      this.stormBoltX = (Math.random() * 2 - 1) * 700;
      this.stormBolt = makeBolt(Math.random, this.stormBoltX, -330, this.stormBoltX + (Math.random() - 0.5) * 260, 140, 6, 0.24, 0.5);
    } else if (env.storm < 0.05) {
      this.stormBolt = null;
    }
  }

  /* ================================================================= draw */

  drawSky(ctx: CanvasRenderingContext2D, cam: CameraView, env: SceneEnv): void {
    // Static sky (gradient, horizon glow, nebula, celestial body) is a cached bitmap.
    this.skyCache.draw(ctx, cam, (g, r) => this.renderSkyStatic(g, r));
    this.drawStars(ctx, cam, env);
    if (this.auroraStrip) this.drawAurora(ctx, cam, env);
    if (this.godRays.length) {
      cam.applyTransform(ctx, SKY_P);
      this.drawGodRays(ctx, env);
    }
    for (const L of this.clouds) this.drawCloudLayer(ctx, cam, L, env);
    if (this.stormBolt && env.storm > 0.05) {
      cam.applyTransform(ctx, 0.07);
      ctx.globalCompositeOperation = 'lighter';
      strokeGlowLine(ctx, this.stormBolt.main, '#9fc4ff', '#ffffff', 2.2, env.storm);
      for (const b of this.stormBolt.branches) strokeGlowLine(ctx, b, '#9fc4ff', '#ffffff', 1.2, env.storm * 0.7);
      ctx.globalCompositeOperation = 'source-over';
    }
    ctx.globalAlpha = 1;
  }

  private renderSkyStatic(ctx: CanvasRenderingContext2D, r: LayerRect): void {
    const P = this.pal;
    ctx.globalCompositeOperation = 'source-over';
    ctx.globalAlpha = 1;
    ctx.fillStyle = this.grads.get(ctx, 'sky', (c) => {
      const g = c.createLinearGradient(0, -470, 0, 210);
      g.addColorStop(0, P.skyTop);
      g.addColorStop(0.42, mix(P.skyTop, P.skyMid, 0.8));
      g.addColorStop(0.72, mix(P.skyMid, P.skyHorizon, 0.45));
      g.addColorStop(1, P.skyHorizon);
      return g;
    });
    ctx.fillRect(r.left, r.top, r.right - r.left, r.bottom - r.top);
    // Horizon bloom band.
    ctx.globalCompositeOperation = 'lighter';
    ctx.fillStyle = this.grads.get(ctx, 'hz', (c) => {
      const g = c.createLinearGradient(0, 40, 0, 260);
      g.addColorStop(0, rgbaStr(P.skyHorizon, 0));
      g.addColorStop(0.6, rgbaStr(lighten(P.skyHorizon, 0.2), 0.22));
      g.addColorStop(1, rgbaStr(P.skyHorizon, 0.05));
      return g;
    });
    ctx.fillRect(r.left, 40, r.right - r.left, 220);
    ctx.globalCompositeOperation = 'source-over';
    if (this.nebula) {
      ctx.globalAlpha = 0.95;
      ctx.drawImage(this.nebula, -1050, -560, 2100, 1340);
      ctx.globalAlpha = 1;
    }
    this.drawCelestial(ctx, { t: 0, flash: 0, flashColor: '#ffffff', storm: 0, collapse: 0, timeStop: false });
  }

  private drawGodRays(ctx: CanvasRenderingContext2D, env: SceneEnv): void {
    const c = this.celestial;
    // Rays fade with distance from the sun (radial gradient), drawn in two alpha groups.
    const grad = this.grads.get(ctx, 'rays', (g) => {
      const gr = g.createRadialGradient(c.x, c.y, c.r * 0.6, c.x, c.y, 1150);
      gr.addColorStop(0, rgbaStr(this.pal.celestial, 0.9));
      gr.addColorStop(0.35, rgbaStr(this.pal.celestial, 0.35));
      gr.addColorStop(1, rgbaStr(this.pal.celestial, 0));
      return gr;
    });
    ctx.globalCompositeOperation = 'lighter';
    ctx.fillStyle = grad;
    for (let group = 0; group < 2; group++) {
      ctx.globalAlpha = group === 0 ? 0.1 : 0.055;
      ctx.beginPath();
      for (let i = group; i < this.godRays.length; i += 2) {
        const ray = this.godRays[i];
        const a = ray.a + env.t * ray.sp;
        ctx.moveTo(c.x, c.y);
        ctx.lineTo(c.x + Math.cos(a - ray.w) * ray.len, c.y + Math.sin(a - ray.w) * ray.len);
        ctx.lineTo(c.x + Math.cos(a + ray.w) * ray.len, c.y + Math.sin(a + ray.w) * ray.len);
        ctx.closePath();
      }
      ctx.fill();
    }
    ctx.globalAlpha = 1;
    ctx.globalCompositeOperation = 'source-over';
  }

  private drawStars(ctx: CanvasRenderingContext2D, cam: CameraView, env: SceneEnv): void {
    if (this.stars.length === 0) return;
    cam.applyTransform(ctx, 0.02);
    ctx.globalCompositeOperation = 'lighter';
    const buckets = [0.18, 0.36, 0.6, 0.9];
    const paths = buckets.map(() => new Path2D());
    const t = env.t;
    const cel = this.celestial;
    const cr2 = cel.kind === 'hidden' ? -1 : (cel.r * 1.08) * (cel.r * 1.08);
    for (const s of this.stars) {
      if (cr2 > 0 && (s.x - cel.x) * (s.x - cel.x) + (s.y - cel.y) * (s.y - cel.y) < cr2) continue;
      const fade = smoothstep(130, -160, s.y);
      const tw = s.b * fade * (0.7 + 0.3 * Math.sin(t * s.sp + s.ph));
      if (tw < 0.08) continue;
      let bi = 0;
      while (bi < buckets.length - 1 && tw > (buckets[bi] + buckets[bi + 1]) / 2) bi++;
      paths[bi].rect(s.x - s.s / 2, s.y - s.s / 2, s.s, s.s);
    }
    for (let i = 0; i < buckets.length; i++) {
      ctx.fillStyle = rgbaStr('#ffffff', buckets[i]);
      ctx.fill(paths[i]);
    }
    // A few bright stars get a soft glow.
    const g = glowSprite('#dfe8ff');
    for (let i = 0; i < this.stars.length; i += 9) {
      const s = this.stars[i];
      if (s.s > 1.4) drawSprite(ctx, g, s.x, s.y, 7, 0.35 * smoothstep(130, -160, s.y) * (0.6 + 0.4 * Math.sin(t * s.sp + s.ph)));
    }
    ctx.globalAlpha = 1;
    ctx.globalCompositeOperation = 'source-over';
  }

  private drawCelestial(ctx: CanvasRenderingContext2D, env: SceneEnv): void {
    const c = this.celestial;
    const P = this.pal;
    if (c.kind === 'hidden') {
      ctx.globalCompositeOperation = 'lighter';
      drawSprite(ctx, glowSprite(P.celestial), c.x, c.y, 260, 0.12);
      ctx.globalCompositeOperation = 'source-over';
      return;
    }
    const glow = glowSprite(P.celestial);
    ctx.globalCompositeOperation = 'lighter';
    switch (c.kind) {
      case 'sun':
      case 'goldsun':
      case 'redsun': {
        drawSprite(ctx, glow, c.x, c.y, c.r * 6, c.kind === 'redsun' ? 0.38 : 0.5);
        drawSprite(ctx, glow, c.x, c.y, c.r * 3.4, 0.55);
        ctx.globalCompositeOperation = 'source-over';
        const g = this.grads.get(ctx, 'disk', (cx) => {
          const gr = cx.createRadialGradient(c.x - c.r * 0.2, c.y - c.r * 0.25, c.r * 0.1, c.x, c.y, c.r);
          gr.addColorStop(0, '#fffdf4');
          gr.addColorStop(0.55, lighten(P.celestial, 0.35));
          gr.addColorStop(1, P.celestial);
          return gr;
        });
        ctx.fillStyle = g;
        ctx.globalAlpha = c.kind === 'redsun' ? 0.85 : 1;
        ctx.beginPath();
        ctx.arc(c.x, c.y, c.r, 0, Math.PI * 2);
        ctx.fill();
        ctx.globalAlpha = 1;
        if (c.kind === 'sun') {
          // Thin cloud bands across the setting sun.
          ctx.fillStyle = rgbaStr(darken(P.skyMid, 0.1), 0.45);
          for (let i = 0; i < 4; i++) {
            const yy = c.y - c.r * 0.5 + i * c.r * 0.36;
            ctx.beginPath();
            ctx.ellipse(c.x + Math.sin(env.t * 0.05 + i) * 30, yy, c.r * (1.3 - i * 0.1), 3.5 + i * 1.2, 0, 0, Math.PI * 2);
            ctx.fill();
          }
        }
        break;
      }
      case 'moon':
      case 'smallmoon': {
        drawSprite(ctx, glow, c.x, c.y, c.r * (c.kind === 'moon' ? 3.6 : 7), c.kind === 'moon' ? 0.36 : 0.32);
        if (c.kind === 'smallmoon') {
          // 22° halo.
          ctx.strokeStyle = rgbaStr(P.celestial, 0.12);
          ctx.lineWidth = 3;
          ctx.beginPath();
          ctx.arc(c.x, c.y, c.r * 5, 0, Math.PI * 2);
          ctx.stroke();
        }
        ctx.globalCompositeOperation = 'source-over';
        const g = this.grads.get(ctx, 'moon', (cx) => {
          const gr = cx.createRadialGradient(c.x - c.r * 0.3, c.y - c.r * 0.3, c.r * 0.05, c.x, c.y, c.r);
          gr.addColorStop(0, '#ffffff');
          gr.addColorStop(0.7, P.celestial);
          gr.addColorStop(1, darken(P.celestial, 0.12));
          return gr;
        });
        ctx.fillStyle = g;
        ctx.beginPath();
        ctx.arc(c.x, c.y, c.r, 0, Math.PI * 2);
        ctx.fill();
        if (c.kind === 'moon') {
          ctx.save();
          ctx.beginPath();
          ctx.arc(c.x, c.y, c.r, 0, Math.PI * 2);
          ctx.clip();
          for (const m of this.moonDetail) {
            ctx.fillStyle = rgbaStr('#5a6a80', m.a);
            ctx.beginPath();
            ctx.ellipse(c.x + m.x * c.r, c.y + m.y * c.r, m.r * c.r, m.r * c.r * 0.8, m.x, 0, Math.PI * 2);
            ctx.fill();
          }
          ctx.restore();
        }
        break;
      }
      case 'voidsun': {
        drawSprite(ctx, glow, c.x, c.y, c.r * 6.5, 0.45);
        drawSprite(ctx, glowSprite(P.accent), c.x, c.y, c.r * 3.2, 0.5);
        const tilt = -0.22;
        const ring = (front: boolean) => {
          ctx.lineCap = 'round';
          const a0 = front ? 0 : Math.PI, a1 = front ? Math.PI : Math.PI * 2;
          ctx.strokeStyle = rgbaStr(P.accent, 0.5);
          ctx.lineWidth = 16;
          ctx.beginPath();
          ctx.ellipse(c.x, c.y, c.r * 3.1, c.r * 0.62, tilt, a0, a1);
          ctx.stroke();
          ctx.strokeStyle = rgbaStr(lighten(P.celestial, 0.5), 0.85);
          ctx.lineWidth = 4;
          ctx.beginPath();
          ctx.ellipse(c.x, c.y, c.r * 2.8, c.r * 0.52, tilt, a0, a1);
          ctx.stroke();
        };
        ring(false);
        ctx.globalCompositeOperation = 'source-over';
        ctx.fillStyle = '#020005';
        ctx.beginPath();
        ctx.arc(c.x, c.y, c.r, 0, Math.PI * 2);
        ctx.fill();
        ctx.globalCompositeOperation = 'lighter';
        ctx.strokeStyle = rgbaStr('#ffffff', 0.85);
        ctx.lineWidth = 2;
        ctx.beginPath();
        ctx.arc(c.x, c.y, c.r + 1.5, 0, Math.PI * 2);
        ctx.stroke();
        ring(true);
        break;
      }
    }
    ctx.globalCompositeOperation = 'source-over';
    ctx.globalAlpha = 1;
  }

  private drawAurora(ctx: CanvasRenderingContext2D, cam: CameraView, env: SceneEnv): void {
    const strip = this.auroraStrip!;
    cam.applyTransform(ctx, 0.025);
    ctx.globalCompositeOperation = 'lighter';
    const t = env.t;
    const ribbons = [
      { y: -250, h: 170, a: 0.5, f: 0.004, sp: 0.18, ph: 0 },
      { y: -330, h: 140, a: 0.38, f: 0.0055, sp: -0.12, ph: 2 },
      { y: -190, h: 110, a: 0.28, f: 0.007, sp: 0.25, ph: 4 },
    ];
    const step = 18;
    for (const rb of ribbons) {
      for (let x = -1000; x < 1000; x += step) {
        const y = rb.y + Math.sin(x * rb.f + t * rb.sp + rb.ph) * 60 + Math.sin(x * rb.f * 2.7 + t * rb.sp * 1.8) * 22;
        const curtain = 0.6 + 0.25 * Math.sin(x * 0.011 + t * 0.9 + rb.ph) + 0.15 * Math.sin(x * 0.031 - t * 1.7 + rb.ph * 2);
        const edgeFade = smoothstep(-1000, -650, x) * smoothstep(1000, 650, x);
        const a = rb.a * Math.max(0, curtain) * edgeFade;
        if (a < 0.02) continue;
        ctx.globalAlpha = a * 0.62;
        ctx.drawImage(strip, x - step * 1.2, y - rb.h, step * 3.4, rb.h);
      }
    }
    ctx.globalAlpha = 1;
    ctx.globalCompositeOperation = 'source-over';
  }

  private drawCloudLayer(ctx: CanvasRenderingContext2D, cam: CameraView, L: CloudLayer, env: SceneEnv): void {
    if (!L.bake) return;
    cam.applyTransform(ctx, L.p);
    const P = L.wrap * 2;
    const passes = L.stormLit && env.storm > 0.02 ? 2 : 1;
    for (let pass = 0; pass < passes; pass++) {
      ctx.globalCompositeOperation = pass === 0 ? 'source-over' : 'lighter';
      ctx.globalAlpha = pass === 0 ? 1 : env.storm * 0.55;
      const x0 = -L.wrap + L.offset;
      ctx.drawImage(L.bake, x0, L.bakeY, P, L.bakeH);
      ctx.drawImage(L.bake, x0 - P, L.bakeY, P, L.bakeH);
    }
    ctx.globalCompositeOperation = 'source-over';
    ctx.globalAlpha = 1;
  }

  drawFar(ctx: CanvasRenderingContext2D, cam: CameraView, env: SceneEnv): void {
    for (const L of this.far) this.drawSub(ctx, cam, L, env);
  }

  drawMid(ctx: CanvasRenderingContext2D, cam: CameraView, env: SceneEnv): void {
    for (const L of this.mid) this.drawSub(ctx, cam, L, env);
  }

  private drawSub(ctx: CanvasRenderingContext2D, cam: CameraView, L: SubLayer, env: SceneEnv): void {
    cam.applyTransform(ctx, L.p);
    const rect = cam.visibleWorldRect(L.p);
    ctx.globalAlpha = 1;
    ctx.globalCompositeOperation = 'source-over';
    if (L.pre) L.pre(ctx, env, rect);
    if (L.sway) {
      const k = Math.sin(env.t * L.sway.speed) * L.sway.amount + Math.sin(env.t * L.sway.speed * 2.3) * L.sway.amount * 0.35;
      ctx.transform(1, 0, k, 1, -k * L.sway.base, 0);
    }
    if (L.custom) L.custom(ctx, env, rect);
    this.drawFills(ctx, L);
    this.drawRim(ctx, L, env);
    if (L.staticPost) L.staticPost(ctx, env, rect);
    if (L.post) L.post(ctx, env, rect);
    if (L.sway) cam.applyTransform(ctx, L.p);
    ctx.globalAlpha = 1;
    ctx.globalCompositeOperation = 'source-over';
    this.drawFog(ctx, L, rect);
  }

  private drawFills(ctx: CanvasRenderingContext2D, L: SubLayer): void {
    for (const f of L.fills) {
      ctx.fillStyle = f.color;
      ctx.globalAlpha = f.alpha ?? 1;
      ctx.fill(f.path);
    }
    ctx.globalAlpha = 1;
  }

  /** Rim light (brightens with lighting flashes / storm lightning). */
  private drawRim(ctx: CanvasRenderingContext2D, L: SubLayer, env: SceneEnv): void {
    if (!L.rim) return;
    const boost = env.flash * L.rim.flashBoost + (this.theme.id === 'stormpeak' ? env.storm * L.rim.flashBoost : 0);
    const a = L.rim.alpha + boost;
    if (a <= 0.01) return;
    const col = env.flash > 0.3 ? mix(L.rim.color, env.flashColor, 0.5) : L.rim.color;
    this.strokeRim(ctx, L, col, a);
  }

  private strokeRim(ctx: CanvasRenderingContext2D, L: SubLayer, col: string, a: number): void {
    const rim = L.rim!;
    ctx.globalCompositeOperation = 'lighter';
    if (rim.width > 0) {
      ctx.strokeStyle = rgbaStr(col, Math.min(1, a));
      ctx.lineWidth = rim.width;
      ctx.lineJoin = 'round';
      ctx.stroke(rim.path);
    } else if (rim.width === 0) {
      ctx.fillStyle = rgbaStr(col, Math.min(1, a));
      ctx.fill(rim.path);
    } else {
      ctx.strokeStyle = rgbaStr(col, Math.min(1, a));
      ctx.lineWidth = 1.2;
      ctx.stroke(rim.path);
    }
    ctx.globalCompositeOperation = 'source-over';
  }

  private drawFog(ctx: CanvasRenderingContext2D, L: SubLayer, rect: LayerRect): void {
    if (!L.fog) return;
    const F = L.fog;
    const key = `fog${L.p}|${F.top}|${F.mid}`;
    ctx.fillStyle = this.grads.get(ctx, key, (c) => {
      const g = c.createLinearGradient(0, F.top, 0, F.mid + 320);
      const span = F.mid + 320 - F.top;
      g.addColorStop(0, rgbaStr(F.color, 0));
      g.addColorStop(clamp01((F.mid - F.top) / span), rgbaStr(F.color, F.a));
      g.addColorStop(1, rgbaStr(F.color, F.aBelow));
      return g;
    });
    ctx.fillRect(rect.left, F.top, rect.right - rect.left, Math.max(0, rect.bottom - F.top) + 10);
  }

  /** Approximate world-space screen fraction of the sky's celestial body (for flare effects). */
  celestialInfo(): { x: number; y: number; r: number; visible: boolean } {
    const c = this.celestial;
    return { x: c.x, y: c.y, r: c.r, visible: c.kind !== 'hidden' };
  }
}

