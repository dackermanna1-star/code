// Reference skeleton of the recommended loop (runs headless, screenshot at the end):
//  - Engine options for a game, scene input manager detached (we use DOM listeners)
//  - UniversalCamera driven manually (inputs cleared), viewmodel in renderingGroup 1
//  - src/core/time.ts accumulator driving Havok at fixed 60 Hz (scene.physicsEnabled = false)
//  - pause via time.scale = 0, hit-stop via time.hitStop()
import {
  Engine, Scene, Vector3, Color3, Color4, UniversalCamera, HemisphericLight, DirectionalLight, MeshBuilder,
  StandardMaterial, HavokPlugin, PhysicsAggregate, PhysicsShapeType, KeyboardEventTypes,
} from "@babylonjs/core";
import { Time, FIXED_DT } from "../../src/core/time.ts";
import { getHavok, r } from "./input-loop-util.ts";

/** Minimal DOM input layer: window key listeners (event.code), pointer deltas, injectable for tests. */
class Input {
  private held = new Set<string>();
  private pressedEdge = new Set<string>();
  private lookDx = 0;
  private lookDy = 0;
  // NOTE: `constructor(private canvas: ...)` parameter properties are rejected by erasableSyntaxOnly (TS1294).
  private canvas: HTMLCanvasElement;
  constructor(canvas: HTMLCanvasElement) {
    this.canvas = canvas;
    window.addEventListener("keydown", (e) => {
      if (!e.repeat) this.pressedEdge.add(e.code);
      this.held.add(e.code);
      if (["Space", "Tab", "F3"].includes(e.code)) e.preventDefault();
    });
    window.addEventListener("keyup", (e) => this.held.delete(e.code));
    window.addEventListener("blur", () => this.held.clear()); // avoid stuck keys
    document.addEventListener("pointerlockchange", () => document.pointerLockElement !== this.canvas && this.held.clear());
    canvas.addEventListener("pointermove", (e) => {
      if (document.pointerLockElement === canvas || e.buttons !== 0) {
        this.lookDx += e.movementX;
        this.lookDy += e.movementY;
      }
    });
  }
  injectLook(dx: number, dy: number) {
    this.lookDx += dx;
    this.lookDy += dy;
  }
  consumeLook() {
    const l = { dx: this.lookDx, dy: this.lookDy };
    this.lookDx = this.lookDy = 0;
    return l;
  }
  down(code: string) {
    return this.held.has(code);
  }
  pressed(code: string) {
    const p = this.pressedEdge.has(code);
    this.pressedEdge.delete(code);
    return p;
  }
}

export async function probe() {
  const canvas = document.getElementById("renderCanvas") as HTMLCanvasElement;
  const engine = new Engine(canvas, false, {
    stencil: true,
    powerPreference: "high-performance",
    preserveDrawingBuffer: false, // Playwright page.screenshot() works without it
    audioEngine: false, // our own WebAudio graph
  });
  const scene = new Scene(engine);
  scene.clearColor = new Color4(0.55, 0.65, 0.8, 1);

  // Babylon's scene input manager: count what it delivers before/after detachControl()
  let babylonKeys = 0;
  scene.onKeyboardObservable.add((kb) => kb.type === KeyboardEventTypes.KEYDOWN && babylonKeys++);
  canvas.dispatchEvent(new KeyboardEvent("keydown", { code: "KeyQ", key: "q", keyCode: 81, bubbles: true }));
  const keysWhileAttached = babylonKeys;
  scene.detachControl();
  canvas.dispatchEvent(new KeyboardEvent("keydown", { code: "KeyQ", key: "q", keyCode: 81, bubbles: true }));
  const keysAfterDetach = babylonKeys - keysWhileAttached;

  const input = new Input(canvas);
  const cam = new UniversalCamera("cam", new Vector3(0, 1.6, -4), scene);
  cam.inputs.clear(); // never attachControl; we drive pose ourselves
  cam.minZ = 0.05;
  cam.maxZ = 200;
  cam.fov = (75 * Math.PI) / 180;
  new HemisphericLight("h", new Vector3(0, 1, 0), scene).intensity = 0.5;
  new DirectionalLight("sun", new Vector3(-0.4, -1, 0.6), scene).intensity = 0.8;

  const hk = await getHavok();
  scene.enablePhysics(new Vector3(0, -9.81, 0), new HavokPlugin(true, hk));
  scene.physicsEnabled = false; // scene.render() must not step physics
  const ground = MeshBuilder.CreateBox("ground", { width: 20, height: 0.2, depth: 20 }, scene);
  ground.position.y = -0.1;
  new PhysicsAggregate(ground, PhysicsShapeType.BOX, { mass: 0 }, scene);
  const wall = MeshBuilder.CreateBox("wall", { width: 6, height: 3, depth: 0.2 }, scene);
  wall.position.set(-3.2, 1.5, -1); // off to the left so the boxes stay visible
  new PhysicsAggregate(wall, PhysicsShapeType.BOX, { mass: 0 }, scene);
  const boxes = [];
  for (let i = 0; i < 12; i++) {
    const b = MeshBuilder.CreateBox("b" + i, { size: 0.4 }, scene);
    b.position.set((i % 4) * 0.6 - 0.9, 3 + Math.floor(i / 4) * 0.6, 1.5);
    const m = new StandardMaterial("m" + i, scene);
    m.diffuseColor = Color3.FromHSV((i * 40) % 360, 0.7, 0.9);
    b.material = m;
    boxes.push(new PhysicsAggregate(b, PhysicsShapeType.BOX, { mass: 1 }, scene));
  }
  // viewmodel: parented to the camera, always drawn on top (group 1 clears depth first)
  const tool = MeshBuilder.CreateBox("tool", { width: 0.05, height: 0.05, depth: 0.6 }, scene);
  tool.parent = cam;
  tool.position.set(0.25, -0.22, 0.55);
  tool.renderingGroupId = 1;
  tool.isPickable = false;
  const tm = new StandardMaterial("tm", scene);
  tm.diffuseColor = new Color3(0.8, 0.2, 0.1);
  tool.material = tm;

  // player state
  let yaw = 0, pitch = 0.15;
  const SENS = 0.0022;
  const time = new Time();
  let steps = 0;
  let stepsWhilePaused = 0;
  let shake = 0;
  const phys = scene.getPhysicsEngine()!;

  const fixedStep = () => {
    // player.fixedUpdate / destruction.beforePhysics would go here
    scene._advancePhysicsEngineStep(FIXED_DT * 1000); // == onBeforePhysics + _step(FIXED_DT) + onAfterPhysics
    // destruction.afterPhysics would go here
    time.tick();
    steps++;
    if (time.paused) stepsWhilePaused++;
  };
  const frame = (dt: number) => {
    const look = input.consumeLook();
    yaw += look.dx * SENS;
    pitch = Math.max(-1.55, Math.min(1.55, pitch + look.dy * SENS));
    shake = Math.max(0, shake - dt * 1.5);
    const s = shake * shake * 0.02;
    cam.rotation.set(pitch + (Math.random() - 0.5) * s, yaw + (Math.random() - 0.5) * s, (Math.random() - 0.5) * s);
  };
  const frameDts: number[] = [];
  const loop = () => {
    frameDts.push(engine.getDeltaTime());
    const n = time.beginFrame(engine.getDeltaTime() / 1000);
    for (let i = 0; i < n; i++) fixedStep();
    frame(time.frameDt);
    scene.render();
  };
  engine.runRenderLoop(loop);
  window.addEventListener("resize", () => engine.resize());

  const wait = (ms: number) => new Promise((res) => setTimeout(res, ms));
  const t0 = performance.now();
  input.injectLook(-60, 0); // as if the mouse moved 60 px left
  await wait(1000);
  const y1 = boxes[0].body.transformNode.position.y;
  time.scale = 0; // pause
  const pausedAt = { steps, simTime: time.simTime };
  await wait(500);
  const y2 = boxes[0].body.transformNode.position.y;
  const pausedAfter = { steps, simTime: time.simTime };
  time.scale = 1;
  time.hitStop(0.3, 0.15);
  shake = 1;
  const beforeHit = time.simTime;
  const tHit = performance.now();
  await wait(300);
  const hitSim = time.simTime - beforeHit;
  const hitReal = (performance.now() - tHit) / 1000;
  await wait(700);
  engine.stopRenderLoop(loop);
  const real = (performance.now() - t0) / 1000;
  scene.render();
  return {
    babylonKeyboardObservable: { whileAttached: keysWhileAttached, afterDetachControl: keysAfterDetach },
    realSeconds: r(real, 3),
    simSeconds: r(time.simTime, 3),
    steps,
    stepsWhilePaused,
    pause: { stepsBefore: pausedAt.steps, stepsAfter500ms: pausedAfter.steps, boxYBefore: r(y1, 4), boxYAfter: r(y2, 4) },
    hitStop: { realSeconds: r(hitReal, 3), simSecondsAdvanced: r(hitSim, 3) },
    yawAfterInjectedLook: r(yaw, 4),
    camForward: cam.getDirection(Vector3.Forward()).asArray().map((x) => r(x, 3)),
    physicsTimeStep: phys.getTimeStep(),
    fps: r(engine.getFps(), 1),
    frames: frameDts.length,
    frameDtMs_median: r([...frameDts].sort((a, b) => a - b)[frameDts.length >> 1], 1),
    frameDtMs_max: r(Math.max(...frameDts), 1),
    framesOver66ms: frameDts.filter((d) => d > 1000 / 15).length,
  };
}
