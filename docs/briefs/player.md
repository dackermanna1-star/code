# Brief: player, input, HUD (`src/player/*.ts` except tools, `src/ui/**`)

Owner paths: `src/player/input.ts`, `src/player/player.ts`, `src/player/interaction.ts`,
`src/player/footsteps.ts`, `src/player/camera.ts`, `src/ui/**`, `tests/probes/player-*.probe.ts`.
NOT yours: `src/player/tools/**` (tools agent, concurrent; contract in `src/player/contracts.ts`).
Read first: `docs/api-notes/input-loop-camera.md`, `docs/api-notes/physics-constraints-character.md`
(character controller + grab mechanics), `docs/api-notes/physics-events-queries.md` (raycasts),
`src/core/context.ts` (InputSystem, PlayerSystem, HudSystem, TargetInfo, DestructionSystem),
`src/player/contracts.ts`, `src/core/settings.ts`, `src/world/plan.ts`.

1. `class Input implements InputSystem` (`src/player/input.ts`, `new Input(canvas, settings)`):
   pointer lock (click canvas to lock; graceful drag-to-look fallback when lock is unavailable),
   mouse deltas (sensitivity, invertY), wheel, keyboard via `event.code`. Key map: WASD/arrows
   move, Space jump, ShiftLeft sprint, C or ControlLeft crouch, Mouse0 fire, Mouse2 grab/drop
   (action "grab"), V or
   Mouse1 alt (crowbar pry / extinguisher spray), E use, F kick (or slam while holding), G stomp,
   R rotate held object, Q drop/holster, Digit1–7 tools, Escape pause, F3 debug. Edge detection
   (`pressed`/`released` latched until consumed in the next fixed step), no stuck keys on blur.
2. `class Player implements PlayerSystem` (`src/player/player.ts`, `new Player(ctx)`; uses
   ctx.physics (plugin for the character controller), ctx.destruction, ctx.render (camera,
   getShake), ctx.events, ctx.input, ctx.settings, ctx.audio-free): Havok PhysicsCharacterController
   capsule (height 1.8, radius 0.3; crouch 1.1 if the API allows resizing, else emulate by eye
   height + slower speed and a ceiling check), eye height 1.65 (crouch 1.0), walk 3.6 m/s, sprint
   6.0, crouch 1.6, acceleration/friction for weighty but responsive feel, jump (≈ 1 m apex),
   air control, step-up over small debris per the notes, slopes. Camera: yaw/pitch (clamp ±89°),
   FOV from settings, subtle head-bob, landing dip, sprint FOV kick (small), apply render.getShake().
   Stomp on landing: landing on a destructible body with vertical speed > 3 m/s →
   `destruction.strike({source:"stomp", mass ≈ 0.4·80, speed = vy, …})` at the support point;
   emit `land`. Footsteps (`footsteps.ts`): stride-based events with the floor material
   (`destruction.materialAt` on the support body, fallback room floor from plan.ts).
3. Interaction (`interaction.ts`): per-frame target raycast (reach 2.6 m) → `destruction.target`
   for the HUD; GRAB (Mouse2): dynamic islands → hold with the mechanism recommended in the notes
   (force-capped spring/PD toward a point in front of the camera; lift strength ≈ 450 N, so
   objects heavier than ~40 kg can only be dragged/tilted; angular damping; keep the grab point
   offset so things hang naturally), switch the held body to the HELD layer while held; wheel =
   hold distance (0.6–2.5 m); R + mouse = rotate; THROW (fire while holding; hold to charge
   0.2–1 s) with energy ≤ 250 J → v = min(√(2E/m), 16 m/s) along view + inherit player velocity;
   SLAM (F while holding): thrust the held object forward/down hard for 0.15 s (high spring
   target) — great for smashing things against the floor; drop if the object gets stuck far away
   (> 1.2 m from target) or if the player stands on it; grabbing parts of STATIC or jointed islands
   (doors, wall cabinets, toilet seat lids) holds the grab point and calls
   `destruction.pull(body, point, springForce, dt)` each fixed step (joints swing; enough sustained
   pull rips them off). E = `destruction.use(...)`. Emit grab/throw/drop events.
4. Tools: own an `IToolSystem` from `src/player/tools/toolSystem.ts` (concurrent agent; if not yet
   present, guard the import in your probes only); build the `ToolContext` each step; route fire/
   alt to tools when not holding; kick (F, not holding) → tools.kick; stomp (G) → tools.stomp;
   Digit1–7 → tools.select; `debugAction` implements the listed actions for tests.
5. HUD (`src/ui/hud.ts`, `hud.css`, `menu.ts`) implementing `HudSystem` (`new Hud(ctx)`): HTML
   overlay above the canvas: start screen ("APARTMENT DESTRUCTION SIM", click to play, controls
   summary, quality + PS2 mode toggles, credits for CC0 assets), loading bar (`setLoading`/
   `hideLoading`), crosshair with states (default / grab / pry / use), tool hotbar 1–7 with names
   and the selected tool highlighted, charge meter, target info (assembly name + damage %), stats
   panel (FPS, "Damage: $12,345" repair bill (sum of valueLost), % destroyed, debris pieces, active
   bodies), toasts/hints (first-time tips: "Hold LMB to charge a swing", "RMB to grab", "Throw
   things at the walls"), pause menu (Esc) with settings (sensitivity, FOV, master/sfx/ambience
   volume, quality preset, PS2 mode, camera shake, hit-stop, show stats/hints/target) + resume +
   controls; debug overlay (F3: physics/destruction/render/audio/vfx stats). Retro-but-clean
   style (late-2000s console menu vibe), readable at 1080p and small windows. Pointer-lock
   interplay: menus release the lock; clicking resume re-locks.
6. Probes: character walk/jump/step-up/stomp detection, grab+throw of a box (velocity check),
   pull on a hinged door body, HUD screenshot (start screen, in-game HUD, pause menu).

## Addendum (constraints/input notes landed)
- Grab = joint with position motors to an ANIMATED anchor (450 N lift / 300 N push cap), created
  once per grab (constraints leak). Joint to a static body applies nothing: compute pull force by hand.
- Character controller: radius 0.3, characterStrength ~600 N, characterMass 80, keepDistance 0.02,
  keepContactTolerance 0.03; ignore "supported" a few steps after jump; raycasts must ignore the capsule.
- Input: window keydown/keyup with event.code; virtual-lock mode + `injectLook(dx,dy)` for headless tests.
- Viewmodel: renderingGroupId 1 (tools agent) — no second camera.
