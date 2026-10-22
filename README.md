# Battlespace

A browser-based modern warfare simulator in the spirit of *Ultimate Epic Battle Simulator*: two large combined-arms armies fight autonomously over towns, airbases and high ground while you watch from a completely free spectator camera. Every soldier, vehicle, aircraft and drone is driven by AI; you are an observer.

Built with [three.js](https://threejs.org) (WebGL 2) and the Web Audio API. All models, textures and sounds are generated procedurally at startup: there are no asset files.

## Running

```bash
npm install
npm run dev          # http://localhost:5173
npm run build        # production build in dist/
npm run build:single # also writes dist/battlespace.html, a single self-contained file
```

Tests and tooling:

```bash
npm test             # headless simulation tests (Node, no browser)
npm run bench        # simulation throughput: node scripts/bench-sim.mjs [scenario] [size] [seconds]
npm run smoke        # headless Chromium smoke test with screenshots in screenshots/
```

## What's in a battle

**Theaters** (procedurally generated from a seed, 2 × 2 km each):

| Scenario | Setup |
| --- | --- |
| Town Assault | Coalition attacks north into a fortified market town: plaza, church, apartment core, residential streets, factory district, farmland and hedgerows. |
| Airbase Strike | Assault on a Federation forward airbase: HESCO perimeter, guard towers, hangars, command post, fuel depot, runway, plus a village on the approach. |
| Hill 305 | Meeting engagement over a forested ridge, a summit strongpoint and the village beneath it. |
| Crossroads | Meeting engagement across open farmland: crossroads village, mill farm and grain silos. |

**Forces** (Coalition vs. Federation, western- and eastern-style equipment with fictional designations): riflemen, squad leaders, grenadiers, machine gunners, AT riflemen, ATGM teams, snipers, MANPADS teams, FPV drone operators; main battle tanks, IFVs and APCs carrying mechanized infantry, scout cars, SPAAGs, self-propelled howitzers, MLRS; attack and transport helicopters, strike jets, transport planes, recon UAVs and FPV kamikaze drones.

### Simulation

- **Ballistics**: every round is a simulated projectile with gravity and quadratic drag; rockets have motor burns; guided missiles fly real guidance (wire-guided, laser, fire-and-forget top attack, IR seekers that flares can decoy, radar SAMs) with proximity fuses; artillery and rocket salvos fly computed high arcs and whistle before impact; bombs are released on a continuously computed impact point.
- **Damage**: armor by facing (front/side/rear/top, turret front) with impact-angle effective thickness, penetration vs. armor in mm, ricochets, spall, mobility and firepower kills, fires, crew bail-outs, ammunition cook-offs that throw turrets. Infantry take hits by body region with vests and helmets; blasts are blocked by cover.
- **Suppression and morale**: near misses and explosions suppress; suppressed soldiers go prone, cower and lose accuracy; squads that take losses break and fall back.
- **Destructible environment**: buildings take damage, burn and collapse into rubble (killing rooftop occupants); walls, hedges, fences and cars are crushed by tanks; trees fall to tanks and blasts; shells crater the terrain and leave scorch marks; wrecks become cover and obstacles; smoke screens and dust block line of sight.
- **Weather and time**: clear, overcast, rain, thunderstorms and fog that shift during the battle, a full day/night cycle; visibility affects spotting (thermal optics on vehicles, aircraft, snipers and missile teams see further at night and in fog).

### AI

- **Commander** (one per side): builds the army from the setup sliders, deploys attackers, garrisons defenders in objectives, fortifications and rooftops, picks the main effort, allocates squads and platoons, sends some squads on flanking approaches, places snipers and ATGM teams on overwatch positions with sight lines, runs artillery fire missions (with danger-close checks and an opening barrage), calls in close air support, heliborne insertions, paradrops and recon UAVs, sends reinforcement waves and merges shattered squads.
- **Squads**: mounted movement in IFVs/APCs with dismounts under fire, formation travel, contact drills, bounding overwatch, flanking routes planned around known enemy fire (threat-weighted A*), final assaults with grenades, defensive holds, retreats and regrouping.
- **Soldiers**: limited line-of-sight spotting with concealment (stance, camouflage, forest, smoke, muzzle flash), threat-based target selection, cover selection against the current threat, stance changes, aiming with lead and drop, grenades and smoke.
- **Vehicles**: short halts to fire, frontal armor toward the threat, coax and commander's MGs on infantry, smoke and reversing when missiles inbound, overwatch for their dismounted squads, shoot-and-scoot artillery.
- **Aircraft and drones**: attack helicopters fight from standoff and reposition, jets fly ingress/attack/egress with re-attacks, transport helicopters land troops, planes drop paratroopers, FPV drones cruise in and dive onto vehicle roofs.

## Watching

| Key | Action |
| --- | --- |
| W A S D, Q / E | Fly, down / up (Shift boost, Ctrl precise) |
| Right-drag (or drag) | Look around |
| Mouse wheel | Camera speed (free) / zoom (orbit, chase, map) |
| Left click | Select a unit |
| F / V / O | Chase / first person (soldier's eyes, gunner's sight, cockpit, FPV drone feed) / orbit the selection |
| 1 – 6 | Free · Orbit · Chase · Eyes · Cinematic director · Battle map |
| ] / [ | Next / previous unit |
| R | Jump to the heaviest fighting |
| T | Follow a random aircraft |
| Space, − / + | Pause, time scale (0.25× to 4×) |
| M, Tab, P, H | Objective markers, hide interface, performance stats, help |

## Architecture

```
src/
  core/     seeded RNG, math (ballistics, intersection tests), spatial grids
  world/    heightmap terrain, scenario generation, structures, navigation (A*), line of sight
  sim/      units, weapons and mounts, projectiles, damage model, smoke, weather, objectives, World
  ai/       commander, squads, soldier/vehicle/aircraft brains, perception, faction intel, cover
  render/   terrain LOD, sky and weather, instanced soldiers/vehicles/aircraft, structures,
            GPU particles, tracers, effects, post-processing; models/ builds every 3D model
  audio/    procedural sound synthesis, spatial mixing, engine loops, ambience, radio
  camera/   spectator camera modes and the cinematic director
  ui/, app/ setup menu, HUD, minimap, main loop
```

The simulation has no rendering or DOM dependency (it runs under Node for tests and benchmarks). It produces an event stream (shots, impacts, explosions, kills, radio) that the effects, audio and HUD consume.

Performance techniques: counting-sort spatial grids rebuilt every tick, staggered AI thinking, a per-tick line-of-sight budget with caching, time-budgeted path queue, closed-form GPU particles (the CPU only writes particles at birth), shader-animated instanced soldiers (a whole army in a few draw calls), chunked terrain LOD, instanced everything, and dynamic resolution scaling.
