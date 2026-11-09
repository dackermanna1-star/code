/**
 * Top-level game: owns the Babylon engine, the scene, Havok physics and the
 * state machine (garage → run → results). Gameplay lives in `Run`.
 */
import {
  Color4,
  Engine,
  HavokPlugin,
  Scene,
  Vector3,
} from "@babylonjs/core";
import HavokPhysics from "@babylonjs/havok";
import { Debug } from "./Debug";
import { events } from "./Events";
import { Input } from "./Input";
import { Save } from "./Save";
import { Time } from "./Time";
import type { GameContext } from "./types";

export type GameState = "boot" | "garage" | "run" | "results";

export interface StateHandler {
  enter(): void | Promise<void>;
  update(dt: number): void;
  exit(): void;
}

export class Game {
  readonly engine: Engine;
  scene!: Scene;
  havok!: HavokPlugin;
  readonly input = new Input();
  readonly save = new Save();
  readonly events = events;
  state: GameState = "boot";
  private handlers = new Map<GameState, StateHandler>();
  private current?: StateHandler;
  private hk: unknown;
  /** Exposed for automated tests / debugging in the console. */
  debug: Record<string, unknown> = {};

  constructor(readonly canvas: HTMLCanvasElement, readonly uiRoot: HTMLElement) {
    this.engine = new Engine(canvas, true, {
      preserveDrawingBuffer: true,
      stencil: true,
      antialias: true,
      adaptToDeviceRatio: true,
    });
    window.addEventListener("resize", () => this.engine.resize());
  }

  async init(): Promise<void> {
    this.hk = await HavokPhysics();
    this.scene = this.createScene();
    this.engine.runRenderLoop(() => this.frame());
  }

  /** Fresh scene with physics; called on boot and between runs to free everything. */
  createScene(): Scene {
    const scene = new Scene(this.engine);
    scene.clearColor = new Color4(0.05, 0.05, 0.08, 1);
    scene.skipPointerMovePicking = true;
    this.havok = new HavokPlugin(false, this.hk);
    scene.enablePhysics(new Vector3(0, -9.81, 0), this.havok);
    return scene;
  }

  /** Dispose the current scene and create a clean one. */
  resetScene(): Scene {
    this.scene.dispose();
    this.scene = this.createScene();
    return this.scene;
  }

  get ctx(): GameContext {
    return {
      engine: this.engine,
      scene: this.scene,
      havok: this.havok,
      input: this.input,
      events: this.events,
      save: this.save,
      canvas: this.canvas,
      uiRoot: this.uiRoot,
    };
  }

  register(state: GameState, handler: StateHandler): void {
    this.handlers.set(state, handler);
  }

  async setState(state: GameState): Promise<void> {
    this.current?.exit();
    this.state = state;
    this.current = this.handlers.get(state);
    await this.current?.enter();
  }

  private frame(): void {
    Time.tick(this.engine.getDeltaTime() / 1000);
    this.input.update();

    // Debug: backquote toggles the tuning panel, F9 the physics shape viewer.
    if (this.input.consumePress("Backquote")) Debug.toggle();
    if (this.input.consumePress("F9")) Debug.togglePhysicsViewer(this.scene);
    Debug.update(this.engine, this.scene);

    // Physics steps by the scaled frame time so slow-mo slows the simulation.
    const pe = this.scene.getPhysicsEngine();
    if (pe) pe.setTimeStep(Math.max(1 / 600, Time.dt));

    this.current?.update(Time.dt);
    this.scene.render();
  }
}
