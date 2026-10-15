# Chinatown — build spec

A DOOM-graphics, DOOM-gameplay rebuild of No More Room in Hell's objective map
`nmo_chinatown`, shipped as `assets/wads/chinatown.wad` (map `CHINATWN`) plus
engine support under `src/game/ct/`. Single player. Everything here is a
contract between the parallel builders: names, numbers and behaviour must
match exactly. Anything not covered is the builder's call; extra content is
fine as long as these names keep their meaning.

Reference data (NMRiH files and derived data, reference only — never ship
or commit them) lives in the scratchpad:
`/tmp/claude-0/-home-user-code/2139ba89-9871-5bc9-a1b9-3df0ca0d94e2/scratchpad/`
- `out/` — `nav.json` (walkable rectangles with z), `polys.pkl` (all BSP
  faces), `brushes.json`, `entities.json`/`keyents.txt`, `static_props.json`,
  `spawners.txt`, `chinatown_keypoints.json`, top-down renders (`G_overview_route.png`,
  `zones.png`, per-area close-ups).
- `ct/layout.txt`, `ct/critique.md`, `ct/map.json`, `ct/gameplay.json`,
  `ct/engine.md`, `ct/assets.json` — research write-ups.
- `assets/` (also linked as `build/ct/cache/`) — downloaded CC0/free assets.
- `bpyvenv/bin/python` — Python with Blender as a module (`bpy` 5.2.2,
  Cycles works; EEVEE/Workbench need the EGL libs in `egl/root`, see
  `ct/assets.json` → rendering_tools).

## 1. Pipeline and layout

```
tools/ct/
  SPEC.md            this file
  lib/doomgfx.py     palette, quantize, picture/flat/DMX encoders, write_lump()
  lib/bsp.mjs        vanilla node builder (buildNodes, encodeNodeLumps)
  lib/validate.mjs   validates a map WAD with the engine's own loader
  pack.mjs           build/ct/lumps/* -> assets/wads/chinatown.wad
  textures.py        walls + flats + sky       -> lumps/patches, flats, data/TEXTURES.json
  render_zombies.py  zombie sprites (bpy)      -> lumps/sprites
  render_props.py    vehicles/props/items/heli -> lumps/sprites, lumps/graphics
  audio.py           sounds + music            -> lumps/sounds, lumps/music
  build-map.mjs      the map (+ layout data in tools/ct/layout/) -> lumps/map
build/ct/            (gitignored) lumps/, cache/ (assets), previews/
assets/wads/chinatown.wad   committed output
```

Each script is rerunnable and idempotent, downloads nothing it already has
(cache dir `build/ct/cache`, override with `CT_CACHE`), records source URL
and licence of everything it uses in `tools/ct/CREDITS.md` (append your own
section; keep others' sections). Previews for eyeballing go to
`build/ct/previews/<script>/`.

`npm run ct:build` (add later) = all scripts then `pack.mjs`.

## 2. Units and coordinates

Scale **1.0**: one Source/Hammer unit = one DOOM map unit. NMRiH's +x east,
+y north matches DOOM, so reference coordinates map directly. Heights:
DOOM player is 56 tall (eye 41), step 24, engine jump about 36.

Stacked areas can't exist in a DOOM map. The **subway complex** (platform,
corridors, mezzanine, cross hall, ticket hall, exit stairs) and the **sewer
loop** (entry chamber, tunnels, medkit room, exit room) are moved to their
own XY regions and joined to the streets with seamless portals (special
900). Recommended offsets: subway `x - 5000`, sewers `x + 6000`; keep their
real y and z. Everything else stays at its real coordinates (street level
z 0). All vertex coordinates must fit int16.

## 3. Names

Textures `CT*`, flats `CF*`, sprites as below. **Textures whose name starts
`CTN` and flats starting `CFN` render fullbright** (neon, lit signs, light
panels). The sky is the texture `CTSKY1` with the IWAD flat `F_SKY1` on
sky ceilings.

### 3.1 Wall textures (name, size, use)

| name | size | use |
|---|---|---|
| CTBRK1 | 128x128 | red brick |
| CTBRK2 | 128x128 | dark/grey brick |
| CTAPT1 | 128x128 | apartment facade: brick with dark windows (upper floors) |
| CTAPT2 | 128x128 | stucco facade with windows + fire escape feel |
| CTSTUC1 | 128x128 | cream stucco |
| CTSTUC2 | 128x128 | teal/green stucco |
| CTPLAS1 | 128x128 | grimy interior plaster |
| CTCONC1 | 128x128 | concrete wall |
| CTCONC2 | 128x128 | stained concrete |
| CTSTEP1 | 64x32 | step/curb riser (concrete) |
| CTTRIM1 | 128x32 | cornice / roof trim band |
| CTTILE1 | 128x128 | subway white wall tile |
| CTTILE2 | 128x128 | subway tile with colour band |
| CTTILE3 | 128x128 | green/cream tile (ticket hall, laundromat) |
| CTSHUT1 | 128x128 | metal roll-up shutter |
| CTSHUT2 | 128x128 | roll-up shutter with graffiti |
| CTSHOP1..CTSHOP6 | 128x128 | storefronts (window, door, sign band with Chinese characters): restaurant, grocery, herbal medicine, bakery, jewellery, electronics |
| CTDOOR1 | 64x128 | red wooden door |
| CTDOOR2 | 64x128 | grey metal door |
| CTDOOR3 | 128x128 | glass double shop door |
| CTGRGE1 | 128x128 | garage roll-up door (also the arch gate) |
| CTELEV1 | 128x128 | freight-elevator sliding door |
| CTFENC1 | 128x128 | chain-link fence (MASKED, transparent holes) |
| CTGATE1 | 128x128 | chain-link double gate with chain + padlock (MASKED) |
| CTGATE2 | 128x128 | chain-link double gate, chain cut / open look (MASKED) |
| CTGATE3 | 128x128 | sliding metal bar gate (MASKED) — the weld gate |
| CTBORD1 | 64x128 | planks nailed over a doorway (MASKED) |
| CTBORD2 | 128x128 | heavy plank barricade (MASKED) — sewer plank |
| CTBORD3 | 64x128 | broken planks remnants (MASKED, mostly transparent) |
| CTGLAS1 | 64x128 | intact window glass (MASKED: mostly transparent with reflections/edge) |
| CTGLAS2 | 64x128 | broken glass shards (MASKED) |
| CTRAIL1 | 64x32 | railing (MASKED) |
| CTSEWR1 | 128x128 | sewer brick |
| CTSEWR2 | 128x128 | sewer concrete with pipes |
| CTSEWR3 | 64x64 | sewer outflow grate |
| CTWOOD1 | 128x128 | plywood (roadblock wall) |
| CTSCAF1 | 128x128 | scaffold frame (MASKED) |
| CTMETL1 | 128x128 | corrugated steel (warehouse) |
| CTMETL2 | 128x128 | rusty metal panel |
| CTCONT1 / CTCONT2 / CTCONT3 | 128x128 | shipping container red / blue / green |
| CTWARE1 | 128x128 | painted concrete block (warehouse interior) |
| CTPILR1 | 64x128 | red lacquered pillar (paifang, gates) |
| CTROOF1 | 128x64 | green glazed Chinese roof tiles (paifang roof, eaves) |
| CTNPAI1 | 128x64 | paifang name board: gold characters on red (fullbright) |
| CTLADR1 | 64x128 | ladder on concrete wall |
| CTLADR2 | 64x128 | ladder on plywood (roadblock) |
| CTLADR3 | 64x128 | plywood with the ladder raised out of reach (roadblock before release) |
| CTBUT1 / CTBUT2 | 64x64 | wall button off / lit (script swaps them) |
| CTGEN1 | 64x64 | generator control panel |
| CTSOCK1 / CTSOCK2 | 64x64 | wall power socket empty / plugged |
| CTRADI1 / CTRADI2 | 64x64 | radio console off / powered |
| CTPADL1 / CTPADL2 | 64x64 | gate padlock / cut |
| CTCRNK1 | 64x64 | crank wheel on a post |
| CTNSG1 | 32x128 | vertical neon sign, Chinese characters (red/gold) |
| CTNSG2 | 128x32 | horizontal neon sign, Chinese characters |
| CTNSG3 | 128x32 | "GUN SHOP" |
| CTNSG4 | 128x32 | "MARKET" (+ characters) |
| CTNSG5 | 128x32 | "SUBWAY" |
| CTNSG6 | 128x32 | "AUTO REPAIR" |
| CTNSG7 | 64x128 | "MOTEL" pole sign |
| CTNSG8 | 128x32 | "LAUNDROMAT" |
| CTNSG9 | 64x64 | pharmacy cross / "DRUGS" |
| CTDARK1 | 64x64 | near-black (hidden upper walls) |
| CTSKY1 | 1024x128 | night city skyline sky (8 patches of 128x128) |

### 3.2 Flats (64x64)

| name | use |
|---|---|
| CFASPH1 | asphalt road |
| CFASPH2 | asphalt with a dashed lane line through the middle |
| CFASPH3 | crosswalk stripes |
| CFSIDE1 | sidewalk slabs |
| CFCONC1 / CFCONC2 | concrete / stained concrete |
| CFTILE1 | subway floor tiles |
| CFTILE2 | black-white checker (kitchen, laundromat) |
| CFTILE3 | small mosaic tile |
| CFWOOD1 | wooden floor |
| CFWOOD2 | pier deck planks |
| CFMETL1 | metal plate |
| CFGRAT1 | metal grate |
| CFROOF1 | tar roof |
| CFCEIL1 | ceiling tiles |
| CFCEIL2 | concrete ceiling |
| CFNLIT1 | ceiling light panel (fullbright) |
| CFPLAT1 | subway platform edge (yellow strip) |
| CFTRAK1 | trackbed with rails |
| CFDIRT1 | dirt |
| CFSEW1..CFSEW3 | sewer water, animated (engine cycles 1-2-3 every 8 tics) |
| CFBAY1..CFBAY3 | dark bay water, animated likewise |

### 3.3 Sprites

Pictures in DOOM sprite format: `leftoffset` = horizontal pixel of the
origin (feet centre), `topoffset` = pixels above the origin. 1 pixel = 1 map
unit. Rotations 1-8 as in DOOM (1 = facing the viewer, then clockwise as
the viewer sees it rotate... i.e. rotation r is seen from angle
`thing.angle + 180° + (r-1)*45°` measured counter-clockwise; see
`src/vox/voxelize.js` views8 comment: viewer looks along `π + r*π/4` in the
thing's frame, x forward, y left). Render all 8 rotations explicitly (no
mirrored pairs). Single-view sprites use rotation `0`.

**Zombies** (adults about 58 px tall, kid about 42 px):

| prefix | what |
|---|---|
| ZCV1..ZCV4 | shambler skins (civilians: e.g. worker, chef, casual, office; at least two male + one female if available) |
| ZRUN | runner (lean, torn clothes, distinct tint) |
| ZKID | kid |

Frames per prefix: `A B C D` walk cycle (8 rot), `E F` attack (E reach,
F strike/bite; 8 rot), `G` pain/hit (8 rot), `H I J K L` death (rotation 0,
L is the final lying pose). Lump names like `ZCV1A1`..`ZCV1A8`, `ZCV1H0`.

**Vehicles and props** (8 rotations unless marked `0`):

| prefix | what |
|---|---|
| VPOL | police car (light bar) |
| VAMB | ambulance |
| VTAX | yellow taxi |
| VVAN | van |
| VPCK | pickup truck |
| VSED | sedan |
| VSUV | SUV |
| VTRK | box truck |
| VFTR | fire truck |
| VGRB | garbage truck |
| VMIL | military truck/humvee (olive) |
| VHEL | helicopter, frames A B (rotor blur alternates), 8 rot |
| PBAR | concrete road barrier |
| PSAW | sawhorse police barricade |
| PCON | traffic cone (0) |
| PGEN | generator trailer |
| PRAD | radio set on a table |
| PWLD | welding cart (decoration) |
| PTRA | trash can (0) |
| PHYD | fire hydrant (0) |
| PPHN | payphone |
| PBEN | bench |
| PLMP | street lamp, tall (0) |
| PLNT | red paper lantern, hanging (0, fullbright-looking colours) |
| PCRT | wooden crate (0) |
| PPAL | pallet stack (0) |

**Objective pickups** (rotation 0): `IGAS` gas can, `IPLG` plug with cable
coil, `ITOR` blowtorch.

**Graphics** (outside sprite markers): `CTIGAS`, `CTIPLG`, `CTITOR` (HUD
icons, about 24x24), `M_EPICT` (menu entry "CHINATOWN" in the style of the
DOOM menu font, red, about 160x16), `CTTITLE` (320x200 title card shown
before the map starts, optional).

### 3.4 Sounds (lump `DS<name>`) and music

Zombies: `ZSGRN1`, `ZSGRN2`, `ZSGRN3` (idle/see groans), `ZSATK` (swing),
`ZSBITE` (bite hit), `ZSPAIN`, `ZSDTH1`, `ZSDTH2`, `ZRSCRM` (runner sight
scream), `ZKSCRM` (kid scream).
World: `GENSTR` (generator start), `GENRUN` (generator running, loopable),
`ROLLGT` (roll-up gate motor), `WELD` (torch hiss, loopable), `CRANK`
(ratchet), `CTRADI` (radio static + voice-like burst; not `RADIO`, which is DOOM II's chat beep), `HELI` (helicopter,
loopable), `GLASBK`, `WOODBK`, `CHAINB`, `SPLASH`, `LADDER`, `PLUGIN`.
8-bit DMX, 11025 Hz (22050 allowed for long ones), peak-normalized.
Music (MIDI): `D_CHINAT` (map music), `D_CTEVAC` (hold-out / extraction).

## 4. Thing types (doomednum)

All things use skill bits 7 (easy/medium/hard) unless noted. Angle is the
facing in degrees as usual, except where it's an id.

| type | what | engine behaviour |
|---|---|---|
| 1 | player start | subway platform, south end, facing north |
| 9000..9003 | shambler skins ZCV1..ZCV4 | monster, see §7 |
| 9004 | runner ZRUN | monster |
| 9005 | kid ZKID | monster |
| 9010 | zombie spawn marker; **angle = group id** (not a direction) | invisible; the director spawns zombies here (§6) |
| 9040 | gas can candidate spot (3 placed in the repair shop) | script keeps one, chosen with `w.rng` |
| 9041 | plug (dock warehouse side room) | pickup, key item |
| 9042 | blowtorch candidate spot (welder garage + boarded medical room) | script keeps one with `w.rng` |
| 9061 | ladder top / landing destination | like a teleport destination (§5) |
| 9062 | helicopter path node; **angle = order** (0,1,2,...) | invisible; heli flies them in order |
| 9100 | VPOL | decoration, NOT solid (the map blocks it with lines) |
| 9101 | VAMB | " |
| 9102 | VTAX | " |
| 9103 | VVAN | " |
| 9104 | VPCK | " |
| 9105 | VSED | " |
| 9106 | VSUV | " |
| 9107 | VTRK | " |
| 9108 | VFTR | " |
| 9109 | VGRB | " |
| 9110 | VMIL | " |
| 9120 | PBAR | solid, radius 24 |
| 9121 | PSAW | solid, radius 20 |
| 9122 | PCON | solid, radius 8 |
| 9123 | PGEN | not solid (map blocks it) |
| 9124 | PRAD | solid, radius 16 |
| 9125 | PWLD | solid, radius 16 |
| 9126 | PTRA | solid, radius 12 |
| 9127 | PHYD | solid, radius 8 |
| 9128 | PPHN | solid, radius 12 |
| 9129 | PBEN | solid, radius 16 |
| 9130 | PLMP | solid, radius 8 |
| 9131 | PLNT | hanging lantern (SPAWNCEILING, not solid) |
| 9132 | PCRT | solid, radius 20 |
| 9133 | PPAL | solid, radius 24 |

Vehicles are large: the map draws an impassable outline (two-sided lines
flagged `ML_BLOCKING`, no textures, same sector on both sides) around each
vehicle's footprint and places the decoration thing at its centre with its
real yaw. Vehicle sprite dimensions follow the real models (a car is about
180x80 units, a bus/truck up to 400x100).

Standard DOOM pickups are used for weapons/ammo/health, placed where NMRiH
has its spawners (gun shop, garages, safe room, medical rooms): pistol
start; shotgun 2001; chaingun 2002 (stands in for the M16); chainsaw 2005
(the "secret 3" storage room east of the safe room); clip 2007; ammo box
2048; shells 2008; shell box 2049; stimpack 2011 (bandages); medikit 2012
(first aid kit); green armour 2018 (police vest, sparingly); backpack 8.

## 5. Line specials (custom, never used by DOOM)

All are `linedef.special` values; `tag` = id as listed in §8.

| special | trigger | meaning |
|---|---|---|
| 900 | walk, repeatable | **Portal.** Two lines with special 900 and the same tag form a seamless seam. Crossing one from its FRONT side to its BACK side moves the thing to the same fractional position along the partner line, just past it on its BACK side; crossing back→front lands on the partner's FRONT side. Position along the line keeps the same fraction from v1 to v2; angle and momentum rotate by the difference between the two lines' directions; z keeps the height above the floor. Both lines are two-sided, drawn with the same orientation relative to travel, with matching floor/ceiling heights on both sides. Players and monsters use it; projectiles don't. Hide seams round corners, at stair tops or in dark corridors, since the view doesn't render through them. |
| 901 | — | reserved |
| 902 | use, repeatable | **Ladder.** Usable only while enabled (the script disables the roadblock ladder until objective 3's switch). Using it plays a climb (about 90 units/s, view bobs, weapon lowered) up to the 9061 thing inside the sector tagged with the line's tag, then puts the player there facing that thing's angle. Draw ladders on one-sided walls with CTLADR1/CTLADR2. |
| 903 | shot or hit | **Breakable.** A two-sided line flagged `ML_BLOCKING` with a masked midtexture (fence gate, planks, glass). Bullets, melee, chainsaw and explosions damage it; HP and material come from the map script's table keyed by tag. When broken: clear `ML_BLOCKING`, set the midtexture to its broken variant (or none), debris particles and a break sound; the script may run more effects. |
| 904 | use, repeatable | **Objective use.** The map script decides what happens (button, generator, socket, radio, padlock, crank). Some are "hold use" (weld, crank). |
| 905 | walk, repeatable | **Objective trigger.** Crossing tells the map script (objective completion, ambush waves). |
| 906 | walk | **Lethal fall.** Crossing into the bay: kills the player (falls into the water). Optional if the bay is fenced. |

Normal DOOM doors (special 1 etc.) are fine for ordinary interior doors.

## 6. Sector specials (custom)

| special | meaning |
|---|---|
| 64 | sewer water: 4 damage every 32 tics (like nukage, radsuit protects), splash sound when entering; message "THE WATER BURNS YOUR SKIN" once |
| 65 | deep water (bay): player dies |
| 66 | extraction zone (pier north end); script checks player presence |

Sector `tag`s for script-driven sectors are in §8.

## 7. Zombies

Speeds are DOOM units per tic (player runs 16.7). Locational damage: head
hits do x3 to zombies (existing locational system, `HIT_ZONES`), so aiming
matters as in NMRiH. Melee only, no infighting.

| type | health | speed | radius/height | melee | notes |
|---|---|---|---|---|---|
| shambler 9000-9003 | 60 | 4 | 16/56 | 4-12, reach 56 | slow, groans |
| runner 9004 | 40 | 13 | 16/56 | 4-12 | sight scream, can catch a walking player |
| kid 9005 | 25 | 11 | 12/40 | 3-9 | high-pitched scream |

Painchance about 80 (shamblers), 120 (runner), 160 (kid). Mass 100. They
use the existing modern AI (pathfinding) and the 3D voxel/ragdoll system
(`VOX_TYPES` humanoid entries for ZCV*/ZRUN/ZKID; vehicles/props as
`rigid` with `ragdoll: false`).

Population: the map places zombies by hand in every zone, roughly where
NMRiH's `func_zombie_spawn` brushes are (about 150-220 in total, density
like NMRiH's cap of 85 alive). The **director** (map script) spawns extra
waves at 9010 markers out of the player's sight at objective events: arch
gate opening, ladder release, sewer exit, crank, and continuously during
the radio hold-out (cap about 40 alive from waves).

## 8. Tags

**Sector tags** (script-driven):

| tag | sector |
|---|---|
| 1 | ticket-hall freight-elevator sliding door (door; ceiling raises) |
| 2 | arch roll-up gate at x=-1016 (door; rises slowly over 20 s) |
| 4 | market switch-room shortcut door `storedoor01` (door) |
| 5 | sewer-exit back room shortcut door `sewer_exit_door1` (door) |
| 6 | weld gate (door whose ceiling the crank drives) |
| 7 | dock warehouse north door `docksdoor1` (door, locked until boards 55 break) |
| 80 | roadblock deck landing (contains the 9061 for ladder 80) |
| 81 | sewer exit back-room landing (9061 for ladder 81) |
| 82 | garage loft landing (optional ladder) |
| 160 | extraction zone at the pier's north end (also special 66) |

**Line tags**:

| special | tag | line |
|---|---|---|
| 903 | 50 | subway platform chained gate (CTGATE1 -> CTGATE2), metal, 50 HP |
| 903 | 51 | pre-sewer board (CTBORD1), wood, 5 HP |
| 903 | 52 | boarded medical/supply room behind the burning car, wood, 50 HP |
| 903 | 53 | laundromat back doorway boards, wood, 85 HP |
| 903 | 54 | sewer plank barricade (CTBORD2), wood, 300 HP |
| 903 | 55 | dock side-room boards (unlock door 7), wood, 25 HP |
| 903 | 56 | laundromat front windows (CTGLAS1 -> CTGLAS2), glass, 45 HP (all windows share the tag) |
| 903 | 57 | dock warehouse glass partition panes, glass, 1 HP |
| 904 | 1 | elevator door button (ticket hall) |
| 904 | 2 | generator panel (needs the gas can) |
| 904 | 3 | arch gate button (after the generator runs) |
| 904 | 4 | ladder-release switch in the market's back switch room |
| 904 | 5 | shortcut door button (inside the switch room) |
| 904 | 6 | sewer-exit shortcut door button (back room) |
| 904 | 7 | weld gate padlock (needs the blowtorch; hold 12 s; progress kept) |
| 904 | 8 | weld gate crank wheel (hold; opens gate 6 while held, closes when released) |
| 904 | 9 | power socket in the dock side room (needs the plug) |
| 904 | 10 | radio on the pier (after the socket) |
| 902 | 80 | roadblock ladder (south face; disabled until switch 4) |
| 902 | 81 | sewer exit ladder (exit room -> back room landing) |
| 902 | 82 | garage loft ladder (optional) |
| 900 | 100 | subway exit stairs <-> Main St west sidewalk |
| 900 | 101 | pre-sewer stairwell <-> sewer entry chamber |
| 900 | 102+ | any other portal seams the map needs |
| 905 | 130 | objective 1 done: reached the street (after portal 100) |
| 905 | 131 | objective 3 done: on the roadblock deck / north side |
| 905 | 132 | objective 4 done: out of the sewers (back room) |
| 905 | 133 | entering the docks (dock road) |
| 905 | 140..159 | ambush triggers (director waves), placed by the map |

## 9. Objective flow (what the map script does)

Objective text is NMRiH's verbatim. Each stage's HUD line shows as
"OBJECTIVE: <text>" and a sound plays on completion.

1. **"Escape the subway!"** Start on the platform with fists, pistol and
   50 bullets. Break the chain (903/50) on the gate at the platform's north
   end; go through the corridor, up the stairs to the mezzanine, cross
   hall, ticket hall; press button 904/1 → door sector 1 opens (6 s), stairs
   up; crossing 905/130 (after portal 100) completes it.
2. **"Find fuel for generator to open the gate!"** The gas can (9040, one of
   three spots in the repair shop / its basement back area) is a key item.
   Use the generator panel 904/2 with it → generator starts (sounds), button
   904/3 lights (CTBUT1 → CTBUT2). Press it → sector 2 rises over 20 s
   (gate motor sound) and a wave spawns; the objective completes when the
   gate is fully open.
3. **"Release the ladder on the roadblock!"** Route: E-W street → Market St →
   north E-W street → sunken loading warehouse → supply rooms → the market's
   back → switch room. Switch 904/4 enables ladder 902/80 (texture CTLADR3 →
   CTLADR2) and spawns a wave; shortcut button 904/5 opens door 4. Climbing
   the ladder onto the deck and crossing 905/131 completes it.
4. **"Find your way through the sewers!"** Pre-sewer room, board 51,
   stairwell down (portal 101) into the sewers (special 64 water), the loop,
   plank 54 shortcut, exit room ladder 902/81 up to the back room; 905/132
   completes it. Button 904/6 opens shortcut door 5.
5. **"Use welder on the gate's lock to open it!"** The blowtorch (9042, one
   of two spots: welder garage — whose doorway the script may seal with a
   50% roll, as in NMRiH — or the boarded medical room behind 903/52) is a
   key item. Hold use on the padlock 904/7 for 12 s total (progress kept,
   HUD bar, weld sound, sparks) → padlock cut (CTPADL1 → CTPADL2). Then hold
   the crank 904/8: the gate (sector 6) opens while held (about 8 s to full)
   and closes slowly when released. Passing through ends the stage (the
   script checks the player is north of the gate line).
6. **"Power up the radio and call for rescue!"** The plug (9041) is in the
   dock warehouse side room (behind glass partition 57 or round its open
   south end). Use the socket 904/9 → radio powered (CTRADI1 → CTRADI2).
   Use the radio 904/10 → "Rescue is coming in 60 seconds. Hang tight!",
   evac music, 60 s countdown with continuous waves. Then the helicopter
   (VHEL) flies the 9062 path and hovers over the pier's north end; a 30 s
   window to stand in the extraction zone (sector 160). Success → finale
   text screen, then the title. Failure (window expires) → the helicopter
   leaves and the player is told rescue is gone (mission failed; restart).

Random rolls (gas can spot, blowtorch spot, welder-garage door) use
`w.rng` so saves and demos stay deterministic. All script state lives on
the World as plain numbers/arrays so savegames persist it.

## 10. HUD

Top-left objective line (DOOM font, small), a progress bar for hold-use
actions, a countdown during the hold-out/extraction, key-item icons
(CTIGAS/CTIPLG/CTITOR) in the status bar's key area while carried. The
automap shows the objective's location as a blinking marker.

## 11. Launching and testing

`?map=CHINATWN` starts it directly; the main menu's NEW GAME → episode list
gets a "Chinatown" entry (M_EPICT). Skill from the usual menu. A debug hook
`window.doom.ct` exposes `goto(stage)` (teleport + set stage state) and
`state()` for tests. `tools/smoke-test.mjs` runs CHINATWN by name in
addition to the IWAD maps, with the save/load lock-step check.
