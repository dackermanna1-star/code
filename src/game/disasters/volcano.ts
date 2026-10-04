/**
 * VOLCANO: a stratovolcano rises out of the ground, then erupts.
 *
 *  1. Rise (~12 s): the cone (40..70 blocks, concave flanks, gullies, summit crater) is uplifted
 *     column by column in sweeps (basalt / blackstone / tuff / stone strata, magma veins), with
 *     rumbling, shake, steam and dust. Entities standing on rising ground ride up with it; trees
 *     are engulfed or burnt. The crater fills with a lava lake.
 *  2. Eruption (~50 s): ash column and umbrella plume with lightning, dark orange sky tint, lava
 *     fountains, lava bombs (glowing tumbling rocks with fire trails that splash magma, lava and
 *     blackstone, start fires, the big ones explode), vulcanian blasts with pyroclastic surges,
 *     lava flows walking downhill as real lava blocks (quenched to obsidian / basalt deltas by
 *     water), crater glow and dynamic light flashes, ash fall around the player.
 *  3. Aftermath (~45 s): the flows crust over to basalt with glowing magma; the mountain smokes.
 *
 * All block work is budgeted (time per tick) and goes through BulkEdit; lava is placed as
 * static source blocks (no fluid-tick storm).
 */
import type { Game } from '../game';
import { registerDisaster, BulkEdit, S, hash3, type Disaster, type DisasterContext, type DisasterFx } from './kit';
import { planVolcano, coneColumns, rockAt, riseProgress, columnHeightAt, nextFlowCell, type VolcanoPlan, type Rock } from './fire/cone';
import { BombRenderer, BoltRenderer, type BombView } from './fire/fx';
import { ForwardLayer, hasGpu } from './fire/gl';
import { blockClass, groundTop, liquidTop, isFlammable, STRONG, WEAK, ERODIBLE, LIQUID } from './fire/terrain';
import { SetFlags } from '../../world/world';
import { PT } from '../../render/particles/defs';

export const RISE_S = 12;
const PAUSE_S = 2;
export const ERUPT_S = 50;
const SMOKE_S = 45;
const GRAVITY = 18;
const MAX_BOMBS = 48;
/** Time budget for block work per tick (ms). */
const BUDGET_MS = 4.5;

const rnd = Math.random;
const now = () => (typeof performance !== 'undefined' ? performance.now() : Date.now());

interface Bomb {
  x: number; y: number; z: number;
  px: number; py: number; pz: number;
  vx: number; vy: number; vz: number;
  r: number;
  heat: number;
  seed: number;
  trail: number;
  age: number;
  dead: boolean;
}

interface Flow {
  x: number; z: number;
  dirX: number; dirZ: number;
  visited: Set<number>;
  next: number;
  len: number;
  maxLen: number;
  flats: number;
  quench: number;
  seed: number;
  alive: boolean;
  width: number;
}

interface Surge {
  a: number;
  r: number;
  speed: number;
  life: number;
}

interface LoopLike {
  stop(f?: number): void;
  setVolume(v: number): void;
}

const key2 = (x: number, z: number) => (x + 32768) * 65536 + (z + 32768);

export class Volcano implements Disaster {
  readonly name = 'volcano';
  readonly plan: VolcanoPlan;
  phase: 'rise' | 'pause' | 'erupt' | 'smoke' | 'done' = 'rise';
  ticks = 0;
  /** Seconds in the current phase. */
  pt = 0;
  private readonly game: Game;
  private readonly fx: DisasterFx;
  private readonly bulk: BulkEdit;
  // ---- cone columns
  private cols: Int32Array;
  private ncol: number;
  private built: Int16Array;
  private ground: Int16Array;
  private grid: Int32Array;
  private gridR: number;
  private cursor = 0;
  private sweepF = 0;
  private riseDone = false;
  lakeFilled = false;
  private rocks = new Map<Rock, number>();
  // ---- eruption
  private intensity = 0;
  private bombs: Bomb[] = [];
  private bombAcc = 0;
  private nextBlast = 6;
  private flows: Flow[] = [];
  private flowPlan: number[] = [];
  readonly lavaCells: number[] = [];
  private coolCursor = 0;
  private surges: Surge[] = [];
  private lastExplodeTick = -100;
  private thunder: { t: number; near: boolean; x: number; y: number; z: number }[] = [];
  // ---- visuals
  private layer: ForwardLayer | null = null;
  private bombR: BombRenderer | null = null;
  private boltR: BoltRenderer | null = null;
  private views: BombView[] = [];
  private time = 0;
  private tickFrac = 0;
  private acc = { plume: 0, vent: 0, fountain: 0, ash: 0, glow: 0, bolt: 1.5, dust: 0, smoke: 0, rumble: 0.5 };
  private loops: LoopLike[] = [];
  private roar: LoopLike | null = null;

  /** Stats (tests / debugging). */
  readonly stats = { placed: 0, worstMs: 0, bombsLaunched: 0, bombsLanded: 0, flowCells: 0, quenched: 0 };

  constructor(ctx: DisasterContext) {
    this.game = ctx.game;
    this.fx = ctx.effects;
    this.bulk = new BulkEdit(ctx.game);
    const w = ctx.game.world;
    const seed = (Math.imul(ctx.x, 73856093) ^ Math.imul(ctx.z, 19349663) ^ (w.seed | 0)) & 0xffff;
    // stand on the ground below the spawner
    const gy = groundTop(w, ctx.x, ctx.z);
    this.plan = planVolcano(ctx.x, gy >= 0 ? Math.min(ctx.y, gy + 1) : ctx.y, ctx.z, seed);
    this.cols = coneColumns(this.plan);
    this.ncol = this.cols.length / 3;
    this.built = new Int16Array(this.ncol).fill(-1);
    this.ground = new Int16Array(this.ncol).fill(-2);
    this.gridR = Math.ceil(this.plan.R * 1.2) + 1;
    const gs = this.gridR * 2 + 1;
    this.grid = new Int32Array(gs * gs).fill(-1);
    for (let i = 0; i < this.ncol; i++) {
      const gx = this.cols[i * 3] - this.plan.cx + this.gridR, gz = this.cols[i * 3 + 1] - this.plan.cz + this.gridR;
      this.grid[gz * gs + gx] = i;
    }
    // flows: start times (s into the eruption) and rim angles spread around the cone
    const a0 = hash3(seed, 3, 3) * Math.PI * 2;
    const n = 5 + Math.floor(hash3(seed, 4, 4) * 3);
    for (let i = 0; i < n; i++) this.flowPlan.push(3 + i * (34 / n) + hash3(seed, i, 5) * 3, a0 + i * 2.39996 + (hash3(seed, i, 6) - 0.5) * 0.6);
    if (hasGpu(ctx.game)) {
      try {
        this.layer = new ForwardLayer(ctx.game);
        this.bombR = new BombRenderer(ctx.game, this.layer);
        this.boltR = new BoltRenderer(this.layer);
      } catch (e) {
        console.warn('volcano: visuals unavailable', e);
      }
    }
    this.sound('weather.thunder.far', this.plan.cx, this.plan.baseY, this.plan.cz, 6, 0.4);
    ctx.game.message?.('The ground begins to rumble...', '#ffb070');
  }

  // =========================================================================== helpers
  private rock(r: Rock) {
    let s = this.rocks.get(r);
    if (s === undefined) this.rocks.set(r, (s = S(r)));
    return s;
  }
  private colIndex(x: number, z: number): number {
    const gx = x - this.plan.cx + this.gridR, gz = z - this.plan.cz + this.gridR;
    const gs = this.gridR * 2 + 1;
    if (gx < 0 || gz < 0 || gx >= gs || gz >= gs) return -1;
    return this.grid[gz * gs + gx];
  }
  /** Built cone top at a column (absolute y) or -1. */
  builtTop(x: number, z: number): number {
    const i = this.colIndex(x, z);
    return i < 0 ? -1 : this.built[i];
  }
  private topAt(x: number, z: number): number {
    return groundTop(this.game.world, x, z);
  }
  private sound(name: string, x: number, y: number, z: number, volume = 1, pitch = 1) {
    try {
      this.game.audio?.play?.(name, { pos: { x, y, z }, volume, pitch });
    } catch { /* audio optional */ }
  }
  private get sys(): any {
    return (this.game.particles as any)?.sys ?? null;
  }
  private flash(x: number, y: number, z: number, color: number, intensity: number, duration: number, radius: number) {
    this.game.particles?.flash?.(x, y, z, color, intensity, duration, radius);
  }
  /** 0..1 how close the player is (1 = on the volcano). */
  private proximity(): number {
    const p = this.game.player?.pos;
    if (!p) return 0;
    const d = Math.hypot(p.x - this.plan.cx, p.z - this.plan.cz);
    return Math.max(0, Math.min(1, 1 - (d - this.plan.R * 0.6) / 200));
  }

  // =========================================================================== tick
  tick(game: Game): boolean {
    const t0 = now();
    this.ticks++;
    this.pt += 0.05;
    this.tickFrac = 0;
    try {
      switch (this.phase) {
        case 'rise':
          this.tickRise();
          if (this.riseDone && this.lakeFilled) this.setPhase('pause');
          break;
        case 'pause':
          this.fx.addShake(0.5 * this.proximity() + 0.05);
          if (this.pt >= PAUSE_S) this.startEruption();
          break;
        case 'erupt':
          this.tickEruption();
          if (this.pt >= ERUPT_S) {
            this.setPhase('smoke');
            for (const l of this.loops) l.stop(4);
            this.loops.length = 0;
            this.roar = null;
            game.message?.('The eruption is subsiding.', '#ffb070');
          }
          break;
        case 'smoke':
          this.tickBombs();
          this.tickCooling();
          if (this.pt >= SMOKE_S) this.phase = 'done';
          break;
      }
      // delayed thunder
      for (let i = this.thunder.length - 1; i >= 0; i--) {
        const th = this.thunder[i];
        if ((th.t -= 0.05) <= 0) {
          this.sound(th.near ? 'weather.thunder.near' : 'weather.thunder.far', th.x, th.y, th.z, th.near ? 3 : 5, 0.9 + rnd() * 0.2);
          this.thunder.splice(i, 1);
        }
      }
    } finally {
      this.bulk.end();
    }
    this.stats.worstMs = Math.max(this.stats.worstMs, now() - t0);
    return this.phase !== 'done';
  }

  private setPhase(p: Volcano['phase']) {
    this.phase = p;
    this.pt = 0;
  }

  // --------------------------------------------------------------------------- rise
  private tickRise() {
    const w = this.game.world;
    const pl = this.plan;
    const f = riseProgress(this.ticks * 0.05, RISE_S);
    if (this.cursor === 0) this.sweepF = f;
    const deadline = now() + BUDGET_MS;
    let ops = 0;
    const cols = this.cols;
    const P = this.game.particles;
    for (; this.cursor < this.ncol; this.cursor++) {
      if ((++ops & 15) === 0 && now() > deadline) break;
      const i = this.cursor;
      const x = cols[i * 3], z = cols[i * 3 + 1], fin = cols[i * 3 + 2];
      let g = this.ground[i];
      if (g === -2) {
        if (!w.isLoaded(x, z)) continue;
        g = groundTop(w, x, z);
        this.ground[i] = g;
      }
      const h = columnHeightAt(fin, pl.baseY, this.sweepF);
      if (h <= 0) continue;
      const target = pl.baseY + h - 1;
      const cur = this.built[i];
      if (target <= cur) continue;
      const from = cur < 0 ? g + 1 : Math.max(cur + 1, g + 1);
      for (let y = from; y <= target; y++) {
        if (this.bulk.set(x, y, z, this.rock(rockAt(pl, x, y, z)))) this.stats.placed++;
        ops++;
      }
      this.built[i] = target;
      if (target >= fin) this.clearAbove(x, fin, z);
      // dust where the ground heaves
      if (P?.blockDust && from <= target && rnd() < 0.004) P.blockDust(this.rock(rockAt(pl, x, target, z)), x + 0.5, target + 1, z + 0.5, 3, 2.5, 1.5);
    }
    if (this.cursor >= this.ncol) {
      this.cursor = 0;
      if (this.sweepF >= 1) this.riseDone = true;
    }
    if (this.riseDone && !this.lakeFilled) this.fillLake();
    this.liftEntities();
    // rumble
    const prox = this.proximity();
    this.fx.addShake(0.12 + 0.45 * prox * (0.6 + 0.4 * Math.sin(this.ticks * 0.3)));
    if ((this.acc.rumble -= 0.05) <= 0) {
      this.acc.rumble = 1.2 + rnd() * 1.8;
      this.sound('weather.thunder.far', pl.cx, pl.baseY + pl.H * f * 0.5, pl.cz, 5, 0.3 + rnd() * 0.15);
      if (rnd() < 0.5) this.sound('random.explode', pl.cx, pl.baseY, pl.cz, 2, 0.35);
    }
  }

  /** Vegetation and wooden structures left above a finished column burn away. */
  private clearAbove(x: number, top: number, z: number) {
    const w = this.game.world;
    for (let y = top + 1; y <= top + 16 && y < 256; y++) {
      const st = w.getBlock(x, y, z);
      if (!st) continue;
      const c = blockClass(st);
      if (c === WEAK) this.bulk.set(x, y, z, 0);
      else if (c === STRONG || c === ERODIBLE) break;
    }
  }

  private fillLake() {
    const pl = this.plan;
    const lava = S('lava');
    for (let dz = -pl.craterR - 2; dz <= pl.craterR + 2; dz++)
      for (let dx = -pl.craterR - 2; dx <= pl.craterR + 2; dx++) {
        const x = pl.cx + dx, z = pl.cz + dz;
        const i = this.colIndex(x, z);
        if (i < 0) continue;
        const top = this.built[i];
        if (top < 0 || top >= pl.lakeY) continue;
        // only inside the rim (no leaks through the lip)
        if (Math.hypot(dx, dz) > pl.craterR + 0.5) continue;
        for (let y = top + 1; y <= pl.lakeY; y++) this.bulk.set(x, y, z, lava);
        // magma crust on the crater floor
        this.bulk.set(x, top, z, this.rock(rnd() < 0.5 ? 'magma_block' : 'blackstone'));
      }
    this.lakeFilled = true;
    this.sound('liquid.lavapop', pl.cx, pl.lakeY, pl.cz, 3, 0.6);
  }

  /** Entities on rising ground ride up with it. */
  private liftEntities() {
    const g = this.game;
    const list: any[] = [...(g.entities?.list ?? [])];
    if (g.player && !list.includes(g.player)) list.push(g.player);
    for (const e of list) {
      if (!e?.pos || e.removed) continue;
      const top = this.builtTop(Math.floor(e.pos.x), Math.floor(e.pos.z));
      if (top < 0) continue;
      if (e.pos.y < top + 1 && e.pos.y > top - 8) {
        if (typeof e.setPos === 'function') e.setPos(e.pos.x, top + 1.01, e.pos.z);
        else e.pos.y = top + 1.01;
        if (e.vel) e.vel.y = Math.max(e.vel.y, 2);
      }
    }
  }

  // --------------------------------------------------------------------------- eruption
  private startEruption() {
    const pl = this.plan;
    this.setPhase('erupt');
    const x = pl.cx + 0.5, y = pl.lakeY + 1, z = pl.cz + 0.5;
    const prox = this.proximity();
    this.fx.flash(0.8 * prox + 0.1, 0xffc890);
    this.fx.addShake(1.2 * prox + 0.2);
    this.flash(x, y + 4, z, 0xffa050, 12000, 1.2, 120);
    for (let i = 0; i < 3; i++) this.sound('random.explode', x, y, z, 10, 0.35 + i * 0.1);
    this.sound('weather.thunder.near', x, y + 10, z, 6, 0.5);
    this.game.particles?.emit?.('explosion', [x, y + 2, z], { power: 10 });
    try {
      (this.game as any).explosions?.explode?.({ x, y: y + 1, z }, 5, { breakBlocks: false, debris: false });
    } catch { /* optional */ }
    for (let i = 0; i < 18; i++) this.launchBomb(true);
    try {
      const a = this.game.audio;
      if (a?.loop) {
        this.loops.push(a.loop('loop.lava', { pos: { x, y, z }, volume: 3, pitch: 0.7 }));
        this.roar = a.loop('loop.fire', { pos: { x, y: y + 6, z }, volume: 6, pitch: 0.45 });
        this.loops.push(this.roar!);
        this.loops.push(a.loop('loop.wind', { pos: { x, y: y + 20, z }, volume: 4, pitch: 0.5 }));
      }
    } catch { /* optional */ }
    this.game.message?.('The volcano is erupting!', '#ff7040');
  }

  private tickEruption() {
    const pl = this.plan;
    const t = this.pt;
    // intensity: quick onset, pulsing plateau, decay at the end
    const onset = Math.min(1, t / 3);
    const decay = Math.min(1, Math.max(0, (ERUPT_S - t) / 10));
    this.intensity = onset * decay * (0.8 + 0.2 * Math.sin(t * 0.9) * Math.sin(t * 0.37));
    const prox = this.proximity();
    this.fx.addShake((0.1 + 0.35 * prox) * this.intensity);
    this.roar?.setVolume(6 * this.intensity + 0.5);
    // bombs
    this.bombAcc += 0.05 * (1.6 * this.intensity);
    while (this.bombAcc >= 1) {
      this.bombAcc -= 1;
      this.launchBomb(false);
    }
    // vulcanian blasts
    if (t >= this.nextBlast && t < ERUPT_S - 6) {
      this.nextBlast = t + 6 + rnd() * 6;
      this.blast();
    }
    this.tickBombs();
    // lava flows
    for (let i = 0; i + 1 < this.flowPlan.length; i += 2) {
      if (this.flowPlan[i] >= 0 && t >= this.flowPlan[i]) {
        this.flowPlan[i] = -1;
        this.startFlow(this.flowPlan[i + 1]);
      }
    }
    const deadline = now() + 2.5;
    for (const fl of this.flows) {
      if (!fl.alive) continue;
      if (this.ticks >= fl.next) this.stepFlow(fl);
      if (now() > deadline) break;
    }
    // surges
    for (let i = this.surges.length - 1; i >= 0; i--) {
      const s = this.surges[i];
      s.r += s.speed * 0.05;
      s.life -= 0.05;
      if (s.life <= 0 || s.r > pl.R * 1.15) this.surges.splice(i, 1);
      else this.surgeDamage(s);
    }
  }

  private blast() {
    const pl = this.plan;
    const x = pl.cx + 0.5, y = pl.lakeY + 2, z = pl.cz + 0.5;
    const prox = this.proximity();
    this.flash(x, y + 6, z, 0xffa050, 9000, 0.9, 110);
    this.fx.addShake(0.9 * prox + 0.15);
    if (prox > 0.6) this.fx.flash(0.25 * prox, 0xffb080);
    this.sound('random.explode', x, y, z, 8, 0.4 + rnd() * 0.15);
    this.sound('weather.thunder.near', x, y + 10, z, 4, 0.45);
    this.game.particles?.emit?.('explosion', [x, y + 1, z], { power: 8 });
    const n = 8 + Math.floor(rnd() * 9);
    for (let i = 0; i < n; i++) this.launchBomb(true);
    if (rnd() < 0.65) this.surges.push({ a: rnd() * Math.PI * 2, r: pl.craterR, speed: 10 + rnd() * 6, life: 7 });
  }

  // --------------------------------------------------------------------------- bombs
  private launchBomb(big: boolean) {
    if (this.bombs.length >= MAX_BOMBS) return;
    const pl = this.plan;
    const a = rnd() * Math.PI * 2;
    const r0 = rnd() * pl.craterR * 0.5;
    const elev = (big ? 0.95 : 1.0) + rnd() * 0.45; // 54..83 degrees
    const speed = (big ? 26 : 18) + rnd() * (big ? 24 : 18);
    const az = a + (rnd() - 0.5) * 0.6;
    const vh = Math.cos(elev) * speed;
    const b: Bomb = {
      x: pl.cx + 0.5 + Math.cos(a) * r0, y: pl.lakeY + 1.5, z: pl.cz + 0.5 + Math.sin(a) * r0,
      px: 0, py: 0, pz: 0,
      vx: Math.cos(az) * vh, vy: Math.sin(elev) * speed, vz: Math.sin(az) * vh,
      r: (big ? 0.55 : 0.3) + rnd() * (big ? 0.55 : 0.3),
      heat: 1, seed: rnd() * 10, trail: 0, age: 0, dead: false,
    };
    b.px = b.x; b.py = b.y; b.pz = b.z;
    this.bombs.push(b);
    this.stats.bombsLaunched++;
  }

  /** 20 Hz ballistic integration with swept block collision. */
  private tickBombs() {
    const w = this.game.world;
    const dt = 0.05;
    for (let i = this.bombs.length - 1; i >= 0; i--) {
      const b = this.bombs[i];
      b.px = b.x; b.py = b.y; b.pz = b.z;
      b.age += dt;
      b.heat = Math.max(0.15, 1 - b.age * 0.12);
      const nx = b.x + b.vx * dt, ny = b.y + b.vy * dt - 0.5 * GRAVITY * dt * dt, nz = b.z + b.vz * dt;
      b.vy -= GRAVITY * dt;
      b.vx *= 0.998; b.vz *= 0.998;
      const len = Math.hypot(nx - b.x, ny - b.y, nz - b.z);
      const steps = Math.max(1, Math.ceil(len / 0.4));
      let hit = false;
      for (let s = 1; s <= steps; s++) {
        const k = s / steps;
        const qx = b.x + (nx - b.x) * k, qy = b.y + (ny - b.y) * k, qz = b.z + (nz - b.z) * k;
        if (qy < 0) { hit = true; break; }
        // leave the crater before colliding (it launches from inside the lava lake)
        if (b.age < 0.6 && b.vy > 0) continue;
        const st = w.getBlock(Math.floor(qx), Math.floor(qy - b.r * 0.5), Math.floor(qz));
        if (!st) continue;
        const c = blockClass(st);
        if (c >= ERODIBLE || (c === WEAK && rnd() < 0.3)) {
          b.x = qx; b.y = qy; b.z = qz;
          hit = true;
          break;
        }
      }
      if (hit) this.bombImpact(b);
      else {
        b.x = nx; b.y = ny; b.z = nz;
        if (b.age > 20 || (b.vy < 0 && b.y < this.plan.baseY - 40)) b.dead = true;
      }
      if (b.dead) this.bombs.splice(i, 1);
    }
  }

  private bombImpact(b: Bomb) {
    b.dead = true;
    this.stats.bombsLanded++;
    const g = this.game;
    const w = g.world;
    const bx = Math.floor(b.x), by = Math.floor(b.y), bz = Math.floor(b.z);
    const st = w.getBlock(bx, by, bz);
    const big = b.r > 0.65;
    const sys = this.sys;
    const P = g.particles;
    const pp = g.player?.pos;
    const pd = pp ? Math.hypot(pp.x - b.x, pp.y - b.y, pp.z - b.z) : 999;
    // into a liquid: steam / lava plop
    if (st && blockClass(st) === LIQUID) {
      if (st >>> 4 === S('water') >>> 4) {
        P?.emit?.('water_splash', [b.x, by + 1, b.z], { intensity: 2 });
        if (sys) for (let k = 0; k < 10; k++) sys.spawn(PT.steam, b.x + (rnd() - 0.5) * 2, by + 1, b.z + (rnd() - 0.5) * 2, 0, 1.5 + rnd() * 2, 0);
        this.sound('random.fizz', b.x, by, b.z, 1.5, 0.8);
        const gy = groundTop(w, bx, bz);
        if (gy >= 0 && gy + 1 < by) this.bulk.set(bx, gy + 1, bz, this.rock(rnd() < 0.5 ? 'basalt' : 'blackstone'));
      } else {
        P?.burst?.('lava_pop', [b.x, by + 1, b.z], 12, { speed: 5, size: 2 });
        this.sound('liquid.lavapop', b.x, by, b.z, 2, 0.8);
      }
      return;
    }
    // splash: glowing droplets, flames, smoke, dust of the struck block
    if (P) {
      P.flash?.(b.x, b.y + 1, b.z, 0xff7a30, big ? 900 : 350, 0.5, big ? 18 : 10);
      P.burst?.('lava_pop', [b.x, b.y + 0.6, b.z], big ? 26 : 14, { speed: big ? 8 : 6, spread: 0.4, size: 2.2, vel: [0, 5, 0] });
      P.burst?.('flame', [b.x, b.y + 0.4, b.z], big ? 14 : 8, { speed: 1.5, spread: 0.8, size: 3 });
      P.emit?.('large_smoke', [b.x, b.y + 0.8, b.z], { count: big ? 6 : 3, spread: 0.8, vel: [0, 1.6, 0], size: 2.5 });
      P.emit?.('ember', [b.x, b.y + 0.5, b.z], { count: 10, speed: 4, spread: 0.5, vel: [0, 3, 0] });
      if (st) P.emit?.('block_dust', [b.x, b.y + 0.3, b.z], { state: st, count: 4, size: 2, speed: 2 });
    }
    this.sound(big ? 'random.explode' : 'liquid.lavapop', b.x, b.y, b.z, big ? 2.5 : 1.6, big ? 1.4 + rnd() * 0.3 : 0.7);
    if (pd < 20) this.fx.addShake((big ? 0.6 : 0.3) * (1 - pd / 20));
    // explosive bombs (rate limited, only where someone can see it)
    if (big && pd < 96 && this.ticks - this.lastExplodeTick >= 3) {
      this.lastExplodeTick = this.ticks;
      try {
        (g as any).explosions?.explode?.({ x: b.x, y: b.y + 0.3, z: b.z }, 1.6 + rnd() * 0.8, { fire: true });
      } catch { /* optional */ }
    }
    // splat: magma, lava, blackstone; burn plants; set fires
    const R = big ? 2 : 1;
    const lava = S('lava'), fire = S('fire');
    for (let dz = -R; dz <= R; dz++)
      for (let dx = -R; dx <= R; dx++) {
        if (dx * dx + dz * dz > R * R + 0.5) continue;
        const x = bx + dx, z = bz + dz;
        const gy = groundTop(w, x, z);
        if (gy < 0 || Math.abs(gy - by) > 4) continue;
        for (let y = gy + 1; y <= gy + 3; y++) {
          const s2 = w.getBlock(x, y, z);
          if (s2 && blockClass(s2) === WEAK) this.bulk.set(x, y, z, 0);
        }
        const centre = dx === 0 && dz === 0;
        const h = rnd();
        if (centre) this.bulk.set(x, gy, z, this.rock(big || h < 0.5 ? 'magma_block' : 'blackstone'));
        else if (h < 0.35) this.bulk.set(x, gy, z, this.rock(h < 0.12 ? 'magma_block' : 'blackstone'));
        if (centre && big && rnd() < 0.5) this.bulk.set(x, gy + 1, z, lava);
        else if (!centre && rnd() < 0.3 && w.getBlock(x, gy + 1, z) === 0 && (isFlammable(w.getBlock(x, gy, z)) || rnd() < 0.4)) {
          w.setBlock(x, gy + 1, z, fire, SetFlags.ALL);
        }
      }
    // ignite nearby flammable blocks (trees, houses)
    for (let k = 0; k < 6; k++) {
      const x = bx + Math.floor((rnd() - 0.5) * 7), y = by + Math.floor(rnd() * 4), z = bz + Math.floor((rnd() - 0.5) * 7);
      if (w.getBlock(x, y, z) !== 0) continue;
      for (const [ox, oy, oz] of NEAR5) {
        if (isFlammable(w.getBlock(x + ox, y + oy, z + oz))) {
          w.setBlock(x, y, z, fire, SetFlags.ALL);
          break;
        }
      }
    }
    // burn entities
    for (const e of g.entities?.list ?? []) {
      const ent = e as any;
      if (ent.removed || typeof ent.hurt !== 'function') continue;
      if (Math.hypot(ent.pos.x - b.x, ent.pos.y - b.y, ent.pos.z - b.z) > R + 1.5) continue;
      ent.hurt({ type: 'lava', fire: true }, big ? 8 : 5);
      ent.fireTicks = Math.max(ent.fireTicks ?? 0, 120);
    }
  }

  // --------------------------------------------------------------------------- flows
  private startFlow(a: number) {
    const pl = this.plan;
    const ca = Math.cos(a), sa = Math.sin(a);
    // spillway from the lake over the rim
    const lava = S('lava');
    let x = pl.cx, z = pl.cz;
    // cut a notch through the rim until the outer flank drops below the lake surface
    for (let r = pl.craterR - 2; r <= pl.craterR + 16; r++) {
      x = Math.round(pl.cx + ca * r);
      z = Math.round(pl.cz + sa * r);
      const gy = groundTop(this.game.world, x, z);
      if (gy < 0) return;
      if (gy >= pl.lakeY) {
        for (let y = pl.lakeY + 1; y <= gy; y++) this.bulk.set(x, y, z, 0);
        this.bulk.set(x, pl.lakeY, z, lava);
        this.lavaCells.push(x, pl.lakeY, z);
      } else if (r > pl.craterR) {
        this.bulk.set(x, gy + 1, z, lava);
        this.lavaCells.push(x, gy + 1, z);
        if (gy < pl.lakeY - 1) break;
      }
    }
    const fl: Flow = {
      x, z, dirX: ca, dirZ: sa, visited: new Set([key2(x, z)]), next: this.ticks + 2, len: 0,
      maxLen: Math.round(pl.R * 1.7 + 30), flats: 0, quench: 0, seed: Math.floor(rnd() * 1e6), alive: true, width: 0.75,
    };
    this.flows.push(fl);
    this.sound('liquid.lavapop', x, pl.lakeY, z, 3, 0.5);
  }

  private stepFlow(fl: Flow) {
    const w = this.game.world;
    const n = nextFlowCell((x, z) => this.topAt(x, z), fl.x, fl.z, fl.dirX, fl.dirZ, (x, z) => fl.visited.has(key2(x, z)), fl.seed, fl.len);
    if (!n || fl.len >= fl.maxLen || !w.isLoaded(n[0], n[1])) {
      fl.alive = false;
      return;
    }
    const h0 = this.topAt(fl.x, fl.z);
    const [nx, nz] = n;
    const h1 = this.topAt(nx, nz);
    const drop = h0 - h1;
    fl.flats = drop <= 0 ? fl.flats + 1 : 0;
    if (fl.flats > 12) {
      fl.alive = false;
      return;
    }
    fl.dirX = fl.dirX * 0.6 + (nx - fl.x) * 0.4;
    fl.dirZ = fl.dirZ * 0.6 + (nz - fl.z) * 0.4;
    fl.x = nx;
    fl.z = nz;
    fl.len++;
    fl.visited.add(key2(nx, nz));
    const cont = this.placeFlowCell(fl, nx, nz, true);
    // widen sideways while the flow is young and voluminous
    if (cont && rnd() < fl.width * (1 - fl.len / fl.maxLen)) {
      const px = Math.round(-fl.dirZ), pz = Math.round(fl.dirX);
      const s = rnd() < 0.5 ? 1 : -1;
      const sx = nx + px * s, sz = nz + pz * s;
      if (!fl.visited.has(key2(sx, sz)) && this.topAt(sx, sz) <= h1) {
        fl.visited.add(key2(sx, sz));
        this.placeFlowCell(fl, sx, sz, false);
      }
    }
    // steep slopes run fast, flats creep
    fl.next = this.ticks + (drop >= 2 ? 2 : drop === 1 ? 3 : 6);
    if (!cont) fl.alive = false;
  }

  /** Lava (or quenched rock) on the ground at a column. Returns false when the flow should stop. */
  private placeFlowCell(fl: Flow, x: number, z: number, front: boolean): boolean {
    const w = this.game.world;
    const g = this.topAt(x, z);
    if (g < 0) return false;
    const y = g + 1;
    const above = w.getBlock(x, y, z);
    const water = S('water') >>> 4;
    const P = this.game.particles;
    const sys = this.sys;
    if (above >>> 4 === water) {
      // a lava delta: rock builds up to the water surface, obsidian crust on top
      const top = liquidTop(w, x, z, g);
      for (let yy = Math.max(y, top - 5); yy < top; yy++) this.bulk.set(x, yy, z, this.rock(yy === top - 1 ? 'basalt' : 'blackstone'));
      if (top >= 0) {
        this.bulk.set(x, top, z, S('obsidian'));
        if (front || rnd() < 0.3) {
          if (sys) for (let k = 0; k < 8; k++) sys.spawn(PT.steam, x + rnd(), top + 1.2, z + rnd(), rnd() - 0.5, 2 + rnd() * 2, rnd() - 0.5);
          this.sound('random.fizz', x, top, z, 1.2, 0.7 + rnd() * 0.3);
        }
      }
      this.stats.quenched++;
      return ++fl.quench < 30;
    }
    // burn vegetation in the way
    for (let yy = y; yy < y + 6; yy++) {
      const s2 = w.getBlock(x, yy, z);
      if (!s2 || blockClass(s2) !== WEAK) break;
      this.bulk.set(x, yy, z, 0);
    }
    // touching water: quench into obsidian
    let quench = w.getBlock(x, y + 1, z) >>> 4 === water;
    for (const [dx, dz] of H4) if (!quench && w.getBlock(x + dx, y, z + dz) >>> 4 === water) quench = true;
    if (quench) {
      this.bulk.set(x, y, z, S('obsidian'));
      if (sys) for (let k = 0; k < 6; k++) sys.spawn(PT.steam, x + rnd(), y + 1.1, z + rnd(), 0, 1.5 + rnd() * 2, 0);
      this.sound('random.fizz', x, y, z, 1, 0.8);
      this.stats.quenched++;
      return ++fl.quench < 30;
    }
    if (this.bulk.set(x, y, z, S('lava'))) {
      this.lavaCells.push(x, y, z);
      this.stats.flowCells++;
    }
    // set fire to flammable neighbours
    if (rnd() < 0.25) {
      const fire = S('fire');
      for (const [dx, dz] of H4) {
        const st = w.getBlock(x + dx, y, z + dz);
        if (st === 0) {
          if (isFlammable(w.getBlock(x + dx, y - 1, z + dz))) w.setBlock(x + dx, y, z + dz, fire, SetFlags.ALL);
        } else if (blockClass(st) === WEAK && st >>> 4 !== fire >>> 4) {
          this.bulk.set(x + dx, y, z + dz, 0);
          if (w.getBlock(x + dx, y - 1, z + dz)) w.setBlock(x + dx, y, z + dz, fire, SetFlags.ALL);
        }
      }
    }
    if (front) {
      if (sys) {
        sys.spawn(PT.smoke, x + 0.5, y + 1, z + 0.5, 0, 1.5, 0);
        for (let k = 0; k < 3; k++) sys.spawn(PT.lava_pop, x + rnd(), y + 0.9, z + rnd(), (rnd() - 0.5) * 2, 3 + rnd() * 3, (rnd() - 0.5) * 2);
      }
      if (rnd() < 0.25) P?.flash?.(x + 0.5, y + 1.5, z + 0.5, 0xff6a20, 160, 0.6, 9);
      if (rnd() < 0.12) this.sound('liquid.lavapop', x, y, z, 1.2, 0.8 + rnd() * 0.3);
    }
    return true;
  }

  private surgeDamage(s: Surge) {
    const pl = this.plan;
    const x = pl.cx + Math.cos(s.a) * s.r, z = pl.cz + Math.sin(s.a) * s.r;
    for (const e of this.game.entities?.list ?? []) {
      const ent = e as any;
      if (ent.removed || typeof ent.hurt !== 'function') continue;
      if (Math.hypot(ent.pos.x - x, ent.pos.z - z) > 7) continue;
      ent.hurt({ type: 'fire', fire: true }, 3);
      ent.fireTicks = Math.max(ent.fireTicks ?? 0, 100);
      if (ent.vel) {
        ent.vel.x += Math.cos(s.a) * 4;
        ent.vel.z += Math.sin(s.a) * 4;
      }
    }
  }

  // --------------------------------------------------------------------------- aftermath
  private tickCooling() {
    // crust the flows over during the aftermath (oldest first): basalt with glowing magma
    const n = this.lavaCells.length / 3;
    const per = Math.max(4, Math.ceil(n / ((SMOKE_S - 8) * 20)));
    const w = this.game.world;
    const lavaId = S('lava') >>> 4;
    const sys = this.sys;
    for (let k = 0; k < per && this.coolCursor < n; k++, this.coolCursor++) {
      const i = this.coolCursor * 3;
      const x = this.lavaCells[i], y = this.lavaCells[i + 1], z = this.lavaCells[i + 2];
      if (w.getBlock(x, y, z) >>> 4 !== lavaId) continue;
      const h = hash3(x, y, z, this.plan.seed + 11);
      this.bulk.set(x, y, z, this.rock(h < 0.62 ? 'basalt' : h < 0.8 ? 'magma_block' : h < 0.92 ? 'blackstone' : 'smooth_basalt'));
      if (sys && rnd() < 0.15) sys.spawn(PT.steam, x + 0.5, y + 1.1, z + 0.5, 0, 0.8, 0);
    }
  }

  // =========================================================================== frame
  update(game: Game, dt: number) {
    if (game.paused) return;
    dt = Math.min(dt, 0.1);
    this.time += dt;
    this.tickFrac = Math.min(1, this.tickFrac + dt / 0.05);
    const pl = this.plan;
    const sys = this.sys;
    const cx = pl.cx + 0.5, cz = pl.cz + 0.5;
    const erupting = this.phase === 'erupt';
    const I = erupting ? this.intensity : 0;
    const prox = this.proximity();
    // ---- crater glow (sustained flickering light while the lake exists)
    if (this.lakeFilled && (this.acc.glow -= dt) <= 0) {
      this.acc.glow = 0.12;
      const k = erupting ? 0.6 + I : 0.3;
      this.flash(cx, pl.lakeY + 3, cz, 0xff5a18, (1800 + rnd() * 900) * k, 0.3, 40 + 50 * k);
    }
    // ---- sky tint
    if (erupting) this.fx.requestTint(0.3, 0.1, 0.03, 0.22 * prox * Math.min(1, I + 0.2));
    else if (this.phase === 'smoke') this.fx.requestTint(0.25, 0.15, 0.1, 0.08 * prox * Math.max(0, 1 - this.pt / SMOKE_S));
    if (sys) {
      if (this.phase === 'rise' && (this.acc.dust += dt * 30) >= 1) {
        // steam on the growing summit, dust at the heaving foot
        const n = Math.floor(this.acc.dust);
        this.acc.dust -= n;
        const f = riseProgress(this.ticks * 0.05, RISE_S);
        for (let k = 0; k < n; k++) {
          const a = rnd() * Math.PI * 2, summit = rnd() < 0.5;
          const r = summit ? rnd() * pl.craterR * 2 : pl.R * (0.6 + rnd() * 0.4);
          const x = cx + Math.cos(a) * r, z = cz + Math.sin(a) * r;
          if (summit) sys.spawn(PT.steam, x, pl.baseY + pl.H * f + 1, z, 0, 2 + rnd() * 3, 0);
          else {
            const i = sys.spawn(PT.dust, x, pl.baseY + 2, z, (rnd() - 0.5) * 3, 0.5 + rnd(), (rnd() - 0.5) * 3);
            if (i >= 0) { sys.lp.size[i] *= 4; sys.lp.life[i] *= 2; sys.tint(i, 0.35, 0.32, 0.3); }
          }
        }
      }
      if (erupting) this.eruptionFx(dt, I, prox);
      if (this.phase === 'smoke' || this.phase === 'pause') {
        const rate = this.phase === 'pause' ? 30 : 9 * (1 - 0.6 * this.pt / SMOKE_S);
        if ((this.acc.smoke += dt * rate) >= 1) {
          const n = Math.floor(this.acc.smoke);
          this.acc.smoke -= n;
          for (let k = 0; k < n; k++) {
            const i = sys.spawn(PT.campfire_smoke, cx + (rnd() - 0.5) * pl.craterR, pl.lakeY + 2, cz + (rnd() - 0.5) * pl.craterR, 0, 2 + rnd() * 2, 0);
            if (i >= 0) { sys.lp.size[i] *= 7; sys.lp.life[i] *= 1.3; }
          }
        }
      }
    }
    // ---- bombs: render interpolated between ticks, fire trails
    const views = this.views;
    views.length = 0;
    const a = this.tickFrac;
    for (const b of this.bombs) {
      const x = b.px + (b.x - b.px) * a, y = b.py + (b.y - b.py) * a, z = b.pz + (b.z - b.pz) * a;
      views.push({ x, y, z, r: b.r, heat: b.heat, seed: b.seed });
      if (!sys) continue;
      b.trail += dt * 30;
      while (b.trail >= 1) {
        b.trail -= 1;
        let i = sys.spawn(PT.flame, x + (rnd() - 0.5) * b.r, y + (rnd() - 0.5) * b.r, z + (rnd() - 0.5) * b.r, 0, 0, 0);
        if (i >= 0) sys.lp.size[i] *= 3 + b.r * 4;
        if (rnd() < 0.45) {
          i = sys.spawn(PT.large_smoke, x, y, z, 0, 0.5, 0);
          if (i >= 0) { sys.lp.size[i] *= 1.5 + b.r * 2; sys.lp.life[i] *= 1.5; }
        }
        if (rnd() < 0.25) sys.spawn(PT.ember, x, y, z, (rnd() - 0.5) * 2, (rnd() - 0.5) * 2, (rnd() - 0.5) * 2);
      }
    }
    this.bombR?.update(views, this.time);
    this.boltR?.update(dt);
  }

  private eruptionFx(dt: number, I: number, prox: number) {
    const pl = this.plan;
    const sys = this.sys;
    const cx = pl.cx + 0.5, cz = pl.cz + 0.5;
    const ventY = pl.lakeY + 1.5;
    const plumeH = 60 + 30 * I;
    // ---- vent jet: glowing core and dense smoke shooting up into the column
    if ((this.acc.vent += dt * 26 * I) >= 1) {
      const n = Math.floor(this.acc.vent);
      this.acc.vent -= n;
      for (let k = 0; k < n; k++) {
        const r = rnd() * pl.craterR * 0.4, a = rnd() * Math.PI * 2;
        const x = cx + Math.cos(a) * r, z = cz + Math.sin(a) * r;
        let i = sys.spawn(PT.explosion_smoke, x, ventY + rnd() * 3, z, (rnd() - 0.5) * 3, 22 + rnd() * 16, (rnd() - 0.5) * 3);
        if (i >= 0) { sys.lp.size[i] *= 3.5 + rnd() * 2; sys.lp.life[i] *= 2.2; }
        if (rnd() < 0.5) {
          i = sys.spawn(PT.explosion_fire, x, ventY + rnd() * 2, z, (rnd() - 0.5) * 4, 10 + rnd() * 14, (rnd() - 0.5) * 4);
          if (i >= 0) { sys.lp.size[i] *= 3 + rnd() * 2; sys.lp.life[i] *= 1.6; }
        }
      }
    }
    // ---- column and umbrella: billowing puffs placed along the plume (wind bends it)
    if ((this.acc.plume += dt * 34 * I) >= 1) {
      const n = Math.floor(this.acc.plume);
      this.acc.plume -= n;
      for (let k = 0; k < n; k++) {
        const h = Math.pow(rnd(), 0.75);
        const umbrella = h > 0.82;
        const rad = umbrella ? 10 + rnd() * 30 : 3 + h * 16;
        const a = rnd() * Math.PI * 2;
        const rr = Math.sqrt(rnd()) * rad;
        const x = cx + Math.cos(a) * rr, z = cz + Math.sin(a) * rr;
        const y = ventY + 8 + h * plumeH + (umbrella ? (rnd() - 0.3) * 8 : 0);
        const out = umbrella ? 3 + rnd() * 4 : 0.5 + rnd() * 1.5;
        const i = sys.spawn(PT.explosion_smoke, x, y, z, Math.cos(a) * out, umbrella ? 0.3 : 3 + (1 - h) * 6, Math.sin(a) * out);
        if (i >= 0) {
          sys.lp.size[i] *= 4 + h * 6 + (umbrella ? 3 : 0);
          sys.lp.life[i] *= 2.4;
          const g = 0.035 + 0.04 * h + rnd() * 0.02;
          sys.tint(i, g * 1.05, g, g * 0.95);
        }
      }
    }
    // ---- lava fountains from three vents in the lake
    if ((this.acc.fountain += dt * 70 * (0.4 + I)) >= 1) {
      const n = Math.floor(this.acc.fountain);
      this.acc.fountain -= n;
      for (let k = 0; k < n; k++) {
        const v = k % 3;
        const va = v * 2.1 + pl.seed;
        const vx = cx + Math.cos(va) * pl.craterR * 0.45, vz = cz + Math.sin(va) * pl.craterR * 0.45;
        const pulse = 0.6 + 0.4 * Math.sin(this.time * (2 + v) + v);
        const i = sys.spawn(PT.lava_pop, vx + (rnd() - 0.5), ventY - 0.5, vz + (rnd() - 0.5), (rnd() - 0.5) * 6, (12 + rnd() * 14) * pulse, (rnd() - 0.5) * 6);
        if (i >= 0) { sys.lp.size[i] *= 4 + rnd() * 3; sys.lp.life[i] *= 1.4; }
        if (rnd() < 0.3) {
          const j = sys.spawn(PT.flame, vx + (rnd() - 0.5) * 2, ventY, vz + (rnd() - 0.5) * 2, 0, 2 + rnd() * 3, 0);
          if (j >= 0) sys.lp.size[j] *= 8;
        }
        if (rnd() < 0.3) sys.spawn(PT.ember, vx, ventY + 1, vz, (rnd() - 0.5) * 6, 5 + rnd() * 8, (rnd() - 0.5) * 6);
      }
    }
    // ---- pyroclastic surges racing down the flanks
    for (const s of this.surges) {
      const x = cx + Math.cos(s.a) * s.r, z = cz + Math.sin(s.a) * s.r;
      const gy = this.builtTop(Math.floor(x), Math.floor(z));
      const base = gy >= 0 ? gy : pl.baseY;
      const m = Math.max(1, Math.round(dt * 40));
      for (let k = 0; k < m; k++) {
        const sp = (rnd() - 0.5) * 8;
        const ox = x - Math.sin(s.a) * sp, oz = z + Math.cos(s.a) * sp;
        let i = sys.spawn(PT.explosion_smoke, ox, base + 1 + rnd() * 3, oz, Math.cos(s.a) * s.speed * 0.6, 1 + rnd() * 2, Math.sin(s.a) * s.speed * 0.6);
        if (i >= 0) { sys.lp.size[i] *= 3 + rnd() * 3; sys.lp.life[i] *= 1.5; sys.tint(i, 0.09, 0.075, 0.065); }
        if (rnd() < 0.35) {
          i = sys.spawn(PT.explosion_fire, ox, base + 1, oz, Math.cos(s.a) * s.speed * 0.5, 1, Math.sin(s.a) * s.speed * 0.5);
          if (i >= 0) sys.lp.size[i] *= 2.5;
        }
      }
      if (rnd() < dt * 8) this.flash(x, base + 2, z, 0xff8040, 500, 0.4, 16);
    }
    // ---- lightning in the plume
    if ((this.acc.bolt -= dt) <= 0 && this.boltR) {
      this.acc.bolt = 0.35 + rnd() * (2.6 - 1.6 * I);
      const h0 = 0.25 + rnd() * 0.6;
      const ax = cx + (rnd() - 0.5) * 18, ay = ventY + 8 + h0 * plumeH, az = cz + (rnd() - 0.5) * 18;
      let bx: number, by: number, bz: number;
      if (rnd() < 0.18) {
        // down to the flank
        const a = rnd() * Math.PI * 2, r = pl.craterR + rnd() * pl.R * 0.5;
        bx = cx + Math.cos(a) * r;
        bz = cz + Math.sin(a) * r;
        by = Math.max(pl.baseY, this.builtTop(Math.floor(bx), Math.floor(bz)) + 1);
      } else {
        bx = ax + (rnd() - 0.5) * 30;
        by = ay - 6 - rnd() * 18;
        bz = az + (rnd() - 0.5) * 30;
      }
      this.boltR.strike(ax, ay, az, bx, by, bz, 0.25 + rnd() * 0.2);
      this.flash((ax + bx) / 2, (ay + by) / 2, (az + bz) / 2, 0xc8d8ff, 5000, 0.25, 70);
      const p = this.game.player?.pos;
      const d = p ? Math.hypot(p.x - ax, p.y - ay, p.z - az) : 200;
      this.thunder.push({ t: d / 340, near: d < 90, x: ax, y: ay, z: az });
    }
    // ---- ash fall around the player
    const cam = this.game.player?.pos;
    if (cam && prox > 0.05 && (this.acc.ash += dt * 140 * prox * I) >= 1) {
      const n = Math.floor(this.acc.ash);
      this.acc.ash -= n;
      for (let k = 0; k < n; k++) {
        const a = rnd() * Math.PI * 2, r = Math.sqrt(rnd()) * 16;
        sys.spawn(rnd() < 0.85 ? PT.ash : PT.white_ash, cam.x + Math.cos(a) * r, cam.y + 3 + rnd() * 10, cam.z + Math.sin(a) * r, 0, -0.6, 0);
      }
    }
  }

  dispose() {
    this.bulk.end();
    for (const l of this.loops) l.stop(1);
    this.loops.length = 0;
    this.roar = null;
    this.layer?.dispose();
    this.layer = this.bombR = this.boltR = null;
    this.bombs.length = 0;
    this.flows.length = 0;
    this.surges.length = 0;
    this.thunder.length = 0;
  }
}

const H4: [number, number][] = [[1, 0], [-1, 0], [0, 1], [0, -1]];
const NEAR5: [number, number, number][] = [[1, 0, 0], [-1, 0, 0], [0, 0, 1], [0, 0, -1], [0, -1, 0]];

registerDisaster('volcano', (ctx) => new Volcano(ctx));
