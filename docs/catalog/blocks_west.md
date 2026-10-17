# Catalog: `blocks_west` — ул. Берёзовая, Block A, Block D (home) and Block F

Package `src/content/blocks_west/` (order 34, district layout). It is still listed in the `WIP`
set of `src/content/index.js`: load it with `?wip=1` or name it in `?only=…` until the lead removes
it from that set.

Region (world metres, x east, z south; heights: road/driveway/parking 0.0, sidewalks and paths
0.25, lawn snow 0.5):

| area | rect | what |
|---|---|---|
| ул. Берёзовая | x 140–151.5, z 132–500 | 2-lane street (road x 140–148, lanes x 142.3 / 145.7), east sidewalk x 148–151.5. The mouth z 500–524 is the avenue's; z 132–146.5 is overwritten by the north package's ул. Заводская (T-junction) |
| Block A | x 150–302, z 144–322 | school № 1048 + two 5-storey K-7s («ул. Берёзовая, д. 8, корп. 1/2») |
| Block D — **home** | x 150–302, z 328–500 | «ул. Берёзовая, д. 12, корп. 1/2/3», корп. 2 подъезд 3 enterable |
| Block F | x 462–600, z 328–500 | the same courtyard plan again: «ул. Берёзовая, д. 14, корп. 1/2/3» |
| western N–S driveway | x 302–308, z 144–500 | (the mouth z 500–524 is the avenue's) |
| E–W driveway (3-й Молодёжный проезд) | z 322–328, x 148–308 | blocks_east owns x 308–600 |

The avenue's tree strip z 500–508 is the avenue package's; the passages of D and F end exactly at
z 500 where its footpaths (x 227.7 and 539.7) continue to the north sidewalk.

```js
import { BLOCK_A, BLOCK_D, BLOCK_F, COURTYARD, HOME, BER, NS, EW, LAMPS, CROSSINGS, buildCourtyard, paintCourtyard } from '../blocks_west/api.js'
```

Files: `index.js` (build order, registry), `streets.js` (Берёзовая and both driveways: ground,
fixtures, windrows, nav), `blockA.js`, `courtyard.js` (the repeated courtyard, used for D and F),
`api.js` (block configs), `util.js` (ground helpers: `paveWalk`, `paintLawn`, `trodden`,
`windrow`, `ensureEntranceLamp`, keep-out bookkeeping). Every part runs inside `safe()` (logs
`[content:blocks_west] … failed`, never throws). The package has no models of its own and no
`update()`; `init()` only lays the old footprint trails on the final terrain.

## Home (registry.home)

`ctx.registry.home = { x: 227.5, z: 350, y: 0.75, angle: 0, entrance, outside: [227.5, 353], address: { street: 'ул. Берёзовая', house: '12', korpus: '2', entrance: 3 }, en, flats }`

- **корп. 2, подъезд 3** door at **(227.5, 350)**, facing south into the courtyard (porch to
  z 352.5). Enterable stairwell with the lift (residential), flats 73–108. Its 1st-floor landing
  bulb always works (`homeLight`), and its entrance bulb is forced on (`ensureEntranceLamp`).
- The bench left of the porch (224.45, 351.25) has red children's mittens on it (street bench
  `mittens: true`); a sled leans on the wall right of the porch (life `sled`).
- Notices beside the door: «heating cut» and «found mitten» notices (phone `addNoticeCluster`).
- **The warm car**: a cherry ВАЗ-2107 with a bare wet hood and fogged windows, idling, at
  (235.6, 363.8) facing north in the parking row right across the driveway from the door
  (vehicles `warm: true`: exhaust, `car_idle`, «Капот» interaction).
- The hero footpath: from the avenue (227.7, 500) through the passage (x 222–234) and straight
  across the yard (hub 227, 459) to the door — trodden, with an old footprint trail along it.

## Block D (x 150–302, z 328–500) — «ул. Берёзовая, д. 12»

| building | series | where | entrances (door x, z → facing) |
|---|---|---|---|
| корп. 2 (north) | II-49, 9 floors, 4 sections | facade z 350, x 188–296 (body z 338–350, back balconies to 336.5) | 1 (281.5, 350), 2 (254.5, 350), **3 (227.5, 350) HOME, enterable**, 4 (200.5, 350) → south |
| корп. 1 (west) | P-44, 9 floors, 4 sections, blue tile | facade x 172, z 364–466 (body x 159–172) | 1 (172, 377.75), 2 (172, 403.25), 3 (172, 428.75), 4 (172, 454.25) → east |
| корп. 3 (south) | II-32 brick, 5 floors, 3 sections | facade z 486, x 234–298.5 (back to z 498.5, faces the avenue) | 1 (245.75, 486), 2 (267.25, 486), 3 (288.75, 486) → north |

Layout (the courtyard is open only at the passage, the NW corner driveway and the east side):

- **Passage to the avenue** x 222–234 (centre 228), z 480–500, paved (y 0.25) between the
  substation ТП-1417 (216.5, 492; graffiti «Цой жив» on its west wall) and корп. 3's west gable
  (street-name plate «ул. Берёзовая» and a chalk/heart graffiti on it); its lamp at (236.6, 478.4);
  a lone glove on a post at (223.2, 478.8). Zone `passage_D` (wind 1.2).
- **Internal driveways** (y 0, 5 m): west x 177.5–182.5 from the E–W driveway (z 326.8) south
  to a dead end at z 462 (plough pile with a buried chair at (180.5, 464.6)); north z 355.5–360.5
  from x 180 east into the N–S driveway at x 302. Registered in `registry.driveways` for the
  courtyard car.
- **Parking strips at road level**: north row z 360.4–366.6 (x 188–295, perpendicular, facing
  the driveway; the garbage area stands on its east end), west row x 182.4–188.6 (z 369.4–460.4,
  facing west), a perpendicular pocket on the N–S driveway x 296.3–302, z 396.6–429.4 (the only
  half-buried cars of D: their drifts must not reach a door path). Gaps at every door. Low
  windrows behind them (z 366.9–368.5 and x 188.9–190.5), cut at every door path.
- **Facade sidewalks** (y 0.25): z 352.5–355.4 (корп. 2), x 174.5–177.4 (корп. 1, from z 355.5),
  z 480.4–483.5 (корп. 3, out to the N–S driveway).
- **Playground** (full set, fence with the gate on the south): centre (246, 424), 22 × 16 m —
  rocket slide, double swing (creaks in the wind), climbing dome «паутинка», carousel, sandbox,
  see-saw, benches, tyre swans; lit by one sodium lamp at (239.6, 433.8).
- **Snowman** (life) at (250.5, 438.2) south of the playground.
- **Garbage area** (metal enclosure, 4 containers, a thrown-out New Year tree, crows pecking) at
  (290, 365.6) on the parking strip, open side to the driveway.
- **Carpet rack** with a carpet at (198, 392).
- **Rakushki** (10 shell garages, two tagged with graffiti) along z 491.5, x 179–208, facing the yard.
- **Electrical cabinet** at (233.2, 485.8) on корп. 3's gable.
- **Keys** with an intercom fob on the snow at (242, 479) (life `key`).
- A pull-up bar and a Swedish wall at (212, 427) / (215, 425.4); a bench and a concrete bin where
  the paths cross at the hub (223.4, 463.4); three painted tyre flower beds under the windows left
  of the home porch (x 220–222, z 351.3).
- Story props by the doors: cat with the «Не закрывайте продухи» note at корп. 2 подъезд 1,
  butts at корп. 1 подъезд 2, a bicycle at корп. 3 подъезд 3, the sled at the home door.
- «Пропала собака» flyer with one tab left beside корп. 1 подъезд 3.
- Trees: pollarded poplars behind корп. 2 (z ≈ 332.4), lindens/maples along the south sidewalk
  (z ≈ 476), ~22 birches/lindens/maples/rowans scattered in the yard, a dry-skirted spruce at
  (278, 374), birches in the SW corner.
- Crows: 3 on корп. 2's parapet, 3 on the snow by the bins.
- **Lamps** (pools with dark gaps): passage, playground, NW corner (185.2, 363.4, sodium), east
  (297.8, 369.2), west (191.4, 416.5, failing sodium `cycle`), plus the entrance bulbs (about one
  in five dead).
- **Trodden paths** (y 0.25, nav kind `trodden`): passage → hub (227, 459) → home door; hub →
  playground's east side → корп. 2 подъезд 2; every корп. 1 door → hub / passage / playground;
  корп. 2 подъезды 1 and 4 into the network; the shop line (see below); SW corner → Берёзовая
  (149.8, 475).
- **To the shop**: the trodden line leaves the yard east of the playground and reaches the N–S
  driveway at (301.4, 436.5); a nav crossing continues to (310.5, 438), where blocks_east's desire
  line to «ПРОДУКТЫ» (door 420, 474.5) starts.
- Zones: `courtyard_D` (x 174–302, z 352–485, reverb 'courtyard', wind 0.55), `passage_D`.

## Block F (x 462–600, z 328–500) — «ул. Берёзовая, д. 14»

The same plan as D, shifted 312 m east (`buildCourtyard(ctx, BLOCK_F)`): корп. 2 has 3 sections
(x 500–581), корп. 3 two (x 546–589), and the east side of the yard is open — a ragged row of old
poplars and dry weeds, then snow and fog (the wrap band begins at x 600).

| building | where | entrances |
|---|---|---|
| корп. 2 (north, II-49 9 fl.) | facade z 350, x 500–581 | 1 (566.5, 350), **2 (539.5, 350) enterable** (ordinary stairwell + lift), 3 (512.5, 350) |
| корп. 1 (west, P-44 9 fl., brown tile) | facade x 484, z 364–466 | (484, 377.75 / 403.25 / 428.75 / 454.25) → east |
| корп. 3 (south, II-32 5 fl.) | facade z 486, x 546–589 | (557.75, 486), (579.25, 486) → north |

Variations: the passage (x 534–546) has a **steel bar fence with its gate swung open** into the
yard at z 493 (fence x 531.9–538.2 and 542.2–545.9, the leaf hinged at (542.2, 493) and frozen
open toward the north-west — "an open gate to a courtyard that feels familiar"); the passage
lamp is dead; mercury lamps NW and on the playground (buzzing); brick garbage enclosure with 3
containers at (588, 365.6); playground mirrored with a fly-agaric sandbox (558, 424); a frozen
carrier bag on a playground bench; a kids' sledging hill with a sled at (586, 456); a buried
Moskvich in the yard at (574, 468); the pull-up corner at (562, 456); different notices
(«residents' meeting», «close the door»).
The inner yard around the playground is a **silence zone** (`courtyard_F_still`: wind 0, silence)
— the wind stops there. Trodden paths as in D; the "shop line" here simply runs out at the east
edge (596, 436.5); the SW path leads to the mouth of the eastern N–S driveway at (463, 499.4) with
a nav link onto it.

## Block A (x 150–302, z 144–322)

- **School № 1048** (public `placeSchool`, rot 2: front faces south): site x 171.5–256.5,
  z 153.75–226.25, sports ground behind (north); gate (214, 226.25). Walk along the fence
  z 229.25–231.75 (x 151.5–262) from the «Школа» bus stop on Берёзовая (pole (149.2, 212), a
  discarded ticket at (149, 214.3)), with an old footprint trail.
- **корп. 1** K-7, 5 fl., 4 sections, facade z 252 (x 204–290), entrances (278.25 / 256.75 /
  235.25 / 213.75, 252) facing south. **корп. 2** K-7, 5 fl., 5 sections, facade z 292
  (x 166–273.5), entrances (177.75 / 199.25 / 220.75 / 242.25 / 263.75, 292) facing north.
  Address «ул. Берёзовая, д. 8».
- Small courtyard between them: courtyard driveway z 269.75–274.25 from the N–S driveway west to
  a dead end at x 213 (plough pile with a sled); parking bays at road level z 264.2–270 (x 230–290)
  with a Gazelle van; an old small playground (189, 272.5) facing east; carpet rack (252, 282);
  metal garbage enclosure (293.5, 278.5) with a discarded CRT; notice board with the lost-dog flyer
  (284.5, 285.6); benches at most doors; lilac/snowberry along the facades; old apple trees.
  Lamps (226.5, 268.6), (276, 285.8, failing), one dead at (201.5, 258.5). Zone `courtyard_A`.
- **Rakushki** along the N–S driveway x ≈ 298.6, z 197–247, fronts to the driveway («Спартак» on one).
- South edge: a parking strip at road level along the E–W driveway (z 315.6–322, x 166–278, cars
  nose to the driveway) with a windrow and a row of poplars behind it.
- Trodden paths: школа walk ↔ courtyard round both ends of корп. 1 (the east one between the
  gable and the rakushki, x ≈ 293); courtyard → Берёзовая
  (150.2, 283); courtyard → E–W driveway (288.2, 321.4); short tracks from the bays and the
  courtyard driveway up to the facade sidewalks.

## ул. Берёзовая, the driveways

- **Берёзовая**: cobra lamps on the east sidewalk at x 148.85, z 158, 194, 231, 267, 304, 341,
  377 (dead), 414, 450, 487 (z 267 cycles), heads over the road. Linden / pollarded-poplar row on
  the lawn at x ≈ 153.6. Plough windrows on both kerbs in 14–28 m pieces with openings at the
  crossings (z 236, 325, 412 → the park gates of the north package), the stop and the driveway
  mouth. Signs: «Осторожно, дети» (z 240 and 166), «Жилая зона» (z 330.6), «Остановка запрещена»
  (z 470). Electrical cabinet (152.4, 316.5). Steaming manhole (144, 286). Nav: sidewalk line
  x 150.2 from z 144.5 to the avenue's sidewalk line (513.2); crossings at z 236, 325, 412 to x 138.
- **N–S driveway x 302–308**: courtyard lamps on the west side at x 299.7, z 162, 192, 252, 292,
  334 (dead), 386 (dying), 431, 470 (mercury at 252 and 431). Windrow on its west edge with gaps
  at every mouth/path. Plough pile with a tyre at (298.6, 149). Nav kind `driveway` x 305 from
  z 144.5 to 513.2.
- **E–W driveway z 322–328** (x 148–308): three courtyard lamps on the south side (x 186, 232,
  272 at z 330.2, heads north; 232 is mercury). Windrows both sides (none in front of Block A's
  parking strip). Nav along z 325 from Берёзовая to x 310.5 (blocks_east continues).
- `registry.driveways`: 'west N–S driveway', '3-й Молодёжный проезд (west part)', 'D courtyard',
  'F courtyard'.

## Registry, tags, nav, zones

- `registry.home` (above), `registry.blocksWest = { A, D, F }` (buildings, entrances, playground
  records), `registry.blocks` (+ A, D, F rects), `registry.landmarks` (+ home building),
  `registry.streets` (+ ул. Берёзовая), `registry.driveways` (4 polylines).
- Everything else is registered by the helpers we call: `entrances`, `buildings`, `stairwells`
  (residential), `streetLamps`, `benches`, `playgrounds`, `garages`, `stops` (street), `trees`,
  `crows` (nature), `parkedCars` (vehicles), `story` (life), `notices` (phone), `schools`,
  `substations` (public).
- navPaths kinds pushed: `sidewalk`, `driveway`, `trodden`, `crossing` (plus the residential
  `entrance` stubs). Every entrance of D and F has a trodden path or crossing reaching its stub.
- Zones: `courtyard_A`, `courtyard_D`, `courtyard_F`, `courtyard_F_still` (silence), `passage_D`,
  `passage_F` — all reverb 'courtyard'.
- Old footprint trails (init): the hero path into D, the «Школа» stop → school gate.

## Budget (measured in-world)

About 55 outdoor lights in the region (street lamps ~32, entrance bulbs ~21, the stop light) plus
~27 indoor (the two enterable stairwells); ~160 trees; ~100 parked cars.

## Walkability notes (for the integrator)

- The player steps at most 0.3 m: lawn (0.5) is reached from roads/driveways (0) only via the
  0.25 sidewalks, paths and parking-strip tracks. Every courtyard is reachable from its driveway
  sidewalk and from the avenue passages; every door has a path or sidewalk at 0.25 in front.
- Windrows are cut at crossings, mouths and door paths; plough piles stand only at dead ends.
