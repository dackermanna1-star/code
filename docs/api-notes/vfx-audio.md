# API notes: particles, micro-debris, decals, audio (Babylon.js 9.30.0)

Verified on 2026-10-28 against `node_modules/@babylonjs/core` 9.30.0 (`.d.ts` and `.js`) and at runtime
in headless Chromium (SwiftShader WebGL2) with `tests/probe.mjs`. **VERIFIED** = ran in a probe;
**source** = read in the installed sources, not exercised.

## TL;DR

1. **Bursts:** use one CPU `ParticleSystem` per effect type, with `emitter = Vector3.Zero()`, `manualEmitCount` set
   to the sum of queued bursts, and a `startPositionFunction` / `startDirectionFunction` that reads a burst queue.
   This gives many positions, tints and sizes in one frame from one system with one draw call (VERIFIED, screenshot).
2. **Time units:** particle time is `updateSpeed × scene.getAnimationRatio()` per rendered frame, not seconds.
   Set `ps.updateSpeed = gameDt / scene.getAnimationRatio()` in `scene.onBeforeParticlesRenderingObservable`.
   Lifetimes are then in s, emitPower in m/s, gravity in m/s², emitRate in particles/s (VERIFIED, exact).
3. **`disposeOnStop` destroys the shared texture:** the scene disposes stopped systems with `dispose()`, and
   `disposeTexture` defaults to true. Never share a texture with a `disposeOnStop` system; call `dispose(false)` yourself (VERIFIED).
4. **GPU particles:** `GPUParticleSystem` works here (`IsSupported` is true). It has no start or update functions
   and only one emitter matrix per frame. Use it only for single-emitter, high-count streams such as a water spray.
5. **Micro-debris:** use **thin instances** (a dynamic `"matrix"` buffer plus a `"color"` buffer). At 5000 shards,
   writing and uploading the matrices costs about 0.3 ms per frame. SPS `setParticles` costs 3.6–5.2 ms (VERIFIED).
   A material plugin can read a custom per-instance attribute (for example `surf`) (VERIFIED).
6. **Decals:** `MeshBuilder.CreateDecal` works on custom VertexData meshes, but **needs normals**, costs
   O(source triangles) (about 24–38 ms for 29k triangles), and adds one draw call per decal unless merged.
   Decal maps (`MeshUVSpaceRenderer`) need **unique UVs in UV set 1**. Our tiling planar UVs do not qualify.
7. **Audio:** `new Engine()` does **not** create an AudioContext (`audioEngine` option is off by default) (VERIFIED).
   Use **raw Web Audio**. **Flip Z** when passing Babylon (left-handed) coordinates, or left and right are swapped (VERIFIED).
   **Pre-warm HRTF** on the realtime context, or an HRTF `OfflineAudioContext` render can hang (2 of 6 runs).
8. **Startup budget:** synthesising 150 modal buffers (135 s of audio, 12 modes each) takes about 0.2–0.5 s in JS
   using a rotation oscillator (naive `Math.sin`/`Math.exp` is about 20× slower). OGG Vorbis `decodeAudioData` works (VERIFIED).

**Measurement caveat:** other agents loaded the 4-vCPU box heavily the whole time (load average 10–30). A plain-JS
loop of 1e7 multiply-adds took 40–63 ms, which is roughly 4–5× an idle desktop. Treat absolute milliseconds as
pessimistic and the ratios as reliable. GPU times are meaningless under SwiftShader. Measured frames called
`gl.finish()` outside the timed region.

Probes (all under `tests/probes/`):

| probe | what it covers |
|---|---|
| `vfx-audio-particles.probe.ts` | CPU particles, pooled bursts, GPU particles, emitters, one-shots |
| `vfx-audio-emitcost.probe.ts` | per-particle emission and update cost |
| `vfx-audio-debris.probe.ts` | thin instances vs SPS |
| `vfx-audio-instattr.probe.ts` | per-instance attribute through a material plugin |
| `vfx-audio-decals.probe.ts` | CreateDecal and decal maps |
| `vfx-audio-webaudio.probe.ts` | Babylon audio and raw Web Audio |
| `vfx-audio-hrtfdebug.probe.ts` | reproduces the HRTF offline hang |

Shared helpers are in `vfx-audio-util.ts`. Run a probe with
`node tests/probe.mjs tests/probes/<file> [--screenshot out.png]`. Screenshots from the last runs:
`/tmp/claude-0/va-particles.png`, `va-debris.png`, `va-decals.png`, `va-instattr.png`.

---

## 1. CPU `ParticleSystem`

### 1.1 Signatures (from `Particles/thinParticleSystem.pure.d.ts` / `baseParticleSystem.pure.d.ts`)

```ts
new ParticleSystem(name: string, capacity: number, sceneOrEngine: Scene | AbstractEngine,
  customEffect?: Nullable<Effect>, isAnimationSheetEnabled?: boolean, epsilon?: number, noUpdateQueue?: boolean)
ps.start(delay?: number): void;   ps.stop(stopSubEmitters?: boolean): void;   ps.reset(): void  // reset() also empties the recycled stock
ps.dispose(disposeTexture = true, disposeAttachedSubEmitters = false, disposeEndSubEmitters = false): void
ps.getActiveCount(): number; ps.getCapacity(): number; ps.isReady(): boolean; ps.isAlive(): boolean; ps.isStarted(): boolean
ps.particles: Particle[]                      // live particles (position, direction, color, colorStep, lifeTime, age, size, scale, angle, angularSpeed, metadata)
ps.startPositionFunction:  Nullable<(worldMatrix: Matrix, positionToUpdate: Vector3, particle: Particle, isLocal: boolean) => void>
ps.startDirectionFunction: Nullable<(worldMatrix: Matrix, directionToUpdate: Vector3, particle: Particle, isLocal: boolean) => void>
ps.updateFunction: (particles: Particle[]) => void   // REPLACES the default per-frame update (aging, motion, recycling)
ps.recycleParticle: (particle: Particle) => void
ps.onStoppedObservable / onStartedObservable / onDisposeObservable; ps.onAnimationEnd: Nullable<() => void>
// emitter shapes (defaults from baseParticleSystem.pure.js)
createPointEmitter(direction1, direction2)
createBoxEmitter(direction1, direction2, minEmitBox, maxEmitBox)          // the default emitter type is a BoxParticleEmitter
createSphereEmitter(radius = 1, radiusRange = 1)    createDirectedSphereEmitter(radius = 1, dir1 = up, dir2 = up)
createHemisphericEmitter(radius = 1, radiusRange = 1)
createCylinderEmitter(radius = 1, height = 1, radiusRange = 1, directionRandomizer = 0)
createConeEmitter(radius = 1, angle = Math.PI / 4)   // angle = FULL apex angle (half-angle = angle/2)
createMeshEmitter(mesh = null)
ps.particleEmitterType = new CustomParticleEmitter()  // particlePositionGenerator(index, particle, out), particleDirectionGenerator(...)
// gradients (all return the system)
addColorGradient(g, color1: Color4, color2?)  addSizeGradient(g, f, f2?)  addDragGradient(g, f, f2?)  addVelocityGradient(...)
addLimitVelocityGradient(...)  addAngularSpeedGradient(...)  addEmitRateGradient(...)*  addStartSizeGradient(...)*  addLifeTimeGradient(...)*
addColorRemapGradient / addAlphaRemapGradient (need useRampGradients)     // * need targetStopDuration (start() THROWS otherwise)
```

**Defaults** (from `baseParticleSystem.pure.js`):

| property | default |
|---|---|
| `emitRate` | 10 |
| `manualEmitCount` | −1 (rate mode) |
| `updateSpeed` | 0.01 |
| `minLifeTime` / `maxLifeTime` | 1 |
| `minSize` / `maxSize` | 1 |
| `minEmitPower` / `maxEmitPower` | 1 |
| `gravity` | 0 |
| `blendMode` | `BLENDMODE_ONEONE` |
| `color1`, `color2` | white |
| `colorDead` | **(0,0,0,1)**, opaque black: set alpha 0 for `BLENDMODE_STANDARD` |
| `billboardMode` | `BILLBOARDMODE_ALL` (7) |
| `isBillboardBased` | true |
| `disposeOnStop` | false |
| `particleTexture` | null, which keeps `isReady()` false: the system never runs |

**Constants:**

- Blend modes: `ParticleSystem.BLENDMODE_ONEONE = 0`, `STANDARD = 1` (alpha), `ADD = 2` (additive weighted by
  alpha), `MULTIPLY = 3`, `MULTIPLYADD = 4` (renders twice), `SUBTRACT = -1`.
- Billboard modes: `BILLBOARDMODE_Y = 2`, `ALL = 7`, `STRETCHED = 8` (quad's V axis follows `particle.direction`),
  `STRETCHED_LOCAL = 9`.

### 1.2 How a frame runs (source, plus VERIFIED where noted)

- `scene.render()` calls `scene.animate()`. That sets `_animationRatio = clamp(engine.getDeltaTime(), 1, 1000) * 0.06`,
  which is 1.0 at 60 fps. Then `_evaluateActiveMeshes()` fires `onBeforeParticlesRenderingObservable`, and every
  started system with a non-null emitter calls `ps.animate()`, which is guarded to run at most once per scene frame.
  Then `onAfterParticlesRenderingObservable` fires. If the emitter is a disabled mesh, the system is neither animated nor drawn (it freezes).
- `animate()` returns early unless `isReady()`. That requires shaders loaded, the texture ready and the effect compiled.
- `animate()` steps:
  - It computes `_scaledUpdateSpeed = updateSpeed * scene.getAnimationRatio()`.
  - If `manualEmitCount > -1`, it emits exactly that many and **sets it back to 0**, and `emitRate` is ignored.
    Otherwise it emits `emitRate * _scaledUpdateSpeed` particles, carrying the fraction over to the next frame.
  - It runs `updateFunction(particles)`, then creates the new particles. New particles therefore do not move in their creation frame.
  - It uploads the vertex buffer.
- Per particle, the default update does `age += s; position += direction*s; direction += gravity*s`. Position is
  updated before gravity (semi-implicit Euler). Gradients are evaluated at `age / lifeTime`.
- **Creation queue order** (per particle, the whole queue runs before the next particle):
  lifetime (also picks `_emitPower`) → position → [isLocal] → direction → emitPower scaling → size → [startSize] →
  angle → [velocity/limitVelocity gradients] → color → [drag] → colorDead → [ramp/sheet/noise].
  So system fields changed inside `startPositionFunction` (`color1`, `color2`, `colorDead`, `minScaleX/Y`, `minSize`…)
  apply to **that particle only**. This is what makes per-burst tint and size possible. VERIFIED.
- When more particles are requested than `capacity` allows, the excess is silently dropped. VERIFIED: 160 queued into capacity 100 gave 100 active.
- Gravity, drag, size and colour are all per system. Particles have **no collision**; wrap `updateFunction` for that (§1.7).

### 1.3 SI time units, also when paused or in slow motion (VERIFIED)

```ts
// game time (frameDt * time.scale) per rendered frame -> every pooled system advances exactly that much
function installParticleClock(scene: Scene, systems: ParticleSystem[], gameDt: () => number): void {
  scene.onBeforeParticlesRenderingObservable.add(() => {
    const ratio = scene.getAnimationRatio();
    const s = gameDt() / ratio;
    for (const ps of systems) ps.updateSpeed = s;
  });
}
```

**VERIFIED:** a particle launched with `emitPower` 5 and gravity −9.81 reached y = **0.177** after 60 frames of
1/60 s, which matches the semi-implicit Euler prediction 0.177 exactly; its `age` was exactly 1.000. The ratio
observed in the tight probe loop was 0.06 (engine delta clamped to 1 ms), and the hook compensated.

- Without the hook, the default `updateSpeed` of 0.01 means `lifeTime` 1 lasts about 1.67 s at 60 fps, and motion
  depends on frame time.
- `gameDt = 0` freezes particles; `manualEmitCount` bursts still spawn.
- This hook fires even when `scene.render(…, ignoreAnimations = true)` skips `animate()`. The stale ratio is divided
  out anyway (source).
- **Pre-warm** uses `updateSpeed * preWarmStepOffset` with no ratio. Set `updateSpeed = 1/60` **before** `start()`
  on systems that use `preWarmCycles`.

### 1.4 Pooled multi-position bursts: the recommended pattern (VERIFIED, `/tmp/claude-0/va-particles.png`)

This is the exact code from `vfx-audio-particles.probe.ts`:

```ts
export interface Burst {
  x: number; y: number; z: number; // world position
  nx: number; ny: number; nz: number; // surface normal (unit)
  count: number;
  speed: number; // m/s
  spread: number; // 0 = along normal, 1 = wide hemisphere
  radius: number; // spawn sphere radius (m)
  r: number; g: number; b: number; a: number; // tint (start colour)
  sizeMul: number;
}

export class BurstPool {
  readonly ps: ParticleSystem;
  private queue: Burst[] = [];
  private cur = 0;
  private left = 0;
  private active: Burst | null = null;
  emitted = 0;
  dropped = 0;
  /** scaleY multiplier (streak length for BILLBOARDMODE_STRETCHED). */
  stretch = 1;

  constructor(name: string, capacity: number, scene: Scene, texture: BaseTexture) {
    const ps = new ParticleSystem(name, capacity, scene);
    ps.particleTexture = texture;
    ps.emitter = Vector3.Zero(); // identity emitter matrix -> start functions write WORLD coords
    ps.manualEmitCount = 0; // manual mode (>-1): emitRate is ignored, only queued bursts emit
    ps.minEmitPower = 1;
    ps.maxEmitPower = 1; // direction function writes the full velocity (m/s with the clock hook)
    ps.startPositionFunction = (_wm: Matrix, pos: Vector3, p: Particle) => {
      const b = this.next();
      if (!b) {
        pos.set(0, -1e4, 0);
        p.lifeTime = 0;
        return;
      }
      // random point in a sphere of radius b.radius, pushed off the surface along the normal
      const r = b.radius * Math.cbrt(Math.random());
      const [ux, uy, uz] = randUnit();
      pos.set(b.x + ux * r + b.nx * b.radius, b.y + uy * r + b.ny * b.radius, b.z + uz * r + b.nz * b.radius);
      // creation queue order: lifetime -> position -> direction -> emitPower -> size -> angle -> color -> colorDead,
      // so system-level fields mutated HERE are picked up by the later steps for this particle only.
      ps.color1.set(b.r, b.g, b.b, b.a);
      ps.color2.set(b.r * 0.85, b.g * 0.85, b.b * 0.85, b.a);
      ps.colorDead.set(b.r, b.g, b.b, 0);
      ps.minScaleX = ps.maxScaleX = b.sizeMul;
      ps.minScaleY = ps.maxScaleY = b.sizeMul * this.stretch;
      p.metadata = b; // copied by recycleParticle's swap (Particle.copyTo copies metadata)
    };
    ps.startDirectionFunction = (_wm: Matrix, dir: Vector3) => {
      const b = this.active;
      if (!b) return;
      const [ux, uy, uz] = randUnit();
      const dx = b.nx + ux * b.spread;
      const dy = b.ny + uy * b.spread;
      const dz = b.nz + uz * b.spread;
      const len = Math.hypot(dx, dy, dz) || 1;
      const sp = b.speed * (0.35 + 0.65 * Math.random());
      dir.set((dx / len) * sp, (dy / len) * sp, (dz / len) * sp);
    };
    ps.start();
    this.ps = ps;
    // Clear the queue once the system consumed it (animate() sets manualEmitCount back to 0).
    scene.onAfterParticlesRenderingObservable.add(() => {
      if (ps.manualEmitCount === 0) {
        this.dropped += this.remaining();
        this.queue.length = 0;
        this.cur = 0;
        this.left = 0;
        this.active = null;
      }
    });
  }

  burst(b: Burst): void {
    this.queue.push(b);
    this.ps.manualEmitCount += b.count;
  }

  private remaining(): number {
    let n = this.left;
    for (let i = this.cur; i < this.queue.length; i++) n += this.queue[i].count;
    return n;
  }

  private next(): Burst | null {
    while (this.left <= 0) {
      if (this.cur >= this.queue.length) return null;
      this.active = this.queue[this.cur++];
      this.left = this.active.count;
    }
    this.left--;
    this.emitted++;
    return this.active;
  }
}
// randUnit(): uniform random unit vector (see probe)
```

Configuration used in the probe:

```ts
const dust = new BurstPool("dustPool", 3000, scene, puffTexture);
dust.ps.blendMode = ParticleSystem.BLENDMODE_STANDARD;
dust.ps.minLifeTime = 1.2; dust.ps.maxLifeTime = 2.4;      // s (clock hook)
dust.ps.minSize = 0.12; dust.ps.maxSize = 0.35;             // m
dust.ps.minAngularSpeed = -1; dust.ps.maxAngularSpeed = 1;  // rad/s
dust.ps.gravity = new Vector3(0, -0.6, 0);
dust.ps.addDragGradient(0, 0.04); dust.ps.addDragGradient(1, 0.08);   // drag = fraction of velocity removed per step
const sparks = new BurstPool("sparkPool", 1000, scene, streakTexture);
sparks.ps.blendMode = ParticleSystem.BLENDMODE_ADD;
sparks.ps.billboardMode = ParticleSystem.BILLBOARDMODE_STRETCHED; sparks.stretch = 6;  // streak length = scaleY
sparks.ps.gravity = new Vector3(0, -9.81, 0);
sparks.ps.addColorGradient(0, new Color4(1, 1, 0.9, 1));
sparks.ps.addColorGradient(0.4, new Color4(1, 0.75, 0.3, 1));
sparks.ps.addColorGradient(1, new Color4(0.8, 0.2, 0.05, 0));
dust.burst({ x: -2.2, y: 0, z: 0, nx: 0, ny: 1, nz: 0, count: 400, speed: 1.6, spread: 0.9, radius: 0.08,
             r: 0.62, g: 0.48, b: 0.33, a: 0.9, sizeMul: 1 });   // + 2 more bursts and 2 spark bursts, same frame
```

**VERIFIED results:**

- Three dust bursts of 400 particles each, queued in one frame (wood brown on the floor, drywall white on the wall,
  concrete grey on the floor), produced 1200 particles in that frame.
- The per-group centroids matched the burst positions: (−2.199, 0.08, 0), (−0.003, 1.597, 1.902), (2.199, 0.077, 0).
- The tint was applied per particle.
- `manualEmitCount` went back to 0.
- The frame took 4 draw calls (floor, wall, dust pool, spark pool).
- The sparks came out as velocity-aligned streaks.

Limits of the pattern:

- Per-burst tint only works with `color1`/`color2`/`colorDead`, which fade linearly to `colorDead`. Colour
  gradients are system-wide, so pools that use them (sparks) keep a fixed palette.
- A per-burst size multiplier works through `minScaleX/Y` and composes with size gradients.
- Per-burst speed comes from the direction function, because `emitPower` is 1.

**One pool vs many systems (VERIFIED):**

| approach | draw calls | construction | readiness |
|---|---|---|---|
| 30 separate one-shot systems × 60 particles | 30 (32 incl. scene) | 2.4–6.1 ms for 30 | 0/30 ready without yielding, 30/30 after one `setTimeout` tick |
| same 30 bursts through one pool | 1 | queueing cost ≈ 0 | ready |

Separate systems also bring the `disposeOnStop` texture trap (§1.6). Pre-create the pools at load time.

### 1.5 Textures from a canvas (VERIFIED)

```ts
const tex = new DynamicTexture("puffTex", { width: 64, height: 64 }, scene, true /*mips*/);
const ctx = tex.getContext();                      // ICanvasRenderingContext: has createRadialGradient, get/putImageData
const g = ctx.createRadialGradient(32, 32, 0, 32, 32, 32);
g.addColorStop(0, "rgba(255,255,255,1)"); g.addColorStop(0.35, "rgba(255,255,255,0.55)"); g.addColorStop(1, "rgba(255,255,255,0)");
ctx.clearRect(0, 0, 64, 64); ctx.fillStyle = g; ctx.fillRect(0, 0, 64, 64);
tex.hasAlpha = true;
tex.update();
```

- For the spark streak, build a 16×64 texture with `putImageData`, using `alpha = exp(-u²/0.08)·(1−v²)`, so the
  streak is long along **V**. `BILLBOARDMODE_STRETCHED` aligns V with `particle.direction`.
- Streak length comes from `scaleY`. It does **not** depend on speed; to make it speed-dependent, set
  `particle.scale.y` in a wrapped `updateFunction`.
- Draw white textures and tint them through particle colour.

### 1.6 One-shot systems: `targetStopDuration`, `disposeOnStop`, pre-warm (VERIFIED)

- `targetStopDuration` uses clocked seconds. **Pre-warm time counts toward it.** With 30 pre-warm cycles of 1/60 s,
  `_actualFrame` was already 0.5, so a system with target 1.0 stopped after 29 more frames. The system was disposed
  at frame 62, once its 0.5 s particles had died. Active-particle counts sampled every 10 frames were
  62, 62, 62, 42, 22, 2.
- `preWarmCycles = 30` gave 60 live particles immediately after `start()`.
- `disposeOnStop = true`: once a system is stopped and has no live particles, it goes into `scene._toBeDisposed`,
  and the scene calls **`dispose()` with no arguments**, so `disposeTexture = true`.
  **VERIFIED:** the shared texture's `getInternalTexture()` became null, and every other system using that texture
  silently stopped rendering.
- With `manualEmitCount` set and `disposeOnStop` true, the system stops itself on the frame after it emits.

Safe one-shot (VERIFIED, disposed after 20 frames, shared texture intact):

```ts
const toDispose: ParticleSystem[] = [];
safe.onAnimationEnd = () => toDispose.push(safe);       // fired inside animate() once stopped && nothing alive
scene.onAfterRenderObservable.add(() => { for (const ps of toDispose) ps.dispose(false); toDispose.length = 0; });
```

### 1.7 Wrapping `updateFunction`, e.g. floor bounce (VERIFIED)

```ts
const baseUpdate = ps.updateFunction;          // keep default aging / motion / gravity / recycling
ps.updateFunction = (particles: Particle[]) => {
  baseUpdate(particles);                         // dead particles are already swapped out of the array here
  for (const p of particles) {
    if (p.position.y < 0) { p.position.y = 0; if (p.direction.y < 0) p.direction.y *= -0.4; }
  }
};
```

- Result: minimum y over 92 frames was 0, there were 4156 bounces, and all particles died on schedule.
- If you replace `updateFunction` entirely, you must age, move and recycle the particles yourself
  (`ps.recycleParticle(p)` swaps the last particle into `p`).

### 1.8 Emitter types (VERIFIED, 200 particles each)

| emitter | result |
|---|---|
| point | every particle at the emitter; speed = `emitPower` (2.011) |
| box | positions within min/max box: max \|xyz\| = (0.5, 0.099, 0.2) |
| sphere(0.5) | max radius 0.499 |
| cone(0.3, π/4) | max angle to +Y **22.3°**, max radial offset 0.29 |
| `CustomParticleEmitter` on CPU | generator **index is always −1**; output is emitter-local (transformed by the emitter matrix) |

The cone row shows that the `angle` argument is the full apex angle. The custom-emitter index is meaningful only on
GPU. On CPU, use `system.startPositionFunction` instead.

### 1.9 CPU cost (VERIFIED, `vfx-audio-emitcost.probe.ts`, medians over repeats, loaded box)

| config (2000 particles) | emit, recycled stock | update / frame |
|---|---|---|
| default box emitter | 0.4–1.0 µs/particle | 0.2–0.3 µs/particle |
| custom start functions | 0.55–0.65 µs | 0.3–0.45 µs |
| + drag gradient | 1.0–1.7 µs | 0.45–0.55 µs |
| + drag, colour and size gradients | 1.45–2.25 µs | 0.7–0.85 µs |

- **First emission allocates `Particle` objects:** 2000 particles took 15–107 ms (about 10–50 µs each). Pre-fill
  every pool's stock at load: emit `capacity` particles off-screen, set their `lifeTime = 0` and render one frame.
  Do **not** call `reset()`, which empties the stock too.
- Whole `animate()` with drag and custom functions: 2000 live particles 1.0–2.2 ms, 5000 live particles 2.4–4.7 ms
  per frame. Budget with the particle counts above in mind.
- Each pool is one draw call. MULTIPLYADD costs two.

### 1.10 Readiness (VERIFIED)

- Babylon 9 particle shaders are loaded with a dynamic `import()` **per system instance**, so `isReady()` stays false
  until the event loop turns. Tight synchronous loops right after creation do nothing.
- Queued `manualEmitCount` is kept until the system becomes ready.
- The very first system of a scene needed about 130 ms (shader compile); later systems with the same blend mode
  became ready after one tick.

---

## 2. `GPUParticleSystem`

```ts
static get IsSupported(): boolean   // caps.supportTransformFeedbacks || caps.supportComputeShaders -> TRUE here (WebGL2)
new GPUParticleSystem(name, options: Partial<{ capacity: number; randomTextureSize: number; emitRateControl: boolean; maxAttractors: number }>,
                      sceneOrEngine, customEffect?, isAnimationSheetEnabled?)
gps.maxActiveParticleCount; gps.emitRateControl /* false: dead slots recycled immediately */; gps.isGPU === true
GPUParticleSystem.fromParticleSystem(cpuPs, scene, options?)  // copies settings; warns & drops unsupported features
```

VERIFIED: setup was `capacity` 20000, a cone emitter, `emitRate` 2000/s and lifetime 0.5–1 s.

- `getActiveCount()` was 1033 after 30 frames.
- Setting `emitRate = 0` then `manualEmitCount = 500` raised it to 1533: manual bursts accumulate and work.
- Main-thread cost was about 0.3–0.4 ms per frame.
- The first update-shader compile took **6.4–12.8 s** on SwiftShader. On real GPUs it is much faster, but create
  these systems at load.

Differences from the CPU system (source):

- No `startPositionFunction`, `startDirectionFunction`, `updateFunction`, sub-emitters, `customShader` or ramp/remap
  gradients. `"startPositionFunction" in gps` is false.
- Spawn positions come only from the emitter type and **one emitter world matrix per frame**, so one system cannot
  burst at several places in the same frame.
- No per-particle tint.
- `getActiveCount()` reports active slots, not an exact count of live particles.

**Use it for** continuous, high-count, single-emitter effects: broken-pipe water spray, the extinguisher plume, smoke
columns, ambient dust motes. **Use CPU pools for** per-impact bursts.

---

## 3. Micro-debris: thin instances vs `SolidParticleSystem`

Both renderers were driven by the same JS ballistic simulation: gravity, floor at y = 0 with restitution 0.3 and
friction, quaternion spin, sleep below 0.1 m/s. The shards were 12-vertex flat tetrahedra, one draw call each.
VERIFIED; screenshot `va-debris.png`.

| per frame (median) | 2000 shards | 5000 shards |
|---|---|---|
| simulation step (all awake → mostly asleep) | 0.3 → 0.2 ms | 1.4 → 0.7–0.9 ms |
| **thin instances**: write 16-float matrices | 0.1 ms | 0.1–0.2 ms |
| **thin instances**: `thinInstanceBufferUpdated("matrix")` | 0.05–0.1 ms | 0.1 ms |
| SPS: copy position, quaternion and scale into `sps.particles` | 0.1–0.2 ms | 0.5–0.7 ms |
| SPS: `setParticles()` (JS-transforms every vertex) | 1.4–1.5 ms | 3.6–5.2 ms (p90 up to 11) |
| one-time: `buildMesh()` / `thinInstanceSetBuffer` (+bounds) | 63–82 ms / 9–53 ms | |

Other SPS and thin-instance facts:

- SPS cost scales with **vertices × particles**; thin-instance cost scales with particles only.
- Expandable SPS: `addShape(model, 100)` 2–8 ms plus `buildMesh()` 5–8 ms. `removeParticles(0, 99)` **33–57 ms**
  plus `buildMesh()` 6 ms. Runtime add and remove are too slow for debris churn.
- Thin-instance bounds: `thinInstanceSetBuffer("matrix")` calls `thinInstanceRefreshBoundingInfo` (7–26 ms at 5000).
  With `mesh.doNotSyncBoundingInfo = true`, setting a 10000-instance buffer took **0.2 ms**.

**Recommendation: thin instances.** The code below assembles pieces that ran in `vfx-audio-debris.probe.ts`.
`doNotSyncBoundingInfo` was verified in the regrow step; `thinInstancePartialBufferUpdate` is from source only.

```ts
const mesh = makeShard(scene);                       // any small Mesh with normals; StandardMaterial/PBR or the world material
mesh.material = mat;                                 // mat.diffuseColor = white: "instanceColor" multiplies it (VERIFIED)
mesh.doNotSyncBoundingInfo = true;                   // skip the O(n) bounds refresh in thinInstanceSetBuffer
mesh.alwaysSelectAsActiveMesh = true;                // instances move -> never frustum-cull the batch
const matBuf = new Float32Array(cap * 16), colBuf = new Float32Array(cap * 4);
mesh.thinInstanceSetBuffer("matrix", matBuf, 16, false);   // 4th arg false = DYNAMIC buffer (default true = static!)
mesh.thinInstanceSetBuffer("color", colBuf, 4, false);     // kind "color" is mapped to "instanceColor"
// per frame, after the sim step:
writeMatrices(sim, matBuf);                          // compose(scale, quat, pos) inline, Babylon layout: translation at [12..14]
mesh.thinInstanceCount = sim.n;                      // must be <= capacity (larger values are silently ignored)
mesh.thinInstanceBufferUpdated("matrix");            // uploads only thinInstanceCount matrices
// after spawning into slots [a, a+k): mesh.thinInstancePartialBufferUpdate("color", k, a)  (source; bufferUpdated("color") uploads ALL)
// grow: allocate a bigger array, copy, thinInstanceSetBuffer again (3.8-10.8 ms at 10000; 0.2 ms with doNotSyncBoundingInfo)
```

Matrix layout (same as `Matrix.ComposeToRef`). With `x2 = 2x`, `xx = x·x2`, `wx = w·x2` and so on:

```
o[0] = (1-(yy+zz))·s   o[1] = (xy+wz)·s       o[2]  = (xz-wy)·s       o[3]  = 0
o[4] = (xy-wz)·s       o[5] = (1-(xx+zz))·s   o[6]  = (yz+wx)·s       o[7]  = 0
o[8] = (xz+wy)·s       o[9] = (yz-wx)·s       o[10] = (1-(xx+yy))·s   o[11] = 0
o[12..14] = position   o[15] = 1
```

**Per-instance custom attribute** (for example the `surf` texture layer), VERIFIED in `vfx-audio-instattr.probe.ts`:
nine instances drew red, green and blue columns from an `instSurf` buffer.

```ts
class InstSurfPlugin extends MaterialPluginBase {
  constructor(material: Material) { super(material, "InstSurf", 200, { INSTSURF: false }, true, true); }
  override getClassName() { return "InstSurfPlugin"; }
  override prepareDefines(defines: MaterialDefines, _s: Scene, mesh: AbstractMesh) { defines["INSTSURF"] = mesh.isVerticesDataPresent("instSurf"); }
  override getAttributes(attributes: string[], _s: Scene, mesh: AbstractMesh) { if (mesh.isVerticesDataPresent("instSurf")) attributes.push("instSurf"); }
  override getCustomCode(shaderType: string) {
    if (shaderType === "vertex") return {
      CUSTOM_VERTEX_DEFINITIONS: "#ifdef INSTSURF\nattribute vec4 instSurf;\nvarying vec4 vInstSurf;\n#endif\n",
      CUSTOM_VERTEX_MAIN_END: "#ifdef INSTSURF\nvInstSurf = instSurf;\n#endif\n" };
    if (shaderType === "fragment") return {
      CUSTOM_FRAGMENT_DEFINITIONS: "#ifdef INSTSURF\nvarying vec4 vInstSurf;\n#endif\n",
      CUSTOM_FRAGMENT_UPDATE_DIFFUSE: "#ifdef INSTSURF\ndiffuseColor.rgb *= vInstSurf.rgb;\n#endif\n" };
    return null;
  }
}
mesh.thinInstanceSetBuffer("instSurf", surfBuf, 4, true);   // any kind name -> instanced VertexBuffer (divisor 1)
```

SPS API, if you still need it (source + VERIFIED usage):

```ts
new SolidParticleSystem(name, scene, { updatable?, isPickable?, enableDepthSort?, particleIntersection?, boundingSphereOnly?,
  bSphereRadiusFactor?, expandable?, useModelMaterial?, enableMultiMaterial?, computeBoundingBox?, autoFixFaceOrientation?, camera? })
sps.addShape(mesh, nb, { positionFunction?, vertexFunction?, storage? }): number;
sps.buildMesh(): Mesh;
sps.setParticles(start?, end?, update?)
sps.computeParticleRotation / computeParticleColor / computeParticleTexture / computeParticleVertex / computeBoundingBox  (setters)
sps.isAlwaysVisible = true;   sps.removeParticles(start, end) / insertParticlesFromArray(...)  (expandable only, then buildMesh())
// particle.position / rotationQuaternion (set it, non-null, to use quaternions) / scaling / color / isVisible
```

To skip per-frame colour work, set colours once with `computeParticleColor = true; setParticles()` and then set
`computeParticleColor = false` (colours are stored).

---

## 4. Decals

### 4.1 `MeshBuilder.CreateDecal` (VERIFIED, `va-decals.png`)

```ts
MeshBuilder.CreateDecal(name: string, sourceMesh: AbstractMesh, options: { position?: Vector3; normal?: Vector3; size?: Vector3;
  angle?: number; captureUVS?: boolean; cullBackFaces?: boolean; localMode?: boolean }): Mesh
// also exported standalone as CreateDecal(...); the legacy Mesh.CreateDecal static is a side-effect stub
```

Behaviour:

- **Works on custom VertexData meshes** that have positions, indices, normals and uvs. It clips every source
  triangle against the oriented projection box, so decals wrap across edges.
- **Normals are required.** Without them, CreateDecal returned a 36-vertex mesh collapsed to one point (extent 0):
  silently invisible.
- **Cost is O(source triangles)** (median of 5, loaded box):

  | source triangles | time |
  |---|---|
  | 200 | 1.1–4.1 ms |
  | 5000 | 6.2–14.2 ms |
  | 28 800 | 24–38 ms |

  Do not project onto a whole batched island mesh. Build a temporary mesh from the triangles near the hit (for
  example the hit part's faces), or clip our own `ConvexPoly` faces in pure code.
- `localMode: true` parents the decal to the source mesh and keeps it in local coordinates (VERIFIED: it followed
  the box after the box moved and rotated). Use this mode for dynamic islands. Without it, the decal gets world
  `position` and `rotation`.
- Each decal is a separate mesh and draw call. `Mesh.MergeMeshes(decals, true, true)` merged three in 2.3–2.9 ms.
  Keep one merged decal mesh per island and rebuild or drop it when the island's render mesh is rebuilt.

Decal material as run:

```ts
decalMat.diffuseTexture = impactTex; decalMat.useAlphaFromDiffuseTexture = true;  // soft alpha edges
decalMat.zOffset = -2;                                                           // polygon offset vs z-fighting
```

### 4.2 Decal maps: `MeshUVSpaceRenderer` + `material.decalMap` (VERIFIED)

```ts
const uvr = new MeshUVSpaceRenderer(mesh, scene, { width?: 1024, height?: 1024, textureType?, generateMipMaps?: true,
                                                     optimizeUVAllocation?: true, uvEdgeBlending?: false });
mesh.decalMap = uvr;                       // AbstractMesh.decalMap (side-effect property; root import registers it)
mat.decalMap!.isEnabled = true;            // StandardMaterial / PBRMaterial getter lazily creates the DecalMapConfiguration plugin
mat.decalMap!.smoothAlpha = false;
uvr.renderTexture(texture: BaseTexture, position: Vector3, normal: Vector3, size: Vector3, angle = 0, checkIsReady = true);
uvr.clear(); uvr.dispose(); uvr.isReady(); uvr.texture /* RenderTargetTexture, 1024² RGBA8 + mips ≈ 5.3 MB per mesh */
```

How it works:

- The UV-space shader **hard-codes `attribute vec2 uv`**, so UV set 1 must be a **unique, non-overlapping [0,1]
  layout** for the mesh. VERIFIED on a default box, whose faces all use the same UV square: one hit printed the mark
  on every face. A ground or plane mesh with unique UVs was correct.
- Normals are needed. Triangles facing away from the projection direction are rejected.
- The decal blends **albedo only** (`mix(albedo, decal.rgb, decal.a)`): no normal or roughness change.
- It is persistent and adds no draw calls at render time. Each mark is one render of the mesh into the RTT.
- `renderTexture` took 6.5–9.5 ms the first time (it creates the RTT) and 0.6–2.3 ms afterwards.
- Right after creation `isReady()` is false (async shader import). `renderTexture` then retries itself every
  16 ms via `setTimeout`.

**For this project:** world geometry uses tiling planar UVs, so decal maps are unusable unless the batch builder
writes a unique atlas into `uv` and moves the tiling coordinates to another attribute. Even then, only use them for
a few large static surfaces such as walls and floors. Use merged projected decal meshes for everything else.

---

## 5. Audio: what Babylon 9 offers (VERIFIED + source)

- **`new Engine(canvas, aa, opts)` creates no AudioContext by default.** `AbstractEngineOptions.audioEngine` is
  undefined, which counts as false.
  - VERIFIED: with the `src/main.ts` options, 0 AudioContexts were constructed and `AbstractEngine.audioEngine` was null.
  - `{ audioEngine: true }` creates the legacy `AudioEngine` with 1 AudioContext.
  - Passing `audioEngine: false` explicitly is harmless documentation.
- **Legacy `Sound`** (`new Sound(name, urlOrArrayBuffer, scene?, readyCb?, options?)`) is a wrapper over V2 in 9.x
  (`AbstractEngine.audioEngine._v2`). **Without `audioEngine: true` it silently does nothing.** VERIFIED: `isReady()`
  stayed false and nothing was thrown.
- **AudioEngineV2** (exported from the package root):

  ```ts
  CreateAudioEngineAsync(options?: Partial<IWebAudioEngineOptions>): Promise<AudioEngineV2>
    // options: audioContext, resumeOnInteraction (default true: adds a document "click" listener),
    // disableDefaultUI (unmute button), resumeOnPause, volume, listenerEnabled/AutoUpdate/Position/Rotation...
  CreateSoundAsync(name, source: ArrayBuffer | AudioBuffer | StaticSoundBuffer | string | string[], options?: Partial<IStaticSoundOptions>, engine?)
  CreateSoundBufferAsync(source, options?, engine?) / CreateSoundSourceAsync(name, node: AudioNode, options?, engine?)
  CreateStreamingSoundAsync(...) / CreateAudioBusAsync(...) / CreateMainAudioBusAsync(...)
  sound.play({ volume?, loop?, startOffset?, waitTime?, duration? }); sound.stop(); sound.pitch / playbackRate; maxInstances
  spatial options: spatialEnabled, spatialPanningModel "equalpower"|"HRTF", spatialPosition, spatialDistanceModel,
                   spatialMinDistance, spatialMaxDistance, spatialRolloffFactor, spatialCone*, spatialAutoUpdate ...
  engine.listener.position / rotation / attach(node)
  ```

  VERIFIED with our own context: creation took 1.7–8.3 ms; `sameContext` was true; two `play()` calls gave 2
  instances in state `Started` (3). Limits:
  - **All instances of one sound share that sound's single spatial node** (source), so every simultaneous voice
    position needs its own sound object, and creating one is async.
  - There are no filter or reverb-send nodes: AudioV2 sub-nodes are only volume, stereo, spatial and analyzer, and no
    `BiquadFilterNode`/`ConvolverNode` appears anywhere in `AudioV2/` (source).
  - **`engine.dispose()` closes the AudioContext even if you passed it in.** VERIFIED: state became `"closed"`.

**Recommendation: raw Web Audio, owned by `src/audio`.** Reasons:

1. A per-voice graph (lowpass for occlusion, HRTF panner, wet send) and a shared reverb and compressor bus are
   first-class. V2 exposes neither filters nor sends.
2. Node creation is synchronous and cheap if voice chains are pooled. V2 sound creation is async.
3. Positions are per voice. V2 shares one spatial node per sound.
4. Synthesis writes straight into `AudioBuffer.getChannelData()`, and `OfflineAudioContext` can bake layered variants.
5. There is no hidden UI, document listener or context closing.

Babylon gives no extra value here because the engine does not need its audio for anything.

---

## 6. Raw Web Audio (VERIFIED, `vfx-audio-webaudio.probe.ts`)

**Context:** `new AudioContext({ latencyHint: "interactive", sampleRate: 44100 })`.

- State was `"running"`; the harness passes `--autoplay-policy=no-user-gesture-required`. In the real game, call
  `ctx.resume()` from the first click or keydown (`AudioSystem.resume()`).
- `sampleRate` 44100 was honoured, `baseLatency` was 0.01 s, and `currentTime` advanced 1.022 s per real second.
- `listener.positionX/forwardX/upX` AudioParams exist.

**Graph as run** (VERIFIED: analyser RMS was 0.024 while playing and 0 after the tail; `onended` fired after
0.485–0.491 s, which is 0.5 s at playbackRate 1.03):

```ts
const comp = new DynamicsCompressorNode(ctx, { threshold: -12, knee: 6, ratio: 8, attack: 0.003, release: 0.15 });
const master = new GainNode(ctx, { gain: 0.8 });
comp.connect(master).connect(ctx.destination);                     // connect() returns the target -> chainable
const reverb = new ConvolverNode(ctx, { buffer: irBuffer });        // normalize defaults to true
const reverbSend = new GainNode(ctx, { gain: 0.35 });
reverbSend.connect(reverb).connect(comp);
// one voice
const src = new AudioBufferSourceNode(ctx, { buffer: impact, playbackRate: 1.03 });
const vGain = new GainNode(ctx, { gain: 0.9 });
const occl = new BiquadFilterNode(ctx, { type: "lowpass", frequency: 2500, Q: 0.707 });
const pan = new PannerNode(ctx, { panningModel: "HRTF", distanceModel: "inverse", refDistance: 1, maxDistance: 60,
                                  rolloffFactor: 1.2, positionX: 1.5, positionY: 1.2, positionZ: -2.5 /* Babylon z=+2.5 flipped; the probe passed raw +2.5 */ });
src.connect(vGain).connect(occl).connect(pan);
pan.connect(comp); pan.connect(reverbSend);
src.start();
```

**Handedness: flip Z (VERIFIED).** Babylon is left-handed; Web Audio derives "right" from `forward × up` in a
right-handed frame. Test setup: listener facing Babylon +Z, source 2 m to its **right** (+X).

| coordinates passed | equalpower RMS L / R | HRTF RMS L / R |
|---|---|---|
| raw Babylon | 0.046 / 0.006 (**swapped**) | 0.061 / 0.029 |
| Z negated on positions and forward/up | 0.006 / 0.046 (correct) | 0.030 / 0.061 |

So pass `(x, y, -z)` for listener position and forward/up and for every panner position.

**Node creation cost (VERIFIED, µs each, loaded box):**

| node | µs |
|---|---|
| `AudioBufferSourceNode` | 15.5 |
| `GainNode` | 14 |
| `BiquadFilterNode` | 42.5 |
| `PannerNode` equalpower | 45.5 |
| `PannerNode` **HRTF** | **182.5** |
| `StereoPannerNode` | 16.5 |
| full chain (source, gain, biquad, HRTF panner) | 216–447 |

Pool the voice chains (gain, filter, panner) and create only the `AudioBufferSourceNode` per play.

**HRTF pitfall (VERIFIED, `vfx-audio-hrtfdebug.probe.ts`):**

- The first HRTF `PannerNode` in a page loads the HRTF database. In an `OfflineAudioContext` that cost 330–820 ms.
- In **2 of 6** fresh pages, `startRendering()` of the first offline graph containing HRTF **never resolved**, and
  every later HRTF offline render on that page hung as well.
- Pre-warming HRTF on the realtime context first fixed it in 8 of 8 runs, and the offline warm-up then took 2–9 ms:

```ts
const osc = new OscillatorNode(ctx, { frequency: 440 }), mute = new GainNode(ctx, { gain: 0 });
osc.connect(mute).connect(new PannerNode(ctx, { panningModel: "HRTF", positionX: 1 })).connect(ctx.destination);
osc.start(); osc.stop(ctx.currentTime + 0.5);          // then wait ~1 s before relying on HRTF anywhere
```

Also: do not use HRTF in startup bakes (mono buffers do not need it), and race every `startRendering()` against a timeout.

**Modal synthesis into Float32Array (VERIFIED; exact code in probe, excerpt):**

```ts
const w = 2 * Math.PI * f / sr, r = Math.exp(-6.907755 / (t60 * sr));   // -60 dB after t60 seconds
const c = Math.cos(w) * r, s = Math.sin(w) * r;
let re = 0, im = amp;                                                   // rotation oscillator: no Math.sin per sample
const stop = Math.min(n, Math.ceil(Math.log(1e-5) / Math.log(r)));     // skip the inaudible tail
for (let i = 0; i < stop; i++) { out[i] += im; const nre = re * c - im * s; im = re * s + im * c; re = nre; }
// + white-noise contact burst with exp decay (5-6 ms), 1 ms attack ramp, peak-normalise to 0.9
// out = new AudioBuffer({ length, sampleRate: 44100, numberOfChannels: 1 }).getChannelData(0)  -> no copy needed
```

**Measured budgets (loaded box):**

| job | time |
|---|---|
| 150 buffers, 0.3–1.5 s each (135 s of audio), 12 modes + noise | **174–530 ms** (typically 1.4–2.0 ms per audio second); 22.7 MB of Float32 |
| same with naive `Math.exp`/`Math.cos` per sample | 26–53 ms per audio second, so 3.5–7 s for the bank |
| 2 s stereo reverb IR, pure JS (decaying noise + one-pole lowpass) | 9.5–22 ms |
| same IR via `OfflineAudioContext` (noise → exp gain ramp → lowpass sweep) | 26–56 ms |
| layered shatter offline (1.5 s: 60 pitched/panned grains + bandpassed noise + 85 Hz thud) | 27–280 ms |

Generate the bank in chunks (or a Worker) behind the loading bar.

**Audio-thread headroom (offline render of 2 s, 48 looping voices, each source → gain → biquad → panner):**

| configuration | render time | × realtime |
|---|---|---|
| HRTF + reverb send (2 s IR) | 605–2004 ms (calmest run 701 ms) | 2.9 |
| equalpower + reverb | 380–1089 ms (413) | 4.8 |
| HRTF dry | 380–1966 ms (380) | 5.3 |
| equalpower dry | 252–2005 ms (286) | 7.0 |
| 24 voices HRTF + reverb | 300–1440 ms (370) | 5.4 |
| convolver alone | 85–404 ms (138) | 14.5 |

The ranges are dominated by machine load. The 48-voice cap with HRTF is feasible. Consider HRTF for the nearest
about 16 voices and equalpower for the rest on low settings.

**`decodeAudioData` of OGG Vorbis works (VERIFIED):**

- An embedded 0.5 s 440 Hz Vorbis tone (`vfx-audio-tone440.ts`, made with ffmpeg libvorbis) decoded in 3–33 ms to
  duration 0.497 s, 44100 Hz, 1 channel; the zero-crossing frequency was 440.46 Hz.
- 120 of the repo's `public/assets/sounds/**/*.ogg` files decoded with **0 failures**. Sequential fetch plus decode
  took 1.5–2.4 s, dominated by fetch on the loaded local server.
- 40 files decoded in parallel with `Promise.all` in 47–127 ms, because decoding runs off the main thread.
- Decode **resamples to the context rate**.

**Vite import:**

- Single file: `import url from "./x.ogg?url"`.
- Many files: `import.meta.glob("../../public/assets/sounds/**/*.ogg", { query: "?url", import: "default", eager: true })`.
- The probe harness does not serve `public/`. The game's Vite build copies `public/` into `dist`, so
  `fetch("assets/sounds/...")` should work there (standard Vite behaviour, not probed).

---

## 7. Pitfalls

1. **`disposeOnStop` destroys the shared `particleTexture`** (the scene calls `dispose()` with
   `disposeTexture = true`). Every other system using that texture silently stops. Dispose yourself with `dispose(false)`.
2. **Particle time is not seconds.** It is `updateSpeed × animationRatio`, and the ratio is about 0.06 in tight loops.
   Use the clock hook (§1.3). Pre-warm ignores the ratio: set `updateSpeed` before `start()`.
3. **No `particleTexture` means the system never runs** (`isReady()` is false). Each new system also needs one
   event-loop turn (dynamic shader `import()`) before it animates.
4. `colorDead` defaults to **opaque black**. With `BLENDMODE_STANDARD`, set its alpha to 0.
5. Colour gradients are system-wide and override per-particle `color1/color2/colorDead` tinting. Tintable pools must
   not use colour gradients.
6. `manualEmitCount` is consumed (set to 0) on the next ready `animate()`. While it is ≥ 0, `emitRate` is ignored;
   set it to −1 to return to rate mode. Bursts beyond capacity are silently dropped.
7. `startSizeGradient`, `lifeTimeGradient` and `emitRateGradient` need `targetStopDuration`, otherwise **`start()` throws**.
   Pre-warm time counts toward `targetStopDuration`.
8. `createConeEmitter(radius, angle)`: `angle` is the **full** apex angle.
9. CPU `CustomParticleEmitter` always gets `index = -1`. Use `startPositionFunction` instead.
10. Replacing `updateFunction` removes aging and recycling. Wrap the default instead.
11. The first big emission allocates `Particle` objects (about 10–50 µs each). Pre-fill the pools at load; `reset()`
    also clears the recycled stock.
12. GPU particles: one emitter matrix per frame, no start or update functions, and a slow first compile
    (6–13 s on SwiftShader).
13. `thinInstanceSetBuffer(kind, buf, stride, staticBuffer = true)` is **static by default**: pass `false` for
    per-frame updates. It refreshes bounding info over all instances unless `doNotSyncBoundingInfo = true`.
    Moving instances also need `alwaysSelectAsActiveMesh = true` or a manual bounds refresh, otherwise the batch can
    be frustum-culled.
14. `thinInstanceCount = n` larger than the buffer capacity is **silently ignored**. `thinInstanceBufferUpdated("color")`
    uploads the whole buffer; use `thinInstancePartialBufferUpdate`.
15. SPS `setParticles` transforms every vertex in JS. `removeParticles` on an expandable SPS costs tens of ms plus
    a rebuild.
16. `CreateDecal` **needs source normals** (otherwise a silent degenerate mesh), costs O(all source triangles) and
    adds one draw call per decal. Use `localMode` for moving meshes and merge per island.
17. Decal maps render through UV set 1 (`uv`), which must be unique in [0,1]. Overlapping UVs repeat the mark. Each
    mesh needs an RTT of about 5.3 MB at 1024².
18. `new Engine()` creates no AudioContext. Legacy `Sound` silently no-ops without `{ audioEngine: true }`.
19. AudioEngineV2 `dispose()` **closes the AudioContext you passed in**, adds a document click listener by default,
    and shares one spatial node across all instances of a sound.
20. **Flip Z** when sending Babylon positions and orientations to Web Audio, otherwise left and right are swapped.
21. **Pre-warm HRTF on the realtime context.** The first HRTF use inside an `OfflineAudioContext` can hang forever
    (2 of 6 runs). Always add a timeout to `startRendering()`.
22. An HRTF `PannerNode` costs about 180 µs to create on the main thread. Pool voice chains.
23. Never synthesise with `Math.sin`/`Math.exp` per sample: the rotation oscillator is about 20× faster. Write
    directly into `getChannelData()`.
