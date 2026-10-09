# Portal Gun Multiverse

A Fabric mod for **Minecraft 1.21.11**. Craft a Rick-and-Morty style portal gun, dial a dimension, and shoot a swirling green portal to one of **50 hand-designed dimensions**, each with its own terrain, biomes, blocks, sky and creatures (619 blocks, 142 items, 150 creatures).

## Install
1. Install **Fabric Loader** for Minecraft **1.21.11** (https://fabricmc.net/use/installer/).
2. Put **Fabric API** for 1.21.11 (https://modrinth.com/mod/fabric-api) in your `mods` folder.
3. Put `portalgun-1.0.0.jar` in your `mods` folder and launch the Fabric 1.21.11 profile.

## How to play
- **Portal Fluid** (shapeless): glass bottle + ender pearl + slime ball + glowstone dust + lime dye → 2 Portal Fluid.
- **Portal Gun** (shaped):
  ```
   G      G = lime stained glass
  QFR     Q = quartz, F = portal fluid, R = redstone
  IEI     I = iron ingot, E = eye of ender
  ```
- **Use** the gun: fires a green bolt; a portal opens wherever it lands (wall, floor, ceiling or mid-air). Walk in.
- **Sneak + Use**: opens the **Interdimensional Dial** to pick a destination (searchable, ✔ marks visited ones, Random button).
- A **return portal** opens behind you when you arrive. Portals close after 30 seconds.
- Dial **C-137 Home** to go back: the gun remembers where you left each dimension.
- The gun holds 64 charges; carrying Portal Fluid reloads it automatically (16 charges per bottle). Creative mode = infinite.
- Commands (ops): `/portalgun list`, `/portalgun goto <dimension>`, `/portalgun refill`.
- Advancements: visit 1, 10, 25 and all dimensions, plus a hidden one per dimension.

## Dimensions
| Code | Name | What it is | Danger | Creatures |
|---|---|---|---|---|
| W-81 | **Abyssia** | An endless ocean that glows from below | ★★ | Lantern Eel, Bubble Ray, Deep Maw |
| A-11 | **Aerolith** | Meadow islands adrift in an endless sky | ★★ | Sky Whale, Puffbird, Zephyr Wisp |
| Au-79 | **Aurum** | Everything here is gold. Everything. | ★★★★ | Midas Golem, Treasure Mimic, Goldbug |
| A-97 | **Aviary Spires** | Spires above a sea of cloud, where the giant birds nest | ★★★ | Roc, Nestling, Cliff Diver |
| B-1CK | **Brickton** | Snapped together, one stud at a time | ★★ | Brick Golem, Block Dog, Brick Raider |
| 35-C | **Colossia** | A garden so big you are the bug | ★★★ | Titan Snail, Giant Ant, Mega Bee |
| C-137C | **Cronenberg World** | Everything here is alive. Everything here is wrong. | ★★★★ | Cronenberg, Flesh Crawler, Gut Worm |
| S-0DA | **Effervescia** | A fizzy soda sea that tickles your feet | ★ | Cola Eel, Fizzer, Soap Jelly |
| S-55 | **Ember Savanna** | The sun never quite finishes setting | ★★ | Longneck, Dust Lion, Stripe Grazer |
| E-7 | **Eventide** | The blue hour that never ends | ★★ | Shade Stag, Moonfox, Twilight Owl |
| C-500A | **Froopyland** | Frosting hills, gumdrop trees and rivers of chocolate | ★ | Gummy Bear, Lollicorn, Jawbreaker |
| T-1890 | **Gearhaven** | A world that runs on steam and never stops ticking | ★★★ | Brass Automaton, Cogspider, Steam Moth |
| F-12 | **Glacior** | Frozen peaks under a sky that never stops dancing | ★★★ | Frost Yeti, Ice Beetle, Snow Hopper |
| ERR-0R | **The Glitch** | Reality.exe has stopped responding | ★★★★ | Missingno, Pixel Wraith, Corrupted Cow |
| G-100 | **Gloopolis** | Everything here wobbles. Including you. | ★★ | Bounce Slime, Goo Serpent, Blob Grazer |
| L-70 | **Groovy** | Turn on, tune in, float away. | ★★ | Lava Lamp Blob, Groove Jelly, Disco Beetle |
| O-31 | **Harvestfall** | Eternal autumn under the harvest moon | ★★ | Scarecrow, Acorn Squirrel, Crow |
| H-55 | **Hivemind** | You are inside the hive. The hive knows. | ★★★ | Hive Warden, Hive Drone, Wax Grub |
| U-404 | **Inversia** | Meadows hang from a stone sky above the void | ★★★ | Ceiling Crawler, Drop Bat, Root Grazer |
| J-65 | **Jurassica** | Steaming fern jungles where the dinosaurs never left | ★★★★ | Raptor, Brontoback, Pterodon |
| M-27 | **Lotus Delta** | A warm, misty delta of giant lily pads | ★ | Mud Croc, Lily Toad, Dragonfly |
| B-77 | **Lumina** | A jungle that glows in an endless night | ★★★ | Lumi Panther, Glow Frog, Lantern Bug |
| A-23 | **Mesa Rift** | Red-rock canyons under a wide golden sky | ★★ | Rattle Serpent, Rock Lizard, Canyon Condor |
| M-1 | **Microverse** | You are smaller than you have ever been. | ★★★ | Phage, Amoeba, Paramecium |
| E-44 | **Oculus Swamp** | The swamp that stares back | ★★★ | Floating Eye, Bog Lurker, Eyebat |
| P-3 | **Orbitas** | A thousand tiny worlds, one giant sky | ★★★ | Void Ray, Planet Grazer, Comet Imp |
| B-13 | **Ossuary** | A bone desert where giants came to die | ★★★★ | Bone Serpent, Skull Crawler, Vulture |
| T-1K | **Paradisia** | Sun, surf and absolutely no problems | ★ | Coconut Monkey, Beach Crab, Parrotfish |
| P-1US | **Plushland** | Everything is soft. Everything is stitched. | ★ | Plush Bear, Yarn Cat, Button Spider |
| K-22 | **Prismara** | Crystal caverns that glow in every colour | ★★★ | Crystal Crawler, Geode Golem, Shimmer Moth |
| V-9 | **Pyroclast** | Ash falls like snow on a world that never cooled | ★★★★★ | Magma Tripod, Cinder Imp, Ash Crawler |
| R-2 | **Radlands** | Don't drink the water. Don't touch the rocks. Don't stay. | ★★★★ | Glowing Ghoul, Mutant Rat, Sludge Blob |
| M-4 | **Rubra** | Rust, dust and two moons in a hurry | ★★★ | Tripod, Dust Mite, Sand Skimmer |
| J-8 | **Sakura Heights** | Cherry-blossom terraces where it is always spring | ★ | Spirit Fox, Koi, Paper Lantern |
| N-21 | **Saltara** | Blinding salt flats and rose-pink lakes | ★ | Stiltbird, Salt Crab, Brine Shrimp |
| S-9 | **Scrapheap** | Somewhere, everything ever thrown away ends up here | ★★★ | Junk Golem, Scrap Drone, Rust Rat |
| L-1 | **Selene** | Magnificent desolation, low gravity included | ★★ | Moon Hopper, Crater Crab, Lunar Moth |
| V-0 | **Shattered Realm** | The broken pieces of a world, adrift in the void | ★★★★ | Rift Stalker, Shard Wraith, Void Jelly |
| S-2B | **The Sketchbook** | A world still being drawn in pencil | ★★ | Scribble Beast, Doodle Dog, Paper Crane |
| Z-18 | **Snackrealm** | Bread hills, cheese cliffs and fizzy soda springs | ★ | Meatball, Cheese Mouse, Pretzel Snake |
| R-7 | **Spectra** | Rolling hills striped in every colour there is | ★ | Prism Unicorn, Chroma Slime, Rainbow Moth |
| H-13 | **Spectral Vale** | A moor where it is always midnight and never quiet | ★★★★ | Wraith, Bone Hound, Will-o'-Wisp |
| X-13 | **Spinelands** | Everything here has a point | ★★★★ | Thorn Hog, Needle Bird, Spine Crawler |
| D-716 | **Sporewood** | Twilight forests of towering glowcaps | ★★ | Sporeling, Mycelid Stalker, Puffjelly |
| X-01 | **Synthwave** | Neon grids racing toward an endless sunset | ★★ | Neon Panther, Glitch Cube, Pixel Bird |
| Z-88 | **Tempestus** | The storm never ends here | ★★★★ | Storm Elemental, Thunderbird, Static Slug |
| T-77 | **Thermalia** | Hot springs, steam and a sky-high spa day | ★★ | Geyser Serpent, Steam Turtle, Sulfur Toad |
| U-0 | **Umbra** | Where light goes to be eaten | ★★★★★ | Shade, Umbral Hound, Glimmer |
| G-55 | **Vitrea** | Glass dunes burning under twin suns | ★★★ | Sand Worm, Glass Scorpion, Dune Strider |
| W-0 | **The White Room** | Nothing here. Nothing at all. Probably. | ★★★ | Silhouette, Static, Faceless |

## Building from source
Requires Java 21. `cd tools && python3 generate.py` regenerates all assets/data from the specs in
`tools/gen/content/dims/`, then `./gradlew build` produces `build/libs/portalgun-1.0.0.jar`.
