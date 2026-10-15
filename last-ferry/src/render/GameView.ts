// The game view: makes a World come alive. Every frame it syncs the visuals
// to the world (interpolated between logic ticks) and reacts to every logic
// event: the Bosun and his guns, the horde (rigs, stretchers, fire on bodies),
// deaths (aimed ragdolls, gore), the corpse lifecycle (downed → twitching →
// rising crawler / permanent → baked), fire, gas, explosions, the ferry's
// cannon, the crane, the horn, and screen shake.
//
// Contract (the app calls, in this order each frame):
//   view.attach(world)                    once per World (attract worlds too)
//   per logic tick:  view.beforeStep(); world.step();
//   per frame:       view.update(dt, alpha)   (dt = presentation seconds: 0 while
//                                             paused / in hit-stop, slow-mo scaled)
//                    stage.frame(...)          renders
// GameView.update() also drives the environment (env.setTimeOfDay / setCrane /
// setBoarding from the world and env.update(dt, time)): the app must NOT call
// env.update itself.
import type { World } from '../core/World';
import { DECAL_RECT } from '../config/world';
import { BloodSystem } from './BloodSystem';
import { Effects } from './Effects';
import type { Stage } from './Stage';
import type { Environment } from './env/Environment';
import { prewarmZombies } from './models/index';
import { ViewCore, type ViewOptions } from './view/ViewCore';

export type { ViewOptions };

export class GameView {
  readonly blood: BloodSystem;
  readonly effects: Effects;
  /** All per-world presentation (rebuilt by attach). */
  private core: ViewCore;
  private prewarmed = false;

  constructor(
    readonly stage: Stage,
    readonly env: Environment,
  ) {
    this.blood = new BloodSystem(stage.renderer, stage.scene, env.quality === 'low' ? 1024 : 2048);
    this.effects = new Effects(stage.scene, 0);
    env.setDecalMap(this.blood.texture, DECAL_RECT);
    this.blood.isOnFloe = (x, z) => env.isOnDeck(x, z);
    stage.onPreRender(() => this.blood.flush());
    this.core = new ViewCore(stage, env, this.blood, this.effects);
  }

  /** Build visuals for a world and subscribe to its events (detaches the previous one). */
  attach(world: World): void {
    this.core.attach(world);
  }

  detach(): void {
    this.core.detach();
  }

  /** Call before every logic tick (interpolation snapshot). */
  beforeStep(): void {
    this.core.beforeStep();
  }

  /**
   * Per frame. `dt` presentation seconds (0 while paused or in hit-stop,
   * slow-motion scaled otherwise); `alpha` = interpolation between the last
   * two logic ticks (0..1).
   */
  update(dt: number, alpha: number): void {
    this.core.update(dt, alpha);
  }

  setOptions(o: { blood: 'low' | 'normal' | 'max'; shake: number }): void {
    this.core.setOptions(o);
  }

  /**
   * Graphics quality, live (no reload): effect lights, particle density, the
   * ragdoll budget, which bodies cast real shadows (low: blob shadows for the
   * horde, corpse shadows on high only). Call together with
   * Environment.setQuality (reflection, shadow map, lamp lights) and the
   * stage's post quality / pixel ratio. The blood decal map keeps the
   * resolution it was created with.
   */
  setQuality(q: 'low' | 'medium' | 'high'): void {
    this.core.setQuality(q);
  }

  /**
   * Spread expensive first-use work (zombie rig geometry, shader programs)
   * over frames: call each frame on the loading / title screen with a CPU
   * budget; returns true when everything is warm.
   */
  prewarm(budgetMs: number): boolean {
    if (this.prewarmed) return true;
    const t0 = performance.now();
    const rigs = prewarmZombies(Math.max(1, budgetMs * 0.8));
    const left = budgetMs - (performance.now() - t0);
    const fx = left > 1 ? this.core.prewarm(left) : false;
    this.prewarmed = rigs && fx;
    return this.prewarmed;
  }

  get stats(): { zombies: number; corpses: number; ragdolls: number; drops: number; drawCalls: number } {
    return this.core.stats();
  }

  /** Debug / tests: the internal presentation state. */
  get debug(): ViewCore {
    return this.core;
  }
}
