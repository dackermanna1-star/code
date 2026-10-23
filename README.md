# Battlespace

A browser-based modern warfare simulator in the spirit of *Ultimate Epic Battle Simulator*: two large combined-arms armies fight autonomously over towns, airbases and high ground while you watch from a completely free spectator camera. Every soldier, vehicle, aircraft and drone is driven by AI; you are an observer.

Built with [three.js](https://threejs.org) (WebGL 2) and the Web Audio API. All models, textures and sounds are generated procedurally at startup: there are no asset files.

## Running

```bash
npm install
npm run dev          # http://localhost:5173
npm run build        # production build in dist/
npm run build:single # also writes dist/battlespace.html (one self-contained file) and dist/site/ (page + script for hosts that supply the document skeleton)
```

Tests and tooling:

```bash
npm test             # headless simulation tests (Node, no browser)
npm run bench        # simulation throughput: node scripts/bench-sim.mjs [scenario] [size] [seconds]
npm run smoke        # headless Chromium smoke test with screenshots in screenshots/
                     # node scripts/smoke.mjs [scenario] [quality] [fastForwardSeconds] [time] [weather]
node scripts/diag-battle.mjs town 600 900   # battle flow report: squad states, captures, kills by weapon
```

## What's in a battle

**Theaters** (procedurally generated from a seed, 2 × 2 km each):

| Scenario | Setup |
| --- | --- |
| Town Assault | Coalition attacks north into a fortified market town: plaza, church, apartment core, residential streets, factory district, farmland and hedgerows. |
| Airbase Strike | Assault on a Federation forward airbase: HESCO perimeter, guard towers, hangars, command post, fuel depot, runway, plus a village on the approach. |
| Hill 305 | Meeting engagement over a forested ridge, a summit strongpoint and the village beneath it. |
| Crossroads | Meeting engagement across open farmland: crossroads village, mill farm and grain silos. |

In the two assault scenarios the attacker fields about 1.6 times the defender's strength and a deeper reinforcement pool; meeting engagements are symmetric. Holding more objectives drains the other side's tickets; a side that runs out of tickets gets no more reinforcements and is beaten once its army is shattered or its last stand fails.

**Forces** (Coalition vs. Federation, western- and eastern-style equipment with fictional designations): riflemen, squad leaders, grenadiers, machine gunners, AT riflemen, ATGM teams, snipers, MANPADS teams, FPV drone operators; main battle tanks, IFVs and APCs carrying mechanized infantry, scout cars, SPAAGs, self-propelled howitzers, MLRS; attack and transport helicopters, strike jets, transport planes, recon UAVs and FPV kamikaze drones.

### Simulation

- **Ballistics**: every round is a simulated projectile with gravity and quadratic drag; rockets have motor burns; guided missiles fly real guidance (wire-guided, laser, fire-and-forget top attack, IR seekers that flares can decoy, radar SAMs) with proximity fuses; artillery and rocket salvos fly computed high arcs and whistle before impact; bombs are released on a continuously computed impact point.
- **Damage**: armor by facing (front/side/rear/top, turret front) with impact-angle effective thickness, penetration vs. armor in mm, ricochets, spall, mobility and firepower kills, fires, crew bail-outs, ammunition cook-offs that throw turrets. Infantry take hits by body region with vests and helmets; blasts are blocked by cover.
- **Wounds**: a lethal wound may leave a soldier down and bleeding out instead of killed outright; squadmates go over and stop the bleeding when the fire allows. Lighter wounds bleed for a while and slow the soldier down. Close blasts and heavy-calibre rounds tear off arms and legs.
- **Bodies**: fallen soldiers become ragdolls that take the impulse of the shot or blast that killed them, fall onto roofs, walls and wrecks, and are tossed again by later explosions. Knees and elbows bend one way only, hips, shoulders and the neck stay within their natural range, limbs collide with each other and with the torso, the torso is a solid block that lies flat on its front, back or side, and bodies pile on one another. Weapons drop separately. Blood sprays on hits, pools spread under bodies and the wounded leave drip trails (the menu's "Blood and wounds" option turns this off). Bodies stay on the field for the whole battle.
- **Suppression and morale**: near misses and explosions suppress; suppressed soldiers go prone, cower and lose accuracy; squads that take losses break and fall back.
- **Destructible environment**: buildings break down in stages: hits leave breach holes and chipped walls, heavy damage brings the roof and upper floors down into a burning shell (anyone on the roof comes down too), and finally the building slumps into a rubble mound with masonry, slabs and beams strewn around. Walls, hedges, fences and cars are crushed by tanks; trees fall to tanks and blasts; shells crater the terrain and leave scorch marks; wrecks become cover and obstacles; smoke screens and dust block line of sight.
- **Weather and time**: clear, overcast, rain, thunderstorms and fog that shift during the battle, a full day/night cycle; visibility affects spotting (thermal optics on vehicles, aircraft, snipers and missile teams see further at night and in fog).

### AI

- **Commander** (one per side): builds the army from the setup sliders, deploys attackers, garrisons defenders in objectives, fortifications and rooftops, picks the main effort, allocates squads and platoons, sends some squads on flanking approaches, places snipers and ATGM teams on overwatch positions with sight lines, runs artillery fire missions (with danger-close checks and an opening barrage), calls in close air support, heliborne insertions, paradrops and recon UAVs, sends reinforcement waves and merges shattered squads.
- **Squads**: mounted movement in IFVs/APCs with dismounts under fire, formation travel, contact drills, bounding overwatch, flanking routes planned around known enemy fire (threat-weighted A*), final assaults with grenades, defensive holds, retreats and regrouping.
- **Soldiers**: limited line-of-sight spotting with concealment (stance, camouflage, forest, smoke, muzzle flash), a human reaction time before engaging a new enemy, threat-based target selection, cover selection against the current threat, stance changes, aiming with lead and drop, aimed single shots at long range, getting low to reload, grenades and smoke.
- **Close quarters**: snap shots at short range, cover sought only nearby when the enemy is close, leaning out from building corners to fire and ducking back, fire-and-movement rushes between bits of cover with a grenade volley before the final assault, hand-to-hand blows at arm's length, and rockets fired at rooftop positions.
- **Vehicles**: short halts to fire, frontal armor toward the threat, coax and commander's MGs on infantry, smoke and reversing when missiles inbound, overwatch for their dismounted squads, shoot-and-scoot artillery.
- **Aircraft and drones**: attack helicopters fight from standoff and reposition, jets fly ingress/attack/egress with re-attacks, transport helicopters land troops, planes drop paratroopers, FPV drones cruise in and dive onto vehicle roofs.

## Watching

| Key | Action |
| --- | --- |
| W A S D, Q / E | Fly, down / up (Shift boost, Ctrl precise) |
| Right-drag (or drag) | Look around |
| Mouse wheel | Camera speed (free) / zoom (orbit, chase, map) |
| Left click | Select a unit |
| F / V / O | Chase / first person (soldier's eyes, vehicle gunner's sight with reticle, cockpit, FPV drone feed) / orbit the selection |
| 1 – 6 | Free · Orbit · Chase · Eyes · Cinematic director · Battle map |
| ] / [ | Next / previous unit |
| R | Jump to the heaviest fighting |
| T | Follow a random aircraft |
| Space, − / + | Pause, time scale (0.25× to 4×) |
| M, Tab, P, H | Markers (objectives, faint rings under soldiers that grow with distance, unit markers on the battle map), hide interface, performance stats, help |

## Playing a soldier

Select any soldier (or none: the one nearest the camera is used) and press **Enter**, or use the unit card's Play button. The AI lets go of him and you fight in first person; his squad carries on around you. Click the view to capture the mouse.

| Key | Action |
| --- | --- |
| W A S D, Shift | Move, sprint |
| Mouse (or arrow keys) | Look |
| Left click | Fire (automatic weapons fire while held) |
| E (or right button) | Aim down the sights; the marksman rifle has a scope, missile launchers lock onto vehicles or aircraft held in the sight |
| R | Reload |
| C / Z / Space | Crouch / prone / stand |
| G | Throw a grenade |
| F | Rifle-butt strike at arm's length |
| Q, 1 2 3, wheel | Switch weapon (rifle, grenade launcher, rocket launcher, missile) |
| B | Dress a bleeding wound |
| V | Over-the-shoulder view |
| Esc | Release the mouse (pauses), then Esc again to hand the soldier back to the AI |

When he falls the view pulls back over his body; **Enter** takes over the nearest soldier of the same side (squadmates first). The played soldier takes a little less damage than the AI's.

## Architecture

```
src/
  core/     seeded RNG, math (ballistics, intersection tests), spatial grids
  world/    heightmap terrain, scenario generation, structures, navigation (A*), line of sight
  sim/      units, weapons and mounts, projectiles, damage model, smoke, weather, objectives, World
  ai/       commander, squads, soldier/vehicle/aircraft brains, perception, faction intel, cover
  render/   terrain LOD, sky and weather, instanced soldiers/vehicles/aircraft, structures,
            GPU particles, tracers, effects, post-processing; models/ builds every 3D model
  audio/    procedural sound synthesis, spatial mixing, engine loops, ambience
  camera/   spectator camera modes and the cinematic director
  ui/, app/ setup menu, HUD, minimap, main loop, playing a soldier
```

The simulation has no rendering or DOM dependency (it runs under Node for tests and benchmarks). It produces an event stream (shots, impacts, explosions, wounds, kills, structural damage) that the effects, ragdolls, audio and HUD consume.

Performance techniques: counting-sort spatial grids rebuilt every tick, staggered AI thinking that slows down gracefully as armies grow, near-first enemy scanning, a per-tick line-of-sight budget with caching, time-budgeted path queue, a fixed 30 Hz simulation step when a step gets expensive, closed-form GPU particles (the CPU only writes particles at birth), shader-animated instanced soldiers (a whole army in a few draw calls), ragdolls only near the camera that sleep once still, chunked terrain LOD, instanced everything, and dynamic resolution scaling.
