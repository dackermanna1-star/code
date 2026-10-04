/**
 * TSUNAMI: a breaking wave 22..34 blocks tall rolls in from the direction the player faces.
 *
 *  1. Survey (first ticks): the columns of the wave's path (oriented rectangle, ~130 blocks
 *     wide, from 135 blocks out to 110 inland) are measured: ground, sea or land, and the
 *     coastline of every lateral row. The sea level is detected from the water on the path.
 *  2. Approach (~13 s): the wall rises far out and advances at ~10 blocks/s (animated mesh with
 *     a curling crest, foam, spray and mist). Meanwhile the sea recedes near the coast (the
 *     shallow water is drawn down several blocks, exposing the sea floor). Deep roar.
 *  3. Run-up: as the front passes columns they are flooded with static water up to an
 *     inundation level that decays inland; weak blocks (plants, leaves, wood, glass, wool) are
 *     smashed and some become floating debris, beaches erode, entities, debris bodies and the
 *     player are swept along. The crest decays over land until the wave collapses into foam.
 *  4. Drain (~25 s): the water level falls back to the sea, pushing things seaward, leaving
 *     puddles in basins, sand deposits, mud and washed-up logs.
 *
 * Block edits are budgeted per tick (time) through BulkEdit; flood water is placed as source
 * blocks without neighbour updates so no fluid ticks are scheduled.
 */
import * as THREE from 'three';
import type { Game } from '../game';
import { registerDisaster, BulkEdit, S, hash3, noise2, type Disaster, type DisasterContext, type DisasterFx } from './kit';
import { planWave, toLocal, wobble, taper, frontStart, advanceFront, floodLevel, profileAt, curlFor, BasinSolver, packOrder, S_LIP, S_CREST, type WavePlan, type FrontState } from './flood/wave';
import { WaveMesh } from './flood/waveMesh';
import { ForwardLayer, hasGpu } from './fire/gl';
import { blockClass, groundTop, liquidTop, isLiquid, WEAK, STRONG, ERODIBLE, LIQUID, AIR } from './fire/terrain';
import { BLOCKS, T_FULL_CUBE } from '../../world/blocks/registry';
import { SEA_LEVEL } from '../../core/constants';
import { PT } from '../../render/particles/defs';

const BUDGET_MS = 4;
export const RECEDE_S = 7;
const RECEDE_DROP = 5;
const HOLD_S = 3;
export const DRAIN_S = 25;

const rnd = Math.random;
const now = () => (typeof performance !== 'undefined' ? performance.now() : Date.now());

interface LoopLike {
  stop(f?: number): void;
  setVolume(v: number): void;
  setPos(p: { x: number; y: number; z: number }): void;
}

export class Tsunami implements Disaster {
  readonly name = 'tsunami';
  readonly plan: WavePlan;
  phase: 'survey' | 'approach' | 'hold' | 'drain' | 'done' = 'survey';
  readonly front: FrontState;
  ticks = 0;
  private pt = 0;
  private readonly game: Game;
  private readonly fx: DisasterFx;
  private readonly bulk: BulkEdit;
  // ---- survey (columns of the path, sorted by front arrival)
  private surveyList: number[] = [];
  private surveyCursor = 0;
  n = 0;
  private cx!: Int32Array;
  private cz!: Int32Array;
  private cs!: Float32Array;
  private cu!: Float32Array;
  private ck!: Float32Array;
  ground!: Int16Array;
  private sea!: Uint8Array;
  private coast!: Float32Array;
  /** Flood level per column (-1 = not flooded yet). */
  level!: Int16Array;
  private hpass!: Float32Array;
  private order!: Uint32Array;
  private grid!: Int32Array;
  private gx0 = 0;
  private gz0 = 0;
  private gw = 0;
  private gh = 0;
  coastS = -30;
  // ---- recession
  private recede: number[] = [];
  private recLevel!: Int16Array;
  private recCursor = 0;
  receded = 0;
  // ---- flood
  private passPtr = 0;
  private fillQueue: number[] = [];
  private fillHead = 0;
  /** Placed flood cells bucketed by y: column indices. */
  private buckets = new Map<number, number[]>();
  private drainPtr = new Map<number, number>();
  private maxY = 0;
  private drainTop = 0;
  private puddles: Uint8Array | null = null;
  private surveyStage = 0;
  private wood = 0;
  private debrisBudget = 0;
  private hit = new WeakSet<object>();
  private crashed = false;
  // ---- visuals / audio
  private layer: ForwardLayer | null = null;
  private wave: WaveMesh | null = null;
  private time = 0;
  private sinceTick = 0;
  private collapse = 1;
  private sprayAcc = 0;
  private roar: LoopLike | null = null;
  private wind: LoopLike | null = null;
  private rush: LoopLike | null = null;
  private loops: LoopLike[] = [];
  private rumble = 1;

  readonly stats = { placed: 0, destroyed: 0, drained: 0, puddles: 0, deposits: 0, worstMs: 0, pushed: 0 };

  constructor(ctx: DisasterContext) {
    this.game = ctx.game;
    this.fx = ctx.effects;
    this.bulk = new BulkEdit(ctx.game);
    const w = ctx.game.world;
    const seed = (Math.imul(ctx.x, 19349663) ^ Math.imul(ctx.z, 83492791) ^ (w.seed | 0)) & 0xffff;
    const probe = planWave(ctx.x, ctx.z, ctx.fx, ctx.fz, SEA_LEVEL - 1, seed);
    this.plan = planWave(ctx.x, ctx.z, ctx.fx, ctx.fz, this.detectSea(probe, ctx.y), seed);
    this.front = frontStart(this.plan);
    // columns of the path (survey happens in the first ticks)
    const p = this.plan;
    const pts: [number, number][] = [[p.sStart - 4, -p.halfW - 2], [p.sStart - 4, p.halfW + 2], [p.sMax + 2, -p.halfW - 2], [p.sMax + 2, p.halfW + 2]];
    let x0 = Infinity, x1 = -Infinity, z0 = Infinity, z1 = -Infinity;
    for (const [s, u] of pts) {
      const x = p.px + p.dx * s + p.nx * u, z = p.pz + p.dz * s + p.nz * u;
      x0 = Math.min(x0, x); x1 = Math.max(x1, x); z0 = Math.min(z0, z); z1 = Math.max(z1, z);
    }
    this.gx0 = Math.floor(x0); this.gz0 = Math.floor(z0);
    this.gw = Math.ceil(x1) - this.gx0 + 1; this.gh = Math.ceil(z1) - this.gz0 + 1;
    for (let z = this.gz0; z < this.gz0 + this.gh; z++)
      for (let x = this.gx0; x < this.gx0 + this.gw; x++) {
        const [s, u] = toLocal(p, x + 0.5, z + 0.5);
        if (s < p.sStart - 4 || s > p.sMax + 2 || Math.abs(u) > p.halfW + 2) continue;
        this.surveyList.push(x, z);
      }
    this.n = this.surveyList.length / 2;
    const n = this.n;
    this.cx = new Int32Array(n); this.cz = new Int32Array(n);
    this.cs = new Float32Array(n); this.cu = new Float32Array(n); this.ck = new Float32Array(n);
    this.ground = new Int16Array(n).fill(-1);
    this.sea = new Uint8Array(n);
    this.coast = new Float32Array(n);
    this.level = new Int16Array(n).fill(-1);
    this.hpass = new Float32Array(n);
    this.recLevel = new Int16Array(n);
    this.grid = new Int32Array(this.gw * this.gh).fill(-1);
    if (hasGpu(ctx.game)) {
      try {
        this.layer = new ForwardLayer(ctx.game);
        this.wave = new WaveMesh(ctx.game, this.layer, this.plan);
        this.wave.update(p.sStart, 0, 0, 0, 0);
      } catch (e) {
        console.warn('tsunami: visuals unavailable', e);
      }
    }
    const [fx0, fz0] = [p.px + p.dx * p.sStart, p.pz + p.dz * p.sStart];
    this.sound('weather.thunder.far', fx0, p.seaY, fz0, 8, 0.3);
    ctx.game.message?.('The sea is pulling back from the shore...', '#80c8ff');
  }

  /** Sea surface on the path (mode of the water tops seaward), or the ground at the placement. */
  private detectSea(p: WavePlan, y: number): number {
    const w = this.game.world;
    const counts = new Map<number, number>();
    for (let s = p.sStart; s < 0; s += 6)
      for (let u = -p.halfW * 0.6; u <= p.halfW * 0.6; u += 16) {
        const x = Math.floor(p.px + p.dx * s + p.nx * u), z = Math.floor(p.pz + p.dz * s + p.nz * u);
        const g = groundTop(w, x, z);
        if (g < 0) continue;
        const top = liquidTop(w, x, z, g);
        if (top < 0 || w.getBlock(x, top, z) >>> 4 !== S('water') >>> 4) continue;
        counts.set(top, (counts.get(top) ?? 0) + 1);
      }
    let best = -1, bc = 0;
    for (const [k, c] of counts) if (c > bc) { best = k; bc = c; }
    if (best >= 0) return best;
    const g = groundTop(w, Math.floor(p.px), Math.floor(p.pz));
    return Math.max(1, (g >= 0 ? g : y) - 1);
  }

  // ============================================================================ helpers
  private sound(name: string, x: number, y: number, z: number, volume = 1, pitch = 1) {
    try {
      this.game.audio?.play?.(name, { pos: { x, y, z }, volume, pitch });
    } catch { /* optional */ }
  }
  private loop(name: string, x: number, y: number, z: number, volume: number, pitch: number): LoopLike | null {
    try {
      const l = this.game.audio?.loop?.(name, { pos: { x, y, z }, volume, pitch });
      if (l) this.loops.push(l);
      return l ?? null;
    } catch {
      return null;
    }
  }
  private get sys(): any {
    return (this.game.particles as any)?.sys ?? null;
  }
  colAt(x: number, z: number): number {
    const gx = x - this.gx0, gz = z - this.gz0;
    if (gx < 0 || gz < 0 || gx >= this.gw || gz >= this.gh) return -1;
    return this.grid[gz * this.gw + gx];
  }
  /** Nearest point of the front line to the player (for audio). */
  private frontPoint(): [number, number] {
    const p = this.plan;
    const pp = this.game.player?.pos;
    const u = pp ? Math.max(-p.halfW, Math.min(p.halfW, toLocal(p, pp.x, pp.z)[1])) : 0;
    const s = this.front.s + wobble(u);
    return [p.px + p.dx * s + p.nx * u, p.pz + p.dz * s + p.nz * u];
  }

  // ============================================================================ tick
  tick(game: Game): boolean {
    const t0 = now();
    this.ticks++;
    this.pt += 0.05;
    this.sinceTick = 0;
    try {
      switch (this.phase) {
        case 'survey':
          if (this.tickSurvey()) this.phase = 'approach';
          break;
        case 'approach':
          this.tickApproach();
          break;
        case 'hold':
          this.tickFill();
          this.tickEntities();
          if (this.fillHead >= this.fillQueue.length && this.prepareDrain() && this.pt >= HOLD_S) this.startDrain();
          break;
        case 'drain':
          this.tickDrain();
          this.tickEntities();
          break;
      }
    } finally {
      this.bulk.end();
    }
    this.stats.worstMs = Math.max(this.stats.worstMs, now() - t0);
    void game;
    return this.phase !== 'done';
  }

  // ---------------------------------------------------------------------------- survey
  private rowSeen: Uint8Array | null = null;
  private rowCoast: Float32Array | null = null;
  private rec: number[] = [];

  private rowOf(i: number): number {
    const R0 = this.rowSeen!.length >> 1;
    return Math.max(0, Math.min(this.rowSeen!.length - 1, Math.round(this.cu[i] / 2) + R0));
  }

  /**
   * Resumable survey: 0 measure columns, 1 sort by arrival, 2 coastline per row,
   * 3 coast per column + recession set, 4 order the recession. True when finished.
   */
  private tickSurvey(): boolean {
    const w = this.game.world;
    const p = this.plan;
    const deadline = now() + BUDGET_MS;
    const water = S('water') >>> 4;
    if (this.surveyStage === 0) {
      const list = this.surveyList;
      for (; this.surveyCursor < this.n; this.surveyCursor++) {
        if ((this.surveyCursor & 63) === 0 && now() > deadline) return false;
        const i = this.surveyCursor;
        const x = list[i * 2], z = list[i * 2 + 1];
        const [s, u] = toLocal(p, x + 0.5, z + 0.5);
        this.cx[i] = x; this.cz[i] = z; this.cs[i] = s; this.cu[i] = u;
        this.ck[i] = s - wobble(u);
        this.grid[(z - this.gz0) * this.gw + (x - this.gx0)] = i;
        const g = groundTop(w, x, z);
        this.ground[i] = g;
        if (g >= 0 && g < p.seaY && w.getBlock(x, p.seaY, z) >>> 4 === water) this.sea[i] = 1;
        this.recLevel[i] = p.seaY + 1;
      }
      this.surveyList = [];
      this.surveyStage = 1;
      this.surveyCursor = 0;
      return false;
    }
    if (this.surveyStage === 1) {
      this.order = packOrder(this.ck);
      const NR = (Math.ceil((p.halfW + 4) / 2) + 1) * 2 + 1;
      this.rowSeen = new Uint8Array(NR);
      this.rowCoast = new Float32Array(NR).fill(NaN);
      this.surveyStage = 2;
      return false;
    }
    const seen = this.rowSeen!, rowCoast = this.rowCoast!;
    if (this.surveyStage === 2) {
      // walking every row from the sea inland: the first land after water is its coastline
      const order = this.order;
      for (; this.surveyCursor < this.n; this.surveyCursor++) {
        if ((this.surveyCursor & 63) === 0 && now() > deadline) return false;
        const i = order[this.surveyCursor];
        if (this.ground[i] < 0) continue;
        const r = this.rowOf(i);
        if (this.sea[i]) seen[r] = 1;
        else if (seen[r] && Number.isNaN(rowCoast[r])) rowCoast[r] = this.ck[i];
      }
      const found: number[] = [];
      let sawSea = false;
      for (let r = 0; r < seen.length; r++) {
        if (!Number.isNaN(rowCoast[r])) found.push(rowCoast[r]);
        if (seen[r]) sawSea = true;
      }
      found.sort((a, b) => a - b);
      this.coastS = found.length ? found[Math.floor(found.length / 2)] : sawSea ? p.sMax : -30;
      this.surveyStage = 3;
      this.surveyCursor = 0;
      return false;
    }
    if (this.surveyStage === 3) {
      for (; this.surveyCursor < this.n; this.surveyCursor++) {
        if ((this.surveyCursor & 63) === 0 && now() > deadline) return false;
        const i = this.surveyCursor;
        const r = this.rowOf(i);
        this.coast[i] = !Number.isNaN(rowCoast[r]) ? rowCoast[r] : seen[r] ? p.sMax : this.coastS;
        // shallow water near the coast recedes before the wave
        if (this.sea[i] && this.ck[i] > this.coast[i] - 45 && this.ck[i] <= this.coast[i]) this.rec.push(i);
      }
      this.surveyStage = 4;
      return false;
    }
    // nearest the coast first
    const rec = this.rec;
    const keys = new Float32Array(rec.length);
    for (let k = 0; k < rec.length; k++) keys[k] = -this.ck[rec[k]];
    const ord = packOrder(keys);
    this.recede = Array.from(ord, (k) => rec[k]);
    this.rec = [];
    this.rowSeen = this.rowCoast = null;
    return true;
  }

  // ---------------------------------------------------------------------------- approach
  private tickApproach() {
    const p = this.plan;
    const f = advanceFront(p, this.front, 0.05, this.coastS);
    // the sea draws back while the wave is still far out
    if (this.front.t < RECEDE_S + 2) this.tickRecede();
    // columns reached by the front get flooded (queue), in arrival order
    while (this.passPtr < this.n && this.ck[this.order[this.passPtr]] <= f.s) {
      const i = this.order[this.passPtr++];
      this.hpass[i] = f.H * taper(p, this.cu[i]);
      if (this.ground[i] >= 0) this.fillQueue.push(i);
    }
    this.tickFill();
    this.tickEntities();
    // crash at the coast
    if (!this.crashed && f.s > this.coastS - 4) {
      this.crashed = true;
      const [x, z] = this.frontPoint();
      this.sound('random.explode', x, p.seaY + 4, z, 8, 0.32);
      this.sound('entity.generic.splash', x, p.seaY + 4, z, 8, 0.45);
      this.game.message?.('TSUNAMI!', '#4fb4ff');
    }
    // roar, rumble, shake
    const pp = this.game.player?.pos;
    const [fx, fz] = this.frontPoint();
    const d = pp ? Math.hypot(pp.x - fx, pp.z - fz) : 200;
    if (!this.roar && this.front.t > 0.5) {
      this.roar = this.loop('loop.ocean', fx, p.seaY + 6, fz, 2, 0.45);
      this.wind = this.loop('loop.wind', fx, p.seaY + 10, fz, 1, 0.4);
    }
    const near = Math.max(0, 1 - d / 160);
    this.roar?.setPos({ x: fx, y: p.seaY + 6, z: fz });
    this.roar?.setVolume((2 + 8 * near) * Math.min(1, f.H / 10));
    this.wind?.setPos({ x: fx, y: p.seaY + 10, z: fz });
    this.wind?.setVolume((1 + 4 * near) * Math.min(1, f.H / 10));
    if ((this.rumble -= 0.05) <= 0) {
      this.rumble = 1.5 + rnd() * 2;
      this.sound('weather.thunder.far', fx, p.seaY, fz, 4 + 4 * near, 0.25 + rnd() * 0.1);
    }
    this.fx.addShake(0.06 + 0.5 * Math.max(0, 1 - d / 50) * Math.min(1, f.H / 12));
    if (f.done) {
      this.phase = 'hold';
      this.pt = 0;
      const [x, z] = this.frontPoint();
      this.sound('entity.generic.splash', x, p.seaY + 3, z, 5, 0.4);
      this.roar?.stop(3);
      this.wind?.stop(3);
      this.roar = this.wind = null;
      this.rush = this.loop('loop.water_flow', x, p.seaY + 2, z, 3, 0.7);
    }
  }

  private tickRecede() {
    const w = this.game.world;
    const p = this.plan;
    const k = Math.min(1, this.front.t / RECEDE_S);
    const target = p.seaY + 1 - Math.round(RECEDE_DROP * k * k * (3 - 2 * k));
    const deadline = now() + 1.5;
    const water = S('water') >>> 4;
    const L = this.recede.length;
    for (let n = 0; n < L; n++) {
      if ((n & 31) === 0 && now() > deadline) break;
      const i = this.recede[this.recCursor];
      this.recCursor = (this.recCursor + 1) % L;
      if (this.level[i] >= 0) continue;
      const x = this.cx[i], z = this.cz[i], g = this.ground[i];
      while (this.recLevel[i] > target && this.recLevel[i] - 1 > g) {
        const y = this.recLevel[i] - 1;
        if (w.getBlock(x, y, z) >>> 4 !== water) break;
        this.bulk.set(x, y, z, 0);
        this.recLevel[i] = y;
        this.receded++;
      }
    }
    // fish-out-of-water feel: drips and splashes on the exposed floor near the player
    const sys = this.sys;
    const pp = this.game.player?.pos;
    if (sys && pp && L && rnd() < 0.6) {
      const i = this.recede[Math.floor(rnd() * L)];
      if (this.recLevel[i] <= p.seaY && Math.hypot(this.cx[i] - pp.x, this.cz[i] - pp.z) < 48) {
        sys.spawn(PT.splash, this.cx[i] + 0.5, this.recLevel[i] + 0.1, this.cz[i] + 0.5, (rnd() - 0.5), 2 + rnd() * 2, (rnd() - 0.5));
      }
    }
  }

  // ---------------------------------------------------------------------------- flood
  private tickFill() {
    const deadline = now() + BUDGET_MS;
    this.debrisBudget = 1;
    let n = 0;
    while (this.fillHead < this.fillQueue.length) {
      if (++n > 1 && now() > deadline) break;
      this.fillColumn(this.fillQueue[this.fillHead++]);
    }
    if (this.fillHead > 4096 && this.fillHead * 2 > this.fillQueue.length) {
      this.fillQueue.splice(0, this.fillHead);
      this.fillHead = 0;
    }
  }

  private fillColumn(i: number) {
    const w = this.game.world;
    const p = this.plan;
    const x = this.cx[i], z = this.cz[i];
    let g = this.ground[i];
    if (g < 0) return;
    const sea = this.sea[i] === 1;
    const L = floodLevel(p, this.ck[i], this.coast[i], this.hpass[i], sea);
    const water = S('water');
    const waterId = water >>> 4;
    // beach erosion: the top sand layer near the coast is torn away
    const inland = this.ck[i] - this.coast[i];
    if (!sea && inland < 30 && g < L && blockClass(w.getBlock(x, g, z)) === ERODIBLE && hash3(x, g, z, p.seed) < 0.55) {
      this.bulk.set(x, g, z, water);
      if (g > p.seaY) this.record(i, g);
      g = --this.ground[i];
    }
    this.level[i] = L;
    let woodHere = false;
    for (let y = g + 1; y <= L; y++) {
      const st = w.getBlock(x, y, z);
      const c = blockClass(st);
      if (y <= p.seaY && sea) {
        // the sea itself: only refill what receded (keep kelp, seagrass ...)
        if (c === AIR) this.bulk.set(x, y, z, water);
        continue;
      }
      if (c === AIR) {
        if (this.bulk.set(x, y, z, water)) this.record(i, y);
      } else if (c === WEAK) {
        woodHere = this.smash(x, y, z, st) || woodHere;
        if (this.bulk.set(x, y, z, water)) this.record(i, y);
      } else if (c === LIQUID) {
        if (st >>> 4 !== waterId) this.bulk.set(x, y, z, S('obsidian'));
      }
    }
    // the crest smashes weak blocks above the flood; uprooted trees go entirely
    const top = woodHere ? g + 28 : L + 4;
    for (let y = L + 1; y <= top && y < 256; y++) {
      const st = w.getBlock(x, y, z);
      if (!st) {
        if (!woodHere) break;
        continue;
      }
      const c = blockClass(st);
      if (c === WEAK) {
        woodHere = this.smash(x, y, z, st) || woodHere;
        this.bulk.set(x, y, z, 0);
      } else if (c === STRONG || c === ERODIBLE) break;
    }
  }

  private record(i: number, y: number) {
    let b = this.buckets.get(y);
    if (!b) this.buckets.set(y, (b = []));
    b.push(i);
    if (y > this.maxY) this.maxY = y;
    this.stats.placed++;
  }

  /** A weak block is destroyed by the water: crumbs / floating debris near the player. Returns true for wood. */
  private smash(x: number, y: number, z: number, st: number): boolean {
    this.stats.destroyed++;
    const def = BLOCKS[st >>> 4];
    const wood = def.sound === 'wood' || def.name.endsWith('_log') || def.name.endsWith('_planks');
    if (wood) this.wood++;
    const pp = this.game.player?.pos;
    if (!pp) return wood;
    const d = Math.hypot(pp.x - x, pp.y - y, pp.z - z);
    if (d > 64) return wood;
    const P = this.game.particles;
    const p = this.plan;
    if (P && rnd() < 0.35) P.emit?.('block_crumb', [x + 0.5, y + 0.5, z + 0.5], { state: st, count: 3, speed: 3, vel: [p.dx * 9, 3, p.dz * 9] });
    const deb = (this.game as any).explosions?.debris;
    if (deb && def.solid && this.debrisBudget > 0 && d < 48 && rnd() < 0.3) {
      this.debrisBudget--;
      try {
        deb.spawn(st, x, y, z, { x: x + 0.5 - p.dx * 2, y: y - 0.5, z: z + 0.5 - p.dz * 2 }, 7, 2);
      } catch { /* optional */ }
    }
    return wood;
  }

  // ---------------------------------------------------------------------------- entities
  private tickEntities() {
    const g = this.game;
    const p = this.plan;
    const list: any[] = [...(g.entities?.list ?? [])];
    if (g.player && !list.includes(g.player)) list.push(g.player);
    const fs = this.front.s;
    const travelling = this.phase === 'approach';
    for (const e of list) {
      if (!e?.pos || e.removed || !e.vel) continue;
      if (e.spectator) continue;
      const [s, u] = toLocal(p, e.pos.x, e.pos.z);
      if (Math.abs(u) > p.halfW + 4) continue;
      const k = s - wobble(u);
      const i = this.colAt(Math.floor(e.pos.x), Math.floor(e.pos.z));
      const lvl = i >= 0 ? this.level[i] : -1;
      if (travelling && k > fs - 6 && k < fs + 2.5 && e.pos.y < p.seaY + 1 + this.front.H * taper(p, u)) {
        // hit by the front: swept along and lifted
        const v = p.speed * 1.25;
        const along = e.vel.x * p.dx + e.vel.z * p.dz;
        const add = Math.max(0, v - along) * 0.45;
        e.vel.x += p.dx * add;
        e.vel.z += p.dz * add;
        e.vel.y = Math.max(e.vel.y, 3 + rnd() * 2);
        if (!this.hit.has(e) && typeof e.hurt === 'function') {
          this.hit.add(e);
          e.hurt({ type: 'generic', dir: new THREE.Vector3(p.dx, 0.3, p.dz), impulse: 6 }, 4);
          if (e === g.player) this.fx.flash(0.35, 0x9fd8ff);
        }
        this.stats.pushed++;
      } else if (lvl >= 0 && e.pos.y < lvl + 1.2) {
        // current inside the flood: inland while it rushes in, seaward while it drains
        const dir = this.phase === 'drain' ? -0.6 : travelling ? 1 : 0.3;
        const cap = this.phase === 'drain' ? 3 : 6;
        const along = e.vel.x * p.dx + e.vel.z * p.dz;
        if (dir > 0 ? along < cap : along > -cap) {
          e.vel.x += p.dx * dir * 0.5;
          e.vel.z += p.dz * dir * 0.5;
        }
      }
    }
    // rigid bodies (debris, dropped items, ragdolls)
    const bodies: Set<any> | undefined = (g.physics as any)?.bodies;
    if (bodies && travelling) {
      for (const b of bodies) {
        if (!b.dynamic || !b.pos) continue;
        const [s, u] = toLocal(p, b.pos.x, b.pos.z);
        const k = s - wobble(u);
        if (Math.abs(u) > p.halfW || k < fs - 8 || k > fs + 3 || b.pos.y > p.seaY + 1 + this.front.H) continue;
        try {
          const v = b.rb.linvel();
          b.rb.setLinvel({ x: p.dx * p.speed * 1.2 + v.x * 0.3, y: Math.max(v.y, 2.5), z: p.dz * p.speed * 1.2 + v.z * 0.3 }, true);
        } catch { /* optional */ }
      }
    }
  }

  // ---------------------------------------------------------------------------- drain
  private bottom: Int16Array | null = null;
  private prepCursor = 0;

  /** Collects the bottom flood cell of every column (budgeted); true when done. */
  private prepareDrain(): boolean {
    const w = this.game.world;
    const p = this.plan;
    const water = S('water') >>> 4;
    if (!this.bottom) this.bottom = new Int16Array(this.n).fill(-1);
    const bottom = this.bottom;
    const deadline = now() + BUDGET_MS;
    for (; this.prepCursor < this.n; this.prepCursor++) {
      if ((this.prepCursor & 255) === 0 && now() > deadline) return false;
      const i = this.prepCursor;
      const y = this.ground[i] + 1;
      if (this.level[i] >= y && y > p.seaY && w.getBlock(this.cx[i], y, this.cz[i]) >>> 4 === water) bottom[i] = y;
    }
    return true;
  }

  private solver: BasinSolver | null = null;

  private startDrain() {
    const w = this.game.world;
    const p = this.plan;
    const bottom = this.bottom!;
    if (!this.solver) {
      // puddles: bottom flood cells enclosed by ground or by other bottom cells stay
      const DX = [1, -1, 0, 0], DZ = [0, 0, 1, -1];
      const nb = (i: number, d: number) => this.colAt(this.cx[i] + DX[d], this.cz[i] + DZ[d]);
      const sealed = (i: number, d: number) => {
        const x = this.cx[i] + DX[d], z = this.cz[i] + DZ[d], y = bottom[i];
        const st = w.getBlock(x, y, z);
        if (T_FULL_CUBE[st >>> 4]) return true;
        if (!isLiquid(st)) return false;
        // water that is not part of the flood (a pond, the sea) holds the puddle in
        const j = this.colAt(x, z);
        return !(j >= 0 && this.level[j] >= y && y > this.ground[j] && y > p.seaY);
      };
      this.solver = new BasinSolver(this.n, bottom, nb, sealed);
    }
    if (!this.solver.step(now() + BUDGET_MS)) return;
    this.puddles = this.solver.keep;
    this.solver = null;
    this.bottom = null;
    this.phase = 'drain';
    this.pt = 0;
    this.drainTop = this.maxY;
    let kept = 0;
    for (let i = 0; i < this.n; i++) kept += this.puddles[i];
    this.stats.puddles = kept;
    this.game.message?.('The water is draining back to the sea.', '#80c8ff');
  }

  private tickDrain() {
    const p = this.plan;
    const w = this.game.world;
    const k = Math.min(1, this.pt / DRAIN_S);
    const ease = k * k * (3 - 2 * k);
    const Y = this.maxY - (this.maxY - p.seaY) * ease;
    const deadline = now() + BUDGET_MS;
    const water = S('water') >>> 4;
    let ops = 0;
    while (this.drainTop > p.seaY && this.drainTop > Y) {
      const y = this.drainTop;
      const list = this.buckets.get(y);
      let ptr = this.drainPtr.get(y) ?? 0;
      if (list) {
        for (; ptr < list.length; ptr++) {
          if ((++ops & 15) === 0 && now() > deadline) break;
          const i = list[ptr];
          const x = this.cx[i], z = this.cz[i];
          if (this.puddles && this.puddles[i] && y === this.ground[i] + 1) continue;
          if (w.getBlock(x, y, z) >>> 4 === water) {
            this.bulk.set(x, y, z, 0);
            this.stats.drained++;
          }
          if (y === this.ground[i] + 1) this.deposit(i);
        }
        this.drainPtr.set(y, ptr);
        if (ptr < list.length) break;
      }
      this.buckets.delete(y);
      this.drainPtr.delete(y);
      this.drainTop--;
    }
    // backwash foam and the sound of the water rushing out
    const pp = this.game.player?.pos;
    if (this.rush && pp) this.rush.setPos({ x: pp.x - p.dx * 6, y: Math.max(p.seaY, Y), z: pp.z - p.dz * 6 });
    this.rush?.setVolume(3 * (1 - ease) + 0.2);
    if (this.drainTop <= p.seaY && this.pt >= DRAIN_S) {
      this.phase = 'done';
      this.rush?.stop(2);
      this.rush = null;
    }
  }

  /** Wet debris, sand deposits and mud where the water left. */
  private deposit(i: number) {
    const w = this.game.world;
    const p = this.plan;
    const x = this.cx[i], z = this.cz[i], g = this.ground[i];
    if (w.getBlock(x, g + 1, z) !== 0) return;
    const top = w.getBlock(x, g, z);
    const name = BLOCKS[top >>> 4].name;
    const soil = name === 'grass_block' || name === 'dirt' || name === 'coarse_dirt' || name === 'podzol' || name === 'mycelium';
    const n1 = noise2(x / 8, z / 8, p.seed), n2 = noise2(x / 6 + 40, z / 6, p.seed + 1);
    const h = hash3(x, g, z, p.seed + 5);
    if (h < 0.012 && this.wood > 0) {
      // a washed-up log lying along the flow
      this.wood--;
      const axis = Math.abs(p.dx) > Math.abs(p.dz) ? 1 : 2;
      this.bulk.set(x, g + 1, z, S('oak_log', axis));
      this.stats.deposits++;
    } else if (n1 > 0.3 && T_FULL_CUBE[top >>> 4]) {
      if (name === 'grass_block') this.bulk.set(x, g, z, S('dirt'));
      this.bulk.set(x, g + 1, z, S(h < 0.05 ? 'gravel' : 'sand'));
      if (h > 0.985) this.bulk.set(x, g + 2, z, S('dead_bush'));
      this.stats.deposits++;
    } else if (n2 > 0.25 && soil) {
      this.bulk.set(x, g, z, S('mud'));
      this.stats.deposits++;
    }
  }

  // ============================================================================ frame
  update(game: Game, dt: number) {
    if (game.paused) return;
    dt = Math.min(dt, 0.1);
    this.time += dt;
    this.sinceTick = Math.min(0.05, this.sinceTick + dt);
    const p = this.plan;
    const f = this.front;
    if (this.phase === 'approach' || this.phase === 'survey') this.collapse = 1;
    else this.collapse = Math.max(0, this.collapse - dt / 2.5);
    const moving = this.phase === 'approach' ? p.speed * (f.s > this.coastS ? 0.8 : 1) : 0;
    const s = f.s + moving * this.sinceTick;
    const H = f.H * this.collapse;
    const curl = Math.min(1, curlFor(s, this.coastS, this.time) + (1 - this.collapse));
    const foam = 1 - this.collapse;
    this.wave?.update(s, H, curl, this.time, foam);
    // close to the wall: darken, shake
    const pp = game.player?.pos;
    if (pp && H > 1) {
      const [ps, pu] = toLocal(p, pp.x, pp.z);
      const ahead = s + wobble(pu) - ps;
      if (Math.abs(pu) < p.halfW && ahead < 0 && ahead > -40) {
        const k = 1 + ahead / 40;
        this.fx.requestTint(0.04, 0.12, 0.16, 0.18 * k * Math.min(1, H / 15));
      }
    }
    if (H > 0.5) this.spray(dt, s, H, curl);
  }

  /** Spray off the crest and lip, mist, whitewater at the toe; concentrated near the player. */
  private spray(dt: number, s: number, H: number, curl: number) {
    const sys = this.sys;
    if (!sys) return;
    const p = this.plan;
    const w = this.game.world;
    const pp = this.game.player?.pos;
    const pu = pp ? toLocal(p, pp.x, pp.z)[1] : 0;
    this.sprayAcc += dt * (70 + 40 * (1 - this.collapse)) * Math.min(1, H / 8);
    const n = Math.min(40, Math.floor(this.sprayAcc));
    this.sprayAcc -= n;
    const pr: [number, number] = [0, 0];
    for (let k = 0; k < n; k++) {
      const u = Math.max(-p.halfW, Math.min(p.halfW, rnd() < 0.7 ? pu + (rnd() + rnd() + rnd() - 1.5) * 50 : (rnd() * 2 - 1) * p.halfW));
      const tp = taper(p, u);
      if (tp < 0.05) continue;
      const h = H * tp;
      const c = Math.min(1, curl + 0.3 * Math.sin(u * 0.045 + this.time * 0.4 + 1.3) * curl);
      const kind = rnd();
      const along = s + wobble(u);
      if (kind < 0.55) {
        // crest / lip spray blown forward
        profileAt(c > 0.4 ? S_LIP : S_CREST, c, pr);
        const a = along + pr[0] * Math.max(h, 1) * 1.05;
        const x = p.px + p.dx * a + p.nx * u, z = p.pz + p.dz * a + p.nz * u, y = p.seaY + 0.9 + pr[1] * h;
        let i = sys.spawn(PT.splash, x, y, z, p.dx * (6 + rnd() * 8) + (rnd() - 0.5) * 3, 2 + rnd() * 6, p.dz * (6 + rnd() * 8) + (rnd() - 0.5) * 3);
        if (i >= 0) { sys.lp.size[i] *= 3; sys.lp.life[i] *= 2.5; }
        if (rnd() < 0.5) {
          i = sys.spawn(PT.poof, x, y + 0.5, z, p.dx * 4, 1 + rnd() * 2, p.dz * 4);
          if (i >= 0) { sys.lp.size[i] *= 6 + rnd() * 6; sys.lp.life[i] *= 3.5; sys.tint(i, 0.82, 0.86, 0.9, 0.55); }
        }
      } else {
        // whitewater at the toe, on the sea or on the land being flooded
        const x = p.px + p.dx * (along + 1) + p.nx * u, z = p.pz + p.dz * (along + 1) + p.nz * u;
        const i0 = this.colAt(Math.floor(x), Math.floor(z));
        const gy = i0 >= 0 && this.ground[i0] >= 0 ? Math.max(this.ground[i0] + 1, p.seaY + 1) : p.seaY + 1;
        if (gy > p.seaY + 1 + h * 0.8) continue;
        let i = sys.spawn(PT.poof, x, gy + 0.5, z, p.dx * (5 + rnd() * 4), 1.5 + rnd() * 3, p.dz * (5 + rnd() * 4));
        if (i >= 0) { sys.lp.size[i] *= 7 + rnd() * 5; sys.lp.life[i] *= 2.5; sys.tint(i, 0.85, 0.88, 0.9, 0.7); }
        if (rnd() < 0.6) {
          i = sys.spawn(PT.splash, x, gy + 0.3, z, p.dx * 8 + (rnd() - 0.5) * 4, 5 + rnd() * 7, p.dz * 8 + (rnd() - 0.5) * 4);
          if (i >= 0) sys.lp.size[i] *= 3;
        }
        if (rnd() < 0.15) {
          i = sys.spawn(PT.ripple, x, gy + 0.05, z);
          if (i >= 0) sys.lp.size[i] *= 4;
        }
      }
    }
    void w;
  }

  dispose() {
    this.bulk.end();
    for (const l of this.loops) l.stop(1);
    this.loops.length = 0;
    this.roar = this.wind = this.rush = null;
    this.layer?.dispose();
    this.layer = null;
    this.wave = null;
    this.buckets.clear();
    this.drainPtr.clear();
    this.fillQueue.length = 0;
    this.recede.length = 0;
    this.puddles = null;
  }
}

registerDisaster('tsunami', (ctx) => new Tsunami(ctx));
