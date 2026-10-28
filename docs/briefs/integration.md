# Brief: integration (boot, game loop, world assembly, debug API, smoke tests)

Owner paths: `src/main.ts`, `src/core/game.ts`, `src/world/world.ts`, `src/world/furnish/index.ts`,
`src/objects/registry.ts` (merge area registries; coordinate with what the builder-kit agent
wrote — keep its exports), `src/debug/**`, `index.html`, `vite.config.ts`, `tests/smoke.mjs`,
`tests/scenarios.mjs` (skeleton), `package.json` scripts. You may make SMALL glue fixes in other
modules when an integration bug is clearly theirs and tiny (document every such edit in your
report); for anything bigger, write the problem down precisely in your report.

Read first: `docs/briefs/_common.md`, `docs/ARCHITECTURE.md` (§3 loop), `src/core/context.ts`
(all system interfaces), all `docs/api-notes/*.md` TL;DRs (especially fixed-step stepping in
`input-loop-camera.md`/`physics-*`), and each module's main file to learn its factory signature:
`src/physics/physics.ts` (createPhysics), `src/render/renderSystem.ts` (createRender),
`src/audio/audio.ts` (createAudio), `src/vfx/vfx.ts` (createVfx), `src/destruction/destructionSystem.ts`
(Destruction), `src/player/input.ts` (Input), `src/player/player.ts` (Player), `src/ui/hud.ts` (Hud),
`src/world/structure.ts` (buildStructure), `src/world/furnish/*.ts` (content placements, some may
not exist yet).

Implement:
1. `src/main.ts` boot: Engine (WebGL2; options per the notes: powerPreference "high-performance",
   stencil true, antialias false (FXAA in the pipeline), `audioEngine: false` (we own Web Audio),
   preserveDrawingBuffer only in test mode), Scene (performance flags per notes:
   skipPointerMovePicking, etc.), GameContext assembly in dependency order: settings, time, rng
   (seed from `?seed=` or random), events, physics (createPhysics), render (createRender with
   HUD loading progress), audio (createAudio) + hooks (room resolver from plan.roomAt → acoustics;
   occlusion: physics raycast(s) listener→source against the STATIC layer (count hits up to 3,
   each wall attenuates; ignore the source's own island) → 0..1), vfx (createVfx with groundProbe =
   downward physics raycast against STATIC|DYNAMIC), destruction (new Destruction(ctx)), input,
   player, hud, world (build: structure + furnishing, chunked with progress), debug. URL params:
   `?test=1` (deterministic seed, no pointer lock requirement, preserveDrawingBuffer, start
   immediately without the click-to-play screen), `?quality=low|medium|high|ultra`, `?ps2=1`,
   `?seed=N`, `?nofurniture=1` (structure only, for debugging). Robust error overlay on boot
   failure (message + stack, also `window.__simError`).
2. `src/core/game.ts`: the loop exactly as docs/ARCHITECTURE.md §3: per frame
   `n = time.beginFrame(dt)`; for each fixed step: input latch → player.fixedUpdate →
   destruction.beforePhysics → physics.step(FIXED_DT) → destruction.afterPhysics → vfx.fixedUpdate
   → time.tick; then per frame player.update, audio.setListener(camera pose) + audio.update,
   vfx.update, destruction.update, render.update, hud.update, debug.update, and render the scene
   WITHOUT letting Babylon advance physics by itself (use the verified mechanism). Pause when the
   menu is open (time.scale = 0, audio ducked), resume cleanly; handle tab visibility (pause).
3. `src/world/world.ts` (`WorldSystem`): build() spawns `buildStructure()` assemblies and all
   furnishing placements (`src/world/furnish/index.ts` gathers `furnishKitchen`, `furnishLiving`,
   `furnishBedrooms`, `furnishUtility`, `furnishFixtures` — import those that exist; content agents
   are writing them concurrently, so make the index tolerant: if a module is missing at the time
   you finish, leave a clearly marked list the orchestrator can extend), then a SETTLE phase
   (run ~90 physics steps so everything comes to rest, then let auto-sleep take over), then
   `render.captureEnvironment()`; `rooms` (RoomInfo with acoustics from plan.ts), `roomAt`,
   `spawn` (plan SPAWN). Report spawn timing and counts (assemblies, parts, bodies, triangles).
4. `src/debug/api.ts`: `window.__sim` per docs/ARCHITECTURE.md §12 — `ready`, `error`,
   `step(n)` (advance n fixed steps synchronously, rendering once at the end), `stats()` (fps,
   frame ms, physics/destruction stats, draw calls, active meshes, voices, particles, micro),
   `listAssemblies()`, `findAssembly(nameOrType)`, `hit({ id | point, tool, power, dir })` (strike
   via destruction.strike as if the player swung that tool at the target), `throwAt(id, speed)`,
   `spawn(type, pos)` (registry), `teleport(pos, yaw, pitch)`, `setTool`, `action(name, power)`
   (player.debugAction), `setQuality`, `setPS2`, `events(sinceIndex)` (ring buffer of recent game
   events for tests), `screenshotPoses` (named camera poses per room). Plus an F3 debug overlay
   data provider for the HUD.
5. `tests/smoke.mjs`: build must exist; serve `dist/`, open `/?test=1`, wait for `__sim.ready`
   (timeout 180 s), assert no page errors / console errors (ignore known benign warnings, list
   them explicitly), run a few seconds, hit a couple of assemblies via `__sim.hit`, take
   screenshots from 4–6 poses (living room, kitchen, bathroom, bedroom 2, balcony view), print
   stats. `tests/scenarios.mjs`: skeleton runner with 2–3 example scenarios (QA agent extends).
6. Make `npm run build` succeed (no type errors in the whole project: `npm run typecheck`), and
   the smoke test pass. Look at the screenshots critically and report visual problems you see
   (missing textures, black rooms, floating objects, z-fighting, broken lighting) with the module
   responsible.
