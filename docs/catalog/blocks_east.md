# Catalog: `blocks_east` — Blocks B, E, C and the eastern driveways

Package `src/content/blocks_east/` (order **36**, a district LAYOUT package). It composes the
Phase A packages (residential, public, street, nature, vehicles, life, phone) into the eastern
half of микрорайон «Восточный»: Block B (x 308–456, z 144–322), Block E (x 308–456, z 328–500),
Block C (x 462–600, z 144–322), the eastern N–S driveway (x 456–462, z 144–524) and the E–W
driveway «3-й Молодёжный проезд» (z 322–328, x 308–598). Everything is placed in `build()`;
there is no `init()`/`update()` (the runtime belongs to the Phase A packages).

Still gated as work-in-progress in `src/content/index.js` (`WIP` set): load it with `?wip=1` or
name it in `?only=…`.

```
            ул. Заводская (north pkg) ───────────────────────────────────────────────────────
z 144  ┌────────────── BLOCK B ──────────────┬──┬──────────────── BLOCK C ─────────────────┐
       │ 1-515 «Заводская 5» (5 sect., x 317–449.5)│N │ ГСК «Мотор-14» brick garages (34 boxes)  │
       │ inner driveway z 173–178 + parking bays   │– │ garage lane z 158.5–165 (dead end)        │
       │ P-44T 17 fl. (2 sect.)   P-44 16 fl.      │S │ P-44 9 fl. «Заводская 9», 5 sections ─┐   │
       │ x 316–330, z 194–246     x 436–449        │  │ inner driveway z 198–203 (dead end)   │2  │
       │      hockey box x 360–400, z 212–232      │d │ playground   construction site        │sect│
       │      kindergarten № 1543 x 357.5–422.5    │r │ x 500–512    (fence x 522–574,        │L  │
       │      z 260.75–313.25; rakushki x 309–314  │i │              pit x 531–565, y −1.5)   │   │
       │                                           │v │ brick II-32 «Молодёжный 5» x 486–572  │   │
z 322  ├──────── E–W driveway «3-й Молодёжный проезд» z 322–328 (x 308–598) ─────────────────┤
       │ BLOCK E: 3 × P-44T 17 fl. (x 317–343, 369–395, 421–447; facades z 352)│  (Block F,    │
       │ inner driveway z 357–362, parallel parking z 362–364.5                │  blocks_west) │
       │ the vast yard: playground x 342–358 z 414–436, snow hill (356, 462),  │               │
       │ spine path x 381 → metro, shop «ПРОДУКТЫ» x 420–430 z 463–477 (door   │               │
       │ west), its parking lot x 434–456 z 444–500, substation (327, 486)     │               │
z 500  └──────────── avenue tree strip (avenue pkg) ─────────────────────────────────────────┘
```

## Landmarks (world x, z)

| what | where | notes |
|---|---|---|
| Three 17-storey P-44T towers «3-й Молодёжный пр. 8/1–3» | x 317–343, 369–395, 421–447; z 338–352 | 51 m; the main landmark of the east half, seen from the avenue, Block D and the park side |
| P-44T 17 fl. «Молодёжный 3/1» (2 sections) | x 316–330, z 194–246 (entrances face east) | Block B west tower |
| P-44 16 fl. «Молодёжный 3/2» | x 436–449, z 210.5–236 (entrance faces west) | Block B east tower, two blue spruces at its door |
| 1-515 9 fl. «ул. Заводская 5», 5 sections | x 317–449.5, z 156–168 (entrances face south) | Block B's north wall along ул. Заводская |
| **The long building** P-44 9 fl. «ул. Заводская 9», 7 sections in an L | E–W wing x 466.5–594, z 180–193 (entrances 1–5 face south); east wing x 585–598, z 197–248 (entrances 6–7 face west) | "repetition": 127 m of identical sections fading into fog, then the corner; a 2.5 m gap between the wings (x 585–594, z 194.5–197) is a passage from the garage lane |
| Lone flickering lamp | (582.4, 200.5) | sodium courtyard lamp, `flicker: 'dying'`, tear-off flyers on its pole, at the dead end of Block C's inner driveway under the corner of the long building, where the gap passage opens |
| Abandoned construction site («долгострой») | fence x 522–574, z 214–268; pit x 531–565, z 223–259, floor y −1.5 | green corrugated fence, gate open on the west side (z 238–243.5), passport board «Окончание работ: IV кв. 2007 г.», strip foundation with rebar, ФБС blocks, rings, a site trailer, weeds, two ash-leaved maples, crows, a birch with a bag |
| ГСК «Мотор-14» brick garages | x 475.75–586.25, z 151.75–158.25 (doors face south) | one garage open with a bulb and a Lada (public package) |
| Kindergarten № 1543 | site x 357.5–422.5, z 260.75–313.25; gate (390, 260.75) facing north | public package: building, verandas, play equipment, fence |
| Hockey box | rink x 360–400, z 212–232 (gate on the south side, x 380) | two floodlights lit dusk–22:30 |
| Shop «ПРОДУКТЫ 24 ЧАСА» | footprint x 420–430, z 463–477; **door (420, 474.5) facing west** | ENTERABLE (public `placeShop`, rot 1); warm window spill; **roof letters «ПРОДУКТЫ»** (model `be_roof_sign`, lit red from dusk) on the roof at x 421.75, z 465–474, facing west toward Block D |
| Snow hill (горка) | top (356, 462), ~1.5 m, long and low, ice chute to the south (to z 475) | walkable; a sled at its foot |
| Transformer substation ТП-2208 | (327, 486), doors face east | graffiti «Цой жив», a tear-off notice |
| Brick II-32 5-storey «Молодёжный 5» | x 486–572, z 290–301 (entrances face north) | apple trees behind it |

## Enterable doors

| door | world | how |
|---|---|---|
| Tower «Молодёжный 8/2», подъезд 1 (P-44T 17 fl.) | door (381, 352) facing south; porch to z 354.5 | residential `enterable: [0]`, stairwell + **working lift** to the 17th floor; `homeLight` (one stair bulb always works) |
| Shop «ПРОДУКТЫ 24 ЧАСА» | door (420, 474.5) facing west; porch x 418.5–420 | public `placeShop`; buy bread inside (`game.state.boughtBread`) |
| Open garage of ГСК «Мотор-14» | seeded box of the row (x 475.75–586.25, z 155) | public `placeGarageRow`, zone `garage` |

All other entrances are locked (intercom rings, nobody answers). Entrance positions (door centre,
porch level): Block B 1-515 doors x 435.25 / 408.75 / 382.25 / 355.75 / 329.25 at z 168 (south);
B tower 1 (330, 208) and (330, 234) (east); B tower 2 (436, 222.25) (west); E towers (329, 352),
(381, 352), (433, 352) (south); the long building is numbered round the corner: подъезды 1–2 on
the east wing at (585, 234.25) and (585, 208.75) (west), 3–7 on the main wing at x 580.25 /
554.75 / 529.25 / 503.75 / 478.25, z 193 (south); 5-storey x 497.75 / 519.25 / 540.75 / 562.25 at
z 290 (north); kindergarten porches x 376.5 / 390 / 403.5 at z 289 (locked).

## Routes (what a player walks)

- **Block D → the shop (the bread errand).** A trodden desire line leaves Block D's east driveway
  sidewalk at (310.5, 438) (blocks_west leaves the matching gap in its windrow, z 432–441) and
  crosses the vast yard diagonally: (346, 451) → (381.25, 462) → (404, 470.5) → the shop door
  (419.4, 474.5). Footprints on its last 34 m. A fainter second line from (310.5, 486). From the
  start the roof letters and the warm window are visible ~110 m away across the yard.
- **The spine** (cleared path, 2.6 m): from tower 8/2's door (381.25, 366.5) south past the
  saplings, benches (mittens, a frozen bag) and four courtyard lamps; it forks at z 486 and meets
  the metro's two footpaths at (377.6, 499.8) and (392.6, 499.8) → the NW / NE underpass stairs.
  Its nav lines continue (nothing painted) round the outside of the stair pits to the avenue's
  sidewalk line z 513.2 at x 374.6 and 395.6.
- **Tower 8/3 → the shop**: a cleared path (433, 366.5) → (415, 446) → west of the shop bench →
  joins the desire line at (412, 473). Behind the shop a path runs round its south side to the
  parking lot, and a nav line crosses the lot's free lane (x 445) to the N–S driveway at z 470.5.
- **Block C's gap**: garage lane (586.5, 163.6) → along the east gable (596.8, 172–190) → through
  the 2.5 m gap between the wings (593 → 583, z 195.5) → the dead end under the lone lamp.
  (Walk-tested: no snag.)
- **Into the pit**: a kids' trodden way (516, 248) → gate (522.5, 240.7) → the pit rim (530.4,
  240.3) → down stepped earth slopes (one 0.25 m voxel per 0.5 m) to the frozen floor at y −1.5.
- Sidewalks along every facade (y 0.25), the west sidewalk of Block E (x 308–310.5, to the
  avenue at z 508; lowered to road level where Block E's inner driveway crosses it, z 357–362),
  and the driveways themselves. All nav lines end on another line (checked in-page: the only loose
  ends are the dead ends meant as such — the playground gate, the pit, the driveway dead ends — and
  the north end at z 144.5, which meets ул. Заводская's sidewalk once `north` is loaded).
- Walk-tested with `tools/walk.mjs` (scenarios in the report): Block D sidewalk → desire line →
  shop door → inside («Купить хлеб» works) → out → spine → tower 8/2's door → stairwell → lift
  call; the garage lane → gap → east-wing sidewalk; the full N–S and E–W driveways and every
  sidewalk of the N–S / E–W edges.

## Driveways and parking

- N–S driveway x 456–462 (y 0, z 144–524) with a sidewalk on its west side (x 453.5–456), plough
  windrows on both edges (gaps at every mouth and crossing), cars parked along its **east** kerb
  (x ≈ 461, facing south). Cobra lamps on concrete poles at the back edge of the west sidewalk
  every 34 m (x 453.2, z 160–420, then x 454.9 at the shop lot's kerb, z 454 and 488; the one at
  z 352 is dead), heads over the asphalt.
- E–W driveway z 322–328 (x 308–598) with sidewalks on the north side (and the south side along
  Block E), cars along the **south** kerb (z ≈ 326.95, facing west; x 332–382 and 501–540 — Block
  F's own driveway leaves at x 489.5–494.5 and is kept clear), courtyard lamps at the back edge
  of the north sidewalk (z 319.2) at x 323, 357, 391, 425, 494 (dead), 528, 562.
- Inner driveways (y 0): Block B z 173–178 (+ perpendicular bays z 178–183.5), Block E z 357–362
  (+ parallel parking z 362–364.5), Block C z 198–203 x 462–576 (dead end, plough pile at
  (578.6, 200.6)), Block C garage lane z 158.5–165 (dead end).
- Shop parking lot x 434–456, z 444–500 with a **warm idling VAZ-2107** at (437.6, 470.6) (fogged
  windows, someone ran in for bread), snowed-in rows, mouth from the driveway at z 466–475.
- `ctx.registry.driveways` (for the vehicles package's courtyard crawler) — the free lanes:
  N–S at x 458.3 (two routes, z 150–320 and 330–512), E–W at z 324.4 (x 312–590), Block B inner
  z 175.5, Block E inner z 359.5, Block C inner z 200.5 (to x 574), garage lane z 161.5, and the
  shop lot route (458.3, 470) → (445, 470) → (445, 497). No parked car stands on these lines.

## Lights (outdoor, region)

About 46–48 outdoor lights in the region at night: 10 cobra lamps on the N–S driveway, 7
courtyard lamps on the E–W driveway, 10 courtyard lamps in the yards (Block B: parking, kindergarten
gate, a dead one in the west yard; Block E: four along the spine incl. the fork, the playground
lamp; Block C: one mercury lamp, the playground lamp, the lone flickering lamp), ~13 entrance
bulbs that work (residential), the shop's spill lights and porch bulb, the hockey floodlights, the
open garage bulb. Indoor: the enterable stairwell (~24 bulbs + lift) and the shop tubes. Dark gaps
are deliberate: the west half of Block E's yard, the snow hill, the construction pit, Block B's
west yard and the strip behind the 5-storey stay unlit.

## Zones

| name | box | reverb / settings |
|---|---|---|
| `yard_B` | x 331–453, z 176–319 | courtyard, wind 0.85, traffic 0.55 |
| `yard_E` | x 310–456, z 352–500 | courtyard, wind 1 (the vast windy yard), traffic 0.7 |
| `yard_C` | x 462–598, z 193–290 | courtyard, wind 0.8, traffic 0.5 |
| `garage_lane_C` | x 466–594, z 150–166 | courtyard, wind 0.7 |
| `construction_pit` | pit interior, y −3…0.3 | courtyard, wind 0.35, traffic 0.3 (it goes quiet down there), priority 1 |

Public/residential add their own zones (shop, stairwell_*, lift_*, garage).

## Story props and texts (what a curious player finds)

- Mittens on the spine bench (378.4, 437.5); a frozen carrier bag on the bench at (378.4, 398.5).
- A loaf in a carrier bag on the bench by the shop (414.5, 465.2) — someone else went for bread.
- A payphone «ТАКСОФОН» on the shop forecourt (416.2, 461.4) facing west (dial tone, «Абонент
  недоступен»), a blue «ПОЧТА» box on the shop's north wall (421.3, 463).
- The warm car in the shop lot (437.6, 470.6).
- A sled at the foot of the snow hill (358.4, 474.6); footprints up its back.
- At entrances: a sled (B tower 1), butts (1-515 entr. 3, tower 8/3, long building подъезд 6), a cat
  in the vent with the «Не закрывайте продухи» note (1-515 entr. 5), a cat and a chained bicycle
  (5-storey), a dropped key fob with an intercom «таблетка» outside the enterable tower 8/2.
- «Пропала собака» with one tear-off tab left on the long building (подъезд 5).
- Notice clusters (2–3 notices, sometimes flyers) beside every entrance door; benches (75 %) and
  lilac/snowberry (45 %) at entrances.
- Notice boards at (376.8, 368.4) (with the lost-dog flyer) and (371.5, 186.6); a carpet rack in
  Block B's west yard (338, 279).
- Posters, tear-off flyers and graffiti on the shop's north end wall; graffiti on four garage
  doors, the substation («Цой жив») and the site fence («Кони», a tag); a tear-off notice on the
  site fence; the site passport board (readable) at (519.4, 230.5); a glove on a lone post by the
  site gate (521, 236.6).
- Snowman in the kindergarten yard (397.5, 268.5); thrown-out New Year trees at the garbage areas
  of Blocks E and C; a yolka buried in the plough pile at the E–W driveway's east end.
- Steaming manholes on the heating main across Block E (340.5, 408.1), (425, 401), (459, 397.6)
  over a thawed strip of dirty snow and earth.

## Exported helpers — `src/content/blocks_east/api.js`

```js
import { EAST, eastLandmarks, isEastArea } from '../blocks_east/api.js'
EAST.BUILDINGS.et2         // placeResidential opts of the enterable tower
EAST.SHOP_DOOR             // [420, 474.5]
EAST.DRIVE.ns              // { x0: 456, x1: 462, z0: 144, z1: 524 }
eastLandmarks()            // [{ name, x, z, height? }, …]
isEastArea(470, 250)       // true (Block C)
```
`EAST = { REGION, DRIVE, BUILDINGS, PUBLIC, SHOP_DOOR, SITE, HILL, LONE_LAMP }` (frozen, world metres).

## Registry keys set

- `registry.blocksEast = { shop: { x, z, door, record }, enterable: [entrance records], buildings:
  { key: { bounds, address, entrances } }, landmarks }`.
- `registry.landmarks` += Block E towers (382, 345, h 51), Block B tower (323, 220, h 51), the shop.
- `registry.driveways` += the 8 routes above. `registry.manholes` += the three heating-main manholes.
- Through the Phase A helpers: `entrances`, `buildings`, `stairwells`, `shops`, `kindergartens`,
  `hockeyBoxes`, `garageRows`, `substations`, `streetLamps`, `benches`, `playgrounds`, `garages`,
  `garbage`, `steamVents`, `trees`, `crows`, `parkedCars`, `story`, `notices`.
- `ctx.navPaths`: sidewalks (`sidewalk`), courtyard paths (`path`), desire lines (`trodden`),
  driveways (`driveway`) — all connected to each other and to the residential/public entrance stubs.

## Models defined here (`props.js`)

All carry snow on their tops; pivot = bottom centre of the footprint unless noted.

| model | size (m) | notes |
|---|---|---|
| `be_fbs` | 2.5 × 1.0 × 0.75 | ФБС foundation block with lifting loops (long axis local X) |
| `be_fbs_pile` | 3.0 × 1.5 × 2.5 | a dumped crosswise heap of ФБС blocks |
| `be_foundation` | 6.0 × 2.75 × 1.0 | strip-foundation section with rusty rebar sticking up |
| `be_bytovka` | 6.0 × 3.0 × 2.5 | site trailer, corrugated blue walls, door + cracked window on local −Z; pivot centre |
| `be_rings` | 3.5 × 2.0 × 1.75 | two concrete well rings on their sides |
| `be_passport` | 2.75 × 2.75 × 0.5 | object passport board on two posts (text = a sign added by the layout); board front −Z |
| `be_post` | 0.25 × 1.25 × 0.25 | lone rusty post (the glove sits on it) |
| `be_roof_sign` | 9.0 × 2.5 × 0.5 | angle-iron roof frame for shop letters; letters plane = local −Z row (a sign quad 0.27 m in front of the pivot), placed with `rot: 1` on the shop roof (y 4.0) |

## Notes for the integrator / neighbours

- **blocks_west**: the trodden line to the shop starts at (310.5, 438), opposite their Block D
  windrow gap at z 432–441. Block F's internal driveway mouth (x 489.5–494.5 on the E–W driveway)
  is kept free of cars and windrow. I paint nothing at x < 308 or in Block F.
- **avenue**: the N–S driveway is painted (y 0) through the tree strip and the north sidewalk to
  the kerb (z 524); the west sidewalk of Block E (x 308–310.5) runs to z 508 and cuts the avenue's
  sidewalk bank there. The spine meets the metro footpaths at z 499.8; nothing else of mine is
  placed south of z 500.
- **north**: the yards begin at z 148 (the 1-515's back balconies reach z 154.5, the garages
  z 151.75), so z 144–148 is free for the heating main the PLAN puts at z ≈ 146; it crosses the
  N–S driveway (x 456–462) and the sidewalk x 453.5–456, which need an arch/gate there.
- **vehicles**: parked cars keep clear of the registered driveway lines (see above).
- Everything is deterministic; no `Math.random()`; build steps are wrapped in `safe()` so one
  failing part logs `[blocks_east] … failed` and the rest of the district still builds.
- Debug: `?be_debug=1` logs every build step of this package with its duration
  (`[blocks_east] > name` / `< name 12 ms`).
