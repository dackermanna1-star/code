# Dead Mile: architecture and build guide

Dead Mile is an original 3D zombie-smashing driving game in the "drive, crash, upgrade, go further" genre.
Stack: **TypeScript + Vite + Babylon.js 9 (`@babylonjs/core`) + Havok physics (Physics V2 API)**.

## Run it

```bash
npm install
npm run dev          # http://localhost:5173
```

URL switches:
- `?run=0`: skip the garage and start level 0 (`&cash=50000` to set cash)
- `?sandbox=<name>`: boot a module sandbox (`src/<name>/sandbox.ts`)
- `?reset`: wipe the save

In game, backquote (`) toggles the debug/tuning panel and F9 the physics shape viewer.
`window.game` is exposed. `game.debug.run` is the active `Run`, with `run.warp(dz)` to teleport ahead.

## World conventions
- **Units:** meters, kilograms, seconds, m/s. Gravity is −9.81.
- **Axes:** +Y is up. **The road runs along +Z** from z=0 (spawn) to `level.def.length` (the evac zone). X is lateral.
- Babylon is left-handed by default. Keep it that way.
- Nodes use `rotationQuaternion` once they have a physics body.

## Module map and file ownership

| Module | Files | Implements |
|---|---|---|
| core | `src/core/*` | Game loop, states, Run orchestrator, events, input, time/slow-mo, save, economy, debug |
| data | `src/data/*` | Balance tables: cars, parts, levels, zombies |
| world | `src/world/*` | `Level` (ILevel): streamed road chunks, ramps, obstacles, props, sky, lights, fog, shadows, evac zone |
| vehicles | `src/vehicles/*` | `Vehicle` (IVehicle): Havok raycast car, boost, fuel, air control, damage, stunts. `buildCarModel()` for visuals |
| zombies | `src/zombies/*` | `ZombieManager` (IZombies): spawning, procedural animation, AI, car hits, **ragdolls**, limb severing, climbers, bloaters |
| fx | `src/fx/*` | `FX`: blood, particles, decals, explosions, smoke, sparks, post-processing. Also the shared `Materials.ts` and `Shadows.ts` |
| camera | `src/camera/*` | `CameraRig`: chase cam, airborne side-cam, shake, speed FOV |
| audio | `src/audio/*` | `audio` singleton: synthesized engine, SFX, adaptive music (Web Audio API) |
| weapons | `src/weapons/*` | `Weapons`: roof gun, heavy gun, flamethrower (by loadout tier) |
| ui | `src/ui/*` | `HUD`, `GarageScreen`, `ResultsScreen`, `styles.css` |

**Public constructor signatures are fixed.** They're used by `core/Run.ts` and `core/States.ts`; check the current file for each. Modules talk to each other only through the interfaces in `src/core/types.ts` and the event bus in `src/core/Events.ts`. To react to something from another module, listen for its event rather than importing the module. If you need a new event, add it to `GameEvents` (append only, don't rename).

## Physics (Havok, Physics V2)
- Use `PhysicsAggregate`, or `PhysicsBody` plus `PhysicsShape*` for compound shapes.
- Collision layers are in `src/physics/Layers.ts`. Always set `shape.filterMembershipMask` and `shape.filterCollideMask`.
- Raycasts: `scene.getPhysicsEngine()!.raycastToRef(from, to, result, { membership: X, collideWith: Y })`.
- Constraints for ragdolls: `BallAndSocketConstraint`, `HingeConstraint`, or `Physics6DoFConstraint` with limits.
- Physics steps automatically inside `scene.render()`. The time step is set each frame from `Time.dt`, so slow-mo slows physics.
- The vehicle applies its forces in `scene.onBeforePhysicsObservable`, which Run wires up.
- Use `body.setCollisionCallbackEnabled(true)` and `body.getCollisionObservable()` for impact events.
- Keep active dynamic bodies bounded. Freeze or sleep old ragdolls and debris, and dispose what falls behind the car.

## Visual style: "toy diorama apocalypse"
**Bold, clean, low-poly cartoon.**
- **Materials:** always use `toon(scene, hex)` from `src/fx/Materials.ts`. It gives cel-shaded bands plus a rim light, and materials are cached per color, so they're cheap. Use `{ emissive: 1 }` for lights, neon and fire, and `{ unlit: true }` for flat effects.
- **Outlines:** `outline(mesh)` on cars, zombies, ragdoll parts and hero props only, not on terrain or small debris.
- **Shapes:** chunky primitives (boxes, cylinders, low-tessellation spheres) with exaggerated proportions. Cars have big wheels and rounded-box bodies. Zombies have big heads, long arms and hunched backs. Use `tessellation`/`segments` of 6–12 and call `convertToFlatShadedMesh()` on rounded meshes for the faceted look.
- **Color:** use the level `palette` from `src/data/levels.ts` for anything in the world. Zombie colors come from `src/data/zombies.ts`, car colors from `src/data/cars.ts`.
- **Shadows:** register casters with `Shadows.cast(mesh)` from `src/fx/Shadows.ts`. The level owns the generator. Set `mesh.receiveShadows = true` on ground and road.
- **Gore** is cartoon-red chunky splats. Respect `ctx.save.data.settings.gore`: `"full"` is red, `"green"` is green goo, `"off"` gives dust puffs and no decals.

## Performance rules (the target is 60 FPS on a mid-range laptop)
- Don't allocate in per-frame hot paths. Reuse `Vector3`s and use the `*ToRef` methods.
- Static world geometry: merge per chunk (`Mesh.MergeMeshes`), then `freezeWorldMatrix()`, and set `isPickable = false`.
- Repeated props and zombies: use `createInstance()` or thin instances where possible.
- Cap ragdolls at about 25 active (the oldest ones freeze) and debris at about 60. Dispose anything more than 80 m behind the car.
- `ctx.save.data.settings.quality` is `"low"`, `"medium"` or `"high"`. Scale particle counts, shadow map size and draw distance with it.

## Testing in this cloud container
- A shared dev server may already be running at `http://localhost:5173`. Check with `curl -s localhost:5173 >/dev/null`. If it isn't running, start it with `npx vite --port 5173 --strictPort` in the background.
- Headless screenshot helpers live in the scratchpad: `/tmp/claude-0/-home-user-code/7af6a829-3f69-5c49-89ad-70aea5a1d7c7/scratchpad/`
  - `node shot.cjs <url> <out.png> [waitMs] [jsExpr]` takes a screenshot and optionally evaluates JS.
  - `node drive.cjs <url> <outPrefix> <seconds> [KeyW,ShiftLeft,...]` holds keys and screenshots every second, then prints the vehicle state.
- Run the type check with `npx tsc --noEmit`. Other modules may be mid-edit, so only errors in your own files count.
- The software renderer here (SwiftShader) runs at about 30–40 FPS, so judge visuals there and leave FPS for real hardware.
