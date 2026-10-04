/**
 * Shared toolkit for natural disasters (src/game/disasters/*).
 *
 *  - `BulkEdit`: fast block edits with per-block lighting off; the touched chunks are relit a
 *    few per tick afterwards (a per-block light flood fill under open sky costs milliseconds each).
 *  - `DisasterFx`: sustained camera shake, a full-screen tint (rgb + alpha, composited in the
 *    tonemap pass) and a "darken the sky" factor that disasters can drive every frame.
 *  - small math helpers (seeded noise, falloff curves).
 *
 * A disaster is an object with `tick` (20 TPS, return false when finished), optional `update`
 * (per frame, visuals) and `dispose`. Register a factory with `registerDisaster(name, factory)`;
 * the spawner block `name` (registered in blocks.ts) starts it where it is placed.
 */
import * as THREE from 'three';
import type { Game } from '../game';
import { SetFlags, sectionKey } from '../../world/world';
import { lightChunkLocal } from '../../world/light';
import { SECTIONS_PER_CHUNK } from '../../core/constants';
import { BLOCK_BY_NAME, BLOCKS } from '../../world/blocks/registry';

export interface DisasterContext {
  game: Game;
  /** Where the spawner block was placed. */
  x: number;
  y: number;
  z: number;
  /** Horizontal unit vector the player was looking along when placing it. */
  fx: number;
  fz: number;
  effects: DisasterFx;
}

export interface Disaster {
  readonly name: string;
  /** 20 TPS logic; return false when the disaster is over (dispose is then called). */
  tick(game: Game): boolean;
  /** Per rendered frame (visuals: meshes, particles, shake). */
  update?(game: Game, dt: number): void;
  dispose?(game: Game): void;
}

export type DisasterFactory = (ctx: DisasterContext) => Disaster;

export const DISASTERS = new Map<string, DisasterFactory>();
/** Register a disaster; `name` must also be a block (the spawner). */
export function registerDisaster(name: string, factory: DisasterFactory) {
  DISASTERS.set(name, factory);
}

/** Block state by name (meta 0 unless given). */
export function S(name: string, meta = 0): number {
  const b = BLOCK_BY_NAME.get(name);
  if (!b) throw new Error(`disasters: unknown block ${name}`);
  return (b.id << 4) | meta;
}
export const blockName = (state: number) => BLOCKS[state >>> 4]?.name ?? 'air';

/**
 * Fast bulk block edits. `set` returns true if the block changed. Call `end()` after a batch:
 * changed chunks are queued for relighting, which `relightStep` (run by the disaster system each
 * tick) performs a couple of chunks at a time.
 */
export class BulkEdit {
  private touched = new Set<string>();
  private lightWas = true;
  private open = false;
  changed = 0;
  constructor(readonly game: Game) {}
  begin() {
    if (this.open) return this;
    const w = this.game.world;
    this.lightWas = w.lightEnabled;
    w.lightEnabled = false;
    // physics terrain colliders: rebuild touched sections once per batch, not per block
    (this.game as any).physics?.beginBatch?.();
    this.open = true;
    return this;
  }
  set(x: number, y: number, z: number, state: number): boolean {
    if (y < 0 || y > 255) return false;
    if (!this.open) this.begin();
    const ok = this.game.world.setBlock(x, y, z, state, SetFlags.MODIFY);
    if (ok) {
      this.changed++;
      this.touched.add(`${x >> 4},${z >> 4}`);
    }
    return ok;
  }
  get(x: number, y: number, z: number) {
    return this.game.world.getBlock(x, y, z);
  }
  end() {
    if (!this.open) return;
    this.game.world.lightEnabled = this.lightWas;
    (this.game as any).physics?.endBatch?.();
    this.open = false;
    for (const k of this.touched) relightQueue.add(k);
    this.touched.clear();
  }
}

const relightQueue = new Set<string>();
const relightDone = new Set<string>();
/** Relight up to `n` queued chunks, then exchange light across their borders. */
export function relightStep(game: Game, n = 2) {
  const w = game.world;
  if (!w) return;
  let k = 0;
  for (const key of relightQueue) {
    if (k++ >= n) break;
    relightQueue.delete(key);
    const [cx, cz] = key.split(',').map(Number);
    const c = w.getChunk(cx, cz);
    if (!c) continue;
    lightChunkLocal(c);
    for (let sy = 0; sy < SECTIONS_PER_CHUNK; sy++) w.dirtySections.add(sectionKey(cx, sy, cz));
    relightDone.add(key);
  }
  if (relightQueue.size === 0 && relightDone.size) {
    for (const key of relightDone) {
      const [cx, cz] = key.split(',').map(Number);
      if (w.getChunk(cx, cz)) w.light.integrateChunk(cx, cz, 255);
    }
    relightDone.clear();
  }
}
export function clearRelight() {
  relightQueue.clear();
  relightDone.clear();
}

/** Screen-level effects shared by all running disasters (strongest request wins). */
export class DisasterFx {
  /** Requested shake this frame (0..1+), decays unless re-requested. */
  shake = 0;
  private shakeT = 0;
  /** Full-screen tint, composited as mix(color, tint.rgb, tint.a). */
  readonly tint = new THREE.Vector4(0, 0, 0, 0);
  private tintReq = new THREE.Vector4(0, 0, 0, 0);
  /** 0..1 extra darkness/dust in the sky (applied as a tint toward `dust` colour). */
  private overlay = new THREE.Vector4(0, 0, 0, 0);
  private flashA = 0;
  private flashC = new THREE.Color(1, 1, 1);

  /** Shake the camera with intensity (≈0.2 light rumble, 1 violent, 3 apocalypse). */
  addShake(intensity: number) {
    this.shake = Math.max(this.shake, intensity);
  }
  /** Request a tint for this frame (call every frame while it should last). */
  requestTint(r: number, g: number, b: number, a: number) {
    if (a > this.tintReq.w) this.tintReq.set(r, g, b, a);
  }
  /** One-off flash (white for impacts) fading over ~0.5 s. */
  flash(intensity = 1, color = 0xffffff) {
    this.flashA = Math.max(this.flashA, Math.min(1, intensity));
    this.flashC.set(color);
  }

  /** Called once per frame by the disaster system after all disasters updated. */
  apply(game: Game, dt: number) {
    const p = game.player;
    if (p && this.shake > 0.001) {
      this.shakeT += dt;
      const k = this.shake;
      const n = (f: number, o: number) => Math.sin(this.shakeT * f + o) * 0.6 + Math.sin(this.shakeT * f * 2.3 + o * 1.7) * 0.4;
      p.cameraShake.set(n(23, 0) * k, n(19, 2.1) * k * 0.6, Math.max(p.cameraShake.z, k));
    }
    this.shake *= Math.exp(-dt * 3);
    // tint: strongest of request and flash
    const req = this.tintReq;
    this.flashA *= Math.exp(-dt * 4);
    const o = this.overlay;
    if (this.flashA > req.w) o.set(this.flashC.r, this.flashC.g, this.flashC.b, this.flashA);
    else o.copy(req);
    this.tint.copy(o);
    const ex = game.renderExtras as any;
    if (o.w > 0.002) ex.overlay = o;
    else if (ex.overlay === o) ex.overlay = undefined;
    req.set(0, 0, 0, 0);
  }
}

// ----------------------------------------------------------------------------- helpers
/** Hash of integer coords -> [0,1). */
export function hash3(x: number, y: number, z: number, seed = 0): number {
  let h = (x * 374761393 + y * 668265263 + z * 2147483647 + seed * 1442695041) | 0;
  h = Math.imul(h ^ (h >>> 13), 1274126177);
  return ((h ^ (h >>> 16)) >>> 0) / 4294967296;
}
/** Smooth 2D value noise in [-1,1]. */
export function noise2(x: number, z: number, seed = 0): number {
  const ix = Math.floor(x), iz = Math.floor(z);
  const fx = x - ix, fz = z - iz;
  const sx = fx * fx * (3 - 2 * fx), sz = fz * fz * (3 - 2 * fz);
  const a = hash3(ix, 0, iz, seed), b = hash3(ix + 1, 0, iz, seed), c = hash3(ix, 0, iz + 1, seed), d = hash3(ix + 1, 0, iz + 1, seed);
  return (a + (b - a) * sx + (c - a) * sz + (a - b - c + d) * sx * sz) * 2 - 1;
}
/** Highest non-air block y at a column (or -1). */
export function surfaceY(game: Game, x: number, z: number): number {
  const w = game.world;
  for (let y = Math.min(255, w.getHeight(x, z) + 2); y >= 0; y--) if (w.getBlock(x, y, z)) return y;
  return -1;
}
