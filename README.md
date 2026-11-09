# Dead Mile

An original 3D zombie-smashing driving game for the browser. Drive as far as your fuel lets you, smash through the undead, earn cash, bolt on upgrades and go again until you reach the evac zone.

Built with **TypeScript, Vite, Babylon.js 9 and Havok physics**. Every model, texture, sound and music track is generated in code, so the game has no asset files.

## Play

```bash
npm install
npm run dev
```

Then open http://localhost:5173. To make a production build, run `npm run build`, then `npm run preview`.

## Controls

| Action | Keyboard | Gamepad |
|---|---|---|
| Gas / brake & reverse | W / S (or ↑ / ↓) | RT / LT |
| Steer | A / D (or ← / →) | Left stick |
| Pitch in the air | W / S | Left stick |
| Roll in the air | A / D or Q / E | Right stick |
| Boost | Shift | A / RB |
| Fire weapon | Space | X / LB |
| Handbrake | C | B |
| Launch from the garage | Enter | — |

## What's in it

- **5 cars** (hatchback, pickup, school bus, sports coupe, armored truck), each with a custom Havok raycast-vehicle setup: suspension, tire grip and drift, gears, air control, boost, fuel and visible damage.
- **6 upgrade slots with 4 tiers each.** Engine, fuel tank, wheels, armor, booster and weapon all show up on the car (plywood up to spiked plows, jerry cans, rockets, roof turrets).
- **5 levels and biomes:** Dust Highway, Dead Suburbs, Night City, Frozen Pass and Military Blockade. Each has a streamed road with ramps, forks, breakable barricades, explosive barrels, a checkpoint, an evac zone and weather.
- **Zombies with real ragdolls.** There are 5 types (shambler, runner, bloater, brute, climber) built from 10 parts with procedural animation. When hit, a zombie becomes a jointed Havok ragdoll with anatomical limits. Hard hits tear limbs off, bloaters explode in chain reactions, and climbers cling to your hood.
- **Juice:** cartoon blood and goo with ground and car splatter, sparks, explosions with shockwaves and flashes, smoke and fire, slow-motion moments, camera shake, bloom, and a cel-shaded toon look with ink outlines.
- **Weapons:** an auto-aim roof gun, a heavy gun and a flamethrower.
- **Synthesized audio:** engine, boost, skids, splats, crunches, booms, and an adaptive music loop.
- **Garage and progression:** a 3D turntable showroom, payouts where every run earns something, best-distance records and settings. Gore can be set to full, green or off.

## Developer switches

- `?run=N` skips the garage and starts level N. Add `&car=pickup&tier=4` to drive a maxed-out car, and `&cash=50000` to set your cash.
- `?sandbox=zombies` (or `vehicles`, `world`) opens an isolated test scene for that module.
- `?reset` wipes the save.
- The backquote key (`) opens the tuning/debug panel, and F9 shows physics shapes.

See [docs/ARCHITECTURE.md](docs/ARCHITECTURE.md) for how the code is organized.
