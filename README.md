# Minecraft: Photorealistic Physics Edition (fan recreation)

A private, non-commercial fan recreation of Minecraft that runs in the browser. The gameplay, world
structure, blocks, items and progression follow Minecraft, while the presentation is rebuilt with a
modern deferred HDR renderer and realistic physics.

> Not affiliated with or endorsed by Mojang Studios or Microsoft. No Minecraft assets are used;
> every texture, model, sound and piece of music is generated procedurally at runtime.

## Running

Requirements: Node.js 20+ and a desktop browser with WebGL2 (Chrome, Edge or Firefox). A dedicated
GPU is strongly recommended.

```bash
npm install
npm run dev        # http://localhost:5173
npm run build      # production build in dist/ (then: npm run preview)
npm test           # unit tests
```

On first launch the game generates all block materials on the GPU (a few seconds), builds the
atmosphere lookup tables and pre-renders the most common sounds.

## Controls (Minecraft defaults)

| Action | Key |
|---|---|
| Move / jump / sneak / sprint | `W A S D` / `Space` / `Shift` / `Ctrl` (or double-tap `W`) |
| Break / attack | Left mouse |
| Place / use | Right mouse |
| Pick block | Middle mouse |
| Hotbar | `1`–`9`, mouse wheel |
| Inventory | `E` |
| Drop item (stack) | `Q` (`Ctrl+Q`) |
| Swap hands | `F` |
| Perspective | `F5` |
| Debug overlay | `F3` |
| Hide HUD | `F1` |
| Chat / command | `T` / `/` |
| Fly (creative) | double-tap `Space` |
| Zoom | `C` |
| Pause | `Esc` |

## Worlds, creative mode and landmarks

* **Saving**: worlds are stored in the browser (IndexedDB) and autosave every minute, when the tab
  is hidden, when you change dimension and on *Save and Quit*. Only player-made changes, container
  contents and entities are stored; untouched terrain regenerates from the seed. Continue a world
  from *Singleplayer*.
* **Creative mode**: pick *Creative* when creating a world. `E` opens the creative inventory
  (category tabs, search, survival inventory tab with a destroy-item slot).
* **One World Trade Center**: in the creative inventory (*Functional Blocks* or search "trade").
  Place it on open ground and a scaled replica rises in front of you over a few seconds: the
  square base with glass fins, the tapering shaft whose plan turns from a square into a 45° square
  (an octagon at mid-height), a parapet, roof deck and spire. The world is 256 blocks tall, so the
  tower is scaled to fit above the spot (about 1:3 at ground level, 178 blocks to the spire tip).
  Inside: a lobby, a floor every 4 blocks lit by sea lanterns and a ladder core to the roof.

## Vehicles

Both are in the creative inventory (*Tools & Utilities*). Place one, then right-click it to get in.

* **Helicopter**: `Space`/`Shift` collective, `W`/`S` pitch, `A`/`D` bank, mouse X yaw, change
  view (`V`), `Shift` on the ground to get out. Wait for rotor RPM after the engine starts.
* **M1 Abrams tank**: a 62 t, 9.8 m tank with 7 sprung road wheels a side, animated tracks and a
  stabilised turret. `W`/`S` drive and reverse (power-limited by the 1500 hp turbine, slower on
  sand and snow, stalls on steep climbs), `A`/`D` skid steer (pivots in place when stopped),
  `Space` brake. The mouse aims the turret and gun at real traverse/elevation rates. Left click
  fires the 120 mm gun (explosive impact, 6 s reload), hold right click for the coaxial machine
  gun, `C` zooms, `V` switches between the gunner's sight and the chase camera, and `Shift` gets
  out when slow. It flattens leaves, glass, plants and fences, crushes mobs, and brews up
  (turret thrown off, burning wreck) when the hull is destroyed.

## Portal gun

In the creative inventory (*Tools & Utilities*, or search "portal"). Left click fires a blue
portal, right click an orange one; each new shot replaces the portal of its colour. Portals open on
flat runs of opaque blocks (not glass, ice or leaves), slide to fit when you aim near an edge, and
settle onto the floor on walls so you can walk into them. Shots pass through existing portals.

* Each portal shows a live render of the world from the other one (several levels deep when two
  portals face each other), and you see yourself through them.
* Walking, jumping or falling into a portal carries you out of the other with your view and
  momentum intact: the wall behind the opening stops being solid, you cross when your eye crosses
  the portal plane, and the camera, interpolation and anti-aliasing history are carried through,
  so there is no cut. Falling into a floor portal and out of a wall one flings you; the speed is
  kept until you land. Dropped items and mobs go through too.
* Breaking the block a portal is on (or blocking its front) closes it. Portals are saved with the
  world.

## Graphics

* Deferred PBR pipeline (WebGL2, HDR): cascaded soft shadows (PCSS), screen-space ambient occlusion,
  coloured block light propagation (RGB flood fill) with smooth per-vertex lighting, physically based
  sky (Hillaire atmosphere LUTs) with volumetric clouds, moon phases and stars, aerial perspective,
  volumetric god rays, water with screen-space reflections, refraction, absorption, caustics and
  foam, rain wetness and puddles, TAA, bloom, auto exposure, ACES tonemapping and lens flare.
* Blocks keep the voxel grid but are rendered with bevelled edges, parallax-occlusion-mapped
  procedural materials (albedo, normal, height, roughness, metalness, emission, subsurface) in
  Minecraft's colour language, grass tufts and leaf foliage cards that sway in the wind.
* Distant terrain LOD renders the landscape far beyond the loaded chunks.
* Quality presets (Low / Medium / High / Ultra), render distance, render scale and texture
  resolution are in **Options**.

## Project layout

See [ARCHITECTURE.md](ARCHITECTURE.md) for contracts, the rendering pipeline and the game-layer APIs.

```
src/core      math, noise, RNG, input, worker pool
src/world     blocks, chunks, light engine, fluids, world generation (workers)
src/render    mesher, deferred renderer, materials, sky, post-processing, LOD
src/entity    entities, player, items, projectiles, mobs
src/game      game loop, interaction, combat, placement, systems
src/ui        HUD and menus
src/audio     procedural audio engine and generative music
debug/        standalone test pages (render, materials, sky, audio ...)
tools/        headless screenshot tool, world map renderer, audio checks
```
