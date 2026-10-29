# Performance profile — full furnished apartment (2026-10-29)

Harness: `tests/perf.mjs` (see "Reproduce"). Raw data: `docs/perf/latest.json` — full run on the current
tree (with the integration fixer's sleep fix in the working tree: 12 bodies awake after settle), default
quality `high`, 1280×720. Local extras (gitignored): `test-results/perf/run1-full-pre-sleepfix.json` (same run
before the sleep fix: ~200 awake bodies), `test-results/perf/medium.json` (quality `medium`, destruction with
CPU + allocation profiles), `test-results/perf/run2.json`.

Environment: headless Chromium + SwiftShader on a shared, loaded 4-CPU VM. SwiftShader rasterises on the CPU,
so **GPU cost is not measurable**. Proxies: draw calls per pass, triangles, render-target / post-process count
and resolution, and JavaScript CPU ms. CPU ms inside `scene.render()` include GL back-pressure (the profiler
puts 70–85 % of all samples in `uniformMatrix4fv` / `drawElements` / `bindVertexArray`): they are only clean
for the render targets that run before the queue fills (the shadow maps: ≈ 15–20 µs of JS per shadow draw on
this VM) and for render-only frames.

## TL;DR

1. **~90 % of all draw calls are shadow-map re-renders that are supposed to be cached.** Both cached maps
   (sun 2048², the nearest promoted point light's 512² cube) are invalidated by *any* shadow caster whose
   world matrix changes and are then re-rendered with *every* caster. Idle in the living room: **4890
   draws/frame = 3618 cube + 775 sun + 497 main/post**. The same view with nothing moving costs **497**.
2. **Something always moves, even with the sleep fix**: the living-room ceiling-fan rotor (mains `motor`
   feature, spins forever) and the range-hood blower wheel (hidden inside the canopy) are shadow casters that
   move every frame (2 moved casters/frame, 2 awake bodies, physics 1 ms/step — and still 4890 draws). A/B in
   one session (medium): all islands asleep + the 4 motors stopped → 0 moved casters, 1267 → 492 draws/frame
   (the sun map then only renders on its 1.5 s safety refresh). During destruction 1000–1300 casters move per
   frame → 12.4–12.7k draws/frame.
3. **The point-light cube renders every caster within 6 m into all 6 faces, through walls**: 603 casters × 6
   = 3618 draws per refresh; per-face culling alone → **898** (−75 %); 40 % of its casters sit in rooms
   behind solid walls (bedroom 2: 144, master: 71, foyer 30, utility 21, bath 13).
4. **Main pass: one draw per island chunk** (476 idle, 671 hall, 760–836 after destruction). Merging static +
   sleeping islands per 2 m cell → **134** (idle) / **184** (hall); per room per floor 64 / 77. Room/portal
   culling would additionally skip 33–41 % of the active meshes.
5. **Heavy destruction is simulation-bound**: ~1370 awake debris bodies → physics **191 ms/step** (max 404),
   destruction 48 ms/step (max 204), vfx 4 ms; 6 s later still 1059 awake → 95 ms/step. With the 4-step
   accumulator the real loop spent 492 ms stepping per rendered frame.
6. Post chain: 14 passes/frame, 10 at full resolution, half-float. Babylon 9's SSAO2 runs its 16-sample SSAO
   pass at **full** resolution whatever `ssaoRatio` says (`_createSSAOPostProcess(1.0, …)`), plus a full-res
   bilateral blur (`blurRatio: 1`), a full-res colour copy and a full-res combine.
7. Shadow re-renders also produce most per-frame garbage: Babylon's `ShadowGenerator.isReady` /
   `_prepareShadowDefines` build a defines array + `join` per sub-mesh per render → ≈ 5 MB/frame idle,
   14–16 MB/frame during destruction, vs ≈ 1 MB/frame render-only (instrumentation included).

## The 5331 vs ~720 draw-call discrepancy

Both are correct counts of different frames:

| frame | draws | breakdown |
|---|---|---|
| a frame in which any shadow caster moved (before the sleep fix: ~180–210 jittering awake bodies; now: fan rotor + hood blower every frame; any debris) | **5126** idle pre-fix, **4890** idle now, 3490 hall, 12.4–12.7k destruction | point cube 3618–3750 (6 faces × every caster within 6 m) + sun 775–846 + main ~480–520 + 14 post + 1 tile mask |
| a frame in which nothing moved since the last shadow render (hold mode / `__sim.render()` / paused) | **497–679** (spawn pose 679, idle pose 497–530, hall ~690) | main pass + 14 post + 1 tile mask; both shadow maps stay cached (`REFRESHRATE_RENDER_ONCE`) |

The orchestrator's 5331 is a real-loop frame with movers; the other agent's ~720 is a hold-mode/render-only
frame (e.g. the spawn pose: 658 main-pass draws + 21). The boot-time environment capture (6 faces × 885
meshes ≈ 5.3k draws) happens before `__sim.ready` and is not part of either.

Counter caveat (src/core/game.ts `renderScene()`): it takes `engine._drawCalls.current` before/after
`scene.render()`. Once the HUD's F3 overlay has created a `SceneInstrumentation` (never disposed) that counter
is reset at the start of every render, so the delta is wrong whenever a frame draws more than the previous
one (a 5126 frame after a 530 frame reads 4596). Fix: when an instrumentation is attached, read `pc.current`
after the render.

## Results per scenario (latest.json: high, 1280×720, 20 measured frames)

Frame = 1 fixed step + frame update + 1 `scene.render()` (`__sim.step(1)` in hold mode).

| scenario | draws/frame | tris | active | cube | sun | main | steps ms | physics ms/step (awake) | destruction ms/step | eval active meshes ms |
|---|---|---|---|---|---|---|---|---|---|---|
| idle (living room) | 4890 | 1665k | 479 | 3618 | 775 | 482 | 4.0 | 1.0 (2) | 1.9 (max 4.5) | 7.2 |
| idle, render-only | 497 | 275k | 479 | 0 | 0 | 482 | – | – | – | 5–7 |
| hall (foyer → west) | 3489 | 1202k | 675 | 2022 | 775 | 677 | 4.1 | 1.0 (2) | 1.9 | 9.3 |
| idle, every island forced asleep | 4889 | 1665k | 479 | 3618 | 775 | 481 | 3.6 | 1.3 (2: fan, hood) | 1.6 | 7.4 |
| *medium: all asleep, motors on → motors off* | 1267 → 621 (492 when cached) | 513k → 315k | 479 | – | 775 → 129 (1/6 frames) | 482 | – | 0.3 (2 → 0) | 0.8 | – |
| destruction, during | 12399 | 1900k | 837 | 9605 | 1937 | 842 | 245 (p95 439) | 191 (1373), max 404 | 48 (max 204) | 70 |
| destruction, +6 s | 12724 | 1994k | 760 | 9984 | 1961 | 764 | 98 | 95 (1059), max 202 | 1.6 | 36 |
| real loop after destruction | 12718 | 1993k | 760 | 9978 | 1961 | 764 | 492 (4 steps) | 109 | – | 30 |
| *pre-sleep-fix: idle* | 5126 | 1633k | 512 | 3750 | 846 | 515 | 14.7 | 11.9 (195) | 1.7 | 12.1 |
| *pre-sleep-fix: hall* | 3844 | 1180k | 758 | 2226 | 842 | 761 | 13.0 | 10.3 (164) | 1.8 | 10.7 |
| *medium: destruction, during* | 2950 | 601k | 880 | – | 2055 | 885 | 192 | 158 (1515) | 30 | 38 |

JS cost of the shadow re-renders (render-target CPU, idle): sun 15.8 ms (775 draws), cube 47.3 ms (3618
draws) → ≈ 63 ms per frame on this VM; during destruction the sun alone is 42.6 ms (1937 draws).

Inventory (idle): 1029 meshes, 974 of them island meshes (372 static, ~500 asleep-dynamic, 2 awake; 122
islands consolidated), 800k vertices, 36 materials, 40 compiled effects, 39 transparent active meshes, 21
interior lights (20 clustered + 1 promoted with cube shadows), 775–846 sun casters, 934 receivers, 3
thin-instance meshes (32 after destruction), 6 particle systems, 12 frozen world matrices in the whole scene.
Exterior: 8 merged meshes (~290k vertices, few draws). Viewmodel: 6 draws (rendering group 1).

## Where the frame goes

### Render passes (idle)

| pass | draws | tris | resolution | refresh | notes |
|---|---|---|---|---|---|
| shadow: promoted point light (`light.ceilingFan#48`) | 3618 | 1152k | 512² × 6 (1024² on ultra), Poisson | every frame (invalidated) | all casters within 6 m, all faces, no culling, through walls |
| shadow: sun | 775 | 238k | 2048² float, PCF (QUALITY_MEDIUM) | every frame (invalidated) | fixed ortho frustum, light-box caster culling only |
| TileMaskTexture (clustered lights) | 1 | – | 64² | every frame | negligible |
| main, group 0 (world) | 476 | 274k | 1280×720, prepass MRT (3 attachments, for SSAO) | every frame | one draw per island chunk |
| main, group 1 (viewmodel) | 6 | 1k | | | |
| post (14 passes) | 14 | – | 10 full-res + 4 half-res, half-float | every frame | below |

Post chain: SSAOOriginalSceneColor (full-res copy) → ssao (16 samples, **full res**) → BlurH (half) → BlurV
(full, bilateral 16 taps) → ssaoCombine (full) → highlights (full) → bloom blur H/V (half, kernel 72) →
bloomMerge (half) → imageProcessing (full) → Grain (full) → ChromaticAberration (full) → FXAA (full) →
renderEnvComposite (full, RGBA8; PS2/flash). At 1080p on a mid-range laptop GPU this is roughly 3–6 ms,
dominated by bandwidth (10 full-res half-float passes) and the full-res SSAO + bilateral blur.

### Why the shadow caches never hold

`Lighting.setShadowCaster()` subscribes `onCasterMoved` to every caster mesh's
`onAfterWorldMatrixUpdateObservable`; `invalidateNear()` then resets the sun map and every point map listing
the mesh, and the next render redraws them with all casters. Moved casters per frame
(`movedShadowCastersPerFrame`): 178–211 idle before the sleep fix (kitchen-run doors/drawers, sofa, plates,
books, fridge, bins …), **2 now (`isl:ceilingFan`, `isl:rangeHood`)**, 1000–1300 during/after destruction.
Invalidation call sites (sampled stacks): `invalidateNear ← onCasterMoved` (≈ 99 %), plus `← setShadowCaster` /
`← registerReceiver` from island rebuilds (13 mesh builds + 12 caster changes per frame during destruction).

### Simulation (per fixed step)

* Idle with the sleep fix: physics ≈ 1 ms, destruction ≈ 1.6–1.9 ms (max 4.5–5.8), player 0.7–1 ms, vfx
  < 0.2 ms. (Before the fix: physics 10–12 ms with 160–200 awake bodies — the integration fixer's area.)
* Heavy destruction (43 assemblies × sledgehammer + axe, 12 thrown mugs/plates; 494 fractures, 1172 bond
  breaks, 986 debris pieces): 1373/1775 bodies awake, 6.9k contact pairs, 11.2k collision events/step →
  physics 191 ms (max 404), `destruction.afterPhysics` 48 ms (p50 33, max 204: fracture + rebuild bursts),
  vfx.fixedUpdate 4.1 ms (max 16.8). Worst frame: 539 ms of simulation (physics 329 + destruction 196).
* Six seconds later 1059/1879 bodies are still awake (95 ms/step); in the medium run, forcing all 1791
  dynamic islands asleep left ~1100–1250 awake again within one step: the debris piles are not at rest
  (interpenetration / jitter), so the sleep assist cannot keep them down.
* Garbage during destruction: `walkRawEvents` 1.1–1.9 MB/frame (top allocator in the medium run), fracture
  geometry (`wpolyClip`, `emitFace`, `polyExtents`) ≈ 0.6 MB/frame, shadow `isReady` strings 4–8 MB/frame.
* Real loop: any frame > 16.7 ms makes the accumulator run 2–4 steps next frame (4 seen, 492 ms of stepping
  per rendered frame after destruction): every ms saved per step is multiplied by up to 4.

### CPU outside the GPU passes

* `_evaluateActiveMeshes`: 5–7 ms render-only (1030 meshes), 7–10 ms when stepping, 36–70 ms with 1800–2500
  meshes after destruction. Island meshes are children of island nodes; none of the ~370 static island meshes
  has a frozen world matrix.
* Screens (TV, phone, microwave, monitor, laptop): canvas redraw + `texImage2D` at 15 Hz whether visible or
  not (pre-fix idle profile, 30 frames ≈ 7.5 ticks: `tvContent` 22 ms + `texImage2D` 35 ms → ≈ 3–8 ms per
  tick on this VM, a 15 Hz spike of ≈ 1–2 ms/frame on average).
* Frame updates (player, audio, vfx, hud, render.update) ≈ 1–3 ms total: not a target.

## Opportunities (ordered by expected gain)

### 1. [render] Shadow caches: never re-render static casters because one caster moved
*Evidence*: 4393 of 4890 idle draws (90 %) and 11.5k of 12.4k destruction draws are shadow re-renders;
render-only frames cost 497; with every island asleep the fan rotor + hood blower alone keep it at 4889;
≈ 63 ms of JS per frame on this VM (≈ 25–45 ms on a laptop CPU), ≈ 5 MB/frame of garbage.
*Plan* (`src/render/lighting.ts`):
1. Classify casters as **static** (static islands, asleep dynamic islands, debris batches, tower) or
   **dynamic** (node moved within the last ~0.5 s, tracked in `onCasterMoved`; demoted back after N quiet
   frames, which costs one static refresh).
2. Sun: render the static casters into a separate depth map (a second generator on a hidden clone of the sun
   with identical view/ortho/depth range, excluded from every material via `includeOnlyWithLayerMask` on an
   unused bit — or render it manually when dirty). The real map gets an `onClearObservable` observer (Babylon
   then skips its own clear) that copies the static depth in (WebGL2 `blitFramebuffer` DEPTH, identical
   size/format, or a full-screen depth-writing copy), and `getCustomRenderList` returns only the dynamic
   casters. Re-render only when a dynamic caster moved more than ~½ texel (4 mm) / a few degrees since the
   last render.
3. Point cube: the same split per face (see #2).
4. Cheap first step: ignore sub-texel movement in `onCasterMoved`, exclude the enclosed hood blower wheel from
   casting, and on medium/low refresh dynamic-only changes at most every 2nd frame.
*Expected gain*: idle 4890 → ~500 draws/frame (−90 %), shadow CPU ≈ 63 → ~1 ms/frame on this VM;
destruction 12.4k → ~1.5–3k (main + moving debris only); −4 to −14 MB/frame garbage. Same maps and filtering:
no visual change.
*Files*: src/render/lighting.ts (+ static/dynamic hints from src/render/batch.ts).

### 2. [render] Point-light cube shadow: per-face culling, room-limited caster lists, per-face dirty bits
*Evidence*: fan light: 603 casters × 6 = 3618 draws per refresh; sphere-vs-face-pyramid culling → 898
(faces 239/222/20/123/218/76). Casters by room: living 156, kitchen 108, **bedroom 2 144, master 71,
foyer 30, utility 21, bath 13** (≈ 40 % behind solid walls). Foyer light: 2022 → 550. After destruction the
list grows to 1664 casters (9984 draws; 2201 with per-face culling).
*Plan* (`fillPointCasters` / `pointCasterWanted`): keep casters whose AABB overlaps the light's room or a
room connected through an opening (roomGraph; structure islands always kept); `shadowMap.getCustomRenderList
= (face) => faceLists[face]` (pass index == face index for cubes, RenderTargetTexture._renderToTarget);
per-face dirty bits from `invalidateNear` (only faces whose pyramid the moved caster's sphere overlaps), clean
faces skipped by an empty list + an `onClearObservable` observer that leaves that face uncleared.
*Expected gain*: 3618 → ~500 per full refresh, ~5–50 per dynamic refresh with #1; 1.15M → ~0.15M shadow
triangles. No visual change.
*Files*: src/render/lighting.ts, src/render/env/roomGraph.ts.

### 3. [simulation] Debris that never rests + collision-event volume during destruction
*Evidence*: 1373 awake bodies → physics 191 ms/step (max 404), 6.9k contact pairs, 11.2k events/step; 6 s
later 1059 awake (95 ms/step); forced sleep does not hold (medium run); `walkRawEvents` up to 1.9 MB/frame
garbage; real loop 492 ms of stepping per frame (4-step accumulator).
*Plan* (coordinate with the integration fixer, who owns the after-load sleep issue): (a) find why piles never
settle (overlapping fresh fragments: spawn fragments slightly shrunk / separated, or with a short contact
softness ramp; check pile jitter with `tests/perf.mjs --scenarios destruction`); (b) budget physical debris:
fragments below a size/mass threshold, or beyond N awake debris bodies, become micro-debris particles (already
cheap, `vfx/microSim`), smallest/farthest first; (c) cool "hot" bodies faster (30 → ~10 steps, only pairs that
can still exceed the damage threshold) to cut CONTINUED events; (d) clamp adaptive substeps to the first steps
after a fracture; (e) remove the per-event allocation in `walkRawEvents` and its inlined callees
(`recFromId`, `ImpactAggregator.add`, `queueHeat`); (f) cap the accumulator at 2 steps while a step costs
> 8 ms (slow-motion instead of a spiral).
*Expected gain*: destruction steps 95–191 ms → 20–40 ms (cost scales with awake bodies); no accumulator
spiral; −1–2 MB/frame garbage. Visual: same fracture, fewer tiny rigid shards (they become particles).
*Files*: src/physics/physics.ts, src/physics/impacts.ts, src/destruction/runtime/debris.ts, fracture/fragment
classification in src/destruction/runtime/*, src/vfx/microSim.ts (capacity).

### 4. [render] Merge static + sleeping islands into per-cell batches (main pass and shadow casters)
*Evidence*: main pass = one draw per island chunk: 476 (idle), 671 (hall), 760–842 (destruction). What-if:
static + asleep island meshes merged per 2 m cell → **134** (idle) / **184** (hall) / 288 (6 s after
destruction); 4 m cells 67 / 89 / 212; per room per floor 64 / 77 / 204. Whole scene: 810 mergeable meshes →
163 cells, so the static shadow sets shrink by the same factor. Today only small (< 20 kg, < 0.6 m) dynamic
islands are consolidated (122).
*Plan*: generalise `DebrisSystem.consolidate` (world-space geometry appended to a cell batch, own meshes
dropped, restored on wake/hit/rebuild) to static islands and all asleep dynamic islands without active
features/joint motion; rebuild cell batches lazily and time-budgeted; cell batches are static casters for #1
and get frozen world matrices.
*Expected gain*: main pass −70 % (≈ 480–680 → 130–190 draws), ≈ −3 to −6 ms CPU/frame on a laptop, active-mesh
evaluation proportionally cheaper; no visual change.
*Files*: src/destruction/runtime/debris.ts, src/render/batch.ts (large batch capacity), small hook in
src/destruction/runtime/world.ts (owned by the integration fixer).

### 5. [render] Room/portal visibility culling
*Evidence*: active meshes by room from the living room: living 133, kitchen 86, **master 96, bath 58,
utility 46**, west hall 19, outside 37 → 200/479 (41 %) behind walls/doors; from the foyer 225/675 (33 %:
master, bath, utility, bedroom 2).
*Plan*: room bits per mesh from the world AABB (`roomMaskForBox`, refreshed on rebuild/move); per frame the
visible room set from the camera room through portals in the frustum (open-plan edges, doorways whose door
island is open or destroyed, windows, and holes: a partition island that lost parts opens a portal between its
two rooms); feed only visible-room meshes (plus room-less ones: exterior, viewmodel, vfx) to the main pass via
`scene.setActiveMeshCandidateProvider()` (Babylon still frustum-culls the candidates). Shadow lists stay
independent (cached, #1).
*Expected gain*: −33–41 % main-pass draws, fragment work and evaluation; conservative portals avoid pop-in.
*Files*: src/render/env/roomGraph.ts, src/render/renderSystem.ts.

### 6. [render] Post chain: true half-res SSAO, fused finishing pass
*Evidence*: 14 passes, 10 full-res half-float; SSAO pass at full res (Babylon ignores `ssaoRatio` for it),
`blurRatio: 1` makes BlurV + combine full-res, plus the full-res `SSAOOriginalSceneColor` copy; grain,
chromatic aberration, FXAA and the composite are four separate full-res passes.
*Plan* (`src/render/postfx.ts`, `env/compositePass.ts`): `blurRatio 0.5`, 8–12 samples on high (16 on ultra)
or a custom half-res SSAO reading the prepass depth/normals; fold grain + chromatic aberration + flash/PS2 into
the composite and keep FXAA last; bloom kernel 72 → 48 at half res.
*Expected gain*: 14 → ~9 passes (5 full-res passes fewer), ≈ 1.5–3 ms GPU at 1080p on a mid-range laptop,
SSAO cost about halved; same effects, same order.
*Files*: src/render/postfx.ts, src/render/env/compositePass.ts.

### 7. [render] Freeze world matrices of island meshes, re-freeze when the node moves
*Evidence*: `_evaluateActiveMeshes` 5–10 ms idle, 36–70 ms after destruction; `_isSynchronized`,
`computeWorldMatrix`, `getWorldMatrix`, `_update` are the top JS self-time entries outside shadows/Havok; 12
frozen meshes in the scene.
*Plan*: `IslandBatcher.commit` freezes the mesh after the bounding-info update; one observer per island node
on `onAfterWorldMatrixUpdateObservable` re-freezes its child meshes when the node moves (physics fast-sync
already calls `computeWorldMatrix(true)` only on moved nodes); freeze static island nodes;
`doNotSyncBoundingInfo` where the batcher rebuilds the box itself.
*Expected gain*: evaluation −50–70 % (≈ −3 to −6 ms/frame idle on this VM, −20 to −40 ms after destruction);
no visual change.
*Files*: src/render/batch.ts.

### 8. [simulation] Fracture / consolidation bursts (single-frame hitches)
*Evidence*: `destruction.afterPhysics` max 196–204 ms in one step during the destruction window (p50 33 ms);
one 128 ms destruction step in an idle window right after the sleep fix landed (many islands crossing
`consolidateAfter` together → batch rebuilds in one step); 13 island mesh builds + 12 shadow-caster
changes per frame during destruction.
*Plan*: hard time budget for batch rebuilds in `DebrisSystem` (like the fracture queue, ≤ 1–2 ms/step) and
staggered consolidation; check the fracture queue's budget is honoured for the meshing/hull part (the profile
shows `wpolyClip`, `emitFace`, hull building in the spike frames); defer non-structural chunk rebuilds.
*Expected gain*: removes 100–200 ms hitches.
*Files*: src/destruction/runtime/debris.ts, src/destruction/runtime fracture queue, src/render/batch.ts.

### 9. [render] Point-light promotion and environment re-capture spikes
*Evidence*: moving between rooms re-promotes the shadowed point light (0.5 s check): the old generator is
disposed, a new `ShadowGenerator` + cube RTT is created, the light leaves the cluster (light layout of every
lit material changes) and the full cube renders (2000–3700 draws) that frame. A power cut re-captures the
environment probe: 6 faces × ~885 meshes ≈ 5.3k draws + an SH read-back stall.
*Plan*: keep one persistent cube generator/RTT per promoted slot and re-target it; keep the shadowed light in a
stable material slot; capture the probe from the cell batches (#4) and spread the 6 faces over 6 frames.
*Expected gain*: removes 50–150 ms hitches on room changes / power events.
*Files*: src/render/lighting.ts, src/render/reflections.ts, src/render/renderSystem.ts.

### 10. [render] Small items
* Screens: skip `tick()` for screens not active last frame or > 8 m away (canvas redraw + `texImage2D`,
  ≈ 3–8 ms per 15 Hz tick here). src/render/screens.ts.
* Sun caster culling: also drop casters below ~2 texels (now < 0.75) — debris specks; PCF QUALITY_LOW on
  medium. src/render/lighting.ts.
* The F3 `SceneInstrumentation` is never disposed; dispose it when F3 closes (src/ui/hud.ts) and fix the
  draw-call delta in src/core/game.ts (see above).

## Reproduce

```
node tests/perf.mjs                                         # vite build (no tsc) + idle, hall, destruction → docs/perf/latest.json (~35 min)
node tests/perf.mjs --scenarios idle --frames 10 --warm-steps 120 --warm-frames 2 --out test-results/perf/quick.json
node tests/perf.mjs --scenarios idle,whatif                 # A/B: every island forced asleep; then motors stopped too
node tests/perf.mjs --quality medium --scenarios destruction --profile --alloc   # simulation focus
node tests/perf.mjs --realtime-ms 8000                      # also run the real loop (accumulator) for 8 s
```

Options: `--no-build` (serve dist/), `--dist dir`, `--viewport 1920x1080`, `--frames N`, `--warm-steps N`,
`--warm-frames N`, `--minify`, `--url-extra "&nofurniture=1"`, `--out file`. The JSON holds per pass
`drawsPerFrame / drawsWhenRendered / renderedInFrames / trisPerFrame / programSwitchesPerFrame /
topCategories`; per render target `rendersPerFrame / drawsPerRender / cpuMsPerFrame`; post-process sizes;
`systemsMs` (every system's fixed-step and frame methods wrapped); `rttInvalidationsPerFrame` + sampled call
sites; `movedShadowCastersPerFrame`; `worstSimFrames`; `countsPerFrame` (island mesh builds, shadow-caster
changes, point-shadow promotions); heap / allocation-sampling data; optional CPU profile; and an inventory
(render targets, shadow generators with per-face/per-room what-ifs, islands with the batching what-if, active
meshes by room, post-processes, scene flags). Every SwiftShader shadow re-render costs 5–10 s of wall time, so
a full high-quality run takes ~35 min on this VM; medium quality (no point shadows) is ~3× faster.
Note: the `whatif` "motors off" step in latest.json was measured with an earlier version of the scenario that
zeroed every body's velocity (which woke the furniture); the harness now stops only the motor-driven islands
(validated in test-results/perf/whatif-check.json, medium: 0 moved casters, shadows cached).
