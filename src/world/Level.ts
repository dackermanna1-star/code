/**
 * The streamed world for one run (ILevel).
 *
 * The route itself is pure math in `Track` (deterministic per level id), so
 * `heightAt`, `roadCenterX` and `roadHalfWidth` work anywhere instantly.
 * Geometry and colliders are built in 50 m `Chunk`s: a few hundred meters
 * ahead of the car (by quality), at most one new chunk per frame after the
 * initial load, and disposed once they are 80 m behind.
 */
import { DirectionalLight, HemisphericLight, Vector3, type Texture } from "@babylonjs/core";
import type { LevelDef } from "../data/levels";
import type { GameContext, ILevel } from "../core/types";
import { Atmosphere } from "./Atmosphere";
import { buildTemplates } from "./Biomes";
import { Chunk, type LevelKit } from "./Chunk";
import { Debris } from "./Debris";
import { makeSoftTexture } from "./Landmarks";
import { makeColors } from "./Props";
import { createMaterials, type WorldMaterials } from "./Surface";
import { CHUNK, HW, Track, type Feature, type Fork } from "./Track";

const AHEAD = [180, 250, 320]; // m of world built ahead of the car, by quality
const BEHIND = 80; // chunks entirely further behind than this are disposed

export class Level implements ILevel {
  readonly spawn: { position: Vector3; yaw: number };
  readonly sun: DirectionalLight;
  readonly hemi: HemisphericLight;
  /** Deterministic layout (forks, dips, features). */
  readonly track: Track;
  readonly atmosphere: Atmosphere;
  readonly debris: Debris;
  /** z of the checkpoint gantry and of the evac gate. */
  readonly checkpointZ: number;
  readonly evacZ: number;
  private chunks = new Map<number, Chunk>();
  private animated: Chunk[] = [];
  private rangeFrom = NaN;
  private rangeTo = NaN;
  private rangeComplete = false;
  private kit: LevelKit;
  private mats: WorldMaterials;
  private soft: Texture | null = null;
  private time = 0;
  private quality: number;
  private firstChunk = -1;
  private lastChunk: number;

  constructor(readonly ctx: GameContext, readonly def: LevelDef) {
    const scene = ctx.scene;
    this.quality = { low: 0, medium: 1, high: 2 }[ctx.save.data.settings.quality] ?? 1;
    this.track = new Track(def);
    this.checkpointZ = def.checkpointAt;
    this.evacZ = def.length;
    this.lastChunk = Math.floor(this.track.endZ / CHUNK);

    const colors = makeColors(def.palette);
    const softTexture = () => (this.soft ??= makeSoftTexture(scene));
    this.mats = createMaterials(scene, def, this.quality, softTexture());
    this.atmosphere = new Atmosphere(scene, def, this.quality, softTexture());
    this.sun = this.atmosphere.sun;
    this.hemi = this.atmosphere.hemi;
    this.debris = new Debris(scene, colors, ctx.events, this.quality);
    this.kit = {
      scene,
      track: this.track,
      def,
      colors,
      tpl: buildTemplates(def.biome, colors, this.track.seed),
      mats: this.mats,
      debris: this.debris,
      quality: this.quality,
      softTexture,
    };

    const sz = 2;
    const sx = this.roadCenterX(sz);
    this.spawn = { position: new Vector3(sx, this.heightAt(sx, sz) + 1.5, sz), yaw: 0 };

    // Initial load: everything around the spawn, synchronously.
    this.stream(this.spawn.position.z, Infinity);
    this.atmosphere.follow(this.spawn.position);
  }

  // ------------------------------------------------------------ ILevel

  heightAt(x: number, z: number): number {
    return this.track.heightAt(x, z);
  }

  roadHalfWidth(_z: number): number {
    return HW;
  }

  roadCenterX(z: number): number {
    return this.track.laneX(z, 0);
  }

  // ----------------------------------------------------- extra queries

  /** Tire grip multiplier at (x, z): 1 normally, ~0.25 on ice patches. */
  frictionAt(x: number, z: number): number {
    return this.track.frictionAt(x, z);
  }

  /** Forks (risky/safe splits); `mainSide` is the side roadCenterX follows. */
  get forks(): readonly Fork[] {
    return this.track.forks;
  }

  /** Ramps, wrecks, barricades... (e.g. to keep zombies off ramps). */
  get features(): readonly Feature[] {
    return this.track.features;
  }

  /** Center x of the risky branch at z inside a fork (else the main road). */
  riskyCenterX(z: number): number {
    const f = this.track.forkAt(z);
    return f ? this.track.laneX(z, -f.mainSide) : this.roadCenterX(z);
  }

  get loadedChunks(): number {
    return this.chunks.size;
  }

  // ------------------------------------------------------------ update

  update(dt: number, carPos: Vector3): void {
    this.time += dt;
    this.stream(carPos.z, 1);
    this.debris.update(dt, carPos);
    this.atmosphere.update(dt, carPos);
    for (let i = 0; i < this.animated.length; i++) this.animated[i].animate(this.time, dt);
  }

  /**
   * Build missing chunks around z (nearest first, at most `budget` per call)
   * and drop old ones. Does nothing (and allocates nothing) while the wanted
   * range is unchanged and fully built.
   */
  private stream(z: number, budget: number): void {
    const from = Math.max(this.firstChunk, Math.floor((z - BEHIND) / CHUNK));
    const to = Math.min(this.lastChunk, Math.floor((z + AHEAD[this.quality]) / CHUNK));
    const here = Math.floor(z / CHUNK);
    if (from === this.rangeFrom && to === this.rangeTo && this.rangeComplete && this.chunks.has(here)) return;
    this.rangeFrom = from;
    this.rangeTo = to;

    for (const [i, c] of this.chunks) {
      if (i < from || i > to + 1) this.drop(i, c);
    }
    // The chunk under the car (and its neighbours) are built right away even
    // over budget, so teleports/warps never land on empty space.
    for (let i = Math.max(from, here - 1); i <= Math.min(to, here + 1); i++) {
      if (!this.chunks.has(i)) this.add(i);
    }
    let built = 0;
    for (let i = here; i <= to && built < budget; i++) {
      if (!this.chunks.has(i)) {
        this.add(i);
        built++;
      }
    }
    for (let i = from; i <= to && built < budget; i++) {
      if (!this.chunks.has(i)) {
        this.add(i);
        built++;
      }
    }
    let complete = true;
    for (let i = from; i <= to; i++) if (!this.chunks.has(i)) complete = false;
    this.rangeComplete = complete;
  }

  private add(i: number): void {
    const c = new Chunk(this.kit, i);
    this.chunks.set(i, c);
    if (c.extras.animators.length) this.animated.push(c);
  }

  private drop(i: number, c: Chunk): void {
    c.dispose();
    this.chunks.delete(i);
    const k = this.animated.indexOf(c);
    if (k >= 0) this.animated.splice(k, 1);
  }

  dispose(): void {
    for (const c of this.chunks.values()) c.dispose();
    this.chunks.clear();
    this.animated.length = 0;
    this.debris.dispose();
    this.atmosphere.dispose();
    this.mats.dispose();
    this.soft?.dispose();
    this.soft = null;
    void this.ctx;
  }
}
