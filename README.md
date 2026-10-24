# Wreckfield

A soft-body vehicle crash sandbox for the browser, in the spirit of BeamNG.drive. Every car is a
node-and-beam structure simulated at 1.5–2 kHz: panels crumple and stay bent, frames buckle,
windows crack and shatter, doors and hoods swing loose or tear off, wheels get knocked out of
alignment or ripped away, and engines overheat and die.

Built with TypeScript and Three.js. No external art or sound assets: the cars, terrain, props,
textures and every sound effect are generated procedurally at startup.

## Running

```bash
npm install
npm run dev        # http://localhost:5173
npm run build      # production build in dist/, plus a single-file dist/wreckfield.html
npm test           # physics regression tests (Node, no browser needed)
```

The single-file build (`dist/wreckfield.html`) runs from any static host or straight from disk.

## Controls

| Action | Keyboard | Gamepad |
| --- | --- | --- |
| Throttle / brake (hold brake when stopped to reverse) | W / S or ↑ / ↓ | RT / LT |
| Steer | A / D or ← / → | Left stick |
| Handbrake | Space | A |
| Repair and reset in place | R | Y |
| Reset to the zone spawn | Backspace / Home | D-pad up |
| Save / load position | K / L | D-pad left / right |
| Camera (chase, orbit, driver, hood, cinematic) | C, drag the mouse to look | B |
| Free camera | F (WASD, Q/E, mouse, Shift for speed) | |
| Slow motion (×1, ×½, ×¼, ×0.1) | T | Back |
| Pause physics | P | D-pad down |
| Headlights, horn, engine on/off | N, G, I | X (lights) |
| Manual gearbox (shift with E / Q) | M | RB / LB |
| Next vehicle | Tab | |
| Drop a random prop ahead | O | |
| Sandbox editor | B | |
| Locations map | J | |
| Controls help | H / F1 | |
| Menu | Esc | Start |

On phones and tablets an on-screen pad appears automatically.

## The map

A 1.6 km × 1.6 km valley ringed by mountains, connected by a ring road:

- **Proving Grounds Hub**: spawn plaza with cones, crates, a kicker and a tire wall.
- **Crash Test Center**: half-kilometre runway ending in a rigid barrier, an offset barrier, a
  steel pole, a tire wall and a parked target car.
- **Mace Gauntlet**: six giant spiked maces swinging across a walled corridor.
- **Spike Alley**: stingers that puncture tires, spinning spike drums and spiked walls.
- **Industrial Yard**: a toothed shredder you drive into, three hydraulic presses, a side
  crusher, a conveyor that feeds a press, and a crane wrecking ball.
- **Drop Zone**: gantries that drop concrete blocks, steel beams, containers and barrels as you
  cross the red line.
- **Obstacle Course**: sliding walls, sweeper arms, side rams, rising bollards, a see-saw and a
  launch pad.
- **Stunt Park**: a vertical loop, a 40 m mega ramp, quarter pipes, kickers, a container canyon
  and giant bowling pins.
- **Demolition Arena**: walled dirt bowl with wrecks; start a derby against AI rammers.
- **Dirt Hills** and **Summit Cliff**: off-road terrain and a 60 m drop at the end of a mountain
  road.

The sandbox editor (B) places any obstacle or prop anywhere, edits its parameters live (size,
speed, timing, swing angle, crush gap…), moves, rotates, disables or deletes it, and spawns AI or
parked cars.

## How it works

- `src/sim/` is a self-contained physics engine with no rendering dependencies:
  - `softbody.ts`: nodes and beams in typed arrays; beams yield plastically past their yield
    force (permanent deformation), harden as they crush, and break by force or over-stretch.
  - `world.ts`: fixed-step integrator, node collisions against terrain and static/kinematic
    colliders with Coulomb friction, and node-versus-triangle collisions between bodies.
  - `vehicle/structure.ts`: generates each car's lattice (about 220 nodes and 1,400 beams) from
    its parametric body shape, with separate hood, trunk, door and bumper parts held by hinge,
    latch and support beams. Crush strength is auto-calibrated so frontal crumple zones absorb
    impacts progressively and the passenger cell stays stronger.
  - `vehicle/vehicle.ts`: wheels on unsprung-mass suspension mounted to the deforming chassis,
    a combined-slip Pacejka tire model with relaxation lengths (so cars hold on slopes and slide
    smoothly), engine, auto clutch, gearbox, open/limited-slip/locked differentials, ABS and
    traction control, and the damage model (glass, lights, radiator, engine, tires, alignment).
- `src/render/` skins the procedural car meshes to the physics nodes: every node acts as an
  affine bone fitted from its neighbouring beams, so dents and folds deform the mesh smoothly. A
  paint shader exposes primer and bare metal where panels scrape or bend.
- `src/game/` holds the map, obstacles, props, cameras, input and game loop; `src/audio/`
  synthesizes the engine, tire, wind and impact sounds with Web Audio.
