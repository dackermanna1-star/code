/**
 * Landmark spawner blocks. Placing `one_world_trade_center` raises a scaled replica of One World
 * Trade Center (New York) in front of the player, layer by layer over a few seconds.
 *
 * Geometry (real building, feet): a 200 ft square base, a cubic podium up to 186 ft, then the
 * shaft whose plan morphs from that square into a square rotated 45 degrees at the 1,368 ft roof:
 * at height fraction t the plan is |x| <= R, |z| <= R, |x| + |z| <= R (2 - t) (four vertical
 * triangles in the base faces and four sloped triangles cutting the corners; an octagon near
 * mid-height). A 408 ft spire brings it to 1,776 ft. The world is 256 blocks tall, so the tower is
 * scaled to fit above the spot it is placed (about 1:10 for ground at y 70).
 *
 * Inside: a lobby, a floor every 4 blocks lit by sea lanterns, a concrete core with a ladder up to
 * the roof deck behind a glass parapet.
 */
import type { Game } from './game';
import type { GameSystem } from './systems';
import { addBehavior } from '../world/blocks/behaviors';
import { BLOCK_BY_NAME, BLOCKS, T_SOLID } from '../world/blocks/registry';
import { SetFlags, sectionKey, type World } from '../world/world';
import { ITEM_BY_NAME } from './items/registry';
import { lightChunkLocal } from '../world/light';
import { SECTIONS_PER_CHUNK } from '../core/constants';

const FT = { base: 200, podium: 186, roof: 1368, top: 1776, parapet: 40 };
/** Blocks per foot when there is room (the real tower would need 541 blocks). */
const MAX_SCALE = 0.135;
const MIN_HALF_WIDTH = 5;
const PLAZA = 4;
/** Block changes per tick while building (keeps ticks cheap; the tower rises in ~5 s). */
const BUDGET = 1600;
/** Tower layers per tick: the building visibly rises (~3 s for a 180-block tower). */
const LAYERS_PER_TICK = 3;

export interface TowerPlan {
  /** Ground-floor centre (the floor of the lobby is at y0 - 1). */
  cx: number;
  cz: number;
  y0: number;
  /** Half width in blocks (footprint 2R+1). */
  R: number;
  podium: number;
  deck: number;
  roof: number;
  top: number;
  /** Unit vector pointing from the entrance into the building (away from the player). */
  fx: number;
  fz: number;
}

/** Plan a tower whose entrance plaza starts at the anchor block, extending along (fx, fz). */
export function planTower(ax: number, ay: number, az: number, fx: number, fz: number): TowerPlan | null {
  const room = 255 - ay;
  let R = Math.min(Math.round((FT.base / 2) * MAX_SCALE), Math.floor(((room - 1) / FT.top) * FT.base / 2));
  for (; R >= MIN_HALF_WIDTH; R--) {
    const s = R / (FT.base / 2);
    const top = Math.round(FT.top * s);
    if (top <= room) {
      const podium = Math.max(4, Math.round(FT.podium * s));
      const roof = Math.round(FT.roof * s);
      const deck = roof - Math.max(2, Math.round(FT.parapet * s));
      const d = R + PLAZA;
      return { cx: ax + fx * d, cz: az + fz * d, y0: ay, R, podium, deck, roof, top, fx, fz };
    }
  }
  return null;
}

const st = (name: string, meta = 0) => {
  const b = BLOCK_BY_NAME.get(name);
  if (!b) throw new Error(`landmarks: unknown block ${name}`);
  return (b.id << 4) | meta;
};

let P: Record<string, number> | null = null;
function palette() {
  return (P ??= {
    glass: st('curtain_wall'),
    fins: st('fin_wall'),
    floor: st('light_gray_concrete'),
    deck: st('gray_concrete'),
    core: st('gray_concrete'),
    lobby: st('smooth_quartz'),
    plaza: st('polished_andesite'),
    curb: st('smooth_stone'),
    lamp: st('sea_lantern'),
    found: st('stone'),
    steel: st('iron_block'),
    mast: st('smooth_quartz'),
    rod: st('end_rod', 1),
  });
}

/** Is the cell (u lateral, w depth) inside the tower's plan at layer i (below the roof)? */
export function insideTower(p: TowerPlan, u: number, w: number, i: number): boolean {
  if (i < 0 || i >= p.roof) return false;
  const au = Math.abs(u), aw = Math.abs(w);
  if (au > p.R || aw > p.R) return false;
  if (i < p.podium) return true;
  const t = (i - p.podium) / Math.max(1, p.roof - 1 - p.podium);
  return au + aw <= p.R * (2 - t) + 0.5;
}

/** Local (u, w) -> world (x, z). */
function toWorld(p: TowerPlan, u: number, w: number): [number, number] {
  return [p.cx + w * p.fx - u * p.fz, p.cz + w * p.fz + u * p.fx];
}

/** Ladder facing (hfacing S=0 W=1 N=2 E=3) toward the entrance (-f). */
function ladderMeta(p: TowerPlan) {
  const dx = -p.fx, dz = -p.fz;
  return dz > 0 ? 0 : dx < 0 ? 1 : dz < 0 ? 2 : 3;
}

const CORE_W = 3;

/** Block for cell (u, w) of layer i, or undefined to leave the world untouched. */
export function towerBlock(p: TowerPlan, u: number, w: number, i: number): number | undefined {
  const pal = palette();
  // spire on the roof deck
  if (i > p.deck) {
    const k = i - p.deck - 1;
    const spireH = p.top - p.deck - 1;
    const au = Math.abs(u), aw = Math.abs(w);
    if (i < p.top) {
      if (k < 2 && au + aw <= 2) return pal.steel;
      if (k < Math.max(3, Math.round(spireH * 0.16)) && au <= 1 && aw <= 1) return pal.steel;
      if (u === 0 && w === 0) {
        if (k < Math.round(spireH * 0.72)) return k % 6 === 5 ? pal.steel : pal.mast;
        return pal.rod;
      }
    }
    if (i >= p.roof) return undefined;
  }
  if (!insideTower(p, u, w, i)) return undefined;
  const ring = !insideTower(p, u + 1, w, i) || !insideTower(p, u - 1, w, i) || !insideTower(p, u, w + 1, i) || !insideTower(p, u, w - 1, i);
  const shell = ring || (i < p.deck && !insideTower(p, u, w, i + 1));
  if (shell) {
    // entrance: a 3-wide, 3-tall opening in the front face
    if (w === -p.R && Math.abs(u) <= 1 && i < 3) return 0;
    return i < p.podium ? pal.fins : pal.glass;
  }
  if (i > p.deck) return 0; // behind the parapet
  // core with ladder shaft at (0, CORE_W), doorway facing the entrance
  const cu = u, cw = w - CORE_W;
  if (Math.abs(cu) <= 1 && Math.abs(cw) <= 1) {
    if (cu === 0 && cw === 0) return st('ladder', ladderMeta(p));
    if (i === p.deck) return pal.deck;
    const standing = i < 4 ? i <= 1 : i % 4 === 1 || i % 4 === 2;
    if (cu === 0 && cw === -1 && standing) return 0;
    return pal.core;
  }
  if (i === p.deck) return pal.deck;
  if (i >= 4 && i % 4 === 0) return u % 4 === 0 && w % 4 === 0 ? pal.lamp : pal.floor;
  return 0;
}

interface Job {
  plan: TowerPlan;
  dim: string;
  /** -1 = groundwork (foundation, plaza, clearing) column cursor; then layer index. */
  layer: number;
  col: number;
  /** Chunks changed so far ("cx,cz"); relit once the tower stands. */
  touched: string[];
  /** Relight cursor into `touched` (set when the last layer is placed). */
  relit?: number;
}

/** Runs tower construction jobs; `one_world_trade_center` is the spawner block. */
export class LandmarkSystem implements GameSystem {
  readonly name = 'landmarks';
  private jobs: Job[] = [];
  private game!: Game;

  init(game: Game) {
    this.game = game;
    const it = ITEM_BY_NAME.get('one_world_trade_center');
    if (it) it.category = 'functional';
    addBehavior('one_world_trade_center', {
      onPlace: (world: World, x: number, y: number, z: number) => {
        if (world !== this.game.world) return;
        this.start(x, y, z);
      },
    });
  }

  start(x: number, y: number, z: number) {
    const g = this.game;
    const p = g.player;
    // build away from the player (cardinal direction the player is looking)
    const lx = -Math.sin(p?.yaw ?? 0), lz = -Math.cos(p?.yaw ?? 0);
    const [fx, fz] = Math.abs(lx) > Math.abs(lz) ? [Math.sign(lx), 0] : [0, Math.sign(lz) || 1];
    const plan = planTower(x, y, z, fx, fz);
    if (!plan) {
      g.message?.('Not enough room above for One World Trade Center: place it lower (below y 150).', '#ff8080');
      g.world.setBlock(x, y, z, 0, SetFlags.MODIFY);
      return;
    }
    this.jobs.push({ plan, dim: g.dimension, layer: -1, col: 0, touched: [] });
    g.message?.(`One World Trade Center: rising ${plan.top} blocks (about 1:${(30.48 / plan.R).toFixed(1)} scale)`, '#9fd0ff');
  }

  tick(game: Game) {
    const job = this.jobs[0];
    if (!job || job.dim !== game.dimension || game.loading) return;
    const w = game.world;
    const p = job.plan;
    const span = p.R + PLAZA;
    // every chunk of the site must be loaded before anything is placed
    for (const [ox, oz] of [[-span, -span], [span, -span], [-span, span], [span, span], [0, 0]]) {
      const [x, z] = toWorld(p, ox, oz);
      if (!w.getChunk(x >> 4, z >> 4)) return;
    }
    if (job.relit !== undefined) {
      this.relight(game, job);
      return;
    }
    let budget = BUDGET;
    const touched = new Set(job.touched);
    const set = (x: number, y: number, z: number, s: number) => {
      if (y < 0 || y > 255) return;
      if (w.setBlock(x, y, z, s, SetFlags.MODIFY)) {
        budget--;
        touched.add(`${x >> 4},${z >> 4}`);
      }
    };
    const pal = palette();
    // Bulk edit: per-block light updates under open sky cost a flood fill each (seconds for a
    // whole tower); the touched chunks are relit in one pass when the tower stands.
    const lightWas = w.lightEnabled;
    w.lightEnabled = false;
    try {
      // 1) groundwork: foundation, plaza and a clear site, column by column
      const side = 2 * span + 1;
      while (job.layer < 0 && budget > 0) {
        if (job.col >= side * side) {
          job.layer = 0;
          break;
        }
        const u = (job.col % side) - span, wd = Math.floor(job.col / side) - span;
        job.col++;
        const [x, z] = toWorld(p, u, wd);
        const inFoot = Math.abs(u) <= p.R && Math.abs(wd) <= p.R;
        const edge = Math.abs(u) === span || Math.abs(wd) === span;
        for (let y = p.y0 - 2, n = 0; y > 0 && n < 48; y--, n++) {
          const b = w.getBlock(x, y, z);
          if (b && T_SOLID[b >>> 4] && BLOCKS[b >>> 4].fullCube) break;
          set(x, y, z, pal.found);
        }
        set(x, p.y0 - 1, z, inFoot ? pal.lobby : edge ? pal.curb : pal.plaza);
        if (!inFoot) for (let y = p.y0; y < p.y0 + 40; y++) if (w.getBlock(x, y, z)) set(x, y, z, 0);
      }
      // 2) the tower, layer by layer
      for (let n = 0; job.layer >= 0 && job.layer < p.top && budget > 0 && n < LAYERS_PER_TICK; n++) {
        const i = job.layer++;
        const r = i >= p.roof ? 2 : p.R;
        for (let wd = -r; wd <= r; wd++) {
          for (let u = -r; u <= r; u++) {
            const s = towerBlock(p, u, wd, i);
            if (s === undefined) continue;
            const [x, z] = toWorld(p, u, wd);
            set(x, p.y0 + i, z, s);
          }
        }
      }
    } finally {
      w.lightEnabled = lightWas;
      job.touched = [...touched];
    }
    if (job.layer >= p.top) job.relit = 0;
  }

  /** Relight the changed chunks (one per tick), then exchange light with their neighbours. */
  private relight(game: Game, job: Job) {
    const w = game.world;
    const keys = job.touched.map((k) => k.split(',').map(Number) as [number, number]);
    for (let n = 0; n < 1 && job.relit! < keys.length; n++) {
      const [cx, cz] = keys[job.relit!++];
      const c = w.getChunk(cx, cz);
      if (!c) continue;
      lightChunkLocal(c);
      for (let sy = 0; sy < SECTIONS_PER_CHUNK; sy++) w.dirtySections.add(sectionKey(cx, sy, cz));
    }
    if (job.relit! < keys.length) return;
    for (const [cx, cz] of keys) if (w.getChunk(cx, cz)) w.light.integrateChunk(cx, cz, 255);
    this.jobs.shift();
    game.events.emit('title', { title: 'One World Trade Center', subtitle: '1,776 ft · New York', time: 80 });
    game.events.emit('landmarkBuilt', { name: 'one_world_trade_center', plan: job.plan });
  }

  save() {
    return { jobs: this.jobs };
  }
  load(_g: Game, data: any) {
    this.jobs = Array.isArray(data?.jobs) ? data.jobs : [];
  }
}
