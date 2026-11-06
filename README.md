# DEAD COUNTY

*A voxel zombie-survival sandbox: the look, movement and exploration of Minecraft with the hardcore survival
of DayZ and Project Zomboid.*

Ten days after the outbreak, Millbrook, Kentucky is dead. The radio went quiet yesterday. You're one of the last
people alive in a large post-apocalyptic county: downtown, suburbs, a hospital, the police station, farms,
forests, a lake, the interstate, a military checkpoint and the FEMA camp that fell. Scavenge, craft, fight
and survive as long as you can. Death is permanent.

## Running

```bash
npm install
npm run dev        # http://localhost:5173
```

Production build: `npm run build` (output in `dist/`, served with `npm run preview`). A WebGL2 browser
(Chrome / Edge / Firefox) is required. World generation takes a few seconds on first load.

## Controls

| Key | Action |
|---|---|
| WASD | Move |
| Shift | Sprint (uses stamina) |
| C | Crouch / sneak (quieter, harder to see) |
| Space | Jump / swim up / climb ladders |
| Mouse | Look |
| Left click | Attack / fire (hold for automatic weapons) |
| Right click | Aim down sights (guns) · shove (melee) |
| R | Reload / clear a jam |
| B | Toggle fire mode |
| V | Shove · look down at a downed zombie + attack = stomp |
| G | Throw (molotov, pipe bomb, flare, bottle...) |
| F | Flashlight / headlamp |
| E | Interact: open doors & containers, loot bodies & cars, drink, sleep, pick up |
| Q | Drop held item |
| 1-9 / wheel | Hotbar |
| Tab / I | Inventory (drag & drop, shift-click, right-click menu, double-click to use) |
| X | Crafting |
| H | Health: wounds and treatment |
| M | Map (reveals as you explore, or read a town map) |
| K | Skills |
| Esc | Pause |

## What's in it

**Survival.** Hunger, thirst, stamina, rest, body temperature (clothing insulation, rain, wetness, fires, autumn
nights), carry weight, sickness from rotten food and dirty water, panic, pain, drunkenness. Wounds per body part:
scratches, lacerations, bites, deep wounds, fractures, burns and glass cuts. They bleed until bandaged, can become
infected (disinfect them or take antibiotics), and heal over time. Bites can carry the zombie infection. Its
symptoms show up hours later and it is lethal unless you find experimental antiviral medicine.

**Zombies.** They see you (worse at night, in fog, while you crouch or hide in bushes and corn), hear you
(footsteps, gunshots, doors, breaking glass, car alarms, explosions) and notice you up close. They wander,
investigate noises, chase, lose track and search, bash through doors, windows and barricades, alert each other,
and get stronger at night. The types are walkers, runners, crawlers, brutes, screamers (who call the horde) and
bloaters (toxic gas). Legs can be shot out, turning a walker into a crawler. Hits stagger or knock them down, and
headshots kill. Deaths use ragdoll physics, with blood sprays, splatter decals, gibs and dismemberment.

**Combat.** Melee weapons (knives, bats, nail bats, crowbars, axes, machetes, sledgehammers, katanas, spears...)
have reach, swing speed, stamina cost, knockback, crits, sweeps and durability. Firearms (9mm/.45 pistols,
revolver, pump/double/sawed-off shotguns, hunting rifle with scope, AR-15/M4, AK-47, .22, MP5, crossbow, bow)
have their own calibers, spread, recoil, fire modes, reload styles (magazine, shell-by-shell, break-action, bolt),
noise, jamming and wear. Suppressors exist, and so do throwables: molotovs, pipe bombs, grenades, flares, noise
makers and bottles.

**Looting and crafting.** Hundreds of furnished interiors with containers that each draw from their own loot
table (fridges, medicine cabinets, gun cabinets, lockers, armories...). You can also search vehicles' trunks and
gloveboxes, zombie and survivor corpses, and the floor. Locked rooms open with keys, a crowbar, lockpicks or
brute force. You can barricade doors and windows, light campfires, cook, boil water and craft medical supplies,
weapons, explosives and tools.

**World.** A procedurally generated county with downtown, residential streets, a trailer park, the hospital,
police and fire stations, a school, stores, gas stations, a motel, an industrial area, farms, forests, a river and
lake, the I-65 interstate jam, a military checkpoint and a FEMA camp, campgrounds, hidden survivor camps and a
helicopter crash. Notes, diaries and radio broadcasts tell the story. Events include helicopter flyovers that drag
hordes behind them, supply airdrops, migrating hordes and car alarms.

**Atmosphere.** A 24-minute day/night cycle with a moon, stars and blocky clouds. Weather moves through clear,
cloudy, fog, rain and thunderstorms. Rendering uses smooth voxel lighting with ambient occlusion, real-time sun and
moon shadows, the flashlight cone, fog, wet surfaces, swaying foliage, film grain and colour grading. All audio is
procedural, including 3D sound and generative piano music.

See `docs/ARCHITECTURE.md` for the code layout.
