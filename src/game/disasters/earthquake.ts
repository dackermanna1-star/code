/**
 * EARTHQUAKE: a violent quake centred on the spawner block (about 25 s).
 *
 *  - foreshock rumble, a main shock with heavy camera shake felt to ~100 blocks, aftershocks.
 *  - jagged fissures (branching, 2-6 wide, 10-30 deep) open progressively along noisy paths
 *    radiating 40-60 blocks out, with dust plumes, crumbling edges and things above them
 *    falling in; the deepest crack may glow with lava at its bottom.
 *  - a fault scarp: one side of the main rupture is uplifted by up to 3 blocks, carrying
 *    everything on it (trees, houses) up with the ground.
 *  - unsupported blocks collapse: trees topple (whole-tree rigid fall, placed lying down),
 *    structures shed blocks from the top, glass shatters, sand and gravel slide and fall.
 *  - entities are jostled; items, mobs and physics bodies bounce.
 *
 * All world edits go through BulkEdit and a per-tick time budget (a few ms).
 */
import * as THREE from 'three';
import type { Game } from '../game';
import { registerDisaster, BulkEdit, S, type Disaster, type DisasterContext } from './kit';
import { BLOCKS, T_FULL_CUBE, T_SOLID, T_LIQUID } from '../../world/blocks/registry';
import { FallingBlockEntity } from '../../entity/fallingBlock';
import type { PhysicsWorld } from '../../physics/rapierWorld';
import { Mat, matOf, fragility } from './wind/materials';
import { defaultTimeline, quakeIntensity, shakeFalloff, planFissures, planFault, rngOf, type QuakeTimeline, type FissurePlan, type FaultPlan, type CarveCol, type FaultCol } from './quake/plan';
import { findTree, ToppleTree } from './quake/topple';

const TICK = 0.05;

export interface QuakeOptions {
  seed?: number;
  effects?: DisasterContext['effects'];
  /** Per-tick time budget for world edits (ms). */
  budgetMs?: number;
}

/** Column scan: topmost block, ground surface (first natural ground/rock from the top). */
interface ColumnInfo {
  top: number;
  ground: number;
  wet: boolean;
}

export class Earthquake implements Disaster {
  readonly name = 'earthquake';
  readonly seed: number;
  readonly tl: QuakeTimeline;
  readonly fissures: FissurePlan;
  readonly fault: FaultPlan;
  readonly x: number;
  readonly y: number;
  readonly z: number;
  t = 0;
  private ticks = 0;
  private rnd: () => number;
  private edit: BulkEdit;
  private budgetMs: number;
  private fx: DisasterContext['effects'] | null;
  // work queues
  private ci = 0;
  private faultStep = 0;
  private fi = 0;
  private lava: boolean;
  private lavaCols: CarveCol[] = [];
  // collapse
  private topples: ToppleTree[] = [];
  private toppled = 0;
  private fallers: FallingBlockEntity[] = [];
  readonly scene = new THREE.Scene();
  // fx
  private loops: { rumble: any; sub: any } | null = null;
  private boomed = false;
  private afterBoom = 0;
  private sounds = 0;
  private disposed = false;
  private framed = false;
  private deadline = 0;
  private toppledThisTick = false;
  private spawnedThisTick = 0;
  /** Counters (tests / debug). */
  readonly stats = { carved: 0, edges: 0, lifted: 0, toppled: 0, fell: 0, shattered: 0, maxTickMs: 0, blocks: 0 };

  constructor(readonly game: Game, x: number, y: number, z: number, fx: number, fz: number, o: QuakeOptions = {}) {
    this.seed = o.seed ?? ((Math.random() * 1e9) | 0);
    this.rnd = rngOf(this.seed);
    this.x = x;
    this.y = y;
    this.z = z;
    this.fx = o.effects ?? null;
    this.budgetMs = o.budgetMs ?? 5;
    this.tl = defaultTimeline(this.rnd);
    // the main rupture runs across the player's view so the scarp is visible
    const heading = Math.atan2(fz, fx) + Math.PI / 2 + (this.rnd() - 0.5) * 0.6;
    this.lava = this.rnd() < 0.7;
    this.fissures = planFissures(this.seed, x, z, { heading, lava: this.lava });
    this.fault = planFault(this.seed + 1, x, z, heading, { maxLift: 2 + (this.rnd() < 0.6 ? 1 : 0) });
    this.edit = new BulkEdit(game);
    this.scene.matrixWorldAutoUpdate = true;
    const ex = game.renderExtras;
    if (ex && game.renderer) {
      (ex.gbuffer ??= []).push(this.scene);
      (ex.shadow ??= []).push(this.scene);
    }
  }

  get done() {
    return this.ci >= this.fissures.cols.length && this.faultStep >= this.fault.maxLift;
  }

  // ------------------------------------------------------------------------- tick
  tick(game: Game): boolean {
    if (this.disposed) return false;
    const t0 = performance.now();
    this.ticks++;
    this.t = this.ticks * TICK;
    const I = quakeIntensity(this.t, this.tl);
    const deadline = (this.deadline = t0 + this.budgetMs);
    this.toppledThisTick = false;
    this.spawnedThisTick = 0;
    const w = game.world;
    if (w) {
      this.edit.begin();
      try {
        const tm = this.t - this.tl.main;
        // fault scarp first (one block per step, rupturing outward along the fault)
        this.liftFault(tm, deadline);
        this.carve(tm, deadline);
        if (I > 0.2) this.collapse(game, I, deadline);
        this.toppleUpdate(game);
      } finally {
        this.edit.end();
      }
      if (this.ticks % 3 === 0 && I > 0.12) this.jostle(game, I);
      this.ambient(game, I);
    }
    this.stats.maxTickMs = Math.max(this.stats.maxTickMs, performance.now() - t0);
    // finish: shaking over, cracks open, trees down (or a hard stop well after)
    const over = this.t >= this.tl.duration && (this.done && this.topples.length === 0 || this.t > this.tl.duration + 12);
    return !over;
  }

  /** Scan a column: topmost non-air block and the natural ground surface under it. */
  private column(x: number, z: number): ColumnInfo | null {
    const w = this.game.world;
    if (!w.getChunk(x >> 4, z >> 4)) return null;
    const h = w.getHeight(x, z);
    let top = -1;
    for (let y = Math.min(255, h + 12); y >= 1; y--) {
      const st = w.getBlock(x, y, z);
      if (!st) continue;
      if (top < 0) top = y;
      if (T_LIQUID[st >>> 4]) return { top, ground: y, wet: true };
      const m = matOf(st);
      if (m === Mat.Ground || m === Mat.Rock) return { top, ground: y, wet: false };
      if (top - y > 40) break;
    }
    return null;
  }

  // ------------------------------------------------------------------------- fault scarp
  private liftFault(tm: number, deadline: number) {
    const F = this.fault;
    while (this.faultStep < F.maxLift) {
      const start = 0.8 + this.faultStep * 2.2;
      if (tm < start) return;
      const cols = F.cols;
      while (this.fi < cols.length) {
        const c = cols[this.fi];
        if (tm < start + c.along / 14) return;
        if (performance.now() > deadline) return;
        this.fi++;
        if (c.lift > this.faultStep) this.liftColumn(c);
      }
      this.faultStep++;
      this.fi = 0;
    }
  }

  /** Push a column up by one block (everything on it rides along). */
  private liftColumn(c: FaultCol) {
    const info = this.column(c.x, c.z);
    if (!info || info.wet) return;
    const w = this.game.world;
    const base = Math.max(1, info.ground - 6);
    const top = Math.min(254, info.top);
    for (let y = top; y >= base; y--) this.edit.set(c.x, y + 1, c.z, w.getBlock(c.x, y, c.z));
    this.stats.lifted++;
    this.stats.blocks += top - base + 1;
    // dust along the scarp face
    const ps = this.game.particles;
    if (ps && hash(c.x, c.z, this.faultStep) < 0.12) {
      const st = w.getBlock(c.x, info.ground + 1, c.z);
      ps.emit('dust', [c.x + 0.5, info.ground + 1.5, c.z + 0.5], { state: st, count: 3, spread: 0.6, speed: 1.5, size: 2.5 });
      ps.emit('large_smoke', [c.x + 0.5, info.ground + 1, c.z + 0.5], { count: 1, spread: 0.5, vel: [0, 0.6, 0], color: 0x8a7a66, size: 1.6 });
    }
  }

  // ------------------------------------------------------------------------- fissures
  private carve(tm: number, deadline: number) {
    const cols = this.fissures.cols;
    while (this.ci < cols.length && cols[this.ci].t <= tm) {
      if (performance.now() > deadline) return;
      const c = cols[this.ci++];
      if (c.edge) this.crumbleEdge(c);
      else this.carveColumn(c);
    }
  }

  private carveColumn(c: CarveCol) {
    const g = this.game, w = g.world;
    const info = this.column(c.x, c.z);
    if (!info || info.wet) return;
    const rnd = this.rnd;
    // things standing on the column fall in (trees topple into the crack)
    if (info.top > info.ground) {
      const tm = matOf(w.getBlock(c.x, info.ground + 1, c.z));
      if (tm === Mat.Wood && this.topples.length < 8 && this.startTopple(c.x, c.z, info.top, cardinal(c.dx, c.dz))) {
        // the tree took its blocks with it
      } else {
        for (let y = info.top; y > info.ground; y--) {
          const st = w.getBlock(c.x, y, c.z);
          if (!st) continue;
          if (T_LIQUID[st >>> 4]) continue;
          this.edit.set(c.x, y, c.z, 0);
          if (T_FULL_CUBE[st >>> 4] && rnd() < 0.6) this.spawnFaller(st, c.x, y, c.z, c.dx * 0.5, 0, c.dz * 0.5);
          else this.debrisFx(st, c.x, y, c.z, 3);
        }
      }
    }
    const bottom = Math.max(1, info.ground - c.depth + 1);
    let gst = 0;
    for (let y = info.ground; y >= bottom; y--) {
      const st = w.getBlock(c.x, y, c.z);
      if (y === info.ground) gst = st;
      const def = BLOCKS[st >>> 4];
      if (def && def.hardness < 0) break;
      this.edit.set(c.x, y, c.z, 0);
    }
    this.stats.blocks += info.ground - bottom + 1;
    if (c.lava && this.lava && c.depth > 6) {
      const ls = S('lava');
      this.edit.set(c.x, bottom, c.z, ls);
      this.edit.set(c.x, bottom + 1, c.z, ls);
      this.lavaCols.push(c);
    }
    this.stats.carved++;
    // dust plume and debris raining into the crack
    const ps = g.particles;
    const h = hash(c.x, c.z, 77);
    if (ps && gst) {
      const cx = c.x + 0.5, cz = c.z + 0.5, cy = info.ground + 1;
      if (h < 0.35) {
        ps.emit('dust', [cx, cy, cz], { state: gst, count: 4, spread: 0.8, speed: 2.5, size: 3, vel: [0, 2.5, 0] });
        ps.emit('campfire_smoke', [cx, cy - 0.5, cz], { count: 1, spread: 0.6, vel: [0, 2.2, 0], color: 0x9a8a74, size: 2.2, life: 0.35 });
      }
      if (h < 0.6) {
        for (let i = 0; i < 4; i++) ps.crumb(gst, cx + (rnd() - 0.5), cy - 0.2, cz + (rnd() - 0.5), (rnd() - 0.5) * 2, -1 - rnd() * 3, (rnd() - 0.5) * 2, 1.4);
      }
    }
    if (h > 0.85) this.sound(BLOCKS[gst >>> 4]?.sound ?? 'stone', 'break', c.x, info.ground, c.z, 0.55 + rnd() * 0.25, 1);
  }

  /** Rim column: its top slumps into the crack. */
  private crumbleEdge(c: CarveCol) {
    const info = this.column(c.x, c.z);
    if (!info || info.wet) return;
    const rnd = this.rnd;
    if (rnd() > 0.55) return;
    const w = this.game.world;
    const n = 1 + (rnd() < 0.35 ? 1 : 0);
    for (let k = 0; k < n; k++) {
      const y = info.ground - k;
      const st = w.getBlock(c.x, y, c.z);
      if (!st || BLOCKS[st >>> 4]?.hardness < 0) break;
      // whatever stands on it goes too
      if (k === 0) for (let yy = info.top; yy > info.ground; yy--) {
        const s2 = w.getBlock(c.x, yy, c.z);
        if (s2 && !T_LIQUID[s2 >>> 4] && matOf(s2) !== Mat.Wood && matOf(s2) !== Mat.Leaves) {
          this.edit.set(c.x, yy, c.z, 0);
          this.debrisFx(s2, c.x, yy, c.z, 3);
        }
      }
      this.edit.set(c.x, y, c.z, 0);
      this.spawnFaller(st, c.x, y, c.z, c.dx * (2 + rnd() * 2), 0.5, c.dz * (2 + rnd() * 2));
    }
    this.stats.edges++;
  }

  // ------------------------------------------------------------------------- collapse
  private collapse(game: Game, I: number, deadline: number) {
    const w = game.world;
    const rnd = this.rnd;
    const n = Math.round(26 * I);
    const R = 56;
    for (let k = 0; k < n; k++) {
      if (performance.now() > deadline) return;
      const a = rnd() * Math.PI * 2, r = Math.sqrt(rnd()) * R;
      const x = Math.floor(this.x + Math.cos(a) * r), z = Math.floor(this.z + Math.sin(a) * r);
      const f = shakeFalloff(r) * I;
      if (f < 0.12) continue;
      const info = this.column(x, z);
      if (!info || info.wet) continue;
      const st = w.getBlock(x, info.top, z);
      const m = matOf(st);
      if (m === Mat.Leaves || m === Mat.Wood) {
        if (rnd() < 0.3 * f && this.topples.length < 6 && this.toppled < 16) this.startTopple(x, z, info.top, Math.floor(rnd() * 4));
        else if (game.particles && rnd() < 0.5) {
          // leaves shaken loose
          for (let i = 0; i < 3; i++) game.particles.crumb(st, x + rnd(), info.top + rnd(), z + rnd(), (rnd() - 0.5) * 2, -0.5, (rnd() - 0.5) * 2, 1.3);
        }
        continue;
      }
      if (m === Mat.Built || m === Mat.Glass || (m === Mat.Plant && info.top > info.ground + 1)) {
        // structures shed blocks from the top; overhangs and glass go first
        for (let y = info.top; y > info.ground && y > info.top - 12; y--) {
          const s = w.getBlock(x, y, z);
          if (!s) continue;
          const mm = matOf(s);
          if (mm === Mat.None || mm === Mat.Wood || mm === Mat.Leaves) break;
          const below = w.getBlock(x, y - 1, z);
          const loose = !below || !T_SOLID[below >>> 4];
          const p = fragility(s) * f * (loose ? 0.9 : y === info.top ? 0.35 : 0.06);
          if (rnd() >= p) continue;
          this.edit.set(x, y, z, 0);
          if (mm === Mat.Glass) {
            this.stats.shattered++;
            game.particles?.emit('block_break', [x, y, z], { state: s });
            this.sound('glass', 'break', x, y, z, 1, 0.8);
          } else if (mm === Mat.Plant) this.debrisFx(s, x, y, z, 3);
          else this.spawnFaller(s, x, y, z, (rnd() - 0.5) * 3, 0.5, (rnd() - 0.5) * 3);
          break;
        }
        continue;
      }
      if (m === Mat.Ground && BLOCKS[st >>> 4]?.gravity) {
        // sand and gravel: slide toward a lower neighbour or drop into a void below
        let lx = 0, lz = 0, best = info.top;
        for (const [dx, dz] of [[1, 0], [-1, 0], [0, 1], [0, -1]]) {
          const h = w.getHeight(x + dx, z + dz);
          if (h - 1 < best - 1) { best = h - 1; lx = dx; lz = dz; }
        }
        if ((lx || lz) && rnd() < 0.8 * f) {
          this.edit.set(x, info.top, z, 0);
          this.spawnFaller(st, x, info.top, z, lx * 2.5, 1, lz * 2.5);
        }
        for (let y = info.top; y > info.top - 6; y--) {
          const s = w.getBlock(x, y, z);
          if (s && BLOCKS[s >>> 4]?.gravity && !w.getBlock(x, y - 1, z)) w.scheduleTick(x, y, z, 2);
        }
      }
    }
  }

  private startTopple(x: number, z: number, top: number, dir: number): boolean {
    // building a tree mesh costs a few ms: at most one per tick, and only with budget left
    if (this.toppledThisTick || performance.now() > this.deadline - 2) return false;
    const g = this.game, w = g.world;
    const tree = findTree(w, x, z, top);
    if (!tree) return false;
    for (const b of tree.blocks) this.edit.set(tree.x + b.dx, tree.y + b.dy, tree.z + b.dz, 0);
    const chunk = w.getChunk(tree.x >> 4, tree.z >> 4);
    const tint = chunk?.foliageColor?.[(tree.z & 15) * 16 + (tree.x & 15)] ?? 0x5f9f3a;
    const tt = new ToppleTree(tree, dir, g.renderer ? (g.renderer as any) : null, tint);
    this.scene.add(tt.group);
    this.topples.push(tt);
    this.toppledThisTick = true;
    this.toppled++;
    this.stats.toppled++;
    this.sound('wood', 'break', tree.x, tree.y + 2, tree.z, 0.6, 1.2);
    return true;
  }

  private toppleUpdate(game: Game) {
    // trees fall smoothly per frame (update); without frames (headless) advance them here
    const step = this.framed ? 0 : TICK;
    this.framed = false;
    for (let i = this.topples.length - 1; i >= 0; i--) {
      const tt = this.topples[i];
      if (!tt.update(step)) continue;
      tt.place((x, y, z, s) => this.edit.set(x, y, z, s), (x, y, z) => game.world.getBlock(x, y, z));
      const t = tt.tree;
      const sx = tt.dir === 0 ? 1 : tt.dir === 1 ? -1 : 0, sz = tt.dir === 2 ? 1 : tt.dir === 3 ? -1 : 0;
      const ps = game.particles;
      if (ps) {
        for (let k = 1; k < t.height; k += 2) {
          const px = t.x + 0.5 + sx * (k + 1), pz = t.z + 0.5 + sz * (k + 1);
          ps.emit('poof_cloud', [px, t.y + 0.3, pz], { size: 1.4 });
          const leaf = t.blocks.find((b) => matOf(b.state) === Mat.Leaves)?.state;
          if (leaf) for (let j = 0; j < 4; j++) ps.crumb(leaf, px + this.rnd() - 0.5, t.y + 1, pz + this.rnd() - 0.5, (this.rnd() - 0.5) * 4, 3 + this.rnd() * 3, (this.rnd() - 0.5) * 4, 1.3);
        }
      }
      this.sound('wood', 'land', t.x + sx * t.height * 0.5, t.y, t.z + sz * t.height * 0.5, 0.6, 1.5);
      this.fx?.addShake(0.25);
      tt.dispose();
      this.topples.splice(i, 1);
    }
  }

  /** Falling trees animate per frame; they are written into the world on the next tick. */
  private toppleFrame(dt: number) {
    this.framed = true;
    for (const t of this.topples) t.update(Math.min(dt, 0.1));
  }

  // ------------------------------------------------------------------------- helpers
  private spawnFaller(st: number, x: number, y: number, z: number, vx: number, vy: number, vz: number) {
    const g = this.game;
    if (this.fallers.length > 40) this.fallers = this.fallers.filter((e) => !e.removed);
    if (!g.entities || this.fallers.length >= 90 || !T_FULL_CUBE[st >>> 4]) {
      this.debrisFx(st, x, y, z, 5);
      return;
    }
    if (this.spawnedThisTick >= 6) {
      this.debrisFx(st, x, y, z, 3);
      return;
    }
    this.spawnedThisTick++;
    const e = new FallingBlockEntity(st);
    e.setPos(x + 0.5, y, z + 0.5);
    e.vel.set(vx, vy, vz);
    g.entities.add(e);
    this.fallers.push(e);
    this.stats.fell++;
  }

  private debrisFx(st: number, x: number, y: number, z: number, n: number) {
    const ps = this.game.particles;
    if (!ps) return;
    const rnd = this.rnd;
    for (let i = 0; i < n; i++) ps.crumb(st, x + rnd(), y + rnd(), z + rnd(), (rnd() - 0.5) * 3, rnd() * 2, (rnd() - 0.5) * 3, 1.2);
  }

  private sound(group: string, action: string, x: number, y: number, z: number, pitch: number, volume: number) {
    const a = this.game.audio;
    if (!a?.playBlock || this.sounds >= 4) return;
    this.sounds++;
    a.playBlock(group, action, { pos: { x: x + 0.5, y: y + 0.5, z: z + 0.5 }, volume, pitch });
  }

  /** Jostle entities, items and physics bodies. */
  private jostle(game: Game, I: number) {
    const rnd = this.rnd;
    const list = game.entities?.list;
    const pw = game.physics as PhysicsWorld | null;
    if (list) {
      for (const e of list) {
        if (e.removed) continue;
        const d = Math.hypot(e.pos.x - this.x, e.pos.z - this.z);
        if (d > 100) continue;
        const f = shakeFalloff(d) * I;
        if (f < 0.08) continue;
        // embedded by the rising scarp: step up
        const w = game.world;
        if (w && T_FULL_CUBE[w.getBlock(Math.floor(e.pos.x), Math.floor(e.pos.y + 0.1), Math.floor(e.pos.z)) >>> 4]) e.setPos(e.pos.x, Math.floor(e.pos.y + 0.1) + 1, e.pos.z);
        const pl = e === (game.player as any) ? (game.player as any) : null;
        if (pl && (pl.flying || pl.spectator)) continue;
        if (e.type === 'item' && (e as any).body && pw) {
          const b = (e as any).body;
          if (!b.removed) pw.setVelocity(b, b.linvel(_v).add(_k.set((rnd() - 0.5) * 3 * f, (1 + rnd() * 3) * f, (rnd() - 0.5) * 3 * f)));
          continue;
        }
        if (!e.onGround) continue;
        const up = pl ? 1.2 + rnd() * 1.5 : 2 + rnd() * 4.5;
        e.vel.y += up * f;
        e.vel.x += (rnd() - 0.5) * 3 * f;
        e.vel.z += (rnd() - 0.5) * 3 * f;
        e.onGround = false;
      }
    }
    if (pw?.querySphere && this.ticks % 6 === 0) {
      pw.wakeAround(this.x, this.y, this.z, 50);
      for (const b of pw.querySphere(_k.set(this.x, this.y, this.z), 50, (b) => b.dynamic)) {
        const f = shakeFalloff(Math.hypot(b.pos.x - this.x, b.pos.z - this.z)) * I;
        if (f < 0.1) continue;
        pw.setVelocity(b, b.linvel(_v).add(_k2.set((rnd() - 0.5) * 3 * f, (1 + rnd() * 2.5) * f, (rnd() - 0.5) * 3 * f)));
      }
    }
  }

  /** Ground dust kicked up by the shaking, lava glow in the deepest crack, phase sounds. */
  private ambient(game: Game, I: number) {
    this.sounds = 0;
    const ps = game.particles;
    const rnd = this.rnd;
    const w = game.world;
    if (ps && I > 0.25) {
      const n = Math.min(8, Math.round(7 * I));
      for (let k = 0; k < n; k++) {
        const a = rnd() * Math.PI * 2, r = Math.sqrt(rnd()) * 48;
        const x = Math.floor(this.x + Math.cos(a) * r), z = Math.floor(this.z + Math.sin(a) * r);
        if (!w.getChunk(x >> 4, z >> 4)) continue;
        const h = w.getHeight(x, z);
        const st = w.getBlock(x, h - 1, z);
        if (!st || T_LIQUID[st >>> 4]) continue;
        ps.emit('dust', [x + 0.5, h + 0.2, z + 0.5], { state: st, count: 2, spread: 0.7, speed: 1, size: 2.4, vel: [0, 0.8, 0] });
      }
    }
    if (ps && this.lavaCols.length && this.ticks % 2 === 0) {
      const c = this.lavaCols[Math.floor(rnd() * this.lavaCols.length)];
      const info = this.column(c.x, c.z);
      if (info) {
        ps.emit('lava_pop', [c.x + 0.5, info.ground + 1, c.z + 0.5], { count: 2, speed: 2, vel: [0, 5, 0] });
        if (rnd() < 0.5) ps.emit('large_smoke', [c.x + 0.5, info.ground + 2, c.z + 0.5], { count: 1, vel: [0, 2, 0], spread: 0.5 });
      }
    }
    const a = game.audio;
    // main shock: a deep boom and a ring of dust
    if (!this.boomed && this.t >= this.tl.main) {
      this.boomed = true;
      a?.play?.('random.explode', { pos: { x: this.x, y: this.y, z: this.z }, volume: 4, pitch: 0.42 });
      a?.play?.('weather.thunder.far', { volume: 1, pitch: 0.5 });
      ps?.emit('dust_ring', [this.x + 0.5, this.y + 0.3, this.z + 0.5], { size: 4, color: 0x8c7b66 });
      this.fx?.addShake(1.4);
    }
    for (let i = this.afterBoom; i < this.tl.after.length; i++) {
      if (this.t < this.tl.after[i][0]) break;
      this.afterBoom = i + 1;
      a?.play?.('weather.thunder.far', { volume: 0.5 + this.tl.after[i][1], pitch: 0.45 });
    }
  }

  // ------------------------------------------------------------------------- frame
  update(game: Game, dt: number) {
    if (this.disposed) return;
    this.toppleFrame(dt);
    const I = quakeIntensity(this.t, this.tl);
    const cam = game.cameraCtl?.camera?.position ?? game.player?.pos;
    const d = cam ? Math.hypot(cam.x - this.x, cam.z - this.z) : 0;
    const f = shakeFalloff(d);
    const fx = this.fx ?? (game as any).disasters?.effects;
    if (fx && I > 0.01) {
      fx.addShake(I * f * 1.35);
      fx.requestTint(0.42, 0.36, 0.29, 0.1 * I * f);
    }
    const au = game.audio;
    if (au?.loop) {
      if (!this.loops) this.loops = { rumble: au.loop('loop.lava', { volume: 0, pitch: 0.28 }), sub: au.loop('loop.wind', { volume: 0, pitch: 0.32 }) };
      const v = I * (0.15 + 0.85 * f);
      this.loops.rumble.setVolume(Math.min(1.5, v * 1.4));
      this.loops.sub.setVolume(Math.min(1, v * 0.9));
    }
  }

  dispose(game: Game = this.game) {
    if (this.disposed) return;
    this.disposed = true;
    this.edit.end();
    for (const t of this.topples) {
      // land unfinished trees instantly so no blocks vanish
      try {
        this.edit.begin();
        t.place((x, y, z, s) => this.edit.set(x, y, z, s), (x, y, z) => game.world.getBlock(x, y, z));
      } finally {
        this.edit.end();
      }
      t.dispose();
    }
    this.topples.length = 0;
    const ex = game.renderExtras;
    if (ex) {
      if (ex.gbuffer) ex.gbuffer = ex.gbuffer.filter((s) => s !== this.scene);
      if (ex.shadow) ex.shadow = ex.shadow.filter((s) => s !== this.scene);
    }
    this.scene.clear();
    if (this.loops) {
      this.loops.rumble.stop(2);
      this.loops.sub.stop(2);
      this.loops = null;
    }
    this.fallers.length = 0;
    this.lavaCols.length = 0;
  }
}

const hash = (x: number, z: number, k: number) => {
  let h = (x * 374761393 + z * 668265263 + k * 2147483647) | 0;
  h = Math.imul(h ^ (h >>> 13), 1274126177);
  return ((h ^ (h >>> 16)) >>> 0) / 4294967296;
};
/** Nearest cardinal direction index (0 +x, 1 -x, 2 +z, 3 -z) of a vector. */
function cardinal(dx: number, dz: number) {
  return Math.abs(dx) >= Math.abs(dz) ? (dx >= 0 ? 0 : 1) : dz >= 0 ? 2 : 3;
}
const _v = new THREE.Vector3();
const _k = new THREE.Vector3();
const _k2 = new THREE.Vector3();

registerDisaster('earthquake', (ctx) => new Earthquake(ctx.game, ctx.x, ctx.y, ctx.z, ctx.fx, ctx.fz, { effects: ctx.effects }));
