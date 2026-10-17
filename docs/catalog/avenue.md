# Catalog: `avenue` — проспект Строителей, the south strip and the bus terminal

Package `src/content/avenue/` (order 32, district layout). Region: z 500–600 for every x 0–640
(the avenue, its sidewalks, median, lamps and wires also run through the east/west wrap bands),
except the metro footprint x 374–396, z 504–574 (the metro package's; we only meet its edges).
The package is still listed in the `WIP` set of `src/content/index.js`; load it with `?wip=1` or
name it in `?only=…` until the lead removes it from that set.

```js
import { AVENUE_GEO, AVENUE_STATIONS } from '../avenue/api.js'
// AVENUE_GEO = { Z, LANES_W, LANES_E, PERIOD, STOP_N, STOP_S, ZEBRA, TERM, METRO, NAV_N, NAV_S, WALK_LAMPS }
// AVENUE_STATIONS = [0, 37, 74, …, 629]  (x of every median lamp / trolley span)
```

Files: `layout.js` (every coordinate — read this first), `ground.js` (terrain), `overhead.js`
(median lamps, trolley poles, span and contact wires, sidewalk lamps, terminal wires),
`north.js`, `south.js`, `terminal.js` (+ the one model of the package), `details.js` (notices,
graffiti, story props, crows), `nav.js` (nav paths, zones, registry), `trails.js` (old footprint
trails, added in `init`), `api.js`. Every helper call is wrapped in `safe()` (logs, never throws).

## Cross-section (north → south, world metres; heights: road 0, walks 0.25, lawn snow 0.5)

| z | what |
|---|---|
| 500–508 | tree strip: lawn snow, a loose row of birches / pollarded poplars / lindens at z ≈ 505 with lilac clumps, gaps at the passages and driveways; the bank of cleared walk snow (z 505.4–508.7, ≈0.4 m) along its south edge |
| 508–509 | lawn edge (behind the bank) |
| 509–516.5 | **north walk** (packed snow, slush, ice patches; y 0.25). Nav line z 513.2 |
| 516.5–523 | lawn strip with trolley poles, billboards, short trodden cuts to the kerb; paved where people wait (stop, metro, zebra) |
| 524 | kerb |
| 524–538 | westbound carriageway, lanes z 527.5 (kerb, trolleybus wires above), 531, 534.5; slush ruts; plough windrow on the kerb side (z 524.25–525.9, ≈0.7 m, gaps at the stop, mouths, zebra and every ~100 m) |
| 538–542 | median (y 0.25, kerbs both sides) with a grimy snow ridge (≈0.45 m), double cobra lamps every 37 m |
| 542–556 | eastbound carriageway, lanes 545.5, 549, 552.5 (kerb, wires); windrow z 554.1–555.75 |
| 556 | kerb |
| 557–563 | lawn strip (paved at the south stop, the lay-by, the plaza, the zebra and the terminal mouths) |
| 563–570.5 | **south walk** (y 0.25). Nav line z 566.8 |
| 570.8–573.9 | bank of cleared walk snow (gaps at the paths through the row, the plaza and the terminal) |
| 572–600 | south strip: lawn snow, kiosk plaza, shop, pharmacy, the 9-storey row, the bus terminal |

Everything along the avenue (roads, kerbs, median, walks, windrows, median lamps, trolley poles
and wires) runs from x 0 to 640. Lamp/span stations are every **37 m** from x 0 (592 = 16 × 37)
and seeded with `x mod 592`, so walking into the whiteout at x 616 and reappearing at x 24 shows
the same pattern. The sidewalk lamps are every 74 m (also a divisor of 592).

## Landmarks and places (x, z)

| place | where | notes |
|---|---|---|
| **Spawn** | (248, 515.5), facing north | the player stands on the north walk behind the stop; ahead: trees at z ≈ 505, the bank, Block D's brick 5-storey (blocks_west) |
| **Spawn trolleybus stop** «Улица Берёзовая» | pavilion (248, 520.6), open side south to the road (angle 0) | street `placeBusStop`: kind trolleybus, routes «41», «63» (timetable for 41, from «Ст. м. «Заречная»» to «Мкр. «Восточный»»), lit tube, MegaSvyaz light box, flyers, bench (sit). Bus pole «А 648» at (240.4, 522.4). Registered in `registry.stops` (curb z 522.8) — the vehicles package's opening trolleybus stands here |
| the stop's lamp | cobra (254.6, 509.5), head over the walk | snow falls through its cone in the first view; a steaming manhole (253.4, 511.9) in its pool |
| one discarded ticket | (249.4, 522.35) | life `placeStory('ticket')` (readable ticket note) |
| keys with an intercom fob | (242.7, 511.0) | life story prop, by the payphone |
| payphone | (240.9, 510.05), facing south | street `placePayphone` (dial tone → «Абонент недоступен») |
| ad columns | (264.2, 510.5), (412.6, 510.4), (446.2, 569.0) | readable posters |
| payment terminals «МОМЕНТ-ПЛАТЁЖ» | (366.5, 509.9) north; (436.9, 575.4) plaza | |
| notice board (lost dog, one tab left) | (232.2, 509.7) by the Block D passage | |
| billboards | (166.5, 519.8) «Луч»/credit; (499.5, 519.8) flats/beer (unlit); (301.5, 560.2) «2008 — Год семьи»/ЕвроСвязь | edge-on to the traffic |
| street-name plates | post (148.6, 509.4): «просп. Строителей» (faces south), «ул. Берёзовая» (faces west) | corner of ул. Берёзовая |
| ул. Берёзовая mouth | road x 140–148 (lanes 142.3 / 145.7), east walk 148–151.5, zebra across it at z 510.5–515 | matches blocks_west's street; painted here too so the corner works without it |
| driveway mouths | x 302–308 and 456–462 (y 0, z 500–524), «Жилая зона» signs at (300.9, 509.6), (454.9, 509.6) | blocks paint the rest |
| passages into the courtyards | Block D x 228, Block F x 540: paved mouth x ± 2.5 from the walk to z 506, trodden path to z 499.5 | nav paths end at (x, 500) |
| **zebra** with flashing yellow Т.7 | stripes x 509.5–514.5 across both carriageways, flat gap in the median ridge; lights (516.3, 523.3) facing east and (507.7, 556.7) facing west, `flashFrom: 0` (always flashing yellow), 5.19 signs | the only surface crossing; nav `crossing` at x 512 |
| metro «Заречная» | footprint x 374–396, z 504–574 (metro package) | walks detour between the pits and the kerb (nav z 521.4 / 558.6); a trampled apron x 371–396, z 572–578 in front of the south stairs |
| south bus stop «Улица Берёзовая» | pavilion (266, 559.4), open side north (angle π), unlit | kind bus, routes «648», «613»; its own ticket; a frozen carrier bag on the bench |
| taxi lay-by (карман) | x 337–359, z 556–559.5 (y 0) | three gypsy cabs: black Volga (light snow), cherry «семёрка» **warm** (idling, fogged), wet-asphalt 21099 (brushed) |
| «Остановка запрещена» sign | (373.2, 556.6) | |
| **kiosk row** | z 576.4 (fronts north at z 575), x 401.6 «ТАБАК», 408.8 «ПЕЧАТЬ», 416.2 «ЦВЕТЫ 24», 423.4 closed («ОВОЩИ • ФРУКТЫ», shutter, СДАЁТСЯ), 430.8 «ШАУРМА» | public `placeKiosk`, y 0.25; coffee machine (439.6, 575.5), terminal (436.9, 575.4) |
| **«ПРОДУКТЫ 24 ЧАСА»** (enterable) | public `placeShop` centred (460, 580), rot 0 (front north); door/entrance point (455.5, 574.25) | second enterable shop of the city (bread, cashier); zone `shop` |
| **«АПТЕКА»** (enterable 8–22) | public `placePharmacy` centred (476.8, 577.6), rot 0 | green cross over the door |
| mailbox | (485.2, 571.4) | |
| garbage enclosure + rakushki | brick enclosure (412.5, 595.2) facing north; rakushka row x 425.5–442, z 592.6 | yard behind the kiosks (a trodden path from the plaza at (396.8, 578)) |
| **9-storey row** (backs to the avenue, entrances face south) | body z 582–594, porches to 596.5: д. 27 II-49 ×4 x 44–152; д. 29 1-515 ×4 x 174–280; д. 31 II-49 ×2 x 308–362 | residential `placeResidential` rot 2, address «просп. Строителей, д. 27/29/31»; benches by ~2/3 of the porches; notices on every entrance; nothing enterable |
| gable advert | faded «МегаЛинк» painted on the east gable of д. 31, (362.06, 13.5, 588) facing east | seen from the underpass's south exit |
| **bus terminal** «Ст. м. «Заречная»» (конечная) | loop x 534–596, z 566–600 (see below) | the end of bus 648 and trolleybus 41 |

## Bus terminal (конечная)

- Loop centreline in driving order `TERM.loop`: (538, 566) → (538, 589) → (544, 596) → (586, 596)
  → (592, 589) → (592, 566). Entry mouth from the eastbound kerb lane (530.5, 554.6) → (535,
  559.25) → (538, 566); exit (592, 566) → (596, 559.25) → (600.5, 554.6). Width 7.5 m, y 0.
- `ctx.registry.busTerminal = { loop, stops: [[538, 583.5]], exit: 'east', name }` — the vehicles
  package diverts ~65 % of eastbound buses round the loop; they lay over 25–55 s at the stand
  (538, 583.5) by the platform and rejoin eastbound.
- Boarding platform x 528–534.25, z 572–595 (y 0.25) with a lit pavilion
  (530.6, 586.5) facing east (routes 648, 276; old «Дискотека 80-х» light box), a park bench, a bin.
- Island x 541.75–583.5, z 572–587.5 (kerbed, deep snow): dispatcher's hut (public
  `placeDispatcherBooth`, (545.9, 580.5), rot 1, window toward the stand, «Постучать в окно»),
  a blue portable toilet `avenue_toilet` (545.4, 586.0) with a marker scrawl, birches, an unused bench.
- Parked LiAZ «В ПАРК» (586, 579.5) heading north in its bay; parked ZiU trolleybus «ПОСАДКИ НЕТ»
  (566, 590.25) heading east under its own wire pair; the driver smoking by the LiAZ's nose
  (life `placePerson`, (586.8, 572.4)).
- Trolley wires: a pair from the eastbound line round the whole loop and back out, a branch over
  the trolleybus bay, seven support poles outside the loop with span arms.
- Lamps: cobras (528.6, 581.5) over the platform and (597.4, 583.0) (end-of-life `cycle`), a
  mercury courtyard lamp (571.5, 586.9). Plough piles at (580.5, 574.8), (548.5, 589.8) (a tyre
  sticks out) and (525.5, 597.5) (a New-Year tree).

## Overhead line and lamps

- **Median**: `street_lamp_cobra_double` (street `placeStreetLamp` type `cobra_double`) at every
  station x = 37·k, z 540, y 0.25 (two sodium spots each); the one at x 444 is an end-of-life
  `cycle` lamp (and its wrapped twin).
- **Trolley poles** `street_trolley_pole` at every station, z 523.2 (north) and 556.8 (south),
  span-wire eye toward the road; left out at ул. Берёзовая (north, x 148), inside the metro
  footprint and at the terminal mouths (south x 524–548, 586–610).
- **Span wires** at y 7.5 pole → median → pole; droppers to the contact pairs; **contact wires**:
  two per direction 0.6 m apart at y 5.8 over z 527.5 and 552.5, x 0–640
  (`registry.trolleyWires` gets every contact polyline incl. the terminal loop).
- **Sidewalk lamps** (`WALK_LAMPS`, cobras on concrete poles at the back of the walks, heads over
  the walk): north z 509.45 at x 32.6, 106.6, 180.6, (254.6 = the stop lamp), 328.6, 402.6, 476.6,
  550.6, 624.6; south z 570.25 at x 69.6, 143.6, 217.6 (dead), 291.6, 513.6 (by the zebra).
  Pools of light with dark stretches between them are intended.
- Lights added by the package (incl. the helpers' lights for kiosks, shop, pharmacy, entrance
  bulbs of the row, billboards, terminal): see `registry.avenue.lights` (≈91 total, ≈82 outdoor
  over a 640 × 100 m strip; only the nearest 24 are shaded per pixel).

## Story props and texts

Ticket at the spawn stop; keys by the payphone; frozen bag on the south stop's bench; cigarette
ends by the shawarma kiosk and by the dispatcher's hut; a glove on a lone post at the terminal
platform (541.2, 572.9); a sled, two cats in plinth vents (one with the «Не закрывайте продухи»
note), cigarette ends and a chained bicycle at entrances of the 9-storey row; the warm cab in the
lay-by; crows on the span wire east of the stop (x 259) and in the birch behind the kiosks
(404, 586.5). Notices (`addNoticeCluster`, 2–4 each, incl. heating, snow clearing, lift) beside
every entrance of the row; the «Пропала собака» notice with one tab left on д. 29. Graffiti on
the row's back plinths facing the avenue (Цой жив, Спартак, a tag, a heart), on the backs of two
kiosks, on the toilet. Flyers on three trolley poles near the stop and the metro. Old footprint
trails (`init`): spawn stop → Block D passage, into both passages, through the row, across the
lawn strips, to the terminal round the pharmacy, behind the kiosks.

## Nav paths (`ctx.navPaths`)

- `sidewalk` north z 513.2 and south z 566.8, x 26–614, each stepping round the metro pits
  (z 521.4 / 558.6 for x 373–397).
- `crossing` x 512 from walk to walk over the zebra (the life graph's only north–south link besides
  the blocks; the metro's underpass paths are `underpass`, which life ignores).
- `path` into the passages (x 228, 540 → z 500, where the blocks' courtyard paths start), through the
  row gaps (x 163, 294; and round the east end of д. 31 from the SW metro exit) to a porch path
  along z 598.2 (x 46–362.5) that every entrance stub of the row crosses; from the plaza round the
  pharmacy to the terminal platform; `sidewalk` along the platform (x 532.9).
- The shop, pharmacy and dispatcher push their own `entrance` stubs (public package); the south
  walk passes within 8 m of them.

## Zones

| name | box | settings |
|---|---|---|
| `avenue` | x 0–640, y −1…60, z 500–600 | reverb outdoor, traffic 1, wind 1 |
| `avenue_stop`, `avenue_stop_south`, `terminal_stop` | each pavilion | priority 1, wind 0.55, reverb outdoor |
| `avenue_row_yard` | porch side of each 9-storey (z 594–600) | reverb courtyard, traffic 0.45, wind 0.75 |
| `bus_terminal` | x 524–600, z 572–602 | traffic 0.75 |

(The shop and pharmacy add their own indoor zones; the metro's zones win inside its footprint.)

## Registry

- `registry.avenue = { name, z, lanes, period, spawnStop, southStop, zebra, terminal, shop (entrance [x,z]), lights }`
- `registry.busTerminal` (above), `registry.stops` (3 stops via street), `registry.trolleyWires`,
  `registry.manholes` += (253.4, 511.9), (433.2, 512.6), (471.3, 529.2), (421.4, 566.2) (faint metro
  rumbles), `registry.landmarks` += the spawn stop, the terminal, the shop.
- The helpers register `streetLamps`, `kiosks`, `shops`, `entrances` (row, shop, pharmacy),
  `buildings`, `parkedCars`, `parkedBuses`, `dispatchers`, `story`, `notices`, `trees`, `crows`.

## Models defined here

| model | size (m) | pivot / facing | notes |
|---|---|---|---|
| `avenue_toilet` | 1.25 × 2.75 × 1.25 | bottom centre; door at local +Z | blue plastic биотуалет (`paint`, pass `tint`), white roof, snow cap |

## Sounds

None called directly (the street, public, vehicles, metro and life helpers bring theirs: stop
tube buzz, kiosk radios, shop ambience, the warm cab's idle, the parked LiAZ's diesel…).

## Notes for the integrator and neighbours

- **Seams.** blocks_west/blocks_east own z < 500 (their passage paving reaches z 508 at x 225.5–230.5
  and 537.5–542.5, and their N–S driveways run to the kerb at z 524 across our walk). ул. Берёзовая:
  road x 140–148, east walk 148–151.5 — the same cross-section on both sides of z 508.
- **Metro.** Nothing of ours inside x 374–396, z 504–574; the stair fronts are kept clear (no lamps,
  banks or trees within 3 m). Underpass navigation is the metro's.
- **Traffic.** The lanes are kept clear; buses stop at `registry.stops` curb z (522.8 / 557.2);
  the windrows have gaps at both stops.
- **Wrap.** The avenue band is continuous through x 0–40 and 600–640; the south strip, the row
  and the tree strip end at x ≈ 44 and ≈ 600 (open snow in the bands).
- **Performance.** ≈ 100 trees, ≈ 91 lights (see above), 3 residential buildings (10 sections),
  ~520 draw calls / ~1.5 M triangles at the spawn view with the blocks loaded.
