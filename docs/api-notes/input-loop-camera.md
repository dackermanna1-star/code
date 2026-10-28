# Input, first-person camera, game loop & timing, viewmodel, engine options

Babylon.js **9.30.0** (`@babylonjs/core`) + `@babylonjs/havok` **1.3.14**, WebGL2, TS strict + `erasableSyntaxOnly`.
Everything below comes from the installed sources (`node_modules/@babylonjs/core/**`) and/or the probes in
`tests/probes/input-loop-*`. Markers: **VERIFIED** = measured at runtime by a probe; **source** = read in the
installed `.js`/`.d.ts` only; **unverified** = browser behaviour that headless Chromium can't show.
All imports come from the package root: `import { X } from "@babylonjs/core"`.

## TL;DR

1. **Fixed 60 Hz physics, driven by us.** Set `scene.physicsEnabled = false` once. `scene.render()` then never steps Havok (VERIFIED: 0 extra steps over 90 frames). Each fixed step, call `scene._advancePhysicsEngineStep(FIXED_DT * 1000)` (milliseconds; fires `onBefore/AfterPhysicsObservable`). The fully public equivalent is `plugin.executeStep(FIXED_DT, (scene.getPhysicsEngine() as PhysicsEngineV2).getBodies())`; it gives bit-identical results. Collision events and body→mesh sync both happen *inside* that call (VERIFIED).
2. `setTimeStep(0)` and `_step(0)` do **not** pause physics. `_step(0)` steps 1/60 s. `setTimeStep(0)` silently zeroes `applyForce`. To pause, run 0 steps (`time.scale = 0`).
3. **Units differ.** `engine.getDeltaTime()` and `scene.deltaTime` are in **ms**. `engine.getTimeStep()` is in **ms**, but `physicsEngine.getTimeStep()` is in **seconds**. `getDeltaTime()` stays 0 unless `engine.runRenderLoop` runs.
4. **Camera.** Use `UniversalCamera` with `cam.inputs.clear()` and never call `attachControl`. Write `position` and `rotation` (x = pitch, positive looks **down**; y = yaw, +90° faces +X; z = roll) every frame. Set `minZ` yourself (the default is **1 m**). Clamp pitch to ±1.55.
5. **Viewmodel.** Put tool meshes in `renderingGroupId = 1`. Every group already clears depth first, by default. It works with DefaultRenderingPipeline, SSAO2 and shadows. Also push the tool material into `scene.prePassRenderer.excludedMaterials` (removes the SSAO halo) and set `receiveShadows = false`. Without that, the part inside a wall renders black. A second camera with `layerMask` is **broken** with SSAO2 (tool invisible) and loses tone mapping and FXAA.
6. **Input.** Use **window** `keydown`/`keyup` with `event.code`. Babylon's `scene.onKeyboardObservable` only fires while the canvas has focus. Read mouse deltas from DOM `pointermove` `movementX/Y`. Pointer lock needs a user gesture. Error names: `NotAllowedError` (no gesture), `SecurityError` (sandboxed iframe), `NotSupportedError` (`unadjustedMovement` on Linux). Fall back to drag-to-look.
7. **Headless Chromium can't test real pointer lock.** After a trusted click the lock is granted, but the page floods with tens of thousands of coalesced pointer events, rAF drops to ~2 fps, and `movementX` stays 0. Tests must use an injected-look / virtual-lock path.
8. **Engine:** `new Engine(canvas, false, { stencil: true, powerPreference: "high-performance", audioEngine: false })`. Playwright screenshots do **not** need `preserveDrawingBuffer` (VERIFIED). `canvas.toDataURL()` after the frame was presented does. Use `engine.setHardwareScalingLevel(1 / resolutionScale)`.
9. **Picking.** The Havok raycast costs ~7–16 µs regardless of scene size. `scene.pickWithRay` costs 44 µs → 780 µs as meshes grow from 100 to 1200. Use physics raycasts for gameplay. Use `scene.pickWithRay` only for render-only meshes.

---

## 0. How this was verified

| probe | what |
|---|---|
| `input-loop-physstep.probe.ts` | default stepping vs `physicsEnabled=false` + `Time` accumulator, exactness, collisions, sync, lockstep, cost |
| `input-loop-pause.probe.ts` | `_step` ≡ `executeStep`, `_step(0)`, pausing Animatables/particles, deltaTime after a stall |
| `input-loop-camera.probe.ts` | camera defaults, Euler conventions, roll, pitch singularity, same-frame pose, parenting, rays |
| `input-loop-viewmodel.probe.ts` / `-viewmodel2.probe.ts` (+ `-viewmodel-lib.ts`) | 8 viewmodel variants, 2×2 screenshots + pixel readback |
| `input-loop-input.probe.ts` + `input-loop-input.driver.mjs` | pointer lock errors, mouse deltas, keyboard, overlay, sandboxed iframe (trusted Playwright input) |
| `input-loop-lockstorm.probe.ts` + `.driver.mjs` | headless pointer-lock event storm (DOM only) |
| `input-loop-engine.probe.ts` | context attributes, scaling/resize, preserveDrawingBuffer, screenshots, audioEngine, WebGPU, context loss |
| `input-loop-picking.probe.ts` | `scene.pickWithRay` vs Havok raycast cost/agreement |
| `input-loop-skeleton.probe.ts` | the recommended loop end-to-end (screenshot) |

Run plain probes with `node tests/probe.mjs tests/probes/<file>`. Trusted input needs
`node tests/probes/input-loop-drive.mjs <probe> --driver <driver.mjs>`. That file is a copy of `tests/probe.mjs`
plus a `--driver` hook that runs `page.mouse` / `page.keyboard` while the probe waits. Timings come from headless
SwiftShader on a 4-CPU box shared with other agents (load average 10–14), so treat them as **relative**.

---

## 1. Game loop & fixed-step physics

### 1.1 What `scene.render()` does to physics (source + VERIFIED)
`engine.runRenderLoop(fn)` runs every rAF tick: `engine.beginFrame()` (which measures `getDeltaTime`), then `fn()`, then `engine.endFrame()`.
Inside `scene.render()` (`_renderFrame`), VERIFIED order within one frame:

```
[runRenderLoop callback] → scene.onBeforeAnimationsObservable → scene.animate():
      (lockstep only: onBeforeStepObservable … onAfterStepObservable, getStepId()++)
      if (scene.physicsEnabled) _advancePhysicsEngineStep(deltaMs) → onBeforePhysicsObservable → Havok step → onAfterPhysicsObservable
  → active camera .update() → scene.onBeforeRenderObservable → render targets/shadows → draw → scene.onAfterRenderObservable
→ engine.onEndFrameObservable   (engine.onBeginFrameObservable fires before the callback)
```

* Default mode steps once per frame with `dt = clamp(engine.getDeltaTime(), Scene.MinDeltaTime = 1 ms, Scene.MaxDeltaTime = 1000 ms)`. Then `PhysicsEngineV2._step` clamps it to ≤ 0.1 s, and ≤ 0 becomes 1/60.
  - VERIFIED (T1): 40 frames gave 40 Havok steps with deltas `0.001, 0.0181, 0.0027, …, 0.0167` s. That is **wall-clock** time.
* Without `runRenderLoop`, `engine.getDeltaTime()` stays **0**, so each `scene.render()` steps 1 ms. VERIFIED (T6).
* `_advancePhysicsEngineStep(stepMs)` is `@internal` in the docs but typed in `scene.pure.d.ts`. Arguments:
  - With `subTimeStep === 0` (default): one `_step(stepMs/1000)`, wrapped in the two observables.
  - With `setSubTimeStep(ms) > 0`: an uncapped sub-step loop.
* `IPhysicsEngine._step(delta: number /*s*/)` sits on the public interface. It does not notify the observables.
* `HavokPlugin.executeStep(delta: number, physicsBodies: PhysicsBody[]): void` is public. In order, it:
  1. runs the pre-step for bodies with `disablePreStep === false`;
  2. calls `HP_World_Step(dt)`;
  3. calls `sync(body)`, which writes body → node transform for bodies without `disableSync`;
  4. dispatches **collision events, then trigger events**.
* `new HavokPlugin(useDeltaForWorldStep = true, hk)`: with `false`, the world steps by `getTimeStep()` and **ignores** the delta passed in.

### 1.2 Recommended: our accumulator drives Havok (VERIFIED, `input-loop-skeleton.probe.ts`)
```ts
import { Engine, Scene, HavokPlugin, PhysicsEngineV2, Vector3 } from "@babylonjs/core";
import { Time, FIXED_DT } from "./core/time.ts";

scene.enablePhysics(new Vector3(0, -9.81, 0), new HavokPlugin(true, hk));
scene.physicsEnabled = false;                       // scene.render() must never step physics
const phys = scene.getPhysicsEngine()!;             // timeStep stays 1/60 (applyForce uses it, see Pitfalls)

engine.runRenderLoop(() => {
  const n = time.beginFrame(engine.getDeltaTime() / 1000);   // ms -> s; Time clamps to 0.25 s, max 4 steps
  input.update();
  for (let i = 0; i < n; i++) {
    player.fixedUpdate(FIXED_DT);
    destruction.beforePhysics(FIXED_DT);
    scene._advancePhysicsEngineStep(FIXED_DT * 1000);         // = onBeforePhysics + _step(FIXED_DT) + onAfterPhysics
    // or, public API, no observables: plugin.executeStep(FIXED_DT, (phys as PhysicsEngineV2).getBodies());
    destruction.afterPhysics(FIXED_DT);                        // impacts were dispatched inside the step
    time.tick();
  }
  player.update(time.frameDt);                                 // camera from the latest body state
  audio.update(time.frameDt); vfx.update(time.frameDt); hud.update(time.frameDt);
  scene.render();
});
```
Do everything in the `runRenderLoop` callback, in this explicit order. Mixing hooks causes lag: if the steps were
attached to `scene.onBeforeRenderObservable` (it runs inside `render()`) while `player.update()` sets the camera
before `scene.render()`, the camera would show the previous step. A pose written in `onBeforeRenderObservable` is
still used for that frame (§3).

VERIFIED numbers (T2, 90 frames; `input-loop-physstep.probe.ts`):

| measure | value |
|---|---|
| real time vs. simulated time | 1.594 s real → 1.583 s sim |
| Havok steps | 95, **every delta exactly 1/60** |
| steps added by `scene.render()` | **0** |
| steps per frame | 0: 1 frame, 1: 85, 2: 2, 3: 2 |
| `onBeforePhysicsObservable` | fired 95× |
| collision events | 236, **all inside our step call** (STARTED 12, CONTINUED 216, FINISHED 8); `body.getCollisionObservable()` 228 |
| sync | mesh `position.y` equals the Havok body position right after the step (0.9492) |
| resting box | settles at y = 0.25 |

More VERIFIED behaviour:
* **Exactness (T3).** 60 × `_step(1/60)` of free fall:
  - drop: **4.9229 m** (analytic 4.905, semi-implicit Euler 4.9868);
  - velocity: 9.8075 m/s (expected 9.81);
  - 30 `scene.render()` calls afterwards with `physicsEnabled=false` moved it **0**.
* **First step.** The first step from rest gains 0.16097 m/s, against g/60 = 0.1635 (Havok internal). It is the same for `_step(1/60)` and `_step(0)`.
* **Public path.** `_step(dt)` and `plugin.executeStep(dt, getBodies())` give bit-identical results (y = 45.077084 after 60 steps).
* **Cost (T7).** One step with 200 awake boxes took 2.25 ms (headless WASM, loaded box).
* **Slow machines.** With frames > 66 ms, `Time` caps at 4 steps and drops the backlog, so the game runs in slow motion. Skeleton under load: ~8–15 fps, 0.73 s simulated in 2.5 s real. This is the intended behaviour of `time.ts`.

### 1.3 Built-in alternative: deterministic lockstep (VERIFIED T5, not recommended for us)
Create the engine with `new Engine(canvas, aa, { deterministicLockstep: true, lockstepMaxSteps: 4, timeStep: 1/60 })`.
* `scene.animate()` then runs `floor((delta + acc) / timeStep)` steps per frame, capped at `lockstepMaxSteps`.
* Each step fires `onBeforeStepObservable`, advances animations by a fixed dt, calls `_advancePhysicsEngineStep(timeStep)`, then fires `onAfterStepObservable`, and increments `scene.getStepId()`.
* Measured: 60 frames → 61 steps, all exactly 1/60; steps per frame were 0: 4, 1: 51, 2: 5; `getStepId()` = 61.
* Why not for us (source):
  - When capped, the leftover time **keeps accumulating**: `_timeAccumulator = deltaTime` with no drop.
  - There is no time scale, hit-stop or pause.
  - `onBeforeStepObservable` and `getStepId()` only work in this mode; in normal mode they never fire or increment (VERIFIED: absent from the T1 order).

---

## 2. Timing, deltaTime, pausing

* `engine.getDeltaTime(): number` is in **ms**. It is the interval between the last two `beginFrame` calls (`PerformanceMonitor.instantaneousFrameTime`) and is 0 on the first frame. VERIFIED: 16.5–16.7 ms at 60 Hz.
* `scene.deltaTime` is in **ms**, scaled by `scene.animationTimeScale`. The animation module sets it from its own clock. VERIFIED: equal to the engine delta within 0.3 ms.
* After a 400 ms main-thread stall, `getDeltaTime()` = 420–492 ms. Babylon does not clamp it (VERIFIED), so always clamp yourself; `Time` clamps to 0.25 s.
* `engine.getFps()` is a 30-frame rolling average.
* While physics is not stepped, Babylon Animatables and ParticleSystems keep moving: they read wall-clock time and `scene.getAnimationRatio()` (VERIFIED).

**Pausing cleanly (VERIFIED, `input-loop-pause.probe.ts`):**

| what | how | result |
|---|---|---|
| physics | `time.scale = 0` → 0 steps per frame; keep calling `scene.render()` | bodies frozen (skeleton: 0 steps and identical positions over 500 ms) |
| Animatables | `scene.animationTimeScale = 0` | frozen; on resume +6.10 units in 0.61 s (6.1 expected) = **no jump** |
| ~~Animatables~~ | ~~`scene.animationsEnabled = false`~~ | frozen, but on resume it **jumps ahead by the whole paused time** (+19.5 units in 0.67 s vs 6.7 expected) |
| particle systems | `ps.updateSpeed = 0` (restore afterwards) | frozen and still drawn |
| particle systems | `scene.particlesEnabled = false` | frozen and **hidden** (not dispatched) |

For tab switches, rAF stops, so the first frame back has a huge delta; `Time` clamps it and drops the backlog.
`engine.renderEvenInBackground` (default true) only concerns window *blur*; hidden tabs get no rAF anyway (source).

**Hit-stop.** `time.hitStop(0.3, 0.15)` worked, but its granularity is one frame. The frame in which the timer
expires already accumulates at full speed, so at low fps the slow-motion is shorter. Measured under load: 0.32 s
real → 0.08 s simulated, against the ideal 0.045 s.

---

## 3. First-person camera without `attachControl`

VERIFIED defaults (`FreeCamera`/`UniversalCamera`):

| property | value |
|---|---|
| `minZ` | **1** |
| `maxZ` | 10000 |
| `fov` | 0.8 rad, `FOVMODE_VERTICAL_FIXED` |
| `inertia` / `speed` | 0.9 / 2 |
| `layerMask` | `0x0FFFFFFF` |
| `rotationQuaternion` | `null` |
| `inputs.attached` | FreeCamera `[keyboard, mouse]`; UniversalCamera `[keyboard, mouse, touch, gamepad]` |
| `scene.activeCamera` | set to the first camera created |

The inputs do nothing until `attachControl()`. The gamepad manager is only touched on attach (source).
`cam.inputs.clear()` empties them (VERIFIED). Babylon 9's TargetCamera has a new framerate-independent
inertia system (`camera.movement`), but with no input it never moves the camera (source).

```ts
const cam = new UniversalCamera("cam", new Vector3(0, 1.6, 0), scene);   // context.ts types it as UniversalCamera
cam.inputs.clear();
cam.minZ = 0.05; cam.maxZ = 200;            // 12.5 mm drywall needs a small near plane; keep the far plane modest
cam.fov = settings.fov * Math.PI / 180;     // vertical (m11 == 1/tan(fov/2), VERIFIED)
// every frame (after the fixed steps):
cam.position.copyFrom(eye).addInPlace(shakeOffset);
cam.rotation.set(pitch + shakePitch, yaw + shakeYaw, shakeRoll);   // x = pitch, y = yaw, z = roll
```

* **Conventions (VERIFIED):** left-handed.
  - yaw 0 → forward (0,0,1); yaw +90° → (1,0,0).
  - **pitch +30° → (0,−0.5,0.866): positive pitch looks DOWN.** So `pitch += movementY * sens` (mouse down → look down).
  - Roll via `rotation.z` rotates `upVector` automatically: roll 0.2 → up (−0.199, 0.98, 0), and it returns to (0,1,0).
* **Pitch singularity (VERIFIED):** at exactly ±π/2 the view matrix stays finite but `up` degenerates. Past π/2 the view flips. Clamp to ±1.55.
* **Same-frame poses (VERIFIED):** a pose written inside `scene.onBeforeRenderObservable` is used for that frame. The view matrix is lazily recomputed; set-pose + `getViewMatrix()` costs ≈ 15 µs.
* **Parenting (VERIFIED):** `cam.parent = headNode` works, and `globalPosition`/`getDirection` include the parent. This suits a shake rig (base pose on the node, local offsets on the camera). Writing offsets straight into `position`/`rotation` from a base pose each frame (the skeleton does this) is simpler. Never accumulate shake into the base state.
* **Rays:** `cam.getForwardRay(len)` gives origin = eye, a normalized direction and `length`. `cam.getFrontPosition(d)` gives eye + forward·d (VERIFIED). For a physics raycast use `from = cam.globalPosition`, `to = from + forward * reach`.
* **`rotationQuaternion`:** if set, it overrides `rotation`. **Clearing it back to `null` left the view stale** until `rotation` changed (VERIFIED). Pick one representation; Euler is natural for an FPS.

---

## 4. First-person viewmodel that never clips (VERIFIED with screenshots + pixel readback)

Setup: a wall face 0.6 m ahead, and a red tool parented to the camera that spans 0.25–0.95 m in camera
space, so its head is behind the wall. The scene has DefaultRenderingPipeline (bloom, FXAA, ACES), SSAO2 and a
PCF ShadowGenerator. Pixel = RGB at the tool head on screen.

| variant | result |
|---|---|
| group 0 (reference) | head hidden by the wall: pixel (170,170,175) = wall |
| **group 1** + tool `receiveShadows` | whole tool on top, but the head inside the wall is **in the wall's shadow** (54,0,1, black); SSAO halo on the wall around the tool |
| **group 1 + `prePassRenderer.excludedMaterials` + `receiveShadows=false`** | whole tool, correct colour (163,0,13), **no SSAO halo**. **Use this.** |
| group 1 + pipeline, no SSAO ("low" preset) | whole tool, same colour (127,0,10 near part) |
| second camera (`layerMask`) + SSAO2 (prepass, the default) | **tool not rendered at all.** The prepass renders the 2nd camera into its MRT and never composites it (source: `prePassRenderer._setupOutputForThisPass`) |
| second camera + pipeline on world camera only (no SSAO or SSAO2 `forceGeometryBuffer`) | visible, but **no tone mapping or FXAA on the tool** (109,1,0 vs 127,0,8) |
| second camera + pipeline attached to both cameras | **world wiped**: the 2nd camera's post chain overwrites the output (only clear colour + tool) |

```ts
for (const m of toolMeshes) {
  m.parent = cam;                  // or a sway/bob node parented to the camera
  m.renderingGroupId = 1;          // groups 0..3 (RenderingManager.MAX_RENDERINGGROUPS = 4)
  m.receiveShadows = false;
  m.isPickable = false;
}
scene.setRenderingAutoClearDepthStencil(1, true, true, true);   // already the default for every group (VERIFIED)
scene.prePassRenderer?.excludedMaterials.push(toolMaterial);    // exists only once SSAO2 (prepass) is enabled; re-push after re-creating SSAO
```

Source facts:
* `scene.setRenderingAutoClearDepthStencil(renderingGroupId: number, autoClearDepthStencil: boolean, depth?: boolean, stencil?: boolean): void`.
* Render-target textures (depth renderer, geometry buffer) use the **scene's** per-group clear setup.
* `ShadowGenerator` turns group clears **off** in its shadow map, so a viewmodel registered as a caster casts a physically placed shadow. Usually, just don't register viewmodel meshes as casters.
* Excluded materials render only to colour attachment 0, so SSAO at tool pixels uses the depth of what is behind the tool. No visible artefact in the probe.
* The group approach shares the world camera's FOV and `minZ`. Keep the tool ≥ ~0.15 m from the eye with `minZ` = 0.05. A separate viewmodel FOV isn't available this way; fake it with the tool's placement/scale.

Screenshots: `node tests/probe.mjs tests/probes/input-loop-viewmodel.probe.ts --screenshot x.png`. Quadrants: TL reference, TR group 1 + shadows, BL recommended, BR second camera.

---

## 5. Pointer lock & mouse

**API (source):**
* `engine.enterPointerlock()` calls `canvas.requestPointerLock()` with **no options** and **swallows** the promise rejection; on success it focuses the canvas.
* `engine.exitPointerlock()` calls `document.exitPointerLock()`.
* `engine.isPointerLock: boolean` is updated from `document` `pointerlockchange` (`document.pointerLockElement === canvas`).
* The DOM call is typed in TS 7 lib.dom as `requestPointerLock(options?: PointerLockOptions): Promise<void>`. Older Safari/Firefox return `undefined` at runtime, so guard with `ret?.then`.

VERIFIED in headless Chromium (Playwright 1.63, chrome-headless-shell; `input-loop-input.probe.ts`):

| situation | result |
|---|---|
| no user gesture | promise rejects `NotAllowedError: "A user gesture is required to request Pointer Lock."`. `engine.enterPointerlock()` does nothing silently |
| trusted click, `{ unadjustedMovement: true }` | rejects `NotSupportedError: "The options asked for in this request are not supported on this platform."` (Linux). A retry without options **resolves**; then `engine.isPointerLock === true` and focus is on the canvas |
| the failed `unadjustedMovement` attempt | **also** fires a `pointerlockerror` on `document`, *after* the retry's promise already resolved. Don't treat every `pointerlockerror` as "lock unavailable"; check `document.pointerLockElement` |
| sandboxed iframe **without** `allow-pointer-lock` | rejects `SecurityError: "…Blocked pointer lock on an element because the element's frame is sandboxed and the 'allow-pointer-lock' permission is not set."`, plus `pointerlockerror` and a console error |
| sandboxed iframe **with** `allow-pointer-lock` | resolves, then `pointerlockchange` |
| while locked (headless) | **event storm**: 7 `pointermove` events carried 54k coalesced entries, rAF fell to ~2 fps, `page.evaluate` took 1–3 s, `movementX/Y = 0` for Playwright moves. It recovers after `exitPointerLock()` (`input-loop-lockstorm.probe.ts`) |
| unlocked drag | `movementX/Y` exact: +80/+40 (right button, `buttons=2`) and −60/−60 (left, `buttons=1`). The first move after the cursor teleports reports the whole jump (640,360) |
| Babylon `scene.onPointerObservable` | the `POINTERMOVE` `pi.event.movementX/Y` equals the DOM values. A click gives DOWN(1), PICK(16), UP(2), TAP(32); the wheel gives `POINTERWHEEL`(8) |
| `pointerrawupdate` | supported (secure context: `localhost`/https); same deltas as `pointermove` when unlocked |
| right button | Babylon cancels the canvas `contextmenu` (`engine.disableContextMenu = true`; VERIFIED `defaultPrevented`) |

Recipe (robust fallback):
```ts
async function lock(canvas: HTMLCanvasElement): Promise<"locked" | "drag" | "retry"> {
  if (!("requestPointerLock" in canvas)) return "drag";
  const attempt = async (o?: PointerLockOptions) => { await canvas.requestPointerLock(o); };   // call from a click/pointerdown handler
  try { await attempt({ unadjustedMovement: true }); }
  catch (e) {
    const n = (e as DOMException).name;
    if (n === "NotSupportedError") { try { await attempt(); } catch (e2) { return (e2 as DOMException).name === "SecurityError" ? "drag" : "retry"; } }
    else return n === "SecurityError" ? "drag" : "retry";   // NotAllowedError: no gesture / too soon after Esc → show "click to play"
  }
  return document.pointerLockElement === canvas ? "locked" : "retry";
}
```
* Accumulate look deltas from `pointermove` on the canvas while `document.pointerLockElement === canvas`. In drag mode, accumulate while `e.buttons !== 0` and call `canvas.setPointerCapture(e.pointerId)` on `pointerdown`.
* Ignore or clamp outliers: skip the first move after `pointerdown`, and treat |d| > ~200 px per event as a teleport.
* Consume the accumulated delta once per frame in `player.update`, not per fixed step, so look stays smooth at any frame rate.
* **Headless tests:** never acquire a real lock. Give the InputSystem a virtual-lock flag and `injectLook(dx, dy)` (the skeleton probe does this: 60 px injected → yaw −0.132 rad at 0.0022 rad/px).

Unverified (headless can't show; standard Chromium behaviour):
* **Esc** always exits the lock, and the page doesn't get to cancel that. Open the pause menu on `pointerlockchange` (lock lost), not on the Escape keydown.
* Re-requesting the lock within ~1 s of the user pressing Esc is rejected.
* While locked, every mouse event targets the locked element, so overlay buttons can't be clicked.

## 6. Keyboard

* **Where the listeners live.** Babylon 9's scene input uses `DeviceSourceManager`, which attaches `keydown`/`keyup` **to the canvas** (source: `webDeviceInputSystem.js`). `scene.onKeyboardObservable` therefore fires only while the canvas has focus. The canvas gets `tabIndex = engine.canvasTabIndex` (default 1), so a click focuses it.
  - VERIFIED: with an overlay `<button>` focused, a trusted `E` reached the window listener but **not** `onKeyboardObservable`.
  - Babylon re-focuses the canvas on a canvas `pointerdown` (`scene.preventDefaultOnPointerDown`, VERIFIED).
  - **So use `window.addEventListener("keydown"/"keyup")`.**
* `event.code` is the physical key (`KeyW`, `KeyC`, `Space`, `ShiftLeft`, `ControlLeft`, `Digit1`, `Escape`, `F3`). It is layout-independent: WASD stays WASD on AZERTY. Use `event.key` only for display.
* **Key repeat (VERIFIED):** the auto-repeated keydown has `repeat === true`, both in DOM and in `kbInfo.event.repeat`. Edge-triggered actions must ignore `e.repeat`; track held keys in a Set.
* **Stuck keys:** clear the held set on `window` `blur` (VERIFIED: it fires when focus moves into an iframe), on `visibilitychange`, and when the lock is lost. Babylon's own system only resets on *canvas* blur (source).
* **Shortcuts:** `Ctrl+S` keydown is delivered with `ctrlKey` (VERIFIED); `preventDefault` cancels the browser action (spec; no save dialog exists headless to confirm). In headless, `Ctrl+W` keydown was delivered too, but the CDP key pipe then hung (VERIFIED). In real Chrome/Firefox, Ctrl+W, Ctrl+T, Ctrl+N, Ctrl+Shift+W/T/N, Ctrl+Tab, Alt+F4, Cmd+Q and Cmd+W are reserved and **cannot be cancelled** (unverified). The exception is `navigator.keyboard.lock()` in fullscreen, Chromium only; the API is present (VERIFIED `typeof === "function"`).
* **Keymap advice:**
  - **Crouch on C, not Ctrl.** Ctrl + W while moving forward closes the tab.
  - Shift for sprint is fine.
  - `preventDefault` on keydown for `Space` (scroll), `Tab` (focus traversal) and `F3` (find-next), plus Ctrl+S/D/F/P if you bind them.
  - Avoid Alt (Firefox menu bar), F5, F11, F12, Esc (reserved by lock/fullscreen) and the browser back/forward mouse buttons (`preventDefault` on `mouseup` for buttons 3/4; unverified).

## 7. HUD: HTML overlay (Babylon GUI is not installed)

`node_modules/@babylonjs` contains only `core` and `havok`, so use DOM.

```html
<div id="hud" style="position:fixed;inset:0;pointer-events:none">          <!-- crosshair, prompts, toasts -->
  <div class="menu" style="pointer-events:auto">…buttons…</div>            <!-- only while unlocked -->
</div>
```

* VERIFIED: a click on an overlay button (`pointer-events:auto`) fires the button's `pointerdown`/`click`. The canvas gets **no** `pointerdown`, and Babylon's `onPointerObservable` stays silent. Clicks on `pointer-events:none` areas go through to the canvas, which is how click-to-lock works.
* After a menu button click, focus stays on the button, and Space/Enter would re-activate it. Call `canvas.focus()` or `button.blur()` when resuming. Window-level key listeners keep working either way.
* Requesting the lock inside the "Resume" button's click handler is allowed (transient activation is document-wide). The lock target is still the canvas (spec; not runtime-verified because of the headless storm).

## 8. Picking: `scene.pickWithRay` vs Havok raycast (VERIFIED)

Each row averages 1000 random 6 m rays against N static meshes (2/3 boxes, 1/3 12-segment spheres), each with a matching static Havok body.

| N meshes (tris) | `scene.pickWithRay` | `…, fastCheck=true` | Havok `raycastToRef` |
|---|---|---|---|
| 100 (27k) | 44–106 µs | 25–39 µs | 8–11 µs |
| 400 (108k) | 215–321 µs | 112–134 µs | 7–16 µs |
| 1200 (323k) | 712–778 µs | 317–358 µs | 9–11 µs |

* `scene.pick(w/2, h/2, pred)` (crosshair through the camera, N = 400) took 330–532 µs.
* Hit agreement was 99 / 96 / 90 %.
* **A ray starting inside a shape behaves differently (VERIFIED).** The scene pick hits the inner box's back face at 0.5. Havok **skips the containing shape** and reports the next body at 4.5.
* **Use the Havok raycast for gameplay** (target info, tool hits, use key): it returns body plus child shape index (see the physics notes). Use `scene.pickWithRay(ray, predicate)` only for meshes without bodies (decals, render-only pieces), with a tight predicate and `isPickable = false` on everything else (debris, particles, viewmodel). Thin instances need `mesh.thinInstanceEnablePicking = true`.
* Default scene pointer picking (source + VERIFIED flags): `skipPointerMove/Down/UpPicking` are all `false`.
  - Babylon runs a `scene.pick` on pointer down/up whenever `scene.onPointerObservable` has non-camera observers, `scene.onPointerDown` is set, or action managers exist.
  - It picks on move only with action managers or `constantlyUpdateMeshUnderPointer`.
  - If you don't use Babylon pointer events, call `scene.detachControl()`. VERIFIED: its keyboard observable then stays silent; `engine.isPointerLock` keeps working because the engine listens on `document`. Alternatively set the three `skip…Picking = true`.

## 9. Engine creation options (VERIFIED, `input-loop-engine.probe.ts`, DPR = 1 in the harness)

```ts
const engine = new Engine(canvas, /*antialias*/ false, {
  stencil: true,                      // default true in Babylon 9 (needed by highlight/outline layers)
  powerPreference: "high-performance",// Babylon's default ONLY when doNotHandleContextLost is false
  preserveDrawingBuffer: false,       // default; Playwright screenshots don't need it
  audioEngine: false,                 // default; our AudioSystem owns its AudioContext
  // adaptToDeviceRatio: true,        // = native HiDPI resolution; costly; prefer explicit scaling
});
engine.setHardwareScalingLevel(1 / settings.quality.resolutionScale);   // 0.6 → render 768×432 for a 1280×720 canvas
new ResizeObserver(() => engine.resize()).observe(canvas);              // or window "resize"
```

`new Engine(canvas)` produced these context attributes:

| attribute | value |
|---|---|
| `antialias` | `true` (the browser default when the argument is undefined; pass `false` explicitly) |
| `stencil` | `true` |
| `depth` | `true` |
| `alpha` | `true` |
| `premultipliedAlpha` | `true` |
| `preserveDrawingBuffer` | `false` |
| `powerPreference` | `"high-performance"` |
| `desynchronized` | `false` |

Other defaults: WebGL2, hardware scaling 1, `maxMSAASamples` 4, `AbstractEngine.audioEngine` null, `disableContextMenu` true, `canvasTabIndex` 1.

* **Antialiasing.** With DefaultRenderingPipeline the scene renders into an RT, so canvas MSAA is wasted. Use `pipeline.samples` or FXAA instead (source).
* **`doNotHandleContextLost: true`** → the context gets `powerPreference: "default"` (VERIFIED). Babylon also stops keeping CPU copies of raw/loaded texture buffers (source).
* **`audioEngine: true`** creates Babylon's legacy AudioEngine with its own (running) AudioContext. It is disposed with the engine, and dispose logs "GainNode … context is closed" warnings.
* **`setHardwareScalingLevel(l)`.** Render size = CSS size / l: l = 0.5 gives 2560×1440 (supersampling). Each call fires `onResizeObservable`.
* **Resize.** Changing the canvas CSS size does nothing until `engine.resize()` (1280 → 640 wide). Signature: `engine.resize(forceSetSize?: boolean)`.
* **`preserveDrawingBuffer: false`.**
  - `canvas.toDataURL()` in the **same task** as `scene.render()` is correct; after frames were presented it is blank (0,0,0,0).
  - `engine.readPixels(x, y, w, h)` returns `Promise<ArrayBufferView>`, with a bottom-left origin. Called right after `render()` it works.
  - `page.screenshot()` captured the canvas with the loop stopped.
* **`CreateScreenshotUsingRenderTargetAsync(engine, camera, {width, height})`** works with `preserveDrawingBuffer: false` (218 ms for 64²). It **hangs unless `engine.runRenderLoop` is running**, because it waits for `engine.onEndFrameObservable`.
* **Context loss.** `WEBGL_lose_context` → `onContextLostObservable`; restore → `onContextRestoredObservable`; rendering resumes with correct output, and `render()` while lost didn't throw.
* **WebGPUEngine (note only).** `navigator.gpu` exists headless but has no adapter, so `await WebGPUEngine.IsSupportedAsync === false`. Stay on WebGL2.

## 10. Babylon 9 specifics worth knowing

* **Side-effect stubs.** Augmented methods are stubs unless their module was imported; importing from the package root registers everything (all probes do).
  - `scene.pickWithRay` stub **throws** "Ray needs to be imported before…".
  - `scene.pick` stub **returns an empty `PickingInfo`** and warns once.
  - Generic `_MissingSideEffect` stubs return `undefined` **silently**. `SetMissingSideEffectWarningsEnabled(true)` from `@babylonjs/core/Misc/devTools.js` makes them warn; it is not re-exported from the root.
  - `scene.enablePhysics`, `getPhysicsEngine`, `onBefore/AfterPhysicsObservable` and `_advancePhysicsEngineStep` come from `joinedPhysicsEngineComponent`.
* **`PhysicsEngineV2`** is the root export name of the v2 physics engine class. `getBodies()` is not on `IPhysicsEngine`, so cast `scene.getPhysicsEngine() as PhysicsEngineV2`.
* **Scene input:** `DeviceSourceManager` with canvas-bound keyboard listeners; new `canvasTabIndex` engine option (default 1); see §6.
* **TargetCamera:** framerate-independent inertia (`camera.movement`); irrelevant without inputs.
* **`PhysicsBody.disablePreStep` defaults to `true`** (source). Moving a node by hand doesn't move its body unless `disablePreStep = false` or `setTargetTransform(...)` is used (physics notes).
* **TS:** `erasableSyntaxOnly` rejects constructor parameter properties (`constructor(private x: T)` → TS1294, VERIFIED); `enum`s and `namespace`s are rejected too.

## Pitfalls

1. Leaving `scene.physicsEnabled = true` while also stepping manually makes physics advance twice: once by wall-clock time in `render()`, once by us.
2. `physicsEngine.setTimeStep(0)` does not stop render-driven stepping when `HavokPlugin(true)` is used. It does make `applyForce`/`applyTorque` no-ops: they multiply by `getTimeStep()` (VERIFIED: 100 N → vx 0). If `FIXED_DT` ever changes, call `setTimeStep(FIXED_DT)` as well.
3. `_step(0)` steps 1/60 s, and `_step(dt > 0.1)` is clamped to 0.1. Never use dt = 0 to mean "pause"; run zero steps instead.
4. `engine.getTimeStep()` is in **ms** (16.67) but `physicsEngine.getTimeStep()` is in **s** (0.0167). `_advancePhysicsEngineStep` takes **ms**; `_step`/`executeStep` take **s**.
5. `engine.getDeltaTime()` is 0 outside `runRenderLoop`, so manual `scene.render()` loops step physics 1 ms each and the RTT screenshot helper hangs.
6. Physics steps hooked to `onBeforeRenderObservable` run inside `render()`, after anything done before `scene.render()` (for example a camera pose set in the loop callback), which then shows the previous step. Keep input → steps → camera → `scene.render()` in the `runRenderLoop` callback.
7. `scene.animationsEnabled = false` as a pause makes Animatables jump on resume. Use `scene.animationTimeScale = 0`. Particle systems need `updateSpeed = 0` or `particlesEnabled = false` (the latter hides them).
8. The camera's default `minZ` is 1 m, so walls vanish when you stand close. Positive `rotation.x` looks down. At pitch ±π/2 the view flips; clamp it. Don't switch between `rotationQuaternion` and `rotation` (stale view).
9. The viewmodel in group 1 still receives the wall's shadow and makes an SSAO halo unless you set `receiveShadows = false` and add its material to `prePassRenderer.excludedMaterials`. The second-camera approach disappears with SSAO2 and isn't tone-mapped.
10. `scene.onKeyboardObservable` needs canvas focus; use window listeners. Ignore `e.repeat` for edge actions, and clear held keys on blur, visibility change and lock loss.
11. `engine.enterPointerlock()` swallows errors and has no `unadjustedMovement`; call `canvas.requestPointerLock()` yourself from a click handler. A failed `unadjustedMovement` attempt emits a late `pointerlockerror` even if the retry succeeds.
12. Headless Chromium + real pointer lock = an event storm with `movementX = 0`. Automated tests must use virtual lock and injected look deltas. Drag-to-look (unlocked) gives exact deltas.
13. Don't bind crouch to Ctrl: Ctrl+W can't be prevented. Pause on `pointerlockchange`, not on Escape.
14. Pass `antialias: false` explicitly: undefined means browser default `true`, and it is wasted under the post pipeline. `doNotHandleContextLost: true` silently drops Babylon's `powerPreference: "high-performance"`.
15. With `preserveDrawingBuffer: false`, read pixels (`readPixels`/`toDataURL`) in the same task as `render()`. Playwright `page.screenshot()` is fine without it.
16. Havok raycasts ignore the shape that contains the ray origin; `scene.pickWithRay` doesn't. `scene.pickWithRay` cost grows with mesh and triangle count (up to ~0.8 ms at 1200 meshes), so don't call it per fixed step for many rays.
